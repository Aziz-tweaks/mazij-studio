import type { CSSProperties } from 'react';
import type { AnimProperty, ElementAnim, PropertyKeyframe, PropertyTracks } from '../state/elements';
import { ANIM_PROPERTY_DEFAULT } from '../state/elements';
import { applyEasing } from './easing';

/** Single source of truth for the timeline's length — shared by the playback clock
 * (StudioContext), the ruler/clip layout (Timeline), and the entrance math (Stage). */
export const TIMELINE_DURATION = 5;

/** Clips and keyframe drags clamp to this so a clip can never collapse to zero width
 * or a keyframe can't land exactly on top of its neighbor. */
export const MIN_CLIP_DURATION = 0.1;

/** The resolved value of every independent property track at a given instant — the
 * single source of truth both the DOM preview (`entranceStyleAt`, below) and the
 * canvas frame renderer (`exportArtboard.ts`, for video/GIF export) read from, so a
 * video frame's animation state can never drift from what the live timeline shows at
 * the same instant. `x`/`y` are fractions of the artboard's width (mirroring the
 * `cqw` unit `entranceStyleAt` emits directly, which resolves against the artboard
 * container's inline size — see Stage.tsx's `containerType: 'inline-size'` on the
 * artboard element, the nearest container for every element's `cqw`) — both are
 * *offsets* added on top of the element's own static `geo` position, and `rotation`
 * is likewise a delta added on top of `geo.rotation`, not a replacement for it. A
 * property with no keyframes at all (or a `tracks` that's empty, e.g. preset 'none',
 * or every keyframe deleted from a once-animated property) resolves to its identity
 * default — see `ANIM_PROPERTY_DEFAULT` — never a resurrected preset formula. */
