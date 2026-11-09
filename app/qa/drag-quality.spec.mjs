#!/usr/bin/env node
// Drag quality: asserts the canvas follows the cursor EXACTLY 1:1 at every zoom level,
// and that the resize/rotate grab targets stay a constant on-screen size.
//
// Why this file exists: the earlier suites drove drags (engine/bugfixes) but only ever
// asserted "it moved" or "the anchor corner held", never that the element travelled the
// same number of screen pixels as the cursor. A missing `/ scale` anywhere in the
// screen -> document conversion would sail through all of them while making the canvas
// feel broken, so every assertion here is a measured number, not a direction.
//
// Run: node qa/drag-quality.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import { bootDemo } from './helpers/boot.mjs';

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:1420';
const HANDLE_PX = 10; // the authored on-screen size of the DRAWN resize handle (see Handles.tsx)
const HIT_PX = 32; // its hit area — a common design tool's measured value (قياسٌ خارجيٌّ موثَّق)
let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error('FAIL:', msg);
  }
}
/** Asserts `got` is within `tol` of `want`, and always reports the numbers. */
function assertNear(got, want, tol, msg) {
  assert(Math.abs(got - want) <= tol, `${msg} — expected ${want.toFixed(2)}, got ${got.toFixed(2)} (off by ${(got - want).toFixed(2)}, tol ${tol})`);
}

const pctOf = (s) => parseFloat(s) / 100;

/** The artboard carries `width: size.w` unscaled plus a `scale()` transform, so its
 * layout size is the document size and its on-screen width / that is the live scale —
 * derived rather than hardcoded, so this file keeps working at any artboard size. */
async function geom(page) {
  const ab = page.locator('[data-testid="artboard"]');
  const layout = await ab.evaluate((n) => ({ w: n.offsetWidth, h: n.offsetHeight }));
  const box = await ab.boundingBox();
  return { docW: layout.w, docH: layout.h, scale: box.width / layout.w };
}

async function docBox(page, id, g) {
  const raw = await page.locator(`[data-el-id="${id}"]`).evaluate((n) => ({ left: n.style.left, top: n.style.top, width: n.style.width, height: n.style.height }));
  return { x: pctOf(raw.left) * g.docW, y: pctOf(raw.top) * g.docH, w: pctOf(raw.width) * g.docW, h: pctOf(raw.height) * g.docH };
}

const screenBox = (page, id) => page.locator(`[data-el-id="${id}"]`).boundingBox();

async function setZoom(page, target) {
  // بمعرّفاتها: الشريط السياقي فوق المحدَّد يحمل «+»/«−» للمقاس كذلك.
  await page.locator('[data-testid="zoom-fit"]').click();
  await page.waitForTimeout(60);
  const steps = Math.round((target - 100) / 10);
  const btn = steps > 0 ? page.locator('[data-testid="zoom-in"]') : page.locator('[data-testid="zoom-out"]');
  for (let i = 0; i < Math.abs(steps); i++) {
    await btn.click();
    await page.waitForTimeout(15);
  }
  await page.waitForTimeout(90);
}

/** Smallest distance (in SCREEN px) from the box to any artboard snap line. Edge/centre
 * snapping engages under 8 screen px and deliberately breaks 1:1, so the drags below
 * aim at landing spots well clear of it — otherwise this file would be asserting
 * against the snapping feature rather than the drag math. */
function snapMarginScreen(b, g) {
  const d = [0 - b.x, g.docW / 2 - (b.x + b.w / 2), g.docW - (b.x + b.w), 0 - b.y, g.docH / 2 - (b.y + b.h / 2), g.docH - (b.y + b.h)];
  return Math.min(...d.map((v) => Math.abs(v) * g.scale));
}

function pickSnapFreeDelta(b, g, xs = [63, -63, 97, -97, 129, -129]) {
  for (const dx of xs) {
    for (const dy of [41, -41, 63, -63, 87, -87, 111, -111]) {
      const after = { ...b, x: b.x + dx / g.scale, y: b.y + dy / g.scale };
      if (snapMarginScreen(after, g) > 16) return [dx, dy];
    }
  }
  throw new Error('no snap-free drag delta available for this layout');
}

