import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStudio } from '../../state/StudioContext';
import { CMD, MenuRow } from './ContextBar';
import type { ImageElement } from '../../state/elements';

/** **قائمة الزرّ الأيمن على اللوحة.**
 *
 * كان الزرّ الأيمن يفتح قائمة المتصفّح نفسه — وفيها بندٌ واحد: «Reload» بالإنجليزيّة،
 * ونقرةٌ عليه تُعيد تحميل البرنامج كلّه ويضيع سجلّ التراجع (جولة الاستخدام). والمصمّم
 * القادم من الأداة الشائعة وفيغما وأداة المتّجهات يضغط الزرّ الأيمن على العنصر ليجد ما يُفعَل به.
 * فهنا بنود الشريط السياقي و«⋯» نفسها، باختصاراتها المكتوبة بجانبها — القائمة تُعلِّم
 * الاختصار وهي تُريحك منه. وعلى فراغ اللوحة: «لصق» و«حدّد الكل».
 *
 * `role="menu"` يجعل سُلَّم Esc العامّ يتركها لنفسها (`menuOpen()` في
 * `StudioContext.tsx`)، و`data-stage-overlay` يمنع نقرةَ بندٍ من أن تُقرأ نقرةً على
 * خلفيّة اللوحة. */
export function StageMenu({ x, y, onElement, onClose }: { x: number; y: number; onElement: boolean; onClose: () => void }) {
  const { state, actions, dict: L } = useStudio();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // داخل النافذة دائمًا: تنقلب إلى يسار النقطة أو فوقها إن لم يبقَ لها مكان.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { offsetWidth: w, offsetHeight: h } = node;
    const PAD = 8;
    const left = x + w + PAD > window.innerWidth ? Math.max(PAD, x - w) : x;
    const top = y + h + PAD > window.innerHeight ? Math.max(PAD, y - h) : y;
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', onClose, { passive: true });
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  // صورةٌ واحدة محدَّدة (بمصدرٍ حقيقيّ، لا خانةٍ فارغة): «تتبّع إلى متجهات» — الفعلُ
  // نفسه الذي في قسم الصورة (`traceImage`).
  const selectedImages = state.selectedIds
    .map((id) => state.elements.find((e) => e.id === id))
    .filter((e): e is ImageElement => !!e && e.type === 'image' && !!e.src);
  const traceable = selectedImages.length === 1 && !state.traceBusyId ? selectedImages[0] : null;

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const sep = <div style={{ height: 1, margin: '3px 6px', background: 'var(--line)' }} />;

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="stage-menu"
      data-stage-overlay
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        left: pos?.left ?? x,
        top: pos?.top ?? y,
        visibility: pos ? undefined : 'hidden',
        zIndex: 50,
        padding: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        border: '1px solid var(--lineStrong)',
        borderRadius: 12,
        background: 'var(--surface)',
        boxShadow: 'var(--shadow)',
        animation: 'mz-fade .12s ease',
      }}
    >
      {onElement ? (
        <>
          <MenuRow testid="sm-copy" label={L.sc_copy} keys={`${CMD}C`} onClick={run(actions.copySelected)} />
          <MenuRow testid="sm-cut" label={L.sc_cut} keys={`${CMD}X`} onClick={run(actions.cutSelected)} />
          <MenuRow testid="sm-paste" label={L.sc_paste} keys={`${CMD}V`} onClick={run(actions.pasteClipboard)} />
          <MenuRow testid="sm-duplicate" label={L.sc_dup} keys={`${CMD}D`} onClick={run(actions.duplicateSelected)} />
          {traceable && (
            <>
              {sep}
              <MenuRow testid="sm-trace" label={L.trace_btn} keys="" onClick={run(() => void actions.traceImage(traceable.id))} />
            </>
          )}
          {sep}
          <MenuRow testid="sm-forward" label={L.bring_forward} keys={`${CMD}]`} onClick={run(() => actions.bringForward(state.selectedIds))} />
          <MenuRow testid="sm-backward" label={L.send_backward} keys={`${CMD}[`} onClick={run(() => actions.sendBackward(state.selectedIds))} />
          {state.selectedIds.length > 1 && <MenuRow testid="sm-group" label={L.sc_group} keys={`${CMD}G`} onClick={run(actions.groupSelected)} />}
          <MenuRow testid="sm-lock" label={L.sc_lock} keys={`${CMD}2`} onClick={run(actions.lockSelected)} />
          {sep}
          <MenuRow testid="sm-delete" label={L.sc_delete} keys="⌫" danger onClick={run(actions.deleteSelected)} />
        </>
      ) : (
        <>
          <MenuRow testid="sm-paste" label={L.sc_paste} keys={`${CMD}V`} onClick={run(actions.pasteClipboard)} />
          <MenuRow testid="sm-all" label={L.sc_all} keys={`${CMD}A`} onClick={run(actions.selectAllElements)} />
        </>
      )}
    </div>
  );
}
