#!/usr/bin/env node
// **رسمُ الخطّ تدريجيًّا: «بداية الخط» و«نهاية الخط» — ٢٥ أكتوبر ٢٠٢٦.**
//
// مقطعٌ طُلب نسخُه يرسم سيفًا خطًّا خطًّا، ودائرةً حمراء حول سيفٍ في صورة. وهذا «Trim
// Paths» في After Effects: كسرانِ متحرّكان من **طول** الحدّ والمرسومُ ما بينهما.
// والقصُّ هندسيٌّ (`src/lib/pathTrim.ts`): مسارٌ حقيقيٌّ يُقَصّ عند المعامل المقابل للطول،
// لا تقطيعُ حدٍّ يختلف قياسُه بين المحرّكات.
//
//   ١. الدالّة: نصفُ الطول نصفُه بالضبط، والطرفان على المنحنى نفسه، والحالةُ المحايدة لا
//      تلمس شيئًا، وكلُّ جزءٍ من مسارٍ ذي أجزاء يُقَصّ معًا.
//   ٢. القُماش: مسارٌ على شكل «ل» يُرسَم ضلعُه الأوّل قبل الثاني.
//   ٣. البيضة: تبدأ من أقصى اليمين وتدور مع عقارب الساعة كما يبدأ رسمُها.
//   ٤. الحدُّ متغيّر السُّمك: المَلمح مفتاحُه طولُ المسار كاملًا لا طولُ المقطوع.
//   ٥. المعاينة: مسارُ الحدّ المقصوص حاضرٌ متى قُصّ وغائبٌ متى لم يُقَصّ.
//   ٦. من الواجهة: صفّا «بداية الخط» و«نهاية الخط» تحت مقطع الشكل لا تحت النصّ، ومفتاحان
//      يرسمان الخطّ من لا شيء إلى كامله.
import { chromium } from 'playwright';
import { bootBlank, AUTOSAVE_KEY } from './helpers/boot.mjs';

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:1420';
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
const isMac = process.platform === 'darwin';
const MOD = isMac ? 'Meta' : 'Control';
const isInk = (p) => p[0] < 80 && p[1] < 80 && p[2] < 80;
const isPaper = (p) => p[0] > 200 && p[1] > 200 && p[2] > 200;

const kf = (id, time, value) => ({ id, time, value, easing: 'linear', bezier: [0, 0, 1, 1] });
const anim = (tracks) => ({ preset: 'none', start: 0, duration: 2, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks });
const strokeLayer = (width, profile) => ({ id: 's', visible: true, opacity: 1, width, position: 'center', color: '#000000', colorToken: null, ...(profile ? { widthProfile: profile } : {}) });
function shape(id, geo, extra, strokes, tracks) {
  return {
    id, type: 'shape', visible: true, locked: false, opacity: 100, maskId: null, geo, fill: null, fillToken: 'ac', stroke: '#000000', strokeWidth: 0, radius: 0,
    appearance: { fills: [], strokes, shadows: [] }, anim: anim(tracks), ...extra,
  };
}

