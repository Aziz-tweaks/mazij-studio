#!/usr/bin/env node
// لونُ العلامة التجاريّة في كومة المظهر: يُكتب ستّ عشريًّا، ويثبت صفُّ الطبقة
// تحت الكتابة.
//
// من أين جاء هذا الملف: حلقة المحاكاة على هدفٍ حقيقيّ — الهدف المنشور في
// `qa/replication/targets/t02-kashida`. ألوانه الأربعة (#f4f1ea و#12382a
// و#1f8f55 و#d93025) لا تعطيها أيُّ لوحةٍ في `PALETTES`، فكان لا بدّ من كتابتها.
// وعند المحاولة سقط أربعةُ بنودٍ على عطلين لم يكشفهما أيُّ اختبارٍ قائم:
//
// (أ) **صفُّ الطبقة كان يُفكَّك ويُركَّب مع كل تصيير.** `migrateAppearance` دالّةٌ
//     مشتقّةٌ تُستدعى في كل تصيير لعنصرٍ لم تُثبَّت كومتُه بعد، وكانت تولّد معرّف
//     طبقةٍ جديدًا في كل مرّة؛ ومحرّر الطبقات يفهرس صفوفه بـ`key={layer.id}`.
//     فالنتيجة أن حقول الصفّ تفقد التركيز عند أوّل ضغطة مفتاح، فتذهب بقيّة
//     الحروف إلى النافذة وتصير اختصارات أدوات (حرف `a` يفتح أداة الصوت!)، ولا
//     يُضبط لونٌ أبدًا. ولم يظهر على الأشكال — تُنشأ بكومةٍ مخزّنة — بل على النصّ
//     والمسار وحدهما، وهما ما لا يختبره `appearance-stack.spec.mjs` لونيًّا.
//
// (ب) **`<input type="color">` كان يتقاتل مع React.** ألوان `PALETTES` مكتوبةٌ
//     بحرفٍ كبير (`#FFFFFF`)، والمتصفّح يُصغّر قيمة مُدخَل اللون دائمًا — فطبقةٌ
//     تتبع رمز لوحةٍ تُمرَّر كبيرةً وتُقرأ صغيرة، فيعيد React كتابة القيمة في كل
//     تصيير ولا تستقرّ.
//
// (ج) ولم يكن في لوح الخصائص كلّه سطحٌ **يُكتب** فيه لون: الشرائح خمسةُ ألوانٍ
//     من اللوحة المطبَّقة، ومُدخَل اللون يفتح حوار النظام. فأُضيف `HexField`.
//
// وكلُّ ما هنا بأحداثٍ حقيقيّة وقياساتٍ حقيقيّة: كتابةٌ بلوحة المفاتيح حرفًا
// حرفًا، ولونٌ يُقرأ من `getComputedStyle` ومن بكسلات PNG مُصدَّرة فعلًا.
//
// Run: node qa/appearance-hex.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import { bootBlank } from './helpers/boot.mjs';

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:1420';
let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}

const DOC = { w: 1080, h: 1350 };

/** يكتب في حقلٍ كما يكتب إنسان: نقرةٌ تُحدّد المحتوى ثم ضغطاتُ مفاتيح حقيقيّة.
 * لا `fill()` هنا إطلاقًا — وهو نفسُه ما أخفى العطل (أ) عن الاختبارات القائمة،
 * لأن `fill()` ضغطةٌ واحدة لا تكشف فقدان التركيز بين الحروف. */
async function typeInto(page, locator, value) {
  await locator.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(String(value), { delay: 20 });
  await page.waitForTimeout(120);
}

const lastElId = (page) =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all.length ? all[all.length - 1].getAttribute('data-el-id') : null;
  });

async function addText(page, content) {
  await page.locator('[data-tool="text"]').click();
  await page.waitForTimeout(180);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.mouse.click(ab.x + ab.width * 0.5, ab.y + ab.height * 0.4);
  await page.waitForTimeout(420);
  await page.keyboard.type(content, { delay: 16 });
  await page.waitForTimeout(220);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(280);
  return lastElId(page);
}

