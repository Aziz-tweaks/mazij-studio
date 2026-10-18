import { useEffect, useState, type CSSProperties } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Icon } from './Icon';
import { nameOf, seg, sizeAt } from '../data/constants';
import { useStudio } from '../state/StudioContext';

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const appWindow = inTauri ? getCurrentWindow() : null;

// Hand the gesture to the native window server instead of tracking pointermove and
// calling setPosition ourselves.
//
// The real reason the packaged app's titlebar felt dead: `core:window:default` grants
// only read-only getters, so `setPosition` (and `toggleMaximize`) were rejected by the
// ACL on every single move. Both calls are floating promises, so the rejection was
// swallowed with no console error and no visible effect — the window simply never moved.
// The capability now grants `allow-start-dragging` + `allow-toggle-maximize`; without
// those entries this function is inert again, however correct the JS looks.
//
// Even with the permission, the manual tracking was wrong: it converted each pointer
// delta with one `devicePixelRatio` sampled at pointerdown, and that ratio belongs to
// the display the drag *started* on — drag onto a Mac second monitor with a different
// scale factor and every later delta is multiplied by the wrong number, so the window
// slides away from the cursor. It also trailed the pointer, since each move had to
// round-trip through the webview before the window moved. `startDragging` has neither
// problem (the compositor owns the gesture, so it is per-display correct by construction
// and runs at the window server's pace) and still carries the window across a display
// boundary, which is the reason the manual tracking was written in the first place.
function startWindowDrag(e: React.PointerEvent) {
  if (!appWindow || e.button !== 0) return;
  if ((e.target as HTMLElement).closest('button,input,select,textarea,a,[role="button"]')) return;
  // Leave the second press of a double-click alone: handing it to the native drag loop
  // would consume the gesture before the webview could raise `dblclick`, which is what
  // toggles maximize below.
  if (e.detail >= 2) return;
  void appWindow.startDragging();
}

