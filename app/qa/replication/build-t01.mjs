#!/usr/bin/env node
// بناء محاولة الهدف `t01-sidra` من داخل واجهة مزيج وحدها.
//
// كل سطرٍ هنا إيماءةٌ يستطيع إنسانٌ أداءها بفأرةٍ ولوحة مفاتيح: نقرةٌ على زرّ، أو
// كتابةُ رقمٍ في حقل، أو ضغطةُ مفتاح. لا تحرير ملفات، ولا SVG مكتوبٌ بيد، ولا حقن
// حالة — هذا شرط القاعدة الثانية في `README.md`، وبدونه لا تُثبت المحاولة شيئًا عن
// التطبيق. وحتى الخروج يمرّ بنافذة التصدير نفسها.
//
// القياسات مأخوذةٌ من `targets/t01-sidra/reference.html` مباشرةً (بكسلات مطلقة على
// لوحة ١٠٨٠×١٠٨٠)، لأن الهدف نفسه هو المواصفة.
//
// التشغيل: node qa/replication/build-t01.mjs [out.png]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { bootBlank } from '../helpers/boot.mjs';

const BASE_URL = process.env.QA_BASE_URL || process.env.MAZIJ_URL || 'http://localhost:1420';
const OUT = process.argv[2] || path.join(process.cwd(), 'qa/replication/attempt-t01.png');

/** هندسة الهدف بالبكسل، منقولةً عن `reference.html`.
 *
 * مواضع `y` للنصوص مُزاحةٌ عن أرقام المرجع بقدرٍ صغير (٧ و٣ و٢ بكسل) لأن مزيجًا
 * يضع خطّ الأساس الأول عند `y + 0.9×مقاس الخطّ` بينما يضعه CSS بنموذج نصف
 * الفراغ — نموذجان مختلفان لا عطلٌ في أحدهما. وهذه هي الإزاحة التي يصل إليها
 * المصمّم بالعين أو بسهم لوحة المفاتيح، وقد قيست هنا من فرق بكسلات الحبر بين
 * الملفّين. */
const T = {
  badge: { x: 60, y: 60, w: 180, h: 180 },
  // الصندوق نفسه مزاحٌ ببكسلين لنفس سبب إزاحات `y` أعلاه: محاذاةٌ رأسيّة وسطى
  // بنموذج خطّ أساسٍ يختلف عن `place-items: center` في المرجع.
  badgeLabel: { text: '٢٥٪', size: 58, x: 60, y: 62, w: 180, h: 180 },
  // التتبُّع منقولٌ عن `letter-spacing` في المرجع: `-0.01em` = ‑١٪ من مقاس الخطّ.
  // وهو هنا حامِلٌ لا زينة: عرض العنوان الطبيعي ٧٦١٫٠٧ بكسل وصندوقه ٧٦٠، فبدونه
  // ينكسر سطرين.
  head: { text: 'مذاق السدرة', x: 230, y: 432, w: 760, h: 150, size: 118, tracking: -1 },
  rule: { x: 570, y: 624, w: 420, h: 14 },
  sub: { text: 'افتتاح الفرع الجديد · حي الملقا', x: 230, y: 691, w: 760, h: 60, size: 44, opacity: 92 },
  foot: { text: 'الرياض', x: 690, y: 948, w: 300, h: 50, size: 32, tracking: 2, opacity: 75 },
};

const GOLD = '#FFB703';
const INK = '#0F3D3E';

const log = (...m) => console.log('  ·', ...m);

/** حقل X/Y/W/H في قسم «التحويل». تُكتب القيمة رقمًا رقمًا كما تُكتب بيد: الحقل
 * مضبوطٌ بالكامل (`value={Math.round(raw)}`) فكل ضغطة تمرّ بحالةٍ وسيطة حقيقيّة،
 * وهذا بالضبط ما أسقط حقل مقاس الخطّ سابقًا — فلا يُستعمل `fill()` هنا إطلاقًا. */
function geoField(page, key) {
  return page.locator('label').filter({ has: page.locator(`span:text-is("${key}")`) }).locator('input[type="number"]');
}

async function typeInto(locator, page, value) {
  await locator.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(String(value), { delay: 18 });
  await page.waitForTimeout(90);
}

/** يضبط صندوق العنصر المحدَّد بالبكسل — وشفافيّته — من حقول «التحويل». */
async function setBox(page, box) {
  for (const [k, v] of [['X', box.x], ['Y', box.y], ['W', box.w], ['H', box.h], ['◐', box.opacity]]) {
    if (v === undefined) continue;
    await typeInto(geoField(page, k), page, Math.round(v));
  }
}

const lastElId = (page) =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all.length ? all[all.length - 1].getAttribute('data-el-id') : null;
  });

/** ينقر على شريحة لونٍ في لوح الخصائص بعنوانها (`title` = الست عشري). */
async function swatch(page, hex) {
  await page.locator(`button[title="${hex}"]`).first().click();
  await page.waitForTimeout(160);
}

async function addText(page, content) {
  await page.locator('[data-tool="text"]').click();
  await page.waitForTimeout(180);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  // نقطةٌ في وسط اللوحة: موضع الإنشاء لا يهمّ لأن الصندوق يُضبط بالأرقام بعدها،
  // والمهمّ أن تُنشأ النصّ وتدخل التحرير فورًا كما يحدث بيد المصمّم.
  await page.mouse.click(ab.x + ab.width * 0.5, ab.y + ab.height * 0.5);
  await page.waitForTimeout(420);
  await page.keyboard.type(content, { delay: 18 });
  await page.waitForTimeout(260);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(220);
  return lastElId(page);
}

