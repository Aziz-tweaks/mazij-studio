#!/usr/bin/env node
// المرحلة ١ من تصوّر «لوحة واحدة، ثلاثة أعماق» — اعتمده المالك في ٢٤ أكتوبر ٢٠٢٦
// بقوله: «أهمّ شي الاختصار». هذا الملفّ يقيس ما بُني لأجل ذلك، باللوحة الحقيقيّة:
//
//   ١. لا وضعين: لا «بسيط/احترافي»، والقلم حاضرٌ بحرفه من أوّل لحظة.
//      (بعدها بساعات طلب المالك «الوضع الاحترافي» مسكًا لا بوّابة: «سو نفس الأداة الشائعة للوضع
//      البسيط في الصور واذا اختار احترافي يتحول اكثر الى أداة المتّجهات». هو مفتاحٌ في «أدوات
//      متقدّمة» يغيّر مقابض النصّ وحدها ولا يُخفي أداة — يقيسه `tour-fixes` §١٧. فما يمنعه
//      هذا القسم باقٍ كما هو: زرّا «بسيط/احترافي» يقسمان الأدوات.)
//   ٢. حروف الأدوات تعمل **والكيبورد عربي** (`e.code` لا `e.key`).
//   ٣. ⌘D وC وX وV وA — بخطوة تراجعٍ واحدة لكلّ فعل.
//   ٤. لوحة الاختصارات (?) تُفتح وتُغلق — و«؟» العربيّة تفتحها.
//   ٥. الشريط السياقي فوق المحدَّد: المقاس، العريض، اللون.
//   ٦. «حرّك» على بوستر ساكن يجعله مشهدًا ويطلع الخطّ الزمنيّ — وتراجعٌ واحد يرجّعه.
//   ٧. Esc سُلّمٌ للسطح: يُلغي التحديد، ثم يرجع للتحديد.
//   ٨. ⌘\ يُخفي الألواح ويُرجعها.
//   ٩. Space: نقرةٌ = تشغيل على المستند المُوقَّت.
//  ١٠. Enter على نصٍّ محدَّد = تحرير.
//  ١١. لوح «نصوص» يضيف عنوانًا في وسط اللوحة.
import { chromium } from 'playwright';
import { bootBlank, bootDemo } from './helpers/boot.mjs';

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

/** ضغطةٌ بكيبورد عربي: الحرف عربيٌّ والموضع لاتينيّ — كما يرسلها نظامٌ لغته عربيّة. */
async function arabicKey(page, code, key, opts = {}) {
  await page.evaluate(
    ([code, key, opts]) => {
      const init = { code, key, bubbles: true, cancelable: true, ...opts };
      document.body.dispatchEvent(new KeyboardEvent('keydown', init));
      document.body.dispatchEvent(new KeyboardEvent('keyup', init));
    },
    [code, key, opts],
  );
  await page.waitForTimeout(140);
}

const armedTool = (page) =>
  page.evaluate(() => {
    const on = [...document.querySelectorAll('[data-testid="tool-pill"] [data-tool]')].find((e) => e.getAttribute('aria-pressed') === 'true');
    return on ? on.getAttribute('data-tool') : null;
  });
