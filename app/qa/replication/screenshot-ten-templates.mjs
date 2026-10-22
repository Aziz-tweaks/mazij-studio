#!/usr/bin/env node
// سكربتُ معاينةٍ لمرّةٍ واحدة — ليس جزءًا من حلقة QA — يفتح كلّ قالبٍ من العشرة
// الجديدة من شاشة البداية الحقيقية (نفس النقرة التي يؤدّيها مصمّمٌ حقيقي) ويأخذ
// صورة شاشة لمنطقة اللوح نفسها، كي تُرى العشرة بالعين قبل الحكم عليها.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE_URL = process.env.QA_URL || 'http://localhost:1434';
const OUT_DIR = '/tmp/mazij-ten-templates';
fs.mkdirSync(OUT_DIR, { recursive: true });

const IDS = [
  'offer-split',
  'quote-spotlight',
  'hiring-grid',
  'event-ticket',
  'occasion-card',
  'product-card',
  'stat-infographic',
  'menu-list',
  'certificate',
  'event-ad',
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.message}`));

  for (const id of IDS) {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.localStorage.removeItem('mazij.autosave.v1'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="start-screen"]');
    await page.locator(`[data-testid="starter-${id}"]`).click();
    await page.waitForSelector('[data-testid="artboard"]');
    await page.waitForTimeout(300);
    const el = page.locator('[data-testid="artboard"]');
    await el.screenshot({ path: `${OUT_DIR}/${id}.png` });
    console.log(`captured ${id}`);
  }

  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
