import type { Palette, SizePreset } from '../data/constants';
import type { DocElement, ShapeElement, TextElement } from '../state/elements';
import { resolveShapeLabelColor, resolveTextColor } from '../state/elements';
import type { Lang } from '../i18n/strings';
import type { Weight } from '../state/types';
import { computeImageCropLayout } from './imageCrop';
import { maskLocalPolygonPoints, type PxBox } from './geometry';
import { commandsToSvgPath, drawPathCommandsToCtx, pathElementCommands } from './pathGeometry';
import { splitStrokesByWidthKind, variableStrokeOutlineCmds } from './variableStroke';
import { documentDuration, effectiveScale, entranceVisualAt } from './animTimeline';
import { SHOWN_UNIT_VISUAL, buildStaggerTokens, resolveUnitVisual, type StaggerToken, type UnitVisual } from './textStagger';
import { getLottieExportFrame, resetLottieExportEngine } from './lottieExportEngine';
import { getVideoExportFrame, resetVideoExportEngine } from './videoExportEngine';
import { shapeTextOnCurve } from './textOnPath';
import { justifyWithKashida } from './kashidaJustify';
import {
  ellipseTracer,
  paintFillsCanvas,
  paintInnerShadowsCanvas,
  paintOuterShadowsCanvas,
  paintStrokesCanvas,
  pathCmdsTracer,
  rectTracer,
  resolveAppearance,
  resolveFillStyleCanvas,
  type ResolvedShadowPaint,
} from './appearance';

export interface ArtboardRenderSpec {
  size: SizePreset;
  palette: Palette;
  elements: DocElement[];
  transparent: boolean;
  scale: number;
  /** Current UI language — text halign is logical (start/end/center), and must resolve
   * against this exactly like the live artboard (ElementView sets dir from the same
   * value), or the exported file disagrees with what was on screen. */
  lang: Lang;
  /** زخرفة اللوحة الآتية من المستند (`DocSnapshot.decorAccent`). تُمرَّر صراحةً ولا
   * تُستنتَج هنا من `elements.length`: القاعدة القديمة «ارسمها متى كان المستند غير
   * فارغ» كانت تعني أن أي مصمّم يضع أوّل عنصرٍ له يجد في زاويته قرصًا لم يطلبه ولا
   * يستطيع حذفه. والمعاينة في `Stage.tsx` تقرأ الحقل نفسه بالشرط نفسه. */
  decorAccent: boolean;
  /** Timeline time (seconds) at which every element's entrance clip is resolved.
   * Defaults to `settledTimeOf(spec)` — the instant every clip in **this document**
   * has finished, which is the same "freeze on the final state" behaviour static
   * PNG/SVG export always had, now derived from the document instead of assumed to
   * be 5 seconds. Video/GIF frame rendering passes the real per-frame time instead. */
  time?: number;
  /** Roadmap #12 — precomputed `shapeTextOnCurve` result per curved text element id,
   * keyed by `TextElement.id`. `renderArtboardSvg` stays synchronous (its real glyph
   * shaping is async/WASM) — this is how its caller hands it that already-resolved
   * geometry instead. `renderArtboardPng`/video frames don't need this: `drawElements`
   * is already async and calls `shapeTextOnCurve` directly per frame. A curved text
   * element with no entry here falls back to its plain flat `<text>` rendering. */
  curvedTextCmds?: Partial<Record<string, import('./pathGeometry').PathCmd[]>>;
  /** Roadmap #18 — `renderArtboardSvg`'s own precomputed-async-work slot, same pattern
   * as `curvedTextCmds` above: `justifySvgTextElement` needs the real HarfBuzz-shaped
   * advance width (async/WASM), so the caller resolves it first per justified text
   * element and hands in the already-kashida-inserted string here. A text element
   * with no entry here (justify off, non-built-in font, or LTR) falls back to its
   * plain `el.text`. */
  justifiedTexts?: Partial<Record<string, string>>;
}

const WEIGHT_CSS: Record<Weight, number> = { regular: 400, medium: 600, bold: 800 };

/** Exported so the live DOM preview (`ElementView.tsx`'s `JustifiedTextView`) can wrap
 * exactly the same way this canvas path does — one wrap decision, not two diverging
 * ones, whenever `justify` needs it to pick lines to stretch. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Roadmap #18 — stretches lines toward `maxWidth` with real kashida (tatweel)
 * insertions (`justifyWithKashida`), measuring through this same `ctx` so the result
 * matches exactly what `ctx.fillText` then draws.
 *
 * في كتلةٍ متعدّدة السطور لا يُبرَّر السطر الأخير — القاعدة الطباعيّة المعروفة،
 * لأن قِصَره عَرَضٌ لا قصد. أمّا **الكتلة ذات السطر الواحد** فسطرُها ليس «آخِرَ
 * فقرةٍ» بل هو الفقرة كلّها، ومصمّمٌ ضبط عرض صندوقه ثم طلب الكشيدة لا يمكن أن
 * يعني إلا «مُدَّ هذا السطر إلى صندوقه».
 *
 * وكان هذا الفرع يُسقِط الحالة الأشيع صمتًا: عنوانٌ من سطرٍ واحد — وهو بالضبط ما
 * يفعله الهدف المنشور الحقيقيّ في `qa/replication/targets/t02-kashida` —
 * فيُفعّل المصمّم «تبرير بالكشيدة» فلا يحدث شيء ولا يُقال له لماذا. وكان يخالف
 * تصدير SVG أيضًا: `justifySvgTextElement` يمدّ النصّ كلّه بلا استثناءٍ للسطر
 * الأخير، فالمستند الواحد يخرج بصورتين مختلفتين حسب صيغة التصدير. فهذا التصحيح
 * يُغلق الفجوتين معًا، ويترك الفقرة متعدّدة السطور على القاعدة كما كانت. */
export async function justifyCanvasLines(ctx: CanvasRenderingContext2D, lines: string[], maxWidth: number): Promise<string[]> {
  const out = lines.slice();
  const stretchUpTo = out.length === 1 ? 1 : out.length - 1;
  for (let i = 0; i < stretchUpTo; i++) {
    const { text } = await justifyWithKashida(out[i], maxWidth, (s) => ctx.measureText(s).width);
    out[i] = text;
  }
  return out;
}

interface PositionedToken {
  tok: StaggerToken;
}

/** Groups a token sequence into atomic "word" runs (one or more tokens that must
 * never be split across a line break — for 'word' granularity each run is already a
 * single token, for 'char' granularity a run is every grapheme between two
 * whitespace tokens) and plain whitespace runs — the unit the greedy wrapper below
 * actually packs, so char-granularity stagger still only breaks lines at whitespace
 * like normal text, never mid-word. */
function groupStaggerTokensIntoWords(tokens: StaggerToken[]): { isSpace: boolean; items: PositionedToken[] }[] {
  const groups: { isSpace: boolean; items: PositionedToken[] }[] = [];
  let current: { isSpace: boolean; items: PositionedToken[] } | null = null;
  for (const tok of tokens) {
    const isSpace = tok.text.trim() === '';
    if (!current || current.isSpace !== isSpace) {
      current = { isSpace, items: [] };
      groups.push(current);
    }
    current.items.push({ tok });
  }
  return groups;
}

/** Same greedy word-wrap behavior as `wrapLines` above, but operating on the
 * already-tokenized/ranked sequence so each resulting visual line still carries each
 * token's own stagger rank — the canvas equivalent of the DOM preview's natural CSS
 * wrap around individually-styled spans. */
