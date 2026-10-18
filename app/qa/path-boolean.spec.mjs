#!/usr/bin/env node
// Covers roadmap item #10: boolean path operations (union/subtract/intersect/exclude)
// on selected shapes/paths — see docs/CONTROLS.md "العمليات البوليانية" and
// src/lib/pathBoolean.ts. Strategy under test: flatten every input shape to a
// polyline (curves sampled at a fixed tolerance), run the result through
// `polybooljs` (pure-JS Martinez-Rueda-style polygon clipping), then store the
// output as a single new path element with one `subpaths` region per disjoint piece
// or hole.
//
// Scope:
// (1) the pure function `computeBooleanOp` — real module, no reimplementation —
//     checked against exact expected areas/bounding boxes for two offset-overlapping
//     rects (union/subtract/intersect/exclude all produce a single hole-free region
//     for this configuration, so area is unambiguous via the shoelace formula),
//     rotation handled correctly (a square unioned with itself rotated 90° must stay
//     exactly that square), a *smoothed* pen path changing the flattened area
//     (proving roadmap #11 smoothing feeds into roadmap #10's flattening step), and
//     `isBooleanEligible` rejecting open paths;
// (2) the real production renderers (`renderArtboardPng`/`renderArtboardSvg`, not a
//     reimplementation) on a multi-region (donut/hole) result: PNG pixels inside the
//     hole are transparent while the ring is filled, and the SVG output carries
//     `fill-rule="evenodd"`;
// (3) the real UI: drawing two overlapping rectangles, selecting both, clicking the
//     real "union" button replaces them with one path element, undoable as one step;
// (4) a real reload (autosave round-trip) keeps the boolean-op result.
//
// Run: node qa/path-boolean.spec.mjs   (dev server must be running on :1431)
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

