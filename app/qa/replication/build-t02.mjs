#!/usr/bin/env node
// بناء محاولة الهدف `t02-kashida` من داخل واجهة مزيج وحدها.
//
// الهدف هنا ليس مرجعًا مؤلَّفًا ليكون قابلًا للإنجاز، بل **تصميمٌ منشورٌ فعلًا**
// سُلِّم هدفًا. فكل ما يعجز عنه هذا الملفّ هو نقصٌ حقيقيّ في البرنامج، مقيسٌ
// لا مُقدَّر — انظر تقرير الحلقة. والمرجع نفسه محليٌّ لا يُرفَع:
// `targets/t02-kashida/README.md`.
//
// وكل سطرٍ هنا إيماءةٌ يستطيع إنسانٌ أداءها بفأرةٍ ولوحة مفاتيح: نقرةٌ على زرّ، أو
// كتابةُ رقمٍ في حقل، أو ضغطةُ مفتاح. لا تحرير ملفات، ولا SVG مكتوبٌ بيد، ولا حقن
// حالة — هذا شرط القاعدة الثانية في `README.md`. وحتى الخروج يمرّ بنافذة التصدير.
//
// التشغيل: node qa/replication/build-t02.mjs [out.png]   (خادم التطوير يعمل)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { bootBlank } from '../helpers/boot.mjs';

const BASE_URL = process.env.QA_BASE_URL || process.env.MAZIJ_URL || 'http://localhost:1420';
const OUT = process.argv[2] || path.join(process.cwd(), 'qa/replication/attempt-t02.png');

const DOC = { w: 1080, h: 1350 };

// ألوان الهدف، مقيسةٌ من `target.png` لا مأخوذةٌ بالعين. ولا واحدَ منها تعطيه أيُّ
// لوحةٍ في `PALETTES` خلفيّةً أو تعبئة — ولهذا كلُّها يمرّ بكومة المظهر.
const CREAM = '#f4f1ea';
const DARK = '#12382a';
const ACCENT = '#1f8f55';
const MINT = '#cfe5d8';
const RED = '#d93025';
const GREY = '#98a198';

/** هندسة الهدف بالبكسل على لوحة ١٠٨٠×١٣٥٠، مقيسةً من `target.png`.
 *
 * صناديق النصّ أعرض وأعلى من حبرها: مزيج يضع خطّ الأساس الأول عند
 * `y + 0.9×مقاس الخطّ`، فصندوقٌ يبدأ عند حدّ الحبر يدفع السطر إلى أسفل. والأرقام
 * هنا هي ما وصلت إليه الحلقة بعد قياس فرق الحبر بين المحاولة والهدف. */
const T = {
  // خلفيّةٌ كريميّة. وهي **مستطيلٌ مرسوم**، لا خلفيّة اللوحة: اللوحة لا تقبل إلا
  // فهرس لوحةٍ جاهزة، و#f4f1ea ليس خلفيّةَ أيٍّ منها. انظر التقرير.
  bg: { x: 0, y: 0, w: 1080, h: 1350 },
  // الشريط النعناعي: مستطيلٌ مُدار ٢٫٣° — حافّته اليسرى عند ٢٢٣ على ارتفاع ١٠٠٠
  // وعند ٢٣٦ على ارتفاع ١٣٣٠، وهذا الفرق (١٣ بكسلًا) هو الميل نفسه.
  bar: { x: 224, y: 650, w: 151, h: 710, rot: -2.3 },
  // مقاس الخطّ مُعايَرٌ لا مُقدَّر: سطرُ المرجع بـAlexandria عرضه ٨٤٠٫٧ بكسلًا عند
  // مقاس ١٠٠، وحبر الهدف ٦٣٨ — فالمقاس ٧٦. ونصُّ السطر هنا نصُّ «رواق» الموصوف
  // في `spec.json`، لا نصُّ المرجع الأصلي: البند يقيس حبرًا وموضعًا ولونًا، لا
  // كلمات.
  line1: { text: 'نكهة يوم كاملة', x: 274, y: 525, w: 700, h: 130, size: 76 },
  // السطر الثاني **عنصران** لا عنصر واحد، لأن `TextElement.color` لونٌ واحد لكلّ
  // عنصر: «من» بالداكن، وبقيّة السطر بالأخضر الأفتح. وهذا ثمنٌ يدفعه المصمّم لا
  // اختيارٌ فنّي — انظر التقرير.
  line2a: { text: 'من', x: 772, y: 660, w: 200, h: 130, size: 76 },
  // والمدّ من البرنامج نفسه لا بحروف تطويلٍ مكتوبةٍ بيد: «تبرير بالكشيدة»
  // يمدّ السطر إلى عرض صندوقه، فالصندوق هنا ٥٤٢ — عرضُ حبر الهدف بالضبط —
  // والنصّ يصل إليه بكشيدةٍ حقيقيّة عند مواضع الوصل المسموح بها. ولهذا لا يتغيّر
  // عرضُ حبر هذا السطر بتغيّر كلماته: الكشيدة تملأ الصندوق أيًّا كان النصّ.
  line2b: { text: 'كوب واحد', x: 280, y: 660, w: 542, h: 130, size: 76, justify: true },
  kayf: { text: 'كيف ؟', x: 744, y: 845, w: 200, h: 80, size: 43 },
};

