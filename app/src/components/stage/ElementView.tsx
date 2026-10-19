import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Palette } from '../../data/constants';
import type { DocElement, TextElement } from '../../state/elements';
import { resolveShapeLabelColor, resolveTextColor } from '../../state/elements';
import type { Lang } from '../../i18n/strings';
import { computeImageCropLayout } from '../../lib/imageCrop';
import { maskLocalPolygonPoints, geoToPx } from '../../lib/geometry';
import { commandsToSvgPath, pathElementCommands, type PathCmd } from '../../lib/pathGeometry';
import { appearanceBoxShadowCss, fillsToCss, legacyBorderCss, resolveAppearance, withAlpha } from '../../lib/appearance';
import { splitStrokesByWidthKind, variableStrokeOutlineCmds } from '../../lib/variableStroke';
import { SHOWN_UNIT_VISUAL, buildStaggerTokens, resolveUnitVisual, unitVisualToCssTransform } from '../../lib/textStagger';
import { shapeTextOnCurve } from '../../lib/textOnPath';
import { wrapLines, justifyCanvasLines } from '../../lib/exportArtboard';
import { LottiePreview } from './LottiePreview';
import { VideoPreview } from './VideoPreview';

/** Roadmap #12 — live preview of a text element bent along `pathShape`'s curve (see
 * `src/lib/textOnPath.ts`). The shaping itself is async (real HarfBuzz/WASM, same
 * pipeline "تحويل النص إلى مخطط متجهي" uses) so this is its own small component with
 * local state, re-shaping whenever the text/font/curve actually changes rather than
 * blocking `ElementView`'s own synchronous render — the previous successfully shaped
 * result stays on screen while a new shape is in flight, so editing the text doesn't
 * flash to empty on every keystroke. */
