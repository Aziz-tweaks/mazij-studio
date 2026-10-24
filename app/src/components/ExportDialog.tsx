import { useEffect, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';
import { PALETTES, SIZES, PLATFORM_GROUPS, MEDIUM_CHIP, ICONS, FPS_OPTIONS, CUSTOM_SIZE_IDX, sizeAt, dimsOf, glyphStyle, nameOf, seg } from '../data/constants';
import { useStudio } from '../state/StudioContext';
import type { ExportResult } from '../state/types';
import { effectiveExportScale, estimateVideoExport } from '../lib/exportEstimate';
import { documentDuration } from '../lib/animTimeline';
import { SHUTTER_SAMPLE_OPTIONS } from '../lib/motionBlur';
import { renderArtboardPng } from '../lib/exportArtboard';

const IMG_FORMATS = ['png', 'jpg', 'svg'] as const;
const VID_FORMATS = ['mp4', 'gif'] as const;
const LIVE_FORMATS = ['livephoto'] as const;

/** Roadmap #23 — the action that actually turns an exported Live Photo pair into
 * a Live Photo.
 *
 * It sits on the result row rather than in the footer because a batch can
 * contain several Live Photo targets, and each pair has to be handed over
 * individually. Permission denial is the one failure a user can fix themselves,
 * so the sidecar's message is shown inline instead of being collapsed into a
 * generic error. */
function AddToPhotosButton({ result }: { result: ExportResult }) {
  const { dict: L } = useStudio();
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  if (!result.path || !result.pairedMovPath) return null;

  if (phase === 'done') {
    return <span data-testid={`add-to-photos-done-${result.id}`} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accentText)' }}>✓ {L.ex_lp_added}</span>;
  }

  return (
    <>
      <button
        data-testid={`add-to-photos-${result.id}`}
        disabled={phase === 'busy'}
        title={L.ex_lp_add_hint}
        onClick={async () => {
          setPhase('busy');
          setError('');
          try {
            const { addLivePhotoToPhotos } = await import('../lib/livePhotoExport');
            await addLivePhotoToPhotos(result.path!, result.pairedMovPath!);
            setPhase('done');
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setPhase('error');
          }
        }}
        style={{ height: 22, padding: '0 9px', border: '1px solid var(--line)', borderRadius: 'calc(var(--rs) - 3px)', background: 'transparent', color: 'var(--text)', fontSize: 11, fontWeight: 600, flexShrink: 0 }}
      >
        {phase === 'busy' ? L.ex_lp_adding : L.ex_lp_add}
      </button>
      {phase === 'error' && (
        <span data-testid={`add-to-photos-error-${result.id}`} dir="auto" style={{ color: 'var(--danger)', fontSize: 10.5, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{error}</span>
      )}
    </>
  );
}

function qBtnStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    height: 26,
    border: 0,
    borderRadius: 'calc(var(--rs) - 2px)',
    fontSize: 12,
    fontWeight: active ? 600 : 500,
    background: active ? 'var(--seg)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--muted)',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,.1)' : 'none',
  };
}

