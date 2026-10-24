import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { HANDLE_POS, type HandleId, type ResizeHandleId } from '../../lib/geometry';
import type { Geometry } from '../../state/elements';

const CURSOR_BY_HANDLE: Record<HandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
  rotate: 'grab',
};

/** نفس مجموعة `RESIZE_HANDLES` بترتيب رسم مختلف: الحوافّ أوّلًا ثم الزوايا، كي
 * تفوز الزاوية بالإصابة عند تقاطعها مع مقبض الحافّة الممتدّ بكامل الطول. */
const ORDERED_HANDLES: ResizeHandleId[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'se', 'sw'];

export interface HandlesProps {
  geo: Geometry;
  /** The artboard's current zoom scale, used only to cancel it out — see below. */
  scale: number;
  /** Artboard pixel size — with `scale`, this is what turns `geo` into the selection's
   * real on-screen size, which decides whether the handles have to move outward. */
  size: { w: number; h: number };
  onHandleDown: (e: ReactPointerEvent<HTMLDivElement>, handle: HandleId) => void;
  /** **نقرةٌ مزدوجة على منطقة مقبض = نقرةٌ مزدوجة على العنصر نفسه.**
   *
   * منطقة إصابة الحافّة بعرض الحافّة كلّها وسُمكٍ يصل إلى ٣٢ بكسل نصفُه داخل الصندوق،
   * والنصّ الصغير يجلس عند أعلى صندوقه — فعنوانٌ بمقاس ٣٢ على لوحةٍ مُصغَّرة تقع حروفه
   * كلّها تقريبًا تحت مقبض الحافّة العليا. فكانت النقرةُ الأولى تحدّده وتُظهر المقابض،
   * والثانية تقع على المقبض لا على النصّ، فلا يدخل التحرير أبدًا. قيس في جولة استخدامٍ
   * حقيقيّة على عنوان قالب «إنفوجرافيك»: ينقر المصمّم مرّتين على الحروف ولا يحدث شيء. */
  onDoubleClick?: (e: ReactMouseEvent<HTMLDivElement>) => void;
}

/** حجم المقبض **المرسوم** على الشاشة. لم يتغيّر — هو ما يراه المصمم. */
const PAINT_PX = 10;

/** سقف حجم **منطقة الإصابة** على الشاشة.
 *
 * مقيس على الأداة الشائعة: كل مقبض منطقة إصابته **32 بكسل سُمكًا**، ومقابض الحوافّ تمتدّ
 * على **كامل طول الحافّة** (قيس على تحديد 155×156: الزوايا 32×32، والحافّة العلوية
 * 156×32، والجانبية 32×156) — `re-canva-flows.md` §3.2. والقاعدة المعلنة هناك
 * حرفيًّا: «المقبض المرئي أصغر كثيرًا من 32؛ منطقة الإصابة مُكبَّرة عن قصد
 * والأثر الظاهر مرسوم صغيرًا». وهذا هو الفصل المطلوب: **المرسوم والمُصاب شيئان**.
 *
 * ومقابض مزيج كانت 10 بكسل (رُفعت حديثًا عن 3.76 غير القابلة للاستخدام)، وهي 10
 * **رسمًا وإصابةً معًا** لأنها كانت عنصرًا واحدًا. */
const HIT_PX = 32;

/** Resize + rotate handles for the current selection, positioned as children of
 * the artboard (percentage-based, same frame as the elements) so they inherit
 * the exact same zoom/pan transform — no separate screen-space math needed.
 *
 * Living inside that transform is right for *positions* but wrong for the handles'
 * own chrome: a literal `width: 10` is 10 artboard px, which the zoom transform then
 * scales, so the grab targets shrank to ~1.9 screen px at 50% zoom and ~3.8 px even
 * at 100% (the fit scale is well under 1 for a 1080px artboard) — far too small to
 * hit, which is what made resizing/rotating feel broken. Every length below is
 * therefore divided by `scale` so it renders at a constant *screen* size at any zoom,
 * while the percentage-based positions keep inheriting the transform as before — so a
 * handle still sits centred on its own corner, just at a usable size. The one exception
 * is a selection too small to hold them, handled below.
 *
 * وما أُضيف بعد ذلك: **فصل منطقة الإصابة عن الشكل المرسوم**. كان المقبض عنصرًا
 * واحدًا، فـ10 بكسل كانت مقاسه المرسوم ومنطقة إصابته معًا. أمّا الآن فالعنصر
 * الخارجي منطقةُ إصابة شفّافة تبلغ 32 بكسل (رقم الأداة الشائعة المقيس) وداخله الشكل
 * المرسوم بـ10 بكسل كما كان — فيكبر الهدف ولا يكبر ما يراه المصمم. */
