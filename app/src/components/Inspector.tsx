import { Icon } from './Icon';
import { MEDIUM_SURFACES, seg } from '../data/constants';
import { useStudio } from '../state/StudioContext';
import { PropsTab } from './left-panel/PropsTab';
import { Timeline } from './Timeline';

/** المفتش — خصائص ما حدّدته، على الحافّة الأخرى من اللوحة، حاضرٌ دائمًا.
 *
 * **ورفُّ الطبقات تحته للمستند الساكن.** قائمةُ الطبقات تعيش في `Timeline` ولا بيت
 * لها غيره (انظر `App.tsx`)، وكانت تأكل ثلث الشاشة السفليّ تحت بوستر لا زمن له. هنا
 * تصير ما هي في أداة المتّجهات: لوحُ طبقاتٍ تحت لوح الخصائص، يُطوى بنقرة. وللمستند
 * المُوقَّت الطبقةُ هي المقطع (القاعدة ٤ في التصوّر)، فطبقاتُه مساراتُ الخطّ
 * الزمنيّ أسفل الشاشة ولا تتكرّر هنا.
 *
 * ويُطوى المفتش كلّه إلى شريطٍ رفيع حين يريد المصمّم اللوحةَ كاملة (⌘\\ يطوي كلّ
 * الألواح). */
export function Inspector() {
  const { state, actions, dict: L, dir } = useStudio();
  const surfaces = MEDIUM_SURFACES[state.medium];
  const mirror = dir === 'rtl' ? 'scaleX(-1)' : 'none';

  if (!state.inspectorOpen) {
    return (
      <button
        data-testid="inspector-open"
        onClick={actions.toggleInspector}
        title={L.insp_open}
        aria-label={L.insp_open}
        className="mz-rail-btn"
        style={{ width: 36, flex: 'none', border: 0, borderInlineStart: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 14 }}
      >
        <Icon size={16} path="M12 5l-5 5 5 5" style={{ transform: mirror }} />
        <span style={{ writingMode: 'vertical-rl', fontSize: 12, letterSpacing: 1 }}>{L.insp_design}</span>
      </button>
    );
  }

  const s = seg(true);
  return (
    <aside
      data-testid="inspector"
      style={{
        width: 'clamp(264px, 23vw, 300px)',
        flex: 'none',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        borderInlineStart: '1px solid var(--line)',
      }}
    >
      <div style={{ height: 44, flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ flex: 1, display: 'flex', gap: 2 }}>
          <button
            data-panel-tab="props"
            onClick={() => actions.setPanel('props')}
            style={{ height: 28, padding: '0 12px', border: 0, borderRadius: 'calc(var(--rs) - 2px)', fontSize: 12, fontWeight: 600, background: s.bg, color: s.fg, boxShadow: s.sh }}
          >
            {L.insp_design}
          </button>
        </div>
        <button
          data-testid="inspector-close"
          onClick={actions.toggleInspector}
          title={L.insp_close}
          aria-label={L.insp_close}
          className="mz-btn"
          style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}
        >
          <Icon size={16} path="M8 5l5 5-5 5" style={{ transform: mirror }} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <PropsTab />
      </div>
      {surfaces.layersDock && <Timeline timed={false} docked />}
    </aside>
  );
}
