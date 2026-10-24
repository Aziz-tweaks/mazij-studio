/** **تتبُّع الصورة إلى متجهات — على الجهاز، بلا نموذجٍ ولا شبكة.**
 *
 * وُلد من اختبار نسخِ صورةٍ مرجعيّة (٢٤ أكتوبر ٢٠٢٦): رُسمت قطعها يدويًّا بالقلم
 * بعد قياس الصورة بسكربتٍ خارج البرنامج، فطُلب أن يصير ذلك داخل مزيج نفسه: «اعطيك
 * الصوره وتطلع نفس المخرج». وهذا هو — حسابٌ هندسيّ محض لا تعلّمَ آلةٍ فيه، فيعمل بلا
 * اتّصال، ويُعطي النتيجة نفسها كلّ مرّة:
 *
 *   ١. **الألوان**: تُعَدّ البكسلات «المسطّحة» وحدها (تشبه ثلاثةً من جيرانها الأربعة)،
 *      فلا يصير تنعيمُ الحوافّ لونًا مستقلًّا؛ ثم تُدمَج الألوان المتقاربة، ويُسقَط
 *      لونٌ ضعيفٌ يقع على الخطّ بين لونين أقوى (هو مزيجُهما على الحافّة لا لونٌ حقيقيّ).
 *      وصورةٌ فوتوغرافيّة لا مساحاتٍ مسطّحةً فيها تُقسَم ألوانها بالقطع عند الوسيط.
 *   ٢. **التصنيف**: البكسل الواثق (قريبٌ من لونٍ ومسطّح) يأخذه، وبكسلُ الحافّة يختار
 *      بين ألوان جيرانه الواثقين — فلا تنشأ هالةٌ بلونٍ ثالثٍ بين لونين — ما دامت
 *      تفسّره مزيجًا منها؛ وإلا فأقربُ لونٍ إليه (داخلُ خطٍّ رفيعٍ لا بكسلَ واثقًا فيه).
 *   ٣. **التنظيف**: الجزرُ الأصغر من حدٍّ أدنى تُضمّ إلى أكثر جيرانها تماسًّا.
 *   ٤. **الخلفيّة**: اللونُ الغالب على حافّة الصورة (أو الشفافية) خلفيّةٌ — مستطيلٌ
 *      واحد تحت الكلّ، لا عشراتُ القطع.
 *   ٥. **الحواف بدقّةٍ تحت البكسل**: قيمة كلّ بكسلٍ على الحافّة نسبةُ تغطيته الحقيقيّة
 *      مقدَّرةً من لونه بين اللونين (أو من شفافيّته)، فخطُّ المستوى ٠٫٥ يمرّ حيث مرّت
 *      الحافّة في الأصل لا على حدود البكسلات.
 *   ٦. **الملاءمة كما يرسم مصمّم**: خطوطٌ مستقيمةٌ طويلة بإحداثيّاتٍ مستقيمةٍ حقًّا،
 *      وبين كلّ خطّين إمّا زاويةٌ حادّة أو قوسٌ دائريّ (تدوير) — وما لا يُشبه ذلك يُلاءَم
 *      بمنحنيات بيزييه بالمربّعات الصغرى مع التقسيم عند أكبر خطأ. والدائرة أربعُ نقاطٍ
 *      عند أطرافها بمقابض أفقيّةٍ وعموديّة. ثم يُدمج كلُّ مقطعين يلتقيان بانسيابٍ ما
 *      دام المنحنى الواحد يمرّ بنقاط الحافّة الأصليّة ضمن السماحيّة.
 *   ٧. **الترتيب**: تُرسَم القطع من الأكبر مساحةً مملوءةً إلى الأصغر، فما في ثقب قطعةٍ
 *      يُرسَم بعدها فوقها. والثقب الذي يظهر منه الفراغ (شفافيّة أو خلفيّةٌ متجاهَلة)
 *      يُقصّ من القطعة نفسها (مسارٌ مركّب).
 *
 * المقياس (`qa/image-trace.spec.mjs`): تطابقُ الألوان بكسلًا ببكسل بين الأصل ورسمِ
 * النتيجة. والكود كلّه مكتوبٌ هنا من الوصف الرياضيّ للطرق (مربّعات الخطوط المتماسّة،
 * الملاءمة بالمربّعات الصغرى، نيوتن-رافسون، القطع عند الوسيط) — لا سطرَ منقولٌ من
 * مشروعٍ آخر. وهو بلا DOM: يعمل في عاملٍ خلفيّ (`imageTrace.worker.ts`) كما يعمل في
 * Node. */

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface TraceOptions {
  /** أقصى عدد ألوان (الخلفيّةُ منها). الافتراضيّ ١٦. */
  maxColors?: number;
  /** أصغر قطعةٍ تبقى، بالبكسل. الافتراضيّ يُشتقّ من مقاس الصورة. */
  minArea?: number;
  /** ارسم الخلفيّة مستطيلًا (الافتراضيّ)، أو تجاهلها فتُقصّ من القطع كالشفافيّة. */
  includeBackground?: boolean;
  /** سماحيّة ملاءمة المنحنيات بالبكسل. الافتراضيّ ٠٫٦. */
  tolerance?: number;
  /** أقصى عدد قطع. صورةٌ فوتوغرافيّة تتفتّت آلافَ الجزر؛ فيكبر حدّ التنظيف حتى تنزل
   * تحته — فيبقى التتبّع ثوانيَ لا دقائق، وتبقى طبقاتُه شيئًا يُعدَّل. الافتراضيّ ١٥٠٠. */
  maxRegions?: number;
}

export interface Vec {
  x: number;
  y: number;
}

/** نقطة ربط بمقبضَيها **إزاحةً من النقطة نفسها** — الإطار نفسه في `ShapeElement.handles`.
 * `null` = لا مقبض (زاوية/خطّ مستقيم في ذلك الجانب). */
export interface TraceAnchor {
  x: number;
  y: number;
  in: Vec | null;
  out: Vec | null;
}

export interface TracedShape {
  color: string;
  /** المحيط الخارجيّ أوّلًا، ثم الثقوب المقصوصة (بالاتّجاه المعاكس، فتُعبَّأ بقاعدة
   * nonzero ثقوبًا). قطعةٌ بلا ثقوبٍ مقصوصة = محيطٌ واحد = مسارٌ قابلٌ لتحرير نقاطه. */
  contours: TraceAnchor[][];
  /** المساحة المملوءة (القطعة وثقوبها) — مفتاح ترتيب الرسم. */
  filledArea: number;
  /** الصندوق المحيط بالنقاط ونهايات المقابض، بالبكسل. */
  bbox: { x: number; y: number; w: number; h: number };
}

export interface TraceResult {
  width: number;
  height: number;
  /** لون الخلفيّة إن كانت معتمة وطُلب رسمها، وإلا `null`. */
  background: string | null;
  /** بترتيب الرسم: الأوّل أبعد. */
  shapes: TracedShape[];
  palette: string[];
  stats: { colors: number; regions: number; anchors: number; ms: number };
}

const TRANSPARENT = 255;

// ═══════════════════════════ أدوات هندسيّة ═══════════════════════════

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
const len = (a: Vec): number => Math.hypot(a.x, a.y);
function unit(a: Vec): Vec {
  const l = len(a);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}
function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

type Bez = [Vec, Vec, Vec, Vec];

function bezAt(b: Bez, t: number): Vec {
  const u = 1 - t;
  const a = u * u * u;
  const c = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return { x: a * b[0].x + c * b[1].x + d * b[2].x + e * b[3].x, y: a * b[0].y + c * b[1].y + d * b[2].y + e * b[3].y };
}
function bezD1(b: Bez, t: number): Vec {
  const u = 1 - t;
  return {
    x: 3 * (u * u * (b[1].x - b[0].x) + 2 * u * t * (b[2].x - b[1].x) + t * t * (b[3].x - b[2].x)),
    y: 3 * (u * u * (b[1].y - b[0].y) + 2 * u * t * (b[2].y - b[1].y) + t * t * (b[3].y - b[2].y)),
  };
}
function bezD2(b: Bez, t: number): Vec {
  const u = 1 - t;
  return {
    x: 6 * (u * (b[2].x - 2 * b[1].x + b[0].x) + t * (b[3].x - 2 * b[2].x + b[1].x)),
    y: 6 * (u * (b[2].y - 2 * b[1].y + b[0].y) + t * (b[3].y - 2 * b[2].y + b[1].y)),
  };
}

// ═══════════════════════════ ١. الألوان ═══════════════════════════

interface Palette {
  colors: Array<[number, number, number]>;
}

function sq(r: number, g: number, b: number, c: [number, number, number]): number {
  const dr = r - c[0];
  const dg = g - c[1];
  const db = b - c[2];
  return dr * dr + dg * dg + db * db;
}

/** يشبه ثلاثةً على الأقلّ من جيرانه الأربعة المعتمين. */
function flatMask(img: RgbaImage, flat2: number): Uint8Array {
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = i * 4;
      if (data[p + 3] < 128) continue;
      let similar = 0;
      let total = 0;
      const check = (j: number) => {
        total++;
        const q = j * 4;
        if (data[q + 3] < 128) return;
        const dr = data[p] - data[q];
        const dg = data[p + 1] - data[q + 1];
        const db = data[p + 2] - data[q + 2];
        if (dr * dr + dg * dg + db * db <= flat2) similar++;
      };
      if (x > 0) check(i - 1);
      if (x < w - 1) check(i + 1);
      if (y > 0) check(i - w);
      if (y < h - 1) check(i + w);
      // على حافّة الصورة جيرانٌ أقلّ: يكفي أن يشبهها كلّهم إلا واحدًا.
      if (similar >= Math.min(3, total - 1)) out[i] = 1;
    }
  }
  return out;
}

