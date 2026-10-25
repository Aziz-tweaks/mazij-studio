// ─────────────────────────────────────────────────────────────────────────────
// القناع: شكلُه أيُّ شكل، وحركتُه حركتُه — ٢٥ أكتوبر ٢٠٢٦
// ─────────────────────────────────────────────────────────────────────────────
//
// **ما كان.** «قص بالشكل» يأخذ صندوقَ القناع **الساكن** ويرسم منه مستطيلًا أو بيضة
// (`maskLocalPolygonPoints` في `geometry.ts`) — فمسارٌ مرسومٌ بالقلم أو مضلّعٌ خماسيّ أو
// مستطيلٌ مدوَّر الزوايا كان يقصّ **مستطيلَ صندوقه**، ولا أثرَ لحركة القناع إطلاقًا. وكان
// القصُّ يُطبَّق في إطار العنصر **بعد** تحويله المتحرّك، فإذا انزلق العنصرُ انزلق قناعُه
// معه.
//
// **وما طلبه مقطعٌ حقيقيّ.** نسخُ مقطعٍ من ٤٤ ثانية (١٨ مشهدًا) يحتاج القناعَ في ثلاثة
// أدوار لا يقدر عليها ما كان:
//   ١. **صورةٌ داخل مخمّس** — القناعُ مضلّعٌ لا مستطيل.
//   ٢. **ملصقٌ يُمسَح من اليمين** وصورةٌ تنكشف من خطٍّ إلى إطار — القناعُ **يتحرّك وحده**
//      والمحتوى ثابت.
//   ٣. **شخصيّةٌ تصعد من أسفل إطارها وتكسره من أعلاه** — المحتوى **يتحرّك وحده** والقناعُ
//      ثابت؛ ولو تحرّك القناعُ مع الشخصيّة ما ظهر منها شيءٌ قطّ.
// وهذه بعينها دلالةُ «مطفأة المسار» (track matte) في After Effects: الطبقتان مستقلّتان،
// ولكلٍّ حركتُها.
//
// **فالقرار:** القناعُ يُحسَب في فضاء اللوح من **شكله الحقيقيّ** (`rect` بنصف قطره، و
// `ellipse`، و`path` بمنحنياته ومناطقه) و**تحويله الكامل عند اللحظة** (الهندسة الساكنة
// ثم حركته)، ثم يُعاد إلى إطار العنصر المقصوص بمقلوب تحويله هو عند اللحظة نفسها. فيبقى
// القصُّ حيث يقول القناع أيًّا كانت حركةُ المحتوى. والصيغةُ واحدةٌ هنا تقرؤها الرسّاماتُ
// الثلاث (المعاينة، والقُماش، وSVG) — فلا يختلف ما يُرى عمّا يُصدَّر.
//
// **وما لا يتغيّر:** قناعٌ ساكنٌ على عنصرٍ ساكن يقصّ ما كان يقصّه بالضبط إن كان مستطيلًا
// أو بيضة (المستطيلُ نفسُه، والبيضةُ منحنياتٌ حقيقيّة بدل ٤٨ ضلعًا).

import type { DocElement, ShapeElement } from '../state/elements';
import { effectiveScale, resolveAnimAt, type AnimVisual } from './animTimeline';
import { ellipsePathCmds, pathElementCommands, roundRectPathCmds, type PathCmd } from './pathGeometry';

