/** عاملٌ خلفيّ لتتبُّع الصورة (`imageTrace.ts`): الحسابُ نفسه، بعيدًا عن خيط الواجهة
 * فلا تتجمّد اللوحة أثناءه. رسالةٌ واحدة تدخل ونتيجةٌ واحدة تخرج. */
import { traceImage, type TraceOptions } from './imageTrace';

interface TraceRequest {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  opts?: TraceOptions;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<TraceRequest>) => void) | null;
  postMessage: (msg: unknown) => void;
};

ctx.onmessage = (e) => {
  const { width, height, data, opts } = e.data;
  try {
    ctx.postMessage({ result: traceImage({ width, height, data }, opts ?? {}) });
  } catch (err) {
    ctx.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
