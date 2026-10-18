#!/usr/bin/env node
// Walks the job a motion designer actually sits down to do — «مقطع عمودي ١٠٨٠×١٩٢٠
// لتيك توك، ٥ ثوانٍ: عنوان يدخل بحركة، سطر ثانٍ يظهر بعده، شكل يتحرّك، نهاية ثابتة
// فيها الشعار» — and pins the seven timeline/animation/playback/export defects that
// walk found, each with the measurement that proved it. Everything here is driven
// with real pointer and keyboard events from the start screen; nothing writes state
// through a back door.
//
// What each section locks down, and the number that showed the bug:
//
// 1. حركة الدخول exists for a **user-created** element. The preset chooser lived in
//    PropsTab behind `el.id === 'head'` — an id only the demo poster has — so
//    on a blank project there was no entrance control at all, while the timeline's own
//    hint told the user to go find one in the Design panel.
// 2. Picking a preset changes the **picture**, not just a label. `setAnim` wrote the
//    document-level `anim` field and copied the preset *name* onto `head`; rendering
//    reads `anim.tracks` and nothing else, so the headline's computed transform at
//    t=0.1s stayed `matrix(1,0,0,1,0,108)` (the 'slide' value) after picking 'pop',
//    while the pill lit up as though it had landed.
// 3. A fresh project opens with the playhead at **0**, not 2.2s — 2.2 was a leftover
//    from the demo poster, and on a 5s project it meant every entrance you added was
//    already over before you looked at it.
// 4. The ◇ per-property toggle no longer reports a keyframe that isn't under the
//    playhead, and no longer **deletes** one when pressed there. `keyframeAt` fed the
//    playhead through `localClipTime`, which saturates at 1, so with a 0→0.6s fade and
//    the playhead at 3.000s the toggle rendered filled and pressing it removed the
//    keyframe at 0.6s — the entrance silently destroyed, element stuck at opacity 0.
// 5. «مفتاح عند المؤشّر» lands under the playhead. It used to `clamp` the local time,
//    parking the diamond on the clip edge: measured at 12% of the ruler with the
//    playhead at 44%.
// 6. Play **resumes** from the playhead instead of jumping to zero (parked at 3.000s,
//    play used to report 0.132s on the next sample), and the clock tracks wall time
//    (the old fixed +0.033 per `setInterval(33)` tick measured −1.2%/−1.6% slow).
// 7. The export dialog states المدّة/عدد الملفات/الحجم before you commit, offers
//    «مقاس المشروع فقط» (the four default targets never included the format the
//    project was started in), and locks the 1×/2×/3× multiplier off for video — at the
//    default 2× a project whose card reads 1080 × 1920 produced a 2160 × 3840 file.
//
// Run: node qa/motion-journey.spec.mjs   (dev server must be running on :1420)
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';

const BASE_URL = 'http://localhost:1420';
const AUTOSAVE_KEY = 'mazij.autosave.v1';
const DURATION = 5;

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

function near(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

/** Start screen → a blank vertical video artboard, the way a person does it. */
async function openVerticalVideo(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate((k) => window.localStorage.removeItem(k), AUTOSAVE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="start-screen"]');
  await page.locator('[data-testid="format-row-tt"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  await page.waitForSelector('[data-testid="timeline-time"]');
  await page.waitForTimeout(250);
}

const clockOf = (page) => page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));

/** Parks the playhead at `seconds` by clicking the real ruler, then returns the clock
 * the app actually reports — the ruler is a pixel surface, so the caller asserts
 * against the reported value rather than the requested one. */
async function parkPlayhead(page, seconds) {
  const box = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(box.x + (box.width * seconds) / DURATION + 1, box.y + box.height / 2);
  await page.waitForTimeout(100);
  return clockOf(page);
}

/** Places a text element with the real tool + canvas click, then types into it through
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

/** Selects one layer by clicking its name in the timeline's layer column — the
 * selection the whole inspector hangs off, so every per-element control below is
 * reached the way a designer reaches it — by its stable test id, not by its
 * position in the row.
 *
 * It used to be `button` then `.nth(1)`, documented as "[visibility, name,
 * expand]". The campaign journey then inserted a lock button into the same row,
 * so `.nth(1)` landed on **lock** instead of the name: the layer got locked
 * rather than selected, `selectedIds` stayed empty, and the keyframe toggles —
 * which only render at `selectedIds.length === 1` — never appeared, leaving this
 * spec waiting 30s for an element that could not exist. Position inside a row is
 * not a contract; the id is. */
