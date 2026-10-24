#!/usr/bin/env node
// قيمةُ المفتاح تُضبَط بدقّة: ما تَعجز عنه المِمسحةُ يَكتبه الحقل
// ═══════════════════════════════════════════════════════════════════════════
//
// **العطلُ المقيس.** مِمسحةُ قيمةِ المفتاح في منبثقة الخطّ الزمنيّ كانت
// `<input type="range">` **بلا سمةِ `step`**، فخطوتُها ١ بحكم HTML. و`x`/`y`
// تُخزَّنان كسرًا من **عرض اللوح** (`visual.x * w` في `exportArtboard.ts`)، فعلى
// لوحٍ عرضُه ٢٥٦٠ بكسلًا تساوي الخطوةُ الواحدةُ **٢٥٫٦ بكسلًا**. فإزاحةُ ١٩
// بكسلًا — وهي ٠٫٧٤٢١٨٧٥٪ — **لا موضعَ لها على الشبكة**: أقربُ ما تَبلغه المِمسحةُ
// صفرٌ أو ٢٥٫٦، وكلاهما يُخطئ بأكثر من ستّة بكسلات.
//
// ═══════════════════════════════════════════════════════════════════════════
// لِمَ حقلٌ مكتوبٌ ولِمَ لا تكفي `step` أدقُّ على المِمسحة
// ═══════════════════════════════════════════════════════════════════════════
// ثلاثةُ قياساتٍ على المِمسحة نفسِها، أُخِذت من البرنامج قبل كتابةِ سطرٍ واحد:
//
// ١. **عرضُها ٩٠ بكسلًا لمدًى ٢٠٠ وحدة.** فبكسلُ الشاشة ٢٫٢٢ وحدة. ومقيسٌ فعلًا:
//    سحبةٌ بمقدار بكسلٍ واحدٍ من المنتصف أعطت `3`، وبكسلَين `5`، وثلاثةٍ `8`.
//    فموضعُ ٠٫٧٤٪ يَطلب من المؤشّر دقّةَ ١/٢٢٢ من البكسل.
// ٢. **المفاتيحُ الأفقيّةُ لا تَصِل إليها.** مقيسٌ: `ArrowRight` على مِمسحةٍ
//    مركَّزةٍ يُعطي `0 → 0` — `onTrackKeyDown` في `Timeline.tsx` يَملك `←`/`→`
//    لتنقّلِ الإطارات ويُنادي `preventDefault`. و`ArrowUp` وحدَها تَصِل، بخطوةٍ ١.
// ٣. **والمتصفّحُ يَرفض الكسورَ عليها.** `fill('0.74')` على المِمسحة بلا `step`
//    يُعطي `Error: Malformed value`، وقراءةُ `.value = '0.74'` ترجع `'1'`:
//    قيمةُ `range` تُقصَر على مُضاعَفات `step`.
//
// فالدقّةُ تُكتَب، والسرعةُ تُسحَب. والمِمسحةُ **باقية** — وهو الدرسُ المكتوبُ في
// هذا المستودع يومَ هبط منتقي لون الحدّ: أُبقيَت الشرائحُ إلى جانبه.
//
// ═══════════════════════════════════════════════════════════════════════════
// الدقّةُ: منزلتان في الوحدة المعروضة، أي أربعُ منازلَ في الكسر المخزون
// ═══════════════════════════════════════════════════════════════════════════
// `0.01٪ × 2560 = 0.256` بكسلًا — دون البكسل. والمنزلةُ الأولى وحدَها `2.56`
// بكسلًا، وهي فوقه ولا تَبلغ ١٩ بكسلًا بحال. والمنزلةُ الثالثةُ لا تَقدر المِمسحةُ
// على عرضها (`step="0.01"` يَقصُر `0.7421875` إلى `0.74`)، ولا تُنبِعثها معاينةُ
// DOM (`translate(${(v.x*100).toFixed(2)}cqw…)`). فمنزلتان: أدقُّ من البكسل،
// وقابلٌ للعرض، وليس وعدًا يَكذبه الرسم.
//
// ═══════════════════════════════════════════════════════════════════════════
// كيف يُقاس في هذا الملفّ
// ═══════════════════════════════════════════════════════════════════════════
// · **كلُّ ضبطٍ بإدخالٍ حقيقيّ**: نقرةٌ على الماسة، ثم طَرْقُ أرقامٍ في الحقل، ثم
//   `Enter`؛ والمقاسُ المخصّصُ من قائمةِ مقاسِ اللوح نفسِها. ولا قيمةَ واحدةً
//   تُحقَن في الحالة.
// · **والهندسةُ تُقرأ عن العنصر المرسوم**: `getComputedStyle(host).transform`
//   مُفكَّكةً بـ`DOMMatrixReadOnly`. و`e` في تلك المصفوفة **بكسلُ مستندٍ مباشرةً**
//   لا بكسلُ شاشة: اللوحُ يُوضَع بعرضٍ تخطيطيٍّ يساوي `size.w` ثم يُكبَّر
//   بـ`transform: scale()` منفصلًا (انظر `abStyle` في `Stage.tsx` وما يَشرحه
//   `qa/text-wrap-parity.spec.mjs`)، والمصفوفةُ المحسوبةُ للعنصر لا تحمل تكبيرَ
//   سَلَفه. ويُحرَسُ هذا ببندٍ صريح (§٨٫١) كي لا يَتسرّب تكبيرُ الشاشة إلى القياس.
// · **والقيمةُ المتوقَّعةُ تُحسَب في هذا الملفّ من أوّلها**، لا تُستورَد من
//   `animTimeline.ts`: مع تخفيفٍ **خطّيّ** القيمةُ على المسافة دالّةٌ خطّيّةٌ في
//   الموضع، ونسبةُ الموضعِ مقروءةٌ من الشاشة (§٣). فالمقياسُ لا يُقارن الرسّامةَ
//   بنفسها.
//
// التشغيل: QA_PORT=<منفذ حرّ> QA_SPECS=keyframe-fine-value npm test

