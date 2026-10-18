#!/usr/bin/env node
// Covers roadmap item #23: iOS Live Photo export — a still JPEG + MOV pair bound
// by a shared content identifier, with a real timed metadata track marking the
// still frame (see docs/ROADMAP-PROGRESS.md "#23" and docs/CONTROLS.md for the
// full architecture writeup). src/lib/livePhotoExport.ts and
// src-tauri/native/livephoto/main.swift are what this spec exercises.
//
// Two halves, same methodology qa/reference-video.spec.mjs and
// qa/lottie-import.spec.mjs established for Tauri-sidecar-only features:
//
// (1) UI wiring in a plain browser (no Tauri sidecar available there): the
//     format picker, the forced-opaque transparent lockout, the hint note, and
//     the honest synchronous "unavailable" message instead of a fake export.
//
// (2) REAL structural verification of the native tool's output — not UI-only:
//     - Real frames are rendered via the actual `renderArtboardFrames`/
//       `renderArtboardPng` (imported live from the dev server, not
//       reimplemented), proving the still and a given video frame are
//       byte-identical when rendered at the same timeline instant (the
//       determinism the production code relies on to reuse one rendered PNG
//       for both halves).
//     - Those real PNG frames are fed to the ACTUAL compiled sidecar binary
//       (src-tauri/binaries/livephoto-aarch64-apple-darwin — built by
//       `npm run setup:livephoto`) via child_process, exactly like the app's
//       own Tauri shell call does, producing a real JPEG + real MOV on disk.
//     - `exiftool` then asserts, on that real output: the still's
//       `Apple:ContentIdentifier` exists and EXACTLY matches the MOV's
//       `com.apple.quicktime.content.identifier` (mdta keyspace), and that the
//       `still-image-time` timed metadata sample is present at the right
//       timestamp (not just present somewhere).
//     - `ffprobe` asserts the MOV's codec/fps/duration fall inside Apple's
//       documented Live Photo range (H.264/HEVC, 12-30fps, 1.5-3s).
//     - A frame is extracted from the MOV at the still's exact timestamp and
//       compared via `ffmpeg`'s own `psnr` filter against the independently
//       rendered reference PNG of that same instant — proving the video frame
//       genuinely matches the still, not merely that both files exist.
//
// Run: node qa/live-photo-export.spec.mjs   (dev server must be running on :1433)
//
// NOTE on the hardcoded port below: this file is committed pointing at :1420
// (the shared dev port other worktrees/specs assume) even though this round
// was developed running the dev server on :1433 — see docs/CONTROLS.md.
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bootDemo } from './helpers/boot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:1420';
// This worktree's machine is Apple Silicon — same hardcoding precedent as
// qa/reference-video.spec.mjs's FFmpeg sidecar path.
const SIDECAR = path.join(__dirname, '..', 'src-tauri', 'binaries', 'livephoto-aarch64-apple-darwin');

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

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

