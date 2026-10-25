// ─────────────────────────────────────────────────────────────────────────────
// ما يُسمَع ومتى — الصوتُ في المعاينة والتصدير بصيغةٍ واحدة (٢٥ أكتوبر ٢٠٢٦)
// ─────────────────────────────────────────────────────────────────────────────
//
// **مصدران للصوت:** طبقةُ الصوت (`AudioElement`) وصوتُ الفيديو (`VideoElement`، وكان
// «قريبًا» — `volume`/`muted` محفوظان بلا أثر). وسؤالٌ واحدٌ يجيب عنه الاثنان:
// **أيُّ موضعٍ من الملف يُسمَع عند لحظة الخطّ الزمنيّ `t`، وبأيّ علوّ؟** — `mediaTimeAt`
// و`audibleGain`. تقرؤهما المعاينة (`AudioPlayback`) فتُشغّل وتُوقف وتُزامن، ويقرؤهما
// التصدير (`audioMixPlan`) فيبني منهما مرشّحَ FFmpeg. فلا يختلف ما تسمعه عمّا يخرج.
//
// **والفيديو يبدأ من أوّله عند بداية مقطعه** — `animTimeAt(anim, t)` لا `t`. كان يُشغَّل
// بزمن المستند نفسِه، فمقطعٌ وُضِع عند الثانية الخامسة يبدأ من خامسة الملف. وكلُّ مستندٍ
// قائمٍ مقطعُ فيديوه عند الصفر (لم يكن في الواجهة غيرُه حين بُني) فلا يتغيّر فيه بايت.

import type { AudioElement, DocElement, VideoElement } from '../state/elements';
import { animTimeAt } from './animTimeline';
import { videoSourceTimeAt } from './videoPlayback';

/** تسامحُ حدود المقطع — كـ`clipShowsAt`: إطارٌ محسوبٌ بالقسمة قد يفترق عن الحدّ بجزءٍ من المليار. */
const EDGE_EPS = 1e-6;

export type SoundElement = AudioElement | VideoElement;

export function isSoundElement(el: DocElement): el is SoundElement {
  return el.type === 'audio' || el.type === 'video';
}

/** علوُّ الصوت المسموع: صفرٌ لطبقةٍ مخفيّة (العين في قائمة الطبقات تُسكتها كما تُخفي غيرها)
 * أو مكتومة أو بلا ملف. */
export function audibleGain(el: SoundElement): number {
  if (!el.visible || el.muted || !el.src) return 0;
  return Math.max(0, Math.min(1, Number.isFinite(el.volume) ? el.volume : 1));
}

/** موضعُ الملف المسموع عند لحظة الخطّ الزمنيّ `t` (ثوانٍ)، أو `null` وهو صامت.
 *
 * - **الصوت:** داخل مقطعه `[start, start+duration)` وداخل ملفّه — والموضعُ `animTimeAt`،
 *   فقصُّ الرأس يتخطّى أوّلَ الملف وسحبُ المقطع ينقله كاملًا.
 * - **الفيديو:** من بداية مقطعه، بنافذة قصّه وتكراره (`videoSourceTimeAt` نفسُها التي ترسم
 *   صورته). بلا تكرارٍ يسكت حين تنتهي النافذةُ ويتجمّد الإطار؛ وإن كان «يظهر في مقطعه
 *   فقط» سكت خارج مقطعه كما يختفي. */
export function mediaTimeAt(el: SoundElement, t: number): number | null {
  const a = el.anim;
  if (t < a.start - EDGE_EPS) return null;
  const local = animTimeAt(a, t);
  if (el.type === 'audio') {
    if (t >= a.start + a.duration - EDGE_EPS) return null;
    if (local < 0 || local >= el.durationSec) return null;
    return local;
  }
  if (a.bounded && t >= a.start + a.duration - EDGE_EPS) return null;
  const window = Math.max(0.001, el.trimOut - el.trimIn);
  if (local < 0) return null;
  if (!el.loop && local >= window) return null;
  return videoSourceTimeAt(el.trimIn, el.trimOut, local, el.loop);
}

/** قطعةٌ واحدةٌ تُخلَط في التصدير: من الملف `input` (رقمُ مدخل FFmpeg)، تُسمَع من لحظة
 * المستند `at` طوالَ `length` ثانية، بدءًا من موضع الملف `from` — وللمكرَّر نافذتُه. */
export interface MixSegment {
  elementId: string;
  input: number;
  at: number;
  from: number;
  length: number;
  gain: number;
  /** فيديو مكرَّر: النافذةُ التي تتكرّر (`[in, out)` من الملف) — `from` داخلها. */
  loop?: { in: number; out: number };
}

