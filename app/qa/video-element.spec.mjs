#!/usr/bin/env node
// Covers roadmap item #14: a real native video element type — file-picker and
// drag-and-drop import, trim in/out + loop (volume/mute are stored but not yet
// wired to any export audio pipeline, see docs/CONTROLS.md), live scrubbing that
// respects the trim window, and — the hard requirement — that the exact production
// render functions used by PNG and video/GIF export (`renderArtboardPng`/
// `renderArtboardFrames` in `src/lib/exportArtboard.ts`) actually composite real,
// decoded frames from the source file, not a placeholder box, AND that a real MP4
// produced by piping those frames through the bundled FFmpeg sidecar (the exact
// encode `videoExport.ts` performs) contains that real content when decoded back.
// Same "call the real function, read real pixels" methodology qa/lottie-import.spec.mjs
// established for Lottie.
//
// Ground truth: qa/fixtures/video-element-ground-truth.mp4 is a real file generated
// once (see the ffmpeg command in docs/CONTROLS.md's roadmap-#14 section): four
// 1-second flat-color segments (red/green/blue/yellow, concatenated, 160x120, 10fps)
// — real, distinct, known content at known timestamps, not a claim.
//
// Run: node qa/video-element.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// NOTE (video branch, phase 1): this spec drives surfaces that exist only on a
// **timed** document — the timeline's ruler/clips, the transport, the video tool, or
// MP4/GIF in the export dialog. The demo poster is 1080×1080, i.e. `SIZES[0]`, whose
// `kind` is `'still'`, so it now opens without them: `DocSnapshot.medium` gates three
// surfaces, which is the whole point of the phase — the start screen already asked
// "image or video?" and the answer finally reaches the workspace instead of a badge.
// `bootDemoTimed` opens the same demo document and then picks a timed destination
// from the real artboard size menu, which is both the gesture a designer performs and
// the reversibility `HomeScreen.tsx` promised when it declined a two-button gate.
// See `qa/helpers/boot.mjs`.
import { bootDemoTimed, resumeAfterReload } from './helpers/boot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:1420';
const SIDECAR = path.join(__dirname, '..', 'src-tauri', 'binaries', 'ffmpeg-aarch64-apple-darwin');
const FIXTURE = path.join(__dirname, 'fixtures', 'video-element-ground-truth.mp4');
const FIXTURE_B64 = fs.readFileSync(FIXTURE).toString('base64');

let pass = 0;
let fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}

// Dominant-channel checks against the known flat-color segments — tolerant of H.264
// compression drift (crf 10, not lossless), never exact-equality.
const isRed = (p) => p.r > 150 && p.g < 100 && p.b < 100;
const isGreen = (p) => p.g > 90 && p.r < 100 && p.b < 100;
const isBlue = (p) => p.b > 150 && p.r < 100 && p.g < 100;
const isYellow = (p) => p.r > 150 && p.g > 150 && p.b < 100;

