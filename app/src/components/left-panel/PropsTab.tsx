import { useEffect, useState } from 'react';
import { FX_CATALOG, fxSpec, type FxKind } from '../../lib/effects';
import { Icon } from '../Icon';
import { ICONS, MEDIUM_SURFACES, PALETTES, sizeAt, seg } from '../../data/constants';
import type { HAlign, VAlign } from '../../state/types';
import { firstSelectedElement, selectedElements, useStudio } from '../../state/StudioContext';
import { geoToPx } from '../../lib/geometry';
import type { AnimProperty, DocElement, StaggerDirection, StaggerEffect, StaggerUnit, TextElement } from '../../state/elements';
import { ANIM_PRESETS, ELEMENT_BLENDS, animPropertiesFor, hasCustomAnimation, lineHeightOf, pivotOf, resolveTextColor } from '../../state/elements';
import { documentDuration, keyframeAt } from '../../lib/animTimeline';
import { isInstantEffect, revealUnitCount, revealValueAt } from '../../lib/textStagger';
import type { EasingId } from '../../lib/easing';
import { EASE_LABEL_KEY } from '../timeline/EasingMenu';
import { DEFAULT_MODEL_ID, downloadModel, getModelBytes, isModelDownloaded, modelById } from '../../lib/localModels';
import { removeImageBackground } from '../../lib/backgroundRemoval';
import { upscaleImage } from '../../lib/superResolution';
import { isBooleanEligible } from '../../lib/pathBoolean';
import { convertTextElementToOutline, isBuiltinFontFamily } from '../../lib/arabicShaping';
import { buildCaptionElements, extractAudioSamples, transcribeAudio, whisperModelInfo } from '../../lib/autoCaptions';
import { baseLayerColorOf, currentAppearance, normalizeHex, resolveLayerColor } from '../../lib/appearance';
import type { AppearanceBlend, AppearanceFillLayer, AppearanceShadowLayer, AppearanceStrokeLayer, StrokePosition } from '../../state/elements';
import { WIDTH_PROFILE_PRESETS, type StrokeWidthProfile } from '../../lib/variableStroke';

const STAGGER_UNITS: StaggerUnit[] = ['char', 'word', 'line'];
const STAGGER_DIRECTIONS: StaggerDirection[] = ['start', 'end', 'center', 'random'];
const STAGGER_EFFECTS: StaggerEffect[] = ['fade', 'slide', 'scale', 'rotate', 'blur', 'gather', 'none', 'type'];
const STAGGER_EASINGS: EasingId[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'back', 'bounce', 'hold'];

const WEIGHTS: Array<'regular' | 'medium' | 'bold'> = ['regular', 'medium', 'bold'];

/** حدّا التتبُّع بالنسبة المئويّة من مقاس الخطّ. ‑٢٠٪ تُلصِق الحروف حدّ التداخل،
 * و‎+٥٠٪ تفرّقها حدّ انقطاع الكلمة — وما وراءهما لا يُنتج طباعةً بل خللًا، وهو مدى
 * أوسع ممّا تعرضه إنديزاين (‑١٠٪..+٢٠٪ في شريطها) عن قصد: الحدّ هنا للحماية من
 * الخطأ لا لفرض ذوق. */
const TRACKING_MIN = -20;
const TRACKING_MAX = 50;
const ANIMS = ANIM_PRESETS;
const TFIELDS: Array<{ k: string; prop: 'x' | 'y' | 'w' | 'h' | 'rotation' | 'opacity'; suffix?: string }> = [
  { k: 'X', prop: 'x' },
  { k: 'Y', prop: 'y' },
  { k: 'W', prop: 'w' },
  { k: 'H', prop: 'h' },
  { k: '∠', prop: 'rotation', suffix: '°' },
  { k: '◐', prop: 'opacity', suffix: '%' },
];

const ALIGN_BUTTONS: Array<{ d: string; kind: 'h' | 'v'; value: string }> = [
  { d: 'M3 3v14M7 6h9M7 11h6', kind: 'h', value: 'start' },
  { d: 'M10 3v14M4 7h12M6 12h8', kind: 'h', value: 'center' },
  { d: 'M17 3v14M4 6h9M7 11h6', kind: 'h', value: 'end' },
  { d: 'M3 3h14M6 7v9M11 7v6', kind: 'v', value: 'top' },
  { d: 'M3 10h14M7 4v12M12 6v8', kind: 'v', value: 'middle' },
  { d: 'M3 17h14M6 4v9M11 7v6', kind: 'v', value: 'bottom' },
];

const OBJECT_ALIGN: Array<{ d: string; edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' }> = [
  { d: 'M3 3v14M7 6h9M7 11h6', edge: 'left' },
  { d: 'M10 3v14M4 7h12M6 12h8', edge: 'center' },
  { d: 'M17 3v14M4 6h9M7 11h6', edge: 'right' },
  { d: 'M3 3h14M6 7v9M11 7v6', edge: 'top' },
  { d: 'M3 10h14M7 4v12M12 6v8', edge: 'middle' },
  { d: 'M3 17h14M6 4v9M11 7v6', edge: 'bottom' },
];

/** معرّفاتُ التحديد متى كان مجموعةً واحدةً كاملة، وإلا `null`. */
function groupSelectionIds(state: { selectedIds: string[]; elements: DocElement[] }): string[] | null {
  if (state.selectedIds.length < 2) return null;
  const sel = state.elements.filter((e) => state.selectedIds.includes(e.id));
  const gid = sel[0]?.groupId;
  if (!gid || sel.some((e) => e.groupId !== gid)) return null;
  if (state.elements.filter((e) => e.groupId === gid).length !== sel.length) return null;
  return sel.map((e) => e.id);
}

function groupBoxPx(elements: DocElement[], ids: string[], size: { w: number; h: number }) {
  const m = elements.filter((e) => ids.includes(e.id));
  const x0 = Math.min(...m.map((e) => e.geo.x));
  const y0 = Math.min(...m.map((e) => e.geo.y));
  const x1 = Math.max(...m.map((e) => e.geo.x + e.geo.w));
  const y1 = Math.max(...m.map((e) => e.geo.y + e.geo.h));
  return { x: x0 * size.w, y: y0 * size.h, w: (x1 - x0) * size.w, h: (y1 - y0) * size.h };
}

export function PropsTab() {
  const { state, actions, dict: L } = useStudio();
  const isPen = state.tool === 'pen';
  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  const el = firstSelectedElement(state);

  // Clipping mask applies to a *pair* of any element kinds, as long as at least one of
  // them is a shape (the mask). If both are shapes, the topmost (drawn last, matching
  // a vector editor's "top object = mask" convention) acts as the mask and the other is the
  // clipped target — see docs/CONTROLS.md "قص بالشكل".
  const pairSel = state.selectedIds.length === 2 ? selectedElements(state) : [];
  let maskCandidate: { target: DocElement; mask: DocElement & { type: 'shape' } } | null = null;
  if (pairSel.length === 2) {
    const [a, b] = pairSel;
    const shapes = pairSel.filter((e): e is DocElement & { type: 'shape' } => e.type === 'shape');
    if (shapes.length === 1) {
      const mask = shapes[0];
      const target = pairSel.find((e) => e.id !== mask.id)!;
      maskCandidate = { target, mask };
    } else if (shapes.length === 2) {
      const idxA = state.elements.findIndex((e) => e.id === a.id);
      const idxB = state.elements.findIndex((e) => e.id === b.id);
      const mask = (idxA > idxB ? a : b) as DocElement & { type: 'shape' };
      const target = idxA > idxB ? b : a;
      maskCandidate = { target, mask };
    }
  }

  // Roadmap #12 — "نص على مسار": same pair-selection convention as the clipping mask
  // above (select the text element + a candidate path shape together), rather than a
  // separate dropdown — one text element, one path shape, order doesn't matter.
  let pathCandidate: { text: DocElement & { type: 'text' }; path: DocElement & { type: 'shape' } } | null = null;
  if (pairSel.length === 2) {
    const texts = pairSel.filter((e): e is DocElement & { type: 'text' } => e.type === 'text');
    const paths = pairSel.filter((e): e is DocElement & { type: 'shape' } => e.type === 'shape' && e.shape === 'path' && ((e.points?.length ?? 0) >= 2 || (e.subpaths?.length ?? 0) > 0));
    if (texts.length === 1 && paths.length === 1) pathCandidate = { text: texts[0], path: paths[0] };
  }

  // Roadmap #10: any 2+-shape selection can attempt a boolean op — eligibility
  // (closed paths only) is checked inside `BooleanOpsSection` itself, which disables
  // rather than hides when something in the selection doesn't qualify.
  const multiSel = state.selectedIds.length >= 2 ? selectedElements(state) : [];
  const shapeSelection = multiSel.length >= 2 && multiSel.every((e) => e.type === 'shape') ? (multiSel as Array<DocElement & { type: 'shape' }>) : null;

  return (
    <div style={{ padding: '14px 14px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {isPen ? (
        <PenProps />
      ) : !el ? (
        <ProjectDetails />
      ) : (
        <>
          {maskCandidate && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="mz-label">{L.sec_mask}</div>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6 }}>{L.mask_hint}</p>
              <button
                onClick={() => actions.applyClippingMask(maskCandidate.target.id, maskCandidate.mask.id)}
                style={{ height: 34, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--accentSoft)', color: 'var(--accentText)', fontSize: 12, fontWeight: 600 }}
              >
                {L.clip_mask}
              </button>
            </section>
          )}
          {el.maskId && !maskCandidate && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="mz-label">{L.sec_mask}</div>
              <button
                onClick={() => actions.releaseClippingMask(el.id)}
                style={{ height: 30, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12, fontWeight: 600 }}
              >
                {L.release_mask}
              </button>
            </section>
          )}
          {pathCandidate && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="mz-label">{L.sec_text_on_path}</div>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6 }}>{L.text_on_path_hint}</p>
              <button
                data-testid={`text-on-path-btn-${pathCandidate.text.id}`}
                onClick={() => actions.setTextPathId(pathCandidate.text.id, pathCandidate.path.id)}
                style={{ height: 34, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--accentSoft)', color: 'var(--accentText)', fontSize: 12, fontWeight: 600 }}
              >
                {L.text_on_path_btn}
              </button>
            </section>
          )}
          {el.type === 'text' && el.pathId && !pathCandidate && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="mz-label">{L.sec_text_on_path}</div>
              <button
                data-testid={`text-on-path-release-${el.id}`}
                onClick={() => actions.setTextPathId(el.id, null)}
                style={{ height: 30, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12, fontWeight: 600 }}
              >
                {L.text_on_path_release}
              </button>
            </section>
          )}
          {/* **الصوتُ لا يُرى**: لا تحويلَ ولا مظهرَ ولا محاذاة — علوُّه وكتمُه وتوقيتُه وحدها. */}
          {el.type === 'audio' && (
            <>
              <AudioProps el={el} />
              {MEDIUM_SURFACES[state.medium].motionProps && <TimingSection />}
            </>
          )}
          {/* **طبقةُ المؤثّر لا صندوقَ لها**: نوعُه وقوّتُه وتلاشيه وتوقيتُه وحدها. */}
          {el.type === 'fx' && (
            <>
              <FxProps el={el} />
              {MEDIUM_SURFACES[state.medium].motionProps && <TimingSection />}
            </>
          )}
          {el.type === 'text' && <TextProps el={el} />}
          {el.type === 'shape' && <ShapeProps el={el} />}
          {el.type === 'image' && <ImageProps el={el} />}
          {el.type === 'lottie' && <LottieProps el={el} />}
          {el.type === 'video' && <VideoProps el={el} />}
          {el.type === 'video' && <AutoCaptionsSection el={el} />}

          <OrganiseSection />

          {/* كانت هذه كلّها خلف «احترافي». ألغى المالك الوضعين (٢٤ أكتوبر ٢٠٢٦):
              «العمق يُطلب ولا يُفرض» — فالأقسام حاضرة، والمفاتيح الزمنيّة وحدها
              تنتظر مستندًا له زمن. */}
            {el.type !== 'audio' && el.type !== 'fx' && <>
              {state.selectedIds.length === 1 && <AppearanceSection el={el} />}
              <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div className="mz-label" style={{ flex: 1 }}>{L.transform}</div>
                  <button
                    onClick={() => actions.setLockAspect(!state.lockAspect)}
                    title={L.lock_aspect}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, height: 22, padding: '0 8px', border: `1px solid ${state.lockAspect ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 999, background: state.lockAspect ? 'var(--accentSoft)' : 'transparent', color: state.lockAspect ? 'var(--accentText)' : 'var(--muted)', fontSize: 10.5, fontWeight: 600 }}
                  >
                    <Icon size={12} path="M6 9V6a4 4 0 1 1 8 0v3M4 9h12v8H4z" />
                    {L.lock_aspect}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {TFIELDS.map((f) => {
                    // **مجموعةٌ محدَّدة = جسمٌ واحد** (٣٠ أكتوبر): كانت الحقولُ كلّها معطَّلةً متى حُدِّدت مجموعة
                    // (عضوان فأكثر)، فلا يُكتب موضعُها ولا مقاسُها — والنقرُ على حقلٍ معطَّلٍ يُرسل الأرقامَ إلى
                    // اللوحة فتُطلق اختصاراتِ الأدوات. الآن X/Y/W/H تخصّ إطارَ المجموعة الجامع.
                    const groupIds = groupSelectionIds(state);
                    const box = groupIds ? groupBoxPx(state.elements, groupIds, size) : geoToPx(el.geo, size);
                    const raw = f.prop === 'rotation' ? el.geo.rotation : f.prop === 'opacity' ? el.opacity : (box as unknown as Record<string, number>)[f.prop];
                    const geoProp = f.prop === 'x' || f.prop === 'y' || f.prop === 'w' || f.prop === 'h';
                    const disabled = groupIds ? !geoProp : state.selectedIds.length !== 1;
                    return (
                      <label key={f.k} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 4px 0 8px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12 }}>
                        <span dir="ltr" style={{ color: 'var(--muted)', minWidth: 14, fontSize: 11 }}>{f.k}</span>
                        <NumField
                          disabled={disabled}
                          deferCommit={!!groupIds}
                          value={raw}
                          onCommit={(v) => {
                            if (groupIds && geoProp) {
                              if ((f.prop === 'w' || f.prop === 'h') && state.lockAspect && box.w > 0 && box.h > 0) {
                                const ratio = box.w / box.h;
                                actions.setGroupGeoPx(groupIds, f.prop === 'w' ? { w: v, h: v / ratio } : { h: v, w: v * ratio });
                              } else actions.setGroupGeoPx(groupIds, { [f.prop]: v });
                              return;
                            }
                            if (f.prop === 'opacity') actions.setElementOpacity(el.id, v);
                            else if (f.prop === 'rotation') actions.setElementGeoPx(el.id, { rotation: v });
                            else if (f.prop === 'x') actions.setElementGeoPx(el.id, { x: v });
                            else if (f.prop === 'y') actions.setElementGeoPx(el.id, { y: v });
                            else if ((f.prop === 'w' || f.prop === 'h') && state.lockAspect && box.w > 0 && box.h > 0) {
                              const ratio = box.w / box.h;
                              if (f.prop === 'w') actions.setElementGeoPx(el.id, { w: v, h: v / ratio });
                              else actions.setElementGeoPx(el.id, { h: v, w: v * ratio });
                            } else if (f.prop === 'w') actions.setElementGeoPx(el.id, { w: v });
                            else actions.setElementGeoPx(el.id, { h: v });
                          }}
                          style={{ flex: 1, minWidth: 0, width: '100%', border: 0, background: 'transparent', outline: 0, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}
                        />
                        {f.suffix && <span style={{ color: 'var(--muted)', fontSize: 11 }}>{f.suffix}</span>}
                      </label>
                    );
                  })}
                </div>
                {state.selectedIds.length === 1 && MEDIUM_SURFACES[state.medium].motionProps && <PivotRow el={el} />}
                {state.selectedIds.length === 1 && MEDIUM_SURFACES[state.medium].motionProps && <KeyframeToggleRow el={el} />}
              </section>

              {MEDIUM_SURFACES[state.medium].motionProps && <TimingSection />}

              <ArrangeSection />
              {shapeSelection && <BooleanOpsSection shapes={shapeSelection} />}

              {state.selectedIds.length === 1 && (
                <section data-testid="blend-section" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="mz-label">{L.blend}</div>
                  {/* أزرارٌ لا قائمةٌ منسدلة: الأوضاعُ ثمانيةٌ تُرى كلُّها وتُختار بنقرة. */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ELEMENT_BLENDS.map((b) => {
                      const on = (el.blend ?? 'normal') === b;
                      return (
                        <button key={b} data-testid={`blend-${b}`} onClick={() => actions.setElementBlend(el.id, b)} style={{ height: 28, padding: '0 10px', border: `1px solid ${on ? 'var(--accent)' : 'transparent'}`, borderRadius: 999, fontSize: 11.5, background: on ? 'var(--accentSoft)' : 'var(--surface2)', color: on ? 'var(--accentText)' : 'var(--text)' }}>
                          {L[(`blend_${b.replace('-', '_')}`) as 'blend_normal']}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
              {state.selectedIds.length === 1 && <EffectsSection el={el} />}
            </>}
        </>
      )}
    </div>
  );
}

/** لوحُ طبقة المؤثّر: النوعُ (تبديلٌ بلا حذفٍ وإعادة)، والقوّةُ (سحبةٌ = خطوةُ تراجعٍ
 * واحدة)، والتلاشي دخولًا وخروجًا للفلاتر والمؤثّرات. والانتقالُ لا تلاشيَ له: قمّتُه في
 * منتصف مقطعه بالبناء. */
function FxProps({ el }: { el: DocElement & { type: 'fx' } }) {
  const { state, actions, dict: L } = useStudio();
  const spec = fxSpec(el.fx);
  const isTr = spec.cat === 'transition';
  const slider = (key: 'amount' | 'fadeIn' | 'fadeOut', label: string, max: number, step: number, fmt: (v: number) => string) => {
    const v = el[key];
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
        <span style={{ color: 'var(--muted)', flex: 1 }}>{label}</span>
        <input
          data-testid={`fx-${key}-${el.id}`}
          dir="ltr"
          type="range"
          min={0}
          max={max}
          step={step}
          value={v}
          onChange={(e) => {
            actions.beginElementEdit(L.undo_fx_edit);
            actions.liveSetFxProps(el.id, { [key]: Number(e.target.value) });
          }}
          onPointerUp={() => actions.commitElementEdit()}
          onKeyUp={() => actions.commitElementEdit()}
          onBlur={() => actions.commitElementEdit()}
          style={{ flex: 1.4, accentColor: 'var(--accent)' }}
        />
        <span dir="ltr" style={{ color: 'var(--muted)', fontSize: 11, minWidth: 38, textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</span>
      </label>
    );
  };
  const maxFade = Math.max(0.1, Math.round((el.anim.duration / 2) * 10) / 10);
  return (
    <section data-testid={`fx-props-${el.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mz-label">{L.sec_fx}</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
        <span style={{ color: 'var(--muted)', flex: 1 }}>{L.fx_kind}</span>
        <select
          data-testid={`fx-kind-${el.id}`}
          value={el.fx}
          onChange={(e) => actions.setFxProps(el.id, { fx: e.target.value as FxKind })}
          style={{ flex: 1.4, height: 28, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }}
        >
          {(['filter', 'effect', 'transition'] as const).map((c) => (
            <optgroup key={c} label={c === 'filter' ? L.fx_cat_filter : c === 'effect' ? L.fx_cat_effect : L.fx_cat_transition}>
              {FX_CATALOG.filter((f) => f.cat === c).map((f) => (
                <option key={f.id} value={f.id}>{state.lang === 'ar' ? f.ar : f.en}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {slider('amount', L.fx_amount, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
      {!isTr && slider('fadeIn', L.fx_fade_in, maxFade, 0.05, (v) => `${v.toFixed(2)}s`)}
      {!isTr && slider('fadeOut', L.fx_fade_out, maxFade, 0.05, (v) => `${v.toFixed(2)}s`)}
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.7, color: 'var(--muted)' }}>{isTr ? L.fx_peak_hint : L.fx_scope_hint}</p>
    </section>
  );
}

/** لوحُ طبقة الصوت: اسمُها وطولُها، وعلوُّها (سحبةٌ واحدة = خطوةُ تراجعٍ واحدة) وكتمُها. */
function AudioProps({ el }: { el: DocElement & { type: 'audio' } }) {
  const { actions, dict: L } = useStudio();
  const fmt = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(2).padStart(5, '0')}`;
  return (
    <section data-testid={`audio-props-${el.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mz-label">{L.sec_audio}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ color: 'var(--muted)', flex: 1 }}>{L.audio_length}</span>
        <span dir="ltr" data-testid={`audio-length-${el.id}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(el.anim.duration)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ color: 'var(--muted)', flex: 1 }}>{L.audio_file_length}</span>
        <span dir="ltr" style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(el.durationSec)}</span>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
        <span style={{ color: 'var(--muted)', flex: 1 }}>{L.audio_volume}</span>
        <input
          data-testid={`audio-volume-${el.id}`}
          dir="ltr"
          type="range"
          min={0}
          max={100}
          value={Math.round(el.volume * 100)}
          onChange={(e) => {
            actions.beginElementEdit(L.undo_audio_volume);
            actions.liveSetAudioVolume(el.id, Number(e.target.value) / 100);
          }}
          onPointerUp={() => actions.commitElementEdit()}
          onKeyUp={() => actions.commitElementEdit()}
          onBlur={() => actions.commitElementEdit()}
          style={{ flex: 1.4, accentColor: 'var(--accent)' }}
        />
        <span dir="ltr" style={{ color: 'var(--muted)', fontSize: 11, minWidth: 34, textAlign: 'end' }}>{Math.round(el.volume * 100)}%</span>
      </label>
      <button
        data-testid={`audio-mute-${el.id}`}
        aria-pressed={el.muted}
        onClick={() => actions.setAudioMuted(el.id, !el.muted)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, height: 28, padding: 0, border: 0, background: 'transparent', color: 'var(--text)', fontSize: 12, textAlign: 'start' }}
      >
        <Toggle on={el.muted} />
        <span style={{ flex: 1 }}>{L.audio_muted}</span>
      </button>
    </section>
  );
}

/** One small per-property keyframe toggle per animatable property, right under the
 * transform fields: filled + accent when the selected element has a real keyframe on
 * that property at the current playhead, outline otherwise. Clicking stamps the
 * property's *currently rendered* value as a keyframe at the playhead (so turning it
 * on never causes a visual jump); clicking again removes that keyframe. Fine-tuning a
 * keyframe's value/easing once it exists happens in the pro-mode timeline's expanded
 * track rows (Timeline.tsx/Clip.tsx) — this row is only the quick add/remove + state
 * indicator the task calls for, not a second copy of that editor. */
function KeyframeToggleRow({ el }: { el: DocElement }) {
  const { state, actions, dict: L } = useStudio();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {animPropertiesFor(el).map((p: AnimProperty) => {
        // «عند المؤشّر» صادقةٌ الآن في كلّ موضعٍ بلا استثناء، فلم يبقَ لهذا الصفّ
        // حالةُ تعطيل. وما كان يُعطِّله هو أنّ المؤشّر **قبل** بداية المقطع لا
        // كسرَ له؛ وقد صار زمنَ حركةٍ سالبًا، وهو زمنٌ مشروع. فذهبت
        // `canKeyframeAtPlayhead` و`disabled` و`kf_outside_clip` معًا — إزالةَ
        // منعٍ لا تغطيةَ سطح.
        //
        // والهويّةُ الآن مقارنةُ رقمَي إطارٍ بمعدّل المستند، لا كسرٌ باعتدالِ
        // ٠٫٠٢: وهذا هو العطل ٤ في `qa/motion-journey.spec.mjs` مُزالًا من جذره،
        // فالماسةُ لا تستطيع أن تُبلِّغ عن مفتاحٍ ليس تحت المؤشّر.
        const kf = keyframeAt(el.anim, p, state.t, state.fps);
        return (
          <button
            key={p}
            data-testid={`kf-toggle-${el.id}-${p}`}
            data-keyed={kf ? 'true' : 'false'}
            onClick={() => (kf ? actions.deleteTrackKeyframe(el.id, p, kf.id) : actions.addTrackKeyframeAtPlayhead(el.id, p))}
            title={`${L[`prop_${p}` as keyof typeof L] as string} · ${kf ? L.delete_keyframe : L.add_keyframe}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              height: 22,
              padding: '0 7px',
              border: `1px solid ${kf ? 'var(--accent)' : 'var(--line)'}`,
              borderRadius: 999,
              background: kf ? 'var(--accentSoft)' : 'transparent',
              color: kf ? 'var(--accentText)' : 'var(--muted)',
              fontSize: 10.5,
              fontWeight: 600,
              opacity: 1,
              cursor: 'pointer',
            }}
          >
            <span style={{ width: 7, height: 7, transform: 'rotate(45deg)', background: kf ? 'var(--accent)' : 'transparent', border: `1.2px solid ${kf ? 'var(--accent)' : 'var(--muted)'}`, borderRadius: 1 }} />
            {L[`prop_${p}` as keyof typeof L] as string}
          </button>
        );
      })}
    </div>
  );
}

