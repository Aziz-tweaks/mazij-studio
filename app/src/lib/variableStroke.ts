import type { PathCmd } from './pathGeometry';

/** حدٌّ متغيّر السُّمك: المركزُ مُزاحًا ±w(t)/2 ثم مُغلَقًا تعبئةً واحدة.
 *
 * **لماذا هذا الملفّ موجود.** لا SVG ولا Canvas2D يملك سُمكَ حدٍّ متغيّرًا:
 * `stroke-width` رقمٌ واحد لكلّ مسار في كليهما. فالخطّ الذي يدخل بعشرين بكسلًا
 * ويخرج شعرةً **لا يمكن** أن يكون حدًّا أصلًا — لا بد أن يصير **مضلَّعًا معبَّأً**:
 * يُعاد تشكيل الخطّ المركزيّ بطول القوس، وتُزاح كلُّ عيّنةٍ ±w(t)/2 على العموديّ،
 * ثم يُغلَق الجانبان في حلقةٍ واحدةٍ تُعبَّأ بقاعدة `nonzero`.
 *
 * وهذا بعينه ما انتهى إليه an open-source vector engine — وهو محرّرٌ مفتوح المصدر يواجه الحائط
 * نفسه — وقراءةُ مصدره هي ما وثّقته قياسٌ خارجيٌّ موثَّق. والمعمار
 * المأخوذ منه **فكرةً** (لا نقلًا): سَطِّح الخطّ المركزيّ إلى خطٍّ مكسَّر، أزِح
 * الخطَّ المكسَّر، ودعْ قاعدةَ التعبئة تحلّ التقاطع الذاتي. النقطة الأخيرة هي
 * أكبر وفرٍ في هذا الملفّ كلّه: حلقةٌ تتقاطع مع نفسها **لا تحتاج**
 * `polybooljs` — `nonzero` هي الافتراض في SVG وفي Canvas2D معًا، ومنطقةُ
 * التقاطع لفُّها ٢ فتُعبَّأ كما هي. ومحرّك متّجهات مفتوح نفسه يتجنّب العمليّة
 * البوليانيّة في مسار التصيير الساخن لهذا السبب عينه.
 *
 * **ولماذا لا `getPointAtLength`؟** `src/lib/textOnPath.ts` تقيس طول القوس
 * بـ`SVGPathElement` منفصل، وكان ذلك أقربَ طريقٍ ظاهريًّا. ورُفض لثلاثة أسباب:
 * (١) تصديرُ الفيديو ينادي `drawElements` **لكلّ إطار**، وتخصيصُ عنصر DOM لكلّ
 * إطارٍ لكلّ حدٍّ ثمنٌ لا مقابل له؛ (٢) دقّةُ `getPointAtLength` تختلف بين
 * محرّكات المتصفّحات، وهذا المستودع حارب تباعدَ «المعاينة ضدّ التصدير» ثلاث
 * مرّات فلا يُستحسن إدخالُ مصدرِ لادِقّةٍ جديد؛ (٣) دالّةٌ خالصةٌ بلا DOM
 * تُختبَر في Node مباشرةً. فالتسطيح هنا مكتوبٌ صريحًا على سابقة `cubicAt` في
 * `src/lib/pathBoolean.ts`.
 */

/** مَلمح العرض: معاملاتٌ (لا بكسلات) مضروبةٌ في `width` نفسه.
 *
 * ولماذا معاملات؟ لأن `width` يبقى حاملَ المعنى: المصمّم يكتب «٢٠» في الحقل
 * الذي يعرفه، والمَلمح يقول «ابدأ بكامله وانتهِ بعُشره». وثلاثُ فوائد تتبع
 * ذلك مجّانًا: «التحجيم الذكي» لا يحتاج سطرًا (المعامل بلا بُعد، فالملمح
 * ثابتٌ تحت أيّ مقاس — انظر `qa/variable-stroke-width.spec.mjs`)، وإخفاءُ
 * الملمح يعيد الحدَّ المنتظم بالضبط، وقيمةٌ واحدةٌ تضبط السُّمك كلّه.
 *
 * `mid` اختياريّ: `null` يعني «تدرّجٌ خطّيٌّ من الطرف إلى الطرف» — وهو الحدّ
 * الأدنى الذي يعيد خطًّا مرسومًا باليد يرقّ، وهو ما تحتاجه `t02` بالضبط. */
