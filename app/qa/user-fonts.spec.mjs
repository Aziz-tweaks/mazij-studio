#!/usr/bin/env node
// **خطوطُ المستعمل: من ملفٍّ على جهازه، أو مثبّتةٌ فيه بالاسم — وتبقى. ٢٥ أكتوبر ٢٠٢٦.**
//
// المقطعُ المطلوب نسخُه نصُّه بخطٍّ نسخيّ وتسمياتُه بخطٍّ مثبّتٍ في الجهاز. وكان «أضف خط» رابطًا
// وحده، والخطُّ المحمَّل يضيع عند أوّل إعادة تشغيل فيرجع النصُّ إلى خطٍّ احتياطيّ بلا كلمة.
// فصار في «علامتي ← الخطوط»: «أضف خطًّا من جهازك» (ملفّ) و«خط مثبّت على الجهاز» (اسم يُقاس
// وجودُه)، ومكتبةٌ تُحفَظ وتُسجَّل عند كلّ بدء.
//
// والملفُّ المستعمَل هنا ملفُّ Vazirmatn العريض **الذي يحمله المستودع أصلًا** منسوخًا باسمٍ آخر:
// فيُقاس أنّ النصّ بالخطّ المستورَد يُرسَم بالبكسل كما يُرسَم بالخطّ المدمَج نفسه — لا حقوقَ
// ولا ملفَّ جديد.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootBlank, resumeAfterReload, AUTOSAVE_KEY } from './helpers/boot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
// خطٌّ مثبّتٌ فعلًا في كلّ بيئةٍ تُشغَّل فيها الحزمة: Arial في ماك، وDejaVu Sans في حاوية لينكس.
const SYSTEM_FONT = isMac ? 'Arial' : 'DejaVu Sans';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-fonts-qa-'));
const FONT_FILE = path.join(TMP, 'MyNaskh.woff2');
fs.copyFileSync(path.join(__dirname, '..', 'src', 'assets', 'fonts', 'files', 'Vazirmatn-800-26.woff2'), FONT_FILE);

async function doc(page) {
  await page.waitForTimeout(900);
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).artboards[0].doc, AUTOSAVE_KEY);
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

async function openFonts(page) {
  if ((await page.locator('[data-testid="font-device"]').count()) === 1) return;
  await page.locator('[data-rail="brand"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-testid="assets-tab-fonts"]').click();
  await page.waitForSelector('[data-testid="font-device"]');
}

