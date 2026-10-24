import type { CSSProperties } from 'react';
import { Icon } from '../Icon';
import { ICONS, PILL_TOOLS, TOOLS } from '../../data/constants';
import { useStudio } from '../../state/StudioContext';

/** حبّة الأدوات العائمة أسفل اللوحة — أدوات الرسم بحروفها، ثمّ التكبير.
 *
 * **تُسلِّح ولا تفتح ألواحًا.** كان زرّ «أشكال» يُسلِّح ويفتح مكتبة الأشكال معًا (قاعدة
 * محرّر الفيديو الشائع: «كلّ زرٍّ في الشريط يبدّل لوحًا»)، وكانت القاعدة صحيحةً لشريطٍ كان أدواتٍ
 * وإدراجًا معًا. انفصلا اليوم: القاعدة تبقى لشريط الإضافة — كلّ بندٍ فيه يفتح لوحًا —
 * والحبّة أدوات رسم: لوحٌ يفتح مع M كان يدفع اللوحة ٣٠٠ بكسل لحظة يبدأ السحب.
 *
 * كلّ زرّ يحمل حرفه ظاهرًا لا في التلميح وحده: الاختصار يُتعلَّم بالنظر. والحروف هي
 * حروف أداة المتّجهات بمعانيها (`TOOLS`)، فمن يعرفها هناك يعرفها هنا.
 *
 * وأزرار التكبير نصوصٌ (`−` و`+` و«ملاءمة») بقصد: تُعرَف بأعينها، وهي أسماؤها التي
 * تجدها بها الاختبارات منذ بُنيت. */
export function ToolPill() {
  const { state, actions, dict: L } = useStudio();
  const keyOf = (id: string) => TOOLS.find((t) => t.id === id)?.key ?? '';

  return (
    <div
      role="toolbar"
      aria-label={L.tools_label}
      data-testid="tool-pill"
      data-stage-overlay
      dir="ltr"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        bottom: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        height: 46,
        padding: '0 5px',
        borderRadius: 14,
        background: 'var(--float)',
        border: '1px solid var(--lineStrong)',
        boxShadow: 'var(--shadow)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {PILL_TOOLS.map((id) => {
        const active = state.tool === id;
        const key = keyOf(id);
        const name = L[`tool_${id}` as keyof typeof L] as string;
        return (
          <button
            key={id}
            data-tool={id}
            aria-pressed={active}
            aria-label={name}
            title={key ? `${name} (${key})` : name}
            className={active ? undefined : 'mz-pill-btn'}
            // تسليحٌ فقط — لا لوح. الحبّة أدوات رسم (أداة المتّجهات): M ثم سحب = مستطيل،
            // بلا لوحٍ يفتح فتقفز اللوحة تحت يدك. مكتبات الإضافة في شريط الإضافة.
            onClick={() => actions.setTool(id)}
            style={{
              position: 'relative',
              width: 40,
              height: 36,
              border: 0,
              borderRadius: 9,
              display: 'grid',
              placeItems: 'center',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--onAccent)' : 'var(--muted)',
            }}
          >
            <Icon size={18} path={ICONS[id]} fill={id === 'select' ? 'currentColor' : 'none'} />
            {key && <span aria-hidden="true" style={keyBadge(active)}>{key}</span>}
          </button>
        );
      })}
      <span style={{ width: 1, height: 22, background: 'var(--lineStrong)', margin: '0 5px' }} />
      <button data-testid="zoom-out" onClick={actions.zoomOut} aria-label={L.zoom_out} title={L.zoom_out} className="mz-pill-btn" style={zoomBtn}>−</button>
      <span data-testid="zoom-label" style={{ minWidth: 44, textAlign: 'center', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{Math.round(state.zoom)}%</span>
      <button data-testid="zoom-in" onClick={actions.zoomIn} aria-label={L.zoom_in} title={L.zoom_in} className="mz-pill-btn" style={zoomBtn}>+</button>
      <button data-testid="zoom-fit" onClick={actions.zoomFit} title={L.zoom_fit} className="mz-pill-btn" style={{ ...zoomBtn, width: 'auto', padding: '0 10px', fontSize: 12 }}>{L.fit}</button>
    </div>
  );
}

const zoomBtn: CSSProperties = { width: 30, height: 32, border: 0, borderRadius: 8, background: 'transparent', color: 'var(--muted)', fontSize: 16, display: 'grid', placeItems: 'center' };

function keyBadge(active: boolean): CSSProperties {
  return { position: 'absolute', right: 3, bottom: 1, fontSize: 8.5, fontWeight: 700, lineHeight: 1, opacity: active ? 0.85 : 0.6, fontFamily: 'system-ui, sans-serif' };
}
