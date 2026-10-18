#!/usr/bin/env node
// Covers roadmap item #8: "Magic Resize هجين" — heuristics layered on top of the
// plain proportional model every element already used (geo.x/y/w/h as fractions of
// the artboard, reused unchanged against whatever target width/height — see
// docs/CONTROLS.md "المرحلة 10" and src/lib/magicResize.ts). Scope under test:
// (1) the pure function `magicResizeElements` — real module, no reimplementation —
//     covering every heuristic: anchor-aware aspect-lock contain-fit for a
//     square/circular shape and an image frame, free (untouched) stretch for a
//     deliberately non-square shape, font-size floor+ceiling clamping for text, and
//     the safe-area clamp on an out-of-bounds legacy box;
// (2) the real UI: toggling Magic Resize on in the artboard size menu and applying
//     an extreme custom size actually changes the live document's rendered geometry
//     (read from the real DOM style the app sets, not re-derived) — and contrasted
//     against the same resize with the toggle off, which must leave the circle
//     distorted exactly like before; one single undo step restores everything;
// (3) the batch-export reuse: enabling "Magic Resize for batch" in the export dialog
//     and exporting to a size very different from the current artboard still
//     produces a real file with the exact requested pixel dimensions (the shared
//     engine doesn't break the existing export pipeline).
//
// Run: node qa/magic-resize.spec.mjs   (dev server must be running on :1420)
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