/** حبرُ نصٍّ واحدٍ من مُصيِّر التصدير، بعائلةٍ مختارة. */
async function inkHash(page, id, family) {
  return page.evaluate(
    async ({ key, id, family }) => {
      const ex = await import('/src/lib/exportArtboard.ts');
      const d = JSON.parse(window.localStorage.getItem(key)).artboards[0].doc;
      const el = { ...d.elements.find((e) => e.id === id), fontFamily: family };
      const blob = await ex.renderArtboardPng({ size: { id: 'p', ar: '', en: '', w: 1080, h: 1920, kind: 'still' }, palette: { bg: '#101010', fg: '#f0f0f0', ac: '#ffb703' }, elements: [el], transparent: false, lang: 'ar', scale: 0.5, decorAccent: false });
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
      let h = 0;
      let ink = 0;
      for (let i = 0; i < px.length; i += 4) {
        const on = px[i] > 128 ? 1 : 0;
        ink += on;
        h = (h * 31 + on * ((i >> 2) % 7919)) >>> 0;
      }
      return { h, ink };
    },
    { key: AUTOSAVE_KEY, id, family },
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootBlank(page, BASE_URL, 'ig-story');

  const txt = await addText(page, 'الخط من ملف على الجهاز', { x: 0.85, y: 0.2 });
  await page.locator(`[data-el-id="${txt}"]`).click();
  await page.waitForTimeout(150);
  await openFonts(page);

  // ═══════════ ١. ملفّ خطٍّ من الجهاز ═══════════
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-testid="font-from-file"]').click()]);
  await chooser.setFiles(FONT_FILE);
  await page.waitForTimeout(700);
  const row = page.locator('[data-testid="font-row-MyNaskh"]');
  assert((await row.count()) === 1 && (await row.getAttribute('data-family')) === 'Mz-MyNaskh', `الخطُّ يظهر في القائمة باسم ملفّه وعائلةٍ ثابتة «Mz-MyNaskh» (${await row.getAttribute('data-family')})`);
  const d1 = await doc(page);
  assert(d1.elements.find((e) => e.id === txt).fontFamily === 'Mz-MyNaskh', 'ويُطبَّق على النصّ المحدَّد في الخطوة نفسها');
  const faceInfo = await page.evaluate(() => {
    const f = [...document.fonts].find((x) => x.family === 'Mz-MyNaskh');
    return f ? { status: f.status, weight: f.weight } : null;
  });
  assert(faceInfo && faceInfo.status === 'loaded' && faceInfo.weight === '100 900', `مسجَّلٌ بمدى الأوزان كلّه (${JSON.stringify(faceInfo)}) — فلا يُعرِّض المتصفّحُ خطًّا عريضًا مرّةً ثانية`);
  const mine = await inkHash(page, txt, 'Mz-MyNaskh');
  const builtin = await inkHash(page, txt, 'Vazirmatn');
  const fallback = await inkHash(page, txt, 'serif');
  assert(mine.h === builtin.h && mine.ink === builtin.ink, `التصديرُ يرسم بالخطّ المستورَد: مطابقٌ بالبكسل لرسم الملف نفسه مدمَجًا (${mine.ink} = ${builtin.ink})`);
  assert(mine.h !== fallback.h, `ولا يشبه الخطَّ الاحتياطيّ (${fallback.ink} بكسل)`);

  // ═══════════ ٢. خطٌّ مثبّتٌ بالاسم — ويُقاس وجودُه ═══════════
  await page.locator('[data-testid="font-system-name"]').fill('NoSuchFont-Mazij-123');
  await page.locator('[data-testid="font-system-use"]').click();
  await page.waitForTimeout(200);
  assert((await page.locator('[data-testid="font-error"]').count()) === 1 && (await page.locator('[data-testid="font-row-NoSuchFont-Mazij-123"]').count()) === 0, 'اسمٌ غيرُ مثبّت يُرفَض بكلمةٍ تقول لماذا — لا خطَّ وهميًّا في القائمة');
  await page.locator('[data-testid="font-system-name"]').fill(SYSTEM_FONT);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const sysRow = page.locator(`[data-testid="font-row-${SYSTEM_FONT}"]`);
  assert((await sysRow.count()) === 1 && (await page.locator('[data-testid="font-error"]').count()) === 0, `«${SYSTEM_FONT}» المثبّت يُضاف ويُطبَّق`);
  const d2 = await doc(page);
  const fam2 = d2.elements.find((e) => e.id === txt).fontFamily;
  assert(fam2 === (SYSTEM_FONT.includes(' ') ? `'${SYSTEM_FONT}'` : SYSTEM_FONT), `بعائلةٍ يقرؤها CSS والقُماش (${fam2})`);

  // ═══════════ ٣. يبقيان بعد إعادة التشغيل ═══════════
  await page.waitForTimeout(1300);
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(600);
  await openFonts(page);
  assert((await page.locator('[data-testid="font-row-MyNaskh"]').count()) === 1 && (await page.locator(`[data-testid="font-row-${SYSTEM_FONT}"]`).count()) === 1, 'الخطّان في القائمة بعد إعادة التشغيل');
  const after = await page.evaluate(() => [...document.fonts].find((f) => f.family === 'Mz-MyNaskh')?.status);
  assert(after === 'loaded', `وملفُّ الخطّ مسجَّلٌ من جديد من المكتبة (${after})`);
  const mineAfter = await inkHash(page, txt, 'Mz-MyNaskh');
  assert(mineAfter.h === builtin.h, 'ونصٌّ بالخطّ المستورَد يُرسَم بعد إعادة التشغيل كما رُسم قبلها');

  // ═══════════ ٤. الإزالة ═══════════
  await page.locator('[data-testid="font-remove-MyNaskh"]').click();
  await page.waitForTimeout(300);
  assert((await page.locator('[data-testid="font-row-MyNaskh"]').count()) === 0, '«×» يزيله من المكتبة');
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(500);
  await openFonts(page);
  assert((await page.locator('[data-testid="font-row-MyNaskh"]').count()) === 0 && (await page.locator(`[data-testid="font-row-${SYSTEM_FONT}"]`).count()) === 1, 'ويبقى مُزالًا بعد إعادة التشغيل، والآخرُ باقٍ');

  assert(pageErrors.length === 0, `لا أخطاءَ في الصفحة: ${JSON.stringify(pageErrors)}`);
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
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
