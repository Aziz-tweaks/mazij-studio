#!/usr/bin/env node
// مُعاير بنود الحركة — وأداةُ قياسِ أرضيّةٍ لملفٍّ **لا شاهدَ له**.
//
// ═════════════════════════════════════════════════════════════════════════════
// لماذا أداةٌ ثانيةٌ ولم يُوسَّع `calibrate-video.mjs`
// ═════════════════════════════════════════════════════════════════════════════
// ليست المشكلةُ مسارًا مكتوبًا يدويًّا يُصلَح بوسيط. `calibrate-video.mjs` يحتاج
// **ثلاثةَ ملفّاتٍ معًا**: الهدفَ، وشاهدًا مجمَّدًا، ومِجَسَّ ضجيجٍ ساكنًا. وهي
// شواهدُ مُولَّدةٌ حقيقتُها الأرضيّةُ مكتوبةٌ كودًا — ولا نظيرَ لها لملفٍّ حقيقيّ:
// لا أحدَ يُسلّمنا مع المرجعِ نسخةً مجمَّدةً منه ومِجَسَّ ضجيجٍ بمحتواه.
//
// فأرضيّةُ ملفٍّ حقيقيٍّ لا تُقاس إلّا **من الملفّ نفسه**، من ذيله الساكن. وذلك
// يُدخل فخًّا لا وجودَ له في t00: الذيلُ الساكنُ ليس ساكنًا بالبِت — فيه قفزاتُ
// حدودِ GOP. وقيس في مرجعٍ حقيقيّ إطارٌ واحدٌ على حدّ مجموعةِ الصور يبعد عن
// جارَيه ٤٫٧٣ بينما يبعد جاراه أحدُهما عن الآخر ٠٫٠٩٣، وتلك القفزةُ **أكبرُ من
// أغلبِ حركةِ المقطع الحقيقيّة**.
//
// فهذه الأداةُ تُخرج **رقمَين لا رقمًا**: أرضيّةً مستقرّةً، والقفزاتَ المنفردةَ
// معزولةً عنها ومُسمّاةً بأرقام إطاراتها. ومن قرأ «أقصى فرقٍ في الذيل الساكن»
// رقمًا واحدًا بنى عتبةً على شاذٍّ لا على ضجيج.
//
// ═════════════════════════════════════════════════════════════════════════════
// وثلاثةُ أخطاءٍ تُكشَف هنا لأن قياسَ الأزواج المتتالية يعمى عنها
// ═════════════════════════════════════════════════════════════════════════════
// (أ) **ثباتُ قياسٍ عبر عتباتٍ لا يجعله صحيحًا.** قيس على مرجعٍ حقيقيٍّ أن قياسَ
//     الأزواج يُخرج زمنَ السكون ٨٫٠٣٣ث عند كلّ عتبةٍ من ٠٫٢٥ إلى ٤٫٠ — والصحيحُ
//     ٧٫٨٣٣. والسببُ أن شاذًّا واحدًا أعلى من كلّ العتبات، فثباتُ الجواب كان
//     ثباتَ الشاذِّ لا ثباتَ الظاهرة. فهذه الأداةُ تطبع الجوابَين — جوابَ الأزواج
//     وجوابَ الإطار المرجعيّ — **جنبًا إلى جنب**، فالخلافُ يُرى ولا يُستنتَج.
//
// (ب) **الانجرافُ المتراكم.** قيس في مرجعٍ حقيقيٍّ انجرافٌ يقرأ ٠٫٠٣ لكلّ زوجٍ
//     متتالٍ — تحت كلّ عتبةٍ معقولة — و٧٫٠٨ مُتراكمًا على المنطقة، نحو عشرين
//     بكسلًا على خمسين إطارًا. فالأداةُ تمسح النوافذَ وتُقارن **مجموعَ** فروقِ
//     أزواجها بفرقِ طرفَيها: حيث يكون فرقُ الطرفين أكبرَ كثيرًا من أقصى زوج،
//     فهناك انجرافٌ لا سكون.
//
// (ج) **أرضيّةُ مركزِ الثقل.** البنودُ الثلاثةُ الجديدة تقيس بالبكسل الكسريّ —
//     تجاوزًا مقداره أربعةُ بكسلاتٍ وانجرافًا مقداره أربعةُ أعشار. فأرضيّةُ ذلك
//     المقياس تُقاس أيضًا، ولا تُفترَض صفرًا لأنها تخرج صفرًا على المستطيلات
//     المصمتة — وهو الدرسُ الذي من أجله وُجد مِجَسُّ الضجيج في t00.
//
// ═════════════════════════════════════════════════════════════════════════════
// التشغيل
// ═════════════════════════════════════════════════════════════════════════════
//   node qa/replication/calibrate-motion.mjs --controls
//       يُعاير البنودَ الثلاثة على الشواهد المُولَّدة ويطبع مصفوفةَ الإسقاط:
//       أيُّ بندٍ يمرّ على أيّ شاهدٍ ويسقط على أيّ شاهد. وهذا هو الدليلُ.
//
//   node qa/replication/calibrate-motion.mjs <ملفّ.mp4>
//       أرضيّةُ ملفٍّ **بلا شاهد**: التوزيعُ، والقفزاتُ المنفردة، وزمنُ السكون
//       بالطريقتين، ومسحُ الانجراف.
//
//   ...  --region x,y,w,h --axis y
//       ويُضيف تتبّعَ مركزِ الثقل في منطقةٍ: أرضيّتَه الكسريّة ومدى حركته.
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { FrameSet, frameDelta, frameSeries, median3Filter, ANALYSIS_WIDTH } from './lib/video.mjs';
import { inkCentroid } from './lib/score.mjs';
import { parseHex } from './lib/png.mjs';
// البنودُ تُستورَد ولا تُعاد كتابتُها: المعايرةُ تُثبت صلاحَ **المحكّم** لا صلاحَ
// نسخةٍ منه. ولو كُتب هنا منطقٌ ثانٍ لصار في المستودع مقياسان، ولصحّ أحدُهما
// وسقط الآخرُ يومًا بلا أن يُنبّه أحد.
import { evalTemporalCriterion } from './lib/score-video.mjs';
import { GROUND_TRUTH } from './make-video-controls.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'targets', 't00-video-calib');

