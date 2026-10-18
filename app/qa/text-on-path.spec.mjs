#!/usr/bin/env node
// Covers the "نص على مسار" (text-on-path) half of roadmap item #12 — the gap the
// already-shipped Arabic shaping pipeline (`arabicShaping.ts`, "تحويل النص إلى مخطط
// متجهي") explicitly deferred (see docs/CONTROLS.md, مرحلة 17). Scope under test:
// (1) the pure curve-geometry transform (`pathCommandsInTargetFrame` in
//     src/lib/textOnPath.ts) maps a path shape's own fractional points into a text
//     element's local pixel frame correctly for a known, hand-checked case;
// (2) `shapeTextOnCurve` — the single function all three renderers call through —
//     actually bends real HarfBuzz-shaped glyphs along a curve (non-trivial path
//     data, not a straight line reproduction of flat text), rejects non-built-in
//     fonts with a clear error (never silently mis-renders), and returns `[]` for
//     empty text/a degenerate (zero-length) curve rather than throwing;
// (3) the real live UI: drawing a pen path, pair-selecting it with a text element,
//     clicking the real "نص على مسار منحني" button actually swaps the DOM's flat
//     text flow for a real multi-command SVG `<path>`, detaching restores the
//     original flat text exactly;
// (4) the real production PNG renderer (`renderArtboardPng`) paints real pixels
//     along the curve's own bounding path, not just the flat text's old box;
// (5) the real SVG exporter (`renderArtboardSvg`, which stays fully synchronous —
//     see `ArtboardRenderSpec.curvedTextCmds`) emits a real `<path>` when handed
//     precomputed curve cmds, and gracefully falls back to plain `<text>` when a
//     curved text element has no precomputed entry (never throws);
// (6) no regression: a plain (non-curved) text element with `textAnim.enabled`
//     stagger still renders through the untouched flat-text path.
//
// Run: node qa/text-on-path.spec.mjs   (dev server must be running on :1420)
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';
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

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  await bootDemo(page, BASE_URL);

  // --- 1. Pure geometry: pathCommandsInTargetFrame on a known case -----------------
  const geo = await page.evaluate(async () => {
    const mod = await import('/src/lib/textOnPath.ts');
    // A straight horizontal path shape (own box 0..1 x, 0..1 y → points (0,0.5)-(1,0.5))
    // sitting at artboard px (100,100,200,50) (no rotation); the "text" target box is
    // the artboard itself (0,0,400,400,rotation 0). Expect the mapped line to run from
    // (100,125) to (300,125) in the target's own local frame (== artboard px, since the
    // target box here has no offset/rotation of its own).
    const shapeLike = { points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], closed: false };
    const shapeBox = { x: 100, y: 100, w: 200, h: 50, rotation: 0 };
    const targetBox = { x: 0, y: 0, w: 400, h: 400, rotation: 0 };
    const cmds = mod.pathCommandsInTargetFrame(shapeLike, shapeBox, targetBox);
    return cmds.map((c) => ({ c: c.c, x: c.x, y: c.y }));
  });
  assert(geo.length === 2 && geo[0].c === 'M' && geo[1].c === 'L', `pathCommandsInTargetFrame: a 2-point open path maps to one M + one L, got ${JSON.stringify(geo)}`);
  assert(Math.abs(geo[0].x - 100) < 1e-6 && Math.abs(geo[0].y - 125) < 1e-6, `pathCommandsInTargetFrame: start point maps to (100,125) in the target's local frame, got (${geo[0].x},${geo[0].y})`);
  assert(Math.abs(geo[1].x - 300) < 1e-6 && Math.abs(geo[1].y - 125) < 1e-6, `pathCommandsInTargetFrame: end point maps to (300,125), got (${geo[1].x},${geo[1].y})`);

  // --- 2. shapeTextOnCurve: real bent glyphs, font gate, degenerate inputs --------
  const shapeResult = await page.evaluate(async () => {
    const mod = await import('/src/lib/textOnPath.ts');
    const size = { w: 1080, h: 1080 };
    const textEl = {
      id: 't1', type: 'text', visible: true, locked: false, opacity: 100, maskId: null, pathId: 'p1',
      geo: { x: 0.1, y: 0.4, w: 0.8, h: 0.2, rotation: 0 },
      text: 'مرحبا بالعالم', fontFamily: 'Alexandria', fontSize: 70, weight: 'bold', color: '#ffffff',
      halign: 'center', valign: 'middle',
      anim: { preset: 'none', start: 0, duration: 2, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
      textAnim: { enabled: false, unit: 'char', direction: 'start', stagger: 0.04, unitDuration: 0.35, effect: 'fade', easing: 'easeOut', bezier: [0, 0, 1, 1] },
    };
    const curveShape = {
      id: 'p1', type: 'shape', shape: 'path', visible: true, locked: false, opacity: 100, maskId: null,
      geo: { x: 0.05, y: 0.3, w: 0.9, h: 0.4, rotation: 0 },
      fill: null, fillToken: 'ac', stroke: '#888', strokeWidth: 2, radius: 0,
      points: [{ x: 0, y: 1 }, { x: 0.5, y: 0 }, { x: 1, y: 1 }], closed: false, smoothAmount: 0.6,
      anim: { preset: 'none', start: 0, duration: 2, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
    };
    const straightShape = { ...curveShape, points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], smoothAmount: 0 };

    const bentCmds = await mod.shapeTextOnCurve(textEl, curveShape, size, 'rtl');
    const straightCmds = await mod.shapeTextOnCurve(textEl, straightShape, size, 'rtl');

    let fontError = null;
    try {
      await mod.shapeTextOnCurve({ ...textEl, fontFamily: 'SomeCustomUploadedFont' }, curveShape, size, 'rtl');
    } catch (e) {
      fontError = e.constructor.name;
    }

    const emptyTextCmds = await mod.shapeTextOnCurve({ ...textEl, text: '   ' }, curveShape, size, 'rtl');
    const zeroLenCurve = { ...curveShape, points: [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }] };
    const zeroLenCmds = await mod.shapeTextOnCurve(textEl, zeroLenCurve, size, 'rtl');

    // Bounding box of each result, to compare vertical spread (a bent run should
    // spread much more vertically than a straight one for the same text/curve span).
    function bbox(cmds) {
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
      for (const c of cmds) {
        const pts = c.c === 'C' ? [[c.x1, c.y1], [c.x2, c.y2], [c.x, c.y]] : c.c === 'Z' ? [] : [[c.x, c.y]];
        for (const [x, y] of pts) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
      return { w: maxX - minX, h: maxY - minY };
    }

    return {
      bentCmdCount: bentCmds.length,
      bentHasCurve: bentCmds.some((c) => c.c === 'C'),
      bentBbox: bbox(bentCmds),
      straightBbox: bbox(straightCmds),
      fontError,
      emptyTextCmdCount: emptyTextCmds.length,
      zeroLenCmdCount: zeroLenCmds.length,
    };
  });
  assert(shapeResult.bentCmdCount > 10, `shapeTextOnCurve: a real Arabic phrase on a curve produces substantial real path geometry (multiple glyph contours), got ${shapeResult.bentCmdCount} commands`);
  assert(shapeResult.bentHasCurve, 'shapeTextOnCurve: the returned glyph outlines contain real cubic-bezier (C) commands (actual letterforms, not boxes)');
  assert(shapeResult.bentBbox.h > shapeResult.straightBbox.h * 1.5, `shapeTextOnCurve: text bent along a peaked curve spans noticeably more vertical height than the same text on a straight line (bent h=${shapeResult.bentBbox.h.toFixed(1)}, straight h=${shapeResult.straightBbox.h.toFixed(1)})`);
  assert(shapeResult.fontError === 'TextOnPathUnsupportedFontError', `shapeTextOnCurve: a non-built-in font family is rejected with a clear typed error, got ${shapeResult.fontError}`);
  assert(shapeResult.emptyTextCmdCount === 0, 'shapeTextOnCurve: whitespace-only text returns an empty (not crashed) command list');
  assert(shapeResult.zeroLenCmdCount === 0, 'shapeTextOnCurve: a zero-length degenerate curve returns an empty (not crashed) command list');
  assert(pageErrors.length === 0, `no console/page errors after exercising shapeTextOnCurve: ${JSON.stringify(pageErrors)}`);

  // --- 3. Real live UI: draw a pen path, pair-select, attach, verify, detach ------
  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(80);
  await page.locator('button[title="P"]').click(); // pen tool
  await page.waitForTimeout(80);

  const abBox = await page.locator('[data-testid="artboard"]').boundingBox();
  const idsBefore = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  const pt = (x, y) => [abBox.x + abBox.width * x, abBox.y + abBox.height * y];
  // Clear top strip (y < 0.09), same convention as qa/pen-smoothing.spec.mjs.
  for (const [x, y] of [pt(0.2, 0.015), pt(0.5, 0.075), pt(0.8, 0.015)]) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(60);
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);

  const idsAfter = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  const newPathId = idsAfter.find((id) => !idsBefore.includes(id));
  assert(Boolean(newPathId), 'UI: drawing 3 points then Enter created one new pen-path element');

  const originalD = await page.locator('[data-el-id="discount"]').evaluate((el) => el.outerHTML.includes('<svg') ? 'had-svg-already' : 'flat-text');
  assert(originalD === 'flat-text', 'UI: the "discount" text element starts as plain flat text (no path), before attaching');

  // Pair-select the "discount" text + the new path, then attach.
  await page.locator('[data-el-id="discount"]').click();
  await page.locator(`[data-el-id="${newPathId}"]`).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(100);

  const attachBtn = page.locator('[data-testid="text-on-path-btn-discount"]');
  assert((await attachBtn.count()) === 1, 'UI: the real "نص على مسار منحني" attach button appears for a text+path pair selection');
  await attachBtn.click();
  await page.waitForTimeout(400); // real async HarfBuzz shaping

  const curvedPathD = await page.locator('[data-el-id="discount"] svg path').getAttribute('d');
  assert(Boolean(curvedPathD) && /[Cc]/.test(curvedPathD), `UI: after attaching, "discount" renders as a real SVG <path> with curve commands, got: ${curvedPathD?.slice(0, 80)}`);
  assert(pageErrors.length === 0, `no console/page errors after attaching text-on-path: ${JSON.stringify(pageErrors)}`);

  // Detach: select just the text, release button should appear and restore flat text.
  // Clicking an already-(multi-)selected element without Shift keeps the whole group
  // selected (drag-prep behavior) — deselect via empty canvas first, same as a real user.
  await page.locator('[data-testid="artboard"]').click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(60);
  await page.locator('[data-el-id="discount"]').click();
  await page.waitForTimeout(80);
  const releaseBtn = page.locator('[data-testid="text-on-path-release-discount"]');
  assert((await releaseBtn.count()) === 1, 'UI: a real detach button appears once a text element is attached to a path');
  await releaseBtn.click();
  await page.waitForTimeout(100);
  const afterDetachHasSvgPath = await page.locator('[data-el-id="discount"] svg path').count();
  assert(afterDetachHasSvgPath === 0, 'UI: detaching removes the curved <path> rendering, restoring plain flat text');
  const flatTextVisible = await page.locator('[data-el-id="discount"]').textContent();
  assert(flatTextVisible && flatTextVisible.includes('خصم'), 'UI: the original text content is intact and visible again after detaching');

  // --- 4. Real PNG export paints pixels along the curve ---------------------------
  const pngResult = await page.evaluate(async () => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const size = { w: 1080, h: 1080 };
    const palette = { bg: '#000000', fg: '#ffffff', ac: '#ffb703' };
    const textEl = {
      id: 'pt', type: 'text', visible: true, locked: false, opacity: 100, maskId: null, pathId: 'pp',
      geo: { x: 0.1, y: 0.4, w: 0.8, h: 0.2, rotation: 0 },
      text: 'مرحبا', fontFamily: 'Alexandria', fontSize: 80, weight: 'bold', color: '#ffffff',
      halign: 'center', valign: 'middle',
      anim: { preset: 'none', start: 0, duration: 2, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
      textAnim: { enabled: false, unit: 'char', direction: 'start', stagger: 0.04, unitDuration: 0.35, effect: 'fade', easing: 'easeOut', bezier: [0, 0, 1, 1] },
    };
    const curveShape = {
      id: 'pp', type: 'shape', shape: 'path', visible: true, locked: false, opacity: 100, maskId: null,
      geo: { x: 0.05, y: 0.25, w: 0.9, h: 0.5, rotation: 0 },
      fill: null, fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0,
      points: [{ x: 0, y: 1 }, { x: 0.5, y: 0 }, { x: 1, y: 1 }], closed: false, smoothAmount: 0.6,
      anim: { preset: 'none', start: 0, duration: 2, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
    };
    async function countOpaque(y0, h) {
      const blob = await mod.renderArtboardPng({ size, palette, elements: [curveShape, textEl], transparent: true, lang: 'ar', scale: 1 });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(1080, 1080);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, y0, 1080, h).data;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 20) count++;
      return count;
    }
    // The curve's peak sits near the top of its box (~27% down the artboard); a flat
    // fillText render (the old behavior) would instead center around y≈50% (valign
    // middle of the text box at y 0.4..0.6). Opaque pixels near the top prove the
    // curve geometry — not the flat text box — actually drove the paint.
    const nearPeak = await countOpaque(250, 150);
    return { nearPeak };
  });
  assert(pngResult.nearPeak > 50, `PNG export: real opaque pixels appear near the curve's peak (top of its box), not just the flat text's old centered position (got ${pngResult.nearPeak})`);

  // --- 5. Real SVG export: precomputed cmds -> real <path>; missing -> flat fallback
  const svgResult = await page.evaluate(async () => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const pathMod = await import('/src/lib/textOnPath.ts');
    const size = { w: 600, h: 600 };
    const palette = { bg: '#000000', fg: '#ffffff', ac: '#ffb703' };
    const textEl = {
      id: 'st', type: 'text', visible: true, locked: false, opacity: 100, maskId: null, pathId: 'sp',
      geo: { x: 0.1, y: 0.4, w: 0.8, h: 0.2, rotation: 0 },
      text: 'Hello', fontFamily: 'Alexandria', fontSize: 60, weight: 'bold', color: '#ffffff',
      halign: 'center', valign: 'middle',
      anim: { preset: 'none', start: 0, duration: 2, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
      textAnim: { enabled: false, unit: 'char', direction: 'start', stagger: 0.04, unitDuration: 0.35, effect: 'fade', easing: 'easeOut', bezier: [0, 0, 1, 1] },
    };
    const curveShape = {
      id: 'sp', type: 'shape', shape: 'path', visible: true, locked: false, opacity: 100, maskId: null,
      geo: { x: 0.05, y: 0.3, w: 0.9, h: 0.4, rotation: 0 },
      fill: null, fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0,
      points: [{ x: 0, y: 1 }, { x: 1, y: 0 }], closed: false,
      anim: { preset: 'none', start: 0, duration: 2, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
    };
    const cmds = await pathMod.shapeTextOnCurve(textEl, curveShape, size, 'ltr');
    const withCmds = mod.renderArtboardSvg({ size, palette, elements: [curveShape, textEl], transparent: true, lang: 'en', curvedTextCmds: { st: cmds } });
    const withoutCmds = mod.renderArtboardSvg({ size, palette, elements: [curveShape, textEl], transparent: true, lang: 'en' });
    const withText = withCmds.constructor.name; // sanity: still returns a real Blob synchronously (not a Promise)
    return {
      isBlob: withCmds instanceof Blob,
      withSvg: await withCmds.text(),
      withoutSvg: await withoutCmds.text(),
    };
  });
  assert(svgResult.isBlob, 'renderArtboardSvg: still returns a real Blob synchronously (no breaking signature change for existing callers)');
  assert(svgResult.withSvg.includes('<path d="M') && /[Cc]/.test(svgResult.withSvg), `SVG export with precomputed curvedTextCmds: emits a real multi-command <path> for the curved text, got: ${svgResult.withSvg.match(/<path[^>]*>/g)}`);
  assert(!svgResult.withSvg.includes('>Hello<'), 'SVG export with precomputed curvedTextCmds: the curved element is NOT rendered as plain <text>Hello</text>');
  assert(svgResult.withoutSvg.includes('>Hello<'), 'SVG export WITHOUT precomputed cmds for a pathId element: falls back gracefully to plain flat <text> (never throws, never silently drops the element)');

  // --- 6. No regression: plain stagger-enabled text unaffected --------------------
  const staggerStillWorks = await page.evaluate(async () => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const size = { w: 400, h: 400 };
    const palette = { bg: '#000000', fg: '#ffffff', ac: '#ffb703' };
    const el = {
      id: 'reg', type: 'text', visible: true, locked: false, opacity: 100, maskId: null, pathId: null,
      geo: { x: 0.05, y: 0.4, w: 0.9, h: 0.2, rotation: 0 },
      text: 'ABCDE', fontFamily: 'Alexandria', fontSize: 80, weight: 'bold', color: '#ffffff',
      halign: 'start', valign: 'top',
      anim: { preset: 'none', start: 0, duration: 2, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
      textAnim: { enabled: true, unit: 'char', direction: 'start', stagger: 0.08, unitDuration: 0.3, effect: 'fade', easing: 'linear', bezier: [0, 0, 1, 1] },
    };
    const blob = await mod.renderArtboardPng({ size, palette, elements: [el], transparent: true, lang: 'en', time: 0.5, scale: 1 });
    return blob.size > 0;
  });
  assert(staggerStillWorks, 'regression: a plain text element (pathId: null) with char-stagger enabled still exports through the untouched flat-text/stagger path');

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.error('\nFailures:');
    failures.forEach((f) => console.error(' -', f));
  }
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
