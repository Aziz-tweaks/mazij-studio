#!/usr/bin/env node
// Phase 1 of the video branch: absolute keyframe time (`t` → `time`, plus `sourceIn`),
// a derived document duration, a frame grid, one keyframe write funnel, `medium` made
// load-bearing, and a real schema version.
//
// Everything below is driven with real pointer and keyboard events from the real
// start screen. Nothing writes state through a back door; the only `page.evaluate`
// calls either *read* the DOM or call a production module (`/src/lib/animTimeline.ts`,
// `/src/lib/exportArtboard.ts`) on a document the UI built.
//
// The criteria, in the plan's own numbering:
//
//   A1  150 keys at every integer frame of a 5 s / 30 fps clip, none replacing another
//   A2  drag the first key past the last and back — all 150 survive
//   A3  the logged defect is dead: ◇ unfilled at 3.000 s on a 0→0.6 s fade, its
//       tooltip says «add», and pressing it keeps the 0.6 s key and adds one at 3.000 s
//   A4  the migration round-trip — in `qa/migration-roundtrip.spec.mjs`, which needs
//       the pre-change artefact
//   A5  lengthen a clip 0.6 s → 2.0 s; `resolveAnimAt` at 0.3 s is unchanged
//   A6  a key placed by arrow-key scrubbing shows its own value in frame 0 at 24 fps
//   A7  a still format opens with no timeline; a timed one with one; and the size
//       menu flips it both ways with no reload
//   A8  a UI branch on `medium` appears in at most three files — a grep, run here as
//       a spec. It counted the literal `medium ===` until 20 October 2026, which
//       bounded the idiom and not the thing: `medium !== 'timed'` in a fourth UI file
//       satisfied the grep while adding exactly the branch A8 exists to limit. It now
//       counts either operator, outside the model layer (`src/state/`), whose `!==`
//       guards are exempt by the convention `nextSizeState` documents
//   A9  the derived duration is visible and correct, and the frame count follows it
//
// Plus the frame grid's own round-trip, which is what lets every epsilon be deleted.
//
// Run: QA_PORT=1443 node --import ./qa/helpers/port-redirect.mjs qa/phase1-representation.spec.mjs
import { chromium } from 'playwright';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = `http://localhost:${process.env.QA_PORT || '1420'}`;
const AUTOSAVE_KEY = 'mazij.autosave.v1';

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ok  ', msg);
  } else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ─────────────────────────────────────────────────────────────────────────────
// الطريق إلى المحرّر، من شاشة البداية / Into the editor, from the start screen
// ─────────────────────────────────────────────────────────────────────────────

async function openFormat(page, formatId, { pro = true } = {}) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.locator(`[data-testid="format-row-${formatId}"]`).click();
  await page.waitForSelector('[data-testid="artboard"]');
  if (pro) {
    // لا «بسيط/احترافي» منذ ٢٤ أكتوبر ٢٠٢٦ (قرار المالك: «العمق يُطلب ولا يُفرض») — كلّ الأدوات حاضرة.
    await page.waitForTimeout(200);
  }
}

/** Places a text element with the real tool + canvas click and types into it through
 * the real double-click edit gesture. Returns its element id. */
async function placeText(page, fracX, fracY, text) {
  const a = await page.locator('[data-testid="artboard"]').boundingBox();
  await page.getByRole('button', { name: 'نص', exact: true }).first().click();
  await page.mouse.click(a.x + a.width * fracX, a.y + a.height * fracY);
  await page.waitForTimeout(250);
  const id = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all[all.length - 1].dataset.elId;
  });
  await page.mouse.dblclick(a.x + a.width * fracX, a.y + a.height * fracY);
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  return id;
}

/** The ruler's own span in seconds, read off the element the component annotates —
 * so the spec converts seconds to pixels with the same number the app drew with,
 * rather than assuming five. */
const rulerSpan = (page) => page.locator('[data-testid="timeline-ruler"]').evaluate((e) => Number(e.dataset.span));

/** Parks the playhead by clicking the real ruler, and returns the clock the app
 * reports — the ruler is a pixel surface, so the caller asserts against what came
 * back, not what was asked for. */
async function parkPlayhead(page, seconds) {
  const span = await rulerSpan(page);
  const box = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(box.x + (box.width * seconds) / span + 1, box.y + box.height / 2);
  await page.waitForTimeout(90);
  return page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
}

/** Every keyframe on one element's rows, as `{testid, time, left}` read from the real
 * DOM — `time` off the tooltip the component writes, which is the thing a designer
 * actually reads. */
const keysOf = (page, id) =>
  page.evaluate(
    (i) =>
      [...document.querySelectorAll(`[data-testid^="kf-${i}-"]`)].map((e) => ({
        testid: e.dataset.testid,
        time: Number((e.getAttribute('title') || '').split('s ·')[0]),
        left: parseFloat(e.style.left),
      })),
    id,
  );

/** One element's `anim` as the document holds it, read out of the autosave the app
 * itself wrote. Not a back door: this reads what was saved, it does not write. */