async function addShape(page, tile) {
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(320);
  await page.locator(`[data-shape-tile="${tile}"]`).click();
  await page.waitForTimeout(520);
  return lastElId(page);
}

/** حقل «تتبُّع الأحرف» في قسم النص. */
async function setTracking(page, elId, percent) {
  const field = page.locator(`[data-testid="text-tracking-${elId}"]`);
  await typeInto(field, page, percent);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(140);
}

async function setFontSize(page, px) {
  const field = page.locator('label').filter({ has: page.locator('span:text-is("px")') }).locator('input[type="number"]');
  await typeInto(field, page, px);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(140);
}

/** أزرار المحاذاة الأفقيّة/الرأسيّة الستّة، بترتيب `ALIGN_BUTTONS`. */
async function setAlign(page, hIdx, vIdx) {
  const sec = page.locator('section').filter({ has: page.locator('.mz-label:text-is("المحاذاة")') });
  const btns = sec.locator('button');
  if (hIdx !== null) {
    await btns.nth(hIdx).click();
    await page.waitForTimeout(120);
  }
  if (vIdx !== null) {
    await btns.nth(3 + vIdx).click();
    await page.waitForTimeout(120);
  }
}

async function setWeight(page, label) {
  await page.locator('button', { hasText: new RegExp(`^${label}$`) }).first().click();
  await page.waitForTimeout(140);
}

/** تصديرٌ واحد عبر نافذة التصدير نفسها: PNG، مُضاعِف ١×، هدفٌ واحد هو مقاس المشروع. */
async function exportPng(page, downloadDir) {
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(260);
  await page.locator('button:has-text("PNG")').first().click();
  await page.waitForTimeout(120);
  await page.locator('[data-testid="export-scale-1"]').click();
  await page.waitForTimeout(100);
  const tiles = await page.locator('[data-testid^="export-target-"]').evaluateAll((els) =>
    els.map((el) => ({ id: el.getAttribute('data-testid').replace('export-target-', ''), on: el.getAttribute('data-on') === 'true' })),
  );
  for (const t of tiles) {
    if (t.on !== (t.id === 'ig')) {
      await page.locator(`[data-testid="export-target-${t.id}"]`).click();
      await page.waitForTimeout(60);
    }
  }
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('button', { hasText: /^تصدير (ملف واحد|ملفين|\d+ ملفات)$/ }).first().click();
  const download = await dl;
  const tmp = path.join(downloadDir, 'attempt.png');
  await download.saveAs(tmp);
  return tmp;
}

async function main() {
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-t01-'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  console.log('بناء محاولة t01-sidra من واجهة مزيج…');

  // ١) مستندٌ فارغ بمقاس ١٠٨٠×١٠٨٠.
  await bootBlank(page, BASE_URL, 'ig');
  log('مستند فارغ ١٠٨٠×١٠٨٠');

  // ٢) اللوحة الثالثة (#0F3D3E / #F1FAEE / #FFB703) — وهي ألوان الهدف بالضبط.
  await page.locator('button', { hasText: /^المكتبة$/ }).first().click();
  await page.waitForTimeout(240);
  await page.locator('button', { hasText: /^الألوان$/ }).first().click();
  await page.waitForTimeout(260);
  await page.locator('[data-testid="palette-2"]').click();
  await page.waitForTimeout(320);
  log('اللوحة الثالثة مطبَّقة');

  // ٣) وضع «احترافي» — حقول X/Y/W/H لا تظهر إلا فيه.
  await page.locator('button', { hasText: /^احترافي$/ }).first().click();
  await page.waitForTimeout(240);

  // ٤) الشارة الدائريّة الذهبيّة في الزاوية العليا اليسرى.
  const badge = await addShape(page, 'ellipse');
  await swatch(page, GOLD);
  await setBox(page, T.badge);
  log(`شارة دائريّة ${badge}`);

  // ٥) «٢٥٪» داخلها، بلون الخلفيّة الداكن، محاذاةٌ وسطى أفقيًّا ورأسيًّا.
  const badgeLabel = await addText(page, T.badgeLabel.text);
  await setFontSize(page, T.badgeLabel.size);
  await setWeight(page, 'عريض');
  await swatch(page, INK);
  await setAlign(page, 1, 1);
  await setBox(page, T.badgeLabel);
  log(`نصّ الشارة ${badgeLabel}`);

  // ٦) العنوان الكبير، محاذًى إلى اليمين (في العربيّة «بداية» = اليمين).
  const head = await addText(page, T.head.text);
  await setFontSize(page, T.head.size);
  await setTracking(page, head, T.head.tracking);
  await setWeight(page, 'عريض');
  await setAlign(page, 0, 0);
  await setBox(page, T.head);
  log(`العنوان ${head}`);

  // ٧) الشريط الذهبي تحته.
  const rule = await addShape(page, 'rect');
  await swatch(page, GOLD);
  await setBox(page, T.rule);
  log(`الشريط ${rule}`);

  // ٨) سطر التفاصيل.
  const sub = await addText(page, T.sub.text);
  await setFontSize(page, T.sub.size);
  await setWeight(page, 'عادي');
  await setAlign(page, 0, 0);
  await setBox(page, T.sub);
  log(`سطر التفاصيل ${sub}`);

  // ٩) «الرياض» في الأسفل.
  const foot = await addText(page, T.foot.text);
  await setFontSize(page, T.foot.size);
  await setTracking(page, foot, T.foot.tracking);
  await setWeight(page, 'متوسط');
  await setAlign(page, 0, 0);
  await setBox(page, T.foot);
  log(`سطر المدينة ${foot}`);

  // ١٠) التصدير من نافذة التطبيق نفسها.
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
