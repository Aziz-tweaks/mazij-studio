#!/usr/bin/env node
// كسرُ السطر: اللوحةُ والملفُّ جوابٌ واحد
// ═══════════════════════════════════════════════════════════════════════════
//
// الورقةُ `docs/re-arabic-wrap-divergence.md` أثبتت أنّ اللوحةَ والتصديرَ يَلُفّان
// النصَّ نفسَه عند موضعين مختلفين، وأنّ السببَ **خاصّيّةُ CSS واحدة**:
// `textWrap: 'balance'` في `ElementView.tsx`. اللوحةُ تُوازن (تُقلِّل التفاوتَ بين
// أطوال السطور)، و`wrapLines` في `exportArtboard.ts` تَجشَع (أوّلُ ما يَسَع).
// **خوارزميّتان، لا قياسان:** القياسان متّفقان إلى ٠٫٠٣٦ بكسل، والخلافُ في دالّة
// الهدف وحدَها. والمدى: **٧٣ ٪** من عروض الصندوق بالعربيّة و**٦٦ ٪** باللاتينيّة.
//
// وهذا الملفُّ هو المقياسُ الذي يَحرس التوحيد. كلُّ بندٍ فيه يُقاس من **رسمٍ
// حقيقيّ**: سطورُ اللوحةِ تُستخرَج بـ`Range.getClientRects()` من العقدةِ التي
// رسمها المتصفّحُ بنفسه، وسطورُ التصدير من `wrapLines` **عينِها** التي يُناديها
// `renderArtboardCanvas`. ولا قيمةَ واحدةً مأخوذةً من نموذجِ الحالة: العرضُ
// والخطُّ والوزنُ والتتبُّعُ والاتجاهُ كلُّها قراءاتُ `getComputedStyle` و
// `getBoundingClientRect` عن العنصر المرسوم.
//
// ═══════════════════════════════════════════════════════════════════════════
// لِمَ تُقرأ البكسلاتُ بلا تحويلٍ لمقاسِ الخطّ
// ═══════════════════════════════════════════════════════════════════════════
// `abStyle` في `Stage.tsx` يَضع اللوحَ بعرضٍ تخطيطيٍّ يساوي `size.w` بالحرف ثم
// يُكبّره بـ`transform: scale()` **منفصلًا**. فبكسلاتُ التخطيط **هي** بكسلاتُ
// المستند، و`cqw` (عبر `containerType: inline-size`) تُحَلّ على العرض التخطيطيّ
// نفسِه — ولذلك مقاسُ الخطّ المحسوب هو `(el.fontSize/1080)*size.w` بلا تحويل،
// وعرضُ الصندوق هو `getBoundingClientRect().width / scale`. **وقد أُهدِر قياسٌ
// أوّلُ على هذا بعينه** (انظر «ما أعاقني» في التقرير): ضربُ مقاس الخطّ في مقلوب
// التكبير أعطى سطورًا أقصرَ بكثيرٍ من الحقيقة، فبدا الطرفان مختلفَين حيث هما
// متّفقان. والبندُ ٥٫٢ أدناه هو ما يَحرس هذا: لو عاد تكبيرُ الشاشة يَتسرّب إلى
// القياس لانقلب.
//
// التشغيل: QA_PORT=<منفذ حرّ> QA_SPECS=text-wrap-parity npm test
import { chromium } from 'playwright';
import { bootDemo } from './helpers/boot.mjs';

const BASE_URL = `http://localhost:${process.env.QA_PORT || '1420'}`;

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ok  ', msg);
  } else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}

/** عدّادُ التوحيد: كم حالةً من كم تَطابق فيها الطرفان. يُطبَع في النهاية رقمًا
 * واحدًا، فالتقريرُ لا يقول «يبدو موحَّدًا» بل «ن من ن». */
let unified = 0;
let cases = 0;

const U_KASHIDA = 'ـ';

