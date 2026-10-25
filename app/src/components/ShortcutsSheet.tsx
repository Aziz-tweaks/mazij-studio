import { Icon } from './Icon';
import { useStudio } from '../state/StudioContext';

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
const CMD = isMac ? '⌘' : 'Ctrl';
const SHIFT = isMac ? '⇧' : 'Shift';
const ALT = isMac ? '⌥' : 'Alt';

type Row = { keys: string[][]; label: string };

/** لوحة الاختصارات (`?`) — كلّ ما يعمل بالكيبورد، في ثلاثة أعمدة بالأعماق الثلاثة.
 *
 * المالك (٢٤ أكتوبر ٢٠٢٦): «أهمّ شي الاختصار». والاختصار الذي لا يُرى لا يوجد؛ فكلّ
 * حرفٍ هنا يعمل فعلًا، ومكتوبٌ بالرموز التي يعرفها من جاء من أداة المتّجهات والأداة الشائعة وكاب
 * كت. والمفاتيح تُطابَق بموضعها (`e.code`) لا بحرفها، فتعمل والكيبورد عربي. */
export function ShortcutsSheet() {
  const { state, actions, dict: L } = useStudio();
  if (!state.shortcutsOpen) return null;

  const general: Row[] = [
    { keys: [[CMD, 'K']], label: L.sc_search },
    { keys: [[CMD, 'Z']], label: L.sc_undo },
    { keys: [[SHIFT, CMD, 'Z']], label: L.sc_redo },
    { keys: [[CMD, 'C']], label: L.sc_copy },
    { keys: [[CMD, 'X']], label: L.sc_cut },
    { keys: [[CMD, 'V']], label: L.sc_paste },
    { keys: [[CMD, 'D']], label: L.sc_dup },
    { keys: [[CMD, 'A']], label: L.sc_all },
    { keys: [['⌫']], label: L.sc_delete },
    { keys: [[CMD, 'E']], label: L.sc_export },
    { keys: [[CMD, 'J']], label: L.sc_mizo },
    { keys: [[CMD, '\\']], label: L.sc_panels },
    { keys: [['Esc']], label: L.sc_esc },
    { keys: [['?']], label: L.sc_title },
  ];
  const design: Row[] = [
    { keys: [['V']], label: L.sc_select },
    { keys: [['A']], label: L.sc_direct },
    { keys: [['P']], label: L.sc_pen },
    { keys: [['T']], label: L.sc_text },
    { keys: [['M'], ['R']], label: L.sc_rect },
    { keys: [['L']], label: L.sc_ellipse },
    { keys: [['H']], label: L.sc_hand },
    { keys: [['I']], label: L.sc_image },
    { keys: [['Space']], label: L.sc_pan },
    { keys: [['Enter']], label: L.sc_edit_text },
    { keys: [['←', '↑', '→', '↓']], label: L.sc_nudge },
    { keys: [[CMD, 'G'], [SHIFT, CMD, 'G']], label: `${L.sc_group} / ${L.sc_ungroup}` },
    { keys: [[CMD, ']'], [CMD, '[']], label: L.sc_front },
    { keys: [[SHIFT, CMD, ']'], [SHIFT, CMD, '[']], label: L.sc_forward },
    { keys: [[CMD, '2']], label: L.sc_lock },
    { keys: [[CMD, '3']], label: L.sc_hide },
    { keys: [[CMD, '+'], [CMD, '−']], label: L.sc_zoom },
    { keys: [[CMD, '0']], label: L.sc_fit },
  ];
  const motion: Row[] = [
    { keys: [['Space']], label: L.sc_play },
    { keys: [[CMD, 'B']], label: L.sc_split },
    { keys: [['←'], ['→']], label: L.sc_frame },
    { keys: [[ALT, CMD, 'C']], label: L.sm_copy_anim },
    { keys: [[ALT, CMD, 'V']], label: L.sm_paste_anim },
  ];

  return (
    <div
      data-testid="shortcuts-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={L.sc_title}
      onClick={actions.closeShortcuts}
      style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'var(--overlay)', display: 'grid', placeItems: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 920, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--lineStrong)', borderRadius: 'calc(var(--r) + 2px)', boxShadow: '0 30px 80px rgba(0,0,0,.5)', padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16, animation: 'mz-pop .16s ease' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon size={20} path="M2.5 5.5h15v9h-15zM5.5 8.5h.01M8.5 8.5h.01M11.5 8.5h.01M14.5 8.5h.01M6.5 11.5h7" />
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, flex: 1 }}>{L.sc_title}</h2>
          <button
            data-testid="shortcuts-close"
            onClick={actions.closeShortcuts}
            aria-label={L.cancel}
            className="mz-btn"
            style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}
          >
            <Icon size={16} path="M5 5l10 10M15 5L5 15" />
          </button>
        </div>
        <p style={{ margin: '-8px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>{L.sc_hint}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 22 }}>
          <Column title={L.sc_general} rows={general} tone="var(--accentText)" />
          <Column title={L.sc_design} rows={design} tone="var(--vector)" />
          <Column title={L.sc_motion} rows={motion} tone="var(--motion)" />
        </div>
      </div>
    </div>
  );
}

function Column({ title, rows, tone }: { title: string; rows: Row[]; tone: string }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: tone }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 30, borderBottom: '1px solid var(--line)' }}>
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text)' }}>{r.label}</span>
          <span dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            {r.keys.map((combo, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {i > 0 && <span style={{ color: 'var(--faint)', fontSize: 11, marginInlineEnd: 3 }}>/</span>}
                {combo.map((k) => (
                  <kbd key={k} className="mz-kbd">{k}</kbd>
                ))}
              </span>
            ))}
          </span>
        </div>
      ))}
    </section>
  );
}
