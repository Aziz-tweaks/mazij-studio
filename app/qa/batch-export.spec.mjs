#!/usr/bin/env node
// Covers roadmap item #3: batch export to multiple sizes in one run — selecting
// several presets plus a custom size in the export dialog and getting one real file
// per size, with correct per-size pixel dimensions, a single combined progress run,
// and a clear per-file result list (success/failure per target). Single-target
// PNG/SVG export and the video-unavailable-in-browser path are already covered by
// qa/image-editing.spec.mjs and qa/video-export.spec.mjs — this file is scoped to
// the new multi-target mechanics layered on top of that existing export pipeline.
//
// Run: node qa/batch-export.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

// PNG signature (8 bytes) + IHDR chunk length (4) + "IHDR" tag (4) = offset 16,
// where the width/height 4-byte big-endian ints live — real pixel dimensions read
// straight from the file bytes, not trusted from UI state.
function pngDims(filePath) {
  const buf = fs.readFileSync(filePath);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
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

  // A custom artboard size distinct from every preset, so the custom file's pixel
  // dimensions can only match if the batch loop's custom-size branch really ran.
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(80);
  await page.locator('[data-testid="size-option-custom"]').click();
  await page.waitForTimeout(80);
  await page.locator('[data-testid="custom-size-w"]').fill('500');
  await page.locator('[data-testid="custom-size-h"]').fill('400');
  await page.locator('[data-testid="custom-size-apply"]').click();
  await page.waitForTimeout(80);

  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(150);

  await page.locator('button:has-text("PNG")').click();
  await page.waitForTimeout(60);
  // 1x scale so each exported file's pixels equal the size preset's own w/h exactly.
  await page.locator('button', { hasText: '1x' }).click();
  await page.waitForTimeout(60);

  assert((await page.locator('[data-testid="export-target-custom"]').count()) === 1, 'batch export: a custom-size target tile exists in the sizes grid');

  // Default targets are ig+x+tt+li all on; narrow to ig+x, then add custom — 3 total.
  await page.locator('button', { hasText: 'تيك توك' }).click();
  await page.locator('button', { hasText: 'لينكدإن' }).click();
  await page.locator('[data-testid="export-target-custom"]').click();
  await page.waitForTimeout(60);

  const downloads = [];
  page.on('download', (d) => downloads.push(d));

  await page.locator('button', { hasText: 'تصدير' }).last().click();

  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="export-result-"]').length === 3, { timeout: 15000 });
  await page.waitForTimeout(150);

  const results = await page.locator('[data-testid^="export-result-"]').evaluateAll((els) => els.map((el) => ({ id: el.getAttribute('data-testid'), ok: el.getAttribute('data-ok') })));
  assert(results.length === 3, `batch export: per-file result list shows exactly 3 rows for 3 selected targets (${results.length})`);
  assert(results.every((r) => r.ok === 'true'), `batch export: every one of the 3 targets reports success in the result list (${JSON.stringify(results)})`);

  assert(downloads.length === 3, `batch export: exactly 3 real files were produced for 3 selected targets, in one export run (${downloads.length})`);

  const byId = {};
  for (const d of downloads) {
    const name = d.suggestedFilename();
    const m = name.match(/^mazij-(ig|x|custom)-\d+\.png$/);
    assert(Boolean(m), `batch export: filename follows the mazij-<size>-<timestamp> convention (${name})`);
    const tmp = path.join(os.tmpdir(), `mazij-qa-${Date.now()}-${name}`);
    await d.saveAs(tmp);
    byId[m ? m[1] : name] = pngDims(tmp);
  }

  assert(byId.ig && byId.ig.w === 1080 && byId.ig.h === 1080, `batch export: the ig file on disk is really 1080×1080 (${JSON.stringify(byId.ig)})`);
  assert(byId.x && byId.x.w === 1600 && byId.x.h === 900, `batch export: the x file on disk is really 1600×900 (${JSON.stringify(byId.x)})`);
  assert(byId.custom && byId.custom.w === 500 && byId.custom.h === 400, `batch export: the custom-size file on disk is really 500×400 (${JSON.stringify(byId.custom)})`);

  assert((await page.locator('body').innerText()).includes('تم التصدير'), 'batch export: dialog reports done once the whole multi-target batch finishes');

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
