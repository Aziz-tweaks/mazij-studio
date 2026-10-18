// ─────────────────────────────────────────────────────────────────────────────
// دالّةُ إصابةٍ واحدة / One hit test
// ─────────────────────────────────────────────────────────────────────────────
//
// **هندسةٌ وقواعدُ محضة، بلا React وبلا حالة.** تقرأها المؤشّرةُ (`cursor`)
// ومعاينةُ التحويم وعاملُ الضغط **والمواصفة** — وهي قاعدةُ محرّر خطٍّ زمنيٍّ مفتوح المعماريّة
// حرفًا بحرف (`crates/ui-egui/src/panels/timeline_hit.rs:3-4`):
//
//   "Pure geometry and rules, shared by the cursor, the hover bracket, the press
//    handler and the control channel's `ui.timeline.hit`, so what the pointer
//    shows is what a press does."
//
// Adapted from محرّر خطٍّ زمنيٍّ مفتوح's `crates/ui-egui/src/panels/timeline_hit.rs`
// (`MIT OR Apache-2.0`; `Copyright (c) 2026 مشروعه الأمّ Team and the محرّر خطٍّ زمنيٍّ مفتوح
// contributors.`). **المأخوذ قاعدتان ومقاسٌ**: منطقةُ القبض `min(7px, w/3)` لكلّ
// جانبٍ وبلوغُها خارج المقطع (`:160-178`)، وترتيبُ فصلِ التعادل الثلاثيّ
// (`:148-157`). ولم يُنسَخ سطرُ كود: النوعُ والتوقيعُ والتطبيق كلُّها لنموذج مزيج
// (صفٌّ واحدٌ لعنصرٍ واحد، ولا `TrackItem`، ولا مساراتٌ تُعبَر).
//
// وأرقامُ البكسل تُؤخَذ **نقاطَ انطلاقٍ تُعاد قياسها في DOM مزيج** لا ثوابتَ
// تُثبَّت: §9.1 من ورقة محرّر خطٍّ زمنيٍّ مفتوح تقول صراحةً إنها لم تُبنَ ولم تُشغَّل، فالسبعةُ
// قيمةٌ بنقاط egui. والمنقولُ هو **النسبةُ والقاعدة** — ولذلك يَقيس المعيار B1
// فصلَ التعادل عند ١٠٠ بكسل/ثانية بوحدات الورقة نفسها، لا الرقمَ ٧ (§10.1).
//
// **والمخالفةُ الواحدة المقصودة عن محرّر خطٍّ زمنيٍّ مفتوح: المفاتيحُ تَسبق الحوافّ.** لا ماسات
// مفاتيحَ على المقطع هناك فلا تصادم؛ ومزيجٌ فيها، والتصادمُ **مكتوبٌ أصلًا**
// معالجةً جانبيّةً في `src/components/timeline/Clip.tsx` («it has no hit-area of
// its own once the resize handle takes priority over it»). فصلُ التعادل هذا
// يَحذف تلك المعالجة، وحذفُها هو المعيار B3.

/** ما تحت المؤشّر، مُسمًّى. و`emptyRow` ليست «لا شيء»: الضغطُ عليها يُحرّك
 * المؤشّرَ الزمنيّ، كما يفعل الضغطُ على المسطرة. */
export type HitKind = 'ruler' | 'clipBody' | 'clipEdge' | 'keyframe' | 'emptyRow';

/** الحافّةُ الأولى (`in`) والأخيرة (`out`). وليست «يسار/يمين»: محورُ الزمن لا
 * يُنعَكس في RTL (§4.4)، لكنّ تسميةَ الحافّة بالزمن لا بالجهة تُغني عن إعادة
 * الحوار كلّه إن انعكس يومًا. */
export type ClipEdge = 'in' | 'out';

export type TimelineCursor = 'ew-resize' | 'grab' | 'not-allowed';

/** **منطقةُ القبض لكلّ جانب**: `min(7px, width/3)`، وتبلغ ٧ بكسلات **خارج** المقطع
 * أيضًا — فحافّةٌ حرّة تُقبَض من الفراغ المجاور لها، ومقطعٌ أنحفُ من ٢١ بكسلًا
 * يبقى له ثلثٌ أوسط يُسحَب بجسمه (`timeline_hit.rs:160-178`). */
export const GRAB_PX = 7;

