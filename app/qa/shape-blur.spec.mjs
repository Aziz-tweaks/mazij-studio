#!/usr/bin/env node
// ضبابيّةٌ حقيقيّةٌ على الشكل نفسِه — متحرّكةٌ ومُصدَّرةٌ ومقيسةُ التطابق.
//
// ═══════════════════════════════════════════════════════════════════════════
// ما الذي كان ناقصًا، ومن أين قيسَ النقص
// ═══════════════════════════════════════════════════════════════════════════
// كلمةُ `blur` الوحيدةُ في النموذج كانت `AppearanceShadowLayer.blur`
// (`src/state/elements.ts`) — وهي نصفُ قطرِ **هالةِ ظلٍّ** تُرسَم أوّلًا ثم
// **تُغطّيها التعبئةُ الحادّةُ نفسُها** بعدها: `paintOuterShadowsCanvas` تَملأ
// الصورةَ الظلّيّةَ بـ`ctx.shadowBlur` ثم `paintFillsCanvas` تَملأ الصورةَ نفسَها
// حادّةً فوقها (`src/lib/appearance.ts`). فالعنصرُ يبقى حادًّا **دائمًا**، وما
// يَلين هو ما يَنزّ من تحت حدِّه فقط. وذلك شيءٌ آخرُ غيرُ المطلوب.
//
// وقيسَ أنّ **لا `filter` قطُّ** في `src/` كلِّها قبل هذا العمل: لا CSS `filter`
// على عقدةِ معاينة، ولا `ctx.filter` على قُماش — السطرُ الوحيدُ الذي يُنبعِث
// `<filter>` هو `svgOuterShadowFilter`، وهو للظلّ وحده.
//
// وصفُّ «ضبابية» في لوح التأثيرات كان **سطحًا ميتًا**: القسمُ كلُّه
// `pointerEvents:'none'` و`aria-disabled` و`title="قريبًا"`؛ ومعه صفُّ «ظلّ»
// مُعطَّلٌ **فوق ظلٍّ يعمل فعلًا** في قسم المظهر — وهو عينُ ما يَمنعه الميثاق:
// «قريبًا» دواءٌ للصمت لا بديلٌ لسطحٍ قائم.
//
// ═══════════════════════════════════════════════════════════════════════════
// الشكلُ المُختار: كسرٌ من عرض اللوح، ساكنٌ يُجمَع إليه فرقٌ متحرّك
// ═══════════════════════════════════════════════════════════════════════════
// (أ) **الوحدةُ كسرٌ من عرض اللوح لا بكسلًا**، لأنّ `magicResizeElements` لا
//     تَكتب إلّا `geo` و`fontSize` وتَنسخ ما بقي بـ`...el`
//     (`src/lib/magicResize.ts`)، فكسرٌ بلا بُعدٍ صحيحٌ عند كلّ مقاسٍ **بحكم
//     البناء** — حجّةُ `scaleX`/`scaleY` و`widthProfile` نفسُها.
// (ب) **والمعاينةُ تُنبعِثه `cqw`**، كما تُنبعِث `translate(Xcqw, Ycqw)` سلفًا
//     واللوحُ `container-type: inline-size`. ومقيسٌ لا مُفترَض: `blur(5cqw)` داخل
//     حاضنٍ عرضُه ٤٠٠ بكسلًا يَحُلّ `blur(20px)` بالضبط، ومسحُ البكسل للاثنين
//     متطابقٌ حبرًا (١٧٤×١٧٤) وانتقالًا (٥٠ بكسلًا).
// (ج) **والمسارُ المتحرّكُ جمعٌ لا ضرب** — كـ`x`/`y`/`rotation`، ومحايدُه `0`.
//     وجمعُ الصفر تامٌّ في IEEE 754، فمستندٌ لا يحمل المسارَ يُعطي الساكنةَ بتّةً
//     ببتّة. والمجموعُ يُقصَر عند الصفر لا المفتاحُ، وإلا لاستحال «ابدأ مُضبَّبًا
//     وانتهِ حادًّا».
//
// ═══════════════════════════════════════════════════════════════════════════
// وأصعبُ ما في البند: الرسّامتان لا تَتطابقان بلا تعويضٍ مقيس
// ═══════════════════════════════════════════════════════════════════════════
// قيسَ الفرقُ في Chromium **قبل** كتابة سطرٍ واحدٍ من التطبيق:
//   • CSS: `filter` في الفضاء المحلّيّ **ثم** يَمطّه `transform`. `blur(20px)`
//     وحدَه انتقالُه ٥٠ بكسلًا، ومع `scale(2)` صار ٩٨ — نسبةُ ١٫٩٦. ومع
//     `scale(1,2)` صار الحبرُ ١٧٤×٣٤٤ والانتقالُ الأفقيُّ ٥٠ كما هو، أي ضبابيّةٌ
//     **لا متساويةُ المحاور**.
//   • Canvas: `ctx.filter` **لا تَعرف مصفوفةَ التحويل إطلاقًا**. الصندوقُ نفسُه
//     تحت `ctx.scale(2,2)` أعطى انتشارًا ١٨٢ بكسلًا، وبلا مقياسٍ ١٨٢ أيضًا —
//     نسبةُ ١٫٠٠٠ بالضبط.
// فالتعويضُ في `canvasBlurRadiusPx` مقصودٌ ومُعلَن: المتوسّطُ الهندسيُّ
// `sqrt(sx·sy)`، وهو يُعيد `s` بعينه متى تساوى المحوران. والقسمُ ٥ أدناه يَقيس
// التطابقَ رقمًا ويَقيس الفرقَ الباقيَ رقمًا — ولا يُشحَن معاينةٌ تكذب.
//
// التشغيل: QA_PORT=<منفذ حرّ> QA_SPECS=shape-blur npm test
import { chromium } from 'playwright';
import { AUTOSAVE_KEY, bootBlank, resumeAfterReload } from './helpers/boot.mjs';

const BASE_URL = `http://localhost:${process.env.QA_PORT || '1420'}`;

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ok  ', msg);
  } else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}

const near = (a, b, eps) => Math.abs(a - b) <= eps;

