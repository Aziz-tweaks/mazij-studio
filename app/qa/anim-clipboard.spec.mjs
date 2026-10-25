#!/usr/bin/env node
// **نسخُ الحركة ولصقُها — ٢٥ أكتوبر ٢٠٢٦.**
//
// في المقطع المطلوب نسخُه ثماني عشرةَ لقطة، وفيها التسمياتُ تمسح من اليمين بالحركة
// نفسِها مرّةً بعد مرّة، والنصوصُ تظهر بالأثر نفسه. وكان كلُّ عنصرٍ يُحرَّك من الصفر.
// فصار في قائمة الزرّ الأيمن وفي «⋯» بندا «نسخ الحركة» و«لصق الحركة» (⌥⌘C / ⌥⌘V):
// المقطعُ كاملًا — مساراته وطوله و«يظهر في مقطعه فقط» وتتابعُ النصّ — يُلصَق على كلّ
// محدَّدٍ **من بداية مقطعه هو**، بخطوة تراجعٍ واحدة.
//
// والقياسُ من الواجهة كما يستعملها مصمّم، ومن الدالّة التي يرسم بها الرسّامان.
import { chromium } from 'playwright';
import { bootBlank, AUTOSAVE_KEY } from './helpers/boot.mjs';

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
const isMac = process.platform === 'darwin';
const MOD = isMac ? 'Meta' : 'Control';

async function doc(page) {
  await page.waitForTimeout(900);
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).artboards[0].doc, AUTOSAVE_KEY);
}
const historyLen = (page) => page.locator('[data-testid="undo-btn"]').evaluate((e) => Number(e.dataset.historyPast));

async function drawRect(page, x0, y0, x1, y1) {
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(300);
  await page.mouse.move(ab.x + ab.width * x0, ab.y + ab.height * y0);
  await page.mouse.down();
  await page.mouse.move(ab.x + ab.width * x1, ab.y + ab.height * y1, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(450);
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all[all.length - 1].getAttribute('data-el-id');
  });
}

async function addText(page, content, at) {
  await page.locator('[data-tool="text"]').click();
  await page.waitForTimeout(180);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.mouse.click(ab.x + ab.width * at.x, ab.y + ab.height * at.y);
  await page.waitForTimeout(400);
  await page.keyboard.type(content, { delay: 15 });
  await page.waitForTimeout(240);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all[all.length - 1].getAttribute('data-el-id');
  });
}

async function selectLayer(page, id, additive = false) {
  if (additive) await page.keyboard.down('Shift');
  await page.locator(`[data-testid="layer-name-${id}"]`).click();
  if (additive) await page.keyboard.up('Shift');
  await page.waitForTimeout(160);
}

async function typeTiming(page, which, seconds) {
  const f = page.locator(`[data-testid="timing-${which}"]`);
  await f.click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.type(String(seconds));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
}

