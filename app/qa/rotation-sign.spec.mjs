#!/usr/bin/env node
// اتجاهُ الدوران وإشارتُه — مثبَّتان بالقياس في اللوحة وفي الملفّ المُصدَّر معًا.
//
// لماذا هذه المواصفة موجودة. حلقةُ المحاكاة على الهدف المنشور الحقيقيّ
// (`qa/replication/targets/t02-kashida`) سلّمت شريطًا نعناعيًّا مائلًا إلى
// الجهة المعاكسة بنفس المقدار — وهذا توقيعُ قلبِ إشارة. والسؤال الذي كان يجب أن
// يُجاب بالقياس لا بالظنّ: هل اتجاهُ الدوران في مزيج مقلوب، أم أن الإشارة لم تصل
// أصلًا؟
//
// الجواب المقيس: الاتجاهُ سليمٌ ومتّسقٌ في خمسة مواضع (مقبضُ الدوران، رقمُ اللوح،
// تحويلُ اللوحة، تصديرُ PNG، تصديرُ SVG) — موجبٌ = مع عقارب الساعة كـCSS وSVG،
// واللوحةُ والملفُّ المُصدَّر يتّفقان. والعطل كان أن حقلَ `∠` **لا يَقبل إشارةً
// سالبة مكتوبة**: يُبتلع «‑» ويُبقي المقدار، فـ‎‑٢٫٣°‏ تصير ‎+٢٫٣°‏. انظر
// `NumField` في `PropsTab.tsx`.
//
// فالبنود أدناه تُثبّت الأمرين معًا حتى لا يَنقلب أحدهما صامتًا:
//   ١) موجبٌ = مع عقارب الساعة، في اللوحة وفي الملفّ المُصدَّر، بنفس الإشارة.
//   ٢) السالبُ المكتوب يَصِل كما كُتب — رقمًا، ولوحةً، وملفًّا.
//   ٣) مقبضُ الدوران مسحوبًا باتجاه عقارب الساعة يُعطي رقمًا موجبًا في اللوح،
//      فما يراه المصمّم يوافق ما يقرأه.
//   ٤) السالبُ المكتوب يَصِل في بقيّة حقول التحويل وفي إزاحة الظلّ كذلك.
//
// Run: node qa/rotation-sign.spec.mjs   (dev server must be running on :1420)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';
import { bootBlank } from './helpers/boot.mjs';
import { decodePng, pixelAt, parseHex, colorDistance } from './replication/lib/png.mjs';

const BASE_URL = 'http://localhost:1420';
const DOC = { w: 1080, h: 1350 };
const CREAM = '#f4f1ea';
const MINT = '#cfe5d8';
// شريطٌ طويلٌ ضيّق: أصلحُ شكلٍ لقياس الميل، لأن حافّته اليسرى تُزاح إزاحةً كبيرة
// عن دورانٍ صغير. مركزه (٢٩٩٫٥، ١٠٠٥) ليس مركزَ اللوحة، فالقياس يُثبت الدوران
// حول مركز العنصر لا حول مركز الصفحة.
const BAR = { x: 224, y: 650, w: 151, h: 710 };
const SCAN_HI = 1000 / DOC.h;
const SCAN_LO = 1330 / DOC.h;

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
const sleep = (page, ms) => page.waitForTimeout(ms);

function geoField(page, key) {
  return page.locator('label').filter({ has: page.locator(`span:text-is("${key}")`) }).locator('input[type="number"]');
}
async function typeInto(locator, page, value) {
  await locator.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(String(value), { delay: 16 });
  await sleep(page, 140);
}
async function addShape(page, tile) {
  await page.locator('[data-tool="shape"]').click();
  await sleep(page, 320);
  await page.locator(`[data-shape-tile="${tile}"]`).click();
  await sleep(page, 520);
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all.length ? all[all.length - 1].getAttribute('data-el-id') : null;
  });
}
async function setFillHex(page, elId, hex) {
  const sel = `[data-testid^="appearance-fill-${elId}-"][data-testid$="-hex"]`;
  await typeInto(page.locator(sel).first(), page, hex);
  await sleep(page, 160);
}
async function setBox(page, box) {
  for (const [k, v] of [['X', box.x], ['Y', box.y], ['W', box.w], ['H', box.h]]) {
    await typeInto(geoField(page, k), page, v);
  }
}
async function setAngle(page, deg) {
  await typeInto(geoField(page, '∠'), page, deg);
  await page.keyboard.press('Enter');
  await sleep(page, 250);
}

