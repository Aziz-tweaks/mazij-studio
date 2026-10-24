import { Icon } from './Icon';
import { ICONS } from '../data/constants';
import { cmdListFor, useStudio } from '../state/StudioContext';

export function CommandPalette() {
  const { state, actions, dict: L } = useStudio();
  if (!state.cmdOpen) return null;

  const list = cmdListFor(state.cmdQuery, state);

  return (
    <div
      onClick={actions.closeCmd}
      style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--overlay)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12vh' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'calc(var(--r) + 2px)', boxShadow: '0 30px 80px rgba(0,0,0,.35)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 54, borderBottom: '1px solid var(--line)' }}>
          <Icon path="M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM13.5 13.5L17 17" style={{ color: 'var(--muted)' }} />
          <input
            autoFocus
            value={state.cmdQuery}
            onChange={(e) => actions.setCmdQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                actions.moveCmdSel(1);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                actions.moveCmdSel(-1);
              } else if (e.key === 'Enter') {
                actions.runSelectedCmd();
              }
            }}
            placeholder={L.cmd_ph}
            style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 0, fontSize: 15 }}
          />
          <kbd dir="ltr" style={{ fontFamily: 'inherit', fontSize: 11, padding: '1px 6px', borderRadius: 5, background: 'var(--surface2)', color: 'var(--muted)' }}>Esc</kbd>
        </div>
        <div style={{ padding: 6, maxHeight: 360, overflow: 'auto' }}>
          {list.map((c, i) => (
            <button
              key={c.en}
              onClick={() => actions.runCommand(c)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, height: 40, padding: '0 10px', border: 0, borderRadius: 'var(--rs)', background: i === state.cmdSel ? 'var(--surface2)' : 'transparent', color: 'var(--text)', fontSize: 13, textAlign: 'start' }}
            >
              <span style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--surface2)', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
                <Icon size={16} path={ICONS[c.icon]} />
              </span>
              <span style={{ flex: 1 }}>{state.lang === 'ar' ? c.ar : c.en}</span>
              <kbd dir="ltr" style={{ fontFamily: 'inherit', fontSize: 11, padding: '1px 6px', borderRadius: 5, background: 'var(--surface2)', color: 'var(--muted)' }}>{c.k}</kbd>
            </button>
          ))}
          {list.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>{L.no_results}</div>}
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--muted)' }}>{L.cmd_hint}</div>
      </div>
    </div>
  );
}
