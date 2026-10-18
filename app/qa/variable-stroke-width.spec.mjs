#!/usr/bin/env node
// حدٌّ متغيّر السُّمك: خطٌّ يدخل سميكًا ويخرج شعرة.
//
// لا SVG ولا Canvas2D يملك `stroke-width` متغيّرًا، فالحدُّ متى حمل مَلمحًا صار
// **مضلَّعًا معبَّأً** تبنيه `variableStrokeOutlineCmds`. ولهذا كان الخطّ الأحمر
// في هدف المحاكاة `t02-kashida` ثلاثةَ مساراتٍ بسُمك ٢٢/١٣/٧ ووصلاتها
// تُرى — وهو ما سمّاه المالك «ما يزال يُقرأ أنه ليس الأصل».
//
// النطاق:
// (١) الدوالّ الخالصة من **الوحدة الحقيقيّة** لا بإعادة تنفيذ: `widthFactorAt`
//     (تقويمٌ خطّيّ + تثبيتٌ خارج الطرفين)، `splitStrokesByWidthKind` (الفرز
//     الذي تتشارك فيه الرسّامات الثلاث)، و`variableStrokeOutlineCmds` (حلقةٌ
//     مغلقة، سُمكٌ مقيسٌ عند الطرفين، تساوي الاتّجاهين على صندوقٍ غير مربّع،
//     ومدخلاتٌ منحلّة لا تُسقط الرسم).
// (٢) **المُنقِّط والمُسلسِل يتطابقان**: `renderArtboardPng` و`renderArtboardSvg`
//     على العنصر نفسه، مقيسَين بالبكسل بعد تنقيط الـSVG في المتصفّح نفسه —
//     وهذا صنفُ العطل الذي حاربه هذا المستودع ثلاث مرّات، فلا يُترك لِلحظّ.
// (٣) غيابُ المَلمح يُصيَّر **مطابقًا بالبكسل** لما قبل هذه الميزة: كلُّ مستندٍ
//     محفوظٍ لا يحمل الحقل أصلًا، فهذا عقد «ترحيل بلا فقد».
// (٤) الواجهة الحقيقيّة بأحداثٍ حقيقيّة: رسمُ مسارٍ بالقلم، ثم ضبطُ القائمة
//     المنسدلة، ثم قياسُ `d` المُصيَّر فعلًا — وخطوةُ تراجعٍ واحدة، وبقاءٌ بعد
//     إعادة تحميلٍ حقيقيّة.
// (٥) «التحجيم الذكي» لا يُفسد المَلمح: المعاملُ بلا بُعد فالتدرّج ثابتٌ تحت
//     أيّ مقاس — وهذا ما يجعل الحقل معاملًا لا بكسلات.
//
// التشغيل: node qa/variable-stroke-width.spec.mjs   (خادم التطوير يعمل على :1420)
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';
import { bootBlank, AUTOSAVE_KEY } from './helpers/boot.mjs';

