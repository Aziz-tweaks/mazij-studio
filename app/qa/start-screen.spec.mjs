#!/usr/bin/env node
// Covers the start screen added 18 October 2026, after the owner rated the app
// 2/10 with: "I can't make a new project; the moment I open the program there
// should be a UI asking what the design is, and whether it's a video or an
// image."
//
// Scope under test, all through the real live webview — every number below is
// read off the real DOM or decoded out of a real exported file, never asserted
// from an impression:
//  (1) a cold load shows the start screen and NOT an editor, and the search
//      field is the autofocused element (أداة تصميم شائعة's measured behaviour);
//  (2) choosing a STILL format opens an editor at exactly that format's pixel
//      dimensions with an EMPTY element list — proven twice over, from the live
//      document and from a real 1x PNG export's decoded IHDR;
//  (3) choosing a TIMED format does the same, and the timeline is meaningful:
//      it reports the project as timed with a real duration, and the transport
//      actually advances the playhead;
//  (4) "start from scratch" yields zero elements;
//  (5) custom size works, end to end, and produces those exact pixels;
//  (6) a returning user reaches their existing work WITHOUT going through the
//      chooser — one click on a resume card that reports the real saved size and
//      element count;
//  (7) the format catalogue is more than four, carries both media, and keeps
//      video INTERLEAVED in one ranked list rather than segregated into a video
//      section (the structural decision taken from أداة تصميم شائعة, §1.5);
//  (8) every row makes its own medium legible — no row relies on the filter;
//  (9) custom size is pinned between the search and the list (أداة تصميم شائعة §1.4);
// (10) the blank path is first AND visually dominant (Express's dashed border +
//      محرّر فيديو شائع's one-dominant-action) — measured by real geometry, re-measured
//      22 October 2026 after the owner's hand-drawn redesign: dominance is now
//      height + distinction (a tall rail spanning the grid beside it), not
//      raw area, and the sizes/templates sections became big real-proportioned
//      cards instead of a 40px list. Two assertions below are REPLACEMENTS of
//      18-October measurements the new geometry structurally cannot satisfy —
//      not deletions. See `HomeScreen.tsx`'s header comment for the full case;
// (11) the demo poster was MOVED, not deleted: it is reachable from the
//      templates section and still produces its exact original 7 elements;
// (12) the chooser is not a gate — the format choice is reversible inside the
//      editor, which is why no video-vs-image branch was built (محرّر فيديو شائع §1.2);
// (13) the one thing not built is visibly disabled with a «قريبًا» state.
//
// Run: node qa/start-screen.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { AUTOSAVE_KEY, resumeAfterReload } from './helpers/boot.mjs';

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

/** Reads width/height straight out of a real PNG's IHDR chunk — the only
 * trustworthy answer to "is the exported file actually this many pixels". */
function pngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// Generic PNG container decoder (signature + chunks + zlib inflate + per-scanline
// unfiltering) — reads real pixel bytes off a real downloaded file. Only 8-bit
// RGB/RGBA, non-interlaced: exactly what canvas.toBlob('image/png') produces,
// which is all `renderArtboardPng` ever emits. Same decoder artboards.spec.mjs
// uses, for the same reason: a claim about what is in an exported file has to be
// settled by the file's bytes.
function decodePng(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`decodePng: unsupported bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : null;
  if (!channels) throw new Error(`decodePng: unsupported color type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[pos];
    pos += 1;
    const scanline = raw.subarray(pos, pos + stride);
    pos += stride;
    const prevStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[prevStart + x] : 0;
      const c = y > 0 && x >= channels ? pixels[prevStart + x - channels] : 0;
      let val = scanline[x];
      if (filterType === 1) val = (val + a) & 0xff;
      else if (filterType === 2) val = (val + b) & 0xff;
      else if (filterType === 3) val = (val + Math.floor((a + b) / 2)) & 0xff;
      else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        val = (val + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      pixels[y * stride + x] = val;
    }
  }
  return { width, height, channels, pixels };
}

