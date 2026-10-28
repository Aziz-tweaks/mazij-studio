#!/usr/bin/env node
// **الفلاتر والمؤثّرات والانتقالات — ٢٨ أكتوبر ٢٠٢٦.**
//
// زرُّ «تأثيرات» في شريط الإضافة كان «قريبًا». فصار لوحًا بثلاثة أقسام، وكلُّ بطاقةٍ تضع
// **طبقةَ مؤثّر** عند المؤشّر بضغطةٍ واحدة. والطبقةُ تُغيّر ما تحتها فقط، في مقطعها فقط،
// بقوّةٍ يتحكّم بها شريط، ويُطابِق التصديرُ المعاينة.
//
// كلُّ خطوةٍ هنا بأحداث مؤشّرٍ ولوحة مفاتيح حقيقيّة، وكلُّ حكمٍ على اللون بكسلٌ مقروء:
// من لقطةٍ للوح (المعاينة)، ومن `renderArtboardPng` (مسارُ PNG/MP4 نفسه).
import { chromium, webkit } from 'playwright';
import { bootBlank, resumeAfterReload, AUTOSAVE_KEY } from './helpers/boot.mjs';

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:1420';
const SHOTS = process.env.QA_SHOTS || '';
let pass = 0;
let fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ✓', msg);
  } else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}

const persisted = (page) => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)), AUTOSAVE_KEY);
async function doc(page) {
  await page.waitForTimeout(900);
  return (await persisted(page)).artboards[0].doc;
}
const historyLen = (page) => page.locator('[data-testid="undo-btn"]').evaluate((e) => Number(e.dataset.historyPast));
const rulerSpan = (page) => page.locator('[data-testid="timeline-ruler"]').evaluate((e) => Number(e.dataset.span));

async function parkPlayhead(page, seconds) {
  const span = await rulerSpan(page);
  const box = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(box.x + (box.width * seconds) / span + 1, box.y + box.height / 2);
  await page.waitForTimeout(160);
  return page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
}

