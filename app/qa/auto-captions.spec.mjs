#!/usr/bin/env node
// Covers roadmap item #15: "ترجمة تلقائية" (auto-captions) — real on-device speech
// recognition (Whisper-tiny.en, via `@huggingface/transformers` running on
// `onnxruntime-web`, see docs/CONTROLS.md's auto-captions stage for why a
// higher-level wrapper was chosen over hand-rolling Whisper's feature extraction/
// tokenizer/decoder) turned into real `TextElement`s on the document timeline, each
// shown only during its own transcript window via the existing opacity-keyframe-
// track mechanism (no new "clip visibility" concept). Scope under test:
// (1) the model registry (src/lib/localModels.ts) — whisper-tiny-en is a real,
//     downloadable, MIT-licensed 7-part model, each part with a verifiable sha256;
// (2) pure segment->timeline math (src/lib/autoCaptions.ts's buildCaptionElements) —
//     exact anim.start/duration + opacity-track keyframe values, and the documented
//     "segment starts at/after the fixed 5s timeline" drop case;
// (3) the real pipeline end-to-end against a real MP4 fixture with real speech
//     audio: real browser-side audio extraction (Web Audio decode+resample, the
//     path this dev/QA build actually exercises — no FFmpeg sidecar outside Tauri),
//     a real network download+sha256-verify of the model (first run), and real
//     Whisper inference producing a real (if imperfect — tiny model, documented)
//     transcript with real timestamps;
// (4) the real live UI: dropping the fixture video, clicking "إنشاء ترجمة تلقائية",
//     the resulting caption TextElement actually appearing with real text, actually
//     fading in/out at the right times (live DOM opacity), surviving a single undo;
// (5) export reuse: the exact same caption element fed through the real
//     `renderArtboardPng` (opacity-driven show/hide survives export) and — proving
//     a caption is a plain, fully general TextElement — rendered again with its
//     text swapped to Arabic without error.
//
// Run: node qa/auto-captions.spec.mjs   (dev server must be running on :1420)
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { bootDemoTimed } from './helpers/boot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// NOTE (video branch, phase 1): `TIMELINE_DURATION` is gone — the document's length
// is derived from its clips now, and `buildCaptionElements` takes the limit as an
// argument instead of reading a module-level constant. In the app that limit is the
// transcribed video's own trimmed window (`PropsTab`), not an editor ceiling. This
// spec pins the same arithmetic it always did by passing `CAPTION_LIMIT`, which is
// the 5 the constant used to hold, so the fixture and its expectations are unchanged.
const CAPTION_LIMIT = 5;
const BASE_URL = 'http://localhost:1420';
const FIXTURE = path.join(__dirname, 'fixtures', 'auto-captions-ground-truth.mp4');
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

