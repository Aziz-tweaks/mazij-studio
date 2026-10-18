/** Shared layout math for "pan/zoom content within frame" image editing — used
 * identically by the live DOM view (ElementView), PNG export (canvas), and SVG
 * export, so the three renderers can never visually disagree with each other.
 *
 * Given the element's frame size and the image's intrinsic (natural) size, returns
 * where to draw the *full* natural-size image (translated + scaled) so that:
 *   - cover/contain/fill determine the base scale exactly like CSS object-fit,
 *   - cropScale (>=1) zooms in further on top of that base scale,
 *   - (cropX, cropY), a 0..1 point in the image's own natural space, lands at the
 *     exact center of the frame.
 * The caller is responsible for clipping the result to the frame's own box. */
export interface ImageCropLayout {
  tx: number;
  ty: number;
  dw: number;
  dh: number;
}

export function computeImageCropLayout(
  frame: { w: number; h: number },
  natural: { w: number; h: number },
  fit: 'cover' | 'contain' | 'fill',
  cropX: number,
  cropY: number,
  cropScale: number,
): ImageCropLayout {
  if (!natural.w || !natural.h) return { tx: 0, ty: 0, dw: frame.w, dh: frame.h };

  // Defensive against documents saved before these fields existed (or any other
  // partial/legacy data): undefined/NaN here would otherwise poison every downstream
  // multiplication with NaN, which canvas silently draws as "nothing" — invisible,
  // not crashed, so it's easy to miss without this guard.
  const cx = Number.isFinite(cropX) ? cropX : 0.5;
  const cy = Number.isFinite(cropY) ? cropY : 0.5;
  const cs = Number.isFinite(cropScale) && cropScale > 0 ? cropScale : 1;

  let scaleX: number;
  let scaleY: number;
  if (fit === 'fill') {
    scaleX = frame.w / natural.w;
    scaleY = frame.h / natural.h;
  } else {
    const base = fit === 'cover' ? Math.max(frame.w / natural.w, frame.h / natural.h) : Math.min(frame.w / natural.w, frame.h / natural.h);
    scaleX = base;
    scaleY = base;
  }
  const zoom = Math.max(1, cs);
  scaleX *= zoom;
  scaleY *= zoom;

  const dw = natural.w * scaleX;
  const dh = natural.h * scaleY;
  const tx = frame.w / 2 - cx * dw;
  const ty = frame.h / 2 - cy * dh;
  return { tx, ty, dw, dh };
}
