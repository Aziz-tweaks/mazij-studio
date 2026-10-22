#!/usr/bin/env node
// ثلاثةُ أعطالٍ وجدها مراجعٌ من خارج الفريق في دقائق، يوم ١٩ أكتوبر ٢٠٢٦، وعندنا
// ١٢ ألفَ سطرِ استطلاعٍ و١٥٣٢ تأكيدًا ناجحًا. وهذا الملفُّ هو ثمنُ ذلك: كلُّ بندٍ
// فيه **يَسقط على `main`** ويَنجح بعد الإصلاح، وكلُّه يمرّ بأحداثِ مؤشّرٍ ولوحةِ
// مفاتيحَ حقيقيّة ومن أزرار الواجهة نفسها. ولا بابَ خلفيّ: كلُّ `page.evaluate`
// إمّا تقرأ الـDOM أو تقرأ بكسلًا من صورةٍ **أنتجها البرنامجُ بنفسه**.
//
// ═══════════════════════════════════════════════════════════════════════════
// (١) حركةُ دخولٍ تُخفي عنصرَها — واللوحةُ تُناقض الملفَّ الذي تُنتجه
// ═══════════════════════════════════════════════════════════════════════════
// الشكوى: «ظهور تدريجي» لنصٍّ يُخفيه من اللوحة كليًّا ويبقى إطارُ التحديد فارغًا.
//
// **والعطلُ أوسعُ من الشكوى، وهذا هو بيتُ القصيد.** اللوحةُ تُقَوِّم كلَّ عنصرٍ
// عند `state.t` (`Stage.tsx`)، و`state.t` لا تُسكَّن عند لحظة الاستقرار إلا
// **مرّةً واحدةً عند فتح المستند** (`startDoc` في `StudioContext.tsx`). فكلُّ
// حركةٍ تُضاف **بعد** الفتح تُقَوَّم عند مؤشّرٍ يسبقها — أي عند لحظتها الأولى.
// ولا شأنَ لذلك بنمطٍ بعينه؛ قيسَ على `main` أنّ الثلاثةَ تَختفي:
//
//   «ظهور تدريجي» ⇒ `opacity: 0`
//   «انزلاق لأعلى» ⇒ `opacity: 0` و`matrix(1, 0, 0, 1, 0, 108)`
//   «تكبير»        ⇒ `opacity: 0` و`matrix(0, 0, 0, 0, 0, 0)` — صندوقٌ ٠×٠
//
// فإصلاحٌ يَخصّ «ظهور تدريجي» وحدها كان سيترك الاثنين الآخرين على عطلهما.
//
// **وأسوأُ الطريقين الساكن.** قائمةُ حركة الدخول موجودةٌ في لوح الخصائص
// (`PropsTab.tsx`) بلا شرطِ طبيعة، بينما المسطرةُ والمؤشّرُ وشريطُ التشغيل
// **غائبةٌ كلُّها** عن المستند الساكن (`App.tsx` عند `<Timeline timed=…>`).
// فعلى بوسترٍ ساكن: يُخفي المصمّمُ نصَّه بضغطةٍ، **ولا سطحَ في البرنامج كلِّه
// يُحرّك الزمن** ليُعيده. و`renderArtboardPng` تُصدِّر ذلك المستندَ عند
// `settledTimeOf(spec)` — أي أنّ الملفَّ المكتوب يحمل النصَّ كاملًا واللوحةُ
// خاليةٌ منه. اللوحةُ تُناقض ما تُنتجه هي.
//
// ═══════════════════════════════════════════════════════════════════════════
// (٢) معاينةُ التصدير تَعرض تصميمًا آخر
// ═══════════════════════════════════════════════════════════════════════════
// لم تكن معاينةً أصلًا: أربعةُ عناصرِ DOM مكتوبةٍ باليد في `ExportDialog.tsx` —
// قرصٌ في الزاوية، وشارةُ «٥٠٪»، ومربّعٌ منقّط، وسطرٌ يقرأ نصَّ العنصر ذي المعرّف
// `'head'`. وتلك قطعُ **البوستر التجريبيّ**، و`'head'` معرّفٌ لا يملكه سواه؛ فأيُّ
// مستندٍ صنعه مستخدم يُعايَن بتصميمٍ ليس تصميمَه وبعنوانٍ فارغ.
//
// والعلاجُ حذفُ الرسم لا تدقيقُه: تُنادى `renderArtboardPng` — المُصيِّرُ نفسُه
// الذي يكتب الملفَّ — فتَصير المعاينةُ الملفَّ مصغَّرًا.
//
// ═══════════════════════════════════════════════════════════════════════════
// (٤) شاشةُ البداية تفيض أفقيًّا
// ═══════════════════════════════════════════════════════════════════════════
// والعتبةُ **٨٨٠ لا ٩٠٠**: `minWidth: 880` كانت على جذر القشرة (`App.tsx`) ومعها
// `overflow: 'hidden'`، فالفائضُ **مقصوصٌ لا مُمَرَّر** — ولا شريطَ تمريرٍ أفقيٍّ
// يَصِل إليه (`documentElement.scrollWidth === clientWidth`). وهي أرضيّةُ
// **المحرِّر** بأعمدته الأربعة، ورثَتها شاشةُ بدايةٍ عمودُها واحدٌ مركزيّ.
//
// التشغيل: QA_PORT=<منفذ حرّ> QA_SPECS=parity-four npm test
import { chromium } from 'playwright';
import { AUTOSAVE_KEY, bootBlank } from './helpers/boot.mjs';

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