// ============================================================
// 1 & 2. Pure registry + segment->timeline math, no network, deterministic.
// ============================================================
async function testPureFunctions(page) {
  const r = await page.evaluate(async (CAPTION_LIMIT) => {
    const { LOCAL_MODELS, modelById } = await import('/src/lib/localModels.ts');
    const { buildCaptionElements } = await import('/src/lib/autoCaptions.ts');

    const whisper = modelById('whisper-tiny-en');
    const registryOk = !!(
      whisper &&
      whisper.downloadable &&
      whisper.task === 'speech-to-text' &&
      whisper.license === 'MIT' &&
      Array.isArray(whisper.parts) &&
      whisper.parts.length === 7 &&
      whisper.parts.every((p) => p.sha256.length === 64 && p.sizeBytes > 0 && p.url.includes(p.filename)) &&
      whisper.parts.reduce((s, p) => s + p.sizeBytes, 0) === whisper.sizeBytes &&
      LOCAL_MODELS.filter((m) => m.task === 'speech-to-text').length === 1
    );

    const segments = [
      { start: 0.2, end: 1.0, text: 'Hello' },
      { start: CAPTION_LIMIT - 0.01, end: CAPTION_LIMIT + 0.5, text: 'dropped' },
    ];
    const elements = buildCaptionElements(segments, CAPTION_LIMIT);
    const el = elements[0];
    const track = el?.anim.tracks.opacity ?? [];
    const duration = 1.0 - 0.2;
    const fadeFrac = Math.min(0.25, 0.08 / duration);

    const mathOk = !!(
      elements.length === 1 && // the second segment (>= the limit) is dropped, not clipped
      el.type === 'text' &&
      el.text === 'Hello' &&
      el.halign === 'center' &&
      el.valign === 'middle' &&
      Math.abs(el.anim.start - 0.2) < 1e-6 &&
      Math.abs(el.anim.duration - duration) < 1e-6 &&
      track.length === 4 &&
      // Keyframe time is seconds now, not a fraction of the clip — so the same four
      // positions are the same four fractions **times the duration**. The fade is
      // still a proportion of the clip by nature (capped at a quarter of it), and
      // that proportion still lives in `captionOpacityTrack`; what changed is that
      // it is multiplied out at the one boundary between the two conventions
      // instead of being stored unresolved.
      track[0].time === 0 &&
      track[0].value === 0 &&
      Math.abs(track[1].time - fadeFrac * duration) < 1e-6 &&
      track[1].value === 1 &&
      Math.abs(track[2].time - (1 - fadeFrac) * duration) < 1e-6 &&
      track[2].value === 1 &&
      Math.abs(track[3].time - duration) < 1e-6 &&
      track[3].value === 0
    );

    return { registryOk, mathOk, dump: { el, track } };
  }, CAPTION_LIMIT);

  assert(r.registryOk, `registry: whisper-tiny-en is a real downloadable MIT 7-part speech-to-text model, each part with a full sha256 and real size summing to the model total, and it is the only speech-to-text entry`);
  assert(r.mathOk, `pure fn: buildCaptionElements produces exact anim.start/duration + a 4-keyframe fade-in/fade-out opacity track, and drops a segment starting at/after the fixed timeline length (${JSON.stringify(r.dump)})`);
}

// ============================================================
// 3. Real end-to-end: real browser-side audio extraction + real Whisper inference
//    against the real fixture (real speech audio muxed with AAC into the MP4).
// ============================================================
async function testRealTranscription(page) {
  const r = await page.evaluate(async ({ b64, CAPTION_LIMIT }) => {
    const { modelById, isModelDownloaded, downloadModel } = await import('/src/lib/localModels.ts');
    const { extractAudioSamples, transcribeAudio, buildCaptionElements } = await import('/src/lib/autoCaptions.ts');

    const res = await fetch(`data:video/mp4;base64,${b64}`);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });

    const model = modelById('whisper-tiny-en');
    let downloadError = null;
    if (!(await isModelDownloaded(model))) {
      try {
        await downloadModel(model);
      } catch (err) {
        downloadError = err.message;
      }
    }

    let samples = null;
    let samplesErr = null;
    try {
      samples = await extractAudioSamples({ src: dataUrl, trimIn: 0, trimOut: 3.59 });
    } catch (err) {
      samplesErr = err.message;
    }

    let segments = null;
    let transcribeErr = null;
    if (samples) {
      try {
        segments = await transcribeAudio(samples);
      } catch (err) {
        transcribeErr = err.message;
      }
    }

    const elements = segments ? buildCaptionElements(segments, CAPTION_LIMIT) : null;

    return {
      downloadError,
      samplesLen: samples?.length ?? 0,
      samplesErr,
      segments,
      transcribeErr,
      elements,
      CAPTION_LIMIT,
    };
  }, { b64: FIXTURE_B64, CAPTION_LIMIT });

  assert(!r.downloadError, `real e2e: Whisper model actually downloaded + sha256-verified over the network without error (${r.downloadError})`);
  assert(!r.samplesErr, `real e2e: real browser Web-Audio decode+resample of the fixture's real AAC audio track succeeded (${r.samplesErr})`);
  // 3.59s @ 16kHz = 57440 samples exactly — proves real resampling to Whisper's
  // required rate, not a pass-through of the source's native sample rate.
  assert(r.samplesLen === 57440, `real e2e: extracted audio is real 16kHz mono PCM of the fixture's real duration (got ${r.samplesLen} samples, expected 57440)`);
  assert(!r.transcribeErr, `real e2e: real Whisper-tiny.en inference completed without error (${r.transcribeErr})`);
  assert(Array.isArray(r.segments) && r.segments.length >= 1, `real e2e: real transcription returned at least one real segment (${JSON.stringify(r.segments)})`);
  const seg = r.segments?.[0];
  assert(seg && seg.text.length > 3 && /hello/i.test(seg.text), `real e2e: the transcribed text contains a recognizable real word from the real speech audio — not empty/garbage (got "${seg?.text}")`);
  assert(seg && seg.start >= 0 && seg.end > seg.start && seg.end <= r.CAPTION_LIMIT, `real e2e: segment timestamps are real and within the document's fixed timeline (${JSON.stringify(seg)})`);
  assert(Array.isArray(r.elements) && r.elements.length === r.segments.length, 'real e2e: every real segment became a real caption TextElement');

  return r.elements[0];
}

