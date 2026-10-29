import type { McpTool, McpCtx } from './mcpTools';
import type { AnimProperty, DocElement, PropertyKeyframe, PropertyTracks, TextCounter, TextStaggerAnim } from '../state/elements';
import { newElementId } from '../state/elements';
import { DEFAULT_BEZIER, EASING_IDS, applyEasing, type Bezier, type EasingId } from './easing';
import { currentAppearance, newFillLayer } from './appearance';
import { sizeAt } from '../data/constants';
import { particleBurst } from './particles';
import { resolveAnimAt, animTimeAt } from './animTimeline';
import type { GlassStyle } from './glass';

/** أدواتُ الحركة لـ«مِزو» وClaude وCodex — ما يَقدر عليه المصمّمُ في الخطّ الزمنيّ
 * وفي لوحة الخصائص، بالأفعال نفسها التي تكتبها الواجهة (`commitElements`، `setTextStagger`،
 * `applyClippingMask`…): لا مسارَ موازٍ. وكلُّ قيمةِ طولٍ تدخل **بكسلًا على اللوحة
 * الحاليّة** وتُحوَّل هنا إلى الكسر المخزون — فلا يحتاج الوكيلُ أن يعرف عقدَ التخزين. */

const ANIM_PROPS: AnimProperty[] = ['opacity', 'x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation', 'blur', 'trimStart', 'trimEnd', 'reveal'];
const PX_PROPS = new Set<AnimProperty>(['x', 'y', 'blur']);

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
const easingOf = (v: unknown, f: EasingId = 'easeOut'): EasingId => (typeof v === 'string' && (EASING_IDS as string[]).includes(v) ? (v as EasingId) : f);

function brief(el: DocElement) {
  return { id: el.id, type: el.type, start: el.anim.start, duration: el.anim.duration, bounded: !!el.anim.bounded, tracks: Object.keys(el.anim.tracks).filter((k) => (el.anim.tracks as Record<string, unknown[]>)[k]?.length) };
}

const KEY_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      t: { type: 'number', description: 'seconds from the clip start' },
      v: { type: 'number' },
      easing: { type: 'string', enum: EASING_IDS, description: 'easing of the segment that LEAVES this key' },
      bezier: { type: 'array', items: { type: 'number' }, description: 'cubic-bezier [x1,y1,x2,y2] when easing="custom"' },
    },
    required: ['t', 'v'],
  },
};

