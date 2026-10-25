#!/usr/bin/env node
// **نقطةُ الارتكاز، والأرقامُ الأربعة للمنحنى — ٢٥ أكتوبر ٢٠٢٦.**
//
// المقطعُ المرجعيّ فيه مطرقةٌ تدور حول طرف مقبضها، وسيفٌ يُلوَّح به حول قبضته، وشريطٌ
// يتمدّد من حافّته — وكان كلُّ تحريكٍ في مزيج يدور ويتكبّر حول **مركز** العنصر وحده.
// فصار للعنصر `pivot` (كسرٌ من صندوقه)، ولمحرّر المنحنى أربعُ خاناتٍ تطابق ما يقاربه السحب.
//
//   ١. الصيغة: المركزُ وغيابُ النقطة يُنتجان **النصَّ نفسَه** الذي كان؛ والنقطةُ تبقى ثابتة.
//   ٢. التصدير: تمدّدٌ من الحافّة اليمنى، ودورانٌ حول الركن.
//   ٣. المعاينة تقول ما يقوله التصدير.
//   ٤. من الواجهة: الشبكة، والرقمان، والعلامة على اللوحة، والرجوع للمركز، والتراجع، والحفظ.
//   ٥. نسخُ الحركة يحمل نقطتها.
//   ٦. الأرقامُ الأربعة للمنحنى: تُكتب فتُطابَق، وخطوةُ تراجعٍ واحدة.
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

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const isRed = (p) => p[0] > 200 && p[1] < 60 && p[2] < 60;
const isBg = (p) => p[0] < 60 && p[1] < 60 && p[2] < 60;
const kf = (id, time, value) => ({ id, time, value, easing: 'linear', bezier: [0, 0, 1, 1] });
const anim = (tracks, duration = 2) => ({ preset: 'none', start: 0, duration, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks });
const appearance = (color) => ({ fills: [{ id: 'f', visible: true, opacity: 1, blend: 'normal', kind: 'solid', color, colorToken: null, gradientAngle: 90, gradientFrom: color, gradientTo: color }], strokes: [], shadows: [] });
function rect(id, geo, tracks, pivot) {
  return {
    id, type: 'shape', shape: 'rect', visible: true, locked: false, opacity: 100, maskId: null,
    geo, fill: '#ff0000', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0,
    appearance: appearance('#ff0000'), anim: anim(tracks), ...(pivot ? { pivot } : {}),
  };
}

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