const num = (v) => v.toFixed(3);
const pct = (v) => `${(v * 100).toFixed(3)}٪`;

function quantiles(values) {
  const v = [...values].sort((a, b) => a - b);
  const at = (q) => v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
  return { min: v[0], median: at(0.5), q3: at(0.75), p99: at(0.99), max: v[v.length - 1] };
}

// ═════════════════════════════════════════════════════════════════════════════
// الجزء الأوّل — أرضيّةُ ملفٍّ بلا شاهد
// ═════════════════════════════════════════════════════════════════════════════

/** يَعزل الإطاراتَ المنفردةَ الشاذّة عن أرضيّة الضجيج.
 *
 * والتوقيعُ مقيسٌ لا مُفترَض: الإطارُ الشاذُّ يبعد عن **جارَيه كليهما** كثيرًا،
 * وجاراه أحدُهما عن الآخر قليلًا. فالاختبارُ نسبةٌ لا عتبة:
 *
 *     d(i−1,i) و d(i,i+1) كبيرتان  ·  d(i−1,i+1) صغيرة
 *
 * وهذا يُميّزه عن الحركة الحقيقيّة بالبناء: عنصرٌ يتحرّك يُبعِد الجارَين عن
 * بعضهما أيضًا، فنسبةُ الجسر لا تصغر. والنسبةُ — لا الفرقُ المطلق — هي المَخرجُ
 * من فخّ «قفزةُ الشاذّ أكبرُ من الحركة»: الشاذُّ لا يُعرَف بحجمه بل بشكله. */
function isolatedSpikes(frames, count, minRatio = 4) {
  const d = [];
  for (let i = 0; i < count - 1; i++) d.push(frameDelta(frames.small(i), frames.small(i + 1)).meanDistance);
  const out = [];
  for (let i = 1; i < count - 1; i++) {
    const left = d[i - 1];
    const right = d[i];
    const bridge = frameDelta(frames.small(i - 1), frames.small(i + 1)).meanDistance;
    const near = Math.min(left, right);
    if (bridge <= 1e-9) continue;
    const ratio = near / bridge;
    if (ratio >= minRatio) out.push({ index: i, left, right, bridge, ratio });
  }
  return { pairDeltas: d, spikes: out };
}