/** الخطّ الأحمر: **مسارٌ واحد** بحدٍّ متغيّر السُّمك.
 *
 * كان ثلاثةَ مساراتٍ بسُمك ٢٢/١٣/٧، لأن `AppearanceStrokeLayer.width` كان
 * رقمًا واحدًا لكلّ مسار فلم يكن في نموذج البيانات تدرّجٌ أصلًا. ووصلاتُ
 * القطع الثلاث كانت **تُرى**، وهي ما سمّاه المالك «ما يزال يُقرأ أنه ليس
 * الأصل». والآن `AppearanceStrokeLayer.widthProfile` يحمل التدرّج، فصار الخطّ
 * واحدًا بلا وصلة.
 *
 * والسُّمك والمَلمح **مقيسان من `target.png`** لا مقدَّران: المسحُ العموديّ
 * للحبر الأحمر يعطي ٢٠ بكسلًا عند x=٠، و١٧ عند ١٢٠، و١٤ عند ٣٠٠، و١٢ عند
 * ٤٧٠، و١٠ عند ٦٢٠، ثم ٣ عند ٧٩٠، و٢ عند ٨٢٠، وواحدًا عند ٨٥٠. وتحويلُ هذه
 * المواضع إلى كسورٍ من طول القوس يُخرج **خطًّا مستقيمًا**: واحدًا وعشرين
 * بكسلًا عند t=٠ نازلًا إلى نصف بكسل عند t=١ — فمَلمحٌ من نقطتين يكفي ولا
 * حاجة إلى نقطةٍ وسطى، وهو `taperEnd` الجاهز بالحرف (١ ← ٠٫٠٢).
 *
 * وأوّل نقطةٍ **خارج** اللوحة عن قصد (`x` سالبة): الخطّ يدخل من الحافّة اليسرى
 * لا من داخلها، ولا شيء في مزيج يقصّ إحداثيّة إلى حدود الصفحة. */
const RED_LINE = {
  width: 21,
  taper: 'taperEnd',
  // والنقاط نفسها **مقيسةٌ من مركز حبر الهدف** لا مقدَّرة: مسحٌ عموديّ كلّ
  // عشرين بكسلًا يعطي مركز الخطّ عند كلّ x، ومسحٌ أفقيّ كلّ صفٍّ يعطي فصّي
  // الحلقة وقاعها. وكانت النقاط السابقة تزيح المنحنى عشرَ بكسلاتٍ في نصفه
  // الأول وثلاثين في ذيله الصاعد — وهذا بعد إصلاح السُّمك هو أكبرُ ما بقي
  // من فرق.
  pts: [
    // مدخلٌ خارج اللوحة: المماسُّ عند x=٠ ممدودٌ إلى الخلف، لا رقمٌ كبيرٌ
    // يُرمى. الخطّ يدخل من الحافّة لا من داخلها.
    { x: -100, y: 884 },
    { x: 0, y: 917 },
    { x: 120, y: 947 },
    { x: 240, y: 965 },
    { x: 360, y: 976 },
    { x: 480, y: 986 },
    { x: 600, y: 1004 },
    { x: 680, y: 1029 },
    // الحلقة: تنزل على يمينها، تدور في قاعها عند y=١٢٤١، ثم تصعد على يسارها
    // وتعبر نفسها قرب (٧٣٥، ١١٠٥). والمضلَّع المعبَّأ يُرسَم بقاعدة `nonzero`،
    // فموضعُ التقاطع لفُّه ٢ ويبقى مصمتًا — و`evenodd` كانت ستثقبه.
    { x: 741, y: 1100 },
    { x: 762, y: 1175 },
    { x: 765, y: 1230 },
    { x: 755, y: 1241 },
    { x: 730, y: 1228 },
    { x: 700, y: 1205 },
    { x: 688, y: 1178 },
    { x: 700, y: 1145 },
    { x: 735, y: 1105 },
    // الذيل الصاعد إلى «كيف ؟». وطرفُه في الهدف ينتهي عند (٨٧٢، ٩٣٤) مقيسًا
    // بعتبةٍ متساهلةٍ تمسك الشعرة المموَّهة، لا عند (٨٧٨، ٩١٢) كما قُدِّر قبلًا.
    { x: 786, y: 1060 },
    { x: 850, y: 980 },
    { x: 872, y: 934 },
  ],
};

