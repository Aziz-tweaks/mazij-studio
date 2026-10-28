import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { ICONS, nameOf, sizeAt } from '../../data/constants';
import { documentDuration, formatClock } from '../../lib/animTimeline';
import { useStudio } from '../../state/StudioContext';
import { Stage } from '../Stage';
import { Timeline } from '../Timeline';
import { PropsTab } from '../left-panel/PropsTab';
import { LibraryTab } from '../left-panel/LibraryTab';
import { AssetsTab } from '../left-panel/AssetsTab';
import { AiTab } from '../left-panel/AiTab';

/** **المحرّرُ في الجوال** (٢٨ أكتوبر ٢٠٢٦).
 *
 * محرّرُ سطح المكتب أربعةُ أعمدة (شريطُ الإضافة، لوحُها، اللوحة، المفتش) وخطٌّ زمنيّ
 * بعرض الشاشة؛ على ٣٩٠ بكسلًا كان المفتشُ يغطّي الشاشة واللوحةُ مقصوصة. وهنا ترتيبُ
 * تطبيقات التصميم على الجوال:
 *
 *   شريطٌ علويّ مختصر ← اللوحةُ بكلّ المساحة الباقية ← شريطُ تشغيلٍ للفيديو ←
 *   شريطٌ سفليّ: أدواتُ الإضافة، أو — متى حُدِّد عنصر — أفعالُه.
 *
 * وكلُّ لوحٍ (المكتبات، الخصائص، الطبقات) **لوحٌ سفليّ** يطلع فوق الشريط ويُصغِّر اللوحة
 * ولا يغطّيها، فيرى المصمّمُ أثرَ ما يغيّره وهو يغيّره. والمحتوى نفسُه مكوّناتُ سطح
 * المكتب (`LibraryTab`، `PropsTab`، `Timeline`) — لا نسخةَ ثانيةً من أيّ منطق. */

type Sheet = null | 'props' | 'layers';

