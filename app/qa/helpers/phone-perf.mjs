// قياسُ سلاسة واجهة الجوال: أزمنةُ الإطارات أثناء فتح لوح، وسحب منزلق، والتشغيل.
// node qa/helpers/phone-perf.mjs <url>
import { webkit, devices } from 'playwright';

const [url = 'http://localhost:1461'] = process.argv.slice(2);
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], locale: 'ar' });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const startFrames = () =>
  page.evaluate(() => {
    window.__f = [];
    let last = performance.now();
    const loop = (t) => {
      window.__f.push(t - last);
      last = t;
      if (window.__f.length < 400 && !window.__stop) requestAnimationFrame(loop);
    };
    window.__stop = false;
    requestAnimationFrame(loop);
  });
const stopFrames = async (label) => {
  const f = await page.evaluate(() => {
    window.__stop = true;
    return window.__f.slice(2);
  });
  const s = [...f].sort((a, b) => a - b);
  const p = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]?.toFixed(1);
  const janky = f.filter((x) => x > 25).length;
  console.log(`${label}: frames=${f.length} median=${p(0.5)}ms p95=${p(0.95)}ms max=${p(1)}ms janky(>25ms)=${janky}`);
};

await page.locator('[data-testid="starter-demo-poster"]').tap();
await page.waitForTimeout(600);

await startFrames();
await page.locator('[data-testid="m-font"]').tap();
await page.waitForTimeout(700);
await stopFrames('فتح لوح الخط');
await page.locator('section[data-open="true"] [data-testid$="-close"]').tap();
await page.waitForTimeout(500);

await page.locator('[data-testid="m-opacity"]').tap();
await page.waitForTimeout(600);
const box = await page.locator('[data-testid="opacity-slider"]').boundingBox();
await startFrames();
await page.evaluate(
  async ({ x, y, w }) => {
    const el = document.querySelector('[data-testid="opacity-slider"]');
    const ev = (type, cx) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: cx, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true }));
    ev('pointerdown', x + w * 0.1);
    for (let i = 0; i <= 40; i++) {
      ev('pointermove', x + w * (0.1 + (0.8 * i) / 40));
      await new Promise((r) => requestAnimationFrame(r));
    }
    ev('pointerup', x + w * 0.9);
  },
  { x: box.x, y: box.y + box.height / 2, w: box.width },
);
await stopFrames('سحب منزلق الشفافية');
const hist = await page.locator('[data-testid="undo-btn"]').getAttribute('data-history-past');
console.log('خطوات التراجع بعد السحب (المتوقَّع زيادة واحدة):', hist);

await browser.close();
