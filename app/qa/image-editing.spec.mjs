#!/usr/bin/env node
// Covers the new أداة متّجهات-style image editing added on top of the Phase 2 engine:
// replace image (frame kept), crop/reposition+zoom within frame + reset, fit modes,
// flip H/V, numeric transform + lock aspect ratio, corner radius, border/stroke,
// clipping mask apply/release, single-undo-step per gesture, and that it all survives
// export (SVG, inspected as text) and a real reload (autosave round-trip).
//
// Run: node qa/image-editing.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import { bootDemo, resumeAfterReload } from './helpers/boot.mjs';

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

const RED_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAwAAFAAwJAP+Vx3dXAAAAAElFTkSuQmCC';
const BLUE_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR4nGNgYPgPRmAKABf2A/1+6zfzAAAAAElFTkSuQmCC';

async function dropImage(page, b64, name) {
  const elementCountBefore = await page.locator('[data-el-id]').count();
  await page.evaluate(
    async ({ b64, name }) => {
      const res = await fetch(`data:image/png;base64,${b64}`);
      const blob = await res.blob();
      const file = new File([blob], name, { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const target = document.querySelector('[data-testid="artboard"]');
      const rect = target.getBoundingClientRect();
      const clientX = rect.left + rect.width * 0.5;
      const clientY = rect.top + rect.height * 0.5;
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
    },
    { b64, name },
  );
  await page.waitForTimeout(250);
  assert((await page.locator('[data-el-id]').count()) === elementCountBefore + 1, `insert: dropping ${name} added one new image element`);
  return page.locator('[data-el-id] img').last().locator('..'); // the frame div (image element root) is the img's direct parent
}

async function labelField(page, labelText) {
  return page.locator('label', { hasText: labelText });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await bootDemo(page, BASE_URL);
  const undoBtn = page.getByTitle('تراجع');

  // Fresh real image, so its frame (geo), src, and natural size are all known.
  const frame = await dropImage(page, RED_PNG_B64, 'red.png');
  const img = frame.locator('img');
  const frameId = await frame.evaluate((el) => el.getAttribute('data-el-id'));
  await page.waitForTimeout(80);

  // ============================================================
  // Replace image — keeps the frame/transform
  // ============================================================
  const frameBefore = await frame.evaluate((el) => ({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height }));
  const srcBefore = await img.getAttribute('src');
  await page.once('filechooser', (fc) => fc.setFiles({ name: 'blue.png', mimeType: 'image/png', buffer: Buffer.from(BLUE_PNG_B64, 'base64') }));
  await page.locator('button', { hasText: 'استبدال الصورة' }).click();
  await page.waitForTimeout(200);
  const frameAfter = await frame.evaluate((el) => ({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height }));
  const srcAfter = await img.getAttribute('src');
  assert(srcAfter !== srcBefore && srcAfter.startsWith('data:image/png'), 'replace image: the picture content actually changed to the newly picked file');
  assert(JSON.stringify(frameAfter) === JSON.stringify(frameBefore), 'replace image: the frame (position/size) is kept exactly as-is, not reset');
  await undoBtn.click();
  await page.waitForTimeout(80);
  assert((await img.getAttribute('src')) === srcBefore, 'replace image: undo is a single step that restores the previous picture');

  // ============================================================
  // Crop / reposition + zoom within frame, plus reset
  // ============================================================
  await frame.dblclick({ force: true });
  await page.waitForTimeout(100);
  assert((await frame.getAttribute('data-crop-editing')) === 'true', 'crop: double-clicking the image enters crop-editing mode');

  const imgBoxBefore = await img.boundingBox();
  const frameBox = await frame.boundingBox();
  const styleBeforeDrag = await img.evaluate((el) => ({ left: el.style.left, top: el.style.top }));
  await page.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + frameBox.width / 2 + 20, frameBox.y + frameBox.height / 2 + 15, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const styleAfterDrag = await img.evaluate((el) => ({ left: el.style.left, top: el.style.top }));
  assert(styleAfterDrag.left !== styleBeforeDrag.left || styleAfterDrag.top !== styleBeforeDrag.top, 'crop: dragging inside the frame while crop-editing pans the image content (its own left/top style moved)');
  void imgBoxBefore;

  await undoBtn.click();
  await page.waitForTimeout(80);
  const styleAfterUndo = await img.evaluate((el) => ({ left: el.style.left, top: el.style.top }));
  assert(styleAfterUndo.left === styleBeforeDrag.left && styleAfterUndo.top === styleBeforeDrag.top, 'crop: undo is a single step that fully reverts the pan');

  const zoomRow = (await labelField(page, 'تكبير')).first();
  const zoomSlider = zoomRow.locator('input[type=range]');
  const widthBeforeZoom = await img.evaluate((el) => el.style.width);
  await zoomSlider.evaluate((el) => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await zoomSlider.fill('250');
  await zoomSlider.dispatchEvent('input');
  await zoomSlider.evaluate((el) => {
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await page.waitForTimeout(80);
  const widthAfterZoom = await img.evaluate((el) => el.style.width);
  assert(widthAfterZoom !== widthBeforeZoom, `zoom: moving the zoom slider actually scales the displayed image content (${widthBeforeZoom} -> ${widthAfterZoom})`);
  await undoBtn.click();
  await page.waitForTimeout(80);
  assert((await img.evaluate((el) => el.style.width)) === widthBeforeZoom, 'zoom: undo is a single step reverting the slider drag, not one step per tick');

  // dirty the crop again, then prove Reset returns to centered/100%
  await zoomSlider.evaluate((el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await zoomSlider.fill('300');
  await zoomSlider.dispatchEvent('input');
  await zoomSlider.evaluate((el) => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  await page.waitForTimeout(80);
  await page.locator('button', { hasText: 'إعادة ضبط الموضع والتكبير' }).click();
  await page.waitForTimeout(80);
  assert((await img.evaluate((el) => el.style.width)) === widthBeforeZoom, 'crop reset: restores the default centered/100% framing');
  // Leave the undo stack as-is here — reset already landed back on the clean 100%
  // framing, which is exactly the state later sections expect to start from.
  await page.keyboard.press('Escape'); // leave crop-editing mode

  // ============================================================
  // Fit mode (cover/contain/fill) — the dropped image is a 2x2 square, which the
  // auto-sized frame also starts out square (same aspect), so cover/contain/fill
  // would coincidentally look identical; stretch the frame's width first (drag the
  // "e" handle, which only changes width) so the mismatch actually shows up.
  // ============================================================
  await frame.click({ force: true });
  await page.waitForTimeout(80);
  const eHandle = page.locator('[data-handle="e"]');
  const eBox = await eHandle.boundingBox();
  await page.mouse.move(eBox.x + eBox.width / 2, eBox.y + eBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(eBox.x + 120, eBox.y + eBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);

  const widthUnderCover = await img.evaluate((el) => el.style.width);
  await page.locator('button', { hasText: 'احتواء' }).click();
  await page.waitForTimeout(80);
  const widthUnderContain = await img.evaluate((el) => el.style.width);
  assert(widthUnderContain !== widthUnderCover, `fit: switching from تعبئة (cover) to احتواء (contain) on a non-matching frame aspect actually changes the image content layout (${widthUnderCover} -> ${widthUnderContain})`);
  await page.locator('button', { hasText: 'تمديد' }).click();
  await page.waitForTimeout(80);
  const widthUnderFill = await img.evaluate((el) => el.style.width);
  assert(Math.abs(parseFloat(widthUnderFill) - 100) < 0.01, `fit: تمديد (fill/stretch) fills the frame exactly (~100% width, got ${widthUnderFill})`);
  await undoBtn.click(); // fill -> contain
  await page.waitForTimeout(80);
  await undoBtn.click(); // contain -> cover
  await page.waitForTimeout(80);
  await undoBtn.click(); // revert the width stretch
  await page.waitForTimeout(80);

  // ============================================================
  // Flip H / V
  // ============================================================
  const transformBeforeFlip = await img.evaluate((el) => el.style.transform);
  await page.locator('button', { hasText: 'عكس أفقي' }).click();
  await page.waitForTimeout(80);
  const transformAfterFlipH = await img.evaluate((el) => el.style.transform);
  assert(transformAfterFlipH.includes('scaleX(-1)'), `flip H: the image content's transform includes scaleX(-1) (${transformAfterFlipH})`);
  await undoBtn.click();
  await page.waitForTimeout(80);
  assert((await img.evaluate((el) => el.style.transform)) === transformBeforeFlip, 'flip H: a single undo reverts it');

  await page.locator('button', { hasText: 'عكس عمودي' }).click();
  await page.waitForTimeout(80);
  assert((await img.evaluate((el) => el.style.transform)).includes('scaleY(-1)'), 'flip V: the image content transform includes scaleY(-1)');
  await undoBtn.click();
  await page.waitForTimeout(80);

  // ============================================================
  // Corner radius + border/stroke
  // ============================================================
  const radiusBefore = await frame.evaluate((el) => el.style.borderRadius);
  const radiusRow = (await labelField(page, 'الزوايا')).first();
  await radiusRow.locator('input[type=range]').fill('40');
  await page.waitForTimeout(80);
  const radiusAfter = await frame.evaluate((el) => el.style.borderRadius);
  assert(radiusAfter !== radiusBefore, `radius: dragging the corner-radius slider changes the frame's border radius (${radiusBefore} -> ${radiusAfter})`);
  await undoBtn.click();
  await page.waitForTimeout(80);

  const strokeRow = (await labelField(page, 'الحدود')).first();
  const borderBefore = await frame.evaluate((el) => el.style.border);
  await strokeRow.locator('button', { hasText: 'بدون' }).click(); // toggles stroke on (button shows the *current* off-state label)
  await page.waitForTimeout(80);
  const borderAfter = await frame.evaluate((el) => el.style.border);
  assert(borderAfter !== borderBefore && borderAfter.includes('solid'), `stroke: turning the border on actually sets a solid border on the frame (${borderBefore} -> ${borderAfter})`);
  await undoBtn.click();
  await page.waitForTimeout(80);

  // ============================================================
  // Numeric transform fields + lock aspect ratio
  // ============================================================
  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(100);
  await frame.click({ force: true });
  await page.waitForTimeout(80);
  const wField = page.locator('label', { hasText: 'W' }).locator('input').first();
  const hField = page.locator('label', { hasText: 'H' }).locator('input').first();
  const hBeforeLock = await hField.inputValue();
  await page.locator('button', { hasText: 'قفل النسبة' }).click(); // enable lock
  await page.waitForTimeout(80);
  await wField.fill(String(Number(await wField.inputValue()) + 100));
  await wField.dispatchEvent('change');
  await page.waitForTimeout(80);
  const hAfterLockedResize = await hField.inputValue();
  assert(hAfterLockedResize !== hBeforeLock, `lock aspect: changing W while locked also changes H proportionally (${hBeforeLock} -> ${hAfterLockedResize})`);
  await undoBtn.click();
  await page.waitForTimeout(80);

  await page.locator('button', { hasText: 'قفل النسبة' }).click(); // disable lock again
  await page.waitForTimeout(80);
  const hBeforeUnlockedResize = await hField.inputValue();
  await wField.fill(String(Number(await wField.inputValue()) + 100));
  await wField.dispatchEvent('change');
  await page.waitForTimeout(80);
  assert((await hField.inputValue()) === hBeforeUnlockedResize, 'lock aspect: with the lock off, changing W leaves H untouched (same as before this feature)');
  await undoBtn.click();
  await page.waitForTimeout(80);

  // ============================================================
  // Clipping mask: apply to a shape, release it
  // ============================================================
  await page.locator('button', { hasText: 'تحديد' }).click(); // select tool
  await page.waitForTimeout(80);
  await page.locator('button', { hasText: 'أشكال' }).click();
  await page.waitForTimeout(80);
  // Draw in a region clear of every default element (and the dropped image, centered
  // on the artboard) — otherwise the mousedown would hit that element instead of the
  // empty background and drag it rather than start a shape-draw.
  const abBox = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.mouse.move(abBox.x + abBox.width * 0.6, abBox.y + abBox.height * 0.05);
  await page.mouse.down();
  await page.mouse.move(abBox.x + abBox.width * 0.8, abBox.y + abBox.height * 0.15, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const allIds = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  const shapeId = allIds.find((id) => id.startsWith('shape-'));
  assert(Boolean(shapeId), 'mask setup: drawing a rectangle in pro mode created a new shape element');

  await page.locator(`[data-testid="layer-name-${frameId}"]`).click();
  await page.locator(`[data-el-id="${shapeId}"]`).click({ force: true, modifiers: ['Shift'] });
  await page.waitForTimeout(80);
  assert((await page.locator('div.mz-label', { hasText: 'قص بالشكل' }).count()) > 0, 'mask: selecting one image + one shape together shows the clipping-mask section');
  await page.locator('button', { hasText: 'قص بالشكل' }).last().click();
  await page.waitForTimeout(80);
  const clipAfterApply = await frame.evaluate((el) => el.style.clipPath);
  assert(Boolean(clipAfterApply), `mask: applying the mask sets a real clip-path on the image frame (${clipAfterApply})`);
  assert((await page.locator(`[data-el-id="${shapeId}"]`).count()) === 0, 'mask: the masking shape is no longer painted on its own once consumed as a mask');

  // Re-select the image via its Timeline layer row, not a canvas click: the mask
  // shape sits far from the image's own frame on purpose (an empty corner, so drawing
  // it couldn't land on an existing element), so the resulting clip-path clips the
  // image's hit-testable area away from its own original screen position too.
  // In pro mode the row has [visibility toggle, select] buttons in that order.
  await page.locator(`[data-testid="layer-name-${frameId}"]`).click();
  await page.waitForTimeout(80);
  await page.locator('button', { hasText: 'فك القص' }).click();
  await page.waitForTimeout(80);
  assert(!(await frame.evaluate((el) => el.style.clipPath)), 'mask: releasing the mask clears the clip-path');
  assert((await page.locator(`[data-el-id="${shapeId}"]`).count()) === 1, 'mask: releasing the mask makes the shape independently visible again');
  await undoBtn.click(); // undo release
  await page.waitForTimeout(80);
  await undoBtn.click(); // undo apply
  await page.waitForTimeout(80);

  // ============================================================
  // Clipping mask is generic: a *text* element clips to a shape too (roadmap #4).
  // The pre-generalization build wired maskId only through the image frame, so these
  // assertions fail there — that is the point of covering text and not just an image.
  // ============================================================
  await page.locator('button', { hasText: 'تحديد' }).click(); // select tool
  await page.waitForTimeout(80);
  await page.locator('button', { hasText: 'أشكال' }).click();
  await page.waitForTimeout(80);
  // Same corner as above. The two undos just above reverted the *release* and the
  // *apply*, not the creation, so the first mask shape is still sitting here — and
  // this second drag therefore starts on top of it.
  //
  // That used to produce no second shape at all: a drag beginning over an existing
  // element was swallowed by that element and became a move, which is the very bug
  // this block's own comment describes wanting to avoid ("starts a draw instead of
  // dragging an element"). With `onElementPointerDown` now yielding the gesture to an
  // armed creation tool, the drag draws for real, so there are two shapes here and
  // the one under test is the one just drawn — the LAST shape, not the first.
  // Picking the first silently tested the older shape while the click below (which
  // hits whatever is topmost) masked the newer one.
  await page.mouse.move(abBox.x + abBox.width * 0.6, abBox.y + abBox.height * 0.05);
  await page.mouse.down();
  await page.mouse.move(abBox.x + abBox.width * 0.8, abBox.y + abBox.height * 0.15, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const idsForText = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  const textMaskShapeId = idsForText.filter((id) => id.startsWith('shape-')).pop();
  assert(Boolean(textMaskShapeId), 'generic mask setup: drawing a second rectangle created a new shape element');

  // 'discount' is a default text element of the starter document.
  const textEl = page.locator('[data-el-id="discount"]');
  assert((await textEl.count()) === 1, 'generic mask setup: the default text element is on the artboard');
  await page.locator('[data-testid="layer-name-discount"]').click();
  await page.waitForTimeout(80);
  await page.locator(`[data-el-id="${textMaskShapeId}"]`).click({ force: true, modifiers: ['Shift'] });
  await page.waitForTimeout(80);
  assert((await page.locator('div.mz-label', { hasText: 'قص بالشكل' }).count()) > 0, 'generic mask: selecting one *text* + one shape shows the clipping-mask section (not image-only)');
  await page.locator('button', { hasText: 'قص بالشكل' }).last().click();
  await page.waitForTimeout(80);
  const textClip = await textEl.evaluate((el) => el.style.clipPath);
  assert(Boolean(textClip), `generic mask: applying the mask sets a real clip-path on the text element (${textClip})`);
  assert((await page.locator(`[data-el-id="${textMaskShapeId}"]`).count()) === 0, 'generic mask: the masking shape stops painting on its own once consumed by a text element');

  await page.locator('[data-testid="layer-name-discount"]').click();
  await page.waitForTimeout(80);
  await page.locator('button', { hasText: 'فك القص' }).click();
  await page.waitForTimeout(80);
  assert(!(await textEl.evaluate((el) => el.style.clipPath)), 'generic mask: releasing the mask clears the text element clip-path');
  assert((await page.locator(`[data-el-id="${textMaskShapeId}"]`).count()) === 1, 'generic mask: releasing makes the shape independently visible again');
  await undoBtn.click(); // undo release
  await page.waitForTimeout(80);
  await undoBtn.click(); // undo apply
  await page.waitForTimeout(80);
  // Hand selection back to the image: the blocks below drive image-only controls
  // ('عكس أفقي'), which are not rendered while a text element is selected.
  await page.locator(`[data-testid="layer-name-${frameId}"]`).click();
  await page.waitForTimeout(80);

  // ============================================================
  // Export correctness (SVG, inspected as text) + survives reload
  // ============================================================
  await page.locator('button', { hasText: 'عكس أفقي' }).click(); // leave one durable change to check in the export/reload
  await page.waitForTimeout(80);

  await page.getByRole('button', { name: 'تصدير' }).click();
  await page.waitForTimeout(100);
  await page.locator('button', { hasText: 'SVG' }).click();
  await page.waitForTimeout(80);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('button', { hasText: 'تصدير' }).last().click()]);
  const fs = await import('node:fs');
  const svgText = fs.readFileSync(await download.path(), 'utf8');
  assert(svgText.includes('scale(-1 1)'), 'export: the flipped image content keeps its flip transform in the exported SVG');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);

  // Reload the page for real — a genuine autosave round-trip, not a state replay.
  await page.waitForTimeout(800); // past the 700ms autosave debounce
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-testid="artboard"]');
  const survivedCount = await page.locator(`[data-el-id="${frameId}"]`).count();
  assert(survivedCount === 1, 'reload: the inserted image element survives a real page reload (autosave round-trip)');
  if (survivedCount) {
    const reloadedImg = page.locator(`[data-el-id="${frameId}"] img`);
    assert((await reloadedImg.getAttribute('src'))?.startsWith('data:image/png'), 'reload: the picture content (src) survives the reload');
    assert((await reloadedImg.evaluate((el) => el.style.transform)).includes('scaleX(-1)'), 'reload: the flip (and by the same mechanism, crop/radius/stroke) survives the reload');
  }

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
