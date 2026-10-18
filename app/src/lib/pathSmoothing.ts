/** Roadmap #11 — bezier smoothing for pen-tool paths.
 *
 * The pen tool records a *sparse* list of clicked anchor points (see
 * `StudioContext.penAddPoint`), not a dense freehand sample stream — so the classic
 * Schneider `fit_cubic` algorithm (recursive least-squares bezier fitting against an
 * error tolerance, as used by potrace/paper.js for tracing freehand strokes) doesn't
 * apply as-is: with only a handful of already-minimal points, its error-driven
 * subdivision never triggers, and it degenerates to exactly Schneider's own tangent
 * estimation step (tangent at a point from its neighbors) feeding a single cubic per
 * segment. We implement that exact reduced form directly: a uniform Catmull-Rom
 * spline (the textbook tangent-from-neighbors construction, `tangent_i = (P_{i+1} -
 * P_{i-1}) / 2`) converted to the equivalent per-segment cubic bezier control points
 * (`C1 = P_i + tangent_i / 3`, `C2 = P_{i+1} - tangent_{i+1} / 3`) — the same formula
 * Schneider's algorithm converges to for an already-minimal point set. `smoothAmount`
 * (0..1) scales every tangent uniformly: 0 reproduces the original straight-segment
 * polyline bit-for-bit (so existing paths with no `smoothAmount` render unchanged), 1
 * is the full Catmull-Rom curve through every point exactly.
 *
 * That derived tangent is only the *default* handle. A designer who pulls a handle out
 * with the pen, or drags one in node-edit mode, writes an explicit handle for that one
 * side (`ShapeElement.handles`), and it overrides the derived one — see `fitSmoothPath`
 * for why `smoothAmount` deliberately does not scale explicit handles.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface CubicSeg {
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p1: Pt;
}

/** مقبضا نقطة ربط واحدة، كمتجهَي إزاحة من النقطة نفسها (لا إحداثيات مطلقة) —
 * انظر `ShapeElement.handles`. الإزاحة تجعل سحب النقطة لا يحتاج تحديث مقابضها. */
export interface AnchorHandles {
  in?: Pt | null;
  out?: Pt | null;
}

function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}
function add(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}
function scale(a: Pt, s: number): Pt {
  return { x: a.x * s, y: a.y * s };
}

/** Fits one cubic bezier per segment between consecutive points.
 * `cornerPoints[i] === true` zeroes the tangent at point `i`, collapsing both handles
 * touching it to the point itself — a hard corner at that anchor regardless of
 * `smoothAmount`, matching the pen tool's per-point smooth/corner toggle. Open paths
 * (`closed: false`) clamp the tangent at each end to its single available neighbor
 * (duplicate-endpoint boundary condition) instead of wrapping around.
 *
 * `handles[i].out`/`handles[i].in` (بند #11، تكملة) are the *explicit* handles a designer
 * pulled out with the pen or dragged in node-edit mode. An explicit side wins over the
 * Catmull-Rom tangent for that side only, and — unlike the derived tangent — is **not**
 * scaled by `smoothAmount`: the designer placed that handle at a literal position, so
 * the global smoothing slider must not silently shorten it (otherwise a hand-tuned
 * curve would collapse to a polyline the moment the slider is touched). A point flagged
 * a corner still wins over both, because "make this a corner" is the more specific,
 * later command — `toggleShapeCornerPoint` clears that anchor's handles so the two can
 * never disagree in practice; this branch only guards hand-authored documents. */
