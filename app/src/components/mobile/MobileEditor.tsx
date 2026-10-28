import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStudio } from '../../state/StudioContext';
import type { DocElement, TextElement } from '../../state/elements';
import { MEDIUM_SURFACES, nameOf, sizeAt } from '../../data/constants';
import { documentDuration, formatClock } from '../../lib/animTimeline';
import { Stage } from '../Stage';
import { PropsTab } from '../left-panel/PropsTab';
import { Sheet } from './Sheet';
import { MobileTimeline } from './MobileTimeline';
import { MobileExport } from './MobileExport';
import { setViewInset } from './viewInset';
import { Glyph, IconButton, MI, Slider, ToolButton } from './ui';
import { useM } from './strings';
import {
  ArrangePanel,
  AudioPanel,
  BackgroundPanel,
  ColorPanel,
  CornersPanel,
  FontPanel,
  FxAmountPanel,
  FxKindPanel,
  FxPanel,
  LayersPanel,
  MizoPanel,
  MotionPanel,
  OpacityPanel,
  ShapesPanel,
  SizePanel,
  StrokePanel,
  TextPanel,
  VolumePanel,
  pickFile,
} from './panels';
import './mobile.css';

/** **المحرّرُ في الجوال** — أُعيد بناؤه من الصفر (٢٨ أكتوبر ٢٠٢٦، بطلب المالك:
 * «الشرط السلاسة والجمالية والأداء»).
 *
 * التخطيطُ كتطبيقات التصميم على الجوال (محرّر فيديو شائع وأداة تصميم شائعة): شريطٌ علويّ رفيع، واللوحةُ بكلّ
 * ما بقي، وشريطُ أدواتٍ سفليّ يتبدّل: أدواتُ **الإضافة** حين لا تحديد، وأدواتُ **العنصر
 * المحدَّد** بحسب نوعه حين يُحدَّد (نصّ: الخط، اللون، الحجم…؛ صورة: قص، اقلب…).
 *
 * وكلُّ أداةٍ تفتح **لوحًا سفليًّا** يطفو فوق اللوحة ويُسحَب بالإصبع (`Sheet`)، والمسرحُ
 * يُعيد ملاءمةَ التصميم في المساحة الظاهرة فوقه — فيرى المصمّم أثرَ ما يغيّره وهو يغيّره.
 * والألواحُ مكتوبةٌ للإصبع (`panels.tsx`) لا ألواحَ سطح المكتب مضغوطة. */

type SheetId =
  | 'text'
  | 'shapes'
  | 'fx'
  | 'audio'
  | 'bg'
  | 'mizo'
  | 'layers'
  | 'font'
  | 'color'
  | 'size'
  | 'opacity'
  | 'motion'
  | 'arrange'
  | 'stroke'
  | 'corners'
  | 'volume'
  | 'fxkind'
  | 'fxamount'
  | 'fxfade'
  | 'more';

const ELEMENT_SHEETS: SheetId[] = ['font', 'color', 'size', 'opacity', 'motion', 'arrange', 'stroke', 'corners', 'volume', 'fxkind', 'fxamount', 'fxfade', 'more'];

