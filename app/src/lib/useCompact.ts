import { useSyncExternalStore } from 'react';

/** **شاشةُ جوال** — عرضٌ أضيق من ٥٦٠ بكسلًا (آيفون وأندرويد عموديًّا، أو نافذةٌ ضيّقة).
 *
 * يُقرَّر بالعرض لا بنوع الجهاز: الواجهةُ المضغوطة نفسُها تخدم الجوال ونافذةَ متصفّحٍ
 * ضيّقة، وتُجرَّب في المتصفّح بمقاس آيفون كما تعمل في البرنامج. والآيباد عرضُه أكبر،
 * فيأخذ واجهةَ سطح المكتب باللمس. */
const QUERY = '(max-width: 560px)';

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
