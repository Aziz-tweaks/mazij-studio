import { useRef } from 'react';
import type { AnimProperty, DocElement } from '../../state/elements';
import { ANIM_PROPERTIES, animPropertiesFor } from '../../state/elements';
import { animTimeAt, documentDuration, formatKfDisplay, kfValueToDisplay, setKeyframe, snapToFrame, timelineSpan, timelineTimeOf } from '../../lib/animTimeline';
import { useAudioPeaks, waveformPath } from '../../lib/audioPeaks';
import { hitTest, type ClipEdge, type Hit, type HitClipRow } from '../../lib/timelineHit';
import { moveClip, trim } from '../../lib/timelineEdit';
import { useStudio } from '../../state/StudioContext';
import { elementDisplayName } from '../../lib/layerNames';

export interface SelectedKf {
  elId: string;
  property: AnimProperty;
  kfId: string;
}

/** The main clip row always shows the opacity track (every preset touches opacity,
 * and it's the one property every element can usefully fade with) — expanding the
 * clip reveals the other four as independent rows underneath. */
export const EXPANDABLE_PROPERTIES: AnimProperty[] = ANIM_PROPERTIES.filter((p) => p !== 'opacity');

/** صفوفُ الخصائص التي تُفتَح تحت مقطع **هذا** العنصر — `animPropertiesFor` بلا الشفافيّة
 * (صفُّ المقطع نفسُه). فشكلٌ يحمل «بداية الخط» و«نهاية الخط» ونصٌّ لا يحملهما. */
export function expandablePropertiesFor(el: { type: string; textAnim?: { enabled: boolean }; anim?: { tracks?: Partial<Record<AnimProperty, unknown[] | undefined>> } }): AnimProperty[] {
  const props = animPropertiesFor(el).filter((p) => p !== 'opacity');
  // **الخصائصُ المتحرّكة أوّلًا** (٣٠ أكتوبر): فتحُ صفٍّ يُظهر مباشرةً تحت المقطع ما له مفاتيح
  // (الموضع، المقياس…)، وما لا مفاتيحَ له بعدها لمن أراد أن يضيف. كان الترتيبُ ثابتًا، فتُدفَن
  // ماساتُ «المقياس» تحت أربعة صفوفٍ فارغة.
  const keyed = (p: AnimProperty) => ((el.anim?.tracks?.[p] as unknown[] | undefined)?.length ?? 0) > 0;
  return [...props.filter(keyed), ...props.filter((p) => !keyed(p))];
}

export const CLIP_ROW_H = 30;
export const PROP_ROW_H = 22;

interface ClipProps {
  el: DocElement;
  color: string;
  expanded: boolean;
  /** الوضعُ الاحترافيّ. **وهو لم يبقَ بوّابةً على المقطع نفسه**: المستندُ المُوقَّت
   * يَنال صفَّ مقطعٍ حقيقيًّا — جسمًا يُنقَل وحافّتَين تُقلَّمان — في الوضعين.
   * وما يبقى احترافيًّا هو **المفاتيح**: الماسات، وزرُّ «مفتاح عند المؤشّر»،
   * وصفوفُ الخصائص عند التوسيع — فالوضعُ البسيط لا مفاتيحَ فيه ولا مسارات، وحركةُ
   * الدخول هي طريقُه إلى الحركة.
   *
   * (البند ٧ في `docs/UX-AUDIT-2026-10-18.md` — «وضعان يغيّران ما هو موجود بصمت» —
   * مُغلَقٌ للخطّ الزمنيّ بعينه لا عمومًا: شريطٌ ساكنٌ عند `opacity: .35` كان يَعِد
   * بمقطعٍ ولا يُسلّمه، والوضعُ البسيط هو الافتراضيّ.) */
  pro: boolean;
  selectedKf: SelectedKf | null;
  onSelectKf: (kf: SelectedKf | null) => void;
}

type GestureKind = 'move' | 'trim' | 'kf';

interface Gesture {
  kind: GestureKind;
  property: AnimProperty;
  edge?: ClipEdge;
  kfId?: string;
}