function pngDims(filePath) {
  const buf = fs.readFileSync(filePath);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const pct = (s) => parseFloat(String(s).replace('%', ''));

// --- 1. Pure function, real module, no reimplementation ------------------------
async function testPureFunctions(page) {
  const r = await page.evaluate(async () => {
    const mod = await import('/src/lib/magicResize.ts');
    const geo = (x, y, w, h) => ({ x, y, w, h, rotation: 0 });

    // Anchored top-start corner, perfectly square source box — plain proportional
    // stretch to a 4:1 target would turn it into a 4:1 oval.
    const circle = { id: 'circle', type: 'shape', shape: 'ellipse', geo: geo(0.02, 0.02, 0.1, 0.1) };
    // Deliberately non-square (14:1) — must NOT be read as an icon/badge.
    const bar = { id: 'bar', type: 'shape', shape: 'rect', geo: geo(0.1, 0.6, 0.7, 0.05) };
    // Anchored bottom-end corner, 1.5:1 frame, no natural image dimensions
    // (placeholder) — the frame's own source ratio must decide, not naturalW/H.
    const photo = { id: 'photo', type: 'image', naturalW: 0, naturalH: 0, geo: geo(0.64, 0.76, 0.3, 0.2) };
    const headline = { id: 'headline', type: 'text', fontSize: 96, geo: geo(0.1, 0.1, 0.8, 0.2) };
    // A legacy/corrupted box that overflows the frame outright.
    const overflow = { id: 'overflow', type: 'shape', shape: 'path', geo: geo(0.8, 0.1, 1.4, 0.3) };

    const from = { w: 1080, h: 1080 };
    const to = { w: 1920, h: 480 };
    const resized = mod.magicResizeElements([circle, bar, photo, headline, overflow], from, to);
    const byId = Object.fromEntries(resized.map((e) => [e.id, e]));
    const narrow = mod.magicResizeElements([headline], from, { w: 100, h: 1080 });

    return {
      circlePx: { w: byId.circle.geo.w * to.w, h: byId.circle.geo.h * to.h },
      circleFrac: { x: byId.circle.geo.x, y: byId.circle.geo.y },
      barGeo: byId.bar.geo,
      photoPx: { w: byId.photo.geo.w * to.w, h: byId.photo.geo.h * to.h },
      photoRightFrac: byId.photo.geo.x + byId.photo.geo.w,
      photoBottomFrac: byId.photo.geo.y + byId.photo.geo.h,
      headFontSize: byId.headline.fontSize,
      overflowGeo: byId.overflow.geo,
      narrowFontSize: narrow[0].fontSize,
      identity: mod.magicResizeElements([circle], from, from)[0].geo, // from === to: must be a no-op
    };
  });

  assert(Math.abs(r.circlePx.w - r.circlePx.h) < 0.001, `pure fn: aspect-locked circle stays a true square in real pixels after an extreme 4:1 aspect-ratio resize (${JSON.stringify(r.circlePx)})`);
  assert(Math.abs(r.circleFrac.x - 0.02) < 0.001 && Math.abs(r.circleFrac.y - 0.02) < 0.001, `pure fn: the circle stays anchored flush to the corner it started near, not re-centered (${JSON.stringify(r.circleFrac)})`);

  assert(Math.abs(r.barGeo.x - 0.1) < 1e-9 && Math.abs(r.barGeo.y - 0.6) < 1e-9 && Math.abs(r.barGeo.w - 0.7) < 1e-9 && Math.abs(r.barGeo.h - 0.05) < 1e-9, `pure fn: a deliberately non-square bar passes through exactly as plain proportional scaling would — not mistaken for an aspect-locked icon (${JSON.stringify(r.barGeo)})`);

  assert(Math.abs(r.photoPx.w / r.photoPx.h - 1.5) < 0.01, `pure fn: an image frame keeps its own 1.5:1 source ratio instead of the target's 6:1 proportional stretch (${JSON.stringify(r.photoPx)})`);
  assert(Math.abs(r.photoRightFrac - 0.94) < 0.001 && Math.abs(r.photoBottomFrac - 0.96) < 0.001, `pure fn: the image stays anchored to the same bottom/end edges it started flush against (right=${r.photoRightFrac}, bottom=${r.photoBottomFrac})`);

  assert(r.headFontSize < 96 - 1e-6, 'pure fn: text font size is actually reduced (not left untouched) when the target is much wider than tall');
  const ceilPx = (r.headFontSize / 1080) * 1920;
  assert(Math.abs(ceilPx - 96 * 1.5) < 0.01, `pure fn: the widened font size hits the documented +50% ceiling exactly, not the naive 1920/1080 stretch that would triple it (${ceilPx})`);

  const floorPx = (r.narrowFontSize / 1080) * 100;
  assert(Math.abs(floorPx - 96 * 0.7) < 0.01, `pure fn: on an extreme-narrow target, font size hits the documented -30% floor instead of shrinking to near-nothing (${floorPx})`);

  assert(Math.abs(r.overflowGeo.x - 0) < 1e-9 && Math.abs(r.overflowGeo.w - 1) < 1e-9, `pure fn: an out-of-bounds legacy box is clamped fully back inside the frame (${JSON.stringify(r.overflowGeo)})`);

  assert(Math.abs(r.identity.x - 0.02) < 1e-9 && Math.abs(r.identity.w - 0.1) < 1e-9, `pure fn: resizing to the exact same size is a no-op (${JSON.stringify(r.identity)})`);
}

// --- doc fixture shared by the live-UI tests ------------------------------------
function baseAnim() {
  return { preset: 'none', start: 0, duration: 0.6, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [] };
}

function buildDoc() {
  const geo = (x, y, w, h) => ({ x, y, w, h, rotation: 0 });
  return {
    elements: [
      { id: 'mr-circle', type: 'shape', visible: true, locked: false, opacity: 100, maskId: null, geo: geo(0.02, 0.02, 0.1, 0.1), shape: 'ellipse', fill: null, fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0, anim: baseAnim() },
      { id: 'mr-bar', type: 'shape', visible: true, locked: false, opacity: 100, maskId: null, geo: geo(0.1, 0.6, 0.7, 0.05), shape: 'rect', fill: null, fillToken: 'fg', stroke: null, strokeWidth: 0, radius: 0, anim: baseAnim() },
      { id: 'mr-photo', type: 'image', visible: true, locked: false, opacity: 100, maskId: null, geo: geo(0.64, 0.76, 0.3, 0.2), src: null, fit: 'cover', cropX: 0.5, cropY: 0.5, cropScale: 1, flipH: false, flipV: false, radius: 0, stroke: null, strokeWidth: 0, naturalW: 0, naturalH: 0, placeholder: true, anim: baseAnim() },
      { id: 'mr-headline', type: 'text', visible: true, locked: false, opacity: 100, maskId: null, geo: geo(0.1, 0.1, 0.8, 0.2), text: 'Magic resize test', fontFamily: 'Alexandria', fontSize: 96, weight: 'bold', color: null, halign: 'start', valign: 'top', anim: baseAnim() },
    ],
    anim: 'fade',
    sizeIdx: 0,
    customW: 1080,
    customH: 1080,
  };
}

async function seedAndReload(page) {
  await page.evaluate((doc) => {
    window.localStorage.setItem('mazij.autosave.v1', JSON.stringify(doc));
  }, buildDoc());
  await page.reload();
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-el-id="mr-headline"]');
}

