import type { DocElement } from '../state/elements';
import type { StudioActions } from '../state/StudioContext';
import type { StudioState } from '../state/types';
import { documentDuration } from './animTimeline';
import { sfxBytes } from './sfxLibrary';
import { decodeAll, mixCuesToWav, type MixCue } from './sfxMix';

/** **صوتٌ تلقائيّ للحركة** (٦ نوفمبر ٢٠٢٦) — زرٌّ واحد يقرأ حركاتِ المستند ويضع لكلّ حدثٍ
 * مهمّ صوتَه، ويخلطها في **طبقة صوتٍ واحدة** اسمها «أصوات الحركة» تُعدَّل وتُكتَم وتُحذَف
 * كأيّ صوت. الضغطُ مرّةً ثانية يستبدلها بنسخةٍ محدّثة بعد أيّ تعديلٍ على الحركة.
 *
 * القاعدةُ من إخراج الموشن: **صوتٌ لكلّ حدثٍ له معنى، لا صوتٌ لكلّ إطار.**
 * - دخولٌ بانزلاقٍ أو هبوطٍ أو من الجنب ← هبّة.
 * - دخولٌ بقفزة/تكبير/دوران ← بوب.
 * - تركيز ← هبّةٌ ناعمة بصوتٍ أخفض. والتلاشي وحده صامت.
 * - انتقالٌ (مؤثّر tr_*) ← هبّةٌ تقع ذروتُها على منتصفه.
 * - قطعٌ لمقطع فيديو أو صورة بلا حركة دخول ← هبّةٌ قصيرة.
 * - خروجٌ بصعودٍ أو تصغيرٍ أو تكبير ← هبّةٌ ناعمة.
 * والأحداثُ المتقاربة (أقلّ من ١٢٠ م.ث) تُدمج في صوتٍ واحد — الأقوى يغلب — ويُدار
 * الاختيارُ على عدّة أصوات من النوع نفسه كي لا يتكرّر الصوتُ ذاتُه حرفيًّا. */

export const AUTO_SFX_NAME = { ar: 'أصوات الحركة', en: 'Motion sounds' };

type Kind = 'whoosh' | 'pop' | 'soft' | 'cut' | 'transition';
const BANK: Record<Kind, string[]> = {
  whoosh: ['whoosh-18', 'whoosh-01', 'whoosh-07', 'whoosh-13'],
  pop: ['pop-05', 'pop-04', 'pop-01'],
  soft: ['whoosh-13', 'whoosh-12'],
  cut: ['whoosh-18', 'whoosh-01'],
  transition: ['whoosh-02', 'whoosh-15'],
};
const GAIN: Record<Kind, number> = { whoosh: -9, pop: -7, soft: -16, cut: -12, transition: -6 };
const RANK: Record<Kind, number> = { transition: 5, pop: 4, whoosh: 3, cut: 2, soft: 1 };

export interface SfxEvent {
  t: number;
  kind: Kind;
  /** للوكيل والمعاينة: أيّ عنصرٍ سبّبه. */
  source: string;
}

function isVisual(e: DocElement): boolean {
  return e.type !== 'audio' && e.visible !== false && e.id !== 'mz-background';
}

export function planAutoSfx(elements: DocElement[]): SfxEvent[] {
  const ev: SfxEvent[] = [];
  for (const e of elements) {
    if (e.type === 'fx') {
      if (String(e.fx).startsWith('tr_')) ev.push({ t: e.anim.start + e.anim.duration / 2, kind: 'transition', source: e.id });
      continue;
    }
    if (!isVisual(e)) continue;
    const a = e.anim;
    const p = a.preset;
    if (p === 'slide' || p === 'side' || p === 'drop') ev.push({ t: a.start, kind: 'whoosh', source: e.id });
    else if (p === 'pop' || p === 'spin' || p === 'shrink') ev.push({ t: a.start, kind: 'pop', source: e.id });
    else if (p === 'focus') ev.push({ t: a.start, kind: 'soft', source: e.id });
    else if ((p === 'none' || !p) && (e.type === 'video' || e.type === 'image') && a.start > 0.05) ev.push({ t: a.start, kind: 'cut', source: e.id });
    const x = a.exit;
    if (x && (x.kind === 'up' || x.kind === 'shrink' || x.kind === 'grow')) ev.push({ t: a.start + a.duration - x.seconds, kind: 'soft', source: e.id });
  }
  ev.sort((a, b) => a.t - b.t);
  const merged: SfxEvent[] = [];
  for (const e of ev) {
    const last = merged[merged.length - 1];
    if (last && e.t - last.t < 0.12) {
      if (RANK[e.kind] > RANK[last.kind]) merged[merged.length - 1] = { ...e, t: last.t };
      continue;
    }
    merged.push(e);
  }
  return merged;
}

export async function applyAutoSfx(ctx: { getState: () => StudioState; actions: StudioActions }, opts: { volume?: number } = {}): Promise<{ id: string; events: SfxEvent[] }> {
  const s0 = ctx.getState();
  const events = planAutoSfx(s0.elements);
  if (!events.length) throw new Error(s0.lang === 'ar' ? 'ما فيه حركات دخول أو انتقالات في المستند أحط لها صوت.' : 'No entrances or transitions to score.');
  const counters: Record<Kind, number> = { whoosh: 0, pop: 0, soft: 0, cut: 0, transition: 0 };
  const picks = events.map((e) => {
    const bank = BANK[e.kind];
    return { e, id: bank[counters[e.kind]++ % bank.length] };
  });
  const bufs = await decodeAll(new Map([...new Set(picks.map((p) => p.id))].map((id) => [id, () => sfxBytes(id)] as const)));
  const anims = s0.elements.filter((e) => e.type !== 'audio').map((e) => e.anim);
  const dur = Math.max(documentDuration(anims, s0.fps), events[events.length - 1].t + 1);
  const cues: MixCue[] = picks.map(({ e, id }) => ({ t: e.t, buf: bufs.get(id)!, db: GAIN[e.kind], long: e.kind === 'transition' }));
  const { wav } = mixCuesToWav(cues, dur);
  const name = s0.lang === 'ar' ? AUTO_SFX_NAME.ar : AUTO_SFX_NAME.en;
  // نسخةٌ سابقة تُستبدَل لا تتراكم.
  const isAuto = (e: DocElement) => e.type === 'audio' && (e.name === AUTO_SFX_NAME.ar || e.name === AUTO_SFX_NAME.en);
  if (s0.elements.some(isAuto)) ctx.actions.commitElements((els) => els.filter((e) => !isAuto(e)));
  const before = new Set(ctx.getState().elements.map((e) => e.id));
  await ctx.actions.insertAudioFromFile(new File([wav], `${name}.wav`, { type: 'audio/wav' }));
  // الإدراجُ يمرّ بـ setState؛ ننتظر حتى يظهر.
  let el: DocElement | undefined;
  for (let i = 0; i < 40 && !el; i++) {
    await new Promise((r) => setTimeout(r, 25));
    el = ctx.getState().elements.find((e) => !before.has(e.id) && e.type === 'audio');
  }
  if (!el) throw new Error(ctx.getState().audioError || 'audio was not inserted');
  const vol = Math.min(1, Math.max(0, opts.volume ?? 0.8));
  const id = el.id;
  ctx.actions.commitElements((els) => els.map((e) => (e.id === id ? ({ ...e, name, volume: vol, anim: { ...e.anim, start: 0, duration: dur } } as DocElement) : e)));
  return { id, events };
}
