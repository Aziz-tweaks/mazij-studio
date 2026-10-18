#!/usr/bin/env node
// Covers roadmap items #7 + #19 (merged in docs/ROADMAP-PROGRESS.md): a template
// separates *structure* from *content*. #7 is named, fillable slots (text/image/
// color) on a saved design; #19 is the montage structure (clip timing, per-property
// keyframe tracks, curves, text-stagger sequencing) saved separately from content and
// replayable onto different content. Scope under test:
// (1) the pure functions in src/lib/templates.ts — fillTemplate only overwrites
//     slotted content and leaves unfilled slots/untouched elements byte-identical;
//     extractMotionStructure/applyMotionStructure replay a motion structure onto a
//     *different* element list (different ids/count/content), matched by kind+rank;
// (2) the real UI: marking elements as slots, saving a template, filling it and
//     applying it to the live document (content changes, unfilled slots keep their
//     original content, one undo step restores the prior document);
// (3) "apply motion only" on the real timeline: a structural change made after saving
//     (a manually added keyframe) is reverted by re-applying the saved motion
//     structure, proven by the real keyframe count in the DOM, not a reimplementation;
// (4) loss-less behavior for pre-feature state: no `mazij.templates.v1` key at all
//     (every app build before this feature) loads to an empty library without
//     crashing, and a legacy autosave document still loads and the feature still
//     works on top of it.
//
// Run: node qa/templates.spec.mjs   (dev server must be running on :1420)
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';
// NOTE (video branch, phase 1): this spec drives surfaces that exist only on a
// **timed** document — the timeline's ruler/clips, the transport, the video tool, or
// MP4/GIF in the export dialog. The demo poster is 1080×1080, i.e. `SIZES[0]`, whose
// `kind` is `'still'`, so it now opens without them: `DocSnapshot.medium` gates three
// surfaces, which is the whole point of the phase — the start screen already asked
// "image or video?" and the answer finally reaches the workspace instead of a badge.
// `bootDemoTimed` opens the same demo document and then picks a timed destination
// from the real artboard size menu, which is both the gesture a designer performs and
// the reversibility `HomeScreen.tsx` promised when it declined a two-button gate.
// See `qa/helpers/boot.mjs`.
import { bootDemoTimed, openDemoDocument, resumeAfterReload, switchToTimed } from './helpers/boot.mjs';

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