/** A real pointer drag: press, several incremental moves, release. */
async function dragBy(page, x, y, dx, dy, steps = 12) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  await page.waitForTimeout(110);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootDemo(page, BASE_URL);
  const undo = page.getByTitle('تراجع');

  // Clicking an element already inside a multi-selection keeps the whole group (so the
  // group can be dragged), so a single selection needs an explicit deselect first.
  const vp = await page.locator('[data-testid="artboard"]').evaluate((n) => {
    const r = n.parentElement.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const selectOnly = async (id) => {
    await page.mouse.click(vp.x + 8, vp.y + vp.h - 120);
    await page.waitForTimeout(70);
    await page.locator(`[data-el-id="${id}"]`).click({ force: true });
    await page.waitForTimeout(90);
  };

  // ============================================================
  // 1:1 element move at zoomed-out, default and zoomed-in scales.
  // The artboard is fit-scaled (~0.38 at "100%"), so a conversion that forgot to divide
  // by the zoom would move the element ~2.7x the cursor here and pass a "did it move" test.
  // ============================================================
  for (const zoom of [100, 200, 50]) {
    await setZoom(page, zoom);
    const g = await geom(page);
    await selectOnly('head');
    const before = await docBox(page, 'head', g);
    const sBefore = await screenBox(page, 'head');
    const [dx, dy] = pickSnapFreeDelta(before, g);
    await dragBy(page, sBefore.x + sBefore.width / 2, sBefore.y + sBefore.height / 2, dx, dy);
    const sAfter = await screenBox(page, 'head');
    const after = await docBox(page, 'head', g);

    assertNear(sAfter.x - sBefore.x, dx, 1, `move@${zoom}%: element tracks the cursor 1:1 horizontally`);
    assertNear(sAfter.y - sBefore.y, dy, 1, `move@${zoom}%: element tracks the cursor 1:1 vertically`);
    // Same claim restated in document units, which is what actually gets saved.
    assertNear(after.x - before.x, dx / g.scale, 1 / g.scale, `move@${zoom}%: document x advances by the cursor delta / zoom`);
    assertNear(after.y - before.y, dy / g.scale, 1 / g.scale, `move@${zoom}%: document y advances by the cursor delta / zoom`);
    await undo.click();
    await page.waitForTimeout(100);
  }

  // ============================================================
  // The grab point stays under the cursor: pressing well off-centre and moving 1px must
  // move the element 1px, not jump its origin/centre to the pointer.
  // ============================================================
  await setZoom(page, 100);
  await selectOnly('head');
  const s0 = await screenBox(page, 'head');
  const gx = s0.x + s0.width * 0.82;
  const gy = s0.y + s0.height * 0.78;
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx + 1, gy + 1);
  await page.waitForTimeout(60);
  const s1 = await screenBox(page, 'head');
  assertNear(s1.x - s0.x, 1, 0.6, 'grab point: a 1px first move moves the element 1px (no snap-to-cursor)');
  assertNear(s1.y - s0.y, 1, 0.6, 'grab point: a 1px first move moves the element 1px vertically');
  await page.mouse.up();
  await page.waitForTimeout(90);
  await undo.click();
  await page.waitForTimeout(100);

  // ============================================================
  // The drag must survive the cursor leaving the element's own box: the logo is ~11
  // screen px wide at 100%, so this gesture spends almost all of its life outside it.
  // ============================================================
  {
    const g = await geom(page);
    await selectOnly('logo');
    const lb = await docBox(page, 'logo', g);
    const ls = await screenBox(page, 'logo');
    assert(ls.width < 20, `setup: the logo really is a tiny target (${ls.width.toFixed(1)}px on screen)`);
    const [dx, dy] = pickSnapFreeDelta(lb, g, [-63, -97, 63]);
    await dragBy(page, ls.x + ls.width / 2, ls.y + ls.height / 2, dx, dy);
    const ls2 = await screenBox(page, 'logo');
    assertNear(ls2.x - ls.x, dx, 1, 'drag keeps tracking after the cursor leaves the element box (x)');
    assertNear(ls2.y - ls.y, dy, 1, 'drag keeps tracking after the cursor leaves the element box (y)');
    await undo.click();
    await page.waitForTimeout(100);
  }

  // ============================================================
  // A flick (two large jumps) must land exactly where the cursor did — a stale-closure
  // or accumulate-per-event implementation drifts or snaps back here.
  // ============================================================
  {
    const g = await geom(page);
    await selectOnly('head');
    const hb = await docBox(page, 'head', g);
    const hs = await screenBox(page, 'head');
    const [dx, dy] = pickSnapFreeDelta(hb, g, [-129, 129, -97]);
    await dragBy(page, hs.x + hs.width / 2, hs.y + hs.height / 2, dx, dy, 2);
    const hs2 = await screenBox(page, 'head');
    assertNear(hs2.x - hs.x, dx, 1, 'fast flick (2 coarse moves) lands exactly on the cursor delta (x)');
    assertNear(hs2.y - hs.y, dy, 1, 'fast flick (2 coarse moves) lands exactly on the cursor delta (y)');
    await undo.click();
    await page.waitForTimeout(100);
  }

  // ============================================================
  // A rotated element translates by the cursor delta too (rotation must not leak into
  // the move conversion), and a multi-selection moves as one rigid group.
  // ============================================================
  {
    const g = await geom(page);
    await selectOnly('badge-label'); // rotated -8deg, and the topmost element at that spot
    const bb = await docBox(page, 'badge-label', g);
    const bs = await screenBox(page, 'badge-label');
    const [dx, dy] = pickSnapFreeDelta(bb, g, [97, 63, -63]);
    await dragBy(page, bs.x + bs.width / 2, bs.y + bs.height / 2, dx, dy);
    const bs2 = await screenBox(page, 'badge-label');
    assertNear(bs2.x - bs.x, dx, 1, 'a rotated element still tracks the cursor 1:1 (x)');
    assertNear(bs2.y - bs.y, dy, 1, 'a rotated element still tracks the cursor 1:1 (y)');
    await undo.click();
    await page.waitForTimeout(100);
  }

  {
    await setZoom(page, 200);
    const g = await geom(page);
    await selectOnly('head');
    await page.locator('[data-el-id="discount"]').click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(80);
    const a = await docBox(page, 'head', g);
    const b = await docBox(page, 'discount', g);
    const union = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) };
    const [dx, dy] = pickSnapFreeDelta(union, g, [-63, 63, -97, 97]);
    const hs = await screenBox(page, 'head');
    const ds = await screenBox(page, 'discount');
    await dragBy(page, hs.x + hs.width / 2, hs.y + hs.height / 2, dx, dy);
    const hs2 = await screenBox(page, 'head');
    const ds2 = await screenBox(page, 'discount');
    assertNear(hs2.x - hs.x, dx, 1, 'multi-select @200%: the grabbed element tracks the cursor (x)');
    assertNear(hs2.y - hs.y, dy, 1, 'multi-select @200%: the grabbed element tracks the cursor (y)');
    assertNear(ds2.x - ds.x, dx, 1, 'multi-select @200%: the other element moves by the same delta (x)');
    assertNear(ds2.y - ds.y, dy, 1, 'multi-select @200%: the other element moves by the same delta (y)');
    await undo.click();
    await page.waitForTimeout(110);
  }

  // ============================================================
  // Resize handles: the grabbed corner follows the cursor 1:1 at every zoom, and the
  // handles themselves stay a constant on-screen size. They live inside the artboard's
  // zoom transform, so authoring them as a flat `10px` once shrank them to ~1.9 screen
  // px at 50% zoom — present in the DOM, and far too small to actually grab.
  // ============================================================
  for (const zoom of [50, 100, 200, 400]) {
    await setZoom(page, zoom);
    await selectOnly('head');
    // Hit area and painted size are now two separate concerns, so they are measured
    // separately.
    //
    // `[data-handle-paint]` is the visible chrome — still HANDLE_PX at every zoom,
    // which is what this block always meant to pin.
    //
    // `[data-handle]` is the real grab target, raised toward a common design tool's measured 32px
    // (قياسٌ خارجيٌّ موثَّق: 32px-thick hit areas with full-length edge
    // handles, while "the visible corner dot and edge pill are far smaller than
    // 32px — the hit area is deliberately oversized and the affordance is drawn
    // small"). But 32 cannot be applied unconditionally: two opposing 32px handles
    // blanket the interior of any selection whose short side is under ~64 screen px,
    // leaving no way to *move* the element — the same defect this file's tiny-selection
    // assertion below was written for. So the hit size is capped by the selection
    // itself, and the expected value is recomputed here from the measured selection
    // rather than loosened to "big enough", so the arithmetic stays pinned exactly.
    const selScreen = await screenBox(page, 'head');
    const shortSide = Math.min(selScreen.width, selScreen.height);
    const wantHit = Math.max(HANDLE_PX, Math.min(HIT_PX, (shortSide - HANDLE_PX) / 2));
    for (const h of ['se', 'rotate']) {
      const pb = await page.locator(`[data-handle-paint="${h}"]`).boundingBox();
      assertNear(pb.width, HANDLE_PX, 1, `handle "${h}" @${zoom}%: the DRAWN handle stays ${HANDLE_PX}px wide on screen`);
      assertNear(pb.height, HANDLE_PX, 1, `handle "${h}" @${zoom}%: the DRAWN handle stays ${HANDLE_PX}px tall on screen`);
      const hb = await page.locator(`[data-handle="${h}"]`).boundingBox();
      assertNear(hb.width, wantHit, 1, `handle "${h}" @${zoom}%: the HIT area is max(${HANDLE_PX}, min(${HIT_PX}, (shortSide−${HANDLE_PX})/2)) for this ${shortSide.toFixed(1)}px selection`);
      assertNear(hb.height, wantHit, 1, `handle "${h}" @${zoom}%: the HIT area holds that size on the other axis too`);
      assert(hb.width > pb.width, `handle "${h}" @${zoom}%: the grab target is strictly larger than the chrome drawn for it`);
      assert(hb.width >= HANDLE_PX - 0.5, `handle "${h}" @${zoom}%: the hit area never regresses below the ${HANDLE_PX}px it used to be`);
    }
  }

  // **المسكُ الحرّ يُقاس في الوضع الاحترافي.** منذ ٢٤ أكتوبر ٢٠٢٦ مساءً صار المسكُ
  // الافتراضيّ على الصورة مسكَ الأداة الشائعة (قرار المالك: «نفس الأداة الشائعة للوضع البسيط في الصور،
  // واذا اختار احترافي يتحول اكثر الى أداة المتّجهات»): زاويةُ النصّ تكبّر الصندوق متناسبًا
  // والخطَّ معه، فلا تتبع المؤشّرَ على المحورين معًا. والزاوية الحرّة التي يقيسها هذا القسم
  // — «الزاوية تحت المؤشّر ١:١ عرضًا وطولًا» — هي مسكُ أداة المتّجهات، فتُقاس حيث تعيش.
  // ومسكُ الأداة الشائعة مقيسٌ في `tour-fixes.spec.mjs` §١٧.
  await page.locator('[data-testid="more-tools-btn"]').click();
  await page.locator('[data-testid="pro-toggle"]').click();
  await page.waitForTimeout(120);

  // The resize gesture itself stops at 150%: past that the headline's se corner sits
  // outside the (overflow-hidden) stage viewport, so there is nothing there to press.
  // (It stopped at 200% until 24 October 2026. The approved layout gave the canvas the
  // room the bottom timeline and the side panel used to take, so "fit" is a larger
  // scale and the same corner leaves the stage one step earlier — under the add rail
  // at 200%. The 1:1 claim is unchanged and still measured above 100%.)
  for (const zoom of [50, 100, 150]) {
    await setZoom(page, zoom);
    const g = await geom(page);
    await selectOnly('head');
    const before = await docBox(page, 'head', g);
    const se = await page.locator('[data-handle="se"]').boundingBox();
    const [rdx, rdy] = [55, 37];
    await dragBy(page, se.x + se.width / 2, se.y + se.height / 2, rdx, rdy);
    const after = await docBox(page, 'head', g);
    assertNear((after.w - before.w) * g.scale, rdx, 1, `resize se @${zoom}%: the corner follows the cursor 1:1 (width)`);
    assertNear((after.h - before.h) * g.scale, rdy, 1, `resize se @${zoom}%: the corner follows the cursor 1:1 (height)`);
    await undo.click();
    await page.waitForTimeout(110);
  }

  // A selection far smaller than the handles must still be movable: the handles ring it
  // from outside so the interior keeps starting a move, not a resize.
  await setZoom(page, 100);
  await selectOnly('logo');
  const centreHandle = await page.evaluate(() => {
    const r = document.querySelector('[data-el-id="logo"]').getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return el?.getAttribute('data-handle') ?? null;
  });
  assert(centreHandle === null, `a tiny selection's centre is not covered by a resize handle (found "${centreHandle}")`);

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
