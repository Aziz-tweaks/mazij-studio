#!/usr/bin/env node
// Covers roadmap item #24: "نماذج محلية على جهاز المستخدم" — the two new
// capabilities this round adds on top of #9/#15's local-model foundation:
//
// (أ) Image upscaling (super-resolution) — on-device inference via
//     onnxruntime-web (src/lib/superResolution.ts), same "never Rust/a sidecar"
//     rule as #9/#15, using `realesr-general-x4v3` (BSD-3-Clause, real sha256).
//     Verified: the model registry entry, a real download+inference run that
//     measurably changes both pixel dimensions (exactly 4x) and pixel content
//     (not a no-op/copy), internal tiling for images larger than one tile, and
//     the real live "تحسين الدقة" button + single-undo-step wiring.
//
// (ب) The natural-language command interpreter (src/lib/commandInterpreter.ts)
//     — a zero-network, zero-download rule grammar over Arabic+English text
//     that emits the *same* tool calls as the MCP server (#20)'s registry
//     (src/lib/mcpTools.ts) and runs them against the real document. Verified:
//     a wide span of intents via the pure function (fake ctx — mocks belong
//     only here, in the test, never in src/), then the real live
//     "مفسّر الأوامر" dialog driving the real Stage DOM end-to-end (color,
//     resize, move, opacity, select, delete, undo), plus the honest "لم أفهم"
//     path for an unresolvable target and for genuinely unsupported verbs.
//
// Run: node qa/local-models.spec.mjs   (dev server must be running on :1420)
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

// ---------------------------------------------------------------------------
// (أ) Super-resolution — pure function: registry + single-tile + multi-tile.
// ---------------------------------------------------------------------------
async function testUpscalePureFunctions(page) {
  const r = await page.evaluate(async () => {
    const { LOCAL_MODELS, modelById, downloadModel, getModelBytes, isModelDownloaded } = await import('/src/lib/localModels.ts');
    const { upscaleImage } = await import('/src/lib/superResolution.ts');

    const model = modelById('realesr-general-x4v3');
    const registryOk = !!(
      model &&
      model.task === 'super-resolution' &&
      model.downloadable &&
      model.license === 'BSD-3-Clause' &&
      model.sha256.length === 64 &&
      model.sizeBytes > 1_000_000 &&
      LOCAL_MODELS.filter((m) => m.task === 'super-resolution').length === 1
    );

    let downloadError = null;
    const alreadyDownloaded = await isModelDownloaded(model);
    if (!alreadyDownloaded) {
      try {
        await downloadModel(model);
      } catch (err) {
        downloadError = err.message;
      }
    }
    let bytes = null;
    if (!downloadError) bytes = await getModelBytes(model);

    function makeSplitImage(w, h, leftColor, rightColor) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cx = c.getContext('2d');
      cx.fillStyle = leftColor;
      cx.fillRect(0, 0, Math.floor(w / 2), h);
      cx.fillStyle = rightColor;
      cx.fillRect(Math.floor(w / 2), 0, w - Math.floor(w / 2), h);
      return c.toDataURL('image/png');
    }

    function sampleRgb(dataUrl, x, y) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const cx = c.getContext('2d');
          cx.drawImage(img, 0, 0);
          const d = cx.getImageData(x, y, 1, 1).data;
          resolve({ r: d[0], g: d[1], b: d[2], w: c.width, h: c.height });
        };
        img.onerror = reject;
        img.src = dataUrl;
      });
    }

    // Single-tile pass (both dims < 192 → no internal tiling triggered).
    let singleTileError = null;
    let singleTileResult = null;
    const progressCalls = [];
    if (bytes) {
      const src = makeSplitImage(80, 60, '#ff0000', '#0000ff');
      try {
        singleTileResult = await upscaleImage(src, model, bytes, (done, total) => progressCalls.push([done, total]));
      } catch (err) {
        singleTileError = err.message;
      }
    }
    const leftSample = singleTileResult ? await sampleRgb(singleTileResult.dataUrl, 40, 120) : null; // scaled-left quarter
    const rightSample = singleTileResult ? await sampleRgb(singleTileResult.dataUrl, 280, 120) : null; // scaled-right quarter

    // Multi-tile pass: width 240 > the module's 192px tile edge forces exactly
    // two tiles to be planned, run, and stitched back together.
    let multiTileError = null;
    let multiTileResult = null;
    if (bytes) {
      const src = makeSplitImage(240, 40, '#101010', '#f0f0f0');
      try {
        multiTileResult = await upscaleImage(src, model, bytes);
      } catch (err) {
        multiTileError = err.message;
      }
    }

    return {
      registryOk,
      downloadError,
      singleTileError,
      multiTileError,
      singleW: singleTileResult?.width,
      singleH: singleTileResult?.height,
      multiW: multiTileResult?.width,
      multiH: multiTileResult?.height,
      leftSample,
      rightSample,
      progressCalls,
    };
  });

  assert(r.registryOk, `registry: realesr-general-x4v3 is a real downloadable BSD-3-Clause model with a full sha256, alone under task "super-resolution" (${JSON.stringify(r)})`);
  assert(!r.downloadError, `download: the real model actually downloaded + sha256-verified without error (${r.downloadError})`);
  assert(!r.singleTileError, `single-tile: real inference ran without error (${r.singleTileError})`);
  assert(r.singleW === 320 && r.singleH === 240, `single-tile: output is exactly 4x the 80×60 source (${r.singleW}×${r.singleH})`);
  assert(r.leftSample && r.leftSample.r > 150 && r.leftSample.b < 100, `single-tile: upscaled left-quarter pixel stays reddish — real content, not a blank/flat output (${JSON.stringify(r.leftSample)})`);
  assert(r.rightSample && r.rightSample.b > 150 && r.rightSample.r < 100, `single-tile: upscaled right-quarter pixel stays bluish (${JSON.stringify(r.rightSample)})`);
  assert(r.progressCalls.length >= 1 && r.progressCalls[r.progressCalls.length - 1][0] === r.progressCalls[r.progressCalls.length - 1][1], `single-tile: real per-tile progress callback reached done===total (${JSON.stringify(r.progressCalls)})`);
  assert(!r.multiTileError, `multi-tile: a 240×40 source (wider than one 192px tile) upscaled without error — internal tiling path ran (${r.multiTileError})`);
  assert(r.multiW === 960 && r.multiH === 160, `multi-tile: stitched output is exactly 4x the 240×40 source, with no size drift from tiling (${r.multiW}×${r.multiH})`);
}

