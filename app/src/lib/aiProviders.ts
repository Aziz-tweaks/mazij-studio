import { decodeVideoBytes } from './videoFile';

export type AiOutputKind = 'image' | 'video';

export interface AiGenerateInput {
  prompt: string;
  size: string; // "WxH"
  apiKey: string;
}

export interface AiGenerateImageResult {
  kind: 'image';
  dataUrl: string;
  naturalW: number;
  naturalH: number;
}

export interface AiGenerateVideoResult {
  kind: 'video';
  dataUrl: string;
  naturalW: number;
  naturalH: number;
  durationSec: number;
  poster: string | null;
}

export type AiGenerateResult = AiGenerateImageResult | AiGenerateVideoResult;

export interface AiGenerateOpts {
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
}

/** Code-defined registry of AI media-generation providers (roadmap #22's practical
 * seed, same "registry you extend, not a closed list" shape as `localModels.ts`'s
 * LOCAL_MODELS). Each provider calls its own real public endpoint directly from
 * this device with the key the user typed in (`aiKeyStore.ts`) — never a key we
 * ship, never a request routed through anything mazij controls. `enabled: false`
 * entries are listed for transparency only and are never callable, same convention
 * as `LocalModelInfo.downloadable`. */
export interface AiProviderInfo {
  id: string;
  name: string;
  nameEn: string;
  output: AiOutputKind;
  enabled: boolean;
  sizes: string[];
  keyHint: string;
  keyHintEn: string;
  generate(input: AiGenerateInput, opts: AiGenerateOpts): Promise<AiGenerateResult>;
}

class AiProviderError extends Error {}

/** Classifies a non-2xx HTTP response into the three user-facing failure shapes the
 * spec calls out (bad key / quota exhausted / anything else) without guessing at a
 * provider's exact error JSON — every provider here uses standard HTTP status
 * semantics for these two cases (401/403 = auth, 429 = rate limit), so the mapping
 * is the same across providers even though each body's shape differs. */
function classifyHttpError(status: number): string {
  if (status === 401 || status === 403) return 'مفتاح API غير صحيح أو مرفوض من المزوّد';
  if (status === 429) return 'انتهت حصتك لدى هذا المزوّد — حاول لاحقًا';
  return `المزوّد أعاد خطأ (HTTP ${status})`;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

function decodeImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new AiProviderError('تعذّر قراءة الصورة المولَّدة'));
    img.src = dataUrl;
  });
}

async function bytesFromResponse(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer());
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(binary)}`;
}

async function fetchMediaAsDataUrl(url: string, mime: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new AiProviderError(classifyHttpError(res.status));
  return bytesToDataUrl(await bytesFromResponse(res), mime);
}

async function fetchMediaAsBytes(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new AiProviderError(classifyHttpError(res.status));
  return bytesFromResponse(res);
}

// --- OpenAI Images: a single synchronous call, response includes the image bytes
// inline as base64 — no polling needed. https://platform.openai.com/docs/api-reference/images
async function openaiGenerate(input: AiGenerateInput, { signal, onProgress }: AiGenerateOpts): Promise<AiGenerateResult> {
  onProgress(0.1);
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: input.prompt, size: input.size, n: 1 }),
    signal,
  });
  onProgress(0.7);
  if (!res.ok) throw new AiProviderError(classifyHttpError(res.status));
  const json = (await readJson(res)) as { data?: Array<{ b64_json?: string }> } | null;
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new AiProviderError('رد غير متوقَّع من المزوّد');
  const dataUrl = `data:image/png;base64,${b64}`;
  const { w, h } = await decodeImageSize(dataUrl);
  onProgress(1);
  return { kind: 'image', dataUrl, naturalW: w, naturalH: h };
}

// --- Replicate: create a prediction, then poll its `urls.get` until it settles.
// https://replicate.com/docs/reference/http#predictions.create
async function replicateGenerate(input: AiGenerateInput, { signal, onProgress }: AiGenerateOpts): Promise<AiGenerateResult> {
  const [w, h] = input.size.split('x').map(Number);
  const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${input.apiKey}` },
    body: JSON.stringify({ input: { prompt: input.prompt, width: w, height: h } }),
    signal,
  });
  if (!createRes.ok) throw new AiProviderError(classifyHttpError(createRes.status));
  const createJson = (await readJson(createRes)) as { urls?: { get?: string } } | null;
  const getUrl = createJson?.urls?.get;
  if (!getUrl) throw new AiProviderError('رد غير متوقَّع من المزوّد');
  onProgress(0.15);

  for (let i = 0; i < 60; i++) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    const pollRes = await fetch(getUrl, { headers: { Authorization: `Token ${input.apiKey}` }, signal });
    if (!pollRes.ok) throw new AiProviderError(classifyHttpError(pollRes.status));
    const pollJson = (await readJson(pollRes)) as { status?: string; output?: string[] | string; error?: string } | null;
    if (pollJson?.status === 'succeeded') {
      onProgress(0.85);
      const outUrl = Array.isArray(pollJson.output) ? pollJson.output[0] : pollJson.output;
      if (!outUrl) throw new AiProviderError('رد غير متوقَّع من المزوّد');
      const dataUrl = await fetchMediaAsDataUrl(outUrl, 'image/png', signal);
      const { w: naturalW, h: naturalH } = await decodeImageSize(dataUrl);
      onProgress(1);
      return { kind: 'image', dataUrl, naturalW, naturalH };
    }
    if (pollJson?.status === 'failed' || pollJson?.status === 'canceled') {
      throw new AiProviderError(pollJson.error ?? 'فشل التوليد لدى المزوّد');
    }
    onProgress(0.15 + (i / 60) * 0.65);
    await delay(500, signal);
  }
  throw new AiProviderError('انتهت مهلة الانتظار — لم يكتمل التوليد');
}

