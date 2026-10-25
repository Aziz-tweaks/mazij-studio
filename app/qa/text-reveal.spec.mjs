#!/usr/bin/env node
// **ظهورُ النصّ: كلمةً مع الصوت، وحرفًا يُكتَب، وحروفٌ عربيّةٌ موصولة — ٢٥ أكتوبر ٢٠٢٦.**
//
// المقطعُ الذي طلب المالك نسخَه من واجهة مزيج وحدها يكتب نصَّه بثلاث طرق لا يقدر
// عليها ما كان:
//
//   ١. **كلمةٌ مع كلّ كلمةٍ من الراوي**: «حطيـــت» عند الإطار ٦، «الاجرب» عند ١٨، «لي» عند
//      ٣٢ — فواصلُ تتبع الكلام. والتوقيتُ التلقائيّ (بداية + رتبة × تأخير) إيقاعٌ ثابت.
//      فصار للنصّ خاصّيّةٌ متحرّكةٌ «الظهور» (كم وحدةً بدأت) وزرُّ «الكلمة التالية هنا».
//   ٢. **آلةٌ كاتبةٌ عربيّة**: «الا» ثم «الاغ» — والغينُ **بصورتها الأخيرة** لأنها آخرُ ما
//      كُتِب، ثم تتّصل بالألف بعدها. أثرُ «كتابة» يُشكّل البادئةَ الظاهرةَ وحدها.
//   ٣. **والحرفُ وحده كان يُرسَم مفردًا**: «سيف» تخرج «س ي ف» في كلّ أثرٍ حرفيّ. فصار كلُّ
//      حرفٍ يُرسَم بصورته في كلمته (محارف الوصل)، ولام-ألف وحدةً واحدة.
//
// والقياسُ من الواجهة كما يستعملها مصمّم (أداةُ النصّ، والأزرار، والمؤشّر بالمفاتيح)، ومن
// المُصيِّر الحقيقيّ للتصدير.
import { chromium } from 'playwright';
import { bootBlank, resumeAfterReload, AUTOSAVE_KEY } from './helpers/boot.mjs';

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
const ZWJ = '‍';
const ZWNJ = '‌';

async function doc(page) {
  await page.waitForTimeout(900);
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).artboards[0].doc, AUTOSAVE_KEY);
}
const elOf = async (page, id) => (await doc(page)).elements.find((e) => e.id === id);
const historyLen = (page) => page.locator('[data-testid="undo-btn"]').evaluate((e) => Number(e.dataset.historyPast));
const playheadT = (page) => page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));

/** يضع المؤشّر على إطارٍ بعينه بالمفاتيح، كما يفعل المصمّم: Home ثم ← خطوةً خطوة. */
async function parkAtFrame(page, frame) {
  const rb = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(rb.x + rb.width * 0.93, rb.y + rb.height / 2);
  await page.keyboard.press('Home');
  for (let i = 0; i < Math.floor(frame / 5); i++) await page.keyboard.press('Shift+ArrowRight');
  for (let i = 0; i < frame % 5; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  return playheadT(page);
}

/** نصٌّ جديدٌ بأداة النصّ، يُكتَب فيه مباشرةً — طريقُ المصمّم. */
async function addText(page, content, at = { x: 0.8, y: 0.2 }) {
  await page.locator('[data-tool="text"]').click();
  await page.waitForTimeout(180);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.mouse.click(ab.x + ab.width * at.x, ab.y + ab.height * at.y);
  await page.waitForTimeout(400);
  await page.keyboard.type(content, { delay: 15 });
  await page.waitForTimeout(240);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all.length ? all[all.length - 1].getAttribute('data-el-id') : null;
  });
}

async function selectLayer(page, id) {
  await page.locator(`[data-testid="layer-name-${id}"]`).click();
  await page.waitForTimeout(160);
}

/** يُفعّل التتابعَ ويختار الوحدةَ والأثرَ — بالأزرار. */
async function setupStagger(page, id, unit, effect) {
  await selectLayer(page, id);
  await page.locator(`[data-testid="stagger-toggle-${id}"]`).click();
  await page.waitForTimeout(120);
  await page.locator(`[data-testid="stagger-unit-${id}-${unit}"]`).click();
  await page.waitForTimeout(80);
  await page.locator(`[data-testid="stagger-effect-${id}-${effect}"]`).click();
  await page.waitForTimeout(120);
}

/** وحداتُ العنصر الظاهرة في المعاينة الآن (عتمةٌ كاملة). */
const domShown = (page, id) =>
  page.evaluate((id) => [...document.querySelectorAll(`[data-el-id="${id}"] [data-stagger-unit]`)].filter((s) => getComputedStyle(s).opacity === '1').length, id);

