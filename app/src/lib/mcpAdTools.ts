import type { McpTool, McpCtx } from './mcpTools';
import type { DocElement, GradientStop, PropertyKeyframe, SceneMotion } from '../state/elements';
import { newElementId, defaultAnim } from '../state/elements';
import { DEFAULT_BEZIER, EASING_IDS, type Bezier, type EasingId } from './easing';
import { currentAppearance, newFillLayer, newShadowLayer, newStrokeLayer } from './appearance';
import { sizeAt } from '../data/constants';
import type { GlassStyle } from './glass';

/** **أدواتُ مِزو الجديدة** (١ نوفمبر ٢٠٢٦) — ما احتاجه إعلانُ خارجيّ ولم يكن في مزيج:
 * التمطيطُ حسب السرعة، والزجاجُ المضبَّب، والعناصرُ الحيّة، ولمعةُ النصّ، وحركةُ المشهد
 * («الدخول في الشاشة»)، والخلفيّةُ المنسابة، وتدرّجُ المحطّات، ووضعُ «جمع الضوء»، وتركيبُ
 * المؤثّرات الصوتيّة من ملفّ توقيت. كلُّ طولٍ يدخل **بكسلًا على اللوحة الحاليّة**، وكلُّ زمنٍ
 * **ثوانٍ مطلقة** على الخطّ الزمنيّ ما لم يُذكر غيرُ ذلك. */

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 30));
}
function page(ctx: McpCtx) {
  const s = ctx.getState();
  return sizeAt(s.sizeIdx, s.customW, s.customH);
}
function need(ctx: McpCtx, id: unknown): DocElement {
  if (typeof id !== 'string' || !id) throw new Error('missing required "id"');
  const el = ctx.getState().elements.find((e) => e.id === id);
  if (!el) throw new Error(`no element with id "${id}"`);
  return el;
}
const n = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
const s = (v: unknown, f?: string) => (typeof v === 'string' ? v : f);
const easingOf = (v: unknown, f: EasingId = 'easeOut'): EasingId => (typeof v === 'string' && (EASING_IDS as string[]).includes(v) ? (v as EasingId) : f);
const kf = (time: number, value: number, easing: EasingId = 'linear', bezier: Bezier = DEFAULT_BEZIER): PropertyKeyframe => ({
  id: newElementId('kf'),
  time: Math.round(time * 1000) / 1000,
  value,
  easing,
  bezier: [...bezier] as Bezier,
});
function patch(ctx: McpCtx, id: string, fn: (e: DocElement) => DocElement) {
  ctx.actions.commitElements((els) => els.map((e) => (e.id === id ? fn(e) : e)));
}
function setGlass(ctx: McpCtx, el: DocElement, glass: GlassStyle | undefined) {
  patch(ctx, el.id, (e) => ({ ...e, glass }) as DocElement);
}
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const oC = (u: number) => 1 - Math.pow(1 - u, 3);
const oE = (u: number) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));
const iC = (u: number) => u * u * u;
const ioC = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const prog = (t: number, a: number, b: number) => clamp((t - a) / Math.max(1e-6, b - a));

const SHAPE_ONLY = (el: DocElement) => el.type === 'shape' && (el.shape === 'rect' || el.shape === 'ellipse');

