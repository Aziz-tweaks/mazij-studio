// ─────────────────────────────────────────────────────────────────────────────
// رسمُ الخطّ تدريجيًّا — قصُّ المسار بطول قوسه (٢٥ أكتوبر ٢٠٢٦)
// ─────────────────────────────────────────────────────────────────────────────
//
// **لِمَ.** مقطعٌ طُلب نسخُه يرسم سيفًا خطًّا خطًّا ثم دائرةً حمراءَ حول السيف في صورة
// المتحف: الخطُّ **ينمو** على طوله. وهذا ما يسمّيه After Effects «Trim Paths»: قيمتان
// متحرّكتان (البداية والنهاية) كسرًا من طول المسار، والمرسومُ ما بينهما.
//
// **ولِمَ مسارٌ مقصوصٌ لا تقطيعُ الحدّ (`stroke-dasharray`/`setLineDash`).** التقطيعُ
// أقصرُ كودًا وأكذبُ في ثلاثة مواضع:
//   ١. المعاينةُ ترسم الحدَّ بـ`vector-effect: non-scaling-stroke` داخل `viewBox`
//      غير متناسب، وأطوالُ التقطيع حينها تُقاس في فضاءٍ يختلف بين المحرّكات — ومزيج
//      يُشحَن على WebKit ويُقاس على Chromium.
//   ٢. الحدُّ متغيّرُ السُّمك ليس حدًّا أصلًا بل مضلَّعٌ معبَّأ (`variableStroke.ts`)،
//      فلا تقطيعَ له.
//   ٣. طولُ `ctx.ellipse` و`roundRect` لا يعرفه أحدٌ إلّا بتقريب.
// فالقصُّ هنا هندسيّ: يُقاس طولُ كلّ قطعةٍ في **بكسل الصندوق**، ويُقسَم منحنى بيزيه عند
// المعامل المقابل للطول (دي كاستلجو)، فيخرج **مسارٌ حقيقيّ** ترسمه الرسّاماتُ الثلاث
// بالسطر الذي ترسم به أيَّ مسار. وطرفاه يأخذان نهايةَ الحدّ كما هي (`butt`).
//
// **والمسارُ ذو الأجزاء** (أكثر من `M`) يُقَصّ كلُّ جزءٍ منه بالكسرين نفسيهما — وهو
// افتراضُ After Effects («Trim Multiple Shapes: Simultaneously»)، فخطّا سيفٍ مرسومان
// معًا ينموان معًا.

import type { PathCmd } from './pathGeometry';

interface Pt {
  x: number;
  y: number;
}

type Seg = { kind: 'L'; p0: Pt; p1: Pt } | { kind: 'C'; p0: Pt; c1: Pt; c2: Pt; p1: Pt };

/** عيّناتُ قياس الطول لكلّ منحنًى تكعيبيّ — رقمُ `variableStroke.ts` و`pathBoolean.ts`
 * نفسُه (٢٤)، وجدولُ «الطول ← المعامل» يُبنى منها. */
const SAMPLES = 24;

function cubicAt(s: Extract<Seg, { kind: 'C' }>, t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * s.p0.x + b * s.c1.x + c * s.c2.x + d * s.p1.x, y: a * s.p0.y + b * s.c1.y + c * s.c2.y + d * s.p1.y };
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** الجزءُ من المنحنى بين المعاملين `t0..t1` — قسمتا دي كاستلجو متتاليتان. */
function cubicPart(s: Extract<Seg, { kind: 'C' }>, t0: number, t1: number): Extract<Seg, { kind: 'C' }> {
  // القسمةُ الأولى عند t1: الجزءُ الأيسر [0, t1].
  const ab = lerp(s.p0, s.c1, t1);
  const bc = lerp(s.c1, s.c2, t1);
  const cd = lerp(s.c2, s.p1, t1);
  const abc = lerp(ab, bc, t1);
  const bcd = lerp(bc, cd, t1);
  const m = lerp(abc, bcd, t1);
  const left: Extract<Seg, { kind: 'C' }> = { kind: 'C', p0: s.p0, c1: ab, c2: abc, p1: m };
  if (t0 <= 0) return left;
  // ثم داخل الأيسر عند t0/t1: الجزءُ الأيمن منه.
  const u = t1 > 0 ? t0 / t1 : 0;
  const ab2 = lerp(left.p0, left.c1, u);
  const bc2 = lerp(left.c1, left.c2, u);
  const cd2 = lerp(left.c2, left.p1, u);
  const abc2 = lerp(ab2, bc2, u);
  const bcd2 = lerp(bc2, cd2, u);
  const m2 = lerp(abc2, bcd2, u);
  return { kind: 'C', p0: m2, c1: bcd2, c2: cd2, p1: left.p1 };
}

interface Measured {
  seg: Seg;
  len: number;
  /** للمنحنى: الطولُ التراكميّ عند العيّنة `i/SAMPLES` (بالبكسل)، `SAMPLES+1` قيمة. */
  table?: Float64Array;
}

/** طولُ القطعة **بالبكسل** — والإحداثيّاتُ كسورٌ من الصندوق تُضرَب في `(bw, bh)` قبل
 * القياس، لأنّ صندوقًا عرضُه أربعةُ أضعاف ارتفاعه يجعل وحدةَ الكسر الأفقيّة أطولَ: لو
 * قيس الطولُ في الكسور لنما الخطُّ أسرعَ في اتّجاهٍ منه في الآخر. */
