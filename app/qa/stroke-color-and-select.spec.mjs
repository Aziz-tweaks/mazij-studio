#!/usr/bin/env node
// عطلان أبلغ عنهما المالك وهو يستعمل البرنامج، مقيسان قبل الإصلاح وبعده بأحداث
// مؤشّرٍ ولوحةِ مفاتيح حقيقيّة. ولا بابَ خلفيًّا هنا: كلُّ `page.evaluate` إمّا
// **تقرأ** الـDOM أو المحفوظَ الذي كتبه البرنامج بنفسه، أو تنادي وحدةً إنتاجيّةً
// على مستندٍ بَنته الواجهة.
//
// ═══════════════════════════════════════════════════════════════════════════
// (١) «في الصور ما أقدر أغيّر لون الحدود للشكل»
// ═══════════════════════════════════════════════════════════════════════════
// صفُّ «الحدود» في لوح الخصائص كان **مفتاحًا وسُمكًا بلا لون**، ولونُه مثبَّتٌ
// في الكود على `pal.fg`:
//
//     onClick={() => actions.setShapeStroke(el.id, el.stroke ? null : pal.fg)}
//
// وكومةُ المظهر (البند ١٧) لم تُغنِ عنه، وهذا مقيسٌ لا مُستنتَج:
//
//   (أ) محرّرُ الطبقات محجوبٌ خلف `isPro` (`PropsTab.tsx` — `{isPro && (…
//       <AppearanceSection …>)}`)، والوضعُ البسيط هو الافتراضيّ. فمن لم يبدّل
//       الوضع — وهو لا يعرف أصلًا أن هناك ما يُبدَّل — لا يرى في البرنامج كلّه
//       سطحًا واحدًا يُختار فيه لونُ حدّ.
//
//   (ب) والصفُّ الذي **يراه** كان زرًّا ميّتًا على أكثر الأشكال: `setShapeStroke`
//       تكتب الحقلَ القديم `el.stroke` وحده، بينما `currentAppearance` تُفضّل
//       الكومة متى وُجدت، و`normalizeDoc` تُجسّد كومةً **لكلّ عنصر** عند كلّ
//       فتحٍ (`StudioContext.tsx:178`). والقياسُ بالضغط الحقيقيّ على مستطيلٍ من
//       المكتبة: المستندُ المحفوظ يحمل `stroke: "#FFFFFF"` و`appearance.strokes: []`،
//       و`getComputedStyle(…).border` يبقى `0px none` — حالةٌ تتغيّر ولا شيء
//       يُرسَم. وهو بعينه العطلُ الذي أُصلِح للتعبئة بـ`withBaseLayerColor`، تُرك
//       فيه الحدُّ وحده خلفًا.
//
//   (ج) وحتى على شكلٍ لا كومةَ له (مرسومٍ بالسحب)، كان الإيقادُ يُنتج
//       `border: 0px solid rgb(255,255,255)` — فالشكلُ يُولَد بـ`strokeWidth: 0`،
//       وحدٌّ بسُمك صفرٍ لا يرسم بكسلًا.
//
// فالقرار: **لا نظامَ ثانيًا موازيًا**. الصفُّ البسيط صار نافذةً على
// `strokes[0]` من كومةِ المظهر نفسِها — يقرأ ما يُرسَم ويكتب فيه — كما صار صفُّ
// التعبئة قبله. وما يبقى احترافيًّا هو **تعدّدُ الطبقات** (الترتيب والمزج
// والموضع والشفافيّة)، لا القدرةُ على اختيار لون.
//
// ═══════════════════════════════════════════════════════════════════════════
// (٢) «إذا مرّيت فيه من شريط التمرير اللي تحت يحدّد ويتحوّل الشريط حقّ الوقت أزرق»
// ═══════════════════════════════════════════════════════════════════════════
// `startScrub` في `Timeline.tsx` كانت تَأخذ الضغطةَ ولا تَمنع فعلَها الأصليّ،
// فكان السحبُ يبدأ تحديدَ نصٍّ أصليًّا. والقياسُ قبل الإصلاح بسحبةٍ حقيقيّة:
// `String(getSelection())` تُرجع `"0s"` على المسطرة و`"بدون"` على شريط المسارات،
// وتبقى بعد رفع الإصبع.
//
// **والعلاجُ عند مَصدر الحركة لا على السطح.** الثقوبُ ثلاثةٌ وكلُّها تَصِل إلى
// `startScrub` وحدها:
//
//   • المسطرة (`Timeline.tsx` — `onPointerDown={onRulerPointerDown}` ثم `startScrub`)
//   • خلفيّةُ شريط المسارات (`onPointerDown={startScrub}`)
//   • و**الفراغُ داخل صفّ مقطع**: `Clip.tsx` تَرجع عند `hit.kind === 'emptyRow'`
//     **قبل** سطرِ `preventDefault` الذي يليها — قصدًا، لتصعد الضغطةُ إلى
//     `timeline-tracks` فتُحرّك المؤشّر. فالثقبُ الثالثُ هو الأوّلان نفسُهما.
//
// فسطرُ `preventDefault` واحدٌ في `startScrub` يُغلقها جميعًا — وهو القاعدةُ
// القائمة في المجلّد نفسِه (`Clip.tsx` تفعلها لضغطةِ صفّ المقطع)، لا قاعدةً
// جديدة.
//
// **ولا `user-select: none` في هذا الإصلاح.** جُرّبت على السطح الزمنيّ أوّلًا
// وأدّت الغرض، ثم قيسَ أن `preventDefault` وحدها تُغلق الثقوبَ الثلاثة — فسقط
// التصريحُ الأوسع لأنه لا يَشتري شيئًا ويُطفئ تحديدَ نصوصٍ لم يَطلب أحدٌ إطفاءها.
// ولذلك يَقيس هذا القسمُ أن النمطَ المحسوب على المسطرة والمسارات **ليس** `none`:
// أي أن العطلَ أُغلِق **بلا** مصادرةِ قابليّةِ التحديد من أي سطح. وهذا أقوى من
// «حقلُ النصّ ما زال يُحدَّد»، فهو يَنفي الإصلاحَ الكاسح عن السطح نفسِه لا عن
// جاره. وحقلا النصّ مقيسان كذلك، لأنهما ما يَكسره الإصلاحُ الكاسح.
//
// وعائقٌ ظهر بالقياس أثناء هذا الإصلاح، ويُسجَّل لأنه كان سيَمضي صامتًا:
// `startScrub` كانت تُنادي `e.currentTarget.focus()`، والمضغوطُ (المسطرة/الشريط/
// مقبضُ المؤشّر) **لا `tabIndex` فيه** — فالنداءُ بلا أثر، والذي كان يُركّز
// السطحَ فعلًا هو فعلُ الضغطة الأصليّ (المتصفّح يُركّز أقربَ سَلَفٍ قابلٍ
// للتركيز، وهو حاوية `trackWrapRef`). فمنعُ الفعل أسقط التركيزَ إلى `BODY`
// وأسكتَ مفاتيحَ النقل كلَّها. فصار التركيزُ يُنادى على الحاوية صريحًا،
// ومفاتيحُ النقل تُقاس هنا **بعد ضغطةٍ** لا من فراغ.
//
// التشغيل: node qa/stroke-color-and-select.spec.mjs   (خادم التطوير على :1420)
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

