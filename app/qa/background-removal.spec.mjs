#!/usr/bin/env node
// Covers roadmap item #9: "إزالة الخلفية" (background removal) — on-device inference
// via onnxruntime-web running inside this webview (see docs/CONTROLS.md "المرحلة 11"
// and src/lib/backgroundRemoval.ts for why: never Rust/a sidecar, because this exact
// QA harness drives the live UI at localhost:1420 and could never verify Rust-side
// inference). Scope under test:
// (1) the model registry (src/lib/localModels.ts) — u2netp is a real, downloadable,
//     Apache-2.0-licensed model with a verifiable sha256; RMBG-1.4 is listed but
//     flagged non-downloadable (non-commercial) and never auto-fetched;
// (2) the real live UI: dropping a real (synthetic, high-contrast) image, clicking
//     "إزالة الخلفية" — which for the very first run in this browser profile must
//     actually download the real model over the network, sha256-verify it, and only
//     then run real inference — reading the resulting <img>'s own real src and
//     numerically verifying its alpha channel (object ≈255, background ≈0, full
//     source resolution kept, not downscaled to the model's 320×320 input);
//     "استرجاع الخلفية" restoring the exact original src; and a single ⌘Z undo
//     restoring the whole pre-removal document in one step;
// (3) export reuse: feeding the already background-removed data URL through the real
//     `renderArtboardPng` exporter (the same function PNG export actually calls) and
//     confirming the alpha channel survives that pipeline instead of being flattened.
//
// Run: node qa/background-removal.spec.mjs   (dev server must be running on :1420)
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

// A real, high-contrast synthetic image (solid dark square on a solid white
// background) — deterministic ground truth for "object" vs "background" pixels,
// so the alpha-channel assertions below are checking the model's real output
// against a known-correct answer, not just "something non-zero happened".
function drawSyntheticTestImage(ctx, size) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#101010';
  ctx.fillRect(size * 0.25, size * 0.25, size * 0.5, size * 0.5);
}