export function MobileEditor() {
  const { state, actions, dict: L } = useStudio();
  const [sheet, setSheet] = useState<Sheet>(null);
  const timed = state.medium === 'timed';
  const hasSel = state.selectedIds.length > 0;
  const libraryOpen = state.panel === 'library' || state.panel === 'assets' || state.panel === 'ai';
  const sel = hasSel ? state.elements.find((e) => e.id === state.selectedIds[0]) : undefined;

  // لوحُ المكتبة ولوحُ الخصائص لا يجتمعان: فتحُ أحدهما يُغلق الآخر.
  useEffect(() => {
    if (libraryOpen) setSheet(null);
  }, [libraryOpen]);
  // إلغاءُ التحديد يُغلق لوحَ خصائصه — لا خصائصَ لشيءٍ غيرِ محدَّد.
  useEffect(() => {
    if (!hasSel && sheet === 'props') setSheet(null);
  }, [hasSel, sheet]);

  const openSheet = (s: Sheet) => {
    if (libraryOpen) actions.setPanel('props');
    setSheet((cur) => (cur === s ? null : s));
  };

  const libTitle =
    state.panel === 'ai'
      ? L.ai_name
      : state.panel === 'assets'
        ? L.rail_uploads
        : state.libraryTool === 'text'
          ? L.rail_text
          : state.libraryTool === 'shape'
            ? L.rail_elements
            : (L[`tool_${state.libraryTool}` as keyof typeof L] as string);

  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  const canUndo = state.historyPast.length > 0;
  const canRedo = state.historyFuture.length > 0;

  return (
    <div data-testid="mobile-editor" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* الشريط العلويّ: رجوع، اسمُ المقاس، تراجع وإعادة، تصدير. */}
      <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: 'calc(6px + env(safe-area-inset-top)) 10px 6px', borderBottom: '1px solid var(--line)' }}>
        <IconBtn testid="go-home-btn" label={L.h_greet} onClick={actions.goHome} path="M8 4l6 6-6 6" flip />
        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(size, state.lang)}</span>
        <IconBtn testid="undo-btn" label="تراجع" onClick={actions.undo} disabled={!canUndo} path="M8 6L4 10l4 4M4 10h8a4 4 0 0 1 0 8h-2" data={{ 'data-history-past': state.historyPast.length }} />
        <IconBtn testid="redo-btn" label="إعادة" onClick={actions.redo} disabled={!canRedo} path="M12 6l4 4-4 4M16 10H8a4 4 0 0 0 0 8h2" />
        <button data-testid="export-btn" onClick={actions.openExport} style={{ height: 36, padding: '0 16px', border: 0, borderRadius: 10, background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 700, fontSize: 14, marginInlineStart: 4 }}>
          {L.export}
        </button>
      </header>

      {/* اللوحة: كلُّ ما بقي. `Stage` نفسُه يعرف أنه في الجوال فيُسقط زخارفه العائمة. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Stage />
      </div>

      {timed && <Transport />}

      {libraryOpen && (
        <BottomSheet title={libTitle} onClose={() => actions.setPanel('props')} testid="mobile-sheet-library">
          {state.panel === 'library' && <LibraryTab />}
          {state.panel === 'assets' && <AssetsTab />}
          {state.panel === 'ai' && <AiTab />}
        </BottomSheet>
      )}
      {sheet === 'props' && hasSel && (
        <BottomSheet title={L.insp_design} onClose={() => setSheet(null)} testid="mobile-sheet-props">
          <PropsTab />
        </BottomSheet>
      )}
      {sheet === 'layers' && (
        <BottomSheet title={L.layers} onClose={() => setSheet(null)} testid="mobile-sheet-layers" tall>
          <Timeline timed={timed} docked={!timed} />
        </BottomSheet>
      )}

      {/* الشريطُ السفليّ: أفعالُ المحدَّد إن وُجد، وإلا أدواتُ الإضافة. */}
      <nav data-testid="mobile-bar" style={{ flex: 'none', display: 'flex', gap: 2, overflowX: 'auto', padding: '6px 6px calc(6px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--line)', background: 'var(--surface)', scrollbarWidth: 'none' }}>
        {hasSel ? (
          <>
            <BarBtn testid="m-edit" label={L.insp_design} path="M4 6h12M4 10h12M4 14h7" active={sheet === 'props'} onClick={() => openSheet('props')} />
            {sel?.type === 'text' && <BarBtn testid="m-edit-text" label={L.m_edit_text} path="M5 15l2-6 6 6M4 4h12" onClick={() => actions.startTextEdit(sel.id)} />}
            <BarBtn testid="m-duplicate" label={L.m_duplicate} path="M7 7h9v9H7zM4 4h9v2M4 4v9h2" onClick={actions.duplicateSelected} />
            <BarBtn testid="m-layers" label={L.layers} path="M10 3l7 4-7 4-7-4zM3 11l7 4 7-4" active={sheet === 'layers'} onClick={() => openSheet('layers')} />
            <BarBtn testid="m-delete" label={L.m_delete} path="M5 6h10M8 6V4h4v2M6 6l1 10h6l1-10" onClick={actions.deleteSelected} danger />
            <BarBtn testid="m-done" label={L.m_done} path="M4 10l4 4 8-8" onClick={actions.selectNone} />
          </>
        ) : (
          <>
            <BarBtn testid="m-tool-text" label={L.rail_text} path={ICONS.text} active={state.panel === 'library' && state.libraryTool === 'text'} onClick={() => actions.toggleRailPanel('library', { libraryTool: 'text' })} />
            <BarBtn testid="m-tool-shape" label={L.rail_elements} path={ICONS.shape} active={state.panel === 'library' && state.libraryTool === 'shape'} onClick={() => actions.toggleRailPanel('library', { libraryTool: 'shape' })} />
            <BarBtn testid="m-tool-image" label={L.rail_images} path={ICONS.image} onClick={() => actions.openToolLibrary('image')} />
            {timed && <BarBtn testid="m-tool-video" label={L.rail_video} path={ICONS.video} onClick={() => actions.openToolLibrary('video')} />}
            {timed && <BarBtn testid="m-tool-fx" label={L.rail_fx} path={ICONS.fx} active={state.panel === 'library' && state.libraryTool === 'fx'} onClick={() => actions.openToolLibrary('fx')} />}
            {timed && <BarBtn testid="m-tool-audio" label={L.rail_audio} path={ICONS.audio} active={state.panel === 'library' && state.libraryTool === 'audio'} onClick={() => actions.openToolLibrary('audio')} />}
            <BarBtn testid="m-tool-lottie" label={L.rail_stickers} path={ICONS.sticker} onClick={() => actions.openToolLibrary('lottie')} />
            <BarBtn testid="m-tool-uploads" label={L.rail_uploads} path={ICONS.upload} active={state.panel === 'assets'} onClick={() => actions.toggleRailPanel('assets', { assetsTab: 'files' })} />
            <BarBtn testid="m-tool-ai" label={L.ai_name} path="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z" active={state.panel === 'ai'} onClick={() => actions.toggleRailPanel('ai')} />
            <BarBtn testid="m-layers" label={L.layers} path="M10 3l7 4-7 4-7-4zM3 11l7 4 7-4" active={sheet === 'layers'} onClick={() => openSheet('layers')} />
          </>
        )}
      </nav>
    </div>
  );
}