const elCount = (page) => page.evaluate(() => document.querySelectorAll('[data-testid="artboard"] [data-el-id]').length);
const elIds = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="artboard"] [data-el-id]')].map((n) => n.getAttribute('data-el-id')));
const history = (page) => page.evaluate(() => Number(document.querySelector('[data-testid="undo-btn"]')?.getAttribute('data-history-past') ?? -1));
async function geoOf(page, id) {
  return page.evaluate((elId) => {
    const ab = document.querySelector('[data-testid="artboard"]');
    const abr = ab.getBoundingClientRect();
    const sx = +ab.getAttribute('data-doc-w') / abr.width;
    const sy = +ab.getAttribute('data-doc-h') / abr.height;
    const n = document.querySelector(`[data-el-id="${elId}"]`);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: (r.x - abr.x) * sx, y: (r.y - abr.y) * sy, w: r.width * sx, h: r.height * sy };
  }, id);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // ═════════════════════════ ١. لا وضعين ═════════════════════════
  console.log('\n١. لا «بسيط/احترافي»');
  await bootBlank(page, BASE_URL, 'ig');
  assert((await page.getByRole('button', { name: 'احترافي', exact: true }).count()) === 0, 'لا زرّ «احترافي» في الواجهة');
  assert((await page.getByRole('button', { name: 'بسيط', exact: true }).count()) === 0, 'ولا «بسيط»');
  for (const id of ['select', 'direct', 'pen', 'text', 'shape', 'hand']) {
    assert((await page.locator(`[data-testid="tool-pill"] [data-tool="${id}"]`).count()) === 1, `حبّة الأدوات تحمل «${id}» من أوّل لحظة`);
  }

  // ═════════════════════════ ٢. الحروف بكيبورد عربي ═════════════════════════
  console.log('\n٢. حروف الأدوات تعمل والكيبورد عربي');
  const LETTERS = [
    ['KeyP', 'ح', 'pen'],
    ['KeyA', 'ش', 'direct'],
    ['KeyH', 'ا', 'hand'],
    ['KeyT', 'ف', 'text'],
    ['KeyM', 'ة', 'shape'],
    ['KeyV', 'ر', 'select'],
  ];
  for (const [code, key, tool] of LETTERS) {
    await arabicKey(page, code, key);
    assert((await armedTool(page)) === tool, `${code} (والحرف «${key}») يسلّح «${tool}»`);
  }
  // الحرف يُسلِّح ولا يفتح لوحًا: لوحٌ يفتح مع M كان يدفع اللوحة لحظة يبدأ السحب.
  const abBefore = await page.locator('[data-testid="artboard"]').boundingBox();
  await arabicKey(page, 'KeyM', 'ة');
  const abAfter = await page.locator('[data-testid="artboard"]').boundingBox();
  assert((await page.locator('[data-testid="content-panel"]').count()) === 0, 'M يُسلِّح المستطيل ولا يفتح لوح الأشكال');
  assert(Math.abs(abAfter.x - abBefore.x) < 0.5 && Math.abs(abAfter.width - abBefore.width) < 0.5, 'فاللوحة لا تتحرّك تحت يدك لحظة التسليح');
  await arabicKey(page, 'KeyV', 'ر');

  // ═════════════════════════ ١١. لوح «نصوص» ═════════════════════════
  console.log('\n١١. لوح «نصوص» يضيف عنوانًا في الوسط');
  await page.locator('[data-rail="text"]').click();
  await page.waitForTimeout(150);
  const before = await elCount(page);
  const histBefore = await history(page);
  await page.locator('[data-text-preset="heading"]').click();
  await page.waitForTimeout(250);
  const ids1 = await elIds(page);
  assert(ids1.length === before + 1, `«أضف عنوان» يضيف عنصرًا واحدًا (${before} ← ${ids1.length})`);
  assert((await history(page)) === histBefore + 1, 'بخطوة تراجعٍ واحدة');
  const head = ids1[ids1.length - 1];
  const g = await geoOf(page, head);
  assert(g && Math.abs(g.x + g.w / 2 - 540) < 4, `والعنوان في وسط اللوحة أفقيًّا (مركزه ${g && (g.x + g.w / 2).toFixed(1)})`);
  assert((await page.locator('[data-testid="context-bar"]').count()) === 1, 'والشريط السياقي ظاهرٌ فوقه');

  // ═════════════════════════ ٥. الشريط السياقي ═════════════════════════
  console.log('\n٥. الشريط السياقي');
  const bar = await page.locator('[data-testid="context-bar"]').boundingBox();
  const elBox = await page.locator(`[data-el-id="${head}"]`).boundingBox();
  const overlap = !(bar.x + bar.width <= elBox.x || elBox.x + elBox.width <= bar.x || bar.y + bar.height <= elBox.y || elBox.y + elBox.height <= bar.y);
  assert(!overlap, `الشريط لا يغطّي العنصر المحدَّد (شريط ${Math.round(bar.x)},${Math.round(bar.y)} ${Math.round(bar.width)}×${Math.round(bar.height)})`);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  assert(bar.y + bar.height <= ab.y, 'ولا يغطّي التصميمَ أصلًا: مثبَّتٌ أعلى اللوحة، فوق حافّتها');
  const size0 = Number(await page.locator('[data-testid="ctx-size"]').innerText());
  await page.locator('[data-testid="ctx-size-up"]').click();
  await page.waitForTimeout(120);
  const size1 = Number(await page.locator('[data-testid="ctx-size"]').innerText());
  assert(size1 === size0 + 4, `«أكبر» يزيد المقاس ٤ (${size0} ← ${size1})`);
  const boldBefore = await page.locator('[data-testid="ctx-bold"]').getAttribute('aria-pressed');
  await page.locator('[data-testid="ctx-bold"]').click();
  await page.waitForTimeout(120);
  const boldAfter = await page.locator('[data-testid="ctx-bold"]').getAttribute('aria-pressed');
  assert(boldBefore !== boldAfter, `«B» يبدّل العريض (${boldBefore} ← ${boldAfter})`);
  await page.locator('[data-testid="ctx-color"]').click();
  await page.waitForTimeout(120);
  await page.locator('[data-testid="ctx-swatch-E8743B"]').click();
  await page.waitForTimeout(150);
  const color = await page.locator(`[data-el-id="${head}"]`).evaluate((n) => getComputedStyle(n).color);
  assert(color === 'rgb(232, 116, 59)', `اختيار لونٍ من الشريط يلوّن النصّ فعلًا (${color})`);

  // ═════════════════════════ ٣. ⌘D وC وV وX وA ═════════════════════════
  console.log('\n٣. التكرار والنسخ واللصق');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await page.locator(`[data-el-id="${head}"]`).click({ force: true });
  await page.waitForTimeout(150);
  let n0 = await elCount(page);
  let h0 = await history(page);
  await arabicKey(page, 'KeyD', 'ي', { metaKey: isMac, ctrlKey: !isMac });
  const afterDup = await elIds(page);
  assert(afterDup.length === n0 + 1, `⌘D يكرّر المحدَّد (${n0} ← ${afterDup.length})`);
  assert((await history(page)) === h0 + 1, 'بخطوة تراجعٍ واحدة');
  const dup = afterDup.find((id) => !ids1.includes(id));
  const gHead = await geoOf(page, head);
  const gDup = await geoOf(page, dup);
  assert(gDup && Math.abs(gDup.x - gHead.x - 24) < 1.5 && Math.abs(gDup.y - gHead.y - 24) < 1.5, `والنسخة مُزاحة ٢٤ بكسل (${(gDup.x - gHead.x).toFixed(1)}، ${(gDup.y - gHead.y).toFixed(1)})`);
  assert((await page.locator(`[data-layer-id="${dup}"]`).getAttribute('data-selected')) === 'true', 'والنسخة هي المحدَّدة');
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(150);
  assert((await elCount(page)) === n0, '⌘Z واحدة تُلغي التكرار كلّه');

  await page.locator(`[data-el-id="${head}"]`).click({ force: true });
  await page.waitForTimeout(150);
  await arabicKey(page, 'KeyC', 'ؤ', { metaKey: isMac, ctrlKey: !isMac });
  n0 = await elCount(page);
  await page.keyboard.press(`${MOD}+v`);
  await page.waitForTimeout(200);
  assert((await elCount(page)) === n0 + 1, `⌘C ثم ⌘V يلصق نسخة (${n0} ← ${await elCount(page)})`);
  await page.keyboard.press(`${MOD}+v`);
  await page.waitForTimeout(200);
  const pasted = await elIds(page);
  assert(pasted.length === n0 + 2, 'ولصقةٌ ثانية تضيف ثانية');
  const gP1 = await geoOf(page, pasted[pasted.length - 2]);
  const gP2 = await geoOf(page, pasted[pasted.length - 1]);
  assert(gP2 && gP1 && Math.abs(gP2.x - gP1.x - 24) < 1.5, `واللصقات تتدرّج ولا تتكدّس (${(gP2.x - gP1.x).toFixed(1)})`);

  await arabicKey(page, 'KeyA', 'ش', { metaKey: isMac, ctrlKey: !isMac });
  const selected = await page.evaluate(() => [...document.querySelectorAll('[data-layer-id][data-selected="true"]')].length);
  assert(selected === (await elCount(page)), `⌘A يحدّد كلّ العناصر (${selected})`);
  assert((await page.locator('[data-testid="ctx-group"]').count()) === 1, 'والشريط السياقي يصير شريط تحديدٍ متعدّد (جمّع/رتّب)');

  n0 = await elCount(page);
  await page.keyboard.press(`${MOD}+x`);
  await page.waitForTimeout(200);
  assert((await elCount(page)) === 0, `⌘X يقصّ الكلّ (${n0} ← ${await elCount(page)})`);
  await page.keyboard.press(`${MOD}+v`);
  await page.waitForTimeout(200);
  assert((await elCount(page)) === n0, '⌘V يرجّعها');

  // ═════════════════════════ ٧. Esc ═════════════════════════
  console.log('\n٧. Esc يرجّعك للسطح');
  assert((await page.evaluate(() => document.querySelectorAll('[data-layer-id][data-selected="true"]').length)) > 0, 'تمهيد: في تحديد');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert((await page.evaluate(() => document.querySelectorAll('[data-layer-id][data-selected="true"]').length)) === 0, 'Esc يُلغي التحديد');
  assert((await page.locator('[data-testid="context-bar"]').count()) === 0, 'والشريط السياقي يختفي معه');
  await arabicKey(page, 'KeyP', 'ح');
  assert((await armedTool(page)) === 'pen', 'تمهيد: القلم مسلَّح');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert((await armedTool(page)) === 'select', 'Esc بلا تحديد يرجّع أداة التحديد');

  // ═════════════════════════ ٤. لوحة الاختصارات ═════════════════════════
  console.log('\n٤. لوحة الاختصارات');
  await page.keyboard.press('Shift+Slash');
  await page.waitForTimeout(150);
  assert((await page.locator('[data-testid="shortcuts-sheet"]').count()) === 1, '? تفتح لوحة الاختصارات');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert((await page.locator('[data-testid="shortcuts-sheet"]').count()) === 0, 'وEsc تغلقها');
  await arabicKey(page, 'Slash', '؟', { shiftKey: true });
  assert((await page.locator('[data-testid="shortcuts-sheet"]').count()) === 1, '«؟» العربيّة تفتحها كذلك');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);

  // ═════════════════════════ ٨. ⌘\ ═════════════════════════
  console.log('\n٨. ⌘\\ يُخفي الألواح');
  assert((await page.locator('[data-testid="inspector"]').count()) === 1, 'تمهيد: المفتش ظاهر');
  await page.keyboard.press(`${MOD}+Backslash`);
  await page.waitForTimeout(200);
  assert((await page.locator('[data-testid="inspector"]').count()) === 0 && (await page.locator('[data-testid="inspector-open"]').count()) === 1, '⌘\\ يطوي المفتش إلى شريط رفيع');
  await page.keyboard.press(`${MOD}+Backslash`);
  await page.waitForTimeout(200);
  assert((await page.locator('[data-testid="inspector"]').count()) === 1, 'وضغطةٌ ثانية ترجّعه');

  // ═════════════════════════ ١٠. Enter ═════════════════════════
  console.log('\n١٠. Enter على نصٍّ محدَّد');
  const anyText = (await elIds(page)).find((id) => id.startsWith('text'));
  await page.locator(`[data-el-id="${anyText}"]`).click({ force: true });
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  assert((await page.locator('[contenteditable="true"]').count()) === 1, 'Enter يدخل تحرير النصّ');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // ═════════════════════════ ٦. «حرّك» على الساكن ═════════════════════════
  console.log('\n٦. «حرّك» يجعل البوستر مشهدًا');
  await bootDemo(page, BASE_URL);
  assert((await page.locator('[data-testid="artboard-medium"]').getAttribute('data-medium')) === 'still', 'تمهيد: البوستر ساكن');
  assert((await page.locator('[data-testid="timeline-tracks"]').count()) === 0, 'ولا خطّ زمنيّ');
  assert((await page.locator('[data-testid="props-anim-presets"]').count()) === 0, 'ولا قائمةَ حركةِ دخولٍ في المفتش لبوسترٍ ساكن — بابها «حرّك»');
  await page.locator('[data-el-id="head"]').click({ force: true });
  await page.waitForTimeout(150);
  const hBefore = await history(page);
  await page.locator('[data-testid="ctx-animate"]').click();
  await page.waitForTimeout(120);
  await page.locator('[data-testid="ctx-anim-fade"]').click();
  await page.waitForTimeout(450);
  assert((await page.locator('[data-testid="artboard-medium"]').getAttribute('data-medium')) === 'timed', '«حرّك» يجعل المستند مُوقَّتًا');
  assert((await page.locator('[data-testid="timeline-tracks"]').count()) === 1, 'ويطلع الخطّ الزمنيّ من تحت');
  assert((await history(page)) === hBefore + 1, 'بخطوة تراجعٍ واحدة');
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(250);
  assert((await page.locator('[data-testid="artboard-medium"]').getAttribute('data-medium')) === 'still', 'وتراجعٌ واحد يرجّعه بوسترًا ساكنًا');
  assert((await page.locator('[data-testid="timeline-tracks"]').count()) === 0, 'ويختفي الخطّ معه');

  // ═════════════════════════ ٩. Space ═════════════════════════
  console.log('\n٩. Space نقرةٌ = تشغيل');
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.locator('[data-testid="size-option-ig-reel"]').click();
  await page.waitForSelector('[data-testid="timeline-tracks"]');
  await page.waitForTimeout(200);
  await page.mouse.click(5, 450); // تركيزٌ على الصفحة لا على زرّ
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const playBtn = page.locator('[data-testid="timeline-play-btn"]');
  assert((await playBtn.getAttribute('aria-pressed')) === 'false', 'تمهيد: متوقّف');
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  assert((await playBtn.getAttribute('aria-pressed')) === 'true', 'Space تشغّل');
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  assert((await playBtn.getAttribute('aria-pressed')) === 'false', 'وSpace ثانية توقف');

  assert(pageErrors.length === 0, `بلا أخطاء صفحة: ${pageErrors.join('; ')}`);
  console.log(`\n${pass} passed, ${fail} failed.`);
  if (failures.length) failures.forEach((f) => console.log(' -', f));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
