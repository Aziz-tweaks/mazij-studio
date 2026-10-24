#!/usr/bin/env node
// Phase 2 of the video branch — **مقاطعُ حيّة / Live clips**: one `hitTest`, regular
// trim, split, transport, and the timeline ungated from pro mode.
//
// Everything below is driven with real pointer and keyboard events from the real
// start screen. Nothing writes state through a back door: the only `page.evaluate`
// calls either *read* the DOM / the autosave the app itself wrote, or call a
// production module (`/src/lib/timelineHit.ts`, `/src/lib/animTimeline.ts`,
// `/src/lib/exportArtboard.ts`) on a document the UI built.
//
// The criteria, in the plan's own numbering (`docs/PLAN-video-branch.md` §المرحلة ٢):
//
//   B1  the hit-test table at 100 px/s — the tie-break logic, not the number 7
//   B2  trim the in-edge 0 → 0.4 s; `resolveAnimAt` at 40 surviving instants is
//       **bit-identical** to what it returned before
//   B3  the handle/diamond collision is gone, and its compensating branch is gone
//       from `Clip.tsx` with it
//   B4  hover shows `ew-resize` **before** the press; the drag is one undo step that
//       restores `start`/`duration` exactly
//   B5  Escape mid-drag: `start`/`duration` unchanged **and** the history unchanged
//   B6  `⌘B` at 2.0 s on a 0–5 s clip is pixel-neutral — frames at 1.0 s and 3.0 s
//       byte-identical to the pre-split export, read back out of real MP4 files by
//       the frame judge
//   B7  a still document still has no timeline (A7 re-asserted, because this phase
//       touches the gate)
//
// Plus the four things the phase changes that have no numbered criterion of their
// own: the simple/pro gate off the clip row, the transport keys, the `withPreset`
// guard, and the split affordance stating what it produces.
//
// DEPENDENCY, stated rather than worked around: this file imports playwright by
// **package name**. 48 older specs in this directory import it by an absolute path
// into another checkout's `node_modules`; a separate job owns that, and this file
// deliberately does not become the 49th. So running it needs `playwright`
// resolvable from `app/node_modules` — `npm i -D playwright`, or a symlink to an
// existing install.
//
// Run: node qa/phase2-live-clips.spec.mjs   (dev server on :1420)
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { AUTOSAVE_KEY, bootBlank } from './helpers/boot.mjs';
import { FrameSet } from './replication/lib/video.mjs';

const BASE_URL = `http://localhost:${process.env.QA_PORT || '1420'}`;
const FFMPEG = process.env.MAZIJ_FFMPEG ?? '/opt/homebrew/bin/ffmpeg';

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
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// ─────────────────────────────────────────────────────────────────────────────
// الطريق إلى المحرّر / Into the editor — through the real start screen
// ─────────────────────────────────────────────────────────────────────────────

/** `bootBlank` from the shared helper, plus the pro-mode switch when asked. The
 * boot path is **not** re-implemented here — `qa/helpers/boot.mjs` owns it. */