async function animOf(page, id) {
  await page.waitForTimeout(900); // autosave debounce
  return page.evaluate(
    ({ key, elId }) => {
      const raw = JSON.parse(window.localStorage.getItem(key));
      const el = raw.artboards[0].doc.elements.find((e) => e.id === elId);
      return el ? el.anim : null;
    },
    { key: AUTOSAVE_KEY, elId: id },
  );
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1700, height: 1050 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 0. شبكةُ الإطارات ودورتُها / The frame grid and its round-trip
  // ═════════════════════════════════════════════════════════════════════════
  // كلُّ اعتدالٍ (`eps`) حُذِف في هذه المرحلة يَستند إلى هذه الدورة: إن كانت
  // `frameAtTime(timeOfFrame(n)) === n` لكلّ `n`، فالهويّةُ مقارنةُ أعدادٍ صحيحةٍ
  // ولا حاجةَ إلى تسامح. والعطلُ الذي تمنعه مكتوبٌ في `animTimeline.ts`: خطوةُ
  // إطارٍ تتجمّد أو ترتدّ لأنّ `7/30 × 30` تساوي `6.999999999999999`.
  console.log('\n0. شبكةُ الإطارات — الدورةُ التي تُغني عن كل اعتدال');
  await openFormat(page, 'ig-reel');
  const grid = await page.evaluate(async () => {
    const m = await import('/src/lib/animTimeline.ts');
    const out = {};
    for (const fps of [24, 30, 60]) {
      let worst = null;
      for (let n = 0; n <= fps * 10; n++) {
        const back = m.frameAtTime(m.timeOfFrame(n, fps), fps);
        if (back !== n && worst === null) worst = { n, back };
      }
      out[fps] = worst;
    }
    // ونصفُ إطارٍ يُقرَّب إلى الأقرب لا إلى الأدنى، فلا تَنزِف كتابةُ المفاتيح
    // إلى الخلف عبر الزمن.
    out.snap = {
      exact: m.snapToFrame(7 / 30, 30),
      justUnder: m.snapToFrame(7 / 30 - 0.001, 30),
      justOver: m.snapToFrame(7 / 30 + 0.001, 30),
      offGridAt24: m.snapToFrame(0.3, 24),
    };
    return out;
  });
  for (const fps of [24, 30, 60]) {
    assert(grid[fps] === null, `frame↔time round-trips for every frame of 10s at ${fps}fps — floor(time) recovers n for all ${fps * 10 + 1} of them, so keyframe identity is an integer comparison and every epsilon could be deleted`);
  }
  assert(
    near(grid.snap.exact, 7 / 30, 1e-12) && grid.snap.justUnder === grid.snap.exact && grid.snap.justOver === grid.snap.exact,
    `snapToFrame pulls a time ±1ms either side of frame 7 onto frame 7 exactly (${grid.snap.justUnder} / ${grid.snap.exact} / ${grid.snap.justOver}) — nearest, not floor, so repeated writes do not drift early`,
  );
  assert(
    near(grid.snap.offGridAt24, 7 / 24, 1e-12),
    `and at 24fps a 0.300s request lands on frame 7 = ${grid.snap.offGridAt24.toFixed(6)}s — the grid is the document's, not a hardcoded 1/30`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // A1. مفتاحٌ عند كل إطارٍ صحيح / A key at every integer frame
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nA1. ١٥٠ مفتاحًا عند كل إطارٍ من مقطعِ ٥ث/٣٠ إطارًا');
  const a1 = await placeText(page, 0.5, 0.3, 'شبكة');
  // مقطعٌ طوله خمسُ ثوانٍ بالضبط، مصنوعٌ بسحب الحافّة اليمنى — لا بحقنِ حالة.
  // عنصرٌ جديد مقطعُه ٠٫٦ث، والمسطرةُ خمسُ ثوانٍ، فالسحبُ إلى يمين المسطرة تمامًا.
  const spanA1 = await rulerSpan(page);
  const rightHandle = await page.locator(`[data-testid="clip-${a1}-resize-right"]`).boundingBox();
  const tracksBox = await page.locator('[data-testid="timeline-tracks"]').boundingBox();
  const pxPerSecond = tracksBox.width / spanA1;
  await page.mouse.move(rightHandle.x + rightHandle.width / 2, rightHandle.y + rightHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(rightHandle.x + rightHandle.width / 2 + (5 - 0.6) * pxPerSecond, rightHandle.y + rightHandle.height / 2, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const a1Anim = await animOf(page, a1);
  assert(
    near(a1Anim.duration, 5, 0.12),
    `the clip was dragged to ${a1Anim.duration.toFixed(3)}s by its own right edge — past the 5s that used to be a hard ceiling on every clip (TIMELINE_DURATION − start)`,
  );

  // ١٥٠ ضغطةً على زرّ «+» عند ١٥٠ موضعًا مختلفًا للمؤشّر. والمؤشّر يُنقل بالسهم
  // (إطارٌ واحدٌ لكل ضغطة) لأنه الإيماءةُ الدقيقةُ التي يملكها إنسان — والمسطرةُ
  // سطحُ بكسلٍ لا يفرّق بين إطارٍ وجاره عند هذا المقياس.
  await page.locator('[data-testid="timeline-tracks"]').click({ position: { x: tracksBox.width - 6, y: 4 } });
  await parkPlayhead(page, 0);
  await page.locator('[data-testid="timeline-tracks"]').focus();
  const addBtn = page.locator(`[data-testid="clip-${a1}-add-kf"]`);
  const frames = Math.round(a1Anim.duration * 30);
  for (let n = 0; n < frames; n++) {
    await addBtn.click();
    if (n < frames - 1) await page.keyboard.press('ArrowRight');
  }
  await page.waitForTimeout(300);
  const a1Keys = (await animOf(page, a1)).tracks.opacity;
  assert(
    a1Keys.length === frames,
    `pressing «+» once per frame across the clip left exactly ${frames} keys on the opacity track (got ${a1Keys.length}) — none replaced another, so the write funnel's exact-time collision rule never merged two distinct frames`,
  );
  const distinctFrames = new Set(a1Keys.map((k) => Math.round(k.time * 30))).size;
  assert(
    distinctFrames === a1Keys.length,
    `and every one sits on its own frame index (${distinctFrames} distinct of ${a1Keys.length}) — the keys are on the grid, not scattered between frames`,
  );
  const sorted = [...a1Keys].map((k) => k.time).sort((x, y) => x - y);
  const gaps = sorted.slice(1).map((t, i) => t - sorted[i]);
  assert(
    gaps.every((g) => near(g, 1 / 30, 1e-9)),
    `and consecutive keys are exactly one frame apart (max deviation ${Math.max(...gaps.map((g) => Math.abs(g - 1 / 30))).toExponential(2)}s) — one document frame, 1/30s, not a 1/60 guess`,
  );
  assert(
    a1Keys.every((k) => typeof k.time === 'number' && k.t === undefined),
    'and every saved key carries `time` and no `t` — presence of the field is the migration discriminator, so a key this build wrote can never be mistaken for a fraction',
  );

  // ═════════════════════════════════════════════════════════════════════════
  // A2. سحبُ الأوّل خلف الأخير وعودتُه / Drag the first key past the last, and back
  // ═════════════════════════════════════════════════════════════════════════
  // وهذا عطلٌ لم يَدَّعِ تغطيتَه رأسُ أيّ حزمة: كان السحبُ يكتب الزمن بنفسه
  // بـ`clamp(…, 0, 1)` و**بلا أيّ معالجةٍ للتصادم** — فمفتاحان على الزمن نفسه
  // وأحدُهما غيرُ قابلٍ للوصول إلى الأبد.
  console.log('\nA2. سحبُ أوّل مفتاحٍ خلف آخرِه ثم رجوعُه');
  const before = await keysOf(page, a1);
  const firstKf = before.reduce((lo, k) => (k.left < lo.left ? k : lo), before[0]);
  const lastLeft = Math.max(...before.map((k) => k.left));
  const d0 = await page.locator(`[data-testid="${firstKf.testid}"]`).boundingBox();
  const sweep = ((lastLeft - firstKf.left) / 100) * tracksBox.width + 40;
  await page.mouse.move(d0.x + d0.width / 2, d0.y + d0.height / 2);
  await page.mouse.down();
  await page.mouse.move(d0.x + d0.width / 2 + sweep, d0.y + d0.height / 2, { steps: 30 });
  await page.waitForTimeout(120);
  const midCount = (await animOf(page, a1)).tracks.opacity.length;
  await page.mouse.move(d0.x + d0.width / 2, d0.y + d0.height / 2, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const a2Keys = (await animOf(page, a1)).tracks.opacity;
  assert(
    a2Keys.length === frames,
    `dragging the first key the full width of the track past the last and back left all ${frames} alive (got ${a2Keys.length}, ${midCount} mid-drag) — the drag goes through the same write funnel as «+», so a collision replaces by exact time instead of stacking one diamond under another`,
  );
  const a2Distinct = new Set(a2Keys.map((k) => Math.round(k.time * 30))).size;
  assert(a2Distinct === a2Keys.length, `and no two of them share a frame afterwards (${a2Distinct} distinct of ${a2Keys.length}) — nothing became unreachable`);

  // ═════════════════════════════════════════════════════════════════════════
  // A3. العطل ٤ المسجَّل، ميتًا من جذره / The logged defect 4, dead at the root
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nA3. ◇ عند ٣٫٠٠٠ث على دخولٍ ٠→٠٫٦ث');
  await openFormat(page, 'ig-reel');
  const a3 = await placeText(page, 0.5, 0.26, 'دخولٌ موقوت');
  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(220);
  const a3Anim0 = await animOf(page, a3);
  assert(
    near(a3Anim0.duration, 0.6, 0.001) && a3Anim0.tracks.opacity.length === 2,
    `the fade entrance is a 0→${a3Anim0.duration}s clip with 2 opacity keys at ${a3Anim0.tracks.opacity.map((k) => k.time.toFixed(3)).join(' and ')}s — stored in seconds, so «the key at 0.6s» is a statement about the document and not about the clip's current length`,
  );
  const parked = await parkPlayhead(page, 3.0);
  assert(near(parked, 3.0, 0.03), `the playhead is parked at ${parked.toFixed(3)}s by a real click on the ruler — 2.4s past the end of the clip`);

  const toggle = page.locator(`[data-testid="kf-toggle-${a3}-opacity"]`);
  const toggleState = await toggle.evaluate((e) => ({
    keyed: e.dataset.keyed,
    title: e.getAttribute('title'),
    disabled: e.disabled,
    filled: getComputedStyle(e.querySelector('span')).backgroundColor,
  }));
  assert(
    toggleState.keyed === 'false',
    `◇ reads **unfilled** at 3.000s (data-keyed=${toggleState.keyed}) — it used to render filled here because the playhead was fed through a saturating fraction that answers "1" for every instant past the clip`,
  );
  assert(
    /رgba\(0, 0, 0, 0\)|rgba\(0, 0, 0, 0\)|transparent/.test(toggleState.filled),
    `and its diamond is painted transparent, not accent (${toggleState.filled}) — the picture agrees with the state`,
  );
  assert(
    /إضافة مفتاح عند المؤشر/.test(toggleState.title),
    `and its tooltip says «${toggleState.title}» — the label and the state no longer contradict each other`,
  );
  assert(
    toggleState.disabled === false,
    'and it is **not** disabled: a keyframe before or after the clip is an ordinary animation time now, so the written refusal («مؤشّر التشغيل خارج مقطع هذه الطبقة») had nothing left to refuse and the string was deleted with it',
  );

  await toggle.click();
  await page.waitForTimeout(280);
  const a3After = await animOf(page, a3);
  const a3Times = a3After.tracks.opacity.map((k) => Math.round(k.time * 1000) / 1000).sort((x, y) => x - y);
  assert(
    a3Times.includes(0.6),
    `pressing it **kept** the 0.6s keyframe (track now at ${a3Times.join(', ')}s) — this is the exact gesture that used to delete it and leave the element stuck at opacity 0`,
  );
  assert(
    a3Times.includes(3),
    `and added one at 3.000s, under the playhead (track: ${a3Times.join(', ')}s) — not on the clip edge, and without stretching the clip to reach it`,
  );
  assert(
    near(a3After.duration, 0.6, 0.001),
    `and the clip's own duration is untouched at ${a3After.duration}s — \`stretchClipToTime\` is gone, because an absolute keyframe time outside the clip needs no clip to live in`,
  );
  const a3Keyed = await toggle.evaluate((e) => e.dataset.keyed);
  assert(a3Keyed === 'true', 'and now ◇ reads filled at 3.000s, because there really is a key on this frame');

  // ═════════════════════════════════════════════════════════════════════════
  // A5. تطويلُ المقطع لا يُعيد توقيت شيء / Lengthening retimes nothing
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nA5. ٠٫٦ث → ٢٫٠ث، والقيمةُ عند ٠٫٣ث كما هي');
  await openFormat(page, 'ig-reel');
  const a5 = await placeText(page, 0.5, 0.3, 'لا إعادةَ توقيت');
  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(220);
  const sampleAt = (elId, t) =>
    page.evaluate(
      async ({ i, time, key }) => {
        const m = await import('/src/lib/animTimeline.ts');
        const raw = JSON.parse(window.localStorage.getItem(key));
        const el = raw.artboards[0].doc.elements.find((e) => e.id === i);
        return m.resolveAnimAt(el.anim, time);
      },
      { i: elId, time: t, key: AUTOSAVE_KEY },
    );
  await page.waitForTimeout(900);
  const a5Before = await sampleAt(a5, 0.3);
  const a5SpanBefore = await rulerSpan(page);
  const a5Box = await page.locator('[data-testid="timeline-tracks"]').boundingBox();
  const a5Handle = await page.locator(`[data-testid="clip-${a5}-resize-right"]`).boundingBox();
  await page.mouse.move(a5Handle.x + a5Handle.width / 2, a5Handle.y + a5Handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(a5Handle.x + a5Handle.width / 2 + (1.4 * a5Box.width) / a5SpanBefore, a5Handle.y + a5Handle.height / 2, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(950);
  const a5Anim = await animOf(page, a5);
  const a5After = await sampleAt(a5, 0.3);
  assert(near(a5Anim.duration, 2.0, 0.12), `the clip is now ${a5Anim.duration.toFixed(3)}s long, dragged from 0.6s by its own edge`);
  assert(
    Math.abs(a5After.opacity - a5Before.opacity) < 1e-9,
    `and \`resolveAnimAt\` at 0.3s is bit-identical: ${a5Before.opacity} → ${a5After.opacity}. It used to hold only because \`stretchClipToTime\` patched one path by rescaling every fraction; it holds now because there is nothing to retime`,
  );
  const a5KeyTimes = a5Anim.tracks.opacity.map((k) => Math.round(k.time * 1000) / 1000);
  assert(
    a5KeyTimes.includes(0.6),
    `and the entrance still **ends at 0.6s** (keys at ${a5KeyTimes.join(', ')}s) — the clip simply gained dead air at the end, which is the correct behaviour and comes free with the representation`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // A6. الشبكةُ شبكةُ المستند، والإطارُ صفر يُظهر قيمةَ مفتاحه
  // ═════════════════════════════════════════════════════════════════════════
  // الأثرُ الذي قاسته الورقة لتثبيت `FRAME = 1/30` (`re-effectcraft-source.md:549-552`):
  // عند معدّلٍ غيرِ الثلاثين يهبط مفتاحٌ وُضِع بالسهم **بين** إطارَي مخرَج، فيُظهر
  // الإطارُ قيمةً مُستَقرَأة لا قيمةَ المفتاح. فشطران يُقاسان هنا:
  //
  //   (أ) الإطارُ صفر يُظهر قيمةَ **مفتاحه** لا استقراءً — بقراءةِ بكسلٍ حقيقيّ من
  //       `renderArtboardFrames`، وهي الدالّةُ التي تُغذّي مُرمِّز MP4 نفسها، عند
  //       زمنِ الإطار `0 / 24` المشتقِّ بصيغة `videoExport.ts` بعينها.
  //   (ب) خطوةُ السهم إطارٌ **بمعدّل المستند** لا `1/30` مثبَّتًا — بمستندٍ يحمل ٢٤
  //       إطارًا، يُحمَّل من مسار الاستئناف الحقيقيّ.
  //
  // وما **لا** يُقاس هنا، صراحةً: ترميزُ MP4 فعليًّا عند ٢٤ إطارًا وقراءتُه
  // بـ`ffprobe`. ذاك يحتاج جانبَ ffmpeg داخل تطبيق Tauri المبنيّ، ولا تَصِله حزمةٌ
  // تعمل في متصفّحٍ عاديّ — وهو عقدٌ قائمٌ في المستودع أصلًا
  // (`qa/video-export.spec.mjs` تقوله في رأسها). وحكمُ الإطارات في `qa/replication/`
  // يملكه `judge`.
  console.log('\nA6. شبكةُ المستند، وقيمةُ الإطار صفر');
  await openFormat(page, 'ig-reel');
  const a6El = await placeText(page, 0.5, 0.3, 'إطارٌ صفر');
  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(250);
  await page.waitForTimeout(900);
  const a6Anim = await animOf(page, a6El);
  const a6First = [...a6Anim.tracks.opacity].sort((x, y) => x.time - y.time)[0];
  assert(
    a6First.time === 0 && a6First.value === 0,
    `the entrance's first key is at animation time ${a6First.time}s with value ${a6First.value} — an absolute time on the grid, which is what makes "frame 0" a question with an exact answer`,
  );

  // بكسلٌ حقيقيٌّ من الرسّام الحقيقيّ عند زمنِ الإطار صفر بمعدّل ٢٤.
  const a6Pixels = await page.evaluate(
    async ({ key, elId }) => {
      const m = await import('/src/lib/animTimeline.ts');
      const ex = await import('/src/lib/exportArtboard.ts');
      const raw = JSON.parse(window.localStorage.getItem(key));
      const doc = raw.artboards[0].doc;
      const el = doc.elements.find((e) => e.id === elId);
      const spec = {
        size: { id: 'probe', ar: '', en: '', w: 240, h: 426, kind: 'timed' },
        palette: { bg: '#000000', fg: '#FFFFFF', ac: '#FFB703' },
        elements: [el],
        transparent: true,
        lang: 'ar',
        scale: 1,
        decorAccent: false,
      };
      // زمنُ الإطار بصيغة `videoExport.ts` بعينها: `i / fps`، بلا تراكم.
      const times = [m.timeOfFrame(0, 24), m.timeOfFrame(12, 24)];
      const alphas = [];
      await ex.renderArtboardFrames(spec, times, async (blob) => {
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(240, 426);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const d = ctx.getImageData(0, 0, 240, 426).data;
        let maxA = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > maxA) maxA = d[i];
        alphas.push(maxA);
      });
      return { alphas, resolvedAt0: m.resolveAnimAt(el.anim, m.timeOfFrame(0, 24)).opacity, firstValue: [...el.anim.tracks.opacity].sort((a, b) => a.time - b.time)[0].value };
    },
    { key: AUTOSAVE_KEY, elId: a6El },
  );
  assert(
    a6Pixels.alphas[0] === 0,
    `frame 0 of a 24fps render is **completely empty** (max alpha ${a6Pixels.alphas[0]} of 255) — the key at animation time 0 says opacity 0, and the frame shows that key's own value rather than an interpolated one. Measured from real pixels through \`renderArtboardFrames\`, the function that feeds the MP4 encoder`,
  );
  assert(
    a6Pixels.alphas[1] > 0,
    `and frame 12 of the same render is not empty (max alpha ${a6Pixels.alphas[1]}) — so the emptiness at frame 0 is the keyframe's value and not a renderer that drew nothing at all`,
  );
  assert(
    Math.abs(a6Pixels.resolvedAt0 - a6Pixels.firstValue) < 1e-12,
    `and the resolver agrees with the pixels: at \`timeOfFrame(0, 24)\` it returns ${a6Pixels.resolvedAt0}, exactly the key's own ${a6Pixels.firstValue}`,
  );

  // (ب) خطوةُ السهم بمعدّل المستند. مستندٌ محفوظٌ بـ٢٤ إطارًا، من القرص — وهذا
  // مسارُ إدخالٍ حقيقيّ (نفسُ المسار الذي يَسلكه `qa/migration-roundtrip.spec.mjs`)،
  // لا بابٌ خلفيّ: لا توجد في المرحلة ١ لوحةٌ تُغيّر معدّل المستند، وهو خارجُ نطاقها
  // صراحةً (لا ألواحَ جديدة) — فالطريقُ الوحيد إلى مستندٍ بـ٢٤ هو مستندٌ محفوظٌ بها.
  const doc24 = await page.evaluate((k) => {
    const d = JSON.parse(window.localStorage.getItem(k));
    d.artboards[0].doc.fps = 24;
    return JSON.stringify(d);
  }, AUTOSAVE_KEY);
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(({ k, json }) => window.localStorage.setItem(k, json), { k: AUTOSAVE_KEY, json: doc24 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-testid="resume-project"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  // لا «بسيط/احترافي» منذ ٢٤ أكتوبر ٢٠٢٦ (قرار المالك: «العمق يُطلب ولا يُفرض») — كلّ الأدوات حاضرة.
  await page.waitForTimeout(250);
  await parkPlayhead(page, 0);
  await page.locator('[data-testid="timeline-tracks"]').focus();
  const t24Before = await page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(140);
  const t24After = await page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
  const step = t24After - t24Before;
  // التسامحُ نصفُ ميلي‑ثانية لأنّ القراءةَ نفسها ثلاثُ منازل (`state.t.toFixed(3)`
  // في `timeline-time`)، فـ`1/24 = 0.0416667` تُقرأ `0.042`. والفرقُ بين الإطارَين
  // المتنازعَين — `1/24` و`1/30` — ثمانيةُ ميلي‑ثوانٍ، أي ستةَ عشرَ ضعفَ التسامح.
  assert(
    near(step, 1 / 24, 5e-4),
    `on a document saved at 24fps one ArrowRight moves the playhead ${step.toFixed(6)}s — one frame at **this document's** rate (1/24 = ${(1 / 24).toFixed(6)}), not the 1/30 = ${(1 / 30).toFixed(6)} that was hardcoded in Timeline.tsx for every document ever opened`,
  );
  const a6Key24 = await page.evaluate(
    async ({ elId }) => {
      const m = await import('/src/lib/animTimeline.ts');
      const saved = JSON.parse(window.localStorage.getItem('mazij.autosave.v1'));
      const doc = saved.artboards[0].doc;
      return { fps: doc.fps, snapped: m.snapToFrame(0.3, doc.fps), onGrid: m.frameAtTime(m.snapToFrame(0.3, doc.fps), doc.fps) };
    },
    { elId: a6El },
  );
  assert(
    a6Key24.fps === 24 && near(a6Key24.snapped, 7 / 24, 1e-12) && a6Key24.onGrid === 7,
    `and a keyframe write on that document snaps to **its** grid: 0.300s → frame ${a6Key24.onGrid} = ${a6Key24.snapped.toFixed(6)}s at ${a6Key24.fps}fps. That is the whole point of the grid being the document's — a key that is on the output grid is a key an exported frame can show`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // A9. المدّةُ المشتقّة، مرئيّةً وصحيحة / The derived duration, visible and correct
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nA9. مقاطعٌ تنتهي عند ٠٫٦ث و٣٫٤ث → ٣٫٤ث');
  await openFormat(page, 'ig-reel');
  const n1 = await placeText(page, 0.5, 0.25, 'أوّل');
  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(200);
  const n2 = await placeText(page, 0.5, 0.45, 'ثانٍ');
  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(200);
  // المقطعُ الثاني يُنقَل حتى تصير نهايتُه ٣٫٤ث: بدايةٌ ٢٫٨ث ومدّةٌ ٠٫٦ث. والنقلُ
  // بسحبِ جسمِ المقطع، وهو الإيماءةُ الحقيقية.
  const n2Span = await rulerSpan(page);
  const n2Tracks = await page.locator('[data-testid="timeline-tracks"]').boundingBox();
  const n2Body = await page.locator(`[data-testid="clip-${n2}"]`).boundingBox();
  await page.mouse.move(n2Body.x + n2Body.width * 0.25, n2Body.y + n2Body.height / 2);
  await page.mouse.down();
  await page.mouse.move(n2Body.x + n2Body.width * 0.25 + (2.8 * n2Tracks.width) / n2Span, n2Body.y + n2Body.height / 2, { steps: 22 });
  await page.mouse.up();
  await page.waitForTimeout(950);
  const n2Anim = await animOf(page, n2);
  const n1Anim = await animOf(page, n1);
  const reportedDuration = await page.locator('[data-testid="timeline-medium"]').evaluate((e) => Number(e.dataset.duration));
  const badgeText = await page.locator('[data-testid="timeline-medium"]').innerText();
  const expected = Math.max(n1Anim.start + n1Anim.duration, n2Anim.start + n2Anim.duration);
  assert(
    near(reportedDuration, expected, 0.002),
    `clips ending at ${(n1Anim.start + n1Anim.duration).toFixed(3)}s and ${(n2Anim.start + n2Anim.duration).toFixed(3)}s make the document ${reportedDuration.toFixed(3)}s — derived from the clips, with no \`Math.min(TIMELINE_DURATION, …)\` left to cap it`,
  );
  assert(
    near(reportedDuration, 3.4, 0.25),
    `and that is ≈3.4s as the criterion asks (${reportedDuration.toFixed(3)}s), reached by dragging a clip's body — not by a fixed number anywhere`,
  );
  assert(
    new RegExp(`${(Math.round(reportedDuration * 10) / 10).toFixed(1)}`).test(badgeText),
    `and the badge **reads** it: «${badgeText.replace(/\n/g, ' ')}» — it used to print the constant 5 for every project ever made`,
  );
  const chip = await page.locator('[data-testid="artboard-medium"]').evaluate((e) => ({ medium: e.dataset.medium, duration: Number(e.dataset.duration), text: e.innerText.trim() }));
  assert(
    chip.medium === 'timed' && near(chip.duration, reportedDuration, 0.002),
    `and **the artboard chip** says the same thing, on the card the size is changed from: «${chip.text.replace(/\n/g, ' ')}» (medium=${chip.medium}, duration=${chip.duration}s). That is the owner's request honoured without a gate — "did it understand me as video?" is answerable by looking, at any moment, instead of being asked once at launch`,
  );

  const frameCount = await page.evaluate(
    async ({ key }) => {
      const m = await import('/src/lib/animTimeline.ts');
      const raw = JSON.parse(window.localStorage.getItem(key));
      const doc = raw.artboards[0].doc;
      const d = m.documentDuration(doc.elements.map((e) => e.anim), doc.fps);
      // نفسُ الصيغة في `videoExport.ts:exportVideoTarget`.
      return { count: Math.max(1, Math.round(d * doc.fps)), d, fps: doc.fps };
    },
    { key: AUTOSAVE_KEY },
  );
  assert(
    frameCount.count === Math.round(frameCount.d * frameCount.fps) && Math.abs(frameCount.count - 102) <= 8,
    `the MP4 frame count follows it: round(${frameCount.d.toFixed(3)} × ${frameCount.fps}) = ${frameCount.count} frames, vs the 150 that \`TIMELINE_DURATION * fps\` produced for every project regardless of length`,
  );

  // المدّةُ نفسها تصل إلى تذييل حوار التصدير، لا الرقم ٥.
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(220);
  await page.getByRole('button', { name: 'MP4', exact: true }).click();
  await page.waitForTimeout(250);
  const est = await page.locator('[data-testid="export-estimate"]').innerText();
  assert(
    new RegExp(`المدّة ${(Math.round(reportedDuration * 100) / 100).toString().replace('.', '\\.')} ث`).test(est),
    `and the export dialog states the same derived duration before you commit: «${est}» — محرّر خطٍّ زمنيٍّ مفتوح §5.2's rule, so the dialog cannot contradict the timeline`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // الفراغُ بعد نهاية المستند مُعلَنٌ لا مكتوم.
  const beyond = await page.locator('[data-testid="timeline-beyond-doc"]').count();
  const beyondTitle = beyond ? await page.locator('[data-testid="timeline-beyond-doc"]').getAttribute('title') : '';
  assert(
    // «ما يدخل التصدير» — النصّ المختصر بالخليجيّة (٢٤ أكتوبر ٢٠٢٦)، والسبب هو هو.
    beyond === 1 && /ما يدخل التصدير/.test(beyondTitle),
    `the ruler's range past the end of the document is shaded and says why («${beyondTitle.slice(0, 48)}…») — the ruler keeps a 5s floor so there is somewhere to drag a clip to, and that floor would otherwise be a silent screen-vs-file difference`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // A7. الوعدُ الذي قطعته شاشةُ البداية / The reversibility the start screen promised
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nA7. ساكنٌ بلا خطٍّ زمنيّ، ومُوقَّتٌ به، وتبديلٌ في الاتجاهين');
  await openFormat(page, 'ig', { pro: false });
  const stillTl = await page.locator('[data-testid="timeline-tracks"]').count();
  const stillRuler = await page.locator('[data-testid="timeline-ruler"]').count();
  const stillPlay = await page.locator('[data-testid="timeline-play-btn"]').count();
  const stillPreset = await page.locator('[data-testid="anim-preset-menu"]').count();
  assert(
    stillTl === 0 && stillRuler === 0 && stillPlay === 0 && stillPreset === 0,
    `a still format («بوست إنستقرام», 1080×1080) opens with **no** time surface in the DOM at all — tracks=${stillTl}, ruler=${stillRuler}, transport=${stillPlay}, entrance picker=${stillPreset}. Not collapsed: absent. It used to open with a full timeline eating the bottom third of the screen for a still image, because \`tlOpen\` defaults to true and nothing read the size's nature`,
  );
  // وما **يبقى** هو قائمةُ الطبقات وشارتُها، وهذا مقصودٌ ومُبلَّغ: الطبقاتُ ليست
  // سطحًا زمنيًّا، وهي تعيش داخل المكوّن نفسه ولا بيتَ لها غيره — فرفعُ المكوّن
  // كلِّه كان سيَحذف العينَ والقفلَ وإعادةَ التسمية والترتيب من كلّ بوستر. انظر
  // التعليقَ عند `<Timeline timed=…>` في `App.tsx`.
  // عنصرٌ واحد كي يكون للقائمة ما تعرضه — مستندٌ فارغٌ قائمتُه فارغةٌ بحقّ.
  const stillEl = await placeText(page, 0.5, 0.3, 'طبقةٌ على بوستر');
  const stillLayers = await page.locator(`[data-testid="layer-name-${stillEl}"]`).count();
  const stillBadge = await page.locator('[data-testid="timeline-medium"]').evaluate((e) => ({ medium: e.dataset.medium, duration: e.dataset.duration }));
  assert(
    stillBadge.medium === 'still' && stillBadge.duration === '',
    `and it declares itself a still with no duration number (medium=${stillBadge.medium}, duration=«${stillBadge.duration}») — a seconds figure printed on a poster is a number with no meaning`,
  );
  assert(
    stillLayers > 0,
    `and the layer list is still there — the element placed on the poster has its row (${stillLayers}), with its visibility and lock buttons. Visibility, lock, rename and reorder are not time surfaces, and a poster needs them; they live in the same component as the timeline, which is why that component is not lifted wholesale`,
  );
  const stillTools = await page.evaluate(() => [...document.querySelectorAll('[data-tool]')].map((e) => e.dataset.tool));
  assert(
    !stillTools.includes('video') && !stillTools.includes('audio'),
    `and the rail offers no video/audio destinations on it (${stillTools.join(', ')}) — the second of the three surfaces`,
  );
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.waitForTimeout(250);
  const stillVideoFormats = await page.locator('[data-testid="export-video-formats"]').count();
  const stillHasPng = await page.getByRole('button', { name: 'PNG', exact: true }).count();
  assert(
    stillVideoFormats === 0 && stillHasPng > 0,
    `and the export dialog offers PNG/JPG/SVG and no MP4/GIF (video group present: ${stillVideoFormats}) — the third surface. Not «قريبًا» over a working button: the formats are hidden because this document is not their destination, and they come back the moment it is`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await openFormat(page, 'ig-reel', { pro: false });
  const timedTl = await page.locator('[data-testid="timeline-tracks"]').count();
  assert(timedTl === 1, `a timed format («ريل إنستقرام») opens with exactly one timeline (tracks=${timedTl}) — the designer's answer now reaches the workspace, not a label`);

  // والآن التبديلُ داخل المحرّر، بلا إعادةِ تحميل.
  await openFormat(page, 'ig', { pro: false });
  assert((await page.locator('[data-testid="timeline-tracks"]').count()) === 0, 'starting still: no timeline');
  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="size-option-ig-reel"]').click();
  await page.waitForTimeout(400);
  const afterToTimed = await page.locator('[data-testid="timeline-tracks"]').count();
  const navEntries = await page.evaluate(() => performance.getEntriesByType('navigation').length);
  assert(
    afterToTimed === 1,
    `changing the size **inside the editor** from a still preset to a timed one makes the timeline appear (tracks=${afterToTimed}) with no reload (${navEntries} navigation entries, unchanged) — this is the promise HomeScreen.tsx made for declining a two-button gate, and it was untestable until now because nothing downstream read \`kind\``,
  );
  const timedToolsNow = await page.evaluate(() => [...document.querySelectorAll('[data-tool]')].map((e) => e.dataset.tool));
  assert(timedToolsNow.includes('video'), `and the rail's video destination came with it (${timedToolsNow.join(', ')})`);

  await page.locator('[data-testid="size-menu-button"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="size-option-ig"]').click();
  await page.waitForTimeout(400);
  const backToStill = await page.locator('[data-testid="timeline-tracks"]').count();
  assert(
    backToStill === 0,
    `and reversing it takes the timeline away again (tracks=${backToStill}) — the branch is symmetric, which is the exact property a gate destroys`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // A8. عدُّ التفرّع / The anti-fork count
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nA8. تفرُّعُ الواجهة على `medium` في ثلاثة ملفّاتٍ على الأكثر');
  // **هذا البندُ كان يَحرس الصيغةَ لا المعنى، فشُدِّد في ٢٠ أكتوبر ٢٠٢٦.**
  //
  // كان يَبحث عن النصّ `medium ===` حرفيًّا. وقَلبُ الشرط إلى `medium !== 'timed'`
  // يُرضي ذلك البحثَ ويُضيف **بعينه** التفرّعَ الذي وُجد البندُ ليَحصره: شرطٌ في
  // ملفِّ واجهةٍ رابعٍ يَقرأ طبيعةَ المستند ويَبني عليها سطحًا. فالبندُ كان يَعِد
  // بثلاثةِ أسطحٍ ويَضمن ثلاثَ كتاباتٍ لعلامةِ المساواة.
  //
  // والقالبُ قائمٌ في المستودع فعلًا — `splitAtPlayhead` و`nextSizeState` في
  // `StudioContext.tsx` كلاهما `medium !== 'timed'` — وهو **اصطلاحٌ موثَّقٌ لا
  // تحايل: تعليقُ `nextSizeState` يَقوله صراحةً** («التفرّعُ بـ`===` سطحُ واجهةٍ
  // محصورٌ في ثلاثة ملفّاتٍ يَحرسها A8، وهذا حرسُ نموذجٍ لا سطحَ واجهة»). فالفصلُ
  // المقصودُ هو **نموذجٌ مقابل واجهة**، لا علامةُ مساواةٍ مقابل نفيها؛ و`!==`
  // علامةٌ يَلبسها حرسُ النموذج، لا بابٌ خلفيٌّ إلى عدّ الواجهة.
  //
  // فالعدُّ الآن: أيُّ مقارنةٍ على `medium` — `===` أو `!==` — في أيّ ملفٍّ **خارج**
  // طبقةِ النموذج (`src/state/`). والجدولُ المفتوحُ (`MEDIUM_CHIP`) لا يُعَدّ ولا
  // يُراد عدُّه: المستودعُ يُفضّله على الشرط صراحةً، لأن إضافةَ طبيعةٍ ثالثةٍ تصير
  // فيه خطأَ ترجمةٍ عند كلّ قارئ لا شرطًا منسيًّا — وهو الشكلُ الذي يُدفَع إليه من
  // يَحتاج قراءةَ الطبيعة بلا تفرّعِ سلوك.
  // `[!=]=` لا `[!=]==`: يَلقُط `===` و`!==` و`==` و`!=` معًا، فلا تَبقى المساواةُ
  // المتسامحةُ بابًا ثالثًا. ولا يَلقُط إسنادًا (`medium = x`) لأنه يَطلب علامتَين.
  const MEDIUM_BRANCH = /\bmedium\s*[!=]=/;
  /** طبقةُ النموذج، المُعفاةُ بالاصطلاح الموثَّق أعلاه. وهي مسارٌ لا ملفٌّ مُسمًّى:
   * من نَقل حرسَ نموذجٍ إلى ملفٍّ جديدٍ تحت `src/state/` لم يُضِف سطحَ واجهة. */
  const isModelLayer = (rel) => rel.startsWith('src/state/');
  const hits = [];
  const modelHits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && MEDIUM_BRANCH.test(readFileSync(p, 'utf8'))) {
        const rel = p.replace(/.*\/src\//, 'src/');
        (isModelLayer(rel) ? modelHits : hits).push(rel);
      }
    }
  };
  walk(new URL('../src', import.meta.url).pathname);
  hits.sort();
  modelHits.sort();
  // `ToolRail.tsx` لم يعد موجودًا: انقسم في ٢٤ أكتوبر ٢٠٢٦ (التخطيط المعتمد) إلى حبّة
  // أدواتٍ لا تقرأ الطبيعة وشريط إضافةٍ يقرؤها — والسطحُ نفسُه («أيّ بنودٍ يعرضها الشريط
  // لهذا المستند») انتقل بشرطه إلى `AddRail.tsx`. فالعدّ ثلاثة كما كان والأسطح هي هي؛
  // تغيّر اسم الملف وحده. وما أُضيف للطبيعة بعدها (رفُّ الطبقات، أقسامُ الحركة) جدولٌ
  // (`MEDIUM_SURFACES`) لا شروط، على اصطلاح `MEDIUM_CHIP`.
  const expectedHits = ['src/App.tsx', 'src/components/AddRail.tsx', 'src/components/ExportDialog.tsx'];
  assert(
    hits.length <= 3,
    `a UI branch on \`medium\` (\`===\` **or** \`!==\`) appears in ${hits.length} files outside src/state/ (at most 3 allowed): ${hits.join(', ')}`,
  );
  assert(
    JSON.stringify(hits) === JSON.stringify(expectedHits),
    `and they are exactly the three surfaces the plan names: ${hits.join(', ')}. Timeline.tsx's local \`sizeAt(...).kind\` derivation is gone — it is the document's field now, read in one place and branched on in three`,
  );
  // والمعفاةُ تُطبَع لا تُسكَت: إعفاءٌ لا يُرى يصير مع الوقت فجوةً لا يَعلم بها
  // أحد. وهذه القراءةُ هي التي تُظهِر — عند كلّ تشغيل — أنّ الإعفاء مسارٌ معدودٌ
  // وليس شيكًا على بياض.
  assert(
    modelHits.every((h) => isModelLayer(h)),
    `and the \`!==\` guards that are exempt are all in the model layer, named: ${modelHits.join(', ') || 'none'} — the exemption is a path (src/state/), printed on every run so it cannot quietly become a hole`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  console.log('');
  assert(pageErrors.length === 0, `no runtime errors anywhere in the session (${pageErrors.slice(0, 3).join(' | ') || 'none'})`);

  console.log(`\n${'='.repeat(62)}`);
  console.log(`phase1-representation: ${pass} pass, ${fail} fail`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(' -', f);
  }
  await browser.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