/** إطارٌ من مُصيِّر التصدير الحقيقيّ لعنصرٍ واحد (أو نسخةٍ معدَّلةٍ منه) عند لحظةٍ — يعيد
 * قناعَ الحبر (بكسلٌ يخالف الخلفيّة) وعدَّه وصندوقَه. */
async function inkOf(page, id, t, patch = null, scale = 0.5) {
  return page.evaluate(
    async ({ key, id, t, patch, scale }) => {
      const ex = await import('/src/lib/exportArtboard.ts');
      const d = JSON.parse(window.localStorage.getItem(key)).artboards[0].doc;
      let el = d.elements.find((e) => e.id === id);
      if (patch) el = { ...el, ...patch, textAnim: { ...el.textAnim, ...(patch.textAnim ?? {}) } };
      const spec = {
        size: { id: 'probe', ar: '', en: '', w: 1080, h: 1920, kind: 'timed' },
        palette: { bg: '#101010', fg: '#f0f0f0', ac: '#ffb703' },
        elements: [el],
        transparent: false,
        lang: 'ar',
        scale,
        decorAccent: false,
        time: t,
      };
      const blob = await ex.renderArtboardPng(spec);
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
      const mask = new Uint8Array(bmp.width * bmp.height);
      let ink = 0;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0, p = 0; i < px.length; i += 4, p++) {
        const v = Math.abs(px[i] - 16) + Math.abs(px[i + 1] - 16) + Math.abs(px[i + 2] - 16);
        if (v > 90) {
          mask[p] = 1;
          ink++;
          const x = p % bmp.width;
          const y = (p / bmp.width) | 0;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
      let h = 0;
      for (let i = 0; i < mask.length; i++) h = (h * 31 + mask[i] * (i % 9973)) >>> 0;
      window.__lastMask = mask;
      return { ink, box: ink ? { x0, x1, y0, y1 } : null, w: bmp.width, h: bmp.height, hash: h };
    },
    { key: AUTOSAVE_KEY, id, t, patch, scale },
  );
}

/** تقاطعُ قناعين على اتّحادهما — `a` و`b` يُحسبان على التوالي في الصفحة. */
async function iouOf(page, id, a, b) {
  await inkOf(page, id, a.t, a.patch, a.scale);
  await page.evaluate(() => (window.__maskA = window.__lastMask));
  await inkOf(page, id, b.t, b.patch, b.scale);
  return page.evaluate(() => {
    const A = window.__maskA;
    const B = window.__lastMask;
    let inter = 0;
    let uni = 0;
    for (let i = 0; i < A.length; i++) {
      if (A[i] && B[i]) inter++;
      if (A[i] || B[i]) uni++;
    }
    return uni ? inter / uni : 1;
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootBlank(page, BASE_URL, 'ig-reel');

  // ═══════════════════ ١. الوصلُ والوحدات: الدوالّ نفسها ═══════════════════
  const pure = await page.evaluate(async () => {
    const ts = await import('/src/lib/textStagger.ts');
    const shaped = (text, unit = 'char') => ts.buildStaggerTokens(text, { unit, direction: 'start', effect: 'fade' }, 'x').filter((t) => t.rank !== null).map((t) => t.shaped);
    const units = (text, unit) => ts.tokenizeText(text, unit).filter((t) => t.orderIndex !== null).map((t) => t.text);
    return {
      sayf: shaped('سيف'),
      wamu: shaped('ومو'),
      latin: shaped('abc'),
      alaghani: units('الاغاني', 'char'),
      alaghaniShaped: shaped('الاغاني'),
      tashkeel: units('مُحَمَّد', 'char').length,
      words1: units('بل رمز للشجاعة والقوة.', 'word'),
      words2: units('اليـوم📅', 'word'),
      words3: units('هو الاجرب 🙂', 'word'),
      words4: units('«كلمة» أخرى', 'word'),
      joinTypes: [0x0628, 0x0627, 0x0640, 0x064e, 0x0621, 0x0041].map((c) => ts.joiningTypeOf(c)),
      concat: ts.tokenizeText('اليـوم📅 «كلمة» والقوة.', 'word').map((t) => t.text).join('') === 'اليـوم📅 «كلمة» والقوة.',
    };
  });
  const Z = ZWJ;
  assert(JSON.stringify(pure.sayf) === JSON.stringify([`س${Z}`, `${Z}ي${Z}`, `${Z}ف`]), `«سيف» حرفًا حرفًا: السين بمحرف وصلٍ بعدها، والياء من الجهتين، والفاء قبلها — كلٌّ بصورته في الكلمة (${JSON.stringify(pure.sayf)})`);
  assert(JSON.stringify(pure.wamu) === JSON.stringify(['و', `م${Z}`, `${Z}و`]), 'الواو لا تتّصل بما بعدها (نوعُ وصلها R): «ومو» = و، مـ، ـو — لا محرفَ وصلٍ حيث لا وصل');
  assert(JSON.stringify(pure.latin) === JSON.stringify(['a', 'b', 'c']), 'اللاتينيّ لا يكتسب محرفَ وصلٍ واحدًا — يُرسَم حرفًا حرفًا كما كان بالبايت');
  assert(JSON.stringify(pure.alaghani) === JSON.stringify(['ا', 'لا', 'غ', 'ا', 'ن', 'ي']), `لام-ألف وحدةٌ واحدة (ربطةٌ إلزاميّة): «الاغاني» ست وحداتٍ لا سبع (${JSON.stringify(pure.alaghani)})`);
  assert(pure.alaghaniShaped[2] === `غ${Z}` && pure.alaghaniShaped[1] === 'لا', 'الغين بعد «لا» لا تتّصل بما قبلها (الألف لا تصل ما بعدها) وتتّصل بالألف بعدها');
  assert(pure.tashkeel === 4, 'التشكيلُ يبقى على حرفه: «مُحَمَّد» أربعُ وحدات');
  assert(JSON.stringify(pure.words1) === JSON.stringify(['بل', 'رمز', 'للشجاعة', 'والقوة.']), `النقطةُ تظهر مع كلمتها لا قبلها: ${JSON.stringify(pure.words1)}`);
  assert(JSON.stringify(pure.words2) === JSON.stringify(['اليـوم📅']), 'الرمزُ التعبيريّ الملاصقُ لكلمةٍ يظهر معها («اليـوم📅» وحدةٌ واحدة)');
  assert(JSON.stringify(pure.words3) === JSON.stringify(['هو', 'الاجرب', '🙂']), 'والرمزُ بعد مسافةٍ وحدةٌ في دوره — كان ظاهرًا دائمًا قبل أن تظهر كلماتُه');
  assert(JSON.stringify(pure.words4) === JSON.stringify(['«كلمة»', 'أخرى']), 'القوسُ الأوّلُ يلحق بكلمته بعده، والأخيرُ بكلمته قبله');
  assert(JSON.stringify(pure.joinTypes) === JSON.stringify(['D', 'R', 'C', 'T', 'U', 'U']), 'أنواعُ الوصل من جدول يونيكود: ب D، ا R، التطويل C، الفتحة T، الهمزة U، ولاتينيّ U');
  assert(pure.concat, 'الوحداتُ مجموعةً هي النصُّ نفسُه بلا زيادةٍ ولا نقص');

  // ═══════════════════ ٢. توقيتُ الوحدات من مسار «الظهور» ═══════════════════
  const timing = await page.evaluate(async () => {
    const ts = await import('/src/lib/textStagger.ts');
    const kf = (time, value, easing = 'hold') => ({ id: `k${time}`, time, value, easing, bezier: [0.42, 0, 0.58, 1] });
    const cfg = { enabled: true, unit: 'word', direction: 'start', stagger: 0.04, unitDuration: 0.3, effect: 'none', easing: 'linear', bezier: [0, 0, 1, 1] };
    const anim = (tracks, start = 0, sourceIn = 0) => ({ preset: 'none', start, duration: 3, sourceIn, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks });
    const hold = anim({ reveal: [kf(0, 0), kf(0.2, 1), kf(0.6, 2), kf(1.0, 3)] });
    const at = (a, r, t, c = cfg) => ts.unitElapsedAt(c, a, r, t);
    const lin = anim({ reveal: [kf(0, 0, 'linear'), kf(1, 4, 'linear')] });
    const eased = anim({ reveal: [kf(0, 0, 'easeIn'), kf(1, 4, 'easeIn')] });
    // العبورُ المحسوب للمستوى ٢ (الوحدة ذات الرتبة ١) على مقطعٍ مُخفَّف:
    let cross = null;
    for (let t = 0; t <= 1; t += 0.0005) if (at(eased, 1, t) !== null) { cross = t - at(eased, 1, t); break; }
    const valueAround = (t) => ts.revealValueAt(eased, t);
    const down = anim({ reveal: [kf(0, 0), kf(0.5, 3), kf(1.0, 1)] });
    const shifted = anim({ reveal: [kf(0, 0), kf(0.2, 1)] }, 2, 0);
    const fadeCfg = { ...cfg, effect: 'fade', unitDuration: 0.4 };
    const auto = anim({});
    return {
      holdA: [at(hold, 0, 0.19), at(hold, 0, 0.2), at(hold, 1, 0.59), at(hold, 1, 0.6), at(hold, 2, 0.99), at(hold, 2, 1.0)],
      linStart1: [at(lin, 1, 0.4999), at(lin, 1, 0.5)],
      cross,
      crossCheck: cross === null ? null : [valueAround(cross - 1e-4), valueAround(cross + 1e-4)],
      down: [at(down, 0, 1.2) !== null, at(down, 2, 0.7) !== null, at(down, 2, 1.2) !== null],
      shifted: [at(shifted, 0, 2.19), at(shifted, 0, 2.2)],
      fadeHalf: ts.resolveUnitProgress(fadeCfg, hold, 1, 0.8),
      instant: ts.resolveUnitProgress(cfg, hold, 1, 0.6),
      typed: [0.1, 0.2, 0.7, 1.5].map((t) => ts.typedUnitCount({ ...cfg, effect: 'type' }, hold, 3, t)),
      autoStarted: ts.startedUnitCount({ ...cfg, stagger: 0.1 }, auto, 6, 0.25),
      autoElapsed: [at(auto, 3, 0.11, { ...cfg, stagger: 0.04 }), at(auto, 3, 0.12, { ...cfg, stagger: 0.04 })],
    };
  });
  const [h0a, h0b, h1a, h1b, h2a, h2b] = timing.holdA;
  assert(h0a === null && h0b === 0 && h1a === null && h1b === 0 && h2a === null && h2b === 0, `بالتثبيت تبدأ كلُّ وحدةٍ عند مفتاحها بالضبط وتغيب قبله بإطار (${JSON.stringify(timing.holdA)})`);
  assert(timing.linStart1[0] === null && timing.linStart1[1] !== null && Math.abs(timing.linStart1[1]) < 1e-9, `خطّيًّا من ٠ إلى ٤ في ثانية: الوحدةُ الثانية تبدأ حين تبلغ القيمةُ ٢ — عند ٠٫٥ث بالضبط (${JSON.stringify(timing.linStart1)})`);
  assert(timing.cross !== null && timing.crossCheck[0] < 2 && timing.crossCheck[1] >= 2 - 1e-6, `بتخفيفٍ غير خطّيّ يُوجَد العبورُ بالبحث الثنائيّ: القيمةُ قبله بجزءٍ من عشرة آلاف من الثانية دون ٢ وبعده ٢ (${timing.cross?.toFixed(5)}: ${JSON.stringify(timing.crossCheck)})`);
  assert(timing.down[0] && timing.down[1] && !timing.down[2], 'قيمةٌ تهبط تُغيّب الوحداتِ فوقها (مسحُ المكتوب): الثالثة ظاهرةٌ عند ٠٫٧ وغائبةٌ عند ١٫٢، والأولى باقية');
  assert(timing.shifted[0] === null && timing.shifted[1] !== null, 'المفاتيحُ بزمن الحركة: مقطعٌ يبدأ عند ٢ث يُظهر وحدتَه عند ٢٫٢ث');
  // التسامحُ ١e-6 لأنّ «خطّيّ» نفسَه يمرّ بحلّ بيزيه بأربعٍ وعشرين قسمةً (`bezierY`: ٢^-٢٤ ≈ ٦e-8).
  assert(Math.abs(timing.fadeHalf - 0.5) < 1e-6, `والأثرُ ذو المدّة يجري من لحظة البدء: تلاشٍ مدّته ٠٫٤ث في منتصفه بعد ٠٫٢ث من مفتاحه (${timing.fadeHalf})`);
  assert(timing.instant === 1, 'والأثرُ الفوريّ كاملٌ في إطار بدايته');
  assert(JSON.stringify(timing.typed) === JSON.stringify([0, 1, 2, 3]), `الكتابةُ تعدّ ما بدأ بترتيب القراءة: ${JSON.stringify(timing.typed)}`);
  assert(timing.autoStarted === 3, 'بلا مسار: التوقيتُ التلقائيّ كما كان — عند ٠٫٢٥ث بتأخير ٠٫١ث بدأت ثلاث وحدات');
  assert(timing.autoElapsed[0] === null && timing.autoElapsed[1] !== null, 'والتلقائيّ بتأخير ٠٫٠٤ث: الرابعة تبدأ عند ٠٫١٢ث لا قبلها');

  // ═══════════════════ ٣. الكلماتُ مع الصوت — من الواجهة ═══════════════════
  const wordsId = await addText(page, 'حطيـــت الاجرب لي');
  await setupStagger(page, wordsId, 'word', 'none');
  assert((await page.locator(`[data-testid="stagger-duration-${wordsId}"]`).count()) === 0, 'الأثرُ الفوريّ لا مدّةَ له: شريطُ «مدة كل وحدة» يختفي ومعه المنحنيات');
  assert((await page.locator(`[data-testid="stagger-delay-${wordsId}"]`).count()) === 1, 'وبلا توقيتٍ يدويّ يبقى «التأخير بين الوحدات» — التلقائيّ كما كان');
  const h0 = await historyLen(page);
  const pressedAt = [];
  for (const f of [6, 18, 32]) {
    pressedAt.push(await parkAtFrame(page, f));
    await selectLayer(page, wordsId);
    await page.locator(`[data-testid="reveal-next-${wordsId}"]`).click();
    await page.waitForTimeout(120);
  }
  const h1 = await historyLen(page);
  assert(h1 - h0 === 3, `كلُّ ضغطةٍ خطوةُ تراجعٍ واحدة (${h1 - h0})`);
  const nextBtn = page.locator(`[data-testid="reveal-next-${wordsId}"]`);
  assert((await nextBtn.isDisabled()) && (await nextBtn.innerText()).includes('موقّتة'), 'بعد آخر كلمة يقول الزرّ «كل الوحدات موقّتة» ويتعطّل');
  assert((await page.locator(`[data-testid="stagger-delay-${wordsId}"]`).count()) === 0, 'ومع التوقيت اليدويّ يغيب «التأخير بين الوحدات» — المفاتيحُ هي التوقيت');
  const wEl = await elOf(page, wordsId);
  const rv = wEl.anim.tracks.reveal ?? [];
  assert(
    rv.length === 4 && rv.every((k) => k.easing === 'hold') && JSON.stringify(rv.map((k) => k.value)) === '[0,1,2,3]' && Math.abs(rv[1].time - 0.2) < 1e-9 && Math.abs(rv[2].time - 0.6) < 1e-9 && Math.abs(rv[3].time - 32 / 30) < 1e-9,
    `المسار: صفرٌ عند بداية المقطع ثم ١ و٢ و٣ عند الإطارات ٦ و١٨ و٣٢، كلُّها «تثبيت» (${JSON.stringify(rv.map((k) => [+k.time.toFixed(4), k.value, k.easing]))})`,
  );
  const domSeq = [];
  for (const f of [5, 6, 17, 18, 31, 32]) {
    await parkAtFrame(page, f);
    domSeq.push(await domShown(page, wordsId));
  }
  assert(JSON.stringify(domSeq) === '[0,1,1,2,2,3]', `المعاينة: الكلماتُ تظهر في إطاراتها بالضبط — عند ٥/٦/١٧/١٨/٣١/٣٢: ${JSON.stringify(domSeq)}`);
  await parkAtFrame(page, 18);
  await selectLayer(page, wordsId);
  const countTxt = await page.locator(`[data-testid="reveal-count-${wordsId}"]`).innerText();
  assert(/2/.test(countTxt) && /3/.test(countTxt), `العدّادُ عند الإطار ١٨: «${countTxt}»`);
  const inkSeq = [];
  for (const f of [5, 6, 17, 18, 31, 32]) inkSeq.push((await inkOf(page, wordsId, f / 30)).ink);
  assert(inkSeq[0] === 0 && inkSeq[1] > 0 && inkSeq[2] === inkSeq[1] && inkSeq[3] > inkSeq[2] && inkSeq[4] === inkSeq[3] && inkSeq[5] > inkSeq[4], `والتصديرُ يوافق إطارًا بإطار — حبرُ النصّ عند الإطارات نفسها: ${JSON.stringify(inkSeq)}`);

  // التراجعُ والإلغاء.
  await page.locator(`[data-testid="reveal-clear-${wordsId}"]`).click();
  await page.waitForTimeout(150);
  assert(!(await elOf(page, wordsId)).anim.tracks.reveal && (await page.locator(`[data-testid="stagger-delay-${wordsId}"]`).count()) === 1, '«رجّعها تلقائي» يحذف المسار ويعيد «التأخير بين الوحدات»');
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(200);
  assert(((await elOf(page, wordsId)).anim.tracks.reveal ?? []).length === 4, 'وتراجعٌ واحدٌ يعيده كما كان');

  // الأنماطُ ومنحنى المقطع لا يمسّان التوقيت.
  await selectLayer(page, wordsId);
  const presetBlocked = await page.locator('[data-testid="anim-preset-menu"]').getAttribute('data-preset-blocked');
  assert(presetBlocked === 'false', 'توقيتُ الكلمات لا يحجب أنماطَ الدخول — ليس حركةً للصندوق');
  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-testid="easing-menu-button"]').click();
  await page.waitForTimeout(120);
  await page.locator('[data-testid="easing-option-easeInOut"]').click();
  await page.waitForTimeout(150);
  const afterPreset = await elOf(page, wordsId);
  assert(
    (afterPreset.anim.tracks.opacity ?? []).length >= 2 && (afterPreset.anim.tracks.reveal ?? []).length === 4 && afterPreset.anim.tracks.reveal.every((k) => k.easing === 'hold') && afterPreset.anim.tracks.opacity.every((k) => k.easing === 'easeInOut'),
    'نمطُ «تلاشٍ» يبني شفافيّةَ الصندوق، ومنحنى المقطع يسري عليها — ومفاتيحُ «الظهور» باقيةٌ بتثبيتها',
  );

  // الخطّ الزمنيّ: صفُّ «الظهور» ووحدتُه.
  await page.locator(`[data-testid="expand-${wordsId}"]`).click();
  await page.waitForTimeout(200);
  const revealRow = page.locator(`[data-testid="clip-row-${wordsId}-reveal"]`);
  assert((await revealRow.count()) === 1, 'صفُّ «الظهور» تحت مقطع النصّ حين يُفتَح');
  const diamonds = await revealRow.locator('[data-testid^="kf-"]').count();
  assert(diamonds === 4, `وعليه أربعُ ماسات (${diamonds})`);
  await revealRow.locator('[data-testid^="kf-"]').nth(2).click();
  await page.waitForTimeout(150);
  const unit = await page.locator('[data-testid="kf-value-unit"]').innerText();
  const sliderMax = await page.locator('[data-testid="kf-value-slider"]').getAttribute('max');
  const fieldVal = await page.locator('[data-testid="kf-value-field"]').inputValue();
  assert(unit === '#' && sliderMax === '3' && fieldVal === '2', `قيمةُ المفتاح عددُ وحدات: «${fieldVal}» من ${sliderMax} (${unit}) لا نسبةٌ مئويّة`);
  await page.keyboard.press('Escape');

  // ═══════════════════ ٤. الكتابة: البادئةُ مُشكَّلةٌ وحدها ═══════════════════
  const typeId = await addText(page, 'الاغاني', { x: 0.8, y: 0.45 });
  await setupStagger(page, typeId, 'char', 'type');
  assert((await page.locator(`[data-testid="stagger-dir-${typeId}-end"]`).count()) === 0 && (await page.locator(`[data-testid="stagger-type-hint-${typeId}"]`).count()) === 1, 'الكتابةُ بترتيب القراءة وحده: أزرارُ الاتّجاه تغيب ويُقال لماذا مكانها');
  for (const f of [2, 3, 8, 11, 13, 15]) {
    await parkAtFrame(page, f);
    await selectLayer(page, typeId);
    await page.locator(`[data-testid="reveal-next-${typeId}"]`).click();
    await page.waitForTimeout(100);
  }
  await parkAtFrame(page, 9);
  const typedDom = await page.evaluate((id) => {
    const root = document.querySelector(`[data-el-id="${id}"] [data-stagger-typed]`);
    if (!root) return null;
    const hidden = root.querySelector('span');
    return { k: root.getAttribute('data-stagger-typed'), visible: root.firstChild?.nodeType === 3 ? root.firstChild.textContent : null, hidden: hidden?.textContent ?? null, hiddenVis: hidden ? getComputedStyle(hidden).visibility : null };
  }, typeId);
  assert(typedDom && typedDom.k === '3' && typedDom.visible === 'الاغ', `المعاينة عند الإطار ٩: ظاهرٌ «الاغ» (ثلاثُ وحدات: ا، لا، غ) — ${JSON.stringify(typedDom)}`);
  assert(typedDom && typedDom.hidden === `${ZWNJ}اني` && typedDom.hiddenVis === 'hidden', 'والباقي «اني» مخفيٌّ في مكانه بعد محرف عدم الوصل — فتُرسَم الغينُ بصورتها الأخيرة');
  // التصدير: إطارُ الكتابة عند ٩ = النصُّ الساكن «الاغ» بالبكسل، لا «الاغـ» الموصولة.
  // (`doc` تنتظر الحفظَ التلقائيّ: المُصيِّرُ يقرأ المستندَ المحفوظ، والحفظُ مؤجَّلٌ قليلًا.)
  await doc(page);
  const typedInk = await inkOf(page, typeId, 9 / 30, null, 1);
  const staticPrefix = await inkOf(page, typeId, 9 / 30, { text: 'الاغ', textAnim: { enabled: false } }, 1);
  const joinedPrefix = await inkOf(page, typeId, 9 / 30, { text: `الاغ${ZWJ}`, textAnim: { enabled: false } }, 1);
  assert(typedInk.hash === staticPrefix.hash && typedInk.ink === staticPrefix.ink, `إطارُ التصدير عند ٩ يطابق رسمَ «الاغ» الساكن بكسلًا ببكسل (${typedInk.ink} = ${staticPrefix.ink})`);
  assert(typedInk.hash !== joinedPrefix.hash, `ويخالف «الاغـ» الموصولة (${joinedPrefix.ink} بكسل) — الغينُ أخيرةٌ لا وسطى`);
  const fullInk = await inkOf(page, typeId, 1.0, null, 1);
  assert(Math.abs(typedInk.box.x1 - fullInk.box.x1) <= 1, `والبادئةُ تبدأ من حافّة بداية النصّ الكامل (اليمين): ${typedInk.box.x1} مقابل ${fullInk.box.x1}`);
  // ومحاذاةٌ في الوسط: البادئةُ لا تتوسّط وحدها — تبقى عند يمين السطر الكامل.
  const centeredTyped = await inkOf(page, typeId, 9 / 30, { halign: 'center' }, 1);
  const centeredFull = await inkOf(page, typeId, 1.0, { halign: 'center' }, 1);
  assert(Math.abs(centeredTyped.box.x1 - centeredFull.box.x1) <= 1 && centeredTyped.box.x0 > centeredFull.box.x0 + 10, `في المحاذاة الوسطى تبدأ البادئةُ من يمين السطر الكامل ولا تقفز (${centeredTyped.box.x1} مقابل ${centeredFull.box.x1})`);

  // ═══════════════════ ٥. الحرفُ العربيّ موصولٌ في كلّ أثرٍ حرفيّ ═══════════════════
  const sayfId = await addText(page, 'سيف', { x: 0.8, y: 0.65 });
  await setupStagger(page, sayfId, 'char', 'fade');
  await doc(page);
  const settled = 3.0;
  const iouJoined = await iouOf(page, sayfId, { t: settled, scale: 1 }, { t: settled, patch: { textAnim: { enabled: false } }, scale: 1 });
  // والمقارنةُ بما كان: كلُّ حرفٍ مفردٌ بلا محرف وصل.
  const isolatedIou = await page.evaluate(async ({ key, id }) => {
    const d = JSON.parse(window.localStorage.getItem(key)).artboards[0].doc;
    const el = d.elements.find((e) => e.id === id);
    const W = 1080, H = 1920;
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#101010';
    g.fillRect(0, 0, W, H);
    const fontPx = (el.fontSize / 1080) * W;
    g.font = `800 ${fontPx}px ${el.fontFamily}, sans-serif`;
    g.direction = 'rtl';
    g.textAlign = 'right';
    g.fillStyle = '#f0f0f0';
    let x = el.geo.x * W + el.geo.w * W;
    const y = el.geo.y * H + fontPx * 0.9;
    for (const ch of ['س', 'ي', 'ف']) {
      g.fillText(ch, x, y);
      x -= g.measureText(ch).width;
    }
    const px = g.getImageData(0, 0, W, H).data;
    const A = window.__maskA; // النصُّ المتتابع (الحالة الجديدة)، من `iouOf` أعلاه
    let inter = 0, uni = 0;
    for (let i = 0, p = 0; i < px.length; i += 4, p++) {
      const on = Math.abs(px[i] - 16) + Math.abs(px[i + 1] - 16) + Math.abs(px[i + 2] - 16) > 90;
      if (on && A[p]) inter++;
      if (on || A[p]) uni++;
    }
    return inter / uni;
  }, { key: AUTOSAVE_KEY, id: sayfId });
  assert(iouJoined > 0.95, `«سيف» حرفًا حرفًا (تلاشٍ، بعد اكتماله) يطابق «سيف» الساكنة: تقاطعٌ/اتّحاد = ${iouJoined.toFixed(3)}`);
  assert(isolatedIou < iouJoined - 0.15, `ورسمُ الحروف مفردةً — ما كان — بعيدٌ عنها: ${isolatedIou.toFixed(3)}`);
  await parkAtFrame(page, 60);
  const domWidths = await page.evaluate((id) => {
    const units = [...document.querySelectorAll(`[data-el-id="${id}"] [data-stagger-unit]`)];
    return units.reduce((s, u) => s + u.getBoundingClientRect().width, 0);
  }, sayfId);
  await page.locator(`[data-testid="stagger-toggle-${sayfId}"]`).click();
  await page.waitForTimeout(150);
  const plainWidth = await page.evaluate((id) => {
    const el = document.querySelector(`[data-el-id="${id}"]`);
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().width;
  }, sayfId);
  await page.locator(`[data-testid="stagger-toggle-${sayfId}"]`).click();
  await page.waitForTimeout(150);
  assert(Math.abs(domWidths / plainWidth - 1) < 0.03, `والمعاينة كذلك: عرضُ حروف «سيف» مجموعةً ${domWidths.toFixed(1)} مقابل الكلمة ${plainWidth.toFixed(1)} بكسل`);

  // لا كسرَ سطرٍ داخل الكلمة.
  const longId = await addText(page, 'abcdefghijklmnopqrstuvwxyz ab', { x: 0.8, y: 0.8 });
  await setupStagger(page, longId, 'char', 'fade');
  await parkAtFrame(page, 90);
  const tops = await page.evaluate((id) => [...document.querySelectorAll(`[data-el-id="${id}"] [data-stagger-unit]`)].map((u) => Math.round(u.getBoundingClientRect().top)), longId);
  const firstWordTops = new Set(tops.slice(0, 26));
  assert(firstWordTops.size === 1, `الكلمةُ الطويلة لا تنكسر بين حرفين في المعاينة (سطورُ حروفها: ${[...firstWordTops].join(',')})`);

  // ═══════════════════ ٦. الظلّ والانقشاع في التصدير ═══════════════════
  const shadow = await page.evaluate(async () => {
    const ex = await import('/src/lib/exportArtboard.ts');
    const el = (textAnim) => ({
      id: 't', type: 'text', visible: true, locked: false, opacity: 100, maskId: null,
      geo: { x: 0.1, y: 0.1, w: 0.8, h: 0.2, rotation: 0 },
      text: 'رمز للشجاعة', fontFamily: 'Alexandria', fontSize: 90, weight: 'bold', color: '#ffffff', halign: 'center', valign: 'top',
      anim: { preset: 'none', start: 0, duration: 1, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
      textAnim, pathId: null,
      appearance: { fills: [], strokes: [], shadows: [{ id: 's', visible: true, opacity: 1, blend: 'normal', kind: 'outer', color: '#ff0000', blur: 0, offsetX: 12, offsetY: 0, spread: 0 }] },
    });
    const off = { enabled: false, unit: 'word', direction: 'start', stagger: 0.04, unitDuration: 0.3, effect: 'none', easing: 'linear', bezier: [0, 0, 1, 1] };
    const count = async (e, time) => {
      const blob = await ex.renderArtboardPng({ size: { id: 'p', ar: '', en: '', w: 1080, h: 1080, kind: 'still' }, palette: { bg: '#000000', fg: '#ffffff', ac: '#ffb703' }, elements: [e], transparent: false, lang: 'ar', scale: 0.5, decorAccent: false, time });
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
      let red = 0, soft = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] > 200 && px[i + 1] < 60 && px[i + 2] < 60) red++;
        if (px[i] > 20 && px[i] < 230 && px[i + 1] > 20 && px[i + 1] < 230 && Math.abs(px[i] - px[i + 1]) < 30) soft++;
      }
      return { red, soft };
    };
    return {
      plain: await count(el(off), 1),
      stagger: await count(el({ ...off, enabled: true }), 1),
      blurMid: await count(el({ ...off, enabled: true, effect: 'blur', unitDuration: 0.4 }), 0.2),
      blurEnd: await count(el({ ...off, enabled: true, effect: 'blur', unitDuration: 0.4 }), 1),
    };
  });
  assert(shadow.plain.red > 200 && Math.abs(shadow.stagger.red - shadow.plain.red) / shadow.plain.red < 0.1, `الظلُّ يُرسَم للنصّ المتتابع كما للساكن (أحمر: ${shadow.stagger.red} مقابل ${shadow.plain.red}) — كان المسارُ المتتابع يرسم التعبئةَ وحدها`);
  assert(shadow.blurMid.soft > shadow.blurEnd.soft * 2, `«انقشاع» في منتصفه ضبابيٌّ وفي آخره حادّ (بكسلاتٌ رماديّة: ${shadow.blurMid.soft} ثم ${shadow.blurEnd.soft})`);

  // ═══════════════════ ٧. الحفظ ═══════════════════
  await page.waitForTimeout(1300);
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(400);
  const reloaded = await doc(page);
  const tEl = reloaded.elements.find((e) => e.id === typeId);
  assert(tEl && tEl.textAnim.effect === 'type' && (tEl.anim.tracks.reveal ?? []).length === 7, 'الكتابةُ ومسارُ ظهورها يبقيان بعد إعادة التحميل (صفرٌ + ستّ وحدات)');
  await parkAtFrame(page, 9);
  const typedAfter = await page.evaluate((id) => document.querySelector(`[data-el-id="${id}"] [data-stagger-typed]`)?.getAttribute('data-stagger-typed'), typeId);
  assert(typedAfter === '3', 'وتُرسَم بعده كما كانت: ثلاثُ وحداتٍ عند الإطار ٩');

  assert(pageErrors.length === 0, `لا أخطاءَ في الصفحة: ${JSON.stringify(pageErrors)}`);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail) {
    for (const f of failures) console.error('  ↳ FAILED:', f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
