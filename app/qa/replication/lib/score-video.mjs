// تحكيمُ الفيديو: حقائقُ الحاوية، وبنودُ الصورة الساكنة عند لحظاتٍ مسمّاة، وبنودُ
// الزمن.
//
// ─────────────────────────────────────────────────────────────────────────────
// المبدأ: هذا الملفّ يُضيف الزمن، ولا يُعيد تعريف شيءٍ آخر
// ─────────────────────────────────────────────────────────────────────────────
// بنودُ الصورة الساكنة الثمانية — `canvas` و`color` و`inkColor` و`ink` و`empty`
// و`edgeX` و`edgeY` و`edgeDelta` — تعمل على أيّ صورةٍ مفكوكة، والإطارُ صورةٌ
// مفكوكة. فلا نسخةَ منها هنا: `frameAt` يستدعي `evalCriterion` من `score.mjs`
// كما هي. ولو نُسخت لصار للمستودع مقياسان للون الواحد ولاختلف جوابُهما يومًا.
//
// والجديدُ وحده هو ما لا يوجد إلا لأن الزمن موجود:
//
//   videoCanvas   — المقاس من الملفّ، تمامًا. نظيرُ `canvas` بلا تسامح.
//   videoDuration — المدّة، بتسامحِ إطارٍ واحدٍ مبرَّرٍ أدناه.
//   videoFps      — معدّلُ الإطارات كسرًا نسبيًّا: ٢٩٫٩٧ ليست ٣٠.
//   videoFrames   — عددُ الإطارات **مَعدودًا**، لا مقروءًا من ترويسة.
//   videoCodec    — المرمِّز ونسقُ البكسل.
//   frameAt       — بنودُ الصورة الساكنة على الإطار المعروض عند t.
//   appearsBetween— منطقةٌ فارغةٌ عند t0 فيها حبرٌ عند t1. هذا **ما هي** حركةُ الدخول.
//   staticAfter   — من t إلى النهاية لا يتغيّر إطارٌ عن سابقه فوق العتبة.
//   motionBetween — شيءٌ تحرّك فعلًا بين زمنين، بمقدارٍ مقيس.
//
// ─────────────────────────────────────────────────────────────────────────────
// لماذا `motionBetween` موجودٌ أصلًا — وهو السؤال الذي يُسأل عن كلّ بندٍ جديد
// ─────────────────────────────────────────────────────────────────────────────
// لأن كلَّ ما سبقه يمكن أن يتحقّق في مقطعٍ لا يتحرّك فيه شيء. مقطعٌ يُعيد التركيبةَ
// النهائيّةَ مئةَ إطارٍ يُرضي `videoCanvas` و`videoDuration` و`videoFps` و
// `videoFrames` و`videoCodec` و`staticAfter` وكلَّ بنود `frameAt` المتأخّرة —
// أي أكثرَ المقياس. فبدون بندٍ يسأل «أتحرّك شيءٌ؟» يكون المحكّم أداةً تُجيز
// الصورةَ الساكنةَ باسم الفيديو. وقد بُني شاهدٌ بهذا الوصف بالضبط
// (`control-frozen.mp4`) وتُقاس عليه هذه البنود في كلّ جولة — لا لأنه احتمالٌ
// نظريّ، بل لأن جولةً سابقة وجدت أن إعداداتَ الدخول في مزيج **غيّرت التسمية ولم
// تغيّر الصورة**، وهو هذا العطلُ بعينه.
//
// ─────────────────────────────────────────────────────────────────────────────
// العتبات مقيسةٌ لا مُخمَّنة
// ─────────────────────────────────────────────────────────────────────────────
// `calibrate-video.mjs` يقيس على هدفٍ حقيقتُه الأرضيّة مكتوبةٌ كودًا: أرضيّةَ ضجيج
// المرمِّز على محتوًى ساكنٍ صعب، ومقدارَ الحركة الحقيقيّة، وأبطأَ تغيّرٍ لحظيّ.
// ثم تُوضَع العتبةُ **وسطًا هندسيًّا** بين الأرضيّة والظاهرة — لا على الأرضيّة
// فتسقط على ضجيج، ولا على الظاهرة فتمرّ عليها وحدها. الأرقامُ المقيسة والفجوةُ
// بينها في `targets/t00-video-calib/README.md`.
import { evalCriterion, inkFraction, overallSimilarity } from './score.mjs';
import { parseHex } from './png.mjs';
import { FrameSet, frameDelta } from './video.mjs';

