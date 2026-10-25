// Roadmap #12 — a real Arabic shaping pipeline for the text paths that need
// per-glyph control (vector outlines, text-on-path, glyph-aware stagger) — never for
// plain text, which the platform (Chromium's own text engine, itself backed by
// HarfBuzz) already shapes correctly. See docs/COMPETITIVE-ANALYSIS.md §3.4 for the
// full justification and the exact algorithm this follows.
//
// The three libraries split cleanly along the three sub-problems:
// - `bidi-js` resolves UAX#9 paragraph embedding levels and run order — a separate,
//   *earlier* pass than shaping, operating on the whole logical string.
// - `harfbuzzjs` (HarfBuzz compiled to WASM) shapes each same-direction run in its own
//   *logical* order (never reversed first — reversing before shaping breaks the
//   joining-neighbor lookups a shaper depends on, the single most common bug in
//   from-scratch Arabic text engines) and also extracts each shaped glyph's outline
//   directly via `Font.glyphToPath` — the exact hinted contours the shaper itself
//   used, so there is no second font parse that could disagree on glyph IDs.
// - `woff2-encoder` (its `/decompress` subpath only, for a smaller bundle) decodes
//   this app's bundled `.woff2` font files into the raw sfnt (ttf) bytes HarfBuzz's
//   WASM build expects — harfbuzzjs's tiny build has no WOFF2 (Brotli) decoder of its
//   own. (`wawoff2`, the more commonly cited WOFF2-decode package, was tried first —
//   its compiled Emscripten binding never resolves its `onRuntimeInitialized` promise
//   under Vite/browser ESM, only under plain Node `require`; `woff2-encoder` ships an
//   actual browser-targeted ESM build and was swapped in instead.)
//
// `opentype.js` was evaluated per the brief but is redundant here: harfbuzzjs's own
// `Font.glyphToPath` already returns real outline path data for the exact glyph a
// shape call produced, with no risk of a second independent font parser mapping
// glyph IDs differently. Pulling in a second font-parsing library to do the same job
// worse is not "more correct" — see docs/CONTROLS.md for this decision.
import bidiFactory from 'bidi-js';
import type { PathCmd } from './pathGeometry';
import type { Geometry, TextElement } from '../state/elements';
import { firstBaselineShift, lineHeightOf } from '../state/elements';
import type { Weight } from '../state/types';

const bidi = bidiFactory();

// ---------------------------------------------------------------------------
// HarfBuzz WASM module — loaded once, lazily, only when a shaping path is
// actually used (never on app startup, to keep the common "plain text" case free).
// ---------------------------------------------------------------------------
type HbModule = typeof import('harfbuzzjs');
let hbPromise: Promise<HbModule> | null = null;
function loadHb(): Promise<HbModule> {
  if (!hbPromise) hbPromise = import('harfbuzzjs');
  return hbPromise;
}

// ---------------------------------------------------------------------------
// Font loading: this app ships Alexandria/Readex Pro/Vazirmatn as Arabic+Latin
// subset pairs (see src/assets/fonts/fonts.css) — a mixed-script run must pick the
// subset that actually contains its glyphs, or HarfBuzz silently falls back to
// `.notdef` (glyph id 0) for anything outside that subset's coverage (verified while
// building this pipeline: shaping a mixed string against a single subset font
// produced real `.notdef` glyphs for the other script — see docs/CONTROLS.md).
// ---------------------------------------------------------------------------
export type FontWeightNum = 400 | 500 | 600 | 700 | 800;

