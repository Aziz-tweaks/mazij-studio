import { onMobile } from '../lib/tauriEnv';
import { useEffect, useState, type CSSProperties } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Icon } from './Icon';
import { nameOf, sizeAt } from '../data/constants';
import { useStudio } from '../state/StudioContext';

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
// الجوالُ لا نوافذَ فيه تُسحَب أو تُصغَّر: لا أزرارَ نافذة ولا سحبَ من الشريط.
const appWindow = inTauri && !onMobile ? getCurrentWindow() : null;

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
  const undoLabel = state.historyLabels[state.historyPast.length - 1] ?? '';
  const redoLabel = state.historyFutureLabels[0] ?? '';
  // لا لوحةَ مفاتيح في الجوال، فلا اختصارَ يُعرض.
  const cmdKeyLabel = onMobile ? '' : isMac ? '⌘K' : 'Ctrl K';
  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  const mizoOn = state.panel === 'ai';

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
        gap: 8,
        // Window-chrome padding is physical (left/right), not logical: the traffic
        // lights / window buttons sit at a fixed screen edge regardless of language.
        //
        // لكن «الحافّة الثابتة» ليست اليسار دائمًا: على ماكٍ لغةُ نظامه العربية يعكس
        // macOS شريطَ العنوان كلّه، فتنزل الأزرارُ الثلاثة يمينًا — فوق شعار «مزيج»
        // مباشرةً (لقطة جولة ٢٤ أكتوبر ٢٠٢٦ على جهازِ الاختبار). ولا تكشف الواجهةُ عن
        // اتّجاه النظام بثقة، فتُحجَز المساحةُ على الحافّتين معًا.
        paddingLeft: isMac && !onMobile ? 84 : 12,
        paddingRight: isMac && !onMobile ? 84 : onMobile ? 12 : 150,
        background: 'var(--bg)',
        borderBottom: isEditor ? '1px solid var(--line)' : '0px solid var(--line)',
      }}
    >
      {/* On macOS the system draws the real traffic lights over this bar (titleBarStyle:
          Overlay). That also restores native window dragging — a decorationless window
          with a drag region could not be moved between displays. The left padding above
          reserves their space. */}
      {isMac || onMobile ? null : (
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
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 8px', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--text)', fontWeight: 700, fontSize: 14, flex: 'none', whiteSpace: 'nowrap' }}
      >
        <MixMark />
        <span>{L.app}</span>
      </button>

      {isEditor && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', flex: '0 1 auto', minWidth: 0, whiteSpace: 'nowrap' }}>
          <span style={{ opacity: 0.4 }}>/</span>
          {/* اسم المستند = وجهته المختارة، لا نصٌّ ثابت. كان مكتوبًا `L.project`
              أي «بوست العروض» — اسم البوستر التجريبي — فكان كل مشروع، مهما
              كان، يُسمّى باسم المستند الذي كان يُفتح افتراضيًا. مشروع ريل فارغ
              ليس «بوست العروض». */}
          <button data-testid="project-name" onClick={actions.goHome} style={{ border: 0, background: 'transparent', padding: 0, color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {nameOf(size, state.lang)}
          </button>
          <span dir="ltr" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--faint)' }}>{size.w}×{size.h}</span>
          <span data-testid="save-state" data-save-state={state.saveState} style={{ color: state.saveState === 'error' ? 'var(--danger)' : 'var(--faint)' }}>
            · {state.saveState === 'saving' ? L.saving : state.saveState === 'error' ? L.save_error : L.saved}
          </span>
        </div>
      )}

      {isEditor && (
        // **خطوةُ التراجع تَحمل اسمَها.** القاعدةُ مكتوبةٌ عند `pushHistory`
        // في `StudioContext.tsx`: التنقّلُ والتحديدُ والمؤشّرُ لا تُسجَّل، وكلُّ
        // ما يُغيّر المستند خطوةٌ واحدةٌ مُسمّاة. وخطوةٌ من موضعٍ لم يُسمِّ
        // نفسَه بعد تعود إلى «تراجع» العامّة — لا اسمٌ مُختلَق.
        <div style={{ display: 'flex', gap: 2, flex: 'none', marginInlineStart: 4 }}>
          <button
            data-testid="undo-btn"
            data-undo-label={undoLabel}
            // عددُ الخطوات مقروءٌ على الزرّ، كما يُقرأ الزمنُ على الساعة
            // (`data-t`) والمدى على المسطرة (`data-span`). والمعيار B5 يسأل
            // «أبقي سجلُّ التراجع كما هو؟» وهو سؤالٌ لا يُجاب بالعين.
            data-history-past={state.historyPast.length}
            title={undoLabel ? `${L.undo}: ${undoLabel}` : L.undo}
            className="mz-btn"
            disabled={!state.historyPast.length}
            onClick={actions.undo}
            style={{ ...iconBtnStyle, opacity: state.historyPast.length ? 1 : 0.35 }}
          >
            <Icon size={18} path="M8 5L4 9l4 4M4 9h8a4 4 0 0 1 0 8h-1" />
          </button>
          <button
            data-testid="redo-btn"
            data-redo-label={redoLabel}
            data-history-future={state.historyFuture.length}
            title={redoLabel ? `${L.redo}: ${redoLabel}` : L.redo}
            className="mz-btn"
            disabled={!state.historyFuture.length}
            onClick={actions.redo}
            style={{ ...iconBtnStyle, opacity: state.historyFuture.length ? 1 : 0.35 }}
          >
            <Icon size={18} path="M12 5l4 4-4 4M16 9H8a4 4 0 0 0 0 8h1" />
          </button>
        </div>
      )}

      <div style={{ flex: 1 }} />

      <button
        onClick={actions.openCmd}
        className="mz-search"
        title={L.search}
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, flex: isEditor ? '0 1 220px' : '0 1 300px', minWidth: 110, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', color: 'var(--muted)', fontSize: 12 }}
      >
        <Icon path="M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM13.5 13.5L17 17" />
        <span style={{ flex: 1, minWidth: 0, textAlign: 'start', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{L.search}</span>
        {cmdKeyLabel && <kbd dir="ltr" style={{ fontFamily: 'inherit', fontSize: 11, padding: '1px 6px', borderRadius: 5, background: 'var(--surface2)', color: 'var(--muted)', whiteSpace: 'nowrap', flex: 'none' }}>{cmdKeyLabel}</kbd>}
      </button>

      {!isEditor && <div style={{ flex: 1 }} />}

      {isEditor && state.mcpServerEnabled && (
        <span
          data-testid="mcp-active-badge"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', borderRadius: 'var(--rs)', background: 'var(--accentSoft)', color: 'var(--accentText)', fontSize: 11.5, fontWeight: 600, flex: 'none', whiteSpace: 'nowrap' }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
          {L.mcp_badge}
        </span>
      )}

      {isEditor && (
        // مِزو على الشريط العلوي كما في التصوّر المعتمد: مساعدٌ يُستدعى من أيّ عمق،
        // لا تبويبٌ بين ألواح المحتوى. ⌘J يفعل الشيء نفسه.
        <button
          data-panel-tab="ai"
          aria-pressed={mizoOn}
          onClick={() => actions.toggleRailPanel('ai')}
          title={`${L.ai_name} (${isMac ? '⌘J' : 'Ctrl J'})`}
          className="mz-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', border: `1px solid ${mizoOn ? 'var(--accent)' : 'var(--lineStrong)'}`, borderRadius: 'var(--rs)', background: mizoOn ? 'var(--accentSoft)' : 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13, flex: 'none', whiteSpace: 'nowrap' }}
        >
          <Icon size={15} path="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z" style={{ color: 'var(--accentText)' }} />
          {L.ai_name}
        </button>
      )}

      <button
        onClick={actions.toggleLang}
        className="mz-btn"
        style={{ height: 32, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)', fontSize: 12, fontWeight: 600, flex: 'none', whiteSpace: 'nowrap' }}
      >
        {L.lang_btn}
      </button>

      {isEditor && <MoreToolsMenu />}

      {isEditor && (
        <button
          data-testid="open-export-btn"
          onClick={actions.openExport}
          title={`${L.export} (${isMac ? '⌘E' : 'Ctrl E'})`}
          style={{ height: 32, padding: '0 16px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 600, fontSize: 13, flex: 'none', whiteSpace: 'nowrap' }}
        >
          {L.export}
        </button>
      )}
    </div>
  );
}

/** شعار مزيج (اعتُمد ٦ نوفمبر ٢٠٢٦): رأس قلم بلونين يلتقيان في النصّ، وفتحته زرّ تشغيل —
 *  رسم وفيديو في شكل واحد. نفس رسم public/mazij.svg وأيقونات التطبيق؛ ألوانه ثابتة
 *  لا تتبع السمة، لأنه شعار لا عنصر واجهة. */
function MixMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 300 300" aria-hidden="true" style={{ flex: 'none' }}>
      <rect width="300" height="300" rx="68" fill="#16132F" />
      <path d="M150 61 C114 79 94 118 94 151 L150 244 Z" fill="#FF7A59" />
      <path d="M150 61 C186 79 206 118 206 151 L150 244 Z" fill="#6D3FE8" />
      <path d="M139 137 L169 153 L139 169 Z" fill="#16132F" stroke="#16132F" strokeWidth="3" strokeLinejoin="round" />
      <rect x="146.5" y="150" width="7" height="96" fill="#16132F" />
    </svg>
  );
}

/** The overflow menu for tools a designer does not reach for every session.
 *
 * Why this exists (18 October 2026): the owner — a designer who uses a common design tool,
 * a vector editor and a common video editor daily — rated Mazij 2/10 and said it was "full of
 * strange things". The clearest single cause was this bar: nine buttons in a
 * row, among them «خادم MCP», «مفسّر الأوامر» and «النماذج المحلية» — developer
 * and infrastructure surfaces — sitting at the same height, weight and prominence
 * as Export. Every roadmap item had been given a button, which is a view of the
 * task list, not a product.
 *
 * Nothing is removed and nothing is hidden conditionally: each tool keeps its
 * action and its test id, one level down. What changes is the claim the bar makes
 * about what matters.
 *
 * 24 October 2026 (the approved «one canvas, three depths» layout): the bar now
 * carries only مِزو and Export out front, as in the concept. Templates moved to the
 * add rail, artboards to the stage's size row, and AI generate joined this menu —
 * with the shortcuts sheet, which is the one entry here a designer *will* open.
 */
function MoreToolsMenu() {
  const { state, actions, dict: L } = useStudio();
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
          style={{ position: 'absolute', top: 38, insetInlineEnd: 0, zIndex: 40, minWidth: 232, display: 'flex', flexDirection: 'column', gap: 2, padding: 4, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
        >
          <button role="menuitem" data-testid="open-ai-gen-btn" style={item} onClick={() => { setOpen(false); actions.openAiGenerate(); }}>{L.ai_gen_btn}</button>
          <button role="menuitem" data-testid="open-shortcuts-btn" style={item} onClick={() => { setOpen(false); actions.toggleShortcuts(); }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}>{L.sc_open}</span>
              <kbd dir="ltr" style={{ fontFamily: 'inherit', fontSize: 11, padding: '0 6px', borderRadius: 5, background: 'var(--surface2)', color: 'var(--muted)' }}>?</kbd>
            </span>
          </button>
          {/* **الوضع الاحترافي** — مسك أداة المتّجهات بدل مسك الأداة الشائعة (`StudioState.pro`). لا يُخفي
              أداةً ولا يُظهرها: كلّ الأدوات حاضرة في الحالين، ويتغيّر المسك وحده. */}
          <button
            role="menuitemcheckbox"
            aria-checked={state.pro}
            data-testid="pro-toggle"
            style={{ ...item, height: 'auto', minHeight: 32, padding: '6px 12px' }}
            onClick={() => {
              setOpen(false);
              actions.togglePro();
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                <span>{L.pro_mode}</span>
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', whiteSpace: 'normal', textWrap: 'balance' }}>{L.pro_mode_hint}</span>
              </span>
              <span
                aria-hidden
                style={{ width: 30, height: 18, borderRadius: 9, background: state.pro ? 'var(--accent)' : 'var(--seg)', position: 'relative', flex: 'none', transition: 'background .15s' }}
              >
                <span style={{ position: 'absolute', top: 2, insetInlineStart: state.pro ? 14 : 2, width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'inset-inline-start .15s' }} />
              </span>
            </span>
          </button>
          <div style={{ height: 1, margin: '3px 6px', background: 'var(--line)' }} />
          {/* قراءةُ بنية المقطع المرجعيّ وخادمُ الأدوات يحتاجان سطحَ المكتب — لا يُعرَضان في الجوال. */}
          {!onMobile && <button role="menuitem" data-testid="open-refvideo-btn" style={item} onClick={() => { setOpen(false); actions.openRefVideo(); }}>{L.refvideo_btn}</button>}
          <button role="menuitem" data-testid="open-local-models-btn" style={item} onClick={() => { setOpen(false); actions.openLocalModels(); }}>{L.local_models_btn}</button>
          <button role="menuitem" data-testid="open-cmd-interpreter-btn" style={item} onClick={() => { setOpen(false); actions.openCmdInterpreter(); }}>{L.nl_cmd_btn}</button>
          {!onMobile && <div style={{ height: 1, margin: '3px 6px', background: 'var(--line)' }} />}
          {!onMobile && <button role="menuitem" data-testid="open-mcp-btn" style={item} onClick={() => { setOpen(false); actions.openMcp(); }}>{L.mcp_btn}</button>}
        </div>
      )}
    </div>
  );
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
