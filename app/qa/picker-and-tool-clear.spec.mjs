#!/usr/bin/env node
// قرارانِ أمر بهما المالك، وكلُّ ما كَسَراه مُصلَحٌ ومقيسٌ هنا. ولا بابَ خلفيًّا
// في هذا الملفّ: كلُّ `page.evaluate` إمّا **تقرأ** الـDOM أو المحفوظَ الذي كتبه
// البرنامج بنفسه، أو تُركّب حدثَ إفلاتِ ملفٍّ كما يُركّبه المتصفّح. وكلُّ ضغطةٍ
// وكتابةٍ تمرّ بأحداثِ مؤشّرٍ ولوحةِ مفاتيح حقيقيّة.
//
// ═══════════════════════════════════════════════════════════════════════════
// (١) مُنتقِي ألوانٍ حرٌّ على **التعبئة** وعلى **حدّ الصورة** كما صار على حدّ الشكل
// ═══════════════════════════════════════════════════════════════════════════
// ورقةُ `docs/re-vectorcraft-interaction.md` أوصت بترك هذا، وحجّتُها أنّ صفَّ
// التعبئة لا مُنتقِيَ له فإعطاءُ الحدّ واحدًا يُبدِل عدمَ تناظرٍ بآخر. وقرارُ
// المالك: **القدرةُ لا التناظرُ بالنقص** — فالصفّان يأخذانه معًا.
//
// وحدُّ **الصورة** كان على المسار الميّت نفسِه الذي كان عليه حدُّ الشكل قبل
// `8ca9c8c`، وبعطبٍ ثالثٍ فوقه. وثلاثتُها مقيسةٌ هنا:
//
//   (أ) **لا لونَ يُختار أصلًا.** الزرُّ كان `setImageStroke(el.id, el.stroke ?
//       null : pal.fg)` — اللونُ مثبَّتٌ في الكود. ومحرّرُ الطبقات محجوبٌ خلف
//       `isPro` والوضعُ البسيطُ هو الافتراضيّ، فلم يكن في البرنامج كلِّه سطحٌ
//       يُختار فيه لونُ حدِّ صورة.
//
//   (ب) **الإيقادُ لا يرسم بكسلًا.** الصورةُ تُولَد بـ`strokeWidth: 0`
//       (`StudioContext.tsx` عند إنشاء عنصر الصورة)، و`legacyBorderCss`
//       (`lib/appearance.ts`) تُخرِج `0px solid …` — فالمفتاح يقول «نشِط» ولا
//       شيءَ على الشاشة. **من أوّل ضغطة، بلا إعادةِ تحميل.**
//
//   (ج) **وبعد دورةِ حفظٍ وفتحٍ يموت اللون.** `setImageStroke` تكتب الحقلَ
//       القديم `el.stroke` وحده، و`normalizeDoc` تُجسّد كومةَ مظهرٍ لكلّ عنصر
//       عند كل فتح — فالكومةُ تسبق الحقلَ القديم في `currentAppearance`، ومسارُ
//       التصيير يقرأ `resolveAppearance` وحدها.
//
// والعلاجُ هو عينُه الذي أُصلِح به حدُّ الشكل، و**الثلاثُ مساعداتٍ تُطبَّق كما
// هي**: `withBaseStroke` و`withBaseStrokeWidth` و`withBaseStrokeHidden`.
//
// **والشرائحُ تبقى.** مُنتقٍ **فوق** الشرائح أكثرُ من الشرائح وحدها، فلا يُنزَع
// طريقٌ سريعٌ ليُضاف بطيء — وهذا مقيسٌ صريحًا في القسم ١.
//
// ═══════════════════════════════════════════════════════════════════════════
// (٢) تسليحُ أداةٍ يَنزع التحديد — والكسرُ الذي يُسبّبه مُصلَح
// ═══════════════════════════════════════════════════════════════════════════
// الورقةُ أوصت بترك هذا أيضًا، وحجّتُها أنّ `switch_tool` في المصدر لا تَمسّ
// التحديدَ ولا تستطيع. وقرارُ المالك: يُنزَع. وكسرانِ يُصلَحان لا يُبلَّغ عنهما:
//
//   **الأوّل — مسودّةُ القلم تُلقى بلا خطوةِ تراجع.** عطلٌ قائمٌ قبل هذا العمل:
//   `penDraft: []` **مسحٌ** حيث المصدرُ **يُثبِّت**، وتعليقُه الحاكم
//   (`vectorcraft/crates/tools/src/pen.rs:360`): «clearing state alone leaves
//   its transaction open». فمن وضع ثلاثَ نقاطٍ ثم ضغط `V` فقد الثلاث ولا `⌘Z`
//   يُرجعها. والإصلاحُ: المُغادِرةُ **تَختم** عملَها ثم تُهدَم.
//
//   **الثاني — الارتدادُ بعد الإنشاء.** خمسةُ مواضعَ في `Stage.tsx` تُنادي
//   `setTool('select')` **بعد** إنشاء عنصرٍ وتحديده (الشكلُ بالسحب، والنصُّ،
//   والصورةُ، واللوتي، والفيديو). فالنزعُ غيرُ المشروط كان سيُنتج أسوأَ ممّا
//   يُصلحه: ترسم شكلًا فلا تجده محدَّدًا، ولا مقابضَ عليه، ولوحُ الخصائص فارغٌ
//   عن شيءٍ صنعتَه قبل جزءٍ من الثانية. والقدرةُ محفوظةٌ ببابٍ واحدٍ مُعلَن
//   (`keepSelection`)، ومقيسةٌ في القسم ٤.
//
// **و«أكمِل هذا المسار» — القدرةُ التي قالت الورقةُ إنّ النزعَ يقتلها — غيرُ
// موجودةٍ في مزيج أصلًا، فلا تُقتَل.** قاعدةُ المصدر `active_path(cx)`
// (`crates/tools/src/pen.rs:429-431`) تُعرِّف «المسارَ الذي يُرسَم الآن» بأنه
// المسارُ المفتوحُ الوحيدُ المحدَّد؛ وقلمُ مزيجٍ لا يقرأ التحديدَ بحرف — يقرأ
// `penDraft` وحده، ويبدأ مسوّدةً جديدةً دائمًا. والنفيُ مقيسٌ في القسم ٥: مسارٌ
// محدَّدٌ ثم تسليحُ القلم ثم نقطتان ⇒ **عنصرٌ جديد**، والمحدَّدُ لم تُزَد نقاطُه.
// وتحريرُ مسارٍ قائمٍ في مزيج بابُه وضعُ تحرير العقد، ومدخلُه `startNodeEdit`
// التي تضبط الأداةَ والتحديدَ معًا في رُقعةٍ واحدة — فلا تَعبُر المُوَدِّع.
//
// التشغيل: QA_PORT=<منفذ حرّ> QA_SPECS=picker-and-tool-clear npm test
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

