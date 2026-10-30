import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { ICONS, MEDIUM_SURFACES, PALETTES } from '../../data/constants';
import type { HAlign } from '../../state/types';
import type { AnimPreset, DocElement } from '../../state/elements';
import { ANIM_PRESETS, hasCustomAnimation, resolveTextColor } from '../../state/elements';
import { baseLayerColorOf, normalizeHex, resolveLayerColor } from '../../lib/appearance';
import { useStudio } from '../../state/StudioContext';

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
export const CMD = isMac ? '⌘' : 'Ctrl ';
export const ALT = isMac ? '⌥' : 'Alt ';

type PopId = 'font' | 'color' | 'anim' | 'more' | 'align' | null;

const PRESETS: AnimPreset[] = ANIM_PRESETS;
const ALIGN_NEXT: Record<HAlign, HAlign> = { start: 'center', center: 'end', end: 'start' };
const ALIGN_ICON: Record<HAlign, string> = {
  start: 'M4 5h12M4 9h8M4 13h12M4 17h8',
  center: 'M4 5h12M6 9h8M4 13h12M6 17h8',
  end: 'M4 5h12M8 9h8M4 13h12M8 17h8',
};

/** **الشريط السياقي — السطح الأوّل من الأعماق الثلاثة.**
 *
 * نقرةٌ على العنصر = شريطٌ صغير بأكثر ما يُعدَّل فيه (الأداة الشائعة)، فلا يحتاج المصمّم لوحًا
 * ليغيّر خطًّا أو لونًا. وكلّ ما عداه في المفتش. وفيه الباب إلى العمقين الآخرين: «حرّر
 * النقاط» للمسار (الدقّة) و«حرّك» لكلّ عنصر (الزمن) — وعلى مستندٍ ساكن تجعل «حرّك»
 * التصميمَ مشهدًا ويطلع الخطّ الزمنيّ (`animateElement`).
 *
 * **مثبَّتٌ أعلى اللوحة لا عائمٌ فوق العنصر.** بُني أوّلًا عائمًا فوق التحديد كما في
 * التصوّر، فقيسَ أنّه يغطّي العنصرَ المجاور الذي يريد المصمّم نقره بعده (عند ١٢٨٠×٧٢٠
 * غطّى شريطُ العنوان «نصَّ الشارة» كلّه). وفي مكانٍ ثابت لا يغطّي التصميم أبدًا، وتعرفه
 * اليد بلا نظر — وهو ما تفعله الأداة الشائعة نفسها: شريطها السياقيّ أعلى اللوحة.
 *
 * يختفي أثناء أيّ إيماءة سحب (`pendingEditSnapshot`). */
