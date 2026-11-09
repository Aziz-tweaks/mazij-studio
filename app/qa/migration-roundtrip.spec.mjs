#!/usr/bin/env node
// Criterion A4 — **the one statement that means "nothing was silently corrupted".**
//
// Phase 1 reinterprets what a keyframe's stored time *means*: a fraction of its clip
// becomes an absolute duration in seconds. A stored `0.3` is the same eight bytes
// either way, and `persist.ts` carried no schema version — so a naive change
// reinterprets every saved document in place and **nothing reports an error**. A
// 0.3-fraction entrance quietly becomes a 0.3-second one.
//
// Both recon papers get this wrong, in opposite directions: one asserts "no
// migration" outright; the other names a migration (`t_new = t_old × duration`) and
// calls it "one pass, exact, reversible" without noticing there is no discriminator.
// The handling is a field **rename** — `t` → `time` — so that *presence* is the
// discriminator, plus a `schemaVersion` envelope for the next change, which will have
// nothing convenient to rename.
//
// WHY THIS SPEC READS A COMMITTED FILE RATHER THAN BUILDING A FIXTURE. A migration
// checked against a hand-written fixture only proves the migration agrees with
// whoever wrote the fixture. The input here is `qa/migration/prechange-autosave.json`
// — a real autosave produced **by the pre-change build**, through the real start
// screen and the real timeline, by `qa/migration/capture-prechange.mjs`, and
// committed in a commit that touches no file under `src/`. Alongside it,
// `prechange-samples.json` holds what *that* build resolved from *that* document at
// 60 instants. This spec loads the bytes into the new build through the real resume
// path and asserts the animation is identical at those 60 instants to within 1e-6.
//
// Run: QA_PORT=1443 node --import ./qa/helpers/port-redirect.mjs qa/migration-roundtrip.spec.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE_URL = `http://localhost:${process.env.QA_PORT || '1420'}`;
const AUTOSAVE_KEY = 'mazij.autosave.v1';
const HERE = new URL('.', import.meta.url).pathname;