/** **خطّةُ الخلط**: لكلّ مصدرٍ مسموعٍ قطعتُه داخل مدّة المستند `total`. `inputs` هي المصادرُ
 * بالترتيب الذي تُمرَّر به ملفّاتُها إلى FFmpeg بعد مدخل الإطارات (المدخلُ ١ فما بعده). */
export function audioMixPlan(elements: DocElement[], total: number): { segments: MixSegment[]; inputs: SoundElement[] } {
  const inputs: SoundElement[] = [];
  const segments: MixSegment[] = [];
  for (const el of elements) {
    if (!isSoundElement(el)) continue;
    const gain = audibleGain(el);
    if (gain <= 0) continue;
    const a = el.anim;
    const at = Math.max(0, a.start);
    if (at >= total - EDGE_EPS) continue;
    const from = mediaTimeAt(el, at + EDGE_EPS * 2);
    if (from === null) continue;
    let end = total;
    if (el.type === 'audio') end = Math.min(end, a.start + a.duration, at + (el.durationSec - animTimeAt(a, at)));
    else {
      if (a.bounded) end = Math.min(end, a.start + a.duration);
      if (!el.loop) end = Math.min(end, at + (Math.max(0.001, el.trimOut - el.trimIn) - Math.max(0, animTimeAt(a, at))));
    }
    const length = end - at;
    if (!(length > 0.001)) continue;
    const input = inputs.length + 1;
    inputs.push(el);
    segments.push({
      elementId: el.id,
      input,
      at,
      from: el.type === 'audio' ? Math.max(0, animTimeAt(a, at)) : from,
      length,
      gain,
      ...(el.type === 'video' && el.loop ? { loop: { in: el.trimIn, out: el.trimOut } } : {}),
    });
  }
  return { segments, inputs };
}

const f6 = (n: number) => Number(n.toFixed(6)).toString();

/** **مرشّحُ FFmpeg للخلط** — `-filter_complex` ومخرجُه. لكلّ قطعة: قصٌّ إلى موضعها من الملف،
 * فعلوُّها، فتأخيرٌ إلى لحظتها في المستند (`adelay … all=1` على كلّ القنوات)، ثم `amix`
 * **بلا تطبيع** (`normalize=0`): الخلطُ الافتراضيّ يقسم كلَّ مصدرٍ على عددها فيخفت الراوي
 * إلى النصف لمجرّد أنّ تحته موسيقى. والمكرَّرُ: نافذتُه تُعاد بـ`aloop` بعد توحيد معدّل
 * العيّنات (حجمُ الحلقة بالعيّنات)، ثم يُقَصّ من موضعه. */
export function audioMixFilter(segments: MixSegment[], sampleRate = 48000): { filter: string; out: string } | null {
  if (!segments.length) return null;
  const parts = segments.map((s, i) => {
    const chain: string[] = [];
    if (s.loop) {
      const windowLen = Math.max(0.001, s.loop.out - s.loop.in);
      chain.push(`atrim=start=${f6(s.loop.in)}:end=${f6(s.loop.out)}`, 'asetpts=PTS-STARTPTS', `aresample=${sampleRate}`, `aloop=loop=-1:size=${Math.max(1, Math.round(windowLen * sampleRate))}`, `atrim=start=${f6(s.from - s.loop.in)}:duration=${f6(s.length)}`);
    } else {
      chain.push(`atrim=start=${f6(s.from)}:duration=${f6(s.length)}`);
    }
    chain.push('asetpts=PTS-STARTPTS', `aresample=${sampleRate}`, `volume=${f6(s.gain)}`, `adelay=delays=${Math.round(s.at * 1000)}:all=1`);
    return `[${s.input}:a]${chain.join(',')}[a${i}]`;
  });
  if (segments.length === 1) return { filter: parts.join(';'), out: '[a0]' };
  parts.push(`${segments.map((_, i) => `[a${i}]`).join('')}amix=inputs=${segments.length}:normalize=0:dropout_transition=0[aout]`);
  return { filter: parts.join(';'), out: '[aout]' };
}

/** امتدادُ ملفٍّ مؤقّتٍ لعنوان بيانات — FFmpeg يكتشف الصيغة من المحتوى، والامتدادُ تلميح. */
export function extForDataUrl(dataUrl: string): string {
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? '';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('aac')) return 'aac';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('webm')) return 'webm';
  return 'mp4';
}

/** بايتاتُ عنوان بيانات base64. */
export function dataUrlBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