import { chromium } from 'playwright';
import { bootDemoTimed, resumeAfterReload, AUTOSAVE_KEY } from './helpers/boot.mjs';

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

/** عرضُ اللوح المقيسُ عليه. ٢٥٦٠ هي حالةُ الورقة، ومنها تأتي الشبكةُ القديمة. */
const DOC_W = 2560;
const DOC_H = 1440;
/** خطوةُ المِمسحة القديمة بالبكسل على هذا اللوح: ١٪ من العرض. */
const OLD_GRID_PX = DOC_W / 100;
/** الإزاحةُ المطلوبة — وهي عينُ ما لا تَقع على `OLD_GRID_PX`. */
const WANT_PX = 19;
/** وثانيةٌ أكبر: خطوةٌ قدرُها ٢٠٫٧٣٦ بكسلًا، وهي كذلك ليست مُضاعَفًا. */
const WANT2_PX = 20.736;

const pctOf = (px) => (px / DOC_W) * 100;
/** ما يَقدر الحقلُ على كتابته: منزلتان في النسبة المئويّة. */
const authorable = (px) => Math.round(pctOf(px) * 100) / 100;

const field = (page) => page.locator('[data-testid="kf-value-field"]');
const slider = (page) => page.locator('[data-testid="kf-value-slider"]');

/** إزاحةُ العنصر المرسومِ **ببكسل المستند**، مقروءةً عن النمط المحسوب. */
const paintedOffset = (page, id) =>
  page.evaluate((elId) => {
    const host = document.querySelector(`[data-el-id="${elId}"]`);
    const ab = document.querySelector('[data-testid="artboard"]');
    if (!host || !ab) return null;
    const m = new DOMMatrixReadOnly(getComputedStyle(host).transform);
    return {
      x: m.e,
      y: m.f,
      inline: host.style.transform || '(none)',
      docW: Number(ab.dataset.docW),
      screenScale: ab.getBoundingClientRect().width / Number(ab.dataset.docW),
    };
  }, id);

/** يَكتب رقمًا في الحقل بطَرْقٍ حقيقيّ ثم يُثبّته بـ`Enter`. */
async function typeValue(page, text) {
  const f = field(page);
  await f.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(text, { delay: 35 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(260);
}

/** موضعُ المؤشّر الزمنيِّ **بإحداثيّ الشاشة**، مشتقًّا من نسبته المئويّة على
 * السطح نفسِه الذي تَقع عليه المَاسات — فالمقارنةُ بينهما مشروعة. ولا يُقرأ
 * `boundingBox` للمؤشّر: مقبضُه الظاهرُ يَمتدّ تسعةَ بكسلاتٍ يسارَه، فصندوقُه
 * المحيطُ أوسعُ من خطِّه. */
const playheadScreenX = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('[data-testid="timeline-ruler"]').getBoundingClientRect();
    const pct = parseFloat(document.querySelector('[data-testid="timeline-playhead"]').style.left);
    return r.left + (r.width * pct) / 100;
  });

