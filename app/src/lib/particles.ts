import type { DocElement, PropertyKeyframe, PropertyTracks } from '../state/elements';
import { defaultAnim, newElementId } from '../state/elements';
import { DEFAULT_BEZIER, type Bezier, type EasingId } from './easing';

/** **انفجارُ جُسيمات** — لا نوعَ رسمٍ جديد: دوائرُ صغيرةٌ حقيقيّةٌ في المستند، لكلٍّ
 * منها مساراتُ موضعٍ ومقياسٍ وشفافيّةٍ عاديّة، محدودةٌ بمقطعها ومجموعةٌ في `groupId`
 * واحد. فما يُرى في المعاينة هو حرفيًّا ما يُصدَّر في كلّ صيغة، ويستطيع المصمّم بعدها
 * أن يُحرّك المجموعة أو يُعيد تلوين جُسيمٍ أو يحذفه كأيّ عنصر. */
export interface ParticleBurstOptions {
  /** المركز بكسلًا على اللوحة. */
  cx: number;
  cy: number;
  count?: number;
  /** نصفُ قطرِ الانتشار بكسلًا. */
  radius?: number;
  /** قطرُ الجُسيم الأكبر بكسلًا (يتفاوت بين ٣٥٪ و١٠٠٪ منه). */
  size?: number;
  colors?: string[];
  start?: number;
  duration?: number;
  seed?: number;
}

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const kf = (time: number, value: number, easing: EasingId = 'easeOut'): PropertyKeyframe => ({
  id: newElementId('kf'),
  time: Math.round(time * 1000) / 1000,
  value,
  easing,
  bezier: [...DEFAULT_BEZIER] as Bezier,
});

export function particleBurst(opts: ParticleBurstOptions, page: { w: number; h: number }): DocElement[] {
  const count = Math.max(4, Math.min(160, Math.round(opts.count ?? 40)));
  const radius = opts.radius ?? Math.min(page.w, page.h) * 0.35;
  const size = opts.size ?? page.w * 0.012;
  const colors = opts.colors?.length ? opts.colors : ['#ff5ea8', '#ff9a3c', '#8b5cf6', '#3b82f6'];
  const start = Math.max(0, opts.start ?? 0);
  const dur = Math.max(0.2, opts.duration ?? 1.2);
  const rand = rng(opts.seed ?? 7);
  const groupId = newElementId('group');
  const out: DocElement[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.6;
    const dist = radius * (0.35 + rand() * 0.65);
    const d = size * (0.35 + rand() * 0.65);
    const life = dur * (0.7 + rand() * 0.3);
    // `x`/`y` في المسارات كسرٌ من **عرض** اللوحة كلاهما — انظر `ElementAnim.tracks`.
    const dx = (Math.cos(ang) * dist) / page.w;
    const dy = (Math.sin(ang) * dist) / page.w;
    const tracks: PropertyTracks = {
      x: [kf(0, 0), kf(life, dx)],
      y: [kf(0, 0), kf(life, dy + (0.04 * page.h) / page.w)],
      scale: [kf(0, 0.2), kf(life * 0.18, 1), kf(life, 0.4)],
      opacity: [kf(0, 0, 'linear'), kf(life * 0.06, 1, 'linear'), kf(life * 0.55, 1, 'linear'), kf(life, 0, 'linear')],
    };
    const anim = { ...defaultAnim('none', start, life), preset: 'none' as const, sourceIn: 0, bounded: true, tracks };
    out.push({
      id: newElementId('shape'),
      type: 'shape',
      name: `جُسيم ${i + 1}`,
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      groupId,
      geo: { x: (opts.cx - d / 2) / page.w, y: (opts.cy - d / 2) / page.h, w: d / page.w, h: d / page.h, rotation: 0 },
      shape: 'ellipse',
      fill: colors[i % colors.length],
      fillToken: 'ac',
      stroke: null,
      strokeWidth: 0,
      radius: 0,
      anim,
    } as DocElement);
  }
  return out;
}