const PRECHANGE_JSON = readFileSync(`${HERE}migration/prechange-autosave.json`, 'utf8');
const PRECHANGE_SAMPLES = JSON.parse(readFileSync(`${HERE}migration/prechange-samples.json`, 'utf8'));

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

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 1. المستند الأصل، كما كتبه البناء القديم / The source document, as the old build wrote it
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n1. المستند الذي كتبه بناءُ ما قبل التغيير');
  const raw = JSON.parse(PRECHANGE_JSON);
  const srcEl = raw.artboards[0].doc.elements.find((e) => e.id === PRECHANGE_SAMPLES.elementId);
  assert(!!srcEl, `the captured document carries the element the samples were taken from (${PRECHANGE_SAMPLES.elementId})`);
  assert(
    raw.schemaVersion === undefined,
    'it carries **no** `schemaVersion` — which is the whole problem: there was nothing in a saved document to branch a migration on, and the `.v1` in `mazij.autosave.v1` is part of a localStorage key string that is never read, parsed, compared or written into the payload',
  );
  const srcKeys = [...(srcEl.anim.tracks.opacity || []), ...(srcEl.anim.tracks.x || [])];
  assert(
    srcKeys.length > 0 && srcKeys.every((k) => typeof k.t === 'number' && k.time === undefined),
    `and every one of its ${srcKeys.length} keyframes carries \`t\` and no \`time\` (opacity at ${(srcEl.anim.tracks.opacity || []).map((k) => k.t.toFixed(4)).join(', ')}; x at ${(srcEl.anim.tracks.x || []).map((k) => k.t.toFixed(4)).join(', ')}) — fractions of a ${srcEl.anim.duration}s clip`,
  );
  assert(
    srcEl.anim.sourceIn === undefined,
    'and no `sourceIn` either — so the migration has to supply both the field and the reinterpretation, from a document that signals neither',
  );
  const customKeys = srcKeys.filter((k) => k.easing === 'custom');
  assert(
    customKeys.length > 0,
    `and the entrance carries a hand-dragged cubic bezier on ${customKeys.length} of its segments (${JSON.stringify(customKeys[0].bezier)}) — so a migration that got the times right and flattened the curve would still show up in the samples below`,
  );
  const xValues = (srcEl.anim.tracks.x || []).map((k) => k.value);
  assert(
    new Set(xValues).size === xValues.length && xValues.length === 3,
    `and its \`x\` track has three keys at three distinct values (${xValues.join(', ')}) — a migration that preserved times but lost values cannot pass by accident`,
  );
  assert(
    PRECHANGE_SAMPLES.samples.length === 60,
    `60 instants were sampled from the pre-change build, spanning 0 to ${PRECHANGE_SAMPLES.samples[59].t.toFixed(3)}s — past the end of the ${srcEl.anim.duration}s clip, because the two ends are exactly where a fraction and an absolute time disagree least`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // 2. تحميلُه ببناءِ اليوم، من مسارِ الاستئنافِ الحقيقيّ / Loading it with today's build
  // ═════════════════════════════════════════════════════════════════════════
  // الملفُّ يُوضَع في `localStorage` حيث يَضعه البرنامجُ نفسه، **بايتًا بايت**، ثم
  // يُحمَّل بإعادةِ تحميلٍ حقيقية ويُستأنَف من بطاقة «أكمل» — وهي الإيماءةُ التي
  // يُنفّذها العائدُ إلى مشروعه. وهذا ليس حقنَ حالة: هذه هي الحالةُ القادمة من
  // القرص، وهي بعينها مدخلُ المُرحِّل الحقيقيّ.
  console.log('\n2. تحميلُه ببناءِ اليوم من بطاقة «أكمل»');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(
    ({ key, json }) => window.localStorage.setItem(key, json),
    { key: AUTOSAVE_KEY, json: PRECHANGE_JSON },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="resume-project"]');
  await page.locator('[data-testid="resume-project"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  await page.waitForTimeout(400);

  const loaded = await page.evaluate((id) => {
    const node = document.querySelector(`[data-el-id="${id}"]`);
    return { present: !!node, text: node ? node.innerText.trim() : null };
  }, PRECHANGE_SAMPLES.elementId);
  assert(loaded.present, `the document opens and the element is still there, by its original id — «${loaded.text}»`);

  // **The migrated document has to be flushed back to disk before it can be read.**
  // Loading does not mark the document dirty — deliberately, so merely opening a
  // project never writes over it — so `localStorage` still holds the pre-change bytes
  // at this point. (Reproduced: reading it here measured the *input* and reported a
  // 1.0 disagreement in opacity, which is what an un-migrated `t` resolves to.)
  //
  // So one real edit is performed, and it is chosen to be a **round trip**: hide the
  // layer, then show it again. The document ends byte-identical in everything this
  // spec measures — no keyframe, no clip, no value is touched — and it is dirty, so
  // the autosave writes the migrated form out. Two real clicks, through the layer
  // list, exactly as a designer would.
  const visBtn = page.locator(`[data-testid="layer-visible-${PRECHANGE_SAMPLES.elementId}"]`);
  await visBtn.click();
  await page.waitForTimeout(150);
  await visBtn.click();
  await page.waitForTimeout(1300); // autosave debounce
  const flushed = await page.evaluate((k) => {
    const d = JSON.parse(window.localStorage.getItem(k));
    return { schemaVersion: d.schemaVersion };
  }, AUTOSAVE_KEY);
  assert(
    typeof flushed.schemaVersion === 'number',
    `and one real edit flushes the **migrated** document back to storage, now stamped with a schema version (${flushed.schemaVersion}) — which is what the next build will branch on instead of guessing`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // 3. الدورة: ٦٠ لحظة، وفرقٌ أقلّ من 1e-6 / The round-trip: 60 instants, under 1e-6
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n3. ٦٠ لحظة عبر `resolveAnimAt` — الادّعاء الوحيد الذي يعني «لم يَفسد شيء»');
  const after = await page.evaluate(
    async ({ id, instants }) => {
      const m = await import('/src/lib/animTimeline.ts');
      // يُقرأ من المستند **بعد** الترحيل والحفظ — انظر الدورة أعلاه.
      const saved = JSON.parse(window.localStorage.getItem('mazij.autosave.v1'));
      const el = saved.artboards[0].doc.elements.find((e) => e.id === id);
      return {
        anim: el.anim,
        values: instants.map((t) => m.resolveAnimAt(el.anim, t)),
      };
    },
    { id: PRECHANGE_SAMPLES.elementId, instants: PRECHANGE_SAMPLES.samples.map((s) => s.t) },
  );

  let worst = { t: null, prop: null, delta: 0 };
  for (let i = 0; i < PRECHANGE_SAMPLES.samples.length; i++) {
    const was = PRECHANGE_SAMPLES.samples[i].v;
    const now = after.values[i];
    for (const prop of ['opacity', 'x', 'y', 'scale', 'rotation']) {
      const d = Math.abs(was[prop] - now[prop]);
      if (d > worst.delta) worst = { t: PRECHANGE_SAMPLES.samples[i].t, prop, delta: d };
    }
  }
  assert(
    worst.delta < 1e-6,
    `the animation is identical at all 60 instants across all five properties — worst disagreement ${worst.delta.toExponential(3)} (${worst.prop} at ${worst.t === null ? 'n/a' : worst.t.toFixed(4)}s), under the 1e-6 the criterion asks for. A visual check cannot make this statement; this one can`,
  );

  // وما يقوله الترحيلُ عن نفسه: الحقول بعده.
  const migratedOpacity = [...(after.anim.tracks.opacity || [])].sort((a, b) => a.time - b.time);
  const migratedX = [...(after.anim.tracks.x || [])].sort((a, b) => a.time - b.time);
  assert(
    migratedOpacity.every((k) => typeof k.time === 'number' && k.t === undefined),
    `every migrated key now carries \`time\` and no \`t\` — opacity at ${migratedOpacity.map((k) => k.time.toFixed(4)).join(', ')}s, in seconds`,
  );
  assert(
    after.anim.sourceIn === 0,
    `and \`sourceIn\` was materialised as 0 (got ${after.anim.sourceIn}) — a document that was never trimmed has its animation origin at its start, which is what makes \`animTimeAt\` reduce to \`t − start\` and costs nothing until Phase 2 exists`,
  );
  // التحويلُ نفسه: `time = sourceIn + t × duration`، تامٌّ وعكسُه ممكن.
  const srcOpacity = [...(srcEl.anim.tracks.opacity || [])].sort((a, b) => a.t - b.t);
  const exact = srcOpacity.every((k, i) => Math.abs(migratedOpacity[i].time - k.t * srcEl.anim.duration) < 1e-12);
  assert(
    exact,
    `and each one is exactly \`t × duration\` of its original: ${srcOpacity.map((k, i) => `${k.t.toFixed(4)}→${migratedOpacity[i].time.toFixed(4)}s`).join('  ')} — one pass, exact, and genuinely reversible because \`duration\` is in the same record`,
  );
  assert(
    migratedOpacity.every((k, i) => k.id === srcOpacity[i].id && k.easing === srcOpacity[i].easing && JSON.stringify(k.bezier) === JSON.stringify(srcOpacity[i].bezier)),
    'and `id`, `easing` and the four bezier numbers survive key-for-key — the selection, the popover and the drag all address a keyframe by id, so a migration that minted new ones would silently drop the designer\'s selection',
  );
  assert(
    migratedX.length === 3 && migratedX.every((k, i) => Math.abs(k.value - [...(srcEl.anim.tracks.x || [])].sort((a, b) => a.t - b.t)[i].value) < 1e-12),
    `and the three \`x\` values are untouched (${migratedX.map((k) => k.value).join(', ')})`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // 4. مغلّفُ النسخة / The schema-version envelope
  // ═════════════════════════════════════════════════════════════════════════
  // المرحلةُ ١ لا تحتاجه — إعادةُ التسمية تكفيها. تحتاجه المرحلةُ ٤ (مفاتيحُ
  // `PropertyTracks` تصير مساراتٍ)، وتركيبُ رقمِ نسخةٍ **بعد** أوّل ملفٍّ لا يُفتَح
  // هو الترتيبُ المؤلم.
  console.log('\n4. مغلّفُ النسخة: مشتقٌّ من طول جدول الترحيلات، ويَرفض الأحدثَ صراحةً');
  const version = await page.evaluate(async () => {
    const m = await import('/src/lib/persist.ts');
    return {
      SCHEMA_VERSION: m.SCHEMA_VERSION,
      migrations: m.DOC_MIGRATIONS.length,
      names: [...m.DOC_MIGRATIONS],
      absentRunsAll: m.migrationsFor(0).length,
      v1RunsAll: m.migrationsFor(1).length,
      currentRunsNone: m.migrationsFor(m.SCHEMA_VERSION).length,
      tooNewRejected: m.isTooNew({ artboards: [], activeArtboardId: 'x', schemaVersion: m.SCHEMA_VERSION + 1 }),
      currentAccepted: m.isTooNew({ artboards: [], activeArtboardId: 'x', schemaVersion: m.SCHEMA_VERSION }),
    };
  });
  assert(
    version.SCHEMA_VERSION === version.migrations + 1,
    `\`SCHEMA_VERSION\` (${version.SCHEMA_VERSION}) is derived from the migration table's length (${version.migrations}: ${version.names.join(', ')}) — so the version cannot drift from its migrations: adding one raises the version by construction, and raising the version without one is impossible`,
  );
  assert(
    version.absentRunsAll === version.migrations && version.v1RunsAll === version.migrations && version.currentRunsNone === 0,
    `an absent version runs every migration (${version.absentRunsAll}), version 1 runs every migration (${version.v1RunsAll}), and a current document runs none (${version.currentRunsNone})`,
  );
  assert(
    version.tooNewRejected === true && version.currentAccepted === false,
    'a document from a **newer** build is refused outright rather than opened half-understood — because opening it drops the fields this build does not know, and the next autosave writes that loss back over the user\'s real work. an open-source timeline editor calls it `FormatError::TooNew`',
  );

  // والمستندُ المحفوظُ الآن يحمل النسخة. يُستخرَج بتعديلٍ حقيقيٍّ يُشغِّل الحفظ.
  const savedVersion = await page.evaluate((k) => {
    const d = JSON.parse(window.localStorage.getItem(k));
    return { schemaVersion: d.schemaVersion, hasFps: typeof d.artboards[0].doc.fps, medium: d.artboards[0].doc.medium };
  }, AUTOSAVE_KEY);
  assert(
    savedVersion.schemaVersion === version.SCHEMA_VERSION,
    `and after one real edit the document is saved **with** the version (${savedVersion.schemaVersion}) — written inside \`saveDoc\`, so no save path can forget it`,
  );
  assert(
    savedVersion.hasFps === 'number' && (savedVersion.medium === 'still' || savedVersion.medium === 'timed'),
    `and with the two new document fields filled in from the destination rather than guessed: fps=${savedVersion.hasFps}, medium=${savedVersion.medium}`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // 5. الرحلةُ عبر بناءٍ أقدم / Through an older build and back
  // ═════════════════════════════════════════════════════════════════════════
  // الحالةُ التي تَخشاها الخطّة بالاسم: مستندٌ حفظه بناءٌ **في منتصف الإصدار**،
  // أو مرّ على بناءٍ أقدم ثم رجع — فبعضُ مفاتيحه قديمةٌ وبعضُها جديدة. والمُميِّزُ
  // يعمل **لكلّ مفتاحٍ على حدة**، فلا حالةَ لبسٍ هنا أيضًا.
  console.log('\n5. مستندٌ نصفُ مفاتيحه قديمةٌ ونصفُها جديدة');
  const mixed = JSON.parse(PRECHANGE_JSON);
  const mixedEl = mixed.artboards[0].doc.elements.find((e) => e.id === PRECHANGE_SAMPLES.elementId);
  const dur = mixedEl.anim.duration;
  // المسارُ `x`: مفاتيحه تُحوَّل يدويًّا إلى الشكل الجديد (كأنّ بناءً جديدًا كتبها)،
  // ومسارُ العتامة يبقى بالشكل القديم.
  mixedEl.anim.tracks.x = mixedEl.anim.tracks.x.map((k) => ({ id: k.id, time: k.t * dur, value: k.value, easing: k.easing, bezier: k.bezier }));
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(
    ({ key, json }) => window.localStorage.setItem(key, json),
    { key: AUTOSAVE_KEY, json: JSON.stringify(mixed) },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-testid="resume-project"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  await page.waitForTimeout(400);
  const visBtn2 = page.locator(`[data-testid="layer-visible-${PRECHANGE_SAMPLES.elementId}"]`);
  await visBtn2.click();
  await page.waitForTimeout(150);
  await visBtn2.click();
  await page.waitForTimeout(1300);
  const mixedAfter = await page.evaluate(
    async ({ id, instants }) => {
      const m = await import('/src/lib/animTimeline.ts');
      const saved = JSON.parse(window.localStorage.getItem('mazij.autosave.v1'));
      const el = saved.artboards[0].doc.elements.find((e) => e.id === id);
      return instants.map((t) => m.resolveAnimAt(el.anim, t));
    },
    { id: PRECHANGE_SAMPLES.elementId, instants: PRECHANGE_SAMPLES.samples.map((s) => s.t) },
  );
  let mixedWorst = 0;
  for (let i = 0; i < PRECHANGE_SAMPLES.samples.length; i++) {
    for (const prop of ['opacity', 'x', 'y', 'scale', 'rotation']) {
      mixedWorst = Math.max(mixedWorst, Math.abs(PRECHANGE_SAMPLES.samples[i].v[prop] - mixedAfter[i][prop]));
    }
  }
  assert(
    mixedWorst < 1e-6,
    `a document whose \`x\` keys were already migrated and whose opacity keys were not loads to the same animation at all 60 instants — worst disagreement ${mixedWorst.toExponential(3)}. The discriminator is per-key, so a half-migrated document has no ambiguous case either, and a key that was already converted is **not** converted twice`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // 6. التحقّقُ على طبقتين / Two-tier validation
  // ═════════════════════════════════════════════════════════════════════════
  // ما يجب أن يُنتجه **تعديلٌ** أصرمُ ممّا يجب أن يَستوفيه **ملفٌّ** ليُفتَح. الفكرة
  // من an open-source timeline editor، ومُثبَّتةٌ هناك باختبارٍ مُسمًّى باسم السياسة
  // (`structural_rule_breaks_still_open`). والسياسةُ مكتوبةٌ في `src/lib/persist.ts`.
  //
  // والمستندُ أدناه يَخرِق الطبقةَ الصارمة خرقًا مزدوجًا: مقطعٌ بطولٍ صفريّ،
  // ومفتاحانِ على الزمن نفسه. ويجب أن يُفتَح **بكلّ عنصرٍ ومفتاحٍ فيه سليمًا** —
  // لا يُرفَض، ولا «يُصلَح» بحذفِ ما لا يُعجِب.
  console.log('\n6. مستندٌ يَخرِق القاعدةَ البنيويّة — يُفتَح كاملًا ولا يُرفَض');
  const hostile = JSON.parse(PRECHANGE_JSON);
  const hEl = hostile.artboards[0].doc.elements.find((e) => e.id === PRECHANGE_SAMPLES.elementId);
  hostile.artboards[0].doc.elements.push({
    ...JSON.parse(JSON.stringify(hEl)),
    id: 'zero-duration-clip',
    // مقطعٌ بطولٍ صفريّ، ومفتاحانِ على الزمن نفسه تمامًا.
    anim: { preset: 'none', start: 1, duration: 0, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: { opacity: [
      { id: 'dup-a', time: 0.25, value: 0.2, easing: 'linear', bezier: [0, 0, 1, 1] },
      { id: 'dup-b', time: 0.25, value: 0.9, easing: 'linear', bezier: [0, 0, 1, 1] },
    ] } },
  });
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(({ key, json }) => window.localStorage.setItem(key, json), { key: AUTOSAVE_KEY, json: JSON.stringify(hostile) });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-testid="resume-project"]').click();
  await page.waitForSelector('[data-testid="artboard"]');
  await page.waitForTimeout(500);
  const hostileLoaded = await page.evaluate(() => ({
    elements: document.querySelectorAll('[data-el-id]').length,
    zeroPresent: !!document.querySelector('[data-el-id="zero-duration-clip"]'),
  }));
  assert(
    hostileLoaded.elements === hostile.artboards[0].doc.elements.length && hostileLoaded.zeroPresent,
    `a document carrying a zero-duration clip **and** two keyframes on the same instant opens with every element intact (${hostileLoaded.elements} of ${hostile.artboards[0].doc.elements.length} painted, the offending one among them) — a file is not an edit, and refusing it or quietly deleting half of it would both be losing a user's work`,
  );
  const hostileResolved = await page.evaluate(async () => {
    const m = await import('/src/lib/animTimeline.ts');
    const saved = JSON.parse(window.localStorage.getItem('mazij.autosave.v1'));
    const el = saved.artboards[0].doc.elements.find((e) => e.id === 'zero-duration-clip');
    const doc = saved.artboards[0].doc;
    return {
      keys: el.anim.tracks.opacity.length,
      atDup: m.resolveAnimAt(el.anim, 1.25).opacity,
      finite: Number.isFinite(m.resolveAnimAt(el.anim, 1.25).opacity),
      docDuration: m.documentDuration([el.anim], doc.fps ?? 30),
    };
  });
  assert(
    hostileResolved.keys === 2 && hostileResolved.finite,
    `both colliding keyframes survive the load (${hostileResolved.keys} on the track) and the resolver returns a finite value at their shared instant (${hostileResolved.atDup}) instead of dividing by a zero span`,
  );
  assert(
    hostileResolved.docDuration > 0,
    `and a zero-duration clip still yields a usable document length (${hostileResolved.docDuration.toFixed(4)}s, floored at one frame) rather than a zero that divides every percentage in the UI`,
  );
  // والطبقةُ الصارمة من الجهة الأخرى: الواجهةُ لا تستطيع أن تُنتج هذا. كلُّ كتابةِ
  // مفتاحٍ تمرّ بـ`setKeyframe`، وهي تَستبدل عند تطابق الزمن بدل أن تُدرج ثانيًا.
  const strict = await page.evaluate(async () => {
    const m = await import('/src/lib/animTimeline.ts');
    const base = [{ id: 'a', time: 0.25, value: 0.2, easing: 'linear', bezier: [0, 0, 1, 1] }];
    const after = m.setKeyframe(base, { id: 'b', time: 0.25, value: 0.9, easing: 'easeOut', bezier: [0.42, 0, 0.58, 1] });
    return { length: after.length, id: after[0].id, value: after[0].value, easing: after[0].easing, bezier: after[0].bezier };
  });
  assert(
    strict.length === 1 && strict.id === 'a' && strict.value === 0.9 && strict.easing === 'linear' && JSON.stringify(strict.bezier) === '[0,0,1,1]',
    `and an **edit** cannot produce that state: writing at an occupied time replaces the value (0.2 → ${strict.value}) while keeping the existing key's \`id\`, \`easing\` and \`bezier\` (${strict.id}, ${strict.easing}, ${JSON.stringify(strict.bezier)}) — an open-source motion engine's twelve-field copy reduced to Mazij's three. One key out, not two`,
  );

  console.log('');
  assert(pageErrors.length === 0, `no runtime errors loading either document (${pageErrors.slice(0, 3).join(' | ') || 'none'})`);

  console.log(`\n${'='.repeat(62)}`);
  console.log(`migration-roundtrip: ${pass} pass, ${fail} fail`);
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
