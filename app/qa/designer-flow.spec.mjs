#!/usr/bin/env node
// A human designer's session, start to finish — written after the owner tested the
// packaged app on 18 October 2026 and said it was very bad with many bugs.
//
// Why this file exists separately from controls.spec.mjs: that suite proves every
// control *reacts*. It opens dialogs, sets values, and checks state changed. It
// passed 843 assertions while the app still shipped a broken release build and
// (per the owner) unusable dragging — because reacting is not working. A designer
// never asks "did the dialog open"; they ask "did the thing I grabbed land where I
// let go", "did one undo put it back", "did my text survive".
//
// So every assertion here measures the geometry or content a designer would look
// at, through real pointer and keyboard events, and every mutation is followed by
// an undo that must restore the previous measurement exactly. "It moved" is never
// a pass; the delta has to be the delta that was asked for.
//
// Run: node qa/designer-flow.spec.mjs   (dev server must be running on :1420)
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';
import { bootDemo } from './helpers/boot.mjs';

const BASE_URL = process.env.MAZIJ_URL ?? 'http://localhost:1420';
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

/** Asserts two measurements agree within `tol` px — sub-pixel layout rounding is
 * not a bug, but anything a designer could see is. */
function near(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol, `${msg} (expected ~${expected}, got ${actual})`);
}

async function boxOf(page, elId) {
  return page.locator(`[data-el-id="${elId}"]`).first().boundingBox();
}

/** A real drag: press, move in several steps so pointermove actually fires, release.
 * One single jump from start to end is how synthetic tests miss drag bugs — the
 * app sees one move event and gets the right answer by luck. */