function buildPalette(img: RgbaImage, flat: Uint8Array, maxColors: number): Palette {
  const { data } = img;
  const n = img.width * img.height;
  const counts = new Uint32Array(32768);
  const sums = new Float64Array(32768 * 3);
  let flatTotal = 0;
  for (let i = 0; i < n; i++) {
    if (!flat[i]) continue;
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    counts[k]++;
    sums[k * 3] += r;
    sums[k * 3 + 1] += g;
    sums[k * 3 + 2] += b;
    flatTotal++;
  }
  const bins: number[] = [];
  for (let k = 0; k < 32768; k++) if (counts[k]) bins.push(k);
  bins.sort((a, b) => counts[b] - counts[a]);

  const MERGE = 28 * 28;
  const minCount = Math.max(12, Math.round(flatTotal * 0.0004));
  const clusters: Array<{ s: [number, number, number]; c: number }> = [];
  const center = (cl: { s: [number, number, number]; c: number }): [number, number, number] => [cl.s[0] / cl.c, cl.s[1] / cl.c, cl.s[2] / cl.c];
  for (const k of bins) {
    const c = counts[k];
    const m: [number, number, number] = [sums[k * 3] / c, sums[k * 3 + 1] / c, sums[k * 3 + 2] / c];
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < clusters.length; j++) {
      const d = sq(m[0], m[1], m[2], center(clusters[j]));
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best >= 0 && bestD <= MERGE) {
      clusters[best].s[0] += sums[k * 3];
      clusters[best].s[1] += sums[k * 3 + 1];
      clusters[best].s[2] += sums[k * 3 + 2];
      clusters[best].c += c;
    } else if (c >= minCount && clusters.length < maxColors) {
      clusters.push({ s: [sums[k * 3], sums[k * 3 + 1], sums[k * 3 + 2]], c });
    }
    // وما بقي (أضعف من الحدّ، أو بعد امتلاء العدد) لا يُنشئ لونًا: يُصنَّف لاحقًا
    // على أقرب لونٍ قائم.
  }
  // لونٌ ضعيفٌ على الخطّ بين لونين أقوى منه = مزيجهما على حافّةٍ عريضة، لا لونٌ حقيقيّ.
  const keep = clusters.map(() => true);
  const order = clusters.map((_, i) => i).sort((a, b) => clusters[b].c - clusters[a].c);
  for (const i of order) {
    const p = center(clusters[i]);
    for (let a = 0; a < clusters.length && keep[i]; a++) {
      if (a === i || !keep[a] || clusters[a].c < clusters[i].c * 4) continue;
      for (let b = a + 1; b < clusters.length; b++) {
        if (b === i || !keep[b] || clusters[b].c < clusters[i].c * 4) continue;
        const A = center(clusters[a]);
        const B = center(clusters[b]);
        const ab: [number, number, number] = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const ab2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
        if (ab2 < 1) continue;
        const t = ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1] + (p[2] - A[2]) * ab[2]) / ab2;
        if (t < 0.12 || t > 0.88) continue;
        const q: [number, number, number] = [A[0] + ab[0] * t, A[1] + ab[1] * t, A[2] + ab[2] * t];
        if (sq(p[0], p[1], p[2], q) <= 10 * 10) {
          keep[i] = false;
          break;
        }
      }
    }
  }
  const colors = clusters.filter((_, i) => keep[i]).map((cl) => center(cl).map((v) => Math.round(v)) as [number, number, number]);
  // صورةٌ فوتوغرافيّة: لا مساحاتٍ مسطّحة تكفي، فيبقى أكثرُ البكسلات بلا لونٍ يمثّلها
  // (أو لا لونَ إطلاقًا). حينها تُقسَم الألوان كلّها بالقطع عند الوسيط.
  const covered = clusters.reduce((sum, cl, i) => sum + (keep[i] ? cl.c : 0), 0);
  if (colors.length < 2 || covered < flatTotal * 0.6) {
    const mc = medianCut(img, maxColors);
    if (mc.length >= colors.length) return { colors: mc };
  }
  return { colors };
}

/** القطع عند الوسيط: صندوقُ ألوانٍ يُشطَر عند وسيط أطول محاوره، حتى يبلغ العددُ
 * المطلوب. على عيّنةٍ منتظمة من البكسلات المعتمة (حتى ١٢٠ ألفًا). */
function medianCut(img: RgbaImage, maxColors: number): Array<[number, number, number]> {
  const { data } = img;
  const n = img.width * img.height;
  const step = Math.max(1, Math.floor(n / 120000));
  const px: number[] = [];
  for (let i = 0; i < n; i += step) {
    const p = i * 4;
    if (data[p + 3] < 128) continue;
    px.push(data[p], data[p + 1], data[p + 2]);
  }
  const count = px.length / 3;
  if (!count) return [];
  type Box = { idx: number[]; range: number; ch: number };
  const measure = (idx: number[]): Box => {
    const lo = [255, 255, 255];
    const hi = [0, 0, 0];
    for (const i of idx) {
      for (let c = 0; c < 3; c++) {
        const v = px[i * 3 + c];
        if (v < lo[c]) lo[c] = v;
        if (v > hi[c]) hi[c] = v;
      }
    }
    let ch = 0;
    for (let c = 1; c < 3; c++) if (hi[c] - lo[c] > hi[ch] - lo[ch]) ch = c;
    return { idx, range: hi[ch] - lo[ch], ch };
  };
  const boxes: Box[] = [measure(Array.from({ length: count }, (_, i) => i))];
  while (boxes.length < maxColors) {
    // الأولى بالشطر: أكبرُ مدًى موزونًا بعدد بكسلاته.
    let bi = -1;
    let best = 0;
    boxes.forEach((b, i) => {
      const score = b.range * Math.sqrt(b.idx.length);
      if (b.idx.length > 1 && b.range > 8 && score > best) {
        best = score;
        bi = i;
      }
    });
    if (bi < 0) break;
    const b = boxes[bi];
    const sorted = b.idx.slice().sort((x, y) => px[x * 3 + b.ch] - px[y * 3 + b.ch]);
    const mid = Math.floor(sorted.length / 2);
    boxes.splice(bi, 1, measure(sorted.slice(0, mid)), measure(sorted.slice(mid)));
  }
  return boxes.map((b) => {
    const sum = [0, 0, 0];
    for (const i of b.idx) for (let c = 0; c < 3; c++) sum[c] += px[i * 3 + c];
    return sum.map((v) => Math.round(v / b.idx.length)) as [number, number, number];
  });
}

// ═══════════════════════════ ٢. التصنيف ═══════════════════════════

function nearestColor(r: number, g: number, b: number, colors: Array<[number, number, number]>): { k: number; d2: number } {
  let k = 0;
  let d2 = Infinity;
  for (let j = 0; j < colors.length; j++) {
    const d = sq(r, g, b, colors[j]);
    if (d < d2) {
      d2 = d;
      k = j;
    }
  }
  return { k, d2 };
}

function classify(img: RgbaImage, flat: Uint8Array, pal: Palette): Uint8Array {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const label = new Uint8Array(n).fill(TRANSPARENT);
  const confident = new Uint8Array(n);
  const CONF2 = 24 * 24;
  const EXACT2 = 6 * 6;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (data[p + 3] < 128) {
      confident[i] = 1; // الشفافيّة واثقةٌ بتعريفها
      continue;
    }
    const { k, d2 } = nearestColor(data[p], data[p + 1], data[p + 2], pal.colors);
    label[i] = k;
    if (d2 <= EXACT2 || (d2 <= CONF2 && flat[i])) confident[i] = 1;
  }
  // بكسلُ الحافّة: يختار من ألوان جيرانه الواثقين — إن فسّرته مزيجًا من لونين منها.
  // وإن لم تفسّره (خطٌّ رفيعٌ لا بكسلَ واثقًا فيه قريبًا: تنعيم التصغير يُغمّق داخله
  // عن لونه)، فأقربُ لونٍ عامّ — وإلا صار داخل الخطّ «خلفيّةً» وتسنّن المحيط.
  const cand = new Set<number>();
  const EXPLAIN2 = 40 * 40;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (confident[i]) continue;
      const p = i * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const ownD2 = sq(r, g, b, pal.colors[label[i]]);
      let chosen = -1;
      let chosenErr = Infinity;
      for (let radius = 2; radius <= 4; radius += 2) {
        cand.clear();
        for (let dy = -radius; dy <= radius; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (confident[j] && label[j] !== TRANSPARENT) cand.add(label[j]);
          }
        }
        if (!cand.size) continue;
        const list = [...cand];
        // أحسن تفسير: لونٌ واحد، أو نقطةٌ على الخطّ بين لونين (فيُختار أقربهما).
        for (let a = 0; a < list.length; a++) {
          const A = pal.colors[list[a]];
          const dA = sq(r, g, b, A);
          if (dA < chosenErr) {
            chosenErr = dA;
            chosen = list[a];
          }
          for (let c2 = a + 1; c2 < list.length; c2++) {
            const B = pal.colors[list[c2]];
            const ab0 = B[0] - A[0];
            const ab1 = B[1] - A[1];
            const ab2 = B[2] - A[2];
            const ab = ab0 * ab0 + ab1 * ab1 + ab2 * ab2;
            if (ab < 1) continue;
            const t = ((r - A[0]) * ab0 + (g - A[1]) * ab1 + (b - A[2]) * ab2) / ab;
            if (t <= 0 || t >= 1) continue;
            const e = sq(r, g, b, [A[0] + ab0 * t, A[1] + ab1 * t, A[2] + ab2 * t]);
            if (e < chosenErr) {
              chosenErr = e;
              chosen = t < 0.5 ? list[a] : list[c2];
            }
          }
        }
        if (chosenErr <= EXPLAIN2) break;
      }
      if (chosen < 0) continue; // لا جيرانَ واثقين: يبقى على أقرب لونٍ عامّ
      if (chosenErr <= EXPLAIN2 || chosenErr <= ownD2) label[i] = chosen;
      // وإلا يبقى على أقرب لونٍ عامّ (يفسّره أحسن من جيرانه)
    }
  }
  return label;
}