export function ContextBar() {
  const { state, actions, dict: L } = useStudio();
  const [pop, setPop] = useState<PopId>(null);
  /** الزرّ الذي فتح المنبثقة — تنزل المنبثقة تحته هو، لا عند طرف الشريط. */
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const sel = state.elements.filter((e) => state.selectedIds.includes(e.id));
  const el: DocElement | undefined = sel.length === 1 ? sel[0] : undefined;
  const pal = PALETTES[state.postPalette];

  // الاختيار يتغيّر = المنبثقة المفتوحة تخصّ عنصرًا آخر؛ تُغلق.
  useEffect(() => setPop(null), [state.selectedIds.join('|')]);
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setPop(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPop(null);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [pop]);

  const toggle = (p: PopId, e: ReactMouseEvent<HTMLElement>) => {
    setAnchor(e.currentTarget);
    setPop((cur) => (cur === p ? null : p));
  };

  // ── وضعا التحرير: النقاط والقصّ — شريطٌ يقول أين أنت وكيف تخرج ─────────────
  if (state.nodeEditId || state.cropEditingId) {
    const nodes = !!state.nodeEditId;
    return (
      <div ref={barRef} data-testid="context-bar" data-stage-overlay data-mode={nodes ? 'nodes' : 'crop'} onPointerDown={(e) => e.stopPropagation()} style={barStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', fontSize: 12.5, fontWeight: 600, color: nodes ? 'var(--vector)' : 'var(--text)' }}>
          <Icon size={15} path={nodes ? 'M5 3l10 6.5-4.8 1.3L7.8 15.5zM13.5 13.5h3.5v3.5h-3.5z' : 'M6 2v12h12M2 6h12v12'} />
          {nodes ? L.ctx_edit_points : L.ctx_crop}
        </span>
        <kbd className="mz-kbd" dir="ltr">Esc</kbd>
        <Sep />
        <button
          data-testid="context-done"
          onClick={() => (nodes ? actions.endNodeEdit() : actions.endCropEdit())}
          style={{ ...pillBtn, background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 600, padding: '0 14px' }}
        >
          {nodes ? L.node_edit_done : L.crop_done}
        </button>
      </div>
    );
  }

  const presetBlocked = !!el && hasCustomAnimation(el.anim.tracks, el.anim.preset);
  const shapeFill = el?.type === 'shape' ? (() => {
    const base = baseLayerColorOf(el);
    return base ? resolveLayerColor(base.color, base.colorToken, pal) : (el.fill ?? pal[el.fillToken]);
  })() : null;
  const anim = el ? (
    <>
      <Sep />
      <button
        data-testid="ctx-animate"
        aria-expanded={pop === 'anim'}
        onClick={(e) => toggle('anim', e)}
        title={L.ctx_animate}
        style={{ ...pillBtn, background: 'var(--motionSoft)', color: 'var(--motion)', fontWeight: 600, gap: 6, padding: '0 12px' }}
      >
        <Icon size={14} path="M6.5 4.5l9 5.5-9 5.5z" fill="currentColor" />
        {L.ctx_animate}
      </button>
    </>
  ) : null;

  const more = (
    <button data-testid="ctx-more" aria-label={L.ctx_more} title={L.ctx_more} aria-expanded={pop === 'more'} onClick={(e) => toggle('more', e)} style={{ ...iconBtn, fontSize: 18, letterSpacing: 1 }}>
      ⋯
    </button>
  );

  let body: ReactNode = null;
  if (el?.type === 'text') {
    const color = resolveTextColor(el, pal);
    body = (
      <>
        <button data-testid="ctx-font" aria-expanded={pop === 'font'} onClick={(e) => toggle('font', e)} title={L.ctx_font} style={{ ...pillBtn, background: 'var(--surface2)', maxWidth: 150, gap: 6 }}>
          <span style={{ fontFamily: `'${el.fontFamily}', sans-serif`, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="auto">{state.fonts.find((f) => f.family === el.fontFamily)?.name ?? el.fontFamily}</span>
          <Icon size={12} path="M5 8l5 5 5-5" />
        </button>
        <div dir="ltr" style={{ display: 'flex', alignItems: 'center', height: 34, borderRadius: 9, background: 'var(--surface2)', marginInlineStart: 4 }}>
          <button data-testid="ctx-size-down" aria-label={L.ctx_smaller} title={L.ctx_smaller} onClick={() => actions.setElementFontSize(el.id, Math.round(el.fontSize) - 4)} style={stepBtn}>−</button>
          <span data-testid="ctx-size" style={{ minWidth: 34, textAlign: 'center', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Math.round(el.fontSize)}</span>
          <button data-testid="ctx-size-up" aria-label={L.ctx_bigger} title={L.ctx_bigger} onClick={() => actions.setElementFontSize(el.id, Math.round(el.fontSize) + 4)} style={stepBtn}>+</button>
        </div>
        <Sep />
        <button data-testid="ctx-color" aria-label={L.ctx_color} title={L.ctx_color} aria-expanded={pop === 'color'} onClick={(e) => toggle('color', e)} style={iconBtn}>
          <Swatch hex={color} />
        </button>
        <button
          data-testid="ctx-bold"
          aria-label={L.ctx_bold}
          title={`${L.ctx_bold}`}
          aria-pressed={el.weight === 'bold'}
          onClick={() => actions.setElementWeight(el.id, el.weight === 'bold' ? 'regular' : 'bold')}
          style={{ ...iconBtn, fontWeight: 800, fontSize: 15, fontFamily: 'system-ui, sans-serif', background: el.weight === 'bold' ? 'var(--seg)' : 'transparent', color: 'var(--text)' }}
        >
          B
        </button>
        <button data-testid="ctx-align" aria-label={L.ctx_align} title={L.ctx_align} onClick={() => actions.setElementHAlign(el.id, ALIGN_NEXT[el.halign])} style={iconBtn}>
          <Icon size={17} path={ALIGN_ICON[el.halign]} style={{ transform: state.lang === 'ar' ? 'scaleX(-1)' : 'none' }} />
        </button>
        {anim}
        {more}
      </>
    );
  } else if (el?.type === 'shape') {
    const fill = shapeFill ?? pal.ac;
    const editable = el.shape === 'path' && (el.points?.length ?? 0) >= 2 && !el.outline?.length && !el.subpaths?.length;
    body = (
      <>
        <button data-testid="ctx-color" aria-label={L.ctx_fill} title={L.ctx_fill} aria-expanded={pop === 'color'} onClick={(e) => toggle('color', e)} style={iconBtn}>
          <Swatch hex={fill} square />
        </button>
        {editable && (
          <button data-testid="ctx-edit-points" onClick={() => actions.startNodeEdit(el.id)} title={`${L.ctx_edit_points} (A)`} style={{ ...pillBtn, gap: 6, color: 'var(--vector)' }}>
            <Icon size={15} path="M5 3l10 6.5-4.8 1.3L7.8 15.5zM13.5 13.5h3.5v3.5h-3.5z" />
            {L.ctx_edit_points}
          </button>
        )}
        {anim}
        {more}
      </>
    );
  } else if (el?.type === 'image') {
    body = (
      <>
        {el.src && (
          <button data-testid="ctx-crop" onClick={() => actions.startCropEdit(el.id)} style={{ ...pillBtn, gap: 6 }}>
            <Icon size={15} path="M6 2v12h12M2 6h12v12" />
            {L.ctx_crop}
          </button>
        )}
        {/* «تتبّع الصورة» كما يسمّيه أداة المتّجهات: الصورة ← مساراتٌ تُعدَّل، بالفعل نفسه الذي
          * في قسم الصورة وقائمة الزرّ الأيمن (`traceImage`). */}
        {el.src && (
          <button
            data-testid="ctx-trace"
            onClick={() => void actions.traceImage(el.id)}
            disabled={!!state.traceBusyId}
            title={L.trace_hint}
            style={{ ...pillBtn, gap: 6, opacity: state.traceBusyId ? 0.6 : 1 }}
          >
            <Icon size={15} path={ICONS.pen} />
            {state.traceBusyId === el.id ? L.trace_busy : L.ctx_trace}
          </button>
        )}
        {/* إطارٌ فاضٍ لا يُستبدَل منه شيء: زرّه «اختر صورة» كما في المفتش، و«بدّل» لما فيه صورة. */}
        <button data-testid="ctx-replace" onClick={() => void actions.replaceImage(el.id)} style={{ ...pillBtn, gap: 6 }}>
          <Icon size={15} path={el.src ? 'M4 7h10l-3-3M16 13H6l3 3' : 'M3 5h14v10H3zM3 12l4-4 3 3 2-2 5 5'} />
          {el.src ? L.ctx_replace : L.choose_image}
        </button>
        {anim}
        {more}
      </>
    );
  } else if (el) {
    body = (
      <>
        {anim}
        {more}
      </>
    );
  } else if (sel.length > 1) {
    body = (
      <>
        <button data-testid="ctx-align-sel" aria-expanded={pop === 'align'} onClick={(e) => toggle('align', e)} style={{ ...pillBtn, gap: 6 }}>
          <Icon size={15} path="M3 10h14M6 6h8v8H6z" />
          {L.ctx_align_sel}
        </button>
        <button data-testid="ctx-group" onClick={actions.groupSelected} title={`${L.ctx_group} (${CMD}G)`} style={{ ...pillBtn, gap: 6 }}>
          <Icon size={15} path="M3 3h6v6H3zM11 11h6v6h-6zM9 6h5v5" />
          {L.ctx_group}
        </button>
        <Sep />
        {more}
      </>
    );
  }
  if (!body) return null;

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={L.ctx_more}
      data-testid="context-bar"
      data-stage-overlay
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={barStyle}
    >
      {body}

      {pop === 'font' && el?.type === 'text' && (
        <Pop anchor={anchor} wide>
          {state.fonts
            .filter((f) => f.status === 'ready')
            .map((f) => (
              <button
                key={f.id}
                data-testid={`ctx-font-${f.family}`}
                onClick={() => {
                  actions.setElementFont(el.id, f.family);
                  setPop(null);
                }}
                style={{ ...menuItem, fontFamily: `'${f.family}', sans-serif`, fontSize: 14, background: el.fontFamily === f.family ? 'var(--accentSoft)' : 'transparent' }}
              >
                {f.name}
              </button>
            ))}
        </Pop>
      )}

      {pop === 'color' && el && (el.type === 'text' || el.type === 'shape') && (
        <Pop anchor={anchor}>
          <ColorGrid
            current={el.type === 'text' ? resolveTextColor(el, pal) : (shapeFill ?? pal.ac)}
            swatches={Array.from(new Set([pal.fg, pal.ac, pal.bg, ...(pal.ac2 ? [pal.ac2] : []), '#FFFFFF', '#111111', '#E8743B', '#FFD15C', '#3DD6C6', '#6D5BFF']))}
            onPick={(hex) => (el.type === 'text' ? actions.setElementColor(el.id, hex) : actions.setShapeFill(el.id, hex))}
          />
        </Pop>
      )}

      {pop === 'anim' && el && (
        <Pop anchor={anchor}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, width: 220 }}>
            {PRESETS.map((p) => {
              const active = MEDIUM_SURFACES[state.medium].motionProps && el.anim.preset === p;
              return (
                <button
                  key={p}
                  data-testid={`ctx-anim-${p}`}
                  disabled={presetBlocked}
                  title={presetBlocked ? L.preset_blocked : undefined}
                  onClick={() => {
                    actions.animateElement(el.id, p);
                    setPop(null);
                  }}
                  style={{ height: 34, border: `1px solid ${active ? 'var(--motion)' : 'transparent'}`, borderRadius: 9, background: active ? 'var(--motionSoft)' : 'var(--surface2)', color: 'var(--text)', fontSize: 12, opacity: presetBlocked ? 0.4 : 1 }}
                >
                  {L[`anim_${p}` as const]}
                </button>
              );
            })}
          </div>
        </Pop>
      )}

      {pop === 'align' && sel.length > 1 && (
        <Pop anchor={anchor}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 34px)', gap: 4 }}>
            {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((edge) => (
              <button key={edge} data-testid={`ctx-align-${edge}`} onClick={() => actions.alignSelected(edge)} title={edge} style={{ ...iconBtn, background: 'var(--surface2)' }}>
                <Icon size={15} path={ALIGN_EDGE_ICON[edge]} />
              </button>
            ))}
          </div>
        </Pop>
      )}

      {pop === 'more' && (
        <Pop anchor={anchor} end>
          <MenuRow testid="ctx-duplicate" label={L.ctx_duplicate} keys={`${CMD}D`} onClick={() => { actions.duplicateSelected(); setPop(null); }} />
          {/* نسخُ الحركة ولصقُها — البندان نفسُهما في قائمة الزرّ الأيمن (`StageMenu`). */}
          {MEDIUM_SURFACES[state.medium].motionProps && <MenuRow testid="ctx-copy-anim" label={L.sm_copy_anim} keys={`${ALT}${CMD}C`} onClick={() => { actions.copyAnimation(); setPop(null); }} />}
          {MEDIUM_SURFACES[state.medium].motionProps && state.animClipboard && <MenuRow testid="ctx-paste-anim" label={L.sm_paste_anim} keys={`${ALT}${CMD}V`} onClick={() => { actions.pasteAnimation(); setPop(null); }} />}
          <MenuRow testid="ctx-forward" label={L.bring_forward} keys={`${CMD}]`} onClick={() => { actions.bringForward(state.selectedIds); setPop(null); }} />
          <MenuRow testid="ctx-backward" label={L.send_backward} keys={`${CMD}[`} onClick={() => { actions.sendBackward(state.selectedIds); setPop(null); }} />
          <MenuRow testid="ctx-lock" label={L.lock_layer} keys={`${CMD}2`} onClick={() => { actions.lockSelected(); setPop(null); }} />
          {!state.inspectorOpen && <MenuRow testid="ctx-inspector" label={L.insp_open} keys={`${CMD}\\`} onClick={() => { actions.toggleInspector(); setPop(null); }} />}
          <div style={{ height: 1, margin: '3px 6px', background: 'var(--line)' }} />
          <MenuRow testid="ctx-delete" label={L.ctx_delete} keys="⌫" danger onClick={() => { actions.deleteSelected(); setPop(null); }} />
        </Pop>
      )}
    </div>
  );
}