// --- fal.ai: submit to the queue, poll `status_url`, then fetch `response_url` for
// the final payload. https://docs.fal.ai/model-apis/queue
async function falGenerate(input: AiGenerateInput, { signal, onProgress }: AiGenerateOpts): Promise<AiGenerateResult> {
  const [w, h] = input.size.split('x').map(Number);
  const submitRes = await fetch('https://queue.fal.run/fal-ai/ltx-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${input.apiKey}` },
    body: JSON.stringify({ prompt: input.prompt, aspect_ratio: `${w}:${h}` }),
    signal,
  });
  if (!submitRes.ok) throw new AiProviderError(classifyHttpError(submitRes.status));
  const submitJson = (await readJson(submitRes)) as { status_url?: string; response_url?: string } | null;
  const statusUrl = submitJson?.status_url;
  const responseUrl = submitJson?.response_url;
  if (!statusUrl || !responseUrl) throw new AiProviderError('رد غير متوقَّع من المزوّد');
  onProgress(0.1);

  for (let i = 0; i < 120; i++) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    const stRes = await fetch(statusUrl, { headers: { Authorization: `Key ${input.apiKey}` }, signal });
    if (!stRes.ok) throw new AiProviderError(classifyHttpError(stRes.status));
    const stJson = (await readJson(stRes)) as { status?: string } | null;
    if (stJson?.status === 'COMPLETED') break;
    onProgress(0.1 + Math.min(i / 120, 1) * 0.65);
    await delay(500, signal);
  }

  onProgress(0.8);
  const resRes = await fetch(responseUrl, { headers: { Authorization: `Key ${input.apiKey}` }, signal });
  if (!resRes.ok) throw new AiProviderError(classifyHttpError(resRes.status));
  const resJson = (await readJson(resRes)) as { video?: { url?: string } } | null;
  const videoUrl = resJson?.video?.url;
  if (!videoUrl) throw new AiProviderError('رد غير متوقَّع من المزوّد');
  const bytes = await fetchMediaAsBytes(videoUrl, signal);
  const loaded = await decodeVideoBytes(bytes, 'generated.mp4');
  onProgress(1);
  return { kind: 'video', dataUrl: loaded.dataUrl, naturalW: loaded.naturalW, naturalH: loaded.naturalH, durationSec: loaded.durationSec, poster: loaded.poster };
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI — صور',
    nameEn: 'OpenAI — images',
    output: 'image',
    enabled: true,
    sizes: ['1024x1024', '1024x1536', '1536x1024'],
    keyHint: 'مفتاح من platform.openai.com/api-keys',
    keyHintEn: 'A key from platform.openai.com/api-keys',
    generate: openaiGenerate,
  },
  {
    id: 'replicate',
    name: 'Replicate — صور',
    nameEn: 'Replicate — images',
    output: 'image',
    enabled: true,
    sizes: ['1024x1024', '768x768', '1024x768'],
    keyHint: 'مفتاح من replicate.com/account/api-tokens',
    keyHintEn: 'A key from replicate.com/account/api-tokens',
    generate: replicateGenerate,
  },
  {
    id: 'fal',
    name: 'fal.ai — فيديو',
    nameEn: 'fal.ai — video',
    output: 'video',
    enabled: true,
    sizes: ['1280x720', '720x1280'],
    keyHint: 'مفتاح من fal.ai/dashboard/keys',
    keyHintEn: 'A key from fal.ai/dashboard/keys',
    generate: falGenerate,
  },
];

export function providerById(id: string): AiProviderInfo | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

/** Maps any failure from a provider's `generate()` to one of the honest, specific
 * messages the spec requires (bad key / quota / network cut / cancel) instead of a
 * generic "something went wrong" — `AiProviderError` already carries one of those
 * from `classifyHttpError`; a plain `TypeError` is what `fetch` throws for a real
 * network-layer failure (DNS/connection refused/offline), never from a successful
 * HTTP round trip. */
export function describeAiError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'أُلغي التوليد';
  if (err instanceof AiProviderError) return err.message;
  if (err instanceof TypeError) return 'انقطاع في الشبكة — تحقّق من اتصالك بالإنترنت';
  return err instanceof Error ? err.message : 'فشل غير متوقَّع';
}