function reportFloor(file, opts) {
  const frames = new FrameSet(file, opts.analysisWidth ? { analysisWidth: opts.analysisWidth } : {});
  const f = frames.facts;
  const n = f.frameCount;
  console.log(`الملفّ: ${path.basename(file)}`);
  console.log(`        ${f.width}×${f.height} · ${f.fps?.text} · ${n} إطارًا · ${num(f.duration ?? 0)}ث · ${f.codec}/${f.pixFmt}`);
  console.log(`شريط التحليل: ${frames.analysisWidth}px → ${frames.small(0).width}×${frames.small(0).height}`);
  console.log('='.repeat(78));

  // ── (١) التوزيعُ كلُّه، والقفزاتُ المنفردةُ معزولة ─────────────────────────
  const { pairDeltas, spikes } = isolatedSpikes(frames, n);
  const all = quantiles(pairDeltas);
  console.log(`\n(١) فروقُ الأزواج المتتالية — ${pairDeltas.length} زوجًا`);
  console.log(`    وسيط ${num(all.median)} · رُبيعٌ أعلى ${num(all.q3)} · مئين٩٩ ${num(all.p99)} · أقصى ${num(all.max)}`);

  const spikeIdx = new Set(spikes.flatMap((s) => [s.index - 1, s.index]));
  const clean = pairDeltas.filter((_, i) => !spikeIdx.has(i));
  const cq = quantiles(clean);
  console.log(`\n(٢) القفزاتُ المنفردة — إطاراتٌ تبعد عن جارَيها وجاراها متقاربان`);
  if (!spikes.length) {
    console.log('    لا قفزةَ منفردةً بهذا التوقيع. ⇐ وهذه نتيجةٌ تُقرأ، لا غيابَ قياس:');
    console.log('      ملفٌّ بلا قفزاتٍ تُعطي عتبتُه الواحدةُ جوابًا صحيحًا.');
  } else {
    for (const s of spikes) {
      console.log(
        `    #${s.index} @ ${num(f.ptsSeconds[s.index])}ث  جاراه ${num(s.left)}/${num(s.right)}`
        + `  والجسرُ بينهما ${num(s.bridge)}  ⇒ نسبةٌ ×${s.ratio.toFixed(1)}`,
      );
    }
    // الخطرُ يُقاس بالمقارنة بالأرضيّة المستقرّة، لا بالمقارنة بأقصى المقطع:
    // مقطعٌ حركتُه قويّةٌ أقصاه حركةٌ حقيقيّةٌ لا شاذّ، والشاذُّ فيه مع ذلك أعلى
    // من **أرضيّته** بمئات الأضعاف — وهو الرقمُ الذي تُبنى عليه عتبةُ السكون.
    const worstSpike = Math.max(...spikes.map((s) => Math.max(s.left, s.right)));
    console.log(`    ⇐ وهذه **ليست حركة**: الإطارُ منفردٌ أُعيدت كوانتَزتُه مستقلًّا.`);
    console.log(`      وأشدُّها ${num(worstSpike)} — أي ×${(worstSpike / Math.max(cq.median, 1e-9)).toFixed(0)} فوق وسيط الأرضيّة`);
    console.log(`      و×${(worstSpike / Math.max(cq.q3, 1e-9)).toFixed(1)} فوق رُبيعها الأعلى. فعتبةُ سكونٍ تحتها تسقط على`);
    console.log('      إطارٍ لم يتحرّك فيه شيء، وعتبةٌ فوقها تُسمّي الحركةَ الحقيقيّةَ سكونًا.');
    console.log('      والمخرجُ ليس رفعَ العتبة بل عزلَ الشاذّ — وهو ما في هذا الجدول.');
    console.log('');
    console.log('      وتُقاس القفزةُ بـ**شكلها** لا بموضعها، وهذا مقصود: نسبةُ الجسر');
    console.log('      لا تسأل أين حدُّ GOP. ولو سألت لأخطأت على ملفٍّ حقيقيٍّ قيس هنا —');
    console.log('      فيه مفاتيحُ الصور كلُّ ٢٩ إطارًا (٠·٢٩·٥٨…٢٣٢·٢٦١) والشاذُّ عند');
    console.log('      #٢٤٠، وهو **ليس مفتاحًا ولا على حدِّ مجموعة**. فالأثرُ مقيسٌ');
    console.log('      والسببُ المنسوبُ إليه غيرُ مقيس، والمقياسُ لا يُبنى على السبب.');
  }
  console.log(`\n    الأرضيّةُ المستقرّة (بعد العزل): وسيط ${num(cq.median)} · رُبيعٌ أعلى ${num(cq.q3)}`);
  console.log(`        مئين٩٩ ${num(cq.p99)} · أقصى ${num(cq.max)}`);
  // والمُرشَّحُ شاهدٌ ثانٍ مستقلٌّ على الرقم نفسِه: لو اختلف عن العزل كثيرًا فأحدُ
  // المقياسين يُخطئ، ويجب أن يُرى.
  const filtered = quantiles(median3Filter(pairDeltas));
  console.log(`        وبوسيطٍ ثلاثيٍّ على السلسلة (شاهدٌ ثانٍ): أقصى ${num(filtered.max)}`);

  // ── (٣) زمنُ السكون بالطريقتين ────────────────────────────────────────────
  // وهذا هو الجدولُ الذي يُكشَف فيه فخُّ «الثبات عبر العتبات».
  console.log(`\n(٣) زمنُ بدء السكون — بالأزواج المتتالية وبالإطار المرجعيّ #${n - 5}`);
  console.log('    العتبة │ بالأزواج        │ بالمرجعيّ        │');
  const ref = frames.small(n - 5);
  const toRef = [];
  for (let i = 0; i < n - 5; i++) toRef.push(frameDelta(frames.small(i), ref).meanDistance);
  const spikeFrames = new Set(spikes.map((s) => s.index));
  for (const th of [0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 4.0]) {
    let lastPair = -1;
    for (let i = 0; i < pairDeltas.length; i++) {
      if (pairDeltas[i] > th && !spikeIdx.has(i)) lastPair = i;
    }
    let lastRef = -1;
    for (let i = 0; i < toRef.length; i++) {
      if (toRef[i] > th && !spikeFrames.has(i)) lastRef = i;
    }
    const tp = lastPair < 0 ? '—' : `${num(f.ptsSeconds[lastPair + 2] ?? f.ptsSeconds[n - 1])}ث`;
    const tr = lastRef < 0 ? '—' : `${num(f.ptsSeconds[lastRef + 1] ?? f.ptsSeconds[n - 1])}ث`;
    const mark = tp !== tr ? ' ⟵ يختلفان' : '';
    console.log(`    ${String(th).padStart(6)} │ ${tp.padStart(15)} │ ${tr.padStart(16)} │${mark}`);
  }
  console.log('    ⇐ وحيث اختلفا فالجوابُ جوابُ المرجعيّ: الأزواجُ تعمى عن الانجراف');
  console.log('      البطيء، فتُقدّم زمنَ السكون على حقيقته.');

  // ── (٤) مسحُ الانجراف المتراكم ────────────────────────────────────────────
  // لكلّ نافذةٍ: أقصى فرقِ زوجٍ فيها مقابل فرقِ طرفَيها. والنسبةُ هي المقياس —
  // فنافذةٌ ساكنةٌ حقًّا يتقارب فيها الرقمان، ونافذةٌ تنجرف يَكبر فيها الثاني
  // أضعافًا ويبقى الأوّل تحت كلّ عتبة.
  const win = Math.max(8, Math.round((f.fps?.value ?? 30) * 1.5));
  console.log(`\n(٤) مسحُ الانجراف المتراكم — نوافذُ ${win} إطارًا`);
  console.log('    النافذة (ث)      │ أقصى زوج │ فرقُ الطرفين │ النسبة');
  const drifts = [];
  for (let a = 0; a + win < n; a += win) {
    const b = a + win;
    let worstPair = 0;
    for (let i = a; i < b; i++) if (!spikeIdx.has(i)) worstPair = Math.max(worstPair, pairDeltas[i]);
    const ends = frameDelta(frames.small(a), frames.small(b)).meanDistance;
    const ratio = worstPair > 1e-9 ? ends / worstPair : Infinity;
    drifts.push({ a, b, worstPair, ends, ratio });
    const flag = ratio >= 3 && ends > 0.2 ? ' ⟵ انجرافٌ متراكم' : '';
    console.log(
      `    ${num(f.ptsSeconds[a]).padStart(7)}→${num(f.ptsSeconds[b]).padEnd(8)} │ ${num(worstPair).padStart(8)}`
      + ` │ ${num(ends).padStart(12)} │ ×${Number.isFinite(ratio) ? ratio.toFixed(1) : '∞'}${flag}`,
    );
  }
  const worstDrift = drifts.filter((d) => Number.isFinite(d.ratio)).sort((x, y) => y.ratio - x.ratio)[0];
  if (worstDrift) {
    console.log(`    ⇒ أشدُّ نافذةٍ: ${num(f.ptsSeconds[worstDrift.a])}→${num(f.ptsSeconds[worstDrift.b])}ث`
      + ` — أقصى زوجٍ ${num(worstDrift.worstPair)} وفرقُ الطرفين ${num(worstDrift.ends)} (×${worstDrift.ratio.toFixed(1)})`);
  }

  // ── (٥) أرضيّةُ مركزِ الثقل، إن أُعطيت منطقة ──────────────────────────────
  if (opts.region) {
    const bg = parseHex(opts.background ?? '#0F3D3E');
    const axis = opts.axis ?? 'y';
    console.log(`\n(٥) مركزُ ثقلِ الحبر في المنطقة، على محور ${axis} (المقاس الأصلي، خلفيّة ${opts.background ?? '#0F3D3E'})`);
    const s = frameSeries(frames, f.ptsSeconds[0], f.ptsSeconds[n - 1], (i) => {
      const ctr = inkCentroid(frames.full(i), opts.region, bg, 60);
      return ctr ? ctr[axis] : null;
    });
    if (s.error) {
      console.log(`    ${s.error}`);
    } else {
      const r = s.raw;
      const q = quantiles(r);
      console.log(`    المدى ${num(q.min)} → ${num(q.max)} بكسلًا (${num(q.max - q.min)} بكسلًا سعةً)`);
      let maxStep = 0;
      let maxStepAt = 0;
      for (let i = 0; i < r.length - 1; i++) {
        const st = Math.abs(r[i + 1] - r[i]);
        if (st > maxStep) { maxStep = st; maxStepAt = i; }
      }
      console.log(`    أقصى خُطوةِ مركزٍ بين إطارين: ${num(maxStep)} بكسل عند #${s.frames[maxStepAt]}`);
      // أرضيّةُ المركز تُقاس على الذيل: حيث لا حركةَ في المصدر، كلُّ خُطوةٍ ضجيج.
      const tailFrom = Math.max(0, r.length - 1 - Math.round((f.fps?.value ?? 30) * 2));
      const tail = r.slice(tailFrom);
      const tq = quantiles(tail);
      let tailStep = 0;
      for (let i = 0; i < tail.length - 1; i++) tailStep = Math.max(tailStep, Math.abs(tail[i + 1] - tail[i]));
      console.log(`    وعلى آخرِ ${tail.length} إطارًا: سعةٌ ${num(tq.max - tq.min)} بكسل · أقصى خُطوةٍ ${num(tailStep)} بكسل`);
      console.log('    ⇐ وهذه **أرضيّةُ البنود الثلاثة** بالبكسل الكسريّ: كلُّ عتبةِ تجاوزٍ أو');
      console.log('      رجوعٍ تُقاس منها لا من صفر. وصفرُها على المستطيلات المصمتة مُضلِّلٌ');
      console.log('      كما كان صفرُ `movedFraction` في t00.');
    }
  }

  frames.dispose();
}