export const MOTION_TOOLS: McpTool[] = [
  {
    name: 'fonts_add_from_path',
    descriptionAr: 'إضافة خط من ملف (ttf/otf/woff/woff2) داخل ~/Mazij إلى مكتبة خطوط مزيج — نفس «أضف خطًّا من جهازك». يعيد اسم العائلة لاستعماله في fontFamily.',
    descriptionEn: 'Add a font file (ttf/otf/woff/woff2) under ~/Mazij to Mazij\'s font library — same as "add a font from your device". Returns the family name to use as fontFamily.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
    run: async (args, ctx) => {
      const { inTauri } = await import('./tauriEnv');
      if (!inTauri) throw new Error('fonts_add_from_path needs the real app');
      const path = typeof args.path === 'string' ? args.path : '';
      // الخطُّ نفسُه مضافٌ من قبل؟ يُعاد اسمُه ولا يُكرَّر في المكتبة (نفسُ اشتقاق `fontFromBytes`).
      const base = `Mz-${(path.split('/').pop() ?? '').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '') || 'Font'}`;
      const existing = ctx.getState().fonts.find((f) => f.user && f.family.replace(/^'(.*)'$/, '$1') === base);
      if (existing) return { family: existing.family, reused: true };
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const bytes = await readFile(path);
      // بلا تحديد: إضافةُ الخطّ تُطبّقه على النصّ المحدَّد إن وُجد، والوكيلُ لم يطلب ذلك.
      ctx.actions.selectElement(null);
      await flush();
      const family = await ctx.actions.addFontFromBytes(bytes, path.split('/').pop() || 'font.ttf');
      await flush();
      return { family };
    },
  },
  {
    name: 'element_set_glass',
    descriptionAr: 'خامة زجاج داخل نص أو شكل (مستطيل/دائرة): tube = حروف كأنابيب زجاج بحافة باردة وقلب حار ولمعة، reeded = زجاج مضلّع يكسر الألوان أشرطة. الألوان تنساب مع الزمن.',
    descriptionEn: 'Glass material inside a text or rect/ellipse shape: tube = glass-tube letters (cool rim, hot core, specular), reeded = ribbed glass refracting the colors into stripes. Colors flow over time. remove=true clears it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        mode: { type: 'string', enum: ['tube', 'reeded'] },
        colors: { type: 'array', items: { type: 'string' }, description: '2–6 body colors' },
        rim: { type: 'string' },
        core: { type: 'string' },
        flow: { type: 'number', description: 'element widths per second the colors drift' },
        angle: { type: 'number' },
        stripes: { type: 'number' },
        strength: { type: 'number' },
        highlight: { type: 'number' },
        remove: { type: 'boolean' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      if (el.type !== 'text' && !(el.type === 'shape' && (el.shape === 'rect' || el.shape === 'ellipse'))) throw new Error('glass works on text, rect and ellipse elements');
      const glass: GlassStyle | undefined = args.remove
        ? undefined
        : {
            mode: args.mode === 'reeded' ? 'reeded' : 'tube',
            colors: Array.isArray(args.colors) && args.colors.length ? (args.colors as unknown[]).filter((c): c is string => typeof c === 'string').slice(0, 6) : ['#ff2d87', '#ff6a2b', '#ff2d87', '#a64dff'],
            ...(typeof args.rim === 'string' ? { rim: args.rim } : {}),
            ...(typeof args.core === 'string' ? { core: args.core } : {}),
            flow: n(args.flow, 0.15),
            angle: n(args.angle, 90),
            stripes: n(args.stripes, 7),
            strength: n(args.strength, 0.6),
            highlight: n(args.highlight, 0.85),
          };
      ctx.actions.commitElements((els) => els.map((e) => (e.id === el.id ? ({ ...e, glass } as DocElement) : e)));
      await flush();
      return { id: el.id, glass: glass ?? null };
    },
  },
  {
    name: 'group_camera',
    descriptionAr: 'حركة كاميرا على مجموعة عناصر (مشهد): تقريب/تبعيد وتحريك حول مركز، بمفاتيح زمنية مطلقة بالثواني. تُكتب في مفاتيح العناصر نفسها فتظهر في الخط الزمني ويمكن تعديلها.',
    descriptionEn: 'Camera move over a set of elements (a scene): zoom and pan about a center, keyed in absolute seconds. Baked into the elements\' own keyframes (visible/editable in the timeline). zoom 1 = as authored; pan in px.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        center: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, description: 'px; default artboard center' },
        keys: { type: 'array', items: { type: 'object', properties: { t: { type: 'number' }, zoom: { type: 'number' }, x: { type: 'number' }, y: { type: 'number' }, easing: { type: 'string', enum: EASING_IDS } }, required: ['t'] } },
      },
      required: ['ids', 'keys'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const pg = page(ctx);
      const ids = Array.isArray(args.ids) ? (args.ids as unknown[]).filter((x): x is string => typeof x === 'string') : [];
      const keys = (Array.isArray(args.keys) ? (args.keys as Record<string, unknown>[]) : [])
        .map((k) => ({ t: n(k.t, 0), z: n(k.zoom, 1), x: n(k.x, 0), y: n(k.y, 0), e: easingOf(k.easing, 'easeInOut') }))
        .sort((a, b) => a.t - b.t);
      if (keys.length < 2) throw new Error('need at least two camera keys');
      const C = args.center && typeof args.center === 'object' ? { x: n((args.center as Record<string, unknown>).x, pg.w / 2), y: n((args.center as Record<string, unknown>).y, pg.h / 2) } : { x: pg.w / 2, y: pg.h / 2 };
      const cam = (t: number) => {
        if (t <= keys[0].t) return keys[0];
        for (let i = 0; i < keys.length - 1; i++) {
          const a = keys[i];
          const b = keys[i + 1];
          if (t <= b.t) {
            const p = applyEasing(a.e, DEFAULT_BEZIER, (t - a.t) / Math.max(1e-6, b.t - a.t));
            return { t, z: a.z + (b.z - a.z) * p, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, e: a.e };
          }
        }
        return keys[keys.length - 1];
      };
      const t0 = keys[0].t;
      const els = ctx.getState().elements;
      const W = pg.w;
      const next = new Map<string, DocElement>();
      for (const id of ids) {
        const el = els.find((e) => e.id === id);
        if (!el) throw new Error(`no element with id "${id}"`);
        const clipEnd = el.anim.start + el.anim.duration;
        const from = Math.max(t0, el.anim.start);
        const to = Math.min(clipEnd, from + 12);
        if (to <= from) continue;
        const cx = (el.geo.x + el.geo.w / 2) * W;
        const cy = (el.geo.y + el.geo.h / 2) * pg.h;
        const samples: number[] = [];
        for (let t = from; t < to; t += 1 / 30) samples.push(Math.round(t * 1000) / 1000);
        samples.push(to);
        const xs: PropertyKeyframe[] = [];
        const ys: PropertyKeyframe[] = [];
        const ss: PropertyKeyframe[] = [];
        for (const t of samples) {
          const v = resolveAnimAt(el.anim, t);
          const c = cam(t);
          const px = cx + v.x * W;
          const py = cy + v.y * W;
          const nx = C.x + (px - C.x) * c.z + c.x;
          const ny = C.y + (py - C.y) * c.z + c.y;
          const at = Math.round(animTimeAt(el.anim, t) * 1000) / 1000;
          const mk = (value: number): PropertyKeyframe => ({ id: newElementId('kf'), time: at, value, easing: 'linear', bezier: [...DEFAULT_BEZIER] as Bezier });
          xs.push(mk((nx - cx) / W));
          ys.push(mk((ny - cy) / W));
          ss.push(mk(v.scale * c.z));
        }
        const cut = animTimeAt(el.anim, from) - 1e-6;
        const keep = (tr: PropertyKeyframe[] | undefined) => (tr ?? []).filter((k) => k.time < cut);
        next.set(id, {
          ...el,
          anim: { ...el.anim, tracks: { ...el.anim.tracks, x: [...keep(el.anim.tracks.x), ...xs], y: [...keep(el.anim.tracks.y), ...ys], scale: [...keep(el.anim.tracks.scale), ...ss] } },
        } as DocElement);
      }
      ctx.actions.commitElements((cur) => cur.map((e) => next.get(e.id) ?? e));
      await flush();
      return { moved: next.size };
    },
  },
  {
    name: 'templates_render_png',
    descriptionAr: 'يصدّر قوالب مزيج الجاهزة صورًا (PNG) إلى ~/Mazij/Renders دون لمس المستند — لاستعمالها صورًا داخل تصميم آخر.',
    descriptionEn: 'Render Mazij starter templates to PNG files in ~/Mazij/Renders without touching the document — to use them as images inside another design.',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } }, scale: { type: 'number' } }, additionalProperties: false },
    run: async (args) => {
      const { inTauri } = await import('./tauriEnv');
      if (!inTauri) throw new Error('templates_render_png needs the real app');
      const { STARTER_TEMPLATES } = await import('./starterTemplates');
      const { SIZES, PALETTES } = await import('../data/constants');
      const { renderArtboardPng } = await import('./exportArtboard');
      const { writeFile, mkdir } = await import('@tauri-apps/plugin-fs');
      const { homeDir, join } = await import('@tauri-apps/api/path');
      const dir = await join(await homeDir(), 'Mazij', 'Renders');
      await mkdir(dir, { recursive: true }).catch(() => undefined);
      const want = Array.isArray(args.ids) ? (args.ids as string[]) : null;
      const out: { id: string; path: string; w: number; h: number }[] = [];
      for (const tp of STARTER_TEMPLATES) {
        if (want && !want.includes(tp.id)) continue;
        const size = SIZES[tp.sizeIdx];
        const blob = await renderArtboardPng({ size, palette: PALETTES[tp.paletteIdx] ?? PALETTES[0], elements: tp.elements(), transparent: false, scale: n(args.scale, 1), lang: 'ar', decorAccent: tp.decorAccent, placeholders: 'block' } as never);
        const path = await join(dir, `${tp.id}.png`);
        await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
        out.push({ id: tp.id, path, w: size.w, h: size.h });
      }
      return { renders: out };
    },
  },
  {
    name: 'element_animate',
    descriptionAr:
      'تحريك عنصر بمفاتيح حركة: توقيت المقطع (بداية/مدة بالثواني، ومحدود = يظهر داخل مقطعه فقط) ومسارات الخصائص. القيم: opacity 0..1، scale/scaleX/scaleY معامل (1=الحجم الأصلي)، rotation بالدرجات، x/y إزاحة بالبكسل عن موضع العنصر، blur بالبكسل، reveal 0..1. زمن المفتاح بالثواني من بداية المقطع.',
    descriptionEn:
      'Animate an element with keyframes: clip timing (start/duration in seconds; bounded = only visible inside its clip) plus per-property tracks. Values: opacity 0..1, scale/scaleX/scaleY factor (1 = authored size), rotation degrees, x/y pixel offset from the element\'s position, blur pixels, reveal 0..1. Key time = seconds from the clip start. Tracks you pass replace those properties; others are kept unless replaceAll=true.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        start: { type: 'number' },
        duration: { type: 'number' },
        bounded: { type: 'boolean' },
        replaceAll: { type: 'boolean' },
        tracks: { type: 'object', description: `property -> keys. properties: ${ANIM_PROPS.join(', ')}`, additionalProperties: KEY_SCHEMA },
      },
      required: ['id'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      const W = page(ctx).w;
      const start = Math.max(0, n(args.start, el.anim.start));
      const duration = Math.max(1 / 60, n(args.duration, el.anim.duration));
      const inTracks = (args.tracks && typeof args.tracks === 'object' ? args.tracks : {}) as Record<string, unknown>;
      // نقلُ المقطع لا يُعيد توقيتَ مفاتيحه (`sourceIn` ثابت)؛ ومفاتيحُ هذه الأداة نسبةً
      // إلى بداية المقطع، فأصلُ الزمن يُصفَّر حين تُكتب مساراتٌ جديدة.
      const writing = Object.keys(inTracks).length > 0;
      const tracks: PropertyTracks = args.replaceAll ? {} : { ...el.anim.tracks };
      for (const [prop, keys] of Object.entries(inTracks)) {
        if (!ANIM_PROPS.includes(prop as AnimProperty)) throw new Error(`unknown property "${prop}"`);
        if (!Array.isArray(keys)) throw new Error(`tracks.${prop} must be an array`);
        const p = prop as AnimProperty;
        const list: PropertyKeyframe[] = keys
          .map((k) => k as Record<string, unknown>)
          .map((k) => {
            const raw = n(k.v, 0);
            const bez = Array.isArray(k.bezier) && k.bezier.length === 4 ? (k.bezier as number[]) : DEFAULT_BEZIER;
            return {
              id: newElementId('kf'),
              time: Math.max(0, Math.round(n(k.t, 0) * 1000) / 1000),
              value: PX_PROPS.has(p) ? raw / W : raw,
              easing: easingOf(k.easing, p === 'reveal' ? 'hold' : 'easeOut'),
              bezier: [...bez] as Bezier,
            };
          })
          .sort((a, b) => a.time - b.time);
        if (list.length) tracks[p] = list;
        else delete tracks[p];
      }
      const bounded = typeof args.bounded === 'boolean' ? args.bounded : el.anim.bounded;
      ctx.actions.commitElements((els) =>
        els.map((e) =>
          e.id === el.id
            ? { ...e, anim: { ...e.anim, preset: 'none', start, duration, ...(writing ? { sourceIn: 0 } : {}), ...(bounded ? { bounded: true } : { bounded: undefined }), tracks } }
            : e,
        ),
      );
      await flush();
      return brief(ctx.getState().elements.find((e) => e.id === el.id)!);
    },
  },
  {
    name: 'element_set_fill',
    descriptionAr: 'تعبئة شكل أو نص: لون واحد، أو تدرّج خطّي بزاوية، أو تدرّج دائري من المركز.',
    descriptionEn: 'Fill a shape or text: solid color, linear gradient at a CSS angle (90 = left→right), or radial gradient from the center.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        kind: { type: 'string', enum: ['solid', 'linear', 'radial'] },
        color: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string', description: 'end color; may be #rrggbbaa / rgba() for a soft fade' },
        angle: { type: 'number' },
        opacity: { type: 'number', description: '0..1' },
      },
      required: ['id', 'kind'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      if (el.type !== 'shape' && el.type !== 'text') throw new Error('element_set_fill works on shape and text elements');
      const kind = args.kind === 'linear' || args.kind === 'radial' ? 'gradient' : 'solid';
      const layer = newFillLayer({
        kind,
        color: typeof args.color === 'string' ? args.color : typeof args.from === 'string' ? args.from : '#000000',
        colorToken: undefined,
        opacity: Math.max(0, Math.min(1, n(args.opacity, 1))),
        gradientFrom: typeof args.from === 'string' ? args.from : '#000000',
        gradientTo: typeof args.to === 'string' ? args.to : '#ffffff',
        gradientAngle: n(args.angle, 90),
        gradientType: args.kind === 'radial' ? 'radial' : 'linear',
      });
      ctx.actions.commitElements((els) =>
        els.map((e) => {
          if (e.id !== el.id) return e;
          const stack = currentAppearance(e);
          return { ...e, ...(e.type === 'shape' && kind === 'solid' ? { fill: layer.color } : {}), ...(e.type === 'text' && kind === 'solid' ? { color: layer.color } : {}), appearance: { ...stack, fills: [layer] } } as DocElement;
        }),
      );
      await flush();
      return { id: el.id, fill: { kind: args.kind } };
    },
  },
  {
    name: 'element_set_look',
    descriptionAr: 'خصائص إضافية لعنصر: ضبابية ثابتة (بكسل)، نقطة الارتكاز للحركة (0..1 من صندوقه)، الاسم، الترتيب (0 = الأبعد)، التجميع، قناع قصّ بشكل.',
    descriptionEn: 'Extra element properties: static blur (px), animation pivot (0..1 of its own box), layer name, z-order index (0 = back), groupId, clip mask by a shape id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        blur: { type: 'number' },
        pivot: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
        name: { type: 'string' },
        index: { type: 'number' },
        groupId: { type: 'string' },
        maskShapeId: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      if (typeof args.blur === 'number') ctx.actions.setElementBlur(el.id, Math.max(0, args.blur) / page(ctx).w);
      if (args.pivot && typeof args.pivot === 'object') {
        const p = args.pivot as Record<string, unknown>;
        ctx.actions.setElementPivot(el.id, { x: n(p.x, 0.5), y: n(p.y, 0.5) });
      }
      if (typeof args.name === 'string' || typeof args.groupId === 'string') {
        ctx.actions.commitElements((els) =>
          els.map((e) => (e.id === el.id ? { ...e, ...(typeof args.name === 'string' ? { name: args.name } : {}), ...(typeof args.groupId === 'string' ? { groupId: args.groupId || null } : {}) } : e)),
        );
      }
      if (typeof args.index === 'number') {
        await flush();
        ctx.actions.reorderElement(el.id, Math.max(0, Math.round(args.index)));
      }
      if (typeof args.maskShapeId === 'string') {
        need(ctx, args.maskShapeId);
        ctx.actions.applyClippingMask(el.id, args.maskShapeId);
      }
      await flush();
      const now = ctx.getState().elements;
      return { id: el.id, index: now.findIndex((e) => e.id === el.id), blur: now.find((e) => e.id === el.id)?.blur ?? 0 };
    },
  },
  {
    name: 'text_set_stagger',
    descriptionAr: 'كشف النص حرفًا حرفًا/كلمة كلمة/سطرًا سطرًا: الوحدة، الاتجاه، الفاصل بين الوحدات، مدة كل وحدة، والتأثير (fade/slide/scale/rotate/blur/type/none).',
    descriptionEn: 'Reveal text per char/word/line: unit, direction, gap between units (s), each unit\'s duration (s), and effect (fade/slide/scale/rotate/blur/type/none). Anchored to the element clip start.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        enabled: { type: 'boolean' },
        unit: { type: 'string', enum: ['char', 'word', 'line'] },
        direction: { type: 'string', enum: ['start', 'end', 'center', 'random'] },
        stagger: { type: 'number' },
        unitDuration: { type: 'number' },
        effect: { type: 'string', enum: ['fade', 'slide', 'scale', 'rotate', 'blur', 'none', 'type'] },
        easing: { type: 'string', enum: EASING_IDS },
      },
      required: ['id'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      if (el.type !== 'text') throw new Error('text_set_stagger works on text elements');
      const patch: Partial<TextStaggerAnim> = { enabled: args.enabled !== false };
      for (const k of ['unit', 'direction', 'effect'] as const) if (typeof args[k] === 'string') (patch as Record<string, unknown>)[k] = args[k];
      if (typeof args.stagger === 'number') patch.stagger = Math.max(0, args.stagger);
      if (typeof args.unitDuration === 'number') patch.unitDuration = Math.max(0, args.unitDuration);
      if (typeof args.easing === 'string') patch.easing = easingOf(args.easing);
      ctx.actions.setTextStagger(el.id, patch);
      await flush();
      const now = ctx.getState().elements.find((e) => e.id === el.id);
      return { id: el.id, textAnim: now && now.type === 'text' ? now.textAnim : null };
    },
  },
  {
    name: 'text_set_counter',
    descriptionAr: 'تحويل نص إلى عدّاد أرقام يعدّ من قيمة إلى قيمة خلال مقطعه (بادئة/لاحقة، منازل عشرية، أرقام عربية، فاصل الآلاف). counter=null يلغيه.',
    descriptionEn: 'Turn a text into a number counter that counts from→to across its clip (prefix/suffix, decimals, Arabic digits, thousands grouping). Pass remove=true to clear.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        from: { type: 'number' },
        to: { type: 'number' },
        decimals: { type: 'number' },
        prefix: { type: 'string' },
        suffix: { type: 'string' },
        digits: { type: 'string', enum: ['latin', 'arabic'] },
        grouping: { type: 'boolean' },
        easing: { type: 'string', enum: EASING_IDS },
        delay: { type: 'number' },
        duration: { type: 'number' },
        remove: { type: 'boolean' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      if (el.type !== 'text') throw new Error('text_set_counter works on text elements');
      if (args.remove) {
        ctx.actions.commitElements((els) => els.map((e) => (e.id === el.id && e.type === 'text' ? { ...e, counter: undefined } : e)));
        await flush();
        return { id: el.id, counter: null };
      }
      const c: TextCounter = {
        from: n(args.from, 0),
        to: n(args.to, 100),
        decimals: n(args.decimals, 0),
        prefix: typeof args.prefix === 'string' ? args.prefix : '',
        suffix: typeof args.suffix === 'string' ? args.suffix : '',
        digits: args.digits === 'arabic' ? 'arabic' : 'latin',
        grouping: args.grouping !== false,
        easing: easingOf(args.easing),
        ...(typeof args.delay === 'number' ? { delay: Math.max(0, args.delay) } : {}),
        ...(typeof args.duration === 'number' ? { duration: Math.max(0.05, args.duration) } : {}),
      };
      const { formatCounter } = await import('./textCounter');
      ctx.actions.commitElements((els) => els.map((e) => (e.id === el.id && e.type === 'text' ? { ...e, counter: c, text: formatCounter(c, c.to) } : e)));
      await flush();
      return { id: el.id, counter: c };
    },
  },
  {
    name: 'text_set_spacing',
    descriptionAr: 'تتبّع الأحرف (نسبة مئوية من المقاس، -2 = أضيق) وتباعد الأسطر (مضاعف، 1.15 افتراضي).',
    descriptionEn: 'Letter tracking (percent of font size, -2 = tighter) and line height (multiplier, default 1.15).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, tracking: { type: 'number' }, lineHeight: { type: 'number' } }, required: ['id'], additionalProperties: false },
    run: async (args, ctx) => {
      const el = need(ctx, args.id);
      if (el.type !== 'text') throw new Error('text_set_spacing works on text elements');
      ctx.actions.commitElements((els) =>
        els.map((e) =>
          e.id === el.id && e.type === 'text'
            ? { ...e, ...(typeof args.tracking === 'number' ? { tracking: args.tracking } : {}), ...(typeof args.lineHeight === 'number' ? { lineHeight: Math.max(0.6, args.lineHeight) } : {}) }
            : e,
        ),
      );
      await flush();
      return { id: el.id };
    },
  },
  {
    name: 'effect_particle_burst',
    descriptionAr: 'انفجار جُسيمات ملوّنة من نقطة (بكسل) عند زمن معيّن — دوائر حقيقية مجمّعة يمكن تحريرها.',
    descriptionEn: 'A burst of colored particles from a point (px) at a given time — real grouped circles, editable afterwards.',
    inputSchema: {
      type: 'object',
      properties: {
        cx: { type: 'number' },
        cy: { type: 'number' },
        count: { type: 'number' },
        radius: { type: 'number' },
        size: { type: 'number' },
        colors: { type: 'array', items: { type: 'string' } },
        start: { type: 'number' },
        duration: { type: 'number' },
        seed: { type: 'number' },
        mode: { type: 'string', enum: ['burst', 'implode'] },
      },
      required: ['cx', 'cy'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const pg = page(ctx);
      const els = particleBurst(
        {
          cx: n(args.cx, pg.w / 2),
          cy: n(args.cy, pg.h / 2),
          count: typeof args.count === 'number' ? args.count : undefined,
          radius: typeof args.radius === 'number' ? args.radius : undefined,
          size: typeof args.size === 'number' ? args.size : undefined,
          colors: Array.isArray(args.colors) ? (args.colors as unknown[]).filter((c): c is string => typeof c === 'string') : undefined,
          start: typeof args.start === 'number' ? args.start : undefined,
          duration: typeof args.duration === 'number' ? args.duration : undefined,
          seed: typeof args.seed === 'number' ? args.seed : undefined,
          mode: args.mode === 'implode' ? 'implode' : 'burst',
        },
        pg,
      );
      ctx.actions.commitElements((cur) => [...cur, ...els]);
      await flush();
      return { groupId: els[0]?.groupId ?? null, ids: els.map((e) => e.id) };
    },
  },
];