/** كلُّ ما يَحتاجه اللافّان، مقروءًا عن **العقدة المرسومة** واللوح. */
const paintedBox = (page, id) =>
  page.evaluate((elId) => {
    const host = document.querySelector(`[data-el-id="${elId}"]`);
    const ab = document.querySelector('[data-testid="artboard"]');
    if (!host || !ab) return null;
    const docW = Number(ab.dataset.docW);
    const scale = ab.getBoundingClientRect().width / docW;
    const cs = getComputedStyle(host);
    return {
      scale,
      bw: host.getBoundingClientRect().width / scale,
      fontPx: parseFloat(cs.fontSize),
      weight: cs.fontWeight,
      family: cs.fontFamily,
      letterSpacing: cs.letterSpacing,
      textWrap: cs.textWrap || '(unset)',
      whiteSpace: cs.whiteSpace,
      dir: cs.direction,
      text: host.innerText,
    };
  }, id);

/** السطورُ التي كسرها المتصفّحُ **فعلًا**. لا عقدةَ لكلِّ سطرٍ في الـDOM — إنما
 * عقدةُ نصٍّ واحدةٌ يَلُفّها المتصفّحُ داخليًّا — فتُؤخَذ مستطيلاتُ كلِّ كلمةٍ
 * بـ`Range` وتُجمَع بإحداثيّ `top`.
 *
 * **والترتيبُ داخل السطر منطقيٌّ لا بصريّ، عن قصد.** الكلماتُ تُدفَع بالترتيب
 * الذي تَحمله عقدةُ النصّ — وهو الترتيبُ الذي تَعمل فيه `wrapLines`. والترتيبُ
 * بـ`left`/`right` كان خطأً يَظهر أوّلَ ما يُعيد البايديُّ ترتيبَ مقطعٍ
 * (لاتينيٌّ داخل صندوقٍ عربيّ)، **وقد ظهر**: «Up to 50% off» رجعت
 * «off 50% to Up». */
const domLines = (page, id) =>
  page.evaluate((elId) => {
    const host = document.querySelector(`[data-el-id="${elId}"]`);
    if (!host) return null;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) if (n.nodeValue && n.nodeValue.trim()) nodes.push(n);
    if (!nodes.length) return null;
    const rows = [];
    for (const tn of nodes) {
      const re = /\S+/g;
      let m;
      while ((m = re.exec(tn.nodeValue))) {
        const r = document.createRange();
        r.setStart(tn, m.index);
        r.setEnd(tn, m.index + m[0].length);
        const rects = [...r.getClientRects()].filter((q) => q.width > 0.01);
        if (!rects.length) continue;
        const top = rects[0].top;
        let row = rows.find((q) => Math.abs(q.top - top) < 3);
        if (!row) rows.push((row = { top, ws: [] }));
        row.ws.push(m[0]);
      }
    }
    return rows.sort((a, b) => a.top - b.top).map((r) => r.ws.join(' '));
  }, id);

/** سطورُ التصدير: `wrapLines` **نفسُها** التي يُناديها `renderArtboardCanvas`،
 * مُغذَّاةً بالخطِّ والعرضِ المقروءَين عن العقدة المرسومة. */
const exportLines = (page, box) =>
  page.evaluate(async (b) => {
    const mod = await import('/src/lib/exportArtboard.ts');
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${b.weight} ${b.fontPx}px ${b.family}`;
    c.letterSpacing = b.letterSpacing === 'normal' ? '0px' : b.letterSpacing;
    c.direction = b.dir;
    return mod.wrapLines(c, b.text, b.bw);
  }, box);

/** البندُ الواحد: اللوحةُ والتصديرُ يَكسران عند الموضع نفسِه. */
async function expectUnified(page, id, label) {
  const box = await paintedBox(page, id);
  const dom = await domLines(page, id);
  const exp = await exportLines(page, box);
  cases++;
  const ok = JSON.stringify(dom) === JSON.stringify(exp);
  if (ok) unified++;
  assert(
    ok,
    `${label} — عرضُ الصندوق ${box.bw.toFixed(2)} px، خطٌّ ${box.fontPx.toFixed(2)} px/${box.weight}: ` +
      `اللوحةُ ${JSON.stringify(dom)} والتصديرُ ${JSON.stringify(exp)}` +
      (ok ? '' : ` ← **افتراق**. و\`text-wrap\` المحسوبة «${box.textWrap}»؛ على \`main\` كانت «balance»`),
  );
  return { box, dom, exp };
}