// ═════════════════════════════════════════════════════════════════════════════
// الجزء الثاني — مصفوفةُ الإسقاط: كلُّ بندٍ يمرّ على شاهدٍ ويسقط على آخر
// ═════════════════════════════════════════════════════════════════════════════
// وهذه هي الحُجّة. بندٌ لا يسقط على شيءٍ في المعايرة **لم يُقَس** — ويبقى زينةً
// وإن كان منطقُه صحيحًا. وهو درسُ t00 نفسُه، وهو الذي أوجد الشاهدَ الرابع هناك.

const BG = '#0F3D3E';
const BAR = { x: 0.52, y: 0.4, w: 0.33, h: 0.025 };
const REG = GROUND_TRUTH.move.region;

/** البنودُ المُعايَرة. كلُّ عتبةٍ تُطبَع مع مصدرها أدناه، ولا رقمَ هنا بلا سطرٍ
 * يقول من أين جاء. */
const CLAUSES = [
  {
    id: 'ramp-grows',
    type: 'entryRamp',
    region: BAR,
    t0: 0.4,
    t1: 1.6,
    minRampFrames: 5,
    maxStepShare: 0.28,
    expect: { target: true, 'motion-slam': false },
    why: 'الحبرُ نما تدرّجًا، لا اقتحامًا في إطار',
  },
  {
    id: 'dir-down',
    type: 'motionDirection',
    region: REG,
    axis: 'y',
    t0: 1.0,
    t1: 2.6,
    displacementPx: 800,
    tolerancePx: 8,
    expect: { 'motion-linear': true, 'motion-wrong-way': false },
    why: 'الإزاحةُ ٨٠٠ بكسلًا **نزولًا** — والمعاكسُ مقدارُه مطابق',
  },
  {
    id: 'dir-no-detour',
    type: 'motionDirection',
    region: REG,
    axis: 'y',
    t0: 1.0,
    t1: 2.6,
    minDisplacementPx: 400,
    maxBacktrackPx: 2,
    expect: { 'motion-linear': true, 'motion-detour': false },
    why: 'ولا رجوعَ في الطريق — والالتفافُ طرفاه صحيحان',
  },
  {
    id: 'dir-sees-drift',
    type: 'motionDirection',
    region: REG,
    axis: 'y',
    t0: 2.6,
    t1: 3.9,
    displacementPx: 0,
    tolerancePx: 2,
    expect: { 'motion-linear': true, 'motion-creep': false, 'motion-drift': false },
    why: 'واللقطةُ النهائيّةُ لا تنجرف — و`motion-creep` يجتاز بندَ السكون ويسقط هنا',
  },
  {
    id: 'ease-is-linear',
    type: 'easingShape',
    region: REG,
    axis: 'y',
    t0: 1.0,
    t1: 2.6,
    maxVelocityPeakRatio: 1.82,
    maxOvershootPx: 1.5,
    expect: { 'motion-linear': true, 'motion-ease-out': false, 'motion-overshoot': false, 'motion-spike': true },
    why: 'سرعةٌ ثابتة — يسقط على أيّ تخفيف',
  },
  {
    id: 'ease-is-out',
    type: 'easingShape',
    region: REG,
    axis: 'y',
    t0: 1.0,
    t1: 2.6,
    minVelocityPeakRatio: 1.82,
    peakVelocityBefore: 0.1,
    maxOvershootPx: 1.5,
    expect: { 'motion-ease-out': true, 'motion-linear': false, 'motion-ease-in-out': false, 'motion-overshoot': false },
    why: 'يدخل سريعًا ثم يستقرّ بلا تجاوز',
  },
  {
    id: 'smear-is-sharp',
    type: 'motionSmear',
    region: REG,
    axis: 'y',
    t: GROUND_TRUTH.blur.t,
    maxAnisotropy: 5,
    maxSoftInkShare: 0.1,
    expect: { 'motion-blur-off': true, 'motion-blur-on': false },
    why: 'الحوافُّ حادّةٌ — عيّنةٌ واحدةٌ للإطار',
  },
  {
    id: 'smear-is-blurred',
    type: 'motionSmear',
    region: REG,
    axis: 'y',
    t: GROUND_TRUTH.blur.t,
    minAnisotropy: 5,
    minSoftInkShare: 0.1,
    expect: { 'motion-blur-on': true, 'motion-blur-off': false, 'motion-linear': false },
    why: 'مسحةٌ على اتّجاه السير — و`motion-linear` يُثبت أن الحركةَ وحدَها لا تَكفي',
  },
  {
    id: 'ease-is-overshoot',
    type: 'easingShape',
    region: REG,
    axis: 'y',
    t0: 1.0,
    t1: 2.6,
    minVelocityPeakRatio: 1.82,
    overshootPx: 4,
    overshootTolerancePx: 1.5,
    expect: { 'motion-overshoot': true, 'motion-linear': false, 'motion-ease-out': false },
    why: 'يتجاوز أربعةَ بكسلاتٍ ثم يستقرّ',
  },
];

