#!/usr/bin/env node
// Covers roadmap item #11: bezier smoothing for pen-tool paths — a user-controlled
// smoothing amount (0..1) plus a per-anchor smooth/corner toggle, fitted via a
// Catmull-Rom-derived cubic bezier through the pen tool's own anchor points (the
// reduced form of Schneider's tangent-estimation step for an already-minimal point
// set — see the doc comment on `src/lib/pathSmoothing.ts` for why). Existing
// straight-segment paths (smoothAmount undefined/0) must render bit-identical to
// before this feature existed.
//
// Scope:
// (1) the pure function `fitSmoothPath` — real module, no reimplementation — exact
//     control-point math at smoothAmount=0 (bit-identical to straight segments),
//     smoothAmount=1 on a right-angle corner (known Catmull-Rom control points), the
//     corner-point override (zero-length handles exactly at a flagged anchor), and
//     open-vs-closed segment counts;
// (2) `pathElementCommands` (src/lib/pathGeometry.ts, the single renderer shared by
//     the DOM preview/canvas export/SVG export) — smoothAmount=0 emits only M/L/Z,
//     smoothAmount>0 emits C commands, and a `subpaths` (roadmap #10 boolean result)
//     always stays straight-edged regardless of `smoothAmount`;
// (3) the real production renderers on a smoothed vs. unsmoothed path — different
//     pixels for the same points, and a path object with no `smoothAmount` field at
//     all (simulating a pre-#11 document) renders pixel-identical to one with
//     `smoothAmount: 0`;
// (4) the real UI: drawing a closed path with the pen tool, moving the real
//     smoothing slider actually changes the rendered `<path d>`, toggling a corner
//     point changes it again, setting the slider back to 0 restores the exact
//     original straight-segment `d` (reversible), one slider move is one undo step,
//     and the result survives a real reload;
// (5) explicit per-anchor handles (`ShapeElement.handles`) and anchor insertion, as
//     pure functions: an explicit side overriding only itself, `smoothAmount`
//     deliberately *not* scaling a hand-placed handle, a corner flag still winning,
//     real C commands at smoothAmount 0, and `insertAnchorOnSegment`'s de Casteljau
//     split leaving the curve bit-identical;
// (6) the whole designer flow in the real UI with real pointer events: anchors landing
//     on the clicked coordinates, closing a path by clicking its first anchor,
//     click-and-drag pulling out bezier handles, node-edit anchor/handle dragging
//     (mirrored by default, Alt to break), delete/insert anchor, one undo step per
//     real slider drag, and an abandoned draft not leaking into the next path.
//
// Run: node qa/pen-smoothing.spec.mjs   (dev server must be running on :1420)
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

