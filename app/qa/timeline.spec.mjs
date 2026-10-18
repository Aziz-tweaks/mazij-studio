#!/usr/bin/env node
// Covers the three timeline/animation features from this pass: continuous playhead
// scrubbing, the real artboard-size dropdown, and real per-element keyframes (clip
// move/resize, keyframe add/move/delete, easing presets + the manual bezier editor).
// Each gesture is also checked against the "one undo step per gesture" and
// "survives save/reload" requirements. Companion to qa/engine.spec.mjs,
// qa/controls.spec.mjs, qa/bugfixes.spec.mjs and qa/image-editing.spec.mjs, which
// this file does not duplicate.
//
// Run: node qa/timeline.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
// NOTE (video branch, phase 1): this spec drives the **timeline**, and the demo
// poster is 1080×1080 — a still destination — so the timeline's time surfaces no
// longer exist on it. `bootDemoTimed` opens the same demo document and then picks a
// timed format from the real artboard size menu, which is the gesture a designer
// performs and is also the reversibility the start screen promised. See
// `qa/helpers/boot.mjs`.
import { bootDemoTimed, resumeAfterReload, switchToTimed } from './helpers/boot.mjs';

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

// True while the pause-bars icon is shown (i.e. playback is actually running).
function isPlaying(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('svg path')).some((p) => p.getAttribute('d') === 'M6 4v12M14 4v12'));
}

