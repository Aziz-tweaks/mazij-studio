import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStudio } from '../../state/StudioContext';
import type { DocElement } from '../../state/elements';
import { documentDuration, formatClock } from '../../lib/animTimeline';
import { elementDisplayName } from '../../lib/layerNames';
import { Glyph, MI, IconButton, capture } from './ui';
import { typeIcon } from './panels';
import { useM } from './strings';

/** **الخطُّ الزمنيّ للإصبع** — كما في محرّر فيديو شائع على الجوال.
 *
 * صفٌّ لكلّ طبقة (أعلاها أوّلًا)، ومقطعُها شريطٌ ملوّنٌ باسمها. المسطرةُ تُسحَب لتحريك
 * المؤشّر. نقرةٌ على مقطعٍ تحدّده؛ والمحدَّدُ يُسحَب من جسمه لينتقل، ومن مقبض نهايته
 * ليُقصّ — والسحبُ يُرسَم محلّيًّا (٦٠ إطارًا بلا إعادة تصيير المستند) ثم يُلتزَم مرّةً
 * واحدة عند الإفلات بـ`setClipTiming`: خطوةُ تراجعٍ واحدة لكلّ سحبة. */

const ROW = 46;
const RULER = 30;
const PAD = 16;

const TYPE_COLOR: Record<string, string> = {
  text: '#7362FF',
  shape: '#3D8BFF',
  image: '#18A88F',
  video: '#E0663D',
  audio: '#2FA05A',
  fx: '#C04BFF',
  lottie: '#D4A72C',
};