// العتبات الافتراضيّة — مقيسةٌ على t00، ولكلّ بندٍ أن يُصرّح بغيرها.
const DEFAULTS = {
  // أرضيّةُ الضجيج المقيسة ٠٫٠١٨ وأبطأُ تغيّرٍ لحظيّ ٠٫٨٦٥ — والوسطُ الهندسيّ ٠٫١٢.
  staticMaxDistance: 0.12,
  // أرضيّةُ `movedFraction` خرجت صفرًا — أصغرَ من حدّ رؤية المقياس. فالعتبةُ من
  // جهة الحركة وحدها (٠٫٣٥١٪ ÷ ١٠)، وهي لذلك **محروسةٌ من طرفٍ واحد**: تَضمن أنها
  // لا تسمّي الحركةَ سكونًا، ولا تَضمن أنها لا تسمّي ضجيجًا حركةً على محتوًى أصعب
  // من كلّ ما قيس.
  staticMaxMovedFraction: 0.00035,
  // لا قيمةَ افتراضيّةَ لـ`motionBetween`: مقدارُ الحركة خاصيّةُ المشهد لا خاصيّةُ
  // المقياس — قُرصٌ صغير ينزلق يُنتج ٩٫٨ على كامل اللوحة و٥٧٫٦ في منطقته. فعتبةٌ
  // واحدةٌ لكلّ النوافذ تُعاير على أقواها وتترك أضعفَها بلا حرس. والمواصفةُ
  // تُصرّح بها لكلّ نافذة، مأخوذةً من المقيس ÷ ٣.
  motionMinDistance: null,
  // نظيرُ `empty`/`ink` في الصورة الساكنة، بالقيمتين نفسَيهما — فحدُّ «فارغ» واحدٌ
  // في المقياس كلّه، لا حدٌّ للصورة وحدٌّ للإطار.
  appearsMaxBefore: 0.005,
  appearsMinAfter: 0.5,
  inkMinDistance: 60,
};

const fmtPct = (v) => `${(v * 100).toFixed(2)}٪`;
const fmtNum = (v) => v.toFixed(3);

/** وصفُ الإطار الذي قيس عليه بندٌ زمنيّ — يُلحَق بكلّ نتيجةٍ حتى لا يحتاج القارئ
 * أن يستنتج على أيّ إطارٍ حُكم عليه. */
function frameTag(at, t) {
  const lag = at.lag;
  return `#${at.index}@${fmtNum(at.pts)}ث` + (Math.abs(lag) > 1e-6 ? ` (t=${t} بعده بـ${fmtNum(lag)}ث)` : '');
}

function rationalEquals(fps, want) {
  if (!fps) return false;
  if (typeof want === 'string') {
    const [n, d] = want.split('/').map(Number);
    // المقارنةُ بالضرب التبادلي لا بالقسمة: ٣٠٠٠٠/١٠٠١ و٣٠/١ متساويتان تقريبًا
    // في العائم وغيرُ متساويتين في الحقيقة، والعينُ ترى الفرقَ في التزامن.
    return fps.num * d === n * fps.den;
  }
  return fps.num === want * fps.den;
}

