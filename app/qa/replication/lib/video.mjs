// قراءة الفيديو للمحكّم: حقائقُ الحاوية، والإطارُ عند لحظةٍ مسمّاة، وفرقُ إطارين.
//
// هذا الملفّ لا يَحكم بشيء — يُسلّم أرقامًا فقط. الحكم في `score-video.mjs`،
// والفصلُ مقصود: من أراد أن يراجع «هل المحكّم يرى الملفّ كما هو» يقرأ هذا الملفّ
// وحده، ومن أراد أن يراجع العتبات يقرأ ذاك وحده.
//
// ─────────────────────────────────────────────────────────────────────────────
// (١) الحقائق تُقرأ من الملفّ لا من اسمه ولا من ترويسةٍ يملأها المرمِّز كما شاء
// ─────────────────────────────────────────────────────────────────────────────
// `nb_frames` في الترويسة حقلٌ **اختياريّ** تتركه مرمِّزاتٌ كثيرة صفرًا أو تكتبه
// تقديرًا. فعددُ الإطارات هنا **يُعَدّ**: تُقرأ قائمةُ PTS لكل إطارٍ في المجرى
// ويكون طولُها هو العدد. وما تقوله الترويسة يُحفَظ في `headerFrameCount` ليُقارَن،
// لا ليُعتمَد.
//
// وPTS يُقرأ **عددًا صحيحًا** في وحدات `time_base` ثم يُحوَّل، لا نصًّا عشريًّا:
// `pts_time` الذي يطبعه ffprobe مقطوعٌ عند ستّ خانات، فـ١/٣٠ تخرج `0.033333`
// وهي أصغر من الحقيقة. والقياس الذي يقارن أزمنةً لا يبني على رقمٍ مقطوع.
//
// ─────────────────────────────────────────────────────────────────────────────
// (٢) أيُّ إطارٍ يُقاس عند الزمن t — القاعدة صريحةٌ لأن الخطأ فيها صامت
// ─────────────────────────────────────────────────────────────────────────────
// القاعدة: **الإطار المعروض عند اللحظة t هو آخرُ إطارٍ وصل وقتُ عرضِه قبلها أو
// عندها** — أي أكبر i يحقّق `pts[i] <= t`. وهو ما يراه الناظر فعلًا عند t.
//
// وليست القاعدة «أقرب حدٍّ زمنيّ»: لو كان t = ٠٫٤٩ث عند ٣٠ إطارًا لأعطى «الأقرب»
// الإطارَ ١٥ (٠٫٥٠٠ث) — وهو إطارٌ **لم يُعرَض بعد**. فبندُ دخولٍ يقول «المنطقة
// فارغة عند ٠٫٤٩ث» كان سيُقاس على إطارٍ دخل فيه الشريط، ويسقط بثقةٍ على هدفٍ
// صحيح. ولهذا يُسمّي التقريرُ دائمًا رقمَ الإطار وPTSه وفارقَ `t - pts`: فمن
// شكّ في بندٍ زمنيّ يرى على أيّ إطارٍ قيس، لا يستنتجه.
//
// ولا يُستعمل بحثٌ بـ`-ss` إطلاقًا. الفكّ يجري **مرّةً واحدةً تسلسليًّا** إلى
// مجلّدٍ مؤقّت، فرقمُ الملفّ هو ترتيبُ الإطار في العرض بحكم الكتابة نفسها. فلا
// قفزةُ مفتاحٍ ولا تقريبُ بحثٍ يستطيع أن يُزيح بندًا إلى إطارٍ مجاور.
//
// ─────────────────────────────────────────────────────────────────────────────
// (٣) فرقُ الإطارين يُقاس على نسخةٍ مُصغَّرة — وهذا اختيارٌ له ثمن
// ─────────────────────────────────────────────────────────────────────────────
// `staticAfter` يحتاج فرقَ كلِّ إطارين متتاليين من t إلى النهاية: ستّون زوجًا من
// ١٠٨٠×١٩٢٠ هي ٢٤٠ مليون بكسل يفكّها فاكُّ PNG الخاصّ بنا. فتُقاس الفروق على شريطٍ
// بعرض ١٩٢ بكسلًا (`ANALYSIS_WIDTH`). والتصغير ليس تنازلًا فقط: هو **يُفيد** هنا
// لأنه يُذيب ضجيجَ الكوانتَزة في المرمِّز الذي لا علاقة له بالحركة.
//
// وثمنُه صريح: عنصرٌ متحرّكٌ أصغر من ~٦ بكسلات على المقاس الأصلي يصير أقلّ من
// بكسلٍ على الشريط فلا يُرى. وللبنود `analysisWidth` تَرفعه لمن احتاج. أمّا بنود
// الصورة الساكنة في `frameAt` فتُقاس على **المقاس الأصلي** دائمًا: هي تسأل عن
// لونٍ وموضعٍ وحافّة، ولا يُقاس ذلك على نسخةٍ مصغّرة.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodePng, colorDistance } from './png.mjs';

