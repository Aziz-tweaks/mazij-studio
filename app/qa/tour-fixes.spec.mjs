#!/usr/bin/env node
// **جولة الاستخدام الحقيقيّة — ٢٤ أكتوبر ٢٠٢٦.**
//
// طلب المالك: «خذ لفه على البرنامج واستخدمه زي المستخدم الحقيقي وطلع الاخطاء
// وحلها». فاستُعمل البرنامج المثبّت نفسه (لا المتصفّح) كما يستعمله مصمّم: قالب، نصّ،
// شكل، صورة، «حرّك»، تصدير، الزرّ الأيمن، لوحة البحث، والكيبورد العربي. وكلّ بندٍ هنا
// خطأٌ ظهر هناك فعلًا، يُقاس بالإيماءة نفسها التي كشفته:
//
//   ١. الزوايا: شريطٌ مدوَّر يُرسَم على اللوحة كبسولةً كما يطلع في التصدير (كان بيضاويًّا).
//   ٢. نقرةٌ مزدوجة على حروف نصٍّ صغير تدخل تحريره (كانت تقع على مقبض الحافّة).
//   ٣. لوح «عناصر» يبقى مفتوحًا بعد وضع شكل، كلوح «نصوص».
//   ٤. أسماء الدمج بالعربي في الواجهة العربيّة.
//   ٥. منبثقات الشريط السياقي تحت زرّها وداخل المسرح.
//   ٦. «حرّك ← بدون» على ساكن لا تجعله فيديو.
//   ٧. أداة النصّ: النصّ يبدأ حيث نقرت.
//   ٨. حافّة اللوحة تُرى على المسرح الداكن.
//   ٩. الزرّ الأيمن: قائمةٌ عربيّة بأوامر العنصر — لا «Reload».
//  ١٠. Enter يحدّد النصّ كلّه، والنصّ النائب يُستبدَل.
//  ١١. لوحة البحث: «تيك توك» يصير فيديو، و«ظهور تدريجي» يحرّك فعلًا، ولا اختصارات كاذبة.
//  ١٢. ⌘Z والكيبورد عربي — وداخل النصّ قيد التحرير يمحو الكتابة لا الصندوق.
//  ١٣. Esc يسكّر الحوارات.
//  ١٤. إطار صورة فاضٍ: «اختر صورة» لا «بدّل».
//  ١٥. مِزو: اسمه مرّة واحدة في رأس اللوح.
//  ١٦. اقتراحات مِزو باللهجة، ومِزو المحلّي يفهمها.
import { chromium } from 'playwright';
import { bootBlank, bootDemo, AUTOSAVE_KEY } from './helpers/boot.mjs';

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
const near = (a, b, tol) => Math.abs(a - b) <= tol;

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
  await page.waitForTimeout(160);
}

const elIds = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="artboard"] [data-el-id]')].map((n) => n.getAttribute('data-el-id')));
const history = (page) => page.evaluate(() => Number(document.querySelector('[data-testid="undo-btn"]')?.getAttribute('data-history-past') ?? -1));
const editingId = (page) => page.evaluate(() => document.querySelector('[data-testid="artboard"] [contenteditable="true"]')?.closest('[data-el-id]')?.getAttribute('data-el-id') ?? null);
const selectionText = (page) => page.evaluate(() => window.getSelection()?.toString() ?? '');

