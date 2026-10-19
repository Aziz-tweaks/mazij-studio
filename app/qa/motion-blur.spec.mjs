#!/usr/bin/env node
// ضبابُ الحركة — الغالقُ يفتح على فترةٍ لا على لحظة.
//
// ═══════════════════════════════════════════════════════════════════════════
// ما الذي كان ناقصًا، ولماذا لا يُصنَع بالتخفيف
// ═══════════════════════════════════════════════════════════════════════════
// `videoExport.ts:78` تَبني `frameTimes[i] = i / fps` — عيّنةٌ واحدةٌ لكلّ إطارٍ
// مُخرَج. و`exportArtboard.ts` تَرسم تلك العيّنةَ وتُخرج منها ملفًّا، وتَمسح اللوحةَ
// بـ`clearRect` قبل التالية. فلا شيءَ في المسار كلِّه يَتراكم بين عيّنتين، وبحثٌ عن
// `motionBlur` أو `shutter` أو `samplesPerFrame` أو `ctx.filter` في `src/` كان
// يُخرج **صفرًا** — تُعاد القراءةُ بـ`grep -rn`.
//
// والظاهرةُ المقيسةُ في المرجع أثرُ **إطارٍ واحد**: عنصرٌ ممسوحٌ على اتّجاه سيره
// وجارٌ له حادٌّ في الإطار نفسِه. ولا دالّةُ تخفيفٍ تُنتج ذلك مهما بلغ شكلُها:
// التخفيفُ يُعطي لكلّ عنصرٍ **موضعًا واحدًا** في الإطار الواحد، والمسألةُ هنا عددُ
// العيّنات لا شكلُ المنحنى. فالقياسُ في §٣ أدناه يُثبته عددًا: الجارُ الساكنُ يقرأ
// الرقمَ نفسَه إلى آخرِ خانةٍ عند كلّ عددِ عيّنات، والمتحرّكُ وحدَه يتغيّر.
//
// ═══════════════════════════════════════════════════════════════════════════
// والأقسامُ الستّة، وما يُسقِط كلَّ واحد
// ═══════════════════════════════════════════════════════════════════════════
//   §١ جدولُ العيّنات   — `k/N` لا `(k+½)/N`، و`N=1` تُعطي `[t]` بعينها
//   §٢ التكافؤ          — زمنُ الاستقرار يُخرج البايتاتِ نفسَها عند كلّ N
//   §٣ الظاهرة          — طاقةُ التدرّج تَسقط، والجارُ الساكنُ لا يتحرّك بتّةً
//   §٤ أوزانُ التجميع   — متوسّطٌ جارٍ، لا `globalAlpha = 1/N`
//   §٥ الثمن            — مقيسٌ على شكل المرجع، ومُعلَنٌ رقمًا
//   §٦ السطح            — المِقبضُ في لوحة التصدير، وافتراضُه «بلا»
//
// التشغيل: QA_PORT=<منفذ حرّ> QA_SPECS=motion-blur npm test
import { chromium } from 'playwright';
import { bootDemoTimed } from './helpers/boot.mjs';

const BASE_URL = `http://localhost:${process.env.QA_PORT || '1420'}`;

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ok  ', msg);
  } else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}

const near = (a, b, eps) => Math.abs(a - b) <= eps;

// ─────────────────────────────────────────────────────────────────────────────
// مستندُ القياس: عنصرٌ سريعٌ وجارٌ ساكنٌ — وهي تركيبةُ المرجع بعينها.
//
// والسرعةُ ٠٫٧ من العرض في رُبع ثانية = ١٠٦٫٧ بكسل/إطار عند ٣٠. وهي ليست رقمًا
// مريحًا: مسحةُ غالقٍ ١٨٠° منها ٥٣ بكسلًا على عنصرٍ عرضُه ١٦٢ — أي نظامُ المرجع
// نفسُه. وعند سرعةٍ عاديّةٍ (١٧ بكسلًا للإطار) تكون المسحةُ ٨٫٩ بكسلًا فتَغرق في
// أرضيّة المرمِّز، فيُقاس البندُ عند حدٍّ مريحٍ لا عند الحدّ الذي سيُستعمَل عنده.
// ─────────────────────────────────────────────────────────────────────────────
const DOC = {
  fps: 30,
  tMid: 1.12, // داخل نافذة الحركة، ونافذةُ الغالق كلُّها داخلها
  tSettled: 2.9, // بعد انتهاء كلّ مقطع
  moving: { rx: 380, ry: 440, rw: 400, rh: 190 },
  still: { rx: 420, ry: 110, rw: 220, rh: 200 },
};

