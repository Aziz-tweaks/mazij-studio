/** Easing curves for the timeline's per-element animation clips. Every named preset
 * (other than 'bounce' and 'hold') is itself just a cubic-bezier through two control
 * points, the same representation 'custom' uses — so picking a preset and then tweaking
 * its curve in the bezier editor is just switching `easing` to 'custom' and reusing
 * `bezier`.
 *
 * **`'hold'` — «تثبيت» — ليس منحنًى بل درجة.** القيمةُ تبقى على قيمة المفتاح حتى
 * المفتاحِ التالي ثم تقفز إليه في لحظته بالضبط. وُلد من مقطعٍ حقيقيٍّ طُلب نسخُه:
 * كلماتٌ تظهر **فجأةً** مع صوت الراوي، وصورٌ تتبدّل كلَّ ثلاثة إطارات، ومشاهدُ
 * تنقطع بلا مزج. وبدونه كان أقربُ ما يُصنَع منحدرًا خطّيًّا بين إطارين متجاورين —
 * وهو ما يفعله التقسيمُ نفسُه (`splitAt`) — فيبدو صحيحًا عند كلّ إطارٍ على الشبكة
 * ويكذب بين الإطارين: ضبابُ الحركة يأخذ عيّناتٍ **بين** الإطارين
 * (`shutterSampleTimes`)، فيُرسَم آخرُ إطارٍ قبل القطع نصفَ شفّاف. والدرجةُ لا
 * قيمةَ وسطى لها، فلا يراها الغالق. */
export type EasingId = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'back' | 'bounce' | 'hold' | 'custom' | 'expoOut';

export type Bezier = [number, number, number, number];

export const EASING_IDS: EasingId[] = ['linear', 'easeIn', 'easeOut', 'expoOut', 'easeInOut', 'back', 'bounce', 'hold', 'custom'];

export const DEFAULT_BEZIER: Bezier = [0.42, 0, 0.58, 1];

export const EASING_BEZIER: Record<Exclude<EasingId, 'bounce' | 'hold' | 'custom'>, Bezier> = {
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  // Fast start, long silky settle — the curve polished motion-design promos use.
  expoOut: [0.16, 1, 0.3, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  // Overshoots past 1 and settles — the standard CSS "easeOutBack" curve.
  back: [0.34, 1.56, 0.64, 1],
};

/** Cubic bezier anchored at (0,0) and (1,1) — both anchors are fixed to 0 and 1 so
 * only the two control points (p1, p2) ever need to be passed in. */
function cubicAt(p1: number, p2: number, u: number): number {
  const v = 1 - u;
  return 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u;
}

/** Solve the standard two-point cubic bezier for y at a given x, via binary search on
 * the parametric variable u — simple and numerically robust for the modest precision
 * a visual curve editor needs. */
export function bezierY([x1, y1, x2, y2]: Bezier, x: number): number {
  const target = Math.max(0, Math.min(1, x));
  let lo = 0;
  let hi = 1;
  let u = target;
  for (let i = 0; i < 24; i++) {
    u = (lo + hi) / 2;
    const cx = cubicAt(x1, x2, u);
    if (cx < target) lo = u;
    else hi = u;
  }
  return cubicAt(y1, y2, u);
}

function bounceOut(p: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  let x = p;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) {
    x -= 1.5 / d1;
    return n1 * x * x + 0.75;
  }
  if (x < 2.5 / d1) {
    x -= 2.25 / d1;
    return n1 * x * x + 0.9375;
  }
  x -= 2.625 / d1;
  return n1 * x * x + 0.984375;
}

/** Maps a linear 0..1 progress through the chosen easing curve. For 'custom' the
 * caller's own control points are used; every other id (except 'bounce', which has
 * no cubic-bezier equivalent) resolves to a fixed pair from EASING_BEZIER. */
export function applyEasing(easing: EasingId, bezier: Bezier, p: number): number {
  const clamped = Math.max(0, Math.min(1, p));
  if (easing === 'bounce') return bounceOut(clamped);
  // الدرجة: صفرٌ طوال المقطع، وواحدٌ عند نهايته بالضبط. و`trackValueAt` تُسلّم
  // لحظةَ المفتاح التالي بتقدّمٍ ١ تمامًا (المقطعُ الأوّلُ الذي يحويها)، فتظهر
  // قيمتُه **عند** لحظته لا بعدها بإطار.
  if (easing === 'hold') return clamped >= 1 ? 1 : 0;
  const b = easing === 'custom' ? bezier : EASING_BEZIER[easing];
  return bezierY(b, clamped);
}
