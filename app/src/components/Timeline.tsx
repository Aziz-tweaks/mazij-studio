import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useStudio } from '../state/StudioContext';
import { KF_VALUE_STEP, documentDuration, formatClock, formatDurationSec, formatKfDisplay, kfValueFromDisplay, kfValueToDisplay, quantizeKfValue, tickLadder, timeOfFrame, timelineSpan } from '../lib/animTimeline';
import type { AnimProperty, DocElement } from '../state/elements';
import { hasCustomAnimation } from '../state/elements';
import { canSplitAt } from '../lib/timelineEdit';
import { revealUnitCount } from '../lib/textStagger';
import { hitTest } from '../lib/timelineHit';
import { elementDisplayName } from '../lib/layerNames';
import { EASING_IDS, type EasingId } from '../lib/easing';
import { EasingMenu, EASE_LABEL_KEY } from './timeline/EasingMenu';
import { AnimPresetMenu } from './timeline/AnimPresetMenu';
import { BezierEditor } from './timeline/BezierEditor';
import { AnchoredPopover } from './timeline/AnchoredPopover';
import { Clip, CLIP_ROW_H, PROP_ROW_H, expandablePropertiesFor, type SelectedKf } from './timeline/Clip';
import { ICONS, clamp } from '../data/constants';

const RULER_H = 26;

const KNOWN_COLOR: Record<string, string> = {
  img: '#6FB7A8',
  head: '#E0A458',
  discount: '#C9A24B',
  badge: '#D97A6C',
  'badge-label': '#D97A6C',
  logo: '#9B8CE8',
  'logo-label': '#9B8CE8',
};

/** Stable, distinct color per layer id — the handful of default elements keep their
 * original hand-picked colors; anything added later (shapes, extra text, images)
 * gets a hash-derived hue instead of falling back to one flat grey for everything. */