async function selectLayer(page, id) {
  await page.locator(`[data-testid="layer-name-${id}"]`).click();
  await page.waitForTimeout(150);
}

const renderedOf = (page, id) =>
  page.evaluate((i) => {
    const el = document.querySelector(`[data-el-id="${i}"]`);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { opacity: Number(cs.opacity), transform: cs.transform };
  }, id);

/** Ruler-relative x of every keyframe diamond on one element's rows, in percent —
 * read off the real DOM, which is what the designer is looking at. */
const diamondPercents = (page, id) =>
  page.evaluate(
    (i) => [...document.querySelectorAll(`[data-testid^="kf-${i}-"]`)].map((e) => Math.round(parseFloat(e.style.left) * 100) / 100),
    id,
  );

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1700, height: 1050 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  // ============================================================
  // 1. A new vertical video project starts at zero
  // ============================================================
  console.log('\n1. مشروع عمودي جديد — من أين يبدأ المؤشّر');
  await openVerticalVideo(page);
  const t0 = await clockOf(page);
  assert(t0 === 0, `a fresh 1080×1920 video project opens with the playhead at 0.000s, not mid-entrance (got ${t0.toFixed(3)}s)`);
  const medium = await page.locator('[data-testid="timeline-medium"]').evaluate((e) => ({ medium: e.dataset.medium, duration: e.dataset.duration }));
  assert(medium.medium === 'timed' && medium.duration === '5', `the timeline knows this is a 5s timed project (medium=${medium.medium}, duration=${medium.duration})`);

  // ============================================================
  // 2. The headline gets a real entrance — on a user-created element
  // ============================================================
  console.log('\n2. عنوان يدخل بحركة');
  const head = await placeText(page, 0.5, 0.26, 'تخفيضات نهاية الموسم');
  assert(/^text-/.test(head), `the headline is an ordinary user-created element, not the demo poster's 'head' (id=${head})`);

  assert((await page.locator('[data-testid="anim-preset-menu"]').count()) === 1, 'حركة الدخول is reachable for a user-created layer — the entrance picker is in the timeline header, bound to the selection');
  for (const p of ['none', 'fade', 'slide', 'pop']) {
    assert((await page.locator(`[data-testid="anim-preset-${p}"]`).count()) === 1, `entrance preset «${p}» is offered`);
  }
  assert(
    (await page.locator('[data-testid="anim-preset-none"]').getAttribute('data-active')) === 'true',
    'a freshly placed layer reads as «بدون» — its true state, so the picker is never showing a preset the element does not have',
  );

  // Each preset must change what is actually painted at the same instant. Sampled at
  // 0.1s into a 0→0.6s clip, where a 'easeOut' entrance is ~27% complete.
  await parkPlayhead(page, 0.1);
  const seen = {};
  for (const p of ['none', 'fade', 'slide', 'pop']) {
    await page.locator(`[data-testid="anim-preset-${p}"]`).click();
    await page.waitForTimeout(180);
    seen[p] = await renderedOf(page, head);
    assert((await page.locator(`[data-testid="anim-preset-${p}"]`).getAttribute('data-active')) === 'true', `picking «${p}» marks «${p}» active (the pill reads the element, so this proves the write reached the element)`);
  }
  assert(seen.none.opacity === 1 && seen.none.transform === 'matrix(1, 0, 0, 1, 0, 0)', `«بدون» paints the element plainly (opacity ${seen.none.opacity}, transform ${seen.none.transform})`);
  assert(seen.fade.opacity > 0 && seen.fade.opacity < 1, `«ظهور تدريجي» really fades — opacity ${seen.fade.opacity.toFixed(3)} partway through the clip, not 1`);
  assert(/matrix\(1, 0, 0, 1, 0, [1-9]/.test(seen.slide.transform), `«انزلاق لأعلى» really offsets the element vertically — transform ${seen.slide.transform}`);
  assert(/^matrix\(0\.[0-9]/.test(seen.pop.transform), `«تكبير» really scales the element — transform ${seen.pop.transform}`);
  assert(
    seen.slide.transform !== seen.pop.transform && seen.fade.transform !== seen.slide.transform,
    'the four presets paint four different pictures at the same instant — the chooser rebuilds the property tracks rendering reads, it is not a label that lights up',
  );

  // Settle on the brief's entrance and confirm the timeline agrees.
  await page.locator('[data-testid="anim-preset-slide"]').click();
  await page.waitForTimeout(180);
  const headLabel = await page.locator(`[data-layer-id="${head}"]`).evaluate((e) => e.innerText.trim());
  assert(
    headLabel.includes('تخفيضات'),
    `the timeline names the layer by its own text, not a 13-digit epoch — reads «${headLabel}»`,
  );

  // ============================================================
  // 3. The second line is timed to follow it
  // ============================================================
  console.log('\n3. سطر ثانٍ يظهر بعده');
  await page.getByRole('button', { name: 'احترافي', exact: true }).click();
  await page.waitForTimeout(250);
  const line2 = await placeText(page, 0.5, 0.42, 'حتى ٧٠٪ على كل المجموعات');
  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(180);

  const clipGeo = async (id) => page.locator(`[data-testid="clip-${id}"]`).evaluate((e) => ({ left: parseFloat(e.style.left), width: parseFloat(e.style.width) }));
  const before = await clipGeo(line2);
  assert(near(before.left, 0, 0.5), `the second line's clip starts at t=0 like every new layer (left ${before.left}%)`);

  // Drag the clip body one full second to the right — the real gesture, measured.
  const tracks = await page.locator('[data-testid="timeline-tracks"]').boundingBox();
  const pxPerSecond = tracks.width / DURATION;
  const body = await page.locator(`[data-testid="clip-${line2}"]`).boundingBox();
  await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
  await page.mouse.down();
  await page.mouse.move(body.x + body.width / 2 + pxPerSecond, body.y + body.height / 2, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const after = await clipGeo(line2);
  assert(near(after.left, 20, 1.5), `dragging the clip one second right really moves it one second: left ${before.left}% → ${after.left}% (20% of a 5s ruler)`);
  assert(near(after.width, before.width, 1), `and its duration is untouched by the move (width ${before.width}% → ${after.width}%)`);

  // The timing has to be visible in what is painted: at 0.5s line 2 is not in yet.
  await parkPlayhead(page, 0.5);
  const l2Early = await renderedOf(page, line2);
  const headEarly = await renderedOf(page, head);
  assert(l2Early.opacity === 0, `at 0.5s the second line has not started (opacity ${l2Early.opacity}) — its clip begins at 1.0s`);
  assert(headEarly.opacity > l2Early.opacity, `while the headline is already on its way in at the same instant (opacity ${headEarly.opacity.toFixed(3)}) — the two entrances really are staggered`);

  // ============================================================
  // 4. ◇ at the playhead: honest state, honest placement
  // ============================================================
  console.log('\n4. مفتاح عند المؤشّر');
  await selectLayer(page, head);
  const toggle = page.locator(`[data-testid="kf-toggle-${head}-opacity"]`);
  const t0b = await parkPlayhead(page, 0);
  assert(near(t0b, 0, 0.05), `the ruler parks the playhead at its start (${t0b.toFixed(3)}s)`);
  const atZero = await toggle.evaluate((e) => getComputedStyle(e).backgroundColor);
  assert(atZero !== 'rgba(0, 0, 0, 0)', `at 0.000s the ◇ toggle reads filled — the slide entrance really does have an opacity keyframe there (background ${atZero})`);

  const tFar = await parkPlayhead(page, 3);
  const far = await toggle.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, disabled: e.disabled }));
  assert(
    far.bg === 'rgba(0, 0, 0, 0)' && !far.disabled,
    `at ${tFar.toFixed(3)}s — well past the 0→0.6s clip — the ◇ toggle reads empty rather than claiming the clip's last keyframe is under the playhead (background ${far.bg})`,
  );

  const kfBefore = await diamondPercents(page, head);
  await toggle.click();
  await page.waitForTimeout(220);
  const kfAfter = await diamondPercents(page, head);
  assert(
    kfAfter.length === kfBefore.length + 1,
    `pressing ◇ there **adds** a keyframe (${kfBefore.length} → ${kfAfter.length}) — it used to delete the entrance's end keyframe instead`,
  );
  for (const p of kfBefore) {
    assert(
      kfAfter.some((q) => near(q, p, 0.3)),
      `the keyframe already at ${p}% of the ruler stayed exactly there — stretching the clip to reach the playhead rescales fractions so no existing keyframe moves in absolute time`,
    );
  }
  const playheadPct = (tFar / DURATION) * 100;
  const landed = kfAfter.find((p) => !kfBefore.some((q) => near(q, p, 0.3)));
  assert(
    landed !== undefined && near(landed, playheadPct, 1),
    `and the new keyframe landed under the playhead — ${landed}% of the ruler against a playhead at ${playheadPct.toFixed(2)}% (it used to land on the clip edge, 12% vs a 44% playhead)`,
  );

  // A playhead *before* the clip's start is the one case that cannot be served, and it
  // says so instead of misplacing anything.
  await parkPlayhead(page, 0.2);
  await selectLayer(page, line2);
  const l2Toggle = page.locator(`[data-testid="kf-toggle-${line2}-opacity"]`);
  const blocked = await l2Toggle.evaluate((e) => ({ disabled: e.disabled, title: e.title }));
  assert(blocked.disabled === true, 'with the playhead before a clip starts, ◇ is visibly disabled rather than dropping a keyframe somewhere else');
  assert(/مؤشّر التشغيل خارج مقطع/.test(blocked.title), `and it says why: «${blocked.title}»`);

  // ============================================================
  // 5. Playback: resumes where the playhead is, and keeps wall time
  // ============================================================
  console.log('\n5. التشغيل والتوقيت');
  const parked = await parkPlayhead(page, 3);
  const playBtn = page.locator('[data-testid="timeline-play-btn"]');
  await playBtn.click();
  await page.waitForTimeout(120);
  const resumed = await clockOf(page);
  await playBtn.click();
  await page.waitForTimeout(80);
  assert(
    resumed > parked - 0.05,
    `pressing play resumes from the playhead (${parked.toFixed(3)}s → ${resumed.toFixed(3)}s) instead of snapping back to zero — checking only the last second of a cut no longer means watching all five`,
  );

  await parkPlayhead(page, 0);
  const wall0 = Date.now();
  await playBtn.click();
  await page.waitForTimeout(2000);
  await playBtn.click();
  const wall = (Date.now() - wall0) / 1000;
  const advanced = await clockOf(page);
  const ratio = advanced / wall;
  assert(
    ratio > 0.97 && ratio < 1.03,
    `the project clock keeps wall time: ${advanced.toFixed(3)}s of project per ${wall.toFixed(3)}s of wall clock (ratio ${ratio.toFixed(4)}); the old fixed +0.033 per setInterval(33) tick measured 0.9876 and 0.9838`,
  );

  // ============================================================
  // 6. A still ending that holds the logo
  // ============================================================
  console.log('\n6. نهاية ثابتة فيها الشعار');
  const logo = await placeText(page, 0.5, 0.8, 'دَرج');
  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(180);
  const logoLate = [];
  for (const t of [4.0, 4.5, 4.9]) {
    await parkPlayhead(page, t);
    logoLate.push(await renderedOf(page, logo));
  }
  assert(
    logoLate.every((v) => v.opacity === 1),
    `the logo is fully settled across the whole tail (opacity ${logoLate.map((v) => v.opacity).join(', ')} at 4.0/4.5/4.9s) — a clip that has finished holds its last keyframe, so the ending really is static`,
  );
  assert(
    new Set(logoLate.map((v) => v.transform)).size === 1,
    `and it does not drift over those 900ms (transform constant at ${logoLate[0].transform})`,
  );

  // ============================================================
  // 7. The export dialog tells the truth before you commit
  // ============================================================
  console.log('\n7. حوار التصدير');
  await page.getByRole('button', { name: 'تصدير', exact: true }).first().click();
  await page.waitForTimeout(300);
  assert((await page.locator('[data-testid="export-estimate"]').count()) === 0, 'with a still format selected there is no video estimate line — nothing invented for a format that has no duration');

  await page.getByRole('button', { name: 'MP4', exact: true }).click();
  await page.waitForTimeout(220);
  const est4 = await page.locator('[data-testid="export-estimate"]').innerText();
  assert(/^المدّة 5 ث/.test(est4), `choosing MP4 states the real duration up front: «${est4}»`);
  assert(/4 ملفات/.test(est4), `and that the four default targets mean four separate encodes: «${est4}»`);

  const onByDefault = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="export-target-"]')].filter((e) => e.dataset.on === 'true').map((e) => e.dataset.testid.replace('export-target-', '')),
  );
  assert(onByDefault.length === 4, `the dialog still defaults to its four targets (${onByDefault.join(', ')}) — unchanged, so still/batch exports behave exactly as before`);

  await page.locator('[data-testid="export-only-project-size"]').click();
  await page.waitForTimeout(220);
  const onAfter = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="export-target-"]')].filter((e) => e.dataset.on === 'true').map((e) => e.dataset.testid.replace('export-target-', '')),
  );
  assert(onAfter.length === 1 && onAfter[0] === 'tt', `«مقاس المشروع فقط» narrows the batch to the format the project was started in, in one click (now: ${onAfter.join(', ')})`);
  const est1 = await page.locator('[data-testid="export-estimate"]').innerText();
  assert(/ملف واحد/.test(est1), `and the estimate follows it live: «${est1}»`);
  // The size number is calibrated against real exports from the built Tauri app, not
  // guessed: a 1080×1920 / 30fps / 5s MP4 of exactly this kind of content (Arabic
  // text and flat colour on one background) measured 91,314 bytes at عالية and
  // 69,104 at متوسطة, and the GIF 271,060 — see the measurement table in
  // src/lib/exportEstimate.ts. Pin the headline one so a future edit to those
  // constants has to come with a fresh measurement.
  assert(/0\.09 م\.ب/.test(est1), `and its size estimate matches the real file it is estimating — 91,314 bytes measured, «${est1}» shown`);
  await page.getByRole('button', { name: 'متوسطة', exact: true }).click();
  await page.waitForTimeout(220);
  const estMed = await page.locator('[data-testid="export-estimate"]').innerText();
  assert(/0\.07 م\.ب/.test(estMed), `and it tracks the quality switch — 69,104 bytes measured at متوسطة, «${estMed}» shown`);
  await page.getByRole('button', { name: 'عالية', exact: true }).click();
  await page.waitForTimeout(180);

  const scale2 = await page.locator('[data-testid="export-scale-2"]').evaluate((e) => ({ disabled: e.disabled }));
  const scale1Bg = await page.locator('[data-testid="export-scale-1"]').evaluate((e) => getComputedStyle(e).fontWeight);
  assert(scale2.disabled === true, 'the 1×/2×/3× multiplier is disabled for video — at its 2× default a project whose card reads 1080 × 1920 was writing a 2160 × 3840 file');
  assert(Number(scale1Bg) >= 600, `and 1× is shown as the active one instead (font-weight ${scale1Bg}), so the dialog and the file agree`);
  const lockReason = await page.locator('[data-testid="export-scale-2"]').evaluate((e) => e.closest('div').title);
  assert(/دقّة اللوحة نفسها/.test(lockReason), `with the reason stated on hover: «${lockReason}»`);

  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  await page.waitForTimeout(200);
  const scale2Still = await page.locator('[data-testid="export-scale-2"]').evaluate((e) => e.disabled);
  assert(scale2Still === false, 'switching back to a still format re-enables the multiplier — the lock is about video, not a permanent removal');

  // ============================================================
  assert(pageErrors.length === 0, `no runtime errors anywhere in the session (${pageErrors.slice(0, 3).join(' | ') || 'none'})`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`motion-journey: ${pass} pass, ${fail} fail`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(' -', f);
  }
  await browser.close();
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
