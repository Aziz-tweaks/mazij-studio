#!/usr/bin/env node
// بناء محاولة الهدف `t03-store-card` من داخل واجهة مزيج وحدها.
//
// والمرجع نفسه وأصولُه الثلاثة محليّةٌ لا تُرفَع: `targets/t03-store-card/README.md`.
//
// ما يختبره هذا الهدف ولم يختبره الهدفان قبله: **صورٌ مستوردة** (أيقونة التطبيق
// وشارتا المتجرين) تمرّ بمسار الاستيراد الحقيقي في الواجهة، و**تخطيطٌ متمركز
// أفقيًّا** لا محاذاةً إلى اليمين، و**إيقاعٌ رأسيّ** بين أربعة عناصر مع فراغٍ
// مقيسٍ بصفرٍ أعلى اللوحة وأسفلها.
//
// وكل سطرٍ هنا إيماءةٌ يستطيع إنسانٌ أداءها بفأرةٍ ولوحة مفاتيح: نقرةٌ على زرّ،
// واختيارُ ملفٍّ من منتقي الملفّات نفسه (`page.on('filechooser')` يمسك الحوار
// الذي يفتحه `pickImageFile` فعلًا — لا حقن `src`)، وكتابةُ رقمٍ في حقل. لا تحرير
// ملفات، ولا SVG مكتوبٌ بيد، ولا حقن حالة. وحتى الخروج يمرّ بنافذة التصدير.
//
// التشغيل: node qa/replication/build-t03.mjs [out.png]   (خادم التطوير يعمل)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { bootBlank } from '../helpers/boot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.QA_BASE_URL || process.env.MAZIJ_URL || 'http://localhost:1420';
const OUT = process.argv[2] || path.join(__dirname, 'attempt-t03.png');
const ASSETS = path.join(__dirname, 'assets/t03-store-card');

const DOC = { w: 1080, h: 1350 };

// ألوان الهدف مقيسةٌ من `target.png` لا مأخوذةٌ بالعين، ولا واحدَ منها تعطيه أيُّ
// لوحةٍ في `PALETTES` — فكلُّها يمرّ بحقل الستّ عشريّ في كومة المظهر.
const CREAM = '#f4f1ea';
const DARK = '#12382a';
const GREY = '#98a198';

/** العائلة: **فازيرماتن**، اختيرت بالقياس لا بالذوق.
 *
 * خطُّ الهدف ليس واحدًا من عائلات مزيج الثلاث — وهذا حدٌّ موثَّق لا عطل. والاختيار
 * بينها إذن يقوم على أقرب **نسبةٍ** إلى حبر الهدف: سطرُ العنوان في الهدف عرضه
 * ٣٥٥ وارتفاعه ٧٦ (نسبة ٤٫٦٧)، والقياس عند مقاس ١٠٠ من PNG مُصدَّرة فعلًا
 * بمعايرةٍ مؤقّتة أعطى: إسكندرية عريض ٤٫٩٦، وريدكس عريض ٥٫٢٤، وفازيرماتن عريض
 * ٤٫٧٥. فالثالثة وحدها تُعطي العرض والارتفاع معًا عند مقاسٍ واحد. */
const FAMILY = 'Vazirmatn';

/** هندسة الهدف بالبكسل على لوحة ١٠٨٠×١٣٥٠.
 *
 * صناديق الصور هي صناديق حبرها بالضبط (الصور مقصوصةٌ عند تلك الحدود نفسها، انظر
 * `crop-t03-assets.mjs`) — فلا فرق بين الصندوق والمحتوى.
 *
 * أمّا صناديق النصّ فأعرض وأعلى من حبرها: الصندوق يبدأ قبل الحبر بمسافةٍ تتناسب
 * مع مقاس الخطّ، فصندوقٌ يبدأ عند حدّ الحبر يدفع السطر إلى أسفل. والأرقام هنا هي
 * ما وصلت إليه المعايرة بقياس فرق الحبر بين المحاولة والهدف. */
