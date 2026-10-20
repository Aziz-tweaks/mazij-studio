// Shared boot paths for every qa spec, added 18 October 2026 when the app stopped
// opening straight into a document.
//
// WHY THIS FILE EXISTS. Until now `page.goto(BASE_URL)` landed directly in the
// editor on the demo poster, because `initialStudioState.screen` was
// 'editor' and `initialStudioState.elements` was `createDefaultElements()`. Both
// changed: the app now opens on the start screen, and a new document is empty.
// So every spec that wants "the editor, with the 7-element demo document loaded"
// has to say so, and the only honest way to say it is to perform the gesture a
// real user performs — click the demo poster in the start screen's Templates
// section. These helpers are deliberately *not* a state backdoor: they drive the
// same buttons a person drives, so a spec can never pass against a start screen
// that is broken for humans.
//
// Each helper leaves the page in exactly the state the old bare `goto` left it
// in, so the assertions that follow in each spec are unchanged.

export const AUTOSAVE_KEY = 'mazij.autosave.v1';

/** Clicks through the start screen into the editor on the demo poster —
 * 7 elements (`img`, `discount`, `head`, `badge`, `badge-label`, `logo`,
 * `logo-label`), 1080×1080, palette 0, `anim: 'slide'`, headline selected. That
 * is byte-for-byte the document the app used to boot into, which is why the
 * specs that relied on it keep working unchanged. */
export async function openDemoDocument(page) {
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.locator('[data-testid="starter-demo-poster"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
}

/** Cold boot with no saved project, then into the demo document. Replaces the
 * `goto` → (`removeItem` → `reload`) → `waitForSelector('[data-testid="artboard"]')`
 * preamble the specs used to open with. The autosave clear is kept because these
 * specs want a pristine demo document, not whatever a previous spec run left. */
export async function bootDemo(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await openDemoDocument(page);
}

/** Cold boot with no saved project, then into a **blank** artboard at a named
 * format (a `SIZES[].id`, e.g. 'ig-reel'). This is the path a real new user
 * takes, and the thing the app could not do at all before today. */
export async function bootBlank(page, baseUrl, formatId) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.locator(`[data-testid="format-row-${formatId}"]`).click();
  await page.waitForSelector('[data-testid="artboard"]');
}

/** Switches the open document to a **timed** destination through the real artboard
 * size menu, and waits for the timeline's track column to exist.
 *
 * WHY SPECS NEED THIS NOW. The start screen has always asked "image or video?" —
 * picking «ريل إنستقرام» *is* answering "video" — and as of the video branch's first
 * phase the answer is load-bearing: `DocSnapshot.medium` gates three surfaces, one of
 * which is whether the timeline's ruler/tracks/playhead/transport exist at all. The
 * demo poster is 1080×1080, i.e. `SIZES[0]`, whose `kind` is `'still'` — so a spec
 * that opens the demo document and then drives the *timeline* has to say which medium
 * it means, and the honest way to say it is the gesture a designer performs: open the
 * size menu, pick a timed format. Nothing is injected.
 *
 * It is also the exact reversibility the start screen promised when it declined a
 * two-button gate (`HomeScreen.tsx`): the decision is changeable inside the editor
 * with no restart. That promise was untestable until `medium` had consumers.
 *
 * The **layer list** is deliberately *not* behind this: it lives inside the same
 * component as the timeline but is not a time surface, so it is present either way —
 * which is why specs that only click layer rows need no change. */
export async function switchToTimed(page, formatId = 'ig-reel') {
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForSelector('[data-testid="size-menu"]');
  await page.locator(`[data-testid="size-option-${formatId}"]`).click();
  await page.waitForSelector('[data-testid="timeline-tracks"]');
  await page.waitForTimeout(220);
}

/** `bootDemo` then `switchToTimed` — the demo document on a timed destination. */
export async function bootDemoTimed(page, baseUrl, formatId = 'ig-reel') {
  await bootDemo(page, baseUrl);
  await switchToTimed(page, formatId);
}

/** **Sets the export dialog's size selection to exactly `ids`, by clicking.**
 *
 * WHY THIS EXISTS, added 20 October 2026. Four specs needed a particular set of
 * export targets, and all four got there the same way: by *subtracting* from
 * whatever `initialStudioState.targets` happened to hold. That literal was
 * `{ ig, x, tt, li }` — the whole of `SIZES` before 18 October, four of thirteen
 * after it, and tied to no document at all; it is seeded from the document's own
 * size now (`defaultTargetsFor`).
 *
 * The moment it changed, every one of those four specs **kept clicking the same
 * tiles and silently clicked them the other way**: a click meant to switch تيك توك
 * off switched it on, the run produced four files where the assertions counted
 * three, and `qa/magic-resize.spec.mjs` exported a 1600×900 file while asserting
 * 1080×1920. Nothing was wrong with what those assertions *said* — only with the
 * premise they had borrowed. A spec that needs a selection should name it.
 *
 * So this names it: every wanted tile ends on, every other ends off, and the
 * caller gets back what was actually reached, so it can assert its premise before
 * exporting anything.
 *
 * **And it widens with «تحديد الكل» before narrowing, on purpose.** Switching only
 * the wanted tiles *on* would never switch anything off whenever the wanted set is
 * a superset of what the dialog opens with — and then a `toggleExportTarget` that
 * could select but not deselect would pass every caller. That was coverage the old
 * subtract-from-the-default route had by accident; widening first keeps it on
 * purpose. Measured, not assumed: with a selection-only version of this helper,
 * breaking the toggle's off direction left `qa/batch-export.spec.mjs` fully green.
 *
 * `'custom'` is a legitimate id here. «تحديد الكل» does not reach it (it is not in
 * `SIZES`), so the narrowing pass switches it on like any other. */
export async function setExportTargets(page, ids) {
  const on = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="export-target-"]')]
        .filter((e) => e.dataset.on === 'true')
        .map((e) => e.dataset.testid.replace('export-target-', ''))
        .sort(),
    );
  await page.getByRole('button', { name: 'تحديد الكل', exact: true }).click();
  await page.waitForTimeout(80);
  for (const id of await on()) {
    if (!ids.includes(id)) await page.locator(`[data-testid="export-target-${id}"]`).click();
  }
  for (const id of ids) {
    if ((await page.locator(`[data-testid="export-target-${id}"]`).getAttribute('data-on')) !== 'true') {
      await page.locator(`[data-testid="export-target-${id}"]`).click();
    }
  }
  await page.waitForTimeout(60);
  return on();
}

/** Re-enters the editor after a real `page.reload()`, through the start screen's
 * resume card — the returning-user path.
 *
 * A reload no longer lands in the editor: the autosaved document is restored
 * into state, but the screen stays on Home with a prominent "continue" card, so
 * a returning user is never forced through the format picker. Specs that reload
 * to prove "this edit survived the autosave round-trip" still prove exactly
 * that; they just click the card the way a person would. */
export async function resumeAfterReload(page) {
  await page.waitForSelector('[data-testid="resume-project"]');
  await page.locator('[data-testid="resume-project"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
}
