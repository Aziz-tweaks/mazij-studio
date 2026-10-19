#!/usr/bin/env node
// Produces the one artefact the non-uniform-scale compatibility proof cannot be
// written without: a real autosave written by the **pre-change build**, carrying a
// hand-built **uniform `scale`** track, plus everything that build resolved and
// emitted from it.
//
// WHY A CAPTURE SCRIPT AND NOT A FIXTURE. Independent width/height animation adds
// `scaleX`/`scaleY` beside the existing uniform `scale`, and the compatibility
// obligation is that every document already using `scale` renders **identically**.
// A hand-written fixture proves only that the new build agrees with whoever wrote
// the fixture: the author of the fixture already knows what the new build does. The
// only document that can falsify the claim is one this repository's own code wrote
// before `scaleX`/`scaleY` existed — so it is captured here, through the real start
// screen and the real timeline, and committed next to the spec that reads it.
//
// This is the same discipline, and deliberately the same shape, as
// `qa/migration/capture-prechange.mjs` (commit `9a9480c`), which proved Phase 1's
// keyframe-time migration. That artefact cannot serve here: its document is a fade
// plus an `x` track and carries **no `scale` track at all**, so it cannot say
// anything about uniform scale.
//
// Run this on the PRE-change commit, once:
//   QA_PORT=1462 node --import ./qa/helpers/port-redirect.mjs qa/migration/capture-prechange-scale.mjs
// It writes two files into qa/migration/, both of which are then read-only inputs:
//   prechange-scale-autosave.json  the autosave, byte-for-byte as the old build saved it
//   prechange-scale-samples.json   what the old build resolved AND emitted, at 60 instants
//
// WHY THE EMITTED CSS IS CAPTURED TOO, not only the resolved numbers.
// `resolveAnimAt` agreeing to 1e-6 says the *model* is intact. What reaches the
// screen is the string `entranceStyleAt` returns, and that string is what
// `ElementView` puts in `style.transform`. A change that resolved identically but
// emitted `scale(1.250, 1.250)` where the old build emitted `scale(1.250)` is still
// the same picture — but a change that emitted anything else is not, and only the
// string can tell those apart. So both are pinned: the numbers to 1e-6, the strings
// byte-for-byte.
//
// The document is deliberately the hardest uniform-scale case available before the
// change: the `pop` preset (the one preset that seeds a `scale` track at all) with
// two extra `scale` keys added at two more playhead positions and given distinct
// values through the real popover slider — so a four-key, non-monotonic uniform
// scale curve, which a change that only handled the two-key preset shape would miss.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = `http://localhost:${process.env.QA_PORT || '1420'}`;
const AUTOSAVE_KEY = 'mazij.autosave.v1';
const HERE = dirname(fileURLToPath(import.meta.url));

/** The 60 instants. Spread across the whole clip and a little past it, so a change
 * that is right inside the clip and wrong at the edges is caught — the ends are
 * where the resolver holds rather than interpolates, and holding is exactly the
 * behaviour a careless default could replace. */