export function TopBar() {
  const { state, actions, dict: L } = useStudio();
  const isEditor = state.screen === 'editor';
  const mSimple = seg(state.mode !== 'pro');
  const mPro = seg(state.mode === 'pro');
  const cmdKeyLabel = isMac ? '⌘K' : 'Ctrl K';

  return (
    <div
      onPointerDown={startWindowDrag}
      onDoubleClick={() => void appWindow?.toggleMaximize()}
      style={{
        position: 'relative',
        height: 46,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        // Window-chrome padding is physical (left/right), not logical: the traffic
        // lights / window buttons sit at a fixed screen edge regardless of language.
        paddingLeft: isMac ? 84 : 12,
        paddingRight: isMac ? 12 : 150,
        borderBottom: '0px solid var(--line)',
      }}
    >
      {/* On macOS the system draws the real traffic lights over this bar (titleBarStyle:
          Overlay). That also restores native window dragging — a decorationless window
          with a drag region could not be moved between displays. The left padding above
          reserves their space. */}
      {isMac ? null : (
        <div dir="ltr" style={{ position: 'absolute', right: 0, top: 0, height: 46, display: 'flex' }}>
          <WinButton path="M1 6h10" onClick={() => appWindow?.minimize()} />
          <WinButton path="M1.5 1.5h9v9h-9z" onClick={() => appWindow?.toggleMaximize()} />
          <WinButton path="M1.5 1.5l9 9M10.5 1.5l-9 9" danger onClick={() => appWindow?.close()} />
        </div>
      )}

      <button
        data-testid="go-home-btn"
        onClick={actions.goHome}
        // لا `aria-label` هنا بقصد: نصّ الزرّ المرئي هو «مزيج»، فوسمٌ مخفيٌّ
        // باسمٍ آخر («الرئيسية») يُلغي الاسم المرئي ويُخالف قاعدة «الاسم يشمل
        // المرئي» (WCAG 2.5.3) — ويكسر كل من يبحث عن الزرّ بنصّه الظاهر.
        // التلميح وحده يحمل الوظيفة الإضافية.
        title={L.home}
        className="mz-btn"
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--text)', fontWeight: 700, fontSize: 14, flex: 'none', whiteSpace: 'nowrap' }}
      >
        <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--onAccent)', display: 'block', transform: 'rotate(45deg)' }} />
        </span>
        <span>{L.app}</span>
      </button>

      {isEditor && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', flex: 'none', whiteSpace: 'nowrap' }}>
          <span style={{ opacity: 0.5 }}>/</span>
          {/* اسم المستند = وجهته المختارة، لا نصٌّ ثابت. كان مكتوبًا `L.project`
              أي «بوست العروض» — اسم البوستر التجريبي — فكان كل مشروع، مهما
              كان، يُسمّى باسم المستند الذي كان يُفتح افتراضيًا. مشروع ريل فارغ
              ليس «بوست العروض». */}
          <button data-testid="project-name" onClick={actions.goHome} style={{ border: 0, background: 'transparent', padding: 0, color: 'var(--text)', fontWeight: 500, cursor: 'pointer' }}>
            {nameOf(sizeAt(state.sizeIdx, state.customW, state.customH), state.lang)}
          </button>
          <span style={{ padding: '2px 8px', borderRadius: 999, background: 'var(--surface2)', fontSize: 11 }}>
            {state.saveState === 'saving' ? L.saving : state.saveState === 'error' ? L.save_error : L.saved}
          </span>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {isEditor && (
        <div style={{ display: 'flex', padding: 3, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2, flex: 'none', whiteSpace: 'nowrap' }}>
          <button onClick={actions.setSimple} style={segBtnStyle(mSimple)}>{L.simple}</button>
          <button onClick={actions.setPro} style={segBtnStyle(mPro)}>{L.pro}</button>
        </div>
      )}

      <button
        onClick={actions.openCmd}
        className="mz-search"
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, flex: '0 1 250px', minWidth: 120, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', color: 'var(--muted)', fontSize: 12 }}
      >
        <Icon path="M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM13.5 13.5L17 17" />
        <span style={{ flex: 1, minWidth: 0, textAlign: 'start', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{L.search}</span>
        <kbd dir="ltr" style={{ fontFamily: 'inherit', fontSize: 11, padding: '1px 6px', borderRadius: 5, background: 'var(--surface2)', color: 'var(--muted)', whiteSpace: 'nowrap', flex: 'none' }}>{cmdKeyLabel}</kbd>
      </button>

      <div style={{ flex: 1 }} />

      {isEditor && (
        <>
          {state.mode === 'pro' && (
            <span dir="ltr" style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{L.duration}</span>
          )}
          <div style={{ display: 'flex', gap: 2 }}>
            <button title={L.undo} className="mz-btn" disabled={!state.historyPast.length} onClick={actions.undo} style={{ ...iconBtnStyle, opacity: state.historyPast.length ? 1 : 0.35 }}>
              <Icon size={18} path="M8 5L4 9l4 4M4 9h8a4 4 0 0 1 0 8h-1" />
            </button>
            <button title={L.redo} className="mz-btn" disabled={!state.historyFuture.length} onClick={actions.redo} style={{ ...iconBtnStyle, opacity: state.historyFuture.length ? 1 : 0.35 }}>
              <Icon size={18} path="M12 5l4 4-4 4M16 9H8a4 4 0 0 0 0 8h1" />
            </button>
          </div>
        </>
      )}

      <button
        onClick={actions.toggleLang}
        className="mz-btn"
        style={{ height: 32, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)', fontSize: 12, fontWeight: 600, flex: 'none', whiteSpace: 'nowrap' }}
      >
        {L.lang_btn}
      </button>

      {isEditor && (
        <button
          data-testid="open-templates-btn"
          onClick={actions.openTemplates}
          className="mz-btn"
          style={{ height: 32, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13, flex: 'none', whiteSpace: 'nowrap' }}
        >
          {L.templates_btn}
        </button>
      )}

      {isEditor && (
        <button
          data-testid="open-artboards-btn"
          onClick={actions.openArtboards}
          className="mz-btn"
          style={{ height: 32, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13, flex: 'none', whiteSpace: 'nowrap' }}
        >
          {L.artboards_btn}
        </button>
      )}

      {isEditor && <MoreToolsMenu />}

      {isEditor && state.mcpServerEnabled && (
        <span
          data-testid="mcp-active-badge"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', borderRadius: 'var(--rs)', background: 'var(--accentSoft)', color: 'var(--accent)', fontSize: 11.5, fontWeight: 600, flex: 'none', whiteSpace: 'nowrap' }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
          {L.mcp_badge}
        </span>
      )}

      {isEditor && (
        <button
          data-testid="open-ai-gen-btn"
          onClick={actions.openAiGenerate}
          className="mz-btn"
          style={{ height: 32, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13, flex: 'none', whiteSpace: 'nowrap' }}
        >
          {L.ai_gen_btn}
        </button>
      )}

      {isEditor && (
        <button
          onClick={actions.openExport}
          style={{ height: 32, padding: '0 16px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 600, fontSize: 13, flex: 'none', whiteSpace: 'nowrap' }}
        >
          {L.export}
        </button>
      )}
    </div>
  );
}

/** The overflow menu for tools a designer does not reach for every session.
 *
 * Why this exists (18 October 2026): the owner — a designer who uses أداة تصميم شائعة,
 * أداة متّجهات and محرّر فيديو شائع daily — rated Mazij 2/10 and said it was "full of
 * strange things". The clearest single cause was this bar: nine buttons in a
 * row, among them «خادم MCP», «مفسّر الأوامر» and «النماذج المحلية» — developer
 * and infrastructure surfaces — sitting at the same height, weight and prominence
 * as Export. Every roadmap item had been given a button, which is a view of the
 * task list, not a product.
 *
 * Nothing is removed and nothing is hidden conditionally: each tool keeps its
 * action and its test id, one level down. What changes is the claim the bar makes
 * about what matters. What stays out front is what a designer touches constantly
 * — templates, artboards, AI generate, export.
 */
function MoreToolsMenu() {
  const { actions, dict: L } = useStudio();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Any press outside, or Escape, dismisses — the two gestures a user tries
    // first. Registered on `pointerdown` rather than `click` so the menu is gone
    // before whatever was pressed underneath reacts.
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('[data-more-tools]')) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item: CSSProperties = {
    display: 'block',
    width: '100%',
    height: 32,
    padding: '0 12px',
    border: 0,
    borderRadius: 'calc(var(--rs) - 2px)',
    background: 'transparent',
    color: 'var(--text)',
    fontSize: 13,
    fontWeight: 500,
    textAlign: 'start',
    whiteSpace: 'nowrap',
  };

  return (
    <div data-more-tools style={{ position: 'relative', flex: 'none' }}>
      <button
        data-testid="more-tools-btn"
        aria-label={L.more_tools}
        aria-expanded={open}
        aria-haspopup="menu"
        title={L.more_tools}
        onClick={() => setOpen((v) => !v)}
        className="mz-btn"
        style={{ height: 32, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: open ? 'var(--surface2)' : 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 15, lineHeight: 1 }}
      >
        ⋯
      </button>

      {open && (
        <div
          role="menu"
          data-testid="more-tools-menu"
          style={{ position: 'absolute', top: 38, insetInlineEnd: 0, zIndex: 40, minWidth: 210, display: 'flex', flexDirection: 'column', gap: 2, padding: 4, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
        >
          <button role="menuitem" data-testid="open-refvideo-btn" style={item} onClick={() => { setOpen(false); actions.openRefVideo(); }}>{L.refvideo_btn}</button>
          <button role="menuitem" data-testid="open-local-models-btn" style={item} onClick={() => { setOpen(false); actions.openLocalModels(); }}>{L.local_models_btn}</button>
          <button role="menuitem" data-testid="open-cmd-interpreter-btn" style={item} onClick={() => { setOpen(false); actions.openCmdInterpreter(); }}>{L.nl_cmd_btn}</button>
          <div style={{ height: 1, margin: '3px 6px', background: 'var(--line)' }} />
          <button role="menuitem" data-testid="open-mcp-btn" style={item} onClick={() => { setOpen(false); actions.openMcp(); }}>{L.mcp_btn}</button>
        </div>
      )}
    </div>
  );
}

function segBtnStyle(s: { bg: string; fg: string; sh: string }): CSSProperties {
  return { height: 26, padding: '0 14px', border: 0, borderRadius: 'calc(var(--rs) - 2px)', fontSize: 12, fontWeight: 600, background: s.bg, color: s.fg, boxShadow: s.sh };
}

const iconBtnStyle: CSSProperties = { width: 30, height: 30, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' };

function WinButton({ path, danger, onClick }: { path: string; danger?: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 46,
        height: 46,
        border: 0,
        background: hover ? (danger ? '#E81123' : 'var(--surface2)') : 'transparent',
        color: hover ? (danger ? '#fff' : 'var(--text)') : 'var(--muted)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <Icon size={12} strokeWidth={1.2} path={path} />
    </button>
  );
}
