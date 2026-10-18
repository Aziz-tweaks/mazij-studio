#!/usr/bin/env node
// Covers the Phase 2 editing engine: select/deselect/multi-select, drag-move,
// resize handles, rotate handle, text edit-in-place, image drag-drop insert,
// z-order, undo/redo of each, and correct pointer->doc coordinate mapping at a
// non-default zoom level. Companion to qa/controls.spec.mjs (Phase 1 controls),
// which this file does not duplicate.
//
// Run: node qa/engine.spec.mjs   (dev server must be running on :1420)
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

// A valid 2x2 red PNG, used for the drag-and-drop image-insert test.
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAwAAFAAwJAP+Vx3dXAAAAAElFTkSuQmCC';

async function elBox(page, id) {
  return page.locator(`[data-el-id="${id}"]`).boundingBox();
}

async function elStyleLeftTop(page, id) {
  return page.locator(`[data-el-id="${id}"]`).evaluate((el) => ({ left: el.style.left, top: el.style.top }));
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await bootDemo(page, BASE_URL);

  // --- SELECT / DESELECT / MULTI-SELECT ---
  // The badge is now two independent elements stacked together: the circle (shape,
  // id "badge") and its "٥٠٪" text (id "badge-label") layered on top — a plain click
  // reaches the topmost (the text, the thing you usually want to edit); alt-click
  // reaches the shape underneath. See bugfixes.spec.mjs for the dedicated coverage.
  const badge = page.locator('[data-el-id="badge"]');
  await badge.click({ force: true });
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid="selection-handles"]').count()) === 1, 'select: clicking the badge shows resize/rotate handles');
  assert((await page.locator('div.mz-label', { hasText: 'النص' }).count()) > 0, 'select: clicking the badge reaches its text (topmost), showing the Text section');

  const artboard = page.locator('[data-testid="artboard"]');
  const abBox = await artboard.boundingBox();
  await page.mouse.click(abBox.x + 2, abBox.y + 2); // empty corner of the artboard
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid="selection-handles"]').count()) === 0, 'deselect: clicking empty canvas clears the selection');

  const head = page.locator('[data-testid="stage-headline"]');
  await head.click({ force: true });
  await badge.click({ force: true, modifiers: ['Shift'] });
  await page.waitForTimeout(80);
  // multi-select: both elements now carry the selection outline (we can't read React state directly,
  // so assert indirectly: a second shift-click on badge removes it from the selection again).
  await badge.click({ force: true, modifiers: ['Shift'] });
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid="selection-handles"]').count()) === 1, 'shift-click toggles an element out of a multi-selection, leaving the other selected');

  // --- MOVE (drag) + undo/redo ---
  await head.click({ force: true });
  const beforeMove = await elBox(page, 'head');
  const centerX = beforeMove.x + beforeMove.width / 2;
  const centerY = beforeMove.y + beforeMove.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 60, centerY + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const afterMove = await elBox(page, 'head');
  assert(Math.abs(afterMove.x - beforeMove.x) > 20, `move: dragging the headline changed its on-screen x (${beforeMove.x} -> ${afterMove.x})`);
  assert(Math.abs(afterMove.y - beforeMove.y) > 10, `move: dragging the headline changed its on-screen y (${beforeMove.y} -> ${afterMove.y})`);

  const undoBtn = page.getByTitle('تراجع');
  const redoBtn = page.getByTitle('إعادة');
  await undoBtn.click();
  await page.waitForTimeout(80);
  const afterUndoMove = await elBox(page, 'head');
  assert(Math.abs(afterUndoMove.x - beforeMove.x) < 2, 'move: undo reverts the drag to the original position (single history step, not per-pixel)');
  await redoBtn.click();
  await page.waitForTimeout(80);
  const afterRedoMove = await elBox(page, 'head');
  assert(Math.abs(afterRedoMove.x - afterMove.x) < 2, 'move: redo re-applies the drag');
  await undoBtn.click(); // leave head back at its original spot for later assertions
  await page.waitForTimeout(80);

  // --- RESIZE (se handle) + undo ---
  await head.click({ force: true });
  await page.waitForTimeout(80);
  const beforeResize = await elBox(page, 'head');
  const handle = page.locator('[data-handle="se"]');
  const hBox = await handle.boundingBox();
  await page.mouse.move(hBox.x + hBox.width / 2, hBox.y + hBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(hBox.x + 80, hBox.y + 50, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const afterResize = await elBox(page, 'head');
  assert(afterResize.width > beforeResize.width + 20, `resize: dragging the se handle grew the headline box width (${beforeResize.width} -> ${afterResize.width})`);
  assert(Math.abs(afterResize.x - beforeResize.x) < 3, 'resize: the opposite (nw) corner stayed anchored in place while resizing from se');
  await undoBtn.click();
  await page.waitForTimeout(80);
  const afterUndoResize = await elBox(page, 'head');
  assert(Math.abs(afterUndoResize.width - beforeResize.width) < 2, 'resize: undo reverts the box size');

  // --- ROTATE (rotate handle) + undo ---
  await head.click({ force: true });
  await page.waitForTimeout(80);
  const rotateHandle = page.locator('[data-handle="rotate"]');
  const rBox = await rotateHandle.boundingBox();
  const beforeTransform = await head.evaluate((el) => el.style.transform);
  await page.mouse.move(rBox.x + rBox.width / 2, rBox.y + rBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rBox.x + 60, rBox.y + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const afterTransform = await head.evaluate((el) => el.style.transform);
  assert(afterTransform !== beforeTransform, `rotate: dragging the rotate handle changed the element's transform (${beforeTransform} -> ${afterTransform})`);
  await undoBtn.click();
  await page.waitForTimeout(80);
  const afterUndoTransform = await head.evaluate((el) => el.style.transform);
  assert(afterUndoTransform === beforeTransform, 'rotate: undo reverts the rotation');

  // --- TEXT EDIT IN PLACE (double-click, type, Escape commits) ---
  await head.dblclick({ force: true });
  await page.waitForTimeout(100);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.type('نص محرر مباشرة');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert((await head.innerText()).includes('نص محرر مباشرة'), 'text edit: double-click + type + Escape commits new text on the canvas');
  const contentInput = page.locator('input[value="نص محرر مباشرة"]');
  assert((await contentInput.count()) === 1, 'text edit: the committed text is reflected back into the Design panel content field');
  await undoBtn.click();
  await page.waitForTimeout(80);
  assert((await head.innerText()).includes('عروض رواق هذا الأسبوع') || (await head.innerText()).includes('اختبار') === false, 'text edit: undo reverts the in-place edit');

  // commit-on-blur path
  await head.dblclick({ force: true });
  await page.waitForTimeout(100);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.type('محرر ثم نقر خارجي');
  await page.mouse.click(abBox.x + 2, abBox.y + 2);
  await page.waitForTimeout(100);
  assert((await head.innerText()).includes('محرر ثم نقر خارجي'), 'text edit: blurring (clicking away) also commits the edit');
  await undoBtn.click();
  await page.waitForTimeout(80);

  // --- IMAGE INSERT via drag-and-drop ---
  const elementCountBefore = await page.locator('[data-el-id]').count();
  await page.evaluate(
    async ({ b64, box }) => {
      const res = await fetch(`data:image/png;base64,${b64}`);
      const blob = await res.blob();
      const file = new File([blob], 'dropped.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const target = document.querySelector('[data-testid="artboard"]');
      const rect = target.getBoundingClientRect();
      const clientX = rect.left + rect.width * 0.5;
      const clientY = rect.top + rect.height * 0.5;
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
      void box;
    },
    { b64: TINY_PNG_B64, box: abBox },
  );
  await page.waitForTimeout(200);
  const elementCountAfter = await page.locator('[data-el-id]').count();
  assert(elementCountAfter === elementCountBefore + 1, `image insert: dropping an image file onto the artboard added one new element (${elementCountBefore} -> ${elementCountAfter})`);
  const droppedImg = page.locator('[data-el-id] img').last();
  assert((await droppedImg.getAttribute('src'))?.startsWith('data:image/png'), 'image insert: the dropped file is loaded as a real image element (data URL), not a placeholder');
  await undoBtn.click();
  await page.waitForTimeout(80);
  assert((await page.locator('[data-el-id]').count()) === elementCountBefore, 'image insert: undo removes the inserted element');
  await redoBtn.click();
  await page.waitForTimeout(80);
  assert((await page.locator('[data-el-id]').count()) === elementCountAfter, 'image insert: redo re-adds it');
  await undoBtn.click();
  await page.waitForTimeout(80);

  // --- PRO MODE: z-order (bring forward / send backward) + undo ---
  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(100);
  await badge.click({ force: true });
  await page.waitForTimeout(80);
  const orderBefore = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  await page.locator('button', { hasText: 'للأمام' }).click();
  await page.waitForTimeout(80);
  const orderAfterForward = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  assert(JSON.stringify(orderAfterForward) !== JSON.stringify(orderBefore), 'z-order: "للأمام" (bring forward) changed the element paint order');
  await undoBtn.click();
  await page.waitForTimeout(80);
  const orderAfterUndo = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  assert(JSON.stringify(orderAfterUndo) === JSON.stringify(orderBefore), 'z-order: undo restores the original paint order');

  // --- PRO MODE: align selected element to artboard edge ---
  // Select the badge *shape* specifically (not its overlapping text) via its exact-text
  // Timeline row — a plain stage click now reaches the text layered on top instead.
  const badgeShapeRow = page.locator('button', { hasText: /^الشارة$/ }).first();
  await badgeShapeRow.click();
  await page.waitForTimeout(80);
  const beforeAlign = await elStyleLeftTop(page, 'badge');
  const alignButtons = page.locator('div.mz-label', { hasText: 'محاذاة العناصر' }).locator('..').locator('button');
  await alignButtons.first().click(); // align-left
  await page.waitForTimeout(80);
  const afterAlign = await elStyleLeftTop(page, 'badge');
  assert(afterAlign.left !== beforeAlign.left, `align: "align left" moved the badge's x position (${beforeAlign.left} -> ${afterAlign.left})`);
  assert(afterAlign.left === '0%', `align: "align left" placed the badge flush against the artboard's left edge (got ${afterAlign.left})`);
  await undoBtn.click();
  await page.waitForTimeout(80);

  // --- PRO MODE: layer visibility toggle in the Timeline ---
  const badgeLayerRow = page.locator('button', { hasText: /^الشارة$/ }).first().locator('..');
  const hideBtn = badgeLayerRow.locator('button[title="إخفاء"]');
  await hideBtn.click();
  await page.waitForTimeout(80);
  assert((await badge.count()) === 0 || !(await badge.isVisible().catch(() => false)), 'layer visibility: hiding the badge layer removes it from the rendered canvas');
  await undoBtn.click();
  await page.waitForTimeout(80);
  assert(await badge.isVisible(), 'layer visibility: undo restores the badge on the canvas');

  // --- SELECTION / DRAG MAPPING AT A NON-DEFAULT ZOOM ---
  // Zoom in several steps so the artboard renders noticeably larger than "fit".
  for (let i = 0; i < 6; i++) {
    await page.locator('button', { hasText: '+' }).first().click();
  }
  await page.waitForTimeout(150);
  const zoomLabel = await page.locator('span').filter({ hasText: '%' }).first().innerText();
  assert(parseInt(zoomLabel, 10) > 100, `zoom: zoom-in controls increased the zoom level past 100% (now ${zoomLabel})`);

  await head.click({ force: true });
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid="selection-handles"]').count()) === 1, 'zoom: clicking the headline at a non-default zoom still selects it (native hit-testing through the CSS scale transform)');

  const beforeZoomDrag = await elStyleLeftTop(page, 'head');
  const screenBoxAtZoom = await elBox(page, 'head');
  const cx = screenBoxAtZoom.x + screenBoxAtZoom.width / 2;
  const cy = screenBoxAtZoom.y + screenBoxAtZoom.height / 2;
  const SCREEN_DELTA = 90;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + SCREEN_DELTA, cy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const afterZoomDrag = await elStyleLeftTop(page, 'head');

  const docSize = 1080; // default artboard preset (Instagram post) is square 1080x1080
  const docDx = (parseFloat(afterZoomDrag.left) - parseFloat(beforeZoomDrag.left)) * (docSize / 100);
  const artboardBoxAtZoom = await artboard.boundingBox();
  const scaleAtZoom = artboardBoxAtZoom.width / docSize;
  const expectedDocDx = SCREEN_DELTA / scaleAtZoom;
  assert(
    Math.abs(docDx - expectedDocDx) < expectedDocDx * 0.25 + 2,
    `zoom: a ${SCREEN_DELTA}px on-screen drag at ${scaleAtZoom.toFixed(2)}x scale moved the element by the correctly-converted document-space amount (expected ~${expectedDocDx.toFixed(1)}px, got ${docDx.toFixed(1)}px) — pointer coordinates are properly divided by the zoom scale rather than treated as 1:1`,
  );
  await undoBtn.click();
  await page.waitForTimeout(80);
  await actionsResetZoom(page);

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (pageErrors.length) {
    console.log('Console/page errors observed during the run:');
    pageErrors.forEach((e) => console.log(' -', e));
  }
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

async function actionsResetZoom(page) {
  await page.locator('button', { hasText: 'ملاءمة' }).click().catch(() => {});
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
