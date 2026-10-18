import { centerOf, geoToPx, rotatePoint, screenToLocal, type PxBox } from './geometry';
import type { PathCmd, PathShapeLike } from './pathGeometry';
import { commandsToSvgPath, pathElementCommands } from './pathGeometry';
import { isBuiltinFontFamily, loadBuiltinFontPair, shapeParagraph, glyphOutlineCmds, type FontWeightNum } from './arabicShaping';
import type { DocElement, TextElement } from '../state/elements';
import type { Weight } from '../state/types';

type PathShapeElement = DocElement & { type: 'shape' };

/** Roadmap #12 — "نص على مسار": the deferred second deliverable documented in
 * `docs/CONTROLS.md` (مرحلة 17) as needing real arc-length flattening of the target
 * path, positioning each *shaped* glyph (never a raw character) along it, and a new
 * element-to-element link. This module is that — built on the already-shipped
 * HarfBuzz shaping pipeline (`arabicShaping.ts`): `shapeParagraph` gives the exact
 * same correctly-joined glyph IDs "convert text to outlines" uses, so a ligature
 * (lam-alef) bends along the curve as the one visual glyph it actually is, never torn
 * into two. One function (`shapeTextOnCurve`) returns a single `PathCmd[]` in the
 * text element's own local pixel frame — the *same* shape every other render path's
 * `pathElementCommands`/`commandsToSvgPath`/`drawPathCommandsToCtx` already consume,
 * so the DOM preview, canvas/video export, and SVG export can draw this one real
 * vector path with zero renderer-specific logic, exactly like a hand-drawn pen path. */

function mapFractionalPoint(fx: number, fy: number, shapeBox: PxBox, targetBox: PxBox): { x: number; y: number } {
  const local = { x: fx * shapeBox.w, y: fy * shapeBox.h };
  const center = centerOf(shapeBox);
  const screen = rotatePoint({ x: shapeBox.x + local.x, y: shapeBox.y + local.y }, center, shapeBox.rotation);
  return screenToLocal(screen, targetBox);
}

/** Maps a path shape's own fractional anchor/control points into `targetBox`'s local
 * pixel frame — the curve a text element bends along, expressed in that text
 * element's own coordinate space. Valid for Bezier `C` commands too since
 * translation/rotation/non-uniform scale are all affine (curve shape is preserved). */
export function pathCommandsInTargetFrame(shapeLike: PathShapeLike, shapeBox: PxBox, targetBox: PxBox): PathCmd[] {
  const { cmds } = pathElementCommands(shapeLike);
  return cmds.map((cmd): PathCmd => {
    switch (cmd.c) {
      case 'M': {
        const p = mapFractionalPoint(cmd.x, cmd.y, shapeBox, targetBox);
        return { c: 'M', x: p.x, y: p.y };
      }
      case 'L': {
        const p = mapFractionalPoint(cmd.x, cmd.y, shapeBox, targetBox);
        return { c: 'L', x: p.x, y: p.y };
      }
      case 'C': {
        const p1 = mapFractionalPoint(cmd.x1, cmd.y1, shapeBox, targetBox);
        const p2 = mapFractionalPoint(cmd.x2, cmd.y2, shapeBox, targetBox);
        const p = mapFractionalPoint(cmd.x, cmd.y, shapeBox, targetBox);
        return { c: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
      }
      case 'Z':
      default:
        return { c: 'Z' };
    }
  });
}

/** A detached (never document-inserted) `SVGPathElement`'s `getTotalLength`/
 * `getPointAtLength` depend only on its `d` attribute's own geometry, not layout —
 * reusing the browser's real curve-geometry engine here means the exact same
 * arc-length math a native `<textPath>` would use also drives this per-glyph
 * placement, rather than a second, hand-rolled Bezier-flattening implementation that
 * could quietly disagree. */
function makeDetachedPath(d: string): SVGPathElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('d', d);
  return el;
}

interface CurveSample {
  x: number;
  y: number;
  angleDeg: number;
}

function sampleCurveAt(path: SVGPathElement, totalLen: number, len: number): CurveSample {
  const clamped = Math.max(0, Math.min(totalLen, len));
  const p0 = path.getPointAtLength(clamped);
  const eps = Math.max(0.05, totalLen * 0.001);
  const ahead = Math.min(totalLen, clamped + eps);
  const behind = Math.max(0, clamped - eps);
  const pA = path.getPointAtLength(ahead);
  const pB = path.getPointAtLength(behind);
  const angleDeg = (Math.atan2(pA.y - pB.y, pA.x - pB.x) * 180) / Math.PI;
  return { x: p0.x, y: p0.y, angleDeg };
}

function rotatedScaled(x: number, y: number, scale: number, cosA: number, sinA: number): { x: number; y: number } {
  const sx = x * scale;
  const sy = y * scale;
  return { x: sx * cosA - sy * sinA, y: sx * sinA + sy * cosA };
}

const WEIGHT_NUM: Record<Weight, FontWeightNum> = { regular: 400, medium: 600, bold: 800 };

