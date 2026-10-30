import type { CSSProperties } from 'react';
import { Icon } from './Icon';
import { ICONS, TOOLS } from '../data/constants';
import { useStudio } from '../state/StudioContext';

/** شريط الإضافة — الأداة الشائعة: كلّ ما يُضاف إلى التصميم، بندٌ واحد لكلّ نوع.
 *
 * **وهو غير حبّة الأدوات.** كانت الاثنتان شريطًا واحدًا (`ToolRail`): «تحديد» و«قلم»
 * بجانب «صورة» و«لوتي»، أدواتُ رسمٍ وأبوابُ إدراجٍ في عمودٍ واحد — ثلاثة برامج مكدّسة
 * في شريط. فانقسمت كما في التصوّر المعتمد: أدوات الرسم بحروفها في حبّةٍ عائمة تحت
 * اللوحة (أداة المتّجهات)، وما يُضاف هنا (الأداة الشائعة). والمستند يقرّر البنود: الفيديو والصوت
 * والتأثيرات للمستند المُوقَّت وحده.
 *
 * **ونقرةٌ ثانية على البند نفسه تُغلق لوحه** — اللوح يطلع لمّا تحتاجه ويرجع. */
export function AddRail() {
  const { state, actions, dict: L } = useStudio();
  const timed = state.medium === 'timed';
  const lib = state.panel === 'library';
  const brandView = state.assetsTab === 'colors' || state.assetsTab === 'fonts';
  const imagesOn = state.panel === 'assets' && state.assetsTab === 'images';
  const videosOn = state.panel === 'assets' && state.assetsTab === 'videos';
  const uploadsOn = state.panel === 'assets' && !brandView && !imagesOn && !videosOn;
  const brandOn = state.panel === 'assets' && brandView;
  const keyOf = (id: string) => TOOLS.find((t) => t.id === id)?.key ?? '';

  return (
    <nav
      aria-label={L.rail_label}
      data-testid="add-rail"
      style={{
        width: 72,
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '8px 0',
        overflowY: 'auto',
        background: 'var(--bg)',
        borderInlineEnd: '1px solid var(--line)',
      }}
    >
      <RailBtn testid="open-templates-btn" icon={ICONS.templates} label={L.rail_templates} active={state.templatesOpen} onClick={actions.openTemplates} />
      <RailBtn rail="text" icon={ICONS.text} label={L.rail_text} active={lib && state.libraryTool === 'text'} onClick={() => actions.toggleRailPanel('library', { libraryTool: 'text' })} />
      <RailBtn panelTab="library" icon={ICONS.shape} label={L.rail_elements} active={lib && state.libraryTool === 'shape'} onClick={() => actions.toggleRailPanel('library', { libraryTool: 'shape' })} />
      {/* «صور» لوحٌ لا فخّ (٣٠ أكتوبر): كانت النقرةُ تُسلِّح أداةً ثم تفتح منتقيَ ملفّاتٍ
          عند أوّل نقرةٍ على اللوحة، بلا مكانٍ يُرى فيه ما رُفع قبلُ. الآن تفتح لوحًا فيه
          الرفعُ وصورُ المشروع، والحرفُ المختصر ما زال يُسلِّح الأداةَ لمن يريد النقرَ لمكانٍ بعينه. */}
      <RailBtn tool="image" icon={ICONS.image} label={L.rail_images} shortcut={keyOf('image')} active={imagesOn || state.tool === 'image'} onClick={() => (imagesOn ? actions.setPanel('props') : actions.toggleRailPanel('assets', { assetsTab: 'images' }))} />
      {timed && <RailBtn tool="video" icon={ICONS.video} label={L.rail_video} active={videosOn || state.tool === 'video'} onClick={() => (videosOn ? actions.setPanel('props') : actions.toggleRailPanel('assets', { assetsTab: 'videos' }))} />}
      <RailBtn tool="lottie" icon={ICONS.sticker} label={L.rail_stickers} active={(lib && state.libraryTool === 'lottie') || state.tool === 'lottie'} onClick={() => actions.toggleRailPanel('library', { libraryTool: 'lottie' })} />
      {timed && <RailBtn tool="audio" icon={ICONS.audio} label={L.rail_audio} active={lib && state.libraryTool === 'audio'} onClick={() => actions.openToolLibrary('audio')} />}
      {timed && <RailBtn tool="fx" icon={ICONS.fx} label={L.rail_fx} active={lib && state.libraryTool === 'fx'} onClick={() => actions.openToolLibrary('fx')} />}
      <div style={{ width: 32, height: 1, margin: '6px 0', background: 'var(--line)', flex: 'none' }} />
      <RailBtn panelTab="assets" icon={ICONS.upload} label={L.rail_uploads} active={uploadsOn} onClick={() => (uploadsOn ? actions.setPanel('props') : actions.toggleRailPanel('assets', { assetsTab: 'files' }))} />
      <RailBtn rail="brand" icon={ICONS.brand} label={L.rail_brand} active={brandOn} onClick={() => (brandOn ? actions.setPanel('props') : actions.toggleRailPanel('assets', { assetsTab: 'colors' }))} />
    </nav>
  );
}

function RailBtn({
  icon,
  label,
  active,
  onClick,
  testid,
  tool,
  panelTab,
  rail,
  shortcut,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
  testid?: string;
  tool?: string;
  panelTab?: string;
  rail?: string;
  shortcut?: string;
}) {
  const style: CSSProperties = {
    width: 62,
    height: 56,
    flex: 'none',
    border: 0,
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    background: active ? 'var(--seg)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--muted)',
    fontSize: 10.5,
    fontWeight: active ? 600 : 500,
  };
  return (
    <button
      className={active ? undefined : 'mz-rail-btn'}
      data-testid={testid}
      data-tool={tool}
      data-panel-tab={panelTab}
      data-rail={rail}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
      style={style}
    >
      <Icon size={20} path={icon} />
      <span style={{ maxWidth: 58, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}
