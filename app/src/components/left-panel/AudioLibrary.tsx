import { useStudio } from '../../state/StudioContext';
import type { AudioElement } from '../../state/elements';
import { elementDisplayName } from '../../lib/layerNames';

/** لوح «صوت» (٢٥ أكتوبر ٢٠٢٦) — كان «قريبًا» منذ بُني شريطُ الإضافة.
 *
 * زرٌّ واحدٌ يفتح منتقي الملفّات ويضع الصوتَ **عند المؤشّر** (`insertAudioTool`)، وتحته
 * أصواتُ المشروع: نقرةٌ تحدّد الطبقةَ فيظهر علوُّها وكتمُها في لوح الخصائص، وصفُّها في
 * الخطّ الزمنيّ بموجته يُنقَل ويُقصّ كأيّ مقطع. ولا مكتبةَ موسيقى جاهزة: لا حقوقَ لمزيج
 * في موسيقى أحد، والوعدُ بها كذب. */
export function AudioLibrary() {
  const { state, actions, dict: L } = useStudio();
  const audios = state.elements.filter((e): e is AudioElement => e.type === 'audio');
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <div data-testid="audio-library" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        data-testid="audio-add"
        className="mz-tile"
        onClick={() => void actions.insertAudioTool()}
        style={{ height: 52, border: '1px dashed var(--lineStrong)', borderRadius: 12, background: 'var(--surface2)', color: 'var(--text)', fontSize: 13.5, fontWeight: 700 }}
      >
        {L.audio_add}
      </button>
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.7, color: 'var(--muted)' }}>{L.audio_add_hint}</p>
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.7, color: 'var(--muted)' }}>{L.audio_drop_hint}</p>
      {state.audioError && (
        <p data-testid="audio-error" style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: 'var(--danger)' }}>
          {state.audioError}
        </p>
      )}
      <div className="mz-label" style={{ marginTop: 6 }}>{L.audio_in_doc}</div>
      {audios.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{L.audio_none}</div>
      ) : (
        audios.map((a) => {
          const active = state.selectedIds.includes(a.id);
          return (
            <button
              key={a.id}
              data-testid={`audio-item-${a.id}`}
              onClick={() => actions.selectElement(a.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 10px', border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--rs)', background: active ? 'var(--accentSoft)' : 'transparent', color: 'var(--text)', fontSize: 12, textAlign: 'start' }}
            >
              <svg width={14} height={14} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                <path d="M3 8v4M6.5 5v10M10 3v14M13.5 6v8M17 8.5v3" />
              </svg>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{elementDisplayName(a, L)}</span>
              <span dir="ltr" style={{ color: 'var(--muted)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{fmt(a.anim.duration)}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
