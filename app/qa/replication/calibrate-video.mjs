#!/usr/bin/env node
// مُعاير العتبات الزمنيّة: يقيس أرضيّةَ الضجيج ومقدارَ الحركة الحقيقيّة على هدفٍ
// حقيقتُه الأرضيّة معلومة، ثم يطبع الفجوة بينهما.
//
// سببُ وجود هذا الملفّ: عتبةٌ مُخمَّنة تجعل البند زينةً. فإن قلنا «السكون يعني
// فرقًا أقلّ من ٥» فمن أين الخمسة؟ هنا تُقاس: الهدف يسكن فعلًا من ٢٫٠ث بحكم
// `make-video-controls.mjs`، فكلُّ فرقٍ بعد تلك اللحظة هو **ضجيجُ المرمِّز وحده**
// وليس حركة. وفي النافذة ٠٫٥ث–١٫٥ث يتحرّك شريطٌ فعلًا، فذاك مقدارُ الحركة.
// والعتبتان تُوضَعان في الفجوة بينهما، ونسبةُ الفجوة تُطبَع ليَحكم القارئ هل
// الفصل حقيقيٌّ أم على حدّ الضجيج.
//
// التشغيل: node qa/replication/calibrate-video.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FrameSet, frameDelta, ANALYSIS_WIDTH } from './lib/video.mjs';
import { inkFraction } from './lib/score.mjs';
import { parseHex } from './lib/png.mjs';

const BG = parseHex('#0F3D3E');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'targets', 't00-video-calib');
const TARGET = path.join(DIR, 'target.mp4');
const FROZEN = path.join(DIR, 'control-frozen.mp4');
const NOISE = path.join(DIR, 'probe-noise-hold.mp4');

const pct = (v) => `${(v * 100).toFixed(3)}٪`;
const num = (v) => v.toFixed(3);

function consecutive(fs_, from, to, region) {
  const out = [];
  for (let i = from; i < to; i++) out.push({ i, ...frameDelta(fs_.small(i), fs_.small(i + 1), { region }) });
  return out;
}

function stats(rows, key) {
  const vals = rows.map((r) => r[key]);
  const max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const at = rows[vals.indexOf(max)].i;
  return { max, mean, at };
}