function wrapStaggerTokensIntoLines(ctx: CanvasRenderingContext2D, tokens: StaggerToken[], maxWidth: number): PositionedToken[][] {
  const groups = groupStaggerTokensIntoWords(tokens);
  const lines: PositionedToken[][] = [];
  let current: PositionedToken[] = [];
  let currentWidth = 0;
  const widthOf = (items: PositionedToken[]) => items.reduce((s, it) => s + ctx.measureText(it.tok.text).width, 0);
  const trimTrailingSpace = () => {
    while (current.length && current[current.length - 1].tok.text.trim() === '') {
      currentWidth -= ctx.measureText(current[current.length - 1].tok.text).width;
      current.pop();
    }
  };
  for (const g of groups) {
    const gWidth = widthOf(g.items);
    if (g.isSpace) {
      if (current.length === 0) continue; // never start a line with whitespace
      current.push(...g.items);
      currentWidth += gWidth;
      continue;
    }
    if (currentWidth + gWidth > maxWidth && current.length > 0) {
      trimTrailingSpace();
      lines.push(current);
      current = [];
      currentWidth = 0;
    }
    current.push(...g.items);
    currentWidth += gWidth;
  }
  if (current.length) {
    trimTrailingSpace();
    lines.push(current);
  }
  return lines;
}

/** Draws one unit's own text at `(anchorX, baselineY)`, anchored by `textAlign`
 * ('left'/'right' — never 'center' for an individual unit, only the whole line uses
 * that), composing the unit's reveal `visual` (opacity/translateY/scale/rotateDeg —
 * see `unitVisualAt` in `textStagger.ts`) with the element-level alpha already set
 * on `ctx` by the caller (`elementAlpha`). The transform pivots at the unit's own
 * anchor edge/baseline rather than its visual center — a minor, documented
 * (`docs/CONTROLS.md`) divergence from the DOM preview's `transformOrigin: center
 * bottom` for the scale/rotate effects specifically; fade/slide are unaffected. */
