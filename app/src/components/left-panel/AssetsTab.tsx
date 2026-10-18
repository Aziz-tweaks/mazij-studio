import { Icon } from '../Icon';
import { BRAND, FILES, PALETTES, SIZES, dimsOf, glyphStyle, nameOf } from '../../data/constants';
import type { AssetsTab as AssetsTabId } from '../../state/types';
import { firstSelectedElement, useStudio } from '../../state/StudioContext';

const TABS: AssetsTabId[] = ['files', 'fonts', 'colors', 'templates'];

export function AssetsTab() {
  const { state, actions, dict: L } = useStudio();

  return (
    <>
      <div style={{ display: 'flex', gap: 2, padding: '6px 12px 0', borderBottom: '1px solid var(--line)', flex: 'none' }}>
        {TABS.map((id) => {
          const active = state.assetsTab === id;
          return (
            <button
              key={id}
              onClick={() => actions.setAssetsTab(id)}
              style={{ height: 32, padding: '0 10px', border: 0, borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, background: 'transparent', color: active ? 'var(--text)' : 'var(--muted)', fontSize: 12, fontWeight: 600, marginBottom: -1 }}
            >
              {L[`tab_${id}` as const]}
            </button>
          );
        })}
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {state.assetsTab === 'files' && <FilesPane />}
        {state.assetsTab === 'fonts' && <FontsPane />}
        {state.assetsTab === 'colors' && <ColorsPane />}
        {state.assetsTab === 'templates' && <TemplatesPane />}
      </div>
    </>
  );
}

