#!/usr/bin/env node
// زخرفة اللوحة وتتبُّع الأحرف — العطلان اللذان كشفتهما حلقة المحاكاة.
//
// Why this file exists: `qa/replication` was run for the first time on target
// `t01-sidra` — a plain Arabic restaurant post, deliberately built on palette #3 so
// its colours are reachable without any advanced-options detour. The attempt was
// driven entirely through real pointer/keyboard events and exported through the
// app's own dialog (`qa/replication/build-t01.mjs`). It scored 12/12 on the written
// criteria at the first pass — and still looked nothing like the target. Two
// defects that the criteria happen not to cover were doing the damage, and both are
// locked down here by measurement.
//
//   1. زخرفةٌ مفروضة لا تُحذَف. A ~500px accent circle was painted on **every
//      non-empty document**, in the preview and burned into every exported file.
//      It is not an element: it cannot be selected, moved, recoloured or deleted.
//      The 18 October fix suppressed it on an *empty* document only, so "ابدأ من
//      فراغ" held for exactly as long as the document stayed empty — the designer's
//      first shape grew a half-canvas gold disc in the corner they never asked for.
//      Measured cost on the replication target: overall similarity 86.2% with it,
//      94.9% without — the single largest difference between attempt and target.
//      The decoration is now a document field (`DocSnapshot.decorAccent`): off for a
//      blank artboard, on for the starter templates that were composed around it,
//      and flipped by a real control in the Colors pane. Saved documents migrate on
//      the old rule, so no existing file changes appearance.
//
//   2. لا تحكُّم في تتبُّع الأحرف. The target's headline fits its box only because
//      of `letter-spacing: -0.01em`: measured unwrapped it is **761.07px** inside a
//      **760px** box. Mazij had no tracking control at all, so the identical string
//      at the identical size in the identical box broke to two lines — a one-pixel
//      typographic difference that nothing in the whole UI could close. Text
//      elements now carry `tracking` (percent of font size), honoured by the live
//      preview, the canvas/PNG path (including the measurement that decides where
//      lines break) and SVG export.
//
// Run: node qa/decoration-and-tracking.spec.mjs   (dev server must be running on :1420)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { bootBlank, openDemoDocument, resumeAfterReload } from './helpers/boot.mjs';

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

function near(got, want, tol, msg) {
  assert(Math.abs(got - want) <= tol, `${msg} — expected ${want}, got ${Number(got).toFixed(2)} (tol ${tol})`);
}

// ---- PNG decoding: a claim about what is in an exported file is settled by the
// file's bytes, same decoder as still-post-journey/artboards use ----
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
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

/** عدد أسطر الحبر في نطاقٍ رأسي من ملفٍّ مُصدَّر: صفوفٌ متتالية فيها بكسلٌ واحد على
 * الأقل يبتعد عن الخلفيّة. هذا هو القياس الذي يُجيب «أانكسر العنوان سطرين؟» من
 * **الملفّ** لا من ظنٍّ عن الـDOM. */
function inkRowRuns(png, bg, y0, y1, x0, x1) {
  const runs = [];
  let open = null;
  for (let y = y0; y < y1; y++) {
    let any = false;
    for (let x = x0; x < x1 && !any; x++) {
      if (dist(pixelAt(png, x / (png.width - 1), y / (png.height - 1)), bg) >= 60) any = true;
    }
    if (any && !open) open = { a: y };
    if (!any && open) {
      open.b = y - 1;
      runs.push(open);
      open = null;
    }
  }
  if (open) {
    open.b = y1 - 1;
    runs.push(open);
  }
  return runs;
}

/** تصديرٌ واحد عبر نافذة التطبيق نفسها، بمضاعِف ١× وهدفٍ واحد. موضع التصدير حالةٌ
 * تعيش بعد إغلاق النافذة، فكل هدفٍ يُسوّى صراحةً بدل أن يُفترض. */
