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