async function openStarter(page, id) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.locator(`[data-testid="starter-${id}"]`).click();
  await page.waitForSelector('[data-testid="artboard"]');
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // ═════════════════════════ ١. الزوايا ═════════════════════════
  console.log('\n١. الشريط المدوَّر كبسولةٌ على اللوحة كما في التصدير');
  await openStarter(page, 'stat-infographic');
  const track = await page.evaluate(() => {
    const host = document.querySelector('[data-el-id="row0-track"]');
    const inner = host?.firstElementChild;
    if (!inner) return null;
    const cs = getComputedStyle(inner);
    const ab = document.querySelector('[data-testid="artboard"]');
    // الأبعاد بوحدة اللوحة (قبل تحويل الزوم) — هي ما يحسب به التصدير.
    const docW = +ab.getAttribute('data-doc-w');
    const k = docW / ab.getBoundingClientRect().width;
    const r = host.getBoundingClientRect();
    return { tl: cs.borderTopLeftRadius, w: r.width * k, h: r.height * k };
  });
  assert(track !== null, 'شريط الصفّ الأوّل في قالب «إنفوجرافيك» موجود');
  if (track) {
    const want = Math.min(track.w, track.h) * 0.5;
    assert(/^[\d.]+px$/.test(track.tl), `نصف القطر طولٌ واحد بالبكسل لا نسبةٌ مئويّة من كلّ ضلع (حُسب «${track.tl}»)`);
    assert(near(parseFloat(track.tl), want, 0.6), `ويساوي نصفَ أقصر الضلعين ${want.toFixed(2)} — صيغةُ التصدير \`Math.min(bw, bh) * radius\` (حُسب ${parseFloat(track.tl).toFixed(2)})`);
  }

  // ═════════════════════════ ٢. النقرة المزدوجة على نصٍّ صغير ═════════════════════════
  console.log('\n٢. نقرةٌ مزدوجة على حروف نصٍّ صغير تدخل تحريره');
  // العنوان بمقاس ٣٢ وحروفه عند أعلى صندوقه. نقرةٌ أولى تحدّده فتظهر المقابض؛ والنقطة
  // نفسها تصير تحت مقبض الحافّة العليا.
  const tb = await page.locator('[data-el-id="title"]').boundingBox();
  const pt = { x: tb.x + tb.width - 24, y: tb.y + 6 };
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(200);
  const underPoint = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-handle]')?.getAttribute('data-handle') ?? null, [pt.x, pt.y]);
  assert(underPoint === 'n', `الشرط الذي كشف العطب قائم: بعد التحديد تقع النقطة على حروف العنوان تحت مقبض الحافّة العليا (وُجد «${underPoint}»)`);
  await page.mouse.dblclick(pt.x, pt.y);
  await page.waitForTimeout(300);
  assert((await editingId(page)) === 'title', 'والنقرة المزدوجة هناك تدخل تحرير العنوان');
  const caretInside = await page.evaluate(() => {
    const ed = document.querySelector('[data-testid="artboard"] [contenteditable="true"]');
    const sel = window.getSelection();
    return !!ed && !!sel && sel.rangeCount > 0 && ed.contains(sel.getRangeAt(0).startContainer);
  });
  assert(caretInside, 'والمؤشّر داخل النصّ المحرَّر — لا تحديدٌ خارج المحرّر تذهب إليه الحروف');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // ═════════════════════════ ٨. حافّة اللوحة ═════════════════════════
  console.log('\n٨. حافّة اللوحة تُرى على المسرح الداكن');
  const ring = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="artboard"]')).boxShadow);
  assert(/0px 0px 0px [\d.]+px/.test(ring), `اللوحة تحمل حدًّا شعريًّا (ظلّ بلا إزاحة ولا تمويه وبامتداد) فوق ظلّها — «${ring.slice(0, 90)}»`);

  // ═════════════════════════ ٦. «حرّك ← بدون» على ساكن ═════════════════════════
  console.log('\n٦. «حرّك ← بدون» على تصميمٍ ساكن لا تجعله فيديو');
  await bootDemo(page, BASE_URL);
  await page.locator('[data-el-id="discount"]').click({ force: true });
  await page.waitForTimeout(200);
  await page.locator('[data-testid="ctx-animate"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-testid="ctx-anim-none"]').click();
  await page.waitForTimeout(250);
  assert((await page.locator('[data-testid="timeline-panel"]').count()) === 0, 'لا خطّ زمنيّ يطلع — المستند بقي صورة');
  assert((await page.locator('[data-testid="layers-dock"]').count()) === 1, 'ولوح الطبقات الساكن باقٍ مكانه');
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="artboard"] [data-el-id]')].filter((n) => parseFloat(getComputedStyle(n).opacity) < 0.05).map((n) => n.getAttribute('data-el-id')),
  );
  assert(hidden.length === 0, `ولا عنصر اختفى من التصميم (المخفيّ: ${JSON.stringify(hidden)})`);

  // ═════════════════════════ ٥. المنبثقات ═════════════════════════
  console.log('\n٥. منبثقات الشريط السياقي تحت زرّها وداخل المسرح');
  async function popCheck(triggerSel, label) {
    await page.locator(triggerSel).click();
    await page.waitForTimeout(250);
    const m = await page.evaluate((sel) => {
      const trig = document.querySelector(sel).getBoundingClientRect();
      const pop = document.querySelector('[data-testid="context-bar"] [role="menu"]').getBoundingClientRect();
      const stage = document.querySelector('.mz-stage').getBoundingClientRect();
      return { trigL: trig.left, trigR: trig.right, popL: pop.left, popR: pop.right, stageL: stage.left, stageR: stage.right };
    }, triggerSel);
    assert(m.popL >= m.stageL - 0.5 && m.popR <= m.stageR + 0.5, `${label}: داخل المسرح كلّها (${m.popL.toFixed(0)}–${m.popR.toFixed(0)} ضمن ${m.stageL.toFixed(0)}–${m.stageR.toFixed(0)})`);
    assert(m.popR >= m.trigL && m.popL <= m.trigR, `${label}: تحت زرّها لا عند طرف الشريط الآخر`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  // شريط النصّ طويل وزرّ «حرّك» في آخره.
  await page.locator('[data-el-id="head"]').click({ force: true });
  await page.waitForTimeout(200);
  await popCheck('[data-testid="ctx-animate"]', 'قائمة «حرّك» على شريط النصّ');
  // شريط الشكل قصير ولونه أوّله — لوح الألوان كان يخرج من حافّة المسرح.
  await page.locator('[data-el-id="badge"]').click({ force: true });
  await page.waitForTimeout(200);
  await popCheck('[data-testid="context-bar"] [data-testid="ctx-color"]', 'لوح ألوان الشكل');

  // ═════════════════════════ ١٤. إطار صورة فاضٍ ═════════════════════════
  console.log('\n١٤. إطار صورة فاضٍ يقول «اختر صورة»');
  await page.locator('[data-el-id="img"]').click({ force: true });
  await page.waitForTimeout(200);
  const hasSrc = await page.evaluate(() => !!document.querySelector('[data-el-id="img"] img'));
  const replaceLabel = (await page.locator('[data-testid="ctx-replace"]').innerText()).trim();
  assert(hasSrc ? replaceLabel === 'بدّل' : replaceLabel === 'اختر صورة', `زرّ الإطار «${replaceLabel}» يطابق حاله (${hasSrc ? 'فيه صورة' : 'فاضٍ'})`);

  // ═════════════════════════ ١٠. Enter يحدّد النصّ كلّه ═════════════════════════
  console.log('\n١٠. Enter يحدّد النصّ كلّه — والكتابة تستبدله');
  await page.locator('[data-el-id="discount"]').click({ force: true });
  await page.waitForTimeout(200);
  const fullText = await page.evaluate(() => document.querySelector('[data-el-id="discount"]').innerText.trim());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  assert((await editingId(page)) === 'discount', 'Enter يدخل تحرير النصّ المحدَّد');
  assert((await selectionText(page)).trim() === fullText, `والنصّ كلّه محدَّد كما في فيغما («${(await selectionText(page)).trim()}»)`);
  await page.keyboard.type('خصم');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const replaced = await page.evaluate(() => document.querySelector('[data-el-id="discount"]').innerText.trim());
  assert(replaced === 'خصم', `فالكتابة تستبدله كلّه ولا تلتصق بآخره («${replaced}»)`);

  // نقطةُ نقرةٍ مزدوجة قديمة لا تسافر إلى دخولٍ لاحق بـEnter.
  const hb = await page.locator('[data-el-id="head"]').boundingBox();
  await page.mouse.dblclick(hb.x + hb.width * 0.5, hb.y + hb.height * 0.5);
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.locator('[data-el-id="discount"]').click({ force: true });
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  assert((await editingId(page)) === 'discount' && (await selectionText(page)).trim() === 'خصم', 'وEnter بعد نقرةٍ مزدوجة على نصٍّ آخر يحدّد هذا النصّ كلّه — لا موضعَ النقرة القديمة');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // النصّ النائب: نقرةٌ مزدوجة تحدّده كلّه.
  await page.locator('[data-rail="text"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-text-preset="heading"]').click();
  await page.waitForTimeout(250);
  const idsH = await elIds(page);
  const headingId = idsH[idsH.length - 1];
  const nb = await page.locator(`[data-el-id="${headingId}"]`).boundingBox();
  await page.mouse.dblclick(nb.x + nb.width * 0.5, nb.y + nb.height * 0.5);
  await page.waitForTimeout(300);
  assert((await editingId(page)) === headingId, 'نقرةٌ مزدوجة على «عنوانك هنا» تدخل تحريره');
  assert((await selectionText(page)).trim() === 'عنوانك هنا', `والنصّ النائب محدَّدٌ كلّه ليُستبدَل («${(await selectionText(page)).trim()}»)`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // ═════════════════════════ ٣. لوح «عناصر» يبقى ═════════════════════════
  console.log('\n٣. لوح «عناصر» يبقى مفتوحًا بعد وضع شكل');
  await page.keyboard.press('Escape');
  await page.locator('[data-panel-tab="library"]').click();
  await page.waitForTimeout(200);
  const n0 = (await elIds(page)).length;
  await page.locator('[data-shape-tile="rect"]').click();
  await page.waitForTimeout(250);
  assert((await page.locator('[data-testid="content-panel"]').count()) === 1, 'بعد وضع مستطيل يبقى اللوح مفتوحًا');
  await page.locator('[data-shape-tile="ellipse"]').click();
  await page.waitForTimeout(250);
  assert((await elIds(page)).length === n0 + 2, 'فيُوضَع الشكل الثاني من نفس اللوح بلا فتحه من جديد');
  // ولمسُ اللوحة نفسها ما زال يُغلقه. (Esc أوّلًا: الشكلان وُضعا في الوسط محدَّدَين، ومقابض
  // المحدَّد تغطّي ما تحتها — والمقصود نقرةٌ على عنصرٍ لا على مقبض.)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await page.locator('[data-el-id="logo"]').click({ force: true });
  await page.waitForTimeout(200);
  assert((await page.locator('[data-testid="content-panel"]').count()) === 0, 'ولمسُ عنصرٍ على اللوحة ما زال يُغلقه');

  // ═════════════════════════ ٤. أسماء الدمج ═════════════════════════
  console.log('\n٤. أسماء الدمج بالعربي');
  await page.locator('[data-el-id="badge"]').click({ force: true });
  await page.waitForTimeout(250);
  const blendTexts = await page.evaluate(() => [...document.querySelectorAll('select[data-testid$="-blend"] option')].map((o) => o.textContent.trim()));
  assert(blendTexts.length >= 6, `قائمة الدمج حاضرة في المفتش (${blendTexts.length} خيار)`);
  assert(blendTexts.every((t) => !/^(normal|multiply|screen|overlay|darken|lighten)$/i.test(t)), `ولا معرّفٌ إنجليزيّ يظهر للمصمّم: ${JSON.stringify(blendTexts.slice(0, 6))}`);

  // ═════════════════════════ ٩. الزرّ الأيمن ═════════════════════════
  console.log('\n٩. الزرّ الأيمن: قائمةٌ بأوامر العنصر');
  await page.evaluate(() => {
    window.__ctxPrevented = null;
    window.addEventListener('contextmenu', (e) => (window.__ctxPrevented = e.defaultPrevented));
  });
  const before9 = (await elIds(page)).length;
  const bb = await page.locator('[data-el-id="badge"]').boundingBox();
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, { button: 'right' });
  await page.waitForTimeout(250);
  assert((await page.evaluate(() => window.__ctxPrevented)) === true, 'قائمة المتصفّح («Reload») لا تطلع');
  // ماك (WebKit) يحدّد الكلمة تحت المؤشّر عند الزرّ الأيمن — فبقي ظلٌّ أزرق على حروف اللوحة في
  // البرنامج المثبّت. كروميوم لا يفعلها أصلًا فيمرّ هنا بلا كلفة؛ ونسخة WebKit من هذه المواصفة
  // (`shots.local`) هي التي تقيسه فعلًا.
  assert((await selectionText(page)) === '', `ولا تحديدَ نصٍّ أزرق يبقى على حروف اللوحة («${await selectionText(page)}»)`);
  assert((await page.locator('[data-testid="stage-menu"]').count()) === 1, 'وتطلع قائمة البرنامج');
  for (const id of ['sm-copy', 'sm-paste', 'sm-duplicate', 'sm-forward', 'sm-backward', 'sm-lock', 'sm-delete']) {
    assert((await page.locator(`[data-testid="${id}"]`).count()) === 1, `فيها «${id.slice(3)}»`);
  }
  await page.locator('[data-testid="sm-duplicate"]').click();
  await page.waitForTimeout(250);
  assert((await elIds(page)).length === before9 + 1, '«كرّر» منها يكرّر العنصر');
  assert((await page.locator('[data-testid="stage-menu"]').count()) === 0, 'وتُغلق بعد الأمر');
  // على فراغ المسرح: لصق وحدّد الكل، وEsc يغلقها.
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.mouse.click(ab.x - 30, ab.y + 40, { button: 'right' });
  await page.waitForTimeout(250);
  assert((await page.locator('[data-testid="sm-all"]').count()) === 1 && (await page.locator('[data-testid="sm-delete"]').count()) === 0, 'على الفراغ: «حدّد الكل» بلا أوامر عنصر');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert((await page.locator('[data-testid="stage-menu"]').count()) === 0, 'وEsc يغلقها');

  // ═════════════════════════ ١٢. ⌘Z بكيبورد عربي ═════════════════════════
  console.log('\n١٢. ⌘Z يعمل والكيبورد عربي');
  const n12 = (await elIds(page)).length;
  await arabicKey(page, 'KeyD', 'ي', { metaKey: isMac, ctrlKey: !isMac });
  assert((await elIds(page)).length === n12 + 1, '⌘D (ي) يكرّر');
  await arabicKey(page, 'KeyZ', 'ئ', { metaKey: isMac, ctrlKey: !isMac });
  assert((await elIds(page)).length === n12, '⌘Z بحرفه العربي «ئ» يتراجع');
  await arabicKey(page, 'KeyZ', 'ئ', { metaKey: isMac, ctrlKey: !isMac, shiftKey: true });
  assert((await elIds(page)).length === n12 + 1, '⇧⌘Z بحرفه العربي يعيد');

  // داخل النصّ قيد التحرير: ⌘Z يمحو الكتابة، لا الصندوق.
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="tool-pill"] [data-tool="text"]').click();
  await page.waitForTimeout(120);
  const ab2 = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.mouse.click(ab2.x + ab2.width * 0.7, ab2.y + ab2.height * 0.12);
  await page.waitForTimeout(250);
  const newText = await editingId(page);
  assert(newText !== null, 'أداة النصّ تضع نصًّا وتدخل تحريره');
  await page.keyboard.type('مرحبا');
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(250);
  assert((await editingId(page)) === newText && (await elIds(page)).includes(newText), '⌘Z وأنت تكتب لا يتراجع عن إنشاء الصندوق — النصّ وتحريره باقيان');

  // ═════════════════════════ ٧. أداة النصّ: البداية عند النقرة ═════════════════════════
  console.log('\n٧. أداة النصّ: النصّ يبدأ حيث نقرت');
  const clickX = ab2.x + ab2.width * 0.7;
  const nt = await page.locator(`[data-el-id="${newText}"]`).boundingBox();
  assert(near(nt.x + nt.width, clickX, 2.5), `حافّة البداية (يمين الصندوق بالعربيّة) على نقطة النقر: ${(nt.x + nt.width).toFixed(1)} مقابل ${clickX.toFixed(1)}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // ═════════════════════════ ١٣. Esc يسكّر الحوارات ═════════════════════════
  console.log('\n١٣. Esc يسكّر الحوارات');
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="open-templates-btn"]').click();
  await page.waitForSelector('[data-testid="templates-dialog"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert((await page.locator('[data-testid="templates-dialog"]').count()) === 0, 'Esc يسكّر «القوالب»');
  await page.locator('[data-testid="open-artboards-btn"]').click();
  await page.waitForSelector('[data-testid="artboards-dialog"]');
  // Esc داخل حقل إعادة التسمية يُلغي التسمية وحدها، والحوار باقٍ.
  await page.locator('[data-testid^="rename-artboard-"]').first().click();
  await page.waitForSelector('[data-testid^="artboard-rename-input-"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert((await page.locator('[data-testid^="artboard-rename-input-"]').count()) === 0, 'Esc في حقل التسمية يُلغي التسمية');
  assert((await page.locator('[data-testid="artboards-dialog"]').count()) === 1, 'والحوار باقٍ مفتوح معه');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert((await page.locator('[data-testid="artboards-dialog"]').count()) === 0, 'وEsc ثانيةٌ تسكّر «لوحات التصميم»');

  // ═════════════════════════ ١١. لوحة البحث ═════════════════════════
  console.log('\n١١. أوامر لوحة البحث تفعل ما تقول');
  await page.keyboard.press(`${MOD}+k`);
  await page.waitForTimeout(200);
  const hints = await page.evaluate(() => document.body.innerText);
  assert(!/⌘L|⌘T|⌘H/.test(hints), 'لا اختصار مكتوب بجانب أمرٍ لا يسمعه (⌘L و⌘T و⌘H) — و⌘H في ماك «أخفِ البرنامج»');
  await page.keyboard.type('تيك');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  assert((await page.locator('[data-testid="timeline-panel"]').count()) === 1, '«تغيير المقاس إلى تيك توك» يجعله فيديو بخطّه الزمنيّ — كما يفعل منتقي المقاس');
  await page.locator('[data-testid="undo-btn"]').click();
  await page.waitForTimeout(250);
  assert((await page.locator('[data-testid="timeline-panel"]').count()) === 0, 'وتراجعٌ واحد يرجّعه صورة');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${MOD}+k`);
  await page.waitForTimeout(200);
  await page.keyboard.type('ظهور');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  assert((await page.locator('[data-testid="timeline-panel"]').count()) === 1, '«حركة: ظهور تدريجي» تحرّك التصميم فعلًا ويطلع الخطّ الزمنيّ (كانت لا تفعل شيئًا)');

  // ═════════════════════════ ١٥. مِزو ═════════════════════════
  console.log('\n١٥. اسم مِزو مرّة واحدة');
  await page.locator('[data-panel-tab="ai"]').first().click();
  await page.waitForTimeout(250);
  const mizoCount = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="content-panel"]');
    if (!panel) return -1;
    const w = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    let c = 0;
    while (w.nextNode()) if (w.currentNode.textContent.trim() === 'مِزو') c++;
    return c;
  });
  assert(mizoCount === 1, `«مِزو» مكتوبٌ مرّةً واحدة في لوحه (وُجد ${mizoCount})`);

  // ═════════════════════════ ١٦. اقتراح مِزو باللهجة ═════════════════════════
  console.log('\n١٦. «خلّ الشعار نصف شفاف» — اقتراحٌ باللهجة يُفهَم كما كان يُفهَم بالفصحى');
  await bootDemo(page, BASE_URL);
  await page.locator('[data-panel-tab="ai"]').first().click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="ai-engine-local"]').click();
  await page.waitForTimeout(120);
  const chip = page.getByRole('button', { name: 'خلّ الشعار نصف شفاف', exact: true });
  assert((await chip.count()) === 1, 'الاقتراح مكتوبٌ باللهجة («خلّ» لا «اجعل»)');
  await chip.click();
  await page.waitForTimeout(500);
  const logoOpacity = await page.evaluate(() => {
    const n = document.querySelector('[data-el-id="logo"]');
    return n ? parseFloat(getComputedStyle(n).opacity) : null;
  });
  assert(logoOpacity !== null && near(logoOpacity, 0.5, 0.02), `ومِزو المحلّي ينفّذه: الشعار نصف شفاف (${logoOpacity})`);

  // ═════════════════════════ أخطاء صامتة ═════════════════════════
  const realErrors = pageErrors.filter((e) => !/favicon|ResizeObserver loop/i.test(e));
  assert(realErrors.length === 0, realErrors.length ? `بلا أخطاء تشغيل (${realErrors.length}): ${realErrors.slice(0, 3).join(' | ')}` : 'بلا أخطاء تشغيل طوال الجولة');

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
