export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** **مزيج على الجوال** (آيفون، آيباد، أندرويد) — داخل تاوري على نظام جوال.
 *
 * يُقرأ من وكيل المتصفّح: الآيفون والأندرويد يعلنان اسمَيهما، والآيباد يتنكّر بوكيل ماك
 * فيُعرف بنقاط اللمس — لا ماكَ بشاشة لمس. */
export const onMobile =
  inTauri &&
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

/** **البرامجُ المرافقة وأوامرُ النظام** (برنامج الترميز، الصورة الحيّة، الوكلاء، خادم
 * الأدوات) — موجودةٌ في تطبيق سطح المكتب وحده. الجوالُ لا يشغّل برنامجًا مرافقًا، فكلُّ
 * ما يحتاجها يسلك طريقَ المتصفّح هناك أو يُعرَض غيرَ متاح بصراحة. */
export const hasDesktopSidecars = inTauri && !onMobile;
