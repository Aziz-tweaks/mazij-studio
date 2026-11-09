#!/usr/bin/env node
// تنظيم العناصر: تجميع · قفل · إخفاء · تسمية — والتصدير «كل لوحة بمقاسها».
//
// لماذا هذا الملف. كان `grep -E 'groupSelected|ungroup|setLocked|toggleLock'` على
// `src` لا يُرجع شيئًا: التجميع والقفل **قدرةٌ غائبة** لا زرٌّ ناقص (الفجوة الثالثة
// في قياسٌ خارجيٌّ موثَّق). وكانت قائمة الطبقات تعرض «شكل · mvdiutl2»
// — معرّفًا خامًا لا اسمًا (البند ٨ في `docs/UX-AUDIT-2026-10-18.md`).
//
// ما يُغطّيه، كلّه عبر الواجهة الحيّة بأحداث مؤشّرٍ ولوحة مفاتيح حقيقية:
// (١) أسماء الطبقات مشتقّة من المحتوى، ولا يظهر فيها معرّفٌ خام أبدًا — في قائمة
//     الطبقات وفي بناء القوالب معًا (كان الثاني يعرض المعرّف **كاملًا**)؛
// (٢) إعادة التسمية بنقرةٍ مزدوجة على السطر، والاسم الفارغ يرجع للمشتقّ؛
// (٣) ⌘G/⇧⌘G تجميع وفكّ تجميع، وتحديد عضوٍ يحدّد المجموعة كلها؛
// (٤) ⌘2/⌥⌘2 قفل وفكّ قفل الكل، و⌘3/⌥⌘3 إخفاء وإظهار الكل — في الوضع **البسيط**
//     (كانت عين الإخفاء مشروطة بالوضع الاحترافي وحده)؛
// (٥) **الأهمّ عمليًّا**: العنصر المقفل يُمرِّر الضغط ولا يبتلعه، فيُرسَم فوق الخلفية
//     المقفلة بدل أن تُسحَب هي. بدون هذا يكون القفل «منطقة ميتة» لا قفلًا؛
// (٦) كل إجراءٍ منها **خطوة تراجعٍ واحدة بالضبط**، مهما بلغ عدد العناصر؛
// (٧) «كل لوحة بمقاسها» في التصدير: ثلاث لوحات ⇐ ثلاثة ملفات بمقاساتها هي، لا
//     ضربًا ديكارتيًّا في قائمة المقاسات — مع التحقّق من أبعاد البكسل من بايتات
//     الملف نفسه، لا من اسمه.
//
// Run: node qa/layer-organisation.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE_URL = 'http://localhost:1420';
const AUTOSAVE_KEY = 'mazij.autosave.v1';
let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}

