#!/usr/bin/env node
// Covers the real MP4/GIF export UI wiring added to ExportDialog: the fps picker
// appearing per video format, the mp4-forces-opaque transparent-toggle lockout, and
// that the browser-preview path (no Tauri sidecar available) fails honestly and
// synchronously — never a simulated/fake progress bar. The actual sidecar encode
// (real ffmpeg process, real progress parsed from `-progress pipe:1`, real file on
// disk) can only run inside the built Tauri app — see docs/CONTROLS.md "التحقق
// داخل تطبيق Tauri الفعلي" for that verification; this spec is the piece of it that
// Playwright-in-a-plain-browser *can* cover (identical to how the rest of this QA
// suite tests UI wiring, independent of the file-system-dependent Tauri paths).
//
// Run: node qa/video-export.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
// NOTE (video branch, phase 1): this spec drives surfaces that exist only on a
// **timed** document — the timeline's ruler/clips, the transport, the video tool, or
// MP4/GIF in the export dialog. The demo poster is 1080×1080, i.e. `SIZES[0]`, whose
// `kind` is `'still'`, so it now opens without them: `DocSnapshot.medium` gates three
// surfaces, which is the whole point of the phase — the start screen already asked
// "image or video?" and the answer finally reaches the workspace instead of a badge.
// `bootDemoTimed` opens the same demo document and then picks a timed destination
// from the real artboard size menu, which is both the gesture a designer performs and
// the reversibility `HomeScreen.tsx` promised when it declined a two-button gate.
// See `qa/helpers/boot.mjs`.
import { bootDemoTimed } from './helpers/boot.mjs';

const BASE_URL = 'http://localhost:1420';
let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  await bootDemoTimed(page, BASE_URL);

  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(150);

  const transparentToggle = page.locator('[data-testid="export-transparent-toggle"]');

  // --- MP4: fps row appears, transparent toggle locks out with the honest note ---
  await page.locator('button:has-text("MP4")').click();
  await page.waitForTimeout(80);
  let body = await page.locator('body').innerText();
  assert(body.includes('معدّل الإطارات'), 'mp4: fps picker row is shown for a video format');
  assert(/\b24\b/.test(body) && /\b30\b/.test(body) && /\b60\b/.test(body), 'mp4: fps choices are 24/30/60');
  assert(await transparentToggle.isDisabled(), 'mp4: transparent toggle is disabled (mp4 has no alpha channel)');
  const toggleTitle = await transparentToggle.evaluate((el) => el.parentElement?.getAttribute('title'));
  assert(toggleTitle === 'MP4 لا يدعم خلفية شفافة — استخدم GIF', 'mp4: hovering the locked toggle explains why, instead of silently ignoring the setting');

  // --- GIF: fps choices change, transparent toggle re-enables ---
  await page.locator('button:has-text("GIF")').click();
  await page.waitForTimeout(80);
  body = await page.locator('body').innerText();
  assert(body.includes('معدّل الإطارات'), 'gif: fps picker row is shown for a video format');
  assert(/\b10\b/.test(body) && /\b15\b/.test(body), 'gif: fps choices include the lower GIF-sane values (10/15)');
  assert(!(await transparentToggle.isDisabled()), 'gif: the transparent toggle is enabled again (only mp4 lacks alpha)');

  // --- Picking an fps value actually changes the selected control (not a no-op) ---
  const fps10 = page.locator('button', { hasText: /^10$/ });
  const fps15 = page.locator('button', { hasText: /^15$/ });
  await fps15.click();
  await page.waitForTimeout(50);
  const weightAfter15 = await fps15.evaluate((el) => getComputedStyle(el).fontWeight);
  const weight10 = await fps10.evaluate((el) => getComputedStyle(el).fontWeight);
  assert(Number(weightAfter15) > Number(weight10), 'gif: clicking an fps value visually selects it (heavier weight) over the others');

  // --- Transparent toggle actually flips document state on GIF ---
  await transparentToggle.click();
  await page.waitForTimeout(50);
  const bg1 = await transparentToggle.evaluate((el) => getComputedStyle(el).backgroundColor);
  await transparentToggle.click();
  await page.waitForTimeout(50);
  const bg2 = await transparentToggle.evaluate((el) => getComputedStyle(el).backgroundColor);
  assert(bg1 !== bg2, 'gif: the transparent toggle visibly flips state when clicked (real control, not decorative)');

  // --- Switching back to a static format removes the fps row entirely ---
  await page.locator('button:has-text("PNG")').click();
  await page.waitForTimeout(80);
  body = await page.locator('body').innerText();
  assert(!body.includes('معدّل الإطارات'), 'png: fps picker is gone for a static image format');

  // --- Export attempt for each video format in the browser preview: honest and
  // synchronous — the dialog goes straight from idle to "unavailable" with no
  // transient "جاري التصدير…" (exporting…) step in between. A simulated progress
  // timer would necessarily pass through that busy state first; a real absent
  // sidecar fails synchronously in the click handler and never does. ---
  for (const fmt of ['MP4', 'GIF']) {
    await page.locator(`button:has-text("${fmt}")`).click();
    await page.waitForTimeout(80);
    await page.locator('[data-testid="export-submit"]').click();
    body = await page.locator('body').innerText();
    assert(body.includes('يحتاج تطبيق سطح المكتب'), `${fmt}: browser preview shows the honest "needs the desktop app" message immediately`);
    assert(!body.includes('جاري التصدير'), `${fmt}: no "exporting…" busy state is ever shown — nothing to encode with in the browser`);
    assert(!body.includes('تم التصدير'), `${fmt}: no fake "exported" success state`);
    // The dialog stays open and interactive after "unavailable" (same idle/unavailable/
    // error branch renders the format controls + export button) — no need to reopen it
    // for the next format in this loop.
  }

  await page.keyboard.press('Escape');

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