/** بنودُ الحاوية: الحقائقُ التي تُقرأ من الملفّ قبل أن يُفتح أيُّ إطار. */
function evalContainer(c, facts) {
  switch (c.type) {
    case 'videoCanvas': {
      // نظيرُ `canvas` بلا تسامحٍ أبدًا. وجولةٌ سابقة وجدت مشروعًا ١٠٨٠×١٩٢٠ كتب
      // ملفًّا ٢١٦٠×٣٨٤٠ — أي أن تسامحًا نسبيًّا كان سيُمرّره «قريبًا من الصواب».
      const ok = facts.width === c.w && facts.height === c.h;
      return { ok, got: `${facts.width}×${facts.height}`, want: `${c.w}×${c.h}` };
    }
    case 'videoFps': {
      const ok = rationalEquals(facts.fps, c.fps);
      const avg = facts.avgFps && facts.avgFps.text !== facts.fps?.text ? ` · متوسّط ${facts.avgFps.text}` : '';
      return { ok, got: `${facts.fps?.text ?? '؟'}${avg}`, want: String(c.fps) };
    }
    case 'videoFrames': {
      // العددُ مَعدودٌ من قائمة PTS. و`nb_frames` في الترويسة حقلٌ اختياريّ تتركه
      // مرمِّزاتٌ صفرًا أو تكتبه تقديرًا، فيُعرَض للمقارنة ولا يُحكَم به.
      const ok = facts.frameCount === c.count;
      const hdr = facts.headerFrameCount != null && facts.headerFrameCount !== facts.frameCount
        ? ` (والترويسة تقول ${facts.headerFrameCount} — وهي لا تُحكَم بها)`
        : '';
      return { ok, got: `${facts.frameCount} مَعدودًا${hdr}`, want: `${c.count}` };
    }
    case 'videoDuration': {
      // التسامحُ الافتراضيّ **إطارٌ واحد**، وهذا ليس تراخيًا: مدّةُ الحاوية
      // تُخزَّن كسرًا في وحدات `time_base`، ومقطعٌ صحيحٌ تمامًا قد يُسجّلها
      // ٤٫٠٠٠٠١ث. أمّا فرقُ إطارٍ كاملٍ فعطلٌ حقيقيّ — ولهذا الحدُّ هو الإطار، لا
      // نسبةٌ مئويّة تتسع بطول المقطع.
      const tol = c.tolerance ?? (facts.fps ? 1 / facts.fps.value : 0.05);
      const got = facts.duration;
      if (got == null) return { ok: false, got: 'لا مدّةَ في الحاوية', want: `${c.seconds}ث` };
      const ok = Math.abs(got - c.seconds) <= tol;
      // المدّةُ المشتقّة من العدد والمعدّل تُعرَض دائمًا: اختلافُها عن مدّة
      // الحاوية يعني ملفًّا غيرَ متّسقٍ مع نفسه، وهو عطلٌ يُرى ولا يُحكَم به هنا.
      const derived = facts.derivedDuration != null ? ` · مشتقّة ${fmtNum(facts.derivedDuration)}ث` : '';
      return { ok, got: `${fmtNum(got)}ث${derived}`, want: `${c.seconds}ث ± ${fmtNum(tol)}ث` };
    }
    case 'videoCodec': {
      // بندٌ لا يسأل شيئًا لا يمرّ. ولولا هذا السطر لكان `{"type":"videoCodec"}`
      // بندًا يُحتسَب في الدرجة ولا يقيس شيئًا — وهو أسوأُ من غيابه، لأن غيابَه
      // يُرى في العدد ومرورَه لا يُرى.
      if (c.codec == null && c.pixFmt == null) {
        return { ok: false, got: 'بندٌ بلا `codec` ولا `pixFmt` — خطأُ مواصفة', want: 'أحدهما على الأقلّ' };
      }
      const parts = [];
      let ok = true;
      if (c.codec != null) {
        ok = ok && facts.codec === c.codec;
        parts.push(`المرمِّز ${facts.codec}`);
      }
      if (c.pixFmt != null) {
        ok = ok && facts.pixFmt === c.pixFmt;
        parts.push(`نسق البكسل ${facts.pixFmt}`);
      }
      const want = [c.codec, c.pixFmt].filter(Boolean).join(' · ');
      return { ok, got: parts.join(' · ') || '—', want: want || '—' };
    }
    default:
      return null;
  }
}

