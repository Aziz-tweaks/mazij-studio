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
