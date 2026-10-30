import type { ElementAnim, PropertyKeyframe, StaggerDirection, StaggerEffect, StaggerUnit, TextStaggerAnim } from '../state/elements';
import { animTimeAt } from './animTimeline';
import { applyEasing } from './easing';

// TS's ES2020 lib (this project's `tsconfig.json` target) doesn't ship `Intl.Segmenter`
// typings; the runtime (every browser this app targets, and Node ≥16 for the QA specs)
// has supported it for years. A minimal ambient declaration here avoids widening the
// project's `lib` array (which would pull in unrelated ES2022 globals) just for this.
declare global {
  namespace Intl {
    interface SegmentData {
      segment: string;
      index: number;
      input: string;
      isWordLike?: boolean;
    }
    class Segmenter {
      constructor(locales?: string | string[], options?: { granularity?: 'grapheme' | 'word' | 'sentence' });
      segment(input: string): Iterable<SegmentData>;
    }
  }
}

export interface TextToken {
  text: string;
  /** Sequential index (0..N-1) in natural logical-string order among only the
   * "content" tokens — null for whitespace/separator tokens, which never animate
   * (always rendered fully shown) so stray/duplicated whitespace between the DOM's
   * raw string and any other consumer's own re-wrapping can never desync which
   * units actually animate or in what order. */
  orderIndex: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// الحرفُ العربيّ لا يُرسَم وحده — ٢٥ أكتوبر ٢٠٢٦
// ─────────────────────────────────────────────────────────────────────────────
//
// **ما كان.** وحدةُ «حرف» تضع كلَّ عنقودٍ في `<span style="display:inline-block">`
// (المعاينة) وفي `fillText` مستقلّ (القُماش). والكتلةُ المستقلّة يُشكَّل نصُّها وحده،
// فكلُّ حرفٍ عربيٍّ يُرسَم **بصورته المفردة**: «سيف» تخرج «س ي ف» مقطّعة — مقيسٌ في
// Chromium بخطّ أميري: عرضُ الحروف المفردة مجموعًا ٦٣٧ بكسلًا لسطرٍ عرضُه الحقيقيّ ٤٧٦.
// وكان `docs/CONTROLS.md` يذكر لام-ألف وحدها فجوةً مؤجَّلة؛ والقطعُ أعمّ منها.
//
// **والحلّ: صورةُ الحرف من سياقه، بمحارف الوصل.** `U+200D` (ZWJ) محرفٌ لا عرضَ له يطلب
// الوصلَ من جهته: «‍ب‍» تُرسَم بصورة الباء الوسطى وإن رُسِمت وحدها. فلكلّ عنقودٍ نحسب:
// أيتّصل بما قبله؟ أيتّصل بما بعده؟ — من **نوع الوصل** في يونيكود (`Joining_Type`)
// لحرفه ولجاريه — ثم نُحيطه بـZWJ من الجهة الموصولة. فيُرسَم الحرفُ وحده بالصورة التي
// كان يأخذها في الكلمة، ويتلاقى طرفا الوصل كما في النصّ الكامل (مقيسٌ: ٤٩٤ بكسلًا
// للحروف مجموعةً مقابل ٤٧٦، والفرقُ من روابط الخطّ الاختياريّة أدناه).
//
// **ولام-ألف وحدةٌ واحدة.** هي ربطةٌ **إلزاميّة** (`rlig`): لامٌ وألفٌ متتاليان لا
// يُرسمان إلّا رسمًا واحدًا «لا». فإن فُصلا رُسمت لامٌ وسطى وألفٌ أخيرة — صورةٌ ليست في
// الخطّ أصلًا. فيُدمَجان في وحدةٍ واحدة، وهو ما يراه القارئ: حرفًا واحدًا.
//
// **وما لا يحفظه الرسمُ حرفًا حرفًا (حدٌّ معلَن):** الروابطُ **الاختياريّة** في بعض
// الخطوط (أميري يركّب «مجـ» فوق بعضها) والتقنينُ بين حرفين. لا سبيلَ إليهما وكلُّ حرفٍ
// يتحرّك وحده؛ وأثرُ «الكتابة» (`type`) أدناه يحفظهما لأنه يُشكّل النصَّ الظاهر كلَّه.

const ZWJ = '‍';
const ZWNJ = '‌';

/** نوعُ الوصل في يونيكود (`ArabicShaping.txt`): `D` يتّصل من الجهتين، `R` بما قبله وحده،
 * `C` يُسبّب الوصل (التطويل وZWJ)، `T` شفّاف (الحركات — تُتخطّى)، `U` لا يتّصل. */
type JoiningType = 'D' | 'R' | 'C' | 'T' | 'U';

/** جدولُ الكتلة العربيّة وملحقها (`U+0600–U+06FF`، `U+0750–U+077F`، `U+08A0–U+08FF`)
 * مداياتٍ متّصلة — `[أوّل, آخر, النوع]`. وما سواه `U`، ومنه الحروفُ اللاتينيّة: فنصٌّ
 * لاتينيٌّ لا يكتسب محرفَ وصلٍ واحدًا، ويُرسَم حرفًا حرفًا كما كان بالبايت. */
const JOINING_RANGES: [number, number, JoiningType][] = [
  [0x0610, 0x061a, 'T'],
  [0x0620, 0x0620, 'D'],
  [0x0622, 0x0625, 'R'],
  [0x0626, 0x0626, 'D'],
  [0x0627, 0x0627, 'R'],
  [0x0628, 0x0628, 'D'],
  [0x0629, 0x0629, 'R'],
  [0x062a, 0x062e, 'D'],
  [0x062f, 0x0632, 'R'],
  [0x0633, 0x063f, 'D'],
  [0x0640, 0x0640, 'C'],
  [0x0641, 0x0647, 'D'],
  [0x0648, 0x0648, 'R'],
  [0x0649, 0x064a, 'D'],
  [0x064b, 0x065f, 'T'],
  [0x066e, 0x066f, 'D'],
  [0x0670, 0x0670, 'T'],
  [0x0671, 0x0673, 'R'],
  [0x0675, 0x0677, 'R'],
  [0x0678, 0x0687, 'D'],
  [0x0688, 0x0699, 'R'],
  [0x069a, 0x06bf, 'D'],
  [0x06c0, 0x06c0, 'R'],
  [0x06c1, 0x06c2, 'D'],
  [0x06c3, 0x06cb, 'R'],
  [0x06cc, 0x06cc, 'D'],
  [0x06cd, 0x06cd, 'R'],
  [0x06ce, 0x06ce, 'D'],
  [0x06cf, 0x06cf, 'R'],
  [0x06d0, 0x06d1, 'D'],
  [0x06d2, 0x06d3, 'R'],
  [0x06d5, 0x06d5, 'R'],
  [0x06d6, 0x06dc, 'T'],
  [0x06df, 0x06e4, 'T'],
  [0x06e7, 0x06e8, 'T'],
  [0x06ea, 0x06ed, 'T'],
  [0x06ee, 0x06ef, 'R'],
  [0x06fa, 0x06fc, 'D'],
  [0x06ff, 0x06ff, 'D'],
  [0x0750, 0x0758, 'D'],
  [0x0759, 0x075b, 'R'],
  [0x075c, 0x076a, 'D'],
  [0x076b, 0x076c, 'R'],
  [0x076d, 0x0770, 'D'],
  [0x0771, 0x0771, 'R'],
  [0x0772, 0x0772, 'D'],
  [0x0773, 0x0774, 'R'],
  [0x0775, 0x0777, 'D'],
  [0x0778, 0x0779, 'R'],
  [0x077a, 0x077f, 'D'],
  [0x08a0, 0x08a9, 'D'],
  [0x08aa, 0x08ac, 'R'],
  [0x08ae, 0x08ae, 'R'],
  [0x08af, 0x08b0, 'D'],
  [0x08b1, 0x08b2, 'R'],
  [0x08b3, 0x08b4, 'D'],
  [0x08b6, 0x08b8, 'D'],
  [0x08b9, 0x08b9, 'R'],
  [0x08ba, 0x08c7, 'D'],
  [0x08ca, 0x08e1, 'T'],
  [0x08e3, 0x08ff, 'T'],
  [0x200d, 0x200d, 'C'],
];

export function joiningTypeOf(cp: number): JoiningType {
  let lo = 0;
  let hi = JOINING_RANGES.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [a, b, t] = JOINING_RANGES[mid];
    if (cp < a) hi = mid - 1;
    else if (cp > b) lo = mid + 1;
    else return t;
  }
  return 'U';
}