function drawStaggerToken(ctx: CanvasRenderingContext2D, text: string, anchorX: number, baselineY: number, textAlign: 'left' | 'right', visual: UnitVisual, fontPx: number, elementAlpha: number) {
  ctx.save();
  ctx.globalAlpha = elementAlpha * visual.opacity;
  ctx.textAlign = textAlign;
  ctx.translate(anchorX, baselineY);
  if (visual.translateY !== 0) ctx.translate(0, visual.translateY * fontPx);
  if (visual.rotateDeg !== 0) ctx.rotate((visual.rotateDeg * Math.PI) / 180);
  if (visual.scale !== 1) ctx.scale(visual.scale, visual.scale);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Lays out and draws one visual line's tokens left-to-right-on-screen regardless of
 * script direction: for `dir==='rtl'` the first *logical* token (array order — the
 * order it was typed/stored in, same convention `buildStaggerTokens` uses) anchors
 * at the line's rightmost edge and each subsequent token steps leftward (mirroring
 * how a single RTL `fillText` call advances internally); for `dir==='ltr'` the first
 * token anchors at the leftmost edge and steps rightward. `effectiveAlign`/`anchorX`
 * are the exact `ctx.textAlign`/x the non-stagger path above would have used for
 * this same halign+dir combination — reused here only to derive the line's left/right
 * edge once `totalWidth` (the sum of this line's own token widths) is known. */
function drawStaggerLine(
  ctx: CanvasRenderingContext2D,
  lineTokens: PositionedToken[],
  dir: 'rtl' | 'ltr',
  effectiveAlign: 'left' | 'right' | 'center',
  anchorX: number,
  baselineY: number,
  resolve: (tok: StaggerToken) => UnitVisual,
  fontPx: number,
  elementAlpha: number,
) {
  const widths = lineTokens.map((p) => ctx.measureText(p.tok.text).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  const rightEdge = effectiveAlign === 'right' ? anchorX : effectiveAlign === 'left' ? anchorX + totalWidth : anchorX + totalWidth / 2;
  const leftEdge = effectiveAlign === 'left' ? anchorX : effectiveAlign === 'right' ? anchorX - totalWidth : anchorX - totalWidth / 2;
  let cursor = dir === 'rtl' ? rightEdge : leftEdge;
  lineTokens.forEach((p, i) => {
    const visual = resolve(p.tok);
    if (dir === 'rtl') {
      drawStaggerToken(ctx, p.tok.text, cursor, baselineY, 'right', visual, fontPx, elementAlpha);
      cursor -= widths[i];
    } else {
      drawStaggerToken(ctx, p.tok.text, cursor, baselineY, 'left', visual, fontPx, elementAlpha);
      cursor += widths[i];
    }
  });
}

/** The stagger-enabled counterpart to the plain `lines.forEach(...fillText...)` the
 * non-stagger path uses — same font/baseline/alignment setup, but draws every
 * char/word/line unit individually with its own eased opacity/transform at `time`,
 * so a video frame shows exactly the same per-unit reveal state the live timeline
 * scrubber would at that instant (same "one shared formula" convention as
 * `entranceVisualAt`/`resolveAnimAt` for the element-level `anim.tracks`). */
function drawStaggeredText(ctx: CanvasRenderingContext2D, el: TextElement, bw: number, bh: number, dir: 'rtl' | 'ltr', fontPx: number, time: number, elementAlpha: number) {
  const cfg = el.textAnim;
  const clipStart = el.anim.start;
  const lineHeight = fontPx * 1.15;
  const startIsRight = dir === 'rtl';
  const anchorX = el.halign === 'start' ? (startIsRight ? bw : 0) : el.halign === 'end' ? (startIsRight ? 0 : bw) : bw / 2;
  const effectiveAlign: 'left' | 'right' | 'center' =
    el.halign === 'start' ? (startIsRight ? 'right' : 'left') : el.halign === 'end' ? (startIsRight ? 'left' : 'right') : 'center';

  if (cfg.unit === 'line') {
    const tokens = buildStaggerTokens(el.text, cfg, el.id); // one token per authored paragraph
    const visualLines: { items: PositionedToken[]; paragraphIndex: number }[] = [];
    tokens.forEach((tok, pi) => {
      // An authored blank line (tok.text === '') wraps to zero lines via `wrapLines` —
      // fall back to one empty line so a blank authored line still occupies a row,
      // same as the DOM preview's `renderStaggeredText` (which falls back to a space).
      const subLines = wrapLines(ctx, tok.text, bw);
      for (const sub of subLines.length ? subLines : ['']) visualLines.push({ items: [{ tok: { text: sub, rank: tok.rank } }], paragraphIndex: pi });
    });
    const totalHeight = visualLines.length * lineHeight || lineHeight;
    let startY: number;
    if (el.valign === 'top') startY = fontPx * 0.9;
    else if (el.valign === 'middle') startY = (bh - totalHeight) / 2 + fontPx * 0.9;
    else startY = bh - totalHeight + fontPx * 0.9;
    visualLines.forEach((vl, i) => {
      const baselineY = startY + i * lineHeight;
      drawStaggerLine(ctx, vl.items, dir, effectiveAlign, anchorX, baselineY, (tok) => (tok.rank === null ? SHOWN_UNIT_VISUAL : resolveUnitVisual(cfg, tok.rank, clipStart, time)), fontPx, elementAlpha);
    });
    return;
  }

  // char/word: tokenize+rank the whole element once (identical to the DOM preview's
  // `buildStaggerTokens(el.text, ...)` call), then wrap that single ranked sequence
  // into visual lines — so every token keeps the exact rank the DOM preview assigned
  // it, regardless of where the canvas happens to break the line.
  const tokens = buildStaggerTokens(el.text, cfg, el.id);
  const lines = wrapStaggerTokensIntoLines(ctx, tokens, bw);
  const totalHeight = lines.length * lineHeight || lineHeight;
  let startY: number;
  if (el.valign === 'top') startY = fontPx * 0.9;
  else if (el.valign === 'middle') startY = (bh - totalHeight) / 2 + fontPx * 0.9;
  else startY = bh - totalHeight + fontPx * 0.9;
  lines.forEach((lineTokens, i) => {
    const baselineY = startY + i * lineHeight;
    drawStaggerLine(ctx, lineTokens, dir, effectiveAlign, anchorX, baselineY, (tok) => (tok.rank === null ? SHOWN_UNIT_VISUAL : resolveUnitVisual(cfg, tok.rank, clipStart, time)), fontPx, elementAlpha);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('فشل تحميل صورة للتصدير'));
    img.src = src;
  });
}

/** «كلُّ المقاطع قد انتهت» لهذا المستند بعينه. كان الجوابُ خمسَ ثوانٍ لكلّ مستند،
 * فكان صحيحًا لمستندٍ طوله خمسُ ثوانٍ وخطأً صامتًا لغيره: مستندٌ مقطعُه يبدأ عند
 * السادسة كان يُصدَّر PNG قبل أن يبدأ. ومعدّلُ الإطارات هنا لا يؤثّر إلّا في
 * الأرضيّة (إطارٌ واحد) فيكفي الافتراض. */
function settledTimeOf(spec: Omit<ArtboardRenderSpec, 'scale'>): number {
  return documentDuration(spec.elements.map((el) => el.anim), 30);
}

async function drawElements(ctx: CanvasRenderingContext2D, spec: Omit<ArtboardRenderSpec, 'scale'>, w: number, h: number) {
  const time = spec.time ?? settledTimeOf(spec);
  for (const el of spec.elements) {
    if (!el.visible) continue;
    const x = el.geo.x * w;
    const y = el.geo.y * h;
    const bw = el.geo.w * w;
    const bh = el.geo.h * h;
    const cx = x + bw / 2;
    const cy = y + bh / 2;
    // Same keyframe/easing resolution the live Stage preview uses (entranceVisualAt
    // in animTimeline.ts) — a video frame rendered for time t must show exactly what
    // the timeline scrubber shows at t, not a re-derived approximation.
    const visual = entranceVisualAt(el.anim, time);
    ctx.save();
    ctx.globalAlpha = ((el.opacity ?? 100) / 100) * visual.opacity;
    ctx.translate(cx, cy);
    ctx.rotate((el.geo.rotation * Math.PI) / 180);
    // Matches ElementView's CSS `rotate(baseDeg) translate(Xcqw,Ycqw) scale(SX,SY) rotate(deg)`
    // composition order: each per-property offset applies in the already-transformed
    // local frame, pivoting around the box center, same as the DOM's default
    // transform-origin. Both x and y use `w` (not h) for the same reason the old
    // translateYFrac did — mirroring the cqw unit, which is always width-based.
    if (visual.x !== 0 || visual.y !== 0) ctx.translate(visual.x * w, visual.y * w);
    // **مقياسٌ لكلّ محور، من `effectiveScale` الواحدة** — ولا تُشتَقّ الصيغةُ هنا
    // من جديد، فالمعاينةُ والتصديرُ يجب أن يَقولا الجملةَ نفسَها عند اللحظة
    // نفسِها. والصندوقُ `bw`/`bh` **لا يتغيّر**: المقياسُ مصفوفةٌ تَحمل محتوًى
    // مُرتَّبًا سلفًا، فلا يُعاد لفُّ نصٍّ ولا تُعاد هندسةُ حدٍّ ولا قناع — وهو
    // عينُ الفرق الذي رجَّح المعاملَ على العرض المطلق (`state/elements.ts:38`).
    //
    // ومتى تساوى المحوران ومحايدُهما `1` صارت هذه المكالمةَ القديمةَ نفسَها
    // بوسيطَيها نفسِهما: `ctx.scale(visual.scale, visual.scale)`.
    const { sx, sy } = effectiveScale(visual);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    if (visual.rotation !== 0) ctx.rotate((visual.rotation * Math.PI) / 180);
    ctx.translate(-bw / 2, -bh / 2);

    // Generic clipping mask: any element kind clips to its mask shape's outline mapped
    // into this element's local frame — same math as the live DOM view and SVG export
    // (maskLocalPolygonPoints), not image-only.
    if (el.maskId) {
      const maskEl = spec.elements.find((m) => m.id === el.maskId && m.type === 'shape') as ShapeElement | undefined;
      if (maskEl) {
        const elBox: PxBox = { x, y, w: bw, h: bh, rotation: el.geo.rotation };
        const maskBox: PxBox = { x: maskEl.geo.x * w, y: maskEl.geo.y * h, w: maskEl.geo.w * w, h: maskEl.geo.h * h, rotation: maskEl.geo.rotation };
        const pts = maskLocalPolygonPoints(elBox, maskBox, maskEl.shape === 'ellipse' ? 'ellipse' : 'rect');
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.clip();
      }
    }

    if (el.type === 'image') {
      if (el.src) {
        // Defensive against documents saved before radius/stroke/flip existed on image
        // elements: an undefined radius/strokeWidth here would make ctx.roundRect() throw
        // on a NaN argument, which — thrown between ctx.save() and ctx.restore() — would
        // leave the canvas's save stack unbalanced for every element drawn afterward.
        const safeRadius = Number.isFinite(el.radius) ? el.radius : 0;
        const radiusPx = Math.min(bw, bh) * safeRadius;
        const tracer = rectTracer(bw, bh, radiusPx);
        const resolved = resolveAppearance(el, spec.palette);
        try {
          const img = await loadImage(el.src);
          paintOuterShadowsCanvas(ctx, resolved.shadows, tracer);
          ctx.save();
          // Clip to the frame, rounded by `radius` — the generic maskId clip above
          // (shared by every element kind) already intersected the outer clip region.
          ctx.beginPath();
          tracer(ctx, 0);
          ctx.clip();
          const natural = { w: img.naturalWidth, h: img.naturalHeight };
          const layout = computeImageCropLayout({ w: bw, h: bh }, natural, el.fit, el.cropX, el.cropY, el.cropScale);
          if (el.flipH || el.flipV) {
            ctx.translate(bw / 2, bh / 2);
            ctx.scale(el.flipH ? -1 : 1, el.flipV ? -1 : 1);
            ctx.translate(-bw / 2, -bh / 2);
          }
          ctx.drawImage(img, layout.tx, layout.ty, layout.dw, layout.dh);
          ctx.restore();
          // Roadmap #17 — a visible color-overlay fill layer tints the decoded image
          // itself (blend/opacity apply on top of real pixels), unlike a shape's fill
          // which *is* the content; an image with no fill layers (every pre-existing
          // image element) paints none here, same as before this roadmap item.
          paintFillsCanvas(ctx, resolved.fills, tracer, bw, bh);
          paintStrokesCanvas(ctx, resolved.strokes, tracer);
          paintInnerShadowsCanvas(ctx, resolved.shadows, tracer, bw, bh);
        } catch {
          // fall through to placeholder box below if the image fails to decode
        }
      } else {
        ctx.save();
        ctx.strokeStyle = spec.palette.fg;
        ctx.globalAlpha *= 0.5;
        ctx.setLineDash([w * 0.012, w * 0.012]);
        ctx.lineWidth = Math.max(1, w * 0.004);
        ctx.beginPath();
        ctx.roundRect(0, 0, bw, bh, w * 0.02);
        ctx.stroke();
        ctx.restore();
      }
    } else if (el.type === 'lottie') {
      // Real pixel compositing, not a placeholder box: the exact same frame math
      // (`getLottieExportFrame` → `lottieFrameAt`) the live Stage preview uses, so a
      // video frame's Lottie content matches what the scrubber showed at `time`.
      try {
        const resolved = resolveAppearance(el, spec.palette);
        const tracer = rectTracer(bw, bh, 0);
        paintOuterShadowsCanvas(ctx, resolved.shadows, tracer);
        const canvas = getLottieExportFrame(el.id, el.data, bw, bh, time, el.loop);
        ctx.drawImage(canvas, 0, 0, bw, bh);
        paintFillsCanvas(ctx, resolved.fills, tracer, bw, bh);
        paintStrokesCanvas(ctx, resolved.strokes, tracer);
        paintInnerShadowsCanvas(ctx, resolved.shadows, tracer, bw, bh);
      } catch {
        // Corrupt/unloadable Lottie data (shouldn't happen — validated at import) —
        // fall through rather than throwing mid-export and losing every other element.
      }
    } else if (el.type === 'video') {
      // Real pixel compositing: a genuine decoded frame from the source file at the
      // exact source instant `videoSourceTimeAt` maps `time` to (respecting trim/loop),
      // drawn straight from a hidden <video> element — never a placeholder box. This
      // is the hard, essential part of roadmap #14: an exported MP4/GIF frame and the
      // live scrubber must show the same real content at the same instant.
      if (el.src) {
        try {
          const resolved = resolveAppearance(el, spec.palette);
          const tracer = rectTracer(bw, bh, 0);
          paintOuterShadowsCanvas(ctx, resolved.shadows, tracer);
          const video = await getVideoExportFrame(el.id, el.src, time, el.trimIn, el.trimOut, el.loop);
          const layout = computeImageCropLayout({ w: bw, h: bh }, { w: video.videoWidth, h: video.videoHeight }, 'cover', 0.5, 0.5, 1);
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, bw, bh);
          ctx.clip();
          ctx.drawImage(video, layout.tx, layout.ty, layout.dw, layout.dh);
          ctx.restore();
          paintFillsCanvas(ctx, resolved.fills, tracer, bw, bh);
          paintStrokesCanvas(ctx, resolved.strokes, tracer);
          paintInnerShadowsCanvas(ctx, resolved.shadows, tracer, bw, bh);
        } catch {
          // A source the browser's decoder can't play (shouldn't happen — import
          // already validated it via FFmpeg/the browser's own decoder) — fall through
          // rather than throwing mid-export and losing every other element.
        }
      } else {
        ctx.save();
        ctx.strokeStyle = spec.palette.fg;
        ctx.globalAlpha *= 0.5;
        ctx.setLineDash([w * 0.012, w * 0.012]);
        ctx.lineWidth = Math.max(1, w * 0.004);
        ctx.beginPath();
        ctx.roundRect(0, 0, bw, bh, w * 0.02);
        ctx.stroke();
        ctx.restore();
      }
    } else if (el.type === 'shape') {
      const resolved = resolveAppearance(el, spec.palette);
      if (el.shape === 'rect') {
        const tracer = rectTracer(bw, bh, Math.min(bw, bh) * el.radius);
        paintOuterShadowsCanvas(ctx, resolved.shadows, tracer);
        paintFillsCanvas(ctx, resolved.fills, tracer, bw, bh);
        paintStrokesCanvas(ctx, resolved.strokes, tracer);
        paintInnerShadowsCanvas(ctx, resolved.shadows, tracer, bw, bh);
      } else if (el.shape === 'ellipse') {
        const tracer = ellipseTracer(bw, bh);
        paintOuterShadowsCanvas(ctx, resolved.shadows, tracer);
        paintFillsCanvas(ctx, resolved.fills, tracer, bw, bh);
        paintStrokesCanvas(ctx, resolved.strokes, tracer);
        paintInnerShadowsCanvas(ctx, resolved.shadows, tracer, bw, bh);
      } else if (el.shape === 'path' && (el.points?.length || el.subpaths?.length || el.outline?.length)) {
        const { cmds, multiRegion, closedForFill } = pathElementCommands(el);
        const tracer = pathCmdsTracer(cmds, bw, bh);
        const fillRule: CanvasFillRule = multiRegion ? 'evenodd' : 'nonzero';
        // نفس الفرز الذي تعمله المعاينة و`renderArtboardSvg` بالدالّة نفسها —
        // فلا يستطيع المُنقِّط أن يَعُدَّ طبقةً متغيّرةً ويَعُدَّها المُسلسِل منتظمة.
        const { uniform: uniformStrokes, variable: variableStrokes } = splitStrokesByWidthKind(resolved.strokes, true);
        paintOuterShadowsCanvas(ctx, resolved.shadows, tracer);
        if (closedForFill) paintFillsCanvas(ctx, resolved.fills, tracer, bw, bh, fillRule);
        // Glyph outlines (roadmap #12) are fill-only, like the text they came from —
        // never the mandatory stroke every hand-drawn pen path gets (migrated into a
        // real stroke layer by `migrateAppearance` for every other path shape).
        if (!el.outline?.length) {
          paintStrokesCanvas(ctx, uniformStrokes, tracer);
          // الحدّ متغيّر السُّمك: `fill` دائمًا بـ`nonzero` — لا `fillRule`
          // المحسوبة أعلاه. والمضلَّع حلقةٌ واحدة قد تلتفّ على نفسها، فـ`evenodd`
          // كانت ستثقب موضعَ التقاطع بدل أن تُعبّئه.
          for (const s of variableStrokes) {
            const outline = variableStrokeOutlineCmds(cmds, s.widthProfile!, s.width, bw, bh);
            if (!outline.length) continue;
            ctx.save();
            ctx.globalAlpha *= s.opacity;
            drawPathCommandsToCtx(ctx, outline, bw, bh);
            ctx.fillStyle = s.color;
            ctx.fill('nonzero');
            ctx.restore();
          }
        }
        if (closedForFill) paintInnerShadowsCanvas(ctx, resolved.shadows, tracer, bw, bh);
      }

      if (el.label) {
        const labelColor = resolveShapeLabelColor(el, spec.palette);
        ctx.fillStyle = labelColor;
        ctx.font = `800 ${bw * 0.3}px Alexandria, sans-serif`;
        ctx.textBaseline = 'middle';
        if (el.labelPosition === 'inline-end') {
          ctx.font = `700 ${bw * 1.1}px Alexandria, sans-serif`;
          ctx.textAlign = 'right';
          ctx.fillText(el.label, -bw * 0.5, bh / 2);
        } else {
          ctx.textAlign = 'center';
          ctx.fillText(el.label, bw / 2, bh / 2);
        }
      }
    } else if (el.type === 'text') {
      // Roadmap #17 — the topmost visible fill layer paints the glyphs (gradient text
      // is a real `fillStyle` gradient, not an approximation); an element with no real
      // appearance stack yet resolves to a single legacy-color layer via
      // `resolveAppearance`, so `color` is byte-identical to the pre-#17 value for
      // every document this roadmap item didn't touch.
      const resolved = resolveAppearance(el, spec.palette);
      const topFill = resolved.fills[resolved.fills.length - 1];
      const color = topFill ? resolveFillStyleCanvas(ctx, topFill, bw, bh) : resolveTextColor(el, spec.palette);
      const fontPx = (el.fontSize / 1080) * w;
      ctx.fillStyle = color;
      ctx.font = `${WEIGHT_CSS[el.weight]} ${fontPx}px ${el.fontFamily}, sans-serif`;
      // التتبُّع يُضبَط على السياق مرّةً هنا فيسري على كل ما يلي بلا استثناء:
      // `wrapLines` (القياس الذي يقرّر مواضع الكسر)، والتعبئة، والظلّ، والحدّ،
      // ومسار التدرّج الحرفي (`drawStaggeredText`) — فلا يبقى مسارٌ يقيس بغير ما
      // يرسم. القيمة بـ`em` فتتناسب مع `fontPx` المشتقّة من عرض اللوحة، وهو ما
      // يجعل التصدير بمضاعِف ٢× أو ٣× يبقى مطابقًا للمعاينة.
      //
      // الحدّ: `CanvasRenderingContext2D.letterSpacing` غير موجود في محرّكات
      // قديمة؛ وإسنادٌ لخاصّيّة غير موجودة لا يفعل شيئًا ولا يرمي، فتُصدَّر عندها
      // بلا تتبُّع. وهو مُوثَّقٌ في `docs/CONTROLS.md` لأنه فرقٌ بين المعاينة
      // والملفّ، وهو أسوأ أنواع الفروق.
      ctx.letterSpacing = el.tracking ? `${el.tracking / 100}em` : '0px';
      ctx.textBaseline = 'alphabetic';
      // Logical start/end must resolve against the *document's* current language —
      // same as the live artboard (ElementView sets dir={lang==='ar'?'rtl':'ltr'}) —
      // not an export-time constant, or the exported file disagrees with what was on
      // screen whenever the UI language differs from Arabic.
      const dir = spec.lang === 'ar' ? 'rtl' : 'ltr';
      ctx.direction = dir;
      const pathShapeEl = el.pathId ? (spec.elements.find((m) => m.id === el.pathId && m.type === 'shape') as ShapeElement | undefined) : undefined;
      if (pathShapeEl && (pathShapeEl.points?.length || pathShapeEl.subpaths?.length || pathShapeEl.outline?.length)) {
        // Roadmap #12 — real per-glyph curve placement (`shapeTextOnCurve`, built on
        // the HarfBuzz shaping pipeline "تحويل النص إلى مخطط متجهي" already uses), not
        // an approximation: the returned `PathCmd[]` is already in this element's own
        // local pixel frame, so it draws with the exact same two calls a hand-drawn
        // pen path does.
        try {
          const cmds = await shapeTextOnCurve(el, pathShapeEl, { w, h }, dir);
          if (cmds.length) {
            drawPathCommandsToCtx(ctx, cmds, 1, 1);
            ctx.fillStyle = color;
            ctx.fill();
          }
        } catch {
          // Unsupported (non-built-in) font or a degenerate curve — leave this
          // element blank rather than throwing mid-export and losing every other one.
        }
      } else if (el.textAnim?.enabled) {
        // Same char/word/line reveal-stagger the DOM preview renders (see
        // `renderStaggeredText` in ElementView.tsx) — a real per-unit rasterization
        // at `time`, not a reimplementation guessing at the live preview's state.
        drawStaggeredText(ctx, el, bw, bh, dir, fontPx, time, ctx.globalAlpha);
      } else {
        let lines = wrapLines(ctx, el.text, bw);
        if (el.justify && dir === 'rtl') lines = await justifyCanvasLines(ctx, lines, bw);
        const lineHeight = fontPx * 1.15;
        const totalHeight = lines.length * lineHeight;
        let startY: number;
        if (el.valign === 'top') startY = fontPx * 0.9;
        else if (el.valign === 'middle') startY = (bh - totalHeight) / 2 + fontPx * 0.9;
        else startY = bh - totalHeight + fontPx * 0.9;
        const startIsRight = dir === 'rtl';
        const alignX = el.halign === 'start' ? (startIsRight ? bw : 0) : el.halign === 'end' ? (startIsRight ? 0 : bw) : bw / 2;
        ctx.textAlign = el.halign === 'start' ? (startIsRight ? 'right' : 'left') : el.halign === 'end' ? (startIsRight ? 'left' : 'right') : 'center';
        // Roadmap #17 — outer shadow layers only (no per-glyph silhouette is computed
        // for an inner-shadow clip, a documented limitation — see docs/CONTROLS.md):
        // each is its own real glyph-shaped shadow, drawn as a full caster copy of the
        // text *before* the real fill, which then fully covers it except the blurred
        // halo bleeding past the glyph edges — identical technique to the shape/image
        // outer-shadow path above, just driven by `fillText` instead of a traced path.
        const baseAlpha = ctx.globalAlpha;
        for (const sh of resolved.shadows) {
          if (sh.kind !== 'outer') continue;
          ctx.save();
          ctx.globalAlpha = baseAlpha * sh.opacity;
          ctx.shadowColor = sh.color;
          ctx.shadowBlur = sh.blur;
          ctx.shadowOffsetX = sh.offsetX;
          ctx.shadowOffsetY = sh.offsetY;
          ctx.fillStyle = sh.color;
          lines.forEach((line, i) => ctx.fillText(line, alignX, startY + i * lineHeight));
          ctx.restore();
        }
        ctx.fillStyle = color;
        lines.forEach((line, i) => ctx.fillText(line, alignX, startY + i * lineHeight));
        // Only the topmost visible stroke layer paints glyph outlines (multi-layer
        // text stroke isn't independently composited — a documented limitation).
        const topStroke = resolved.strokes[resolved.strokes.length - 1];
        if (topStroke) {
          ctx.save();
          ctx.globalAlpha = baseAlpha * topStroke.opacity;
          ctx.strokeStyle = topStroke.color;
          ctx.lineWidth = topStroke.width;
          lines.forEach((line, i) => ctx.strokeText(line, alignX, startY + i * lineHeight));
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }
}

interface PreparedArtboardCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

/** Creates the offscreen canvas and waits for fonts once — shared by the single-shot
 * PNG export and the video/GIF frame sequence below, so a multi-hundred-frame export
 * doesn't redo a canvas allocation + `document.fonts.ready` wait per frame. */
async function prepareArtboardCanvas(spec: Pick<ArtboardRenderSpec, 'size' | 'scale' | 'elements'>): Promise<PreparedArtboardCanvas> {
  const w = Math.round(spec.size.w * spec.scale);
  const h = Math.round(spec.size.h * spec.scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذر إنشاء سطح الرسم (canvas 2D context)');

  const maxFontPx = spec.elements.reduce((m, el) => (el.type === 'text' ? Math.max(m, (el.fontSize / 1080) * w) : m), 10);
  await document.fonts.load(`800 ${maxFontPx}px Alexandria`).catch(() => undefined);
  await document.fonts.ready;

  return { canvas, ctx, w, h };
}

/** Paints one frame (background + decorative accent + every element resolved at
 * `spec.time`) onto an already-prepared canvas. Exported so a caller can `toBlob()`
 * it in whatever pixel format it needs (PNG for both the static export and each
 * video frame). */
async function paintArtboardFrame(ctx: CanvasRenderingContext2D, spec: ArtboardRenderSpec, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  if (!spec.transparent) {
    ctx.fillStyle = spec.palette.bg;
    ctx.fillRect(0, 0, w, h);
  }

  // Accent decorative circle, bleeding past the top-right edge — document-level
  // background decoration, not a selectable/editable element.
  //
  // كان الشرط هنا `spec.elements.length > 0` — أي «ارسمها على كل مستندٍ فيه شيء».
  // وقد كُتب في ١٨ أكتوبر ٢٠٢٦ ليفي بوعد «ابدأ من فراغ»، لكنه وفّى به لحظةً واحدة
  // فقط: أوّل عنصرٍ يضعه المصمّم كان يُنبت القرص مرّةً أخرى. والقياس الذي أنهى
  // النقاش جاء من حلقة المحاكاة (`qa/replication/targets/t01-sidra`): موجزٌ عاديّ
  // لا يذكر زخرفةً، وزاويةُ هدفه خالية، ولا سبيل في الواجهة كلّها إلى إخلائها.
  //
  // فصار الجواب حقلًا في المستند يملكه المصمّم (`DocSnapshot.decorAccent`)، ومهاجر
  // الملفّات المحفوظة يُسقِط عليه القاعدة القديمة حرفيًّا فلا يتغيّر مظهر أي ملفٍّ
  // قديم. والشرط هنا صار الحقلَ وحده: قاعدتان تتنازعان الجواب هما بالضبط ما جعل
  // المعاينة والملف المصدَّر يختلفان من قبل.
  if (spec.decorAccent) {
    const accentD = 0.46 * w;
    ctx.fillStyle = spec.palette.ac;
    ctx.beginPath();
    ctx.arc(w * 0.68 + accentD / 2, -0.16 * h + accentD / 2, accentD / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  await drawElements(ctx, spec, w, h);
}

/** Renders the artboard to an offscreen canvas and resolves a PNG blob — a real
 * rasterization of the current element list (not a DOM screenshot), so it
 * deliberately settles any entrance animation to its final state. */
export async function renderArtboardPng(spec: ArtboardRenderSpec): Promise<Blob> {
  const { canvas, ctx, w, h } = await prepareArtboardCanvas(spec);
  try {
    await paintArtboardFrame(ctx, spec, w, h);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('فشل إنشاء ملف PNG'))), 'image/png');
    });
  } finally {
    // Any Lottie/video element drawn above left a hidden player element attached to
    // document.body (see lottieExportEngine.ts/videoExportEngine.ts) — never leak those
    // past this call.
    resetLottieExportEngine();
    resetVideoExportEngine();
  }
}

/** Renders one PNG frame per requested timeline time, reusing a single canvas and
 * font-load — the video/GIF exporter's frame source. Each frame is a real
 * rasterization through the exact same `drawElements` path as `renderArtboardPng`
 * (just with a real `time` instead of the "settled" default), so a video frame and
 * a PNG export of the same instant are pixel-identical. Streams one blob at a time
 * via `onFrame` rather than collecting them all, so a long export doesn't hold every
 * frame's PNG bytes in memory at once. */
export async function renderArtboardFrames(
  spec: Omit<ArtboardRenderSpec, 'time'>,
  frameTimes: number[],
  onFrame: (blob: Blob, index: number) => Promise<void> | void,
): Promise<void> {
  const { canvas, ctx, w, h } = await prepareArtboardCanvas(spec);
  try {
    for (let i = 0; i < frameTimes.length; i++) {
      await paintArtboardFrame(ctx, { ...spec, time: frameTimes[i] }, w, h);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('فشل إنشاء إطار'))), 'image/png');
      });
      await onFrame(blob, i);
    }
  } finally {
    resetLottieExportEngine();
    resetVideoExportEngine();
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A fill layer's 2-stop linear gradient as a standalone SVG `<linearGradient>` def,
 * referenced by the caller via `fill="url(#id)"` — the SVG-export equivalent of
 * `buildLinearGradient` in `appearance.ts` (same angle/from/to, SVG's own gradient
 * machinery instead of a `CanvasGradient`). */
function svgGradientDef(grad: { angle: number; from: string; to: string }, id: string): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(${grad.angle} 0.5 0.5)"><stop offset="0" stop-color="${grad.from}" /><stop offset="1" stop-color="${grad.to}" /></linearGradient>`;
}

