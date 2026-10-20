#!/usr/bin/env node
// **حوارُ التصدير يَفتح على مقاسِ المشروع، لا على أربعةٍ ليس فيها.**
//
// العطل كما وُجد: `initialStudioState.targets` كان `{ ig, x, tt, li }` مكتوبًا
// بالاسم، فكلُّ مشروعٍ — أيَّ مقاسٍ بدأ منه — يَفتح حوارَ التصدير وفيه أربعةُ
// أهدافٍ محدَّدة. فمن ضغط «تصدير» وجد أربعةَ ملفّات وهو يريد واحدًا. وأسوأُ منه
// على مقاسٍ أُضيف بعد ١٨ أكتوبر ٢٠٢٦: على «بوست عمودي» (١٠٨٠×١٣٥٠) تكون الأربعةُ
// محدَّدةً و**مقاسُ المشروع نفسه غيرَ محدَّد** — أربعةُ ملفّات ليس فيها ملفُّ
// صاحبها، وثلاثةٌ منها بنِسَبٍ مختلفةٍ تمامًا.
//
// وكان هذا العطلُ موصوفًا في أربعة مواضعَ من الكود قبل أن يُصلَح — تعليقُ
// `selectProjectSizeTarget` و`selectAllTargets` في `StudioContext.tsx`، وتعليقا
// زرِّ «مقاس المشروع فقط» وسطرِ التقدير في `ExportDialog.tsx` — ولم يَصِفه موضعٌ
// واحدٌ قرارًا. فالأربعةُ كانت كلَّ `SIZES` قبل التوسيع، فصحَّت يومها وصارت
// خطأً بصمتٍ يومَ صارت المقاساتُ ثلاثةَ عشر.
//
// وما يُقاس هنا أربعةُ أشياء، كلُّها بإدخالٍ حقيقيٍّ من شاشة البداية:
//
//   ١. مشروعٌ جديدٌ على «بوست عمودي» يَفتح الحوارَ على هدفٍ واحدٍ هو مقاسُه،
//      والزرُّ يقول «ملف واحد»، والتصديرُ يُنزل ملفًّا واحدًا أبعادُه ١٠٨٠×١٣٥٠
//      مقروءةً من بايتات الملفّ.
//   ٢. ومشروعٌ مُوقَّتٌ يَدفع ترميزًا واحدًا لا أربعة: سطرُ التقدير على MP4 يقول
//      «ملف واحد».
//   ٣. والإصلاحُ يَصمد لإعادة التحميل: `targets` ليست حقلًا في `DocSnapshot`،
//      فمستندٌ يُستعاد من الحفظ التلقائيّ كان يَرجع إلى الأربعة بصمتٍ لو كان
//      البذرُ في `startDoc` وحده.
//   ٤. وزرَّا «تحديد الكل» و«مقاس المشروع فقط» يَبقيان يَفرِزان: الأوّل يُوسِّع
//      إلى ثلاثةَ عشر، والثاني يَرجع منها إلى واحد.
//
// Run: QA_PORT=1521 node --import ./qa/helpers/port-redirect.mjs qa/export-default-target.spec.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bootBlank, resumeAfterReload } from './helpers/boot.mjs';

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

/** توقيعُ PNG ثمانيةُ بايتات، ثم طولُ `IHDR` أربعة، ثم وسمُه أربعة — فالعرضُ
 * والارتفاعُ عددان صحيحان بترتيب big-endian عند ١٦ و٢٠. أبعادٌ من بايتات الملفّ
 * لا من حالةِ الواجهة. */
function pngDims(filePath) {
  const buf = fs.readFileSync(filePath);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** الأهدافُ المضاءةُ الآن، بمعرّفاتها، مقروءةً من `data-on` على بلاطاتِ الشبكة
 * نفسِها التي يَنقرها المصمّم. */
const targetsOn = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="export-target-"]')]
      .filter((e) => e.dataset.on === 'true')
      .map((e) => e.dataset.testid.replace('export-target-', ''))
      .sort(),
  );

async function openExport(page) {
  await page.getByRole('button', { name: 'تصدير', exact: true }).first().click();
  await page.waitForSelector('[data-testid="export-target-ig"]');
  await page.waitForTimeout(220);
}

/** نصُّ زرِّ التصدير نفسِه — «تصدير ملف واحد» / «تصدير ٤ ملفات». وهو السطحُ الذي
 * يَقرؤه المصمّمُ قبل أن يَضغط، على الساكن والمُوقَّت معًا (سطرُ التقدير لا يَظهر
 * إلا على الفيديو). */
const commitLabel = (page) =>
  page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => /^تصدير /.test(b.textContent.trim()) || b.textContent.trim() === 'اختر مقاساً');
    return btns.length ? btns[btns.length - 1].textContent.trim() : '';
  });

/** يَضع عنصرَ نصٍّ بأداةِ النصّ ونقرةٍ على اللوحة ثم يَكتب فيه — فالمستندُ
 * المُصدَّر فيه شيءٌ يُرسَم، لا لوحةٌ فارغة. */