/** The RGB triple at a fractional position in a decoded PNG. */
function pixelAt(png, fx, fy) {
  const x = Math.min(png.width - 1, Math.max(0, Math.round(fx * (png.width - 1))));
  const y = Math.min(png.height - 1, Math.max(0, Math.round(fy * (png.height - 1))));
  const i = y * png.width * png.channels + x * png.channels;
  return { r: png.pixels[i], g: png.pixels[i + 1], b: png.pixels[i + 2] };
}

/** Exports the open document as exactly ONE 1x PNG and returns its real decoded
 * pixel size.
 *
 * `targetId` must be the export target that corresponds to the open document
 * ('custom' for a custom-size document, otherwise the format's own id). EVERY
 * other target is switched off first — not just the four that start on. Export
 * target selection is session state that survives closing the dialog, so a
 * target left on by an earlier export silently adds a second file, and the first
 * file off the wire is then the wrong size. That reads exactly like a
 * document-size bug and is not one.
 * 1x scale so the file's pixels equal the document's own w/h with no multiplier. */
async function exportedPngSize(page, downloadDir, targetId) {
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(150);
  await page.locator('button:has-text("PNG")').click();
  await page.waitForTimeout(60);
  await page.locator('button', { hasText: '1x' }).click();
  await page.waitForTimeout(60);
  // Normalise to exactly one selected target, reading each tile's real on/off
  // state rather than inferring it from a border colour.
  const tiles = await page.locator('[data-testid^="export-target-"]').evaluateAll((els) =>
    els.map((el) => ({ id: el.getAttribute('data-testid').replace('export-target-', ''), on: el.getAttribute('data-on') === 'true' })),
  );
  for (const t of tiles) {
    if (t.on !== (t.id === targetId)) {
      await page.locator(`[data-testid="export-target-${t.id}"]`).click();
      await page.waitForTimeout(40);
    }
  }
  const selected = await page.locator('[data-testid^="export-target-"][data-on="true"]').count();
  if (selected !== 1) throw new Error(`export helper: expected exactly 1 selected target, got ${selected}`);
  const dl = page.waitForEvent('download', { timeout: 25000 });
  await page.locator('button', { hasText: 'تصدير' }).last().click();
  const download = await dl;
  const out = path.join(downloadDir, `probe-${Date.now()}.png`);
  await download.saveAs(out);
  return { ...pngSize(out), file: out };
}