/** Roadmap #17 — every *outer* shadow layer (there can be several) as one SVG
 * `<filter>`: each layer gets its own offset/blur/flood-tint chain (the manual
 * equivalent of `feDropShadow`, since several chained `feDropShadow` primitives
 * can't each reference the original `SourceGraphic` independently), merged behind
 * the real `SourceGraphic` in a single `feMerge`. `spread` has no `feDropShadow`-
 * family equivalent and is dropped — a documented, bounded limitation specific to
 * the SVG export path (see docs/CONTROLS.md); the live DOM preview and the canvas/
 * PNG/MP4/GIF path both honor it exactly via a real inset/outset silhouette.
 * `kind:'inner'` shadows are also SVG-export-only unsupported (documented
 * alongside `spread`) — returns `''` (no filter) if `shadows` has no outer layer. */
function svgOuterShadowFilter(shadows: ResolvedShadowPaint[], id: string): string {
  const outer = shadows.filter((s) => s.kind === 'outer');
  if (!outer.length) return '';
  const prims: string[] = [];
  const merge: string[] = [];
  outer.forEach((sh, i) => {
    prims.push(`<feOffset in="SourceAlpha" dx="${sh.offsetX}" dy="${sh.offsetY}" result="off${i}" />`);
    prims.push(`<feGaussianBlur in="off${i}" stdDeviation="${Math.max(0, sh.blur / 2)}" result="blur${i}" />`);
    prims.push(`<feFlood flood-color="${sh.color}" flood-opacity="${sh.opacity}" result="flood${i}" />`);
    prims.push(`<feComposite in="flood${i}" in2="blur${i}" operator="in" result="tinted${i}" />`);
    merge.push(`<feMergeNode in="tinted${i}" />`);
  });
  merge.push('<feMergeNode in="SourceGraphic" />');
  return `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%">${prims.join('')}<feMerge>${merge.join('')}</feMerge></filter>`;
}