async function dropFile(page, { base64, name, mime }) {
  const before = await page.locator('[data-el-id]').count();
  await page.evaluate(
    async ({ base64, name, mime }) => {
      const res = await fetch(`data:${mime};base64,${base64}`);
      const file = new File([await res.blob()], name, { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      const target = document.querySelector('[data-testid="artboard"]');
      const rect = target.getBoundingClientRect();
      const clientX = rect.left + rect.width * 0.5;
      const clientY = rect.top + rect.height * 0.5;
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
    },
    { base64, name, mime },
  );
  await page.waitForTimeout(300);
  const after = await page.locator('[data-el-id]').count();
  return { before, after };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await bootDemoTimed(page, BASE_URL);
  const undoBtn = page.getByTitle('تراجع');

  // ============================================================
  // 1. Drag-and-drop import adds a real <video> element, probed metadata is real
  // ============================================================
  const r1 = await dropFile(page, { base64: FIXTURE_B64, name: 'probe.mp4', mime: 'video/mp4' });
  assert(r1.after === r1.before + 1, 'drop .mp4: dropping a real video file adds exactly one new element');
  const frame = page.locator('[data-el-id]').last();
  const frameId = await frame.getAttribute('data-el-id');
  const videoTag = frame.locator('video');
  assert((await videoTag.count()) === 1, 'drop .mp4: the element renders a real <video> element, not an <img>/placeholder box');
  await page.waitForFunction(
    (id) => {
      const v = document.querySelector(`[data-el-id="${id}"] video`);
      return v && v.readyState >= 2;
    },
    frameId,
    { timeout: 5000 },
  );
  const naturalSize = await videoTag.evaluate((v) => ({ w: v.videoWidth, h: v.videoHeight }));
  assert(naturalSize.w === 160 && naturalSize.h === 120, `drop .mp4: real intrinsic size was probed (${naturalSize.w}x${naturalSize.h}), not a guessed default`);

  // ============================================================
  // 2. Live preview shows real, time-varying decoded content (untrimmed: 0-4s)
  // ============================================================
  const sampleCenterPixel = async () =>
    videoTag.evaluate((v) => {
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(v, 0, 0);
      const [r, g, b] = ctx.getImageData(Math.round(c.width / 2), Math.round(c.height / 2), 1, 1).data;
      return { r, g, b };
    });

  const ruler = page.locator('[data-testid="timeline-ruler"]');
  const rulerBox = await ruler.boundingBox();
  const scrubTo = async (frac) => {
    await page.mouse.click(rulerBox.x + Math.max(1, rulerBox.width * frac), rulerBox.y + rulerBox.height / 2);
    await page.waitForTimeout(150);
  };

  // TIMELINE_DURATION is 5s; 0.5s and 2.5s map to fractions 0.1 and 0.5.
  await scrubTo(0.1);
  const pxAt05 = await sampleCenterPixel();
  assert(isRed(pxAt05), `scrub untrimmed t=0.5s: shows real red source content (got ${JSON.stringify(pxAt05)})`);
  await scrubTo(0.5);
  const pxAt25 = await sampleCenterPixel();
  assert(isBlue(pxAt25), `scrub untrimmed t=2.5s: shows real blue source content, proving the live preview actually decodes and seeks (got ${JSON.stringify(pxAt25)})`);

  // ============================================================
  // 3. Trim in/out via the properties panel — one value change each, respected by
  //    scrubbing (the core "respects the trim bounds" requirement)
  // ============================================================
  await page.locator(`[data-testid="layer-name-${frameId}"]`).click();
  await page.waitForTimeout(80);
  const trimIn = page.locator(`[data-testid="video-trim-in-${frameId}"]`);
  const trimOut = page.locator(`[data-testid="video-trim-out-${frameId}"]`);
  await trimIn.fill('1');
  await trimIn.dispatchEvent('change');
  await page.waitForTimeout(80);
  await trimOut.fill('3');
  await trimOut.dispatchEvent('change');
  await page.waitForTimeout(80);
  assert((await trimIn.inputValue()) === '1', 'trim in: the numeric input reflects the set value');
  assert((await trimOut.inputValue()) === '3', 'trim out: the numeric input reflects the set value');

  await scrubTo(0); // document t=0 -> source time = trimIn (1.0s) if trim is honored
  const pxAtTrimStart = await sampleCenterPixel();
  assert(isGreen(pxAtTrimStart), `trim respected at document t=0: shows the trimmed-in frame (green, source~1.0s), not the untrimmed start (red) — got ${JSON.stringify(pxAtTrimStart)}`);

  await scrubTo(0.3); // document t=1.5 -> source time = 1 + 1.5 = 2.5s (blue)
  const pxAtTrimMid = await sampleCenterPixel();
  assert(isBlue(pxAtTrimMid), `trim respected mid-window (document t=1.5 -> source 2.5s): real blue content (got ${JSON.stringify(pxAtTrimMid)})`);
  assert(JSON.stringify(pxAtTrimStart) !== JSON.stringify(pxAtTrimMid), 'scrub: the displayed frame actually changes as the timeline scrubs within the trim window');

  // ============================================================
  // 4. Loop toggle changes playback past the trim window's own duration (2s)
  // ============================================================
  const loopBtn = page.locator(`[data-testid="video-loop-${frameId}"]`);
  await scrubTo(0.86); // document t=4.3 -> non-loop clamps near the trim window's end (blue)
  const pxNonLoop = await sampleCenterPixel();
  assert(isBlue(pxNonLoop), `loop off, t=4.3 (past the 2s trim window): clamps to the window's last content (blue), got ${JSON.stringify(pxNonLoop)}`);
  await loopBtn.click();
  await page.waitForTimeout(100);
  const pxLoop = await sampleCenterPixel();
  assert(isGreen(pxLoop), `loop on, same t=4.3: wraps back into the trim window (green, source~1.3s) instead of clamping — got ${JSON.stringify(pxLoop)}`);
  await loopBtn.click(); // restore for the remaining checks
  await page.waitForTimeout(100);

  // ============================================================
  // 5. Undo on insert — dropping is one undo step
  // ============================================================
  const countBeforeUndo = await page.locator('[data-el-id]').count();
  const r2 = await dropFile(page, { base64: FIXTURE_B64, name: 'undo-probe.mp4', mime: 'video/mp4' });
  assert(r2.after === countBeforeUndo + 1, 'undo setup: the extra probe element was inserted');
  await undoBtn.click();
  await page.waitForTimeout(100);
  assert((await page.locator('[data-el-id]').count()) === countBeforeUndo, 'undo: a single undo removes the whole inserted element (one undo step)');

  // ============================================================
  // 6. Reload survival (real autosave round-trip)
  // ============================================================
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-testid="artboard"]');
  const survived = await page.locator(`[data-el-id="${frameId}"]`).count();
  assert(survived === 1, 'reload: the video element survives a real page reload (autosave round-trip)');
  if (survived) {
    assert((await page.locator(`[data-el-id="${frameId}"] video`).count()) === 1, 'reload: the reloaded element still renders a real <video> (its data survived)');
  }

  // ============================================================
  // 7. The export path: direct calls to the exact production render functions used
  //    by PNG/video export, proving real (non-blank, time-accurate, trim-respecting)
  //    decoded video pixels end up in the composited output.
  // ============================================================
  const exportResult = await page.evaluate(async ({ base64 }) => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const size = { id: 'probe', ar: 'اختبار', en: 'probe', w: 160, h: 120 };
    const palette = { bg: '#000000', fg: '#FFFFFF', ac: '#FFB703' };
    const el = {
      id: 'video-probe',
      type: 'video',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      geo: { x: 0, y: 0, w: 1, h: 1, rotation: 0 },
      src: `data:video/mp4;base64,${base64}`,
      naturalW: 160,
      naturalH: 120,
      durationSec: 4,
      trimIn: 1,
      trimOut: 3,
      volume: 1,
      muted: false,
      loop: false,
      poster: null,
      anim: { preset: 'none', start: 0, duration: 0.6, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
    };

    async function centerPixelAt(time) {
      const blob = await mod.renderArtboardPng({ size, palette, elements: [el], transparent: false, lang: 'ar', time, scale: 1 });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(size.w, size.h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const [r, g, b] = ctx.getImageData(Math.round(size.w / 2), Math.round(size.h / 2), 1, 1).data;
      return { r, g, b };
    }

    const pngAt0_3 = await centerPixelAt(0.3); // source 1.3s -> green
    const pngAt1_3 = await centerPixelAt(1.3); // source 2.3s -> blue

    const framePixels = [];
    const frameBlobsB64 = [];
    await mod.renderArtboardFrames({ size, palette, elements: [el], transparent: false, lang: 'ar', scale: 1 }, [0.3, 0.7, 1.3, 1.7], async (blob) => {
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(size.w, size.h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const [r, g, b] = ctx.getImageData(Math.round(size.w / 2), Math.round(size.h / 2), 1, 1).data;
      framePixels.push({ r, g, b });
      const buf = await blob.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      frameBlobsB64.push(btoa(binary));
    });

    return { pngAt0_3, pngAt1_3, framePixels, frameBlobsB64 };
  }, { base64: FIXTURE_B64 });

  assert(isGreen(exportResult.pngAt0_3), `PNG export: renderArtboardPng composited real green content at time=0.3 (source 1.3s, got ${JSON.stringify(exportResult.pngAt0_3)}), not a blank box`);
  assert(isBlue(exportResult.pngAt1_3), `PNG export: renderArtboardPng composited real blue content at time=1.3 (source 2.3s, got ${JSON.stringify(exportResult.pngAt1_3)})`);
  const expectedFrames = [
    { check: isGreen, label: 'green' }, // 0.3 -> source 1.3
    { check: isGreen, label: 'green' }, // 0.7 -> source 1.7
    { check: isBlue, label: 'blue' }, // 1.3 -> source 2.3
    { check: isBlue, label: 'blue' }, // 1.7 -> source 2.7
  ];
  exportResult.framePixels.forEach((px, i) => {
    assert(expectedFrames[i].check(px), `video frames: frame ${i} matches the expected real decoded color (${expectedFrames[i].label}), got ${JSON.stringify(px)} — proves the MP4/GIF frame sequencer composites real, trim-accurate video content`);
  });

  // ============================================================
  // 8. End-to-end proof: pipe those exact frames through the bundled FFmpeg sidecar
  //    (the same encode videoExport.ts performs) into a real MP4 on disk, then
  //    decode THAT file back and verify its pixels — proving the full export
  //    pipeline, not just the in-browser compositing step.
  // ============================================================
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-video-export-'));
  try {
    exportResult.frameBlobsB64.forEach((b64, i) => {
      fs.writeFileSync(path.join(tmpDir, `frame-${String(i + 1).padStart(5, '0')}.png`), Buffer.from(b64, 'base64'));
    });
    const outPath = path.join(tmpDir, 'out.mp4');
    const encode = spawnSync(
      SIDECAR,
      ['-y', '-framerate', '2', '-i', path.join(tmpDir, 'frame-%05d.png'), '-frames:v', '4', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '18', outPath],
      { encoding: 'utf8' },
    );
    assert(encode.status === 0 && fs.existsSync(outPath), `ffmpeg encode: the real sidecar binary produced a real MP4 file on disk (status=${encode.status})`);

    function extractRawPixel(atSec) {
      const run = spawnSync(SIDECAR, ['-ss', String(atSec), '-i', outPath, '-frames:v', '1', '-vf', 'crop=2:2', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 1024 * 1024 });
      const buf = run.stdout;
      if (!buf || buf.length < 3) return null;
      return { r: buf[0], g: buf[1], b: buf[2] };
    }
    // frames 1-2 (output t=0-1s at 2fps) were the green PNGs, frames 3-4 (t=1-2s) were blue.
    const outPxGreen = extractRawPixel(0.1);
    const outPxBlue = extractRawPixel(1.1);
    assert(outPxGreen && isGreen(outPxGreen), `real MP4 output: decoding frame at t=0.1s of the FFmpeg-encoded file shows real green content (got ${JSON.stringify(outPxGreen)}) — the composited video frames survived the actual encode`);
    assert(outPxBlue && isBlue(outPxBlue), `real MP4 output: decoding frame at t=1.1s of the FFmpeg-encoded file shows real blue content (got ${JSON.stringify(outPxBlue)})`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

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