const ALIGN_EDGE_ICON: Record<'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom', string> = {
  left: 'M3 3v14M7 6h9M7 11h6',
  center: 'M10 3v14M4 7h12M6 12h8',
  right: 'M17 3v14M4 6h9M7 11h6',
  top: 'M3 3h14M6 7v9M11 7v6',
  middle: 'M3 10h14M7 4v12M12 6v8',
  bottom: 'M3 17h14M6 4v9M11 7v6',
};

function Sep() {
  return <span style={{ width: 1, height: 22, background: 'var(--lineStrong)', margin: '0 4px', flex: 'none' }} />;
}

function Swatch({ hex, square }: { hex: string; square?: boolean }) {
  return <span style={{ width: 18, height: 18, borderRadius: square ? 5 : 9, background: hex, boxShadow: '0 0 0 2px var(--surface2), 0 0 0 3.5px var(--lineStrong)', display: 'block' }} />;
}

/** **منبثقةٌ تحت زرّها، ولا تخرج من المسرح.**
 *
 * كانت تُثبَّت عند بداية الشريط (`insetInlineStart: 0`) والشريطُ نفسه على نهاية
 * المسرح — فشريطُ الشكل القصير يفتح لوحَ الألوان ممتدًّا خارج حافّة المسرح تحت المفتش
 * (نصفُ الألوان مقصوص)، وشريطُ النصّ الطويل يفتح قائمةَ «حرّك» عند طرفه الآخر بعيدًا عن
 * زرّها (جولة الاستخدام). فالموضعُ يُقاس الآن: حافّةُ البداية على حافّة الزرّ — أو حافّة
 * النهاية لقائمة `end` — ثم تُحصَر داخل المسرح بهامش ٨ بكسل. وتُخفى إلى أن تُقاس فلا
 * تومض في موضعٍ خاطئ. */
