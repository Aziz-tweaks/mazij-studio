#!/usr/bin/env node
// Covers roadmap item #2: independent per-property keyframe tracks (x/y/scale/
// rotation/opacity), each with its own keyframes and its own per-segment easing,
// replacing the single shared 0..100% "progress" curve. Companion to
// qa/timeline.spec.mjs (which covers the legacy/opacity-row mechanics this feature
// is built on top of and must not break) — this file is scoped to what's new:
// independence between tracks, per-segment easing, undo/persistence/back-compat for
// the new `tracks` field, and that the real export-frame renderer (not a
// reimplementation) honors it.
//
// Run: node qa/anim-tracks.spec.mjs   (dev server must be running on :1420)
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';
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

const SIZE = { id: 'ig', ar: 'بوست إنستقرام', en: 'Instagram Post', w: 200, h: 200 };
const PALETTE = { bg: '#000000', fg: '#FFFFFF', ac: '#FFB703' };
const RED = '#ff0000';

function makeShape({ start, duration, tracks }) {
  return {
    id: 'probe',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 100,
    geo: { x: 0.1, y: 0.4, w: 0.2, h: 0.2, rotation: 0 },
    shape: 'rect',
    fill: RED,
    fillToken: 'ac',
    stroke: null,
    strokeWidth: 0,
    radius: 0,
    anim: { preset: 'none', start, duration, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks },
  };
}

