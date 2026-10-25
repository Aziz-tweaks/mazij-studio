// أسماء الطبقات المقروءة — البند ٨ في `docs/UX-AUDIT-2026-10-18.md`.
//
// كانت قائمة الطبقات تعرض «شكل · mvdiutl2»: النوع، ثم **شظيّةٌ من المعرّف الخام**
// (`id.split('-')[1]`، وهو طابع الوقت بالأساس ٣٦). ذلك الاسم لا يُميّز طبقةً عن
// أختها في الاستعمال الحقيقي — المصمّم الذي أمامه ثلاثة نصوص وأربعة أشكال يقرأ سبعة
// أسطرٍ متشابهةٍ عديمة الدلالة، فيضطرّ إلى النقر على كلٍّ منها ليعرف أيُّها أيّ.
//
// القاعدة المأخوذة من الأداة الشائعة وأداة المتّجهات واحدة: **الطبقة تُسمّى بمحتواها، لا بهويّتها.**
// طبقة النص تُسمّى بنصّها، والصورة باسم ملفها، والشكل بنوعه الهندسي. ولا يظهر المعرّف
// أبدًا — لا كاملًا ولا شظيّة؛ إن لم يكن هناك محتوًى يُشتقّ منه اسم، فاسم النوع وحده
// أصدق من اسم النوع ملحوقًا بضجيج.

import type { DocElement } from '../state/elements';
import type { Dictionary } from '../i18n/strings';

/** أطول اسمٍ مشتقٍّ من المحتوى قبل القطع. السطر في قائمة الطبقات عرضه ١٥٠ بكسل
 * ويقصّه CSS بـ`ellipsis` على أي حال؛ القطع هنا يمنع حمل نصٍّ من فقرةٍ كاملة في
 * الذاكرة لكل إعادة رسم، ويُبقي `title` (التلميح) قصيرًا بما يُقرأ. */
const MAX_DERIVED = 28;

function squeeze(s: string): string {
  // سطورٌ متعدّدة ومسافاتٌ متتالية تصير مسافةً واحدة: الاسم سطرٌ واحد دائمًا.
  return s.replace(/\s+/g, ' ').trim();
}

function truncate(s: string): string {
  return s.length > MAX_DERIVED ? `${s.slice(0, MAX_DERIVED - 1)}…` : s;
}

/** اسم الشكل الهندسي كما يسمّيه المصمّم: «مستطيل»/«دائرة»/«مسار».
 *
 * يُقرأ من `shape` المستنديّ الثلاثي لا من `ShapeDrawKind` الذي رُسم به، لأن الثاني
 * لا يُحفظ في العنصر أصلًا (`shapeGeometryFor` يُسقطه إلى الثلاثي عند الإنشاء) —
 * فادّعاء «نجمة» هنا كان سيكون اسمًا لا يملك المستند ما يُثبته. */
function shapeKindName(el: Extract<DocElement, { type: 'shape' }>, L: Dictionary): string {
  if (el.outline) return L.ln_outline;
  if (el.subpaths?.length) return L.ln_path;
  if (el.shape === 'ellipse') return L.ln_ellipse;
  if (el.shape === 'path') return L.ln_path;
  return L.ln_rect;
}

/** الاسم المعروض لطبقةٍ واحدة، بالترتيب: اسمٌ كتبه المصمّم ← اسمٌ مشتقٌّ من المحتوى
 * ← اسم النوع وحده. لا يُرجع معرّفًا خامًا في أي فرع. */
export function elementDisplayName(el: DocElement, L: Dictionary): string {
  const custom = el.name && squeeze(el.name);
  if (custom) return truncate(custom);

  switch (el.type) {
    case 'text': {
      // النص نفسه هو أصدق اسمٍ ممكن، وهو ما يفعله كلا البرنامجين.
      const body = squeeze(el.text);
      return body ? truncate(body) : L.ln_text;
    }
    case 'shape': {
      // التسمية المخبوزة على الشكل (`label`) تسبق نوعه الهندسي: شارةٌ مكتوبٌ عليها
      // «٪٣٠» تُعرف بذلك قبل أن تُعرف بأنها دائرة.
      const label = el.label && squeeze(el.label);
      return label ? truncate(label) : shapeKindName(el, L);
    }
    case 'image':
      return el.placeholder ? L.ln_image_ph : L.ln_image;
    case 'lottie':
      return L.ln_lottie;
    case 'video':
      return L.ln_video;
    // اسمُ الملف يُكتب في `name` عند الاستيراد فيسبق هذا الفرع؛ وهذا لطبقةٍ بلا اسم.
    case 'audio':
      return L.audio_layer;
    default:
      return L.ln_element;
  }
}

/** اسم المجموعة في قائمة الطبقات: «مجموعة (٣)» — العدد جزءٌ من الاسم لأنه الشيء
 * الوحيد الذي يميّز مجموعةً عن أخرى قبل فتحها. */
export function groupDisplayName(count: number, L: Dictionary): string {
  return `${L.ln_group} (${count})`;
}
