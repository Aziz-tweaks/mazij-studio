#!/usr/bin/env node
// Covers roadmap item #16: multiple artboards (canvases/pages) in one mazij
// document, instead of exactly one. Scope under test, all through the real live
// webview (no reimplementation of app logic, except a generic PNG-container
// decoder used only to read real bytes off real downloaded files):
// (1) add/switch/rename/duplicate/delete artboards via the new ArtboardsDialog,
//     each with its own independent size and element list;
// (2) elements stay fully separate per artboard across repeated switches;
// (3) undo/redo history is independent per artboard — undoing on one artboard
//     never touches another, and switching away and back never loses or
//     cross-contaminates either one's history stack;
// (4) export (roadmap #3's batch-export machinery, reused not reimplemented):
//     exporting the active artboard works for a non-first artboard too, and
//     "export all artboards" produces one correctly-sized/correctly-painted file
//     per artboard in a single run;
// (5) save/reload round-trip keeps every artboard's own content intact;
// (6) a pre-roadmap-#16 legacy autosave (bare DocSnapshot, no `artboards` key)
//     loads losslessly as a single artboard, and the feature works normally on
//     top of it afterward.
//
// Run: node qa/artboards.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { bootDemo, resumeAfterReload, setExportTargets } from './helpers/boot.mjs';

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

// Generic PNG container decoder (signature + chunks + zlib inflate + per-scanline
// unfiltering) — reads real pixel bytes off a real downloaded file. Only 8-bit
// RGB/RGBA, non-interlaced: exactly what canvas.toBlob('image/png') produces,
// which is all `renderArtboardPng` ever emits.
function decodePng(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`decodePng: unsupported bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : null;
  if (!channels) throw new Error(`decodePng: unsupported color type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[pos];
    pos += 1;
    const scanline = raw.subarray(pos, pos + stride);
    pos += stride;
    const prevStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[prevStart + x] : 0;
      const c = y > 0 && x >= channels ? pixels[prevStart + x - channels] : 0;
      let val = scanline[x];
      if (filterType === 1) val = (val + a) & 0xff;
      else if (filterType === 2) val = (val + b) & 0xff;
      else if (filterType === 3) val = (val + Math.floor((a + b) / 2)) & 0xff;
      else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        val = (val + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      pixels[y * stride + x] = val;
    }
  }
  return { width, height, channels, pixels };
}

function pixelAt(decoded, x, y) {
  const i = (y * decoded.width + x) * decoded.channels;
  return { r: decoded.pixels[i], g: decoded.pixels[i + 1], b: decoded.pixels[i + 2] };
}