// ============================================================
// 4. Real live UI: drop the real fixture, click the real button, verify the real
//    DOM — added caption text, timeline-driven fade in/out, single-step undo.
// ============================================================
async function dropVideoFixture(page) {
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
    { base64: FIXTURE_B64, name: 'captions-probe.mp4', mime: 'video/mp4' },
  );
  await page.waitForTimeout(400);
  const after = await page.locator('[data-el-id]').count();
  assert(after === before + 1, 'live UI: dropping the real fixture video added exactly one new element');
  return before;
}

async function testLiveUI(page) {
  const countBeforeDrop = await dropVideoFixture(page);

  const captionsBtn = page.locator('[data-testid="auto-captions-btn"]');
  assert((await captionsBtn.count()) === 1, 'live UI: the dropped+selected video shows a real "إنشاء ترجمة تلقائية" button in its properties panel');
  assert((await page.locator('text=يعمل على جهازك').count()) > 0, 'live UI: the on-device privacy badge is actually rendered for captions too, not just background removal');

  await captionsBtn.click();
  await page.waitForFunction(
    (expected) => document.querySelectorAll('[data-el-id]').length === expected || document.querySelector('[data-testid="auto-captions-error"]'),
    countBeforeDrop + 2,
    { timeout: 90000 },
  );
  await page.waitForTimeout(150);

  const errEl = page.locator('[data-testid="auto-captions-error"]');
  assert((await errEl.count()) === 0, `live UI: caption generation completed without hitting the error state${(await errEl.count()) ? ' (' + (await errEl.textContent()) + ')' : ''}`);
  assert((await page.locator('[data-el-id]').count()) === countBeforeDrop + 2, 'live UI: exactly one real caption TextElement was added alongside the video element');

  const captionFrame = page.locator('[data-el-id]').last();
  const captionId = await captionFrame.getAttribute('data-el-id');
  const captionText = (await captionFrame.textContent()) ?? '';
  assert(/hello/i.test(captionText), `live UI: the added caption element's real DOM text contains a recognizable transcribed word (got "${captionText}")`);

  // Scrub inside the caption's real window (its speech starts at the clip's start) —
  // real opacity should be at/near 1, driven by the real opacity keyframe track.
  const ruler = page.locator('[data-testid="timeline-ruler"]');
  const rb = await ruler.boundingBox();
  await page.mouse.click(rb.x + rb.width * 0.3, rb.y + rb.height / 2);
  await page.waitForTimeout(80);
  const opacityInside = Number(await page.locator(`[data-el-id="${captionId}"]`).evaluate((el) => getComputedStyle(el).opacity));
  assert(opacityInside > 0.9, `live UI: scrubbed inside the caption's transcript window — real rendered opacity is ~1 (got ${opacityInside})`);

  // Scrub past the caption's own duration (but still inside the fixed 5s document
  // timeline) — the fade-out keyframe should have brought opacity back to ~0.
  await page.mouse.click(rb.x + rb.width * 0.97, rb.y + rb.height / 2);
  await page.waitForTimeout(80);
  const opacityOutside = Number(await page.locator(`[data-el-id="${captionId}"]`).evaluate((el) => getComputedStyle(el).opacity));
  assert(opacityOutside < 0.05, `live UI: scrubbed past the caption's own transcript window — real rendered opacity faded back to ~0 (got ${opacityOutside}), proving genuine show/hide, not "stays visible forever"`);

  // A single undo removes exactly the caption element, nothing else.
  const undoBtn = page.getByTitle('تراجع');
  await undoBtn.click();
  await page.waitForTimeout(150);
  assert((await page.locator('[data-el-id]').count()) === countBeforeDrop + 1, 'live UI: a single undo removes exactly the caption element (one undo step), leaving the video element in place');
}