export const SAMPLE_INSTANTS = Array.from({ length: 60 }, (_, i) => (i * 2.4) / 59);

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

  // --- a text layer -------------------------------------------------------------
  const a = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.getByRole('button', { name: 'نص', exact: true }).first().click();
  await page.mouse.click(a.x + a.width * 0.5, a.y + a.height * 0.35);
  await page.waitForTimeout(250);
  const id = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all[all.length - 1].dataset.elId;
  });
  await page.mouse.dblclick(a.x + a.width * 0.5, a.y + a.height * 0.35);
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('مقياسٌ منتظم');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // --- the `pop` preset: the only preset that seeds a `scale` track -------------
  await page.locator('[data-testid="anim-preset-pop"]').click();
  await page.waitForTimeout(250);

  // --- two more scale keys, each at its own playhead position -------------------
  // The preset's clip is 0→0.6 s on a 5 s ruler; 0.2 s and 0.4 s are strictly
  // inside it, so neither lands on a clip edge where the resize handle is stacked
  // above the diamond.
  await page.locator(`[data-testid="expand-${id}"]`).click();
  await page.waitForTimeout(250);
  const ruler = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  for (const seconds of [0.2, 0.4]) {
    await page.mouse.click(ruler.x + (ruler.width * seconds) / 5 + 1, ruler.y + ruler.height / 2);
    await page.waitForTimeout(160);
    await page.locator(`[data-testid="clip-${id}-add-kf-scale"]`).click();
    await page.waitForTimeout(220);
  }

  // Distinct values on every scale key, through the real popover slider, so the
  // curve is neither the preset's nor monotonic. Each diamond is reached by a raw
  // click at its own measured centre and the popover is dismissed between keys —
  // both forced by the same geometry the Phase 1 capture hit: four diamonds inside
  // a 0.6 s clip on a 5 s ruler sit a couple of dozen pixels apart, and the popover
  // is wider than that.
  const scaleRow = await page.evaluate(
    (i) => {
      const row = document.querySelector(`[data-testid="clip-${i}-scale"]`)?.parentElement;
      return row ? [...row.querySelectorAll(`[data-testid^="kf-${i}-"]`)].map((e) => e.dataset.testid) : [];
    },
    id,
  );
  console.log('scale diamonds found  :', scaleRow.length, scaleRow.join(' '));
  // 40% → 165% → 85% → 120%: up, down, up. A migration or a refactor that collapsed
  // the track to its endpoints would land nowhere near this at the middle instants.
  const wanted = [40, 165, 85, 120];
  for (const [n, testid] of scaleRow.entries()) {
    // **Scoped to the scale row, not addressed globally.** `tracksFromPreset` gives
    // the `pop` preset's opacity key and its scale key the *same* `id`
    // (`src/state/elements.ts:161-162` — both map the one legacy `AnimKeyframe`), so
    // `[data-testid="kf-<el>-<kf>"]` matches two diamonds on two different rows. A
    // bare locator is a strict-mode violation there; measured, not guessed.
    const box = await page.locator(`[data-testid="clip-row-${id}-scale"] [data-testid="${testid}"]`).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);
    const slider = page.locator('[data-testid="kf-value-slider"]');
    if (!(await slider.count())) {
      console.log(`  scale key ${n}: no popover opened — value left as placed`);
      continue;
    }
    await slider.fill(String(wanted[n % wanted.length]));
    await page.waitForTimeout(200);
    // Dismiss on the clip body, a quarter in rather than at the centre where a
    // mid-clip diamond is painted and would swallow the press.
    const body = await page.locator(`[data-testid="clip-${id}"]`).boundingBox();
    await page.mouse.click(body.x + body.width * 0.25, body.y + body.height / 2);
    await page.waitForTimeout(200);
  }

  // --- let the autosave debounce fire, then read it back verbatim ---------------
  await page.waitForTimeout(1600);
  const saved = await page.evaluate((k) => window.localStorage.getItem(k), AUTOSAVE_KEY);
  if (!saved) throw new Error('no autosave was written — nothing to compare against');

  // --- what THIS build resolves and emits, at the 60 instants -------------------
  // Through the production `resolveAnimAt`/`entranceStyleAt`, from the autosave
  // payload that was just written — the same bytes the new build will load.
  const captured = await page.evaluate(
    async ({ elementId, instants }) => {
      const mod = await import('/src/lib/animTimeline.ts');
      const raw = JSON.parse(window.localStorage.getItem('mazij.autosave.v1'));
      const el = raw.artboards[0].doc.elements.find((e) => e.id === elementId);
      return instants.map((t) => ({ t, v: mod.resolveAnimAt(el.anim, t), css: mod.entranceStyleAt(el.anim, t) }));
    },
    { elementId: id, instants: SAMPLE_INSTANTS },
  );

  const parsed = JSON.parse(saved);
  const el = parsed.artboards[0].doc.elements.find((e) => e.id === id);
  const tracks = el.anim.tracks;
  if (!tracks.scale || tracks.scale.length < 3) {
    throw new Error(`the captured document carries no hand-built scale track (${(tracks.scale || []).length} keys) — it would prove nothing`);
  }

  mkdirSync(HERE, { recursive: true });
  writeFileSync(join(HERE, 'prechange-scale-autosave.json'), saved);
  writeFileSync(
    join(HERE, 'prechange-scale-samples.json'),
    JSON.stringify(
      {
        elementId: id,
        anim: { start: el.anim.start, duration: el.anim.duration, preset: el.anim.preset },
        schemaVersion: parsed.schemaVersion,
        samples: captured,
      },
      null,
      1,
    ),
  );

  console.log('captured element      :', id);
  console.log('schemaVersion         :', parsed.schemaVersion);
  console.log('clip start/duration   :', el.anim.start, '/', el.anim.duration);
  console.log('scale keys (time,val) :', (tracks.scale || []).map((k) => `${k.time.toFixed(4)}|${k.value.toFixed(3)}`).join('  '));
  console.log('opacity keys          :', (tracks.opacity || []).map((k) => `${k.time.toFixed(4)}|${k.value.toFixed(3)}`).join('  '));
  console.log('css at 0.25s          :', JSON.stringify(captured.find((s) => s.t > 0.24 && s.t < 0.3)?.css));
  console.log('samples               :', captured.length);
  console.log('page errors           :', errors.length ? errors.join(' | ') : 'none');

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
