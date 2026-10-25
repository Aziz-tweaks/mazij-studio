import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArtboardSizeMenu } from './stage/ArtboardSizeMenu';
import { ToolPill } from './stage/ToolPill';
import { ArtboardsChip } from './stage/ArtboardsChip';
import { ContextBar } from './stage/ContextBar';
import { StageMenu } from './stage/StageMenu';
import { ElementView } from './stage/ElementView';
import { Handles, GuideLines } from './stage/Handles';
import { MEDIUM_SURFACES, PALETTES, TOOL_BY_CODE, sizeAt, clamp } from '../data/constants';
import { geoToPx, pxToGeo, resizeBox, rotatePoint, computeSnap, boundsOfBoxes, centerOf, screenToLocal, type HandleId, type PxBox, type ResizeHandleId } from '../lib/geometry';
import { computeImageCropLayout } from '../lib/imageCrop';
import { commandsToSvgPath, pathElementCommands } from '../lib/pathGeometry';
import { closestTOnSegment, fitSmoothPath } from '../lib/pathSmoothing';
import { clipShowsAt, entranceStyleAt } from '../lib/animTimeline';
import type { DocElement } from '../state/elements';
import { defaultAnim, defaultTextStagger } from '../state/elements';
import { NEW_TEXT_PLACEHOLDER, isPlaceholderText } from '../lib/textPresets';
import { dragIsBigEnough, floorDegenerate, shapeDragBox, shapeGeometryFor } from '../lib/shapeFactory';
import type { ShapeDrawKind } from '../state/types';
import { useStudio } from '../state/StudioContext';
import { AudioPlayback } from './stage/AudioPlayback';
import { isAudioFile } from '../lib/audioFile';

/** الصندوق الجاري رسمه، مع أي قُطرَي الصندوق يسلكه الخطّ (يُهمَل لبقيّة الأنواع). */
type ShapeDraft = { x: number; y: number; w: number; h: number; flipX?: boolean; flipY?: boolean };

const HINT_KEYS: Record<string, string> = {
  direct: 'hint_direct',
  hand: 'hint_hand',
  text: 'hint_text',
  shape: 'hint_shape',
  pen: 'hint_pen',
  image: 'hint_image',
  lottie: 'hint_lottie',
  video: 'hint_video',
  audio: 'hint_audio',
  fx: 'hint_fx',
};

const CURSOR_BY_TOOL: Record<string, string> = { text: 'text', shape: 'crosshair', pen: 'crosshair', image: 'copy', lottie: 'copy', video: 'copy', hand: 'grab' };

/** مسارٌ نقاطه قابلةٌ للتحرير — الشرطُ نفسه الذي تحمله النقرة المزدوجة. المخطّط المحوَّل
 * من نصّ ونتيجة العمليات البوليانيّة هندسةٌ مسطّحة لا نقاط لها. */
function isNodeEditable(el: DocElement): boolean {
  return el.type === 'shape' && el.shape === 'path' && (el.points?.length ?? 0) >= 2 && !el.outline?.length && !el.subpaths?.length;
}

type DragKind = 'move' | 'resize' | 'rotate' | 'pan' | 'shape-draw' | 'crop-pan' | 'pen-handle' | 'node-anchor' | 'node-handle';

/** نصف قطر إصابة نقطة الربط على الشاشة (بكسل شاشة، يُقسَم على التكبير ليبقى الهدف
 * بالحجم نفسه تحت المؤشّر عند أي تكبير) — تستخدمه نقرة «أغلق المسار» على أول نقطة. */
const ANCHOR_HIT_PX = 11;

interface DragSession {
  kind: DragKind;
  rect: DOMRect;
  scale: number;
  startDocX: number;
  startDocY: number;
  lastClientX: number;
  lastClientY: number;
  startGeosPx?: Map<string, PxBox>;
  elementId?: string;
  handle?: ResizeHandleId;
  startBox?: PxBox;
  startAngle?: number;
  startCrop?: { cropX: number; cropY: number; dw: number; dh: number };
  /** وضع تحرير العقد: فهرس النقطة المسحوبة، وأي جزء منها. */
  nodeIndex?: number;
  nodePart?: 'anchor' | 'in' | 'out';
  /** آخر موضع مؤشّر بإحداثيات المستند — تحتاجه الإزاحة بـ`Space` أثناء رسم شكل:
   * الفرق بين حركتين متتاليتين هو ما يُحرّك نقطة الأصل. */
  prevDocX?: number;
  prevDocY?: number;
  /** العنصر الواقع تحت بداية سحبة الرسم، إن وُجد — يحسم معنى **النقرة** (سحبةٌ
   * لم تتحرّك) وأداةُ الأشكال مسلَّحة: انظر `onUp`. */
  shapeHitId?: string | null;
  /** زاويةُ نصٍّ بمسك الأداة الشائعة: الصندوق يكبر متناسبًا والخطّ معه بالنسبة نفسها. */
  scaleText?: { startFontSize: number };
}

/** مقابض النصّ بمسك الأداة الشائعة: الجانبان (العرض) والزوايا (التكبير) — بلا فوق/تحت. منطقةُ
 * إصابةِ الحافّة العليا كانت تغطّي حروف العنوان الصغير، فالسحبُ منها يغيّر الطول بدل
 * أن يحرّك (جولة الاستخدام، ٢٤ أكتوبر ٢٠٢٦) — والأداة الشائعة نفسها لا تضع للنصّ هذين المقبضين. */
const CANVA_TEXT_HANDLES: readonly ResizeHandleId[] = ['e', 'w', 'nw', 'ne', 'se', 'sw'];

