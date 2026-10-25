#!/usr/bin/env node
// **تكبيرُ الخطّ الزمنيّ — ٢٥ أكتوبر ٢٠٢٦.**
//
// المدى كلُّه كان يُحشَر في عرض اللوح: مقطعُ ٤٤ ثانية = ٢٩ بكسلًا للثانية، فالإطارُ بكسلٌ
// والماستان على إطارين متجاورين تُمسَك إحداهما مكان الأخرى. فصار السطحُ الزمنيّ لوحًا أعرضَ
// من نافذته بمضاعِفٍ يُمرَّر أفقيًّا.
//
//   ١. ×١ كما كان: اللوحُ بعرض نافذته ولا تمرير.
//   ٢. «+» مرّتين = ×٤: اللوحُ أعرضُ أربعَ مرّات، والمسطرةُ أدقّ، والمؤشّرُ ثابتٌ في مكانه.
//   ٣. النقرُ على المسطرة بعد التمرير يضع الزمنَ تحت المؤشّر بالضبط.
//   ٤. الماسةُ في مكان زمنها، والنقرُ عليها يحدّدها.
//   ٥. المؤشّرُ لا يغيب: End يمرّر النافذة إليه.
//   ٦. ⌘ + العجلة تكبّر حول الفأرة: الزمنُ تحتها لا يتحرّك.
//   ٧. «الكل» يرجع ×١.
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

const kf = (id, time, value) => ({ id, time, value, easing: 'linear', bezier: [0, 0, 1, 1] });
const appearance = (color) => ({ fills: [{ id: 'f', visible: true, opacity: 1, blend: 'normal', kind: 'solid', color, colorToken: null, gradientAngle: 90, gradientFrom: color, gradientTo: color }], strokes: [], shadows: [] });
function rect(id, start, duration, tracks = {}) {
  return {
    id, type: 'shape', shape: 'rect', visible: true, locked: false, opacity: 100, maskId: null,
    geo: { x: 0.2, y: 0.2, w: 0.3, h: 0.1, rotation: 0 }, fill: '#ff0000', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0,
    appearance: appearance('#ff0000'), anim: { preset: 'none', start, duration, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks },
  };
}