/** نوعا وصل العنقود من جهتيه: أوّلُ حرفٍ غيرِ شفّافٍ فيه لجهة ما قبله، وآخرُها لجهة ما
 * بعده. والعنقودُ عنقودُ يونيكود (حرفٌ وحركاته) أو لام-ألف المدموجة. */
function clusterJoining(text: string): { first: JoiningType; last: JoiningType } {
  let first: JoiningType = 'U';
  let last: JoiningType = 'U';
  let seen = false;
  for (const ch of text) {
    const t = joiningTypeOf(ch.codePointAt(0)!);
    if (t === 'T') continue;
    if (!seen) {
      first = t;
      seen = true;
    }
    last = t;
  }
  return { first, last };
}

const joinsForward = (t: JoiningType) => t === 'D' || t === 'C';
const joinsBackward = (t: JoiningType) => t === 'D' || t === 'R' || t === 'C';

const LAM = 0x0644;
/** الألفاتُ التي تُكوِّن مع اللام ربطةً إلزاميّة: ا آ أ إ ٱ. */
const ALEFS = new Set([0x0627, 0x0622, 0x0623, 0x0625, 0x0671]);

function baseCodePoint(cluster: string): number | null {
  for (const ch of cluster) {
    const cp = ch.codePointAt(0)!;
    if (joiningTypeOf(cp) !== 'T') return cp;
  }
  return null;
}