async function elStyle(page, id) {
  return page.locator(`[data-el-id="${id}"]`).first().evaluate((el) => ({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height, fontSize: el.style.fontSize }));
}

async function openSizeMenu(page) {
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(80);
}

async function applyCustomSize(page, w, h) {
  await page.locator('[data-testid="custom-size-w"]').fill(String(w));
  await page.locator('[data-testid="custom-size-h"]').fill(String(h));
  await page.locator('[data-testid="custom-size-apply"]').click();
  await page.waitForTimeout(150);
}

// --- 2. Live UI: heuristics actually change the rendered document --------------
async function testLiveResize(page) {
  await seedAndReload(page);

  const before = await elStyle(page, 'mr-circle');
  assert(Math.abs(pct(before.width) - 10) < 0.01 && Math.abs(pct(before.height) - 10) < 0.01, `live UI: the seeded circle starts as a 10%×10% box before any resize (${JSON.stringify(before)})`);

  // --- 2a. Toggle OFF (default): applying the extreme custom size must behave
  // exactly like the pre-existing plain proportional system — the circle distorts.
  await openSizeMenu(page);
  await applyCustomSize(page, 1920, 480);

  const artboardBox = await page.locator('[data-testid="artboard"]').boundingBox();
  const plainCircle = await elStyle(page, 'mr-circle');
  const plainPxW = (pct(plainCircle.width) / 100) * artboardBox.width;
  const plainPxH = (pct(plainCircle.height) / 100) * artboardBox.height;
  assert(Math.abs(plainPxW / plainPxH - 4) < 0.15, `live UI: with Magic Resize OFF, the circle distorts into roughly a 4:1 oval exactly like plain proportional scaling always did (${plainPxW}/${plainPxH})`);

  // Undo back to the 1080×1080 source before testing the toggle ON.
  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await page.waitForTimeout(150);
  const afterUndo = await elStyle(page, 'mr-circle');
  assert(Math.abs(pct(afterUndo.width) - 10) < 0.01, `live UI: one undo fully restores the pre-resize document (${JSON.stringify(afterUndo)})`);
  assert((await page.locator('[data-testid="size-menu-button"]').textContent()).includes('1080'), 'live UI: undo also restores the artboard size label');

  // --- 2b. Toggle ON: the same extreme resize must now preserve the circle's
  // aspect, re-fit the image frame, leave the free bar untouched, and clamp the
  // headline's font size to the documented ceiling.
  await openSizeMenu(page);
  await page.locator('[data-testid="magic-resize-toggle"]').click();
  await page.waitForTimeout(60);
  await applyCustomSize(page, 1920, 480);

  assert((await page.locator('[data-testid="size-menu-button"]').textContent()).includes('1920'), 'live UI: Magic Resize ON still applies the requested target size label');

  const artboardBox2 = await page.locator('[data-testid="artboard"]').boundingBox();
  const circle = await elStyle(page, 'mr-circle');
  const circlePxW = (pct(circle.width) / 100) * artboardBox2.width;
  const circlePxH = (pct(circle.height) / 100) * artboardBox2.height;
  assert(Math.abs(circlePxW - circlePxH) < 1, `live UI: with Magic Resize ON, the circle renders as a true square in real pixels on the live canvas (${circlePxW} vs ${circlePxH})`);
  assert(Math.abs(pct(circle.left) - 2) < 0.1 && Math.abs(pct(circle.top) - 2) < 0.1, `live UI: the circle is still rendered flush against its original corner (${circle.left}, ${circle.top})`);

  const bar = await elStyle(page, 'mr-bar');
  assert(Math.abs(pct(bar.left) - 10) < 0.01 && Math.abs(pct(bar.top) - 60) < 0.01 && Math.abs(pct(bar.width) - 70) < 0.01 && Math.abs(pct(bar.height) - 5) < 0.01, `live UI: a deliberately non-square bar is rendered completely unchanged — Magic Resize only touches aspect-locked/anchored elements (${JSON.stringify(bar)})`);

  const photo = await elStyle(page, 'mr-photo');
  const photoPxW = (pct(photo.width) / 100) * artboardBox2.width;
  const photoPxH = (pct(photo.height) / 100) * artboardBox2.height;
  assert(Math.abs(photoPxW / photoPxH - 1.5) < 0.05, `live UI: the image frame renders at its own 1.5:1 source ratio instead of the target's 6:1 stretch (${photoPxW}/${photoPxH})`);
  assert(Math.abs(pct(photo.left) + pct(photo.width) - 94) < 0.1, `live UI: the image's right edge stays flush where it started (94%) (${photo.left} + ${photo.width})`);

  const head = await elStyle(page, 'mr-headline');
  assert(Math.abs(parseFloat(head.fontSize) - 7.5) < 0.01, `live UI: the headline's rendered font size reflects the documented +50% ceiling exactly (96→81 of a 1080 reference ⇒ 7.5cqw), not a naive proportional stretch (got ${head.fontSize})`);
  assert(Math.abs(pct(head.left) - 10) < 0.01 && Math.abs(pct(head.width) - 80) < 0.01, 'live UI: the headline box itself (not just its font) keeps its plain-proportional position/size');
}