// ============================================================
// 5. Export reuse + Arabic proof: the real transcribed caption element through the
//    real PNG exporter, both for its real (English) text and with the text swapped
//    to Arabic — proving it is a plain, fully general TextElement, not a special-
//    cased overlay only understood at export time.
// ============================================================
async function testExportReuseAndArabic(page, realCaptionElement) {
  const r = await page.evaluate(async ({ el }) => {
    const { renderArtboardPng } = await import('/src/lib/exportArtboard.ts');
    const size = { id: 'probe', ar: 'اختبار', en: 'probe', w: 480, h: 270 };
    const palette = { bg: '#000000', fg: '#FFFFFF', ac: '#FFB703' };

    async function nonBackgroundCount(element, time) {
      const blob = await renderArtboardPng({ size, palette, elements: [element], transparent: false, lang: 'ar', time, scale: 1 });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(size.w, size.h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const x0 = Math.round(element.geo.x * size.w);
      const y0 = Math.round(element.geo.y * size.h);
      const w = Math.round(element.geo.w * size.w);
      const h = Math.round(element.geo.h * size.h);
      const d = ctx.getImageData(x0, y0, w, h).data;
      let count = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 40 || d[i + 1] > 40 || d[i + 2] > 40) count++; // not near-black background
      }
      return count;
    }

    const insideCount = await nonBackgroundCount(el, Math.min(el.anim.start + el.anim.duration / 2, el.anim.start + el.anim.duration - 0.05));
    const outsideCount = await nonBackgroundCount(el, Math.min(4.95, el.anim.start + el.anim.duration + 0.5));

    const arabicEl = { ...el, text: 'مرحبًا بالعالم من مزيج' };
    let arabicError = null;
    let arabicCount = 0;
    try {
      arabicCount = await nonBackgroundCount(arabicEl, el.anim.start + el.anim.duration / 2);
    } catch (err) {
      arabicError = err.message;
    }

    return { insideCount, outsideCount, arabicError, arabicCount };
  }, { el: realCaptionElement });

  assert(r.insideCount > 20, `export reuse: renderArtboardPng (the real PNG exporter) draws real non-background caption pixels inside its real transcript window (count=${r.insideCount})`);
  assert(r.outsideCount === 0, `export reuse: the same exporter shows zero caption pixels once the real opacity track has faded it back to 0 past its window (count=${r.outsideCount})`);
  assert(!r.arabicError, `Arabic proof: a caption element is a plain TextElement — swapping its text to Arabic renders through the exact same exporter without error (${r.arabicError})`);
  assert(r.arabicCount > 20, `Arabic proof: the Arabic-swapped caption renders real non-background glyph pixels too (count=${r.arabicCount})`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await bootDemoTimed(page, BASE_URL);

  await testPureFunctions(page);
  const realCaptionElement = await testRealTranscription(page);
  await testLiveUI(page);
  if (realCaptionElement) await testExportReuseAndArabic(page, realCaptionElement);

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
