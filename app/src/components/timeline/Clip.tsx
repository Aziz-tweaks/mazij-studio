import { useRef } from 'react';
import type { AnimProperty, DocElement } from '../../state/elements';
import { ANIM_PROPERTIES } from '../../state/elements';
import { TIMELINE_DURATION, MIN_CLIP_DURATION, canKeyframeAtPlayhead } from '../../lib/animTimeline';
import { clamp } from '../../data/constants';
import { useStudio } from '../../state/StudioContext';

export interface SelectedKf {
  elId: string;
  property: AnimProperty;
  kfId: string;
}

/** The main clip row always shows the opacity track (every preset touches opacity,
 * and it's the one property every element can usefully fade with) — expanding the
 * clip reveals the other four as independent rows underneath. */
export const EXPANDABLE_PROPERTIES: AnimProperty[] = ANIM_PROPERTIES.filter((p) => p !== 'opacity');

export const CLIP_ROW_H = 30;
export const PROP_ROW_H = 22;

interface ClipProps {
  el: DocElement;
  color: string;
  expanded: boolean;
  selectedKf: SelectedKf | null;
  onSelectKf: (kf: SelectedKf | null) => void;
}

type GestureKind = 'move' | 'resize-left' | 'resize-right' | 'kf';

/** One layer's row in the pro-mode timeline: a draggable/resizable clip (body moves
 * it in time, edges change start/duration) with diamond keyframes on its opacity
 * track that can be dragged along the clip and deleted, plus (when expanded) one
 * more such row per remaining property — x/y/scale/rotation — each with its own
 * independent keyframes. Every gesture is a single begin/commit pair — the same
 * pattern Stage.tsx uses for on-canvas drag/resize — so it collapses to one undo
 * step regardless of how many pointermove events fired. */
