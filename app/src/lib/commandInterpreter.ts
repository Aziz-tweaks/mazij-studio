import type { McpCtx } from './mcpTools';
import { MCP_TOOLS, layerLabel } from './mcpTools';
import { sizeAt } from '../data/constants';
import type { DocElement } from '../state/elements';

/** Roadmap #24-ب — "the honest floor": a constrained Arabic+English intent
 * grammar over the *same* tool registry the MCP server (#20) exposes
 * (`src/lib/mcpTools.ts`). Every successful match here ends in a real
 * `McpTool.run(args, ctx)` call — never a parallel code path — so a typed
 * sentence really drives the live document, exactly like a cloud LLM's tool
 * call would through the MCP bridge. No network, no model download: this is
 * pure JS pattern matching, built to be the floor that always works even with
 * zero connectivity. See docs/CONTROLS.md for why the optional local-LLM upgrade
 * layer described in ROADMAP-PROGRESS.md §24-ب isn't built on top of this. */

export interface InterpretOutcome {
  understood: boolean;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  /** Bilingual explanation — the UI picks one by `state.lang`. On failure, this
   * explains *why* ("لم أفهم الأمر" vs "لم أستطع تحديد العنصر") rather than a
   * single generic message, since those need different user fixes. */
  messageAr: string;
  messageEn: string;
}

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ً-ْٰـ]/g, '') // Arabic tashkeel + tatweel
    .replace(/[أإآ]/g, 'ا') // أ إ آ -> ا
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ة/g, 'ه') // ة -> ه
    .toLowerCase();
}

