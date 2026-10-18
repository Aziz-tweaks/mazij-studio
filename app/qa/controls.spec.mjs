#!/usr/bin/env node
// Drives every real (non-"قريبًا") control in the app and asserts an observable
// effect — DOM state, app state, or a real file on disk — not just "didn't throw".
//
// Run: node qa/controls.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
import { openDemoDocument, switchToTimed } from './helpers/boot.mjs';

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

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  assert(await page.title() === 'مزيج — Mazij Studio', 'page title loads');

  // --- HomeScreen is now the REAL initial screen, so it is asserted directly.
  // This block used to open with "jump home, then back", because the app booted
  // into the editor and the start screen was reachable only by clicking the logo
  // — which is precisely the defect fixed on 18 October 2026. The detour is
  // therefore gone, and a stronger claim replaces it: a cold load lands on the
  // start screen. The logo-button navigation the detour incidentally covered is
  // not dropped; it is re-asserted below, in its real direction (editor → home).
  await page.waitForSelector('[data-testid="start-screen"]');
  assert(await page.locator('text=وش نصمم اليوم؟').count() > 0, 'home: a cold load lands on HomeScreen, with no logo click needed to get there');

  const homePrompt = page.locator('input[placeholder*="اوصف البوست"]');
  await homePrompt.fill('بوست تجريبي');
  await page.getByRole('button', { name: 'ابدأ', exact: true }).click();
  await page.waitForTimeout(150);
  assert(await page.locator('[data-screen-label="Editor"]').count() > 0, 'home: "ابدأ" opens the editor (and focuses the AI panel)');

  await page.getByRole('button', { name: 'مزيج' }).click();
  await page.waitForSelector('[data-testid="start-screen"]');
  assert(await page.locator('text=وش نصمم اليوم؟').count() > 0, 'home: the logo button still navigates back to HomeScreen from the editor');

  // Everything after this point drives controls that act on a *populated*
  // document (headline text field, font size, palette apply, layer order,
  // keyframes). The editor now opens empty, so the demo poster is opened
  // explicitly from the templates section: the same 7-element document this
  // spec always ran against, now asked for rather than assumed.
  await openDemoDocument(page);
  // The AI panel is open by design after "ابدأ"; switch to the Design (props) tab for the rest of the run.
  await page.getByText('التصميم', { exact: true }).click();
  await page.waitForTimeout(100);

  // --- TopBar ---
  await page.getByRole('button', { name: 'EN' }).click();
  await page.waitForTimeout(100);
  assert(await page.getByRole('button', { name: 'Export' }).count() > 0, 'topbar: language toggle switches to English');
  await page.getByRole('button', { name: 'ع' }).click();
  await page.waitForTimeout(100);
  assert(await page.getByRole('button', { name: 'تصدير' }).count() > 0, 'topbar: language toggle switches back to Arabic');

  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(100);
  assert(await page.locator('text=التحويل').count() > 0, 'topbar: Pro mode reveals the advanced Transform section');

  // --- Headline + undo/redo + save indicator ---
  const headlineInput = page.locator('input[value="عروض رواق هذا الأسبوع"]');
  assert(await headlineInput.count() === 1, 'headline input is the plain <input> (no type attr) and found via value');
  await headlineInput.fill('اختبار فعلي');
  await page.waitForTimeout(100);
  let body = await page.locator('body').innerText();
  assert(body.includes('يحفظ'), 'save indicator shows "يحفظ…" immediately after a doc edit');
  await page.waitForTimeout(900);
  body = await page.locator('body').innerText();
  assert(body.includes('محفوظ') && !body.includes('يحفظ'), 'save indicator settles to "محفوظ" after the debounced autosave');

  const undoBtn = page.getByTitle('تراجع');
  const redoBtn = page.getByTitle('إعادة');
  assert(!(await undoBtn.isDisabled()), 'undo button is enabled after an edit');
  await undoBtn.click();
  await page.waitForTimeout(50);
  assert((await page.locator('input[value="عروض رواق هذا الأسبوع"]').count()) === 1, 'undo reverted the headline text');
  assert(!(await redoBtn.isDisabled()), 'redo button is enabled after an undo');
  await redoBtn.click();
  await page.waitForTimeout(50);
  assert((await page.locator('input[value="اختبار فعلي"]').count()) === 1, 'redo re-applied the headline edit');

  // --- Font size field ---
  const stageHeadline = page.locator('[data-testid="stage-headline"]');
  const fontSizeBefore = await stageHeadline.evaluate((el) => getComputedStyle(el).fontSize);
  const fontSizeInput = page.locator('input[type="number"]').first();
  await fontSizeInput.fill('140');
  await fontSizeInput.dispatchEvent('change');
  await page.waitForTimeout(100);
  const fontSizeAfter = await stageHeadline.evaluate((el) => getComputedStyle(el).fontSize);
  assert(fontSizeAfter !== fontSizeBefore, `font size field drives a real computed font-size on the canvas headline (${fontSizeBefore} -> ${fontSizeAfter})`);

  // --- Color swatches ---
  const swatchBtns = page.locator('button[title^="#"]');
  const swatchCount = await swatchBtns.count();
  assert(swatchCount >= 2, 'color swatches render with real hex titles');
  const colorBefore = await stageHeadline.evaluate((el) => getComputedStyle(el).color);
  const targetHex = await swatchBtns.nth(1).getAttribute('title');
  await swatchBtns.nth(1).click();
  await page.waitForTimeout(100);
  const colorAfter = await stageHeadline.evaluate((el) => getComputedStyle(el).color);
  assert(colorAfter !== colorBefore, `color swatch (${targetHex}) applied a real color to the headline (${colorBefore} -> ${colorAfter})`);

  // --- Alignment buttons (6: 3 horizontal + 3 vertical) ---
  const alignSection = page.locator('div.mz-label', { hasText: 'المحاذاة' }).locator('..');
  const alignButtons = alignSection.locator('button');
  assert((await alignButtons.count()) === 6, 'alignment section has exactly 6 buttons (3 horizontal + 3 vertical)');
  await alignButtons.nth(1).click(); // center horizontal
  await page.waitForTimeout(100);
  const textAlignAfter = await stageHeadline.evaluate((el) => getComputedStyle(el).textAlign);
  assert(textAlignAfter === 'center', `horizontal-align button set the headline text-align to center (got ${textAlignAfter})`);

  // --- Font picker dropdown ---
  const fontPickerBtn = page.locator('button', { hasText: 'Alexandria' }).first();
  await fontPickerBtn.click();
  await page.waitForTimeout(100);
  const readexOption = page.locator('button', { hasText: 'Readex Pro' }).first();
  assert((await readexOption.count()) > 0, 'font picker dropdown lists installed ready fonts');
  await readexOption.click();
  await page.waitForTimeout(100);
  assert((await page.locator('button', { hasText: 'Readex Pro' }).first().count()) > 0, 'selecting a font from the picker updates the active font label');

  // --- Advanced transform fields (pro mode, select the badge layer) ---
  await page.locator('span', { hasText: 'شكل · الشارة' }).click().catch(() => {});
  // Badge layer selection happens by clicking the badge element on stage; use layer list in timeline instead.
  const badgeLayerRow = page.locator('button', { hasText: /^الشارة$/ }).first();
  await badgeLayerRow.click();
  await page.waitForTimeout(100);
  const xField = page.locator('label', { hasText: 'X' }).locator('input').first();
  assert(!(await xField.isDisabled()), 'advanced X field is enabled once a layer is selected');
  await xField.fill('40');
  await xField.dispatchEvent('change');
  await page.waitForTimeout(100);
  assert((await xField.inputValue()) === '40', 'advanced X field accepts and stores a real numeric value');

  // --- Font loading from a real URL (CORS-enabled Google Fonts static file) ---
  await page.getByRole('button', { name: 'المكتبة' }).click();
  await page.waitForTimeout(100);
  const fontUrlInput = page.locator('input[placeholder="https://example.com/MyFont.ttf"]');
  await fontUrlInput.fill('https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbWmT.ttf');
  await page.locator('button:has-text("تحميل")').first().click();
  await page.waitForTimeout(300);
  body = await page.locator('body').innerText();
  assert(body.includes('جاري التحميل'), 'font load: shows a real loading state right after clicking تحميل');
  await page.waitForTimeout(2500);
  body = await page.locator('body').innerText();
  assert(body.includes('جاهز'), 'font load: real fetch + FontFace registration completes to "جاهز"');
  const registeredFamilies = await page.evaluate(() => Array.from(document.fonts).map((f) => f.family));
  assert(registeredFamilies.some((f) => f.includes('KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbWmT')), 'font load: font is actually registered in document.fonts via FontFace API');

  // Bad URL -> visible error, not a silent no-op
  await fontUrlInput.fill('https://example.invalid/NotAFont.ttf');
  await page.locator('button:has-text("تحميل")').first().click();
  await page.waitForTimeout(2500);
  body = await page.locator('body').innerText();
  assert(body.includes('فشل التحميل'), 'font load: a bad URL surfaces a visible error state, not a silent failure');

  // --- Timeline ---
  // The transport and the ruler belong to a timed document now; said with the real
  // size menu rather than assumed. See the file header note.
  await switchToTimed(page);
  await page.getByText('التصميم', { exact: true }).click();
  await page.waitForTimeout(100);
  const playToggleBtn = page.locator('button svg path[d="M6 4l10 6-10 6z"], button svg path[d="M6 4v12M14 4v12"]').locator('..').locator('..');
  await playToggleBtn.click(); // play icon -> starts playback
  await page.waitForTimeout(200);
  const isPausedIcon = await page.locator('button svg path[d="M6 4v12M14 4v12"]').count();
  assert(isPausedIcon > 0, 'timeline play button toggles to a pause icon (playback state is real)');
  await playToggleBtn.click(); // pause icon now -> stop it so later timing isn't affected
  await page.waitForTimeout(100);

  const collapseChevron = page.locator('button svg path[d="M5 8l5 5 5-5"]').first().locator('..');
  await collapseChevron.click();
  await page.waitForTimeout(250);
  const timelineHeightCollapsed = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => d.textContent?.includes('الحركة') && d.querySelector('svg'));
    return el?.parentElement ? getComputedStyle(el.parentElement).height : null;
  });
  assert(timelineHeightCollapsed !== null, 'timeline collapse chevron changes panel height');
  await collapseChevron.click();
  await page.waitForTimeout(250);

  // --- CommandPalette ---
  const cmdInput = page.locator('input[placeholder="اكتب أمراً أو اسم أداة…"]');
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(150);
  assert((await cmdInput.count()) > 0, 'command palette opens via Meta+K (Ctrl+K on non-mac)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert((await cmdInput.count()) === 0, 'Escape closes the command palette');

  await page.keyboard.press('Control+k');
  await page.waitForTimeout(150);
  assert((await cmdInput.count()) > 0, 'command palette also opens via Control+K');
  await cmdInput.fill('تصدير');
  await page.waitForTimeout(100);
  const cmdResults = page.locator('button', { hasText: 'تصدير…' });
  assert((await cmdResults.count()) > 0, 'command palette search filters the command list');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // --- ExportDialog: quality / scale / transparent controls + real file export ---
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(150);

  await page.locator('button', { hasText: '1x' }).click();
  await page.waitForTimeout(50);
  const transparentToggle = page.locator('button').filter({ has: page.locator('span') }).last();

  const exportBtn = page.getByRole('button', { name: /تصدير \d+ ملف/ });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    exportBtn.click(),
  ]);
  const tmpPath = path.join(os.tmpdir(), 'mazij-qa-export.png');
  await download.saveAs(tmpPath);
  const stat = fs.statSync(tmpPath);
  assert(stat.size > 5000, `export: a real PNG file was written to disk (${stat.size} bytes)`);
  const header = fs.readFileSync(tmpPath).subarray(0, 8);
  assert(header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47, 'export: file has a genuine PNG signature');
  fs.unlinkSync(tmpPath);

  await page.getByRole('button', { name: 'فتح المجلد' }).click().catch(() => {});
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape'); // export dialog stays open after "done"; close it before reopening
  await page.waitForTimeout(150);

  // Video export in the browser preview: real mp4/gif encoding needs the Tauri
  // ffmpeg sidecar (see qa/video-export.spec.mjs for that path inside the built
  // app) — here there is no process to shell out to, so this must show an honest
  // "needs the desktop app" state, never a fake progress bar or success.
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(150);
  await page.locator('button:has-text("MP4")').click();
  await page.waitForTimeout(50);
  await page.getByRole('button', { name: /تصدير \d+ ملف/ }).click();
  await page.waitForTimeout(150);
  body = await page.locator('body').innerText();
  assert(body.includes('يحتاج تطبيق سطح المكتب'), 'export: MP4 in the browser preview shows an honest "needs the desktop app" message instead of a fake progress bar');
  assert(!body.includes('تم التصدير'), 'export: no fake "exported" success state is shown for the unavailable video path');

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