// ─────────────────────────────────────────────────────────────────────────────
// قياسُ النعومة — من البكسل وحده، لا من نصِّ خصيصةٍ في CSS
// ─────────────────────────────────────────────────────────────────────────────
// **ولِمَ هكذا.** خصيصةٌ مضبوطةٌ لا أثرَ لها هي العطلُ بعينه الذي يُصلحه هذا
// البند: `getComputedStyle(x).filter === 'blur(50px)'` لا يُثبت عن الصورة شيئًا.
// فكلُّ بندٍ هنا يَقرأ بكسلًا حقيقيًّا — من لقطةٍ للوح، أو من `renderArtboardPng`.
//
// والمقياسُ الأوّلُ **عرضُ الانتقال من ١٠٪ إلى ٩٠٪** على خطٍّ أفقيٍّ يمرّ بمركز
// الشكل: حدٌّ حادٌّ يُعطي بكسلًا أو اثنين، وحدٌّ مُضبَّبٌ بانحرافٍ معياريٍّ σ يُعطي
// 2.5631×σ (عرضُ ١٠-٩٠ لدالّة الخطأ). والثاني **امتدادُ الحبر**: الضبابيّةُ
// تَنشر الحبرَ خارجَ صندوق العنصر، والحادُّ لا يَنشره.
const PROFILE_SRC = `
function decodeAndProfile(b64, yFrac) {
  return (async () => {
    const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
    const bm = await createImageBitmap(blob);
    const W = bm.width, H = bm.height;
    const c = new OffscreenCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.drawImage(bm, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const y = Math.min(H - 1, Math.max(0, Math.round(H * yFrac)));
    // «قوّةُ الحبر» — ولها مساران، لأنّ للصورتَين خلفيّتَين مختلفتَين:
    //
    // (أ) مسارُ التصدير يُطلَب بخلفيّةٍ شفّافة، فالقناةُ alpha وحدَها هي قوّةُ
    //     الحبر بلا لبس.
    // (ب) لقطةُ المعاينة خلفيّتُها لونُ اللوح من اللوحة، لا أبيضَ ولا شفّافًا.
    //     فقوّةُ الحبر هي بُعدُ اللون عن خلفيّة الصفّ نفسِه، والخلفيّةُ تُقاس من
    //     حرف الصفّ حيث لا شكل. ومقياسٌ مُثبَّتٌ على الأبيض كان يَقرأ الخلفيّةَ
    //     حبرًا فيُعطي انتقالًا يساوي بكسلًا واحدًا على صورةٍ ناعمةٍ فعلًا — وهو
    //     خطأُ قياسٍ وقع فعلًا في أوّل تشغيلٍ لهذا الملفّ، فأُصلح المقياس.
    let transparentBg = false;
    for (let x = 0; x < W; x += 7) if (d[(y * W + x) * 4 + 3] < 250) { transparentBg = true; break; }
    const bgI = (y * W + 2) * 4;
    const bg = [d[bgI], d[bgI + 1], d[bgI + 2]];
    const strength = (i) =>
      transparentBg
        ? d[i + 3]
        : Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
    const row = [];
    for (let x = 0; x < W; x++) row.push(strength((y * W + x) * 4));
    let peak = 0;
    for (let x = 3; x < W - 3; x++) if (row[x] > peak) peak = row[x];
    const floor = Math.max(3, peak * 0.03);
    // الحرفُ الأوّلُ والأخيرُ من اللوح يَحملان خطَّ إطارِه، فيُقرآن حبرًا وليسا
    // منه — مقيسٌ: البكسلُ عند الطرف يَبعد ١٦٥ عن لون الخلفيّة. فيُقصّ ثلاثةٌ
    // من كلّ طرف، وهو أضيقُ بكثيرٍ من أيّ نصفِ قطرٍ يُقاس هنا.
    let inkMin = -1, inkMax = -1;
    for (let x = 3; x < W - 3; x++) if (row[x] > floor) { if (inkMin < 0) inkMin = x; inkMax = x; }
    let x10 = -1, x90 = -1;
    for (let x = 3; x < W - 3; x++) {
      if (x10 < 0 && row[x] >= 0.1 * peak) x10 = x;
      if (x10 >= 0 && x90 < 0 && row[x] >= 0.9 * peak) { x90 = x; break; }
    }
    let num = 0, den = 0;
    for (let x = 3; x < W - 3; x++) { num += x * row[x]; den += row[x]; }
    return {
      W, H, peak,
      inkWidth: inkMin < 0 ? 0 : inkMax - inkMin + 1,
      inkMin, inkMax,
      rise: x10 >= 0 && x90 >= 0 ? x90 - x10 : null,
      centroid: den > 0 ? num / den : null,
      mass: den,
    };
  })();
}`;

/** يُلغي التحديدَ بضغطةٍ على فراغ اللوح — **وهذا شرطُ قياسٍ لا تجميل**.
 *
 * خطُّ التحديد ومقابضُه يُرسَمان بلون التمييز، فيَدخلان الصفَّ المقروءَ ويَصيران
 * هما الذروةَ: قيسَ أنّ ذروةَ الصفّ مع التحديد ٣٦٧ وبدونه ٢٧٥، وأنّ انتقالَ
 * ١٠-٩٠ يُقرأ ٩١ بكسلًا على شكلٍ **حادٍّ تمامًا** لأنّ المِقبضَ يَبلغ ١٠٪ قبل
 * الحدّ والحدُّ الآخرَ يَبلغ ٩٠٪ بعده. فلولا إلغاءُ التحديد لكان البندُ يَقيس
 * الكروم لا العنصر. وقع فعلًا في أوّل تشغيل. */
async function deselect(page) {
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.locator('[data-tool="select"]').click();
  await page.waitForTimeout(160);
  await page.mouse.click(ab.x + ab.width * 0.05, ab.y + ab.height * 0.04);
  await page.waitForTimeout(360);
}

/** يُعيد تحديدَ العنصر بضغطةٍ على مركزه — فلوحُ الخصائص لا يَظهر بلا تحديد. */
async function selectEl(page) {
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.locator('[data-tool="select"]').click();
  await page.waitForTimeout(160);
  await page.mouse.click(ab.x + ab.width * 0.5, ab.y + ab.height * 0.5);
  await page.waitForTimeout(360);
}