function drawSplitPng(ctx, w, h, leftColor, rightColor) {
  ctx.fillStyle = leftColor;
  ctx.fillRect(0, 0, Math.floor(w / 2), h);
  ctx.fillStyle = rightColor;
  ctx.fillRect(Math.floor(w / 2), 0, w - Math.floor(w / 2), h);
}

async function dropSyntheticImage(page, w, h) {
  const before = await page.locator('[data-el-id]').count();
  await page.evaluate(
    ({ w, h }) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, Math.floor(w / 2), h);
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(Math.floor(w / 2), 0, w - Math.floor(w / 2), h);
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          const file = new File([blob], 'upscale-test.png', { type: 'image/png' });
          const dt = new DataTransfer();
          dt.items.add(file);
          const target = document.querySelector('[data-testid="artboard"]');
          const rect = target.getBoundingClientRect();
          const clientX = rect.left + rect.width * 0.5;
          const clientY = rect.top + rect.height * 0.5;
          target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
          target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
          resolve();
        }, 'image/png');
      });
    },
    { w, h },
  );
  await page.waitForTimeout(250);
  assert((await page.locator('[data-el-id]').count()) === before + 1, 'live UI: dropping the synthetic red/blue test image added one new, auto-selected image element');
  return page.locator('[data-el-id] img').last();
}

async function sampleRgbOf(page, src, x, y) {
  return page.evaluate(
    ([src, x, y]) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const cx = c.getContext('2d');
          cx.drawImage(img, 0, 0);
          const d = cx.getImageData(x, y, 1, 1).data;
          resolve({ r: d[0], g: d[1], b: d[2], w: c.width, h: c.height });
        };
        img.onerror = reject;
        img.src = src;
      }),
    [src, x, y],
  );
}

