import { Icon } from './Icon';
import { useStudio } from '../state/StudioContext';
import { LibraryTab } from './left-panel/LibraryTab';
import { AssetsTab } from './left-panel/AssetsTab';
import { AiTab, MizoAvatar } from './left-panel/AiTab';

/** لوح الإضافة بجانب شريط الإضافة — يطلع لمّا تطلبه، ويختفي لمّا تخلص.
 *
 * كان «اللوح الأيسر» أربعةَ تبويبات متجاورة: التصميم والعناصر والمكتبة والمساعد،
 * واحدٌ منها فقط يُرى. فكانت خصائصُ ما حدّدته تختفي كلّما فتحتَ الأشكال لتضيف شكلًا.
 * انفصلا الآن: الخصائص في المفتش على الحافّة الأخرى دائمًا (`Inspector.tsx`)، وهذا
 * اللوح للإضافة وحدها — ويُغلَق تلقائيًّا حين ينتقل المصمّم من الإضافة إلى التحرير
 * (`leaveInsertLibrary`)، فتأخذ اللوحةُ مساحتها. */
export function ContentPanel() {
  const { state, actions, dict: L } = useStudio();
  const panel = state.panel;
  if (panel !== 'library' && panel !== 'assets' && panel !== 'ai') return null;

  const title =
    panel === 'ai'
      ? L.ai_name
      : panel === 'assets'
        ? state.assetsTab === 'colors'
          ? L.rail_brand
          : L.rail_uploads
        : state.libraryTool === 'text'
          ? L.rail_text
          : state.libraryTool === 'shape'
            ? L.rail_elements
            : (L[`tool_${state.libraryTool}` as keyof typeof L] as string);

  return (
    <aside
      data-testid="content-panel"
      data-panel={panel}
      style={{
        width: 'clamp(260px, 22vw, 300px)',
        flex: 'none',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        borderInlineEnd: '1px solid var(--line)',
      }}
    >
      <div style={{ height: 44, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 0 8px', borderBottom: '1px solid var(--line)' }}>
        {panel === 'ai' && <MizoAvatar size={22} />}
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{title}</span>
        <button
          data-testid="content-panel-close"
          onClick={() => actions.setPanel('props')}
          title={L.collapse}
          aria-label={L.collapse}
          className="mz-btn"
          style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}
        >
          <Icon size={14} path="M5 5l10 10M15 5L5 15" />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {panel === 'library' && <LibraryTab />}
        {panel === 'assets' && <AssetsTab />}
        {panel === 'ai' && <AiTab />}
      </div>
    </aside>
  );
}
