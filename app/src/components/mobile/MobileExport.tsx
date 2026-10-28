import { useEffect, useState } from 'react';
import { useStudio } from '../../state/StudioContext';
import { MEDIUM_SURFACES, PALETTES, PLATFORM_GROUPS, SIZES, dimsOf, nameOf, sizeAt } from '../../data/constants';
import { renderArtboardPng } from '../../lib/exportArtboard';
import { hasDesktopSidecars } from '../../lib/tauriEnv';
import { Sheet } from './Sheet';
import { Glyph, MI, Seg, SectionTitle } from './ui';
import { useM } from './strings';

/** **التصدير في الجوال** — لوحٌ واحدٌ بخطوةٍ واحدة: معاينةٌ هي الملفُّ نفسُه، صيغة، دقّة،
 * مقاسات، وزرٌّ كبيرٌ ثابتٌ في الأسفل. المنطقُ كلُّه في `StudioContext` (`startExport`)،
 * ولا خيارٌ هنا لا يُنفَّذ: الفيديو يُعرَض غيرَ متاحٍ بصراحة حيث لا مُرمِّز. */
export function MobileExport() {
  const { state, actions } = useStudio();
  const M = useM();
  const open = state.exportOpen;
  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  const [preview, setPreview] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const key = open ? JSON.stringify([state.elements, state.postPalette, state.sizeIdx, state.customW, state.customH, state.decorAccent, state.exportTransparent, state.lang]) : '';
  useEffect(() => {
    if (!open) {
      setPreview(null);
      return;
    }
    let dead = false;
    let url: string | null = null;
    const scale = Math.min(1, 560 / Math.max(size.w, size.h));
    renderArtboardPng({ size, palette: PALETTES[state.postPalette], elements: state.elements, transparent: state.exportTransparent, scale, lang: state.lang, decorAccent: state.decorAccent })
      .then((b) => {
        if (dead) return;
        url = URL.createObjectURL(b);
        setPreview(url);
      })
      .catch(() => !dead && setPreview(null));
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // الجوال لا يرمّز فيديو بعد: صيغُ الصورة وحدها، والصيغةُ المحفوظة من الماك تُردّ إلى PNG.
  useEffect(() => {
    if (open && !hasDesktopSidecars && !['png', 'jpg', 'svg'].includes(state.exportFormat)) actions.setExportFormat('png');
  }, [open, state.exportFormat, actions]);

  const chosen = Object.entries(state.targets).filter(([, on]) => on).map(([id]) => id);
  const busy = state.exportState === 'busy';
  const done = state.exportState === 'done';
  const projectId = SIZES[state.sizeIdx]?.id;
  const onlyProject = chosen.length === 1 && chosen[0] === projectId;
  const timed = MEDIUM_SURFACES[state.medium].motionProps;
  const ar = state.lang === 'ar';

  const footer = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {busy && (
        <div style={{ height: 6, borderRadius: 3, background: 'var(--m-elev3)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '100%', background: 'var(--m-accent)', transformOrigin: ar ? 'right' : 'left', transform: `scaleX(${state.exportProgress / 100})`, transition: 'transform .15s linear' }} />
        </div>
      )}
      <button data-testid="export-submit" className="m-btn m-btn-primary m-btn-block m-press" disabled={busy || !chosen.length} onClick={actions.startExport}>
        {busy ? M.x_busy : done ? M.x_again : chosen.length ? M.x_go(chosen.length) : M.x_pick_one}
      </button>
    </div>
  );

  return (
    <Sheet open={open} onClose={actions.closeExport} title={M.x_title} detents={[0.9]} testid="export-sheet" scrim footer={footer}>
      <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', placeItems: 'center', padding: '8px 0', borderRadius: 18, background: 'var(--m-bg)', minHeight: 180 }}>
          <div style={{ width: size.w >= size.h ? '78%' : undefined, height: size.w < size.h ? 220 : undefined, aspectRatio: `${size.w}/${size.h}`, maxHeight: 240, borderRadius: 8, overflow: 'hidden', background: state.exportTransparent ? 'repeating-conic-gradient(#2a2c31 0 25%, #1c1d21 0 50%) 0 0/16px 16px' : PALETTES[state.postPalette].bg, boxShadow: '0 12px 40px rgba(0,0,0,.5)' }}>
            {preview && <img data-testid="export-preview-image" src={preview} alt="" style={{ display: 'block', width: '100%', height: '100%' }} />}
          </div>
        </div>

        {done && (
          <div data-testid="export-done" className="m-fade-in" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14, borderRadius: 16, background: 'var(--m-accent-soft)' }}>
            <span style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--m-accent)', color: '#fff' }}>
              <Glyph d={MI.check} size={20} sw={2.4} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 700 }}>{M.x_done}</span>
              <span className="m-caption">{M.x_saved_where}</span>
            </span>
          </div>
        )}
        {state.exportState === 'error' && (
          <div style={{ padding: 14, borderRadius: 16, background: 'rgba(255,107,107,.12)', color: 'var(--m-danger)', fontSize: 14 }}>
            {M.x_failed}
            {state.exportError ? `: ${state.exportError}` : ''}
          </div>
        )}

        <div>
          <SectionTitle>{M.x_format}</SectionTitle>
          <Seg
            testid="export-format"
            value={state.exportFormat}
            options={(['png', 'jpg', 'svg'] as const).map((f) => ({ id: f, label: <span dir="ltr">{f.toUpperCase()}</span>, testid: `export-format-${f}` }))}
            onChange={(f) => actions.setExportFormat(f)}
          />
          {timed && !hasDesktopSidecars && <p className="m-caption" style={{ margin: '8px 2px 0' }}>{M.x_video_soon}</p>}
        </div>

        {state.exportFormat !== 'svg' && (
          <div>
            <SectionTitle>{M.x_quality}</SectionTitle>
            <Seg value={state.exportScale} options={([1, 2, 3] as const).map((s) => ({ id: s, label: <span dir="ltr">{s}×</span> }))} onChange={(s) => actions.setExportScale(s)} />
          </div>
        )}

        {state.exportFormat === 'png' && (
          <button className="m-row m-group m-press" onClick={() => actions.setExportTransparent(!state.exportTransparent)} style={{ borderRadius: 14 }}>
            <span style={{ flex: 1 }}>{M.x_transparent}</span>
            <Toggle on={state.exportTransparent} />
          </button>
        )}

        <div>
          <SectionTitle>{M.x_sizes}</SectionTitle>
          <div className="m-group">
            <SizeRow label={M.x_this_size} sub={`${nameOf(size, state.lang)} · ${dimsOf(size)}`} on={onlyProject} onClick={actions.selectProjectSizeTarget} testid="export-project-size" />
            <button className="m-row m-press" onClick={() => setShowAll((v) => !v)} style={{ color: 'var(--m-accent-text)', fontWeight: 600 }}>
              <span style={{ flex: 1 }}>{ar ? 'مقاسات المنصّات' : 'Platform sizes'}</span>
              <span style={{ color: 'var(--m-text3)', fontSize: 13 }}>{chosen.filter((c) => c !== projectId).length || ''}</span>
              <Glyph d={MI.chevronDown} size={18} style={{ transform: showAll ? 'rotate(180deg)' : undefined, transition: 'transform .25s var(--m-ease)' }} />
            </button>
          </div>
          {showAll && (
            <div className="m-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
              {PLATFORM_GROUPS.map((g) => (
                <div key={g.id}>
                  <SectionTitle style={{ fontSize: 12 }}>{ar ? g.ar : g.en}</SectionTitle>
                  <div className="m-group">
                    {g.sizeIds.map((id) => {
                      const z = SIZES.find((s) => s.id === id);
                      if (!z) return null;
                      return <SizeRow key={id} testid={`export-target-${id}`} label={nameOf(z, state.lang)} sub={dimsOf(z)} on={!!state.targets[id]} onClick={() => actions.toggleExportTarget(id)} ratio={{ w: z.w, h: z.h }} />;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function SizeRow({ label, sub, on, onClick, testid, ratio }: { label: string; sub: string; on: boolean; onClick: () => void; testid: string; ratio?: { w: number; h: number } }) {
  const k = ratio ? 22 / Math.max(ratio.w, ratio.h) : 0;
  return (
    <button data-testid={testid} aria-pressed={on} className="m-row m-press" onClick={onClick}>
      {ratio && (
        <span style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', flex: 'none' }}>
          <span style={{ width: ratio.w * k, height: ratio.h * k, borderRadius: 4, boxShadow: 'inset 0 0 0 1.6px var(--m-text2)' }} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span dir="ltr" className="m-caption" style={{ textAlign: 'start' }}>
          {sub}
        </span>
      </span>
      <span style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center', background: on ? 'var(--m-accent)' : 'transparent', boxShadow: on ? undefined : 'inset 0 0 0 1.6px var(--m-text3)', color: '#fff', transition: 'background-color .2s' }}>
        {on && <Glyph d={MI.check} size={15} sw={2.6} />}
      </span>
    </button>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" dir="ltr" style={{ position: 'relative', width: 51, height: 31, flex: 'none', borderRadius: 999, background: on ? '#34C759' : 'var(--m-elev3)', transition: 'background-color .25s var(--m-ease)' }}>
      <span style={{ position: 'absolute', top: 2, insetInlineStart: 2, width: 27, height: 27, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,.35)', transform: `translateX(${on ? 20 : 0}px)`, transition: 'transform .3s var(--m-ease)' }} />
    </span>
  );
}