/** لونانِ **لا تُعطيهما أيُّ لوحةٍ في `PALETTES`**، فلا يمكن أن يُصادَف أحدُهما من
 * شريحةٍ جاهزة ولا من زخرفةِ لوح. مأخوذانِ من ألوان هدف `t02-kashida` كما في
 * `qa/appearance-hex.spec.mjs` و`qa/picker-and-tool-clear.spec.mjs`. */
const BRAND = '#d93025';
const BRAND_RGB = [217, 48, 37];
const BRAND2 = '#1f8f55';
const BRAND2_RGB = [31, 143, 85];

const PRESETS = [
  ['fade', 'ظهور تدريجي'],
  ['slide', 'انزلاق لأعلى'],
  ['pop', 'تكبير'],
];

const lastElId = (page) => page.evaluate(() => [...document.querySelectorAll('[data-el-id]')].map((n) => n.getAttribute('data-el-id')).pop() ?? null);

/** ما تَرسمه اللوحةُ فعلًا للعنصر: الشفافيّةُ المحسوبة، والمصفوفةُ المحسوبة،
 * وصندوقُه على الشاشة. ثلاثتُها قراءاتُ `getComputedStyle`/`getBoundingClientRect`
 * — أي ما تراه العين لا ما يقوله النموذج. */
const painted = (page, id) =>
  page.evaluate((elId) => {
    const n = document.querySelector(`[data-el-id="${elId}"]`);
    if (!n) return null;
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    const h = document.querySelector('[data-testid="selection-handles"]');
    return {
      opacity: Number(cs.opacity),
      transform: cs.transform,
      w: Math.round(r.width),
      h: Math.round(r.height),
      handles: h ? Math.round(h.getBoundingClientRect().width) : null,
    };
  }, id);

/** نصٌّ يُضاف **بأداة النصّ وضغطةِ مؤشّرٍ على اللوحة**، كما يفعل المصمّم. */
async function addText(page) {
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.locator('[data-tool="text"]').click();
  await page.waitForTimeout(320);
  await page.mouse.click(ab.x + ab.width * 0.4, ab.y + ab.height * 0.4);
  await page.waitForTimeout(620);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  return lastElId(page);
}

/** يكتب لونًا في حقلٍ ستّ عشريٍّ بضغطاتِ مفاتيحَ حقيقيّة — لا `fill()`. */
async function typeHex(page, locator, value) {
  await locator.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(value, { delay: 20 });
  await page.waitForTimeout(320);
}

/** يَعُدّ بكسلاتِ **صورةِ المعاينة التي أنتجها البرنامج**، مجمَّعةً باللون. قراءةٌ
 * محضة: الصورةُ تُرسَم على قماشٍ مؤقّتٍ ثم تُقرأ، ولا شيءَ يُكتَب في البرنامج. */
const previewPixels = (page) =>
  page.evaluate(async () => {
    const img = document.querySelector('[data-testid="export-preview-image"]');
    if (!img) return null;
    if (!img.complete) await img.decode().catch(() => undefined);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    if (!c.width || !c.height) return null;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const counts = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return { w: c.width, h: c.height, counts: [...counts.entries()] };
  });

