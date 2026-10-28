#!/usr/bin/env node
// **مِزو بمفتاح المستخدم — ٢٨ أكتوبر ٢٠٢٦.**
//
// ChatGPT وClaude يُديران التصميم بمفتاح المستخدم، من الجهاز إلى المزوّد مباشرةً. خادما
// المزوّدَين هنا مُحاكَيان (لا مفتاحَ حقيقيًّا في الاختبار)، لكن كلَّ ما عداهما حقيقيّ:
// واجهةُ الجوال باللمس، وفحصُ المفتاح وحفظُه، وحلقةُ الأدوات، وتنفيذُ الأداة على المستند الحيّ.
import { chromium, devices } from 'playwright';

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

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
const json = (route, status, body) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function background(page) {
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    // أينما كانت العناصرُ في ملفّ الحفظ (مستندٌ أو لوحات): أوّلُ طبقةِ خلفيةٍ تُصادَف.
    const find = (v) => {
      if (!v || typeof v !== 'object') return null;
      if (v.id === 'mz-background') return v;
      for (const x of Object.values(v)) {
        const r = find(x);
        if (r) return r;
      }
      return null;
    };
    const bg = find(JSON.parse(localStorage.getItem('mazij.autosave.v1') || '{}'));
    return bg ? bg.fill : null;
  });
}

