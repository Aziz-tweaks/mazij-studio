import { Icon } from '../Icon';
import { useStudio } from '../../state/StudioContext';

/** «اللوحات» بجانب المقاس، أعلى اللوحة: المقاسُ يقول أيّ وجهةٍ هذه اللوحة، وهذا
 * يقول كم لوحةً في المستند ويفتح إدارتها. كان زرًّا بين تسعة في الشريط العلويّ. */
export function ArtboardsChip() {
  const { state, actions, dict: L } = useStudio();
  const n = state.artboards.length;
  return (
    <button
      data-testid="open-artboards-btn"
      onClick={(e) => {
        e.stopPropagation();
        actions.openArtboards();
      }}
      title={L.artboards_title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
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
      <Icon size={14} path="M3 4h6v6H3zM11 4h6v6h-6zM3 12h6v4H3zM11 12h6v4h-6z" />
      <span>{L.pages}</span>
      <span dir="ltr" style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 10.5, display: 'grid', placeItems: 'center', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
    </button>
  );
}
