#!/usr/bin/env node
// رحلة منشور ثابت: من شاشة البداية إلى ملف PNG مُصدَّر — بقياسات، لا انطباعات.
//
// Why this file exists: a designer sat down to build one real Instagram post from
// the brief «إعلان لمقهى رواق — افتتاح الخميس، خصم ٢٥٪» (1080×1080, Arabic: big
// headline, smaller detail line, one or two shapes, a photo, a small corner logo)
// and recorded every place the app refused to cooperate. Each assertion below is
// one of those places, expressed as a number taken through real pointer and
// keyboard events against the running app. Every one of them failed before the
// change it guards, and none of them was covered by the 1254 assertions already
// in this directory — mostly because the existing specs reach controls through
// `fill()` and programmatic clicks, which skip the intermediate states a human
// hand actually passes through.
//
// The seven defects this locks down, worst first:
//
//   1. أدوات الإنشاء تبتلعها العناصر. `onElementPointerDown` called
//      `e.stopPropagation()` before looking at the armed tool, so the only handler
//      that creates anything (`onBackgroundPointerDown`) never ran. Text over an
//      image created nothing; a shape drag over an image silently MOVED the image.
//      On a half-finished layout elements cover most of the canvas, so both tools
//      read as broken. Same defect in `onHandleDown`, whose invisible ~20px hit
//      ring extends *outside* the selected element — the gesture became a resize
//      plus an undo entry for a change nobody asked for.
//   2. النصّ الجديد لا يُكتب فيه. A freshly placed text element was selected but
//      not edited: `document.activeElement` stayed `BODY` and typing went nowhere,
//      leaving «نص جديد» on the canvas. The content could only be set from the
//      sidebar field.
//   3. حقل مقاس الخطّ يُفسد ما يُكتب فيه. A fully controlled input clamping to
//      [8,400] on every keystroke: typing "140" passed through 1→8, 84, 840→400 and
//      settled on **400**. 42→82, 26→86. Every realistic headline size was
//      unreachable by typing. `controls.spec.mjs` missed it because `fill()` sets
//      the value in one shot and never visits an intermediate state.
//   4. شريط الأدوات يَعِد باختصارات لا وجود لها. Every tool button renders its
//      letter in `title` (`TOOLS[].key`) and nothing listened for those keys.
//   5. شريحة لون الشكل ميّتة على كل شكل من المكتبة. `setShapeFill` wrote the legacy
//      `el.fill`, but `currentAppearance` prefers the appearance stack, and every
//      library-placed shape is born with one — so the swatch moved its own "active"
//      ring while the shape stayed placeholder grey.
//   6. المعاينة والتصدير صورتان متعاكستان. The artboard decoration used
//      `insetInlineStart` (a *logical* property) while both export paths compute an
//      explicit `0.68w`, putting the same circle at x≈97 on screen and x≈983 in the
//      file — mirror images of one document.
//   7. تصدير SVG يتجاهل كتم الزخرفة. PNG/JPG suppress the decoration on an empty
//      document; SVG drew it unconditionally, so one document exported two
//      different pictures depending only on the chosen format.
//
// Run: node qa/still-post-journey.spec.mjs   (dev server must be running on :1420)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { bootBlank, bootDemo } from './helpers/boot.mjs';

const BASE_URL = process.env.QA_BASE_URL || process.env.MAZIJ_URL || 'http://localhost:1420';
let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ok  ', msg);
  } else {
    fail++;
    failures.push(msg);
    console.error('  FAIL', msg);
  }
}

/** Asserts a measurement and always prints both numbers, so a failure is
 * diagnosable without re-running. */
function near(got, want, tol, msg) {
  assert(Math.abs(got - want) <= tol, `${msg} — expected ${want}, got ${Number(got).toFixed(2)} (tol ${tol})`);
}

// ---- PNG decoding (same decoder as start-screen/artboards specs, same reason:
// a claim about what is in an exported file is settled by the file's bytes) ----
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

function pixelAt(png, fx, fy) {
  const x = Math.min(png.width - 1, Math.max(0, Math.round(fx * (png.width - 1))));
  const y = Math.min(png.height - 1, Math.max(0, Math.round(fy * (png.height - 1))));
  const i = y * png.width * png.channels + x * png.channels;
  return { r: png.pixels[i], g: png.pixels[i + 1], b: png.pixels[i + 2] };
}