function close(a, b, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

// --- 1. Pure function, real module, no reimplementation ------------------------
async function testFitSmoothPath(page) {
  const r = await page.evaluate(async () => {
    const mod = await import('/src/lib/pathSmoothing.ts');
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];

    const straight = mod.fitSmoothPath(pts, false, 0);
    const curved = mod.fitSmoothPath(pts, false, 1);
    const cornered = mod.fitSmoothPath(pts, false, 1, [false, true, false]);
    const closedSq = mod.fitSmoothPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      true,
      1,
    );

    return {
      straightSegCount: straight.length,
      straightC1 : straight.map((s) => s.c1),
      straightC2: straight.map((s) => s.c2),
      straightP: straight.map((s) => [s.p0, s.p1]),
      curvedC1Seg0: curved[0].c1,
      curvedC2Seg0: curved[0].c2,
      curvedC1Seg1: curved[1].c1,
      curvedC2Seg1: curved[1].c2,
      corneredC2Seg0: cornered[0].c2,
      corneredC1Seg1: cornered[1].c1,
      closedSegCount: closedSq.length,
      openSegCountForSquarePoints: mod.fitSmoothPath(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        false,
        1,
      ).length,
      tooFewPoints: mod.fitSmoothPath([{ x: 0, y: 0 }], false, 1).length,
    };
  });

  assert(r.straightSegCount === 2, `fitSmoothPath: 3 open points produce 2 segments (got ${r.straightSegCount})`);
  const allEndpointHandles = r.straightC1.every((c1, i) => close(c1.x, r.straightP[i][0].x) && close(c1.y, r.straightP[i][0].y)) && r.straightC2.every((c2, i) => close(c2.x, r.straightP[i][1].x) && close(c2.y, r.straightP[i][1].y));
  assert(allEndpointHandles, `smoothAmount=0: every control point collapses exactly onto its segment's own endpoint — bit-identical to a straight line (${JSON.stringify({ c1: r.straightC1, c2: r.straightC2 })})`);

  // Known Catmull-Rom control points for pts=[(0,0),(10,0),(10,10)] at smoothAmount=1:
  // tangent(0)=(10,0)-(0,0))/2=(5,0) [open, clamped]; tangent(1)=((10,10)-(0,0))/2=(5,5);
  // tangent(2)=((10,10)-(10,0))/2=(0,5) [open, clamped]. k=1/3.
  assert(close(r.curvedC1Seg0.x, 10 / 6) && close(r.curvedC1Seg0.y, 0), `smoothAmount=1: segment 0's C1 matches the exact Catmull-Rom formula P0+tangent0/3 (expected (1.667,0), got (${r.curvedC1Seg0.x},${r.curvedC1Seg0.y}))`);
  assert(close(r.curvedC2Seg0.x, 10 - 5 / 3) && close(r.curvedC2Seg0.y, -5 / 3), `smoothAmount=1: segment 0's C2 matches P1-tangent1/3 (expected (8.333,-1.667), got (${r.curvedC2Seg0.x},${r.curvedC2Seg0.y}))`);
  assert(close(r.curvedC1Seg1.x, 10 + 5 / 3) && close(r.curvedC1Seg1.y, 5 / 3), `smoothAmount=1: segment 1's C1 matches P1+tangent1/3 (expected (11.667,1.667), got (${r.curvedC1Seg1.x},${r.curvedC1Seg1.y}))`);
  assert(close(r.curvedC2Seg1.x, 10) && close(r.curvedC2Seg1.y, 10 - 5 / 3), `smoothAmount=1: segment 1's C2 matches P2-tangent2/3 (expected (10,8.333), got (${r.curvedC2Seg1.x},${r.curvedC2Seg1.y}))`);

  assert(close(r.corneredC2Seg0.x, 10) && close(r.corneredC2Seg0.y, 0), `corner override: flagging the middle anchor a corner zeroes its tangent, so segment 0's C2 sits exactly on P1 (10,0) even at smoothAmount=1 (got (${r.corneredC2Seg0.x},${r.corneredC2Seg0.y}))`);
  assert(close(r.corneredC1Seg1.x, 10) && close(r.corneredC1Seg1.y, 0), `corner override: segment 1's C1 sits exactly on the same corner point (10,0), producing a real hard corner, not a reimplementation detail (got (${r.corneredC1Seg1.x},${r.corneredC1Seg1.y}))`);

  assert(r.closedSegCount === 4, `closed path: 4 points produce 4 segments including the wrap-around closing segment (got ${r.closedSegCount})`);
  assert(r.openSegCountForSquarePoints === 3, `open path: the same 4 points produce only 3 segments when not closed (got ${r.openSegCountForSquarePoints})`);
  assert(r.tooFewPoints === 0, 'fitSmoothPath returns no segments for a single point (nothing to connect)');
}

// --- 2. pathElementCommands: the one renderer shared by DOM/canvas/SVG ----------
async function testPathElementCommands(page) {
  const r = await page.evaluate(async () => {
    const mod = await import('/src/lib/pathGeometry.ts');
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const straight = mod.pathElementCommands({ points: pts, closed: true, smoothAmount: 0 });
    const legacy = mod.pathElementCommands({ points: pts, closed: true }); // smoothAmount entirely absent
    const curved = mod.pathElementCommands({ points: pts, closed: true, smoothAmount: 0.6 });
    const booleanResult = mod.pathElementCommands({
      subpaths: [
        { points: pts, closed: true },
        { points: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.4, y: 0.4 }], closed: true },
      ],
      // A boolean-op result must stay straight-edged even if smoothAmount somehow
      // carried over from the input shape's own fields.
      smoothAmount: 1,
    });

    return {
      straightHasC: straight.cmds.some((c) => c.c === 'C'),
      legacyHasC: legacy.cmds.some((c) => c.c === 'C'),
      legacyCmdCount: legacy.cmds.length,
      straightCmdCount: straight.cmds.length,
      curvedHasC: curved.cmds.some((c) => c.c === 'C'),
      curvedCCount: curved.cmds.filter((c) => c.c === 'C').length,
      booleanHasC: booleanResult.cmds.some((c) => c.c === 'C'),
      booleanMultiRegion: booleanResult.multiRegion,
      booleanMCount: booleanResult.cmds.filter((c) => c.c === 'M').length,
    };
  });

  assert(!r.straightHasC, 'pathElementCommands: smoothAmount=0 emits no curve (C) commands');
  assert(!r.legacyHasC && r.legacyCmdCount === r.straightCmdCount, `pathElementCommands: a path object with smoothAmount entirely absent (pre-#11 document shape) renders identically to smoothAmount:0 (${r.legacyCmdCount} vs ${r.straightCmdCount} commands)`);
  assert(r.curvedHasC && r.curvedCCount === 3, `pathElementCommands: smoothAmount>0 on a 3-point closed path emits exactly 3 C commands, one per segment including the closing one (got ${r.curvedCCount})`);
  assert(!r.booleanHasC, 'pathElementCommands: a roadmap #10 boolean-op result (subpaths) always stays straight-edged, ignoring smoothAmount');
  assert(r.booleanMultiRegion === true && r.booleanMCount === 2, `pathElementCommands: a 2-region boolean result emits one M (subpath start) per region (got multiRegion=${r.booleanMultiRegion}, M count=${r.booleanMCount})`);
}