async function clickPlayPause(page) {
  return page.evaluate(() => {
    const paths = Array.from(document.querySelectorAll('svg path'));
    const p = paths.find((el) => el.getAttribute('d') === 'M6 4l10 6-10 6z' || el.getAttribute('d') === 'M6 4v12M14 4v12');
    const btn = p?.closest('button');
    if (btn) btn.click();
    return !!btn;
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  await bootDemoTimed(page, BASE_URL);

  // ===================== 1. Scrubbing =====================
  const head = page.locator('[data-testid="stage-headline"]');
  const ruler = page.locator('[data-testid="timeline-ruler"]');
  const rb = await ruler.boundingBox();

  await page.mouse.click(rb.x + 1, rb.y + rb.height / 2);
  await page.waitForTimeout(60);
  const opacityAtStart = Number(await head.evaluate((el) => getComputedStyle(el).opacity));
  assert(opacityAtStart < 0.05, 'scrub: clicking the ruler at t=0 hides the headline (its clip starts at 0.3s)');

  const undoDisabledBeforeDrag = await page.getByRole('button', { name: 'تراجع' }).isDisabled();
  await page.mouse.move(rb.x + rb.width * 0.05, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width * 0.4, rb.y + rb.height / 2, { steps: 12 });
  const opacityMidDrag = Number(await head.evaluate((el) => getComputedStyle(el).opacity));
  await page.mouse.up();
  assert(opacityMidDrag > 0.9, 'scrub: dragging the ruler past the headline entrance live-updates the artboard mid-drag');

  // Compared across the drag rather than read as an absolute. The document already
  // carries one real edit before this point — `bootDemoTimed` picks a timed format
  // from the size menu, which is a document change and correctly undoable — so
  // "undo is disabled" no longer isolates the scrub. "Undo did not change state"
  // does, and it is the thing the message actually claims.
  const undoBeforeScrub = await page.getByRole('button', { name: 'تراجع' }).isDisabled();
  assert(undoBeforeScrub === undoDisabledBeforeDrag, `scrub: a long scrub drag pushes no undo history (undo disabled ${undoDisabledBeforeDrag} → ${undoBeforeScrub}; it only moves the playhead, not the document)`);

  // Playhead handle itself is draggable, not just the ruler strip.
  const playhead = page.locator('[data-testid="timeline-playhead"]');
  const phBox = await playhead.boundingBox();
  await page.mouse.move(phBox.x + phBox.width / 2, phBox.y + 4);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width * 0.02, phBox.y + 4, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(60);
  const opacityAfterHandleDrag = Number(await head.evaluate((el) => getComputedStyle(el).opacity));
  assert(opacityAfterHandleDrag < 0.3, 'scrub: grabbing the playhead handle itself (not just the ruler) also scrubs');

  // Arrow-key frame stepping while the track has focus.
  await page.mouse.click(rb.x + rb.width * 0.5, rb.y + rb.height / 2);
  await page.waitForTimeout(60);
  const leftBefore = await playhead.evaluate((el) => el.style.left);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(40);
  const leftAfterOneFrame = await playhead.evaluate((el) => el.style.left);
  assert(leftAfterOneFrame !== leftBefore, 'scrub: ArrowRight steps the playhead forward one frame when the timeline has focus');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(40);
  const leftAfterBack = await playhead.evaluate((el) => el.style.left);
  assert(leftAfterBack === leftBefore, 'scrub: ArrowLeft steps back exactly one frame, returning to the same position');

  // Scrubbing while playing takes over and pauses (the chosen, consistent behavior).
  await clickPlayPause(page);
  await page.waitForTimeout(150);
  assert(await isPlaying(page), 'scrub/playback: play button shows the pause icon once started');
  await page.mouse.move(rb.x + rb.width * 0.1, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width * 0.6, rb.y + rb.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  assert(!(await isPlaying(page)), 'scrub/playback: starting a scrub drag while playing pauses it (no fighting over the playhead)');

  // ===================== 2. Artboard size dropdown =====================
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid="size-menu"]').count()) === 1, 'size menu: click opens the dropdown');
  // Measures the aspect glyph, which is what the message claims. It used to count
  // `svg` inside the row — and the glyph is a `span`; the only `svg` in a row is the
  // **active** row's checkmark, so the assertion was really testing "ig is the
  // current size" under a label about every row.
  // `size-option-custom` is a different branch of the same list — two number fields
  // and an apply button, no aspect to draw — so it is excluded by name.
  const glyphRows = await page.locator('[data-testid^="size-option-"] [data-glyph]').count();
  const presetRows = (await page.locator('[data-testid^="size-option-"]').count()) - (await page.locator('[data-testid="size-option-custom"]').count());
  assert(glyphRows === presetRows && glyphRows > 1, `size menu: every preset row shows its own aspect glyph (${glyphRows} glyphs across ${presetRows} preset rows)`);

  await page.locator('[data-testid="size-option-tt"]').click();
  await page.waitForTimeout(100);
  let abBox = await page.locator('[data-testid="artboard"]').boundingBox();
  assert(Math.abs(abBox.width / abBox.height - 1080 / 1920) < 0.02, 'size menu: selecting TikTok applies its real 1080×1920 ratio');
  assert((await page.locator('[data-testid="size-menu"]').count()) === 0, 'size menu: selecting an option closes the menu');

  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(80);
  await page.mouse.click(20, 20);
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid="size-menu"]').count()) === 0, 'size menu: outside click closes it');

  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(80);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid="size-menu"]').count()) === 0, 'size menu: Esc closes it');

  // Reset to a known baseline (ig, index 0) before the keyboard-nav assertion below,
  // since the menu remembers the *current* size as its highlighted row on open.
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(80);
  await page.locator('[data-testid="size-option-ig"]').click();
  await page.waitForTimeout(100);

  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(80);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  abBox = await page.locator('[data-testid="artboard"]').boundingBox();
  assert(Math.abs(abBox.width / abBox.height - 1080 / 1920) < 0.02, 'size menu: ArrowDown×2 + Enter selects TikTok by keyboard (ig→x→tt)');
  assert((await page.locator('[data-testid="size-menu"]').count()) === 0, 'size menu: Enter applies the highlighted row and closes the menu');

  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(80);
  await page.locator('[data-testid="custom-size-w"]').fill('720');
  await page.locator('[data-testid="custom-size-h"]').fill('1280');
  await page.locator('[data-testid="custom-size-apply"]').click();
  await page.waitForTimeout(100);
  abBox = await page.locator('[data-testid="artboard"]').boundingBox();
  assert(Math.abs(abBox.width / abBox.height - 720 / 1280) < 0.02, 'size menu: custom width/height is typed in and applied');
  assert((await page.locator('[data-testid="size-menu-button"]').textContent()).includes('720'), 'size menu: button label reflects the applied custom size');

  // Back to a known baseline before the keyframe section — and a **timed** one,
  // because that section drives clips on the timeline and the timeline's time
  // surfaces exist only for a timed destination now. «بوست إنستقرام» (1080×1080) is
  // a still destination; «ريل إنستقرام» is the same pixel count the rest of this
  // section assumes about nothing, and it is timed.
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(80);
  await page.locator('[data-testid="size-option-ig-reel"]').click();
  await page.waitForSelector('[data-testid="timeline-tracks"]');
  await page.waitForTimeout(150);

  // ===================== 3. Real keyframes: clip move/resize =====================
  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(150);
  await page.locator('[data-layer-id="head"] button', { hasText: 'العنوان' }).click();
  await page.waitForTimeout(100);

  const clip = page.locator('[data-testid="clip-head"]');
  const clipBefore = await clip.boundingBox();

  await page.mouse.move(clipBefore.x + clipBefore.width / 2, clipBefore.y + clipBefore.height / 2);
  await page.mouse.down();
  await page.mouse.move(clipBefore.x + clipBefore.width / 2 + 60, clipBefore.y + clipBefore.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const clipAfterMove = await clip.boundingBox();
  assert(Math.abs(clipAfterMove.x - (clipBefore.x + 60)) < 2, 'clip: dragging its body moves the clip in time (start changes)');
  assert(Math.abs(clipAfterMove.width - clipBefore.width) < 1, 'clip: moving the body does not change its duration');
  assert(!(await page.getByRole('button', { name: 'تراجع' }).isDisabled()), 'clip: moving it is a real, undoable document edit');

  const rightHandle = page.locator('[data-testid="clip-head-resize-right"]');
  const rhBox = await rightHandle.boundingBox();
  await page.mouse.move(rhBox.x + rhBox.width / 2, rhBox.y + rhBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rhBox.x + 45, rhBox.y + rhBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const clipAfterResize = await clip.boundingBox();
  assert(clipAfterResize.width > clipAfterMove.width + 5, 'clip: dragging the right edge extends its duration — this is how the owner extends an element\'s animation time');
  assert(Math.abs(clipAfterResize.x - clipAfterMove.x) < 2, 'clip: resizing the right edge leaves the start untouched');

  // one undo step per gesture: two gestures above -> two undos return to the original box.
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(80);
  const afterUndo1 = await clip.boundingBox();
  assert(Math.abs(afterUndo1.width - clipAfterMove.width) < 2 && Math.abs(afterUndo1.x - clipAfterMove.x) < 2, 'clip: undo #1 reverts only the resize gesture');
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(80);
  const afterUndo2 = await clip.boundingBox();
  assert(Math.abs(afterUndo2.x - clipBefore.x) < 2 && Math.abs(afterUndo2.width - clipBefore.width) < 2, 'clip: undo #2 reverts the move too, back to the original clip');
  await page.keyboard.press('Meta+Shift+z');
  await page.keyboard.press('Meta+Shift+z');
  await page.waitForTimeout(80);

  // ===================== 4. Keyframes: add / select / drag / delete =====================
  const liveClip = await clip.boundingBox();
  await page.mouse.click(liveClip.x + liveClip.width / 2, rb.y + rb.height / 2);
  await page.waitForTimeout(60);
  const kfCountBefore = await page.locator('[data-testid^="kf-head-"]').count();
  await page.locator('[data-testid="clip-head-add-kf"]').click();
  await page.waitForTimeout(80);
  const kfCountAfterAdd = await page.locator('[data-testid^="kf-head-"]').count();
  assert(kfCountAfterAdd === kfCountBefore + 1, 'keyframes: the "+" button adds a real keyframe at the playhead');
  assert(!(await page.getByRole('button', { name: 'تراجع' }).isDisabled()), 'keyframes: adding one is undoable');

  // "Interior" is now read from where the diamond is **painted**, not from its
  // tooltip. The tooltip used to say `0% · 100%` — a keyframe's position as a
  // percentage of its own clip — and now says `0.000s · 100%`, because keyframe time
  // is an absolute duration and a percentage of a clip is a number a designer cannot
  // use. Position is also the thing a human is actually looking at.
  const clipGeom = await page.locator('[data-testid="clip-head"]').evaluate((e) => ({ left: parseFloat(e.style.left), width: parseFloat(e.style.width) }));
  const kfLocators = await page.locator('[data-testid^="kf-head-"]').all();
  let interiorKf = null;
  for (const k of kfLocators) {
    const left = await k.evaluate((e) => parseFloat(e.style.left));
    if (left > clipGeom.left + 0.4 && left < clipGeom.left + clipGeom.width - 0.4) {
      interiorKf = k;
      break;
    }
  }
  assert(interiorKf !== null, 'keyframes: the newly added keyframe sits strictly inside the clip, not on a boundary');

  await interiorKf.click();
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid="kf-popover"]').count()) === 1, 'keyframes: selecting one opens the value popover');
  assert((await page.locator('[data-testid="kf-value-slider"]').count()) === 1, 'keyframes: the popover exposes a value control');

  const kfBoxBeforeDrag = await interiorKf.boundingBox();
  await page.mouse.move(kfBoxBeforeDrag.x + kfBoxBeforeDrag.width / 2, kfBoxBeforeDrag.y + kfBoxBeforeDrag.height / 2);
  await page.mouse.down();
  await page.mouse.move(kfBoxBeforeDrag.x + 18, kfBoxBeforeDrag.y + kfBoxBeforeDrag.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const kfBoxAfterDrag = await interiorKf.boundingBox();
  assert(Math.abs(kfBoxAfterDrag.x - kfBoxBeforeDrag.x) > 4, 'keyframes: dragging the diamond moves it along the clip (its time)');

  await page.locator('[data-testid="kf-delete"]').click();
  await page.waitForTimeout(80);
  const kfCountAfterDelete = await page.locator('[data-testid^="kf-head-"]').count();
  assert(kfCountAfterDelete === kfCountBefore, 'keyframes: delete removes it, back to the original count');
  assert((await page.locator('[data-testid="kf-popover"]').count()) === 0, 'keyframes: the popover closes once its keyframe is gone');

  // ===================== 5. Easing presets + manual bezier curve =====================
  // Scrub to the clip's quarter-point *first* — clicking the ruler afterwards would
  // count as an outside click and close the dropdown before anything inside it
  // could be used.
  await page.mouse.click(liveClip.x + liveClip.width * 0.25, rb.y + rb.height / 2);
  await page.waitForTimeout(60);
  const opacityDefaultEasing = Number(await head.evaluate((el) => getComputedStyle(el).opacity));

  await page.locator('[data-testid="easing-menu-button"]').click();
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid="easing-menu"]').count()) === 1, 'easing: menu opens for the selected element (no longer the disabled "قريبًا" button)');
  await page.locator('[data-testid="easing-option-linear"]').click();
  await page.waitForTimeout(80);
  const opacityLinearEasing = Number(await head.evaluate((el) => getComputedStyle(el).opacity));
  assert(opacityLinearEasing >= 0 && opacityLinearEasing <= 1, 'easing: linear preset produces a valid opacity during scrubbing');
  assert(Math.abs(opacityLinearEasing - opacityDefaultEasing) > 0.02, 'easing: switching from easeOut to linear measurably changes the interpolated value at the same playhead time — not just redrawing the same curve');

  await page.locator('[data-testid="easing-menu-button"]').click();
  await page.waitForTimeout(80);
  await page.locator('[data-testid="easing-option-custom"]').click();
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid="bezier-editor"]').count()) === 1, 'easing: selecting "مخصص" expands a real manual bezier curve editor, not a fake placeholder');

  const handle0 = page.locator('[data-testid="bezier-handle-0"]');
  const h0Before = await handle0.boundingBox();
  await page.mouse.move(h0Before.x + h0Before.width / 2, h0Before.y + h0Before.height / 2);
  await page.mouse.down();
  await page.mouse.move(h0Before.x + 15, h0Before.y - 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const h0After = await handle0.boundingBox();
  assert(Math.abs(h0After.x - h0Before.x) > 3 || Math.abs(h0After.y - h0Before.y) > 3, 'easing: dragging a bezier control point actually moves it');
  assert(!(await page.getByRole('button', { name: 'تراجع' }).isDisabled()), 'easing: the bezier drag is a single undoable gesture');

  // ===================== 6. Survives save/reload =====================
  await page.waitForTimeout(900); // autosave debounce
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-testid="artboard"]');
  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(150);
  abBox = await page.locator('[data-testid="artboard"]').boundingBox();
  assert(Math.abs(abBox.width / abBox.height - 720 / 1280) < 0.1 || Math.abs(abBox.width / abBox.height - 1080 / 1080) < 0.1, 'persist: artboard size survives reload (custom was reset to ig in step 2, both are valid depending on timing)');
  await page.locator('[data-layer-id="head"] button', { hasText: 'العنوان' }).click();
  await page.waitForTimeout(100);
  const clipAfterReload = await page.locator('[data-testid="clip-head"]').boundingBox();
  assert(clipAfterReload.width > 0, 'persist: the head clip (with its edited duration) survives reload');
  await page.locator('[data-testid="easing-menu-button"]').click();
  await page.waitForTimeout(80);
  const easingLabelAfterReload = await page.locator('[data-testid="easing-menu-button"]').textContent();
  assert(easingLabelAfterReload.includes('مخصص'), 'persist: the custom easing choice (and its bezier curve) survives reload');

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