/** مركزُ كلِّ ماسةٍ على صفِّ خصيصةٍ، بإحداثيّ الشاشة، مرتّبًا بالزمن. */
async function diamondCenters(page, elId, property) {
  const row = `[data-testid="clip-row-${elId}-${property}"]`;
  const nodes = await page.locator(`${row} [data-testid^="kf-${elId}-"]`).all();
  const out = [];
  for (const n of nodes) {
    const b = await n.boundingBox();
    out.push({ node: n, cx: b.x + b.width / 2, cy: b.y + b.height / 2 });
  }
  return out.sort((a, b) => a.cx - b.cx);
}

/** مسارُ خصيصةٍ مفتوحٌ على عنصر، ومفتاحٌ مُضافٌ عند المؤشّر ومحدَّد. */
async function addAndSelectKf(page, elId, property, atFraction) {
  const body = page.locator(`[data-testid="clip-${elId}-${property}"]`);
  await body.scrollIntoViewIfNeeded();
  const box = await body.boundingBox();
  const ruler = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(box.x + box.width * atFraction, ruler.y + ruler.height / 2);
  await page.waitForTimeout(90);
  await page.locator(`[data-testid="clip-${elId}-add-kf-${property}"]`).click();
  await page.waitForTimeout(170);
  return selectKfAtPlayhead(page, elId, property);
}

/** يَنقر الماسةَ **الأقربَ إلى المؤشّر الزمنيّ** على صفِّ الخصيصة.
 *
 * **ولا «الأخيرةُ على الصفّ»**: نمطُ الدخول الجاهزُ يَضع مفاتيحَه على المسار سلفًا
 * (`tracksFromPreset`)، فمفتاحٌ أُضيف عند المؤشّر قد لا يكون آخرَها زمنًا — وقد
 * وقع ذلك فعلًا أثناء بناء هذا الملفّ: كُتِبت القيمةُ في مفتاحٍ آخر، فقرأ البندُ
 * رسمًا لا علاقةَ له بما كُتِب. والعنونةُ بالصفّ لا بالمعرّف وحده لأنّ نمطًا
 * جاهزًا يُعطي مفتاحَين على مسارَين المعرّفَ نفسَه. */
async function selectKfAtPlayhead(page, elId, property) {
  const centers = await diamondCenters(page, elId, property);
  if (!centers.length) throw new Error(`no diamond on the ${property} row of ${elId}`);
  const phX = await playheadScreenX(page);
  const nearest = centers.reduce((a, b) => (Math.abs(b.cx - phX) < Math.abs(a.cx - phX) ? b : a));
  await page.mouse.click(nearest.cx, nearest.cy);
  await page.waitForTimeout(240);
  return centers.length;
}

/** يَنقر الماسةَ رقمَ `idx` بالزمن على صفِّ الخصيصة — حيث يَعرف البندُ أيَّها
 * يُريد بغضّ النظر عن موضع المؤشّر. */
async function selectKfByIndex(page, elId, property, idx) {
  const centers = await diamondCenters(page, elId, property);
  const pick = centers[idx];
  if (!pick) throw new Error(`no diamond #${idx} on the ${property} row of ${elId} (have ${centers.length})`);
  await page.mouse.click(pick.cx, pick.cy);
  await page.waitForTimeout(240);
  return centers.length;
}

/** مسارُ الخصيصة كما هو في الحفظ التلقائيّ على القرص (localStorage هنا). */
const savedTrack = (page, elId, property) =>
  page.evaluate(
    ({ k, i, p }) => {
      const raw = window.localStorage.getItem(k);
      if (!raw) return null;
      const doc = JSON.parse(raw);
      const ab = doc.artboards ? doc.artboards[0].doc : doc;
      const el = ab.elements.find((e) => e.id === i);
      return { track: el?.anim?.tracks?.[p] ?? null, text: raw };
    },
    { k: AUTOSAVE_KEY, i: elId, p: property },
  );

async function openProTimeline(page) {
  // لا «بسيط/احترافي» منذ ٢٤ أكتوبر ٢٠٢٦ (قرار المالك: «العمق يُطلب ولا يُفرض») — كلّ الأدوات حاضرة.
  await page.waitForTimeout(260);
  await page.locator('[data-layer-id="head"] button', { hasText: 'العنوان' }).click();
  await page.waitForTimeout(160);
  await page.locator('[data-testid="expand-head"]').click();
  await page.waitForTimeout(160);
}

