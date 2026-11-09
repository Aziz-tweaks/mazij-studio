#!/usr/bin/env node
// مولّدُ معايناتِ أنماط الحركة.
//
// كلُّ نمطٍ في `public/motion-styles/<id>/` قالبٌ مكتوبٌ شفرةً في هذا المستودع،
// يرسم على `<canvas>` من الزمن وحده بعشوائيّةٍ ببذرةٍ ثابتة. فمعاينتُه ليست
// صورةً مستوردةً من مكانٍ آخر، بل **إطارٌ من قالبه هو**. وهذا السكربتُ يُعيد
// إنتاجها، فمِلكيّتُها مُثبَتةٌ بالتشغيل لا بالدعوى.
//
//   node scripts/make-motion-previews.mjs            # كلّ الأنماط
//   node scripts/make-motion-previews.mjs neon-glow  # نمطٌ بعينه
//
// ⚠️ يُلتقَط الإطارُ عند `PREVIEW_T` من مدّة النمط، لا عند الصفر: أوّلُ الزمن
//    مشهدٌ فارغٌ في أكثر القوالب، فمعاينةٌ منه تُرِي المصمّمَ سوادًا.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STYLES_DIR = join(ROOT, 'public', 'motion-styles');

/** مقاسُ المعاينة في شاشة البداية: ٩:١٦ مصغَّرًا. */
const W = 168, H = 300;
/** نسبةٌ من مدّة النمط. ٠٫٥٥ لأنّ أكثرَ القوالب يكتمل مشهدُها بعد المنتصف. */
const PREVIEW_T = 0.55;
/** يُرسَم بمقاسٍ أكبر ثمّ يُصغَّر، فالحوافُّ لا تتسنّن. */
const SCALE = 4;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

/** خادمٌ ساكنٌ على `public/`: القوالبُ تطلب `../fonts.css` والخطوطَ معه،
 *  و`file://` يمنع تحميلَ الخطوط فتخرج المعاينةُ بخطٍّ بديل. */
function serve(dir) {
  const server = createServer(async (req, res) => {
    const path = join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!path.startsWith(dir) || !existsSync(path)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(await readFile(path));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const only = process.argv[2];

const server = await serve(join(ROOT, 'public'));
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: W * SCALE, height: H * SCALE },
  deviceScaleFactor: 1,
});

const meta = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'motionStyles.json'), 'utf8'));
const durOf = (id) => meta.find((m) => m.id === id)?.dur ?? 6;

const ids = (await readdir(STYLES_DIR, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && e.name !== 'fonts')
  .map((e) => e.name)
  .filter((id) => !only || id === only)
  .sort();

if (ids.length === 0) {
  console.error(only ? `لا نمطَ باسم "${only}"` : 'لا أنماطَ في public/motion-styles');
  process.exitCode = 1;
}

for (const id of ids) {
  const url =
    `http://127.0.0.1:${port}/motion-styles/${id}/template.html` +
    `?render&w=${W * SCALE}&h=${H * SCALE}&dur=${durOf(id)}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // القالبُ يكشف `renderFrame(t)` ويرسم من الزمن وحده، فالإطارُ حتميّ.
  const t = durOf(id) * PREVIEW_T;
  const drew = await page.evaluate((time) => {
    if (typeof window.renderFrame !== 'function') return false;
    window.renderFrame(time);
    return true;
  }, t);
  if (!drew) {
    console.error(`${id}: القالبُ لا يكشف renderFrame — تُخطّى`);
    process.exitCode = 1;
    continue;
  }

  const png = await page.locator('canvas').screenshot({ type: 'png' });
  // التصغيرُ إلى مقاس المعاينة وترميزُ JPEG يتمّان في المتصفّح نفسِه،
  // فلا يحتاج السكربتُ تبعيّةَ صورٍ خارج playwright.
  const jpeg = await page.evaluate(
    async ({ b64, w, h }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.86).split(',')[1];
    },
    { b64: png.toString('base64'), w: W, h: H }
  );

  const out = join(STYLES_DIR, id, 'preview.jpg');
  await writeFile(out, Buffer.from(jpeg, 'base64'));
  console.log(`${id}  ←  t=${t.toFixed(2)}s`);
}

await browser.close();
server.close();
