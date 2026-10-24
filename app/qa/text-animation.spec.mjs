#!/usr/bin/env node
// Covers roadmap item #6: char/word/line text-reveal stagger. Scope under test:
// (1) correct Arabic grapheme segmentation (Intl.Segmenter, not split('')) — tashkeel
// stays attached to its base letter; (2) the four stagger directions (start/end/
// center/random) produce the documented, deterministic rank order (see
// `staggerRanks` in src/lib/textStagger.ts); (3) the UI actually renders one DOM unit
// per token and changes unit granularity live; (4) the real export-frame renderer
// (renderArtboardPng/renderArtboardFrames — the same function PNG, GIF, and every
// video frame go through) resolves the per-unit reveal at an arbitrary time, not a
// DOM-only reimplementation; (5) documents saved before `textAnim` existed migrate
// to "disabled" (pixel-identical) and remain editable afterward; (6) settings persist
// through a real autosave/reload round trip.
//
// Run: node qa/text-animation.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import { bootDemoTimed, resumeAfterReload, switchToTimed } from './helpers/boot.mjs';

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

  // التتابعُ حركةٌ، وأسطحُ الحركة تظهر لمستندٍ له زمن (٢٤ أكتوبر ٢٠٢٦: «المستند يقرّر
  // الشاشة» — `MEDIUM_SURFACES`). فالبوستر نفسه على وجهةٍ مُوقَّتة.
  await bootDemoTimed(page, BASE_URL);

  // --- 1. Arabic grapheme segmentation: tashkeel never torn from its base letter ---
  // "مُحَمَّد" (Muhammad with full diacritics) has 4 *base* letters but 7 UTF-16 code
  // units (each diacritic is its own combining mark) — a naive `split('')` would
  // produce 7 broken units; grapheme segmentation must produce exactly 4.
  const segResult = await page.evaluate(async () => {
    const mod = await import('/src/lib/textStagger.ts');
    const word = 'مُحَمَّد';
    const chars = mod.tokenizeText(word, 'char');
    const contentChars = chars.filter((t) => t.orderIndex !== null);
    // Every content token must still carry its own diacritic(s) attached (i.e. no
    // token is a bare combining mark on its own — length 1 *code point* that's a
    // tashkeel character never appears as an isolated token).
    const TASHKEEL = /^[ً-ْ]+$/;
    const anyBareDiacritic = contentChars.some((t) => TASHKEEL.test(t.text));
    return { count: contentChars.length, texts: contentChars.map((t) => t.text), anyBareDiacritic };
  });
  assert(segResult.count === 4, `char segmentation: "مُحَمَّد" segments into 4 grapheme clusters (base letter + its own diacritics), got ${segResult.count}: ${JSON.stringify(segResult.texts)}`);
  assert(!segResult.anyBareDiacritic, 'char segmentation: no diacritic is ever split off into its own standalone token');

  // Word granularity must not split a single Arabic word's letters apart either —
  // one multi-letter word is one token, whitespace is excluded from the content count.
  const wordSegResult = await page.evaluate(async () => {
    const mod = await import('/src/lib/textStagger.ts');
    const tokens = mod.tokenizeText('خصم كبير اليوم', 'word');
    const content = tokens.filter((t) => t.orderIndex !== null);
    return content.map((t) => t.text);
  });
  assert(JSON.stringify(wordSegResult) === JSON.stringify(['خصم', 'كبير', 'اليوم']), `word segmentation: three Arabic words stay intact as three tokens, got ${JSON.stringify(wordSegResult)}`);

  // --- 2. Stagger direction → rank order (deterministic) ---
  const rankResult = await page.evaluate(async () => {
    const mod = await import('/src/lib/textStagger.ts');
    const start = mod.staggerRanks(5, 'start', 'seed-a');
    const end = mod.staggerRanks(5, 'end', 'seed-a');
    const center = mod.staggerRanks(5, 'center', 'seed-a');
    const random1 = mod.staggerRanks(6, 'random', 'seed-a');
    const random2 = mod.staggerRanks(6, 'random', 'seed-a');
    const randomOther = mod.staggerRanks(6, 'random', 'seed-b');
    return { start, end, center, random1, random2, randomOther };
  });
  assert(JSON.stringify(rankResult.start) === JSON.stringify([0, 1, 2, 3, 4]), `direction 'start': natural order, got ${JSON.stringify(rankResult.start)}`);
  assert(JSON.stringify(rankResult.end) === JSON.stringify([4, 3, 2, 1, 0]), `direction 'end': fully reversed order, got ${JSON.stringify(rankResult.end)}`);
  assert(rankResult.center[2] === 0, `direction 'center': the middle unit (index 2 of 5) has rank 0 (starts first), got rank ${rankResult.center[2]}`);
  // The two outermost units (furthest from the middle) must be the *last* two to
  // start — not necessarily tied, since equidistant units break ties by ascending
  // index (a deterministic, defensible choice, not a flaw) — so index 0 and index 4
  // hold the two highest ranks between them, in some order.
  const outerRanks = [rankResult.center[0], rankResult.center[4]].sort((a, b) => a - b);
  assert(JSON.stringify(outerRanks) === JSON.stringify([3, 4]), `direction 'center': the two outermost units hold the two highest (last-to-start) ranks, got ${JSON.stringify(outerRanks)} from center=${JSON.stringify(rankResult.center)}`);
  const isPermutation = (arr, n) => arr.length === n && new Set(arr).size === n && arr.every((v) => v >= 0 && v < n);
  assert(isPermutation(rankResult.random1, 6), `direction 'random': ranks are a real permutation of 0..5, got ${JSON.stringify(rankResult.random1)}`);
  assert(JSON.stringify(rankResult.random1) === JSON.stringify(rankResult.random2), 'direction random: same seed (element id) reproduces the identical shuffle every time — required for a deterministic video export');
  assert(JSON.stringify(rankResult.random1) !== JSON.stringify(rankResult.randomOther), 'direction random: a different seed produces a different shuffle (not a hardcoded order)');

  // --- 3. Live UI: enabling stagger renders one DOM unit per token, unit switch works ---
  await page.locator('[data-el-id="discount"]').click();
  await page.waitForTimeout(100);
  const toggle = page.locator('[data-testid="stagger-toggle-discount"]');
  assert((await toggle.count()) === 1, 'props panel: the text-stagger toggle exists for a text element');
  await toggle.click();
  await page.waitForTimeout(100);

  const charSpanCount = await page.locator('[data-el-id="discount"] span span').count();
  // "خصم يصل إلى ٥٠٪ على كل شيء · حتى الأحد" has exactly 29 non-whitespace grapheme
  // clusters (confirmed via Intl.Segmenter directly) — whitespace tokens render as
  // plain text, not spans, so the animated-span count must match exactly.
  assert(charSpanCount === 29, `char stagger: discount text renders exactly one animated <span> per non-whitespace grapheme (got ${charSpanCount}, expected 29)`);

  await page.locator('[data-testid="stagger-unit-discount-word"]').click();
  await page.waitForTimeout(100);
  const wordSpanCount = await page.locator('[data-el-id="discount"] span span').count();
  assert(wordSpanCount > 0 && wordSpanCount < charSpanCount, `word stagger: fewer animated units than char stagger on the same text (word=${wordSpanCount}, char=${charSpanCount})`);

  // Direction/effect/easing buttons are real and reflect state.
  await page.locator('[data-testid="stagger-dir-discount-end"]').click();
  await page.waitForTimeout(60);
  await page.locator('[data-testid="stagger-effect-discount-slide"]').click();
  await page.waitForTimeout(60);
  await page.locator('[data-testid="stagger-ease-discount-back"]').click();
  await page.waitForTimeout(60);
  const dirActive = await page.locator('[data-testid="stagger-dir-discount-end"]').evaluate((el) => getComputedStyle(el).color);
  const dirInactive = await page.locator('[data-testid="stagger-dir-discount-start"]').evaluate((el) => getComputedStyle(el).color);
  assert(dirActive !== dirInactive, 'stagger controls: clicking a direction/effect/easing button actually changes element state (active vs inactive styling differ)');
  assert(pageErrors.length === 0, `no console/page errors after exercising the stagger UI: ${JSON.stringify(pageErrors)}`);

  // --- 4. Real export-frame renderer reflects progressive reveal (not DOM-only) ---
  const exportResult = await page.evaluate(async () => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const stagger = { enabled: true, unit: 'char', direction: 'start', stagger: 0.08, unitDuration: 0.3, effect: 'fade', easing: 'linear', bezier: [0, 0, 1, 1] };
    const el = {
      id: 'probe',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      geo: { x: 0.05, y: 0.4, w: 0.9, h: 0.2, rotation: 0 },
      text: 'ABCDEFGHIJ',
      fontFamily: 'Alexandria',
      fontSize: 80,
      weight: 'bold',
      color: '#ffffff',
      halign: 'start',
      valign: 'top',
      anim: { preset: 'none', start: 0, duration: 2, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} },
      textAnim: stagger,
    };
    const size = { w: 1080, h: 1080 };
    const palette = { bg: '#000000', fg: '#ffffff', ac: '#ffb703' };
    async function countOpaquePixels(time) {
      const blob = await mod.renderArtboardPng({ size, palette, elements: [el], transparent: true, lang: 'en', time, scale: 1 });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(1080, 1080);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 400, 1080, 200).data;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 20) count++;
      return count;
    }
    const early = await countOpaquePixels(0.02);
    const late = await countOpaquePixels(1.9);
    return { early, late };
  });
  assert(exportResult.late > exportResult.early * 3, `export renderer: opaque pixel count grows substantially from early to late stagger time (early=${exportResult.early}, late=${exportResult.late}) — proves the real PNG/video frame renderer (not just the DOM) resolves per-character progress`);

  // --- 5. Backward compatibility: a document saved before `textAnim` existed ---
  const legacyDoc = {
    elements: [
      {
        id: 'legacy-text',
        type: 'text',
        visible: true,
        locked: false,
        opacity: 100,
        maskId: null,
        geo: { x: 0.1, y: 0.1, w: 0.5, h: 0.2, rotation: 0 },
        text: 'نص قديم بلا تحريك تتابعي',
        fontFamily: 'Alexandria',
        fontSize: 48,
        weight: 'bold',
        color: null,
        halign: 'start',
        valign: 'top',
        // Pre-#6 shape: no `textAnim` field at all, exactly what a document saved
        // before this roadmap item looks like on disk.
        anim: { preset: 'none', start: 0, duration: 0.6, easing: 'easeOut', bezier: [0, 0, 0.58, 1], keyframes: [{ id: 'k0', t: 0, v: 0 }, { id: 'k1', t: 1, v: 1 }], tracks: {} },
      },
    ],
    anim: 'none',
    sizeIdx: 0,
    customW: 1080,
    customH: 1080,
  };
  await page.evaluate((doc) => window.localStorage.setItem('mazij.autosave.v1', JSON.stringify(doc)), legacyDoc);
  await page.reload();
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-el-id="legacy-text"]');
  // المستند القديم مربّعٌ ساكن، وأدوات التتابع سطحُ حركة (`MEDIUM_SURFACES`) — فيُنقَل إلى
  // وجهةٍ مُوقَّتة بقائمة المقاس نفسها، ويبقى الملفّ المحفوظ كما هو حرفيًّا.
  await switchToTimed(page);
  await page.waitForTimeout(100);

  const legacyRenderedText = await page.locator('[data-el-id="legacy-text"]').innerText();
  assert(legacyRenderedText === 'نص قديم بلا تحريك تتابعي', 'back-compat: a document with no `textAnim` field at all loads and renders its plain text unchanged (stagger defaults to disabled, not crashed/blank)');

  await page.locator('[data-el-id="legacy-text"]').click();
  await page.waitForTimeout(100);
  const migratedToggle = page.locator('[data-testid="stagger-toggle-legacy-text"]');
  assert((await migratedToggle.count()) === 1, 'back-compat: the migrated element exposes the same real stagger controls as a freshly created text element');
  await migratedToggle.click();
  await page.waitForTimeout(100);
  const migratedSpanCount = await page.locator('[data-el-id="legacy-text"] span span').count();
  assert(migratedSpanCount > 5, `back-compat: enabling stagger on a migrated legacy document is a real, working edit (got ${migratedSpanCount} animated units)`);

  // --- 6. Persistence: stagger settings survive a real autosave/reload round trip ---
  await page.locator('[data-testid="stagger-unit-legacy-text-word"]').click();
  await page.waitForTimeout(60);
  await page.locator('[data-testid="stagger-dir-legacy-text-center"]').click();
  await page.waitForTimeout(60);
  await page.locator('[data-testid="stagger-effect-legacy-text-scale"]').click();
  await page.waitForTimeout(900); // let the ~700ms debounced autosave flush
  await page.reload();
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-el-id="legacy-text"]');
  await page.waitForTimeout(100);
  await page.locator('[data-el-id="legacy-text"]').click();
  await page.waitForTimeout(100);
  const unitAfterReload = await page.locator('[data-testid="stagger-unit-legacy-text-word"]').evaluate((el) => getComputedStyle(el).color);
  const unitCharAfterReload = await page.locator('[data-testid="stagger-unit-legacy-text-char"]').evaluate((el) => getComputedStyle(el).color);
  assert(unitAfterReload !== unitCharAfterReload, 'persist: the chosen stagger unit (word, not char) survives a real reload (autosave round-trip)');
  const dirAfterReload = await page.locator('[data-testid="stagger-dir-legacy-text-center"]').evaluate((el) => getComputedStyle(el).color);
  const dirStartAfterReload = await page.locator('[data-testid="stagger-dir-legacy-text-start"]').evaluate((el) => getComputedStyle(el).color);
  assert(dirAfterReload !== dirStartAfterReload, 'persist: the chosen stagger direction (center) survives a real reload');

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
