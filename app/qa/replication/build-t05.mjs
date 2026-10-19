#!/usr/bin/env node
// بناء محاولة الهدف `t05-update-card` من داخل واجهة مزيج وحدها — وهي أوّل محاولةٍ
// **متحرّكة** في الحلقة: الثلاثُ قبلها صورٌ ساكنة.
//
// والمرجع نفسه محليٌّ لا يُرفَع: `targets/t05-update-card/README.md` على
// `recon/t05-design-target`. وهو عملٌ منشورٌ لا يملكه هذا المستودع.
//
// ═══════════════════════════════════════════════════════════════════════════
// الخطُّ الأحمر: الهندسةُ متتبَّعة والمحتوى محليّ
// ═══════════════════════════════════════════════════════════════════════════
// المرجعُ عملُ جهةٍ خارجيّة. فما يَدخل هذا الملفَّ هو **الهندسةُ والزمنُ واللونُ
// والحركة** — وهي ما تَختبره الحلقة — ولا يَدخله نصُّ المرجع ولا شكلُ علامته.
//
// وهذا هو الحلُّ نفسُه الذي مشى عليه `t02` و`t03`: الحروفُ والعلاماتُ تُقرأ من
// `targets/t05-update-card/content.local.json` **إن وُجد** (وهو مستثنًى في
// `.gitignore`)، وإلّا فمن `NEUTRAL` أدناه: سلاسلُ محايدةٌ وعلاماتٌ محايدة.
// فتشغيلٌ محليٌّ يُعيد إنتاج المرجع، واستنساخٌ بلا الملفّ يَبني القطعةَ نفسَها
// بنيةً وزمنًا بمحتوًى محايد — **ويَعمل**.
//
// وأسماءُ العناصر في هذا الملفّ **أدوارٌ لا محتوًى**: «الشارة» و«البطاقة»
// و«الكبسولة» و«البقع».
//
// ═══════════════════════════════════════════════════════════════════════════
// ما يَختبره هذا الهدف ولم يَختبره ما قبله
// ═══════════════════════════════════════════════════════════════════════════
// (١) **ضبابيّةُ عنصر** متحرّكةً مع `x`/`y`/`opacity` — «البقع» تنجرف وتتلاشى.
// (٢) **تحجيمٌ غيرُ متجانس** `scaleX`/`scaleY` — دخولُ «البطاقة».
// (٣) **تجاوزٌ ثمّ استقرار** بمنحنى `back` — دخولُ «الشارة» ودخولُ «البطاقة».
// (٤) **ضبابُ الحركة** عند التصدير — `samples` في خيارات التصدير، وهي
//     تصديريّةٌ وحدها تُصرّح بذلك المعاينةُ في نصّها.
// (٥) **ثباتٌ نهائيٌّ طويل** من ٧٫٨٣٣ ث إلى ١٢٫٠٠٠ ث.
//
// التشغيل: node qa/replication/build-t05.mjs [out.mp4]   (خادم التطوير يعمل)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { bootBlank } from '../helpers/boot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.QA_BASE_URL || process.env.MAZIJ_URL || 'http://localhost:1420';
const OUT = process.argv[2] || path.join(__dirname, 'attempt-t05.mp4');
const DIR = path.join(__dirname, 'targets/t05-update-card');
const AUTOSAVE_KEY = 'mazij.autosave.v1';

// نفسُ ثنائيّة ffmpeg التي يَحزمها التطبيق — لا ثنائيّةٌ من النظام.
const FFMPEG = path.join(__dirname, '../../src-tauri/binaries/ffmpeg-aarch64-apple-darwin');

// ───────────────────────────────────────────────────────────────────────────
// حقائقُ الحاوية، مقروءةً من المرجع لا مُقدَّرة (`probeVideo` في README الهدف).
// ───────────────────────────────────────────────────────────────────────────
const DOC = { w: 2560, h: 1440 };
const FPS = 30;
const DURATION = 12.0;
const FRAMES = 360;
const SHUTTER_SAMPLES = 8;

// ───────────────────────────────────────────────────────────────────────────
// الألوان — كلُّها مقيسةٌ من إطارات المرجع ببكسلٍ مُسمًّى، لا مأخوذةٌ بالعين.
// ولا واحدَ منها تُعطيه لوحةٌ جاهزة، فكلُّها يَمرّ بحقل الستّ عشريّ.
// ───────────────────────────────────────────────────────────────────────────
const C = {
  bg: '#fee7cf',        // (20,20) في كلّ إطارٍ غير الشاذّ #240
  badge: '#0ea06a',     // (1090,560) @ t=2.0
  mark: '#f5f0e9',      // أعمدةُ الشارة (1160,800) @ t=1.2
  accent: '#f6b32c',    // (1280,578) @ t=2.0
  card: '#ffffff',      // (1280,800) @ t=4.4
  cursor: '#48474e',    // (1280,760) @ t=3.0
  ink: '#2f3236',       // حبرُ سطرَي البطاقة
  green: '#0b9d67',     // حبرُ العنوان وحبرُ الكبسولة
  // ذروةُ البقعة الدافئة في المرجع تبعد عن الخلفيّة ٥٩ (مجموعَ القنوات) عند
  // (١٩٢،١٤٤)؛ وأوّلُ لونٍ جُرّب أعطى ٥٠ بعد الضبابيّة، فأُشبِع ليُطابق.
  blobA: '#fdcda0',
  blobB: '#fdc4bd',
  blobC: '#dce3c4',
};

// ───────────────────────────────────────────────────────────────────────────
// المحتوى المحايد — ما يُبنى حين لا يوجد `content.local.json`.
//
// والعلاماتُ المحايدةُ **ثلاثةُ أعمدةٍ متساوية**: بنيةُ المرجع (شارةٌ مربّعةٌ
// تحمل علاماتٍ) محفوظة، وهويّتُه ليست فيها.
// ───────────────────────────────────────────────────────────────────────────
const NEUTRAL = {
  badgeMarks: [
    { kind: 'roundRect', x: 1129, y: 675, w: 58, h: 222, fill: C.mark, radius: 50 },
    { kind: 'roundRect', x: 1252, y: 675, w: 57, h: 222, fill: C.mark, radius: 50 },
    { kind: 'roundRect', x: 1369, y: 675, w: 56, h: 222, fill: C.mark, radius: 50 },
  ],
  cardTop: 'سطر',
  cardMain: 'عنصر',
  headline: 'عنوان',
  word: 'كلمة',
  capsule: '0.0.0',
};