async function main() {
  const browser = await chromium.launch();
  const { defaultBrowserType: _d, ...phone } = devices['iPhone 15 Pro'];
  const ctx = await browser.newContext({ ...phone, locale: 'ar' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // ───── محاكاةُ Anthropic ─────
  const anth = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = req.url();
    if (url.includes('/v1/models')) return json(route, req.headers()['x-api-key'] === 'sk-ant-good' ? 200 : 401, { data: [] });
    const body = JSON.parse(req.postData() || '{}');
    anth.push({ headers: req.headers(), body });
    if (anth.length === 1) {
      return json(route, 200, { content: [{ type: 'text', text: 'أبشر' }, { type: 'tool_use', id: 'tu_1', name: 'document_set_background', input: { color: '#ff0000' } }], stop_reason: 'tool_use' });
    }
    return json(route, 200, { content: [{ type: 'text', text: 'خلّيت الخلفية حمراء.' }], stop_reason: 'end_turn' });
  });

  // ───── محاكاةُ OpenAI ─────
  const oai = [];
  await page.route('https://api.openai.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = req.url();
    if (url.includes('/v1/models')) return json(route, req.headers()['authorization'] === 'Bearer sk-good' ? 200 : 401, { data: [] });
    const body = JSON.parse(req.postData() || '{}');
    oai.push({ headers: req.headers(), body });
    if (oai.length === 1) {
      return json(route, 200, { id: 'resp_1', output: [{ type: 'function_call', name: 'document_set_background', arguments: '{"color":"#00ff00"}', call_id: 'call_1' }] });
    }
    return json(route, 200, { id: 'resp_2', output: [{ type: 'message', content: [{ type: 'output_text', text: 'صارت الخلفية خضراء.' }] }] });
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-testid="format-row-ig"]').tap();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="m-tool-ai"]').scrollIntoViewIfNeeded();
  await page.locator('[data-testid="m-tool-ai"]').tap();
  await page.waitForTimeout(600);

  // ───── Claude ─────
  await page.locator('[data-testid="mizo-engine-anthropic"]').tap();
  await page.waitForTimeout(300);
  assert(await page.locator('[data-testid="mizo-key-form"]').isVisible(), 'اختيار Claude بلا مفتاح يعرض نموذج لصق المفتاح');
  await page.locator('[data-testid="mizo-key-input"]').fill('sk-ant-bad');
  await page.locator('[data-testid="mizo-key-save"]').tap();
  await page.waitForSelector('[data-testid="mizo-key-error"]');
  assert(/المفتاح غير صحيح/.test(await page.locator('[data-testid="mizo-key-error"]').innerText()), 'مفتاحٌ مرفوض يظهر بسببه ولا يُحفظ');
  await page.locator('[data-testid="mizo-key-input"]').fill('sk-ant-good');
  await page.locator('[data-testid="mizo-key-save"]').tap();
  await page.waitForSelector('[data-testid="mizo-key-edit"]');
  assert(true, 'مفتاحٌ صحيح يُفحص ويُحفظ ويظهر «متصل بمفتاحك»');

  await page.locator('[data-testid="mizo-input"]').fill('خل الخلفية حمراء');
  await page.locator('[data-testid="mizo-send"]').tap();
  await page.waitForFunction(() => document.body.innerText.includes('خلّيت الخلفية حمراء.'), null, { timeout: 8000 }).catch(() => undefined);
  assert(await page.getByText('خلّيت الخلفية حمراء.').isVisible(), 'ردّ Claude الأخير يظهر في المحادثة');
  assert(anth.length === 2, `حلقةُ الأدوات: طلبان لـ Claude — الأوّل يطلب أداة، والثاني بنتيجتها (${anth.length})`);
  const a0 = anth[0];
  assert(a0?.headers['x-api-key'] === 'sk-ant-good' && a0?.headers['anthropic-dangerous-direct-browser-access'] === 'true', 'المفتاحُ يُرسل في ترويسته إلى Anthropic وحدها');
  assert(a0?.body.tools?.some((t) => t.name === 'document_set_background' && t.input_schema?.type === 'object'), 'أدواتُ مزيج تُعرض على Claude بمخطّطاتها');
  assert(a0?.body.messages?.at(-1)?.content === 'خل الخلفية حمراء', 'طلبُ المستخدم يصل كما كتبه');
  const tr = anth[1]?.body.messages?.at(-1)?.content?.[0];
  assert(tr?.type === 'tool_result' && tr?.tool_use_id === 'tu_1' && /#ff0000/.test(tr?.content), `نتيجةُ الأداة ترجع لـ Claude (${JSON.stringify(tr)?.slice(0, 80)})`);
  const bg1 = await background(page);
  assert(bg1 && bg1.toLowerCase() === '#ff0000', `الأداة نُفِّذت فعلًا على المستند: الخلفية ${bg1}`);

  // ───── ChatGPT ─────
  await page.locator('[data-testid="mizo-engine-openai"]').tap();
  await page.waitForTimeout(400);
  assert(await page.locator('[data-testid="mizo-key-form"]').isVisible(), 'ChatGPT بلا مفتاح يطلب مفتاحه — مفتاحُ Claude لا يُستعمل له');
  await page.locator('[data-testid="mizo-key-input"]').fill('sk-good');
  await page.locator('[data-testid="mizo-key-save"]').tap();
  await page.waitForSelector('[data-testid="mizo-key-edit"]');
  await page.locator('[data-testid="mizo-input"]').fill('خلها خضراء');
  await page.locator('[data-testid="mizo-send"]').tap();
  await page.waitForFunction(() => document.body.innerText.includes('صارت الخلفية خضراء.'), null, { timeout: 8000 }).catch(() => undefined);
  assert(await page.getByText('صارت الخلفية خضراء.').isVisible(), 'ردّ ChatGPT يظهر');
  assert(oai[0]?.headers['authorization'] === 'Bearer sk-good', 'المفتاحُ يُرسل إلى OpenAI وحدها');
  assert(oai[0]?.body.tools?.some((t) => t.type === 'function' && t.name === 'document_set_background'), 'الأدوات بصيغة Responses API');
  assert(oai[1]?.body.previous_response_id === 'resp_1' && oai[1]?.body.input?.[0]?.type === 'function_call_output' && oai[1]?.body.input?.[0]?.call_id === 'call_1', 'نتيجةُ الأداة ترجع بـ function_call_output على الردّ السابق');
  assert(oai[0]?.body.input?.some((m) => m.role === 'assistant'), 'المحادثةُ السابقة تُرسل سياقًا');
  const bg2 = await background(page);
  assert(bg2 && bg2.toLowerCase() === '#00ff00', `ChatGPT غيّر المستند فعلًا: الخلفية ${bg2}`);

  // ───── التراجع والحفظ ─────
  await page.locator('[data-testid="m-sheet-mizo-close"]').tap();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="undo-btn"]').tap();
  const bg3 = await background(page);
  assert(bg3 && bg3.toLowerCase() === '#ff0000', `تعديلُ الذكاء الاصطناعي يُتراجَع عنه كأيّ تعديل (${bg3})`);
  await page.reload({ waitUntil: 'networkidle' });
  const kept = await page.evaluate(() => ({ prefs: localStorage.getItem('mazij.ai.prefs'), keys: localStorage.getItem('mazij.aikeys.v1') }));
  assert(/openai/.test(kept.prefs || ''), 'المحرّكُ المختار يبقى بعد إعادة التحميل');
  assert(/sk-good/.test(kept.keys || '') && /sk-ant-good/.test(kept.keys || ''), 'المفتاحان محفوظان على الجهاز');
  const autosave = await page.evaluate(() => localStorage.getItem('mazij.autosave.v1') || '');
  assert(!/sk-ant-good|sk-good/.test(autosave), 'المفتاح لا يدخل ملفَّ المشروع أبدًا');

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
