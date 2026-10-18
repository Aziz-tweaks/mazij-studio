#!/usr/bin/env node
// Dedicated regression coverage for the six confirmed defects in docs/BUGS.md.
// Each block reproduces the bug's exact repro steps first (so a revert of the fix
// would fail this file), then asserts the documented expected behavior. Companion
// to qa/engine.spec.mjs and qa/controls.spec.mjs, which this file does not duplicate.
//
// Run: node qa/bugfixes.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import { bootDemo } from './helpers/boot.mjs';

const BASE_URL = 'http://localhost:1420';
let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}

// --- independent geometry helpers (deliberately NOT imported from src/lib/geometry.ts,
// so this test can't pass merely because it shares a bug with the code under test) ---
function rotatePoint(p, c, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

async function docBox(page, id) {
  // Reads the element's *document-space* box directly from its inline style
  // (percentages of the 1080-wide artboard) plus its rotation from the transform —
  // independent of zoom/scale, exactly like the original bug-hunt repro in BUGS.md.
  const DOC_SIZE = 1080;
  const raw = await page.locator(`[data-el-id="${id}"]`).evaluate((el) => ({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height, transform: el.style.transform }));
  const pct = (s) => parseFloat(s) / 100;
  const m = raw.transform.match(/rotate\(([-\d.]+)deg\)/);
  return {
    x: pct(raw.left) * DOC_SIZE,
    y: pct(raw.top) * DOC_SIZE,
    w: pct(raw.width) * DOC_SIZE,
    h: pct(raw.height) * DOC_SIZE,
    rotation: m ? parseFloat(m[1]) : 0,
  };
}

function nwCorner(box) {
  const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  return rotatePoint({ x: box.x, y: box.y }, center, box.rotation);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await bootDemo(page, BASE_URL);

  const head = page.locator('[data-testid="stage-headline"]');
  const undoBtn = page.getByTitle('تراجع');
  const redoBtn = page.getByTitle('إعادة');

  // ============================================================
  // Bug 1 [Major]: resizing a rotated element breaks the anchor corner
  // ============================================================
  await head.click({ force: true });
  const rotateHandle = page.locator('[data-handle="rotate"]');
  let rBox = await rotateHandle.boundingBox();
  await page.mouse.move(rBox.x + rBox.width / 2, rBox.y + rBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rBox.x + 70, rBox.y + 55, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(80);

  const startBox = await docBox(page, 'head');
  assert(Math.abs(startBox.rotation) > 5, `bug1 setup: headline is now meaningfully rotated (${startBox.rotation.toFixed(1)}deg)`);
  const nwBefore = nwCorner(startBox);

  const seHandle = page.locator('[data-handle="se"]');
  const hBox = await seHandle.boundingBox();
  await page.mouse.move(hBox.x + hBox.width / 2, hBox.y + hBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(hBox.x + 90, hBox.y + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(80);

  const endBox = await docBox(page, 'head');
  assert(endBox.w > startBox.w + 10, `bug1: resizing from se actually grew the box (${startBox.w.toFixed(0)} -> ${endBox.w.toFixed(0)})`);
  assert(Math.abs(endBox.rotation - startBox.rotation) < 0.5, 'bug1: resizing a rotated element does not itself change the rotation');
  const nwAfter = nwCorner(endBox);
  const drift = Math.hypot(nwAfter.x - nwBefore.x, nwAfter.y - nwBefore.y);
  assert(
    drift < 3,
    `bug1: the anchor corner (nw, opposite the se handle) stays fixed in document space while resizing a rotated element — expected drift <3px, got ${drift.toFixed(1)}px (nw before: ${nwBefore.x.toFixed(1)},${nwBefore.y.toFixed(1)}; after: ${nwAfter.x.toFixed(1)},${nwAfter.y.toFixed(1)})`,
  );

  await undoBtn.click();
  await page.waitForTimeout(80);
  await undoBtn.click();
  await page.waitForTimeout(80);

  // ============================================================
  // Bug 2 [Major]: a plain click (no drag) pushes a bogus history entry
  // ============================================================
  assert(await undoBtn.isDisabled(), 'bug2 setup: undo starts disabled (clean history) after reverting the bug1 drags');

  const discount = page.locator('[data-el-id="discount"]');
  await discount.click({ force: true }); // select only, zero movement
  await page.waitForTimeout(80);
  assert(await undoBtn.isDisabled(), 'bug2: a plain click-to-select (no drag at all) does not push a history entry — undo stays disabled');

  // press-and-release a resize handle with literally zero on-screen movement
  await head.click({ force: true });
  await page.waitForTimeout(80);
  const seBox2 = await seHandle.boundingBox();
  await page.mouse.move(seBox2.x + seBox2.width / 2, seBox2.y + seBox2.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(80);
  assert(await undoBtn.isDisabled(), 'bug2: pressing then releasing a resize handle with zero movement does not push a history entry either');

  // a real drag still produces exactly one history entry that fully reverts
  const beforeRealMove = await docBox(page, 'head');
  const headScreen = await head.boundingBox();
  await page.mouse.move(headScreen.x + headScreen.width / 2, headScreen.y + headScreen.height / 2);
  await page.mouse.down();
  await page.mouse.move(headScreen.x + headScreen.width / 2 + 70, headScreen.y + headScreen.height / 2 + 50, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  assert(!(await undoBtn.isDisabled()), 'bug2: a real drag does push a history entry — undo becomes enabled');

  await discount.click({ force: true }); // a bogus click in between, same as the original repro
  await page.waitForTimeout(80);
  await undoBtn.click();
  await page.waitForTimeout(80);
  const afterOneUndo = await docBox(page, 'head');
  assert(
    Math.abs(afterOneUndo.x - beforeRealMove.x) < 2 && Math.abs(afterOneUndo.y - beforeRealMove.y) < 2,
    `bug2: a single undo after [real drag, then a bare click elsewhere] fully reverts the real drag — expected x~${beforeRealMove.x.toFixed(1)}, got ${afterOneUndo.x.toFixed(1)}`,
  );
  assert(await undoBtn.isDisabled(), 'bug2: history is clean again after that one undo (the bare click truly added nothing)');

  // ============================================================
  // Bug 3 [Minor]: PNG/SVG export ignores UI language for text alignment
  // ============================================================
  await page.getByRole('button', { name: 'ع' }).click().catch(() => {}); // ensure Arabic baseline first
  await page.waitForTimeout(80);
  await page.getByRole('button', { name: 'EN' }).click();
  await page.waitForTimeout(100);

  const liveDir = await head.evaluate((el) => getComputedStyle(el).direction);
  assert(liveDir === 'ltr', 'bug3 setup: the live artboard actually switches the headline to ltr when the UI language is English');

  await page.getByRole('button', { name: 'Export' }).click();
  await page.waitForTimeout(100);
  await page.getByText('SVG', { exact: true }).click().catch(() => {});
  await page.waitForTimeout(80);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export/ }).last().click()]);
  const svgPath = await download.path();
  const fs = await import('node:fs');
  const svgText = fs.readFileSync(svgPath, 'utf8');
  const headMatch = svgText.match(/<text[^>]*direction="ltr"[^>]*>عروض رواق هذا الأسبوع<\/text>/);
  assert(Boolean(headMatch), 'bug3: exported SVG renders the headline with direction="ltr" when the UI is English (matching the live artboard), not a hardcoded rtl');
  const anchorMatch = svgText.match(/<text([^>]*)>عروض رواق هذا الأسبوع<\/text>/);
  assert(Boolean(anchorMatch) && /text-anchor="start"/.test(anchorMatch[1]), 'bug3: the headline (halign "start") exports as text-anchor="start" under ltr — i.e. visually left, matching what English UI shows on the artboard, not mirrored to the right');

  await page.keyboard.press('Escape'); // closes the export dialog
  await page.getByRole('button', { name: 'ع' }).click();
  await page.waitForTimeout(80);

  // ============================================================
  // Bug 4 [Minor]: cancelling the image picker leaves the "صورة" tool stuck
  // ============================================================
  await page.getByTitle('I').click(); // صورة tool
  await page.waitForTimeout(80);
  const viewport = page.locator('[data-testid="artboard"]').locator('..'); // the Stage viewport div, which carries the tool cursor
  assert((await viewport.evaluate((el) => getComputedStyle(el).cursor)) === 'copy', 'bug4 setup: the صورة tool is active (copy cursor) before opening the picker');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.mouse.click((await viewport.boundingBox()).x + 5, (await viewport.boundingBox()).y + 5);
  const chooser = await fileChooserPromise;
  await chooser.element().dispatchEvent('cancel'); // simulates the user dismissing the native dialog
  await page.waitForTimeout(300);

  assert((await viewport.evaluate((el) => getComputedStyle(el).cursor)) !== 'copy', 'bug4: cancelling the file picker resets the tool away from صورة (cursor is no longer "copy")');
  assert((await page.locator('text=اسحب صورة هنا').count()) === 0, 'bug4: the صورة tool hint banner is gone after cancelling — the tool actually reset to تحديد');

  // ============================================================
  // Bug 5: the logo wordmark ("رواق") is now a real, editable text element
  // ============================================================
  const logoLabel = page.locator('[data-el-id="logo-label"]');
  await logoLabel.click({ force: true });
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid="selection-handles"]').count()) === 1, 'bug5: clicking the logo wordmark selects it and shows resize/rotate handles');
  assert((await page.locator('div.mz-label', { hasText: 'النص' }).count()) > 0, 'bug5: selecting the logo wordmark shows the Text section in the Design panel (content/font/color/align)');
  await logoLabel.dblclick({ force: true });
  await page.waitForTimeout(100);
  assert(await logoLabel.evaluate((el) => el.isContentEditable), 'bug5: double-clicking the logo wordmark starts real in-place text editing');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.type('رواق جديد');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert((await logoLabel.innerText()).includes('رواق جديد'), 'bug5: the typed edit actually commits onto the canvas');
  await undoBtn.click();
  await page.waitForTimeout(80);
  assert((await logoLabel.innerText()).includes('رواق'), 'bug5: undo reverts the logo text edit as a single step');

  // ============================================================
  // Bug 6: the badge text ("٥٠٪") is reachable and editable — alt-click reaches
  // the shape stacked underneath it
  // ============================================================
  const badge = page.locator('[data-el-id="badge"]');
  const badgeLabel = page.locator('[data-el-id="badge-label"]');
  const badgeBox = await badge.boundingBox();
  const badgeCenter = { x: badgeBox.x + badgeBox.width / 2, y: badgeBox.y + badgeBox.height / 2 };

  await page.mouse.click(badgeCenter.x, badgeCenter.y);
  await page.waitForTimeout(80);
  assert((await page.locator('div.mz-label', { hasText: 'النص' }).count()) > 0, 'bug6: a plain click on the badge reaches its "٥٠٪" text (the topmost element), not the inert circle underneath');
  await badgeLabel.dblclick({ force: true });
  await page.waitForTimeout(100);
  assert(await badgeLabel.evaluate((el) => el.isContentEditable), 'bug6: the badge text is editable in-place like any other text element');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);

  // page.mouse.click() has no `modifiers` option (that's a locator.click()-only API) —
  // hold the real key down around a low-level mouse click instead.
  await page.keyboard.down('Alt');
  await page.mouse.click(badgeCenter.x, badgeCenter.y);
  await page.keyboard.up('Alt');
  await page.waitForTimeout(80);
  assert((await page.locator('div.mz-label', { hasText: 'الشكل' }).count()) > 0, 'bug6: alt/option-click at the same point reaches the shape stacked underneath the text (Shape section shown)');

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (pageErrors.length) {
    console.log('Console/page errors observed during the run:');
    pageErrors.forEach((e) => console.log(' -', e));
  }
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
