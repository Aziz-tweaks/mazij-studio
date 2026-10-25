#!/usr/bin/env node
// **تباعدُ الأسطر — ٢٥ أكتوبر ٢٠٢٦.**
//
// كان `1.15` رقمًا مكتوبًا في خمسة مواضع (المعاينة مرّتين، والتصدير مرّتين، والتحويل إلى
// مخطّط)، ونصوصُ المقطع المرجعيّ سطرانِ بينهما نحو ١٫٥ من المقاس — فلا تُنسخ إلّا بنصّين.
// فصار حقلًا (`TextElement.lineHeight`)، والسطرُ الأوّل يهبط نصفَ الزيادة كما يضعه المتصفّح.
//
//   ١. الغيابُ = 1.15 بالبكسل: لا يتغيّر مستندٌ قائم.
//   ٢. التصدير: المسافةُ بين السطرين = المضاعِف × المقاس، والأوّلُ يهبط نصفَ الزيادة.
//   ٣. المعاينة: صناديقُ السطور كما رسمها المتصفّح تقول الرقمين نفسيهما.
//   ٤. والكشفُ كلمةً كلمة يتبع التباعد نفسه.
//   ٥. من الواجهة: الحقل، والإلزام، والرجوع للافتراضيّ يحذف الحقل، والتراجع.
import { chromium } from 'playwright';
import { bootBlank, resumeAfterReload, AUTOSAVE_KEY } from './helpers/boot.mjs';

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:1420';
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
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

const SIZE = 100;
const anim = () => ({ preset: 'none', start: 0, duration: 2, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} });
function textEl(id, lineHeight, stagger = false) {
  return {
    id, type: 'text', visible: true, locked: false, opacity: 100, maskId: null,
    // صندوقٌ ضيّق يلفّ الكلمتين سطرين — الأسطرُ في مزيج من اللفّ لا من سطرٍ جديد في النصّ.
    geo: { x: 0.4, y: 0.2, w: 0.2, h: 0.4, rotation: 0 }, anim: anim(),
    text: 'سطر سطر', fontFamily: 'Vazirmatn', fontSize: SIZE, weight: 'bold', color: '#000000', halign: 'center', valign: 'top',
    textAnim: { enabled: stagger, unit: 'word', direction: 'start', stagger: 0.05, unitDuration: 0.2, effect: 'fade', easing: 'easeOut', bezier: [0.16, 1, 0.3, 1] }, pathId: null,
    ...(lineHeight === undefined ? {} : { lineHeight }),
  };
}