/** بنودُ الزمن. */
function evalTemporal(c, frames, bg) {
  switch (c.type) {
    case 'appearsBetween': {
      // ما هي حركةُ الدخول عمليًّا: المنطقةُ خلفيّةٌ صافية عند t0، وفيها حبرٌ عند
      // t1. والقياسان يُعرَضان كلاهما دائمًا — فمن سقط عليه البند يعرف أيُّ
      // نصفيه سقط: هل العنصرُ موجودٌ قبل وقته، أم لم يصل بعدَ وقته.
      const a = frames.frameIndexAt(c.t0);
      const b = frames.frameIndexAt(c.t1);
      if (!a || !b) return { ok: false, got: 'أحد الزمنين خارج المجرى', want: `${c.t0}ث → ${c.t1}ث` };
      const minD = c.minDistance ?? DEFAULTS.inkMinDistance;
      const before = inkFraction(frames.full(a.index), c.region, bg, minD);
      const after = inkFraction(frames.full(b.index), c.region, bg, minD);
      const maxBefore = c.maxBefore ?? DEFAULTS.appearsMaxBefore;
      const minAfter = c.minAfter ?? DEFAULTS.appearsMinAfter;
      const okBefore = before <= maxBefore;
      const okAfter = after >= minAfter;
      return {
        ok: okBefore && okAfter,
        got: `${frameTag(a, c.t0)} حبر ${fmtPct(before)}${okBefore ? '' : ' ✗'}`
          + ` → ${frameTag(b, c.t1)} حبر ${fmtPct(after)}${okAfter ? '' : ' ✗'}`,
        want: `فارغة ≤ ${fmtPct(maxBefore)} عند ${c.t0}ث ثم ≥ ${fmtPct(minAfter)} عند ${c.t1}ث`,
      };
    }

    case 'staticAfter': {
      // «اللقطةُ محفوظة»: من t إلى آخر إطار، كلُّ إطارٍ يطابق سابقَه في حدود
      // العتبة. ويُقاس **كلُّ** زوجٍ متتالٍ لا الطرفان: مقارنةُ أوّلِ الذيل بآخره
      // تمرّ على مشهدٍ يَخرج ويعود.
      const at = frames.frameIndexAt(c.t);
      if (!at) return { ok: false, got: 'الزمن خارج المجرى', want: `سكونٌ من ${c.t}ث` };
      const last = frames.facts.frameCount - 1;
      if (at.index >= last) return { ok: false, got: `لا إطارَ بعد #${at.index}`, want: `سكونٌ من ${c.t}ث` };
      const maxD = c.maxDistance ?? DEFAULTS.staticMaxDistance;
      const maxMoved = c.maxMovedFraction ?? DEFAULTS.staticMaxMovedFraction;
      let worst = { meanDistance: 0, movedFraction: 0, pair: at.index };
      for (let i = at.index; i < last; i++) {
        const d = frameDelta(frames.small(i), frames.small(i + 1), { region: c.region ?? null });
        if (d.meanDistance > worst.meanDistance) worst = { ...d, pair: i };
      }
      const ok = worst.meanDistance <= maxD && worst.movedFraction <= maxMoved;
      return {
        ok,
        got: `أقصى فرقٍ ${fmtNum(worst.meanDistance)} · متحرّك ${fmtPct(worst.movedFraction)}`
          + ` عند الزوج #${worst.pair}→#${worst.pair + 1} (${last - at.index} زوجًا من ${frameTag(at, c.t)})`,
        want: `≤ ${maxD} و≤ ${fmtPct(maxMoved)}`,
      };
    }

    case 'motionBetween': {
      // الحرسُ المعاكس: شيءٌ تحرّك فعلًا، بمقدارٍ يُطبَع. والمنطقةُ اختياريّةٌ
      // لسببٍ عمليّ: حركةٌ في زاويةٍ تُرضي بندًا على كامل اللوحة ولا تُثبت أن
      // العنصر المقصود تحرّك. ومن أراد أن يُسمّي العنصر حدّد مستطيله.
      const a = frames.frameIndexAt(c.t0);
      const b = frames.frameIndexAt(c.t1);
      if (!a || !b) return { ok: false, got: 'أحد الزمنين خارج المجرى', want: `حركةٌ بين ${c.t0}ث و${c.t1}ث` };
      if (a.index === b.index) {
        // لا يُحكَم بالسقوط ولا بالنجاح على زمنين وقعا على إطارٍ واحد — هذا خطأٌ
        // في المواصفة لا في المحاولة، ويُقال كذلك.
        return { ok: false, got: `الزمنان على الإطار نفسه ${frameTag(a, c.t0)} — خطأُ مواصفة`, want: `إطارين مختلفين` };
      }
      const d = frameDelta(frames.small(a.index), frames.small(b.index), { region: c.region ?? null });
      const minD = c.minDistance ?? DEFAULTS.motionMinDistance;
      if (minD == null) return { ok: false, got: 'لا عتبةَ في المواصفة', want: 'minDistance مُصرَّحٌ بها' };
      const okD = d.meanDistance >= minD;
      const okMoved = c.minMovedFraction == null || d.movedFraction >= c.minMovedFraction;
      return {
        ok: okD && okMoved,
        got: `فرق ${fmtNum(d.meanDistance)}${okD ? '' : ' ✗'} · متحرّك ${fmtPct(d.movedFraction)}${okMoved ? '' : ' ✗'}`
          + ` (${frameTag(a, c.t0)} → ${frameTag(b, c.t1)})`,
        want: `≥ ${minD}` + (c.minMovedFraction != null ? ` و≥ ${fmtPct(c.minMovedFraction)} متحرّك` : ''),
      };
    }

    default:
      return null;
  }
}

