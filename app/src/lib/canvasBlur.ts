/** **ضبابيّةُ القماش التي تعمل في WebKit** (٢٩ أكتوبر ٢٠٢٦).
 *
 * `ctx.filter = 'blur(…)'` لا يرسم شيئًا في WebKit — محرّكِ مزيج على الماك والآيفون —
 * فكانت ضبابيّةُ العناصر في الفيديو المُصدَّر تختفي بصمت (المعاينةُ بـCSS سليمة).
 * هنا بديلٌ واحدٌ يستعمله كلُّ من يحتاج ضبابيّة على القماش: يُصغَّر المصدرُ أولًا (الضبابُ
 * لا يحتاج دقّة)، ثم ثلاثُ تمريراتِ صندوقٍ **على ألوانٍ مضروبةٍ في الشفافيّة** — بغيرها
 * تكتسب حوافُّ الحروف هالةً داكنة من البكسلات الشفّافة السوداء — ثم يُكبَّر في مكانه.
 * وحيث يعمل `ctx.filter` (كروميوم) يُستعمل هو، فلا يتغيّر شيءٌ هناك. */

type Ctx = CanvasRenderingContext2D;

let filterWorks: boolean | null = null;
/** هل يرسم هذا المحرّك `ctx.filter` فعلًا؟ يُقاس مرّةً برسمٍ حقيقيّ لا بوجود الخاصيّة. */
export function canvasFilterWorks(): boolean {
  if (filterWorks !== null) return filterWorks;
  try {
    const c = document.createElement('canvas');
    c.width = 21;
    c.height = 1;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (!x) return (filterWorks = false);
    x.filter = 'blur(3px)';
    x.fillStyle = '#000';
    x.fillRect(10, 0, 1, 1);
    filterWorks = x.getImageData(5, 0, 1, 1).data[3] > 0;
  } catch {
    filterWorks = false;
  }
  return filterWorks;
}

/** **هرمُ تصغير على المعالج الرسوميّ** — لا قراءةَ بكسلات: كلُّ مستوىً نصفُ الذي قبله
 * بتنعيمٍ عالٍ، ثم صعودٌ مستوىً مستوىً. يقارب الغاوسيّة بما يكفي للضباب واللطخة والزجاج،
 * وأسرعُ بمراتب من صندوقٍ على `getImageData` (الذي جعل تصديرَ فيلمٍ يأخذ ساعةً ونصفًا). */
const levels: HTMLCanvasElement[] = [];
function level(i: number, w: number, h: number): CanvasRenderingContext2D | null {
  if (!levels[i]) levels[i] = document.createElement('canvas');
  const c = levels[i];
  if (c.width < w || c.height < h) {
    c.width = Math.max(c.width, w);
    c.height = Math.max(c.height, h);
  }
  const x = c.getContext('2d');
  if (!x) return null;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.clearRect(0, 0, w, h);
  return x;
}

/** يرسم منطقةً من `src` على `dst` مضبَّبةً بانحرافٍ `sigma` (بكسلُ جهاز)، بحالة `dst`
 * الحاليّة كما هي (الشفافيّة، طريقة التركيب، القصّ) وبمصفوفةٍ محايدة. */
export function drawBlurred(dst: Ctx, src: CanvasImageSource, sx: number, sy: number, W: number, H: number, dx: number, dy: number, sigma: number): void {
  if (sigma <= 0.05) {
    dst.save();
    dst.setTransform(1, 0, 0, 1, 0, 0);
    dst.drawImage(src, sx, sy, W, H, dx, dy, W, H);
    dst.restore();
    return;
  }
  if (canvasFilterWorks()) {
    dst.save();
    dst.setTransform(1, 0, 0, 1, 0, 0);
    dst.filter = `blur(${sigma.toFixed(2)}px)`;
    dst.drawImage(src, sx, sy, W, H, dx, dy, W, H);
    dst.restore();
    return;
  }
  // عددُ المستويات: كلُّ تنصيفٍ يضيف نحو ضعفِ الانتشار. تحت بكسلٍ واحد لا يُرى الضباب.
  const n = Math.max(0, Math.min(8, Math.round(Math.log2(Math.max(1, sigma / 0.75)))));
  if (n === 0) {
    dst.save();
    dst.setTransform(1, 0, 0, 1, 0, 0);
    dst.drawImage(src, sx, sy, W, H, dx, dy, W, H);
    dst.restore();
    return;
  }
  const m = Math.ceil(sigma * 2.5); // هامشٌ ينتشر فيه الضباب
  const w0 = W + 2 * m;
  const h0 = H + 2 * m;
  const base = level(0, w0, h0);
  if (!base) return;
  base.drawImage(src, sx, sy, W, H, m, m, W, H);
  const sizes: [number, number][] = [[w0, h0]];
  for (let i = 1; i <= n; i++) {
    const [pw, ph] = sizes[i - 1];
    const w = Math.max(1, Math.ceil(pw / 2));
    const h = Math.max(1, Math.ceil(ph / 2));
    const x = level(i, w, h);
    if (!x) return;
    x.drawImage(levels[i - 1], 0, 0, pw, ph, 0, 0, w, h);
    sizes.push([w, h]);
  }
  // صعودٌ مستوىً مستوىً — قفزةٌ واحدةٌ من الأصغر تُظهر مربّعات.
  for (let i = n - 1; i >= 1; i--) {
    const [w, h] = sizes[i];
    const [cw, ch] = sizes[i + 1];
    const x = level(i, w, h);
    if (!x) return;
    x.drawImage(levels[i + 1], 0, 0, cw, ch, 0, 0, w, h);
  }
  const [lw, lh] = sizes[1];
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.imageSmoothingEnabled = true;
  dst.imageSmoothingQuality = 'high';
  dst.drawImage(levels[1], 0, 0, lw, lh, dx - m, dy - m, w0, h0);
  dst.restore();
}
