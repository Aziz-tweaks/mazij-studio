#!/usr/bin/env node
// مُعاير المحكّم المرئي: يبني الهدف المرجعي للفيديو وشاهدَيه السالبين.
//
// لماذا نُولّد الهدف بأنفسنا بدل أن ننتظر ملفًا: المحكّم أداةُ قياس، وأداةُ القياس
// تُعاير على شيءٍ **نعرف جوابه الصحيح مسبقًا**. الفيديو الذي سمّاه المالك مرجعًا
// ليس على هذا الجهاز، ولو كان لَما عرفنا منه إلا ما نراه بالعين. أمّا هذا الملف
// فالحقيقةُ الأرضيّة فيه مكتوبةٌ كودًا: متى يدخل الشريط، وكم عرضه عند كل لحظة،
// ومتى يسكن المشهد. فإذا قال المحكّم غير ذلك، فالخطأ في المحكّم لا في الهدف.
//
// ولماذا إطاراتٌ خامٌّ تُغذَّى لـffmpeg بدل فلاتره: `drawbox` في ffmpeg 9.0.1 على
// هذا الجهاز **لا يُعيد تقييم تعابيره لكل إطار** — لا خيار `eval` فيه، وقد
// اختُبر بمربّعٍ متحرّك `x='20*t'` فخرجت الإطارات العشرون متطابقةً بالـmd5. فلو
// بنينا الهدف بالفلاتر لبنينا فيديو ساكنًا نظنّه متحرّكًا، وهو بالضبط الخطأ الذي
// شاهدُ «المجمَّد» موضوعٌ لكشفه. فالتوليد هنا في JS حيث الحركة صريحة، وffmpeg
// مُرمِّزٌ فقط — وهذا يجعل الحقيقة الأرضيّة قابلةً للقراءة في `COMP` أدناه.
//
// التشغيل:
//   node qa/replication/make-video-controls.mjs            # الثلاثة
//   node qa/replication/make-video-controls.mjs target     # واحدٌ منها
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const OUT_DIR = path.join(__dirname, 'targets', 't00-video-calib');

// ============================================================================
// الحقيقة الأرضيّة
// ============================================================================
// المقاس ١٠٨٠×١٩٢٠ متعمَّد: هو مقاس المشروع الذي كشفت فيه جولةٌ سابقة أن الملفّ
// خرج ٢١٦٠×٣٨٤٠ — أي ضِعفَين. فبند المقاس هنا يُعاير على شكل العطل نفسه.
const COMP = {
  width: 1080,
  height: 1920,
  fps: 30,
  frames: 120, // ٤٫٠ ثوانٍ بالضبط عند ٣٠ إطارًا
  bg: [0x0f, 0x3d, 0x3e], // #0F3D3E — خلفيّة اللوحة الثالثة، كما في t01

  // عنصرٌ ثابتٌ من الإطار صفر إلى آخره: لوحٌ فاتح. وجودُه ليس زينةً — بدونه لا
  // يكون في الإطارات المبكّرة شيءٌ تقيسه بنود الصورة الساكنة، فلا نعرف هل سقط
  // البند لأن الإطار خطأ أم لأن الإطار فارغٌ أصلًا.
  plate: { x: 140, y: 320, w: 800, h: 120, color: [0xf2, 0xf0, 0xe6] },

  // الدخول: شريطٌ ذهبيّ ينمو عرضًا من صفر إلى ٨٠٠ بين ٠٫٥ث و١٫٥ث.
  // قبل ٠٫٥ث منطقتُه خلفيّةٌ صافية، وبعد ١٫٥ث ممتلئةٌ تمامًا — وهذا ما يقيسه
  // `appearsBetween`: «كانت فارغة فصارت فيها حبر».
  bar: { x: 140, y: 760, wFull: 800, h: 56, color: [0xff, 0xb7, 0x03], t0: 0.5, t1: 1.5 },

  // حركةٌ ثانية في نافذةٍ مختلفة: قرصٌ ينزلق أفقيًّا بين ١٫٠ث و٢٫٠ث. نافذتان
  // منفصلتان تعنيان أن `motionBetween` يُقاس مرّتين على مدًى مختلف، فلا تكون
  // عتبتُه مُعايَرةً على حركةٍ واحدة.
  dot: { x0: 140, x1: 820, y: 1200, w: 120, h: 120, color: [0xe0, 0x7a, 0x5f], t0: 1.0, t1: 2.0 },

  // السكون: من ٢٫٠ث إلى النهاية لا يتغيّر بكسلٌ واحد في المصدر. أيُّ فرقٍ يراه
  // المحكّم بعد هذه اللحظة هو **ضجيج المرمِّز وحده** — وهذا بالضبط ما تُعاير عليه
  // عتبةُ `staticAfter`.
  holdFrom: 2.0,
};