export function MobileEditor() {
  const { state, actions } = useStudio();
  const M = useM();
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const sheetNow = useRef<SheetId | null>(null);
  sheetNow.current = sheet;
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // جدولُ الطبيعة لا شرطٌ عليها (اصطلاح `MEDIUM_SURFACES`): المستندُ الموقَّت تظهر له
  // أدواتُ الزمن (الخط الزمنيّ، الحركة، الصوت، التأثيرات).
  const timed = MEDIUM_SURFACES[state.medium].motionProps;
  const sel: DocElement | undefined = state.selectedIds.length === 1 ? state.elements.find((e) => e.id === state.selectedIds[0]) : undefined;
  const multi = state.selectedIds.length > 1;
  const editing = !!state.editingTextId || !!state.cropEditingId;

  // لوحُ العنصر يخصّ العنصر: تبديلُ التحديد أو إلغاؤه يُغلقه.
  const selKey = state.selectedIds.join(',');
  const lastSel = useRef(selKey);
  useEffect(() => {
    if (lastSel.current === selKey) return;
    lastSel.current = selKey;
    if (sheet && ELEMENT_SHEETS.includes(sheet)) setSheet(null);
  }, [selKey, sheet]);

  useEffect(() => () => setViewInset(0), []);

  const toggle = (id: SheetId) => setSheet((cur) => (cur === id ? null : id));
  const close = () => setSheet(null);

  /** الارتفاعُ الظاهر من اللوح ← كم يغطّي من المسرح. */
  const restFor = (id: SheetId) => (visible: number) => {
    if (visible === 0 && sheetNow.current !== null && sheetNow.current !== id) return;
    const root = rootRef.current?.getBoundingClientRect();
    const st = stageRef.current?.getBoundingClientRect();
    const gap = root && st ? root.bottom - st.bottom : 0;
    setViewInset(Math.max(0, visible - gap));
  };

  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  const center = () => ({ x: size.w / 2, y: size.h / 2 });

  const addTools = (
    <>
      <ToolButton testid="m-tool-text" icon={MI.text} label={M.t_text} active={sheet === 'text'} onClick={() => toggle('text')} />
      <ToolButton testid="m-tool-shape" icon={MI.shapes} label={M.t_shapes} active={sheet === 'shapes'} onClick={() => toggle('shapes')} />
      <ToolButton testid="m-tool-image" icon={MI.image} label={M.t_image} onClick={() => pickFile('image/*', (f) => void actions.insertImageFromFile(f, center()))} />
      {timed && <ToolButton testid="m-tool-video" icon={MI.video} label={M.t_video} onClick={() => pickFile('video/*,.mp4,.mov,.m4v', (f) => void actions.insertVideoFromFile(f, center()))} />}
      {timed && <ToolButton testid="m-tool-audio" icon={MI.audio} label={M.t_audio} active={sheet === 'audio'} onClick={() => toggle('audio')} />}
      {timed && <ToolButton testid="m-tool-fx" icon={MI.fx} label={M.t_fx} active={sheet === 'fx'} onClick={() => toggle('fx')} />}
      <ToolButton testid="m-tool-lottie" icon={MI.sticker} label={M.t_sticker} onClick={() => pickFile('.json,.lottie,application/json', (f) => void actions.insertLottieFromFile(f, center()))} />
      <ToolButton testid="m-tool-bg" icon={MI.color} label={M.t_bg} active={sheet === 'bg'} onClick={() => toggle('bg')} />
      <ToolButton testid="m-tool-ai" icon={MI.mizo} label={M.t_mizo} active={sheet === 'mizo'} onClick={() => toggle('mizo')} />
      <ToolButton testid="m-layers" icon={timed ? MI.timeline : MI.layers} label={timed ? M.s_timeline : M.t_layers} active={sheet === 'layers'} onClick={() => toggle('layers')} />
    </>
  );

  const common = (opts: { opacity?: boolean; motion?: boolean; arrange?: boolean; more?: boolean } = {}) => (
    <>
      {opts.opacity !== false && <ToolButton testid="m-opacity" icon={MI.opacity} label={M.e_opacity} active={sheet === 'opacity'} onClick={() => toggle('opacity')} />}
      {timed && opts.motion !== false && <ToolButton testid="m-motion" icon={MI.motion} label={M.e_motion} active={sheet === 'motion'} onClick={() => toggle('motion')} />}
      {opts.arrange !== false && <ToolButton testid="m-arrange" icon={MI.order} label={M.e_arrange} active={sheet === 'arrange'} onClick={() => toggle('arrange')} />}
      <ToolButton testid="m-duplicate" icon={MI.duplicate} label={M.e_dup} onClick={actions.duplicateSelected} />
      <ToolButton testid="m-delete" icon={MI.trash} label={M.e_del} danger onClick={actions.deleteSelected} />
      {opts.more !== false && <ToolButton testid="m-edit" icon={MI.more} label={M.e_more} active={sheet === 'more'} onClick={() => toggle('more')} />}
      {timed && <ToolButton testid="m-layers" icon={MI.timeline} label={M.s_timeline} active={sheet === 'layers'} onClick={() => toggle('layers')} />}
    </>
  );

  const elementTools = (el: DocElement) => {
    switch (el.type) {
      case 'text': {
        const t = el as TextElement;
        const nextAlign = t.halign === 'start' ? 'center' : t.halign === 'center' ? 'end' : 'start';
        return (
          <>
            <ToolButton testid="m-edit-text" icon={MI.edit} label={M.e_edit} onClick={() => actions.startTextEdit(el.id)} />
            <ToolButton testid="m-font" icon={MI.font} label={M.e_font} active={sheet === 'font'} onClick={() => toggle('font')} />
            <ToolButton testid="m-color" icon={MI.color} label={M.e_color} active={sheet === 'color'} onClick={() => toggle('color')} />
            <ToolButton testid="m-size" icon={MI.size} label={M.e_size} active={sheet === 'size'} onClick={() => toggle('size')} />
            <ToolButton testid="m-align" icon={t.halign === 'center' ? MI.align : t.halign === 'end' ? MI.alignEnd : MI.alignStart} label={M.e_align} onClick={() => actions.setElementHAlign(el.id, nextAlign)} />
            <ToolButton testid="m-bold" icon={MI.bold} label={M.e_bold} active={t.weight === 'bold'} onClick={() => actions.setElementWeight(el.id, t.weight === 'bold' ? 'regular' : 'bold')} />
            {common()}
          </>
        );
      }
      case 'shape':
        return (
          <>
            <ToolButton testid="m-color" icon={MI.color} label={M.e_color} active={sheet === 'color'} onClick={() => toggle('color')} />
            <ToolButton testid="m-stroke" icon={MI.stroke} label={M.e_stroke} active={sheet === 'stroke'} onClick={() => toggle('stroke')} />
            {el.shape === 'rect' && <ToolButton testid="m-corners" icon={MI.corners} label={M.e_corners} active={sheet === 'corners'} onClick={() => toggle('corners')} />}
            {common()}
          </>
        );
      case 'image':
        return (
          <>
            <ToolButton testid="m-replace" icon={MI.replace} label={M.e_replace} onClick={() => void actions.replaceImage(el.id)} />
            <ToolButton testid="m-crop" icon={MI.crop} label={M.e_crop} onClick={() => actions.startCropEdit(el.id)} />
            <ToolButton testid="m-flip" icon={MI.flip} label={M.e_flip} onClick={() => actions.setImageFlip(el.id, 'h')} />
            <ToolButton testid="m-corners" icon={MI.corners} label={M.e_corners} active={sheet === 'corners'} onClick={() => toggle('corners')} />
            {common()}
          </>
        );
      case 'video':
        return (
          <>
            <ToolButton testid="m-volume" icon={el.muted ? MI.mute : MI.volume} label={M.e_volume} active={sheet === 'volume'} onClick={() => toggle('volume')} />
            <ToolButton testid="m-split" icon={MI.split} label={M.e_split} onClick={() => actions.splitAtPlayhead(el.id)} />
            <ToolButton testid="m-replace" icon={MI.replace} label={M.e_replace} onClick={() => void actions.replaceVideo(el.id)} />
            {common()}
          </>
        );
      case 'audio':
        return (
          <>
            <ToolButton testid="m-volume" icon={el.muted ? MI.mute : MI.volume} label={M.e_volume} active={sheet === 'volume'} onClick={() => toggle('volume')} />
            <ToolButton testid="m-split" icon={MI.split} label={M.e_split} onClick={() => actions.splitAtPlayhead(el.id)} />
            {common({ opacity: false, motion: false, arrange: false })}
          </>
        );
      case 'fx':
        return (
          <>
            <ToolButton testid="m-fx-kind" icon={MI.fx} label={M.e_kind} active={sheet === 'fxkind'} onClick={() => toggle('fxkind')} />
            <ToolButton testid="m-fx-amount" icon={MI.sliders} label={M.e_amount} active={sheet === 'fxamount'} onClick={() => toggle('fxamount')} />
            <ToolButton testid="m-fx-fade" icon={MI.clock} label={M.e_fade} active={sheet === 'fxfade'} onClick={() => toggle('fxfade')} />
            {common({ opacity: false, motion: false, arrange: false })}
          </>
        );
      default:
        return (
          <>
            {el.type === 'lottie' && <ToolButton testid="m-replace" icon={MI.replace} label={M.e_replace} onClick={() => void actions.replaceLottie(el.id)} />}
            {common()}
          </>
        );
    }
  };

  const dockKey = editing ? 'edit' : sel ? `el-${sel.type}` : multi ? 'multi' : 'add';
  const titleOf: Record<SheetId, string> = {
    text: M.s_text,
    shapes: M.s_shapes,
    fx: M.s_fx,
    audio: M.s_audio,
    bg: M.s_bg,
    mizo: M.s_mizo,
    layers: timed ? M.s_timeline : M.s_layers,
    font: M.s_font,
    color: M.s_color,
    size: M.s_size,
    opacity: M.s_opacity,
    motion: M.s_motion,
    arrange: M.s_arrange,
    stroke: M.s_stroke,
    corners: M.s_corners,
    volume: M.s_volume,
    fxkind: M.s_fx_kind,
    fxamount: M.s_fx_amount,
    fxfade: M.e_fade,
    more: M.s_more,
  };

  const S = (id: SheetId, detents: number[], body: ReactNode, opts: { scroll?: boolean } = {}) => (
    <Sheet key={id} open={sheet === id} onClose={close} title={titleOf[id]} detents={detents} testid={`m-sheet-${id}`} onRest={restFor(id)} scroll={opts.scroll}>
      {body}
    </Sheet>
  );

  return (
    <div ref={rootRef} data-testid="mobile-editor" className="m-root">
      <TopBar />

      <div ref={stageRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <Stage />
      </div>

      {timed && <Transport />}

      <nav data-testid="mobile-bar" className="m-dock m-material">
        {editing ? (
          <div key="edit" className="m-swap" style={{ display: 'flex', justifyContent: 'center', padding: '4px 12px' }}>
            <button
              data-testid="m-edit-done"
              className="m-btn m-btn-primary m-press"
              style={{ minWidth: 160 }}
              onClick={() => {
                (document.activeElement as HTMLElement | null)?.blur();
                if (state.cropEditingId) actions.endCropEdit();
              }}
            >
              <Glyph d={MI.check} size={20} sw={2.2} />
              {M.done}
            </button>
          </div>
        ) : (
          <div key={dockKey} className="m-swap" style={{ display: 'flex', alignItems: 'center' }}>
            {(sel || multi) && (
              <>
                <button data-testid="m-done" className="m-tool m-press" aria-label={M.done} onClick={actions.selectNone} style={{ flex: 'none', minWidth: 56 }}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--m-text)', color: 'var(--m-bg)' }}>
                    <Glyph d={MI.check} size={18} sw={2.4} style={{ color: 'var(--m-bg)' }} />
                  </span>
                </button>
                <span style={{ width: 1, height: 32, background: 'var(--m-hair2)', flex: 'none', marginInline: 2 }} />
              </>
            )}
            <div className="m-dock-row" style={{ flex: 1, minWidth: 0 }}>
              {sel ? (
                elementTools(sel)
              ) : multi ? (
                <>
                  <ToolButton testid="m-group" icon={MI.grid} label={M.e_group} onClick={actions.groupSelected} />
                  <ToolButton testid="m-duplicate" icon={MI.duplicate} label={M.e_dup} onClick={actions.duplicateSelected} />
                  <ToolButton testid="m-delete" icon={MI.trash} label={M.e_del} danger onClick={actions.deleteSelected} />
                </>
              ) : (
                addTools
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ألواحُ الإضافة */}
      {S('text', [0.5, 0.9], <TextPanel onDone={close} />)}
      {S('shapes', [0.5, 0.9], <ShapesPanel onDone={close} />)}
      {S('fx', [0.5, 0.9], <FxPanel onDone={close} />)}
      {S('audio', [0.45, 0.9], <AudioPanel />)}
      {S('bg', [0.5, 0.9], <BackgroundPanel />)}
      {S('mizo', [0.6, 0.92], <MizoPanel />, { scroll: false })}
      {S('layers', timed ? [0.5, 0.9] : [0.45, 0.9], timed ? <MobileTimeline /> : <LayersPanel />, { scroll: !timed })}

      {/* ألواحُ العنصر */}
      {sel?.type === 'text' && S('font', [0.5, 0.9], <FontPanel el={sel as TextElement} />)}
      {sel && S('color', [400], <ColorPanel el={sel} />)}
      {sel?.type === 'text' && S('size', [210], <SizePanel el={sel as TextElement} />)}
      {sel && S('opacity', [170], <OpacityPanel el={sel} />)}
      {sel && S('motion', [250], <MotionPanel el={sel} />)}
      {sel && S('arrange', [280], <ArrangePanel el={sel} />)}
      {sel?.type === 'shape' && S('stroke', [470], <StrokePanel el={sel} />)}
      {(sel?.type === 'shape' || sel?.type === 'image') && S('corners', [170], <CornersPanel el={sel as DocElement & { type: 'shape' | 'image' }} />)}
      {(sel?.type === 'audio' || sel?.type === 'video') && S('volume', [230], <VolumePanel el={sel as DocElement & { type: 'audio' | 'video' }} />)}
      {sel?.type === 'fx' && S('fxkind', [0.55, 0.9], <FxKindPanel el={sel} />)}
      {sel?.type === 'fx' && S('fxamount', [170], <FxAmountPanel el={sel} />)}
      {sel?.type === 'fx' && S('fxfade', [250], <FxAmountPanel el={sel} fade />)}
      {sel && S('more', [0.6, 0.92], <div style={{ padding: '0 4px 16px', fontSize: 14 }}>{<PropsTab />}</div>)}

      <MobileExport />
    </div>
  );
}

function TopBar() {
  const { state, actions } = useStudio();
  const M = useM();
  const rtl = state.lang === 'ar';
  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  return (
    <header style={{ position: 'relative', zIndex: 6, flex: 'none', display: 'flex', alignItems: 'center', gap: 2, padding: 'calc(4px + var(--m-safe-t)) 8px 4px', boxShadow: 'inset 0 -1px 0 var(--m-hair)' }}>
      <IconButton testid="go-home-btn" icon={MI.back} label={M.back} onClick={actions.goHome} flip={rtl} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.2, paddingInline: 4 }}>
        <span style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(size, state.lang)}</span>
        <span dir="ltr" style={{ fontSize: 11.5, color: 'var(--m-text3)', textAlign: rtl ? 'right' : 'left' }}>
          {size.w} × {size.h}
        </span>
      </div>
      <IconButton testid="undo-btn" icon={rtl ? MI.redo : MI.undo} label={M.undo} onClick={actions.undo} disabled={!state.historyPast.length} data={{ 'data-history-past': state.historyPast.length }} />
      <IconButton testid="redo-btn" icon={rtl ? MI.undo : MI.redo} label={M.redo} onClick={actions.redo} disabled={!state.historyFuture.length} />
      <button data-testid="export-btn" className="m-btn m-btn-primary m-press" onClick={actions.openExport} style={{ minHeight: 36, height: 36, padding: '0 14px', borderRadius: 999, fontSize: 14, marginInlineStart: 4 }}>
        <Glyph d={MI.share} size={17} sw={2} />
        {M.export}
      </button>
    </header>
  );
}

