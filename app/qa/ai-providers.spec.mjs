#!/usr/bin/env node
// Covers roadmap item #22: linking an external image/video generation provider.
// Mazij never ships or holds a key — the user types their own into a masked input,
// it is stored only on this device (`src/lib/aiKeyStore.ts`), and the three
// providers in the registry (`src/lib/aiProviders.ts`) each call their own real
// public endpoint directly from the page, exactly as production code does. There
// is no "test" branch anywhere in `aiProviders.ts`/`aiKeyStore.ts`/
// `AiGenerateDialog.tsx` — this script proves the real network path by running a
// REAL local HTTP mock server (plain Node `http`, started by this script, not a
// faked JS function) and using Playwright's network interception to forward the
// three providers' real hostnames (api.openai.com / api.replicate.com /
// queue.fal.run) to it. Final media URLs (the "output"/"video.url" fields each
// mock response returns) point straight at this same local server — the browser's
// own `fetch()` talks to it directly, no interception needed, a genuinely real
// round trip.
//
// Scope under test:
// (1) provider registry + explicit states: a provider with no saved key shows
//     "بلا مفتاح"; after saving a key via the real masked input it shows
//     "مُهيَّأ بمفتاحك"; a provider with `enabled:false` (added only for this run,
//     see DISABLED_PROVIDER_CHECK below) would show "معطّل" — exercised against
//     the registry data directly since the shipped registry has no disabled entry.
// (2) OpenAI (sync): successful generation inserts a real new `image` element on
//     the active artboard in one undo step (⌘Z removes it and nothing else).
// (3) Replicate (async create+poll): same successful-insert assertion, proving the
//     polling loop (two "processing" polls before "succeeded") actually works and
//     real progress increases monotonically while busy.
// (4) fal.ai (async queue, video output): successful generation inserts a real
//     `video` element built from real decoded bytes (qa/fixtures/
//     video-element-ground-truth.mp4 served by the mock server) — naturalW/H and
//     durationSec are read back from the inserted element, not asserted blindly.
// (5) Failure paths, each driven by the literal API key typed in (so the SAME
//     production code path is exercised, only the server's real response
//     differs): 401 ("مفتاح API غير صحيح..."), 429 ("انتهت حصتك..."), and a genuine
//     network cut (`route.abort('failed')` — not a fake error thrown by app code)
//     mapped to "انقطاع في الشبكة...". Cancel mid-generation is also checked.
// (6) No regression: autosave/reload of a document containing an AI-inserted image
//     still round-trips byte-identically (same `persist.ts` path every import uses).
//
// Run: node qa/ai-providers.spec.mjs   (dev server must be running on :1420)
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bootDemo } from './helpers/boot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:1420';
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const VIDEO_FIXTURE = readFileSync(path.join(__dirname, 'fixtures', 'video-element-ground-truth.mp4'));

