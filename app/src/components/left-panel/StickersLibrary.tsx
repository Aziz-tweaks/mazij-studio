import { useEffect, useRef } from 'react';
import lottie from 'lottie-web';
import { sizeAt } from '../../data/constants';
import { useStudio } from '../../state/StudioContext';
import { STICKERS, stickerFile, type StickerSpec } from '../../lib/stickers';

/** لوح «ملصقات» (٣٠ أكتوبر ٢٠٢٦): ملصقاتٌ متحرّكةٌ مدمجة تُضاف بنقرة، ومعها رفعُ ملفّ لوتي
 * لمن عنده. كانت النقرةُ على البند تُسلِّح أداةً ثم تفتح منتقيَ ملفّات — لا شيء يُرى قبله. */
export function StickersLibrary() {
  const { state, actions, dict: L } = useStudio();
  const place = (s: StickerSpec) => {
    const size = sizeAt(state.sizeIdx, state.customW, state.customH);
    void actions.insertLottieFromFile(stickerFile(s), { x: size.w / 2, y: size.h / 2 });
  };
  return (
    <div data-testid="stickers-library" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="mz-label">{L.stk_builtin}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {STICKERS.map((s) => (
          <button
            key={s.id}
            data-testid={`sticker-${s.id}`}
            className="mz-tile"
            title={state.lang === 'ar' ? s.ar : s.en}
            onClick={() => place(s)}
            style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: 0, border: 0, background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
          >
            <StickerThumb spec={s} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{state.lang === 'ar' ? s.ar : s.en}</span>
          </button>
        ))}
      </div>
      <button
        data-testid="sticker-upload"
        onClick={() => void actions.insertLottieTool()}
        style={{ height: 34, border: '1px solid var(--line)', borderRadius: 9, background: 'transparent', color: 'var(--text)', fontSize: 12.5, fontWeight: 600 }}
      >
        {L.stk_upload}
      </button>
    </div>
  );
}

function StickerThumb({ spec }: { spec: StickerSpec }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const anim = lottie.loadAnimation({ container: ref.current, renderer: 'svg', loop: true, autoplay: true, animationData: spec.build() });
    return () => anim.destroy();
  }, [spec]);
  return <div ref={ref} style={{ width: '100%', aspectRatio: '1', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface2)', overflow: 'hidden' }} />;
}
