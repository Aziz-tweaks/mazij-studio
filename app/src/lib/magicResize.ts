import type { DocElement, Geometry } from '../state/elements';

/** Roadmap #8 — "Magic Resize هجين": heuristics layered on top of the plain
 * proportional model every element already uses (`geo.x/y/w/h` as fractions of the
 * artboard, re-applied as-is against whatever target width/height — see
 * `createDefaultElements`'s `Geometry` doc comment and `exportArtboard.ts`). Plain
 * fractions alone *anisotropically* stretch every box (x/w scale with the target's
 * width, y/h with its height, independently), which is fine for free-form shapes and
 * text boxes but visibly warps anything meant to stay square/circular or to hold a
 * photo without a skewed frame, and can shrink/grow text past legibility on an
 * extreme aspect change. `magicResizeElements` is a pure, deterministic function —
 * same input always produces the same output — reused by both the live "apply size"
 * action (`StudioContext.applyMagicResize`) and the batch-export loop
 * (`exportMagicResize` toggle), so the two paths can never disagree. See
 * docs/CONTROLS.md "المرحلة 10" for the full rationale behind each constant below. */

export interface ResizeSize {
  w: number;
  h: number;
}

/** A margin (fraction of the corresponding dimension) at or below this is "flush
 * with the edge" — the element is read as deliberately anchored there rather than
 * floating free, so aspect-correction leftover space is given to the opposite edge
 * instead of being split evenly. */
const ANCHOR_THRESHOLD = 0.08;

/** A shape's *source-frame* pixel aspect ratio within this distance of 1:1 is read as
 * "meant to be a square/circle" (an icon, badge, or logo mark) — e.g. 0.18×0.18 of a
 * 1080×1080 artboard. A deliberately non-square rectangle (a wide divider bar) falls
 * outside this band and keeps stretching freely, same as before. */
const SQUARE_TOLERANCE = 0.2;

/** Text's rendered size never drifts below 70% or above 150% of how large it looked
 * in the source document, however extreme the new aspect ratio is — the floor keeps
 * Arabic glyphs (which lose shape/diacritic legibility fastest) readable, the
 * ceiling keeps a headline from ballooning past its box on a much-wider target. */
const FONT_MIN_SCALE = 0.7;
const FONT_MAX_SCALE = 1.5;

type EdgeAnchor = 'start' | 'end' | 'none';

interface Anchors {
  h: EdgeAnchor;
  v: EdgeAnchor;
}

/** Edge-attachment inference: reads which edge(s) an element already sits flush
 * against in the *source* frame, so later steps know where to pin it rather than
 * always centering. */
function edgeAnchorsOf(geo: Geometry): Anchors {
  const leftMargin = geo.x;
  const rightMargin = 1 - (geo.x + geo.w);
  const topMargin = geo.y;
  const bottomMargin = 1 - (geo.y + geo.h);
  const h: EdgeAnchor = leftMargin <= ANCHOR_THRESHOLD && leftMargin <= rightMargin ? 'start' : rightMargin <= ANCHOR_THRESHOLD ? 'end' : 'none';
  const v: EdgeAnchor = topMargin <= ANCHOR_THRESHOLD && topMargin <= bottomMargin ? 'start' : bottomMargin <= ANCHOR_THRESHOLD ? 'end' : 'none';
  return { h, v };
}

/** Clamps a resized box back fully inside the 0..1 frame — the safe-area/overflow
 * correction pass every element goes through last, regardless of which rule produced
 * its geometry. */
function clampGeoToFrame(geo: Geometry): Geometry {
  const w = Math.min(Math.max(geo.w, 0), 1);
  const h = Math.min(Math.max(geo.h, 0), 1);
  const x = Math.min(Math.max(geo.x, 0), 1 - w);
  const y = Math.min(Math.max(geo.y, 0), 1 - h);
  return { ...geo, x, y, w, h };
}

/** Contain-fits a box of `desiredRatio` inside the plain proportional target box
 * (the one plain fraction scaling alone would have produced), then places it inside
 * that box according to `anchors` instead of always centering — the "anchored
 * contain-fit" that keeps aspect-locked elements (images, square/circular shapes)
 * undistorted while still tracking the edge they were designed against. */