function loadContent() {
  const p = path.join(DIR, 'content.local.json');
  if (!fs.existsSync(p)) {
    console.log('  · لا `content.local.json` — يُبنى بمحتوًى محايد.');
    return { ...NEUTRAL, local: false };
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  console.log('  · `content.local.json` موجود — يُبنى بمحتوى المرجع.');
  return { ...NEUTRAL, ...raw, local: true };
}

// ───────────────────────────────────────────────────────────────────────────
// الهندسةُ المقيسة — بالبكسل على ٢٥٦٠×١٤٤٠، من إطاراتٍ بعينها.
// ───────────────────────────────────────────────────────────────────────────
const G = {
  bg: { x: 0, y: 0, w: DOC.w, h: DOC.h },
  // البقع: الصندوقُ هو موضعُها عند t=0، والانجرافُ مفاتيحُ `x`/`y` أدناه.
  blobA: { x: -32, y: 8, w: 560, h: 560 },
  blobB: { x: 2140, y: 100, w: 520, h: 520 },
  blobC: { x: 2240, y: 820, w: 480, h: 480 },
  // الشارة: ٤٣٢×٤٣٢ عند (١٠٦٤،٥٠٤) ثابتةً من ٠٫٦ إلى ٣٫٢ ث — مركزُ اللوح بالضبط.
  // ونصفُ القطر ٩٦ على ٤٣٢ = ٠٫٢٢٢ (قوسٌ دائريّ، قيس في README الهدف §٦).
  badge: { x: 1064, y: 504, w: 432, h: 432, radius: 22 },
  // المؤشّر: مثلّثٌ داكن. القياسُ تقريبيٌّ (الصندوقُ الداكنُ يَختلط بحبر البطاقة).
  cursor: { x: 1250, y: 688, w: 64, h: 92 },
  // البطاقة: ٣٦٤×٣٣٩ عند (١٠٩٨،٥٣٥) ثابتةً من ٣٫٩٣ إلى ٥٫١٠ ث.
  // ونصفُ القطر ٨٠ مُلائَمًا على مقطع الزاوية (انحرافٌ ≤ ١ بكسل) = ٠٫٢٣٦.
  card: { x: 1098, y: 535, w: 364, h: 339, radius: 24 },
  // **صناديقُ النصّ متمركزةٌ أفقيًّا ورأسيًّا على مركز حبر المرجع**، ومقاساتُها
  // **معايَرةٌ لا مُقدَّرة**: صُدِّرت جولةٌ بمقاسٍ معلوم، وقيس عرضُ حبرها، فصار
  // المقاسُ = القديمُ × (عرضُ حبر المرجع ÷ عرض الحبر المقيس). وخطُّ المرجع ليس
  // واحدًا من عائلات مزيج الثلاث — حدٌّ موثَّقٌ من `t03` — فالنسبةُ تُطابِق العرضَ
  // وحدَه، ويبقى الارتفاعُ مختلفًا لأن نسبةَ الحرف إلى المقاس صفةُ الخطّ.
  cardTop: { x: 1131, y: 531, w: 300, h: 120, size: 19 },    // حبرُ المرجع ١٠٢×٤٠ @ (١٢٣٠،٥٧١)
  cardMain: { x: 1130, y: 699, w: 300, h: 120, size: 25 },   // حبرُ المرجع ١٩٩×٥٩ @ (١١٨١،٧٣٠)
  // الكبسولة: ٣٦٩×١٧٥ عند (١٠٩٦،٩١٤) في الإطار النهائيّ — كبسولةٌ تامّة (٥٠٪).
  //
  // **و`y` هنا ٩١٧ لا ٩١٤ المقيسة، وثلاثةُ البكسلات حسابٌ يُقال:** الكبسولةُ
  // تنجرف في المرجع **١٩ بكسلًا** نازلةً (قاعُها ١٠٦٩ عند ٥٫٤٠٠ث و١٠٨٨ عند
  // ١٠٫٠٠٠ث)، وأصغرُ إزاحةٍ تَكتبها مِمسحةُ المفتاح على لوحٍ عرضُه ٢٥٦٠ هي
  // ٢٥٫٦ بكسل. فشوطُ خطوةٍ واحدةٍ من الموضع المقيس يُنزِل القاعَ ١٠٦٣ ← ١٠٨٩،
  // وطرفُه الأوّلُ خارجُ تسامحِ ٠٫٤٪ بـ٠٫٦ بكسل. وإنزالُ الصندوق ثلاثةَ بكسلاتٍ
  // يَضع الطرفين معًا في وسط تسامحهما (١٠٦٦٫٤ و١٠٩٢). وهو إزاحةٌ أصغرُ من ضجيج
  // قياس المرجع نفسِه، وتُقال لأنها اختيارٌ لا مصادفة.
  capsule: { x: 1096, y: 917, w: 369, h: 175, radius: 50 },
  capsuleText: { x: 1082, y: 937, w: 400, h: 140, size: 44 }, // حبرُ المرجع ٢٦٨×٦٤ @ (١١٤٨،٩٧٢)
  // العنوان: حبرُ المرجع ٣٧٨×١١٦ عند (١٣١٨،٦٢٤) — مركزُه (١٥٠٧،٦٨٢).
  headline: { x: 1247, y: 592, w: 520, h: 180, size: 50 },
  // الكلمة: حبرُ المرجع ٢٨١×١٠٤ عند (٨٦٠،٦٢٨) — مركزُه (١٠٠٠،٦٨٠).
  word: { x: 760, y: 590, w: 480, h: 180, size: 51 },
};

// ───────────────────────────────────────────────────────────────────────────
// الزمن — كلُّ لحظةٍ هنا مقيسةٌ من المرجع ومُقرَّبةٌ إلى إطار (١/٣٠ ث).
//
// وقيمُ المفاتيح **بالنسبة المئويّة كما تَقبلها مِمسحةُ المفتاح**: `opacity`
// و`scale`/`scaleX`/`scaleY` بالمئة، و`x`/`y` كسرًا من **عرض اللوح** (١٪ =
// ٢٥٫٦ بكسل على هذا المقاس)، و`blur` كذلك.
//
// **وهذا حدٌّ مقيس:** المِمسحةُ خطوتُها ١ صحيحٌ بلا `step`
// (`src/components/Timeline.tsx:700-706`)، فأصغرُ إزاحةٍ يُمكن كتابتُها على هذا
// اللوح ٢٥٫٦ بكسل. وانجرافُ الكبسولة في المرجع ٢٠ بكسلًا — **أدقُّ من أصغر
// خطوةٍ تَملكها الواجهة**. مكتوبٌ هنا لا مُكتشَفٌ في التقرير.
// ───────────────────────────────────────────────────────────────────────────
const f = (n) => +(n / FPS).toFixed(4); // رقمُ إطارٍ → ثانية

const KF = {
  blobFadeStart: f(85),   // ٢٫٨٣٣ — آخرُ إطارٍ تَظهر فيه البقع بكامل عتامتها
  blobGone: f(89),        // ٢٫٩٦٧ — صفرُ طاقةٍ في نطاق البقع
  badgeIn: f(17),         // ٠٫٥٦٧ — ٤٣٢ بكسلًا مستقرّة
  badgeOpaque: f(5),      // ٠٫١٦٧
  marksIn: f(23),         // ٠٫٧٦٧
  riseStart: f(96),       // ٣٫٢٠٠ — أوّلُ إطارٍ يَرتفع فيه صندوقُ الشارة
  riseEnd: f(112),        // ٣٫٧٣٣
  badgeOut: f(116),       // ٣٫٨٦٧ — لا أخضرَ بعدها
  cardIn: f(113),         // ٣٫٧٦٧ — أوّلُ أثرٍ أبيض
  cardFlat: f(117),       // ٣٫٩٠٠ — آخرُ إطارٍ يَسكن فيه قاعُ البطاقة قبل انتقاله
  cardKnee: f(120),       // ٤٫٠٠٠ — مَفصلُ شوطِ النزول، وبعده خطوةُ التجاوز
  // **ويَنتهي النزولُ عند ٤٫١٠٠ لا ٤٫٢٣٣، وهذا شرطُ قياسٍ لا ذوق**: بندُ شكل
  // المنحنى يَقرأ نافذةً تنتهي عند ٤٫٢٣٣ ويَرفضها إن كان العنصرُ ما زال يتحرّك
  // في آخرها — فلا مستقرَّ يُقاس التجاوزُ عليه. فالحركةُ تَسكن قبل الطرف بثلاثة
  // إطارات. قيس: تباعدُ آخر ثلاثة مواضعَ كان ٠٫٩٤ بكسل، وذيلُ المرجع ٠٫٠٥.
  cardLand: f(123),       // ٤٫١٠٠
  cardSet: f(127),        // ٤٫٢٣٣ — طرفُ نافذة القياس
  cardTextIn: f(121),     // ٤٫٠٣٣
  cursorIn: f(57),        // ١٫٩٠٠
  cursorSet: f(84),       // ٢٫٨٠٠
  cursorUp: f(146),       // ٤٫٨٦٧ — ذروةُ ارتفاع المؤشّر
  cursorBack: f(152),     // ٥٫٠٦٧
  cardOut: f(157),        // ٥٫٢٣٣ — لا أبيضَ في نطاق البطاقة
  cardHoldEnd: f(153),    // ٥٫١٠٠
  capsuleIn: f(164),      // ٥٫٤٦٧
  capsuleFull: f(166),    // ٥٫٥٣٣ — نهايةُ شوط الظهور
  capsuleStart: f(160),   // ٥٫٣٣٣
  driftEnd: f(218),       // ٧٫٢٦٧ — آخرُ إطارٍ ينزل فيه صندوقُ الكبسولة
  // الكلمةُ تَكتمل في المرجع في **إطارٍ واحد** (لا شيءَ عند ٥٫٩٣٣ وكلُّ شيءٍ عند
  // ٥٫٩٦٧)، ولا يُكتَب ذلك هنا: مفتاحان يفصلهما إطارٌ واحدٌ ماستاهما متراكبتان
  // فلا تُنقَر إحداهما. فالشوطُ أربعةُ إطارات، والفرقُ مُعلَن.
  wordStart: f(175),      // ٥٫٨٣٣
  wordIn: f(179),         // ٥٫٩٦٧
};

const log = (...m) => console.log('  ·', ...m);
const sleep = (page, ms) => page.waitForTimeout(ms);

// ═══════════════════════════════════════════════════════════════════════════
// إيماءاتُ الواجهة — كلُّ واحدةٍ شيءٌ يَستطيع إنسانٌ أداءه بفأرةٍ ولوحةِ مفاتيح.
// ═══════════════════════════════════════════════════════════════════════════

function geoField(page, key) {
  return page.locator('label').filter({ has: page.locator(`span:text-is("${key}")`) }).locator('input[type="number"]');
}

async function typeInto(locator, page, value) {
  await locator.click({ clickCount: 3 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(String(value), { delay: 8 });
  await page.keyboard.press('Tab');
  await sleep(page, 70);
}

async function setBox(page, box) {
  for (const [k, v] of [['X', box.x], ['Y', box.y], ['W', box.w], ['H', box.h]]) {
    if (v === undefined) continue;
    await typeInto(geoField(page, k), page, Math.round(v));
  }
}

const lastElId = (page) =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all.length ? all[all.length - 1].getAttribute('data-el-id') : null;
  });

/** لونُ الشكل: حقلُ الستّ عشريّ في قسم «الشكل». */
async function setShapeFill(page, elId, hex) {
  await typeInto(page.locator(`[data-testid="shape-fill-hex-${elId}"]`), page, hex);
  await sleep(page, 120);
}

/** زوايا الشكل: مِمسحةُ «الزوايا»، ٠..٥٠ بالمئة من `min(w,h)`. */
async function setRadius(page, pct) {
  const slider = page.locator('label').filter({ has: page.locator('span:text-is("الزوايا")') }).locator('input[type="range"]').first();
  await slider.fill(String(pct));
  await sleep(page, 120);
}

/** ضبابيّةُ العنصر الساكنة: مِمسحةُ «ضبابية» في قسم التأثيرات، ٠..١٠٠ → ٠..٠٫١
 * كسرًا من عرض اللوح (`PropsTab.tsx:1760`). */
async function setBlur(page, elId, pct) {
  await page.locator(`[data-testid="fx-blur-${elId}"]`).fill(String(pct));
  await sleep(page, 160);
}

/** شكلٌ من مكتبة الأشكال: نقرةٌ على أداة «شكل» ثم نقرةٌ على البلاطة. */
async function addShape(page, tile) {
  await page.locator('[data-tool="shape"]').click();
  await sleep(page, 280);
  await page.locator(`[data-shape-tile="${tile}"]`).click();
  await sleep(page, 420);
  return lastElId(page);
}

async function addText(page, content) {
  await page.locator('[data-tool="text"]').click();
  await sleep(page, 180);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.mouse.click(ab.x + ab.width * 0.5, ab.y + ab.height * 0.5);
  await sleep(page, 400);
  await page.keyboard.type(content, { delay: 12 });
  await sleep(page, 240);
  await page.keyboard.press('Escape');
  await sleep(page, 220);
  return lastElId(page);
}

async function setFontSize(page, px) {
  const field = page.locator('label').filter({ has: page.locator('span:text-is("px")') }).locator('input[type="number"]');
  await typeInto(field, page, Math.round(px));
  await sleep(page, 120);
}

async function setAlign(page, hIdx, vIdx) {
  const sec = page.locator('section').filter({ has: page.locator('.mz-label:text-is("المحاذاة")') });
  const btns = sec.locator('button');
  if (hIdx !== null) { await btns.nth(hIdx).click(); await sleep(page, 90); }
  if (vIdx !== null) { await btns.nth(3 + vIdx).click(); await sleep(page, 90); }
}

async function setTextFill(page, elId, hex) {
  const sel = `[data-testid^="appearance-fill-${elId}-"][data-testid$="-hex"]`;
  await typeInto(page.locator(sel).first(), page, hex);
  await sleep(page, 140);
}

// ── الخطُّ الزمنيّ ────────────────────────────────────────────────────────────

const rulerSpan = (page) => page.locator('[data-testid="timeline-ruler"]').evaluate((e) => Number(e.dataset.span));

/** يُوقِف المؤشّرَ عند ثانيةٍ بعينها بنقرةٍ على المسطرة، ويُرجع **ما أعلنه
 * البرنامج** لا ما طُلِب منه — **ويُعيد النقرَ حتى يُعلنه**.
 *
 * **والإعادةُ ليست حذرًا بل إصلاحُ عطلٍ مقيس**: منبثقةُ المفتاح تَرقد قربَ
 * المؤشّر، فإن بقيت مفتوحةً التقطت نقرةَ المسطرة فلا يتحرّك المؤشّر — ويَمضي
 * البناءُ فيَكتب كلَّ مفاتيح العنصر عند الزمن نفسِه، أحدُها فوق الآخر. قيس:
 * عنصرٌ طُلِبت له ثلاثةُ مفاتيحَ على ثلاثة أزمنةٍ خرج بمفتاحٍ واحدٍ عند صفر. */
async function parkPlayhead(page, seconds) {
  const clock = () => page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
  const ruler = page.locator('[data-testid="timeline-ruler"]');
  // **بـ`position` داخل العنصر لا بإحداثيٍّ مطلقٍ من `boundingBox`**: صفوفُ
  // الطبقات تُمرَّر رأسيًّا، فمِقياسُ موضعٍ مطلقٍ قد يَقدُم على تمريرةٍ ويُنقَر
  // بعدها فيَقع خارج المسطرة. قيس: نقرةُ «صفر ثانية» أعلنت ٢٫٩٧٧ث.
  for (let i = 0; i < 5; i++) {
    const span = await rulerSpan(page);
    const box = await ruler.boundingBox();
    await ruler.click({ position: { x: Math.min(box.width - 1, (box.width * seconds) / span + 1), y: box.height / 2 } });
    await sleep(page, 110);
    const t = await clock();
    if (Math.abs(t - seconds) <= 0.034) return t;
    await closePopover(page);
  }
  throw new Error(`المؤشّرُ لم يَبلغ ${seconds}ث — أعلن ${await clock()}`);
}

/** يُغلق منبثقةَ المفتاح **ويتحقّق من إغلاقها**. والنقرةُ تُوضَع على صفّ العتامة
 * عند موضعٍ **لا ماسةَ قربه** — محسوبًا من مواضع الماسات لا مُقدَّرًا — لأن نقرةً
 * على ماسةٍ تَفتح منبثقةً جديدةً بدل أن تُغلق القديمة. */
async function closePopover(page) {
  const popover = page.locator('[data-testid="kf-popover"]');
  for (let i = 0; i < 8; i++) {
    if (!(await popover.count())) return;
    const rows = page.locator('[data-clip-row]');
    const n = await rows.count();
    if (!n) return;
    const target = rows.nth(i % n);
    const rb = await target.boundingBox();
    if (!rb) return;
    const kfs = await target.locator('[data-testid^="kf-"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x));
    // **ولا يُقترَب من يمين الصفّ أبدًا.** زرُّ الختم «+» هناك بعينه
    // (`Clip.tsx:367` — `right: 4, width: 16`)، فنقرةُ إغلاقٍ على آخر المسار
    // **تَختم مفتاحًا** بدل أن تُغلق. وهذا هو العطلُ الذي نثر على مسارات العناصر
    // مفاتيحَ عند كلّ زمنٍ وقف عنده المؤشّرُ لعنصرٍ آخر — قيس على ثمانية صفوف.
    const limit = rb.width - 56;
    let x = limit - (i % 4) * 90;
    for (let k = 0; k < 60 && kfs.some((d) => Math.abs(d - rb.x - x) < 18); k++) x -= 22;
    while (x < 4) x += 37;
    await target.click({ position: { x: Math.min(limit, Math.max(4, x)), y: rb.height / 2 } });
    await sleep(page, 150);
  }
}

async function dragBy(page, fromX, y, dx, steps = 20) {
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  await page.mouse.move(fromX + dx, y, { steps });
  await page.mouse.up();
  await sleep(page, 120);
}

const animOf = (page, id) =>
  page.evaluate(
    ({ key, elId }) => {
      const raw = JSON.parse(window.localStorage.getItem(key) || 'null');
      if (!raw) return null;
      for (const ab of raw.artboards) {
        const el = ab.doc.elements.find((e) => e.id === elId);
        if (el) return el.anim;
      }
      return null;
    },
    { key: AUTOSAVE_KEY, elId: id },
  );

const docDuration = (page) =>
  page.locator('[data-testid="timeline-medium"]').evaluate((e) => Number(e.dataset.duration));

/** يُبلِّغ المستندَ اثنتي عشرة ثانية بإيماءتَين على مقطعٍ واحد.
 *
 * **ولِمَ مقطعٌ واحدٌ لا أربعةَ عشر**، وهذا ما كشفه القياس: `animTimeAt` تَطرح
 * `start − sourceIn` وحدَها (`animTimeline.ts:98-99`)، و`trackValueAt` تُثبِّت
 * القيمةَ خارج طرفَي المسار؛ فلا `duration` تَحجُب مفتاحًا ولا تُخفي عنصرًا.
 * فطولُ المقطع لا يَلزم إلا لشيءٍ واحد: **طولُ المستند**، وهو
 * `max(start + duration)` (`animTimeline.ts:370`). فمقطعٌ واحدٌ يَحمله.
 *
 * **ولِمَ إيماءتان لا سحبةٌ واحدة**، وهذا حدٌّ مقيس: المسطرةُ مداها
 * `max(docDuration, 5)` بلا هامش، فالمقطعُ الذي يَملأ المسار لا تُسحَب حافّتُه
 * أبعدَ من حافّة الشاشة. فيُطال أوّلًا إلى آخر المسار، ثم **يُنقَل جسمُه يمينًا**
 * — والنقلُ بلا سقف (`timelineEdit.ts:90-94`) — فيَطول المستندُ بمقدار النقل.
 * والمقطعُ المختارُ هو الخلفيّةُ وحدَها لأنها بلا مسارات، فإزاحةُ `start` لا
 * تُزيح مفتاحًا. */
async function setDocumentLength(page, id, seconds) {
  const trackBox = () => page.locator('[data-testid="timeline-tracks"]').boundingBox();
  for (let pass = 0; pass < 14; pass++) {
    await page.locator(`[data-testid="clip-row-${id}"]`).scrollIntoViewIfNeeded();
    await sleep(page, 650);
    const dur = await docDuration(page);
    if (Math.abs(dur - seconds) < 0.02) return dur;
    const span = await rulerSpan(page);
    const tracks = await trackBox();
    const pps = tracks.width / span;
    const need = (seconds - dur) * pps;
    const right = await page.locator(`[data-testid="clip-${id}-resize-right"]`).boundingBox();
    const left = await page.locator(`[data-testid="clip-${id}-resize-left"]`).boundingBox();
    const room = tracks.x + tracks.width - 6 - (right.x + right.width / 2);
    if (need < 0 || room > 10) {
      // ما زال في المسار متّسع: تُسحَب الحافّةُ اليمنى بما يُحتاج أو بما يَتّسع.
      await dragBy(page, right.x + right.width / 2, right.y + right.height / 2, need > 0 ? Math.min(need, room) : need, 24);
    } else {
      // لا متّسع: يُنقَل الجسمُ يمينًا من حافّته اليسرى.
      const grab = left.x + left.width / 2 + 10;
      await dragBy(page, grab, left.y + left.height / 2, Math.min(need, tracks.x + tracks.width - 6 - grab), 24);
    }
  }
  await sleep(page, 650);
  return docDuration(page);
}

/** يَختار طبقةً ويُظهر صفَّها. و**الإظهارُ شرطٌ لا تحسين**: لوحُ الخطّ الزمنيّ
 * ارتفاعُه ٢٣٢ بكسلًا وطبقاتُ هذا المشروع سبعَ عشرة، فصفُّ الطبقة التاسعة خارج
 * المنظور — و`boundingBox` يُرجع موضعًا لا يُصيبه مؤشّرُ الفأرة. */
async function selectLayer(page, id) {
  const row = page.locator(`[data-layer-id="${id}"]`);
  if (await row.count()) await row.scrollIntoViewIfNeeded();
  await page.locator(`[data-testid="layer-name-${id}"]`).click();
  await sleep(page, 200);
}

async function expandTracks(page, id) {
  const chev = page.locator(`[data-testid="expand-${id}"]`);
  if (await chev.count()) {
    const row = page.locator(`[data-testid="clip-row-${id}-x"]`);
    if (!(await row.count())) { await chev.click(); await sleep(page, 220); }
  }
}

/** ماساتُ صفٍّ واحد، كما **يُعلنها البرنامجُ في `title`**:
 * `` `${kf.time.toFixed(3)}s · ${(kf.value*100).toFixed(0)}%` `` (`Clip.tsx:338`).
 *
 * **وهذه القراءةُ هي ما حوَّل هذا الملفَّ من «يُؤمَل» إلى «يُقاس».** الصيغةُ
 * الأولى كانت تَنقر «أقربَ ماسةٍ إلى المؤشّر» ثم تَمضي بلا تحقّق، فسقطت صامتةً:
 * مسارُ `scale` خرج بمفتاحٍ قيمتُه ١٠٠٪ حيث طُلِبت صفرًا، ونَبت على مسار العتامة
 * مفتاحٌ لم يُطلَب. والعنوانُ يُعطي الزمنَ والقيمةَ معًا، فتُعنوَن الماسةُ
 * بزمنها لا بموضعها، ويُتحقَّق من القيمة بعد كتابتها. */
async function diamondsOf(page, id, sfx) {
  return page.locator(`[data-testid="clip-row-${id}${sfx}"] [data-testid^="kf-${id}-"]`).evaluateAll((els) =>
    els.map((e) => {
      // الزمنُ قد يكون سالبًا — زمنُ الحركة هو `t − (start − sourceIn)` — فإن
      // أُهمل السالبُ في النمط خرج `NaN` فمرّ المفتاحُ بلا تحقّقٍ أصلًا. قيس.
      const m = /^(-?[\d.]+)s · (-?\d+)%$/.exec(e.getAttribute('title') || '');
      return { testid: e.getAttribute('data-testid'), time: m ? Number(m[1]) : NaN, pct: m ? Number(m[2]) : NaN };
    }),
  );
}

/** يَفتح منبثقةَ ماسةٍ بعينها بنقرةٍ **غيرِ قسريّة**، بعد إغلاق ما قد يكون
 * مفتوحًا.
 *
 * **ولِمَ لا تُنقَر قسرًا، وهو أغلى درسٍ في هذا الملفّ.** النقرةُ القسريّةُ
 * تَتجاوز فحصَ «أيَستقبل العنصرُ المؤشّرَ» وتُرسِل الحدثَ إلى إحداثيّ الماسة —
 * فيَقع على **ما يُغطّيها**. والمنبثقةُ ترقد قربَ المؤشّر وفيها مِمسحةٌ وأزرار،
 * وأزرارُ الختم «+» على يمين كلّ صفّ. والنتيجةُ مقيسةٌ لا متوقَّعة: قيمٌ
 * عشوائيّةٌ (١٠٪ و٢٪ و١٧٪ و٤٧٪) تَكتبها نقرةٌ هبطت على المِمسحة بموضعها، ومفاتيحُ
 * نَبتت على **كلّ** مسارات العنصر الثمانية في اللحظة نفسِها لأن النقرةَ هبطت على
 * أزرار الختم. فالقسرُ لا يُصلح تراكبًا؛ **التباعدُ يُصلحه**: مفتاحان على مسارٍ
 * واحدٍ يَلزمهما أربعةُ إطاراتٍ فأكثر (الإطار ≈ ٣ بكسلات على مسطرة ١٢ث، والماسةُ
 * ٩). ومواضعُ المفاتيح أدناه مكتوبةٌ بهذا القيد. */
async function openDiamond(page, row, testid) {
  await closePopover(page);
  try {
    await page.locator(`${row} [data-testid="${testid}"]`).click({ timeout: 6000 });
  } catch {
    return false;
  }
  await sleep(page, 240);
  return true;
}

/** `start − sourceIn` للعنصر، من حفظ البرنامج نفسِه. مفاتيحُ العنصر تُكتَب
 * بزمن الحركة، وهو زمنُ الخطّ ناقصَ هذا المقدار (`animTimeline.ts:98`). */
const clipOffsetOf = (page, id) =>
  page.evaluate(
    ({ key, elId }) => {
      const raw = JSON.parse(window.localStorage.getItem(key) || 'null');
      for (const ab of raw?.artboards ?? []) {
        const el = ab.doc.elements.find((e) => e.id === elId);
        if (el) return el.anim.start - (el.anim.sourceIn ?? 0);
      }
      return 0;
    },
    { key: AUTOSAVE_KEY, elId: id },
  );

/** مفتاحٌ واحد، مكتوبًا **ومُتحقَّقًا منه**: يُوقِف المؤشّر، يَضغط «+» على صفّ
 * الخصيصة، ثم يَفتح الماسةَ الواقعةَ عند ذلك الزمن ويَكتب القيمة، ثم يَقرأ
 * العنوانَ ليرى ما كُتِب فعلًا — ويُعيد المحاولةَ إن اختلف. */
async function key(page, id, property, seconds, percent, easing = null, offset = 0) {
  // العتامةُ تَسكن صفَّ المقطع نفسَه، فلا لاحقةَ لها في المُعرّف
  // (`Clip.tsx:258` و`:358`). والسبعُ الباقياتُ لها لاحقاتُها.
  const sfx = property === 'opacity' ? '' : `-${property}`;
  const row = `[data-testid="clip-row-${id}${sfx}"]`;
  const want = Math.round(percent);
  // زمنُ الحركة المتوقَّع، مقرَّبًا إلى إطارٍ كما يُقرّبه `snapToFrame`.
  const atime = Math.round((seconds - offset) * FPS) / FPS;

  await closePopover(page);
  await page.locator(row).scrollIntoViewIfNeeded();
  await parkPlayhead(page, seconds);
  await page.locator(`[data-testid="clip-${id}-add-kf${sfx}"]`).click();
  await sleep(page, 240);

  const pick = (list) => {
    const hit = list.filter((k) => Math.abs(k.time - atime) <= 0.02);
    return hit.length ? hit[0] : null;
  };
  let last = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const list = await diamondsOf(page, id, sfx);
    const kf = pick(list);
    if (!kf) throw new Error(`لا ماسةَ على ${id}.${property} عند زمنِ حركةٍ ${atime} — الموجود ${JSON.stringify(list.map((k) => k.time))}`);
    last = kf;
    if (kf.pct === want) break;
    if (!(await openDiamond(page, row, kf.testid))) { await closePopover(page); continue; }
    const slider = page.locator('[data-testid="kf-value-slider"]');
    if (!(await slider.count())) { await closePopover(page); continue; }
    await slider.fill(String(want));
    await sleep(page, 200);
    if (easing) { await page.locator(`[data-testid="kf-easing-${easing}"]`).click(); await sleep(page, 180); }
    await closePopover(page);
  }
  // المنحنى يُكتَب ولو كانت القيمةُ صحيحةً من أوّل ختم (فالختمُ يَكتب `easeOut`).
  if (easing) {
    const kf = pick(await diamondsOf(page, id, sfx)) ?? last;
    await openDiamond(page, row, kf.testid);
    await sleep(page, 60);
    const btn = page.locator(`[data-testid="kf-easing-${easing}"]`);
    if (await btn.count()) { await btn.click(); await sleep(page, 180); }
    await closePopover(page);
  }
  const final = pick(await diamondsOf(page, id, sfx));
  if (!final || final.pct !== want) console.warn(`  ! ${id}.${property}@${seconds}ث: طُلِب ${want}٪ وبقي ${final ? final.pct : 'لا شيء'}٪`);
}

/** مفاتيحُ خصيصةٍ كاملةً: `[[t, pct, easing?], …]` — ثم **تنظيفُ ما لم يُطلَب**.
 *
 * والتنظيفُ ليس احتياطًا: قيس أن مفاتيحَ تَنبت على صفوفٍ عند أزمنةٍ لم تُطلَب
 * (أثرُ نقرةٍ أصابت ماسةً أو زرَّ ختمٍ في أثناء إغلاق منبثقة)، ومفتاحٌ واحدٌ
 * دخيلٌ يُغيّر منحنى الشوط كلِّه. فيُحذَف من سلّة المنبثقة نفسِها. */
async function track(page, id, property, keys) {
  const offset = await clipOffsetOf(page, id);
  const sfx = property === 'opacity' ? '' : `-${property}`;
  const row = `[data-testid="clip-row-${id}${sfx}"]`;
  for (const [t, v, e] of keys) await key(page, id, property, t, v, e ?? null, offset);
  const wanted = keys.map(([t]) => Math.round((t - offset) * FPS) / FPS);
  for (let pass = 0; pass < 8; pass++) {
    const list = await diamondsOf(page, id, sfx);
    const stray = list.find((k) => !wanted.some((w) => Math.abs(w - k.time) <= 0.02));
    if (!stray) return;
    if (!(await openDiamond(page, row, stray.testid))) { await closePopover(page); continue; }
    const del = page.locator('[data-testid="kf-delete"]');
    if (!(await del.count())) { await closePopover(page); continue; }
    await del.click();
    await sleep(page, 200);
    console.warn(`  ~ ${id}.${property}: حُذف مفتاحٌ دخيلٌ عند ${stray.time}ث`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// التصدير
// ═══════════════════════════════════════════════════════════════════════════

/** يَفتح لوحةَ التصدير ويَضبطها كما يَضبطها إنسان: MP4، ٣٠ إطارًا، ضبابُ حركةٍ
 * ×٨، مقاسُ المشروع وحده. ثم يَضغط زرَّ التصدير **ويُرجع ما قالته اللوحةُ
 * فعلًا** — ولا يَدّعي نجاحًا لم يَحدث.
 *
 * وفي متصفّحٍ عاديٍّ لا سِندَ ffmpeg، فاللوحةُ تَقول «يحتاج تطبيق سطح المكتب»
 * صراحةً (`ExportDialog.tsx:471`) ولا تَكذب بشريطِ تقدّمٍ وهميّ. وهذا حدٌّ
 * مُعلَنٌ في التقرير لا مُخفًى. */
async function driveExportDialog(page) {
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await sleep(page, 400);
  await page.locator('button:has-text("MP4")').first().click();
  await sleep(page, 300);
  await page.locator('button').filter({ hasText: /^30$/ }).first().click();
  await sleep(page, 200);
  await page.locator(`[data-testid="export-shutter-${SHUTTER_SAMPLES}"]`).click();
  await sleep(page, 200);
  const shutterOn = await page.locator(`[data-testid="export-shutter-${SHUTTER_SAMPLES}"]`).getAttribute('data-on');
  const costNote = (await page.locator('[data-testid="export-shutter-cost"]').textContent().catch(() => '')) || '';
  const previewNote = (await page.locator('[data-testid="export-shutter-preview-note"]').textContent().catch(() => '')) || '';
  await page.locator('[data-testid="export-only-project-size"]').click();
  await sleep(page, 250);
  const estimate = (await page.locator('[data-testid="export-estimate"]').textContent().catch(() => '')) || '';
  await page.getByRole('button', { name: /^تصدير (ملف واحد|ملفين|\d+ ملفات)$/ }).first().click();
  await sleep(page, 2500);
  const results = (await page.locator('[data-testid="export-results"]').textContent().catch(() => '')) || '';
  const body = await page.locator('[role="dialog"], [data-testid="export-results"]').first().textContent().catch(() => '');
  await page.keyboard.press('Escape');
  await sleep(page, 400);
  return { shutterOn, costNote, previewNote, estimate, results, body: (body || '').slice(0, 400) };
}

/** يُصيّر الإطاراتِ بمسار التصدير نفسِه الذي تُناديه لوحةُ التصدير
 * (`renderArtboardFrames` في `src/lib/exportArtboard.ts:749`) بخيارات الغالق
 * نفسِها، ثم يُرمّزها بثنائيّة ffmpeg التي يَحزمها التطبيق وبالوسائط نفسِها
 * التي يُمرّرها `src/lib/videoExport.ts`.
 *
 * **وهذا هو الموضعُ الوحيد في هذا الملفّ الذي لا يَمرّ بالفأرة**، وسببُه مُقاسٌ
 * لا مُقدَّر: سِندُ ffmpeg غيرُ موجودٍ في متصفّحٍ عاديّ، فزرُّ التصدير يَصل إلى
 * «يحتاج تطبيق سطح المكتب» ولا يُخرج بايتًا. والدالّةُ المُناداةُ هنا هي
 * **الدالّةُ نفسُها** التي يُناديها الزرّ، بالوسائط نفسِها. */
async function renderFramesViaProgram(page, dir) {
  fs.mkdirSync(dir, { recursive: true });
  let written = 0;
  // إطارٌ إطارًا إلى القرص — لا مصفوفةَ ٣٦٠ صورةً بمقاس ٢٥٦٠×١٤٤٠ في الذاكرة.
  // التسميةُ من **واحد** لا من صفر، كما يُسمّي `videoExport.ts:27-28` بالضبط
  // (`index + 1`) — فـ`image2` في ffmpeg يَبدأ عدَّه من ١ ما لم يُقَل له غيرُ ذلك،
  // ومَن سمّى من صفرٍ خرج بحاويةٍ فارغةٍ ورمزِ خروجٍ صفر. قيس: ٤٨ بايتًا.
  await page.exposeBinding('__t05WriteFrame', async (_src, i, b64) => {
    fs.writeFileSync(path.join(dir, `frame-${String(i + 1).padStart(5, '0')}.png`), Buffer.from(b64, 'base64'));
    written += 1;
    if (written % 60 === 0) process.stdout.write(`    … ${written}/${FRAMES}\n`);
  });
  await page.evaluate(
    async ({ fps, frames, samples }) => {
      const mod = await import('/src/lib/exportArtboard.ts');
      const spec = window.__mazijExportSpec;
      const times = Array.from({ length: frames }, (_, i) => i / fps);
      await mod.renderArtboardFrames(
        spec,
        times,
        async (blob, i) => {
          const buf = new Uint8Array(await blob.arrayBuffer());
          let s = '';
          for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode(...buf.subarray(k, k + 0x8000));
          await window.__t05WriteFrame(i, btoa(s));
        },
        { shutter: { samplesPerFrame: samples, angle: 180 }, frameInterval: 1 / fps },
      );
    },
    { fps: FPS, frames: FRAMES, samples: SHUTTER_SAMPLES },
  );
  return written;
}

function encode(dir, out) {
  return new Promise((resolve, reject) => {
    // الوسائطُ نفسُها التي يُمرّرها `videoExport.ts` لفرع mp4 بجودةٍ عالية.
    const ff = spawn(FFMPEG, [
      '-y',
      '-framerate', String(FPS),
      '-i', path.join(dir, 'frame-%05d.png'),
      '-frames:v', String(FRAMES),
      '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18',
      '-color_range', 'tv',
      '-colorspace', 'bt709',
      '-color_primaries', 'bt709',
      '-color_trc', 'bt709',
      '-movflags', '+faststart',
      out,
    ]);
    let err = '';
    ff.stderr.on('data', (d) => { err += d; });
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err.slice(-900)}`))));
  });
}

// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const content = loadContent();
  const marks = content.badgeMarks;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-t05-'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1700, height: 1060 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  console.log('بناء محاولة t05-update-card من واجهة مزيج…');

  // ١) مستندٌ زمنيّ، ثم مقاسٌ مخصّصٌ ٢٥٦٠×١٤٤٠.
  //
  // **ولا سابقةَ بهذا المقاس في `SIZES`**، ومسارُ «مقاسٌ مخصّص» من الشاشة الأولى
  // يُعطي `medium: 'still'` (`constants.ts:98`) أي بلا خطٍّ زمنيّ أصلًا. والمسارُ
  // الصحيحُ أن يُبدأ من سابقةٍ زمنيّةٍ ثم يُغيَّر المقاس من قائمة اللوح: هناك
  // `withDerivedMedium` يُبقي الوسيطَ كما هو (`StudioContext.tsx:444-445`).
  await bootBlank(page, BASE_URL, 'yt-video');
  await page.locator('button', { hasText: /^احترافي$/ }).first().click();
  await sleep(page, 300);
  await page.locator('[data-testid="size-menu-button"]').click();
  await sleep(page, 300);
  await page.locator('[data-testid="size-option-custom"]').click();
  await sleep(page, 250);
  await page.locator('[data-testid="custom-size-w"]').fill(String(DOC.w));
  await page.locator('[data-testid="custom-size-h"]').fill(String(DOC.h));
  await page.locator('[data-testid="custom-size-apply"]').click();
  await sleep(page, 700);
  const medium = await page.locator('[data-testid="artboard-medium"]').getAttribute('data-medium');
  if (medium !== 'timed') throw new Error(`المستندُ ليس زمنيًّا بعد تغيير المقاس: ${medium}`);
  log(`مستند زمنيّ ${DOC.w}×${DOC.h}`);

  const ids = {};

  // ٢) الخلفيّة — مستطيلٌ ملءَ اللوح. (خلفيّةُ اللوح لا تَقبل إلا فهرسَ لوحةٍ
  //    جاهزة، و#fee7cf ليس خلفيّةَ أيٍّ منها — حدٌّ موثَّقٌ من جولة `t03`.)
  ids.bg = await addShape(page, 'rect');
  await setBox(page, G.bg);
  await setShapeFill(page, ids.bg, C.bg);
  log(`الخلفيّة ${ids.bg}`);

  // ٣) البقع الثلاث — بيضاوياتٌ ضبابيّةٌ تنجرف ثم تتلاشى.
  for (const [k, g, fill] of [['blobA', G.blobA, C.blobA], ['blobB', G.blobB, C.blobB], ['blobC', G.blobC, C.blobC]]) {
    ids[k] = await addShape(page, 'ellipse');
    await setBox(page, g);
    await setShapeFill(page, ids[k], fill);
    await setBlur(page, ids[k], 60); // ٠٫٠٦ × ٢٥٦٠ ≈ ١٥٤ بكسلًا نصفَ قطر
    log(`بقعة ${k} ${ids[k]}`);
  }

  // ٤) الشارة وعلاماتُها.
  ids.badge = await addShape(page, 'roundRect');
  await setBox(page, G.badge);
  await setShapeFill(page, ids.badge, C.badge);
  await setRadius(page, G.badge.radius);
  log(`الشارة ${ids.badge}`);

  ids.marks = [];
  for (const m of marks) {
    const id = await addShape(page, m.kind === 'star5' ? 'star5' : 'roundRect');
    await setBox(page, m);
    await setShapeFill(page, id, m.fill);
    if (m.kind !== 'star5') await setRadius(page, m.radius ?? 50);
    ids.marks.push(id);
  }
  log(`علامات الشارة ${ids.marks.join(' · ')}`);

  // ٥) المؤشّر.
  ids.cursor = await addShape(page, 'triangle');
  await setBox(page, G.cursor);
  await setShapeFill(page, ids.cursor, C.cursor);
  log(`المؤشّر ${ids.cursor}`);

  // ٦) البطاقة وسطراها.
  ids.card = await addShape(page, 'roundRect');
  await setBox(page, G.card);
  await setShapeFill(page, ids.card, C.card);
  await setRadius(page, G.card.radius);
  log(`البطاقة ${ids.card}`);

  ids.cardTop = await addText(page, content.cardTop);
  await setFontSize(page, G.cardTop.size);
  await setAlign(page, 1, 1);
  await setBox(page, G.cardTop);
  await setTextFill(page, ids.cardTop, C.ink);

  ids.cardMain = await addText(page, content.cardMain);
  await setFontSize(page, G.cardMain.size);
  await setAlign(page, 1, 1);
  await setBox(page, G.cardMain);
  await setTextFill(page, ids.cardMain, C.ink);
  log(`سطرا البطاقة ${ids.cardTop} · ${ids.cardMain}`);

  // ٧) الكبسولة ونصُّها، ثم العنوان والكلمة.
  ids.capsule = await addShape(page, 'roundRect');
  await setBox(page, G.capsule);
  await setShapeFill(page, ids.capsule, C.card);
  await setRadius(page, G.capsule.radius);

  ids.capsuleText = await addText(page, content.capsule);
  await setFontSize(page, G.capsuleText.size);
  await setAlign(page, 1, 1);
  await setBox(page, G.capsuleText);
  await setTextFill(page, ids.capsuleText, C.green);

  ids.headline = await addText(page, content.headline);
  await setFontSize(page, G.headline.size);
  await setAlign(page, 1, 1);
  await setBox(page, G.headline);
  await setTextFill(page, ids.headline, C.green);

  ids.word = await addText(page, content.word);
  await setFontSize(page, G.word.size);
  await setAlign(page, 1, 1);
  await setBox(page, G.word);
  await setTextFill(page, ids.word, C.accent);
  log(`الكبسولة ${ids.capsule} · العنوان ${ids.headline} · الكلمة ${ids.word}`);

  // ٨) المدّة: اثنتا عشرة ثانيةً بالضبط، من مقطع الخلفيّة وحدَه.
  await selectLayer(page, ids.bg);
  const docDur = await setDocumentLength(page, ids.bg, DURATION);
  log(`مدّة المستند ${docDur} ث`);
  if (Math.abs(docDur - DURATION) > 0.05) throw new Error(`المدّة ${docDur} لا ${DURATION}`);

  // ٩) الحركة.
  const K = KF;

  // **والخلفيّةُ لا تُحرَّك ولا يُكتَب عليها مفتاحٌ واحد.** مقطعُها هو الذي نُقِل
  // لإطالة المستند، فزمنُ حركتها يبعد عن زمن الخطّ سبعَ ثوانٍ؛ ومسارٌ فارغٌ
  // يُرجع المحايدَ عند كلّ زمن (`animTimeline.ts:241`) فلا حاجةَ إلى مفتاح.

  // البقع: انجرافٌ خطّيٌّ ثم تلاشٍ سريع.
  const drift = { blobA: [54, 3], blobB: [-84, -4], blobC: [-52, 5] };
  for (const k of ['blobA', 'blobB', 'blobC']) {
    const id = ids[k];
    await selectLayer(page, id);
    await expandTracks(page, id);
    await track(page, id, 'opacity', [[0, 100], [K.blobFadeStart, 100], [K.blobGone, 0]]);
    await track(page, id, 'x', [[0, 0], [K.blobGone, drift[k][0]]]);
    await track(page, id, 'y', [[0, 0], [K.blobGone, drift[k][1]]]);
    log(`حركة ${k}`);
  }

  // الشارة: دخولٌ بتجاوزٍ (`back`)، ثم صعودٌ متسارع، ثم تلاشٍ وانكماش.
  await selectLayer(page, ids.badge);
  await expandTracks(page, ids.badge);
  await track(page, ids.badge, 'opacity', [[0, 0], [K.badgeOpaque, 100], [K.riseEnd, 100], [K.badgeOut, 0]]);
  await track(page, ids.badge, 'scale', [[0, 0, 'back'], [K.badgeIn, 100], [K.riseEnd, 100], [K.badgeOut, 80]]);
  await track(page, ids.badge, 'y', [[K.riseStart, 0, 'easeIn'], [K.riseEnd, -10]]);
  log('حركة الشارة');

  // العلامات: تَظهر بعد استقرار الشارة، وتَصعد معها بالمقدار نفسِه.
  //
  // **ولا تُشارك الشارةَ دخولَها بالمقياس**، وهذا حدٌّ مقيس: `scale` يُكبّر
  // العنصرَ حول مركزِ **نفسِه**، ولا مجموعةَ تُشارك مسارَ حركةٍ واحدًا
  // (`groupId` يَخدم الاختيارَ والتحويل لا `anim`). فعلامةٌ تُكبَّر مع الشارة
  // تَبقى في مكانها بينما تَنمو الشارةُ تحتها — فتُؤجَّل إلى ما بعد الاستقرار.
  for (const id of ids.marks) {
    await selectLayer(page, id);
    await expandTracks(page, id);
    await track(page, id, 'opacity', [[0, 0], [K.badgeIn, 0], [K.marksIn, 100], [K.riseEnd, 100], [K.badgeOut, 0]]);
    await track(page, id, 'y', [[K.riseStart, 0, 'easeIn'], [K.riseEnd, -10]]);
  }
  log('حركة العلامات');

  // المؤشّر: يَدخل من أسفلِ اليمين، يَستقرّ فوق الشارة، يَصعد معها، ثم يَرتفع
  // قليلًا ويَعود، ثم يَتلاشى مع البطاقة.
  await selectLayer(page, ids.cursor);
  await expandTracks(page, ids.cursor);
  await track(page, ids.cursor, 'opacity', [[0, 0], [K.cursorIn, 0], [f(61), 100], [K.cardHoldEnd, 100], [K.cardOut, 0]]);
  // المنحنى يُكتَب على مفتاحِ **بداية** الشوط لا نهايتِه: `trackValueAt` تقرأ
  // `prev.easing` (`animTimeline.ts:258`).
  await track(page, ids.cursor, 'x', [[K.cursorIn, 18, 'easeOut'], [K.cursorSet, 0]]);
  await track(page, ids.cursor, 'y', [
    [K.cursorIn, 18, 'easeOut'], [K.cursorSet, 0], [K.riseStart, 0, 'easeIn'], [K.riseEnd, -10],
    [f(137), -10], [K.cursorUp, -14, 'easeOut'], [K.cursorBack, -3, 'easeIn'],
  ]);
  log('حركة المؤشّر');

  // البطاقة: **تحجيمٌ غيرُ متجانس** عند الدخول — `scaleX` ينزل و`scaleY` يصعد في
  // اللحظة نفسِها، بمنحنى `back` فيَتجاوز كلٌّ منهما مستقرَّه ثم يعود — ثم
  // **استقرارٌ نازلٌ بتجاوزٍ** على `y`.
  //
  // ومحورُ المقياس يَنتهي **قبل ٣٫٩٠٠ث** لا بعدها، وهذا مقيسٌ لا ذوق: حافّةُ
  // البطاقة اليسرى في المرجع ١٠٩٨ بكسلًا عند ٣٫٩٠٠ث وعند ٤٫١٠٠ث معًا، فـ
  // `scaleX` حيًّا بين اللحظتين يُزيحها عن نفسها.
  //
  // و`y` ثلاثةُ مفاتيح لا مفتاحان، **وهذا حسابٌ لا تزيين**: خطوةُ مِمسحة المفتاح
  // ١٪ = ٢٥٫٦ بكسل على هذا اللوح، و`back` يَتجاوز ٩٫٧٨٪ من الشوط (حُسب على
  // `easing.ts:19`). فشوطٌ من ثلاث خطوات (٧٦٫٨ بكسل) — وهو أقلُّ ما يُخلي شريطَ
  // القاع عند ٣٫٩٠٠ث — يُعطي تجاوزًا ٧٫٥ بكسل، والمرجعُ يتجاوز **٢٫٠٣**. فيُقسَم
  // الشوط: خطوتان بتخفيفٍ بلا تجاوز، ثم خطوةٌ واحدةٌ بـ`back` فتجاوزُها ٢٫٥٠
  // بكسل — وهو أقربُ ما تَبلغه هذه الشبكةُ من ٢٫٠٣.
  await selectLayer(page, ids.card);
  await expandTracks(page, ids.card);
  await track(page, ids.card, 'opacity', [[0, 0], [f(112), 0], [f(116), 100], [K.cardHoldEnd, 100], [K.cardOut, 0]]);
  await track(page, ids.card, 'scaleX', [[f(112), 116, 'back'], [K.cardFlat, 100]]);
  await track(page, ids.card, 'scaleY', [[f(112), 84, 'back'], [K.cardFlat, 100]]);
  await track(page, ids.card, 'y', [[K.cardFlat, -3, 'easeOut'], [K.cardKnee, -1, 'back'], [K.cardLand, 0]]);
  log('حركة البطاقة');

  for (const id of [ids.cardTop, ids.cardMain]) {
    await selectLayer(page, id);
    await expandTracks(page, id);
    await track(page, id, 'opacity', [[0, 0], [f(116), 0], [K.cardTextIn, 100], [K.cardHoldEnd, 100], [K.cardOut, 0]]);
    await track(page, id, 'y', [[K.cardFlat, -3, 'easeOut'], [K.cardKnee, -1, 'back'], [K.cardLand, 0]]);
  }
  log('حركة سطرَي البطاقة');

  // الكبسولة ونصُّها: دخولٌ بالتلاشي ثم **انجرافٌ بطيءٌ نازل** حتى ٧٫٢٦٧ ث.
  // وهذا الانجرافُ هو ما يَجعل زمنَ السكون النهائيّ ٧٫٨٣٣ لا ٥٫٥.
  for (const id of [ids.capsule, ids.capsuleText]) {
    await selectLayer(page, id);
    await expandTracks(page, id);
    // المنحنى `easeInOut` والشوطُ ستّةُ إطارات: نسبةُ الحبر لا تَتبع العتامةَ
    // خطًّا — كبسولةٌ بيضاءُ بنصف عتامةٍ على كريميٍّ تَعبُر عتبةَ «حبر» في أغلب
    // بكسلاتها — فشوطٌ بتخفيفِ خروجٍ يَضع ٧٥٪ من النموّ في زوجٍ واحد. وشكلُ
    // المرجع نفسُه بطيءٌ ثم سريعٌ ثم بطيء (٠٫٠٢ ← ٨٫٧٤ ← ٣٨٫٨٣ ← ٨٣٫٠١).
    await track(page, id, 'opacity', [[0, 0], [K.capsuleStart, 0, 'easeInOut'], [K.capsuleFull, 100]]);
    // الصندوقُ هو المستقرُّ، والدخولُ خطوةٌ **فوقَه** تَهبط إليه — فالمفتاحُ
    // الأوّلُ سالبٌ والأخيرُ صفر، لا العكس.
    await track(page, id, 'y', [[K.capsuleIn, -1, 'easeOut'], [K.driftEnd, 0]]);
  }
  log('حركة الكبسولة');

  await selectLayer(page, ids.headline);
  await expandTracks(page, ids.headline);
  await track(page, ids.headline, 'opacity', [[0, 0], [K.capsuleStart, 0], [K.capsuleIn, 100]]);

  await selectLayer(page, ids.word);
  await expandTracks(page, ids.word);
  await track(page, ids.word, 'opacity', [[0, 0], [K.wordStart, 0], [K.wordIn, 100]]);
  log('حركة العنوان والكلمة');

  // ١٠) تقريرُ ما بُني فعلًا — **لا ما قُصِد**. يُقرأ من حفظ البرنامج التلقائيّ.
  await sleep(page, 1200);
  const built = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('mazij.autosave.v1'));
    const ab = raw.artboards.find((a) => a.id === raw.activeArtboardId) ?? raw.artboards[0];
    return ab.doc.elements.map((e) => ({
      id: e.id, kind: e.shape ?? e.type ?? 'text', fill: e.fill, op: e.opacity, vis: e.visible, blur: e.blur,
      geo: [Math.round(e.geo.x * 2560), Math.round(e.geo.y * 1440), Math.round(e.geo.w * 2560), Math.round(e.geo.h * 1440)],
      clip: [+e.anim.start.toFixed(3), +e.anim.duration.toFixed(3), +(e.anim.sourceIn ?? 0).toFixed(3)],
      tracks: Object.fromEntries(Object.entries(e.anim.tracks ?? {}).map(([k, v]) => [k, v.map((x) => `${x.time.toFixed(3)}:${Math.round(x.value * 100)}:${x.easing}`).join(' ')])),
    }));
  });
  const names = Object.fromEntries(Object.entries(ids).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x, i) => [x, `${k}${i}`]) : [[v, k]])));
  console.log('\n— ما بُني فعلًا —');
  for (const e of built) console.log(`  ${(names[e.id] ?? e.id).padEnd(12)} ${e.kind.padEnd(10)} ${JSON.stringify(e.geo).padEnd(24)} fill=${e.fill} op=${e.op} clip=${JSON.stringify(e.clip)}\n      ${JSON.stringify(e.tracks)}`);
  fs.writeFileSync(path.join(__dirname, 'attempt-t05.doc.json'), JSON.stringify({ names, built }, null, 1));

  // ١١) التصدير — من لوحة التصدير نفسِها أوّلًا، ثم بمسارها البرمجيّ.
  await parkPlayhead(page, 0);
  const dialog = await driveExportDialog(page);
  console.log('\n— لوحةُ التصدير —');
  console.log('  ضباب الحركة ×' + SHUTTER_SAMPLES + ': data-on=' + dialog.shutterOn);
  console.log('  كلفة: ' + dialog.costNote.trim());
  console.log('  تنبيه المعاينة: ' + dialog.previewNote.trim());
  console.log('  تقدير: ' + dialog.estimate.trim());
  console.log('  نتيجة الضغط: ' + (dialog.results || dialog.body).trim().slice(0, 200));

  // مواصفةُ التصيير **بالحقول نفسِها** التي يَبنيها `StudioContext.tsx:1339-1349`
  // للوحة النشطة: `size` و`palette` و`elements` و`lang` و`decorAccent`، و`scale`
  // واحدٌ لأن الفيديو بدقّة اللوحة (`effectiveExportScale`).
  await page.evaluate(async () => {
    const consts = await import('/src/data/constants.ts');
    const raw = JSON.parse(window.localStorage.getItem('mazij.autosave.v1'));
    const ab = raw.artboards.find((a) => a.id === raw.activeArtboardId) ?? raw.artboards[0];
    const doc = ab.doc;
    window.__mazijExportSpec = {
      size: consts.sizeAt(doc.sizeIdx, doc.customW, doc.customH),
      palette: consts.PALETTES[ab.paletteIdx ?? doc.paletteIdx ?? 0],
      elements: doc.elements,
      transparent: false,
      lang: raw.lang ?? 'ar',
      decorAccent: !!doc.decorAccent,
      scale: 1,
    };
    return { w: window.__mazijExportSpec.size.w, h: window.__mazijExportSpec.size.h, n: doc.elements.length };
  }).then((s) => log(`مواصفة التصدير: ${s.w}×${s.h} · ${s.n} عنصرًا`));

  const framesDir = process.env.T05_FRAMES_DIR || path.join(tmp, 'frames');
  const n = await renderFramesViaProgram(page, framesDir);
  log(`صُيِّر ${n} إطارًا بمسار التصدير نفسِه (غالق ×${SHUTTER_SAMPLES})`);
  if (n !== FRAMES) throw new Error(`صُيِّر ${n} إطارًا لا ${FRAMES}`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await encode(framesDir, OUT);
  // **ورمزُ خروجِ ffmpeg وحدَه لا يُثبت ملفًّا.** حاويةٌ فارغةٌ تَخرج بصفر.
  const size = fs.statSync(OUT).size;
  if (size < 50_000) throw new Error(`المُخرَج ${size} بايتًا — حاويةٌ فارغة، والإطاراتُ في ${framesDir}`);
  log(`رُمِّز إلى ${OUT} (${(size / 1048576).toFixed(2)} م.ب)`);

  if (errors.length) console.error('أخطاء زمن تشغيل:', errors.slice(0, 6).join(' | '));
  await browser.close();
  if (!process.env.T05_FRAMES_DIR) fs.rmSync(tmp, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
