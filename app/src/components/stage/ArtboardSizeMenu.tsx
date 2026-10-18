import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { SIZES, CUSTOM_SIZE_IDX, ICONS, MEDIUM_CHIP, sizeAt, dimsOf, nameOf, glyphStyle } from '../../data/constants';
import { documentDuration, formatDurationSec } from '../../lib/animTimeline';
import { useStudio } from '../../state/StudioContext';

/** Real dropdown for the artboard size control (top-start of the stage): click opens
 * a list of every preset plus a custom-size entry, the active one is marked, and
 * selecting one applies it and closes the menu. Keyboard: Esc closes, ↑/↓ move the
 * highlighted row, Enter selects it. Closes on outside click. */
export function ArtboardSizeMenu() {
  const { state, actions, dict: L } = useStudio();
  // شارةُ الطبيعة بجدولٍ لا بشرط — انظر `MEDIUM_CHIP`.
  const chip = MEDIUM_CHIP[state.medium];
  const docDuration = documentDuration(state.elements.map((e) => e.anim), state.fps);
  const dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [customW, setCustomW] = useState(state.customW);
  const [customH, setCustomH] = useState(state.customH);
  const rootRef = useRef<HTMLDivElement>(null);

  const rows: Array<{ id: string; ar: string; en: string; w: number; h: number; custom?: boolean }> = [...SIZES, { id: 'custom', ar: '', en: '', w: state.customW, h: state.customH, custom: true }];
  const activeIdx = state.sizeIdx === CUSTOM_SIZE_IDX ? rows.length - 1 : state.sizeIdx;
  const current = sizeAt(state.sizeIdx, state.customW, state.customH);

  useEffect(() => {
    if (!open) return;
    setHi(activeIdx);
    setCustomW(state.customW);
    setCustomH(state.customH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const applyRow = (idx: number) => {
    const row = rows[idx];
    if (state.magicResizeOn) {
      if (row.custom) actions.applyMagicResize(CUSTOM_SIZE_IDX, customW, customH);
      else actions.applyMagicResize(idx);
    } else if (row.custom) {
      actions.setCustomSize(customW, customH);
    } else {
      actions.setSizeIdx(idx);
    }
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((v) => Math.min(rows.length - 1, v + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((v) => Math.max(0, v - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!rows[hi].custom) applyRow(hi);
    }
  };

  return (
    <div ref={rootRef} style={{ position: 'absolute', top: 12, insetInlineStart: 12, zIndex: 3 }} onKeyDown={onKeyDown}>
      <button
        data-testid="size-menu-button"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 30,
          padding: '0 10px',
          border: '1px solid var(--line)',
          borderRadius: 'var(--rs)',
          background: 'var(--surface)',
          color: 'var(--text)',
          fontSize: 12,
          fontWeight: 500,
          boxShadow: 'var(--shadow)',
        }}
      >
        <span>{nameOf(current, state.lang)}</span>
        <span dir="ltr" style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
          {dimsOf(current)}
        </span>
        {/* **طبيعةُ المستند ومدّتُه، مقروءتان في أيّ لحظة.**
         *
         * هذه هي التنازلُ الوحيد للمالك في المرحلة ١، وهو ليس بوّابةً: فقد سأل أن
         * يَسأل البرنامجُ «صورةٌ أم فيديو؟» عند الإقلاع، والجوابُ أنّ البرنامج
         * يَسأل فعلًا — «ريل إنستقرام» **هو** الجواب — وكان يُهمله. فالعلاجُ أن
         * يصير الجوابُ حاملَ حِمل (ثلاثةُ أسطح)، وأن يكون **مقروءًا باستمرار** لا
         * مسؤولًا عنه مرّةً واحدة: «هل فهمني فيديو؟» سؤالٌ جوابُه بالنظر، في أيّ
         * لحظة، على نفس البطاقة التي يُبدَّل منها المقاس.
         *
         * والمدّةُ **مشتقّة** لا الرقمَ ٥ — وهي نفسها التي تُصدَّر، ونفسها التي
         * يُعلنها تذييلُ حوار التصدير. */}
        <span
          data-testid="artboard-medium"
          data-medium={state.medium}
          data-duration={chip.showsDuration ? Math.round(docDuration * 1000) / 1000 : ''}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 18,
            padding: '0 6px',
            borderRadius: 999,
            background: chip.showsDuration ? 'var(--accentSoft)' : 'var(--surface2)',
            color: chip.showsDuration ? 'var(--accent)' : 'var(--muted)',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          <Icon size={10} path={ICONS[chip.icon]} />
          {chip.showsDuration ? `${L[chip.labelKey]} · ${formatDurationSec(docDuration, state.lang)}` : L[chip.labelKey]}
        </span>
        <Icon size={14} path="M5 8l5 5 5-5" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && (
        <div
          data-testid="size-menu"
          dir={dir}
          role="listbox"
          style={{
            position: 'absolute',
            top: 36,
            insetInlineStart: 0,
            width: 240,
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
          <button
            data-testid="magic-resize-toggle"
            onClick={(e) => {
              e.stopPropagation();
              actions.setMagicResizeOn(!state.magicResizeOn);
            }}
            title={L.magic_resize_hint}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 28,
              padding: '0 8px',
              margin: '0 0 2px',
              border: `1px solid ${state.magicResizeOn ? 'var(--accent)' : 'var(--line)'}`,
              borderRadius: 'var(--rs)',
              background: state.magicResizeOn ? 'var(--accentSoft)' : 'transparent',
              color: state.magicResizeOn ? 'var(--accent)' : 'var(--muted)',
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: '50%', border: `1.5px solid currentColor`, display: 'grid', placeItems: 'center', flex: 'none' }}>
              {state.magicResizeOn && <Icon size={9} strokeWidth={2.6} path="M4 10l4 4 8-8" />}
            </span>
            <span style={{ flex: 1, textAlign: 'start' }}>{L.magic_resize}</span>
          </button>
          {rows.map((row, idx) => {
            const active = idx === activeIdx;
            const highlighted = idx === hi;
            if (row.custom) {
              return (
                <div
                  key="custom"
                  data-testid="size-option-custom"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: 8,
                    borderRadius: 'var(--rs)',
                    background: active || highlighted ? 'var(--accentSoft)' : 'transparent',
                  }}
                >
                  <button
                    onMouseEnter={() => setHi(idx)}
                    onClick={() => applyRow(idx)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, border: 0, background: 'transparent', color: 'var(--text)', fontSize: 12.5, fontWeight: 500, textAlign: 'start' }}
                  >
                    <Icon size={16} path="M10 4v12M4 10h12" />
                    <span style={{ flex: 1 }}>{L.custom_size}</span>
                    {active && <Icon size={14} path="M4 10l4 4 8-8" />}
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingInlineStart: 26 }} dir="ltr">
                    <input
                      type="number"
                      min={1}
                      value={customW}
                      data-testid="custom-size-w"
                      onChange={(e) => setCustomW(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                      style={{ width: 64, height: 26, border: '1px solid var(--line)', borderRadius: 'calc(var(--rs) - 2px)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 11, padding: '0 6px' }}
                    />
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>×</span>
                    <input
                      type="number"
                      min={1}
                      value={customH}
                      data-testid="custom-size-h"
                      onChange={(e) => setCustomH(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                      style={{ width: 64, height: 26, border: '1px solid var(--line)', borderRadius: 'calc(var(--rs) - 2px)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 11, padding: '0 6px' }}
                    />
                    <button
                      data-testid="custom-size-apply"
                      onClick={() => applyRow(idx)}
                      style={{ marginInlineStart: 'auto', height: 26, padding: '0 10px', border: 0, borderRadius: 'calc(var(--rs) - 2px)', background: 'var(--accent)', color: 'var(--onAccent)', fontSize: 11, fontWeight: 600 }}
                    >
                      {L.apply}
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <button
                key={row.id}
                data-testid={`size-option-${row.id}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setHi(idx)}
                onClick={() => applyRow(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  height: 36,
                  padding: '0 8px',
                  border: 0,
                  borderRadius: 'var(--rs)',
                  background: active || highlighted ? 'var(--accentSoft)' : 'transparent',
                  color: 'var(--text)',
                  fontSize: 12.5,
                  textAlign: 'start',
                }}
              >
                <span style={{ width: 18, height: 18, display: 'grid', placeItems: 'center', color: 'var(--muted)', flex: 'none' }}>
                  {/* مَقبضٌ للقياس. كانت المواصفةُ تَعُدّ `svg` داخل الصفّ وتسمّي
                      ذلك «كلُّ صفٍّ يَعرض شكلَ نسبته»، والشكلُ `span` لا `svg` —
                      فالذي كانت تَعُدّه هو علامةُ **الصفّ النشط** وحدها. */}
                  <span data-glyph="" style={glyphStyle({ w: row.w, h: row.h }, 14)} />
                </span>
                <span style={{ flex: 1, fontWeight: 500 }}>{state.lang === 'ar' ? row.ar : row.en}</span>
                <span dir="ltr" style={{ color: 'var(--muted)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                  {row.w} × {row.h}
                </span>
                {active && <Icon size={14} path="M4 10l4 4 8-8" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
