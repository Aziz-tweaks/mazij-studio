import { useEffect, useRef } from 'react';
import { useStudio } from '../../state/StudioContext';
import { audibleGain, isSoundElement, mediaTimeAt, type SoundElement } from '../../lib/audioMix';

/** **مُشغِّلُ الصوت في المعاينة** (٢٥ أكتوبر ٢٠٢٦) — `<audio>` لكلّ طبقة صوتٍ وكلّ فيديو له
 * صوت، يُزامَن مع ساعة المشروع عند كلّ نبضة: يعمل حيث يقول `mediaTimeAt` وبالعلوّ الذي
 * يقوله `audibleGain`، ويقف خارج مقطعه وعند الإيقاف وأثناء السحب.
 *
 * **والساعةُ ساعةُ المشروع لا ساعةُ الملف**: المؤشّرُ يمشي بالزمن الحقيقيّ (`qa/motion-journey`
 * تقيسه)، والملفُّ يُعاد إليه إن انحرف عنه أكثر من ١٢٠ جزءًا من الألف — وهو ما يحدث عند
 * سحب المؤشّر أثناء التشغيل أو قفزةِ تكرارٍ في فيديو مكرَّر. وأقلُّ من ذلك يُترَك: إعادةُ
 * الموضع تقطع الصوتَ بنقرة، والانحرافُ الصغيرُ لا تسمعه أذن.
 *
 * والعناصرُ في الصفحة (مخفيّة) لا في الذاكرة وحدها: كي تُرى في أدوات المطوّر، وكي تقيسها
 * `qa/audio-track.spec.mjs` بالواجهة نفسها التي يسمعها المستعمل. */
export function AudioPlayback() {
  const { state } = useStudio();
  const refs = useRef(new Map<string, HTMLAudioElement>());
  const sources = state.elements.filter((e): e is SoundElement => isSoundElement(e) && !!e.src);

  useEffect(() => {
    for (const el of sources) {
      const a = refs.current.get(el.id);
      if (!a) continue;
      const gain = audibleGain(el);
      const m = mediaTimeAt(el, state.t);
      if (!state.playing || m === null || gain === 0) {
        if (!a.paused) a.pause();
        continue;
      }
      a.volume = gain;
      if (a.paused) {
        if (Number.isFinite(m)) a.currentTime = m;
        void a.play().catch(() => undefined);
      } else if (Math.abs(a.currentTime - m) > 0.12) {
        a.currentTime = m;
      }
    }
  });

  // إيقافُ كلّ شيء عند الخروج من المحرّر — لا يبقى صوتٌ بلا لوحة.
  useEffect(() => {
    const map = refs.current;
    return () => {
      for (const a of map.values()) a.pause();
    };
  }, []);

  return (
    <div data-testid="audio-players" hidden>
      {sources.map((el) => (
        <audio
          key={el.id}
          data-audio-for={el.id}
          src={el.src ?? undefined}
          preload="auto"
          ref={(node) => {
            if (node) refs.current.set(el.id, node);
            else refs.current.delete(el.id);
          }}
        />
      ))}
    </div>
  );
}
