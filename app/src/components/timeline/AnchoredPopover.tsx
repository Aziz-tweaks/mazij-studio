import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { THEME } from '../../theme/theme';

/** **منبثقةٌ مُرساةٌ على عنصرٍ تبقى كلُّها داخل النافذة — ٢٥ أكتوبر ٢٠٢٦.**
 *
 * كانت منبثقةُ المفتاح تُرسَم داخل لوح الخطّ الزمنيّ بموضعٍ مطلق: فوق صفّها، أو تحته
 * إن كان الصفُّ قريبًا من أعلى اللوح. وظهر عيبان حين نُسخ مقطعٌ حقيقيٌّ بالأزرار:
 *
 *   ١. **المنحنى المخصّص يقع خارج الشاشة.** صفوفُ أوّل طبقتين قريبةٌ من أعلى اللوح،
 *      فتنزل المنبثقةُ تحتها، واللوحُ نفسه في أسفل النافذة — فيُفتح محرّرُ المنحنى
 *      («مخصّص») تحت حافّة النافذة ولا يُرى منه شيء، ولا يمكن كتابةُ أرقامه.
 *   ٢. **مفاتيحُ أوّل المقطع تُقصّ من اليسار.** الموضعُ `left: calc(x% − 90px)`، فمفتاحٌ
 *      عند الصفر يبدأ صندوقُه قبل حافّة اللوح بتسعين بكسلًا: يختفي العنوانُ والمِمسحة.
 *
 * فصارت تُرسَم في جسم المستند (`createPortal`) بموضعٍ ثابت يُحسَب من مستطيل الماسة
 * ومن مقاس المنبثقة نفسها بعد رسمها: الجهةُ المفضّلة كما كانت (فوق، أو تحت قرب أعلى
 * اللوح) **ما دامت تتّسع**، وإلّا فالجهةُ الأخرى، ثم تُحصَر أفقيًّا وعموديًّا داخل
 * النافذة. فالسلوكُ المعتاد لا يتغيّر، والحالتان أعلاه تُحلّان بالهندسة لا باستثناء.
 * ويُعاد الحساب مع كلّ رسمٍ ومع تغيّر مقاسها (فتحُ محرّر المنحنى) ومع التمرير وتغيّر
 * النافذة. وأحداثُ React تعبر البوّابة إلى آبائها في الشجرة، فتبقى معالجاتُ اللوح
 * (مثل إيقاف أسهم الحقل) كما هي. */
export function AnchoredPopover({
  anchorSelector,
  prefer,
  testId,
  onKeyDown,
  style,
  children,
}: {
  anchorSelector: string;
  prefer: 'above' | 'below';
  testId: string;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const anchor = document.querySelector(anchorSelector);
      const panel = ref.current;
      if (!panel) return;
      // **ماسةٌ غائبة ← منبثقةٌ مخفيّة.** طيُّ الطبقة يُزيل صفوفَ خصائصها، فتبقى المنبثقةُ
      // معلّقةً في موضعها الأخير فوق صفوفٍ لا علاقة لها بها. فتُخفى حتى تعود ماستُها.
      if (!anchor) {
        setPos(null);
        return;
      }
      const a = anchor.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const M = 8; // هامشٌ من حافّة النافذة
      const GAP = 10; // بُعدٌ عن الماسة كي لا تبتلع المنبثقةُ سحبَها التالي
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.min(Math.max(M, a.left + a.width / 2 - 90), Math.max(M, vw - p.width - M));
      const above = a.top - GAP - p.height;
      const below = a.bottom + GAP;
      const fitsAbove = above >= M;
      const fitsBelow = below + p.height <= vh - M;
      let top: number;
      if (prefer === 'above') top = fitsAbove || !fitsBelow ? above : below;
      else top = fitsBelow || !fitsAbove ? below : above;
      top = Math.min(Math.max(M, top), Math.max(M, vh - p.height - M));
      setPos((old) => (old && Math.abs(old.left - left) < 0.5 && Math.abs(old.top - top) < 0.5 ? old : { left, top }));
    };
    place();
    const panel = ref.current;
    const ro = typeof ResizeObserver !== 'undefined' && panel ? new ResizeObserver(place) : null;
    if (ro && panel) ro.observe(panel);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  });

  return createPortal(
    <div
      ref={ref}
      data-testid={testId}
      data-placed={pos ? 'yes' : 'no'}
      onKeyDown={onKeyDown}
      style={{
        // خارج الجذر الملوَّن، فتُعاد متغيّراتُ السمة هنا كما في `EasingMenu`.
        ...(THEME.vars as CSSProperties),
        ...style,
        position: 'fixed',
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? 'visible' : 'hidden',
        pointerEvents: pos ? undefined : 'none',
        zIndex: 50,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