const sameRgb = (a, b) => a.r === b.r && a.g === b.g && a.b === b.b;

/** Exports the open document once, in `format`, at 1x, to exactly one target.
 * Export-target selection is session state that outlives the dialog, so every
 * target is normalised rather than assumed. */
async function exportOnce(page, downloadDir, format, targetId, ext) {
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(200);
  await page.locator(`button:has-text("${format}")`).first().click();
  await page.waitForTimeout(80);
  const scale1 = page.locator('button', { hasText: /^1x$/ });
  if (await scale1.count()) {
    await scale1.first().click();
    await page.waitForTimeout(60);
  }
  const tiles = await page.locator('[data-testid^="export-target-"]').evaluateAll((els) =>
    els.map((el) => ({ id: el.getAttribute('data-testid').replace('export-target-', ''), on: el.getAttribute('data-on') === 'true' })),
  );
  for (const t of tiles) {
    if (t.on !== (t.id === targetId)) {
      await page.locator(`[data-testid="export-target-${t.id}"]`).click();
      await page.waitForTimeout(40);
    }
  }
  const dl = page.waitForEvent('download', { timeout: 30000 });
  await page.locator('button', { hasText: /^تصدير (ملف واحد|ملفين|\d+ ملفات)$/ }).first().click();
  const download = await dl;
  const out = path.join(downloadDir, `probe-${Date.now()}.${ext}`);
  await download.saveAs(out);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return out;
}

const artbox = (page) => page.locator('[data-testid="artboard"]').boundingBox();
const elCount = (page) => page.evaluate(() => document.querySelectorAll('[data-el-id]').length);
const armedTool = (page) =>
  page.evaluate(() => {
    const on = [...document.querySelectorAll('[data-tool]')].find((e) => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)');
    return on ? on.getAttribute('data-tool') : null;
  });

/** Geometry of one element in document pixels — the numbers the export writes. */
async function geoOf(page, id) {
  return page.evaluate((elId) => {
    const ab = document.querySelector('[data-testid="artboard"]');
    const abr = ab.getBoundingClientRect();
    const sx = +ab.getAttribute('data-doc-w') / abr.width;
    const sy = +ab.getAttribute('data-doc-h') / abr.height;
    const n = document.querySelector(`[data-el-id="${elId}"]`);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: (r.x - abr.x) * sx, y: (r.y - abr.y) * sy, w: r.width * sx, h: r.height * sy };
  }, id);
}

