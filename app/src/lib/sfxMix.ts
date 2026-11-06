/** **خلطُ المؤثّرات على الخطّ الزمنيّ** (٦ نوفمبر ٢٠٢٦) — قائمةُ أحداث {زمن، صوت} → ملفُّ
 * WAV واحد يُدرَج طبقةَ صوت. القواعدُ نفسُها التي تعلّمناها في إعلانات مزيج:
 * - يُقصّ الصمتُ من أوّل كلّ صوت فيقع أعلى نقطةٍ فيه على حدثه (الإطار الذي يتحرّك فيه العنصر).
 * - يُحدّ الطول (الهبّات ١٫٦ث والباقي ١٫٢ث) بتلاشٍ ١٥٠ م.ث في الذيل — لا ذيولَ تتراكم.
 * - الصاعد يُوضع بحيث تقع **ذروتُه** على الحدث لا بدايتُه.
 * - تُضبط الذروةُ النهائيّة على −1.5 dBFS. */

export interface MixCue {
  /** ثوانٍ مطلقة على الخطّ الزمنيّ. */
  t: number;
  buf: AudioBuffer;
  /** الكسب بالديسيبل (افتراضيًّا −8). */
  db?: number;
  /** صاعد: تقع ذروتُه على `t`. */
  riser?: boolean;
  /** هبّة: طولٌ أقصى أطول. */
  long?: boolean;
}

export const MIX_SR = 48000;

export function mixCuesToWav(cues: MixCue[], durationSec: number): { wav: ArrayBuffer; peak: number } {
  const SR = MIX_SR;
  const total = Math.max(1, Math.ceil(durationSec * SR));
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  for (const c of cues) {
    const buf = c.buf;
    const ch0 = buf.getChannelData(0);
    const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
    const k = buf.sampleRate / SR;
    const len = Math.floor(buf.length / k);
    const at = (ch: Float32Array, i: number) => {
      const p = i * k;
      const j = Math.floor(p);
      const f = p - j;
      return (ch[j] ?? 0) * (1 - f) + (ch[j + 1] ?? 0) * f;
    };
    let peak = 0;
    let peakAt = 0;
    for (let i = 0; i < len; i++) {
      const v = Math.max(Math.abs(at(ch0, i)), Math.abs(at(ch1, i)));
      if (v > peak) {
        peak = v;
        peakAt = i;
      }
    }
    let st = 0;
    while (st < len && Math.max(Math.abs(at(ch0, st)), Math.abs(at(ch1, st))) <= peak * 0.01) st++;
    let count: number;
    let fade: number;
    let t0: number;
    if (c.riser) {
      count = peakAt - st + Math.round(0.25 * SR);
      fade = Math.round(0.25 * SR);
      t0 = c.t - (peakAt - st) / SR;
    } else {
      count = Math.min(len - st, Math.round((c.long ? 1.6 : 1.2) * SR));
      fade = Math.min(count, Math.round(0.15 * SR));
      t0 = c.t;
    }
    count = Math.max(0, Math.min(count, len - st));
    const g = Math.pow(10, (c.db ?? -8) / 20);
    let o = Math.round(t0 * SR);
    let skip = 0;
    if (o < 0) {
      skip = -o;
      o = 0;
    }
    for (let i = skip; i < count && o + i - skip < total; i++) {
      const env = i >= count - fade ? (count - i) / Math.max(1, fade) : 1;
      L[o + i - skip] += at(ch0, st + i) * g * env;
      R[o + i - skip] += at(ch1, st + i) * g * env;
    }
  }
  let m = 0;
  for (let i = 0; i < total; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
  const norm = m > 0 ? Math.pow(10, -1.5 / 20) / m : 1;
  const out = new DataView(new ArrayBuffer(44 + total * 4));
  const w4 = (o: number, str: string) => [...str].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
  w4(0, 'RIFF');
  out.setUint32(4, 36 + total * 4, true);
  w4(8, 'WAVE');
  w4(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 2, true);
  out.setUint32(24, SR, true);
  out.setUint32(28, SR * 4, true);
  out.setUint16(32, 4, true);
  out.setUint16(34, 16, true);
  w4(36, 'data');
  out.setUint32(40, total * 4, true);
  for (let i = 0; i < total; i++) {
    out.setInt16(44 + i * 4, Math.max(-32768, Math.min(32767, Math.round(L[i] * norm * 32767))), true);
    out.setInt16(46 + i * 4, Math.max(-32768, Math.min(32767, Math.round(R[i] * norm * 32767))), true);
  }
  return { wav: out.buffer, peak: m };
}

/** يفكّ أصواتًا متعدّدة مرّةً واحدة لكلّ ملف. */
export async function decodeAll(sources: Map<string, () => Promise<Uint8Array>>): Promise<Map<string, AudioBuffer>> {
  const ac = new OfflineAudioContext(2, 1, MIX_SR);
  const out = new Map<string, AudioBuffer>();
  for (const [key, load] of sources) {
    const bytes = await load();
    out.set(key, await ac.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
  }
  return out;
}
