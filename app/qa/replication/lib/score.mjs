// تحكيم المحاكاة: يقارن محاولةً بهدفٍ ويُخرج حكمًا لكل بندٍ في المواصفة.
//
// لماذا مواصفةٌ مُبنيَّة بدل «نسبة اختلاف البكسل» وحدها: الاختلاف الخام يُجيب
// «كم يختلفان» ولا يُجيب **بماذا** — وهو ما نحتاجه. تصميمٌ لونُ خلفيّته صحيح
// وعنوانُه غائب قد يسجّل اختلافًا أقلّ من تصميمٍ كاملٍ أُزيح عشرين بكسلًا، فلو
// حكمنا بالنسبة وحدها لكافأنا الأسوأ. فكل بندٍ هنا سؤالٌ مستقلٌّ له جوابُ نعم/لا،
// والنسبةُ العامّة تبقى مؤشّرًا مساندًا لا حكمًا.
//
// أنواع البنود:
//   canvas  — المقاس مطابقٌ تمامًا (لا تسامح: ١٠٨٠ ليست ١٠٧٩)
//   color   — متوسّط لون منطقةٍ نسبيّة ضمن مسافةٍ لونيّة من المطلوب
//   ink     — المنطقة تحوي محتوًى يخالف الخلفيّة (نصّ أو شكل موجود فعلًا)
//   empty   — المنطقة خلفيّةٌ صافية (لم يَسِل إليها شيء)
//   edgeX/edgeY — أوّل حدٍّ لونيّ على مسحٍ أفقيّ/رأسيّ يقع عند موضعٍ متوقَّع
//
// كل بندٍ يحمل `why`: ما الذي يختبره فعلًا من قدرات البرنامج. فحين يسقط بندٌ لا
// يكون الناتج «٧٣٪ تطابق» بل «المحاذاة إلى اليمين غير متحقّقة» — وهذه جملةٌ
// تُصلَح، تلك لا.
import { decodePng, averageColor, pixelAt, hexOf, parseHex, colorDistance } from './png.mjs';

const DEFAULT_COLOR_TOLERANCE = 40;

/** تقييمُ بندِ صورةٍ ساكنة على صورةٍ **مفكوكة** — لا على مسارِ ملفّ.
 *
 * صُدِّر ليستعمله محكّمُ الفيديو كما هو، بلا نسخٍ ولا تفريع: بندُ `frameAt` ليس
 * إلا «استخرج الإطار المعروض عند t ثم اسأله الأسئلةَ الساكنةَ نفسَها». ولو
 * نُسخت هذه الدالّة هناك لصار للمستودع مقياسان للون الواحد، ولاختلف جوابُهما
 * يومًا — وهو بعينه السببُ الذي من أجله استُخرج `lib/png.mjs` من ثلاث نسخ.
 *
 * ولم يتغيّر من منطق الدالّة شيء بالتصدير: كلمةُ `export` وحدها أُضيفت. */