// ═══════════════════════════ ٣. القطع والتنظيف ═══════════════════════════

interface Components {
  id: Int32Array;
  count: number;
  label: number[];
  area: number[];
  x0: number[];
  y0: number[];
  x1: number[];
  y1: number[];
  touchesBorder: boolean[];
}

function components(label: Uint8Array, w: number, h: number): Components {
  const n = w * h;
  const id = new Int32Array(n).fill(-1);
  const out: Components = { id, count: 0, label: [], area: [], x0: [], y0: [], x1: [], y1: [], touchesBorder: [] };
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (id[s] !== -1) continue;
    const c = out.count++;
    const lab = label[s];
    let top = 0;
    stack[top++] = s;
    id[s] = c;
    let area = 0;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    let border = false;
    while (top) {
      const i = stack[--top];
      area++;
      const x = i % w;
      const y = (i - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      if (x > 0 && id[i - 1] === -1 && label[i - 1] === lab) {
        id[i - 1] = c;
        stack[top++] = i - 1;
      }
      if (x < w - 1 && id[i + 1] === -1 && label[i + 1] === lab) {
        id[i + 1] = c;
        stack[top++] = i + 1;
      }
      if (y > 0 && id[i - w] === -1 && label[i - w] === lab) {
        id[i - w] = c;
        stack[top++] = i - w;
      }
      if (y < h - 1 && id[i + w] === -1 && label[i + w] === lab) {
        id[i + w] = c;
        stack[top++] = i + w;
      }
    }
    out.label.push(lab);
    out.area.push(area);
    out.x0.push(x0);
    out.y0.push(y0);
    out.x1.push(x1);
    out.y1.push(y1);
    out.touchesBorder.push(border);
  }
  return out;
}

/** يضمّ كلّ جزيرةٍ أصغر من `minArea` إلى أكثر جيرانها تماسًّا. */
function removeSpeckles(label: Uint8Array, w: number, h: number, minArea: number): void {
  for (let pass = 0; pass < 3; pass++) {
    const comps = components(label, w, h);
    let changed = false;
    const contact = new Map<number, number>();
    for (let c = 0; c < comps.count; c++) {
      if (comps.area[c] >= minArea) continue;
      contact.clear();
      for (let y = comps.y0[c]; y <= comps.y1[c]; y++) {
        for (let x = comps.x0[c]; x <= comps.x1[c]; x++) {
          const i = y * w + x;
          if (comps.id[i] !== c) continue;
          const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
          for (const j of nb) {
            if (j < 0 || comps.id[j] === c) continue;
            contact.set(label[j], (contact.get(label[j]) ?? 0) + 1);
          }
        }
      }
      let best = -1;
      let bestN = 0;
      for (const [lab, k] of contact) {
        if (k > bestN) {
          bestN = k;
          best = lab;
        }
      }
      if (best < 0) continue;
      for (let y = comps.y0[c]; y <= comps.y1[c]; y++) {
        for (let x = comps.x0[c]; x <= comps.x1[c]; x++) {
          const i = y * w + x;
          if (comps.id[i] === c) label[i] = best;
        }
      }
      changed = true;
    }
    if (!changed) break;
  }
}

// ═══════════════════════════ ٤. الحوافّ بدقّةٍ تحت البكسل ═══════════════════════════

/** الحقل الذي يُستخرَج منه محيطٌ بمستوى ٠٫٥: داخل القطعة ≥ ٠٫٥، خارجها < ٠٫٥، وعلى
 * الحافّة نسبةُ التغطية المقدَّرة من اللون — فتطابق طوبولوجيا المحيط خريطةَ التصنيف
 * بالضبط، ويتحسّن الموضعُ وحده. */
function coverageField(
  img: RgbaImage,
  label: Uint8Array,
  comps: Components,
  c: number,
  pal: Palette,
  pad: number,
): { v: Float32Array; gw: number; gh: number; ox: number; oy: number } {
  const { width: w, height: h, data } = img;
  const ox = comps.x0[c] - pad;
  const oy = comps.y0[c] - pad;
  const gw = comps.x1[c] - comps.x0[c] + 1 + 2 * pad;
  const gh = comps.y1[c] - comps.y0[c] + 1 + 2 * pad;
  const v = new Float32Array(gw * gh);
  const lab = comps.label[c];
  const C = lab === TRANSPARENT ? null : pal.colors[lab];
  const inC = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && comps.id[y * w + x] === c;
  const coverageAgainst = (p: number, other: number): number => {
    // نسبة لون القطعة في البكسل مقابل لونٍ آخر (أو مقابل الشفافيّة).
    if (!C) return 0.5;
    if (other === TRANSPARENT) return data[p + 3] / 255;
    const O = pal.colors[other];
    const ab0 = C[0] - O[0];
    const ab1 = C[1] - O[1];
    const ab2 = C[2] - O[2];
    const d = ab0 * ab0 + ab1 * ab1 + ab2 * ab2;
    if (d < 1) return 0.5;
    const t = ((data[p] - O[0]) * ab0 + (data[p + 1] - O[1]) * ab1 + (data[p + 2] - O[2]) * ab2) / d;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  };
  const tally = new Map<number, number>();
  for (let gy = 0; gy < gh; gy++) {
    const y = oy + gy;
    for (let gx = 0; gx < gw; gx++) {
      const x = ox + gx;
      const inside = inC(x, y);
      // جارٌ مخالف؟ (٨ اتّجاهات)
      let boundary = false;
      let otherLab = -1;
      tally.clear();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          const nIn = inC(xx, yy);
          if (nIn !== inside) {
            boundary = true;
            if (inside && xx >= 0 && yy >= 0 && xx < w && yy < h) {
              const l = label[yy * w + xx];
              tally.set(l, (tally.get(l) ?? 0) + 1);
            }
          }
        }
      }
      if (!boundary) {
        v[gy * gw + gx] = inside ? 1 : 0;
        continue;
      }
      if (x < 0 || y < 0 || x >= w || y >= h) {
        v[gy * gw + gx] = 0;
        continue;
      }
      const i = y * w + x;
      const p = i * 4;
      if (inside) {
        let best = 0;
        for (const [l, k] of tally) {
          if (k > best) {
            best = k;
            otherLab = l;
          }
        }
        const a = otherLab < 0 ? 1 : coverageAgainst(p, otherLab);
        v[gy * gw + gx] = a < 0.5 ? 0.5 : a;
      } else {
        // بكسلٌ خارج القطعة: من لونها نفسِه لكن من قطعةٍ أخرى؟ فخارجٌ تمامًا.
        const l = label[i];
        const a = l === lab ? 0 : coverageAgainst(p, l);
        v[gy * gw + gx] = a >= 0.5 ? 0.4999 : a;
      }
    }
  }
  return { v, gw, gh, ox, oy };
}

/** مربّعات الخطوط المتماسّة على شبكة قيمٍ عند مراكز البكسلات، بمستوى ٠٫٥. تُرجع
 * المحيطات المغلقة بإحداثيّات الصورة (مركز البكسل c عند c+0.5). */
function marchingSquares(v: Float32Array, gw: number, gh: number, ox: number, oy: number): Vec[][] {
  const L = 0.5;
  // مفتاح كلّ حافّة: أفقيّة H(i,j) = 2*(j*gw+i)، عموديّة V(i,j) = 2*(j*gw+i)+1.
  const H = (i: number, j: number) => 2 * (j * gw + i);
  const V = (i: number, j: number) => 2 * (j * gw + i) + 1;
  const pointOf = new Map<number, Vec>();
  const links = new Map<number, number[]>();
  const val = (i: number, j: number) => v[j * gw + i];
  const point = (key: number): Vec => {
    let pt = pointOf.get(key);
    if (pt) return pt;
    const base = key >> 1;
    const i = base % gw;
    const j = (base - i) / gw;
    if (key & 1) {
      const a = val(i, j);
      const b = val(i, j + 1);
      const t = (L - a) / (b - a);
      pt = { x: ox + i + 0.5, y: oy + j + t + 0.5 };
    } else {
      const a = val(i, j);
      const b = val(i + 1, j);
      const t = (L - a) / (b - a);
      pt = { x: ox + i + t + 0.5, y: oy + j + 0.5 };
    }
    pointOf.set(key, pt);
    return pt;
  };
  const link = (a: number, b: number) => {
    let la = links.get(a);
    if (!la) links.set(a, (la = []));
    la.push(b);
    let lb = links.get(b);
    if (!lb) links.set(b, (lb = []));
    lb.push(a);
  };
  for (let j = 0; j < gh - 1; j++) {
    for (let i = 0; i < gw - 1; i++) {
      const tl = val(i, j) >= L ? 8 : 0;
      const tr = val(i + 1, j) >= L ? 4 : 0;
      const br = val(i + 1, j + 1) >= L ? 2 : 0;
      const bl = val(i, j + 1) >= L ? 1 : 0;
      const k = tl | tr | br | bl;
      if (k === 0 || k === 15) continue;
      const T = H(i, j);
      const B = H(i, j + 1);
      const Lf = V(i, j);
      const R = V(i + 1, j);
      switch (k) {
        case 1: link(Lf, B); break;
        case 2: link(B, R); break;
        case 3: link(Lf, R); break;
        case 4: link(T, R); break;
        case 5: {
          const c = (val(i, j) + val(i + 1, j) + val(i + 1, j + 1) + val(i, j + 1)) / 4;
          if (c >= L) { link(T, Lf); link(B, R); } else { link(T, R); link(Lf, B); }
          break;
        }
        case 6: link(T, B); break;
        case 7: link(T, Lf); break;
        case 8: link(T, Lf); break;
        case 9: link(T, B); break;
        case 10: {
          const c = (val(i, j) + val(i + 1, j) + val(i + 1, j + 1) + val(i, j + 1)) / 4;
          if (c >= L) { link(T, R); link(Lf, B); } else { link(T, Lf); link(B, R); }
          break;
        }
        case 11: link(T, R); break;
        case 12: link(Lf, R); break;
        case 13: link(B, R); break;
        case 14: link(Lf, B); break;
      }
    }
  }
  const loops: Vec[][] = [];
  const used = new Set<number>();
  for (const start of links.keys()) {
    if (used.has(start)) continue;
    const loop: Vec[] = [];
    let prev = -1;
    let cur = start;
    for (let guard = 0; guard < 4000000; guard++) {
      used.add(cur);
      loop.push(point(cur));
      const nb = links.get(cur)!;
      const next = nb[0] !== prev ? nb[0] : nb[1];
      if (next === undefined || next === start) break;
      if (used.has(next)) break;
      prev = cur;
      cur = next;
    }
    // تنقيةُ النقاط المكرّرة (تنتج حين تقع الحافّة على مركز بكسلٍ تمامًا).
    const clean: Vec[] = [];
    for (const pt of loop) {
      const last = clean[clean.length - 1];
      if (!last || dist(last, pt) > 1e-6) clean.push(pt);
    }
    if (clean.length > 2 && dist(clean[0], clean[clean.length - 1]) < 1e-6) clean.pop();
    if (clean.length >= 3) loops.push(clean);
  }
  return loops;
}