/** المقاسُ المخصّصُ من قائمةِ مقاسِ اللوح — ضغطاتٌ حقيقيّة، لا حقنُ حالة. */
async function setCustomSize(page, w, h) {
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForSelector('[data-testid="size-menu"]');
  await page.locator('[data-testid="custom-size-w"]').fill(String(w));
  await page.locator('[data-testid="custom-size-h"]').fill(String(h));
  await page.locator('[data-testid="custom-size-apply"]').click();
  await page.waitForTimeout(420);
}

/** **المقياسُ يَنطق ولو مات.** بنودُ هذا الملفّ كلُّها تَكتب في حقلٍ لم يكن
 * موجودًا على `main`، فأوّلُ لمسةٍ له هناك ترفع استثناءً — و`run` التي ترفع بلا
 * حصيلةٍ مطبوعةٍ تُقرأ عند مُشغِّل المجموعة **ملفًّا مات** لا ملفًّا ساقطًا،
 * والفرقُ بينهما مكتوبٌ في `scripts/run-qa.mjs`. فتُطبَع الحصيلةُ من `finally`
 * دائمًا، ويُعَدّ الاستثناءُ نفسُه بندًا ساقطًا باسمه — فيُقرأ السقوطُ سقوطًا. */
async function run(page, pageErrors) {
  await bootDemoTimed(page, BASE_URL);
  await setCustomSize(page, DOC_W, DOC_H);
  assert(
    (await page.locator('[data-testid="artboard"]').getAttribute('data-doc-w')) === String(DOC_W),
    `اللوحُ بعرض ${DOC_W} بكسلًا فعلًا، مضبوطًا من قائمة المقاس بضغطاتٍ حقيقيّة — فالشبكةُ القديمةُ على هذا اللوح ${OLD_GRID_PX} بكسلًا للخطوة`,
  );
  assert(
    (await page.locator('[data-testid="artboard-medium"]').getAttribute('data-medium')) === 'timed',
    'والمستندُ مُوقَّتٌ بعدها كما كان — المقاسُ المخصّصُ لا يَسحب الخطَّ الزمنيَّ من تحت المفاتيح',
  );
  await openProTimeline(page);

  // ═══════════════════════════════════════════════════════════════════════
  // ١. سطحانِ لا سطحٌ واحد
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n١. المنبثقةُ تَحمل الطريقَين: السريعَ والدقيق');
  await addAndSelectKf(page, 'head', 'x', 0.5);
  assert((await page.locator('[data-testid="kf-popover"]').count()) === 1, 'نقرةُ الماسة تَفتح منبثقةَ القيمة');
  assert((await slider(page).count()) === 1, '**والمِمسحةُ باقية** — الطريقُ السريعُ لم يُستبدَل بالدقيق');
  assert((await field(page).count()) === 1, '**وإلى جانبها حقلٌ رقميّ** — الطريقُ الدقيق');

  // سمةُ `step` تُقرأ عن **الخاصيّة** لا عن السمة المكتوبة، لأنّ غيابَ السمة
  // يُعطي `'1'` في `el.step` — وهو العطلُ نفسُه معروضًا رقمًا. والقراءةُ محوطةٌ
  // بوجود السطح كي يُنتج هذا البندُ **حكمًا** على بناءٍ لا حقلَ فيه، لا موتًا
  // صامتًا قبل أن يُقاس شيء.
  const stepOf = async (loc) => ((await loc.count()) ? await loc.evaluate((e) => e.step) : '(السطح غائب)');
  const steps = { slider: await stepOf(slider(page)), field: await stepOf(field(page)) };
  assert(
    steps.slider === steps.field && Number(steps.slider) > 0 && Number(steps.slider) < 1,
    `والسطحانِ على خطوةٍ واحدةٍ أدقَّ من الوحدة (المِمسحة «${steps.slider}»، الحقل «${steps.field}») — وعلى \`main\` كانت سمةُ \`step\` غائبةً عن المِمسحة فخطوتُها ١`,
  );
  // و`> 0` شرطٌ مقصود: سمةٌ غائبةٌ تُقرأ `''` في `el.step`، و`Number('')` صفرٌ —
  // فبلا هذا الشرط كان بناءٌ **بلا `step` أصلًا** يَجتاز هذا البندَ مجّانًا.
  // مقيسٌ: هكذا اجتازه في أوّل تشغيلٍ على `main`.
  const stepPx = (Number(steps.slider) * DOC_W) / 100;
  assert(
    Number(steps.slider) > 0 && stepPx < 1,
    `وخطوةُ السطحَين على هذا اللوح ${stepPx.toFixed(4)} بكسلًا — **دون البكسل الواحد**، وعلى \`main\` كانت ${OLD_GRID_PX}`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ٢. إزاحةٌ ليست مُضاعَفًا للشبكة القديمة — البندُ الرئيس
  // ═══════════════════════════════════════════════════════════════════════
  console.log(`\n٢. إزاحةُ ${WANT_PX} بكسلًا على لوحٍ عرضُه ${DOC_W}`);
  assert(
    Math.abs(WANT_PX / OLD_GRID_PX - Math.round(WANT_PX / OLD_GRID_PX)) > 0.2,
    `و${WANT_PX} بكسلًا **ليست مُضاعَفًا** لخطوةِ ${OLD_GRID_PX} بكسلًا (${(WANT_PX / OLD_GRID_PX).toFixed(4)} من الخطوة) — فأقربُ ما تَبلغه المِمسحةُ القديمةُ ${Math.round(WANT_PX / OLD_GRID_PX) * OLD_GRID_PX} بكسلًا، بخطأِ ${Math.abs(WANT_PX - Math.round(WANT_PX / OLD_GRID_PX) * OLD_GRID_PX).toFixed(2)} بكسلًا`,
  );

  const want = authorable(WANT_PX);
  await typeValue(page, String(want));
  assert(
    (await field(page).inputValue()) === String(want),
    `والحقلُ يَقبل «${want}» ويَعرضها كما كُتِبت (قرأ «${await field(page).inputValue()}») — لا مُدوَّرةً إلى ${Math.round(want)}`,
  );
  assert(
    Number(await slider(page).inputValue()) === want,
    `**والمِمسحةُ تَعرض الرقمَ نفسَه** (${await slider(page).inputValue()}) — سطحانِ وجوابٌ واحد. وعلى \`main\` كان \`range\` بلا \`step\` يَقصُر «0.74» إلى «1»، فيَعرض السطحانِ عن القيمةِ الواحدةِ رقمَين`,
  );

  const atKf = await paintedOffset(page, 'head');
  const expectAtKf = (want / 100) * DOC_W;
  assert(
    Math.abs(atKf.x - expectAtKf) < 1,
    `والرسمُ عند المفتاح نفسِه ${atKf.x.toFixed(3)} بكسلًا من بكسلات المستند، والمتوقَّعُ ${expectAtKf.toFixed(3)} — فرقٌ ${Math.abs(atKf.x - expectAtKf).toFixed(4)} **دون البكسل** (النمطُ المُنبعَث «${atKf.inline}»)`,
  );
  assert(
    Math.abs(atKf.x - WANT_PX) < 1,
    `**وهي ${WANT_PX} بكسلًا المطلوبةُ إلى ${Math.abs(atKf.x - WANT_PX).toFixed(4)} بكسلًا** — إزاحةٌ ليست مُضاعَفًا لـ${OLD_GRID_PX}، مُؤلَّفةً من واجهة البرنامج ومقروءةً عن العنصر المرسوم`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ٣. القيمةُ عند **زمنٍ وسيط** بين مفتاحَين
  // ═══════════════════════════════════════════════════════════════════════
  // مفتاحٌ ثانٍ قُربَ آخر المقطع بقيمةِ صفر، وتخفيفٌ **خطّيّ** على المفتاح
  // **الأوّل** منهما — فالتخفيفُ الحاكمُ لمسافةٍ هو تخفيفُ مفتاحها السابق
  // (`trackValueAt`). ومع الخطّيّ تكون القيمةُ على المسافة دالّةً خطّيّةً في
  // الموضع، فالمتوقَّعُ يُحسَب في هذا الملفّ من أوّله.
  //
  // **ونسبةُ التقدّم مقيسةٌ من الشاشة لا مفترَضةً نصفًا.** موضعُ المؤشّر
  // والماستان كلُّها على السطح نفسِه، فنسبةُ `(المؤشّر − الأولى)/(الثانية −
  // الأولى)` قراءةٌ هندسيّةٌ عن الواجهة المرسومة — ونقرةُ المسطرة تَقع على إطارٍ
  // من شبكة المستند لا على الموضع المضغوط بالحرف، فافتراضُ النصف كان سيُدخل
  // خطأً ليس من الميزة.
  console.log('\n٣. القيمةُ عند زمنٍ وسيط، بتخفيفٍ خطّيّ');
  await page.locator('[data-testid="kf-easing-linear"]').click();
  await page.waitForTimeout(220);
  await addAndSelectKf(page, 'head', 'x', 0.93);
  await typeValue(page, '0');

  const centers = await diamondCenters(page, 'head', 'x');
  assert(centers.length === 2, `وعلى مسار x مفتاحان لا أكثر (${centers.length}) — فالمسافةُ بينهما مُعرَّفة`);
  const sep = centers[centers.length - 1].cx - centers[0].cx;
  assert(sep > 30, `والماستان متباعدتانِ ${sep.toFixed(1)} بكسلَ شاشةٍ — فقراءةُ نسبةِ التقدّم من الشاشة أدقُّ من عُشرِ بكسلٍ من المستند`);

  const ruler = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click((centers[0].cx + centers[1].cx) / 2, ruler.y + ruler.height / 2);
  await page.waitForTimeout(340);

  const phX = await playheadScreenX(page);
  const progress = (phX - centers[0].cx) / sep;
  const atMid = await paintedOffset(page, 'head');
  const expectMid = ((want * (1 - progress)) / 100) * DOC_W;
  assert(
    progress > 0.2 && progress < 0.8,
    `والمؤشّرُ واقعٌ بين المفتاحَين فعلًا، عند ${(progress * 100).toFixed(2)}٪ من المسافة — زمنٌ وسيطٌ لا مفتاحٌ`,
  );
  assert(
    Math.abs(atMid.x - expectMid) < 1,
    `**وعند ذلك الزمن الوسيط** الرسمُ ${atMid.x.toFixed(3)} بكسلًا والمتوقَّعُ ${expectMid.toFixed(3)} (${want}٪ تَنزل خطّيًّا إلى صفرٍ، عند ${(progress * 100).toFixed(2)}٪) — فرقٌ ${Math.abs(atMid.x - expectMid).toFixed(4)} **دون البكسل**`,
  );
  assert(
    Math.abs(atMid.x) > 0.5 && Math.abs(atMid.x - expectAtKf) > 0.5,
    `وقيمتُه (${atMid.x.toFixed(3)}) ليست صفرًا ولا قيمةَ المفتاح (${expectAtKf.toFixed(3)}) — فالبندُ قاسَ استقراءً لا قراءةَ مفتاح`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ٤. ذهابٌ وإيابٌ عبر الحفظ التلقائيّ، بلا تدويرٍ صامت
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n٤. الحفظُ التلقائيُّ يَحمل ما كُتِب بالحرف');
  await selectKfByIndex(page, 'head', 'x', 0);
  await typeValue(page, String(want));
  await page.waitForTimeout(1100); // تأخيرُ الحفظ التلقائيّ ٧٠٠ms
  const saved = await savedTrack(page, 'head', 'x');
  const savedKf = saved.track && saved.track.find((k) => Math.abs(k.value) > 1e-9);
  assert(
    savedKf !== undefined && savedKf !== null,
    `والمسارُ محفوظٌ وفيه مفتاحٌ بقيمةٍ غيرِ صفريّة (${JSON.stringify(saved.track)})`,
  );
  const wantStored = want / 100;
  assert(
    savedKf && savedKf.value === wantStored,
    `**والقيمةُ المحفوظةُ هي المكتوبةُ بالضبط**: ${savedKf && savedKf.value} === ${wantStored} — مساواةٌ صارمةٌ لا تقريب`,
  );
  assert(
    saved.text.includes(`"value":${wantStored}`) || saved.text.includes(`"value": ${wantStored}`),
    `وهي كذلك في بايتات الملفّ نفسِها («"value":${wantStored}» موجودةٌ في الحِمل المحفوظ) — فلا تدويرَ عند حدِّ الحفظ`,
  );

  await page.reload();
  await resumeAfterReload(page);
  await openProTimeline(page);
  await selectKfByIndex(page, 'head', 'x', 0);
  assert(
    (await field(page).inputValue()) === String(want),
    `**وبعد تحميلٍ حقيقيٍّ يَقرأ الحقلُ ما كُتِب**: «${await field(page).inputValue()}» = «${want}»`,
  );
  const afterReload = await paintedOffset(page, 'head');
  assert(
    Math.abs(afterReload.x - expectAtKf) < 1,
    `والرسمُ بعد التحميل ${afterReload.x.toFixed(3)} بكسلًا، والمتوقَّعُ ${expectAtKf.toFixed(3)} — فرقٌ ${Math.abs(afterReload.x - expectAtKf).toFixed(4)}`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ٥. إيماءةٌ واحدة، خطوةُ تراجعٍ واحدةٌ مُسمّاة
  // ═══════════════════════════════════════════════════════════════════════
  // طَرْقُ «0.74» أربعُ ضغطاتٍ، وكلُّ ضغطةٍ تُغيّر المستند — فعلى `main` كانت
  // أربعَ خطواتٍ مجهولةَ الاسم (ومقيسٌ هناك: سحبةُ مِمسحةٍ واحدةٌ كلّفت **خمسَ**
  // ضغطاتِ تراجع). والقاعدةُ مكتوبةٌ عند `pushHistory`: كلُّ ما يُغيّر المستند
  // خطوةٌ **واحدةٌ مُسمّاة**.
  console.log('\n٥. إيماءةٌ واحدةٌ = خطوةٌ واحدةٌ مُسمّاة');
  const before5 = Number(await field(page).inputValue());
  await typeValue(page, '12.34');
  assert(Number(await field(page).inputValue()) === 12.34, `والحقلُ عند «12.34» قبل التراجع (${await field(page).inputValue()})`);
  const undo = page.getByRole('button', { name: 'تراجع' });
  assert(
    (await undo.getAttribute('title')) === 'تراجع: قيمة المفتاح',
    `**وخطوةُ التراجع مُسمّاة**: تلميحُ الزرّ «${await undo.getAttribute('title')}» — وعلى \`main\` كان «تراجع» مجرَّدًا، لأنّ الفعلَ كان يَدفع بلا اسم`,
  );
  await undo.click();
  await page.waitForTimeout(300);
  await selectKfByIndex(page, 'head', 'x', 0);
  assert(
    Number(await field(page).inputValue()) === before5,
    `**وضغطةُ تراجعٍ واحدةٌ تَرجع بالإيماءةِ كلِّها** إلى ${before5} (قرأ ${await field(page).inputValue()}) — لا إلى منزلةٍ وسيطةٍ من الطَّرْق (12.3 أو 12 أو 1)`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ٦. السطحانِ لا يَفترقان بحال
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n٦. المِمسحةُ والحقلُ جوابٌ واحد');
  // ٦٫١ طَرْقٌ أدقُّ من الشبكة: كلاهما يُقصُره إلى المنزلتَين نفسِهما
  await typeValue(page, String(pctOf(WANT_PX)));
  const pair = { f: await field(page).inputValue(), s: await slider(page).inputValue() };
  assert(
    Number(pair.f) === Number(pair.s) && Number(pair.f) === want,
    `وطَرْقُ «${pctOf(WANT_PX)}» — أدقَّ من الشبكة — يَستقرّ على «${want}» في السطحَين معًا (الحقل «${pair.f}»، المِمسحة «${pair.s}»): القَصرُ في قُمعٍ واحدٍ لا في سطحَين`,
  );

  // ٦٫٢ سحبةٌ حقيقيّةٌ على المِمسحة: الحقلُ يَتبعها حرفًا
  const sb = await slider(page).boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2 + 9, sb.y + sb.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const dragged = { f: await field(page).inputValue(), s: await slider(page).inputValue() };
  assert(
    Number(dragged.f) === Number(dragged.s),
    `**وسحبةُ مؤشّرٍ حقيقيّةٌ على المِمسحة يَقرؤها الحقلُ رقمًا واحدًا** (الحقل «${dragged.f}»، المِمسحة «${dragged.s}») — الطريقُ السريعُ يَكتب من القُمع نفسِه`,
  );
  assert(
    Number(dragged.s) !== want,
    `والسحبةُ غيّرت القيمةَ فعلًا (${want} ← ${dragged.s}) — فالطريقُ السريعُ حيٌّ لا معروضٌ`,
  );

  // ٦٫٣ خارجَ المدى: السطحانِ يَقِفان عند حدٍّ واحد
  await typeValue(page, '150');
  const capped = { f: await field(page).inputValue(), s: await slider(page).inputValue() };
  assert(
    Number(capped.f) === 100 && Number(capped.s) === 100,
    `و«150» — وهي خارجُ مدى المِمسحة — تَستقرّ على ١٠٠ في السطحَين (الحقل «${capped.f}»، المِمسحة «${capped.s}»)؛ و\`min\`/\`max\` على \`type="number"\` إرشادٌ لا حدّ، فالقَصرُ في القُمع`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ٧. إزاحةٌ ثانيةٌ ليست مُضاعَفًا — والخصيصةُ ليست x وحدها
  // ═══════════════════════════════════════════════════════════════════════
  console.log(`\n٧. ${WANT2_PX} بكسلًا على مسار y`);
  const want2 = authorable(WANT2_PX);
  assert(
    Math.abs(WANT2_PX / OLD_GRID_PX - Math.round(WANT2_PX / OLD_GRID_PX)) > 0.1,
    `و${WANT2_PX} بكسلًا كذلك ليست مُضاعَفًا لـ${OLD_GRID_PX} (${(WANT2_PX / OLD_GRID_PX).toFixed(4)} من الخطوة)`,
  );
  await addAndSelectKf(page, 'head', 'y', 0.5);
  await typeValue(page, String(want2));
  const atY = await paintedOffset(page, 'head');
  const expectY = (want2 / 100) * DOC_W;
  assert(
    Math.abs(atY.y - expectY) < 1,
    `والرسمُ على المحور الرأسيّ ${atY.y.toFixed(3)} بكسلًا والمتوقَّعُ ${expectY.toFixed(3)} — فرقٌ ${Math.abs(atY.y - expectY).toFixed(4)}. و\`y\` كـ\`x\` كسرٌ من **العرض** لا الارتفاع`,
  );
  assert(
    Math.abs(atY.y - WANT2_PX) < 1,
    `وهي ${WANT2_PX} بكسلًا المطلوبةُ إلى ${Math.abs(atY.y - WANT2_PX).toFixed(4)} بكسلًا`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ٨. ضابطان
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n٨. ضابطان');
  // ٨٫١ تكبيرُ الشاشة لا يَتسرّب إلى القياس
  //
  // ولِمَ بندٌ لهذا: البنودُ أعلاه تَقرأ `m.e` من المصفوفة المحسوبة وتُسمّيها
  // «بكسلَ مستند». ولو كان في تلك القراءة تكبيرُ الشاشة لانقلب كلُّ بندٍ هنا عند
  // منفذٍ آخر. فيُقاس المنفذانِ لا منفذٌ واحد.
  const wideScale = atY.screenScale;
  await page.setViewportSize({ width: 1040, height: 780 });
  await page.waitForTimeout(700);
  const narrow = await paintedOffset(page, 'head');
  assert(
    narrow.screenScale < wideScale - 0.01,
    `ومنفذٌ أضيقُ يُكبّر اللوحَ بمعامِلٍ آخرَ فعلًا (${narrow.screenScale.toFixed(4)} بعد ${wideScale.toFixed(4)}) — فالضابطُ قاسَ تكبيرَين لا واحدًا`,
  );
  assert(
    Math.abs(narrow.y - atY.y) < 0.01,
    `**والإزاحةُ المقروءةُ لا تَتغيّر بتكبير الشاشة** (${narrow.y.toFixed(4)} = ${atY.y.toFixed(4)}) — فهي بكسلُ مستندٍ كما ادّعى هذا الملفّ، لا بكسلُ شاشة`,
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(400);

  // ٨٫٢ الحقلُ يَملك مفاتيحَه: مؤشّرُ الكتابة يَتحرّك داخلَ الرقم
  //
  // `onTrackKeyDown` على حاضن الخطّ الزمنيّ يَملك `←`/`→` لتنقّلِ الإطارات
  // ويُنادي `preventDefault` — ومنبثقةُ المفتاح **داخلَ** ذلك الحاضن. فلولا
  // إيقافُ الانتشار عمّا صدر عن مُدخَلٍ لَما تَحرّك مؤشّرُ الكتابة داخلَ رقمٍ
  // مكتوب، ولَما استطاع أحدٌ تصحيحَ منزلةٍ واحدة.
  await selectKfAtPlayhead(page, 'head', 'y');
  await typeValue(page, '1.23');
  await field(page).click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('9');
  await page.waitForTimeout(260);
  assert(
    (await field(page).inputValue()) === '1.923',
    `**ومؤشّرُ الكتابة يَتحرّك داخلَ الرقم**: «1.23» ثم سهمانِ لليسار ثم «9» تُعطي «1.923» (قرأ «${await field(page).inputValue()}») — ولو أكلَ الحاضنُ السهمَين لَكانت «1.239»`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  assert(pageErrors.length === 0, `ولا خطأَ في وحدة التحكّم خلال الملفّ كلّه (${pageErrors.slice(0, 3).join(' | ') || 'لا شيء'})`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });
  try {
    await run(page, pageErrors);
  } catch (e) {
    assert(false, `وانقطع الملفُّ قبل تمامه: ${String(e && e.message ? e.message : e).split('\n')[0]}`);
  } finally {
    await browser.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (failures.length) {
      console.log('\nFailures:');
      for (const f of failures) console.log('  -', f);
    }
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
