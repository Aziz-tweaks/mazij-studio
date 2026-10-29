import type { DocElement, TextCounter } from '../state/elements';
import { DEFAULT_BEZIER, applyEasing } from './easing';
import { animTimeAt } from './animTimeline';

/** عدّادُ الأرقام: نصٌّ يَعُدّ من `from` إلى `to` خلال نافذةٍ من مقطع العنصر.
 *
 * **ليس طبقةَ رسمٍ ثانية** — هو تبديلٌ لِـ`text` وحده عند لحظةٍ معيّنة، يَقرؤه كلُّ
 * مسار رسمٍ (المعاينةُ والقُماشُ وSVG) من هذه الدالّة الواحدة قبل أن يَرسم، فيبقى كلُّ
 * ما يملكه النصُّ أصلًا (الخطُّ والتدرّجُ والتتابعُ والحركة) يعمل على الرقم كما هو.
 * و`el.text` المخزونُ هو قيمةُ النهاية، فما يُحرَّر ويُحفَظ ويُقرأ بلا زمنٍ صحيح. */
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function formatCounter(c: TextCounter, value: number): string {
  const decimals = Math.max(0, Math.min(4, Math.round(c.decimals ?? 0)));
  const fixed = Math.abs(value).toFixed(decimals);
  let [int, frac] = fixed.split('.');
  if (c.grouping !== false) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, c.digits === 'arabic' ? '٬' : ',');
  let s = (value < 0 ? '-' : '') + int + (frac ? (c.digits === 'arabic' ? '٫' : '.') + frac : '');
  if (c.digits === 'arabic') s = s.replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);
  return `${c.prefix ?? ''}${s}${c.suffix ?? ''}`;
}

export function counterValueAt(el: Extract<DocElement, { type: 'text' }>, time: number): number | null {
  const c = el.counter;
  if (!c) return null;
  const local = animTimeAt(el.anim, time) - (c.delay ?? 0);
  const dur = c.duration && c.duration > 0 ? c.duration : Math.max(0.001, el.anim.duration - (c.delay ?? 0));
  const p = Math.max(0, Math.min(1, local / dur));
  const e = applyEasing(c.easing ?? 'easeOut', DEFAULT_BEZIER, p);
  return c.from + (c.to - c.from) * e;
}

/** العنصرُ كما يُرسَم عند `time`: نفسُه إن لم يكن عدّادًا (بلا نسخ)، وإلا نسخةٌ نصُّها الرقمُ الحاليّ. */
export function withCounterAt<T extends DocElement>(el: T, time: number | undefined): T {
  if (el.type !== 'text' || !el.counter || time == null) return el;
  const v = counterValueAt(el, time);
  if (v == null) return el;
  return { ...el, text: formatCounter(el.counter, v) };
}
