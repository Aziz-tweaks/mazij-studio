import type { StudioActions } from '../state/StudioContext';
import type { StudioState } from '../state/types';
import type { DocElement } from '../state/elements';
import { defaultAnim, defaultTextStagger, newElementId } from '../state/elements';
import { SIZES, CUSTOM_SIZE_IDX, sizeAt, PALETTES } from '../data/constants';

/** Roadmap #20 (+ #24-ب, which will drive the exact same registry locally): the
 * single typed command surface for "the chat becomes an interface to the app".
 * Every tool's `run` calls real `StudioActions` — never a parallel code path — so
 * anything exposed here really happened to the live document, exactly as if a
 * person had clicked it. Only verbs that fully work end-to-end are listed; see
 * docs/CONTROLS.md phase 15 for what's deliberately left out («قريبًا»). */

export interface McpCtx {
  getState: () => StudioState;
  actions: StudioActions;
}

export interface JsonSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface McpTool {
  name: string;
  descriptionAr: string;
  descriptionEn: string;
  inputSchema: JsonSchema;
  run: (args: Record<string, unknown>, ctx: McpCtx) => Promise<unknown>;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function requireId(args: Record<string, unknown>): string {
  const id = args.id;
  if (typeof id !== 'string' || !id) throw new Error('missing required "id"');
  return id;
}
function requireElement(state: StudioState, id: string): DocElement {
  const el = state.elements.find((e) => e.id === id);
  if (!el) throw new Error(`no element with id "${id}"`);
  return el;
}

function docSummary(state: StudioState) {
  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  return {
    size: { w: size.w, h: size.h, id: size.id },
    paletteIndex: state.postPalette,
    selectedIds: state.selectedIds,
    elementCount: state.elements.length,
    elements: state.elements.map((e) => ({
      id: e.id,
      type: e.type,
      visible: e.visible,
      opacity: e.opacity,
      geo: e.geo,
      ...(e.type === 'text' ? { text: e.text, fontFamily: e.fontFamily, fontSize: e.fontSize, weight: e.weight, color: e.color } : {}),
      ...(e.type === 'shape' ? { shape: e.shape, fill: e.fill, stroke: e.stroke } : {}),
      ...(e.type === 'image' ? { src: e.src, fit: e.fit } : {}),
    })),
  };
}

/** React applies `setState` asynchronously — a tool handler that calls an action
 * and immediately reads `ctx.getState()` back in the same tick would see the
 * *previous* render's snapshot, not the mutation it just made. One macrotask is
 * enough margin past React 18's scheduler (a microtask) for the bridge's state
 * ref to have been updated by the next render; every handler below awaits this
 * once right after its mutating action(s), before reading state for its result. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

async function waitFor(predicate: () => boolean, timeoutMs: number, intervalMs = 100): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for the app to finish the action');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'document_get',
    descriptionAr: 'قراءة حالة المستند الحالي: المقاس، اللوحة، والعناصر وخصائصها الأساسية.',
    descriptionEn: 'Read the current document: artboard size, palette, and every element with its key properties.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_args, ctx) => docSummary(ctx.getState()),
  },
  {
    name: 'document_new',
    descriptionAr: 'إنشاء/تصفير المستند الحالي إلى لوحة فارغة، باختيار مقاس جديد.',
    descriptionEn: 'Create/clear the current document into a blank artboard, optionally at a new size.',
    inputSchema: {
      type: 'object',
      properties: {
        sizeId: { type: 'string', enum: [...SIZES.map((s) => s.id), 'custom'], description: 'Preset size id, or "custom" with width/height.' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const sizeId = args.sizeId as string | undefined;
      if (sizeId === 'custom') {
        ctx.actions.newDocument({ sizeIdx: CUSTOM_SIZE_IDX, customW: num(args.width, 1080), customH: num(args.height, 1080) });
      } else if (sizeId) {
        const idx = SIZES.findIndex((s) => s.id === sizeId);
        if (idx === -1) throw new Error(`unknown sizeId "${sizeId}"`);
        ctx.actions.newDocument({ sizeIdx: idx });
      } else {
        ctx.actions.newDocument();
      }
      await flush();
      return docSummary(ctx.getState());
    },
  },
  {
    name: 'document_set_size',
    descriptionAr: 'ضبط مقاس اللوحة الحالية — مقاس جاهز أو مخصص (بكسل).',
    descriptionEn: 'Set the current artboard size — a preset id, or a custom width/height in pixels.',
    inputSchema: {
      type: 'object',
      properties: {
        sizeId: { type: 'string', enum: [...SIZES.map((s) => s.id), 'custom'] },
        width: { type: 'number' },
        height: { type: 'number' },
      },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const sizeId = args.sizeId as string | undefined;
      if (sizeId === 'custom' || (args.width && args.height && !sizeId)) {
        ctx.actions.setCustomSize(num(args.width, 1080), num(args.height, 1080));
      } else if (sizeId) {
        const idx = SIZES.findIndex((s) => s.id === sizeId);
        if (idx === -1) throw new Error(`unknown sizeId "${sizeId}"`);
        ctx.actions.setSizeIdx(idx);
      } else {
        throw new Error('provide sizeId or width+height');
      }
      await flush();
      return docSummary(ctx.getState());
    },
  },
  {
    name: 'document_set_palette',
    descriptionAr: 'تطبيق لوحة ألوان جاهزة على المستند — اختياريًا على كل العناصر.',
    descriptionEn: 'Apply a built-in color palette to the document — optionally onto every element.',
    inputSchema: {
      type: 'object',
      properties: {
        paletteIndex: { type: 'number', description: `0..${PALETTES.length - 1}` },
        applyToAllElements: { type: 'boolean' },
      },
      required: ['paletteIndex'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const idx = Math.round(num(args.paletteIndex, 0));
      if (idx < 0 || idx >= PALETTES.length) throw new Error(`paletteIndex out of range 0..${PALETTES.length - 1}`);
      ctx.actions.setPostPalette(idx);
      if (args.applyToAllElements) ctx.actions.applyPaletteToAll();
      await flush();
      return docSummary(ctx.getState());
    },
  },
  {
    name: 'element_add_text',
    descriptionAr: 'إضافة عنصر نص جديد عند موضع ومقاس محددين (بكسل).',
    descriptionEn: 'Add a new text element at a given position/size (pixels).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        w: { type: 'number' },
        h: { type: 'number' },
        fontFamily: { type: 'string' },
        fontSize: { type: 'number' },
        weight: { type: 'string', enum: ['regular', 'medium', 'bold'] },
        color: { type: 'string' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const state = ctx.getState();
      const size = sizeAt(state.sizeIdx, state.customW, state.customH);
      const id = newElementId('text');
      const wPx = num(args.w, size.w * 0.6);
      const hPx = num(args.h, size.h * 0.15);
      const el: DocElement = {
        id,
        type: 'text',
        visible: true,
        locked: false,
        opacity: 100,
        maskId: null,
        geo: { x: num(args.x, size.w * 0.1) / size.w, y: num(args.y, size.h * 0.1) / size.h, w: wPx / size.w, h: hPx / size.h, rotation: 0 },
        text: str(args.text, 'نص جديد'),
        fontFamily: str(args.fontFamily, 'Alexandria'),
        fontSize: num(args.fontSize, 48),
        weight: (typeof args.weight === 'string' ? args.weight : 'bold') as 'regular' | 'medium' | 'bold',
        color: typeof args.color === 'string' ? args.color : null,
        halign: 'start',
        valign: 'top',
        anim: defaultAnim('none', 0, 0.6),
        textAnim: defaultTextStagger(),
        pathId: null,
      };
      ctx.actions.commitElements((els) => [...els, el]);
      ctx.actions.selectElement(id);
      await flush();
      return { id, element: docSummary(ctx.getState()).elements.find((e) => e.id === id) };
    },
  },
  {
    name: 'element_add_shape',
    descriptionAr: 'إضافة شكل جديد (مستطيل أو دائرة) عند موضع ومقاس محددين (بكسل).',
    descriptionEn: 'Add a new shape (rect or ellipse) at a given position/size (pixels).',
    inputSchema: {
      type: 'object',
      properties: {
        shape: { type: 'string', enum: ['rect', 'ellipse'] },
        x: { type: 'number' },
        y: { type: 'number' },
        w: { type: 'number' },
        h: { type: 'number' },
      },
      required: ['shape', 'x', 'y', 'w', 'h'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const shape = args.shape as 'rect' | 'ellipse';
      if (shape !== 'rect' && shape !== 'ellipse') throw new Error('shape must be "rect" or "ellipse"');
      ctx.actions.addShapeElement(shape, { x: num(args.x, 0), y: num(args.y, 0), w: num(args.w, 100), h: num(args.h, 100) });
      await flush();
      const state = ctx.getState();
      const id = state.selectedIds[0];
      return { id, element: docSummary(state).elements.find((e) => e.id === id) };
    },
  },
  {
    name: 'element_set_text',
    descriptionAr: 'تغيير نص عنصر نصي موجود.',
    descriptionEn: 'Change the text content of an existing text element.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'], additionalProperties: false },
    run: async (args, ctx) => {
      const id = requireId(args);
      if (requireElement(ctx.getState(), id).type !== 'text') throw new Error(`element "${id}" is not a text element`);
      ctx.actions.setElementText(id, str(args.text));
      await flush();
      return docSummary(ctx.getState()).elements.find((e) => e.id === id);
    },
  },
  {
    name: 'element_set_text_style',
    descriptionAr: 'ضبط خصائص نص موجود: الخط، الحجم، الوزن، اللون، المحاذاة.',
    descriptionEn: 'Set properties of an existing text element: font, size, weight, color, alignment.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        fontFamily: { type: 'string' },
        fontSize: { type: 'number' },
        weight: { type: 'string', enum: ['regular', 'medium', 'bold'] },
        color: { type: 'string' },
        halign: { type: 'string', enum: ['start', 'center', 'end'] },
        valign: { type: 'string', enum: ['top', 'middle', 'bottom'] },
      },
      required: ['id'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const id = requireId(args);
      if (requireElement(ctx.getState(), id).type !== 'text') throw new Error(`element "${id}" is not a text element`);
      if (typeof args.fontFamily === 'string') ctx.actions.setElementFont(id, args.fontFamily);
      if (typeof args.fontSize === 'number') ctx.actions.setElementFontSize(id, args.fontSize);
      if (typeof args.weight === 'string') ctx.actions.setElementWeight(id, args.weight as 'regular' | 'medium' | 'bold');
      if (typeof args.color === 'string') ctx.actions.setElementColor(id, args.color);
      if (typeof args.halign === 'string') ctx.actions.setElementHAlign(id, args.halign as 'start' | 'center' | 'end');
      if (typeof args.valign === 'string') ctx.actions.setElementVAlign(id, args.valign as 'top' | 'middle' | 'bottom');
      await flush();
      return docSummary(ctx.getState()).elements.find((e) => e.id === id);
    },
  },
  {
    name: 'element_set_shape_style',
    descriptionAr: 'ضبط خصائص شكل موجود: التعبئة، الحد، نصف القطر.',
    descriptionEn: 'Set properties of an existing shape element: fill, stroke, radius.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, fill: { type: 'string' }, stroke: { type: 'string' }, strokeWidth: { type: 'number' }, radius: { type: 'number' } },
      required: ['id'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const id = requireId(args);
      if (requireElement(ctx.getState(), id).type !== 'shape') throw new Error(`element "${id}" is not a shape element`);
      if (typeof args.fill === 'string') ctx.actions.setShapeFill(id, args.fill);
      if (typeof args.stroke === 'string') ctx.actions.setShapeStroke(id, args.stroke);
      if (typeof args.strokeWidth === 'number') ctx.actions.setShapeStrokeWidth(id, args.strokeWidth);
      if (typeof args.radius === 'number') ctx.actions.setShapeRadius(id, args.radius);
      await flush();
      return docSummary(ctx.getState()).elements.find((e) => e.id === id);
    },
  },
  {
    name: 'element_set_image_style',
    descriptionAr: 'ضبط خصائص صورة موجودة: طريقة الملاءمة، القلب، نصف القطر، الحد.',
    descriptionEn: 'Set properties of an existing image element: fit, flip, radius, stroke.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        fit: { type: 'string', enum: ['cover', 'contain', 'fill'] },
        flipH: { type: 'boolean' },
        flipV: { type: 'boolean' },
        radius: { type: 'number' },
        stroke: { type: 'string' },
        strokeWidth: { type: 'number' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const id = requireId(args);
      const el = requireElement(ctx.getState(), id);
      if (el.type !== 'image') throw new Error(`element "${id}" is not an image element`);
      if (typeof args.fit === 'string') ctx.actions.setImageFit(id, args.fit as 'cover' | 'contain' | 'fill');
      if (args.flipH && !el.flipH) ctx.actions.setImageFlip(id, 'h');
      if (args.flipV && !el.flipV) ctx.actions.setImageFlip(id, 'v');
      if (typeof args.radius === 'number') ctx.actions.setImageRadius(id, args.radius);
      if (typeof args.stroke === 'string') ctx.actions.setImageStroke(id, args.stroke);
      if (typeof args.strokeWidth === 'number') ctx.actions.setImageStrokeWidth(id, args.strokeWidth);
      await flush();
      return docSummary(ctx.getState()).elements.find((e) => e.id === id);
    },
  },
  {
    name: 'element_set_geometry',
    descriptionAr: 'نقل/تحجيم/تدوير عنصر — بالبكسل، نسبةً لمقاس اللوحة الحالي.',
    descriptionEn: 'Move/resize/rotate an element — in pixels, relative to the current artboard size.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' }, rotation: { type: 'number' } },
      required: ['id'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const id = requireId(args);
      requireElement(ctx.getState(), id);
      ctx.actions.setElementGeoPx(id, {
        x: typeof args.x === 'number' ? args.x : undefined,
        y: typeof args.y === 'number' ? args.y : undefined,
        w: typeof args.w === 'number' ? args.w : undefined,
        h: typeof args.h === 'number' ? args.h : undefined,
        rotation: typeof args.rotation === 'number' ? args.rotation : undefined,
      });
      await flush();
      return docSummary(ctx.getState()).elements.find((e) => e.id === id);
    },
  },
  {
    name: 'element_set_opacity',
    descriptionAr: 'ضبط شفافية عنصر (0..100).',
    descriptionEn: 'Set an element\'s opacity (0..100).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, opacity: { type: 'number' } }, required: ['id', 'opacity'], additionalProperties: false },
    run: async (args, ctx) => {
      const id = requireId(args);
      requireElement(ctx.getState(), id);
      ctx.actions.setElementOpacity(id, num(args.opacity, 100));
      await flush();
      return docSummary(ctx.getState()).elements.find((e) => e.id === id);
    },
  },
  {
    name: 'element_select',
    descriptionAr: 'تحديد عنصر بمعرّفه (أو إلغاء التحديد إن لم يُمرَّر معرّف).',
    descriptionEn: 'Select an element by id (or clear selection if no id is given).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, additionalProperties: false },
    run: async (args, ctx) => {
      const id = typeof args.id === 'string' ? args.id : null;
      if (id) requireElement(ctx.getState(), id);
      ctx.actions.selectElement(id);
      await flush();
      return { selectedIds: ctx.getState().selectedIds };
    },
  },
  {
    name: 'element_delete',
    descriptionAr: 'حذف عنصر بمعرّفه.',
    descriptionEn: 'Delete an element by id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    run: async (args, ctx) => {
      const id = requireId(args);
      requireElement(ctx.getState(), id);
      ctx.actions.commitElements((els) => els.filter((e) => e.id !== id));
      return { deleted: id };
    },
  },
  {
    name: 'templates_list',
    descriptionAr: 'قراءة قائمة القوالب المحفوظة وخاناتها القابلة للتعبئة.',
    descriptionEn: 'List saved templates and their fillable slots.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_args, ctx) => ctx.getState().templates.map((t) => ({ id: t.id, name: t.name, slots: t.slots.map((s) => ({ id: s.id, label: s.label, kind: s.kind })) })),
  },
  {
    name: 'templates_apply_fill',
    descriptionAr: 'تعبئة خانات قالب محفوظ بمحتوى جديد وتطبيقه على المستند الحالي (بنية الحركة + المحتوى).',
    descriptionEn: 'Fill a saved template\'s slots with new content and apply it to the current document (structure + content).',
    inputSchema: {
      type: 'object',
      properties: { templateId: { type: 'string' }, fills: { type: 'object', description: 'slotId -> {kind:"text",text} | {kind:"image",src} | {kind:"color",hex}' } },
      required: ['templateId', 'fills'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const templateId = str(args.templateId);
      const tpl = ctx.getState().templates.find((t) => t.id === templateId);
      if (!tpl) throw new Error(`no template with id "${templateId}"`);
      ctx.actions.applyTemplateFill(templateId, args.fills as never);
      await flush();
      return docSummary(ctx.getState());
    },
  },
  {
    name: 'templates_apply_motion',
    descriptionAr: 'تطبيق بنية الحركة فقط من قالب محفوظ على محتوى المستند الحالي.',
    descriptionEn: 'Apply only the saved motion structure of a template onto the current document\'s content.',
    inputSchema: { type: 'object', properties: { templateId: { type: 'string' } }, required: ['templateId'], additionalProperties: false },
    run: async (args, ctx) => {
      const templateId = str(args.templateId);
      const tpl = ctx.getState().templates.find((t) => t.id === templateId);
      if (!tpl) throw new Error(`no template with id "${templateId}"`);
      ctx.actions.applyTemplateMotion(templateId);
      await flush();
      return docSummary(ctx.getState());
    },
  },
  {
    name: 'image_insert_from_path',
    descriptionAr: 'إدراج صورة من مسار ملف على القرص (داخل ~/Mazij فقط — نفس صلاحيات الملفات الحالية). يحتاج تطبيق Tauri الحقيقي، غير متاح في معاينة المتصفح.',
    descriptionEn: 'Insert an image from a filesystem path (must be under ~/Mazij — the app\'s existing fs scope). Needs the real Tauri app; unavailable in the browser preview.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } }, required: ['path'], additionalProperties: false },
    run: async (args, ctx) => {
      const { inTauri } = await import('./tauriEnv');
      if (!inTauri) throw new Error('image_insert_from_path requires the real Tauri app, not the browser preview');
      const path = str(args.path);
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const bytes = await readFile(path);
      const name = path.split('/').pop() || 'image';
      const ext = name.split('.').pop()?.toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const file = new File([bytes], name, { type: mime });
      const dropPointPx = typeof args.x === 'number' && typeof args.y === 'number' ? { x: args.x, y: args.y } : undefined;
      await ctx.actions.insertImageFromFile(file, dropPointPx);
      await flush();
      const state = ctx.getState();
      const id = state.selectedIds[0];
      return { id, element: docSummary(state).elements.find((e) => e.id === id) };
    },
  },
  {
    name: 'export_run',
    descriptionAr: 'تصدير التصميم الحالي — PNG/JPG/SVG/MP4/GIF — لأكثر من مقاس دفعة واحدة، وإرجاع مسارات الملفات الناتجة.',
    descriptionEn: 'Export the current design — PNG/JPG/SVG/MP4/GIF — for one or more sizes in a batch, returning the resulting file paths.',
    inputSchema: {
      type: 'object',
      properties: {
        targets: { type: 'array', description: 'size ids, e.g. ["ig","x","tt","li","custom"]' },
        format: { type: 'string', enum: ['png', 'jpg', 'svg', 'mp4', 'gif'] },
        scale: { type: 'number', enum: [1, 2, 3] },
        transparent: { type: 'boolean' },
        fps: { type: 'number' },
        quality: { type: 'string', enum: ['high', 'med'] },
      },
      required: ['targets', 'format'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const targets = Array.isArray(args.targets) ? (args.targets as unknown[]).filter((t): t is string => typeof t === 'string') : [];
      if (!targets.length) throw new Error('"targets" must be a non-empty array of size ids');
      const format = args.format as StudioState['exportFormat'];
      if (!['png', 'jpg', 'svg', 'mp4', 'gif'].includes(format)) throw new Error(`unknown format "${String(args.format)}"`);

      const allIds = [...SIZES.map((s) => s.id), 'custom'];
      const nextTargets: Record<string, boolean> = {};
      for (const id of allIds) nextTargets[id] = targets.includes(id);
      // toggleExportTarget flips one at a time against the *current* state, so drive
      // it per-id rather than trying to replace the whole object in one call.
      for (const id of allIds) {
        const cur = ctx.getState().targets[id] ?? false;
        if (cur !== nextTargets[id]) ctx.actions.toggleExportTarget(id);
      }
      ctx.actions.setExportFormat(format);
      if (typeof args.scale === 'number') ctx.actions.setExportScale(args.scale as 1 | 2 | 3);
      if (typeof args.transparent === 'boolean') ctx.actions.setExportTransparent(args.transparent);
      if (typeof args.fps === 'number') ctx.actions.setExportFps(args.fps);
      if (typeof args.quality === 'string') ctx.actions.setExportQuality(args.quality as 'high' | 'med');

      // `startExport` reads `exportScale`/`exportFormat`/etc. from the *current*
      // render's closure (via the live-actions proxy) — it must not fire before
      // the setters above have actually flushed, or it exports with stale options.
      await flush();
      ctx.actions.startExport();
      await waitFor(() => ctx.getState().exportState === 'done' || ctx.getState().exportState === 'error' || ctx.getState().exportState === 'unavailable', 60_000);
      const state = ctx.getState();
      if (state.exportState === 'unavailable') throw new Error('this export (video) needs the packaged Tauri app — unavailable in this environment');
      return { state: state.exportState, paths: state.exportedPaths, results: state.exportResults };
    },
  },
  {
    name: 'undo',
    descriptionAr: 'تراجع خطوة واحدة.',
    descriptionEn: 'Undo one step.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_args, ctx) => {
      ctx.actions.undo();
      await flush();
      return docSummary(ctx.getState());
    },
  },
  {
    name: 'redo',
    descriptionAr: 'إعادة خطوة واحدة.',
    descriptionEn: 'Redo one step.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_args, ctx) => {
      ctx.actions.redo();
      await flush();
      return docSummary(ctx.getState());
    },
  },
];
