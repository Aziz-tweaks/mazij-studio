import { useRef, useState } from 'react';
import { useStudio } from '../../state/StudioContext';
import type { AudioElement } from '../../state/elements';
import { elementDisplayName } from '../../lib/layerNames';
import { SFX_CATS, SFX_ITEMS, previewSfx, sfxFile, type SfxCat } from '../../lib/sfxLibrary';
import { applyAutoSfx } from '../../lib/autoSfx';

/** لوح «صوت» (٢٥ أكتوبر ٢٠٢٦) — كان «قريبًا» منذ بُني شريطُ الإضافة.
 *
 * زرٌّ واحدٌ يفتح منتقي الملفّات ويضع الصوتَ **عند المؤشّر** (`insertAudioTool`)، وتحته
 * أصواتُ المشروع: نقرةٌ تحدّد الطبقةَ فيظهر علوُّها وكتمُها في لوح الخصائص، وصفُّها في
 * الخطّ الزمنيّ بموجته يُنقَل ويُقصّ كأيّ مقطع. ولا مكتبةَ موسيقى جاهزة: لا حقوقَ لمزيج
 * في موسيقى أحد، والوعدُ بها كذب.
 *
 * ٦ نوفمبر ٢٠٢٦: مكتبةُ مؤثّراتٍ صوتيّة قصيرة (`sfxLibrary.ts`) تُسمَع قبل الإضافة وتُضاف عند
 * المؤشّر، وزرُّ «صوت تلقائي للحركة» (`autoSfx.ts`) يضع لحركات المستند أصواتها دفعةً واحدة. */
export function AudioLibrary() {
  const { state, actions, dict: L } = useStudio();
  const audios = state.elements.filter((e): e is AudioElement => e.type === 'audio');
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const ar = state.lang === 'ar';
  const stRef = useRef(state);
  stRef.current = state;
  const [cat, setCat] = useState<SfxCat>('whoosh');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const addSfx = async (id: string) => {
    const item = SFX_ITEMS.find((x) => x.id === id);
    if (!item || busy) return;
    setBusy(id);
    try {
      await actions.insertAudioFromFile(await sfxFile(item, state.lang));
    } finally {
      setBusy(null);
    }
  };
  const autoScore = async () => {
    if (busy) return;
    setBusy('auto');
    setNote('');
    try {
      const r = await applyAutoSfx({ getState: () => stRef.current, actions });
      setNote(ar ? `ركّبت الأصوات على ${r.events.length} ${r.events.length === 1 ? 'حركة' : 'حركات'} في طبقة «أصوات الحركة».` : `Scored ${r.events.length} motion ${r.events.length === 1 ? 'event' : 'events'} in the “Motion sounds” layer.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div data-testid="audio-library" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        data-testid="audio-auto-sfx"
        className="mz-tile"
        disabled={busy !== null}
        onClick={() => void autoScore()}
        style={{ height: 44, border: 0, borderRadius: 12, background: 'var(--accent)', color: 'var(--onAccent)', fontSize: 13, fontWeight: 700, opacity: busy === 'auto' ? 0.6 : 1 }}
      >
        {busy === 'auto' ? (ar ? 'أركّب الأصوات…' : 'Scoring…') : ar ? 'صوت تلقائي للحركة' : 'Auto sound for motion'}
      </button>
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.7, color: 'var(--muted)' }}>
        {ar ? 'يحط هبّة للانزلاق، وبوب للظهور، وصوت للانتقالات — كلها في طبقة وحدة تقدر تعدّلها أو تحذفها. اضغطه مرة ثانية بعد ما تعدّل الحركة.' : 'Whoosh for slides, pop for pops, a sound for each transition — all in one layer you can edit or delete. Press again after changing the motion.'}
      </p>
      {note && (
        <p data-testid="audio-auto-note" style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: 'var(--text)' }}>
          {note}
        </p>
      )}
      <div className="mz-label" style={{ marginTop: 6 }}>{ar ? 'مؤثرات صوتية' : 'Sound effects'}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {SFX_CATS.map((c) => (
          <button
            key={c.id}
            data-testid={`sfx-cat-${c.id}`}
            onClick={() => setCat(c.id)}
            style={{ height: 28, padding: '0 10px', borderRadius: 999, border: `1px solid ${cat === c.id ? 'var(--accent)' : 'var(--line)'}`, background: cat === c.id ? 'var(--accentSoft)' : 'transparent', color: 'var(--text)', fontSize: 12 }}
          >
            {ar ? c.ar : c.en}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {SFX_ITEMS.filter((x) => x.cat === cat).map((x) => (
          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 6px', border: '1px solid var(--line)', borderRadius: 'var(--rs)' }}>
            <button
              data-testid={`sfx-play-${x.id}`}
              title={ar ? 'اسمع' : 'Listen'}
              onClick={() => previewSfx(x.id)}
              style={{ width: 26, height: 26, border: 0, borderRadius: 999, background: 'var(--surface2)', color: 'var(--text)', display: 'grid', placeItems: 'center', flex: 'none' }}
            >
              <svg width={10} height={10} viewBox="0 0 10 10" style={{ transform: ar ? 'scaleX(-1)' : undefined }}><path d="M2 1l7 4-7 4z" fill="currentColor" /></svg>
            </button>
            <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ar ? x.nameAr : x.nameEn}</span>
            <span dir="ltr" style={{ color: 'var(--muted)', fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>{x.dur.toFixed(1)}s</span>
            <button
              data-testid={`sfx-add-${x.id}`}
              title={ar ? 'أضف عند المؤشر' : 'Add at playhead'}
              disabled={busy !== null}
              onClick={() => void addSfx(x.id)}
              style={{ height: 24, padding: '0 8px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--text)', fontSize: 11.5, opacity: busy === x.id ? 0.5 : 1 }}
            >
              {ar ? 'أضف' : 'Add'}
            </button>
          </div>
        ))}
      </div>
      <div className="mz-label" style={{ marginTop: 6 }}>{ar ? 'من ملفاتك' : 'From your files'}</div>
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