/** **«التوقيت» — متى يدخل العنصر ومتى يخرج، بالأرقام.**
 *
 * كان الطريقُ الوحيد إلى بداية مقطعٍ ونهايته سحبَ جسمه وحافّته على الخطّ الزمنيّ، وعلى
 * مستندٍ طوله أربعٌ وأربعون ثانيةً يصير البكسلُ الواحدُ هناك أكثرَ من إطار. فهذان حقلان
 * بالثواني على شبكة الإطارات، وزرّان يأخذان اللحظةَ من المؤشّر (`[` و`⌥]` في After
 * Effects)، ومفتاحُ «يظهر في مقطعه فقط» (`ElementAnim.bounded`).
 *
 * ويعمل على **كلّ المحدَّد** معًا: مشهدٌ من صورةٍ ونصّين يُوقَّت بإيماءةٍ واحدة. وحقلٌ
 * تختلف قيمتُه بين المحدَّدين يُعرَض فارغًا بعلامة «مختلف» لا برقمِ أوّلها — رقمٌ واحدٌ
 * يُعرَض عن عناصرَ مختلفة كذبٌ عن البقيّة. */
function TimingSection() {
  const { state, actions, dict: L } = useStudio();
  const sel = selectedElements(state);
  if (!sel.length) return null;
  const ids = sel.map((e) => e.id);
  const starts = sel.map((e) => e.anim.start);
  const ends = sel.map((e) => e.anim.start + e.anim.duration);
  const same = (xs: number[]) => xs.every((x) => Math.abs(x - xs[0]) < 1e-6);
  const start = same(starts) ? starts[0] : null;
  const end = same(ends) ? ends[0] : null;
  const boundedAll = sel.every((e) => !!e.anim.bounded);
  const locked = sel.every((e) => e.locked);
  const fieldBox: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 4px 0 8px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12 };
  const hereBtn: React.CSSProperties = { height: 22, padding: '0 7px', border: '1px solid var(--line)', borderRadius: 999, background: 'transparent', color: 'var(--muted)', fontSize: 10.5, fontWeight: 600 };
  return (
    <section data-testid="timing-section" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mz-label">{L.sec_timing}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {(
          [
            { key: 'start', label: L.timing_start, value: start, tip: L.timing_start_here },
            { key: 'end', label: L.timing_end, value: end, tip: L.timing_end_here },
          ] as const
        ).map((f) => (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={fieldBox}>
              <span style={{ color: 'var(--muted)', fontSize: 11, minWidth: 34 }}>{f.label}</span>
              <TimeField
                testId={`timing-${f.key}`}
                value={f.value}
                placeholder={L.timing_mixed}
                disabled={locked}
                onCommit={(v) => actions.setClipTiming(ids, f.key === 'start' ? { start: v } : { end: v })}
              />
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>{state.lang === 'ar' ? 'ث' : 's'}</span>
            </label>
            <button
              data-testid={`timing-${f.key}-here`}
              title={f.tip}
              disabled={locked}
              onClick={() => actions.setClipTiming(ids, f.key === 'start' ? { start: state.t } : { end: state.t })}
              style={hereBtn}
            >
              {L.timing_from_playhead}
            </button>
          </div>
        ))}
      </div>
      <button
        data-testid="timing-bounded"
        aria-pressed={boundedAll}
        disabled={locked}
        onClick={() => actions.setClipBounded(ids, !boundedAll)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, height: 28, padding: 0, border: 0, background: 'transparent', color: 'var(--text)', fontSize: 12, textAlign: 'start' }}
      >
        <Toggle on={boundedAll} />
        <span style={{ flex: 1 }}>{L.clip_bounded}</span>
      </button>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{L.clip_bounded_hint}</p>
      {/* **حركة الخروج** (٣٠ أكتوبر): كلُّ عنصرٍ كان يختفي بقطعٍ حادٍّ عند نهاية مقطعه. */}
      <div className="mz-label">{L.exit_anim}</div>
      <div data-testid="anim-exit" style={{ display: 'flex', flexWrap: 'wrap', padding: 2, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2, alignItems: 'center' }}>
        {(['none', 'fade', 'focus', 'shrink', 'grow', 'up'] as const).map((k) => {
          const on = (sel[0].anim.exit?.kind ?? 'none') === k;
          return (
            <button
              key={k}
              data-testid={`anim-exit-${k}`}
              title={L.exit_anim}
              onClick={() => ids.forEach((id) => actions.setExitAnim(id, k === 'none' ? null : { kind: k, seconds: sel[0].anim.exit?.seconds ?? 0.3 }))}
              style={{ height: 22, padding: '0 7px', border: 0, borderRadius: 'calc(var(--rs) - 2px)', background: on ? 'var(--seg)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)', fontSize: 11, fontWeight: on ? 600 : 500 }}
            >
              {L[`exit_${k}` as const]}
            </button>
          );
        })}
        {sel[0].anim.exit && [0.2, 0.3, 0.5].map((sec) => {
          const on = Math.abs((sel[0].anim.exit?.seconds ?? 0) - sec) < 0.01;
          return (
            <button
              key={`x${sec}`}
              data-testid={`anim-exit-sec-${sec}`}
              onClick={() => sel[0].anim.exit && ids.forEach((id) => actions.setExitAnim(id, { kind: sel[0].anim.exit!.kind, seconds: sec }))}
              style={{ height: 22, padding: '0 7px', border: 0, borderRadius: 'calc(var(--rs) - 2px)', background: on ? 'var(--seg)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)', fontSize: 11, fontWeight: on ? 600 : 500, fontVariantNumeric: 'tabular-nums' }}
            >
              {`${sec}${L.sec_short}`}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** حقلُ ثوانٍ: يُلتزَم عند Enter أو الخروج لا عند كلّ ضغطة — «٢» ثم «٢٫٢» ثم «٢٫٢٧»
 * ثلاثُ حالاتٍ في الطريق إلى رقمٍ واحد، ولو كُتب كلٌّ منها لانتقل المقطعُ ثلاث مرّات
 * وامتلأ التراجعُ بخطواتٍ لا معنى لها. ويُعرض بمنزلتين: الإطارُ عند ٣٠ ثلاثُ مئويّات. */
function TimeField({ value, onCommit, disabled, placeholder, testId }: { value: number | null; onCommit: (v: number) => void; disabled?: boolean; placeholder?: string; testId?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace('٫', '.'));
    setDraft(null);
    if (draft.trim() !== '' && Number.isFinite(v)) onCommit(v);
  };
  return (
    <input
      data-testid={testId}
      dir="ltr"
      inputMode="decimal"
      disabled={disabled}
      placeholder={value === null ? placeholder : undefined}
      value={draft ?? (value === null ? '' : value.toFixed(2))}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') setDraft(null);
      }}
      onBlur={commit}
      style={{ flex: 1, minWidth: 0, width: '100%', border: 0, background: 'transparent', outline: 0, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}
    />
  );
}

function TextProps({ el }: { el: DocElement & { type: 'text' } }) {
  const { state, actions, dict: L } = useStudio();
  const pal = PALETTES[state.postPalette];
  const swatches = Array.from(new Set([pal.fg, pal.ac, pal.bg, '#FFFFFF', ...(pal.ac2 ? [pal.ac2] : [])]));
  const activeColor = el.color ?? pal.fg;
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const presetBlocked = hasCustomAnimation(el.anim.tracks, el.anim.preset);

  // مسوّدة نصّيّة لحقل المقاس أثناء الكتابة — وإلا استحال **كتابة** مقاس أصلًا.
  //
  // الحقل مضبوط بالكامل (`value={el.fontSize}`) وكان `onChange` يُمرّر كل ضغطة
  // زرّ إلى `setElementFontSize` التي تَقصُر القيمة على [٨، ٤٠٠] ثم تُعيدها إلى
  // الحقل. فكتابة «١٤٠» تمرّ بثلاث حالات: «١» تُرفع إلى ٨، ثم تصير «٨٤»، ثم
  // «٨٤٠» تُخفض إلى ٤٠٠ — فيستقرّ الحقل على ٤٠٠. وبالقياس: ٤٢ ← ٨٢، و٢٦ ← ٨٦.
  // أي أن كل مقاس من رقمين أو ثلاثة يبدأ بأقلّ من ٨ كان يُفسَد، وهي أغلب مقاسات
  // العناوين. وقد نجا هذا من ١٢٥٤ تأكيدًا لأن `controls.spec.mjs` يستعمل
  // `fill('140')` — وهي تضع القيمة دفعةً واحدة فلا تمرّ بالحالات الوسيطة أبدًا،
  // بينما المصمم يكتب رقمًا رقمًا.
  //
  // فالقصر يبقى، لكنه يُؤجَّل إلى لحظة الالتزام (خروج التركيز أو Enter)؛ وأثناء
  // الكتابة تُلتزم القيم الصالحة فورًا ليبقى التحديث الحيّ على اللوحة كما هو.
  const [sizeDraft, setSizeDraft] = useState<string | null>(null);
  // المسوّدة تخصّ العنصر الذي كُتبت فيه: الانتقال إلى نصٍّ آخر يُسقطها، وإلا ظهر
  // مقاسُ العنصر السابق في حقل عنصرٍ لم يُلمَس بعد.
  useEffect(() => setSizeDraft(null), [el.id]);
  const commitSize = () => {
    if (sizeDraft !== null) {
      const parsed = Number(sizeDraft);
      if (sizeDraft.trim() !== '' && Number.isFinite(parsed)) actions.setElementFontSize(el.id, parsed);
      setSizeDraft(null);
    }
  };
  // نفس نمط مسوّدة المقاس أعلاه، ولنفس السبب المكتوب هناك.
  const [trackingDraft, setTrackingDraft] = useState<string | null>(null);
  useEffect(() => setTrackingDraft(null), [el.id]);
  const commitTracking = () => {
    if (trackingDraft !== null) {
      const parsed = Number(trackingDraft);
      if (trackingDraft.trim() !== '' && Number.isFinite(parsed)) actions.setElementTracking(el.id, parsed);
      else actions.setElementTracking(el.id, 0);
      setTrackingDraft(null);
    }
  };

  const [lineHeightDraft, setLineHeightDraft] = useState<string | null>(null);
  useEffect(() => setLineHeightDraft(null), [el.id]);
  const commitLineHeight = () => {
    if (lineHeightDraft === null) return;
    const parsed = Number(lineHeightDraft);
    setLineHeightDraft(null);
    if (lineHeightDraft.trim() !== '' && Number.isFinite(parsed)) actions.setTextLineHeight(el.id, parsed);
  };

  return (
    <>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="mz-label">{L.sec_text}</div>
        <input
          value={el.text}
          onChange={(e) => actions.setElementText(el.id, e.target.value)}
          style={{ height: 34, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', outline: 0, width: '100%', fontWeight: 600 }}
        />
        {/* ٩٦ لا ٧٦: حجمٌ مثل ٣٤٫٥٦ مع سهمَي الحقل كان يُقصّ إلى «34.5(» (جولة ٢٤ أكتوبر). */}
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 96px', gap: 8 }}>
          <button
            onClick={() => setFontPickerOpen((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12, textAlign: 'start' }}
          >
            {/* اسمُ الخطّ كما في القائمة لا عائلتُه الداخليّة (`Mz-…` للخطوط المرفوعة). */}
            <span style={{ flex: 1, fontFamily: el.fontFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="auto">{state.fonts.find((f) => f.family === el.fontFamily)?.name ?? el.fontFamily}</span>
            <Icon size={14} path="M5 8l5 5 5-5" />
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 8px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12 }}>
            <input
              dir="ltr"
              type="number"
              min={8}
              max={400}
              value={sizeDraft ?? Math.round(el.fontSize * 10) / 10}
              onChange={(e) => {
                const raw = e.target.value;
                setSizeDraft(raw);
                // القيمة الصالحة تُلتزم أثناء الكتابة (معاينة حيّة)؛ وغير الصالحة
                // تبقى مسوّدةً حتى الالتزام بدل أن تُقصَر تحت الإصبع.
                const parsed = Number(raw);
                if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= 8 && parsed <= 400) {
                  actions.setElementFontSize(el.id, parsed);
                }
              }}
              onBlur={commitSize}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSize();
              }}
              style={{ flex: 1, minWidth: 0, width: '100%', border: 0, background: 'transparent', outline: 0, fontSize: 12, textAlign: 'center' }}
            />
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>px</span>
          </label>
          {fontPickerOpen && (
            <div style={{ position: 'absolute', top: 36, insetInlineStart: 0, zIndex: 5, width: '100%', maxHeight: 180, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
              {state.fonts.filter((f) => f.status === 'ready').map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    actions.setElementFont(el.id, f.family);
                    setFontPickerOpen(false);
                  }}
                  style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 10px', border: 0, background: el.fontFamily === f.family ? 'var(--accentSoft)' : 'transparent', fontFamily: f.family, fontSize: 13 }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* تتبُّع الأحرف. صفٌّ مستقلّ تحت صفّ الخطّ/المقاس لأنه قرارٌ طباعيٌّ من
            عائلتهما: الخطّ والمقاس والتتبُّع تُضبَط معًا حين يُركَّب عنوان.
            والمسوّدة هنا ليست زينةً — الحقل يقبل السالب، و«‎-» وحدها ليست رقمًا،
            فحقلٌ مضبوطٌ بالكامل بلا مسوّدة كان سيبتلع الإشارة قبل أن يُكتب الرقم
            (نفس عطل حقل المقاس أعلاه بالضبط). */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 8px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12 }}>
          <span style={{ flex: 1, color: 'var(--muted)' }}>{L.tracking}</span>
          <input
            data-testid={`text-tracking-${el.id}`}
            dir="ltr"
            type="number"
            min={TRACKING_MIN}
            max={TRACKING_MAX}
            step={0.5}
            value={trackingDraft ?? el.tracking ?? 0}
            onChange={(e) => {
              const raw = e.target.value;
              setTrackingDraft(raw);
              const parsed = Number(raw);
              if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= TRACKING_MIN && parsed <= TRACKING_MAX) {
                actions.setElementTracking(el.id, parsed);
              }
            }}
            onBlur={commitTracking}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTracking();
            }}
            style={{ width: 54, border: 0, background: 'transparent', outline: 0, fontSize: 12, textAlign: 'center' }}
          />
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>%</span>
        </label>
        {/* تباعدُ الأسطر — مضاعِفٌ للمقاس كما في CSS، ويُلزِم عند Enter أو المغادرة. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 8px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12 }}>
          <span style={{ flex: 1, color: 'var(--muted)' }}>{L.line_height}</span>
          <input
            data-testid={`text-line-height-${el.id}`}
            dir="ltr"
            type="number"
            min={0.5}
            max={4}
            step={0.05}
            value={lineHeightDraft ?? Number(lineHeightOf(el).toFixed(3))}
            onChange={(e) => setLineHeightDraft(e.target.value)}
            onBlur={commitLineHeight}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLineHeight();
            }}
            style={{ width: 54, border: 0, background: 'transparent', outline: 0, fontSize: 12, textAlign: 'center' }}
          />
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>×</span>
        </label>
        <div style={{ display: 'flex', padding: 3, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2 }}>
          {WEIGHTS.map((w) => {
            const s = seg(el.weight === w);
            return (
              <button key={w} onClick={() => actions.setElementWeight(el.id, w)} style={{ flex: 1, height: 26, border: 0, borderRadius: 'calc(var(--rs) - 2px)', fontSize: 12, fontWeight: 500, background: s.bg, color: s.fg, boxShadow: s.sh }}>
                {L[`w_${w}` as const]}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{L.color}</span>
          {swatches.map((hex) => (
            <button
              key={hex}
              title={hex}
              onClick={() => actions.setElementColor(el.id, hex)}
              style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${hex === activeColor ? 'var(--accent)' : 'var(--line)'}`, background: hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)' }}
            />
          ))}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="mz-label">{L.align}</div>
        {/* مجموعتان مسمّاتان لا صفٌّ من ستّ أيقوناتٍ صامتة: كانت الأفقيّةُ والعموديّةُ
            مخلوطتين، و«البداية» في تصميمٍ عربيّ هي **اليمين** بينما أيقونتُها خطوطٌ
            مصفوفةٌ إلى اليسار — فالزرّ المفعَّل يقول «يسار» والنصّ على اللوحة يمين.
            الأيقوناتُ الأفقيّة تنعكس الآن مع اتّجاه الواجهة، ولكلّ زرٍّ اسمُه. */}
        {(['h', 'v'] as const).map((kind) => (
          <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 44, flex: 'none', fontSize: 11.5, color: 'var(--muted)' }}>{kind === 'h' ? L.align_h : L.align_v}</span>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
              {ALIGN_BUTTONS.filter((b) => b.kind === kind).map(({ d, value }) => {
                const active = kind === 'h' ? el.halign === value : el.valign === value;
                const label = L[`al_${value as HAlign | VAlign}` as const];
                return (
                  <button
                    key={`${kind}-${value}`}
                    data-testid={`align-${kind}-${value}`}
                    title={label}
                    aria-label={label}
                    aria-pressed={active}
                    onClick={() => (kind === 'h' ? actions.setElementHAlign(el.id, value as HAlign) : actions.setElementVAlign(el.id, value as VAlign))}
                    style={{ height: 30, display: 'grid', placeItems: 'center', border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--rs)', background: active ? 'var(--accentSoft)' : 'var(--surface2)', color: active ? 'var(--accentText)' : 'var(--muted)' }}
                  >
                    <Icon size={16} path={d} style={{ transform: kind === 'h' && state.lang === 'ar' ? 'scaleX(-1)' : 'none' }} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
          <input data-testid="justify-kashida-toggle" type="checkbox" checked={!!el.justify} onChange={(e) => actions.setElementJustify(el.id, e.target.checked)} />
          {L.justify_kashida}
        </label>
      </section>

      {/* كان هذا القسم مشروطًا بـ`el.id === 'head'`، وهو معرّفٌ لا يوجد إلا في البوستر
          التجريبي الجاهز — فأي نصٍّ يُنشئه المستخدم (معرّفه `text-<طابع زمني>`) لم يكن له
          مدخلٌ إلى حركة الدخول إطلاقًا، وهذا ما كان يمنع تنفيذ أبسط موجز: «عنوان يدخل
          بحركة». والنداء كان `actions.setAnim` العامّ، وهو يكتب حقل المستند ويَنسخ
          *اسم* النمط فقط إلى `'head'` بلا إعادة بناء `tracks` — فيُضيء الزرّ ولا
          يتحرّك شيء (قياسٌ: نفس `matrix(1,0,0,1,0,108)` قبل النقر وبعده). */}
      {/* والحرسُ هنا كما هو في `AnimPresetMenu`: تطبيقُ نمطٍ جاهزٍ يُعيد بناء
          `tracks` كلّها، فمسارٌ بُني باليد كان يُباد بنقرة. والرفضُ معلَنٌ —
          أزرارٌ معطَّلةٌ بتلميحٍ يقول السببَ وما يُزيله — لا صامتٌ ولا زرٌّ ميت.
          موضعانِ لأنّ للنمط مدخلَين، والحرسُ نفسُه في النموذج (`withPreset`). */}
      {/* الحركة عمقُ الزمن: تظهر لمستندٍ له زمن. وعلى الساكن بابُها «حرّك» في الشريط
          السياقي، وهو يجعل التصميم مشهدًا أوّلًا (`animateElement`) — فلا تُعرض هنا
          قائمةُ دخولٍ لا يراها أحدٌ في ملفٍّ ساكن. */}
      {MEDIUM_SURFACES[state.medium].motionProps && (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="mz-label">{L.animation}</div>
        <div data-testid="props-anim-presets" data-preset-blocked={presetBlocked ? 'true' : 'false'} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ANIMS.map((a) => {
            const active = el.anim.preset === a;
            return (
              <button
                key={a}
                data-testid={`props-anim-preset-${a}`}
                disabled={presetBlocked}
                title={presetBlocked ? L.preset_blocked : undefined}
                onClick={() => actions.setElementAnimPreset(el.id, a)}
                style={{ height: 30, padding: '0 12px', border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`, borderRadius: 999, fontSize: 12, fontWeight: 500, background: active ? 'var(--accentSoft)' : 'var(--surface2)', color: active ? 'var(--accentText)' : 'var(--text)', opacity: presetBlocked ? 0.4 : 1, cursor: presetBlocked ? 'not-allowed' : 'pointer' }}
              >
                {L[`anim_${a}` as const]}
              </button>
            );
          })}
        </div>
        {/* **مدّةُ الدخول بجانب النمط** (كما في a common video editor: منزلق «المدة» تحت شبكة الأنماط). */}
        {el.anim.preset !== 'none' && !presetBlocked && (() => {
          const keys = Object.values(el.anim.tracks).flatMap((t) => t ?? []);
          const cur = keys.length ? Math.max(...keys.map((k) => k.time)) - (el.anim.sourceIn ?? 0) : 0.6;
          const max = Math.max(0.2, Math.min(3, el.anim.duration));
          return (
            <label data-testid="props-anim-duration" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--muted)', minWidth: 40 }}>{state.lang === 'ar' ? 'المدة' : 'Duration'}</span>
              <input
                type="range"
                min={0.1}
                max={max}
                step={0.05}
                value={Math.min(max, Math.max(0.1, cur))}
                onChange={(e) => actions.setEntranceDuration(el.id, Number(e.currentTarget.value))}
                style={{ flex: 1 }}
              />
              <span style={{ minWidth: 38, textAlign: 'end', direction: 'ltr' }}>{cur.toFixed(2)}{state.lang === 'ar' ? 'ث' : 's'}</span>
            </label>
          );
        })()}
      </section>
      )}

      {MEDIUM_SURFACES[state.medium].motionProps && <TextStaggerSection el={el} />}
      <TextOutlineSection el={el} />
    </>
  );
}

/** Roadmap #12 — real Arabic shaping pipeline (HarfBuzz + bidi-js), scoped per
 * قياسٌ خارجيٌّ موثَّق to the text paths that need per-glyph control.
 * This is the highest-priority deliverable of that pipeline: converts the selected
 * text element into real vector glyph outlines (see `src/lib/arabicShaping.ts`),
 * which also makes it exportable as true SVG `<path>` data with no font dependency.
 * Same local-state async-busy shape as `BackgroundRemovalSection` above: the heavy
 * WASM shaping work happens here before calling the single-undo-step
 * `actions.convertTextToOutline`. "نص على مسار منحني" (text-on-path, the pipeline's
 * second deliverable) is a separate pair-selection action — see the `pathCandidate`
 * section in `PropsTab()` above and `src/lib/textOnPath.ts` — reusing this same
 * shaping pipeline's glyph outlines, just bent along a curve instead of laid flat. */
function TextOutlineSection({ el }: { el: TextElement }) {
  const { state, actions, dict: L } = useStudio();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = isBuiltinFontFamily(el.fontFamily);

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const size = sizeAt(state.sizeIdx, state.customW, state.customH);
      const dir: 'rtl' | 'ltr' = state.lang === 'ar' ? 'rtl' : 'ltr';
      const { outline, geo } = await convertTextElementToOutline(el, size, dir);
      const fill = resolveTextColor(el, PALETTES[state.postPalette]);
      actions.convertTextToOutline(el.id, outline, geo, fill);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="mz-label">{L.text_outline_title}</div>
      <button
        data-testid={`text-outline-btn-${el.id}`}
        onClick={run}
        disabled={busy || !supported}
        style={{ height: 34, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12, fontWeight: 600, opacity: busy || !supported ? 0.6 : 1 }}
      >
        {busy ? L.text_outline_converting : L.text_outline_btn}
      </button>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.6 }}>{supported ? L.text_outline_hint : L.text_outline_unsupported_font}</div>
      {error && (
        <div data-testid={`text-outline-error-${el.id}`} style={{ fontSize: 11, color: 'var(--danger)' }}>
          {L.text_outline_error}: {error}
        </div>
      )}
    </section>
  );
}

/** Roadmap #6: splits the text element's own content into char/word/line units and
 * reveals each with a sequential delay — a separate animation layer from the
 * element-level `anim.tracks` section above (toggled per-property keyframes for the
 * whole text box), composing with it rather than replacing it; see
 * `TextStaggerAnim` in `state/elements.ts` and `docs/CONTROLS.md`. Available on every
 * text element (not gated to the headline like the legacy preset chooser above). */
function TextStaggerSection({ el }: { el: TextElement }) {
  const { state, actions, dict: L } = useStudio();
  const cfg = el.textAnim;
  const instant = isInstantEffect(cfg.effect);
  // **توقيتُ كلّ وحدة**: بلا مسار «ظهور» يبقى التلقائيّ (التأخيرُ بين الوحدات)؛ ومعه
  // تظهر كلُّ وحدةٍ عند مفتاحها. والعدّادُ يقرأ القيمةَ عند المؤشّر بالدالّة نفسِها التي
  // يرسم بها الرسّامان — فما يقوله اللوحُ هو ما تراه.
  const keyed = !!el.anim.tracks.reveal?.length;
  const total = revealUnitCount(el.text, cfg.unit);
  const shownNow = keyed ? Math.min(total, Math.floor((revealValueAt(el.anim, state.t) ?? 0) + 1e-6)) : null;
  const allTimed = keyed && shownNow !== null && shownNow >= total;
  const nextLabel = cfg.unit === 'char' ? L.reveal_next_char : cfg.unit === 'word' ? L.reveal_next_word : L.reveal_next_line;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="mz-label" style={{ flex: 1 }}>{L.text_stagger}</div>
        <button
          data-testid={`stagger-toggle-${el.id}`}
          onClick={() => actions.setTextStagger(el.id, { enabled: !cfg.enabled })}
          style={{ border: 0, background: 'transparent', padding: 0 }}
        >
          <Toggle on={cfg.enabled} />
        </button>
      </div>
      {cfg.enabled && (
        <>
          <div style={{ display: 'flex', padding: 3, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2 }}>
            {STAGGER_UNITS.map((u) => {
              const s = seg(cfg.unit === u);
              return (
                <button
                  key={u}
                  data-testid={`stagger-unit-${el.id}-${u}`}
                  onClick={() => actions.setTextStagger(el.id, { unit: u })}
                  style={{ flex: 1, height: 26, border: 0, borderRadius: 'calc(var(--rs) - 2px)', fontSize: 11.5, fontWeight: 500, background: s.bg, color: s.fg, boxShadow: s.sh }}
                >
                  {L[`stagger_unit_${u}` as const]}
                </button>
              );
            })}
          </div>
          {cfg.unit === 'line' && <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5 }}>{L.stagger_line_hint}</div>}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STAGGER_EFFECTS.map((fx) => {
              const active = cfg.effect === fx;
              return (
                <button
                  key={fx}
                  data-testid={`stagger-effect-${el.id}-${fx}`}
                  onClick={() => actions.setTextStagger(el.id, { effect: fx })}
                  style={{ height: 28, padding: '0 10px', border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`, borderRadius: 999, fontSize: 11.5, fontWeight: 500, background: active ? 'var(--accentSoft)' : 'var(--surface2)', color: active ? 'var(--accentText)' : 'var(--text)' }}
                >
                  {L[`stagger_fx_${fx}` as const]}
                </button>
              );
            })}
          </div>

          {/* «الكتابة» تُظهر بادئةَ النصّ، والبادئةُ بترتيب القراءة وحده — فلا يُعرَض
              اتّجاهٌ لا أثرَ له (`effectiveDirection`)، ويُقال لماذا مكانه. */}
          {cfg.effect === 'type' ? (
            <div data-testid={`stagger-type-hint-${el.id}`} style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.6 }}>{L.stagger_type_hint}</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {STAGGER_DIRECTIONS.map((d) => {
                const active = cfg.direction === d;
                return (
                  <button
                    key={d}
                    data-testid={`stagger-dir-${el.id}-${d}`}
                    onClick={() => actions.setTextStagger(el.id, { direction: d })}
                    style={{ height: 28, padding: '0 10px', border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`, borderRadius: 999, fontSize: 11.5, fontWeight: 500, background: active ? 'var(--accentSoft)' : 'var(--surface2)', color: active ? 'var(--accentText)' : 'var(--text)' }}
                  >
                    {L[`stagger_dir_${d}` as const]}
                  </button>
                );
              })}
            </div>
          )}

          <div data-testid={`reveal-timing-${el.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8, border: '1px solid var(--line)', borderRadius: 'var(--rs)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600 }}>{L.reveal_timing}</span>
              {keyed && (
                <span data-testid={`reveal-count-${el.id}`} dir="auto" style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {L.reveal_count(shownNow ?? 0, total)}
                </span>
              )}
            </div>
            {!keyed && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--muted)', minWidth: 70 }}>{L.stagger_delay}</span>
                <input
                  dir="ltr"
                  type="range"
                  min={0}
                  max={300}
                  step={5}
                  value={Math.round(cfg.stagger * 1000)}
                  onChange={(e) => actions.setTextStagger(el.id, { stagger: Number(e.target.value) / 1000 })}
                  style={{ flex: 1, accentColor: 'var(--accent)' }}
                  data-testid={`stagger-delay-${el.id}`}
                />
                <span dir="ltr" style={{ color: 'var(--muted)', minWidth: 42, textAlign: 'end', fontSize: 11 }}>{Math.round(cfg.stagger * 1000)}ms</span>
              </label>
            )}
            {!keyed && <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.6 }}>{L.reveal_auto_hint}</div>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                data-testid={`reveal-next-${el.id}`}
                title={L.reveal_next_tip}
                disabled={el.locked || allTimed || total === 0}
                onClick={() => actions.revealNextAtPlayhead(el.id)}
                style={{ flex: 1, height: 28, border: '1px solid var(--accent)', borderRadius: 'var(--rs)', background: 'var(--accentSoft)', color: 'var(--accentText)', fontSize: 11.5, fontWeight: 600, opacity: allTimed ? 0.55 : 1 }}
              >
                {allTimed ? L.reveal_all_timed : nextLabel}
              </button>
              {keyed && (
                <button
                  data-testid={`reveal-clear-${el.id}`}
                  disabled={el.locked}
                  onClick={() => actions.clearRevealTiming(el.id)}
                  style={{ height: 28, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)', fontSize: 11 }}
                >
                  {L.reveal_clear}
                </button>
              )}
            </div>
          </div>

          {/* مدّةُ الوحدة ومنحناها لأثرٍ يجري في زمن — والأثرُ الفوريّ لا زمنَ له. */}
          {!instant && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--muted)', minWidth: 70 }}>{L.stagger_unit_duration}</span>
              <input
                dir="ltr"
                type="range"
                min={50}
                max={1000}
                step={10}
                value={Math.round(cfg.unitDuration * 1000)}
                onChange={(e) => actions.setTextStagger(el.id, { unitDuration: Number(e.target.value) / 1000 })}
                style={{ flex: 1, accentColor: 'var(--accent)' }}
                data-testid={`stagger-duration-${el.id}`}
              />
              <span dir="ltr" style={{ color: 'var(--muted)', minWidth: 42, textAlign: 'end', fontSize: 11 }}>{Math.round(cfg.unitDuration * 1000)}ms</span>
            </label>
          )}

          {!instant && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {STAGGER_EASINGS.map((id) => {
                const active = cfg.easing === id;
                return (
                  <button
                    key={id}
                    data-testid={`stagger-ease-${el.id}-${id}`}
                    onClick={() => actions.setTextStagger(el.id, { easing: id })}
                    style={{ height: 26, padding: '0 10px', border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--rs)', fontSize: 11, background: active ? 'var(--accentSoft)' : 'var(--surface2)', color: active ? 'var(--accentText)' : 'var(--text)' }}
                  >
                    {L[EASE_LABEL_KEY[id] as keyof typeof L] as string}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ShapeProps({ el }: { el: DocElement & { type: 'shape' } }) {
  const { state, actions, dict: L } = useStudio();
  const pal = PALETTES[state.postPalette];
  const swatches = Array.from(new Set([pal.ac, pal.fg, pal.bg, '#FFFFFF', ...(pal.ac2 ? [pal.ac2] : [])]));
  // لونُ صفّ «اللون»: الطبقةُ القاعديّة التي تكتب فيها `setShapeFill` إن وُجدت
  // كومة، وإلّا الحقلُ القديم. انظر التعليقَ عند الصفّ نفسِه أدناه.
  const baseFill = baseLayerColorOf(el);
  const fillHex = baseFill ? resolveLayerColor(baseFill.color, baseFill.colorToken, pal) : (el.fill ?? pal[el.fillToken]);
  // طبقةُ التعبئة القاعديّة الكاملة (لا لونها وحده كما في `baseLayerColorOf`
  // أعلاه) — نفسُ `stack.fills[0]` التي يحرّرها `AppearanceSection` في الوضع
  // الاحترافيّ، فتدرّجها هنا هو تدرّجها هناك بعينه: لا منطقَ تدرّجٍ ثانٍ، فقط
  // نافذةٌ أخرى على الكومة نفسها عبر `updateFillLayer` نفسِها. `null` لشكلٍ
  // مفتوح (خطّ/سهم) بلا طبقة تعبئة أصلًا — فلا مُنتقِي تدرّجٍ له.
  const baseFillLayer = currentAppearance(el).fills[0] ?? null;
  // الطبقةُ القاعديّة هي ما يُرسَم (انظر التعليق عند صفّ الحدّ أدناه).
  const baseStroke = currentAppearance(el).strokes[0] ?? null;
  const strokeOn = !!baseStroke && baseStroke.visible && baseStroke.width > 0;
  const strokeHex = baseStroke ? resolveLayerColor(baseStroke.color, baseStroke.colorToken, pal) : pal.fg;
  const strokeWidth = baseStroke ? baseStroke.width : el.strokeWidth;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mz-label">{L.sec_shape}</div>
      {/* **الشرائحُ تبقى، ويُضاف إليها فضاءُ اللونِ كلُّه.**
       *
       * الشرائحُ خمسٌ من اللوحة المطبَّقة، وهي الطريقُ السريع: ضغطةٌ واحدة تُعطي
       * لونًا متناغمًا مع بقيّة البوست بلا تفكير. ومُنتقِي اللونِ الحرُّ طريقٌ آخر
       * لا بديل: لونُ العلامة التجاريّة رقمٌ لا تعطيه أيُّ لوحة — قيسَ ذلك على
       * هدفٍ منشورٍ حقيقيّ، وألوانُه الأربعة لا توجد في `PALETTES` (انظر
       * `normalizeHex` في `lib/appearance.ts`). فالصفُّ طريقان لا طريقٌ واحد،
       * ولا يُنزَع سريعٌ ليُضاف بطيء.
       *
       * والحقلان كما في صفّ الحدّ أدناه بالحرف: مُدخَلُ لونٍ للاختيار بالعين،
       * وحقلُ ستّ عشريٍّ **يُكتَب** فيه — ولمَ لا يكفي الأوّل وحده مكتوبٌ عند
       * `normalizeHex`: `<input type="color">` يفتح حوارَ النظام ولا يُلصَق فيه
       * رقمٌ من دليل هويّة.
       *
       * **والمقروءُ هو ما يُرسَم.** `baseLayerColorOf` تُرجع لونَ الطبقة التي
       * تكتب فيها `setShapeFill` بعينها (عبر `withBaseLayerColor`) — فالقارئ
       * والكاتب قاعدةٌ واحدة في ملفٍّ واحد. والحقلُ القديم يبقى مرجعَ ما لا كومةَ
       * له (شكلٌ مرسومٌ بالسحب). ولولا ذلك لعرَض الحقلُ المضبوطُ لونًا والشكلُ
       * بلونٍ آخر — وهو العطلُ الذي أُصلِح للحدّ في `withBaseStroke`. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, rowGap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{L.color}</span>
        {swatches.map((hex) => (
          <button
            key={hex}
            title={hex}
            onClick={() => actions.setShapeFill(el.id, hex)}
            style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${hex.toLowerCase() === fillHex.toLowerCase() ? 'var(--accent)' : 'var(--line)'}`, background: hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)' }}
          />
        ))}
        {/* `normalizeHex` لا القيمةُ الخام، للسبب المقيس عند صفّ الحدّ أدناه:
            المتصفّح يُصغّر قيمةَ مُدخَلِ اللون دائمًا وألوانُ `PALETTES` بحرفٍ
            كبير، فالفرقُ في كل تصييرٍ يَسرق التركيز من جار الحقل. */}
        <input
          data-testid={`shape-fill-color-${el.id}`}
          type="color"
          title={L.color}
          aria-label={L.color}
          value={normalizeHex(fillHex) ?? '#000000'}
          onChange={(e) => actions.setShapeFill(el.id, e.target.value)}
          style={{ width: 24, height: 24, border: 0, borderRadius: 4, padding: 0, background: 'transparent' }}
        />
        <HexField testId={`shape-fill-hex-${el.id}`} value={fillHex} onCommit={(hex) => actions.setShapeFill(el.id, hex)} />
        {/* نفسُ مفتاح `kind` ونفس حقول التدرّج في `AppearanceSection` أدناه،
            مُعاد استدعاؤهما هنا عبر `updateFillLayer` بعينها — لا مُنتقِي تدرّجٍ
            ثانٍ ولا رياضيّات جديدة، فقط طريقٌ أقصر من الصفّ البسيط إلى كومة
            المظهر الموجودة فعلًا، بلا حاجةٍ للوضع الاحترافيّ. */}
        {baseFillLayer && (
          <select
            data-testid={`shape-fill-kind-${el.id}`}
            value={baseFillLayer.kind === 'gradient' && baseFillLayer.gradientType === 'radial' ? 'radial' : baseFillLayer.kind}
            onChange={(e) => {
              const v = e.target.value;
              actions.updateFillLayer(
                el.id,
                baseFillLayer.id,
                v === 'radial' ? { kind: 'gradient', gradientType: 'radial' } : { kind: v as AppearanceFillLayer['kind'], gradientType: 'linear' },
              );
            }}
            style={{ height: 24, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--surface)', fontSize: 11 }}
          >
            <option value="solid">{L.appearance_solid}</option>
            <option value="gradient">{L.appearance_gradient}</option>
            <option value="radial">{L.appearance_radial}</option>
          </select>
        )}
        {baseFillLayer && baseFillLayer.kind === 'gradient' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
            <input
              data-testid={`shape-fill-gradient-from-${el.id}`}
              type="color"
              value={normalizeHex(baseFillLayer.gradientFrom) ?? '#000000'}
              onChange={(e) => actions.updateFillLayer(el.id, baseFillLayer.id, { gradientFrom: e.target.value })}
              style={{ width: 22, height: 22, border: 0, padding: 0 }}
            />
            <input
              data-testid={`shape-fill-gradient-to-${el.id}`}
              type="color"
              value={normalizeHex(baseFillLayer.gradientTo) ?? '#000000'}
              onChange={(e) => actions.updateFillLayer(el.id, baseFillLayer.id, { gradientTo: e.target.value })}
              style={{ width: 22, height: 22, border: 0, padding: 0 }}
            />
            <input
              data-testid={`shape-fill-gradient-angle-${el.id}`}
              type="number"
              dir="ltr"
              value={baseFillLayer.gradientAngle}
              onChange={(e) => actions.updateFillLayer(el.id, baseFillLayer.id, { gradientAngle: Number(e.target.value) || 0 })}
              style={{ width: 52, height: 22, border: '1px solid var(--line)', borderRadius: 4, fontSize: 11, textAlign: 'center' }}
            />
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>°</span>
          </div>
        )}
      </div>
      {el.shape !== 'path' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <span style={{ color: 'var(--muted)', flex: 1 }}>{L.radius}</span>
          <input
            dir="ltr"
            type="range"
            min={0}
            max={50}
            value={Math.round(el.radius * 100)}
            disabled={el.shape === 'ellipse'}
            onChange={(e) => actions.setShapeRadius(el.id, Number(e.target.value) / 100)}
            style={{ flex: 1.4, accentColor: 'var(--accent)' }}
          />
        </label>
      )}
      {/* **صفُّ الحدّ يقرأ ما يُرسَم ويكتب فيه.**
       *
       * كان يقرأ الحقلَ القديم `el.stroke` ويكتبه وحده، ولونُه مثبَّتٌ على
       * `pal.fg` — فلا لونَ يُختار أصلًا، وعلى شكلٍ من المكتبة (أو على أيّ مستندٍ
       * أُعيد تحميله، إذ تُجسِّد `normalizeDoc` كومةً لكلّ عنصر) لا يُرسَم شيءٌ
       * بالمرّة. التفصيلُ والقياسُ في `withBaseStroke` بـ`lib/appearance.ts`.
       *
       * فالمقروءُ هنا هو `strokes[0]` من `currentAppearance` — **الطبقة التي
       * تَرسم فعلًا** — ولا كومةَ ثانيةً تُبنى: هذا الصفُّ نافذةٌ بسيطة على
       * الطبقة القاعديّة نفسِها التي يُحرّرها محرّرُ الطبقات في الوضع الاحترافيّ
       * (`AppearanceSection` أدناه، وهو محجوبٌ خلف `isPro`). ولذلك يَصدُق الصفُّ
       * الآن على خطّ المكتبة أيضًا: كومتُه حدٌّ بلا تعبئة، فكان يقول «بدون»
       * والخطُّ مرسومٌ أمام عين المصمّم.
       *
       * و«حدٌّ بسُمك صفر» ليس حدًّا: يُقرأ إطفاءً، وإلا لقال الصفُّ «نشِط» وليس
       * على الشاشة شيء.
       *
       * والحقلان: مُدخَلُ اللون للاختيار بالعين، وحقلُ الستّ عشريّ للصقِ لونِ
       * علامةٍ تجاريّة — ولمَ لا يكفي الأوّل وحده مكتوبٌ عند `normalizeHex`. وهما
       * الحقلان الأوّلان نفساهما في صفّ الطبقة الاحترافيّ، لا عنصران جديدان. */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, rowGap: 6, flexWrap: 'wrap', fontSize: 12 }}>
        <span style={{ color: 'var(--muted)', flex: 1 }}>{L.stroke}</span>
        <button
          data-testid={`shape-stroke-toggle-${el.id}`}
          onClick={() => actions.setShapeStroke(el.id, strokeOn ? null : strokeHex)}
          style={{ height: 26, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: strokeOn ? 'var(--accentSoft)' : 'var(--surface2)', fontSize: 11, color: strokeOn ? 'var(--accentText)' : 'var(--muted)' }}
        >
          {strokeOn ? L.on_state : L.off_state}
        </button>
        {strokeOn && (
          <>
            {/* `normalizeHex` لا القيمةُ الخام: مُدخَلُ اللون مضبوطٌ بالكامل
                والمتصفّح يُصغّر قيمته دائمًا، وألوانُ `PALETTES` بحرفٍ كبير —
                فالفرقُ الذي يراه React في كل تصييرٍ يَسرق التركيز من جار الحقل.
                العطلُ (ب) في `qa/appearance-hex.spec.mjs`، وقد كَلَّف أربعة بنودٍ
                في حلقة المحاكاة. */}
            <input
              data-testid={`shape-stroke-color-${el.id}`}
              type="color"
              title={L.stroke}
              aria-label={L.stroke}
              value={normalizeHex(strokeHex) ?? '#000000'}
              onChange={(e) => actions.setShapeStroke(el.id, e.target.value)}
              style={{ width: 24, height: 24, border: 0, borderRadius: 4, padding: 0, background: 'transparent' }}
            />
            <HexField testId={`shape-stroke-hex-${el.id}`} value={strokeHex} onCommit={(hex) => actions.setShapeStroke(el.id, hex)} />
            <input
              data-testid={`shape-stroke-width-${el.id}`}
              dir="ltr"
              type="number"
              min={1}
              max={40}
              value={strokeWidth}
              onChange={(e) => actions.setShapeStrokeWidth(el.id, Number(e.target.value) || 0)}
              style={{ width: 44, height: 26, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', textAlign: 'center', fontSize: 12 }}
            />
          </>
        )}
      </label>
      {el.shape === 'path' && el.points && el.points.length >= 2 && !el.subpaths?.length && <PathSmoothProps el={el} />}
    </section>
  );
}

/** Roadmap #11 — one global smoothing-amount slider for the whole path, plus a
 * per-anchor corner/smooth toggle row. See `src/lib/pathSmoothing.ts` for the math;
 * `smoothAmount` defaults to 0 so any path created before this existed (or never
 * touched since) keeps rendering as plain straight segments. */
function PathSmoothProps({ el }: { el: DocElement & { type: 'shape' } }) {
  const { state, actions, dict: L } = useStudio();
  const amount = el.smoothAmount ?? 0;
  const points = el.points ?? [];
  const editingNodes = state.nodeEditId === el.id;
  return (
    <>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
        <span style={{ color: 'var(--muted)', flex: 1 }}>{L.smooth_amount}</span>
        <input
          data-testid={`smooth-amount-${el.id}`}
          dir="ltr"
          type="range"
          min={0}
          max={100}
          value={Math.round(amount * 100)}
          // سحبة واحدة على الشريط = خطوة تراجع واحدة. `onChange` يُطلَق لكل خطوة من
          // خطوات الشريط (18 خطوة في سحبة قصيرة قياسًا حقيقيًا)، فالكتابة الحيّة بلا
          // تاريخ + لقطة واحدة في البداية هي ما يجعل الوعد في `docs/CONTROLS.md`
          // صحيحًا فعلًا. `beginElementEdit` مُتعادِية الاستدعاء (لا تأخذ لقطة ثانية
          // إن كانت واحدة معلّقة)، فنداؤها من `onChange` آمن ويغطّي تغيير الشريط
          // بالسهمَين أيضًا — وهو مسار لا يمرّ بـ`onPointerDown` إطلاقًا.
          onChange={(e) => {
            actions.beginElementEdit();
            actions.liveUpdateShapeSmoothAmount(el.id, Number(e.target.value) / 100);
          }}
          onPointerUp={() => actions.commitElementEdit()}
          onKeyUp={() => actions.commitElementEdit()}
          onBlur={() => actions.commitElementEdit()}
          style={{ flex: 1.4, accentColor: 'var(--accent)' }}
        />
        <span dir="ltr" style={{ color: 'var(--muted)', fontSize: 11, minWidth: 30, textAlign: 'end' }}>
          {Math.round(amount * 100)}%
        </span>
      </label>
      <button
        data-testid={`node-edit-${el.id}-toggle`}
        onClick={() => (editingNodes ? actions.endNodeEdit() : actions.startNodeEdit(el.id))}
        style={{
          height: 30,
          border: `1px solid ${editingNodes ? 'var(--accent)' : 'var(--line)'}`,
          borderRadius: 'var(--rs)',
          background: editingNodes ? 'var(--accentSoft)' : 'var(--surface2)',
          color: editingNodes ? 'var(--accentText)' : 'var(--text)',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {editingNodes ? L.node_edit_done : L.node_edit_start}
      </button>
      {editingNodes && <p style={{ margin: 0, fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.6 }}>{L.node_edit_hint}</p>}
      {amount > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{L.corner_points}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {points.map((_, i) => {
              const isCorner = !!el.cornerPoints?.[i];
              return (
                <button
                  key={i}
                  data-testid={`path-point-${el.id}-${i}`}
                  title={isCorner ? L.point_corner : L.point_smooth}
                  onClick={() => actions.toggleShapeCornerPoint(el.id, i)}
                  style={{
                    width: 26,
                    height: 26,
                    border: `1px solid ${isCorner ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: isCorner ? 4 : 999,
                    background: isCorner ? 'var(--accentSoft)' : 'var(--surface2)',
                    color: isCorner ? 'var(--accentText)' : 'var(--muted)',
                    fontSize: 10.5,
                    fontWeight: 600,
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p style={{ margin: 0, fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.6 }}>{L.corner_points_hint}</p>
        </div>
      )}
    </>
  );
}

function ImageProps({ el }: { el: DocElement & { type: 'image' } }) {
  const { state, actions, dict: L } = useStudio();
  const pal = PALETTES[state.postPalette];
  const cropping = state.cropEditingId === el.id;
  // صفُّ حدّ الصورة يقرأ ما يُرسَم ويكتب فيه — نفسُ عقد صفّ حدّ الشكل بالحرف.
  // التفصيلُ والقياسُ عند الصفّ نفسِه أدناه.
  const baseStroke = currentAppearance(el).strokes[0] ?? null;
  const strokeOn = !!baseStroke && baseStroke.visible && baseStroke.width > 0;
  const strokeHex = baseStroke ? resolveLayerColor(baseStroke.color, baseStroke.colorToken, pal) : pal.fg;
  const strokeWidth = baseStroke ? baseStroke.width : el.strokeWidth;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mz-label">{L.sec_image}</div>
      <button
        onClick={() => actions.replaceImage(el.id)}
        style={{ height: 34, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12, fontWeight: 600 }}
      >
        {el.src ? L.replace_image : L.choose_image}
      </button>

      {el.src && (
        <>
          <ImageTraceSection el={el} />
          <BackgroundRemovalSection el={el} />
          <UpscaleSection el={el} />

          <div style={{ display: 'flex', padding: 3, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2 }}>
            {(['cover', 'contain', 'fill'] as const).map((f) => {
              const s = seg(el.fit === f);
              return (
                <button key={f} onClick={() => actions.setImageFit(el.id, f)} style={{ flex: 1, height: 26, border: 0, borderRadius: 'calc(var(--rs) - 2px)', fontSize: 12, fontWeight: 500, background: s.bg, color: s.fg, boxShadow: s.sh }}>
                  {f === 'cover' ? L.fit_cover : f === 'contain' ? L.fit_contain : L.fit_fill}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: `1px solid ${cropping ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--rs)', background: 'var(--surface2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{L.crop_frame}</span>
              <button
                onClick={() => (cropping ? actions.endCropEdit() : actions.startCropEdit(el.id))}
                style={{ height: 26, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: cropping ? 'var(--accentSoft)' : 'var(--surface)', fontSize: 11, fontWeight: 600, color: cropping ? 'var(--accentText)' : 'var(--text)' }}
              >
                {cropping ? L.crop_done : L.crop_start}
              </button>
            </div>
            {cropping && <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{L.crop_hint}</p>}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span style={{ color: 'var(--muted)', minWidth: 44 }}>{L.zoom}</span>
              <input
                dir="ltr"
                type="range"
                min={100}
                max={400}
                value={Math.round(el.cropScale * 100)}
                onPointerDown={() => actions.beginElementEdit()}
                onChange={(e) => actions.liveUpdateImageCrop(el.id, { cropScale: Number(e.target.value) / 100 })}
                onPointerUp={() => actions.commitElementEdit()}
                style={{ flex: 1, accentColor: 'var(--accent)' }}
              />
              <span dir="ltr" style={{ color: 'var(--muted)', fontSize: 11, minWidth: 34, textAlign: 'end' }}>{Math.round(el.cropScale * 100)}%</span>
            </label>
            <button
              onClick={() => actions.resetImageCrop(el.id)}
              style={{ height: 26, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)', fontSize: 11 }}
            >
              {L.crop_reset}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => actions.setImageFlip(el.id, 'h')} style={{ flex: 1, height: 28, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: el.flipH ? 'var(--accentSoft)' : 'var(--surface2)', color: el.flipH ? 'var(--accentText)' : 'var(--text)', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon size={13} path="M10 3v14M5 6l-2 1v6l2 1M15 6l2 1v6l-2 1" />
              {L.flip_h}
            </button>
            <button onClick={() => actions.setImageFlip(el.id, 'v')} style={{ flex: 1, height: 28, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: el.flipV ? 'var(--accentSoft)' : 'var(--surface2)', color: el.flipV ? 'var(--accentText)' : 'var(--text)', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon size={13} path="M3 10h14M6 5l1-2h6l1 2M6 15l1 2h6l1-2" />
              {L.flip_v}
            </button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span style={{ color: 'var(--muted)', flex: 1 }}>{L.radius}</span>
            <input
              dir="ltr"
              type="range"
              min={0}
              max={50}
              value={Math.round(el.radius * 100)}
              onChange={(e) => actions.setImageRadius(el.id, Number(e.target.value) / 100)}
              style={{ flex: 1.4, accentColor: 'var(--accent)' }}
            />
          </label>
          {/* **حدُّ الصورة كان على المسار الميّت نفسِه الذي كان عليه حدُّ الشكل،
            * وبعطبٍ ثالثٍ فوقه: لا لونَ يُختار أصلًا.**
            *
            * وثلاثةُ أعطالٍ مقيسةٍ في سطرٍ واحد (`setImageStroke(el.id, el.stroke
            * ? null : pal.fg)`):
            *
            *   (أ) **اللونُ مثبَّتٌ في الكود** على `pal.fg`. فلا سطحَ في البرنامج
            *       كلِّه يُختار فيه لونُ حدِّ صورة — ومحرّرُ الطبقات محجوبٌ خلف
            *       `isPro` والوضعُ البسيط هو الافتراضيّ.
            *
            *   (ب) **الصورةُ تُولَد بـ`strokeWidth: 0`** (`StudioContext.tsx:1458`).
            *       فالإيقادُ يُنتج طبقةَ حدٍّ بسُمك صفر، و`legacyBorderCss`
            *       (`lib/appearance.ts:545`) تُخرِج `0px solid …` — فالمفتاح يقول
            *       «نشِط» ولا بكسلَ واحدٌ على الشاشة. وهذا يحدث **من أوّل ضغطة**،
            *       بلا إعادةِ تحميل.
            *
            *   (ج) **وبعد أوّل دورةِ حفظٍ وفتح يموت اللون أيضًا.** `setImageStroke`
            *       تكتب الحقلَ القديم `el.stroke` وحده، و`normalizeDoc` تُجسّد
            *       كومةً لكلّ عنصر عند كل فتح (`StudioContext.tsx:178`) — فالكومةُ
            *       المُجسَّدةُ تسبق الحقلَ القديم في `currentAppearance`، ومسارُ
            *       التصيير (`ElementView.tsx:342`) يقرأ `resolveAppearance` وحدها.
            *       فتغييرُ اللون بعدها لا يصل إلى ما يُرسَم.
            *
            * والعلاجُ هو عينُه الذي أُصلِح به حدُّ الشكل، **والثلاثُ مساعداتٍ
            * تُطبَّق كما هي بلا حرفٍ جديد**: `withBaseStroke` و`withBaseStrokeWidth`
            * و`withBaseStrokeHidden`. ولا نظامَ ثانيًا: هذا الصفُّ نافذةٌ على
            * `strokes[0]` نفسِها التي يُحرّرها محرّرُ الطبقات.
            *
            * و«حدٌّ بسُمك صفر» ليس حدًّا — يُقرأ إطفاءً، كما في صفّ الشكل. */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, rowGap: 6, flexWrap: 'wrap', fontSize: 12 }}>
            <span style={{ color: 'var(--muted)', flex: 1 }}>{L.stroke}</span>
            <button
              data-testid={`image-stroke-toggle-${el.id}`}
              onClick={() => actions.setImageStroke(el.id, strokeOn ? null : strokeHex)}
              style={{ height: 26, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: strokeOn ? 'var(--accentSoft)' : 'var(--surface2)', fontSize: 11, color: strokeOn ? 'var(--accentText)' : 'var(--muted)' }}
            >
              {strokeOn ? L.on_state : L.off_state}
            </button>
            {strokeOn && (
              <>
                <input
                  data-testid={`image-stroke-color-${el.id}`}
                  type="color"
                  title={L.stroke}
                  aria-label={L.stroke}
                  value={normalizeHex(strokeHex) ?? '#000000'}
                  onChange={(e) => actions.setImageStroke(el.id, e.target.value)}
                  style={{ width: 24, height: 24, border: 0, borderRadius: 4, padding: 0, background: 'transparent' }}
                />
                <HexField testId={`image-stroke-hex-${el.id}`} value={strokeHex} onCommit={(hex) => actions.setImageStroke(el.id, hex)} />
                <input
                  data-testid={`image-stroke-width-${el.id}`}
                  dir="ltr"
                  type="number"
                  min={1}
                  max={40}
                  value={strokeWidth}
                  onChange={(e) => actions.setImageStrokeWidth(el.id, Number(e.target.value) || 0)}
                  style={{ width: 44, height: 26, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', textAlign: 'center', fontSize: 12 }}
                />
              </>
            )}
          </label>
        </>
      )}
    </section>
  );
}

/** Roadmap #13: a Lottie element has no fit/crop/radius/stroke controls (unlike
 * images) — it's a playback element, not a picture, so its only content-specific
 * controls are swapping the animation and whether it loops. Transform (position/
 * size/rotation/opacity) and entrance motion are already generic across every
 * element kind (see the `isPro` section below this component's call site) and need
 * nothing extra here. */
function LottieProps({ el }: { el: DocElement & { type: 'lottie' } }) {
  const { actions, dict: L } = useStudio();
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mz-label">{L.sec_lottie}</div>
      <button
        onClick={() => actions.replaceLottie(el.id)}
        style={{ height: 34, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12, fontWeight: 600 }}
      >
        {L.replace_lottie}
      </button>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
        <span style={{ color: 'var(--muted)', flex: 1 }}>{L.lottie_loop}</span>
        <button
          onClick={() => actions.setLottieLoop(el.id, !el.loop)}
          style={{ height: 26, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: el.loop ? 'var(--accentSoft)' : 'var(--surface2)', fontSize: 11, color: el.loop ? 'var(--accentText)' : 'var(--muted)' }}
        >
          {el.loop ? L.on_state : L.off_state}
        </button>
      </label>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{L.lottie_svg_note}</p>
    </section>
  );
}

/** Roadmap #14: trim (numeric in/out within the source, seconds), volume, mute, and
 * loop — the properties a video clip needs beyond the generic transform/entrance
 * controls every element already has. `loop` is a real, fully-wired visual effect
 * (see `videoSourceTimeAt`); `volume`/`muted` are stored and will drive export audio
 * once an audio pipeline exists (none does yet, for any element kind — see
 * `video_audio_soon` below), so they're shown with an explicit "قريبًا" note rather
 * than implying they already silence/adjust something today. */
function VideoProps({ el }: { el: DocElement & { type: 'video' } }) {
  const { actions, dict: L } = useStudio();
  const duration = el.durationSec || 0;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mz-label">{L.sec_video}</div>
      <button
        data-testid={`replace-video-btn-${el.id}`}
        onClick={() => actions.replaceVideo(el.id)}
        style={{ height: 34, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12, fontWeight: 600 }}
      >
        {L.replace_video}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ color: 'var(--muted)' }}>{L.video_trim_in}</span>
        <input
          data-testid={`video-trim-in-${el.id}`}
          dir="ltr"
          type="number"
          min={0}
          max={Math.max(0, el.trimOut - 0.1)}
          step={0.1}
          value={Math.round(el.trimIn * 100) / 100}
          onChange={(e) => actions.setVideoTrim(el.id, Number(e.target.value) || 0, el.trimOut)}
          style={{ width: 56, height: 26, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', textAlign: 'center', fontSize: 12 }}
        />
        <span style={{ color: 'var(--muted)' }}>{L.video_trim_out}</span>
        <input
          data-testid={`video-trim-out-${el.id}`}
          dir="ltr"
          type="number"
          min={el.trimIn + 0.1}
          max={duration}
          step={0.1}
          value={Math.round(el.trimOut * 100) / 100}
          onChange={(e) => actions.setVideoTrim(el.id, el.trimIn, Number(e.target.value) || duration)}
          style={{ width: 56, height: 26, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', textAlign: 'center', fontSize: 12 }}
        />
        <span dir="ltr" style={{ color: 'var(--muted)', fontSize: 11 }}>
          / {duration.toFixed(1)}s
        </span>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
        <span style={{ color: 'var(--muted)', flex: 1 }}>{L.video_volume}</span>
        <input
          data-testid={`video-volume-${el.id}`}
          dir="ltr"
          type="range"
          min={0}
          max={100}
          value={Math.round(el.volume * 100)}
          onChange={(e) => actions.setVideoVolume(el.id, Number(e.target.value) / 100)}
          style={{ flex: 1.4, accentColor: 'var(--accent)' }}
        />
        <span dir="ltr" style={{ color: 'var(--muted)', fontSize: 11, minWidth: 30, textAlign: 'end' }}>
          {Math.round(el.volume * 100)}%
        </span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
        <span style={{ color: 'var(--muted)', flex: 1 }}>{L.video_muted}</span>
        <button
          data-testid={`video-mute-${el.id}`}
          onClick={() => actions.setVideoMuted(el.id, !el.muted)}
          style={{ height: 26, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: el.muted ? 'var(--accentSoft)' : 'var(--surface2)', fontSize: 11, color: el.muted ? 'var(--accentText)' : 'var(--muted)' }}
        >
          {el.muted ? L.on_state : L.off_state}
        </button>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
        <span style={{ color: 'var(--muted)', flex: 1 }}>{L.video_loop}</span>
        <button
          data-testid={`video-loop-${el.id}`}
          onClick={() => actions.setVideoLoop(el.id, !el.loop)}
          style={{ height: 26, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: el.loop ? 'var(--accentSoft)' : 'var(--surface2)', fontSize: 11, color: el.loop ? 'var(--accentText)' : 'var(--muted)' }}
        >
          {el.loop ? L.on_state : L.off_state}
        </button>
      </label>

      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{L.video_audio_soon}</p>
    </section>
  );
}

/** **تتبُّع الصورة إلى متجهات.** الفعلُ نفسه في `actions.traceImage` لا هنا، لأن له
 * أربعة أبواب: هذا الزرّ، وقائمةُ الزرّ الأيمن، ولوحةُ الأوامر، ومِزو. لذا «جارٍ»
 * والخطأ في الحالة العامّة لا في هذا المكوّن — فيراهما الزرّ أيًّا كان الباب الذي
 * بدأ منه التتبّع. والنتيجة خطوةُ تراجعٍ واحدة تُحدِّد المجموعة الناتجة. */
function ImageTraceSection({ el }: { el: DocElement & { type: 'image' } }) {
  const { state, actions, dict: L } = useStudio();
  const busy = state.traceBusyId === el.id;
  const blocked = !!state.traceBusyId;
  const error = state.traceError?.id === el.id ? state.traceError.message : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        data-testid="trace-image-btn"
        onClick={() => void actions.traceImage(el.id)}
        disabled={blocked}
        aria-busy={busy}
        style={{ height: 34, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12, fontWeight: 600, opacity: blocked ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <Icon size={14} path={ICONS.pen} />
        {busy ? L.trace_busy : L.trace_btn}
      </button>
      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{L.trace_hint}</div>
      {error && (
        <div data-testid="trace-image-error" style={{ fontSize: 11, color: 'var(--danger)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

/** Roadmap #9: runs entirely in this webview via onnxruntime-web (see
 * src/lib/backgroundRemoval.ts for why — never Rust/a sidecar, so the QA harness
 * driving the live UI at localhost:1420 can actually verify it). State machine is
 * local to this button (not StudioContext) since it's pure UI progress, never
 * persisted/undoable on its own — only the final `src` swap goes through
 * `actions.setImageBackgroundRemoved`, which *is* a real undo step. */
function BackgroundRemovalSection({ el }: { el: DocElement & { type: 'image' } }) {
  const { actions, dict: L } = useStudio();
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'processing' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!el.src) return;
    setError(null);
    try {
      const model = modelById(DEFAULT_MODEL_ID)!;
      if (!(await isModelDownloaded(model))) {
        setPhase('downloading');
        setProgress(0);
        await downloadModel(model, (loaded, total) => setProgress(total ? loaded / total : 0));
      }
      setPhase('processing');
      const bytes = await getModelBytes(model);
      const result = await removeImageBackground(el.src, model, bytes);
      actions.setImageBackgroundRemoved(el.id, result.dataUrl);
      setPhase('idle');
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  };

  const busy = phase === 'downloading' || phase === 'processing';
  const label = phase === 'downloading' ? `${L.bg_downloading} ${Math.round(progress * 100)}%` : phase === 'processing' ? L.bg_processing : L.bg_remove_btn;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        data-testid="remove-background-btn"
        onClick={run}
        disabled={busy}
        style={{ height: 34, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12, fontWeight: 600, opacity: busy ? 0.7 : 1 }}
      >
        {label}
      </button>
      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{L.bg_local_badge}</div>
      {phase === 'error' && error && (
        <div data-testid="remove-background-error" style={{ fontSize: 11, color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      {el.bgOriginalSrc && (
        <button
          data-testid="restore-background-btn"
          onClick={() => actions.restoreImageBackground(el.id)}
          style={{ height: 28, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)', fontSize: 11 }}
        >
          {L.bg_restore_btn}
        </button>
      )}
    </div>
  );
}

/** Roadmap #24-أ — same "local button-owned state machine, one undo step at the
 * end" shape as `BackgroundRemovalSection` above: downloading/running the on-device
 * super-resolution model (`src/lib/superResolution.ts`) is pure UI progress, never
 * persisted on its own; only the final `setImageUpscaled` call (new `src` +
 * `naturalW`/`naturalH`) is an undo step. Progress here is per-tile (real, not
 * simulated) since the model tiles large images internally. */
function UpscaleSection({ el }: { el: DocElement & { type: 'image' } }) {
  const { actions, dict: L } = useStudio();
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'processing' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!el.src) return;
    setError(null);
    try {
      const model = modelById('realesr-general-x4v3')!;
      if (!(await isModelDownloaded(model))) {
        setPhase('downloading');
        setProgress(0);
        await downloadModel(model, (loaded, total) => setProgress(total ? loaded / total : 0));
      }
      setPhase('processing');
      setProgress(0);
      const bytes = await getModelBytes(model);
      const result = await upscaleImage(el.src, model, bytes, (done, total) => setProgress(total ? done / total : 0));
      actions.setImageUpscaled(el.id, result.dataUrl, result.width, result.height);
      setPhase('idle');
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  };

  const busy = phase === 'downloading' || phase === 'processing';
  const label = phase === 'downloading' ? `${L.upscale_downloading} ${Math.round(progress * 100)}%` : phase === 'processing' ? `${L.upscale_processing} ${Math.round(progress * 100)}%` : L.upscale_btn;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        data-testid="upscale-btn"
        onClick={run}
        disabled={busy}
        style={{ height: 34, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12, fontWeight: 600, opacity: busy ? 0.7 : 1 }}
      >
        {label}
      </button>
      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{L.upscale_local_badge}</div>
      {phase === 'error' && error && (
        <div data-testid="upscale-error" style={{ fontSize: 11, color: 'var(--danger)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

/** Roadmap #15 — same "local button-owned state machine, one undo step at the end"
 * shape as `BackgroundRemovalSection` above: downloading the (multi-file) Whisper
 * model and running inference are pure UI progress, never persisted on their own;
 * only the final `commitElements` call that adds the real caption `TextElement`s is
 * an undo step. See `src/lib/autoCaptions.ts` for why inference still goes through
 * `onnxruntime-web` (via `@huggingface/transformers`) despite the higher-level API. */
function AutoCaptionsSection({ el }: { el: DocElement & { type: 'video' } }) {
  const { actions, dict: L } = useStudio();
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'extracting' | 'transcribing' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!el.src) return;
    setError(null);
    try {
      const model = whisperModelInfo();
      if (!(await isModelDownloaded(model))) {
        setPhase('downloading');
        setProgress(0);
        await downloadModel(model, (loaded, total) => setProgress(total ? loaded / total : 0));
      }
      setPhase('extracting');
      const samples = await extractAudioSamples(el);
      setPhase('transcribing');
      const segments = await transcribeAudio(samples);
      // الحدُّ هو طولُ نافذة الفيديو المُفرَّغ نفسه، لا سقفُ محرّرٍ لم يبقَ له سقف.
      const newEls = buildCaptionElements(segments, Math.max(0.1, el.trimOut - el.trimIn));
      if (newEls.length === 0) {
        setError(L.captions_none_found);
        setPhase('error');
        return;
      }
      actions.commitElements((els) => [...els, ...newEls]);
      actions.selectElement(newEls[0].id);
      setPhase('idle');
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  };

  const busy = phase === 'downloading' || phase === 'extracting' || phase === 'transcribing';
  const label = phase === 'downloading' ? `${L.captions_downloading} ${Math.round(progress * 100)}%` : phase === 'extracting' ? L.captions_extracting : phase === 'transcribing' ? L.captions_transcribing : L.captions_btn;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="mz-label">{L.captions_added}</div>
      <button
        data-testid="auto-captions-btn"
        onClick={run}
        disabled={busy}
        style={{ height: 34, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12, fontWeight: 600, opacity: busy ? 0.7 : 1 }}
      >
        {label}
      </button>
      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{L.captions_local_badge}</div>
      <p style={{ margin: 0, fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.6 }}>{L.captions_en_only}</p>
      {phase === 'error' && error && (
        <div data-testid="auto-captions-error" style={{ fontSize: 11, color: 'var(--danger)' }}>
          {error}
        </div>
      )}
    </section>
  );
}

/** تنظيم العناصر: تجميع · فكّ تجميع · قفل · إخفاء.
 *
 * **خارج بوّابة الوضع الاحترافي عمدًا.** «الترتيب» و«محاذاة العناصر» مُقتصران على
 * الوضع الاحترافي، والوضع البسيط هو الافتراضي — فلو وُضعت هذه الأزرار معهما لما
 * رآها أحدٌ لم يبدّل الوضع، وهو لا يعرف أصلًا أن هناك ما يُبدَّل (البند ٧ في
 * `docs/UX-AUDIT-2026-10-18.md`). والتجميع والقفل ليسا تنقيحًا متقدّمًا: هما أول ما
 * يفعله المصمّم بتصميمٍ من عدّة طبقات، وأقربُ علاجٍ لمشكلة «الخلفية تُمسَك بدل أن
 * يُرسَم فوقها».
 *
 * والاختصار مكتوبٌ في تلميح كل زرّ ليُتعلَّم من مكان استعماله — نفس دور «شريط
 * المساعدة» في أداة المتّجهات (قياسٌ خارجيٌّ موثَّق). */
function OrganiseSection() {
  const { state, actions, dict: L } = useStudio();
  // الزرّان يُعطَّلان بدل أن يُخفَيا، فيبقى وجودُ القدرة مرئيًّا حتى حين لا ينطبق
  // شرطها — وهو الفرق بين «غير متاح الآن» و«غير موجود»، والثاني هو ما شُكي منه.
  const canGroup = state.selectedIds.length >= 2;
  const canUngroup = state.selectedIds.some((id) => !!state.elements.find((e) => e.id === id)?.groupId);
  const hasSelection = state.selectedIds.length > 0;
  const anyHiddenOrLocked = state.elements.some((e) => e.locked || !e.visible);
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mz-label">{L.organise}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button data-testid="group-btn" onClick={actions.groupSelected} disabled={!canGroup} title={`${L.group_selected} ⌘G`} style={{ ...arrangeBtnStyle, opacity: canGroup ? 1 : 0.4 }}>
          <Icon size={14} path="M3 6h6v6H3zM8 8h6v6H8z" /> {L.group_selected}
        </button>
        <button data-testid="ungroup-btn" onClick={actions.ungroupSelected} disabled={!canUngroup} title={`${L.ungroup_selected} ⇧⌘G`} style={{ ...arrangeBtnStyle, opacity: canUngroup ? 1 : 0.4 }}>
          <Icon size={14} path="M3 5h5v5H3zM11 10h5v5h-5z" /> {L.ungroup_selected}
        </button>
        <button data-testid="lock-btn" onClick={actions.lockSelected} disabled={!hasSelection} title={`${L.lock_layer} ⌘2`} style={{ ...arrangeBtnStyle, opacity: hasSelection ? 1 : 0.4 }}>
          <Icon size={14} path="M5 9V6.5a5 5 0 0 1 10 0V9M4 9h12v8H4z" /> {L.lock_layer}
        </button>
        <button data-testid="hide-btn" onClick={actions.hideSelected} disabled={!hasSelection} title={`${L.hide_layer} ⌘3`} style={{ ...arrangeBtnStyle, opacity: hasSelection ? 1 : 0.4 }}>
          <Icon size={14} path="M3 3l14 14M9.5 5.2A8 8 0 0 1 18 10s-1 1.8-2.8 3.2M5 6.5C3.4 7.7 2 10 2 10s3 5 8 5c1 0 1.9-.2 2.7-.5" /> {L.hide_layer}
        </button>
      </div>
      {/* «فكّ قفل الكل» و«إظهار الكل» لا يمكن أن يكونا مشروطَين بتحديد: المقفل
          والمخفيّ غير قابلَين للنقر أصلًا، فلو اشتُرط التحديد لصار كلاهما بابًا بلا
          مفتاح. ويظهران فقط حين يكون لهما عملٌ فعليّ. */}
      {anyHiddenOrLocked && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button data-testid="unlock-all-btn" onClick={actions.unlockAll} title={`${L.unlock_all} ⌥⌘2`} style={arrangeBtnStyle}>
            <Icon size={14} path="M5 9V6.5a5 5 0 0 1 9.6-2M4 9h12v8H4z" /> {L.unlock_all}
          </button>
          <button data-testid="show-all-btn" onClick={actions.showAll} title={`${L.show_all} ⌥⌘3`} style={arrangeBtnStyle}>
            <Icon size={14} path="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5zM10 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" /> {L.show_all}
          </button>
        </div>
      )}
    </section>
  );
}

function ArrangeSection() {
  const { state, actions, dict: L } = useStudio();
  const canDistribute = state.selectedIds.length >= 3;
  return (
    <>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="mz-label">{L.arrange}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button onClick={() => actions.bringForward(state.selectedIds)} style={arrangeBtnStyle}>
            <Icon size={14} path="M10 4v10M6 10l4-4 4 4" /> {L.bring_forward}
          </button>
          <button onClick={() => actions.sendBackward(state.selectedIds)} style={arrangeBtnStyle}>
            <Icon size={14} path="M10 16V6M6 10l4 4 4-4" /> {L.send_backward}
          </button>
        </div>
      </section>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="mz-label">{L.align_elements}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 4 }}>
          {OBJECT_ALIGN.map(({ d, edge }) => (
            <button key={edge} onClick={() => actions.alignSelected(edge)} style={{ height: 30, display: 'grid', placeItems: 'center', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', color: 'var(--muted)' }}>
              <Icon size={16} path={d} />
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button disabled={!canDistribute} onClick={() => actions.distributeSelected('x')} style={{ ...arrangeBtnStyle, opacity: canDistribute ? 1 : 0.4 }}>
            {L.distribute_h}
          </button>
          <button disabled={!canDistribute} onClick={() => actions.distributeSelected('y')} style={{ ...arrangeBtnStyle, opacity: canDistribute ? 1 : 0.4 }}>
            {L.distribute_v}
          </button>
        </div>
      </section>
    </>
  );
}

const arrangeBtnStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 30, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 11.5, color: 'var(--text)' } as const;

const layerRowStyle = { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)' } as const;
const iconBtnStyle = { display: 'grid', placeItems: 'center', width: 22, height: 22, border: 0, borderRadius: 4, background: 'transparent', color: 'var(--muted)', flexShrink: 0 } as const;

/** حقلٌ رقميّ يَقبل الإشارة السالبة — ومسوّدةٌ محليّة لنفس سبب `HexField`.
 *
 * العطل الذي أوجده: الحقول الرقميّة كانت مضبوطةً بالكامل
 * (`value={Math.round(raw)}`) وتُلزِم عند كل ضغطة بـ`Number(e.target.value) || 0`.
 * و`<input type="number">` لا يُرجع من `.value` إلا رقمًا صالحًا، فالمحتوى «‑»
 * وحده يُقرأ `""`، فيُلزَم صفرًا، فتُعيد React كتابة العقدة بـ«0» — فتُمحى
 * الإشارة ويبقى صفرٌ تتراكم عليه الأرقام التالية. فكتابةُ «‑30» تُنتج «030» أي
 * ‎+٣٠: الإشارة تُبتلع والمقدار يبقى، وهو ما يَبدو **قلبًا** للاتجاه وليس قلبًا.
 *
 * قيسَ هذا على الهدف المنشور الحقيقيّ: الشريط النعناعي يحتاج ‎‑٢٫٣°‏ فصار ‎+٢٫٣°‏،
 * فمال إلى الجهة المعاكسة بنفس المقدار. وأُثبت أن النموذج والرسم بريئان: أسهمُ
 * الحقل نفسها تَصِل إلى ‎‑٣°‏ وتُرسَم ‎‑٣°‏ على اللوحة وفي الملفّ المُصدَّر معًا.
 *
 * فالعلاج هو علاج `HexField` نفسه: تُحفظ مسوّدةُ المصمّم كما كتبها، ولا يُلزَم
 * إلا ما يُقرأ رقمًا — فالحالات الوسيطة («‑»، «‑.»، الفراغ) لا تُكتب إلى المستند
 * ولا تُمحى من الحقل. وتُطرح المسوّدة عند الخروج فيعود الحقل يعرض القيمة
 * الفعليّة. والاتجاه نفسه لم يُمَسّ: موجبٌ = مع عقارب الساعة، كـCSS وSVG. */
/** **نقطةُ الارتكاز** (`ElementBase.pivot`): شبكةُ تسعٍ للمواضع الشائعة — الأركانُ ومنتصفاتُ
 * الأضلاع والمركز — ورقمان للدقّة بنسبةٍ مئويّةٍ من صندوق العنصر. الشبكةُ مكانيّةٌ لا
 * منطقيّة (`dir="ltr"`): خانتُها اليسرى يسارُ العنصر في أيّ لغةٍ كانت الواجهة. */
function PivotRow({ el }: { el: DocElement }) {
  const { actions, dict: L } = useStudio();
  const p = pivotOf(el);
  const stops = [0, 0.5, 1];
  const custom = Math.abs(p.x - 0.5) > 1e-9 || Math.abs(p.y - 0.5) > 1e-9;
  return (
    <div data-testid="pivot-row" title={L.pivot_hint} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div dir="ltr" data-testid="pivot-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 16px)', gridTemplateRows: 'repeat(3, 16px)', gap: 1, padding: 3, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)' }}>
        {stops.map((y, row) =>
          stops.map((x, col) => {
            const on = Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9;
            return (
              <button
                key={`${col}-${row}`}
                data-testid={`pivot-cell-${col}-${row}`}
                aria-pressed={on}
                onClick={() => actions.setElementPivot(el.id, { x, y })}
                style={{ width: 16, height: 16, padding: 0, border: 0, borderRadius: 4, background: on ? 'var(--accentSoft)' : 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                <span style={{ width: on ? 7 : 4, height: on ? 7 : 4, borderRadius: 4, background: on ? 'var(--accent)' : 'var(--muted)' }} />
              </button>
            );
          }),
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1, fontSize: 11, color: 'var(--muted)' }}>{L.pivot_label}</span>
          {custom && (
            <button data-testid="pivot-reset" onClick={() => actions.setElementPivot(el.id, null)} style={{ height: 18, padding: '0 6px', border: '1px solid var(--line)', borderRadius: 999, background: 'transparent', color: 'var(--muted)', fontSize: 10 }}>
              {L.pivot_reset}
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {(['x', 'y'] as const).map((axis) => (
            <label key={axis} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 4px 0 6px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 11 }}>
              <span dir="ltr" style={{ color: 'var(--muted)', fontSize: 10.5 }}>{axis.toUpperCase()}</span>
              <NumField
                testId={`pivot-${axis}`}
                decimals={1}
                value={p[axis] * 100}
                onCommit={(v) => actions.setElementPivot(el.id, { ...p, [axis]: v / 100 })}
                style={{ flex: 1, minWidth: 0, width: '100%', border: 0, background: 'transparent', outline: 0, fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}
              />
              <span style={{ color: 'var(--muted)', fontSize: 10.5 }}>%</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function NumField({
  value,
  onCommit,
  disabled,
  style,
  testId,
  decimals,
  deferCommit,
}: {
  value: number;
  onCommit: (v: number) => void;
  /** يُلتزَم عند Enter أو الخروج من الحقل لا عند كل ضغطة — لِما تتراكم فيه القيمُ الوسيطة
   * (تحجيمُ مجموعةٍ يضرب مقاسَ خطّها في كلّ «١» ثم «١٨» ثم «١٨٠»). */
  deferCommit?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  testId?: string;
  /** منازلُ عشريّةٌ تُعرض (الغيابُ = عددٌ صحيح كما كان) — لنقطة الارتكاز بنسبةٍ مئويّة. */
  decimals?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = decimals ? String(Number(value.toFixed(decimals))) : String(Math.round(value));
  return (
    // **نصٌّ رقميّ لا `type="number"`** (٣٠ أكتوبر): حقلُ الرقم الأصليّ في WebKit لا يقبل «تحديد الكلّ»
    // ولا يُعرّف نفسَه حقلَ كتابة، فكان لصقُ قيمةٍ أو استبدالُها يذهب أحيانًا إلى اللوحة ويُطلق
    // اختصاراتِ الأدوات. والأسهمُ تعمل كما في أدوات التصميم: ↑/↓ بواحد، ومع Shift بعشرة.
    <input
      data-testid={testId}
      dir="ltr"
      type="text"
      inputMode="decimal"
      spellCheck={false}
      disabled={disabled}
      value={draft ?? shown}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && deferCommit) {
          (e.target as HTMLInputElement).blur();
          return;
        }
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const base = Number(draft ?? shown);
        if (!Number.isFinite(base)) return;
        const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
        const next = decimals ? Number((base + step).toFixed(decimals)) : base + step;
        setDraft(String(next));
        onCommit(next);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        // الفراغ ليس رقمًا: هو «‑» أو «2.» أو حقلٌ أُفرغ — حالةٌ وسيطة لا تُلزِم.
        if (raw.trim() === '' || deferCommit) return;
        const v = Number(raw);
        if (Number.isFinite(v)) onCommit(v);
      }}
      onBlur={() => {
        if (deferCommit && draft !== null && draft.trim() !== '') {
          const v = Number(draft);
          if (Number.isFinite(v) && v !== value) onCommit(v);
        }
        setDraft(null);
      }}
      style={style}
    />
  );
}

/** حقلُ الستّ عشريّ النصّيّ المرافق لكل شريحة لونٍ في كومة المظهر.
 *
 * `<input type="color">` وحده يفتح حوار النظام ولا يُكتب فيه شيء، فكان لونُ
 * العلامة التجاريّة — وهو رقمٌ يُنسخ من دليل الهويّة — بلا مدخلٍ في لوح
 * الخصائص كلّه. أثبتت ذلك حلقة المحاكاة على الهدف المنشور الحقيقيّ: أربعةُ ألوانٍ
 * لا تعطيها أيُّ لوحةٍ جاهزة ولا تصل إليها أيُّ شريحة.
 *
 * ومسوّدةٌ محليّة لا قيمةٌ مشتقّة: المصمّم يكتب «#1» ثم «#12» ثم «#123» …
 * وكلّها حالاتٌ غير مكتملة، فلو كُتبت إلى المستند عند كل ضغطةٍ لقفز اللون
 * وامتلأ تاريخ التراجع بخطواتٍ لا معنى لها. فلا يُلتزَم إلا بما اكتمل
 * (`normalizeHex`)، وتُطرح المسوّدة عند الخروج من الحقل فيعود يعرض لون الطبقة
 * الفعليّ. */
function HexField({ testId, value, onCommit }: { testId: string; value: string; onCommit: (hex: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      data-testid={testId}
      dir="ltr"
      type="text"
      spellCheck={false}
      maxLength={7}
      value={draft ?? value}
      onChange={(e) => {
        setDraft(e.target.value);
        const hex = normalizeHex(e.target.value);
        if (hex) onCommit(hex);
      }}
      onBlur={() => setDraft(null)}
      style={{ width: 74, height: 24, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--surface)', fontSize: 11, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
    />
  );
}

/** Small shared row chrome every fill/stroke/shadow layer row uses: visibility eye,
 * drag-free up/down reorder, duplicate, delete — the same four operations regardless
 * of category, each a single `commitElements` call (one undo step) via the action
 * passed in by the caller. */
function LayerRowChrome({ visible, onToggleVisible, onUp, onDown, onDuplicate, onRemove, testId }: { visible: boolean; onToggleVisible: () => void; onUp: () => void; onDown: () => void; onDuplicate: () => void; onRemove: () => void; testId: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <button data-testid={`${testId}-visible`} onClick={onToggleVisible} style={iconBtnStyle} title="إخفاء/إظهار">
        <Icon size={14} path={visible ? 'M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z M10 8a2 2 0 100 4 2 2 0 000-4z' : 'M3 3l14 14M9.5 5.2A8.6 8.6 0 0110 5c5 0 8 5 8 5a13 13 0 01-2.3 2.6M6.2 6.2C3.6 7.9 2 10 2 10s3 5 8 5a7.8 7.8 0 003.5-.8'} />
      </button>
      <button data-testid={`${testId}-up`} onClick={onUp} style={iconBtnStyle} title="أعلى">
        <Icon size={14} path="M5 12l5-5 5 5" />
      </button>
      <button data-testid={`${testId}-down`} onClick={onDown} style={iconBtnStyle} title="أسفل">
        <Icon size={14} path="M5 8l5 5 5-5" />
      </button>
      <button data-testid={`${testId}-duplicate`} onClick={onDuplicate} style={iconBtnStyle} title="تكرار">
        <Icon size={14} path="M5 5h9v9H5zM8 2h9v9" />
      </button>
      <button data-testid={`${testId}-remove`} onClick={onRemove} style={{ ...iconBtnStyle, color: 'var(--danger)' }} title="حذف">
        <Icon size={14} path="M4 5h12M8 5V3h4v2M6 5l1 12h6l1-12" />
      </button>
    </div>
  );
}

/** Roadmap #17 — "كومة المظهر": the layer-editor UI for an element's fill/stroke/
 * shadow stack. Reads the *raw* stack via `currentAppearance` (not the resolved/
 * painted values `resolveAppearance` returns — editing needs the original
 * `colorToken`/gradient fields, not the final painted color), one category block
 * per kind, each independently add/remove/duplicate/reorder/toggle-able with its
 * own inline property editor. Every `actions.*Layer` call below already lazily
 * materializes a real stack from legacy fields on first touch (see
 * `StudioContext.tsx`), so this works identically on an element that's never been
 * touched by this editor before. */
/** صفُّ «تدرّج السُّمك» تحت طبقة الحدّ — ولا يظهر إلا لشكل مسار، لأن المَلمح
 * يحتاج خطًّا مركزيًّا يُزاح لا محيطًا مغلقًا.
 *
 * والسطحُ قائمةٌ جاهزة + حقلَي نسبة، لا محرّرَ منحنى. وهذا اختيارٌ مقروءٌ من
 * an open-source vector engine لا تقصيرًا: هو يشحن سبعةَ ملامح جاهزةٍ وقائمةً منسدلة، ولم يبنِ
 * محرّر منحنى قطّ — أدواتُ العرض على اللوحة تكفي ما تعجز عنه القائمة
 * (قياسٌ خارجيٌّ موثَّق). والقائمة تُفهَم من أول نظرة، والمنحنى
 * لا يُفهَم.
 *
 * والحقلان **نسبةٌ مئويّة** من `width` لا بكسلات: فتبقى قيمةٌ واحدة (`width`)
 * هي سُمك الخطّ، ويبقى المَلمح شكلًا بلا بُعد يصحّ تحت أيّ مقاس. */
function StrokeTaperRow({ elId, s }: { elId: string; s: AppearanceStrokeLayer }) {
  const { actions, dict: L } = useStudio();
  const testId = `appearance-stroke-${elId}-${s.id}`;
  const p = s.widthProfile ?? null;
  const presetId = !p ? 'none' : (Object.keys(WIDTH_PROFILE_PRESETS).find((k) => {
    const q = WIDTH_PROFILE_PRESETS[k];
    return q.start === p.start && q.mid === p.mid && q.end === p.end;
  }) ?? 'custom');

  const pct = (v: number) => Math.round(v * 100);
  const patchProfile = (next: Partial<StrokeWidthProfile>) =>
    actions.updateStrokeLayer(elId, s.id, { widthProfile: { ...(p ?? WIDTH_PROFILE_PRESETS.taperEnd), ...next } });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingInlineStart: 30 }}>
      <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{L.stroke_taper}</span>
      <select
        data-testid={`${testId}-taper`}
        value={presetId}
        onChange={(e) =>
          actions.updateStrokeLayer(elId, s.id, {
            // «منتظم» يُزيل المَلمح لا يضبطه إلى ١/١: الغيابُ هو ما يُعيد مسارَ
            // الحدِّ المرسوم بالحرف — وهو أسرعُ وأدقُّ تطابقًا مع ما يفهمه SVG
            // أصلًا، ونفسُ تمييز an open-source vector engine بين `None` ومَلمحٍ منتظم.
            widthProfile: e.target.value === 'none' ? null : (WIDTH_PROFILE_PRESETS[e.target.value] ?? null),
          })
        }
        style={{ height: 22, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--surface)', fontSize: 10.5 }}
      >
        <option value="none">{L.stroke_taper_none}</option>
        <option value="taperEnd">{L.stroke_taper_end}</option>
        <option value="taperStart">{L.stroke_taper_start}</option>
        <option value="lens">{L.stroke_taper_lens}</option>
        <option value="pinch">{L.stroke_taper_pinch}</option>
        {presetId === 'custom' && <option value="custom">{L.stroke_taper_custom}</option>}
      </select>
      {p && (
        <>
          <input
            data-testid={`${testId}-taper-start`}
            type="number"
            dir="ltr"
            min={0}
            max={200}
            value={pct(p.start)}
            onChange={(e) => patchProfile({ start: Math.max(0, Number(e.target.value) || 0) / 100 })}
            style={{ width: 38, height: 22, border: '1px solid var(--line)', borderRadius: 4, fontSize: 10.5, textAlign: 'center' }}
          />
          {/* النقطة الوسطى اختياريّة: حقلٌ فارغٌ = تدرّجٌ خطّيٌّ من طرفٍ إلى
              طرف، ورقمٌ فيه = نقطةُ تحكّمٍ ثالثة عند منتصف طول القوس. وهي
              **مثبَّتةٌ عند t=٠٫٥** لا حرّةَ الموضع، وهذا حدٌّ مقصود: منحنًى
              انعطافُه عند ثلث طوله لا يُوصف بها (انظر تقرير الجولة). */}
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>←</span>
          <input
            data-testid={`${testId}-taper-mid`}
            type="number"
            dir="ltr"
            min={0}
            max={200}
            placeholder="—"
            value={p.mid == null ? '' : pct(p.mid)}
            onChange={(e) => patchProfile({ mid: e.target.value.trim() === '' ? null : Math.max(0, Number(e.target.value) || 0) / 100 })}
            style={{ width: 38, height: 22, border: '1px solid var(--line)', borderRadius: 4, fontSize: 10.5, textAlign: 'center' }}
          />
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>←</span>
          <input
            data-testid={`${testId}-taper-end`}
            type="number"
            dir="ltr"
            min={0}
            max={200}
            value={pct(p.end)}
            onChange={(e) => patchProfile({ end: Math.max(0, Number(e.target.value) || 0) / 100 })}
            style={{ width: 38, height: 22, border: '1px solid var(--line)', borderRadius: 4, fontSize: 10.5, textAlign: 'center' }}
          />
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>%</span>
        </>
      )}
    </div>
  );
}

/** قسمُ التأثيرات — **سطحٌ حيٌّ، وهو ما كان ميتًا**.
 *
 * كان القسمُ كلُّه `pointerEvents:'none'` و`aria-disabled` و`title="قريبًا"`، وفيه
 * صفّان: «ظلّ» و«ضبابية». وقد رُفِعا كلاهما لسببَين مختلفَين، لا لسببٍ واحد:
 *
 * - **صفُّ «ضبابية» صار يعمل**، وهو هذا الشريط. فلا «قريبًا» على قدرةٍ قائمة.
 * - **وصفُّ «ظلّ» رُفِع رفعًا** لأنه كان «قريبًا» **فوق سطحٍ يعمل فعلًا**: الظلالُ
 *   مبنيّةٌ ومشحونةٌ في قسم المظهر أعلاه (`AppearanceSection` ← طبقاتُ الظلّ،
 *   بإزاحةٍ ونصفِ قطرٍ وانتشارٍ ولونٍ وداخليٍّ/خارجيّ)، وكان هذا الصفُّ المعطَّلُ
 *   يُوهم أنها غيرُ موجودة. وذلك ما يَمنعه الميثاق نصًّا: «قريبًا» دواءٌ للصمت لا
 *   بديلٌ لسطحٍ قائم، لا يُغطّى بها ما يعمل فعلًا.
 *
 * وزرُّ «+ إضافة تأثير» رُفِع معهما: كان زرًّا معطَّلًا لا يُضيف شيئًا، وقائمةُ
 * التأثيرات هنا واحدةٌ مُعلَنةٌ لا كومةٌ يُضاف إليها. */
function EffectsSection({ el }: { el: DocElement }) {
  const { actions, dict: L } = useStudio();
  // المعروضُ نسبةٌ مئويّةٌ من عرض اللوح، والمخزونُ كسرٌ — فالشريطُ ٠..١٠٪.
  const pct = Math.round((el.blur ?? 0) * 1000) / 10;
  return (
    <section data-testid="fx-section" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="mz-label">{L.effects}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12 }}>
        <span style={{ minWidth: 48 }}>{L.fx_blur}</span>
        <input
          data-testid={`fx-blur-${el.id}`}
          dir="ltr"
          type="range"
          min={0}
          max={100}
          value={Math.round(pct * 10)}
          // سحبةٌ واحدةٌ = خطوةُ تراجعٍ واحدة، بنمط `smooth-amount` نفسِه:
          // `beginElementEdit` مُتعادِيةُ الاستدعاء فنداؤها من `onChange` آمنٌ
          // ويُغطّي تغييرَ الشريط بالسهمَين أيضًا — وهو مسارٌ لا يمرّ
          // بـ`onPointerDown` إطلاقًا.
          onChange={(e) => {
            actions.beginElementEdit();
            actions.liveUpdateElementBlur(el.id, Number(e.target.value) / 1000);
          }}
          onPointerUp={() => actions.commitElementEdit()}
          onKeyUp={() => actions.commitElementEdit()}
          onBlur={() => actions.commitElementEdit()}
          style={{ flex: 1, accentColor: 'var(--accent)' }}
        />
        <span data-testid={`fx-blur-value-${el.id}`} dir="ltr" style={{ fontSize: 11, color: 'var(--muted)', minWidth: 38, textAlign: 'end' }}>
          {pct}%
        </span>
      </div>
    </section>
  );
}

function AppearanceSection({ el }: { el: DocElement }) {
  const { state, actions, dict: L } = useStudio();
  const pal = PALETTES[state.postPalette];
  const stack = currentAppearance(el);
  const isPathShape = el.type === 'shape' && el.shape === 'path';

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="mz-label">{L.sec_appearance}</div>

      {/* ---- Fills ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: 11.5, color: 'var(--muted)' }}>{L.appearance_fills}</span>
          <button data-testid={`appearance-add-fill-${el.id}`} onClick={() => actions.addFillLayer(el.id)} style={{ height: 22, padding: '0 8px', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--accentText)', fontSize: 11, fontWeight: 600 }}>
            {L.appearance_add}
          </button>
        </div>
        {stack.fills.length === 0 && <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>{L.appearance_empty}</p>}
        {stack.fills.map((f) => {
          const swatch = resolveLayerColor(f.color, f.colorToken, pal);
          const testId = `appearance-fill-${el.id}-${f.id}`;
          return (
            <div key={f.id} data-testid={testId} style={{ ...layerRowStyle, flexWrap: 'wrap' }}>
              {/* `normalizeHex` لا الاختبار الخام: `<input type="color">` مضبوطٌ
                  بالكامل، والمتصفّح **يُصغّر** قيمته دائمًا. وألوان `PALETTES`
                  مكتوبةٌ بحرفٍ كبير (`#FFFFFF`)، فطبقةٌ تتبع رمز لوحةٍ كانت تُمرَّر
                  إلى الحقل كبيرةً بينما يقرؤها الـDOM صغيرة — فيرى React في كل
                  تصييرٍ فرقًا ويعيد كتابة القيمة، فلا يستقرّ الحقل أبدًا.
                  والأثر لم يكن تجميليًّا: الحقل يسرق التركيز من جاره عند أوّل
                  ضغطة مفتاح، فتذهب الحروف إلى النافذة وتصير اختصارات أدوات.
                  ظهر هذا في حلقة المحاكاة — لون نصٍّ يتبع `fg` لا يُضبط أصلًا،
                  بينما شكلٌ بلونٍ صريحٍ صغير يُضبط — ولم يكشفه أيُّ اختبارٍ قائم
                  لأن `appearance-stack.spec.mjs` يَعُدّ الصفوف ولا يضبط لونًا. */}
              <input
                type="color"
                data-testid={`${testId}-color`}
                value={normalizeHex(swatch) ?? '#000000'}
                onChange={(e) => actions.updateFillLayer(el.id, f.id, { color: e.target.value, colorToken: null })}
                style={{ width: 24, height: 24, border: 0, borderRadius: 4, padding: 0, background: 'transparent' }}
              />
              <HexField testId={`${testId}-hex`} value={swatch} onCommit={(hex) => actions.updateFillLayer(el.id, f.id, { color: hex, colorToken: null })} />
              <select
                data-testid={`${testId}-kind`}
                value={f.kind}
                onChange={(e) => actions.updateFillLayer(el.id, f.id, { kind: e.target.value as AppearanceFillLayer['kind'] })}
                style={{ height: 24, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--surface)', fontSize: 11 }}
              >
                <option value="solid">{L.appearance_solid}</option>
                <option value="gradient">{L.appearance_gradient}</option>
              </select>
              <select
                data-testid={`${testId}-blend`}
                value={f.blend}
                onChange={(e) => actions.updateFillLayer(el.id, f.id, { blend: e.target.value as AppearanceBlend })}
                style={{ height: 24, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--surface)', fontSize: 11 }}
              >
                {/* الأسماء من القاموس لا المعرّفات: كانت الواجهة العربيّة تعرض «normal»
                    و«multiply» بالإنجليزيّة (جولة الاستخدام). */}
                {(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'] as AppearanceBlend[]).map((b) => (
                  <option key={b} value={b}>{L[`blend_${b}` as const]}</option>
                ))}
              </select>
              <input
                data-testid={`${testId}-opacity`}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={f.opacity}
                onChange={(e) => actions.updateFillLayer(el.id, f.id, { opacity: Number(e.target.value) })}
                style={{ flex: 1, minWidth: 40, accentColor: 'var(--accent)' }}
              />
              <LayerRowChrome
                testId={testId}
                visible={f.visible}
                onToggleVisible={() => actions.updateFillLayer(el.id, f.id, { visible: !f.visible })}
                onUp={() => actions.moveFillLayer(el.id, f.id, 'up')}
                onDown={() => actions.moveFillLayer(el.id, f.id, 'down')}
                onDuplicate={() => actions.duplicateFillLayer(el.id, f.id)}
                onRemove={() => actions.removeFillLayer(el.id, f.id)}
              />
              {f.kind === 'gradient' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                  <input type="color" value={f.gradientFrom} onChange={(e) => actions.updateFillLayer(el.id, f.id, { gradientFrom: e.target.value })} style={{ width: 22, height: 22, border: 0, padding: 0 }} />
                  <input type="color" value={f.gradientTo} onChange={(e) => actions.updateFillLayer(el.id, f.id, { gradientTo: e.target.value })} style={{ width: 22, height: 22, border: 0, padding: 0 }} />
                  <input
                    type="number"
                    dir="ltr"
                    value={f.gradientAngle}
                    onChange={(e) => actions.updateFillLayer(el.id, f.id, { gradientAngle: Number(e.target.value) || 0 })}
                    style={{ width: 52, height: 22, border: '1px solid var(--line)', borderRadius: 4, fontSize: 11, textAlign: 'center' }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>°</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- Strokes ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: 11.5, color: 'var(--muted)' }}>{L.appearance_strokes}</span>
          <button data-testid={`appearance-add-stroke-${el.id}`} onClick={() => actions.addStrokeLayer(el.id)} style={{ height: 22, padding: '0 8px', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--accentText)', fontSize: 11, fontWeight: 600 }}>
            {L.appearance_add}
          </button>
        </div>
        {stack.strokes.length === 0 && <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>{L.appearance_empty}</p>}
        {stack.strokes.map((s) => {
          const swatch = resolveLayerColor(s.color, s.colorToken, pal);
          const testId = `appearance-stroke-${el.id}-${s.id}`;
          return (
            <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div data-testid={testId} style={layerRowStyle}>
              <input
                type="color"
                data-testid={`${testId}-color`}
                value={normalizeHex(swatch) ?? '#000000'}
                onChange={(e) => actions.updateStrokeLayer(el.id, s.id, { color: e.target.value, colorToken: null })}
                style={{ width: 24, height: 24, border: 0, borderRadius: 4, padding: 0, background: 'transparent' }}
              />
              <HexField testId={`${testId}-hex`} value={swatch} onCommit={(hex) => actions.updateStrokeLayer(el.id, s.id, { color: hex, colorToken: null })} />
              <input
                data-testid={`${testId}-width`}
                type="number"
                dir="ltr"
                min={0}
                value={s.width}
                onChange={(e) => actions.updateStrokeLayer(el.id, s.id, { width: Number(e.target.value) || 0 })}
                style={{ width: 44, height: 24, border: '1px solid var(--line)', borderRadius: 4, fontSize: 11, textAlign: 'center' }}
              />
              <select
                data-testid={`${testId}-position`}
                value={s.position}
                onChange={(e) => actions.updateStrokeLayer(el.id, s.id, { position: e.target.value as StrokePosition })}
                style={{ height: 24, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--surface)', fontSize: 11 }}
              >
                <option value="inside">{L.stroke_pos_inside}</option>
                <option value="center">{L.stroke_pos_center}</option>
                <option value="outside">{L.stroke_pos_outside}</option>
              </select>
              <input
                data-testid={`${testId}-opacity`}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={s.opacity}
                onChange={(e) => actions.updateStrokeLayer(el.id, s.id, { opacity: Number(e.target.value) })}
                style={{ flex: 1, minWidth: 40, accentColor: 'var(--accent)' }}
              />
              <LayerRowChrome
                testId={testId}
                visible={s.visible}
                onToggleVisible={() => actions.updateStrokeLayer(el.id, s.id, { visible: !s.visible })}
                onUp={() => actions.moveStrokeLayer(el.id, s.id, 'up')}
                onDown={() => actions.moveStrokeLayer(el.id, s.id, 'down')}
                onDuplicate={() => actions.duplicateStrokeLayer(el.id, s.id)}
                onRemove={() => actions.removeStrokeLayer(el.id, s.id)}
              />
            </div>
            {isPathShape && <StrokeTaperRow elId={el.id} s={s} />}
            </div>
          );
        })}
      </div>

      {/* ---- Shadows ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: 11.5, color: 'var(--muted)' }}>{L.appearance_shadows}</span>
          <button data-testid={`appearance-add-shadow-${el.id}`} onClick={() => actions.addShadowLayer(el.id)} style={{ height: 22, padding: '0 8px', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--accentText)', fontSize: 11, fontWeight: 600 }}>
            {L.appearance_add}
          </button>
        </div>
        {stack.shadows.length === 0 && <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>{L.appearance_empty}</p>}
        {stack.shadows.map((sh) => {
          const testId = `appearance-shadow-${el.id}-${sh.id}`;
          return (
            <div key={sh.id} data-testid={testId} style={{ ...layerRowStyle, flexWrap: 'wrap' }}>
              <input
                type="color"
                data-testid={`${testId}-color`}
                value={normalizeHex(sh.color) ?? '#000000'}
                onChange={(e) => actions.updateShadowLayer(el.id, sh.id, { color: e.target.value })}
                style={{ width: 24, height: 24, border: 0, borderRadius: 4, padding: 0, background: 'transparent' }}
              />
              <HexField testId={`${testId}-hex`} value={sh.color} onCommit={(hex) => actions.updateShadowLayer(el.id, sh.id, { color: hex })} />
              <select
                data-testid={`${testId}-kind`}
                value={sh.kind}
                disabled={el.type === 'text'}
                onChange={(e) => actions.updateShadowLayer(el.id, sh.id, { kind: e.target.value as AppearanceShadowLayer['kind'] })}
                style={{ height: 24, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--surface)', fontSize: 11 }}
              >
                <option value="outer">{L.shadow_kind_outer}</option>
                <option value="inner">{L.shadow_kind_inner}</option>
              </select>
              {([['offsetX', 'X'], ['offsetY', 'Y'], ['blur', 'Blur'], ['spread', 'Spread']] as const).map(([key, label]) => (
                <label key={key} dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--muted)' }}>
                  {label}
                  {/* الإزاحةُ السالبة هنا ليست حالةً نادرة بل نصفُ الاستعمال: ظلٌّ
                      من اليمين إزاحتُه ‎‑X‏، ومن أعلى ‎‑Y‏. وكانت تُبتلع الإشارة
                      كحقول التحويل تمامًا — انظر `NumField`. */}
                  <NumField
                    value={sh[key]}
                    onCommit={(v) => actions.updateShadowLayer(el.id, sh.id, { [key]: v })}
                    style={{ width: 40, height: 22, border: '1px solid var(--line)', borderRadius: 4, fontSize: 11, textAlign: 'center' }}
                  />
                </label>
              ))}
              <input
                data-testid={`${testId}-opacity`}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sh.opacity}
                onChange={(e) => actions.updateShadowLayer(el.id, sh.id, { opacity: Number(e.target.value) })}
                style={{ flex: 1, minWidth: 40, accentColor: 'var(--accent)' }}
              />
              <LayerRowChrome
                testId={testId}
                visible={sh.visible}
                onToggleVisible={() => actions.updateShadowLayer(el.id, sh.id, { visible: !sh.visible })}
                onUp={() => actions.moveShadowLayer(el.id, sh.id, 'up')}
                onDown={() => actions.moveShadowLayer(el.id, sh.id, 'down')}
                onDuplicate={() => actions.duplicateShadowLayer(el.id, sh.id)}
                onRemove={() => actions.removeShadowLayer(el.id, sh.id)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PenProps() {
  const { state, actions, dict: L } = useStudio();
  const anchors = state.penDraft.length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="mz-label">{L.path}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 32, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 12 }}>
          <span>{L.anchors}</span>
          <span dir="ltr" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>{anchors}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 32, padding: '0 10px', fontSize: 12 }}>
          <span>{L.close_path}</span>
          <button data-testid="pen-close-path-toggle" onClick={() => actions.setPenClosePath(!state.penClosePath)} style={{ border: 0, background: 'transparent', padding: 0 }}>
            <Toggle on={state.penClosePath} />
          </button>
        </div>
      </section>
      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>{L.pen_hint}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>{L.boolean_after_create_hint}</div>
    </div>
  );
}


function BoolButton({ label, path, fill, onClick, testId }: { label: string; path: string; fill?: boolean; onClick: () => void; testId: string }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      style={{ height: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', fontSize: 11 }}
    >
      <Icon size={20} strokeWidth={1.4} fill={fill ? 'currentColor' : 'none'} path={path} />
      {label}
    </button>
  );
}

/** Roadmap #10 — shown whenever 2+ selected elements are all shapes (any mix of
 * rect/ellipse/closed path). An open pen path has no interior (see
 * `isBooleanEligible`), so the section stays visible but disables its buttons with a
 * real explanation rather than hiding — "never fake, never a silent no-op". */
function BooleanOpsSection({ shapes }: { shapes: Array<DocElement & { type: 'shape' }> }) {
  const { state, actions, dict: L } = useStudio();
  // Document (back-to-front) order, not selection click order — `applyBooleanOp`
  // treats the first entry as the bottom shape for `subtract`.
  const ids = new Set(shapes.map((s) => s.id));
  const ordered = state.elements.filter((e): e is DocElement & { type: 'shape' } => ids.has(e.id) && e.type === 'shape');
  const orderedIds = ordered.map((e) => e.id);
  const disabled = !ordered.every(isBooleanEligible);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mz-label">{L.boolean}</div>
      {disabled && <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{L.boolean_open_path_hint}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? 'none' : 'auto' }} aria-disabled={disabled}>
        <BoolButton testId="bool-union" label={L.union} path="M3 3h9v5h5v9H8v-5H3z" fill onClick={() => actions.applyBooleanOp('union', orderedIds)} />
        <BoolButton testId="bool-subtract" label={L.subtract} path="M8 8h9v9H8z" onClick={() => actions.applyBooleanOp('subtract', orderedIds)} />
        <BoolButton testId="bool-intersect" label={L.intersect} path="M3 3h9v9H3zM8 8h9v9H8z" onClick={() => actions.applyBooleanOp('intersect', orderedIds)} />
        <BoolButton testId="bool-exclude" label={L.exclude} path="M3 3h9v9H3zM8 8h9v9H8z" onClick={() => actions.applyBooleanOp('exclude', orderedIds)} />
      </div>
    </section>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span style={{ width: 32, height: 18, borderRadius: 999, background: on ? 'var(--accent)' : 'var(--line)', position: 'relative', display: 'inline-block' }}>
      <span style={{ position: 'absolute', top: 2, [on ? 'insetInlineEnd' : 'insetInlineStart']: 2, width: 14, height: 14, borderRadius: '50%', background: on ? 'var(--onAccent)' : 'var(--surface)', boxShadow: on ? 'none' : '0 1px 2px rgba(0,0,0,.2)' }} />
    </span>
  );
}


/** **لا تحديد ← خصائصُ المشروع** (٢٩ أكتوبر ٢٠٢٦، مقابل a common video editor: «Details» حين لا شيء محدَّد). كان اللوحُ
 * فارغًا إلا من تلميح، فيبدو كأنّ شيئًا تعطّل. الآن: المقاسُ والنوعُ والطولُ وعددُ الطبقات، والتلميحُ تحتها. */
function ProjectDetails() {
  const { state, dict: L } = useStudio();
  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  const timed = state.medium === 'timed';
  const layers = state.elements.filter((e) => e.id !== 'mz-background').length;
  const duration = timed ? documentDuration(state.elements.map((e) => e.anim), state.fps) : 0;
  const ar = state.lang === 'ar';
  const rows: Array<[string, string]> = [
    [ar ? 'المقاس' : 'Size', `${size.w} × ${size.h}`],
    [ar ? 'النوع' : 'Type', timed ? (ar ? 'فيديو' : 'Video') : ar ? 'صورة' : 'Image'],
    ...(timed ? ([[ar ? 'الطول' : 'Duration', `${duration.toFixed(2)}${ar ? 'ث' : 's'}`], [ar ? 'الإطارات' : 'Frame rate', `${state.fps}fps`]] as Array<[string, string]>) : []),
    [ar ? 'الطبقات' : 'Layers', String(layers)],
  ];
  return (
    <section data-testid="project-details" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mz-label">{ar ? 'المشروع' : 'Project'}</div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
          <span style={{ color: 'var(--muted)' }}>{k}</span>
          <span style={{ fontWeight: 600, direction: 'ltr' }}>{v}</span>
        </div>
      ))}
      <div style={{ paddingTop: 10, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>{L.no_selection}</div>
    </section>
  );
}
