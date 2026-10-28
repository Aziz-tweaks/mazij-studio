import { useSyncExternalStore } from 'react';

/** **شاشةُ جوال** — عرضٌ أضيق من ٥٦٠ بكسلًا (آيفون وأندرويد عموديًّا، أو نافذةٌ ضيّقة).
 *
 * يُقرَّر بالعرض لا بنوع الجهاز: الواجهةُ المضغوطة نفسُها تخدم الجوال ونافذةَ متصفّحٍ
 * ضيّقة، وتُجرَّب في المتصفّح بمقاس آيفون كما تعمل في البرنامج. والآيباد عرضُه أكبر،
 * فيأخذ واجهةَ سطح المكتب باللمس. */
// والآيبادُ عموديًّا (٧٤٤–٨٣٤ بكسلًا) لا تتّسع له أعمدةُ سطح المكتب الأربعة، فيأخذ
// واجهةَ الجوال كما يفعل الأداة الشائعة على الآيباد عموديًّا؛ وأفقيًّا يأخذ واجهةَ سطح المكتب باللمس.
const QUERY = '(max-width: 560px), (pointer: coarse) and (max-width: 900px)';
const TOUCH = '(pointer: coarse)';

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function isCompactNow(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, isCompactNow, () => false);
}

function subscribeTouch(cb: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const mq = window.matchMedia(TOUCH);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** **شاشةُ لمس** (آيباد، جوال): المقابضُ تُصاب بالإصبع (٤٤ نقطة)، واللوحةُ تُكبَّر
 * بإصبعين، وتلميحاتُ اختصارات لوحة المفاتيح تُخفى. */
export function useTouch(): boolean {
  return useSyncExternalStore(
    subscribeTouch,
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(TOUCH).matches,
    () => false,
  );
}