/** One layer's row in the timeline: a draggable/trimmable clip (body moves it in
 * time, edges change start/duration) with diamond keyframes on its opacity track in
 * pro mode, plus (when expanded) one more such row per remaining property —
 * x/y/scale/rotation — each with its own independent keyframes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **عاملُ ضغطٍ واحد، والقرارُ من `hitTest` وحدها.**
 *
 * الجسمُ والحوافُّ والماسات لم يبقَ لواحدٍ منها عاملُ ضغطٍ خاصّ. الضغطةُ تصل إلى
 * **حاوية الصفّ** — تَبُقّ من الجسم أو الماسة أو الخلفيّة سواءً — فتُحَلّ هناك
 * مرّةً واحدةً بدالّةٍ هندسيّةٍ نقيّة (`src/lib/timelineHit.ts`). وثلاثةُ آثارٍ
 * لذلك:
 *
 * ١. **ما تُظهره المؤشّرةُ هو ما تفعله الضغطة**، بحكم البناء لا بحكم التوفيق:
 *    التحويمُ والضغطُ يُنادِيان الدالّةَ نفسها بالإحداثيّات نفسها.
 * ٢. **الضغطةُ تُحَلّ على إطارِ الضغط لا عند تمييز السحب.** محرّر خطٍّ زمنيٍّ مفتوح تكتب السبب
 *    (`crates/ui-egui/src/panels/timeline.rs:83`): عتبةُ سحبٍ بستّة بكسلات *«nearly
 *    the 7 px edge zone»*، فحين يُميَّز السحبُ يكون المؤشّرُ قد خرج من المنطقة
 *    التي بدأ فيها.
 * ٣. **ومعالجةُ التصادم المكتوبة هنا سقطت** — ولم تُستبدَل بأخرى. كان الحلُّ
 *    بالطبقات: مقابضُ الحجم بـ٦ بكسلات عند `zIndex: 4` تُظلِّل الماسات بـ٩
 *    بكسلات عند `zIndex: 3`، فتُكتَب فرعيّةٌ تُعوّض: «نقرةٌ بلا سحبٍ على مقبضِ
 *    حافّةٍ تُحدّد مفتاحَ الحدّ، إذ **لا منطقةَ إصابةٍ له بعد أن سبقه المقبض**».
 *    والآن للمفاتيح أسبقيّةٌ مُعلَنةٌ في فصل التعادل، فالماسةُ تُصاب لأنها ماسة —
 *    والمقابضُ صارت `pointerEvents: 'none'`، أي رسمًا لا هندسة.
 *
 * وكلُّ إيماءةٍ زوجُ بدايةٍ وختم (`beginElementEdit`/`commitElementEdit`) **باسمٍ**،
 * فتَنكمش إلى خطوةِ تراجعٍ واحدةٍ مُسمّاة أيًّا كان عددُ أحداث الحركة؛ وEscape
 * أثناءها يُعيد المستند ولا يُسجّل شيئًا (`cancelElementEdit`). */