/** نصفُ قطرِ إصابةِ الماسة بالبكسل. الماسةُ مرسومةٌ ٩×٩ ومُدوَّرةٌ ٤٥°
 * (`Clip.tsx`)، فنصفُ عرضها المرئيّ ٤٫٥؛ والخمسةُ تَزيد نصفَ بكسلٍ فلا يبقى شِقٌّ
 * بين ما يُرى وما يُصاب. */
export const KEYFRAME_GRAB_PX = 5;

export interface HitPoint {
  /** بالبكسل، من يسار السطح الزمنيّ. */
  x: number;
  /** بالبكسل، من أعلى السطح الزمنيّ (أي من أعلى المسطرة). */
  y: number;
}

export interface HitLayout {
  /** عرضُ السطح الزمنيّ بالبكسل — مقيسًا لا مُقدَّرًا. */
  width: number;
  /** الثواني المفروشة على `width` (`timelineSpan`). */
  span: number;
  /** ارتفاعُ المسطرة. صفرٌ لمن يستدعيها على سطرٍ واحدٍ بإحداثيّاتٍ محليّة. */
  rulerHeight: number;
  grabPx?: number;
  keyframeGrabPx?: number;
}

/** مفتاحٌ كما يراه فاحصُ الإصابة: زمنُه **على الخطّ الزمنيّ** لا في زمن الحركة.
 * والتحويلُ مسؤوليّةُ المُنادي (`timelineTimeOf`)، فتبقى هذه الدالّة جاهلةً
 * بـ`sourceIn` تمامًا — وهو ما يجعلها هندسةً محضة. */
export interface HitKeyframe {
  id: string;
  property: string;
  timelineTime: number;
}

/** صفٌّ واحد: مقطعٌ واحدٌ لعنصرٍ واحد — نموذجُ مزيج، فلا مرشَّحين على صفٍّ واحد.
 * ومع ذلك تستقبل الدالّةُ **قائمةً**، لأنّ فصلَ التعادل الثلاثيّ بين مقطعَين
 * متجاورَين هو جوهرُ المعيار B1، ولأنّ صفوفَ الخصائص (x/y/scale/rotation) صفوفٌ
 * أخرى على السطح نفسه. */
export interface HitClipRow {
  elementId: string;
  /** الخاصّيةُ التي يَحمل هذا الصفُّ مساراتها — `'opacity'` للصفّ الرئيس. */
  property?: string;
  /** أعلى الصفّ بالبكسل، مقيسًا من أسفل المسطرة. */
  top: number;
  height: number;
  /** بالثواني، على الخطّ الزمنيّ. */
  start: number;
  duration: number;
  locked?: boolean;
  keyframes?: HitKeyframe[];
}

export interface Hit {
  kind: HitKind;
  elementId?: string;
  property?: string;
  edge?: ClipEdge;
  keyframeId?: string;
  /** ما تُظهره المؤشّرة. و`not-allowed` على عنصرٍ مقفول: **التحريرُ الممنوع يقول
   * ذلك قبل أن تحاوله**، لا بعد أن تفشل (`timeline.rs:2305-2321`). */
  cursor: TimelineCursor;
  /** مقفولٌ: الإصابةُ معروفةٌ والفعلُ ممنوع. يُفصَل عن `kind` كي تبقى معاينةُ
   * التحويم قادرةً على قول «هذه حافّة، ولا تُسحَب». */
  blocked: boolean;
}

interface EdgeCandidate {
  row: HitClipRow;
  edge: ClipEdge;
  /** المسافةُ بالبكسل إلى الحافّة. */
  d: number;
  /** أداخلَ المقطعِ موضعُ المؤشّر؟ */
  inside: boolean;
}

/**
 * **ترتيبُ فصلِ التعادل، موثَّقًا لأنّ الترتيبَ هو القاعدة**
 * (`timeline_hit.rs:148-157`):
 *
 * ٠. **المفاتيحُ تَسبق الحوافّ** متى كانت الاثنتان في المدى — وهذه مخالفتُنا
 *    الواحدة المقصودة، وسببُها في ترويسة الملفّ.
 * ١. **الداخلُ يَسبق الخارج**: حافّةٌ وموضعُ المؤشّر داخل مقطعها تَسبق حافّةً
 *    موضعُ المؤشّر خارج مقطعها، ولو تساوت المسافتان.
 * ٢. ثم **الأقربُ مسافةً**.
 * ٣. ثم — عند تعادلٍ تامّ — **حافّةُ الدخول للمقطع المتأخّر**. وهذا ما يجعل
 *    `x=300` بين مقطعٍ ينتهي عندها وآخرَ يبدأ عندها جوابًا واحدًا لا قرعةً.
 *
 * وبعد الحوافّ: جسمُ المقطع إن كان الموضعُ داخله، وإلا `emptyRow`.
 */