const BUILTIN_FONT_FILES: Record<string, Record<FontWeightNum, { ar: string; latin: string }>> = {
  Alexandria: {
    400: { ar: 'Alexandria-400-0.woff2', latin: 'Alexandria-400-1.woff2' },
    500: { ar: 'Alexandria-500-2.woff2', latin: 'Alexandria-500-3.woff2' },
    600: { ar: 'Alexandria-600-4.woff2', latin: 'Alexandria-600-5.woff2' },
    700: { ar: 'Alexandria-700-6.woff2', latin: 'Alexandria-700-7.woff2' },
    800: { ar: 'Alexandria-800-8.woff2', latin: 'Alexandria-800-9.woff2' },
  },
  'Readex Pro': {
    400: { ar: 'Readex-Pro-400-10.woff2', latin: 'Readex-Pro-400-11.woff2' },
    500: { ar: 'Readex-Pro-500-12.woff2', latin: 'Readex-Pro-500-13.woff2' },
    600: { ar: 'Readex-Pro-600-14.woff2', latin: 'Readex-Pro-600-15.woff2' },
    700: { ar: 'Readex-Pro-700-16.woff2', latin: 'Readex-Pro-700-17.woff2' },
    800: { ar: 'Readex-Pro-700-16.woff2', latin: 'Readex-Pro-700-17.woff2' }, // Readex Pro ships no 800 — fall back to 700, same as the CSS @font-face set.
  },
  Vazirmatn: {
    400: { ar: 'Vazirmatn-400-18.woff2', latin: 'Vazirmatn-400-19.woff2' },
    500: { ar: 'Vazirmatn-500-20.woff2', latin: 'Vazirmatn-500-21.woff2' },
    600: { ar: 'Vazirmatn-600-22.woff2', latin: 'Vazirmatn-600-23.woff2' },
    700: { ar: 'Vazirmatn-700-24.woff2', latin: 'Vazirmatn-700-25.woff2' },
    800: { ar: 'Vazirmatn-800-26.woff2', latin: 'Vazirmatn-800-27.woff2' },
  },
};

/** `TextElement.fontFamily` stores the raw CSS `font-family` value, which for
 * multi-word names is pre-quoted (`"'Readex Pro'"`) — strip that to match the
 * lookup table above. */
function normalizeFamily(family: string): string {
  return family.replace(/^['"]|['"]$/g, '');
}

export function isBuiltinFontFamily(family: string): boolean {
  return normalizeFamily(family) in BUILTIN_FONT_FILES;
}

function fontFileUrl(fileName: string): string {
  return new URL(`../assets/fonts/files/${fileName}`, import.meta.url).href;
}

export interface ShapedFont {
  font: InstanceType<HbModule['Font']>;
  upem: number;
}

const fontCache = new Map<string, Promise<ShapedFont>>();

async function loadShapedFont(fileName: string): Promise<ShapedFont> {
  const cached = fontCache.get(fileName);
  if (cached) return cached;
  const promise = (async () => {
    const [hb, decompress, res] = await Promise.all([loadHb(), import('woff2-encoder/decompress').then((m) => m.default), fetch(fontFileUrl(fileName))]);
    if (!res.ok) throw new Error(`فشل تحميل ملف الخط: ${fileName}`);
    const woff2Bytes = new Uint8Array(await res.arrayBuffer());
    const sfntBytes = await decompress(woff2Bytes);
    const blob = new hb.Blob(sfntBytes);
    const face = new hb.Face(blob);
    const font = new hb.Font(face);
    font.setScale(face.upem, face.upem);
    return { font, upem: face.upem };
  })();
  fontCache.set(fileName, promise);
  return promise;
}

/** Loads (and caches) both subset faces of a built-in family+weight pair. Throws a
 * (Arabic) error for any family this pipeline doesn't recognize — see
 * `isBuiltinFontFamily`, meant to be checked before offering the "convert to
 * outlines" action in the UI at all. */
export async function loadBuiltinFontPair(family: string, weight: number): Promise<{ ar: ShapedFont; latin: ShapedFont }> {
  const key = normalizeFamily(family);
  const table = BUILTIN_FONT_FILES[key];
  if (!table) throw new Error(`الخط "${family}" ليس من خطوط مزيج المدمجة — تحويل النص إلى مخطط متجهي غير متاح لخطوط مخصّصة بعد`);
  const nearestWeight = ([400, 500, 600, 700, 800] as FontWeightNum[]).reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best));
  const files = table[nearestWeight];
  const [ar, latin] = await Promise.all([loadShapedFont(files.ar), loadShapedFont(files.latin)]);
  return { ar, latin };
}