async function main() {
  // ============================================================
  // (2) Native tool structural verification — the hard part this roadmap item
  // is actually about. Done first so a native-tool failure doesn't get masked
  // by UI assertions still passing.
  // ============================================================
  const fps = 24;
  const durationSeconds = 2.0; // inside Apple's documented 1.5-3s range
  const frameCount = Math.round(durationSeconds * fps); // 48
  const stillIndex = 30; // arbitrary mid-clip frame, not frame 0 — proves real positioning
  const stillRelativeTime = stillIndex / fps; // 1.25s

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await bootDemo(page, BASE_URL);

  // Render real frames through the exact same canvas path PNG/MP4 export use —
  // a solid palette background plus one filled shape, representative of actual
  // Mazij artboard content (low-frequency, unlike an adversarial synthetic test
  // pattern) rather than a contrived worst case.
  const renderResult = await page.evaluate(
    async ({ frameCount, fps, stillRelativeTime }) => {
      const mod = await import('/src/lib/exportArtboard.ts');
      const size = { id: 'probe', ar: 'اختبار', en: 'probe', w: 400, h: 400 };
      const palette = { bg: '#14213D', fg: '#FFFFFF', ac: '#FCA311' };
      const rect = {
        id: 'rect-probe',
        type: 'shape',
        visible: true,
        locked: false,
        opacity: 100,
        maskId: null,
        geo: { x: 0.2, y: 0.3, w: 0.5, h: 0.3, rotation: 0 },
        shape: 'rect',
        fill: '#E63946',
        fillToken: 'ac',
        stroke: null,
        strokeWidth: 0,
        radius: 0.1,
        anim: { preset: 'none', start: 0, duration: 0.6, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
      };
      const spec = { size, palette, elements: [rect], transparent: false, lang: 'ar', scale: 1 };

      const frameTimes = Array.from({ length: frameCount }, (_, i) => i / fps);
      const frames = [];
      await mod.renderArtboardFrames(spec, frameTimes, async (blob, i) => {
        const buf = await blob.arrayBuffer();
        frames[i] = btoa(String.fromCharCode(...new Uint8Array(buf)));
      });

      // Independently rendered (not reused from the loop above) PNG of the exact
      // same instant as the still frame — this is the "PNG export of the same
      // moment" the still/video frame must match.
      const refBlob = await mod.renderArtboardPng({ ...spec, time: stillRelativeTime });
      const refBuf = await refBlob.arrayBuffer();
      const referencePng = btoa(String.fromCharCode(...new Uint8Array(refBuf)));

      return { frames, referencePng };
    },
    { frameCount, fps, stillRelativeTime },
  );

  assert(renderResult.frames.length === frameCount, `renderArtboardFrames produced ${renderResult.frames.length} real PNG frames (expected ${frameCount})`);

  const workDir = mkdtempSync(path.join(tmpdir(), 'mazij-livephoto-qa-'));
  const framesDir = path.join(workDir, 'frames');
  mkdirSync(framesDir, { recursive: true });
  renderResult.frames.forEach((b64, i) => {
    writeFileSync(path.join(framesDir, `frame-${String(i + 1).padStart(5, '0')}.png`), Buffer.from(b64, 'base64'));
  });
  const referencePngPath = path.join(workDir, 'reference.png');
  writeFileSync(referencePngPath, Buffer.from(renderResult.referencePng, 'base64'));

  // Determinism check: the frame the production code would reuse directly as
  // the still's source (frames[stillIndex]) must be byte-identical to an
  // independently rendered PNG of that same instant — proving
  // `renderArtboardFrames`/`renderArtboardPng` are pure functions of (elements,
  // time, size, palette), which is what lets the real pipeline skip a second
  // render call for the still.
  const stillFramePath = path.join(framesDir, `frame-${String(stillIndex + 1).padStart(5, '0')}.png`);
  const stillFrameBytes = readFileSync(stillFramePath);
  const referenceBytes = readFileSync(referencePngPath);
  assert(stillFrameBytes.equals(referenceBytes), 'the video-sequence frame at the still index is byte-identical to an independently rendered PNG of the same instant (deterministic rendering)');

  const contentId = 'E6B3F063-41B0-455E-B61B-89A860F0C0D7';
  const stillJpgPath = path.join(workDir, 'IMG_0001.jpg');
  const movPath = path.join(workDir, 'IMG_0001.MOV');

  const stillRun = run(SIDECAR, ['still', '--in', stillFramePath, '--out', stillJpgPath, '--content-id', contentId, '--quality', 'high']);
  assert(stillRun.status === 0, `native tool 'still' subcommand exits 0 (stderr: ${stillRun.stderr.slice(-500)})`);

  const movRun = run(SIDECAR, ['mov', '--frames-dir', framesDir, '--fps', String(fps), '--out', movPath, '--content-id', contentId, '--still-time', String(stillRelativeTime), '--quality', 'high']);
  assert(movRun.status === 0, `native tool 'mov' subcommand exits 0 (stderr: ${movRun.stderr.slice(-500)})`);

  // --- exiftool: the shared identifier, exactly matching on both files ---
  const stillId = run('exiftool', ['-s', '-s', '-s', '-Apple:ContentIdentifier', stillJpgPath]).stdout.trim();
  assert(stillId === contentId, `still JPEG's Apple:ContentIdentifier equals the requested UUID (got "${stillId}")`);

  const movMeta = run('exiftool', ['-ee', '-G1', movPath]).stdout;
  const movIdLine = movMeta.split('\n').find((l) => /Content Identifier/i.test(l));
  const movId = movIdLine ? movIdLine.split(':').slice(1).join(':').trim() : null;
  assert(movId === contentId, `MOV's com.apple.quicktime.content.identifier EXACTLY matches the still's (got "${movId}", expected "${contentId}")`);

  assert(/Still Image Time\s*:\s*0/.test(movMeta), "MOV contains the still-image-time timed metadata sample (value 0)");

  // Positional check: the still-image-time SAMPLE must sit at the requested
  // timestamp, not merely exist somewhere in the track.
  const metaPackets = run('ffprobe', ['-v', 'error', '-select_streams', 'd', '-show_entries', 'packet=pts_time', '-of', 'default=noprint_wrappers=1:nokey=1', movPath]).stdout.trim();
  const samplePts = parseFloat(metaPackets);
  assert(Math.abs(samplePts - stillRelativeTime) < 1 / fps, `still-image-time sample sits at pts=${samplePts}s, matching the requested still time ${stillRelativeTime}s within one frame`);

  // --- ffprobe: codec/fps/duration inside Apple's documented Live Photo range ---
  const probeOut = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,r_frame_rate', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1', movPath]).stdout;
  assert(/codec_name=h264/.test(probeOut), `MOV video codec is H.264 (${probeOut.match(/codec_name=\S+/)})`);
  const fpsMatch = /r_frame_rate=(\d+)\/(\d+)/.exec(probeOut);
  const measuredFps = fpsMatch ? Number(fpsMatch[1]) / Number(fpsMatch[2]) : NaN;
  assert(measuredFps >= 12 && measuredFps <= 30, `MOV fps (${measuredFps}) is within Apple's documented 12-30fps Live Photo range`);
  const durMatch = /duration=([\d.]+)/.exec(probeOut);
  const measuredDuration = durMatch ? Number(durMatch[1]) : NaN;
  assert(measuredDuration >= 1.5 && measuredDuration <= 3.0, `MOV duration (${measuredDuration}s) is within Apple's documented 1.5-3s Live Photo range`);

  // --- a frame extracted from the MOV at the still's timestamp matches the PNG
  // export of that same instant (allowing for real H.264 lossy compression) ---
  const extractedPath = path.join(workDir, 'extracted.png');
  run('ffmpeg', ['-y', '-i', movPath, '-ss', String(stillRelativeTime), '-frames:v', '1', extractedPath, '-loglevel', 'error']);
  const psnrOut = run('ffmpeg', ['-i', extractedPath, '-i', referencePngPath, '-lavfi', 'psnr', '-f', 'null', '-']).stderr;
  const psnrMatch = /average:([\d.]+)/.exec(psnrOut);
  const avgPsnr = psnrMatch ? Number(psnrMatch[1]) : 0;
  // Threshold chosen with margin below the ~37-41dB this project's own flat-
  // palette-content measurements land on (see docs/CONTROLS.md roadmap-#23
  // section) — well above the ~25-27dB this same tool measured against an
  // adversarial high-frequency synthetic test pattern during development, so
  // this is a real "actually matches" bar, not a rubber stamp.
  assert(avgPsnr > 30, `extracted MOV frame at the still's timestamp matches the reference PNG export of the same instant (PSNR ${avgPsnr.toFixed(1)}dB > 30dB)`);

  rmSync(workDir, { recursive: true, force: true });

  // ============================================================
  // (1) UI wiring — plain browser, no Tauri sidecar available here.
  // ============================================================
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(150);

  await page.locator('[data-testid="export-format-livephoto"]').click();
  await page.waitForTimeout(80);

  let body = await page.locator('body').innerText();
  assert(body.includes('صورة حية'), 'picking the Live Photo format is reflected in the dialog');
  assert(!body.includes('معدّل الإطارات'), 'Live Photo has no fps picker row (fps is fixed internally)');

  const hint = page.locator('[data-testid="export-livephoto-hint"]');
  assert(await hint.isVisible(), 'the Live Photo hint note (still = current playhead, import both files) is shown');

  const transparentToggle = page.locator('[data-testid="export-transparent-toggle"]');
  assert(await transparentToggle.isDisabled(), 'Live Photo: transparent toggle is disabled (the still half is a JPEG, no alpha)');
  const toggleTitle = await transparentToggle.evaluate((el) => el.parentElement?.getAttribute('title'));
  assert(toggleTitle === 'الصورة الحية لا تدعم خلفية شفافة — نصفها الثابت JPEG', 'hovering the locked toggle explains why, with a Live-Photo-specific reason (not the generic MP4 one)');

  // Export attempt in the browser preview: honest and synchronous, straight to
  // "unavailable" — same contract MP4/GIF/reference-video already established,
  // never a fake success or a transient busy state with nothing to encode with.
  await page.getByRole('button', { name: /تصدير \d+ ملف/ }).click();
  body = await page.locator('body').innerText();
  assert(body.includes('أداة AVFoundation'), 'browser preview shows the Live-Photo-specific "needs the packaged macOS app" message');
  assert(!body.includes('جاري التصدير'), 'no fake "exporting…" busy state is ever shown');
  assert(!body.includes('تم التصدير'), 'no fake "exported" success state');

  await page.keyboard.press('Escape');

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
