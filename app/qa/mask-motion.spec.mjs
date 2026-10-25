#!/usr/bin/env node
// **القناع: شكلُه أيُّ شكل، وحركتُه حركتُه — ٢٥ أكتوبر ٢٠٢٦.**
//
// «قص بالشكل» كان يقصّ **مستطيلَ صندوق** القناع أو بيضتَه أيًّا كان شكلُه، ويقصّ في إطار
// العنصر **بعد** حركته فيتحرّك القناعُ مع المحتوى، ولا يرى حركةَ القناع إطلاقًا. ونسخُ مقطعٍ
// حقيقيّ طلب ثلاثة أدوارٍ لا يقدر عليها ذلك (انظر `src/lib/maskGeometry.ts`): صورةٌ في
// مخمّس، وملصقٌ يُمسَح بقناعٍ يتحرّك وحده، وشخصيّةٌ تصعد من إطارٍ ساكن فتكسره.
//
//   ١. الهندسة: قناعٌ مستطيلٌ ساكن يقصّ **ما كان يقصّه بالضبط** (الدالّة القديمة مرجعًا)،
//      والبيضةُ تمرّ بأطرافها الأربعة، والمسارُ يُقَصّ بنقاطه هو لا بصندوقه.
//   ٢. القُماش (مُصيِّر التصدير): مخمّسٌ يقصّ مخمّسًا لا مستطيلًا.
//   ٣. القناعُ يتحرّك وحده (مسحٌ من اليمين) والمحتوى ثابت.
//   ٤. المحتوى يتحرّك وحده (صعودٌ من أسفل) والقناعُ ثابت.
//   ٥. المعاينة تقول ما يقوله التصدير: إصابةُ المؤشّر تتبع القصّ عند اللحظتين.
//   ٦. من الواجهة كما يفعل المصمّم: مستطيلٌ ومخمّسٌ من المكتبة ← «قص بالشكل».
//   ٧. SVG: القناعُ مسارٌ بمنحنياته.
import { chromium } from 'playwright';
import { bootBlank, resumeAfterReload, AUTOSAVE_KEY } from './helpers/boot.mjs';

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:1420';
let pass = 0;
let fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ✓', msg);
  } else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}

const RED = [255, 0, 0];
const isRed = (p) => p[0] > 200 && p[1] < 60 && p[2] < 60;
const isBg = (p) => p[0] < 60 && p[1] < 60 && p[2] < 60;

/** عنصرا الاختبار: مستطيلٌ أحمر يملأ اللوح هو المقصوص، وشكلٌ هو القناع. مبنيّان كما يبنيهما
 * المستند (الحقول نفسها التي يكتبها `placeShapeFromLibrary` وأداة الشكل). */
function fixtureElements({ maskShape, maskPoints, maskGeo, maskTracks = {}, targetTracks = {}, targetGeo }) {
  const anim = (tracks) => ({ preset: 'none', start: 0, duration: 2, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks });
  const appearance = (color) => ({ fills: [{ id: 'f', visible: true, opacity: 1, blend: 'normal', kind: 'solid', color, colorToken: null, gradientAngle: 90, gradientFrom: color, gradientTo: color }], strokes: [], shadows: [] });
  return [
    {
      id: 'target', type: 'shape', shape: 'rect', visible: true, locked: false, opacity: 100, maskId: 'mask',
      geo: targetGeo ?? { x: 0, y: 0, w: 1, h: 1, rotation: 0 }, fill: '#ff0000', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0,
      appearance: appearance('#ff0000'), anim: anim(targetTracks),
    },
    {
      id: 'mask', type: 'shape', shape: maskShape, visible: false, locked: false, opacity: 100, maskId: null,
      geo: maskGeo, fill: '#00ff00', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0,
      ...(maskPoints ? { points: maskPoints, closed: true } : {}),
      appearance: appearance('#00ff00'), anim: anim(maskTracks),
    },
  ];
}

const kf = (id, time, value) => ({ id, time, value, easing: 'linear', bezier: [0, 0, 1, 1] });

