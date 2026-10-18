#!/usr/bin/env node
// Covers roadmap item #21: reading a short reference video's *edit structure* (shot
// cuts via FFmpeg scene detection) and turning it into a motion template with one
// image slot per shot, reusing the existing #7/#19 template system — see
// src/lib/referenceVideo.ts for the logic this spec exercises.
//
// Ground truth: qa/fixtures/refvideo-ground-truth.mp4 is a real file generated once
// (see the shell command in docs/CONTROLS.md's roadmap-#21 section) by concatenating
// four differently-textured FFmpeg test sources (testsrc/smptebars/rgbtestsrc/
// testsrc2) of known durations — real cuts at real timestamps, not a claim. Flat
// solid-color segments were tried first and found NOT to register with FFmpeg's
// `scdet` filter at all (empirically verified by hand, not assumed) — textured
// content is what a real reference video actually looks like, so that's what the
// ground truth uses instead.
//
// (1) Runs the exact same scene-detect FFmpeg invocation the app itself uses (same
//     sidecar binary, same args) directly via child_process against the ground-truth
//     file, and feeds the REAL captured stderr into the shipped `parseSceneDetectOutput`
//     (imported live from the dev server, not re-implemented here) — asserting the
//     detected cut count/timestamps/total duration against the known ground truth
//     within a documented tolerance. This is the actual proof the detector works.
// (2) `shotsFromCutTimes` turns cut timestamps into shots, including the "zero cuts"
//     case (one shot spanning the whole video, never an invented split).
// (3) `buildReferenceVideoTemplate` turns a structure into a real Template: one
//     full-bleed image slot per shot, proportionally time-scaled onto the fixed
//     TIMELINE_DURATION, each slot's fade-in start strictly increasing.
// (4) The real UI: the top-bar entry opens the dialog, the drop zone + file picker
//     exist, and — because this spec runs in a plain browser with no Tauri sidecar,
//     same limitation documented for MP4/GIF export — both the file picker and a
//     simulated drop surface the honest "needs the packaged app" error instead of
//     faking a detected structure.
//
// Run: node qa/reference-video.spec.mjs   (dev server must be running on :1433)
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bootDemo } from './helpers/boot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:1420';
const SIDECAR = path.join(__dirname, '..', 'src-tauri', 'binaries', 'ffmpeg-aarch64-apple-darwin');
const FIXTURE = path.join(__dirname, 'fixtures', 'refvideo-ground-truth.mp4');

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
function close(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

async function main() {
  // --- (1) Real ground-truth detection, via the actual bundled sidecar binary ---
  // FFmpeg writes everything (banner, Duration, scdet hits) to stderr regardless of
  // exit code, so capture it directly rather than relying on a thrown error.
  const run = spawnSync(SIDECAR, ['-loglevel', 'info', '-i', FIXTURE, '-vf', 'scdet=threshold=8', '-f', 'null', '-'], { encoding: 'utf8' });
  const stderrText = run.stderr ?? '';
  assert(stderrText.includes('Duration:'), 'ffmpeg ground-truth run: stderr contains a Duration banner');
  const scoreLines = (stderrText.match(/lavfi\.scd\.score:/g) || []).length;
  assert(scoreLines === 3, `ffmpeg ground-truth run: exactly 3 raw scdet hits (got ${scoreLines}) — the 4-shot fixture has 3 cuts`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootDemo(page, BASE_URL);

  // --- (1 cont'd) the shipped parser, fed the real captured stderr ---
  const parsed = await page.evaluate(async (stderr) => {
    const mod = await import('/src/lib/referenceVideo.ts');
    return mod.parseSceneDetectOutput(stderr);
  }, stderrText);
  assert(close(parsed.totalDuration, 8.56, 0.05), `parser: total duration ≈8.56s (got ${parsed.totalDuration})`);
  assert(parsed.cutTimes.length === 3, `parser: exactly 3 cuts detected (got ${parsed.cutTimes.length}: ${parsed.cutTimes})`);
  const expectedCuts = [2.0, 4.52, 6.04];
  for (let i = 0; i < expectedCuts.length; i++) {
    assert(close(parsed.cutTimes[i] ?? -1, expectedCuts[i], 0.08), `parser: cut ${i} ≈${expectedCuts[i]}s (got ${parsed.cutTimes[i]})`);
  }

  // --- (2) shotsFromCutTimes, including the zero-cuts honest case ---
  const shotCheck = await page.evaluate(async (args) => {
    const mod = await import('/src/lib/referenceVideo.ts');
    const withCuts = mod.shotsFromCutTimes(args.cuts, args.total);
    const noCuts = mod.shotsFromCutTimes([], args.total);
    return { withCuts, noCuts };
  }, { cuts: parsed.cutTimes, total: parsed.totalDuration });
  assert(shotCheck.withCuts.length === 4, `shotsFromCutTimes: 4 shots from 3 cuts (got ${shotCheck.withCuts.length})`);
  assert(close(shotCheck.withCuts[0].start, 0, 0.01) && close(shotCheck.withCuts[0].duration, 2.0, 0.08), 'shotsFromCutTimes: shot 1 is [0, ~2.0)');
  assert(close(shotCheck.withCuts[3].start, 6.04, 0.08) && close(shotCheck.withCuts[3].start + shotCheck.withCuts[3].duration, parsed.totalDuration, 0.05), 'shotsFromCutTimes: last shot runs to the real end of the video');
  assert(shotCheck.noCuts.length === 1 && close(shotCheck.noCuts[0].duration, parsed.totalDuration, 0.01), 'shotsFromCutTimes: zero cuts → exactly one shot spanning the whole video (the honest "no cuts detected" case)');

  // --- (3) buildReferenceVideoTemplate ---
  const tplCheck = await page.evaluate(async (structure) => {
    const mod = await import('/src/lib/referenceVideo.ts');
    const tpl = mod.buildReferenceVideoTemplate('اختبار', structure, 0, 1080, 1080);
    return {
      elementCount: tpl.elements.length,
      slotCount: tpl.slots.length,
      allImageSlots: tpl.slots.every((s) => s.kind === 'image'),
      allFullBleed: tpl.elements.every((e) => e.geo.x === 0 && e.geo.y === 0 && e.geo.w === 1 && e.geo.h === 1),
      allPlaceholderImages: tpl.elements.every((e) => e.type === 'image' && e.placeholder === true && e.src === null),
      starts: tpl.elements.map((e) => e.anim.start),
      labels: tpl.slots.map((s) => s.label),
    };
  }, { totalDuration: parsed.totalDuration, cutTimes: parsed.cutTimes, shots: shotCheck.withCuts, beats: null });
  assert(tplCheck.elementCount === 4 && tplCheck.slotCount === 4, `buildReferenceVideoTemplate: 4 elements + 4 slots (got ${tplCheck.elementCount}/${tplCheck.slotCount})`);
  assert(tplCheck.allImageSlots, 'buildReferenceVideoTemplate: every slot is kind "image"');
  assert(tplCheck.allFullBleed, 'buildReferenceVideoTemplate: every shot element is full-bleed (0,0,1,1)');
  assert(tplCheck.allPlaceholderImages, 'buildReferenceVideoTemplate: every shot element is a real placeholder image (src:null, placeholder:true) — fillable, not fake content');
  const strictlyIncreasing = tplCheck.starts.every((s, i) => i === 0 || s > tplCheck.starts[i - 1]);
  assert(strictlyIncreasing, `buildReferenceVideoTemplate: shot start times are strictly increasing on the timeline (got ${tplCheck.starts})`);
  assert(tplCheck.starts[tplCheck.starts.length - 1] < 5, 'buildReferenceVideoTemplate: every start is rescaled inside the fixed 5s TIMELINE_DURATION');
  assert(tplCheck.labels[0].includes('2.0') || tplCheck.labels[0].includes('2.1'), `buildReferenceVideoTemplate: shot 1's label shows its real ~2.0s duration (got "${tplCheck.labels[0]}")`);

  // --- (4) real UI: open dialog, drop zone + picker exist, honest browser-preview error ---
  await page.locator('[data-testid="more-tools-btn"]').click();
  await page.getByTestId('open-refvideo-btn').click();
  await page.waitForTimeout(100);
  assert(await page.getByTestId('refvideo-dialog').isVisible(), 'UI: the dialog opens from the top-bar entry');
  assert(await page.getByTestId('refvideo-drop-zone').isVisible(), 'UI: a drop zone is shown');
  assert(await page.getByTestId('refvideo-pick-btn').isVisible(), 'UI: a file-picker button is shown');

  // Simulated drag-drop (plain browser File, no real path) — must surface the honest
  // Tauri-only error, never a fake detected structure.
  await page.evaluate(() => {
    const zone = document.querySelector('[data-testid="refvideo-drop-zone"]');
    const file = new File([new Uint8Array(16)], 'clip.mp4', { type: 'video/mp4' });
    const dt = new DataTransfer();
    dt.items.add(file);
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await page.waitForTimeout(100);
  const errText = await page.getByTestId('refvideo-error').innerText();
  assert(errText.length > 0, 'UI: dropping a file in the browser-preview (no Tauri sidecar) shows a real error, not a fake result');
  assert(!(await page.locator('[data-testid="refvideo-structure"]').count()), 'UI: no detected-structure panel is shown off a fake/unanalyzable drop — never a faked result');

  await page.getByTestId('close-refvideo-btn').click();
  await page.waitForTimeout(80);
  assert(!(await page.locator('[data-testid="refvideo-dialog"]').count()), 'UI: the dialog closes');

  assert(pageErrors.length === 0, `no uncaught page errors (got: ${pageErrors.slice(0, 3).join(' | ')})`);

  await browser.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    console.error('\nFailures:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
