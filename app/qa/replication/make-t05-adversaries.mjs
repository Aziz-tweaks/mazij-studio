#!/usr/bin/env node
// شواهدُ `t05-update-card` السالبة: ستُّ محاولاتٍ لا يفصل أيَّ اثنتين منها إلّا
// **شيءٌ واحدٌ مسمًّى**.
//
// ─────────────────────────────────────────────────────────────────────────────
// لماذا تُولَّد، ولماذا تُولَّد **تخطيطيّة** لا منسوخةً من المرجع
// ─────────────────────────────────────────────────────────────────────────────
// بندٌ لا يسقط لم يُقَس. فمواصفةُ `t05` تُحاسَب هنا كما تُحاسَب مواصفةُ `t00` في
// `calibrate-motion.mjs`: لكلِّ بندٍ شاهدٌ بُني ليَكسره، وبينه وبين الشاهد الصالح
// **فرقٌ واحد**.
//
// وشاهدُ «الخطّ المستقيم» بعينه **لا يُستخرَج من المرجع بجراحةِ إطارات**، وهذا
// قيس لا رأي: مواضعُ المرجع في نافذة الاستقرار متقطّعة (٥٥٨٫٧ ثم ٦١٣٫٥ ثم ٦١٦٫٨
// ثم ٦٢٨٫٤ ثم ٦٩٣٫٨) — فبين ٦٢٨٫٤ و٦٩٣٫٨ **خمسةٌ وستّون بكسلًا لا إطارَ فيها**.
// فإعادةُ ترتيبِ إطاراتِ المرجع تُخرج سلَّمًا لا مستقيمًا، ولا تُخرج منحنًى
// مختارًا. ولهذا يُرسَم الشاهدُ من جديدٍ بالهندسة المقيسة وحدَها.
//
// وهي **تخطيطيّةٌ بقصد**: مستطيلاتٌ بالمواضع والمقاسات والألوان التي سجّلتها
// `spec.json` — وهي نفسُها ما تُسجّله المواصفةُ ولا شيءَ غيره. لا نصَّ ولا تركيبَ
// ولا محتوًى من المرجع. فالشاهدُ يُمرّن **بنودَ الحركة** لا يُعيد إنتاج العمل،
// وإعادةُ الإنتاج شأنُ `build` لا شأنُ `judge`.
//
// وإطاراتٌ خامٌّ تُغذَّى لـffmpeg لا فلاترُه، للسبب المكتوب في
// `make-video-controls.mjs:10-16`: `drawbox` لا يُعيد تقييم تعابيره لكلّ إطار على
// هذا الجهاز، فبناءُ الحركة بالفلاتر يُخرج فيديو ساكنًا نظنّه متحرّكًا.
//
// التشغيل:
//   node qa/replication/make-t05-adversaries.mjs           # الستّة
//   node qa/replication/make-t05-adversaries.mjs linear    # واحدٌ منها
//   node qa/replication/make-t05-adversaries.mjs --truth   # الحقيقةُ الأرضيّة بلا توليد
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { median3Filter } from './lib/video.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FFMPEG = process.env.MAZIJ_FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const OUT_DIR = path.join(__dirname, 'targets', 't05-update-card');