function main() {
  const target = new FrameSet(TARGET);
  const frozen = new FrameSet(FROZEN);
  const { fps, frameCount } = target.facts;
  const f = (t) => target.frameIndexAt(t).index;

  console.log(`الهدف: ${target.facts.width}×${target.facts.height} · ${fps.text} · ${frameCount} إطارًا`);
  console.log(`شريط التحليل: عرض ${ANALYSIS_WIDTH}px → ${target.small(0).width}×${target.small(0).height}`);
  console.log('='.repeat(78));

  // ── (١) أرضيّة الضجيج: الهدف ساكنٌ من ٢٫٠ث بحكم البناء ───────────────────
  const holdFrom = f(2.0);
  const hold = consecutive(target, holdFrom, frameCount - 1);
  const holdMean = stats(hold, 'meanDistance');
  const holdMoved = stats(hold, 'movedFraction');
  console.log(`\n(١) أرضيّة الضجيج — الهدف من الإطار ${holdFrom} إلى ${frameCount - 1} (ساكنٌ بحكم البناء)`);
  console.log(`    meanDistance  أقصى ${num(holdMean.max)} (عند الزوج ${holdMean.at}) · متوسّط ${num(holdMean.mean)}`);
  console.log(`    movedFraction أقصى ${pct(holdMoved.max)} · متوسّط ${pct(holdMoved.mean)}`);

  // شاهدٌ ثانٍ لأرضيّة الضجيج: «المجمَّد» ساكنٌ في كامل طوله، فأقصى فرقٍ فيه هو
  // أرضيّة الضجيج على مجرًى كامل لا على ذيلٍ منه.
  const frozenAll = consecutive(frozen, 0, frozen.facts.frameCount - 1);
  const frozenMean = stats(frozenAll, 'meanDistance');
  console.log(`    وعلى «المجمَّد» كلِّه (${frozen.facts.frameCount} إطارًا): أقصى ${num(frozenMean.max)} · متوسّط ${num(frozenMean.mean)}`);
  console.log('    ⇐ وهذه أرضيّةُ **محتوًى مصمت**: صفرٌ لأن x264 يُخرج بواقيَ صفريّة');
  console.log('      لإطارٍ مكرّرٍ من ألوانٍ مسطّحة. لا تصلح عتبةً لفيديو حقيقيّ.');

  // ── (١ب) الأرضيّة الواقعيّة: مِجَسٌّ ساكنٌ بمحتوًى يُتعِب المرمِّز ──────────
  const noise = new FrameSet(NOISE);
  const noiseRows = consecutive(noise, 0, noise.facts.frameCount - 1);
  const noiseMean = stats(noiseRows, 'meanDistance');
  const noiseMoved = stats(noiseRows, 'movedFraction');
  console.log('\n(١ب) الأرضيّة الواقعيّة — مِجَسُّ الضجيج (تدرّجٌ + ضجيجٌ لكلّ بكسل، ساكنٌ تمامًا)');
  console.log(`    meanDistance  أقصى ${num(noiseMean.max)} (عند الزوج ${noiseMean.at}) · متوسّط ${num(noiseMean.mean)}`);
  console.log(`    movedFraction أقصى ${pct(noiseMoved.max)} · متوسّط ${pct(noiseMoved.mean)}`);
  const noiseFloor = Math.max(holdMean.max, frozenMean.max, noiseMean.max);
  const noiseFloorMoved = Math.max(holdMoved.max, noiseMoved.max);
  console.log(`    ⇒ أرضيّةُ الضجيج المُعتمَدة: mean ${num(noiseFloor)} · moved ${pct(noiseFloorMoved)}`);

  // ── (٢) الحركة الحقيقيّة ───────────────────────────────────────────────────
  const windows = [
    ['الشريط ينمو', 0.4, 1.6, null],
    ['القرص ينزلق', 1.0, 2.0, null],
    ['القرص ينزلق (منطقته وحدها)', 1.0, 2.0, { x: 0.1, y: 0.6, w: 0.85, h: 0.1 }],
    ['دخول→نهاية', 0.4, 3.9, null],
  ];
  // كلُّ نافذةٍ تحمل عتبتَها: العتبةُ الواحدة لكلّ النوافذ تُعاير على أقواها
  // فتصير أضعفُها بلا حرس. والقاعدة: **ثلثُ المقيس** — فتُحتمَل حركةٌ أضعف بثلاث
  // مرّاتٍ من المرجع قبل أن يسقط البند، ويبقى الثلثُ أعلى من الأرضيّة بمئات
  // الأضعاف.
  console.log('\n(٢) الحركة الحقيقيّة — فرقُ إطارَي طرفَي النافذة، وعتبةُ كلٍّ منها');
  const motions = [];
  for (const [label, t0, t1, region] of windows) {
    const a = target.frameIndexAt(t0);
    const b = target.frameIndexAt(t1);
    const d = frameDelta(target.small(a.index), target.small(b.index), { region });
    motions.push(d.meanDistance);
    const thMean = Number((d.meanDistance / 3).toFixed(1));
    const thMoved = Number((d.movedFraction / 3).toFixed(4));
    console.log(`    ${label.padEnd(30)} ${t0}→${t1}  (#${a.index}→#${b.index})`);
    console.log(`        مقيس: mean ${num(d.meanDistance).padStart(8)} · moved ${pct(d.movedFraction).padStart(9)}`);
    console.log(`        عتبة: minDistance ${thMean} · minMovedFraction ${thMoved}  (= المقيس ÷ ٣، وهو ×${(thMean / Math.max(noiseFloor, 1e-6)).toFixed(0)} فوق الأرضيّة)`);
  }

  // أضعفُ حركةٍ مقصودة هي التي تحكم العتبة: عتبةٌ تمرّ أقواها وتسقط أضعفها
  // عتبةٌ لا تقيس إلا الأقوى.
  const weakestMotion = Math.min(...motions);
  console.log(`    ⇒ أضعفُ حركةٍ مقصودة: ${num(weakestMotion)}`);

  // ── (٣) أقصى حركةٍ بين إطارين متتاليين داخل الحركة ────────────────────────
  // يُفرّق هذا بين «الفرق بين طرفَي نافذة» و«أسرع تغيّرٍ لحظيّ»، والثاني هو ما
  // يجب أن تتجاوزه عتبةُ السكون بفارقٍ واضح، وإلّا سمّى السكونُ الحركةَ سكونًا.
  const moving = consecutive(target, f(0.5), f(2.0));
  const movingMean = stats(moving, 'meanDistance');
  const movingMoved = stats(moving, 'movedFraction');
  console.log('\n(٣) التغيّر اللحظيّ داخل الحركة — أزواجٌ متتالية بين ٠٫٥ث و٢٫٠ث');
  console.log(`    meanDistance  أقصى ${num(movingMean.max)} · متوسّط ${num(movingMean.mean)}`);
  console.log(`    movedFraction أقصى ${pct(movingMoved.max)} · متوسّط ${pct(movingMoved.mean)}`);
  // هذا الرقم هو الذي يَحكم على عتبة السكون: لو جاوزت العتبةُ التغيّرَ اللحظيّ
  // لصارت تسمّي الحركةَ سكونًا. والفجوة بينه وبين الأرضيّة هي كلُّ ما نملك.
  console.log(`    ⇒ هامشُ السكون متاحٌ بين ${num(noiseFloor)} و${num(movingMean.mean)} (mean)`);
  console.log(`      وبين ${pct(noiseFloorMoved)} و${pct(movingMoved.mean)} (moved) — والثاني أوسع كثيرًا`);

  // ── (٤) حساسيّة الاختيار لعرض شريط التحليل ────────────────────────────────
  // إن تغيّرت الأرقام كثيرًا بتغيّر العرض فالعتبةُ مُعايَرةٌ على العرض لا على
  // الظاهرة، وهذا عيبٌ يجب أن يظهر.
  console.log('\n(٤) حساسيّة العرض — الأرضيّة تُقاس على المِجَسّ، والحركةُ على الهدف');
  for (const w of [96, 192, 384]) {
    const t2 = new FrameSet(TARGET, { analysisWidth: w });
    const n2 = new FrameSet(NOISE, { analysisWidth: w });
    const floor = stats(consecutive(n2, 0, n2.facts.frameCount - 1), 'meanDistance').max;
    const m = frameDelta(t2.small(f(1.0)), t2.small(f(2.0)));
    console.log(`    ${String(w).padStart(4)}px  أرضيّة ${num(floor).padStart(7)}  ·  حركة(١٫٠→٢٫٠) ${num(m.meanDistance).padStart(8)}  ·  فصل ×${(m.meanDistance / Math.max(floor, 1e-9)).toFixed(0)}`);
    t2.dispose();
    n2.dispose();
  }
  console.log('    ⇒ الحركة تكاد لا تتغيّر بالعرض (٩٫٨١ ← ٩٫٨٣)، فالعتبةُ مُعايَرةٌ على');
  console.log('      الظاهرة لا على العرض. والأرضيّةُ ترتفع بالتصغير لأن الاستيفاء يمزج');
  console.log('      بكسلاتٍ متجاورة — ولهذا ١٩٢ لا ٩٦.');

  // ── (٤ب) حدودُ الحبر لبند الدخول ──────────────────────────────────────────
  // `appearsBetween` يحتاج عتبتين: «ما هو فارغٌ» و«ما هو ممتلئ». وتُقاسان على
  // الهدف نفسه عند طرفَي الدخول، لا تُخمَّنان: فإن قال المقياس إن المنطقة قبل
  // الدخول فيها ٠٫٣٪ حبرٍ من التنعيم، فعتبةُ «فارغ» فوق ٠٫٣٪ لا تحتها.
  const barRegion = { x: 0.52, y: 0.4, w: 0.33, h: 0.025 };
  console.log('\n(٤ب) نسبةُ الحبر في منطقة الشريط عبر الزمن (المقاس الأصلي)');
  for (const t of [0.0, 0.4, 0.5, 1.0, 1.6, 2.0, 3.9]) {
    const fr = target.frameIndexAt(t);
    const img = target.full(fr.index);
    const frac = inkFraction(img, barRegion, BG, 60);
    console.log(`    t=${String(t).padEnd(4)} #${String(fr.index).padStart(3)} @ ${num(fr.pts)}ث  حبر ${pct(frac)}`);
  }

  // ── (٥) العتبات ───────────────────────────────────────────────────────────
  // القاعدة في وضعها: العتبةُ تُوضَع **هندسيًّا** بين الأرضيّة المقيسة والظاهرة
  // المقيسة — لا على الأرضيّة (فتسقط على ضجيج) ولا على الظاهرة (فتمرّ عليها
  // وحدها). ومتوسّطُ الجذر يجعل الهامشَ متساويًا نحو الطرفين بالنسبة لا بالفرق.
  const geo = (lo, hi) => Math.sqrt(lo * hi);
  console.log('\n(٥) العتبات — وسطٌ هندسيٌّ بين الأرضيّة المقيسة والظاهرة المقيسة');

  const staticMax = Number(geo(noiseFloor, movingMean.mean).toFixed(2));
  console.log(`    staticAfter.maxDistance      = ${staticMax}`);
  console.log(`        وسطٌ هندسيّ بين أرضيّة ${num(noiseFloor)} وأبطأِ تغيّرٍ لحظيّ ${num(movingMean.mean)}`);
  console.log(`        ⇒ ×${(staticMax / noiseFloor).toFixed(1)} فوق الأرضيّة · ÷${(movingMean.mean / staticMax).toFixed(1)} تحت الحركة`);

  // `movedFraction` على المِجَسّ الساكن خرجت **صفرًا** — أي أن الأرضيّة أصغر من
  // قدرة المقياس على الرؤية. والوسطُ الهندسيّ مع صفرٍ لا معنى له، فتُوضَع العتبة
  // من جهة الحركة وحدها: رتبةً عشريّةً تحتها. وهذا يُقال صريحًا لأن عتبةً بُنيت
  // على أرضيّةٍ غير مقيسة ليست مُعايَرةً تمامًا — هي محروسةٌ من جهةٍ واحدة.
  const staticMoved = Number((movingMoved.mean / 10).toFixed(5));
  console.log(`    staticAfter.maxMovedFraction = ${staticMoved}`);
  console.log(`        الأرضيّة ${pct(noiseFloorMoved)} — أصغرُ من حدّ الرؤية، فلا وسطَ هندسيًّا.`);
  console.log(`        فالعتبة من جهة الحركة وحدها: ${pct(movingMoved.mean)} ÷ ١٠. محروسةٌ من طرفٍ واحد.`);

  console.log(`\n    الفصل المقيس بين الظاهرتين: ×${(weakestMotion / noiseFloor).toFixed(0)} (أضعفُ حركةٍ ÷ أرضيّة)`);
  console.log(`    وأضيقُ فصلٍ في المقياس:      ×${(movingMean.mean / noiseFloor).toFixed(0)} (أبطأُ تغيّرٍ لحظيّ ÷ أرضيّة)`);

  target.dispose();
  frozen.dispose();
  noise.dispose();
}

main();