export function MobileTimeline() {
  const { state, actions, dict: L } = useStudio();
  const M = useM();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [zoom, setZoom] = useState(1);
  const dur = Math.max(documentDuration(state.elements.map((e) => e.anim), state.fps), 1);
  const pps = (Math.max(200, width - PAD * 2) / dur) * zoom;
  const total = dur * pps * 1.3 + PAD * 2;
  const rows = [...state.elements].reverse();

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // المؤشّرُ يبقى ظاهرًا أثناء التشغيل.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !state.playing) return;
    const x = PAD + state.t * pps;
    if (x < el.scrollLeft + 24 || x > el.scrollLeft + el.clientWidth - 24) el.scrollLeft = Math.max(0, x - el.clientWidth / 3);
  }, [state.t, state.playing, pps]);

  // ───── سحبُ المسطرة ─────
  const scrubbing = useRef(false);
  const scrubAt = (clientX: number) => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left + el.scrollLeft - PAD;
    actions.scrubTo(Math.max(0, Math.min(dur, x / pps)));
  };

  // ───── سحبُ المقطع ─────
  const [ghost, setGhost] = useState<{ id: string; start: number; end: number } | null>(null);
  const drag = useRef<{ id: string; mode: 'move' | 'end'; x0: number; start: number; end: number; moved: boolean } | null>(null);
  const snap = (v: number) => Math.round(v * state.fps) / state.fps;

  const onClipDown = (e: React.PointerEvent, el: DocElement, mode: 'move' | 'end') => {
    if (!state.selectedIds.includes(el.id) || el.locked) return;
    e.stopPropagation();
    capture(e);
    drag.current = { id: el.id, mode, x0: e.clientX, start: el.anim.start, end: el.anim.start + el.anim.duration, moved: false };
  };
  const onClipMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 6) return;
    d.moved = true;
    const dt = dx / pps;
    if (d.mode === 'move') {
      const s = Math.max(0, snap(d.start + dt));
      setGhost({ id: d.id, start: s, end: s + (d.end - d.start) });
    } else {
      setGhost({ id: d.id, start: d.start, end: Math.max(d.start + 1 / state.fps, snap(d.end + dt)) });
    }
  };
  const onClipUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved || !ghost) {
      setGhost(null);
      return;
    }
    if (d.mode === 'move') actions.setClipTiming([d.id], { start: ghost.start });
    else actions.setClipTiming([d.id], { end: ghost.end });
    setGhost(null);
  };

  const sel = state.selectedIds.length === 1 ? state.elements.find((e) => e.id === state.selectedIds[0]) : undefined;
  const ticks: number[] = [];
  const step = pps > 120 ? 0.5 : pps > 50 ? 1 : pps > 20 ? 2 : 5;
  for (let s = 0; s <= dur * 1.3; s += step) ticks.push(Number(s.toFixed(2)));

  return (
    <div data-testid="m-timeline" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px 8px' }}>
        <button data-testid="tl-play" className="m-icon-btn m-press" aria-label={state.playing ? M.pause : M.play} onClick={actions.togglePlay} style={{ background: 'var(--m-accent)', color: '#fff', width: 40, height: 40 }}>
          <Glyph d={state.playing ? MI.pause : MI.play} size={18} fill={!state.playing} sw={2.4} />
        </button>
        <span dir="ltr" style={{ fontSize: 13, color: 'var(--m-text2)', fontVariantNumeric: 'tabular-nums', paddingInline: 6 }}>
          {formatClock(state.t)} / {formatClock(dur)}
        </span>
        <span style={{ flex: 1 }} />
        {sel && sel.type !== 'fx' && (
          <IconButton testid="tl-split" icon={MI.split} label={M.e_split} onClick={() => actions.splitAtPlayhead(sel.id)} filled style={{ width: 40, height: 40 }} size={20} />
        )}
        <IconButton icon={MI.minus} label="-" onClick={() => setZoom((z) => Math.max(0.5, z / 1.5))} filled style={{ width: 40, height: 40 }} size={18} />
        <IconButton icon={MI.plus} label="+" onClick={() => setZoom((z) => Math.min(12, z * 1.5))} filled style={{ width: 40, height: 40 }} size={18} />
      </div>

      <div ref={scrollRef} dir="ltr" className="m-scroll" style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'auto', position: 'relative', boxShadow: 'inset 0 1px 0 var(--m-hair)' }}>
        <div style={{ position: 'relative', width: total, minHeight: '100%', paddingBottom: 12 }}>
          {/* المسطرة */}
          <div
            data-testid="tl-ruler"
            onPointerDown={(e) => {
              capture(e);
              scrubbing.current = true;
              scrubAt(e.clientX);
            }}
            onPointerMove={(e) => scrubbing.current && scrubAt(e.clientX)}
            onPointerUp={() => (scrubbing.current = false)}
            onPointerCancel={() => (scrubbing.current = false)}
            style={{ position: 'sticky', top: 0, zIndex: 3, height: RULER, background: 'var(--m-elev)', touchAction: 'none', boxShadow: 'inset 0 -1px 0 var(--m-hair)' }}
          >
            {ticks.map((s) => (
              <span key={s} style={{ position: 'absolute', left: PAD + s * pps, top: 0, height: '100%', display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                <span style={{ position: 'absolute', left: 0, bottom: 0, width: 1, height: Number.isInteger(s) ? 8 : 4, background: 'var(--m-text3)' }} />
                {Number.isInteger(s) && <span style={{ fontSize: 10.5, color: 'var(--m-text3)', transform: 'translateX(4px)', fontVariantNumeric: 'tabular-nums', marginBottom: 6 }}>{s}s</span>}
              </span>
            ))}
            <span style={{ position: 'absolute', left: PAD + dur * pps, top: 0, bottom: 0, width: 1, background: 'var(--m-hair2)' }} />
          </div>

          {/* المسارات */}
          <div style={{ position: 'relative', paddingTop: 6 }}>
            {rows.map((el) => {
              const on = state.selectedIds.includes(el.id);
              const g = ghost && ghost.id === el.id ? ghost : null;
              const start = g ? g.start : el.anim.start;
              const end = g ? g.end : el.anim.start + el.anim.duration;
              const color = TYPE_COLOR[el.type] ?? '#666';
              return (
                <div key={el.id} style={{ position: 'relative', height: ROW }}>
                  <div
                    data-testid={`tl-clip-${el.id}`}
                    onClick={() => !drag.current && actions.selectElement(el.id)}
                    onPointerDown={(e) => onClipDown(e, el, 'move')}
                    onPointerMove={onClipMove}
                    onPointerUp={onClipUp}
                    onPointerCancel={onClipUp}
                    style={{
                      position: 'absolute',
                      left: PAD + start * pps,
                      width: Math.max(18, (end - start) * pps),
                      top: 4,
                      height: ROW - 8,
                      borderRadius: 10,
                      background: on ? color : `${color}cc`,
                      boxShadow: on ? '0 0 0 2px #fff, 0 4px 14px rgba(0,0,0,.4)' : 'inset 0 0 0 1px rgba(255,255,255,.12)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0 10px',
                      color: '#fff',
                      fontSize: 12.5,
                      fontWeight: 600,
                      overflow: 'hidden',
                      touchAction: on ? 'none' : 'pan-x pan-y',
                      opacity: el.visible ? 1 : 0.45,
                    }}
                  >
                    <Glyph d={typeIcon(el.type)} size={15} sw={2} />
                    <span dir="auto" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{elementDisplayName(el, L)}</span>
                    {on && !el.locked && (
                      <span
                        data-testid={`tl-trim-${el.id}`}
                        onPointerDown={(e) => onClipDown(e, el, 'end')}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 22, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.22)', touchAction: 'none' }}
                      >
                        <span style={{ width: 3, height: 16, borderRadius: 2, background: '#fff' }} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* المؤشّر */}
          <div style={{ position: 'absolute', left: PAD + state.t * pps - 1, top: 0, bottom: 0, width: 2, background: '#fff', zIndex: 4, pointerEvents: 'none', boxShadow: '0 0 6px rgba(0,0,0,.6)' }}>
            <span style={{ position: 'absolute', top: 0, left: -6, width: 14, height: 14, borderRadius: '0 0 7px 7px', background: '#fff' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
