#!/usr/bin/env node
// حركةٌ مستقلّةٌ للعرض والارتفاع: `scaleX` و`scaleY` إلى جانب `scale` المنتظم.
//
// ═══════════════════════════════════════════════════════════════════════════
// ما الذي كان ناقصًا، ولماذا هذا الشكل بعينه
// ═══════════════════════════════════════════════════════════════════════════
// `AnimProperty` كان خمسةً مغلقة، و`scale` فيها **منتظمٌ بحرفه**:
// `resolveAnimAt` تُعيد رقمًا واحدًا، و`entranceStyleAt` تُنبعِثه `scale(S)`،
// و`exportArtboard.ts` تُنادي `ctx.scale(s, s)`. فعرضٌ ينقص وارتفاعٌ يزيد **في
// اللحظة نفسها** لا عبارةَ له في النموذج أصلًا.
//
// والشكلُ المُختار **معاملانِ لكلّ محور** لا عرضٌ وارتفاعٌ مطلقان. والذي حسمه
// ثلاثُ قراءاتٍ في الكود لا رأيٌ:
//
//   (أ) `ANIM_PROPERTY_DEFAULT` هي `Record<AnimProperty, number>`
//       (`src/state/elements.ts:45`) — **رقمٌ محايدٌ واحدٌ لكلّ خصيصة، لا يعرف
//       العنصر**. وللمعامل هذا الرقم `1`. وأمّا العرضُ المطلق فمحايدُه
//       `el.geo.w` — قيمةٌ لكلّ عنصرٍ قيمة، فلا تدخل هذا الجدول. وإدخالُها
//       يَفرض على `resolveAnimAt` أن تأخذ العنصرَ لا `anim` وحده، فيتغيّر
//       توقيعُها ومعه مسارُ التصدير و`resolvePropertyAt` و`keyframeAt`.
//
//   (ب) **قياسُ النصّ مشتقٌّ من `geo.w`/`geo.h`**: لفُّ الأسطر
//       (`exportArtboard.ts:566`, `wrapLines(ctx, el.text, bw)` حيث
//       `bw = el.geo.w * w`)، والتسطيرُ بالكشيدة (`:567`)، والمحاذاةُ العموديّة
//       من `bh` (`:568-575`)، و`JustifiedTextView` تَضع `el.geo.w` في قائمة
//       تبعيّات أثرها (`ElementView.tsx:135`). فعرضٌ متحرّكٌ يُعيد **لفَّ النصّ
//       وتشكيلَه** كلَّ إطار — وهو شيءٌ آخر غير «اسحب الصندوقَ عرضًا».
//
//   (ج) `PropertyKeyframe.value` رقمٌ واحد (`elements.ts:71-77`). فخصيصةٌ ذات
//       مركّبَين لا تُعبَّر في هذا التمثيل إلا مسارَين — وهو ما بُني.
//
// وهو كذلك اختيارُ محرّك حركةٍ مفتوح نفسُه: `transform/scale` مجموعةٌ ثابتة
// (`GroupKind::Plain`) تُطبَّق **بعد كومة التأثيرات**، منفصلةٌ عن
// `contents/rect#2/size` (`docs/re-effectcraft-source.md:196`, `:2212-2231`).
// المقياسُ تحويلٌ، والمقاسُ محتوًى، وهما مجموعتان لا واحدة.
//
// ═══════════════════════════════════════════════════════════════════════════
// والعقدُ المرافق: `scale` المنتظم لا يتغيّر — وهو متطابقةٌ جبريّة لا دعوى
// ═══════════════════════════════════════════════════════════════════════════
// المُركَّب `sx = scale × scaleX` و`sy = scale × scaleY`، والمحايدُ `1`. فمستندٌ
// لا يحمل المسارَين يُعطي `sx = sy = scale` **بعينه**. ولذلك تُنبعِث
// `entranceStyleAt` نصًّا ذا مُعامِلٍ واحد `scale(S)` متى `sx === sy`، وذا
// مُعامِلَين `scale(SX, SY)` متى اختلفا: فالنصُّ الواصلُ إلى `style.transform`
// في كلّ مستندٍ قائم **هو نفسُه بايتًا ببايت**، لا «صورةٌ مكافئة».
//
// والبرهانُ في القسم ٤ على ملفٍّ كتبه بناءُ ما قبل التغيير (`eaba2aa`)، لا على
// عيّنةٍ بيدٍ: من كتب العيّنةَ يعرف سلفًا ما يفعله البناءُ الجديد.
//
// التشغيل: QA_PORT=<منفذ حرّ> QA_SPECS=independent-wh-anim npm test
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { AUTOSAVE_KEY, bootBlank, resumeAfterReload } from './helpers/boot.mjs';

const BASE_URL = `http://localhost:${process.env.QA_PORT || '1420'}`;
const HERE = new URL('.', import.meta.url).pathname;

const PRECHANGE_JSON = readFileSync(`${HERE}migration/prechange-scale-autosave.json`, 'utf8');
const PRECHANGE = JSON.parse(readFileSync(`${HERE}migration/prechange-scale-samples.json`, 'utf8'));

// ─────────────────────────────────────────────────────────────────────────────
// ولِمَ يُقرَأ نصُّ `persist.ts` نفسُه، وهو الموضعُ الوحيدُ في الملفّ كلِّه الذي
// يَقرأ مصدرًا كنصّ: الدعوى في القسم ٧ ليست «الرقمُ صحيحٌ اليوم» بل **«الرقمُ
// مشتقٌّ ولا يُكتَب بيد»**، وهذه لا تُقاس من خارج الوحدة أصلًا. فمن كتب
// `SCHEMA_VERSION = 4` بيده يُصادف الصوابَ اليومَ ويَمرّ من كلّ فحصٍ قيميّ، ثم
// يَسهو عند أوّل بندٍ يُضاف. فالطرفان يُقاسان: القيمةُ من الوحدة، والاشتقاقُ من
// التعريف.
const PERSIST_SRC = readFileSync(`${HERE}../src/lib/persist.ts`, 'utf8');

// الخمسُ التي كان عليها `AnimProperty` **مغلقًا** قبل هذا العمل — بأسمائها لا
// بعددها. والدعوى المقيسةُ في القسم ١ أنّ الاتّحادَ **نَما ولم يُستبدَل**:
// الخمسُ باقيةٌ كلُّها، والمحوران زيادةٌ عليها لا واحدٌ منها.
const CLOSED_FIVE = ['opacity', 'x', 'y', 'scale', 'rotation'];

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
// مساعداتٌ مُستعارةٌ بحرفها من `qa/phase2-live-clips.spec.mjs` — قاعدةُ قراءةٍ
// واحدة لا ثانية: المسطرةُ تُعلن مداها في `data-span`، والمؤشّرُ موضعَه في
// `data-t`، فلا يُخمَّن زمنٌ من بكسل.
// ─────────────────────────────────────────────────────────────────────────────
const rulerSpan = (page) => page.locator('[data-testid="timeline-ruler"]').evaluate((e) => Number(e.dataset.span));