export function Stage() {
  const { state, actions, dict: L } = useStudio();
  const lang = state.lang;
  /** المسك البسيط على الصورة: النصّ كما في الأداة الشائعة. والاحترافي: كما في أداة المتّجهات. */
  const canvaTextGrip = !state.pro && MEDIUM_SURFACES[state.medium].canvaTextGrip;
  const size = sizeAt(state.sizeIdx, state.customW, state.customH);
  const pal = PALETTES[state.postPalette];
  const t = state.t;

  const viewportRef = useRef<HTMLDivElement>(null);
  const artboardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [guides, setGuides] = useState<Array<{ axis: 'x' | 'y'; pos: number }>>([]);
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null);
  const shapeDraftRef = useRef<ShapeDraft | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  /** قائمة الزرّ الأيمن — موضعها على الشاشة، وهل فُتحت على عنصرٍ أم على فراغ اللوحة. */
  const [stageMenu, setStageMenu] = useState<{ x: number; y: number; onElement: boolean } | null>(null);
  const closeStageMenu = useCallback(() => setStageMenu(null), []);
  /** نفس قيمة `spaceDown`، لكن مقروءة من مُستمع نافذة لا من إعادة رسم: مُستمع
   * `pointermove` مُسجَّل مرّة واحدة ولا يرى الحالة المتجدّدة. */
  const spaceDownRef = useRef(false);
  const editRef = useRef<HTMLDivElement | null>(null);
  /** موضعُ النقرة المزدوجة التي فتحت التحرير — يُستهلَك مرّةً واحدة عند دخوله ثم يُمسَح.
   * كان يبقى معلّقًا، فيأخذ دخولٌ لاحقٌ بـEnter على نصٍّ آخر نقطةَ نقرةٍ قديمة لا تخصّه. */
  const dblClickPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      setContainerSize({ w: box.width, h: box.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padding = 40;
  const baseFit = Math.max(0.02, Math.min((containerSize.w - padding * 2) / size.w, (containerSize.h - padding * 2) / size.h));
  const scale = baseFit * (state.zoom / 100);

  // --- space-to-pan، وأثناء رسم شكل: إزاحة الشكل الجاري ---
  //
  // وأثناء السحب أيضًا: ↑/↓ تغيّر عدد أضلاع المضلّع أو رؤوس النجمة حيًّا. قاعدة
  // أداة المتّجهات واحدة لا بندًا خاصًّا بالمضلّع: «السهم أثناء السحب يغيّر المُعامل
  // المُعرِّف للشكل» — ربطٌ واحد بخمسة معانٍ يحسمها الشكل النشِط
  // (`re-illustrator-flows.md` §2.4). وهي ما يجعل «مضلّع بعدد أضلاع» حقيقيًّا
  // لحظةَ الرسم بدل أن يكون مسدّسًا ثابتًا.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditableTarget(e.target)) {
        spaceDownRef.current = true;
        setSpaceDown(true);
        // منع التمرير: اللوحة قد تكون داخل حاوية قابلة للتمرير، فمِسطرة المسافة
        // أثناء رسم شكل كانت ستُحرّك الصفحة تحت يد المصمم.
        if (dragRef.current) e.preventDefault();
      }
      const drawing = dragRef.current?.kind === 'shape-draw';
      if (drawing && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
        const kind = stateRef.current.shapeDrawKind;
        if (kind === 'polygon' || kind === 'star') {
          e.preventDefault();
          actionsRef.current.setShapeDrawN(stateRef.current.shapeDrawN + (e.code === 'ArrowUp' ? 1 : -1));
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDownRef.current = false;
        setSpaceDown(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // --- zoom + layer-order shortcuts ---
  //
  // `zoomIn`/`zoomOut`/`zoomFit` and `bringForward`/`sendBackward` already existed
  // as actions, reachable only by mouse. A designer reaches for Cmd+= and Cmd+]
  // within the first minute — found 18 October 2026 while walking the app as a new
  // user, after the owner reported it was unusable. Nothing was broken; the
  // keyboard simply never asked for any of it.
  //
  // Matched on `e.code`, not `e.key`, deliberately: Mazij's audience types Arabic,
  // and under an Arabic keyboard layout `e.key` for these physical keys is an
  // Arabic character while `e.code` stays `Equal`/`BracketRight`. Keying off
  // `e.key` would have shipped shortcuts that silently work only in English.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const s = stateRef.current;
      const a = actionsRef.current;

      if (e.code === 'Equal') {
        e.preventDefault();
        a.zoomIn();
      } else if (e.code === 'Minus') {
        e.preventDefault();
        a.zoomOut();
      } else if (e.code === 'Digit0') {
        e.preventDefault();
        a.zoomFit();
      } else if (e.code === 'KeyG') {
        // ⌘G / ⇧⌘G — تجميع وفكّ تجميع. أزواجٌ تختلف بمُعدِّلٍ واحد، وهي القاعدة
        // التي تجعل خريطة مفاتيح أداة المتّجهات تُحفَظ كأزواج لا كبنودٍ متفرّقة
        // (`re-illustrator-flows.md` §7.3). ومثل الاختصارات أعلاه: المطابقة على
        // `e.code` لا `e.key`، وإلا عملت تحت لوحة المفاتيح الإنجليزية وحدها.
        e.preventDefault();
        if (e.shiftKey) a.ungroupSelected();
        else a.groupSelected();
      } else if (e.code === 'Digit2') {
        // ⌘2 قفل التحديد · ⌥⌘2 فكّ قفل الكل.
        e.preventDefault();
        if (e.altKey) a.unlockAll();
        else a.lockSelected();
      } else if (e.code === 'Digit3') {
        // ⌘3 إخفاء التحديد · ⌥⌘3 إظهار الكل.
        e.preventDefault();
        if (e.altKey) a.showAll();
        else a.hideSelected();
      } else if (e.code === 'BracketRight' || e.code === 'BracketLeft') {
        if (!s.selectedIds.length) return;
        e.preventDefault();
        const forward = e.code === 'BracketRight';
        if (e.shiftKey) {
          // All the way to front/back. `bringForward`/`sendBackward` move a single
          // step, so the extreme is expressed as an explicit target index instead,
          // moving the ids one at a time so their order relative to each other
          // survives the trip.
          const ordered = s.elements.filter((el) => s.selectedIds.includes(el.id)).map((el) => el.id);
          const sequence = forward ? ordered : [...ordered].reverse();
          sequence.forEach((id) => a.reorderElement(id, forward ? s.elements.length - 1 : 0));
        } else if (forward) {
          a.bringForward(s.selectedIds);
        } else {
          a.sendBackward(s.selectedIds);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // --- arrow-key nudge + delete ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const s = stateRef.current;
      if (s.editingTextId) return;
      // داخل وضع تحرير العقد، Delete يحذف نقطة الربط المحدَّدة لا العنصر كله — وهذا
      // ما يتوقّعه المصمم عندما تكون نقطة واحدة هي ما يحدّده فعلًا على الشاشة.
      if (s.nodeEditId && s.nodeEditSel && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        actionsRef.current.deletePathPoint(s.nodeEditId, s.nodeEditSel.index);
        return;
      }
      if (!s.selectedIds.length) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        actionsRef.current.nudgeSelected(-step, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        actionsRef.current.nudgeSelected(step, 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        actionsRef.current.nudgeSelected(0, -step);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        actionsRef.current.nudgeSelected(0, step);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        actionsRef.current.deleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // --- اختصارات الأدوات بحرف واحد (V A P T M/R L H I) ---
  //
  // كلّ زرّ في حبّة الأدوات يعرض حرفه، فالبرنامج **يَعِد** بالاختصار؛ والمصمّم القادم
  // من أداة المتّجهات أو فيغما يضغط الحرف قبل أن يقرأ شيئًا. فالحروف هي حروفهم بمعانيها
  // (`TOOLS` في `data/constants.ts`).
  //
  // المفتاح `e.code` لا `e.key`: تحت لوحة مفاتيح عربيّة يصير `e.key` حرفًا عربيًّا
  // بينما يبقى `e.code` على `KeyT`/`KeyM` — والربط بـ`e.key` كان سيشحن اختصارات تعمل
  // بالإنجليزيّة وحدها، وهذا برنامجٌ عربيّ أوّلًا.
  //
  // والحرف يفعل **ما تفعله النقرة على زرّه في حبّة الأدوات** بالضبط: يُسلِّح ولا يفتح
  // لوحًا (`setTool`). ولا استثناء «احترافي» بعد ٢٤ أكتوبر ٢٠٢٦: ألغى المالك الوضعين.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = stateRef.current;
      if (s.editingTextId) return;
      // L الدائرة، وM/R المستطيل — حرفا أداة المتّجهات وفيغما يحدّدان **نوع** الشكل،
      // لا الأداة وحدها. والضغط على زرّ الشكل في الحبّة يُبقي آخر نوعٍ اختاره المصمّم.
      if (e.code === 'KeyL' || e.code === 'KeyM' || e.code === 'KeyR') {
        e.preventDefault();
        actionsRef.current.setTool('shape');
        actionsRef.current.setShapeDrawKind(e.code === 'KeyL' ? 'ellipse' : 'rect');
        return;
      }
      const tool = TOOL_BY_CODE[e.code];
      if (!tool) return;
      e.preventDefault();
      // A على مسارٍ محدَّد = حرّر نقاطه الآن (التحديد المباشر في أداة المتّجهات). بلا
      // مسار محدَّد تُسلَّح الأداة، فالنقرة التالية على مسارٍ تدخل نقاطه.
      if (tool === 'direct') {
        const only = s.selectedIds.length === 1 ? s.elements.find((x) => x.id === s.selectedIds[0]) : undefined;
        if (only && isNodeEditable(only)) {
          actionsRef.current.startNodeEdit(only.id);
          return;
        }
      }
      actionsRef.current.setTool(tool);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const docPointFromClient = useCallback((clientX: number, clientY: number, rect: DOMRect, s: number) => ({
    x: (clientX - rect.left) / s,
    y: (clientY - rect.top) / s,
  }), []);

  // --- window-level pointer move/up: drives move/resize/rotate/pan/shape-draw ---
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const curSize = sizeAt(stateRef.current.sizeIdx, stateRef.current.customW, stateRef.current.customH);

      if (drag.kind === 'pan') {
        actionsRef.current.panBy(e.clientX - drag.lastClientX, e.clientY - drag.lastClientY);
        drag.lastClientX = e.clientX;
        drag.lastClientY = e.clientY;
        return;
      }

      const p = docPointFromClient(e.clientX, e.clientY, drag.rect, drag.scale);

      if (drag.kind === 'shape-draw') {
        const kind = stateRef.current.shapeDrawKind;
        // الإزاحة بـ`Space`: تُحرَّك **نقطة الأصل** بنفس إزاحة المؤشّر، فيحفظ
        // الصندوق قياسه بالضبط ويتنقّل — أبسط وأدقّ من حمل إزاحة ثالثة في الحساب،
        // وهو ما يجعل «حرّك الشكل وأنت ترسمه» مجّانيًّا. مفتاح عامّ في أداة المتّجهات
        // (`re-illustrator-flows.md` §2.4).
        if (spaceDownRef.current) {
          drag.startDocX += p.x - (drag.prevDocX ?? p.x);
          drag.startDocY += p.y - (drag.prevDocY ?? p.y);
        }
        drag.prevDocX = p.x;
        drag.prevDocY = p.y;
        // تُقرأ المُعدِّلات من حدث `pointermove` **الحيّ** لا من لحظة بداية السحب،
        // فيضغط المصمم Shift ويُفلته في منتصف السحبة ويرى الأثر فورًا — وهو شرط
        // نصّ عليه التحليل صراحةً.
        const box = shapeDragBox(kind, { x: drag.startDocX, y: drag.startDocY }, p, { shift: e.shiftKey, alt: e.altKey });
        shapeDraftRef.current = box;
        setShapeDraft(box);
        return;
      }

      // أداة القلم: السحب أثناء وضع النقطة يسحب مقبض خروجها (إيماءة القلم القياسية).
      // المسودّة بإحداثيات المستند، فالمقبض إزاحة بالبكسل من النقطة نفسها.
      if (drag.kind === 'pen-handle') {
        const dx = p.x - drag.startDocX;
        const dy = p.y - drag.startDocY;
        // عتبة 2 بكسل مستند: نقرة بلا سحب حقيقي يجب أن تبقى زاوية حادة، لا منحنى
        // بمقبض بطول بكسل واحد ناتج عن رجفة إصبع على لوحة اللمس.
        actionsRef.current.penSetDraftHandle(Math.hypot(dx, dy) < 2 ? null : { x: dx, y: dy });
        return;
      }

      if ((drag.kind === 'node-anchor' || drag.kind === 'node-handle') && drag.elementId && drag.nodeIndex !== undefined) {
        const el = stateRef.current.elements.find((x) => x.id === drag.elementId);
        if (!el || el.type !== 'shape' || !el.points) return;
        const box = geoToPx(el.geo, curSize);
        // كل شيء في `points`/`handles` كسور من صندوق العنصر، فنحوّل نقطة المستند إلى
        // الإطار المحلي (مع إلغاء الدوران) ثم نُقسّم على أبعاد الصندوق.
        const local = screenToLocal(p, box);
        if (drag.kind === 'node-anchor') {
          actionsRef.current.liveUpdatePathPoint(drag.elementId, drag.nodeIndex, { x: local.x / box.w, y: local.y / box.h });
        } else {
          const anchor = el.points[drag.nodeIndex];
          const vec = { x: local.x / box.w - anchor.x, y: local.y / box.h - anchor.y };
          // المقابض متناظرة افتراضيًا (انحناء سلس عبر النقطة)؛ Alt يكسر التناظر
          // فيستقل كل جانب — نفس مُعدِّل أداة متّجهات/أداة تصميم أخرى.
          actionsRef.current.liveUpdatePathHandle(drag.elementId, drag.nodeIndex, drag.nodePart === 'in' ? 'in' : 'out', vec, !e.altKey);
        }
        return;
      }

      if (drag.kind === 'move' && drag.startGeosPx) {
        let dx = p.x - drag.startDocX;
        let dy = p.y - drag.startDocY;
        const boxesAfter = Array.from(drag.startGeosPx.values()).map((b) => ({ ...b, x: b.x + dx, y: b.y + dy }));
        const bounds = boundsOfBoxes(boxesAfter);
        const snap = computeSnap({ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, rotation: 0 }, curSize, 8 / drag.scale);
        dx += snap.dx;
        dy += snap.dy;
        setGuides(snap.guides);
        actionsRef.current.liveUpdateElements((els) =>
          els.map((el) => {
            const start = drag.startGeosPx!.get(el.id);
            if (!start) return el;
            const newBox: PxBox = { ...start, x: start.x + dx, y: start.y + dy };
            return { ...el, geo: pxToGeo(newBox, curSize) };
          }),
        );
        return;
      }

      if (drag.kind === 'resize' && drag.startBox && drag.elementId && drag.handle) {
        const dx = p.x - drag.startDocX;
        const dy = p.y - drag.startDocY;
        const local = rotatePoint({ x: dx, y: dy }, { x: 0, y: 0 }, -drag.startBox.rotation);
        const scaleText = drag.scaleText;
        const newBox = resizeBox(drag.startBox, drag.handle, local, { proportional: !!scaleText || e.shiftKey });
        const k = scaleText && drag.startBox.w > 0 ? newBox.w / drag.startBox.w : 1;
        actionsRef.current.liveUpdateElements((els) =>
          els.map((el) => {
            if (el.id !== drag.elementId) return el;
            const geo = pxToGeo(newBox, curSize);
            // الأداة الشائعة: سحبُ زاوية النصّ يكبّره كلّه — الخطّ بنسبة الصندوق نفسها، مقرَّبًا لعُشرٍ
            // كما تعرضه الأداة الشائعة (لا ٧١٫٢٩٦٨٧ في خانة المقاس).
            return scaleText && el.type === 'text' ? { ...el, geo, fontSize: Math.max(4, Math.round(scaleText.startFontSize * k * 10) / 10) } : { ...el, geo };
          }),
        );
        return;
      }

      if (drag.kind === 'rotate' && drag.startBox && drag.elementId && drag.startAngle !== undefined) {
        const c = centerOf(drag.startBox);
        const angle = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
        const newRotation = drag.startBox.rotation + (angle - drag.startAngle);
        actionsRef.current.liveUpdateElements((els) => els.map((el) => (el.id === drag.elementId ? { ...el, geo: { ...el.geo, rotation: newRotation } } : el)));
        return;
      }

      // Pans the image's *content* within its frame: dragging moves the picture with
      // the cursor, so cropX/cropY (the content point centered in the frame) move the
      // opposite way, in units of the content's current on-screen displayed size (dw/dh)
      // — the same layout math used to render it, so the drag tracks 1:1 with the pixels.
      if (drag.kind === 'crop-pan' && drag.startBox && drag.elementId && drag.startCrop) {
        const dx = p.x - drag.startDocX;
        const dy = p.y - drag.startDocY;
        const local = rotatePoint({ x: dx, y: dy }, { x: 0, y: 0 }, -drag.startBox.rotation);
        const { cropX, cropY, dw, dh } = drag.startCrop;
        const nextCropX = dw ? clamp(cropX - local.x / dw, 0, 1) : cropX;
        const nextCropY = dh ? clamp(cropY - local.y / dh, 0, 1) : cropY;
        actionsRef.current.liveUpdateImageCrop(drag.elementId, { cropX: nextCropX, cropY: nextCropY });
        return;
      }
    };

    const onUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === 'shape-draw') {
        // Reads the draft from a ref and calls addShapeElement as a plain statement
        // here — not from inside the setShapeDraft updater — because React 19's
        // StrictMode double-invokes state updaters to surface side effects, and an
        // action dispatched from inside one fires twice, creating two shapes per
        // single drag (same bug class as the timeline interval fix above).
        const draft = shapeDraftRef.current;
        shapeDraftRef.current = null;
        const kind = stateRef.current.shapeDrawKind;
        if (draft && dragIsBigEnough(kind, draft)) {
          actionsRef.current.addShapeElement(kind, floorDegenerate(draft), {
            n: stateRef.current.shapeDrawN,
            lineVector: { flipX: !!draft.flipX, flipY: !!draft.flipY },
          });
          // وترتدّ الأداة إلى «تحديد» بعد شكلٍ اكتمل — كما يفعل مساران آخران في
          // البرنامج أصلًا: أداة النصّ (`setTool('select')` بعد الإنشاء) ووضعُ
          // شكلٍ من المكتبة (`tool: 'select'` في `placeShapeFromLibrary`). فكان
          // السحبُ وحده يُبقي الأداة مسلَّحة، أي ثلاثةُ مسارات إنشاء بسلوكين.
          //
          // وهي شرطٌ لسلامة الحارس في `onElementPointerDown`: ما دامت الأداة
          // مسلَّحة فالنقر على عنصر لا يُحدِّده (بل يبدأ شكلًا جديدًا)، فلو بقيت
          // مسلَّحة بعد الرسم لوجد المصمم نفسه عاجزًا عن تحديد ما رسمه للتوّ بلا
          // سببٍ ظاهر. والارتداد مشروطٌ بنجاح الإنشاء، فالسحبة الصغيرة العابرة
          // لا تنزع الأداة من يده.
          //
          // **و`keepSelection` هنا شرطُ بقاءِ قدرةٍ، لا تفصيل.** تسليحُ أداةٍ صار
          // ينزع التحديدَ عن كل شيء (`armTool` في `StudioContext.tsx`)، وهذا
          // النداءُ ليس تسليحًا بل **ارتدادٌ بعد إنشاء**: `addShapeElement`
          // حدَّدت الشكلَ الذي رسمه المصمّم للتوّ، فنزعُه هنا كان سيُنتج أسوأَ
          // ممّا يُصلحه — يرسم الشكلَ فلا يجده محدَّدًا، ولا مقابضَ عليه، ولوحُ
          // الخصائص فارغٌ عن شيءٍ صنعه قبل جزءٍ من الثانية. والمواضعُ الخمسةُ
          // التي تَرتدّ في هذا الملفّ (هنا، والنصُّ، والصورةُ، واللوتي، والفيديو)
          // كلُّها على هذه القاعدة بعينها.
          actionsRef.current.setTool('select', { keepSelection: true });
        } else if (drag.shapeHitId) {
          // سحبةٌ لم تتحرّك = **نقرة**. وأداةُ الأشكال تُنشئ بالسحب لا بالنقر،
          // فالنقرة فارغةُ المعنى لها — وتُفسَّر على ما تعنيه في كل محرّر: «حدِّد
          // هذا العنصر». وهذا ما يُبقي القاعدة المنصوص عليها في
          // `qa/shapes-library.spec.mjs`: لمسُ عنصر يُغلق لوح الإدراج ويُظهر
          // «التصميم» (و`selectElement` تفعل الاثنين وتُعيد الأداة إلى «تحديد»).
          //
          // وأداةُ النصّ لا تشترك في هذا: إنشاؤها **نقرةٌ** أصلًا، فلو صُرِفت
          // النقرةُ إلى التحديد لما أمكن وضعُ نصٍّ فوق عنصر قائم أبدًا — وهو
          // العطب الذي أُصلح هنا ابتداءً.
          actionsRef.current.selectElement(drag.shapeHitId);
        }
        setShapeDraft(null);
      }
      if (drag.kind === 'move' || drag.kind === 'resize' || drag.kind === 'rotate' || drag.kind === 'crop-pan' || drag.kind === 'node-anchor' || drag.kind === 'node-handle') {
        actionsRef.current.commitElementEdit();
      }
      // 'pen-handle' لا يُلزم شيئًا: المسودّة (`penDraft`) خارج المستند والتاريخ أصلًا،
      // وخطوة التراجع الوحيدة تُدفَع عند `penFinish`.
      setGuides([]);
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [docPointFromClient]);

  const startDrag = (base: Omit<DragSession, 'rect' | 'scale'>) => {
    const rect = artboardRef.current!.getBoundingClientRect();
    dragRef.current = { ...base, rect, scale };
  };

  /** All elements whose (rotation-aware) box contains doc-space point `p`, bottom-to-top
   * (array/paint order) — used by alt-click to reach an element stacked underneath. */
  const hitElementsAt = (p: { x: number; y: number }): string[] => {
    const hits: string[] = [];
    for (const el of state.elements) {
      // المقفل يسقط من الاختبار مثل المخفيّ تمامًا: نقرة Option تنزل عبر الكومة إلى
      // ما *يُمكن* تحريره، لا إلى طبقةٍ أخرجها المصمّم من التحرير عمدًا.
      if (!el.visible || el.locked) continue;
      const box = geoToPx(el.geo, size);
      const local = screenToLocal(p, box);
      if (local.x >= 0 && local.x <= box.w && local.y >= 0 && local.y <= box.h) hits.push(el.id);
    }
    return hits;
  };

  /** Alt/Option-click reaches the element(s) stacked underneath the topmost hit: the
   * first alt-click steps from the topmost hit to the one just below it, and repeated
   * alt-clicks at the same spot keep cycling further down the stack (wrapping back to
   * the top once the bottom is reached). */
  const resolveAltClickTarget = (topId: string, p: { x: number; y: number }): string => {
    const hits = hitElementsAt(p);
    if (hits.length <= 1) return topId;
    const topIndex = hits.length - 1;
    const selIdx = state.selectedIds.length === 1 ? hits.indexOf(state.selectedIds[0]) : -1;
    const fromIndex = selIdx !== -1 ? selIdx : topIndex;
    const nextIndex = (fromIndex - 1 + hits.length) % hits.length;
    return hits[nextIndex];
  };

  const onElementPointerDown = (e: ReactPointerEvent<HTMLDivElement>, id: string) => {
    // حارسان وصلا من رحلتين مختلفتين، وكلاهما لازم، وكلاهما يخرج **قبل**
    // `stopPropagation` لا بعده: الغرض في الحالتين أن يَصعد الحدث إلى مُعالج
    // خلفيّة اللوحة لا أن يُستهلك هنا.
    //
    // الأول: أداةٌ مُسلَّحة غير «تحديد» تملك الإيماءة، لا العنصرُ الواقع تحت
    // المؤشّر. `onBackgroundPointerDown` هو الموضع **الوحيد** الذي يُنشئ نصًّا أو
    // يبدأ رسم شكل، ولا يُنادى إلا إذا وصله الحدث صعودًا. وكان `stopPropagation`
    // يُطلَق قبل أي فحص فيبتلع الإيماءة كلّها: يضغط المصمّم «نص» ثم ينقر فوق
    // صورته فلا يُنشأ شيء — بصمت — ومع «أشكال» الأمر أسوأ، إذ تتحوّل محاولةُ
    // الرسم إلى **سحبٍ للصورة** فيختلّ التنسيق الذي بناه. وعلى تصميمٍ مكتمل
    // تغطّي العناصرُ أغلبَ اللوحة، فتبدو الأداتان معطّلتين أصلًا. ويبقى `select`
    // وحده هو ما يُحدِّد ويسحب، وإليه ترتدّ الأدوات المُنشِئة فور الإنشاء.
    // التحديد المباشر: نقرةٌ على مسارٍ تدخل نقاطه فورًا، وعلى غيره تحدّده كالمعتاد.
    if (state.tool === 'direct') {
      const hit = state.elements.find((x) => x.id === id);
      if (hit && !hit.locked && isNodeEditable(hit)) {
        e.stopPropagation();
        e.preventDefault();
        actions.startNodeEdit(hit.id);
        return;
      }
    }
    if (state.tool !== 'select' && state.tool !== 'direct') return;
    // والثاني: العنصر المقفل يُمرِّر الحدث ولا يبتلعه. هذا هو الفرق بين «مقفل»
    // و«منطقة ميتة» — ولولاه لمنع القفلُ الإمساكَ بالعنصر *وأيضًا* الرسمَ فوقه
    // وتحديدَ ما تحته، فتخسر الخلفيّةُ المقفلة كلَّ ما قُفلت من أجله. القفل
    // يُخرج العنصر من الإمساك وحده.
    const underPointer = state.elements.find((x) => x.id === id);
    if (underPointer?.locked) return;
    e.stopPropagation();
    // مصدرُ الحركة نفسه — لا الخلفيّة ولا النصّ قيد التحرير. ElementView لا
    // يَصِل بهذا المعالج أصلًا حين `editing` (انظر فرعَها قبل السطر الذي يُرفِق
    // `onPointerDown`)، فالاستثناء بنيويٌّ لا شرطٌ هنا. ومنعُ السلوك الافتراضي
    // يوقف تحديدَ النصّ المجاور وشبحَ سحب الصورة الأصليّ اللذين كانا يظهران حين
    // يبدأ السحبُ من فوق عنصر نصٍّ أو صورةٍ غير مُحرَّر.
    e.preventDefault();
    if (spaceDown) return; // let background pan handler take it
    const rect = artboardRef.current!.getBoundingClientRect();
    const start = docPointFromClient(e.clientX, e.clientY, rect, scale);
    const targetId = e.altKey ? resolveAltClickTarget(id, start) : id;
    const el = state.elements.find((x) => x.id === targetId);
    if (!el || el.locked) return;

    // لمسُ عنصر على اللوحة يُغلق لوح الإدراج ويُظهر «التصميم» — ولو كان العنصر
    // محدَّدًا سلفًا. القاعدة نفسها مطبَّقة داخل `selectElement`/`selectMany`
    // (`leaveInsertLibrary` في `StudioContext.tsx`)، لكنّها لا تكفي وحدها: الضغط
    // على عنصر **محدَّد أصلًا** لا يستدعي أي إجراء تحديد (الشرط أدناه يتخطّاه)،
    // فكان اللوح يبقى على المكتبة بعد أوضح إيماءة «أنا أحرّر الآن» في البرنامج.
    if (state.panel === 'library') actions.setPanel('props');

    if (state.cropEditingId === targetId && el.type === 'image') {
      actions.beginElementEdit();
      const box = geoToPx(el.geo, size);
      const natural = { w: el.naturalW || box.w, h: el.naturalH || box.h };
      const { dw, dh } = computeImageCropLayout(box, natural, el.fit, el.cropX, el.cropY, el.cropScale);
      startDrag({ kind: 'crop-pan', startDocX: start.x, startDocY: start.y, lastClientX: e.clientX, lastClientY: e.clientY, elementId: el.id, startBox: box, startCrop: { cropX: el.cropX, cropY: el.cropY, dw, dh } });
      return;
    }

    const additive = e.shiftKey;
    let nextSelection = state.selectedIds;
    if (!state.selectedIds.includes(targetId) || e.altKey) {
      nextSelection = additive ? [...state.selectedIds, targetId] : [targetId];
      actions.selectMany(nextSelection);
    } else if (additive) {
      nextSelection = state.selectedIds.filter((x) => x !== targetId);
      actions.selectMany(nextSelection);
    }
    if (!nextSelection.length) return;
    actions.beginElementEdit();
    const startGeosPx = new Map<string, PxBox>();
    for (const eid of nextSelection) {
      const found = state.elements.find((x) => x.id === eid);
      if (found) startGeosPx.set(eid, geoToPx(found.geo, size));
    }
    startDrag({ kind: 'move', startDocX: start.x, startDocY: start.y, lastClientX: e.clientX, lastClientY: e.clientY, startGeosPx });
  };

  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>, handle: HandleId) => {
    // نفس قاعدة `onElementPointerDown`: المقابض تخصّ «تحديد» وحدها.
    //
    // وأثرُها هنا أخبث، لأن حلقة الإصابة حول المقبض تمتدّ نحو ٢٠ بكسل **خارج**
    // صندوق العنصر، وهي شفّافة. فالمصمم الذي وضع عنوانًا للتوّ ثم أراد سطر
    // تفاصيل تحته مباشرةً ينقر على فراغٍ يراه فارغًا — فلا يُنشأ نص، وتبدأ
    // بدلًا منه سحبةُ تحجيم للعنوان، مع `beginElementEdit` تدفع خطوة تراجع
    // لتغييرٍ لم يطلبه. وهذا بالضبط ما تعثّر فيه بناء هذا الإعلان.
    if (state.tool !== 'select') return;
    e.stopPropagation();
    const el = state.elements.find((x) => x.id === state.selectedIds[0]);
    if (!el) return;
    actions.beginElementEdit();
    const rect = artboardRef.current!.getBoundingClientRect();
    const start = docPointFromClient(e.clientX, e.clientY, rect, scale);
    const box = geoToPx(el.geo, size);
    if (handle === 'rotate') {
      const c = centerOf(box);
      const startAngle = (Math.atan2(start.y - c.y, start.x - c.x) * 180) / Math.PI;
      startDrag({ kind: 'rotate', startDocX: start.x, startDocY: start.y, lastClientX: e.clientX, lastClientY: e.clientY, elementId: el.id, startBox: box, startAngle });
    } else {
      const corner = handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw';
      const scaleText = canvaTextGrip && corner && el.type === 'text' ? { startFontSize: el.fontSize } : undefined;
      startDrag({ kind: 'resize', startDocX: start.x, startDocY: start.y, lastClientX: e.clientX, lastClientY: e.clientY, elementId: el.id, handle, startBox: box, scaleText });
    }
  };

  const commitTextEditFromRef = () => {
    // `innerText` (not `textContent`) so a Shift+Enter-authored line break (the browser's
    // default contentEditable behavior, since onTextKeyDown only intercepts plain Enter)
    // survives as a real '\n' in the saved text — needed for the 'line' text-stagger unit
    // (roadmap #6) to have more than one unit; `textContent` silently drops <br>/block
    // boundaries entirely.
    if (state.editingTextId && editRef.current) {
      actions.commitTextEdit(state.editingTextId, editRef.current.innerText ?? '');
    }
  };

  const onDoubleClickElement = (e: React.MouseEvent<HTMLDivElement>, id: string) => {
    e.stopPropagation();
    const el = state.elements.find((x) => x.id === id);
    if (el?.type === 'text') {
      dblClickPointRef.current = { x: e.clientX, y: e.clientY };
      actions.startTextEdit(id);
    } else if (el?.type === 'shape' && el.shape === 'path' && (el.points?.length ?? 0) >= 2 && !el.outline?.length && !el.subpaths?.length) {
      // نقرة مزدوجة على مسار = ادخل تحرير العقد — نفس إيماءة «نقرة مزدوجة للتحرير»
      // المستخدمة أصلًا للنص والصورة (القصّ). المخطط المحوَّل من نص ونتيجة العمليات
      // البوليانية مستثنيان: كلاهما هندسة مسطّحة لا تملك `points` قابلة للتحرير.
      if (state.nodeEditId === id) actions.endNodeEdit();
      else actions.startNodeEdit(id);
    } else if (el?.type === 'image' && el.src) {
      // Mirrors text's double-click-to-edit: toggles the same "crop editing" mode
      // reachable from the Design panel's crop button.
      if (state.cropEditingId === id) actions.endCropEdit();
      else actions.startCropEdit(id);
    }
  };

  useEffect(() => {
    if (state.editingTextId && editRef.current) {
      const node = editRef.current;
      node.focus();
      const pt = dblClickPointRef.current;
      dblClickPointRef.current = null;
      // **أين يقع المؤشّر حين يبدأ التحرير:**
      //
      // - **بلا نقطة** (Enter على نصٍّ محدَّد، أو نصٌّ وضعته أداة النصّ للتوّ): يُحدَّد
      //   المحتوى كلّه، فأوّل حرف يكتبه المصمّم يستبدله — كما في فيغما، Enter يحدّد النصّ
      //   كلّه. كان Enter يضع المؤشّر في الآخر، فكتب المصمّم في الجولة على «عنوانك هنا»
      //   فصار «عنوانك هناعرض الصيف».
      // - **نصٌّ ما زال نائبًا** («عنوانك هنا»، «نص جديد»…): يُحدَّد كلّه ولو بنقرةٍ مزدوجة؛
      //   غرضه أن يُستبدَل، لا أن يُكتَب في وسطه.
      // - **نقرةٌ مزدوجة على نصٍّ حقيقيّ**: المؤشّر عند موضع النقر. وإن وقعت النقطة خارج
      //   حروف النصّ (حاشية الصندوق، أو منطقة مقبضٍ خارجه) فالمؤشّر في الآخر — لا تحديدٌ
      //   خارج المحرّر تذهب إليه الحروف.
      const editing = state.elements.find((x) => x.id === state.editingTextId);
      const placeholder = editing?.type === 'text' && isPlaceholderText(editing.text);
      let range: Range | null = null;
      if (pt && !placeholder && typeof document.caretRangeFromPoint === 'function') {
        const atPoint = document.caretRangeFromPoint(pt.x, pt.y);
        if (atPoint && node.contains(atPoint.startContainer)) range = atPoint;
      }
      if (!range) {
        range = document.createRange();
        range.selectNodeContents(node);
        if (pt && !placeholder) range.collapse(false);
      }
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.editingTextId]);

  const onTextKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      actions.commitTextEdit(id, e.currentTarget.innerText ?? '');
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const onBackgroundPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // أدوات الواجهة الطافية فوق اللوحة (صفّ المقاس، حبّة الأدوات، الشريط السياقي) ليست
    // لوحةً: نقرةٌ على زرّ المقاس والنصّ مسلَّح كانت تضع نصًّا جديدًا تحت الزرّ.
    if ((e.target as HTMLElement).closest('[data-stage-overlay]')) return;
    if (state.editingTextId) commitTextEditFromRef();
    if (state.cropEditingId) actions.endCropEdit();
    const isPan = spaceDown || e.button === 1 || state.tool === 'hand';
    if (isPan) {
      e.preventDefault();
      dragRef.current = { kind: 'pan', rect: artboardRef.current!.getBoundingClientRect(), scale, startDocX: 0, startDocY: 0, lastClientX: e.clientX, lastClientY: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    if (state.tool === 'select') {
      if (!e.shiftKey) actions.selectNone();
      return;
    }
    const rect = artboardRef.current!.getBoundingClientRect();
    const p = docPointFromClient(e.clientX, e.clientY, rect, scale);
    // رُفع شرط `state.mode === 'pro'` من هنا: كان الرسم بالسحب حصرًا على الوضع
    // الاحترافي، والوضع البسيط هو الافتراضي — فالمصمم الجديد كان يضغط «أشكال» ثم
    // يسحب على اللوحة فلا يحدث شيء. ورسم مستطيل ليس قدرةً «احترافيّة» بأي معنى.
    if (state.tool === 'shape') {
      // يُسجَّل العنصر الواقع تحت نقطة البدء — لا ليُسحَب، بل ليُحدَّد إن تبيّن أن
      // الإيماءة **نقرةٌ** لا سحبة (انظر `onUp`).
      const underCursor = hitElementsAt(p);
      startDrag({
        kind: 'shape-draw',
        startDocX: p.x,
        startDocY: p.y,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        prevDocX: p.x,
        prevDocY: p.y,
        shapeHitId: underCursor[underCursor.length - 1] ?? null,
      });
      shapeDraftRef.current = { x: p.x, y: p.y, w: 0, h: 0 };
      setShapeDraft(shapeDraftRef.current);
      return;
    }
    if (state.tool === 'pen') {
      // نقرة على أول نقطة ربط = «أغلق المسار وأنهِه»، إيماءة الإغلاق المتعارف عليها
      // في كل محرّر متجهي. بدونها كانت النقرة تُضيف نقطة رابعة مكرّرة فوق الأولى
      // (مقطع صفري الطول) ويبقى المسار مفتوحًا — فلا سبيل لإغلاقه إلا بمفتاح في
      // اللوحة الجانبية *قبل* الرسم. `penFinish(true)` يتجاوز ذلك المفتاح صراحةً.
      const first = state.penDraft[0];
      if (state.penDraft.length >= 2 && first && Math.hypot(p.x - first.x, p.y - first.y) <= ANCHOR_HIT_PX / scale) {
        actions.penFinish(true);
        return;
      }
      actions.penAddPoint(p.x, p.y);
      startDrag({ kind: 'pen-handle', startDocX: p.x, startDocY: p.y, lastClientX: e.clientX, lastClientY: e.clientY });
      return;
    }
    if (state.tool === 'text') {
      // لا تُحذف: هذه الضغطة الواحدة هي ما يُبقي المؤشّر داخل النصّ الجديد.
      //
      // التركيز يُضبَط في التأثير التابع لـ`editingTextId` أعلاه، لكنّ المتصفّح
      // يُعيد ضبط التركيز افتراضيًّا عند رفع الزرّ إلى هدف الضغطة — وهو هنا
      // **خلفيّة اللوحة** لا النصّ الوليد. فكان النصّ يُركَّز ثم يفقد التركيز في
      // الإطار نفسه، فيُطلق `onTextBlur` ← `commitTextEdit` فيعود `editingTextId`
      // إلى `null` قبل أن يرى المصمم مؤشّرًا أصلًا. ومنعُ السلوك الافتراضي
      // للضغطة يوقف إعادة الضبط تلك وحدها، فيثبت التركيز.
      e.preventDefault();
      const id = `text-${Date.now()}`;
      // **النصّ يبدأ حيث نقر المصمّم.** كان الصندوق مُتوسِّطًا على نقطة النقر، والنصّ
      // يُحاذي بدايته (`halign: 'start'`) — فبالعربيّة يطلع أوّلُ حرفٍ على بُعد ١٥٪ من
      // عرض اللوحة يمين النقرة (١٦٢ بكسل على ١٠٨٠)، وعند حافّة اللوحة يُقصّ الصندوق
      // نصفُه. فبداية الصندوق (يمينه بالعربيّة، يساره بالإنجليزيّة) على النقطة نفسها.
      const textW = 0.3;
      const clickX = p.x / size.w;
      const startX = lang === 'ar' ? clickX - textW : clickX;
      actions.commitElements((els) => [
        ...els,
        {
          id,
          type: 'text',
          visible: true,
          locked: false,
          opacity: 100,
          maskId: null,
          geo: { x: clamp(startX, 0, 1 - textW), y: clamp(p.y / size.h - 0.03, 0, 0.9), w: textW, h: 0.1, rotation: 0 },
          text: NEW_TEXT_PLACEHOLDER,
          fontFamily: 'Alexandria',
          fontSize: 48,
          weight: 'bold',
          color: null,
          halign: 'start',
          valign: 'top',
          anim: defaultAnim('none', 0, 0.6),
          textAnim: defaultTextStagger(),
          pathId: null,
        },
      ]);
      actions.selectElement(id);
      // ويدخل التحرير فورًا والمؤشّر داخله.
      //
      // كان النصّ يُنشأ محدَّدًا لا محرَّرًا، و`document.activeElement` يبقى
      // `BODY`: فالمصمم ينقر بأداة النصّ ويكتب — كما يفعل في الأداة الشائعة وإلستريتور
      // وفيغما جميعًا — فتذهب حروفه إلى لا مكان، ويبقى على اللوحة «نص جديد».
      // والسبيل الوحيد لكتابة المحتوى كان حقلَ اللوح الجانبي، وهو سطحٌ لا يخطر
      // لمن وضع النصّ على اللوحة لتوّه. وآلة التركيز موجودة أصلًا ومربوطة
      // بـ`editingTextId` (انظر التأثير أدناه)، ولم تكن تُستدعى من هنا.
      dblClickPointRef.current = null;
      actions.startTextEdit(id);
      // `keepSelection`: ارتدادٌ بعد إنشاء، لا تسليح — انظر الموضعَ الأوّل أعلاه.
      // وللنصّ عليه حِملٌ زائد: `editingTextId` مضبوطٌ على هذا العنصر لتوّه، فنزعُ
      // تحديده كان يُنتج «تحريرَ نصٍّ غيرِ محدَّد» — وهي الحالةُ التي يُسمّيها
      // تعليقُ `vectorcraft/crates/tools/src/text.rs:671-681` ويَختم التحريرَ
      // عندها. أي أنّ النزعَ كان سيُطفئ المؤشّرَ الذي وُضع في السطر الذي قبله.
      actions.setTool('select', { keepSelection: true });
      return;
    }
    // وموضع النقرة يمرّ معها — كما يمرّ مع النصّ أعلاه بالضبط.
    //
    // كانت الثلاثة تُنادى بلا وسائط فتُهمل `p` وهي على بُعد أسطر، فيهبط كلُّ
    // ملفٍّ مستورَدٍ في **وسط اللوحة** مهما نُقر. وأثرُه يظهر عند أوّل بوستٍ يحمل
    // أكثر من صورة: ثلاث صورٍ مكدّسةٍ في المنتصف لا تُفرَّق إلا بكتابة أربعة
    // أرقامٍ لكلّ واحدة في لوح التحويل. والقدرة مبنيّةٌ أصلًا — السحب والإفلات
    // يمرّر نقطته منذ البداية — فالنقص كان في التمرير لا في النموذج.
    //
    // والثلاثةُ تُمرّر `keepSelection` كالموضعَين أعلاه: ارتدادٌ بعد إنشاء، لا
    // تسليح. وهي **آخرُ ثلاثةٍ من خمسة**، وليس في البرنامج سادسٌ — شُرِط ذلك
    // بجردِ كلّ نداءٍ لـ`setTool`/`openToolLibrary` في `src/`.
    if (state.tool === 'image') {
      actions.insertImageTool({ x: p.x, y: p.y }).then(() => actions.setTool('select', { keepSelection: true }));
    }
    if (state.tool === 'lottie') {
      actions.insertLottieTool({ x: p.x, y: p.y }).then(() => actions.setTool('select', { keepSelection: true }));
    }
    if (state.tool === 'video') {
      actions.insertVideoTool({ x: p.x, y: p.y }).then(() => actions.setTool('select', { keepSelection: true }));
    }
  };

  /** الزرّ الأيمن: على عنصرٍ يحدّده (إن لم يكن محدَّدًا) ويفتح قائمة أوامره، وعلى الفراغ
   * يفتح «لصق / حدّد الكل». وحقلُ النصّ قيد التحرير يأخذ قائمته الأصليّة (قص/نسخ/لصق
   * النصّ نفسه)، وأدوات الواجهة الطافية لا قائمة لها. */
  const onStageContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    // ماك يحدّد الكلمة تحت المؤشّر **قبل** حدث القائمة؛ فما حُدِّد هنا يُمسَح.
    window.getSelection()?.removeAllRanges();
    const target = e.target as HTMLElement;
    if (target.closest('[data-stage-overlay]')) return;
    const id = target.closest('[data-el-id]')?.getAttribute('data-el-id');
    const hit = id ? state.elements.find((x) => x.id === id) : undefined;
    if (hit && !hit.locked) {
      if (!state.selectedIds.includes(hit.id)) actions.selectMany([hit.id]);
      setStageMenu({ x: e.clientX, y: e.clientY, onElement: true });
      return;
    }
    // منطقةُ مقبضٍ تخصّ التحديد القائم — فالقائمة له.
    if (target.closest('[data-handle]') && state.selectedIds.length) {
      setStageMenu({ x: e.clientX, y: e.clientY, onElement: true });
      return;
    }
    setStageMenu({ x: e.clientX, y: e.clientY, onElement: false });
  };

  const onBackgroundDoubleClick = () => {
    if (state.tool === 'pen' && state.penDraft.length >= 2) {
      actions.penFinish();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.tool === 'pen' && state.penDraft.length) actions.penCancel();
      if (e.key === 'Enter' && state.tool === 'pen' && state.penDraft.length >= 2 && !isEditableTarget(e.target)) actions.penFinish();
      // Escape يخرج من وضع تحرير العقد (كما يخرج من تحرير النص/القصّ)، لا يحذف شيئًا.
      if (e.key === 'Escape' && state.nodeEditId && !state.penDraft.length) actions.endNodeEdit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.tool, state.penDraft.length, state.nodeEditId, actions]);

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const rect = viewportRef.current!.getBoundingClientRect();
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const center = { x: rect.width / 2, y: rect.height / 2 };
    const oldScale = scale;
    const newZoom = clamp(state.zoom - e.deltaY * 0.4, 10, 400);
    const newScale = baseFit * (newZoom / 100);
    const offsetFromCenter = { x: cursor.x - center.x, y: cursor.y - center.y };
    const docUnderCursor = { x: (offsetFromCenter.x - state.panX) / oldScale, y: (offsetFromCenter.y - state.panY) / oldScale };
    const newPanX = offsetFromCenter.x - docUnderCursor.x * newScale;
    const newPanY = offsetFromCenter.y - docUnderCursor.y * newScale;
    actions.setZoom(newZoom);
    actions.setPan(newPanX, newPanY);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find((f) => f.type.startsWith('image/'));
    const lottieFile = files.find((f) => /\.(json|lottie)$/i.test(f.name));
    const videoFile = files.find((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name));
    // ملفُّ صوت: طبقةُ صوتٍ عند المؤشّر — لا موضعَ له على اللوحة، فنقطةُ الإفلات لا تعنيه.
    const audioFile = files.find((f) => isAudioFile(f));
    if (audioFile && !imageFile && !lottieFile && !videoFile) {
      void actions.insertAudioFromFile(audioFile);
      return;
    }
    if (!imageFile && !lottieFile && !videoFile) return;
    const rect = artboardRef.current!.getBoundingClientRect();
    const p = docPointFromClient(e.clientX, e.clientY, rect, scale);
    if (imageFile) actions.insertImageFromFile(imageFile, p);
    else if (lottieFile) actions.insertLottieFromFile(lottieFile, p);
    else if (videoFile) actions.insertVideoFromFile(videoFile, p);
  };

  const abStyle: CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: size.w,
    height: size.h,
    transform: `translate(-50%, -50%) translate(${state.panX}px, ${state.panY}px) scale(${scale})`,
    transformOrigin: '50% 50%',
    background: pal.bg,
    color: pal.fg,
    // **حدٌّ شعريّ يبيّن حافّة اللوحة على المسرح الداكن.** الظلّ وحده لا يُرى على خلفيّةٍ
    // داكنة، ولوحات الألوان الافتراضيّة خلفيّتها داكنة — فمستندٌ فارغ كان لوحًا أسود على
    // مسرحٍ أسود لا يُعرَف أين يبدأ (جولة الاستخدام: «ابدأ من فراغ»). والسُّمك مقسومٌ على
    // `scale` ليبقى بكسلًا واحدًا على الشاشة داخل تحويل الزوم، كالمقابض.
    boxShadow: `0 0 0 ${1 / scale}px var(--lineStrong), 0 24px 60px rgba(0,0,0,.45)`,
    // `clip` لا `hidden`: الصندوق المخفيّ الفائض **قابلٌ للتمرير** برمجيًّا، فكان تركيزُ
    // عنصرٍ يتجاوز حافّة اللوح (أو `scrollIntoView`) يُزيح المحتوى كلّه عن خلفيّته —
    // قيسَ: نقرةٌ على «نص الشارة» عند ١٢٨٠×٧٢٠ جعلت `scrollLeft` = ١٤٧. `clip` يقصّ
    // بلا تمريرٍ أصلًا.
    overflow: 'clip',
    containerType: 'inline-size',
    // اللوحة سطحُ تصميمٍ لا صفحةُ نصّ: لا تحديدَ متصفّحٍ أزرق على حروفها ولا على صورها حين
    // يُسحَب فوقها أو يُضغَط بالزرّ الأيمن. والبادئة لأن WebKit لا يقرأ `user-select` بلا
    // `-webkit-`. النصّ قيد التحرير يستعيد التحديد لنفسه (`ElementView`).
    userSelect: 'none',
    WebkitUserSelect: 'none',
    fontFamily: 'Alexandria, sans-serif',
    cursor: spaceDown ? 'grab' : 'default',
  };

  // Every element carries its own real animation clip (start/duration/keyframes/
  // easing) edited in the pro-mode timeline — entrance styling is just that clip's
  // progress at the current playhead time, mapped through its visual preset.
  //
  // والضبابيّةُ الساكنةُ `el.blur` تُمرَّر معها لأنها الطرفُ الآخرُ من صيغةٍ واحدة
  // (`effectiveBlur` في `animTimeline.ts`): العنصرُ يَحمل نصفَ القطر الأساس،
  // والمسارُ يَحمل فرقَه عند هذه اللحظة، ولا يجوز أن يَجمعهما أحدٌ غيرُ ذلك الموضع.
  const entranceByTool: Record<string, { opacity?: number; transform?: string; filter?: string }> = {};
  for (const el of state.elements) entranceByTool[el.id] = entranceStyleAt(el.anim, t, el.blur ?? 0);

  const hintKey = HINT_KEYS[state.tool];
  const selected = state.selectedIds;
  const soleSelected = selected.length === 1 ? state.elements.find((e) => e.id === selected[0]) : undefined;
  /** العنصر الذي تُرسم مقابضُه — وخطُّ تحديده معها في طبقة المقابض (انظرها أدناه). */
  // والصوتُ لا صندوقَ له على اللوحة: لا مقابض ولا خطَّ تحديد — يُحدَّد ويُحرَّر من صفّه.
  const handlesFor = soleSelected && soleSelected.type !== 'audio' && !state.editingTextId && state.cropEditingId !== soleSelected.id && state.nodeEditId !== soleSelected.id ? soleSelected : undefined;
  const handlesLayerStyle: CSSProperties = {
    position: 'absolute',
    left: abStyle.left,
    top: abStyle.top,
    width: abStyle.width,
    height: abStyle.height,
    transform: abStyle.transform,
    transformOrigin: abStyle.transformOrigin,
    pointerEvents: 'none',
  };

  const showContextBar = selected.length > 0 && state.elements.some((e) => selected.includes(e.id) && e.type !== 'audio') && !state.pendingEditSnapshot && !shapeDraft && !state.penDraft.length && (state.tool === 'select' || state.tool === 'direct');

  // المسودّة كشكل مسار كامل الهيئة، بإحداثيات المستند (لا كسور صندوق) — فالمعاينة
  // تمرّ بنفس مُصيِّر الهندسة الذي سيرسم العنصر النهائي بعد `penFinish`.
  const penDraftShape = {
    points: state.penDraft.map((p) => ({ x: p.x, y: p.y })),
    closed: false,
    handles: state.penDraft.map((p) => (p.h ? { out: p.h, in: { x: -p.h.x, y: -p.h.y } } : null)),
  };

  const nodeEditEl = state.nodeEditId
    ? (state.elements.find((e) => e.id === state.nodeEditId && e.type === 'shape' && e.shape === 'path' && (e.points?.length ?? 0) >= 2) as (DocElement & { type: 'shape' }) | undefined)
    : undefined;

  const onNodeDown = (e: ReactPointerEvent<SVGElement>, index: number, part: 'anchor' | 'in' | 'out') => {
    e.stopPropagation();
    if (!nodeEditEl) return;
    actions.selectPathNode(index, part);
    actions.beginElementEdit();
    const rect = artboardRef.current!.getBoundingClientRect();
    const start = docPointFromClient(e.clientX, e.clientY, rect, scale);
    startDrag({
      kind: part === 'anchor' ? 'node-anchor' : 'node-handle',
      startDocX: start.x,
      startDocY: start.y,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      elementId: nodeEditEl.id,
      nodeIndex: index,
      nodePart: part,
    });
  };

  /** نقرة مزدوجة على مقطع = أضف نقطة ربط عنده. مزدوجة لا مفردة: نقرة واحدة على
   * المقطع إيماءة شائعة جدًا بالخطأ أثناء محاولة انتقاء نقطة مجاورة. */
  const onSegmentDoubleClick = (e: React.MouseEvent<SVGPathElement>, segIndex: number, t: number) => {
    e.stopPropagation();
    if (!nodeEditEl) return;
    actions.insertPathPoint(nodeEditEl.id, segIndex, t);
  };

  return (
    <div
      ref={viewportRef}
      onPointerDown={onBackgroundPointerDown}
      onDoubleClick={onBackgroundDoubleClick}
      onContextMenu={onStageContextMenu}
      onWheel={onWheel}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        padding: '54px 24px 72px',
        cursor: spaceDown ? 'grab' : CURSOR_BY_TOOL[state.tool] || 'default',
      }}
      className="mz-stage"
    >
      {/* صفّ اللوحة العلويّ: المقاس واللوحات على البداية، والشريط السياقي للمحدَّد على
          النهاية. الصفّ نفسه لا يلتقط النقرات (فراغه لوحة)، وأزراره تلتقطها. */}
      <div data-stage-overlay style={{ position: 'absolute', top: 12, insetInlineStart: 12, insetInlineEnd: 12, zIndex: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto', flex: 'none' }}>
          <ArtboardSizeMenu />
          <ArtboardsChip />
        </div>
        {/* هامشٌ تلقائيّ لا فاصلٌ مرن: إن ضاق المسرح (لوح الإضافة مفتوح) نزل الشريط سطرًا
            وبقي على النهاية، بدل أن يخرج من حافّة اللوحة. */}
        {showContextBar && (
          <div style={{ marginInlineStart: 'auto', display: 'flex', pointerEvents: 'none' }}>
            <ContextBar />
          </div>
        )}
      </div>
      {/* الصوتُ يُسمَع حيث تُرى اللوحة — طبقاتُ الصوت وصوتُ الفيديو، مزامَنةً مع المؤشّر. */}
      <AudioPlayback />

      {/* أبعاد المستند الحقيقية بالبكسل، لا أبعاده على الشاشة: `abStyle` يحمل
          مقاسًا مضروبًا في `zoom`، فقياس العنصر من الشاشة لا يخبر بمقاس المستند.
          وهذه هي الأرقام التي يُصدِّرها التصدير فعلًا. */}
      <div ref={artboardRef} data-testid="artboard" data-doc-w={size.w} data-doc-h={size.h} data-doc-medium={size.kind} dir="ltr" style={abStyle}>
        {/* زخرفة اللوحة — مشروطةٌ بحقل المستند `decorAccent`، وهو نفس الشرط حرفيًّا
            في `exportArtboard.ts` بمسارَيه (وإلا اختلفت المعاينة عن الملف
            المصدَّر، وهو عطلٌ سبق أن وقع هنا بعينه). كان الشرط عدد العناصر، فكانت
            الدائرة تُفرَض على كل مستندٍ فيه شيء: لا تُحدَّد ولا تُحذَف ولا يُسأل
            عنها أحد — انظر `DocSnapshot.decorAccent`. */}
        {state.decorAccent && (
          /* `left` صريحة لا `insetInlineStart`: الخاصّية المنطقيّة تُحلّ حسب اتجاه
             الكتابة، وهندسةُ المستند ليست نصًّا — والتصدير لا يعرف اتجاهًا أصلًا.
             وبـ`insetInlineStart: '-14%'` كانت الزخرفة تهبط في الزاوية **اليسرى**
             من المعاينة (مركزها عند س=٩٧ من ١٠٨٠) بينما يرسمها التصدير في
             **اليمنى** (س=٩٨٣) — صورتان متعاكستان للمستند نفسه، لا ينكشف فرقهما
             إلا عند أوّل تصدير، بعد أن يكون المصمم قد أنهى تنسيقه حول الموضع
             الخطأ. والقيم هنا هي معادلة `renderArtboardCanvas`/`renderArtboardSvg`
             نفسها: مركزٌ عند 0.68w + (0.46w)/2 = 0.91w، وأعلى عند ‑0.16h. */
          <div style={{ position: 'absolute', left: '68%', top: '-16%', width: '46%', aspectRatio: '1', borderRadius: '50%', background: pal.ac, pointerEvents: 'none' }} />
        )}

        {/* العنصرُ المحدودُ بمقطعه لا يُرسَم خارجه — `clipShowsAt` نفسُها التي يقرؤها
            التصدير. والمراجعُ (القناعُ والمسارُ) تُطلَب من `state.elements` كلِّها
            لا من هذه القائمة، فقناعٌ خارج مقطعه يبقى قناعًا. */}
        {state.elements.filter((el) => clipShowsAt(el.anim, t)).map((el: DocElement) => (
          <ElementView
            key={el.id}
            el={el}
            pal={pal}
            lang={lang}
            // خطّ تحديد العنصر ذي المقابض يُرسم في طبقة المقابض (فلا تقصّه حافّة الصفحة)،
            // فلا يُرسم هنا مرّةً ثانية. وما سواه — التحديد المتعدّد، والنصّ قيد التحرير،
            // والقصّ، والعقد — على خطّه كما كان.
            selected={selected.includes(el.id) && el.id !== handlesFor?.id}
            editing={state.editingTextId === el.id}
            croppingActive={state.cropEditingId === el.id}
            size={size}
            scale={scale}
            maskShape={el.maskId ? (state.elements.find((m) => m.id === el.maskId && m.type === 'shape') as (DocElement & { type: 'shape' }) | undefined) ?? null : null}
            pathShape={
              el.type === 'text' && el.pathId
                ? (state.elements.find((m) => m.id === el.pathId && m.type === 'shape') as (DocElement & { type: 'shape' }) | undefined) ?? null
                : null
            }
            entranceOpacity={entranceByTool[el.id]?.opacity}
            entranceTransform={entranceByTool[el.id]?.transform}
            entranceFilter={entranceByTool[el.id]?.filter}
            time={t}
            onPointerDown={onElementPointerDown}
            onDoubleClick={onDoubleClickElement}
            onTextBlur={(id, text) => actions.commitTextEdit(id, text)}
            onTextKeyDown={onTextKeyDown}
            editRef={(node) => {
              editRef.current = node;
            }}
          />
        ))}

        <GuideLines guides={guides} size={size} />

        {shapeDraft && <ShapeDraftPreview draft={shapeDraft} kind={state.shapeDrawKind} n={state.shapeDrawN} size={size} />}

        {state.tool === 'pen' && state.penDraft.length > 0 && (
          <svg viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            {/* معاينة المسودّة تُرسَم بنفس `pathElementCommands` التي ستُصيِّر العنصر
                النهائي، لا بـ`<polyline>` منفصل — وإلا فالمنحنى الذي يسحبه المصمم
                يظهر مستقيمًا حتى لحظة Enter، وهو ما كان يحدث فعلًا. */}
            <path d={commandsToSvgPath(pathElementCommands(penDraftShape).cmds, 1, 1)} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {state.penDraft.map((p, i) =>
              p.h ? (
                <g key={`h${i}`}>
                  <line x1={p.x - p.h.x} y1={p.y - p.h.y} x2={p.x + p.h.x} y2={p.y + p.h.y} stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.7} />
                  <circle cx={p.x + p.h.x} cy={p.y + p.h.y} r={3} fill="var(--accent)" />
                  <circle cx={p.x - p.h.x} cy={p.y - p.h.y} r={3} fill="var(--accent)" />
                </g>
              ) : null,
            )}
            {state.penDraft.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill={i === 0 ? 'var(--accent)' : '#fff'} stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        )}

        {nodeEditEl && <NodeEditOverlay el={nodeEditEl} size={size} sel={state.nodeEditSel} onNodeDown={onNodeDown} onSegmentDoubleClick={onSegmentDoubleClick} />}
      </div>

      {/* **طبقةُ المقابض — شقيقةُ اللوحة لا ابنتُها.** اللوحة تقصّ ما يفيض عنها
          (`overflow: clip`) كما تقصّ الأداة الشائعة ما يخرج من الصفحة، لكنّ المقابض وخطّ التحديد
          أداةُ مسكٍ لا محتوى: نصٌّ كبّرته زاويته حتى تجاوز حافّة الصفحة كانت مقابضه البعيدة
          تُقَصّ معه، فلا تُرى ولا تُمسَك (جولة المسك على البرنامج المثبّت، ٢٤ أكتوبر ٢٠٢٦).
          والطبقة بتحويل اللوحة نفسه ومقاسها، فالمواضع بالنسب المئويّة كما كانت، ولا تلتقط
          النقر إلا مقابضها.

          ومقابض الصندوق (تحجيم/تدوير) تختفي في وضع تحرير العقد: مقابضها تتقاطع بصريًا مع
          نقاط الربط عند حوافّ المسار، فينقر المصمم على التحجيم وهو يقصد النقطة. و`scale`/
          `size` يمرّان لأن المقابض تُرسم بحجم شاشة ثابت بدل أن تتقلّص داخل تحويل الزوم
          (كانت ٣.٧٦ بكسل عند الزوم الافتراضي). */}
      <div data-testid="handles-layer" dir="ltr" style={handlesLayerStyle}>
        {handlesFor && (
          <Handles
            geo={handlesFor.geo}
            scale={scale}
            size={size}
            onHandleDown={onHandleDown}
            onDoubleClick={(e) => onDoubleClickElement(e, handlesFor.id)}
            handles={canvaTextGrip && handlesFor.type === 'text' ? CANVA_TEXT_HANDLES : undefined}
          />
        )}
      </div>

      {/* تلميح الأداة فوق حبّة الأدوات لا أعلى اللوحة: أعلاها صفّ المقاس واللوحات،
          وكان التلميح المتمركز يغطّي زرّ المقاس كلّما ضاق المسرح (لوح الإضافة مفتوح).
          ولا يلتقط النقرات أبدًا — تلميحٌ لا زرّ. */}
      {hintKey && !state.penDraft.length && (
        <div
          data-testid="tool-hint"
          style={{
            position: 'absolute',
            bottom: 70,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 3,
            padding: '6px 12px',
            borderRadius: 999,
            background: 'var(--float)',
            border: '1px solid var(--lineStrong)',
            color: 'var(--muted)',
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            maxWidth: 'calc(100% - 32px)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {L[hintKey as keyof typeof L] as string}
        </div>
      )}

      {/* حُذِفت القائمة العائمة ذات الخيارين (مستطيل/دائرة) التي كانت هنا مشروطةً
          بـ`state.mode === 'pro'`. كانت **مُبدِّل وضع**، والمطلوب **مكتبة
          تُستعرَض**: الأشكال محتوًى يُتصفَّح لا وضعٌ يُدخَل فيه، ولهذا انتقل
          اختيار النوع إلى لوح «العناصر» (`ShapesLibrary.tsx`) حيث يراه الوضع
          البسيط أيضًا. والنوع المسلَّح يظهر في اللوح ببطاقته المُبرَزة. */}

      <ToolPill />
      {stageMenu && <StageMenu x={stageMenu.x} y={stageMenu.y} onElement={stageMenu.onElement} onClose={closeStageMenu} />}
    </div>
  );
}

/** معاينة الشكل الجاري رسمه.
 *
 * تُرسَم بـ`shapeGeometryFor` + `commandsToSvgPath` — **نفس الدالّتين** التي ستبني
 * العنصر النهائي ــ لا بصندوق مزخرف بـ`borderRadius`. وهذا هو السبب نفسه الذي
 * جعل معاينة مسودّة القلم تُرسَم بـ`pathElementCommands` (انظر التعليق في فرع
 * القلم أعلاه): معاينة بهندسة مستقلّة تكذب. القائم قبل هذا كان `div` بحدٍّ مُنقَّط
 * و`borderRadius: '50%'` للدائرة — فمثلّث أو نجمة كانا سيُعاينان مستطيلًا ثم
 * يهبطان شيئًا آخر. */
function ShapeDraftPreview({ draft, kind, n, size }: { draft: ShapeDraft; kind: ShapeDrawKind; n: number; size: { w: number; h: number } }) {
  const g = shapeGeometryFor({ kind, n }, { flipX: !!draft.flipX, flipY: !!draft.flipY });
  const style: CSSProperties = {
    position: 'absolute',
    left: `${(draft.x / size.w) * 100}%`,
    top: `${(draft.y / size.h) * 100}%`,
    width: `${(draft.w / size.w) * 100}%`,
    height: `${(draft.h / size.h) * 100}%`,
    pointerEvents: 'none',
  };
  if (g.shape !== 'path') {
    // نصفُ القطر من أقصر الضلعين كما يرسمه العنصر النهائي والتصدير — لا نسبةٌ من كلّ ضلع
    // (تلك تُعاين المستطيلَ المدوَّر بيضاويًّا). انظر فرع الشكل في `ElementView.tsx`.
    const radiusCqw = g.radius ? ((g.radius * Math.min(draft.w, draft.h)) / size.w) * 100 : 0;
    return <div style={{ ...style, border: '1.5px dashed var(--accent)', background: 'var(--accentSoft)', borderRadius: g.shape === 'ellipse' ? '50%' : `${radiusCqw.toFixed(3)}cqw` }} />;
  }
  const cmds = pathElementCommands({ points: g.points, closed: g.closed });
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ ...style, overflow: 'visible' }}>
      <path
        d={commandsToSvgPath(cmds.cmds, 100, 100)}
        fill={g.closed ? 'var(--accentSoft)' : 'none'}
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Roadmap #11 (تكملة) — طبقة تحرير العقد فوق اللوحة: نقاط الربط كأهداف سحب حقيقية،
 * ومقابض النقطة المحدَّدة وحدها (كما في أداة متّجهات — عرض مقابض المسار كله معًا يُغرق
 * مسارًا بعشر نقاط بعشرين مقبضًا متشابكًا)، وكل مقطع كهدف نقرة مزدوجة لإدراج نقطة.
 *
 * المقاطع تُرسَم من `fitSmoothPath` لا من النقاط مباشرة، فتنطبق حرفيًا على ما يرسمه
 * `ElementView` — مصدر الهندسة واحد، فلا يمكن أن يختلف هدف النقر عن الخط المرئي. */
function NodeEditOverlay({
  el,
  size,
  sel,
  onNodeDown,
  onSegmentDoubleClick,
}: {
  el: DocElement & { type: 'shape' };
  size: { w: number; h: number };
  sel: { index: number; part: 'anchor' | 'in' | 'out' } | null;
  onNodeDown: (e: ReactPointerEvent<SVGElement>, index: number, part: 'anchor' | 'in' | 'out') => void;
  onSegmentDoubleClick: (e: React.MouseEvent<SVGPathElement>, segIndex: number, t: number) => void;
}) {
  const box = geoToPx(el.geo, size);
  const points = el.points ?? [];
  const segs = fitSmoothPath(points, !!el.closed, el.smoothAmount ?? 0, el.cornerPoints, el.handles);
  // كسور الصندوق -> بكسلات المستند، مع احتساب دوران العنصر، فالمقابض تتبع الشكل
  // المُدوَّر بدل أن تطفو بجانبه.
  const toDoc = (p: { x: number; y: number }) => {
    const localPx = { x: p.x * box.w, y: p.y * box.h };
    const c = centerOf(box);
    const rotated = rotatePoint({ x: box.x + localPx.x, y: box.y + localPx.y }, c, box.rotation);
    return rotated;
  };
  const selIdx = sel?.index ?? -1;
  const selPoint = points[selIdx];
  const effIn = selPoint ? (el.handles?.[selIdx]?.in ?? null) : null;
  const effOut = selPoint ? (el.handles?.[selIdx]?.out ?? null) : null;

  return (
    <svg
      viewBox={`0 0 ${size.w} ${size.h}`}
      preserveAspectRatio="none"
      data-testid={`node-edit-${el.id}`}
      // جذر `<svg>` مضمَّن في HTML عنصر مستبدل يستقبل أحداث المؤشّر على كامل صندوقه،
      // فلو تُرك على `auto` لغطّى اللوحة كلها بطبقة تبتلع كل نقرة (لا تحديد عنصر آخر،
      // ولا نقرة على الخلفية) طوال وضع تحرير العقد. نُعطّله هنا ونُعيد تمكينه على
      // أهداف السحب وحدها — نفس ما تفعله معاينة مسودّة القلم أعلى هذا الملف.
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
    >
      {segs.map((seg, i) => {
        const p0 = toDoc(seg.p0);
        const c1 = toDoc(seg.c1);
        const c2 = toDoc(seg.c2);
        const p1 = toDoc(seg.p1);
        return (
          <path
            key={`seg${i}`}
            data-testid={`node-seg-${el.id}-${i}`}
            d={`M${p0.x} ${p0.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p1.x} ${p1.y}`}
            fill="none"
            stroke="transparent"
            strokeWidth={14 / Math.max(1, size.w / 1080)}
            style={{ pointerEvents: 'stroke', cursor: 'copy' }}
            onDoubleClick={(e) => {
              // `closestTOnSegment` على المقطع في فضائه المحلي (الكسري) بعد تحويل
              // نقطة المؤشّر إليه — فالمعامل `t` الناتج هو نفسه الذي سيقسم به
              // `insertAnchorOnSegment` المنحنى، بلا أي تحويل وسيط يُدخل انحرافًا.
              const svg = e.currentTarget.ownerSVGElement!;
              const pt = svg.createSVGPoint();
              pt.x = e.clientX;
              pt.y = e.clientY;
              const docPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
              const c = centerOf(box);
              const unrot = rotatePoint({ x: docPt.x, y: docPt.y }, c, -box.rotation);
              const local = { x: (unrot.x - box.x) / box.w, y: (unrot.y - box.y) / box.h };
              onSegmentDoubleClick(e, i, closestTOnSegment(seg, local));
            }}
          />
        );
      })}

      {selPoint && (
        <g>
          {effIn && (
            <>
              <line {...lineProps(toDoc(selPoint), toDoc({ x: selPoint.x + effIn.x, y: selPoint.y + effIn.y }))} stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <circle
                data-testid={`node-handle-${el.id}-${selIdx}-in`}
                {...circleAt(toDoc({ x: selPoint.x + effIn.x, y: selPoint.y + effIn.y }), 4.5)}
                fill="var(--accent)"
                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                onPointerDown={(e) => onNodeDown(e, selIdx, 'in')}
              />
            </>
          )}
          {effOut && (
            <>
              <line {...lineProps(toDoc(selPoint), toDoc({ x: selPoint.x + effOut.x, y: selPoint.y + effOut.y }))} stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <circle
                data-testid={`node-handle-${el.id}-${selIdx}-out`}
                {...circleAt(toDoc({ x: selPoint.x + effOut.x, y: selPoint.y + effOut.y }), 4.5)}
                fill="var(--accent)"
                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                onPointerDown={(e) => onNodeDown(e, selIdx, 'out')}
              />
            </>
          )}
          {/* نقطة بلا مقابض صريحة: نعرض هدفَي سحب مبدئيَّين على بعد ثابت من النقطة،
              وإلا فلا سبيل لسحب أول مقبض إطلاقًا (لا شيء مرئي لتسحبه). */}
          {!effIn && !effOut && <NascentHandles anchor={selPoint} index={selIdx} elId={el.id} toDoc={toDoc} onNodeDown={onNodeDown} />}
        </g>
      )}

      {points.map((p, i) => {
        const d = toDoc(p);
        const isSel = i === selIdx;
        const isCorner = !!el.cornerPoints?.[i];
        return isCorner ? (
          <rect
            key={`a${i}`}
            data-testid={`node-anchor-${el.id}-${i}`}
            x={d.x - 5}
            y={d.y - 5}
            width={10}
            height={10}
            fill={isSel ? 'var(--accent)' : '#fff'}
            stroke="var(--accent)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'move', pointerEvents: 'auto' }}
            onPointerDown={(e) => onNodeDown(e, i, 'anchor')}
          />
        ) : (
          <circle
            key={`a${i}`}
            data-testid={`node-anchor-${el.id}-${i}`}
            cx={d.x}
            cy={d.y}
            r={5.5}
            fill={isSel ? 'var(--accent)' : '#fff'}
            stroke="var(--accent)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'move', pointerEvents: 'auto' }}
            onPointerDown={(e) => onNodeDown(e, i, 'anchor')}
          />
        );
      })}
    </svg>
  );
}

function lineProps(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}
function circleAt(p: { x: number; y: number }, r: number) {
  return { cx: p.x, cy: p.y, r };
}

/** مقابض «جاهزة للسحب» لنقطة لا تملك مقابض صريحة بعد — إزاحة ثابتة 8% من الصندوق
 * أفقيًا، كافية لتكون هدفًا ملموسًا دون أن تُلامس الجارة في مسار ضيّق. */
function NascentHandles({
  anchor,
  index,
  elId,
  toDoc,
  onNodeDown,
}: {
  anchor: { x: number; y: number };
  index: number;
  elId: string;
  toDoc: (p: { x: number; y: number }) => { x: number; y: number };
  onNodeDown: (e: ReactPointerEvent<SVGElement>, index: number, part: 'anchor' | 'in' | 'out') => void;
}) {
  const off = 0.08;
  const out = toDoc({ x: anchor.x + off, y: anchor.y });
  const inn = toDoc({ x: anchor.x - off, y: anchor.y });
  return (
    <>
      <line {...lineProps(toDoc(anchor), out)} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity={0.55} />
      <line {...lineProps(toDoc(anchor), inn)} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity={0.55} />
      <circle data-testid={`node-handle-${elId}-${index}-out`} {...circleAt(out, 4.5)} fill="#fff" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab', pointerEvents: 'auto' }} onPointerDown={(e) => onNodeDown(e, index, 'out')} />
      <circle data-testid={`node-handle-${elId}-${index}-in`} {...circleAt(inn, 4.5)} fill="#fff" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab', pointerEvents: 'auto' }} onPointerDown={(e) => onNodeDown(e, index, 'in')} />
    </>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

