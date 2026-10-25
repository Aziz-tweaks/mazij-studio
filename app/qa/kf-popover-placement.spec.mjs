#!/usr/bin/env node
// **منبثقةُ المفتاح كلُّها داخل النافذة — ٢٥ أكتوبر ٢٠٢٦.**
//
// ظهر العيبان حين نُسخ مقطعٌ حقيقيٌّ بالأزرار على شاشة لابتوب (ارتفاعُها ٨٢٠):
//   ١. مفتاحٌ في صفّ أوّلِ طبقة: المنبثقةُ تنزل تحت صفّها، واللوحُ في أسفل النافذة،
//      فيُفتح محرّرُ المنحنى («مخصّص») تحت حافّة النافذة — لا يُرى ولا تُكتب أرقامه.
//   ٢. مفتاحٌ عند الثانية صفر: الصندوقُ يبدأ قبل حافّة اللوح بتسعين بكسلًا فيُقصّ.
//
//   ١. مفتاحُ الصفر في أوّل طبقة: المنبثقةُ لا تخرج من يسار النافذة.
//   ٢. «مخصّص» عليه: المنبثقةُ بمحرّرها كلُّها داخل النافذة، ولا تغطّي الماسة.
//   ٣. والأرقامُ الأربعة تُكتب فعلًا من هناك وتصل إلى المستند.
//   ٤. والمعتادُ لم يتغيّر: مفتاحٌ بمحرّرٍ مغلق يبقى في جهته الأولى (تحت صفّه هنا).
//   ٥. وتتبع ماستها حين يتغيّر شيءٌ في اللوح (تكبيرُ الخطّ الزمنيّ).
//   ٦. و`Escape` بعد لمس الماسات يُغلقها ويُبقي ما كُتب، ويصل إلى قوائم أخرى — كان
//      مستمعُ سحبٍ يُضاف بالتقاطٍ ويُزال بغيره فيبقى ويبتلع كلَّ `Escape` (`Clip.tsx`).
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

const key = (id, time, value) => ({ id, time, value, easing: 'linear', bezier: [0, 0, 1, 1] });
function shape(id, y) {
  return {
    id, type: 'shape', visible: true, locked: false, opacity: 100, maskId: null,
    geo: { x: 0.2, y, w: 0.3, h: 0.1, rotation: 0 }, shape: 'rect', fill: '#d33', fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0,
    anim: { preset: 'none', start: 0, duration: 2, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [],
      tracks: { x: [key(`${id}-k0`, 0, 0), key(`${id}-k1`, 1, 0.1)] } },
  };
}

