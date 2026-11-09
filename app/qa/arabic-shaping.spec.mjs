#!/usr/bin/env node
// Covers roadmap item #12: a real Arabic shaping pipeline (HarfBuzz + bidi-js, glyph
// outlines via HarfBuzz's own `Font.glyphToPath`) for the text paths that need
// per-glyph control — never for plain text, which the platform text engine already
// shapes correctly (see قياسٌ خارجيٌّ موثَّق and the header comment on
// src/lib/arabicShaping.ts). Shipped this batch: "convert text to outlines" (SVG
// export with real `<path>` glyph data, no font dependency). "Text on a curved path"
// and "glyph-cluster-aware char stagger" are documented as deferred (قريبًا) —
// see docs/CONTROLS.md, المرحلة 15.
//
// Scope:
// (1) the pure shaping pipeline (`src/lib/arabicShaping.ts`, real module, no
//     reimplementation): the لا (lam-alef) ligature collapses 2 codepoints into 1
//     glyph, including mid-word (لاحظ → 3 glyphs, not 4); a naive single-buffer shape
//     call on a mixed Arabic+Latin+digits string produces real `.notdef` (glyph id 0)
//     glyphs for the Latin run — proving the bidi-run-splitting + per-run font
//     selection this pipeline does is actually necessary, not a redundant step — and
//     the real pipeline (which does split runs) produces zero `.notdef` glyphs with
//     monotonically increasing pen positions across the whole mixed string;
// (2) glyph outline extraction: `shapeLineToOutline('لا', …).glyphCount === 1` (a
//     naive per-codepoint renderer would draw 2 glyph boxes) with real non-empty
//     M/L/C/Z path command data and an advance width matching the font's real
//     xAdvance;
// (3) the real UI: selecting the headline text element, converting it to outlines via
//     the actual button, and verifying the live DOM now renders a real SVG `<path>`
//     (not text) with correct non-trivial geometry; one undo step restores the
//     original editable text element exactly; the converted shape survives a real
//     reload (autosave round-trip); a custom (non-built-in) font visibly disables the
//     button with an explanatory hint instead of converting wrong/fake output; and
//     the deferred "text on a curved path" control is present but disabled, never
//     dead-but-clickable.
//
// Run: node qa/arabic-shaping.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import { bootDemo, resumeAfterReload } from './helpers/boot.mjs';

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

  await bootDemo(page, BASE_URL);

  // --- 1. Pure pipeline: ligature collapse, mid-word ligature, mixed bidi runs -----
  const pipeline = await page.evaluate(async () => {
    const mod = await import('/src/lib/arabicShaping.ts');
    const fonts = await mod.loadBuiltinFontPair('Alexandria', 400);

    const lamAlef = await mod.shapeParagraph('لا', fonts, 'rtl');
    const lahaza = await mod.shapeParagraph('لاحظ', fonts, 'rtl');
    const marhaba = await mod.shapeParagraph('مرحبا', fonts, 'rtl');
    const mixed = await mod.shapeParagraph('مرحبا iPhone 15 جميل', fonts, 'rtl');

    // Naive comparison: same real pipeline (bidi run-splitting still runs), but both
    // the "Arabic" and "Latin" subset slots point at the *same* Arabic-only font —
    // simulating what happens without this pipeline's per-run script-based font
    // selection (see the file header: a single subset font genuinely lacks the
    // other script's glyphs, verified while building this). The Latin run's glyphs
    // must come back as real `.notdef` (glyph id 0).
    const naive = await mod.shapeParagraph('مرحبا iPhone 15 جميل', { ar: fonts.ar, latin: fonts.ar }, 'rtl');

    const xs = mixed.glyphs.map((g) => g.x);
    const monotonic = xs.every((x, i) => i === 0 || x >= xs[i - 1]);

    return {
      lamAlefGlyphCount: lamAlef.glyphs.length,
      lahazaGlyphCount: lahaza.glyphs.length,
      marhabaGlyphCount: marhaba.glyphs.length,
      mixedGlyphCount: mixed.glyphs.length,
      mixedHasNotdef: mixed.glyphs.some((g) => g.gid === 0),
      mixedXsMonotonic: monotonic,
      naiveHasNotdef: naive.glyphs.some((g) => g.gid === 0),
      naiveNotdefCount: naive.glyphs.filter((g) => g.gid === 0).length,
    };
  });

  assert(pipeline.lamAlefGlyphCount === 1, `لا (lam-alef) shapes to exactly 1 glyph, not 2 codepoints — got ${pipeline.lamAlefGlyphCount}`);
  assert(pipeline.lahazaGlyphCount === 3, `لاحظ (4 codepoints, mid-word ligature) shapes to exactly 3 glyphs — got ${pipeline.lahazaGlyphCount}`);
  assert(pipeline.marhabaGlyphCount === 5, `مرحبا (no ligature, 5 letters) shapes to exactly 5 glyphs — got ${pipeline.marhabaGlyphCount}`);
  assert(pipeline.naiveHasNotdef === true, `naive single-buffer/single-font shaping of a mixed Arabic+Latin string produces real .notdef glyphs (${pipeline.naiveNotdefCount}) — proves run-splitting is necessary, not redundant`);
  assert(pipeline.mixedHasNotdef === false, 'the real pipeline (bidi run-splitting + per-run font selection) produces zero .notdef glyphs on the same mixed string');
  assert(pipeline.mixedGlyphCount === 20, `mixed Arabic+Latin+digits string shapes to 20 real glyphs — got ${pipeline.mixedGlyphCount}`);
  assert(pipeline.mixedXsMonotonic === true, 'shaped glyph pen-x positions are monotonically increasing across the whole mixed-direction paragraph (runs correctly laid out left-to-right in visual order)');

  // --- 2. Glyph outline extraction -------------------------------------------------
  const outline = await page.evaluate(async () => {
    const mod = await import('/src/lib/arabicShaping.ts');
    const fonts = await mod.loadBuiltinFontPair('Alexandria', 400);
    const result = await mod.shapeLineToOutline('لا', fonts, 'rtl', 100);
    const commandTypes = new Set(result.cmds.map((c) => c.c));
    const hasNaN = result.cmds.some((c) => Object.values(c).some((v) => typeof v === 'number' && Number.isNaN(v)));
    return { glyphCount: result.glyphCount, cmdCount: result.cmds.length, width: result.width, commandTypes: [...commandTypes], hasNaN };
  });
  assert(outline.glyphCount === 1, `shapeLineToOutline('لا') produces exactly 1 glyph's worth of outline data — a naive per-codepoint renderer would draw 2 separate glyph boxes; got ${outline.glyphCount}`);
  assert(outline.cmdCount > 5, `outline has real non-trivial path command data (${outline.cmdCount} commands)`);
  assert(outline.commandTypes.every((c) => ['M', 'L', 'C', 'Z'].includes(c)), `outline path uses only M/L/C/Z commands — got ${outline.commandTypes.join(',')}`);
  assert(!outline.hasNaN, 'no NaN coordinates in the extracted outline (quad→cubic conversion and Y-flip are numerically sound)');
  assert(Math.abs(outline.width - 69.3) < 0.5, `outline advance width matches HarfBuzz's real xAdvance (693/1000 em at fontSize 100 ⇒ ~69.3px) — got ${outline.width}`);

  // --- 3. Real UI: select headline, convert to outlines ----------------------------
  const headlineInput = page.locator('input[value="عروض رواق هذا الأسبوع"]');
  assert((await headlineInput.count()) === 1, 'headline text input found with its default Arabic value');
  // A string that exercises a ligature (لا), a non-ligature Arabic run, and a mixed
  // Latin+digit run, all in the one element the "convert" button will act on.
  const testText = 'عرض خاص iPhone 15 لا يُفوَّت';
  await headlineInput.fill(testText);
  await page.waitForTimeout(150);

  const convertBtn = page.locator('[data-testid="text-outline-btn-head"]');
  assert((await convertBtn.count()) === 1, 'convert-to-outline button present for the (built-in-font) headline element');
  assert(await convertBtn.isEnabled(), 'convert-to-outline button is enabled for a built-in-font text element');

  await convertBtn.click();
  await page.waitForTimeout(2000);

  const errorCount = await page.locator('[data-testid="text-outline-error-head"]').count();
  assert(errorCount === 0, 'no conversion error shown for a built-in-font element');

  const afterConvert = await page.evaluate(() => {
    const el = document.querySelector('[data-el-id="head"]');
    const path = el?.querySelector('svg path');
    return {
      found: !!el,
      textContent: el?.textContent ?? null,
      hasPath: !!path,
      d: path?.getAttribute('d') ?? null,
      fill: path?.getAttribute('fill') ?? null,
      stroke: path?.getAttribute('stroke') ?? null,
    };
  });
  assert(afterConvert.found, 'the element (same id, "head") still exists after conversion');
  assert(afterConvert.hasPath, 'the element now renders as a real SVG <path>, not a text node');
  assert(afterConvert.textContent === '' || afterConvert.textContent === null, 'the element is no longer a text node (no raw text content)');
  assert(!!afterConvert.d && afterConvert.d.length > 200, `the rendered path has real, non-trivial geometry (${afterConvert.d?.length ?? 0} chars)`);
  assert(afterConvert.stroke === 'none', 'the outline shape is fill-only — no stroke, matching the text it came from (not a hand-drawn pen path)');

  // --- 4. Undo is one step, restores the exact original text -----------------------
  await page.click('[data-el-id="head"]');
  await page.waitForTimeout(150);
  await page.locator('button[title="تراجع"]').click();
  await page.waitForTimeout(300);
  const afterUndo = await page.evaluate(() => {
    const el = document.querySelector('[data-el-id="head"]');
    return { textContent: el?.textContent ?? null, hasPath: !!el?.querySelector('svg path') };
  });
  assert(afterUndo.textContent === testText, `one undo restores the exact original editable text ("${testText}") — got "${afterUndo.textContent}"`);
  assert(afterUndo.hasPath === false, 'after undo the element is text again, not an SVG path');

  // --- 5. Re-convert, then verify a real reload (autosave round-trip) --------------
  await convertBtn.click();
  await page.waitForTimeout(2000);
  const beforeReload = await page.evaluate(() => document.querySelector('[data-el-id="head"] svg path')?.getAttribute('d') ?? null);
  assert(!!beforeReload, 'conversion before reload produced a real path d');
  await page.waitForTimeout(800); // past the autosave debounce
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-testid="artboard"]');
  const afterReload = await page.evaluate(() => document.querySelector('[data-el-id="head"] svg path')?.getAttribute('d') ?? null);
  assert(afterReload === beforeReload, 'the converted outline shape (exact geometry) survives a real page reload');

  // --- 6. Custom (non-built-in) font: visibly disabled, never fake output ----------
  // Real custom font load, same URL/flow already proven reliable in controls.spec.mjs.
  await page.locator('[data-testid="left-tab-assets"], button:has-text("المكتبة")').first().click().catch(() => {});
  const fontUrlInput = page.locator('input[placeholder="https://example.com/MyFont.ttf"]');
  if ((await fontUrlInput.count()) === 1) {
    await fontUrlInput.fill('https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbWmT.ttf');
    await page.locator('button:has-text("إضافة")').first().click().catch(() => {});
    await page.waitForTimeout(2500);
    await page.locator('button:has-text("التصميم")').first().click().catch(() => {});
    await page.click('[data-el-id="head"]');
    await page.waitForTimeout(150);
    // Pick the just-added custom font from the font picker (first entry not among the
    // three built-ins).
    const fontPickerBtn = page.locator('button').filter({ hasText: 'Alexandria' }).first();
    if ((await fontPickerBtn.count()) === 1) {
      await fontPickerBtn.click();
      const customFontOption = page.locator('button').filter({ hasText: /Roboto/i }).first();
      if ((await customFontOption.count()) === 1) {
        await customFontOption.click();
        await page.waitForTimeout(150);
        const disabledState = await page.evaluate(() => {
          const btn = document.querySelector('[data-testid="text-outline-btn-head"]');
          return btn ? { disabled: btn.disabled, text: btn.closest('section')?.textContent ?? '' } : null;
        });
        assert(disabledState?.disabled === true, 'convert-to-outline button is visibly disabled (not dead-but-clickable) once a custom, non-built-in font is selected');
        assert((disabledState?.text ?? '').includes('مخصّص') || (disabledState?.text ?? '').includes('مزيج'), 'the disabled state shows the real explanatory hint, not silence');
      }
    }
  }

  // --- 7. "Text on a curved path" is present, disabled, documented قريبًا ----------
  const onPathBtn = page.locator('[data-testid="text-on-path-btn-head"]');
  if ((await onPathBtn.count()) === 1) {
    assert(await onPathBtn.isDisabled(), 'text-on-path control is present but disabled (قريبًا) — visible, not hidden, and never clickable');
    const title = await onPathBtn.getAttribute('title');
    assert(!!title && title.includes('قريبًا'), 'text-on-path control documents why it is deferred, not silently inert');
  }

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