const T = {
  // خلفيّةٌ كريميّة. وهي **مستطيلٌ مرسوم**، لا خلفيّة اللوحة: اللوحة لا تقبل إلا
  // فهرس لوحةٍ جاهزة، و#f4f1ea ليس خلفيّةَ أيٍّ منها — حدٌّ موثَّق من الجولة الثانية.
  bg: { x: 0, y: 0, w: 1080, h: 1350 },
  icon: { x: 486, y: 474, w: 108, h: 109 },
  // المقاسان مُعايَران لا مُقدَّران: فازيرماتن عند مقاس ١٠٠ يعطي سطرَ الوصف عرض
  // ٧٦٧ (عاديّ) وسطرَ العنوان عرض ٥٤٦ (عريض)، وحبرُ الهدف ٢٩٦ و٣٥٥ — فالمقاسان
  // ٣٩ و٦٥. والنصّان هنا نصّا «مِداد» الموصوفان في `spec.json`، لا نصّا المرجع
  // الأصلي: البنود تقيس حدودَ الحبر وتمركزَه، لا كلماته.
  //
  // و`y` الصندوق ليس `y` الحبر: أوّل سطرٍ يبدأ على بُعد ٠٫٢٠×المقاس من حافّة
  // الصندوق العليا (مقيسًا من المعايرة نفسها)، فيُطرح ذلك من حدّ حبر الهدف.
  // والصندوق أعرض من النصّ كثيرًا لأن التمركز هنا تمركزُ **الحبر داخل صندوقه**،
  // فصندوقٌ متمركزٌ على اللوحة يضع حبره في وسطها أيًّا كان عرض النصّ.
  tagline: { text: 'أدوات الكتابة الذكية', size: 39, box: { x: 140, y: 621, w: 800, h: 90 } },
  headline: { text: 'مِداد بانتظارك', size: 65, box: { x: 140, y: 767, w: 800, h: 120 } },
  badgeA: { x: 255, y: 953, w: 231, h: 78 },
  badgeG: { x: 614, y: 952, w: 285, h: 85 },
};

const log = (...m) => console.log('  ·', ...m);
const sleep = (page, ms) => page.waitForTimeout(ms);

/** حقل X/Y/W/H/∠ في قسم «التحويل». تُكتب القيمة رقمًا رقمًا كما تُكتب بيد. */
function geoField(page, key) {
  return page.locator('label').filter({ has: page.locator(`span:text-is("${key}")`) }).locator('input[type="number"]');
}

async function typeInto(locator, page, value) {
  await locator.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(String(value), { delay: 14 });
  await page.keyboard.press('Tab');
  await sleep(page, 90);
}

async function setBox(page, box) {
  for (const [k, v] of [['X', box.x], ['Y', box.y], ['W', box.w], ['H', box.h]]) {
    if (v === undefined) continue;
    await typeInto(geoField(page, k), page, v);
  }
}

const lastElId = (page) =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all.length ? all[all.length - 1].getAttribute('data-el-id') : null;
  });

/** اللون الحرّ: حقل الستّ عشريّ بجوار شريحة التعبئة في كومة المظهر. */
async function setFillHex(page, elId, hex) {
  const sel = `[data-testid^="appearance-fill-${elId}-"][data-testid$="-hex"]`;
  await typeInto(page.locator(sel).first(), page, hex);
  await sleep(page, 160);
}

async function addText(page, content) {
  await page.locator('[data-tool="text"]').click();
  await sleep(page, 180);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.mouse.click(ab.x + ab.width * 0.5, ab.y + ab.height * 0.5);
  await sleep(page, 420);
  await page.keyboard.type(content, { delay: 14 });
  await sleep(page, 260);
  await page.keyboard.press('Escape');
  await sleep(page, 220);
  return lastElId(page);
}

async function addShape(page, tile) {
  await page.locator('[data-tool="shape"]').click();
  await sleep(page, 320);
  await page.locator(`[data-shape-tile="${tile}"]`).click();
  await sleep(page, 520);
  return lastElId(page);
}

/** استيراد صورة: نقرةٌ على أداة «صورة»، ثم نقرةٌ على اللوحة **عند موضعها** تفتح
 * منتقي الملفّات الحقيقيّ الذي يصنعه `pickImageFile`، ثم اختيارُ ملفٍّ فيه. وهذا
 * بالضبط ما يفعله إنسان — Playwright يمسك حوار المنتقي كما يمسكه نظام التشغيل،
 * ولا يُكتب `src`.
 *
 * والنقرة تضع الصورة عند مركزها تقريبًا، ثم تُضبَط الحافّات بالأرقام في لوح
 * التحويل — وهو ترتيب المصمّم نفسه. (قبل هذه الجولة كانت النقرة تُهمَل وتهبط كلُّ
 * صورةٍ في وسط اللوحة؛ انظر `qa/image-placement.spec.mjs`.) */
async function addImage(page, file, box) {
  await page.locator('[data-tool="image"]').click();
  await sleep(page, 220);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  const cx = (box.x + box.w / 2) / DOC.w;
  const cy = (box.y + box.h / 2) / DOC.h;
  const chooser = page.waitForEvent('filechooser', { timeout: 15000 });
  await page.mouse.click(ab.x + ab.width * cx, ab.y + ab.height * cy);
  const fc = await chooser;
  await fc.setFiles(file);
  await sleep(page, 700);
  return lastElId(page);
}

async function setFontSize(page, px) {
  const field = page.locator('label').filter({ has: page.locator('span:text-is("px")') }).locator('input[type="number"]');
  await typeInto(field, page, px);
  await sleep(page, 140);
}

/** أزرار المحاذاة الستّة داخل صندوق النصّ بترتيب `ALIGN_BUTTONS`: ٠..٢ أفقيّة. */
async function setAlign(page, hIdx, vIdx) {
  const sec = page.locator('section').filter({ has: page.locator('.mz-label:text-is("المحاذاة")') });
  const btns = sec.locator('button');
  if (hIdx !== null) { await btns.nth(hIdx).click(); await sleep(page, 110); }
  if (vIdx !== null) { await btns.nth(3 + vIdx).click(); await sleep(page, 110); }
}