// --- 1. Pure functions, real module, no reimplementation ----------------------
async function testPureFunctions(page) {
  const result = await page.evaluate(async () => {
    const mod = await import('/src/lib/templates.ts');

    const baseAnim = (start, v0, v1) => ({
      preset: 'none',
      start,
      duration: 1,
      easing: 'linear',
      bezier: [0, 0, 1, 1],
      keyframes: [],
      tracks: { opacity: [{ id: 'a', t: 0, value: v0, easing: 'linear', bezier: [0, 0, 1, 1] }, { id: 'b', t: 1, value: v1, easing: 'linear', bezier: [0, 0, 1, 1] }] },
    });
    const textEl = (id, text, anim) => ({ id, type: 'text', visible: true, locked: false, opacity: 100, maskId: null, geo: { x: 0, y: 0, w: 1, h: 1, rotation: 0 }, text, fontFamily: 'Alexandria', fontSize: 40, weight: 'bold', color: null, halign: 'start', valign: 'top', anim, textAnim: { enabled: false, unit: 'char', direction: 'start', stagger: 0.04, unitDuration: 0.35, effect: 'fade', easing: 'easeOut', bezier: [0.2, 0, 0, 1] } });
    const imageEl = (id, src, anim) => ({ id, type: 'image', visible: true, locked: false, opacity: 100, maskId: null, geo: { x: 0, y: 0, w: 1, h: 1, rotation: 0 }, src, fit: 'cover', cropX: 0.5, cropY: 0.5, cropScale: 1, flipH: false, flipV: false, radius: 0, stroke: null, strokeWidth: 0, naturalW: 100, naturalH: 100, anim });
    const shapeEl = (id, fill, anim) => ({ id, type: 'shape', visible: true, locked: false, opacity: 100, maskId: null, geo: { x: 0, y: 0, w: 1, h: 1, rotation: 0 }, shape: 'rect', fill, fillToken: 'ac', stroke: null, strokeWidth: 0, radius: 0, anim });

    // --- fillTemplate: text + image + color slots, one left unfilled.
    const elements = [textEl('headline', 'Original headline', baseAnim(0, 0, 1)), imageEl('photo', 'orig.png', baseAnim(0.2, 0, 1)), shapeEl('bg', '#111111', baseAnim(0, 1, 1))];
    const slots = [
      { id: 'slot-text', elementId: 'headline', kind: 'text', label: 'Headline' },
      { id: 'slot-img', elementId: 'photo', kind: 'image', label: 'Photo' },
      { id: 'slot-color', elementId: 'bg', kind: 'color', label: 'Background' },
    ];
    const tpl = mod.createTemplate('T', elements, slots, 0, 1080, 1080);
    const filled = mod.fillTemplate(tpl, { 'slot-text': { kind: 'text', text: 'New headline' }, 'slot-color': { kind: 'color', hex: '#ff00ff' } });

    const fText = filled.find((e) => e.id === 'headline');
    const fImg = filled.find((e) => e.id === 'photo');
    const fBg = filled.find((e) => e.id === 'bg');

    // --- extractMotionStructure / applyMotionStructure: replay onto a DIFFERENT
    // element list (different ids, different count/content) matched by kind+rank.
    const sourceMotionEls = [textEl('a', 'A', baseAnim(0, 0, 1)), textEl('b', 'B', baseAnim(2, 0.3, 0.9)), shapeEl('c', '#000', baseAnim(1, 1, 1))];
    const motion = mod.extractMotionStructure(sourceMotionEls);
    const targetEls = [
      textEl('x1', 'Target one', baseAnim(9, 9, 9)),
      textEl('x2', 'Target two', baseAnim(9, 9, 9)),
      textEl('x3', 'Target three (no matching role)', baseAnim(9, 9, 9)),
      shapeEl('y1', '#222', baseAnim(9, 9, 9)),
    ];
    const applied = mod.applyMotionStructure(motion, targetEls);
    const x1 = applied.find((e) => e.id === 'x1');
    const x2 = applied.find((e) => e.id === 'x2');
    const x3 = applied.find((e) => e.id === 'x3');
    const y1 = applied.find((e) => e.id === 'y1');

    return {
      fText: { text: fText.text, start: fText.anim.start },
      fImg: { src: fImg.src },
      fBg: { fill: fBg.fill },
      x1Start: x1.anim.start,
      x2Start: x2.anim.start,
      x2Opacity0: x2.anim.tracks.opacity[0].value,
      x3Start: x3.anim.start,
      x3Text: x3.text,
      y1Start: y1.anim.start,
      x1Text: x1.text,
    };
  });

  assert(result.fText.text === 'New headline', `fillTemplate: filled text slot overwrites content (got ${result.fText.text})`);
  assert(result.fText.start === 0, 'fillTemplate: filling content leaves the element\'s own motion/geometry untouched');
  assert(result.fImg.src === 'orig.png', 'fillTemplate: an unfilled slot keeps the template\'s original content (image left blank in fills)');
  assert(result.fBg.fill === '#ff00ff', `fillTemplate: filled color slot overwrites the shape fill (got ${result.fBg.fill})`);

  assert(result.x1Start === 0, `applyMotionStructure: 1st target text gets the 1st source text's motion by rank (start=${result.x1Start}, expected 0)`);
  assert(result.x2Start === 2, `applyMotionStructure: 2nd target text gets the 2nd source text's motion by rank (start=${result.x2Start}, expected 2)`);
  assert(Math.abs(result.x2Opacity0 - 0.3) < 1e-9, `applyMotionStructure: the 2nd text's own track values (not just start) were replayed (got ${result.x2Opacity0}, expected 0.3)`);
  assert(result.x3Start === 9, `applyMotionStructure: a target element with no corresponding source role (3rd text, source only had 2) is left untouched (start=${result.x3Start}, expected unchanged 9)`);
  assert(result.x3Text === 'Target three (no matching role)', 'applyMotionStructure: content is never touched by a motion-only apply');
  assert(result.x1Text === 'Target one', 'applyMotionStructure: content is never touched by a motion-only apply (1st element too)');
  assert(result.y1Start === 1, `applyMotionStructure: shape role matched independently of the text roles (start=${result.y1Start}, expected 1)`);
}