export interface StrokeWidthProfile {
  /** معامل العرض عند بداية المسار (t=0). */
  start: number;
  /** معامل العرض في منتصف طول القوس (t=0.5)، أو `null` فلا نقطة وسطى. */
  mid: number | null;
  /** معامل العرض عند نهاية المسار (t=1). */
  end: number;
}

/** القائمة الجاهزة. وهي مقتبسةٌ من `WidthProfile::PRESETS` في an open-source vector engine
 * (`crates/doc/src/appearance.rs:247-258`) — نفس الأسماء ونفس المعاملات لِما
 * يقابلها من أشكال، لأنها أشكالٌ صحيحةٌ مُختبَرة لا أرقامٌ تُخترَع من جديد.
 *
 * an open-source vector engine — Copyright (c) 2026 its upstream project Team and the an open-source vector engine
 * contributors — مرخّصٌ بـ MIT OR Apache-2.0. انظر قياسٌ خارجيٌّ موثَّق
 *
 * ومَلمحا `taperStart`/`lens` عند an open-source vector engine ينتهيان بمعامل صفر تامّ؛ وهنا
 * ٠٫٠٢ لا صفر، لأن الصفر التامّ يجعل الطرف نقطةً رياضيّةً تختفي عند التنقيط،
 * و٢٪ من عشرين بكسلًا = أربعة أعشار البكسل: شعرةٌ تُرى. */
export const WIDTH_PROFILE_PRESETS: Record<string, StrokeWidthProfile> = {
  taperEnd: { start: 1, mid: null, end: 0.02 },
  taperStart: { start: 0.02, mid: null, end: 1 },
  lens: { start: 0.02, mid: 1, end: 0.02 },
  pinch: { start: 1, mid: 0.25, end: 1 },
};

/** يُقَوِّم المَلمح عند `t` بخطٍّ مستقيمٍ بين نقاطه، ويُثبِّت القيمة خارج
 * طرفيه (لا يمدّها).
 *
 * مُقتبَسٌ من `WidthProfile::at_points` في an open-source vector engine
 * (`crates/doc/src/appearance.rs:231-245`): الاستقراء المُثبَّت خارج الطرفين،
 * وحَرَسُ المقام `max(1e-9)` حتى لا تقسم نقطتان متلاصقتان على صفر، وردُّ ١
 * (لا صفر) لِمَلمحٍ خالٍ — فغيابُ المَلمح حدٌّ منتظم لا حدٌّ معدوم.
 * an open-source vector engine — Copyright (c) 2026 its upstream project Team and the an open-source vector engine
 * contributors — MIT OR Apache-2.0. */
export function widthFactorAt(p: StrokeWidthProfile, t: number): number {
  const pts: Array<[number, number]> = p.mid == null ? [[0, p.start], [1, p.end]] : [[0, p.start], [0.5, p.mid], [1, p.end]];
  if (t <= pts[0][0]) return Math.max(0, pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, v0] = pts[i];
    const [t1, v1] = pts[i + 1];
    if (t <= t1) {
      const u = (t - t0) / Math.max(1e-9, t1 - t0);
      return Math.max(0, v0 + (v1 - v0) * u);
    }
  }
  return Math.max(0, pts[pts.length - 1][1]);
}

/** أقلُّ ما يلزم من طبقة حدٍّ لتُصنَّف. مكتوبٌ بنيويًّا (لا بـ`ResolvedStrokePaint`)
 * حتى لا يستورد هذا الملفّ `appearance.ts` التي تستورده — فالاثنان يبقيان
 * مستقلَّين، وتُختبَر الدالّتان أدناه في Node بلا أي من الاثنين. */
