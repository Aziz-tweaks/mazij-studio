import { inTauri, onMobile } from './tauriEnv';
import { MCP_TOOLS, type McpCtx, type McpTool } from './mcpTools';

/** **مِزو بمفتاح المستخدم** (٢٨ أكتوبر ٢٠٢٦) — ChatGPT أو Claude يُديران التصميم مباشرةً.
 *
 * المستخدم يلصق مفتاحه من OpenAI أو Anthropic مرّةً واحدة (يُحفظ على جهازه وحده،
 * `aiKeyStore.ts`)، ومِزو يرسل طلبه للنموذج **من الجهاز نفسه** إلى خادم المزوّد مباشرةً —
 * لا خادمَ لمزيج في الطريق، فلا كلفةَ على مزيج ولا يمرّ المفتاحُ بأحدٍ غير صاحبه.
 *
 * والنموذجُ يعمل بأدوات MCP نفسِها التي يستعملها Claude Code وCodex على الماك
 * (`MCP_TOOLS`)، تُنفَّذ هنا محلّيًّا على المستند الحيّ: كلُّ أداةٍ فعلٌ حقيقيّ من
 * `StudioActions`، فما يفعله النموذجُ يظهر على اللوحة لحظتَها ويُتراجَع عنه كأيّ تعديل. */

export type LlmProvider = 'openai' | 'anthropic';

export const LLM_PROVIDERS: Record<LlmProvider, { keyId: string; label: string; defaultModel: string; keyUrl: string; keyPrefix: string }> = {
  openai: { keyId: 'openai', label: 'ChatGPT', defaultModel: 'gpt-6.1-terra', keyUrl: 'platform.openai.com/api-keys', keyPrefix: 'sk-' },
  anthropic: { keyId: 'anthropic', label: 'Claude', defaultModel: 'claude-sonnet-5-5', keyUrl: 'console.anthropic.com/settings/keys', keyPrefix: 'sk-ant-' },
};

/** أدواتٌ تقرأ مسارًا من قرص سطح المكتب لا معنى لها في الجوال. */
const DESKTOP_ONLY = new Set(['image_insert_from_path']);

function tools(): McpTool[] {
  return MCP_TOOLS.filter((t) => !(onMobile && DESKTOP_ONLY.has(t.name)));
}

function schemaOf(t: McpTool) {
  return { type: 'object', properties: t.inputSchema.properties ?? {}, ...(t.inputSchema.required ? { required: t.inputSchema.required } : {}) };
}

/** `fetch` تاوري (من Rust) داخل التطبيق — لا قيودَ CORS على نطاق `tauri://` — و`fetch`
 * المتصفّح خارجه. */
async function httpFetch(url: string, init: RequestInit): Promise<Response> {
  if (inTauri) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch(url, init);
  }
  return fetch(url, init);
}

export class LlmError extends Error {}

async function failure(res: Response, ar: boolean): Promise<LlmError> {
  let detail = '';
  try {
    const j = (await res.json()) as { error?: { message?: string } | string };
    detail = typeof j.error === 'string' ? j.error : (j.error?.message ?? '');
  } catch {
    /* بلا تفاصيل */
  }
  if (res.status === 401 || res.status === 403) return new LlmError(ar ? 'المفتاح غير صحيح أو مرفوض. تأكّد منه في الإعدادات.' : 'The key is invalid or was rejected. Check it in settings.');
  if (res.status === 429) return new LlmError(ar ? 'خلصت حصّتك عند المزوّد أو الطلبات كثيرة — جرّب بعد شوي.' : 'Quota exhausted or rate-limited — try again shortly.');
  if (res.status === 404 && /model/i.test(detail)) return new LlmError(ar ? `النموذج غير متاح لحسابك: ${detail}` : `Model not available: ${detail}`);
  return new LlmError(ar ? `المزوّد رجّع خطأ (${res.status})${detail ? `: ${detail}` : ''}` : `Provider error (${res.status})${detail ? `: ${detail}` : ''}`);
}

/** نتيجةُ أداةٍ نصًّا مختصرًا: صورةٌ مضمّنة كاملةً قد تكون ميغابايتات تُدفع رسومُها
 * توكنًا توكنًا، فتُقصّ القيمُ الطويلة. */
function clip(result: unknown): string {
  const s = JSON.stringify(result ?? null, (_k, v) => (typeof v === 'string' && v.length > 400 ? `${v.slice(0, 80)}…(${v.length} chars)` : v));
  return s.length > 14000 ? `${s.slice(0, 14000)}…` : s;
}

