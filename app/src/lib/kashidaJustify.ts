// Roadmap #18 — kashida (tatweel, "تطويل") justification: the correct Arabic way to
// stretch a line to a target width, by lengthening the connecting stroke *inside* a
// word's existing ligatures rather than opening gaps between words. This file is the
// one shared decision function every render path (live preview, canvas/PNG/video,
// SVG) calls through — see `justifyWithKashida` below — so the three paths can never
// disagree on *where* a kashida may land, only on *how they measure* a candidate
// line's width (each passes its own `measure` callback: a Canvas 2D `measureText` for
// the DOM/canvas paths, the real HarfBuzz-shaped advance width for the SVG path — see
// `arabicShaping.ts`).
//
// Where a kashida may land is derived from the same Unicode `Joining_Type` property
// (ArabicShaping.txt) HarfBuzz's own Arabic shaper consults internally — not a guess:
// a tatweel (U+0640) is itself `Join_Causing`, so inserting it between two characters
// only produces a real visual join (medial forms on both sides, the stretched
// connecting stroke this feature is about) when the character *before* the gap can
// extend a joining tail forward (`Dual_Joining`) and the character *after* the gap can
// accept a connection from its right (`Dual_Joining` or `Right_Joining`). Any other
// gap — next to whitespace, punctuation, Latin, a digit, or a `Right_Joining` letter's
// trailing edge (ا د ذ ر ز و ى and friends, which never grow an initial/medial tail) —
// is correctly never eligible, which is exactly the classical typographic rule: no
// kashida after a letter that's already in a closing/final-only form, and never across
// a word boundary. Verified empirically against this app's three built-in font families
// (Alexandria/Readex Pro/Vazirmatn all shape "بـت" as three distinct, correctly
// medial-joined glyphs with non-zero tatweel advance — see docs/CONTROLS.md stage 23).

import { isBuiltinFontFamily, loadBuiltinFontPair, shapeParagraph, type FontWeightNum } from './arabicShaping';
import type { TextElement } from '../state/elements';
import type { Weight } from '../state/types';

export const TATWEEL = 'ـ';

/** Unicode `Joining_Type` (ArabicShaping.txt), restricted to the two facts this
 * algorithm needs. Letters not listed (Latin, digits, punctuation, whitespace) are
 * treated as `Non_Joining` — never adjacent to an eligible gap. Covers standard Arabic
 * plus the Persian/Urdu extras Vazirmatn (this app's third built-in family) ships. */
const DUAL_JOINING = new Set(
  [
    0x0628, 0x062a, 0x062b, 0x062c, 0x062d, 0x062e, 0x0633, 0x0634, 0x0635, 0x0636, 0x0637, 0x0638, 0x0639, 0x063a, 0x0641, 0x0642, 0x0643, 0x0644, 0x0645, 0x0646, 0x0647, 0x064a, 0x0626,
    // Persian/Urdu extensions (Vazirmatn coverage).
    0x067e, 0x0686, 0x06af, 0x06a9, 0x06cc,
  ].values(),
);

const RIGHT_JOINING = new Set(
  [
    0x0622, 0x0623, 0x0624, 0x0625, 0x0627, 0x062f, 0x0630, 0x0631, 0x0632, 0x0648, 0x0649, 0x0629,
    // Persian extensions.
    0x0698, 0x0671,
  ].values(),
);

/** Combining marks (tashkeel and friends) — invisible to the joining chain: a gap
 * "after beh" must still be found correct when beh is actually followed by a fatha
 * then a lam, i.e. look *through* these, never land a kashida directly inside them. */
function isTransparent(cp: number): boolean {
  return (cp >= 0x0610 && cp <= 0x061a) || (cp >= 0x064b && cp <= 0x065f) || cp === 0x0670 || (cp >= 0x06d6 && cp <= 0x06ed);
}

type JoinType = 'D' | 'R' | 'T' | 'U';

function joinType(cp: number): JoinType {
  if (isTransparent(cp)) return 'T';
  if (DUAL_JOINING.has(cp)) return 'D';
  if (RIGHT_JOINING.has(cp)) return 'R';
  return 'U';
}

/** Returns every eligible kashida gap in `text`, as an index into `Array.from(text)`
 * (the gap sits between that index and the previous one). Word boundaries, punctuation
 * and non-Arabic runs are excluded automatically: a gap only exists where both its real
 * (tashkeel-skipped) neighbors are joining Arabic letters in the first place. */