export interface WidthKindCandidate {
  width: number;
  widthProfile?: StrokeWidthProfile | null;
}

/** طبقةُ حدٍّ «متغيّرة» هي التي تحمل مَلمحًا وسُمكًا موجبًا. وخلوُّ المَلمح هو
 * الحالُ في كلّ مستندٍ حُفِظ قبل هذا البند، فتردّ `false` ويبقى ذلك المستند
 * يُرسَم بالحدِّ المرسوم كما كان بالحرف. */
export function isVariableStroke(s: WidthKindCandidate): boolean {
  return !!s.widthProfile && s.width > 0;
}

/** يفرز كومةَ الحدود إلى ما يُرسَم حدًّا وما يُعبَّأ مضلَّعًا، مع حفظ ترتيب
 * الكومة في كلٍّ منهما.
 *
 * و`isPath` شرطٌ لا زينة: المَلمح لا معنى له إلا لخطٍّ مركزيٍّ يُزاح، فطبقةٌ
 * حاملةٌ لمَلمحٍ على مستطيلٍ تُرسَم حدًّا منتظمًا — تجاهلٌ صريحٌ لا رسمٌ خاطئ.
 *
 * ووحدةُ هذه الدالّة هي ما يمنع تباعدَ الرسّامات: الثلاث كلُّها تفرز بها،
 * فلا تستطيع واحدةٌ أن تَعُدَّ طبقةً متغيّرةً وتَعُدَّها الأخرى منتظمة. */
export function splitStrokesByWidthKind<T extends WidthKindCandidate>(strokes: T[], isPath: boolean): { uniform: T[]; variable: T[] } {
  if (!isPath) return { uniform: strokes, variable: [] };
  const uniform: T[] = [];
  const variable: T[] = [];
  for (const s of strokes) (isVariableStroke(s) ? variable : uniform).push(s);
  return { uniform, variable };
}

/** عدد العيّنات لكلّ قطعة مكعّبة. و٢٤ هي نفس `BEZIER_SAMPLES_PER_SEGMENT` في
 * `src/lib/pathBoolean.ts` — نفس رتبة الخطأ المحسوبة في تعليقه، ونفسُ الرقم
 * في الملفّين أفضل من رقمين يختلفان بلا سبب. */
const SAMPLES_PER_CUBIC = 24;

/** نقطتان أقربُ من هذا في فضاء بكسل الصندوق تُعدّان واحدة. وحذفُها ليس تنظيفًا
 * تجميليًّا: قطعةٌ طولها صفر عموديُّها غير معرَّف (قسمةٌ على صفر)، فتُنتج
 * `NaN` يسري في المضلَّع كلّه فيختفي الحدُّ رأسًا. الفكرة من حَرَس `push` في
 * an open-source vector engine (`crates/effects/src/stroke/width.rs:53-58`). */
const DEDUP_EPS = 1e-6;

interface Pt {
  x: number;
  y: number;
}

function cubicAt(p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y };
}

interface FlatSubpath {
  pts: Pt[];
  closed: boolean;
}

/** يُسطِّح قائمةَ أوامرٍ (بكسورٍ من الصندوق) إلى خطوطٍ مكسَّرة في **بكسل
 * الصندوق** — `x·bw` و`y·bh`.
 *
 * والتحويل إلى البكسل قبل الإزاحة لا بعدها، وهذا شرطٌ لا تفصيل: صندوقٌ عرضه
 * ٨٠٠ وارتفاعه ٢٠٠ تكون فيه وحدةُ الكسر الأفقيّة أربعةَ أضعاف الرأسيّة، فإزاحةٌ
 * بمقدارٍ ثابتٍ في فضاء الكسور تعطي حدًّا **بيضاويّ** السُّمك: سميكًا رأسيًّا
 * ورقيقًا أفقيًّا. والرسّامات الثلاث كلُّها تضرب الكسور في (bw, bh) عند الرسم،
 * فالعودةُ إلى الكسور في آخر السطر تُبقي العقد كما هو. */