/** عددُ البكسلات التي لونُها اللونُ المطلوب بالضبط (تسامحُ ترميزٍ ±2 لكلّ قناة،
 * لأن PNG يمرّ بضغطٍ بلا فقد لكنّ التصيير قد يُقرِّب حافّةً). */
function countNear(px, rgb) {
  let n = 0;
  for (const [key, c] of px.counts) {
    const [r, g, b] = key.split(',').map(Number);
    if (Math.abs(r - rgb[0]) <= 2 && Math.abs(g - rgb[1]) <= 2 && Math.abs(b - rgb[2]) <= 2) n += c;
  }
  return n;
}

/** قياسُ الفيض: عرضُ ما يُمكن تمريرُ المستند إليه مقابل عرضِ المنفذ، وكلُّ سليلٍ
 * من شاشة البداية يَخرج عن أيٍّ من الحافّتين. */
/** **حُدِّث ٢٢ أكتوبر ٢٠٢٦ بطلب المالك، ولم يُحذَف.** كان يَعُدّ كلَّ عنصرٍ يخرج
 * عن المنظور «مقصوصًا»، وهو صحيحٌ ما دامت الشاشةُ بلا شريطٍ يُمرَّر أفقيًّا — وقد
 * كانت. ثم طلب المالك (برسمةٍ بخطّ يده) شريطَ قوالبَ كبيرةً **يُمرَّر سَحبًا**
 * وشرائحَ تصنيفٍ فوقه، **وخروجُ المحتوى عن المنظور هو عملُ الشريط نفسِه** لا
 * عطلٌ فيه: فالبندُ بصيغته القديمة يمنع الميزةَ بالتعريف، لا يَكشف خللًا.
 *
 * **وما يَحرسه البندُ حقًّا باقٍ كما هو، بل أدقّ:** الصفحةُ لا تفيض
 * (`docScrollW`/`rootW` ≤ المنظور — وهما أقوى الشرطين ولم يُمَسّا)، **ولا عنصرَ
 * خارجَ المنظور إلّا داخل حاويةٍ تُمرَّر فعلًا** فيَبلغه المستخدم. فعنصرٌ مقصوصٌ
 * في حاويةٍ غيرِ قابلةٍ للتمرير — وهو العطلُ الأصليّ — ما زال يُسقِط البند.
 * وقيسَ على الشاشة الجديدة: ١١١ عنصرًا خارج المنظور، كلُّها داخل
 * `template-strip` و`template-categories`، و`docScrollW` = `innerW` = ١٤٤٠. */
const overflowReport = (page) =>
  page.evaluate(() => {
    const ss = document.querySelector('[data-testid="start-screen"]');
    const out = [];
    const unreachable = [];
    for (const n of ss.querySelectorAll('*')) {
      const r = n.getBoundingClientRect();
      if (!(r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5))) continue;
      const label = `${n.tagName}${n.dataset.testid ? `[${n.dataset.testid}]` : ''} ${Math.round(r.left)}…${Math.round(r.right)}`;
      out.push(label);
      // أقربُ جدٍّ يُمرَّر أفقيًّا **ويَملك فائضًا فعليًّا** — لا مجرّد تصريحِ CSS.
      let a = n.parentElement;
      let reachable = false;
      while (a && a !== ss) {
        const ox = getComputedStyle(a).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && a.scrollWidth > a.clientWidth + 0.5) {
          reachable = true;
          break;
        }
        a = a.parentElement;
      }
      if (!reachable) unreachable.push(label);
    }
    return {
      innerW: window.innerWidth,
      docScrollW: document.documentElement.scrollWidth,
      rootW: Math.round(document.querySelector('[dir]').getBoundingClientRect().width),
      offscreenCount: out.length,
      clipped: unreachable.slice(0, 4),
      clippedCount: unreachable.length,
    };
  });

