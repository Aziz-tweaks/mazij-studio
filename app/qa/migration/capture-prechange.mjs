#!/usr/bin/env node
// Produces the one artefact the Phase 1 migration proof cannot be written without:
// a real autosave written by the **pre-change build**, carrying keyframe times as
// fractions of their clip, plus the values that build resolved from it.
//
// WHY A CAPTURE SCRIPT AND NOT A FIXTURE. Phase 1 reinterprets what a keyframe's
// stored time *means*: a fraction of the clip becomes an absolute duration in
// seconds. A stored `0.3` is the same eight bytes either way, so a hand-written
// fixture proves only that the migration agrees with whoever wrote the fixture. The
// only document that can falsify the migration is one this repository's own code
// wrote before the change existed — so it is captured here, through the real start
// screen and the real timeline, and committed next to the spec that reads it.
//
// Run this on the PRE-change commit, once:
//   QA_PORT=1443 node --import ./qa/helpers/port-redirect.mjs qa/migration/capture-prechange.mjs
// It writes two files into qa/migration/, both of which are then read-only inputs:
//   prechange-autosave.json   the autosave, byte-for-byte as the old build saved it
//   prechange-samples.json    `resolveAnimAt` at 60 instants, as the old build resolved it
//
// The document is deliberately the hardest case §1C.5 names: a fade entrance whose
// segment carries a hand-dragged custom bezier (so the migration cannot be checked
// by eye against a straight line), plus an `x` track with three keys placed at three
// different playhead positions (so a migration that only handles two-key preset
// tracks fails here).
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = `http://localhost:${process.env.QA_PORT || '1420'}`;
const AUTOSAVE_KEY = 'mazij.autosave.v1';
const HERE = dirname(fileURLToPath(import.meta.url));

/** The 60 instants §1C.5 samples at. Spread across the whole clip and a little past
 * it, so a migration that is right inside the clip and wrong at the edges is caught:
 * the two ends are exactly where a fraction and an absolute time disagree least. */
export const SAMPLE_INSTANTS = Array.from({ length: 60 }, (_, i) => (i * 2.4) / 59);

/** The test id of one keyframe diamond on the opacity row that is **not** sitting on
 * a clip edge, so a click reaches it rather than the resize handle stacked above the
 * edges. Picks by the `left` the component actually painted, not by index. */
async function insideDiamond(page, elementId) {
  return page.evaluate((i) => {
    const row = document.querySelector(`[data-testid="clip-${i}"]`)?.parentElement;
    const clip = document.querySelector(`[data-testid="clip-${i}"]`);
    if (!row || !clip) return null;
    const left = parseFloat(clip.style.left);
    const right = left + parseFloat(clip.style.width);
    const hit = [...row.querySelectorAll(`[data-testid^="kf-${i}-"]`)].find((e) => {
      const x = parseFloat(e.style.left);
      return x > left + 0.4 && x < right - 0.4;
    });
    return hit ? hit.dataset.testid : null;
  }, elementId);
}

/** Closes the keyframe popover the only way the UI closes it — a press on a clip
 * body. Aimed a quarter of the way into the body rather than at its centre, because
 * the centre is exactly where a mid-clip diamond is painted and the diamond would
 * swallow the press. */