/** قراءتا بندِ المسحة على الشواهد — الأرضيّةُ أقصى ما قرأه شاهدٌ **بلا** ضباب،
 * والإشارةُ ما قرأه الشاهدُ المُضبَّب. وتُجمَع الأرضيّةُ من أربعة شواهدَ لا من
 * واحد: `motion-blur-off` (سريعٌ حادّ) و`motion-linear` و`motion-ease-out` و
 * `motion-overshoot` — فعتبةٌ مبنيّةٌ على قراءةٍ واحدةٍ تُعاير على تلك القراءة. */
function smearReadings(open) {
  const read = (name, t) => {
    const r = evalTemporalCriterion(
      { id: 'cal', type: 'motionSmear', region: REG, axis: 'y', t, minAnisotropy: 1e-9, minSoftInkShare: 1e-9 },
      open(name), parseHex(BG),
    );
    return {
      aniso: Number(r.got.match(/الاتّجاه ([\d.]+)/)[1]),
      soft: Number(r.got.match(/الحافّة ([\d.]+)/)[1]) / 100,
    };
  };
  const sharp = [
    read('motion-blur-off', GROUND_TRUTH.blur.t),
    read('motion-linear', 1.5),
    read('motion-ease-out', 1.5),
    read('motion-overshoot', 1.5),
  ];
  const blurred = read('motion-blur-on', GROUND_TRUTH.blur.t);
  return {
    anisoFloor: Math.max(...sharp.map((r) => r.aniso)),
    softFloor: Math.max(...sharp.map((r) => r.soft)),
    anisoSignal: blurred.aniso,
    softSignal: blurred.soft,
  };
}

const CONTROLS = [
  'target', 'motion-slam',
  'motion-linear', 'motion-ease-out', 'motion-ease-in-out', 'motion-overshoot',
  'motion-wrong-way', 'motion-detour', 'motion-spike', 'motion-creep', 'motion-drift',
  'motion-blur-off', 'motion-blur-on',
];

/** الشاهدُ المقابل: `staticAfter` على شواهد الانجراف.
 *
 * وهذا ليس زينةً في تقرير المعايرة بل **شرطُ الدعوى**. فالقولُ «بندُ الاتّجاه يرى
 * ما يعمى عنه بندُ السكون» لا يُثبته إلّا ملفٌّ يجتاز الثانيَ ويسقط على الأوّل.
 * ولولا هذا الجدولُ لكانت الدعوى نقلًا عن قياسٍ في ملفٍّ آخر، لا قياسًا هنا. */