async function exportOnce(page, downloadDir, format, targetId, ext) {
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(220);
  await page.locator(`button:has-text("${format}")`).first().click();
  await page.waitForTimeout(90);
  const scale1 = page.locator('[data-testid="export-scale-1"]');
  if (await scale1.count()) {
    await scale1.first().click();
    await page.waitForTimeout(70);
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
  const dl = page.waitForEvent('download', { timeout: 40000 });
  await page.locator('button', { hasText: /^تصدير (ملف واحد|ملفين|\d+ ملفات)$/ }).first().click();
  const download = await dl;
  const out = path.join(downloadDir, `probe-${Date.now()}.${ext}`);
  await download.saveAs(out);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(140);
  return out;
}

/** الزخرفة في المعاينة: الابن الوحيد للوحة الذي ليس عنصرًا ونصف قطره ٥٠٪. */
const previewDecor = (page) =>
  page.evaluate(() => {
    const ab = document.querySelector('[data-testid="artboard"]');
    if (!ab) return null;
    const abr = ab.getBoundingClientRect();
    const node = [...ab.children].find((n) => !n.getAttribute('data-el-id') && getComputedStyle(n).borderRadius === '50%');
    if (!node) return null;
    const r = node.getBoundingClientRect();
    const sx = +ab.getAttribute('data-doc-w') / abr.width;
    const sy = +ab.getAttribute('data-doc-h') / abr.height;
    return { cx: (r.x - abr.x + r.width / 2) * sx, cy: (r.y - abr.y + r.height / 2) * sy, docW: +ab.getAttribute('data-doc-w'), docH: +ab.getAttribute('data-doc-h') };
  });

/** يفتح لوح «المكتبة ← الألوان» حيث يعيش مفتاح الزخرفة. */
async function openColorsPane(page) {
  // الألوان في «علامتي» بشريط الإضافة (كانت تبويب «المكتبة»). والبند يُغلق لوحه إن
  // ضُغط وهو مفتوح، فلا يُضغط إلا إن لم يكن ظاهرًا.
  if (!(await page.locator('[data-testid="decor-accent-toggle"]').count())) await page.locator('[data-rail="brand"]').click();
  await page.waitForTimeout(200);
  await page.locator('button', { hasText: /^الألوان$/ }).first().click();
  await page.waitForTimeout(220);
}

/** يضع شكلًا من المكتبة — أبسط «عنصر حقيقي وضعه المستخدم بيده». */
async function placeShape(page, tile) {
  // مكتبة الأشكال في «عناصر» بشريط الإضافة؛ زرّ الشكل في حبّة الأدوات يُسلِّح فقط (٢٤ أكتوبر ٢٠٢٦).
  if (!(await page.locator('[data-shape-tile]').count())) await page.locator('[data-panel-tab="library"]').click();
  await page.waitForTimeout(300);
  await page.locator(`[data-shape-tile="${tile}"]`).click();
  await page.waitForTimeout(500);
}

/** ينشئ نصًّا بأداة النصّ ويكتب فيه مباشرةً، ثم يعيد معرّفه. */
async function addText(page, content) {
  await page.locator('[data-tool="text"]').click();
  await page.waitForTimeout(180);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.mouse.click(ab.x + ab.width * 0.5, ab.y + ab.height * 0.5);
  await page.waitForTimeout(400);
  await page.keyboard.type(content, { delay: 15 });
  await page.waitForTimeout(240);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all.length ? all[all.length - 1].getAttribute('data-el-id') : null;
  });
}

function geoField(page, key) {
  return page.locator('label').filter({ has: page.locator(`span:text-is("${key}")`) }).locator('input[type="number"]');
}

/** تُكتب القيمة رقمًا رقمًا كما تُكتب بيد — لا `fill()`: هذه الحقول مضبوطةٌ بالكامل،
 * وكل ضغطةٍ تمرّ بحالةٍ وسيطة حقيقيّة. وهو بالضبط ما خبّأ عطل حقل مقاس الخطّ عن
 * ١٢٥٤ تأكيدًا قبل اليوم. */
async function typeInto(locator, page, value) {
  await locator.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(String(value), { delay: 16 });
  await page.waitForTimeout(80);
}

async function setBoxPx(page, box) {
  for (const [k, v] of [['X', box.x], ['Y', box.y], ['W', box.w], ['H', box.h]]) {
    if (v === undefined) continue;
    await typeInto(geoField(page, k), page, Math.round(v));
  }
}

