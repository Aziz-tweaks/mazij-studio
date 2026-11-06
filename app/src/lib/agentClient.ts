import { hasDesktopSidecars as inTauri, onMobile } from './tauriEnv';
import { MIZO_DIRECTOR } from './mizoDirector';

/** مِزو عبر وكيلٍ خارجيّ — الواجهةُ الأماميّة لـ `src-tauri/src/agents.rs`.
 *
 * المحرّكات:
 * - `local`: المفسّرُ ذو القواعد الثابتة (`commandInterpreter.ts`) — فوريّ وبلا شبكة.
 * - `claude` / `codex`: الأداةُ المثبّتة على الجهاز بحساب المستخدم نفسه؛ تستدعي
 *   أدواتِ مزيج عبر خادم MCP المحلّيّ، فتظهر تعديلاتُها على اللوحة لحظةَ تنفيذها.
 * - `custom`: أيُّ وكيلٍ آخر يقبل أمرًا نصّيًّا (أداةُ سطرِ أوامر، Gemini CLI…)، بقالب أمرٍ
 *   يكتبه المستخدم. يجد الوكيلُ رابطَ MCP ورمزه في `MAZIJ_MCP_URL`/`MAZIJ_MCP_TOKEN`. */
// و`openai` / `anthropic` (٢٨ أكتوبر ٢٠٢٦): ChatGPT أو Claude بمفتاح المستخدم نفسه، من
// الجهاز مباشرةً (`llmAgent.ts`) — يعملان في الجوال أيضًا لأنهما لا يحتاجان برنامجًا مرافقًا.
export type AiEngine = 'local' | 'claude' | 'codex' | 'custom' | 'openai' | 'anthropic';

export interface AgentInfo {
  id: 'claude' | 'codex';
  label: string;
  path: string | null;
  version: string | null;
}

export interface AgentReply {
  ok: boolean;
  text: string;
}

export async function detectAgents(): Promise<AgentInfo[]> {
  if (!inTauri) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<AgentInfo[]>('agent_detect');
}

export async function runAgent(agent: 'claude' | 'codex' | 'custom', prompt: string, system: string, customCmd?: string): Promise<AgentReply> {
  if (!inTauri) throw new Error('الوكلاءُ الخارجيّون يعملون داخل تطبيق مزيج على الجهاز فقط.');
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<AgentReply>('agent_run', { agent, prompt, system, customCmd: customCmd ?? null });
}

export async function cancelAgent(): Promise<void> {
  if (!inTauri) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('agent_cancel');
}

/** التعليماتُ التي تُلحق بكلّ طلب. مكتوبةٌ لتصف عالمَ المستند لا لتُملي أسلوبًا:
 * ما الأدوات، وما الوحدات، وكيف يُسمّي المصمّمُ الأشياء، وكيف يُكتب الردّ. */
export function agentSystemPrompt(lang: 'ar' | 'en', selected: string[]): string {
  const sel = selected.length ? selected.join(', ') : '—';
  const replyLang = lang === 'ar' ? 'بالعربية' : 'in English';
  return [
    'أنت «مِزو»، مساعد التصميم داخل تطبيق «مزيج». تعمل على التصميم المفتوح الآن أمام المستخدم، عبر أدوات MCP التابعة للخادم mazij وحدها.',
    'ابدأ دائمًا بـ document_get لتعرف مقاس اللوحة والعناصر وأسماءها ونصوصها وألوان اللوحة اللونية.',
    'حين يذكر المستخدم «العنوان» أو «الشارة» أو «الشعار» أو «الصورة» فطابقها بالاسم (name) أو بالنص أو بالدور الواضح، لا بالعنصر المحدَّد. استعمل العنصر المحدَّد فقط حين يقول «هذا» أو «المحدد».',
    `العناصر المحدَّدة الآن: ${sel}.`,
    'الخلفية ليست عنصرًا: غيّرها بـ document_set_background (لون) أو document_set_palette (لوحة كاملة).',
    'الإحداثيات والأحجام بالبكسل على مقاس اللوحة. حجم الخط fontSize مرجعه لوحٌ عرضه ١٠٨٠: الحجم الظاهر = fontSize × (عرض اللوحة ÷ ١٠٨٠).',
    'نفّذ مباشرةً ولا تطلب إذنًا. لا تغيّر ما لم يُطلب. وتأكّد أن لا يخرج عنصرٌ عن حدود اللوحة ما لم يُطلب ذلك.',
    `حين تنتهي ردّ ${replyLang} بجملةٍ أو جملتين تذكر ما تغيّر بلغة المصمّم (مثل: «كبّرت العنوان وجعلت الخلفية زرقاء»)، بلا أسماء أدوات ولا معرّفات ولا مصطلحات برمجية.`,
    'إن تعذّر الطلب بالأدوات المتاحة فقل ذلك بوضوح واقترح أقرب ما يمكن فعله.',
    MIZO_DIRECTOR,
  ].join('\n');
}

const PREFS_KEY = 'mazij.ai.prefs';

interface AiPrefs {
  /** غيابُه يعني «لم يختر المستخدم بعد»: نختار Claude إن وُجد، وإلا المحلّيّ. */
  engine?: AiEngine;
  customCmd?: string;
}

export function loadAiPrefs(): AiPrefs {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PREFS_KEY) : null;
    const prefs = raw ? (JSON.parse(raw) as AiPrefs) : {};
    // الجوالُ لا وكلاءَ فيه ولا أوامرَ مخصّصة: المحلّيّ، أو ChatGPT/Claude بمفتاح المستخدم.
    const keyEngine = prefs.engine === 'openai' || prefs.engine === 'anthropic';
    return onMobile && prefs.engine && !keyEngine ? { ...prefs, engine: 'local' } : prefs;
  } catch {
    return {};
  }
}

export function saveAiPrefs(p: AiPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadAiPrefs(), ...p }));
  } catch {
    // تفضيلٌ لكلّ جهاز، لا بيانات: فقدُه يعيد الاختيار الافتراضيّ فقط.
  }
}