function signedArea(pts: Vec[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

// ═══════════════════════════ ٥. الملاءمة ═══════════════════════════

/** مقطعٌ من المسار الناتج: خطٌّ مستقيم أو منحنى بيزييه تكعيبيّ. */
type Seg = { kind: 'L'; p0: Vec; p1: Vec } | { kind: 'C'; p0: Vec; c1: Vec; c2: Vec; p1: Vec };

/** دوغلاس-بيكر على مقطعٍ مفتوح [i0..i1] من محيطٍ مغلق (بالفهارس الدائريّة). */
function dpOpen(pts: Vec[], idx: number[], eps: number, out: number[]): void {
  const n = idx.length;
  if (n < 3) return;
  const a = pts[idx[0]];
  const b = pts[idx[n - 1]];
  const ab = sub(b, a);
  const l = len(ab);
  let best = -1;
  let bestD = -1;
  for (let k = 1; k < n - 1; k++) {
    const p = pts[idx[k]];
    const d = l > 1e-9 ? Math.abs(cross(ab, sub(p, a))) / l : dist(p, a);
    if (d > bestD) {
      bestD = d;
      best = k;
    }
  }
  if (bestD > eps) {
    dpOpen(pts, idx.slice(0, best + 1), eps, out);
    out.push(idx[best]);
    dpOpen(pts, idx.slice(best), eps, out);
  }
}

function dpClosed(pts: Vec[], eps: number): number[] {
  const n = pts.length;
  // بدايةٌ بعيدة عن نقطة الصفر: أبعد نقطةٍ عنها، ثم أبعد نقطةٍ عن تلك.
  let a = 0;
  let far = -1;
  for (let i = 0; i < n; i++) {
    const d = dist(pts[i], pts[0]);
    if (d > far) {
      far = d;
      a = i;
    }
  }
  let b = a;
  far = -1;
  for (let i = 0; i < n; i++) {
    const d = dist(pts[i], pts[a]);
    if (d > far) {
      far = d;
      b = i;
    }
  }
  const range = (from: number, to: number) => {
    const r: number[] = [];
    for (let i = from; ; i = (i + 1) % n) {
      r.push(i);
      if (i === to) break;
    }
    return r;
  };
  const out: number[] = [a];
  dpOpen(pts, range(a, b), eps, out);
  out.push(b);
  dpOpen(pts, range(b, a), eps, out);
  // ترتيبٌ دائريّ بدءًا من a
  const uniq = [...new Set(out)];
  uniq.sort((x, y) => ((x - a + n) % n) - ((y - a + n) % n));
  return uniq;
}

function between(n: number, i0: number, i1: number): number[] {
  const r: number[] = [];
  for (let i = i0; ; i = (i + 1) % n) {
    r.push(i);
    if (i === i1) break;
  }
  return r;
}

interface Line {
  c: Vec;
  d: Vec;
  i0: number;
  i1: number;
}

/** المربّعات الصغرى الكلّيّة: الخطّ الذي يقلّل مجموع مربّعات المسافات العموديّة. */
function fitLine(points: Vec[]): { c: Vec; d: Vec } {
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { c: { x: cx, y: cy }, d: { x: Math.cos(theta), y: Math.sin(theta) } };
}

function lineIntersect(c1: Vec, d1: Vec, c2: Vec, d2: Vec): Vec | null {
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(c2, c1), d2) / den;
  return add(c1, mul(d1, t));
}

function projectOnLine(p: Vec, c: Vec, d: Vec): Vec {
  return add(c, mul(d, dot(sub(p, c), d)));
}

/** دائرةٌ بالمربّعات الصغرى الجبريّة (بعد التمركز): مركزها ونصف قطرها وأقصى بُعدٍ عنها. */
function fitCircle(points: Vec[]): { c: Vec; r: number; max: number } | null {
  const m = points.length;
  if (m < 5) return null;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= m;
  my /= m;
  // نحلّ: x²+y² + D x + E y + F = 0 ⇐ مصفوفةٌ ٣×٣.
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let szx = 0;
  let szy = 0;
  for (const p of points) {
    const x = p.x - mx;
    const y = p.y - my;
    const z = x * x + y * y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sx += x;
    sy += y;
    sz += z;
    szx += z * x;
    szy += z * y;
  }
  // [sxx sxy sx][D]   [-szx]
  // [sxy syy sy][E] = [-szy]
  // [sx  sy  m ][F]   [-sz ]
  const A = [
    [sxx, sxy, sx, -szx],
    [sxy, syy, sy, -szy],
    [sx, sy, m, -sz],
  ];
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let row = col + 1; row < 3; row++) if (Math.abs(A[row][col]) > Math.abs(A[piv][col])) piv = row;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const f = A[row][col] / A[col][col];
      for (let k = col; k < 4; k++) A[row][k] -= f * A[col][k];
    }
  }
  const D = A[0][3] / A[0][0];
  const E = A[1][3] / A[1][1];
  const F = A[2][3] / A[2][2];
  const r2 = (D * D + E * E) / 4 - F;
  if (!(r2 > 0)) return null;
  const r = Math.sqrt(r2);
  const c = { x: mx - D / 2, y: my - E / 2 };
  let max = 0;
  for (const p of points) max = Math.max(max, Math.abs(dist(p, c) - r));
  return { c, r, max };
}

/** الخطوط المستقيمة الطويلة في المحيط: أضلاعُ دوغلاس-بيكر الطويلة، مدموجةً إن
 * تتابعت على استقامة، ومقبولةً إن كانت مستقيمةً حقًّا (لا قوسًا واسعًا). */
function findLines(pts: Vec[]): Line[] {
  const n = pts.length;
  const LMIN = 14;
  // ٠٫٦ بكسل: رأسٌ عند بداية كلّ تدويرٍ لا بعدها بقليل — بـ٠٫٩ كانت أضلاعٌ قصيرة بين
  // تدويرين تُبتلع في مقطعٍ واحدٍ معهما (قيس على العقدة: ٩٩٫٧٧٦٪ بـ٢٧٤ نقطة مقابل
  // ٩٩٫٧٧٣٪ بـ٢٧٨).
  const verts = dpClosed(pts, 0.6);
  const m = verts.length;
  if (m < 2) return [];
  type Run = { i0: number; i1: number };
  let runs: Run[] = [];
  for (let k = 0; k < m; k++) {
    const i0 = verts[k];
    const i1 = verts[(k + 1) % m];
    if (dist(pts[i0], pts[i1]) >= LMIN) runs.push({ i0, i1 });
  }
  // دمج المتتابع على استقامة
  let merged = true;
  while (merged && runs.length > 1) {
    merged = false;
    for (let k = 0; k < runs.length; k++) {
      const a = runs[k];
      const b = runs[(k + 1) % runs.length];
      if (a.i1 !== b.i0 || a === b) continue;
      const da = unit(sub(pts[a.i1], pts[a.i0]));
      const db = unit(sub(pts[b.i1], pts[b.i0]));
      if (dot(da, db) > Math.cos((5 * Math.PI) / 180)) {
        const next = { i0: a.i0, i1: b.i1 };
        const rest = runs.filter((r) => r !== a && r !== b);
        const at = runs.indexOf(a);
        rest.splice(Math.min(at, rest.length), 0, next);
        runs = rest;
        merged = true;
        break;
      }
    }
  }
  /** هل الجزء [i0..i1] ضلعٌ مستقيم؟ يُرجع خطّه أو `null`. */
  const straightRun = (i0: number, i1: number): Line | null => {
    let idx = between(n, i0, i1);
    if (idx.length > 8) idx = idx.slice(2, idx.length - 2);
    const sample = idx.map((i) => pts[i]);
    const { c, d: d0 } = fitLine(sample);
    const d = dot(d0, sub(pts[i1], pts[i0])) < 0 ? mul(d0, -1) : d0;
    // مستقيمٌ حقًّا؟ أقصى انحرافٍ صغير، ولا «تقوّس» منتظمٌ (وسطٌ في جهةٍ وطرفان في الأخرى).
    let maxDev = 0;
    const devs: number[] = [];
    for (const p of sample) {
      const s = cross(d, sub(p, c));
      devs.push(s);
      if (Math.abs(s) > maxDev) maxDev = Math.abs(s);
    }
    const third = Math.floor(devs.length / 3);
    let bow = 0;
    if (third >= 2) {
      const mid = devs.slice(third, devs.length - third);
      const ends = [...devs.slice(0, third), ...devs.slice(devs.length - third)];
      bow = mid.reduce((s, x) => s + x, 0) / mid.length - ends.reduce((s, x) => s + x, 0) / ends.length;
    }
    if (maxDev > 0.75 || Math.abs(bow) > 0.15) return null;
    // وترٌ قصيرٌ من دائرةٍ كبيرة يبدو مستقيمًا وحده: إن مرّت دائرةٌ واحدة **بدقّة**
    // (≤ ٠٫٣ بكسل) بنقاطه ونقاطِ ما قبله وما بعده، وتقوّسها على طوله محسوس، فهو قوسٌ لا
    // ضلع. والدقّة هي ما يحفظ الضلعَ القصير بين تدويرين (جانبُ مستطيلٍ مدوَّر): دائرةٌ
    // تمرّ بالضلع والتدويرين معًا تُخطئ نحو نصف بكسل — قيس ٠٫٤٣ على مستطيلٍ ارتفاعه ١١٠
    // وتدويره ٤٠ — وأوتار الدوائر الحقيقيّة دون ٠٫٢٤.
    const runN = between(n, i0, i1).length;
    const ext = Math.max(4, Math.round(runN / 2));
    const win = between(n, (i0 - ext + n) % n, (i1 + ext) % n);
    if (win.length < n) {
      const circ = fitCircle(win.map((i) => pts[i]));
      const L = dist(pts[i0], pts[i1]);
      if (circ && circ.max <= 0.3 && (L * L) / (8 * circ.r) >= 0.12) return null;
    }
    return { c, d, i0, i1 };
  };
  const lines: Line[] = [];
  for (const r of runs) {
    let line = straightRun(r.i0, r.i1);
    if (!line) {
      // ضلعٌ قصيرٌ بين تدويرين قد يمتدّ رأسا مقطعه في التدويرين (موضعُ رؤوس دوغلاس-بيكر
      // يتبع ارتجاف التنعيم: محرّكا رسمٍ مختلفان يضعانها في موضعين). فيُجرَّب لُبُّه:
      // خطٌّ على وسطه، يمتدّ ما دامت النقاط عليه (≤ ٠٫٣٥ بكسل).
      const idx = between(n, r.i0, r.i1);
      if (idx.length >= 12) {
        const m0 = Math.floor(idx.length * 0.25);
        const m1 = Math.ceil(idx.length * 0.75);
        const { c, d } = fitLine(idx.slice(m0, m1).map((i) => pts[i]));
        const off = (k: number) => Math.abs(cross(d, sub(pts[idx[k]], c)));
        let a = m0;
        let b = m1 - 1;
        while (a > 0 && off(a - 1) <= 0.35) a--;
        while (b < idx.length - 1 && off(b + 1) <= 0.35) b++;
        if ((a > 0 || b < idx.length - 1) && dist(pts[idx[a]], pts[idx[b]]) >= LMIN) line = straightRun(idx[a], idx[b]);
      }
    }
    if (line) lines.push(line);
  }
  lines.sort((a, b) => a.i0 - b.i0);
  return lines;
}