/** لونُ علامةٍ تجاريّة لا تعطيه أيُّ لوحةٍ في `PALETTES` — فلا يمكن أن يُصادَف
 * بالخطأ من شريحةٍ جاهزة. مأخوذٌ من ألوان هدف `t02-kashida` الأربعة، كما في
 * `qa/appearance-hex.spec.mjs`. */
const BRAND = '#d93025';
const BRAND_RGB = 'rgb(217, 48, 37)';

const lastElId = (page) =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all.length ? all[all.length - 1].getAttribute('data-el-id') : null;
  });

/** يضع شكلًا من المكتبة بنقرتين حقيقيّتين: الأداة ثم البطاقة. وشكلُ المكتبة هو
 * الحالةُ الحرجة — يُولَد بكومةِ مظهرٍ مخزّنة (`libraryAppearance`). */
async function placeTile(page, tile) {
  // مكتبة الأشكال في «عناصر» بشريط الإضافة؛ زرّ الشكل في حبّة الأدوات يُسلِّح فقط (٢٤ أكتوبر ٢٠٢٦).
  if (!(await page.locator('[data-shape-tile]').count())) await page.locator('[data-panel-tab="library"]').click();
  await page.waitForTimeout(320);
  await page.locator(`[data-shape-tile="${tile}"]`).click();
  await page.waitForTimeout(520);
  return lastElId(page);
}