export const AD_TOOLS: McpTool[] = [
  {
    name: 'element_set_stretch',
    descriptionAr: 'تمطيطٌ حسب السرعة: متى تحرّك العنصر بمفاتيح x/y بسرعة يتمطّط على محور حركته ويتضبّب بقدر سرعته وتظهر خلفه نسخٌ باهتة — تلقائيًّا بلا مفاتيح. amount ١ افتراضي، ١٫٤ للكلمات البطلة. remove=true يلغيه.',
    descriptionEn: 'Velocity stretch: while the element moves fast via x/y keys it stretches along its motion axis, blurs with speed and leaves faint trailing copies — automatic, no extra keys. amount 1 default, 1.4 for hero words. remove=true clears it.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, amount: { type: 'number' }, trail: { type: 'number' }, remove: { type: 'boolean' } }, required: ['id'], additionalProperties: false },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      const stretch = args.remove ? undefined : { amount: Math.max(0, n(args.amount, 1)), trail: clamp(Math.round(n(args.trail, 3)), 0, 3) };
      patch(ctx, el.id, (e) => ({ ...e, anim: { ...e.anim, stretch } }) as DocElement);
      await flush();
      return { id: el.id, stretch: stretch ?? null };
    },
  },
  {
    name: 'element_set_frost',
    descriptionAr: 'زجاجٌ مضبَّب لبطاقة (مستطيل أو دائرة): جسمٌ داكنٌ شفّاف، وصبغة، ولمعةٌ علويّة، وحدٌّ أبيضُ شفّاف، وظلٌّ ساقط — أو توهّجٌ ملوّن بدل الظلّ (glow). remove=true يلغيه.',
    descriptionEn: 'Frosted glass card material (rect/ellipse): dark translucent body, tint, top sheen, translucent white edge and a drop shadow — or a colored glow instead (glow). remove=true clears it.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, body: { type: 'string' }, tint: { type: 'string' }, edge: { type: 'string' }, edgeWidth: { type: 'number' }, sheen: { type: 'number' }, glow: { type: 'string' }, shadow: { type: 'number' }, remove: { type: 'boolean' } },
      required: ['id'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      if (!SHAPE_ONLY(el)) throw new Error('frost works on rect and ellipse shapes');
      const glass: GlassStyle | undefined = args.remove
        ? undefined
        : {
            mode: 'frost',
            colors: [],
            frost: {
              ...(s(args.body) ? { body: s(args.body) } : {}),
              ...(s(args.tint) ? { tint: s(args.tint) } : {}),
              ...(s(args.edge) ? { edge: s(args.edge) } : {}),
              ...(typeof args.edgeWidth === 'number' ? { edgeWidth: args.edgeWidth } : {}),
              ...(typeof args.sheen === 'number' ? { sheen: args.sheen } : {}),
              ...(s(args.glow) ? { glow: s(args.glow) } : {}),
              ...(typeof args.shadow === 'number' ? { shadow: args.shadow } : {}),
            },
          };
      setGlass(ctx, el, glass);
      await flush();
      return { id: el.id, glass: glass ?? null };
    },
  },
  {
    name: 'element_set_live',
    descriptionAr: 'يحوّل مستطيلًا/دائرة إلى عنصرٍ حيّ يرسم نفسه مع الزمن: wave = موجة صوت تتراقص ويتلوّن ما شُغّل منها (playFrom/playTo)، chart = منحنى يرسم نفسه من اليسار لليمين بتعبئة تحته ونقطة على رأسه (points ٠..١، from/to)، ring = حلقة تتعبّأ من قيمة لقيمة (valueFrom/valueTo، from/to) ويتحوّل لونها عند hitAt. الأزمنة ثوانٍ مطلقة. remove=true يلغيه.',
    descriptionEn: 'Turn a rect/ellipse into a live element that draws itself over time: wave = dancing audio bars, played part colored (playFrom/playTo); chart = a curve drawing itself left→right with an area fill and a head dot (points 0..1, from/to); ring = a progress ring filling valueFrom→valueTo over from/to, recoloring at hitAt. Absolute seconds. remove=true clears it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        kind: { type: 'string', enum: ['wave', 'chart', 'ring'] },
        bars: { type: 'number' },
        barWidth: { type: 'number' },
        playFrom: { type: 'number' },
        playTo: { type: 'number' },
        phase: { type: 'number' },
        points: { type: 'array', items: { type: 'number' } },
        from: { type: 'number' },
        to: { type: 'number' },
        valueFrom: { type: 'number' },
        valueTo: { type: 'number' },
        hitAt: { type: 'number' },
        width: { type: 'number' },
        colors: { type: 'array', items: { type: 'string' } },
        hitColors: { type: 'array', items: { type: 'string' } },
        played: { type: 'string' },
        unplayed: { type: 'string' },
        stroke: { type: 'string' },
        glow: { type: 'string' },
        remove: { type: 'boolean' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      if (!SHAPE_ONLY(el)) throw new Error('live elements are rect or ellipse shapes');
      if (args.remove) {
        setGlass(ctx, el, undefined);
        await flush();
        return { id: el.id, live: null };
      }
      const kind = s(args.kind, 'wave');
      const two = (v: unknown): [string, string] | undefined => (Array.isArray(v) && v.length >= 2 && typeof v[0] === 'string' && typeof v[1] === 'string' ? [v[0], v[1]] : undefined);
      let glass: GlassStyle;
      if (kind === 'wave') {
        glass = { mode: 'wave', colors: [], wave: { playFrom: n(args.playFrom, el.anim.start), playTo: n(args.playTo, el.anim.start + el.anim.duration), ...(typeof args.bars === 'number' ? { bars: args.bars } : {}), ...(typeof args.barWidth === 'number' ? { barWidth: args.barWidth } : {}), ...(typeof args.phase === 'number' ? { phase: args.phase } : {}), ...(s(args.played) ? { played: s(args.played) } : {}), ...(s(args.unplayed) ? { unplayed: s(args.unplayed) } : {}), ...(s(args.glow) ? { glow: s(args.glow) } : {}) } };
      } else if (kind === 'chart') {
        const pts = Array.isArray(args.points) ? (args.points as unknown[]).filter((v): v is number => typeof v === 'number') : [0, 0.3, 0.6, 1];
        glass = { mode: 'chart', colors: [], chart: { points: pts, from: n(args.from, el.anim.start), to: n(args.to, el.anim.start + 1.4), ...(s(args.stroke) ? { stroke: s(args.stroke) } : {}), ...(typeof args.width === 'number' ? { width: args.width } : {}), ...(s(args.glow) ? { glow: s(args.glow) } : {}) } };
      } else if (kind === 'ring') {
        glass = { mode: 'ring', colors: [], ring: { valueFrom: n(args.valueFrom, 0), valueTo: n(args.valueTo, 100), from: n(args.from, el.anim.start), to: n(args.to, el.anim.start + 1.3), ...(typeof args.hitAt === 'number' ? { hitAt: args.hitAt } : {}), ...(typeof args.width === 'number' ? { width: args.width } : {}), ...(two(args.colors) ? { colors: two(args.colors) } : {}), ...(two(args.hitColors) ? { hitColors: two(args.hitColors) } : {}), ...(s(args.glow) ? { glow: s(args.glow) } : {}) } };
      } else throw new Error(`unknown live kind "${kind}"`);
      setGlass(ctx, el, glass);
      await flush();
      return { id: el.id, live: glass };
    },
  },
  {
    name: 'text_set_sheen',
    descriptionAr: 'لمعةُ ضوءٍ تعبر حروف نصّ من اليمين لليسار بين from وto (ثوانٍ مطلقة). تُلبَس على نسخةٍ من النصّ فوقه: duplicate=true (الافتراضي) يُنشئ النسخة ويُرجع معرّفها.',
    descriptionEn: 'A light sheen sweeping right→left across a text between from/to (absolute seconds). Worn by a copy of the text on top: duplicate=true (default) creates that copy and returns its id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, from: { type: 'number' }, to: { type: 'number' }, band: { type: 'number' }, color: { type: 'string' }, travel: { type: 'number' }, duplicate: { type: 'boolean' } }, required: ['id', 'from', 'to'], additionalProperties: false },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      if (el.type !== 'text') throw new Error('text_set_sheen works on text elements');
      const glass: GlassStyle = { mode: 'sheen', colors: [], sheen: { from: n(args.from, 0), to: n(args.to, 1), ...(typeof args.band === 'number' ? { band: args.band } : {}), ...(s(args.color) ? { color: s(args.color) } : {}), ...(typeof args.travel === 'number' ? { travel: args.travel } : {}) } };
      if (args.duplicate === false) {
        setGlass(ctx, el, glass);
        await flush();
        return { id: el.id };
      }
      const id = newElementId('text');
      const copy = { ...el, id, name: `${el.name ?? 'نص'} · لمعة`, glass, appearance: { ...currentAppearance(el), shadows: [] } } as DocElement;
      ctx.actions.commitElements((els) => {
        const i = els.findIndex((e) => e.id === el.id);
        const out = [...els];
        out.splice(i + 1, 0, copy);
        return out;
      });
      await flush();
      return { id, of: el.id };
    },
  },
  {
    name: 'scene_motion',
    descriptionAr: 'حركةٌ لمشهدٍ كامل (مجموعة عناصر) كطبقةٍ واحدة حول مركز: مقياس وعتامة وضبابيّة بمفاتيح بثوانٍ مطلقة — فوق حركة كلّ عنصر لا بدلًا منها. preset="zoom-through" يبني انتقال «الدخول في الشاشة»: يدخل المشهد من 0.86 مضبّبًا، ويقرّب ببطء push طول مدّته، ثم يكبر لـ1.28 ويتضبّب ويختفي خلال out ثانية بعد end. ويمدّ مقاطع العناصر لتغطّي الخروج.',
    descriptionEn: 'Motion for a whole scene (a set of elements) as one layer about a center: scale/opacity/blur keys in absolute seconds, on top of each element\'s own motion. preset="zoom-through" builds the "dive into the screen" transition: the scene settles from 0.86 blurred, pushes in slowly (push) for its length, then grows to 1.28, blurs and fades within `out` seconds after `end`. Extends the elements\' clips to cover the exit.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        center: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
        preset: { type: 'string', enum: ['zoom-through'] },
        start: { type: 'number' },
        end: { type: 'number' },
        first: { type: 'boolean', description: 'first scene: no entrance (default false)' },
        last: { type: 'boolean', description: 'last scene: no exit (default false)' },
        push: { type: 'number' },
        out: { type: 'number' },
        keys: { type: 'array', items: { type: 'object', properties: { t: { type: 'number' }, scale: { type: 'number' }, opacity: { type: 'number' }, blur: { type: 'number' }, easing: { type: 'string', enum: EASING_IDS } }, required: ['t'] } },
        remove: { type: 'boolean' },
      },
      required: ['ids'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const pg = page(ctx);
      const ids = Array.isArray(args.ids) ? (args.ids as unknown[]).filter((x): x is string => typeof x === 'string') : [];
      for (const id of ids) need(ctx, id);
      if (args.remove) {
        ctx.actions.commitElements((els) => els.map((e) => (ids.includes(e.id) ? ({ ...e, anim: { ...e.anim, scene: undefined } } as DocElement) : e)));
        await flush();
        return { cleared: ids.length };
      }
      const c = args.center && typeof args.center === 'object' ? (args.center as Record<string, unknown>) : {};
      const cx = n(c.x, pg.w / 2) / pg.w;
      const cy = n(c.y, pg.h / 2) / pg.h;
      const tracks: SceneMotion['tracks'] = {};
      let clipEnd: number | null = null;
      let clipStart: number | null = null;
      if (args.preset === 'zoom-through') {
        const a = n(args.start, 0);
        const b = n(args.end, a + 3);
        const out = n(args.out, 0.38);
        const push = n(args.push, 0.03);
        const first = !!args.first;
        const last = !!args.last;
        const sc: PropertyKeyframe[] = [];
        const op: PropertyKeyframe[] = [];
        const bl: PropertyKeyframe[] = [];
        const d = b - a;
        const end = last ? b : b + out;
        // كثافةُ إطارٍ في نافذتَي الدخول والخروج (حيث تتراكب المنحنيات)، ومفتاحان بينهما للتقريب البطيء.
        const times = new Set<number>();
        for (let t = a; t <= Math.min(b, a + 0.6) + 1e-9; t += 1 / 30) times.add(Math.round(t * 1000) / 1000);
        times.add(Math.round((a + 0.5) * 1000) / 1000);
        for (let t = b; t <= end + 1e-9; t += 1 / 30) times.add(Math.round(t * 1000) / 1000);
        times.add(Math.round(end * 1000) / 1000);
        const sorted = [...times].sort((x, y) => x - y);
        const W = pg.w;
        for (const t of sorted) {
          const u = t - a;
          let scale = 1 + push * ioC(prog(u, 0.5, d));
          let opacity = 1;
          let blur = 0;
          if (!last) {
            const e = iC(prog(u, d, d + out));
            scale *= 1 + 0.28 * e;
            opacity = 1 - e;
            blur = 24 * e;
          }
          if (!first) {
            const e = oE(prog(u, 0, 0.6));
            scale *= 0.86 + 0.14 * e;
            opacity *= clamp(prog(u, 0, 0.3));
            blur += (1 - oC(prog(u, 0, 0.6))) * 18;
          }
          // بين ٠٫٥ وb: التقريبُ البطيء بمفتاحين بتخفيفٍ تكعيبيٍّ داخلٍ-خارج (منحنى بيزيه المقابل).
          const inPush = t >= a + 0.5 - 1e-6 && t < b - 1e-6 && (first || u >= 0.6 - 1e-6);
          const ease: EasingId = inPush ? 'custom' : 'linear';
          const bz: Bezier = inPush ? [0.65, 0, 0.35, 1] : DEFAULT_BEZIER;
          sc.push(kf(t, scale, ease, bz));
          op.push(kf(t, opacity));
          bl.push(kf(t, blur / W));
        }
        tracks.scale = sc;
        tracks.opacity = op;
        tracks.blur = bl;
        clipStart = a;
        clipEnd = end;
      } else {
        const keys = (Array.isArray(args.keys) ? (args.keys as Record<string, unknown>[]) : []).sort((x, y) => n(x.t, 0) - n(y.t, 0));
        if (keys.length < 2) throw new Error('need a preset or at least two keys');
        for (const prop of ['scale', 'opacity', 'blur'] as const) {
          const list = keys.filter((k) => typeof k[prop] === 'number').map((k) => kf(n(k.t, 0), prop === 'blur' ? n(k[prop], 0) / pg.w : n(k[prop], 1), easingOf(k.easing, 'easeInOut')));
          if (list.length) tracks[prop] = list;
        }
      }
      const scene: SceneMotion = { id: newElementId('scene'), cx, cy, tracks };
      ctx.actions.commitElements((els) =>
        els.map((e) => {
          if (!ids.includes(e.id)) return e;
          const anim = { ...e.anim, scene };
          // تُمَدّ نهايةُ المقطع وحدها: نقلُ بدايته يُزيح مفاتيحَه (هي نسبةٌ إلى بدايته).
          if (clipEnd !== null && clipStart !== null) {
            anim.duration = Math.max(1 / 30, clipEnd - e.anim.start);
            anim.bounded = true;
          }
          return { ...e, anim } as DocElement;
        }),
      );
      await flush();
      return { scene: scene.id, members: ids.length, keys: Object.fromEntries(Object.entries(tracks).map(([k, v]) => [k, v?.length ?? 0])) };
    },
  },
  {
    name: 'background_flow',
    descriptionAr: 'خلفيّةٌ متدرّجة تنساب: لونُ أرضيّة، وبقعٌ ضوئيّة دائريّة متدرّجة إلى الشفافيّة تتحرّك ببطء على مسارات جيبيّة طول المدّة بوضع «جمع الضوء»، وتعتيمٌ على الأطراف. كلُّ بقعة: x,y,r بكسل، color، alpha، ومسارُ x = x + ax·sin(fx·t + px) (أو cos إن xCos)، ومثله y. تُنشأ عناصرُ حقيقيّة قابلة للتعديل في أسفل الطبقات.',
    descriptionEn: 'Flowing gradient background: a base color, soft round light blobs (color → transparent) drifting slowly on sine paths for the whole duration with additive "plus-lighter" blending, and an edge vignette. Each blob: x,y,r px, color, alpha, and path x = x + ax·sin(fx·t + px) (cos if xCos), same for y. Creates real editable elements at the bottom of the stack.',
    inputSchema: {
      type: 'object',
      properties: {
        base: { type: 'string' },
        duration: { type: 'number' },
        blobs: { type: 'array', items: { type: 'object' } },
        vignette: { type: 'object', properties: { inner: { type: 'number' }, outer: { type: 'number' }, alpha: { type: 'number' } } },
        step: { type: 'number' },
      },
      required: ['blobs'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const pg = page(ctx);
      const W = pg.w;
      const H = pg.h;
      if (s(args.base)) ctx.actions.setBackgroundColor(s(args.base) as string);
      const dur = n(args.duration, 30);
      const step = Math.max(1 / 30, n(args.step, 0.25));
      const blobs = Array.isArray(args.blobs) ? (args.blobs as Record<string, unknown>[]) : [];
      const made: DocElement[] = [];
      const base = { visible: true, locked: false, opacity: 100, maskId: null, groupId: null } as const;
      blobs.forEach((b, i) => {
        const x0 = n(b.x, W / 2);
        const y0 = n(b.y, H / 2);
        const r = n(b.r, 600);
        const color = s(b.color, '#10A06B') as string;
        const ax = n(b.ax, 0);
        const ay = n(b.ay, 0);
        const fx = n(b.fx, 0.3);
        const fy = n(b.fy, 0.3);
        const px = n(b.px, 0);
        const py = n(b.py, 0);
        const fX = b.xCos ? Math.cos : Math.sin;
        const fY = b.yCos ? Math.cos : Math.sin;
        const xs: PropertyKeyframe[] = [];
        const ys: PropertyKeyframe[] = [];
        for (let t = 0; t <= dur + 1e-9; t += step) {
          xs.push(kf(t, (fX(t * fx + px) * ax) / W));
          ys.push(kf(t, (fY(t * fy + py) * ay) / W));
        }
        const layer = newFillLayer({ kind: 'gradient', color, colorToken: null, opacity: 1, gradientFrom: color, gradientTo: color + '00', gradientAngle: 0, gradientType: 'radial' });
        const el = {
          ...base,
          id: newElementId('shape'),
          type: 'shape',
          name: `بقعة ${i + 1}`,
          shape: 'ellipse',
          fill: color,
          fillToken: 'ac',
          stroke: null,
          strokeWidth: 0,
          radius: 0,
          opacity: Math.round(clamp(n(b.alpha, 0.3)) * 1000) / 10,
          blend: 'plus-lighter',
          geo: { x: (x0 - r) / W, y: (y0 - r) / H, w: (2 * r) / W, h: (2 * r) / H, rotation: 0 },
          appearance: { fills: [layer], strokes: [], shadows: [] },
          anim: { ...defaultAnim('none', 0, dur), tracks: { x: xs, y: ys } },
        } as unknown as DocElement;
        made.push(el);
      });
      const v = args.vignette && typeof args.vignette === 'object' ? (args.vignette as Record<string, unknown>) : null;
      if (v) {
        // دائرةٌ نصفُ قطرها `outer` (كسرٌ من الارتفاع) حول المركز: شفّافةٌ حتى `inner` ثم تعتم.
        const R = n(v.outer, 0.75) * H;
        const inner = n(v.inner, 0.25) * H;
        const a = n(v.alpha, 0.55);
        const layer = newFillLayer({ kind: 'gradient', color: '#000000', colorToken: null, opacity: 1, gradientFrom: '#00000000', gradientTo: '#000000', gradientAngle: 0, gradientType: 'radial' });
        const stops: GradientStop[] = [
          { color: 'rgba(0,0,0,0)', at: 0 },
          { color: 'rgba(0,0,0,0)', at: inner / R },
          { color: `rgba(0,0,0,${a})`, at: 1 },
        ];
        made.push({
          ...base,
          id: newElementId('shape'),
          type: 'shape',
          name: 'تعتيم الأطراف',
          shape: 'rect',
          fill: '#000000',
          fillToken: 'fg',
          stroke: null,
          strokeWidth: 0,
          radius: 0,
          geo: { x: (W / 2 - R) / W, y: (H / 2 - R) / H, w: (2 * R) / W, h: (2 * R) / H, rotation: 0 },
          appearance: { fills: [{ ...layer, gradientStops: stops }], strokes: [], shadows: [] },
          anim: defaultAnim('none', 0, dur),
        } as unknown as DocElement);
      }
      // فوق مستطيل الأرضيّة (`mz-background`) إن وُجد، وتحت كلّ ما سواه.
      ctx.actions.commitElements((els) => {
        const bg = els.findIndex((e) => e.id === 'mz-background');
        return bg < 0 ? [...made, ...els] : [...els.slice(0, bg + 1), ...made, ...els.slice(bg + 1)];
      });
      await flush();
      return { ids: made.map((e) => e.id) };
    },
  },
  {
    name: 'element_set_gradient',
    descriptionAr: 'تدرّجٌ بمحطّاتٍ متعدّدة لنصّ أو شكل: stops = [{color, at ٠..١}]، خطّي بزاوية CSS أو دائري. يصلح للنصّ المتدرّج (كريمي ← نعناعي ← أخضر).',
    descriptionEn: 'Multi-stop gradient fill for a text or shape: stops = [{color, at 0..1}], linear at a CSS angle or radial. For gradient text (cream → mint → green).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, stops: { type: 'array', items: { type: 'object', properties: { color: { type: 'string' }, at: { type: 'number' } } } }, angle: { type: 'number' }, radial: { type: 'boolean' }, opacity: { type: 'number' } }, required: ['id', 'stops'], additionalProperties: false },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      if (el.type !== 'shape' && el.type !== 'text') throw new Error('element_set_gradient works on shape and text elements');
      const stops = (Array.isArray(args.stops) ? (args.stops as Record<string, unknown>[]) : []).filter((x) => typeof x.color === 'string').map((x, i, arr) => ({ color: x.color as string, at: n(x.at, arr.length > 1 ? i / (arr.length - 1) : 0) }));
      if (stops.length < 2) throw new Error('need at least two stops');
      const layer = newFillLayer({ kind: 'gradient', color: stops[0].color, colorToken: null, opacity: clamp(n(args.opacity, 1)), gradientFrom: stops[0].color, gradientTo: stops[stops.length - 1].color, gradientAngle: n(args.angle, 90), gradientType: args.radial ? 'radial' : 'linear' });
      patch(ctx, el.id, (e) => ({ ...e, appearance: { ...currentAppearance(e), fills: [{ ...layer, gradientStops: stops }] } }) as DocElement);
      await flush();
      return { id: el.id, stops };
    },
  },
  {
    name: 'element_set_blend',
    descriptionAr: 'وضعُ مزج العنصر مع ما تحته: normal, multiply, screen, overlay, darken, lighten, soft-light, difference, plus-lighter (جمع الضوء — الألوان تنير فوق بعض).',
    descriptionEn: 'Element blend mode: normal, multiply, screen, overlay, darken, lighten, soft-light, difference, plus-lighter (additive light).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, blend: { type: 'string', enum: ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'soft-light', 'difference', 'plus-lighter'] } }, required: ['id', 'blend'], additionalProperties: false },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      ctx.actions.setElementBlend(el.id, args.blend as never);
      await flush();
      return { id: el.id, blend: args.blend };
    },
  },
  {
    name: 'sfx_from_cues',
    descriptionAr: 'يركّب المؤثّرات الصوتيّة من ملفّ توقيت بأمرٍ واحد: cues = مسار JSON أو مصفوفة [{t ثوانٍ, file, db}]، dir = مجلّد الأصوات داخل ~/Mazij. يقصّ الصمت من أوّل كلّ صوت كي يقع على حدثه، ويحدّ الطول (الهبّات ١٫٦ث والباقي ١٫٢ث) بتلاشٍ في الذيل، ويضع الصاعد (risers: {بدايته: ذروته}) بحيث تقع ذروتُه على الحدث، ثم يضبط الذروة على -1.5 dBFS ويُدرج المزيج طبقةَ صوتٍ واحدة.',
    descriptionEn: 'Place sound effects from a timing file in one call: cues = a JSON path or array [{t seconds, file, db}], dir = the sounds folder under ~/Mazij. Trims leading silence so each transient lands on its event, caps length (whooshes 1.6 s, others 1.2 s) with a tail fade, aligns risers (risers: {start: peak}) so their peak hits the event, masters the peak to −1.5 dBFS and inserts the mix as one audio layer.',
    inputSchema: { type: 'object', properties: { cues: {}, dir: { type: 'string' }, duration: { type: 'number' }, risers: { type: 'object' }, volume: { type: 'number' } }, required: ['cues', 'dir'], additionalProperties: false },
    run: async (args, ctx) => {
      const { inTauri } = await import('./tauriEnv');
      if (!inTauri) throw new Error('sfx_from_cues needs the real app');
      const { readFile, readTextFile } = await import('@tauri-apps/plugin-fs');
      const raw = typeof args.cues === 'string' ? JSON.parse(await readTextFile(args.cues)) : args.cues;
      const cues = (Array.isArray(raw) ? raw : (raw?.cues ?? [])) as { t: number; file: string; db?: number }[];
      const risers = (args.risers && typeof args.risers === 'object' ? args.risers : (raw?.risers ?? {})) as Record<string, number>;
      const dir = String(args.dir).replace(/\/$/, '');
      const SR = 48000;
      const dur = n(args.duration, Math.max(...cues.map((c) => c.t)) + 2);
      const ac = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
      const decoded = new Map<string, AudioBuffer>();
      for (const f of new Set(cues.map((c) => c.file))) {
        const bytes = await readFile(`${dir}/${f}`);
        decoded.set(f, await ac.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
      }
      const L = new Float32Array(Math.ceil(dur * SR));
      const R = new Float32Array(Math.ceil(dur * SR));
      for (const c of cues) {
        const buf = decoded.get(c.file);
        if (!buf) continue;
        const ch0 = buf.getChannelData(0);
        const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
        const k = buf.sampleRate / SR;
        const len = Math.floor(buf.length / k);
        const at = (ch: Float32Array, i: number) => {
          const p = i * k;
          const j = Math.floor(p);
          const f = p - j;
          return (ch[j] ?? 0) * (1 - f) + (ch[j + 1] ?? 0) * f;
        };
        let peak = 0;
        let peakAt = 0;
        for (let i = 0; i < len; i++) {
          const v = Math.max(Math.abs(at(ch0, i)), Math.abs(at(ch1, i)));
          if (v > peak) { peak = v; peakAt = i; }
        }
        let st = 0;
        while (st < len && Math.max(Math.abs(at(ch0, st)), Math.abs(at(ch1, st))) <= peak * 0.01) st++;
        const riserPeak = Object.entries(risers).find(([k2]) => Math.abs(Number(k2) - c.t) < 1e-3)?.[1];
        let from: number;
        let count: number;
        let fade: number;
        let t0: number;
        if (riserPeak !== undefined) {
          from = st;
          count = peakAt - st + Math.round(0.25 * SR);
          fade = Math.round(0.25 * SR);
          t0 = riserPeak - (peakAt - st) / SR;
        } else {
          from = st;
          count = Math.min(len - st, Math.round((/oosh/i.test(c.file) ? 1.6 : 1.2) * SR));
          fade = Math.min(count, Math.round(0.15 * SR));
          t0 = c.t;
        }
        count = Math.max(0, Math.min(count, len - from));
        const g = Math.pow(10, (c.db ?? -8) / 20);
        let o = Math.round(t0 * SR);
        let skip = 0;
        if (o < 0) { skip = -o; o = 0; }
        for (let i = skip; i < count && o + i - skip < L.length; i++) {
          const env = i >= count - fade ? (count - i) / fade : 1;
          L[o + i - skip] += at(ch0, from + i) * g * env;
          R[o + i - skip] += at(ch1, from + i) * g * env;
        }
      }
      let m = 0;
      for (let i = 0; i < L.length; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
      const norm = m > 0 ? Math.pow(10, -1.5 / 20) / m : 1;
      // WAV 16-bit.
      const N = L.length;
      const out = new DataView(new ArrayBuffer(44 + N * 4));
      const w4 = (o: number, str: string) => [...str].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
      w4(0, 'RIFF'); out.setUint32(4, 36 + N * 4, true); w4(8, 'WAVE'); w4(12, 'fmt ');
      out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, SR, true); out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
      w4(36, 'data'); out.setUint32(40, N * 4, true);
      for (let i = 0; i < N; i++) {
        out.setInt16(44 + i * 4, Math.max(-32768, Math.min(32767, Math.round(L[i] * norm * 32767))), true);
        out.setInt16(46 + i * 4, Math.max(-32768, Math.min(32767, Math.round(R[i] * norm * 32767))), true);
      }
      const before = new Set(ctx.getState().elements.map((e) => e.id));
      await ctx.actions.insertAudioFromFile(new File([out.buffer], 'المؤثرات الصوتية.wav', { type: 'audio/wav' }));
      await flush();
      const st2 = ctx.getState();
      const el = st2.elements.find((e) => !before.has(e.id) && e.type === 'audio');
      if (!el) throw new Error(st2.audioError || 'audio was not inserted');
      patch(ctx, el.id, (e) => ({ ...e, volume: clamp(n(args.volume, 1)), anim: { ...e.anim, start: 0, duration: dur } }) as DocElement);
      await flush();
      return { id: el.id, cues: cues.length, files: decoded.size, duration: dur, peakBefore: m };
    },
  },
  {
    name: 'element_set_shadow',
    descriptionAr: 'ظلٌّ أو توهّجٌ خارجيّ لعنصر (نصّ أو شكل): لون، شفافيّة ٠..١، ضبابيّة بكسل، إزاحة x/y. التوهّج = إزاحة صفر بلون فاتح. replace=true (الافتراضي) يستبدل الظلال، remove=true يحذفها.',
    descriptionEn: 'Outer shadow or glow for an element (text or shape): color, opacity 0..1, blur px, x/y offset. A glow = zero offset in a bright color. replace=true (default) replaces existing shadows; remove=true clears them.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, color: { type: 'string' }, opacity: { type: 'number' }, blur: { type: 'number' }, x: { type: 'number' }, y: { type: 'number' }, replace: { type: 'boolean' }, remove: { type: 'boolean' } }, required: ['id'], additionalProperties: false },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      const layer = newShadowLayer({ color: s(args.color, '#000000') as string, opacity: clamp(n(args.opacity, 0.5)), blur: Math.max(0, n(args.blur, 40)), offsetX: n(args.x, 0), offsetY: n(args.y, 0) });
      patch(ctx, el.id, (e) => {
        const st = currentAppearance(e);
        const shadows = args.remove ? [] : args.replace === false ? [...st.shadows, layer] : [layer];
        return { ...e, appearance: { ...st, shadows } } as DocElement;
      });
      await flush();
      return { id: el.id };
    },
  },
  {
    name: 'text_set_outline',
    descriptionAr: 'حدٌّ حول حروف نصّ (لون، سُمك بكسل، شفافيّة). fill=false يجعل النصّ حدودًا فقط بلا تعبئة. remove=true يحذف الحدّ ويعيد التعبئة.',
    descriptionEn: 'Outline around a text\'s glyphs (color, width px, opacity). fill=false makes it outline-only with no fill. remove=true clears the outline and restores the fill.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, color: { type: 'string' }, width: { type: 'number' }, opacity: { type: 'number' }, fill: { type: 'boolean' }, remove: { type: 'boolean' } }, required: ['id'], additionalProperties: false },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      if (el.type !== 'text') throw new Error('text_set_outline works on text elements');
      patch(ctx, el.id, (e) => {
        const st = currentAppearance(e);
        if (args.remove) return { ...e, appearance: { ...st, strokes: [] } } as DocElement;
        const stroke = newStrokeLayer({ color: s(args.color, '#F4F1E8') as string, width: Math.max(0, n(args.width, 2.5)), opacity: clamp(n(args.opacity, 1)), position: 'center' });
        // «بلا تعبئة» = تعبئةٌ شفّافة لا طبقةٌ مخفيّة: المخفيّةُ تُرجع النصَّ إلى لونه القديم.
        const fills = args.fill === false ? [newFillLayer({ kind: 'solid', color: 'rgba(0,0,0,0)' })] : st.fills;
        return { ...e, appearance: { ...st, strokes: [stroke], fills } } as DocElement;
      });
      await flush();
      return { id: el.id };
    },
  },
  {
    name: 'element_add_path',
    descriptionAr: 'إضافة شكل مسارٍ من بيانات SVG (d بأوامر M L H V C Q Z، مطلقة أو نسبيّة) داخل صندوق بالبكسل: x,y,w,h هو الصندوق، وviewBox [w,h] مقاسُ إحداثيّات d. fill لون التعبئة (أو none)، stroke وstrokeWidth للحدّ. للأيقونات وعلامات الصحّ والنجوم.',
    descriptionEn: 'Add a path shape from SVG data (d with M L H V C Q Z, absolute or relative) inside a px box: x,y,w,h is the box and viewBox [w,h] the coordinate size of d. fill color (or none), stroke + strokeWidth for an outline. For icons, check marks and stars.',
    inputSchema: { type: 'object', properties: { d: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' }, viewBox: { type: 'array', items: { type: 'number' } }, fill: { type: 'string' }, stroke: { type: 'string' }, strokeWidth: { type: 'number' }, name: { type: 'string' } }, required: ['d', 'x', 'y', 'w', 'h'], additionalProperties: false },
    run: async (args, ctx) => {
      const pg = page(ctx);
      const w = n(args.w, 100);
      const h = n(args.h, 100);
      const vb = Array.isArray(args.viewBox) && args.viewBox.length >= 2 ? (args.viewBox as number[]) : [w, h];
      const cmds = parseSvgD(String(args.d), vb[0], vb[1]);
      if (!cmds.length) throw new Error('empty path');
      const fill = s(args.fill, 'none') as string;
      const fills = fill === 'none' ? [newFillLayer({ kind: 'solid', color: 'rgba(0,0,0,0)' })] : [newFillLayer({ kind: 'solid', color: fill })];
      const strokes = s(args.stroke) ? [newStrokeLayer({ color: s(args.stroke) as string, width: n(args.strokeWidth, 4), position: 'center' })] : [];
      const id = newElementId('shape');
      const el = {
        id,
        type: 'shape',
        visible: true,
        locked: false,
        opacity: 100,
        maskId: null,
        name: s(args.name, 'مسار'),
        shape: 'path',
        fill: fill === 'none' ? null : fill,
        fillToken: 'ac',
        stroke: s(args.stroke) ?? null,
        strokeWidth: n(args.strokeWidth, 0),
        radius: 0,
        closed: true,
        outline: cmds,
        outlineStroke: strokes.length > 0,
        geo: { x: n(args.x, 0) / pg.w, y: n(args.y, 0) / pg.h, w: w / pg.w, h: h / pg.h, rotation: 0 },
        appearance: { fills, strokes, shadows: [] },
        anim: defaultAnim('none', 0, 0.6),
      } as unknown as DocElement;
      ctx.actions.commitElements((els) => [...els, el]);
      await flush();
      return { id };
    },
  },
];

/** محلّلُ بيانات مسار SVG إلى أوامر مزيج (كسورٌ من الصندوق). يدعم M L H V C Q Z مطلقةً ونسبيّة. */
function parseSvgD(d: string, vw: number, vh: number): import('./pathGeometry').PathCmd[] {
  const toks = d.match(/[MLHVCQZmlhvcqz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const out: import('./pathGeometry').PathCmd[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(toks[i++]);
  const X = (v: number) => v / vw;
  const Y = (v: number) => v / vh;
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') { out.push({ c: 'Z' }); x = sx; y = sy; continue; }
    if (C === 'M' || C === 'L') {
      const nx = num() + (rel ? x : 0);
      const ny = num() + (rel ? y : 0);
      out.push({ c: C === 'M' ? 'M' : 'L', x: X(nx), y: Y(ny) });
      if (C === 'M') { sx = nx; sy = ny; cmd = rel ? 'l' : 'L'; }
      x = nx; y = ny;
    } else if (C === 'H') { x = num() + (rel ? x : 0); out.push({ c: 'L', x: X(x), y: Y(y) }); }
    else if (C === 'V') { y = num() + (rel ? y : 0); out.push({ c: 'L', x: X(x), y: Y(y) }); }
    else if (C === 'C') {
      const a = [num(), num(), num(), num(), num(), num()].map((v, k) => v + (rel ? (k % 2 ? y : x) : 0));
      out.push({ c: 'C', x1: X(a[0]), y1: Y(a[1]), x2: X(a[2]), y2: Y(a[3]), x: X(a[4]), y: Y(a[5]) });
      x = a[4]; y = a[5];
    } else if (C === 'Q') {
      const a = [num(), num(), num(), num()].map((v, k) => v + (rel ? (k % 2 ? y : x) : 0));
      out.push({ c: 'C', x1: X(x + (2 / 3) * (a[0] - x)), y1: Y(y + (2 / 3) * (a[1] - y)), x2: X(a[2] + (2 / 3) * (a[0] - a[2])), y2: Y(a[3] + (2 / 3) * (a[1] - a[3])), x: X(a[2]), y: Y(a[3]) });
      x = a[2]; y = a[3];
    } else i++;
  }
  return out;
}