function TextOnPathView({ el, pathShape, size, color, dir }: { el: TextElement; pathShape: DocElement & { type: 'shape' }; size: { w: number; h: number }; color: string; dir: 'rtl' | 'ltr' }) {
  const [cmds, setCmds] = useState<PathCmd[]>([]);
  useEffect(() => {
    let cancelled = false;
    shapeTextOnCurve(el, pathShape, size, dir)
      .then((result) => {
        if (!cancelled) setCmds(result);
      })
      .catch(() => {
        if (!cancelled) setCmds([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.text, el.fontFamily, el.fontSize, el.weight, el.halign, el.geo, pathShape.geo, pathShape.points, pathShape.subpaths, pathShape.smoothAmount, pathShape.closed, size.w, size.h, dir]);

  const frameBoxPx = geoToPx(el.geo, size);
  const d = commandsToSvgPath(cmds, 1, 1);
  return (
    <svg viewBox={`0 0 ${frameBoxPx.w} ${frameBoxPx.h}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
      <path d={d} fill={color} />
    </svg>
  );
}

/** Renders a text element's content as a sequence of char/word/line units, each with
 * its own opacity/transform resolved at `time` — the roadmap #6 stagger layer. For
 * 'char'/'word', whitespace/separator tokens (`rank === null`) are emitted as plain
 * text (not wrapped in a span), so the browser's normal line-wrapping still happens
 * at those exact points, same as the plain `{el.text}` render this replaces. For
 * 'line', each authored line becomes its own block so it stacks as its own row
 * inside the parent's `flexDirection: 'column'` container (see `baseStyle` below) —
 * see `src/lib/textStagger.ts` for why 'line' means an authored newline, not an
 * auto-wrapped visual line. */
function renderStaggeredText(el: TextElement, time: number): ReactNode {
  const cfg = el.textAnim;
  const clipStart = el.anim.start;
  const tokens = buildStaggerTokens(el.text, cfg, el.id);
  if (cfg.unit === 'line') {
    return tokens.map((tok, i) => {
      const visual = tok.rank === null ? SHOWN_UNIT_VISUAL : resolveUnitVisual(cfg, tok.rank, clipStart, time);
      return (
        <div key={i} style={{ opacity: visual.opacity, transform: unitVisualToCssTransform(visual), transformOrigin: 'center' }}>
          {tok.text || ' '}
        </div>
      );
    });
  }
  // Wrapped in a single <span> — as a direct child of the parent's `display:flex`
  // (see baseStyle below), every *element* child becomes its own flex item regardless
  // of its own `display` value (only bare text nodes among flex children merge into one
  // anonymous item), so one token per top-level <span> would stack each character on
  // its own flex row instead of flowing inline. One wrapper element keeps this whole
  // run as a single flex item, with normal inline wrapping for the spans inside it.
  return (
    <span>
      {tokens.map((tok, i) => {
        if (tok.rank === null) return tok.text;
        const visual = resolveUnitVisual(cfg, tok.rank, clipStart, time);
        return (
          <span key={i} style={{ display: 'inline-block', opacity: visual.opacity, transform: unitVisualToCssTransform(visual), transformOrigin: 'center bottom' }}>
            {tok.text}
          </span>
        );
      })}
    </span>
  );
}

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

const WEIGHT_CSS_NUM = { regular: 400, medium: 600, bold: 800 } as const;

/** Roadmap #18 — the live preview's hook into kashida justification. The plain
 * `{el.text}` render this replaces lets the browser wrap and flow the text itself
 * (`whiteSpace` normal inside a flex column, see the caller); justification needs to
 * pick actual line breaks to stretch, so this takes over wrapping too — using the
 * *exact same* `wrapLines`/`justifyCanvasLines` the canvas/PNG export path calls,
 * measured via an offscreen `CanvasRenderingContext2D` with the identical font string,
 * so the live preview and the exported raster never disagree on where lines break or
 * how many kashida a line gets. `size` is the artboard's own logical pixel size (the
 * same `size.w`/`size.h` every other render path already measures against — see
 * `exportArtboard.ts`), not the on-screen CSS size, so this works identically
 * regardless of window/zoom (the DOM's own `cqw` font sizing already makes the ratio
 * between glyph width and box width scale-invariant). Only reached when `el.justify`
 * is on and `dir==='rtl'` (see call site) — every pre-existing document, where
 * `justify` is `undefined`, never renders through this component at all. */
function JustifiedTextView({ el, size }: { el: TextElement; size: { w: number; h: number } }) {
  const [lines, setLines] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const ctx = getMeasureCtx();
    if (!ctx) return;
    const fontPx = (el.fontSize / 1080) * size.w;
    ctx.font = `${WEIGHT_CSS_NUM[el.weight]} ${fontPx}px ${el.fontFamily}, sans-serif`;
    // التتبُّع يدخل في القياس لا في الرسم وحده: `wrapLines` تقرّر مواضع الكسر من
    // `measureText`، فلو قيس بلا تتبُّع لانكسر السطر في موضعٍ غير الذي يُرسَم فيه.
    ctx.letterSpacing = trackingCss(el.tracking) ?? '0px';
    const bw = el.geo.w * size.w;
    const wrapped = wrapLines(ctx, el.text, bw);
    justifyCanvasLines(ctx, wrapped, bw).then((justified) => {
      if (!cancelled) setLines(justified);
    });
    return () => {
      cancelled = true;
    };
  }, [el.text, el.fontFamily, el.fontSize, el.weight, el.tracking, el.geo.w, size.w]);
  // Previous result (or the plain unjustified text on first mount) stays on screen
  // while a new pass is in flight — same "never flash to empty" principle as
  // `TextOnPathView` above.
  return <>{(lines ?? el.text.split(/\s+/).filter(Boolean)).map((line, i) => <div key={i} style={{ whiteSpace: 'pre' }}>{line}</div>)}</>;
}

const HALIGN_CSS: Record<string, CSSProperties['textAlign']> = { start: 'start', center: 'center', end: 'end' };

/** تتبُّع الأحرف بصيغة CSS من `TextElement.tracking` (نسبة مئويّة من مقاس الخطّ).
 * `em` لا بكسلات: المعاينة تقيس الخطّ بـ`cqw`، فبكسلاتٌ ثابتة كانت ستنفصل عن
 * الحجم عند أي تكبير. و`undefined` حين لا تتبُّع، فلا تدخل الخاصّية أصلًا على
 * مستندٍ لم يطلبها — انظر `TextElement.tracking`. */
export function trackingCss(tracking: number | undefined): string | undefined {
  return tracking ? `${tracking / 100}em` : undefined;
}
const VALIGN_JUSTIFY: Record<string, CSSProperties['justifyContent']> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

/** 'head' keeps its original testid for backward compatibility with the earlier
 * QA spec; every other element is addressable generically via `el-<id>`. */
function testIdFor(id: string): string {
  return id === 'head' ? 'stage-headline' : `el-${id}`;
}

export interface ElementViewProps {
  el: DocElement;
  pal: Palette;
  selected: boolean;
  editing: boolean;
  croppingActive?: boolean;
  /** Artboard pixel size — needed to resolve a clipping-mask shape's geometry
   * relative to this element, regardless of either element's own rotation. */
  size: { w: number; h: number };
  /** Artboard zoom scale — used only to cancel itself out of the selection outline,
   * whose thickness/offset are screen affordances, not document geometry (see `px`). */
  scale: number;
  /** The shape element acting as this element's clipping mask, if any (resolved by
   * the caller, which has the full element list; ElementView stays stateless). Any
   * element kind can be clipped — not image-only. */
  maskShape?: (DocElement & { type: 'shape' }) | null;
  /** The shape element this text element bends along, if any (resolved by the
   * caller, same convention as `maskShape`) — see `TextOnPathView`/roadmap #12. */
  pathShape?: (DocElement & { type: 'shape' }) | null;
  lang: Lang;
  entranceOpacity?: number;
  entranceTransform?: string;
  /** `filter: blur(Ncqw)` من `entranceStyleAt`، أو `undefined` متى كانت الضبابيّةُ
   * الفعليّةُ صفرًا — وغيابُه هو ما يَجعل كلَّ مستندٍ لا يَستعمل الضبابيّة يُنتج
   * كائنَ النمطِ نفسَه الذي كان يُنتجه. */
  entranceFilter?: string;
  /** Current timeline time (seconds) — needed to resolve the text-stagger layer's
   * per-unit reveal progress (see `renderStaggeredText` above); unused by any other
   * element kind. */
  time?: number;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>, id: string) => void;
  onDoubleClick: (e: ReactPointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>, id: string) => void;
  onTextBlur: (id: string, text: string) => void;
  onTextKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, id: string) => void;
  editRef?: (el: HTMLDivElement | null) => void;
}

export function ElementView({ el, pal, selected, editing, croppingActive, size, scale, maskShape, pathShape, lang, entranceOpacity, entranceTransform, entranceFilter, time, onPointerDown, onDoubleClick, onTextBlur, onTextKeyDown, editRef }: ElementViewProps) {
  if (!el.visible) return null;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  // Everything inside the artboard is scaled by the zoom transform, which is correct
  // for the document's own geometry but not for the selection outline: authored as a
  // flat 1.5px it rendered at ~0.3 screen px when zoomed out (invisible, so you could
  // not tell what you had grabbed) and bloated when zoomed in. Multiplying by `px`
  // holds it at a constant screen thickness — same reasoning as `Handles`.
  const px = 1 / scale;
  const selOutline = `${1.5 * px}px solid var(--accent)`;

  // Clipping mask applies identically to any element kind — computed once here (not
  // image-specific) and merged into baseStyle so every branch below inherits it.
  const frameBoxPx = geoToPx(el.geo, size);
  const clipPath = maskShape
    ? `polygon(${maskLocalPolygonPoints(frameBoxPx, geoToPx(maskShape.geo, size), maskShape.shape === 'ellipse' ? 'ellipse' : 'rect')
        .map((p) => `${(p.x / frameBoxPx.w) * 100}% ${(p.y / frameBoxPx.h) * 100}%`)
        .join(',')})`
    : undefined;

  const baseStyle: CSSProperties = {
    position: 'absolute',
    left: `${el.geo.x * 100}%`,
    top: `${el.geo.y * 100}%`,
    width: `${el.geo.w * 100}%`,
    height: `${el.geo.h * 100}%`,
    transform: `rotate(${el.geo.rotation}deg) ${entranceTransform ?? ''}`.trim(),
    opacity: ((el.opacity ?? 100) / 100) * (entranceOpacity ?? 1),
    // ضبابيّةُ العنصر نفسِه، مُركَّبةً: CSS `filter` يُطبَّق على ما رسمه العنصرُ
    // وأبناؤه **كلَّه معًا** ثم يَمطّه `transform` — وهو عينُ المعنى المطلوب
    // («العنصرُ يَلين»)، لا هالةَ ظلٍّ تَنزّ من تحت تعبئةٍ حادّة.
    filter: entranceFilter,
    // **ولِمَ يُرفَع خطُّ التحديد متى كان العنصرُ مُضبَّبًا.** `outline` جزءٌ من
    // رسمِ العنصر، فـ`filter` يُضبّبه هو أيضًا — فيصير خطُّ التحديد نفسُه ضبابيًّا
    // ويَكذب على المصمّم عن حدود ما حدّده. والمَقابضُ (`Handles`) عقدةٌ شقيقةٌ على
    // مستوى اللوح لا ابنةٌ لهذا العنصر، فلا يَمسّها الفلتر وتبقى هي دليلَ التحديد
    // حادًّا. وهذا نقصٌ مُعلَنٌ لا صامت: عنصرٌ مُضبَّبٌ يُعرَف تحديدُه من مقابضه.
    outline: selected && !entranceFilter ? selOutline : 'none',
    outlineOffset: 3 * px,
    cursor: el.locked ? 'default' : 'move',
    touchAction: 'none',
    clipPath,
  };

  if (el.type === 'text') {
    // Roadmap #17 — topmost fill/stroke layer only (matching the canvas text path,
    // which also paints a single `fillStyle`/`strokeStyle` per glyph run — a full
    // multi-layer fill stack has no meaningful per-glyph compositing in either DOM
    // text or canvas `fillText`). `textShadow` natively supports a comma-separated
    // list though, so every outer shadow layer (not just the topmost) renders —
    // inner shadow on text has no per-glyph silhouette to clip against in any of
    // the three render paths (documented limitation, see docs/CONTROLS.md).
    const resolved = resolveAppearance(el, pal);
    const topFill = resolved.fills[resolved.fills.length - 1];
    const topStroke = resolved.strokes[resolved.strokes.length - 1];
    const plainColor = topFill
      ? withAlpha(topFill.kind === 'gradient' && topFill.gradient ? topFill.gradient.from : topFill.color, topFill.opacity)
      : resolveTextColor(el, pal);
    const colorStyle: CSSProperties =
      topFill?.kind === 'gradient' && topFill.gradient
        ? {
            backgroundImage: `linear-gradient(${topFill.gradient.angle}deg, ${topFill.gradient.from}, ${topFill.gradient.to})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            WebkitTextFillColor: 'transparent',
          }
        : { color: plainColor };
    const strokeStyle: CSSProperties = topStroke ? { WebkitTextStroke: `${topStroke.width}px ${withAlpha(topStroke.color, topStroke.opacity)}` } : {};
    const textShadow = resolved.shadows
      .filter((sh) => sh.kind === 'outer')
      .map((sh) => `${sh.offsetX}px ${sh.offsetY}px ${sh.blur}px ${withAlpha(sh.color, sh.opacity)}`)
      .join(', ');
    const color = plainColor;
    const fontSizeCqw = (el.fontSize / 1080) * 100;
    if (editing) {
      return (
        <div
          data-testid={testIdFor(el.id)}
          data-el-id={el.id}
          ref={editRef}
          dir={dir}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onTextBlur(el.id, e.currentTarget.innerText ?? '')}
          onKeyDown={(e) => onTextKeyDown(e, el.id)}
          style={{
            ...baseStyle,
            fontSize: `${fontSizeCqw.toFixed(3)}cqw`,
            fontFamily: el.fontFamily,
            lineHeight: 1.15,
            letterSpacing: trackingCss(el.tracking),
            fontWeight: { regular: 400, medium: 600, bold: 800 }[el.weight],
            color,
            textAlign: HALIGN_CSS[el.halign],
            outline: selOutline,
            cursor: 'text',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: VALIGN_JUSTIFY[el.valign],
          }}
        >
          {el.text}
        </div>
      );
    }
    if (pathShape) {
      // Roadmap #12 — curve rendering replaces the normal flex text flow entirely
      // (per-glyph placement doesn't compose with the char/word/line stagger layer in
      // this pass — see `shapeTextOnCurve`'s doc comment); position/rotation/opacity/
      // mask-clip/selection outline still come from the same shared `baseStyle`.
      return (
        <div data-testid={testIdFor(el.id)} data-el-id={el.id} onPointerDown={(e) => onPointerDown(e, el.id)} onDoubleClick={(e) => onDoubleClick(e, el.id)} dir={dir} style={{ ...baseStyle, userSelect: 'none' }}>
          <TextOnPathView el={el} pathShape={pathShape} size={size} color={color} dir={dir} />
        </div>
      );
    }
    return (
      <div
        data-testid={testIdFor(el.id)}
        data-el-id={el.id}
        onPointerDown={(e) => onPointerDown(e, el.id)}
        onDoubleClick={(e) => onDoubleClick(e, el.id)}
        dir={dir}
        style={{
          ...baseStyle,
          fontSize: `${fontSizeCqw.toFixed(3)}cqw`,
          fontFamily: el.fontFamily,
          lineHeight: 1.15,
          letterSpacing: trackingCss(el.tracking),
          fontWeight: { regular: 400, medium: 600, bold: 800 }[el.weight],
          ...colorStyle,
          ...strokeStyle,
          textShadow: textShadow || undefined,
          textAlign: HALIGN_CSS[el.halign],
          display: 'flex',
          flexDirection: 'column',
          justifyContent: VALIGN_JUSTIFY[el.valign],
          textWrap: 'balance',
          userSelect: 'none',
        }}
      >
        {el.textAnim?.enabled ? renderStaggeredText(el, time ?? 0) : el.justify && dir === 'rtl' ? <JustifiedTextView el={el} size={size} /> : el.text}
      </div>
    );
  }

  if (el.type === 'image') {
    // Radius is a fraction of min(w,h) in actual pixels (same convention as shapes);
    // expressed in cqw (relative to the artboard's own inline-size) like every other
    // size-dependent value in this component, so it scales with the artboard correctly.
    const radiusCqw = el.radius ? ((el.radius * Math.min(frameBoxPx.w, frameBoxPx.h)) / size.w) * 100 : 0;
    // Roadmap #17 — stroke/shadow layers resolve the same way a shape's do (see
    // below): a legacy single-center-opaque stroke with no shadow stays a literal
    // `border` (byte-identical to before this roadmap item, which
    // `image-editing.spec.mjs` reads via `el.style.border`); anything beyond that
    // (a 2nd stroke layer, 'inside'/'outside' position, or any shadow layer) paints
    // through the combined `box-shadow` list instead.
    const resolved = resolveAppearance(el, pal);
    const legacyBorder = resolved.shadows.length === 0 ? legacyBorderCss(resolved.strokes) : undefined;
    const strokeShadowStyle: CSSProperties =
      legacyBorder !== undefined ? { border: legacyBorder } : { border: 'none', boxShadow: appearanceBoxShadowCss(resolved.strokes, resolved.shadows) };
    let imgStyle: CSSProperties | undefined;
    if (el.src) {
      const layout = computeImageCropLayout(frameBoxPx, { w: el.naturalW, h: el.naturalH }, el.fit, el.cropX, el.cropY, el.cropScale);
      imgStyle = {
        position: 'absolute',
        left: `${(layout.tx / frameBoxPx.w) * 100}%`,
        top: `${(layout.ty / frameBoxPx.h) * 100}%`,
        width: `${(layout.dw / frameBoxPx.w) * 100}%`,
        height: `${(layout.dh / frameBoxPx.h) * 100}%`,
        transform: `scaleX(${el.flipH ? -1 : 1}) scaleY(${el.flipV ? -1 : 1})`,
        transformOrigin: 'center',
        pointerEvents: 'none',
      };
    }
    return (
      <div
        data-testid={testIdFor(el.id)}
        data-el-id={el.id}
        data-crop-editing={croppingActive ? 'true' : undefined}
        onPointerDown={(e) => onPointerDown(e, el.id)}
        onDoubleClick={(e) => onDoubleClick(e, el.id)}
        style={{
          ...baseStyle,
          borderRadius: `${radiusCqw.toFixed(3)}cqw`,
          overflow: 'hidden',
          // ولا `position: 'relative'` هنا — كانت تُكتب بعد `...baseStyle` فتدهس
          // `position: 'absolute'` فيه، **وهي وحدها بين كل أنواع العناصر**.
          //
          // والأثر لا يظهر على صورةٍ واحدة: عنصرٌ نسبيٌّ يُزاح عن موضعه الساكن،
          // والموضع الساكن لأوّل ابنٍ في اللوحة هو زاويتها، فـ`top: 56.4%` تعني
          // ما تعنيه في الحالتين. أمّا الصورة الثانية فموضعها الساكن أسفلَ
          // الأولى بارتفاعها كاملًا، فتُرسَم على بُعد ارتفاعٍ كامل تحت موضعها،
          // والثالثة على بُعد ارتفاعين — تراكمًا لا حدَّ له.
          //
          // والتصدير يرسم من النموذج لا من DOM، فكان الملفّ المُصدَّر صحيحًا
          // واللوحةُ التي يراها المصمّم كاذبة: يستورد شارتين فيراهما تهبطان خارج
          // الصفحة، ويحرّكهما ليصلح ما ليس مكسورًا. قيس هذا على الهدف الثالث —
          // ثلاث صورٍ مستوردة — وهو أوّل مستندٍ في الحلقة يحمل أكثر من صورة.
          // انظر `qa/image-placement.spec.mjs`.
          display: el.src ? 'block' : 'grid',
          placeItems: 'center',
          background: el.src ? undefined : 'rgba(127,127,127,.12)',
          ...(el.src ? strokeShadowStyle : { border: '0.4cqw dashed currentColor' }),
          outline: selected ? baseStyle.outline : croppingActive ? `${1.5 * px}px dashed var(--accent)` : 'none',
          cursor: croppingActive ? 'grab' : baseStyle.cursor,
          fontSize: '3cqw',
        }}
      >
        {el.src ? (
          <img src={el.src} alt="" draggable={false} style={imgStyle} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1cqw', opacity: 0.75, pointerEvents: 'none' }}>
            <svg width="7cqw" height="7cqw" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4h14v12H3zM3 13l4-4 4 4 3-3 3 3" />
            </svg>
          </div>
        )}
      </div>
    );
  }

  if (el.type === 'lottie') {
    return (
      <div
        data-testid={testIdFor(el.id)}
        data-el-id={el.id}
        onPointerDown={(e) => onPointerDown(e, el.id)}
        onDoubleClick={(e) => onDoubleClick(e, el.id)}
        style={{ ...baseStyle, overflow: 'hidden' }}
      >
        <LottiePreview data={el.data} loop={el.loop} time={time ?? 0} />
      </div>
    );
  }

  if (el.type === 'video') {
    return (
      <div
        data-testid={testIdFor(el.id)}
        data-el-id={el.id}
        onPointerDown={(e) => onPointerDown(e, el.id)}
        onDoubleClick={(e) => onDoubleClick(e, el.id)}
        style={{ ...baseStyle, overflow: 'hidden', background: el.src ? undefined : 'rgba(127,127,127,.12)' }}
      >
        {el.src ? (
          <VideoPreview src={el.src} poster={el.poster} trimIn={el.trimIn} trimOut={el.trimOut} loop={el.loop} time={time ?? 0} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
            <svg width="7cqw" height="7cqw" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h10v10H3zM13 9l4-2v6l-4-2z" />
            </svg>
          </div>
        )}
      </div>
    );
  }

  // shape
  // Roadmap #17 — rect/ellipse get the full multi-layer treatment: every fill layer
  // via `fillsToCss` (byte-identical plain `backgroundColor` for the legacy single-
  // solid-opaque-normal case `palette-apply.spec.mjs` reads directly), every stroke/
  // shadow layer combined into one `box-shadow` list, falling back to a literal
  // `border` for the legacy single-center-opaque-stroke-no-shadow case (same
  // byte-identical contract the image branch above uses). A hand-drawn path/outline
  // shape only resolves its *topmost* fill/stroke layer (documented limitation, see
  // docs/CONTROLS.md) — no cheap way to stack several `background-image` layers or a
  // `box-shadow` ring onto an arbitrary SVG `<path>` silhouette, and no shadow at all
  // (approximated instead by the canvas/SVG-export paths only).
  const resolved = resolveAppearance(el, pal);
  const labelColor = el.label ? resolveShapeLabelColor(el, pal) : undefined;
  const fillCss = fillsToCss(resolved.fills);
  const legacyBorder = resolved.shadows.length === 0 ? legacyBorderCss(resolved.strokes) : undefined;
  const strokeShadowStyle: CSSProperties =
    legacyBorder !== undefined ? { border: legacyBorder } : { border: 'none', boxShadow: appearanceBoxShadowCss(resolved.strokes, resolved.shadows) };
  const shapeInner: CSSProperties =
    el.shape === 'path'
      ? {}
      : {
          width: '100%',
          height: '100%',
          ...fillCss,
          borderRadius: el.shape === 'ellipse' ? '50%' : `${el.radius * 100}%`,
          ...strokeShadowStyle,
          display: 'grid',
          placeItems: 'center',
          position: 'relative',
        };

  return (
    <div data-testid={testIdFor(el.id)} data-el-id={el.id} onPointerDown={(e) => onPointerDown(e, el.id)} onDoubleClick={(e) => onDoubleClick(e, el.id)} style={baseStyle}>
      {el.shape === 'path' ? (
        (() => {
          const { cmds, multiRegion, closedForFill } = pathElementCommands(el);
          const isOutline = !!el.outline?.length;
          const topFill = resolved.fills[resolved.fills.length - 1];
          // الحدود متغيّرةُ السُّمك تُفرَز قبل اختيار «أعلى طبقة»: فهي لا تُرسَم
          // حدًّا بل تُعبَّأ مضلَّعًا، فلو بقيت في الكومة لصارت `topStroke` طبقةً
          // تُرسَم مرّتين — مرّةً مضلَّعًا ومرّةً حدًّا منتظمًا فوقه.
          const { uniform: uniformStrokes, variable: variableStrokes } = splitStrokesByWidthKind(resolved.strokes, true);
          const topStroke = uniformStrokes[uniformStrokes.length - 1];
          const fillColor = topFill ? (topFill.kind === 'gradient' && topFill.gradient ? topFill.gradient.from : topFill.color) : 'transparent';
          return (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              <path
                d={commandsToSvgPath(cmds, 100, 100)}
                fillRule={multiRegion ? 'evenodd' : 'nonzero'}
                fill={closedForFill && topFill ? fillColor : 'none'}
                fillOpacity={topFill?.opacity}
                // لا حدَّ متى خلت كومة المظهر من طبقة حدٍّ مرئيّة. كان الاحتياط
                // هنا `var(--accent)` بسُمك 2 — وهو ما يجعل شكل مسار معبَّأً بلا
                // حدٍّ (مثلّثًا أو نجمة من المكتبة) يظهر بحدٍّ لم يطلبه أحد، ويُخالف
                // رسّام الـcanvas الذي لا يرسم شيئًا على كومة فارغة
                // (`paintStrokesCanvas` على مصفوفة خالية = لا شيء). وكل مسار
                // قديم يمرّ بـ`migrateAppearance` التي تمنحه طبقة حدٍّ إلزاميّة،
                // فـ`topStroke` موجودة له دائمًا ولا يتغيّر شيء في أي مستند قائم.
                stroke={isOutline || !topStroke ? 'none' : topStroke.color}
                strokeOpacity={isOutline || !topStroke ? undefined : topStroke.opacity}
                strokeWidth={isOutline || !topStroke ? 0 : topStroke.width}
                vectorEffect="non-scaling-stroke"
              />
              {/* الحدّ متغيّر السُّمك: مضلَّعٌ معبَّأ بلون الحدّ، لا حدٌّ. ولا
                  `vectorEffect` هنا عن قصد — هذا الشكلُ **هندسةٌ** مبنيّةٌ سلفًا
                  في فضاء بكسل الصندوق، و`preserveAspectRatio="none"` يردّ الكسور
                  إلى بكسل الصندوق نفسه، فيعود السُّمك إلى ما حُسِب بالضبط. ولو
                  وُضع `non-scaling-stroke` لم يعنِ شيئًا: لا حدَّ يُقاس أصلًا. */}
              {variableStrokes.map((s) => (
                <path
                  key={s.id}
                  data-variable-stroke={s.id}
                  d={commandsToSvgPath(variableStrokeOutlineCmds(cmds, s.widthProfile!, s.width, frameBoxPx.w, frameBoxPx.h), 100, 100)}
                  fill={s.color}
                  fillOpacity={s.opacity}
                  fillRule="nonzero"
                  stroke="none"
                />
              ))}
            </svg>
          );
        })()
      ) : (
        <div style={shapeInner}>
          {el.label && el.labelPosition === 'center' && (
            <span style={{ color: labelColor, fontWeight: 800, fontSize: '5.4cqw', pointerEvents: 'none' }}>{el.label}</span>
          )}
        </div>
      )}
      {el.label && el.labelPosition === 'inline-end' && (
        <span
          dir={dir}
          style={{
            position: 'absolute',
            insetInlineEnd: '100%',
            top: '50%',
            transform: 'translateY(-50%)',
            marginInlineEnd: '1.2cqw',
            whiteSpace: 'nowrap',
            fontWeight: 700,
            fontSize: '3cqw',
            color: labelColor,
            pointerEvents: 'none',
          }}
        >
          {el.label}
        </span>
      )}
    </div>
  );
}