/** أبعاد PNG من ترويسة IHDR مباشرة — من بايتات الملف، لا من اسمه. */
function pngSize(file) {
  const b = fs.readFileSync(file);
  const sig = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  return { sig, w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

const GROUP_BADGE = '[data-layer-id] svg path[d="M3 6h6v6H3zM8 8h6v6H8z"]';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.locator('[data-testid="format-row-ig"]').click();
  await page.waitForSelector('[data-testid="artboard"]');

  const box = () => page.locator('[data-testid="artboard"]').boundingBox();
  const armShape = async () => {
    await page.locator('[data-tool="shape"]').click();
    await page.waitForTimeout(140);
  };
  const count = () => page.evaluate(() => document.querySelectorAll('[data-layer-id]').length);
  const badges = () => page.evaluate((s) => document.querySelectorAll(s).length, GROUP_BADGE);
  const names = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-layer-id]')].map((r) => (r.textContent || '').replace(/\s+/g, ' ').trim()),
    );
  const lockedCount = () =>
    page.evaluate(() => [...document.querySelectorAll('[data-testid^="layer-lock-"]')].filter((b) => b.getAttribute('aria-pressed') === 'true').length);
  const hiddenCount = () =>
    page.evaluate(() => [...document.querySelectorAll('[data-testid^="layer-visible-"]')].filter((b) => b.getAttribute('aria-pressed') === 'true').length);

  async function drag(x0, y0, x1, y1) {
    const r = await box();
    const p = (fx, fy) => ({ x: r.x + r.width * fx, y: r.y + r.height * fy });
    const a = p(x0, y0);
    const b = p(x1, y1);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(220);
  }
  async function clickAt(fx, fy) {
    const r = await box();
    await page.mouse.click(r.x + r.width * fx, r.y + r.height * fy);
    await page.waitForTimeout(180);
  }

  // ---------- ١. أسماء مقروءة ----------
  await armShape(); await drag(0.05, 0.05, 0.30, 0.25);
  await armShape(); await drag(0.40, 0.05, 0.65, 0.25);
  await armShape(); await drag(0.05, 0.55, 0.30, 0.78);
  assert((await count()) === 3, `three shapes were drawn (got ${await count()})`);

  const n0 = await names();
  assert(
    n0.every((s) => !/(shape|text|image|lottie|video)-[a-z0-9]+-\d+/.test(s)),
    `layer names carry no raw element id — got ${JSON.stringify(n0)}`,
  );
  // الشظيّة القديمة كانت `id.split('-')[1]`: سلسلةٌ بالأساس ٣٦ من طابع الوقت.
  assert(
    n0.every((s) => !/\b[a-z0-9]{7,}\b/.test(s)),
    `layer names carry no base36 id fragment either — got ${JSON.stringify(n0)}`,
  );
  assert(n0.every((s) => s.includes('مستطيل')), `a drawn rectangle is named by its geometry — got ${JSON.stringify(n0)}`);

  // ---------- ٢. إعادة التسمية ----------
  const nameBtn = (i) => page.locator('[data-layer-id]').nth(i).locator('button').nth(2);
  await nameBtn(0).dblclick();
  await page.waitForTimeout(220);
  const renameInput = page.locator('[data-testid^="layer-rename-input-"]');
  assert((await renameInput.count()) === 1, 'double-clicking a layer name opens a rename field in place');
  await renameInput.fill('شعار المعرض');
  await renameInput.press('Enter');
  await page.waitForTimeout(200);
  assert((await names())[0].includes('شعار المعرض'), 'the typed layer name is shown in the list');

  // اسمٌ فارغ ليس اسمًا: يعود السطر إلى الاسم المشتقّ من المحتوى.
  await nameBtn(0).dblclick();
  await page.waitForTimeout(200);
  await page.locator('[data-testid^="layer-rename-input-"]').fill('');
  await page.locator('[data-testid^="layer-rename-input-"]').press('Enter');
  await page.waitForTimeout(220);
  assert((await names())[0].includes('مستطيل'), 'clearing a custom name falls back to the derived name, never to blank');

  // ---------- ٣. التجميع ----------
  await clickAt(0.15, 0.15);
  await page.keyboard.down('Shift');
  await clickAt(0.50, 0.15);
  await page.keyboard.up('Shift');
  const undoDepthProbe = await count();
  await page.keyboard.press('Meta+g');
  await page.waitForTimeout(250);
  assert((await badges()) === 2, `⌘G groups the two selected elements (badges: ${await badges()})`);
  assert((await count()) === undoDepthProbe, 'grouping does not add or remove any element');

  // تحديد عضوٍ واحد يحدّد المجموعة كلها — هذا كلّ ما تعنيه المجموعة عمليًّا.
  await clickAt(0.80, 0.90);
  await clickAt(0.15, 0.15);
  const selRows = await page.evaluate(() =>
    [...document.querySelectorAll('[data-layer-id]')].filter((r) => (r.getAttribute('style') || '').includes('accentSoft')).length,
  );
  assert(selRows === 2, `clicking one member selects the whole group (highlighted rows: ${selRows})`);

  // خطوة تراجعٍ **واحدة** للتجميع كلّه، مهما بلغ عدد الأعضاء.
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(250);
  assert((await badges()) === 0, `one ⌘Z undoes the whole group in a single step (badges left: ${await badges()})`);
  await page.keyboard.press('Meta+Shift+z');
  await page.waitForTimeout(250);
  assert((await badges()) === 2, `one redo restores it in a single step (badges: ${await badges()})`);

  await clickAt(0.15, 0.15);
  await page.keyboard.press('Meta+Shift+g');
  await page.waitForTimeout(250);
  assert((await badges()) === 0, '⇧⌘G ungroups');
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(250);
  assert((await badges()) === 2, 'ungroup is also exactly one undo step');
  await page.keyboard.press('Meta+Shift+g');
  await page.waitForTimeout(250);

  // ---------- ٤. القفل ----------
  await clickAt(0.80, 0.90);
  await clickAt(0.15, 0.15);
  await page.keyboard.press('Meta+2');
  await page.waitForTimeout(250);
  assert((await lockedCount()) === 1, `⌘2 locks exactly the selection (locked: ${await lockedCount()})`);
  const selAfterLock = await page.evaluate(() =>
    [...document.querySelectorAll('[data-layer-id]')].filter((r) => (r.getAttribute('style') || '').includes('accentSoft')).length,
  );
  assert(selAfterLock === 0, 'a locked element is dropped from the selection — no handles on something that no longer responds');

  // ٥. المقفل يُمرِّر الضغط: الأداة المسلَّحة ترسم فوقه بدل أن تسحبه.
  const beforeDraw = await count();
  await armShape();
  await drag(0.08, 0.08, 0.26, 0.22); // داخل الشكل المقفل تمامًا
  const afterDraw = await count();
  assert(afterDraw === beforeDraw + 1, `an armed tool DRAWS over a locked element instead of moving it (${beforeDraw} → ${afterDraw})`);

  await page.keyboard.press('Meta+Alt+2');
  await page.waitForTimeout(250);
  assert((await lockedCount()) === 0, `⌥⌘2 unlocks everything (still locked: ${await lockedCount()})`);
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(250);
  assert((await lockedCount()) === 1, 'unlock-all is exactly one undo step');
  await page.keyboard.press('Meta+Alt+2');
  await page.waitForTimeout(250);

  // زرّ القفل في سطر الطبقة يعمل في الوضع الافتراضي. (كان هنا تأكيدُ أنّ الاختبار
  // يجري في «بسيط» — ألغى المالك الوضعين في ٢٤ أكتوبر ٢٠٢٦، فالافتراضيّ هو الوحيد.)
  await page.locator('[data-testid^="layer-lock-"]').first().click();
  await page.waitForTimeout(250);
  assert((await lockedCount()) === 1, 'the per-row lock button works in simple mode');
  await page.locator('[data-testid^="layer-lock-"]').first().click();
  await page.waitForTimeout(250);
  assert((await lockedCount()) === 0, 'the per-row lock button toggles back off');

  // ---------- ٦. الإخفاء ----------
  assert((await page.locator('[data-testid^="layer-visible-"]').count()) > 0, 'the hide (eye) control exists in simple mode, not only in pro mode');
  await clickAt(0.50, 0.15);
  await page.keyboard.press('Meta+3');
  await page.waitForTimeout(250);
  assert((await hiddenCount()) === 1, `⌘3 hides the selection (hidden: ${await hiddenCount()})`);
  await page.keyboard.press('Meta+Alt+3');
  await page.waitForTimeout(250);
  assert((await hiddenCount()) === 0, `⌥⌘3 shows everything again (hidden: ${await hiddenCount()})`);
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(250);
  assert((await hiddenCount()) === 1, 'show-all is exactly one undo step');
  await page.keyboard.press('Meta+Alt+3');
  await page.waitForTimeout(250);

  // ---------- ٧. الأزرار المرئية، لا الاختصارات وحدها ----------
  await clickAt(0.15, 0.15);
  await page.keyboard.down('Shift');
  await clickAt(0.50, 0.15);
  await page.keyboard.up('Shift');
  assert((await page.locator('[data-testid="group-btn"]').count()) === 1, 'a visible «تجميع» button exists in the properties panel, not just ⌘G');
  assert(await page.locator('[data-testid="group-btn"]').isEnabled(), 'it is enabled with two elements selected');
  await page.locator('[data-testid="group-btn"]').click();
  await page.waitForTimeout(250);
  assert((await badges()) === 2, 'the «تجميع» button groups, same as ⌘G');
  assert(await page.locator('[data-testid="ungroup-btn"]').isEnabled(), '«فكّ التجميع» becomes enabled once a group is selected');
  await page.locator('[data-testid="ungroup-btn"]').click();
  await page.waitForTimeout(250);
  assert((await badges()) === 0, 'the «فكّ التجميع» button ungroups');

  // ---------- ٨. أسماء القوالب ----------
  await page.locator('[data-testid="open-templates-btn"]').click();
  await page.waitForSelector('[data-testid="templates-dialog"]');
  const slotLabels = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="slot-row-"] span')].map((s) => s.textContent.trim()),
  );
  assert(
    slotLabels.length > 0 && slotLabels.every((s) => !/(shape|text|image)-[a-z0-9]+-\d+/.test(s)),
    `the template slot list shows readable names, not raw ids — got ${JSON.stringify(slotLabels)}`,
  );
  await page.locator('[data-testid="close-templates-btn"]').click();
  await page.waitForTimeout(250);

  // ---------- ٩. «كل لوحة بمقاسها» ----------
  await page.locator('[data-testid="open-artboards-btn"]').click();
  await page.waitForSelector('[data-testid="artboards-dialog"]');
  const abIds = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="artboard-row-"]')].map((n) => n.getAttribute('data-testid').replace('artboard-row-', '')),
  );
  await page.locator(`[data-testid="duplicate-artboard-${abIds[0]}"]`).click();
  await page.waitForTimeout(350);
  await page.locator(`[data-testid="duplicate-artboard-${abIds[0]}"]`).click();
  await page.waitForTimeout(350);
  const ids3 = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="artboard-row-"]')].map((n) => n.getAttribute('data-testid').replace('artboard-row-', '')),
  );
  assert(ids3.length === 3, `three artboards exist (got ${ids3.length})`);
  await page.locator('[data-testid="close-artboards-btn"]').click();
  await page.waitForTimeout(250);

  // اللوحة النشطة إلى ١٠٨٠×١٩٢٠، فتختلف المقاسات فعلًا بين اللوحات.
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForSelector('[data-testid="size-menu"]');
  await page.locator('[data-testid="size-option-ig-story"]').click();
  await page.waitForTimeout(450);

  await page.getByRole('button', { name: 'تصدير', exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: /^1x$/ }).first().click();
  await page.waitForTimeout(200);

  const allAbToggle = page.locator('[data-testid="export-all-artboards-toggle"]');
  assert((await allAbToggle.count()) === 1, 'the "export all artboards" toggle is present with 3 artboards');
  await allAbToggle.click();
  await page.waitForTimeout(250);

  const ownToggle = page.locator('[data-testid="export-own-size-toggle"]');
  assert((await ownToggle.count()) === 1, '«كل لوحة بمقاسها» appears once "export all artboards" is on');
  await ownToggle.click();
  await page.waitForTimeout(250);
  assert((await ownToggle.getAttribute('aria-pressed')) === 'true', 'the own-size toggle reports its pressed state');
  assert((await page.locator('[data-testid="export-own-size-note"]').count()) === 1, 'a note states that the size list is ignored in this mode');

  const downloads = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('button', { hasText: 'تصدير' }).last().click();
  await page.waitForTimeout(10000);

  assert(
    downloads.length === 3,
    `three artboards produce exactly THREE files — one each, not a cross product with the size list (got ${downloads.length})`,
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-ownsize-'));
  const sizes = [];
  for (const d of downloads) {
    const p = path.join(dir, d.suggestedFilename());
    await d.saveAs(p);
    sizes.push(pngSize(p));
  }
  assert(sizes.every((s) => s.sig), 'every exported file is a real PNG by signature, not just by extension');
  // لوحتان ١٠٨٠×١٠٨٠ وواحدة ١٠٨٠×١٩٢٠ — كلٌّ بمقاسها هي، مقروءةً من بايتات الملف.
  const asStr = sizes.map((s) => `${s.w}x${s.h}`).sort();
  assert(
    JSON.stringify(asStr) === JSON.stringify(['1080x1080', '1080x1080', '1080x1920']),
    `each file carries its own artboard's real pixel size — got ${JSON.stringify(asStr)}`,
  );

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="export-result-"] span[data-out]')].map((n) => n.getAttribute('data-out')),
  );
  assert(
    rows.length === 3 && rows.every((r) => /^\d+x\d+$/.test(r)),
    `the result list reports the real written pixel size for each file — got ${JSON.stringify(rows)}`,
  );
  // المضاعِف ١× هنا، فالمعلَن يساوي المكتوب بالضبط.
  assert(
    JSON.stringify(rows.slice().sort()) === JSON.stringify(asStr),
    `the size the dialog reports matches the bytes on disk — dialog ${JSON.stringify(rows.slice().sort())} vs files ${JSON.stringify(asStr)}`,
  );

  fs.rmSync(dir, { recursive: true, force: true });

  assert(pageErrors.length === 0, `no uncaught page errors during the run: ${pageErrors.join('; ')}`);

  console.log(`${pass} passed, ${fail} failed.`);
  if (failures.length) failures.forEach((f) => console.log(' -', f));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
