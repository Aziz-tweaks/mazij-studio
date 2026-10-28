import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Spring, VelocityTracker, project, rubberband } from './spring';
import { Glyph, MI, capture } from './ui';

/** **اللوحُ السفليّ** — كما في iOS (مهارة apple-design §٢–٩).
 *
 * يطفو فوق اللوحة ولا يُصغِّر حاويتها: يتحرّك بـ`transform` وحده، فلا قياسَ ولا إعادةَ
 * تخطيطٍ في أيّ إطار. له مواضعُ استقرار (`detents`)، ويُسحَب من مقبضه وعنوانه:
 *   - السحبُ يتبع الإصبع ١:١ من موضع الإمساك، ويقاوم فوق أعلى موضعٍ مقاومةً متدرّجة؛
 *   - عند الإفلات تُسقَط سرعةُ الإصبع إلى الأمام (`project`) ويُختار أقربُ موضعٍ للنقطة
 *     المُسقَطة — فالقذفةُ الخفيفة لأسفل تُغلِقه، وللأعلى تفتحه كاملًا؛
 *   - والنابضُ يبدأ من الموضع الحيّ بسرعة الإصبع، فيُمسَك في منتصف حركته ويُعكَس بلا قفزة.
 *
 * ويُبلِّغ `onRest` بالارتفاع الظاهر حين يستقرّ، فيُعيد المسرحُ ملاءمةَ التصميم فوقه. */

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** مواضعُ الاستقرار: كسرٌ من ارتفاع الشاشة (≤١) أو بكسلات (>١)، من الأصغر للأكبر. */
  detents?: number[];
  initial?: number;
  testid: string;
  children: ReactNode;
  headerExtra?: ReactNode;
  onRest?: (visiblePx: number) => void;
  /** حاشيةٌ ثابتة أسفل اللوح (زرٌّ رئيسيّ مثلًا) لا تمرّ مع المحتوى. */
  footer?: ReactNode;
  scrim?: boolean;
  scroll?: boolean;
}

export function Sheet({ open, onClose, title, detents = [0.44], initial = 0, testid, children, headerExtra, onRest, footer, scrim, scroll = true }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const hostH = useRef(800);
  const springRef = useRef<Spring | null>(null);
  const restRef = useRef(onRest);
  restRef.current = onRest;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const px = (d: number) => (d <= 1 ? d * hostH.current : d);
  const heights = () => detents.map(px);
  const maxH = () => Math.max(...heights());

  // translateY = ارتفاعُ اللوح − الجزءُ الظاهر. صفرٌ = أعلى موضع.
  const apply = (visible: number) => {
    const el = sheetRef.current;
    if (!el) return;
    const H = maxH();
    el.style.transform = `translate3d(0, ${H - visible}px, 0)`;
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, Math.min(0.4, (visible / H) * 0.4)));
  };

  // في موضعٍ أدنى من الأعلى يبقى جزءٌ من اللوح تحت حافّة الشاشة؛ فاصلٌ بطوله في آخر
  // المحتوى يجعل آخرَ عنصرٍ قابلًا للتمرير إليه. يُضبَط عند الاستقرار فقط (لا كلَّ إطار).
  const settle = (v: number) => {
    sheetRef.current?.style.setProperty('--m-hidden', `${Math.max(0, maxH() - v)}px`);
  };

  if (open && !mounted) setMounted(true);

  useLayoutEffect(() => {
    if (!mounted) return;
    const host = sheetRef.current?.parentElement;
    hostH.current = host?.clientHeight || window.innerHeight;
    const el = sheetRef.current!;
    el.style.height = `${maxH()}px`;
    if (!springRef.current) {
      springRef.current = new Spring(0, apply);
      apply(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  useEffect(() => {
    const sp = springRef.current;
    if (!mounted || !sp) return;
    if (open) {
      const target = heights()[Math.min(initial, detents.length - 1)];
      // المسرحُ يتحرّك مع اللوح في اللحظة نفسها، لا بعده.
      restRef.current?.(target);
      settle(target);
      sp.to(target, { damping: 1, response: 0.36 });
    } else {
      restRef.current?.(0);
      sp.to(0, { damping: 1, response: 0.3 }, () => {
        springRef.current = null;
        setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  // ───── السحب ─────
  const drag = useRef<{ startY: number; startVisible: number; id: number } | null>(null);
  const vt = useRef(new VelocityTracker());
  const onDown = (e: React.PointerEvent) => {
    const sp = springRef.current;
    if (!sp || !open) return;
    capture(e);
    sp.stop();
    drag.current = { startY: e.clientY, startVisible: sp.value, id: e.pointerId };
    vt.current.reset();
    vt.current.push(e.clientY);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const sp = springRef.current;
    if (!d || !sp || d.id !== e.pointerId) return;
    vt.current.push(e.clientY);
    let v = d.startVisible - (e.clientY - d.startY);
    const H = maxH();
    if (v > H) v = H + rubberband(v - H, H);
    sp.set(Math.max(0, v));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    const sp = springRef.current;
    if (!d || !sp || d.id !== e.pointerId) return;
    drag.current = null;
    const velY = vt.current.get(); // موجبٌ = لأسفل
    const projected = sp.value - project(velY);
    const hs = heights();
    const candidates = [0, ...hs];
    let best = candidates[0];
    for (const c of candidates) if (Math.abs(c - projected) < Math.abs(best - projected)) best = c;
    // نقرةٌ بلا سحب على المقبض: تبديلٌ بين المواضع.
    if (Math.abs(e.clientY - d.startY) < 4 && Math.abs(velY) < 50) {
      const i = hs.findIndex((h) => Math.abs(h - d.startVisible) < 2);
      best = hs.length > 1 ? hs[(i + 1) % hs.length] : d.startVisible;
    }
    if (best === 0) {
      closeRef.current();
      return;
    }
    restRef.current?.(best);
    settle(best);
    sp.to(best, { damping: Math.abs(velY) > 300 ? 0.86 : 1, response: 0.34, velocity: -velY });
  };

  if (!mounted) return null;

  return (
    <>
      {scrim && <div ref={scrimRef} className="m-sheet-scrim" style={{ pointerEvents: open ? 'auto' : 'none' }} onClick={onClose} />}
      <section ref={sheetRef} data-testid={testid} data-open={open} className="m-sheet" style={{ transform: 'translate3d(0, 100%, 0)' }} role="dialog" aria-modal={scrim ? true : undefined}>
        <div className="m-sheet-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="m-sheet-grabber" />
          {(title || headerExtra) && (
            <div className="m-sheet-head">
              <span className="m-title" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </span>
              {headerExtra}
              <button
                data-testid={`${testid}-close`}
                className="m-icon-btn m-filled m-press"
                aria-label="إغلاق"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClose}
                style={{ width: 32, height: 32 }}
              >
                <Glyph d={MI.close} size={16} sw={2.2} />
              </button>
            </div>
          )}
        </div>
        <div className={`m-sheet-body${scroll ? ' m-scroll' : ''}`} style={scroll ? undefined : { display: 'flex', flexDirection: 'column', paddingBottom: 'var(--m-hidden, 0px)' }}>
          {children}
          {scroll && <div aria-hidden="true" style={{ height: 'var(--m-hidden, 0px)' }} />}
        </div>
        {footer && <div style={{ flex: 'none', padding: '10px 16px calc(10px + var(--m-safe-b))', boxShadow: 'inset 0 1px 0 var(--m-hair)' }}>{footer}</div>}
        {!footer && <div style={{ flex: 'none', height: 'var(--m-safe-b)' }} />}
      </section>
    </>
  );
}