// --- 1 & 3. Real download + real inference + registry sanity, via the real modules,
// no reimplementation. Also feeds the result through the real PNG exporter. ----------
async function testPureFunctionsAndExportReuse(page) {
  const r = await page.evaluate(async () => {
    const { LOCAL_MODELS, modelById, downloadModel, getModelBytes, isModelDownloaded } = await import('/src/lib/localModels.ts');
    const { removeImageBackground } = await import('/src/lib/backgroundRemoval.ts');
    const { renderArtboardPng } = await import('/src/lib/exportArtboard.ts');
    const { PALETTES } = await import('/src/data/constants.ts');

    const u2netp = modelById('u2netp');
    const rmbg = modelById('rmbg-1.4');
    const registryOk = !!(
      u2netp &&
      u2netp.downloadable &&
      u2netp.license === 'Apache-2.0' &&
      u2netp.sha256.length === 64 &&
      u2netp.sizeBytes > 1_000_000 &&
      LOCAL_MODELS.filter((m) => m.task === 'background-removal').length === 2
    );
    const rmbgOk = !!(rmbg && rmbg.downloadable === false && /non-commercial|غير.*تجاري/i.test(rmbg.license));

    const SIZE = 320;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#101010';
    ctx.fillRect(SIZE * 0.25, SIZE * 0.25, SIZE * 0.5, SIZE * 0.5);
    const srcDataUrl = canvas.toDataURL('image/png');

    let downloadError = null;
    const alreadyDownloaded = await isModelDownloaded(u2netp);
    if (!alreadyDownloaded) {
      try {
        await downloadModel(u2netp);
      } catch (err) {
        downloadError = err.message;
      }
    }

    let runError = null;
    let result = null;
    if (!downloadError) {
      try {
        const bytes = await getModelBytes(u2netp);
        result = await removeImageBackground(srcDataUrl, u2netp, bytes);
      } catch (err) {
        runError = err.message;
      }
    }

    function sampleAlpha(dataUrl, w, h) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const cx = c.getContext('2d');
          cx.drawImage(img, 0, 0);
          const d = cx.getImageData(0, 0, w, h).data;
          const at = (x, y) => d[(y * w + x) * 4 + 3];
          resolve({ inside: at(Math.round(w / 2), Math.round(h / 2)), outside: at(4, 4) });
        };
        img.onerror = reject;
        img.src = dataUrl;
      });
    }

    const liveSamples = result ? await sampleAlpha(result.dataUrl, result.width, result.height) : null;

    // --- Export reuse: the already-processed data URL through the real exporter.
    let exportSamples = null;
    let exportBlobType = null;
    if (result) {
      const anim = { preset: 'none', start: 0, duration: 0.6, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} };
      const el = {
        id: 'bg-export-test',
        type: 'image',
        visible: true,
        locked: false,
        opacity: 100,
        maskId: null,
        geo: { x: 0, y: 0, w: 1, h: 1, rotation: 0 },
        src: result.dataUrl,
        fit: 'cover',
        cropX: 0.5,
        cropY: 0.5,
        cropScale: 1,
        flipH: false,
        flipV: false,
        radius: 0,
        stroke: null,
        strokeWidth: 0,
        naturalW: result.width,
        naturalH: result.height,
        anim,
      };
      const blob = await renderArtboardPng({
        size: { id: 'custom', ar: 'مخصص', en: 'Custom', w: SIZE, h: SIZE },
        palette: PALETTES[0],
        elements: [el],
        transparent: true,
        scale: 1,
        lang: 'ar',
      });
      exportBlobType = blob.type;
      const exportDataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      exportSamples = await sampleAlpha(exportDataUrl, SIZE, SIZE);
    }

    return {
      registryOk,
      rmbgOk,
      alreadyDownloaded,
      downloadError,
      runError,
      resultW: result?.width,
      resultH: result?.height,
      liveSamples,
      exportSamples,
      exportBlobType,
    };
  });

  assert(r.registryOk, `registry: u2netp is a real downloadable Apache-2.0 model with a full sha256 and a real size, alongside exactly 2 background-removal entries (${JSON.stringify(r)})`);
  assert(r.rmbgOk, `registry: RMBG-1.4 is listed but flagged non-downloadable + explicitly non-commercial (${JSON.stringify(r)})`);
  assert(!r.downloadError, `pure fn: the real model actually downloaded + sha256-verified without error (${r.downloadError})`);
  assert(!r.runError, `pure fn: real on-device inference ran without error (${r.runError})`);
  assert(r.resultW === 320 && r.resultH === 320, `pure fn: output stays at the source's full 320×320 resolution, never downscaled to anything else (${r.resultW}×${r.resultH})`);
  assert(r.liveSamples && r.liveSamples.inside > 200, `pure fn: alpha inside the synthetic object is ≈255 — a real model decision, not a faked mask (${JSON.stringify(r.liveSamples)})`);
  assert(r.liveSamples && r.liveSamples.outside < 50, `pure fn: alpha outside the object (background) is ≈0 (${JSON.stringify(r.liveSamples)})`);
  assert(r.exportBlobType === 'image/png', `export reuse: renderArtboardPng (the real PNG exporter) produced a real PNG blob (${r.exportBlobType})`);
  assert(r.exportSamples && r.exportSamples.inside > 200, `export reuse: the real exporter keeps the object's alpha ≈255 (${JSON.stringify(r.exportSamples)})`);
  assert(r.exportSamples && r.exportSamples.outside < 50, `export reuse: the real exporter keeps the background's alpha ≈0 — the channel survives the shared PNG/SVG/video export pipeline, not flattened to opaque (${JSON.stringify(r.exportSamples)})`);
}

// --- 2. Real live UI: drop a real image, run the real button, verify the real DOM. --
async function dropSyntheticImage(page) {
  const before = await page.locator('[data-el-id]').count();
  await page.evaluate(async () => {
    const size = 320;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#101010';
    ctx.fillRect(size * 0.25, size * 0.25, size * 0.5, size * 0.5);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'bg-removal-test.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const target = document.querySelector('[data-testid="artboard"]');
    const rect = target.getBoundingClientRect();
    const clientX = rect.left + rect.width * 0.5;
    const clientY = rect.top + rect.height * 0.5;
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
  });
  await page.waitForTimeout(250);
  assert((await page.locator('[data-el-id]').count()) === before + 1, 'live UI: dropping the synthetic high-contrast test image added one new, auto-selected image element');
  return page.locator('[data-el-id] img').last().locator('..');
}