const wField = (page) =>
  page
    .locator('label')
    .filter({ has: page.locator('span', { hasText: /^W$/ }) })
    .locator('input');

/** عرضُ الصندوق من **حقل W في لوح الخصائص**، بضغطاتِ مفاتيحَ حقيقيّة. */
async function setW(page, px) {
  const f = wField(page);
  await f.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(String(px), { delay: 12 });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(240);
}

/** نصُّ العنصر بالكتابة فيه: نقرةٌ مزدوجةٌ تَفتح التحرير، ثم تحديدُ الكلّ، ثم
 * طَرْقٌ حقيقيّ، ثم `Escape`. */
async function setText(page, id, text) {
  await page.locator(`[data-el-id="${id}"]`).dblclick();
  await page.waitForTimeout(380);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(text, { delay: 6 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(460);
}

async function selectEl(page, id) {
  await page.locator(`[data-el-id="${id}"]`).click({ force: true });
  await page.waitForTimeout(260);
}

const AR_LONG = 'خصم يصل إلى ٥٠٪ على كل شيء · حتى الأحد';
const LA_LONG = 'Up to 50% off everything until Sunday';
const AR_PARA = 'نفتح أبوابنا من الصباح الباكر وحتى آخر الليل كل أيام الأسبوع بلا استثناء ونرحب بكم';
const LA_PARA = 'We open early in the morning and stay open until late at night every single day of the week';
const SWEEP = [560, 497, 460, 420, 380, 340, 300];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ١. القالبُ التجريبيُّ كما هو — بلا لمسةٍ واحدة
  // ═══════════════════════════════════════════════════════════════════════
  // هذه حالةُ الورقة بالحرف: عنصرُ `discount` في `starter-demo-poster`، صندوقُه
  // ٤٩٦٫٨ px ومقاسُه ٣٤٫٥٦ px. قيسَ على `main` أنّ اللوحةَ تُعطي «…على» / «كل
  // شيء…» والتصديرَ «…على كل» / «شيء…». ولا يُضبَط هنا شيءٌ أصلًا — يُفتَح
  // القالبُ من شاشة البداية ويُقرأ ما رُسِم.
  console.log('\n١. القالبُ التجريبيّ كما يَفتحه المصمّم');
  await bootDemo(page, BASE_URL);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);

  const d1 = await expectUnified(page, 'discount', '**`discount` من `starter-demo-poster`**');
  assert(
    d1.dom.length === 2,
    `وهو سطرانِ لا سطرٌ ولا ثلاثة (${d1.dom.length}) — فالحالةُ المقيسةُ حالةُ لفٍّ فعليّ، لا نصٌّ قصيرٌ لا يَلُفّ أصلًا فيَتّفق الطرفان مجّانًا`,
  );
  await expectUnified(page, 'head', '**`head` من القالب نفسِه** (العنوانُ العريض)');

  // ═══════════════════════════════════════════════════════════════════════
  // ٢. مسحُ عروضٍ ونصوص — من حقل W وطَرْقِ لوحةِ المفاتيح
  // ═══════════════════════════════════════════════════════════════════════
  // الخاصّيّةُ لا تَعرف النصَّ الذي تحتها، فالمسحُ على الاتجاهين: عربيٌّ
  // ولاتينيّ، سطرانِ وثلاثةٌ وأربعة، وسطرٌ واحدٌ ضابطًا.
  console.log('\n٢. مسحُ العروض: عربيٌّ ولاتينيٌّ على سبعة عروض');
  // لا «بسيط/احترافي» منذ ٢٤ أكتوبر ٢٠٢٦ (قرار المالك: «العمق يُطلب ولا يُفرض») — كلّ الأدوات حاضرة.
  await page.waitForTimeout(320);
  await selectEl(page, 'discount');
  assert((await wField(page).count()) === 1, 'وحقلُ W في لوح الخصائص هو طريقُ ضبطِ العرض — حقلٌ واحدٌ مقروء، والعرضُ يُكتَب فيه بالمفاتيح');

  for (const [name, text] of [
    ['عربيٌّ طويل', AR_LONG],
    ['لاتينيٌّ طويل', LA_LONG],
  ]) {
    await setText(page, 'discount', text);
    await selectEl(page, 'discount');
    for (const w of SWEEP) {
      await setW(page, w);
      await expectUnified(page, 'discount', `${name} عند W=${w}`);
    }
  }

  for (const [name, text, widths] of [
    ['فقرةٌ عربيّةٌ متعدّدةُ السطور', AR_PARA, [497, 380]],
    ['فقرةٌ لاتينيّةٌ متعدّدةُ السطور', LA_PARA, [497, 380]],
    ['سطرٌ واحدٌ قصير (ضابط: لا موازنةَ بلا سطرين)', 'عرض خاص', [497]],
  ]) {
    await setText(page, 'discount', text);
    await selectEl(page, 'discount');
    for (const w of widths) {
      await setW(page, w);
      await expectUnified(page, 'discount', `${name} عند W=${w}`);
    }
  }

  // ─── والتتبُّع: مُطبَّقٌ على الطرفين، فلا يُحرّك الاتّفاق ───
  //
  // بندٌ قائمٌ بذاته لأنّ التتبُّعَ يَدخل في **القياس** لا في الرسم وحده
  // (`ctx.letterSpacing` في `exportArtboard.ts`، و`trackingCss` في
  // `ElementView.tsx`): لو قيس أحدُ الطرفين بلا تتبُّعٍ لانكسر السطرُ في موضعٍ
  // غيرِ الذي يُرسَم فيه، والمسحُ أعلاه كلُّه عند تتبُّعٍ صفر فلم يكن يَراه.
  await setText(page, 'discount', AR_LONG);
  await selectEl(page, 'discount');
  const tr = page.locator('[data-testid="text-tracking-discount"]');
  await tr.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('5', { delay: 20 });
  await page.waitForTimeout(400);
  await selectEl(page, 'discount');
  for (const w of [497, 420]) {
    await setW(page, w);
    const r = await expectUnified(page, 'discount', `عربيٌّ طويل بتتبُّعٍ ٥ ٪ عند W=${w}`);
    assert(
      r.box.letterSpacing !== 'normal' && parseFloat(r.box.letterSpacing) > 0,
      `والتتبُّعُ مرسومٌ فعلًا (letterSpacing «${r.box.letterSpacing}») — فالبندُ قاسَ ما يَدّعي، لا صفرًا آخر`,
    );
  }
  await tr.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('0', { delay: 20 });
  await page.waitForTimeout(400);

  // ═══════════════════════════════════════════════════════════════════════
  // ٣. والبرهانُ من الملفِّ الذي يُنتجه البرنامج، لا من `wrapLines` وحدَها
  // ═══════════════════════════════════════════════════════════════════════
  // كلُّ ما سبق يُقابل اللوحةَ بـ`wrapLines`. وهذا البندُ يُغلق الحلقةَ على
  // **بكسلاتٍ في صورةٍ صدَرت من زرِّ التصدير**: معاينةُ الحوار هي
  // `renderArtboardPng` عينُها — المُصيِّرُ الذي يَكتب الملفّ (وهذا ما أصلحه
  // `parity-four` البندُ ٢). فيُقاس **امتدادُ حبرِ السطر الأوّل** داخل صندوق
  // `discount` في تلك الصورة، ويُقابَل بعرضِ السطر الأوّل الذي رسمته اللوحة.
  //
  // والفرقُ المقيسُ على `main` كان ٥٨٫٠٣ px في فضاء المستند (393.81 مقابل
  // 451.84) — أي ٣٢٫٢ px في فضاء المعاينة ٦٠٠×٦٠٠. فالعتبةُ ٨ px تَفصل
  // الحالتين بفارقِ أربعةِ أضعاف، وتَترك ضجيجَ التنعيم وتقريبَ المقاس.
  console.log('\n٣. البرهانُ من بكسلاتِ صورةِ التصدير');
  await setText(page, 'discount', AR_LONG);
  await selectEl(page, 'discount');
  await setW(page, 497);
  const painted = await paintedBox(page, 'discount');
  const paintedFirst = await page.evaluate(() => {
    const host = document.querySelector('[data-el-id="discount"]');
    const ab = document.querySelector('[data-testid="artboard"]');
    const scale = ab.getBoundingClientRect().width / Number(ab.dataset.docW);
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const tn = walker.nextNode();
    const re = /\S+/g;
    let m;
    let top = null;
    let min = Infinity;
    let max = -Infinity;
    while ((m = re.exec(tn.nodeValue))) {
      const r = document.createRange();
      r.setStart(tn, m.index);
      r.setEnd(tn, m.index + m[0].length);
      const q = [...r.getClientRects()].filter((x) => x.width > 0.01)[0];
      if (!q) continue;
      if (top === null) top = q.top;
      if (Math.abs(q.top - top) > 3) continue; // سطرٌ آخر
      min = Math.min(min, q.left);
      max = Math.max(max, q.right);
    }
    return (max - min) / scale; // بكسلاتُ المستند
  });

  await page.getByRole('button', { name: 'تصدير', exact: true }).first().click();
  const previewReady = await page
    .waitForSelector('[data-testid="export-preview"][data-preview-ready="true"]', { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  assert(previewReady, 'لوحُ المعاينة صيَّر المستندَ (`data-preview-ready`) — وهو `renderArtboardPng` نفسُها التي تَكتب الملفّ');
  await page.waitForTimeout(700);

  /** امتدادُ حبرِ أوّلِ شريطٍ أفقيٍّ داخل صندوق `discount` في صورة المعاينة.
   * قراءةٌ محضة: الصورةُ تُرسَم على قماشٍ مؤقّتٍ ثم تُقرأ. و«الحبر» هو ما يُخالف
   * لونَ الخلفيّة المهيمن في الصندوق نفسِه، فلا لونَ مُثبَّتٌ في الاختبار. */
  const inkFirstLine = await page.evaluate(async () => {
    const img = document.querySelector('[data-testid="export-preview-image"]');
    if (!img) return null;
    if (!img.complete) await img.decode().catch(() => undefined);
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    if (!W || !H) return null;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    // صندوقُ `discount` في القالب: x=0.46، y=0.67، w=0.46، h=0.12
    const x0 = Math.round(0.46 * W);
    const y0 = Math.round(0.67 * H);
    const bw = Math.round(0.46 * W);
    const bh = Math.round(0.12 * H);
    const d = g.getImageData(x0, y0, bw, bh).data;
    // لونُ الخلفيّة = الأكثرُ تكرارًا في الصندوق
    const freq = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
      freq.set(k, (freq.get(k) || 0) + 1);
    }
    const bg = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
    const isInk = (i) => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 90;
    // الصفوفُ التي فيها حبر، ثم أوّلُ شريطٍ متّصل
    const rowHas = [];
    for (let y = 0; y < bh; y++) {
      let any = false;
      for (let x = 0; x < bw && !any; x++) if (isInk((y * bw + x) * 4)) any = true;
      rowHas.push(any);
    }
    let s = rowHas.indexOf(true);
    if (s < 0) return null;
    let e = s;
    while (e + 1 < bh && rowHas[e + 1]) e++;
    let min = Infinity;
    let max = -Infinity;
    for (let y = s; y <= e; y++) {
      for (let x = 0; x < bw; x++) {
        if (isInk((y * bw + x) * 4)) {
          if (x < min) min = x;
          if (x > max) max = x;
        }
      }
    }
    if (min > max) return null;
    return { widthDocPx: ((max - min + 1) / W) * 1080, bands: rowHas.filter(Boolean).length, previewW: W };
  });

  assert(inkFirstLine !== null, `وصورةُ المعاينةُ قُرئت وفيها حبرٌ في صندوق \`discount\` (${inkFirstLine ? `${inkFirstLine.previewW}px` : 'لا صورة'})`);
  if (inkFirstLine) {
    const delta = Math.abs(inkFirstLine.widthDocPx - paintedFirst);
    assert(
      delta <= 8,
      `**وسطرُ الملفِّ الأوّلُ هو سطرُ اللوحة الأوّل**: حبرُ الصورة ${inkFirstLine.widthDocPx.toFixed(2)} px ` +
        `واللوحةُ ${paintedFirst.toFixed(2)} px، فرقٌ ${delta.toFixed(2)} px ≤ ٨. ` +
        `وعلى \`main\` كان الفرقُ ٥٨٫٠٣ px — لأنّ اللوحةَ تَكسر قبل «كل» والملفُّ بعدها`,
    );
  } else {
    assert(false, '**وسطرُ الملفِّ الأوّلُ هو سطرُ اللوحة الأوّل** — لا صورةَ معاينةٍ تُقرأ أصلًا');
  }
  await page.getByRole('button', { name: 'إلغاء', exact: true }).click();
  await page.waitForTimeout(320);

  // ═══════════════════════════════════════════════════════════════════════
  // ٤. والكشيدةُ لم تُمَسّ — كانت متكافئةً وبقيت
  // ═══════════════════════════════════════════════════════════════════════
  // مسارُ التبرير (`JustifiedTextView`) **لم تَكن الموازنةُ تَصِل إليه أصلًا**:
  // هو يَستورد `wrapLines`/`justifyCanvasLines` نفسَيهما ثم يَطبع سطرًا في
  // `<div style={{whiteSpace:'pre'}}>` لكلِّ سطر — فلا يَبقى للمتصفّح لفٌّ
  // يُوازنه. فهذا البندُ يُثبت أنّ إسقاطَ الخاصّيّة لم يُحرِّك المسارَ الذي كان
  // سليمًا، ويُثبت **السببَ البنيويَّ** لسلامته (`white-space: pre`) لا النتيجةَ
  // وحدَها.
  console.log('\n٤. مسارُ الكشيدة: كان متكافئًا وبقي');
  await setText(page, 'discount', AR_LONG);
  await selectEl(page, 'discount');
  await setW(page, 497);
  const beforeJustify = await domLines(page, 'discount');
  await page.locator('[data-testid="justify-kashida-toggle"]').click();
  await page.waitForTimeout(900);
  const jBox = await paintedBox(page, 'discount');
  const jDom = await domLines(page, 'discount');
  const jExport = await exportLines(page, { ...jBox, text: AR_LONG });

  // و`white-space` مقروءةٌ عن **عقدِ السطور** لا عن العنصر المُضيف: `JustifiedTextView`
  // يَطبع `<div style={{whiteSpace:'pre'}}>` لكلِّ سطر، والمُضيفُ يبقى على
  // `normal` — وقد قِستُها أوّلَ مرّةٍ عن المُضيف فسقط البندُ بخطئي لا بخطأ
  // التطبيق، وأُسجِّله هنا كي لا يُقاس عن المُضيف مرّةً أخرى.
  const jWhiteSpace = await page.evaluate(() =>
    [...document.querySelectorAll('[data-el-id="discount"] > div')].map((n) => getComputedStyle(n).whiteSpace),
  );
  assert(
    jWhiteSpace.length === jDom.length && jWhiteSpace.every((w) => w === 'pre'),
    `سطورُ التبرير تُرسَم بـ\`white-space: pre\` (${jWhiteSpace.length} عقدةً: ${jWhiteSpace.join(' · ') || 'لا شيء'}) — **وهذا هو سببُ أنّ الموازنةَ لم تَكن تَصِلها**: لا لفَّ متصفّحٍ يُوازَن حين يُسلَّم كلُّ سطرٍ مُقطَّعًا سلفًا`,
  );
  assert(
    jDom.length === jExport.length,
    `وعددُ سطورِ التبرير المرسومةِ ${jDom.length} = عددُ سطورِ \`wrapLines\` ${jExport.length}`,
  );
  const stripped = jDom.map((l) => l.split(U_KASHIDA).join(''));
  assert(
    JSON.stringify(stripped) === JSON.stringify(jExport),
    `**ومواضعُ الكسرِ في مسار الكشيدة هي مواضعُ التصدير بالحرف** بعد نزعِ التطويل: ${JSON.stringify(stripped)} = ${JSON.stringify(jExport)}`,
  );
  const kashidaCount = jDom.join('').split(U_KASHIDA).length - 1;
  assert(
    kashidaCount > 0,
    `وفيها تطويلٌ حقيقيٌّ (${kashidaCount} محرفَ U+0640) — فالبندُ لم يَقِس حالةً انطفأ فيها التبريرُ أصلًا ثم يُسمّيها تكافؤًا`,
  );
  assert(
    JSON.stringify(stripped) === JSON.stringify(beforeJustify),
    `**وتشغيلُ الكشيدةِ لا يُحرّك موضعَ الكسر** عمّا كانت اللوحةُ تَرسمه قبلها (${JSON.stringify(beforeJustify)}) — وهذا هو التوحيدُ نفسُه من الجهة الأخرى: الطريقان الآن جوابٌ واحد. وعلى \`main\` كانا مختلفَين، فالكشيدةُ كانت تَنقل كسرَ السطر`,
  );
  await page.locator('[data-testid="justify-kashida-toggle"]').click();
  await page.waitForTimeout(600);

  // ═══════════════════════════════════════════════════════════════════════
  // ٥. ضابطان
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n٥. ضابطان');

  // ٥٫١ الخاصّيّةُ غائبةٌ عن النمطِ المحسوب — لا عن الملفِّ المصدر وحدَه
  const tw = await page.evaluate(() => {
    const out = [];
    for (const n of document.querySelectorAll('[data-el-id]')) {
      const v = getComputedStyle(n).textWrap;
      if (v) out.push(`${n.dataset.elId}:${v}`);
    }
    return out;
  });
  assert(
    tw.every((t) => !t.endsWith(':balance')),
    `ولا عنصرَ في اللوحِ كلِّه تَحمله \`text-wrap: balance\` محسوبةً (${tw.join(' · ') || 'لا شيء'}) — والقياسُ على النمط المحسوب لا على نصِّ المصدر`,
  );

  // ٥٫٢ ثباتُ الكسر مع تكبيرِ الشاشة
  //
  // ولِمَ بندٌ لهذا: لأنّ مقاسَ الخطّ مقيسٌ بـ`cqw` فنسبةُ الحرف إلى الصندوق
  // ثابتةٌ مع التكبير — وهو ما يَجعل قراءةَ البكسلات أعلاه مشروعة. ولو تسرّب
  // تكبيرُ الشاشة إلى القياس (وهو خطأٌ وقعتُ فيه وأنا أبني هذا الملفّ) لانقلب
  // هذا البند. فهو يَحرس المقياسَ نفسَه، لا التطبيقَ وحدَه.
  await setText(page, 'discount', AR_LONG);
  await selectEl(page, 'discount');
  await setW(page, 497);
  const atWide = await domLines(page, 'discount');
  await page.setViewportSize({ width: 1000, height: 760 });
  await page.waitForTimeout(800);
  const narrowBox = await paintedBox(page, 'discount');
  const atNarrow = await domLines(page, 'discount');
  assert(
    narrowBox.scale < 0.95,
    `ومنفذٌ أضيقُ يُكبّر اللوحَ بمعامِلٍ آخر فعلًا (scale ${narrowBox.scale.toFixed(4)}) — فالضابطُ قاسَ تكبيرَين لا واحدًا`,
  );
  assert(
    JSON.stringify(atNarrow) === JSON.stringify(atWide),
    `وكسرُ السطر لا يَتغيّر بتكبيرِ الشاشة (${JSON.stringify(atNarrow)} = ${JSON.stringify(atWide)})`,
  );
  await expectUnified(page, 'discount', 'والتوحيدُ قائمٌ عند التكبير الثاني كذلك');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(500);

  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  assert(pageErrors.length === 0, `ولا خطأَ في وحدة التحكّم خلال الملفّ كلّه (${pageErrors.slice(0, 3).join(' | ') || 'لا شيء'})`);
  console.log(`\nالتوحيد: ${unified}/${cases} حالةً تَتطابق فيها اللوحةُ والتصدير`);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  -', f);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