// --- 1. Pure function, real module, no reimplementation ------------------------
async function testPureFunctions(page) {
  const r = await page.evaluate(async () => {
    const mod = await import('/src/lib/pathBoolean.ts');
    const geo = (x, y, w, h, rotation = 0) => ({ x, y, w, h, rotation });
    const rect = (id, g) => ({
      id,
      type: 'shape',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      anim: {},
      geo: g,
      shape: 'rect',
      fill: null,
      fillToken: 'ac',
      stroke: null,
      strokeWidth: 0,
      radius: 0,
    });

    // Shoelace area of a simple (non-self-intersecting) polygon — every case below
    // is constructed to produce exactly one hole-free region, so this is unambiguous.
    function area(points) {
      let a = 0;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const q = points[(i + 1) % points.length];
        a += p.x * q.y - q.x * p.y;
      }
      return Math.abs(a) / 2;
    }

    const size = { w: 1000, h: 1000 };
    // A = [0,600]x[0,600], B = [300,900]x[300,900] (fraction-of-1000 geometry) —
    // offset diagonal overlap, overlap = [300,600]x[300,600] = 90000px^2.
    const A = rect('a', geo(0, 0, 0.6, 0.6));
    const B = rect('b', geo(0.3, 0.3, 0.6, 0.6));

    const union = mod.computeBooleanOp('union', [A, B], size);
    const intersect = mod.computeBooleanOp('intersect', [A, B], size);
    const subtract = mod.computeBooleanOp('subtract', [A, B], size);
    const exclude = mod.computeBooleanOp('exclude', [A, B], size);

    const areaOf = (res) => res.subpaths.reduce((sum, sp) => sum + area(sp.points.map((p) => ({ x: p.x * res.geo.w, y: p.y * res.geo.h }))), 0);

    // Rotation correctness: a square unioned with itself rotated 90 deg about its
    // own center must still be exactly that same square (a square maps onto itself
    // under a 90 deg rotation around its center) — wrong rotation math would instead
    // report a bigger/offset bounding box.
    const square = rect('sq', geo(0.2, 0.2, 0.3, 0.3, 0));
    const square90 = rect('sq90', geo(0.2, 0.2, 0.3, 0.3, 90));
    const rotUnion = mod.computeBooleanOp('union', [square, square90], size);

    // Smoothing feeds into flattening: the same 4 anchor points, once as a plain
    // straight-edge closed path, once with roadmap #11 smoothing cranked to max —
    // the smoothed version bows outward/inward so its flattened area must differ.
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const straightPath = { ...rect('p1', geo(0.05, 0.05, 0.2, 0.2)), shape: 'path', points: pts, closed: true, smoothAmount: 0 };
    const smoothPath = { ...rect('p2', geo(0.05, 0.05, 0.2, 0.2)), shape: 'path', points: pts, closed: true, smoothAmount: 1 };
    // Union each against a disjoint tiny rect just so computeBooleanOp (which needs
    // >= 2 shapes) runs — the tiny rect doesn't overlap either path.
    const farAway = rect('far', geo(0.9, 0.9, 0.02, 0.02));
    const straightResult = mod.computeBooleanOp('union', [straightPath, farAway], size);
    const smoothResult = mod.computeBooleanOp('union', [smoothPath, farAway], size);
    const straightArea = areaOf(straightResult);
    const smoothArea = areaOf(smoothResult);

    const openPath = { ...rect('open', geo(0.1, 0.1, 0.2, 0.2)), shape: 'path', points: pts, closed: false };
    const closedPath = { ...rect('closed', geo(0.1, 0.1, 0.2, 0.2)), shape: 'path', points: pts, closed: true };
    const ellipseEl = rect('ell', geo(0.1, 0.1, 0.2, 0.2));
    ellipseEl.shape = 'ellipse';

    return {
      unionArea: areaOf(union),
      unionGeo: union.geo,
      intersectArea: areaOf(intersect),
      intersectGeo: intersect.geo,
      subtractArea: areaOf(subtract),
      subtractGeo: subtract.geo,
      excludeArea: areaOf(exclude),
      excludeGeo: exclude.geo,
      excludeRegionCount: exclude.subpaths.length,
      rotUnionArea: areaOf(rotUnion),
      rotUnionGeo: rotUnion.geo,
      straightArea,
      smoothArea,
      eligOpen: mod.isBooleanEligible(openPath),
      eligClosed: mod.isBooleanEligible(closedPath),
      eligEllipse: mod.isBooleanEligible(ellipseEl),
      noResultForSingleShape: mod.computeBooleanOp('union', [A], size),
    };
  });

  assert(Math.abs(r.unionArea - 630000) < 50, `union: area matches areaA+areaB-overlap exactly (expected 630000, got ${r.unionArea})`);
  assert(Math.abs(r.unionGeo.w - 900) < 1 && Math.abs(r.unionGeo.h - 900) < 1, `union: bounding box spans both rects (expected 900x900, got ${r.unionGeo.w}x${r.unionGeo.h})`);

  assert(Math.abs(r.intersectArea - 90000) < 50, `intersect: area matches the exact overlap (expected 90000, got ${r.intersectArea})`);
  assert(Math.abs(r.intersectGeo.w - 300) < 1 && Math.abs(r.intersectGeo.h - 300) < 1, `intersect: bounding box is exactly the overlap square (expected 300x300, got ${r.intersectGeo.w}x${r.intersectGeo.h})`);

  assert(Math.abs(r.subtractArea - 270000) < 50, `subtract: bottom shape minus the overlap (expected 270000, got ${r.subtractArea})`);
  assert(Math.abs(r.subtractGeo.w - 600) < 1 && Math.abs(r.subtractGeo.h - 600) < 1, `subtract: bounding box stays the bottom rect's own extent (expected 600x600, got ${r.subtractGeo.w}x${r.subtractGeo.h})`);

  // xor = (A \ B) + (B \ A) = areaA + areaB - 2*overlap = 360000 + 360000 - 180000.
  assert(Math.abs(r.excludeArea - 540000) < 50, `exclude (xor): area is areaA+areaB-2x the overlap, i.e. union minus the shared overlap (expected 540000, got ${r.excludeArea})`);
  assert(Math.abs(r.excludeGeo.w - 900) < 1 && Math.abs(r.excludeGeo.h - 900) < 1, `exclude: same outer bounding box as union but a different area, proving it is not just reusing union's result (${r.excludeGeo.w}x${r.excludeGeo.h})`);
  // The two leftover L-shapes (A\B and B\A) only touch at a single corner point for
  // this diagonal offset, not along a shared edge — polybooljs reports that as two
  // separate regions, which is the geometrically correct answer here.
  assert(r.excludeRegionCount === 2, `exclude: A\\B and B\\A only meet at a corner point for this diagonal overlap, so they come back as 2 separate regions (got ${r.excludeRegionCount})`);

  assert(Math.abs(r.rotUnionArea - 90000) < 50, `rotation: a square unioned with itself rotated 90deg about its own center has no extra area (expected 90000, got ${r.rotUnionArea})`);
  assert(Math.abs(r.rotUnionGeo.w - 300) < 1 && Math.abs(r.rotUnionGeo.h - 300) < 1, `rotation: bounding box is unchanged by the self-rotation (expected 300x300, got ${r.rotUnionGeo.w}x${r.rotUnionGeo.h})`);

  assert(Math.abs(r.straightArea - r.smoothArea) > 1, `smoothing integration: a smoothed closed pen path flattens to a different area than its straight-edge version before being unioned (${r.straightArea} vs ${r.smoothArea})`);

  assert(r.eligOpen === false, 'eligibility: an open pen path is rejected (no defined interior)');
  assert(r.eligClosed === true, 'eligibility: a closed pen path with >= 3 points is accepted');
  assert(r.eligEllipse === true, 'eligibility: an ellipse is always accepted');
  assert(r.noResultForSingleShape === null, 'computeBooleanOp returns null (not a crash, not a 1-shape no-op element) when fewer than 2 valid shapes are given');
}