const log = (...m) => console.log('  ·', ...m);
const sleep = (page, ms) => page.waitForTimeout(ms);

/** حقل X/Y/W/H/∠ في قسم «التحويل». تُكتب القيمة رقمًا رقمًا كما تُكتب بيد: الحقل
 * مضبوطٌ بالكامل (`value={Math.round(raw)}`) فكل ضغطة تمرّ بحالةٍ وسيطة حقيقيّة. */
function geoField(page, key) {
  return page.locator('label').filter({ has: page.locator(`span:text-is("${key}")`) }).locator('input[type="number"]');
}

async function typeInto(locator, page, value) {
  await locator.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(String(value), { delay: 16 });
  await sleep(page, 80);
}

async function setBox(page, box) {
  for (const [k, v] of [['X', box.x], ['Y', box.y], ['W', box.w], ['H', box.h], ['∠', box.rot]]) {
    if (v === undefined) continue;
    await typeInto(geoField(page, k), page, v);
  }
}

const lastElId = (page) =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all.length ? all[all.length - 1].getAttribute('data-el-id') : null;
  });

/** اللون الحرّ: حقلُ الستّ عشريّ النصّيّ في كومة المظهر — يُكتب حرفًا حرفًا
 * كما يكتبه المصمّم ناسخًا من دليل الهويّة. وهو السطح الوحيد في لوح الخصائص
 * الذي يقبل لونًا حرًّا: الشرائح خمسةُ ألوانٍ كلّها من اللوحة المطبَّقة. */
async function setFillHex(page, elId, hex) {
  const sel = `[data-testid^="appearance-fill-${elId}-"][data-testid$="-hex"]`;
  await typeInto(page.locator(sel).first(), page, hex);
  await sleep(page, 150);
}

async function setStroke(page, elId, hex, width) {
  const base = `[data-testid^="appearance-stroke-${elId}-"]`;
  await typeInto(page.locator(`${base}[data-testid$="-hex"]`).first(), page, hex);
  await sleep(page, 150);
  const w = page.locator(`${base}[data-testid$="-width"]`).first();
  await typeInto(w, page, width);
  await page.keyboard.press('Enter');
  await sleep(page, 120);
}

/** «تدرّج السُّمك» في صفّ طبقة الحدّ: قائمةٌ منسدلة يختار منها المصمّم شكلًا
 * جاهزًا — إيماءةٌ واحدةٌ بالفأرة، كأيّ `<select>` في لوح الخصائص. */
async function setStrokeTaper(page, elId, presetId) {
  const sel = page.locator(`[data-testid^="appearance-stroke-${elId}-"][data-testid$="-taper"]`).first();
  await sel.selectOption(presetId);
  await sleep(page, 260);
}

