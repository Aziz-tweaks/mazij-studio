import { useEffect, useRef, useState } from 'react';
import { useStudio } from '../../state/StudioContext';
import { MOTION_STYLES, insertMotionStyle, stylePreviewUrl, type MotionStyle } from '../../lib/motionStyles';
import { inTauri } from '../../lib/tauriEnv';

/** قسمُ «أنماط حركة جاهزة» في لوح التأثيرات (٦ نوفمبر ٢٠٢٦) — انظر `lib/motionStyles.ts`.
 * بطاقةٌ لكلّ نمط بصورته؛ النقرُ يفتح تحتها خاناتِ النصّ والمدّة والألوان، و«أضف» يرسم
 * المشهد بمقاس اللوحة ويضعه عند المؤشّر بملء اللوحة. */
export function MotionStylesSection() {
  const { state, actions } = useStudio();
  const ar = state.lang === 'ar';
  const stRef = useRef(state);
  stRef.current = state;
  const [open, setOpen] = useState<MotionStyle | null>(null);
  const [text, setText] = useState('');
  const [sub, setSub] = useState('');
  const [dur, setDur] = useState(6);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(open.text ? (ar ? 'مزيج' : 'MAZIJ') : '');
    setSub(open.sub ? (ar ? 'صمّم وحرّك' : 'DESIGN & MOTION') : '');
    setDur(open.dur);
    setColors({ ...open.colors });
    setError('');
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }, [open, ar]);

  const add = async () => {
    if (!open || progress !== null) return;
    setError('');
    setProgress(0);
    try {
      await insertMotionStyle({ getState: () => stRef.current, actions }, { id: open.id, dur, text: open.text ? text : undefined, sub: open.sub ? sub : undefined, colors }, setProgress);
      setOpen(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  };

  const isArabic = /[؀-ۿ]/.test(text + sub);
  return (
    <section data-testid="motion-styles" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="mz-label">{ar ? 'أنماط حركة جاهزة' : 'Ready motion styles'}</div>
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.7, color: 'var(--muted)' }}>
        {ar ? 'اختر نمط، اكتب نصّك وألوانك، ويترسم مشهد كامل بمقاس لوحتك عند المؤشر.' : 'Pick a style, type your text and colours, and a full scene is drawn at your canvas size at the playhead.'}
      </p>
      {open && (
        <div ref={editorRef} data-testid="motion-style-editor" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface2)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{ar ? open.nameAr : open.nameEn}</div>
          {open.text && (
            <input data-testid="motion-style-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={ar ? 'النص' : 'Text'} style={{ height: 32, padding: '0 8px', borderRadius: 'var(--rs)', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)' }} />
          )}
          {open.sub && (
            <input data-testid="motion-style-sub" value={sub} onChange={(e) => setSub(e.target.value)} placeholder={ar ? 'سطر ثاني' : 'Second line'} style={{ height: 32, padding: '0 8px', borderRadius: 'var(--rs)', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)' }} />
          )}
          {!open.arabic && isArabic && (
            <p style={{ margin: 0, fontSize: 11, color: 'var(--danger)' }}>{ar ? 'هذا النمط يقلب كل حرف لحاله، فالحروف العربية بتطلع مقطّعة. استخدم نص إنجليزي أو نمط ثاني.' : 'This style flips each letter on its own, so Arabic letters will look disconnected.'}</p>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span>{ar ? 'المدة' : 'Duration'}</span>
            <input data-testid="motion-style-dur" type="number" min={1} max={30} step={0.5} value={dur} onChange={(e) => setDur(Math.min(30, Math.max(1, Number(e.target.value) || open.dur)))} style={{ width: 64, height: 28, padding: '0 6px', borderRadius: 'var(--rs)', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)' }} />
            <span style={{ color: 'var(--muted)' }}>{ar ? 'ثانية' : 's'}</span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12 }}>{ar ? 'الألوان' : 'Colours'}</span>
            {Object.keys(open.colors).map((k) => (
              <input
                key={k}
                data-testid={`motion-style-color-${k}`}
                type="color"
                title={k === 'bg' ? (ar ? 'الخلفية' : 'Background') : k}
                value={colors[k] ?? open.colors[k]}
                onChange={(e) => setColors((c) => ({ ...c, [k]: e.target.value }))}
                style={{ width: 28, height: 28, padding: 0, border: '1px solid var(--line)', borderRadius: 8, background: 'transparent' }}
              />
            ))}
          </div>
          <button
            data-testid="motion-style-add"
            disabled={progress !== null || !inTauri}
            onClick={() => void add()}
            style={{ height: 36, border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 700, fontSize: 13, opacity: progress !== null ? 0.7 : 1 }}
          >
            {progress !== null ? `${ar ? 'أرسم المشهد…' : 'Drawing…'} ${Math.round(progress * 100)}%` : ar ? 'أضف عند المؤشر' : 'Add at playhead'}
          </button>
          {!inTauri && <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>{ar ? 'الرسم يحتاج البرنامج المثبّت.' : 'Rendering needs the installed app.'}</p>}
          {error && <p data-testid="motion-style-error" style={{ margin: 0, fontSize: 11, color: 'var(--danger)' }}>{error}</p>}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {MOTION_STYLES.map((m) => (
          <button
            key={m.id}
            data-testid={`motion-style-${m.id}`}
            className="mz-tile"
            onClick={() => setOpen(open?.id === m.id ? null : m)}
            style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: 0, border: 0, background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
          >
            <img src={stylePreviewUrl(m.id)} alt="" style={{ width: '100%', aspectRatio: '9 / 16', objectFit: 'cover', borderRadius: 10, border: `2px solid ${open?.id === m.id ? 'var(--accent)' : 'var(--line)'}` }} />
            <span style={{ fontSize: 11, textAlign: 'center' }}>{ar ? m.nameAr : m.nameEn}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