/** يكتب في حقلٍ كما يكتب إنسان: تحديدُ المحتوى ثم ضغطاتُ مفاتيح حقيقيّة. لا
 * `fill()` — وهو نفسُه ما أخفى عطلَ فقدان التركيز عن الاختبارات في
 * `qa/appearance-hex.spec.mjs`. */
async function typeInto(page, locator, value) {
  await locator.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(String(value), { delay: 20 });
  await page.waitForTimeout(140);
}

/** العنصرُ كما حفظه البرنامج بنفسه في التخزين المحليّ — قراءةٌ لا كتابة. */
async function savedElement(page, elId) {
  await page.waitForTimeout(950);
  return page.evaluate(
    ({ key, id }) => {
      const raw = JSON.parse(window.localStorage.getItem(key) || 'null');
      if (!raw) return null;
      for (const ab of raw.artboards) {
        const el = ab.doc.elements.find((e) => e.id === id);
        if (el) return { stroke: el.stroke, strokeWidth: el.strokeWidth, fill: el.fill, appearance: el.appearance };
      }
      return null;
    },
    { key: AUTOSAVE_KEY, id: elId },
  );
}

/** `border` المحسوب على الصندوق الذي يرسم الشكل فعلًا — أي ما تراه العين. */
const paintedBorder = (page, elId) =>
  page.evaluate((id) => {
    const host = document.querySelector(`[data-el-id="${id}"]`);
    if (!host) return null;
    for (const n of [host, ...host.querySelectorAll('*')]) {
      const cs = getComputedStyle(n);
      if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') {
        return { width: cs.borderTopWidth, color: cs.borderTopColor, shadow: cs.boxShadow };
      }
    }
    return { width: '0px', color: null, shadow: getComputedStyle(host).boxShadow };
  }, elId);

const computedUserSelect = (page, selector) =>
  page.evaluate((s) => {
    const n = document.querySelector(s);
    return n ? getComputedStyle(n).userSelect : 'absent';
  }, selector);

const selectionText = (page) => page.evaluate(() => String(window.getSelection()));
const clearSelection = (page) => page.evaluate(() => window.getSelection().removeAllRanges());

/** سحبةٌ أفقيّة على سطحٍ، وقراءةُ التحديد **قبل** رفع الإصبع وبعده — فالاصطباغ
 * الذي أبلغ عنه المالك يحدث في منتصف السحب. */
