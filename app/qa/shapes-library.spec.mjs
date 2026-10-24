#!/usr/bin/env node
// مكتبة الأشكال — قياسات، لا انطباعات.
//
// Why this file exists: the owner rated Mazij 2/10 and said "pressing Shapes shows no
// shapes menu". The diagnosis was sharper than the complaint — he pressed a *tool*
// expecting a *library*. `ShapeDrawKind` held exactly two kinds and the picker that
// chose between them was gated on `state.mode === 'pro'`, so in the default simple
// mode clicking Shapes rendered literally nothing.
//
// So every assertion below is a number a designer could read off the screen, taken
// through real pointer and keyboard events against the running app:
//   - every shape in the inventory places and lands in document state;
//   - the click-placement size is 30% of page width at two different artboard sizes
//     (the أداة تصميم شائعة rule is a *proportion*, so one artboard proves nothing);
//   - each modifier key changes the resulting geometry in the specific way claimed —
//     including Option being a deliberate NO-OP on polygon/star;
//   - one placement = exactly one undo step;
//   - each shape's geometry reaches BOTH the PNG rasterizer and the SVG serializer.
//
// Measured references cited inline: docs/re-canva-flows.md §2.1/§2.2/§2.4/§3.2,
// docs/re-illustrator-flows.md §2.4, docs/re-capcut-flows.md §2.1/§2.4/§2.6.
//
// Run: node qa/shapes-library.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import { bootDemo, switchToTimed } from './helpers/boot.mjs';

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

/** Asserts a measurement, and always prints the numbers so a failure is diagnosable
 * without re-running. Sub-pixel layout rounding is not a bug; anything a designer
 * could see is. */
function near(got, want, tol, msg) {
  assert(Math.abs(got - want) <= tol, `${msg} — expected ${want}, got ${Number(got).toFixed(2)} (tol ${tol})`);
}

const pctOf = (s) => parseFloat(s) / 100;

/** The artboard carries its document width as its *layout* width plus a `scale()`
 * transform, so layout size is the document size — derived, not hardcoded, so this
 * file keeps working at any artboard size. (Same helper as qa/drag-quality.spec.mjs.) */
async function geom(page) {
  const ab = page.locator('[data-testid="artboard"]');
  const layout = await ab.evaluate((n) => ({ w: n.offsetWidth, h: n.offsetHeight }));
  const box = await ab.boundingBox();
  return { docW: layout.w, docH: layout.h, scale: box.width / layout.w, screen: box };
}

/** The element's box in DOCUMENT px, read off the inline percentage style the
 * renderer actually wrote — not a screen measurement divided back out. */
async function docBox(page, id, g) {
  const raw = await page.locator(`[data-el-id="${id}"]`).evaluate((n) => ({ left: n.style.left, top: n.style.top, width: n.style.width, height: n.style.height }));
  return { x: pctOf(raw.left) * g.docW, y: pctOf(raw.top) * g.docH, w: pctOf(raw.width) * g.docW, h: pctOf(raw.height) * g.docH };
}

const idsOf = (page) => page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));

/** A real drag: press, several incremental moves so `pointermove` genuinely fires,
 * release. A single jump start→end is how synthetic tests miss drag bugs — the app
 * sees one move event and gets the right answer by luck. */
async function drawDrag(page, g, from, to, { shift = false, alt = false, spaceBy = null, arrowUp = 0 } = {}) {
  const sx = g.screen.x + from.x * g.scale;
  const sy = g.screen.y + from.y * g.scale;
  const ex = g.screen.x + to.x * g.scale;
  const ey = g.screen.y + to.y * g.scale;
  if (shift) await page.keyboard.down('Shift');
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(sx + ((ex - sx) * i) / 10, sy + ((ey - sy) * i) / 10);
    await page.waitForTimeout(8);
  }
  for (let i = 0; i < arrowUp; i++) {
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(25);
  }
  if (spaceBy) {
    // Space held *during* the drag must reposition the in-progress shape without
    // releasing the button (أداة متّجهات's universal modifier, §2.4).
    await page.keyboard.down('Space');
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(ex + (spaceBy.x * g.scale * i) / 6, ey + (spaceBy.y * g.scale * i) / 6);
      await page.waitForTimeout(10);
    }
    await page.keyboard.up('Space');
  }
  await page.mouse.up();
  await page.waitForTimeout(130);
  if (shift) await page.keyboard.up('Shift');
  if (alt) await page.keyboard.up('Alt');
}

/** Arms the shape tool for a canvas drag.
 *
 * 24 October 2026: the button that arms it now lives in the floating tool pill and
 * **only arms** — the approved layout split drawing tools (أداة متّجهات letters, the
 * pill) from what gets added (the أداة تصميم شائعة add rail). A library that opened with M
 * shoved the canvas 300px sideways at the moment the drag began. The محرّر فيديو شائع rule
 * («every rail button swaps a panel») still holds, for the add rail — asserted below
 * through `openLibraryPanel`. */
const armShapeTool = async (page) => {
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(90);
};

/** Brings the SHAPES grid on screen — through «عناصر» in the add rail, which opens
 * the shapes library (and toggles it closed on a second press, hence the guard). */
const openLibraryPanel = async (page) => {
  if (!(await page.locator('[data-shape-tile]').count())) await page.locator('[data-panel-tab="library"]').click();
  await page.waitForTimeout(100);
};

/** Places one library tile by clicking it and returns the new element's id.
 * A CLICK — no drag anywhere in this helper. That is the claim being tested. */
async function placeTile(page, tileId) {
  await openLibraryPanel(page);
  const before = await idsOf(page);
  await page.locator(`[data-shape-tile="${tileId}"]`).click();
  await page.waitForTimeout(140);
  const after = await idsOf(page);
  const added = after.filter((id) => !before.includes(id));
  return { id: added[0] ?? null, added: added.length, before: before.length, after: after.length };
}

