import { useRef } from 'react';
import type { AnimProperty, DocElement } from '../../state/elements';
import { ANIM_PROPERTIES } from '../../state/elements';
import { animTimeAt, documentDuration, frameDuration, setKeyframe, snapToFrame, timelineSpan, timelineTimeOf } from '../../lib/animTimeline';
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
  // زرّ «+» لم يبقَ له حالةُ تعطيل. كان يُعطَّل إذا كان المؤشّر **قبل** بداية
  // المقطع، لأنّ كسرًا سالبًا لا معنى له؛ ومفتاحٌ قبل البداية الآن زمنُ حركةٍ سالب
  // وهو مشروع. فسقطت `canKeyframeAtPlayhead` و`disabled` و`kf_outside_clip` معه —
  // **وهذا ليس تغطيةً لسطحٍ معطوب بل إزالةُ منعٍ لم يبقَ له سبب**: الزرّ يعمل في
  // كلّ موضعٍ الآن، ولم يُستبدَل تعطيلُه بصمتٍ ولا بـ«قريبًا».
  const span = timelineSpan(documentDuration(state.elements.map((e) => e.anim), state.fps));
  const frame = frameDuration(state.fps);
  const leftPct = (anim.start / span) * 100;
  const widthPct = (anim.duration / span) * 100;

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
    const startKfTime = startKf?.time ?? 0;
    if (kind === 'kf' && kfId) onSelectKf({ elId: el.id, property, kfId });
    let moved = false;
    actions.beginElementEdit();
    (e.target as Element).setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const deltaSec = ((ev.clientX - startClientX) / rectWidth) * span;
      if (Math.abs(ev.clientX - startClientX) > 2) moved = true;
      actions.liveUpdateElements((els) =>
        els.map((e2) => {
          if (e2.id !== el.id) return e2;
          const a = e2.anim;
          if (kind === 'move') {
            // **بلا سقف.** كان الحجزُ إلى `TIMELINE_DURATION - duration`، أي أنّ
            // مقطعًا لا يستطيع أن ينتهي بعد الثانية الخامسة بحال. وقد صار الطولُ
            // مشتقًّا من المقاطع، فالمقطعُ هو الذي يُطيل المستند لا العكس.
            const newStart = Math.max(0, startStart + deltaSec);
            return { ...e2, anim: { ...a, start: newStart } };
          }
          if (kind === 'resize-left') {
            const end = startStart + startDuration;
            // أدنى طولٍ **إطارٌ واحدٌ بمعدّل المستند**، لا عُشرَ ثانيةٍ مثبَّتًا —
            // وذاك كان ثلاثةَ إطاراتٍ عند ٣٠ وستّةً عند ٦٠.
            const newStart = clamp(startStart + deltaSec, 0, end - frame);
            return { ...e2, anim: { ...a, start: newStart, duration: end - newStart } };
          }
          if (kind === 'resize-right') {
            const newDuration = Math.max(frame, startDuration + deltaSec);
            return { ...e2, anim: { ...a, duration: newDuration } };
          }
          // kind === 'kf' — الماسة تُسحَب بالثواني مباشرةً، وتمرّ بقُمع الكتابة
          // الواحد (`setKeyframe`). وقبل ذلك كان هذا المسار يكتب الزمن بنفسه
          // بـ`clamp(…, 0, 1)` و**بلا أيّ معالجةٍ للتصادم**: ماستان على الزمن نفسه
          // وإحداهما تحت الأخرى إلى الأبد. فصار التصادمُ استبدالًا صريحًا يحفظ
          // `id` و`easing` و`bezier` للمفتاح القائم.
          const track = a.tracks[property];
          if (!track || !kfId) return e2;
          const dragged = track.find((k) => k.id === kfId);
          if (!dragged) return e2;
          const newTime = snapToFrame(startKfTime + deltaSec, state.fps);
          const without = track.filter((k) => k.id !== kfId);
          return { ...e2, anim: { ...a, tracks: { ...a.tracks, [property]: setKeyframe(without, { ...dragged, time: newTime }) } } };
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
        const edgeTime = kind === 'resize-left' ? (anim.sourceIn ?? 0) : (anim.sourceIn ?? 0) + anim.duration;
        const edgeKf = anim.tracks.opacity?.find((k) => Math.abs(k.time - edgeTime) < frame / 2);
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
          // **من زمنٍ مطلقٍ لا من كسرٍ في المقطع.** كان الموضع
          // `(start + t × duration) / TIMELINE_DURATION`، فكان كلُّ تغييرٍ في
          // المدّة يُحرِّك كلَّ ماسةٍ على الشاشة.
          const pct = (timelineTimeOf(anim, kf.time) / span) * 100;
          const selected = selectedKf?.elId === el.id && selectedKf.property === property && selectedKf.kfId === kf.id;
          return (
            <div
              key={kf.id}
              data-testid={`kf-${el.id}-${kf.id}`}
              onPointerDown={(e) => startGesture('kf', property, kf.id, e)}
              // بالثواني لا بنسبةٍ من المقطع. كان التلميح يقول «٥١٪» — أي نسبةَ
              // المفتاح من مقطعه، وهو رقمٌ لا يستطيع المصمّم أن يفعل به شيئًا.
              title={`${kf.time.toFixed(3)}s · ${(kf.value * 100).toFixed(0)}%`}
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