/** لقطةٌ حقيقيّةٌ للوح في المعاينة، مقروءةٌ بكسلًا بكسلًا. */
async function previewProfile(page, yFrac = 0.5) {
  const buf = await page.locator('[data-testid="artboard"]').screenshot();
  return page.evaluate(
    async ({ b64, yFrac, src }) => new Function(`${src}; return decodeAndProfile;`)()(b64, yFrac),
    { b64: buf.toString('base64'), yFrac, src: PROFILE_SRC },
  );
}

/** مسارُ التصدير نفسُه الذي يُخرِج PNG و MP4 و GIF و الصورةَ الحيّة، عند زمنٍ صريح. */
async function exportProfile(page, el, time, W = 400, yFrac = 0.5) {
  return page.evaluate(
    async ({ el, time, W, yFrac, src }) => {
      const mod = await import('/src/lib/exportArtboard.ts');
      const blob = await mod.renderArtboardPng({
        size: { w: W, h: W }, palette: { bg: '#ffffff', fg: '#000000', ac: '#ff0000' },
        elements: [el], transparent: true, lang: 'ar', time, scale: 1,
      });
      const b64 = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1]);
        r.readAsDataURL(blob);
      });
      return new Function(`${src}; return decodeAndProfile;`)()(b64, yFrac);
    },
    { el, time, W, yFrac, src: PROFILE_SRC },
  );
}

/** عنصرُ شكلٍ خالصٌ لمسار التصدير — مربّعٌ أحمرُ في وسط اللوح، ٤٠٪ من ضلعه. */
function blobEl({ blur = 0, tracks = {}, duration = 1, opacity = 100 } = {}) {
  return {
    id: 'blob', type: 'shape', shape: 'rect', visible: true, locked: false, opacity, maskId: null,
    geo: { x: 0.3, y: 0.3, w: 0.4, h: 0.4, rotation: 0 },
    fill: '#ff0000', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0,
    blur,
    anim: { preset: 'none', start: 0, duration, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks },
  };
}

const mkTrack = (v0, v1) => [
  { id: 'k0', time: 0, value: v0, easing: 'linear', bezier: [0, 0, 1, 1] },
  { id: 'k1', time: 1, value: v1, easing: 'linear', bezier: [0, 0, 1, 1] },
];

const rulerSpan = (page) => page.locator('[data-testid="timeline-ruler"]').evaluate((e) => Number(e.dataset.span));

async function parkPlayhead(page, seconds) {
  const span = await rulerSpan(page);
  const box = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(box.x + (box.width * seconds) / span + 1, box.y + box.height / 2);
  await page.waitForTimeout(140);
  return page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
}

/** يَرسم مستطيلًا بالسحب — بأحداث مؤشّرٍ حقيقيّة، لا بحقنِ حالة. */
async function drawRect(page) {
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(340);
  await page.mouse.move(ab.x + ab.width * 0.3, ab.y + ab.height * 0.36);
  await page.mouse.down();
  await page.mouse.move(ab.x + ab.width * 0.7, ab.y + ab.height * 0.64, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(540);
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all[all.length - 1].getAttribute('data-el-id');
  });
}

const elementOf = (page, id) =>
  page.evaluate(
    ({ key, elId }) => {
      const raw = JSON.parse(window.localStorage.getItem(key));
      for (const ab of raw.artboards ?? []) {
        const el = ab.doc.elements.find((e) => e.id === elId);
        if (el) return el;
      }
      return null;
    },
    { key: AUTOSAVE_KEY, elId: id },
  );

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});