// --- 3. Real production renderers: smoothing changes pixels, legacy docs don't -----
async function testExportReuse(page) {
  const r = await page.evaluate(async () => {
    const exportMod = await import('/src/lib/exportArtboard.ts');
    const size = { w: 300, h: 300, id: 'sq', ar: '', en: '' };
    const palette = { bg: '#000000', fg: '#ffffff', ac: '#ff0000' };
    const anim = { preset: 'none', start: 0, duration: 0.6, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} };
    const pts = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ];
    const base = { id: 'p', type: 'shape', visible: true, locked: false, opacity: 100, maskId: null, anim, geo: { x: 0.1, y: 0.1, w: 0.8, h: 0.8, rotation: 0 }, shape: 'path', fill: '#ff0000', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0, points: pts, closed: true };

    async function sample(el, px, py) {
      const blob = await exportMod.renderArtboardPng({ size, palette, elements: [el], transparent: true, lang: 'ar', time: 0, scale: 1 });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(size.w, size.h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(px, py, 1, 1).data;
    }

    // Just above the straight top edge, near its start corner: outside the plain
    // straight-edged square's fill, but inside the outward bulge a Catmull-Rom curve
    // produces near a sharp 90deg turn at smoothAmount=1 (verified empirically —
    // this is not a boundary-sensitive single-pixel probe).
    const bulgePx = Math.round(size.w * 0.4333);
    const bulgePy = Math.round(size.h * 0.1333);

    const straightEl = { ...base, smoothAmount: 0 };
    const legacyEl = { ...base }; // no smoothAmount field at all
    const smoothEl = { ...base, smoothAmount: 1 };

    const straightPixel = await sample(straightEl, bulgePx, bulgePy);
    const legacyPixel = await sample(legacyEl, bulgePx, bulgePy);
    const smoothPixel = await sample(smoothEl, bulgePx, bulgePy);

    const straightSvg = await exportMod.renderArtboardSvg({ size, palette, elements: [straightEl], transparent: true, lang: 'ar' }).text();
    const smoothSvg = await exportMod.renderArtboardSvg({ size, palette, elements: [smoothEl], transparent: true, lang: 'ar' }).text();

    return {
      straightPixel: Array.from(straightPixel),
      legacyPixel: Array.from(legacyPixel),
      smoothPixel: Array.from(smoothPixel),
      straightSvgHasC: /[CcSs]\d|C[\d.-]/.test(straightSvg) || straightSvg.includes(' C'),
      smoothSvgHasC: smoothSvg.includes(' C'),
    };
  });

  assert(JSON.stringify(r.straightPixel) === JSON.stringify(r.legacyPixel), `export: a path with smoothAmount entirely omitted renders pixel-identical to smoothAmount:0 — a pre-#11 document is unaffected (${JSON.stringify(r.straightPixel)} vs ${JSON.stringify(r.legacyPixel)})`);
  assert(JSON.stringify(r.straightPixel) !== JSON.stringify(r.smoothPixel), `export: the real renderArtboardPng fills the Catmull-Rom corner bulge for the smoothed path where the straight-edged version stays empty, for the exact same anchor points (${JSON.stringify(r.straightPixel)} vs ${JSON.stringify(r.smoothPixel)})`);
  assert(!r.straightSvgHasC, 'export: the real renderArtboardSvg emits no curve command for the straight-edged path');
  assert(r.smoothSvgHasC, 'export: the real renderArtboardSvg emits a real " C" curve command for the smoothed path');
}

