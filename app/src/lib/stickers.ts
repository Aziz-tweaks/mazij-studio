// ملصقاتُ مزيج المدمجة (٣٠ أكتوبر ٢٠٢٦). كان «ملصقات» يفتح منتقيَ ملفّات لوتي فقط، فمن لا يملك
// ملفًّا لا يجد شيئًا. هذه ثمانيةُ ملصقاتٍ متحرّكةٍ أصليّة تُبنى هنا بالكود — أشكالٌ هندسيّةٌ
// بسيطة (قلب، بريق، سهم، علامة صح…) — وتُدرَج بالمسار نفسه الذي يُدرَج به ملفُّ لوتي مرفوع،
// فتَرث التشغيلَ والتصديرَ والتكرارَ بلا مسارٍ ثانٍ.

type Vec = number[];
type Anim = { a: 0; k: number | Vec } | { a: 1; k: Array<{ t: number; s: Vec; i?: { x: Vec; y: Vec }; o?: { x: Vec; y: Vec } }> };

const FR = 30;
const ease = { i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } };
const st = (k: number | Vec): Anim => ({ a: 0, k });
/** إطاراتٌ مفتاحيّة بتخفيفٍ ناعم؛ `frames` أزواجُ [إطار، قيمة]. */
const kf = (frames: Array<[number, Vec]>): Anim => ({
  a: 1,
  k: frames.map(([t, s], idx) => (idx < frames.length - 1 ? { t, s, i: { x: ease.i.x.map(() => 0.4), y: ease.i.y.map(() => 1) }, o: { x: ease.o.x.map(() => 0.6), y: ease.o.y.map(() => 0) } } : { t, s })),
});

const rgb = (hex: string): Vec => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
};
const fill = (hex: string) => ({ ty: 'fl', c: st(rgb(hex)), o: st(100), r: 1 });
const stroke = (hex: string, w: number) => ({ ty: 'st', c: st(rgb(hex)), o: st(100), w: st(w), lc: 2, lj: 2 });
const tr = (extra: Record<string, unknown> = {}) => ({ ty: 'tr', p: st([0, 0]), a: st([0, 0]), s: st([100, 100]), r: st(0), o: st(100), ...extra });
const path = (v: Vec[], i: Vec[], o: Vec[], c: boolean) => ({ ty: 'sh', ks: st({ v, i, o, c } as unknown as Vec) });
const poly = (v: Vec[], c = true) => path(v, v.map(() => [0, 0]), v.map(() => [0, 0]), c);
const trim = (end: Anim) => ({ ty: 'tm', s: st(0), e: end, o: st(0), m: 1 });

function layer(items: unknown[], ks: Record<string, unknown> = {}, op = 60) {
  return {
    ddd: 0, ind: 1, ty: 4, nm: 'mz', sr: 1, ip: 0, op, st: 0, bm: 0,
    ks: { o: st(100), r: st(0), p: st([100, 100, 0]), a: st([0, 0, 0]), s: st([100, 100, 100]), ...ks },
    shapes: [{ ty: 'gr', it: [...items, tr()] }],
  };
}
function comp(layers: unknown[], op = 60) {
  return { v: '5.7.4', fr: FR, ip: 0, op, w: 200, h: 200, nm: 'mazij-sticker', ddd: 0, assets: [], layers: layers.map((l, i) => ({ ...(l as object), ind: i + 1 })) };
}

// قلبٌ من أربعة منحنيات حول الأصل.
const HEART = path(
  [[0, 60], [-70, -5], [0, -45], [70, -5]],
  // رأسُ القلب السفليّ حادّ: مماسّاه يصعدان، لا ينزلان.
  [[22, -24], [-15, 45], [-30, -40], [30, -50]],
  [[-22, -24], [-15, -50], [30, -40], [15, 45]],
  true,
);
// بريقٌ بأربعة رؤوسٍ مقعّرة.
// كلُّ مماسٍّ يُشدّ نحو المركز (−٠٫٦٢ من الرأس) مع ميلٍ خفيفٍ نحو الرأس المجاور.
const SPARKLE = path(
  [[0, -80], [80, 0], [0, 80], [-80, 0]],
  [[-10, 50], [-50, -10], [10, -50], [50, 10]],
  [[10, 50], [-50, 10], [-10, -50], [50, -10]],
  true,
);