async function openStartScreen(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.waitForTimeout(400);
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
  // ١. المُوقَّت: الأنماطُ الثلاثةُ كلُّها، لا «ظهور تدريجي» وحدها
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n١. المُوقَّت: حركةُ الدخول لا تُخفي عنصرَها');
  await bootBlank(page, BASE_URL, 'ig-reel');
  const tText = await addText(page);
  const before = await painted(page, tText);
  assert(before.opacity === 1 && before.w > 0 && before.h > 0, `نصٌّ جديدٌ مرئيٌّ قبل أيّ حركة (شفافيّة ${before.opacity}، ${before.w}×${before.h})`);
  assert((await page.locator('[data-testid="anim-preset-menu"]').count()) === 1, 'وقائمةُ حركة الدخول حاضرةٌ في رأس الخطّ الزمنيّ — فهذا طريقُ المصمّم إليها على المُوقَّت');

  for (const [id, label] of PRESETS) {
    await page.locator(`[data-testid="anim-preset-${id}"]`).click();
    await page.waitForTimeout(460);
    const p = await painted(page, tText);
    assert(
      p.opacity > 0.99,
      `**«${label}» لا تُخفي نصَّها** — الشفافيّةُ المرسومة ${p.opacity}. وعلى \`main\` كانت ٠ للأنماط الثلاثة: المؤشّرُ واقفٌ عند صفرٍ واللوحةُ تَعرض اللحظةَ الأولى التي لم يصل فيها العنصرُ بعد`,
    );
    assert(
      p.w === before.w && p.h === before.h,
      `وصندوقُه على الشاشة كما كان (${p.w}×${p.h} = ${before.w}×${before.h}) — و«تكبير» كانت تُعطي \`matrix(0,0,0,0,0,0)\` أي ٠×٠، و«انزلاق» تُزيحه ١٠٨ بكسلًا`,
    );
    assert(
      p.handles !== null && Math.abs(p.handles - before.w) <= 2,
      `وإطارُ التحديد على جسمٍ لا على فراغ (${p.handles} ≈ ${before.w}) — «يبقى إطارُ التحديد فارغًا» كان وصفَ المراجع بالحرف`,
    );
  }

  // ─── والضابطُ: المسطرةُ لم تُكسَر، والمستندُ ما زال يَعرض لحظتَه الأولى عندها ───
  //
  // وبدون هذا البند يمكن «إصلاحُ» العطل بإلغاء الحركة أصلًا، فيَمرّ ما سبق ويَموت
  // الخطُّ الزمنيّ. فالمطلوب شيئان معًا: لا تُخفِ عند الراحة، **وأظهِر الإخفاءَ
  // متى طلبه المصمّمُ بالمسطرة**.
  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(420);
  const ruler = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.move(ruler.x + 3, ruler.y + ruler.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(420);
  const atZero = await painted(page, tText);
  assert(
    atZero.opacity < 0.2,
    `وسحبُ المؤشّر إلى أوّل المسطرة يَعرض اللحظةَ الأولى فعلًا (شفافيّة ${atZero.opacity.toFixed(3)}) — فالخطُّ الزمنيُّ لم يُكسَر، والإصلاحُ ليس إلغاءً للحركة`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ٢. الساكن: لا مسطرةَ ولا مؤشّرَ — فلا طريقَ للرجوع أصلًا
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n٢. الساكن: الحركةُ متاحةٌ والزمنُ غائب');
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await bootBlank(page, BASE_URL, 'ig-portrait');
  const sText = await addText(page);
  const sBefore = await painted(page, sText);

  assert((await page.locator('[data-testid="timeline-tracks"]').count()) === 0, 'بوسترٌ ساكن: لا مساراتِ خطٍّ زمنيّ في الـDOM');
  assert((await page.locator('[data-testid="timeline-ruler"]').count()) === 0, 'ولا مسطرة — فلا سطحَ يُحرّك الزمن');
  assert(
    (await page.locator('[data-testid="props-anim-presets"]').count()) === 1,
    'ومع ذلك فقائمةُ حركة الدخول معروضةٌ في لوح الخصائص — وهذا هو التناقضُ الذي يَجعل العطلَ بلا مَخرج',
  );

  for (const [id, label] of PRESETS) {
    await page.locator(`[data-testid="props-anim-preset-${id}"]`).click();
    await page.waitForTimeout(460);
    const p = await painted(page, sText);
    assert(
      p.opacity > 0.99 && p.w === sBefore.w && p.h === sBefore.h,
      `**«${label}» على بوسترٍ ساكن: العنصرُ باقٍ** (شفافيّة ${p.opacity}، ${p.w}×${p.h}) — و\`renderArtboardPng\` تُصدِّر هذا المستندَ عند لحظة الاستقرار، فاللوحةُ والملفُّ يقولان الشيءَ نفسَه الآن`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ٣. الطريقُ الثاني إلى الحالة نفسِها: تبديلُ الوجهة من مُوقَّتٍ إلى ساكن
  // ═══════════════════════════════════════════════════════════════════════
  // بندٌ قائمٌ بذاته لأنه يُثبت أنّ الإصلاحَ على **السبب** لا على الفعل المُبلَّغ
  // عنه: هنا لا تُضغَط قائمةُ حركةٍ بعد التبديل بتّةً، ومع ذلك كان العنصرُ
  // يَختفي — لأنّ المؤشّرَ بقي حيث تركه المصمّمُ على المسطرة ثم غابت المسطرة.
  console.log('\n٣. تبديلُ الوجهة إلى ساكن لا يُخفي شيئًا');
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await bootBlank(page, BASE_URL, 'ig-reel');
  const mText = await addText(page);
  const mBefore = await painted(page, mText);
  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(420);
  const ruler2 = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.move(ruler2.x + 3, ruler2.y + ruler2.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(420);
  assert((await painted(page, mText)).opacity < 0.2, 'مؤشّرٌ مُوقَفٌ عمدًا عند أوّل المسطرة، والعنصرُ في لحظته الأولى كما طُلب');

  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForSelector('[data-testid="size-menu"]');
  await page.locator('[data-testid="size-option-ig-portrait"]').click();
  await page.waitForTimeout(620);
  const afterSwitch = await painted(page, mText);
  assert(
    (await page.locator('[data-testid="timeline-ruler"]').count()) === 0,
    'ثم يُبدَّل المقاسُ إلى وجهةٍ ساكنة من قائمة المقاسات نفسِها، فتغيب المسطرة',
  );
  // والعرضُ لا يُقارَن برقمِ ما قبل التبديل: تبديلُ المقاس يُعيد حسابَ تكبيرِ
  // اللوح («ملاءمة»)، فالعنصرُ نفسُه يُرسَم بعددِ بكسلاتٍ آخر على الشاشة بحقّ.
  // المقيسُ هو **أنه يُرسَم**: شفافيّةٌ كاملةٌ وصندوقٌ غيرُ منهار. (قيسَ على
  // `main`: الشفافيّةُ ٠ والصندوقُ قائمٌ — أي إطارُ تحديدٍ على فراغ.)
  assert(
    afterSwitch.opacity > 0.99 && afterSwitch.w > 0 && afterSwitch.h > 0,
    `**والعنصرُ ظاهرٌ بعد التبديل** (شفافيّة ${afterSwitch.opacity}، ${afterSwitch.w}×${afterSwitch.h}) — وعلى \`main\` كان يَبقى عند الشفافيّة التي تركه المؤشّرُ عندها ثم يَفقد كلَّ سطحٍ يُعيده`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ٤. معاينةُ التصدير هي المستندُ المفتوح
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n٤. معاينةُ التصدير: التصميمُ المفتوح لا تصميمٌ آخر');
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await bootBlank(page, BASE_URL, 'ig-reel');
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(340);
  await page.locator('[data-shape-tile="rect"]').click();
  await page.waitForTimeout(540);
  const rect = await lastElId(page);
  await typeHex(page, page.locator(`[data-testid="shape-fill-hex-${rect}"]`), BRAND);

  // ─── النفيُ أوّلًا، **بمعايرةٍ ذاتيّة** ───
  //
  // عددُ العناصر المنقّطة يُقاس **قبل** فتح الحوار وبعده، فلا يُثبَّت في الاختبار
  // رقمٌ عن بقيّة الواجهة ولا يُستثنى زرٌّ بالاسم: المقيسُ هو **ما أضافه الحوار**.
  // (المحرِّرُ نفسُه فيه منقّطٌ واحدٌ مشروع: زرُّ «خيارات متقدمة».)
  const dashedCount = () =>
    page.evaluate(() => [...document.querySelectorAll('*')].filter((n) => getComputedStyle(n).borderTopStyle === 'dashed' && n.getBoundingClientRect().width > 0).length);
  const hasFifty = () => page.evaluate(() => (document.body.innerText || '').includes('٥٠٪'));
  const dashedBefore = await dashedCount();
  assert((await hasFifty()) === false, 'قبل الفتح: لا «٥٠٪» في الصفحة — فالمستندُ لا يحتوي على شيءٍ كهذا');

  await page.getByRole('button', { name: 'تصدير', exact: true }).first().click();
  await page.waitForTimeout(600);
  assert((await page.locator('[data-testid="export-target-ig"]').count()) === 1, 'حوارُ التصدير مفتوحٌ ومقروء');

  assert(
    (await hasFifty()) === false,
    '**وفتحُ الحوار لا يُحضِر شارةَ «٥٠٪»** — وهي إحدى قطع البوستر التجريبيّ الثلاث التي كان لوحُ المعاينة يَرسمها لكلّ مستند مهما كان',
  );
  const dashedAfter = await dashedCount();
  assert(
    dashedAfter === dashedBefore,
    `**ولا مربّعًا منقّطًا** — المنقّطاتُ ${dashedAfter} كما كانت ${dashedBefore} قبل الفتح. والقرصُ في الزاوية كانت القطعةَ الثالثة`,
  );

  // ─── والإثباتُ: بكسلاتُ المعاينة هي بكسلاتُ المستند ───
  //
  // وانتظارٌ ليّنٌ لا قاسٍ: غيابُ المعاينة **بندٌ ساقطٌ باسمه**، لا انهيارُ ملفٍّ
  // يَكتم ما بعده. (وهذا هو بعينه ما يَجعل بقيّةَ الملفّ تُقاس على `main` كذلك.)
  const previewReady = await page
    .waitForSelector('[data-testid="export-preview"][data-preview-ready="true"]', { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  assert(previewReady, '**ولوحُ المعاينة يُعلن أنه صيَّر المستند** (`data-preview-ready`) — وقبل هذا العمل لم يكن هناك تصييرٌ أصلًا بل أربعةُ عناصرِ DOM مكتوبةٍ باليد');
  await page.waitForTimeout(400);
  const px = await previewPixels(page);
  assert(px !== null && px.w > 0, `المعاينةُ صورةٌ حقيقيّةٌ أنتجها البرنامج (${px?.w}×${px?.h} بكسلًا)`);
  if (px) {
    const brandPx = countNear(px, BRAND_RGB);
    assert(
      brandPx > 500,
      `**ولونُ الشكل الذي وضعه المصمّمُ موجودٌ في المعاينة** (${BRAND} ⇒ ${brandPx} بكسلًا) — وهو لونٌ لا تُعطيه أيُّ لوحةٍ في البرنامج، فلا يمكن أن يكون مصادفةً من خلفيّةٍ أو زخرفة`,
    );

    // ─── وأنّها حيّةٌ لا لقطةٌ واحدة: تغييرُ اللون يَصِل إليها ───
    await page.getByRole('button', { name: 'إلغاء', exact: true }).click();
    await page.waitForTimeout(360);
    await page.locator(`[data-el-id="${rect}"]`).click({ force: true });
    await page.waitForTimeout(300);
    await typeHex(page, page.locator(`[data-testid="shape-fill-hex-${rect}"]`), BRAND2);
    await page.getByRole('button', { name: 'تصدير', exact: true }).first().click();
    await page.waitForSelector('[data-testid="export-preview"][data-preview-ready="true"]', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const px2 = await previewPixels(page);
    const brand2Px = px2 ? countNear(px2, BRAND2_RGB) : 0;
    const brand1Left = px2 ? countNear(px2, BRAND_RGB) : -1;
    assert(
      brand2Px > 500 && brand1Left === 0,
      `**وتعديلٌ على المستند يَصِل إلى المعاينة** (${BRAND2} ⇒ ${brand2Px} بكسلًا، ولم يَبقَ من ${BRAND} إلا ${brand1Left}) — فهي تَقرأ المستندَ الحيَّ لا لقطةً أُخذت مرّة`,
    );
  } else {
    // بلا صورةٍ لا بكسلَ يُقاس — يُسجَّل البندان ساقطَين **باسمهما** ويَكمل الملفُّ
    // إلى القسم ٥، فلا يَكتم انهيارٌ واحدٌ قياسَ عطلٍ آخر.
    assert(false, `**ولونُ الشكل الذي وضعه المصمّمُ موجودٌ في المعاينة** (${BRAND}) — لا صورةَ معاينةٍ في الحوار أصلًا`);
    assert(false, `**وتعديلٌ على المستند يَصِل إلى المعاينة** (${BRAND2}) — لا صورةَ معاينةٍ في الحوار أصلًا`);
  }
  await page.getByRole('button', { name: 'إلغاء', exact: true }).click();
  await page.waitForTimeout(300);

  // ═══════════════════════════════════════════════════════════════════════
  // ٥. شاشةُ البداية لا تَفيض أفقيًّا
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n٥. شاشةُ البداية: لا فيضَ أفقيّ');
  // ٨٨٠ هي العتبةُ المقيسة، لا ٩٠٠: `minWidth: 880`. فالعرضانِ ٨٨٠ و٨٧٩ هما
  // حدُّ الاختبار بالضبط، وما دونهما كان مقصوصًا كلُّه.
  for (const w of [1440, 900, 880, 879, 820, 768, 700, 640]) {
    await page.setViewportSize({ width: w, height: 900 });
    await openStartScreen(page);
    const r = await overflowReport(page);
    // ثلاثةُ شروطٍ لا اثنان، و**عرضُ الجذر** أهمُّها: بين ٨٨٠ و٨٠٠ تقريبًا يكون
    // الجذرُ أعرضَ من المنفذ بالفعل ولا يَظهر أثرُه بعدُ على عنصرٍ بعينه (العمودُ
    // الداخليُّ ما زال داخلَ المنظور). فالاكتفاءُ بعدّ المقصوصات كان سيُمرِّر
    // العتبةَ نفسَها التي يَقيسها هذا البند.
    assert(
      r.rootW <= r.innerW + 0.5 && r.docScrollW <= r.innerW + 0.5 && r.clippedCount === 0,
      `عند ${w} بكسلًا: لا فيضَ (جذرٌ ${r.rootW} ≤ المنفذ ${r.innerW}، قابلُ التمرير ${r.docScrollW}، مقصوصاتٌ ${r.clippedCount}${r.clipped.length ? ` — ${r.clipped.join(' · ')}` : ''})`,
    );
  }

  // ─── والإنجليزيّة (LTR) كذلك، فالفيضُ كان يُقصّ الطرفين فيها ───
  await page.setViewportSize({ width: 760, height: 900 });
  await openStartScreen(page);
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.waitForTimeout(500);
  const ltr = await overflowReport(page);
  assert(
    (await page.evaluate(() => document.querySelector('[dir]').getAttribute('dir'))) === 'ltr',
    'وبالإنجليزيّة اتجاهُ الجذر `ltr` — فالقياسُ على الاتجاهين لا على واحد',
  );
  assert(
    ltr.rootW <= ltr.innerW + 0.5 && ltr.docScrollW <= ltr.innerW + 0.5 && ltr.clippedCount === 0,
    `وعند ٧٦٠ بكسلًا بالإنجليزيّة: لا فيض (${ltr.docScrollW} ≤ ${ltr.innerW}، مقصوصاتٌ ${ltr.clippedCount}) — وكان الجذرُ يمتدّ من ‎−84‎ إلى ٧٩٦ فيُقصّ الطرفان معًا`,
  );

  // ─── والضابطُ: أرضيّةُ المحرِّر باقيةٌ كما كانت، فالإصلاحُ مقصورٌ على مَن لا يحتاجها ───
  //
  // بدون هذا البند يمكن «إصلاحُ» الفيض بحذف الأرضيّة من البرنامج كلِّه، فتَمرّ
  // البنودُ أعلاه وينهار المحرِّرُ بأعمدته الأربعة على شاشةٍ ضيّقة.
  await page.setViewportSize({ width: 700, height: 900 });
  await openStartScreen(page);
  const homeRootW = (await overflowReport(page)).rootW;
  assert(homeRootW === 700, `شاشةُ البداية عند ٧٠٠ تَنساب إلى ٧٠٠ (${homeRootW}) — بلا أرضيّة`);
  await page.locator('[data-testid="format-row-ig"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  await page.waitForTimeout(420);
  const editorRootW = await page.evaluate(() => Math.round(document.querySelector('[dir]').getBoundingClientRect().width));
  assert(
    editorRootW === 880,
    `**وأرضيّةُ المحرِّر باقيةٌ بحرفها** (${editorRootW} = ٨٨٠ عند منفذٍ عرضُه ٧٠٠) — القيدُ نزل إلى صاحبه ولم يُحذَف، فسلوكُ المحرِّر لم يتغيّر بتّةً`,
  );
  await page.setViewportSize({ width: 1600, height: 1000 });

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