export function Clip({ el, color, expanded, pro, selectedKf, onSelectKf }: ClipProps) {
  const { state, actions, dict: L } = useStudio();
  const gestureRef = useRef<Gesture | null>(null);
  const anim = el.anim;
  // زرّ «+» لم يبقَ له حالةُ تعطيل. كان يُعطَّل إذا كان المؤشّر **قبل** بداية
  // المقطع، لأنّ كسرًا سالبًا لا معنى له؛ ومفتاحٌ قبل البداية الآن زمنُ حركةٍ سالب
  // وهو مشروع. فسقطت `canKeyframeAtPlayhead` و`disabled` و`kf_outside_clip` معه —
  // **وهذا ليس تغطيةً لسطحٍ معطوب بل إزالةُ منعٍ لم يبقَ له سبب**: الزرّ يعمل في
  // كلّ موضعٍ الآن، ولم يُستبدَل تعطيلُه بصمتٍ ولا بـ«قريبًا».
  const span = timelineSpan(documentDuration(state.elements.map((e) => e.anim), state.fps));
  const leftPct = (anim.start / span) * 100;
  const widthPct = (anim.duration / span) * 100;

  /** صفُّ هذا المقطع كما يراه فاحصُ الإصابة. والماساتُ تُسلَّم **في الوضع
   * الاحترافيّ وحده**، لأنها لا تُرسَم في غيره — فلا تُصاب إصابةً لا يراها أحد. */
  const rowClips = (property: AnimProperty, height: number): HitClipRow[] => [
    {
      elementId: el.id,
      property,
      top: 0,
      height,
      start: anim.start,
      duration: anim.duration,
      locked: el.locked,
      keyframes: pro ? (anim.tracks[property] ?? []).map((k) => ({ id: k.id, property, timelineTime: timelineTimeOf(anim, k.time) })) : [],
    },
  ];

  const hitAt = (rowEl: HTMLElement, property: AnimProperty, clientX: number, clientY: number): { hit: Hit; rect: DOMRect } => {
    const rect = rowEl.getBoundingClientRect();
    const hit = hitTest(
      { x: clientX - rect.left, y: clientY - rect.top },
      { width: rect.width, span, rulerHeight: 0 },
      rowClips(property, rect.height),
    );
    return { hit, rect };
  };

  /** التحويم: المؤشّرةُ وشارةُ «ما تحت المؤشّر» من الدالّة نفسها التي تَحلّ
   * الضغطة. وتُكتَب على عقدة الصفّ مباشرةً لا عبر حالةِ React: حدثُ حركةٍ لكلّ
   * بكسل، وإعادةُ تصيير الخطّ الزمنيّ كلِّه عندها ثمنٌ بلا مقابل. */
  const onRowPointerMove = (property: AnimProperty) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current) return;
    const rowEl = e.currentTarget;
    const { hit } = hitAt(rowEl, property, e.clientX, e.clientY);
    rowEl.style.cursor = hit.cursor;
    rowEl.dataset.hoverHit = hit.kind;
    rowEl.dataset.hoverEdge = hit.edge ?? '';
  };

  const onRowPointerDown = (property: AnimProperty) => (e: React.PointerEvent<HTMLDivElement>) => {
    const rowEl = e.currentTarget;
    const { hit, rect } = hitAt(rowEl, property, e.clientX, e.clientY);
    // لا شيءَ تحت المؤشّر في هذا الصفّ: تُترَك الضغطةُ تصعد إلى `timeline-tracks`
    // فتُحرّك المؤشّرَ الزمنيّ — كما يفعل الضغطُ على المسطرة. وهو السلوكُ القائم.
    if (hit.kind === 'emptyRow') return;
    e.stopPropagation();
    e.preventDefault();
    // عنصرٌ مقفول: المؤشّرةُ قالت `not-allowed` **قبل** المحاولة، والضغطةُ تُبتلَع
    // فلا تُحرّك شيئًا ولا تُحرّك المؤشّرَ الزمنيّ خلسةً.
    if (hit.blocked) return;
    // **الضغطُ على مقطعٍ يحدّد عنصرَه** (وبه تُحدَّد على اللوحة وفي المفتّش)، كما في محرّرات
    // الفيديو: كان السحبُ يحرّك مقطعًا ويبقى التحديدُ على غيره، فيُحرَّر في المفتّش ما لم يُلمَس.
    // ⇧/⌘ تُضيف إلى التحديد كما في قائمة الطبقات.
    if (!state.selectedIds.includes(el.id) || e.shiftKey || e.metaKey) actions.selectElement(el.id, e.shiftKey || e.metaKey || e.ctrlKey);

    const kind: GestureKind = hit.kind === 'keyframe' ? 'kf' : hit.kind === 'clipEdge' ? 'trim' : 'move';
    const edge = hit.edge;
    const kfId = hit.keyframeId;
    const startAnim = anim;
    const startClientX = e.clientX;
    const startKf = kfId ? anim.tracks[property]?.find((k) => k.id === kfId) : undefined;
    const startKfTime = startKf?.time ?? 0;
    if (kind === 'kf' && kfId) onSelectKf({ elId: el.id, property, kfId });
    if (kind === 'move') onSelectKf(null);

    gestureRef.current = { kind, property, edge, kfId };
    rowEl.style.cursor = hit.cursor;
    const label = kind === 'move' ? L.undo_clip_move : kind === 'trim' ? (edge === 'in' ? L.undo_clip_trim_in : L.undo_clip_trim_out) : L.undo_kf_move;
    actions.beginElementEdit(label);
    rowEl.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const deltaSec = ((ev.clientX - startClientX) / rect.width) * span;
      actions.liveUpdateElements((els) =>
        els.map((e2) => {
          if (e2.id !== el.id) return e2;
          if (kind === 'move') {
            // **بلا سقف.** كان الحجزُ إلى `TIMELINE_DURATION - duration`، أي أنّ
            // مقطعًا لا يستطيع أن ينتهي بعد الثانية الخامسة بحال. وقد صار الطولُ
            // مشتقًّا من المقاطع، فالمقطعُ هو الذي يُطيل المستند لا العكس.
            // ولا تقريبَ إلى الشبكة هنا: النقلُ يَحمل مفاتيحَه معه، فـ`start`
            // وحده يتغيّر — والخطّةُ تقول صراحةً إنّ دلالةَ النقل تبقى كما هي.
            return { ...e2, anim: moveClip(startAnim, deltaSec).anim };
          }
          if (kind === 'trim') {
            // الحجزُ داخل `trim` (`clampTrim`)، فالمعاينةُ **تتوقّف عند الحدّ** بدل
            // أن ترتدّ إليه عند الإفلات. و`applied` هو الفرقُ الذي نَفَذ فعلًا، لا
            // الذي طُلِب — يُكتَب على الصفّ ليَقرأه القياسُ وقناةُ التحكّم.
            const r = trim(startAnim, edge === 'in' ? 'in' : 'out', deltaSec, { fps: state.fps });
            rowEl.dataset.trimApplied = r.applied.toFixed(4);
            rowEl.dataset.trimClamped = Math.abs(r.applied - deltaSec) > 1e-6 ? 'true' : 'false';
            return { ...e2, anim: r.anim };
          }
          // kind === 'kf' — الماسة تُسحَب بالثواني مباشرةً، والتصادمُ يُحسَم عند
          // **الإفلات** بقُمع الكتابة الواحد (`setKeyframe`) لا عند كلّ حدثِ
          // حركة. انظر `resolveKfDrag` أدناه لِمَ.
          const a = e2.anim;
          const track = a.tracks[property];
          if (!track || !kfId) return e2;
          if (!track.some((k) => k.id === kfId)) return e2;
          const newTime = snapToFrame(startKfTime + deltaSec, state.fps);
          return { ...e2, anim: { ...a, tracks: { ...a.tracks, [property]: track.map((k) => (k.id === kfId ? { ...k, time: newTime } : k)) } } };
        }),
      );
    };

    /** **حسمُ التصادم مرّةً واحدةً عند الإفلات، لا عند كلّ بكسل.**
     *
     * وهذا عطلٌ حقيقيٌّ كشفه المعيار A2 حين صار قابلًا للقياس: كان السحبُ يمرّ
     * بـ`setKeyframe` **في كلّ حدثِ حركة**، والقُمعُ عند تطابقٍ تامٍّ يُبقي
     * `id` المفتاح **القائم** لا الزاحف — فأوّلُ مفتاحٍ يُعبَر عليه يَبتلع هوية
     * المسحوب، فلا تجده الحركةُ التالية، فيتجمّد السحبُ في منتصفه ويَضيع مفتاح.
     * وقياسُه: سحبُ أوّلِ مفتاحٍ فوق ١٤٩ مفتاحًا وعودتُه يُنقص العدّة من ١٥٠ إلى
     * ١٤٩، والسحبُ ميتٌ من أوّل تصادم.
     *
     * و§1C من الخطّة لم تَرَ هذا لأنّ المقابض كانت تُظلِّل الماسات، فما كان أحدٌ
     * يستطيع سحبَ مفتاحٍ على حافّة أصلًا — **ومعيارُ المرحلة ١ كان يقيس تقليمَ
     * حافّةٍ وهو يَحسب أنه يقيس سحبَ مفتاح**.
     *
     * فالسحبُ معاينةٌ غيرُ مُخرِّبة: المفتاحُ يَحمل زمنَه الجديد وهويتَه، وقد
     * يتشارك لحظةً مع غيره — وهذا لا يُرى لأنه لا يُحفَظ. والقُمعُ يُنادى هنا
     * مرّةً واحدة، فالإبدالُ يحدث حيث أراده المصمّم لا حيث عبَر. */
    const resolveKfDrag = () => {
      if (kind !== 'kf' || !kfId) return;
      actions.liveUpdateElements((els) =>
        els.map((e2) => {
          if (e2.id !== el.id) return e2;
          const a = e2.anim;
          const track = a.tracks[property];
          if (!track) return e2;
          const dragged = track.find((k) => k.id === kfId);
          if (!dragged) return e2;
          const without = track.filter((k) => k.id !== kfId);
          return { ...e2, anim: { ...a, tracks: { ...a.tracks, [property]: setKeyframe(without, dragged) } } };
        }),
      );
    };

    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // **بعلَم الالتقاط نفسِه الذي أُضيف به** — ٢٥ أكتوبر ٢٠٢٦. كان يُزال بلا `true`،
      // و`removeEventListener` لا يُطابق مستمعًا أُضيف بالتقاطٍ إلّا بالتقاط: فبقي بعد
      // كلّ نقرةٍ على مقطعٍ أو ماسةٍ مستمعٌ على النافذة يبتلع كلَّ `Escape` بعدها
      // (`stopPropagation` في طور الالتقاط) ويُنادي `cancelElementEdit` — فلا يُلغي
      // `Escape` التحديدَ بعد أيّ لمسةٍ للخطّ الزمنيّ، ويُرجِع قيمةً كُتبت للتوّ في
      // حقلٍ مفتوح. ظهر حين نُسخ مقطعٌ حقيقيٌّ بالأزرار. انظر `qa/kf-popover-placement.spec.mjs` §٦.
      window.removeEventListener('keydown', onKey, true);
      gestureRef.current = null;
      delete rowEl.dataset.trimApplied;
      delete rowEl.dataset.trimClamped;
    };
    const up = (ev: PointerEvent) => {
      finish();
      resolveKfDrag();
      actions.commitElementEdit();
      // **نقرةٌ ساكنةٌ على حافّةٍ فوقها ماسة تفتح الماسة** (٣٠ أكتوبر). الحافّةُ تَغلب الماسةَ في
      // الإصابة كي لا يُحرّك سحبُ التقليم مفتاحَ الدخول — لكنّ ذلك جعل مفتاحَ أوّلِ المقطع لا يُفتَح
      // أبدًا. فالسحبُ يبقى تقليمًا، والنقرةُ بلا حركةٍ تُحدّد أقربَ ماسةٍ تحت المؤشّر.
      if (kind === 'trim' && Math.abs(ev.clientX - startClientX) < 3) {
        const localX = ev.clientX - rect.left;
        const near = (anim.tracks[property] ?? [])
          .map((k) => ({ k, dx: Math.abs((timelineTimeOf(anim, k.time) / span) * rect.width - localX) }))
          .filter((c) => c.dx <= 8)
          .sort((p1, p2) => p1.dx - p2.dx)[0];
        if (near && pro) onSelectKf({ elId: el.id, property, kfId: near.k.id });
      }
    };
    /** **Escape يُلغي أيَّ سحب، والإفلاتُ بعده لا يُثبِّت شيئًا**
     * (`timeline.rs:2519-2546`, `:2681`). والإلغاءُ يُعيد المستند إلى لقطة بداية
     * الإيماءة ولا يدفع خطوةَ تراجع — فلا يحتاج المصمّم تراجعًا ليُبطل إلغاءً. */
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      finish();
      actions.cancelElementEdit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', onKey, true);
  };

  const row = (property: AnimProperty, height: number, top: number) => {
    const track = pro ? (anim.tracks[property] ?? []) : [];
    return (
      <div
        key={property}
        data-clip-row={`${el.id}-${property}`}
        data-testid={`clip-row-${el.id}${property === 'opacity' ? '' : `-${property}`}`}
        onPointerDown={onRowPointerDown(property)}
        onPointerMove={onRowPointerMove(property)}
        style={{ position: 'absolute', left: 0, right: 0, top, height, borderBottom: '1px solid var(--line)', touchAction: 'none' }}
      >
        <div
          data-testid={`clip-${el.id}${property === 'opacity' ? '' : `-${property}`}`}
          // **المقطعُ المحدودُ يُقرأ محدودًا.** عنصرٌ يغيب خارج مقطعه (`anim.bounded`)
          // جسمُه أوضح وحافّتاه مخطوطتان — طرفاه حدّا وجوده لا حدّا حركته — وتلميحُه
          // يقول ذلك. وغيرُ المحدود على رسمه القديم بالحرف.
          data-bounded={anim.bounded ? 'true' : 'false'}
          title={property === 'opacity' ? (anim.bounded ? L.clip_bounded_tip : L.clip_unbounded_tip) : undefined}
          style={{
            position: 'absolute',
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            top: (height - 16) / 2,
            height: 16,
            borderRadius: 4,
            background: color,
            // **المقطعُ المحدَّد محاطٌ بحدٍّ واضح** (كما في محرّر فيديو شائع: حدٌّ أبيض ٢px)، فيُعرف من الشريط
            // نفسِه أيُّ مقطعٍ سيُقصّ أو يُسحب — لا من ترويسة الصفّ وحدها.
            boxShadow:
              property === 'opacity' && state.selectedIds.includes(el.id)
                ? '0 0 0 2px var(--text)'
                : anim.bounded && property === 'opacity'
                  ? `inset 0 0 0 1.5px ${color}`
                  : undefined,
            opacity: property === 'opacity' ? (anim.bounded ? 0.62 : 0.4) : 0.22,
            // المؤشّرةُ تُورَّث من الصفّ: هي قرارُ `hitTest` لا صفةُ عقدةٍ ثابتة،
            // وإلا قالت الحافّةُ `grab` لأنها ترقد على الجسم.
            cursor: 'inherit',
          }}
        />
        {/* **الصوتُ يُقرأ بموجته واسمه.** الموجةُ ما بين قصّ الرأس وآخر المقطع من الملف، فتنتقل
            مع المقطع وتنقصّ معه؛ والاسمُ اسمُ الملف. */}
        {el.type === 'audio' && property === 'opacity' && (
          <AudioClipFace src={el.src} from={anim.sourceIn ?? 0} length={anim.duration} leftPct={leftPct} widthPct={widthPct} top={(height - 16) / 2} name={el.name ?? ''} color={color} />
        )}
        {/* حركةُ الدخول مقروءةٌ على المقطع في الوضع البسيط: لا مفاتيحَ هناك
            تُخبرك بما يفعله، فاسمُ النمط هو كلُّ ما يُقرأ. */}
        {!pro && property === 'opacity' && el.type !== 'audio' && (
          <div
            style={{
              position: 'absolute',
              left: `calc(${leftPct}% + 8px)`,
              top: (height - 16) / 2,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--text)',
              pointerEvents: 'none',
            }}
          >
            {el.type === 'fx' ? elementDisplayName(el, L) : (L[`anim_${anim.preset}` as keyof typeof L] as string)}
          </div>
        )}
        {property === 'opacity' && (
          <>
            {/* المقابضُ **رسمٌ لا هندسة**: `pointerEvents: 'none'`، فالإصابةُ كلُّها
                من `hitTest`. وتبقى العقدتان لأنّ القياسَ يَقرأ موضعَهما
                (`boundingBox`) ولأنهما ما يُشير إلى الحافّة للمصمّم.
                ─────────────────────────────────────────────────────────────
                **ولِمَ انتقل مركزُهما ستّةَ بكسلات إلى داخل المقطع.** كان المركز
                على الحدّ تمامًا، وعلى الحدّ تمامًا تَقع ماسةُ المفتاح: كلُّ نمطٍ
                جاهزٍ في مزيج يكتب مفتاحًا عند `t = 0` و`t = 1`
                (`tracksFromPreset`)، أي عند الحافّتين بالضبط. وفصلُ التعادل يُعطي
                **المفاتيحَ أسبقيّةً على الحوافّ** — وهو المقصود — فمركزٌ على الحدّ
                يعني ماسةً تُسحَب حيث يُتوقَّع تقليم، أي أنّ أشهرَ مقطعٍ في
                البرنامج لا حافّةَ له تُقبَض أصلًا.
                والموضعُ الجديد يحلّها بالهندسة لا باستثناءٍ في القاعدة: على ستّة
                بكسلات من الحدّ يكون المفتاحُ خارج مداه (٥) والحافّةُ داخل مداها
                (٧) — فيبقى للماسة حدُّها ويبقى للحافّة شريطُها، ولا تُخصَّص قاعدةٌ
                ولا يُعاد المقبضُ هندسةً تُظلِّل ماسةً. */}
            <div
              data-testid={`clip-${el.id}-resize-left`}
              style={{ position: 'absolute', left: `calc(${leftPct}% + 3px)`, width: 6, top: 6, height: 18, pointerEvents: 'none', zIndex: 4 }}
            />
            <div
              data-testid={`clip-${el.id}-resize-right`}
              style={{ position: 'absolute', left: `calc(${leftPct + widthPct}% - 9px)`, width: 6, top: 6, height: 18, pointerEvents: 'none', zIndex: 4 }}
            />
          </>
        )}
        {track.map((kf) => {
          // **من زمنٍ مطلقٍ لا من كسرٍ في المقطع.** كان الموضعُ
          // `(start + t × duration) / TIMELINE_DURATION`، فكان كلُّ تغييرٍ في
          // المدّة يُحرِّك كلَّ ماسةٍ على الشاشة.
          const pct = (timelineTimeOf(anim, kf.time) / span) * 100;
          const selected = selectedKf?.elId === el.id && selectedKf.property === property && selectedKf.kfId === kf.id;
          return (
            <div
              key={kf.id}
              data-testid={`kf-${el.id}-${kf.id}`}
              // بالثواني لا بنسبةٍ من المقطع. كان التلميح يقول «٥١٪» — أي نسبةَ
              // المفتاح من مقطعه، وهو رقمٌ لا يستطيع المصمّم أن يفعل به شيئًا.
              title={`${kf.time.toFixed(3)}s · ${formatKfDisplay(kfValueToDisplay(property, kf.value))}${property === 'rotation' ? '°' : property === 'reveal' ? '' : '%'}`}
              style={{
                position: 'absolute',
                left: `${pct}%`,
                top: height / 2 - 5,
                width: 9,
                height: 9,
                marginLeft: -4.5,
                transform: 'rotate(45deg)',
                background: selected ? 'var(--accent)' : 'var(--surface)',
                border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--text)'}`,
                borderRadius: 1,
                cursor: 'inherit',
                zIndex: 3,
              }}
            />
          );
        })}
        {pro && el.type !== 'audio' && (
          <button
            data-testid={`clip-${el.id}-add-kf${property === 'opacity' ? '' : `-${property}`}`}
            data-anim-time={snapToFrame(animTimeAt(anim, state.t), state.fps).toFixed(4)}
            title={L.add_keyframe}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              actions.addTrackKeyframeAtPlayhead(el.id, property);
            }}
            style={{
              position: 'absolute',
              right: 4,
              top: (height - 16) / 2,
              width: 16,
              height: 16,
              display: 'grid',
              placeItems: 'center',
              border: '1px solid var(--line)',
              borderRadius: 3,
              background: 'var(--surface)',
              color: 'var(--muted)',
              fontSize: 11,
              lineHeight: 1,
              zIndex: 4,
              opacity: 1,
              cursor: 'pointer',
            }}
          >
            +
          </button>
        )}
      </div>
    );
  };

  const showProps = pro && expanded;
  const rows = expandablePropertiesFor(el);
  const totalHeight = CLIP_ROW_H + (showProps ? rows.length * PROP_ROW_H : 0);

  return (
    <div style={{ height: totalHeight, position: 'relative' }}>
      {row('opacity', CLIP_ROW_H, 0)}
      {showProps && rows.map((p, i) => row(p, PROP_ROW_H, CLIP_ROW_H + i * PROP_ROW_H))}
    </div>
  );
}

/** وجهُ مقطع الصوت: موجتُه واسمُه داخل جسمه. رسمٌ لا هندسة (`pointerEvents: none`) — النقلُ
 * والقصُّ من `hitTest` كغيره. */
function AudioClipFace({ src, from, length, leftPct, widthPct, top, name, color }: { src: string | null; from: number; length: number; leftPct: number; widthPct: number; top: number; name: string; color: string }) {
  const peaks = useAudioPeaks(src);
  const d = peaks ? waveformPath(peaks, from, length) : '';
  return (
    <div
      data-testid="audio-clip-face"
      data-has-wave={d ? 'true' : 'false'}
      style={{ position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`, top, height: 16, pointerEvents: 'none', overflow: 'hidden', borderRadius: 4 }}
    >
      {d && (
        <svg viewBox={`0 -1 ${Math.max(0.001, length)} 2`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <path d={d} fill={color} opacity={0.95} />
        </svg>
      )}
      <span style={{ position: 'absolute', insetInlineStart: 6, top: 1, fontSize: 9.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', textShadow: '0 0 3px var(--surface)' }}>{name}</span>
    </div>
  );
}
