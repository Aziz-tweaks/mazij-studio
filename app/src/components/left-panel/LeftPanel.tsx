import { Icon } from '../Icon';
import { seg } from '../../data/constants';
import { useStudio } from '../../state/StudioContext';
import { PropsTab } from './PropsTab';
import { LibraryTab } from './LibraryTab';
import { AssetsTab } from './AssetsTab';
import { AiTab } from './AiTab';

export function LeftPanel() {
  const { state, actions, dict: L, dir } = useStudio();
  const panelOpen = !!state.panel;
  const mirror = dir === 'rtl' ? 'scaleX(-1)' : 'none';

  return (
    <div
      style={{
        width: panelOpen ? 'clamp(272px, 30vw, 320px)' : 44,
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderInlineStartWidth: 'calc(1px + 0px)',
        borderRadius: 'var(--r)',
        boxShadow: 'var(--shadow)',
        transition: 'width .25s ease',
      }}
    >
      {panelOpen ? (
        <>
          <div style={{ height: 46, flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ flex: 1, display: 'flex', padding: 3, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2 }}>
              {/* «العناصر» — اسم تبويب الأداة الشائعة نفسه للوح الذي تحته الأشكال
                  (`re-canva-flows.md` §2.1). ولم يُسمَّ «المكتبة» لأن ذلك اسم تبويب
                  `assets` القائم فعلًا (`L.assets === 'المكتبة'`). */}
              {(['props', 'library', 'assets', 'ai'] as const).map((id) => {
                const s = seg(state.panel === id);
                return (
                  <button key={id} data-panel-tab={id} onClick={() => actions.setPanel(id)} style={{ flex: 1, height: 26, border: 0, borderRadius: 'calc(var(--rs) - 2px)', fontSize: 11, fontWeight: 600, background: s.bg, color: s.fg, boxShadow: s.sh }}>
                    {L[id]}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => actions.setPanel(null)}
              title={L.collapse}
              style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}
            >
              <Icon size={16} path="M8 5l5 5-5 5" style={{ transform: mirror }} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {state.panel === 'props' && <PropsTab />}
            {state.panel === 'library' && <LibraryTab />}
            {state.panel === 'assets' && <AssetsTab />}
            {state.panel === 'ai' && <AiTab />}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0' }}>
          <button onClick={() => actions.setPanel('props')} title={L.props} style={collapsedBtnStyle()}>
            <Icon size={18} path="M3 6h14M3 10h14M3 14h14M7 4.5v3M13 8.5v3M9 12.5v3" />
          </button>
          <button onClick={() => actions.setPanel('library')} title={L.library} style={collapsedBtnStyle()}>
            <Icon size={18} path="M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z" fill="none" />
          </button>
          <button onClick={() => actions.setPanel('assets')} title={L.assets} style={collapsedBtnStyle()}>
            <Icon size={18} path="M3 5h5l2 2h7v9H3z" fill="none" />
          </button>
          <button onClick={() => actions.setPanel('ai')} title={L.ai} style={collapsedBtnStyle('var(--accent)')}>
            <Icon size={18} path="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6zM16 14l.6 1.4 1.4.6-1.4.6L16 18l-.6-1.4-1.4-.6 1.4-.6z" />
          </button>
        </div>
      )}
    </div>
  );
}

function collapsedBtnStyle(color = 'var(--muted)') {
  return { width: 32, height: 32, display: 'grid' as const, placeItems: 'center' as const, border: 0, borderRadius: 'var(--rs)', background: 'transparent', color };
}