// ─── الملاءمة بالمربّعات الصغرى لمنحنيات بيزييه (تقسيمٌ عند أكبر خطأ) ───

function chordParams(pts: Vec[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + dist(pts[i], pts[i - 1]));
  const total = u[u.length - 1] || 1;
  return u.map((x) => x / total);
}

function generateBezier(pts: Vec[], u: number[], t1: Vec, t2: Vec): Bez {
  const p0 = pts[0];
  const p3 = pts[pts.length - 1];
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i];
    const s = 1 - t;
    const b0 = s * s * s;
    const b1 = 3 * s * s * t;
    const b2 = 3 * s * t * t;
    const b3 = t * t * t;
    const a1 = mul(t1, b1);
    const a2 = mul(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const tmp = sub(pts[i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  const segLen = dist(p0, p3);
  let alpha1 = 0;
  let alpha2 = 0;
  if (Math.abs(det) > 1e-12) {
    alpha1 = (x0 * c11 - x1 * c01) / det;
    alpha2 = (c00 * x1 - c01 * x0) / det;
  }
  const eps = 1e-6 * segLen;
  if (!(alpha1 > eps) || !(alpha2 > eps) || alpha1 > segLen * 3 || alpha2 > segLen * 3) {
    alpha1 = alpha2 = segLen / 3;
  }
  return [p0, add(p0, mul(t1, alpha1)), add(p3, mul(t2, alpha2)), p3];
}

function maxError(pts: Vec[], b: Bez, u: number[]): { err: number; at: number } {
  let err = 0;
  let at = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = dist(bezAt(b, u[i]), pts[i]);
    if (d > err) {
      err = d;
      at = i;
    }
  }
  return { err, at };
}

function reparameterize(pts: Vec[], u: number[], b: Bez): number[] {
  return u.map((t, i) => {
    const q = bezAt(b, t);
    const q1 = bezD1(b, t);
    const q2 = bezD2(b, t);
    const diff = sub(q, pts[i]);
    const num = dot(diff, q1);
    const den = dot(q1, q1) + dot(diff, q2);
    if (Math.abs(den) < 1e-12) return t;
    const nt = t - num / den;
    return nt < 0 ? 0 : nt > 1 ? 1 : nt;
  });
}

function fitCubics(pts: Vec[], t1: Vec, t2: Vec, tol: number, depth = 0): Bez[] {
  const n = pts.length;
  if (n === 2 || depth > 24) {
    const l = dist(pts[0], pts[n - 1]) / 3;
    return [[pts[0], add(pts[0], mul(t1, l)), add(pts[n - 1], mul(t2, l)), pts[n - 1]]];
  }
  let u = chordParams(pts);
  let b = generateBezier(pts, u, t1, t2);
  let { err, at } = maxError(pts, b, u);
  if (err <= tol) return [b];
  if (err <= tol * 4) {
    for (let it = 0; it < 16; it++) {
      u = reparameterize(pts, u, b);
      b = generateBezier(pts, u, t1, t2);
      ({ err, at } = maxError(pts, b, u));
      if (err <= tol) return [b];
    }
  }
  if (at <= 0) at = 1;
  if (at >= n - 1) at = n - 2;
  const tc = unit(sub(pts[Math.max(0, at - 1)], pts[Math.min(n - 1, at + 1)]));
  const left = fitCubics(pts.slice(0, at + 1), t1, tc, tol, depth + 1);
  const right = fitCubics(pts.slice(at), mul(tc, -1), t2, tol, depth + 1);
  return [...left, ...right];
}

/** مماسٌّ عند طرفٍ مقدَّرٌ من نقاطٍ قليلة (لا من جارٍ واحدٍ يرتجف). */
function endTangent(pts: Vec[], fromStart: boolean): Vec {
  const n = pts.length;
  const k = Math.min(n - 1, 4);
  return fromStart ? unit(sub(pts[k], pts[0])) : unit(sub(pts[n - 1 - k], pts[n - 1]));
}

function isStraight(pts: Vec[], tol: number): boolean {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const ab = sub(b, a);
  const l = len(ab);
  if (l < 1e-9) return false;
  for (const p of pts) if (Math.abs(cross(ab, sub(p, a))) / l > tol) return false;
  return true;
}

/** زوايا حادّة على مقطعٍ مفتوح أو محيطٍ مغلق: انعطافٌ أكبر من ٤٥° بين اتّجاهَي
 * ثلاث نقاطٍ قبل وبعد، وقمّةٌ محلّيّة. */
function findCorners(pts: Vec[], closed: boolean): number[] {
  const n = pts.length;
  const K = 3;
  const turn = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (!closed && (i < K || i >= n - K)) continue;
    const a = pts[(i - K + n) % n];
    const b = pts[i];
    const c = pts[(i + K) % n];
    const u1 = unit(sub(b, a));
    const u2 = unit(sub(c, b));
    turn[i] = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))));
  }
  const out: number[] = [];
  const TH = (45 * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    if (turn[i] < TH) continue;
    let isMax = true;
    for (let d = -K; d <= K && isMax; d++) {
      if (!d) continue;
      const j = closed ? (i + d + n) % n : i + d;
      if (j < 0 || j >= n) continue;
      if (turn[j] > turn[i] || (turn[j] === turn[i] && d < 0)) isMax = false;
    }
    if (isMax) out.push(i);
  }
  return out;
}

function cubicSegs(bs: Bez[]): Seg[] {
  return bs.map((b) => ({ kind: 'C' as const, p0: b[0], c1: b[1], c2: b[2], p1: b[3] }));
}

/** مقطعٌ مفتوحٌ بين زاويتين (أو طرفَي منطقةٍ بين خطّين): خطٌّ إن استقام، وإلا منحنيات. */
function fitOpen(pts: Vec[], t1: Vec | null, t2: Vec | null, tol: number): Seg[] {
  if (pts.length < 2) return [];
  if (pts.length === 2 || isStraight(pts, Math.min(0.45, tol))) return [{ kind: 'L', p0: pts[0], p1: pts[pts.length - 1] }];
  // زوايا داخل المقطع: يُقسَم عندها بلا اشتراط التماسّ.
  const corners = findCorners(pts, false).filter((i) => i > 1 && i < pts.length - 2);
  if (corners.length) {
    const out: Seg[] = [];
    let start = 0;
    let st = t1;
    for (const ci of [...corners, pts.length - 1]) {
      const piece = pts.slice(start, ci + 1);
      const et = ci === pts.length - 1 ? t2 : null;
      out.push(...fitOpen(piece, st, et, tol));
      start = ci;
      st = null;
    }
    return out;
  }
  return cubicSegs(fitCubics(pts, t1 ?? endTangent(pts, true), t2 ?? endTangent(pts, false), tol));
}

/** محيطٌ مغلقٌ بلا خطوطٍ طويلة: يُقسَم عند زواياه، أو — إن لم تكن — إلى أرباعٍ
 * بمماسّاتٍ مشتركة عند نقاط التقسيم فيبقى ناعمًا. */