/** عناقيدُ يونيكود، ولام-ألف عنقودٌ واحد (انظر أعلى القسم). */
function letterClusters(text: string): string[] {
  const out: string[] = [];
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    const prev = out.length ? out[out.length - 1] : null;
    if (prev !== null && baseCodePoint(prev) === LAM && prev.length <= 3) {
      const b = baseCodePoint(segment);
      if (b !== null && ALEFS.has(b)) {
        out[out.length - 1] = prev + segment;
        continue;
      }
    }
    out.push(segment);
  }
  return out;
}

/** Splits `text` into an ordered token sequence for the 'char'/'word' stagger units,
 * via `Intl.Segmenter` — not `split('')`/`split(' ')` — so combining marks and
 * diacritics (Arabic tashkeel sits on its base letter as one grapheme cluster) and
 * multi-codepoint clusters are never torn apart, and word boundaries follow Unicode
 * text segmentation rather than a naive whitespace split.
 *
 * **وحدةُ «حرف»** تدمج لام-ألف في عنقودٍ واحد (ربطةٌ إلزاميّة — انظر أعلى القسم).
 *
 * **ووحدةُ «كلمة»** تُلحِق علامةَ الترقيم والرمزَ التعبيريّ الملاصقَين لكلمةٍ بها: كانت
 * «والقوة.» كلمةً متحرّكةً ونقطةً **ظاهرةً دائمًا** قبل أن تظهر كلمتُها، و«اليوم📅» كلمةً
 * ورمزًا ثابتًا. فالملاصقُ لما قبله يلحق به، وإلّا فبما بعده، والمنفصلُ بمسافةٍ من
 * الجهتين وحدةٌ وحده (رمزٌ تعبيريٌّ بعد مسافة يظهر في دوره). */
export function tokenizeText(text: string, unit: 'char' | 'word'): TextToken[] {
  if (unit === 'char') {
    const tokens: TextToken[] = [];
    let order = 0;
    for (const segment of letterClusters(text)) {
      const isContent = segment.trim().length > 0;
      tokens.push({ text: segment, orderIndex: isContent ? order++ : null });
    }
    return tokens;
  }
  // كلمات: قطعٌ ثلاثة الأنواع — مسافة، كلمة، وما سواهما (ترقيمٌ ورموز).
  const raw = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].map((s) => ({
    text: s.segment,
    kind: s.segment.trim() === '' ? ('space' as const) : s.isWordLike ? ('word' as const) : ('other' as const),
  }));
  const merged: { text: string; content: boolean }[] = [];
  for (let i = 0; i < raw.length; i++) {
    const seg = raw[i];
    if (seg.kind === 'space') {
      merged.push({ text: seg.text, content: false });
      continue;
    }
    const prev = merged.length ? merged[merged.length - 1] : null;
    // آخرُ المدموج وحدةٌ = لا مسافةَ بينه وبين هذه القطعة (المسافةُ تُدفَع مدخلًا غيرَ وحدة).
    if (seg.kind === 'other' && prev && prev.content) {
      prev.text += seg.text; // ملاصقٌ لما قبله
      continue;
    }
    if (seg.kind === 'other') {
      // ملاصقٌ لما بعده؟ يتقدّمه فيصيران وحدةً واحدة (قوسُ «كلمة» الأوّلُ يظهر معها).
      let j = i;
      let acc = '';
      while (j < raw.length && raw[j].kind === 'other') acc += raw[j++].text;
      if (j < raw.length && raw[j].kind === 'word') {
        merged.push({ text: acc + raw[j].text, content: true });
        i = j;
        continue;
      }
      merged.push({ text: acc, content: true });
      i = j - 1;
      continue;
    }
    // كلمة: وحدةٌ دائمًا، ولو لاصقت رمزًا أُلحِق بما قبلها («كلمة-كلمة» وحدتان كما كانت).
    merged.push({ text: seg.text, content: true });
  }
  let order = 0;
  return merged.map((m) => ({ text: m.text, orderIndex: m.content ? order++ : null }));
}

/** Splits on explicit newlines for the 'line' unit — the lines the user actually
 * authored (Shift+Enter), not the browser's own auto-wrap breakpoints. There is no
 * reliable way to learn those without a layout measurement pass shared between the
 * DOM preview and the canvas exporter, so 'line' stagger is scoped, deliberately and
 * documented in `docs/CONTROLS.md`, to authored line breaks: a single-line text
 * element has exactly one 'line' unit. */