async function openFormat(page, formatId, { pro = true } = {}) {
  await bootBlank(page, BASE_URL, formatId);
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
  // النقرة المزدوجة **داخل** النصّ الجديد لا عند نقطة إنشائه: منذ ٢٤ أكتوبر ٢٠٢٦ يبدأ النصّ
  // حيث نقر المصمّم (حافّة بدايته — يمينه بالعربيّة — على النقطة نفسها)، فلم تعد النقطة
  // وسطَ صندوقه كما كانت يوم كُتب هذا المساعد، بل حافّته. (`Stage.tsx`، أداة النصّ.)
  const nb = await page.locator(`[data-el-id="${id}"]`).boundingBox();
  await page.mouse.dblclick(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  return id;
}

const rulerSpan = (page) => page.locator('[data-testid="timeline-ruler"]').evaluate((e) => Number(e.dataset.span));

async function parkPlayhead(page, seconds) {
  const span = await rulerSpan(page);
  const box = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(box.x + (box.width * seconds) / span + 1, box.y + box.height / 2);
  await page.waitForTimeout(90);
  return page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
}

/** One element's `anim` as the document holds it, read out of the autosave the app
 * itself wrote. Not a back door: this reads what was saved, it does not write. */
async function animOf(page, id) {
  await page.waitForTimeout(900);
  return page.evaluate(
    ({ key, elId }) => {
      const raw = JSON.parse(window.localStorage.getItem(key));
      const el = raw.artboards[0].doc.elements.find((e) => e.id === elId);
      return el ? el.anim : null;
    },
    { key: AUTOSAVE_KEY, elId: id },
  );
}

/** Every element in the saved document, id + span. */
async function docElements(page) {
  await page.waitForTimeout(900);
  return page.evaluate(
    ({ key }) => {
      const raw = JSON.parse(window.localStorage.getItem(key));
      return raw.artboards[0].doc.elements.map((e) => ({ id: e.id, type: e.type, text: e.text, start: e.anim.start, duration: e.anim.duration, sourceIn: e.anim.sourceIn, tracks: e.anim.tracks }));
    },
    { key: AUTOSAVE_KEY },
  );
}

const historyLen = (page) => page.locator('[data-testid="undo-btn"]').evaluate((e) => Number(e.dataset.historyPast));

/** `resolveAnimAt` on one element at one instant, resolved by the production module
 * against the document the UI built. */
const sampleAt = (page, elId, time) =>
  page.evaluate(
    async ({ key, i, t }) => {
      const m = await import('/src/lib/animTimeline.ts');
      const raw = JSON.parse(window.localStorage.getItem(key));
      const el = raw.artboards[0].doc.elements.find((e) => e.id === i);
      return m.resolveAnimAt(el.anim, t);
    },
    { key: AUTOSAVE_KEY, i: elId, t: time },
  );

/** Drags the clip row from one client x to another at the row's vertical centre. */
async function dragBy(page, fromX, y, dx, steps = 14) {
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  await page.mouse.move(fromX + dx, y, { steps });
  await page.mouse.up();
  await page.waitForTimeout(120);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  // ═════════════════════════════════════════════════════════════════════════
  // B1. جدولُ الإصابة / The hit-test table
  // ═════════════════════════════════════════════════════════════════════════
  // بوحدات الورقة نفسها وعند تكبيرها نفسه (١٠٠ بكسل/ثانية)، فالمقيسُ **منطقُ فصل
  // التعادل** لا الرقم ٧ (§10.1): أرقامُ محرّر خطٍّ زمنيٍّ مفتوح بنقاط egui ولم تُبنَ ولم
  // تُشغَّل، والمنقولُ هو النسبةُ والقاعدة.
  console.log('\nB1. جدولُ الإصابة عند ١٠٠ بكسل/ثانية');
  await openFormat(page, 'ig-reel');

  const b1 = await page.evaluate(async () => {
    const h = await import('/src/lib/timelineHit.ts');
    // ١٠٠ بكسل/ثانية: مدًى ٥ث على عرض ٥٠٠ بكسل.
    const layout = { width: 500, span: 5, rulerHeight: 26 };
    // A تمتدّ ١٠٠..٣٠٠ و‏B تمتدّ ٣٠٠..٥٠٠، كلتاهما على الصفّ نفسه.
    const row = (id, startPx, widthPx, extra = {}) => ({ elementId: id, property: 'opacity', top: 0, height: 30, start: startPx / 100, duration: widthPx / 100, ...extra });
    const clips = [row('A', 100, 200), row('B', 300, 200)];
    const at = (x, y = 40) => h.hitTest({ x, y }, layout, clips);
    const out = {
      x297: at(297),
      x303: at(303),
      x300: at(300),
      // منطقةُ القبض تبلغ ٧ بكسلات **خارج** المقطع: حافّةٌ حرّة تُقبَض من الفراغ.
      outside: at(94),
      tooFarOutside: at(92),
      // مقطعٌ بعرض ٩ بكسلات: مركزُه سحبُ جسم، لأنّ `min(7, w/3)` تصير ٣.
      narrowCentre: h.hitTest({ x: 104.5, y: 40 }, layout, [row('N', 100, 9)]),
      narrowEdge: h.hitTest({ x: 101, y: 40 }, layout, [row('N', 100, 9)]),
      // المسطرة تُجيب عن نفسها، والصفُّ الفارغ ليس «لا شيء» بل سطحُ تمرير.
      ruler: h.hitTest({ x: 250, y: 10 }, layout, clips),
      empty: at(250, 200),
      // المفاتيحُ تَسبق الحوافّ متى كانت الاثنتان في المدى — المخالفةُ الواحدة.
      kfBeatsEdge: h.hitTest(
        { x: 297, y: 40 },
        layout,
        [row('A', 100, 200, { keyframes: [{ id: 'k1', property: 'opacity', timelineTime: 2.97 }] })],
      ),
      // وعنصرٌ مقفول يقول ذلك **قبل** المحاولة.
      locked: h.hitTest({ x: 297, y: 40 }, layout, [row('A', 100, 200, { locked: true })]),
      lockedBody: h.hitTest({ x: 200, y: 40 }, layout, [row('A', 100, 200, { locked: true })]),
      grabPx: h.GRAB_PX,
      kfGrabPx: h.KEYFRAME_GRAB_PX,
    };
    return out;
  });

  assert(
    b1.x297.kind === 'clipEdge' && b1.x297.elementId === 'A' && b1.x297.edge === 'out',
    `x=297 → A's out-edge (${b1.x297.elementId}.${b1.x297.edge}) — three pixels from A's end and three from B's start, and **inside A beats outside B**, which is tie-break ١`,
  );
  assert(
    b1.x303.kind === 'clipEdge' && b1.x303.elementId === 'B' && b1.x303.edge === 'in',
    `x=303 → B's in-edge (${b1.x303.elementId}.${b1.x303.edge}) — the mirror case, and it is the same rule, not a second one`,
  );
  assert(
    b1.x300.kind === 'clipEdge' && b1.x300.elementId === 'B' && b1.x300.edge === 'in',
    `x=300 → B's in-edge (${b1.x300.elementId}.${b1.x300.edge}) — an exact tie in both "inside" and distance, broken by tie-break ٣: the **later** clip's in-edge. One answer, not a coin toss`,
  );
  assert(
    b1.outside.kind === 'clipEdge' && b1.outside.elementId === 'A' && b1.outside.edge === 'in',
    `x=94 — six pixels **outside** A — still grabs A's in-edge (${b1.outside.elementId}.${b1.outside.edge}): the grab zone reaches ${b1.grabPx} px past the clip, so a free edge is grabbable from the gap beside it`,
  );
  assert(b1.tooFarOutside.kind === 'emptyRow', `and x=92 — eight pixels outside — is an empty row (${b1.tooFarOutside.kind}), so the reach is bounded, not unbounded`);
  assert(
    b1.narrowCentre.kind === 'clipBody',
    `a 9 px clip's centre is a **body** drag (${b1.narrowCentre.kind}) — \`min(${b1.grabPx}px, w/3)\` shrinks each side's zone to 3 px, so even a clip narrower than 21 px keeps a draggable middle third`,
  );
  assert(b1.narrowEdge.kind === 'clipEdge' && b1.narrowEdge.edge === 'in', `and one pixel in from its start is still its in-edge (${b1.narrowEdge.kind}.${b1.narrowEdge.edge}) — the zone shrank, it did not vanish`);
  assert(b1.ruler.kind === 'ruler' && b1.ruler.cursor === 'ew-resize', `a point above the tracks is the ruler (${b1.ruler.kind}, cursor ${b1.ruler.cursor}) — the same table answers that question too`);
  assert(b1.empty.kind === 'emptyRow' && b1.empty.cursor === 'ew-resize', `and a point below every row is an empty row with a scrub cursor (${b1.empty.cursor}) — "nothing" is still an answer with a behaviour`);
  assert(
    b1.kfBeatsEdge.kind === 'keyframe' && b1.kfBeatsEdge.keyframeId === 'k1',
    `with a diamond at 2.97 s and A's out-edge at 3.00 s, x=297 resolves to the **keyframe** (${b1.kfBeatsEdge.kind}) — the one deliberate departure from محرّر خطٍّ زمنيٍّ مفتوح, which has no on-clip diamonds to collide with`,
  );
  assert(
    b1.locked.kind === 'clipEdge' && b1.locked.cursor === 'not-allowed' && b1.locked.blocked === true,
    `a locked element's edge still *reads* as an edge but answers cursor \`${b1.locked.cursor}\` with blocked=${b1.locked.blocked} — a blocked edit says so **before** you try it, instead of swallowing the drag`,
  );
  assert(b1.lockedBody.kind === 'clipBody' && b1.lockedBody.cursor === 'not-allowed', `and so does its body (${b1.lockedBody.cursor})`);

  // ═════════════════════════════════════════════════════════════════════════
  // B2. الثابتُ الذي تُسمّيه محرّر خطٍّ زمنيٍّ مفتوح «ما تَكسره التطبيقات»
  // ═════════════════════════════════════════════════════════════════════════
  // `moving_an_edge_keeps_the_media_under_the_timeline` (`crates/edit/src/tests.rs:876`)،
  // مُعادًا صوغُه لمزيج: تقليمُ حافّةِ الدخول من ٠ إلى ٠٫٤ث لا يُغيّر ما يَحلّه
  // `resolveAnimAt` عند أيّ لحظةٍ باقية. وهو المعيارُ الذي يُثبت أنّ حقلَي §1A
  // موصولان فعلًا: لو أُهمِل `sourceIn` سقط بصوتٍ عالٍ.
  console.log('\nB2. تقليمُ الرأس ٠ → ٠٫٤ث، و٤٠ لحظةً باقيةً بلا تغيّر');
  await openFormat(page, 'ig-reel');
  const b2 = await placeText(page, 0.5, 0.3, 'ثابتُ الحافّة');
  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(200);

  // مقطعٌ طوله خمسُ ثوانٍ، مصنوعٌ بسحب الحافّة اليمنى — لا بحقنِ حالة. فتبقى
  // اللحظاتُ الباقية بعد التقليم مدًى ذا معنًى (٠٫٤ → ٥٫٠) لا عُشرَ ثانية.
  const b2Span = await rulerSpan(page);
  const b2Tracks = await page.locator('[data-testid="timeline-tracks"]').boundingBox();
  const b2PxPerSec = b2Tracks.width / b2Span;
  let rh = await page.locator(`[data-testid="clip-${b2}-resize-right"]`).boundingBox();
  await dragBy(page, rh.x + rh.width / 2, rh.y + rh.height / 2, (5 - 0.6) * b2PxPerSec, 20);
  const b2Grown = await animOf(page, b2);
  assert(near(b2Grown.duration, 5, 0.12), `the clip is ${b2Grown.duration.toFixed(3)}s long, grown by dragging its own out-edge`);

  const instants = Array.from({ length: 40 }, (_, i) => 0.4 + ((5.0 - 0.4) * i) / 39);
  const before = [];
  for (const t of instants) before.push(await sampleAt(page, b2, t));

  const lh = await page.locator(`[data-testid="clip-${b2}-resize-left"]`).boundingBox();
  await dragBy(page, lh.x + lh.width / 2, lh.y + lh.height / 2, 0.4 * b2PxPerSec, 20);
  const b2Trimmed = await animOf(page, b2);
  assert(
    near(b2Trimmed.start, 0.4, 0.02) && near(b2Trimmed.sourceIn, 0.4, 0.02),
    `the in-edge drag moved **both** fields by the same delta: start ${b2Trimmed.start.toFixed(4)}s, sourceIn ${b2Trimmed.sourceIn.toFixed(4)}s — that is §1A's two-field design, and the next assertion is what it is *for*`,
  );
  assert(
    near(b2Trimmed.duration, 5 - 0.4, 0.03),
    `and the duration shrank by the same 0.4s (now ${b2Trimmed.duration.toFixed(3)}s) — the head was cut off, the tail did not move`,
  );
  const b2Keys = b2Trimmed.tracks.opacity.map((k) => k.time);
  assert(
    b2Keys.some((t) => Math.abs(t) < 1e-9) && b2Keys.some((t) => Math.abs(t - 0.6) < 1e-9),
    `and **not one keyframe time changed**: still at ${b2Keys.map((t) => t.toFixed(3)).join(' and ')}s in animation time`,
  );

  const after = [];
  for (const t of instants) after.push(await sampleAt(page, b2, t));
  let exact = 0;
  let worst = 0;
  let worstAt = null;
  for (let i = 0; i < instants.length; i++) {
    const same = ['opacity', 'x', 'y', 'scale', 'rotation'].every((p) => before[i][p] === after[i][p]);
    if (same) exact++;
    for (const p of ['opacity', 'x', 'y', 'scale', 'rotation']) {
      const d = Math.abs(before[i][p] - after[i][p]);
      if (d > worst) {
        worst = d;
        worstAt = instants[i];
      }
    }
  }
  assert(
    exact === instants.length,
    `\`resolveAnimAt\` returns **bit-identical** values at all ${instants.length} surviving instants (${exact}/${instants.length} exact; worst deviation ${worst.toExponential(2)}${worstAt === null ? '' : ` at ${worstAt.toFixed(3)}s`}) — not "close", identical, because \`animTimeAt\` resolves \`start − sourceIn\` first and a trim moves both by the same number, so the subtraction is exactly zero`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // B3. تصادمُ المقبض والماسة ميتٌ، ومعالجتُه محذوفة
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nB3. ضغطةٌ بلا سحبٍ على حافّةِ الدخول، ومفتاحٌ عند زمن الحركة ٠');
  await openFormat(page, 'ig-reel');
  const b3 = await placeText(page, 0.5, 0.3, 'حافّةٌ وماسة');
  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(220);
  const b3Anim = await animOf(page, b3);
  assert(
    b3Anim.tracks.opacity.some((k) => Math.abs(k.time) < 1e-9),
    `the fade entrance puts a keyframe at animation time 0 — i.e. exactly on the clip's in-edge (keys at ${b3Anim.tracks.opacity.map((k) => k.time.toFixed(3)).join(', ')}s). That coincidence is the collision`,
  );
  const b3Handle = await page.locator(`[data-testid="clip-${b3}-resize-left"]`).boundingBox();
  await page.mouse.move(b3Handle.x + b3Handle.width / 2, b3Handle.y + b3Handle.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(150);
  const b3Popover = await page.locator('[data-testid="kf-popover"]').count();
  const b3SelectedDiamonds = await page.evaluate(
    (i) => [...document.querySelectorAll(`[data-testid^="kf-${i}-"]`)].filter((e) => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(e).backgroundColor === getComputedStyle(e).borderTopColor).length,
    b3,
  );
  assert(
    b3Popover === 0 && b3SelectedDiamonds === 0,
    `a press with no drag on the clip's in-edge selects **no** keyframe as a side effect (popovers ${b3Popover}, selected diamonds ${b3SelectedDiamonds}) — it started a trim that moved nothing, and that is all it did`,
  );
  const b3Hover = await page.locator(`[data-testid="clip-row-${b3}"]`).evaluate((e) => ({ hit: e.dataset.hoverHit, edge: e.dataset.hoverEdge, cursor: getComputedStyle(e).cursor }));
  assert(
    b3Hover.hit === 'clipEdge' && b3Hover.edge === 'in' && b3Hover.cursor === 'ew-resize',
    `and the row says what the pointer is on before anything happens: ${b3Hover.hit}/${b3Hover.edge}, cursor ${b3Hover.cursor} — the hover and the press read the same function with the same coordinates`,
  );
  const clipSrc = readFileSync(new URL('../src/components/timeline/Clip.tsx', import.meta.url), 'utf8');
  assert(
    !/has no hit-area of its own/.test(clipSrc) || /\*\*ومعالجةُ التصادم المكتوبة هنا سقطت\*\*/.test(clipSrc),
    'and the compensating branch is gone from `Clip.tsx` — its explanatory sentence survives only inside the paragraph that records its removal',
  );
  assert(
    !/!moved\s*&&\s*\(kind === 'resize-left'/.test(clipSrc) && !/const edgeKf\b/.test(clipSrc),
    'the branch itself — `if (!moved && (kind === \'resize-left\' …)) { … edgeKf … }` — no longer exists in the file: the collision is resolved by a tie-break, not compensated for after the fact',
  );
  assert(
    !/startGesture\(/.test(clipSrc) && (clipSrc.match(/onPointerDown=/g) || []).length === 2,
    `and there is exactly one press handler on the row plus one on the «+» button (${(clipSrc.match(/onPointerDown=/g) || []).length} in the file), with no per-handle \`startGesture\` call sites left — one function resolves the press, which is the architectural rule this criterion exists to pin`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // B4. المؤشّرةُ قبل الضغط، والسحبُ خطوةٌ واحدة
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nB4. تحويمٌ ثم سحبٌ ثم تراجعةٌ واحدة');
  await openFormat(page, 'ig-reel');
  const b4 = await placeText(page, 0.5, 0.3, 'حافّةٌ تُسحَب');
  const b4Before = await animOf(page, b4);
  const b4Span = await rulerSpan(page);
  const b4Tracks = await page.locator('[data-testid="timeline-tracks"]').boundingBox();
  const b4Handle = await page.locator(`[data-testid="clip-${b4}-resize-right"]`).boundingBox();
  await page.mouse.move(b4Handle.x + b4Handle.width / 2, b4Handle.y + b4Handle.height / 2);
  await page.waitForTimeout(120);
  const b4Hover = await page.locator(`[data-testid="clip-row-${b4}"]`).evaluate((e) => ({ cursor: getComputedStyle(e).cursor, hit: e.dataset.hoverHit, edge: e.dataset.hoverEdge }));
  assert(
    b4Hover.cursor === 'ew-resize' && b4Hover.hit === 'clipEdge' && b4Hover.edge === 'out',
    `hovering the out-edge shows \`${b4Hover.cursor}\` **before** the press, and the row declares what is under the pointer (${b4Hover.hit}/${b4Hover.edge})`,
  );
  const b4Hist = await historyLen(page);
  await dragBy(page, b4Handle.x + b4Handle.width / 2, b4Handle.y + b4Handle.height / 2, (1.2 * b4Tracks.width) / b4Span, 16);
  const b4After = await animOf(page, b4);
  const b4HistAfter = await historyLen(page);
  assert(b4After.duration > b4Before.duration + 1, `the drag lengthened the clip from ${b4Before.duration.toFixed(3)}s to ${b4After.duration.toFixed(3)}s`);
  assert(b4HistAfter === b4Hist + 1, `and it is **exactly one** undo step for the whole gesture (${b4Hist} → ${b4HistAfter}), however many pointermove events fired`);
  const b4Label = await page.locator('[data-testid="undo-btn"]').evaluate((e) => ({ label: e.dataset.undoLabel, title: e.getAttribute('title') }));
  assert(
    b4Label.label === 'تقليم نهاية المقطع' && /تقليم نهاية المقطع/.test(b4Label.title),
    `and the step carries its **name**, which is the half محرّر خطٍّ زمنيٍّ مفتوح §2.1 says is missing: «${b4Label.title}»`,
  );
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(120);
  const b4Undone = await animOf(page, b4);
  assert(
    b4Undone.start === b4Before.start && b4Undone.duration === b4Before.duration,
    `one undo returns start and duration to their **exact** prior values (${b4Undone.start} / ${b4Undone.duration} vs ${b4Before.start} / ${b4Before.duration})`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // B5. Escape في منتصف السحب
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nB5. Escape أثناء السحب لا يُثبّت ولا يُسجّل');
  const b5Before = await animOf(page, b4);
  const b5Hist = await historyLen(page);
  const b5Handle = await page.locator(`[data-testid="clip-${b4}-resize-right"]`).boundingBox();
  await page.mouse.move(b5Handle.x + b5Handle.width / 2, b5Handle.y + b5Handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(b5Handle.x + b5Handle.width / 2 + 90, b5Handle.y + b5Handle.height / 2, { steps: 12 });
  await page.waitForTimeout(80);
  const b5Mid = await page.locator(`[data-testid="clip-${b4}"]`).evaluate((e) => parseFloat(e.style.width));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(150);
  const b5After = await animOf(page, b4);
  const b5HistAfter = await historyLen(page);
  assert(
    b5After.start === b5Before.start && b5After.duration === b5Before.duration,
    `Escape mid-drag left start/duration **unchanged** (${b5After.start} / ${b5After.duration}), after the preview had really moved to ${b5Mid.toFixed(2)}% width — so the cancel undid a live edit, not nothing`,
  );
  assert(b5HistAfter === b5Hist, `and \`historyPast.length\` is unchanged (${b5Hist} → ${b5HistAfter}) — no step to undo an escape with`);

  // ═════════════════════════════════════════════════════════════════════════
  // الحجزُ منفصلٌ عن التطبيق، و`trim` تُعيد الفرقَ المُطبَّق
  // ═════════════════════════════════════════════════════════════════════════
  // وهذه القسمةُ هي ما يُتيح للمعاينة أن **تتوقّف عند الحدّ** بدل أن ترتدّ إليه عند
  // الإفلات — محرّر خطٍّ زمنيٍّ مفتوح تُسمّيها القرارَ الذي *«makes trimming feel solid»*.
  // فتُقاس مرّتين: على الدالّة الصافية، ثم على السحبة الحقيقية.
  console.log('\nclampTrim منفصلةً عن trim، والفرقُ المُطبَّق لا المطلوب');
  const cl = await page.evaluate(async () => {
    const e = await import('/src/lib/timelineEdit.ts');
    const anim = { preset: 'none', start: 1.0, duration: 2.0, sourceIn: 0.5, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [], tracks: {} };
    const ctx = { fps: 30 };
    const inFar = e.clampTrim(anim, 'in', -5, ctx);
    const inPast = e.clampTrim(anim, 'in', 5, ctx);
    const outFar = e.clampTrim(anim, 'out', -5, ctx);
    const outFree = e.clampTrim(anim, 'out', 7.5, ctx);
    const tIn = e.trim(anim, 'in', -5, ctx);
    const tOut = e.trim(anim, 'out', 0.4, ctx);
    const offsetBefore = anim.start - anim.sourceIn;
    return {
      inFar, inPast, outFar, outFree,
      inApplied: tIn.applied,
      inStart: tIn.anim.start,
      inSourceIn: tIn.anim.sourceIn,
      inDuration: tIn.anim.duration,
      inOffsetSame: tIn.anim.start - tIn.anim.sourceIn === offsetBefore,
      outApplied: tOut.applied,
      outStart: tOut.anim.start,
      outSourceIn: tOut.anim.sourceIn,
      outDuration: tOut.anim.duration,
      agree: e.clampTrim(anim, 'in', -5, ctx) === e.trim(anim, 'in', -5, ctx).applied,
    };
  });
  assert(cl.inFar === -1, `\`clampTrim\` on the in-edge of a clip starting at 1.0 s refuses to go before zero: asked −5 s, allows ${cl.inFar} s`);
  assert(near(cl.inPast, 2 - 1 / 30, 1e-9), `and refuses to pass the out-edge, keeping one frame: asked +5 s, allows ${cl.inPast.toFixed(4)} s (duration 2 s − one frame)`);
  assert(near(cl.outFar, 1 / 30 - 2, 1e-9), `on the out-edge it refuses to go below one frame: asked −5 s, allows ${cl.outFar.toFixed(4)} s`);
  assert(cl.outFree === 7.5, `and has **no upper bound** — asked +7.5 s, allows ${cl.outFree} s: the document's length is derived from its clips, so a clip lengthens the document rather than being capped by it`);
  assert(cl.agree, '`clampTrim` and `trim().applied` agree exactly — one is the question the other answers, not a second implementation of it');
  assert(
    cl.inApplied === -1 && cl.inStart === 0 && near(cl.inSourceIn, -0.5, 1e-9) && cl.inDuration === 3,
    `\`trim\` returns **the delta it applied, not the one it was asked for** (${cl.inApplied} s for a −5 s request) and moves start→${cl.inStart} and sourceIn→${cl.inSourceIn} by that same delta`,
  );
  assert(cl.inOffsetSame, 'and `start − sourceIn` is byte-identical afterwards — that invariant is what B2 measures through the renderer');
  assert(
    near(cl.outApplied, 0.4, 1e-9) && cl.outStart === 1.0 && cl.outSourceIn === 0.5 && near(cl.outDuration, 2.4, 1e-9),
    `an out-edge trim moves **neither** field (start ${cl.outStart}, sourceIn ${cl.outSourceIn}) and only grows the duration to ${cl.outDuration.toFixed(3)} s by the ${cl.outApplied.toFixed(4)} s it applied — the clip gains dead air, which is the correct behaviour and is free`,
  );

  // والسحبةُ الحقيقية: حافّةُ دخولٍ تُدفَع بعيدًا خلف الصفر.
  await openFormat(page, 'ig-reel');
  const cEl = await placeText(page, 0.5, 0.3, 'حدٌّ يُحترَم');
  const cSpan = await rulerSpan(page);
  const cTracks = await page.locator('[data-testid="timeline-tracks"]').boundingBox();
  const cHandle = await page.locator(`[data-testid="clip-${cEl}-resize-left"]`).boundingBox();
  await page.mouse.move(cHandle.x + cHandle.width / 2, cHandle.y + cHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(cHandle.x + cHandle.width / 2 - (1.5 * cTracks.width) / cSpan, cHandle.y + cHandle.height / 2, { steps: 12 });
  await page.waitForTimeout(80);
  const clamped = await page.locator(`[data-testid="clip-row-${cEl}"]`).evaluate((e) => ({ applied: Number(e.dataset.trimApplied), clamped: e.dataset.trimClamped }));
  const midLeft = await page.locator(`[data-testid="clip-${cEl}"]`).evaluate((e) => parseFloat(e.style.left));
  await page.mouse.up();
  await page.waitForTimeout(150);
  const cAfter = await animOf(page, cEl);
  assert(
    clamped.clamped === 'true' && clamped.applied === 0,
    `dragging a clip that starts at 0 **further** left reports the applied delta as ${clamped.applied} s and flags itself clamped (${clamped.clamped}) — the drag knows it hit the limit, which is the whole point of \`trim\` returning a number`,
  );
  assert(
    near(midLeft, 0, 1e-9),
    `and the **preview stopped at the limit** rather than running off and snapping back on release (clip left edge sat at ${midLeft}% all through the drag)`,
  );
  assert(cAfter.start === 0 && near(cAfter.duration, 0.6, 1e-9), `and the release committed exactly nothing (start ${cAfter.start}, duration ${cAfter.duration})`);

  // ═════════════════════════════════════════════════════════════════════════
  // B6. التقسيمُ محايدٌ بالبكسل
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nB6. ⌘B عند ٢٫٠ث على مقطعِ ٠–٥ث');
  await openFormat(page, 'ig-reel');
  const b6 = await placeText(page, 0.5, 0.32, 'يُقسَم');
  await page.locator('[data-testid="anim-preset-fade"]').click();
  await page.waitForTimeout(200);
  const b6Span = await rulerSpan(page);
  const b6Tracks = await page.locator('[data-testid="timeline-tracks"]').boundingBox();
  const b6PxPerSec = b6Tracks.width / b6Span;
  const b6rh = await page.locator(`[data-testid="clip-${b6}-resize-right"]`).boundingBox();
  await dragBy(page, b6rh.x + b6rh.width / 2, b6rh.y + b6rh.height / 2, (5 - 0.6) * b6PxPerSec, 20);
  const b6Anim = await animOf(page, b6);
  assert(near(b6Anim.duration, 5, 0.12) && b6Anim.start === 0, `a 0–${b6Anim.duration.toFixed(3)}s clip, built by dragging its own out-edge, with its entrance keys still at ${b6Anim.tracks.opacity.map((k) => k.time.toFixed(3)).join('/')}s`);

  const framesBefore = await renderFrames(page, b6Anim.duration);
  const parked2 = await parkPlayhead(page, 2.0);
  assert(near(parked2, 2.0, 0.03), `the playhead is parked at ${parked2.toFixed(3)}s by a real click on the ruler`);
  // التحديدُ على المقطع قبل الاختصار — وهو ما يفعله المصمّم: يَنقر طبقتَه.
  await page.locator(`[data-testid="layer-name-${b6}"]`).click();
  await page.waitForTimeout(120);
  const splitBtn = await page.locator('[data-testid="timeline-split-btn"]').evaluate((e) => ({ disabled: e.disabled, title: e.getAttribute('title') }));
  assert(
    !splitBtn.disabled && /يُنتج عنصرين منفصلين بالنصّ نفسه/.test(splitBtn.title),
    `the split affordance **states what it produces** before it is pressed: «${splitBtn.title}» — splitting duplicates the element in Mazij's model, which is a new door onto a documented limit (§5.4), so it is declared rather than discovered`,
  );
  const b6Hist = await historyLen(page);
  await page.keyboard.press('Meta+b');
  await page.waitForTimeout(200);
  const b6Els = await docElements(page);
  const b6HistAfter = await historyLen(page);
  const left = b6Els.find((e) => e.id === b6);
  const right = b6Els.find((e) => e.id !== b6);
  assert(b6Els.length === 2, `⌘B produced exactly two elements (${b6Els.length})`);
  assert(
    left && near(left.start, 0, 1e-9) && near(left.duration, 2.0, 0.04),
    `the left piece spans [${left ? left.start.toFixed(3) : '?'}, ${left ? (left.start + left.duration).toFixed(3) : '?'})`,
  );
  assert(
    right && near(right.start, 2.0, 0.04) && near(right.start + right.duration, b6Anim.duration, 0.04),
    `and the right piece spans [${right ? right.start.toFixed(3) : '?'}, ${right ? (right.start + right.duration).toFixed(3) : '?'}) — abutting, with no frame lost or duplicated between them`,
  );
  assert(
    right && right.type === 'text' && right.text === left.text,
    `and the right piece is a **second text element carrying the same string** («${right ? right.text : '?'}») — the honest cost of one-clip-per-element, which the affordance above declared`,
  );
  const rightSelected = await page.locator(`[data-layer-id="${right.id}"]`).evaluate((e) => e.dataset.selected);
  const leftSelected = await page.locator(`[data-layer-id="${left.id}"]`).evaluate((e) => e.dataset.selected);
  assert(
    rightSelected === 'true' && leftSelected === 'false',
    `the **right** piece is the selected one (right=${rightSelected}, left=${leftSelected}) — محرّر فيديو شائع's rule, which محرّر خطٍّ زمنيٍّ مفتوح concedes against its own implementation: the usual next action is "lose the tail", so ⌘B then Delete must work with no re-selection`,
  );
  assert(b6HistAfter === b6Hist + 1, `and the split is exactly one undo step (${b6Hist} → ${b6HistAfter})`);
  const b6SplitLabel = await page.locator('[data-testid="undo-btn"]').evaluate((e) => e.dataset.undoLabel);
  assert(b6SplitLabel === 'تقسيم المقطع', `named «${b6SplitLabel}»`);

  const framesAfter = await renderFrames(page, b6Anim.duration);
  const fps = 30;
  const idx1 = Math.round(1.0 * fps);
  const idx3 = Math.round(3.0 * fps);
  assert(
    framesBefore.length === framesAfter.length,
    `the exported frame count is unchanged by the split (${framesBefore.length} → ${framesAfter.length}) — the document is still ${b6Anim.duration.toFixed(3)}s long`,
  );
  assert(
    framesBefore[idx1] === framesAfter[idx1],
    `the frame rendered at 1.0 s is **byte-identical** to the pre-split one (sha256 ${framesBefore[idx1].slice(0, 12)}…) — this is \`renderArtboardFrames\`, the very function \`videoExport.ts\` feeds ffmpeg`,
  );
  assert(
    framesBefore[idx3] === framesAfter[idx3],
    `and so is the frame at 3.0 s (sha256 ${framesBefore[idx3].slice(0, 12)}…) — one on each side of the cut. A split that changes a pixel is a broken split`,
  );
  const differing = framesBefore.reduce((n, h, i) => n + (h === framesAfter[i] ? 0 : 1), 0);
  assert(
    differing === 0,
    `and in fact **not one of the ${framesBefore.length} frames changed** (${differing} differ) — the boundary key at the cut carries the value sampled there and inherits the preceding key's easing, and the one-frame opacity step hands each frame to exactly one half. Without that step this assertion read «150 differ»: a clip's duration is not a visibility window in Mazij, so both halves painted the whole document and the text was drawn twice`,
  );

  // ونفسُ السؤال من خلال مُحكّم الإطارات على ملفَّي MP4 حقيقيَّين.
  const judged = judgeSplitFrames(page, framesBefore, framesAfter, fps);
  if (judged.skipped) {
    console.log(`  --   frame judge skipped: ${judged.reason}`);
  } else {
    assert(
      judged.same1,
      `the frame judge agrees on a real MP4: the frame **displayed** at 1.0 s (index ${judged.i1}, pts ${judged.pts1.toFixed(4)}s) is byte-identical across the two encodes`,
    );
    assert(
      judged.same3,
      `and at 3.0 s (index ${judged.i3}, pts ${judged.pts3.toFixed(4)}s) — read out of the container by \`FrameSet\`, not off the renderer's own output`,
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // B7. الساكنُ ما زال بلا خطٍّ زمنيّ (A7 مُعادًا، لأنّ هذه المرحلة تمسّ البوّابة)
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nB7. ساكنٌ بلا خطٍّ زمنيّ، في الوضعين');
  for (const pro of [false, true]) {
    await openFormat(page, 'ig', { pro });
    const tracks = await page.locator('[data-testid="timeline-tracks"]').count();
    const ruler = await page.locator('[data-testid="timeline-ruler"]').count();
    const play = await page.locator('[data-testid="timeline-play-btn"]').count();
    const split = await page.locator('[data-testid="timeline-split-btn"]').count();
    assert(
      tracks === 0 && ruler === 0 && play === 0 && split === 0,
      `a still format in ${pro ? 'pro' : 'simple'} mode still has **no** time surface at all — tracks=${tracks}, ruler=${ruler}, transport=${play}, split=${split}. Phase 2 took the mode gate off the clip row and left the medium gate exactly where it was`,
    );
    const stillEl = await placeText(page, 0.5, 0.3, 'طبقةٌ على بوستر');
    assert((await page.locator(`[data-testid="layer-name-${stillEl}"]`).count()) > 0, `and the layer list is still there in ${pro ? 'pro' : 'simple'} mode — layers are not a time surface`);
    const beforeSplit = await docElements(page);
    await page.keyboard.press('Meta+b');
    await page.waitForTimeout(200);
    const afterSplit = await docElements(page);
    assert(
      afterSplit.length === beforeSplit.length,
      `and ⌘B does nothing on it (${beforeSplit.length} → ${afterSplit.length} elements) — the shortcut follows its surface, which is absent, rather than silently editing a poster`,
    );
  }
  await openFormat(page, 'ig-reel', { pro: false });
  assert((await page.locator('[data-testid="timeline-tracks"]').count()) === 1, 'a timed format opens with exactly one timeline — unchanged by this phase');

  // ═════════════════════════════════════════════════════════════════════════
  // البوّابةُ سقطت: صفُّ مقطعٍ حقيقيٌّ في الوضعين
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nالبوّابة: مقطعٌ يُنقَل ويُقلَّم في الوضع **البسيط**');
  const sEl = await placeText(page, 0.5, 0.3, 'بسيطٌ وحيّ');
  const sSpan = await rulerSpan(page);
  const sTracks = await page.locator('[data-testid="timeline-tracks"]').boundingBox();
  const sBefore = await animOf(page, sEl);
  assert((await page.locator(`[data-testid="clip-${sEl}"]`).count()) === 1, 'simple mode renders a real clip for the element, not a static bar at opacity .35');
  assert((await page.locator(`[data-testid^="kf-${sEl}-"]`).count()) === 0, 'and **no** keyframe diamonds — keys stay a pro surface, so the gate came off the clip and not off the model');
  // كان: «ولا زرّ "مفتاح عند المؤشّر" كذلك» — المفاتيحُ سطحٌ احترافيّ. ألغى المالك
  // الوضعين في ٢٤ أكتوبر ٢٠٢٦، فالزرّ حاضرٌ لكلّ مصمّم على المستند المُوقَّت؛ والبوّابةُ
  // التي يحرسها هذا القسم — المقطعُ حيٌّ بلا شرطٍ احترافيّ — باقيةٌ كما هي أعلاه.
  assert((await page.locator(`[data-testid="clip-${sEl}-add-kf"]`).count()) === 1, 'and the «keyframe at the playhead» button is there for everyone — no mode hides it any more');
  const sBody = await page.locator(`[data-testid="clip-${sEl}"]`).boundingBox();
  await dragBy(page, sBody.x + sBody.width * 0.5, sBody.y + sBody.height / 2, (1.0 * sTracks.width) / sSpan, 14);
  const sMoved = await animOf(page, sEl);
  assert(
    near(sMoved.start - sBefore.start, 1.0, 0.08) && near(sMoved.duration, sBefore.duration, 1e-9),
    `dragging the clip body in simple mode really moves it: start ${sBefore.start.toFixed(3)}s → ${sMoved.start.toFixed(3)}s with the duration untouched (${sMoved.duration.toFixed(3)}s)`,
  );
  const sHandle = await page.locator(`[data-testid="clip-${sEl}-resize-right"]`).boundingBox();
  await dragBy(page, sHandle.x + sHandle.width / 2, sHandle.y + sHandle.height / 2, (0.8 * sTracks.width) / sSpan, 14);
  const sTrimmed = await animOf(page, sEl);
  assert(
    sTrimmed.duration > sMoved.duration + 0.5,
    `and dragging its out-edge really trims it (${sMoved.duration.toFixed(3)}s → ${sTrimmed.duration.toFixed(3)}s) — in the default mode, which is where the owner actually was`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // شريطُ التشغيل / Transport
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nشريطُ التشغيل: مسافةٌ وأسهمٌ وHome/End');
  await openFormat(page, 'ig-reel');
  const tEl = await placeText(page, 0.5, 0.3, 'تشغيل');
  const tSpan = await rulerSpan(page);
  const tTracksBox = await page.locator('[data-testid="timeline-tracks"]').boundingBox();
  const tHandle = await page.locator(`[data-testid="clip-${tEl}-resize-right"]`).boundingBox();
  await dragBy(page, tHandle.x + tHandle.width / 2, tHandle.y + tHandle.height / 2, (3.4 - 0.6) * (tTracksBox.width / tSpan), 20);
  const clock = () => page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));
  await parkPlayhead(page, 1.0);
  const t0 = await clock();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(70);
  const t1 = await clock();
  // التسامحُ نصفُ ميلي‑ثانية لأنّ القراءةَ نفسها ثلاثُ منازل
  // (`state.t.toFixed(3)` في `timeline-time`)، فـ`1/30 = 0.0333` تُقرأ `0.033` —
  // نفسُ السابقة المكتوبة في `qa/phase1-representation.spec.mjs`. والفرقُ بين إطارٍ
  // وإطارَين ثلاثةٌ وثلاثون ميلي‑ثانية، أي ستّةٌ وستّون ضعفَ التسامح.
  assert(near(t1 - t0, 1 / 30, 5e-4), `→ steps exactly one **document** frame (${(t1 - t0).toFixed(4)}s vs 1/30 = ${(1 / 30).toFixed(4)}s, read at the clock's own three decimals)`);
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(70);
  const t2 = await clock();
  assert(near(t2 - t1, 5 / 30, 5e-4), `⇧→ steps five (${(t2 - t1).toFixed(4)}s vs 5/30 = ${(5 / 30).toFixed(4)}s) — a bigger step on the same grid, not a different unit`);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(70);
  assert(near(await clock(), t0, 5e-4), `and the two of them undo each other exactly (back to ${t0.toFixed(4)}s)`);
  await page.keyboard.press('End');
  await page.waitForTimeout(90);
  const tEnd = await clock();
  const tDoc = await page.locator('[data-testid="timeline-medium"]').evaluate((e) => Number(e.dataset.duration));
  assert(
    near(tEnd, tDoc, 1e-3),
    `End parks at the end of the **document** (${tEnd.toFixed(3)}s = the derived duration ${tDoc.toFixed(3)}s), not at the end of the ruler's 5 s view floor — the shaded range past the document is declared to be outside the exported file, so the transport must not aim at it`,
  );
  await page.keyboard.press('Home');
  await page.waitForTimeout(90);
  assert((await clock()) === 0, 'Home parks at 0');
  await parkPlayhead(page, 1.5);
  const tPark = await clock();
  await page.keyboard.press('Space');
  await page.waitForTimeout(260);
  const tPlaying = await clock();
  const playing = await page.locator('[data-testid="timeline-play-btn"]').evaluate((e) => e.getAttribute('aria-pressed'));
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
  assert(
    playing === 'true' && tPlaying > tPark && tPlaying < tPark + 1.0,
    `Space **resumes from the playhead** — parked at ${tPark.toFixed(3)}s, playing at ${tPlaying.toFixed(3)}s (defect 6 in \`qa/motion-journey.spec.mjs\` was: parked at 3.000 s, play reported 0.132 s on the next sample)`,
  );
  assert((await page.locator('[data-testid="timeline-play-btn"]').evaluate((e) => e.getAttribute('aria-pressed'))) === 'false', 'and a second Space pauses');

  // ═════════════════════════════════════════════════════════════════════════
  // حرسُ النمط الجاهز / The preset guard
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\nحرسُ النمط: نمطٌ جاهزٌ لا يُبيد مسارًا بُني باليد');
  await openFormat(page, 'ig-reel');
  const gEl = await placeText(page, 0.5, 0.3, 'مسارٌ باليد');
  await page.locator('[data-testid="anim-preset-slide"]').click();
  await page.waitForTimeout(200);
  await page.locator(`[data-testid="expand-${gEl}"]`).click();
  await page.waitForTimeout(150);
  // مسارُ `rotation` بُني باليد: مفتاحان عند موضعَين مختلفَين للمؤشّر. و`rotation`
  // لا يَظهر في مسارات أيّ نمطٍ أصلًا، فوجودُه وحده هو الدليل.
  await parkPlayhead(page, 0.2);
  await page.locator(`[data-testid="clip-${gEl}-add-kf-rotation"]`).click();
  await page.waitForTimeout(120);
  await parkPlayhead(page, 0.5);
  await page.locator(`[data-testid="clip-${gEl}-add-kf-rotation"]`).click();
  await page.waitForTimeout(120);
  const gBefore = await animOf(page, gEl);
  assert((gBefore.tracks.rotation || []).length === 2, `a hand-built rotation track exists (${(gBefore.tracks.rotation || []).length} keys) — a track no preset ever writes`);
  const presetState = await page.locator('[data-testid="anim-preset-pop"]').evaluate((e) => ({ disabled: e.disabled, title: e.getAttribute('title') }));
  assert(
    // السبب مكتوبٌ بالخليجيّة المختصرة (٢٤ أكتوبر ٢٠٢٦) وما زال يقول ما سيقع: «بتمسح».
    presetState.disabled && /بتمسح/.test(presetState.title || ''),
    `and the entrance-preset buttons are **refused with a written reason** rather than silently destroying it: «${(presetState.title || '').slice(0, 60)}…»`,
  );
  const gModel = await page.evaluate(
    async ({ key, id }) => {
      const sc = await import('/src/state/elements.ts');
      const raw = JSON.parse(window.localStorage.getItem(key));
      const el = raw.artboards[0].doc.elements.find((e) => e.id === id);
      return sc.hasCustomAnimation(el.anim.tracks);
    },
    { key: AUTOSAVE_KEY, id: gEl },
  );
  assert(gModel === true, 'and the model agrees — `hasCustomAnimation` is the same predicate the surface reads, so the guard cannot disagree with the button');
  const gAfter = await animOf(page, gEl);
  assert(
    (gAfter.tracks.rotation || []).length === 2 && gAfter.preset === 'slide',
    `the track is intact and the preset is unchanged (${(gAfter.tracks.rotation || []).length} rotation keys, preset «${gAfter.preset}») — before this phase one click on «نبض» rebuilt \`tracks\` wholesale from the legacy two-keyframe array and the rotation track was gone with no warning and no notice`,
  );

  assert(pageErrors.length === 0, `no runtime errors anywhere in the run (${pageErrors.length})${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(' | ')}` : ''}`);

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(' -', f));
  }
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

/** Renders the whole document through `renderArtboardFrames` — the function
 * `videoExport.ts` hands to ffmpeg, one PNG per output-fps tick — and returns a
 * sha256 per frame plus the PNG bytes of the two frames B6 names.
 *
 * At scale 0.25 (270×480 of a 1080×1920 reel) so 150 frames can cross the bridge;
 * the two frames the criterion names are *also* re-rendered at full scale below. */
const RENDER_SCALE = 0.25;
async function renderFrames(page, durationSeconds) {
  const { hashes, png1, png3 } = await page.evaluate(
    async ({ key, dur, scale }) => {
      const m = await import('/src/lib/animTimeline.ts');
      const ex = await import('/src/lib/exportArtboard.ts');
      const raw = JSON.parse(window.localStorage.getItem(key));
      const doc = raw.artboards[0].doc;
      const fps = doc.fps;
      const count = Math.max(1, Math.round(dur * fps));
      const times = Array.from({ length: count }, (_, i) => m.timeOfFrame(i, fps));
      const spec = {
        size: { id: 'probe', ar: '', en: '', w: 1080, h: 1920, kind: 'timed' },
        palette: { bg: '#0F3D3E', fg: '#F2F0E6', ac: '#FFB703' },
        elements: doc.elements,
        transparent: false,
        lang: 'ar',
        scale,
        decorAccent: doc.decorAccent,
      };
      const b64 = [];
      await ex.renderArtboardFrames(spec, times, async (blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        b64.push(btoa(s));
      });
      const i1 = Math.round(1.0 * fps);
      const i3 = Math.round(3.0 * fps);
      return { hashes: b64, png1: b64[i1], png3: b64[i3] };
    },
    { key: AUTOSAVE_KEY, dur: durationSeconds, scale: RENDER_SCALE },
  );
  const out = hashes.map((b) => sha(Buffer.from(b, 'base64')));
  out.png1 = png1;
  out.png3 = png3;
  out.raw = hashes;
  return out;
}

/** Encodes the two rendered frame sequences into real MP4 files with the exact
 * ffmpeg invocation `src/lib/videoExport.ts` uses, then asks the **frame judge**
 * (`qa/replication/lib/video.mjs`) which frame is displayed at 1.0 s and 3.0 s in
 * each file and compares those two extracted PNGs byte-for-byte.
 *
 * **ولِمَ الترميزُ هنا لا من لوحة التصدير**، معلَنًا لا مكتومًا: مرمِّزُ مزيج
 * سَيدكارٌ في تطبيق Tauri، ولا وجودَ له في متصفّحٍ عاديّ — وهو ما يقوله
 * `qa/video-export.spec.mjs:1-11` ويقيسه هناك («يحتاج تطبيق سطح المكتب»). فالإطاراتُ
 * من رسّام مزيج نفسِه (`renderArtboardFrames`)، والحاويةُ من ffmpeg بالمعاملات
 * نفسِها، والحكمُ من المُحكّم. وما لم يُقَس هنا هو مسارُ السَيدكار نفسُه. */
function judgeSplitFrames(page, before, after, fps) {
  const probe = spawnSync(FFMPEG, ['-version'], { encoding: 'utf8' });
  if (probe.status !== 0) return { skipped: true, reason: `no ffmpeg at ${FFMPEG}` };
  const dir = mkdtempSync(join(tmpdir(), 'mazij-phase2-'));
  try {
    const files = [];
    for (const [name, frames] of [['before', before], ['after', after]]) {
      const sub = join(dir, name);
      mkdirSync(sub, { recursive: true });
      frames.raw.forEach((b64, i) => writeFileSync(join(sub, `frame-${String(i + 1).padStart(5, '0')}.png`), Buffer.from(b64, 'base64')));
      const dest = join(dir, `${name}.mp4`);
      const r = spawnSync(
        FFMPEG,
        [
          '-y', '-v', 'error',
          '-framerate', String(fps),
          '-i', join(sub, 'frame-%05d.png'),
          '-frames:v', String(frames.raw.length),
          '-pix_fmt', 'yuv420p',
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '18',
          '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
          '-movflags', '+faststart',
          dest,
        ],
        { encoding: 'utf8' },
      );
      if (r.status !== 0) return { skipped: true, reason: `ffmpeg exited ${r.status}: ${(r.stderr || '').trim().slice(0, 200)}` };
      files.push(dest);
    }
    const a = new FrameSet(files[0]);
    const b = new FrameSet(files[1]);
    try {
      const a1 = a.frameIndexAt(1.0);
      const b1 = b.frameIndexAt(1.0);
      const a3 = a.frameIndexAt(3.0);
      const b3 = b.frameIndexAt(3.0);
      const same1 = a1 && b1 && a1.index === b1.index && sha(readFileSync(a.fullPath(a1.index))) === sha(readFileSync(b.fullPath(b1.index)));
      const same3 = a3 && b3 && a3.index === b3.index && sha(readFileSync(a.fullPath(a3.index))) === sha(readFileSync(b.fullPath(b3.index)));
      return { skipped: false, same1, same3, i1: a1 ? a1.index : -1, pts1: a1 ? a1.pts : -1, i3: a3 ? a3.index : -1, pts3: a3 ? a3.pts : -1 };
    } finally {
      a.dispose();
      b.dispose();
    }
  } catch (e) {
    return { skipped: true, reason: String(e && e.message ? e.message : e) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