// --- 2. Real production renderers on a multi-region (hole) result --------------
async function testExportReuse(page) {
  const r = await page.evaluate(async () => {
    const boolMod = await import('/src/lib/pathBoolean.ts');
    const exportMod = await import('/src/lib/exportArtboard.ts');
    const geo = (x, y, w, h) => ({ x, y, w, h, rotation: 0 });
    const shapeBase = (id, g) => ({ id, type: 'shape', visible: true, locked: false, opacity: 100, maskId: null, anim: {}, geo: g, shape: 'rect', fill: '#ff0000', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0 });

    const size = { w: 400, h: 400, id: 'sq', ar: '', en: '' };
    const palette = { bg: '#000000', fg: '#ffffff', ac: '#ff0000' };
    // Outer ring [40,360]x[40,360], inner hole fully inside it [140,260]x[140,260].
    const outer = shapeBase('outer', geo(0.1, 0.1, 0.8, 0.8));
    const inner = shapeBase('inner', geo(0.35, 0.35, 0.3, 0.3));
    const donut = boolMod.computeBooleanOp('subtract', [outer, inner], size);

    const el = {
      id: 'donut',
      type: 'shape',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      anim: { preset: 'none', start: 0, duration: 0.6, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
      geo: { x: donut.geo.x / size.w, y: donut.geo.y / size.h, w: donut.geo.w / size.w, h: donut.geo.h / size.h, rotation: 0 },
      shape: 'path',
      fill: '#ff0000',
      fillToken: 'ac',
      stroke: null,
      strokeWidth: 0,
      radius: 0,
      subpaths: donut.subpaths,
      closed: true,
    };

    const blob = await exportMod.renderArtboardPng({ size, palette, elements: [el], transparent: true, lang: 'ar', time: 0, scale: 1 });
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(size.w, size.h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const centerPx = Math.round(size.w / 2);
    const holePixel = ctx.getImageData(centerPx, centerPx, 1, 1).data;
    // A point inside the ring but outside the hole: halfway between the hole's edge
    // and the outer edge, straight up from center.
    const ringPx = Math.round(size.h * 0.2);
    const ringPixel = ctx.getImageData(centerPx, ringPx, 1, 1).data;

    const svgBlob = exportMod.renderArtboardSvg({ size, palette, elements: [el], transparent: true, lang: 'ar' });
    const svgText = await svgBlob.text();

    return {
      regionCount: donut.subpaths.length,
      holeAlpha: holePixel[3],
      ringAlpha: ringPixel[3],
      ringIsRed: ringPixel[0] > 200 && ringPixel[1] < 60,
      svgHasEvenOdd: svgText.includes('fill-rule="evenodd"'),
      svgHasPath: svgText.includes('<path'),
    };
  });

  assert(r.regionCount === 2, `subtract (hole): a fully-contained inner rect produces exactly 2 subpaths (outer boundary + hole), got ${r.regionCount}`);
  assert(r.holeAlpha < 20, `PNG export: the real renderArtboardPng leaves the donut's hole transparent (alpha=${r.holeAlpha})`);
  assert(r.ringAlpha > 200 && r.ringIsRed, `PNG export: the real renderArtboardPng fills the ring with the shape's color (alpha=${r.ringAlpha})`);
  assert(r.svgHasPath && r.svgHasEvenOdd, 'SVG export: the real renderArtboardSvg emits a <path> with fill-rule="evenodd" so the hole renders correctly in any SVG viewer');
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await bootDemo(page, BASE_URL);

  await testPureFunctions(page);
  await testExportReuse(page);

  // --- 3. Real UI: draw two overlapping rects, union them, undo -----------------
  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(80);
  await page.locator('button', { hasText: 'أشكال' }).click();
  await page.waitForTimeout(80);

  const abBox = await page.locator('[data-testid="artboard"]').boundingBox();
  // A thin strip across the very top of the artboard (y below 0.09) is clear of
  // every default element — badge/head/discount/image/logo all start at y >= 0.09
  // (see createDefaultElements) — so a pointerdown there always starts a fresh
  // shape-draw instead of grabbing an existing element.
  const draw = async (x0, y0, x1, y1) => {
    await page.mouse.move(abBox.x + abBox.width * x0, abBox.y + abBox.height * y0);
    await page.mouse.down();
    await page.mouse.move(abBox.x + abBox.width * x1, abBox.y + abBox.height * y1, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(100);
  };

  const idsBefore0 = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  await draw(0.3, 0.01, 0.55, 0.075);
  await page.locator('button', { hasText: 'أشكال' }).click(); // re-arm the shape tool for a second draw
  await page.waitForTimeout(80);
  // Start the second drag from a corner clear of the first rect (a pointerdown that
  // lands *on* the first shape would start a move-drag instead of a new shape-draw)
  // and drag into it so the two boxes overlap — but keep each box's own *center*
  // outside the other box, so a later click on either element's bounding-box center
  // unambiguously hits that element and not the one stacked underneath it.
  await draw(0.75, 0.01, 0.45, 0.07);
  const idsAfter = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  const newIds = idsAfter.filter((id) => !idsBefore0.includes(id));
  assert(newIds.length === 2, `setup: drawing two overlapping rectangles created two new shape elements (got ${newIds.length})`);

  await page.locator('button', { hasText: 'تحديد' }).click(); // select tool
  await page.waitForTimeout(80);
  await page.locator(`[data-el-id="${newIds[0]}"]`).click({ force: true });
  await page.locator(`[data-el-id="${newIds[1]}"]`).click({ force: true, modifiers: ['Shift'] });
  await page.waitForTimeout(80);

  assert((await page.locator('[data-testid="bool-union"]').count()) === 1, 'UI: selecting two shapes shows the real union/subtract/intersect/exclude buttons');
  const sectionDisabled = await page.locator('[data-testid="bool-union"]').evaluate((btn) => btn.closest('[aria-disabled]')?.getAttribute('aria-disabled'));
  assert(sectionDisabled !== 'true', 'UI: two closed rects are eligible, so the boolean section is not disabled');

  const countBeforeUnion = (await page.locator('[data-el-id]').count());
  await page.locator('[data-testid="bool-union"]').click();
  await page.waitForTimeout(100);
  const countAfterUnion = await page.locator('[data-el-id]').count();
  assert(countAfterUnion === countBeforeUnion - 1, `UI union: two input shapes become exactly one new element (before=${countBeforeUnion}, after=${countAfterUnion})`);
  assert((await page.locator(`[data-el-id="${newIds[0]}"]`).count()) === 0 && (await page.locator(`[data-el-id="${newIds[1]}"]`).count()) === 0, 'UI union: both original shapes are gone, replaced (not kept alongside the result)');
  const resultId = (await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')))).find((id) => !idsBefore0.includes(id) && !newIds.includes(id));
  assert(Boolean(resultId), 'UI union: a brand-new element id was created for the boolean result (not reusing one input\'s id)');
  const resultPathD = await page.locator(`[data-el-id="${resultId}"] path`).getAttribute('d');
  assert(Boolean(resultPathD) && resultPathD.includes('L') && !resultPathD.includes('C'), `UI union: the result renders as a real straight-edged <path> (flattened geometry, no spurious curve commands): ${resultPathD?.slice(0, 60)}`);

  const undoBtn = page.getByTitle('تراجع');
  await undoBtn.click();
  await page.waitForTimeout(100);
  assert((await page.locator('[data-el-id]').count()) === countBeforeUnion, 'UI union: a single undo fully restores both original shapes (one undo step, not two)');
  assert((await page.locator(`[data-el-id="${newIds[0]}"]`).count()) === 1 && (await page.locator(`[data-el-id="${newIds[1]}"]`).count()) === 1, 'UI union: undo brings back the exact original element ids');

  // Redo the union for the reload check below.
  await page.locator(`[data-el-id="${newIds[0]}"]`).click({ force: true });
  await page.locator(`[data-el-id="${newIds[1]}"]`).click({ force: true, modifiers: ['Shift'] });
  await page.waitForTimeout(80);
  await page.locator('[data-testid="bool-union"]').click();
  await page.waitForTimeout(100);
  const finalId = (await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')))).find((id) => !idsBefore0.includes(id));

  // --- 4. Survives a real reload (autosave round-trip) ---------------------------
  await page.waitForTimeout(800); // past the 700ms autosave debounce
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-testid="artboard"]');
  assert((await page.locator(`[data-el-id="${finalId}"]`).count()) === 1, 'reload: the boolean-op result element survives a real page reload (autosave round-trip)');
  const reloadedD = await page.locator(`[data-el-id="${finalId}"] path`).getAttribute('d');
  assert(Boolean(reloadedD) && reloadedD.length > 10, 'reload: the result path still has real geometry after reload, not an empty/default path');

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
