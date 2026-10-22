import type { McpCtx } from './mcpTools';
import { MCP_TOOLS } from './mcpTools';
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
  احمر: '#ef4444', red: '#ef4444',
  اخضر: '#22c55e', green: '#22c55e',
  ازرق: '#3b82f6', blue: '#3b82f6',
  اصفر: '#eab308', yellow: '#eab308',
  اسود: '#111111', black: '#111111',
  ابيض: '#ffffff', white: '#ffffff',
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

/** Resolves a role keyword (or, absent one, the current selection) to a real
 * element — never invented, always one of `ctx.getState().elements`. */
function resolveTarget(role: Role | null, elements: DocElement[], selectedIds: string[]): DocElement | null {
  const selected = selectedIds.length ? elements.find((e) => e.id === selectedIds[0]) ?? null : null;
  const textEls = elements.filter((e): e is DocElement & { type: 'text' } => e.type === 'text');
  const imageEls = elements.filter((e): e is DocElement & { type: 'image' } => e.type === 'image');
  const shapeEls = elements.filter((e): e is DocElement & { type: 'shape' } => e.type === 'shape');

  switch (role) {
    case 'title': {
      if (selected?.type === 'text') return selected;
      if (!textEls.length) return null;
      return textEls.reduce((biggest, e) => (e.fontSize > biggest.fontSize ? e : biggest), textEls[0]);
    }
    case 'text':
      return selected?.type === 'text' ? selected : textEls[0] ?? null;
    case 'logo':
    case 'image':
      return selected?.type === 'image' ? selected : imageEls[0] ?? null;
    case 'badge':
    case 'shape':
      return selected?.type === 'shape' ? selected : shapeEls[0] ?? null;
    case 'background': {
      if (!elements.length) return null;
      return elements.reduce((biggest, e) => (e.geo.w * e.geo.h > biggest.geo.w * biggest.geo.h ? e : biggest), elements[0]);
    }
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
type Rule = (tokens: string[], raw: string, state: { elements: DocElement[]; selectedIds: string[]; sizeIdx: number; customW: number; customH: number }) => Plan | { error: string } | null;

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

const HELP_MESSAGE_AR =
  'الأوامر المدعومة: تراجع/إعادة، حذف، تحديد، تغيير اللون (نص أو شكل)، تكبير/تصغير الخط أو العنصر، تحريك لأربع جهات، ضبط الشفافية، إضافة نص أو شكل، تغيير نص موجود، تطبيق لوحة ألوان برقمها، ومستند جديد. مثال: «كبّر العنوان» أو «غيّر لون الشكل للأحمر».';
const HELP_MESSAGE_EN =
  'Supported commands: undo/redo, delete, select, change color (text or shape), grow/shrink the font or the element, move in four directions, set opacity, add text or a shape, change existing text, apply a numbered palette, and a new document. Example: "make the title bigger" or "change the shape color to red".';

function ruleNewDocument(tokens: string[]): Plan | null {
  if (!hasAny(tokens, NEW_DOC_WORDS) || !hasAny(tokens, ['جديد', 'new'])) return null;
  return { tool: 'document_new', args: {} };
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
  if (!hasAny(tokens, COLOR_WORDS_SET)) return null;
  const color = extractColor(tokens);
  if (!color) return { error: 'value' };
  const target = resolveTarget(extractRole(tokens), state.elements, state.selectedIds);
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

function ruleResize(tokens: string[], _raw: string, state: Parameters<Rule>[2]) {
  const bigger = hasAny(tokens, BIGGER_WORDS);
  const smaller = hasAny(tokens, SMALLER_WORDS);
  if (!bigger && !smaller) return null;
  const target = resolveTarget(extractRole(tokens), state.elements, state.selectedIds);
  if (!target) return { error: 'target' };
  const pct = extractPercent(tokens);
  const factor = pct != null ? (bigger ? 1 + pct / 100 : 1 - pct / 100) : bigger ? 1.25 : 0.8;
  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  const w = Math.max(1, Math.round(target.geo.w * size.w * factor));
  const h = Math.max(1, Math.round(target.geo.h * size.h * factor));
  return { tool: 'element_set_geometry', args: { id: target.id, w, h } };
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

const RULES: ((tokens: string[], raw: string, state: Parameters<Rule>[2]) => ReturnType<Rule>)[] = [
  ruleNewDocument,
  ruleUndo,
  ruleRedo,
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
    const tool = MCP_TOOLS.find((t) => t.name === outcome.tool);
    if (!tool) return { understood: false, messageAr: 'أداة غير معروفة.', messageEn: 'Unknown tool.' };
    try {
      const result = await tool.run(outcome.args, ctx);
      return {
        understood: true,
        tool: outcome.tool,
        args: outcome.args,
        result,
        messageAr: `تم: ${tool.descriptionAr}`,
        messageEn: `Done: ${tool.descriptionEn}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { understood: false, messageAr: `فشل التنفيذ: ${msg}`, messageEn: `Execution failed: ${msg}` };
    }
  }

  return { understood: false, messageAr: 'لم أفهم الأمر.', messageEn: "Didn't understand the command." };
}