// --- 3. Batch export reuses the same engine -------------------------------------
async function testExportReuse(page) {
  await seedAndReload(page); // back to a clean 1080×1080 document

  // Switch the artboard to a *custom* 800×800 first (plain, Magic Resize still off at
  // this point) — this also makes `size-menu-button`'s label "مقاس مخصص", not one of
  // the preset names, so the preset-toggle buttons below can't collide with it.
  await openSizeMenu(page);
  await applyCustomSize(page, 800, 800);

  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(150);
  await page.locator('button:has-text("PNG")').click();
  await page.waitForTimeout(60);
  await page.locator('button', { hasText: '1x' }).click();
  await page.waitForTimeout(60);

  await page.locator('[data-testid="export-magic-resize-toggle"]').click();
  await page.waitForTimeout(60);

  // Narrow the batch to just the 'tt' preset (1080×1920) — a 1:1 → 9:16 change from
  // the current 1080×1080 artboard, so the export loop is forced through the
  // magic-resize branch instead of reusing `state.elements` as-is.
  await page.locator('button', { hasText: 'بوست إنستقرام' }).click();
  await page.locator('button', { hasText: 'تغريدة X' }).click();
  await page.locator('button', { hasText: 'لينكدإن' }).click();
  await page.waitForTimeout(60);

  const downloads = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('button', { hasText: 'تصدير' }).last().click();

  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="export-result-"]').length === 1, { timeout: 15000 });
  await page.waitForTimeout(150);

  const results = await page.locator('[data-testid^="export-result-"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-ok')));
  assert(results.length === 1 && results[0] === 'true', `export reuse: the magic-resized 'tt' target exports successfully (${JSON.stringify(results)})`);
  assert(downloads.length === 1, `export reuse: exactly one real file was produced (${downloads.length})`);

  const tmp = path.join(os.tmpdir(), `mazij-qa-magic-resize-${Date.now()}.png`);
  await downloads[0].saveAs(tmp);
  const dims = pngDims(tmp);
  assert(dims.w === 1080 && dims.h === 1920, `export reuse: the file on disk is really 1080×1920 — the magic-resize element rewrite never changes the canvas's own pixel dimensions (${JSON.stringify(dims)})`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  await bootDemo(page, BASE_URL);

  await testPureFunctions(page);
  await testLiveResize(page);
  await testExportReuse(page);

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