export function Clip({ el, color, expanded, selectedKf, onSelectKf }: ClipProps) {
  const { state, actions, dict: L } = useStudio();
  const rowRef = useRef<HTMLDivElement>(null);
  const anim = el.anim;
  // زرّ «+» يضيف مفتاحًا **عند المؤشّر**: إن كان المؤشّر بعد نهاية المقطع مُدَّ المقطع
  // ليصله (بلا إزاحة أي مفتاح قائم عن زمنه المطلق)، وإن كان **قبل** بدايته فلا سبيل
  // إلى ذلك إلا بنقل لحظة البدء — فيُعطَّل الزرّ بسببٍ مكتوب. وهو نفس المُسنَد الذي
  // يَفحصه `addTrackKeyframeAtPlayhead`، فلا يختلف المعطَّل عن المرفوض.
  const canKeyframeHere = canKeyframeAtPlayhead(anim, state.t);
  const leftPct = (anim.start / TIMELINE_DURATION) * 100;
  const widthPct = (anim.duration / TIMELINE_DURATION) * 100;

  const startGesture = (kind: GestureKind, property: AnimProperty, kfId: string | undefined, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const row = rowRef.current;
    if (!row) return;
    const rectWidth = row.getBoundingClientRect().width;
    const startClientX = e.clientX;
    const startStart = anim.start;
    const startDuration = anim.duration;
    const startKf = kfId ? anim.tracks[property]?.find((k) => k.id === kfId) : undefined;
    const startKfT = startKf?.t ?? 0;
    if (kind === 'kf' && kfId) onSelectKf({ elId: el.id, property, kfId });
    let moved = false;
    actions.beginElementEdit();
    (e.target as Element).setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const deltaSec = ((ev.clientX - startClientX) / rectWidth) * TIMELINE_DURATION;
      if (Math.abs(ev.clientX - startClientX) > 2) moved = true;
      actions.liveUpdateElements((els) =>
        els.map((e2) => {
          if (e2.id !== el.id) return e2;
          const a = e2.anim;
          if (kind === 'move') {
            const newStart = clamp(startStart + deltaSec, 0, TIMELINE_DURATION - a.duration);
            return { ...e2, anim: { ...a, start: newStart } };
          }
          if (kind === 'resize-left') {
            const end = startStart + startDuration;
            const newStart = clamp(startStart + deltaSec, 0, end - MIN_CLIP_DURATION);
            return { ...e2, anim: { ...a, start: newStart, duration: end - newStart } };
          }
          if (kind === 'resize-right') {
            const newDuration = clamp(startDuration + deltaSec, MIN_CLIP_DURATION, TIMELINE_DURATION - startStart);
            return { ...e2, anim: { ...a, duration: newDuration } };
          }
          // kind === 'kf'
          const track = a.tracks[property];
          if (!track) return e2;
          const deltaFrac = a.duration > 0 ? deltaSec / a.duration : 0;
          const newT = clamp(startKfT + deltaFrac, 0, 1);
          return { ...e2, anim: { ...a, tracks: { ...a.tracks, [property]: track.map((k) => (k.id === kfId ? { ...k, t: newT } : k)) } } };
        }),
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      actions.commitElementEdit();
      // A plain click (no drag) on an edge handle can't resize anything, but the
      // boundary opacity keyframe living at that exact point (t=0 / t=1) still needs
      // a way to be selected for value-editing — it has no hit-area of its own once
      // the resize handle takes priority over it.
      if (!moved && (kind === 'resize-left' || kind === 'resize-right')) {
        const edgeT = kind === 'resize-left' ? 0 : 1;
        const edgeKf = anim.tracks.opacity?.find((k) => k.t === edgeT);
        if (edgeKf) onSelectKf({ elId: el.id, property: 'opacity', kfId: edgeKf.id });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const row = (property: AnimProperty, height: number, top: number) => {
    const track = anim.tracks[property] ?? [];
    return (
      <div key={property} ref={property === 'opacity' ? rowRef : undefined} style={{ position: 'absolute', left: 0, right: 0, top, height, borderBottom: '1px solid var(--line)' }}>
        <div
          data-testid={`clip-${el.id}${property === 'opacity' ? '' : `-${property}`}`}
          onPointerDown={(e) => {
            startGesture('move', property, undefined, e);
            onSelectKf(null);
          }}
          style={{ position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`, top: (height - 16) / 2, height: 16, borderRadius: 4, background: color, opacity: property === 'opacity' ? 0.4 : 0.22, cursor: 'grab' }}
        />
        {property === 'opacity' && (
          <>
            <div
              data-testid={`clip-${el.id}-resize-left`}
              onPointerDown={(e) => startGesture('resize-left', 'opacity', undefined, e)}
              style={{ position: 'absolute', left: `calc(${leftPct}% - 3px)`, width: 6, top: 6, height: 18, cursor: 'ew-resize', zIndex: 4 }}
            />
            <div
              data-testid={`clip-${el.id}-resize-right`}
              onPointerDown={(e) => startGesture('resize-right', 'opacity', undefined, e)}
              style={{ position: 'absolute', left: `calc(${leftPct + widthPct}% - 3px)`, width: 6, top: 6, height: 18, cursor: 'ew-resize', zIndex: 4 }}
            />
          </>
        )}
        {track.map((kf) => {
          const pct = ((anim.start + kf.t * anim.duration) / TIMELINE_DURATION) * 100;
          const selected = selectedKf?.elId === el.id && selectedKf.property === property && selectedKf.kfId === kf.id;
          return (
            <div
              key={kf.id}
              data-testid={`kf-${el.id}-${kf.id}`}
              onPointerDown={(e) => startGesture('kf', property, kf.id, e)}
              title={`${(kf.t * 100).toFixed(0)}% · ${(kf.value * 100).toFixed(0)}%`}
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
                cursor: 'grab',
                zIndex: 3,
              }}
            />
          );
        })}
        <button
          data-testid={`clip-${el.id}-add-kf${property === 'opacity' ? '' : `-${property}`}`}
          disabled={!canKeyframeHere}
          title={canKeyframeHere ? L.add_keyframe : L.kf_outside_clip}
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
            opacity: canKeyframeHere ? 1 : 0.4,
            cursor: canKeyframeHere ? 'pointer' : 'not-allowed',
          }}
        >
          +
        </button>
      </div>
    );
  };

  const totalHeight = CLIP_ROW_H + (expanded ? EXPANDABLE_PROPERTIES.length * PROP_ROW_H : 0);

  return (
    <div style={{ height: totalHeight, position: 'relative' }}>
      {row('opacity', CLIP_ROW_H, 0)}
      {expanded && EXPANDABLE_PROPERTIES.map((p, i) => row(p, PROP_ROW_H, CLIP_ROW_H + i * PROP_ROW_H))}
    </div>
  );
}