function crossCheckHold(open, bg) {
  const hold = { id: 'hold', type: 'staticAfter', t: 2.6, maxDistance: 0.12, maxMovedFraction: 0.00035 };
  const dir = {
    id: 'dir', type: 'motionDirection', region: REG, axis: 'y',
    t0: 2.6, t1: 3.9, displacementPx: 0, tolerancePx: 2,
  };
  console.log('\n(د) الشاهدُ المقابل — `staticAfter` على شواهد الانجراف');
  console.log('    الشاهد          │ staticAfter(٢٫٦ث)        │ motionDirection(٢٫٦→٣٫٩ث)');
  for (const name of ['motion-linear', 'motion-creep', 'motion-drift']) {
    const fsx = open(name);
    const a = evalTemporalCriterion(hold, fsx, bg);
    const b = evalTemporalCriterion(dir, fsx, bg);
    console.log(`    ${name.padEnd(15)} │ ${(a.ok ? '✅ يمرّ' : '❌ يسقط').padEnd(24)} │ ${b.ok ? '✅ يمرّ' : '❌ يسقط'}`);
    console.log(`        السكون:   ${a.got.split(' (')[0]}`);
    console.log(`        الاتّجاه: ${b.got.split(' (')[0]}`);
  }
  console.log('    ⇐ والسطرُ الحاكمُ هو `motion-creep`: يجتاز بندَ السكون **بساقَيه معًا**');
  console.log('      (٠٫٠١٩ تحت ٠٫١٢ · ٠٫٠٠٪ تحت ٠٫٠٣٥٪) ويسقط على بندِ الاتّجاه بـ‎+٧٫٥٠');
  console.log('      بكسلًا. فالعمى مقيسٌ هنا لا منقولٌ عن ملفٍّ آخر.');
  console.log('      و`motion-drift` (٠٫٤ بكسل/إطار) يسقط على البندين — لكنه يسقط على');
  console.log('      السكون بالساقِ المحروسةِ من طرفٍ واحدٍ وبفارقِ ١٫١ فقط. فإمساكُه');
  console.log('      مصادفةُ محتوًى لا حرسٌ، وتنصيفُ المعدّل يُفلِته.');
}

