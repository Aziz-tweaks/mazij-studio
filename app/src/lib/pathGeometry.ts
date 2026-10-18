import { fitSmoothPath, hasExplicitHandles, type AnchorHandles, type Pt } from './pathSmoothing';

export type PathCmd =
  | { c: 'M'; x: number; y: number }
  | { c: 'L'; x: number; y: number }
  | { c: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { c: 'Z' };

export interface PathShapeLike {
  points?: Array<{ x: number; y: number }>;
  closed?: boolean;
  /** Multi-region result of a boolean op (roadmap #10) — always straight-edged
   * (flattened geometry), always one closed subpath per region/hole. Takes priority
   * over `points`/smoothing when present. */
  subpaths?: Array<{ points: Array<{ x: number; y: number }>; closed: boolean }>;
  /** Roadmap #11 — 0 (default, straight segments) .. 1 (full curve) smoothing of
   * `points` via `fitSmoothPath`. Ignored when `subpaths` is set. */
  smoothAmount?: number;
  cornerPoints?: boolean[];
  /** Roadmap #11 (follow-up) — explicit per-anchor bezier handles (pen drag-out / node editing).
   * Ignored when `subpaths` is set, same as `smoothAmount`. */
  handles?: Array<AnchorHandles | null | undefined>;
  /** Roadmap #12 — real glyph outlines from "convert text to outlines" (see
   * `src/lib/arabicShaping.ts`): a flat, literal command list (fractions of the
   * element's own box, M/L/C/Z, possibly several M..Z subpaths concatenated — one per
   * glyph contour) emitted directly by the HarfBuzz shaping pipeline. Unlike
   * `subpaths`, this can and does contain real cubic-bezier curves, and takes
   * priority over every other field here. */
  outline?: PathCmd[];
}

function subpathCommands(
  points: Pt[],
  closed: boolean,
  smoothAmount = 0,
  cornerPoints?: boolean[],
  handles?: Array<AnchorHandles | null | undefined>,
): PathCmd[] {
  if (!points.length) return [];
  const cmds: PathCmd[] = [{ c: 'M', x: points[0].x, y: points[0].y }];
  // A single explicit handle is enough to need real curve commands even at
  // smoothAmount 0 — otherwise a handle the designer just pulled out with the pen
  // would render as a straight line until they also touched the smoothing slider.
  if ((smoothAmount > 0 || hasExplicitHandles(handles)) && points.length >= 2) {
    for (const seg of fitSmoothPath(points, closed, smoothAmount, cornerPoints, handles)) {
      cmds.push({ c: 'C', x1: seg.c1.x, y1: seg.c1.y, x2: seg.c2.x, y2: seg.c2.y, x: seg.p1.x, y: seg.p1.y });
    }
  } else {
    for (let i = 1; i < points.length; i++) cmds.push({ c: 'L', x: points[i].x, y: points[i].y });
  }
  if (closed) cmds.push({ c: 'Z' });
  return cmds;
}

/** Single source of truth for drawing a `shape:'path'` element, shared by the live DOM
 * preview (ElementView), the canvas/video rasterizer, and the SVG exporter — exactly
 * the pattern `resolveAnimAt`/`resolveUnitVisual` already use elsewhere in this
 * codebase so none of the three render paths can disagree about a path's geometry. */
export function pathElementCommands(el: PathShapeLike): { cmds: PathCmd[]; multiRegion: boolean; closedForFill: boolean } {
  if (el.outline?.length) {
    // Real TrueType/OpenType contour winding already encodes solid-vs-hole
    // correctly (outer and inner contours wind opposite ways) — multiRegion stays
    // false so every renderer uses the default nonzero fill rule, never `evenodd`
    // (which would wrongly punch holes through glyphs like "م" that are already
    // one correctly-wound compound contour).
    return { cmds: el.outline, multiRegion: false, closedForFill: true };
  }
  if (el.subpaths?.length) {
    const cmds = el.subpaths.flatMap((sp) => subpathCommands(sp.points, sp.closed));
    return { cmds, multiRegion: el.subpaths.length > 1, closedForFill: true };
  }
  if (!el.points?.length) return { cmds: [], multiRegion: false, closedForFill: false };
  return {
    cmds: subpathCommands(el.points, !!el.closed, el.smoothAmount ?? 0, el.cornerPoints, el.handles),
    multiRegion: false,
    closedForFill: !!el.closed,
  };
}

export function commandsToSvgPath(cmds: PathCmd[], sx: number, sy: number): string {
  return cmds
    .map((cmd) => {
      switch (cmd.c) {
        case 'M':
          return `M${cmd.x * sx} ${cmd.y * sy}`;
        case 'L':
          return `L${cmd.x * sx} ${cmd.y * sy}`;
        case 'C':
          return `C${cmd.x1 * sx} ${cmd.y1 * sy} ${cmd.x2 * sx} ${cmd.y2 * sy} ${cmd.x * sx} ${cmd.y * sy}`;
        case 'Z':
          return 'Z';
      }
    })
    .join(' ');
}

export function drawPathCommandsToCtx(ctx: CanvasRenderingContext2D, cmds: PathCmd[], sx: number, sy: number): void {
  ctx.beginPath();
  for (const cmd of cmds) {
    switch (cmd.c) {
      case 'M':
        ctx.moveTo(cmd.x * sx, cmd.y * sy);
        break;
      case 'L':
        ctx.lineTo(cmd.x * sx, cmd.y * sy);
        break;
      case 'C':
        ctx.bezierCurveTo(cmd.x1 * sx, cmd.y1 * sy, cmd.x2 * sx, cmd.y2 * sy, cmd.x * sx, cmd.y * sy);
        break;
      case 'Z':
        ctx.closePath();
        break;
    }
  }
}
