import type { StaggerDirection, StaggerEffect, StaggerUnit, TextStaggerAnim } from '../state/elements';
import { applyEasing } from './easing';

// TS's ES2020 lib (this project's `tsconfig.json` target) doesn't ship `Intl.Segmenter`
// typings; the runtime (every browser this app targets, and Node ≥16 for the QA specs)
// has supported it for years. A minimal ambient declaration here avoids widening the
// project's `lib` array (which would pull in unrelated ES2022 globals) just for this.
declare global {
  namespace Intl {
    interface SegmentData {
      segment: string;
      index: number;
      input: string;
      isWordLike?: boolean;
    }
    class Segmenter {
      constructor(locales?: string | string[], options?: { granularity?: 'grapheme' | 'word' | 'sentence' });
      segment(input: string): Iterable<SegmentData>;
    }
  }
}

export interface TextToken {
  text: string;
  /** Sequential index (0..N-1) in natural logical-string order among only the
   * "content" tokens — null for whitespace/separator tokens, which never animate
   * (always rendered fully shown) so stray/duplicated whitespace between the DOM's
   * raw string and any other consumer's own re-wrapping can never desync which
   * units actually animate or in what order. */
  orderIndex: number | null;
}

/** Splits `text` into an ordered token sequence for the 'char'/'word' stagger units,
 * via `Intl.Segmenter` — not `split('')`/`split(' ')` — so combining marks and
 * diacritics (Arabic tashkeel sits on its base letter as one grapheme cluster) and
 * multi-codepoint clusters are never torn apart, and word boundaries follow Unicode
 * text segmentation rather than a naive whitespace split. */
export function tokenizeText(text: string, unit: 'char' | 'word'): TextToken[] {
  const granularity = unit === 'char' ? 'grapheme' : 'word';
  const segmenter = new Intl.Segmenter(undefined, { granularity });
  const tokens: TextToken[] = [];
  let order = 0;
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    const isContent = unit === 'char' ? segment.trim().length > 0 : isWordLike === true;
    tokens.push({ text: segment, orderIndex: isContent ? order++ : null });
  }
  return tokens;
}

/** Splits on explicit newlines for the 'line' unit — the lines the user actually
 * authored (Shift+Enter), not the browser's own auto-wrap breakpoints. There is no
 * reliable way to learn those without a layout measurement pass shared between the
 * DOM preview and the canvas exporter, so 'line' stagger is scoped, deliberately and
 * documented in `docs/CONTROLS.md`, to authored line breaks: a single-line text
 * element has exactly one 'line' unit. */
export function tokenizeLines(text: string): TextToken[] {
  return text.split('\n').map((line, i) => ({ text: line, orderIndex: i }));
}

export function totalUnits(tokens: TextToken[]): number {
  let max = -1;
  for (const t of tokens) if (t.orderIndex !== null && t.orderIndex > max) max = t.orderIndex;
  return max + 1;
}

/** Deterministic seeded PRNG (mulberry32) — 'random' direction must reproduce
 * identically across the live preview, a re-render, and every exported video frame;
 * `Math.random()` would reshuffle on every call and make a video's characters
 * appear in a different order frame to frame. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return h;
}

/** Maps each unit's natural order index (0..N-1) onto its stagger *rank* (0..N-1 —
 * the multiplier applied to `stagger` seconds to get that unit's own start delay),
 * according to `direction`: 'start' plays in natural reading order, 'end' reverses
 * it so the last unit starts first, 'center' expands outward from the middle unit,
 * and 'random' uses a seeded shuffle keyed by `seedKey` (the element id) — same
 * document, same shuffle, every time. */
export function staggerRanks(n: number, direction: StaggerDirection, seedKey: string): number[] {
  const indices = Array.from({ length: n }, (_, i) => i);
  if (direction === 'start') return indices;
  if (direction === 'end') return indices.map((i) => n - 1 - i);
  if (direction === 'center') {
    const mid = (n - 1) / 2;
    const byDistance = [...indices].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
    const rankOf = new Array<number>(n);
    byDistance.forEach((idx, rank) => (rankOf[idx] = rank));
    return rankOf;
  }
  // random
  const rand = mulberry32(hashSeed(seedKey));
  const shuffled = [...indices];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const rankOf = new Array<number>(n);
  shuffled.forEach((idx, rank) => (rankOf[idx] = rank));
  return rankOf;
}