function measure(seg: Seg, bw: number, bh: number): Measured {
  const d = (a: Pt, b: Pt) => Math.hypot((b.x - a.x) * bw, (b.y - a.y) * bh);
  if (seg.kind === 'L') return { seg, len: d(seg.p0, seg.p1) };
  const table = new Float64Array(SAMPLES + 1);
  let prev = seg.p0;
  for (let i = 1; i <= SAMPLES; i++) {
    const p = cubicAt(seg, i / SAMPLES);
    table[i] = table[i - 1] + d(prev, p);
    prev = p;
  }
  return { seg, len: table[SAMPLES], table };
}

/** المعاملُ المقابل لطولٍ داخل القطعة — خطّيٌّ بين عيّنتين في الجدول. */
function paramAtLength(m: Measured, l: number): number {
  if (m.len <= 0) return 0;
  if (m.seg.kind === 'L' || !m.table) return Math.max(0, Math.min(1, l / m.len));
  const t = m.table;
  if (l <= 0) return 0;
  if (l >= t[SAMPLES]) return 1;
  let lo = 0;
  let hi = SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < l) lo = mid;
    else hi = mid;
  }
  const span = t[hi] - t[lo];
  const f = span > 0 ? (l - t[lo]) / span : 0;
  return (lo + f) / SAMPLES;
}

function partOf(m: Measured, l0: number, l1: number): Seg {
  const t0 = paramAtLength(m, l0);
  const t1 = paramAtLength(m, l1);
  if (m.seg.kind === 'L') return { kind: 'L', p0: lerp(m.seg.p0, m.seg.p1, t0), p1: lerp(m.seg.p0, m.seg.p1, t1) };
  return cubicPart(m.seg, t0, t1);
}

/** يقسّم الأوامر إلى أجزاء (`M` يبدأ جزءًا)، كلُّ جزءٍ قطعٌ مستقيمةٌ ومنحنيات. والإغلاقُ
 * (`Z`) قطعةٌ مستقيمةٌ إلى أوّل الجزء متى لم يكن عنده — فهو طولٌ يُرسَم كغيره. */
function subpathsOf(cmds: PathCmd[]): { segs: Seg[]; closed: boolean }[] {
  const out: { segs: Seg[]; closed: boolean }[] = [];
  let cur: { segs: Seg[]; closed: boolean } | null = null;
  let start: Pt | null = null;
  let last: Pt | null = null;
  for (const c of cmds) {
    if (c.c === 'M') {
      cur = { segs: [], closed: false };
      out.push(cur);
      start = { x: c.x, y: c.y };
      last = start;
    } else if (c.c === 'L' && cur && last) {
      const p1 = { x: c.x, y: c.y };
      cur.segs.push({ kind: 'L', p0: last, p1 });
      last = p1;
    } else if (c.c === 'C' && cur && last) {
      const p1 = { x: c.x, y: c.y };
      cur.segs.push({ kind: 'C', p0: last, c1: { x: c.x1, y: c.y1 }, c2: { x: c.x2, y: c.y2 }, p1 });
      last = p1;
    } else if (c.c === 'Z' && cur && last && start) {
      if (last.x !== start.x || last.y !== start.y) cur.segs.push({ kind: 'L', p0: last, p1: start });
      cur.closed = true;
      last = start;
    }
  }
  return out;
}

/** **المسارُ بين كسرَي طوله** `start..end` (٠..١) — كلُّ جزءٍ على حدة.
 *
 * `start ≥ end` لا يرسم شيئًا (قائمةٌ فارغة). و`0..1` يُعيد الأوامرَ نفسَها **بلا لمس**
 * — بإغلاقها (`Z`) كما هو — فمسارٌ لا قصَّ عليه يُرسَم بالبايتات التي كان يُرسَم بها.
 * والكسرانِ يُقصَران على ٠..١. */
export function trimPathCmds(cmds: PathCmd[], start: number, end: number, bw: number, bh: number): PathCmd[] {
  const s = Math.max(0, Math.min(1, start));
  const e = Math.max(0, Math.min(1, end));
  if (s <= 0 && e >= 1) return cmds;
  if (e <= s) return [];
  const out: PathCmd[] = [];
  for (const sub of subpathsOf(cmds)) {
    const measured = sub.segs.map((sg) => measure(sg, bw, bh));
    const total = measured.reduce((a, m) => a + m.len, 0);
    if (!(total > 0)) continue;
    const a = s * total;
    const b = e * total;
    let acc = 0;
    let open = false;
    for (const m of measured) {
      const L0 = acc;
      const L1 = acc + m.len;
      acc = L1;
      const lo = Math.max(a, L0);
      const hi = Math.min(b, L1);
      if (hi <= lo || m.len <= 0) continue;
      const part = partOf(m, lo - L0, hi - L0);
      if (!open) {
        out.push({ c: 'M', x: part.p0.x, y: part.p0.y });
        open = true;
      }
      if (part.kind === 'L') out.push({ c: 'L', x: part.p1.x, y: part.p1.y });
      else out.push({ c: 'C', x1: part.c1.x, y1: part.c1.y, x2: part.c2.x, y2: part.c2.y, x: part.p1.x, y: part.p1.y });
    }
  }
  return out;
}

/** أفيه قصٌّ يُرى؟ — الحالةُ المحايدة (٠..١) لا تُغيّر سطرًا في أيّ رسّامة. والتسامحُ
 * جزءٌ من المليون من الطول: منحنى تخفيفٍ يقترب من ١ في آخر مقطعته يُعطي ٠٫٩٩٩٩٩٩٩ —
 * قصٌّ لا يُرى في أيّ بكسل، ولا يجوز أن يُبدّل مسارَ الرسم. */
export function isTrimmed(start: number, end: number): boolean {
  return start > 1e-6 || end < 1 - 1e-6;
}