async function addRect(page) {
  // مكتبة الأشكال في «عناصر» بشريط الإضافة؛ زرّ الشكل في حبّة الأدوات يُسلِّح فقط (٢٤ أكتوبر ٢٠٢٦).
  if (!(await page.locator('[data-shape-tile]').count())) await page.locator('[data-panel-tab="library"]').click();
  await page.waitForTimeout(320);
  await page.locator('[data-shape-tile="rect"]').click();
  await page.waitForTimeout(500);
  return lastElId(page);
}

/** يرسم مسارًا مفتوحًا بالقلم بنقراتٍ حقيقيّة — أقربُ ما يكون إلى يد المصمّم. */
async function drawPath(page, pts) {
  await page.locator('[data-tool="pen"]').click();
  await page.waitForTimeout(200);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  for (const p of pts) {
    const cx = ab.x + (p.x / DOC.w) * ab.width;
    const cy = ab.y + (p.y / DOC.h) * ab.height;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(45);
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(380);
  return lastElId(page);
}

const hexSel = (kind, elId) => `[data-testid^="appearance-${kind}-${elId}-"][data-testid$="-hex"]`;
const colorSel = (kind, elId) => `[data-testid^="appearance-${kind}-${elId}-"][data-testid$="-color"]`;
const rowIds = (page, kind, elId) =>
  page.evaluate(
    ([k, id]) => [...document.querySelectorAll(`[data-testid^="appearance-${k}-${id}-"][data-testid$="-hex"]`)].map((e) => e.getAttribute('data-testid')),
    [kind, elId],
  );

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  await bootBlank(page, BASE_URL, 'ig-portrait');
  // لا «بسيط/احترافي» منذ ٢٤ أكتوبر ٢٠٢٦ (قرار المالك: «العمق يُطلب ولا يُفرض») — كلّ الأدوات حاضرة.
  await page.waitForTimeout(250);

  // --- ١. قراءة الستّ عشريّ: الصور التي ينسخ بها المصمّم لونه فعلًا ---------------
  const parsed = await page.evaluate(async () => {
    const mod = await import('/src/lib/appearance.ts');
    const n = mod.normalizeHex;
    return {
      sixLower: n('#12382a'),
      sixUpper: n('#12382A'),
      noHash: n('1f8f55'),
      three: n('#fff'),
      padded: n('  #d93025  '),
      partial: n('#12'),
      empty: n(''),
      garbage: n('#zzzzzz'),
    };
  });
  assert(parsed.sixLower === '#12382a', `ستّ خاناتٍ صغيرة تُقرأ كما هي — got ${parsed.sixLower}`);
  assert(parsed.sixUpper === '#12382a', `ستّ خاناتٍ كبيرة تُصغَّر إلى صورةٍ واحدة — got ${parsed.sixUpper}`);
  assert(parsed.noHash === '#1f8f55', `بلا # تُقبل ويُضاف — got ${parsed.noHash}`);
  assert(parsed.three === '#ffffff', `ثلاث خاناتٍ تُمدّ إلى ستّ — got ${parsed.three}`);
  assert(parsed.padded === '#d93025', `الفراغ المحيط يُهمَل — got ${parsed.padded}`);
  assert(parsed.partial === null, 'ما لم يكتمل بعد يُردّ null فلا يُكتب إلى المستند أثناء الكتابة');
  assert(parsed.empty === null, 'الفارغ يُردّ null');
  assert(parsed.garbage === null, 'ما ليس ستّ عشريًّا يُردّ null');

  // --- ٢. ثباتُ معرّف الطبقة المشتقّة عبر التصييرات ------------------------------
  //
  // العطل (أ) نفسه: عنصرٌ لم تُثبَّت كومتُه بعد يُعاد اشتقاقها في كل تصيير. نُجبر
  // تصييراتٍ متتالية بتعديلٍ حقيقيّ في حقل العرض، ثم نقارن المعرّفات.
  const txt = await addText(page, 'خطة محتوى');
  const idsA = await rowIds(page, 'fill', txt);
  assert(idsA.length === 1, `نصٌّ جديد يعرض صفَّ تعبئةٍ واحدًا — got ${idsA.length}`);
  const wField = page.locator('label').filter({ has: page.locator('span:text-is("W")') }).locator('input[type="number"]');
  await typeInto(page, wField, 420);
  const idsB = await rowIds(page, 'fill', txt);
  await typeInto(page, wField, 430);
  const idsC = await rowIds(page, 'fill', txt);
  assert(idsA[0] === idsB[0] && idsB[0] === idsC[0], `معرّف الطبقة المشتقّة ثابتٌ عبر التصييرات — got ${JSON.stringify([idsA[0], idsB[0], idsC[0]])}`);

  // --- ٣. مُدخَل اللون لا يتقاتل مع React ------------------------------------------
  //
  // العطل (ب): طبقةٌ تتبع رمز اللوحة `fg` كانت تُمرَّر `#FFFFFF` ويقرأ الـDOM
  // `#ffffff`. القياس هو المقارنة بين ما كتبه React وما يحمله الـDOM فعلًا.
  const colorInput = page.locator(colorSel('fill', txt)).first();
  const attrValue = await colorInput.getAttribute('value');
  const domValue = await colorInput.inputValue();
  assert(attrValue === domValue, `قيمة مُدخَل اللون كما كتبها React تساوي ما يقرؤه الـDOM — got ${attrValue} vs ${domValue}`);

  // --- ٤. الكتابة لا تُفقِد التركيز، ولا تتحوّل إلى اختصارات أدوات ---------------
  //
  // «#12382a» تحمل الحرف `a`، وهو اختصار أداة الصوت. فإن ضاع التركيز في أثناء
  // الكتابة فتحت الأداةُ لوحَها وبدّلت لوح الخصائص كلّه — وهذا هو العَرَض الذي
  // يراه المصمّم.
  const fillHex = page.locator(hexSel('fill', txt)).first();
  await fillHex.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  const focusTrail = [];
  for (const ch of '#12382a') {
    await page.keyboard.type(ch, { delay: 25 });
    focusTrail.push(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? 'none'));
  }
  await page.waitForTimeout(250);
  const keptFocus = focusTrail.every((t) => typeof t === 'string' && t.endsWith('-hex'));
  assert(keptFocus, `التركيز باقٍ في الحقل بعد كل حرف — got ${JSON.stringify(focusTrail)}`);
  // لوحُ «صوت» صار حقيقيًّا (٢٥ أكتوبر ٢٠٢٦، `audio-library`) بعد أن كان «قريبًا»
  // (`library-soon-audio`)؛ والكاشفُ يبحث عن الاثنين كي لا يصير صادقًا دائمًا بغياب اللوح القديم.
  assert((await page.locator('[data-testid="library-soon-audio"], [data-testid="audio-library"]').count()) === 0, 'الحرف `a` بقي حرفًا في الحقل ولم يصر اختصارَ أداة الصوت');

  // --- ٥. اللون المكتوب يُطلى فعلًا على النصّ ---------------------------------------
  const paintedText = await page.locator(`[data-el-id="${txt}"]`).evaluate((e) => getComputedStyle(e.querySelector('*') ?? e).color);
  assert(paintedText === 'rgb(18, 56, 42)', `نصٌّ مطليٌّ بـ#12382a بعد كتابته — got ${paintedText}`);

  // --- ٦. والأمر نفسه على شكلٍ وعلى حدّ مسارٍ مرسومٍ بالقلم -------------------------
  const rect = await addRect(page);
  await typeInto(page, page.locator(hexSel('fill', rect)).first(), '#cfe5d8');
  const paintedRect = await page.locator(`[data-el-id="${rect}"]`).evaluate((e) => getComputedStyle(e.querySelector('*') ?? e).backgroundColor);
  assert(paintedRect === 'rgb(207, 229, 216)', `شكلٌ مطليٌّ بـ#cfe5d8 — got ${paintedRect}`);

  const path = await drawPath(page, [
    { x: 200, y: 900 },
    { x: 500, y: 980 },
    { x: 800, y: 900 },
  ]);
  const strokeIdsA = await rowIds(page, 'stroke', path);
  assert(strokeIdsA.length === 1, `مسارٌ مرسومٌ بالقلم يعرض صفَّ حدٍّ واحدًا — got ${strokeIdsA.length}`);
  await typeInto(page, page.locator(hexSel('stroke', path)).first(), '#d93025');
  const strokeIdsB = await rowIds(page, 'stroke', path);
  assert(strokeIdsA[0] === strokeIdsB[0], 'معرّف طبقة الحدّ المشتقّة ثابتٌ هو أيضًا');
  const paintedStroke = await page.locator(`[data-el-id="${path}"] path`).first().evaluate((e) => e.getAttribute('stroke'));
  assert(
    (paintedStroke ?? '').toLowerCase() === '#d93025',
    `حدُّ المسار صار #d93025 بالكتابة — got ${paintedStroke}`,
  );

  // --- ٧. والقياس الأخير على بكسلاتٍ مُصدَّرة لا على DOM وحده ------------------------
  //
  // `getComputedStyle` يُثبت المعاينة الحيّة. والسؤال الذي تهمّه الحلقة هو ما
  // يخرج في الملفّ، فيُرسَم الإطار برسّام التصدير نفسه وتُقرأ بكسلاتُه.
  await page.waitForTimeout(900); // ما بعد مهلة الحفظ التلقائي (٧٠٠ مللي ثانية)
  const pixel = await page.evaluate(async ([rectId, pathId]) => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const raw = JSON.parse(window.localStorage.getItem('mazij.autosave.v1'));
    const ab = raw.artboards.find((a) => a.id === raw.activeArtboardId) ?? raw.artboards[0];
    const found = (id) => ab.doc.elements.find((e) => e.id === id);
    const size = { w: 300, h: 300 };
    const palette = { bg: '#000000', fg: '#ffffff', ac: '#ffb703' };
    async function sample(el, x, y) {
      const blob = await mod.renderArtboardPng({ size, palette, elements: [el], transparent: true, lang: 'ar', scale: 1 });
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(size.w, size.h);
      const g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    }
    const r = found(rectId);
    const p = found(pathId);
    if (!r || !p) return { missing: true };
    // صندوقٌ معلومٌ في قلب اللوحة حتى تُقرأ البكسلة من داخل الشكل يقينًا.
    const centred = { ...r, geo: { x: 0.2, y: 0.2, w: 0.6, h: 0.6, rotation: 0 } };
    return { rect: await sample(centred, 150, 150), strokeColor: (p.appearance?.strokes ?? [])[0]?.color };
  }, [rect, path]);
  assert(!pixel.missing, 'عنصرا الاختبار موجودان في المستند المحفوظ');
  assert(
    !pixel.missing && pixel.rect[0] === 207 && pixel.rect[1] === 229 && pixel.rect[2] === 216,
    `البكسل المُصدَّر في قلب الشكل هو #cfe5d8 المكتوب — got rgb(${(pixel.rect ?? []).join(', ')})`,
  );
  assert(
    (pixel.strokeColor ?? '').toLowerCase() === '#d93025',
    `والمستند المحفوظ يحمل لون الحدّ المكتوب نفسه — got ${pixel.strokeColor}`,
  );

  assert(pageErrors.length === 0, `لا أخطاء وحدة تحكّم طوال الجلسة: ${JSON.stringify(pageErrors)}`);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.error('\nFailures:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
