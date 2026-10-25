#!/usr/bin/env node
// **طبقاتُ الفيديو: التثبيت، والظهور داخل المقطع، والتوقيت بالأرقام — ٢٥ أكتوبر ٢٠٢٦.**
//
// طلب المالك نسخَ مقطعٍ حقيقيّ (٤٤ ثانية، ١٨ مشهدًا) من واجهة مزيج وحدها. وأوّلُ ما
// سقط ثلاثة أشياء يملكها كلُّ محرّر فيديو:
//
//   ١. **التثبيت** (`'hold'`): الكلمةُ تظهر **فجأةً** مع صوت الراوي، والمشهدُ ينقطع بلا
//      مزج. وكان أقربُ ما يُصنَع منحدرًا بين إطارين — صحيحًا على الشبكة وكاذبًا بينهما،
//      لأنّ ضبابَ الحركة يأخذ عيّناتٍ **بين** الإطارين فيُرسَم آخرُ إطارٍ قبل القطع
//      نصفَ شفّاف. وهو عطلٌ كان قائمًا في التقسيم نفسه (`splitAt`).
//   ٢. **يظهر في مقطعه فقط** (`ElementAnim.bounded`): عنصرٌ يدخل عند ٢٫٢٧ث ويخرج عند
//      ٤٫٣٣ث. ومدّةُ المقطع في مزيج ليست نافذةَ ظهور — قرارٌ مكتوبٌ لا يُنقَض — فصار
//      الظهورُ داخل المقطع مفتاحًا يُطلب، وغيابُه هو السلوك القائم بالحرف.
//   ٣. **التوقيت بالأرقام** ومن المؤشّر: مستندٌ طوله ٤٤ ثانيةً يجعل البكسلَ على الخطّ
//      الزمنيّ أكثرَ من إطار.
//
// والقياسُ كلُّه من الواجهة كما يستعملها مصمّم، ومن المُصيِّر الحقيقيّ للتصدير.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
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
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const isMac = process.platform === 'darwin';
const MOD = isMac ? 'Meta' : 'Control';

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

async function doc(page) {
  await page.waitForTimeout(900);
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).artboards[0].doc, AUTOSAVE_KEY);
}
const elOf = async (page, id) => (await doc(page)).elements.find((e) => e.id === id);
const historyLen = (page) => page.locator('[data-testid="undo-btn"]').evaluate((e) => Number(e.dataset.historyPast));
const playheadT = (page) => page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));