export function ExportDialog() {
  const { state, actions, dict: L } = useStudio();

  // **السطحُ الثالث من الثلاثة التي يتفرّع عليها `medium`.** وجهاتُ التصدير:
  // الساكنُ يُصدَّر صورةً، والمُوقَّتُ يُصدَّر صورةً **وفيديو**. فلا تُعرَض MP4/GIF
  // على بوسترٍ مربّع، ومن أرادهما بدَّل المقاسَ إلى وجهةٍ مُوقَّتة فظَهرتا في
  // اللحظة.
  //
  // ولم تُستبدَل بـ«قريبًا»: هي تعمل فعلًا، و«قريبًا» فوق سطحٍ عاملٍ تغطيةٌ لا
  // صِدق. الوجهاتُ تُحجَب لأنّ هذا المستند ليس وجهتَها، لا لأنها غير مبنيّة.
  //
  // و«الصورة الحيّة» لا تُحجَب في الحالتين: وجهتُها تطبيقُ الصور لا منصّةُ فيديو،
  // وهي أصلًا «صورةٌ بذيلٍ متحرّك» — فتبويبُها ليس هذا التفرّع، والخطّة لم تُسمِّها
  // في أيٍّ من العمودين (§4.2).
  const showVideoFormats = state.medium === 'timed';
  const videoFormatSelected = state.exportFormat === 'mp4' || state.exportFormat === 'gif';

  // وجهةٌ محجوبةٌ لا تبقى مختارة. `exportFormat` حالةٌ تدوم بين المستندات، فمستندٌ
  // اختير له MP4 ثم بُدِّل مقاسُه إلى بوسترٍ كان سيفتح هذا الحوارَ على صيغةٍ لا
  // يَعرضها زرٌّ — أي زرَّ تصديرٍ يُنفِّذ شيئًا لا يراه أحد، وهو بعينه ما تمنعه
  // القاعدةُ الرابعة. والتصحيحُ هنا لا في `StudioContext`: القرارُ قرارُ هذا
  // السطح، ومعرفتُه لا تُنسَخ إلى النموذج.
  useEffect(() => {
    if (state.exportOpen && !showVideoFormats && videoFormatSelected) actions.setExportFormat('png');
  }, [state.exportOpen, showVideoFormats, videoFormatSelected, actions]);

  // ═══════════════════════════════════════════════════════════════════════
  // المعاينة **هي** الملفّ، لا رسمٌ يُشبهه
  // ═══════════════════════════════════════════════════════════════════════
  //
  // كان لوحُ المعاينة أربعةَ عناصرِ DOM مكتوبةٍ باليد: قرصٌ في الزاوية، وشارةُ
  // «٥٠٪»، ومربّعٌ منقّط، وسطرٌ يقرأ نصَّ العنصر ذي المعرّف `'head'`. وتلك قطعُ
  // **البوستر التجريبيّ** بعينها — و`'head'` معرّفٌ لا يملكه إلا هو، فأيُّ مستندٍ
  // صنعه المستخدم (معرّفاته `text-<طابع زمني>`) كان يُعايَن بتصميمٍ ليس تصميمَه،
  // وبعنوانٍ فارغ. مستندٌ فيه مستطيلٌ رماديٌّ واحد يُعرَض قرصًا وشارةً ومربّعًا
  // منقّطًا لا وجودَ لأيٍّ منها فيه.
  //
  // **والعلاجُ ليس رسمًا أدقّ بل حذفُ الرسم:** تُنادى `renderArtboardPng` —
  // المُصيِّرُ نفسُه الذي سيكتب الملفَّ عند الضغط على «تصدير» — فتَصير المعاينةُ
  // الملفَّ مصغَّرًا، ويَستحيل أن يفترقا. وهذه قاعدةُ `AnimVisual` نفسُها بين
  // المعاينة ومُرمِّز الفيديو: مصدرٌ واحدٌ للحقيقة لا نسختان تتباعدان.
  //
  // ولا `time` تُمرَّر: `renderArtboardPng` تُصيِّر عند `settledTimeOf(spec)` —
  // اللحظةُ التي تنتهي عندها كلُّ المقاطع، وهي اللحظةُ التي يُكتَب عندها الملفُّ
  // الساكنُ فعلًا.
  //
  // **وعند التعذّر لا يُخترَع شيء:** تبقى خلفيّةُ اللوحة وحدها. لوحٌ فارغٌ صادقٌ
  // خيرٌ من تصميمٍ كاذب — وهو عينُ القاعدة الرابعة في الميثاق.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewSize = sizeAt(state.sizeIdx, state.customW, state.customH);
  // بصمةُ ما يُصيَّر: ما دامت كما هي فلا إعادةَ تصيير. `elements` كاملةً لأنّ
  // **أيَّ** تغيّرٍ في المستند يجب أن يَصِل إلى المعاينة — وهذا هو كلُّ الغرض.
  //
  // **ولا تُحسَب والحوارُ مغلق.** هذا المكوّنُ يُعاد تصييرُه مع كلّ تغيّرِ حالة
  // — ومنه كلُّ إطارِ سحبٍ على اللوحة — ويُعيد `null` باكرًا، لكنّ الخطّافات
  // تَعمل قبل ذلك. فبصمةٌ بلا شرطٍ كانت ستُسلسِل المستندَ كلَّه في كلّ إطار،
  // وهي تكلفةٌ تُدفَع لسطحٍ غيرِ معروض. مقيسةً: ٠٫٢٢٤ مللي للاستدعاء عند ٢٠٠
  // عنصرٍ، أي ١٣٫٥ مللي لكلّ ثانيةِ سحبٍ عند ٦٠ إطارًا (و٠٫٧ عند سبعة عناصر).
  // والشرطُ يُنزِلها إلى صفرٍ حيث لا تُرى.
  const previewKey = state.exportOpen
    ? JSON.stringify([state.elements, state.postPalette, state.sizeIdx, state.customW, state.customH, state.decorAccent, state.exportTransparent, state.lang])
    : '';
  useEffect(() => {
    if (!state.exportOpen) {
      setPreviewUrl(null);
      return;
    }
    let dead = false;
    let url: string | null = null;
    // مقياسٌ يكفي صندوقَ المعاينة على شاشةٍ مضاعفةِ الكثافة، لا دقّةُ التصدير
    // كاملةً: ٣٠٠ بكسلًا على الضلع الأطول ثم ×٢.
    const scale = Math.min(1, (300 * 2) / Math.max(previewSize.w, previewSize.h));
    renderArtboardPng({
      size: previewSize,
      palette: PALETTES[state.postPalette],
      elements: state.elements,
      transparent: state.exportTransparent,
      scale,
      lang: state.lang,
      decorAccent: state.decorAccent,
    })
      .then((blob) => {
        if (dead) return;
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      })
      .catch(() => {
        if (!dead) setPreviewUrl(null);
      });
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  if (!state.exportOpen) return null;

  const pal = PALETTES[state.postPalette];
  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  // طولُ المستند مشتقًّا — هو ما يَصِفه التذييل وما يُصدَّر فعلًا، لا الرقمُ ٥.
  const docDuration = documentDuration(state.elements.map((e) => e.anim), state.fps);
  const ratio = size.w / size.h;
  const tall = ratio < 1;
  const thumbStyle = {
    position: 'relative' as const,
    aspectRatio: `${size.w}/${size.h}`,
    ...(tall ? { height: '300px' } : { width: '244px' }),
    background: state.exportTransparent ? 'transparent' : pal.bg,
    overflow: 'hidden',
    borderRadius: 4,
    boxShadow: '0 12px 30px rgba(0,0,0,.25)',
  };

  const multiArtboard = state.exportAllArtboards && state.artboards.length > 1;
  const ownSizeMode = multiArtboard && state.exportArtboardOwnSize;
  // في وضع «كل لوحة بمقاسها» العدد هو عدد اللوحات بالضبط — ملفٌ لكل لوحة، لا ضربٌ
  // في قائمة المقاسات.
  const exportCount = ownSizeMode
    ? state.artboards.length
    : Object.values(state.targets).filter(Boolean).length * (multiArtboard ? state.artboards.length : 1);
  const customSize = sizeAt(CUSTOM_SIZE_IDX, state.customW, state.customH);
  const customOn = !!state.targets.custom;
  const isVideoFormat = state.exportFormat === 'mp4' || state.exportFormat === 'gif';
  // نفس الحاصل الذي يمرّ به `startExport` بالضبط: هدفٌ لكل مقاس مختار، مضروبًا في عدد
  // اللوحات عند تفعيل «كل اللوحات» — فما يُقدّره التذييل هو ما سيُكتب فعلًا، لا ملفًا
  // واحدًا منه. والمقياس هو الفعلي (`effectiveExportScale`) لا المعروض على المُبدِّل.
  const videoScale = effectiveExportScale(state.exportFormat, state.exportScale);
  const videoTargetDims = Object.entries(state.targets)
    .filter(([, on]) => on)
    .flatMap(([id]) => {
      const z = id === 'custom' ? customSize : SIZES.find((s) => s.id === id);
      if (!z) return [];
      const one = { w: Math.round(z.w * videoScale), h: Math.round(z.h * videoScale) };
      const copies = state.exportAllArtboards && state.artboards.length > 1 ? state.artboards.length : 1;
      return Array.from({ length: copies }, () => one);
    });
  const isLivePhotoFormat = state.exportFormat === 'livephoto';
  const noAlphaReason = state.exportFormat === 'mp4' ? L.ex_mp4_no_alpha : isLivePhotoFormat ? L.ex_livephoto_no_alpha : undefined;
  const noAlpha = !!noAlphaReason;

  return (
    <div onClick={actions.closeExport} style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--overlay)', display: 'grid', placeItems: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 800, maxWidth: '94vw', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'calc(var(--r) + 2px)', boxShadow: '0 30px 80px rgba(0,0,0,.35)', overflow: 'hidden', display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)' }}
      >
        <div style={{ background: 'var(--canvas)', display: 'grid', placeItems: 'center', padding: 28, borderInlineEnd: '1px solid var(--line)' }}>
          <div data-testid="export-preview" data-preview-ready={previewUrl ? 'true' : 'false'} style={thumbStyle}>
            {previewUrl && <img data-testid="export-preview-image" src={previewUrl} alt={L.ex_preview_alt} style={{ display: 'block', width: '100%', height: '100%' }} />}
          </div>
        </div>
        <div style={{ padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, flex: 1 }}>{L.ex_title}</h2>
            <button onClick={actions.closeExport} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}>
              <Icon size={16} path="M5 5l10 10M15 5L5 15" />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="mz-label">{L.ex_format}</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{L.ex_image}</span>
                <div style={{ display: 'flex', padding: 3, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2 }}>
                  {IMG_FORMATS.map((fmt) => {
                    const s = seg(state.exportFormat === fmt);
                    return (
                      <button key={fmt} onClick={() => actions.setExportFormat(fmt)} dir="ltr" style={{ flex: 1, height: 26, border: 0, borderRadius: 'calc(var(--rs) - 2px)', fontSize: 12, fontWeight: 600, background: s.bg, color: s.fg, boxShadow: s.sh }}>
                        {fmt.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
              {showVideoFormats && (
              <div data-testid="export-video-formats" style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{L.ex_video}</span>
                <div style={{ display: 'flex', padding: 3, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2 }}>
                  {VID_FORMATS.map((fmt) => {
                    const s = seg(state.exportFormat === fmt);
                    return (
                      <button key={fmt} onClick={() => actions.setExportFormat(fmt)} dir="ltr" style={{ flex: 1, height: 26, border: 0, borderRadius: 'calc(var(--rs) - 2px)', fontSize: 12, fontWeight: 600, background: s.bg, color: s.fg, boxShadow: s.sh }}>
                        {fmt.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
              )}
              <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{L.ex_livephoto}</span>
                <div style={{ display: 'flex', padding: 3, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2 }}>
                  {LIVE_FORMATS.map((fmt) => {
                    const s = seg(state.exportFormat === fmt);
                    return (
                      <button key={fmt} data-testid="export-format-livephoto" onClick={() => actions.setExportFormat(fmt)} style={{ flex: 1, height: 26, border: 0, borderRadius: 'calc(var(--rs) - 2px)', fontSize: 12, fontWeight: 600, background: s.bg, color: s.fg, boxShadow: s.sh }}>
                        {L.ex_livephoto}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span className="mz-label" style={{ flex: 1 }}>{L.ex_sizes}</span>
              <button
                data-testid="export-magic-resize-toggle"
                title={L.magic_resize_hint}
                onClick={() => actions.setExportMagicResize(!state.exportMagicResize)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 24, padding: '0 8px', marginInlineEnd: 8, border: `1px solid ${state.exportMagicResize ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 999, background: state.exportMagicResize ? 'var(--accentSoft)' : 'transparent', color: state.exportMagicResize ? 'var(--accentText)' : 'var(--muted)', fontSize: 10.5, fontWeight: 600 }}
              >
                <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid currentColor', display: 'grid', placeItems: 'center', flex: 'none' }}>
                  {state.exportMagicResize && <Icon size={8} strokeWidth={2.6} path="M4 10l4 4 8-8" />}
                </span>
                {L.ex_magic_resize}
              </button>
              {state.artboards.length > 1 && (
                <button
                  data-testid="export-all-artboards-toggle"
                  title={L.ex_all_artboards_hint}
                  onClick={() => actions.setExportAllArtboards(!state.exportAllArtboards)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 24, padding: '0 8px', marginInlineEnd: 8, border: `1px solid ${state.exportAllArtboards ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 999, background: state.exportAllArtboards ? 'var(--accentSoft)' : 'transparent', color: state.exportAllArtboards ? 'var(--accentText)' : 'var(--muted)', fontSize: 10.5, fontWeight: 600 }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid currentColor', display: 'grid', placeItems: 'center', flex: 'none' }}>
                    {state.exportAllArtboards && <Icon size={8} strokeWidth={2.6} path="M4 10l4 4 8-8" />}
                  </span>
                  {L.ex_all_artboards}
                </button>
              )}
              {/* زرّان وصلا من رحلتين مختلفتين ووقعا على الموضع نفسه. كلاهما يبقى:
                  أحدهما يحسم «ماذا نصدّر من اللوحات» والآخر «بأيّ المقاسات»، وهما
                  سؤالان مستقلّان لا بديلان. */}

              {/* نظير `select_all`: نقرةٌ واحدة تُرجِع الدفعة إلى مقاس المشروع وحده.
                  الأهداف الافتراضية أربعة لا يطابق المشروعَ منها إلا واحدٌ أحيانًا،
                  وعلى الفيديو يعني ذلك أربعة ترميزات كاملة بدل واحد. */}
              <button
                data-testid="export-only-project-size"
                title={L.ex_only_project_size_hint}
                onClick={actions.selectProjectSizeTarget}
                style={{ height: 24, padding: '0 8px', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--accentText)', fontSize: 11, fontWeight: 600 }}
              >
                {L.ex_only_project_size}
              </button>

              {/* «كل لوحة بمقاسها» تابعةٌ لـ«كل اللوحات» ولا معنى لها بدونها، فلا
                  تظهر إلا معها — خيارٌ معروضٌ في سياقٍ لا يصلح فيه هو نصف الشكوى
                  الأصلية («مليان أشياء غريبة»). */}
              {state.artboards.length > 1 && state.exportAllArtboards && (
                <button
                  data-testid="export-own-size-toggle"
                  title={L.ex_own_size_hint}
                  aria-pressed={state.exportArtboardOwnSize}
                  onClick={() => actions.setExportArtboardOwnSize(!state.exportArtboardOwnSize)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 24, padding: '0 8px', marginInlineEnd: 8, border: `1px solid ${state.exportArtboardOwnSize ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 999, background: state.exportArtboardOwnSize ? 'var(--accentSoft)' : 'transparent', color: state.exportArtboardOwnSize ? 'var(--accentText)' : 'var(--muted)', fontSize: 10.5, fontWeight: 600 }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid currentColor', display: 'grid', placeItems: 'center', flex: 'none' }}>
                    {state.exportArtboardOwnSize && <Icon size={8} strokeWidth={2.6} path="M4 10l4 4 8-8" />}
                  </span>
                  {L.ex_own_size}
                </button>
              )}
              <button onClick={actions.selectAllTargets} style={{ height: 24, padding: '0 8px', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--accentText)', fontSize: 11, fontWeight: 600 }}>{L.select_all}</button>
            </div>
            {/* قائمة المقاسات لا دور لها في وضع «كل لوحة بمقاسها»: تُعطَّل بصريًّا بدل
                أن تبقى تدعو إلى اختيارٍ لن يُقرأ. */}
            {ownSizeMode && (
              <div data-testid="export-own-size-note" style={{ padding: '8px 10px', borderRadius: 'var(--rs)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.6 }}>
                {L.ex_own_size_note(state.artboards.length)}
              </div>
            )}
            {/* `maxHeight`+`overflowY` هنا لا في الحوار كلّه: التجميعُ بالمنصّة
                (`PLATFORM_GROUPS`) أضاف عناوينَ مجموعاتٍ فوق الشبكة نفسها، فطولُ
                القائمة تجاوز ارتفاعَ النافذة بينما الحوارُ بلا تمرير — زرُّ الصيغة
                فوقها كان يخرج عن إطار العرض عمليًّا (`qa/batch-export.spec.mjs`
                أثبته: `locator.click` على PNG يسقط بمهلةٍ لأن العنصر "outside of
                the viewport"). فيتمرّر الشبكةُ وحدها، ويبقى الشريطُ العلويّ
                والتذييلُ (الصيغة/الجودة/أزرار التصدير) ثابتَين مرئيَّين دومًا. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 280, overflowY: 'auto', paddingInlineEnd: 4 }}>
              {/* مجموعاتٌ بالمنصّة (`PLATFORM_GROUPS`، مستقلّةٌ عن فهرسة `SIZES` —
                  نفسُ عقد `START_FORMATS`)، وبطاقةُ كلّ هدفٍ تحمل شارةَ طبيعته
                  (صورة/فيديو) بجدول `MEDIUM_CHIP` نفسه الذي تقرؤه بطاقةُ المقاس
                  في `ArtboardSizeMenu` — لا طبيعةً موازيةً، ولا تغييرَ في المعرّف
                  أو حالة التفعيل: كلُّ ما تغيّر هو التجميعُ البصريّ والشارة. */}
              {PLATFORM_GROUPS.map((group) => (
                <div key={group.id} style={{ display: 'contents' }}>
                  <div style={{ gridColumn: '1 / -1', fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', marginTop: 4 }}>{state.lang === 'ar' ? group.ar : group.en}</div>
                  {group.sizeIds.map((id) => {
                    const z = SIZES.find((s) => s.id === id);
                    if (!z) return null;
                    const on = !!state.targets[z.id];
                    const chip = MEDIUM_CHIP[z.kind];
                    return (
                      <button
                        key={z.id}
                        // مثل `export-target-custom` المجاور: يُعرَّف كلُّ هدفٍ بمعرّفه
                        // لا بنصّه المترجَم، فلا يبقى اختيارُ هدفٍ معتمدًا على مطابقة
                        // اسمٍ عربيٍّ قد يكون جزءًا من اسمٍ آخر بعد توسيع فهرس المقاسات.
                        data-testid={`export-target-${z.id}`}
                        data-on={on}
                        onClick={() => actions.toggleExportTarget(z.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, height: 54, padding: '0 10px', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--rs)', background: on ? 'var(--accentSoft)' : 'var(--surface2)', textAlign: 'start', color: 'var(--text)' }}
                      >
                        <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
                          <span style={glyphStyle(z, 26)} />
                        </span>
                        <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, fontSize: 12.5 }}>{nameOf(z, state.lang)}</span>
                          <span dir="ltr" style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'start' }}>{dimsOf(z)}</span>
                        </span>
                        <span data-testid={`size-medium-chip-${z.id}`} data-medium={z.kind} style={{ width: 18, height: 18, display: 'grid', placeItems: 'center', color: 'var(--muted)', flex: 'none' }} title={L[chip.labelKey]}>
                          <Icon size={12} path={ICONS[chip.icon]} />
                        </span>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', display: 'grid', placeItems: 'center', color: 'var(--onAccent)' }}>
                          {on && <Icon size={11} strokeWidth={2.4} path="M4 10l4 4 8-8" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
              <button
                data-testid="export-target-custom"
                data-on={customOn}
                onClick={() => actions.toggleExportTarget('custom')}
                style={{ display: 'flex', alignItems: 'center', gap: 10, height: 54, padding: '0 10px', border: `1.5px solid ${customOn ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--rs)', background: customOn ? 'var(--accentSoft)' : 'var(--surface2)', textAlign: 'start', color: 'var(--text)' }}
              >
                <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
                  <span style={glyphStyle(customSize, 26)} />
                </span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600, fontSize: 12.5 }}>{L.custom_size}</span>
                  <span dir="ltr" style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'start' }}>{dimsOf(customSize)}</span>
                </span>
                <span style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${customOn ? 'var(--accent)' : 'var(--line)'}`, background: customOn ? 'var(--accent)' : 'transparent', display: 'grid', placeItems: 'center', color: 'var(--onAccent)' }}>
                  {customOn && <Icon size={11} strokeWidth={2.4} path="M4 10l4 4 8-8" />}
                </span>
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{L.quality}</span>
              <div style={{ display: 'flex', padding: 3, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2 }}>
                <button onClick={() => actions.setExportQuality('high')} style={qBtnStyle(state.exportQuality === 'high')}>{L.q_high}</button>
                <button onClick={() => actions.setExportQuality('med')} style={qBtnStyle(state.exportQuality === 'med')}>{L.q_med}</button>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{L.scale}</span>
              {/* الفيديو يُصدَّر بدقّة اللوحة نفسها، فيُعطَّل المُبدِّل بسببٍ مكتوب
                  ويُعرَض ١× نشطًا — بنفس نمط تعطيل «خلفية شفافة» على MP4 أدناه. ولو
                  بقي مفتوحًا لأنتج مشروعُ «تيك توك» المكتوبُ 1080 × 1920 ملفًا
                  بأبعاد 2160 × 3840 (المُضاعِف الافتراضي ٢). */}
              <div dir="ltr" title={isVideoFormat ? L.ex_video_scale_locked : undefined} style={{ display: 'flex', padding: 3, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2, opacity: isVideoFormat ? 0.55 : 1 }}>
                {([1, 2, 3] as const).map((s) => (
                  <button
                    key={s}
                    data-testid={`export-scale-${s}`}
                    disabled={isVideoFormat}
                    onClick={() => actions.setExportScale(s)}
                    style={{ ...qBtnStyle(isVideoFormat ? s === 1 : state.exportScale === s), cursor: isVideoFormat ? 'not-allowed' : 'pointer' }}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{L.transparent}</span>
              <div style={{ height: 32, display: 'flex', alignItems: 'center' }} title={noAlphaReason}>
                <button
                  data-testid="export-transparent-toggle"
                  disabled={noAlpha}
                  onClick={() => actions.setExportTransparent(!state.exportTransparent)}
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 999,
                    background: state.exportTransparent && !noAlpha ? 'var(--accent)' : 'var(--line)',
                    position: 'relative',
                    display: 'inline-block',
                    border: 0,
                    padding: 0,
                    opacity: noAlpha ? 0.4 : 1,
                    cursor: noAlpha ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span style={{ position: 'absolute', top: 2, [state.exportTransparent && !noAlpha ? 'insetInlineEnd' : 'insetInlineStart']: 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--surface)', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
                </button>
              </div>
            </div>
          </div>

          {isVideoFormat && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="mz-label">{L.ex_fps}</span>
              <div dir="ltr" style={{ display: 'flex', padding: 3, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2 }}>
                {FPS_OPTIONS[state.exportFormat as 'mp4' | 'gif'].map((f) => (
                  <button key={f} onClick={() => actions.setExportFps(f)} style={qBtnStyle(state.exportFps === f)}>{f}</button>
                ))}
              </div>
            </div>
          )}

          {/* ضبابُ الحركة. الثمنُ مكتوبٌ **تحت المِقبض** لا في وثيقة: الخيارُ يُضاعف
              زمنَ التصدير، ومن ضغط ١٦ يستحقّ أن يعرف ذلك قبل أن يَنتظر. والافتراضُ
              `1` — فلا مستندٌ قائمٌ يَدفع ثمنًا لم يَطلبه. */}
          {isVideoFormat && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="mz-label">{L.ex_shutter}</span>
              <div data-testid="export-shutter" dir="ltr" style={{ display: 'flex', padding: 3, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2 }}>
                {SHUTTER_SAMPLE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    data-testid={`export-shutter-${n}`}
                    data-on={state.exportShutterSamples === n}
                    onClick={() => actions.setExportShutterSamples(n)}
                    style={qBtnStyle(state.exportShutterSamples === n)}
                  >{n === 1 ? L.ex_shutter_off : `${n}×`}</button>
                ))}
              </div>
              {state.exportShutterSamples > 1 && (
                <>
                  <span data-testid="export-shutter-cost" dir="auto" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {L.ex_shutter_cost} · ×{state.exportShutterSamples}
                  </span>
                  {/* **فارقُ المعاينة يُقال، لا يُترَك ليُكتشَف.** المعاينةُ شجرةُ
                      عناصرِ DOM والتصديرُ قُماش، فلا سبيلَ في الأولى إلى تجميع N
                      عيّنة. والعقدُ المكتوب في `animTimeline.ts:125-137` عقدُ
                      **حالة** لا عقدُ بكسل، وهو محفوظٌ كما كان. لكنّ المصمّمَ لا
                      يقرأ ذلك العقد — فما يراه أن ما صدّره ليس ما عايَنه.
                      و`docs/DECISION-motion-blur-parity.md` يُقيس البديلَ ويوصي
                      به؛ وإلى أن يَصِل، يُقال هنا. */}
                  <span data-testid="export-shutter-preview-note" dir="auto" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {L.ex_shutter_preview}
                  </span>
                </>
              )}
            </div>
          )}

          {isLivePhotoFormat && (
            <div data-testid="export-livephoto-hint" style={{ padding: '8px 10px', borderRadius: 'var(--rs)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.6 }}>
              {L.ex_livephoto_hint}
            </div>
          )}

          {state.exportState === 'busy' && (
            <div style={{ height: 6, borderRadius: 999, background: 'var(--surface2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round(state.exportProgress)}%`, background: 'var(--accent)', transition: 'width .1s linear' }} />
            </div>
          )}

          {state.exportResults.length > 0 && (
            <div data-testid="export-results" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
              <span className="mz-label">{L.ex_results}</span>
              {state.exportResults.map((r) => (
                <div key={r.id} data-testid={`export-result-${r.id}`} data-ok={r.ok} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', display: 'grid', placeItems: 'center', background: r.ok ? 'var(--accentSoft)' : 'rgba(255,107,107,.14)', color: r.ok ? 'var(--accentText)' : 'var(--danger)', flexShrink: 0 }}>
                    {r.ok ? <Icon size={10} strokeWidth={2.4} path="M4 10l4 4 8-8" /> : <Icon size={10} strokeWidth={2.4} path="M5 5l10 10M15 5L5 15" />}
                  </span>
                  <span style={{ flex: 1 }}>{r.label}</span>
                  {/* أبعاد الملف المكتوب، لا الهدف الاسمي — انظر `ExportResult.outW`. */}
                  <span dir="ltr" data-out={r.outW ? `${r.outW}x${r.outH}` : ''} style={{ color: 'var(--muted)' }}>{r.outW ?? r.w}×{r.outH ?? r.h}</span>
                  {r.ok && <AddToPhotosButton result={r} />}
                  {!r.ok && <span style={{ color: 'var(--danger)', fontSize: 11, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.error}</span>}
                </div>
              ))}
            </div>
          )}

          {state.exportState === 'unavailable' && (
            <div style={{ padding: '8px 10px', borderRadius: 'var(--rs)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12 }}>
              {isLivePhotoFormat ? L.ex_livephoto_unavailable : L.ex_unavailable}
            </div>
          )}
          {state.exportState === 'error' && state.exportResults.length === 0 && (
            <div style={{ padding: '8px 10px', borderRadius: 'var(--rs)', background: 'rgba(255,107,107,.12)', color: 'var(--danger)', fontSize: 12 }}>{L.ex_error}{state.exportError ? `: ${state.exportError}` : ''}</div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'start' }}>
              {/* تقديرٌ حيّ «المدّة · عدد الملفات · الحجم» قبل الضغط على التصدير
                  (`re-capcut-flows.md` §4.2 و§5 «الوصيف»). على الفيديو هذا ليس
                  تحسينًا تجميليًا: المصمّم لم يكن يعرف — قبل أن ينتظر — أن الأهداف
                  الافتراضية الأربعة تعني أربعة ترميزات كاملة، ولا كم ستطول. */}
              {isVideoFormat && (
                <span data-testid="export-estimate" dir="auto" style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {(() => {
                    const est = estimateVideoExport(videoTargetDims, state.exportFormat as 'mp4' | 'gif', state.exportFps, state.exportQuality, docDuration);
                    return L.ex_estimate(est.seconds, est.files, est.megabytes);
                  })()}
                </span>
              )}
              <span dir="ltr" style={{ fontSize: 12, color: 'var(--muted)' }}>{L.reveal_folder}</span>
            </span>
            {(state.exportState === 'idle' || state.exportState === 'unavailable' || state.exportState === 'error') && (
              <>
                <button onClick={actions.closeExport} style={{ height: 34, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--text)', fontSize: 13 }}>{L.cancel}</button>
                {/* **مقبضٌ ثابتٌ للفعل الرئيسيّ، ولِمَ لم يكن قبل اليوم.** لافتةُ
                    هذا الزرِّ جملةٌ لا رقم: `exportN` تُصرِّف العددَ عربيًّا —
                    «ملف واحد» ثمّ «ملفين» ثمّ «٣ ملفات» — فالواحدُ والاثنان لا
                    يَحملان رقمًا أصلًا. وثلاثةُ اختباراتٍ (`controls` و
                    `live-photo-export` و`video-export`) كانت تُمسِك الزرَّ بمطابقةِ
                    رقمٍ في جملته، فكانت تُمسِكه بفضلِ أنّ الأهدافَ الافتراضيّة
                    كانت أربعة. ويومَ صارت واحدًا اختفى الرقمُ فلم تَجد الثلاثةُ
                    زرًّا تَضغطه، فسقطت بانتهاءِ المهلة لا بتأكيدٍ أحمر — وهو
                    أسوأُ السقوطَين: لا يَقول ما العطل. فصار للزرِّ معرّفٌ يُمسَك
                    به بما هو لا بنحويّةِ لافتته. */}
                <button data-testid="export-submit" onClick={actions.startExport} style={{ height: 34, padding: '0 18px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 600, fontSize: 13, opacity: exportCount ? 1 : 0.5 }}>
                  {L.exportN(exportCount)}
                </button>
              </>
            )}
            {state.exportState === 'busy' && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{L.exporting} <bdi>{Math.round(state.exportProgress)}%</bdi></span>
            )}
            {state.exportState === 'done' && (
              <>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accentText)' }}>✓ {L.ex_done}</span>
                <button
                  onClick={async () => {
                    const first = state.exportedPaths[0];
                    if (!first) return;
                    const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
                    await revealItemInDir(first).catch(() => undefined);
                  }}
                  style={{ height: 34, padding: '0 18px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 600, fontSize: 13 }}
                >
                  {L.open_folder}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