function colorForLayer(id: string): string {
  if (KNOWN_COLOR[id]) return KNOWN_COLOR[id];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 45%, 58%)`;
}


/** عنوانُ علامةٍ على المسطرة. ثوانٍ صحيحةٌ تُكتَب `3s`، وما دقّ عن الثانية يُكتَب
 * بمنزلتَيه (`0.5s`) — فسُلَّمُ العلامات يَنزل إلى أعشار الثانية على مستندٍ قصير،
 * و`${t}s` وحدها كانت ستطبع `0.30000000000000004s`. */
function tickLabel(t: number): string {
  if (Math.abs(t - Math.round(t)) < 1e-9) return `${Math.round(t)}s`;
  return `${(Math.round(t * 100) / 100).toFixed(2).replace(/0$/, '')}s`;
}

function layerRowHeight(el: DocElement, expanded: boolean): number {
  return CLIP_ROW_H + (expanded ? expandablePropertiesFor(el).length * PROP_ROW_H : 0);
}

/** Per-property slider range/unit for the keyframe-value popover: opacity, the three
 * scale multipliers and x/y are shown as percentages (matching how `tracks` stores
 * them — a 0..1 multiplier or a fraction-of-width offset), rotation is shown directly
 * in degrees.
 *
 * و`scaleX`/`scaleY` يأخذان مدى `scale` نفسَه (٠..٣٠٠٪) لأنهما وحدتُه نفسُها —
 * ومدًى آخرُ على المحورَين كان سيَجعل «١٥٠٪» تعني شيئَين في لوحٍ واحد. */
function sliderRange(property: AnimProperty, el?: DocElement): [number, number] {
  switch (property) {
    case 'opacity':
      return [0, 100];
    case 'scale':
    case 'scaleX':
    case 'scaleY':
      return [0, 300];
    case 'x':
    case 'y':
      return [-100, 100];
    // الضبابيّةُ كسرٌ من عرض اللوح كـ`x`/`y`، فبالنِّسبة المئويّة نفسِها —
    // و**السالبُ معروضٌ لأنها فرقٌ يُجمَع**: مفتاحٌ سالبٌ يُحِدّ عنصرًا ضبابيّتُه
    // الساكنةُ موجبة، وهو نصفُ القدرة. والمدى ±٢٠٪ لا ±١٠٠٪ لأنّ نصفَ قطرٍ يساوي
    // عرضَ اللوح يَمحو العنصرَ محوًا تامًّا، فالمعروضُ هو المدى المفيد؛ والنموذجُ
    // يَقبل ±١ (`clampAnimPropertyValue`) فلا يَقصّ هذا الشريطُ قيمةً كتبها غيرُه.
    case 'blur':
      return [-20, 20];
    case 'rotation':
      return [-180, 180];
    // كسرانِ من طول الحدّ بالنسبة المئويّة، كالشفافيّة.
    case 'trimStart':
    case 'trimEnd':
      return [0, 100];
    // عددُ وحدات **هذا** النصّ بوحدته الحاليّة: من لا شيء إلى الكلّ. وواحدٌ أرضيّةً كي لا
    // يصير المدى صفرًا لنصٍّ فارغ.
    case 'reveal':
      return [0, Math.max(1, el && el.type === 'text' ? revealUnitCount(el.text, el.textAnim.unit) : 1)];
  }
}

/** **الحقلُ الرقميُّ لقيمةِ المفتاح — الطريقُ الدقيق، إلى جانبِ المِمسحة لا بدلًا
 * منها.**
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * لِمَ حقلٌ، ولِمَ لا تكفي `step` على المِمسحة
 * ═══════════════════════════════════════════════════════════════════════════
 * كانت المِمسحةُ وحدَها، بلا `step`، فخطوتُها ١ — و`x`/`y` كسرٌ من عرض اللوح،
 * فأدقُّ إزاحةٍ على لوحٍ عرضُه ٢٥٦٠ بكسلًا **٢٥٫٦ بكسلًا**. وثلاثةُ قياساتٍ على
 * المِمسحة نفسِها تقول إنّ `step` أدقَّ لا تُنقذها:
 *
 * ١. **عرضُها ٩٠ بكسلًا لمدًى ٢٠٠ وحدة** (مقيسٌ من `getBoundingClientRect`).
 *    فبكسلُ الشاشة الواحدُ ٢٫٢٢ وحدة، ومقيسٌ فعلًا: سحبةٌ بمقدار بكسلٍ واحدٍ من
 *    المنتصف أعطت `3`، وبكسلَين `5`، وثلاثةٍ `8`. فموضعُ ٠٫٧٤٪ يَحتاج من المؤشّر
 *    دقّةَ ١/٢٢٢ من البكسل — وهي ليست عنده.
 * ٢. **المفاتيحُ الأفقيّةُ لا تَصِل إليها أصلًا.** مقيسٌ: `ArrowRight` على مِمسحةٍ
 *    مركَّزةٍ يُعطي `0 → 0`، لأنّ `onTrackKeyDown` أدناه يَملك `←`/`→` لتنقّل
 *    الإطارات ويُنادي `preventDefault`. و`ArrowUp` وحدَها تَصِل، بخطوةٍ واحدة.
 * ٣. **والمتصفّحُ يَرفض الكسورَ عليها.** `fill('0.74')` على المِمسحة يُعطي
 *    `Error: Malformed value`، لأنّ قيمةَ `range` تُقصَر على مُضاعَفات `step`.
 *
 * فالطريقُ الدقيقُ لا بدّ أن يكون **مكتوبًا**. والمِمسحةُ تبقى لأنها الطريقُ
 * السريع — وهو الدرسُ المكتوبُ في هذا المستودع يومَ هبط منتقي لون الحدّ:
 * **أُبقيَت الشرائحُ إلى جانبه** لأنّ الدقّةَ لا تُلغي السرعة.
 *
 * **وسمةُ `step` تُوضَع على المِمسحة كذلك، ولسببٍ آخرَ تمامًا:** لا لتُدقّقَ السحبَ
 * بل لتَقدر المِمسحةُ على **عرضِ** ما كتبه الحقل. مقيسٌ في Chromium: بلا `step`
 * تُقرأ `.value = '0.74'` رجوعًا `'1'` — فلو بقيت بلا `step` لَعرَض السطحانِ عن
 * القيمة الواحدة رقمَين مختلفَين، وهو الافتراقُ الذي عضَّ هذا المستودعَ مرّتين.
 *
 * **ومسوّدةٌ محلّيّةٌ بنمط `NumField`** (`left-panel/PropsTab.tsx`): `«‑»` و`«0.»`
 * و`«»` حالاتٌ وسيطةٌ لا تُلزِم، وإلّا مُحِيَت الإشارةُ من تحت يد الكاتب.
 *
 * **والمسوّدةُ لمفتاحها وحده — ٢٥ أكتوبر ٢٠٢٦.** رقمٌ مطروقٌ بلا `Enter` ثم نقرةٌ على
 * ماسةٍ أخرى: نقرةُ الماسة لا تُفقِد الحقلَ تركيزَه، والمكوّنُ نفسُه يبقى للمفتاح
 * الجديد، فكان يَعرض **مسوّدةَ المفتاح السابق** على المفتاح الجديد — «-1.4055» فوق
 * مفتاحٍ قيمتُه ٠٫٨٤ — وتبقى إيماءةُ الكتابة مفتوحةً بلا خطوة تراجع. فالحقلُ يُعطى
 * مفتاحَ React من هويّة المفتاح (حقلٌ لكلّ مفتاح)، وما كُتب حيًّا ولم يُلزَم يُلزَم
 * عند زواله: خطوةُ تراجعٍ واحدةٌ مسمّاة كما لو ضُغط `Enter`. */
function KfValueField({
  range,
  display,
  onLive,
  onCommit,
  title,
}: {
  range: [number, number];
  display: number;
  onLive: (display: number) => void;
  onCommit: () => void;
  title: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [min, max] = range;
  // ما كُتب حيًّا ولم يُلزَم بعد — يُلزَم عند الزوال (انتقالٌ إلى مفتاحٍ آخر أو إغلاق).
  const pending = useRef(false);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useEffect(
    () => () => {
      if (pending.current) commitRef.current();
    },
    [],
  );
  return (
    <input
      data-testid="kf-value-field"
      dir="ltr"
      type="number"
      title={title}
      step={KF_VALUE_STEP}
      min={min}
      max={max}
      value={draft ?? formatKfDisplay(display)}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === '') return;
        const v = Number(raw);
        if (Number.isFinite(v)) {
          pending.current = true;
          onLive(v);
        }
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        setDraft(null);
        pending.current = false;
        onCommit();
      }}
      onBlur={() => {
        setDraft(null);
        pending.current = false;
        onCommit();
      }}
      style={{
        width: 56,
        height: 20,
        border: '1px solid var(--line)',
        borderRadius: 4,
        background: 'var(--surface2)',
        color: 'var(--text)',
        fontSize: 11,
        padding: '0 4px',
        textAlign: 'center',
        fontVariantNumeric: 'tabular-nums',
      }}
    />
  );
}

/** `timed` هي الجوابُ عن «صورةٌ أم فيديو؟» واصلًا من `App.tsx`، وهو موضعُ التفرّع
 * الوحيد — انظر التعليقَ المطوَّل عند `<Timeline timed=…>` هناك لِمَ دعامةٌ تُمرَّر
 * ولا يُرفَع المكوّن كلُّه (خلاصتُه: قائمةُ الطبقات تعيش هنا ولا بيتَ لها غيره).
 *
 * وهذا الملفُّ **لا يَقرأ `state.medium` في شرطٍ ولا يُقارنه**: الجوابُ يصل دعامةً،
 * فلا يصير هذا موضعًا رابعًا يتفرّع عليه ويجوز أن يختلف عن الثلاثة. */
/** مدى تكبير الخطّ الزمنيّ: ١ = المستندُ كلُّه في النافذة، و٦٤ = إطارُ ٣٠/ث بعرض عشرات البكسلات
 * في مقطعٍ دقيقة. */
const TL_ZOOM_MIN = 1;
const TL_ZOOM_MAX = 64;

export function Timeline({ timed, docked = false }: { timed: boolean; /** رفُّ الطبقات تحت المفتش (المستند الساكن) — انظر `Inspector.tsx`. */ docked?: boolean }) {
  const { state, actions, dict: L } = useStudio();
  // **طولُ المستند مشتقّ، ومدى المسطرة أرضيّةٌ عليه.** لا ثابتَ هنا بعد اليوم:
  // `docDuration` ما يُعرَض ويُصدَّر، و`span` ما تُقاس عليه النِّسَب المئويّة —
  // انظر `timelineSpan` لِمَ هما كمّيتان لا واحدة.
  const docDuration = documentDuration(state.elements.map((el) => el.anim), state.fps);
  const span = timelineSpan(docDuration);
  const playheadPct = (state.t / span) * 100;
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedKf, setSelectedKf] = useState<SelectedKf | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  /** الطبقة التي يُعاد تسميتها الآن داخل سطرها — حالة عرضٍ محليّة لا مستنديّة. */
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const trackWrapRef = useRef<HTMLDivElement>(null);
  // **قائمةُ الطبقات ومساراتُها تُمرَّران معًا.** كانتا حاويتين مستقلّتين، فتمريرُ المسارات يُزيح
  // المقاطعَ تحت أسماءٍ ليست لها — يُقرأ «ضبابية» أمام مقطع صورة. كلٌّ منهما يعكس تمريرَ الأخرى.
  const layersScrollRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const mirrorScroll = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (from && to && Math.abs(to.scrollTop - from.scrollTop) > 0.5) to.scrollTop = from.scrollTop;
  };
  const rulerRef = useRef<HTMLDivElement>(null);
  // **تكبيرُ الخطّ الزمنيّ** (٢٥ أكتوبر ٢٠٢٦). كان المدى كلُّه يُحشَر في عرض اللوح: مقطعٌ من
  // ٤٤ ثانية = ٢٩ بكسلًا للثانية، فالإطارُ بكسلٌ واحد، والماستان المتجاورتان لا تُمسَكان.
  // فصار السطحُ الزمنيّ «لوحًا» أعرضَ من نافذته بمضاعِف `tlZoom` يُمرَّر أفقيًّا — وكلُّ ما
  // فيه بالنِّسَب المئويّة وبمستطيل العنصر تحت المؤشّر، فلا يتغيّر فيه حسابٌ واحد.
  const [tlZoom, setTlZoom] = useState(1);
  const zoomRef = useRef(1);
  zoomRef.current = tlZoom;
  const zoomTo = (next: number, anchorClientX?: number) => {
    const wrap = trackWrapRef.current;
    const z = clamp(next, TL_ZOOM_MIN, TL_ZOOM_MAX);
    if (!wrap) {
      setTlZoom(z);
      return;
    }
    const rect = wrap.getBoundingClientRect();
    const vw = wrap.clientWidth || rect.width || 1;
    const prev = zoomRef.current;
    // الثابتُ أثناء التكبير: الزمنُ تحت المرساة (المؤشّرُ الزمنيّ إن كان ظاهرًا، وإلّا وسطُ النافذة).
    const playX = (state.t / span) * vw * prev - wrap.scrollLeft;
    const anchorX = anchorClientX !== undefined ? anchorClientX - rect.left : playX >= 0 && playX <= vw ? playX : vw / 2;
    const timeAtAnchor = ((wrap.scrollLeft + anchorX) / (vw * prev)) * span;
    zoomRef.current = z;
    // التمريرُ يُطبَّق **بعد** أن يُرسَم اللوحُ بعرضه الجديد (`useLayoutEffect` أدناه): لو طُبِّق
    // قبله لَقُصَّ على أقصى تمريرٍ للعرض القديم، فتنزلق المرساةُ إلى نصف زمنها — مقيسٌ.
    pendingScrollRef.current = { timeAtAnchor, anchorX };
    setTlZoom(z);
  };
  const pendingScrollRef = useRef<{ timeAtAnchor: number; anchorX: number } | null>(null);
  useLayoutEffect(() => {
    const wrap = trackWrapRef.current;
    const p = pendingScrollRef.current;
    if (!wrap || !p) return;
    pendingScrollRef.current = null;
    // ×١ لا تمريرَ فيه أصلًا — والعنصرُ ذو `overflow: hidden` يقبل `scrollLeft` برمجيًّا، فيُصفَّر صراحةً.
    wrap.scrollLeft = tlZoom <= 1 ? 0 : Math.max(0, (p.timeAtAnchor / span) * wrap.clientWidth * tlZoom - p.anchorX);
  }, [tlZoom, span]);
  // ⌘/Ctrl + العجلة تُكبّر حول المؤشّر — مستمعٌ أصليّ لأنّ عجلة React سلبيّةٌ لا تَمنع تكبيرَ الصفحة.
  useEffect(() => {
    const wrap = trackWrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.01), e.clientX);
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  });
  // والمؤشّرُ الزمنيّ لا يغيب عن النافذة: إن خرج منها (تشغيل، أسهم، قفزة) تبعته. **وعلى تغيُّر
  // الزمن وحده لا التكبير**: التكبيرُ له مرساتُه (`zoomTo`)، ولو تبع المؤشّرَ هنا أيضًا لانتزع
  // النافذةَ من تحت الفأرة إلى المؤشّر كلّما كُبِّر بالعجلة — مقيسٌ في `qa/timeline-zoom` §٦.
  useEffect(() => {
    const wrap = trackWrapRef.current;
    const z = zoomRef.current;
    if (!wrap || z <= 1) return;
    const vw = wrap.clientWidth;
    const x = (state.t / span) * vw * z;
    if (x < wrap.scrollLeft + 8 || x > wrap.scrollLeft + vw - 8) wrap.scrollLeft = Math.max(0, x - vw * 0.25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.t]);
  // عرضُ المسطرة بالبكسل، مقيسًا لا مُقدَّرًا — سُلَّمُ العلامات يَقرِّر خطوتَه
  // بالتباعد على الشاشة، فلا بدّ من العرض الحقيقيّ. و٦٠٠ أرضيّةٌ لأوّل تصيير
  // قبل أن يوجد العنصر، تُستبدَل بالمقيس فورًا عند أوّل تغيير مقاس.
  const [rulerW, setRulerW] = useState(600);
  useEffect(() => {
    const node = rulerRef.current;
    if (!node) return;
    const update = () => setRulerW(node.getBoundingClientRect().width || 600);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Layers list shows top-most element first, matching the array's z-order (last = topmost).
  const layers = [...state.elements].reverse();
  const selectedKfEl = selectedKf ? state.elements.find((e) => e.id === selectedKf.elId) : undefined;
  const selectedKfData = selectedKfEl && selectedKf ? selectedKfEl.anim.tracks[selectedKf.property]?.find((k) => k.id === selectedKf.kfId) : undefined;

  /** **ضامنُ إغلاقِ الإيماءة.** `onPointerUp`/`onKeyUp`/`onBlur` تُغلق إيماءةَ
   * القيمة في الحالات الثلاث التي يَمرّ بها إنسان. وهذا السطرُ للرابعة: مفتاحٌ
   * آخرُ يُحدَّد، أو تُغلَق المنبثقةُ، أو يُحذَف المفتاحُ من تحتها — فلو بقيت
   * لقطةُ ما قبل الإيماءة معلَّقةً لَنزلت بعد حينٍ فوق عملٍ آخر، فقفز التراجعُ
   * قفزةً لا يَفهمها أحد. و`commitElementEdit` لا تدفع شيئًا إن لم يتغيّر
   * المستند، فالإغلاقُ هنا بلا ثمن. */
  useEffect(() => {
    actions.commitElementEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKf?.elId, selectedKf?.property, selectedKf?.kfId]);

  /** **تحديدُ مفتاحٍ زال يُنسى.** تراجعٌ أو حذفُ عنصرٍ يُزيل المفتاحَ من المستند ويُبقي
   * هذه الحالةَ المحلّيّة تُشير إليه — وكانت إشارتُها اليتيمة تبتلع Delete (انظر
   * `onTrackKeyDown`). فمتى لم يبقَ للمفتاح وجودٌ رجعت إلى «لا شيء». */
  useEffect(() => {
    if (selectedKf && !selectedKfData) setSelectedKf(null);
  }, [selectedKf, selectedKfData]);

  // **تحديدُ عنصرٍ على اللوحة يُظهر صفَّه في الخطّ الزمنيّ.** كان المحدَّدُ يبقى خارج المنظر
  // (المستندُ بعشرات الطبقات)، فلا يُرى أيُّ مقطعٍ هو ولا متى يظهر. يُمرَّر إليه أقلَّ تمريرٍ يكفي.
  const lastSel = state.selectedIds[state.selectedIds.length - 1];
  useEffect(() => {
    if (!lastSel) return;
    const box = tracksScrollRef.current;
    const row = box?.querySelector<HTMLElement>(`[data-clip-row="${lastSel}-opacity"]`);
    if (!box || !row) return;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const bottom = top + row.getBoundingClientRect().height;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
    mirrorScroll(box, layersScrollRef.current);
  }, [lastSel]);

  // **لوحُ المفتاح يُغلَق كما تُغلَق كلُّ نافذةٍ عائمة:** بـEsc من أيّ مكان، وبضغطةٍ خارجه وخارج
  // الماسات. كان يبقى مفتوحًا فوق صفوف الطبقات (يغطّيها) حتى يُضغط مفتاحٌ آخر.
  useEffect(() => {
    if (!selectedKf) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      setSelectedKf(null);
    };
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as Element | null;
      if (t?.closest?.('[data-testid="kf-popover"], [data-testid^="kf-"]')) return;
      setSelectedKf(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [selectedKf]);

  // Cumulative top offset of each layer's row block, in track-column pixels below the
  // ruler — needed because expanded layers are taller than collapsed ones, so a flat
  // `rowIndex * CLIP_ROW_H` (the old formula) would misplace every row after the
  // first expanded one.
  const layerTop = new Map<string, number>();
  {
    let top = 0;
    for (const el of layers) {
      layerTop.set(el.id, top);
      top += layerRowHeight(el, expandedIds.has(el.id));
    }
  }

  const ladder = tickLadder(span, rulerW);

  const pauseIfPlaying = () => {
    if (state.playing) actions.togglePlay();
  };

  // **بالثواني.** كان الكسرُ هو عقدَ `scrubTo`، فكان على كلّ مُنادٍ أن يعرف طول
  // الخطّ ليحوّل موضعَ مؤشّرٍ إلى كسرٍ — ومع طولٍ مشتقّ لم يبقَ طولٌ يعرفه الجميع.
  const secondsFromClientX = (clientX: number, rect: DOMRect) => clamp((clientX - rect.left) / rect.width, 0, 1) * span;

  /** **الضغطةُ مطلوبةٌ هنا، فلا يُنفَّذ فعلُها الأصليّ.**
   *
   * كان السحبُ على السطح الزمنيّ يبدأ **تحديدَ نصٍّ** في المتصفّح مع التمرير،
   * فتُصطبغ علاماتُ الزمن بأزرق التحديد تحت الإصبع وتبقى مصطبغةً بعد رفعه.
   * قيسَ بسحبةٍ حقيقيّة قبل هذا السطر: `String(getSelection())` تُرجع `"0s"`
   * على المسطرة، و`"بدون"` على شريط المسارات — وهو نصُّ علامةٍ ونصُّ مقطع.
   *
   * و`preventDefault` على `pointerdown` هي ما يمنع ذلك: فعلُ الضغطة الأصليّ
   * (ومنه حدثُ الفأرة المتوافق الذي يَفتح التحديد) لا يُنفَّذ، فلا يُفتَح مدًى
   * أصلًا.
   *
   * **والتركيزُ يُنقَل باليد، وإلى السطح لا إلى المضغوط.** كان هذا السطر
   * `e.currentTarget.focus()`، وهو **لم يكن يفعل شيئًا**: المضغوطُ هو المسطرةُ
   * أو شريطُ المسارات أو مقبضُ المؤشّر، وليس في واحدٍ منها `tabIndex` — و`focus()`
   * على عنصرٍ غير قابلٍ للتركيز لا أثرَ له. والذي كان يُركّز السطحَ فعلًا هو
   * **فعلُ الضغطة الأصليّ**: المتصفّح يُركّز أقربَ سَلَفٍ قابلٍ للتركيز، وهو
   * حاوية `trackWrapRef` بـ`tabIndex={0}`. فمنعُ الفعل الأصليّ أسقط التركيزَ إلى
   * `document.body` ومعه مفاتيحُ النقل كلُّها (مسافة، أسهم، Home/End) — قيسَ:
   * `ArrowRight` بعد ضغطةٍ لا تُحرّك المؤشّرَ، و`activeElement` يصير `BODY`.
   * فيُنادى التركيزُ على الحاوية صريحًا، وهو **نفسُ ما كان المتصفّحُ يختاره**.
   * و`getBoundingClientRect` تبقى على المضغوط لا على الحاوية: هندسةُ السحب
   * مقيسةٌ على السطح الذي بُدئ عليه.
   *
   * وهي القاعدةُ القائمة في هذا المجلّد لا قاعدةً جديدة: `Clip.tsx:136` تفعلها
   * لضغطة صفّ المقطع. والثقوبُ الثلاثة التي بقيت كانت كلُّها تَصِل إلى هنا —
   * المسطرة، وخلفيّةُ المسارات، و**الفراغُ داخل صفّ مقطع** (`Clip.tsx:134`
   * يَرجع قبل `preventDefault` قصدًا فتصعد الضغطة إلى `timeline-tracks`).
   * فمَوضعُ الإصلاح واحد: مَصدرُ الحركة.
   *
   * ولا `user-select: none` على سطحٍ هنا: جُرّبت فأدّت الغرض، ثم قيسَ أن هذا
   * السطرَ وحده يُغلق الثقوبَ الثلاثة كلَّها — فالتصريحُ الأوسع لا يَشتري شيئًا
   * ويُطفئ تحديدَ نصوصٍ لم يَطلب أحدٌ إطفاءها. */
  const startScrub = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    trackWrapRef.current?.focus();
    pauseIfPlaying();
    const rect = e.currentTarget.getBoundingClientRect();
    actions.scrubTo(secondsFromClientX(e.clientX, rect));
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => actions.scrubTo(secondsFromClientX(ev.clientX, rect));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** ضغطُ المسطرة يمرّ بفاحص الإصابة نفسِه الذي تمرّ به صفوفُ المقاطع، فتكون
   * «أهذه مسطرةٌ أم صفٌّ أم حافّة؟» جوابًا من جدولٍ واحد لا من شجرةِ DOM. وهو
   * عقدُ محرّر خطٍّ زمنيٍّ مفتوح المعماريّ: المؤشّرةُ والتحويمُ والضغطةُ **والمواصفة** تقرأ
   * `hitTest` وحدها (`timeline_hit.rs:3-4`). */
  const onRulerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = hitTest({ x: e.clientX - rect.left, y: e.clientY - rect.top }, { width: rect.width, span, rulerHeight: rect.height }, []);
    if (hit.kind !== 'ruler') return;
    startScrub(e);
  };

  /**
   * **شريطُ التشغيل.** `Space` يُكمِل من المؤشّر، و`←`/`→` إطارٌ واحدٌ من إطارات
   * **المستند**، و`⇧` معهما خمسةٌ، و`Home`/`End` طرفا المستند.
   *
   * ولِمَ هي على **سطح الخطّ الزمنيّ** لا على النافذة كلّها، وهذا قرارٌ مُعلَن:
   * المفتاحان مأخوذان أصلًا بمعنًى آخر لا يجوز نقضُه — `Space` هو «اسحب اللوحة»
   * على اللوحة (`Stage.tsx:119`)، والأسهمُ تُزحزح العنصرَ المحدَّد
   * (`Stage.tsx:233-246`). فربطُهما على النافذة كان سيُنتج معنيَين لمفتاحٍ واحد،
   * وهو بعينه ما تَمنعه قاعدةُ «لا وضعَ صامتًا». والسطحُ هنا قابلٌ للتركيز أصلًا
   * (`tabIndex={0}`) وكان يملك الأسهمَ وحدها، فهذا توسيعُ ما هو قائم.
   *
   * و`stopPropagation` ليس تجميلًا: الأسهمُ كانت تُنفَّذ **مرّتين** — نقلُ المؤشّر
   * هنا وزحزحةُ العنصر على مُستمِع النافذة في `Stage.tsx` — فسهمٌ واحدٌ يُحرّك
   * الزمنَ والعنصرَ معًا. وإيقافُ الانتشار عند حاوية React يَمنع مُستمِعي النافذة،
   * فيبقى للمفتاح معنًى واحدٌ حيث للسطح تركيز.
   */
  const onTrackKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      pauseIfPlaying();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      // إطارٌ واحدٌ **بمعدّل المستند**، لا `1/30` مثبَّتًا. وأثرُ تثبيته مقيس
      // (`re-effectcraft-source.md:549-552`): عند تصديرٍ بـ٢٤ إطارًا يهبط مفتاحٌ
      // وُضِع بالسهم بين إطارَي مخرَج، فيُظهر الإطارُ الأوّل قيمةً مُستَقرَأة لا
      // قيمةَ المفتاح نفسه.
      // و`⇧` خمسةُ إطارات: خطوةٌ أكبر لا وحدةٌ أخرى، فيبقى كلُّ موضعٍ على الشبكة.
      //
      // **ويُحسَب الهدفُ رقمَ إطارٍ ثم يُحوَّل زمنًا** (`timeOfFrame`)، لا جمعًا متراكمًا.
      // كان `t + frame×5` يجمع خطأَ التقريب في كلّ ضغطة: ستُّ ضغطاتٍ من الصفر بلغت
      // ٠٫٩٩٩٩٩٩٩٩٩٩٩٩٩٩٩ لا ١، فوقف المؤشّرُ «عند الثانية» قبلها بجزءٍ من التريليون —
      // ورُسم «نهاية الخط» ٩٩٫٩٩٩٩٩٪ لا كاملًا.
      //
      // ورقمُ الإطار الحاليّ **عددٌ صحيحٌ تامٌّ متى كان المؤشّرُ على الشبكة** (يُقرَّب ما
      // انحرف عنها بجزءٍ من المليون)، **وكسرٌ كما هو متى كان بين إطارين**: فالخطوةُ إطارٌ
      // كاملٌ من الموضع نفسِه في الحالتين، و→ ثم ← يرجعان إليه بالضبط — وهما قراران
      // تقيسهما `qa/phase1-representation` و`qa/phase2-live-clips`.
      const raw = state.t * state.fps;
      const nearest = Math.round(raw);
      const cur = Math.abs(raw - nearest) < 1e-6 ? nearest : raw;
      const steps = e.shiftKey ? 5 : 1;
      actions.scrubTo(timeOfFrame(Math.max(0, cur + dir * steps), state.fps));
    } else if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      pauseIfPlaying();
      actions.scrubTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      pauseIfPlaying();
      // نهايةُ **المستند** لا نهايةُ مدى المسطرة: الأولى آخرُ لحظةٍ تدخل الملفَّ
      // المُصدَّر، والثانية أرضيّةُ منظرٍ مُظلَّلةٌ مُعلَنٌ أنها خارجه.
      actions.scrubTo(docDuration);
    } else if (e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      // `togglePlay` يُكمِل من المؤشّر ولا يَرجع إلى الصفر إلّا إن كان المؤشّر عند
      // النهاية — العطل ٦ في `qa/motion-journey.spec.mjs`، مُغلَقٌ في المرحلة ١؛
      // وهذا هو المفتاحُ الذي كان ينقصه.
      actions.togglePlay();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedKf && selectedKfData) {
      // **المفتاحُ المحدَّد يجب أن يكون موجودًا ليبتلع Delete.** كان الشرطُ `selectedKf`
      // وحده، وهي حالةٌ محلّيّةٌ تبقى بعد أن يزول مفتاحُها (تراجعٌ، أو حذفُ عنصره):
      // فكان Delete يذهب إلى حذفِ مفتاحٍ غير موجود ويُوقف انتشارَه، فلا يُحذف المقطعُ
      // المحدَّد ولا يحدث شيءٌ على الإطلاق. ظهر حين قُسِم مقطعٌ بعد تراجعٍ عن مفتاح.
      // والمحذوفُ المتروكُ يُنظَّف في الأثر أدناه.
      e.preventDefault();
      e.stopPropagation();
      actions.deleteTrackKeyframe(selectedKf.elId, selectedKf.property, selectedKf.kfId);
      setSelectedKf(null);
    }
  };

  /** المقطعُ المحدَّد، وهو ما يُقسَّم. ومستندٌ بلا تحديدٍ لا شيءَ فيه يُقسَّم —
   * فيقول الزرُّ ذلك بدل أن يُضغَط فلا يحدث شيء. */
  const splitTarget = state.sel ? state.elements.find((e) => e.id === state.sel) : undefined;
  const splitPossible = !!splitTarget && !splitTarget.locked && canSplitAt(splitTarget.anim, state.t, { fps: state.fps });
  const splitTitle = !splitTarget
    ? L.split_no_selection
    : splitTarget.locked
      ? L.split_locked
      : !splitPossible
        ? L.split_outside
        : `${L.split_clip} (⌘B) — ${L.split_consequence}`;

  // مُنسِّقٌ حقيقيّ. كان البادئةُ `00:0` مكتوبةً بالحرف، فكان صحيحًا تحت العشر
  // ثوانٍ ولا شيءَ غير ذلك — وهو ما لم يكن ظاهرًا حين كان الخطّ لا يتجاوز الخمس.
  const tLabel = formatClock(state.t);

  // **لا اشتقاقَ محليًّا للطبيعة هنا، ولا مقارنةً عليها.** كان هذا الملفّ يحتسب
  // `sizeAt(...).kind` بنفسه ومستهلكاه شارةٌ ولافتة — أي أنّ الجوابَ كان يُحتسَب
  // ثم لا يَحمل شيئًا. وقد صار حقلًا في المستند (`DocSnapshot.medium`) تتفرّع عليه
  // ثلاثةُ أسطحٍ بعينها: وجودُ الخطّ الزمنيّ (`App.tsx`)، وقائمةُ الشريط
  // (`ToolRail.tsx`)، ووجهاتُ التصدير (`ExportDialog.tsx`).
  //
  // ولذلك **لا شرطَ هنا**: هذا المكوّن لا يُركَّب إلّا على مستندٍ مُوقَّت، فشرطُ
  // «أمُوقَّتٌ هو؟» داخله سؤالٌ جوابه معلومٌ سلفًا — وموضعٌ رابعٌ يتفرّع عليه.
  // والشارةُ تُعلن الطبيعةَ والمدّةَ المشتقّة لا الرقمَ ٥.

  /** اسم الطبقة كما يقرأه المصمّم: ترجمةٌ مُسمّاة لعناصر البوستر الجاهز، وإلا اسمٌ
   * مشتقٌّ من المحتوى.
   *
   * كان السطر الأخير يُلحِق شظيّةً من المعرّف الخام، وهي لعنصرٍ معرّفه
   * `text-1792312169118` **طابعٌ زمنيّ من ١٣ رقمًا**: أربع طبقات نصّ تعني أربعة
   * أسماء لا يفرّق بينها إلا رقمٌ بلا معنى. البند ٨ في
   * `docs/UX-AUDIT-2026-10-18.md`، ومحرّر فيديو شائع تَعرض محتوى النص على المقطع نفسه
   * (`re-capcut-flows.md` §2.8).
   *
   * اصطدمت رحلتا الحملة والفيديو على هذا السطر لأنهما اكتشفتا العطل نفسه
   * مستقلّتين. المُبقى هو `elementDisplayName` المشترك لا النسخة المضمّنة: فهو
   * مصدرٌ واحد تستعمله `TemplatesDialog` أيضًا، ويغطّي ما لا تغطّيه تلك —
   * الاسم المخصّص بعد إعادة التسمية، وتسمية الشكل المخبوزة، ونوعه الهندسي،
   * والمجموعات. */
  const labelFor = (el: DocElement) => {
    const key = `l_${el.id}` as const;
    if (key in L) return L[key as keyof typeof L] as string;
    return elementDisplayName(el, L);
  };

  const propLabel = (p: AnimProperty) => L[`prop_${p}` as keyof typeof L] as string;

  const onDrop = (e: DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const arrayIdx = state.elements.findIndex((el) => el.id === targetId);
    actions.reorderElement(dragId, arrayIdx);
    setDragId(null);
  };

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div
      data-testid={docked ? 'layers-dock' : 'timeline-panel'}
      style={{
        flex: 'none',
        height: docked ? (state.layersOpen ? 'min(46%, 340px)' : 40) : state.tlOpen ? 248 : 40,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--surface)',
        borderTop: '1px solid var(--line)',
        transition: 'height .25s ease',
      }}
    >
      <div style={{ height: 40, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderBottom: '1px solid var(--line)' }}>
        <button
          onClick={docked ? actions.toggleLayers : actions.toggleTimeline}
          title={L.collapse}
          aria-label={L.collapse}
          style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}
        >
          <Icon size={16} path="M5 8l5 5 5-5" style={{ transform: (docked ? state.layersOpen : state.tlOpen) ? 'none' : 'rotate(180deg)', transition: 'transform .25s' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: 12 }}>{timed ? L.timeline : L.layers}</span>
        <span
          data-testid="timeline-medium"
          data-medium={state.medium}
          // والمدّةُ تُكتب للمُوقَّت فقط: كتابةُ رقمِ ثوانٍ على بوسترٍ ثابت رقمٌ
          // بلا معنى، وهذا هو العقدُ الذي تقيسه `qa/start-screen.spec.mjs`.
          data-duration={timed ? Math.round(docDuration * 1000) / 1000 : ''}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 20,
            padding: '0 7px',
            flex: 'none',
            borderRadius: 999,
            background: timed ? 'var(--accentSoft)' : 'var(--surface2)',
            color: timed ? 'var(--accentText)' : 'var(--muted)',
            fontSize: 10.5,
            fontWeight: 600,
          }}
        >
          <Icon size={11} path={timed ? ICONS.video : ICONS.image} />
          {timed ? `${L.h_timed} · ${formatDurationSec(docDuration, state.lang)}` : L.h_still}
        </span>
        {timed && (
        <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 8, marginInlineStart: 6 }}>
          {/* Icon-only, so it needs a real accessible name. Without one it announces
              as just "button" to VoiceOver, shows no tooltip on hover, and cannot be
              found by the name a user would look for — which is how this gap
              surfaced (18 October 2026, walking the app as a new user). The label
              names the action the next press performs, not the current state. */}
          <button
            data-testid="timeline-play-btn"
            onClick={actions.togglePlay}
            aria-label={state.playing ? L.tl_pause : L.tl_play}
            title={state.playing ? L.tl_pause : L.tl_play}
            aria-pressed={state.playing}
            style={{ width: 28, height: 28, border: 0, borderRadius: '50%', background: 'var(--accent)', color: 'var(--onAccent)', display: 'grid', placeItems: 'center' }}
          >
            <Icon size={14} fill="currentColor" path={state.playing ? 'M6 4v12M14 4v12' : 'M6 4l10 6-10 6z'} />
          </button>
          <span data-testid="timeline-time" data-t={state.t.toFixed(3)} style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--muted)', minWidth: 60 }}>{tLabel}</span>
          {/* **التقسيم له سطحٌ يُرى، لا اختصارٌ وحده.** و`⌘B` ليس بديلًا عنه:
              قاعدةُ محرّر فيديو شائع `B` موجودةٌ على زرٍّ هناك أيضًا، ومَن لا يعرف الاختصارَ
              لا يجد القدرةَ أصلًا.

              **وتلميحُه يقول ما يُنتجه قبل أن يُضغَط** — «يُنتج عنصرين منفصلين
              بالنصّ نفسه». وهذا ليس تزيينًا: التقسيم في نموذج مزيج **مضاعفةُ
              عنصر**، فهو بابٌ جديدٌ إلى الحدّ الموثَّق «لونان في عنصر نصٍّ واحد»
              (§5.4) — وتكاليفُه هناك مكتوبةٌ في `docs/CONTROLS.md:45`. فيُعلَن
              لا يُكتشَف.

              والمعطَّلُ يقول سببَه: لا تحديد، أو عنصرٌ مقفول، أو مؤشّرٌ خارج
              المقطع — ثلاثُ رسائلَ لا صمتٌ واحد. */}
          <button
            data-testid="timeline-split-btn"
            onClick={() => actions.splitAtPlayhead()}
            disabled={!splitPossible}
            aria-label={L.split_clip}
            title={splitTitle}
            style={{
              height: 24,
              padding: '0 8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              border: '1px solid var(--line)',
              borderRadius: 'var(--rs)',
              background: 'var(--surface2)',
              color: 'var(--text)',
              fontSize: 11,
              opacity: splitPossible ? 1 : 0.45,
            }}
          >
            <Icon size={13} path="M10 2v6M10 12v6M4 10h12M7 7l3 3-3 3" />
            {L.split_clip}
          </button>
          <div data-testid="tl-zoom" data-zoom={tlZoom} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: 24, padding: '0 2px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)' }}>
            <button data-testid="tl-zoom-out" onClick={() => zoomTo(tlZoom / 2)} disabled={tlZoom <= TL_ZOOM_MIN} title={L.tl_zoom_out} aria-label={L.tl_zoom_out} style={{ width: 22, height: 20, border: 0, background: 'transparent', color: 'var(--text)', fontSize: 14, lineHeight: 1, opacity: tlZoom <= TL_ZOOM_MIN ? 0.4 : 1 }}>−</button>
            <span data-testid="tl-zoom-level" style={{ minWidth: 30, textAlign: 'center', fontSize: 10.5, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>×{Math.round(tlZoom * 10) / 10}</span>
            <button data-testid="tl-zoom-in" onClick={() => zoomTo(tlZoom * 2)} disabled={tlZoom >= TL_ZOOM_MAX} title={L.tl_zoom_in} aria-label={L.tl_zoom_in} style={{ width: 22, height: 20, border: 0, background: 'transparent', color: 'var(--text)', fontSize: 14, lineHeight: 1, opacity: tlZoom >= TL_ZOOM_MAX ? 0.4 : 1 }}>+</button>
            <button data-testid="tl-zoom-fit" onClick={() => zoomTo(1)} disabled={tlZoom === 1} title={L.tl_zoom_fit} style={{ height: 20, padding: '0 6px', border: 0, borderInlineStart: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontSize: 10.5, opacity: tlZoom === 1 ? 0.4 : 1 }}>{L.tl_zoom_fit}</button>
          </div>
        </div>
        )}
        <div style={{ flex: 1 }} />
        {/* حركة الدخول متاحة في الوضعين: في «بسيط» هي **الطريق الوحيد** إلى الحركة
            (لا مفاتيح ولا مسارات هناك)، وفي «احترافي» هي نقطة البداية التي تُضبَط
            مفاتيحها بعد ذلك. وهي مربوطة بالتحديد لا بالوضع، مثل `EasingMenu` بجانبها. */}
        {/* حركةُ الدخول والمنحنى سطحانِ زمنيّان: لا يُعرَضان على مستندٍ ساكن. */}
        {timed && <AnimPresetMenu />}
        {timed && <EasingMenu />}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div ref={layersScrollRef} onScroll={() => mirrorScroll(layersScrollRef.current, tracksScrollRef.current)} style={{ width: timed ? 200 : '100%', flex: timed ? 'none' : 1, borderInlineEnd: timed ? '1px solid var(--line)' : 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {/* صفٌّ بارتفاع المسطرة يحاذي الطبقات بمساراتها — ولا مسطرة لمستندٍ ساكن،
              والعنوان «الطبقات» مكتوبٌ فوقه أصلًا. */}
          {timed && <div style={{ height: RULER_H, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 11, color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>{L.layers}</div>}
          {layers.map((el) => {
            const selected = state.selectedIds.includes(el.id);
            const color = colorForLayer(el.id);
            const expanded = expandedIds.has(el.id);
            return (
              <div key={el.id} style={{ height: layerRowHeight(el, expanded), flex: 'none' }}>
                <div
                  data-layer-id={el.id}
                  // التحديدُ مقروءٌ لا مُستنتَجًا من لونِ خلفيّة: المعيار B6 يسأل
                  // «أيُّ النصفين محدَّد بعد التقسيم؟» وهو سؤالٌ عن حالةٍ لا عن لون.
                  data-selected={selected ? 'true' : 'false'}
                  // صفٌّ قابلٌ للسحب (إعادة الترتيب) إلا أثناء تسميته: سحبةٌ داخل حقل الاسم
                  // يجب أن تُحدِّد نصّه، لا أن تحمل الصفّ كلّه. كان السحبُ احترافيًّا وحده
                  // فلم يلتقِ بالحقل في الوضع الافتراضي؛ صار للجميع (٢٤ أكتوبر ٢٠٢٦).
                  draggable={renamingId !== el.id}
                  onDragStart={() => setDragId(el.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, el.id)}
                  style={{ display: 'flex', alignItems: 'stretch', height: CLIP_ROW_H, borderBottom: '1px solid var(--line)', background: selected ? 'var(--accentSoft)' : 'transparent' }}
                >
                  {/* العين والقفل في **الوضعين**، لا في الاحترافي وحده. كان الإخفاء
                      مشروطًا بـ`isPro`، والوضع البسيط هو الافتراضي — فأكثر إجراءَي
                      تنظيمٍ شيوعًا كانا غير موجودَين لمن لم يبدّل الوضع، وهو لا يعرف
                      أصلًا أن هناك ما يُبدَّل (البند ٧ في جرد تجربة المستخدم). */}
                  <button
                    data-testid={`layer-visible-${el.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.toggleVisible(el.id);
                    }}
                    title={el.visible ? L.hide_layer : L.show_layer}
                    aria-label={el.visible ? L.hide_layer : L.show_layer}
                    aria-pressed={!el.visible}
                    style={{ width: 22, flex: 'none', border: 0, background: 'transparent', color: el.visible ? 'var(--muted)' : 'var(--line)', display: 'grid', placeItems: 'center' }}
                  >
                    <Icon size={13} path={el.visible ? 'M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5zM10 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z' : 'M3 3l14 14M9.5 5.2A8 8 0 0 1 18 10s-1 1.8-2.8 3.2M5 6.5C3.4 7.7 2 10 2 10s3 5 8 5c1 0 1.9-.2 2.7-.5'} />
                  </button>
                  <button
                    data-testid={`layer-lock-${el.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.toggleLocked(el.id);
                    }}
                    title={el.locked ? L.unlock_layer : L.lock_layer}
                    aria-label={el.locked ? L.unlock_layer : L.lock_layer}
                    aria-pressed={el.locked}
                    style={{ width: 22, flex: 'none', border: 0, background: 'transparent', color: el.locked ? 'var(--accentText)' : 'var(--line)', display: 'grid', placeItems: 'center' }}
                  >
                    <Icon size={13} path={el.locked ? 'M5 9V6.5a5 5 0 0 1 10 0V9M4 9h12v8H4z' : 'M5 9V6.5a5 5 0 0 1 9.6-2M4 9h12v8H4z'} />
                  </button>
                  {renamingId === el.id ? (
                    // إعادة التسمية في مكان الاسم نفسه — لا حوار ولا لوح جانبي.
                    <input
                      data-testid={`layer-rename-input-${el.id}`}
                      autoFocus
                      defaultValue={el.name ?? ''}
                      placeholder={labelFor(el)}
                      title={L.rename_hint}
                      onBlur={(e) => { actions.renameElement(el.id, e.currentTarget.value); setRenamingId(null); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { actions.renameElement(el.id, e.currentTarget.value); setRenamingId(null); }
                        else if (e.key === 'Escape') setRenamingId(null);
                      }}
                      style={{ flex: 1, minWidth: 0, margin: '0 6px', height: 22, padding: '0 6px', border: '1px solid var(--accent)', borderRadius: 'var(--rs)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, outline: 0 }}
                    />
                  ) : (
                  <button
                    // معرّفٌ ثابت لزرّ الاسم. كانت المواصفات تنقر `button` بترتيبه
                    // داخل السطر (`.nth(1)`/`.first()`)، فأيّ زرٍّ جديد في السطر —
                    // كزرّ القفل — يزيح الترتيب ويحوّل «حدّد الطبقة» إلى «اقفلها».
                    // الترتيب ليس عقدًا؛ المعرّف هو.
                    data-testid={`layer-name-${el.id}`}
                    // ⇧/⌘ مع النقرة **يضيف إلى التحديد** أو يُزيل منه، كما في قائمة طبقات كلّ
                    // برنامجٍ يعرفه المصمّم. كانت النقرةُ تستبدل التحديد دائمًا، فلم يكن من
                    // القائمة طريقٌ إلى تحديد مشهدٍ من صورةٍ ونصّين لتوقيته معًا.
                    onClick={(e) => actions.selectElement(el.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                    // النقرة المزدوجة تُعيد التسمية، كما في كل قائمة طبقاتٍ يعرفها المصمّم.
                    onDoubleClick={(e) => { e.stopPropagation(); setRenamingId(el.id); }}
                    // التلميح هو الاسم الكامل وحده. كان يضمّ «إعادة تسمية» للدلالة
                    // على النقرة المزدوجة، فصار كل سطر طبقةٍ يطابق البحث عن زرّ
                    // «إعادة» (التراجع) — التلميح فضاءُ أسماءٍ مشترك، ولا يجوز أن
                    // يحمل فعلًا عامًّا. والدلالة على التسمية مكانها حقل الإدخال
                    // نفسه (`L.rename_hint`)، والنقرة المزدوجة عُرفٌ قائم أصلًا.
                    title={labelFor(el)}
                    style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', border: 0, background: 'transparent', color: 'var(--text)', fontSize: 12, textAlign: 'start', opacity: el.visible ? 1 : 0.45 }}
                  >
                    {el.type === 'fx' ? (
                      // طبقةُ المؤثّر تُعرف بنجمتها: لا لونَ لها على اللوحة.
                      <Icon size={12} path={ICONS.fx} style={{ color, flex: 'none' }} />
                    ) : el.type === 'audio' ? (
                      // طبقةُ الصوت تُعرف بموجتها لا بمربّع لون: لا شيءَ على اللوحة يحمل لونها.
                      <Icon size={12} path="M3 8v4M6.5 5v10M10 3v14M13.5 6v8M17 8.5v3" style={{ color, flex: 'none' }} />
                    ) : (
                      <span style={{ width: 8, height: 8, borderRadius: el.groupId ? '50%' : 2, background: color, flex: 'none' }} />
                    )}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelFor(el)}</span>
                    {/* العضوية في مجموعة تُقرأ من السطر مباشرة: القائمة مسطّحة، فلو لم
                        يُعلَن الانتماء لصار «لماذا تحرّك معه عنصرٌ آخر؟» لغزًا. */}
                    {el.groupId && (
                      <Icon size={12} path="M3 6h6v6H3zM8 8h6v6H8z" style={{ color: 'var(--muted)', flex: 'none' }} />
                    )}
                    {el.type === 'video' && (
                      // Roadmap #14: the real trimmed window within the *source file*
                      // (seconds), not a position on the document timeline — shown as
                      // plain text rather than a proportional bar inside the clip body
                      // below, since the two use unrelated scales (the clip body's
                      // width is the element's entrance-animation clip on the document
                      // timeline, not the source media's own duration) and a bar here
                      // would misrepresent one as the other.
                      <span data-testid={`video-trim-badge-${el.id}`} dir="ltr" style={{ fontSize: 9.5, color: 'var(--muted)', flex: 'none' }}>
                        {el.trimIn.toFixed(1)}–{el.trimOut.toFixed(1)}s
                      </span>
                    )}
                    {timed && el.type !== 'audio' && <Icon size={13} path="M10 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM10 8v3l2 1M8 3h4" style={{ color: hasCustomAnimation(el.anim.tracks) ? 'var(--accentText)' : 'var(--muted)' }} />}
                  </button>
                  )}
                  {timed && (
                    <button
                      data-testid={`expand-${el.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(el.id);
                      }}
                      title={expanded ? L.collapse_tracks : L.expand_tracks}
                      style={{ width: 18, flex: 'none', border: 0, background: 'transparent', color: 'var(--muted)', display: 'grid', placeItems: 'center' }}
                    >
                      <Icon size={11} path="M5 8l5 5 5-5" style={{ transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                    </button>
                  )}
                </div>
                {expanded &&
                  expandablePropertiesFor(el).map((p) => (
                    <div key={p} style={{ height: PROP_ROW_H, display: 'flex', alignItems: 'center', padding: '0 10px 0 28px', fontSize: 10.5, color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>
                      {propLabel(p)}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>

        {/* **كلُّ السطح الزمنيّ**: المسطرةُ والمسارات والمؤشّرُ ولوحُ المفتاح.
            محجوبٌ عن المستند الساكن، وهو ما يقيسه المعيار A7 بغياب
            `[data-testid="timeline-tracks"]` من DOM. وما يبقى فوقه قائمةُ
            الطبقات، وهي ليست سطحًا زمنيًّا — انظر `App.tsx`. */}
        {timed && (
        <div
          ref={trackWrapRef}
          dir="ltr"
          tabIndex={0}
          onKeyDown={onTrackKeyDown}
          style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column', overflowX: tlZoom > 1 ? 'auto' : 'hidden', overflowY: 'hidden', outline: 'none' }}
        >
          <div data-testid="timeline-canvas" style={{ position: 'relative', width: `${tlZoom * 100}%`, minWidth: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div ref={rulerRef} data-testid="timeline-ruler" data-span={span} onPointerDown={onRulerPointerDown} style={{ height: RULER_H, flex: 'none', position: 'relative', borderBottom: '1px solid var(--line)', cursor: 'ew-resize', touchAction: 'none' }}>
            {ladder.ticks.map((t) => {
              const isLabel = Math.abs(t / ladder.labelStride - Math.round(t / ladder.labelStride)) < 1e-9;
              return (
                <div
                  key={t}
                  data-tick={t}
                  data-label={isLabel ? 'true' : 'false'}
                  style={{ position: 'absolute', left: `${(t / span) * 100}%`, top: 0, height: isLabel ? '100%' : '45%', bottom: 0, display: 'flex', alignItems: 'flex-end', gap: 4, paddingBottom: 4, borderLeft: '1px solid var(--line)' }}
                >
                  {isLabel && <span style={{ fontSize: 10, color: 'var(--muted)', paddingLeft: 4, fontVariantNumeric: 'tabular-nums' }}>{tickLabel(t)}</span>}
                </div>
              );
            })}
          </div>
          {/* **الفراغُ بعد نهاية المستند، مُعلَنًا لا مكتومًا.**
              طولُ المستند مشتقٌّ من مقاطعه، ومدى المسطرة لا يَقِلّ عن
              `DEFAULT_CLIP_DURATION` كي يبقى موضعٌ تُسحَب إليه المقاطع
              (`timelineSpan`). فيبقى على مستندٍ قصيرٍ مدًى **لا يدخل الملفّ
              المُصدَّر**، والسكوتُ عنه هو بعينه «الشاشة تقول شيئًا والملفّ يقول
              آخر». فيُظلَّل ويُقال سببُه في تلميحه. */}
          {docDuration < span && (
            <div
              data-testid="timeline-beyond-doc"
              data-from={Math.round(docDuration * 1000) / 1000}
              title={L.tl_beyond_doc}
              style={{
                position: 'absolute',
                top: RULER_H,
                bottom: 0,
                left: `${(docDuration / span) * 100}%`,
                right: 0,
                background: 'repeating-linear-gradient(135deg, transparent 0 5px, rgba(127,127,127,.09) 5px 10px)',
                borderInlineStart: '1px dashed var(--line)',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          )}
          <div ref={tracksScrollRef} onScroll={() => mirrorScroll(tracksScrollRef.current, layersScrollRef.current)} data-testid="timeline-tracks" onPointerDown={startScrub} style={{ flex: 1, position: 'relative', cursor: 'ew-resize', overflowY: 'auto', touchAction: 'none' }}>
            {/* **البوّابةُ سقطت عن المقطع نفسه.** كان هذا الفرعُ يرسم في الوضع
                البسيط شريطًا ساكنًا عند `opacity: .35` لا يُنقَل ولا يُقلَّم،
                والوضعُ البسيط هو الافتراضيّ (`src/state/types.ts`) — فالمستندُ
                المُوقَّت كان يُظهر شيئًا يُشبه المقطعَ ولا يَفعل ما يَفعله.
                وهو البند ٧ في `docs/UX-AUDIT-2026-10-18.md` («وضعان يغيّران ما هو
                موجود بصمت»)، مُغلَقٌ للخطّ الزمنيّ بعينه لا عمومًا.

                و`pro` تَمرّ دعامةً لأنّ المفاتيحَ تبقى احترافيّة: الوضعُ البسيط
                لا ماساتَ فيه ولا صفوفَ خصائصَ ولا زرَّ «مفتاح عند المؤشّر» —
                وطريقُه إلى الحركة حركةُ الدخول، كما كان. انظر ترويسة `Clip`. */}
            {layers.map((el) => (
              <Clip key={el.id} el={el} color={colorForLayer(el.id)} expanded={expandedIds.has(el.id)} pro selectedKf={selectedKf} onSelectKf={setSelectedKf} />
            ))}
          </div>
          <div
            data-testid="timeline-playhead"
            onPointerDown={startScrub}
            style={{ position: 'absolute', top: 0, bottom: 0, left: `${playheadPct.toFixed(2)}%`, width: 1.5, background: 'var(--accent)', pointerEvents: 'none', zIndex: 2 }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: -9,
                width: 19,
                height: 12,
                pointerEvents: 'auto',
                cursor: 'ew-resize',
                touchAction: 'none',
              }}
              onPointerDown={startScrub}
            >
              <div style={{ position: 'absolute', left: 4, top: 0, width: 11, height: 12, background: 'var(--accent)', clipPath: 'polygon(0 0,100% 0,100% 60%,50% 100%,0 60%)' }} />
            </div>
          </div>

          {timed &&
            selectedKf &&
            selectedKfData &&
            selectedKfEl &&
            (() => {
              const propIdx = selectedKf.property === 'opacity' ? -1 : expandablePropertiesFor(selectedKfEl).indexOf(selectedKf.property);
              const rowTopWithinLayer = propIdx === -1 ? 0 : CLIP_ROW_H + propIdx * PROP_ROW_H;
              const rowTop = RULER_H + (layerTop.get(selectedKfEl.id) ?? 0) + rowTopWithinLayer;
              // Anchored to the selected keyframe's own row, offset clear of its lane
              // (above it, or below when there isn't room above — never sitting on top
              // of the diamond itself, which would swallow the next drag's pointerdown
              // before it ever reaches the keyframe). "Above" uses translateY(-100%) so
              // the popover's *bottom* edge — not a fixed-height guess — sits clear of
              // the row, since its height varies (value row, easing row, and an optional
              // bezier editor when a keyframe's easing is 'custom').
              const placeBelow = rowTop - RULER_H < 90;
              const [min, max] = sliderRange(selectedKf.property, selectedKfEl);
              // **رقمٌ واحدٌ يُغذّي السطحَين.** القيمةُ المخزونةُ تُحوَّل إلى الوحدة
              // المعروضة وتُقصَر على الشبكة **مرّةً واحدة**، ثم تَقرأ المِمسحةُ
              // والحقلُ والمقياسُ هذا الرقمَ بعينه. ولو حَسَب كلُّ سطحٍ لنفسه لَجاز
              // أن تَعرض المِمسحةُ `1` والحقلُ `0.74` عن القيمة الواحدة — وهو
              // مقيسٌ: هكذا يَفعل `range` بلا `step`.
              const display = kfValueToDisplay(selectedKf.property, quantizeKfValue(selectedKf.property, selectedKfData.value));
              // **قُمعُ الكتابة في هذه المنبثقة.** السطحانِ لا يُناديان الفعلَ
              // مباشرةً: يَمرّان من هنا، فيُفتَح للإيماءة اسمٌ مرّةً واحدة
              // (`beginElementEdit` مُتعادِيةُ الاستدعاء) ثم تُكتَب القيمةُ حيّةً
              // بلا تاريخ. والإغلاقُ عند الإفلات أو الخروج من الحقل، فتَنزل
              // **خطوةٌ واحدةٌ مُسمّاة** — وهي قاعدةُ `pushHistory` بالحرف.
              //
              // و`clamp` على المدى المعروض **داخلَ القُمع لا على المِمسحة**: فعلُ
              // `range` الأصليُّ يَقصُر على `min`/`max` بنفسه، و`number` لا يَقصُر
              // (السمّتان عليه إرشادٌ لا حَدّ). فلولا هذا السطرُ لَقَبِل الحقلُ
              // ١٥٠٪ وخزّنها، وعرضت المِمسحةُ ١٠٠٪ عن القيمة نفسِها. والمدى هو
              // مدى المِمسحة لا مدى النموذج، لأنّ المقصودَ **ألّا يَفترق سطحان عن
              // قيمةٍ كتبها هذا اللوحُ** — وقيمةٌ كتبها غيرُه تبقى كما هي، كما
              // يقول تعليقُ `sliderRange` عن الضبابيّة.
              const writeValue = (next: number) => {
                actions.beginElementEdit(L.kf_set_value);
                actions.liveUpdateTrackKeyframeValue(selectedKf.elId, selectedKf.property, selectedKf.kfId, kfValueFromDisplay(selectedKf.property, clamp(next, min, max)));
              };
              return (
                <AnchoredPopover
                  testId="kf-popover"
                  // مُرساةٌ على الماسة نفسها، بالجهة التي كانت تُختار (فوق صفّها، أو تحته
                  // قرب أعلى اللوح) ما دامت تتّسع في النافذة — انظر ترويسة `AnchoredPopover`.
                  anchorSelector={`[data-testid="kf-${selectedKfEl.id}-${selectedKf.kfId}"]`}
                  prefer={placeBelow ? 'below' : 'above'}
                  // **مفاتيحُ الحقلِ تَبقى للحقل.** `onTrackKeyDown` على الحاضن
                  // يَملك `←`/`→` و`Home`/`End` لتنقّلِ الإطارات ويُنادي
                  // `preventDefault` — فبدون هذا السطر لا يَتحرّك مؤشّرُ الكتابة
                  // داخلَ رقمٍ مكتوب، ولا تَصِل المِمسحةَ سهمٌ أفقيّ. والإيقافُ
                  // محدودٌ بما صدر عن مُدخَلٍ داخل المنبثقة، فيبقى للحاضن ما هو
                  // له متى لم يكن أحدٌ يَكتب. (أحداثُ React تعبر البوّابة إلى الحاضن.)
                  //
                  // **و`Escape` يُغلقها** كما يُغلق كلَّ منبثقةٍ أخرى في البرنامج (`EasingMenu`،
                  // قائمةُ المقاس، شريطُ السياق). كان يَصِل مُدخَلًا مركَّزًا فيتركه المعالجُ
                  // العامّ (`editable`) ولا يحدث شيء، فتبقى المنبثقةُ مفتوحةً فوق صفوفٍ
                  // يُراد نقرُها. وما كُتب حيًّا يُلزَم عند زوال الحقل خطوةً مسمّاة.
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedKf(null);
                      return;
                    }
                    if ((e.target as HTMLElement).tagName === 'INPUT') e.stopPropagation();
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: '6px 8px',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--rs)',
                    background: 'var(--surface)',
                    boxShadow: 'var(--shadow)',
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--muted)', minWidth: 42 }}>{propLabel(selectedKf.property)}</span>
                    {/* الطريقُ السريع. و`onChange` تُنادي `beginElementEdit`
                        فتُغطّي تغييرَ المِمسحة بالسهمَين أيضًا — وهو مسارٌ لا يمرّ
                        بـ`onPointerDown` إطلاقًا؛ نمطُ `fx-blur` نفسُه في
                        `PropsTab.tsx`. */}
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={KF_VALUE_STEP}
                      value={display}
                      data-testid="kf-value-slider"
                      onChange={(e) => writeValue(Number(e.target.value))}
                      onPointerUp={() => actions.commitElementEdit()}
                      onKeyUp={() => actions.commitElementEdit()}
                      onBlur={() => actions.commitElementEdit()}
                      style={{ width: 72 }}
                    />
                    {/* الطريقُ الدقيق — انظر ترويسة `KfValueField`. */}
                    <KfValueField
                      // حقلٌ لكلّ مفتاح — انظر ترويسة `KfValueField` (المسوّدةُ لمفتاحها وحده).
                      key={`${selectedKf.elId}|${selectedKf.property}|${selectedKf.kfId}`}
                      range={[min, max]}
                      display={display}
                      onLive={writeValue}
                      onCommit={() => actions.commitElementEdit()}
                      title={L.kf_value_field_hint}
                    />
                    <span data-testid="kf-value-unit" style={{ width: 10, color: 'var(--muted)' }}>{selectedKf.property === 'rotation' ? '°' : selectedKf.property === 'reveal' ? '#' : '%'}</span>
                    <button
                      data-testid="kf-delete"
                      title={L.delete_keyframe}
                      onClick={() => {
                        actions.deleteTrackKeyframe(selectedKf.elId, selectedKf.property, selectedKf.kfId);
                        setSelectedKf(null);
                      }}
                      style={{ width: 20, height: 20, display: 'grid', placeItems: 'center', border: 0, borderRadius: 4, background: 'transparent', color: 'var(--muted)' }}
                    >
                      <Icon size={13} path="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--muted)', minWidth: 42 }}>{L.kf_easing}</span>
                    {EASING_IDS.filter((id) => id !== 'custom').map((id) => (
                      <button
                        key={id}
                        data-testid={`kf-easing-${id}`}
                        title={L[EASE_LABEL_KEY[id] as keyof typeof L] as string}
                        onClick={() => actions.setTrackKeyframeEasing(selectedKf.elId, selectedKf.property, selectedKf.kfId, id)}
                        style={{
                          height: 18,
                          padding: '0 6px',
                          fontSize: 10,
                          border: '1px solid var(--line)',
                          borderRadius: 3,
                          background: selectedKfData.easing === id ? 'var(--accentSoft)' : 'var(--surface2)',
                          color: 'var(--text)',
                        }}
                      >
                        {L[EASE_LABEL_KEY[id] as keyof typeof L] as string}
                      </button>
                    ))}
                    <button
                      data-testid="kf-easing-custom"
                      onClick={() => actions.setTrackKeyframeEasing(selectedKf.elId, selectedKf.property, selectedKf.kfId, 'custom' as EasingId)}
                      style={{
                        height: 18,
                        padding: '0 6px',
                        fontSize: 10,
                        border: '1px solid var(--line)',
                        borderRadius: 3,
                        background: selectedKfData.easing === 'custom' ? 'var(--accentSoft)' : 'var(--surface2)',
                        color: 'var(--text)',
                      }}
                    >
                      {L.ease_custom}
                    </button>
                  </div>
                  {selectedKfData.easing === 'custom' && (
                    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                      <BezierEditor elementId={selectedKfEl.id} target={{ property: selectedKf.property, kfId: selectedKf.kfId }} />
                    </div>
                  )}
                </AnchoredPopover>
              );
            })()}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