function runControls() {
  const g = GROUND_TRUTH;
  console.log('معايرةُ بنودِ الحركة على شواهدَ حقيقتُها الأرضيّة مكتوبةٌ كودًا');
  console.log('='.repeat(78));
  console.log(`الكتلةُ ${g.move.w}×${g.move.h} تنزل ${g.move.y0}→${g.move.y1} (${g.travelPx}px)`
    + ` بين ${g.move.t0}ث و${g.move.t1}ث = ${g.movePairs} زوجًا`);
  console.log(`التجاوزُ المبنيُّ ${g.back.overshootPx}px بالضبط · c1=${g.back.c1.toFixed(6)}`);
  console.log(`الانجرافُ المبنيُّ ${g.move.driftPerFrame}px/إطار · المجموع ${g.driftTotalPx.toFixed(1)}px`);
  console.log(`الشاذُّ المبنيُّ: الإطار #${g.move.spikeFrame} مقحَمٌ ${g.move.spikePx}px`);

  const bg = parseHex(BG);
  const sets = new Map();
  const open = (name) => {
    if (!sets.has(name)) sets.set(name, new FrameSet(path.join(DIR, `${name}.mp4`)));
    return sets.get(name);
  };

  // ── المقيسُ الخام، قبل أيّ حكم ───────────────────────────────────────────
  // يُطبَع أوّلًا لأن العتبةَ تُشتَقّ منه: من قرأ العتبةَ قبل المقيس قرأ رقمًا
  // بلا مصدر.
  console.log('\n(أ) المقيسُ الخام على الشواهد — ومنه تُشتَقّ كلُّ عتبةٍ أدناه');
  console.log('    الشاهد             │ إزاحة   │ تجاوز  │ رجوع   │ نسبة  │ خامّة │ ذروةٌ عند');
  const raw = {};
  for (const name of CONTROLS.slice(2)) {
    const fsx = open(name);
    const s = frameSeries(fsx, 1.0, 2.6, (i) => {
      const c = inkCentroid(fsx.full(i), REG, bg, 60);
      return c ? c.y : null;
    });
    const p = s.smooth;
    const rest = median3Filter(p.slice(-3))[1];
    const travel = p[p.length - 1] - p[0];
    const dir = Math.sign(travel) || 1;
    let over = -Infinity;
    for (const q of p) over = Math.max(over, dir * (q - rest));
    let run = -Infinity;
    let back = 0;
    for (const q of p) { run = Math.max(run, dir * q); back = Math.max(back, run - dir * q); }
    const central = [];
    for (let i = 1; i < s.raw.length - 1; i++) central.push((s.raw[i + 1] - s.raw[i - 1]) / 2);
    const v = median3Filter(central);
    const mean = Math.abs(travel) / (p.length - 1);
    const peak = Math.max(...v.map(Math.abs));
    const peakRaw = Math.max(...central.map(Math.abs));
    const at = (v.map(Math.abs).indexOf(peak) + 1) / (p.length - 1);
    raw[name] = { travel, over, back, ratio: peak / mean, ratioRaw: peakRaw / mean, at };
    console.log(
      `    ${name.padEnd(18)} │ ${travel.toFixed(1).padStart(7)} │ ${over.toFixed(2).padStart(6)}`
      + ` │ ${back.toFixed(2).padStart(6)} │ ${(peak / mean).toFixed(3)} │ ${(peakRaw / mean).toFixed(3)} │ ${at.toFixed(3)}`,
    );
  }
  console.log('    ⇐ عمودُ «خامّة» هو النسبةُ بلا مُرشِّحِ الوسيط. وانظر `motion-spike`:');
  console.log(`      خامًّا ${raw['motion-spike'].ratioRaw.toFixed(3)} ومُرشَّحًا ${raw['motion-spike'].ratio.toFixed(3)} — وهو رقمُ`);
  console.log(`      المستقيم ${raw['motion-linear'].ratio.toFixed(3)} نفسُه. فالشاذُّ مطروحٌ تمامًا لا مُخفَّف.`);

  // ── الفصلُ المقيس لكلّ حقل ───────────────────────────────────────────────
  console.log('\n(ب) الفصلُ المقيس — ومنه العتبةُ وسطًا هندسيًّا بين الطرفين');
  const sep = (label, loName, loVal, hiName, hiVal, th) => {
    const geo = Math.sqrt(Math.abs(loVal) * Math.abs(hiVal));
    console.log(`    ${label}`);
    console.log(`        ${loName} ${loVal.toFixed(3)}  ·  ${hiName} ${hiVal.toFixed(3)}`
      + `  ⇒ وسطٌ هندسيّ ${geo.toFixed(3)} · العتبةُ المستعملة ${th}`);
    console.log(`        ×${(th / Math.abs(loVal)).toFixed(2)} فوق الأوّل · ÷${(Math.abs(hiVal) / th).toFixed(2)} تحت الثاني`);
  };
  sep('نسبةُ ذروةِ السرعة', 'المستقيم', raw['motion-linear'].ratio, 'تخفيفُ الخروج', raw['motion-ease-out'].ratio, 1.82);
  sep('موضعُ الذروة', 'تخفيفُ الخروج', raw['motion-ease-out'].at, 'تخفيفٌ من الطرفين', raw['motion-ease-in-out'].at, 0.1);
  // والبكسلُ الكسريُّ لا يُعاير على الشواهد المُولَّدة: أرضيّةُ مركزِ الثقل عليها
  // **صفرٌ بالضبط** — قيس ذلك على `control-frozen` فخرجت السعةُ ٠٫٠٠٠٠ بكسل على
  // ١١٥ إطارًا. وهو صحيحٌ ومُضلِّلٌ معًا، وهو الدرسُ نفسُه الذي أوجد مِجَسَّ
  // الضجيج في t00: محتوى الشواهد مستطيلاتٌ مصمتة، فيَفُكُّها الفاكُّ مطابقةً
  // بالبِت. فعتبةٌ مبنيّةٌ على ذلك الصفر كانت ستسقط على أوّل ملفٍّ فيه تدرّج.
  //
  // فأرضيّةُ البكسل الكسريّ تُقاس على **محتوًى حقيقيّ**: ذيلٌ ساكنٌ من ملفٍّ
  // مُرمَّزٍ فعلًا. والمقيسُ أدناه مُخرَجُ هذه الأداةِ نفسِها في وضعِ الملفّ
  // الواحد، على ٦١ إطارًا ساكنةً من ملفٍّ ٢٥٦٠×١٤٤٠: **سعةٌ ٠٫٠٤٨ بكسل وأقصى
  // خُطوةٍ ٠٫٠٣٨ بكسل**. ومن أعاد القياسَ على محتوًى أصعبَ فوجد أكبرَ فذلك
  // نتيجةٌ تُبلَّغ وعتبةٌ تُرفَع، لا ملفٌّ تالف.
  const CENTROID_FLOOR = 0.048;
  console.log('    التجاوزُ والرجوعُ والانجراف — فصلُها ليس نسبةً بين ظاهرتين بل');
  console.log(`    حدٌّ بين أرضيّةِ البكسل الكسريّ (${CENTROID_FLOOR}px، مقيسةٌ على محتوًى حقيقيّ) والمبنيّ:`);
  const oneSided = (label, floorV, signalV, th) => {
    console.log(`        ${label}`);
    console.log(`            أرضيّة ${floorV}px · المبنيُّ ${signalV.toFixed(3)}px · وسطٌ هندسيّ ${Math.sqrt(floorV * Math.abs(signalV)).toFixed(3)}px · العتبة ${th}px`);
    console.log(`            ×${(th / floorV).toFixed(0)} فوق الأرضيّة · ÷${(Math.abs(signalV) / th).toFixed(2)} تحت المبنيّ`);
  };
  // ــ عتبتا الضباب ــ كلتاهما بوسطٍ هندسيٍّ بين ظاهرتين مقيستين ــــــــــــــ
  // والأرضيّةُ هنا **ليست السكون** بل **حركةٌ سريعةٌ بلا ضباب** — وهذا هو الشرط:
  // عتبةٌ معايَرةٌ على إطارٍ ساكنٍ تُسمّي كلَّ حركةٍ ضبابًا. ولهذا يُقرأ الطرفُ
  // الأدنى من `motion-blur-off` نفسِه: المسارُ نفسُه والسرعةُ نفسُها واللحظةُ
  // نفسُها، ولا يفصله عن الآخر إلّا عددُ العيّنات.
  const smear = smearReadings(open);
  sep('تباينُ اتّجاه المسحة', 'حادٌّ (أقصى ما قيس)', smear.anisoFloor, 'مُضبَّبٌ ١٦ عيّنة', smear.anisoSignal, 5);
  sep('حصّةُ الحافّة', 'حادٌّ (أقصى ما قيس)', smear.softFloor, 'مُضبَّبٌ ١٦ عيّنة', smear.softSignal, 0.1);
  console.log(`        والمبنيُّ بقناع البند ${GROUND_TRUTH.blur.softInkShareMasked.toFixed(4)}`
    + ` · المقيسُ ${smear.softSignal.toFixed(4)} · فارقٌ `
    + `${(100 * Math.abs(smear.softSignal - GROUND_TRUTH.blur.softInkShareMasked) / GROUND_TRUTH.blur.softInkShareMasked).toFixed(2)}٪`);

  oneSided('تجاوزٌ (overshootTolerancePx)', CENTROID_FLOOR, raw['motion-overshoot'].over, 1.5);
  oneSided('رجوعٌ (maxBacktrackPx)', CENTROID_FLOOR, raw['motion-detour'].back, 2);
  oneSided('انجرافٌ (tolerancePx على نافذة الثبات)', CENTROID_FLOOR, 16, 2);
  console.log(`        وعلى المنحنياتِ الرتيبةِ يقرأ التجاوزُ ${raw['motion-linear'].over.toFixed(3)}px — صفرًا بالضبط،`);
  console.log('        فهو الطرفُ الذي تُسقِط عليه العتبةُ بندَ «يتجاوز» ويمرّ عليه بندُ «لا يتجاوز».');
  console.log('');
  console.log('        وعتبةُ التجاوز أبعدُ من الوسط الهندسيّ قصدًا، ولها مصدرُ خطأٍ ثانٍ');
  console.log('        غيرُ الأرضيّة: مُرشِّحُ الوسيط يَقشِط ذروةً عرضُها إطارٌ واحد. قيس ذلك');
  console.log(`        على الالتفاف — ذروتُه زاويةٌ حادّة — فقرأ ${raw['motion-detour'].over.toFixed(1)} بدل ٢٨٦٫٧ المُعيَّنةِ`);
  console.log('        بالعيّنات (و٣٠٠ متّصلةً). أمّا ذروةُ استقرارٍ حقيقيّةٍ فعريضةٌ بطبعها،');
  console.log(`        وقُرئت على الشاهد ${raw['motion-overshoot'].over.toFixed(3)} مقابل ${g.back.overshootPx} مبنيّةً — بخطأٍ صفر.`);

  // ── مصفوفةُ الإسقاط ──────────────────────────────────────────────────────
  console.log('\n(ج) مصفوفةُ الإسقاط — والسطرُ الذي لا ❌ فيه بندٌ لم يُقَس');
  let allOk = true;
  for (const cl of CLAUSES) {
    console.log(`\n  ${cl.id} — ${cl.why}`);
    for (const [name, want] of Object.entries(cl.expect)) {
      const fsx = open(name);
      const r = evalTemporalCriterion(cl, fsx, bg);
      const agree = r.ok === want;
      if (!agree) allOk = false;
      console.log(`      ${r.ok ? '✅' : '❌'} ${name.padEnd(19)} ${agree ? '' : '⚠️ خالفَ المتوقَّع — '}${want ? 'يجب أن يمرّ' : 'يجب أن يسقط'}`);
      console.log(`           ${r.got}`);
      if (!r.ok) console.log(`           المطلوب ${r.want}`);
    }
    const falsifiers = Object.values(cl.expect).filter((v) => v === false).length;
    const satisfiers = Object.values(cl.expect).filter((v) => v === true).length;
    if (!falsifiers || !satisfiers) {
      allOk = false;
      console.log(`      ⚠️ هذا البندُ ${!falsifiers ? 'لا شاهدَ يُسقطه' : 'لا شاهدَ يُرضيه'} — فلم يُقَس.`);
    }
  }

  crossCheckHold(open, bg);

  for (const s of sets.values()) s.dispose();
  console.log(`\n${'='.repeat(78)}`);
  console.log(allOk
    ? 'كلُّ بندٍ مرّ على شاهدٍ بُني ليُرضيه وسقط على شاهدٍ بُني ليَكسره.'
    : '⚠️ بندٌ خالفَ المتوقَّع — المعايرةُ لم تَثبت. لا تُشَدّ عتبةٌ على هذا.');
  return allOk;
}