async function testUpscaleLiveUI(page) {
  const img = await dropSyntheticImage(page, 80, 60);
  await page.waitForTimeout(100);

  const btn = page.locator('[data-testid="upscale-btn"]');
  assert((await btn.count()) === 1, 'live UI: the newly dropped+selected image shows a real "تحسين الدقة" button');

  const originalSrc = await img.getAttribute('src');
  await btn.click();

  // This is the one real network download+sha256-verify for this browser
  // profile (testUpscalePureFunctions runs after this and reuses the cache) —
  // real inference included, so this can legitimately take a while.
  await page.waitForFunction(
    (prevSrc) => {
      const el = document.querySelector('[data-el-id] img');
      if (el && el.getAttribute('src') !== prevSrc) return true;
      return document.querySelector('[data-testid="upscale-error"]') != null;
    },
    originalSrc,
    { timeout: 120000 },
  );
  await page.waitForTimeout(150);

  assert((await page.locator('[data-testid="upscale-error"]').count()) === 0, 'live UI: upscaling completed without hitting the error state');
  const upscaledSrc = await img.getAttribute('src');
  assert(upscaledSrc !== originalSrc && upscaledSrc.startsWith('data:image/png'), "live UI: the real <img>'s src actually changed to a new real PNG after upscaling");

  const live = await sampleRgbOf(page, upscaledSrc, 40, 120);
  assert(live.w === 320 && live.h === 240, `live UI: the real rendered output is exactly 4x the dropped 80×60 source (${JSON.stringify(live)})`);
  assert(live.r > 150 && live.b < 100, `live UI: the real output keeps the left half reddish (${JSON.stringify(live)})`);

  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await page.waitForTimeout(150);
  assert((await img.getAttribute('src')) === originalSrc, 'live UI: a single ⌘Z undo fully restores the pre-upscale src');
}