async function clearKfPopover(page, elementId) {
  const body = await page.locator(`[data-testid="clip-${elementId}"]`).boundingBox();
  await page.mouse.click(body.x + body.width * 0.25, body.y + body.height / 2);
  await page.waitForTimeout(200);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1700, height: 1050 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // --- a real blank vertical video project, from the real start screen ----------
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.locator('[data-testid="format-row-ig-reel"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  await page.getByRole('button', { name: 'احترافي', exact: true }).click();
  await page.waitForTimeout(250);

  // --- a text layer with a fade entrance ---------------------------------------
  const a = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.getByRole('button', { name: 'نص', exact: true }).first().click();
  await page.mouse.click(a.x + a.width * 0.5, a.y + a.height * 0.3);
  await page.waitForTimeout(250);
  const id = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all[all.length - 1].dataset.elId;
  });
  await page.mouse.dblclick(a.x + a.width * 0.5, a.y + a.height * 0.3);
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('ترحيل بلا فقد');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(220);

  // --- a non-trivial bezier, dragged by hand on the entrance curve -------------
  // Through the timeline's own easing menu («مخصص» → the curve editor), which
  // cascades the dragged curve onto the entrance's segments. The per-keyframe
  // popover's copy of the same editor was tried first and its handle did not move
  // under real pointer events (reproduced twice, 0 px of travel both times) — a
  // separate defect, reported rather than worked around, and not Phase 1's to fix.
  await page.locator('[data-testid="easing-menu-button"]').click();
  await page.waitForTimeout(140);
  await page.locator('[data-testid="easing-option-custom"]').click();
  await page.waitForTimeout(200);
  const h0 = await page.locator('[data-testid="bezier-handle-0"]').boundingBox();
  await page.mouse.move(h0.x + h0.width / 2, h0.y + h0.height / 2);
  await page.mouse.down();
  await page.mouse.move(h0.x + h0.width / 2 + 30, h0.y + h0.height / 2 - 24, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const h0After = await page.locator('[data-testid="bezier-handle-0"]').boundingBox();
  console.log('bezier handle moved   :', Math.round(h0After.x - h0.x), Math.round(h0After.y - h0.y), 'px');
  if (Math.abs(h0After.x - h0.x) < 3 && Math.abs(h0After.y - h0.y) < 3) {
    throw new Error('the bezier handle did not move — the artefact would not carry a hand-set curve');
  }

  // A third opacity key, added at 0.3 s through the real «+» button, so the entrance
  // has a segment boundary that is not a clip edge. It lands with `easeOut` while the
  // two around it carry the dragged curve, which is exactly the mixed-easing case a
  // migration is most likely to flatten.
  await page.locator(`[data-testid="expand-${id}"]`).click();
  await page.waitForTimeout(220);
  const ruler0 = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(ruler0.x + (ruler0.width * 0.3) / 5 + 1, ruler0.y + ruler0.height / 2);
  await page.waitForTimeout(160);
  await page.locator(`[data-testid="clip-${id}-add-kf"]`).click();
  await page.waitForTimeout(220);

  // --- three keys on the x track, each placed at its own playhead position -----
  // Every one of 0.12 / 0.30 / 0.52 s is strictly inside the 0→0.6 s clip, so none
  // lands on an edge and all three stay clickable.
  const ruler = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  for (const seconds of [0.12, 0.3, 0.52]) {
    await page.mouse.click(ruler.x + (ruler.width * seconds) / 5 + 1, ruler.y + ruler.height / 2);
    await page.waitForTimeout(140);
    await page.locator(`[data-testid="clip-${id}-add-kf-x"]`).click();
    await page.waitForTimeout(200);
  }

  // Give each x key a distinct value, through the real popover slider, so a
  // migration that preserves times but loses values cannot pass by accident.
  //
  // Each key is reached by a raw mouse click at the diamond's own measured centre
  // rather than `locator.click()`, and the popover is dismissed between keys. Both
  // are forced by the same geometry: the three diamonds sit inside a 0.6 s clip on a
  // 5 s ruler, so they are a couple of dozen pixels apart, and the popover is 180 px
  // wide — leaving it open covers the neighbour that is clicked next.
  const xRow = await page.evaluate(
    (i) => {
      const row = document.querySelector(`[data-testid="clip-${i}-x"]`)?.parentElement;
      return row ? [...row.querySelectorAll(`[data-testid^="kf-${i}-"]`)].map((e) => e.dataset.testid) : [];
    },
    id,
  );
  console.log('x diamonds found      :', xRow.length, xRow.join(' '));
  for (const [n, testid] of xRow.entries()) {
    const box = await page.locator(`[data-testid="${testid}"]`).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(180);
    const slider = page.locator('[data-testid="kf-value-slider"]');
    if (!(await slider.count())) {
      console.log(`  x key ${n}: no popover opened — value left as placed`);
      continue;
    }
    await slider.fill(String(-40 + n * 17));
    await page.waitForTimeout(180);
    await clearKfPopover(page, id);
  }

  // --- let the autosave debounce fire, then read it back verbatim ---------------
  await page.waitForTimeout(1600);
  const saved = await page.evaluate((k) => window.localStorage.getItem(k), AUTOSAVE_KEY);
  if (!saved) throw new Error('no autosave was written — nothing to migrate from');

  // --- and what THIS build resolves from it, at the 60 instants ----------------
  // Through the production `resolveAnimAt`, from the document in state, so the
  // numbers are the ones the old build actually painted.
  const samples = await page.evaluate(
    async ({ elementId, instants }) => {
      const mod = await import('/src/lib/animTimeline.ts');
      const node = document.querySelector(`[data-el-id="${elementId}"]`);
      if (!node) throw new Error('element vanished');
      // The element's own anim, read out of the autosave payload that was just
      // written — the same bytes the new build will load.
      const raw = JSON.parse(window.localStorage.getItem('mazij.autosave.v1'));
      const el = raw.artboards[0].doc.elements.find((e) => e.id === elementId);
      return instants.map((t) => ({ t, v: mod.resolveAnimAt(el.anim, t) }));
    },
    { elementId: id, instants: SAMPLE_INSTANTS },
  );

  const parsed = JSON.parse(saved);
  const el = parsed.artboards[0].doc.elements.find((e) => e.id === id);
  const tracks = el.anim.tracks;

  mkdirSync(HERE, { recursive: true });
  writeFileSync(join(HERE, 'prechange-autosave.json'), saved);
  writeFileSync(
    join(HERE, 'prechange-samples.json'),
    JSON.stringify({ elementId: id, anim: { start: el.anim.start, duration: el.anim.duration }, samples }, null, 1),
  );

  console.log('captured element      :', id);
  console.log('clip start/duration   :', el.anim.start, '/', el.anim.duration);
  console.log('opacity keys (t,easing):', (tracks.opacity || []).map((k) => `${k.t}|${k.easing}`).join('  '));
  console.log('opacity first bezier  :', JSON.stringify((tracks.opacity || [])[0]?.bezier));
  console.log('x keys (t,value)      :', (tracks.x || []).map((k) => `${k.t.toFixed(4)}|${k.value.toFixed(3)}`).join('  '));
  console.log('samples               :', samples.length);
  console.log('page errors           :', errors.length ? errors.join(' | ') : 'none');

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
