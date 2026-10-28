#!/usr/bin/env node
// **مكتبةُ المشاريع — ٢٨ أكتوبر ٢٠٢٦.**
//
// كان مزيج يحفظ مشروعًا واحدًا، فكلُّ مستندٍ جديد يكتب فوق السابق — وبهذا ضاع مشروعٌ من ٧٥
// عنصرًا حين فُتح قالبٌ للتجربة. الآن لكلّ مشروعٍ ملفُّه، وشاشةُ البداية تعرضها كلَّها.
// كلُّ خطوةٍ هنا بأحداث مؤشّرٍ حقيقيّة.
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

async function drawRect(page) {
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.locator('[data-tool="shape"]').click();
  await page.waitForTimeout(300);
  await page.mouse.move(ab.x + ab.width * 0.3, ab.y + ab.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(ab.x + ab.width * 0.7, ab.y + ab.height * 0.6, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
}

async function goHome(page) {
  await page.locator('[data-testid="go-home-btn"]').click();
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await bootBlank(page, BASE_URL, 'ig-reel');

  // ١. المشروع الأوّل: مستطيلان.
  await drawRect(page);
  await drawRect(page);
  await page.waitForTimeout(1000);
  const first = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), AUTOSAVE_KEY);
  assert(first.projectId && first.artboards[0].doc.elements.length === 2, `المشروع الأوّل محفوظٌ بمعرّفه وعنصرَيه (${first.projectId})`);

  // ٢. مشروعٌ ثانٍ من شاشة البداية — لا يكتب فوق الأوّل.
  await goHome(page);
  await page.locator('[data-testid="format-row-ig"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  await drawRect(page);
  await page.waitForTimeout(1000);
  const second = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), AUTOSAVE_KEY);
  assert(second.projectId && second.projectId !== first.projectId, 'المشروعُ الجديد بمعرّفٍ جديد');
  const firstStill = await page.evaluate((id) => JSON.parse(localStorage.getItem(`mazij.project.${id}`)), first.projectId);
  assert(firstStill && firstStill.artboards[0].doc.elements.length === 2, 'والمشروعُ الأوّل باقٍ كما هو بعنصرَيه');

  // ٣. شاشةُ البداية تعرض الأوّل في «مشاريعك»، ونقرةٌ تفتحه.
  await goHome(page);
  const card = page.locator(`[data-testid="project-${first.projectId}"]`);
  assert((await card.count()) === 1, 'المشروعُ الأوّل يظهر في «مشاريعك»');
  assert((await page.locator(`[data-testid="project-${second.projectId}"]`).count()) === 0, 'والمفتوحُ الآن لا يتكرّر في القائمة');
  await card.click();
  await page.waitForSelector('[data-testid="artboard"]');
  await page.waitForTimeout(400);
  const shapes = await page.locator('[data-el-id]').count();
  assert(shapes === 2, `يُفتح المشروعُ الأوّل بعنصرَيه (${shapes})`);
  const size = await page.locator('[data-testid="artboard"]').evaluate((e) => `${e.dataset.docW}x${e.dataset.docH}`);
  assert(size === '1080x1920', `وبمقاسه (${size})`);

  // ٤. إعادةُ التحميل تفتح آخرَ مشروعٍ فُتح.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="resume-project"]');
  const n = await page.locator('[data-testid="resume-project"]').evaluate((e) => Number(e.dataset.elementCount));
  assert(n === 2, `بعد إعادة التحميل: «كمّل» على المشروع الأوّل (${n} عناصر)`);

  assert(errors.length === 0, `لا أخطاءَ في الصفحة (${errors.join(' | ')})`);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    for (const f of failures) console.error(' -', f);
    process.exit(1);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