function tokenize(normalized: string): string[] {
  return normalized.split(/[^\p{L}\p{N}#%.]+/u).filter(Boolean);
}

const CLITIC_PREFIXES = ['و', 'ف', 'ب', 'ك', 'ل'];

/** Every exact form a token could legitimately mean, once Arabic clitics that
 * attach with no space are peeled off: the definite article ("الخط" ~ "خط"),
 * a single-letter preposition ("لتحت" = ل + "تحت"), or a preposition fused with
 * an elided-alif article ("للأخضر" normalizes to "للاخضر" = ل + ال(elided) +
 * "اخضر" — Arabic orthography drops the alif and writes both lams as "لل").
 * Exact-matching against this small variant set (rather than a loose substring
 * search) is what a real morphological analyzer would do more generally; this
 * is deliberately just the few patterns actually seen in command phrasing —
 * see docs/CONTROLS.md for the honest scope of this rule grammar. Returning
 * exact forms (not substrings) is what avoids "نصف" (half) being mistaken for
 * containing "نص" (text). */
function wordVariants(token: string): Set<string> {
  const variants = new Set([token]);
  if (token.startsWith('لل') && token.length > 3) variants.add(token.slice(2));
  if (token.startsWith('ال') && token.length >= 4) variants.add(token.slice(2));
  for (const prefix of CLITIC_PREFIXES) {
    if (token.startsWith(prefix) && token.length > prefix.length + 1) {
      const rest = token.slice(prefix.length);
      variants.add(rest);
      if (rest.startsWith('ال') && rest.length >= 4) variants.add(rest.slice(2));
    }
  }
  return variants;
}

function hasAny(tokens: string[], words: string[]): boolean {
  return tokens.some((t) => {
    const variants = wordVariants(t);
    return words.some((w) => variants.has(w));
  });
}

function extractQuoted(raw: string): string | null {
  const m = raw.match(/["'«»“”‘’]([^"'«»“”‘’]+)["'«»“”‘’]/);
  return m ? m[1].trim() : null;
}

function extractPercent(tokens: string[]): number | null {
  for (const t of tokens) {
    const m = t.match(/^(\d+)%?$/);
    if (m) return Number(m[1]);
  }
  return null;
}

const COLOR_WORDS: Record<string, string> = {
  // المؤنّث كما يُقال فعلًا: «خلّ الخلفية زرقاء» — كانت تمرّ بلا لون فتفشل.
  احمر: '#ef4444', حمراء: '#ef4444', red: '#ef4444',
  اخضر: '#22c55e', خضراء: '#22c55e', green: '#22c55e',
  ازرق: '#3b82f6', زرقاء: '#3b82f6', كحلي: '#1e3a8a', blue: '#3b82f6', navy: '#1e3a8a',
  اصفر: '#eab308', صفراء: '#eab308', yellow: '#eab308',
  اسود: '#111111', سوداء: '#111111', black: '#111111',
  ابيض: '#ffffff', بيضاء: '#ffffff', white: '#ffffff',
  برتقالي: '#f97316', orange: '#f97316',
  بنفسجي: '#a855f7', purple: '#a855f7',
  وردي: '#ec4899', pink: '#ec4899',
  رمادي: '#6b7280', gray: '#6b7280', grey: '#6b7280',
  بني: '#92400e', brown: '#92400e',
  تركواز: '#06b6d4', cyan: '#06b6d4', turquoise: '#06b6d4',
};

function extractColor(tokens: string[]): string | null {
  for (const t of tokens) {
    if (/^#[0-9a-f]{6}$/i.test(t) || /^#[0-9a-f]{3}$/i.test(t)) return t;
    for (const variant of wordVariants(t)) {
      if (COLOR_WORDS[variant]) return COLOR_WORDS[variant];
    }
  }
  return null;
}

type Role = 'title' | 'text' | 'logo' | 'image' | 'badge' | 'shape' | 'background';

const ROLE_WORDS: Record<string, Role> = {
  العنوان: 'title', عنوان: 'title', title: 'title', heading: 'title',
  النص: 'text', نص: 'text', text: 'text',
  الشعار: 'logo', شعار: 'logo', logo: 'logo',
  الصوره: 'image', صوره: 'image', image: 'image', picture: 'image',
  الشاره: 'badge', شاره: 'badge', badge: 'badge',
  الشكل: 'shape', شكل: 'shape', shape: 'shape',
  الخلفيه: 'background', خلفيه: 'background', background: 'background',
};

function extractRole(tokens: string[]): Role | null {
  for (const t of tokens) {
    for (const variant of wordVariants(t)) {
      if (ROLE_WORDS[variant]) return ROLE_WORDS[variant];
    }
  }
  return null;
}

/** أسماءُ الطبقات التي يكتبها المصمّم (أو يحملها القالب) لكلّ دور. */
const ROLE_NAMES: Record<Role, string[]> = {
  title: ['العنوان', 'عنوان', 'title', 'heading'],
  text: [],
  logo: ['الشعار', 'شعار', 'logo'],
  image: ['الصوره', 'صوره', 'صوره المنتج', 'image', 'photo'],
  badge: ['الشاره', 'شاره', 'badge'],
  shape: [],
  background: ['الخلفيه', 'خلفيه', 'background'],
};

function byName(role: Role, elements: DocElement[]): DocElement | null {
  const wanted = ROLE_NAMES[role];
  if (!wanted.length) return null;
  return elements.find((e) => {
    const label = layerLabel(e);
    return label != null && wanted.includes(normalize(label));
  }) ?? null;
}

/** يحوّل كلمةَ دورٍ (أو التحديدَ الحاليّ إن لم تُذكر) إلى عنصرٍ حقيقيّ.
 *
 * ٢٤ أكتوبر ٢٠٢٦: كان «العنوان» يعني «النصَّ المحدَّد إن وُجد» — فـ«كبّر العنوان»
 * والسطرُ الفرعيّ محدَّد كبّر السطرَ الفرعيّ وأخرجه عن اللوحة. الدورُ المذكور
 * باسمه يُطابَق الآن **بالاسم أوّلًا، ثم بالدلالة**، ولا يُستعمل التحديد إلا حين لا
 * يُذكر دورٌ أصلًا («كبّره»، «احذف هذا»). */
function resolveTarget(role: Role | null, elements: DocElement[], selectedIds: string[]): DocElement | null {
  const selected = selectedIds.length ? elements.find((e) => e.id === selectedIds[0]) ?? null : null;
  // `visible`/`locked` قد يغيبان عن عناصرَ قديمة أو مُختبَرة؛ الغيابُ يعني الافتراضيّ.
  const visible = elements.filter((e) => e.visible !== false);
  const textEls = visible.filter((e): e is DocElement & { type: 'text' } => e.type === 'text');
  const imageEls = visible.filter((e): e is DocElement & { type: 'image' } => e.type === 'image');
  const shapeEls = visible.filter((e): e is DocElement & { type: 'shape' } => e.type === 'shape' && !e.locked);
  if (!role) return selected;
  const named = byName(role, elements);
  if (named) return named;

  switch (role) {
    case 'title':
      if (!textEls.length) return null;
      return textEls.reduce((biggest, e) => (e.fontSize > biggest.fontSize ? e : biggest), textEls[0]);
    case 'text':
      return selected?.type === 'text' ? selected : textEls[0] ?? null;
    case 'image':
      return selected?.type === 'image' ? selected : imageEls[0] ?? null;
    case 'logo':
      return selected?.type === 'image' ? selected : imageEls[0] ?? null;
    case 'badge':
    case 'shape':
      return selected?.type === 'shape' ? selected : shapeEls[0] ?? null;
    case 'background':
      // الخلفية ليست عنصرًا في مزيج — `ruleColor` يحوّلها إلى `document_set_background`.
      return null;
    default:
      return selected;
  }
}

interface Plan {
  tool: string;
  args: Record<string, unknown>;
}

/** One rule per verb — returns `null` if `tokens`/`raw` don't match its verb at
 * all (try the next rule), or a `Plan`/explicit failure reason if the verb
 * matched but something else (no resolvable target, wrong element type for the
 * verb, missing value) makes it impossible to run. */
type Rule = (tokens: string[], raw: string, state: { elements: DocElement[]; selectedIds: string[]; sizeIdx: number; customW: number; customH: number }) => Plan | { steps: Plan[] } | { error: string } | null;

const UNDO_WORDS = ['تراجع', 'undo'];
const REDO_WORDS = ['اعاده', 'redo', 'reapply'];
const DELETE_WORDS = ['احذف', 'امسح', 'حذف', 'delete', 'remove'];
const SELECT_WORDS = ['حدد', 'اختر', 'select', 'choose'];
const BIGGER_WORDS = ['كبر', 'زود', 'increase', 'bigger', 'enlarge', 'grow'];
const SMALLER_WORDS = ['صغر', 'قلل', 'decrease', 'smaller', 'shrink'];
const MOVE_WORDS = ['حرك', 'نقل', 'move'];
const DOWN_WORDS = ['تحت', 'اسفل', 'down'];
const UP_WORDS = ['فوق', 'اعلى', 'up'];
const LEFT_WORDS = ['يسار', 'left'];
const RIGHT_WORDS = ['يمين', 'right'];
const OPACITY_WORDS = ['شفافيه', 'شفاف', 'opacity', 'transparent', 'transparency'];
const COLOR_WORDS_SET = ['لون', 'لوّن', 'color', 'colour'];
const FONT_WORDS = ['خط', 'font'];
const ADD_WORDS = ['اضف', 'add'];
const CHANGE_WORDS = ['غير', 'change', 'set', 'rename'];
const PALETTE_WORDS = ['لوحه', 'palette'];
const NEW_DOC_WORDS = ['مستند', 'document', 'project'];
const HELP_WORDS = ['مساعده', 'ساعدني', 'ساعد', 'اوامر', 'help', 'commands'];
const TRACE_WORDS = ['تتبع', 'trace', 'vectorize', 'vectorise'];
const CONVERT_WORDS = ['حول', 'حولها', 'حوله', 'convert', 'turn', 'make', 'سو', 'سوي', 'سوها', 'خل', 'خلي', 'خليها', 'اجعل', 'اعمل', 'اقلب', 'اقلبها'];
const VECTOR_WORDS = ['متجهات', 'متجه', 'فكتور', 'فيكتور', 'vector', 'vectors', 'svg', 'مسارات', 'paths'];

const HELP_MESSAGE_AR =
  'الأوامر المدعومة: تراجع/إعادة، حذف، تحديد، تغيير اللون (نص أو شكل)، تكبير/تصغير الخط أو العنصر، تحريك لأربع جهات، ضبط الشفافية، إضافة نص أو شكل، تغيير نص موجود، تطبيق لوحة ألوان برقمها، تحويل صورة إلى متجهات، ومستند جديد. مثال: «كبّر العنوان» أو «غيّر لون الشكل للأحمر» أو «حوّل الصورة لمتجهات».';
const HELP_MESSAGE_EN =
  'Supported commands: undo/redo, delete, select, change color (text or shape), grow/shrink the font or the element, move in four directions, set opacity, add text or a shape, change existing text, apply a numbered palette, trace an image to vectors, and a new document. Example: "make the title bigger", "change the shape color to red" or "trace the image".';

function ruleNewDocument(tokens: string[]): Plan | null {
  if (!hasAny(tokens, NEW_DOC_WORDS) || !hasAny(tokens, ['جديد', 'new'])) return null;
  return { tool: 'document_new', args: {} };
}

/** «حوّل الصورة لمتجهات» / «تتبّع الشعار» / «سوّها فكتور» / "vectorize the logo" — تتبّع
 * صورةٍ إلى مسارات (`image_trace`). الفعلُ وحده لا يكفي («حوّل» و«خلّ» لهما معانٍ
 * أخرى)، فإمّا «تتبّع» صريحة وإمّا فعلُ تحويلٍ مع كلمةِ متجهات. والهدف صورةٌ دائمًا:
 * الشعارُ المذكور باسمه، أو المحدَّدة، أو أوّل صورةٍ ظاهرة. */
function ruleTrace(tokens: string[], _raw: string, state: Parameters<Rule>[2]) {
  if (!hasAny(tokens, TRACE_WORDS) && !(hasAny(tokens, CONVERT_WORDS) && hasAny(tokens, VECTOR_WORDS))) return null;
  const role = extractRole(tokens);
  const target = resolveTarget(role === 'logo' ? 'logo' : 'image', state.elements, state.selectedIds);
  if (!target || target.type !== 'image' || !target.src) return { error: 'target-image' };
  return { tool: 'image_trace', args: { id: target.id } };
}

function ruleUndo(tokens: string[]): Plan | null {
  return hasAny(tokens, UNDO_WORDS) ? { tool: 'undo', args: {} } : null;
}
function ruleRedo(tokens: string[]): Plan | null {
  return hasAny(tokens, REDO_WORDS) ? { tool: 'redo', args: {} } : null;
}

function ruleDelete(tokens: string[], _raw: string, state: Parameters<Rule>[2]) {
  if (!hasAny(tokens, DELETE_WORDS)) return null;
  const target = resolveTarget(extractRole(tokens), state.elements, state.selectedIds);
  if (!target) return { error: 'target' };
  return { tool: 'element_delete', args: { id: target.id } };
}

function ruleSelect(tokens: string[], _raw: string, state: Parameters<Rule>[2]) {
  if (!hasAny(tokens, SELECT_WORDS)) return null;
  const target = resolveTarget(extractRole(tokens), state.elements, state.selectedIds);
  if (!target) return { error: 'target' };
  return { tool: 'element_select', args: { id: target.id } };
}

/** Must run before `ruleResize`/`ruleSetText` — "غيّر" is shared with those, so
 * the presence of a color keyword + a recognized color word disambiguates it
 * first. */
function ruleColor(tokens: string[], _raw: string, state: Parameters<Rule>[2]) {
  const role = extractRole(tokens);
  const color = extractColor(tokens);
  // «لوّن الشكل…» أو «خلّ الخلفية زرقاء»: كلمةُ اللون وحدها تكفي حين يُذكر دورٌ معها.
  if (!hasAny(tokens, COLOR_WORDS_SET) && !(color && role)) return null;
  if (!color) return { error: 'value' };
  if (role === 'background') return { tool: 'document_set_background', args: { color } };
  const target = resolveTarget(role, state.elements, state.selectedIds);
  if (!target) return { error: 'target' };
  if (target.type === 'text') return { tool: 'element_set_text_style', args: { id: target.id, color } };
  if (target.type === 'shape') return { tool: 'element_set_shape_style', args: { id: target.id, fill: color } };
  return { error: 'unsupported-color-target' };
}

function ruleFontSize(tokens: string[], _raw: string, state: Parameters<Rule>[2]) {
  if (!hasAny(tokens, FONT_WORDS)) return null;
  const bigger = hasAny(tokens, BIGGER_WORDS);
  const smaller = hasAny(tokens, SMALLER_WORDS);
  if (!bigger && !smaller) return null;
  const target = resolveTarget(extractRole(tokens) ?? 'text', state.elements, state.selectedIds);
  if (!target || target.type !== 'text') return { error: 'target' };
  const factor = bigger ? 1.25 : 0.8;
  return { tool: 'element_set_text_style', args: { id: target.id, fontSize: Math.round(target.fontSize * factor) } };
}

/** تكبيرٌ/تصغيرٌ حول المركز ثم حصرٌ داخل اللوحة. كان التحجيم يثبّت الزاوية العليا
 * اليسرى فيمدّ العنصرَ إلى اليمين — وفي تصميمٍ عربيّ يبدأ نصُّه من اليمين، كان هذا
 * يدفعه خارج اللوحة مباشرةً. */
function scaledGeoPx(geo: DocElement['geo'], factor: number, W: number, H: number) {
  // هامشٌ يُحفظ من الحافّة: أصغرُ ما كان للعنصر من الجهتين، بحدٍّ أقصى ٥٪. بدونه كان
  // العنوانُ المكبَّر يلتصق بحافّة اللوحة وإن بقي داخلها.
  const mx = Math.max(0, Math.min(geo.x * W, (1 - geo.x - geo.w) * W, W * 0.05));
  const my = Math.max(0, Math.min(geo.y * H, (1 - geo.y - geo.h) * H, H * 0.05));
  const w = Math.max(1, Math.min(W - 2 * mx, geo.w * W * factor));
  const h = Math.max(1, Math.min(H - 2 * my, geo.h * H * factor));
  const cx = (geo.x + geo.w / 2) * W;
  const cy = (geo.y + geo.h / 2) * H;
  const x = Math.min(Math.max(mx, cx - w / 2), W - mx - w);
  const y = Math.min(Math.max(my, cy - h / 2), H - my - h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function ruleResize(tokens: string[], _raw: string, state: Parameters<Rule>[2]) {
  const bigger = hasAny(tokens, BIGGER_WORDS);
  const smaller = hasAny(tokens, SMALLER_WORDS);
  if (!bigger && !smaller) return null;
  const target = resolveTarget(extractRole(tokens), state.elements, state.selectedIds);
  if (!target) return { error: 'target' };
  const pct = extractPercent(tokens);
  const factor = pct != null ? (bigger ? 1 + pct / 100 : 1 - pct / 100) : bigger ? 1.25 : 0.8;
  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  const geo = scaledGeoPx(target.geo, factor, size.w, size.h);
  // «كبّر العنوان» عند المصمّم يعني خطًّا أكبر، لا صندوقًا أعرض بالخطّ نفسه.
  if (target.type === 'text') {
    return { steps: [
      { tool: 'element_set_geometry', args: { id: target.id, ...geo } },
      { tool: 'element_set_text_style', args: { id: target.id, fontSize: Math.round(target.fontSize * factor * 10) / 10 } },
    ] };
  }
  return { tool: 'element_set_geometry', args: { id: target.id, ...geo } };
}

function ruleMove(tokens: string[], _raw: string, state: Parameters<Rule>[2]) {
  if (!hasAny(tokens, MOVE_WORDS)) return null;
  const target = resolveTarget(extractRole(tokens), state.elements, state.selectedIds);
  if (!target) return { error: 'target' };
  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  const x0 = target.geo.x * size.w;
  const y0 = target.geo.y * size.h;
  const stepX = size.w * 0.1;
  const stepY = size.h * 0.1;
  if (hasAny(tokens, DOWN_WORDS)) return { tool: 'element_set_geometry', args: { id: target.id, y: Math.round(y0 + stepY) } };
  if (hasAny(tokens, UP_WORDS)) return { tool: 'element_set_geometry', args: { id: target.id, y: Math.round(y0 - stepY) } };
  if (hasAny(tokens, LEFT_WORDS)) return { tool: 'element_set_geometry', args: { id: target.id, x: Math.round(x0 - stepX) } };
  if (hasAny(tokens, RIGHT_WORDS)) return { tool: 'element_set_geometry', args: { id: target.id, x: Math.round(x0 + stepX) } };
  return { error: 'direction' };
}

function ruleOpacity(tokens: string[], _raw: string, state: Parameters<Rule>[2]) {
  if (!hasAny(tokens, OPACITY_WORDS)) return null;
  const target = resolveTarget(extractRole(tokens), state.elements, state.selectedIds);
  if (!target) return { error: 'target' };
  const pct = extractPercent(tokens);
  const half = tokens.includes('نصف') || tokens.includes('شبه') || tokens.includes('half');
  const opacity = pct != null ? pct : half ? 50 : null;
  if (opacity == null) return { error: 'value' };
  return { tool: 'element_set_opacity', args: { id: target.id, opacity } };
}

function ruleAddText(tokens: string[], raw: string) {
  if (!hasAny(tokens, ADD_WORDS) || !hasAny(tokens, ['نص', 'text'])) return null;
  const text = extractQuoted(raw);
  if (!text) return { error: 'value' };
  return { tool: 'element_add_text', args: { text } };
}

function ruleAddShape(tokens: string[], _raw: string, state: Parameters<Rule>[2]) {
  if (!hasAny(tokens, ADD_WORDS) || !hasAny(tokens, ['شكل', 'shape', 'مستطيل', 'rect', 'دائره', 'ellipse', 'circle'])) return null;
  const shape = hasAny(tokens, ['دائره', 'ellipse', 'circle']) ? 'ellipse' : 'rect';
  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  const w = Math.round(size.w * 0.3);
  const h = Math.round(size.h * 0.3);
  return { tool: 'element_add_shape', args: { shape, x: Math.round((size.w - w) / 2), y: Math.round((size.h - h) / 2), w, h } };
}

function ruleSetText(tokens: string[], raw: string, state: Parameters<Rule>[2]) {
  if (!hasAny(tokens, CHANGE_WORDS) || !hasAny(tokens, ['نص', 'text'])) return null;
  const text = extractQuoted(raw);
  if (!text) return { error: 'value' };
  const target = resolveTarget('text', state.elements, state.selectedIds);
  if (!target || target.type !== 'text') return { error: 'target' };
  return { tool: 'element_set_text', args: { id: target.id, text } };
}

function rulePalette(tokens: string[]) {
  if (!hasAny(tokens, PALETTE_WORDS)) return null;
  const n = extractPercent(tokens);
  if (n == null) return { error: 'value' };
  return { tool: 'document_set_palette', args: { paletteIndex: n } };
}

const RULES: Rule[] = [
  ruleNewDocument,
  ruleUndo,
  ruleRedo,
  ruleTrace,
  ruleColor,
  ruleFontSize,
  ruleResize,
  ruleMove,
  ruleOpacity,
  ruleDelete,
  ruleSelect,
  ruleAddText,
  ruleAddShape,
  ruleSetText,
  rulePalette,
];

const ERROR_MESSAGES: Record<string, { ar: string; en: string }> = {
  target: { ar: 'لم أستطع تحديد العنصر المطلوب في المستند الحالي.', en: "Couldn't identify the target element in the current document." },
  value: { ar: 'فهمت الأمر لكن لم أجد القيمة المطلوبة (لون/نسبة/نص بين علامتي تنصيص).', en: "Understood the verb, but couldn't find the needed value (a color/percentage/quoted text)." },
  direction: { ar: 'حدد اتجاهاً: لتحت/لفوق/لليسار/لليمين.', en: 'Specify a direction: down/up/left/right.' },
  'unsupported-color-target': { ar: 'تغيير اللون غير متاح على هذا النوع من العناصر.', en: "Changing color isn't supported on this element type." },
  'target-image': { ar: 'لم أجد صورةً أتتبّعها — حدّد صورةً أوّلًا.', en: "Couldn't find an image to trace — select one first." },
};

/** اسمُ العنصر كما يراه المصمّم: اسمُ الطبقة، أو مطلعُ النص، أو نوعُه. */
function displayName(el: DocElement | undefined, ar: boolean): string {
  if (!el) return ar ? 'العنصر' : 'the element';
  const label = layerLabel(el);
  if (label) return label;
  if (el.type === 'text') {
    const t = el.text.replace(/\s+/g, ' ').trim();
    return t.length > 22 ? `${t.slice(0, 21)}…` : t;
  }
  const ar_ = { shape: 'الشكل', image: 'الصورة', lottie: 'الحركة', video: 'الفيديو' } as Record<string, string>;
  const en_ = { shape: 'the shape', image: 'the image', lottie: 'the animation', video: 'the video' } as Record<string, string>;
  return (ar ? ar_ : en_)[el.type] ?? (ar ? 'العنصر' : 'the element');
}

/** جملةُ الردّ: ما الذي تغيّر وعلى أيّ عنصر، بلغة المصمّم. كان الردّ وصفَ الأداة
 * («تم: نقل/تحجيم/تدوير عنصر — بالبكسل، نسبةً لمقاس اللوحة الحالي»)، فلا يعرف
 * المستخدم من الردّ أيَّ عنصرٍ تغيّر — وهو بالضبط ما كان يحتاج أن يعرفه حين أخطأ. */
function describe(plans: Plan[], before: DocElement[], tokens: string[], result?: unknown): { ar: string; en: string } {
  const p = plans[0];
  const el = before.find((e) => e.id === p.args.id);
  const nA = `«${displayName(el, true)}»`;
  const nE = `"${displayName(el, false)}"`;
  const bigger = hasAny(tokens, BIGGER_WORDS);
  switch (p.tool) {
    case 'document_set_background':
      return { ar: 'غيّرت لون الخلفية.', en: 'Changed the background color.' };
    case 'image_trace': {
      const r = (result ?? {}) as { shapes?: number; colors?: string[] };
      const n = r.shapes ?? 0;
      const c = r.colors?.length ?? 0;
      return {
        ar: `حوّلت ${nA} إلى متجهات: ${n} شكل بـ${c} ألوان، كلّها في مجموعة محدَّدة الآن. الصورة الأصلية مخفيّة تحتها — ترجعها من الطبقات.`,
        en: `Traced ${nE} into ${n} vector shapes in ${c} colors, grouped and selected. The original image is hidden underneath — unhide it from Layers.`,
      };
    }
    case 'element_set_text_style':
      if (plans.length > 1 || typeof p.args.fontSize === 'number')
        return bigger ? { ar: `كبّرت ${nA}.`, en: `Enlarged ${nE}.` } : { ar: `صغّرت ${nA}.`, en: `Shrank ${nE}.` };
      return { ar: `غيّرت لون ${nA}.`, en: `Changed the color of ${nE}.` };
    case 'element_set_shape_style':
      return { ar: `غيّرت لون ${nA}.`, en: `Changed the color of ${nE}.` };
    case 'element_set_geometry':
      if ('w' in p.args) return bigger ? { ar: `كبّرت ${nA}.`, en: `Enlarged ${nE}.` } : { ar: `صغّرت ${nA}.`, en: `Shrank ${nE}.` };
      return { ar: `حرّكت ${nA}.`, en: `Moved ${nE}.` };
    case 'element_set_opacity':
      return { ar: `ضبطت شفافية ${nA} على ${p.args.opacity}٪.`, en: `Set ${nE} opacity to ${p.args.opacity}%.` };
    case 'element_delete':
      return { ar: `حذفت ${nA}.`, en: `Deleted ${nE}.` };
    case 'element_select':
      return { ar: `حدّدت ${nA}.`, en: `Selected ${nE}.` };
    case 'element_set_text':
      return { ar: `غيّرت نص ${nA}.`, en: `Changed the text of ${nE}.` };
    case 'element_add_text':
      return { ar: 'أضفت نصًّا جديدًا.', en: 'Added a new text.' };
    case 'element_add_shape':
      return { ar: 'أضفت شكلًا جديدًا في المنتصف.', en: 'Added a new shape in the center.' };
    case 'document_set_palette':
      return { ar: `طبّقت اللوحة اللونية رقم ${p.args.paletteIndex}.`, en: `Applied palette ${p.args.paletteIndex}.` };
    case 'document_new':
      return { ar: 'فتحت لوحة فارغة.', en: 'Opened a blank artboard.' };
    case 'undo':
      return { ar: 'تراجعت عن آخر خطوة.', en: 'Undid the last step.' };
    case 'redo':
      return { ar: 'أعدت الخطوة.', en: 'Redid the step.' };
    default:
      return { ar: 'تم.', en: 'Done.' };
  }
}

const NOT_UNDERSTOOD = {
  ar: 'لم أفهم الأمر. أفهم هنا أوامر قصيرة مثل: «كبّر العنوان»، «خلّ الخلفية زرقاء»، «لوّن الشارة بالأحمر»، «حرّك الشعار لتحت». للطلبات الحرّة اختر Claude أو Codex من أعلى اللوحة.',
  en: 'I didn\'t understand. Locally I handle short commands like "enlarge the title", "make the background blue", "move the logo down". For free-form requests pick Claude or Codex at the top of the panel.',
};

/** Runs one natural-language sentence against the real document — matches a
 * rule, resolves a real tool+args, and calls that tool's actual `run` (the same
 * function the MCP bridge calls for a remote `tools/call`). Never fabricates a
 * result: a failure to match or resolve returns `understood: false` with a
 * specific reason, not a fake success. */
export async function interpretAndRun(text: string, ctx: McpCtx): Promise<InterpretOutcome> {
  const raw = text.trim();
  if (!raw) return { understood: false, messageAr: 'اكتب أمراً أولاً.', messageEn: 'Type a command first.' };

  const norm = normalize(raw);
  const tokens = tokenize(norm);
  // صريحٌ قبل أي قاعدة فعل: «مساعدة» ليست أمرًا على المستند، فلا تمرّ بأي أداة
  // MCP ولا تحتاج حالةً أصلًا — تشرح هذه القواعد الثابتة نفسها، لا أكثر.
  if (hasAny(tokens, HELP_WORDS)) {
    return { understood: true, messageAr: HELP_MESSAGE_AR, messageEn: HELP_MESSAGE_EN };
  }
  const state = ctx.getState();
  const ruleState = { elements: state.elements, selectedIds: state.selectedIds, sizeIdx: state.sizeIdx, customW: state.customW, customH: state.customH };

  for (const rule of RULES) {
    const outcome = rule(tokens, raw, ruleState);
    if (outcome === null) continue;
    if ('error' in outcome) {
      const msg = ERROR_MESSAGES[outcome.error] ?? ERROR_MESSAGES.target;
      return { understood: false, messageAr: msg.ar, messageEn: msg.en };
    }
    const plans: Plan[] = 'steps' in outcome ? outcome.steps : [outcome];
    let result: unknown;
    try {
      for (const plan of plans) {
        const tool = MCP_TOOLS.find((t) => t.name === plan.tool);
        if (!tool) return { understood: false, messageAr: 'أداة غير معروفة.', messageEn: 'Unknown tool.' };
        result = await tool.run(plan.args, ctx);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { understood: false, messageAr: `فشل التنفيذ: ${msg}`, messageEn: `Execution failed: ${msg}` };
    }
    const said = describe(plans, state.elements, tokens, result);
    return { understood: true, tool: plans[0].tool, args: plans[0].args, result, messageAr: said.ar, messageEn: said.en };
  }

  return { understood: false, messageAr: NOT_UNDERSTOOD.ar, messageEn: NOT_UNDERSTOOD.en };
}