const BASE_URL = process.env.QA_BASE_URL || process.env.MAZIJ_URL || 'http://localhost:1420';

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  ok   ${msg}`);
  } else {
    fail++;
    console.log(`  FAIL ${msg}`);
  }
}

// --- 1. الدوالّ الخالصة من الوحدة الحقيقيّة --------------------------------------
async function testPureGeometry(page) {
  console.log('\n1. الدوالّ الخالصة — الوحدة الحقيقيّة لا إعادة تنفيذ');
  const r = await page.evaluate(async () => {
    const m = await import('/src/lib/variableStroke.ts');

    const taper = { start: 1, mid: null, end: 0 };
    const lens = { start: 0, mid: 1, end: 0 };

    // خطٌّ أفقيّ طوله ٤٠٠ بكسل في منتصف صندوق ٤٠٠×٢٠٠: كسورُه y=0.5.
    const line = [
      { c: 'M', x: 0, y: 0.5 },
      { c: 'L', x: 1, y: 0.5 },
    ];
    const ring = m.variableStrokeOutlineCmds(line, taper, 20, 400, 200);

    // سُمكٌ مقيسٌ من الحلقة نفسها: أقصى |y − 0.5| مضروبًا في ارتفاع الصندوق،
    // عند عمودٍ x قريبٍ من البداية وآخرَ قريبٍ من النهاية.
    const spanAt = (cmds, xFrac, tol) => {
      const ys = cmds.filter((c) => (c.c === 'M' || c.c === 'L') && Math.abs(c.x - xFrac) <= tol).map((c) => c.y);
      if (ys.length < 2) return null;
      return (Math.max(...ys) - Math.min(...ys)) * 200;
    };

    const nonSquare = m.variableStrokeOutlineCmds(line, { start: 1, mid: null, end: 1 }, 20, 400, 200);
    // نفس الخطّ رأسيًّا في الصندوق نفسه: لو كانت الإزاحة في فضاء الكسور لكان
    // السُّمكان مختلفين بنسبة ٤٠٠/٢٠٠ = ٢.
    const vline = [
      { c: 'M', x: 0.5, y: 0 },
      { c: 'L', x: 0.5, y: 1 },
    ];
    const vRing = m.variableStrokeOutlineCmds(vline, { start: 1, mid: null, end: 1 }, 20, 400, 200);
    const vXs = vRing.filter((c) => c.c === 'M' || c.c === 'L').map((c) => c.x);
    const vThickness = (Math.max(...vXs) - Math.min(...vXs)) * 400;
    const hYs = nonSquare.filter((c) => c.c === 'M' || c.c === 'L').map((c) => c.y);
    const hThickness = (Math.max(...hYs) - Math.min(...hYs)) * 200;

    return {
      // widthFactorAt
      atStart: m.widthFactorAt(taper, 0),
      atEnd: m.widthFactorAt(taper, 1),
      atMid: m.widthFactorAt(taper, 0.5),
      lensAtMid: m.widthFactorAt(lens, 0.5),
      lensAtQuarter: m.widthFactorAt(lens, 0.25),
      clampedBelow: m.widthFactorAt(taper, -5),
      clampedAbove: m.widthFactorAt(taper, 9),
      negativeClamped: m.widthFactorAt({ start: -3, mid: null, end: 1 }, 0),

      // splitStrokesByWidthKind
      split: (() => {
        const a = { id: 'a', width: 4 };
        const b = { id: 'b', width: 4, widthProfile: taper };
        const c = { id: 'c', width: 0, widthProfile: taper };
        const onPath = m.splitStrokesByWidthKind([a, b, c], true);
        const onRect = m.splitStrokesByWidthKind([a, b, c], false);
        return {
          pathUniform: onPath.uniform.map((s) => s.id),
          pathVariable: onPath.variable.map((s) => s.id),
          rectUniform: onRect.uniform.map((s) => s.id),
          rectVariable: onRect.variable.length,
        };
      })(),

      // variableStrokeOutlineCmds
      ringClosed: ring.length > 3 && ring[0].c === 'M' && ring[ring.length - 1].c === 'Z',
      ringHasNoCurves: ring.every((c) => c.c !== 'C'),
      spanNearStart: spanAt(ring, 0.0, 0.004),
      spanNearEnd: spanAt(ring, 1.0, 0.004),
      hThickness,
      vThickness,

      // مدخلاتٌ منحلّة: لا رميَ ولا NaN
      zeroWidth: m.variableStrokeOutlineCmds(line, taper, 0, 400, 200).length,
      emptyCentreline: m.variableStrokeOutlineCmds([], taper, 20, 400, 200).length,
      zeroBox: m.variableStrokeOutlineCmds(line, taper, 20, 0, 200).length,
      // نقطتان متطابقتان: قطعةٌ طولها صفر عموديُّها غير معرَّف — تُحذف لا تُنتج NaN
      duplicatePoints: (() => {
        const cmds = m.variableStrokeOutlineCmds(
          [{ c: 'M', x: 0.2, y: 0.5 }, { c: 'L', x: 0.2, y: 0.5 }, { c: 'L', x: 0.8, y: 0.5 }],
          taper, 20, 400, 200,
        );
        return { count: cmds.length, anyNaN: cmds.some((c) => (c.c === 'M' || c.c === 'L') && (!Number.isFinite(c.x) || !Number.isFinite(c.y))) };
      })(),
      // انعكافٌ تامّ (١٨٠°): حَرَسُ حدّ الميتر يمنع شوكةً تطير إلى اللانهاية
      hairpin: (() => {
        const cmds = m.variableStrokeOutlineCmds(
          [{ c: 'M', x: 0.2, y: 0.5 }, { c: 'L', x: 0.8, y: 0.5 }, { c: 'L', x: 0.2, y: 0.5 }],
          { start: 1, mid: null, end: 1 }, 20, 400, 200,
        );
        const pts = cmds.filter((c) => c.c === 'M' || c.c === 'L');
        return { allFinite: pts.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y)), maxAbsY: Math.max(...pts.map((c) => Math.abs(c.y))) };
      })(),
    };
  });

  assert(r.atStart === 1 && r.atEnd === 0, `widthFactorAt: taper reads 1 at t=0 and 0 at t=1 (got ${r.atStart}, ${r.atEnd})`);
  assert(Math.abs(r.atMid - 0.5) < 1e-9, `widthFactorAt: linear interpolation gives 0.5 halfway along a 1→0 taper (got ${r.atMid})`);
  assert(r.lensAtMid === 1 && Math.abs(r.lensAtQuarter - 0.5) < 1e-9, `widthFactorAt: a 3-point lens profile peaks at t=0.5 and is half-way up at t=0.25 (got ${r.lensAtMid}, ${r.lensAtQuarter})`);
  assert(r.clampedBelow === 1 && r.clampedAbove === 0, `widthFactorAt: clamped (not extrapolated) outside 0..1 — t=-5 gives the start factor, t=9 the end (got ${r.clampedBelow}, ${r.clampedAbove})`);
  assert(r.negativeClamped === 0, `widthFactorAt: a negative factor clamps to 0, never a mirrored/wrong-winding side (got ${r.negativeClamped})`);

  assert(
    r.split.pathUniform.join() === 'a,c' && r.split.pathVariable.join() === 'b',
    `splitStrokesByWidthKind: on a path, only a layer with a profile AND width>0 is variable; a zero-width one stays uniform (uniform=${r.split.pathUniform}, variable=${r.split.pathVariable})`,
  );
  assert(
    r.split.rectUniform.join() === 'a,b,c' && r.split.rectVariable === 0,
    `splitStrokesByWidthKind: on a non-path silhouette a profile is ignored outright — never drawn wrong (uniform=${r.split.rectUniform}, variable=${r.split.rectVariable})`,
  );

  assert(r.ringClosed, 'variableStrokeOutlineCmds: emits one closed ring (starts M, ends Z)');
  assert(r.ringHasNoCurves, 'variableStrokeOutlineCmds: the ring is a polyline — no C commands, so every renderer traces identical geometry');
  assert(r.spanNearStart !== null && Math.abs(r.spanNearStart - 20) < 1.0, `variableStrokeOutlineCmds: the ring is ~20px thick at the wide end of a width-20 taper (got ${r.spanNearStart?.toFixed(2)}px)`);
  assert(r.spanNearEnd !== null && r.spanNearEnd < 2.0, `variableStrokeOutlineCmds: and a hairline at the tapered end (got ${r.spanNearEnd?.toFixed(2)}px)`);
  assert(
    Math.abs(r.hThickness - r.vThickness) < 0.5,
    `variableStrokeOutlineCmds: thickness is isotropic on a 400x200 box — a horizontal and a vertical line of the same stroke measure the same (h=${r.hThickness.toFixed(2)}px, v=${r.vThickness.toFixed(2)}px). Offsetting in fraction space instead would have made them differ by 2x`,
  );

  assert(r.zeroWidth === 0, 'variableStrokeOutlineCmds: width 0 returns no geometry (not a zero-area ring)');
  assert(r.emptyCentreline === 0, 'variableStrokeOutlineCmds: an empty centreline returns no geometry');
  assert(r.zeroBox === 0, 'variableStrokeOutlineCmds: a zero-width box returns no geometry instead of dividing by zero');
  assert(r.duplicatePoints.count > 3 && !r.duplicatePoints.anyNaN, `variableStrokeOutlineCmds: coincident points are deduped — a zero-length segment has no defined normal and would otherwise spread NaN through the whole ring (cmds=${r.duplicatePoints.count}, anyNaN=${r.duplicatePoints.anyNaN})`);
  assert(r.hairpin.allFinite && r.hairpin.maxAbsY < 5, `variableStrokeOutlineCmds: a 180-degree hairpin stays finite and bounded — the miter-limit guard bevels it instead of throwing a spike to infinity (maxAbsY=${r.hairpin.maxAbsY.toFixed(2)})`);
}

// --- 2. المُنقِّط والمُسلسِل يتطابقان -------------------------------------------
async function testRasteriserMatchesSerialiser(page) {
  console.log('\n2. المُنقِّط والمُسلسِل — تطابقٌ بالبكسل لا بالثقة');
  const r = await page.evaluate(async () => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const appearanceMod = await import('/src/lib/appearance.ts');
    const vs = await import('/src/lib/variableStroke.ts');

    const size = { w: 400, h: 200 };
    const palette = { bg: '#000000', fg: '#ffffff', ac: '#ffb703' };
    const anim = { preset: 'none', start: 0, duration: 1, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} };

    // مسارٌ يملأ اللوحة كلّها، فكسورُ العنصر = كسورُ اللوحة.
    const mkEl = (widthProfile) => ({
      id: 'vsx', type: 'shape', visible: true, locked: false, opacity: 100, maskId: null,
      geo: { x: 0, y: 0, w: 1, h: 1, rotation: 0 },
      shape: 'path', fill: 'transparent', fillToken: null, stroke: null, strokeWidth: 0, radius: 0, anim,
      points: [{ x: 0.05, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.95, y: 0.5 }],
      closed: false, smoothAmount: 0,
      appearance: { fills: [], strokes: [appearanceMod.newStrokeLayer({ color: '#ff0000', width: 24, widthProfile })], shadows: [] },
    });

    const rasterise = async (blob) => {
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(size.w, size.h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, size.w, size.h).data;
    };
    // الـSVG لا يُفكّ بـ`createImageBitmap` في أي متصفّح، فيمرّ بـ`Image`
    // ويُرسَم على canvas بنفس المقاس — ثم تُقارَن البكسلات بالبكسلات.
    const rasteriseSvg = async (text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
      const img = new Image();
      img.width = size.w;
      img.height = size.h;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error('svg failed to decode as an image'));
        img.src = url;
      });
      const canvas = new OffscreenCanvas(size.w, size.h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size.w, size.h);
      URL.revokeObjectURL(url);
      return ctx.getImageData(0, 0, size.w, size.h).data;
    };
    // سُمكُ العمود: عددُ البكسلات الحمراء في عمودٍ واحد — قياسٌ مباشر للسُّمك.
    const columnInk = (data, x) => {
      let n = 0;
      for (let y = 0; y < size.h; y++) {
        const i = (y * size.w + x) * 4;
        if (data[i + 3] > 100 && data[i] > 150 && data[i + 1] < 100) n++;
      }
      return n;
    };

    const taper = vs.WIDTH_PROFILE_PRESETS.taperEnd;
    const el = mkEl(taper);

    const pngData = await rasterise(await mod.renderArtboardPng({ size, palette, elements: [el], transparent: true, lang: 'ar', scale: 1 }));
    const svgText = await mod.renderArtboardSvg({ size, palette, elements: [el], transparent: true, lang: 'ar' }).text();
    // تنقيطُ الـSVG في المتصفّح نفسه: مقارنةُ بكسلٍ ببكسل لا مقارنةُ نصٍّ بنص.
    const svgData = await rasteriseSvg(svgText);

    const cols = [30, 100, 200, 300, 370];
    const pngCols = cols.map((x) => columnInk(pngData, x));
    const svgCols = cols.map((x) => columnInk(svgData, x));

    // غيابُ المَلمح: المُسلسِلان على عنصرٍ بلا حقلٍ أصلًا (مستندٌ قبل الميزة).
    const plainEl = mkEl(undefined);
    const plainPng = await rasterise(await mod.renderArtboardPng({ size, palette, elements: [plainEl], transparent: true, lang: 'ar', scale: 1 }));
    const plainSvgText = await mod.renderArtboardSvg({ size, palette, elements: [plainEl], transparent: true, lang: 'ar' }).text();
    const plainCols = cols.map((x) => columnInk(plainPng, x));

    return {
      cols, pngCols, svgCols,
      svgHasFillPath: /<path[^>]*fill="#ff0000"[^>]*fill-rule="nonzero"/.test(svgText),
      svgHasNoStrokeWidth: !/stroke-width="24"/.test(svgText),
      plainCols,
      plainSvgHasStrokeWidth: /stroke-width="24"/.test(plainSvgText),
      plainSvgHasNoNonzeroFillPath: !/fill-rule="nonzero"/.test(plainSvgText),
    };
  });

  const maxDelta = Math.max(...r.pngCols.map((v, i) => Math.abs(v - r.svgCols[i])));
  assert(
    maxDelta <= 2,
    `PNG rasteriser vs SVG serialiser: the same variable-width stroke measures the same thickness in both, column by column (png=[${r.pngCols}], svg=[${r.svgCols}], max delta ${maxDelta}px). Preview/export divergence is the bug class this codebase has fought three times`,
  );
  assert(
    r.pngCols[0] > 20 && r.pngCols[r.pngCols.length - 1] < 4,
    `the stroke really does taper: ~24px of ink at x=${r.cols[0]} down to a hairline at x=${r.cols[r.cols.length - 1]} (got ${r.pngCols[0]}px then ${r.pngCols[r.pngCols.length - 1]}px)`,
  );
  assert(r.svgHasFillPath, 'SVG export: a width profile emits a real <path fill="#ff0000" fill-rule="nonzero"> — the stroke became geometry');
  assert(r.svgHasNoStrokeWidth, 'SVG export: and emits NO stroke-width for that layer, because SVG has no variable stroke width to emit it to');
  assert(
    r.plainCols.every((v) => v > 20 && v < 28),
    `no profile = uniform stroke, unchanged: every column measures ~24px (got [${r.plainCols}]) — the "ترحيل بلا فقد" contract for every document saved before this feature`,
  );
  assert(r.plainSvgHasStrokeWidth && r.plainSvgHasNoNonzeroFillPath, 'no profile = the plain stroke path: SVG emits stroke-width="24" and no outlined fill, byte-for-byte the pre-feature output');
}

// --- 3. الواجهة الحقيقيّة بأحداثٍ حقيقيّة ---------------------------------------
async function testRealUi(page) {
  console.log('\n3. الواجهة الحقيقيّة — قلمٌ وقائمةٌ منسدلة وأحداثٌ حقيقيّة');

  await bootBlank(page, BASE_URL, 'ig-portrait');
  await page.locator('button', { hasText: /^احترافي$/ }).first().click();
  await page.waitForTimeout(220);

  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  const idsBefore = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  await page.locator('[data-tool="pen"]').click();
  await page.waitForTimeout(200);
  for (const [fx, fy] of [[0.15, 0.4], [0.45, 0.45], [0.8, 0.5]]) {
    await page.mouse.click(ab.x + ab.width * fx, ab.y + ab.height * fy);
    await page.waitForTimeout(60);
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const idsAfter = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  const pathId = idsAfter.find((id) => !idsBefore.includes(id));
  assert(Boolean(pathId), 'UI: three pen clicks then Enter created one open path element');

  const strokeRow = page.locator(`[data-testid^="appearance-stroke-${pathId}-"]`).first();
  const strokeId = await strokeRow.getAttribute('data-testid');
  const base = strokeId;

  const taperSelect = page.locator(`[data-testid="${base}-taper"]`);
  assert((await taperSelect.count()) === 1, 'UI: the appearance stack shows a width-taper control on a pen path');
  assert((await taperSelect.inputValue()) === 'none', 'UI: a freshly drawn path starts uniform — the control defaults to "منتظم", so nothing changed for existing documents');

  // سُمكٌ معلومٌ أوّلًا، فيصير القياس بعده معنيًّا.
  const widthField = page.locator(`[data-testid="${base}-width"]`);
  await widthField.click({ clickCount: 3 });
  await page.keyboard.type('24', { delay: 16 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);

  const pathSel = `[data-el-id="${pathId}"] svg path`;
  const beforeCount = await page.locator(pathSel).count();

  await taperSelect.selectOption('taperEnd');
  await page.waitForTimeout(260);

  assert((await taperSelect.inputValue()) === 'taperEnd', 'UI: selecting "يرقّ في النهاية" sticks in the control');
  const afterCount = await page.locator(pathSel).count();
  assert(afterCount === beforeCount + 1, `UI: a second <path> appears in the live preview — the filled outline (was ${beforeCount}, now ${afterCount})`);

  const outlineD = await page.locator(`[data-el-id="${pathId}"] [data-variable-stroke]`).first().getAttribute('d');
  assert(Boolean(outlineD) && outlineD.trim().endsWith('Z'), `UI: the live preview renders a real closed outline path (d ends with Z): ${outlineD?.slice(0, 50)}…`);

  // القياس من `d` المُصيَّر فعلًا: سُمكُ الحلقة عند أوّلها وعند آخرها.
  const measured = await page.evaluate((sel) => {
    const d = document.querySelector(sel).getAttribute('d');
    const pts = [...d.matchAll(/([ML])([-\d.]+)\s+([-\d.]+)/g)].map((m) => ({ x: +m[2], y: +m[3] }));
    // `d` مكتوبٌ في مقياس 100×100 (viewBox المعاينة)، والصندوق بكسلًا من الحالة.
    const near = (xq) => pts.filter((p) => Math.abs(p.x - xq) < 1.2).map((p) => p.y);
    const xs = pts.map((p) => p.x);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const spanAtStart = near(x0);
    const spanAtEnd = near(x1);
    return {
      startSpan: spanAtStart.length >= 2 ? Math.max(...spanAtStart) - Math.min(...spanAtStart) : null,
      endSpan: spanAtEnd.length >= 2 ? Math.max(...spanAtEnd) - Math.min(...spanAtEnd) : null,
    };
  }, `[data-el-id="${pathId}"] [data-variable-stroke]`);
  assert(
    measured.startSpan !== null && measured.endSpan !== null && measured.startSpan > measured.endSpan * 4,
    `UI: measured on the rendered outline, the wide end is more than 4x the thin end (start=${measured.startSpan?.toFixed(3)}, end=${measured.endSpan?.toFixed(3)} in viewBox units)`,
  );

  // حقلا النسبة يظهران مع المَلمح ويغيّران الهندسة فعلًا.
  const startPct = page.locator(`[data-testid="${base}-taper-start"]`);
  assert((await startPct.count()) === 1, 'UI: the two percent fields appear once a profile is active (and not before)');
  assert((await startPct.inputValue()) === '100', 'UI: the start field reads 100% for the taper preset — a factor of the width field, not a second pixel value');
  // `fill` حدثُ إدخالٍ واحد — كما يَلصق المصمّم قيمةً، لا كما يطبعها حرفًا
  // حرفًا. والطباعةُ حرفًا حرفًا في هذا الحقل خطوتا تراجع («٥» ثم «٥٠»)،
  // وهو سلوكُ حقل `width` المجاور نفسه منذ البند ١٧ لا شيءٌ جديد.
  await startPct.fill('50');
  await page.waitForTimeout(240);
  const halvedD = await page.locator(`[data-el-id="${pathId}"] [data-variable-stroke]`).first().getAttribute('d');
  assert(halvedD !== outlineD, 'UI: setting the start field to 50 really changes the rendered outline geometry (not a dead field)');

  // خطوةُ تراجعٍ واحدة لتغييرٍ واحد.
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(320);
  assert((await startPct.inputValue()) === '100', 'UI: one undo restores the previous start factor — one edit is one undo step');
  const restoredD = await page.locator(`[data-el-id="${pathId}"] [data-variable-stroke]`).first().getAttribute('d');

  // النقطة الوسطى الاختياريّة: فارغةٌ مع مَلمحٍ من نقطتين، ورقمٌ يجعلها ثالثة.
  const midPct = page.locator(`[data-testid="${base}-taper-mid"]`);
  assert((await midPct.inputValue()) === '', 'UI: the midpoint field is empty for a two-point taper — an absent midpoint is a linear end-to-end ramp, not a zero');
  await midPct.fill('30');
  await page.waitForTimeout(240);
  const withMidD = await page.locator(`[data-el-id="${pathId}"] [data-variable-stroke]`).first().getAttribute('d');
  assert(withMidD !== restoredD, 'UI: typing a midpoint really adds a third control point and re-shapes the outline');
  await midPct.fill('');
  await page.waitForTimeout(240);
  assert((await midPct.inputValue()) === '', 'UI: clearing the midpoint field drops back to a two-point linear ramp (an empty field is null, not 0)');
  const clearedD = await page.locator(`[data-el-id="${pathId}"] [data-variable-stroke]`).first().getAttribute('d');
  assert(clearedD === restoredD, 'UI: and the outline returns to exactly the two-point geometry — reversible, no residue');

  // البقاءُ بعد إعادة تحميلٍ حقيقيّة (التسلسل الحقيقيّ، لا حقن حالة). والحفظ
  // التلقائيّ مؤجَّلٌ ٧٠٠ms، فالانتظارُ حتى يُعلن «محفوظ» لا حتى يمرّ وقتٌ ما.
  await page.waitForFunction(() => !document.body.textContent.includes('جارٍ الحفظ'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="resume-project"]');
  await page.locator('[data-testid="resume-project"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  await page.waitForTimeout(300);
  const survivedD = await page.locator(`[data-el-id="${pathId}"] [data-variable-stroke]`).first().getAttribute('d');
  assert(Boolean(survivedD) && survivedD.trim().endsWith('Z'), 'the profile survives a real reload through the autosave round-trip — it serialises with the appearance stack and needs no migration of its own');
}

// --- 4. التحجيم الذكي ------------------------------------------------------------
async function testMagicResizeInvariance(page) {
  console.log('\n4. التحجيم الذكي — المعامل بلا بُعد فالتدرّج ثابت');
  const r = await page.evaluate(async () => {
    const mr = await import('/src/lib/magicResize.ts');
    const vs = await import('/src/lib/variableStroke.ts');
    const appearanceMod = await import('/src/lib/appearance.ts');
    const anim = { preset: 'none', start: 0, duration: 1, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} };
    const profile = vs.WIDTH_PROFILE_PRESETS.taperEnd;
    const el = {
      id: 'mr', type: 'shape', visible: true, locked: false, opacity: 100, maskId: null,
      geo: { x: 0.1, y: 0.4, w: 0.8, h: 0.2, rotation: 0 },
      shape: 'path', fill: 'transparent', fillToken: null, stroke: null, strokeWidth: 0, radius: 0, anim,
      points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], closed: false, smoothAmount: 0,
      appearance: { fills: [], strokes: [appearanceMod.newStrokeLayer({ color: '#ff0000', width: 20, widthProfile: profile })], shadows: [] },
    };
    const out = mr.magicResizeElements([el], { w: 1080, h: 1350 }, { w: 1080, h: 1920 });
    const after = out[0].appearance.strokes[0];
    return { profileAfter: after.widthProfile, widthAfter: after.width, sameObjectShape: JSON.stringify(after.widthProfile) === JSON.stringify(profile) };
  });
  assert(r.sameObjectShape, `magic resize: the profile comes through a 1080x1350 -> 1080x1920 resize unchanged (${JSON.stringify(r.profileAfter)})`);
  assert(
    r.widthAfter === 20,
    `magic resize: and so does the stroke width (${r.widthAfter}) — which is the point of storing factors rather than pixels. A pixel-valued profile would have needed its own scaling rule here; a dimensionless one is correct at every size by construction`,
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);

  await testPureGeometry(page);
  await testRasteriserMatchesSerialiser(page);
  await testRealUi(page);
  await testMagicResizeInvariance(page);

  console.log('\n5. الأخطاء الصامتة');
  assert(pageErrors.length === 0, `no runtime errors during the run${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);

  console.log(`\n${pass} passed, ${fail} failed.`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
