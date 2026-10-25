import { useEffect, useState } from 'react';

// **موجةُ الصوت على مقطعه** — ما يرى به المصمّمُ أين يتكلّم الراوي فيضع الكلمةَ عنده. تُفكَّك
// مرّةً واحدةً لكلّ ملف (`decodeAudioData` — المُفكِّك نفسُه الذي يُشغّل) وتُختصَر إلى ذروةٍ
// لكلّ جزءٍ من مئة من الثانية، وتُحفَظ في الذاكرة لا في المستند: هي مشتقّةٌ من الملف، ولا
// يجوز أن تحمل نسخةً ثانيةً منه.

/** ذُرى في الثانية — جزءٌ من مئة: أدقُّ من إطارٍ عند ٣٠ و٦٠، وأخفُّ من العيّنات بأربعمئة مرّة. */
export const PEAKS_PER_SECOND = 100;

const cache = new Map<string, Promise<Float32Array | null>>();
/** مفتاحُ ملفٍّ في الذاكرة: طولُه وذيلُه — عنوانُ بياناتٍ بالميغابايت لا يُستعمل مفتاحًا كاملًا. */
const keyOf = (src: string) => `${src.length}:${src.slice(-64)}`;

type AudioCtxCtor = new (opts?: { sampleRate?: number }) => BaseAudioContext;

export function loadAudioPeaks(src: string): Promise<Float32Array | null> {
  const key = keyOf(src);
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const bytes = await (await fetch(src)).arrayBuffer();
        const w = window as unknown as { OfflineAudioContext?: new (c: number, l: number, r: number) => BaseAudioContext; AudioContext?: AudioCtxCtor };
        const ctx: BaseAudioContext = w.OfflineAudioContext ? new w.OfflineAudioContext(1, 1, 44100) : new (w.AudioContext as AudioCtxCtor)();
        const audio = await ctx.decodeAudioData(bytes);
        const n = Math.max(1, Math.ceil(audio.duration * PEAKS_PER_SECOND));
        const out = new Float32Array(n);
        const per = audio.length / n;
        for (let c = 0; c < audio.numberOfChannels; c++) {
          const data = audio.getChannelData(c);
          for (let i = 0; i < n; i++) {
            const a = Math.floor(i * per);
            const b = Math.min(data.length, Math.floor((i + 1) * per));
            let m = out[i];
            for (let j = a; j < b; j++) {
              const v = data[j] < 0 ? -data[j] : data[j];
              if (v > m) m = v;
            }
            out[i] = m;
          }
        }
        return out;
      } catch {
        return null; // ملفٌّ لا يُفكَّك هنا (فيديو في متصفّحٍ لا يقرأ صوته): مقطعٌ بلا موجة، لا خطأ.
      }
    })();
    cache.set(key, pending);
  }
  return pending;
}

export function useAudioPeaks(src: string | null): Float32Array | null {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  useEffect(() => {
    let alive = true;
    setPeaks(null);
    if (src) void loadAudioPeaks(src).then((p) => alive && setPeaks(p));
    return () => {
      alive = false;
    };
  }, [src]);
  return peaks;
}

/** مسارُ SVG للموجة بين موضعَي الملف `from..from+length` (ثوانٍ) في صندوقٍ عرضُه `length`
 * وارتفاعُه ٢ (من −١ إلى ١): ذروةٌ فوق الخطّ وصورتُها تحته. `step` يُقلّل النقاط لطولٍ كبير. */
export function waveformPath(peaks: Float32Array, from: number, length: number, maxPoints = 1200): string {
  const i0 = Math.max(0, Math.floor(from * PEAKS_PER_SECOND));
  const i1 = Math.min(peaks.length, Math.ceil((from + length) * PEAKS_PER_SECOND));
  if (i1 <= i0) return '';
  const step = Math.max(1, Math.ceil((i1 - i0) / maxPoints));
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = i0; i < i1; i += step) {
    let m = 0;
    for (let j = i; j < Math.min(i1, i + step); j++) if (peaks[j] > m) m = peaks[j];
    const x = (i / PEAKS_PER_SECOND - from).toFixed(3);
    top.push(`${x},${(-m).toFixed(3)}`);
    bottom.push(`${x},${m.toFixed(3)}`);
  }
  return `M${top.join('L')}L${bottom.reverse().join('L')}Z`;
}