function FilesPane() {
  const { dict: L } = useStudio();
  return (
    <>
      <div title="قريبًا — استيراد الملفات والصور في المرحلة القادمة" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 18, border: '1.5px dashed var(--line)', borderRadius: 'var(--rs)', color: 'var(--muted)', fontSize: 12, textAlign: 'center', opacity: 0.55 }}>
        <Icon size={22} strokeWidth={1.5} path="M10 13V4M6 8l4-4 4 4M4 16h12" />
        <span>{L.drop} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{L.browse}</span> <span style={{ fontWeight: 700 }}>· قريبًا</span></span>
      </div>
      <div title="عناصر توضيحية ثابتة" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, opacity: 0.6 }}>
        {FILES.map((f) => (
          <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ aspectRatio: '1', borderRadius: 'var(--rs)', background: f.bg, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.7)' }}>
              <Icon size={18} strokeWidth={1.5} path={f.d} />
            </div>
            <span dir="ltr" style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'start', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function FontsPane() {
  const { state, actions, dict: L } = useStudio();
  const selectedEl = firstSelectedElement(state);
  const selectedFontFamily = selectedEl?.type === 'text' ? selectedEl.fontFamily : null;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)' }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{L.add_font}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            dir="ltr"
            value={state.fontUrl}
            onChange={(e) => actions.setFontUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') actions.addFont();
            }}
            placeholder={L.font_url_ph}
            style={{ flex: 1, minWidth: 0, height: 32, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', outline: 0, fontSize: 12, textAlign: 'left' }}
          />
          <button onClick={actions.addFont} style={{ height: 32, padding: '0 12px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontSize: 12, fontWeight: 600, opacity: state.fontUrl.trim() ? 1 : 0.5 }}>
            {L.load}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{L.font_note}</div>
      </div>
      <div className="mz-label">{L.installed}</div>
      <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 'var(--rs)', overflow: 'hidden' }}>
        {state.fonts.map((f) => {
          const selected = selectedFontFamily === f.family;
          const selectable = f.status === 'ready' && !!selectedEl && selectedEl.type === 'text';
          return (
            <button
              key={f.id}
              onClick={() => selectable && actions.setElementFont(selectedEl!.id, f.family)}
              disabled={!selectable}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--line)', border: 0, background: selected ? 'var(--accentSoft)' : 'transparent', textAlign: 'start', cursor: selectable ? 'pointer' : 'default', width: '100%' }}
            >
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 17, lineHeight: 1.2, fontFamily: f.family, opacity: f.status === 'ready' ? 1 : 0.5 }}>{L.sample}</span>
                <span dir="ltr" style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'start', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                {f.status === 'error' && f.error && (
                  <span style={{ fontSize: 10, color: '#D97A6C', textAlign: 'start' }}>{f.error}</span>
                )}
              </span>
              {f.custom && (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 600,
                    background: f.status === 'ready' ? 'var(--accentSoft)' : f.status === 'error' ? 'rgba(217,122,108,.15)' : 'var(--surface2)',
                    color: f.status === 'ready' ? 'var(--accent)' : f.status === 'error' ? '#D97A6C' : 'var(--muted)',
                  }}
                >
                  {f.status === 'ready' ? L.ready : f.status === 'error' ? L.font_error : L.loading}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function ColorsPane() {
  const { state, actions, dict: L } = useStudio();
  const pal = PALETTES[state.postPalette];
  const swatches = Array.from(new Set([pal.fg, pal.ac, pal.bg, ...(pal.ac2 ? [pal.ac2] : [])]));
  return (
    <>
      <div className="mz-label">{L.post_palettes}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {PALETTES.map((p, i) => {
          // اللوحة الأخيرة وحدها رباعيّة (تضبط `ac2`)، فلها اسمٌ معروضٌ وتعريفٌ
          // خاصّ في الاختبارات — لا لأنها «لوحةٌ مميّزة» بل لأنها الحالة الوحيدة
          // التي تُظهر أربع مربّعاتٍ لا ثلاثة.
          const isEmerald = i === PALETTES.length - 1;
          const active = state.postPalette === i;
          return (
            <button
              key={i}
              onClick={() => actions.setPostPalette(i)}
              title={isEmerald ? L.palette_emerald : undefined}
              data-testid={isEmerald ? 'palette-emerald' : `palette-${i}`}
              style={{ display: 'flex', gap: 3, padding: 5, border: `1.5px solid ${active ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, background: 'var(--surface2)' }}
            >
              <span style={{ width: 16, height: 16, borderRadius: 4, background: p.bg, display: 'block', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)' }} />
              <span style={{ width: 16, height: 16, borderRadius: 4, background: p.fg, display: 'block', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)' }} />
              <span style={{ width: 16, height: 16, borderRadius: 4, background: p.ac, display: 'block' }} />
              {p.ac2 && <span style={{ width: 16, height: 16, borderRadius: 4, background: p.ac2, display: 'block' }} />}
            </button>
          );
        })}
      </div>
      <button
        data-testid="apply-palette-all"
        onClick={() => actions.applyPaletteToAll()}
        title={L.apply_palette_hint}
        style={{ height: 32, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--accentSoft)', color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}
      >
        {L.apply_palette_all}
      </button>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{L.apply_palette_hint}</p>

      {/* مفتاح زخرفة اللوحة. مكانه هنا لا في لوح «التصميم» لأنه صفةُ **المستند** لا
          صفةُ عنصرٍ محدَّد — ولوح «التصميم» لا يعرض شيئًا أصلًا حين لا تحديد، فلو
          وُضع فيه لما وُجد إلا بالصدفة. وهو يجاور لوحات الألوان لأن الزخرفة تُرسَم
          بلون اللوحة النشطة، فالقراران يُتَّخذان في مكانٍ واحد. */}
      <div className="mz-label">{L.decor_title}</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
        <input
          data-testid="decor-accent-toggle"
          type="checkbox"
          checked={state.decorAccent}
          onChange={(e) => actions.setDecorAccent(e.target.checked)}
        />
        <span style={{ flex: 1 }}>{L.decor_accent}</span>
      </label>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{L.decor_hint}</p>

      <div className="mz-label">{L.project_colors}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {swatches.map((hex) => (
          <div key={hex} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
            <span style={{ width: 44, height: 44, borderRadius: 'var(--rs)', background: hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)', display: 'block' }} />
            <span dir="ltr" style={{ fontSize: 10, color: 'var(--muted)' }}>{hex}</span>
          </div>
        ))}
      </div>
      <div className="mz-label">{L.brand}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
        {BRAND.map((hex) => (
          <span key={hex} style={{ aspectRatio: '1', borderRadius: 'var(--rs)', background: hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)', display: 'block' }} />
        ))}
      </div>
    </>
  );
}

function TemplatesPane() {
  const { state, actions } = useStudio();
  return (
    <>
      {SIZES.map((z, i) => {
        const active = state.sizeIdx === i;
        return (
          <button
            key={z.id}
            onClick={() => actions.setSizeIdx(i)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, height: 56, padding: '0 12px', border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--rs)', background: active ? 'var(--accentSoft)' : 'var(--surface2)', textAlign: 'start' }}
          >
            <span style={{ width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
              <span style={glyphStyle(z, 30)} />
            </span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 600, fontSize: 12.5 }}>{nameOf(z, state.lang)}</span>
              <span dir="ltr" style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'start' }}>{dimsOf(z)}</span>
            </span>
          </button>
        );
      })}
    </>
  );
}
