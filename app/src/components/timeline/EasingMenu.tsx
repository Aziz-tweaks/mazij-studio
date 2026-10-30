import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import { EASING_IDS, DEFAULT_BEZIER, applyEasing, type EasingId } from '../../lib/easing';
import { useStudio } from '../../state/StudioContext';
import { THEME } from '../../theme/theme';
import { BezierEditor } from './BezierEditor';

export const EASE_LABEL_KEY: Record<EasingId, string> = {
  linear: 'ease_linear',
  easeIn: 'ease_in',
  easeOut: 'ease_out',
  expoOut: 'ease_expo',
  easeInOut: 'ease_in_out',
  back: 'ease_back',
  bounce: 'ease_bounce',
  hold: 'ease_hold',
  custom: 'ease_custom',
};

function miniCurveD(easing: EasingId, bezier: readonly [number, number, number, number]) {
  const w = 26;
  const h = 14;
  // الدرجةُ تُرسَم درجةً: عينةُ ١٠ نقاطٍ كانت ستُظهر آخرَها خطًّا مائلًا كاذبًا.
  if (easing === 'hold') return `M 0 ${h} L ${w} ${h} L ${w} 0`;
  const steps = 10;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    const v = applyEasing(easing, bezier as [number, number, number, number], p);
    const x = p * w;
    const y = h - Math.max(0, Math.min(1.15, v)) * h;
    d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d;
}

/** Real easing picker for the currently selected element's clip, replacing the old
 * disabled 'قريبًا' button: ready-made presets plus a 'مخصص' entry that expands the
 * manual bezier editor in place. */
export function EasingMenu() {
  const { state, actions, dict: L } = useStudio();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const el = state.elements.find((e) => e.id === state.sel) ?? null;

  const toggleOpen = () => {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setAnchor({ left: r.left, bottom: window.innerHeight - r.top + 6 });
    }
    setOpen((v) => !v);
  };

  // The dropdown (and its nested bezier editor) is rendered through a portal into
  // document.body so it isn't clipped by the timeline panel's own `overflow:hidden`
  // (needed for its collapse/expand animation) — outside-click detection has to
  // check both the trigger and the portaled panel, since they're no longer siblings.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!el) {
    return (
      <>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{L.easing}</span>
        <button disabled title={L.no_easing_target} style={{ height: 26, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 11, opacity: 0.45, cursor: 'default' }}>
          {L.ease_out}
        </button>
      </>
    );
  }

  const easing = el.anim.easing;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{L.easing}</span>
      <button
        ref={buttonRef}
        data-testid="easing-menu-button"
        onClick={toggleOpen}
        style={{ height: 26, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}
      >
        <svg width={26} height={14} viewBox="0 0 26 14" fill="none" stroke="currentColor" strokeWidth={1.4}>
          <path d={miniCurveD(easing, el.anim.bezier)} />
        </svg>
        {L[EASE_LABEL_KEY[easing] as keyof typeof L] as string}
        <Icon size={12} path="M5 8l5 5 5-5" />
      </button>

      {open &&
        anchor &&
        createPortal(
          <div
            ref={panelRef}
            data-testid="easing-menu"
            style={{
              // Portaled straight to document.body (see the comment above) — outside
              // the themed root div, so CSS custom properties like --accent don't
              // cascade in naturally. Re-applying them here keeps the dropdown and
              // the bezier editor it can contain themed correctly.
              ...(THEME.vars as CSSProperties),
              position: 'fixed',
              left: anchor.left,
              bottom: anchor.bottom,
              zIndex: 50,
              width: 190,
              padding: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              border: '1px solid var(--line)',
              borderRadius: 'var(--r)',
              background: 'var(--surface)',
              boxShadow: 'var(--shadow)',
            }}
          >
            {EASING_IDS.map((id) => {
              const active = easing === id;
              return (
                <button
                  key={id}
                  data-testid={`easing-option-${id}`}
                  onClick={() => {
                    actions.setElementEasing(el.id, id);
                    if (id !== 'custom') setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    height: 30,
                    padding: '0 8px',
                    border: 0,
                    borderRadius: 'var(--rs)',
                    background: active ? 'var(--accentSoft)' : 'transparent',
                    color: 'var(--text)',
                    fontSize: 12,
                    textAlign: 'start',
                  }}
                >
                  <svg width={26} height={14} viewBox="0 0 26 14" fill="none" stroke="currentColor" strokeWidth={1.4}>
                    <path d={miniCurveD(id, id === 'custom' ? el.anim.bezier : DEFAULT_BEZIER)} />
                  </svg>
                  <span style={{ flex: 1 }}>{L[EASE_LABEL_KEY[id] as keyof typeof L] as string}</span>
                  {active && <Icon size={13} path="M4 10l4 4 8-8" />}
                </button>
              );
            })}
            {easing === 'custom' && (
              <div style={{ padding: 6, borderTop: '1px solid var(--line)', marginTop: 2 }}>
                <BezierEditor elementId={el.id} />
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