function Pop({ children, anchor, wide, end }: { children: ReactNode; anchor: HTMLElement | null; wide?: boolean; end?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    const pop = ref.current;
    const bar = pop?.offsetParent as HTMLElement | null;
    if (!pop || !bar) return;
    const barBox = bar.getBoundingClientRect();
    const bounds = (bar.closest('.mz-stage') ?? document.documentElement).getBoundingClientRect();
    const a = (anchor && bar.contains(anchor) ? anchor : bar).getBoundingClientRect();
    const w = pop.offsetWidth;
    const rtl = getComputedStyle(bar).direction === 'rtl';
    const alignRightEdges = rtl ? !end : !!end;
    const PAD = 8;
    const x = Math.max(bounds.left + PAD, Math.min(alignRightEdges ? a.right - w : a.left, bounds.right - PAD - w));
    setLeft(x - barBox.left);
  }, [anchor, end]);
  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: left ?? 0,
        visibility: left === null ? 'hidden' : undefined,
        zIndex: 6,
        minWidth: wide ? 200 : undefined,
        maxHeight: 300,
        overflowY: 'auto',
        padding: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        border: '1px solid var(--lineStrong)',
        borderRadius: 12,
        background: 'var(--surface)',
        boxShadow: 'var(--shadow)',
        animation: 'mz-fade .12s ease',
      }}
    >
      {children}
    </div>
  );
}