export function Handles({ geo, scale, size, onHandleDown, onDoubleClick }: HandlesProps) {
  // 1 artboard px * px = 1 screen px
  const px = 1 / scale;

  const wScreen = geo.w * size.w * scale;
  const hScreen = geo.h * size.h * scale;
  const shortSideScreen = Math.min(wScreen, hScreen);

  // لا يمكن تطبيق 32 بكسل حرفيًّا على أي تحديد: مقبضان متقابلان بسُمك 32 يُغطّيان
  // كامل داخل تحديد ضلعه الأقصر أقلّ من 64 بكسل شاشة، فلا يبقى موضع يبدأ منه
  // **تحريك** العنصر — وهو العطب نفسه الذي يشرحه تعليق الحلقة الخارجيّة أدناه،
  // مُكبَّرًا ثلاث مرّات. والأداة الشائعة لا تواجه هذا أصلًا: قياسها على تحديد 156 بكسل،
  // ولا يوجد في مستندها الافتراضي عنصر بعرض 11 بكسل كشعار بوستر مزيج.
  //
  // فالسقف يُقيَّد بالتحديد نفسه: يبقى بين كل مقبضين متقابلين شريطٌ قابل للضغط لا
  // يقلّ عن حجم المقبض المرسوم. والنتيجة أن تحديدًا بضلع ≥74 بكسل شاشة يأخذ
  // **32 بكسل كاملة** — أي رقم الأداة الشائعة بالضبط عند مقاس تحديد الأداة الشائعة المقيس (156) —
  // وتحديدًا أصغر يأخذ أكبر ما يتّسع له، ولا يهبط أبدًا تحت 10 التي كانت قائمة،
  // فلا تتراجع أي حالة عن سلوكها الحالي.
  const hitScreen = Math.max(PAINT_PX, Math.min(HIT_PX, (shortSideScreen - PAINT_PX) / 2));

  const hit = hitScreen * px;
  const half = (hitScreen / 2) * px;
  const paint = PAINT_PX * px;
  const paintHalf = (PAINT_PX / 2) * px;

  // Full-size handles straddling the edges would blanket a selection only a few screen
  // px across (the logo in the default poster is ~11 px at 100% zoom): every press
  // inside it would land on a handle and start a resize, leaving no way to *move* the
  // element at all. Such a selection gets its handles ringed around the outside instead,
  // which keeps the interior grabbable and the corners resizable. The handle ids — and
  // therefore the resize math — are untouched; this only moves where they are drawn.
  //
  // The threshold is deliberately tight: handles pushed outward overhang whatever is
  // next to the selection, and anything they overhang they also intercept. A looser rule
  // here parked a thin wide bar's handles on top of the shape beside it, so shift-
  // clicking that neighbour hit a handle instead of the element. A box therefore keeps
  // its inner handles for as long as its shorter side still leaves a pressable band
  // between the two opposing handles.
  // `half` هنا يساوي 5 بكسل بالضبط متى انكمشت منطقة الإصابة إلى 10 (وهو ما يحدث
  // لكل تحديد صغير يُفعِّل هذه الحلقة الخارجيّة)، فالسلوك في هذه الحالة مطابق
  // حرفيًّا لما كان قبل فصل الرسم عن الإصابة.
  const out = shortSideScreen < 2 * PAINT_PX ? half + 2 * px : 0;
  const boxStyle: CSSProperties = {
    position: 'absolute',
    left: `${geo.x * 100}%`,
    top: `${geo.y * 100}%`,
    width: `${geo.w * 100}%`,
    height: `${geo.h * 100}%`,
    transform: `rotate(${geo.rotation}deg)`,
    pointerEvents: 'none',
  };

  return (
    <div style={boxStyle} data-testid="selection-handles">
      {/* الحوافّ قبل الزوايا في ترتيب الـDOM عن قصد: مقبض الحافّة صار بكامل طول
          الحافّة فيتقاطع مع مقبضَي زاويتها، والمتأخّر في الترتيب يفوز بالإصابة —
          فتبقى الزاوية (تحجيم بمحورين) هي ما يُمسَك عند الزاوية. والأداة الشائعة تملك
          الاثنين متقاطعين كذلك: الحافّة بكامل الطول والزوايا فوقها (§3.2). */}
      {ORDERED_HANDLES.map((h) => {
        const pos = HANDLE_POS[h];
        // -1/0/+1 per axis: which way is "away from the box" for this handle.
        const awayX = (pos.x - 0.5) * 2;
        const awayY = (pos.y - 0.5) * 2;
        // مقبض الحافّة يمتدّ على **كامل** حافّته — قاعدة الأداة الشائعة المقيسة: «امتداد
        // مقابض الحوافّ على كامل الطول يعني ألّا توجد منطقة ميتة على الحافّة لا
        // يفعل السحب فيها شيئًا» (§3.2). والسُمك على المحور الآخر هو `hit`.
        //
        // الطول يُكتب `100%` ويُثبَّت الطرف عند `0`، لا `left: 50%` مع هامش سالب:
        // الهوامش النسبيّة في CSS تُحسَب كلّها من **عرض** الأب حتى على المحور
        // الرأسي، فـ`marginTop: -50%` على مقبض جانبي كان سيُزيحه بنصف العرض لا
        // بنصف الارتفاع.
        const isVerticalEdge = h === 'e' || h === 'w';
        const isHorizontalEdge = h === 'n' || h === 's';
        const geomStyle: CSSProperties = isHorizontalEdge
          ? { left: 0, top: `${pos.y * 100}%`, width: '100%', height: hit, margin: `${-half + awayY * out}px 0 0 0` }
          : isVerticalEdge
            ? { left: `${pos.x * 100}%`, top: 0, width: hit, height: '100%', margin: `0 0 0 ${-half + awayX * out}px` }
            : { left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, width: hit, height: hit, margin: `${-half + awayY * out}px 0 0 ${-half + awayX * out}px` };
        return (
          <div
            key={h}
            // `data-handle` يبقى على **منطقة الإصابة** لا على الشكل المرسوم: هذا هو
            // الهدف الحقيقي للنقر، وهو ما يجب أن تقيسه الاختبارات. وضعُه على
            // المرسوم كان سيُفرغ تأكيد «مركز التحديد الصغير ليس مغطّى بمقبض» من
            // معناه — سيمرّ دائمًا بينما يرجع العطب الذي كُتب لأجله.
            data-handle={h}
            onPointerDown={(e) => onHandleDown(e, h)}
            onDoubleClick={onDoubleClick}
            style={{
              position: 'absolute',
              ...geomStyle,
              display: 'grid',
              placeItems: 'center',
              cursor: CURSOR_BY_HANDLE[h],
              pointerEvents: 'auto',
              touchAction: 'none',
            }}
          >
            <div
              data-handle-paint={h}
              style={{
                width: paint,
                height: paint,
                background: '#fff',
                border: `${1.5 * px}px solid var(--accent)`,
                borderRadius: 2 * px,
                pointerEvents: 'none',
              }}
            />
          </div>
        );
      })}
      <div
        data-handle="rotate"
        onPointerDown={(e) => onHandleDown(e, 'rotate')}
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          width: hit,
          height: hit,
          // مركز المقبض يبقى على بُعده القائم (‏−28 بكسل من الحافّة العليا، والأداة الشائعة
          // تقيس ‏~46 أسفل الحافّة السفلى) أيًّا كان حجم منطقة الإصابة، فلا يتحرّك
          // المقبض المرسوم تحت المؤشّر حين تتغيّر الإصابة.
          margin: `${-28 * px - half + paintHalf}px 0 0 ${-half}px`,
          display: 'grid',
          placeItems: 'center',
          cursor: CURSOR_BY_HANDLE.rotate,
          pointerEvents: 'auto',
          touchAction: 'none',
        }}
      >
        <div
          data-handle-paint="rotate"
          style={{
            width: paint,
            height: paint,
            background: '#fff',
            border: `${1.5 * px}px solid var(--accent)`,
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />
      </div>
      <div style={{ position: 'absolute', left: '50%', top: -22 * px, width: 1.5 * px, height: 22 * px, background: 'var(--accent)', transform: 'translateX(-50%)' }} />
    </div>
  );
}

export interface GuideLinesProps {
  guides: Array<{ axis: 'x' | 'y'; pos: number }>;
  size: { w: number; h: number };
}

export function GuideLines({ guides, size }: GuideLinesProps) {
  if (!guides.length) return null;
  return (
    <>
      {guides.map((g, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            background: 'var(--accent)',
            pointerEvents: 'none',
            zIndex: 5,
            ...(g.axis === 'x'
              ? { left: `${(g.pos / size.w) * 100}%`, top: 0, bottom: 0, width: 1 }
              : { top: `${(g.pos / size.h) * 100}%`, left: 0, right: 0, height: 1 }),
          }}
        />
      ))}
    </>
  );
}