// ---------------------------------------------------------------------------
// (ب) Command interpreter — pure function via a fake ctx (mocks belong only
// here, in the test, never inside src/commandInterpreter.ts itself).
// ---------------------------------------------------------------------------
async function testInterpreterPureFunction(page) {
  const r = await page.evaluate(async () => {
    const { interpretAndRun } = await import('/src/lib/commandInterpreter.ts');
    const { sizeAt } = await import('/src/data/constants.ts');
    const baselineSize = sizeAt(0, 1080, 1080);

    function makeCtx(elements, selectedIds) {
      const calls = [];
      const state = { elements, selectedIds, sizeIdx: 0, customW: 1080, customH: 1080 };
      const actions = new Proxy(
        {},
        {
          get: (_t, prop) =>
            (...args) => {
              calls.push([prop, args]);
            },
        },
      );
      return { ctx: { getState: () => state, actions }, calls };
    }

    const textEl = { id: 't1', type: 'text', text: 'عنوان', fontSize: 48, geo: { x: 0.1, y: 0.1, w: 0.5, h: 0.2, rotation: 0 } };
    const shapeEl = { id: 's1', type: 'shape', shape: 'rect', fill: '#000', geo: { x: 0.1, y: 0.5, w: 0.3, h: 0.1, rotation: 0 } };

    const cases = [];
    async function run(label, text, elements, selectedIds) {
      const { ctx, calls } = makeCtx(elements, selectedIds);
      // Stub every tool's `run` indirectly isn't possible without re-importing
      // mcpTools — instead let the *real* tool run against this fake ctx; every
      // MCP tool here only ever calls `ctx.actions.*`/`ctx.getState()`, both of
      // which are the fakes above, so nothing in the real document is touched.
      let outcome;
      try {
        outcome = await interpretAndRun(text, ctx);
      } catch (err) {
        outcome = { understood: false, messageAr: 'threw: ' + err.message, messageEn: 'threw: ' + err.message };
      }
      cases.push({ label, text, understood: outcome.understood, tool: outcome.tool, args: outcome.args, calls });
    }

    const baselineTextWidthPx = textEl.geo.w * baselineSize.w;

    await run('undo', 'تراجع', [], []);
    await run('redo-en', 'redo', [], []);
    await run('color-text-attached-prefix', 'غيّر اللون للأحمر', [textEl], ['t1']);
    await run('color-shape-explicit-role', 'غيّر لون الشكل للأخضر', [textEl, shapeEl], ['t1']);
    await run('resize-bigger-role', 'كبّر العنوان', [textEl], []);
    await run('resize-smaller-selection-fallback', 'صغّر', [shapeEl], ['s1']);
    await run('move-down-attached-prefix', 'حرّك الشكل لتحت', [shapeEl], []);
    await run('move-no-direction', 'حرّك الشكل', [shapeEl], []);
    await run('opacity-percent', 'اجعل شفافية العنوان 40%', [textEl], []);
    await run('opacity-half-word', 'نصف شفاف', [shapeEl], ['s1']);
    await run('delete-selection-fallback', 'احذف', [shapeEl], ['s1']);
    await run('select-role', 'حدد الشكل', [textEl, shapeEl], []);
    await run('add-text-quoted', "أضف نص 'خصم خاص'", [], []);
    await run('add-shape', 'أضف شكل', [], []);
    await run('set-text-quoted', "غيّر النص إلى 'نص جديد'", [textEl], ['t1']);
    await run('palette', 'استخدم لوحة ألوان 2', [], []);
    await run('new-document', 'مستند جديد', [textEl], []);
    await run('english-bigger', 'make the shape bigger', [shapeEl], []);
    await run('english-color', 'change the color to blue', [shapeEl], ['s1']);
    await run('no-target-found', 'حرّك الشعار لتحت', [textEl, shapeEl], []); // no image element exists
    await run('unsupported-video-trim', 'قص أول ثانيتين', [], []);
    await run('unsupported-fade-animation', 'خلّ النص يظهر تدريجيًا', [textEl], ['t1']);
    // ٢٤ أكتوبر ٢٠٢٦ — ثلاثُ حالاتٍ من جولةٍ حقيقيّة في البرنامج: «كبّر العنوان» والسطرُ
    // الفرعيّ محدَّد كبّر السطرَ الفرعيّ وأخرجه عن اللوحة، و«خلّ الخلفية زرقاء» لم
    // يُفهم، و«غيّر لون الخلفية للأزرق» لوّن العنوان.
    const subEl = { id: 'sub', type: 'text', text: 'سطر فرعي', fontSize: 20, geo: { x: 0.5, y: 0.6, w: 0.48, h: 0.1, rotation: 0 } };
    const edgeTitle = { id: 'edge', type: 'text', name: 'العنوان', text: 'عنوان', fontSize: 30, geo: { x: 0.5, y: 0.3, w: 0.5, h: 0.2, rotation: 0 } };
    await run('title-role-ignores-selection', 'كبّر العنوان', [textEl, subEl], ['sub']);
    await run('title-by-layer-name', 'كبّر العنوان', [textEl, edgeTitle], []);
    await run('background-feminine-color', 'خلّ الخلفية زرقاء', [textEl], ['t1']);
    await run('background-color-verb', 'غيّر لون الخلفية للأزرق', [textEl, subEl], ['sub']);
    await run('nonsense', 'zzz 999 qqq blah', [], []);
    await run('empty', '   ', [], []);

    return { cases, baselineTextWidthPx };
  });
  const { cases, baselineTextWidthPx } = r;

  const byLabel = Object.fromEntries(cases.map((c) => [c.label, c]));
  assert(byLabel.undo.understood && byLabel.undo.tool === 'undo', `undo: "تراجع" maps to the real undo tool (${JSON.stringify(byLabel.undo)})`);
  assert(byLabel['redo-en'].understood && byLabel['redo-en'].tool === 'redo', `redo: English "redo" maps to the real redo tool (${JSON.stringify(byLabel['redo-en'])})`);
  assert(byLabel['color-text-attached-prefix'].understood && byLabel['color-text-attached-prefix'].tool === 'element_set_text_style' && byLabel['color-text-attached-prefix'].args.color === '#ef4444', `color: "غيّر اللون للأحمر" (attached ل prefixes) resolves color+target correctly (${JSON.stringify(byLabel['color-text-attached-prefix'])})`);
  assert(byLabel['color-shape-explicit-role'].understood && byLabel['color-shape-explicit-role'].tool === 'element_set_shape_style' && byLabel['color-shape-explicit-role'].args.fill === '#22c55e', `color: explicit "الشكل" role routes to element_set_shape_style, not the text tool (${JSON.stringify(byLabel['color-shape-explicit-role'])})`);
  assert(byLabel['resize-bigger-role'].understood && byLabel['resize-bigger-role'].tool === 'element_set_geometry' && byLabel['resize-bigger-role'].args.w > baselineTextWidthPx, `resize: "كبّر العنوان" resolves the title by role and grows it (${JSON.stringify(byLabel['resize-bigger-role'])}, baseline=${baselineTextWidthPx})`);
  assert(byLabel['resize-smaller-selection-fallback'].understood && byLabel['resize-smaller-selection-fallback'].tool === 'element_set_geometry', `resize: a bare "صغّر" with no role word falls back to the current selection (${JSON.stringify(byLabel['resize-smaller-selection-fallback'])})`);
  assert(byLabel['move-down-attached-prefix'].understood && byLabel['move-down-attached-prefix'].args.y !== undefined && byLabel['move-down-attached-prefix'].args.x === undefined, `move: "حرّك الشكل لتحت" (attached ل on "تحت") moves only on y (${JSON.stringify(byLabel['move-down-attached-prefix'])})`);
  assert(!byLabel['move-no-direction'].understood, `move: "حرّك الشكل" with no direction word is honestly reported as not understood, not guessed (${JSON.stringify(byLabel['move-no-direction'])})`);
  assert(byLabel['opacity-percent'].understood && byLabel['opacity-percent'].args.opacity === 40, `opacity: an explicit percent is read correctly (${JSON.stringify(byLabel['opacity-percent'])})`);
  assert(byLabel['opacity-half-word'].understood && byLabel['opacity-half-word'].args.opacity === 50, `opacity: "نصف شفاف" without a number defaults to 50 (${JSON.stringify(byLabel['opacity-half-word'])})`);
  assert(byLabel['delete-selection-fallback'].understood && byLabel['delete-selection-fallback'].tool === 'element_delete' && byLabel['delete-selection-fallback'].args.id === 's1', `delete: a bare "احذف" deletes the current selection (${JSON.stringify(byLabel['delete-selection-fallback'])})`);
  assert(byLabel['select-role'].understood && byLabel['select-role'].args.id === 's1', `select: "حدد الشكل" resolves the shape by role among multiple elements (${JSON.stringify(byLabel['select-role'])})`);
  assert(byLabel['add-text-quoted'].understood && byLabel['add-text-quoted'].args.text === 'خصم خاص', `add-text: quoted content is extracted correctly (${JSON.stringify(byLabel['add-text-quoted'])})`);
  assert(byLabel['add-shape'].understood && byLabel['add-shape'].tool === 'element_add_shape', `add-shape: "أضف شكل" maps to the real element_add_shape tool (${JSON.stringify(byLabel['add-shape'])})`);
  assert(byLabel['set-text-quoted'].understood && byLabel['set-text-quoted'].args.text === 'نص جديد', `set-text: quoted content overrides the selected text element (${JSON.stringify(byLabel['set-text-quoted'])})`);
  assert(byLabel.palette.understood && byLabel.palette.args.paletteIndex === 2, `palette: a trailing number is read as the palette index (${JSON.stringify(byLabel.palette)})`);
  assert(byLabel['new-document'].understood && byLabel['new-document'].tool === 'document_new', `new-document: "مستند جديد" maps to the real document_new tool (${JSON.stringify(byLabel['new-document'])})`);
  assert(byLabel['english-bigger'].understood && byLabel['english-bigger'].tool === 'element_set_geometry', `english: "make the shape bigger" is understood (${JSON.stringify(byLabel['english-bigger'])})`);
  assert(byLabel['english-color'].understood && byLabel['english-color'].args.fill === '#3b82f6', `english: "change the color to blue" resolves the right hex (${JSON.stringify(byLabel['english-color'])})`);
  assert(!byLabel['no-target-found'].understood, `honest limit: "حرّك الشعار لتحت" with no image element in the document reports not-understood, never a fabricated success (${JSON.stringify(byLabel['no-target-found'])})`);
  assert(!byLabel['unsupported-video-trim'].understood, `honest limit: "قص أول ثانيتين" (video trim — no such MCP tool exists) is reported as not understood (${JSON.stringify(byLabel['unsupported-video-trim'])})`);
  assert(!byLabel['unsupported-fade-animation'].understood, `honest limit: "خلّ النص يظهر تدريجيًا" (animation — no such MCP tool exists) is reported as not understood (${JSON.stringify(byLabel['unsupported-fade-animation'])})`);
  assert(byLabel['title-role-ignores-selection'].understood && byLabel['title-role-ignores-selection'].args.id === 't1', `role: "كبّر العنوان" targets the title even while another text is selected (${JSON.stringify(byLabel['title-role-ignores-selection'])})`);
  {
    const c = byLabel['title-by-layer-name'];
    const fontCall = c.calls.find(([name]) => name === 'setElementFontSize');
    assert(c.understood && c.args.id === 'edge', `role: a layer named "العنوان" wins over the largest font (${JSON.stringify(c)})`);
    assert(c.args.x + c.args.w <= 1080 && c.args.x >= 0, `resize: enlarging a title that touches the edge keeps it inside the artboard (${JSON.stringify(c.args)})`);
    assert(fontCall && fontCall[1][1] > 30, `resize: enlarging a text also enlarges its font, not just its box (${JSON.stringify(fontCall)})`);
  }
  assert(byLabel['background-feminine-color'].understood && byLabel['background-feminine-color'].tool === 'document_set_background' && byLabel['background-feminine-color'].args.color === '#3b82f6', `background: "خلّ الخلفية زرقاء" sets the background, feminine color word included (${JSON.stringify(byLabel['background-feminine-color'])})`);
  assert(byLabel['background-color-verb'].understood && byLabel['background-color-verb'].tool === 'document_set_background', `background: "غيّر لون الخلفية للأزرق" never recolors a text element (${JSON.stringify(byLabel['background-color-verb'])})`);
  assert(!byLabel.nonsense.understood, `nonsense input is reported as not understood (${JSON.stringify(byLabel.nonsense)})`);
  assert(!byLabel.empty.understood, `empty input is reported as not understood (${JSON.stringify(byLabel.empty)})`);
}