function fitClosedCurve(pts: Vec[], tol: number): Seg[] {
  const n = pts.length;
  const corners = findCorners(pts, true);
  if (corners.length) {
    const out: Seg[] = [];
    for (let k = 0; k < corners.length; k++) {
      const a = corners[k];
      const b = corners[(k + 1) % corners.length];
      const idx = corners.length === 1 ? [...between(n, a, (a - 1 + n) % n), a] : between(n, a, b);
      out.push(...fitOpen(idx.map((i) => pts[i]), null, null, tol));
    }
    return out;
  }
  // كما يرسم المصمّم الدائرة: نقاطٌ عند الأطراف الأربعة (أقصى اليسار والأعلى واليمين
  // والأسفل) بمقابض أفقيّةٍ أو عموديّة تمامًا.
  const extreme = (key: (p: Vec) => number): number => {
    let at = 0;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const v = key(pts[i]);
      if (v < best) {
        best = v;
        at = i;
      }
    }
    // وسطُ الجزء المسطّح عند الطرف (قد تتساوى نقاطٌ متتالية تقريبًا).
    let lo = 0;
    let hi = 0;
    while (lo < n / 8 && key(pts[(at - lo - 1 + n) % n]) <= best + 0.15) lo++;
    while (hi < n / 8 && key(pts[(at + hi + 1) % n]) <= best + 0.15) hi++;
    return (at + Math.round((hi - lo) / 2) + n) % n;
  };
  const ext = [
    { i: extreme((p) => p.x), axis: 'v' },
    { i: extreme((p) => p.y), axis: 'h' },
    { i: extreme((p) => -p.x), axis: 'v' },
    { i: extreme((p) => -p.y), axis: 'h' },
  ].sort((a, b) => a.i - b.i);
  const minGap = Math.max(3, Math.floor(n / 24));
  const splits = ext.filter((e, k) => k === 0 || e.i - ext[k - 1].i >= minGap);
  if (splits.length > 1 && splits[0].i + n - splits[splits.length - 1].i < minGap) splits.pop();
  const tan = (s: { i: number; axis: string }): Vec => {
    const raw = unit(sub(pts[(s.i + 2) % n], pts[(s.i - 2 + n) % n]));
    const SNAP = Math.sin((15 * Math.PI) / 180);
    if (s.axis === 'v' && Math.abs(raw.x) < SNAP) return { x: 0, y: Math.sign(raw.y) || 1 };
    if (s.axis === 'h' && Math.abs(raw.y) < SNAP) return { x: Math.sign(raw.x) || 1, y: 0 };
    return raw;
  };
  const out: Seg[] = [];
  for (let k = 0; k < splits.length; k++) {
    const a = splits[k];
    const b = splits[(k + 1) % splits.length];
    const piece = (splits.length === 1 ? [...between(n, a.i, (a.i - 1 + n) % n), a.i] : between(n, a.i, b.i)).map((i) => pts[i]);
    if (piece.length < 2) continue;
    out.push(...cubicSegs(fitCubics(piece, tan(a), mul(tan(b), -1), tol)));
  }
  return out;
}

// ─── التدوير الدائريّ بين خطّين ───

interface Fillet {
  r: number;
  A: Vec;
  B: Vec;
  h: number;
  rms: number;
  max: number;
}

/** أفضل قوسٍ دائريّ مماسٍّ للخطّين يمرّ بنقاط المنطقة بينهما (نصف القطر صفر = زاوية حادّة). */
function bestFillet(zone: Vec[], V: Vec, d1: Vec, d2: Vec, tMax: number): Fillet | null {
  const theta = Math.acos(Math.max(-1, Math.min(1, dot(d1, d2))));
  if (theta < (1 * Math.PI) / 180 || theta > (178 * Math.PI) / 180) return null;
  const turnSign = cross(d1, d2) > 0 ? 1 : -1;
  const n1 = { x: -d1.y * turnSign, y: d1.x * turnSign };
  const tanHalf = Math.tan(theta / 2);
  const evalR = (r: number, zone: Vec[]): { rms: number; max: number; A: Vec; B: Vec; h: number } => {
    const t = r * tanHalf;
    const A = sub(V, mul(d1, t));
    const B = add(V, mul(d2, t));
    const C = add(A, mul(n1, r));
    const a0 = Math.atan2(A.y - C.y, A.x - C.x);
    const a1 = Math.atan2(B.y - C.y, B.x - C.x);
    let span = a1 - a0;
    while (span > Math.PI) span -= 2 * Math.PI;
    while (span < -Math.PI) span += 2 * Math.PI;
    let s2 = 0;
    let mx = 0;
    for (const p of zone) {
      let best = Infinity;
      // الخطّ الأوّل حتى A
      if (dot(sub(p, A), d1) <= 0) best = Math.min(best, Math.abs(cross(d1, sub(p, A))));
      // الخطّ الثاني من B
      if (dot(sub(p, B), d2) >= 0) best = Math.min(best, Math.abs(cross(d2, sub(p, B))));
      if (r > 1e-9) {
        const ap = Math.atan2(p.y - C.y, p.x - C.x);
        let rel = ap - a0;
        while (rel > Math.PI) rel -= 2 * Math.PI;
        while (rel < -Math.PI) rel += 2 * Math.PI;
        const inside = span >= 0 ? rel >= 0 && rel <= span : rel <= 0 && rel >= span;
        if (inside) best = Math.min(best, Math.abs(dist(p, C) - r));
      }
      best = Math.min(best, dist(p, A), dist(p, B));
      s2 += best * best;
      if (best > mx) mx = best;
    }
    const h = (4 / 3) * Math.tan(theta / 4) * r;
    return { rms: Math.sqrt(s2 / Math.max(1, zone.length)), max: mx, A, B, h };
  };
  const rMax = tanHalf > 1e-9 ? tMax / tanHalf : 0;
  // البحث الخشن على عيّنةٍ من النقاط (منطقةٌ طويلة قد تبلغ آلاف النقاط)، وبخطواتٍ
  // تكبر مع نصف القطر (٤٪) — ثم تنقيحٌ على النقاط كلّها.
  const stride = Math.max(1, Math.floor(zone.length / 160));
  const coarse = stride === 1 ? zone : zone.filter((_, i) => i % stride === 0 || i === zone.length - 1);
  let bestR = -1;
  let bestRms = Infinity;
  const tryCoarse = (r: number) => {
    if (r < 0 || r > rMax) return;
    const e = evalR(r, coarse);
    if (e.rms < bestRms) {
      bestRms = e.rms;
      bestR = r;
    }
  };
  tryCoarse(0);
  for (let r = 0.5; r <= rMax; r += r < 10 ? 0.25 : r * 0.04) tryCoarse(r);
  if (bestR < 0) return null;
  const step = bestR < 10 ? 0.25 : bestR * 0.04;
  let lo = Math.max(0, bestR - step);
  let hi = Math.min(rMax, bestR + step);
  for (let it = 0; it < 20; it++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (evalR(m1, zone).rms < evalR(m2, zone).rms) hi = m2;
    else lo = m1;
  }
  let best: Fillet | null = null;
  for (const r of [bestR, (lo + hi) / 2]) {
    const e = evalR(r, zone);
    if (!best || e.rms < best.rms) best = { r, ...e };
  }
  return best;
}

/** يُلائم محيطًا مغلقًا واحدًا. */
function fitContour(pts: Vec[], tol: number): Seg[] {
  const n = pts.length;
  if (n < 4) return pts.map((p, i) => ({ kind: 'L' as const, p0: p, p1: pts[(i + 1) % n] }));
  const lines = findLines(pts);
  if (lines.length < 2) return fitClosedCurve(pts, tol);

  const m = lines.length;
  // نهايتا كلّ منطقةٍ بين خطّين على الخطّين نفسيهما، وهندستها.
  const zoneStart: Vec[] = new Array(m);
  const zoneEnd: Vec[] = new Array(m);
  const zoneSegs: Seg[][] = new Array(m);
  for (let k = 0; k < m; k++) {
    const La = lines[k];
    const Lb = lines[(k + 1) % m];
    const zIdx = between(n, La.i1, Lb.i0);
    const zone = zIdx.map((i) => pts[i]);
    // مساحةٌ متاحةٌ على كلّ خطٍّ لِطرَف التدوير: نصف طوله (فلا يتداخل تدويرا طرفيه).
    const lenA = dist(projectOnLine(pts[La.i0], La.c, La.d), projectOnLine(pts[La.i1], La.c, La.d));
    const lenB = dist(projectOnLine(pts[Lb.i0], Lb.c, Lb.d), projectOnLine(pts[Lb.i1], Lb.c, Lb.d));
    const V = lineIntersect(La.c, La.d, Lb.c, Lb.d);
    let done = false;
    if (V) {
      const zoneExtent = zone.reduce((mx, p) => Math.max(mx, dist(p, V)), 0);
      const vNear = dist(V, pts[La.i1]) < Math.max(12, 3 * zoneExtent + 3) && dist(V, pts[Lb.i0]) < Math.max(12, 3 * zoneExtent + 3);
      if (vNear) {
        const tMax = Math.min(dist(V, projectOnLine(pts[La.i0], La.c, La.d)) - lenA * 0.5, dist(V, projectOnLine(pts[Lb.i1], Lb.c, Lb.d)) - lenB * 0.5);
        const f = bestFillet([pts[La.i1], ...zone, pts[Lb.i0]], V, La.d, Lb.d, Math.max(0, tMax));
        if (f && f.max <= 1.2 && f.rms <= 0.65) {
          if (f.r < 3.5 || f.h < 1.6) {
            zoneStart[k] = V;
            zoneEnd[k] = V;
            zoneSegs[k] = [];
          } else {
            zoneStart[k] = f.A;
            zoneEnd[k] = f.B;
            zoneSegs[k] = [{ kind: 'C', p0: f.A, c1: add(f.A, mul(La.d, f.h)), c2: sub(f.B, mul(Lb.d, f.h)), p1: f.B }];
          }
          done = true;
        }
      }
    }
    if (!done) {
      const q0 = projectOnLine(pts[La.i1], La.c, La.d);
      const q1 = projectOnLine(pts[Lb.i0], Lb.c, Lb.d);
      const inner = zone.length > 2 ? zone.slice(1, -1) : [];
      const piece = [q0, ...inner, q1];
      zoneStart[k] = q0;
      zoneEnd[k] = q1;
      zoneSegs[k] = piece.length < 3 ? [{ kind: 'L', p0: q0, p1: q1 }] : fitOpen(piece, La.d, mul(Lb.d, -1), tol);
    }
  }
  const out: Seg[] = [];
  for (let k = 0; k < m; k++) {
    // الخطّ k يبدأ عند نهاية المنطقة السابقة وينتهي عند بداية المنطقة k.
    const s = zoneEnd[(k - 1 + m) % m];
    const e = zoneStart[k];
    const L = lines[k];
    if (dot(sub(e, s), L.d) < -0.5) return fitClosedCurve(pts, tol); // تداخلٌ: الأسلم المنحنيات
    if (dist(s, e) > 1e-6) out.push({ kind: 'L', p0: s, p1: e });
    out.push(...zoneSegs[k]);
  }
  return out;
}

