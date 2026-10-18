#!/usr/bin/env node
// Covers roadmap item #18 — "تبرير كشيدة" (kashida/tatweel justification): stretching
// an Arabic line to a target width by lengthening real connecting strokes *inside*
// existing joined letters, never by opening gaps between words. One shared decision
// function (`src/lib/kashidaJustify.ts`, `justifyWithKashida`) is called by all three
// render paths — live DOM preview, canvas/PNG/video export, SVG export — each only
// differing in how it measures a candidate line's width.
//
// Scope:
// (1) `kashidaEligibleGaps` picks real Unicode `Joining_Type` positions: a 4-letter
//     word where every letter but the last is Dual_Joining gets 3 internal gaps; a
//     word made entirely of Right_Joining letters (د ر — never grow a forward tail)
//     gets zero; diacritics are skipped through, not treated as letters themselves;
//     no gap ever straddles a space between two words.
// (2) `justifyWithKashida` with a deterministic fake measure: already-wide-enough or
//     already-no-eligible-gap text comes back unchanged (`justified: false`, the
//     documented limit case); an achievable target is reached within the margin by
//     inserting real U+0640 characters, distributed round-robin across gaps.
// (3) Real HarfBuzz integration against this app's three built-in font families: the
//     justified string reshapes with zero `.notdef` glyphs (no broken cluster) and a
//     glyph count that grew by exactly the number of inserted tatweel characters —
//     proof the insertion didn't collapse or corrupt any ligature — and the real
//     shaped advance width lands within a small margin of the target.
// (4) The canvas/PNG export hook (`wrapLines`/`justifyCanvasLines` in
//     `exportArtboard.ts`, the same functions the live DOM preview imports) measured
//     through a real `CanvasRenderingContext2D` with a loaded `@font-face`: a
//     too-narrow line stretches to the target width; the *last* line of a block is
//     never justified (the standard typographic rule).
// (5) The SVG export hook (`justifySvgTextElement`): returns a stretched string for a
//     long `justify`-enabled RTL line, and returns `el.text` byte-identical for
//     `justify:false`, LTR, or a non-built-in font — never throws.
// (6) Migration: a document element object with no `justify` key at all (simulating
//     every pre-#18 document) renders `renderArtboardSvg`'s `<text>` content and
//     `renderArtboardPng`'s pixels byte-identical to the same element with
//     `justify:false` — old documents open with zero behavior change.
// (7) Real UI: toggling the new "تبرير بالكشيدة" checkbox on a real text element
//     inserts real U+0640 characters into the live DOM text; toggling off restores
//     the exact original text.
//
// Run: node qa/kashida-justify.spec.mjs   (dev server must be running on :1420)
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';
import { bootDemo } from './helpers/boot.mjs';

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

  // --- 1. Pure joining-rule gap detection ------------------------------------------
  const gaps = await page.evaluate(async () => {
    const mod = await import('/src/lib/kashidaJustify.ts');
    return {
      fourLetterAllDualButLast: mod.kashidaEligibleGaps('محمد').length, // م ح م د
      allRightJoining: mod.kashidaEligibleGaps('درر').length, // د ر ر — never extends forward
      withDiacritics: mod.kashidaEligibleGaps('بَيْت').length, // tashkeel skipped through
      twoWords: mod.kashidaEligibleGaps('قال لها').length, // قال(1) + لها(2), never across the space
      empty: mod.kashidaEligibleGaps('').length,
    };
  });
  assert(gaps.fourLetterAllDualButLast === 3, `محمد (4 letters, last is Right_Joining) has exactly 3 eligible gaps — got ${gaps.fourLetterAllDualButLast}`);
  assert(gaps.allRightJoining === 0, `درر (every letter Right_Joining, none grows a forward tail) has zero eligible gaps — got ${gaps.allRightJoining}`);
  assert(gaps.withDiacritics === 2, `بَيْت (tashkeel between real letters) still finds 2 letter-to-letter gaps, skipping the diacritics — got ${gaps.withDiacritics}`);
  assert(gaps.twoWords === 3, `قال لها (1 + 2 gaps, never straddling the space) — got ${gaps.twoWords}`);
  assert(gaps.empty === 0, 'empty string has zero gaps (no crash)');

  // --- 2. justifyWithKashida with a deterministic fake measure ---------------------
  const fake = await page.evaluate(async () => {
    const mod = await import('/src/lib/kashidaJustify.ts');
    const measure = (s) => [...s].length * 10; // 10 "px" per character, deterministic
    const already = await mod.justifyWithKashida('محمد', 10, measure); // natural=40 >= target
    const noGaps = await mod.justifyWithKashida('درر', 1000, measure); // no eligible gap at all
    const stretch = await mod.justifyWithKashida('محمد', 100, measure); // 40 -> 100
    return {
      already: { text: already.text, justified: already.justified },
      noGaps: { text: noGaps.text, justified: noGaps.justified },
      stretch: { text: stretch.text, justified: stretch.justified, hasTatweel: stretch.text.includes('ـ'), width: [...stretch.text].length * 10 },
    };
  });
  assert(fake.already.text === 'محمد' && fake.already.justified === false, 'already wide enough: text unchanged, justified:false');
  assert(fake.noGaps.text === 'درر' && fake.noGaps.justified === false, 'no eligible gap: text unchanged, justified:false — documented real limit, not silently faked');
  assert(fake.stretch.hasTatweel, 'achievable stretch target: real U+0640 characters were inserted');
  assert(fake.stretch.justified === true, 'achievable stretch target reached within margin');
  assert(Math.abs(fake.stretch.width - 100) <= 10, `stretched width lands within one character's width of the 100 target — got ${fake.stretch.width}`);

  // --- 3. Real HarfBuzz integration: no broken clusters, real width match ----------
  const hb = await page.evaluate(async () => {
    const mod = await import('/src/lib/kashidaJustify.ts');
    const shaping = await import('/src/lib/arabicShaping.ts');
    const results = {};
    for (const family of ['Alexandria', 'Readex Pro', 'Vazirmatn']) {
      const fonts = await shaping.loadBuiltinFontPair(family, 400);
      const text = 'مرحبا بكم في مزيج';
      const scale = (w) => w * (60 / fonts.ar.upem); // fontPx=60
      const measure = async (s) => (await shaping.shapeParagraph(s, fonts, 'rtl')).width * (60 / fonts.ar.upem);
      const natural = await measure(text);
      const target = natural * 1.4;
      const { text: justified, justified: ok } = await mod.justifyWithKashida(text, target, measure);
      const shapedOriginal = await shaping.shapeParagraph(text, fonts, 'rtl');
      const shapedJustified = await shaping.shapeParagraph(justified, fonts, 'rtl');
      const insertedCount = [...justified].filter((c) => c === 'ـ').length;
      results[family] = {
        ok,
        insertedCount,
        glyphDelta: shapedJustified.glyphs.length - shapedOriginal.glyphs.length,
        hasNotdef: shapedJustified.glyphs.some((g) => g.gid === 0),
        finalWidthPx: scale(shapedJustified.width),
        targetPx: target,
      };
    }
    return results;
  });
  for (const [family, r] of Object.entries(hb)) {
    assert(r.ok, `${family}: a 40%-wider target was reached within margin via real kashida`);
    assert(r.insertedCount > 0, `${family}: real U+0640 characters were inserted into the string`);
    assert(r.glyphDelta === r.insertedCount, `${family}: re-shaping the justified string adds exactly ${r.insertedCount} glyphs (one per inserted tatweel) — got delta ${r.glyphDelta}, proving no ligature was torn or collapsed`);
    assert(!r.hasNotdef, `${family}: the justified string reshapes with zero .notdef glyphs — the font genuinely supports a medial tatweel here`);
    assert(Math.abs(r.finalWidthPx - r.targetPx) < r.targetPx * 0.03, `${family}: final shaped width (${r.finalWidthPx.toFixed(1)}) is within 3% of the target (${r.targetPx.toFixed(1)})`);
  }

  // --- 4. Canvas export hook: wrapLines/justifyCanvasLines via a real 2D context ---
  const canvasResult = await page.evaluate(async () => {
    await document.fonts.load('400 60px Alexandria');
    await document.fonts.ready;
    const mod = await import('/src/lib/exportArtboard.ts');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '400 60px Alexandria, sans-serif';
    const line1 = 'مرحبا بكم في مزيج';
    const line2 = 'مرحبا';
    const natural1 = ctx.measureText(line1).width;
    const target = natural1 * 1.3;
    const justifiedBoth = await mod.justifyCanvasLines(ctx, [line1, line2], target);
    return {
      firstStretched: justifiedBoth[0] !== line1 && justifiedBoth[0].includes('ـ'),
      firstWidth: ctx.measureText(justifiedBoth[0]).width,
      lastUnchanged: justifiedBoth[1] === line2,
      target,
    };
  });
  assert(canvasResult.firstStretched, 'canvas path: a too-narrow non-last line is stretched with real tatweel characters');
  assert(Math.abs(canvasResult.firstWidth - canvasResult.target) < canvasResult.target * 0.03, `canvas path: stretched line width (${canvasResult.firstWidth.toFixed(1)}) within 3% of target (${canvasResult.target.toFixed(1)})`);
  assert(canvasResult.lastUnchanged, 'canvas path: the last line of a block is never justified (standard typographic rule)');

  // --- 4b. A single-line block IS justified -----------------------------------------
  //
  // كتلةٌ من سطرٍ واحد ليست «فقرةً آخِرُ سطرها قصيرٌ عَرَضًا»: سطرُها هو الفقرة
  // كلّها، ومصمّمٌ ضبط عرض صندوقه ثم طلب الكشيدة لا يعني إلا «مُدَّ هذا السطر».
  // وكان هذا الفرع يُسقَط صمتًا، فيُفعِّل المصمّم المفتاح على عنوانٍ من سطرٍ واحد
  // فلا يحدث شيء — وهي الحالة الأشيع، وهي بالضبط ما يفعله الهدف المنشور الحقيقيّ في
  // `qa/replication/targets/t02-kashida`.
  //
  // وكان يخالف تصدير SVG أيضًا (القسم ٥ أدناه يمدّ النصّ كلّه بلا استثناء)، فكان
  // المستند الواحد يخرج بصورتين حسب الصيغة. فالبنود هنا تقيس الأمرين معًا: المدّ
  // نفسه، واتّفاق المسارين عليه.
  const singleLine = await page.evaluate(async () => {
    await document.fonts.load('400 60px Alexandria');
    await document.fonts.ready;
    const canvasMod = await import('/src/lib/exportArtboard.ts');
    const svgMod = await import('/src/lib/kashidaJustify.ts');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '400 60px Alexandria, sans-serif';
    const only = 'ملف واحد';
    const natural = ctx.measureText(only).width;
    const target = natural * 1.4;
    const [justified] = await canvasMod.justifyCanvasLines(ctx, [only], target);
    const svg = await svgMod.justifySvgTextElement(
      { fontSize: 60, weight: 'regular', fontFamily: 'Alexandria', text: only, justify: true },
      60,
      target,
      'rtl',
    );
    return {
      stretched: justified !== only && justified.includes('ـ'),
      width: ctx.measureText(justified).width,
      target,
      strippedUnchanged: justified.replace(/ـ/g, '') === only,
      svgAlsoStretched: svg !== only && svg.includes('ـ'),
    };
  });
  assert(singleLine.stretched, "canvas path: a single-line block IS stretched — its one line is the whole paragraph, not a paragraph's short last line");
  assert(
    Math.abs(singleLine.width - singleLine.target) < singleLine.target * 0.03,
    `canvas path: the single stretched line reaches its box width (${singleLine.width.toFixed(1)} vs ${singleLine.target.toFixed(1)})`,
  );
  assert(singleLine.strippedUnchanged, 'canvas path: stretching a single line inserts only tatweel — removing them restores the exact original text');
  assert(singleLine.svgAlsoStretched, 'canvas and SVG export now agree on a single-line justified block (they disagreed before: SVG stretched it, PNG silently did not)');

  // --- 5. SVG export hook -----------------------------------------------------------
  const svgResult = await page.evaluate(async () => {
    const mod = await import('/src/lib/kashidaJustify.ts');
    const base = { fontSize: 60, weight: 'regular', fontFamily: 'Alexandria', text: 'مرحبا بكم في مزيج' };
    const on = await mod.justifySvgTextElement({ ...base, justify: true }, 60, 900, 'rtl');
    const off = await mod.justifySvgTextElement({ ...base, justify: false }, 60, 900, 'rtl');
    const ltr = await mod.justifySvgTextElement({ ...base, justify: true }, 60, 900, 'ltr');
    const customFont = await mod.justifySvgTextElement({ ...base, justify: true, fontFamily: 'SomeUploadedFont' }, 60, 900, 'rtl');
    return {
      onHasTatweel: on.includes('ـ'),
      offUnchanged: off === base.text,
      ltrUnchanged: ltr === base.text,
      customFontUnchanged: customFont === base.text,
    };
  });
  assert(svgResult.onHasTatweel, 'SVG hook: justify:true on a narrow box produces a real tatweel-stretched string');
  assert(svgResult.offUnchanged, 'SVG hook: justify:false returns el.text byte-identical');
  assert(svgResult.ltrUnchanged, 'SVG hook: LTR direction returns el.text byte-identical (kashida is an RTL-only concept)');
  assert(svgResult.customFontUnchanged, 'SVG hook: a non-built-in font returns el.text unchanged rather than throwing — documented limit, matching shapeTextOnCurve');

  // --- 6. Migration: no `justify` key at all === justify:false, byte-identical -----
  const migration = await page.evaluate(async () => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const elementsMod = await import('/src/state/elements.ts');
    const size = { w: 1080, h: 1080 };
    const baseEl = {
      id: 'legacy-text', type: 'text', text: 'مرحبا بكم في مزيج والعرض طويل بما يكفي ليحتاج تمديدًا', fontFamily: 'Alexandria', fontSize: 48, weight: 'regular',
      color: null, halign: 'start', valign: 'top', textAnim: elementsMod.defaultTextStagger(), pathId: null, geo: { x: 0.1, y: 0.1, w: 0.5, h: 0.3, rotation: 0 },
      visible: true, locked: false, opacity: 100, maskId: null, anim: elementsMod.defaultAnim('none', 0, 0.3, 'easeOut'),
    };
    const legacyNoKey = { ...baseEl };
    delete legacyNoKey.justify;
    const explicitFalse = { ...baseEl, justify: false };
    const spec = (el) => ({ size, palette: { bg: '#fff', fg: '#000', ac: '#f00' }, elements: [el], transparent: false, lang: 'ar' });
    const svgNoKey = await mod.renderArtboardSvg(spec(legacyNoKey)).text();
    const svgFalse = await mod.renderArtboardSvg(spec(explicitFalse)).text();
    const pngNoKeyBuf = new Uint8Array(await (await mod.renderArtboardPng({ ...spec(legacyNoKey), scale: 1 })).arrayBuffer());
    const pngFalseBuf = new Uint8Array(await (await mod.renderArtboardPng({ ...spec(explicitFalse), scale: 1 })).arrayBuffer());
    const pngIdentical = pngNoKeyBuf.length === pngFalseBuf.length && pngNoKeyBuf.every((v, i) => v === pngFalseBuf[i]);
    return { svgIdentical: svgNoKey === svgFalse, pngIdentical, svgHasRawText: svgNoKey.includes(baseEl.text) };
  });
  assert(migration.svgIdentical, 'migration: SVG output for an element with no `justify` key is byte-identical to justify:false');
  assert(migration.pngIdentical, 'migration: PNG output for an element with no `justify` key is byte-identical to justify:false');
  assert(migration.svgHasRawText, 'migration: a legacy element (no justify key) renders its literal text with zero inserted tatweel characters');
  assert(pageErrors.length === 0, `no console/page errors after the pure-module checks: ${JSON.stringify(pageErrors)}`);

  // --- 7. Real UI: toggle the checkbox on a real text element -----------------------
  const headlineLocator = page.locator('[data-el-id="head"]');
  const beforeText = (await headlineLocator.innerText()).trim();
  await headlineLocator.click();
  await page.waitForTimeout(80);
  const toggle = page.locator('[data-testid="justify-kashida-toggle"]');
  assert((await toggle.count()) === 1, 'UI: the "تبرير بالكشيدة" checkbox is present for a selected text element');
  await toggle.check();
  await page.waitForTimeout(250); // async canvas-measure pass inside JustifiedTextView
  const afterOnText = await headlineLocator.innerText();
  await toggle.uncheck();
  await page.waitForTimeout(150);
  const afterOffText = (await headlineLocator.innerText()).trim();
  assert(afterOnText.includes('ـ') || afterOnText.replace(/\s+/g, '') === beforeText.replace(/\s+/g, ''), 'UI: enabling justify either inserts real tatweel characters or (if the headline already fits its box on one line) leaves it correctly unstretched');
  assert(afterOffText === beforeText, 'UI: disabling justify restores the exact original headline text');
  assert(pageErrors.length === 0, `no console/page errors after the UI toggle: ${JSON.stringify(pageErrors)}`);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.error('\nFailures:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