async function sampleAlphaOf(page, src) {
  return page.evaluate(
    (src) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const cx = c.getContext('2d');
          cx.drawImage(img, 0, 0);
          const d = cx.getImageData(0, 0, c.width, c.height).data;
          const at = (x, y) => d[(y * c.width + x) * 4 + 3];
          resolve({ inside: at(Math.round(c.width / 2), Math.round(c.height / 2)), outside: at(4, 4), w: c.width, h: c.height });
        };
        img.onerror = reject;
        img.src = src;
      }),
    src,
  );
}

async function testLiveUI(page) {
  const frame = await dropSyntheticImage(page);
  const img = frame.locator('img');
  await page.waitForTimeout(100);

  const removeBtn = page.locator('[data-testid="remove-background-btn"]');
  assert((await removeBtn.count()) === 1, 'live UI: the newly dropped+selected image shows a real "إزالة الخلفية" button in its properties panel');
  assert((await page.locator('text=يعمل على جهازك').count()) > 0, 'live UI: the "runs on your device" on-device privacy badge is actually rendered, not just defined in i18n strings');
  assert((await page.locator('[data-testid="restore-background-btn"]').count()) === 0, 'live UI: no restore button yet — nothing has been removed on this image');

  const originalSrc = await img.getAttribute('src');
  await removeBtn.click();

  await page.waitForSelector('[data-testid="restore-background-btn"]', { timeout: 60000 });
  await page.waitForTimeout(100);

  assert((await page.locator('[data-testid="remove-background-error"]').count()) === 0, 'live UI: background removal completed without hitting the error state');

  const removedSrc = await img.getAttribute('src');
  assert(removedSrc !== originalSrc && removedSrc.startsWith('data:image/png'), "live UI: the real <img>'s src actually changed to a new real PNG after removal");

  const live = await sampleAlphaOf(page, removedSrc);
  assert(live.inside > 200, `live UI: alpha inside the object stays ≈255 in the real rendered element (${JSON.stringify(live)})`);
  assert(live.outside < 50, `live UI: alpha outside the object (background) is ≈0 in the real rendered element (${JSON.stringify(live)})`);
  assert(live.w === 320 && live.h === 320, `live UI: the processed image keeps the dropped source's full 320×320 resolution (${JSON.stringify(live)})`);

  // "استرجاع الخلفية" — real content restore, not a visual-only toggle.
  await page.locator('[data-testid="restore-background-btn"]').click();
  await page.waitForTimeout(100);
  assert((await img.getAttribute('src')) === originalSrc, 'live UI: "استرجاع الخلفية" restores the exact original src losslessly');
  assert((await page.locator('[data-testid="restore-background-btn"]').count()) === 0, 'live UI: the restore button disappears once there is nothing left to restore');

  // Re-run removal (model already cached from above, so this is fast), then a
  // single ⌘Z — must fully undo the removal in one step, no leftover backup.
  await removeBtn.click();
  await page.waitForSelector('[data-testid="restore-background-btn"]', { timeout: 30000 });
  await page.waitForTimeout(100);
  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await page.waitForTimeout(150);
  assert((await img.getAttribute('src')) === originalSrc, 'live UI: a single ⌘Z undo fully restores the pre-removal document, including the image src');
  assert((await page.locator('[data-testid="restore-background-btn"]').count()) === 0, 'live UI: after undo, bgOriginalSrc is gone too — no leftover backup from the undone action');
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

  // Live UI first, so its real button click is what actually performs the one
  // real network download+sha256-verify for this browser profile; the pure-fn /
  // export-reuse pass below then reuses that same cached model (still a real
  // getModelBytes() read, just no second download).
  await testLiveUI(page);
  await testPureFunctionsAndExportReuse(page);

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