// ---------------------------------------------------------------------------
// Bidi run splitting (UAX#9) — a separate, earlier pass than shaping. See the file
// header: this must happen on the whole logical string, and shaping must then run on
// each run's *logical* (unreversed) text.
// ---------------------------------------------------------------------------
export interface BidiRun {
  start: number;
  end: number;
  /** Odd = right-to-left, even = left-to-right (UAX#9 embedding level parity). */
  level: number;
}

/** Splits `text` into contiguous same-embedding-level runs, in *visual* (left-to-right
 * screen) order — so the caller can lay each run's shaped glyphs out by simply
 * advancing a pen left-to-right across runs, exactly as HarfBuzz expects within a
 * run (see `shapeRun` below). */
export function bidiVisualRuns(text: string, baseDir: 'rtl' | 'ltr'): BidiRun[] {
  if (!text.length) return [];
  const embeddingLevels = bidi.getEmbeddingLevels(text, baseDir);
  const levels = embeddingLevels.levels;
  const runs: BidiRun[] = [];
  let start = 0;
  for (let i = 1; i <= levels.length; i++) {
    if (i === levels.length || levels[i] !== levels[start]) {
      runs.push({ start, end: i, level: levels[start] });
      start = i;
    }
  }
  // `getReorderedIndices` gives, per *visual* position, which *logical* character
  // sits there — i.e. its inverse tells us each logical character's visual position.
  // Every run occupies a contiguous block of visual positions (runs are exactly the
  // level-run primitive the L2 reordering rule operates on), so sorting runs by any
  // one representative character's visual position correctly orders the runs.
  const indices = bidi.getReorderedIndices(text, embeddingLevels);
  const visualPosOf = new Array<number>(text.length);
  indices.forEach((logicalIdx: number, visualPos: number) => {
    visualPosOf[logicalIdx] = visualPos;
  });
  return [...runs].sort((a, b) => visualPosOf[a.start] - visualPosOf[b.start]);
}

// ---------------------------------------------------------------------------
// Shaping a single run (already-correct logical order, already-resolved direction).
// ---------------------------------------------------------------------------
export interface ShapedGlyph {
  gid: number;
  /** Pen-relative position in font design units (upem), y-up (font convention). */
  x: number;
  y: number;
  /** Index into the *original* paragraph string of this glyph's source cluster —
   * lets a caller map glyphs back to logical characters/grapheme-cluster stagger
   * tokens. */
  logicalIndex: number;
  font: ShapedFont;
}

function isArabicScriptChar(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0x0750 && cp <= 0x077f) || (cp >= 0x08a0 && cp <= 0x08ff) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfefc);
}

async function shapeRun(hb: HbModule, runText: string, runStart: number, dir: 'rtl' | 'ltr', font: ShapedFont): Promise<{ glyphs: ShapedGlyph[]; width: number }> {
  const buffer = new hb.Buffer();
  buffer.addText(runText);
  // `setDirection` takes the numeric `Direction` enum, not a string — must be set
  // *before* `guessSegmentProperties()`, which only fills in whatever is still unset
  // (so script/language still get guessed correctly, but this run's bidi-resolved
  // direction — which Unicode character-property guessing alone cannot know, since
  // that's exactly what the earlier bidi pass resolved — is never overridden).
  buffer.setDirection(dir === 'rtl' ? hb.Direction.RTL : hb.Direction.LTR);
  buffer.guessSegmentProperties();
  hb.shape(font.font, buffer);
  const infos = buffer.getGlyphInfos();
  const positions = buffer.getGlyphPositions();
  let penX = 0;
  const glyphs: ShapedGlyph[] = [];
  // Standard HarfBuzz rendering convention, true for *both* directions: walk the
  // buffer in its own output order, drawing each glyph at the current pen position
  // plus its (xOffset, yOffset), then always *add* xAdvance — never subtract, never
  // branch on direction. For an RTL run, HarfBuzz itself already orders the buffer so
  // this produces the correct left-to-right pixel layout *within that run*; only the
  // run's position *among other runs* (handled by `bidiVisualRuns`) depends on
  // direction. (Verified empirically while building this: a plain 5-letter Arabic
  // word shapes to 5 glyphs whose x keeps increasing while their `cluster` values
  // count down from 4 to 0 — i.e. buffer order is already reversed relative to
  // logical order, and simple pen addition lays them out correctly.)
  for (let i = 0; i < infos.length; i++) {
    const pos = positions[i];
    glyphs.push({ gid: infos[i].codepoint, x: penX + pos.xOffset, y: pos.yOffset, logicalIndex: runStart + infos[i].cluster, font });
    penX += pos.xAdvance;
  }
  return { glyphs, width: penX };
}