function fitAspectLockedGeo(geo: Geometry, to: ResizeSize, desiredRatio: number, anchors: Anchors): Geometry {
  const boxX = geo.x * to.w;
  const boxY = geo.y * to.h;
  const boxW = geo.w * to.w;
  const boxH = geo.h * to.h;
  const boxRatio = boxH > 0 ? boxW / boxH : desiredRatio;

  let newW: number;
  let newH: number;
  if (desiredRatio > boxRatio) {
    newW = boxW;
    newH = desiredRatio > 0 ? boxW / desiredRatio : boxH;
  } else {
    newH = boxH;
    newW = boxH * desiredRatio;
  }

  const extraW = boxW - newW;
  const extraH = boxH - newH;
  const newX = boxX + (anchors.h === 'start' ? 0 : anchors.h === 'end' ? extraW : extraW / 2);
  const newY = boxY + (anchors.v === 'start' ? 0 : anchors.v === 'end' ? extraH : extraH / 2);

  return { ...geo, x: newX / to.w, y: newY / to.h, w: newW / to.w, h: newH / to.h };
}

/** Re-fit (not blind-scale): the wrap width already follows the new frame on its own
 * at render time (`bw = el.geo.w * w` in `exportArtboard.ts` / the `cqw`-based CSS
 * width in `ElementView.tsx` both re-measure/re-wrap against whatever box width is
 * current). What plain fraction scaling does *not* bound is the font's own size —
 * `fontSize` is a reference against a 1080-wide artboard, rendered as
 * `(fontSize/1080)*canvasWidth`, so a big width swing shrinks/grows it by the same
 * factor with no floor or ceiling. This clamps the *effective rendered pixel size*
 * (not `fontSize` directly) to within `FONT_MIN_SCALE..FONT_MAX_SCALE` of how large
 * the text looked in the source document, then solves back for the `fontSize` value
 * that reproduces that pixel size at the target width. */
function resizeFontSize(fontSize: number, fromW: number, toW: number): number {
  if (!(fromW > 0) || !(toW > 0)) return fontSize;
  const sourcePx = (fontSize / 1080) * fromW;
  const naivePx = (fontSize / 1080) * toW; // what plain proportional scaling alone gives
  const clampedPx = Math.min(Math.max(naivePx, sourcePx * FONT_MIN_SCALE), sourcePx * FONT_MAX_SCALE);
  return (clampedPx / toW) * 1080;
}

/** True when an element's *source-frame* geometry reads as a deliberately
 * square/circular mark rather than an incidentally-square box — only shapes within
 * `SQUARE_TOLERANCE` of 1:1 qualify, so a wide rectangle bar keeps stretching freely
 * like before. Freeform pen paths are never aspect-locked (no reliable "intended
 * ratio" to infer for an arbitrary silhouette). Images are always aspect-locked:
 * their frame — not the raw photo's `naturalW/naturalH` — carries the designer's
 * intended crop (that's what `fit: 'cover'/'contain'` already render against), so
 * fitting the *frame's own source ratio* is what keeps a photo from looking stretched
 * without second-guessing a deliberate non-square crop. */
function aspectLockRatio(el: DocElement, from: ResizeSize): number | null {
  const srcPxW = el.geo.w * from.w;
  const srcPxH = el.geo.h * from.h;
  if (!(srcPxH > 0)) return null;
  if (el.type === 'image') return srcPxW / srcPxH;
  if (el.type === 'shape' && (el.shape === 'rect' || el.shape === 'ellipse')) {
    const ratio = srcPxW / srcPxH;
    return Math.abs(ratio - 1) < SQUARE_TOLERANCE ? ratio : null;
  }
  return null;
}

/** The hybrid Magic Resize entry point: recomputes every element's geometry (and, for
 * text, its font size) for a `to` frame given the document's current `from` frame.
 * Pure and deterministic — never reads or writes app state — so the live "apply
 * size" action and the batch-export loop can both call it and always agree. Elements
 * with no applicable heuristic (text boxes, free shapes, pen paths) pass through the
 * same plain-fraction geometry the system always used, then still go through the
 * final safe-area clamp. */
export function magicResizeElements(elements: DocElement[], from: ResizeSize, to: ResizeSize): DocElement[] {
  return elements.map((el) => {
    if (el.type === 'text') {
      return { ...el, fontSize: resizeFontSize(el.fontSize, from.w, to.w), geo: clampGeoToFrame(el.geo) };
    }
    const desiredRatio = aspectLockRatio(el, from);
    if (desiredRatio === null) {
      return { ...el, geo: clampGeoToFrame(el.geo) };
    }
    const anchors = edgeAnchorsOf(el.geo);
    const geo = clampGeoToFrame(fitAspectLockedGeo(el.geo, to, desiredRatio, anchors));
    return { ...el, geo };
  });
}