/** مصفوفةٌ تآلفيّة ثنائيّة الأبعاد بترتيب `DOMMatrix`: `(x, y) → (a·x + c·y + e, b·x + d·y + f)`. */
export interface Mat2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Mat2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** `m · n` — تُطبَّق `n` أوّلًا. */
export function matMul(m: Mat2D, n: Mat2D): Mat2D {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

const translateM = (x: number, y: number): Mat2D => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
const scaleM = (sx: number, sy: number): Mat2D => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
/** دورانٌ باتجاه عقارب الساعة على الشاشة (المحور الصادي نازل) — كـCSS `rotate()` و`ctx.rotate`. */
function rotateM(deg: number): Mat2D {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/** المقلوب، أو `null` لمصفوفةٍ لا مقلوبَ لها (مقياسٌ صفريٌّ على محور). */
export function matInvert(m: Mat2D): Mat2D | null {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export function matApply(m: Mat2D, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/** **تحويلُ العنصر الكامل**: من إطاره المحلّيّ (بكسلات صندوقه، الأصلُ زاويتُه العليا اليسرى)
 * إلى بكسلات اللوح — بالتركيب الذي يكتبه `drawElements` حرفًا، وهو تركيبُ CSS في المعاينة
 * (`rotate(الساكن) translate(…) scale(…) rotate(المتحرّك)` حول المركز):
 *
 *     T(مركز) · R(geo) · T(إزاحة الحركة) · S(المقياس الفعليّ) · R(دوران الحركة) · T(−نصف الصندوق)
 *
 * و`visual` غائبٌ = الهندسةُ الساكنة وحدها (ما يرسمه SVG، الذي لا يحمل حركة). */
export function elementMatrix(el: Pick<DocElement, 'geo'>, size: { w: number; h: number }, visual: AnimVisual | null): Mat2D {
  const bw = el.geo.w * size.w;
  const bh = el.geo.h * size.h;
  const cx = el.geo.x * size.w + bw / 2;
  const cy = el.geo.y * size.h + bh / 2;
  let m = matMul(translateM(cx, cy), rotateM(el.geo.rotation));
  if (visual) {
    // الإزاحةُ كسرٌ من **عرض** اللوح على المحورين — وحدة `cqw` نفسُها في المعاينة.
    if (visual.x !== 0 || visual.y !== 0) m = matMul(m, translateM(visual.x * size.w, visual.y * size.w));
    const { sx, sy } = effectiveScale(visual);
    if (sx !== 1 || sy !== 1) m = matMul(m, scaleM(sx, sy));
    if (visual.rotation !== 0) m = matMul(m, rotateM(visual.rotation));
  }
  return matMul(m, translateM(-bw / 2, -bh / 2));
}

/** حدُّ شكل القناع **في إطاره المحلّيّ** (بكسلات صندوقه). مستطيلٌ بنصف قطره كما يرسمه
 * (`Math.min(bw, bh) × radius`)، وبيضةٌ، ومسارٌ بمنحنياته ومناطقه — والمسارُ المفتوحُ يُغلَق
 * كما يُغلَق كلُّ مسارٍ يُعبَّأ. و`null` لشكلٍ لا حدَّ له (مسارٌ بلا نقاط). */
export function maskShapeLocalCmds(mask: ShapeElement, bw: number, bh: number): { cmds: PathCmd[]; evenOdd: boolean } | null {
  if (mask.shape === 'ellipse') return { cmds: ellipsePathCmds(0, 0, bw, bh), evenOdd: false };
  if (mask.shape === 'rect') return { cmds: roundRectPathCmds(0, 0, bw, bh, Math.min(bw, bh) * (Number.isFinite(mask.radius) ? mask.radius : 0)), evenOdd: false };
  const { cmds, multiRegion } = pathElementCommands(mask);
  if (!cmds.length) return null;
  const scaled: PathCmd[] = cmds.map((c) => {
    switch (c.c) {
      case 'M':
      case 'L':
        return { c: c.c, x: c.x * bw, y: c.y * bh };
      case 'C':
        return { c: 'C', x1: c.x1 * bw, y1: c.y1 * bh, x2: c.x2 * bw, y2: c.y2 * bh, x: c.x * bw, y: c.y * bh };
      case 'Z':
        return c;
    }
  });
  return { cmds: scaled, evenOdd: multiRegion };
}

function transformCmds(cmds: PathCmd[], m: Mat2D): PathCmd[] {
  return cmds.map((c) => {
    switch (c.c) {
      case 'M':
      case 'L': {
        const p = matApply(m, c.x, c.y);
        return { c: c.c, x: p.x, y: p.y };
      }
      case 'C': {
        const p1 = matApply(m, c.x1, c.y1);
        const p2 = matApply(m, c.x2, c.y2);
        const p = matApply(m, c.x, c.y);
        return { c: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
      }
      case 'Z':
        return c;
    }
  });
}

/** **حدُّ القناع في إطار العنصر المقصوص** — الجوابُ الواحد للرسّامات الثلاث.
 *
 * `time` رقمٌ = تُحَلّ حركةُ القناع وحركةُ العنصر عند تلك اللحظة (المعاينة والقُماش).
 * `time` `null` = الهندسةُ الساكنة للاثنين (SVG، الذي لا يحمل حركةً لأيّ عنصر — فجوةٌ
 * قائمةٌ مكتوبةٌ عند `renderArtboardSvg`).
 *
 * والناتجُ بكسلاتٌ في صندوق العنصر قبل تحويله: يُرسَم حيث يُرسَم العنصرُ نفسُه، فيُطبَّق
 * عليه تحويلُ العنصر فيعود إلى مكان القناع على اللوح — أي يبقى القصُّ حيث القناعُ أيًّا
 * كانت حركةُ المحتوى. وعنصرٌ مقياسُه صفرٌ لا يُرى أصلًا ولا مقلوبَ لتحويله: يُعاد حدٌّ
 * فارغ فيُقَصّ كلُّه، وهو الصحيح. */
export function maskClipLocal(target: Pick<DocElement, 'geo' | 'anim'>, mask: ShapeElement, size: { w: number; h: number }, time: number | null): { cmds: PathCmd[]; evenOdd: boolean } | null {
  const mbw = mask.geo.w * size.w;
  const mbh = mask.geo.h * size.h;
  const local = maskShapeLocalCmds(mask, mbw, mbh);
  if (!local) return null;
  const maskM = elementMatrix(mask, size, time === null ? null : resolveAnimAt(mask.anim, time));
  const targetM = elementMatrix(target, size, time === null ? null : resolveAnimAt(target.anim, time));
  const inv = matInvert(targetM);
  if (!inv) return { cmds: [], evenOdd: false };
  return { cmds: transformCmds(local.cmds, matMul(inv, maskM)), evenOdd: local.evenOdd };
}

export { IDENTITY as IDENTITY_MAT };