function flattenToPixelSubpaths(cmds: PathCmd[], bw: number, bh: number): FlatSubpath[] {
  const out: FlatSubpath[] = [];
  let cur: Pt[] = [];
  let closed = false;
  let last: Pt | null = null;

  const flush = () => {
    if (cur.length > 1) out.push({ pts: cur, closed });
    cur = [];
    closed = false;
  };
  const push = (p: Pt) => {
    const prev = cur[cur.length - 1];
    if (prev && Math.abs(prev.x - p.x) <= DEDUP_EPS && Math.abs(prev.y - p.y) <= DEDUP_EPS) return;
    cur.push(p);
  };

  for (const cmd of cmds) {
    switch (cmd.c) {
      case 'M': {
        flush();
        last = { x: cmd.x * bw, y: cmd.y * bh };
        cur = [last];
        break;
      }
      case 'L': {
        last = { x: cmd.x * bw, y: cmd.y * bh };
        push(last);
        break;
      }
      case 'C': {
        const p0 = last ?? { x: cmd.x1 * bw, y: cmd.y1 * bh };
        const c1 = { x: cmd.x1 * bw, y: cmd.y1 * bh };
        const c2 = { x: cmd.x2 * bw, y: cmd.y2 * bh };
        const p1 = { x: cmd.x * bw, y: cmd.y * bh };
        for (let i = 1; i <= SAMPLES_PER_CUBIC; i++) push(cubicAt(p0, c1, c2, p1, i / SAMPLES_PER_CUBIC));
        last = p1;
        break;
      }
      case 'Z': {
        closed = true;
        flush();
        break;
      }
    }
  }
  flush();
  return out;
}

/** العموديُّ الأيسر في فضاءٍ محوره y إلى الأسفل — «يسارَ اتّجاه السير».
 * نفس اصطلاح `left()` في an open-source vector engine (`crates/effects/src/stroke/width.rs:40-42`). */
function leftNormal(dx: number, dy: number): Pt {
  return { x: dy, y: -dx };
}

function unit(dx: number, dy: number): Pt {
  const h = Math.hypot(dx, dy);
  // صِفرٌ يردّ +x لا NaN: نفس حَرَس `unit` في an open-source vector engine
  // (`crates/geom/src/bez.rs:66-69`). و`NaN` واحدةٌ تُفقد المضلَّع كلَّه.
  return h > 1e-12 ? { x: dx / h, y: dy / h } : { x: 1, y: 0 };
}

/** حدُّ الميتر: زاويةٌ أحدُّ من هذا تُقصّ إلى شطفٍ (bevel) بدل شوكةٍ طويلة.
 * ٤ هو افتراض SVG `stroke-miterlimit` نفسه، فالحدُّ المعبَّأ يتصرّف كالحدِّ
 * المرسوم عند الزوايا الحادّة. */
const MITER_LIMIT = 4;

/** يبني حلقةً مغلقةً واحدةً لخطٍّ مكسَّرٍ مفتوح: الجانبُ الأيسر ذهابًا، ثم
 * الأيمن عودةً. والطرفان **مقطوعان** (butt) — ولا خسارة في ذلك هنا: مَلمحٌ
 * ينتهي بمعاملٍ قريبٍ من الصفر ينتهي طرفُه نقطةً مهما كان شكل الطرف. */