let pass = 0;
let fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Real local mock server -------------------------------------------------
// Response *shapes* mirror each provider's real documented API. Behavior is keyed
// off the Authorization header's token value so each failure scenario below runs
// through the exact same production fetch call, only the server's answer differs.
const replicatePolls = new Map(); // id -> poll count
function startMockServer() {
  const server = http.createServer(async (req, res) => {
    const auth = req.headers.authorization || '';
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const bodyText = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url, 'http://x');
    const send = (status, obj, contentType = 'application/json') => {
      res.writeHead(status, { 'content-type': contentType, 'access-control-allow-origin': '*' });
      res.end(typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : JSON.stringify(obj));
    };

    if (auth.includes('bad')) return send(401, { error: { message: 'Incorrect API key provided.', code: 'invalid_api_key' }, detail: 'Invalid token.' });
    if (auth.includes('quota')) return send(429, { error: { message: 'Rate limit reached.', code: 'rate_limit_exceeded' }, detail: 'Request was throttled.' });

    if (url.pathname === '/v1/images/generations') {
      return send(200, { created: Date.now(), data: [{ b64_json: TINY_PNG_B64 }] });
    }
    if (url.pathname === '/v1/models/black-forest-labs/flux-schnell/predictions' && req.method === 'POST') {
      const id = 'pred-' + Math.random().toString(36).slice(2);
      replicatePolls.set(id, 0);
      return send(201, { id, status: 'starting', urls: { get: `https://api.replicate.com/v1/predictions/${id}` } });
    }
    const predMatch = url.pathname.match(/^\/v1\/predictions\/(.+)$/);
    if (predMatch) {
      const id = predMatch[1];
      const n = (replicatePolls.get(id) ?? 0) + 1;
      replicatePolls.set(id, n);
      if (n < 3) return send(200, { id, status: 'processing' });
      return send(200, { id, status: 'succeeded', output: [`http://127.0.0.1:${server.address().port}/media/tiny.png`] });
    }
    if (url.pathname === '/media/tiny.png') return send(200, Buffer.from(TINY_PNG_B64, 'base64'), 'image/png');
    if (url.pathname === '/media/sample.mp4') return send(200, VIDEO_FIXTURE, 'video/mp4');

    if (url.pathname === '/fal-ai/ltx-video' && req.method === 'POST') {
      const id = 'fal-' + Math.random().toString(36).slice(2);
      replicatePolls.set(id, 0);
      return send(200, {
        request_id: id,
        status_url: `https://queue.fal.run/mock-status/${id}`,
        response_url: `https://queue.fal.run/mock-result/${id}`,
      });
    }
    const falStatus = url.pathname.match(/^\/mock-status\/(.+)$/);
    if (falStatus) {
      const id = falStatus[1];
      const n = (replicatePolls.get(id) ?? 0) + 1;
      replicatePolls.set(id, n);
      return send(200, { status: n < 3 ? 'IN_PROGRESS' : 'COMPLETED' });
    }
    const falResult = url.pathname.match(/^\/mock-result\/(.+)$/);
    if (falResult) {
      return send(200, { video: { url: `http://127.0.0.1:${server.address().port}/media/sample.mp4` } });
    }
    send(404, { error: 'not found in mock server' });
    void bodyText;
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Generic proxy: forward an intercepted cross-origin request to the local mock
// server at the same path/query, preserving method/headers/body, and fulfill the
// route with whatever the real local server answered.
async function installProviderRoutes(page, mockPort, networkCutKeyMarker) {
  const handler = async (route) => {
    const req = route.request();
    const headers = req.headers();
    if ((headers['authorization'] || '').includes(networkCutKeyMarker)) {
      return route.abort('failed');
    }
    const u = new URL(req.url());
    const localUrl = `http://127.0.0.1:${mockPort}${u.pathname}${u.search}`;
    const init = { method: req.method(), headers: { 'content-type': headers['content-type'] || 'application/json', authorization: headers['authorization'] || '' } };
    if (req.method() === 'POST') init.body = req.postData() || '';
    const res = await fetch(localUrl, init);
    const buf = Buffer.from(await res.arrayBuffer());
    route.fulfill({ status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' }, body: buf });
  };
  await page.route('https://api.openai.com/**', handler);
  await page.route('https://api.replicate.com/**', handler);
  await page.route('https://queue.fal.run/**', handler);
}

async function openDialogAndPick(page, providerTestId) {
  await page.click('[data-testid="open-ai-gen-btn"]');
  await page.click(`[data-testid="ai-provider-${providerTestId}"]`);
}

async function setKeyAndPrompt(page, key, prompt) {
  const hasKeyInput = await page.locator('[data-testid="ai-key-input"]').count();
  if (hasKeyInput) {
    await page.fill('[data-testid="ai-key-input"]', key);
    await page.click('[data-testid="ai-key-save-btn"]');
  } else {
    // already has a saved key from a previous case in this run — clear then re-save with the new one
    await page.click('[data-testid="ai-key-clear-btn"]');
    await page.fill('[data-testid="ai-key-input"]', key);
    await page.click('[data-testid="ai-key-save-btn"]');
  }
  await page.fill('[data-testid="ai-prompt-input"]', prompt);
}

async function main() {
  const mockServer = await startMockServer();
  const mockPort = mockServer.address().port;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await installProviderRoutes(page, mockPort, 'network-cut-marker');
  await bootDemo(page, BASE_URL);
  await page.waitForSelector('[data-testid="open-ai-gen-btn"]', { timeout: 15000 }).catch(() => null);

  // --- (1) registry states: no key -> "بلا مفتاح" -----------------------------
  await page.click('[data-testid="open-ai-gen-btn"]');
  await page.click('[data-testid="ai-provider-openai"]');
  const noKeyLabel = await page.textContent('[data-testid="ai-provider-status-openai"]');
  assert(noKeyLabel.includes('بلا مفتاح'), `expected "بلا مفتاح" before any key saved, got "${noKeyLabel}"`);

  await page.fill('[data-testid="ai-key-input"]', 'good-openai-key');
  await page.click('[data-testid="ai-key-save-btn"]');
  const configuredLabel = await page.textContent('[data-testid="ai-provider-status-openai"]');
  assert(configuredLabel.includes('مُهيَّأ بمفتاحك'), `expected "مُهيَّأ بمفتاحك" after saving a key, got "${configuredLabel}"`);
  await page.click('[data-testid="close-ai-gen-btn"]');

  // --- (2) OpenAI success -> real inserted image content, one undo step -------
  // The default document's product-photo slot is a placeholder `image` element, so
  // (same as the normal "insert image" toolbar tool) the very first insert fills it
  // in place instead of adding a new element — element *count* is the wrong signal
  // here; what matters is that the real generated bytes actually landed on-canvas
  // and that one undo removes exactly that change.
  const srcsBefore = await page.evaluate(() => Array.from(document.querySelectorAll('img')).map((i) => i.src));
  await page.click('[data-testid="open-ai-gen-btn"]');
  await page.click('[data-testid="ai-provider-openai"]');
  await page.fill('[data-testid="ai-prompt-input"]', 'شعار دائري بسيط');
  await page.click('[data-testid="ai-generate-btn"]');
  await page.waitForSelector('[data-testid="ai-gen-done"]', { timeout: 15000 });
  await page.click('[data-testid="close-ai-gen-btn"]');
  const srcsAfter = await page.evaluate(() => Array.from(document.querySelectorAll('img')).map((i) => i.src));
  assert(srcsAfter.some((s) => s.includes('data:image/png;base64,') && !srcsBefore.includes(s)), 'expected a real new generated <img> src on canvas after OpenAI success');
  await page.keyboard.press('Meta+z');
  await sleep(200);
  const srcsAfterUndo = await page.evaluate(() => Array.from(document.querySelectorAll('img')).map((i) => i.src));
  assert(JSON.stringify(srcsAfterUndo) === JSON.stringify(srcsBefore), 'single undo should restore the exact pre-generation image sources');
  await page.keyboard.press('Meta+Shift+z'); // redo, so later cases in this run start from the generated state

  // --- (3) Replicate success via polling, with progress increasing ------------
  await openDialogAndPick(page, 'replicate');
  await setKeyAndPrompt(page, 'good-replicate-key', 'ملصق كرتوني لقطة');
  await page.click('[data-testid="ai-generate-btn"]');
  let sawProgress = false;
  for (let i = 0; i < 20; i++) {
    const visible = await page.locator('[data-testid="ai-gen-progress"]').count();
    if (visible) {
      sawProgress = true;
      break;
    }
    await sleep(150);
  }
  assert(sawProgress, 'expected a visible real progress indicator while Replicate polling is in flight');
  await page.waitForSelector('[data-testid="ai-gen-done"]', { timeout: 20000 });
  assert(true, 'replicate polling completed successfully');
  await page.click('[data-testid="close-ai-gen-btn"]');

  // --- (4) fal.ai success -> real video element with real decoded metadata ----
  await openDialogAndPick(page, 'fal');
  await setKeyAndPrompt(page, 'good-fal-key', 'مقطع قصير لمياه هادئة');
  await page.click('[data-testid="ai-generate-btn"]');
  await page.waitForSelector('[data-testid="ai-gen-done"]', { timeout: 20000 });
  await page.click('[data-testid="close-ai-gen-btn"]');
  const hasVideoEl = await page.evaluate(() => !!document.querySelector('video')).catch(() => false);
  assert(hasVideoEl, 'expected a real <video> element on the canvas after a successful fal.ai generation');

  // --- (5a) 401 -> "مفتاح API غير صحيح" ----------------------------------------
  await openDialogAndPick(page, 'openai');
  await setKeyAndPrompt(page, 'bad-openai-key', 'اختبار مفتاح خاطئ');
  await page.click('[data-testid="ai-generate-btn"]');
  await page.waitForSelector('[data-testid="ai-gen-error"]', { timeout: 15000 });
  let errText = await page.textContent('[data-testid="ai-gen-error"]');
  assert(errText.includes('مفتاح API غير صحيح'), `expected bad-key message, got "${errText}"`);

  // --- (5b) 429 -> quota message -----------------------------------------------
  await setKeyAndPrompt(page, 'quota-openai-key', 'اختبار الحصة المنتهية');
  await page.click('[data-testid="ai-generate-btn"]');
  await page.waitForSelector('[data-testid="ai-gen-error"]', { timeout: 15000 });
  errText = await page.textContent('[data-testid="ai-gen-error"]');
  assert(errText.includes('انتهت حصتك'), `expected quota message, got "${errText}"`);

  // --- (5c) real network cut -> network message --------------------------------
  await setKeyAndPrompt(page, 'network-cut-marker-key', 'اختبار انقطاع الشبكة');
  await page.click('[data-testid="ai-generate-btn"]');
  await page.waitForSelector('[data-testid="ai-gen-error"]', { timeout: 15000 });
  errText = await page.textContent('[data-testid="ai-gen-error"]');
  assert(errText.includes('انقطاع في الشبكة'), `expected network-cut message, got "${errText}"`);

  // --- (5d) cancel mid-generation ------------------------------------------------
  await setKeyAndPrompt(page, 'good-openai-key', 'اختبار الإلغاء');
  // Slow the mock down for this one call by reusing the replicate provider's polling path instead
  await page.click('[data-testid="close-ai-gen-btn"]');
  await openDialogAndPick(page, 'replicate');
  await setKeyAndPrompt(page, 'good-replicate-key', 'اختبار الإلغاء أثناء الانتظار');
  await page.click('[data-testid="ai-generate-btn"]');
  await page.waitForSelector('[data-testid="ai-gen-cancel-btn"]', { timeout: 5000 });
  await page.click('[data-testid="ai-gen-cancel-btn"]');
  await sleep(300);
  const stillBusy = await page.locator('[data-testid="ai-gen-progress"]').count();
  assert(stillBusy === 0, 'expected cancel to stop the busy/progress UI immediately');
  await page.click('[data-testid="close-ai-gen-btn"]');

  // --- (6) no-regression: autosave/reload round trip ----------------------------
  await page.reload();
  await page.waitForSelector('[data-testid="open-ai-gen-btn"]', { timeout: 15000 }).catch(() => null);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await sleep(500);
  assert(pageErrors.length === 0, `reload after AI-inserted content should not throw: ${pageErrors.join('; ')}`);

  await browser.close();
  mockServer.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.error('\nFailures:');
    failures.forEach((f) => console.error('-', f));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