/** Builds a real standalone SVG document for the artboard (vector shapes + text,
 * not a canvas rasterization) from the live element list. */
export function renderArtboardSvg(spec: Omit<ArtboardRenderSpec, 'scale'>): Blob {
  const w = spec.size.w;
  const h = spec.size.h;
  const accentD = 0.46 * w;
  const bg = spec.transparent ? 'none' : spec.palette.bg;
  const parts: string[] = [];
  if (bg !== 'none') parts.push(`<rect width="${w}" height="${h}" fill="${bg}" />`);
  // نفس شرط المسار النقطي أعلاه حرفيًّا — والسبب نفسه: الشرط إن اختلف بين المسارين
  // صدَّر المستندُ الواحد صورتين مختلفتين باختلاف الصيغة وحدها. يقرأ الحقل الذي
  // يملكه المصمّم، لا عدد العناصر.
  if (spec.decorAccent) {
    parts.push(`<circle cx="${w * 0.68 + accentD / 2}" cy="${-0.16 * h + accentD / 2}" r="${accentD / 2}" fill="${spec.palette.ac}" />`);
  }

  for (const el of spec.elements) {
    if (!el.visible) continue;
    const x = el.geo.x * w;
    const y = el.geo.y * h;
    const bw = el.geo.w * w;
    const bh = el.geo.h * h;
    const transform = `translate(${x} ${y}) rotate(${el.geo.rotation} ${bw / 2} ${bh / 2})`;
    const opacity = (el.opacity ?? 100) / 100;

    // Generic clipping mask: any element kind gets a clip-path on its own outer <g>,
    // same polygon math as the canvas/DOM paths (maskLocalPolygonPoints) — not image-only.
    let maskClipAttr = '';
    if (el.maskId) {
      const maskEl = spec.elements.find((m) => m.id === el.maskId && m.type === 'shape') as ShapeElement | undefined;
      if (maskEl) {
        const elBox: PxBox = { x, y, w: bw, h: bh, rotation: el.geo.rotation };
        const maskBox: PxBox = { x: maskEl.geo.x * w, y: maskEl.geo.y * h, w: maskEl.geo.w * w, h: maskEl.geo.h * h, rotation: maskEl.geo.rotation };
        const pts = maskLocalPolygonPoints(elBox, maskBox, maskEl.shape === 'ellipse' ? 'ellipse' : 'rect');
        const maskClipId = `mask-${esc(el.id)}`;
        parts.push(`<clipPath id="${maskClipId}"><polygon points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}" /></clipPath>`);
        maskClipAttr = ` clip-path="url(#${maskClipId})"`;
      }
    }

    if (el.type === 'lottie') {
      // SVG has no way to embed an arbitrary bodymovin document as live vector
      // content without re-authoring every shape/keyframe into SVG's own animation
      // model — out of scope for this pass (documented in docs/CONTROLS.md). What
      // *is* honest and real: a rasterized snapshot of the exact frame visible at
      // `spec.time` (the same settled-time convention every other element already
      // uses for SVG — see `settledTimeOf` above), embedded as a real
      // `<image>` — never a blank box pretending to be the animation.
      try {
        const time = spec.time ?? settledTimeOf(spec);
        const frameCanvas = getLottieExportFrame(el.id, el.data, bw, bh, time, el.loop);
        const dataUrl = frameCanvas.toDataURL('image/png');
        parts.push(`<g transform="${transform}" opacity="${opacity}"${maskClipAttr}><image href="${dataUrl}" x="0" y="0" width="${bw}" height="${bh}" /></g>`);
      } catch {
        // Corrupt/unloadable data — fall through, leaving this element absent from
        // the SVG rather than throwing mid-export and losing every other element.
      }
    } else if (el.type === 'video') {
      // Same "SVG can't host real motion" limitation as the lottie case above, but
      // *not* the same fix: `getLottieExportFrame` is synchronous (a live lottie-web
      // player can be seeked and read back immediately), while a real `<video>` seek
      // is unavoidably async — this function is synchronous, so a live time-accurate
      // frame isn't available here without a larger refactor. What's used instead is
      // the real import-time poster frame (see docs/CONTROLS.md) — an honest static
      // snapshot of actual decoded content, never a blank placeholder box.
      if (el.poster) {
        parts.push(`<g transform="${transform}" opacity="${opacity}"${maskClipAttr}><image href="${el.poster}" x="0" y="0" width="${bw}" height="${bh}" /></g>`);
      }
    } else if (el.type === 'image') {
      if (el.src) {
        // Same legacy-document defensiveness as the canvas/PNG path above.
        const safeRadius = Number.isFinite(el.radius) ? el.radius : 0;
        const radiusPx = Math.min(bw, bh) * safeRadius;
        const clipId = `clip-${esc(el.id)}`;
        parts.push(`<clipPath id="${clipId}"><rect width="${bw}" height="${bh}" rx="${radiusPx}" /></clipPath>`);
        const natural = { w: el.naturalW, h: el.naturalH };
        const layout = computeImageCropLayout({ w: bw, h: bh }, natural, el.fit, el.cropX, el.cropY, el.cropScale);
        const flipTransform = el.flipH || el.flipV ? ` transform="translate(${bw / 2} ${bh / 2}) scale(${el.flipH ? -1 : 1} ${el.flipV ? -1 : 1}) translate(${-bw / 2} ${-bh / 2})"` : '';
        // Roadmap #17 — every stroke layer, each its own inset/outset `<rect>` ring
        // (mirroring `rectTracer`'s inside/outside math exactly); outer shadow
        // layers via `svgOuterShadowFilter` on the whole `<g>` (see its own doc
        // comment for what's approximated — `spread` and `kind:'inner'`, SVG-export
        // only, documented in docs/CONTROLS.md).
        const resolved = resolveAppearance(el, spec.palette);
        const strokeSvg = resolved.strokes
          .map((s) => {
            const inset = s.position === 'inside' ? s.width / 2 : s.position === 'outside' ? -s.width / 2 : 0;
            const w2 = Math.max(0, bw - 2 * inset);
            const h2 = Math.max(0, bh - 2 * inset);
            const r2 = Math.max(0, Math.min(radiusPx - inset, Math.min(w2, h2) / 2));
            return `<rect x="${inset}" y="${inset}" width="${w2}" height="${h2}" rx="${r2}" fill="none" stroke="${s.color}" stroke-opacity="${s.opacity}" stroke-width="${s.width}" />`;
          })
          .join('');
        const shadowId = `shadow-${esc(el.id)}`;
        const shadowFilter = svgOuterShadowFilter(resolved.shadows, shadowId);
        const filterAttr = shadowFilter ? ` filter="url(#${shadowId})"` : '';
        if (shadowFilter) parts.push(shadowFilter);
        parts.push(
          `<g transform="${transform}" opacity="${opacity}"${maskClipAttr}${filterAttr}><g clip-path="url(#${clipId})"><image href="${esc(el.src)}" x="${layout.tx}" y="${layout.ty}" width="${layout.dw}" height="${layout.dh}"${flipTransform} /></g>${strokeSvg}</g>`,
        );
      } else {
        parts.push(`<g transform="${transform}" opacity="${opacity}"${maskClipAttr}><rect width="${bw}" height="${bh}" rx="${w * 0.02}" fill="none" stroke="${spec.palette.fg}" stroke-opacity="0.5" stroke-dasharray="${w * 0.012} ${w * 0.012}" stroke-width="${Math.max(1, w * 0.004)}" /></g>`);
      }
    } else if (el.type === 'shape') {
      // Roadmap #17 — rect/ellipse get the full multi-layer treatment (every fill
      // layer as its own shape with `mix-blend-mode` CSS — a valid SVG blend-mode
      // name for every `AppearanceBlend` value including `'normal'`, unlike canvas'
      // `GlobalCompositeOperation`; every stroke layer as its own inset/outset ring,
      // same as the image branch above). A hand-drawn path/outline shape only gets
      // its *topmost* fill/stroke layer — same documented limitation as the live
      // DOM preview (`ElementView.tsx`) — and no shadow at all (no outer-shadow
      // filter is attached to the path branch below).
      const resolved = resolveAppearance(el, spec.palette);
      let shapeSvg = '';
      let shadowFilter = '';
      const shadowId = `shadow-${esc(el.id)}`;
      if (el.shape === 'rect' || el.shape === 'ellipse') {
        const radiusPx = el.shape === 'rect' ? Math.min(bw, bh) * el.radius : 0;
        const defs: string[] = [];
        const fillSvg = resolved.fills
          .map((f, i) => {
            let fillAttr = f.color;
            if (f.kind === 'gradient' && f.gradient) {
              const gid = `grad-${esc(el.id)}-${i}`;
              defs.push(svgGradientDef(f.gradient, gid));
              fillAttr = `url(#${gid})`;
            }
            const geomAttr = el.shape === 'rect' ? `width="${bw}" height="${bh}" rx="${radiusPx}"` : `cx="${bw / 2}" cy="${bh / 2}" rx="${bw / 2}" ry="${bh / 2}"`;
            return `<${el.shape === 'rect' ? 'rect' : 'ellipse'} ${geomAttr} fill="${fillAttr}" fill-opacity="${f.opacity}" style="mix-blend-mode:${f.blend}" />`;
          })
          .join('');
        const strokeSvg = resolved.strokes
          .map((s) => {
            const inset = s.position === 'inside' ? s.width / 2 : s.position === 'outside' ? -s.width / 2 : 0;
            if (el.shape === 'rect') {
              const w2 = Math.max(0, bw - 2 * inset);
              const h2 = Math.max(0, bh - 2 * inset);
              const r2 = Math.max(0, Math.min(radiusPx - inset, Math.min(w2, h2) / 2));
              return `<rect x="${inset}" y="${inset}" width="${w2}" height="${h2}" rx="${r2}" fill="none" stroke="${s.color}" stroke-opacity="${s.opacity}" stroke-width="${s.width}" />`;
            }
            return `<ellipse cx="${bw / 2}" cy="${bh / 2}" rx="${Math.max(0, bw / 2 - inset)}" ry="${Math.max(0, bh / 2 - inset)}" fill="none" stroke="${s.color}" stroke-opacity="${s.opacity}" stroke-width="${s.width}" />`;
          })
          .join('');
        shapeSvg = defs.join('') + fillSvg + strokeSvg;
        shadowFilter = svgOuterShadowFilter(resolved.shadows, shadowId);
      } else if (el.shape === 'path' && (el.points?.length || el.subpaths?.length || el.outline?.length)) {
        const { cmds, multiRegion, closedForFill } = pathElementCommands(el);
        const d = commandsToSvgPath(cmds, bw, bh);
        const fillRuleAttr = multiRegion ? ' fill-rule="evenodd"' : '';
        const topFill = resolved.fills[resolved.fills.length - 1];
        // نفس فرز `drawElements` بالدالّة نفسها: طبقةٌ متغيّرةُ السُّمك تُخرَج من
        // الكومة قبل اختيار «أعلى طبقة»، وإلا خرجت مرّتين — مضلَّعًا وحدًّا فوقه.
        const { uniform: uniformStrokes, variable: variableStrokes } = splitStrokesByWidthKind(resolved.strokes, true);
        const topStroke = uniformStrokes[uniformStrokes.length - 1];
        // Glyph outlines (roadmap #12) are fill-only, like the text they came from —
        // a real `<path>` with no mandatory stroke, which is exactly the point: this
        // is what lets a recipient without the font still see the correct glyphs.
        // وكذلك: كومة بلا طبقة حدٍّ مرئيّة = لا حدَّ إطلاقًا. الاحتياط القديم
        // (`palette.fg` بسُمك 2) كان يجعل تصدير SVG **يخالف تصدير PNG** على الشكل
        // نفسه — فمثلّث أو نجمة من المكتبة (معبَّأ، بلا حدّ) يخرج نظيفًا في PNG
        // وبحدٍّ بلون النصّ بسُمك 2 في SVG، والمسار الوحيد الذي كان يصل إلى هذا
        // الاحتياط هو مسارٌ أُفرِغت كومته يدويًّا في محرّر الطبقات. وكل مسار قديم
        // يمرّ بـ`migrateAppearance` فيملك طبقة حدٍّ دائمًا — فلا يتبدّل أي ملفّ
        // قائم، ويتّفق المُصدِّران الآن على كومة فارغة كما يتّفقان على ممتلئة.
        const strokeAttr = el.outline?.length || !topStroke ? '' : ` stroke="${topStroke.color}" stroke-opacity="${topStroke.opacity}" stroke-width="${topStroke.width}"`;
        const fillAttr = closedForFill && topFill ? (topFill.kind === 'gradient' && topFill.gradient ? topFill.gradient.from : topFill.color) : 'none';
        // الحدود متغيّرةُ السُّمك: مسارٌ معبَّأ لكلّ طبقة، **بلا `stroke`
        // إطلاقًا** — فـSVG لا يملك سُمكًا متغيّرًا، والهندسةُ هي الجواب. وهو
        // بعينه ما يُنفثه محرّك متّجهات مفتوح (`crates/svg/tests/stroke_export.rs:77-83`
        // يُثبت أن `stroke=` لا تظهر في الملفّ أصلًا).
        const variableStrokeSvg = variableStrokes
          .map((s) => {
            const outline = variableStrokeOutlineCmds(cmds, s.widthProfile!, s.width, bw, bh);
            if (!outline.length) return '';
            return `<path d="${commandsToSvgPath(outline, bw, bh)}" fill="${s.color}" fill-opacity="${s.opacity}" fill-rule="nonzero" />`;
          })
          .join('');
        shapeSvg = `<path d="${d}" fill="${fillAttr}" fill-opacity="${topFill?.opacity ?? 1}"${fillRuleAttr}${strokeAttr} />${variableStrokeSvg}`;
      }
      let labelSvg = '';
      if (el.label) {
        const labelColor = resolveShapeLabelColor(el, spec.palette);
        if (el.labelPosition === 'inline-end') {
          labelSvg = `<text x="0" y="${bh / 2}" fill="${labelColor}" font-size="${bw * 1.1}" font-weight="700" text-anchor="end" dominant-baseline="middle" font-family="Alexandria, sans-serif">${esc(el.label)}</text>`;
        } else {
          labelSvg = `<text x="${bw / 2}" y="${bh / 2}" fill="${labelColor}" font-size="${bw * 0.3}" font-weight="800" text-anchor="middle" dominant-baseline="middle" font-family="Alexandria, sans-serif">${esc(el.label)}</text>`;
        }
      }
      const filterAttr = shadowFilter ? ` filter="url(#${shadowId})"` : '';
      if (shadowFilter) parts.push(shadowFilter);
      parts.push(`<g transform="${transform}" opacity="${opacity}"${maskClipAttr}${filterAttr}>${shapeSvg}${labelSvg}</g>`);
    } else if (el.type === 'text') {
      // Roadmap #17 — topmost fill/stroke layer (same "one fillStyle/strokeStyle per
      // glyph run" scope as the canvas text path and the DOM preview), every outer
      // shadow layer via `svgOuterShadowFilter` on the whole `<g>` (inner shadow has
      // no per-glyph silhouette in any of the three paths — documented limitation).
      const resolved = resolveAppearance(el, spec.palette);
      const topFill = resolved.fills[resolved.fills.length - 1];
      const topStroke = resolved.strokes[resolved.strokes.length - 1];
      let fillAttr = topFill ? topFill.color : resolveTextColor(el, spec.palette);
      let gradientDef = '';
      if (topFill?.kind === 'gradient' && topFill.gradient) {
        const gid = `grad-${esc(el.id)}`;
        gradientDef = svgGradientDef(topFill.gradient, gid);
        fillAttr = `url(#${gid})`;
      }
      const fontPx = (el.fontSize / 1080) * w;
      // Same fix as the PNG/canvas path: resolve logical start/end against the
      // document's current language, not a hardcoded 'rtl'.
      const dir = spec.lang === 'ar' ? 'rtl' : 'ltr';
      const curvedCmds = el.pathId ? spec.curvedTextCmds?.[el.id] : undefined;
      if (curvedCmds?.length) {
        // Roadmap #12 — same real per-glyph outline placement as the canvas/PNG path
        // (`shapeTextOnCurve`), precomputed by the caller since the real HarfBuzz
        // shaping is async and this function stays synchronous — see
        // `ArtboardRenderSpec.curvedTextCmds`. A real `<path>`, correct without the
        // font installed, exactly like "تحويل النص إلى مخطط متجهي" already is.
        const d = commandsToSvgPath(curvedCmds, 1, 1);
        parts.push(`${gradientDef}<g transform="${transform}" opacity="${opacity}"${maskClipAttr}><path d="${d}" fill="${fillAttr}" fill-opacity="${topFill?.opacity ?? 1}" /></g>`);
      } else {
        const startIsRight = dir === 'rtl';
        const anchor = el.halign === 'start' ? (startIsRight ? 'end' : 'start') : el.halign === 'end' ? (startIsRight ? 'start' : 'end') : 'middle';
        const textX = el.halign === 'start' ? (startIsRight ? bw : 0) : el.halign === 'end' ? (startIsRight ? 0 : bw) : bw / 2;
        const textY = el.valign === 'top' ? fontPx * 0.9 : el.valign === 'middle' ? bh / 2 : bh - fontPx * 0.3;
        const weightNum = WEIGHT_CSS[el.weight];
        const strokeAttr = topStroke ? ` stroke="${topStroke.color}" stroke-opacity="${topStroke.opacity}" stroke-width="${topStroke.width}"` : '';
        const shadowId = `shadow-${esc(el.id)}`;
        const shadowFilter = svgOuterShadowFilter(resolved.shadows, shadowId);
        const filterAttr = shadowFilter ? ` filter="url(#${shadowId})"` : '';
        if (shadowFilter) parts.push(shadowFilter);
        const renderedText = spec.justifiedTexts?.[el.id] ?? el.text;
        parts.push(
          `${gradientDef}<g transform="${transform}" opacity="${opacity}"${maskClipAttr}${filterAttr}><text x="${textX}" y="${textY}" fill="${fillAttr}" fill-opacity="${topFill?.opacity ?? 1}"${strokeAttr} font-size="${fontPx}" font-weight="${weightNum}"${el.tracking ? ` letter-spacing="${(el.tracking / 100) * fontPx}"` : ''} text-anchor="${anchor}" direction="${dir}" font-family="${esc(el.fontFamily)}, sans-serif">${esc(renderedText)}</text></g>`,
        );
      }
    }
  }

  resetLottieExportEngine();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n  ${parts.join('\n  ')}\n</svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}