export interface ShapedParagraph {
  glyphs: ShapedGlyph[];
  width: number;
}

/** Full pipeline for one line of text: bidi run-splitting (logical order preserved
 * per run), per-run script-based font selection, per-run HarfBuzz shaping, then
 * placing the shaped runs left-to-right in bidi visual order. This is the "shape on
 * logical order, then reorder for display" sequence — never reorder characters
 * before shaping. */
export async function shapeParagraph(text: string, fonts: { ar: ShapedFont; latin: ShapedFont }, baseDir: 'rtl' | 'ltr'): Promise<ShapedParagraph> {
  const hb = await loadHb();
  const runs = bidiVisualRuns(text, baseDir);
  let penX = 0;
  const glyphs: ShapedGlyph[] = [];
  for (const run of runs) {
    const runText = text.slice(run.start, run.end);
    const dir: 'rtl' | 'ltr' = run.level % 2 === 1 ? 'rtl' : 'ltr';
    const font = [...runText].some(isArabicScriptChar) ? fonts.ar : fonts.latin;
    const shaped = await shapeRun(hb, runText, run.start, dir, font);
    for (const g of shaped.glyphs) glyphs.push({ ...g, x: g.x + penX });
    penX += shaped.width;
  }
  return { glyphs, width: penX };
}

// ---------------------------------------------------------------------------
// Glyph outline extraction — HarfBuzz's own `Font.glyphToPath`, parsed into this
// app's `PathCmd[]` shape (see src/lib/pathGeometry.ts). Font outlines are y-up
// (ascender positive); this app's canvas/SVG space is y-down, so every extracted
// coordinate gets its Y sign flipped once here, at the source, rather than in every
// caller.
// ---------------------------------------------------------------------------
function quadToCubic(p0: { x: number; y: number }, qc: { x: number; y: number }, p1: { x: number; y: number }): { x1: number; y1: number; x2: number; y2: number } {
  return {
    x1: p0.x + (2 / 3) * (qc.x - p0.x),
    y1: p0.y + (2 / 3) * (qc.y - p0.y),
    x2: p1.x + (2 / 3) * (qc.x - p1.x),
    y2: p1.y + (2 / 3) * (qc.y - p1.y),
  };
}

