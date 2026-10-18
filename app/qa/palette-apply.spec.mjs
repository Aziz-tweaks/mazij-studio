#!/usr/bin/env node
// Covers roadmap item #5: an explicit "apply palette to every element" action.
// Decision under test (documented in docs/CONTROLS.md): switching the active
// palette alone still only re-colors elements that are *tracking* it (color/fill
// === null) — an element the user manually recolored keeps precedence and does NOT
// drift when the palette changes. The new "تطبيق اللوحة على كل عنصر" button is the
// explicit override: it force-resets every text/shape color back to null (so it
// re-tracks the current palette), including manually recolored ones, as one single
// undo step.
//
// Run: node qa/palette-apply.spec.mjs   (dev server must be running on :1420)
import { chromium } from 'playwright';
import { bootDemo } from './helpers/boot.mjs';

const BASE_URL = 'http://localhost:1420';
let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}

// PALETTES[2]: { bg:'#0F3D3E', fg:'#F1FAEE', ac:'#FFB703' }
// PALETTES[3]: { bg:'#FFFFFF', fg:'#111111', ac:'#0EA5E9' }
const WHITE = 'rgb(255, 255, 255)';
const PAL2_FG = 'rgb(241, 250, 238)';
const PAL3_FG = 'rgb(17, 17, 17)';
const PAL3_AC = 'rgb(14, 165, 233)';

async function textColor(page, id) {
  return page.locator(`[data-el-id="${id}"]`).evaluate((el) => getComputedStyle(el).color);
}
async function shapeFill(page, id) {
  return page.locator(`[data-el-id="${id}"] > div`).first().evaluate((el) => getComputedStyle(el).backgroundColor);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  await bootDemo(page, BASE_URL);

  // --- Manually recolor 'head' (text) and 'badge' (shape), away from whatever the
  // current palette would otherwise give them, via the real per-element color swatches.
  await page.locator('[data-el-id="head"]').click();
  await page.waitForTimeout(100);
  await page.locator('button[title="#FFFFFF"]').click();
  await page.waitForTimeout(80);
  assert((await textColor(page, 'head')) === WHITE, 'setup: head text was manually recolored to an explicit white');

  // badge-label text sits on top of the badge shape at the same point — Alt+click is
  // the app's own "reach the element under the current selection" interaction.
  await page.locator('[data-el-id="badge-label"]').click();
  await page.waitForTimeout(80);
  await page.keyboard.down('Alt');
  await page.locator('[data-el-id="badge-label"]').click();
  await page.keyboard.up('Alt');
  await page.waitForTimeout(100);
  await page.locator('button[title="#FFFFFF"]').click();
  await page.waitForTimeout(80);
  assert((await shapeFill(page, 'badge')) === WHITE, 'setup: badge shape was manually recolored to an explicit white (away from its ac-token accent color)');

  // --- Switching the active palette alone must NOT touch the manual overrides, but
  // must still re-color anything still tracking the palette (e.g. 'discount' text).
  await page.getByRole('button', { name: 'المكتبة' }).click();
  await page.waitForTimeout(100);
  await page.getByRole('button', { name: 'الألوان' }).click();
  await page.waitForTimeout(100);
  await page.locator('[data-testid="palette-2"]').click();
  await page.waitForTimeout(100);

  assert((await textColor(page, 'head')) === WHITE, 'precedence: switching the palette alone leaves a manually-recolored text element untouched');
  assert((await shapeFill(page, 'badge')) === WHITE, 'precedence: switching the palette alone leaves a manually-recolored shape untouched');
  assert((await textColor(page, 'discount')) === PAL2_FG, 'precedence: an untouched text element still tracks the newly-selected palette (fg)');
  assert((await shapeFill(page, 'logo')) === 'rgb(255, 183, 3)', 'precedence: an untouched shape still tracks the newly-selected palette (ac)');

  // --- Switch palette again (index 3) so the override-vs-track contrast is sharp,
  // then force the explicit "apply to every element" action.
  await page.locator('[data-testid="palette-3"]').click();
  await page.waitForTimeout(100);
  assert((await textColor(page, 'head')) === WHITE, 'precedence (2nd switch): manual text override still holds after a second palette switch');
  assert((await shapeFill(page, 'badge')) === WHITE, 'precedence (2nd switch): manual shape override still holds after a second palette switch');

  await page.locator('[data-testid="apply-palette-all"]').click();
  await page.waitForTimeout(100);

  assert((await textColor(page, 'head')) === PAL3_FG, 'apply-all: the manually-recolored text element is force-reset to the active palette (fg)');
  assert((await shapeFill(page, 'badge')) === PAL3_AC, 'apply-all: the manually-recolored shape is force-reset to the active palette (ac)');
  assert((await textColor(page, 'discount')) === PAL3_FG, 'apply-all: an already-tracking text element stays correct after apply-all too');

  // --- One undo step must restore BOTH overridden elements together, proving the
  // whole-document re-color was committed as a single history entry, not two.
  await page.getByTitle('تراجع', { exact: true }).click();
  await page.waitForTimeout(100);

  assert((await textColor(page, 'head')) === WHITE, 'undo: a single undo restores the text element\'s manual override');
  assert((await shapeFill(page, 'badge')) === WHITE, 'undo: the SAME single undo also restores the shape\'s manual override (one combined step, not two)');

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (pageErrors.length) {
    console.log('Console/page errors observed during the run:');
    pageErrors.forEach((e) => console.log(' -', e));
  }
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