function parseRegion(text) {
  const n = text.split(',').map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) {
    throw new Error(`«--region» تكون أربعةَ كسورٍ x,y,w,h — لا «${text}»`);
  }
  return { x: n[0], y: n[1], w: n[2], h: n[3] };
}

const USAGE = 'usage: node qa/replication/calibrate-motion.mjs [--controls]\n'
  + '       node qa/replication/calibrate-motion.mjs <file.mp4> [--region x,y,w,h]'
  + ' [--axis x|y] [--background #RRGGBB] [--analysis-width N]\n'
  + `       (عرضُ شريط التحليل الافتراضيّ ${ANALYSIS_WIDTH}px — مُعايَرٌ في README)`;

/** يفصل الوسائطَ المسمّاةَ عن الموضعيّة.
 *
 * ويُكتَب صريحًا لأن الطريقةَ القصيرة أخطأت: `argv.find(a => !a.startsWith('--'))`
 * تَلتقط **قيمةَ** وسيطٍ مسمًّى كأنها مسارَ ملفّ، فـ`--axis y` يجعل المسارَ «y».
 * فالقائمةُ تُمشى مرّةً واحدةً، وكلُّ وسيطٍ مسمًّى يَستهلك تاليَه. */
const VALUED = new Set(['region', 'axis', 'background', 'analysis-width']);
function parseArgs(argv) {
  const named = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const name = a.slice(2);
    if (VALUED.has(name)) {
      if (i + 1 >= argv.length) throw new Error(`الوسيطُ «--${name}» بلا قيمة`);
      named.set(name, argv[++i]);
    } else {
      named.set(name, true);
    }
  }
  return { named, positional };
}

function main() {
  const { named, positional } = parseArgs(process.argv.slice(2));
  if (named.has('help')) { console.log(USAGE); return; }
  if (named.has('controls') || (!positional.length && !named.size)) {
    if (!positional.length && !named.size) console.log('(بلا وسائط ⇒ --controls)\n');
    process.exit(runControls() ? 0 : 1);
  }
  const [file, ...extra] = positional;
  if (!file || extra.length) {
    console.error(extra.length ? `ملفٌّ واحدٌ لا ${positional.length}` : 'لا ملفّ');
    console.error(USAGE);
    process.exit(2);
  }
  const regionText = named.get('region');
  const axis = named.get('axis') ?? 'y';
  if (axis !== 'x' && axis !== 'y') {
    console.error(`«--axis» تكون x أو y، لا «${axis}»`);
    process.exit(2);
  }
  const widthText = named.get('analysis-width');
  reportFloor(file, {
    region: regionText ? parseRegion(regionText) : null,
    axis,
    background: named.get('background'),
    // لا قيمةَ هنا تعني «خُذ المُعايَرَ في `video.mjs`»، لا صفرًا ولا الافتراضيَّ
    // مكرَّرًا: تكرارُه هنا يجعل في المستودع عرضَين قد يختلفان.
    analysisWidth: widthText ? Number(widthText) : null,
  });
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
