import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { ArtboardThumb } from './HomeScreen';
import { PALETTES, SIZES, sizeAt } from '../data/constants';
import { STARTER_TEMPLATES } from '../lib/starterTemplates';
import { useStudio } from '../state/StudioContext';
import type { Dictionary } from '../i18n/strings';
import type { SlotFill, SlotKind, TemplateSlot } from '../lib/templates';
import type { DocElement, ElementId } from '../state/elements';
import { elementDisplayName } from '../lib/layerNames';

/** Which slot kinds make sense for a given element type — a shape has no editable
 * text/src content, only a fillable color; text/image elements additionally offer
 * their own natural content kind. Mirrors `fillTemplate`'s own kind/type guard in
 * `templates.ts`, so the UI never offers a combination the fill logic would reject. */
function kindsFor(type: DocElement['type']): SlotKind[] {
  if (type === 'text') return ['text', 'color'];
  if (type === 'image') return ['image'];
  return ['color'];
}

function slotKindLabel(L: Dictionary, kind: SlotKind): string {
  return kind === 'text' ? L.tpl_slot_text : kind === 'image' ? L.tpl_slot_image : L.tpl_slot_color;
}

export function TemplatesDialog() {
  const { state, actions, dict: L } = useStudio();
  const [draft, setDraft] = useState<Record<ElementId, { kind: SlotKind; label: string }>>({});
  const [name, setName] = useState('');
  const [fillingId, setFillingId] = useState<string | null>(null);
  const [fillValues, setFillValues] = useState<Record<string, string>>({});

  // نفس قاعدة قائمة الطبقات، وبنفس المساعد المشترك: الاسم من المحتوى لا من المعرّف.
  // كان هذا الفرع يُلحق المعرّف **كاملًا** (`شكل · shape-mvdiutl2-7`)، وهو أسوأ من
  // شظيّة الخط الزمني: الخانة التي يملؤها هي اسم الفتحة في القالب المحفوظ، فكان
  // المعرّف الخام يُخبَّأ داخل مكتبة القوالب لا على الشاشة وحدها.
  const labelFor = (el: DocElement) => {
    const key = `l_${el.id}` as const;
    if (key in L) return L[key as keyof typeof L] as string;
    return elementDisplayName(el, L);
  };

  /** اسم الفتحة حين يترك المصمّم الخانة فارغة: نفس الاسم المقروء المعروض في السطر. */
  const slotFallbackLabel = (elementId: ElementId) => {
    const el = state.elements.find((e) => e.id === elementId);
    return el ? labelFor(el) : L.ln_element;
  };

  const fillingTemplate = useMemo(() => state.templates.find((t) => t.id === fillingId) ?? null, [state.templates, fillingId]);

  if (!state.templatesOpen) return null;

  const setRow = (id: ElementId, kind: SlotKind | 'none') => {
    setDraft((d) => {
      const next = { ...d };
      if (kind === 'none') delete next[id];
      else next[id] = { kind, label: d[id]?.label ?? '' };
      return next;
    });
  };
  const setRowLabel = (id: ElementId, label: string) => {
    setDraft((d) => (d[id] ? { ...d, [id]: { ...d[id], label } } : d));
  };

  const save = () => {
    const slots: TemplateSlot[] = Object.entries(draft).map(([elementId, v]) => ({
      id: elementId,
      elementId,
      kind: v.kind,
      label: v.label.trim() || slotFallbackLabel(elementId),
    }));
    // Zero slots is valid: a pure motion template (roadmap #19) carries no fillable
    // content at all, only the montage structure every element already holds.
    actions.saveTemplateFromCurrent(name, slots);
    setName('');
    setDraft({});
  };

  const openFill = (templateId: string) => {
    setFillingId(templateId);
    setFillValues({});
  };

  const submitFill = () => {
    if (!fillingTemplate) return;
    const fills: Record<string, SlotFill> = {};
    for (const slot of fillingTemplate.slots) {
      const raw = fillValues[slot.id];
      if (raw === undefined || raw === '') continue;
      if (slot.kind === 'text') fills[slot.id] = { kind: 'text', text: raw };
      else if (slot.kind === 'image') fills[slot.id] = { kind: 'image', src: raw };
      else fills[slot.id] = { kind: 'color', hex: raw };
    }
    actions.applyTemplateFill(fillingTemplate.id, fills);
    setFillingId(null);
    setFillValues({});
  };

  return (
    <div data-testid="templates-dialog" onClick={actions.closeTemplates} style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--overlay)', display: 'grid', placeItems: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'calc(var(--r) + 2px)', boxShadow: '0 30px 80px rgba(0,0,0,.35)', padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, flex: 1 }}>{L.tpl_dialog_title}</h2>
          <button data-testid="close-templates-btn" onClick={actions.closeTemplates} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}>
            <Icon size={16} path="M5 5l10 10M15 5L5 15" />
          </button>
        </div>

        {/* القوالبُ الجاهزة داخل المشروع المفتوح — طلبُ المالك: قائمةٌ بمصغّراتٍ من
            داخل المشروع، والقالبُ ينزل على مقاسه هو. كانت هذه النافذة لا تعرض إلا
            «احفظ تصميمك كقالب» و«لا توجد قوالب محفوظة بعد»، فبدا زرُّ «القوالب»
            في المحرّر بلا قوالب أصلًا (جولة ٢٤ أكتوبر ٢٠٢٦). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="mz-label">{L.tpl_ready}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>{L.tpl_ready_hint}</div>
          <div data-testid="ready-templates" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(132px,1fr))', gap: 10 }}>
            {STARTER_TEMPLATES.map((tp) => (
              <ReadyTemplateCard key={tp.id} id={tp.id} />
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--line)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{L.tpl_yours}</div>
          <div className="mz-label">{L.tpl_mark_slots}</div>
          <div data-testid="template-builder" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {state.elements.map((el) => {
              const kinds = kindsFor(el.type);
              const row = draft[el.id];
              return (
                <div key={el.id} data-testid={`slot-row-${el.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelFor(el)}</span>
                  <select
                    data-testid={`slot-kind-${el.id}`}
                    value={row?.kind ?? 'none'}
                    onChange={(e) => setRow(el.id, e.target.value as SlotKind | 'none')}
                    style={{ height: 28, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }}
                  >
                    <option value="none">{L.tpl_slot_none}</option>
                    {kinds.map((k) => (
                      <option key={k} value={k}>
                        {slotKindLabel(L, k)}
                      </option>
                    ))}
                  </select>
                  {row && (
                    <input
                      data-testid={`slot-label-${el.id}`}
                      value={row.label}
                      onChange={(e) => setRowLabel(el.id, e.target.value)}
                      placeholder={L.tpl_slots_label}
                      style={{ width: 120, height: 28, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, padding: '0 8px' }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              data-testid="template-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={L.tpl_name_ph}
              style={{ flex: 1, height: 34, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, padding: '0 10px' }}
            />
            <button
              data-testid="save-template-btn"
              onClick={save}
              disabled={!name.trim()}
              style={{ height: 34, padding: '0 16px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 600, fontSize: 13, opacity: name.trim() ? 1 : 0.5 }}
            >
              {L.tpl_save}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="mz-label">{L.tpl_library}</div>
          {!state.templates.length && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{L.tpl_empty}</div>}
          <div data-testid="template-library-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {state.templates.map((t) => (
              <div key={t.id} data-testid={`template-row-${t.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)' }}>
                {/* مصغّرةٌ حقيقيّة بمسار التصيير نفسه (`ArtboardThumb` من
                    `HomeScreen.tsx`) — لا سطحٌ ثانٍ يرسم بطريقته. واللوحةُ
                    الحاليّة هي المرجع لأن القالب لا يحفظ لوحته، تمامًا كسلوك
                    `applyTemplateFill` نفسِه الذي تبنيه الآن. */}
                <ArtboardThumb size={sizeAt(t.sizeIdx, t.customW, t.customH)} palette={PALETTES[state.postPalette] ?? PALETTES[0]} elements={t.elements} decorAccent={state.decorAccent} lang={state.lang} w={44} h={34} radius={6} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                <span dir="ltr" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {t.slots.length} {L.tpl_slots_label}
                </span>
                <button data-testid={`apply-motion-${t.id}`} onClick={() => actions.applyTemplateMotion(t.id)} style={{ height: 28, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--text)', fontSize: 11.5 }}>
                  {L.tpl_apply_motion}
                </button>
                <button data-testid={`open-fill-${t.id}`} onClick={() => openFill(t.id)} style={{ height: 28, padding: '0 10px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accentSoft)', color: 'var(--accentText)', fontSize: 11.5, fontWeight: 600 }}>
                  {L.tpl_fill_apply}
                </button>
                <button data-testid={`delete-template-${t.id}`} onClick={() => actions.deleteTemplate(t.id)} style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}>
                  <Icon size={14} path="M5 5l10 10M15 5L5 15" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {fillingTemplate && (
          <div data-testid="template-fill-form" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)' }}>
            <div className="mz-label">
              {L.tpl_fill_title} · {fillingTemplate.name}
            </div>
            {fillingTemplate.slots.map((slot) => (
              <div key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 120, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {slot.label} <span style={{ color: 'var(--muted)' }}>({slotKindLabel(L, slot.kind)})</span>
                </span>
                <input
                  data-testid={`fill-input-${slot.id}`}
                  value={fillValues[slot.id] ?? ''}
                  onChange={(e) => setFillValues((v) => ({ ...v, [slot.id]: e.target.value }))}
                  style={{ flex: 1, height: 30, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, padding: '0 8px' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button data-testid="cancel-fill-btn" onClick={() => setFillingId(null)} style={{ height: 30, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--text)', fontSize: 12 }}>
                {L.tpl_cancel}
              </button>
              <button data-testid="apply-fill-btn" onClick={submitFill} style={{ height: 30, padding: '0 14px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 600, fontSize: 12 }}>
                {L.tpl_apply_btn}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadyTemplateCard({ id }: { id: string }) {
  const { state, actions, dict: L } = useStudio();
  const tp = STARTER_TEMPLATES.find((t) => t.id === id)!;
  const elements = useMemo(() => tp.elements(), [tp]);
  const size = SIZES[tp.sizeIdx];
  return (
    <button
      data-testid={`ready-template-${tp.id}`}
      onClick={() => actions.applyStarterHere(tp.id)}
      title={L[tp.nameKey] as string}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 6, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', color: 'var(--text)', textAlign: 'start' }}
    >
      <ArtboardThumb size={size} palette={PALETTES[tp.paletteIdx]} elements={elements} decorAccent={tp.decorAccent} lang={state.lang} w={118} h={96} radius={6} />
      <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>{L[tp.nameKey] as string}</span>
    </button>
  );
}