/** إطارٌ من مُصيِّر التصدير عند لحظةٍ، وألوانُ نقاطٍ مُسمّاة بكسور اللوح. */
async function renderAt(page, elements, time, probes, size = { w: 1080, h: 1080 }) {
  return page.evaluate(
    async ({ elements, time, probes, size }) => {
      const ex = await import('/src/lib/exportArtboard.ts');
      const blob = await ex.renderArtboardPng({
        size: { id: 'p', ar: '', en: '', w: size.w, h: size.h, kind: 'timed' },
        palette: { bg: '#101010', fg: '#f0f0f0', ac: '#ffb703' },
        elements, transparent: false, lang: 'ar', scale: 0.5, decorAccent: false, time,
      });
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      return probes.map(([x, y]) => [...g.getImageData(Math.round(x * (bmp.width - 1)), Math.round(y * (bmp.height - 1)), 1, 1).data].slice(0, 3));
    },
    { elements, time, probes, size },
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootBlank(page, BASE_URL, 'ig-reel');

  // ═════════════════════════ ١. الهندسة ═════════════════════════
  const geo = await page.evaluate(async () => {
    const mg = await import('/src/lib/maskGeometry.ts');
    const g = await import('/src/lib/geometry.ts');
    const size = { w: 1080, h: 1920 };
    const anim = { preset: 'none', start: 0, duration: 1, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} };
    const target = { geo: { x: 0.1, y: 0.2, w: 0.5, h: 0.3, rotation: 20 }, anim };
    const rectMask = { type: 'shape', shape: 'rect', radius: 0, geo: { x: 0.3, y: 0.25, w: 0.4, h: 0.2, rotation: 10 }, anim };
    const now = mg.maskClipLocal(target, rectMask, size, 0).cmds.filter((c) => c.c !== 'Z');
    const was = g.maskLocalPolygonPoints(g.geoToPx(target.geo, size), g.geoToPx(rectMask.geo, size), 'rect');
    const rectErr = Math.max(...now.map((c, i) => Math.hypot(c.x - was[i].x, c.y - was[i].y)));
    const ellMask = { ...rectMask, shape: 'ellipse' };
    const ell = mg.maskClipLocal(target, ellMask, size, 0).cmds;
    const ellWas = g.maskLocalPolygonPoints(g.geoToPx(target.geo, size), g.geoToPx(ellMask.geo, size), 'ellipse');
    // الأطرافُ الأربعة: البيضةُ القديمةُ عيّنةٌ كلَّ ٧٫٥° تبدأ من ٠° — فالفهارسُ ٠ و١٢ و٢٤ و٣٦.
    const ends = [ell[0], ell[1], ell[2], ell[3]].map((c) => ({ x: c.x, y: c.y }));
    const ellErr = Math.max(...[0, 12, 24, 36].map((k, i) => Math.hypot(ends[i].x - ellWas[k].x, ends[i].y - ellWas[k].y)));
    const pent = { type: 'shape', shape: 'path', radius: 0, points: [{ x: 0.5, y: 0 }, { x: 1, y: 0.38 }, { x: 0.81, y: 1 }, { x: 0.19, y: 1 }, { x: 0, y: 0.38 }], closed: true, geo: { x: 0.25, y: 0.25, w: 0.5, h: 0.25, rotation: 0 }, anim };
    const flat = { geo: { x: 0, y: 0, w: 1, h: 1, rotation: 0 }, anim };
    const pc = mg.maskClipLocal(flat, pent, size, 0).cmds.filter((c) => c.c !== 'Z');
    const pentOk = pc.length === 5 && pc.every((c, i) => Math.abs(c.x - (0.25 * 1080 + pent.points[i].x * 540)) < 1e-6 && Math.abs(c.y - (0.25 * 1920 + pent.points[i].y * 480)) < 1e-6);
    const zero = mg.maskClipLocal({ geo: target.geo, anim: { ...anim, tracks: { scale: [{ id: 'z', time: 0, value: 0, easing: 'linear', bezier: [0, 0, 1, 1] }] } } }, rectMask, size, 0);
    return { rectErr, ellErr, pentOk, zero: zero.cmds.length, curved: ell.some((c) => c.c === 'C') };
  });
  assert(geo.rectErr < 1e-6, `قناعٌ مستطيلٌ ساكن يقصّ ما كانت الدالّة القديمة تقصّه بالضبط على عنصرٍ ومستطيلٍ مُدارَين (أقصى فرق ${geo.rectErr.toExponential(2)} بكسل)`);
  assert(geo.ellErr < 1e-6 && geo.curved, `والبيضةُ منحنياتٌ حقيقيّة تمرّ بأطرافها الأربعة كما كانت (فرق ${geo.ellErr.toExponential(2)})`);
  assert(geo.pentOk, 'والمسارُ يُقَصّ **بنقاطه** — رؤوسُ المخمّس الخمسة في مكانها لا زوايا صندوقه');
  assert(geo.zero === 0, 'وعنصرٌ مقياسُه صفرٌ (لا مقلوبَ لتحويله) يُقَصّ كلُّه — لا يُرسَم شيءٌ منه');

  // ═════════════════════════ ٢. القُماش: مخمّسٌ لا مستطيل ═════════════════════════
  const PENT = [{ x: 0.5, y: 0 }, { x: 1, y: 0.38 }, { x: 0.81, y: 1 }, { x: 0.19, y: 1 }, { x: 0, y: 0.38 }];
  const pentEls = fixtureElements({ maskShape: 'path', maskPoints: PENT, maskGeo: { x: 0.2, y: 0.2, w: 0.6, h: 0.6, rotation: 0 } });
  // المركز داخل المخمّس؛ وزاويةُ صندوقه العليا اليسرى (٠٫٢٢، ٠٫٢٢) خارجه؛ وخارجُ الصندوق.
  const [cIn, cCorner, cOut] = await renderAt(page, pentEls, 0, [[0.5, 0.55], [0.22, 0.22], [0.1, 0.9]]);
  assert(isRed(cIn), `داخل المخمّس: المحتوى (${cIn})`);
  assert(isBg(cCorner), `زاويةُ صندوق المخمّس — داخل الصندوق خارج الشكل: مقصوصة (${cCorner}). كانت حمراءَ حين كان القناعُ صندوقًا`);
  assert(isBg(cOut), `خارج الصندوق: مقصوص (${cOut})`);

  // ═════════════════════ ٣. القناعُ يتحرّك وحده: مسحٌ من اليمين ═════════════════════
  // قناعٌ مستطيلٌ عرضُه نصفُ اللوح عند يساره، يبدأ مُزاحًا ٠٫٦ من العرض يمينًا (خارج اللوح
  // كلّه تقريبًا) ثم يعود إلى مكانه عند ١ث. والمحتوى ثابت.
  const wipeEls = fixtureElements({ maskShape: 'rect', maskGeo: { x: 0, y: 0, w: 0.5, h: 1, rotation: 0 }, maskTracks: { x: [kf('a', 0, 0.6), kf('b', 1, 0)] } });
  const at0 = await renderAt(page, wipeEls, 0, [[0.25, 0.5], [0.75, 0.5]]);
  const atHalf = await renderAt(page, wipeEls, 0.5, [[0.25, 0.5], [0.4, 0.5], [0.75, 0.5]]);
  const at1 = await renderAt(page, wipeEls, 1, [[0.25, 0.5], [0.75, 0.5]]);
  assert(isBg(at0[0]) && isRed(at0[1]), `عند ٠ث: القناعُ مُزاحٌ يمينًا فيُرى المحتوى حيث هو القناعُ الآن لا حيث كان (${at0})`);
  assert(isBg(atHalf[0]) && isRed(atHalf[1]) && isRed(atHalf[2]), `عند ٠٫٥ث: القناعُ عند ٠٫٣..٠٫٨ — يُرى المحتوى داخله وحده (${atHalf})`);
  assert(isRed(at1[0]) && isBg(at1[1]), `عند ١ث: القناعُ في مكانه — النصفُ الأيسر وحده (${at1})`);

  // ═════════════════════ ٤. المحتوى يتحرّك وحده: صعودٌ يكسر الإطار ═════════════════════
  // مربّعٌ أحمر صغير يصعد من أسفل اللوح، والقناعُ ثابتٌ يغطّي أعلى اللوح حتى ٠٫٦ منه. فما
  // تحت ٠٫٦ من المربّع مقصوصٌ دائمًا، وما فوقه ظاهر — وهو ما كان مستحيلًا حين كان القناعُ
  // يتحرّك مع المحتوى (كان المربّعُ سيظهر كاملًا أينما كان).
  const riseEls = fixtureElements({
    maskShape: 'rect', maskGeo: { x: 0, y: 0, w: 1, h: 0.6, rotation: 0 },
    targetGeo: { x: 0.3, y: 0.5, w: 0.4, h: 0.2, rotation: 0 },
    targetTracks: { y: [kf('a', 0, 0.3), kf('b', 1, 0)] },
  });
  const r0 = await renderAt(page, riseEls, 0, [[0.5, 0.85]]);
  const r1 = await renderAt(page, riseEls, 1, [[0.5, 0.55], [0.5, 0.65]]);
  assert(isBg(r0[0]), `عند ٠ث: المربّعُ أسفلَ الإطار بكامله — لا يُرى (${r0})`);
  assert(isRed(r1[0]) && isBg(r1[1]), `عند ١ث: ما فوق حدّ الإطار ظاهرٌ وما تحته مقصوص (${r1})`);

  // ═════════════════════ ٥. المعاينة تقول ما يقوله التصدير ═════════════════════
  // المستندُ نفسُه (مسحُ القسم ٣) في المعاينة الحيّة: `clip-path` يقصّ إصابةَ المؤشّر أيضًا،
  // فالعنصرُ تحت نقطةٍ يُسأل عنه بـ`elementFromPoint` عند لحظتين.
  // الحفظُ التلقائيّ لا يُكتَب لمستندٍ لم يتغيّر بعد: مستطيلٌ يُرسَم أوّلًا ليوجد سجلٌّ
  // يُستبدَل محتواه بعنصرَي الاختبار (إعدادٌ للقياس، كما يفعل قسمُ الصورة المُدارة في
  // `image-trace.spec.mjs`).
  {
    const ab0 = await page.locator('[data-testid="artboard"]').boundingBox();
    await page.locator('[data-tool="shape"]').click();
    await page.waitForTimeout(250);
    await page.mouse.move(ab0.x + ab0.width * 0.3, ab0.y + ab0.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(ab0.x + ab0.width * 0.5, ab0.y + ab0.height * 0.5, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(1300);
  }
  await page.evaluate(({ key, els }) => {
    const raw = JSON.parse(window.localStorage.getItem(key));
    const ab = raw.artboards[0];
    ab.doc.elements = els;
    window.localStorage.setItem(key, JSON.stringify(raw));
  }, { key: AUTOSAVE_KEY, els: wipeEls });
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(300);
  const hitAt = async (fx, fy) =>
    page.evaluate(([fx, fy]) => {
      const ab = document.querySelector('[data-testid="artboard"]').getBoundingClientRect();
      const el = document.elementFromPoint(ab.left + ab.width * fx, ab.top + ab.height * fy);
      return el?.closest('[data-el-id]')?.getAttribute('data-el-id') ?? null;
    }, [fx, fy]);
  const clipAt = () => page.locator('[data-el-id="target"]').evaluate((e) => e.style.clipPath);
  await page.locator('[data-testid="timeline-ruler"]').click({ position: { x: 300, y: 8 } });
  await page.keyboard.press('Home');
  await page.waitForTimeout(150);
  const domClip0 = await clipAt();
  const h0 = [await hitAt(0.25, 0.5), await hitAt(0.75, 0.5)];
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(150);
  const domClip1 = await clipAt();
  const h1 = [await hitAt(0.25, 0.5), await hitAt(0.75, 0.5)];
  assert(domClip0.startsWith('path(') && domClip0 !== domClip1, `المعاينة: \`clip-path\` مسارٌ يتغيّر مع حركة القناع (${domClip0.slice(0, 40)}… ≠ …)`);
  assert(h0[0] === null && h0[1] === 'target', `وعند ٠ث تقع الإصابةُ حيث يقع القصّ في التصدير (${h0})`);
  assert(h1[0] === 'target' && h1[1] === null, `وعند ١ث كذلك (${h1})`);

  // ═════════════════════ ٦. من الواجهة: مستطيلٌ ومخمّسٌ ← «قص بالشكل» ═════════════════════
  await bootBlank(page, BASE_URL, 'ig');
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(300);
  await page.mouse.move(ab.x + ab.width * 0.1, ab.y + ab.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(ab.x + ab.width * 0.9, ab.y + ab.height * 0.9, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const ids0 = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  const rectId = ids0[ids0.length - 1];
  // المكتبة من شريط الإضافة: زرّ «عناصر» ← بطاقة المخمّس.
  await page.locator('[data-testid="add-rail"] [data-panel-tab="library"]').click();
  await page.waitForTimeout(250);
  const pentTile = page.locator('[data-shape-tile^="pentagon"]').first();
  assert((await pentTile.count()) === 1, 'مكتبةُ العناصر فيها مخمّس');
  await pentTile.click();
  await page.waitForTimeout(300);
  const ids1 = await page.locator('[data-el-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-el-id')));
  const pentId = ids1.find((id) => !ids0.includes(id));
  assert(!!pentId, `وُضِع المخمّسُ عنصرًا (${pentId})`);
  await page.locator(`[data-testid="layer-name-${rectId}"]`).click();
  await page.locator(`[data-testid="layer-name-${pentId}"]`).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(200);
  await page.locator('button', { hasText: 'قص بالشكل' }).last().click();
  await page.waitForTimeout(300);
  const uiClip = await page.locator(`[data-el-id="${rectId}"]`).evaluate((e) => e.style.clipPath);
  assert(uiClip.startsWith('path(') && (uiClip.match(/L/g) || []).length >= 4, `المستطيلُ مقصوصٌ بمسار المخمّس نفسه — خمسة رؤوس لا أربع زوايا (${uiClip.slice(0, 60)}…)`);
  assert((await page.locator(`[data-el-id="${pentId}"]`).count()) === 0, 'والمخمّسُ لا يُرسَم وحده بعد أن صار قناعًا');
  const saved = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)), AUTOSAVE_KEY).catch(() => null);
  await page.waitForTimeout(900);
  const uiDoc = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).artboards[0].doc, AUTOSAVE_KEY);
  const pentEl = uiDoc.elements.find((e) => e.id === pentId);
  const rectEl = uiDoc.elements.find((e) => e.id === rectId);
  // نقطةٌ داخل صندوق المخمّس قرب زاويته العليا اليسرى (خارج الشكل) ونقطةٌ في مركزه.
  const corner = [pentEl.geo.x + pentEl.geo.w * 0.05, pentEl.geo.y + pentEl.geo.h * 0.05];
  const center = [pentEl.geo.x + pentEl.geo.w * 0.5, pentEl.geo.y + pentEl.geo.h * 0.55];
  const uiPx = await renderAt(page, uiDoc.elements, undefined, [center, corner], { w: 1080, h: 1080 });
  assert(!isBg(uiPx[0]) && isBg(uiPx[1]), `والتصديرُ يوافق: لونُ المستطيل في قلب المخمّس، والخلفيّةُ في زاوية صندوقه (${uiPx}) — ${saved ? 'محفوظ' : ''}`);
  void rectEl;

  // ═════════════════════════ ٧. SVG: مسارٌ بمنحنياته ═════════════════════════
  const ellEls = fixtureElements({ maskShape: 'ellipse', maskGeo: { x: 0.2, y: 0.2, w: 0.6, h: 0.4, rotation: 0 } });
  const svg = await page.evaluate(async (elements) => {
    const ex = await import('/src/lib/exportArtboard.ts');
    return ex.renderArtboardSvg({ size: { id: 'p', ar: '', en: '', w: 1080, h: 1080, kind: 'still' }, palette: { bg: '#101010', fg: '#f0f0f0', ac: '#ffb703' }, elements, transparent: false, lang: 'ar', decorAccent: false }).text();
  }, ellEls);
  const clipDef = (svg.match(/<clipPath id="mask-target">([\s\S]*?)<\/clipPath>/) || [])[1] || '';
  assert(/<path d="M[^"]*C/.test(clipDef), `SVG: قناعُ البيضة \`<path>\` بمنحنياتٍ حقيقيّة لا مضلّعٌ بثمانيةٍ وأربعين ضلعًا (${clipDef.slice(0, 50)}…)`);

  // ═════════════════════════ أخطاء صامتة ═════════════════════════
  const realErrors = pageErrors.filter((e) => !/favicon|ResizeObserver loop/i.test(e));
  assert(realErrors.length === 0, realErrors.length ? `بلا أخطاء تشغيل (${realErrors.length}): ${realErrors.slice(0, 3).join(' | ')}` : 'بلا أخطاء تشغيل');

  await browser.close();
  console.log(`\n${'='.repeat(62)}`);
  console.log(`${pass} passed, ${fail} failed.`);
  if (failures.length) {
    console.log('\nfailures:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('harness crashed:', e);
  process.exit(2);
});