async function runTool(name: string, args: Record<string, unknown>, ctx: McpCtx): Promise<string> {
  const t = tools().find((x) => x.name === name);
  if (!t) return JSON.stringify({ error: `unknown tool ${name}` });
  try {
    return clip(await t.run(args, ctx));
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

export interface LlmTurn {
  role: 'u' | 'a';
  text: string;
}

export interface LlmRunOpts {
  provider: LlmProvider;
  apiKey: string;
  model?: string;
  system: string;
  history: LlmTurn[];
  prompt: string;
  ctx: McpCtx;
  lang: 'ar' | 'en';
  signal: AbortSignal;
  onStep?: (toolName: string) => void;
}

const MAX_STEPS = 14;

export async function runLlm(o: LlmRunOpts): Promise<string> {
  return o.provider === 'anthropic' ? runAnthropic(o) : runOpenAI(o);
}

// ───────── Anthropic Messages API ─────────
async function runAnthropic(o: LlmRunOpts): Promise<string> {
  const ar = o.lang === 'ar';
  type Block = { type: string; [k: string]: unknown };
  const messages: Array<{ role: 'user' | 'assistant'; content: string | Block[] }> = [];
  for (const h of o.history.slice(-10)) messages.push({ role: h.role === 'u' ? 'user' : 'assistant', content: h.text });
  // الرسائلُ تتناوب: رسالتان متتاليتان من الدور نفسه تُدمجان.
  const merged: typeof messages = [];
  for (const m of [...messages, { role: 'user' as const, content: o.prompt }]) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role && typeof last.content === 'string' && typeof m.content === 'string') last.content += `\n${m.content}`;
    else merged.push({ ...m });
  }
  if (merged[0]?.role === 'assistant') merged.shift();
  const toolDefs = tools().map((t) => ({ name: t.name, description: t.descriptionEn, input_schema: schemaOf(t) }));
  let finalText = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await httpFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': o.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: o.model || LLM_PROVIDERS.anthropic.defaultModel, max_tokens: 2048, system: o.system, tools: toolDefs, messages: merged }),
      signal: o.signal,
    });
    if (!res.ok) throw await failure(res, ar);
    const j = (await res.json()) as { content: Block[]; stop_reason: string };
    merged.push({ role: 'assistant', content: j.content });
    const texts = j.content.filter((b) => b.type === 'text').map((b) => String(b.text ?? ''));
    if (texts.length) finalText = texts.join('\n').trim();
    const uses = j.content.filter((b) => b.type === 'tool_use');
    if (j.stop_reason !== 'tool_use' || !uses.length) return finalText;
    const results: Block[] = [];
    for (const u of uses) {
      o.onStep?.(String(u.name));
      results.push({ type: 'tool_result', tool_use_id: u.id, content: await runTool(String(u.name), (u.input as Record<string, unknown>) ?? {}, o.ctx) });
    }
    merged.push({ role: 'user', content: results });
  }
  return finalText || (ar ? 'وقفت قبل ما أكمل — الطلب طويل. جرّب تقسمه.' : 'Stopped before finishing — try splitting the request.');
}

// ───────── OpenAI Responses API ─────────
async function runOpenAI(o: LlmRunOpts): Promise<string> {
  const ar = o.lang === 'ar';
  const toolDefs = tools().map((t) => ({ type: 'function', name: t.name, description: t.descriptionEn, parameters: schemaOf(t) }));
  let input: unknown[] = [...o.history.slice(-10).map((h) => ({ role: h.role === 'u' ? 'user' : 'assistant', content: h.text })), { role: 'user', content: o.prompt }];
  let previous: string | undefined;
  let finalText = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await httpFetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${o.apiKey}` },
      body: JSON.stringify({ model: o.model || LLM_PROVIDERS.openai.defaultModel, instructions: o.system, tools: toolDefs, input, ...(previous ? { previous_response_id: previous } : {}) }),
      signal: o.signal,
    });
    if (!res.ok) throw await failure(res, ar);
    const j = (await res.json()) as { id: string; output: Array<{ type: string; name?: string; arguments?: string; call_id?: string; content?: Array<{ type: string; text?: string }> }> };
    previous = j.id;
    const texts = j.output.filter((x) => x.type === 'message').flatMap((x) => (x.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text ?? ''));
    if (texts.length) finalText = texts.join('\n').trim();
    const calls = j.output.filter((x) => x.type === 'function_call');
    if (!calls.length) return finalText;
    const outs: unknown[] = [];
    for (const c of calls) {
      o.onStep?.(c.name ?? '');
      let args: Record<string, unknown> = {};
      try {
        args = c.arguments ? JSON.parse(c.arguments) : {};
      } catch {
        /* وسائطُ تالفة: الأداة تردّ بخطئها */
      }
      outs.push({ type: 'function_call_output', call_id: c.call_id, output: await runTool(c.name ?? '', args, o.ctx) });
    }
    input = outs;
  }
  return finalText || (ar ? 'وقفت قبل ما أكمل — الطلب طويل. جرّب تقسمه.' : 'Stopped before finishing — try splitting the request.');
}

/** فحصٌ سريع للمفتاح قبل حفظه: طلبٌ صغير لا يكلّف شيئًا يُذكر. */
export async function testKey(provider: LlmProvider, apiKey: string, lang: 'ar' | 'en'): Promise<void> {
  const ar = lang === 'ar';
  const res =
    provider === 'anthropic'
      ? await httpFetch('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } })
      : await httpFetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw await failure(res, ar);
}

const MODEL_KEY = 'mazij.ai.models';
export function loadModel(p: LlmProvider): string {
  try {
    return (JSON.parse(localStorage.getItem(MODEL_KEY) ?? '{}') as Record<string, string>)[p] || LLM_PROVIDERS[p].defaultModel;
  } catch {
    return LLM_PROVIDERS[p].defaultModel;
  }
}
export function saveModel(p: LlmProvider, model: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(MODEL_KEY) ?? '{}') as Record<string, string>;
    all[p] = model.trim();
    localStorage.setItem(MODEL_KEY, JSON.stringify(all));
  } catch {
    /* تفضيلٌ لكلّ جهاز */
  }
}