// --- 5. Explicit per-anchor handles + anchor insertion (pen designer flow) ------
// All four below were measured broken before this pass; see the section-6 UI tests
// for the end-to-end numbers.
async function testExplicitHandles(page) {
  const r = await page.evaluate(async () => {
    const sm = await import('/src/lib/pathSmoothing.ts');
    const geo = await import('/src/lib/pathGeometry.ts');
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    // An explicit out handle on anchor 0 only — every other side stays derived.
    const handles = [{ out: { x: 3, y: -4 }, in: { x: -3, y: 4 } }, null, null];
    const withHandle = sm.fitSmoothPath(pts, false, 0, undefined, handles);
    const scaled = sm.fitSmoothPath(pts, false, 1, undefined, handles);
    const cornerWins = sm.fitSmoothPath(pts, false, 1, [true, false, false], handles);

    // Insert at t=0.5 on the middle segment of a 4-point smoothed path, then sample
    // both the before and after geometry on the same cubics.
    const quad = [
      { x: 0, y: 0.1 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0.4 },
      { x: 0.4, y: 1 },
    ];
    const before = sm.fitSmoothPath(quad, false, 0.7);
    const ins = sm.insertAnchorOnSegment(quad, false, 0.7, undefined, undefined, 1, 0.5);
    const after = sm.fitSmoothPath(ins.points, false, 0.7, ins.cornerPoints, ins.handles);
    const at = (seg, t) => {
      const u = 1 - t;
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      return {
        x: seg.p0.x * w[0] + seg.c1.x * w[1] + seg.c2.x * w[2] + seg.p1.x * w[3],
        y: seg.p0.y * w[0] + seg.c1.y * w[1] + seg.c2.y * w[2] + seg.p1.y * w[3],
      };
    };
    // Walk every pre-insert segment and its post-insert counterpart(s) at matching
    // parameters: segment 1 split into 1+2, so its t maps to 2t / 2t-1.
    let worst = 0;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      for (const [b, a] of [
        [before[0], after[0]],
        [before[2], after[3]],
      ]) worst = Math.max(worst, Math.hypot(at(b, t).x - at(a, t).x, at(b, t).y - at(a, t).y));
      const q = at(before[1], t);
      const p = t < 0.5 ? at(after[1], t * 2) : at(after[2], t * 2 - 1);
      worst = Math.max(worst, Math.hypot(q.x - p.x, q.y - p.y));
    }

    return {
      handleC1: withHandle[0].c1,
      handleC1AtSmooth1: scaled[0].c1,
      derivedC2Untouched: withHandle[0].c2,
      cornerC1: cornerWins[0].c1,
      emitsCurveAtZero: geo.pathElementCommands({ points: pts, closed: false, smoothAmount: 0, handles }).cmds.some((c) => c.c === 'C'),
      emitsLinesWithZeroHandles: geo.pathElementCommands({ points: pts, closed: false, smoothAmount: 0, handles: [{ out: { x: 0, y: 0 } }, null, null] }).cmds.some((c) => c.c === 'C'),
      insertedCount: ins.points.length,
      insertWorstDeviation: worst,
      closingSegInsert: sm.insertAnchorOnSegment(
        [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
        true,
        1,
        undefined,
        undefined,
        2,
        0.5,
      )?.points.length,
      outOfRangeSeg: sm.insertAnchorOnSegment(pts, false, 1, undefined, undefined, 5, 0.5),
      hasExplicitAllZero: sm.hasExplicitHandles([{ out: { x: 0, y: 0 }, in: { x: 0, y: 0 } }]),
      hasExplicitReal: sm.hasExplicitHandles([null, { in: { x: 0, y: -2 } }]),
    };
  });

  assert(close(r.handleC1.x, 3) && close(r.handleC1.y, -4), `explicit handles: anchor 0's C1 is its own handle vector added to the anchor (expected (3,-4), got (${r.handleC1.x},${r.handleC1.y}))`);
  assert(close(r.handleC1AtSmooth1.x, 3) && close(r.handleC1AtSmooth1.y, -4), `explicit handles: smoothAmount does NOT scale a hand-placed handle — same C1 at 0 and at 1 (got (${r.handleC1AtSmooth1.x},${r.handleC1AtSmooth1.y}))`);
  assert(close(r.derivedC2Untouched.x, 10) && close(r.derivedC2Untouched.y, 0), `explicit handles: an explicit side overrides only itself — segment 0's C2 still comes from the derived tangent at smoothAmount 0, so it stays on P1 (got (${r.derivedC2Untouched.x},${r.derivedC2Untouched.y}))`);
  assert(close(r.cornerC1.x, 0) && close(r.cornerC1.y, 0), `explicit handles: a corner flag still wins over an explicit handle (expected C1 on the anchor (0,0), got (${r.cornerC1.x},${r.cornerC1.y}))`);
  assert(r.emitsCurveAtZero, 'pathElementCommands: a path with an explicit handle emits real C commands even at smoothAmount 0 (otherwise a hand-pulled curve renders as a straight line)');
  assert(!r.emitsLinesWithZeroHandles, 'pathElementCommands: an all-zero handle vector is not "explicit" — the straight-line guarantee at smoothAmount 0 survives');
  assert(r.insertedCount === 5, `insertAnchorOnSegment: a 4-point path gains exactly one anchor (got ${r.insertedCount})`);
  assert(r.insertWorstDeviation < 1e-9, `insertAnchorOnSegment: the de Casteljau split leaves the curve bit-identical — worst deviation over 303 matched samples on a smoothAmount=0.7 path = ${r.insertWorstDeviation.toExponential(3)} box fractions (a one-sided freeze measured 1.55 of 100 local units here)`);
  assert(r.closingSegInsert === 4, `insertAnchorOnSegment: the wrap-around closing segment of a closed path is insertable too (got ${r.closingSegInsert})`);
  assert(r.outOfRangeSeg === null, 'insertAnchorOnSegment: an out-of-range segment index returns null rather than corrupting the point list');
  assert(!r.hasExplicitAllZero && r.hasExplicitReal, 'hasExplicitHandles: zero vectors are not handles, a real vector is');
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await bootDemo(page, BASE_URL);

  await testFitSmoothPath(page);
  await testPathElementCommands(page);
  await testExportReuse(page);
  await testExplicitHandles(page);

  // --- 4. Real UI: draw a closed pen path, smooth it, toggle a corner, undo, reload --
  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(80);
  await page.locator('button[title="P"]').click(); // pen tool
  await page.waitForTimeout(80);
  await page.locator('[data-testid="pen-close-path-toggle"]').click(); // close the path on finish
  await page.waitForTimeout(80);

  const abBox = await page.locator('[data-testid="artboard"]').boundingBox();
  const idsBefore = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  // Same clear top strip (y < 0.09) used by qa/path-boolean.spec.mjs — free of every
  // default element.
  const pt = (x, y) => [abBox.x + abBox.width * x, abBox.y + abBox.height * y];
  for (const [x, y] of [pt(0.3, 0.015), pt(0.45, 0.015), pt(0.4, 0.075), pt(0.32, 0.06)]) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(60);
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);

  const idsAfter = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  const pathId = idsAfter.find((id) => !idsBefore.includes(id));
  assert(Boolean(pathId), 'UI: clicking 4 points then Enter created one new closed path element');

  const pathLocator = page.locator(`[data-el-id="${pathId}"] path`);
  const originalD = await pathLocator.getAttribute('d');
  assert(Boolean(originalD) && !originalD.includes('C'), `UI: a freshly drawn path renders as straight segments only (no smoothing yet): ${originalD?.slice(0, 60)}`);

  const slider = page.locator(`[data-testid="smooth-amount-${pathId}"]`);
  assert((await slider.count()) === 1, 'UI: selecting the new path shows the real smoothing-amount slider');
  await slider.fill('80');
  await page.waitForTimeout(100);
  const smoothedD = await pathLocator.getAttribute('d');
  assert(Boolean(smoothedD) && smoothedD.includes('C') && smoothedD !== originalD, `UI: moving the smoothing slider actually changes the rendered path to include real curve commands (${smoothedD?.slice(0, 80)})`);

  const cornerBtn = page.locator(`[data-testid="path-point-${pathId}-0"]`);
  assert((await cornerBtn.count()) === 1, 'UI: the corner/smooth toggle row is shown once smoothing is > 0');
  await cornerBtn.click();
  await page.waitForTimeout(100);
  const corneredD = await pathLocator.getAttribute('d');
  assert(corneredD !== smoothedD, `UI: toggling point 1 to a hard corner changes the rendered path again (${corneredD?.slice(0, 80)})`);

  const undoBtn = page.getByTitle('تراجع');
  await undoBtn.click(); // undo the corner toggle
  await page.waitForTimeout(100);
  assert((await pathLocator.getAttribute('d')) === smoothedD, 'UI: undo on the corner toggle is a single step, restoring the smoothed-but-uncornered path exactly');

  await slider.fill('0');
  await page.waitForTimeout(100);
  const revertedD = await pathLocator.getAttribute('d');
  assert(revertedD === originalD, `UI: reversibility — setting the smoothing slider back to 0 restores the exact original straight-segment path (${revertedD?.slice(0, 60)} vs ${originalD?.slice(0, 60)})`);

  await undoBtn.click(); // undo the slider-to-0 commit
  await page.waitForTimeout(100);
  assert((await pathLocator.getAttribute('d')) === smoothedD, 'UI: undo on the slider-to-0 change is also a single step (one commit per slider move, not per intermediate tick)');

  await slider.fill('65');
  await page.waitForTimeout(100);
  const finalD = await pathLocator.getAttribute('d');

  // --- Survives a real reload (autosave round-trip) -----------------------------
  await page.waitForTimeout(800); // past the 700ms autosave debounce
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-testid="artboard"]');
  assert((await page.locator(`[data-el-id="${pathId}"]`).count()) === 1, 'reload: the smoothed path element survives a real page reload (autosave round-trip)');
  assert((await page.locator(`[data-el-id="${pathId}"] path`).getAttribute('d')) === finalD, 'reload: the exact smoothed curve geometry (not just the element) survives the reload');

  // --- 6. The real designer flow end to end, with real pointer events -----------
  // Every assertion here failed before this pass; the numbers in the messages are
  // the ones measured on the broken build.
  const DOC = { w: 1080, h: 1080 };
  const SETTLE = 1100; // past the 700ms autosave debounce before reading localStorage
  const box0 = await page.locator('[data-testid="artboard"]').boundingBox();
  const toClient = (dx, dy) => [box0.x + (dx / DOC.w) * box0.width, box0.y + (dy / DOC.h) * box0.height];
  const readDoc = () =>
    page.evaluate(() => {
      const raw = window.localStorage.getItem('mazij.autosave.v1');
      const j = JSON.parse(raw);
      const ab = j.artboards.find((a) => a.id === j.activeArtboardId) ?? j.artboards[0];
      return ab.doc.elements.map((e) => ({ id: e.id, points: e.points, closed: e.closed, handles: e.handles, geo: e.geo }));
    });
  const clearDoc = async () => {
    await page.keyboard.press('Escape'); // node-edit mode routes Delete to anchors, not elements
    await page.waitForTimeout(80);
    for (let p = 0; p < 4; p++) {
      const ids = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
      if (!ids.length) break;
      for (const id of ids) {
        await page.locator(`[data-el-id="${id}"]`).click({ force: true }).catch(() => {});
        await page.keyboard.press('Delete');
        await page.waitForTimeout(40);
      }
    }
  };
  const pickPen = async () => {
    await page.locator('button[title="P"]').click();
    await page.waitForTimeout(80);
  };
  const newIdAfter = async (before) => {
    const after = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
    return after.find((id) => !before.includes(id));
  };
  const QUAD = [{ x: 250, y: 300 }, { x: 550, y: 250 }, { x: 820, y: 450 }, { x: 500, y: 760 }];
  const drawQuad = async () => {
    await clearDoc();
    await pickPen();
    const before = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
    for (const p of QUAD) {
      const [cx, cy] = toClient(p.x, p.y);
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(50);
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(SETTLE);
    return newIdAfter(before);
  };

  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(100);
  // `penClosePath` is UI state, not document state, so the real reload at the end of
  // section 4 already reset it to its default (off) — which is exactly what (b) needs,
  // and what the assert right after (a) verifies instead of trusting it.

  // (a) anchors land exactly where the designer clicked
  await clearDoc();
  await pickPen();
  const idsA = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  for (const p of QUAD) {
    const [cx, cy] = toClient(p.x, p.y);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(50);
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(SETTLE);
  const idA = await newIdAfter(idsA);
  const elA = (await readDoc()).find((e) => e.id === idA);
  const docAnchors = (el) => el.points.map((p) => ({ x: (el.geo.x + p.x * el.geo.w) * DOC.w, y: (el.geo.y + p.y * el.geo.h) * DOC.h }));
  const devA = Math.max(...docAnchors(elA).map((g, i) => Math.hypot(g.x - QUAD[i].x, g.y - QUAD[i].y)));
  assert(elA.points.length === 4 && devA < 3, `pen: four clicks store four anchors at the clicked document coordinates (max deviation ${devA.toFixed(2)}px)`);
  // Guards (b) against passing trivially: with the toggle off, Enter must leave the
  // path open, so closed===true there can only have come from the first-anchor click.
  assert(elA.closed === false, `pen: with "close path" off, finishing with Enter leaves the path open (closed=${elA.closed})`);

  // (b) clicking the first anchor closes and finishes the path — it used to append a
  // duplicate fourth point on top of the first and leave closed === false.
  await clearDoc();
  await pickPen();
  const idsB = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  const TRI = [{ x: 300, y: 300 }, { x: 700, y: 300 }, { x: 500, y: 650 }];
  for (const p of [...TRI, TRI[0]]) {
    const [cx, cy] = toClient(p.x, p.y);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(SETTLE);
  const idB = await newIdAfter(idsB);
  const elB = (await readDoc()).find((e) => e.id === idB);
  assert((await page.locator('[data-testid="artboard"] svg circle').count()) === 0, 'pen: clicking the first anchor finishes the draft (no leftover draft dots)');
  assert(elB?.closed === true && elB.points.length === 3, `pen: that click registers the path as closed with its own 3 anchors, no duplicate of the first (closed=${elB?.closed}, points=${elB?.points.length})`);

  // (c) click-and-drag while placing an anchor pulls out real bezier handles
  await clearDoc();
  await pickPen();
  const idsC = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  for (const p of [{ x: 250, y: 500 }, { x: 540, y: 500 }, { x: 830, y: 500 }]) {
    const [cx, cy] = toClient(p.x, p.y);
    const [hx, hy] = toClient(p.x + 90, p.y - 140);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let s = 1; s <= 8; s++) await page.mouse.move(cx + ((hx - cx) * s) / 8, cy + ((hy - cy) * s) / 8);
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(SETTLE);
  const idC = await newIdAfter(idsC);
  const elC = (await readDoc()).find((e) => e.id === idC);
  assert(!!elC?.handles?.[0]?.out, `pen: dragging while placing an anchor stores a real explicit handle (got ${JSON.stringify(elC?.handles?.[0])})`);
  const hEndX = (elC.geo.x + (elC.points[0].x + elC.handles[0].out.x) * elC.geo.w) * DOC.w;
  const hEndY = (elC.geo.y + (elC.points[0].y + elC.handles[0].out.y) * elC.geo.h) * DOC.h;
  assert(Math.hypot(hEndX - 340, hEndY - 360) < 4, `pen: that handle's endpoint lands on the exact point the designer dragged to (expected (340,360), got (${hEndX.toFixed(1)},${hEndY.toFixed(1)}))`);
  assert(Math.abs(elC.handles[0].out.y) <= 1.001, `pen: the finished element's box covers the control hull, so handle offsets stay sane box fractions (out.y = ${elC.handles[0].out.y.toFixed(4)}; anchors-only bbox gave -140)`);
  assert((await page.locator(`[data-el-id="${idC}"] path`).getAttribute('d')).includes('C'), 'pen: the hand-pulled path renders as a real curve with smoothAmount still 0');

  // (d) node editing: one anchor drag moves ONE anchor (it used to move the whole element)
  const idD = await drawQuad();
  await page.locator(`[data-testid="node-edit-${idD}-toggle"]`).click();
  await page.waitForTimeout(150);
  assert((await page.locator(`[data-testid^="node-anchor-${idD}-"]`).count()) === 4, 'node edit: every anchor is an addressable drag target on stage');
  let elD = (await readDoc()).find((e) => e.id === idD);
  const beforeAnchors = docAnchors(elD);
  const a1 = beforeAnchors[1];
  const [a1x, a1y] = toClient(a1.x, a1.y);
  await page.mouse.move(a1x, a1y);
  await page.mouse.down();
  for (let s = 1; s <= 10; s++) await page.mouse.move(a1x + 9 * s, a1y + 5 * s);
  await page.mouse.up();
  await page.waitForTimeout(SETTLE);
  elD = (await readDoc()).find((e) => e.id === idD);
  const moved = docAnchors(elD).map((p, i) => Math.hypot(p.x - beforeAnchors[i].x, p.y - beforeAnchors[i].y));
  assert(moved.filter((d) => d > 2).length === 1 && moved[1] > 2, `node edit: dragging anchor 2 moves exactly that anchor (per-anchor deltas ${moved.map((d) => d.toFixed(1)).join('/')}px; the whole element used to move by 290px)`);

  // (e) handle drag: mirrored by default, Alt breaks the mirror, one undo per drag
  await page.locator(`[data-testid="node-anchor-${idD}-1"]`).click();
  await page.waitForTimeout(120);
  const outBox = await page.locator(`[data-testid="node-handle-${idD}-1-out"]`).boundingBox();
  await page.mouse.move(outBox.x + outBox.width / 2, outBox.y + outBox.height / 2);
  await page.mouse.down();
  for (let s = 1; s <= 10; s++) await page.mouse.move(outBox.x + outBox.width / 2 + 6 * s, outBox.y + outBox.height / 2 - 4 * s);
  await page.mouse.up();
  await page.waitForTimeout(SETTLE);
  const hSym = (await readDoc()).find((e) => e.id === idD).handles[1];
  assert(close(hSym.in.x, -hSym.out.x) && close(hSym.in.y, -hSym.out.y), `node edit: a handle drag writes both sides exactly mirrored by default (in=${JSON.stringify(hSym.in)}, out=${JSON.stringify(hSym.out)})`);
  assert((await page.locator(`[data-el-id="${idD}"] path`).getAttribute('d')).includes('C'), 'node edit: both neighbouring segments become real curves as the handle moves');
  const outBox2 = await page.locator(`[data-testid="node-handle-${idD}-1-out"]`).boundingBox();
  await page.keyboard.down('Alt');
  await page.mouse.move(outBox2.x + outBox2.width / 2, outBox2.y + outBox2.height / 2);
  await page.mouse.down();
  for (let s = 1; s <= 10; s++) await page.mouse.move(outBox2.x + outBox2.width / 2 - 5 * s, outBox2.y + outBox2.height / 2 + 3 * s);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.waitForTimeout(SETTLE);
  const hBroken = (await readDoc()).find((e) => e.id === idD).handles[1];
  assert(!close(hBroken.in.x, -hBroken.out.x) || !close(hBroken.in.y, -hBroken.out.y), `node edit: Alt-dragging breaks handle symmetry (in=${JSON.stringify(hBroken.in)}, out=${JSON.stringify(hBroken.out)})`);
  await page.getByTitle('تراجع').click();
  await page.waitForTimeout(SETTLE);
  const hUndone = (await readDoc()).find((e) => e.id === idD).handles[1];
  assert(close(hUndone.in.x, -hUndone.out.x) && close(hUndone.in.y, -hUndone.out.y), 'node edit: one undo reverses exactly one handle drag, restoring the mirrored pair');

  // (f) delete an anchor mid-path, insert one on a segment without moving the curve
  const idF = await drawQuad();
  await page.locator(`[data-testid="node-edit-${idF}-toggle"]`).click();
  await page.waitForTimeout(150);
  await page.locator(`[data-testid="node-anchor-${idF}-1"]`).click();
  await page.waitForTimeout(100);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(SETTLE);
  const elFDel = (await readDoc()).find((e) => e.id === idF);
  const dDel = await page.locator(`[data-el-id="${idF}"] path`).getAttribute('d');
  assert(elFDel.points.length === 3 && /^M[^M]*$/.test(dDel.trim()), `node edit: deleting a mid-path anchor leaves 3 of 4 points on one continuous subpath (${dDel})`);
  await page.getByTitle('تراجع').click();
  await page.waitForTimeout(SETTLE);
  assert((await readDoc()).find((e) => e.id === idF).points.length === 4, 'node edit: one undo restores the deleted anchor');

  await page.locator(`[data-testid="smooth-amount-${idF}"]`).fill('70');
  await page.waitForTimeout(SETTLE);
  if ((await page.locator(`[data-testid="node-edit-${idF}"]`).count()) === 0) {
    await page.locator(`[data-testid="node-edit-${idF}-toggle"]`).click();
    await page.waitForTimeout(200);
  }
  const dBeforeIns = await page.locator(`[data-el-id="${idF}"] path`).getAttribute('d');
  const seg1 = page.locator(`[data-testid="node-seg-${idF}-1"]`);
  // The bbox centre of a curved segment is not on the stroke, and the insert target is
  // pointer-events:stroke — so aim at a real point on the curve.
  const onCurve = await seg1.evaluate((el) => {
    const q = el.getPointAtLength(el.getTotalLength() * 0.5);
    const m = el.getScreenCTM();
    return { x: q.x * m.a + q.y * m.c + m.e, y: q.x * m.b + q.y * m.d + m.f };
  });
  await page.mouse.dblclick(onCurve.x, onCurve.y);
  await page.waitForTimeout(SETTLE);
  const dAfterIns = await page.locator(`[data-el-id="${idF}"] path`).getAttribute('d');
  assert((await readDoc()).find((e) => e.id === idF).points.length === 5, 'node edit: double-clicking a segment inserts exactly one anchor');
  const insDev = await page.evaluate(([a, b]) => {
    const mk = (d) => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      document.body.appendChild(p);
      return p;
    };
    const pa = mk(a);
    const pb = mk(b);
    const la = pa.getTotalLength();
    const lb = pb.getTotalLength();
    let worst = 0;
    for (let i = 0; i <= 200; i++) {
      const qa = pa.getPointAtLength((la * i) / 200);
      const qb = pb.getPointAtLength((lb * i) / 200);
      worst = Math.max(worst, Math.hypot(qa.x - qb.x, qa.y - qb.y));
    }
    pa.remove();
    pb.remove();
    return worst;
  }, [dBeforeIns, dAfterIns]);
  assert(insDev < 0.01 && /^M[^M]*$/.test(dAfterIns.trim()), `node edit: the inserted anchor leaves the rendered curve unchanged and continuous — max deviation over 201 arc-length samples = ${insDev.toExponential(2)} of a 100-unit local box`);

  // (g) one real slider DRAG is one undo step (docs/CONTROLS.md promises this; a real
  // drag measured 18 steps before, because every onChange tick pushed its own commit)
  const idG = await drawQuad();
  const gPath = page.locator(`[data-el-id="${idG}"] path`);
  const gBaseD = await gPath.getAttribute('d');
  const gSlider = page.locator(`[data-testid="smooth-amount-${idG}"]`);
  const gBox = await gSlider.boundingBox();
  await page.mouse.move(gBox.x + 2, gBox.y + gBox.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(gBox.x + (gBox.width * i) / 20, gBox.y + gBox.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const gDraggedD = await gPath.getAttribute('d');
  assert(gDraggedD !== gBaseD && gDraggedD.includes('C'), 'slider: a real pointer drag across the smoothing slider actually smooths the path');
  let gUndos = 0;
  while (gUndos < 40) {
    await page.getByTitle('تراجع').click();
    await page.waitForTimeout(55);
    gUndos++;
    if ((await gPath.getAttribute('d')) === gBaseD) break;
  }
  assert(gUndos === 1, `slider: that whole drag costs exactly 1 undo step (got ${gUndos}; it was 18 before this pass)`);
  await page.getByTitle('إعادة').click();
  await page.waitForTimeout(150);
  assert((await gPath.getAttribute('d')) === gDraggedD, 'slider: one redo restores the whole drag');

  // (h) abandoning a draft by switching tools must not leak into the next path
  await clearDoc();
  await pickPen();
  for (const p of QUAD.slice(0, 3)) {
    const [cx, cy] = toClient(p.x, p.y);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(50);
  }
  await page.locator('button[title="V"]').click();
  await page.waitForTimeout(200);
  await pickPen();
  assert((await page.locator('[data-testid="artboard"] svg circle').count()) === 0, `tool switch: the abandoned draft is discarded, not resurrected on returning to the pen (${await page.locator('[data-testid="artboard"] svg circle').count()} stale dots; 3 before this pass)`);
  const idsH = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  for (const p of [{ x: 700, y: 820 }, { x: 860, y: 900 }]) {
    const [cx, cy] = toClient(p.x, p.y);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(50);
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(SETTLE);
  const idH = await newIdAfter(idsH);
  const elH = (await readDoc()).find((e) => e.id === idH);
  assert(elH.points.length === 2, `tool switch: the next drawn path has exactly its own 2 anchors, with no stale ones merged in (got ${elH.points.length}; it was 5 before this pass)`);

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