/** ثلاثةُ ألوانِ علامةٍ تجاريّة **لا تعطيها أيُّ لوحةٍ في `PALETTES`** — فلا
 * يمكن أن يُصادَف أحدُها بالخطأ من شريحةٍ جاهزة، وهذا هو كلُّ الغرض: المُنتقِي
 * الحرُّ يُقاس بما لا تَصِله الشرائح. مأخوذةٌ من ألوان هدف `t02-kashida`، كما في
 * `qa/appearance-hex.spec.mjs` و`qa/stroke-color-and-select.spec.mjs`. */
const BRAND = '#d93025';
const BRAND_RGB = 'rgb(217, 48, 37)';
const BRAND2 = '#1f8f55';
const BRAND2_RGB = 'rgb(31, 143, 85)';
const BRAND3 = '#12382a';
const BRAND3_RGB = 'rgb(18, 56, 42)';

const RED_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAwAAFAAwJAP+Vx3dXAAAAAElFTkSuQmCC';

const elIds = (page) => page.evaluate(() => [...document.querySelectorAll('[data-el-id]')].map((n) => n.getAttribute('data-el-id')));
const elCount = async (page) => (await elIds(page)).length;
const lastElId = async (page) => {
  const all = await elIds(page);
  return all.length ? all[all.length - 1] : null;
};

/** **التحديدُ مقروءٌ من الحالة، لا مُستنتَجٌ من لونِ خلفيّة.** صفوفُ قائمة
 * الطبقات تحمل `data-selected` الذي تكتبه `Timeline.tsx` من
 * `state.selectedIds.includes(el.id)` حرفيًّا — والتعليقُ هناك يقول إنّ الحقلَ
 * وُضع لأنّ سؤال التحديد «سؤالٌ عن حالةٍ لا عن لون». فهذا هو سطحُ قراءةِ الحالة
 * المعتمَدُ في البرنامج، وقائمةُ الطبقات معروضةٌ في الوضعين وفي الطبيعتين. */
const selectedSet = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-layer-id]')].filter((n) => n.getAttribute('data-selected') === 'true').map((n) => n.getAttribute('data-layer-id')),
  );

/** طولُ سجلّ التراجع كما يُعلنه الزرُّ نفسُه (`data-history-past` في
 * `TopBar.tsx`) — وتعليقُه يقول إنّ عددَ الخطوات «مقروءٌ على الزرّ» لأنه «سؤالٌ
 * لا يُجاب بالعين». فهو الجوابُ عن «خطوةٌ واحدةٌ بالضبط». */
const historyPast = (page) => page.locator('[data-testid="undo-btn"]').evaluate((n) => Number(n.getAttribute('data-history-past')));
const historyFuture = (page) => page.locator('[data-testid="redo-btn"]').evaluate((n) => Number(n.getAttribute('data-history-future')));

/** الأداةُ المسلَّحة، مقروءةً من زرّ الشريط المُضاء — نفسُ الدالّة التي يستعملها
 * `qa/still-post-journey.spec.mjs`، فلا قاعدةَ قراءةٍ ثانية. */
const armedTool = (page) =>
  page.evaluate(() => {
    const on = [...document.querySelectorAll('[data-tool]')].find((e) => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)');
    return on ? on.getAttribute('data-tool') : null;
  });

async function placeTile(page, tile) {
  await page.locator('[data-tool="shape"]').click();
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
        if (el) return { type: el.type, shape: el.shape, points: el.points, stroke: el.stroke, strokeWidth: el.strokeWidth, fill: el.fill, appearance: el.appearance };
      }
      return null;
    },
    { key: AUTOSAVE_KEY, id: elId },
  );
}

/** لونُ الخلفيّة الذي يرسم تعبئةَ الشكل فعلًا — أي ما تراه العين. */
const paintedFill = (page, elId) =>
  page.evaluate((id) => {
    const host = document.querySelector(`[data-el-id="${id}"]`);
    if (!host) return null;
    for (const n of [host, ...host.querySelectorAll('*')]) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    }
    return null;
  }, elId);