const PATH_TOKEN_RE = /[MLCQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi;

/** Parses the SVG path string `Font.glyphToPath` returns (absolute M/L/C/Q/Z,
 * y-up font units) into this app's `PathCmd[]` (M/L/C/Z only — quadratics are
 * converted to the equivalent cubic), with Y flipped to this app's y-down
 * convention. `glyphToPath` already resolves TrueType's own on/off-curve point
 * encoding, so there is no separate "simple vs composite glyph" case to handle here. */
export function glyphOutlineCmds(font: ShapedFont, gid: number): PathCmd[] {
  const raw = font.font.glyphToPath(gid);
  if (!raw) return [];
  const tokens = raw.match(PATH_TOKEN_RE) ?? [];
  const cmds: PathCmd[] = [];
  let cur = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let i = 0;
  const nextNum = () => parseFloat(tokens[i++]);
  const flip = (y: number) => -y;
  while (i < tokens.length) {
    const t = tokens[i++];
    if (t === 'M') {
      const x = nextNum();
      const y = flip(nextNum());
      cur = { x, y };
      start = cur;
      cmds.push({ c: 'M', x, y });
    } else if (t === 'L') {
      const x = nextNum();
      const y = flip(nextNum());
      cur = { x, y };
      cmds.push({ c: 'L', x, y });
    } else if (t === 'C') {
      const x1 = nextNum();
      const y1 = flip(nextNum());
      const x2 = nextNum();
      const y2 = flip(nextNum());
      const x = nextNum();
      const y = flip(nextNum());
      cur = { x, y };
      cmds.push({ c: 'C', x1, y1, x2, y2, x, y });
    } else if (t === 'Q') {
      const qx = nextNum();
      const qy = flip(nextNum());
      const x = nextNum();
      const y = flip(nextNum());
      const { x1, y1, x2, y2 } = quadToCubic(cur, { x: qx, y: qy }, { x, y });
      cmds.push({ c: 'C', x1, y1, x2, y2, x, y });
      cur = { x, y };
    } else if (t === 'Z') {
      cur = start;
      cmds.push({ c: 'Z' });
    }
  }
  return cmds;
}

export interface TextOutlineResult {
  /** Flat command list — multiple M..Z subpaths concatenated, one per glyph contour.
   * Always rendered with the default (nonzero) fill rule: TrueType/OpenType contour
   * winding direction already encodes solid-vs-hole correctly (unlike this app's
   * boolean-op `subpaths`, which are flattened and need `evenodd`). */
  cmds: PathCmd[];
  /** Number of distinct glyphs placed (ligatures count once) — the correctness proof
   * the QA spec asserts on directly. */
  glyphCount: number;
  /** Total advance width, in the same units as `cmds` (post fontSize scaling). */
  width: number;
}

/** Shapes `text` as a single line (no wrapping) and returns every glyph's outline,
 * positioned by its real shaped advance — `fontSizePx` units, y-down, baseline at
 * y=0, pen origin at x=0. This is the function both "convert to outline" and the QA
 * proof spec call. */
export async function shapeLineToOutline(text: string, fonts: { ar: ShapedFont; latin: ShapedFont }, baseDir: 'rtl' | 'ltr', fontSizePx: number): Promise<TextOutlineResult> {
  const { glyphs, width } = await shapeParagraph(text, fonts, baseDir);
  const cmds: PathCmd[] = [];
  for (const g of glyphs) {
    const scale = fontSizePx / g.font.upem;
    const dx = g.x * scale;
    const dy = -g.y * scale; // flip once more: g.y is font-space y-up pen offset
    for (const cmd of glyphOutlineCmds(g.font, g.gid)) {
      if (cmd.c === 'Z') {
        cmds.push(cmd);
      } else if (cmd.c === 'M' || cmd.c === 'L') {
        cmds.push({ c: cmd.c, x: cmd.x * scale + dx, y: cmd.y * scale + dy });
      } else {
        cmds.push({ c: 'C', x1: cmd.x1 * scale + dx, y1: cmd.y1 * scale + dy, x2: cmd.x2 * scale + dx, y2: cmd.y2 * scale + dy, x: cmd.x * scale + dx, y: cmd.y * scale + dy });
      }
    }
  }
  return { cmds, glyphCount: glyphs.length, width: width * (fontSizePx / (glyphs[0]?.font.upem ?? 1000)) };
}

// ---------------------------------------------------------------------------
// High-level entry point: "convert text to outlines". Scoped, like the roadmap #6
// stagger's 'line' unit, to *authored* line breaks (`\n`) — no auto-wrap reflow — see
// `tokenizeLines` in textStagger.ts for the identical, already-shipped precedent.
// Positions each line exactly like the plain-text branch of exportArtboard.ts
// (`alignX`/`startY`/`lineHeight`), then tightens the final box to the real ink
// bounds of the shaped glyphs — never the original (looser) text box.
// ---------------------------------------------------------------------------
const WEIGHT_NUM: Record<Weight, FontWeightNum> = { regular: 400, medium: 600, bold: 800 };

export interface TextOutlineConversion {
  outline: PathCmd[];
  geo: Geometry;
}

/** `size`/`geo` are in artboard pixels (the same space `exportArtboard.ts` renders
 * in); `dir` is the document's current logical text direction ('rtl' for the 'ar'
 * UI language, matching every other text render path in this app). Throws (an
 * Arabic-language error) if `el.fontFamily` isn't one of this app's three built-in
 * families — see `isBuiltinFontFamily`. */
export async function convertTextElementToOutline(el: TextElement, size: { w: number; h: number }, dir: 'rtl' | 'ltr'): Promise<TextOutlineConversion> {
  const fonts = await loadBuiltinFontPair(el.fontFamily, WEIGHT_NUM[el.weight]);
  const bw = el.geo.w * size.w;
  const bh = el.geo.h * size.h;
  const fontPx = (el.fontSize / 1080) * size.w;
  const lines = el.text.split('\n');
  const lineHeight = fontPx * lineHeightOf(el);
  const totalHeight = lines.length * lineHeight;
  const shift = firstBaselineShift(el, fontPx);
  const startIsRight = dir === 'rtl';
  const alignX = el.halign === 'start' ? (startIsRight ? bw : 0) : el.halign === 'end' ? (startIsRight ? 0 : bw) : bw / 2;
  let startY: number;
  if (el.valign === 'top') startY = fontPx * 0.9 + shift;
  else if (el.valign === 'middle') startY = (bh - totalHeight) / 2 + fontPx * 0.9 + shift;
  else startY = bh - totalHeight + fontPx * 0.9 + shift;
  // 'left'/'right'/'center' here mirror exactly what `ctx.textAlign` would have
  // anchored the browser's own `fillText` to for the same halign/dir combination —
  // see the plain-text branch this replaces in exportArtboard.ts.
  const textAlign = el.halign === 'start' ? (startIsRight ? 'right' : 'left') : el.halign === 'end' ? (startIsRight ? 'left' : 'right') : 'center';

  const allCmds: PathCmd[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const { cmds, width } = await shapeLineToOutline(line, fonts, dir, fontPx);
    const originX = textAlign === 'center' ? alignX - width / 2 : textAlign === 'right' ? alignX - width : alignX;
    const originY = startY + i * lineHeight;
    for (const cmd of cmds) {
      if (cmd.c === 'Z') {
        allCmds.push(cmd);
        continue;
      }
      const x = cmd.x + originX;
      const y = cmd.y + originY;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (cmd.c === 'M' || cmd.c === 'L') {
        allCmds.push({ c: cmd.c, x, y });
      } else {
        const x1 = cmd.x1 + originX;
        const y1 = cmd.y1 + originY;
        const x2 = cmd.x2 + originX;
        const y2 = cmd.y2 + originY;
        minX = Math.min(minX, x1, x2);
        maxX = Math.max(maxX, x1, x2);
        minY = Math.min(minY, y1, y2);
        maxY = Math.max(maxY, y1, y2);
        allCmds.push({ c: 'C', x1, y1, x2, y2, x, y });
      }
    }
  }
  if (!Number.isFinite(minX)) {
    // Empty/whitespace-only text — degenerate but real zero-size box, not a crash.
    return { outline: [], geo: { ...el.geo, w: 0, h: 0 } };
  }
  const boxW = Math.max(maxX - minX, 1e-6);
  const boxH = Math.max(maxY - minY, 1e-6);
  const outline = allCmds.map((cmd): PathCmd => {
    if (cmd.c === 'Z') return cmd;
    if (cmd.c === 'M' || cmd.c === 'L') return { c: cmd.c, x: (cmd.x - minX) / boxW, y: (cmd.y - minY) / boxH };
    return {
      c: 'C',
      x1: (cmd.x1 - minX) / boxW,
      y1: (cmd.y1 - minY) / boxH,
      x2: (cmd.x2 - minX) / boxW,
      y2: (cmd.y2 - minY) / boxH,
      x: (cmd.x - minX) / boxW,
      y: (cmd.y - minY) / boxH,
    };
  });
  const boxX = el.geo.x * size.w + minX;
  const boxY = el.geo.y * size.h + minY;
  return {
    outline,
    geo: { x: boxX / size.w, y: boxY / size.h, w: boxW / size.w, h: boxH / size.h, rotation: el.geo.rotation },
  };
}