export function tokenizeLines(text: string): TextToken[] {
  return text.split('\n').map((line, i) => ({ text: line, orderIndex: i }));
}

export function totalUnits(tokens: TextToken[]): number {
  let max = -1;
  for (const t of tokens) if (t.orderIndex !== null && t.orderIndex > max) max = t.orderIndex;
  return max + 1;
}

/** عددُ وحدات الظهور في هذا النصّ بهذه الوحدة — مدى مسار «الظهور» وعدّادُ «٣ من ٥». */
export function revealUnitCount(text: string, unit: StaggerUnit): number {
  return totalUnits(unit === 'line' ? tokenizeLines(text) : tokenizeText(text, unit));
}

/** Deterministic seeded PRNG (mulberry32) — 'random' direction must reproduce
 * identically across the live preview, a re-render, and every exported video frame;
 * `Math.random()` would reshuffle on every call and make a video's characters
 * appear in a different order frame to frame. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return h;
}

/** Maps each unit's natural order index (0..N-1) onto its stagger *rank* (0..N-1 —
 * the multiplier applied to `stagger` seconds to get that unit's own start delay),
 * according to `direction`: 'start' plays in natural reading order, 'end' reverses
 * it so the last unit starts first, 'center' expands outward from the middle unit,
 * and 'random' uses a seeded shuffle keyed by `seedKey` (the element id) — same
 * document, same shuffle, every time. */
export function staggerRanks(n: number, direction: StaggerDirection, seedKey: string): number[] {
  const indices = Array.from({ length: n }, (_, i) => i);
  if (direction === 'start') return indices;
  if (direction === 'end') return indices.map((i) => n - 1 - i);
  if (direction === 'center') {
    const mid = (n - 1) / 2;
    const byDistance = [...indices].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
    const rankOf = new Array<number>(n);
    byDistance.forEach((idx, rank) => (rankOf[idx] = rank));
    return rankOf;
  }
  // random
  const rand = mulberry32(hashSeed(seedKey));
  const shuffled = [...indices];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const rankOf = new Array<number>(n);
  shuffled.forEach((idx, rank) => (rankOf[idx] = rank));
  return rankOf;
}

export interface StaggerToken {
  text: string;
  /** null = never animates (always fully shown) — whitespace/separator tokens. */
  rank: number | null;
  /** **ما يُرسَم حين تُرسَم الوحدةُ وحدها**: نصُّها محاطًا بمحرف الوصل (ZWJ) من كلّ جهةٍ
   * يتّصل فيها بجاره في النصّ الكامل — فيُرسَم الحرفُ العربيّ بصورته في كلمته (انظر أعلى
   * القسم). وفي غير وحدة «حرف»، وللّاتينيّ، هو `text` نفسُه. */
  shaped: string;
  /** ترتيبُ الوحدة الطبيعيّ (ترتيبُ القراءة) — أثرُ «الكتابة» يُظهر بادئةً بهذا الترتيب. */
  order: number | null;
}

/** أيُّ الوحدات تُرسَم بترتيب القراءة مهما كان الاتّجاه المختار؟ «الكتابة» وحدها: تُظهر
 * **بادئةَ** النصّ، والبادئةُ لا معنى لها بترتيبٍ عشوائيٍّ أو من الوسط. */
export function effectiveDirection(cfg: Pick<TextStaggerAnim, 'direction' | 'effect'>): StaggerDirection {
  return cfg.effect === 'type' ? 'start' : cfg.direction;
}

/** Builds the ordered token list *and* assigns each content token's stagger rank in
 * one pass — the single function both the DOM preview (`ElementView`) and the canvas
 * frame renderer (`exportArtboard.ts`) call, so neither can disagree with the other
 * about which characters/words animate, or in what order. */
export function buildStaggerTokens(text: string, cfg: Pick<TextStaggerAnim, 'unit' | 'direction'> & Partial<Pick<TextStaggerAnim, 'effect'>>, seedKey: string): StaggerToken[] {
  const raw = cfg.unit === 'line' ? tokenizeLines(text) : tokenizeText(text, cfg.unit);
  const n = totalUnits(raw);
  const shapedOf = (i: number): string => {
    const t = raw[i].text;
    if (cfg.unit !== 'char' || raw[i].orderIndex === null) return t;
    const me = clusterJoining(t);
    const prev = i > 0 ? clusterJoining(raw[i - 1].text) : null;
    const next = i < raw.length - 1 ? clusterJoining(raw[i + 1].text) : null;
    const joinPrev = !!prev && joinsForward(prev.last) && joinsBackward(me.first);
    const joinNext = !!next && joinsForward(me.last) && joinsBackward(next.first);
    return (joinPrev ? ZWJ : '') + t + (joinNext ? ZWJ : '');
  };
  if (n === 0) return raw.map((t, i) => ({ text: t.text, rank: null, shaped: shapedOf(i), order: null }));
  const ranks = staggerRanks(n, effectiveDirection({ direction: cfg.direction, effect: cfg.effect ?? 'fade' }), seedKey);
  return raw.map((t, i) => ({ text: t.text, rank: t.orderIndex === null ? null : ranks[t.orderIndex], shaped: shapedOf(i), order: t.orderIndex }));
}