// --- 1. Independent tracks + real export-frame renderer -----------------------
// Calls the actual production render function (not a reimplementation) at two
// different times on one element whose x and opacity tracks carry different
// values/curves, then reads real pixels back via canvas — proof that the export
// path (PNG today, the same `drawElements`/`entranceVisualAt` call video/GIF frames
// go through) resolves each property independently.
async function testExportParity(page) {
  const el = makeShape({
    start: 0,
    duration: 1,
    tracks: {
      opacity: [
        { id: 'o0', t: 0, value: 0, easing: 'linear', bezier: [0, 0, 1, 1] },
        { id: 'o1', t: 1, value: 1, easing: 'linear', bezier: [0, 0, 1, 1] },
      ],
      x: [
        { id: 'x0', t: 0, value: 0, easing: 'linear', bezier: [0, 0, 1, 1] },
        { id: 'x1', t: 1, value: 0.5, easing: 'linear', bezier: [0, 0, 1, 1] },
      ],
    },
  });

  const result = await page.evaluate(
    async ({ size, palette, el, SIZE_W, SIZE_H }) => {
      const mod = await import('/src/lib/exportArtboard.ts');
      async function sample(time, px, py) {
        const blob = await mod.renderArtboardPng({ size, palette, elements: [el], transparent: true, lang: 'ar', time, scale: 1 });
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(SIZE_W, SIZE_H);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const d = ctx.getImageData(px, py, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
      }
      // original shape center: geo.x+w/2=0.2 of width, geo.y+h/2=0.5 of height
      const origX = Math.round(0.2 * SIZE_W);
      const origY = Math.round(0.5 * SIZE_H);
      // shifted center at time=1: x track adds 0.5 of width
      const shiftedX = Math.round((0.2 + 0.5) * SIZE_W);
      const atStartOrig = await sample(0, origX, origY);
      const atEndOrig = await sample(1, origX, origY);
      const atEndShifted = await sample(1, shiftedX, origY);
      return { atStartOrig, atEndOrig, atEndShifted };
    },
    { size: SIZE, palette: PALETTE, el, SIZE_W: SIZE.w, SIZE_H: SIZE.h },
  );

  assert(result.atStartOrig.a < 20, `export: opacity track at t=0 renders near-transparent at the shape's resting position (alpha=${result.atStartOrig.a})`);
  assert(result.atEndOrig.a < 20 || !(result.atEndOrig.r > 200 && result.atEndOrig.g < 60), `export: x track at t=1 has moved the shape away from its original position even though opacity is now ~1 (pixel there is not solid red: ${JSON.stringify(result.atEndOrig)})`);
  assert(result.atEndShifted.a > 200 && result.atEndShifted.r > 200 && result.atEndShifted.g < 60, `export: at t=1 the shape's real fill color is found at the *shifted* x position, proving the x track moved it independently of opacity (pixel=${JSON.stringify(result.atEndShifted)})`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await bootDemo(page, BASE_URL);

  await testExportParity(page);

  // --- 2. Timeline UI: per-property add/move/delete/easing on an expanded row ---
  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(150);
  await page.locator('[data-layer-id="head"] button', { hasText: 'العنوان' }).click();
  await page.waitForTimeout(100);

  const expandBtn = page.locator('[data-testid="expand-head"]');
  assert((await expandBtn.count()) === 1, 'tracks: the layer row has an expand toggle for its property tracks');
  await expandBtn.click();
  await page.waitForTimeout(100);

  const xBody = page.locator('[data-testid="clip-head-x"]');
  assert((await xBody.count()) === 1, 'tracks: expanding reveals an independent row for the x property');
  await xBody.scrollIntoViewIfNeeded();
  const xAddBtn = page.locator('[data-testid="clip-head-add-kf-x"]');

  // Scrub somewhere strictly inside the clip (not a boundary) before adding — via
  // the *ruler*, at the clip's own x position (clicking the clip body itself would
  // start a move-the-clip gesture instead of scrubbing the playhead).
  const xBox = await xBody.boundingBox();
  const timelineRulerBox = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(xBox.x + xBox.width * 0.4, timelineRulerBox.y + timelineRulerBox.height / 2);
  await page.waitForTimeout(60);

  const xRow = xBody.locator('xpath=..');
  const kfCountBefore = await xRow.locator('[data-testid^="kf-head-"]').count();
  await xAddBtn.click();
  await page.waitForTimeout(80);
  const kfCountAfterAdd = await xRow.locator('[data-testid^="kf-head-"]').count();
  assert(kfCountAfterAdd === kfCountBefore + 1, 'tracks: "+" on the x row adds a real keyframe to the x track specifically');
  assert(!(await page.getByRole('button', { name: 'تراجع' }).isDisabled()), 'tracks: adding a per-property keyframe is undoable');

  const addedKf = xRow.locator('[data-testid^="kf-head-"]').last();
  await addedKf.click();
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid="kf-popover"]').count()) === 1, 'tracks: selecting a property keyframe opens the same value/easing popover');

  // Set a real, non-default value via the slider.
  const slider = page.locator('[data-testid="kf-value-slider"]');
  await slider.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '40');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(80);

  // Per-segment easing: switch this keyframe's own easing and confirm the easing
  // button reflects the change (independent of the clip's global easeOut).
  await page.locator('[data-testid="kf-easing-linear"]').click();
  await page.waitForTimeout(60);
  const linearBg = await page.locator('[data-testid="kf-easing-linear"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  const easeOutBg = await page.locator('[data-testid="kf-easing-easeOut"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  assert(linearBg !== easeOutBg, 'tracks: per-keyframe easing picker highlights the active choice distinctly from the others');

  // Drag it to move its time, exactly like the legacy opacity-row diamond.
  await addedKf.scrollIntoViewIfNeeded();
  const beforeDrag = await addedKf.boundingBox();
  await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + beforeDrag.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeDrag.x + 16, beforeDrag.y + beforeDrag.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const afterDrag = await addedKf.boundingBox();
  assert(Math.abs(afterDrag.x - beforeDrag.x) > 3, 'tracks: dragging a property keyframe moves it along its own track');

  await page.locator('[data-testid="kf-delete"]').click();
  await page.waitForTimeout(80);
  const kfCountAfterDelete = await xRow.locator('[data-testid^="kf-head-"]').count();
  assert(kfCountAfterDelete === kfCountBefore, 'tracks: deleting a property keyframe removes only that one, back to the original count');

  // One undo per gesture: the add+edits+drag+delete above were 4 distinct gestures
  // (add, slider change, easing change, drag) plus the delete — undo thrice should
  // land back at "one keyframe added, not yet deleted" rather than skipping gestures.
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(60);
  const afterOneUndo = await xRow.locator('[data-testid^="kf-head-"]').count();
  assert(afterOneUndo === kfCountAfterAdd, 'tracks: undo after delete restores exactly the deleted keyframe (single-gesture undo)');

  // --- 3. Properties-panel keyframe toggle ---------------------------------------
  const opacityToggle = page.locator('[data-testid="kf-toggle-head-opacity"]');
  assert((await opacityToggle.count()) === 1, 'props panel: a keyframe toggle exists next to the animatable properties');

  // --- 4. Persistence across reload ----------------------------------------------
  await page.waitForTimeout(900); // let the 700ms debounced autosave flush
  await page.reload();
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-testid="artboard"]');
  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(150);
  await page.locator('[data-layer-id="head"] button', { hasText: 'العنوان' }).click();
  await page.waitForTimeout(100);
  await page.locator('[data-testid="expand-head"]').click();
  await page.waitForTimeout(100);
  const xRowAfterReload = page.locator('[data-testid="clip-head-x"]').locator('xpath=..');
  const kfAfterReload = await xRowAfterReload.locator('[data-testid^="kf-head-"]').count();
  assert(kfAfterReload === afterOneUndo, `persist: the x track's keyframe survives a real reload (autosave round-trip) — ${kfAfterReload} vs expected ${afterOneUndo}`);

  // --- 5. Backward compatibility: a document saved under the pre-tracks model ---
  const legacyDoc = {
    elements: [
      {
        id: 'legacy-head',
        type: 'text',
        visible: true,
        locked: false,
        opacity: 100,
        geo: { x: 0.1, y: 0.1, w: 0.5, h: 0.2, rotation: 0 },
        text: 'قديم',
        fontFamily: 'Alexandria',
        fontSize: 48,
        weight: 'bold',
        color: null,
        halign: 'start',
        valign: 'top',
        // Pre-tracks shape: no `tracks` field at all, exactly what older saved
        // documents on disk look like.
        anim: {
          preset: 'slide',
          start: 0,
          duration: 1,
          easing: 'linear',
          bezier: [0, 0, 1, 1],
          keyframes: [
            { id: 'k0', t: 0, v: 0 },
            { id: 'k1', t: 1, v: 1 },
          ],
        },
      },
    ],
    anim: 'none',
    sizeIdx: 0,
    customW: 1080,
    customH: 1080,
  };
  await page.evaluate((doc) => window.localStorage.setItem('mazij.autosave.v1', JSON.stringify(doc)), legacyDoc);
  await page.reload();
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-el-id="legacy-head"]');

  // Scrub to t=0 explicitly (the app's initial playhead is mid-timeline, not 0) —
  // a 'slide' clip's legacy keyframes (v: 0 -> 1, linear) must still resolve to
  // opacity 0 there, exactly what the pre-tracks formula produced, proving the
  // migration is lossless.
  const rulerPre = page.locator('[data-testid="timeline-ruler"]');
  const rbPre = await rulerPre.boundingBox();
  await page.mouse.click(rbPre.x + 1, rbPre.y + rbPre.height / 2);
  await page.waitForTimeout(80);
  const legacyAtStart = await page.locator('[data-el-id="legacy-head"]').evaluate((el) => ({ opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform }));
  assert(Number(legacyAtStart.opacity) < 0.05, `back-compat: a pre-tracks document still renders opacity 0 at t=0 (got ${legacyAtStart.opacity})`);

  // Scrub to the clip's end and confirm it settles fully opaque with no residual
  // offset — same end-state the old single-progress-curve formula produced.
  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(150);
  const ruler = page.locator('[data-testid="timeline-ruler"]');
  const rb = await ruler.boundingBox();
  await page.mouse.click(rb.x + rb.width - 2, rb.y + rb.height / 2);
  await page.waitForTimeout(80);
  const legacyAtEnd = await page.locator('[data-el-id="legacy-head"]').evaluate((el) => Number(getComputedStyle(el).opacity));
  assert(legacyAtEnd > 0.95, `back-compat: the migrated document still settles to opacity ~1 by the clip's end (got ${legacyAtEnd})`);

  // And the migration produced *real* usable tracks, not a frozen/dead UI: the
  // layer can be expanded and a brand-new keyframe added on a property the old
  // format never had (x), proving `tracks` was genuinely synthesized, not skipped.
  await page.locator('[data-el-id="legacy-head"]').click();
  await page.waitForTimeout(80);
  await page.locator('[data-testid="expand-legacy-head"]').scrollIntoViewIfNeeded();
  await page.locator('[data-testid="expand-legacy-head"]').click();
  await page.waitForTimeout(80);
  const legacyXAdd = page.locator('[data-testid="clip-legacy-head-add-kf-x"]');
  assert((await legacyXAdd.count()) === 1, 'back-compat: a migrated document exposes the same real per-property editing as a document created fresh under the new model');
  await legacyXAdd.scrollIntoViewIfNeeded();
  await legacyXAdd.click();
  await page.waitForTimeout(80);
  const legacyXRow = page.locator('[data-testid="clip-legacy-head-x"]').locator('xpath=..');
  assert((await legacyXRow.locator('[data-testid^="kf-legacy-head-"]').count()) === 1, 'back-compat: adding a keyframe on the migrated document is a real, working edit');

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