/** يُسطِّح بندَ `frameAt` إلى صفوفٍ واحدٍ لكلّ بندٍ ساكنٍ داخله.
 *
 * ولماذا التسطيح: لو كان البندُ المركّب صفًّا واحدًا لصار عشرةُ أسئلةٍ عن إطارٍ
 * واحدٍ عُشرَ درجةِ المقياس، ولضاعت خصيصةُ المحكّم كلِّها — أن يُسمّي كلَّ نقصٍ
 * باسمه. فاللونُ الخاطئ عند ١٫٦ث يجب أن يظهر سطرًا يقول ذلك. */
function expandFrameAt(c, frames, bg) {
  const at = frames.frameIndexAt(c.t);
  const tag = `@${c.t}ث`;
  if (!at) {
    return [{
      id: `frameAt${tag}`,
      why: c.why ?? `الإطار عند ${c.t}ث`,
      weight: c.weight ?? 1,
      ok: false,
      got: `لا إطارَ عند ${c.t}ث (المدّة ${fmtNum(frames.facts.duration ?? 0)}ث)`,
      want: `زمنٌ داخل المجرى`,
    }];
  }
  const img = frames.full(at.index);
  return c.criteria.map((child) => ({
    id: `${child.id}${tag}`,
    // كلُّ بندٍ يحمل `why` — والطرفُ الزمنيّ يُضاف إليه، لأن «لون الخلفية مضبوط»
    // و«لون الخلفية مضبوط عند ١٫٦ث» ليسا الجملةَ نفسها.
    why: `${child.why} — على ${frameTag(at, c.t)}`,
    weight: child.weight ?? 1,
    ...evalCriterion(child, img, bg),
  }));
}

/** يحكم على محاولةِ فيديو ببنود مواصفةٍ، ويُرجع صفًّا لكلّ بند. */
export function scoreVideoAttempt(spec, attemptPath, targetPath, { keepFrames = false } = {}) {
  const frames = new FrameSet(attemptPath, {
    analysisWidth: spec.analysisWidth ?? undefined,
    keep: keepFrames,
  });
  const bg = parseHex(spec.background);
  const results = [];

  try {
    for (const c of spec.criteria) {
      if (c.type === 'frameAt') {
        results.push(...expandFrameAt(c, frames, bg));
        continue;
      }
      const container = evalContainer(c, frames.facts);
      if (container) {
        results.push({ id: c.id, why: c.why, weight: c.weight ?? 1, ...container });
        continue;
      }
      const temporal = evalTemporal(c, frames, bg);
      if (temporal) {
        results.push({ id: c.id, why: c.why, weight: c.weight ?? 1, ...temporal });
        continue;
      }
      results.push({
        id: c.id,
        why: c.why,
        weight: c.weight ?? 1,
        ok: false,
        got: `نوع بندٍ مجهول «${c.type}»`,
        want: '—',
      });
    }

    const earned = results.filter((r) => r.ok).reduce((s, r) => s + r.weight, 0);
    const possible = results.reduce((s, r) => s + r.weight, 0);

    return {
      facts: factsSummary(frames.facts),
      results,
      passed: results.filter((r) => r.ok).length,
      total: results.length,
      score: possible ? (earned / possible) * 100 : 0,
      similarity: targetPath ? videoSimilarity(spec, frames, targetPath) : null,
      framesKept: keepFrames ? frames.dir : null,
    };
  } finally {
    frames.dispose();
  }
}

