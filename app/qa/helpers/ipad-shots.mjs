// لقطاتُ الآيباد: البداية والمحرّر، أفقيًّا وعموديًّا، بمحرّك WebKit ولمس.
// node qa/helpers/ipad-shots.mjs <url> <outDir>
import { webkit, devices } from 'playwright';
import fs from 'node:fs';

const [url = 'http://localhost:1461', out = '/tmp/ipad-shots'] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await webkit.launch();
for (const [name, dev] of [
  ['أفقي', devices['iPad Pro 11 landscape']],
  ['عمودي', devices['iPad Pro 11']],
  ['ميني-عمودي', devices['iPad Mini']],
]) {
  const ctx = await browser.newContext({ ...dev, locale: 'ar' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}-1-البداية.png` });
  await page.locator('[data-testid="starter-demo-poster"]').first().tap();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}-2-المحرر.png` });
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  console.log(name, dev.viewport, 'scrollWidth', sw, errors.length ? errors : '');
  await ctx.close();
}
await browser.close();