/** الميلُ كما يراه المصمّم على اللوحة: إزاحةُ الحافّة اليسرى للصندوق بين أعلاه
 * وأسفله، محسوبةً من تحويل العنصر نفسه لا من صندوقه المحيط (الصندوق المحيط
 * متناظر فلا يُظهر إشارة). سالبٌ = الأسفل أزيحَ يسارًا = مع عقارب الساعة. */
async function canvasDxDown(page, elId) {
  return page.evaluate((id) => {
    const node = [...document.querySelectorAll(`[data-el-id="${id}"]`)].pop();
    const m = new DOMMatrix(getComputedStyle(node).transform);
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const map = (lx, ly) => m.transformPoint(new DOMPoint(lx - w / 2, ly - h / 2));
    return map(0, h).x - map(0, 0).x;
  }, elId);
}
/** زاويةُ تحويل اللوحة مقروءةً من المصفوفة: `rotate(θ)` ⇒ a=cosθ, b=sinθ،
 * وy إلى أسفل، فـb>0 = مع عقارب الساعة. */
async function canvasAngle(page, elId) {
  return page.evaluate((id) => {
    const node = [...document.querySelectorAll(`[data-el-id="${id}"]`)].pop();
    const m = new DOMMatrix(getComputedStyle(node).transform);
    return (Math.atan2(m.b, m.a) * 180) / Math.PI;
  }, elId);
}
/** الحافّةُ اليسرى للشريط عند ارتفاعٍ نسبيّ، بالبكسل، في الملفّ المُصدَّر. */
function edgeXAt(img, fy) {
  const bg = parseHex(CREAM);
  for (let i = 0; i < Math.round(0.6 * img.width); i++) {
    const f = i / (img.width - 1);
    if (colorDistance(pixelAt(img, f, fy), bg) >= 20) return f * img.width;
  }
  return null;
}