function isNearWhite(p) {
  return p.r > 235 && p.g > 235 && p.b > 235;
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

  const setCustomSize = async (w, h) => {
    await page.locator('[data-testid="size-menu-button"]').click();
    await page.waitForTimeout(80);
    await page.locator('[data-testid="size-option-custom"]').click();
    await page.waitForTimeout(80);
    await page.locator('[data-testid="custom-size-w"]').fill(String(w));
    await page.locator('[data-testid="custom-size-h"]').fill(String(h));
    await page.locator('[data-testid="custom-size-apply"]').click();
    await page.waitForTimeout(80);
  };

  const draw = async (x0, y0, x1, y1) => {
    const box = await page.locator('[data-testid="artboard"]').boundingBox();
    await page.mouse.move(box.x + box.width * x0, box.y + box.height * y0);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(100);
  };

  // --- 1. Baseline: a fresh document has exactly one artboard ------------------
  assert((await page.locator('[data-el-id]').count()) === 7, 'baseline: the default document has 7 elements (createDefaultElements)');

  await page.locator('[data-testid="open-artboards-btn"]').click();
  await page.waitForTimeout(100);
  assert(await page.locator('[data-testid="artboards-dialog"]').isVisible(), 'UI: Artboards dialog opens from the TopBar button');
  assert((await page.locator('[data-testid^="artboard-row-"]').count()) === 1, 'baseline: a fresh document lists exactly one artboard');
  const ab1Id = (await page.locator('[data-testid^="artboard-row-"]').getAttribute('data-testid')).replace('artboard-row-', '');
  await page.locator('[data-testid="close-artboards-btn"]').click();
  await page.waitForTimeout(80);

  // Give artboard 1 a distinct custom size before branching off a second artboard.
  await setCustomSize(600, 700);

  // --- 2. Add a second artboard: blank, auto-activated --------------------------
  await page.locator('[data-testid="open-artboards-btn"]').click();
  await page.waitForTimeout(100);
  await page.locator('[data-testid="add-artboard-btn"]').click();
  await page.waitForTimeout(100);
  assert((await page.locator('[data-testid^="artboard-row-"]').count()) === 2, 'add: artboards list now shows 2 rows');
  const rowIds = await page.locator('[data-testid^="artboard-row-"]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-testid').replace('artboard-row-', ''), active: e.getAttribute('data-active') === 'true' })));
  const ab2Id = rowIds.find((r) => r.active)?.id;
  assert(!!ab2Id && ab2Id !== ab1Id, `add: the newly-added artboard becomes active and has a distinct id (${JSON.stringify(rowIds)})`);
  await page.locator('[data-testid="close-artboards-btn"]').click();
  await page.waitForTimeout(80);

  assert((await page.locator('[data-el-id]').count()) === 0, 'add: a brand-new artboard starts blank (not a copy of the default demo content)');

  // Give artboard 2 its own distinct custom size, then draw a real shape and
  // color it white — real content that only exists on this artboard.
  await setCustomSize(400, 300);
  // لا «بسيط/احترافي» منذ ٢٤ أكتوبر ٢٠٢٦ (قرار المالك: «العمق يُطلب ولا يُفرض») — كلّ الأدوات حاضرة.
  await page.waitForTimeout(80);
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(80);
  await draw(0.15, 0.15, 0.85, 0.85);
  assert((await page.locator('[data-el-id]').count()) === 1, 'add: drawing a shape on the new (blank) artboard adds exactly one real element to it');
  await page.locator('button[title="#FFFFFF"]').first().click();
  await page.waitForTimeout(80);
  await page.locator('[data-tool="select"]').click();
  await page.waitForTimeout(80);

  // --- 3. Rename/duplicate reflected in the dialog -------------------------------
  await page.locator('[data-testid="open-artboards-btn"]').click();
  await page.waitForTimeout(100);
  await page.locator(`[data-testid="rename-artboard-${ab2Id}"]`).click();
  await page.locator(`[data-testid="artboard-rename-input-${ab2Id}"]`).fill('لوحة الشكل الأبيض');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  assert((await page.locator(`[data-testid="artboard-row-${ab2Id}"]`).innerText()).includes('لوحة الشكل الأبيض'), 'rename: the new name shows up in the artboards list');

  const row1Text = await page.locator(`[data-testid="artboard-row-${ab1Id}"]`).innerText();
  const row2Text = await page.locator(`[data-testid="artboard-row-${ab2Id}"]`).innerText();
  assert(row1Text.includes('600') && row1Text.includes('700'), `UI: the inactive artboard's own size (600×700) is shown even while it isn't active (got "${row1Text}")`);
  assert(row2Text.includes('400') && row2Text.includes('300'), `UI: the active artboard's own size (400×300) is shown (got "${row2Text}")`);

  await page.locator(`[data-testid="duplicate-artboard-${ab2Id}"]`).click();
  await page.waitForTimeout(100);
  assert((await page.locator('[data-testid^="artboard-row-"]').count()) === 3, 'duplicate: creates a 3rd artboard');
  const ab3Row = (await page.locator('[data-testid^="artboard-row-"]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-testid').replace('artboard-row-', ''), active: e.getAttribute('data-active') === 'true' })))).find((r) => r.active);
  assert(!!ab3Row && ab3Row.id !== ab1Id && ab3Row.id !== ab2Id, 'duplicate: the copy becomes the active artboard');
  await page.locator(`[data-testid="delete-artboard-${ab3Row.id}"]`).click();
  await page.waitForTimeout(100);
  assert((await page.locator('[data-testid^="artboard-row-"]').count()) === 2, 'delete: removing the duplicate goes back to 2 artboards');
  assert(pageErrors.length === 0, `no page errors through add/rename/duplicate/delete (${JSON.stringify(pageErrors)})`);
  await page.locator('[data-testid="close-artboards-btn"]').click();
  await page.waitForTimeout(80);

  // --- 4. Elements stay separate across repeated switches ------------------------
  // Deleting the duplicate above re-activates one of the two originals — make sure
  // we're back on artboard 2 (the one with the white shape) before switching.
  if (!(await page.locator('[data-el-id]').count())) {
    await page.locator('[data-testid="open-artboards-btn"]').click();
    await page.waitForTimeout(100);
    await page.locator(`[data-testid="switch-artboard-${ab2Id}"]`).click();
    await page.waitForTimeout(100);
    await page.locator('[data-testid="close-artboards-btn"]').click();
    await page.waitForTimeout(80);
  }
  assert((await page.locator('[data-el-id]').count()) === 1, 'switch setup: back on artboard 2 (1 shape) before the switch round-trip');

  await page.locator('[data-testid="open-artboards-btn"]').click();
  await page.waitForTimeout(100);
  await page.locator(`[data-testid="switch-artboard-${ab1Id}"]`).click();
  await page.waitForTimeout(100);
  await page.locator('[data-testid="close-artboards-btn"]').click();
  await page.waitForTimeout(80);
  assert((await page.locator('[data-el-id]').count()) === 7, 'switch: artboard 1 shows its own 7 default elements, not artboard 2\'s shape');

  await page.locator('[data-testid="open-artboards-btn"]').click();
  await page.waitForTimeout(100);
  await page.locator(`[data-testid="switch-artboard-${ab2Id}"]`).click();
  await page.waitForTimeout(100);
  await page.locator('[data-testid="close-artboards-btn"]').click();
  await page.waitForTimeout(80);
  assert((await page.locator('[data-el-id]').count()) === 1, 'switch: switching back to artboard 2 shows its own 1 shape again, unchanged');

  // --- 5. Export reuses roadmap #3's batch machinery -----------------------------
  // Artboard 2 (400×300, white shape) is active and NOT first in the list — a
  // direct test that "export the active artboard" works for a non-first one too.
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(150);
  await page.locator('button:has-text("PNG")').click();
  await page.waitForTimeout(60);
  await page.locator('button', { hasText: '1x' }).click();
  await page.waitForTimeout(60);
  // **One target, the artboard's own custom size** — this section is about *which*
  // artboard gets exported and at *whose* size, so the size list has to be a single
  // known entry or the file counts below stop meaning anything.
  //
  // This used to click the four preset names to switch them **off** and then switch
  // custom on, and it only reached one target because `initialStudioState.targets`
  // happened to hold exactly those four. It does not any more — it is seeded from the
  // document (`defaultTargetsFor`) — and the very same clicks switched three of them
  // **on** instead: four files where this asserts one, three at preset sizes, and
  // `__x`/`__tt`/`__li` in the filenames further down. Named outright now, and checked.
  const wantTargets = ['custom'];
  const onTargets = await setExportTargets(page, wantTargets);
  assert(
    JSON.stringify(onTargets) === JSON.stringify(wantTargets),
    `export setup: exactly one size target is selected, the artboard's own custom size — ${onTargets.join(', ') || 'none'}. Said here rather than subtracted from whatever the dialog opens with, so "exactly 1 file" and "2 artboards × 1 target" below are premises this spec owns`,
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-qa-artboards-'));

  let downloads = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('button', { hasText: 'تصدير' }).last().click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="export-result-"]').length === 1, { timeout: 15000 });
  await page.waitForTimeout(150);
  assert(downloads.length === 1, `export active-only: exactly 1 file produced (got ${downloads.length})`);
  const activeOnlyPath = path.join(tmpDir, 'active-only.png');
  await downloads[0].saveAs(activeOnlyPath);
  const activeOnlyPng = decodePng(activeOnlyPath);
  assert(activeOnlyPng.width === 400 && activeOnlyPng.height === 300, `export active-only: the non-first (artboard 2) active artboard exports at its OWN custom size 400×300 (got ${activeOnlyPng.width}×${activeOnlyPng.height})`);
  assert(isNearWhite(pixelAt(activeOnlyPng, 200, 150)), 'export active-only: the exported file really contains artboard 2\'s white shape at its center');

  // Reopen the dialog (closing/reopening resets exportState to 'idle', which is
  // what makes the submit button reappear — it's hidden once a run reaches 'done').
  // Target/format/scale selections are untouched by this, so they don't need
  // re-picking; only the new "export all artboards" toggle needs turning on.
  await page.mouse.click(5, 5);
  await page.waitForTimeout(100);
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(150);
  downloads = [];
  await page.locator('[data-testid="export-all-artboards-toggle"]').click();
  await page.waitForTimeout(60);
  await page.locator('button', { hasText: 'تصدير' }).last().click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="export-result-"]').length === 2, { timeout: 15000 });
  await page.waitForTimeout(150);
  assert(downloads.length === 2, `export all artboards: exactly 2 files produced for 2 artboards × 1 target (got ${downloads.length})`);

  const byArtboard = {};
  for (const d of downloads) {
    const name = d.suggestedFilename();
    const m = name.match(/^mazij-(.+)__custom-\d+\.png$/);
    assert(Boolean(m), `export all artboards: filename encodes the artboard id (${name})`);
    const abId = m ? m[1] : 'unknown';
    const tmp = path.join(tmpDir, `all-${abId}.png`);
    await d.saveAs(tmp);
    byArtboard[abId] = decodePng(tmp);
  }
  const d1 = byArtboard[ab1Id];
  const d2 = byArtboard[ab2Id];
  assert(!!d1 && d1.width === 600 && d1.height === 700, `export all artboards: artboard 1's file is really 600×700 (${d1 ? `${d1.width}×${d1.height}` : 'missing'})`);
  assert(!!d2 && d2.width === 400 && d2.height === 300, `export all artboards: artboard 2's file is really 400×300 (${d2 ? `${d2.width}×${d2.height}` : 'missing'})`);
  assert(!!d2 && isNearWhite(pixelAt(d2, 200, 150)), 'export all artboards: artboard 2\'s file really contains its own white shape');
  assert(!!d1 && !isNearWhite(pixelAt(d1, 300, 350)), 'export all artboards: artboard 1\'s file is NOT a copy of artboard 2\'s white shape');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);

  // --- 6. Undo/redo is independent per artboard ----------------------------------
  // Still on artboard 2: undo the fill-color change, then the shape draw itself.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  assert((await page.locator('[data-el-id]').count()) === 0, 'undo: two undos on artboard 2 remove its shape (fill change, then the draw itself)');

  await page.locator('[data-testid="open-artboards-btn"]').click();
  await page.waitForTimeout(100);
  await page.locator(`[data-testid="switch-artboard-${ab1Id}"]`).click();
  await page.waitForTimeout(100);
  await page.locator('[data-testid="close-artboards-btn"]').click();
  await page.waitForTimeout(80);
  assert((await page.locator('[data-el-id]').count()) === 7, 'undo isolation: artboard 1 still has all 7 elements — unaffected by undoing on artboard 2');

  // لا «بسيط/احترافي» منذ ٢٤ أكتوبر ٢٠٢٦ (قرار المالك: «العمق يُطلب ولا يُفرض») — كلّ الأدوات حاضرة.
  await page.waitForTimeout(60);
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(80);
  await draw(0.3, 0.01, 0.55, 0.075); // clear top strip, see qa/path-boolean.spec.mjs
  await page.locator('[data-tool="select"]').click();
  assert((await page.locator('[data-el-id]').count()) === 8, 'undo isolation setup: a new shape on artboard 1 brings it to 8 elements');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  assert((await page.locator('[data-el-id]').count()) === 7, 'undo: undo on artboard 1 reverts its own new shape back to 7');

  await page.locator('[data-testid="open-artboards-btn"]').click();
  await page.waitForTimeout(100);
  await page.locator(`[data-testid="switch-artboard-${ab2Id}"]`).click();
  await page.waitForTimeout(100);
  await page.locator('[data-testid="close-artboards-btn"]').click();
  await page.waitForTimeout(80);
  assert((await page.locator('[data-el-id]').count()) === 0, 'undo isolation: artboard 2 is still blank — the undo just done on artboard 1 never touched it');

  // --- 7. Save/reload round-trip --------------------------------------------------
  await page.waitForTimeout(1200); // autosave debounce (700ms) plus margin

  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mazij.autosave.v1')));
  assert(Array.isArray(saved?.artboards) && saved.artboards.length === 2, `autosave: persisted file lists both artboards (${saved?.artboards?.length})`);
  const savedAb1 = saved.artboards.find((a) => a.id === ab1Id);
  const savedAb2 = saved.artboards.find((a) => a.id === ab2Id);
  assert(savedAb1?.doc.elements.length === 7, `autosave: artboard 1's persisted doc has its own 7 elements (${savedAb1?.doc.elements.length})`);
  assert(savedAb2?.doc.elements.length === 0, `autosave: artboard 2's persisted doc has its own 0 elements (${savedAb2?.doc.elements.length})`);
  assert(savedAb1?.doc.customW === 600 && savedAb1?.doc.customH === 700, `autosave: artboard 1's own custom size (600×700) persisted (${savedAb1?.doc.customW}×${savedAb1?.doc.customH})`);
  assert(savedAb2?.doc.customW === 400 && savedAb2?.doc.customH === 300, `autosave: artboard 2's own custom size (400×300) persisted (${savedAb2?.doc.customW}×${savedAb2?.doc.customH})`);

  await page.reload();
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-testid="artboard"]');
  await page.locator('[data-testid="open-artboards-btn"]').click();
  await page.waitForTimeout(100);
  assert((await page.locator('[data-testid^="artboard-row-"]').count()) === 2, 'reload: both artboards survive a real page reload');
  await page.locator(`[data-testid="switch-artboard-${ab1Id}"]`).click();
  await page.waitForTimeout(100);
  await page.locator('[data-testid="close-artboards-btn"]').click();
  await page.waitForTimeout(80);
  assert((await page.locator('[data-el-id]').count()) === 7, 'reload: artboard 1 still has its own 7 elements after a real reload');

  // --- 8. Legacy single-doc migration ---------------------------------------------
  const legacyDoc = {
    elements: [
      { id: 'legacy-ab-text', type: 'text', visible: true, locked: false, opacity: 100, maskId: null, geo: { x: 0.1, y: 0.1, w: 0.5, h: 0.2, rotation: 0 }, text: 'Legacy single-artboard document', fontFamily: 'Alexandria', fontSize: 40, weight: 'bold', color: null, halign: 'start', valign: 'top', anim: { preset: 'none', start: 0, duration: 1, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [] } },
    ],
    anim: 'none',
    sizeIdx: 0,
    customW: 1080,
    customH: 1080,
  };
  await page.evaluate((doc) => window.localStorage.setItem('mazij.autosave.v1', JSON.stringify(doc)), legacyDoc);
  await page.reload();
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-el-id="legacy-ab-text"]');

  const legacyPageErrors = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', (e) => legacyPageErrors.push(e.message));

  await page.locator('[data-testid="open-artboards-btn"]').click();
  await page.waitForTimeout(100);
  assert((await page.locator('[data-testid^="artboard-row-"]').count()) === 1, 'migration: a pre-#16 bare DocSnapshot loads as exactly one artboard, not zero/many');
  await page.locator('[data-testid="add-artboard-btn"]').click();
  await page.waitForTimeout(100);
  assert((await page.locator('[data-testid^="artboard-row-"]').count()) === 2, 'migration: adding a 2nd artboard works normally on top of a migrated legacy document');
  assert(legacyPageErrors.length === 0, `migration: no runtime errors loading/using artboards on a legacy document (${JSON.stringify(legacyPageErrors)})`);

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