const lerp = (a, b, f) => a + (b - a) * f;
const clamp01 = (f) => Math.min(1, Math.max(0, f));

/** مستطيلٌ مصمت داخل مخزن RGB24. الإحداثيّات بالبكسل المطلق لأن الحقيقة الأرضيّة
 * بالبكسل: «١٤٠ بكسلًا من اليسار» لا «١٣٪». البنود وحدها نسبيّة. */
function fillRect(buf, W, H, x, y, w, h, [r, g, b]) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      buf[i++] = r;
      buf[i++] = g;
      buf[i++] = b;
    }
  }
}

/** إطارُ الهدف عند الزمن t. هذه هي الدالّة التي تمثّل الحقيقة الأرضيّة كلّها. */
function renderTargetFrame(t, W = COMP.width, H = COMP.height) {
  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < buf.length; i += 3) {
    buf[i] = COMP.bg[0];
    buf[i + 1] = COMP.bg[1];
    buf[i + 2] = COMP.bg[2];
  }
  const { plate, bar, dot } = COMP;
  fillRect(buf, W, H, plate.x, plate.y, plate.w, plate.h, plate.color);

  // الشريط: عرضٌ صفرٌ قبل t0 يعني «غير موجود»، لا «موجودٌ بعرض بكسل».
  const barF = clamp01((t - bar.t0) / (bar.t1 - bar.t0));
  if (barF > 0) fillRect(buf, W, H, bar.x, bar.y, bar.wFull * barF, bar.h, bar.color);

  const dotF = clamp01((t - dot.t0) / (dot.t1 - dot.t0));
  fillRect(buf, W, H, lerp(dot.x0, dot.x1, dotF), dot.y, dot.w, dot.h, dot.color);
  return buf;
}

