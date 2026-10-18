import type { DocElement, ElementAnim, ElementId, TextStaggerAnim } from '../state/elements';
import { newElementId } from '../state/elements';

/** Roadmap #7 + #19 (merged): a saved template separates *structure* from *content*.
 * `elements` is the full structural snapshot (geometry, layer order, and — crucially
 * — each element's real `anim`/`textAnim`, i.e. the montage structure: clip timing,
 * per-property keyframe tracks, curves, and text-stagger sequencing) exactly as it
 * existed when saved. `slots` names which of those elements are fillable with new
 * content without touching that structure. The two roadmap items share one object
 * because a slot's content and its motion are two facets of the same element. */
export type SlotKind = 'text' | 'image' | 'color';

export interface TemplateSlot {
  id: string;
  label: string;
  elementId: ElementId;
  kind: SlotKind;
}

export interface Template {
  id: string;
  name: string;
  createdAt: number;
  sizeIdx: number;
  customW: number;
  customH: number;
  elements: DocElement[];
  slots: TemplateSlot[];
}

export type SlotFill = { kind: 'text'; text: string } | { kind: 'image'; src: string } | { kind: 'color'; hex: string };

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function newTemplateId(): string {
  return newElementId('tpl');
}

export function createTemplate(name: string, elements: DocElement[], slots: TemplateSlot[], sizeIdx: number, customW: number, customH: number): Template {
  return {
    id: newTemplateId(),
    name,
    createdAt: Date.now(),
    sizeIdx,
    customW,
    customH,
    elements: deepClone(elements),
    slots: deepClone(slots),
  };
}

/** Builds a fresh element list from a template's structure: every element's geometry,
 * order, id, and real `anim`/`textAnim` (the motion structure) are carried over
 * verbatim — only the content field of each slotted element is overwritten by
 * `fills`. A slot with no matching fill keeps the content the template was saved
 * with, so partial fills never leave a slot blank. Mismatched slot/element/fill kinds
 * (e.g. a text fill on an image slot) are ignored defensively rather than corrupting
 * the element. */
export function fillTemplate(template: Template, fills: Partial<Record<string, SlotFill>>): DocElement[] {
  return template.elements.map((el) => {
    const cloned = deepClone(el);
    const slot = template.slots.find((s) => s.elementId === el.id);
    if (!slot) return cloned;
    const fill = fills[slot.id];
    if (!fill) return cloned;
    if (slot.kind === 'text' && cloned.type === 'text' && fill.kind === 'text') return { ...cloned, text: fill.text };
    if (slot.kind === 'image' && cloned.type === 'image' && fill.kind === 'image') return { ...cloned, src: fill.src, placeholder: false };
    if (slot.kind === 'color' && fill.kind === 'color') {
      if (cloned.type === 'text') return { ...cloned, color: fill.hex };
      if (cloned.type === 'shape') return { ...cloned, fill: fill.hex };
    }
    return cloned;
  });
}

/** The montage structure alone, stripped of content/geometry/identity — one entry per
 * element, keyed only by its *kind* and position among same-kind elements, so it can
 * be replayed onto an entirely different element list (different ids, different
 * count, different content) rather than only the template's own elements. */
export interface MotionRole {
  kind: DocElement['type'];
  anim: ElementAnim;
  textAnim?: TextStaggerAnim;
}

export function extractMotionStructure(elements: DocElement[]): MotionRole[] {
  return elements.map((el) => ({
    kind: el.type,
    anim: deepClone(el.anim),
    textAnim: el.type === 'text' ? deepClone(el.textAnim) : undefined,
  }));
}

/** Applies a saved motion structure onto a *different* set of elements: the Nth
 * element of a given kind in `motion` maps onto the Nth element of that same kind in
 * `targetElements`, in document order — content, geometry, and ids of the target are
 * left untouched, only `anim`/`textAnim` are replaced. Elements whose kind has no
 * corresponding (remaining) role — e.g. a target document with more images than the
 * motion template had — are returned unchanged rather than guessed at. */
export function applyMotionStructure(motion: MotionRole[], targetElements: DocElement[]): DocElement[] {
  const byKind: Partial<Record<DocElement['type'], MotionRole[]>> = {};
  for (const role of motion) {
    const list = byKind[role.kind] ?? [];
    list.push(role);
    byKind[role.kind] = list;
  }
  const nextIdx: Partial<Record<DocElement['type'], number>> = {};
  return targetElements.map((el) => {
    const roles = byKind[el.type];
    const i = nextIdx[el.type] ?? 0;
    if (!roles || i >= roles.length) return el;
    nextIdx[el.type] = i + 1;
    const role = roles[i];
    const anim = deepClone(role.anim);
    if (el.type === 'text') {
      return { ...el, anim, textAnim: role.textAnim ? deepClone(role.textAnim) : el.textAnim };
    }
    return { ...el, anim };
  });
}