// ════════════════════════════════════════════════════════════════════════════
// الحقيقةُ الأرضيّة — مقروءةٌ من `spec.json`، مكتوبةٌ هنا مرّةً واحدة
// ════════════════════════════════════════════════════════════════════════════
const C = {
  width: 2560,
  height: 1440,
  fps: 30,
  frames: 360,
  bg: [0xfe, 0xe7, 0xcf],

  // الطورُ الأوّل: كتلةٌ تَسير يسارًا حتى ٢٫٨٣٣ث. وظيفتُها بندان: أن الإطارَ
  // الأوّلَ ليس فارغًا، وأن شيئًا تحرّك فعلًا.
  sweep: { x0: 50, x1: 1400, y: 160, w: 400, h: 330, color: [0xd8, 0x8c, 0x5a], f1: 85 },

  // «الشارة»: مربّعٌ ٤٣٥×٤٣٥ عند (١٠٦٣،٥٠٣)، يستقرّ من #٨٦ إلى #١١٣ ثم يغيب.
  // وغيابُه عند #١١٤ لا تلاشيه: مستطيلُ تتبُّعِ «البطاقة» يَشمل جزءًا منه، ومركزُ
  // ثقلٍ على عنصرين يقيس متوسّطَهما لا منحنى أحدهما. والمرجعُ يَخلط الاثنين فعلًا
  // ويقرأ ما قرأ، أمّا الشاهدُ فوظيفتُه عزلُ المنحنى — فيُفصَل العنصران.
  badge: { x: 1063, y: 503, w: 435, h: 435, color: [0x0e, 0xa0, 0x6a], fIn: 80, fHold: 86, fGone: 114 },

  // «البطاقة»: عرضٌ ثابتٌ ٣٦٤ عند x=١٠٩٨ وارتفاعٌ ٥٩٢ — فحافّتُها اليسرى لا
  // تتحرّك، كما قيس على المرجع. ومركزُ ثقلها ينزل **١٣١ بكسلًا** على المنحنى بين
  // #١١٧ و#١٢٣، وهي راكنةٌ قبل ذلك من #١١٤ كي تكون في المستطيل عند أوّل النافذة:
  // بندُ المنحنى يسقط خطأَ مواصفةٍ إن غاب العنصرُ عن إطارٍ واحدٍ في نافذته.
  // وقاعُها عند #١١٧ هو ٨٠٢ (فوق الشريط السفليّ ٨١٠→٨٧٠) وعند #١٢٣ هو ٨٧٤
  // (داخله) — فطرفا بندِ التمدّد غير المتجانس مُرضيان بالبناء.
  //
  // وحركتُها تبدأ عند #١١٨ لا #١١٧، كما في المرجع. وهذا ليس تفصيلًا: الإطار
  // #١١٧ هو الذي يقرأ عليه بندُ الخلوّ، ومغلاقٌ بزاوية ١٨٠° يُراكِم نصفَ فترة
  // الإطار — فحركةٌ تبدأ عند #١١٧ تُمسَح إلى داخل الشريط فيقرأ **١٦٫٧٪** حبرًا
  // في شاهد الضباب و٠٫٠٠٪ في غيره، فيَختلف الشاهدان في بندٍ ليس موضوعَ
  // الخلاف بينهما.
  // وإطارُها أغمقُ من حشوها، وهذا **ليس تجميلًا**: لونُ الحشو المقيس `#e7e7e7`
  // يبعد عن الخلفيّة **٥٢٫٣** — أي **تحت** عتبة `minDistance` ٦٠ التي يُقاس بها
  // الحبرُ في المقياس كلِّه. فمستطيلٌ مصمتٌ بذلك اللون قناعُ حبره **خالٍ**،
  // ومركزُ ثقلٍ على قناعٍ خالٍ غيرُ معرَّف — فيسقط بندُ المنحنى خطأَ مواصفةٍ
  // («لا قياسَ على الإطار #١١٤») لا عطلًا في الشاهد. والمرجعُ يَقرأ في مستطيل
  // «البطاقة» ٥٦٫٩٧٪ حبرًا لأن فيه محتوًى أغمق؛ فالإطارُ هنا بديلُ ذلك المحتوى
  // بأقلِّ ما يُؤدّيه: حبرٌ فوق العتبة، ومركزُ ثقلٍ على مركز المستطيل.
  card: {
    x: 1098, w: 364, h: 592,
    yFrom: 210, yTo: 282,
    color: [0xe7, 0xe7, 0xe7],
    border: 40, borderColor: [0x8a, 0x8a, 0x8a],
    fShow: 114, f0: 118, f1: 123, fGone: 154,
  },

  // «الكبسولة»: ٣٦٩ عرضًا عند x=١٠٩٦، وحدُّها الأعلى **ثابتٌ** عند ٩١٣ — كما قيس
  // على المرجع: الذي ينزل قاعُها لا كلُّها (١٠٧٠ ← ١٠٩٠).
  //
  // ودخولُها **تغطيةٌ وشفافيّةٌ معًا** — انظر `capsuleEntry` أدناه للسبب المقيس.
  capsule: {
    x: 1096, y: 913, w: 369, hFull: 156, hDrifted: 175,
    color: [0xc5, 0xe8, 0xdb],
    revealFrom: 160, revealTo: 164,
    driftFrom: 165, driftTo: 235,
  },

  // الصفُّ الأعلى من التركيبة النهائيّة: يظهر عند #١٦٤ ويبقى.
  topRow: { x: 860, y: 623, w: 838, h: 117, color: [0xfc, 0xd5, 0x98], fIn: 164 },

  // تجاوزُ «البطاقة» المقيس على المرجع: ٢٫٢٠ بكسلًا (يقرؤه المحكّم ٢٫٢٣) — أي كسرٌ
  // ٠٫٠١٥٤. والمعامِلُ يُحَلّ له عدديًّا أدناه، لا يُؤخَذ من منحنًى جاهز: منحنًى
  // جاهزٌ (`back` بمعامل ١٫٧٠١٥٨) يُخرج تجاوزًا ٠٫١٠١٢ من الإزاحة — ١٣٫٤ بكسلًا
  // هنا — فكان سيُعاير البندَ على حدٍّ مريحٍ لا على المقيس.
  overshootPx: 2.2,

  // تذبذبُ شاهدِ «الثبات المكسور»: ±٦ بكسلات في الثانية الأخيرة. والمقدارُ هو
  // مقدارُ `control-drift` في `t00` نفسُه، فيُقارَن الرقمان.
  jitterPx: 6,
  jitterFrom: 330,

  // عددُ العيّنات الفرعيّة لشاهد الضباب. والقيمةُ ١٦ هي أقصى ما تُخرجه لوحةُ
  // التصدير في مزيج (`SHUTTER_SAMPLE_OPTIONS`)، وزاويةُ المغلاق ١٨٠° هي
  // افتراضيُّها (`DEFAULT_SHUTTER_ANGLE`) — فالشاهدُ يُحاكي أقصى ما يُصدَّر فعلًا.
  blurSamples: 16,
  shutterFraction: 0.5,

  // آخرُ إطارٍ في نافذةِ بندِ المنحنى (`card-settles` ينتهي عند ٤٫٢٣٣ث = #١٢٦).
  // ويُكتَب هنا لأن حلَّ المعامِل يُحاسَب على تلك النافذة بعينها.
  cardWindowLastFrame: 126,

  // «الكبسولة» تدخل تغطيةً **وشفافيّةً** معًا: التغطيةُ وحدَها تُعطي القناعَين
  // (عند ٦ وعند ٦٠) الجوابَ نفسَه، والمرجعُ يُعطيهما جوابين مختلفين — صفرًا عند
  // ٦٠ و٨٫٧٤٪ عند ٦ في الإطار #١٦٠. فالشفافيّةُ هي التي تَفصلهما: مستطيلٌ عند
  // ٠٫٣٥ يبعد عن الخلفيّة ٣٤٫٤ — فوق ٦ وتحت ٦٠.
  capsuleEntry: [
    { f: 159, cover: 0.0, alpha: 0.0 },
    { f: 160, cover: 0.20, alpha: 0.35 },
    { f: 161, cover: 0.45, alpha: 0.70 },
    { f: 162, cover: 1.0, alpha: 1.0 },
  ],
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** `easeOutBack` بمعامِلٍ مُصرَّحٍ به: `1 + (c+1)s³ + c·s²` حيث `s = u − 1`.
 *  وأقصى تجاوزٍ **متّصلٍ** لها `4c³ / (27(c+1)²)` من الإزاحة، مُشتقٌّ مُغلَقَ
 *  الشكل. */
const easeOutBack = (u, c) => {
  const s = u - 1;
  return 1 + (c + 1) * s * s * s + c * s * s;
};
const backOvershootFraction = (c) => (4 * c * c * c) / (27 * (c + 1) * (c + 1));

/** يحلّ معامِلَ `back` الذي يُخرج التجاوزَ المطلوب **كما يقرؤه المحكّمُ**، لا كما
 *  يقوله المنحنى. وثلاثةُ أرقامٍ لا رقمٌ واحد، والفرقُ بينها مقيسٌ لا نظريّ:
 *
 *   المتّصل      — `4c³/(27(c+1)²)` × الإزاحة. ذروتُه عند `u = 0.735`.
 *   على الشبكة   — أقصى ما تَقع عليه عيّنةٌ من عيّنات الإطارات الستّ. وهي
 *                  **أصغر**، لأن الشبكةَ لا تضع عيّنةً عند ٠٫٧٣٥.
 *   كما يُقرأ    — بعد **مُرشِّح الوسيط الثلاثيّ** الذي يَفرضه المحكّم على كلّ
 *                  سلسلةِ مواضع. وهي **أصغرُ من كلتيهما**، وهذا هو الرقمُ الذي
 *                  يُحكَم به.
 *
 *  وأوّلُ صياغةٍ لهذا الحلّ كانت على الشبكة، فأخرجت شاهدًا تجاوزُه على الشبكة
 *  ٢٫٠٣٠px يقرؤه المحكّمُ **١٫١٠px** — فسقط الشاهدُ الصالحُ على بندٍ صحيح.
 *  والسببُ أن الذروةَ بعد الترشيح تَقع على ثانيةِ عيّنتين غيرِ متساويتين
 *  (٥٨٠٫٠ و٥٧٩٫١) فيُرجع الوسيطُ الأصغرَ منهما. فالحلُّ يُحاسَب الآن على خطِّ
 *  الأنابيب نفسِه، ويستورد `median3Filter` من المحكّم بدل أن يُعيد كتابته —
 *  لئلّا يُعاير الشاهدُ على نسخةٍ من المُرشِّح لا على المُرشِّح. */
function measuredOvershoot(c, mode) {
  const k = C.card;
  const raw = [];
  for (let f = k.fShow; f <= C.cardWindowLastFrame; f++) {
    const u = clamp01((f - k.f0) / (k.f1 - k.f0));
    const e = mode === 'linear' ? u : easeOutBack(u, c);
    // مركزُ ثقلِ حلقةِ الإطار = مركزُ المستطيل، فالموضعُ هو `y + h/2`.
    raw.push(k.yFrom + (k.yTo - k.yFrom) * e + k.h / 2);
  }
  const pos = median3Filter(raw);
  const tail = pos.slice(-3);
  const rest = median3Filter(tail)[1];
  let over = -Infinity;
  for (const p of pos) if (p - rest > over) over = p - rest;
  return over;
}

function solveBackAsJudged(wantPx) {
  let lo = 1e-6;
  let hi = 8;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (measuredOvershoot(mid, 'back') < wantPx) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const CARD_RANGE = C.card.yTo - C.card.yFrom;
const BACK_C = solveBackAsJudged(C.overshootPx);
const BACK = {
  c: BACK_C,
  judgedPx: measuredOvershoot(BACK_C, 'back'),
  gridPx: (() => {
    let m = 0;
    const steps = C.card.f1 - C.card.f0;
    for (let k = 0; k <= steps; k++) {
      const v = (easeOutBack(k / steps, BACK_C) - 1) * CARD_RANGE;
      if (v > m) m = v;
    }
    return m;
  })(),
  continuousPx: backOvershootFraction(BACK_C) * CARD_RANGE,
  linearJudgedPx: measuredOvershoot(0, 'linear'),
};

// ════════════════════════════════════════════════════════════════════════════
// المنحنيات — وهذا هو **الفرقُ الواحد** بين شاهد الصلاح وشاهد المستقيم
// ════════════════════════════════════════════════════════════════════════════
const CURVES = {
  // تخفيفُ خروجٍ بتجاوز: ما يقرؤه المرجع.
  back: (u) => easeOutBack(u, BACK_C),
  // سرعةٌ ثابتة: طرفاه مطابقان لـ`back` حرفًا بحرف، ولا يفصلهما غيرُ المنحنى.
  linear: (u) => u,
};

// ════════════════════════════════════════════════════════════════════════════
// الرسم — مستطيلاتٌ مصمتةٌ على خلفيّةٍ مصمتة، بعيّنةٍ واحدةٍ أو بعدّةِ عيّنات
// ════════════════════════════════════════════════════════════════════════════

/** حالةُ المشهد عند زمنٍ **كسريّ** بالإطارات. الكسرُ شرطٌ لا ترف: ضبابُ الحركة
 *  يحتاج مواضعَ بين الإطارات، فلا تُحسَب الحالةُ من دليلٍ صحيح. */
function sceneAt(fFloat, mode) {
  const rects = [];

  // الطورُ الأوّل
  if (fFloat <= C.sweep.f1) {
    const u = clamp01(fFloat / C.sweep.f1);
    rects.push({
      x: C.sweep.x0 + (C.sweep.x1 - C.sweep.x0) * u,
      y: C.sweep.y, w: C.sweep.w, h: C.sweep.h, color: C.sweep.color, a: 1,
    });
  }

  // «الشارة» — تظهر تدرّجًا وتستقرّ وتغيب
  {
    const b = C.badge;
    let a = 0;
    if (fFloat >= b.fIn && fFloat < b.fHold) a = clamp01((fFloat - b.fIn) / (b.fHold - b.fIn));
    else if (fFloat >= b.fHold && fFloat < b.fGone) a = 1;
    if (a > 0) rects.push({ x: b.x, y: b.y, w: b.w, h: b.h, color: b.color, a });
  }

  // «البطاقة» — المنحنى هو موضعُ الخلاف، وما عداه مشترَكٌ بين الشاهدَين
  {
    const k = C.card;
    if (fFloat >= k.fShow && fFloat < k.fGone) {
      const u = clamp01((fFloat - k.f0) / (k.f1 - k.f0));
      const e = CURVES[mode.curve](u);
      const y = k.yFrom + (k.yTo - k.yFrom) * e;
      // الإطارُ ثم الحشوُ فوقه — فيكون قناعُ الحبر حلقةً متماثلةً مركزُها مركزُ
      // المستطيل، ويكون متوسّطُ الحشو هو اللونَ المقيس.
      rects.push({ x: k.x, y, w: k.w, h: k.h, color: k.borderColor, a: 1 });
      rects.push({
        x: k.x + k.border, y: y + k.border,
        w: k.w - 2 * k.border, h: k.h - 2 * k.border,
        color: k.color, a: 1,
      });
    }
  }

  // «الكبسولة» — الكشفُ أو الاقتحام، ثم الانجرافُ أو تثبيتُه، ثم الثباتُ أو
  // التذبذب. وحدُّها الأعلى ثابتٌ دائمًا: ما ينزل قاعُها.
  {
    const p = C.capsule;
    const E = C.capsuleEntry;
    const last = E[E.length - 1];
    // الدخول: تغطيةٌ وشفافيّةٌ معًا، مقروءتان من جدولٍ مكتوبٍ أعلاه.
    // والمُقحِمُ لا يُغيّر الجدول بل **يتخطّاه**: صفرٌ حتى آخرِ إطارٍ فيه ثم واحد.
    let cover = 0;
    let alpha = 0;
    if (fFloat >= last.f) { cover = 1; alpha = 1; }
    else if (mode.slam) { cover = 0; alpha = 0; }
    else {
      const i = Math.max(0, Math.min(E.length - 2, Math.floor(fFloat) - E[0].f));
      const frac = clamp01(fFloat - Math.floor(fFloat));
      if (fFloat >= E[0].f) {
        cover = E[i].cover + (E[i + 1].cover - E[i].cover) * frac;
        alpha = E[i].alpha + (E[i + 1].alpha - E[i].alpha) * frac;
      }
    }
    const reveal = cover;
    if (reveal > 0) {
      // الانجراف: نموُّ القاع، كما قيس على المرجع — لا انتقالُ العنصر.
      const grown = mode.frozen || fFloat <= p.driftFrom
        ? p.hFull
        : p.hFull + (p.hDrifted - p.hFull) * clamp01((fFloat - p.driftFrom) / (p.driftTo - p.driftFrom));
      let dy = 0;
      if (mode.jitter && fFloat >= C.jitterFrom) {
        dy = Math.floor(fFloat) % 2 === 0 ? C.jitterPx : -C.jitterPx;
      }
      rects.push({ x: p.x, y: p.y + dy, w: p.w, h: grown * reveal, color: p.color, a: alpha });
    }
  }

  // الصفُّ الأعلى
  if (fFloat >= C.topRow.fIn) {
    const r = C.topRow;
    rects.push({ x: r.x, y: r.y, w: r.w, h: r.h, color: r.color, a: 1 });
  }

  return rects;
}

/** يجمع عيّنةً واحدةً بوزنٍ في مُراكِمٍ عائم. */
function accumulate(acc, rects, weight) {
  for (const r of rects) {
    const x0 = Math.max(0, Math.round(r.x));
    const y0 = Math.max(0, Math.round(r.y));
    const x1 = Math.min(C.width, Math.round(r.x + r.w));
    const y1 = Math.min(C.height, Math.round(r.y + r.h));
    const w = weight * r.a;
    for (let y = y0; y < y1; y++) {
      let i = (y * C.width + x0) * 3;
      for (let x = x0; x < x1; x++) {
        // مزجٌ خطّيٌّ على ما تراكم: الشفافيّةُ تُطبَّق هنا لا بعد المتوسّط، وإلّا
        // صار تلاشي العنصرِ تلاشيًا للمشهد كلِّه.
        acc[i] += (r.color[0] - acc[i]) * w; i++;
        acc[i] += (r.color[1] - acc[i]) * w; i++;
        acc[i] += (r.color[2] - acc[i]) * w; i++;
      }
    }
  }
}

function renderFrame(buf, acc, index, mode) {
  // الخلفيّةُ أوّلًا، ثم العناصرُ فوقها. و«بعيّنةٍ واحدة» هي الحالةُ الافتراضيّة
  // بالضبط، لا حالةٌ خاصّة: `samples = 1` تُعطي العيّنةَ عند الإطار بعينه.
  const samples = mode.samples ?? 1;
  for (let i = 0; i < acc.length; i += 3) {
    acc[i] = C.bg[0]; acc[i + 1] = C.bg[1]; acc[i + 2] = C.bg[2];
  }
  if (samples === 1) {
    accumulate(acc, sceneAt(index, mode), 1);
  } else {
    // متوسّطٌ حقيقيٌّ على فترة فتح المغلاق — المتطابقةُ نفسُها التي في
    // `src/lib/motionBlur.ts`: `k / samples` لا `(k + ½) / samples`.
    const base = [];
    for (let k = 0; k < samples; k++) {
      base.push(sceneAt(index + (k / samples) * C.shutterFraction, mode));
    }
    // لوحٌ لكلّ عيّنةٍ ثم متوسّطٌ: ولا يُجمَع بالمزج المتتالي لأن المزجَ ليس
    // تبادليًّا، فترتيبُ العيّنات كان سيُغيّر النتيجة.
    const tmp = new Float32Array(acc.length);
    const out = new Float32Array(acc.length);
    for (const rects of base) {
      for (let i = 0; i < tmp.length; i += 3) {
        tmp[i] = C.bg[0]; tmp[i + 1] = C.bg[1]; tmp[i + 2] = C.bg[2];
      }
      accumulate(tmp, rects, 1);
      for (let i = 0; i < out.length; i++) out[i] += tmp[i] / samples;
    }
    acc.set(out);
  }
  for (let i = 0; i < buf.length; i++) {
    const v = acc[i];
    buf[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }
  return buf;
}

// ════════════════════════════════════════════════════════════════════════════
// الشواهد — ولا اثنان منها يختلفان في أكثرَ من شيءٍ واحدٍ مسمًّى
// ════════════════════════════════════════════════════════════════════════════
export const MODES = {
  'adv-ease': {
    file: 'adv-ease.mp4',
    curve: 'back',
    label: 'الشاهدُ الصالح: تخفيفُ خروجٍ بتجاوزٍ ٢٫٠٣px · تدرّجُ دخولٍ ثلاثةُ إطاراتٍ · انجرافٌ ١٠٫٤px · ثباتٌ',
    expect: 'يمرّ على بنود الحركة كلِّها',
  },
  'adv-linear': {
    file: 'adv-linear.mp4',
    curve: 'linear',
    label: 'المستقيم: `adv-ease` حرفًا بحرف إلّا أن منحنى «البطاقة» سرعةٌ ثابتة',
    expect: 'يسقط على `card-settles` وحدَه',
  },
  'adv-slam': {
    file: 'adv-slam.mp4',
    curve: 'back',
    slam: true,
    label: 'المُقحِم: `adv-ease` حرفًا بحرف إلّا أن «الكبسولة» تقتحم في إطارٍ واحدٍ بدل ثلاثة',
    expect: 'يسقط على `capsule-ramps` وحدَه',
  },
  'adv-jitter': {
    file: 'adv-jitter.mp4',
    curve: 'back',
    jitter: true,
    label: 'الثباتُ المكسور: `adv-ease` حرفًا بحرف إلّا أن التركيبةَ تهتزّ ±٦px في الثانية الأخيرة',
    expect: 'يسقط على `capsule-holds` و`hold-final*`',
  },
  'adv-frozen': {
    file: 'adv-frozen.mp4',
    curve: 'back',
    frozen: true,
    label: 'المُجمَّدُ عند ٥٫٥ث: `adv-ease` حرفًا بحرف إلّا أن الانجرافَ البطيءَ محذوف',
    expect: 'يسقط على `composition-keeps-settling` وحدَه',
  },
  'adv-blur': {
    file: 'adv-blur.mp4',
    curve: 'back',
    samples: C.blurSamples,
    label: 'الضبابُ: `adv-ease` حرفًا بحرف إلّا أن المغلاقَ مفتوحٌ بستّ عشرةَ عيّنةً',
    expect: 'يمرّ على البنود نفسِها التي يمرّ عليها `adv-ease` — بلا فرق',
  },
};

export const GROUND_TRUTH = { ...C, backCoefficient: BACK_C, curves: Object.keys(CURVES) };

function encode(name) {
  const mode = MODES[name];
  return new Promise((resolve, reject) => {
    const out = path.join(OUT_DIR, mode.file);
    const ff = spawn(FFMPEG, [
      '-y', '-v', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgb24',
      '-s', `${C.width}x${C.height}`,
      '-r', String(C.fps),
      '-i', 'pipe:0',
      // `-crf 18` و`yuv420p` كما في شواهد `t00`: ما يُخرجه تصديرٌ حقيقيّ، كي
      // تُعاير عتباتُ اللون على الخسارة التي ستقع فعلًا.
      '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-frames:v', String(C.frames),
      out,
    ]);
    let err = '';
    ff.stderr.on('data', (d) => { err += d; });
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`ffmpeg ${code}: ${err}`))));

    const buf = Buffer.allocUnsafe(C.width * C.height * 3);
    const acc = new Float32Array(C.width * C.height * 3);
    let i = 0;
    const pump = () => {
      while (i < C.frames) {
        renderFrame(buf, acc, i, mode);
        i++;
        if (!ff.stdin.write(buf)) return ff.stdin.once('drain', pump);
      }
      ff.stdin.end();
    };
    pump();
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--truth')) {
    console.log(JSON.stringify(GROUND_TRUTH, null, 2));
    return;
  }
  const wanted = args.filter((a) => !a.startsWith('--'));
  const names = wanted.length ? wanted : Object.keys(MODES);
  console.log(`معامِلُ back المحلولُ لتجاوز ${C.overshootPx}px من ${C.card.yTo - C.card.yFrom}px: ${BACK_C.toFixed(6)}`);
  console.log(
    `التجاوز: كما يقرؤه المحكّم ${BACK.judgedPx.toFixed(3)}px · على الشبكة ${BACK.gridPx.toFixed(3)}px`
    + ` · على المنحنى المتّصل ${BACK.continuousPx.toFixed(3)}px · وعلى المستقيم ${BACK.linearJudgedPx.toFixed(3)}px\n`,
  );
  for (const name of names) {
    if (!MODES[name]) {
      console.error(`لا شاهدَ باسم «${name}». المتاح: ${Object.keys(MODES).join(' · ')}`);
      process.exitCode = 2;
      continue;
    }
    const out = await encode(name);
    console.log(`${name}\n   ${MODES[name].label}\n   المتوقَّع: ${MODES[name].expect}\n   ${out}\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