async function parkPlayhead(page, seconds) {
  const span = await rulerSpan(page);
  const box = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(box.x + (box.width * seconds) / span + 1, box.y + box.height / 2);
  await page.waitForTimeout(110);
  return page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
}

async function dragBy(page, fromX, y, dx, steps = 18) {
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  await page.mouse.move(fromX + dx, y, { steps });
  await page.mouse.up();
  await page.waitForTimeout(140);
}

/** المستندُ كما حفظه البرنامجُ بنفسه — قراءةٌ لا كتابة. */
async function animOf(page, id) {
  await page.waitForTimeout(950);
  return page.evaluate(
    ({ key, elId }) => {
      const raw = JSON.parse(window.localStorage.getItem(key));
      for (const ab of raw.artboards) {
        const el = ab.doc.elements.find((e) => e.id === elId);
        if (el) return el.anim;
      }
      return null;
    },
    { key: AUTOSAVE_KEY, elId: id },
  );
}

/** **الصندوقُ المرسومُ على الشاشة فعلًا.** `getBoundingClientRect` تَحمل تحويلَ
 * CSS، فهذه هندسةٌ مُصيَّرةٌ لا حقلٌ في الحالة. ولا يُقارَن بالبكسل المطلق أبدًا:
 * اللوحةُ نفسُها مُكبَّرةٌ بتحويل التزويم (`Stage.tsx:850`)، فالمقروءُ **نِسَبٌ**
 * إلى صندوقِ الأساس — وهي كذلك الصيغةُ الوحيدة التي يَصِحّ فيها سؤالُ التحجيم
 * الذكيّ في القسم ٥. */
const paintedBox = async (page, id) => {
  const b = await page.locator(`[data-el-id="${id}"]`).boundingBox();
  return { w: b.width, h: b.height };
};

/** قيمةُ خصيصةٍ واحدة كما تَحُلّها الوحدةُ الإنتاجيّة عند لحظةٍ مطلقة. */
const resolvedAt = (page, elId, time) =>
  page.evaluate(
    async ({ key, i, t }) => {
      const m = await import('/src/lib/animTimeline.ts');
      const raw = JSON.parse(window.localStorage.getItem(key));
      for (const ab of raw.artboards) {
        const el = ab.doc.elements.find((e) => e.id === i);
        if (el) return m.resolveAnimAt(el.anim, t);
      }
      return null;
    },
    { key: AUTOSAVE_KEY, i: elId, t: time },
  );

/** يَضبط قيمةَ المفتاح الواقعِ تحت المؤشّر على صفِّ خصيصةٍ بعينه، من المِمسحة
 * الحقيقيّة في المنبثقة.
 *
 * **والماسةُ تُعنوَن بصفّها لا بمعرّفها وحده**: `tracksFromPreset` تُعطي مفتاحَ
 * العتامة ومفتاحَ المقياس في نمط `pop` المعرّفَ نفسَه
 * (`src/state/elements.ts:161-162`)، فالعنونةُ المطلقة خرقٌ لـ strict mode.
 * مُقاسٌ لا مُفترَض — وقع فعلًا عند التقاط مستند ما قبل التغيير. */
async function setKfValueAtPlayhead(page, elId, property, percent) {
  const row = `[data-testid="clip-row-${elId}-${property}"]`;
  const diamonds = await page.locator(`${row} [data-testid^="kf-${elId}-"]`).all();
  if (!diamonds.length) throw new Error(`no diamond on the ${property} row of ${elId}`);
  // الماسةُ الأخيرةُ على الصفّ هي المُضافةُ لتوّها عند المؤشّر.
  const box = await diamonds[diamonds.length - 1].boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(220);
  const slider = page.locator('[data-testid="kf-value-slider"]');
  if (!(await slider.count())) throw new Error(`no keyframe popover opened on ${property}`);
  await slider.fill(String(percent));
  await page.waitForTimeout(220);
  // تُغلَق المنبثقةُ على جسم المقطع، رُبعًا فيه لا في وسطه حيث تَرقد ماسة.
  const body = await page.locator(`[data-testid="clip-${elId}"]`).boundingBox();
  await page.mouse.click(body.x + body.width * 0.25, body.y + body.height / 2);
  await page.waitForTimeout(200);
}

/** يَرسم مستطيلًا بالسحب — غيرَ مربّعٍ بقصد، فلا يَقرؤه التحجيمُ الذكيُّ أيقونةً
 * مُقفَلةَ النسبة (`aspectLockRatio` في `magicResize.ts:129-139`)، ويبقى سؤالُ
 * القسم ٥ سؤالًا عن الحركة وحدها. */
async function drawRect(page) {
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(340);
  await page.mouse.move(ab.x + ab.width * 0.2, ab.y + ab.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(ab.x + ab.width * 0.68, ab.y + ab.height * 0.48, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(540);
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all[all.length - 1].getAttribute('data-el-id');
  });
}

/** يُنشئ مقطعًا طوله ثلاثُ ثوانٍ بسحب حافّته اليمنى — لا بحقنِ حالة. وثلاثُ ثوانٍ
 * لأنّ مفتاحًا على حافّةٍ يَرقد تحت مِقبض التقليم، فيَلزم مدًى داخليٌّ واسع. */
async function growClipTo(page, id, seconds) {
  const span = await rulerSpan(page);
  const tracks = await page.locator('[data-testid="timeline-tracks"]').boundingBox();
  const pxPerSec = tracks.width / span;
  const cur = (await animOf(page, id)).duration;
  const handle = await page.locator(`[data-testid="clip-${id}-resize-right"]`).boundingBox();
  await dragBy(page, handle.x + handle.width / 2, handle.y + handle.height / 2, (seconds - cur) * pxPerSec, 22);
  return (await animOf(page, id)).duration;
}