export function hitTest(point: HitPoint, layout: HitLayout, clips: readonly HitClipRow[]): Hit {
  if (point.y < layout.rulerHeight) {
    return { kind: 'ruler', cursor: 'ew-resize', blocked: false };
  }

  const grabPx = layout.grabPx ?? GRAB_PX;
  const kfGrabPx = layout.keyframeGrabPx ?? KEYFRAME_GRAB_PX;
  const pxPerSecond = layout.span > 0 ? layout.width / layout.span : 0;
  const y = point.y - layout.rulerHeight;

  // الصفُّ هو الامتدادُ الرأسيّ كلُّه، لا الشريطُ المرسوم داخله: صفٌّ واحدٌ يحمل
  // مقطعًا واحدًا، فليس فيه ما يُزاحمه رأسيًّا — ولو حُدَّت الإصابةُ بالشريط
  // المرسوم (١٦ بكسلًا من ٣٠) لصار نصفُ ارتفاع الصفّ ميتًا بلا سبب.
  const rows = clips.filter((c) => y >= c.top && y < c.top + c.height);
  if (!rows.length) return { kind: 'emptyRow', cursor: 'ew-resize', blocked: false };

  // (٠) المفاتيح أوّلًا.
  let bestKf: { row: HitClipRow; kf: HitKeyframe; d: number } | null = null;
  for (const row of rows) {
    for (const kf of row.keyframes ?? []) {
      const d = Math.abs(kf.timelineTime * pxPerSecond - point.x);
      if (d <= kfGrabPx && (!bestKf || d < bestKf.d)) bestKf = { row, kf, d };
    }
  }
  if (bestKf) {
    const locked = !!bestKf.row.locked;
    return {
      kind: 'keyframe',
      elementId: bestKf.row.elementId,
      property: bestKf.kf.property,
      keyframeId: bestKf.kf.id,
      cursor: locked ? 'not-allowed' : 'grab',
      blocked: locked,
    };
  }

  // (١–٣) الحوافّ.
  const candidates: EdgeCandidate[] = [];
  let bodyRow: HitClipRow | null = null;
  for (const row of rows) {
    const left = row.start * pxPerSecond;
    const right = (row.start + row.duration) * pxPerSecond;
    const widthPx = right - left;
    const grab = Math.min(grabPx, widthPx / 3);
    const inside = point.x >= left && point.x <= right;
    if (inside && (!bodyRow || row.start > bodyRow.start)) bodyRow = row;
    const dIn = Math.abs(point.x - left);
    const dOut = Math.abs(point.x - right);
    if (dIn <= grab) candidates.push({ row, edge: 'in', d: dIn, inside });
    if (dOut <= grab) candidates.push({ row, edge: 'out', d: dOut, inside });
  }

  if (candidates.length) {
    candidates.sort((a, b) => {
      if (a.inside !== b.inside) return a.inside ? -1 : 1;
      if (Math.abs(a.d - b.d) > 1e-9) return a.d - b.d;
      if (a.row.start !== b.row.start) return b.row.start - a.row.start;
      if (a.edge !== b.edge) return a.edge === 'in' ? -1 : 1;
      return 0;
    });
    const win = candidates[0];
    const locked = !!win.row.locked;
    return {
      kind: 'clipEdge',
      elementId: win.row.elementId,
      property: win.row.property,
      edge: win.edge,
      cursor: locked ? 'not-allowed' : 'ew-resize',
      blocked: locked,
    };
  }

  if (bodyRow) {
    const locked = !!bodyRow.locked;
    return {
      kind: 'clipBody',
      elementId: bodyRow.elementId,
      property: bodyRow.property,
      cursor: locked ? 'not-allowed' : 'grab',
      blocked: locked,
    };
  }

  return { kind: 'emptyRow', cursor: 'ew-resize', blocked: false };
}
