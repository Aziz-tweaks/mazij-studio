#!/usr/bin/env node
// يُصيِّر مرجعَ هدفٍ من `reference.html` إلى `target.png` بمتصفّحٍ لا علاقة له بمزيج.
//
// شرطُ نزاهة الحلقة كلّها: المرجع لا يمرّ بمزيج إطلاقًا. لو صُنع به لصار السؤال
// «أيُطابق مزيجٌ نفسَه»، وجوابُه نعم دائمًا ولا يكشف شيئًا.
//
// `deviceScaleFactor: 1` صريحٌ لا افتراضيّ: المرجعُ عقدٌ بالبكسل، فلو صُيِّر على
// شاشةٍ مضاعَفة لصار ٢١٦٠ ونجح/سقط بندُ المقاس لسببٍ لا علاقة له بالتطبيق.
//
// التشغيل: node qa/replication/render-target.mjs t01-sidra
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('usage: node qa/replication/render-target.mjs <target-id>');
    process.exit(2);
  }
  const dir = path.join(__dirname, 'targets', id);
  const specPath = path.join(dir, 'spec.json');
  if (!fs.existsSync(specPath)) {
    console.error(`لا مواصفة عند ${specPath}`);
    process.exit(2);
  }
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const { w, h } = spec.canvas;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`file://${path.join(dir, 'reference.html')}`, { waitUntil: 'networkidle' });
  // الخطوط الوِب تصل بعد `networkidle` أحيانًا، وصورةٌ مرجعيّة بخطٍّ احتياطيّ
  // تُفسد كل جولةٍ تالية بصمت.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  const out = path.join(dir, 'target.png');
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
  await browser.close();

  console.log(`✓ ${id} → ${out} (${w}×${h})`);
}

main().catch((e) => {
  console.error('render-target crashed:', e);
  process.exit(1);
});