export interface UnitVisual {
  opacity: number;
  /** إزاحةٌ أفقيّة كسرًا من حجم خطّ الوحدة — موجبُها يمين. لا يستعملها إلا «تجمّع». */
  translateX: number;
  /** Fraction of the unit's own font size — positive moves it down. */
  translateY: number;
  scale: number;
  rotateDeg: number;
  /** نصفُ قطر الضبابيّة **كسرًا من حجم الخطّ** — `em` في المعاينة، و`× fontPx` في القُماش. */
  blur: number;
}

export const SHOWN_UNIT_VISUAL: UnitVisual = { opacity: 1, translateX: 0, translateY: 0, scale: 1, rotateDeg: 0, blur: 0 };
export const HIDDEN_UNIT_VISUAL: UnitVisual = { opacity: 0, translateX: 0, translateY: 0, scale: 1, rotateDeg: 0, blur: 0 };

/** أثرٌ **فوريّ**: الوحدةُ غائبةٌ ثم حاضرةٌ في إطارٍ واحد، بلا مدّة. «فوري» يُظهر الوحدةَ
 * بصورتها في النصّ الكامل، و«الكتابة» تُظهر **البادئةَ مُشكَّلةً وحدها** (آخرُ حروفها
 * بصورته الأخيرة، كما يرى من يكتب). */
export function isInstantEffect(effect: StaggerEffect): boolean {
  return effect === 'none' || effect === 'type';
}

/** The single effect formula shared by the DOM preview and the canvas frame
 * renderer, given a unit's already-eased 0..1 reveal progress. Composes with (never
 * replaces) the element-level `resolveAnimAt` opacity/transform — see
 * `docs/CONTROLS.md` for how the two animation layers combine. */
