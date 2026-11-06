import type { McpTool } from './mcpTools';
import type { DocElement } from '../state/elements';
import { SFX_CATS, SFX_ITEMS, sfxById, sfxFile } from './sfxLibrary';
import { applyAutoSfx } from './autoSfx';
import { MOTION_STYLES, insertMotionStyle } from './motionStyles';

/** **أدواتُ المخرج** (٦ نوفمبر ٢٠٢٦) — ما يحتاجه مِزو ليشتغل بطريقة مخرج الموشن:
 * مكتبةُ المؤثّرات الصوتيّة المرفقة، والصوتُ التلقائيّ للحركة، والأنماطُ العشرون الجاهزة،
 * وقراءةُ الفيديو المرجعيّ (لقطات، إيقاع، طاقة حركة). */

const n = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const DIRECTOR_TOOLS: McpTool[] = [
  {
    name: 'sfx_library_list',
    descriptionAr: 'قائمةُ المؤثّرات الصوتيّة المرفقة مع مزيج (هبّات، بوب، نقرات، صاعدات، كاميرا، تروس، فلوس، بيانات) بمعرّفاتها وأطوالها. cat اختياري للتصفية.',
    descriptionEn: "List Mazij's bundled sound effects (whoosh, pop, click, riser, shutter, gear, money, data) with ids and durations. Optional cat filter.",
    inputSchema: { type: 'object', properties: { cat: { type: 'string', enum: SFX_CATS.map((c) => c.id) } }, additionalProperties: false },
    run: async (args) => SFX_ITEMS.filter((s) => !args.cat || s.cat === args.cat).map((s) => ({ id: s.id, cat: s.cat, name: s.nameEn, nameAr: s.nameAr, seconds: s.dur })),
  },
  {
    name: 'sfx_insert',
    descriptionAr: 'يضع مؤثّرًا صوتيًّا من المكتبة طبقةَ صوت عند الزمن at (ثوانٍ؛ الافتراضيّ المؤشّر) بعلوّ volume ٠..١.',
    descriptionEn: 'Place one bundled sound effect as an audio layer at time `at` (seconds; default the playhead) with volume 0..1.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, at: { type: 'number' }, volume: { type: 'number' } }, required: ['id'], additionalProperties: false },
    run: async (args, ctx) => {
      const item = sfxById(String(args.id));
      if (!item) throw new Error(`unknown sfx id "${String(args.id)}" — call sfx_library_list`);
      const s0 = ctx.getState();
      const before = new Set(s0.elements.map((e) => e.id));
      await ctx.actions.insertAudioFromFile(await sfxFile(item, s0.lang));
      let el: DocElement | undefined;
      for (let i = 0; i < 40 && !el; i++) {
        await wait(25);
        el = ctx.getState().elements.find((e) => !before.has(e.id) && e.type === 'audio');
      }
      if (!el) throw new Error(ctx.getState().audioError || 'audio was not inserted');
      const id = el.id;
      const at = Math.max(0, n(args.at, s0.t));
      const vol = Math.min(1, Math.max(0, n(args.volume, 1)));
      ctx.actions.commitElements((els) => els.map((e) => (e.id === id ? ({ ...e, volume: vol, anim: { ...e.anim, start: at } } as DocElement) : e)));
      await wait(30);
      return { id, sfx: item.id, at };
    },
  },
  {
    name: 'sfx_auto',
    descriptionAr: 'يقرأ حركاتِ المستند (دخول، خروج، انتقالات، قطعات الفيديو) ويضع لكلّ حدثٍ صوتَه المناسب في طبقةٍ واحدة «أصوات الحركة» — تُستبدَل إن وُجدت. شغّله بعد ما تثبت الحركة.',
    descriptionEn: 'Read the document motion (entrances, exits, transitions, video cuts) and score each event with a fitting bundled sound, mixed into one "Motion sounds" layer (replaced if present). Run after the motion is final.',
    inputSchema: { type: 'object', properties: { volume: { type: 'number' } }, additionalProperties: false },
    run: async (args, ctx) => {
      const r = await applyAutoSfx(ctx, { volume: n(args.volume, 0.8) });
      return { id: r.id, events: r.events.map((e) => ({ t: Number(e.t.toFixed(3)), kind: e.kind, source: e.source })) };
    },
  },
  {
    name: 'motion_styles_list',
    descriptionAr: 'الأنماطُ العشرون الجاهزة (نيون، كتابة متحركة، جزيئات، زجاج، تدرّج منساب، صلصال، كوميك…): معرّف، اسم، هل فيه نص، ألوانه، وهل يصلح للعربي.',
    descriptionEn: 'The 20 ready motion styles (neon, kinetic type, particles, glass, gradient mesh, clay, comic…): id, name, whether it has text, its colour keys and whether it handles Arabic.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => MOTION_STYLES.map((m) => ({ id: m.id, name: m.nameEn, nameAr: m.nameAr, seconds: m.dur, text: m.text, sub: m.sub, colors: m.colors, arabic: m.arabic })),
  },
  {
    name: 'motion_style_insert',
    descriptionAr: 'يرسم نمطًا جاهزًا بمقاس اللوحة ويضعه مقطعَ فيديو بملء اللوحة عند at (الافتراضيّ المؤشّر): text وsub للنص، dur ثوانٍ، colors مثل {"bg":"#000","c1":"#ff2a1a"}.',
    descriptionEn: 'Render a ready motion style at the canvas size and place it as a full-canvas video clip at `at` (default playhead): text/sub, dur seconds, colors like {"bg":"#000","c1":"#ff2a1a"}.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' }, sub: { type: 'string' }, dur: { type: 'number' }, colors: { type: 'object' }, at: { type: 'number' } }, required: ['id'], additionalProperties: false },
    run: async (args, ctx) => {
      const style = MOTION_STYLES.find((m) => m.id === args.id);
      if (!style) throw new Error(`unknown style "${String(args.id)}" — call motion_styles_list`);
      const colors = (args.colors && typeof args.colors === 'object' ? args.colors : {}) as Record<string, string>;
      const id = await insertMotionStyle(ctx, {
        id: style.id,
        dur: Math.min(30, Math.max(1, n(args.dur, style.dur))),
        text: style.text ? (typeof args.text === 'string' ? args.text : '') : undefined,
        sub: style.sub ? (typeof args.sub === 'string' ? args.sub : '') : undefined,
        colors,
        at: typeof args.at === 'number' ? args.at : undefined,
      });
      return { id, style: style.id };
    },
  },
  {
    name: 'reference_analyze',
    descriptionAr: 'يقرأ فيديو مرجعيًّا من مسارٍ على الجهاز: اللقطات وأطوالها، متوسّط طول اللقطة، طاقة الحركة لكلّ ثانية (٠..١٠٠) وأقوى لحظات الحركة. استعمله قبل بناء إعلانٍ على مرجع.',
    descriptionEn: 'Read a reference video from a local path: shots and their lengths, average shot length, motion energy per second (0..100) and the strongest motion moments. Use before building an ad on a reference.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
    run: async (args) => {
      const { inTauri } = await import('./tauriEnv');
      if (!inTauri) throw new Error('reference_analyze needs the installed app');
      const { detectReferenceVideoStructure } = await import('./referenceVideo');
      const { readReference } = await import('./referenceSheet');
      const path = String(args.path);
      const s = await detectReferenceVideoStructure(path);
      const r = await readReference(path, s);
      return {
        duration: s.totalDuration,
        shots: s.shots.map((x, i) => ({ n: i + 1, start: Number(x.start.toFixed(2)), seconds: Number(x.duration.toFixed(2)) })),
        averageShot: Number(r.avgShot.toFixed(2)),
        energyPerSecond: r.energy,
        strongestMotionAt: r.peaks,
      };
    },
  },
];
