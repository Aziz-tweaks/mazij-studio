import { useRef, useState } from 'react';
import type { AnimProperty, ElementId } from '../../state/elements';
import { cascadeEasingToTracks } from '../../state/elements';
import type { Bezier } from '../../lib/easing';
import { useStudio } from '../../state/StudioContext';

const PAD = 14;
const SIZE = 120;
const Y_MIN = -0.6;
const Y_MAX = 1.6;

function toSvg(x: number, y: number) {
  return { X: PAD + x * SIZE, Y: PAD + (1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * SIZE };
}

function fromSvg(X: number, Y: number) {
  const x = Math.max(0, Math.min(1, (X - PAD) / SIZE));
  const y = Y_MAX - ((Y - PAD) / SIZE) * (Y_MAX - Y_MIN);
  return { x, y: Math.max(Y_MIN, Math.min(Y_MAX, y)) };
}

/** Manual cubic-bezier curve editor: two draggable control points define the curve
 * between the fixed (0,0) and (1,1) anchors. With no `target`, the live result is
 * written to every property track's segments at once (the whole-clip curve, same as
 * the easing menu with nothing selected). With a `target` (a specific property +
 * keyframe picked in the pro-mode timeline's expanded track rows), only that one
 * keyframe's own outgoing segment is edited — independent per-segment easing. Either
 * way playback/scrubbing reflect the curve immediately, not a preview divorced from
 * the real data. */
export function BezierEditor({ elementId, target }: { elementId: ElementId; target?: { property: AnimProperty; kfId: string } | null }) {
  const { state, actions, dict: L } = useStudio();
  const svgRef = useRef<SVGSVGElement>(null);
  const el = state.elements.find((e) => e.id === elementId);
  if (!el) return null;
  const bezier = target ? el.anim.tracks[target.property]?.find((k) => k.id === target.kfId)?.bezier ?? el.anim.bezier : el.anim.bezier;

  const onHandleDown = (which: 0 | 1) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    actions.beginElementEdit();
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const X = ((ev.clientX - rect.left) / rect.width) * (SIZE + PAD * 2);
      const Y = ((ev.clientY - rect.top) / rect.height) * (SIZE + PAD * 2);
      const { x, y } = fromSvg(X, Y);
      actions.liveUpdateElements((els) =>
        els.map((e2) => {
          if (e2.id !== elementId) return e2;
          if (target) {
            const track = e2.anim.tracks[target.property];
            if (!track) return e2;
            const cur = track.find((k) => k.id === target.kfId)?.bezier ?? e2.anim.bezier;
            const next: Bezier = which === 0 ? [x, y, cur[2], cur[3]] : [cur[0], cur[1], x, y];
            return {
              ...e2,
              anim: { ...e2.anim, tracks: { ...e2.anim.tracks, [target.property]: track.map((k) => (k.id === target.kfId ? { ...k, bezier: next, easing: 'custom' } : k)) } },
            };
          }
          const next: Bezier = which === 0 ? [x, y, e2.anim.bezier[2], e2.anim.bezier[3]] : [e2.anim.bezier[0], e2.anim.bezier[1], x, y];
          return { ...e2, anim: { ...e2.anim, bezier: next, easing: 'custom', tracks: cascadeEasingToTracks(e2.anim.tracks, 'custom', next) } };
        }),
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      actions.commitElementEdit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // **الأرقامُ الأربعة** (٢٥ أكتوبر ٢٠٢٦): السحبُ يقارب والرقمُ يطابق — منحنى «تسهيل» من
  // After Effects أو من `cubic-bezier()` يُنقَل بالأرقام نفسها، خطوةَ تراجعٍ واحدة.
  const applyBezier = (next: Bezier) => {
    actions.beginElementEdit();
    actions.liveUpdateElements((els) =>
      els.map((e2) => {
        if (e2.id !== elementId) return e2;
        if (target) {
          const track = e2.anim.tracks[target.property];
          if (!track) return e2;
          return { ...e2, anim: { ...e2.anim, tracks: { ...e2.anim.tracks, [target.property]: track.map((k) => (k.id === target.kfId ? { ...k, bezier: next, easing: 'custom' } : k)) } } };
        }
        return { ...e2, anim: { ...e2.anim, bezier: next, easing: 'custom', tracks: cascadeEasingToTracks(e2.anim.tracks, 'custom', next) } };
      }),
    );
    actions.commitElementEdit();
  };
  const setComponent = (i: 0 | 1 | 2 | 3, v: number) => {
    const isX = i === 0 || i === 2;
    const clamped = isX ? Math.max(0, Math.min(1, v)) : Math.max(Y_MIN, Math.min(Y_MAX, v));
    const next = [...bezier] as Bezier;
    next[i] = clamped;
    applyBezier(next);
  };

  const p0 = toSvg(0, 0);
  const p1 = toSvg(bezier[0], bezier[1]);
  const p2 = toSvg(bezier[2], bezier[3]);
  const p3 = toSvg(1, 1);
  const zeroLine = toSvg(0, 0).Y;
  const oneLine = toSvg(0, 1).Y;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <svg
        ref={svgRef}
        data-testid="bezier-editor"
        width={SIZE + PAD * 2}
        height={SIZE + PAD * 2}
        style={{ background: 'var(--surface2)', borderRadius: 'var(--rs)', touchAction: 'none' }}
      >
        <line x1={PAD} y1={zeroLine} x2={SIZE + PAD} y2={zeroLine} stroke="var(--line)" strokeWidth={1} />
        <line x1={PAD} y1={oneLine} x2={SIZE + PAD} y2={oneLine} stroke="var(--line)" strokeWidth={1} />
        <path d={`M ${p0.X} ${p0.Y} C ${p1.X} ${p1.Y} ${p2.X} ${p2.Y} ${p3.X} ${p3.Y}`} stroke="var(--accent)" strokeWidth={2} fill="none" />
        <line x1={p0.X} y1={p0.Y} x2={p1.X} y2={p1.Y} stroke="var(--muted)" strokeWidth={1} strokeDasharray="2,2" />
        <line x1={p3.X} y1={p3.Y} x2={p2.X} y2={p2.Y} stroke="var(--muted)" strokeWidth={1} strokeDasharray="2,2" />
        <circle cx={p0.X} cy={p0.Y} r={3} fill="var(--muted)" />
        <circle cx={p3.X} cy={p3.Y} r={3} fill="var(--muted)" />
        <circle data-testid="bezier-handle-0" cx={p1.X} cy={p1.Y} r={6} fill="var(--accent)" style={{ cursor: 'grab' }} onPointerDown={onHandleDown(0)} />
        <circle data-testid="bezier-handle-1" cx={p2.X} cy={p2.Y} r={6} fill="var(--accent)" style={{ cursor: 'grab' }} onPointerDown={onHandleDown(1)} />
      </svg>
      <div dir="ltr" data-testid="bezier-numbers" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, width: SIZE + PAD * 2 }}>
        {([0, 1, 2, 3] as const).map((i) => (
          <BezierNumField key={i} index={i} value={bezier[i]} onCommit={(v) => setComponent(i, v)} />
        ))}
      </div>
      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{L.ease_custom}</span>
    </div>
  );
}

/** خانةُ رقمٍ واحدٍ من الأربعة — تُلزِم عند Enter أو مغادرة الخانة، لا عند كلّ حرف
 * (فـ«0.» و«-» حالاتٌ وسيطةٌ لا منحنيات). */
function BezierNumField({ index, value, onCommit }: { index: 0 | 1 | 2 | 3; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    setDraft(null);
    if (draft.trim() !== '' && Number.isFinite(v)) onCommit(v);
  };
  return (
    <input
      data-testid={`bezier-num-${index}`}
      type="number"
      step={0.01}
      value={draft ?? String(Number(value.toFixed(3)))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
        e.stopPropagation();
      }}
      style={{ width: '100%', minWidth: 0, height: 22, padding: '0 3px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}
    />
  );
}