async function contextMenuOn(page, id) {
  const box = await page.locator(`[data-el-id="${id}"]`).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.waitForSelector('[data-testid="stage-menu"]');
  await page.waitForTimeout(120);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootBlank(page, BASE_URL, 'ig-reel');

  // المصدر: مستطيلٌ ينزلق، محدودٌ بمقطعه من ٠٫٥ إلى ١٫٥ث.
  const a = await drawRect(page, 0.1, 0.1, 0.4, 0.2);
  await page.locator('[data-testid="anim-preset-slide"]').click();
  await page.waitForTimeout(150);
  await typeTiming(page, 'start', 0.5);
  await typeTiming(page, 'end', 1.5);
  await page.locator('[data-testid="timing-bounded"]').click();
  await page.waitForTimeout(150);
  // والأهداف: مستطيلٌ ثانٍ يبدأ عند ٢ث، ونصّ.
  const b = await drawRect(page, 0.5, 0.4, 0.9, 0.5);
  await typeTiming(page, 'start', 2);
  const c = await addText(page, 'تسمية', { x: 0.8, y: 0.7 });

  // قائمةُ الزرّ الأيمن: «لصق الحركة» غائبٌ قبل أيّ نسخ.
  await selectLayer(page, a);
  await contextMenuOn(page, a);
  assert((await page.locator('[data-testid="sm-copy-anim"]').count()) === 1, 'قائمة الزرّ الأيمن على عنصرٍ فيها «نسخ الحركة»');
  assert((await page.locator('[data-testid="sm-paste-anim"]').count()) === 0, 'و«لصق الحركة» غائبٌ قبل أن يُنسَخ شيء');
  const h0 = await historyLen(page);
  await page.locator('[data-testid="sm-copy-anim"]').click();
  await page.waitForTimeout(150);
  assert((await historyLen(page)) === h0, 'النسخُ لا يغيّر المستند ولا التاريخ');

  await selectLayer(page, b);
  await selectLayer(page, c, true);
  await contextMenuOn(page, b);
  assert((await page.locator('[data-testid="sm-paste-anim"]').count()) === 1, 'بعد النسخ يظهر «لصق الحركة»');
  await page.locator('[data-testid="sm-paste-anim"]').click();
  await page.waitForTimeout(200);
  assert((await historyLen(page)) === h0 + 1, 'اللصقُ على عنصرين خطوةُ تراجعٍ واحدة');

  const d1 = await doc(page);
  const A = d1.elements.find((e) => e.id === a);
  const B = d1.elements.find((e) => e.id === b);
  const C = d1.elements.find((e) => e.id === c);
  const sig = (anim) => JSON.stringify(Object.fromEntries(Object.entries(anim.tracks).map(([p, t]) => [p, t.map((k) => [k.time, k.value, k.easing])])));
  assert(Math.abs(B.anim.start - 2) < 1e-9 && Math.abs(B.anim.duration - A.anim.duration) < 1e-9 && B.anim.bounded === true && sig(B.anim) === sig(A.anim), `المستطيلُ الثاني: البدايةُ بدايتُه (٢ث)، والطولُ و«يظهر في مقطعه فقط» والمساراتُ من المصدر (${sig(B.anim)})`);
  const ids = new Set([...Object.values(A.anim.tracks).flat().map((k) => k.id)]);
  assert(Object.values(B.anim.tracks).flat().every((k) => !ids.has(k.id)), 'ولكلّ مفتاحٍ ملصوقٍ هويّةٌ جديدة — تحديدُ ماسةٍ على أحدهما لا يحدّد الأخرى');
  assert(sig(C.anim) === sig(A.anim) && Math.abs(C.anim.start) < 1e-9, 'والنصُّ ينال الحركةَ نفسَها من بداية مقطعه هو (صفر)');

  // الحركةُ هي هي من بداية كلّ مقطع: ما يراه المستطيلُ الأوّل عند ٠٫٥+ث يراه الثاني عند ٢+ث.
  const same = await page.evaluate(async ({ A, B }) => {
    const at = await import('/src/lib/animTimeline.ts');
    const out = [];
    for (const dt of [0, 0.1, 0.25, 0.4, 0.9]) {
      const va = at.resolveAnimAt(A.anim, A.anim.start + dt);
      const vb = at.resolveAnimAt(B.anim, B.anim.start + dt);
      out.push(Math.abs(va.opacity - vb.opacity) + Math.abs(va.y - vb.y) + Math.abs(va.x - vb.x));
      out.push(at.clipShowsAt(A.anim, A.anim.start + dt) === at.clipShowsAt(B.anim, B.anim.start + dt) ? 0 : 1);
    }
    return Math.max(...out);
  }, { A, B });
  assert(same < 1e-12, `عند كلّ لحظةٍ من بداية المقطع تتطابق الحالتان (أكبرُ فرق ${same})`);

  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(250);
  const d2 = await doc(page);
  const B2 = d2.elements.find((e) => e.id === b);
  assert(!B2.anim.bounded && sig(B2.anim) !== sig(A.anim), 'تراجعٌ واحدٌ يعيد الهدفين كما كانا');

  // ═══════ النصّ: التتابعُ ومسارُ «الظهور» يُنسَخان، ولا يُلصَقان على شكل ═══════
  const t1 = await addText(page, 'هو رمز من رموز', { x: 0.8, y: 0.3 });
  await selectLayer(page, t1);
  await page.locator(`[data-testid="stagger-toggle-${t1}"]`).click();
  await page.locator(`[data-testid="stagger-unit-${t1}-word"]`).click();
  await page.locator(`[data-testid="stagger-effect-${t1}-none"]`).click();
  await page.waitForTimeout(120);
  const ruler = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  for (const f of [3, 9]) {
    await page.mouse.click(ruler.x + ruler.width * 0.93, ruler.y + ruler.height / 2);
    await page.keyboard.press('Home');
    for (let i = 0; i < f; i++) await page.keyboard.press('ArrowRight');
    await selectLayer(page, t1);
    await page.locator(`[data-testid="reveal-next-${t1}"]`).click();
    await page.waitForTimeout(100);
  }
  const t2 = await addText(page, 'رمز ثاني هنا', { x: 0.8, y: 0.9 });
  await selectLayer(page, t2);
  await typeTiming(page, 'start', 3);
  // بالكيبورد هذه المرّة: ⌥⌘C ثم ⌥⌘V.
  await selectLayer(page, t1);
  await page.locator('[data-testid="artboard"]').focus().catch(() => {});
  await page.keyboard.press(`Alt+${MOD}+c`);
  await page.waitForTimeout(120);
  await selectLayer(page, t2);
  await selectLayer(page, b, true);
  await page.keyboard.press(`Alt+${MOD}+v`);
  await page.waitForTimeout(250);
  const d3 = await doc(page);
  const T1 = d3.elements.find((e) => e.id === t1);
  const T2 = d3.elements.find((e) => e.id === t2);
  const B3 = d3.elements.find((e) => e.id === b);
  assert(T2.textAnim.enabled && T2.textAnim.unit === 'word' && T2.textAnim.effect === 'none', '⌥⌘V: النصُّ الثاني ينال تتابعَ الأوّل (كلمة، فوري)');
  assert(
    JSON.stringify((T2.anim.tracks.reveal ?? []).map((k) => [k.time, k.value])) === JSON.stringify((T1.anim.tracks.reveal ?? []).map((k) => [k.time, k.value])) && Math.abs(T2.anim.start - 3) < 1e-9,
    `ومسارَ «ظهوره» بأزمنته من بداية مقطعه (٣ث): كلماتُه تظهر بالإيقاع نفسه بعد بدايته (${JSON.stringify((T2.anim.tracks.reveal ?? []).map((k) => [k.time, k.value]))} / ${JSON.stringify((T1.anim.tracks.reveal ?? []).map((k) => [k.time, k.value]))}, البداية ${T2.anim.start})`,
  );
  assert(!B3.anim.tracks.reveal, 'والمستطيلُ المحدَّد معه لا ينال «الظهور» — لا وحداتِ نصٍّ له');

  // الساكن: لا بنودَ حركة في قائمته.
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForSelector('[data-testid="size-menu"]');
  await page.locator('[data-testid="size-option-ig"]').click();
  await page.waitForTimeout(300);
  const stillMedium = await page.evaluate(() => !document.querySelector('[data-testid="timeline-tracks"]'));
  if (stillMedium) {
    await contextMenuOn(page, b);
    assert((await page.locator('[data-testid="sm-copy-anim"]').count()) === 0, 'في مستندٍ ساكن لا «نسخ الحركة» — لا خطَّ زمنيَّ تُرى عليه');
    await page.keyboard.press('Escape');
  }

  assert(pageErrors.length === 0, `لا أخطاءَ في الصفحة: ${JSON.stringify(pageErrors)}`);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail) {
    for (const f of failures) console.error('  ↳ FAILED:', f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