/** شريطُ التشغيل: زرٌّ ووقتٌ ومنزلقٌ يُمسَك من أيّ نقطة. */
function Transport() {
  const { state, actions } = useStudio();
  const M = useM();
  const dur = Math.max(documentDuration(state.elements.map((e) => e.anim), state.fps), 1 / state.fps);
  return (
    <div data-testid="mobile-transport" style={{ position: 'relative', zIndex: 5, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '2px 14px 2px 10px' }}>
      <button data-testid="m-play" className="m-icon-btn m-press" onClick={actions.togglePlay} aria-label={state.playing ? M.pause : M.play} style={{ width: 40, height: 40 }}>
        <Glyph d={state.playing ? MI.pause : MI.play} size={20} fill={!state.playing} sw={2.4} />
      </button>
      <div dir="ltr" style={{ flex: 1, minWidth: 0 }}>
        <Slider testid="m-scrub" value={Math.min(state.t, dur)} min={0} max={dur} step={1 / state.fps} onChange={actions.scrubTo} />
      </div>
      <span dir="ltr" style={{ flex: 'none', fontSize: 12, color: 'var(--m-text2)', fontVariantNumeric: 'tabular-nums', minWidth: 74, textAlign: 'end' }}>
        {formatClock(state.t)} / {formatClock(dur)}
      </span>
    </div>
  );
}