async function main() {
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-start-'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  // ============ 1. Cold load opens on a question, not a document ============
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="start-screen"]');

  assert(await page.locator('[data-testid="start-screen"]').isVisible(), 'cold load: the start screen is visible');
  assert((await page.locator('[data-screen-label="Editor"]').count()) === 0, 'cold load: NO editor is rendered — the app no longer boots past its own start screen into a document');
  assert((await page.locator('[data-testid="artboard"]').count()) === 0, 'cold load: there is no artboard at all before the user has chosen anything');
  assert(
    (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'format-search',
    'cold load: the format search field is document.activeElement — autofocused, so a user who knows what he wants types it immediately (أداة تصميم شائعة §1.4)',
  );
  assert((await page.locator('[data-testid="resume-project"]').count()) === 0, 'cold load: a first-time user is shown no resume card, because there is genuinely nothing saved');

  // ============ 2. The catalogue: more than four, both media, interleaved ===
  const rows = await page
    .locator('[data-testid^="format-row-"]')
    .evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute('data-testid').replace('format-row-', ''),
        medium: el.getAttribute('data-medium'),
        w: Number(el.getAttribute('data-w')),
        h: Number(el.getAttribute('data-h')),
        badge: el.querySelector('[data-medium]')?.getAttribute('data-medium') ?? null,
        text: el.textContent,
      })),
    );

  assert(rows.length > 4, `catalogue: more than four formats are offered (${rows.length}) — four was too thin for a short-social designer`);
  assert(rows.length === 13, `catalogue: exactly 13 ranked formats are listed (${rows.length})`);
  const still = rows.filter((r) => r.medium === 'still');
  const timed = rows.filter((r) => r.medium === 'timed');
  assert(still.length >= 5 && timed.length >= 5, `catalogue: both media are well represented (${still.length} still, ${timed.length} timed)`);

  // Every row must carry its own medium badge, matching the row's own medium —
  // the "legible at a glance on every row" requirement. A row that relied on the
  // active filter to be understood would fail here.
  assert(rows.every((r) => r.badge === r.medium), 'rows: every single row renders its own medium badge, and the badge agrees with the row — no row needs the filter to be understood');
  assert(rows.every((r) => r.w > 0 && r.h > 0), 'rows: every row carries its real pixel dimensions');

  // The structural decision: video is NOT segregated. If it were, every timed
  // row would sit in one unbroken block at one end of the list. Instead the
  // ranked order must alternate between media at least twice.
  const mediumRuns = rows.reduce((runs, r) => (runs[runs.length - 1] === r.medium ? runs : [...runs, r.medium]), []);
  assert(
    mediumRuns.length >= 4,
    `interleaving: the ranked list alternates between still and timed ${mediumRuns.length} times (${mediumRuns.join('>')}) — video formats are ordinary rows in one list, not a separate video section (أداة تصميم شائعة §1.5)`,
  );
  assert(rows[0].medium === 'still' && rows[1].medium === 'timed', 'interleaving: a timed format appears as early as row 2, mixed in by rank rather than pushed below the stills');

  // ============ 3. The sizes grid: a big real-proportioned example each =====
  // REPLACES the 18 October "40px row pitch" measurement (أداة تصميم شائعة's create
  // picker). That assertion measured the vertical gap between consecutive
  // rows in a single column — a number with no meaning once formats sit in a
  // WRAPPING GRID of big cards (several share the same `top`, so "pitch"
  // would read as 0, not a regression). The owner asked by hand-drawn sketch,
  // 22 October 2026, for "each size with a big example below it, in its real
  // ratio" — so what gets measured now is exactly that: card size, and the
  // glyph's aspect ratio against the format's own real w/h.
  const sizeCardBoxes = await page.locator('[data-testid^="format-row-"]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const glyph = el.querySelector('span > span'); // the glyphStyle() box, un-named on purpose — see HomeScreen.tsx
      const g = glyph.getBoundingClientRect();
      return { id: el.getAttribute('data-testid'), w: r.width, h: r.height, glyphW: g.width, glyphH: g.height, dataW: Number(el.getAttribute('data-w')), dataH: Number(el.getAttribute('data-h')) };
    }),
  );
  // "Big" threshold: at least 3x the old 40px row's height in BOTH dimensions —
  // enough that the proportion glyph inside reads as a shape, not an icon.
  const smallestCardSide = Math.min(...sizeCardBoxes.map((b) => Math.min(b.w, b.h)));
  assert(smallestCardSide >= 120, `geometry: every format card is at least 120×120px — 3x the old 40px row (smallest side seen: ${smallestCardSide.toFixed(1)}px)`);
  // The glyph has to carry the format's REAL aspect ratio, not a fixed icon
  // box: measured against the format's own w/h, with a 2% tolerance for
  // sub-pixel rounding in glyphStyle()'s own width/height calc.
  const worstRatioErr = Math.max(...sizeCardBoxes.map((b) => Math.abs(b.glyphW / b.glyphH - b.dataW / b.dataH) / (b.dataW / b.dataH)));
  assert(worstRatioErr < 0.02, `geometry: every format's proportion glyph matches its real w/h ratio within 2% (worst error ${(worstRatioErr * 100).toFixed(2)}%)`);

  const searchBox = await page.locator('[data-testid="format-search"]').boundingBox();
  const customBox = await page.locator('[data-testid="custom-size-row"]').boundingBox();
  const listBox = await page.locator('[data-testid="format-list"]').boundingBox();
  assert(customBox.y > searchBox.y, 'layout: the custom-size row sits below the search field');
  assert(customBox.y < listBox.y, 'layout: the custom-size row sits ABOVE the ranked list — pinned directly beneath the search, not buried at the bottom of a long list (أداة تصميم شائعة §1.4)');
  assert(customBox.y - (searchBox.y + searchBox.height) < 24, `layout: custom size is directly beneath the search, not merely somewhere above the list (${Math.round(customBox.y - (searchBox.y + searchBox.height))}px gap)`);

  // ============ 4. Blank is first and dominant =============================
  const blankBox = await page.locator('[data-testid="start-blank"]').boundingBox();
  assert(blankBox.y < listBox.y, 'blank-first: the "start from scratch" action is positioned above the format list');
  assert(
    (await page.locator('[data-testid="start-blank"]').evaluate((el) => getComputedStyle(el).borderStyle)) === 'dashed',
    'blank-first: the blank action carries a dashed border, marking it as categorically different from the content-bearing template rows (مزوّد كبير Express convention)',
  );
  // REPLACES the 18 October "blank area > six template rows combined" measure.
  // That comparison is structurally meaningless now: templates are no longer
  // six 40px rows but ten more besides, shown as a scrollable strip of big
  // picture cards (22 October redesign) — "combined row area" was never a
  // stable yardstick, and it is exactly what the redesign discarded on
  // purpose. The owner's new sketch replaces "dominant by area" with
  // "dominant by spanning the full height of the grid beside it, and staying
  // visually distinct" — so that is what gets measured: the rail's real
  // height against its sibling content column's real height, and that it
  // stays a narrow column rather than another competing block.
  const contentBox = await page.locator('[data-testid="start-content"]').boundingBox();
  assert(
    Math.abs(blankBox.height - contentBox.height) < 2,
    `dominance: the blank rail's height (${blankBox.height.toFixed(1)}px) matches the full height of the templates+sizes column beside it (${contentBox.height.toFixed(1)}px) — alignItems:'stretch' makes it span the whole grid, the way محرّر فيديو شائع's one dominant action owns its own visual weight`,
  );
  assert(
    blankBox.width < contentBox.width / 2,
    `dominance: the blank rail stays a narrow column (${blankBox.width.toFixed(1)}px) beside the much wider content grid (${contentBox.width.toFixed(1)}px) — tall and distinct, not another competing block fighting the templates/sizes for area`,
  );

  // The template category switcher ("مبدّل... مثلًا عروضات خصم") the owner
  // asked for today: it has to actually filter, not just decorate — the same
  // bar it was proven to that `medium-filter` really narrows a list, not just
  // toggle a visual state.
  await page.locator('[data-testid="template-category-offers"]').click();
  await page.waitForTimeout(80);
  const offersCards = await page.locator('[data-testid^="starter-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-category')));
  assert(offersCards.length > 0 && offersCards.every((c) => c === 'offers'), `template category filter: picking "عروض وخصومات" narrows the strip to only offers templates (got ${offersCards.join(',')})`);
  await page.locator('[data-testid="template-category-all"]').click();
  await page.waitForTimeout(80);
  const allTemplateCards = await page.locator('[data-testid^="starter-"]').count();
  assert(allTemplateCards === 16, `template category filter: "الكل" restores the full 16-template strip (got ${allTemplateCards})`);

  // And the cards themselves are big enough to show a real preview — not
  // shrunk back down to the old 40px icon row.
  const starterBoxes = await page.locator('[data-testid^="starter-"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; }));
  const smallestStarterSide = Math.min(...starterBoxes.map((b) => Math.min(b.w, b.h)));
  assert(smallestStarterSide >= 160, `dominance: every template card is at least 160×160px — 4x the old 40px row (smallest side seen: ${smallestStarterSide.toFixed(1)}px) — a legible preview needs real pixels, not an icon strip`);

  // ============ 5. The video/image question, answered as a filter ==========
  assert((await page.locator('[data-testid="medium-filter"]').count()) === 1, 'medium filter: the "image or video" question is asked explicitly on the start screen');
  await page.locator('[data-testid="medium-tab-timed"]').click();
  await page.waitForTimeout(80);
  const timedOnly = await page.locator('[data-testid^="format-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-medium')));
  assert(timedOnly.length === timed.length && timedOnly.every((m) => m === 'timed'), `medium filter: picking "video" narrows the list to exactly the ${timed.length} timed formats (got ${timedOnly.length})`);
  await page.locator('[data-testid="medium-tab-still"]').click();
  await page.waitForTimeout(80);
  const stillOnly = await page.locator('[data-testid^="format-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-medium')));
  assert(stillOnly.length === still.length && stillOnly.every((m) => m === 'still'), `medium filter: picking "image" narrows the list to exactly the ${still.length} still formats (got ${stillOnly.length})`);
  await page.locator('[data-testid="medium-tab-all"]').click();
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid^="format-row-"]').count()) === rows.length, 'medium filter: it is a filter and not a gate — returning to "all" restores the whole ranked list, and nothing was ever hidden behind an irreversible branch');

  // Search really filters, and a miss says so inline rather than going blank.
  await page.locator('[data-testid="format-search"]').fill('ستوري');
  await page.waitForTimeout(80);
  const searched = await page.locator('[data-testid^="format-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  assert(searched.length >= 1 && searched.every((id) => id.includes('story')), `search: typing "ستوري" narrows to the story format(s) only (${searched.join(',')})`);
  await page.locator('[data-testid="format-search"]').fill('1350');
  await page.waitForTimeout(80);
  assert((await page.locator('[data-testid="format-row-ig-portrait"]').count()) === 1, 'search: searching by a pixel dimension ("1350") finds the format with that dimension');
  await page.locator('[data-testid="format-search"]').fill('zzzqqq');
  await page.waitForTimeout(80);
  assert(await page.locator('[data-testid="format-no-results"]').isVisible(), 'search: a non-matching query shows an inline "no results" line rather than an empty panel (أداة تصميم شائعة §1.4)');
  assert((await page.locator('[data-testid="custom-size-row"]').isVisible()) === true, 'search: the pinned custom-size row never scrolls or filters away — it is the escape hatch, not a list row');
  await page.locator('[data-testid="format-search"]').fill('');
  await page.waitForTimeout(80);

  // ============ 6. «قريبًا» for the one thing not built ====================
  const soon = page.locator('[data-testid="projects-soon"]');
  assert(await soon.isVisible(), 'coming-soon: the multi-project library is shown rather than silently absent');
  assert((await soon.getAttribute('aria-disabled')) === 'true', 'coming-soon: it is really disabled, not dead-but-clickable');
  assert((await soon.innerText()).includes('قريبًا'), 'coming-soon: it is labelled «قريبًا», so nothing on this screen promises a capability that is not there');

  // ============ 7. A STILL format: exact pixels, empty document ============
  await page.locator('[data-testid="format-row-ig-portrait"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  const ab = page.locator('[data-testid="artboard"]');
  assert((await page.locator('[data-screen-label="Editor"]').count()) === 1, 'still format: one click from the start screen reaches the editor');
  assert(Number(await ab.getAttribute('data-doc-w')) === 1080 && Number(await ab.getAttribute('data-doc-h')) === 1350, `still format: the editor opens at exactly 1080×1350 (got ${await ab.getAttribute('data-doc-w')}×${await ab.getAttribute('data-doc-h')})`);
  assert((await page.locator('[data-el-id]').count()) === 0, 'still format: the element list is EMPTY — the editor no longer opens into a finished demo poster the user did not make');
  assert((await page.locator('[data-testid="stage-headline"]').count()) === 0, "still format: specifically, the demo poster's headline is not present");
  assert((await ab.getAttribute('data-doc-medium')) === 'still', 'still format: the document reports itself as still');
  assert((await page.locator('[data-testid="timeline-medium"]').getAttribute('data-medium')) === 'still', 'still format: the timeline reports the project as a still, and shows no duration for it');
  assert((await page.locator('[data-testid="timeline-medium"]').getAttribute('data-duration')) === '', 'still format: no duration number is printed on a still project — a "5s" readout on a poster would be a meaningless number');

  const stillPng = await exportedPngSize(page, downloadDir, 'ig-portrait');
  assert(stillPng && stillPng.w === 1080 && stillPng.h === 1350, `still format: a real 1x PNG export decodes to exactly 1080×1350 real pixels (got ${JSON.stringify(stillPng)}) — the chosen dimensions are the document's actual dimensions, not just a label`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);

  // ============ 8. A TIMED format: same, plus a meaningful timeline ========
  await page.locator('[data-testid="go-home-btn"], [title="الرئيسية"]').first().click();
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.locator('[data-testid="format-row-ig-reel"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  assert(Number(await ab.getAttribute('data-doc-w')) === 1080 && Number(await ab.getAttribute('data-doc-h')) === 1920, `timed format: the editor opens at exactly 1080×1920 (got ${await ab.getAttribute('data-doc-w')}×${await ab.getAttribute('data-doc-h')})`);
  assert((await page.locator('[data-el-id]').count()) === 0, 'timed format: the element list is EMPTY too — blank is the default for every format, not just the still ones');

  const tlMedium = page.locator('[data-testid="timeline-medium"]');
  assert((await tlMedium.getAttribute('data-medium')) === 'timed', 'timed format: the timeline reports the project as timed');
  assert(Number(await tlMedium.getAttribute('data-duration')) > 0, `timed format: the timeline reports a real, positive project duration (${await tlMedium.getAttribute('data-duration')}s)`);
  assert((await tlMedium.innerText()).includes('فيديو'), 'timed format: the timeline says so in words, not only in an attribute');
  assert(await page.locator('[data-testid="timeline-ruler"]').isVisible(), 'timed format: the timeline ruler is actually on screen for a timed project');

  // "Meaningful" has to mean the transport does something, not merely that a
  // ruler is drawn — so drive the real play button and read the real clock.
  //
  // The clock is the primary signal rather than the playhead's screen x, because
  // screen x alone is ambiguous: it moves backwards whenever the 5s loop wraps,
  // which looks identical to a broken transport. (The playhead's direction is
  // checked too, and it travels LEFT-to-right: the track area is explicitly
  // `dir="ltr"` and the playhead is positioned with a physical `left`, because
  // time is a left-to-right axis even in an otherwise fully mirrored RTL editor.)
  const clock = () => page.locator('[data-testid="timeline-time"]').evaluate((el) => Number(el.getAttribute('data-t')));
  const playheadX = () => page.locator('[data-testid="timeline-playhead"]').evaluate((el) => el.getBoundingClientRect().x);
  // Park the playhead at the very start first (the same ruler click the timeline
  // spec uses). Without this the clock starts at 2.2s of a 5s project and wraps
  // to 0 mid-measurement, so "did it advance" becomes unanswerable.
  const rulerBox = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(rulerBox.x + 1, rulerBox.y + rulerBox.height / 2);
  await page.waitForTimeout(80);
  assert((await clock()) < 0.2, `timed format: the ruler is scrubbable — clicking its start parks the clock at zero (${(await clock()).toFixed(2)}s)`);
  const tBefore = await clock();
  const xBefore = await playheadX();
  await page.locator('[data-testid="timeline-play-btn"]').click();
  await page.waitForTimeout(500);
  const tDuring = await clock();
  const xDuring = await playheadX();
  await page.locator('[data-testid="timeline-play-btn"]').click();
  await page.waitForTimeout(80);
  assert(tDuring > tBefore, `timed format: pressing play really advances the project clock (${tBefore.toFixed(2)}s → ${tDuring.toFixed(2)}s) — the timeline on a timed project is live, not decorative`);
  assert(xDuring > xBefore, `timed format: and the playhead really moves with it along the time axis (x ${xBefore.toFixed(1)} → ${xDuring.toFixed(1)})`);
  const tAfterPause = await clock();
  await page.waitForTimeout(300);
  assert((await clock()) === tAfterPause, `timed format: pressing play again really pauses — the clock holds at ${tAfterPause.toFixed(2)}s`);

  // ============ 9. The choice is reversible — why there is no branch =======
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(80);
  await page.locator('[data-testid="size-option-yt-thumb"]').click();
  await page.waitForTimeout(120);
  assert(Number(await ab.getAttribute('data-doc-w')) === 1280 && Number(await ab.getAttribute('data-doc-h')) === 720, 'reversible: the format chosen on the start screen can be changed inside the editor, to exact new dimensions');
  assert((await ab.getAttribute('data-doc-medium')) === 'still', 'reversible: switching from a timed format to a still one flips the project medium in place');
  assert((await tlMedium.getAttribute('data-medium')) === 'still', 'reversible: and the timeline follows it — so "video or image" is never a decision the user must get right before he can start, which is exactly why it was built as a filter and not a two-button gate');

  // ============ 10. "Start from scratch" yields zero elements =============
  await page.locator('[data-testid="go-home-btn"], [title="الرئيسية"]').first().click();
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.locator('[data-testid="start-blank"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  assert((await page.locator('[data-el-id]').count()) === 0, 'start from scratch: the dominant blank action yields an artboard with exactly zero elements');
  assert((await page.locator('[data-screen-label="Editor"]').count()) === 1, 'start from scratch: one click, no intermediate decision, straight to a drawable canvas');

  // "Empty" has to mean empty in the *file*, not just in the element list. The
  // artboard used to paint a decorative accent circle unconditionally — bleeding
  // off the top corner, in the palette's accent colour, and baked into every
  // exported PNG — from a shape the user cannot select, move or delete. On a
  // blank document that is someone else's content: the same defect being fixed
  // here, just smaller. So decode the real exported pixels and require the
  // corner the blob used to occupy to be plain background.
  assert(
    (await page.locator('[data-testid="artboard"]').evaluate((el) => el.childElementCount)) === 0,
    'start from scratch: the artboard really has no children at all — not even an undeletable decoration',
  );
  const blankPng = await exportedPngSize(page, downloadDir, 'ig');
  const decodedBlank = decodePng(blankPng.file);
  const corner = pixelAt(decodedBlank, 0.82, 0.04); // where the accent circle used to bleed in
  const middle = pixelAt(decodedBlank, 0.5, 0.5);
  assert(
    corner.r === middle.r && corner.g === middle.g && corner.b === middle.b,
    `start from scratch: the exported PNG is one flat background — corner ${JSON.stringify(corner)} equals centre ${JSON.stringify(middle)}, so nothing was burned into a file the user asked to be blank`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);

  // And the converse, so the above cannot pass by the decoration having been
  // deleted outright: a document WITH content keeps the decoration it always had.
  await page.locator('[data-testid="go-home-btn"], [title="الرئيسية"]').first().click();
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.locator('[data-testid="starter-demo-poster"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  const posterPng = await exportedPngSize(page, downloadDir, 'ig');
  const decodedPoster = decodePng(posterPng.file);
  const posterCorner = pixelAt(decodedPoster, 0.82, 0.04);
  const posterMiddle = pixelAt(decodedPoster, 0.5, 0.5);
  assert(
    posterCorner.r !== posterMiddle.r || posterCorner.g !== posterMiddle.g || posterCorner.b !== posterMiddle.b,
    `blank-only suppression: a populated document still exports its accent decoration (corner ${JSON.stringify(posterCorner)} differs from centre ${JSON.stringify(posterMiddle)}) — the change is scoped to empty documents, it did not delete a feature`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);

  // ============ 11. Custom size, end to end ===============================
  await page.locator('[data-testid="go-home-btn"], [title="الرئيسية"]').first().click();
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.locator('[data-testid="home-custom-w"]').fill('777');
  await page.locator('[data-testid="home-custom-h"]').fill('333');
  await page.locator('[data-testid="home-custom-start"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  assert(Number(await ab.getAttribute('data-doc-w')) === 777 && Number(await ab.getAttribute('data-doc-h')) === 333, `custom size: the typed 777×333 is the document's real size (got ${await ab.getAttribute('data-doc-w')}×${await ab.getAttribute('data-doc-h')})`);
  assert((await page.locator('[data-el-id]').count()) === 0, 'custom size: a custom-size project also starts empty');
  const customPng = await exportedPngSize(page, downloadDir, 'custom');
  assert(customPng && customPng.w === 777 && customPng.h === 333, `custom size: a real 1x PNG export decodes to exactly 777×333 real pixels (got ${JSON.stringify(customPng)})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);

  // ============ 12. The demo was moved to templates, not deleted ==========
  await page.locator('[data-testid="go-home-btn"], [title="الرئيسية"]').first().click();
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.locator('[data-testid="starter-demo-poster"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  const demoIds = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  assert(demoIds.length === 7, `demo preserved: the demo poster still produces its original 7 elements (got ${demoIds.length})`);
  assert(
    ['img', 'discount', 'head', 'badge', 'badge-label', 'logo', 'logo-label'].every((id) => demoIds.includes(id)),
    `demo preserved: every original element id survived the move into the templates path (${demoIds.join(',')})`,
  );
  assert(Number(await ab.getAttribute('data-doc-w')) === 1080 && Number(await ab.getAttribute('data-doc-h')) === 1080, 'demo preserved: it opens at its original 1080×1080');
  assert(await page.locator('[data-testid="stage-headline"]').isVisible(), 'demo preserved: the headline renders, so the poster is intact and not a husk');
  assert((await page.locator('[data-testid="timeline-medium"]').count()) === 1, 'demo preserved: it lands in a normal, fully working editor');

  // ============ 13. The returning user is never trapped ===================
  // Make a real edit so there is real saved work, then reload for real.
  await page.locator('[data-el-id="head"]').click();
  await page.waitForTimeout(80);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1200); // autosave debounce is 700ms
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="start-screen"]');

  const resume = page.locator('[data-testid="resume-project"]');
  assert(await resume.isVisible(), 'returning user: a saved project is offered prominently on the start screen');
  assert(Number(await resume.getAttribute('data-element-count')) === 7, `returning user: the resume card reports the real saved element count (got ${await resume.getAttribute('data-element-count')}) — it reads the saved file, it does not guess`);
  assert((await resume.getAttribute('data-size-id')) === 'ig', 'returning user: and the real saved size');
  const resumeBox = await resume.boundingBox();
  const blankBox2 = await page.locator('[data-testid="start-blank"]').boundingBox();
  assert(resumeBox.y < blankBox2.y, 'returning user: the resume card is placed above even the blank action — someone who just wants to carry on sees that first');

  // The decisive assertion: reaching the saved work costs ONE click and does not
  // pass through the format chooser.
  await resume.click();
  await page.waitForSelector('[data-testid="artboard"]');
  assert((await page.locator('[data-screen-label="Editor"]').count()) === 1, 'returning user: ONE click on the resume card reaches the editor — no format had to be chosen, no size, no template');
  const resumedIds = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  assert(resumedIds.length === 7, `returning user: the resumed document is their real work, all 7 elements of it (got ${resumedIds.length})`);
  assert(Number(await ab.getAttribute('data-doc-w')) === 1080, 'returning user: at the size they left it');

  // And a blank-but-sized project must survive a reload too: that used to be
  // thrown away by an `elements.length` guard in the mount restore, which would
  // have silently dropped every project started from scratch.
  await page.locator('[data-testid="go-home-btn"], [title="الرئيسية"]').first().click();
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.locator('[data-testid="format-row-snap"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  // Touch the document so it is genuinely dirty and gets autosaved.
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(80);
  await page.locator('[data-testid="size-option-wa-status"]').click();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="start-screen"]');
  const blankResume = page.locator('[data-testid="resume-project"]');
  assert(await blankResume.isVisible(), 'returning user: an EMPTY-but-sized project is still offered for resume — starting from scratch and reloading no longer loses the project');
  assert(Number(await blankResume.getAttribute('data-element-count')) === 0, 'returning user: the card honestly reports zero elements rather than hiding an empty project');
  await resumeAfterReload(page);
  assert(Number(await ab.getAttribute('data-doc-w')) === 1080 && Number(await ab.getAttribute('data-doc-h')) === 1920, 'returning user: the blank project comes back at the size it was saved at');
  assert((await page.locator('[data-el-id]').count()) === 0, 'returning user: and still empty, not repopulated with demo content');

  assert(pageErrors.length === 0, `no runtime errors during the whole start-screen session (${pageErrors.join(' | ')})`);

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (pageErrors.length) {
    console.log('Console/page errors observed during the run:');
    pageErrors.forEach((e) => console.log(' -', e));
  }
  await browser.close();
  fs.rmSync(downloadDir, { recursive: true, force: true });
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