const FFMPEG = process.env.MAZIJ_FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const FFPROBE = process.env.MAZIJ_FFPROBE ?? '/opt/homebrew/bin/ffprobe';

/** عرضُ شريط التحليل الزمني بالبكسل. القيمة مُعايَرة لا مُخمَّنة — انظر
 * `targets/t00-video-calib/README.md` للأرقام التي اختيرت عليها. */
export const ANALYSIS_WIDTH = 192;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.error) throw new Error(`${path.basename(cmd)} لم يُشغَّل: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} رجع ${r.status}: ${(r.stderr ?? '').trim()}`);
  return r.stdout ?? '';
}

function parseRational(text) {
  const [num, den] = String(text ?? '').split('/').map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return { num, den, value: num / den, text: `${num}/${den}` };
}

/** حقائقُ الحاوية والمجرى المرئي، مقروءةً من الملفّ. */
export function probeVideo(file) {
  if (!fs.existsSync(file)) throw new Error(`لا ملفّ عند ${file}`);
  const meta = JSON.parse(run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,codec_name,pix_fmt,time_base,nb_frames,duration',
    '-show_entries', 'format=duration,format_name',
    '-of', 'json', file,
  ]));
  const s = meta.streams?.[0];
  if (!s) throw new Error(`لا مجرًى مرئيًّا في ${file}`);

  const timeBase = parseRational(s.time_base) ?? { num: 1, den: 1000, value: 0.001, text: '1/1000' };

  // قائمةُ PTS: هي مرجعُ الزمن ومرجعُ العدد في هذا الملفّ كلّه.
  //
  // الصفوف تُفكَّك بأخذ أوّل حقلٍ رقميّ: ffprobe يُلحق بصفّ الإطار الأوّل حقلًا
  // فارغًا زائدًا (رأيناه على مخرجاتنا نفسها)، والتفكيكُ الذي يَعتمد عددَ الحقول
  // يسقط عليه.
  const ptsRaw = run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'frame=pts', '-of', 'csv=p=0', file,
  ]);
  // الترشيح على **النصّ** قبل التحويل، لا بعده: `Number('')` تساوي صفرًا وهي
  // عددٌ منتهٍ، فسطرٌ فارغٌ في ذيل المخرَج يُضيف إطارًا وهميًّا عند PTS صفر.
  // وهذا وقع فعلًا في أوّل تشغيلٍ — كشفه حاجزُ «عددُ الملفّات لا يطابق عدد PTS»
  // أدناه، وهو السببُ الذي من أجله وُضع الحاجز.
  const ptsTicks = ptsRaw.split('\n')
    .map((line) => line.split(',')[0].trim())
    .filter((cell) => cell !== '')
    .map(Number)
    .filter((v) => Number.isFinite(v));
  if (!ptsTicks.length) throw new Error(`لم يُقرأ أيُّ إطارٍ من ${file}`);
  const ptsSeconds = ptsTicks.map((ticks) => (ticks * timeBase.num) / timeBase.den);

  const containerDuration = Number(meta.format?.duration ?? s.duration);
  const fps = parseRational(s.r_frame_rate);

  return {
    file,
    width: s.width,
    height: s.height,
    codec: s.codec_name,
    pixFmt: s.pix_fmt,
    fps,
    avgFps: parseRational(s.avg_frame_rate),
    timeBase,
    // العدد المَعدود هو الحُجّة؛ وما قالته الترويسة يُحفَظ للمقارنة لا للاعتماد.
    frameCount: ptsSeconds.length,
    headerFrameCount: s.nb_frames != null ? Number(s.nb_frames) : null,
    duration: Number.isFinite(containerDuration) ? containerDuration : null,
    // مدّةٌ مُشتقّة من العدد المَعدود ومعدّل الإطارات. حين تختلف عن مدّة الحاوية
    // فالملفّ نفسه غير متّسق، والتقريرُ يُظهر الاثنتين بدل أن يختار إحداهما.
    derivedDuration: fps ? ptsSeconds.length / fps.value : null,
    ptsSeconds,
  };
}