// --- 2. Storage: missing-file/first-run behaves like an empty library ---------
async function testStoreDefaultsEmpty(page) {
  const result = await page.evaluate(async () => {
    window.localStorage.removeItem('mazij.templates.v1');
    const mod = await import('/src/lib/templatesStore.ts');
    const list = await mod.loadTemplates();
    return { isArray: Array.isArray(list), length: list.length };
  });
  assert(result.isArray && result.length === 0, 'templatesStore: no saved library (pre-feature/first run) loads as an empty array, never throws');
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  await bootDemoTimed(page, BASE_URL);

  await testPureFunctions(page);
  await testStoreDefaultsEmpty(page);

  // Clean slate for the UI flows: no autosave, no saved templates.
  await page.evaluate(() => {
    window.localStorage.removeItem('mazij.autosave.v1');
    window.localStorage.removeItem('mazij.templates.v1');
  });
  await page.reload();
  // This reload deliberately follows an autosave *clear*, so there is nothing to
  // resume — the clean slate is the point. The demo document is therefore
  // re-opened from the templates section rather than resumed, keeping this
  // block's precondition exactly what it always was: the 7-element poster, an
  // empty template library, and no autosave behind it.
  await openDemoDocument(page);
  await switchToTimed(page);

  // --- 3. Real UI: mark slots, save, fill, apply, undo ------------------------
  const originalHead = await page.locator('[data-el-id="head"]').innerText();

  await page.locator('[data-testid="open-templates-btn"]').click();
  await page.waitForTimeout(100);
  assert(await page.locator('[data-testid="templates-dialog"]').isVisible(), 'UI: Templates dialog opens from the TopBar button');
  assert((await page.locator('[data-testid^="slot-row-"]').count()) === 7, 'UI: the slot builder lists every real document element (7 in the default doc)');

  await page.locator('[data-testid="slot-kind-head"]').selectOption('text');
  await page.locator('[data-testid="slot-label-head"]').fill('Headline');
  await page.locator('[data-testid="template-name-input"]').fill('Sale template');
  await page.locator('[data-testid="save-template-btn"]').click();
  await page.waitForTimeout(100);

  const rowCount = await page.locator('[data-testid^="template-row-"]').count();
  assert(rowCount === 1, `UI: saving adds exactly one row to the real template library (got ${rowCount})`);
  const tplId = (await page.locator('[data-testid^="template-row-"]').first().getAttribute('data-testid')).replace('template-row-', '');
  const slotCountText = await page.locator(`[data-testid="template-row-${tplId}"]`).innerText();
  assert(slotCountText.includes('1'), `UI: the saved template reports exactly 1 slot (row text: ${JSON.stringify(slotCountText)})`);

  await page.locator(`[data-testid="open-fill-${tplId}"]`).click();
  await page.waitForTimeout(100);
  assert(await page.locator('[data-testid="template-fill-form"]').isVisible(), 'UI: opening "fill & apply" shows the fill form');
  assert((await page.locator('[data-testid^="fill-input-"]').count()) === 1, 'UI: the fill form has exactly one input, matching the one slot');
  await page.locator('[data-testid^="fill-input-"]').first().fill('خصم العيد ٧٠٪');
  await page.locator('[data-testid="apply-fill-btn"]').click();
  await page.waitForTimeout(150);

  assert(!(await page.locator('[data-testid="templates-dialog"]').isVisible()), 'UI: applying a fill closes the dialog back to the editor');
  const headAfterFill = await page.locator('[data-el-id="head"]').innerText();
  assert(headAfterFill === 'خصم العيد ٧٠٪', `UI: the real headline element now shows the filled text (got ${JSON.stringify(headAfterFill)})`);
  assert(headAfterFill !== originalHead, 'UI: the filled text actually differs from the original (not a no-op)');

  // 'img' had no slot marked — fillTemplate must have kept it at the template's
  // captured content (still the placeholder), not blanked or duplicated.
  const imgSrc = await page.locator('[data-el-id="img"] img, [data-el-id="img"]').first().evaluate((el) => el.getAttribute('src'));
  assert(imgSrc === null || imgSrc === '', 'UI: an un-slotted image element is untouched by applying the template (still the original placeholder, no stray src)');

  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await page.waitForTimeout(150);
  const headAfterUndo = await page.locator('[data-el-id="head"]').innerText();
  assert(headAfterUndo === originalHead, `UI: one single undo restores the headline to its pre-fill text (got ${JSON.stringify(headAfterUndo)})`);

  // --- 4. "Apply motion only" replays the saved montage structure -------------
  await page.getByRole('button', { name: 'احترافي' }).click();
  await page.waitForTimeout(150);
  await page.locator('[data-el-id="head"]').click();
  await page.waitForTimeout(100);

  const kfCountBefore = await page.locator('[data-testid^="kf-head-"]').count();
  assert(kfCountBefore === 2, `setup: head's opacity track starts with its normal 2 keyframes (got ${kfCountBefore})`);

  const ruler = page.locator('[data-testid="timeline-ruler"]');
  const rb = await ruler.boundingBox();
  await page.mouse.click(rb.x + rb.width * 0.12, rb.y + rb.height / 2); // mid-clip (start 0.3, dur 0.6)
  await page.waitForTimeout(100);
  await page.locator('[data-testid="clip-head-add-kf"]').click();
  await page.waitForTimeout(100);
  const kfCountAfterManualEdit = await page.locator('[data-testid^="kf-head-"]').count();
  assert(kfCountAfterManualEdit === kfCountBefore + 1, `setup: manually adding a keyframe via the real timeline UI grows the track by one (got ${kfCountAfterManualEdit})`);

  await page.locator('[data-testid="open-templates-btn"]').click();
  await page.waitForTimeout(100);
  await page.locator(`[data-testid="apply-motion-${tplId}"]`).click();
  await page.waitForTimeout(150);
  await page.locator('[data-testid="close-templates-btn"]').click();
  await page.waitForTimeout(100);

  const kfCountAfterApply = await page.locator('[data-testid^="kf-head-"]').count();
  assert(kfCountAfterApply === kfCountBefore, `UI: "apply motion only" replays the saved template's exact keyframe structure, undoing the manual edit (got ${kfCountAfterApply}, expected ${kfCountBefore})`);
  const headTextAfterMotionApply = await page.locator('[data-el-id="head"]').innerText();
  assert(headTextAfterMotionApply === originalHead, 'UI: "apply motion only" never touches content — the headline text is still the current document\'s own text');

  // --- 5. Delete from the library -----------------------------------------------
  await page.locator('[data-testid="open-templates-btn"]').click();
  await page.waitForTimeout(100);
  await page.locator(`[data-testid="delete-template-${tplId}"]`).click();
  await page.waitForTimeout(100);
  assert((await page.locator('[data-testid^="template-row-"]').count()) === 0, 'UI: deleting the only saved template empties the library list');
  await page.locator('[data-testid="close-templates-btn"]').click();

  // --- 6. Loss-less migration: a legacy autosave (pre-templates-feature shape,
  // i.e. the normal DocSnapshot format every prior round already used — templates
  // were never part of it) loads cleanly, and the new feature still works on top.
  const legacyDoc = {
    elements: [
      { id: 'legacy-text', type: 'text', visible: true, locked: false, opacity: 100, maskId: null, geo: { x: 0.1, y: 0.1, w: 0.5, h: 0.2, rotation: 0 }, text: 'Legacy document text', fontFamily: 'Alexandria', fontSize: 40, weight: 'bold', color: null, halign: 'start', valign: 'top', anim: { preset: 'fade', start: 0, duration: 1, easing: 'linear', bezier: [0, 0, 1, 1], keyframes: [{ id: 'k0', t: 0, v: 0 }, { id: 'k1', t: 1, v: 1 }] } },
    ],
    anim: 'fade',
    sizeIdx: 0,
    customW: 1080,
    customH: 1080,
  };
  await page.evaluate((doc) => {
    window.localStorage.setItem('mazij.autosave.v1', JSON.stringify(doc));
    window.localStorage.removeItem('mazij.templates.v1'); // no template library ever existed for this "old" install
  }, legacyDoc);
  await page.reload();
  await resumeAfterReload(page); // reload now lands on the start screen; re-enter through the resume card
  await page.waitForSelector('[data-el-id="legacy-text"]');

  const legacyPageErrors = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', (e) => legacyPageErrors.push(e.message));

  await page.locator('[data-testid="open-templates-btn"]').click();
  await page.waitForTimeout(100);
  assert((await page.locator('[data-testid^="template-row-"]').count()) === 0, 'migration: a legacy document with no template library file opens to an empty (not crashed) template library');
  await page.locator('[data-testid="slot-kind-legacy-text"]').selectOption('text');
  await page.locator('[data-testid="template-name-input"]').fill('From legacy doc');
  await page.locator('[data-testid="save-template-btn"]').click();
  await page.waitForTimeout(100);
  assert((await page.locator('[data-testid^="template-row-"]').count()) === 1, 'migration: the templates feature works normally on top of a pre-feature legacy document (save succeeds)');
  assert(legacyPageErrors.length === 0, `migration: no runtime errors loading/using templates on a legacy document (${JSON.stringify(legacyPageErrors)})`);

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