export function fitSmoothPath(
  points: Pt[],
  closed: boolean,
  smoothAmount: number,
  cornerPoints?: boolean[],
  handles?: Array<AnchorHandles | null | undefined>,
): CubicSeg[] {
  const n = points.length;
  if (n < 2) return [];

  const neighborBefore = (i: number): Pt => (closed ? points[((i - 1) % n + n) % n] : points[Math.max(0, i - 1)]);
  const neighborAfter = (i: number): Pt => (closed ? points[(i + 1) % n] : points[Math.min(n - 1, i + 1)]);
  const tangentAt = (i: number): Pt => {
    if (cornerPoints?.[i]) return { x: 0, y: 0 };
    return scale(sub(neighborAfter(i), neighborBefore(i)), 0.5);
  };

  const segCount = closed ? n : n - 1;
  const k = smoothAmount / 3;
  const outAt = (i: number): Pt => {
    const h = cornerPoints?.[i] ? null : handles?.[i]?.out;
    return h ? h : scale(tangentAt(i), k);
  };
  const inAt = (i: number): Pt => {
    const h = cornerPoints?.[i] ? null : handles?.[i]?.in;
    return h ? h : scale(tangentAt(i), -k);
  };
  const segs: CubicSeg[] = [];
  for (let i = 0; i < segCount; i++) {
    const i1 = (i + 1) % n;
    const p0 = points[i];
    const p1 = points[i1];
    segs.push({ p0, c1: add(p0, outAt(i)), c2: add(p1, inAt(i1)), p1 });
  }
  return segs;
}

/** هل يحمل المسار أي مقبض صريح فعلي؟ وجود `handles` كمصفوفة فارغة/أصفار لا يكفي —
 * يجب أن يكون هناك متجه غير صفري، وإلا فسنُحوِّل مسارًا مستقيمًا تمامًا إلى أوامر C
 * بلا داعٍ ونكسر شرط "0 = الخط المستقيم حرفيًا". */
export function hasExplicitHandles(handles?: Array<AnchorHandles | null | undefined>): boolean {
  return !!handles?.some((h) => {
    const i = h?.in;
    const o = h?.out;
    return (!!i && (i.x !== 0 || i.y !== 0)) || (!!o && (o.x !== 0 || o.y !== 0));
  });
}

/** يقسم مقطعًا واحدًا من المسار إلى مقطعين عند المعامل `t` بخوارزمية de Casteljau،
 * ثم يُثبِّت النتيجة كمقابض **صريحة** على النقاط الثلاث المتأثرة.
 *
 * التثبيت ضروري لا تجميلي: مماس Catmull-Rom لأي نقطة يُحسَب من جارتيها، فإدخال نقطة
 * جديدة في السلسلة يُغيِّر مماسَي طرفَي المقطع المقسوم ومعهما شكل المنحنى كله. de
 * Casteljau وحدها تضمن أن المقطعين الناتجين يساويان المقطع الأصلي بالضبط، والمقابض
 * الصريحة وحدها تضمن أن المُصيِّر لن يُعيد حساب تلك المماسات بعد الإدخال — فيبقى
 * المسار متصلًا وبنفس شكله تمامًا، وهذا ما يتوقّعه المصمم من "أضف نقطة".
 *
 * ويجب تثبيت **الجانبين الأربعة** لطرفَي المقطع، لا الجانبَين المُلامسَين للمقطع
 * المقسوم وحدهما: المماس المشتق عند طرفٍ ما يُحسَب من جارتَيه، وإحدى جارتَي كل طرف
 * صارت النقطة الجديدة — فالجانب البعيد (الذي يمسّ المقطع المجاور) يتغيّر أيضًا رغم
 * أن القسمة لم تلمسه. إغفاله يُحرِّك المنحنى بقدر مقيس: 1.55 وحدة من صندوق 100 وحدة
 * على مسار رباعي النقاط بتنعيم 70% — انحراف مرئي بوضوح.
 *
 * `segIndex` فهرس المقطع (مقطع `i` يصل النقطة `i` بالنقطة `(i+1) % n`)، فمقطع الإغلاق
 * في مسار مغلق هو `n-1` وينتهي عند النقطة 0. */