export function evalCriterion(c, img, bg) {
  switch (c.type) {
    case 'canvas': {
      const ok = img.width === c.w && img.height === c.h;
      return { ok, got: `${img.width}×${img.height}`, want: `${c.w}×${c.h}` };
    }
    case 'color': {
      const got = averageColor(img, c.region);
      const want = parseHex(c.hex);
      const d = colorDistance(got, want);
      const tol = c.tolerance ?? DEFAULT_COLOR_TOLERANCE;
      return { ok: d <= tol, got: `${hexOf(got)} (مسافة ${d.toFixed(0)})`, want: `${c.hex} (± ${tol})` };
    }
    case 'inkColor': {
      // لونُ الحبر وحده، لا متوسّطُ المنطقة.
      //
      // `color` يأخذ المتوسّط، وهو الصواب لمساحةٍ مصمتة كشريطٍ أو قرص. أمّا نصٌّ
      // رفيع أو خطٌّ بسُمك بضعة بكسلات على خلفية، فمتوسّط صندوقه يغلب عليه لونُ
      // الخلفية ويُخفي لون الحبر تمامًا: عُيِّر هذا البند على الهدف الحقيقي فأعطى
      // المتوسّطُ `#aeb7ae` لنصٍّ لونُه `#12382a` — أي أن البند كان يسقط على الأصل
      // نفسه. فالقياس هنا لا يرى إلا البكسلات التي تبتعد عن الخلفية.
      const got = inkAverage(img, c.region, bg, c.minDistance ?? 60);
      if (!got) return { ok: false, got: 'لا حبر في المنطقة', want: c.hex };
      const want = parseHex(c.hex);
      const d = colorDistance(got, want);
      const tol = c.tolerance ?? DEFAULT_COLOR_TOLERANCE;
      return { ok: d <= tol, got: `${hexOf(got)} (مسافة ${d.toFixed(0)})`, want: `${c.hex} (± ${tol})` };
    }
    case 'ink': {
      // «فيها حبر» = نسبةٌ معتبرة من بكسلات المنطقة تبتعد عن لون الخلفيّة. العتبة
      // منخفضة عمدًا: سطرُ نصٍّ رفيع يملأ جزءًا صغيرًا من صندوقه، والسؤال هو
      // «أموجودٌ أم غائب» لا «أيملأ المساحة».
      const frac = inkFraction(img, c.region, bg, c.minDistance ?? 60);
      const min = c.minFraction ?? 0.01;
      return { ok: frac >= min, got: `${(frac * 100).toFixed(1)}٪ حبر`, want: `≥ ${(min * 100).toFixed(1)}٪` };
    }
    case 'empty': {
      const frac = inkFraction(img, c.region, bg, c.minDistance ?? 60);
      const max = c.maxFraction ?? 0.005;
      return { ok: frac <= max, got: `${(frac * 100).toFixed(1)}٪ حبر`, want: `≤ ${(max * 100).toFixed(1)}٪` };
    }
    case 'edgeDelta': {
      // الفرق بين حافّتين عند ارتفاعين — أي الميل نفسه، لا موضع الحافّة.
      //
      // أُضيف لأن بندين من نوع `edgeX` عند ارتفاعين **لا يُثبتان ميلًا**، وقد ثبت
      // ذلك بالبناء لا بالجدل: بُني التصميم نفسه بشريطٍ قائم بلا دوران عند x=229
      // فاجتاز البندين معًا. السبب حسابيّ بحت: نافذتا القبول تتداخلان، فموضعٌ
      // واحدٌ يُرضيهما معًا. وأيُّ تضييقٍ للتسامح يُبقي تداخلًا ما دام البندان
      // يسألان «أين الحافّة» بدل «كم أزاحت». هذا البند يسأل السؤال الثاني.
      const a = findEdge(img, { ...c, type: c.axis ?? 'edgeX', scanAt: c.scanAtA }, bg);
      const b = findEdge(img, { ...c, type: c.axis ?? 'edgeX', scanAt: c.scanAtB }, bg);
      if (a === null || b === null) return { ok: false, got: 'لا حدّ عند أحد الارتفاعين', want: `Δ ${c.delta}` };
      const got = b - a;
      const ok = Math.abs(got - c.delta) <= c.tolerance;
      return {
        ok,
        got: `Δ ${(got * 100).toFixed(2)}٪ (${(a * 100).toFixed(1)}٪ → ${(b * 100).toFixed(1)}٪)`,
        want: `Δ ${(c.delta * 100).toFixed(2)}٪ ± ${(c.tolerance * 100).toFixed(2)}٪`,
      };
    }
    case 'edgeX':
    case 'edgeY': {
      const pos = findEdge(img, c, bg);
      if (pos === null) return { ok: false, got: 'لا حدّ', want: `${(c.at * 100).toFixed(1)}٪ ± ${(c.tolerance * 100).toFixed(1)}٪` };
      const ok = Math.abs(pos - c.at) <= c.tolerance;
      return { ok, got: `${(pos * 100).toFixed(1)}٪`, want: `${(c.at * 100).toFixed(1)}٪ ± ${(c.tolerance * 100).toFixed(1)}٪` };
    }
    default:
      return { ok: false, got: `نوع بندٍ مجهول «${c.type}»`, want: '—' };
  }
}

/** متوسّط لون البكسلات المختلفة عن الخلفية داخل منطقة — أو `null` إن لم يوجد حبر.
 * تُستبعَد البكسلاتُ القريبة من الخلفية لأنها ليست الحبر، وتُستبعَد الحوافّ
 * المتوسّطة الابتعاد لأنها تنعيمٌ يمزج اللونين ويسحب المتوسّط نحو الخلفية. */
function inkAverage(img, region, bg, minDistance) {
  const x0 = Math.round(region.x * img.width);
  const y0 = Math.round(region.y * img.height);
  const x1 = Math.min(img.width, Math.round((region.x + region.w) * img.width));
  const y1 = Math.min(img.height, Math.round((region.y + region.h) * img.height));
  const samples = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * img.width * img.channels + x * img.channels;
      const px = img.channels === 1
        ? { r: img.pixels[i], g: img.pixels[i], b: img.pixels[i] }
        : { r: img.pixels[i], g: img.pixels[i + 1], b: img.pixels[i + 2] };
      const d = colorDistance(px, bg);
      if (d >= minDistance) samples.push({ px, d });
    }
  }
  if (!samples.length) return null;
  // أبعدُ ثلث عن الخلفية: قلبُ الحرف أو الخطّ، حيث اللون خالصٌ غير ممزوج.
  samples.sort((a, b) => b.d - a.d);
  const core = samples.slice(0, Math.max(1, Math.ceil(samples.length / 3)));
  const sum = core.reduce((s, { px }) => ({ r: s.r + px.r, g: s.g + px.g, b: s.b + px.b }), { r: 0, g: 0, b: 0 });
  return { r: Math.round(sum.r / core.length), g: Math.round(sum.g / core.length), b: Math.round(sum.b / core.length) };
}