export function kashidaEligibleGaps(text: string): number[] {
  const chars = Array.from(text);
  const jt = chars.map((c) => joinType(c.codePointAt(0) ?? 0));
  // Only real (non-transparent) characters count as joining-chain neighbors — a
  // combining mark's own position is never itself a gap endpoint (that would land a
  // kashida *between* a base letter and its own diacritic, detaching it from the
  // letter it's attached to). Walking consecutive pairs of real-character indices
  // also gives each true letter-to-letter boundary exactly one gap, never one per
  // transparent character skipped over it.
  const real: number[] = [];
  for (let i = 0; i < chars.length; i++) if (jt[i] !== 'T') real.push(i);
  const gaps: number[] = [];
  for (let k = 0; k < real.length - 1; k++) {
    const a = jt[real[k]];
    const b = jt[real[k + 1]];
    if (a === 'D' && (b === 'D' || b === 'R')) gaps.push(real[k + 1]);
  }
  return gaps;
}

function buildWithKashida(chars: string[], gaps: number[], counts: number[]): string {
  const extra = new Map<number, number>();
  for (let k = 0; k < gaps.length; k++) extra.set(gaps[k], counts[k]);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const n = extra.get(i);
    if (n) out += TATWEEL.repeat(n);
    out += chars[i];
  }
  return out;
}

export type KashidaMeasure = (text: string) => number | Promise<number>;

export interface KashidaResult {
  /** `text` with real U+0640 tatweel characters inserted at chosen gaps — identical to
   * the input when no stretch was needed or none was possible. */
  text: string;
  /** True only when a real kashida stretch was applied and reached the target width
   * within `marginPx`. False covers every "nothing to do" case (already wide enough,
   * no Arabic letters, direction doesn't call for it) *and* the documented limit case
   * (no eligible gap in the line at all — e.g. a single word, or a word made entirely
   * of `Right_Joining` letters) — callers that need to tell those apart should check
   * `kashidaEligibleGaps(text).length` themselves. */
  justified: boolean;
}

const MAX_ITER = 500;

/** The one shared resolution function: stretches `text` toward `targetWidthPx` by
 * inserting real tatweel characters at real joining-rule gaps, one at a time (greedy
 * round-robin across eligible gaps, so the extra length distributes evenly rather than
 * piling onto a single ligature), re-measuring via the caller-supplied `measure` after
 * each insertion and stopping as soon as the line is within `marginPx` of the target —
 * never overshooting by more than one tatweel glyph's own width. `measure` may be sync
 * (Canvas 2D `measureText`) or async (HarfBuzz shaping); both are awaited uniformly. */
export async function justifyWithKashida(text: string, targetWidthPx: number, measure: KashidaMeasure, marginPx = 1): Promise<KashidaResult> {
  if (!text) return { text, justified: false };
  const natural = await measure(text);
  if (natural >= targetWidthPx - marginPx) return { text, justified: false };
  const chars = Array.from(text);
  const gaps = kashidaEligibleGaps(text);
  if (!gaps.length) return { text, justified: false };
  const counts = new Array(gaps.length).fill(0);
  let width = natural;
  let iter = 0;
  while (width < targetWidthPx - marginPx && iter < MAX_ITER) {
    let pick = 0;
    for (let k = 1; k < counts.length; k++) if (counts[k] < counts[pick]) pick = k;
    counts[pick]++;
    width = await measure(buildWithKashida(chars, gaps, counts));
    iter++;
  }
  return { text: buildWithKashida(chars, gaps, counts), justified: width >= targetWidthPx - marginPx };
}

const WEIGHT_NUM: Record<Weight, FontWeightNum> = { regular: 400, medium: 600, bold: 800 };

/** The SVG export path's hook into `justifyWithKashida`: measures candidate widths
 * with the real HarfBuzz-shaped advance (`shapeParagraph` — the same pipeline "convert
 * text to outline" and curved text already use via `arabicShaping.ts`), so the chosen
 * kashida count matches the font's actual glyph metrics exactly, not an approximation.
 * Returns `el.text` unchanged for anything this can't resolve — a non-built-in font
 * (same documented limit `shapeTextOnCurve` has), `justify` off, or LTR text — so a
 * caller can always use the return value directly as the text to render. `fontPx` and
 * `boxWidthPx` are in the same artboard-pixel space `exportArtboard.ts` renders in. */
export async function justifySvgTextElement(el: TextElement, fontPx: number, boxWidthPx: number, dir: 'rtl' | 'ltr'): Promise<string> {
  if (!el.justify || dir !== 'rtl' || !el.text || !isBuiltinFontFamily(el.fontFamily)) return el.text;
  const fonts = await loadBuiltinFontPair(el.fontFamily, WEIGHT_NUM[el.weight]);
  const measure = async (s: string) => (await shapeParagraph(s, fonts, dir)).width * (fontPx / fonts.ar.upem);
  const { text } = await justifyWithKashida(el.text, boxWidthPx, measure);
  return text;
}