async function addText(page, content) {
  await page.locator('[data-tool="text"]').click();
  await sleep(page, 180);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.mouse.click(ab.x + ab.width * 0.5, ab.y + ab.height * 0.5);
  await sleep(page, 420);
  await page.keyboard.type(content, { delay: 16 });
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

async function setFontSize(page, px) {
  const field = page.locator('label').filter({ has: page.locator('span:text-is("px")') }).locator('input[type="number"]');
  await typeInto(field, page, px);
  await page.keyboard.press('Enter');
  await sleep(page, 120);
}

/** أزرار المحاذاة الستّة بترتيب `ALIGN_BUTTONS`: ٠..٢ أفقيّة، ٣..٥ رأسيّة. */
async function setAlign(page, hIdx, vIdx) {
  const sec = page.locator('section').filter({ has: page.locator('.mz-label:text-is("المحاذاة")') });
  const btns = sec.locator('button');
  if (hIdx !== null) { await btns.nth(hIdx).click(); await sleep(page, 110); }
  if (vIdx !== null) { await btns.nth(3 + vIdx).click(); await sleep(page, 110); }
}

async function setWeight(page, label) {
  await page.locator('button', { hasText: new RegExp(`^${label}$`) }).first().click();
  await sleep(page, 130);
}

/** يرسم مسارًا بالقلم بنقراتٍ حقيقيّة. النقاط بإحداثيّات المستند، وقد تكون سالبة:
 * `docPointFromClient` في `Stage.tsx` لا يقصّ شيئًا، والرقعة الرماديّة حول اللوحة
 * تستقبل الضغطة فعلًا — وهذا ما يجعل مسارًا يتجاوز حدود الصفحة ممكنًا بالفأرة. */
async function drawPath(page, pts) {
  await page.locator('[data-tool="pen"]').click();
  await sleep(page, 200);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  const toClient = (d) => [ab.x + (d.x / DOC.w) * ab.width, ab.y + (d.y / DOC.h) * ab.height];
  for (const p of pts) {
    const [cx, cy] = toClient(p);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();
    await sleep(page, 45);
  }
  await page.keyboard.press('Enter');
  await sleep(page, 400);
  return lastElId(page);
}

async function setSmooth(page, elId, amount) {
  const s = page.locator(`[data-testid="smooth-amount-${elId}"]`);
  if (await s.count()) { await s.fill(String(amount)); await sleep(page, 200); }
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
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-t02-'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  console.log('بناء محاولة t02-kashida من واجهة مزيج…');

  // ١) مستندٌ فارغ ١٠٨٠×١٣٥٠ («بوست عمودي»).
  await bootBlank(page, BASE_URL, 'ig-portrait');
  log('مستند فارغ ١٠٨٠×١٣٥٠');

  // ٢) وضع «احترافي»: حقول X/Y/W/H وكومة المظهر وأداة القلم كلّها مشروطةٌ به.
  await page.locator('button', { hasText: /^احترافي$/ }).first().click();
  await sleep(page, 260);

  // ٣) الخلفيّة الكريميّة — مستطيلٌ ملء اللوحة.
  const bg = await addShape(page, 'rect');
  await setBox(page, T.bg);
  await setFillHex(page, bg, CREAM);
  log(`خلفيّة كريميّة ${bg}`);

  // ٤) الشريط النعناعي المائل خلف النصّ.
  const bar = await addShape(page, 'rect');
  await setBox(page, T.bar);
  await setFillHex(page, bar, MINT);
  log(`شريط نعناعي مائل ${bar}`);

  // ٥) السطر الأول.
  const l1 = await addText(page, T.line1.text);
  await setFontSize(page, T.line1.size);
  await setWeight(page, 'عريض');
  await setAlign(page, 0, 0);
  await setBox(page, T.line1);
  await setFillHex(page, l1, DARK);
  log(`السطر الأول ${l1}`);

  // ٦) «كوب واحد» بالأخضر الأفتح، ممدودًا بالكشيدة إلى عرض صندوقه.
  const l2b = await addText(page, T.line2b.text);
  await setFontSize(page, T.line2b.size);
  await setWeight(page, 'عريض');
  await setAlign(page, 0, 0);
  await setBox(page, T.line2b);
  await setFillHex(page, l2b, ACCENT);
  await page.locator('[data-testid="justify-kashida-toggle"]').check();
  await sleep(page, 400);
  log(`«كوب واحد» بالكشيدة ${l2b}`);

  // ٧) «من» بالأخضر الداكن، عنصرٌ ثانٍ في السطر نفسه.
  const l2a = await addText(page, T.line2a.text);
  await setFontSize(page, T.line2a.size);
  await setWeight(page, 'عريض');
  await setAlign(page, 0, 0);
  await setBox(page, T.line2a);
  await setFillHex(page, l2a, DARK);
  log(`«من» ${l2a}`);

  // ٨) «كيف ؟» الرماديّة.
  const kayf = await addText(page, T.kayf.text);
  await setFontSize(page, T.kayf.size);
  await setWeight(page, 'عادي');
  await setAlign(page, 0, 0);
  await setBox(page, T.kayf);
  await setFillHex(page, kayf, GREY);
  log(`«كيف ؟» ${kayf}`);

  // ٩) الخطّ الأحمر: مسارٌ واحد مفتوح يدخل من خارج الحافّة اليسرى ويلتفّ على
  //    نفسه، ثم يرقّ بمَلمحٍ واحد من كامل السُّمك إلى شعرة.
  const red = await drawPath(page, RED_LINE.pts);
  await setSmooth(page, red, 85);
  await setStroke(page, red, RED, RED_LINE.width);
  await setStrokeTaper(page, red, RED_LINE.taper);
  log(`الخطّ الأحمر، مسارٌ واحد بسُمك ${RED_LINE.width} ومَلمح «${RED_LINE.taper}» ${red}`);

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
