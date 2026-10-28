import { useSyncExternalStore } from 'react';

/** **كم تُغطّي الألواحُ السفليّة من اللوحة** — بالبكسل، من أسفل منطقة المسرح.
 *
 * اللوحُ يطفو فوق المسرح (لا يُصغِّر حاويته، فلا إعادةَ تخطيطٍ ولا قياسٍ أثناء السحب).
 * فإذا استقرّ اللوحُ أخبر المسرحَ هنا، والمسرحُ يُعيد ملاءمةَ التصميم في المساحة الظاهرة
 * فوقه بانتقالٍ واحدٍ على `transform` — فيرى المصمّمُ تصميمه كاملًا وهو يعدّله. */

let inset = 0;
const subs = new Set<() => void>();

export function setViewInset(px: number) {
  const v = Math.max(0, Math.round(px));
  if (v === inset) return;
  inset = v;
  subs.forEach((f) => f());
}

export function useViewInset(): number {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => inset,
    () => 0,
  );
}
