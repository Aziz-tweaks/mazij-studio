#!/usr/bin/env node
// Covers roadmap item #17: appearance stack (multi-layer fill/stroke/shadow per
// element). Scope under test, all through the real `resolveAppearance`/
// `renderArtboardPng`/`renderArtboardSvg` functions (no reimplementation of app
// logic) and the real live webview for the layer-editor UI:
// (1) migration is lossless — a legacy element with no `appearance` field resolves
//     to the exact same color/stroke/shadow the pre-#17 legacy fields would paint;
// (2) the canvas path really composites every fill layer in order (blend modes
//     produce a provably different pixel than plain overwrite) and every stroke
//     position/outer-shadow layer paints real pixels where expected;
// (3) the SVG export path emits real per-layer markup (multiple shapes with
//     `mix-blend-mode`, a real gradient def, a real multi-layer shadow filter);
// (4) the sidebar layer editor (add/remove/duplicate/move/toggle/update, one
//     undo step per op) actually drives the live DOM preview's computed style.
//
// Run: node qa/appearance-stack.spec.mjs   (dev server must be running on :1420)
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

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  await bootDemo(page, BASE_URL);

  // --- 1. Migration is lossless (pure function, real resolveAppearance) ----------
  const migration = await page.evaluate(async () => {
    const appearanceMod = await import('/src/lib/appearance.ts');
    const elementsMod = await import('/src/state/elements.ts');
    const pal = { bg: '#101010', fg: '#f5f5f5', ac: '#ffb703' };
    const anim = { preset: 'none', start: 0, duration: 1, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} };

    const legacyShape = { id: 's1', type: 'shape', visible: true, locked: false, opacity: 100, maskId: null, geo: { x: 0, y: 0, w: 0.5, h: 0.5, rotation: 0 }, shape: 'rect', fill: '#334455', fillToken: 'ac', stroke: '#ff0000', strokeWidth: 6, radius: 0.1, anim };
    const legacyTokenShape = { id: 's2', type: 'shape', visible: true, locked: false, opacity: 100, maskId: null, geo: { x: 0, y: 0, w: 0.5, h: 0.5, rotation: 0 }, shape: 'rect', fill: null, fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0, anim };
    const legacyText = { id: 't1', type: 'text', visible: true, locked: false, opacity: 100, maskId: null, geo: { x: 0, y: 0, w: 0.5, h: 0.2, rotation: 0 }, text: 'hi', fontFamily: 'Alexandria', fontSize: 40, weight: 'bold', color: null, halign: 'start', valign: 'top', anim, textAnim: { enabled: false }, pathId: null };
    const legacyPenPath = { id: 'p1', type: 'shape', visible: true, locked: false, opacity: 100, maskId: null, geo: { x: 0, y: 0, w: 0.5, h: 0.5, rotation: 0 }, shape: 'path', fill: null, fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closed: true, anim };

    const shapeResolved = appearanceMod.resolveAppearance(legacyShape, pal);
    const tokenShapeResolved = appearanceMod.resolveAppearance(legacyTokenShape, pal);
    const textResolved = appearanceMod.resolveAppearance(legacyText, pal);
    const penResolved = appearanceMod.resolveAppearance(legacyPenPath, pal);

    return {
      shapeFillMatches: shapeResolved.fills[0]?.color === elementsMod.resolveShapeFill(legacyShape, pal),
      shapeStrokeMatches: shapeResolved.strokes[0]?.color === legacyShape.stroke && shapeResolved.strokes[0]?.width === legacyShape.strokeWidth,
      tokenFillMatches: tokenShapeResolved.fills[0]?.color === elementsMod.resolveShapeFill(legacyTokenShape, pal),
      textColorMatches: textResolved.fills[0]?.color === elementsMod.resolveTextColor(legacyText, pal),
      penStrokeFallback: penResolved.strokes[0]?.color === pal.fg && penResolved.strokes[0]?.width === 2,
      noAppearanceMutation: legacyShape.appearance === undefined,
    };
  });
  assert(migration.shapeFillMatches, 'migration: a legacy shape\'s literal fill resolves to the exact same color resolveShapeFill gives');
  assert(migration.shapeStrokeMatches, 'migration: a legacy shape\'s stroke resolves to the same color/width as the legacy fields');
  assert(migration.tokenFillMatches, 'migration: a legacy shape\'s palette-token fill resolves to the exact same color resolveShapeFill gives');
  assert(migration.textColorMatches, 'migration: a legacy text color resolves to the exact same value resolveTextColor gives');
  assert(migration.penStrokeFallback, 'migration: an unstroked pen path still gets a mandatory 2px pal.fg stroke, same as before roadmap #17');
  assert(migration.noAppearanceMutation, 'migration: resolveAppearance never mutates the element it reads (no appearance field written back)');

  // --- 2. Canvas path really composites layers in order --------------------------
  const canvasResult = await page.evaluate(async () => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const appearanceMod = await import('/src/lib/appearance.ts');
    const size = { w: 300, h: 300 };
    const palette = { bg: '#000000', fg: '#ffffff', ac: '#ffb703' };
    const anim = { preset: 'none', start: 0, duration: 1, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} };
    const baseShape = { id: 'px', type: 'shape', visible: true, locked: false, opacity: 100, maskId: null, geo: { x: 0.2, y: 0.2, w: 0.6, h: 0.6, rotation: 0 }, shape: 'rect', fill: '#ff0000', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0, anim };

    async function pixelAt(el, x, y) {
      const blob = await mod.renderArtboardPng({ size, palette, elements: [el], transparent: true, lang: 'ar', scale: 1 });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(size.w, size.h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    }

    const twoFills = (blend) => ({
      ...baseShape,
      appearance: {
        fills: [appearanceMod.newFillLayer({ color: '#ff0000', blend: 'normal' }), appearanceMod.newFillLayer({ color: '#0000ff', blend })],
        strokes: [],
        shadows: [],
      },
    });
    const centerX = Math.round(size.w / 2);
    const centerY = Math.round(size.h / 2);
    const normalCenter = await pixelAt(twoFills('normal'), centerX, centerY);
    const multiplyCenter = await pixelAt(twoFills('multiply'), centerX, centerY);

    const outsideStroke = {
      ...baseShape,
      appearance: { fills: [], strokes: [appearanceMod.newStrokeLayer({ color: '#00ff00', width: 10, position: 'outside' })], shadows: [] },
    };
    const centerStroke = { ...outsideStroke, appearance: { ...outsideStroke.appearance, strokes: [appearanceMod.newStrokeLayer({ color: '#00ff00', width: 10, position: 'center' })] } };
    // Rect box is 0.2..0.8 of 300px = 60..240; edge at x=60, stroke width 10.
    // 'outside' bands local [-10,0] -> absolute [50,60]; 'center' bands [-5,5] ->
    // absolute [55,65]. x=50 is inside the 'outside' band but past the 'center' one.
    const outsideEdge = await pixelAt(outsideStroke, 50, centerY);
    const centerEdge = await pixelAt(centerStroke, 50, centerY);

    const noShadow = { ...baseShape, appearance: { fills: [appearanceMod.newFillLayer({ color: '#ff0000' })], strokes: [], shadows: [] } };
    const withShadow = {
      ...baseShape,
      appearance: { fills: [appearanceMod.newFillLayer({ color: '#ff0000' })], strokes: [], shadows: [appearanceMod.newShadowLayer({ color: '#000000', opacity: 1, blur: 30, offsetX: 0, offsetY: 0, spread: 0 })] },
    };
    // Well outside the shape+blur radius on one axis, inside on the shadow's blur reach.
    const haloNoShadow = await pixelAt(noShadow, centerX, 45);
    const haloWithShadow = await pixelAt(withShadow, centerX, 45);

    return { normalCenter, multiplyCenter, outsideEdge, centerEdge, haloNoShadow, haloWithShadow };
  });
  assert(canvasResult.normalCenter.b > 200 && canvasResult.normalCenter.r < 40, `canvas: normal blend — the 2nd opaque fill layer fully overwrites the 1st (got rgb ${canvasResult.normalCenter.r},${canvasResult.normalCenter.g},${canvasResult.normalCenter.b})`);
  assert(canvasResult.multiplyCenter.r < 40 && canvasResult.multiplyCenter.b < 40, `canvas: multiply blend — red×blue composites to near-black, provably different from plain overwrite (got rgb ${canvasResult.multiplyCenter.r},${canvasResult.multiplyCenter.g},${canvasResult.multiplyCenter.b})`);
  assert(canvasResult.outsideEdge.a > 50, `canvas: an 'outside'-position stroke paints real pixels past the shape's own silhouette edge (alpha=${canvasResult.outsideEdge.a})`);
  assert(canvasResult.centerEdge.a < 50, `canvas: a 'center'-position stroke (same width) does NOT reach as far past the edge as 'outside' does (alpha=${canvasResult.centerEdge.a})`);
  assert(canvasResult.haloWithShadow.a > canvasResult.haloNoShadow.a + 20, `canvas: an outer shadow layer paints a real blurred halo beyond the shape bounds (no-shadow alpha=${canvasResult.haloNoShadow.a}, with-shadow alpha=${canvasResult.haloWithShadow.a})`);

  // --- 3. SVG export emits real per-layer markup ----------------------------------
  const svgResult = await page.evaluate(async () => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const appearanceMod = await import('/src/lib/appearance.ts');
    const size = { w: 300, h: 300 };
    const palette = { bg: '#000000', fg: '#ffffff', ac: '#ffb703' };
    const anim = { preset: 'none', start: 0, duration: 1, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} };
    const el = {
      id: 'sv', type: 'shape', visible: true, locked: false, opacity: 100, maskId: null, geo: { x: 0.2, y: 0.2, w: 0.6, h: 0.6, rotation: 0 }, shape: 'rect', fill: '#ff0000', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0, anim,
      appearance: {
        fills: [appearanceMod.newFillLayer({ color: '#ff0000', blend: 'normal' }), appearanceMod.newFillLayer({ kind: 'gradient', gradientFrom: '#00ff00', gradientTo: '#0000ff', blend: 'multiply' })],
        strokes: [appearanceMod.newStrokeLayer({ color: '#111111', width: 4, position: 'inside' }), appearanceMod.newStrokeLayer({ color: '#222222', width: 2, position: 'outside' })],
        shadows: [appearanceMod.newShadowLayer({ color: '#000000', opacity: 0.5, blur: 10, offsetX: 2, offsetY: 2 })],
      },
    };
    const blob = mod.renderArtboardSvg({ size, palette, elements: [el], transparent: true, lang: 'ar' });
    const text = await blob.text();
    return {
      rectCount: (text.match(/<rect /g) || []).length,
      hasBlend: text.includes('mix-blend-mode:multiply'),
      hasGradient: text.includes('linearGradient') && text.includes('#00ff00') && text.includes('#0000ff'),
      hasShadowFilter: text.includes('feGaussianBlur') && text.includes('feFlood') && text.includes('filter="url(#shadow-'),
    };
  });
  assert(svgResult.rectCount >= 4, `svg export: 2 fill layers + 2 stroke layers emit at least 4 real <rect> elements (got ${svgResult.rectCount})`);
  assert(svgResult.hasBlend, 'svg export: a non-normal blend fill layer emits a real mix-blend-mode CSS style');
  assert(svgResult.hasGradient, 'svg export: a gradient fill layer emits a real <linearGradient> def with both stops');
  assert(svgResult.hasShadowFilter, 'svg export: an outer shadow layer emits a real multi-primitive SVG filter, referenced via filter="url(#shadow-...)"');

  // --- 4. Sidebar layer editor drives the live DOM preview ------------------------
  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(100);
  await page.locator('button', { hasText: 'أشكال' }).click();
  await page.waitForTimeout(80);
  const box = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  await page.locator('button', { hasText: 'تحديد' }).click();
  await page.waitForTimeout(100);

  const newShapes = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  const elId = newShapes[newShapes.length - 1];
  const innerDiv = page.locator(`[data-el-id="${elId}"] > div`).first();

  const fillColorSel = `[data-testid^="appearance-fill-${elId}-"][data-testid$="-color"]`;
  const strokeColorSel = `[data-testid^="appearance-stroke-${elId}-"][data-testid$="-color"]`;
  const shadowColorSel = `[data-testid^="appearance-shadow-${elId}-"][data-testid$="-color"]`;

  assert((await page.locator(fillColorSel).count()) === 1, 'layer editor: a freshly-drawn shape shows exactly 1 migrated fill layer row');
  const bgBefore = await innerDiv.evaluate((e) => getComputedStyle(e).backgroundImage);
  assert(bgBefore === 'none', `layer editor: the single legacy fill paints via plain backgroundColor, not backgroundImage (got "${bgBefore}")`);

  // Add a 2nd fill layer — the single-layer byte-identical fallback no longer
  // applies, so backgroundImage must now be a real multi-layer stack.
  await page.locator(`[data-testid="appearance-add-fill-${elId}"]`).click();
  await page.waitForTimeout(80);
  assert((await page.locator(fillColorSel).count()) === 2, 'layer editor: "add fill" grows the fill list to 2 rows');
  const bgAfterAdd = await innerDiv.evaluate((e) => getComputedStyle(e).backgroundImage);
  assert(bgAfterAdd !== 'none' && bgAfterAdd.includes('gradient'), `layer editor: a 2nd fill layer switches the live preview to the multi-layer backgroundImage path (got "${bgAfterAdd}")`);

  // Remove it via its own row's remove button (test the remove control directly,
  // not just undo) and confirm it drops back to the single-layer byte-identical path.
  const secondFillTestId = (await page.locator(fillColorSel).nth(1).getAttribute('data-testid')).replace(/-color$/, '');
  await page.locator(`[data-testid="${secondFillTestId}-remove"]`).click();
  await page.waitForTimeout(80);
  assert((await page.locator(fillColorSel).count()) === 1, 'layer editor: the row\'s own remove button deletes exactly that layer');
  const bgAfterRemove = await innerDiv.evaluate((e) => getComputedStyle(e).backgroundImage);
  assert(bgAfterRemove === 'none', 'layer editor: removing back down to 1 fill layer restores the plain backgroundColor path');

  // Undo isolation: redo the add, then undo, and confirm one undo = one op.
  await page.locator(`[data-testid="appearance-add-fill-${elId}"]`).click();
  await page.waitForTimeout(80);
  assert((await page.locator(fillColorSel).count()) === 2, 'layer editor undo setup: back to 2 fill layers');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  assert((await page.locator(fillColorSel).count()) === 1, 'layer editor: a single undo reverts exactly one "add fill layer" op');

  // Strokes: adding a 2nd stroke layer disqualifies the legacy literal-border
  // fallback, so `border` must become 'none' and `boxShadow` must become real.
  assert((await page.locator(strokeColorSel).count()) === 0, 'layer editor: this rect has no stroke layer yet (none was ever set)');
  await page.locator(`[data-testid="appearance-add-stroke-${elId}"]`).click();
  await page.waitForTimeout(80);
  assert((await page.locator(strokeColorSel).count()) === 1, 'layer editor: "add stroke" creates the first stroke row');
  const border1 = await innerDiv.evaluate((e) => getComputedStyle(e).borderStyle);
  assert(border1 === 'solid', `layer editor: a single center-opacity-1 stroke layer renders via the literal border (byte-identical path) (got "${border1}")`);
  await page.locator(`[data-testid="appearance-add-stroke-${elId}"]`).click();
  await page.waitForTimeout(80);
  assert((await page.locator(strokeColorSel).count()) === 2, 'layer editor: "add stroke" again creates a 2nd stroke row');
  const border2 = await innerDiv.evaluate((e) => getComputedStyle(e).borderStyle);
  const shadow2 = await innerDiv.evaluate((e) => getComputedStyle(e).boxShadow);
  assert(border2 === 'none', `layer editor: 2 stroke layers no longer fit the literal-border fallback, so border is cleared (got "${border2}")`);
  assert(shadow2 !== 'none', `layer editor: 2 stroke layers paint through the combined box-shadow list instead (got "${shadow2}")`);

  // Shadows: adding a shadow layer must also route strokes+shadows through
  // box-shadow (even for the earlier single-stroke case).
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  assert((await page.locator(strokeColorSel).count()) === 1, 'layer editor undo: back to 1 stroke layer');
  await page.locator(`[data-testid="appearance-add-shadow-${elId}"]`).click();
  await page.waitForTimeout(80);
  assert((await page.locator(shadowColorSel).count()) === 1, 'layer editor: "add shadow" creates a shadow row');
  const borderWithShadow = await innerDiv.evaluate((e) => getComputedStyle(e).borderStyle);
  const shadowWithShadow = await innerDiv.evaluate((e) => getComputedStyle(e).boxShadow);
  assert(borderWithShadow === 'none', 'layer editor: any shadow layer present disqualifies the literal-border fallback, even with just 1 stroke');
  assert(shadowWithShadow !== 'none', 'layer editor: the shadow layer paints through the combined box-shadow list');

  // Visibility toggle: hiding the shadow layer must drop it from the live paint.
  const shadowTestId = (await page.locator(shadowColorSel).first().getAttribute('data-testid')).replace(/-color$/, '');
  await page.locator(`[data-testid="${shadowTestId}-visible"]`).click();
  await page.waitForTimeout(80);
  const shadowHidden = await innerDiv.evaluate((e) => getComputedStyle(e).boxShadow);
  assert(shadowHidden !== shadowWithShadow, `layer editor: toggling a shadow layer's visibility off changes the live paint (before="${shadowWithShadow}", after="${shadowHidden}")`);

  assert(pageErrors.length === 0, `no page errors through the whole run (${JSON.stringify(pageErrors)})`);

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