/** مفتاحٌ رقميّ لخليّة الشبكة (أسرع من نصٍّ، ولا يُثقل جامع المهملات). */
function cellKey(gx: number, gy: number): number {
  return (gx + 32768) * 65536 + (gy + 32768);
}

/** أكبر بُعدٍ لنقاط المحيط عن المسار الملائم (عيّناتٌ كثيفة + شبكةٌ مكانيّة). */
function deviation(pts: Vec[], segs: Seg[]): number {
  const samples: Vec[] = [];
  for (const s of segs) {
    if (s.kind === 'L') {
      const l = dist(s.p0, s.p1);
      const k = Math.max(1, Math.ceil(l / 0.5));
      for (let i = 0; i < k; i++) samples.push(lerp(s.p0, s.p1, i / k));
    } else {
      const b: Bez = [s.p0, s.c1, s.c2, s.p1];
      const l = dist(s.p0, s.c1) + dist(s.c1, s.c2) + dist(s.c2, s.p1);
      const k = Math.max(2, Math.ceil(l / 0.5));
      for (let i = 0; i < k; i++) samples.push(bezAt(b, i / k));
    }
  }
  const cell = 4;
  const grid = new Map<number, Vec[]>();
  for (const p of samples) {
    const key = cellKey(Math.floor(p.x / cell), Math.floor(p.y / cell));
    let arr = grid.get(key);
    if (!arr) grid.set(key, (arr = []));
    arr.push(p);
  }
  let worst = 0;
  for (const p of pts) {
    const gx = Math.floor(p.x / cell);
    const gy = Math.floor(p.y / cell);
    let best = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const arr = grid.get(cellKey(gx + dx, gy + dy));
        if (!arr) continue;
        for (const q of arr) {
          const d = dist(p, q);
          if (d < best) best = d;
        }
      }
    }
    if (best > worst) worst = best;
  }
  return worst;
}

/** من مقاطع متتابعة إلى نقاط ربطٍ بمقبضين. */
function segsToAnchors(segs: Seg[]): TraceAnchor[] {
  const out: TraceAnchor[] = [];
  for (const s of segs) {
    const p0 = s.p0;
    const last = out[out.length - 1];
    let a: TraceAnchor;
    if (last && dist(last, p0) < 1e-4) a = last;
    else {
      a = { x: p0.x, y: p0.y, in: null, out: null };
      out.push(a);
    }
    if (s.kind === 'C') a.out = sub(s.c1, p0);
    const b: TraceAnchor = { x: s.p1.x, y: s.p1.y, in: s.kind === 'C' ? sub(s.c2, s.p1) : null, out: null };
    out.push(b);
  }
  // الأخير يعود إلى الأوّل: يُدمج فيه.
  if (out.length > 1 && dist(out[0], out[out.length - 1]) < 1e-4) {
    const last = out.pop()!;
    out[0].in = last.in;
  }
  // نقاطٌ متطابقةٌ تقريبًا (طرفا خطٍّ طوله صفر): تُدمج.
  const merged: TraceAnchor[] = [];
  for (const a of out) {
    const prev = merged[merged.length - 1];
    if (prev && dist(prev, a) < 0.05) {
      prev.out = a.out;
      continue;
    }
    merged.push(a);
  }
  if (merged.length > 1 && dist(merged[0], merged[merged.length - 1]) < 0.05) {
    const last = merged.pop()!;
    merged[0].in = last.in;
  }
  // مقبضٌ أقصر من جزءٍ من البكسل لا معنى له.
  for (const a of merged) {
    if (a.in && len(a.in) < 0.02) a.in = null;
    if (a.out && len(a.out) < 0.02) a.out = null;
  }
  return merged;
}

function reverseAnchors(as: TraceAnchor[]): TraceAnchor[] {
  return as
    .slice()
    .reverse()
    .map((a) => ({ x: a.x, y: a.y, in: a.out, out: a.in }));
}

function anchorsArea(as: TraceAnchor[]): number {
  return signedArea(as.map((a) => ({ x: a.x, y: a.y })));
}

// ─── التبسيط: دمج المقاطع المتتابعة بانسياب ───

function startDir(s: Seg): Vec {
  if (s.kind === 'L') return unit(sub(s.p1, s.p0));
  const d = sub(s.c1, s.p0);
  if (len(d) > 1e-9) return unit(d);
  const e = sub(s.c2, s.p0);
  return len(e) > 1e-9 ? unit(e) : unit(sub(s.p1, s.p0));
}

function endDir(s: Seg): Vec {
  if (s.kind === 'L') return unit(sub(s.p1, s.p0));
  const d = sub(s.p1, s.c2);
  if (len(d) > 1e-9) return unit(d);
  const e = sub(s.p1, s.c1);
  return len(e) > 1e-9 ? unit(e) : unit(sub(s.p1, s.p0));
}

/** لكلّ نقطةٍ من المحيط: المقطعُ الأقرب إليها وموضعها عليه — ليُلاءَم الدمجُ على
 * المحيط الأصليّ نفسه لا على مقاطعَ ملاءَمةٍ قبله (فلا يتراكم الخطأ). */
function ownersOf(pts: Vec[], segs: Seg[]): Array<{ s: number; t: number }> {
  const cell = 4;
  const grid = new Map<number, Array<{ p: Vec; s: number; t: number }>>();
  segs.forEach((s, si) => {
    const l = s.kind === 'L' ? dist(s.p0, s.p1) : dist(s.p0, s.c1) + dist(s.c1, s.c2) + dist(s.c2, s.p1);
    const k = Math.max(2, Math.ceil(l / 0.4));
    for (let i = 0; i <= k; i++) {
      const t = i / k;
      const p = s.kind === 'L' ? lerp(s.p0, s.p1, t) : bezAt([s.p0, s.c1, s.c2, s.p1], t);
      const key = cellKey(Math.floor(p.x / cell), Math.floor(p.y / cell));
      let arr = grid.get(key);
      if (!arr) grid.set(key, (arr = []));
      arr.push({ p, s: si, t });
    }
  });
  return pts.map((p) => {
    const gx = Math.floor(p.x / cell);
    const gy = Math.floor(p.y / cell);
    let best = { s: -1, t: 0 };
    let bd = Infinity;
    for (let r = 1; r <= 3 && best.s < 0; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const arr = grid.get(cellKey(gx + dx, gy + dy));
          if (!arr) continue;
          for (const q of arr) {
            const d = dist(p, q.p);
            if (d < bd) {
              bd = d;
              best = { s: q.s, t: q.t };
            }
          }
        }
      }
    }
    return best;
  });
}

/** يدمج كلّ مقطعين متتابعين يلتقيان بلا زاوية في منحنًى واحد، ما دام يمرّ بنقاط
 * المحيط الأصليّة ضمن السماحيّة — الأقلّ خطأً أوّلًا، حتى لا يبقى دمجٌ ممكن. هكذا يصير
 * القرصُ أربعَ نقاطٍ أو ثلاثًا لا عشرًا، وتبقى الزوايا الحادّة والأضلاع الطويلة كما هي. */