async function exportPng(page, dir, name) {
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await sleep(page, 320);
  await page.locator('button:has-text("PNG")').first().click();
  await sleep(page, 140);
  await page.locator('[data-testid="export-scale-1"]').click();
  await sleep(page, 120);
  const tiles = await page.locator('[data-testid^="export-target-"]').evaluateAll((els) =>
    els.map((el) => ({ id: el.getAttribute('data-testid').replace('export-target-', ''), on: el.getAttribute('data-on') === 'true' })),
  );
  for (const t of tiles) {
    if (t.on !== (t.id === 'ig-portrait')) {
      await page.locator(`[data-testid="export-target-${t.id}"]`).click();
      await sleep(page, 60);
    }
  }
  const dl = page.waitForEvent('download', { timeout: 90000 });
  await page.locator('button', { hasText: /^تصدير (ملف واحد|ملفين|\d+ ملفات)$/ }).first().click();
  const download = await dl;
  const out = path.join(dir, `${name}.png`);
  await download.saveAs(out);
  await page.keyboard.press('Escape');
  await sleep(page, 260);
  return out;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-rotsign-'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  await bootBlank(page, BASE_URL, 'ig-portrait');
  await page.locator('button', { hasText: /^احترافي$/ }).first().click();
  await sleep(page, 280);

  const bg = await addShape(page, 'rect');
  await setBox(page, { x: 0, y: 0, w: DOC.w, h: DOC.h });
  await setFillHex(page, bg, CREAM);
  const bar = await addShape(page, 'rect');
  await setBox(page, BAR);
  await setFillHex(page, bar, MINT);
  assert((await geoField(page, 'W').inputValue()) === '151', 'setup: the bar is 151px wide, so the geometry fields took the typed numbers');

  // --- ١) موجبٌ = مع عقارب الساعة، لوحةً وملفًّا ---
  await setAngle(page, 30);
  assert((await geoField(page, '∠').inputValue()) === '30', 'typed +30 is the number the ∠ field reports back');
  const a30 = await canvasAngle(page, bar);
  assert(Math.abs(a30 - 30) < 0.01, `canvas transform for +30 is +30° clockwise, not ${a30.toFixed(2)}°`);
  const cd30 = await canvasDxDown(page, bar);
  assert(cd30 < -300, `+30 leans the bar's bottom LEFT on canvas (clockwise, CSS convention): dx(down) ${cd30.toFixed(1)} must be negative`);
  const png30 = decodePng(await exportPng(page, dir, 'pos30'));
  const e30hi = edgeXAt(png30, SCAN_HI);
  const e30lo = edgeXAt(png30, SCAN_LO);
  assert(e30hi !== null && e30lo !== null, '+30: the bar is found at both scan heights in the exported PNG');
  const ed30 = e30lo - e30hi;
  assert(ed30 < -40, `+30 leans the SAME way in the exported PNG as on canvas: export dx(down) ${ed30.toFixed(1)} must be negative`);
  assert(Math.sign(ed30) === Math.sign(cd30), 'canvas and export agree on the SIGN of a positive rotation — no preview/export divergence');

  // --- ٢) السالبُ المكتوب يَصِل كما كُتب ---
  // هذا هو البندُ الذي كان يسقط: كتابةُ «‑30» كانت تُنتج «030» أي ‎+٣٠.
  await setAngle(page, -30);
  assert((await geoField(page, '∠').inputValue()) === '-30', 'a typed NEGATIVE angle survives: the ∠ field reports -30, not 30 or 030');
  const aNeg = await canvasAngle(page, bar);
  assert(Math.abs(aNeg + 30) < 0.01, `canvas transform for -30 is -30° (anti-clockwise), not ${aNeg.toFixed(2)}°`);
  const cdNeg = await canvasDxDown(page, bar);
  assert(cdNeg > 300, `-30 leans the bar's bottom RIGHT on canvas: dx(down) ${cdNeg.toFixed(1)} must be positive`);
  const pngNeg = decodePng(await exportPng(page, dir, 'neg30'));
  const eNhi = edgeXAt(pngNeg, SCAN_HI);
  const eNlo = edgeXAt(pngNeg, SCAN_LO);
  assert(eNhi !== null && eNlo !== null, '-30: the bar is found at both scan heights in the exported PNG');
  const edNeg = eNlo - eNhi;
  assert(edNeg > 40, `-30 leans the SAME way in the exported PNG as on canvas: export dx(down) ${edNeg.toFixed(1)} must be positive`);
  assert(Math.sign(edNeg) === Math.sign(cdNeg), 'canvas and export agree on the SIGN of a negative rotation too');
  assert(Math.sign(edNeg) === -Math.sign(ed30), '+30 and -30 lean OPPOSITE ways in the export — the sign is carried, not swallowed');

  // --- a fractional negative, the exact value the published target needs ---
  await setAngle(page, -2.3);
  assert((await geoField(page, '∠').inputValue()) === '-2.3', 'a typed fractional negative (-2.3) survives whole — minus sign and decimal both');
  const aFrac = await canvasAngle(page, bar);
  assert(Math.abs(aFrac + 2.3) < 0.02, `-2.3 reaches the canvas as -2.30°, not ${aFrac.toFixed(2)}°`);
  const pngFrac = decodePng(await exportPng(page, dir, 'neg2p3'));
  const fHi = edgeXAt(pngFrac, SCAN_HI);
  const fLo = edgeXAt(pngFrac, SCAN_LO);
  // الهندسةُ المقيسة من الهدف المنشور: ٢٢٣ عند ١٠٠٠ و٢٣٦ عند ١٣٣٠ — فرقٌ ‎+١٣ بكسلًا.
  assert(fHi !== null && Math.abs(fHi - 223) <= 3, `-2.3 puts the bar's left edge at x≈223 at y=1000 (got ${fHi === null ? 'none' : fHi.toFixed(1)})`);
  assert(fLo !== null && Math.abs(fLo - 236) <= 3, `-2.3 puts it at x≈236 at y=1330 (got ${fLo === null ? 'none' : fLo.toFixed(1)})`);
  assert(fLo - fHi > 8 && fLo - fHi < 18, `-2.3 creeps the edge ~13px RIGHT going down, as the real published target does: got ${(fLo - fHi).toFixed(1)}px`);

  // --- ٣) مقبضُ الدوران: ما يراه المصمّم يوافق ما يقرأه ---
  await setAngle(page, 0);
  const barNode = page.locator(`[data-el-id="${bar}"]`).last();
  await barNode.click({ position: { x: 40, y: 200 } });
  await sleep(page, 300);
  const handle = page.locator('[data-handle="rotate"]');
  assert((await handle.count()) > 0, 'the rotate handle is present on the selected shape');
  const hb = await handle.boundingBox();
  const bbox = await barNode.boundingBox();
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  const r = Math.hypot(hb.x + hb.width / 2 - cx, hb.y + hb.height / 2 - cy);
  const a0 = Math.atan2(hb.y + hb.height / 2 - cy, hb.x + hb.width / 2 - cx);
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  for (let s = 1; s <= 10; s++) {
    // y إلى أسفل، فزيادةُ الزاوية هنا = دورانٌ مع عقارب الساعة بصريًّا.
    const a = a0 + ((25 * Math.PI) / 180) * (s / 10);
    await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a));
    await sleep(page, 25);
  }
  await page.mouse.up();
  await sleep(page, 360);
  const dragShown = Number(await geoField(page, '∠').inputValue());
  assert(dragShown > 15 && dragShown < 35, `dragging the rotate handle visually CLOCKWISE reports a POSITIVE angle in the panel (got ${dragShown})`);
  const dragDx = await canvasDxDown(page, bar);
  assert(dragDx < 0, 'and that clockwise drag leans the bar the clockwise way on canvas — panel number and rendered result agree');

  // --- ٤) السالبُ المكتوب في بقيّة حقول التحويل ---
  await setAngle(page, 0);
  await typeInto(geoField(page, 'X'), page, -120);
  await page.keyboard.press('Enter');
  await sleep(page, 240);
  assert((await geoField(page, 'X').inputValue()) === '-120', 'a typed negative X survives — an element can be pushed off the LEFT edge by typing');
  const left = await page.evaluate((id) => getComputedStyle([...document.querySelectorAll(`[data-el-id="${id}"]`)].pop()).left, bar);
  assert(parseFloat(left) < 0, `and the canvas honours it: rendered left is ${left}, off the artboard`);
  await typeInto(geoField(page, 'Y'), page, -90);
  await page.keyboard.press('Enter');
  await sleep(page, 240);
  assert((await geoField(page, 'Y').inputValue()) === '-90', 'a typed negative Y survives too');

  // --- إزاحةُ الظلّ السالبة: ظلٌّ من اليمين/أعلى ---
  await typeInto(geoField(page, 'X'), page, 224);
  await typeInto(geoField(page, 'Y'), page, 650);
  const addShadow = page.locator('[data-testid^="appearance-add-shadow"]').first();
  assert((await addShadow.count()) > 0, 'the appearance stack offers a shadow layer');
  await addShadow.click();
  await sleep(page, 420);
  const offs = page.locator('[data-testid^="appearance-shadow-"]').first().locator('input[type="number"]');
  assert((await offs.count()) >= 2, 'the shadow row exposes offset X and Y fields');
  await typeInto(offs.nth(0), page, -12);
  await sleep(page, 220);
  assert((await offs.nth(0).inputValue()) === '-12', 'a typed negative shadow offset X survives — a shadow can be cast from the RIGHT');
  await typeInto(offs.nth(1), page, -7);
  await sleep(page, 220);
  assert((await offs.nth(1).inputValue()) === '-7', 'a typed negative shadow offset Y survives — cast from ABOVE');

  // --- الحالاتُ الوسيطة لا تُلزِم ولا تُمحى ---
  await typeInto(geoField(page, '∠'), page, 12);
  await page.keyboard.press('Enter');
  await sleep(page, 220);
  const angField = geoField(page, '∠');
  await angField.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.press('Backspace');
  await sleep(page, 220);
  const afterClear = await canvasAngle(page, bar);
  assert(Math.abs(afterClear - 12) < 0.01, `clearing the field mid-edit does NOT write 0 to the document — the angle is still 12°, got ${afterClear.toFixed(2)}°`);
  await page.keyboard.type('-', { delay: 20 });
  await sleep(page, 220);
  const afterMinus = await canvasAngle(page, bar);
  assert(Math.abs(afterMinus - 12) < 0.01, `and typing a lone "-" does not write 0 either — still 12°, got ${afterMinus.toFixed(2)}°`);
  await page.keyboard.type('45', { delay: 24 });
  await sleep(page, 260);
  assert((await geoField(page, '∠').inputValue()) === '-45', 'finishing "-45" after that lone minus commits -45, with no stray leading zero');
  const afterFull = await canvasAngle(page, bar);
  assert(Math.abs(afterFull + 45) < 0.02, `and the canvas shows -45°, got ${afterFull.toFixed(2)}°`);
  await angField.blur();
  await sleep(page, 220);
  assert((await geoField(page, '∠').inputValue()) === '-45', 'leaving the field keeps -45 on screen — the draft is dropped, not the value');

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (pageErrors.length) {
    console.log('Console/page errors observed during the run:');
    pageErrors.forEach((e) => console.log(' -', e));
  }
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