/** نسبةُ بكسلات المنطقة التي تبتعد عن الخلفيّة. صُدِّرت لأن بندَ `appearsBetween`
 * المرئي هو هذا المقياس نفسه مقروءًا عند زمنين، ولمُعاير العتبات الذي يَقرؤه
 * عبر الزمن ليُخرج عتبتَي «فارغ» و«ممتلئ» من قياسٍ لا من تخمين. */
export function inkFraction(img, region, bg, minDistance) {
  const x0 = Math.round(region.x * img.width);
  const y0 = Math.round(region.y * img.height);
  const x1 = Math.min(img.width, Math.round((region.x + region.w) * img.width));
  const y1 = Math.min(img.height, Math.round((region.y + region.h) * img.height));
  let ink = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * img.width * img.channels + x * img.channels;
      const px = img.channels === 1
        ? { r: img.pixels[i], g: img.pixels[i], b: img.pixels[i] }
        : { r: img.pixels[i], g: img.pixels[i + 1], b: img.pixels[i + 2] };
      if (colorDistance(px, bg) >= minDistance) ink++;
      n++;
    }
  }
  return n ? ink / n : 0;
}

/** أوّل موضعٍ على مسحٍ أفقيّ (edgeX) أو رأسيّ (edgeY) يبتعد لونُه عن الخلفيّة —
 * يقيس «أين تبدأ هذه الكتلة»، وهو ما تعنيه المحاذاة عمليًّا. */
function findEdge(img, c, bg) {
  const steps = c.type === 'edgeX' ? img.width : img.height;
  const from = c.from ?? 0;
  const to = c.to ?? 1;
  const start = Math.round(from * steps);
  const end = Math.round(to * steps);
  const dir = c.reverse ? -1 : 1;
  const i0 = dir === 1 ? start : end - 1;
  const i1 = dir === 1 ? end : start - 1;
  for (let i = i0; i !== i1; i += dir) {
    const f = i / (steps - 1);
    const px = c.type === 'edgeX' ? pixelAt(img, f, c.scanAt) : pixelAt(img, c.scanAt, f);
    if (colorDistance(px, bg) >= (c.minDistance ?? 60)) return f;
  }
  return null;
}

/** تشابهٌ عامٌّ خشن: تُعاد عيّنةُ الصورتين على شبكةٍ موحّدة ثم يُقاس متوسّط المسافة
 * اللونيّة. مؤشّرٌ مساند لا حكم — ولهذا لا يملك عتبةَ نجاح. */
export function overallSimilarity(a, b, grid = 64) {
  let total = 0;
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const fx = (gx + 0.5) / grid;
      const fy = (gy + 0.5) / grid;
      total += colorDistance(pixelAt(a, fx, fy), pixelAt(b, fx, fy));
    }
  }
  const avg = total / (grid * grid);
  return Math.max(0, 100 * (1 - avg / 441));
}

export function scoreAttempt(spec, attemptPath, targetPath) {
  const attempt = decodePng(attemptPath);
  const target = targetPath ? decodePng(targetPath) : null;
  const bg = parseHex(spec.background);

  const results = spec.criteria.map((c) => ({
    id: c.id,
    why: c.why,
    weight: c.weight ?? 1,
    ...evalCriterion(c, attempt, bg),
  }));

  const earned = results.filter((r) => r.ok).reduce((s, r) => s + r.weight, 0);
  const possible = results.reduce((s, r) => s + r.weight, 0);

  return {
    results,
    passed: results.filter((r) => r.ok).length,
    total: results.length,
    score: possible ? (earned / possible) * 100 : 0,
    similarity: target ? overallSimilarity(attempt, target) : null,
  };
}

export function formatReport(spec, outcome) {
  const lines = [];
  lines.push(`الهدف: ${spec.name}`);
  lines.push('='.repeat(72));
  for (const r of outcome.results) {
    lines.push(`${r.ok ? '  ✅' : '  ❌'} ${r.id} — ${r.why}`);
    if (!r.ok) lines.push(`        المطلوب ${r.want} · المُسلَّم ${r.got}`);
  }
  lines.push('='.repeat(72));
  lines.push(`البنود: ${outcome.passed}/${outcome.total} · الدرجة الموزونة ${outcome.score.toFixed(1)}٪`);
  if (outcome.similarity !== null) lines.push(`التشابه البصري العام: ${outcome.similarity.toFixed(1)}٪ (مؤشّر مساند، لا حكم)`);
  return lines.join('\n');
}