async function doc(page) {
  await page.waitForTimeout(900);
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).artboards[0].doc, AUTOSAVE_KEY);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootBlank(page, BASE_URL, 'ig-reel');

  // ═════════════════════════ ١. الصيغة ═════════════════════════
  const f = await page.evaluate(async () => {
    const at = await import('/src/lib/animTimeline.ts');
    const mg = await import('/src/lib/maskGeometry.ts');
    const a = (tracks) => ({ preset: 'none', start: 0, duration: 2, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks });
    const k = (time, value) => ({ id: `k${time}`, time, value, easing: 'linear', bezier: [0, 0, 1, 1] });
    const moving = a({ x: [k(0, 0), k(1, 0.1)], scale: [k(0, 0.5), k(1, 1)], rotation: [k(0, 30), k(1, 0)], opacity: [k(0, 0), k(1, 1)] });
    const s0 = at.entranceStyleAt(moving, 0.4, 0);
    const sCenter = at.entranceStyleAt(moving, 0.4, 0, { x: 0.5, y: 0.5 });
    const onlyMove = a({ x: [k(0, 0), k(1, 0.1)] });
    const sMove = at.entranceStyleAt(onlyMove, 0.4, 0);
    const sMovePivot = at.entranceStyleAt(onlyMove, 0.4, 0, { x: 0, y: 1 });
    const sPivot = at.entranceStyleAt(moving, 0.4, 0, { x: 0, y: 0.5 });
    const size = { w: 1080, h: 1920 };
    const apply = (m, x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
    const geo = { x: 0.25, y: 0.4, w: 0.5, h: 0.1, rotation: 15 };
    const bw = geo.w * size.w;
    const bh = geo.h * size.h;
    // مقياسٌ أفقيّ ٠٫٥ حول منتصف الحافّة اليسرى: تلك النقطة لا تتحرّك، والحافّةُ اليمنى تقترب.
    const vis = { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 0.5, scaleY: 1, rotation: 0, blur: 0, trimStart: 0, trimEnd: 1, reveal: 0 };
    const mStill = mg.elementMatrix({ geo }, size, null);
    const mLeft = mg.elementMatrix({ geo, pivot: { x: 0, y: 0.5 } }, size, vis);
    const leftStill = apply(mStill, 0, bh / 2);
    const leftScaled = apply(mLeft, 0, bh / 2);
    const rightStill = apply(mStill, bw, bh / 2);
    const rightScaled = apply(mLeft, bw, bh / 2);
    // دورانٌ ٩٠° حول الركن الأيمن الأسفل: الركنُ ثابت.
    const rot = { ...vis, scaleX: 1, rotation: 90 };
    const mCorner = mg.elementMatrix({ geo, pivot: { x: 1, y: 1 } }, size, rot);
    const cornerStill = apply(mStill, bw, bh);
    const cornerRot = apply(mCorner, bw, bh);
    const mCenter = mg.elementMatrix({ geo }, size, rot);
    const mCenterExplicit = mg.elementMatrix({ geo, pivot: { x: 0.5, y: 0.5 } }, size, rot);
    return {
      same: s0.transform === sCenter.transform && s0.opacity === sCenter.opacity,
      moveSame: sMove.transform === sMovePivot.transform,
      pivotT: sPivot.transform,
      leftErr: Math.hypot(leftStill.x - leftScaled.x, leftStill.y - leftScaled.y),
      rightGap: Math.hypot(rightStill.x - rightScaled.x, rightStill.y - rightScaled.y),
      halfW: bw / 2,
      cornerErr: Math.hypot(cornerStill.x - cornerRot.x, cornerStill.y - cornerRot.y),
      centerSame: ['a', 'b', 'c', 'd', 'e', 'f'].every((k) => Math.abs(mCenter[k] - mCenterExplicit[k]) < 1e-9),
    };
  });
  assert(f.same, 'المركزُ صراحةً يُنتج نصَّ التحويل نفسَه الذي يُنتجه غيابُ النقطة — فلا يتغيّر مستندٌ قائم بايتًا');
  assert(f.moveSame, 'ونقطةٌ في الركن بلا مقياسٍ ولا دوران لا تُضيف إزاحةً واحدة إلى النصّ');
  assert(/translate\(-50\.000%, 0\.000%\).*scale\(.*rotate\(.*translate\(50\.000%, -?0\.000%\)/.test(f.pivotT), `والنقطةُ على الحافّة اليسرى تُحيط المقياسَ والدورانَ بإزاحتين بنسبة الصندوق (${f.pivotT})`);
  assert(f.leftErr < 1e-6, `مقياسٌ أفقيّ ٠٫٥ حول منتصف الحافّة اليسرى لعنصرٍ مُدار: تلك النقطة ثابتة (انزياح ${f.leftErr.toExponential(1)} بكسل)`);
  assert(Math.abs(f.rightGap - f.halfW) < 1e-6, `والحافّةُ اليمنى تقترب نصفَ العرض بالضبط (${f.rightGap.toFixed(3)} = ${f.halfW})`);
  assert(f.cornerErr < 1e-6, `ودورانٌ ٩٠° حول الركن الأيمن الأسفل: الركنُ ثابت (${f.cornerErr.toExponential(1)})`);
  assert(f.centerSame, 'ومصفوفةُ القناع بالمركز صراحةً هي مصفوفتُه بلا نقطة');

  // ═════════════════════════ ٢. التصدير ═════════════════════════
  const BAR = { x: 0.25, y: 0.4, w: 0.5, h: 0.2, rotation: 0 };
  const grow = { scaleX: [kf('a', 0, 0), kf('b', 1, 1)] };
  const probesBar = [[0.3, 0.5], [0.45, 0.5], [0.55, 0.5], [0.7, 0.5]];
  const centerPx = await renderAt(page, [rect('bar', BAR, grow)], 0.5, probesBar);
  const rightPx = await renderAt(page, [rect('bar', BAR, grow, { x: 1, y: 0.5 })], 0.5, probesBar);
  const leftPx = await renderAt(page, [rect('bar', BAR, grow, { x: 0, y: 0.5 })], 0.5, probesBar);
  assert(isBg(centerPx[0]) && isRed(centerPx[1]) && isRed(centerPx[2]) && isBg(centerPx[3]), `بلا نقطة: يتمدّد الشريط من وسطه — نصفُه الأوسط ظاهر (${JSON.stringify(centerPx)})`);
  assert(isBg(rightPx[0]) && isBg(rightPx[1]) && isRed(rightPx[2]) && isRed(rightPx[3]), `ومن حافّته اليمنى: نصفُه الأيمن ظاهر — مسحٌ من اليمين (${JSON.stringify(rightPx)})`);
  assert(isRed(leftPx[0]) && isRed(leftPx[1]) && isBg(leftPx[2]) && isBg(leftPx[3]), `ومن حافّته اليسرى: نصفُه الأيسر (${JSON.stringify(leftPx)})`);
  // مربّعٌ يدور ٩٠° حول ركنه الأيسر الأعلى (٠٫٤، ٠٫٤): يصير يسارَ الركن وتحته.
  const SQ = { x: 0.4, y: 0.4, w: 0.2, h: 0.2, rotation: 0 };
  const turn = { rotation: [kf('a', 0, 0), kf('b', 1, 90)] };
  const probesSq = [[0.5, 0.5], [0.3, 0.5], [0.5, 0.3]];
  const turned = await renderAt(page, [rect('sq', SQ, turn, { x: 0, y: 0 })], 1, probesSq);
  assert(isBg(turned[0]) && isRed(turned[1]) && isBg(turned[2]), `دورانٌ ٩٠° حول الركن الأيسر الأعلى: المربّعُ صار يسارَ الركن لا في مكانه (${JSON.stringify(turned)})`);

  // ═════════════════════════ ٣. المعاينة = التصدير ═════════════════════════
  // إعدادٌ للقياس: محتوى اللوح يُستبدَل بالشريط بعد أن يُحفظ المستند مرّةً كما يحفظه البرنامج.
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
    raw.artboards[0].doc.elements = els;
    window.localStorage.setItem(key, JSON.stringify(raw));
  }, { key: AUTOSAVE_KEY, els: [rect('bar', BAR, grow, { x: 1, y: 0.5 }), rect('other', { x: 0.1, y: 0.75, w: 0.2, h: 0.1, rotation: 0 }, {})] });
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(300);
  await page.locator('[data-testid="timeline-ruler"]').click({ position: { x: 300, y: 8 } });
  await page.keyboard.press('Home');
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const box = await page.evaluate(() => {
    const ab = document.querySelector('[data-testid="artboard"]').getBoundingClientRect();
    const r = document.querySelector('[data-el-id="bar"]').getBoundingClientRect();
    return { l: (r.left - ab.left) / ab.width, r: (r.right - ab.left) / ab.width };
  });
  assert(Math.abs(box.r - 0.75) < 0.004 && Math.abs(box.l - 0.5) < 0.004, `عند ٠٫٥ث في المعاينة: الشريطُ من ${box.l.toFixed(3)} إلى ${box.r.toFixed(3)} من عرض اللوح — حافّتُه اليمنى ثابتة كما في التصدير`);

  // ═════════════════════════ ٤. من الواجهة ═════════════════════════
  await page.locator('[data-testid="layer-name-other"]').click();
  await page.waitForTimeout(200);
  assert((await page.locator('[data-testid="pivot-grid"]').count()) === 1, 'لوحُ الخصائص فيه شبكةُ «نقطة الارتكاز»');
  assert((await page.locator('[data-testid="pivot-cell-1-1"]').getAttribute('aria-pressed')) === 'true', 'والمركزُ مختارٌ ابتداءً');
  assert((await page.locator('[data-testid="pivot-marker"]').count()) === 0, 'ولا علامةَ على اللوحة والنقطةُ في المركز');
  await page.locator('[data-testid="pivot-cell-2-1"]').click();
  await page.waitForTimeout(150);
  let d = await doc(page);
  let other = d.elements.find((e) => e.id === 'other');
  assert(other.pivot && other.pivot.x === 1 && other.pivot.y === 0.5, `خانةُ «يمين الوسط» تكتب ‎{x:1, y:0.5}‎ (${JSON.stringify(other.pivot)})`);
  const marker = await page.evaluate(() => {
    const m = document.querySelector('[data-testid="pivot-marker"]')?.getBoundingClientRect();
    const e = document.querySelector('[data-el-id="other"]').getBoundingClientRect();
    return m ? { mx: m.left + m.width / 2, my: m.top + m.height / 2, ex: e.right, ey: e.top + e.height / 2 } : null;
  });
  assert(marker && Math.abs(marker.mx - marker.ex) < 1.5 && Math.abs(marker.my - marker.ey) < 1.5, `وعلامتُها على اللوحة عند منتصف الحافّة اليمنى للعنصر (${marker && `${marker.mx.toFixed(1)},${marker.my.toFixed(1)} ≈ ${marker.ex.toFixed(1)},${marker.ey.toFixed(1)}`})`);
  await page.locator('[data-testid="pivot-x"]').fill('37.5');
  await page.locator('[data-testid="pivot-x"]').blur();
  await page.waitForTimeout(150);
  d = await doc(page);
  other = d.elements.find((e) => e.id === 'other');
  assert(other.pivot && Math.abs(other.pivot.x - 0.375) < 1e-9 && other.pivot.y === 0.5, `والرقمُ بكسرٍ عشريّ: ٣٧٫٥٪ ← ‎x = 0.375‎ (${JSON.stringify(other.pivot)})`);
  assert((await page.locator('[data-testid="pivot-x"]').inputValue()) === '37.5', 'ويُعرض كما كُتب لا مقرَّبًا إلى ٣٨');
  await page.locator('[data-testid="pivot-reset"]').click();
  await page.waitForTimeout(150);
  d = await doc(page);
  other = d.elements.find((e) => e.id === 'other');
  assert(!('pivot' in other), 'و«رجّعها للمركز» تحذف الحقلَ نفسَه — المستندُ كما كان قبل أن يُلمَس');
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(150);
  d = await doc(page);
  other = d.elements.find((e) => e.id === 'other');
  assert(other.pivot && Math.abs(other.pivot.x - 0.375) < 1e-9, `وتراجعٌ واحدٌ يُرجع ٣٧٫٥٪ (${JSON.stringify(other.pivot)})`);
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(400);
  d = await doc(page);
  other = d.elements.find((e) => e.id === 'other');
  assert(other.pivot && Math.abs(other.pivot.x - 0.375) < 1e-9, 'وتبقى بعد إعادة التشغيل');

  // ═════════════════════════ ٥. نسخُ الحركة يحمل نقطتها ═════════════════════════
  await page.locator('[data-testid="layer-name-bar"]').click();
  await page.waitForTimeout(150);
  await page.keyboard.press(`Alt+${MOD}+c`);
  await page.locator('[data-testid="layer-name-other"]').click();
  await page.waitForTimeout(150);
  await page.keyboard.press(`Alt+${MOD}+v`);
  await page.waitForTimeout(200);
  d = await doc(page);
  other = d.elements.find((e) => e.id === 'other');
  assert(other.pivot && other.pivot.x === 1 && other.pivot.y === 0.5 && (other.anim.tracks.scaleX || []).length === 2, `لصقُ حركة الشريط على عنصرٍ آخر ينقل نقطتَها معها (${JSON.stringify(other.pivot)}، ${(other.anim.tracks.scaleX || []).length} مفاتيح)`);

  // ═════════════════════════ ٦. الأرقامُ الأربعة للمنحنى ═════════════════════════
  await page.locator('[data-testid="easing-menu-button"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-testid="easing-option-custom"]').click();
  await page.waitForTimeout(200);
  assert((await page.locator('[data-testid="bezier-numbers"]').count()) === 1, 'محرّرُ المنحنى فيه أربعُ خاناتٍ للأرقام');
  const want = [0.16, 1, 0.3, 1];
  for (let i = 0; i < 4; i++) {
    await page.locator(`[data-testid="bezier-num-${i}"]`).fill(String(want[i]));
    await page.locator(`[data-testid="bezier-num-${i}"]`).press('Enter');
    await page.waitForTimeout(80);
  }
  d = await doc(page);
  other = d.elements.find((e) => e.id === 'other');
  assert(other.anim.easing === 'custom' && other.anim.bezier.every((v, i) => Math.abs(v - want[i]) < 1e-9), `المنحنى ‎cubic-bezier(0.16, 1, 0.3, 1)‎ مكتوبٌ بالضبط (${JSON.stringify(other.anim.bezier)})`);
  assert((other.anim.tracks.scaleX || []).every((k) => k.easing === 'custom' && k.bezier.every((v, i) => Math.abs(v - want[i]) < 1e-9)), 'وينزل إلى مفاتيح مساراته كما ينزل السحب');
  await page.locator('[data-testid="bezier-num-1"]').fill('9');
  await page.locator('[data-testid="bezier-num-1"]').press('Enter');
  await page.waitForTimeout(120);
  d = await doc(page);
  other = d.elements.find((e) => e.id === 'other');
  assert(Math.abs(other.anim.bezier[1] - 1.6) < 1e-9, `ورقمٌ خارج المدى يُحصر في مدى المحرّر نفسه (٩ ← ${other.anim.bezier[1]})`);
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="layer-name-other"]').click();
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(200);
  d = await doc(page);
  other = d.elements.find((e) => e.id === 'other');
  assert(Math.abs(other.anim.bezier[1] - 1) < 1e-9, `وكلُّ رقمٍ خطوةُ تراجعٍ واحدة (رجع ${other.anim.bezier[1]})`);

  // ═════════════════════════ أخطاء صامتة ═════════════════════════
  const realErrors = pageErrors.filter((e) => !/favicon|ResizeObserver loop/i.test(e));
  assert(realErrors.length === 0, realErrors.length ? `بلا أخطاء تشغيل (${realErrors.length}): ${realErrors.slice(0, 3).join(' | ')}` : 'بلا أخطاء تشغيل');

  await browser.close();
  console.log(`\n${'='.repeat(62)}`);
  console.log(`${pass} passed, ${fail} failed.`);
  if (failures.length) {
    console.log('\nfailures:');
    failures.forEach((x, i) => console.log(`  ${i + 1}. ${x}`));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