const geo = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="timeline-canvas"]');
    const wrap = canvas.parentElement;
    const ruler = document.querySelector('[data-testid="timeline-ruler"]');
    return {
      cw: canvas.getBoundingClientRect().width,
      ww: wrap.clientWidth,
      sl: wrap.scrollLeft,
      wl: wrap.getBoundingClientRect().left,
      rl: ruler.getBoundingClientRect().left,
      rt: ruler.getBoundingClientRect().top,
      span: Number(ruler.dataset.span),
      ticks: ruler.querySelectorAll('[data-tick]').length,
      zoom: Number(document.querySelector('[data-testid="tl-zoom"]').dataset.zoom),
      t: Number(document.querySelector('[data-testid="timeline-time"]').dataset.t),
      playX: document.querySelector('[data-testid="timeline-playhead"]').getBoundingClientRect().left,
    };
  });

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootBlank(page, BASE_URL, 'ig-reel');
  // مستندٌ طويل (٤٤ ث) بعنصرٍ له مفتاحان على إطارين متجاورين — حالةُ المقطع المرجعيّ.
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
  }, { key: AUTOSAVE_KEY, els: [rect('long', 0, 44), rect('keyed', 0, 3, { x: [kf('k1', 1, 0), kf('k2', 1 + 1 / 30, 0.1)] })] });
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(400);

  // ═══════ ١. ×١ ═══════
  let g = await geo(page);
  assert(g.zoom === 1 && Math.abs(g.cw - g.ww) < 1 && g.sl === 0, `×١: اللوحُ بعرض نافذته (${g.cw.toFixed(1)} = ${g.ww}) ولا تمرير`);
  const ticks1 = g.ticks;

  // ═══════ ٢. ×٤ ═══════
  // المؤشّرُ عند ٢ ث أوّلًا، ثم «+» مرّتين: يبقى في مكانه على الشاشة.
  await page.locator('[data-testid="timeline-tracks"]').click({ position: { x: 5, y: 60 } });
  await page.keyboard.press('Home');
  for (let i = 0; i < 12; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(150);
  const before = await geo(page);
  await page.locator('[data-testid="tl-zoom-in"]').click();
  await page.locator('[data-testid="tl-zoom-in"]').click();
  await page.waitForTimeout(300);
  g = await geo(page);
  assert(g.zoom === 4 && Math.abs(g.cw - 4 * g.ww) < 2, `«+» مرّتين = ×٤: اللوحُ ${g.cw.toFixed(0)} = ٤ × ${g.ww}`);
  assert(g.ticks > ticks1, `والمسطرةُ أدقّ: ${g.ticks} علامة بدل ${ticks1}`);
  assert(Math.abs(g.t - 2) < 1e-6 && Math.abs(g.playX - before.playX) < 2, `والمؤشّرُ (٢ ث) بقي حيث كان على الشاشة (${before.playX.toFixed(1)} ← ${g.playX.toFixed(1)})`);

  // ═══════ ٣. النقرُ على المسطرة بعد التمرير ═══════
  await page.evaluate(() => {
    const w = document.querySelector('[data-testid="timeline-canvas"]').parentElement;
    w.scrollLeft = 1000;
  });
  await page.waitForTimeout(100);
  g = await geo(page);
  const clickX = 300;
  await page.mouse.click(g.wl + clickX, g.rt + 8);
  await page.waitForTimeout(150);
  const g2 = await geo(page);
  const expectT = ((g.sl + clickX) / g.cw) * g.span;
  assert(Math.abs(g2.t - expectT) < g.span / g.cw + 1 / 30, `نقرةٌ على المسطرة بعد تمريرٍ ${g.sl}px تضع الزمنَ تحتها: ${g2.t.toFixed(3)} ≈ ${expectT.toFixed(3)} ث`);

  // ═══════ ٤. الماستان على إطارين متجاورين ═══════
  await page.locator('[data-testid="tl-zoom-in"]').click();
  await page.locator('[data-testid="tl-zoom-in"]').click();
  await page.locator('[data-testid="tl-zoom-in"]').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const w = document.querySelector('[data-testid="timeline-canvas"]').parentElement;
    w.scrollLeft = 0;
  });
  // صفُّ «keyed» يُفتح لتظهر ماسات خصائصه.
  await page.locator('[data-testid="expand-keyed"]').click();
  await page.waitForTimeout(250);
  const diamonds = await page.evaluate(() => ['k1', 'k2'].map((id) => { const d = document.querySelector(`[data-testid="kf-keyed-${id}"]`); if (!d) return null; const r = d.getBoundingClientRect(); return { id, x: r.left + r.width / 2, y: r.top + r.height / 2 }; }).filter(Boolean));
  g = await geo(page);
  const pxPerFrame = g.cw / g.span / 30;
  const k1 = diamonds.find((d) => d.id === 'k1');
  const k2 = diamonds.find((d) => d.id === 'k2');
  assert(k1 && k2 && Math.abs(k2.x - k1.x - pxPerFrame) < 1.5 && pxPerFrame > 8, `×${g.zoom}: الماستان بينهما ${(k2 && k1 ? k2.x - k1.x : NaN).toFixed(1)} بكسل = إطارٌ واحد (${pxPerFrame.toFixed(1)}) — تُمسَك كلٌّ وحدها`);
  if (k2) {
    await page.mouse.click(k2.x, k2.y);
    await page.waitForTimeout(200);
    const field = page.locator('[data-testid="kf-value-field"]');
    const shown = (await field.count()) === 1 ? await field.inputValue() : null;
    assert(shown !== null && Math.abs(Number(shown) - 10) < 1e-6, `والنقرُ على الثانية يفتح لوحَ مفتاحها هي (قيمته ${shown} — ١٠٪ لا ٠)`);
  }

  // ═══════ ٥. المؤشّرُ لا يغيب ═══════
  // سطحُ الخطّ الزمنيّ يُركَّز بنقرةٍ على المسطرة (والنقرُ على مقطعٍ يحدّده لا يركّز السطح).
  await page.keyboard.press('Escape');
  g = await geo(page);
  await page.mouse.click(g.wl + 20, g.rt + 8);
  await page.keyboard.press('End');
  await page.waitForTimeout(250);
  g = await geo(page);
  assert(g.playX >= g.wl && g.playX <= g.wl + g.ww, `End يمرّر النافذة إلى المؤشّر (${g.playX.toFixed(0)} داخل ${g.wl.toFixed(0)}…${(g.wl + g.ww).toFixed(0)})`);

  // ═══════ ٦. ⌘ + العجلة حول الفأرة ═══════
  g = await geo(page);
  const mx = g.wl + 400;
  const tUnder = ((g.sl + 400) / g.cw) * g.span;
  await page.mouse.move(mx, g.rt + 60);
  await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control');
  await page.waitForTimeout(300);
  const g3 = await geo(page);
  const tUnder3 = ((g3.sl + 400) / g3.cw) * g3.span;
  assert(g3.zoom > g.zoom && Math.abs(tUnder3 - tUnder) < (2 * g.span) / g.cw, `⌘ + العجلة كبّرت (×${g.zoom} ← ×${Math.round(g3.zoom * 10) / 10}) والزمنُ تحت الفأرة ثابت (${tUnder.toFixed(3)} ≈ ${tUnder3.toFixed(3)})`);
  assert(await page.evaluate(() => window.visualViewport.scale) === 1, 'ولم تتكبّر الصفحةُ نفسُها');

  // ═══════ ٧. «الكل» ═══════
  await page.locator('[data-testid="tl-zoom-fit"]').click();
  await page.waitForTimeout(300);
  g = await geo(page);
  assert(g.zoom === 1 && Math.abs(g.cw - g.ww) < 1 && g.sl === 0, '«الكل» يرجع ×١ بلا تمرير');

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