export function unitVisualAt(effect: StaggerEffect, progress: number, rank = 0): UnitVisual {
  const p = Math.max(0, Math.min(1, progress));
  switch (effect) {
    // (٣٠ أكتوبر) «تجمّع»: كلُّ وحدةٍ تبدأ قطعةً صغيرةً مضبّبةً في موضعٍ متناثرٍ ثابتٍ (مشتقٍّ من
    // رتبتها، فالإطارُ نفسه يُرسَم مرّتين بالشكل نفسه في المعاينة والتصدير) ثم تلتئم في مكانها.
    case 'gather': {
      const h1 = seeded(rank * 2 + 1);
      const h2 = seeded(rank * 2 + 2);
      const ang = h1 * Math.PI * 2;
      const dist = 2.5 + h2 * 3.5;
      const k = (1 - p) * (1 - p);
      return {
        opacity: Math.min(1, p * 4),
        translateX: Math.cos(ang) * dist * k,
        translateY: Math.sin(ang) * dist * k,
        scale: 0.25 + 0.75 * p,
        rotateDeg: (h2 - 0.5) * 240 * (1 - p),
        blur: (1 - p) * 0.12,
      };
    }
    case 'slide':
      return { opacity: p, translateX: 0, translateY: (1 - p) * 0.45, scale: 1, rotateDeg: 0, blur: 0 };
    case 'scale':
      return { opacity: p, translateX: 0, translateY: 0, scale: 0.3 + 0.7 * p, rotateDeg: 0, blur: 0 };
    case 'rotate':
      return { opacity: p, translateX: 0, translateY: 0, scale: 1, rotateDeg: (1 - p) * -40, blur: 0 };
    // تنقشع من ضبابيّةٍ نصفُ قطرها ثلثُ حجم الخطّ — تكفي لمحو الحرف ولا تفيض على جاره كثيرًا.
    case 'blur':
      return { opacity: p, translateX: 0, translateY: 0, scale: 1, rotateDeg: 0, blur: (1 - p) * 0.3 };
    case 'none':
    case 'type':
      return p > 0 ? SHOWN_UNIT_VISUAL : HIDDEN_UNIT_VISUAL;
    case 'fade':
    default:
      return { opacity: p, translateX: 0, translateY: 0, scale: 1, rotateDeg: 0, blur: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// توقيتُ كلّ وحدةٍ بمفاتيح — مسارُ «الظهور» (٢٥ أكتوبر ٢٠٢٦)
// ─────────────────────────────────────────────────────────────────────────────
//
// **لِمَ.** المقطعُ المطلوب نسخُه يُظهر النصَّ **كلمةً كلمةً مع صوت الراوي**: «حطيـــت»
// عند الإطار ٦، «الاجرب» عند ١٨، «لي» عند ٣٢… — فواصلُ غيرُ متساوية تتبع الكلام لا
// إيقاعًا ثابتًا. والتوقيتُ التلقائيّ (`بداية + الرتبة × التأخير`) لا يقدر عليها.
//
// **فالقرار: خاصّيّةٌ متحرّكةٌ حادية عشرة، `reveal`، قيمتُها «كم وحدةً بدأت».** مفتاحٌ
// قيمتُه ٣ يعني أنّ الوحدات الثلاث الأولى (بالرتبة) قد بدأت عنده. وبتخفيف «تثبيت» تقفز
// القيمةُ عند المفتاح التالي فتظهر الكلمةُ في إطارها بالضبط؛ وبتخفيفٍ خطّيٍّ بين ٠ و٥
// تبدأ الوحداتُ بإيقاعٍ ثابتٍ بينهما — آلةٌ كاتبة. وما دامت خاصّيّةً كغيرها فلها كلُّ ما
// للمفاتيح: الماساتُ على الخطّ الزمنيّ، والسحبُ، والحقلُ الرقميّ، والتخفيف، والنقلُ مع
// المقطع والقصّ — بلا واجهةٍ موازية.
//
// **ومتى «بدأت» الوحدة ذات الرتبة `r`؟** حين تبلغ القيمةُ `r + 1` صعودًا. فالقيمةُ ٠ لا
// شيء، وN الكلّ، و«التالية عند المؤشّر» تضع `floor(القيمة) + 1`. وأثرُ الوحدة (تلاشٍ،
// انزلاق…) يجري من تلك اللحظة طوالَ «مدّة الحرف» كما كان؛ والأثرُ الفوريّ يُظهرها فيها.
// وإن هبطت القيمةُ عادت الوحدةُ غائبة — مسحُ نصٍّ مكتوب بمفتاحٍ أصغر.
//
// **ولا مسارَ = التوقيتُ التلقائيّ كما كان بالحرف.** كلُّ مستندٍ قائمٍ لا يحمل `reveal`.

/** فترةُ «ظهور» على مسار: من الصعود إلى الهبوط، بزمن الحركة. `-Infinity` = قبل أوّل
 * مفتاح، `Infinity` = لا هبوط. */
type RevealInterval = [number, number];

const revealCache = new WeakMap<PropertyKeyframe[], Map<number, RevealInterval[]>>();

/** تسامحُ القيمة: المفاتيحُ تُكتَب على شبكة ٠٫٠١ (`quantizeKfValue`)، والقيمةُ المحسوبةُ بين
 * مفتاحين قد تنقص عن العدد الصحيح بجزءٍ من المليون — ولا يجوز أن تؤخّر الكلمةَ إطارًا. */
const LEVEL_EPS = 1e-6;
/** عيّناتُ البحث عن العبور في مقطعٍ مُخفَّفٍ غير خطّيّ — تخفيفٌ يرتدّ (`back`/`bounce`)
 * قد يعبر المستوى ذهابًا وإيابًا داخل المقطع الواحد، والعيّنةُ الواحدة تفوّته. */
const CROSS_SAMPLES = 48;

function revealIntervals(track: PropertyKeyframe[], level: number): RevealInterval[] {
  let byLevel = revealCache.get(track);
  if (!byLevel) {
    byLevel = new Map();
    revealCache.set(track, byLevel);
  }
  const hit = byLevel.get(level);
  if (hit) return hit;
  const kfs = [...track].sort((a, b) => a.time - b.time);
  const above = (v: number) => v >= level - LEVEL_EPS;
  const out: RevealInterval[] = [];
  let since: number | null = above(kfs[0].value) ? -Infinity : null;
  const shift = (nowAbove: boolean, t: number) => {
    if (nowAbove && since === null) since = t;
    else if (!nowAbove && since !== null) {
      out.push([since, t]);
      since = null;
    }
  };
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    const span = b.time - a.time;
    const valueAt = (u: number) => a.value + (b.value - a.value) * applyEasing(a.easing, a.bezier, u);
    if (span <= 0 || a.easing === 'hold') {
      // تثبيت (أو مفتاحان في لحظةٍ واحدة): القيمةُ `a` حتى `b` ثم تقفز — مطابقٌ لـ`trackValueAt`
      // التي تُعطي عند زمن `b` بالضبط قيمةَ `b`.
      shift(above(b.value), b.time);
      continue;
    }
    if (a.easing === 'linear') {
      // حلٌّ تامٌّ عند المستوى نفسِه لا عند حدّ التسامح: منحدرُ ٠←٤ في ثانيةٍ يبلغ ٢ عند
      // ٠٫٥ث بالضبط، فيبدأ فيه — لا قبله بربع جزءٍ من المليون.
      if (above(a.value) !== above(b.value)) {
        const u = (level - a.value) / (b.value - a.value);
        shift(above(b.value), a.time + Math.max(0, Math.min(1, u)) * span);
      }
      continue;
    }
    let prevAbove = above(a.value);
    for (let k = 1; k <= CROSS_SAMPLES; k++) {
      const u = k / CROSS_SAMPLES;
      const nowAbove = above(valueAt(u));
      if (nowAbove === prevAbove) continue;
      let lo = (k - 1) / CROSS_SAMPLES;
      let hi = u;
      for (let it = 0; it < 32; it++) {
        const mid = (lo + hi) / 2;
        if (above(valueAt(mid)) === prevAbove) lo = mid;
        else hi = mid;
      }
      shift(nowAbove, a.time + hi * span);
      prevAbove = nowAbove;
    }
  }
  if (since !== null) out.push([since, Infinity]);
  byLevel.set(level, out);
  return out;
}

/** تسامحُ الزمن: إطارٌ مُحتسَبٌ `frame/fps` ومفتاحٌ على الشبكة نفسها قد يفترقان بجزءٍ من
 * المليار في حسابٍ ثنائيّ — ولا يجوز أن يُفوّت ذلك الكلمةَ إطارَها. */
const TIME_EPS = 1e-6;

/** **كم ثانيةً مضت منذ بدأت الوحدةُ ذات الرتبة `rank`** عند لحظة الخطّ الزمنيّ `time` —
 * أو `null` وهي غائبة. السؤالُ الواحد الذي تسأله الرسّامتان (المعاينة والقُماش)، فلا
 * تختلفان في أيّ وحدةٍ ظاهرةٍ في أيّ إطار. و`Infinity` = ظاهرةٌ منذ ما قبل أوّل مفتاح. */
export function unitElapsedAt(cfg: TextStaggerAnim, anim: Pick<ElementAnim, 'start' | 'sourceIn' | 'tracks'>, rank: number, time: number): number | null {
  const track = anim.tracks.reveal;
  if (track && track.length) {
    const m = animTimeAt(anim as ElementAnim, time);
    for (const [up, down] of revealIntervals(track, rank + 1)) {
      if (m + TIME_EPS >= up && m + TIME_EPS < down) return m - up;
    }
    return null;
  }
  const start = anim.start + rank * Math.max(0, cfg.stagger);
  return time + TIME_EPS >= start ? time - start : null;
}

/** Resolves one unit's eased 0..1 reveal progress at an absolute timeline `time`. The
 * unit's own start comes from `unitElapsedAt` — the automatic `anim.start + rank ×
 * stagger` (every existing document) or the keyed `reveal` track — and its effect then
 * runs over `unitDuration`; an instant effect jumps straight to 1. */
export function resolveUnitProgress(cfg: TextStaggerAnim, anim: Pick<ElementAnim, 'start' | 'sourceIn' | 'tracks'>, rank: number, time: number): number {
  const elapsed = unitElapsedAt(cfg, anim, rank, time);
  if (elapsed === null) return 0;
  if (isInstantEffect(cfg.effect)) return 1;
  const dur = Math.max(0.001, cfg.unitDuration);
  const raw = Math.max(0, Math.min(1, elapsed / dur));
  return applyEasing(cfg.easing, cfg.bezier, raw);
}

/** `resolveUnitProgress` + `unitVisualAt` in one call — what both renderers actually
 * invoke per animated unit. */
export function resolveUnitVisual(cfg: TextStaggerAnim, anim: Pick<ElementAnim, 'start' | 'sourceIn' | 'tracks'>, rank: number, time: number): UnitVisual {
  return unitVisualAt(cfg.effect, resolveUnitProgress(cfg, anim, rank, time), rank);
}

/** عددُ الوحدات الظاهرة **بترتيب القراءة** — ما يحتاجه أثرُ «الكتابة» ليقطع البادئة.
 * وهو عددٌ متّصل: الوحدةُ `k` لا تظهر قبل `k-1` لأنّ الرتبةَ في «الكتابة» هي الترتيبُ
 * الطبيعيّ (`effectiveDirection`) والعبورُ صعودًا مرتّبٌ بالمستوى. */
export function typedUnitCount(cfg: TextStaggerAnim, anim: Pick<ElementAnim, 'start' | 'sourceIn' | 'tracks'>, n: number, time: number): number {
  let k = 0;
  while (k < n && unitElapsedAt(cfg, anim, k, time) !== null) k++;
  return k;
}

/** **كم وحدةً بدأت الآن** — بأيّ توقيتٍ كان (تلقائيًّا أو بالمفاتيح). هي «القيمةُ المرسومة
 * الآن» لخاصّيّة «الظهور»: أوّلُ مفتاحٍ يُضاف عليها يأخذها فلا يقفز شيءٌ على الشاشة، كما
 * يأخذ كلُّ مفتاحٍ أوّلُ قيمةَ خاصّيّته الحاليّة (`addTrackKeyframeAtPlayhead`). */
export function startedUnitCount(cfg: TextStaggerAnim, anim: Pick<ElementAnim, 'start' | 'sourceIn' | 'tracks'>, n: number, time: number): number {
  let count = 0;
  for (let r = 0; r < n; r++) if (unitElapsedAt(cfg, anim, r, time) !== null) count++;
  return count;
}

/** قيمةُ مسار «الظهور» عند لحظةٍ — أو `null` بلا مسار. لزرّ «التالية عند المؤشّر». */
export function revealValueAt(anim: Pick<ElementAnim, 'start' | 'sourceIn' | 'tracks'>, time: number): number | null {
  const track = anim.tracks.reveal;
  if (!track || !track.length) return null;
  const m = animTimeAt(anim as ElementAnim, time);
  const kfs = [...track].sort((a, b) => a.time - b.time);
  if (m <= kfs[0].time) return kfs[0].value;
  if (m >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (m >= a.time && m <= b.time) {
      const span = b.time - a.time;
      const u = span <= 0 ? 1 : (m - a.time) / span;
      return a.value + (b.value - a.value) * applyEasing(a.easing, a.bezier, u);
    }
  }
  return kfs[kfs.length - 1].value;
}

/** **البادئةُ الظاهرة وبقيّتُها** لأثر «الكتابة»: نصُّ الوحدات الأولى `k` بترتيب القراءة
 * (والفواصلُ بينها)، ثم الباقي. المعاينةُ ترسم الأولى وتُخفي الثانية في مكانها (فيبقى
 * التخطيطُ تخطيطَ النصّ الكامل)، والقُماشُ يرسم الأولى عند حافّة بداية السطر الكامل. */
export function typedSplit(tokens: StaggerToken[], k: number): { visible: string; rest: string } {
  let end = 0; // عددُ الرموز الداخلة في البادئة
  for (let i = 0; i < tokens.length; i++) {
    const o = tokens[i].order;
    if (o !== null && o < k) end = i + 1;
  }
  return { visible: tokens.slice(0, end).map((t) => t.text).join(''), rest: tokens.slice(end).map((t) => t.text).join('') };
}

/** فاصلُ «الكتابة» في المعاينة: محرفُ عدمِ الوصل (ZWNJ) بين البادئة الظاهرة وبقيّتها
 * المخفيّة — فيُشكَّل آخرُ حرفٍ ظاهرٍ بصورته الأخيرة كما يُشكَّل في القُماش (الذي يرسم
 * البادئةَ وحدها). بلا الفاصل يصله المتصفّحُ بالحرف المخفيّ بعده فيُرسَم وسطيًّا. */
export const TYPE_BREAK = ZWNJ;

/** `StaggerUnit`-aware CSS transform string for one token's `UnitVisual` — shared by
 * every DOM span the stagger layer renders. */
export function unitVisualToCssTransform(v: UnitVisual): string | undefined {
  const parts: string[] = [];
  // الإزاحةُ الأفقيّة بالـ`em` (كسرٌ من حجم الخطّ) لا بالنسبة: نسبةُ `translateX` تُقاس بعرض الوحدة.
  if (v.translateX !== 0) parts.push(`translateX(${v.translateX.toFixed(3)}em)`);
  if (v.translateY !== 0) parts.push(`translateY(${(v.translateY * 100).toFixed(2)}%)`);
  if (v.scale !== 1) parts.push(`scale(${v.scale.toFixed(3)})`);
  if (v.rotateDeg !== 0) parts.push(`rotate(${v.rotateDeg.toFixed(2)}deg)`);
  return parts.length ? parts.join(' ') : undefined;
}

/** مرشّحُ CSS لضبابيّة الوحدة بالـ`em` — فيتناسب مع الخطّ كما يتناسب `× fontPx` في القُماش. */
export function unitVisualToCssFilter(v: UnitVisual): string | undefined {
  return v.blur > 0 ? `blur(${v.blur.toFixed(4)}em)` : undefined;
}

export type { StaggerDirection, StaggerEffect, StaggerUnit, TextStaggerAnim };

/** عددٌ شبهُ عشوائيٍّ ثابتٌ في [0،1) من عددٍ صحيح — لا يتغيّر بين إطارٍ وآخر ولا بين المعاينة والتصدير. */
function seeded(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
