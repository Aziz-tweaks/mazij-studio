#!/usr/bin/env node
// Covers roadmap item #13: Lottie import as a real playback element — file-picker
// and drag-and-drop import of both plain `.json` and zipped `.lottie` (dotLottie)
// containers, live scrubbing (the rendered frame actually changes with the
// timeline), replace/loop controls as single undo steps, autosave reload survival,
// and — the hard requirement — that the exact production render functions used by
// PNG and video/GIF export (`renderArtboardPng`/`renderArtboardFrames` in
// `src/lib/exportArtboard.ts`) actually composite real, moving Lottie pixels rather
// than a blank box. Same "call the real function, read real pixels" methodology
// qa/anim-tracks.spec.mjs already established for the per-property track renderer.
//
// Run: node qa/lottie-import.spec.mjs   (dev server must be running on :1432)
import { chromium } from 'playwright';
import { zipSync } from 'fflate';
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

// A small, real, hand-authored bodymovin/Lottie document: a 60x60 red rounded-rect
// shape layer whose position keyframes from x=40 to x=160 over 60 frames at 30fps
// (2 real seconds) inside a 200x200 canvas — enough to prove both "it renders" (a
// red pixel appears where none was) and "it animates" (the red pixel's x position
// actually moves as time advances), not a static/blank result either way.
function makeLottieJson() {
  return {
    v: '5.9.0',
    fr: 30,
    ip: 0,
    op: 60,
    w: 200,
    h: 200,
    nm: 'probe',
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'rect',
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 0 },
          p: {
            a: 1,
            k: [
              { t: 0, s: [40, 100, 0], e: [160, 100, 0], i: { x: [0.5], y: [0.5] }, o: { x: [0.5], y: [0.5] } },
              { t: 60, s: [160, 100, 0] },
            ],
          },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] },
        },
        ao: 0,
        shapes: [
          {
            ty: 'gr',
            it: [
              { ty: 'rc', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [60, 60] }, r: { a: 0, k: 0 } },
              { ty: 'fl', c: { a: 0, k: [1, 0, 0, 1] }, o: { a: 0, k: 100 } },
              { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
            ],
          },
        ],
        ip: 0,
        op: 60,
        st: 0,
        bm: 0,
      },
    ],
  };
}

function makeDotLottieBase64(json) {
  const enc = (s) => new TextEncoder().encode(s);
  const zipped = zipSync({
    'manifest.json': enc(JSON.stringify({ animations: [{ id: 'probe' }] })),
    'animations/probe.json': enc(JSON.stringify(json)),
  });
  return Buffer.from(zipped).toString('base64');
}

