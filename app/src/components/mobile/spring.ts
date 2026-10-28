/** **نابضٌ يُقاطَع** — الحركةُ التي يلمسها الإصبع (مهارة apple-design §٣–٦).
 *
 * لا مكتبة: نابضٌ مُخمَّدٌ بمعاملَي آبل — `damping` (١ = بلا ارتداد) و`response`
 * (ثوانٍ تقريبيّة للوصول) — يُدمَج بخطوةٍ ثابتة داخل `requestAnimationFrame`.
 * يبدأ دائمًا من **القيمة الحيّة** وسرعتها، فالإمساكُ في منتصف الطريق وعكسُ الاتجاه
 * لا يقفزان، والإفلاتُ يُسلِّم سرعةَ الإصبع للنابض فلا يُرى خيطٌ بين السحب والحركة. */

export interface SpringOpts {
  damping?: number;
  response?: number;
}

export function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export class Spring {
  value: number;
  velocity = 0;
  private target: number;
  private raf = 0;
  private last = 0;
  private k = 0;
  private c = 0;
  private onDone: (() => void) | null = null;

  constructor(
    initial: number,
    private readonly onFrame: (v: number) => void,
  ) {
    this.value = initial;
    this.target = initial;
  }

  get animating() {
    return this.raf !== 0;
  }

  /** يقفز بلا حركة — للسحب ١:١ تحت الإصبع. */
  set(v: number, velocity = 0) {
    this.stop();
    this.value = v;
    this.target = v;
    this.velocity = velocity;
    this.onFrame(v);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  to(target: number, opts: SpringOpts & { velocity?: number } = {}, onDone?: () => void) {
    const damping = opts.damping ?? 1;
    const response = opts.response ?? 0.38;
    if (opts.velocity !== undefined) this.velocity = opts.velocity;
    this.target = target;
    this.onDone = onDone ?? null;
    // كتلة = ١: k = (2π/response)²، c = 4π·damping/response
    this.k = Math.pow((2 * Math.PI) / response, 2);
    this.c = (4 * Math.PI * damping) / response;
    if (reducedMotion()) {
      this.set(target);
      this.onDone?.();
      return;
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number) => {
    let dt = Math.min(0.064, (now - this.last) / 1000);
    this.last = now;
    // خطواتٌ ثابتة صغيرة: ثباتٌ عدديّ على ٦٠ و١٢٠ هرتز معًا.
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      const f = -this.k * (this.value - this.target) - this.c * this.velocity;
      this.velocity += f * h;
      this.value += this.velocity * h;
      dt -= h;
    }
    const settled = Math.abs(this.value - this.target) < 0.25 && Math.abs(this.velocity) < 2;
    if (settled) {
      this.value = this.target;
      this.velocity = 0;
      this.onFrame(this.value);
      this.raf = 0;
      const done = this.onDone;
      this.onDone = null;
      done?.();
      return;
    }
    this.onFrame(this.value);
    this.raf = requestAnimationFrame(this.tick);
  };
}

/** أين سيستقرّ القذف لو تُرك — دالّة آبل الأسّية (لا v²/2a). */
export function project(velocityPxPerSec: number, decel = 0.998): number {
  return ((velocityPxPerSec / 1000) * decel) / (1 - decel);
}

/** مقاومةٌ متدرّجة خلف الحدّ بدل التوقّف الصلب. */
export function rubberband(overshoot: number, dimension: number, c = 0.55): number {
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}

/** سرعةٌ من آخر نقاط الحركة (بكسل/ثانية) — لا من النقطة الأخيرة وحدها. */
export class VelocityTracker {
  private pts: Array<{ v: number; t: number }> = [];
  push(v: number, t = performance.now()) {
    this.pts.push({ v, t });
    while (this.pts.length > 2 && t - this.pts[0].t > 100) this.pts.shift();
  }
  get(): number {
    if (this.pts.length < 2) return 0;
    const a = this.pts[0];
    const b = this.pts[this.pts.length - 1];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? (b.v - a.v) / dt : 0;
  }
  reset() {
    this.pts = [];
  }
}