/** يضع المؤشّر على إطارٍ بعينه بالمفاتيح، كما يفعل المصمّم: Home ثم ← خطوةً خطوة. */
async function parkAtFrame(page, frame) {
  // نقرةٌ على المسطرة بعيدًا عن مقبض المؤشّر (يغطّي ±٩ بكسلات حوله) لتركيز السطح.
  const rb = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(rb.x + rb.width * 0.93, rb.y + rb.height / 2);
  await page.keyboard.press('Home');
  for (let i = 0; i < Math.floor(frame / 5); i++) await page.keyboard.press('Shift+ArrowRight');
  for (let i = 0; i < frame % 5; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  return playheadT(page);
}

async function selectLayer(page, id) {
  await page.locator(`[data-testid="layer-name-${id}"]`).click();
  await page.waitForTimeout(150);
}

/** يكتب ثوانيَ في حقل التوقيت ويضغط Enter — طريقُ لوحة المفاتيح الحقيقيّ. */
async function typeTiming(page, which, seconds) {
  const f = page.locator(`[data-testid="timing-${which}"]`);
  await f.click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.type(String(seconds));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
}

/** إطارٌ واحدٌ من مُصيِّر التصدير الحقيقيّ عند لحظةٍ، ومعه لونُ بكسلٍ مُسمّى. */
async function frameAt(page, t, probe, opts = {}) {
  return page.evaluate(
    async ({ key, t, probe, samples }) => {
      const ex = await import('/src/lib/exportArtboard.ts');
      const raw = JSON.parse(window.localStorage.getItem(key));
      const d = raw.artboards[0].doc;
      const spec = {
        size: { id: 'probe', ar: '', en: '', w: 1080, h: 1920, kind: 'timed' },
        palette: { bg: '#101010', fg: '#f0f0f0', ac: '#ffb703' },
        elements: d.elements,
        transparent: false,
        lang: 'ar',
        scale: 0.25,
        decorAccent: false,
      };
      let blob;
      if (samples > 1) {
        await ex.renderArtboardFrames(spec, [t], (b) => { blob = b; }, { shutter: { samplesPerFrame: samples, angle: 360 }, frameInterval: 1 / d.fps });
      } else {
        blob = await ex.renderArtboardPng({ ...spec, time: t });
      }
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      const px = g.getImageData(Math.round(probe.x * bmp.width), Math.round(probe.y * bmp.height), 1, 1).data;
      const all = g.getImageData(0, 0, bmp.width, bmp.height).data;
      let h = 0;
      for (let i = 0; i < all.length; i += 7) h = (h * 31 + all[i]) >>> 0;
      return { px: [px[0], px[1], px[2]], h };
    },
    { key: AUTOSAVE_KEY, t, probe, samples: opts.samples ?? 1 },
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // ═════════════════════════ ١. التثبيت: الدالّة نفسها ═════════════════════════
  await bootBlank(page, BASE_URL, 'ig-reel');
  const pure = await page.evaluate(async () => {
    const e = await import('/src/lib/easing.ts');
    const a = await import('/src/lib/animTimeline.ts');
    const kf = (id, time, value, easing) => ({ id, time, value, easing, bezier: [0, 0, 1, 1] });
    const anim = { preset: 'none', start: 0, duration: 2, sourceIn: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: { opacity: [kf('a', 0, 0, 'hold'), kf('b', 1, 1, 'linear'), kf('c', 1.5, 0.25, 'linear')] } };
    return {
      ids: e.EASING_IDS,
      at: [0, 0.5, 0.999, 1, 1.0001, 1.25, 1.5, 3].map((t) => a.resolveAnimAt(anim, t).opacity),
      mid: e.applyEasing('hold', [0, 0, 1, 1], 0.9999),
      end: e.applyEasing('hold', [0, 0, 1, 1], 1),
    };
  });
  assert(pure.ids.includes('hold') && pure.ids.indexOf('hold') < pure.ids.indexOf('custom'), `«تثبيت» بين خيارات المنحنى قبل «مخصّص» (${pure.ids.join(', ')})`);
  assert(pure.mid === 0 && pure.end === 1, `الدرجة: ٠ حتى نهاية المقطعة و١ عندها بالضبط (${pure.mid}, ${pure.end})`);
  assert(
    pure.at[0] === 0 && pure.at[1] === 0 && pure.at[2] === 0 && pure.at[3] === 1 && near(pure.at[4], 1, 1e-3),
    `القيمة تبقى على المفتاح حتى لحظة التالي ثم تقفز إليه **عندها** لا بعدها (${pure.at.slice(0, 5).join(', ')})`,
  );
  // و`bezierY` تحلّ المنحنى بأربعٍ وعشرين قسمةً ثنائيّة، فدقّتُها نحو ٦×١٠⁻⁸ لا تامّة.
  assert(near(pure.at[5], 1 - 0.75 * 0.5, 1e-6) && near(pure.at[6], 0.25, 1e-9) && near(pure.at[7], 0.25, 1e-9), `ومقطعةٌ خطّيّةٌ بعد درجةٍ تبقى خطّيّة (${pure.at.slice(5).join(', ')})`);

  // ═════════════════════════ ٢. التثبيت من الواجهة ═════════════════════════
  const a = await drawRect(page, 0.2, 0.3, 0.8, 0.5);
  await selectLayer(page, a);
  await page.locator(`[data-testid="expand-${a}"]`).click();
  await page.waitForTimeout(150);
  await parkAtFrame(page, 0);
  await page.locator(`[data-testid="clip-${a}-add-kf"]`).click();
  await page.waitForTimeout(200);
  const k0 = (await elOf(page, a)).anim.tracks.opacity?.[0];
  assert(!!k0, 'مفتاحُ شفافيّةٍ عند الصفر من زرّ «+» في صفّ المقطع');
  await page.locator(`[data-testid="kf-${a}-${k0.id}"]`).click();
  await page.waitForTimeout(150);
  assert((await page.locator('[data-testid="kf-easing-hold"]').count()) === 1, 'منبثقةُ المفتاح فيها زرّ «تثبيت»');
  const holdLabel = await page.locator('[data-testid="kf-easing-hold"]').innerText();
  assert(holdLabel.trim() === 'تثبيت', `ونصُّه «تثبيت» (${holdLabel.trim()})`);
  const h0 = await historyLen(page);
  await page.locator('[data-testid="kf-easing-hold"]').click();
  await page.waitForTimeout(250);
  const k0b = (await elOf(page, a)).anim.tracks.opacity.find((k) => k.id === k0.id);
  assert(k0b.easing === 'hold', `ضغطُه يكتب \`hold\` على المفتاح (${k0b.easing})`);
  assert((await historyLen(page)) === h0 + 1, 'بخطوة تراجعٍ واحدة');
  // (لا Escape هنا: «ارجع خطوة» تُلغي التحديد، فتختفي قائمةُ المنحنى المربوطة به.)
  await page.locator('[data-testid="easing-menu-button"]').click();
  await page.waitForTimeout(150);
  assert((await page.locator('[data-testid="easing-option-hold"]').count()) === 1, 'وقائمةُ منحنى المقطع كلّه فيها «تثبيت» كذلك');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // ═════════════════ ٣. التقسيمُ لا يترك طيفًا عند القطع تحت ضباب الحركة ═════════════════
  // مستطيلٌ ثانٍ يُقسَم ثم يُحذَف نصفُه الأيمن: يجب أن يكون الإطارُ الأخيرُ قبل القطع
  // كاملًا تحت غالقٍ مفتوحٍ ٣٦٠°، لا متوسّطَ شفافيّةٍ تهبط في منتصفه.
  await page.keyboard.press(`${MOD}+z`); // أزل مفتاح الاختبار — مستطيلٌ نظيف
  await page.waitForTimeout(150);
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(150);
  await selectLayer(page, a);
  // مقطعٌ بطول ثانيتين من حقل النهاية، ثم قطعٌ عند ١ث وحذفُ الأيمن.
  await typeTiming(page, 'end', 2);
  await parkAtFrame(page, 30);
  await page.keyboard.press(`${MOD}+b`);
  await page.waitForTimeout(300);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  const afterSplit = (await doc(page)).elements;
  assert(afterSplit.length === 1 && afterSplit[0].id === a, `بقي النصفُ الأيسر وحده (${afterSplit.map((e) => e.id).join(', ')})`);
  const stepKeys = afterSplit[0].anim.tracks.opacity.filter((k) => k.time > 0.9);
  assert(stepKeys.length >= 1 && stepKeys.every((k, i) => i === stepKeys.length - 1 || k.easing === 'hold'), `مفتاحا العتبة عند القطع درجةٌ لا منحدر (${stepKeys.map((k) => `${k.time.toFixed(3)}:${k.easing}`).join(' ')})`);
  const probe = { x: 0.5, y: 0.4 };
  const lastFrame = await frameAt(page, 29 / 30, probe, { samples: 8 });
  const cutFrame = await frameAt(page, 30 / 30, probe, { samples: 8 });
  const sharp = await frameAt(page, 29 / 30, probe);
  assert(lastFrame.px.join() === sharp.px.join(), `الإطارُ الأخير قبل القطع **كاملٌ** تحت ٨ عيّنات وغالقٍ ٣٦٠° (${lastFrame.px} = ${sharp.px})`);
  assert(cutFrame.px[0] < 40 && cutFrame.px[1] < 40, `وإطارُ القطع خالٍ منه — الخلفيّة وحدها (${cutFrame.px})`);

  // ═════════════════════ ٤. يظهر في مقطعه فقط — من لوح الخصائص ═════════════════════
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(150);
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(150);
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(200);
  await selectLayer(page, a);
  assert((await page.locator('[data-testid="timing-section"]').count()) === 1, 'قسم «التوقيت» ظاهرٌ في مستندٍ مُوقَّت');
  const pressedBefore = await page.locator('[data-testid="timing-bounded"]').getAttribute('aria-pressed');
  assert(pressedBefore === 'false', 'العنصرُ الجديد غيرُ محدودٍ بمقطعه — السلوك القائم لا يتبدّل');
  const hb = await historyLen(page);
  await typeTiming(page, 'start', 1);
  await typeTiming(page, 'end', 2.5);
  let el = await elOf(page, a);
  assert(near(el.anim.start, 1, 1e-9) && near(el.anim.start + el.anim.duration, 2.5, 1e-9), `البدايةُ ١ث والنهايةُ ٢٫٥ث كما كُتبتا (${el.anim.start}, ${(el.anim.start + el.anim.duration).toFixed(4)})`);
  assert((await historyLen(page)) === hb + 2, 'كلُّ حقلٍ خطوةُ تراجعٍ واحدة');
  // غيرُ محدود: ظاهرٌ قبل مقطعه وبعده كما كان دائمًا.
  await parkAtFrame(page, 9);
  assert((await page.locator(`[data-el-id="${a}"]`).count()) === 1, 'وقبل أن يُشعَل المفتاح: ظاهرٌ عند ٠٫٣ث، قبل مقطعه (السلوك القائم)');
  await page.locator('[data-testid="timing-bounded"]').click();
  await page.waitForTimeout(250);
  el = await elOf(page, a);
  assert(el.anim.bounded === true, 'المفتاحُ يكتب `bounded: true`');
  assert((await page.locator(`[data-testid="clip-${a}"]`).getAttribute('data-bounded')) === 'true', 'والمقطعُ على الخطّ الزمنيّ يُقرأ محدودًا');
  const showAt = async (frame) => {
    await parkAtFrame(page, frame);
    return (await page.locator(`[data-el-id="${a}"]`).count()) === 1;
  };
  assert(!(await showAt(9)), 'عند ٠٫٣ث — قبل مقطعه — لا يُرسَم في المعاينة');
  assert(await showAt(30), 'عند ١ث بالضبط — أوّلُ إطارٍ في مقطعه — يُرسَم');
  assert(await showAt(74), 'عند ٢٫٤٦٧ث — آخرُ إطارٍ في مقطعه — يُرسَم');
  assert(!(await showAt(75)), 'عند ٢٫٥ث — نهايةُ مقطعه — لا يُرسَم (نصفُ فترةٍ مفتوح)');
  const fBefore = await frameAt(page, 0.3, probe);
  const fIn = await frameAt(page, 1.0, probe);
  const fLast = await frameAt(page, 74 / 30, probe);
  const fAfter = await frameAt(page, 2.5, probe);
  assert(fBefore.px[0] < 40 && fAfter.px[0] < 40 && fIn.px[0] > 40 && fLast.px[0] > 40, `ومُصيِّرُ التصدير يقول الشيءَ نفسه عند الإطارات الأربعة (${[fBefore, fIn, fLast, fAfter].map((f) => f.px[0]).join(', ')})`);
  const blurLast = await frameAt(page, 74 / 30, probe, { samples: 8 });
  assert(blurLast.px.join() === fLast.px.join(), `وعيّناتُ الغالق داخل الإطار الأخير تراه كلُّها — لا طيفَ نصفُ شفّافٍ عند الخروج (${blurLast.px} = ${fLast.px})`);
  // SVG ساكنٌ عند لحظة الاستقرار (٢٫٥ث = طولُ المستند): العنصرُ غائبٌ عنها فغائبٌ عن الملفّ.
  const svgHas = await page.evaluate(async ({ key, id }) => {
    const ex = await import('/src/lib/exportArtboard.ts');
    const d = JSON.parse(window.localStorage.getItem(key)).artboards[0].doc;
    const spec = { size: { id: 'p', ar: '', en: '', w: 1080, h: 1920, kind: 'timed' }, palette: { bg: '#101010', fg: '#f0f0f0', ac: '#ffb703' }, elements: d.elements, transparent: false, lang: 'ar', decorAccent: false };
    // لونُ المستطيل هو لونُ التمييز في هذه اللوحة (`fillToken: 'ac'`)، ولا زخرفةَ تحمله.
    const at = async (time) => (await ex.renderArtboardSvg({ ...spec, time }).text()).toLowerCase().includes('#ffb703');
    return { settled: await at(undefined), mid: await at(1.5) };
  }, { key: AUTOSAVE_KEY, id: a });
  assert(!svgHas.settled && svgHas.mid, `وSVG يتبع اللحظةَ نفسها: غائبٌ عند لحظة الاستقرار، حاضرٌ عند ١٫٥ث (${JSON.stringify(svgHas)})`);

  // ═════════════════════ ٥. «من المؤشّر» ينقل المقطع وحركتَه معه ═════════════════════
  await selectLayer(page, a);
  await parkAtFrame(page, 30);
  await page.locator(`[data-testid="clip-${a}-add-kf-x"]`).click();
  await page.waitForTimeout(200);
  const kx = (await elOf(page, a)).anim.tracks.x[0];
  await parkAtFrame(page, 60);
  await page.locator('[data-testid="timing-start-here"]').click();
  await page.waitForTimeout(250);
  el = await elOf(page, a);
  const kxAfter = el.anim.tracks.x.find((k) => k.id === kx.id);
  assert(near(el.anim.start, 2, 1e-9) && near(el.anim.duration, 1.5, 1e-9), `«من المؤشّر» للبداية: المقطع يبدأ عند ٢ث بطوله نفسه (${el.anim.start}, ${el.anim.duration})`);
  assert(near(el.anim.start - (el.anim.sourceIn ?? 0) + kxAfter.time, 2, 1e-9), 'ومفتاحُه انتقل معه: ما كان على أوّل مقطعه بقي على أوّله');
  await parkAtFrame(page, 96);
  await page.locator('[data-testid="timing-end-here"]').click();
  await page.waitForTimeout(250);
  el = await elOf(page, a);
  assert(near(el.anim.start + el.anim.duration, 3.2, 1e-9), `و«من المؤشّر» للنهاية يُقلّم الحافّة الأخيرة إلى ٣٫٢ث (${(el.anim.start + el.anim.duration).toFixed(4)})`);

  // ═════════════════════ ٦. التقسيم على مقطعٍ محدود لا يكتب عتبات ═════════════════════
  const keysBefore = el.anim.tracks.opacity?.length ?? 0;
  await parkAtFrame(page, 81);
  await page.keyboard.press(`${MOD}+b`);
  await page.waitForTimeout(300);
  const halves = (await doc(page)).elements;
  assert(halves.length === 2 && halves.every((e) => e.anim.bounded === true), 'التقسيمُ يُنتج نصفين محدودَين كأصلهما');
  assert(halves.every((e) => (e.anim.tracks.opacity?.length ?? 0) === keysBefore), `ولا مفتاحَ عتبةٍ على الشفافيّة — نافذةُ الظهور تكفي (${halves.map((e) => e.anim.tracks.opacity?.length ?? 0).join(', ')} مقابل ${keysBefore})`);
  const fA = await frameAt(page, 80 / 30, probe);
  const fB = await frameAt(page, 81 / 30, probe);
  assert(fA.px[0] > 40 && fB.px[0] > 40, 'والإطاران على جانبَي القطع يرسمان العنصرَ مرّةً واحدة');

  // ═════════════════════ ٧. التوقيتُ لعدّة عناصر بإيماءةٍ واحدة ═════════════════════
  await page.locator(`[data-testid="layer-name-${halves[0].id}"]`).click();
  await page.locator(`[data-testid="layer-name-${halves[1].id}"]`).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(150);
  const placeholder = await page.locator('[data-testid="timing-start"]').getAttribute('placeholder');
  const shown = await page.locator('[data-testid="timing-start"]').inputValue();
  assert(shown === '' && placeholder === 'مختلف', `بدايتان مختلفتان تُعرضان «مختلف» لا رقمَ أوّلهما (${JSON.stringify(shown)} / ${placeholder})`);
  const hm = await historyLen(page);
  await typeTiming(page, 'end', 4);
  const both = (await doc(page)).elements;
  assert(both.every((e) => near(e.anim.start + e.anim.duration, 4, 1e-9)), `النهايةُ ٤ث على الاثنين (${both.map((e) => (e.anim.start + e.anim.duration).toFixed(3)).join(', ')})`);
  assert((await historyLen(page)) === hm + 1, 'بخطوة تراجعٍ واحدة للاثنين');

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