/** مجموعةُ إطارات ملفٍّ واحد: تُفكّ مرّةً عند أوّل طلب، وتُفهرَس بالترتيب. */
export class FrameSet {
  constructor(file, { analysisWidth = ANALYSIS_WIDTH, keep = false } = {}) {
    this.file = file;
    this.facts = probeVideo(file);
    this.analysisWidth = analysisWidth;
    this.keep = keep;
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-vjudge-'));
    this._full = null;
    this._small = null;
    this._cacheFull = new Map();
    this._cacheSmall = new Map();
  }

  /** رقمُ الإطار المعروض عند الزمن t، أو `null` إن كان t خارج المجرى.
   * الإرجاع يحمل PTS وفارقَ `t - pts` ليظهرا في التقرير. */
  frameIndexAt(t) {
    const pts = this.facts.ptsSeconds;
    // تسامحٌ بمقدار نانوثانية: زمنٌ مكتوبٌ في المواصفة مثل ٠٫٥ قد يقع تحت PTS
    // المطابق بخطأِ تمثيلٍ عشريّ لا بفارقٍ حقيقيّ.
    const eps = 1e-9;
    if (t + eps < pts[0]) return null;
    let index = 0;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i] <= t + eps) index = i;
      else break;
    }
    // t بعد آخر إطار: الإطار الأخير معروضٌ فعلًا، لكن بشرط أن يكون t داخل المدّة.
    if (t > (this.facts.duration ?? Infinity) + eps) return null;
    return { index, pts: pts[index], lag: t - pts[index] };
  }

  _extract(kind) {
    const sub = path.join(this.dir, kind);
    fs.mkdirSync(sub, { recursive: true });
    const args = ['-y', '-v', 'error', '-i', this.file];
    if (kind === 'small') args.push('-vf', `scale=${this.analysisWidth}:-1:flags=bilinear`);
    // `-fps_mode passthrough` يمنع ffmpeg من تكرار إطارٍ أو إسقاطه لمطابقة معدّلٍ
    // مُفترَض — فيكون ملفٌّ واحدٌ لكل إطارٍ في المجرى، بترتيب العرض، بلا زيادة.
    args.push('-fps_mode', 'passthrough', '-start_number', '0', path.join(sub, '%05d.png'));
    run(FFMPEG, args);
    const files = fs.readdirSync(sub).filter((f) => f.endsWith('.png')).sort();
    if (files.length !== this.facts.frameCount) {
      throw new Error(
        `فكُّ الإطارات أخرج ${files.length} ملفًّا و‏PTS يقول ${this.facts.frameCount} — ` +
        'لا يُحكَم على فهرسةٍ غير مؤكَّدة',
      );
    }
    return sub;
  }

  /** الإطار بمقاسه الأصلي — لبنود الصورة الساكنة. */
  full(index) {
    if (this._cacheFull.has(index)) return this._cacheFull.get(index);
    if (!this._full) this._full = this._extract('full');
    const img = decodePng(path.join(this._full, `${String(index).padStart(5, '0')}.png`));
    this._cacheFull.set(index, img);
    return img;
  }

  /** الإطار مُصغَّرًا — لقياس الفروق الزمنيّة وحدها. */
  small(index) {
    if (this._cacheSmall.has(index)) return this._cacheSmall.get(index);
    if (!this._small) this._small = this._extract('small');
    const img = decodePng(path.join(this._small, `${String(index).padStart(5, '0')}.png`));
    this._cacheSmall.set(index, img);
    return img;
  }

  /** مسارُ ملفّ الإطار الأصلي — لمن أراد أن يرى بعينه ما حكم عليه المحكّم. */
  fullPath(index) {
    if (!this._full) this._full = this._extract('full');
    return path.join(this._full, `${String(index).padStart(5, '0')}.png`);
  }

  dispose() {
    if (this.keep) return this.dir;
    fs.rmSync(this.dir, { recursive: true, force: true });
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// (٤) السلاسلُ الزمنيّة — ومُرشِّحُ الوسيط الثلاثيّ، ولماذا هو شرطٌ لا تحسين
// ─────────────────────────────────────────────────────────────────────────────
// البنودُ التي تقيس **كيف** يتحرّك الشيء (التدرّج والاتّجاه وشكلُ المنحنى) تحتاج
// قيمةً لكلّ إطارٍ في نافذة، لا قيمتين عند طرفَيها. وذلك يَفتح بابًا معروفًا:
// إطارٌ واحدٌ شاذٌّ يُفسِد السلسلةَ كلَّها.
//
// والشذوذُ ليس احتمالًا نظريًّا. قيس في مرجعٍ حقيقيّ إطارٌ واحدٌ على حدّ مجموعةِ
// الصور يبعد عن جارَيه ٤٫٧٣ بينما يبعد جاراه أحدُهما عن الآخر ٠٫٠٩٣ — أي أن
// المرمِّزَ أعاد كوانتَزتَه مستقلًّا فخرج بانزياحٍ عامٍّ ضعيفٍ على كلّ بكسل. وقفزتُه
// **أكبرُ من أغلبِ حركةِ ذلك المقطع الحقيقيّة** (وسيطُ أزواجه المتحرّكة بين ١ و٣).
//
// فلا تُقاس هذه البنودُ على السلسلة الخامّة أبدًا، بل على سلسلةٍ مُرشَّحةٍ بوسيطٍ
// ثلاثيّ: `s[i] = median(r[i-1], r[i], r[i+1])`. والوسيطُ — لا المتوسّط — لأن
// المتوسّطَ يُوزّع الشاذَّ على ثلاثة مواضع ولا يُزيله، أمّا الوسيطُ فيَطرحه
// **تمامًا**: قيمةٌ شاذّةٌ واحدةٌ بين جارَين متقاربين لا تكون الوسيطَ أبدًا.
//
// والنتيجةُ قاعدةٌ لا تقدير: **شاذٌّ منفردٌ واحدٌ لا يُغيّر أيّ عيّنةٍ في السلسلة
// المُرشَّحة، كبُرَ مقدارُه أو صغُر.** فلا عتبةَ تُخمَّن لرفضه ولا حدَّ لحجمه
// يُحتمَل. وهذا هو الفرقُ بين «العتبةُ أعلى من الشاذّ» — وهي حيلةٌ تسقط حين يكون
// الشاذُّ أكبرَ من الحركة، وقد كان — وبين «المقياسُ لا يراه».
//
// وثمنُه صريحٌ ويُقال: شاذّان **متتاليان** يَفلتان من وسيطٍ ثلاثيّ. ومن قاس ملفًّا
// حدودُ GOP فيه متلاصقةٌ كلَّ إطارين احتاج نافذةً أوسع. والحدُّ مكتوبٌ هنا لا
// مُكتشَفٌ لاحقًا.

/** وسيطُ ثلاثةٍ — بلا فرزٍ ولا مصفوفاتٍ مؤقّتة، لأنه يُنادى لكلّ إطار. */
function median3(a, b, c) {
  if (a > b) { const t = a; a = b; b = t; }
  if (b > c) { const t = b; b = c; c = t; }
  if (a > b) { const t = a; a = b; b = t; }
  return b;
}

/** يُرشِّح سلسلةً بوسيطٍ ثلاثيّ. الطرفان يبقيان خامَّين لأن لا جارَ لهما من جهة —
 * ويُقال ذلك بدل أن يُكرَّر الطرفُ فيُصطنَع جارٌ لا وجودَ له. */
export function median3Filter(values) {
  if (values.length < 3) return values.slice();
  const out = values.slice();
  for (let i = 1; i < values.length - 1; i++) {
    out[i] = median3(values[i - 1], values[i], values[i + 1]);
  }
  return out;
}

/** سلسلةُ قياسٍ على إطاراتٍ متتالية داخل نافذةٍ زمنيّة، خامّةً ومُرشَّحة.
 *
 * `measure(index)` تُرجع عددًا أو `null`. وإن أرجعت `null` مرّةً واحدةً فالسلسلةُ
 * منقوصةٌ ويُبلَّغ باسم الإطار: بندٌ يقيس موضعَ عنصرٍ على نافذةٍ يغيب فيها العنصرُ
 * لا يقيس حركتَه بل يقيس غيابَه، والفرقُ يجب أن يُسمّى لا أن يُسَدَّ بصفر.
 *
 * ويُرجَع `frames` و`times` كاملين كي يُطبَع رقمُ الإطار وPTSه مع كلّ نتيجة —
 * القاعدةُ نفسُها التي تحكم كلَّ بندٍ زمنيّ في هذا المحكّم. */
export function frameSeries(frameSet, t0, t1, measure) {
  // زمنٌ غائبٌ من المواصفة يجب أن **يُسمّى**، لا أن يُقرأ إطارًا صفرًا: بندٌ بلا
  // `t0` يُعطي `frameIndexAt(undefined)` فتخرج المقارناتُ كلُّها `false` ويبقى
  // الدليلُ صفرًا، فيُقاس البندُ من أوّل المقطع ويمرّ أو يسقط بثقةٍ على نافذةٍ لم
  // تُكتَب. وهذا أسوأُ من السقوط لأنه لا يُرى في التقرير.
  for (const [name, v] of [['t0', t0], ['t1', t1]]) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { error: `«${name}» ليس زمنًا (${JSON.stringify(v)}) — خطأُ مواصفة` };
    }
  }
  const a = frameSet.frameIndexAt(t0);
  const b = frameSet.frameIndexAt(t1);
  if (!a || !b) return { error: 'أحد الزمنين خارج المجرى' };
  if (b.index <= a.index) return { error: `الزمنان على الإطار نفسه أو مقلوبان (#${a.index} → #${b.index})` };
  const frames = [];
  const times = [];
  const raw = [];
  for (let i = a.index; i <= b.index; i++) {
    const v = measure(i);
    if (v === null || v === undefined || !Number.isFinite(v)) {
      return {
        error: `لا قياسَ على الإطار #${i} (@${frameSet.facts.ptsSeconds[i].toFixed(3)}ث)`
          + ' — المنطقةُ خاليةٌ من الحبر هناك',
      };
    }
    frames.push(i);
    times.push(frameSet.facts.ptsSeconds[i]);
    raw.push(v);
  }
  return { first: a, last: b, frames, times, raw, smooth: median3Filter(raw) };
}