async function pressDragAcross(page, box, yFrac = 0.5) {
  await clearSelection(page);
  const y = box.y + box.height * yFrac;
  await page.mouse.move(box.x + 6, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 6, y, { steps: 24 });
  const during = await selectionText(page);
  await page.mouse.up();
  await page.waitForTimeout(80);
  const after = await selectionText(page);
  return { during, after };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ١. لونُ حدّ الشكل — في الوضع البسيط، بلا بحث
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n١. لونُ حدّ الشكل في الوضع البسيط');
  await bootBlank(page, BASE_URL, 'ig-portrait');

  const rect = await placeTile(page, 'rect');

  // كان هنا: «الوضعُ الافتراضيّ: محرّرُ كومة المظهر غائبٌ عن الـDOM» — حجّةً لِمَ يحتاج
  // صفُّ «الحدود» السريع لونًا حرًّا. ألغى المالك الوضعين (٢٤ أكتوبر ٢٠٢٦) فصار المحرّر
  // حاضرًا للجميع، وتبقى الحجّة: الصفّ السريع هو طريق اللون بنقرة. المقيس الآن أنّ
  // الاثنين حاضران، والصفّ لم يُنزَع لأجل المحرّر.
  assert(
    (await page.locator(`[data-testid="appearance-add-stroke-${rect}"]`).count()) === 1,
    'بلا وضعين: محرّرُ كومة المظهر حاضرٌ لكلّ مصمّم — وصفّ «الحدود» السريع باقٍ بجانبه (أدناه)',
  );

  const toggle = page.locator(`[data-testid="shape-stroke-toggle-${rect}"]`);
  assert((await toggle.count()) === 1, 'صفُّ «الحدود» موجودٌ في الوضع البسيط بمفتاحٍ له معرّفٌ ثابت');
  assert(
    (await page.locator(`[data-testid="shape-stroke-color-${rect}"]`).count()) === 0,
    'ولا مُدخَلَ لونٍ ما لم يكن هناك حدٌّ — الحقولُ تتبع الحالة، لا تُعرَض معطّلةً',
  );

  // ضغطةٌ واحدة: إيقادُ الحدّ.
  await toggle.click();
  await page.waitForTimeout(260);

  const colorWell = page.locator(`[data-testid="shape-stroke-color-${rect}"]`);
  const hexField = page.locator(`[data-testid="shape-stroke-hex-${rect}"]`);
  const widthField = page.locator(`[data-testid="shape-stroke-width-${rect}"]`);
  assert(
    (await colorWell.count()) === 1 && (await hexField.count()) === 1 && (await widthField.count()) === 1,
    'وبعد ضغطةٍ واحدة على المفتاح: مُدخَلُ لونٍ وحقلُ ستّ عشريٍّ وسُمك — ثلاثةُ سطوحٍ في الوضع الافتراضيّ بلا تبديلِ وضعٍ ولا بحثٍ عن لوح',
  );

  const onPaint = await paintedBorder(page, rect);
  assert(
    parseFloat(onPaint.width) >= 2,
    `والإيقادُ يرسم حدًّا حقيقيًّا على شكلٍ من المكتبة (${onPaint.width}) — قبل الإصلاح كان \`appearance.strokes\` يبقى فارغًا و\`border\` يبقى \`0px none\` مهما ضُغط المفتاح`,
  );

  const onSaved = await savedElement(page, rect);
  assert(
    onSaved.appearance.strokes.length === 1 && onSaved.appearance.strokes[0].width >= 2,
    `والمستندُ المحفوظ يحمل طبقةَ حدٍّ واحدة بسُمكٍ غيرِ صفر (${onSaved.appearance.strokes.length} طبقة، سُمك ${onSaved.appearance.strokes[0]?.width}) — ولا سُمكَ صفرٍ يُنتج «نشِط» بلا شيءٍ على الشاشة`,
  );

  // ─── اللون: يُكتَب ستّ عشريًّا حرفًا حرفًا ───
  await typeInto(page, hexField, BRAND);
  await page.waitForTimeout(220);

  const brandPaint = await paintedBorder(page, rect);
  assert(brandPaint.color === BRAND_RGB, `اللونُ المكتوب هو اللونُ المرسوم: ${BRAND} → ${brandPaint.color}`);

  const brandSaved = await savedElement(page, rect);
  assert(
    brandSaved.appearance.strokes[0].color.toLowerCase() === BRAND && brandSaved.appearance.strokes[0].colorToken === null,
    `وطبقةُ الحدّ في المستند تحمله لونًا صريحًا لا رمزَ لوحة (${brandSaved.appearance.strokes[0].color}, token=${String(brandSaved.appearance.strokes[0].colorToken)})`,
  );
  assert(
    String(brandSaved.stroke).toLowerCase() === BRAND,
    `والحقلُ القديم \`stroke\` يُكتَب معها فلا يتناقض الاثنان (${brandSaved.stroke}) — وهو ما تقرؤه جسورُ MCP والمستنداتُ المحفوظة قبل البند ١٧`,
  );

  // ─── السُّمك من الصفّ نفسه ───
  await typeInto(page, widthField, 12);
  await page.waitForTimeout(220);
  const widthPaint = await paintedBorder(page, rect);
  const widthSaved = await savedElement(page, rect);
  assert(
    widthPaint.width === '12px' && widthSaved.appearance.strokes[0].width === 12,
    `والسُّمكُ يَمرّ إلى الطبقة نفسِها (مرسوم ${widthPaint.width}، محفوظ ${widthSaved.appearance.strokes[0].width}) — لا حقلَين يكتبان في مكانين`,
  );

  // ─── دورةُ الحفظ والفتح: إعادةُ تحميلٍ حقيقيّة ثم بطاقةُ المتابعة ───
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(400);

  const afterReloadSaved = await savedElement(page, rect);
  assert(
    afterReloadSaved.appearance.strokes[0].color.toLowerCase() === BRAND && afterReloadSaved.appearance.strokes[0].width === 12,
    `وبعد إعادةِ تحميلٍ حقيقيّة ودخولٍ من بطاقة المتابعة: اللونُ والسُّمك كما تُركا (${afterReloadSaved.appearance.strokes[0].color} / ${afterReloadSaved.appearance.strokes[0].width}) — و\`normalizeDoc\` هي التي تُجسّد الكومة عند كل فتح، فهذا الطريقُ بعينه هو ما كان يقتل الحقلَ القديم`,
  );
  const afterReloadPaint = await paintedBorder(page, rect);
  assert(
    afterReloadPaint.color === BRAND_RGB && afterReloadPaint.width === '12px',
    `وما يُرسَم بعد الفتح هو ما حُفظ (${afterReloadPaint.width} ${afterReloadPaint.color})`,
  );

  await page.locator(`[data-el-id="${rect}"]`).click({ force: true });
  await page.waitForTimeout(220);
  const wellAfterReload = await page.locator(`[data-testid="shape-stroke-color-${rect}"]`).inputValue();
  assert(
    wellAfterReload.toLowerCase() === BRAND,
    `والصفُّ نفسُه يقرأ المحفوظ بعد الفتح (${wellAfterReload}) — لأنه يقرأ الطبقة التي تَرسم، لا حقلًا موازيًا`,
  );

  // ─── «بدون» لا يُفقد الخطَّ المفتوح ───
  // شكلُ المكتبة المفتوح كومتُه **طبقةُ حدٍّ واحدة بلا تعبئة**. فحذفُ الطبقة عند
  // الإطفاء كان سيُفرِغ الكومة فتعود `migrateAppearance` وتبني تعبئةً من
  // `el.fill` — فيصير الخطُّ صندوقًا معبَّأً. ولهذا يُخفى ولا يُحذَف.
  const line = await placeTile(page, 'line');
  const lineToggleBefore = await page.locator(`[data-testid="shape-stroke-toggle-${line}"]`).textContent();
  assert(
    lineToggleBefore.trim() === 'فعّل',
    `وخطُّ المكتبة يقول «فعّل» (${lineToggleBefore.trim()}) — فحدُّه مرسومٌ أمام العين، وكان الصفُّ يقول «بدون» لأنه يقرأ الحقلَ القديم لا الطبقة`,
  );
  await page.locator(`[data-testid="shape-stroke-toggle-${line}"]`).click();
  await page.waitForTimeout(260);
  const lineAfterOff = await page.locator(`[data-el-id="${line}"] svg path`).evaluate((n) => ({
    fill: n.getAttribute('fill'),
    stroke: n.getAttribute('stroke'),
    width: Number(n.getAttribute('stroke-width') || 0),
  }));
  assert(
    lineAfterOff.fill === 'none' && (lineAfterOff.stroke === 'none' || lineAfterOff.width === 0),
    `و«بدون» على الخطّ يُطفئ حدَّه ولا يحوّله إلى صندوقٍ معبَّأ (fill=${lineAfterOff.fill}, stroke=${lineAfterOff.stroke}, w=${lineAfterOff.width})`,
  );
  const lineSaved = await savedElement(page, line);
  assert(
    lineSaved.appearance.strokes.length === 1 && lineSaved.appearance.strokes[0].visible === false,
    `والطبقةُ مخفيّةٌ لا محذوفة (${lineSaved.appearance.strokes.length} طبقة، visible=${String(lineSaved.appearance.strokes[0]?.visible)}) — فالإطفاءُ قابلٌ للرجوع، والكومةُ لا تُفرَغ فتُستأنَف الترحيلة`,
  );

  // ─── كومةٌ واحدة لا نظامان: ما كُتب في الصفّ البسيط يراه محرّرُ الطبقات ───
  // لا «بسيط/احترافي» منذ ٢٤ أكتوبر ٢٠٢٦ (قرار المالك: «العمق يُطلب ولا يُفرض») — كلّ الأدوات حاضرة.
  await page.waitForTimeout(260);
  // يُحدَّد من سطر طبقته لا بنقرةٍ على اللوحة: الخطُّ وُضع بعده فهو فوقه في
  // الترتيب، ونقرةٌ على موضع المستطيل كانت ستُصيب الخطّ.
  await page.locator(`[data-testid="layer-name-${rect}"]`).click();
  await page.waitForTimeout(300);
  const proHex = await page
    .locator(`[data-testid^="appearance-stroke-${rect}-"][data-testid$="-hex"]`)
    .first()
    .inputValue();
  assert(
    proHex.toLowerCase() === BRAND,
    `والوضعُ الاحترافيّ يرى اللونَ نفسَه في طبقةِ الحدّ القاعديّة (${proHex}) — سطحان على كومةٍ واحدة، لا نظامان متوازيان`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ٢. لا تحديدَ نصٍّ على السطح الزمنيّ
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n٢. السحبُ على الخطّ الزمنيّ لا يُحدِّد نصًّا');
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await bootBlank(page, BASE_URL, 'ig-reel');
  const clipShape = await placeTile(page, 'rect');
  await page.waitForSelector('[data-testid="timeline-ruler"]');
  await page.waitForTimeout(200);

  const rulerBox = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  const tBefore = await page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
  const rulerDrag = await pressDragAcross(page, rulerBox);
  assert(
    rulerDrag.during === '',
    `سحبةٌ على المسطرة لا تُحدِّد شيئًا **في منتصف السحب** (${JSON.stringify(rulerDrag.during)}) — وقبل الإصلاح كانت تُرجع "0s" فتصطبغ علاماتُ الزمن بأزرق التحديد تحت الإصبع`,
  );
  assert(rulerDrag.after === '', `ولا بعد رفعه (${JSON.stringify(rulerDrag.after)}) — فلا يبقى الشريطُ أزرق بعد انتهاء السحب`);

  const tAfter = await page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
  assert(
    tAfter > tBefore,
    `والسحبةُ نفسُها تُحرّك المؤشّرَ كما كانت (${tBefore} → ${tAfter}) — مُنِع فعلُ الضغطة الأصليّ ولم تُعطَّل الحركة`,
  );

  // مفاتيحُ النقل **بعد ضغطة**: `preventDefault` تُسقط التركيزَ الذي كان فعلُ
  // الضغطة يَمنحه، فبلا تركيزٍ صريحٍ على حاوية السطح تَسكُت هذه المفاتيحُ كلُّها.
  // **الحاويةُ أقربُ سَلَفٍ يحمل `tabIndex`** لا أبُ المسطرة المباشر: منذ تكبير الخطّ
  // الزمنيّ (٢٥ أكتوبر ٢٠٢٦) تقع المسطرةُ والمسارات داخل لوحٍ داخليّ يتّسع بالتكبير
  // (`timeline-canvas`) ويُمرَّر داخل الحاوية نفسها — فصار أبوها ذلك اللوح. والقرارُ
  // المقيس هنا لم يتغيّر: التركيزُ على صاحبة `tabIndex` لا على `body`.
  const keyFocus = await page.evaluate(() => {
    const ruler = document.querySelector('[data-testid="timeline-ruler"]');
    const host = ruler.parentElement.closest('[tabindex]');
    return !!host && document.activeElement === host && host.querySelector('[data-testid="timeline-canvas"]') !== null;
  });
  assert(keyFocus, 'والضغطةُ تُركّز حاويةَ السطح الزمنيّ (صاحبةَ `tabIndex`) لا تُسقط التركيزَ إلى `body`');
  const tKey0 = await page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
  await page.keyboard.press('Home');
  await page.waitForTimeout(140);
  const tKeyHome = await page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(140);
  const tKeyRight = await page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
  assert(
    tKeyHome === 0 && tKeyRight > 0,
    `ومفاتيحُ النقل تعمل **بعد** تلك الضغطة: Home ← ${tKey0} → ${tKeyHome}، ثم سهمٌ واحد → ${tKeyRight}`,
  );

  const tracksBox = await page.locator('[data-testid="timeline-tracks"]').boundingBox();
  const tracksDrag = await pressDragAcross(page, tracksBox, 0.85);
  assert(
    tracksDrag.during === '' && tracksDrag.after === '',
    `وخلفيّةُ شريط المسارات كذلك (${JSON.stringify(tracksDrag.during)}/${JSON.stringify(tracksDrag.after)}) — وهي ما كان يُرجع "بدون" من نصّ المقطع`,
  );

  // ─── الثقبُ الثالث: الفراغُ **داخل** صفّ مقطع ───
  // `Clip.tsx` تَرجع عند `emptyRow` قبل `preventDefault` قصدًا فتصعد الضغطةُ إلى
  // `timeline-tracks`. ويُفرَّغ جزءٌ من الصفّ أوّلًا بتقليمٍ حقيقيّ لحافّة المقطع،
  // وإلّا لَمَلأ المقطعُ الصفَّ كلَّه ولم يوجد فراغٌ يُضغَط.
  const clipRow = await page.locator('[data-testid="timeline-tracks"] > *').first().boundingBox();
  await page.mouse.move(clipRow.x + clipRow.width - 3, clipRow.y + clipRow.height / 2);
  await page.mouse.down();
  await page.mouse.move(clipRow.x + clipRow.width * 0.45, clipRow.y + clipRow.height / 2, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const tRow0 = await page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
  const rowDrag = await pressDragAcross(page, { x: clipRow.x + clipRow.width * 0.72, y: clipRow.y, width: clipRow.width * 0.26, height: clipRow.height });
  const tRow1 = await page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
  assert(
    rowDrag.during === '' && rowDrag.after === '',
    `والفراغُ داخل صفّ المقطع كذلك (${JSON.stringify(rowDrag.during)}/${JSON.stringify(rowDrag.after)}) — وهو مَسلكٌ ثالثٌ يَصِل إلى \`startScrub\` نفسِها`,
  );
  assert(tRow1 !== tRow0, `وتلك الضغطةُ تُحرّك المؤشّرَ فعلًا (${tRow0} → ${tRow1}) — فالمقيسُ هو المَسلكُ المقصود لا ضغطةٌ مُبتلَعة`);

  // ─── ولا قابليّةَ تحديدٍ صُودِرت من أيّ سطح ───
  // هذا ما يَنفي «الإصلاحَ الكاسح» عن السطح نفسِه: العطلُ أُغلِق بلا `user-select`
  // على المسطرة ولا على الشريط، فلو نُسخ نصُّ علامةٍ من المسطرة بغير سحبةِ تمرير
  // لأمكن. والفرقُ ليس نظريًّا: التصريحُ الكاسح يُورَّث إلى كل ما تحته.
  const surfaceSelect = {
    ruler: await computedUserSelect(page, '[data-testid="timeline-ruler"]'),
    tracks: await computedUserSelect(page, '[data-testid="timeline-tracks"]'),
    playhead: await computedUserSelect(page, '[data-testid="timeline-playhead"]'),
  };
  assert(
    surfaceSelect.ruler !== 'none' && surfaceSelect.tracks !== 'none' && surfaceSelect.playhead !== 'none',
    `والنمطُ المحسوب على المسطرة والمسارات والمؤشّر ليس \`none\` (${JSON.stringify(surfaceSelect)}) — العطلُ أُغلِق عند مَصدر الحركة، فلا قابليّةَ تحديدٍ صُودِرت من سطحٍ ولا وُرِّث مَنعٌ إلى ما تحته`,
  );

  // ─── وحقلُ نصٍّ حقيقيٌّ ما زال يُحدَّد ───
  // حقلُ إعادة تسمية الطبقة يعيش في `Timeline.tsx` نفسِه، تحت الجذر الذي كان
  // الإصلاحُ الكاسح سيُصرَّح عليه — فهو ما يَكسره ذلك الإصلاح.
  await page.locator(`[data-testid="layer-name-${clipShape}"]`).dblclick();
  await page.waitForTimeout(240);
  const renameInput = page.locator(`[data-testid="layer-rename-input-${clipShape}"]`);
  assert((await renameInput.count()) === 1, 'حقلُ إعادة تسمية الطبقة يُفتَح بنقرةٍ مزدوجة كما كان');
  await renameInput.click();
  await page.keyboard.type('مربع الخلفية', { delay: 12 });
  await page.waitForTimeout(140);

  const renameUserSelect = await computedUserSelect(page, `[data-testid="layer-rename-input-${clipShape}"]`);
  assert(
    renameUserSelect !== 'none',
    `والنمطُ المحسوب على ذلك الحقل ليس \`none\` (${renameUserSelect}) — وهو أوّلُ ما يَكسره تصريحٌ كاسحٌ على جذر الخطّ الزمنيّ، إذ يعيش الحقلُ تحته`,
  );

  const rnBox = await renameInput.boundingBox();
  await page.mouse.move(rnBox.x + rnBox.width - 6, rnBox.y + rnBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rnBox.x + 4, rnBox.y + rnBox.height / 2, { steps: 20 });
  const rnSel = await renameInput.evaluate((n) => ({ start: n.selectionStart, end: n.selectionEnd, value: n.value }));
  await page.mouse.up();
  assert(
    rnSel.end - rnSel.start === rnSel.value.length && rnSel.value.length > 0,
    `وسحبةٌ حقيقيّةٌ داخله تُحدِّد نصَّه كلَّه (${rnSel.start}..${rnSel.end} من «${rnSel.value}») — فالكتابةُ والنسخُ والاستبدالُ باقيةٌ كما كانت`,
  );
  await page.keyboard.type('مربع الخلفية', { delay: 10 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(240);
  const renamed = await page.locator(`[data-testid="layer-name-${clipShape}"]`).getAttribute('title');
  assert(renamed === 'مربع الخلفية', `والاسمُ الجديد يُثبَّت فعلًا (${renamed}) — لا حقلٌ يُحدَّد ثم لا يُكتَب فيه`);

  // ─── وحقلُ نصٍّ خارج الخطّ الزمنيّ كذلك ───
  await page.locator(`[data-el-id="${clipShape}"]`).click({ force: true });
  await page.waitForTimeout(220);
  await page.locator(`[data-testid="shape-stroke-toggle-${clipShape}"]`).click();
  await page.waitForTimeout(240);
  const panelHex = page.locator(`[data-testid="shape-stroke-hex-${clipShape}"]`);
  const panelSelect = await computedUserSelect(page, `[data-testid="shape-stroke-hex-${clipShape}"]`);
  assert(panelSelect !== 'none', `وحقلُ لون الحدّ في لوح الخصائص ليس \`none\` كذلك (${panelSelect})`);
  const pBox = await panelHex.boundingBox();
  await page.mouse.move(pBox.x + pBox.width - 4, pBox.y + pBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(pBox.x + 3, pBox.y + pBox.height / 2, { steps: 16 });
  const pSel = await panelHex.evaluate((n) => ({ start: n.selectionStart, end: n.selectionEnd, value: n.value }));
  await page.mouse.up();
  assert(
    pSel.end - pSel.start === pSel.value.length && pSel.value.length > 0,
    `وسحبةٌ داخله تُحدِّد كلَّ قيمته (${pSel.start}..${pSel.end} من «${pSel.value}») — فلصقُ لونِ علامةٍ تجاريّة ما زال ممكنًا`,
  );

  assert(pageErrors.length === 0, `ولا خطأَ تشغيلٍ في الجولة كلّها (${pageErrors.length})${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(' | ')}` : ''}`);

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(' -', f));
  }
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