function simplify(pts: Vec[], segs: Seg[], tol: number): Seg[] {
  if (segs.length < 3) return segs;
  const own = ownersOf(pts, segs);
  // كلّ مقطعٍ حاليّ = قائمةٌ من المقاطع الأصليّة المتتابعة (لجمع نقاطه).
  type Item = { seg: Seg; parts: number[] };
  let items: Item[] = segs.map((seg, i) => ({ seg, parts: [i] }));
  const byPart: Array<Array<{ p: Vec; t: number }>> = segs.map(() => []);
  pts.forEach((p, i) => {
    const o = own[i];
    if (o.s >= 0) byPart[o.s].push({ p, t: o.t });
  });
  for (const arr of byPart) arr.sort((a, b) => a.t - b.t);
  const SMOOTH = Math.cos((4 * Math.PI) / 180);
  // محيطٌ أملسُ كلّه (بلا زاوية) يبقى بأربع نقاطٍ على الأقلّ — الدائرة أربعُ نقاطٍ عند
  // أطرافها لا ثلاثٌ في مواضع عشوائيّة. وذو الزوايا يُختصَر ما أمكن.
  const allSmooth = segs.every((s, i) => dot(endDir(s), startDir(segs[(i + 1) % segs.length])) >= SMOOTH);
  const minSegs = allSmooth ? 4 : 2;
  for (let guard = 0; guard < 400 && items.length > minSegs; guard++) {
    let best: { i: number; seg: Seg; err: number } | null = null;
    for (let i = 0; i < items.length; i++) {
      const A = items[i];
      const B = items[(i + 1) % items.length];
      if (dot(endDir(A.seg), startDir(B.seg)) < SMOOTH) continue;
      const inner: Vec[] = [];
      for (const part of [...A.parts, ...B.parts]) for (const q of byPart[part]) inner.push(q.p);
      const p0 = A.seg.p0;
      const p3 = B.seg.p1;
      const run = [p0, ...inner.filter((q) => dist(q, p0) > 1e-6 && dist(q, p3) > 1e-6), p3];
      if (run.length < 3) continue;
      let seg: Seg;
      let err: number;
      if (A.seg.kind === 'L' && B.seg.kind === 'L') {
        if (!isStraight(run, Math.min(0.45, tol))) continue;
        seg = { kind: 'L', p0, p1: p3 };
        err = 0;
      } else {
        const t1 = startDir(A.seg);
        const t2 = mul(endDir(B.seg), -1);
        let u = chordParams(run);
        let b = generateBezier(run, u, t1, t2);
        ({ err } = maxError(run, b, u));
        for (let it = 0; it < 12 && err > tol; it++) {
          u = reparameterize(run, u, b);
          b = generateBezier(run, u, t1, t2);
          ({ err } = maxError(run, b, u));
        }
        if (err > tol) continue;
        seg = { kind: 'C', p0, c1: b[1], c2: b[2], p1: p3 };
      }
      if (!best || err < best.err) best = { i, seg, err };
    }
    if (!best) break;
    const i = best.i;
    const j = (i + 1) % items.length;
    const merged: Item = { seg: best.seg, parts: [...items[i].parts, ...items[j].parts] };
    if (j === 0) items = [...items.slice(1, i), merged];
    else items = [...items.slice(0, i), merged, ...items.slice(j + 1)];
  }
  return items.map((it) => it.seg);
}

/** سماحيّة الدمج: أضيق من سماحيّة الملاءمة نفسها (٠٫٦) — فالدمجُ يختصر النقاط ولا
 * يُبعد المسار عن الحافّة. قيست على العقدة والاختبارات الاصطناعيّة: ٠٫٤٥ تُسقط
 * الدقّة، و٠٫٢٥ لا تختصر شيئًا يُذكر. */
const SIMPLIFY_TOL = 0.35;

function fitLoop(loop: Vec[], tol: number): TraceAnchor[] {
  let segs = fitContour(loop, tol);
  let dev = deviation(loop, segs);
  if (dev > 1.6) {
    const alt = fitClosedCurve(loop, tol);
    const altDev = deviation(loop, alt);
    if (altDev < dev) {
      segs = alt;
      dev = altDev;
    }
  }
  const simple = simplify(loop, segs, SIMPLIFY_TOL);
  // حارس: نقطةٌ نُسبت إلى مقطعٍ غير مقطعها (عند رأسٍ رفيع) قد تُفلت من فحص الدمج.
  if (simple.length < segs.length && deviation(loop, simple) > Math.max(dev + 0.25, tol + 0.4)) {
    return segsToAnchors(segs);
  }
  return segsToAnchors(simple);
}

// ═══════════════════════════ ٦. التجميع ═══════════════════════════

function hex(c: [number, number, number]): string {
  return `#${c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

function bboxOf(contours: TraceAnchor[][]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (x: number, y: number) => {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  };
  for (const c of contours) {
    for (const a of c) {
      take(a.x, a.y);
      if (a.in) take(a.x + a.in.x, a.y + a.in.y);
      if (a.out) take(a.x + a.out.x, a.y + a.out.y);
    }
  }
  return { x: x0, y: y0, w: Math.max(x1 - x0, 1e-6), h: Math.max(y1 - y0, 1e-6) };
}

export function traceImage(img: RgbaImage, opts: TraceOptions = {}): TraceResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { width: w, height: h } = img;
  const n = w * h;
  const maxColors = Math.max(2, Math.min(64, opts.maxColors ?? 16));
  const minArea = Math.max(4, opts.minArea ?? Math.round(Math.max(6, n * 0.000015)));
  const tol = opts.tolerance ?? 0.6;
  const includeBackground = opts.includeBackground ?? true;

  const flat = flatMask(img, 10 * 10);
  const pal = buildPalette(img, flat, maxColors);
  if (!pal.colors.length) {
    return { width: w, height: h, background: null, shapes: [], palette: [], stats: { colors: 0, regions: 0, anchors: 0, ms: 0 } };
  }
  const label = classify(img, flat, pal);
  removeSpeckles(label, w, h, minArea);
  const maxRegions = Math.max(16, opts.maxRegions ?? 1500);
  for (let a = minArea, round = 0; round < 6 && a < n / 200; round++) {
    let count = 0;
    const comps0 = components(label, w, h);
    for (let c = 0; c < comps0.count; c++) if (comps0.label[c] !== TRANSPARENT) count++;
    if (count <= maxRegions) break;
    a *= 3;
    removeSpeckles(label, w, h, a);
  }

  // الخلفيّة: الغالب على حافّة الصورة.
  const borderTally = new Map<number, number>();
  let borderTotal = 0;
  const tallyAt = (i: number) => {
    borderTally.set(label[i], (borderTally.get(label[i]) ?? 0) + 1);
    borderTotal++;
  };
  for (let x = 0; x < w; x++) {
    tallyAt(x);
    tallyAt((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    tallyAt(y * w);
    tallyAt(y * w + w - 1);
  }
  let bgLabel = -1;
  let bgCount = 0;
  for (const [l, k] of borderTally) {
    if (k > bgCount) {
      bgCount = k;
      bgLabel = l;
    }
  }
  if (bgCount < borderTotal * 0.5) bgLabel = -1;
  const bgOpaque = bgLabel >= 0 && bgLabel !== TRANSPARENT;
  const drawBgRect = bgOpaque && includeBackground;
  /** «فراغ» = ما لا يُرسم: الشفافيّة، والخلفيّة المتجاهَلة. ثقبٌ يظهر منه الفراغ يُقصّ. */
  const isEmptyLabel = (l: number) => l === TRANSPARENT || (!includeBackground && l === bgLabel);

  const comps = components(label, w, h);
  // الثقوب: لكلّ قطعةٍ تُرسم، ما داخل صندوقها ولا يصله الخارج = ثقوبها.
  const contained = new Uint8Array(comps.count);
  const filledArea = comps.area.slice();
  const needsCut = new Uint8Array(comps.count);
  const drawable = (c: number) => {
    const l = comps.label[c];
    if (isEmptyLabel(l)) return false;
    if (drawBgRect && l === bgLabel) return false; // تُقرَّر لاحقًا: الجزر داخل الثقوب وحدها
    return true;
  };
  for (let c = 0; c < comps.count; c++) {
    if (!drawable(c)) continue;
    const bx = comps.x0[c] - 1;
    const by = comps.y0[c] - 1;
    const bw = comps.x1[c] - comps.x0[c] + 3;
    const bh = comps.y1[c] - comps.y0[c] + 3;
    const g = new Uint8Array(bw * bh); // 1 = القطعة، 2 = خارج
    for (let gy = 0; gy < bh; gy++) {
      const y = by + gy;
      for (let gx = 0; gx < bw; gx++) {
        const x = bx + gx;
        if (x >= 0 && y >= 0 && x < w && y < h && comps.id[y * w + x] === c) g[gy * bw + gx] = 1;
      }
    }
    const stack: number[] = [0];
    g[0] = 2;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % bw;
      const y = (i - x) / bw;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
          const j = yy * bw + xx;
          if (g[j]) continue;
          g[j] = 2;
          stack.push(j);
        }
      }
    }
    for (let gy = 0; gy < bh; gy++) {
      for (let gx = 0; gx < bw; gx++) {
        if (g[gy * bw + gx] !== 0) continue;
        const x = bx + gx;
        const y = by + gy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        filledArea[c]++;
        contained[comps.id[i]] = 1;
        if (isEmptyLabel(label[i])) needsCut[c] = 1;
      }
    }
  }

  const order: number[] = [];
  for (let c = 0; c < comps.count; c++) {
    const l = comps.label[c];
    if (isEmptyLabel(l)) continue;
    if (drawBgRect && l === bgLabel && (comps.touchesBorder[c] || !contained[c])) continue;
    order.push(c);
  }
  order.sort((a, b) => filledArea[b] - filledArea[a]);

  const shapes: TracedShape[] = [];
  let anchors = 0;
  for (const c of order) {
    const field = coverageField(img, label, comps, c, pal, 2);
    const loops = marchingSquares(field.v, field.gw, field.gh, field.ox, field.oy);
    if (!loops.length) continue;
    loops.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
    const outerLoop = loops[0];
    let outer = fitLoop(outerLoop, tol);
    if (outer.length < 3) continue;
    // اتّجاهٌ ثابت: المحيط الخارجيّ موجب، والثقوب سالبة (nonzero يثقبها).
    if (anchorsArea(outer) < 0) outer = reverseAnchors(outer);
    const contours: TraceAnchor[][] = [outer];
    if (needsCut[c]) {
      for (const loop of loops.slice(1)) {
        if (Math.abs(signedArea(loop)) < minArea / 2) continue;
        let hole = fitLoop(loop, tol);
        if (hole.length < 3) continue;
        if (anchorsArea(hole) > 0) hole = reverseAnchors(hole);
        contours.push(hole);
      }
    }
    anchors += contours.reduce((s, k) => s + k.length, 0);
    shapes.push({ color: hex(pal.colors[comps.label[c]]), contours, filledArea: filledArea[c], bbox: bboxOf(contours) });
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    width: w,
    height: h,
    background: drawBgRect ? hex(pal.colors[bgLabel]) : null,
    shapes,
    palette: pal.colors.map(hex),
    stats: { colors: pal.colors.length, regions: shapes.length, anchors, ms: Math.round(t1 - t0) },
  };
}