export class TextOnPathUnsupportedFontError extends Error {}

/** Shapes `el.text` (authored line breaks flattened to spaces — a curve has no
 * "lines", same convention `convertTextElementToOutline` uses for its own box
 * layout) and places each shaped glyph's own real outline along `pathShapeEl`'s
 * curve, anchored by `el.halign` (`start`/`center`/`end` along the curve's own
 * arc-length, honoring `dir` the same way the flat-text renderers already do).
 * Throws `TextOnPathUnsupportedFontError` for a non-built-in font — callers should
 * check `isBuiltinFontFamily(el.fontFamily)` first to decide whether to even offer
 * this (same precedent as "convert text to outlines"). Returns `[]` for empty text
 * or a path too short to sample (a degenerate but real empty result, not a crash). */
export async function shapeTextOnCurve(el: TextElement, pathShapeEl: PathShapeElement, size: { w: number; h: number }, dir: 'rtl' | 'ltr'): Promise<PathCmd[]> {
  if (!isBuiltinFontFamily(el.fontFamily)) throw new TextOnPathUnsupportedFontError(`الخط "${el.fontFamily}" ليس من خطوط مزيج المدمجة — نص-على-مسار غير متاح لخطوط مخصّصة بعد`);
  const flatText = el.text.replace(/\n+/g, ' ').trim();
  if (!flatText) return [];

  const fonts = await loadBuiltinFontPair(el.fontFamily, WEIGHT_NUM[el.weight]);
  const { glyphs } = await shapeParagraph(flatText, fonts, dir);
  if (!glyphs.length) return [];

  const elBox = geoToPx(el.geo, size);
  const shapeBox = geoToPx(pathShapeEl.geo, size);
  return buildCurveGlyphCmds(el, pathShapeEl, glyphs, elBox, shapeBox, size, dir);
}

/** Split out so the geometry/anchoring math (pure, synchronous) is independently
 * testable from the async shaping call above. */
function buildCurveGlyphCmds(
  el: TextElement,
  pathShapeEl: PathShapeElement,
  glyphs: Awaited<ReturnType<typeof shapeParagraph>>['glyphs'],
  elBox: PxBox,
  shapeBox: PxBox,
  size: { w: number; h: number },
  dir: 'rtl' | 'ltr',
): PathCmd[] {
  const curveCmds = pathCommandsInTargetFrame(pathShapeEl, shapeBox, elBox);
  const d = commandsToSvgPath(curveCmds, 1, 1);
  const curvePath = makeDetachedPath(d);
  const totalLen = curvePath.getTotalLength();
  if (!(totalLen > 0)) return [];

  const fontPx = (el.fontSize / 1080) * size.w;
  // Each glyph's own pen-origin (not its visual center) is what actually gets
  // sampled onto the curve below, so this total only has to be a reasonable estimate
  // of the run's own width for *anchoring* (start/center/end) — approximating the
  // final glyph's own advance as one more average glyph step is close enough for
  // that purpose without needing a second shaping pass just for the trailing advance.
  const pxPenX = glyphs.map((g) => g.x * (fontPx / g.font.upem));
  const avgAdvance = glyphs.length > 1 ? (pxPenX[pxPenX.length - 1] - pxPenX[0]) / (glyphs.length - 1) : fontPx * 0.5;
  const contentWidthPx = pxPenX[pxPenX.length - 1] - pxPenX[0] + avgAdvance;

  const startIsRight = dir === 'rtl';
  const startLen =
    el.halign === 'start'
      ? startIsRight
        ? totalLen - contentWidthPx
        : 0
      : el.halign === 'end'
        ? startIsRight
          ? 0
          : totalLen - contentWidthPx
        : (totalLen - contentWidthPx) / 2;

  const out: PathCmd[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    const scale = fontPx / g.font.upem;
    const len = startLen + (pxPenX[i] - pxPenX[0]);
    const sample = sampleCurveAt(curvePath, totalLen, len);
    const rad = (sample.angleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    for (const cmd of glyphOutlineCmds(g.font, g.gid)) {
      if (cmd.c === 'Z') {
        out.push(cmd);
      } else if (cmd.c === 'M' || cmd.c === 'L') {
        const p = rotatedScaled(cmd.x, cmd.y, scale, cosA, sinA);
        out.push({ c: cmd.c, x: sample.x + p.x, y: sample.y + p.y });
      } else {
        const p1 = rotatedScaled(cmd.x1, cmd.y1, scale, cosA, sinA);
        const p2 = rotatedScaled(cmd.x2, cmd.y2, scale, cosA, sinA);
        const p = rotatedScaled(cmd.x, cmd.y, scale, cosA, sinA);
        out.push({ c: 'C', x1: sample.x + p1.x, y1: sample.y + p1.y, x2: sample.x + p2.x, y2: sample.y + p2.y, x: sample.x + p.x, y: sample.y + p.y });
      }
    }
  }
  return out;
}
