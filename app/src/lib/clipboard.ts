import type { DocElement, ElementId } from '../state/elements';
import { newElementId, newGroupId } from '../state/elements';

/** **النسخ يحمل ما يعتمد عليه المنسوخ.**
 *
 * عنصرٌ مقصوصٌ بقناع (`maskId`) أو نصٌّ على مسار (`pathId`) يشير إلى عنصرٍ آخر.
 * نسخُه وحده يُنتج نسخةً تشير إلى **الأصل** — فتُقَصّ النسخةُ المُزاحة عند موضع
 * القناع القديم، أو يجري نصُّها على مسارٍ لم يتحرّك. فالمجموعةُ تتّسع إلى ما
 * تُشير إليه، تكرارًا حتى لا يبقى مرجعٌ خارجها. وتبقى بترتيب الطبقات في المستند. */
export function withDependencies(ids: ReadonlySet<ElementId>, all: readonly DocElement[]): DocElement[] {
  const want = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const el of all) {
      if (!want.has(el.id)) continue;
      const refs = [el.maskId, el.type === 'text' ? el.pathId : null];
      for (const r of refs) {
        if (r && !want.has(r) && all.some((e) => e.id === r)) {
          want.add(r);
          grew = true;
        }
      }
    }
  }
  return all.filter((e) => want.has(e.id));
}

/** نسخٌ بمعرّفاتٍ جديدة وإزاحة `dx`/`dy` (كسورٌ من اللوح، كـ`geo` نفسه).
 *
 * المراجع **داخل** المجموعة تُعاد كتابتها إلى النُّسخ (القناع، المسار، المجموعة)،
 * فالنسخة وحدةٌ قائمةٌ بذاتها لا تمسّ الأصل. ومعرّفاتُ الطبقات الداخليّة (التعبئة،
 * المفاتيح) تبقى كما هي: هي مُعرَّفةٌ داخل عنصرها لا في المستند. */
export function cloneElements(src: readonly DocElement[], dx: number, dy: number): DocElement[] {
  const idMap = new Map<ElementId, ElementId>();
  const groupMap = new Map<string, string>();
  for (const el of src) idMap.set(el.id, newElementId(el.type === 'shape' && el.shape === 'path' ? 'path' : el.type));
  const groupOf = (g: string | null | undefined) => {
    if (!g) return g;
    let next = groupMap.get(g);
    if (!next) {
      next = newGroupId();
      groupMap.set(g, next);
    }
    return next;
  };
  return src.map((el) => {
    const base = {
      ...el,
      id: idMap.get(el.id)!,
      groupId: groupOf(el.groupId),
      maskId: el.maskId ? (idMap.get(el.maskId) ?? el.maskId) : null,
      geo: { ...el.geo, x: el.geo.x + dx, y: el.geo.y + dy },
    } as DocElement;
    if (base.type === 'text' && base.pathId) return { ...base, pathId: idMap.get(base.pathId) ?? base.pathId };
    return base;
  });
}

/** يُدرج `clones` فوق أعلى عنصرٍ من `sources` مباشرةً — النسخة تظهر فوق أصلها كما
 * في الأداة الشائعة وفيغما، لا في قمّة المستند فوق كلّ شيء. */
export function insertAbove(all: readonly DocElement[], sources: readonly DocElement[], clones: readonly DocElement[]): DocElement[] {
  const srcIds = new Set(sources.map((e) => e.id));
  let top = -1;
  all.forEach((e, i) => {
    if (srcIds.has(e.id)) top = i;
  });
  if (top < 0) return [...all, ...clones];
  return [...all.slice(0, top + 1), ...clones, ...all.slice(top + 1)];
}