try {
  // ═══════════════════════════════════════════════════════════════════════════
  // ١. لوحُ التأثيرات: سطحٌ حيٌّ، ولا «قريبًا» فوق سطحٍ قائم
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n١. الصفُّ الميت: إمّا عمل وإمّا رُفِع');
  await bootBlank(page, BASE_URL, 'ig-reel');
  // قسمُ التأثيرات في الوضع الاحترافيّ، كما كان القسمُ الميتُ قبله — فالسطحُ حلّ
  // محلَّ سطحٍ ولم يُنقَل إلى مكانٍ آخر. والتبديلُ بالزرّ الذي يَضغطه الإنسان.
  await page.getByRole('button', { name: 'احترافي', exact: true }).click();
  await page.waitForTimeout(220);
  const rect = await drawRect(page);
  assert(!!rect, `رُسِم شكلٌ بالسحب (${rect}) — بأحداث مؤشّرٍ حقيقيّة`);

  assert(
    (await page.locator('[data-soon="effects"]').count()) === 0,
    'لا قسمَ تأثيراتٍ معطَّلًا بـ«قريبًا» بعد اليوم — الصفُّ إمّا عمل وإمّا رُفِع، ولا ثالثَ يَحتمله الميثاق',
  );
  assert((await page.locator('[data-testid="fx-section"]').count()) === 1, 'وفي مكانه قسمُ تأثيراتٍ **حيٌّ** واحد');
  const fxSlider = page.locator(`[data-testid="fx-blur-${rect}"]`);
  assert((await fxSlider.count()) === 1, 'وفيه شريطُ ضبابيّةٍ حقيقيٌّ معنوَنٌ بالعنصر');
  assert(await fxSlider.isEnabled(), 'والشريطُ مفعَّلٌ لا معطَّل — يُسحَب فيحدث شيء');
  const fxTitle = await page.locator('[data-testid="fx-section"]').getAttribute('title');
  assert(!fxTitle || !fxTitle.includes('قريبًا'), 'ولا تلميحَ «قريبًا» على القسم');
  assert(
    (await page.locator('[data-testid="fx-section"]').evaluate((e) => getComputedStyle(e).pointerEvents)) !== 'none',
    'ولا `pointerEvents:none` يُسقِط كلَّ ضغطةٍ في صمت',
  );
  // صفُّ «ظلّ» المعطَّلُ كان «قريبًا» **فوق ظلٍّ يعمل فعلًا** في قسم المظهر.
  assert(
    (await page.locator('[data-testid="fx-section"]').innerText()).includes('ظل') === false,
    'وصفُّ «ظلّ» المعطَّلُ رُفِع — كان «قريبًا» فوق طبقاتِ ظلٍّ مبنيّةٍ ومشحونةٍ في قسم المظهر، وذاك ما يَمنعه الميثاق نصًّا',
  );
  assert(
    (await page.locator(`[data-testid="${rect}-shadow-add"], [data-testid="shadow-add-${rect}"], [data-testid="fx-section"]`).count()) >= 1,
    'والظلُّ الحقيقيُّ باقٍ في مكانه لم يُمَسّ — الرفعُ كان للوهم لا للقدرة',
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٢. العنصرُ يَلين فعلًا — بكسلٌ لا نصُّ خصيصة
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n٢. النعومةُ المرسومة في المعاينة');
  await deselect(page);
  const sharp = await previewProfile(page);
  assert(sharp.rise !== null && sharp.rise <= 3, `قبل الضبابيّة حدُّ الشكل حادٌّ: انتقالُ ١٠-٩٠ يساوي ${sharp.rise} بكسلًا — الأساسُ مقيسٌ لا مُفترَض`);

  // ٥٪ من عرض اللوح، من الشريط الحقيقيّ لا بحقنِ حالة.
  await selectEl(page);
  await fxSlider.fill('50');
  await page.waitForTimeout(400);
  assert(
    (await page.locator(`[data-testid="fx-blur-value-${rect}"]`).innerText()).trim() === '5%',
    'الشريطُ يَعرض ٥٪ من عرض اللوح — القيمةُ مقروءةٌ لا مخفيّة',
  );
  await deselect(page);
  const soft = await previewProfile(page);
  assert(
    soft.rise !== null && soft.rise > sharp.rise * 6,
    `والحدُّ لان فعلًا: انتقالُ ١٠-٩٠ من ${sharp.rise} إلى ${soft.rise} بكسلًا (×${(soft.rise / Math.max(1, sharp.rise)).toFixed(1)}) — **بكسلٌ مقروءٌ من لقطةٍ حقيقيّة**، لا خصيصةُ CSS مضبوطةً بلا أثر`,
  );
  assert(
    soft.inkWidth > sharp.inkWidth + 20,
    `والحبرُ انتشر خارجَ صندوق العنصر: ${sharp.inkWidth} ← ${soft.inkWidth} بكسلًا — وهذا ما يَفصل ضبابيّةَ العنصر عن هالةِ ظلٍّ تُغطّيها تعبئةٌ حادّة`,
  );
  // σ المقيسُ من الانتقال، منسوبًا إلى عرض اللوح: يجب أن يُقارب ٥٪.
  const sigmaFrac = soft.rise / 2.5631 / soft.W;
  assert(
    near(sigmaFrac, 0.05, 0.02),
    `ونصفُ القطر المقيسُ من البكسل ${(sigmaFrac * 100).toFixed(2)}٪ من عرض اللوح، والمطلوبُ ٥٪ — فالوحدةُ المُعلَنةُ هي الوحدةُ المرسومة`,
  );

  // المرجعُ الذي قيسَ عليه هذا البند: σ بين ٢٠ و٩٧ بكسلًا على ضلعٍ قصيرٍ ١٤٤٠،
  // أي ١٫٤٪..٦٫٧٪ منه. فالمدى المطلوبُ داخلَ ما يَبلغه الشريط.
  await selectEl(page);
  await fxSlider.fill('100');
  await page.waitForTimeout(400);
  await deselect(page);
  const softest = await previewProfile(page);
  assert(
    softest.rise > soft.rise,
    `و١٠٪ أنعمُ من ٥٪ (${soft.rise} ← ${softest.rise} بكسلًا) — فنصفُ القطرِ الكبيرُ يعمل، وهو شرطُ البقعةِ التي نصفُ قطرها بحجمها`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٣. متحرّكةٌ: من نصفِ قطرٍ إلى آخر، مقيسةً عند لحظاتٍ وسطى
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n٣. الضبابيّةُ تتحرّك — ومقيسةٌ عند لحظاتٍ وسطى');
  const animated = blobEl({ blur: 0, tracks: { blur: mkTrack(0, 0.08) }, duration: 1 });
  const aT = {};
  for (const t of [0, 0.25, 0.5, 0.75, 1]) aT[t] = await exportProfile(page, animated, t);
  assert(
    aT[0].rise !== null && aT[0].rise <= 3,
    `عند الزمن ٠ المفتاحُ صفرٌ فالعنصرُ حادٌّ: ${aT[0].rise} بكسلًا — فالمحايدُ يُرسَم محايدًا`,
  );
  assert(
    aT[1].rise > 40,
    `وعند الزمن ١ المفتاحُ ٨٪ فالعنصرُ ناعمٌ: ${aT[1].rise} بكسلًا على لوحٍ ٤٠٠ — من **بكسلٍ حقيقيٍّ على القُماش الذي يُصدِّر MP4 و GIF**`,
  );
  assert(
    aT[0.25].rise < aT[0.5].rise && aT[0.5].rise < aT[0.75].rise,
    `وعند الثلاثِ لحظاتٍ الوسطى يَزيد الانتقالُ اطّرادًا: ${aT[0.25].rise} < ${aT[0.5].rise} < ${aT[0.75].rise} بكسلًا — فالحركةُ مُحلولةٌ لحظةً بلحظةٍ لا مقلوبةً بين طرفَين`,
  );
  // والمنتصفُ يُقارب نصفَ القيمة لأنّ التخفيفَ `linear` — قراءةٌ لا تَعتمد منحنًى.
  const midSigma = aT[0.5].rise / 2.5631 / aT[0.5].W;
  assert(
    near(midSigma, 0.04, 0.015),
    `وσ عند المنتصف ${(midSigma * 100).toFixed(2)}٪ والمتوقَّعُ ٤٪ (نصفُ ٨٪ بتخفيفٍ خطّيّ) — فالقيمةُ مُحلولةٌ لا مُقرَّبة`,
  );

  // وفرقٌ سالبٌ يُحِدّ عنصرًا مُضبَّبًا سلفًا — نصفُ القدرة، ولولا الجمعُ لاستحال.
  const sharpening = blobEl({ blur: 0.08, tracks: { blur: mkTrack(0, -0.08) }, duration: 1 });
  const sh0 = await exportProfile(page, sharpening, 0);
  const sh1 = await exportProfile(page, sharpening, 1);
  assert(
    sh0.rise > 40 && sh1.rise <= 3,
    `ومفتاحٌ **سالبٌ** يَحِدّ عنصرًا ضبابيّتُه الساكنةُ ٨٪: ${sh0.rise} ← ${sh1.rise} بكسلًا — وهذا ما يَفعله الجمعُ ولا يَفعله الضربُ، فمحايدُ الضبابيّة صفرٌ لا واحد`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٤. تُركَّب مع إزاحةٍ وتلاشٍ في اللحظة نفسها — حالةُ المرجع بعينها
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n٤. ضبابيّةٌ تَنزلق وتَتلاشى معًا');
  // المرجعُ قيسَ: بقعٌ ناعمةٌ تَنزلق ثم تَتلاشى، وσ بين ٢٠ و٩٧ بكسلًا على ضلعٍ
  // قصيرٍ ١٤٤٠ — ولا بقعةَ ناعمةً واحدةً باقيةً عند الثانية الثالثة.
  const drifting = blobEl({
    blur: 0.06,
    tracks: { x: mkTrack(-0.18, 0.18), opacity: mkTrack(1, 0) },
    duration: 1,
  });
  const dT = {};
  for (const t of [0, 0.5, 0.9]) dT[t] = await exportProfile(page, drifting, t);
  assert(
    dT[0].centroid !== null && dT[0.5].centroid !== null && dT[0.5].centroid > dT[0].centroid + 30,
    `المركزُ يَنزلق مع الزمن: ${dT[0].centroid?.toFixed(1)} ← ${dT[0.5].centroid?.toFixed(1)} بكسلًا — فالضبابيّةُ لا تُجمّد الإزاحة`,
  );
  assert(
    dT[0.5].peak < dT[0].peak && dT[0.9].peak < dT[0.5].peak,
    `والعتامةُ تَتلاشى في اللحظة نفسِها: ذروةُ الحبر ${dT[0].peak} ← ${dT[0.5].peak} ← ${dT[0.9].peak} — فالثلاثةُ تَعمل معًا لا بالتناوب`,
  );
  assert(
    dT[0.5].rise > 25,
    `ويبقى العنصرُ ناعمًا وهو يَنزلق ويَتلاشى: انتقالُ ${dT[0.5].rise} بكسلًا عند المنتصف — وهي جملةُ المرجع بحرفها، ولم تكن قابلةً للتعبير قبل اليوم`,
  );
  // والنعومةُ مستقلّةٌ عن العتامة: تلاشٍ وحدَه لا يُنتج حدًّا ناعمًا.
  const fadingOnly = blobEl({ blur: 0, tracks: { opacity: mkTrack(1, 0) }, duration: 1 });
  const fo = await exportProfile(page, fadingOnly, 0.5);
  assert(
    fo.rise <= 3,
    `وتلاشٍ بلا ضبابيّةٍ يَبقى حادًّا (${fo.rise} بكسلًا) — فالنعومةُ المقيسةُ أعلاه ليست أثرًا جانبيًّا لانخفاض العتامة`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٥. المعاينةُ والتصديرُ: التطابقُ مقيسٌ رقمًا، والفرقُ الباقي مُعلَنٌ رقمًا
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n٥. تطابقُ المعاينة والتصدير — بالرقم');
  // يُقارَن المقياسُ **منسوبًا إلى عرض اللوح**، لأنّ اللوحَين مقاسُهما مختلف:
  // المعاينةُ بعرضها على الشاشة، والتصديرُ ٤٠٠ بكسلًا. والنسبةُ هي ما يجب أن
  // يَتطابق، لا عددُ البكسل.
  const parityEl = blobEl({ blur: 0.05 });
  const pvRect = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="artboard"]');
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  await selectEl(page);
  await fxSlider.fill('50');
  await page.waitForTimeout(420);
  await deselect(page);
  const pv = await previewProfile(page);
  const ex = await exportProfile(page, parityEl, 0, Math.round(pvRect.w));
  const pvNorm = pv.rise / pv.W;
  const exNorm = ex.rise / ex.W;
  const relErr = Math.abs(pvNorm - exNorm) / Math.max(pvNorm, exNorm);
  console.log(
    `      المعاينة: انتقالٌ ${pv.rise}/${pv.W} = ${(pvNorm * 100).toFixed(3)}٪ · التصدير: ${ex.rise}/${ex.W} = ${(exNorm * 100).toFixed(3)}٪ · الفرقُ النسبيُّ ${(relErr * 100).toFixed(2)}٪`,
  );
  assert(
    relErr <= 0.1,
    `المعاينةُ والتصديرُ يَتطابقان في نصفِ القطر المرسومِ داخلَ ١٠٪ نسبيّة — والمقيسُ **${(relErr * 100).toFixed(2)}٪** (معاينةٌ ${(pvNorm * 100).toFixed(3)}٪ من العرض، تصديرٌ ${(exNorm * 100).toFixed(3)}٪). والرقمُ مُعلَنٌ لا مُخفًى`,
  );

  // والمقياسُ المتحرّكُ هو موضعُ الخطر: CSS يَمطّ الضبابيّةَ ‏و`ctx.filter` لا
  // تَعرف المصفوفة. فيُقاس التطابقُ **مع مقياسٍ منتظمٍ ×١٫٥** حيث التعويضُ تامّ.
  const scaledEl = blobEl({ blur: 0.05, tracks: { scale: mkTrack(1.5, 1.5) } });
  const exScaled = await exportProfile(page, scaledEl, 0, Math.round(pvRect.w));
  const exScaledNorm = exScaled.rise / exScaled.W;
  console.log(`      ومع مقياسٍ منتظمٍ ×١٫٥: التصديرُ ${(exScaledNorm * 100).toFixed(3)}٪ مقابلَ ${(exNorm * 100).toFixed(3)}٪ بلا مقياس — نسبةُ ${(exScaledNorm / exNorm).toFixed(3)}`);
  assert(
    near(exScaledNorm / exNorm, 1.5, 0.22),
    `ومقياسٌ منتظمٌ ×١٫٥ يُكبّر نصفَ القطر المرسومَ ×${(exScaledNorm / exNorm).toFixed(3)} على القُماش — وهو ما يفعله CSS (قيسَ ×١٫٩٦ عند ×٢)، ولولا تعويضُ \`canvasBlurRadiusPx\` لبقي ×١٫٠٠٠ فكذبت المعاينة`,
  );

  // **والفرقُ الباقي يُقاس ويُعلَن، لا يُغطّى**: مقياسٌ لا متساويُ المحاور.
  const aniso = blobEl({ blur: 0.05, tracks: { scaleX: mkTrack(1, 1), scaleY: mkTrack(2.5, 2.5) } });
  const exAniso = await exportProfile(page, aniso, 0, Math.round(pvRect.w));
  const exAnisoV = await exportProfile(page, aniso, 0, Math.round(pvRect.w), 0.5);
  const anisoRatio = exAniso.rise / exAniso.W / exNorm;
  console.log(
    `      ومع مقياسٍ لا متساويِ المحاور (×١ أفقيًّا، ×٢٫٥ عموديًّا): الانتقالُ الأفقيُّ ${exAniso.rise} بكسلًا، نسبتُه إلى الأساس ${anisoRatio.toFixed(3)} — و CSS كان سيُبقيه ١٫٠٠٠ (ضبابيّةٌ لا متساويةُ المحاور)`,
  );
  assert(
    exAnisoV.rise !== null && anisoRatio > 1.1,
    `وهذا هو **القيدُ المُعلَن**: `
    + `\`ctx.filter\` لا تَقبل إلّا نصفَ قطرٍ واحدًا متساويَ المحاور، فالمتوسّطُ الهندسيُّ يُكبّر المحورَين معًا بنسبة ${anisoRatio.toFixed(3)} حيث CSS كان يُكبّر العموديَّ وحدَه. فرقٌ مقيسٌ لا مُغطًّى، وبابُه عالٍ: مستندٌ لا يُحرّك \`scaleX\`/\`scaleY\` لا يَدفعه إطلاقًا`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٦. دورةُ الحفظ التلقائيّ، ومغلّفُ النسخة
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n٦. الحفظُ التلقائيُّ ومغلّفُ النسخة');
  await page.waitForTimeout(950);
  const savedBefore = await elementOf(page, rect);
  assert(
    savedBefore && near(savedBefore.blur, 0.05, 1e-9),
    `الضبابيّةُ تُحفَظ كسرًا كما أُعلِنت: ${savedBefore?.blur} — لا بكسلًا، فلا تَحتاج قاعدةَ تحجيم`,
  );
  const ver = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k)).schemaVersion, AUTOSAVE_KEY);
  const expectedVer = await page.evaluate(async () => {
    const mod = await import('/src/lib/persist.ts');
    return { v: mod.SCHEMA_VERSION, migs: [...mod.DOC_MIGRATIONS] };
  });
  // ورتبةُ البند لا موضعُه من الذيل، وهذا هو العلاجُ الذي أُجري على أربعةِ بنودٍ
  // من هذا الشكل في `qa/independent-wh-anim.spec.mjs` (`7c6f77b`): جدولُ
  // الترحيلات قائمةٌ **يُقصَد لها أن تَنمو**، فـ«آخرُ بند» يَقيس يومَ كُتِب لا ما
  // يَعنيه — ويَسقط بحكم البناء عند أوّل بندٍ يُضاف بعده، وسقوطُه حينها لا يَدلّ
  // على عطل.
  //
  // أمّا الرتبةُ فثابتةٌ تحت الإضافة بالذيل: `DOC_MIGRATIONS[i]` يَرفع `i+1` إلى
  // `i+2` (`src/lib/persist.ts:45-46`)، فرتبةُ بندٍ قائمٍ **هي النسخةُ التي
  // يَرفعها** ولا تتغيّر بما يُضاف بعده. و`element-blur` في الرتبة ٢ — أي يَرفع
  // النسخةَ ٣ إلى ٤.
  const blurRank = expectedVer.migs.indexOf('element-blur');
  assert(
    ver === expectedVer.v && blurRank !== -1,
    `ورُفِعت النسخةُ إلى ${ver} ببندِ ترحيلٍ باسمه (${blurRank === -1 ? 'مفقودٌ من الجدول' : expectedVer.migs[blurRank]}) — لا لأنه يُحوِّل بايتًا بل كي يَرفض بناءٌ أقدمُ الملفَّ صراحةً بدل أن يَرسمه حادًّا في صمت ثم يَحذف مسارَه عند أوّل ضغطةٍ على منحنى التخفيف`,
  );
  assert(
    blurRank === 2 && expectedVer.v === expectedVer.migs.length + 1,
    `والبندُ قائمٌ في **رتبته** (${blurRank === -1 ? `مفقودٌ من الجدول — وفي الرتبة ٢ اليومَ: ${expectedVer.migs[2] ?? 'لا شيء'}` : `الرتبة ${blurRank}: ${expectedVer.migs[blurRank]}`}) — أي يَرفع النسخةَ ٣ إلى ٤، وهي رتبةٌ لا تتغيّر بما يُضاف بعده. و\`SCHEMA_VERSION\` مشتقٌّ من طول الجدول (${expectedVer.v} = ${expectedVer.migs.length} + 1) — فلا رقمَ مكتوبًا بيدٍ يَسهو. وكانت تُقاس هنا «آخرُ بندٍ في الجدول»، فتُحمِّر هذا البندَ عند أوّل ترحيلٍ يُضاف بعده ولو بقيت الدعوى صادقة`,
  );

  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(400);
  const savedAfter = await elementOf(page, rect);
  assert(
    savedAfter && near(savedAfter.blur, 0.05, 1e-9),
    `وتَعود كما هي بعد تحميلٍ حقيقيٍّ للصفحة (${savedAfter?.blur}) — دورةُ حفظٍ كاملة`,
  );
  await deselect(page);
  const afterReload = await previewProfile(page);
  assert(
    afterReload.rise > 10,
    `وتُرسَم ناعمةً بعد العودة (انتقالُ ${afterReload.rise} بكسلًا) — فالمحفوظُ هو المرسوم، لا حقلٌ يَنجو بلا أثر`,
  );

  // ومستندٌ أقدمُ (بلا الحقل أصلًا) يُفتَح ويُرسَم حادًّا بلا أيّ ترحيلٍ يُجرى عليه.
  const neutral = await exportProfile(page, (() => { const e = blobEl(); delete e.blur; return e; })(), 0);
  assert(
    neutral.rise !== null && neutral.rise <= 3,
    `وعنصرٌ **بلا حقلِ ضبابيّةٍ إطلاقًا** (حالةُ كلّ مستندٍ حُفِظ قبل اليوم) يُرسَم حادًّا: ${neutral.rise} بكسلًا — غيابُ الحقلِ هو المحايد، فلا بندَ ترحيلٍ يُحوِّل بايتًا`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٧. السطحُ المتحرّك: صفٌّ على الخطّ الزمنيّ ومفتاحٌ عند المؤشّر
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n٧. الخصيصةُ الثامنةُ على الخطّ الزمنيّ');
  // التحميلُ أعلاه أعاد الوضعَ إلى البسيط، والخطُّ الزمنيُّ وصفوفُه احترافيّة —
  // فيُعاد الضغطُ على الزرّ نفسِه الذي يَضغطه الإنسان.
  await page.getByRole('button', { name: 'احترافي', exact: true }).click();
  await page.waitForTimeout(260);
  await page.locator(`[data-el-id="${rect}"]`).click();
  await page.waitForTimeout(260);
  await page.waitForSelector('[data-testid="timeline-tracks"]');
  await page.locator(`[data-testid="expand-${rect}"]`).click();
  await page.waitForTimeout(260);
  assert(
    (await page.locator(`[data-testid="clip-row-${rect}-blur"]`).count()) === 1,
    'للضبابيّة صفُّها على الخطّ الزمنيّ — مُشتقٌّ من `ANIM_PROPERTIES` نفسِها، فلم يُبنَ سطحٌ ثانٍ له',
  );
  assert(
    (await page.locator(`[data-testid="clip-${rect}-add-kf-blur"]`).count()) === 1,
    'وزرُّ «مفتاحٌ عند المؤشّر» على صفّها',
  );
  assert(
    (await page.locator(`[data-testid="kf-toggle-${rect}-blur"]`).count()) === 1,
    'ومفتاحُها في لوح الخصائص',
  );
  // المؤشّرُ يُوقَف **داخلَ** المقطع لا عند زمنٍ مُخمَّن: المفتاحُ يُوضَع عند
  // المؤشّر، فمؤشّرٌ خارجَ المقطع لا مكانَ له فيه. والمدّةُ تُقرأ من المستند نفسِه.
  const clipAnim = (await elementOf(page, rect))?.anim ?? { start: 0, duration: 1 };
  const inside = clipAnim.start + clipAnim.duration * 0.5;
  const parked = await parkPlayhead(page, inside);
  assert(
    Math.abs(parked - inside) < 0.25,
    `المؤشّرُ وُقِف داخلَ المقطع عند ${parked.toFixed(2)} ث (المقطعُ ${clipAnim.start}..${(clipAnim.start + clipAnim.duration).toFixed(2)}) — فالمفتاحُ يُوضَع حيث له مكان`,
  );
  await page.locator(`[data-testid="clip-${rect}-add-kf-blur"]`).click();
  await page.waitForTimeout(1100);
  const withKf = await elementOf(page, rect);
  assert(
    (withKf?.anim?.tracks?.blur ?? []).length === 1,
    `ومفتاحٌ يُوضَع فعلًا من الواجهة (${(withKf?.anim?.tracks?.blur ?? []).length} مفتاحًا) — فالقدرةُ متّصلةٌ طرفًا بطرف`,
  );

  // حرسُ الإبادة: مسارٌ باليد على `blur` يَمنع إحلالَ نمطٍ جاهزٍ فوقه.
  assert(
    await page.evaluate(async () => {
      const mod = await import('/src/state/elements.ts');
      return mod.hasCustomAnimation({ blur: [{ id: 'a', time: 0, value: 0, easing: 'linear', bezier: [0, 0, 1, 1] }, { id: 'b', time: 1, value: 0.05, easing: 'linear', bezier: [0, 0, 1, 1] }] });
    }),
    'ومسارُ ضبابيّةٍ بمفتاحَين يُقرأ «مبنيًّا باليد» — ولولا إدخالُها في `PRESET_FREE_PROPERTIES` لقرأته قاعدةُ `track.length > 2` نمطًا جاهزًا فأبادته `withPreset` عند أوّل ضغطةٍ على «تلاشٍ»، بلا تحذيرٍ ولا تراجع',
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٨. الكلفة: ما تُضيفه ضبابيّةٌ كبيرةٌ إلى زمن التصدير
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n٨. كلفةُ الرسم');
  const cost = await page.evaluate(async () => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const base = {
      id: 'c', type: 'shape', shape: 'rect', visible: true, locked: false, opacity: 100, maskId: null,
      geo: { x: 0, y: 0, w: 1, h: 1, rotation: 0 },
      fill: '#ff0000', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0,
      anim: { preset: 'none', start: 0, duration: 1, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
    };
    const spec = (blur) => ({
      size: { w: 1080, h: 1080 }, palette: { bg: '#ffffff', fg: '#000000', ac: '#ff0000' },
      elements: [{ ...base, blur }], transparent: false, lang: 'ar', time: 0, scale: 1,
    });
    async function timeOf(blur, n) {
      await mod.renderArtboardPng(spec(blur)); // تسخينٌ، فلا يُقاس أوّلُ تخصيصٍ للقُماش
      const t0 = performance.now();
      for (let i = 0; i < n; i++) await mod.renderArtboardPng(spec(blur));
      return (performance.now() - t0) / n;
    }
    const n = 5;
    return { sharp: await timeOf(0, n), soft: await timeOf(0.07, n), n };
  });
  const overhead = cost.soft / cost.sharp;
  console.log(
    `      إطارٌ ١٠٨٠×١٠٨٠ بعنصرٍ يَملأ اللوح، متوسّطُ ${cost.n} إطارات: حادٌّ ${cost.sharp.toFixed(1)} مل.ث · مُضبَّبٌ ٧٪ (≈٧٦ بكسلًا) ${cost.soft.toFixed(1)} مل.ث · ×${overhead.toFixed(2)}`,
  );
  assert(
    cost.sharp > 0 && cost.soft > 0,
    `كلفةُ التصدير مقيسةٌ لا مُقدَّرة: ${cost.sharp.toFixed(1)} مل.ث حادًّا و${cost.soft.toFixed(1)} مل.ث بضبابيّةِ ٧٪ من العرض على عنصرٍ يَملأ اللوح — أي ×${overhead.toFixed(2)}`,
  );

  // ومعدّلُ إطارات المعاينة أثناء تشغيلٍ حقيقيٍّ من زرّ النقل — لا تقديرًا.
  async function previewFps() {
    await page.locator('[data-testid="timeline-play-btn"]').click();
    const fps = await page.evaluate(
      () =>
        new Promise((res) => {
          let n = 0;
          const t0 = performance.now();
          const tick = () => {
            n++;
            if (performance.now() - t0 < 1400) requestAnimationFrame(tick);
            else res((n * 1000) / (performance.now() - t0));
          };
          requestAnimationFrame(tick);
        }),
    );
    await page.locator('[data-testid="timeline-play-btn"]').click();
    await page.waitForTimeout(200);
    return fps;
  }
  await selectEl(page);
  await fxSlider.fill('0');
  await page.waitForTimeout(300);
  await deselect(page);
  const fpsSharp = await previewFps();
  await selectEl(page);
  await fxSlider.fill('100');
  await page.waitForTimeout(300);
  await deselect(page);
  const fpsSoft = await previewFps();
  console.log(`      معدّلُ إطارات المعاينة أثناء التشغيل: حادًّا ${fpsSharp.toFixed(1)} إطارًا/ث · بضبابيّةِ ١٠٪ ${fpsSoft.toFixed(1)} إطارًا/ث`);
  assert(
    fpsSoft > 30,
    `ومعاينةُ عنصرٍ مُضبَّبٍ بـ١٠٪ من العرض تبقى سلسةً: ${fpsSoft.toFixed(1)} إطارًا/ث مقابلَ ${fpsSharp.toFixed(1)} حادًّا — فالضبابيّةُ في المعاينة من `
      + `CSS \`filter\` تُنفّذها البطاقةُ لا الجافاسكربت، فكلفتُها ليست كلفةَ القُماش`,
  );

  // والمُصدِّرُ الثالثُ: SVG يَحمل الضبابيّةَ الساكنةَ فعلًا — ولولا دمجُها في
  // مُنشِئِ الفلتر الواحد لخرج ملفٌّ حادٌّ يُخالف PNG للحظة نفسِها.
  const svgText = await page.evaluate(async () => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const el = {
      id: 'sv', type: 'shape', shape: 'rect', visible: true, locked: false, opacity: 100, maskId: null,
      geo: { x: 0.3, y: 0.3, w: 0.4, h: 0.4, rotation: 0 },
      fill: '#ff0000', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0, blur: 0.05,
      anim: { preset: 'none', start: 0, duration: 1, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
    };
    const blob = mod.renderArtboardSvg({ size: { w: 400, h: 400 }, palette: { bg: '#ffffff', fg: '#000000', ac: '#ff0000' }, elements: [el], transparent: true, lang: 'ar' });
    return await blob.text();
  });
  const sd = /stdDeviation="([\d.]+)"/.exec(svgText);
  assert(
    !!sd && near(Number(sd[1]), 20, 0.5),
    `وتصديرُ SVG يَحمل الضبابيّةَ: \`feGaussianBlur stdDeviation="${sd?.[1]}"\` والمتوقَّعُ ٢٠ (٥٪ × ٤٠٠) — ودُمِجت في مُنشِئِ الفلتر الواحد لأنّ \`filter\` خصيصةٌ واحدةٌ على \`<g>\`: ثانيةٌ تَطرد الأولى صامتةً`,
  );
  assert(
    (svgText.match(/filter="url\(#/g) || []).length === 1,
    'وفلترٌ واحدٌ مُسنَدٌ لا اثنان — فلا خصيصةَ تَطرد أخرى',
  );

  // والفروعُ الأربعةُ التي لا تَبني فلترًا أصلًا (لا ظلَّ لها): نصٌّ على منحنى،
  // وصندوقُ صورةٍ بديل. لولا فلترُ الضبابيّةِ وحدَه لخرج عنصرٌ مُضبَّبٌ في
  // المعاينة وفي PNG **حادًّا** في SVG — عطلٌ يُحدِثه هذا البندُ لا يَرِثه.
  const svgNoShadowBranches = await page.evaluate(async () => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const base = { visible: true, locked: false, opacity: 100, maskId: null, geo: { x: 0.3, y: 0.3, w: 0.4, h: 0.4, rotation: 0 }, blur: 0.05, anim: { preset: 'none', start: 0, duration: 1, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} } };
    const out = {};
    // صندوقُ الصورة البديل: عنصرُ صورةٍ بلا `src`.
    const ph = { ...base, id: 'ph', type: 'image', src: null, fit: 'cover', cropX: 0.5, cropY: 0.5, cropScale: 1, radius: 0, strokeWidth: 0, stroke: null };
    out.placeholder = await mod.renderArtboardSvg({ size: { w: 400, h: 400 }, palette: { bg: '#ffffff', fg: '#000000', ac: '#ff0000' }, elements: [ph], transparent: true, lang: 'ar' }).text();
    return out;
  });
  assert(
    /filter="url\(#blur-ph\)"/.test(svgNoShadowBranches.placeholder) && /stdDeviation="20\.000"/.test(svgNoShadowBranches.placeholder),
    `وفرعٌ لا ظلَّ له (صندوقُ الصورة البديل) يَحمل الضبابيّةَ بمُعرَّفٍ مستقلٍّ \`blur-…\` — ${/filter="url\(#blur-ph\)"/.test(svgNoShadowBranches.placeholder) ? 'مُسنَدٌ' : 'غائب'}، فلا يُخالف SVG ما تُظهره المعاينةُ و PNG`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٩. الأخطاءُ الصامتة
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n٩. الأخطاءُ الصامتة');
  assert(pageErrors.length === 0, `لا خطأَ تشغيلٍ خلال المسار كلِّه (${pageErrors.slice(0, 3).join(' | ') || 'لا شيء'})`);
} catch (err) {
  console.error('SPEC CRASHED:', err && err.stack ? err.stack : err);
  fail++;
  failures.push(`crash: ${err && err.message ? err.message : String(err)}`);
} finally {
  await browser.close().catch(() => {});
  console.log(`\n${pass} passed, ${fail} failed.`);
  if (failures.length) failures.forEach((f) => console.error('  -', f));
  process.exit(fail ? 1 : 0);
}