async function drawRect(page, fx0, fy0, fx1, fy1) {
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(340);
  await page.mouse.move(ab.x + ab.width * fx0, ab.y + ab.height * fy0);
  await page.mouse.down();
  await page.mouse.move(ab.x + ab.width * fx1, ab.y + ab.height * fy1, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

const DECODE = `
async function decodeAt(b64, pts) {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  return pts.map(([fx, fy]) => {
    const d = g.getImageData(Math.min(c.width - 1, Math.floor(fx * c.width)), Math.min(c.height - 1, Math.floor(fy * c.height)), 1, 1).data;
    return [d[0], d[1], d[2]];
  });
}`;

/** بكسلاتُ المعاينة عند كسورٍ من اللوح — لقطةٌ حقيقيّة. */
async function previewAt(page, pts, shot) {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(120);
  const buf = await page.locator('[data-testid="artboard"]').screenshot(shot && SHOTS ? { path: `${SHOTS}/${shot}.png` } : {});
  return page.evaluate(async ({ b64, pts, src }) => new Function(`${src}; return decodeAt;`)()(b64, pts), { b64: buf.toString('base64'), pts, src: DECODE });
}

/** بكسلاتُ التصدير — مسارُ PNG/MP4 نفسُه، على المستند المحفوظ، عند زمنٍ صريح. */
async function exportAt(page, time, pts) {
  await page.waitForTimeout(900);
  return page.evaluate(
    async ({ key, time, pts, src }) => {
      const raw = JSON.parse(window.localStorage.getItem(key));
      const ab = raw.artboards[0];
      const d = ab.doc;
      const C = await import('/src/data/constants.ts');
      const mod = await import('/src/lib/exportArtboard.ts');
      const size = C.sizeAt(d.sizeIdx, d.customW, d.customH);
      const blob = await mod.renderArtboardPng({
        size, palette: C.PALETTES[ab.paletteIdx ?? 0], elements: d.elements, transparent: false, lang: 'ar', time, scale: 0.5, decorAccent: !!d.decorAccent,
      });
      const b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
      return new Function(`${src}; return decodeAt;`)()(b64, pts);
    },
    { key: AUTOSAVE_KEY, time, pts, src: DECODE },
  );
}

const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const isGray = (p, tol = 6) => Math.abs(p[0] - p[1]) <= tol && Math.abs(p[1] - p[2]) <= tol;
const fmt = (p) => `rgb(${p.join(',')})`;

async function main() {
  // `QA_BROWSER=webkit`: محرّكُ البرنامج المثبّت (WKWebView) — حيث لا يُضمَن `ctx.filter`.
  const browser = await (process.env.QA_BROWSER === 'webkit' ? webkit : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootBlank(page, BASE_URL, 'ig-reel');

  // مستطيلٌ في النصف العلويّ، يُلوَّن من لوح المظهر بلونٍ صريح عبر حقل السداسيّ إن وُجد؛
  // وإلّا يبقى بلون اللوحة المميّز — المهمّ أنه **ملوَّن**.
  await drawRect(page, 0.2, 0.15, 0.8, 0.4);
  const P_RECT = [0.5, 0.27];
  const P_BG = [0.5, 0.85];
  const before = await previewAt(page, [P_RECT, P_BG], 'fx-00-before');
  assert(!isGray(before[0], 20), `المستطيلُ ملوَّنٌ قبل أيّ مؤثّر (${fmt(before[0])})`);

  // ═══════════════ ١. اللوح ═══════════════
  await page.locator('[data-tool="fx"]').click();
  await page.waitForTimeout(200);
  assert((await page.locator('[data-testid="fx-library"]').count()) === 1 && (await page.locator('[data-testid="library-soon-fx"]').count()) === 0, 'زرُّ «تأثيرات» يفتح لوحًا حقيقيًّا — لا «قريبًا»');
  const cards = await page.locator('[data-testid^="fx-card-"]').count();
  assert(cards >= 20, `في اللوح ${cards} بطاقة بين فلاترَ ومؤثّراتٍ وانتقالات`);

  // ═══════════════ ٢. ضغطةٌ واحدة: «أبيض وأسود» عند المؤشّر ═══════════════
  await parkPlayhead(page, 0.5);
  const h0 = await historyLen(page);
  await page.locator('[data-testid="fx-card-bw"]').click();
  await page.waitForTimeout(250);
  const d1 = await doc(page);
  const bw = d1.elements.find((e) => e.type === 'fx');
  assert(!!bw && bw.fx === 'bw' && Math.abs(bw.anim.start - 0.5) < 0.04 && Math.abs(bw.anim.duration - 3) < 1e-6 && bw.anim.bounded === true, `طبقةُ مؤثّرٍ عند المؤشّر، طولُها ٣ث، محدودةٌ بمقطعها (${bw && JSON.stringify({ start: bw.anim.start, d: bw.anim.duration, b: bw.anim.bounded })})`);
  assert(d1.elements[d1.elements.length - 1].id === bw.id, 'تُوضَع فوق كلّ الطبقات');
  assert((await historyLen(page)) === h0 + 1, 'الإضافةُ خطوةُ تراجعٍ واحدة');
  assert((await page.locator(`[data-testid="fx-props-${bw.id}"]`).count()) === 1, 'تُحدَّد فورًا وتظهر خصائصُها في لوح التصميم');

  await parkPlayhead(page, 1.5);
  const inBw = await previewAt(page, [P_RECT, P_BG], 'fx-01-bw');
  assert(isGray(inBw[0]), `المعاينة: المستطيلُ رماديٌّ داخل المقطع (${fmt(inBw[0])})`);
  const exBw = await exportAt(page, 1.5, [P_RECT, P_BG]);
  assert(dist(inBw[0], exBw[0]) <= 8 && dist(inBw[1], exBw[1]) <= 8, `التصديرُ يطابق المعاينة (معاينة ${fmt(inBw[0])} / تصدير ${fmt(exBw[0])})`);

  // ═══════════════ ٣. خارج المقطع لا أثر ═══════════════
  await parkPlayhead(page, 4.2);
  const outBw = await previewAt(page, [P_RECT], 'fx-02-outside');
  assert(dist(outBw[0], before[0]) <= 4, `بعد نهاية المقطع يعود اللونُ كما كان (${fmt(outBw[0])})`);
  const exOut = await exportAt(page, 4.2, [P_RECT]);
  assert(dist(exOut[0], before[0]) <= 8, `والتصديرُ كذلك (${fmt(exOut[0])})`);

  // ═══════════════ ٤. القوّة ═══════════════
  await parkPlayhead(page, 1.5);
  const slider = page.locator(`[data-testid="fx-amount-${bw.id}"]`);
  const sb = await slider.boundingBox();
  const h1 = await historyLen(page);
  await page.mouse.move(sb.x + sb.width - 3, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width * 0.75, sb.y + sb.height / 2, { steps: 5 });
  await page.mouse.move(sb.x + sb.width * 0.5, sb.y + sb.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const d2 = await doc(page);
  const bw2 = d2.elements.find((e) => e.id === bw.id);
  assert(bw2.amount > 0.4 && bw2.amount < 0.6, `السحبُ يضبط القوّة (${bw2.amount})`);
  assert((await historyLen(page)) === h1 + 1, 'السحبةُ كلُّها خطوةُ تراجعٍ واحدة');
  const half = await previewAt(page, [P_RECT], 'fx-03-half');
  assert(!isGray(half[0], 6) && dist(half[0], before[0]) > 10, `نصفُ القوّة: لونٌ بين الأصل والرماديّ (${fmt(half[0])})`);
  const exHalf = await exportAt(page, 1.5, [P_RECT]);
  assert(dist(half[0], exHalf[0]) <= 8, `التصديرُ يطابق عند نصف القوّة (${fmt(exHalf[0])})`);

  // ═══════════════ ٥. ما فوق الطبقة لا يتأثّر ═══════════════
  await drawRect(page, 0.2, 0.55, 0.8, 0.7);
  const P_TOP = [0.5, 0.62];
  const topPx = await previewAt(page, [P_TOP, P_RECT], 'fx-04-above');
  assert(!isGray(topPx[0], 20), `شكلٌ رُسِم فوق طبقة المؤثّر يبقى ملوَّنًا (${fmt(topPx[0])})`);
  const exTop = await exportAt(page, 1.5, [P_TOP]);
  assert(dist(topPx[0], exTop[0]) <= 8, `والتصديرُ يتّفق (${fmt(exTop[0])})`);

  // ═══════════════ ٦. تبديلُ النوع: «تعتيم الأطراف» ═══════════════
  await page.locator('[data-tool="fx"]').click();
  await page.waitForTimeout(150);
  // يُعاد تحديدُ طبقة المؤثّر من صفّها في قائمة الطبقات — باسمها «أبيض وأسود».
  await page.locator(`[data-testid="layer-name-${bw.id}"]`).click();
  await page.waitForTimeout(250);
  await page.locator(`[data-testid="fx-kind-${bw.id}"]`).selectOption('vignette');
  await page.waitForTimeout(250);
  const d3 = await doc(page);
  assert(d3.elements.find((e) => e.id === bw.id).fx === 'vignette', 'النوعُ يتبدّل من القائمة بلا حذفٍ وإعادة');
  const P_CORNER = [0.04, 0.97];
  const vig = await previewAt(page, [P_CORNER, P_BG], 'fx-05-vignette');
  const exVig = await exportAt(page, 1.5, [P_CORNER, P_BG]);
  assert(dist(vig[0], exVig[0]) <= 10, `تعتيمُ الأطراف: زاويةُ المعاينة ${fmt(vig[0])} / التصدير ${fmt(exVig[0])}`);

  // ═══════════════ ٧. انتقال: «وميض أبيض» موسَّطٌ على القطع ═══════════════
  await parkPlayhead(page, 2.5);
  await page.locator('[data-tool="fx"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-testid="fx-card-tr_flash"]').click();
  await page.waitForTimeout(250);
  const d4 = await doc(page);
  const fl = d4.elements.find((e) => e.type === 'fx' && e.fx === 'tr_flash');
  assert(!!fl && Math.abs(fl.anim.start + fl.anim.duration / 2 - 2.5) < 0.05, `الانتقالُ موسَّطٌ على المؤشّر (${fl && fl.anim.start}+${fl && fl.anim.duration})`);
  const peak = await previewAt(page, [P_BG, P_RECT], 'fx-06-flash-peak');
  assert(peak[0].every((c) => c >= 235), `عند القمّة: اللوحُ يكاد يبيضّ (${fmt(peak[0])})`);
  const exPeak = await exportAt(page, 2.5, [P_BG]);
  assert(dist(peak[0], exPeak[0]) <= 8, `والتصديرُ يتّفق عند القمّة (${fmt(exPeak[0])})`);
  const edge = await exportAt(page, fl.anim.start + 0.02, [P_BG]);
  assert(dist(edge[0], before[1]) <= 30, `وعند حافّة المقطع يكاد لا يُرى (${fmt(edge[0])})`);

  // ═══════════════ ٨. ضبابيّة: معاينة وتصدير ═══════════════
  await parkPlayhead(page, 1.0);
  await page.locator('[data-testid="fx-card-blur"]').click();
  await page.waitForTimeout(250);
  const P_EDGE = [0.5, 0.15];
  const bl = await previewAt(page, [P_EDGE], 'fx-07-blur');
  const exBl = await exportAt(page, 1.5, [P_EDGE]);
  assert(dist(bl[0], exBl[0]) <= 14, `الضبابيّةُ على حافّة المستطيل: معاينة ${fmt(bl[0])} / تصدير ${fmt(exBl[0])}`);

  // ═══════════════ ٩. الحفظ ═══════════════
  await page.waitForTimeout(900);
  await page.reload({ waitUntil: "networkidle" });
  await resumeAfterReload(page);
  const d5 = await doc(page);
  assert(d5.elements.filter((e) => e.type === 'fx').length === 3, 'طبقاتُ المؤثّرات تبقى بعد إعادة التحميل');
  assert((await persisted(page)).schemaVersion === 6, 'نسخةُ المخطّط ٦');

  assert(pageErrors.length === 0, `لا أخطاءَ في الصفحة (${pageErrors.join(' | ')})`);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    for (const f of failures) console.error(' -', f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