/** شريطُ التشغيل للمستند المُوقَّت: تشغيلٌ وإيقاف، والزمن، وشريطُ سحبٍ بعرض الشاشة.
 * الخطُّ الزمنيّ الكامل (المقاطع والمفاتيح) في لوح «الطبقات». */
function Transport() {
  const { state, actions } = useStudio();
  const dur = Math.max(documentDuration(state.elements.map((e) => e.anim), state.fps), 1 / state.fps);
  return (
    <div data-testid="mobile-transport" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderTop: '1px solid var(--line)', background: 'var(--bg)' }}>
      <button
        data-testid="m-play"
        onClick={actions.togglePlay}
        aria-label={state.playing ? 'إيقاف' : 'تشغيل'}
        style={{ width: 40, height: 40, flex: 'none', borderRadius: '50%', border: 0, background: 'var(--accent)', color: 'var(--onAccent)', display: 'grid', placeItems: 'center' }}
      >
        <Icon size={16} strokeWidth={2.2} path={state.playing ? 'M7 5v10M13 5v10' : 'M7 5l9 5-9 5z'} />
      </button>
      <input
        data-testid="m-scrub"
        dir="ltr"
        type="range"
        min={0}
        max={dur}
        step={1 / state.fps}
        value={Math.min(state.t, dur)}
        onChange={(e) => actions.scrubTo(Number(e.target.value))}
        style={{ flex: 1, minWidth: 0, accentColor: 'var(--accent)', height: 28 }}
      />
      <span dir="ltr" style={{ flex: 'none', fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
        {formatClock(state.t)} / {formatClock(dur)}
      </span>
    </div>
  );
}

/** لوحٌ سفليّ: يطلع فوق الشريط، يُصغِّر اللوحة ولا يغطّيها، ويُغلق بزرّه. */
function BottomSheet({ title, onClose, children, testid, tall }: { title: string; onClose: () => void; children: ReactNode; testid: string; tall?: boolean }) {
  return (
    <section data-testid={testid} style={{ flex: 'none', height: tall ? '50vh' : '40vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderTop: '1px solid var(--line)', borderRadius: '16px 16px 0 0', boxShadow: '0 -8px 24px rgba(0,0,0,.25)' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 6px 16px' }}>
        <span style={{ position: 'absolute', insetInlineStart: '50%', marginTop: -2, width: 36, height: 4, borderRadius: 2, background: 'var(--line)', transform: 'translateX(50%)' }} />
        <span style={{ flex: 1, fontWeight: 700, fontSize: 15, paddingTop: 6 }}>{title}</span>
        <button data-testid={`${testid}-close`} onClick={onClose} aria-label="إغلاق" style={{ width: 36, height: 36, border: 0, borderRadius: '50%', background: 'var(--surface2)', color: 'var(--text)', display: 'grid', placeItems: 'center' }}>
          <Icon size={14} strokeWidth={2} path="M5 5l10 10M15 5L5 15" />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' } as CSSProperties}>{children}</div>
    </section>
  );
}

function BarBtn({ label, path, onClick, active, danger, testid }: { label: string; path: string; onClick: () => void; active?: boolean; danger?: boolean; testid: string }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      style={{
        flex: '0 0 auto',
        minWidth: 64,
        height: 56,
        padding: '0 6px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        border: 0,
        borderRadius: 12,
        background: active ? 'var(--accentSoft)' : 'transparent',
        color: danger ? 'var(--danger)' : active ? 'var(--accentText)' : 'var(--text)',
        fontSize: 11.5,
        fontWeight: active ? 700 : 500,
      }}
    >
      <Icon size={20} path={path} />
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

function IconBtn({ label, path, onClick, disabled, testid, flip, data }: { label: string; path: string; onClick: () => void; disabled?: boolean; testid: string; flip?: boolean; data?: Record<string, number> }) {
  const { dir } = useStudio();
  return (
    <button
      data-testid={testid}
      {...data}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{ width: 38, height: 38, flex: 'none', border: 0, borderRadius: 10, background: 'transparent', color: disabled ? 'var(--muted)' : 'var(--text)', opacity: disabled ? 0.45 : 1, display: 'grid', placeItems: 'center' }}
    >
      <Icon size={20} path={path} style={{ transform: flip && dir === 'ltr' ? 'scaleX(-1)' : undefined }} />
    </button>
  );
}