async function dropFile(page, { text, base64, name, mime }) {
  const before = await page.locator('[data-el-id]').count();
  await page.evaluate(
    async ({ text, base64, name, mime }) => {
      let file;
      if (base64) {
        const res = await fetch(`data:${mime};base64,${base64}`);
        file = new File([await res.blob()], name, { type: mime });
      } else {
        file = new File([text], name, { type: mime });
      }
      const dt = new DataTransfer();
      dt.items.add(file);
      const target = document.querySelector('[data-testid="artboard"]');
      const rect = target.getBoundingClientRect();
      const clientX = rect.left + rect.width * 0.5;
      const clientY = rect.top + rect.height * 0.5;
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
    },
    { text, base64, name, mime },
  );
  await page.waitForTimeout(250);
  const after = await page.locator('[data-el-id]').count();
  return { before, after };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const LOTTIE = makeLottieJson();
  const LOTTIE_JSON_TEXT = JSON.stringify(LOTTIE);
  const DOTLOTTIE_B64 = makeDotLottieBase64(LOTTIE);

  await bootDemoTimed(page, BASE_URL);
  const undoBtn = page.getByTitle('تراجع');

  // Park the playhead at zero before the two "paints red at the shape's *start*
  // position" probes below (18 October 2026). The probe fixture is a red shape that
  // travels left→right across a looping 2s animation, and both probes sample
  // x = 20% of the canvas — i.e. they only hold while the Lottie clock sits near the
  // loop's start. That used to be true only by coincidence: every document opened at
  // `t = 2.2`, and 2.2 % 2 = 0.2s ≈ frame 6 of 60. Opening a document now parks the
  // playhead where every entrance clip has settled instead (1.9s on this poster),
  // which is late in the Lottie's own loop — frame ~57, red at ~80% — so the probe's
  // assumption has to be stated rather than inherited. Driven through the real ruler,
  // the same gesture the scrub section further down uses.
  {
    const rulerBox = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
    await page.mouse.click(rulerBox.x + 1, rulerBox.y + rulerBox.height / 2);
    await page.waitForTimeout(80);
  }

  // ============================================================
  // 1. Drag-and-drop import — plain .json
  // ============================================================
  const r1 = await dropFile(page, { text: LOTTIE_JSON_TEXT, name: 'probe.json', mime: 'application/json' });
  assert(r1.after === r1.before + 1, 'drop .json: dropping a plain Lottie JSON file adds exactly one new element');
  const frame = page.locator('[data-el-id]').last();
  const frameId = await frame.getAttribute('data-el-id');
  await page.waitForTimeout(150); // lottie-web's first canvas paint

  const canvas = frame.locator('canvas');
  assert((await canvas.count()) === 1, 'drop .json: the element renders a real <canvas> (lottie-web canvas renderer), not an <img>/placeholder');
  const hasRedAtStart = await canvas.evaluate((c) => {
    const ctx = c.getContext('2d');
    // probe near the shape's start position (left side of the box)
    const x = Math.round(c.width * 0.2);
    const y = Math.round(c.height * 0.5);
    const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
    return a > 100 && r > 150 && g < 100 && b < 100;
  });
  assert(hasRedAtStart, 'drop .json: the imported animation actually paints real red content, not a blank/transparent box');

  // ============================================================
  // 2. Drag-and-drop import — zipped .lottie (dotLottie) container
  // ============================================================
  const r2 = await dropFile(page, { base64: DOTLOTTIE_B64, name: 'probe.lottie', mime: 'application/zip' });
  assert(r2.after === r2.before + 1, 'drop .lottie: dropping a zipped dotLottie container adds exactly one new element');
  const frame2 = page.locator('[data-el-id]').last();
  await page.waitForTimeout(150);
  const hasRed2 = await frame2.locator('canvas').evaluate((c) => {
    const ctx = c.getContext('2d');
    const [, , , a] = ctx.getImageData(Math.round(c.width * 0.2), Math.round(c.height * 0.5), 1, 1).data;
    return a > 100;
  });
  assert(hasRed2, 'drop .lottie: the unzipped dotLottie animation renders real content, proving the fflate extraction path works, not just plain .json');
  // Left on the artboard deliberately — removing a React-managed DOM node directly
  // (rather than through a real app action) would desync React and crash later renders.

  // ============================================================
  // 3. File-picker import via the "Lottie" tool
  // ============================================================
  const countBeforePicker = await page.locator('[data-el-id]').count();
  await page.locator('button', { hasText: 'Lottie' }).first().click();
  await page.waitForTimeout(80);
  // Selecting the tool only arms it — same as the "image" tool, the actual file
  // dialog opens on the next click on the empty artboard background.
  await page.once('filechooser', (fc) => fc.setFiles({ name: 'probe2.json', mimeType: 'application/json', buffer: Buffer.from(LOTTIE_JSON_TEXT) }));
  const artboard = page.locator('[data-testid="artboard"]');
  const abBox = await artboard.boundingBox();
  await page.mouse.click(abBox.x + abBox.width * 0.97, abBox.y + abBox.height * 0.5);
  await page.waitForTimeout(250);
  assert((await page.locator('[data-el-id]').count()) === countBeforePicker + 1, 'file picker: choosing a file via the Lottie tool adds a new element');

  // ============================================================
  // 4. Scrubbing the timeline changes the rendered frame (live, not frozen)
  // ============================================================
  await page.waitForTimeout(150);
  const liveCanvas = page.locator(`[data-el-id="${frameId}"] canvas`);
  const sampleRedX = async () => {
    return liveCanvas.evaluate((c) => {
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let x = 0; x < c.width; x++) {
        const i = (Math.round(c.height / 2) * c.width + x) * 4;
        if (d[i + 3] > 100 && d[i] > 150 && d[i + 1] < 100) return x;
      }
      return -1;
    });
  };
  // Scrub to t=0 explicitly first (simple-mode default may already sit at 0).
  const ruler = page.locator('[data-testid="timeline-ruler"]');
  const rulerBox = await ruler.boundingBox().catch(() => null);
  let xAtStart;
  let xAtMid;
  if (rulerBox) {
    await page.mouse.click(rulerBox.x + 1, rulerBox.y + rulerBox.height / 2);
    await page.waitForTimeout(100);
    xAtStart = await sampleRedX();
    await page.mouse.click(rulerBox.x + rulerBox.width * 0.3, rulerBox.y + rulerBox.height / 2);
    await page.waitForTimeout(100);
    xAtMid = await sampleRedX();
    assert(xAtStart >= 0 && xAtMid >= 0, 'scrub: the red shape is visible at both sampled timeline positions');
    assert(xAtStart !== xAtMid, `scrub: the live rendered frame actually changes as the timeline scrubs (x@start=${xAtStart}, x@mid=${xAtMid})`);
  } else {
    assert(false, 'scrub: could not find the timeline ruler to drive the scrub gesture');
  }

  // ============================================================
  // 5. Loop toggle + replace (keeps frame, one undo step)
  // ============================================================
  // Pin the timeline to t=0 first so the replace/undo content checks below sample a
  // predictable, known shape position (same convention test #1 relies on).
  await page.mouse.click(rulerBox.x + 1, rulerBox.y + rulerBox.height / 2);
  await page.waitForTimeout(100);
  // Select via the Timeline's layer row (`data-layer-id`), not a stage click — by now
  // several lottie elements share roughly the same drop position on the artboard, and
  // a stage click would hit whichever one is visually on top, not necessarily `frameId`.
  await page.locator(`[data-testid="layer-name-${frameId}"]`).click();
  await page.waitForTimeout(80);
  const loopRow = page.locator('label', { hasText: 'تكرار الحركة' });
  const loopToggle = loopRow.locator('button');
  const loopBefore = await loopToggle.innerText();
  await loopToggle.click();
  await page.waitForTimeout(80);
  const loopAfter = await loopToggle.innerText();
  assert(loopAfter !== loopBefore, 'loop toggle: clicking the loop control actually changes its on/off state');

  const samplePixelAt02 = () =>
    liveCanvas.evaluate((c) => {
      const ctx = c.getContext('2d');
      const [r, g, b, a] = ctx.getImageData(Math.round(c.width * 0.2), Math.round(c.height * 0.5), 1, 1).data;
      return { r, g, b, a };
    });
  const beforeReplacePixel = await samplePixelAt02();
  assert(beforeReplacePixel.a > 100 && beforeReplacePixel.r > 150 && beforeReplacePixel.g < 100, 'replace setup: the original red content is visible at the sampled point before replacing');

  const frameStyleBefore = await page.locator(`[data-el-id="${frameId}"]`).evaluate((el) => el.style.left + '|' + el.style.top + '|' + el.style.width + '|' + el.style.height);
  const ALT_JSON_TEXT = JSON.stringify({ ...LOTTIE, w: 200, h: 200, layers: [{ ...LOTTIE.layers[0], shapes: [{ ty: 'gr', it: [{ ty: 'rc', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [80, 80] }, r: { a: 0, k: 0 } }, { ty: 'fl', c: { a: 0, k: [0, 0, 1, 1] }, o: { a: 0, k: 100 } }, { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }] }] }] });
  await page.once('filechooser', (fc) => fc.setFiles({ name: 'blue.json', mimeType: 'application/json', buffer: Buffer.from(ALT_JSON_TEXT) }));
  await page.locator('button', { hasText: 'استبدال ملف Lottie' }).click();
  await page.waitForTimeout(250);
  const frameStyleAfter = await page.locator(`[data-el-id="${frameId}"]`).evaluate((el) => el.style.left + '|' + el.style.top + '|' + el.style.width + '|' + el.style.height);
  assert(frameStyleAfter === frameStyleBefore, 'replace: the element frame (position/size) is kept exactly as-is after replacing the animation data');
  const afterReplacePixel = await samplePixelAt02();
  assert(afterReplacePixel.a > 100 && afterReplacePixel.b > 150 && afterReplacePixel.r < 100, `replace: the picture content actually changed to the newly picked (blue) animation, not just the frame (pixel=${JSON.stringify(afterReplacePixel)})`);

  await undoBtn.click();
  await page.waitForTimeout(150);
  const afterUndoPixel = await samplePixelAt02();
  assert(afterUndoPixel.a > 100 && afterUndoPixel.r > 150 && afterUndoPixel.g < 100, 'replace: undo is a single step that restores the previous (red) animation data');

  // ============================================================
  // 6. Undo on insert — dropping is one undo step
  // ============================================================
  const countBeforeUndo = await page.locator('[data-el-id]').count();
  const r3 = await dropFile(page, { text: LOTTIE_JSON_TEXT, name: 'undo-probe.json', mime: 'application/json' });
  assert(r3.after === countBeforeUndo + 1, 'undo setup: the extra probe element was inserted');
  await undoBtn.click();
  await page.waitForTimeout(100);
  assert((await page.locator('[data-el-id]').count()) === countBeforeUndo, 'undo: a single undo removes the whole inserted element (one undo step), not a partial change');

  // ============================================================
  // 7. Reload survival (real autosave round-trip)
  // ============================================================
  await page.waitForTimeout(800); // past the autosave debounce
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-testid="artboard"]');
  const survived = await page.locator(`[data-el-id="${frameId}"]`).count();
  assert(survived === 1, 'reload: the Lottie element survives a real page reload (autosave round-trip)');
  if (survived) {
    await page.waitForTimeout(200);
    const survivedCanvas = page.locator(`[data-el-id="${frameId}"] canvas`);
    assert((await survivedCanvas.count()) === 1, 'reload: the reloaded element still renders a real canvas (its JSON data survived, not just the element shell)');
  }

  // ============================================================
  // 8 & 9. The export path: direct calls to the exact production render functions
  // used by PNG/SVG export and by the video/GIF frame sequencer, proving real
  // (non-blank, time-advancing) Lottie pixels end up in the composited output —
  // same methodology qa/anim-tracks.spec.mjs uses for per-property tracks.
  // ============================================================
  const exportResult = await page.evaluate(async ({ json }) => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const size = { id: 'probe', ar: 'اختبار', en: 'probe', w: 200, h: 200 };
    const palette = { bg: '#000000', fg: '#FFFFFF', ac: '#FFB703' };
    const el = {
      id: 'lottie-probe',
      type: 'lottie',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      geo: { x: 0, y: 0, w: 1, h: 1, rotation: 0 },
      data: json,
      naturalW: 200,
      naturalH: 200,
      loop: true,
      anim: { preset: 'none', start: 0, duration: 0.6, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
    };

    function findRedX(data, w, h) {
      const y = Math.round(h / 2);
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3] > 100 && data[i] > 150 && data[i + 1] < 100) return x;
      }
      return -1;
    }
    async function redXAtTime(time) {
      const blob = await mod.renderArtboardPng({ size, palette, elements: [el], transparent: true, lang: 'ar', time, scale: 1 });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(size.w, size.h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      return findRedX(ctx.getImageData(0, 0, size.w, size.h).data, size.w, size.h);
    }

    const pngStartX = await redXAtTime(0);
    const pngMidX = await redXAtTime(1);

    const frames = [];
    await mod.renderArtboardFrames({ size, palette, elements: [el], transparent: true, lang: 'ar', scale: 1 }, [0, 0.5, 1, 1.5], async (blob) => {
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(size.w, size.h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      frames.push(findRedX(ctx.getImageData(0, 0, size.w, size.h).data, size.w, size.h));
    });

    return { pngStartX, pngMidX, frames };
  }, { json: LOTTIE_JSON_TEXT });

  assert(exportResult.pngStartX >= 0, `PNG export: renderArtboardPng actually composited real red Lottie pixels at time=0 (x=${exportResult.pngStartX}), not a blank box`);
  assert(exportResult.pngMidX >= 0, `PNG export: renderArtboardPng still composites real content at a later time (x=${exportResult.pngMidX})`);
  assert(exportResult.pngStartX !== exportResult.pngMidX, 'PNG export: the composited frame differs between two different export times, proving the exported frame is time-accurate, not frozen');
  assert(exportResult.frames.every((x) => x >= 0), `video frames: every frame renderArtboardFrames produced (the function that feeds MP4/GIF encoding) contains real Lottie content (frames=${JSON.stringify(exportResult.frames)})`);
  const distinctFrameXs = new Set(exportResult.frames).size;
  assert(distinctFrameXs > 1, `video frames: the Lottie content actually advances across the frame sequence a short MP4/GIF export would encode (distinct positions=${distinctFrameXs})`);

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