/** يَفتح صفوفَ الخصائص ويَضع مفتاحًا على خصيصةٍ عند المؤشّر. */
async function addKfAtPlayhead(page, id, property) {
  await page.locator(`[data-testid="clip-${id}-add-kf-${property}"]`).click();
  await page.waitForTimeout(240);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1700, height: 1050 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ١. التمثيل: خصيصتان جديدتان، ومحايدُهما `1` بالضبط
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n١. التمثيل: `scaleX`/`scaleY` ومحايدُهما');
  await bootBlank(page, BASE_URL, 'ig-portrait');

  const model = await page.evaluate(async () => {
    const e = await import('/src/state/elements.ts');
    const a = await import('/src/lib/animTimeline.ts');
    const bare = { preset: 'none', start: 0, duration: 1, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} };
    const uniform = { ...bare, tracks: { scale: [{ id: 's', time: 0, value: 1.7, easing: 'linear', bezier: [0, 0, 1, 1] }] } };
    return {
      props: [...e.ANIM_PROPERTIES],
      defaults: { ...e.ANIM_PROPERTY_DEFAULT },
      bareVisual: a.resolveAnimAt(bare, 0.5),
      bareCss: a.entranceStyleAt(bare, 0.5),
      uniformCss: a.entranceStyleAt(uniform, 0.5),
      // حرسُ الإبادة: مجرّدُ وجودِ مسارٍ على محورٍ يعني أنّ المصمّم بناه بيده،
      // إذ لا نمطَ جاهزًا يَزرع `scaleX`/`scaleY` أصلًا.
      customByPresence: e.hasCustomAnimation({ scaleX: [{ id: 'a', time: 0, value: 1, easing: 'linear', bezier: [0, 0, 1, 1] }, { id: 'b', time: 1, value: 0.5, easing: 'linear', bezier: [0, 0, 1, 1] }] }),
      presetTracks: Object.keys(e.tracksFromPreset('pop', [{ id: 'k0', t: 0, v: 0 }, { id: 'k1', t: 1, v: 1 }], 'easeOut', [0.42, 0, 0.58, 1], 1)),
    };
  });

  // وطولٌ مطلقٌ (`=== 7`) كان يَقيس يومَ كُتِب لا ما يَعنيه: الاتّحادُ قائمةٌ
  // يُقصَد لها أن تَنمو، فيَسقط البندُ بحكم البناء عند أوّل خصيصةٍ تاليةٍ تُضاف،
  // وسقوطُه حينها لا يَدلّ على عطل. والمقيسُ هنا الدعوى نفسُها في طرفَيها:
  // الخمسُ المغلقةُ كلُّها باقيةٌ بأسمائها، والمحوران **زائدانِ عليها**.
  const propSet = new Set(model.props);
  const beyondFive = model.props.filter((p) => !CLOSED_FIVE.includes(p));
  assert(
    CLOSED_FIVE.every((p) => propSet.has(p)) && beyondFive.includes('scaleX') && beyondFive.includes('scaleY'),
    `\`ANIM_PROPERTIES\` تحمل المحورَين **زيادةً** على الخمس المغلقة التي كانت (${model.props.join(', ')}؛ والزائدُ عليها: ${beyondFive.join(', ') || 'لا شيء'}) — فلا الاتّحادُ خمسةٌ مغلقةٌ لا عبارةَ فيها لعرضٍ وارتفاعٍ مستقلَّين، ولا واحدةٌ من الخمس سقطت ليُفسَح للمحورَين`,
  );
  assert(
    model.defaults.scaleX === 1 && model.defaults.scaleY === 1 && model.defaults.scale === 1,
    `ومحايدُ كلٍّ منهما \`1\` بالضبط (scale=${model.defaults.scale}, scaleX=${model.defaults.scaleX}, scaleY=${model.defaults.scaleY}) — ورقمٌ محايدٌ واحدٌ لا يعرف العنصرَ هو بعينه ما يَجعل المعاملَ يسكن \`Record<AnimProperty, number>\`، ولا يَجعل العرضَ المطلقَ يسكنها`,
  );
  assert(
    model.bareVisual.scaleX === 1 && model.bareVisual.scaleY === 1,
    `و\`anim\` بلا أيّ مسارٍ تَحُلّ إلى (${model.bareVisual.scaleX}, ${model.bareVisual.scaleY}) — فعنصرٌ لم تُمَسّ حركتُه لا يَكتسب تحويلًا`,
  );
  assert(
    model.bareCss.transform === undefined,
    `ولا تُنبعِث نصَّ تحويلٍ أصلًا (${String(model.bareCss.transform)}) — لا \`scale(1, 1)\` ولا \`scale(1)\``,
  );
  assert(
    model.uniformCss.transform === 'scale(1.700)',
    `ومقياسٌ منتظمٌ وحدَه يُنبعَث بمُعامِلٍ **واحد** (\`${model.uniformCss.transform}\`) لا \`scale(1.700, 1.700)\` — وهذا هو عقدُ التوافق في سطرٍ واحد: النصُّ الواصلُ إلى \`style.transform\` في كلّ مستندٍ قائم هو نفسُه بايتًا ببايت`,
  );
  assert(
    model.customByPresence === true,
    'ومسارٌ على محورٍ **بمفتاحَين فقط** يُقرأ «مبنيًّا باليد» (`hasCustomAnimation`) — ولا نمطَ جاهزًا يَزرع المحورَين، فوجودُهما هو الدليل. ولولا هذا البند لكانت ضغطةٌ على «ظهور» تُبيد عملًا باليد في صمت، وهو العطلُ الموصوفُ عند `elements.ts:188-196` بعينه',
  );
  assert(
    !model.presetTracks.includes('scaleX') && !model.presetTracks.includes('scaleY'),
    `ولا نمطَ جاهزًا يَزرعهما فعلًا (\`pop\` تُنتج ${model.presetTracks.join(', ')}) — فالبندُ السابقُ قاعدةٌ لا استثناء`,
  );

  const clamped = await page.evaluate(async () => {
    const m = await import('/src/lib/animTimeline.ts');
    const t = (v) => [{ id: 'k', time: 0, value: v, easing: 'linear', bezier: [0, 0, 1, 1] }];
    const mk = (tracks) => ({ preset: 'none', start: 0, duration: 1, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks });
    return {
      zeroX: m.resolveAnimAt(mk({ scaleX: t(0) }), 0.5),
      bigY: m.resolveAnimAt(mk({ scaleY: t(3) }), 0.5),
    };
  });
  assert(
    clamped.zeroX.scaleX === 0 && clamped.zeroX.scaleY === 1,
    `ومحورٌ عند الصفر يَحُلّ صفرًا والآخرُ يَبقى ١ (${clamped.zeroX.scaleX}, ${clamped.zeroX.scaleY}) — فالمحوران مستقلّان في الحلّ لا مربوطان`,
  );
  assert(clamped.bigY.scaleY === 3, `ولا سقفَ على المعامل (${clamped.bigY.scaleY}) — كما لا سقفَ على \`scale\` اليوم (\`StudioContext.tsx:226-227\`)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // ٢. القدرة من الواجهة: عرضٌ ينقص وارتفاعٌ يزيد **في اللحظة نفسها**
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n٢. عرضٌ ينقص وارتفاعٌ يزيد معًا — مقيسًا على الهندسة المرسومة');
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await bootBlank(page, BASE_URL, 'ig-reel');
  // لا «بسيط/احترافي» منذ ٢٤ أكتوبر ٢٠٢٦ (قرار المالك: «العمق يُطلب ولا يُفرض») — كلّ الأدوات حاضرة.
  await page.waitForTimeout(300);

  const rect = await drawRect(page);
  await page.locator(`[data-testid="expand-${rect}"]`).click();
  await page.waitForTimeout(260);

  const grown = await growClipTo(page, rect, 3);
  assert(near(grown, 3, 0.12), `مقطعٌ طوله ${grown.toFixed(3)}ث، مصنوعٌ بسحب حافّته اليمنى — لا بحقنِ حالة`);

  assert(
    (await page.locator(`[data-testid="clip-row-${rect}-scaleX"]`).count()) === 1 &&
      (await page.locator(`[data-testid="clip-row-${rect}-scaleY"]`).count()) === 1,
    'وللمحورَين صفَّانِ حقيقيّانِ على الخطّ الزمنيّ — مُشتقّانِ من `ANIM_PROPERTIES` لا مُركَّبَين بيدٍ ثانية',
  );
  assert(
    (await page.locator(`[data-testid="kf-toggle-${rect}-scaleX"]`).count()) === 1 &&
      (await page.locator(`[data-testid="kf-toggle-${rect}-scaleY"]`).count()) === 1,
    'ومفتاحا «مفتاحٌ عند المؤشّر» في لوح الخصائص كذلك — السطحُ كلُّه يأتي من الاتّحاد نفسِه',
  );

  // ─── مفتاحا البداية عند حافّة الدخول، بقيمة المحايد ───
  const t0 = await parkPlayhead(page, 0);
  assert(near(t0, 0, 0.04), `المؤشّرُ عند ${t0.toFixed(3)}ث`);
  const base = await paintedBox(page, rect);
  await addKfAtPlayhead(page, rect, 'scaleX');
  await addKfAtPlayhead(page, rect, 'scaleY');

  // ─── ومفتاحا النهاية عند ٢٫٥ث: العرضُ نصفًا والارتفاعُ ضِعفًا ───
  const t25 = await parkPlayhead(page, 2.5);
  assert(near(t25, 2.5, 0.05), `ثم عند ${t25.toFixed(3)}ث`);
  await addKfAtPlayhead(page, rect, 'scaleX');
  await setKfValueAtPlayhead(page, rect, 'scaleX', 50);
  await addKfAtPlayhead(page, rect, 'scaleY');
  await setKfValueAtPlayhead(page, rect, 'scaleY', 200);

  const built = await animOf(page, rect);
  assert(
    (built.tracks.scaleX || []).length === 2 && (built.tracks.scaleY || []).length === 2,
    `المستندُ يحمل مسارَين بمفتاحَين لكلٍّ (scaleX=${(built.tracks.scaleX || []).length}, scaleY=${(built.tracks.scaleY || []).length}) — مبنيَّين بأحداثِ مؤشّرٍ حقيقيّة`,
  );
  const sxKeys = [...(built.tracks.scaleX || [])].sort((a, b) => a.time - b.time);
  const syKeys = [...(built.tracks.scaleY || [])].sort((a, b) => a.time - b.time);
  assert(
    near(sxKeys[0].value, 1, 1e-9) && near(sxKeys[1].value, 0.5, 1e-9) && near(syKeys[0].value, 1, 1e-9) && near(syKeys[1].value, 2, 1e-9),
    `وقيمُه ما ضُبطت: scaleX ${sxKeys.map((k) => k.value).join('→')} و scaleY ${syKeys.map((k) => k.value).join('→')} — **متعاكسانِ على المقطع الواحد**`,
  );

  // ─── الحكمُ المركزيّ: الهندسةُ المرسومةُ عند لحظاتٍ وسطى ───
  // ولا يُقارَن بالبكسل المطلق: النِّسبةُ إلى صندوق الأساس هي المقروء.
  const mids = [0.6, 1.2, 1.8, 2.5];
  const seen = [];
  for (const t of mids) {
    await parkPlayhead(page, t);
    const box = await paintedBox(page, rect);
    const v = await resolvedAt(page, rect, t);
    seen.push({ t, rw: box.w / base.w, rh: box.h / base.h, sx: v.scaleX, sy: v.scaleY, scale: v.scale });
  }

  for (const s of seen) {
    assert(
      s.rw < 0.999 && s.rh > 1.001,
      `عند ${s.t}ث: العرضُ المرسومُ ×${s.rw.toFixed(4)} (أقلُّ من الأساس) والارتفاعُ ×${s.rh.toFixed(4)} (أكثرُ منه) — **في اللحظة نفسها، على العنصر نفسِه**. وهذه هي الجملةُ التي لم يكن للنموذج عبارةٌ عنها قبل هذا العمل`,
    );
  }
  assert(
    seen.every((s, i) => i === 0 || (s.rw < seen[i - 1].rw && s.rh > seen[i - 1].rh)),
    `والاتّجاهان مُطّردان على اللحظات الأربع: العرضُ ${seen.map((s) => s.rw.toFixed(3)).join(' > ')} والارتفاعُ ${seen.map((s) => s.rh.toFixed(3)).join(' < ')} — لا قراءةٌ واحدةٌ صادفت`,
  );
  // والرابطُ بين ما يُرسَم وما يُحَلّ: النِّسبةُ المقروءةُ من الشاشة هي المعاملُ
  // المحلولُ نفسُه. وهذا ما يَجعل البندَ أعلاه مستقلًّا عن أيّ تخفيفٍ على المقطع.
  for (const s of seen) {
    assert(
      near(s.rw, s.sx, 0.02) && near(s.rh, s.sy, 0.02),
      `وعند ${s.t}ث النِّسبةُ المقروءةُ من الشاشة هي المعاملُ المحلولُ بعينه (عرض ${s.rw.toFixed(4)}≈${s.sx.toFixed(4)}، ارتفاع ${s.rh.toFixed(4)}≈${s.sy.toFixed(4)}) — فالهندسةُ ليست مقروءةً من حقلٍ في الحالة بل من الصندوق المرسوم، وتُطابق النموذج`,
    );
  }
  const last = seen[seen.length - 1];
  assert(
    near(last.rw, 0.5, 0.02) && near(last.rh, 2, 0.04),
    `وعند مفتاح النهاية بعينه تَبلُغ النِّسبتان قيمتَي المفتاحَين بلا وسيط: ×${last.rw.toFixed(4)} و ×${last.rh.toFixed(4)} — قراءةٌ لا تعتمد على منحنى التخفيف`,
  );

  // ─── والحالةُ الصعبة: نقصٌ قريبٌ من الواحد مع نموٍّ كبير ───
  // تَكمن الصعوبةُ في أنّ محورًا ينقص ٣٪ بينما الآخرُ ينمو ٣٢٪: تطبيقٌ مُنتظمٌ
  // صامتٌ، أو محورٌ يَطغى على الآخر، يَبتلع النقصَ الصغير ولا يُرى.
  await parkPlayhead(page, 2.5);
  await setKfValueAtPlayhead(page, rect, 'scaleX', 97);
  await setKfValueAtPlayhead(page, rect, 'scaleY', 132);
  await parkPlayhead(page, 2.5);
  const subtle = await paintedBox(page, rect);
  assert(
    near(subtle.w / base.w, 0.97, 0.015) && near(subtle.h / base.h, 1.32, 0.03),
    `ونقصٌ طفيفٌ (×${(subtle.w / base.w).toFixed(4)}) مع نموٍّ كبيرٍ (×${(subtle.h / base.h).toFixed(4)}) يَصِلان كلاهما — فالمحورُ الصغيرُ لا يَبتلعه الكبير`,
  );
  assert(
    subtle.w / base.w < 1 && subtle.h / base.h > 1,
    'وإشارتاهما ما زالتا متعاكستَين عند الفرق الطفيف — وهو الوضعُ الذي يَخفى فيه خطأُ تطبيقٍ منتظمٍ صامت',
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٣. مسارُ التصدير: البكسلُ المرسومُ فعلًا يَقول الشيءَ نفسه
  // ═══════════════════════════════════════════════════════════════════════════
  // الرسّامةُ الثانية (`exportArtboard.ts:329`) كانت `ctx.scale(s, s)`. وهي
  // المسارُ الذي يَسلكه MP4 و GIF و PNG والصورةُ الحيّة كلُّها، فالمعاينةُ وحدها
  // لا تَكفي. ويُقاس بمسحِ البكسل الملوَّن لا بعيّنةٍ عند نقطة: المسحُ يُعطي
  // **صندوقًا** وهو عينُ ما يُسأَل عنه.
  console.log('\n٣. التصدير: الصندوقُ الممسوحُ من بكسلٍ حقيقيّ');
  const exported = await page.evaluate(async () => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const W = 400;
    const H = 400;
    const mkTrack = (v0, v1) => [
      { id: `a${v0}`, time: 0, value: v0, easing: 'linear', bezier: [0, 0, 1, 1] },
      { id: `b${v1}`, time: 1, value: v1, easing: 'linear', bezier: [0, 0, 1, 1] },
    ];
    const el = {
      id: 'wh', type: 'shape', shape: 'rect', visible: true, locked: false, opacity: 100, maskId: null,
      geo: { x: 0.3, y: 0.3, w: 0.4, h: 0.4, rotation: 0 },
      fill: '#ff0000', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0,
      anim: {
        preset: 'none', start: 0, duration: 1, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [],
        tracks: { scaleX: mkTrack(1, 0.5), scaleY: mkTrack(1, 2) },
      },
    };
    async function boxAt(time) {
      const blob = await mod.renderArtboardPng({ size: { w: W, h: H }, palette: { bg: '#ffffff', fg: '#000000', ac: '#ff0000' }, elements: [el], transparent: true, lang: 'ar', time, scale: 1 });
      const bitmap = await createImageBitmap(blob);
      const c = new OffscreenCanvas(W, H);
      const ctx = c.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const d = ctx.getImageData(0, 0, W, H).data;
      let minX = W, maxX = -1, minY = H, maxY = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (d[i + 3] > 128 && d[i] > 180 && d[i + 1] < 70) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      return maxX < 0 ? null : { w: maxX - minX + 1, h: maxY - minY + 1 };
    }
    return { at0: await boxAt(0), at05: await boxAt(0.5), at1: await boxAt(1) };
  });

  assert(
    exported.at0 && near(exported.at0.w, 160, 3) && near(exported.at0.h, 160, 3),
    `عند الزمن ٠ يُرسَم الصندوقُ بمقاسه الساكن ${exported.at0 ? `${exported.at0.w}×${exported.at0.h}` : 'لا شيء'} بكسلًا (٠٫٤ من ٤٠٠) — فالأساسُ مقيسٌ لا مُفترَض`,
  );
  assert(
    exported.at1 && near(exported.at1.w, 80, 4) && near(exported.at1.h, 320, 5),
    `وعند الزمن ١ يُرسَم ${exported.at1 ? `${exported.at1.w}×${exported.at1.h}` : 'لا شيء'} — عرضٌ نصفٌ وارتفاعٌ ضِعف، من **بكسلٍ حقيقيٍّ** على القُماش الذي يُصدِّر MP4 و GIF`,
  );
  assert(
    exported.at05 && exported.at05.w < exported.at0.w && exported.at05.h > exported.at0.h,
    `وعند لحظةٍ وسطى (${exported.at05 ? `${exported.at05.w}×${exported.at05.h}` : 'لا شيء'}) العرضُ أنقصُ والارتفاعُ أزيدُ من الأساس معًا — فالمعاينةُ والتصديرُ يَقولان الجملةَ نفسَها، وهما يَقرآن \`resolveAnimAt\` الواحدة`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٤. `scale` المنتظم على مستندٍ من بناءِ ما قبل التغيير
  // ═══════════════════════════════════════════════════════════════════════════
  // المدخلُ `qa/migration/prechange-scale-autosave.json` — حفظٌ تلقائيٌّ حقيقيٌّ
  // كتبه بناءُ ما قبل التغيير من شاشة البداية والخطّ الزمنيّ الحقيقيَّين
  // (`eaba2aa`، ولا تعديلَ على `src/` فيه). ومعه ما حلَّه **وما أنبعثه** ذلك
  // البناءُ عند ستّين لحظة.
  console.log('\n٤. المقياسُ المنتظم: ملفٌّ كتبه بناءُ ما قبل التغيير');
  const src = JSON.parse(PRECHANGE_JSON);
  const srcEl = src.artboards[0].doc.elements.find((e) => e.id === PRECHANGE.elementId);
  assert(!!srcEl, `الملفُّ يحمل العنصرَ الذي أُخذت منه العيّنات (${PRECHANGE.elementId})`);
  const srcScale = [...(srcEl.anim.tracks.scale || [])].sort((a, b) => a.time - b.time);
  assert(
    srcScale.length === 4,
    `ومسارُ مقياسه أربعةُ مفاتيحَ غيرُ مُطّردة (${srcScale.map((k) => k.value.toFixed(3)).join(' → ')}) — فمنحنًى كهذا لا يُصادفه تغييرٌ تعامل مع شكلِ النمطِ ذي المفتاحَين وحده`,
  );
  assert(
    srcScale.every((k) => k.scaleX === undefined && k.scaleY === undefined) && srcEl.anim.tracks.scaleX === undefined && srcEl.anim.tracks.scaleY === undefined,
    'ولا `scaleX` فيه ولا `scaleY` — وهذا هو كلُّ معنى «مستندٌ قائم»: غيابُ المسارِ هو حالتُه',
  );
  assert(PRECHANGE.samples.length === 60, `وستّون لحظةً مُلتقَطةً تمتدّ إلى ${PRECHANGE.samples[59].t.toFixed(3)}ث — إلى ما بعد نهاية المقطع`);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(({ key, json }) => window.localStorage.setItem(key, json), { key: AUTOSAVE_KEY, json: PRECHANGE_JSON });
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(450);

  const opened = await page.evaluate((id) => !!document.querySelector(`[data-el-id="${id}"]`), PRECHANGE.elementId);
  assert(opened, 'ويُفتَح المستندُ والعنصرُ فيه بمعرّفه الأصليّ');

  const now = await page.evaluate(
    async ({ id, instants }) => {
      const m = await import('/src/lib/animTimeline.ts');
      const raw = JSON.parse(window.localStorage.getItem('mazij.autosave.v1'));
      const el = raw.artboards[0].doc.elements.find((e) => e.id === id);
      return instants.map((t) => ({ v: m.resolveAnimAt(el.anim, t), css: m.entranceStyleAt(el.anim, t) }));
    },
    { id: PRECHANGE.elementId, instants: PRECHANGE.samples.map((s) => s.t) },
  );

  let worst = { t: null, prop: null, delta: 0 };
  for (let i = 0; i < PRECHANGE.samples.length; i++) {
    const was = PRECHANGE.samples[i].v;
    const is = now[i].v;
    for (const prop of ['opacity', 'x', 'y', 'scale', 'rotation']) {
      const d = Math.abs(was[prop] - is[prop]);
      if (d > worst.delta) worst = { t: PRECHANGE.samples[i].t, prop, delta: d };
    }
  }
  assert(
    worst.delta < 1e-6,
    `الحركةُ متطابقةٌ عند الستّين لحظةً في الخصائص الخمس القديمة كلِّها — أسوأُ خلافٍ ${worst.delta.toExponential(3)} (${worst.prop} عند ${worst.t === null ? 'لا شيء' : `${worst.t.toFixed(4)}ث`})، تحت 1e-6`,
  );
  assert(
    now.every((s) => s.v.scaleX === 1 && s.v.scaleY === 1),
    'والمحوران الجديدان يَحُلّان `1` بالضبط عند الستّين كلِّها — لا «قريبًا من واحد»، بل المحايدُ نفسُه، لأنّ المسارَ غائب',
  );

  // **والأحسمُ من الأرقام: النصُّ المُنبعِث.** هو الذي يُسنَد إلى
  // `style.transform`، وعنده وحده يُفرَّق بين تغييرٍ أبقى الصورةَ وتغييرٍ بدّلها.
  const cssMismatch = [];
  for (let i = 0; i < PRECHANGE.samples.length; i++) {
    const was = PRECHANGE.samples[i].css;
    const is = now[i].css;
    if (was.transform !== is.transform) cssMismatch.push(`${PRECHANGE.samples[i].t.toFixed(4)}ث: «${was.transform}» ← «${is.transform}»`);
  }
  assert(
    cssMismatch.length === 0,
    `والنصُّ المُنبعِث **بايتًا ببايت** كما أنبعثه البناءُ القديم عند الستّين كلِّها (مثاله «${now[12].css.transform}») — ${cssMismatch.length ? cssMismatch.slice(0, 3).join(' | ') : 'ولا خلافَ في حرف'}. ولو أُنبعِث \`scale(S, S)\` لكانت الصورةُ واحدةً والنصُّ مختلفًا، ولَما صدق «لم يتغيّر شيء»`,
  );
  assert(
    now.every((s) => !/scale\([^)]*,/.test(s.css.transform || '')),
    'ولا مُعامِلَ ثانيًا في أيّ لحظةٍ منها — فالمستندُ الذي لا يستعمل القدرةَ الجديدة لا يَدفع ثمنَها في المُخرَج',
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٥. التحجيمُ الذكيّ: المعاملُ بلا بُعدٍ فمعناه ثابتٌ عند كلّ مقاس
  // ═══════════════════════════════════════════════════════════════════════════
  // وهي الحجّةُ نفسُها الموثَّقةُ في `docs/re-vectorcraft-source.md:926-930`
  // لمَلمح السُّمك المتغيّر، ومُثبَّتةٌ هناك بـ`qa/variable-stroke-width.spec.mjs:388-413`:
  // المعاملُ صحيحٌ عند كلّ مقاسٍ **بحكم البناء**، وخصيصةٌ بقيمةٍ بالبكسل كانت
  // ستحتاج قاعدةَ تحجيمٍ خاصّةً بها — أو تَفعل الخطأَ في صمت.
  console.log('\n٥. التحجيمُ الذكيّ: ١٠٨٠×١٣٥٠ ← ١٠٨٠×١٩٢٠');
  const invariance = await page.evaluate(async () => {
    const mr = await import('/src/lib/magicResize.ts');
    const a = await import('/src/lib/animTimeline.ts');
    const tracks = {
      scaleX: [
        { id: 'x0', time: 0, value: 1, easing: 'linear', bezier: [0, 0, 1, 1] },
        { id: 'x1', time: 1, value: 0.5, easing: 'linear', bezier: [0, 0, 1, 1] },
      ],
      scaleY: [
        { id: 'y0', time: 0, value: 1, easing: 'linear', bezier: [0, 0, 1, 1] },
        { id: 'y1', time: 1, value: 2, easing: 'linear', bezier: [0, 0, 1, 1] },
      ],
    };
    const el = {
      id: 'mr-wh', type: 'shape', shape: 'rect', visible: true, locked: false, opacity: 100, maskId: null,
      geo: { x: 0.1, y: 0.2, w: 0.7, h: 0.1, rotation: 0 },
      fill: '#ff0000', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0,
      anim: { preset: 'none', start: 0, duration: 1, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks },
    };
    const out = mr.magicResizeElements([el], { w: 1080, h: 1350 }, { w: 1080, h: 1920 });
    const instants = Array.from({ length: 21 }, (_, i) => i / 20);
    return {
      sameTracks: JSON.stringify(out[0].anim.tracks) === JSON.stringify(tracks),
      before: instants.map((t) => a.resolveAnimAt(el.anim, t)),
      after: instants.map((t) => a.resolveAnimAt(out[0].anim, t)),
      instants,
    };
  });
  assert(
    invariance.sameTracks,
    'التحجيمُ الذكيُّ يُمرّر مسارَي المحورَين عبر ١٠٨٠×١٣٥٠ ← ١٠٨٠×١٩٢٠ **بلا تغييرِ حرف** — و`magicResizeElements` لا تَكتب إلا `geo` و`fontSize` (`magicResize.ts:148-161`)، فهذا بحكم البناء لا بحظّ',
  );
  let mrWorst = 0;
  for (let i = 0; i < invariance.instants.length; i++) {
    for (const p of ['scale', 'scaleX', 'scaleY']) mrWorst = Math.max(mrWorst, Math.abs(invariance.before[i][p] - invariance.after[i][p]));
  }
  assert(
    mrWorst === 0,
    `والمعنى ثابتٌ لا الحقلُ وحده: المعاملاتُ الثلاثةُ تَحُلّ إلى الأرقام نفسِها عند ٢١ لحظةً بعد تغيير اللوحة (أسوأُ خلافٍ ${mrWorst}) — وهذا هو الفرقُ بين أن يَصمد الحقلُ وأن يَصمد المعنى`,
  );

  // ─── والحيُّ لا الدالّةُ وحدها: اللوحةُ تتغيّر من الواجهة والنِّسبةُ تَثبُت ───
  // وهذا هو البندُ الذي كانت خصيصةٌ بالبكسل تَسقط فيه: ستّةُ أعشارِ العرضِ على
  // لوحةٍ رقمٌ بالبكسل، وعلى أخرى رقمٌ آخر — وهو بالمعامل رقمٌ واحد.
  //
  // **والزوجُ هنا ١٠٨٠×١٩٢٠ ← ١٩٢٠×١٠٨٠ لا ١٠٨٠×١٣٥٠ ← ١٠٨٠×١٩٢٠، وهذا قيدٌ
  // لا اختيار**: `ig-portrait` (١٠٨٠×١٣٥٠) طبيعتُه `still` في `SIZES`
  // (`src/data/constants.ts:40`)، والخطُّ الزمنيُّ كلُّه محجوبٌ عن المستند
  // الساكن — فلا مفتاحَ يُوضَع هناك من الواجهة أصلًا. والزوجُ المُستعمَل
  // مُوقَّتٌ طرفاه ويَقلِب النِّسبةَ قلبًا تامًّا، فهو أقسى لا أهون. وزوجُ
  // الورقة نفسُه مقيسٌ أعلاه على الدالّة الخالصة، وهو موضعُ قياسه في
  // `qa/variable-stroke-width.spec.mjs:404` كذلك.
  console.log('\n٥ب. التحجيمُ الذكيُّ من الواجهة: النِّسبةُ المرسومةُ تَثبُت');
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await bootBlank(page, BASE_URL, 'ig-reel'); // ١٠٨٠×١٩٢٠، مُوقَّت
  // لا «بسيط/احترافي» منذ ٢٤ أكتوبر ٢٠٢٦ (قرار المالك: «العمق يُطلب ولا يُفرض») — كلّ الأدوات حاضرة.
  await page.waitForTimeout(300);
  const mrRect = await drawRect(page);
  await page.locator(`[data-testid="expand-${mrRect}"]`).click();
  await page.waitForTimeout(260);
  await growClipTo(page, mrRect, 3);

  await parkPlayhead(page, 0);
  await addKfAtPlayhead(page, mrRect, 'scaleX');
  await addKfAtPlayhead(page, mrRect, 'scaleY');
  await parkPlayhead(page, 2.5);
  await addKfAtPlayhead(page, mrRect, 'scaleX');
  await setKfValueAtPlayhead(page, mrRect, 'scaleX', 60);
  await addKfAtPlayhead(page, mrRect, 'scaleY');
  await setKfValueAtPlayhead(page, mrRect, 'scaleY', 180);

  await parkPlayhead(page, 0);
  const mrBase = await paintedBox(page, mrRect);
  await parkPlayhead(page, 2.5);
  const mrBefore = await paintedBox(page, mrRect);
  const ratioBefore = { w: mrBefore.w / mrBase.w, h: mrBefore.h / mrBase.h };
  assert(
    near(ratioBefore.w, 0.6, 0.02) && near(ratioBefore.h, 1.8, 0.04),
    `على ١٠٨٠×١٩٢٠: النِّسبتان المرسومتان ×${ratioBefore.w.toFixed(4)} و ×${ratioBefore.h.toFixed(4)}`,
  );

  // التحجيمُ الذكيُّ مُشغَّلٌ من مفتاحه الحقيقيّ، ثم مقاسٌ مُوقَّتٌ آخر من قائمته.
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForSelector('[data-testid="size-menu"]');
  await page.locator('[data-testid="magic-resize-toggle"]').click();
  await page.waitForTimeout(120);
  await page.locator('[data-testid="size-option-yt-video"]').click(); // ١٩٢٠×١٠٨٠، مُوقَّت
  await page.waitForTimeout(600);
  assert(
    (await page.locator('[data-testid="size-menu-button"]').textContent()).includes('1920'),
    'واللوحةُ صارت ١٩٢٠×١٠٨٠ فعلًا من القائمة نفسِها — والنِّسبةُ انقلبت من عموديّةٍ إلى أفقيّة',
  );
  assert(
    (await page.locator('[data-testid="timeline-tracks"]').count()) === 1,
    'والخطُّ الزمنيُّ باقٍ، فالطرفان مُوقَّتان والمفاتيحُ قابلةٌ للقراءة على الوجهَين',
  );

  await parkPlayhead(page, 0);
  const mrBase2 = await paintedBox(page, mrRect);
  await parkPlayhead(page, 2.5);
  const mrAfter = await paintedBox(page, mrRect);
  const ratioAfter = { w: mrAfter.w / mrBase2.w, h: mrAfter.h / mrBase2.h };
  assert(
    near(ratioAfter.w, ratioBefore.w, 0.02) && near(ratioAfter.h, ratioBefore.h, 0.04),
    `وبعد تغيير اللوحة النِّسبتان كما كانتا: ×${ratioAfter.w.toFixed(4)} (كانت ×${ratioBefore.w.toFixed(4)}) و ×${ratioAfter.h.toFixed(4)} (كانت ×${ratioBefore.h.toFixed(4)}) — **فالمعنى نَجا، لا الحقلُ وحده**. وخصيصةٌ بقيمةٍ بالبكسل كانت ستُعطي هنا رقمًا آخرَ في صمت`,
  );
  const mrSaved = await animOf(page, mrRect);
  assert(
    near([...mrSaved.tracks.scaleX].sort((a, b) => a.time - b.time)[1].value, 0.6, 1e-9) &&
      near([...mrSaved.tracks.scaleY].sort((a, b) => a.time - b.time)[1].value, 1.8, 1e-9),
    `والمستندُ المحفوظُ بعد التحجيم يحمل القيمتَين كما كانتا (${[...mrSaved.tracks.scaleX].sort((a, b) => a.time - b.time)[1].value}, ${[...mrSaved.tracks.scaleY].sort((a, b) => a.time - b.time)[1].value}) — ولا قاعدةَ تحجيمٍ خاصّةً احتاجها المحوران`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٦. دورةُ الحفظ التلقائيّ والفتح
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n٦. دورةُ الحفظ التلقائيّ: المحوران يَنجوان من إعادةِ تحميلٍ حقيقيّة');
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(450);

  const reloaded = await animOf(page, mrRect);
  const rx = [...(reloaded.tracks.scaleX || [])].sort((a, b) => a.time - b.time);
  const ry = [...(reloaded.tracks.scaleY || [])].sort((a, b) => a.time - b.time);
  assert(
    rx.length === 2 && ry.length === 2 && near(rx[1].value, 0.6, 1e-9) && near(ry[1].value, 1.8, 1e-9),
    `بعد إعادةِ تحميلٍ حقيقيّة ودخولٍ من بطاقة «أكمل»: المسارانِ بمفاتيحهما وقيمهما (scaleX→${rx[1].value}, scaleY→${ry[1].value})`,
  );
  assert(
    rx.every((k) => typeof k.time === 'number' && k.t === undefined) && ry.every((k) => typeof k.time === 'number'),
    'ومفاتيحُهما بالثواني المطلقة كبقيّة المسارات — لا تمثيلَ ثانيًا دخل مع القدرة الجديدة',
  );
  await parkPlayhead(page, 0);
  const rBase = await paintedBox(page, mrRect);
  await parkPlayhead(page, 2.5);
  const rAfter = await paintedBox(page, mrRect);
  assert(
    near(rAfter.w / rBase.w, ratioAfter.w, 0.02) && near(rAfter.h / rBase.h, ratioAfter.h, 0.04),
    `والهندسةُ المرسومةُ بعد الفتح هي نفسُها: ×${(rAfter.w / rBase.w).toFixed(4)} و ×${(rAfter.h / rBase.h).toFixed(4)} — فالدورةُ حفظٌ وفتحٌ لا كتابةٌ ناقصة`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٧. مغلّفُ النسخة: بناءٌ أقدمُ يَرفض الملفَّ ولا يُرسمه خطأً في صمت
  // ═══════════════════════════════════════════════════════════════════════════
  // ولا ترحيلَ للقيم هنا: غيابُ المسار **هو** المحايد، فلا بايتَ قائمٌ يُعاد
  // تفسيره (وهو عقدُ `sourceIn` نفسُه، `elements.ts:124-130`). لكنّ الاتّجاهَ
  // الآخرَ خطر: مستندٌ يحمل محورًا يَفتحه بناءٌ أقدمُ فيَرسمه **منتظمًا** بلا أيّ
  // خطأٍ يَظهر، و`cascadeEasingToTracks` هناك تَبني `next` من `ANIM_PROPERTIES`
  // التي لا تَعرف المحورَين — فضغطةٌ على منحنى التخفيف تَحذفهما. وهذا بعينه ما
  // تَأمر به الخطّةُ في §1C.3: يُرفَض الملفُّ صراحةً لا يُفتَح بنصفه.
  console.log('\n٧. مغلّفُ النسخة');
  // وجدولُ الترحيلات قائمةٌ يُقصَد لها أن تَنمو كذلك، فلا يُقاس منها عددٌ مطلقٌ
  // ولا موضعُ «آخرِ بند»: كلاهما يَسقط عند أوّل بندٍ يُضاف، وسقوطُه حينها لا يَدلّ
  // على عطل. والمقيسُ **رتبةُ البندِ في الجدول** — وهي ثابتةٌ تحت الإضافة
  // بالذيل، إذ `DOC_MIGRATIONS[i]` يَرفع النسخة `i+1` إلى `i+2`، فرتبةُ بندٍ
  // قائمٍ هي النسخةُ التي يَرفعها وهي لا تتغيّر — وما يُقاس من الأطوال يُقاس
  // **مقارنةً بالجدول نفسِه** لا برقمٍ مكتوب.
  const version = await page.evaluate(async (preJson) => {
    const m = await import('/src/lib/persist.ts');
    return {
      SCHEMA_VERSION: m.SCHEMA_VERSION,
      migrations: [...m.DOC_MIGRATIONS],
      currentRunsNone: m.migrationsFor(m.SCHEMA_VERSION).length,
      absentRunsAll: m.migrationsFor(0).length,
      // أسماءُ ما يُشغَّل لا عددُه: «كلَّها» دعوى تطابقٍ مع الجدول، لا دعوى طول.
      absentRunsAllNames: [...m.migrationsFor(0)],
      // وما يُشغِّله مستندُ القسم ٤ بعينه، من نسخته المكتوبة في بايتاته.
      prechangeRuns: [...m.migrationsFor(m.schemaVersionOf(JSON.parse(preJson)))],
      refusesNewer: m.isTooNew({ artboards: [], activeArtboardId: 'x', schemaVersion: m.SCHEMA_VERSION + 1 }),
      acceptsCurrent: m.isTooNew({ artboards: [], activeArtboardId: 'x', schemaVersion: m.SCHEMA_VERSION }),
    };
  }, PRECHANGE_JSON);
  const versionExpr = (/export const SCHEMA_VERSION\s*=\s*([^;\n]+);/.exec(PERSIST_SRC)?.[1] ?? '(لا تعريفَ أصلًا)').trim();
  assert(
    version.SCHEMA_VERSION === version.migrations.length + 1 && /^DOC_MIGRATIONS\.length\s*\+\s*1$/.test(versionExpr),
    `\`SCHEMA_VERSION\` (${version.SCHEMA_VERSION}) ما زالت مشتقّةً من طول جدول الترحيلات (${version.migrations.length}: ${version.migrations.join(', ')}) — فمن أضاف بندًا رفع النسخةَ بحكم البناء، ولا يَنحرف الرقمان. والاشتقاقُ مقيسٌ في التعريف نفسِه «\`${versionExpr}\`» لا في قيمته وحدها: رقمٌ يُكتَب بيدٍ يُصادف الصوابَ يومَ كُتِب ويَمرّ من كلّ مقارنةٍ قيميّة، ثم يَسهو عند أوّل بندٍ يُضاف`,
  );
  const nusAt = version.migrations.indexOf('nonuniform-scale-tracks');
  assert(
    nusAt === 1 && version.prechangeRuns.includes('nonuniform-scale-tracks') && cssMismatch.length === 0,
    `وبندُ هذا العمل قائمٌ في رتبته (${nusAt === -1 ? `مفقودٌ من الجدول — وفي الرتبة ١ اليومَ: ${version.migrations[1] ?? 'لا شيء'}` : `الرتبة ${nusAt}: ${version.migrations[nusAt]}`}) — أي يَرفع النسخةَ ٢ إلى ٣، وهي رتبةٌ لا تتغيّر بما يُضاف بعده. **وبندٌ لا يُحوِّل بايتًا**: مستندُ القسم ٤ نسختُه ٢ فيُشغِّله فعلًا (${version.prechangeRuns.join(', ')})، والنصُّ المُنبعِث منه بعد تشغيله هو نفسُه بايتًا ببايت عند الستّين لحظة (${cssMismatch.length} خلافًا) — غيابُ المسار هو المحايد. وهو موجودٌ ليرفع النسخةَ وحدها، فيَرفضَ بناءٌ أقدمُ ملفًّا يحمل محورًا بدل أن يَرسمه منتظمًا في صمت ثم يَحذفه عند أوّل تخفيفٍ متدرّج`,
  );
  assert(
    version.currentRunsNone === 0 && version.absentRunsAllNames.join('|') === version.migrations.join('|'),
    `ومستندُ اليوم لا يُشغِّل ترحيلًا (${version.currentRunsNone})، ومستندٌ بلا نسخةٍ يُشغِّل **الجدولَ كلَّه بأسمائه وترتيبه** مهما طال (${version.absentRunsAll}: ${version.absentRunsAllNames.join(', ')}) — فبندٌ يُقفَز عنه، أو يُشغَّل مرّتَين، أو يُقدَّم على سابقه، يَظهر هنا؛ وعددٌ مطلقٌ كان يَسكت عن ذلك كلِّه متى صادف الطولَ`,
  );
  assert(
    version.refusesNewer === true && version.acceptsCurrent === false,
    'ومستندٌ من بناءٍ **أحدث** يُرفَض صراحةً ولا يُفتَح بنصفه — وهو العلاجُ نفسُه من الجهة الأخرى',
  );
  const stamped = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k)).schemaVersion, AUTOSAVE_KEY);
  assert(
    stamped === version.SCHEMA_VERSION,
    `والمستندُ المحفوظُ في هذه الجولة مَوسومٌ بها (${stamped}) — مكتوبةً داخل \`saveDoc\`، فلا مسارَ حفظٍ ينساها`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  assert(pageErrors.length === 0, `ولا خطأَ في وحدة التحكّم خلال الملفّ كلّه (${pageErrors.slice(0, 3).join(' | ') || 'لا شيء'})`);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  -', f);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