export interface StickerSpec {
  id: string;
  ar: string;
  en: string;
  build: () => object;
}

export const STICKERS: StickerSpec[] = [
  {
    id: 'heart', ar: 'نبض قلب', en: 'Heartbeat',
    build: () => comp([layer([HEART, fill('#FF4D6D')], { s: kf([[0, [100, 100, 100]], [8, [118, 118, 100]], [16, [100, 100, 100]], [24, [112, 112, 100]], [32, [100, 100, 100]], [60, [100, 100, 100]]]) })]),
  },
  {
    id: 'sparkle', ar: 'بريق', en: 'Sparkle',
    build: () => comp([layer([SPARKLE, fill('#FFD60A')], { s: kf([[0, [0, 0, 100]], [15, [100, 100, 100]], [45, [100, 100, 100]], [60, [0, 0, 100]]]), r: kf([[0, [0]], [60, [90]]]) })]),
  },
  {
    id: 'arrow', ar: 'سهم يرتدّ', en: 'Bouncing arrow',
    build: () => comp([layer([poly([[-22, -70], [22, -70], [22, 0], [55, 0], [0, 65], [-55, 0], [-22, 0]]), fill('#3B82F6')], { p: kf([[0, [100, 92, 0]], [15, [100, 112, 0]], [30, [100, 92, 0]]]) }, 30)], 30),
  },
  {
    id: 'check', ar: 'علامة صح', en: 'Check',
    build: () => comp([
      layer([{ ty: 'el', p: st([0, 0]), s: st([170, 170]) }, fill('#22C55E')], { s: kf([[0, [0, 0, 100]], [12, [108, 108, 100]], [18, [100, 100, 100]]]) }),
      layer([poly([[-40, 2], [-12, 32], [44, -30]], false), stroke('#FFFFFF', 16), trim(kf([[10, [0]], [30, [100]]]))]),
    ]),
  },
  {
    id: 'circle', ar: 'دائرة تحديد', en: 'Circle mark',
    build: () => comp([layer([{ ty: 'el', p: st([0, 0]), s: st([170, 120]) }, stroke('#FF6B35', 9), trim(kf([[0, [0]], [24, [100]]]))], { r: st(-8) })]),
  },
  {
    id: 'star', ar: 'نجمة دوّارة', en: 'Spinning star',
    build: () => comp([layer([{ ty: 'sr', sy: 1, d: 1, pt: st(5), p: st([0, 0]), r: st(0), ir: st(34), is: st(0), or: st(78), os: st(0) }, fill('#F59E0B')], { r: kf([[0, [0]], [60, [72]]]), s: kf([[0, [90, 90, 100]], [30, [105, 105, 100]], [60, [90, 90, 100]]]) })]),
  },
  {
    id: 'live', ar: 'مباشر', en: 'Live dot',
    build: () => comp([
      layer([{ ty: 'el', p: st([0, 0]), s: st([60, 60]) }, stroke('#EF4444', 6)], { s: kf([[0, [100, 100, 100]], [40, [260, 260, 100]]]), o: kf([[0, [100]], [40, [0]]]) }, 40),
      layer([{ ty: 'el', p: st([0, 0]), s: st([60, 60]) }, fill('#EF4444')], {}, 40),
    ], 40),
  },
  {
    id: 'underline', ar: 'خطّ تأكيد', en: 'Underline swoosh',
    build: () => comp([layer([path([[-85, 10], [85, -5]], [[0, 0], [-60, -25]], [[60, 25], [0, 0]], false), stroke('#8B5CF6', 12), trim(kf([[0, [0]], [20, [100]]]))])]),
  },
];

/** ملفُّ لوتي جاهزٌ للمسار نفسه الذي يأخذه ملفٌّ مرفوع (`insertLottieFromFile`). */
export function stickerFile(s: StickerSpec): File {
  return new File([JSON.stringify(s.build())], `${s.id}.json`, { type: 'application/json' });
}