/** صفوفُ الحبر في التصدير: بدايةُ كلّ كتلةٍ متّصلة من الصفوف ذات الحبر (سطرٌ = كتلة). */
async function inkRuns(page, el, time = 1) {
  return page.evaluate(async ({ el, time }) => {
    const ex = await import('/src/lib/exportArtboard.ts');
    const blob = await ex.renderArtboardPng({ size: { id: 'p', ar: '', en: '', w: 1080, h: 1920, kind: 'timed' }, palette: { bg: '#ffffff', fg: '#000000', ac: '#ffb703' }, elements: [el], transparent: false, lang: 'ar', scale: 1, decorAccent: false, time });
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
    const rows = [];
    for (let y = 0; y < bmp.height; y++) {
      let ink = false;
      for (let x = 0; x < bmp.width; x += 2) {
        if (d[(y * bmp.width + x) * 4] < 128) { ink = true; break; }
      }
      rows.push(ink);
    }
    const runs = [];
    for (let y = 0; y < rows.length; y++) if (rows[y] && !rows[y - 1]) runs.push(y);
    let h = 0;
    for (let i = 0; i < d.length; i += 16) h = (h * 31 + d[i]) >>> 0;
    return { runs, hash: h };
  }, { el, time });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootBlank(page, BASE_URL, 'ig-reel');
  await page.evaluate(() => document.fonts.ready);

  // ═════════════ ١. الغيابُ = الافتراضيّ ═════════════
  const none = await inkRuns(page, textEl('a', undefined));
  const dflt = await inkRuns(page, textEl('a', 1.15));
  assert(none.hash === dflt.hash, `نصٌّ بلا الحقل يُرسَم بالبكسل كما يُرسَم بـ1.15 صراحةً (${none.hash} = ${dflt.hash})`);

  // ═════════════ ٢. التصدير ═════════════
  const wide = await inkRuns(page, textEl('a', 1.6));
  const gapD = dflt.runs[1] - dflt.runs[0];
  const gapW = wide.runs[1] - wide.runs[0];
  assert(Math.abs(gapD - 1.15 * SIZE) <= 1, `بالافتراضيّ: بين بدايتَي السطرين ${gapD} بكسل = 1.15 × ${SIZE}`);
  assert(Math.abs(gapW - 1.6 * SIZE) <= 1, `وبـ1.6: ${gapW} بكسل = 1.6 × ${SIZE}`);
  const shiftW = wide.runs[0] - dflt.runs[0];
  assert(Math.abs(shiftW - ((1.6 - 1.15) / 2) * SIZE) <= 1, `والسطرُ الأوّل يهبط نصفَ الزيادة: ${shiftW} بكسل = (1.6 − 1.15) ÷ 2 × ${SIZE}`);

  // ═════════════ ٣. المعاينة ═════════════
  {
    const ab0 = await page.locator('[data-testid="artboard"]').boundingBox();
    await page.locator('[data-tool="shape"]').click();
    await page.waitForTimeout(250);
    await page.mouse.move(ab0.x + ab0.width * 0.3, ab0.y + ab0.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(ab0.x + ab0.width * 0.5, ab0.y + ab0.height * 0.5, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(1300);
  }
  await page.evaluate(({ key, els }) => {
    const raw = JSON.parse(window.localStorage.getItem(key));
    raw.artboards[0].doc.elements = els;
    window.localStorage.setItem(key, JSON.stringify(raw));
  }, { key: AUTOSAVE_KEY, els: [textEl('t1', undefined), { ...textEl('t2', 1.6), geo: { x: 0.4, y: 0.6, w: 0.2, h: 0.35, rotation: 0 } }] });
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const dom = await page.evaluate(() => {
    const ab = document.querySelector('[data-testid="artboard"]');
    const scale = ab.getBoundingClientRect().width / 1080;
    const lines = (id) => {
      const node = document.querySelector(`[data-el-id="${id}"]`);
      const box = node.getBoundingClientRect();
      const r = document.createRange();
      r.selectNodeContents(node);
      const tops = [...new Set([...r.getClientRects()].map((q) => Math.round(((q.top - box.top) / scale) * 10) / 10))].sort((a, b) => a - b);
      return { tops, lh: getComputedStyle(node).lineHeight };
    };
    return { a: lines('t1'), b: lines('t2') };
  });
  assert(dom.a.tops.length >= 2 && dom.b.tops.length >= 2, `المتصفّح رسم سطرين في كلٍّ منهما (${JSON.stringify(dom.a.tops)} / ${JSON.stringify(dom.b.tops)})`);
  const domGapA = dom.a.tops[1] - dom.a.tops[0];
  const domGapB = dom.b.tops[1] - dom.b.tops[0];
  assert(Math.abs(domGapA - 115) <= 1 && Math.abs(domGapB - 160) <= 1, `صناديقُ السطور في المعاينة: ${domGapA} ثم ${domGapB} بكسل مستند — 1.15 و1.6 من المقاس`);
  const domShift = dom.b.tops[0] - dom.a.tops[0];
  assert(Math.abs(domShift - shiftW) <= 1, `والسطرُ الأوّل يهبط في المعاينة ${domShift} بكسل كما في التصدير (${shiftW})`);

  // ═════════════ ٤. الكشفُ كلمةً كلمة ═════════════
  const stag = await inkRuns(page, textEl('s', 1.6, true), 1.5);
  assert(stag.runs.length >= 2 && Math.abs(stag.runs[1] - stag.runs[0] - 160) <= 1 && Math.abs(stag.runs[0] - wide.runs[0]) <= 1, `والنصُّ المكشوف كلمةً كلمة يتبع التباعد نفسه (${stag.runs.slice(0, 2)} ≈ ${wide.runs.slice(0, 2)})`);

  // ═════════════ ٥. من الواجهة ═════════════
  await page.locator('[data-testid="layer-name-t1"]').click();
  await page.waitForTimeout(200);
  const field = page.locator('[data-testid="text-line-height-t1"]');
  assert((await field.count()) === 1 && (await field.inputValue()) === '1.15', `حقلُ «تباعد الأسطر» يعرض الافتراضيّ 1.15 (${await field.inputValue()})`);
  await field.fill('1.5');
  await field.press('Enter');
  await page.waitForTimeout(900);
  const read = () => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).artboards[0].doc.elements.find((e) => e.id === 't1'), AUTOSAVE_KEY);
  let t1 = await read();
  assert(t1.lineHeight === 1.5, `«1.5» ثم Enter يكتب ‎lineHeight = 1.5‎ (${t1.lineHeight})`);
  const lh = await page.locator('[data-el-id="t1"]').evaluate((n) => getComputedStyle(n).lineHeight);
  // المقاسُ في المعاينة بوحدة `cqw` فيُحسب ‎149.996px‎ لا ‎150px‎ بالحرف — الفرقُ تقريبُ الوحدة.
  assert(Math.abs(parseFloat(lh) - 150) < 0.05, `والمعاينة تأخذه فورًا (${lh} ≈ 150px)`);
  await field.fill('1.15');
  await field.press('Enter');
  await page.waitForTimeout(900);
  t1 = await read();
  assert(!('lineHeight' in t1), 'والرجوعُ إلى 1.15 يحذف الحقل — المستندُ كما كان');
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="layer-name-t1"]').click();
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(900);
  t1 = await read();
  assert(t1.lineHeight === 1.5, `وتراجعٌ واحدٌ يُرجع 1.5 (${t1.lineHeight})`);

  const realErrors = pageErrors.filter((e) => !/favicon|ResizeObserver loop/i.test(e));
  assert(realErrors.length === 0, realErrors.length ? `بلا أخطاء تشغيل (${realErrors.length}): ${realErrors.slice(0, 3).join(' | ')}` : 'بلا أخطاء تشغيل');
  await browser.close();
  console.log(`\n${'='.repeat(62)}`);
  console.log(`${pass} passed, ${fail} failed.`);
  if (failures.length) {
    console.log('\nfailures:');
    failures.forEach((x, i) => console.log(`  ${i + 1}. ${x}`));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