/** فرقُ إطارين بمقياسين، لأن مقياسًا واحدًا يكذب في حالةٍ معروفة:
 *
 *  `meanDistance` — متوسّطُ المسافة اللونيّة على كل البكسل. يَسمع التغيّر الخفيف
 *  الواسع (تلاشٍ عامّ) ويُخفي الحركة الصغيرة.
 *
 *  `movedFraction` — نسبةُ البكسلات التي تغيّرت أكثر من `perPixel`. تَسمع الحركة
 *  الصغيرة الحادّة ولا يغشّها التلاشي.
 *
 * فبندُ الحركة يُحاسَب على المتوسّط أساسًا وله أن يطلب النسبة أيضًا، وبندُ السكون
 * يُحاسَب على المتوسّط لأن سؤاله «هل سكن كلُّ شيء».
 *
 * والمنطقةُ اختياريّة: حركةٌ في زاويةٍ لا تُثبت أن العنصر المقصود تحرّك، ومن أراد
 * أن يقيس حركةَ عنصرٍ بعينه حدّد مستطيله.
 */
export function frameDelta(a, b, { region = null, perPixel = 24 } = {}) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`فرقُ إطارين بمقاسين مختلفين: ${a.width}×${a.height} و${b.width}×${b.height}`);
  }
  const x0 = region ? Math.round(region.x * a.width) : 0;
  const y0 = region ? Math.round(region.y * a.height) : 0;
  const x1 = region ? Math.min(a.width, Math.round((region.x + region.w) * a.width)) : a.width;
  const y1 = region ? Math.min(a.height, Math.round((region.y + region.h) * a.height)) : a.height;

  let total = 0;
  let moved = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const ia = (y * a.width + x) * a.channels;
      const ib = (y * b.width + x) * b.channels;
      const pa = a.channels === 1
        ? { r: a.pixels[ia], g: a.pixels[ia], b: a.pixels[ia] }
        : { r: a.pixels[ia], g: a.pixels[ia + 1], b: a.pixels[ia + 2] };
      const pb = b.channels === 1
        ? { r: b.pixels[ib], g: b.pixels[ib], b: b.pixels[ib] }
        : { r: b.pixels[ib], g: b.pixels[ib + 1], b: b.pixels[ib + 2] };
      const d = colorDistance(pa, pb);
      total += d;
      if (d >= perPixel) moved++;
      n++;
    }
  }
  return n
    ? { meanDistance: total / n, movedFraction: moved / n, pixels: n }
    : { meanDistance: 0, movedFraction: 0, pixels: 0 };
}