/** `border` المحسوب على الصندوق الذي يرسم الحدَّ فعلًا. */
const paintedBorder = (page, elId) =>
  page.evaluate((id) => {
    const host = document.querySelector(`[data-el-id="${id}"]`);
    if (!host) return null;
    for (const n of [host, ...host.querySelectorAll('*')]) {
      const cs = getComputedStyle(n);
      if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') {
        return { width: cs.borderTopWidth, color: cs.borderTopColor };
      }
    }
    return { width: '0px', color: null };
  }, elId);

/** يُفلِت ملفَّ صورةٍ حقيقيًّا على اللوحة — نفسُ تركيبِ الحدث الذي يستعمله
 * `qa/image-editing.spec.mjs`، لأن `insertImageTool` تفتح حوارَ نظامٍ لا يُقاد
 * من متصفّح. والمستندُ التجريبيّ لا يُجدي هنا: صورتُه بلا `src`، وصفُّ الحدّ
 * محجوبٌ خلف `{el.src && …}`. */
async function dropImage(page) {
  const before = await elCount(page);
  await page.evaluate(async (b64) => {
    const res = await fetch(`data:image/png;base64,${b64}`);
    const blob = await res.blob();
    const file = new File([blob], 'brand.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const target = document.querySelector('[data-testid="artboard"]');
    const rect = target.getBoundingClientRect();
    const clientX = rect.left + rect.width * 0.5;
    const clientY = rect.top + rect.height * 0.5;
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
  }, RED_PNG_B64);
  await page.waitForTimeout(600);
  assert((await elCount(page)) === before + 1, 'إفلاتُ ملفِّ صورةٍ حقيقيٍّ على اللوحة يُنشئ عنصرَ صورةٍ واحدًا — وهو المستندُ الذي يُقاس عليه حدُّ الصورة');
  return lastElId(page);
}

/** يُسلِّح أداةً باختصارِ حرفٍ واحد — وهو **طريقُ المصمّم** إلى التسليح، ويمرّ
 * بـ`openToolLibrary` بعينها التي يمرّ بها زرُّ الشريط (`Stage.tsx`).
 *
 * **ولا نقرةَ على اللوحة قبل الضغطة.** كانت هنا نقرةٌ على خلفيّة اللوحة لضمان
 * ألّا يكون التركيزُ في حقلٍ نصّيّ — وهي **تُفرِغ التحديدَ بنفسها**
 * (`onBackgroundPointerDown` ⇒ `selectNone`). فكان القسمُ ٤ يَمرّ لسببٍ خاطئ:
 * النقرةُ تنزع التحديدَ، لا التسليح. قيسَ ذلك حين فشل بندُ «الأداةُ نفسُها»:
 * توقَّع بقاءَ التحديد فوجده `[]` — والنازعُ كان النقرة. والضغطةُ لا تحتاجها
 * أصلًا: المُستمِعُ على `window` ولا يشترط إلا ألّا يكون الهدفُ قابلًا للتحرير
 * (`isEditableTarget` في `Stage.tsx`)، والتركيزُ بعد نقرةِ زرٍّ هو على زرّ. */
async function armByKey(page, code) {
  await page.keyboard.press(code);
  await page.waitForTimeout(300);
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
  // ١. تعبئةُ الشكل — مُنتقٍ حرٌّ **فوق** الشرائح، في الوضع البسيط
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n١. تعبئةُ الشكل: مُنتقٍ حرٌّ مع بقاء الشرائح');
  await bootBlank(page, BASE_URL, 'ig-portrait');

  // شكلُ المكتبة هو الحالةُ الحرجة: يُولَد بكومةِ مظهرٍ مخزّنة (`libraryAppearance`)،
  // فهو الذي كان يكشف انفصالَ الحقل القديم عن الطبقة التي تَرسم.
  const rect = await placeTile(page, 'rect');

  assert(
    (await page.locator(`[data-testid="appearance-add-fill-${rect}"]`).count()) === 0,
    'الوضعُ الافتراضيّ: محرّرُ كومة المظهر غائبٌ عن الـDOM — فهو ليس طريقَ المالك إلى لونٍ حرّ، وهذا سببُ عدم إغناء البند ١٧ عن هذا الصفّ',
  );

  // **الطريقُ السريعُ لم يُنزَع ليُضاف البطيء** — والشاهدُ ليس وجودَ أزرارٍ بل
  // أنّ ضغطةً واحدةً عليها ما زالت تَصبغ الشكل.
  const swatchCount = await page.locator('button[title^="#"]').count();
  assert(swatchCount >= 3, `وشرائحُ اللوحة باقيةٌ في الصفّ (${swatchCount} شريحة) — المُنتقِي أُضيف فوقها`);
  const swatchHex = await page.locator('button[title^="#"]').first().getAttribute('title');
  await page.locator('button[title^="#"]').first().click();
  await page.waitForTimeout(300);
  const swatchPaint = await paintedFill(page, rect);
  const swatchExpected = await page.evaluate((hex) => {
    const d = document.createElement('div');
    d.style.backgroundColor = hex;
    document.body.appendChild(d);
    const out = getComputedStyle(d).backgroundColor;
    d.remove();
    return out;
  }, swatchHex);
  assert(
    swatchPaint === swatchExpected,
    `وضغطةٌ واحدةٌ على شريحةٍ ما زالت تَصبغ الشكل (${swatchHex} → ${swatchPaint}) — فالطريقُ السريعُ يعمل، لا أنه موجودٌ في الـDOM وحده`,
  );

  const fillWell = page.locator(`[data-testid="shape-fill-color-${rect}"]`);
  const fillHexField = page.locator(`[data-testid="shape-fill-hex-${rect}"]`);
  assert(
    (await fillWell.count()) === 1 && (await fillHexField.count()) === 1,
    'وصفُّ «اللون» فيه مُدخَلُ لونٍ حرٌّ وحقلٌ ستّ عشريٌّ — بلا تبديلِ وضعٍ ولا بحثٍ عن لوح. وقبل هذا العمل كان الصفُّ خمسَ شرائحَ من اللوحة ولا شيءَ غيرها',
  );
  assert(
    (await fillWell.getAttribute('type')) === 'color',
    'والمُدخَلُ `type="color"` — فضاءُ لونٍ كامل لا لوحةٌ ثابتة، وهو ما طلبه المالك بالحرف',
  );

  // ─── لونٌ لا تُعطيه أيُّ لوحة، يُكتَب حرفًا حرفًا ───
  await typeInto(page, fillHexField, BRAND);
  await page.waitForTimeout(260);

  const fillPaint = await paintedFill(page, rect);
  assert(fillPaint === BRAND_RGB, `لونٌ خارجَ كلّ الشرائح يصل إلى الطبقة المرسومة: ${BRAND} → ${fillPaint}`);

  const fillSaved = await savedElement(page, rect);
  assert(
    fillSaved.appearance.fills[0].color.toLowerCase() === BRAND && fillSaved.appearance.fills[0].colorToken === null,
    `وطبقةُ التعبئة في المستند تحمله لونًا صريحًا لا رمزَ لوحة (${fillSaved.appearance.fills[0].color}, token=${String(fillSaved.appearance.fills[0].colorToken)})`,
  );
  assert(String(fillSaved.fill).toLowerCase() === BRAND, `والحقلُ القديم \`fill\` يُكتَب معها فلا يتناقض الاثنان (${fillSaved.fill}) — وهو ما تقرؤه جسورُ MCP`);

  // ─── دورةُ الحفظ والفتح: إعادةُ تحميلٍ حقيقيّة ثم بطاقةُ المتابعة ───
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(400);

  const fillAfterReload = await savedElement(page, rect);
  assert(
    fillAfterReload.appearance.fills[0].color.toLowerCase() === BRAND,
    `وبعد إعادةِ تحميلٍ حقيقيّة ودخولٍ من بطاقة المتابعة: اللونُ كما تُرك (${fillAfterReload.appearance.fills[0].color})`,
  );
  assert((await paintedFill(page, rect)) === BRAND_RGB, `وما يُرسَم بعد الفتح هو ما حُفظ (${await paintedFill(page, rect)})`);

  await page.locator(`[data-el-id="${rect}"]`).click({ force: true });
  await page.waitForTimeout(260);
  const wellAfterReload = await page.locator(`[data-testid="shape-fill-color-${rect}"]`).inputValue();
  assert(
    wellAfterReload.toLowerCase() === BRAND,
    `والمُنتقِي نفسُه يقرأ المحفوظ بعد الفتح (${wellAfterReload}) — لأنه يقرأ الطبقةَ التي تَرسم (\`baseLayerColorOf\`)، لا حقلًا موازيًا`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ٢. حدُّ الشكل — اللونُ الحرُّ يصل ويبقى (بلونٍ ثانٍ، فلا يكون الأوّلُ مصادفة)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n٢. حدُّ الشكل: لونٌ حرٌّ ثانٍ يصل ويبقى');
  await page.locator(`[data-testid="shape-stroke-toggle-${rect}"]`).click();
  await page.waitForTimeout(280);
  await typeInto(page, page.locator(`[data-testid="shape-stroke-hex-${rect}"]`), BRAND2);
  await page.waitForTimeout(260);

  const strokePaint = await paintedBorder(page, rect);
  assert(
    strokePaint.color === BRAND2_RGB && parseFloat(strokePaint.width) >= 2,
    `حدُّ الشكل يَقبل لونًا حرًّا ويرسمه بسُمكٍ غيرِ صفر (${strokePaint.width} ${strokePaint.color})`,
  );
  const strokeSaved = await savedElement(page, rect);
  assert(
    strokeSaved.appearance.strokes[0].color.toLowerCase() === BRAND2 && strokeSaved.appearance.strokes[0].colorToken === null,
    `وطبقةُ الحدّ تحمله صريحًا (${strokeSaved.appearance.strokes[0].color})`,
  );

  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(400);
  const strokeAfterReload = await paintedBorder(page, rect);
  assert(
    strokeAfterReload.color === BRAND2_RGB,
    `ويبقى بعد دورةِ الحفظ والفتح (${strokeAfterReload.color}) — والتعبئةُ والحدُّ لونانِ مختلفانِ على عنصرٍ واحد، فلا يُكتب أحدُهما فوق الآخر`,
  );
  assert((await paintedFill(page, rect)) === BRAND_RGB, `وتعبئتُه ما زالت على لونها هي (${await paintedFill(page, rect)}) — صفّانِ على كومةٍ واحدة، لا نظامانِ متوازيان`);

  // ═══════════════════════════════════════════════════════════════════════
  // ٣. حدُّ الصورة — الأعطالُ الثلاثة
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n٣. حدُّ الصورة: لونٌ يُختار، وسُمكٌ يُرسَم، ويبقى بعد الفتح');
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await bootBlank(page, BASE_URL, 'ig-portrait');

  const img = await dropImage(page);
  await page.locator(`[data-el-id="${img}"]`).click({ force: true });
  await page.waitForTimeout(300);

  const imgToggle = page.locator(`[data-testid="image-stroke-toggle-${img}"]`);
  assert((await imgToggle.count()) === 1, 'صفُّ حدّ الصورة له مفتاحٌ بمعرّفٍ ثابت، كصفّ حدّ الشكل');
  assert(
    (await page.locator(`[data-testid="image-stroke-color-${img}"]`).count()) === 0,
    'ولا مُدخَلَ لونٍ ما لم يكن هناك حدٌّ — الحقولُ تتبع الحالة، لا تُعرَض معطّلةً',
  );

  await imgToggle.click();
  await page.waitForTimeout(300);

  const imgWell = page.locator(`[data-testid="image-stroke-color-${img}"]`);
  const imgHexField = page.locator(`[data-testid="image-stroke-hex-${img}"]`);
  assert(
    (await imgWell.count()) === 1 && (await imgHexField.count()) === 1 && (await page.locator(`[data-testid="image-stroke-width-${img}"]`).count()) === 1,
    'العطل (أ): بعد ضغطةٍ واحدة — مُدخَلُ لونٍ وحقلٌ ستّ عشريٌّ وسُمك. وكان الزرُّ يُثبّت `pal.fg` في الكود فلا لونَ يُختار أصلًا',
  );

  const imgOnPaint = await paintedBorder(page, img);
  assert(
    parseFloat(imgOnPaint.width) >= 2,
    `العطل (ب): الإيقادُ يرسم حدًّا حقيقيًّا (${imgOnPaint.width}) — والصورةُ تُولَد بـ\`strokeWidth: 0\`، فكان «نشِط» يَصدُق في الحالة ولا بكسلَ على الشاشة`,
  );
  // **والسُّمكُ في المستند لا على الشاشة وحدها.** وصورةٌ لم تُجسَّد كومتُها بعد
  // تُكتَب في حقولها القديمة وحدها — وهو **عقدُ `withBaseStroke` المكتوب**: تُرجِع
  // `el.appearance` بلا تغيير متى لا كومةَ هناك، فيبقى `migrateAppearance` هو
  // العاملَ كما كان بالحرف. فالمقروءُ هنا هو ما كُتب فعلًا، لا كومةٌ لم تُطلَب.
  const imgOnSaved = await savedElement(page, img);
  assert(
    imgOnSaved && imgOnSaved.strokeWidth >= 2 && imgOnSaved.appearance === undefined,
    `والمستندُ المحفوظ يحمل سُمكًا غيرَ صفر (${imgOnSaved?.strokeWidth}) ولا كومةَ مظهرٍ مُجسَّدة (${String(imgOnSaved?.appearance)}) — وهذا عقدُ \`withBaseStroke\` بعينه: لا كومةَ تُخترَع لعنصرٍ لم يَطلبها، فلا يتغيّر مسارُ عنصرٍ قائم`,
  );

  await typeInto(page, imgHexField, BRAND);
  await page.waitForTimeout(260);
  const imgBrandPaint = await paintedBorder(page, img);
  assert(imgBrandPaint.color === BRAND_RGB, `ولونٌ خارجَ كلّ الشرائح يصل إلى حدّ الصورة المرسوم: ${BRAND} → ${imgBrandPaint.color}`);

  // **ويُنتظَر الحفظُ قبل إعادة التحميل، ويُقرأ.** `savedElement` تَنتظر دورةَ
  // الحفظ التلقائيّ ثم تقرأ ما كُتب — وبدونها كانت إعادةُ التحميل تَسبق الحفظَ
  // فتُقاس اللونُ الذي قبله. (قيسَ ذلك: أعطت `rgb(255,255,255)` — وهو `pal.fg`
  // الذي ضبطه المفتاحُ عند الإيقاد، لا اللونُ المكتوب.)
  const imgBrandSaved = await savedElement(page, img);
  assert(
    String(imgBrandSaved.stroke).toLowerCase() === BRAND,
    `والمستندُ المحفوظ يحمله قبل أيّ إعادةِ تحميل (${imgBrandSaved.stroke})`,
  );

  // ─── العطل (ج): الدورةُ التي كانت تقتل اللون ───
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(400);
  const imgAfterReload = await paintedBorder(page, img);
  assert(
    imgAfterReload.color === BRAND_RGB && parseFloat(imgAfterReload.width) >= 2,
    `وبعد دورةِ الحفظ والفتح: اللونُ والسُّمك كما تُركا (${imgAfterReload.width} ${imgAfterReload.color}) — و\`normalizeDoc\` هي التي تُجسّد الكومة عند كل فتح، فهذا الطريقُ بعينه هو ما كان يقتل الحقلَ القديم`,
  );

  // وأحسمُ من ذلك: **تغييرٌ ثانٍ بعد الفتح.** هنا بالضبط كان حدُّ الصورة ميّتًا:
  // الكومةُ مُجسَّدةٌ الآن، فالكتابةُ في الحقل القديم وحده لا تصل إلى ما يُرسَم.
  await page.locator(`[data-el-id="${img}"]`).click({ force: true });
  await page.waitForTimeout(300);
  await typeInto(page, page.locator(`[data-testid="image-stroke-hex-${img}"]`), BRAND3);
  await page.waitForTimeout(280);
  const imgSecondPaint = await paintedBorder(page, img);
  assert(
    imgSecondPaint.color === BRAND3_RGB,
    `**وتغييرُ اللون بعد الفتح يصل** (${BRAND3} → ${imgSecondPaint.color}) — وهذا هو موضعُ الموت بعينه: الكومةُ مُجسَّدةٌ و\`resolveAppearance\` وحدها تَرسم`,
  );
  const imgSecondSaved = await savedElement(page, img);
  assert(
    imgSecondSaved.appearance.strokes.length === 1 && imgSecondSaved.appearance.strokes[0].color.toLowerCase() === BRAND3 && String(imgSecondSaved.stroke).toLowerCase() === BRAND3,
    `**وهنا تُجسَّد الكومةُ فيُكتَب فيها** (${imgSecondSaved.appearance.strokes[0].color}) **والحقلُ القديم معها** (${imgSecondSaved.stroke}) — فلا يتناقض الاثنان، ولا يبقى واحدٌ يَرسم والآخرُ يُقرأ. وقبل هذا العمل كان المكتوبُ هو الحقلَ القديم وحده والمرسومُ هو الكومة`,
  );

  // ─── و«بدون» إخفاءٌ لا حذف، كالشكل ───
  await page.locator(`[data-testid="image-stroke-toggle-${img}"]`).click();
  await page.waitForTimeout(300);
  const imgOffSaved = await savedElement(page, img);
  assert(
    imgOffSaved.appearance.strokes.length === 1 && imgOffSaved.appearance.strokes[0].visible === false,
    `و«بدون» يُخفي الطبقةَ ولا يحذفها (${imgOffSaved.appearance.strokes.length} طبقة، visible=${String(imgOffSaved.appearance.strokes[0]?.visible)}) — فالإطفاءُ قابلٌ للرجوع، و\`withBaseStrokeHidden\` تُطبَّق كما هي`,
  );
  assert(parseFloat((await paintedBorder(page, img)).width) === 0, 'ولا حدَّ على الشاشة بعدها');

  // ═══════════════════════════════════════════════════════════════════════
  // ٤. تسليحُ أداةٍ يَنزع التحديد — والارتدادُ بعد الإنشاء لا يَنزعه
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n٤. تسليحُ أداةٍ يَنزع التحديد');
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await bootBlank(page, BASE_URL, 'ig-portrait');

  const selRect = await placeTile(page, 'rect');
  assert(
    JSON.stringify(await selectedSet(page)) === JSON.stringify([selRect]),
    `شكلٌ من المكتبة يُوضَع محدَّدًا — هذه هي الحالةُ الابتدائيّة المقروءةُ من \`state.selectedIds\` (${JSON.stringify(await selectedSet(page))})`,
  );

  // **الحكمُ المركزيُّ للقرار الثاني.** مقروءٌ من الحالة (`data-selected`)، لا من
  // اختفاءِ حلقةٍ أو لونِ خلفيّة.
  await armByKey(page, 'KeyT');
  assert(
    (await selectedSet(page)).length === 0,
    `**تسليحُ أداةٍ أخرى (مفتاح T) يَنزع التحديدَ عن كلّ شيء** — ${JSON.stringify(await selectedSet(page))}. قبل هذا العمل كان \`setTool\`/\`openToolLibrary\` لا تَمسّان \`selectedIds\` ولا \`sel\` بحرف`,
  );

  // وتأكيدٌ سلوكيٌّ على المستند لا على الواجهة: لا محدَّدَ ⇒ `Delete` لا تحذف.
  const beforeDel = await elCount(page);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  assert((await elCount(page)) === beforeDel, 'وبرهانٌ على المستند: `Delete` بعد التسليح لا تحذف شيئًا — فالتحديدُ فارغٌ في الحالة فعلًا، لا في العرض وحده');

  // والضابطُ الذي يمنع أن تكون النتيجةُ السابقةُ من معالِجٍ ميّت: نُعيد التحديد
  // من سطرِ طبقته، فتحذف `Delete` فعلًا.
  await page.locator(`[data-testid="layer-name-${selRect}"]`).click();
  await page.waitForTimeout(280);
  assert(JSON.stringify(await selectedSet(page)) === JSON.stringify([selRect]), 'ونقرةُ سطرِ الطبقة تُعيد التحديد — فالمسارُ حيّ');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  assert((await elCount(page)) === beforeDel - 1, 'و`Delete` تحذف فعلًا متى كان هناك محدَّد — فالضابطُ يُثبت أنّ عدمَ الحذف قبله كان من فراغِ التحديد لا من معالِجٍ معطوب');

  // ─── والضغطةُ على الأداة **المسلَّحة أصلًا** لا شيء، فلا تَنزع ───
  //
  // وهذا حدُّ القرار، ووُجد بالقياس لا بالرأي. بُنيَ النزعُ غيرَ مشروطٍ أوّلًا —
  // على الحرف الظاهر لـ«تسليحُ أيّ أداة» — فسقط `qa/appearance-stack.spec.mjs:180`:
  // يرسم شكلًا بالسحب ثم يضغط زرَّ «تحديد» وهو مسلَّحٌ أصلًا بحكم الارتداد،
  // فيفقد الشكلَ المرسومَ لتوّه ويَخلو محرّرُ الطبقات. والقاعدةُ المانعةُ مأخوذةٌ
  // من `vectorcraft/crates/engine/src/tooling.rs:86-88`، وفيها عودةٌ مبكّرةٌ
  // صريحةٌ قبل التوديع: `if self.tool.id() == id { return Ok(()) }`.
  //
  // فالقرارُ قائمٌ بحرفه حيث له معنًى: كلُّ **تبديلٍ** يَنزع (وهو ما يُقاس أعلاه
  // بمفتاح T). والضغطةُ على المسلَّحة ليست تسليحًا بل لا شيء.
  const sameRect = await placeTile(page, 'rect');
  assert(JSON.stringify(await selectedSet(page)) === JSON.stringify([sameRect]), 'شكلٌ ثانٍ، محدَّدٌ ابتداءً');
  assert((await armedTool(page)) === 'select', 'والأداةُ المسلَّحةُ «تحديد» بحكم الارتداد بعد الوضع من المكتبة');
  await armByKey(page, 'KeyV');
  assert(
    JSON.stringify(await selectedSet(page)) === JSON.stringify([sameRect]),
    `وضغطُ V وأداةُ «تحديد» مسلَّحةٌ أصلًا **لا تَنزع** (${JSON.stringify(await selectedSet(page))}) — إعادةُ ضغطِ الأداة نفسِها لا تفعل شيئًا، ولا شيءَ لا يَنزع شيئًا. وبدون هذا الحدّ يفقد المصمّمُ تحديدَه بضغطةٍ بلا معنًى، وهو الضررُ نفسُه الذي يحرسه \`keepSelection\` في الارتداد`,
  );
  // وأنّ الحدَّ حدٌّ لا ثقبٌ: تبديلٌ حقيقيٌّ من هذه الحالة بعينها يَنزع.
  await armByKey(page, 'KeyR');
  assert(
    (await selectedSet(page)).length === 0,
    `ثم تبديلٌ حقيقيٌّ من الحالة نفسِها (R) يَنزع (${JSON.stringify(await selectedSet(page))}) — فالحدُّ على «الأداةُ نفسُها» وحدها، لا ثقبٌ في القاعدة`,
  );

  // ─── والقدرةُ التي كان النزعُ سيقتلها: الارتدادُ بعد الإنشاء ───
  // هذا هو الكسرُ الثاني، محفوظًا ومقيسًا. والسحبُ بأداة الأشكال هو أوضحُ
  // المواضع الخمسة، لأن `Stage.tsx` تُنادي فيه `setTool('select')` **بعد**
  // `addShapeElement` التي حدَّدت الشكلَ لتوّها.
  const beforeDraw = await elCount(page);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(320);
  await page.mouse.move(ab.x + ab.width * 0.2, ab.y + ab.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(ab.x + ab.width * 0.5, ab.y + ab.height * 0.45, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(520);
  const drawn = await lastElId(page);
  assert((await elCount(page)) === beforeDraw + 1, 'سحبةٌ بأداة الأشكال تُنشئ شكلًا');
  assert(
    JSON.stringify(await selectedSet(page)) === JSON.stringify([drawn]),
    `**والشكلُ المرسومُ للتوّ يبقى محدَّدًا** (${JSON.stringify(await selectedSet(page))}) — وهذه هي القدرةُ التي كان النزعُ غيرُ المشروط سيقتلها: \`Stage.tsx\` تَرتدّ إلى «تحديد» بعد الإنشاء، فالارتدادُ ليس تسليحًا ويُعلن ذلك بـ\`keepSelection\``,
  );
  const drawnHandles = await page.locator('[data-testid="selection-handles"]').count();
  assert(drawnHandles === 1, 'ومقابضُه مرسومةٌ عليه — فالقدرةُ محفوظةٌ على الشاشة كما في الحالة');

  // ═══════════════════════════════════════════════════════════════════════
  // ٥. مسودّةُ القلم تُثبَّت عند التسليح — بخطوةِ تراجعٍ واحدةٍ بالضبط
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n٥. مسودّةُ القلم تُثبَّت لا تُلقى');
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await bootBlank(page, BASE_URL, 'ig-portrait');
  await page.getByRole('button', { name: 'احترافي', exact: true }).click();
  await page.waitForTimeout(300);

  const penBoard = await page.locator('[data-testid="artboard"]').boundingBox();
  const beforePenEls = await elCount(page);
  const beforePenHistory = await historyPast(page);

  await page.locator('[data-tool="pen"]').click();
  await page.waitForTimeout(320);

  // ثلاثُ نقاطٍ متباعدةٍ جيّدًا: متقاربةٌ على أوّلِها تُغلِق المسارَ وتُثبّته
  // بنفسها (`ANCHOR_HIT_PX` في `Stage.tsx`)، فتُقاس ميزةٌ أخرى لا هذه.
  const pts = [
    { x: penBoard.x + penBoard.width * 0.25, y: penBoard.y + penBoard.height * 0.3 },
    { x: penBoard.x + penBoard.width * 0.7, y: penBoard.y + penBoard.height * 0.35 },
    { x: penBoard.x + penBoard.width * 0.55, y: penBoard.y + penBoard.height * 0.7 },
  ];
  for (const p of pts) {
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(180);
  }

  assert((await elCount(page)) === beforePenEls, 'ثلاثُ نقاطِ قلمٍ لا تُنشئ عنصرًا بعد — المسودّةُ خارج المستند، كما كانت');
  assert((await historyPast(page)) === beforePenHistory, 'ولا خطوةَ تراجعٍ بعد — فالمسودّةُ خارج السجلّ أيضًا');

  // **المقاطعة: تسليحُ أداةٍ أخرى في منتصف المسودّة.**
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(520);

  const afterArmEls = await elCount(page);
  assert(
    afterArmEls === beforePenEls + 1,
    `**مسودّةُ ثلاثِ نقاطٍ قاطعَها تسليحُ أداةٍ أخرى تُثبَّت مسارًا حقيقيًّا في المستند** (${beforePenEls} → ${afterArmEls}). وقبل هذا العمل كان \`penDraft: []\` يَمسحها، فتُفقد الثلاثُ ولا شيءَ يُعيدها`,
  );

  const penEl = await lastElId(page);
  const penSaved = await savedElement(page, penEl);
  assert(
    penSaved && penSaved.type === 'shape' && penSaved.shape === 'path' && penSaved.points.length === 3,
    `والمُثبَّتُ عنصرُ مسارٍ بنقاطه الثلاث في المستند المحفوظ (type=${penSaved?.type}, shape=${penSaved?.shape}, نقاط=${penSaved?.points?.length}) — لا حالةٌ عابرةٌ ولا معاينة`,
  );

  // **«خطوةٌ واحدةٌ بالضبط»** — مقروءةٌ من `data-history-past` على زرّ التراجع.
  const afterArmHistory = await historyPast(page);
  assert(
    afterArmHistory === beforePenHistory + 1,
    `**وخطوةُ تراجعٍ واحدةٌ بالضبط** (${beforePenHistory} → ${afterArmHistory}) — لا صفرٌ كما كان، ولا خطوةٌ لكلّ نقطةٍ كما يفعل المصدر. وهذا اختيارٌ مقصودٌ لمزيج: ⌘Z فيه يُتوقَّع أن يُلقي «الشكلَ الذي رسمتُه» لا «آخرَ نقطةٍ ضغطتُها»`,
  );

  // وتلك الخطوةُ تُعيد الحالَ فعلًا.
  await page.locator('[data-testid="undo-btn"]').click();
  await page.waitForTimeout(420);
  assert(
    (await elCount(page)) === beforePenEls,
    `وتراجعٌ واحدٌ يُعيد المستندَ إلى ما كان قبل المسودّة (${await elCount(page)} عنصرًا = ${beforePenEls}) — فالإثباتُ خطوةٌ مُسجَّلةٌ قابلةٌ للرجوع، لا كتابةٌ صامتة`,
  );
  assert((await historyFuture(page)) === 1, 'وتصير في المستقبل خطوةٌ واحدةٌ تُعاد');
  await page.locator('[data-testid="redo-btn"]').click();
  await page.waitForTimeout(420);
  assert((await elCount(page)) === beforePenEls + 1, 'والإعادةُ تُرجِع المسارَ — فالخطوةُ حقيقيّةٌ في السجلّ بالاتجاهين');

  // والأداةُ التي ضُغطت هي المسلَّحة: المُثبِّتةُ لا تُسمّي الوجهة، فلا تَسحب
  // «تحديد» من يد من ضغط غيرَها.
  assert(
    (await armedTool(page)) === 'select',
    `والمسلَّحُ بعد المقاطعة هو «تحديد» (${await armedTool(page)}) لا القلم — المُثبِّتةُ \`commitPenDraft\` لا تُسمّي الوجهة، كما أنّ \`deactivate\` في المصدر لا تعرف إلى أين يُنتقَل. ولولا ذلك لَسحبت «تحديد» من يد من ضغط غيرَها`,
  );

  // والنزعُ يسري على المُثبَّت كذلك: التسليحُ ينزع التحديدَ عن كلّ شيء، ومنه
  // المسارُ الذي أُثبِت في اللحظة نفسها. مُسجَّلٌ لأنه أثرٌ مقصودٌ لا مفاجأة.
  assert(
    (await selectedSet(page)).length === 0,
    'والمسارُ المُثبَّتُ غيرُ محدَّد — فالتسليحُ ينزع التحديدَ عن كلّ شيء، والإثباتُ يسبق النزعَ في المُوَدِّع',
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ٦. «أكمِل هذا المسار» — نفيُ القدرة التي قيل إنّ النزعَ يقتلها
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n٦. قلمُ مزيجٍ لا يقرأ التحديد');
  await page.locator(`[data-testid="layer-name-${penEl}"]`).click();
  await page.waitForTimeout(300);
  assert(JSON.stringify(await selectedSet(page)) === JSON.stringify([penEl]), 'مسارٌ مفتوحٌ محدَّدٌ وحده — الشرطُ الذي يجعل المصدرَ يُكمِله');
  const pointsBefore = (await savedElement(page, penEl)).points.length;
  const elsBeforeContinue = await elCount(page);

  await page.locator('[data-tool="pen"]').click();
  await page.waitForTimeout(320);
  await page.mouse.click(penBoard.x + penBoard.width * 0.3, penBoard.y + penBoard.height * 0.82);
  await page.waitForTimeout(180);
  await page.mouse.click(penBoard.x + penBoard.width * 0.75, penBoard.y + penBoard.height * 0.86);
  await page.waitForTimeout(180);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(520);

  assert(
    (await elCount(page)) === elsBeforeContinue + 1,
    `نقطتان بعد تسليح القلم تُنشئان **عنصرًا جديدًا** (${elsBeforeContinue} → ${await elCount(page)}) — لا امتدادًا للمحدَّد`,
  );
  assert(
    (await savedElement(page, penEl)).points.length === pointsBefore,
    `والمسارُ الذي كان محدَّدًا لم تُزَد نقاطُه (${pointsBefore} كما كانت) — **فـ«أكمِل هذا المسار» غيرُ مبنيٍّ في مزيج أصلًا**، لا قبل هذا العمل ولا بعده. وقلمُ مزيجٍ يقرأ \`penDraft\` وحده ولا يقرأ \`selectedIds\` بحرف، فلا قدرةَ فقدها النزع`,
  );

  // ═══════════════════════════════════════════════════════════════════════
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