async function renderAt(page, elements, time, probes) {
  return page.evaluate(
    async ({ elements, time, probes }) => {
      const ex = await import('/src/lib/exportArtboard.ts');
      const blob = await ex.renderArtboardPng({
        size: { id: 'p', ar: '', en: '', w: 1000, h: 1000, kind: 'timed' },
        palette: { bg: '#ffffff', fg: '#111111', ac: '#ffb703' },
        elements, transparent: false, lang: 'ar', scale: 1, decorAccent: false, time,
      });
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      const out = probes.map(([x, y]) => [...g.getImageData(Math.round(x * 1000), Math.round(y * 1000), 1, 1).data].slice(0, 3));
      // عدُّ بكسلات الحبر في أعمدةٍ مُسمّاة — سُمكُ الخطّ رأسيًّا.
      const thick = (x) => {
        const col = g.getImageData(Math.round(x * 1000), 0, 1, 1000).data;
        let n = 0;
        for (let i = 0; i < col.length; i += 4) if (col[i] < 128) n++;
        return n;
      };
      return { px: out, thick: [0.3, 0.45, 0.5, 0.6].map(thick) };
    },
    { elements, time, probes },
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootBlank(page, BASE_URL, 'ig-reel');

  // ═════════════════════════ ١. الدالّة ═════════════════════════
  const pure = await page.evaluate(async () => {
    const t = await import('/src/lib/pathTrim.ts');
    const len = (cmds, bw, bh) => {
      // طولٌ مرجعيّ بعيّناتٍ كثيفة مستقلّة عن جدول الدالّة (٤٠٠ لكلّ منحنى).
      let L = 0;
      let last = null;
      let start = null;
      for (const c of cmds) {
        if (c.c === 'M') { last = { x: c.x, y: c.y }; start = last; }
        else if (c.c === 'L') { L += Math.hypot((c.x - last.x) * bw, (c.y - last.y) * bh); last = { x: c.x, y: c.y }; }
        else if (c.c === 'C') {
          let prev = last;
          for (let i = 1; i <= 400; i++) {
            const u = i / 400; const m = 1 - u;
            const p = { x: m * m * m * last.x + 3 * m * m * u * c.x1 + 3 * m * u * u * c.x2 + u * u * u * c.x, y: m * m * m * last.y + 3 * m * m * u * c.y1 + 3 * m * u * u * c.y2 + u * u * u * c.y };
            L += Math.hypot((p.x - prev.x) * bw, (p.y - prev.y) * bh);
            prev = p;
          }
          last = { x: c.x, y: c.y };
        } else if (c.c === 'Z' && start) { L += Math.hypot((start.x - last.x) * bw, (start.y - last.y) * bh); last = start; }
      }
      return L;
    };
    const curve = [{ c: 'M', x: 0, y: 0 }, { c: 'C', x1: 0.1, y1: 0.9, x2: 0.9, y2: -0.4, x: 1, y: 1 }];
    const full = len(curve, 800, 200);
    const half = t.trimPathCmds(curve, 0, 0.5, 800, 200);
    const mid = t.trimPathCmds(curve, 0.25, 0.75, 800, 200);
    const same = t.trimPathCmds(curve, 0, 1, 800, 200) === curve;
    const empty = t.trimPathCmds(curve, 0.6, 0.6, 800, 200).length;
    // طرفُ النصف على المنحنى: أقربُ عيّنةٍ كثيفةٍ من المنحنى الأصل.
    const end = half[half.length - 1];
    let best = Infinity;
    for (let i = 0; i <= 2000; i++) {
      const u = i / 2000; const m = 1 - u;
      const p = { x: 3 * m * m * u * 0.1 + 3 * m * u * u * 0.9 + u * u * u, y: 3 * m * m * u * 0.9 + 3 * m * u * u * -0.4 + u * u * u };
      best = Math.min(best, Math.hypot((p.x - end.x) * 800, (p.y - end.y) * 200));
    }
    const two = [{ c: 'M', x: 0, y: 0 }, { c: 'L', x: 1, y: 0 }, { c: 'M', x: 0, y: 1 }, { c: 'L', x: 0.5, y: 1 }];
    const twoT = t.trimPathCmds(two, 0, 0.5, 100, 100);
    const box = [{ c: 'M', x: 0, y: 0 }, { c: 'L', x: 1, y: 0 }, { c: 'L', x: 1, y: 1 }, { c: 'L', x: 0, y: 1 }, { c: 'Z' }];
    const boxQ = t.trimPathCmds(box, 0, 0.875, 100, 100);
    return { ratio: len(half, 800, 200) / full, midRatio: len(mid, 800, 200) / full, endDist: best, same, empty, twoT, boxQ };
  });
  assert(Math.abs(pure.ratio - 0.5) < 0.005, `نصفُ الطول نصفُه بالقياس المستقلّ على منحنًى غير منتظم في صندوقٍ ٨٠٠×٢٠٠ (${(pure.ratio * 100).toFixed(2)}٪)`);
  assert(Math.abs(pure.midRatio - 0.5) < 0.005, `والوسطُ من الربع إلى ثلاثة الأرباع نصفُه كذلك (${(pure.midRatio * 100).toFixed(2)}٪)`);
  assert(pure.endDist < 0.05, `وطرفُ المقطوع على المنحنى الأصل نفسه (أبعدُ ${pure.endDist.toFixed(4)} بكسل)`);
  assert(pure.same && pure.empty === 0, 'والحالةُ المحايدة (٠..١) تُعيد الأوامرَ نفسها بلا لمس، والبدايةُ عند النهاية لا ترسم شيئًا');
  const twoEnds = pure.twoT.filter((c) => c.c === 'L').map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`);
  assert(twoEnds.join(' ') === '0.50,0.00 0.25,1.00', `ومسارٌ من جزأين يُقَصّ كلُّ جزءٍ بالكسرين معًا (${twoEnds.join(' ')})`);
  const qEnd = pure.boxQ[pure.boxQ.length - 1];
  assert(!pure.boxQ.some((c) => c.c === 'Z') && Math.abs(qEnd.x) < 1e-9 && Math.abs(qEnd.y - 0.5) < 1e-9, `والإغلاقُ ضلعٌ يُرسَم كغيره: سبعةُ أثمان المربّع تنتهي في منتصف ضلعه الأخير بلا إغلاق (${qEnd.x.toFixed(2)}, ${qEnd.y.toFixed(2)})`);

  // ═════════════════════ ٢. القُماش: «ل» يُرسَم ضلعُه الأوّل أوّلًا ═════════════════════
  // ضلعٌ أفقيٌّ من (٠٫١،٠٫٥) إلى (٠٫٩،٠٫٥) ثم رأسيٌّ إلى (٠٫٩،٠٫٩) — طولاهما ٨٠٠ و٤٠٠.
  const L = shape('L', { x: 0.1, y: 0.5, w: 0.8, h: 0.4, rotation: 0 }, { shape: 'path', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closed: false }, [strokeLayer(16)], { trimEnd: [kf('a', 0, 0), kf('b', 1, 1)] });
  const p = [[0.3, 0.5], [0.7, 0.5], [0.9, 0.8]];
  const r0 = await renderAt(page, [L], 0, p);
  const rHalf = await renderAt(page, [L], 0.5, p);
  const r1 = await renderAt(page, [L], 1, p);
  assert(r0.px.every(isPaper), `عند ٠: لا شيءَ مرسوم (${JSON.stringify(r0.px)})`);
  assert(isInk(rHalf.px[0]) && isInk(rHalf.px[1]) === false && isPaper(rHalf.px[2]), `عند النصف (٦٠٠ من ١٢٠٠ بكسل): ثلاثةُ أرباع الضلع الأوّل وحدها (${JSON.stringify(rHalf.px)})`);
  assert(r1.px.every(isInk), `عند ١: الخطُّ كاملًا (${JSON.stringify(r1.px)})`);

  // ═════════════════════ ٣. البيضة تبدأ من أقصى اليمين ═════════════════════
  const E = shape('E', { x: 0.2, y: 0.2, w: 0.6, h: 0.6, rotation: 0 }, { shape: 'ellipse' }, [strokeLayer(16)], { trimEnd: [kf('a', 0, 0.25), kf('b', 1, 0.25)] });
  // الربعُ الأوّل من أقصى اليمين (٠٫٨،٠٫٥) نزولًا إلى الأسفل (٠٫٥،٠٫٨) — عقاربُ الساعة على الشاشة.
  const eq = await renderAt(page, [E], 0, [[0.5 + 0.3 * Math.cos(Math.PI / 4), 0.5 + 0.3 * Math.sin(Math.PI / 4)], [0.5 - 0.3 * Math.cos(Math.PI / 4), 0.5 - 0.3 * Math.sin(Math.PI / 4)], [0.5 - 0.3 * Math.cos(Math.PI / 4), 0.5 + 0.3 * Math.sin(Math.PI / 4)]]);
  assert(isInk(eq.px[0]) && isPaper(eq.px[1]) && isPaper(eq.px[2]), `ربعُ البيضة: أسفلُ اليمين مرسوم، وأعلى اليسار وأسفلُ اليسار لا (${JSON.stringify(eq.px)})`);

  // ═════════════════════ ٤. الحدُّ متغيّر السُّمك مقصوصًا ═════════════════════
  // خطٌّ أفقيٌّ عرضُه ٨٠ يرقّ من ١ إلى ٠٫٠٢ (`taperEnd`). يُقَصّ عند النصف: السُّمكُ عند طرفه
  // النامي هو سُمكُ منتصف الخطّ كاملًا (نحو ٥١٪)، لا ذيلٌ يرقّ في كلّ إطار.
  const V = shape('V', { x: 0.2, y: 0.5, w: 0.8, h: 0.0001, rotation: 0 }, { shape: 'path', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false }, [strokeLayer(80, { start: 1, mid: null, end: 0.02 })], { trimEnd: [kf('a', 0, 0.5), kf('b', 1, 0.5)] });
  const vFull = await renderAt(page, [{ ...V, anim: anim({}) }], 0, []);
  const vHalf = await renderAt(page, [V], 0, []);
  // الأعمدة: ٠٫٣ و٠٫٤٥ و٠٫٥ و٠٫٦ من اللوح؛ والخطُّ من ٠٫٢ إلى ١٫٠ فطرفُ النصف عند ٠٫٦.
  assert(Math.abs(vHalf.thick[0] - vFull.thick[0]) <= 1 && Math.abs(vHalf.thick[1] - vFull.thick[1]) <= 1, `داخل المقطوع السُّمكُ سُمكُ الخطّ الكامل نفسه (${vHalf.thick.slice(0, 2)} مقابل ${vFull.thick.slice(0, 2)})`);
  assert(vHalf.thick[3] === 0 && vFull.thick[3] > 30, `وما بعد الطرف لا يُرسَم (${vHalf.thick[3]} مقابل ${vFull.thick[3]} في الكامل)`);

  // ═════════════════════ ٥. المعاينة ═════════════════════
  // الإعدادُ بحقن المستند في الحفظ التلقائيّ ثم إعادة التحميل — كما يفعل قسمُ الصورة المُدارة
  // في `image-trace.spec.mjs`؛ والقياسُ من الواجهة الحيّة.
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
  }, { key: AUTOSAVE_KEY, els: [L, E] });
  await page.reload({ waitUntil: 'networkidle' });
  const { resumeAfterReload } = await import('./helpers/boot.mjs');
  await resumeAfterReload(page);
  await page.waitForTimeout(300);
  const rb = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(rb.x + rb.width * 0.93, rb.y + rb.height / 2);
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);
  const domMid = await page.evaluate(() => ({
    pathTrim: document.querySelectorAll('[data-el-id="L"] [data-trim-stroke]').length,
    ellTrim: document.querySelectorAll('[data-el-id="E"] [data-trim-strokes] path').length,
    mainStroke: document.querySelector('[data-el-id="L"] path')?.getAttribute('stroke'),
  }));
  assert(domMid.pathTrim === 1 && domMid.mainStroke === 'none', `المعاينة عند ٠٫٥ث: مسارُ الحدّ المقصوص حاضرٌ والحدُّ الكامل مطفأ (${JSON.stringify(domMid)})`);
  assert(domMid.ellTrim === 1, 'والبيضةُ المقصوصةُ حدُّها مسارٌ في طبقةٍ فوقها لا إطارُ CSS');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);
  const domEnd = await page.evaluate(() => ({ pathTrim: document.querySelectorAll('[data-el-id="L"] [data-trim-stroke]').length, mainStroke: document.querySelector('[data-el-id="L"] path')?.getAttribute('stroke') }));
  assert(domEnd.pathTrim === 0 && domEnd.mainStroke === '#000000', `وعند ١ث (الخطُّ كاملًا) يعود الحدُّ الكامل وحده (${JSON.stringify(domEnd)})`);

  // ═════════════════════ ٦. من الواجهة ═════════════════════
  await bootBlank(page, BASE_URL, 'ig-reel');
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.locator('[data-tool="pen"]').click();
  await page.waitForTimeout(200);
  await page.mouse.click(ab.x + ab.width * 0.2, ab.y + ab.height * 0.4);
  await page.mouse.click(ab.x + ab.width * 0.8, ab.y + ab.height * 0.4);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const penId = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all[all.length - 1]?.getAttribute('data-el-id');
  });
  await page.locator('[data-tool="text"]').click();
  await page.mouse.click(ab.x + ab.width * 0.5, ab.y + ab.height * 0.7);
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const textId = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id^="text"]')];
    return all[all.length - 1]?.getAttribute('data-el-id');
  });
  await page.locator(`[data-testid="expand-${penId}"]`).click();
  if (textId) await page.locator(`[data-testid="expand-${textId}"]`).click();
  await page.waitForTimeout(200);
  const rowsPen = await page.locator(`[data-testid^="clip-row-${penId}-trim"]`).count();
  const rowsText = textId ? await page.locator(`[data-testid^="clip-row-${textId}-trim"]`).count() : -1;
  assert(rowsPen === 2 && rowsText === 0, `صفّا «بداية الخط» و«نهاية الخط» تحت الشكل لا تحت النصّ (${rowsPen} / ${rowsText})`);
  // مفتاحٌ عند ٠ بقيمة ٠، ومفتاحٌ عند ١ث بقيمة ١٠٠٪ — من زرّ «+» والحقل الرقميّ.
  await page.locator(`[data-testid="layer-name-${penId}"]`).click();
  const rb2 = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(rb2.x + rb2.width * 0.93, rb2.y + rb2.height / 2);
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  const setKfValue = async (display) => {
    const doc = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).artboards[0].doc, AUTOSAVE_KEY);
    void doc;
    const field = page.locator('[data-testid="kf-value-field"]');
    await field.click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.type(String(display));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
  };
  await page.locator(`[data-testid="clip-${penId}-add-kf-trimEnd"]`).click();
  await page.waitForTimeout(900);
  let el = (await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).artboards[0].doc, AUTOSAVE_KEY)).elements.find((e) => e.id === penId);
  const k0 = el.anim.tracks.trimEnd[0];
  assert(Math.abs(k0.value - 1) < 1e-9, `المفتاحُ الأوّل يَختم القيمةَ المرسومة الآن — الخطُّ كاملًا ١٠٠٪ (${k0.value})`);
  await page.locator(`[data-testid="kf-${penId}-${k0.id}"]`).click();
  await page.waitForTimeout(150);
  await setKfValue(0);
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.mouse.click(rb2.x + rb2.width * 0.93, rb2.y + rb2.height / 2);
  await page.keyboard.press('Home');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(150);
  await page.locator(`[data-testid="clip-${penId}-add-kf-trimEnd"]`).click();
  await page.waitForTimeout(900);
  el = (await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).artboards[0].doc, AUTOSAVE_KEY)).elements.find((e) => e.id === penId);
  const k1 = el.anim.tracks.trimEnd.find((k) => k.id !== k0.id);
  await page.locator(`[data-testid="kf-${penId}-${k1.id}"]`).click();
  await page.waitForTimeout(150);
  await setKfValue(100);
  await page.waitForTimeout(900);
  el = (await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).artboards[0].doc, AUTOSAVE_KEY)).elements.find((e) => e.id === penId);
  const vals = el.anim.tracks.trimEnd.map((k) => `${k.time.toFixed(2)}:${k.value}`).join(' ');
  assert(vals === '0.00:0 1.00:1', `مفتاحا «نهاية الخط»: ٠ عند الصفر و١٠٠٪ عند ١ث (${vals})`);

  // ═════════════════════════ أخطاء صامتة ═════════════════════════
  const realErrors = pageErrors.filter((e) => !/favicon|ResizeObserver loop/i.test(e));
  assert(realErrors.length === 0, realErrors.length ? `بلا أخطاء تشغيل (${realErrors.length}): ${realErrors.slice(0, 3).join(' | ')}` : 'بلا أخطاء تشغيل');

  await browser.close();
  console.log(`\n${'='.repeat(62)}`);
  console.log(`${pass} passed, ${fail} failed.`);
  if (failures.length) {
    console.log('\nfailures:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('harness crashed:', e);
  process.exit(2);
});