/** العائلة: زرُّ اسم الخطّ في لوح «التصميم» يفتح القائمة، فيُنقر الاسم فيها. */
async function setFont(page, family) {
  await page.locator('button').filter({ hasText: /^(Alexandria|'?Readex Pro'?|Vazirmatn)$/ }).first().click();
  await sleep(page, 240);
  await page.locator('button', { hasText: new RegExp(`^${family}$`) }).last().click();
  await sleep(page, 360);
}

async function setWeight(page, label) {
  await page.locator('button', { hasText: new RegExp(`^${label}$`) }).first().click();
  await sleep(page, 130);
}

/** تصديرٌ واحد عبر نافذة التصدير نفسها: PNG، مُضاعِف ١×، هدفٌ واحد هو مقاس المشروع. */
async function exportPng(page, downloadDir) {
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await sleep(page, 300);
  await page.locator('button:has-text("PNG")').first().click();
  await sleep(page, 140);
  await page.locator('[data-testid="export-scale-1"]').click();
  await sleep(page, 120);
  const tiles = await page.locator('[data-testid^="export-target-"]').evaluateAll((els) =>
    els.map((el) => ({ id: el.getAttribute('data-testid').replace('export-target-', ''), on: el.getAttribute('data-on') === 'true' })),
  );
  for (const t of tiles) {
    if (t.on !== (t.id === 'ig-portrait')) {
      await page.locator(`[data-testid="export-target-${t.id}"]`).click();
      await sleep(page, 60);
    }
  }
  const dl = page.waitForEvent('download', { timeout: 90000 });
  await page.locator('button', { hasText: /^تصدير (ملف واحد|ملفين|\d+ ملفات)$/ }).first().click();
  const download = await dl;
  const tmp = path.join(downloadDir, 'attempt.png');
  await download.saveAs(tmp);
  return tmp;
}

async function main() {
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-t03-'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  console.log('بناء محاولة t03-store-card من واجهة مزيج…');

  // ١) مستندٌ فارغ ١٠٨٠×١٣٥٠ («بوست عمودي»).
  await bootBlank(page, BASE_URL, 'ig-portrait');
  log('مستند فارغ ١٠٨٠×١٣٥٠');

  // ٢) وضع «احترافي»: حقول X/Y/W/H وكومة المظهر مشروطةٌ به.
  await page.locator('button', { hasText: /^احترافي$/ }).first().click();
  await sleep(page, 260);

  // ٣) الخلفيّة الكريميّة — مستطيلٌ ملء اللوحة.
  const bg = await addShape(page, 'rect');
  await setBox(page, T.bg);
  await setFillHex(page, bg, CREAM);
  log(`خلفيّة كريميّة ${bg}`);

  // ٤) أيقونة التطبيق — أوّل صورةٍ مستوردة.
  const icon = await addImage(page, path.join(ASSETS, 'icon.png'), T.icon);
  await setBox(page, T.icon);
  log(`أيقونة التطبيق ${icon}`);

  // ٥) «أدوات الكتابة الذكية» بالرمادي، متمركزةً داخل صندوقها.
  const tag = await addText(page, T.tagline.text);
  await setFont(page, FAMILY);
  await setFontSize(page, T.tagline.size);
  await setWeight(page, 'عادي');
  await setAlign(page, 1, 0);
  await setBox(page, T.tagline.box);
  await setFillHex(page, tag, GREY);
  log(`سطر الوصف ${tag}`);

  // ٦) «مِداد بانتظارك» بالأخضر الداكن، أكبر وأعرض.
  const head = await addText(page, T.headline.text);
  await setFont(page, FAMILY);
  await setFontSize(page, T.headline.size);
  await setWeight(page, 'عريض');
  await setAlign(page, 1, 0);
  await setBox(page, T.headline.box);
  await setFillHex(page, head, DARK);
  log(`العنوان ${head}`);

  // ٧) الشارتان: **صورتان منفصلتان** بينهما فجوةٌ حقيقيّة، لا لقطةٌ واحدة تضمّهما.
  const ba = await addImage(page, path.join(ASSETS, 'badge-appstore.png'), T.badgeA);
  await setBox(page, T.badgeA);
  log(`شارة App Store ${ba}`);

  const bgp = await addImage(page, path.join(ASSETS, 'badge-googleplay.png'), T.badgeG);
  await setBox(page, T.badgeG);
  log(`شارة Google Play ${bgp}`);

  // ٨) التصدير من نافذة التطبيق نفسها.
  const tmp = await exportPng(page, downloadDir);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.copyFileSync(tmp, OUT);
  log(`صُدِّر إلى ${OUT}`);

  if (errors.length) console.error('أخطاء زمن تشغيل:', errors.join(' | '));
  await browser.close();
  fs.rmSync(downloadDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