async function inPage(page) {
  return page.evaluate(async (DOCJ) => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const mb = await import('/src/lib/motionBlur.ts');
    const size = { w: 1080, h: 1080 };
    const palette = { bg: '#ffffff', fg: '#111111', ac: '#ffb703' };
    const mk = (id, x, y, tracks) => ({
      id, type: 'shape', visible: true, locked: false, opacity: 100, maskId: null,
      geo: { x, y, w: 0.15, h: 0.15, rotation: 0 },
      shape: 'rect', radius: 0, fill: '#111111', label: '',
      anim: { preset: 'none', start: 0, duration: 3, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks },
    });
    const kf = (time, value) => ({ time, value, easing: 'linear', bezier: [0, 0, 1, 1] });
    const fast = mk('m', 0.08, 0.42, { x: [kf(1.0, 0), kf(1.25, 0.7)] });
    const still = mk('s', 0.42, 0.12, {});
    const spec = { size, palette, elements: [fast, still], transparent: false, lang: 'en', decorAccent: false, scale: 1 };

    /** إطارٌ واحدٌ بايتاتٍ خامّة. `samples = 0` تعني «بلا وسيطِ غالقٍ إطلاقًا» —
     * أي المسارَ القديمَ حرفًا بحرف، وهو ما يُقارَن به في §٢. */
    async function frameBytes(t, samples) {
      let bytes = null;
      await mod.renderArtboardFrames(spec, [t], async (bl) => {
        bytes = new Uint8Array(await bl.arrayBuffer());
      }, samples === 0 ? {} : { shutter: { samplesPerFrame: samples, angle: 180 }, frameInterval: 1 / DOCJ.fps });
      return bytes;
    }
    const sameBytes = (a, b) => {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    };
    async function toPixels(bytes) {
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const c = new OffscreenCanvas(1080, 1080);
      const x = c.getContext('2d');
      x.drawImage(bmp, 0, 0);
      return x.getImageData(0, 0, 1080, 1080).data;
    }
    const lum = (d, X, Y) => {
      const i = ((Y * 1080) + X) * 4;
      return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    };
    /** طاقةُ التدرّج — لا متوسّطُه.
     *
     * والفرقُ ليس تفضيلًا: `mean|∂I/∂x|` **أعمى عن المسح بحكم بنائه**، لأن
     * التغايرَ الكلّيَّ محفوظٌ تحته (حافّةٌ H تُعطي H، ومسحُها إلى N درجةٍ يُعطي
     * N·(H/N) = H). قيس ذلك أوّلًا فقرأ المتوسّطُ على المُضبَّب والحادّ الرقمَ
     * نفسَه إلى أربع خانات. أمّا `Σ(∂I/∂x)²` فتُعطي H² و H²/N. */
    function energy(d, r) {
      let ex = 0;
      let ey = 0;
      let n = 0;
      for (let y = r.ry + 1; y < r.ry + r.rh - 1; y++) {
        for (let x = r.rx + 1; x < r.rx + r.rw - 1; x++) {
          const dx = (lum(d, x + 1, y) - lum(d, x - 1, y)) / 2;
          const dy = (lum(d, x, y + 1) - lum(d, x, y - 1)) / 2;
          ex += dx * dx;
          ey += dy * dy;
          n++;
        }
      }
      return { ex: ex / n, ey: ey / n };
    }

    const out = { schedule: {}, parity: {}, phenomenon: {}, weights: {}, cost: {} };

    // ── §١ جدولُ العيّنات ──────────────────────────────────────────────────
    out.schedule.n1 = mb.shutterSampleTimes(1.12, 1 / 30, { samplesPerFrame: 1, angle: 180 });
    out.schedule.n4 = mb.shutterSampleTimes(1.12, 1 / 30, { samplesPerFrame: 4, angle: 180 });
    out.schedule.n4half = mb.shutterSampleTimes(1.12, 1 / 30, { samplesPerFrame: 4, angle: 90 });
    out.schedule.angleZero = mb.shutterSampleTimes(1.12, 1 / 30, { samplesPerFrame: 8, angle: 0 });
    out.schedule.alphas = [0, 1, 2, 3, 7].map((k) => mb.runningMeanAlpha(k));
    out.schedule.optionsStartAtOne = mb.SHUTTER_SAMPLE_OPTIONS[0];

    // ── §٢ التكافؤ ────────────────────────────────────────────────────────
    const legacyMid = await frameBytes(DOCJ.tMid, 0);
    out.parity.n1EqualsLegacy = sameBytes(legacyMid, await frameBytes(DOCJ.tMid, 1));
    const legacySettled = await frameBytes(DOCJ.tSettled, 0);
    out.parity.settled = {};
    for (const N of [1, 2, 4, 8, 16]) {
      out.parity.settled[N] = sameBytes(legacySettled, await frameBytes(DOCJ.tSettled, N));
    }
    // وزمنٌ متحرّكٌ **يجب** أن يختلف — وإلّا فالقياسُ أعلاه يُثبت أن الميزةَ معطّلة
    // لا أنها محفوظةُ التكافؤ.
    out.parity.movingDiffers = !sameBytes(legacyMid, await frameBytes(DOCJ.tMid, 8));

    // ولوحةُ التجميع تُمسَح عند أوّل عيّنةٍ من كلّ إطار. ولولا ذلك لَتسرّب الإطارُ
    // السابقُ إلى الذي بعده بوزن ½ — عطلٌ **لا يَظهر إطلاقًا** في إطارٍ يُطلَب
    // وحدَه، لأن اللوحةَ تكون فارغةً أصلًا. فيُقاس بتسلسلٍ: ثلاثةُ إطاراتٍ تُطلَب
    // دفعةً واحدة، ثم يُقارَن كلٌّ منها بطلبِه منفردًا.
    {
      // والمستندُ هنا **شفّافٌ قصدًا**. فعلى مستندٍ معتمٍ لا قدرةَ لهذا القياس:
      // العيّنةُ المعتمةُ تُغطّي كلَّ بكسلٍ فتَمحو ما تحتها بلا مسح، فيَبقى
      // المُخرَجُ مطابقًا ولو رُفع `clearRect`. قيس ذلك ورُفع السطرُ فعلًا.
      // أمّا الشفّافُ — وهو مسارُ GIF — فبكسلٌ شفّافٌ لا يَمحو ما تحته.
      const tspec = { ...spec, transparent: true };
      const times = [DOCJ.tMid, DOCJ.tMid + 1 / DOCJ.fps, DOCJ.tMid + 2 / DOCJ.fps];
      const sh = { shutter: { samplesPerFrame: 8, angle: 180 }, frameInterval: 1 / DOCJ.fps };
      const seq = [];
      await mod.renderArtboardFrames(tspec, times, async (bl) => {
        seq.push(new Uint8Array(await bl.arrayBuffer()));
      }, sh);
      out.parity.noBleed = true;
      out.parity.bleedAt = null;
      for (let i = 0; i < times.length; i++) {
        let solo = null;
        await mod.renderArtboardFrames(tspec, [times[i]], async (bl) => {
          solo = new Uint8Array(await bl.arrayBuffer());
        }, sh);
        if (!sameBytes(seq[i], solo)) {
          out.parity.noBleed = false;
          out.parity.bleedAt = i;
          break;
        }
      }
    }

    // ── §٣ الظاهرة ────────────────────────────────────────────────────────
    out.phenomenon.byN = {};
    for (const N of [1, 2, 4, 8, 16]) {
      const d = await toPixels(await frameBytes(DOCJ.tMid, N));
      const m = energy(d, DOCJ.moving);
      const s = energy(d, DOCJ.still);
      out.phenomenon.byN[N] = {
        alongEnergy: m.ex, crossEnergy: m.ey, anisotropy: m.ey / m.ex,
        stillX: s.ex, stillY: s.ey,
      };
    }

    // ── §٤ أوزانُ التجميع ─────────────────────────────────────────────────
    // الوزنُ لا يُقاس بإعلانه بل بأثره. والشاهدُ المستقلّ: تُرسَم العيّناتُ الأربعُ
    // **واحدةً واحدة** بالمسارِ القديم عند أزمنتها، ثم يُؤخَذ متوسّطُها بيدِ هذا
    // الاختبار. فإن كان التجميعُ في `renderArtboardFrames` متوسّطًا جاريًا صحيحًا
    // وجب أن يُطابق الاثنان إلى حدود تقريبِ الثمانيةِ بت.
    //
    // وللاختبار قدرةٌ تُقاس لا تُدَّعى: يُحسَب أيضًا المتوسّطُ **بالأوزان الخاطئة**
    // التي يُنتجها `globalAlpha = 1/N` — أي `w_k = (1/N)·(1−1/N)^(N−1−k)` — ويُبيَّن
    // أنه يَبعد عن المقيس أضعافَ ما يَبعده الصحيح. فلو كانت التهمةُ باطلةً لَما
    // فرّق الاختبارُ بين الصيغتين أصلًا.
    {
      const N = 4;
      const times = mb.shutterSampleTimes(DOCJ.tMid, 1 / DOCJ.fps, { samplesPerFrame: N, angle: 180 });
      const samples = [];
      for (const t of times) samples.push(await toPixels(await frameBytes(t, 0)));
      const got = await toPixels(await frameBytes(DOCJ.tMid, N));

      const wrong = new Array(N);
      for (let k = 0; k < N; k++) wrong[k] = (1 / N) * ((1 - 1 / N) ** (N - 1 - k));
      const wrongSum = wrong.reduce((a, b) => a + b, 0);

      const band = { rx: 380, ry: 460, rw: 400, rh: 150 };
      let maxEqual = 0;
      let sumEqual = 0;
      let maxSkewed = 0;
      let n = 0;
      for (let y = band.ry; y < band.ry + band.rh; y++) {
        for (let x = band.rx; x < band.rx + band.rw; x++) {
          const i = ((y * 1080) + x) * 4;
          for (let ch = 0; ch < 3; ch++) {
            let eq = 0;
            let sk = 0;
            for (let k = 0; k < N; k++) {
              eq += samples[k][i + ch] / N;
              sk += samples[k][i + ch] * wrong[k];
            }
            sk /= wrongSum;
            const v = got[i + ch];
            const de = Math.abs(v - eq);
            const ds = Math.abs(v - sk);
            if (de > maxEqual) maxEqual = de;
            if (ds > maxSkewed) maxSkewed = ds;
            sumEqual += de;
            n++;
          }
        }
      }
      out.weights = { maxEqual, meanEqual: sumEqual / n, maxSkewed, wrongWeights: wrong.map((w) => w / wrongSum) };
    }

    // ── §٥ الثمن ─────────────────────────────────────────────────────────
    const big = {
      ...spec,
      size: { w: 2560, h: 1440 },
      elements: [mk('a', 0.08, 0.3, { x: [kf(3, 0), kf(3.5, 0.6)] }), mk('b', 0.5, 0.1, {}), mk('c', 0.7, 0.6, {})],
      decorAccent: true,
    };
    const frames = Array.from({ length: 360 }, (_, i) => i / 30);
    for (const N of [1, 8]) {
      const t0 = performance.now();
      await mod.renderArtboardFrames(big, frames, () => {}, N === 1 ? {} : { shutter: { samplesPerFrame: N, angle: 180 }, frameInterval: 1 / 30 });
      out.cost['N' + N] = performance.now() - t0;
    }
    return out;
  }, DOC);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  await page.goto(BASE_URL);
  await page.waitForTimeout(900);
  const r = await inPage(page);

  // ═══ §١ جدولُ العيّنات ═══════════════════════════════════════════════════
  console.log('\n§١ جدولُ العيّنات');
  assert(r.schedule.n1.length === 1 && r.schedule.n1[0] === 1.12,
    '§١ `samplesPerFrame = 1` تُعطي `[t]` بعينها — لا `t + ½φΔ`. وهذه هي المتطابقةُ التي تجعل «بلا ضباب» الكودَ القائمَ حرفًا بحرف');
  assert(r.schedule.n4.length === 4 && r.schedule.n4[0] === 1.12,
    '§١ أوّلُ عيّنةٍ عند زمن الإطار بعينه مهما بلغ عددُها — الغالقُ يفتح عند t لا قبله');
  {
    const d = r.schedule.n4.slice(1).map((v, i) => v - r.schedule.n4[i]);
    const even = d.every((v) => near(v, d[0], 1e-12));
    assert(even && near(d[0], (0.5 / 30) / 4, 1e-12),
      `§١ العيّناتُ متساويةُ التباعد على ${(0.5 / 30).toFixed(5)}ث (نصفُ فترة الإطار عند ١٨٠°) — الخُطوةُ ${d[0].toExponential(4)}`);
  }
  assert(near(r.schedule.n4half[3] - r.schedule.n4half[0], (0.25 / 30) * 0.75, 1e-12),
    '§١ زاويةُ الغالق تَضرب مدى العيّنات ضربًا — ٩٠° تُعطي رُبعَ فترة الإطار');
  assert(r.schedule.angleZero.length === 1,
    '§١ زاويةُ صفرٍ تُعطي عيّنةً واحدةً مهما بلغ العدد — غالقٌ مغلقٌ لا يَجمع');
  {
    const a = r.schedule.alphas;
    assert(a[0] === 1 && a[1] === 0.5 && near(a[2], 1 / 3, 1e-15) && a[3] === 0.25 && a[4] === 0.125,
      '§١ أوزانُ المتوسّط الجاري `1/(k+1)` — وهي ما يُعطي كلَّ عيّنةٍ وزنًا متساويًا، خلافًا لـ`1/N` الثابتة');
  }
  assert(r.schedule.optionsStartAtOne === 1,
    '§١ أوّلُ خياراتِ اللوحة `1` — فالافتراضُ المعروضُ «بلا ضباب»');

  // ═══ §٢ التكافؤ ═════════════════════════════════════════════════════════
  console.log('\n§٢ التكافؤ — العقدُ المكتوبُ عند `renderArtboardFrames`');
  assert(r.parity.n1EqualsLegacy,
    '§٢ `samplesPerFrame = 1` يُخرج **البايتاتِ نفسَها** التي يُخرجها الاستدعاءُ بلا وسيطِ غالقٍ إطلاقًا — لا «صورةً مكافئة»');
  for (const N of [1, 2, 4, 8, 16]) {
    assert(r.parity.settled[N],
      `§٢ عند زمن الاستقرار يُخرج N=${N} البايتاتِ نفسَها التي يُخرجها المسارُ القديم — كلُّ مقطعٍ انتهى فسرعةُ كلّ عنصرٍ صفرٌ، ومتوسّطُ ${N} عيّناتٍ متطابقةٍ هو هي. وهذا هو الموضعُ الوحيدُ الذي تُصدَّر عنده صورةٌ ساكنة — StudioContext.tsx:1407 لا يُمرّر time`);
  }
  assert(r.parity.movingDiffers,
    '§٢ وعند زمنٍ متحرّكٍ **يختلف** الإطار — ولولا هذا البندِ لَكان التكافؤُ أعلاه دليلًا على ميزةٍ معطّلةٍ لا على عقدٍ محفوظ');
  assert(r.parity.noBleed,
    `§٢ ولا يَتسرّب إطارٌ إلى الذي بعده على مستندٍ **شفّاف**: ثلاثةُ إطاراتٍ مُتسلسلةٍ تُطابق كلَّ واحدٍ منها مطلوبًا وحدَه بايتًا ببايت${r.parity.bleedAt === null ? '' : ` — تسرّبٌ عند #${r.parity.bleedAt}`}. ويُقاس شفّافًا ومُتسلسلًا لأن العطلَ لا يَظهر إلّا هناك: على المعتم تَمحو العيّنةُ ما تحتها بلا مسح`);

  // ═══ §٣ الظاهرة ═════════════════════════════════════════════════════════
  console.log('\n§٣ الظاهرة — المسحةُ على اتّجاه السير، والجارُ الساكنُ لا يُمَسّ');
  const p = r.phenomenon.byN;
  console.log('    N   │ طاقةٌ على السير │ عرضَه  │ التباين');
  for (const N of [1, 2, 4, 8, 16]) {
    console.log(`    ${String(N).padStart(2)}  │ ${p[N].alongEnergy.toFixed(3).padStart(14)} │ ${p[N].crossEnergy.toFixed(3).padStart(6)} │ ${p[N].anisotropy.toFixed(3).padStart(7)}`);
  }
  assert(near(p[1].anisotropy, 1, 0.12),
    `§٣ بلا ضبابٍ يقرأ المربّعُ تباينًا ≈١ (${p[1].anisotropy.toFixed(3)}) — حوافُّه الأربعُ حادّةٌ سواء`);
  for (const N of [2, 4, 8, 16]) {
    assert(p[N].alongEnergy < p[N / 2].alongEnergy,
      `§٣ طاقةُ التدرّج على اتّجاه السير تَسقط عند N=${N} (${p[N].alongEnergy.toFixed(3)} < ${p[N / 2].alongEnergy.toFixed(3)})`);
  }
  {
    const ratio = p[1].alongEnergy / p[16].alongEnergy;
    assert(ratio > 8,
      `§٣ والسقوطُ من N=1 إلى N=16 يبلغ ÷${ratio.toFixed(1)} — والنظريّةُ تقول ÷N لحافّةٍ مَمسوحةٍ إلى N درجة`);
  }
  for (const N of [2, 4, 8, 16]) {
    assert(p[N].crossEnergy > p[16].alongEnergy * 4,
      `§٣ والطاقةُ **عرضَ** السير تبقى عند N=${N} (${p[N].crossEnergy.toFixed(3)}) — فالمسحةُ على اتّجاهٍ واحد، لا تمويهٌ عامّ`);
  }
  for (const N of [2, 4, 8, 16]) {
    assert(p[N].stillX === p[1].stillX && p[N].stillY === p[1].stillY,
      `§٣ والجارُ الساكنُ يقرأ عند N=${N} الرقمَ نفسَه إلى آخرِ خانةٍ عائمة (${p[1].stillX.toFixed(4)}) — وهذه هي صورةُ المرجع: ممسوحٌ وحادٌّ في الإطار الواحد. ولا دالّةُ تخفيفٍ تُنتجها`);
  }

  // ═══ §٤ أوزانُ التجميع ═══════════════════════════════════════════════════
  console.log('\n§٤ أوزانُ التجميع — متوسّطٌ جارٍ لا `globalAlpha = 1/N`');
  {
    const w = r.weights;
    console.log(`    أقصى فرقٍ عن متوسّطٍ متساوي الأوزان حُسب بيدِ الاختبار: ${w.maxEqual.toFixed(3)} (متوسّطُه ${w.meanEqual.toFixed(4)})`);
    console.log(`    وأقصى فرقٍ عن أوزانِ \`globalAlpha = 1/N\` [${w.wrongWeights.map((v) => v.toFixed(3)).join(' · ')}]: ${w.maxSkewed.toFixed(3)}`);
    // العتبةُ ٩ وسطٌ هندسيٌّ بين طرفين مقيسين: تقريبُ الثمانيةِ بت (٢٫٥، وهو
    // تراكمُ أربعِ عمليّاتِ تركيبٍ كلٌّ منها تُقرِّب) والأوزانُ الخاطئة (٣٣٫٣).
    // ولم تُكتَب «≤ ٢» لأن ذلك يُعاير العتبةَ على القراءة نفسِها فتَسقط على أوّل
    // تغيّرٍ في تقريب المتصفّح؛ ولا «≤ ٣٠» لأنها تَسمح بالخطأ الذي بُني القسمُ
    // ليراه. والمحروسةُ من الطرفين: ×٣٫٦ فوق المقيس · ÷٣٫٧ تحت الكاسر.
    assert(w.maxEqual <= 9,
      `§٤ التجميعُ يُطابق متوسّطًا **متساويَ الأوزان** حُسب مستقلًّا من أربع رسماتٍ منفردة — أقصى فرقٍ ${w.maxEqual.toFixed(3)} على ٢٥٥، وهو تراكمُ تقريبِ الثمانيةِ بت عبر أربع عمليّاتِ تركيب`);
    assert(w.meanEqual < 0.5,
      `§٤ ومتوسّطُ الفرق ${w.meanEqual.toFixed(4)} — فالمطابقةُ على كلّ بكسلٍ لا على معدّلٍ يُخفي أطرافًا`);
    assert(w.maxSkewed > w.maxEqual * 5,
      `§٤ وللاختبار قدرةٌ: الأوزانُ الخاطئةُ تَبعد ${w.maxSkewed.toFixed(3)} — أي ×${(w.maxSkewed / Math.max(w.maxEqual, 0.001)).toFixed(0)} أبعدَ. فلو رُكّبت العيّناتُ بـ\`globalAlpha = 1/N\` لَسقط هذا القسم`);
  }

  // ═══ §٥ الثمن ════════════════════════════════════════════════════════════
  console.log('\n§٥ الثمنُ المقيس — ٢٥٦٠×١٤٤٠ · ١٢ث · ٣٠ إطارًا/ث · ٣٦٠ إطارًا');
  {
    const f = r.cost.N8 / r.cost.N1;
    console.log(`    N=1  ${(r.cost.N1 / 1000).toFixed(2)}ث    N=8  ${(r.cost.N8 / 1000).toFixed(2)}ث    ⇒ ×${f.toFixed(2)}`);
    assert(f > 1.8,
      `§٥ ثمنُ ثماني عيّناتٍ أعلى من الواحدة بوضوح (×${f.toFixed(2)}) — فالعملُ يُنجَز فعلًا`);
    assert(f < 8,
      `§٥ وهو **دون الخطّيّ** (×${f.toFixed(2)} لا ×8): لكلّ إطارٍ ثمنٌ لا يتعلّق بعدد العيّنات (toBlob وترميزُ PNG) يُدفَع مرّةً مهما كُرّرت الرسمة. والرقمُ مكتوبٌ في src/lib/motionBlur.ts وتحت المِقبض في لوحة التصدير`);
  }

  // ═══ §٦ السطح ════════════════════════════════════════════════════════════
  console.log('\n§٦ السطح — المِقبضُ في لوحة التصدير');
  await bootDemoTimed(page, BASE_URL);
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(150);
  await page.locator('button:has-text("MP4")').click();
  await page.waitForTimeout(120);

  assert(await page.locator('[data-testid="export-shutter"]').isVisible(),
    '§٦ صفُّ ضباب الحركة ظاهرٌ متى كانت الصيغةُ فيديو');
  assert(await page.locator('[data-testid="export-shutter-1"]').getAttribute('data-on') === 'true',
    '§٦ والافتراضُ «بلا» — فلا مستندٌ قائمٌ يَدفع ثمنًا لم يَطلبه');
  assert(await page.locator('[data-testid="export-shutter-cost"]').count() === 0,
    '§٦ ولا تُعرَض ملاحظةُ الثمن ما دام المِقبضُ على «بلا» — لا ثمنَ يُحذَّر منه');
  assert(await page.locator('[data-testid="export-shutter-preview-note"]').count() === 0,
    '§٦ ولا ملاحظةُ المعاينة — لا فارقَ يُقال ما دام الغالقُ مُطفأً');

  await page.locator('[data-testid="export-shutter-8"]').click();
  await page.waitForTimeout(120);
  assert(await page.locator('[data-testid="export-shutter-8"]').getAttribute('data-on') === 'true',
    '§٦ والضغطُ يُغيّر الحالةَ فعلًا — لا زرَّ ميتًا');
  assert(await page.locator('[data-testid="export-shutter-1"]').getAttribute('data-on') === 'false',
    '§٦ والاختيارُ واحدٌ لا متعدّد');
  {
    const note = await page.locator('[data-testid="export-shutter-cost"]').innerText();
    assert(note.includes('×8'),
      `§٦ وملاحظةُ الثمن تَظهر وتُسمّي المُعامِلَ («${note.trim()}») — فمن ضغط يعرف ما يَدفعه قبل أن يَنتظر`);
  }
  {
    const note = await page.locator('[data-testid="export-shutter-preview-note"]').innerText();
    assert(note.length > 0,
      `§٦ وفارقُ المعاينة **مكتوبٌ تحت المِقبض** («${note.trim()}») — لا يُترَك ليُكتشَف بعد التصدير. والمعاينةُ شجرةُ DOM والتصديرُ قُماش، فعقدُ animTimeline.ts:125-137 عقدُ حالةٍ لا عقدُ بكسل، وهو محفوظ. لكنّ المصمّمَ لا يقرأ العقود`);
  }

  // ما دام الملفُّ الخارجُ من ffmpeg لا يُنتَج إلا داخل تطبيق Tauri (نفسُ حدّ
  // `qa/video-export.spec.mjs`)، فالمقيسُ هنا هو مصدرُ الإطارات ومِقبضُه — وهو
  // كلُّ ما يُغيّره هذا العمل. والترميزُ لم يُمَسّ.
  assert(pageErrors.length === 0, `§٦ ولا خطأَ في الطرفيّة خلال ذلك كلِّه: ${JSON.stringify(pageErrors)}`);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  -', f);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
