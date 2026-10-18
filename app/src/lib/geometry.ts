import type { Geometry } from '../state/elements';

export interface Point {
  x: number;
  y: number;
}

export interface PxBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

/** Converts an element's fractional geometry into artboard-pixel space for the given preset size. */
export function geoToPx(geo: Geometry, size: { w: number; h: number }): PxBox {
  return { x: geo.x * size.w, y: geo.y * size.h, w: geo.w * size.w, h: geo.h * size.h, rotation: geo.rotation };
}

export function pxToGeo(box: PxBox, size: { w: number; h: number }): Geometry {
  return { x: box.x / size.w, y: box.y / size.h, w: box.w / size.w, h: box.h / size.h, rotation: box.rotation };
}

export function centerOf(box: PxBox): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/** Rotates a point around a center by `deg` degrees (clockwise, matching CSS rotate()). */
export function rotatePoint(p: Point, center: Point, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/** Converts a screen-space point into a box's local (unrotated, origin-at-box) frame. */
export function screenToLocal(p: Point, box: PxBox): Point {
  const c = centerOf(box);
  const unrotated = rotatePoint(p, c, -box.rotation);
  return { x: unrotated.x - box.x, y: unrotated.y - box.y };
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export const RESIZE_HANDLES: ResizeHandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Fractional anchor (0..1 within the box) for each resize handle — the point that
 * must stay fixed while dragging that handle, i.e. the opposite corner/edge. */
export type ResizeHandleId = Exclude<HandleId, 'rotate'>;

export const HANDLE_ANCHOR: Record<ResizeHandleId, Point> = {
  nw: { x: 1, y: 1 },
  n: { x: 0.5, y: 1 },
  ne: { x: 0, y: 1 },
  e: { x: 0, y: 0.5 },
  se: { x: 0, y: 0 },
  s: { x: 0.5, y: 0 },
  sw: { x: 1, y: 0 },
  w: { x: 1, y: 0.5 },
};

export const HANDLE_POS: Record<ResizeHandleId, Point> = {
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
};

const MIN_SIZE = 8;

/** Computes a new box for a resize-handle drag. `localDelta` is the pointer delta
 * already expressed in the box's own unrotated axes (see screenToLocal). Resizing
 * happens around the fixed anchor corner, then the result is re-centered honoring
 * the current rotation so the anchor point truly stays put on screen. */
export function resizeBox(start: PxBox, handle: ResizeHandleId, localDelta: Point, opts: { proportional?: boolean } = {}): PxBox {
  const anchorFrac = HANDLE_ANCHOR[handle];
  const movesX = handle !== 'n' && handle !== 's';
  const movesY = handle !== 'e' && handle !== 'w';

  let newW = start.w + (movesX ? (anchorFrac.x === 1 ? -localDelta.x : localDelta.x) : 0);
  let newH = start.h + (movesY ? (anchorFrac.y === 1 ? -localDelta.y : localDelta.y) : 0);
  newW = Math.max(MIN_SIZE, newW);
  newH = Math.max(MIN_SIZE, newH);

  if (opts.proportional && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    if (movesX && movesY) {
      if (Math.abs(newW / start.w - 1) > Math.abs(newH / start.h - 1)) newH = newW / ratio;
      else newW = newH * ratio;
    } else if (movesX) newH = newW / ratio;
    else if (movesY) newW = newH * ratio;
    newW = Math.max(MIN_SIZE, newW);
    newH = Math.max(MIN_SIZE, newH);
  }

  // Anchor point in the *start* box's local unrotated frame, then in screen space.
  const anchorLocal = { x: anchorFrac.x * start.w, y: anchorFrac.y * start.h };
  const startCenter = centerOf(start);
  const anchorScreen = rotatePoint({ x: start.x + anchorLocal.x, y: start.y + anchorLocal.y }, startCenter, start.rotation);

  // Where the same anchor sits in the *new* box's local frame, measured from the new
  // box's own center (not its top-left) — this is the offset that, once rotated by the
  // box's rotation, tells us how far the new center is from the anchor in screen space.
  // (Earlier code rotated the anchor-to-top-left offset instead of anchor-to-center,
  // which silently dropped a `-newSize/2 + R(rotation)*(newSize/2)` term — invisible at
  // rotation 0 since R(0) is the identity, but a large, visible miss at any other angle.)
  const anchorFromNewCenter = { x: anchorFrac.x * newW - newW / 2, y: anchorFrac.y * newH - newH / 2 };
  const rotatedAnchorFromCenter = rotatePoint(anchorFromNewCenter, { x: 0, y: 0 }, start.rotation);
  const newCenter = { x: anchorScreen.x - rotatedAnchorFromCenter.x, y: anchorScreen.y - rotatedAnchorFromCenter.y };

  return { x: newCenter.x - newW / 2, y: newCenter.y - newH / 2, w: newW, h: newH, rotation: start.rotation };
}

/** Returns the outline of `maskBox` (as `maskShape`) sampled as polygon points expressed
 * in `targetBox`'s own local (unrotated) pixel frame — i.e. ready to use as a CSS
 * `clip-path: polygon(...)`, a canvas clip path, or SVG `<clipPath>` points for whatever
 * is drawn in `targetBox`'s already-rotated frame. Works for any relative position/rotation
 * between the two boxes since both are first placed in shared screen space. */
export function maskLocalPolygonPoints(targetBox: PxBox, maskBox: PxBox, maskShape: 'rect' | 'ellipse'): Point[] {
  const maskCenter = centerOf(maskBox);
  const localPts: Point[] =
    maskShape === 'ellipse'
      ? Array.from({ length: 48 }, (_, i) => {
          const a = (i / 48) * Math.PI * 2;
          return { x: maskBox.w / 2 + Math.cos(a) * (maskBox.w / 2), y: maskBox.h / 2 + Math.sin(a) * (maskBox.h / 2) };
        })
      : [
          { x: 0, y: 0 },
          { x: maskBox.w, y: 0 },
          { x: maskBox.w, y: maskBox.h },
          { x: 0, y: maskBox.h },
        ];
  const docPts = localPts.map((p) => rotatePoint({ x: maskBox.x + p.x, y: maskBox.y + p.y }, maskCenter, maskBox.rotation));
  return docPts.map((p) => screenToLocal(p, targetBox));
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Array<{ axis: 'x' | 'y'; pos: number }>;
}

/** Snaps a dragged box's edges/center to the artboard edges/center within `threshold` px. */
export function computeSnap(box: PxBox, artboard: { w: number; h: number }, threshold: number): SnapResult {
  const left = box.x;
  const right = box.x + box.w;
  const cx = box.x + box.w / 2;
  const top = box.y;
  const bottom = box.y + box.h;
  const cy = box.y + box.h / 2;

  const xTargets: Array<{ value: number; from: number }> = [
    { value: 0, from: left },
    { value: artboard.w / 2, from: cx },
    { value: artboard.w, from: right },
  ];
  const yTargets: Array<{ value: number; from: number }> = [
    { value: 0, from: top },
    { value: artboard.h / 2, from: cy },
    { value: artboard.h, from: bottom },
  ];

  let dx = 0;
  let bestX = Infinity;
  let guideX: number | null = null;
  for (const t of xTargets) {
    const diff = t.value - t.from;
    if (Math.abs(diff) < threshold && Math.abs(diff) < bestX) {
      bestX = Math.abs(diff);
      dx = diff;
      guideX = t.value;
    }
  }
  let dy = 0;
  let bestY = Infinity;
  let guideY: number | null = null;
  for (const t of yTargets) {
    const diff = t.value - t.from;
    if (Math.abs(diff) < threshold && Math.abs(diff) < bestY) {
      bestY = Math.abs(diff);
      dy = diff;
      guideY = t.value;
    }
  }

  const guides: SnapResult['guides'] = [];
  if (guideX !== null) guides.push({ axis: 'x', pos: guideX });
  if (guideY !== null) guides.push({ axis: 'y', pos: guideY });
  return { dx, dy, guides };
}

export function boundsOfBoxes(boxes: PxBox[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    const c = centerOf(b);
    const corners = [
      { x: -b.w / 2, y: -b.h / 2 },
      { x: b.w / 2, y: -b.h / 2 },
      { x: b.w / 2, y: b.h / 2 },
      { x: -b.w / 2, y: b.h / 2 },
    ].map((p) => rotatePoint({ x: c.x + p.x, y: c.y + p.y }, c, b.rotation));
    for (const p of corners) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