async function main() {
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-post-'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // ============================================================
  // 1. اختصارات شريط الأدوات — الوعد المعروض في التلميح يُنفَّذ
  // ============================================================
  await bootBlank(page, BASE_URL, 'ig');
  assert((await armedTool(page)) === 'select', 'a new blank document starts on the select tool');

  for (const [key, tool] of [['KeyT', 'text'], ['KeyR', 'shape'], ['KeyI', 'image'], ['KeyE', 'fx'], ['KeyV', 'select']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(140);
    assert((await armedTool(page)) === tool, `pressing ${key} arms the "${tool}" tool the rail's own tooltip promises`);
  }

  // The tooltip letter and the working key are the same letter, by construction.
  const railPromises = await page.locator('[data-tool]').evaluateAll((els) => els.map((e) => ({ tool: e.getAttribute('data-tool'), key: e.getAttribute('title') })));
  assert(
    railPromises.every((t) => /^[A-Z]$/.test(t.key || '')),
    `every visible rail button still advertises a single-letter shortcut (${railPromises.map((t) => `${t.tool}:${t.key}`).join(' ')})`,
  );

  // Pro-only tools are hidden in simple mode, so their letters must stay inert —
  // a shortcut that arms a tool with no button leaves the designer somewhere they
  // cannot see why they are.
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(100);
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(140);
  assert((await armedTool(page)) === 'select', 'in simple mode KeyP does NOT arm the pen — the rail hides it, so the shortcut hides too');

  // And a shortcut must never fire while the designer is typing a value.
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(120);
  let ab = await artbox(page);
  await page.mouse.click(ab.x + ab.width * 0.5, ab.y + ab.height * 0.5);
  await page.waitForTimeout(450);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const textField = page.locator('input').first();
  await textField.click({ clickCount: 3 });
  await page.keyboard.type('rrr', { delay: 20 });
  await page.waitForTimeout(200);
  assert((await armedTool(page)) === 'select', 'typing "rrr" into the text field does not arm the shape tool — shortcuts yield to editable targets');
  assert((await textField.inputValue()) === 'rrr', 'and the letters actually reach the field');

  // ============================================================
  // 2. النصّ الجديد يُكتب فيه مباشرة
  // ============================================================
  await bootBlank(page, BASE_URL, 'ig');
  await page.locator('[data-tool="text"]').click();
  await page.waitForTimeout(200);
  ab = await artbox(page);
  await page.mouse.click(ab.x + ab.width * 0.5, ab.y + ab.height * 0.3);
  await page.waitForTimeout(500);
  const focusState = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    editable: document.activeElement?.getAttribute?.('contenteditable'),
    count: document.querySelectorAll('[contenteditable="true"]').length,
  }));
  assert(focusState.editable === 'true' && focusState.count === 1, `a freshly placed text element is focused for typing (activeElement=${focusState.tag}, contenteditable=${focusState.editable})`);

  await page.keyboard.type('رواق', { delay: 25 });
  await page.waitForTimeout(350);
  const typed = await page.evaluate(() => document.querySelector('[data-el-id^="text"]')?.innerText.trim());
  assert(typed === 'رواق', `typing straight after placing replaces the «نص جديد» placeholder rather than appending to it (got "${typed}")`);

  // Double-click editing of an EXISTING element keeps working (designer-flow.spec
  // covers the caret; this guards against the fresh-placement change breaking it).
  await page.locator('[data-tool="select"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-el-id^="text"]').first().dblclick();
  await page.waitForTimeout(400);
  assert((await page.locator('[contenteditable="true"]').count()) === 1, 'double-clicking an existing text element still enters edit mode');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // ============================================================
  // 3. حقل مقاس الخطّ يقبل ما يُكتب فيه
  // ============================================================
  const pxField = page.locator('input[type="number"]').first();
  const typeSize = async (value) => {
    await pxField.click({ clickCount: 3 });
    await page.keyboard.press('Meta+a');
    await page.keyboard.type(String(value), { delay: 30 }); // digit by digit, like a hand
    await page.waitForTimeout(250);
    return pxField.inputValue();
  };

  assert((await typeSize('140')) === '140', 'typing 140 into the font-size field yields 140 (it used to clamp per keystroke and settle on 400)');
  const rendered140 = await page.evaluate(() => getComputedStyle(document.querySelector('[data-el-id^="text"]')).fontSize);
  near(parseFloat(rendered140), 140, 1, 'and the canvas really renders at 140px');
  assert((await typeSize('42')) === '42', 'typing 42 yields 42 (used to become 82)');
  assert((await typeSize('26')) === '26', 'typing 26 yields 26 (used to become 86)');

  // The clamp is not removed, only deferred to commit — out-of-range values still
  // settle inside [8,400] once the field is left.
  await typeSize('900');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  assert((await pxField.inputValue()) === '400', 'committing an over-max size still clamps to 400 — the clamp moved, it was not deleted');
  await typeSize('2');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  assert((await pxField.inputValue()) === '8', 'committing an under-min size still clamps to 8');

  // ============================================================
  // 4. أدوات الإنشاء تعمل فوق العناصر القائمة
  // ============================================================
  await bootDemo(page, BASE_URL); // a populated document: elements cover the canvas
  const headGeoBefore = await geoOf(page, 'head');
  const headBox = await page.locator('[data-el-id="head"]').boundingBox();
  const beforeText = await elCount(page);

  await page.locator('[data-tool="text"]').click();
  await page.waitForTimeout(200);
  await page.mouse.click(headBox.x + headBox.width / 2, headBox.y + headBox.height / 2);
  await page.waitForTimeout(500);
  assert((await elCount(page)) === beforeText + 1, 'the text tool creates a text element when clicked ON TOP of an existing element');
  const headGeoAfterText = await geoOf(page, 'head');
  near(headGeoAfterText.x, headGeoBefore.x, 0.5, 'and the element underneath did not move (x)');
  near(headGeoAfterText.y, headGeoBefore.y, 0.5, 'and the element underneath did not move (y)');
  // Undo it, so the next case starts from the same document this one did — the new
  // text sits directly over `head` and would otherwise intercept its clicks.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(300);
  assert((await elCount(page)) === beforeText, 'one undo removes that text again — placing it was a single history step');

  // A shape DRAG that begins over an existing element draws, and leaves that
  // element exactly where it was — this used to displace it by the drag vector.
  const beforeShape = await elCount(page);
  const imgGeoBefore = await geoOf(page, 'img');
  const imgBox = await page.locator('[data-el-id="img"]').boundingBox();
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(250);
  await page.mouse.move(imgBox.x + imgBox.width * 0.3, imgBox.y + imgBox.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(imgBox.x + imgBox.width * 0.3 + 90, imgBox.y + imgBox.height * 0.3 + 70, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  assert((await elCount(page)) === beforeShape + 1, 'dragging the shape tool starting ON TOP of an image draws a shape');
  const imgGeoAfter = await geoOf(page, 'img');
  near(imgGeoAfter.x, imgGeoBefore.x, 0.5, 'and the image underneath did not move (x) — the drag drew, it did not drag the image');
  near(imgGeoAfter.y, imgGeoBefore.y, 0.5, 'and the image underneath did not move (y)');
  assert((await armedTool(page)) === 'select', 'a completed shape returns the tool to select, as the text tool and the shapes library already did');
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(300);
  assert((await elCount(page)) === beforeShape, 'one undo removes that shape again');

  // A bare CLICK (no drag) with the shape tool armed still means "select this" —
  // the shape tool creates by dragging, so a click is free to carry its usual
  // meaning, and qa/shapes-library.spec.mjs requires the insert library to give way.
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(250);
  assert((await page.locator('[data-shape-tile]').count()) > 0, 'setup: the shapes library is open');
  const countBeforeClick = await elCount(page);
  const headBox2 = await page.locator('[data-el-id="head"]').boundingBox();
  await page.mouse.click(headBox2.x + headBox2.width / 2, headBox2.y + headBox2.height / 2);
  await page.waitForTimeout(400);
  assert((await elCount(page)) === countBeforeClick, 'clicking (not dragging) with the shape tool armed creates nothing');
  assert((await page.locator('[data-shape-tile]').count()) === 0, 'it selects instead: the insert library gives way to the element’s properties');

  // The invisible handle ring around a selected element must not swallow a
  // creation gesture either — it extends ~20px OUTSIDE the element's own box.
  await page.locator('[data-tool="select"]').click();
  await page.waitForTimeout(150);
  const headBox3 = await page.locator('[data-el-id="head"]').boundingBox();
  await page.mouse.click(headBox3.x + headBox3.width / 2, headBox3.y + headBox3.height / 2);
  await page.waitForTimeout(250);
  const selBox = await page.locator('[data-el-id="head"]').boundingBox();
  const beforeRing = await elCount(page);
  const headGeoBeforeRing = await geoOf(page, 'head');
  await page.locator('[data-tool="text"]').click();
  await page.waitForTimeout(200);
  await page.mouse.click(selBox.x + selBox.width / 2, selBox.y + selBox.height + 8); // inside the south handle's hit ring
  await page.waitForTimeout(500);
  assert((await elCount(page)) === beforeRing + 1, 'clicking 8px below a SELECTED element with the text tool creates text — the handle ring no longer eats the gesture');
  const headGeoAfterRing = await geoOf(page, 'head');
  near(headGeoAfterRing.h, headGeoBeforeRing.h, 0.5, 'and the selected element was not resized by that click');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // ============================================================
  // 5. لون الشكل: الشريحة تُلوّن ما وُضع من المكتبة، لا الحالة وحدها
  // ============================================================
  await bootBlank(page, BASE_URL, 'ig');
  await page.locator('button', { hasText: /^المكتبة$/ }).first().click();
  await page.waitForTimeout(250);
  await page.locator('button', { hasText: /^الألوان$/ }).first().click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="palette-1"]').click(); // cream / near-black / terracotta
  await page.waitForTimeout(350);

  const shapeBg = () =>
    page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[data-el-id^="shape"]')];
      const last = nodes[nodes.length - 1];
      const inner = last?.querySelector('div');
      return inner ? getComputedStyle(inner).backgroundColor : null;
    });

  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-shape-tile="ellipse"]').click();
  await page.waitForTimeout(700);
  assert((await shapeBg()) === 'rgb(145, 145, 145)', 'a library-placed shape starts on the deliberate placeholder grey');
  await page.locator('button[title="#E07A5F"]').first().click();
  await page.waitForTimeout(500);
  assert((await shapeBg()) === 'rgb(224, 122, 95)', 'clicking the accent swatch actually repaints a LIBRARY-PLACED shape (the swatch used to move its own ring and nothing else)');
  await page.locator('button[title="#1B1B1B"]').first().click();
  await page.waitForTimeout(400);
  assert((await shapeBg()) === 'rgb(27, 27, 27)', 'and a second swatch repaints it again');

  // An open shape (a line) carries its colour on the stroke layer, not a fill —
  // colouring it must follow that, or the line stays grey.
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-shape-tile="line"]').click();
  await page.waitForTimeout(700);
  await page.locator('button[title="#E07A5F"]').first().click();
  await page.waitForTimeout(500);
  const linePaint = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[data-el-id^="shape"]')];
    const last = nodes[nodes.length - 1];
    return last ? last.innerHTML : '';
  });
  assert(/224,\s*122,\s*95|#E07A5F/i.test(linePaint), 'colouring a LINE reaches its stroke layer (its colour lives on the stroke, it has no fill)');

  // ============================================================
  // 6. المعاينة والتصدير يتّفقان على موضع الزخرفة
  // ============================================================
  await bootDemo(page, BASE_URL);
  const deco = await page.evaluate(() => {
    const ab = document.querySelector('[data-testid="artboard"]');
    const abr = ab.getBoundingClientRect();
    const dw = +ab.getAttribute('data-doc-w');
    const dh = +ab.getAttribute('data-doc-h');
    const node = [...ab.children].find((n) => !n.getAttribute('data-el-id') && getComputedStyle(n).borderRadius === '50%');
    if (!node) return null;
    const r = node.getBoundingClientRect();
    const sx = dw / abr.width;
    const sy = dh / abr.height;
    return { cx: (r.x - abr.x + r.width / 2) * sx, cy: (r.y - abr.y + r.height / 2) * sy, r: (r.width / 2) * sx, docW: dw, docH: dh };
  });
  assert(Boolean(deco), 'setup: the populated document paints its accent decoration in the preview');
  // The formula both export paths use: cx = 0.68w + (0.46w)/2, cy = -0.16h + (0.46w)/2.
  const wantCx = 0.68 * deco.docW + (0.46 * deco.docW) / 2;
  const wantCy = -0.16 * deco.docH + (0.46 * deco.docW) / 2;
  near(deco.cx, wantCx, 2, 'preview decoration sits at the SAME x the exporters compute (it used to be mirrored to the opposite edge)');
  near(deco.cy, wantCy, 2, 'preview decoration sits at the same y the exporters compute');

  const posterPng = decodePng(await exportOnce(page, downloadDir, 'PNG', 'ig', 'png'));
  const rightTop = pixelAt(posterPng, 0.91, 0.07);
  const leftTop = pixelAt(posterPng, 0.09, 0.07);
  const centre = pixelAt(posterPng, 0.5, 0.52);
  assert(!sameRgb(rightTop, centre), `the exported PNG carries the decoration on the RIGHT, where the preview now shows it (${JSON.stringify(rightTop)})`);
  assert(sameRgb(leftTop, centre), `and the mirrored LEFT corner is plain background (${JSON.stringify(leftTop)}) — preview and file agree`);

  // ============================================================
  // 7. تصدير SVG يكتم الزخرفة على المستند الفارغ، كما يفعل PNG
  // ============================================================
  await bootBlank(page, BASE_URL, 'ig');
  const blankSvg = fs.readFileSync(await exportOnce(page, downloadDir, 'SVG', 'ig', 'svg'), 'utf8');
  assert(!/<circle/.test(blankSvg), 'an EMPTY document exported as SVG contains no decoration circle — same promise «ابدأ من فراغ» already kept for PNG');

  await bootDemo(page, BASE_URL);
  const posterSvg = fs.readFileSync(await exportOnce(page, downloadDir, 'SVG', 'ig', 'svg'), 'utf8');
  assert(/<circle/.test(posterSvg), 'a POPULATED document still exports its decoration to SVG — the suppression is scoped to empty documents, it did not delete a feature');

  assert(pageErrors.length === 0, `no uncaught runtime errors during the whole journey (${pageErrors.join(' | ') || 'none'})`);

  await browser.close();
  fs.rmSync(downloadDir, { recursive: true, force: true });

  console.log('\n============================================================');
  if (failures.length) {
    console.log('failures:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  console.log(`${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