// ============================================================================
// الشواهد
// ============================================================================
// ثلاثة مخرجات، والثاني والثالث خطأٌ **بطريقتين مختلفتين** عن قصد:
//
// `target` — الصواب. يجب أن يسجّل ١٠٠٪.
//
// `blank`  — شاهدٌ سالب: خلفيّةٌ وحدها، ومقاسٌ ٢١٦٠×٣٨٤٠. مقاسُه ليس عبثًا: هو شكل
//            العطل الذي ظهر فعلًا (مشروع ١٠٨٠×١٩٢٠ كتب ملفًّا بالضعف). والبنود
//            كلّها نسبيّة فلا يُخفي المقاسُ الخطأَ في المضمون — يُضيف خطأً آخر
//            يُسمّى باسمه.
//
// `frozen` — الشاهد الماكر: يحمل التركيبة **النهائيّة** من الإطار صفر. كلُّ إطارٍ
//            فيه صحيحٌ على حِدة، فلو كان المحكّم يسأل «أتبدو الإطارات صحيحة؟» لمرّ.
//            ولا يسقط إلا على بنود الزمن: ما دخل شيءٌ لأنه كان داخلًا، وما تحرّك
//            شيءٌ لأنه كان واصلًا. وجودُه هو الدليل على أن بنود الزمن ليست زينة.
const MODES = {
  target: {
    label: 'الهدف — دخولٌ وسكونٌ معلومان',
    file: 'target.mp4',
    width: COMP.width,
    height: COMP.height,
    frame: (i) => renderTargetFrame(i / COMP.fps),
  },
  blank: {
    label: 'شاهدٌ سالب — خلفيّةٌ وحدها بمقاسٍ مضاعَف',
    file: 'control-blank.mp4',
    width: COMP.width * 2,
    height: COMP.height * 2,
    frame(i) {
      const buf = Buffer.alloc(this.width * this.height * 3);
      for (let k = 0; k < buf.length; k += 3) {
        buf[k] = COMP.bg[0];
        buf[k + 1] = COMP.bg[1];
        buf[k + 2] = COMP.bg[2];
      }
      return buf;
    },
  },
  frozen: {
    label: 'شاهدٌ ماكر — التركيبة النهائيّة مثبَّتةً من الإطار صفر',
    file: 'control-frozen.mp4',
    width: COMP.width,
    height: COMP.height,
    // الإطار الأخير، نفسه، ١٢٠ مرّة.
    frame: () => renderTargetFrame((COMP.frames - 1) / COMP.fps),
  },

  // شاهدٌ رابع: اللقطةُ النهائيّة لا تُحفَظ — تهتزّ.
  //
  // أُضيف لأن الشواهدَ الثلاثة الأولى تركت `staticAfter` بلا شيءٍ يُسقطه: الهدف
  // يسكن، و«الفارغ» يسكن، و«المجمَّد» أسكنُ من الجميع. وبندٌ لا يسقط على شيءٍ
  // في المعايرة هو بندٌ **لم يُقَس** — ويبقى زينةً وإن كان منطقُه صحيحًا.
  //
  // وشكلُ الخطأ اهتزازٌ بـ±٦ بكسلات بعد لحظة السكون، لا انزلاقٌ مستمرّ. والفرق
  // مقصود: الانزلاقُ المستمرّ يُخرج القرصَ عن موضعه النهائي أيضًا، فيسقط على
  // بندِ الموضع عند ٣٫٩ث كما يسقط على السكون — فلا يُثبت أن بندَ السكون يُميّز
  // شيئًا بنفسه. أمّا الاهتزازُ فيُعيد القرص إلى داخل تسامح الموضع في كل إطار،
  // فلا يبقى إلا بندٌ واحدٌ يراه. وهذا ما نريده من شاهد: عطلٌ واحدٌ يُسمّيه بندٌ
  // واحد.
  //
  // وهو عطلٌ واقعيّ لا مُفتعَل: لقطةٌ أخيرة «محفوظة» تهتزّ بكسلاتٍ قليلة هي ما
  // يُخرجه تصديرٌ يُعيد حساب الموضع في كل إطار بتقريبٍ غير مستقرّ.
  drift: {
    label: 'شاهدٌ رابع — اللقطة النهائيّة تهتزّ ±٦px بعد لحظة السكون',
    file: 'control-drift.mp4',
    width: COMP.width,
    height: COMP.height,
    frame(i) {
      const t = i / COMP.fps;
      if (t < COMP.holdFrom) return renderTargetFrame(t); // قبل السكون: الهدفُ حرفًا بحرف
      const buf = renderTargetFrame(t);
      const { dot, bg } = COMP;
      // تُمحى منطقةُ القرص إلى الخلفيّة أوّلًا، وإلّا بقي القرصُ الأصلي ظاهرًا
      // فصار في الإطار قرصان وقاس البندُ أثرَين لا واحدًا.
      fillRect(buf, COMP.width, COMP.height, dot.x1 - 16, dot.y, dot.w + 32, dot.h, bg);
      fillRect(buf, COMP.width, COMP.height, dot.x1 + (i % 2 === 0 ? -6 : 6), dot.y, dot.w, dot.h, dot.color);
      return buf;
    },
  },

  // مِجَسُّ الضجيج — ليس شاهدًا على الهدف بل على **المرمِّز**.
  //
  // سببُه نتيجةٌ قيست ولم تُتوقَّع: أرضيّةُ الضجيج على الهدف خرجت **صفرًا
  // بالضبط**. وذلك صحيحٌ ومُضلِّل في الوقت نفسه — الهدف مساحاتٌ مصمتة، وx264
  // يُخرج لإطارٍ مكرّرٍ من لونٍ مصمت إطارًا تفاضليًّا ببواقٍ صفريّة، فيَفُكّه
  // الفاكُّ مطابقًا بالبِت. فلو عايَرنا عتبةَ السكون على ذلك الصفر لخرجت عتبةٌ
  // تسقط على أوّل فيديو حقيقيّ فيه تدرّجٌ لونيّ أو حَبّةُ فيلم.
  //
  // فهذا المِجَسّ يُثبّت إطارًا **يُتعِب المرمِّز** — تدرّجٌ قطريّ على كامل اللوحة
  // وشريطُ ضجيجٍ عشوائيّ لكلّ بكسل — ويُكرّره بلا تغييرٍ واحد. فكلُّ فرقٍ يُقاس
  // عليه هو ضجيجُ الكوانتَزة وحده على محتوًى صعب، وهو الأرضيّةُ التي تُبنى عليها
  // عتبةُ `staticAfter` كي تصلح لفيديو حقيقيّ لا لمستطيلاتٍ مصمتة.
  'noise-hold': {
    label: 'مِجَسُّ ضجيج — تدرّجٌ وضجيجٌ مثبَّتان، لقياس أرضيّة المرمِّز',
    file: 'probe-noise-hold.mp4',
    width: COMP.width,
    height: COMP.height,
    frame(i) {
      if (this._cached) return this._cached;
      const { width: W, height: H } = this;
      const buf = Buffer.alloc(W * H * 3);
      // مُولّدٌ خطّيٌّ متطابق بذرةً ثابتة: المِجَسّ يجب أن يُعاد إنتاجه حرفيًّا،
      // وعشوائيّةُ `Math.random` تجعل الأرضيّة تتحرّك بين تشغيلين.
      let seed = 0x9e3779b9;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0xffffffff;
      };
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const k = (y * W + x) * 3;
          const g = (x / W + y / H) / 2; // تدرّجٌ قطريّ
          // الثلث الأوسط ضجيجٌ لكلّ بكسل: أصعبُ ما يُرمَّز.
          const noisy = y > H / 3 && y < (2 * H) / 3;
          const n = noisy ? (rnd() - 0.5) * 90 : 0;
          buf[k] = Math.max(0, Math.min(255, Math.round(30 + g * 200 + n)));
          buf[k + 1] = Math.max(0, Math.min(255, Math.round(90 + g * 120 - n)));
          buf[k + 2] = Math.max(0, Math.min(255, Math.round(160 - g * 120 + n)));
        }
      }
      this._cached = buf;
      return buf;
    },
  },
};