async function main() {
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-decor-'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // ============================================================
  // ١. مستندٌ بُني من فراغ لا تنبت فيه زخرفةٌ لم تُطلَب
  // ============================================================
  await bootBlank(page, BASE_URL, 'ig');
  await placeShape(page, 'rect');
  assert((await page.locator('[data-el-id]').count()) === 1, 'setup: a blank document now holds exactly one user-placed element');
  assert((await previewDecor(page)) === null, 'a document the designer built from blank shows NO decoration once it stops being empty — the old rule grew one back on the first element');

  const blankPng = decodePng(await exportOnce(page, downloadDir, 'PNG', 'ig', 'png'));
  const bgOf = (png) => pixelAt(png, 0.5, 0.95);
  assert(sameRgb(pixelAt(blankPng, 0.91, 0.07), bgOf(blankPng)), `and the exported PNG's top-right corner is plain background (${JSON.stringify(pixelAt(blankPng, 0.91, 0.07))}) — the circle used to be burned into the file`);

  const blankSvg = fs.readFileSync(await exportOnce(page, downloadDir, 'SVG', 'ig', 'svg'), 'utf8');
  assert(!/<circle/.test(blankSvg), 'and the SVG export carries no decoration circle either — one document, one picture, whatever the format');

  // ============================================================
  // ٢. والمفتاح يُعيدها: غيابها قرارٌ لا حذفُ ميزة
  // ============================================================
  await openColorsPane(page);
  const toggle = page.locator('[data-testid="decor-accent-toggle"]');
  assert((await toggle.count()) === 1, 'a real control for the decoration exists in the Colors pane — before this there was none anywhere in the UI');
  assert((await toggle.isChecked()) === false, 'and it reads OFF on a document started from blank');

  await toggle.click();
  await page.waitForTimeout(300);
  const deco = await previewDecor(page);
  assert(Boolean(deco), 'switching it on paints the decoration in the preview');
  // نفس معادلة مسارَي التصدير حرفيًّا: cx = 0.68w + (0.46w)/2، cy = -0.16h + (0.46w)/2.
  near(deco.cx, 0.68 * deco.docW + (0.46 * deco.docW) / 2, 2, 'at the exact x both exporters compute');
  near(deco.cy, -0.16 * deco.docH + (0.46 * deco.docW) / 2, 2, 'and the exact y');

  const onPng = decodePng(await exportOnce(page, downloadDir, 'PNG', 'ig', 'png'));
  assert(!sameRgb(pixelAt(onPng, 0.91, 0.07), bgOf(onPng)), 'and the exported PNG now carries it — preview and file still agree, in both states');

  // خطوة تراجعٍ واحدة: الزخرفة صفةُ مستندٍ لا إعدادُ تطبيق.
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(350);
  assert((await previewDecor(page)) === null, 'one ⌘Z takes it off again — flipping it is a single, undoable document edit');
  await page.keyboard.press('Meta+Shift+z');
  await page.waitForTimeout(350);
  assert(Boolean(await previewDecor(page)), 'and redo brings it back');

  // وتبقى بعد دورة الحفظ التلقائي الكاملة.
  await page.waitForTimeout(900);
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  assert(Boolean(await previewDecor(page)), 'the choice survives the autosave round-trip — it is saved with the document, not with the session');

  // ============================================================
  // ٣. القوالب الجاهزة تحتفظ بها — ويستطيع المصمّم إزالتها
  // ============================================================
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.localStorage.removeItem('mazij.autosave.v1'));
  await page.reload({ waitUntil: 'networkidle' });
  await openDemoDocument(page);
  assert(Boolean(await previewDecor(page)), 'the starter demo poster still opens WITH its decoration — it was composed around it, and nothing about that document changed');

  await openColorsPane(page);
  assert((await page.locator('[data-testid="decor-accent-toggle"]').isChecked()) === true, 'and its toggle correctly reads ON');
  await page.locator('[data-testid="decor-accent-toggle"]').click();
  await page.waitForTimeout(300);
  assert((await previewDecor(page)) === null, 'and the designer can now take it off a starter document too — the defect was never the circle, it was that nobody could remove it');
  const starterOffSvg = fs.readFileSync(await exportOnce(page, downloadDir, 'SVG', 'ig', 'svg'), 'utf8');
  assert(!/<circle/.test(starterOffSvg), 'and that removal reaches the exported SVG, not just the screen');

  // ============================================================
  // ٤. تتبُّع الأحرف: فرقُ بكسلٍ واحد لم يكن للواجهة سبيلٌ إليه
  // ============================================================
  // الحالة مأخوذة من هدف المحاكاة حرفيًّا: «مذاق السدرة» بوزن عريض ومقاس ١١٨ في
  // صندوقٍ عرضه ٧٦٠. عرضها الطبيعي ٧٦١٫٠٧ — فتنكسر سطرين بلا تتبُّع، وسطرًا واحدًا
  // بتتبُّع ‑١٪ (= `letter-spacing: -0.01em` في المرجع).
  await bootBlank(page, BASE_URL, 'ig');
  // لا «بسيط/احترافي» منذ ٢٤ أكتوبر ٢٠٢٦ (قرار المالك: «العمق يُطلب ولا يُفرض») — كلّ الأدوات حاضرة.
  await page.waitForTimeout(220);
  const headId = await addText(page, 'مذاق السدرة');
  const sizeField = page.locator('label').filter({ has: page.locator('span:text-is("px")') }).locator('input[type="number"]');
  await typeInto(sizeField, page, 118);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(160);
  await setBoxPx(page, { x: 230, y: 432, w: 760, h: 150 });

  const lineRects = () =>
    page.evaluate((id) => {
      const node = document.querySelector(`[data-el-id="${id}"]`);
      const r = document.createRange();
      r.selectNodeContents(node);
      return [...r.getClientRects()].filter((x) => x.width > 1).length;
    }, headId);

  const trackField = page.locator(`[data-testid="text-tracking-${headId}"]`);
  assert((await trackField.count()) === 1, 'a text element exposes a letter-spacing field — the app had no tracking control of any kind before this');
  assert((await trackField.inputValue()) === '0', 'and it starts at 0, so every document written before it opens unchanged');
  assert((await lineRects()) === 2, 'at tracking 0 the headline breaks to TWO lines in its 760px box — its natural width is 761.07px');

  await typeInto(trackField, page, '-1');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert((await trackField.inputValue()) === '-1', 'typing "-1" digit by digit lands on -1 — the minus sign is not swallowed by a per-keystroke clamp');
  assert((await lineRects()) === 1, 'and at tracking -1% the same string in the same box at the same size fits on ONE line, exactly as the reference does');

  // المعاينة والملفّ يجب أن يتّفقا: القياس الذي يقرّر الكسر داخل التصدير يجب أن
  // يرى التتبُّع نفسه الذي يرسم به، وإلا انكسر السطر في الملفّ وحده.
  const trackedPng = decodePng(await exportOnce(page, downloadDir, 'PNG', 'ig', 'png'));
  const trackedBg = pixelAt(trackedPng, 0.5, 0.95);
  const trackedRuns = inkRowRuns(trackedPng, trackedBg, 400, 660, 200, 1050);
  assert(trackedRuns.length === 1, `and the EXPORTED PNG carries one headline line too, not two (${JSON.stringify(trackedRuns)}) — the wrap measurement honours tracking, not just the drawing`);

  const trackedSvg = fs.readFileSync(await exportOnce(page, downloadDir, 'SVG', 'ig', 'svg'), 'utf8');
  assert(/letter-spacing="-1\.18"/.test(trackedSvg), `and SVG export writes the same tracking as a real attribute, in the file's own px units (118 × -1% = -1.18) — ${(trackedSvg.match(/letter-spacing="[^"]*"/) || ['none'])[0]}`);

  // والقصر موجود، لكنه عند الالتزام لا تحت الإصبع.
  await typeInto(trackField, page, '99');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(260);
  assert((await trackField.inputValue()) === '50', 'committing an over-max tracking still clamps to 50% — the clamp exists, it just never eats an intermediate keystroke');

  assert(pageErrors.length === 0, `no uncaught runtime errors anywhere in this session (${pageErrors.join(' | ') || 'none'})`);

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
