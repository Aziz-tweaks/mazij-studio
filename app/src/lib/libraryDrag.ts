import type { PointerEvent as ReactPointerEvent } from 'react';

/** **سحبُ البطاقة إلى اللوحة أو الخطّ الزمنيّ** (٢٩ أكتوبر ٢٠٢٦، بالنقر الحقيقيّ مقابل محرّر فيديو شائع والأداة الشائعة).
 * كانت البطاقةُ تُنقَر فقط، وسحبُها لا يفعل شيئًا. الآن: ضغطةٌ ثم حركةٌ أكثر من ٤ بكسلات تُطلق شبحًا
 * يتبع المؤشّر؛ الإفلاتُ على اللوحة يضع الشكلَ ومركزُه تحت المؤشّر، وعلى المسارات يضعه بادئًا من
 * ذلك الزمن، وخارجهما يُلغى. والنقرةُ بلا حركة تبقى كما كانت (في الوسط). بأحداث المؤشّر لا بسحب
 * HTML5، لأنّ نافذة سطح المكتب تعترض سحبَ الملفّات. */
export function startTileDrag(e: ReactPointerEvent<HTMLElement>, svgHtml: string, onDrop: (drop: { center?: { x: number; y: number }; start?: number }) => void): void {
  if (e.button !== 0) return;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let ghost: HTMLDivElement | null = null;
  const move = (ev: PointerEvent) => {
    if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.setAttribute('data-testid', 'shape-drag-ghost');
      ghost.innerHTML = svgHtml;
      Object.assign(ghost.style, { position: 'fixed', width: '56px', height: '56px', pointerEvents: 'none', zIndex: '9999', opacity: '0.85', color: 'var(--accent)', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.35))' });
      document.body.appendChild(ghost);
    }
    ghost.style.left = `${ev.clientX - 28}px`;
    ghost.style.top = `${ev.clientY - 28}px`;
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!ghost) return; // نقرة — يتولّاها onClick
    ghost.remove();
    // نقرةُ «click» التي قد تتبع الإفلاتَ على البطاقة نفسها لا تضع شكلًا ثانيًا؛ وتُنسى بعد الدورة.
    suppressNextClick = true;
    setTimeout(() => {
      suppressNextClick = false;
    }, 0);
    const at = document.elementFromPoint(ev.clientX, ev.clientY);
    const board = at?.closest<HTMLElement>('[data-testid="artboard"]');
    if (board) {
      const r = board.getBoundingClientRect();
      onDrop({ center: { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height } });
      return;
    }
    const tracks = at?.closest<HTMLElement>('[data-testid="timeline-tracks"]');
    const ruler = document.querySelector<HTMLElement>('[data-testid="timeline-ruler"]');
    if (tracks && ruler) {
      const r = tracks.getBoundingClientRect();
      const span = Number(ruler.dataset.span) || 0;
      onDrop({ start: Math.max(0, ((ev.clientX - r.left) / r.width) * span) });
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
let suppressNextClick = false;
/** النقرةُ التي تتبع إفلاتًا على البطاقة نفسها تُبتلَع مرّةً واحدة. */
export function consumeSuppressedClick(): boolean {
  if (!suppressNextClick) return false;
  suppressNextClick = false;
  return true;
}
