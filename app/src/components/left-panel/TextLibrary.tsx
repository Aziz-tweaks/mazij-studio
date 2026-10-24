import type { CSSProperties } from 'react';
import { useStudio } from '../../state/StudioContext';
import { BASIC_TEXT_PRESETS, STYLED_TEXT_PRESETS, TEXT_PRESETS, type TextPreset } from '../../lib/textPresets';

/** لوح «نصوص» — الأداة الشائعة: عنوان، عنوان فرعي، نص، ثم أنماطٌ جاهزة.
 *
 * كان هذا اللوح «قريبًا» منذ بُني شريط الأدوات، وكان النصّ يُضاف بأداة T وحدها:
 * نقرةٌ على اللوحة ثم كتابة. وهي إيماءة أداة المتّجهات الصحيحة، وتبقى. لكنّ مصمّمة
 * السوشال القادمة من الأداة الشائعة تبحث عن **زرّ «أضف عنوان»** — فهذا هو. كلّ بطاقة تضع
 * نصًّا في وسط اللوحة محدَّدًا، والشريط السياقي فوقه جاهزٌ لتعديله. */
export function TextLibrary() {
  const { actions, dict: L } = useStudio();
  const basicLabel: Record<string, string> = { heading: L.txt_heading, subheading: L.txt_subheading, body: L.txt_body };

  const basicStyle = (id: TextPreset): CSSProperties => {
    const d = TEXT_PRESETS[id];
    return {
      height: id === 'heading' ? 52 : id === 'subheading' ? 44 : 38,
      border: 0,
      borderRadius: 12,
      background: 'var(--surface2)',
      color: 'var(--text)',
      fontFamily: `'${d.fontFamily}', sans-serif`,
      fontWeight: d.weight === 'bold' ? 700 : d.weight === 'medium' ? 500 : 400,
      fontSize: id === 'heading' ? 20 : id === 'subheading' ? 15.5 : 13,
      textAlign: 'start',
      padding: '0 14px',
    };
  };

  return (
    <div data-testid="text-library" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {BASIC_TEXT_PRESETS.map((id) => (
        <button key={id} data-text-preset={id} className="mz-tile" onClick={() => actions.addTextPreset(id)} style={basicStyle(id)}>
          {basicLabel[id]}
        </button>
      ))}
      <div className="mz-label" style={{ marginTop: 8 }}>{L.txt_styles}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {STYLED_TEXT_PRESETS.map((id) => {
          const d = TEXT_PRESETS[id];
          return (
            <button
              key={id}
              data-text-preset={id}
              className="mz-tile"
              onClick={() => actions.addTextPreset(id)}
              style={{
                height: 84,
                border: 0,
                borderRadius: 12,
                background: STYLE_BG[id],
                color: STYLE_FG[id],
                fontFamily: `'${d.fontFamily}', sans-serif`,
                fontWeight: d.weight === 'bold' ? 800 : 500,
                fontSize: d.fontSize > 110 ? 24 : 18,
                letterSpacing: d.tracking ? 1 : 0,
                lineHeight: 1.2,
                padding: 8,
              }}
            >
              {d.text}
            </button>
          );
        })}
      </div>
      <p style={{ margin: '4px 2px 0', fontSize: 11, color: 'var(--faint)' }}>{L.txt_hint}</p>
    </div>
  );
}

// خلفيّات البطاقات للمعاينة وحدها — النصّ يهبط بلون لوحة المستند لا بهذه.
const STYLE_BG: Partial<Record<TextPreset, string>> = { offer: '#2B2140', soon: '#111111', opening: '#0E3B36', new: '#EDEEF0' };
const STYLE_FG: Partial<Record<TextPreset, string>> = { offer: '#FFFFFF', soon: '#FFD15C', opening: '#F1E9C9', new: '#111111' };