export function insertAnchorOnSegment(
  points: Pt[],
  closed: boolean,
  smoothAmount: number,
  cornerPoints: boolean[] | undefined,
  handles: Array<AnchorHandles | null | undefined> | undefined,
  segIndex: number,
  t: number,
): { points: Pt[]; cornerPoints: boolean[]; handles: Array<AnchorHandles | null> } | null {
  const n = points.length;
  const segCount = closed ? n : n - 1;
  if (segIndex < 0 || segIndex >= segCount || n < 2) return null;
  const segs = fitSmoothPath(points, closed, smoothAmount, cornerPoints, handles);
  const seg = segs[segIndex];
  if (!seg) return null;

  const lerp = (a: Pt, b: Pt, u: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  const a1 = lerp(seg.p0, seg.c1, t);
  const bc = lerp(seg.c1, seg.c2, t);
  const b2 = lerp(seg.c2, seg.p1, t);
  const a2 = lerp(a1, bc, t);
  const b1 = lerp(bc, b2, t);
  const mid = lerp(a2, b1, t);

  const i0 = segIndex;
  const i1 = (segIndex + 1) % n;

  // المقابض الفعّالة قبل الإدخال، مقروءة من المقاطع المُلائَمة نفسها — فهي تساوي
  // المقبض الصريح إن وُجد، وإلا مماس Catmull-Rom المشتق، بلا إعادة حساب موازية.
  const segEndingAt = (i: number): CubicSeg | undefined => {
    const si = closed ? ((i - 1) % n + n) % n : i - 1;
    return si >= 0 && si < segCount ? segs[si] : undefined;
  };
  const inEff = (i: number): Pt | undefined => {
    const s = segEndingAt(i);
    return s ? sub(s.c2, points[i]) : undefined;
  };
  const outEff = (i: number): Pt | undefined => {
    const s = i < segCount ? segs[i] : undefined;
    return s ? sub(s.c1, points[i]) : undefined;
  };
  const frozenIn0 = inEff(i0);
  const frozenOut1 = outEff(i1);

  const nextPoints = [...points];
  nextPoints.splice(i0 + 1, 0, mid);
  const nextCorners = [...(cornerPoints ?? [])];
  nextCorners.length = n; // normalize sparse/short arrays before splicing so indices stay aligned
  nextCorners.splice(i0 + 1, 0, false);
  const nextHandles: Array<AnchorHandles | null> = Array.from({ length: n }, (_, i) => handles?.[i] ?? null);
  nextHandles.splice(i0 + 1, 0, null);

  // Index of the segment's far endpoint *after* the splice: unchanged when it wrapped
  // round to point 0 (closing segment), otherwise pushed one slot right.
  const i1After = i1 === 0 ? 0 : i1 + 1;
  nextHandles[i0] = { ...(frozenIn0 ? { in: frozenIn0 } : {}), out: sub(a1, seg.p0) };
  nextHandles[i0 + 1] = { in: sub(a2, mid), out: sub(b1, mid) };
  nextHandles[i1After] = { in: sub(b2, seg.p1), ...(frozenOut1 ? { out: frozenOut1 } : {}) };
  return { points: nextPoints, cornerPoints: nextCorners.map((c) => !!c), handles: nextHandles };
}

/** أقرب معامل `t` على مقطع مكعّب للنقطة `p`، بمسح 64 عيّنة ثم تنقيح ثنائي حول أفضلها.
 * المسح الخشن أولًا لأن دالة المسافة على منحنى مكعّب قد تملك أكثر من نهاية صغرى
 * محلية، فالتنقيح وحده قد يستقر على الخطأ منها. */
export function closestTOnSegment(seg: CubicSeg, p: Pt): number {
  const at = (t: number): Pt => {
    const u = 1 - t;
    const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    return {
      x: seg.p0.x * w0 + seg.c1.x * w1 + seg.c2.x * w2 + seg.p1.x * w3,
      y: seg.p0.y * w0 + seg.c1.y * w1 + seg.c2.y * w2 + seg.p1.y * w3,
    };
  };
  const d2 = (t: number): number => {
    const q = at(t);
    return (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
  };
  let best = 0;
  let bestD = Infinity;
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const d = d2(t);
    if (d < bestD) { bestD = d; best = t; }
  }
  let lo = Math.max(0, best - 1 / N);
  let hi = Math.min(1, best + 1 / N);
  for (let i = 0; i < 24; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (d2(m1) < d2(m2)) hi = m2; else lo = m1;
  }
  return (lo + hi) / 2;
}
