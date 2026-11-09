import PolyBool from 'polybooljs';
import type { DocElement, ShapeElement } from '../state/elements';
import { centerOf, geoToPx, rotatePoint } from './geometry';
import { fitSmoothPath, hasExplicitHandles } from './pathSmoothing';

export type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude';

/** Roadmap #10 — flatten-then-clip, exactly the strategy قياسٌ خارجيٌّ موثَّق
 * §3.3 recommends over full-precision bezier booleans: every curved shape is sampled
 * into a polyline at a fixed tolerance, then handed to a 2D polygon-clipping engine.
 * We use `polybooljs` (a pure-JS port of the Martinez-Rueda sweep-line algorithm, zero
 * native/WASM deps) rather than Clipper2 itself — Clipper2's integer-coordinate
 * precision matters for dense CAD-style geometry, not for a handful of simple shapes
 * on a design canvas, and a pure-JS dependency is the safer fit for a Tauri webview.
 *
 * Flattening tolerance: an ellipse is sampled into a 96-gon. Worst-case sagitta error
 * (the gap between a chord and the true arc at its midpoint) for radius r is
 * `r * (1 - cos(pi/96))` ≈ `r * 0.00053` — under 0.6px for a 1080px-wide circle, and
 * still sub-pixel at a 4x video upscale. A smoothed pen path (roadmap #11) is
 * flattened by sampling each cubic bezier segment at 24 steps, the same order of
 * magnitude of error for typical pen-path segment lengths.
 */
const ELLIPSE_SEGMENTS = 96;
const BEZIER_SAMPLES_PER_SEGMENT = 24;

interface Pt {
  x: number;
  y: number;
}

type Region = Pt[];

function rectPolygonLocal(w: number, h: number): Pt[] {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

function ellipsePolygonLocal(w: number, h: number): Pt[] {
  return Array.from({ length: ELLIPSE_SEGMENTS }, (_, i) => {
    const a = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
    return { x: w / 2 + Math.cos(a) * (w / 2), y: h / 2 + Math.sin(a) * (h / 2) };
  });
}

function cubicAt(p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

function pathPolygonLocal(el: ShapeElement, w: number, h: number): Pt[] | null {
  if (!el.points || el.points.length < 3 || !el.closed) return null;
  const smooth = el.smoothAmount ?? 0;
  // Explicit handles (roadmap #17) curve the path even at smoothAmount 0, so the
  // straight-polygon shortcut below is only valid when there are none — otherwise a
  // hand-curved path would be clipped against the wrong (polyline) silhouette.
  const curved = smooth > 0 || hasExplicitHandles(el.handles);
  if (!curved) return el.points.map((p) => ({ x: p.x * w, y: p.y * h }));
  const segs = fitSmoothPath(el.points, true, smooth, el.cornerPoints, el.handles);
  const pts: Pt[] = [];
  for (const seg of segs) {
    for (let i = 0; i < BEZIER_SAMPLES_PER_SEGMENT; i++) {
      pts.push(cubicAt(seg.p0, seg.c1, seg.c2, seg.p1, i / BEZIER_SAMPLES_PER_SEGMENT));
    }
  }
  return pts.map((p) => ({ x: p.x * w, y: p.y * h }));
}

/** Whether `el` has a well-defined filled area a boolean op can consume: rect/ellipse
 * always qualify; a pen path only if it's explicitly closed with >= 3 points — an open
 * path has no interior to union/subtract/intersect (see docs/CONTROLS.md "العمليات
 * البوليانية"). */
export function isBooleanEligible(el: DocElement): el is DocElement & { type: 'shape' } {
  if (el.type !== 'shape') return false;
  if (el.shape === 'path') return !!(el.closed && el.points && el.points.length >= 3);
  return true;
}

function flattenToDocPolygon(el: DocElement & { type: 'shape' }, size: { w: number; h: number }): Region {
  const box = geoToPx(el.geo, size);
  const local = el.shape === 'rect' ? rectPolygonLocal(box.w, box.h) : el.shape === 'ellipse' ? ellipsePolygonLocal(box.w, box.h) : pathPolygonLocal(el, box.w, box.h);
  if (!local) return [];
  const center = centerOf(box);
  return local.map((p) => rotatePoint({ x: box.x + p.x, y: box.y + p.y }, center, box.rotation));
}

function regionToPoly(region: Region) {
  return { regions: [region.map((p) => [p.x, p.y])], inverted: false };
}

export interface BooleanResult {
  subpaths: Array<{ points: Array<{ x: number; y: number }>; closed: true }>;
  /** Bounding box of the result, in the same document-pixel space `size` describes. */
  geo: { x: number; y: number; w: number; h: number };
}

/** Runs `op` over `shapesBackToFront` (must already be ordered back-to-front exactly as
 * they sit in the document's element array). `subtract` cuts the union of every shape
 * above the bottom one *out of* the bottom one — front removes from back, the inverse
 * of the existing clip-mask convention ("top shape = mask that reveals", documented on
 * `applyClippingMask`) but the same "topmost shape is special" precedent. `union`,
 * `intersect`, and `exclude` (xor) fold left-to-right across all shapes and don't care
 * about order. Returns `null` when the result has no area (e.g. non-overlapping shapes
 * intersected) — callers must not create a zero-area element for that case. */
export function computeBooleanOp(op: BooleanOp, shapesBackToFront: Array<DocElement & { type: 'shape' }>, size: { w: number; h: number }): BooleanResult | null {
  const regions = shapesBackToFront.map((el) => flattenToDocPolygon(el, size)).filter((r) => r.length >= 3);
  if (regions.length < 2) return null;

  const polys = regions.map(regionToPoly);
  let result;
  if (op === 'subtract') {
    const [bottom, ...rest] = polys;
    let restUnion = rest[0];
    for (let i = 1; i < rest.length; i++) restUnion = PolyBool.union(restUnion, rest[i]);
    result = PolyBool.difference(bottom, restUnion);
  } else {
    const combine = op === 'union' ? PolyBool.union : op === 'intersect' ? PolyBool.intersect : PolyBool.xor;
    result = polys[0];
    for (let i = 1; i < polys.length; i++) result = combine(result, polys[i]);
  }
  if (!result.regions.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const region of result.regions) {
    for (const [x, y] of region) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const subpaths = result.regions
    .filter((r) => r.length >= 3)
    .map((r) => ({ points: r.map(([x, y]) => ({ x: (x - minX) / w, y: (y - minY) / h })), closed: true as const }));
  if (!subpaths.length) return null;
  return { subpaths, geo: { x: minX, y: minY, w, h } };
}