async function main() {
  const browser = await chromium.launch();
  // ارتفاعُ شاشة اللابتوب الذي ظهر عليه العيب.
  const page = await browser.newPage({ viewport: { width: 1440, height: 820 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootBlank(page, BASE_URL, 'ig-reel');
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
  // `top` آخِرُ عنصر، فهو أعلى طبقةٍ وأوّلُ صفٍّ في اللوح.
  await page.evaluate(({ k, els }) => {
    const raw = JSON.parse(window.localStorage.getItem(k));
    raw.artboards[0].doc.elements = els;
    window.localStorage.setItem(k, JSON.stringify(raw));
  }, { k: AUTOSAVE_KEY, els: [shape('low', 0.6), shape('top', 0.2)] });
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(400);

  await page.locator('[data-testid="expand-top"]').click();
  await page.waitForTimeout(200);
  const vp = page.viewportSize();
  const inside = (b) => b && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width + 0.5 && b.y + b.height <= vp.height + 0.5;

  // ═════════════ ١. مفتاحُ الصفر في أوّل طبقة ═════════════
  const k0 = page.locator('[data-testid="kf-top-top-k0"]');
  await k0.click();
  await page.waitForTimeout(200);
  const pop = page.locator('[data-testid="kf-popover"]');
  let pb = await pop.boundingBox();
  assert((await pop.count()) === 1 && pb && pb.x >= 0, `منبثقةُ مفتاح الصفر لا تخرج من يسار النافذة (x = ${pb && pb.x.toFixed(1)})`);
  const kb = await k0.boundingBox();
  assert(pb.y >= kb.y + kb.height, `وتنزل تحت صفّها كما كانت — صفُّ أوّل طبقةٍ قريبٌ من أعلى اللوح (أعلاها ${pb.y.toFixed(0)} ≥ أسفل الماسة ${(kb.y + kb.height).toFixed(0)})`);

  // ═════════════ ٢. «مخصّص» ═════════════
  await page.locator('[data-testid="kf-easing-custom"]').click();
  await page.waitForTimeout(250);
  pb = await pop.boundingBox();
  const nums = page.locator('[data-testid="bezier-numbers"]');
  const nb = await nums.boundingBox();
  assert(inside(pb), `المنبثقةُ بمحرّر المنحنى كلُّها داخل النافذة (${pb.x.toFixed(0)},${pb.y.toFixed(0)} ${pb.width.toFixed(0)}×${pb.height.toFixed(0)} في ${vp.width}×${vp.height})`);
  assert(inside(nb), `وخاناتُ الأرقام الأربع ظاهرةٌ داخلها (أسفلُها ${(nb.y + nb.height).toFixed(0)} ≤ ${vp.height})`);
  const overlaps = !(pb.x + pb.width <= kb.x || kb.x + kb.width <= pb.x || pb.y + pb.height <= kb.y || kb.y + kb.height <= pb.y);
  assert(!overlaps, 'ولا تغطّي الماسة — سحبُها التالي يبقى لها');

  // ═════════════ ٣. الأرقام تُكتب ═════════════
  const vals = ['0.33', '0.53', '0.67', '1.07'];
  for (let i = 0; i < 4; i++) {
    const f = page.locator(`[data-testid="bezier-num-${i}"]`);
    await f.click({ clickCount: 3 });
    await f.fill(vals[i]);
    await f.press('Enter');
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(900);
  const kf0 = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k)).artboards[0].doc.elements.find((e) => e.id === 'top').anim.tracks.x[0], AUTOSAVE_KEY);
  assert(kf0.easing === 'custom' && JSON.stringify(kf0.bezier) === JSON.stringify([0.33, 0.53, 0.67, 1.07]), `والأرقامُ الأربعة وصلت إلى المفتاح (${kf0.easing} ${JSON.stringify(kf0.bezier)})`);

  // ═════════════ ٤. المعتادُ لم يتغيّر ═════════════
  const k1 = page.locator('[data-testid="kf-top-top-k1"]');
  await k1.click();
  await page.waitForTimeout(200);
  pb = await pop.boundingBox();
  const k1b = await k1.boundingBox();
  assert(pb.y >= k1b.y + k1b.height && inside(pb), `مفتاحٌ بمحرّرٍ مغلق يبقى في جهته الأولى، تحت صفّه وداخل النافذة (${pb.y.toFixed(0)} ≥ ${(k1b.y + k1b.height).toFixed(0)})`);
  const cx = pb.x + 90;
  assert(Math.abs(cx - (k1b.x + k1b.width / 2)) <= 1.5, `وأفقيًّا في موضعها القديم نفسه: يسارُها قبل الماسة بتسعين (${cx.toFixed(1)} ≈ ${(k1b.x + k1b.width / 2).toFixed(1)})`);

  // ═════════════ ٥. تتبع ماستها ═════════════
  await page.locator('[data-testid="tl-zoom-in"]').click();
  await page.waitForTimeout(300);
  const pb2 = await pop.boundingBox();
  const k1b2 = await k1.boundingBox();
  assert(Math.abs(pb2.x + 90 - (k1b2.x + k1b2.width / 2)) <= 1.5 || pb2.x <= 8.5 || pb2.x + pb2.width >= vp.width - 8.5, `وبعد تكبير الخطّ الزمنيّ تتبع الماسةَ إلى موضعها الجديد (${(pb2.x + 90).toFixed(1)} ≈ ${(k1b2.x + k1b2.width / 2).toFixed(1)})`);

  // ═════════════ ٥ب. طيُّ الطبقة يُخفيها ═════════════
  await page.locator('[data-testid="expand-top"]').click();
  await page.waitForTimeout(250);
  assert(!(await pop.isVisible()), 'وطيُّ الطبقة — وماستُها معه — يُخفي المنبثقة ولا يتركها معلّقةً فوق صفوفٍ أخرى');
  await page.locator('[data-testid="expand-top"]').click();
  await page.waitForTimeout(250);
  assert(await pop.isVisible(), 'وفتحُها يُعيدها إلى ماستها');

  // ═════════════ ٦. Escape بعد لمس الخطّ الزمنيّ ═════════════
  // كلُّ ضغطةٍ على مقطعٍ أو ماسةٍ كانت تترك على النافذة مستمعَ `Escape` بطور الالتقاط
  // (يُضاف بـ`true` ويُزال بغيره)، فيبتلع كلَّ `Escape` بعدها ويُنادي `cancelElementEdit`.
  // والنقراتُ على الماسات أعلاه كلُّها إيماءات — فهنا يُقاس ما بعدها.
  const field = page.locator('[data-testid="kf-value-field"]');
  await field.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('7.5', { delay: 30 });
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  assert((await pop.count()) === 0, '`Escape` والحقلُ مركَّزٌ يُغلق منبثقةَ المفتاح — بعد نقرات ماساتٍ كثيرة');
  await page.waitForTimeout(900);
  const k1saved = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k)).artboards[0].doc.elements.find((e) => e.id === 'top').anim.tracks.x.find((kf) => kf.id === 'top-k1'), AUTOSAVE_KEY);
  assert(k1saved && Math.abs(k1saved.value - 0.075) < 1e-9, `وما كُتب قبله («7.5») باقٍ في مفتاحه — لا يُلغيه مستمعٌ متروك (${k1saved && k1saved.value})`);
  await page.locator('[data-testid="layer-name-top"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="easing-menu-button"]').click();
  await page.waitForTimeout(200);
  assert((await page.locator('[data-testid="easing-menu"]').count()) === 1, 'وقائمةُ التخفيف تُفتح');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  assert((await page.locator('[data-testid="easing-menu"]').count()) === 0, '**و`Escape` يُغلقها** — يصل إلى مستمعها على المستند ولا يبتلعه مستمعُ سحبٍ انتهى');

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