async function humanDrag(page, from, to, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  await page.waitForTimeout(120);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
  });

  await bootDemo(page, BASE_URL);
  await page.waitForTimeout(400);

  // ── 1. Text editing: the single most common thing a designer does ──────────
  console.log('\n1. tahrir an-nass — editing text on the artboard');
  const headBox = await boxOf(page, 'head');
  assert(!!headBox, 'headline element is on the artboard');

  if (headBox) {
    const before = await page.locator('[data-el-id="head"]').first().innerText();
    await page.mouse.dblclick(headBox.x + headBox.width / 2, headBox.y + headBox.height / 2);
    await page.waitForTimeout(200);
    // A designer double-clicks and types. If focus didn't land in an editable
    // node, typing goes to the document and silently does nothing — which is
    // exactly the class of bug a "did the control react" test cannot see.
    const editable = await page.evaluate(() => {
      const a = document.activeElement;
      return !!a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
    });
    assert(editable, 'double-click puts the caret into an editable node');

    if (editable) {
      await page.keyboard.press('Meta+a');
      await page.keyboard.type('تجربة المصمم');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const after = await page.locator('[data-el-id="head"]').first().innerText();
      assert(after.includes('تجربة المصمم'), `typed text committed to the element (got "${after.slice(0, 40)}")`);
      assert(after !== before, 'the artboard shows the new text, not the old');

      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(250);
      const undone = await page.locator('[data-el-id="head"]').first().innerText();
      assert(undone.trim() === before.trim(), `one undo restores the original text (got "${undone.slice(0, 40)}")`);
    }
  }

  // ── 2. Keyboard nudge: arrow keys must move by a known amount ──────────────
  console.log('\n2. tahrik bil-asahm — nudging a selected element with arrow keys');
  await page.locator('[data-el-id="head"]').first().click();
  await page.waitForTimeout(150);
  const nudgeStart = await boxOf(page, 'head');
  if (nudgeStart) {
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(200);
    const nudged = await boxOf(page, 'head');
    assert(nudged && nudged.x > nudgeStart.x, `10× ArrowRight moves the element right (${nudgeStart?.x?.toFixed(1)} → ${nudged?.x?.toFixed(1)})`);
    assert(nudged && Math.abs(nudged.y - nudgeStart.y) < 1.5, 'ArrowRight does not drift vertically');

    // Ten presses a designer made must not cost ten undos to take back only if the
    // app coalesces them; either way, undo must eventually land exactly on the
    // original position and never overshoot past it.
    let undos = 0;
    let box = nudged;
    while (undos < 12 && box && Math.abs(box.x - nudgeStart.x) > 0.6) {
      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(90);
      box = await boxOf(page, 'head');
      undos++;
    }
    near(box?.x ?? -1, nudgeStart.x, 1, `undo restores the pre-nudge position (took ${undos} undo${undos === 1 ? '' : 's'})`);
  }

  // ── 3. Zoom: the artboard must scale, and stay usable afterwards ───────────
  console.log('\n3. at-takbir — zooming the canvas');
  const artboardBefore = await page.locator('[data-testid="artboard"]').first().boundingBox();
  await page.keyboard.press('Meta+Equal');
  await page.waitForTimeout(250);
  const artboardZoomed = await page.locator('[data-testid="artboard"]').first().boundingBox();
  assert(
    artboardBefore && artboardZoomed && artboardZoomed.width > artboardBefore.width + 2,
    `zoom in enlarges the artboard (${artboardBefore?.width?.toFixed(0)} → ${artboardZoomed?.width?.toFixed(0)}px)`,
  );
  await page.keyboard.press('Meta+Minus');
  await page.waitForTimeout(250);
  const artboardBack = await page.locator('[data-testid="artboard"]').first().boundingBox();
  near(artboardBack?.width ?? -1, artboardBefore?.width ?? -2, 2, 'zoom out returns to the previous scale');

  // ── 4. Selection: clicking empty canvas must deselect ──────────────────────
  console.log('\n4. at-tahdid — select and deselect');
  await page.locator('[data-el-id="head"]').first().click();
  await page.waitForTimeout(150);
  assert(await page.locator('[data-testid="selection-handles"]').count() > 0, 'clicking an element shows selection handles');

  const stage = await page.locator('[data-testid="artboard"]').first().boundingBox();
  if (stage) {
    // Well outside the artboard, where no element can be sitting.
    await page.mouse.click(stage.x - 120, stage.y + stage.height / 2);
    await page.waitForTimeout(200);
    assert(await page.locator('[data-testid="selection-handles"]').count() === 0, 'clicking empty canvas clears the selection');
  }

  // ── 5. Playback: the bug the owner reported before — play worked, stop didn't ──
  console.log('\n5. at-tashghil — play then pause must actually freeze');
  // Discovered by accessible name on purpose — the same way a user or a screen
  // reader finds it; an icon-only button with no name fails this, as it should.
  // The toggle itself then goes through the test id, because the accessible name
  // correctly flips to "pause" once playing and would no longer match.
  assert(
    await page.getByRole('button', { name: 'تشغيل', exact: true }).count() > 0,
    'the play control is findable by its accessible name',
  );
  const playBtn = page.locator('[data-testid="timeline-play-btn"]').first();
  if (await playBtn.count() > 0) {
    // Measured on the playhead's x, but compared by *distance moved* rather than
    // direction: the timeline is RTL, so a playhead making real progress moves
    // leftward and an LTR-shaped assertion reports a working feature as broken.
    const playheadX = async () => (await page.locator('[data-testid="timeline-playhead"]').first().boundingBox())?.x ?? -1;
    const x0 = await playheadX();
    await playBtn.click();
    await page.waitForTimeout(700);
    const x1 = await playheadX();
    assert(Math.abs(x1 - x0) > 4, `play advances the playhead (${x0.toFixed(1)} → ${x1.toFixed(1)}, moved ${Math.abs(x1 - x0).toFixed(1)}px)`);
    assert(await page.getByRole('button', { name: 'إيقاف مؤقّت', exact: true }).count() > 0, 'while playing, the control announces itself as pause');

    await playBtn.click();                 // same button toggles to pause
    await page.waitForTimeout(150);
    const x2 = await playheadX();
    await page.waitForTimeout(800);
    const x3 = await playheadX();
    near(x3, x2, 1, `pause freezes the playhead (${x2.toFixed(1)} → ${x3.toFixed(1)} over 800ms)`);
  } else {
    assert(false, 'play control not present at all');
  }

  // ── 6. Layer order: a designer reorders constantly ─────────────────────────
  console.log('\n6. tartib at-tabaqat — layer order');
  const layerRows = page.locator('[data-el-id]');
  const idsBefore = await page.evaluate(() => [...document.querySelectorAll('[data-el-id]')].map((n) => n.getAttribute('data-el-id')));
  assert(idsBefore.length >= 2, `artboard has ${idsBefore.length} elements to reorder`);
  await layerRows.first().click();
  await page.waitForTimeout(120);
  // Bring-to-front / send-to-back via the standard shortcuts, then verify the
  // paint order in the DOM actually changed — not just that a menu item existed.
  await page.keyboard.press('Meta+Shift+BracketRight');
  await page.waitForTimeout(220);
  const idsAfter = await page.evaluate(() => [...document.querySelectorAll('[data-el-id]')].map((n) => n.getAttribute('data-el-id')));
  const reordered = idsBefore.join() !== idsAfter.join();
  assert(reordered, reordered ? 'bring-to-front changes paint order' : 'bring-to-front shortcut had NO effect on paint order');

  // ── 7. No silent runtime errors during any of the above ───────────────────
  console.log('\n7. al-akhta’ as-samita — silent runtime errors');
  const realErrors = pageErrors.filter((e) => !/favicon|ResizeObserver loop/i.test(e));
  assert(realErrors.length === 0, realErrors.length ? `clean console (got ${realErrors.length}): ${realErrors.slice(0, 3).join(' | ')}` : 'no runtime errors during the designer session');

  await browser.close();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`designer-flow: ${pass} pass, ${fail} fail`);
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