export interface StaggerToken {
  text: string;
  /** null = never animates (always fully shown) — whitespace/separator tokens. */
  rank: number | null;
}

/** Builds the ordered token list *and* assigns each content token's stagger rank in
 * one pass — the single function both the DOM preview (`ElementView`) and the canvas
 * frame renderer (`exportArtboard.ts`) call, so neither can disagree with the other
 * about which characters/words animate, or in what order. */
export function buildStaggerTokens(text: string, cfg: Pick<TextStaggerAnim, 'unit' | 'direction'>, seedKey: string): StaggerToken[] {
  const raw = cfg.unit === 'line' ? tokenizeLines(text) : tokenizeText(text, cfg.unit);
  const n = totalUnits(raw);
  if (n === 0) return raw.map((t) => ({ text: t.text, rank: null }));
  const ranks = staggerRanks(n, cfg.direction, seedKey);
  return raw.map((t) => ({ text: t.text, rank: t.orderIndex === null ? null : ranks[t.orderIndex] }));
}

export interface UnitVisual {
  opacity: number;
  /** Fraction of the unit's own font size — positive moves it down. */
  translateY: number;
  scale: number;
  rotateDeg: number;
}

/** The single effect formula shared by the DOM preview and the canvas frame
 * renderer, given a unit's already-eased 0..1 reveal progress. Composes with (never
 * replaces) the element-level `resolveAnimAt` opacity/transform — see
 * `docs/CONTROLS.md` for how the two animation layers combine. */
export function unitVisualAt(effect: StaggerEffect, progress: number): UnitVisual {
  const p = Math.max(0, Math.min(1, progress));
  switch (effect) {
    case 'slide':
      return { opacity: p, translateY: (1 - p) * 0.45, scale: 1, rotateDeg: 0 };
    case 'scale':
      return { opacity: p, translateY: 0, scale: 0.3 + 0.7 * p, rotateDeg: 0 };
    case 'rotate':
      return { opacity: p, translateY: 0, scale: 1, rotateDeg: (1 - p) * -40 };
    case 'fade':
    default:
      return { opacity: p, translateY: 0, scale: 1, rotateDeg: 0 };
  }
}

/** Resolves one unit's eased 0..1 reveal progress at an absolute timeline `time`,
 * given the element clip's own start (`clipStart` — the same `anim.start` the
 * element-level tracks use, so both animation layers share one clock) and this
 * unit's stagger `rank` (0..N-1, from `staggerRanks`). */
export function resolveUnitProgress(cfg: TextStaggerAnim, rank: number, clipStart: number, time: number): number {
  const unitStart = clipStart + rank * Math.max(0, cfg.stagger);
  const dur = Math.max(0.001, cfg.unitDuration);
  const raw = Math.max(0, Math.min(1, (time - unitStart) / dur));
  return applyEasing(cfg.easing, cfg.bezier, raw);
}

/** `resolveUnitProgress` + `unitVisualAt` in one call — what both renderers actually
 * invoke per animated unit. */
export function resolveUnitVisual(cfg: TextStaggerAnim, rank: number, clipStart: number, time: number): UnitVisual {
  return unitVisualAt(cfg.effect, resolveUnitProgress(cfg, rank, clipStart, time));
}

export const SHOWN_UNIT_VISUAL: UnitVisual = { opacity: 1, translateY: 0, scale: 1, rotateDeg: 0 };

/** `StaggerUnit`-aware CSS transform string for one token's `UnitVisual` — shared by
 * every DOM span the stagger layer renders. */
export function unitVisualToCssTransform(v: UnitVisual): string | undefined {
  const parts: string[] = [];
  if (v.translateY !== 0) parts.push(`translateY(${(v.translateY * 100).toFixed(2)}%)`);
  if (v.scale !== 1) parts.push(`scale(${v.scale.toFixed(3)})`);
  if (v.rotateDeg !== 0) parts.push(`rotate(${v.rotateDeg.toFixed(2)}deg)`);
  return parts.length ? parts.join(' ') : undefined;
}

export type { StaggerDirection, StaggerEffect, StaggerUnit, TextStaggerAnim };