/** يُرمِّز سلسلةَ إطاراتٍ خامّة إلى H.264. الإطارات تُدفَع عبر stdin ولا تُكتَب على
 * القرص: ١٢٠ إطارًا من ١٠٨٠×١٩٢٠ هي ٧٤٦ ميجابايت خامًّا، ولا داعي لها. */
function encode(mode) {
  return new Promise((resolve, reject) => {
    const out = path.join(OUT_DIR, mode.file);
    // `-crf 18` و`yuv420p` اختيارٌ واقعيّ لا مثاليّ: هذا ما يُخرجه تصديرٌ حقيقيّ،
    // وأثرُ أخذ عيّنات اللون الفرعيّة على الألوان هو ما يجب أن تُعاير عليه عتبات
    // `color`. ترميزٌ بلا خسارةٍ كان سيجعل العتبات متسامحةً مع ما لا يُتسامَح معه.
    const ff = spawn(FFMPEG, [
      '-y', '-v', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgb24',
      '-s', `${mode.width}x${mode.height}`,
      '-r', String(COMP.fps),
      '-i', 'pipe:0',
      '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-frames:v', String(COMP.frames),
      out,
    ]);
    let err = '';
    ff.stderr.on('data', (d) => { err += d; });
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`ffmpeg ${code}: ${err}`))));

    // كتابةٌ متدفّقة مع احترام الضغط العكسي، وإلّا تضخّم ذاكرةُ العمليّة بالإطارات
    // التي لم يلتقطها المرمِّز بعد.
    let i = 0;
    const pump = () => {
      while (i < COMP.frames) {
        const buf = mode.frame(i);
        i++;
        if (!ff.stdin.write(buf)) return ff.stdin.once('drain', pump);
      }
      ff.stdin.end();
    };
    pump();
  });
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const names = wanted.length ? wanted : Object.keys(MODES);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of names) {
    const mode = MODES[name];
    if (!mode) {
      console.error(`لا شاهد باسم «${name}» — المتاح: ${Object.keys(MODES).join(' · ')}`);
      process.exit(2);
    }
    const out = await encode(mode);
    const kb = (fs.statSync(out).size / 1024).toFixed(0);
    console.log(`${name.padEnd(7)} ${mode.width}×${mode.height}  ${kb}KB  ${mode.label}`);
    console.log(`        ${out}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