export interface AnimVisual {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

function sortedTrack(track: PropertyKeyframe[]): PropertyKeyframe[] {
  return [...track].sort((a, b) => a.t - b.t);
}

/** Resolves one property's independent track at a local (0..1, already clamped)
 * clip-time: locates which pair of keyframes it falls between and eases across that
 * segment using *that keyframe's own* easing/bezier — each property track, and each
 * segment within it, interpolates fully independently of every other. */
function trackValueAt(track: PropertyKeyframe[] | undefined, localT: number, fallback: number): number {
  if (!track || !track.length) return fallback;
  const kfs = sortedTrack(track);
  if (kfs.length === 1) return kfs[0].value;
  if (localT <= kfs[0].t) return kfs[0].value;
  if (localT >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1].value;

  let prev = kfs[0];
  let next = kfs[kfs.length - 1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (localT >= kfs[i].t && localT <= kfs[i + 1].t) {
      prev = kfs[i];
      next = kfs[i + 1];
      break;
    }
  }
  const span = next.t - prev.t;
  const segProgress = span <= 0 ? 1 : (localT - prev.t) / span;
  const eased = applyEasing(prev.easing, prev.bezier, segProgress);
  return prev.value + (next.value - prev.value) * eased;
}

/** Local (0..1) time within the clip at an absolute timeline time — shared by every
 * property track so they all resolve against the exact same instant. A zero-duration
 * clip resolves to its last keyframe once playback reaches `start`, first before it. */
function localClipTime(anim: ElementAnim, time: number): number {
  const { start, duration } = anim;
  if (duration <= 0) return time >= start ? 1 : 0;
  return Math.max(0, Math.min(1, (time - start) / duration));
}

/** Resolves every independent property track at an absolute timeline time. This is
 * the one place video/GIF export, the canvas preview, and the DOM preview all read
 * from — see `AnimVisual` above. */
export function resolveAnimAt(anim: ElementAnim, time: number): AnimVisual {
  const localT = localClipTime(anim, time);
  return {
    opacity: trackValueAt(anim.tracks.opacity, localT, ANIM_PROPERTY_DEFAULT.opacity),
    x: trackValueAt(anim.tracks.x, localT, ANIM_PROPERTY_DEFAULT.x),
    y: trackValueAt(anim.tracks.y, localT, ANIM_PROPERTY_DEFAULT.y),
    scale: trackValueAt(anim.tracks.scale, localT, ANIM_PROPERTY_DEFAULT.scale),
    rotation: trackValueAt(anim.tracks.rotation, localT, ANIM_PROPERTY_DEFAULT.rotation),
  };
}

/** Resolves a single property's value at an absolute timeline time — used by the
 * properties panel to show whether the current value at the playhead is keyframed. */
export function resolvePropertyAt(anim: ElementAnim, property: AnimProperty, time: number): number {
  const localT = localClipTime(anim, time);
  return trackValueAt(anim.tracks[property], localT, ANIM_PROPERTY_DEFAULT[property]);
}

/** One frame of tolerance at a clip's boundaries, so clicking exactly *on* an edge
 * counts as on it — the playhead's own screen position is only pixel-accurate, and at
 * the measured 5s-across-the-panel zoom one pixel is already ~4ms. */
const CLIP_EDGE_EPS = 1 / 60;

/** Whether "add a keyframe at the playhead" can honour its own label for this clip.
 *
 * A keyframe's `t` is a fraction **of the clip**, so a playhead past the clip's end
 * has no fraction — the clip is stretched to reach it instead (see
 * `stretchClipToTime`). A playhead *before* the clip's start is the one case that
 * can't be served: covering it would have to move `start`, i.e. silently change when
 * the animation begins, which is not what the user asked for. That case gets a
 * disabled button with a written reason rather than a keyframe in the wrong place.
 *
 * Both this predicate and the action read the same function, so a disabled button and
 * a refused write can never disagree about where the playhead is. */
export function canKeyframeAtPlayhead(anim: ElementAnim, time: number): boolean {
  if (anim.duration <= 0) return false;
  return time >= anim.start - CLIP_EDGE_EPS && time <= TIMELINE_DURATION + CLIP_EDGE_EPS;
}

/** Grows a clip so `time` falls inside it, **without moving any existing keyframe in
 * absolute time**. Keyframe `t` is a fraction of the clip, so lengthening the clip
 * alone would stretch every existing keyframe later — the entrance a designer had
 * already timed would quietly slow down just because they asked for a keyframe
 * further right. Each `t` is therefore rescaled by `oldDuration / newDuration`, which
 * keeps `start + t × duration` identical for every keyframe, so `resolveAnimAt`
 * returns the same value at every instant as it did before the stretch.
 *
 * A no-op when `time` is already inside the clip. */
export function stretchClipToTime(anim: ElementAnim, time: number): ElementAnim {
  const end = anim.start + anim.duration;
  if (anim.duration <= 0 || time <= end + CLIP_EDGE_EPS) return anim;
  const newDuration = Math.min(TIMELINE_DURATION - anim.start, time - anim.start);
  if (newDuration <= anim.duration) return anim;
  const factor = anim.duration / newDuration;
  const tracks: PropertyTracks = {};
  for (const prop of Object.keys(anim.tracks) as AnimProperty[]) {
    const track = anim.tracks[prop];
    if (track) tracks[prop] = track.map((k) => ({ ...k, t: k.t * factor }));
  }
  return { ...anim, duration: newDuration, tracks, keyframes: anim.keyframes.map((k) => ({ ...k, t: k.t * factor })) };
}

/** The real keyframe sitting at (within a small epsilon of) the given time on one
 * property's track, if any — what the properties panel's per-property keyframe
 * toggle uses both to show a filled vs. outline state and to know which keyframe to
 * remove on a second click. */
export function keyframeAt(anim: ElementAnim, property: AnimProperty, time: number, eps = 0.02): PropertyKeyframe | undefined {
  // Must use the **unclamped** local time. `localClipTime` saturates at 0 and 1, so
  // asking it about any instant past the clip's end answers "1" — and every such
  // instant therefore reported the clip's *last* keyframe as "the keyframe at the
  // playhead". Measured consequence on a text layer with a 0→0.6s fade entrance and
  // the playhead at 3.000s: the per-property ◇ toggle rendered filled/accent (its
  // "there is a keyframe here" state) while its own tooltip still read «إضافة مفتاح
  // عند المؤشر», and pressing it **deleted the keyframe at 0.6s** — silently
  // destroying the entrance and leaving the element stuck at opacity 0. Reproduced
  // twice before changing this line.
  if (anim.duration <= 0) return undefined;
  const raw = (time - anim.start) / anim.duration;
  if (raw < -eps || raw > 1 + eps) return undefined;
  return anim.tracks[property]?.find((k) => Math.abs(k.t - raw) < eps);
}

export function isKeyframedAt(anim: ElementAnim, property: AnimProperty, time: number, eps = 0.02): boolean {
  return !!keyframeAt(anim, property, time, eps);
}

/** `AnimVisual` turned into a CSS transform/opacity pair for the DOM preview —
 * `ElementView` composes this with the element's own static `geo` rotation and base
 * `opacity`. */
export function entranceStyleAt(anim: ElementAnim, time: number): { opacity?: number; transform?: string } {
  const v = resolveAnimAt(anim, time);
  const transformParts: string[] = [];
  if (v.x !== 0 || v.y !== 0) transformParts.push(`translate(${(v.x * 100).toFixed(2)}cqw, ${(v.y * 100).toFixed(2)}cqw)`);
  if (v.scale !== 1) transformParts.push(`scale(${v.scale.toFixed(3)})`);
  if (v.rotation !== 0) transformParts.push(`rotate(${v.rotation.toFixed(2)}deg)`);
  return { opacity: v.opacity, transform: transformParts.join(' ') || undefined };
}

/** Same resolution as `entranceStyleAt`, but as raw numbers for the canvas frame
 * renderer — see `AnimVisual` above for why this must stay the one shared formula
 * rather than a parallel reimplementation. */
export function entranceVisualAt(anim: ElementAnim, time: number): AnimVisual {
  return resolveAnimAt(anim, time);
}

export function entranceStyleToCss(style: { opacity?: number; transform?: string }): CSSProperties {
  return { opacity: style.opacity, transform: style.transform };
}