function openRing(pts: Pt[], halfAt: (i: number) => number): Pt[] {
  const n = pts.length;
  const leftSide: Pt[] = [];
  const rightSide: Pt[] = [];

  for (let i = 0; i < n; i++) {
    const w = halfAt(i);
    // نصفُ عرضٍ صفريّ يُطبِق الجانبين على الخطّ المركزيّ نفسه، فينتهي الذيل
    // نقطةً نظيفة لا شظيّةً متقاطعة. مقتبسٌ من `w <= 0.0 => pts.push(v.p)` في
    // `Ctx::join` بـمحرّك متّجهات مفتوح (`crates/effects/src/stroke/width.rs:230-231`).
    // an open-source vector engine — Copyright (c) 2026 its upstream project Team and the an open-source vector engine
    // contributors — MIT OR Apache-2.0.
    if (w <= 0) {
      leftSide.push(pts[i]);
      rightSide.push(pts[i]);
      continue;
    }

    if (i === 0 || i === n - 1) {
      // الطرف: عموديُّ القطعة المجاورة وحدها، فلا زاويةَ تُنصَّف.
      const j = i === 0 ? 0 : n - 2;
      const d = unit(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y);
      const nm = leftNormal(d.x, d.y);
      leftSide.push({ x: pts[i].x + nm.x * w, y: pts[i].y + nm.y * w });
      rightSide.push({ x: pts[i].x - nm.x * w, y: pts[i].y - nm.y * w });
      continue;
    }

    const a = unit(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const b = unit(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    const na = leftNormal(a.x, a.y);
    const nb = leftNormal(b.x, b.y);
    const mx = na.x + nb.x;
    const my = na.y + nb.y;
    // |na+nb| = 2·cos(θ/2)، فنقطةُ الميتر تبعد w/cos(θ/2) على المُنصِّف. وهي
    // مكتوبةٌ هكذا (لا بتسوية المتّجه) تجنُّبًا لقسمةٍ ثانية — نفس صياغة
    // `Ctx::join` في an open-source vector engine (`crates/effects/src/stroke/width.rs:222-224`).
    const c = Math.hypot(mx, my) / 2;
    if (c > 1e-9 && 1 / c <= MITER_LIMIT) {
      const k = w / (2 * c * c);
      leftSide.push({ x: pts[i].x + mx * k, y: pts[i].y + my * k });
      rightSide.push({ x: pts[i].x - mx * k, y: pts[i].y - my * k });
    } else {
      // زاويةٌ أحدُّ من الحدّ (أو انعكافٌ تامّ فـ`c`≈٠ و`1/c`=∞): شطفٌ
      // بنقطتين على كلّ جانب بدل شوكةٍ تطير بعيدًا — وهو ما يفعله الحدُّ
      // المرسوم عند تجاوز `stroke-miterlimit`.
      leftSide.push({ x: pts[i].x + na.x * w, y: pts[i].y + na.y * w });
      leftSide.push({ x: pts[i].x + nb.x * w, y: pts[i].y + nb.y * w });
      rightSide.push({ x: pts[i].x - na.x * w, y: pts[i].y - na.y * w });
      rightSide.push({ x: pts[i].x - nb.x * w, y: pts[i].y - nb.y * w });
    }
  }

  return [...leftSide, ...rightSide.reverse()];
}

function ringToCmds(ring: Pt[], bw: number, bh: number): PathCmd[] {
  if (ring.length < 3) return [];
  const out: PathCmd[] = [{ c: 'M', x: ring[0].x / bw, y: ring[0].y / bh }];
  for (let i = 1; i < ring.length; i++) out.push({ c: 'L', x: ring[i].x / bw, y: ring[i].y / bh });
  out.push({ c: 'Z' });
  return out;
}

/** الدالّة الواحدة التي تناديها الرسّامات الثلاث كلُّها: تأخذ الخطّ المركزيّ
 * كما تُنتجه `pathElementCommands` (بكسورٍ من الصندوق) وتردّ **مضلَّعًا
 * مغلقًا** بكسورٍ من الصندوق نفسِه، جاهزًا لِـ`commandsToSvgPath` أو
 * `drawPathCommandsToCtx` بلا سطرٍ خاصٍّ بأيٍّ منها.
 *
 * ووحدةُ هذه الدالّة هي الشرط: `is_plain` في an open-source vector engine
 * (`crates/effects/src/stroke/outline.rs:45-53`) محكَمٌ واحد تناديه كلُّ
 * كاتبات الملفّات، فلا يستطيع SVG أن يخالف الـcanvas في «متى يُحوَّل الحدُّ
 * إلى تعبئة». وهذا المستودع حارب تباعدَ المعاينة عن التصدير ثلاث مرّات،
 * فالمَخرج الواحد هو الدرس.
 *
 * يُعبَّأ الناتج بـ`nonzero` دائمًا — لا `evenodd`. وحلقةٌ تلتفّ على نفسها
 * (كالخطّ الأحمر في `t02`) منطقةُ تقاطعها لفُّها ٢، و`nonzero` تُعبّئها
 * فتبدو الحلقةُ متّصلة؛ أمّا `evenodd` فكانت ستثقبها. */
export function variableStrokeOutlineCmds(
  centreline: PathCmd[],
  profile: StrokeWidthProfile,
  widthPx: number,
  bw: number,
  bh: number,
  /** «بداية الخط» و«نهاية الخط» (`src/lib/pathTrim.ts`): كسرانِ من طول كلّ جزء، والمضلَّعُ
   * يُبنى لما بينهما وحده. **والمَلمحُ يبقى مفتاحُه طولَ المسار كاملًا** لا طولَ المقطوع —
   * فخطٌّ يرقّ في آخره ويُرسَم تدريجيًّا يظهر أوّلُه سميكًا كما سيكون، ولا يرقّ رأسُه
   * النامي في كلّ إطار. غيابُه = المسارُ كاملًا، بالحرف كما كان. */
  range?: { start: number; end: number },
): PathCmd[] {
  if (!(widthPx > 0) || !(bw > 0) || !(bh > 0) || !centreline.length) return [];
  const half = widthPx / 2;
  const out: PathCmd[] = [];
  const s = range ? Math.max(0, Math.min(1, range.start)) : 0;
  const e = range ? Math.max(0, Math.min(1, range.end)) : 1;
  if (e <= s) return [];

  for (const sub of flattenToPixelSubpaths(centreline, bw, bh)) {
    const pts = sub.closed ? [...sub.pts, sub.pts[0]] : sub.pts;
    const n = pts.length;
    if (n < 2) continue;

    // طولُ القوس التراكميّ: هو **مفتاح** المَلمح. و`t` كسرٌ من الطول لا من
    // عدد النقاط — فالعُقَد غير المتساوية التباعد (وكلُّ مسار قلمٍ كذلك) لا
    // تُشوِّه التدرّج. الفكرة من an open-source vector engine: المَلمح مفتاحه طولُ القوس لا
    // المرتسى (قياسٌ خارجيٌّ موثَّق).
    const cum = new Float64Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const total = cum[n - 1];
    if (!(total > 1e-12)) continue;

    if (s <= 0 && e >= 1) {
      const ring = openRing(pts, (i) => half * widthFactorAt(profile, cum[i] / total));
      out.push(...ringToCmds(ring, bw, bh));
      continue;
    }
    // الخطُّ المكسَّر بين الطولين، بطرفين مُستوفَين على القطعتين اللتين يقعان فيهما.
    const a = s * total;
    const b = e * total;
    const keptPts: Pt[] = [];
    const keptT: number[] = [];
    const at = (l: number): Pt => {
      let i = 1;
      while (i < n - 1 && cum[i] < l) i++;
      const span = cum[i] - cum[i - 1];
      const f = span > 0 ? (l - cum[i - 1]) / span : 0;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
    };
    keptPts.push(at(a));
    keptT.push(a / total);
    for (let i = 0; i < n; i++) {
      if (cum[i] > a && cum[i] < b) {
        keptPts.push(pts[i]);
        keptT.push(cum[i] / total);
      }
    }
    keptPts.push(at(b));
    keptT.push(b / total);
    if (keptPts.length < 2) continue;
    const ring = openRing(keptPts, (i) => half * widthFactorAt(profile, keptT[i]));
    out.push(...ringToCmds(ring, bw, bh));
  }
  return out;
}