// ---------------------------------------------------------------------------
// (ب) Command interpreter — real live UI: the actual dialog driving the real
// Stage DOM through the real StudioContext (no fakes from here on).
// ---------------------------------------------------------------------------
async function runNlCommand(page, text) {
  await page.locator('[data-testid="cmd-interpreter-input"]').fill(text);
  await page.locator('[data-testid="cmd-interpreter-run-btn"]').click();
  await page.waitForTimeout(200);
}

async function testInterpreterLiveUI(page) {
  await page.locator('[data-testid="more-tools-btn"]').click();
  await page.locator('[data-testid="open-cmd-interpreter-btn"]').click();
  assert((await page.locator('[data-testid="cmd-interpreter-dialog"]').count()) === 1, 'live UI: the "مفسّر الأوامر" dialog opens from its real TopBar button');
  assert((await page.locator('text=يعمل على جهازك بقواعد ثابتة').count()) > 0, 'live UI: the "runs locally, fixed rules, no download/internet" badge is actually rendered');

  await runNlCommand(page, 'مستند جديد');
  assert((await page.locator('[data-el-id]').count()) === 0, 'live UI: "مستند جديد" really clears the document to zero elements');

  await runNlCommand(page, "أضف نص 'العنوان الرئيسي'");
  await runNlCommand(page, 'أضف شكل');
  assert((await page.locator('[data-el-id]').count()) === 2, 'live UI: the two real "أضف" commands each added one real element');

  const elIds = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  const [textId, shapeId] = elIds;
  const textLoc = page.locator(`[data-el-id="${textId}"]`);
  const shapeLoc = page.locator(`[data-el-id="${shapeId}"]`);

  const textBoxBefore = await textLoc.boundingBox();
  await runNlCommand(page, 'كبّر العنوان');
  const textBoxAfter = await textLoc.boundingBox();
  assert(textBoxAfter.width > textBoxBefore.width * 1.1, `live UI: "كبّر العنوان" grows the real title element on screen (${textBoxBefore.width} -> ${textBoxAfter.width})`);

  await runNlCommand(page, 'غيّر لون العنوان للأحمر');
  const textColor = await textLoc.evaluate((el) => getComputedStyle(el).color);
  assert(textColor === 'rgb(239, 68, 68)', `live UI: "غيّر لون العنوان للأحمر" sets the real rendered text color (${textColor})`);

  await runNlCommand(page, 'غيّر لون الشكل للأخضر');
  const shapeBg = await shapeLoc.evaluate((el) => getComputedStyle(el.firstElementChild).backgroundColor);
  assert(shapeBg === 'rgb(34, 197, 94)', `live UI: "غيّر لون الشكل للأخضر" sets the real rendered shape fill (${shapeBg})`);

  const shapeBoxBefore = await shapeLoc.boundingBox();
  await runNlCommand(page, 'حرّك الشكل لتحت');
  const shapeBoxAfter = await shapeLoc.boundingBox();
  assert(shapeBoxAfter.y > shapeBoxBefore.y + 5, `live UI: "حرّك الشكل لتحت" actually moves the real shape down on screen (${shapeBoxBefore.y} -> ${shapeBoxAfter.y})`);

  await runNlCommand(page, 'اجعل شفافية العنوان 40%');
  const textOpacity = await textLoc.evaluate((el) => Number(getComputedStyle(el).opacity));
  assert(textOpacity > 0.35 && textOpacity < 0.45, `live UI: "اجعل شفافية العنوان 40%" sets the real rendered opacity (${textOpacity})`);

  await runNlCommand(page, 'حرّك الشعار لتحت'); // no image element exists in this seeded doc
  assert((await page.locator('[data-testid="cmd-interpreter-failure"]').count()) === 1, 'live UI: asking to move a nonexistent "الشعار" surfaces the honest unresolved-target failure, not a silent no-op');

  const countBeforeDelete = await page.locator('[data-el-id]').count();
  await runNlCommand(page, 'احذف الشكل');
  assert((await page.locator('[data-el-id]').count()) === countBeforeDelete - 1, 'live UI: "احذف الشكل" really removes the real shape element');

  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await page.waitForTimeout(150);
  assert((await page.locator('[data-el-id]').count()) === countBeforeDelete, 'live UI: a single ⌘Z undoes the interpreter-driven delete, same as any other document edit');

  await runNlCommand(page, 'قص أول ثانيتين');
  assert((await page.locator('[data-testid="cmd-interpreter-failure"]').count()) === 1, 'live UI: the roadmap\'s own "قص أول ثانيتين" example honestly fails — no video-trim tool exists in the #20 action layer to drive');

  await runNlCommand(page, 'blah blah 12345');
  assert((await page.locator('[data-testid="cmd-interpreter-failure"]').count()) === 1, 'live UI: genuinely nonsensical input shows the real "لم أفهم" failure state');

  await page.locator('[data-testid="close-cmd-interpreter-btn"]').click();
  assert((await page.locator('[data-testid="cmd-interpreter-dialog"]').count()) === 0, 'live UI: the dialog closes via its real close button');
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

  // Live UI upscale first, so its real button click performs the one real
  // network download+sha256-verify for this browser profile; the pure-fn pass
  // then reuses that cached model for its (slower, multi-case) checks.
  await testUpscaleLiveUI(page);
  await testUpscalePureFunctions(page);

  await testInterpreterPureFunction(page);
  await testInterpreterLiveUI(page);

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
