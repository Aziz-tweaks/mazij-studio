import { TOOL_LIBRARY } from '../../data/constants';
import { useStudio } from '../../state/StudioContext';
import { ShapesLibrary } from './ShapesLibrary';

/** لوح محتوى الأداة المختارة.
 *
 * هذا هو المَفصِل الذي طُلب تركه في موضعه الصحيح: **كل أداة في شريط الأدوات تفتح
 * لوحًا**، لا الأشكال وحدها. القاعدة من محرّر فيديو شائع — أحد عشر تبويبًا، كلٌّ منها يبدّل
 * لوح المكتبة، فـ«ضغطت ولم يحدث شيء» مستحيلة بنيويًّا (`re-capcut-flows.md` §2.1،
 * §5.1) — ومزيج اليوم عكسها: `setTool()` وحدها بلا أثر مرئي، لكل أداة لا للأشكال
 * فقط. وذلك هو الجذر الحقيقي لشكوى المالك.
 *
 * **ما بُني**: الأشكال. **وما بقي**: نصّ، قلم، صورة، لوتي، فيديو، صوت، تأثيرات —
 * ولكلٍّ منها لوحٌ **يسمّي الأداة ويعلن «قريبًا»**، لأن الصمت ليس بديلًا مقبولًا
 * وقاعدة المشروع أن المعطَّل يُعرَض معطَّلًا لا يُخفى. إضافة لوحٍ حقيقي لاحقًا =
 * تبديل `'soon'` إلى `'ready'` في `TOOL_LIBRARY` + فرع واحد أدناه. لا نظام ألواح
 * ثانٍ، ولا لوح منفصل بجانب هذا. */
export function LibraryTab() {
  const { state, dict: L } = useStudio();
  const tool = state.libraryTool;
  const status = TOOL_LIBRARY[tool];
  const toolName = L[`tool_${tool}` as keyof typeof L] as string;

  if (status === 'ready' && tool === 'shape') return <ShapesLibrary />;

  return (
    <div data-testid={`library-soon-${tool}`} style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{toolName}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 999,
            background: 'var(--surface2)',
            color: 'var(--muted)',
            border: '1px solid var(--line)',
          }}
        >
          {L.soon}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.7, color: 'var(--muted)' }}>{L.lib_soon_body}</p>
      {/* الأداة نفسها تبقى مسلَّحة على اللوحة: «قريبًا» هنا تخصّ **لوح المحتوى**
          (مكتبة تُستعرَض)، لا القدرة. فمن يعرف الإيماءة يواصل عمله، ومن لا يعرفها
          يقرأ على الأقل جوابًا مكتوبًا بدل لوحٍ فارغ. */}
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.7, color: 'var(--muted)' }}>{L.lib_soon_tool_active}</p>
    </div>
  );
}