async function placeText(page, text) {
  const a = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.getByRole('button', { name: 'نص', exact: true }).first().click();
  await page.mouse.click(a.x + a.width * 0.5, a.y + a.height * 0.45);
  await page.waitForTimeout(250);
  await page.mouse.dblclick(a.x + a.width * 0.5, a.y + a.height * 0.45);
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ١. «بوست عمودي» — المقاسُ الذي لم تَحتوِه الأربعةُ قطّ
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n١. مشروعٌ جديدٌ على «بوست عمودي» (١٠٨٠×١٣٥٠)');
  await bootBlank(page, BASE_URL, 'ig-portrait');
  await placeText(page, 'مزيج');
  await openExport(page);

  const on1 = await targetsOn(page);
  assert(
    on1.length === 1 && on1[0] === 'ig-portrait',
    `الحوارُ يَفتح على هدفٍ واحدٍ هو مقاسُ المشروع (${on1.join(', ') || 'لا شيء'}) — كان يَفتح على ig, li, tt, x: أربعةٌ ليس فيها ig-portrait`,
  );

  const label1 = await commitLabel(page);
  assert(label1 === 'تصدير ملف واحد', `وزرُّ التصدير يَقول ما سيَفعل قبل ضغطه: «${label1}» — كان «تصدير 4 ملفات»`);

  // ـــ والتصديرُ الحقيقيُّ يُطابق ما قاله الزرّ ـــ
  await page.locator('button:has-text("PNG")').click();
  await page.waitForTimeout(80);
  // ١× كي تَكون بكسلاتُ الملفّ هي أبعادَ المقاس بعينها، فلا يُخفي المضاعِفُ خطأً.
  await page.locator('button', { hasText: '1x' }).click();
  await page.waitForTimeout(80);

  const downloads = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('button', { hasText: 'تصدير' }).last().click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="export-result-"]').length >= 1, { timeout: 15000 });
  await page.waitForTimeout(400);

  assert(downloads.length === 1, `وضغطُه يُنزل ملفًّا واحدًا فعلًا (${downloads.length}) — لا أربعة`);

  const names = [];
  let dims = null;
  for (const d of downloads) {
    const name = d.suggestedFilename();
    names.push(name);
    const tmp = path.join(os.tmpdir(), `mazij-qa-${Date.now()}-${name}`);
    await d.saveAs(tmp);
    if (/ig-portrait/.test(name)) dims = pngDims(tmp);
  }
  assert(names.length === 1 && /^mazij-ig-portrait-\d+\.png$/.test(names[0]), `والملفُّ هو ملفُّ صاحبه باسمه: ${names.join(', ')}`);
  assert(dims && dims.w === 1080 && dims.h === 1350, `وبكسلاتُه على القرص ١٠٨٠×١٣٥٠ ${JSON.stringify(dims)} — مقاسُ المشروع، مقروءًا من بايتات PNG`);

  // ═══════════════════════════════════════════════════════════════════════════
  // ٢. مُوقَّتٌ: ترميزٌ واحدٌ لا أربعة
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n٢. مشروعٌ مُوقَّتٌ على «ريل إنستقرام» — سطرُ التقدير');
  await bootBlank(page, BASE_URL, 'ig-reel');
  await placeText(page, 'مزيج');
  await openExport(page);
  const onReel = await targetsOn(page);
  assert(onReel.length === 1 && onReel[0] === 'ig-reel', `المُوقَّتُ كذلك يَفتح على مقاسِه وحده (${onReel.join(', ') || 'لا شيء'})`);

  await page.getByRole('button', { name: 'MP4', exact: true }).click();
  await page.waitForTimeout(260);
  const est = await page.locator('[data-testid="export-estimate"]').innerText();
  assert(/ملف واحد/.test(est), `والتقديرُ يَقول ترميزًا واحدًا قبل الانتظار: «${est}» — كان «4 ملفات»، وكلُّ ملفٍّ رسمُ إطاراتٍ وترميزٌ كامل`);

  // ═══════════════════════════════════════════════════════════════════════════
  // ٣. يَصمد لإعادةِ التحميل
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n٣. إعادةُ تحميلٍ ثم «متابعة»');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(300);
  await openExport(page);
  const onResumed = await targetsOn(page);
  assert(
    onResumed.length === 1 && onResumed[0] === 'ig-reel',
    `المستندُ المُستعادُ يَفتح على مقاسِه هو (${onResumed.join(', ') || 'لا شيء'}) — و«targets» ليست حقلًا في DocSnapshot، فبذرٌ في startDoc وحده كان يَترك هذا الطريقَ على الأربعة`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ٤. الزرّان يَبقيان يَفرِزان
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n٤. «تحديد الكل» ثم «مقاس المشروع فقط»');
  const sizeCount = await page.evaluate(() => document.querySelectorAll('[data-testid^="export-target-"]:not([data-testid="export-target-custom"])').length);
  await page.getByRole('button', { name: 'تحديد الكل', exact: true }).click();
  await page.waitForTimeout(220);
  const onAll = await targetsOn(page);
  assert(onAll.length === sizeCount, `«تحديد الكل» يُوسِّع إلى كلّ المقاسات (${onAll.length} من ${sizeCount}) — زرٌّ يقول الكلَّ ويَعني الكلّ`);
  const labelAll = await commitLabel(page);
  assert(new RegExp(`تصدير ${sizeCount} ملفات`).test(labelAll), `والزرُّ يَعترف بالثمن: «${labelAll}»`);

  await page.locator('[data-testid="export-only-project-size"]').click();
  await page.waitForTimeout(220);
  const onNarrow = await targetsOn(page);
  assert(
    onNarrow.length === 1 && onNarrow[0] === 'ig-reel',
    `و«مقاس المشروع فقط» يَرجع من ${onAll.length} إلى مقاسِ المشروع وحده (${onNarrow.join(', ') || 'لا شيء'}) — الزرُّ ما زال يُضيّق فرقًا حقيقيًّا`,
  );

  console.log('');
  assert(pageErrors.length === 0, `ولا خطأَ تشغيلٍ في الجلسة كلِّها (${pageErrors.slice(0, 3).join(' | ') || 'لا شيء'})`);

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(' -', f);
  }
  await browser.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('Test run crashed:', e);
  process.exit(1);
});