function factsSummary(f) {
  return {
    width: f.width,
    height: f.height,
    fps: f.fps?.text ?? null,
    frameCount: f.frameCount,
    headerFrameCount: f.headerFrameCount,
    duration: f.duration,
    derivedDuration: f.derivedDuration,
    codec: f.codec,
    pixFmt: f.pixFmt,
  };
}

/** تشابهٌ عامٌّ مساند: متوسّطُ تشابه الإطارات عند اللحظات المسمّاة في المواصفة.
 *
 * ولا عتبةَ نجاحٍ له، للسبب نفسه الذي في الصورة الساكنة: لوحٌ فارغٌ هناك سجّل
 * ٩٢٫٦٪ لأن الخلفيّةَ ٩٢٪ من البكسل. وفي الفيديو الأمرُ أسوأ — المقطعُ المجمَّد
 * يطابق الهدفَ في إطاراته الأخيرة كلِّها، فمتوسّطُ التشابه يرتفع بينما الفيديو
 * لا يتحرّك. فالرقمُ يُطبَع ليُقرأ، لا ليُحكَم به. */
function videoSimilarity(spec, attemptFrames, targetPath) {
  const times = spec.criteria.filter((c) => c.type === 'frameAt').map((c) => c.t);
  if (!times.length) return null;
  const targetFrames = new FrameSet(targetPath);
  try {
    const per = [];
    for (const t of times) {
      const a = attemptFrames.frameIndexAt(t);
      const b = targetFrames.frameIndexAt(t);
      if (!a || !b) continue;
      // `overallSimilarity` يُعيد العيّنةَ على شبكةٍ نسبيّة، فمقاسان مختلفان
      // يُقارَنان بلا تحجيمٍ مسبق — وهو ما يجعل شاهدًا بمقاسٍ مضاعَف قابلًا للقياس.
      per.push({ t, value: overallSimilarity(attemptFrames.full(a.index), targetFrames.full(b.index)) });
    }
    if (!per.length) return null;
    return { perTime: per, mean: per.reduce((s, p) => s + p.value, 0) / per.length };
  } finally {
    targetFrames.dispose();
  }
}

export function formatVideoReport(spec, outcome) {
  const f = outcome.facts;
  const lines = [];
  lines.push(`الهدف: ${spec.name}`);
  // الحقائقُ تُطبَع دائمًا قبل البنود، ناجحةً كانت أو ساقطة: من قرأ تقريرًا
  // ساقطًا يحتاج أن يرى ما قرأه المحكّم من الملفّ، لا أن يستنتجه من البنود.
  lines.push(
    `الملفّ: ${f.width}×${f.height} · ${f.fps ?? '؟'} · ${f.frameCount} إطارًا · `
    + `${f.duration != null ? `${f.duration.toFixed(3)}ث` : 'لا مدّة'} · ${f.codec}/${f.pixFmt}`,
  );
  lines.push('='.repeat(78));
  for (const r of outcome.results) {
    lines.push(`${r.ok ? '  ✅' : '  ❌'} ${r.id} — ${r.why}`);
    if (!r.ok) lines.push(`        المطلوب ${r.want} · المُسلَّم ${r.got}`);
  }
  lines.push('='.repeat(78));
  lines.push(`البنود: ${outcome.passed}/${outcome.total} · الدرجة الموزونة ${outcome.score.toFixed(1)}٪`);
  if (outcome.similarity) {
    const per = outcome.similarity.perTime.map((p) => `${p.t}ث ${p.value.toFixed(1)}٪`).join(' · ');
    lines.push(`التشابه البصري العام: ${outcome.similarity.mean.toFixed(1)}٪ (مؤشّر مساند، لا حكم)`);
    lines.push(`        ${per}`);
  }
  if (outcome.framesKept) lines.push(`الإطارات محفوظة في: ${outcome.framesKept}`);
  return lines.join('\n');
}