function ColorGrid({ current, swatches, onPick }: { current: string; swatches: string[]; onPick: (hex: string) => void }) {
  const cur = (normalizeHex(current) ?? current).toLowerCase();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 2 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 26px)', gap: 6 }}>
        {swatches.map((hex) => (
          <button
            key={hex}
            data-testid={`ctx-swatch-${hex.replace('#', '')}`}
            title={hex}
            onClick={() => onPick(hex)}
            style={{ width: 26, height: 26, borderRadius: 13, border: 0, background: hex, boxShadow: hex.toLowerCase() === cur ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)' : 'inset 0 0 0 1px rgba(255,255,255,.12)' }}
          />
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
        <input data-testid="ctx-color-input" type="color" value={normalizeHex(current) ?? '#000000'} onChange={(e) => onPick(e.target.value)} style={{ width: 30, height: 26, padding: 0, border: 0, background: 'transparent' }} />
        <span dir="ltr" style={{ fontVariantNumeric: 'tabular-nums' }}>{(normalizeHex(current) ?? current).toUpperCase()}</span>
      </label>
    </div>
  );
}

export function MenuRow({ label, keys, onClick, danger, testid }: { label: string; keys: string; onClick: () => void; danger?: boolean; testid: string }) {
  return (
    <button data-testid={testid} role="menuitem" onClick={onClick} className="mz-btn" style={{ ...menuItem, color: danger ? 'var(--danger)' : 'var(--text)' }}>
      <span style={{ flex: 1 }}>{label}</span>
      <kbd dir="ltr" style={{ fontFamily: 'inherit', fontSize: 11, color: 'var(--faint)' }}>{keys}</kbd>
    </button>
  );
}

const barStyle: CSSProperties = {
  position: 'relative',
  zIndex: 5,
  pointerEvents: 'auto',
  height: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: '0 5px',
  borderRadius: 13,
  background: 'var(--float)',
  border: '1px solid var(--lineStrong)',
  boxShadow: 'var(--shadow)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  whiteSpace: 'nowrap',
  animation: 'mz-fade .14s ease',
};
const pillBtn: CSSProperties = { height: 34, padding: '0 10px', border: 0, borderRadius: 9, background: 'transparent', color: 'var(--text)', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', flex: 'none' };
const iconBtn: CSSProperties = { width: 34, height: 34, border: 0, borderRadius: 9, background: 'transparent', color: 'var(--muted)', display: 'grid', placeItems: 'center', flex: 'none' };
const stepBtn: CSSProperties = { width: 26, height: 34, border: 0, background: 'transparent', color: 'var(--muted)', fontSize: 16 };
const menuItem: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', minWidth: 190, height: 32, padding: '0 10px', border: 0, borderRadius: 8, background: 'transparent', color: 'var(--text)', fontSize: 13, textAlign: 'start' };
