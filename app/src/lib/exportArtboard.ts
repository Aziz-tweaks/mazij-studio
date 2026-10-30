import type { Palette, SizePreset } from '../data/constants';
import { applyFxToCanvas, fxStrengthAt, resolveFx } from './effects';
import type { DocElement, ShapeElement, TextElement } from '../state/elements';
import { firstBaselineShift, lineHeightOf, pivotOffsetFrac, resolveShapeLabelColor, resolveTextColor } from '../state/elements';
import type { Lang } from '../i18n/strings';
import type { Weight } from '../state/types';
import { computeImageCropLayout } from './imageCrop';
import { maskClipLocal } from './maskGeometry';
import { commandsToSvgPath, drawPathCommandsToCtx, ellipsePathCmds, pathElementCommands, roundRectPathCmds, type PathCmd } from './pathGeometry';
import { isTrimmed, trimPathCmds } from './pathTrim';
import { splitStrokesByWidthKind, variableStrokeOutlineCmds } from './variableStroke';
import { animTimeAt, canvasBlurRadiusPx, clipShowsAt, documentDuration, effectiveScale, entranceVisualAt } from './animTimeline';
import { HIDDEN_UNIT_VISUAL, SHOWN_UNIT_VISUAL, buildStaggerTokens, resolveUnitVisual, typedSplit, typedUnitCount, type StaggerToken, type UnitVisual } from './textStagger';
import { getLottieExportFrame, resetLottieExportEngine } from './lottieExportEngine';
import { getVideoExportFrame, resetVideoExportEngine } from './videoExportEngine';
import { normalizeShutter, runningMeanAlpha, shutterIsOpen, shutterSampleTimes, type ShutterSpec } from './motionBlur';
import { shapeTextOnCurve } from './textOnPath';
import { justifyWithKashida } from './kashidaJustify';
import { withCounterAt } from './textCounter';
import { paintGlass } from './glass';
import { canvasFilterWorks, drawBlurred } from './canvasBlur';
import {
  cssGradientLine,
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
  type GradientSpec,
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
  /** كيف تُرسم خانةُ صورةٍ أو فيديو فارغة. الإطارُ المنقّط دليلُ تحريرٍ على اللوحة،
   * لا جزءٌ من التصميم — وكان يُصدَّر في ملف PNG النهائيّ (جولة ٢٤ أكتوبر ٢٠٢٦).
   * الافتراضيّ `'none'`: لا شيء في الملف. `'block'` للمصغّرات: مستطيلٌ خافت يدلّ
   * على مكان الصورة دون خطوطٍ منقّطة. */
  placeholders?: 'none' | 'block';
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

/** ما يُرسَم به نصٌّ متتابعُ الظهور، مجموعًا مرّةً واحدة قبل الرسم: التعبئةُ، والظلالُ
 * الخارجيّة، والحدُّ الأعلى — **ما يرسمه المسارُ الساكن نفسُه** (انظر فرع النصّ في
 * `drawElements`). كان المسارُ المتتابع يرسم التعبئةَ وحدها، فنصٌّ له ظلٌّ في المعاينة
 * (`text-shadow` يرثه كلُّ حرف) يخرج بلا ظلٍّ في الفيديو. و`blurPx`/`scaleMean` ضبابيّةُ
 * العنصر ومقياسُه، لتُركَّب معهما ضبابيّةُ الوحدة. */
interface StaggerPaint {
  fill: string | CanvasGradient | CanvasPattern;
  shadows: { color: string; blur: number; offsetX: number; offsetY: number; opacity: number }[];
  stroke: { color: string; width: number; opacity: number } | null;
  blurPx: number;
  scaleMean: number;
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
 * wrap around individually-styled spans. Widths are those of what is actually drawn
 * (`tok.shaped` — the joined Arabic form, see `textStagger.ts`). */
function wrapStaggerTokensIntoLines(ctx: CanvasRenderingContext2D, tokens: StaggerToken[], maxWidth: number): PositionedToken[][] {
  const groups = groupStaggerTokensIntoWords(tokens);
  const lines: PositionedToken[][] = [];
  let current: PositionedToken[] = [];
  let currentWidth = 0;
  const widthOf = (items: PositionedToken[]) => items.reduce((s, it) => s + ctx.measureText(it.tok.shaped).width, 0);
  const trimTrailingSpace = () => {
    while (current.length && current[current.length - 1].tok.text.trim() === '') {
      currentWidth -= ctx.measureText(current[current.length - 1].tok.shaped).width;
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

/** يرسم نصًّا واحدًا بطبقاته — الظلالُ الخارجيّة ثم التعبئةُ ثم الحدّ — بالترتيب الذي
 * يرسم به المسارُ الساكن سطورَه. */
function paintTextRun(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, paint: StaggerPaint, alpha: number) {
  for (const sh of paint.shadows) {
    ctx.save();
    ctx.globalAlpha = alpha * sh.opacity;
    ctx.shadowColor = sh.color;
    ctx.shadowBlur = sh.blur;
    ctx.shadowOffsetX = sh.offsetX;
    ctx.shadowOffsetY = sh.offsetY;
    ctx.fillStyle = sh.color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = paint.fill;
  ctx.fillText(text, x, y);
  if (paint.stroke && paint.stroke.width > 0) {
    ctx.save();
    ctx.globalAlpha = alpha * paint.stroke.opacity;
    ctx.strokeStyle = paint.stroke.color;
    ctx.lineWidth = paint.stroke.width;
    ctx.strokeText(text, x, y);
    ctx.restore();
  }
}

/** Draws one unit's own text at `(anchorX, baselineY)`, anchored by `textAlign`
 * ('left'/'right' — never 'center' for an individual unit, only the whole line uses
 * that), composing the unit's reveal `visual` (opacity/translateY/scale/rotateDeg/blur —
 * see `unitVisualAt` in `textStagger.ts`) with the element-level alpha already set
 * on `ctx` by the caller (`elementAlpha`). The transform pivots at the unit's own
 * anchor edge/baseline rather than its visual center — a minor, documented
 * (`docs/CONTROLS.md`) divergence from the DOM preview's `transformOrigin: center
 * bottom` for the scale/rotate effects specifically; fade/slide are unaffected.
 *
 * وضبابيّةُ الوحدة نصفُ قطرٍ بكسرٍ من الخطّ، مضروبًا في مقياس العنصر (`ctx.filter` لا
 * تعرف المصفوفة — انظر `canvasBlurRadiusPx`) ومركّبًا مع ضبابيّة العنصر تركيبَ غاوسيّتين:
 * الجذرُ التربيعيّ لمجموع المربّعين، وهو ما تُنتجه CSS حين تُضبّب كتلةً داخل كتلةٍ مضبّبة. */
function drawStaggerToken(ctx: CanvasRenderingContext2D, text: string, anchorX: number, baselineY: number, textAlign: 'left' | 'right', visual: UnitVisual, fontPx: number, elementAlpha: number, paint: StaggerPaint) {
  if (visual.opacity <= 0) return;
  ctx.save();
  ctx.textAlign = textAlign;
  if (visual.blur > 0) {
    const unitPx = visual.blur * fontPx * paint.scaleMean;
    ctx.filter = `blur(${Math.hypot(paint.blurPx, unitPx).toFixed(3)}px)`;
  }
  ctx.translate(anchorX, baselineY);
  if (visual.translateX !== 0 || visual.translateY !== 0) ctx.translate(visual.translateX * fontPx, visual.translateY * fontPx);
  if (visual.rotateDeg !== 0) ctx.rotate((visual.rotateDeg * Math.PI) / 180);
  if (visual.scale !== 1) ctx.scale(visual.scale, visual.scale);
  paintTextRun(ctx, text, 0, 0, paint, elementAlpha * visual.opacity);
  ctx.restore();
}

function drawSlicedLine(
  ctx: CanvasRenderingContext2D,
  lineTokens: PositionedToken[],
  dir: 'rtl' | 'ltr',
  effectiveAlign: 'left' | 'right' | 'center',
  anchorX: number,
  baselineY: number,
  resolve: (tok: StaggerToken) => UnitVisual,
  fontPx: number,
  elementAlpha: number,
  paint: StaggerPaint,
) {
  const texts = lineTokens.map((p) => p.tok.text);
  const line = texts.join('');
  const full = ctx.measureText(line).width;
  const cum = [0];
  for (let i = 1; i <= texts.length; i++) cum.push(i === texts.length ? full : Math.min(full, Math.max(cum[i - 1], ctx.measureText(texts.slice(0, i).join('')).width)));
  const rightEdge = effectiveAlign === 'right' ? anchorX : effectiveAlign === 'left' ? anchorX + full : anchorX + full / 2;
  const leftEdge = rightEdge - full;
  const top = -fontPx * 1.6;
  const tall = fontPx * 2.4;
  lineTokens.forEach((p, i) => {
    const visual = resolve(p.tok);
    if (visual.opacity <= 0) return;
    const w = cum[i + 1] - cum[i];
    if (w <= 0) return;
    // حافّةُ البداية لهذه الشريحة (يمينُها في العربيّة) — محورُ حركتها كما في المسار المعزول.
    const edge = dir === 'rtl' ? rightEdge - cum[i] : leftEdge + cum[i];
    ctx.save();
    if (visual.blur > 0) {
      const unitPx = visual.blur * fontPx * paint.scaleMean;
      ctx.filter = `blur(${Math.hypot(paint.blurPx, unitPx).toFixed(3)}px)`;
    }
    ctx.translate(edge, baselineY);
    if (visual.translateX !== 0 || visual.translateY !== 0) ctx.translate(visual.translateX * fontPx, visual.translateY * fontPx);
    if (visual.rotateDeg !== 0) ctx.rotate((visual.rotateDeg * Math.PI) / 180);
    if (visual.scale !== 1) ctx.scale(visual.scale, visual.scale);
    // الطرفان يتجاوزان الحدَّ بنصف بكسل فلا يظهر شقٌّ بين شريحتين ساكنتين؛ وأوّلُ شريحةٍ
    // وآخرُها مفتوحتان للخارج (ذيولُ الحروف ونقاطُها قد تتجاوز عرضَ القياس).
    const first = i === 0;
    const last = i === lineTokens.length - 1;
    const outA = first ? fontPx : 0.5;
    const outB = last ? fontPx : 0.5;
    ctx.beginPath();
    if (dir === 'rtl') ctx.rect(-w - outB, top, w + outA + outB, tall);
    else ctx.rect(-outA, top, w + outA + outB, tall);
    ctx.clip();
    ctx.textAlign = dir === 'rtl' ? 'right' : 'left';
    paintTextRun(ctx, line, dir === 'rtl' ? cum[i] : -cum[i], 0, paint, elementAlpha * visual.opacity);
    ctx.restore();
  });
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
  paint: StaggerPaint,
) {
  // **الحروفُ الموصولة تُقطَع من سطرها لا تُشكَّل وحدها.** محرفُ الوصل (ZWJ) لا يكفي: خطٌّ
  // مُحمَّل لا يحوي رمزًا له (وهو شائعٌ في خطوطٍ عربيّةٍ كثيرة) يجعل WebKit يُكمل المحرفَ بخطٍّ آخر فينقطع المقطع
  // ويُرسَم كلُّ حرفٍ معزولًا وأعرض. فنرسم السطرَ كاملًا مشكَّلًا، ولكلّ وحدةٍ شريحتُها منه
  // (قصٌّ بين حدَّي بادئتها) بحركتها هي — فتبقى الكلمةُ موصولةً وكلُّ حرفٍ يتحرّك وحده.
  if (lineTokens.some((p) => p.tok.shaped !== p.tok.text)) {
    drawSlicedLine(ctx, lineTokens, dir, effectiveAlign, anchorX, baselineY, resolve, fontPx, elementAlpha, paint);
    return;
  }
  const widths = lineTokens.map((p) => ctx.measureText(p.tok.shaped).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  const rightEdge = effectiveAlign === 'right' ? anchorX : effectiveAlign === 'left' ? anchorX + totalWidth : anchorX + totalWidth / 2;
  const leftEdge = effectiveAlign === 'left' ? anchorX : effectiveAlign === 'right' ? anchorX - totalWidth : anchorX - totalWidth / 2;
  let cursor = dir === 'rtl' ? rightEdge : leftEdge;
  lineTokens.forEach((p, i) => {
    const visual = resolve(p.tok);
    if (dir === 'rtl') {
      drawStaggerToken(ctx, p.tok.shaped, cursor, baselineY, 'right', visual, fontPx, elementAlpha, paint);
      cursor -= widths[i];
    } else {
      drawStaggerToken(ctx, p.tok.shaped, cursor, baselineY, 'left', visual, fontPx, elementAlpha, paint);
      cursor += widths[i];
    }
  });
}

/** **«الكتابة» على القُماش**: السطورُ سطورُ النصّ الكامل (`wrapLines` نفسُها التي يلفّ بها
 * المسارُ الساكن — فلا يقفز سطرٌ حين يكتمل النصّ)، ومن كلّ سطرٍ يُرسَم ما يقع منه داخل
 * البادئة الظاهرة **مُشكَّلًا وحده**، عند حافّة بداية السطر الكامل: يمينُه في العربيّة
 * وإن كان السطرُ في الوسط. وهذا ما تفعله المعاينة: البادئةُ نصٌّ عاديٌّ يتبعه الباقي مخفيًّا
 * في مكانه. */
function drawTypedText(ctx: CanvasRenderingContext2D, text: string, visibleLen: number, dir: 'rtl' | 'ltr', effectiveAlign: 'left' | 'right' | 'center', anchorX: number, startY: number, lineHeight: number, lines: string[], elementAlpha: number, paint: StaggerPaint) {
  // مواضعُ كلمات النصّ الأصليّ — `wrapLines` تقسم على المسافات وتجمع بمسافةٍ واحدة،
  // فالكلمةُ الـn في سطورها هي الكلمةُ الـn هنا.
  const words = [...text.matchAll(/\S+/g)].map((m) => ({ start: m.index ?? 0, word: m[0] }));
  let w = 0;
  lines.forEach((line, i) => {
    const count = line.split(' ').length;
    const lineWords = words.slice(w, w + count);
    w += count;
    const parts: string[] = [];
    for (const lw of lineWords) {
      if (lw.start >= visibleLen) break;
      parts.push(lw.word.slice(0, Math.max(0, visibleLen - lw.start)));
    }
    const visible = parts.join(' ');
    if (!visible) return;
    const full = ctx.measureText(line).width;
    const startIsRight = dir === 'rtl';
    const rightEdge = effectiveAlign === 'right' ? anchorX : effectiveAlign === 'left' ? anchorX + full : anchorX + full / 2;
    const leftEdge = rightEdge - full;
    ctx.save();
    ctx.textAlign = startIsRight ? 'right' : 'left';
    paintTextRun(ctx, visible, startIsRight ? rightEdge : leftEdge, startY + i * lineHeight, paint, elementAlpha);
    ctx.restore();
  });
}

/** The stagger-enabled counterpart to the plain `lines.forEach(...fillText...)` the
 * non-stagger path uses — same font/baseline/alignment setup, but draws every
 * char/word/line unit individually with its own eased opacity/transform at `time`,
 * so a video frame shows exactly the same per-unit reveal state the live timeline
 * scrubber would at that instant (same "one shared formula" convention as
 * `entranceVisualAt`/`resolveAnimAt` for the element-level `anim.tracks`). */
function drawStaggeredText(ctx: CanvasRenderingContext2D, el: TextElement, bw: number, bh: number, dir: 'rtl' | 'ltr', fontPx: number, time: number, elementAlpha: number, paint: StaggerPaint) {
  const cfg = el.textAnim;
  const lineHeight = fontPx * lineHeightOf(el);
  // نصفُ زيادة التباعد فوق السطر الأوّل، كما يضعها المتصفّح — `firstBaselineShift`.
  const shift = firstBaselineShift(el, fontPx);
  const startIsRight = dir === 'rtl';
  const anchorX = el.halign === 'start' ? (startIsRight ? bw : 0) : el.halign === 'end' ? (startIsRight ? 0 : bw) : bw / 2;
  const effectiveAlign: 'left' | 'right' | 'center' =
    el.halign === 'start' ? (startIsRight ? 'right' : 'left') : el.halign === 'end' ? (startIsRight ? 'left' : 'right') : 'center';
  const startYFor = (lineCount: number) => {
    const totalHeight = lineCount * lineHeight || lineHeight;
    if (el.valign === 'top') return fontPx * 0.9 + shift;
    if (el.valign === 'middle') return (bh - totalHeight) / 2 + fontPx * 0.9 + shift;
    return bh - totalHeight + fontPx * 0.9 + shift;
  };
  const tokens = buildStaggerTokens(el.text, cfg, el.id);
  const typed = cfg.effect === 'type';
  const n = tokens.reduce((m, t) => (t.order !== null ? Math.max(m, t.order + 1) : m), 0);
  const k = typed ? typedUnitCount(cfg, el.anim, n, time) : 0;
  const resolve = (tok: StaggerToken): UnitVisual => {
    if (tok.rank === null) return SHOWN_UNIT_VISUAL;
    if (typed) return tok.order !== null && tok.order < k ? SHOWN_UNIT_VISUAL : HIDDEN_UNIT_VISUAL;
    return resolveUnitVisual(cfg, el.anim, tok.rank, time);
  };

  if (cfg.unit === 'line') {
    const visualLines: { items: PositionedToken[]; paragraphIndex: number }[] = [];
    tokens.forEach((tok, pi) => {
      // An authored blank line (tok.text === '') wraps to zero lines via `wrapLines` —
      // fall back to one empty line so a blank authored line still occupies a row,
      // same as the DOM preview's `renderStaggeredText` (which falls back to a space).
      const subLines = wrapLines(ctx, tok.text, bw);
      for (const sub of subLines.length ? subLines : ['']) visualLines.push({ items: [{ tok: { text: sub, rank: tok.rank, shaped: sub, order: tok.order } }], paragraphIndex: pi });
    });
    const startY = startYFor(visualLines.length);
    visualLines.forEach((vl, i) => {
      drawStaggerLine(ctx, vl.items, dir, effectiveAlign, anchorX, startY + i * lineHeight, resolve, fontPx, elementAlpha, paint);
    });
    return;
  }

  if (typed) {
    const lines = wrapLines(ctx, el.text, bw);
    const visibleLen = typedSplit(tokens, k).visible.length;
    drawTypedText(ctx, el.text, visibleLen, dir, effectiveAlign, anchorX, startYFor(lines.length), lineHeight, lines, elementAlpha, paint);
    return;
  }

  // char/word: tokenize+rank the whole element once (identical to the DOM preview's
  // `buildStaggerTokens(el.text, ...)` call), then wrap that single ranked sequence
  // into visual lines — so every token keeps the exact rank the DOM preview assigned
  // it, regardless of where the canvas happens to break the line.
  const lines = wrapStaggerTokensIntoLines(ctx, tokens, bw);
  const startY = startYFor(lines.length);
  lines.forEach((lineTokens, i) => {
    drawStaggerLine(ctx, lineTokens, dir, effectiveAlign, anchorX, startY + i * lineHeight, resolve, fontPx, elementAlpha, paint);
  });
}

/** **صورةٌ واحدةٌ مفكوكة لكلّ مصدر طوالَ التصدير** (٢٩ أكتوبر ٢٠٢٦). كانت كلُّ صورةٍ تُفكّ من
 * جديد في **كلّ إطار** — ومصادرُها بياناتٌ مضمَّنة بالميغابايتات — فبعد مئات الإطارات يضيق
 * WebKit بالذاكرة ويفشل الفكُّ بصمت، فتختفي الصورُ من الفيديو وتبقى في معاينة اللقطة الواحدة
 * (رُصد: تصاميمُ مشهدٍ كاملٍ غائبة بعد الثانية ٢٤ من تصديرٍ طوله ٤٤ ثانية). فالفكُّ مرّةً،
 * والمخزنُ يُفرَّغ حين ينتهي التصدير؛ والفشلُ العابر يُعاد مرّةً قبل أن يُستسلَم له. */
const imageCache = new Map<string, Promise<HTMLImageElement>>();
function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // `decode` يُبقي النسخةَ المفكوكة جاهزةً للرسم بدل فكٍّ كسولٍ عند كلّ `drawImage`.
      const d = (img as HTMLImageElement & { decode?: () => Promise<void> }).decode;
      if (d) d.call(img).then(() => resolve(img), () => resolve(img));
      else resolve(img);
    };
    img.onerror = () => reject(new Error('فشل تحميل صورة للتصدير'));
    img.src = src;
  });
}
function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = imageCache.get(src);
  if (hit) return hit;
  const p = decodeImage(src).catch(() => decodeImage(src));
  imageCache.set(src, p);
  p.catch(() => imageCache.delete(src));
  return p;
}
/** يُفرغ مخزنَ الصور المفكوكة — آخرَ كلّ تصدير. */
export function resetExportImageCache(): void {
  imageCache.clear();
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
  for (const rawEl of spec.elements) {
    const el = withCounterAt(rawEl, time);
    if (!el.visible) continue;
    // الصوتُ يُسمَع ولا يُرى — مكانُه خلطُ الصوت في `videoExport.ts` لا الإطار.
    if (el.type === 'audio') continue;
    // العنصرُ المحدودُ بمقطعه غائبٌ خارجه — `clipShowsAt` الواحدة التي تقرؤها
    // المعاينةُ وSVG، وغيرُ المحدود (كلُّ مستندٍ قائم) يمرّ كما كان.
    if (!clipShowsAt(el.anim, time)) continue;
    // **طبقةُ المؤثّر**: تُطبَّق على كلّ ما رُسم حتى الآن (الخلفيّةُ والزخرفةُ وما تحتها)،
    // نظيرَ غلاف المعاينة في `Stage.tsx`، بالصيغة الواحدة `fxStrengthAt`/`resolveFx`.
    if (el.type === 'fx') {
      const fv = entranceVisualAt(el.anim, time);
      const { s, u } = fxStrengthAt(el, el.anim, time, fv.opacity);
      if (s > 0) applyFxToCanvas(ctx, resolveFx(el.fx, s, u));
      continue;
    }
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
    // وضعُ المزج — نفسُ `mix-blend-mode` في المعاينة. كلُّ عمليّةِ رسمٍ للعنصر تُمزَج بما تحته.
    const blendOp = el.blend && el.blend !== 'normal' ? (el.blend as GlobalCompositeOperation) : null;
    if (blendOp) ctx.globalCompositeOperation = blendOp;
    // **ضبابيّةُ العنصر، من `canvasBlurRadiusPx` الواحدة.** تُضبَط هنا — بعد
    // `save()` وقبل أيّ رسم — فتَسري على كلّ عمليّات الرسم في هذا العنصر، ويُعيدها
    // `restore()` أدناه إلى `'none'` بحكم مواصفة القُماش (مقيسٌ: `ctx.filter` بعد
    // `restore()` يُقرأ `'none'`)، فلا تَنزّ إلى العنصر الذي يليه.
    //
    // ولا تَتأثّر بمصفوفة التحويل إطلاقًا — وهذا مقيسٌ لا مُفترَض، ولذلك يَحمل
    // `canvasBlurRadiusPx` تعويضَ المقياس بنفسه. انظر تعليقَها في
    // `animTimeline.ts` للأرقام.
    //
    // **وقيدٌ مُعلَن**: `ctx.filter` تُضبّب **كلَّ عمليّةِ رسمٍ على حدتها** لا
    // المُركَّبَ النهائيّ، بخلاف CSS `filter` الذي يُضبّب المُركَّب. فعنصرٌ بتعبئةٍ
    // واحدةٍ (حالةُ البقعة الناعمة، وهي المطلوبة) متطابقٌ تمامًا؛ وعنصرٌ بطبقاتٍ
    // متعدّدةٍ تُضبَّب طبقاتُه فُرادى ثم تُركَّب، والفرقُ مقيسٌ ومُعلَنٌ رقمًا في
    // `qa/shape-blur.spec.mjs` §٥ لا مُغطًّى.
    const blurPx = canvasBlurRadiusPx(el.blur ?? 0, visual, w);
    // **WebKit لا يرسم `ctx.filter`** (انظر `lib/canvasBlur.ts`): كانت ضبابيّةُ العنصر — ومنها
    // لطخةُ الحركة في الانتقالات — تختفي من الفيديو المُصدَّر على الماك. فيُرسَم العنصرُ هناك
    // في طبقةٍ بالمصفوفة والشفافيّة نفسيهما، ثم يُوضَع مضبَّبًا. وحيث يعمل `filter` لا تغيير.
    const mainCtx = ctx;
    const softLayer = blurPx > 0 && !canvasFilterWorks() ? softLayerFor(mainCtx) : null;
    if (softLayer) ctx = softLayer;
    else if (blurPx > 0) ctx.filter = `blur(${blurPx.toFixed(3)}px)`;
    try {
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
    // **نقطةُ الارتكاز** — الصيغةُ نفسُها في المعاينة (`entranceStyleAt`) والقناع
    // (`elementMatrix`): إزاحةٌ إلى النقطة، فالمقياسُ والدوران، فإزاحةٌ عكسيّة. ولا
    // نداءَ زائدًا على القُماش متى كانت في المركز.
    const pv = pivotOffsetFrac(el);
    const pivoted = (pv.dx !== 0 || pv.dy !== 0) && (sx !== 1 || sy !== 1 || visual.rotation !== 0);
    if (pivoted) ctx.translate(pv.dx * bw, pv.dy * bh);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    if (visual.rotation !== 0) ctx.rotate((visual.rotation * Math.PI) / 180);
    if (pivoted) ctx.translate(-pv.dx * bw, -pv.dy * bh);
    ctx.translate(-bw / 2, -bh / 2);

    // Generic clipping mask: any element kind clips to its mask shape's **real outline**
    // (rect radius, ellipse, pen path / polygon with its curves and regions) under the
    // mask's **own** transform at this instant, mapped into this element's local frame
    // by the inverse of this element's transform — `maskClipLocal`, the one formula the
    // live DOM view and the SVG export read too. So the cut stays where the mask says
    // whatever the content does: a label wiping in behind a moving mask, a figure rising
    // out of a still one. See `src/lib/maskGeometry.ts` for why it changed.
    if (el.maskId) {
      const maskEl = spec.elements.find((m) => m.id === el.maskId && m.type === 'shape') as ShapeElement | undefined;
      if (maskEl) {
        const clip = maskClipLocal(el, maskEl, { w, h }, time);
        if (clip) {
          drawPathCommandsToCtx(ctx, clip.cmds, 1, 1);
          ctx.clip(clip.evenOdd ? 'evenodd' : 'nonzero');
        }
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
      } else if (spec.placeholders === 'block') {
        paintPlaceholderBlock(ctx, spec, w, bw, bh);
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
          // **من بداية مقطعه** (`animTimeAt`) لا بزمن المستند — انظر `src/lib/audioMix.ts`.
          const video = await getVideoExportFrame(el.id, el.src, animTimeAt(el.anim, time), el.trimIn, el.trimOut, el.loop);
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
      } else if (spec.placeholders === 'block') {
        paintPlaceholderBlock(ctx, spec, w, bw, bh);
      }
    } else if (el.type === 'shape') {
      const resolved = resolveAppearance(el, spec.palette);
      // «بداية الخط» و«نهاية الخط»: الحدُّ يُرسَم على **المسار المقصوص** (`trimPathCmds`)،
      // والتعبئةُ والظلُّ على الشكل كاملًا. والحالةُ المحايدة (٠..١) لا تلمس سطرًا هنا.
      const trimmed = isTrimmed(visual.trimStart, visual.trimEnd);
      if (el.shape === 'rect') {
        const radiusPx = Math.min(bw, bh) * el.radius;
        const tracer = rectTracer(bw, bh, radiusPx);
        paintOuterShadowsCanvas(ctx, resolved.shadows, tracer);
        if (el.glass) paintGlass(ctx, bw, bh, time, el.glass, Math.min(bw, bh) * 0.12, (c) => (c.beginPath(), tracer(c, 0), c.fill()));
        else paintFillsCanvas(ctx, resolved.fills, tracer, bw, bh);
        paintStrokesCanvas(
          ctx,
          resolved.strokes,
          trimmed
            ? (c, inset) => {
                const w2 = Math.max(0, bw - 2 * inset);
                const h2 = Math.max(0, bh - 2 * inset);
                tracePxCmds(c, trimPathCmds(roundRectPathCmds(inset, inset, w2, h2, Math.max(0, Math.min(radiusPx - inset, Math.min(w2, h2) / 2))), visual.trimStart, visual.trimEnd, 1, 1));
              }
            : tracer,
        );
        paintInnerShadowsCanvas(ctx, resolved.shadows, tracer, bw, bh);
      } else if (el.shape === 'ellipse') {
        const tracer = ellipseTracer(bw, bh);
        paintOuterShadowsCanvas(ctx, resolved.shadows, tracer);
        if (el.glass) paintGlass(ctx, bw, bh, time, el.glass, Math.min(bw, bh) * 0.12, (c) => (c.beginPath(), tracer(c, 0), c.fill()));
        else paintFillsCanvas(ctx, resolved.fills, tracer, bw, bh);
        paintStrokesCanvas(
          ctx,
          resolved.strokes,
          trimmed
            ? (c, inset) => tracePxCmds(c, trimPathCmds(ellipsePathCmds(inset, inset, Math.max(0, bw - 2 * inset), Math.max(0, bh - 2 * inset)), visual.trimStart, visual.trimEnd, 1, 1))
            : tracer,
        );
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
          paintStrokesCanvas(ctx, uniformStrokes, trimmed ? pathCmdsTracer(trimPathCmds(cmds, visual.trimStart, visual.trimEnd, bw, bh), bw, bh) : tracer);
          // الحدّ متغيّر السُّمك: `fill` دائمًا بـ`nonzero` — لا `fillRule`
          // المحسوبة أعلاه. والمضلَّع حلقةٌ واحدة قد تلتفّ على نفسها، فـ`evenodd`
          // كانت ستثقب موضعَ التقاطع بدل أن تُعبّئه.
          for (const s of variableStrokes) {
            const outline = variableStrokeOutlineCmds(cmds, s.widthProfile!, s.width, bw, bh, trimmed ? { start: visual.trimStart, end: visual.trimEnd } : undefined);
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
      } else if (el.glass) {
        // خامةُ الزجاج تحلّ محلّ التعبئة (والظلّ والحدّ — قيدٌ مُعلَن في `lib/glass.ts`).
        const glass = el.glass;
        paintGlass(ctx, bw, bh, time, glass, fontPx * 0.09, (c) => drawTextSilhouette(c, el, bw, bh, fontPx, dir, time, Math.sqrt(Math.max(0, sx) * Math.max(0, sy))));
      } else if (el.textAnim?.enabled) {
        // Same char/word/line reveal-stagger the DOM preview renders (see
        // `renderStaggeredText` in ElementView.tsx) — a real per-unit rasterization
        // at `time`, not a reimplementation guessing at the live preview's state.
        const topStroke = resolved.strokes[resolved.strokes.length - 1];
        const paint: StaggerPaint = {
          fill: color,
          shadows: resolved.shadows.filter((sh) => sh.kind === 'outer').map((sh) => ({ color: sh.color, blur: sh.blur, offsetX: sh.offsetX, offsetY: sh.offsetY, opacity: sh.opacity })),
          stroke: topStroke && topStroke.width > 0 ? { color: topStroke.color, width: topStroke.width, opacity: topStroke.opacity } : null,
          blurPx,
          scaleMean: Math.sqrt(Math.max(0, sx) * Math.max(0, sy)),
        };
        if (topFill?.gradient && !paint.stroke && !paint.shadows.length) {
          // التدرّجُ في طبقة (انظر `withGradientTextLayer`): شفافيّةُ العنصر تُطبَّق مرّةً عند الوضع.
          withGradientTextLayer(ctx, color, bw, bh, topFill.gradient, (c, solid) => drawStaggeredText(c, el, bw, bh, dir, fontPx, time, 1, { ...paint, fill: solid }));
        } else {
          drawStaggeredText(ctx, el, bw, bh, dir, fontPx, time, ctx.globalAlpha, paint);
        }
      } else {
        let lines = wrapLines(ctx, el.text, bw);
        if (el.justify && dir === 'rtl') lines = await justifyCanvasLines(ctx, lines, bw);
        const lineHeight = fontPx * lineHeightOf(el);
        const totalHeight = lines.length * lineHeight;
        const shift = firstBaselineShift(el, fontPx);
        let startY: number;
        if (el.valign === 'top') startY = fontPx * 0.9 + shift;
        else if (el.valign === 'middle') startY = (bh - totalHeight) / 2 + fontPx * 0.9 + shift;
        else startY = bh - totalHeight + fontPx * 0.9 + shift;
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
        withGradientTextLayer(ctx, color, bw, bh, topFill?.gradient, (c, solid) => {
          c.fillStyle = typeof color === 'string' ? color : solid;
          lines.forEach((line, i) => c.fillText(line, alignX, startY + i * lineHeight));
        });
        // Only the topmost visible stroke layer paints glyph outlines (multi-layer
        // text stroke isn't independently composited — a documented limitation).
        const topStroke = resolved.strokes[resolved.strokes.length - 1];
        // سُمك صفر = لا حدّ (`paintStrokesCanvas`): الـcanvas يتجاهل `lineWidth = 0`.
        if (topStroke && topStroke.width > 0) {
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
    } finally {
      if (softLayer) {
        ctx = mainCtx;
        ctx.restore();
        // المنطقةُ على قدر العنصر لا القماش كلّه: مركزُه بعد إزاحته ونصفُ قطرِه بعد مقياسه.
        const T = mainCtx.getTransform();
        const es = effectiveScale(visual);
        const px = cx + visual.x * w;
        const py = cy + visual.y * w;
        const tScale = Math.sqrt(Math.abs(T.a * T.d - T.b * T.c)) || 1;
        const R = (Math.hypot(bw * Math.abs(es.sx), bh * Math.abs(es.sy)) / 2) * 1.35 * tScale + blurPx * 3 + 4;
        const dcx = T.a * px + T.c * py + T.e;
        const dcy = T.b * px + T.d * py + T.f;
        const CW = softLayer.canvas.width;
        const CH = softLayer.canvas.height;
        const rx = Math.max(0, Math.floor(dcx - R));
        const ry = Math.max(0, Math.floor(dcy - R));
        const rw = Math.min(CW, Math.ceil(dcx + R)) - rx;
        const rh = Math.min(CH, Math.ceil(dcy + R)) - ry;
        if (rw > 0 && rh > 0) {
          const prevOp = mainCtx.globalCompositeOperation;
          if (blendOp) mainCtx.globalCompositeOperation = blendOp;
          drawBlurred(mainCtx, softLayer.canvas, rx, ry, rw, rh, rx, ry, blurPx);
          mainCtx.globalCompositeOperation = prevOp;
        }
      }
    }
  }
}

let softCanvas: HTMLCanvasElement | null = null;
/** طبقةٌ بحجم القماش تَرث مصفوفتَه وشفافيّتَه — يُرسَم فيها عنصرٌ مضبَّب حيث لا `filter`. */
function softLayerFor(main: CanvasRenderingContext2D): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!softCanvas) softCanvas = document.createElement('canvas');
  if (softCanvas.width !== main.canvas.width || softCanvas.height !== main.canvas.height) {
    softCanvas.width = main.canvas.width;
    softCanvas.height = main.canvas.height;
  }
  const l = softCanvas.getContext('2d');
  if (!l) return null;
  // **حالةٌ نظيفةٌ تمامًا كلَّ مرّة — والقصُّ منها.** قناعُ العنصر يقصّ هذه الطبقة (`clip`) ولا
  // `save` عليها يقابله، فكان قصُّ شاشة الجوال يبقى فيها لكلّ عنصرٍ مضبَّبٍ بعده: تختفي
  // التصاميمُ المضبَّبة من بقيّة الفيلم كلّه (رُصد بالتنصيف: يبدأ عند أوّل جوالٍ مضبَّب).
  const lr = l as CanvasRenderingContext2D & { reset?: () => void };
  if (typeof lr.reset === 'function') lr.reset();
  else softCanvas.width = softCanvas.width; // إعادةُ ضبط العرض تُصفّر الحالةَ كلَّها في كلّ محرّك
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalCompositeOperation = 'source-over';
  l.globalAlpha = 1;
  l.clearRect(0, 0, softCanvas.width, softCanvas.height);
  l.setTransform(main.getTransform());
  l.globalAlpha = main.globalAlpha;
  return l;
}

/** **ظلُّ النصّ** — حروفُه مصمتةً في إحداثيّاته المحلّيّة بالتخطيط نفسه الذي يرسمه
 * المسارُ العاديّ (لفٌّ، محاذاة، تتابع). تستعمله خامةُ الزجاج في التصدير **وفي المعاينة**،
 * فلا يختلف موضعُ حرفٍ بين ما يُرى وما يُصدَّر. */
export function drawTextSilhouette(c: CanvasRenderingContext2D, el: TextElement, bw: number, bh: number, fontPx: number, dir: 'rtl' | 'ltr', time: number, scaleMean = 1): void {
  c.font = `${WEIGHT_CSS[el.weight]} ${fontPx}px ${el.fontFamily}, sans-serif`;
  (c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = el.tracking ? `${el.tracking / 100}em` : '0px';
  c.textBaseline = 'alphabetic';
  c.direction = dir;
  const solid = typeof c.fillStyle === 'string' ? c.fillStyle : '#000000';
  if (el.textAnim?.enabled) {
    drawStaggeredText(c, el, bw, bh, dir, fontPx, time, 1, { fill: solid, shadows: [], stroke: null, blurPx: 0, scaleMean });
    return;
  }
  const lines = wrapLines(c, el.text, bw);
  const lineHeight = fontPx * lineHeightOf(el);
  const totalHeight = lines.length * lineHeight;
  const shift = firstBaselineShift(el, fontPx);
  const startY = el.valign === 'top' ? fontPx * 0.9 + shift : el.valign === 'middle' ? (bh - totalHeight) / 2 + fontPx * 0.9 + shift : bh - totalHeight + fontPx * 0.9 + shift;
  const startIsRight = dir === 'rtl';
  const alignX = el.halign === 'start' ? (startIsRight ? bw : 0) : el.halign === 'end' ? (startIsRight ? 0 : bw) : bw / 2;
  c.textAlign = el.halign === 'start' ? (startIsRight ? 'right' : 'left') : el.halign === 'end' ? (startIsRight ? 'left' : 'right') : 'center';
  c.fillStyle = solid;
  lines.forEach((line, i) => c.fillText(line, alignX, startY + i * lineHeight));
}

/** **نصٌّ بتعبئةٍ متدرّجة يُرسَم في طبقةٍ ثم يُلوَّن — لا `fillText` بتدرّجٍ مباشرةً.**
 *
 * WebKit (محرّكُ مزيج على الماك والآيفون) يرسم النصَّ ذا التعبئة غير المصمتة (تدرّجًا أو
 * نقشًا) بقصِّ التعبئة على **صندوق السطر** لا على الحروف، فما يتدلّى تحته يختفي: نقطتا
 * الياء الأخيرة تحديدًا، فتصير «في» «فى» في كلّ عنوانٍ متدرّج (مقيسٌ في WebKit، وChromium
 * سليم). فنرسم الحروفَ مصمتةً في طبقةٍ بحجم القماش وبالمصفوفة نفسِها، ثم نلوّنها بالتدرّج
 * عبر `source-in`، ثم نضعها على القماش — فيسري عليها شفافيّةُ العنصر وضبابيّتُه وقناعُه
 * كما كانت تسري على `fillText`. */
let gradLayer: HTMLCanvasElement | null = null;
function withGradientTextLayer(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient, bw: number, bh: number, gradient: GradientSpec | undefined, draw: (c: CanvasRenderingContext2D, solid: string) => void): void {
  if (typeof fill === 'string' || !gradient || typeof document === 'undefined') {
    draw(ctx, typeof fill === 'string' ? fill : '#000000');
    return;
  }
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  if (!gradLayer) gradLayer = document.createElement('canvas');
  if (gradLayer.width !== cw || gradLayer.height !== ch) {
    gradLayer.width = cw;
    gradLayer.height = ch;
  }
  const l = gradLayer.getContext('2d');
  if (!l) {
    draw(ctx, '#000000');
    return;
  }
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalCompositeOperation = 'source-over';
  l.globalAlpha = 1;
  l.filter = 'none';
  l.clearRect(0, 0, cw, ch);
  l.setTransform(ctx.getTransform());
  l.font = ctx.font;
  l.textAlign = ctx.textAlign;
  l.textBaseline = ctx.textBaseline;
  l.direction = ctx.direction;
  (l as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing ?? '0px';
  draw(l, '#000000');
  l.globalCompositeOperation = 'source-in';
  l.globalAlpha = 1;
  l.filter = 'none';
  l.fillStyle = resolveFillStyleCanvas(l, { id: '', opacity: 1, blend: 'normal', kind: 'gradient', color: gradient.from, gradient }, bw, bh);
  l.fillRect(-bw, -bh, bw * 3, bh * 3);
  l.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(gradLayer, 0, 0);
  ctx.restore();
}

/** يتتبّع أوامرَ مسارٍ بالبكسل على المسار الجاري **بلا** `beginPath` — شكلُ «المتتبِّع»
 * (`SilhouetteTracer`) الذي يرسم به `paintStrokesCanvas` كلَّ حدّ. */
function tracePxCmds(ctx: CanvasRenderingContext2D, cmds: PathCmd[]) {
  for (const c of cmds) {
    if (c.c === 'M') ctx.moveTo(c.x, c.y);
    else if (c.c === 'L') ctx.lineTo(c.x, c.y);
    else if (c.c === 'C') ctx.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
    else ctx.closePath();
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

function paintPlaceholderBlock(ctx: CanvasRenderingContext2D, spec: Pick<ArtboardRenderSpec, 'palette'>, w: number, bw: number, bh: number) {
  ctx.save();
  ctx.fillStyle = spec.palette.fg;
  ctx.globalAlpha *= 0.1;
  ctx.beginPath();
  ctx.roundRect(0, 0, bw, bh, w * 0.02);
  ctx.fill();
  ctx.restore();
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
    resetExportImageCache();
  }
}

/** Renders one PNG frame per requested timeline time, reusing a single canvas and
 * font-load — the video/GIF exporter's frame source. Each frame is a real
 * rasterization through the exact same `drawElements` path as `renderArtboardPng`
 * (just with a real `time` instead of the "settled" default), so a video frame and
 * a PNG export of the same instant are pixel-identical. Streams one blob at a time
 * via `onFrame` rather than collecting them all, so a long export doesn't hold every
 * frame's PNG bytes in memory at once.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * والغالقُ وعقدُ «الإطارُ كالـPNG عند اللحظة نفسِها»
 * ─────────────────────────────────────────────────────────────────────────────
 * العقدُ أعلاه مكتوبٌ على **لحظة**، وضبابُ الحركة يُحوّل الإطارَ إلى **فترة**. فظاهرُه
 * أنهما لا يجتمعان. وقِيس الموضعُ بدل أن يُفترَض، فكان الجوابُ أضيقَ من الخوف:
 *
 * (أ) `opts.shutter` غائبٌ أو `samplesPerFrame = 1` ⇒ `shutterSampleTimes` تُرجع
 *     `[t]` بعينها، ويُؤخَذ المسارُ القديمُ بسطره. فكلُّ تصديرٍ قائمٍ **لم يتغيّر
 *     بتّةً واحدة**، لا «تقريبًا».
 *
 * (ب) و`renderArtboardPng` تُصدَّر دائمًا عند `settledTimeOf(spec)` — الوحيدُ الذي
 *     يُناديها `StudioContext.tsx:1407` وهو لا يُمرّر `time` أصلًا. وعند زمن
 *     الاستقرار **كلُّ مقطعٍ قد انتهى**، فسرعةُ كلّ عنصرٍ صفرٌ، فالعيّناتُ `N`
 *     متطابقةٌ واحدةً واحدة، ومتوسّطُ المتطابقات هو هي. فالتطابقُ البكسليُّ عند زمن
 *     الاستقرار **قائمٌ بالبناء لا بالحظّ** — ومقيسٌ في `qa/motion-blur.spec.mjs` §٢.
 *
 * فالموضعُ الوحيدُ الذي ينكسر فيه العقدُ هو PNG يُطلَب عند زمنٍ **غيرِ** زمن
 * الاستقرار وفيه عنصرٌ يتحرّك. ولا سبيلَ في الواجهة كلِّها إلى طلب ذلك اليوم.
 * والتفصيلُ كلُّه في `docs/DECISION-motion-blur-parity.md`. */
export async function renderArtboardFrames(
  spec: Omit<ArtboardRenderSpec, 'time'>,
  frameTimes: number[],
  onFrame: (blob: Blob, index: number) => Promise<void> | void,
  opts: { shutter?: ShutterSpec; frameInterval?: number } = {},
): Promise<void> {
  const { canvas, ctx, w, h } = await prepareArtboardCanvas(spec);
  const shutter = normalizeShutter(opts.shutter);
  const frameInterval = opts.frameInterval ?? 0;
  // لوحةُ العيّنات تُخصَّص **مرّةً واحدةً**، ولا تُخصَّص أصلًا متى كان الغالقُ
  // مُطفأً — للسبب نفسه الذي جمع `prepareArtboardCanvas` تخصيصَ اللوحة وانتظارَ
  // الخطوط في موضعٍ واحد: تصديرُ ثلاثمئة إطارٍ لا يُعيد تخصيصَ لوحةٍ لكلّ إطار.
  const open = shutterIsOpen(shutter) && frameInterval > 0;
  let sampleCtx: CanvasRenderingContext2D | null = null;
  if (open) {
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = w;
    sampleCanvas.height = h;
    sampleCtx = sampleCanvas.getContext('2d');
    if (!sampleCtx) throw new Error('تعذر إنشاء سطح عيّنات الغالق (canvas 2D context)');
  }
  try {
    for (let i = 0; i < frameTimes.length; i++) {
      if (!open || !sampleCtx) {
        await paintArtboardFrame(ctx, { ...spec, time: frameTimes[i] }, w, h);
      } else {
        const times = shutterSampleTimes(frameTimes[i], frameInterval, shutter);
        for (let k = 0; k < times.length; k++) {
          await paintArtboardFrame(sampleCtx, { ...spec, time: times[k] }, w, h);
          // أوّلُ عيّنةٍ تَحُلّ محلَّ ما كان لا تُركَّب فوقه. و`clearRect` في
          // `paintArtboardFrame` يَمسح لوحةَ العيّنات وحدَها لا لوحةَ التجميع،
          // فالمسحُ هنا شرطٌ لا تكرار.
          //
          // **وأثرُه يَظهر في التصدير الشفّاف وحدَه، وهذا قيس.** رُفع هذا السطرُ
          // فبقي المُخرَجُ مطابقًا بايتًا ببايت على مستندٍ معتم: العيّنةُ المعتمةُ
          // تُغطّي كلَّ بكسلٍ بـ`source-over` عند `globalAlpha = 1`، فتَمحو ما
          // تحتها بلا مسح. أمّا مع `transparent: true` — وهو مسارُ GIF — فبكسلٌ
          // شفّافٌ لا يَمحو ما تحته، فيَتسرّب الإطارُ السابقُ بوزن ½ إلى الذي
          // بعده. والقياسُ في `qa/motion-blur.spec.mjs` §٢، على مستندٍ شفّافٍ
          // قصدًا: على المعتم لا قدرةَ للاختبار على رؤية هذا السطر أصلًا.
          if (k === 0) {
            ctx.globalAlpha = 1;
            ctx.clearRect(0, 0, w, h);
          } else {
            ctx.globalAlpha = runningMeanAlpha(k);
          }
          ctx.drawImage(sampleCtx.canvas, 0, 0);
        }
        ctx.globalAlpha = 1;
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('فشل إنشاء إطار'))), 'image/png');
      });
      await onFrame(blob, i);
    }
  } finally {
    resetLottieExportEngine();
    resetVideoExportEngine();
    resetExportImageCache();
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A fill layer's 2-stop linear gradient as a standalone SVG `<linearGradient>` def,
 * referenced by the caller via `fill="url(#id)"` — the SVG-export equivalent of
 * `buildLinearGradient` in `appearance.ts` (same angle/from/to, SVG's own gradient
 * machinery instead of a `CanvasGradient`).
 *
 * بإحداثيّات الصندوق نفسه (`userSpaceOnUse`، والعنصر مرسومٌ في `0..bw × 0..bh` داخل
 * مجموعته) وبخطّ CSS نفسه (`cssGradientLine`): كان `objectBoundingBox` مع
 * `rotate(angle)` — زاويةُ رياضيّات (٠ نحو اليمين) لا زاوية CSS التي تعرضها اللوحة،
 * وتدويرٌ في فضاءٍ مُطبَّع ينحرف على أيّ صندوقٍ غير مربّع. */
function svgGradientDef(grad: { angle: number; from: string; to: string; type?: 'linear' | 'radial' }, id: string, bw: number, bh: number): string {
  if (grad.type === 'radial') {
    return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${bw / 2}" cy="${bh / 2}" r="${Math.max(1, Math.min(bw, bh) / 2)}"><stop offset="0" stop-color="${grad.from}" /><stop offset="1" stop-color="${grad.to}" /></radialGradient>`;
  }
  const l = cssGradientLine(grad.angle, bw, bh);
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${l.x0}" y1="${l.y0}" x2="${l.x1}" y2="${l.y1}"><stop offset="0" stop-color="${grad.from}" /><stop offset="1" stop-color="${grad.to}" /></linearGradient>`;
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
/** و**ضبابيّةُ العنصر تَدخل هذا المُنشِئَ نفسَه ولا تَفتح `<filter>` ثانيًا** —
 * لأنّ `filter` خصيصةٌ واحدةٌ على `<g>` الواحد: ثانيةٌ تَطرد الأولى صامتةً. فالبناءُ
 * واحدٌ: ظلالٌ خارجيّةٌ (إن وُجدت) تُدمَج خلف `SourceGraphic`، ثم يُضبَّب
 * **المُركَّبُ كلُّه** بـ`feGaussianBlur` واحدةٍ في النهاية — وهو عينُ ترتيب CSS
 * `filter`، لا ترتيبُ `ctx.filter` الذي يُضبّب كلَّ عمليّةٍ على حدتها.
 *
 * و`stdDeviation` تأخذ نصفَ القطر **كما هو**: CSS `blur(Npx)` مُعرَّفٌ انحرافًا
 * معياريًّا `N`، بخلاف `box-shadow` الذي نصفُ قطره ضِعفُ الانحراف — ولذلك يَقسم
 * الظلُّ أدناه على اثنين وهذه لا تَقسم.
 *
 * **ومنطقةُ الفلتر تُوسَّع بالحساب لا بالتمنّي**: تمويهٌ جاوسيٌّ يَحتاج نحو
 * `3σ` من كلّ جهة، ونصفُ القطر هنا كسرٌ من **عرض اللوح** لا من صندوق العنصر، فقد
 * يَفوق الصندوقَ نفسَه أضعافًا. والمنطقةُ الثابتةُ `-60% / 220%` كانت ستَقصّ ذلك
 * قصًّا حادًّا — وهو أسوأُ عطلٍ ممكن: ضبابيّةٌ ذاتُ حدٍّ حادّ. */
function svgOuterShadowFilter(shadows: ResolvedShadowPaint[], id: string, blurPx = 0, bw = 0, bh = 0): string {
  const outer = shadows.filter((s) => s.kind === 'outer');
  if (!outer.length && blurPx <= 0) return '';
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
  const mergeStage = `<feMerge result="merged">${merge.join('')}</feMerge>`;
  // الضبابيّةُ آخرَ الكومة، على المُركَّب — فتَلين الظلالُ والتعبئةُ والحدُّ معًا.
  const blurStage = blurPx > 0 ? `<feGaussianBlur in="merged" stdDeviation="${blurPx.toFixed(3)}" />` : '';
  // `3σ` من كلّ جهةٍ، منسوبةً إلى صندوق العنصر لأنّ منطقةَ الفلتر بالنِّسَب.
  const padX = blurPx > 0 && bw > 0 ? (3 * blurPx) / bw : 0;
  const padY = blurPx > 0 && bh > 0 ? (3 * blurPx) / bh : 0;
  const offX = -(0.6 + padX) * 100;
  const offY = -(0.6 + padY) * 100;
  const region = `x="${offX.toFixed(1)}%" y="${offY.toFixed(1)}%" width="${(100 - 2 * offX).toFixed(1)}%" height="${(100 - 2 * offY).toFixed(1)}%"`;
  return `<filter id="${id}" ${region}>${prims.join('')}${mergeStage}${blurStage}</filter>`;
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

  // لحظةُ هذا الملفّ الساكن — نفسُ ما يُحلّ عنده كلُّ ما يأخذ زمنًا أدناه.
  const svgTime = spec.time ?? settledTimeOf(spec);
  for (const rawEl of spec.elements) {
    const el = withCounterAt(rawEl, svgTime);
    if (!el.visible) continue;
    if (el.type === 'audio') continue; // لا صورةَ للصوت.
    // المؤثّراتُ للقُماش والفيديو وحدهما؛ ملفُّ SVG ساكنٌ لا زمنَ فيه — قيدٌ مُعلَن.
    if (el.type === 'fx') continue;
    // SVG لا يحمل حركةً (انظر التعليق على `svgBlurPx`)، لكنّ **الظهورَ** ليس حركة:
    // عنصرٌ محدودٌ بمقطعه غائبٌ عن هذه اللحظة غائبٌ عن الملفّ، كما في PNG.
    if (!clipShowsAt(el.anim, svgTime)) continue;
    const x = el.geo.x * w;
    const y = el.geo.y * h;
    const bw = el.geo.w * w;
    const bh = el.geo.h * h;
    const transform = `translate(${x} ${y}) rotate(${el.geo.rotation} ${bw / 2} ${bh / 2})`;
    const opacity = (el.opacity ?? 100) / 100;
    // ضبابيّةُ العنصر بالبكسل في فضاء المستخدم: كسرٌ من **عرض اللوح** كما في
    // الرسّامتَين الأخريَين، فتُضرَب في `w`.
    //
    // **والمسارُ المتحرّكُ غائبٌ هنا عن قصدٍ مُعلَن**: `renderArtboardSvg` لا
    // تُطبّق أيَّ حالةِ حركةٍ إطلاقًا — لا إزاحةً ولا مقياسًا ولا دورانًا ولا
    // عتامةً — فسطرُ `transform` أعلاه من `geo` وحدها ولا تُنادى `entranceVisualAt`
    // قطّ. فجوةٌ قائمةٌ من قبل هذا البند ومُسجَّلةٌ في `af23c63`، والضبابيّةُ
    // تَرِثها كما وَرِثها المقياسُ: ما يَظهر في SVG هو نصفُ القطر **الساكن** وحده.
    const svgBlurPx = Math.max(0, el.blur ?? 0) * w;

    /** فلترُ ضبابيّةٍ **وحدَه**، للفروع التي لا تَبني فلترًا أصلًا.
     *
     * أربعةُ فروعٍ تُنبعِث `<g>` بلا `filter` قطُّ: لوتي، ولقطةُ الفيديو، وصندوقُ
     * الصورة البديل، والنصُّ على منحنى. ولا ظلَّ لواحدٍ منها — قيدٌ قائمٌ من قبل
     * هذا البند. فلو تُرِكت هكذا لخرج عنصرٌ **مُضبَّبٌ في المعاينة وفي PNG،
     * حادٌّ في SVG**: عطلٌ يُحدِثه هذا البندُ لا يَرِثه، فيُسَدّ.
     *
     * ومُعرَّفُه مستقلٌّ (`blur-…` لا `shadow-…`) فلا يَتعارض مع فلتر الظلّ متى
     * بَناه فرعٌ آخر. وقيدُ الظلّ في هذه الفروع يبقى كما كان مُعلَنًا: هذا يَحمل
     * الضبابيّةَ وحدَها. */
    const blurOnlyId = `blur-${esc(el.id)}`;
    const blurOnlyAttr = (): string => {
      if (svgBlurPx <= 0) return '';
      parts.push(svgOuterShadowFilter([], blurOnlyId, svgBlurPx, bw, bh));
      return ` filter="url(#${blurOnlyId})"`;
    };

    // Generic clipping mask: any element kind gets a clip-path on its own outer <g>, from
    // the same `maskClipLocal` the canvas/DOM paths use — the mask's real outline, in this
    // element's local frame. Static geometry (`time: null`): SVG carries no motion for any
    // element, so neither does the mask.
    let maskClipAttr = '';
    if (el.maskId) {
      const maskEl = spec.elements.find((m) => m.id === el.maskId && m.type === 'shape') as ShapeElement | undefined;
      if (maskEl) {
        const clip = maskClipLocal(el, maskEl, { w, h }, null);
        if (clip) {
          const maskClipId = `mask-${esc(el.id)}`;
          parts.push(`<clipPath id="${maskClipId}"><path d="${commandsToSvgPath(clip.cmds, 1, 1)}"${clip.evenOdd ? ' clip-rule="evenodd"' : ''} /></clipPath>`);
          maskClipAttr = ` clip-path="url(#${maskClipId})"`;
        }
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
        const frameCanvas = getLottieExportFrame(el.id, el.data, bw, bh, svgTime, el.loop);
        const dataUrl = frameCanvas.toDataURL('image/png');
        parts.push(`<g transform="${transform}" opacity="${opacity}"${maskClipAttr}${blurOnlyAttr()}><image href="${dataUrl}" x="0" y="0" width="${bw}" height="${bh}" /></g>`);
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
        parts.push(`<g transform="${transform}" opacity="${opacity}"${maskClipAttr}${blurOnlyAttr()}><image href="${el.poster}" x="0" y="0" width="${bw}" height="${bh}" /></g>`);
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
        const shadowFilter = svgOuterShadowFilter(resolved.shadows, shadowId, svgBlurPx, bw, bh);
        const filterAttr = shadowFilter ? ` filter="url(#${shadowId})"` : '';
        if (shadowFilter) parts.push(shadowFilter);
        parts.push(
          `<g transform="${transform}" opacity="${opacity}"${maskClipAttr}${filterAttr}><g clip-path="url(#${clipId})"><image href="${esc(el.src)}" x="${layout.tx}" y="${layout.ty}" width="${layout.dw}" height="${layout.dh}"${flipTransform} /></g>${strokeSvg}</g>`,
        );
      } else if (spec.placeholders === 'block') {
        parts.push(`<g transform="${transform}" opacity="${opacity}"${maskClipAttr}${blurOnlyAttr()}><rect width="${bw}" height="${bh}" rx="${w * 0.02}" fill="${spec.palette.fg}" fill-opacity="0.1" /></g>`);
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
              defs.push(svgGradientDef(f.gradient, gid, bw, bh));
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
        shadowFilter = svgOuterShadowFilter(resolved.shadows, shadowId, svgBlurPx, bw, bh);
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
      // فرعُ المسار المرسومِ باليد لا يُسنِد فلترَ ظلٍّ إطلاقًا (قيدٌ قائمٌ من قبل،
      // مُوثَّقٌ أعلى هذا الفرع)، فلو تُرِك هكذا لخرج مسارٌ **مُضبَّبٌ في المعاينة
      // حادًّا في SVG** — عطلٌ أُحدِثه هذا البند لا أرِثه. فالضبابيّةُ وحدَها
      // تُسنَد هنا متى لم يَبنِ الفرعُ فلترًا، وقيدُ الظلّ يبقى كما كان مُعلَنًا.
      if (!shadowFilter && svgBlurPx > 0) shadowFilter = svgOuterShadowFilter([], shadowId, svgBlurPx, bw, bh);
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
        gradientDef = svgGradientDef(topFill.gradient, gid, bw, bh);
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
        parts.push(`${gradientDef}<g transform="${transform}" opacity="${opacity}"${maskClipAttr}${blurOnlyAttr()}><path d="${d}" fill="${fillAttr}" fill-opacity="${topFill?.opacity ?? 1}" /></g>`);
      } else {
        const startIsRight = dir === 'rtl';
        const anchor = el.halign === 'start' ? (startIsRight ? 'end' : 'start') : el.halign === 'end' ? (startIsRight ? 'start' : 'end') : 'middle';
        const textX = el.halign === 'start' ? (startIsRight ? bw : 0) : el.halign === 'end' ? (startIsRight ? 0 : bw) : bw / 2;
        const textY = el.valign === 'top' ? fontPx * 0.9 : el.valign === 'middle' ? bh / 2 : bh - fontPx * 0.3;
        const weightNum = WEIGHT_CSS[el.weight];
        const strokeAttr = topStroke ? ` stroke="${topStroke.color}" stroke-opacity="${topStroke.opacity}" stroke-width="${topStroke.width}"` : '';
        const shadowId = `shadow-${esc(el.id)}`;
        const shadowFilter = svgOuterShadowFilter(resolved.shadows, shadowId, svgBlurPx, bw, bh);
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
