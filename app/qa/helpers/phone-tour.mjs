// جولةُ لقطاتٍ على كلّ شاشةٍ ولوحٍ في واجهة الجوال — بمقاس آيفون ولمسٍ على WebKit.
// node qa/helpers/phone-tour.mjs <url> <outDir>
import { webkit, devices } from 'playwright';
import fs from 'node:fs';

const [url = 'http://localhost:1461', out = '/tmp/phone-tour'] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], locale: 'ar' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
let n = 0;
const shot = async (name) => {
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` });
};
const tap = async (sel) => {
  const l = page.locator(sel).first();
  await l.scrollIntoViewIfNeeded().catch(() => undefined);
  await l.tap();
};
const tryTap = async (sel) => page.locator(sel).first().tap({ timeout: 2000 }).catch(() => undefined);
const closeSheets = async () => {
  for (const l of await page.locator('section[data-open="true"] [data-testid$="-close"]').all()) await l.tap().catch(() => undefined);
  await page.waitForTimeout(400);
};

await shot('البداية');
await page.locator('[data-testid="start-screen"] .m-scroll').evaluate((e) => e.scrollTo(0, 700));
await shot('البداية-القوالب');
await page.locator('[data-testid="start-screen"] .m-scroll').evaluate((e) => e.scrollTo(0, 0));

// تصميمٌ ساكن من قالب.
await tap('[data-testid="starter-demo-poster"]');
await tryTap('[data-testid="m-done"]');
await shot('المحرر');
await tap('[data-testid="m-layers"]');
await shot('لوح-الطبقات');
await tap('[data-testid^="layer-row-"] button');
await closeSheets();
await shot('عنصر-محدد');
const sel = await page.evaluate(() => document.querySelector('[data-testid="m-font"]') ? 'text' : 'other');
if (sel === 'text') {
  for (const [id, name] of [
    ['m-font', 'لوح-الخط'],
    ['m-color', 'لوح-اللون'],
    ['m-size', 'لوح-الحجم'],
  ]) {
    await tap(`[data-testid="${id}"]`);
    await shot(name);
    await closeSheets();
  }
}
for (const [id, name] of [
  ['m-opacity', 'لوح-الشفافية'],
  ['m-arrange', 'لوح-الترتيب'],
  ['m-edit', 'لوح-كل-الخيارات'],
]) {
  await tap(`[data-testid="${id}"]`);
  await shot(name);
  await closeSheets();
}
await tap('[data-testid="m-done"]');
for (const [id, name] of [
  ['m-tool-text', 'لوح-النصوص'],
  ['m-tool-shape', 'لوح-الأشكال'],
  ['m-tool-bg', 'لوح-الخلفية'],
  ['m-tool-ai', 'لوح-مزو'],
]) {
  await tap(`[data-testid="${id}"]`);
  await shot(name);
  await closeSheets();
}
await tap('[data-testid="export-btn"]');
await shot('التصدير');
await closeSheets();

// فيديو: ريل فارغ.
await tap('[data-testid="go-home-btn"]');
await tap('[data-testid="format-row-ig-reel"]');
await shot('ريل-فارغ');
await tap('[data-testid="m-tool-text"]');
await tap('[data-text-preset="heading"]');
await tap('[data-testid="m-done"]');
await tap('[data-testid="m-tool-fx"]');
await shot('لوح-التأثيرات');
await tap('[data-testid="fx-card-cinema"]');
await shot('مؤثر-محدد');
await tap('[data-testid="m-fx-amount"]');
await shot('لوح-قوة-المؤثر');
await closeSheets();
await tap('[data-testid="m-layers"]');
await shot('الخط-الزمني');
await closeSheets();
await tap('[data-testid="m-done"]');
await tap('[data-testid="m-tool-audio"]');
await shot('لوح-الصوت');
await closeSheets();
await browser.close();
console.log('ok', n, errors.length ? 'ERRORS: ' + errors.join(' | ') : '');