/** Counts real vertices in a rendered path shape by parsing the `d` the renderer
 * emitted — the geometry as painted, not as intended. */
async function pathVertexCount(page, id) {
  const d = await page.locator(`[data-el-id="${id}"] svg path`).getAttribute('d');
  if (!d) return 0;
  return (d.match(/[ML]/g) || []).length;
}

const SIZES_UNDER_TEST = [
  { label: 'Instagram 1080×1080 (default)', option: null, w: 1080, h: 1080 },
  { label: 'TikTok 1080×1920', option: 'size-option-tt', w: 1080, h: 1920 },
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
  });

  // كُتِبت هذه الحزمة قبل أن تهبط شاشة البداية، فكانت تفترض أن التطبيق يفتح على
  // المحرّر مباشرةً. لم يعد كذلك — يفتح على سؤال. و`bootDemo` هو المسار الصحيح هنا
  // تحديدًا لا `bootBlank`: تأكيدات كثيرة أدناه تَعُدّ العناصر قبل الإضافة وبعدها،
  // فلو أقلعنا على مستند فارغ لصار كل عدٍّ مرجعيّ صفرًا وفقدت المقارنة معناها.
  await bootDemo(page, BASE_URL);
  await page.waitForTimeout(350);

  // ───────────────────────────────────────────────────────────────────────────
  // 1. الزرّ يبدّل لوحًا — ولا أداة صامتة
  //
  // محرّر فيديو شائع's #1 ranked finding is structural, not cosmetic: a toolbar button must
  // swap a CONTENT PANEL, never a silent canvas mode. It has 11 tabs and every one
  // repaints the library panel, so "I pressed it and nothing happened" is
  // structurally impossible there (§2.1, §5.1). Mazij's rail called `setTool()` and
  // nothing else — for EVERY tool, not just Shapes. That is the real root of the
  // complaint, so it is asserted for every tool in the rail.
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1. kull zirr yubaddil lawhan — every rail button swaps a panel');

  assert((await page.locator('[data-panel-tab="library"]').count()) === 1, 'the panel shell has a real "العناصر" (Elements) tab — أداة تصميم شائعة\'s own name for the panel that holds Shapes (§2.1)');

  await openLibraryPanel(page);
  const tileCount = await page.locator('[data-shape-tile]').count();
  assert(tileCount >= 10, `pressing Shapes renders a real browsable grid, not nothing (got ${tileCount} tiles)`);
  const readyCount = await page.locator('[data-shape-status="ready"]').count();
  const soonCount = await page.locator('[data-shape-status="soon"]').count();
  assert(readyCount >= 10, `the inventory ships at least 10 working shapes (got ${readyCount})`);
  assert(soonCount > 0, `unfinished sections are SHOWN disabled with «قريبًا», not hidden (got ${soonCount})`);

  // Dead-but-clickable is forbidden in this project, absolutely. A «قريبًا» tile
  // must be a real `disabled` button that cannot mutate the document.
  const soonDisabled = await page.locator('[data-shape-status="soon"]').first().evaluate((b) => b.disabled);
  assert(soonDisabled, 'a «قريبًا» tile is genuinely `disabled` — visibly disabled, never dead-but-clickable');
  const idsBeforeSoon = (await idsOf(page)).length;
  await page.locator('[data-shape-status="soon"]').first().click({ force: true });
  await page.waitForTimeout(120);
  assert((await idsOf(page)).length === idsBeforeSoon, 'force-clicking a «قريبًا» tile changes the document by exactly nothing');

  // Shapes is the only library built; every OTHER rail tool must still produce a
  // visible, named response. Silence is not an acceptable state for any of them.
  // The rule resolves two ways, and which way is right per tool is a deliberate
  // decision recorded in `TOOL_LIBRARY` (src/data/constants.ts):
  //
  //   - a tool with nothing to show yet gets a panel that NAMES it and declares
  //     «قريبًا» — text / audio / fx;
  //   - a tool that already responds keeps the surface it already has, because
  //     replacing that with a placeholder would HIDE working controls, which is a
  //     regression rather than a fix.
  //
  // «نص» خرجت من «قريبًا» في ٢٤ أكتوبر ٢٠٢٦: بُنيت مكتبتها (عنوان، فرعي، نص، أنماط
  // جاهزة) — وهو الطريق الذي كتبه `TOOL_LIBRARY` نفسه: «بدِّل 'soon' إلى 'ready'».
  // فالعقد نفسه بالدرجة الأعلى: الضغط على «نص» يفتح لوحًا **فيه محتوى**، لا صمت.
  // وبابُها «نصوص» في شريط الإضافة. أمّا T في حبّة الأدوات فيُسلِّح الكتابة على اللوحة
  // (أداة المتّجهات) — وأثرها ظاهرٌ كذلك: تلميحٌ يقول «انقر واكتب»، لا صمت.
  await page.locator('[data-rail="text"]').click();
  await page.waitForTimeout(90);
  assert((await page.locator('[data-testid="text-library"]').count()) === 1, 'pressing «نصوص» in the add rail opens the real text library (heading / subheading / body / ready styles) — never silence');
  assert((await page.locator('[data-testid="library-soon-text"]').count()) === 0, '…and no longer a «قريبًا» placeholder');
  await page.locator('[data-tool="text"]').click();
  await page.waitForTimeout(90);
  assert((await page.locator('[data-testid="tool-hint"]').count()) === 1, 'and the pill\'s T arms text-on-canvas with a visible hint — not silence either');
  // «تأثيرات» و«صوت» بابان للمستند المُوقَّت في شريط الإضافة (كما في تصوّر «الزمن»)،
  // فيُقاسان بعد `switchToTimed` أدناه.

  // image / lottie / video open a file picker on click — about the most unmistakable
  // response a button can give — so they must NOT be handed a «قريبًا» panel that
  // buries the Design panel behind it.
  //
  // «فيديو» is one of the two rail destinations that belong to a **timed** document
  // (`DocSnapshot.medium`, video branch phase 1): a square poster is not a video's
  // destination, so the button is not offered there — and comes back the instant the
  // document says it is video. That is said here with the real size menu rather than
  // assumed, and it is not «قريبًا» over anything: the tool is fully built, it is
  // simply out of place on a still. The geometry assertions above deliberately ran
  // first, on the default 1080×1080 artboard they are about.
  await switchToTimed(page);
  for (const tool of ['fx', 'audio']) {
    await page.locator(`[data-tool="${tool}"]`).click();
    await page.waitForTimeout(90);
    const shown = await page.locator(`[data-testid="library-soon-${tool}"]`).count();
    assert(shown === 1, `pressing "${tool}" opens a panel that names the tool and declares «قريبًا» — never silence`);
  }
  for (const tool of ['image', 'lottie', 'video']) {
    await page.locator(`[data-tool="${tool}"]`).click();
    await page.waitForTimeout(90);
    assert((await page.locator(`[data-testid="library-soon-${tool}"]`).count()) === 0, `"${tool}" is NOT given a «قريبًا» panel — clicking it already opens a file picker, so a placeholder would only hide the Design panel`);
    const panelText = (await page.locator('[data-panel-tab="props"]').evaluate((b) => b.closest('div').parentElement.parentElement.innerText)) ?? '';
    assert(panelText.trim().length > 20, `"${tool}": the panel still shows real content rather than going blank (${panelText.trim().length} chars)`);
  }
  // …and back to the square poster, because `SIZES_UNDER_TEST`'s first entry is
  // «whatever the document currently is, which is 1080×1080». Reversing it is one
  // gesture, which is the whole argument for a filter over a gate.
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForSelector('[data-testid="size-menu"]');
  await page.locator('[data-testid="size-option-ig"]').click();
  await page.waitForTimeout(220);

  // The pen is the sharpest case, and it caught a real regression during this work:
  // its controls live in the Design panel gated on the ACTIVE TOOL
  // (`const isPen = state.tool === 'pen'` in PropsTab.tsx). Handing it a «قريبًا»
  // library hid a built, working toolset — and broke qa/pen-smoothing.spec.mjs,
  // qa/text-on-path.spec.mjs and qa/image-editing.spec.mjs at once. Pinned here so
  // the same mistake cannot return by flipping one table entry.
  // لا «بسيط/احترافي» منذ ٢٤ أكتوبر ٢٠٢٦ (قرار المالك: «العمق يُطلب ولا يُفرض») — كلّ الأدوات حاضرة.
  await page.waitForTimeout(160);
  await page.locator('[data-tool="pen"]').click();
  await page.waitForTimeout(180);
  assert((await page.locator('[data-testid="library-soon-pen"]').count()) === 0, 'the pen is NOT given a «قريبًا» panel');
  assert((await page.locator('[data-testid="pen-close-path-toggle"]').count()) === 1, "the pen's own Design-panel controls stay reachable while the pen is selected — a placeholder library here would hide tools that already work");
  // (كان هنا ضغطٌ على «بسيط» للرجوع — لا وضعين بعد ٢٤ أكتوبر ٢٠٢٦.)
  // 'select' is deliberately NOT a library: it has no content to browse, so it
  // returns the panel to Design (the selection's properties). That is a behaviour,
  // not an absence of one — and محرّر فيديو شائع's #4 finding is exactly an inspector bound
  // to the selection (§5.4).
  await page.locator('[data-tool="select"]').click();
  await page.waitForTimeout(120);
  const selectPanelActive = await page.locator('[data-panel-tab="props"]').evaluate((b) => b.style.background !== 'transparent');
  assert(selectPanelActive, 'choosing "تحديد" returns the panel to Design rather than leaving a stale library open');

  // And the same rule from the other direction: touching an existing element on the
  // canvas moves the designer from INSERTING to EDITING, so the library gives way to
  // the element's properties. Without this the library stays open over a fresh
  // selection and the designer sees no properties for what they just clicked — which
  // is precisely how qa/image-editing.spec.mjs broke during this work: a drag meant to
  // draw a shape landed on an existing one, moved it instead, and so never triggered
  // the placement path that swaps the panel back.
  await openLibraryPanel(page);
  assert((await page.locator('[data-shape-tile]').count()) > 0, 'setup: the shapes library is open');
  await page.locator('[data-el-id="head"]').click({ force: true });
  await page.waitForTimeout(160);
  assert((await page.locator('[data-shape-tile]').count()) === 0, 'selecting an element on the canvas closes the insert library');
  const afterSelectProps = await page.locator('[data-panel-tab="props"]').evaluate((b) => b.style.background !== 'transparent');
  assert(afterSelectProps, "…and shows the Design panel instead, so the selection's own properties are what the designer finds");

  // ───────────────────────────────────────────────────────────────────────────
  // 2. كل شكل في الجرد يُوضَع فعلًا
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2. kull shakl yuwdaʿ — every shape in the inventory places');

  // The previous block ended on the Select tool, which (correctly) swapped the panel
  // back to Design — so the shapes library has to be reopened before enumerating it.
  await openLibraryPanel(page);
  // The panel tab is also a real way back in, once a shapes library is the remembered
  // one: assert that before relying on the rail button for the rest of the run.
  await page.locator('[data-panel-tab="props"]').click();
  await page.waitForTimeout(90);
  await page.locator('[data-panel-tab="library"]').click();
  await page.waitForTimeout(120);
  assert((await page.locator('[data-shape-tile]').count()) > 0, 'the "العناصر" panel tab reopens the shapes grid — the panel is pinned and persistent, not a flyout that has to be re-triggered from the rail (§2.1)');
  const inventory = await page.locator('[data-shape-status="ready"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-shape-tile')));
  assert(inventory.length === readyCount, `enumerated the whole ready inventory (${inventory.join(', ')})`);

  // The minimum inventory the brief names, each by name, so a silently-dropped
  // shape fails loudly instead of shrinking the count quietly.
  for (const required of ['rect', 'roundRect', 'ellipse', 'triangle', 'line', 'arrow']) {
    assert(inventory.includes(required), `inventory contains "${required}"`);
  }
  assert(inventory.some((t) => t.startsWith('pentagon') || t.startsWith('hexagon') || t.startsWith('octagon')), 'inventory contains an n-sided polygon');
  assert(inventory.some((t) => t.startsWith('star')), 'inventory contains an n-pointed star');

  for (const tile of inventory) {
    const r = await placeTile(page, tile);
    assert(r.added === 1, `"${tile}": one click places exactly one element (${r.before} → ${r.after})`);
    if (r.id) {
      // It must not merely exist in the DOM — it must have real painted geometry.
      const paints = await page.locator(`[data-el-id="${r.id}"] svg path, [data-el-id="${r.id}"] > div`).count();
      assert(paints > 0, `"${tile}": the placed element renders real geometry (path or filled box), not an empty node`);
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(120);
    }
  }

  // Shape-specific geometry, read from the painted `d`. A polygon that places as a
  // rectangle would pass a bare "an element appeared" check.
  const triangle = await placeTile(page, 'triangle');
  near(await pathVertexCount(page, triangle.id), 3, 0, 'triangle: the painted path has exactly 3 vertices');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(110);

  const hexagon = await placeTile(page, 'hexagon');
  near(await pathVertexCount(page, hexagon.id), 6, 0, 'hexagon: the painted path has exactly 6 vertices');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(110);

  const star5 = await placeTile(page, 'star5');
  // A 5-pointed star is 10 alternating vertices: 5 outer tips + 5 inner notches.
  near(await pathVertexCount(page, star5.id), 10, 0, '5-pointed star: 10 alternating vertices (5 tips + 5 notches)');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(110);

  const lineEl = await placeTile(page, 'line');
  near(await pathVertexCount(page, lineEl.id), 2, 0, 'line: the painted path has exactly 2 vertices');
  const lineClosed = await page.locator(`[data-el-id="${lineEl.id}"] svg path`).getAttribute('d');
  assert(!/Z/.test(lineClosed), 'line: the painted path is OPEN (no Z) — a line is not a degenerate filled polygon');
  const lineStroke = await page.locator(`[data-el-id="${lineEl.id}"] svg path`).evaluate((n) => ({ fill: n.getAttribute('fill'), width: Number(n.getAttribute('stroke-width')) }));
  assert(lineStroke.fill === 'none' && lineStroke.width > 0, `line: painted with a stroke and no fill (fill=${lineStroke.fill}, stroke-width=${lineStroke.width})`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(110);

  // A closed library shape carries NO stroke — أداة تصميم شائعة measures "Stroke: none" on a
  // freshly placed shape (§2.4). Before this change `migrateAppearance` handed every
  // `shape:'path'` a mandatory 2px stroke inherited from hand-drawn pen paths.
  const starForStroke = await placeTile(page, 'star6');
  const starStroke = await page.locator(`[data-el-id="${starForStroke.id}"] svg path`).evaluate((n) => ({ stroke: n.getAttribute('stroke'), width: Number(n.getAttribute('stroke-width')) }));
  assert(starStroke.stroke === 'none' || starStroke.width === 0, `a placed star has NO stroke, matching أداة تصميم شائعة's measured default (stroke=${starStroke.stroke}, width=${starStroke.width})`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(110);

  // ───────────────────────────────────────────────────────────────────────────
  // 3. الحجم الافتراضي نسبةٌ من عرض الصفحة، لا عددَ بكسلات
  //
  // أداة تصميم شائعة measured: a click places 324×324 at (378, 513) on a 1080×1350 page.
  //   324 = 1080 × 0.30 exactly · (1080−324)/2 = 378 ✓ · (1350−324)/2 = 513 ✓
  // So the rule is a PROPORTION of page width, which is why it looks right on a
  // 1080×1350 post and a 1080×1920 reel alike (§2.4). One artboard cannot prove a
  // proportion, so this runs at two — and the shape must stay SQUARE in px at both,
  // which is the part a fractional w/h model gets wrong if it stores 0.30 for both.
  //
  // Independently corroborated: محرّر فيديو شائع's added element defaults to 320×320 on a
  // 1080-wide canvas (§2.6) = 0.296. Two unrelated products, both ≈30%.
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3. al-hajm nisba la pixels — the default size is a proportion of page width');

  for (const sz of SIZES_UNDER_TEST) {
    if (sz.option) {
      await page.locator('[data-testid="size-menu-button"]').click();
      await page.waitForTimeout(140);
      await page.locator(`[data-testid="${sz.option}"]`).click();
      await page.waitForTimeout(260);
    }
    const g = await geom(page);
    near(g.docW, sz.w, 1, `${sz.label}: artboard really is ${sz.w} wide`);
    near(g.docH, sz.h, 1, `${sz.label}: artboard really is ${sz.h} tall`);

    const placed = await placeTile(page, 'rect');
    const b = await docBox(page, placed.id, g);
    const expectSide = sz.w * 0.3;
    near(b.w, expectSide, 1.5, `${sz.label}: width is 30% of page width (${expectSide})`);
    near(b.h, expectSide, 1.5, `${sz.label}: SQUARE in px — height equals width, not 30% of height`);
    near(b.x, (sz.w - expectSide) / 2, 1.5, `${sz.label}: horizontally centred exactly`);
    near(b.y, (sz.h - expectSide) / 2, 1.5, `${sz.label}: vertically centred exactly`);

    // The measured أداة تصميم شائعة placeholder grey. Not black, not the brand colour, not
    // transparent: a placed shape must read as "a placeholder awaiting a decision".
    const bg = await page.locator(`[data-el-id="${placed.id}"] > div`).first().evaluate((n) => getComputedStyle(n).backgroundColor);
    assert(bg === 'rgb(145, 145, 145)', `${sz.label}: fill is أداة تصميم شائعة's measured placeholder grey #919191 (got ${bg})`);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(130);
  }

  // A third, non-preset size proves the rule is arithmetic rather than two
  // hardcoded cases.
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(140);
  await page.locator('[data-testid="size-option-custom"]').click();
  await page.waitForTimeout(120);
  await page.locator('[data-testid="custom-size-w"]').fill('800');
  await page.locator('[data-testid="custom-size-h"]').fill('600');
  await page.locator('[data-testid="custom-size-apply"]').click();
  await page.waitForTimeout(320);
  {
    const g = await geom(page);
    const placed = await placeTile(page, 'ellipse');
    const b = await docBox(page, placed.id, g);
    near(b.w, 240, 1.5, 'custom 800×600: width is 30% of 800 = 240 — the proportion, not a remembered pixel count');
    near(b.h, 240, 1.5, 'custom 800×600: still square in px');
    near(b.x, 280, 1.5, 'custom 800×600: centred horizontally ((800−240)/2)');
    near(b.y, 180, 1.5, 'custom 800×600: centred vertically ((600−240)/2)');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(130);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. خطوة تراجع واحدة
  //
  // "Did one undo put it back" is the question a designer actually asks. A drag that
  // wrote a history entry per pointermove would pass "it disappeared" and fail this.
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4. khatwat tarajuʿ wahida — one placement, exactly one undo step');

  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(140);
  await page.locator('[data-testid="size-option-ig"]').click();
  await page.waitForTimeout(280);

  {
    const base = (await idsOf(page)).length;
    const placed = await placeTile(page, 'star5');
    assert((await idsOf(page)).length === base + 1, 'click-place: the document grew by one element');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(160);
    assert((await idsOf(page)).length === base, 'click-place: ONE undo removes it completely');
    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(160);
    assert((await idsOf(page)).length === base + 1, 'click-place: redo brings it back — the step is a real, reversible history entry');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(160);
    assert((await idsOf(page)).length === base, 'click-place: and undo removes it again');
    assert(placed.id !== null, 'click-place: the placement reported a real element id');
  }

  {
    // Same contract for a drag-drawn shape: the drag streams many pointermoves but
    // must leave exactly one entry on the undo stack.
    const g = await geom(page);
    const base = (await idsOf(page)).length;
    await armShapeTool(page);
    await drawDrag(page, g, { x: g.docW * 0.3, y: g.docH * 0.015 }, { x: g.docW * 0.55, y: g.docH * 0.075 });
    assert((await idsOf(page)).length === base + 1, 'drag-draw: a drag of 10 pointermoves adds exactly one element');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(160);
    assert((await idsOf(page)).length === base, 'drag-draw: ONE undo removes it — the drag wrote one history step, not ten');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. مفاتيح المُعدِّلات أثناء السحب
  //
  // `Stage.tsx` previously read NO modifiers at all during shape creation — a plain
  // min/abs box. These are the densest piece of a trained designer's muscle memory
  // and their absence is a large part of why the app felt wrong (§2.4 أداة متّجهات).
  //
  // The subtlety that matters: `Shift` does NOT mean one thing. Equal w/h for a
  // box-like shape, but 45° ANGLE quantisation for a line. A single naive
  // "constrain aspect ratio" implementation would be wrong for lines.
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5. mufatih al-muʿaddilat — the modifier keys, per shape family');

  // A pointerdown inside the top strip (y below ~0.09 of the page) is clear of every
  // default element, so it always starts a fresh draw instead of grabbing something.
  const P0 = (g) => ({ x: g.docW * 0.3, y: g.docH * 0.02 });
  const DX = 260;
  const DY = 95;

  /** Draws once with the given modifiers, measures the resulting box in document px,
   * then undoes so each case starts from the same document. */
  async function measureDraw(page, tileToArm, opts) {
    // Arming via a library tile also places one shape, so it is undone immediately;
    // what survives the undo is the armed kind (`shapeDrawKind` is UI state, not
    // document state, so history never touches it).
    if (tileToArm) {
      await placeTile(page, tileToArm);
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(130);
    }
    const g = await geom(page);
    await armShapeTool(page);
    const before = await idsOf(page);
    const p0 = P0(g);
    await drawDrag(page, g, p0, { x: p0.x + DX, y: p0.y + DY }, opts);
    const after = await idsOf(page);
    const id = after.filter((x) => !before.includes(x))[0];
    if (!id) return { id: null, box: null, g, p0 };
    const box = await docBox(page, id, g);
    const d = (await page.locator(`[data-el-id="${id}"] svg path`).count()) ? await page.locator(`[data-el-id="${id}"] svg path`).getAttribute('d') : null;
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(140);
    return { id, box, d, g, p0 };
  }

  // --- baseline: no modifier, plain box ---
  const plain = await measureDraw(page, 'rect', {});
  assert(plain.box !== null, 'drag-draw works in the DEFAULT (simple) mode — the pro gate that made Shapes inert is gone');
  near(plain.box.w, DX, 3, 'no modifier: width is the raw drag delta');
  near(plain.box.h, DY, 3, 'no modifier: height is the raw drag delta (an un-constrained box)');
  near(plain.box.x, plain.p0.x, 3, 'no modifier: the box starts at the press point (corner origin)');

  // --- Shift on a rect: equal width and height ---
  const shiftRect = await measureDraw(page, null, { shift: true });
  near(shiftRect.box.w, shiftRect.box.h, 1.5, 'Shift + rect: width and height are made EQUAL (they differed by 165px without it)');
  near(shiftRect.box.w, DX, 3, 'Shift + rect: the larger axis leads, so the square is the drag\'s longer extent');
  assert(Math.abs(plain.box.h - shiftRect.box.h) > 100, `Shift demonstrably CHANGED the geometry (h ${plain.box.h.toFixed(1)} → ${shiftRect.box.h.toFixed(1)})`);

  // --- Shift on a LINE: 45° quantisation, not equal w/h ---
  const plainLine = await measureDraw(page, 'line', {});
  const shiftLine = await measureDraw(page, null, { shift: true });
  {
    // The painted `d` holds the line's two endpoints in box fractions; combined with
    // the box in document px that gives the real on-page angle.
    const pts = (shiftLine.d || '').match(/-?[\d.]+/g)?.map(Number) ?? [];
    assert(pts.length >= 4, `Shift + line: the painted path exposes two endpoints (got ${pts.length} numbers)`);
    const ax = pts[0] * shiftLine.box.w;
    const ay = pts[1] * shiftLine.box.h;
    const bx = pts[2] * shiftLine.box.w;
    const by = pts[3] * shiftLine.box.h;
    const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    const off45 = Math.min(...[-180, -135, -90, -45, 0, 45, 90, 135, 180].map((m) => Math.abs(angle - m)));
    near(off45, 0, 1.5, `Shift + line: the angle is quantised to a multiple of 45° (got ${angle.toFixed(2)}°)`);

    const plainPts = (plainLine.d || '').match(/-?[\d.]+/g)?.map(Number) ?? [];
    const pAngle = (Math.atan2(plainPts[3] * plainLine.box.h - plainPts[1] * plainLine.box.h, plainPts[2] * plainLine.box.w - plainPts[0] * plainLine.box.w) * 180) / Math.PI;
    const pOff45 = Math.min(...[-180, -135, -90, -45, 0, 45, 90, 135, 180].map((m) => Math.abs(pAngle - m)));
    assert(pOff45 > 5, `the un-modified line was NOT already on a 45° multiple (${pAngle.toFixed(2)}°), so the quantisation above is a real effect`);
    // And Shift on a line must NOT be the box-constrain rule.
    assert(Math.abs(shiftLine.box.w - shiftLine.box.h) > 10 || Math.abs(angle % 90) < 1, 'Shift + line applied the 45° rule, not the equal-w/h rule — the two families get different meanings from the same key');
  }

  // --- Option/Alt: draw from centre ---
  const altRect = await measureDraw(page, 'rect', { alt: true });
  near(altRect.box.w, DX * 2, 4, 'Option + rect: width DOUBLES — the press point became the centre, not a corner');
  near(altRect.box.h, DY * 2, 4, 'Option + rect: height doubles too');
  near(altRect.box.x, plain.p0.x - DX, 4, 'Option + rect: the box now extends to BOTH sides of the press point');

  // --- Option is a deliberate NO-OP on polygon/star ---
  //
  // مزوّد كبير explicitly EXCLUDES polygons and stars from the draw-from-centre modifier
  // because those shapes are already centre-origin, so the modifier would be
  // meaningless (§2.4). So the implementation honours the *reason*: they are always
  // centre-origin, which makes Option naturally inert. Asserting the no-op proves
  // the exclusion is real and not an accident of a shared code path.
  const polyPlain = await measureDraw(page, 'hexagon', {});
  const polyAlt = await measureDraw(page, null, { alt: true });
  near(polyAlt.box.w, polyPlain.box.w, 1.5, 'Option + polygon: width UNCHANGED — polygons are already centre-origin, so مزوّد كبير excludes them from this modifier');
  near(polyAlt.box.h, polyPlain.box.h, 1.5, 'Option + polygon: height unchanged as well');
  near(polyPlain.box.w, DX * 2, 4, 'polygon without Option is ALREADY drawn from the centre (width is twice the drag) — which is exactly why Option has nothing left to do');

  // --- Space: reposition the in-progress shape without releasing ---
  const SPACE_BY = { x: 120, y: 70 };
  const spaced = await measureDraw(page, 'rect', { spaceBy: SPACE_BY });
  near(spaced.box.w, plain.box.w, 3, 'Space during the drag: the box KEEPS its size exactly');
  near(spaced.box.h, plain.box.h, 3, 'Space during the drag: height kept too');
  near(spaced.box.x - plain.box.x, SPACE_BY.x, 4, 'Space during the drag: the whole box translated by the cursor delta (x)');
  near(spaced.box.y - plain.box.y, SPACE_BY.y, 4, 'Space during the drag: and by the cursor delta (y) — repositioned mid-draw, button never released');

  // --- ↑/↓ during the drag changes the shape's defining parameter ---
  //
  // أداة متّجهات's one universal rule: an arrow key during a drag changes the shape's
  // defining parameter — polygon sides, star points, arc angle, spiral winds (§2.4).
  // One binding, several meanings, resolved by the active shape. This is what makes
  // "polygon (n-sided)" true at the moment of drawing rather than a fixed hexagon.
  const polyArrow = await measureDraw(page, 'hexagon', { arrowUp: 2 });
  {
    const verts = (polyArrow.d.match(/[ML]/g) || []).length;
    near(verts, 8, 0, 'ArrowUp ×2 while drawing a hexagon: the result has 8 sides, not 6 — n is genuinely parametric during the gesture');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. كل شكل يصل إلى PNG و SVG
  //
  // Driven through the app's own `renderArtboardPng` / `renderArtboardSvg` and the
  // same `shapeGeometryFor` factory the editor uses — so this cannot pass by
  // reimplementing the geometry in the test. PNG is asserted by reading real pixels;
  // SVG by reading the emitted markup.
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n6. at-tasdir — every shape reaches both PNG and SVG export');

  const exportResult = await page.evaluate(async () => {
    const expMod = await import('/src/lib/exportArtboard.ts');
    const shapeMod = await import('/src/lib/shapeFactory.ts');
    const size = { w: 400, h: 400 };
    const palette = { bg: '#000000', fg: '#ffffff', ac: '#ffb703' };
    const anim = { preset: 'none', start: 0, duration: 1, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} };

    const out = [];
    for (const tile of shapeMod.READY_TILES) {
      const g = shapeMod.shapeGeometryFor(tile.recipe);
      const el = {
        id: `x-${tile.id}`,
        type: 'shape',
        visible: true,
        locked: false,
        opacity: 100,
        maskId: null,
        // Full-bleed on purpose: the centre pixel then lies inside every closed
        // silhouette, so one probe point works for all of them.
        geo: { x: 0, y: 0, w: 1, h: 1, rotation: 0 },
        shape: g.shape,
        fill: shapeMod.PLACEHOLDER_FILL,
        fillToken: 'ac',
        stroke: null,
        strokeWidth: g.closed === false ? 8 : 0,
        radius: g.radius,
        ...(g.points ? { points: g.points, closed: g.closed } : {}),
        appearance: shapeMod.libraryAppearance(tile.recipe, size.w),
        anim,
      };

      // --- PNG: real pixels off the real rasterizer ---
      const blob = await expMod.renderArtboardPng({ size, palette, elements: [el], transparent: true, lang: 'ar', scale: 1 });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(size.w, size.h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      // A line is a thin diagonal, so its own midpoint is the only reliable probe;
      // every closed shape contains the artboard centre.
      const px = ctx.getImageData(size.w / 2, size.h / 2, 1, 1).data;
      const pngAlpha = px[3];
      const pngGrey = px[0] === 145 && px[1] === 145 && px[2] === 145;

      // --- SVG: the real serializer's markup ---
      const svg = await expMod.renderArtboardSvg({ size, palette, elements: [el], transparent: true, lang: 'ar' }).text();
      const vertexCount = g.points ? g.points.length : null;
      let svgHasGeometry;
      if (g.shape === 'rect') svgHasGeometry = /<rect /.test(svg);
      else if (g.shape === 'ellipse') svgHasGeometry = /<ellipse /.test(svg);
      else {
        const d = svg.match(/<path d="([^"]+)"/)?.[1] ?? '';
        // The SVG must carry the SAME vertex count as the factory produced — not
        // merely "a path element exists".
        svgHasGeometry = (d.match(/[ML]/g) || []).length === vertexCount;
      }
      const svgStrokeOnClosed = /stroke="/.test(svg);

      out.push({ id: tile.id, kind: tile.recipe.kind, closed: g.closed !== false, pngAlpha, pngGrey, svgHasGeometry, svgStrokeOnClosed, svgLen: svg.length, vertexCount });
    }
    return out;
  });

  for (const r of exportResult) {
    if (r.closed) {
      assert(r.pngAlpha > 250, `PNG export, "${r.id}": the shape paints real opaque pixels at the artboard centre (alpha ${r.pngAlpha})`);
      assert(r.pngGrey, `PNG export, "${r.id}": painted in the placeholder grey the element actually carries`);
      assert(!r.svgStrokeOnClosed, `SVG export, "${r.id}": emits NO stroke — so SVG agrees with PNG instead of adding the old mandatory 2px path stroke`);
    }
    assert(r.svgHasGeometry, `SVG export, "${r.id}": the serialized markup carries this shape's own geometry${r.vertexCount ? ` (all ${r.vertexCount} vertices)` : ''}`);
    assert(r.svgLen > 120, `SVG export, "${r.id}": produced a real non-empty document (${r.svgLen} bytes)`);
  }

  // The line is the one open shape: it must reach both exporters as a STROKE.
  const lineExport = await page.evaluate(async () => {
    const expMod = await import('/src/lib/exportArtboard.ts');
    const shapeMod = await import('/src/lib/shapeFactory.ts');
    const size = { w: 400, h: 400 };
    const palette = { bg: '#000000', fg: '#ffffff', ac: '#ffb703' };
    const anim = { preset: 'none', start: 0, duration: 1, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} };
    const g = shapeMod.shapeGeometryFor({ kind: 'line' });
    const el = {
      id: 'line-x', type: 'shape', visible: true, locked: false, opacity: 100, maskId: null,
      geo: { x: 0, y: 0, w: 1, h: 1, rotation: 0 }, shape: g.shape, fill: shapeMod.PLACEHOLDER_FILL, fillToken: 'ac',
      stroke: null, strokeWidth: 20, radius: 0, points: g.points, closed: g.closed,
      appearance: { fills: [], strokes: [{ id: 's', visible: true, opacity: 1, width: 20, position: 'center', color: shapeMod.PLACEHOLDER_FILL, colorToken: null }], shadows: [] },
      anim,
    };
    const blob = await expMod.renderArtboardPng({ size, palette, elements: [el], transparent: true, lang: 'ar', scale: 1 });
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(size.w, size.h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    // The default library line is horizontal through the box centre.
    const on = ctx.getImageData(size.w / 2, size.h / 2, 1, 1).data;
    const off = ctx.getImageData(size.w / 2, 20, 1, 1).data;
    const svg = await expMod.renderArtboardSvg({ size, palette, elements: [el], transparent: true, lang: 'ar' }).text();
    const d = svg.match(/<path d="([^"]+)"/)?.[1] ?? '';
    return {
      onAlpha: on[3], offAlpha: off[3],
      svgFillNone: /<path[^>]*fill="none"/.test(svg),
      svgStrokeWidth: Number(svg.match(/stroke-width="([\d.]+)"/)?.[1] ?? 0),
      svgVerts: (d.match(/[ML]/g) || []).length,
      svgClosed: /Z/.test(d),
    };
  });
  assert(lineExport.onAlpha > 250, `PNG export, line: the stroke paints real pixels along the line (alpha ${lineExport.onAlpha})`);
  assert(lineExport.offAlpha < 10, `PNG export, line: and paints nothing away from it (alpha ${lineExport.offAlpha}) — it is a line, not a filled box`);
  assert(lineExport.svgFillNone, 'SVG export, line: emitted with fill="none"');
  near(lineExport.svgStrokeWidth, 20, 0.01, 'SVG export, line: the stroke width survives into the markup');
  near(lineExport.svgVerts, 2, 0, 'SVG export, line: two endpoints');
  assert(!lineExport.svgClosed, 'SVG export, line: the path is left OPEN (no Z)');

  // ───────────────────────────────────────────────────────────────────────────
  // 7. مقابض أكبر — منطقة الإصابة والمرسوم شيئان
  //
  // أداة تصميم شائعة measures 32px hit areas with FULL-LENGTH edge handles, while drawing the
  // handle itself far smaller (§3.2). Mazij's were 10px for both, because they were
  // one element. drag-quality.spec.mjs owns the per-zoom sizing; this asserts the
  // separation itself and the full-length edge rule.
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n7. al-maqabid — hit area and painted size are separate concerns');

  // يُقاس على الصورة لا على العنوان: منذ ٢٤ أكتوبر ٢٠٢٦ مساءً يُمسَك النصّ على الصورة كما
  // في الأداة الشائعة — بلا مقبضَي فوق/تحت (قرار المالك: «نفس الأداة الشائعة للوضع البسيط في الصور»)،
  // والأداة الشائعة نفسها لا تضعهما للنصّ. وقاعدة «الحافّة بكامل طولها، ٣٢ بكسل» قيست في الأداة الشائعة على
  // تحديدٍ عاديّ، والصورة تُمسَك بها في الوضعين، فهي موضعُ قياسها.
  await page.locator('[data-tool="select"]').click();
  await page.waitForTimeout(100);
  await page.locator('[data-el-id="img"]').click({ force: true });
  await page.waitForTimeout(200);

  const paintBox = await page.locator('[data-handle-paint="se"]').boundingBox();
  const hitBox = await page.locator('[data-handle="se"]').boundingBox();
  const selBox = await page.locator('[data-el-id="img"]').boundingBox();
  // The hit size is capped by the selection so two opposing handles can never blanket
  // its interior (see Handles.tsx) — so the expectation is recomputed from the measured
  // selection rather than loosened, keeping the arithmetic pinned exactly.
  const wantHit = Math.max(10, Math.min(32, (Math.min(selBox.width, selBox.height) - 10) / 2));
  near(paintBox.width, 10, 1, 'the DRAWN corner handle is still 10px — the visible chrome did not grow');
  assert(hitBox.width > paintBox.width * 1.9, `the corner HIT area is far larger than the drawn handle (${hitBox.width.toFixed(1)}px hit vs ${paintBox.width.toFixed(1)}px drawn)`);
  near(hitBox.width, wantHit, 1.5, `the corner hit area is max(10, min(32, (shortSide−10)/2)) for this ${Math.min(selBox.width, selBox.height).toFixed(1)}px selection`);
  assert(wantHit === 32, `this selection is large enough to host أداة تصميم شائعة's full measured 32px, and does (got ${hitBox.width.toFixed(1)})`);

  const nHit = await page.locator('[data-handle="n"]').boundingBox();
  near(nHit.width, selBox.width, 2, 'the top edge handle spans the ENTIRE edge — أداة تصميم شائعة\'s rule, so there is no dead zone along an edge where a drag does nothing');
  near(nHit.height, 32, 1.5, 'and is 32px thick');
  const wHit = await page.locator('[data-handle="w"]').boundingBox();
  near(wHit.height, selBox.height, 2, 'the side edge handle spans the entire edge vertically');
  near(wHit.width, 32, 1.5, 'and is 32px thick');

  // The oversized hit area must not blanket the interior: a corner press still
  // resizes, but a press in the middle must still MOVE the element.
  const centreHandle = await page.evaluate(() => {
    const r = document.querySelector('[data-el-id="img"]').getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return el?.closest('[data-handle]')?.getAttribute('data-handle') ?? null;
  });
  assert(centreHandle === null, `the selection's centre is still NOT covered by any handle, so a press there moves the element (found "${centreHandle}")`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n8. al-akhtaʾ as-samita — silent runtime errors');
  const realErrors = pageErrors.filter((e) => !/favicon|ResizeObserver loop/i.test(e));
  assert(realErrors.length === 0, realErrors.length ? `clean console (got ${realErrors.length}): ${realErrors.slice(0, 4).join(' | ')}` : 'no runtime errors across the whole session');

  await browser.close();

  console.log(`\n${'='.repeat(62)}`);
  console.log(`${pass} passed, ${fail} failed.`);
  if (failures.length) {
    console.log('\nfailures:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('harness crashed:', e);
  process.exit(2);
});
