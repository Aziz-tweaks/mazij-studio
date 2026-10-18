import { Icon } from './Icon';
import type { ToolId } from '../data/constants';
import { ICONS, TOOLS } from '../data/constants';
import { useStudio } from '../state/StudioContext';

/** الأدوات التي لا تُعرَض إلا على مستندٍ مُوقَّت — انظر الشرح في `ToolRail`. */
const TIMED_ONLY_TOOLS: ToolId[] = ['video', 'audio'];

export function ToolRail() {
  const { state, actions, dict: L } = useStudio();
  const isPro = state.mode === 'pro';
  // **السطحُ الثاني من الثلاثة.** الأدواتُ التي وجهتُها الحركةُ وحدها لا تُعرَض على
  // مستندٍ ساكن: «فيديو» تُدرِج عنصرًا لا معنى لمدّته على بوستر، و«صوت» وجهتُها
  // مسارٌ صوتيّ لا وجود له في صورة. ومن أرادهما بدَّل المقاسَ إلى وجهةٍ مُوقَّتة
  // فعادَتا في اللحظة — فهذا مُرشِّحٌ لا بوّابة.
  //
  // ولم يُستبدَل الحذفُ بـ«قريبًا»: «صوت» تبقى `'soon'` على المستند المُوقَّت
  // بلوحها المرئيّ كما كانت، و«قريبًا» لا تُغطّى بها هنا أدواتٌ تعمل — إنما لا
  // تُعرَض أدواةٌ لا وجهةَ لها في هذا المستند أصلًا.
  const tools = TOOLS.filter((t) => isPro || !t.pro).filter((t) => state.medium === 'timed' || !TIMED_ONLY_TOOLS.includes(t.id));

  return (
    <div
      style={{
        width: 64,
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '8px 0',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderInlineEndWidth: 'calc(1px + 0px)',
        borderRadius: 'var(--r)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {tools.map((tool) => {
        const active = state.tool === tool.id;
        return (
          <button
            key={tool.id}
            // زرٌّ واحد، أثران: يُسلِّح الأداة على اللوحة **ويبدّل لوح المحتوى**.
            // قبل هذا كان ينادي `setTool` وحدها، فالضغط على «أشكال» يغيّر حالة
            // داخليّة بلا أي أثر مرئي — وهو حرفيًّا ما وصفه المالك: «ضغطت أشكال
            // فلم تظهر قائمة أشكال». والقاعدة عامّة لكل أدوات الشريط لا للأشكال
            // وحدها؛ انظر `TOOL_LIBRARY` في `src/data/constants.ts`.
            onClick={() => actions.openToolLibrary(tool.id)}
            data-tool={tool.id}
            title={tool.key}
            style={{
              width: 52,
              height: 50,
              border: 0,
              borderRadius: 'var(--rs)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              background: active ? 'var(--accentSoft)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--muted)',
              fontSize: 10,
              fontWeight: 500,
            }}
          >
            <Icon size={20} path={ICONS[tool.id]} />
            <span>{L[`tool_${tool.id}` as keyof typeof L] as string}</span>
          </button>
        );
      })}
    </div>
  );
}
