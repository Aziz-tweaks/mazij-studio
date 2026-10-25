#!/usr/bin/env node
// **طبقةُ الصوت: الراوي والموسيقى — ٢٥ أكتوبر ٢٠٢٦.**
//
// المقطعُ المطلوب نسخُه نصفُه صوت: راوٍ تتبعه الكلماتُ على الشاشة، وموسيقى تحته. وكان زرُّ
// «صوت» في شريط الإضافة «قريبًا»، وصوتُ الفيديو `volume`/`muted` محفوظَين بلا أثرٍ في معاينةٍ
// ولا تصدير. فصار:
//
//   ١. **طبقةُ صوت** تُستورَد من لوح «صوت» (أو بالإفلات) فتبدأ **عند المؤشّر**، وصفُّها في
//      الخطّ الزمنيّ بموجته يُنقَل ويُقصّ كأيّ مقطع؛ علوُّها وكتمُها في لوح الخصائص.
//   ٢. **تُسمَع في المعاينة** مزامَنةً مع ساعة المشروع، **وتُخلَط في MP4** بمرشّح FFmpeg
//      مبنيٍّ من الخطّة نفسها (`audioMixPlan`) — ويُقاس هنا بتشغيل FFmpeg الحقيقيّ على الأمر
//      نفسه وفكّ صوته وقياسِ علوّه نافذةً نافذة.
//   ٣. **والفيديو يبدأ من أوّله حيث يبدأ مقطعُه** — كان يُشغَّل بزمن المستند، فمقطعٌ عند
//      الثانية الأولى يبدأ من ثانية الملف الأولى.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bootBlank, resumeAfterReload, AUTOSAVE_KEY } from './helpers/boot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:1420';
const SIDECAR = path.join(__dirname, '..', 'src-tauri', 'binaries', 'ffmpeg-aarch64-apple-darwin');
const FFMPEG = process.env.FFMPEG || (fs.existsSync(SIDECAR) ? SIDECAR : 'ffmpeg');
const VIDEO_FIXTURE = path.join(__dirname, 'fixtures', 'video-element-ground-truth.mp4');

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
const isMac = process.platform === 'darwin';
const MOD = isMac ? 'Meta' : 'Control';

/** ملفُّ WAV أحاديّ ١٦ بت — يُبنى هنا بالبايت، فلا ملفَّ ثنائيَّ في المستودع ولا حقوق. */
function wav(seconds, sr, fn) {
  const n = Math.round(seconds * sr);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, fn(i / sr))) * 32767), 44 + i * 2);
  return buf;
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mazij-audio-qa-'));
const TONE = path.join(TMP, 'tone.wav');
const BED = path.join(TMP, 'bed.wav');
// «tone»: ثلاث ثوانٍ، صمتٌ ثم نغمةُ ٤٤٠ هرتز بسعة ٠٫٨ من الثانية ١ إلى ٢ ثم صمت.
fs.writeFileSync(TONE, wav(3, 44100, (t) => (t >= 1 && t < 2 ? 0.8 * Math.sin(2 * Math.PI * 440 * t) : 0)));
// «bed»: أربع ثوانٍ من ٢٢٠ هرتز بسعة ٠٫٣ — موسيقى تحت الراوي.
fs.writeFileSync(BED, wav(4, 44100, (t) => 0.3 * Math.sin(2 * Math.PI * 220 * t)));

async function doc(page) {
  await page.waitForTimeout(900);
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).artboards[0].doc, AUTOSAVE_KEY);
}
const historyLen = (page) => page.locator('[data-testid="undo-btn"]').evaluate((e) => Number(e.dataset.historyPast));
const playheadT = (page) => page.locator('[data-testid="timeline-time"]').evaluate((e) => Number(e.dataset.t));

async function parkAtFrame(page, frame) {
  const rb = await page.locator('[data-testid="timeline-ruler"]').boundingBox();
  await page.mouse.click(rb.x + rb.width * 0.93, rb.y + rb.height / 2);
  await page.keyboard.press('Home');
  for (let i = 0; i < Math.floor(frame / 5); i++) await page.keyboard.press('Shift+ArrowRight');
  for (let i = 0; i < frame % 5; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  return playheadT(page);
}

async function typeTiming(page, which, seconds) {
  const f = page.locator(`[data-testid="timing-${which}"]`);
  await f.click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.type(String(seconds));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
}

/** «صوت» ← «أضف ملف صوت» ← منتقي الملفّات — الطريقُ الذي يسلكه المصمّم. */
async function addAudioViaPanel(page, file) {
  await page.locator('[data-tool="audio"]').click();
  await page.waitForSelector('[data-testid="audio-library"]');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-testid="audio-add"]').click()]);
  await chooser.setFiles(file);
  await page.waitForTimeout(900);
}

/** فكُّ صوت ملفٍّ إلى عيّناتٍ عائمةٍ أحاديّة ٤٨ ك.هـ، وقياسُ الجذر التربيعيّ لمتوسّط المربّعات في نافذة. */
function decodePcm(file) {
  const run = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`ffmpeg decode failed: ${run.stderr?.toString().slice(-500)}`);
  const b = run.stdout;
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
}
const rms = (pcm, a, b) => {
  const i0 = Math.floor(a * 48000);
  const i1 = Math.min(pcm.length, Math.floor(b * 48000));
  let s = 0;
  for (let i = i0; i < i1; i++) s += pcm[i] * pcm[i];
  return i1 > i0 ? Math.sqrt(s / (i1 - i0)) : 0;
};

async function main() {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootBlank(page, BASE_URL, 'ig-reel');

  // ═══════════════ ١. الاستيراد من لوح «صوت»: عند المؤشّر ═══════════════
  await page.locator('[data-tool="audio"]').click();
  await page.waitForTimeout(150);
  assert((await page.locator('[data-testid="audio-library"]').count()) === 1 && (await page.locator('[data-testid="library-soon-audio"]').count()) === 0, 'زرُّ «صوت» يفتح لوحًا حقيقيًّا — لا «قريبًا»');
  await parkAtFrame(page, 15);
  const h0 = await historyLen(page);
  await addAudioViaPanel(page, TONE);
  const d1 = await doc(page);
  const tone = d1.elements.find((e) => e.type === 'audio');
  assert(!!tone && tone.name === 'tone' && Math.abs(tone.anim.start - 0.5) < 1e-9 && Math.abs(tone.anim.duration - 3) < 1e-9 && Math.abs(tone.durationSec - 3) < 0.01, `طبقةُ صوتٍ باسم ملفّها تبدأ عند المؤشّر (٠٫٥ث) وطولُها طولُ الملف (${tone && JSON.stringify({ name: tone.name, start: tone.anim.start, duration: tone.anim.duration, file: tone.durationSec })})`);
  assert((await historyLen(page)) === h0 + 1, 'الاستيرادُ خطوةُ تراجعٍ واحدة');
  assert(d1.elements[0].id === tone.id, 'وتُوضَع تحت كلّ الطبقات — صفُّها في أسفل الخطّ الزمنيّ');
  assert((await page.locator(`[data-testid="audio-props-${tone.id}"]`).count()) === 1, 'وتُحدَّد فيظهر لوحُها: الطول والعلوّ والكتم');
  assert((await page.locator(`[data-el-id="${tone.id}"]`).count()) === 0 && (await page.locator('[data-testid="selection-handles"]').count()) === 0, 'ولا شيءَ لها على اللوحة: لا عقدةَ ولا مقابض');
  assert((await page.locator(`[data-testid="audio-item-${tone.id}"]`).count()) === 1, 'وتظهر في «الصوت في المشروع» في اللوح');

  // الموجة على المقطع، من الملف نفسه.
  await page.waitForFunction(() => document.querySelector('[data-testid="audio-clip-face"]')?.getAttribute('data-has-wave') === 'true', null, { timeout: 8000 }).catch(() => {});
  const wave = await page.evaluate(async (id) => {
    const p = await import('/src/lib/audioPeaks.ts');
    const raw = JSON.parse(window.localStorage.getItem('mazij.autosave.v1')).artboards[0].doc.elements.find((e) => e.id === id);
    const peaks = await p.loadAudioPeaks(raw.src);
    const at = (s) => Math.max(...Array.from(peaks.slice(Math.floor(s * 100), Math.floor(s * 100) + 10)));
    const face = document.querySelector('[data-testid="audio-clip-face"]');
    return { quiet: at(0.4), loud: at(1.5), after: at(2.5), hasWave: face?.getAttribute('data-has-wave'), d: face?.querySelector('path')?.getAttribute('d')?.length ?? 0 };
  }, tone.id);
  assert(wave.hasWave === 'true' && wave.d > 100, `مقطعُ الصوت في الخطّ الزمنيّ يحمل موجتَه (${wave.d} حرفًا من المسار)`);
  assert(wave.quiet < 0.02 && wave.loud > 0.7 && wave.after < 0.02, `والموجةُ هي الملف: صمتٌ عند ٠٫٤ث (${wave.quiet.toFixed(3)})، ونغمةٌ عند ١٫٥ث (${wave.loud.toFixed(3)})، وصمتٌ عند ٢٫٥ث (${wave.after.toFixed(3)})`);

  // ═══════════════ ٢. الموضعُ المسموع: الدالّة الواحدة ═══════════════
  const media = await page.evaluate(async (el) => {
    const m = await import('/src/lib/audioMix.ts');
    const at = await import('/src/lib/animTimeline.ts');
    const v = (t) => m.mediaTimeAt(el, t);
    const video = { id: 'v', type: 'video', visible: true, muted: false, volume: 1, src: 'data:video/mp4;base64,AA', trimIn: 1, trimOut: 3, loop: false, anim: { start: 2, duration: 1, sourceIn: 0, tracks: {} } };
    return {
      audio: [v(0.4), v(0.5), v(1.7), v(3.49), v(3.5)],
      docEnd: at.documentDuration([el.anim], 30),
      video: [m.mediaTimeAt(video, 1.9), m.mediaTimeAt(video, 2), m.mediaTimeAt(video, 3.5), m.mediaTimeAt(video, 4.1)],
      loopVideo: m.mediaTimeAt({ ...video, loop: true }, 4.5),
    };
  }, tone);
  assert(media.audio[0] === null && Math.abs(media.audio[1]) < 1e-9 && Math.abs(media.audio[2] - 1.2) < 1e-9 && Math.abs(media.audio[3] - 2.99) < 1e-6 && media.audio[4] === null, `ما يُسمَع: لا شيء قبل ٠٫٥ث، وأوّلُ الملف عنده، و١٫٢ عند ١٫٧ث، ولا شيء من ٣٫٥ث (${JSON.stringify(media.audio)})`);
  assert(Math.abs(media.docEnd - 3.5) < 1e-6, `وطولُ المستند يشمل الصوت: ${media.docEnd}ث`);
  assert(media.video[0] === null && Math.abs(media.video[1] - 1) < 1e-9 && Math.abs(media.video[2] - 2.5) < 1e-9 && media.video[3] === null, `والفيديو من أوّل نافذته حيث يبدأ مقطعُه، ويسكت حين تنتهي بلا تكرار (${JSON.stringify(media.video)})`);
  assert(Math.abs(media.loopVideo - 1.5) < 1e-9, 'والمكرَّرُ يعود إلى أوّل نافذته');

  // ═══════════════ ٣. التوقيت والعلوّ والكتم من لوح الخصائص ═══════════════
  await typeTiming(page, 'start', 1);
  await typeTiming(page, 'end', 3);
  const vol = page.locator(`[data-testid="audio-volume-${tone.id}"]`);
  const h1 = await historyLen(page);
  await vol.fill('50');
  await vol.blur();
  await page.waitForTimeout(150);
  const h2 = await historyLen(page);
  await page.locator(`[data-testid="audio-mute-${tone.id}"]`).click();
  await page.waitForTimeout(150);
  const d2 = await doc(page);
  const tone2 = d2.elements.find((e) => e.id === tone.id);
  assert(Math.abs(tone2.anim.start - 1) < 1e-9 && Math.abs(tone2.anim.duration - 2) < 1e-9 && Math.abs((tone2.anim.sourceIn ?? 0)) < 1e-9, `«البداية» تنقله إلى ١ث و«النهاية» تقصّ ذيله عند ٣ث (طوله ٢) — وأوّلُ الملف باقٍ (${JSON.stringify([tone2.anim.start, tone2.anim.duration, tone2.anim.sourceIn])})`);
  assert(Math.abs(tone2.volume - 0.5) < 1e-9 && h2 - h1 === 1, `شريطُ العلوّ: ٥٠٪، بخطوة تراجعٍ واحدة (${h2 - h1})`);
  assert(tone2.muted === true, 'والكتمُ يُكتَب');
  await page.locator(`[data-testid="audio-mute-${tone.id}"]`).click();
  await page.waitForTimeout(150);

  // ═══════════════ ٤. المعاينة تسمع: <audio> يعمل في مقطعه ويقف خارجه ═══════════════
  // الموسيقى: المؤشّرُ عند الصفر، فتبدأ عنده.
  await parkAtFrame(page, 0);
  await addAudioViaPanel(page, BED);
  const d3 = await doc(page);
  const bed = d3.elements.find((e) => e.type === 'audio' && e.name === 'bed');
  assert(!!bed && Math.abs(bed.anim.start) < 1e-9 && Math.abs(bed.anim.duration - 4) < 1e-9, 'صوتٌ ثانٍ عند الصفر طولُه أربعُ ثوانٍ');
  await parkAtFrame(page, 0);
  await page.keyboard.press('Space');
  await page.waitForTimeout(350);
  const early = await page.evaluate((id) => {
    const a = document.querySelector(`[data-audio-for="${id}"]`);
    return a ? { paused: a.paused } : null;
  }, tone.id);
  await page.waitForTimeout(1500);
  const mid = await page.evaluate((id) => {
    const a = document.querySelector(`[data-audio-for="${id}"]`);
    const t = Number(document.querySelector('[data-testid="timeline-time"]').dataset.t);
    return a ? { paused: a.paused, cur: a.currentTime, vol: a.volume, t } : null;
  }, tone.id);
  const bedPlaying = await page.evaluate((id) => !document.querySelector(`[data-audio-for="${id}"]`)?.paused, bed?.id);
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  const stopped = await page.evaluate((id) => document.querySelector(`[data-audio-for="${id}"]`)?.paused, tone.id);
  assert(early && early.paused, 'قبل بداية مقطعه (المؤشّرُ دون ١ث) صوتُه صامت');
  assert(mid && !mid.paused && Math.abs(mid.cur - (mid.t - 1)) < 0.3 && Math.abs(mid.vol - 0.5) < 1e-6, `وفي مقطعه يعمل عند موضعه وبعلوّه: الملفُّ عند ${mid?.cur.toFixed(2)}ث والمؤشّرُ عند ${mid?.t.toFixed(2)}ث (المتوقَّع ${(mid?.t - 1).toFixed(2)})، والعلوّ ${mid?.vol}`);
  assert(bedPlaying, 'والموسيقى تحته تعمل معه');
  assert(stopped === true, 'والإيقافُ يُسكت الصوت');

  // ═══════════════ ٥. التصدير: مرشّحُ الخلط على FFmpeg الحقيقيّ ═══════════════
  const d4 = await doc(page);
  const plan = await page.evaluate(async (elements) => {
    const m = await import('/src/lib/audioMix.ts');
    const at = await import('/src/lib/animTimeline.ts');
    const total = at.documentDuration(elements.map((e) => e.anim), 30);
    const p = m.audioMixPlan(elements, total);
    const f = m.audioMixFilter(p.segments);
    return { total, names: p.inputs.map((e) => e.name), segments: p.segments, filter: f?.filter, out: f?.out };
  }, d4.elements);
  const toneSeg = plan.segments.find((s) => s.elementId === tone.id);
  assert(toneSeg && Math.abs(toneSeg.at - 1) < 1e-9 && Math.abs(toneSeg.from) < 1e-9 && Math.abs(toneSeg.length - 2) < 1e-9 && Math.abs(toneSeg.gain - 0.5) < 1e-9, `خطّةُ الخلط: «tone» من لحظة ١ث، من أوّل ملفّه، طوالَ ٢ث، بعلوّ ٥٠٪ (${JSON.stringify(toneSeg)})`);
  assert(/amix=inputs=2:normalize=0/.test(plan.filter ?? ''), `والمصدران يُخلطان بلا تطبيع: ${plan.filter}`);
  const out = path.join(TMP, 'mix.mp4');
  const inputs = plan.names.flatMap((n) => ['-i', n === 'tone' ? TONE : BED]);
  const run = spawnSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=64x64:r=30:d=${plan.total}`, ...inputs, '-filter_complex', plan.filter, '-map', '0:v', '-map', plan.out, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', String(plan.total), out], { encoding: 'buffer' });
  assert(run.status === 0, `FFmpeg يقبل المرشّح كما تبنيه مزيج (${run.stderr?.toString().slice(-300)})`);
  if (run.status === 0) {
    const pcm = decodePcm(out);
    const before = rms(pcm, 0.1, 0.9);
    const silentPart = rms(pcm, 1.15, 1.85);
    const toneOn = rms(pcm, 2.15, 2.85);
    const after = rms(pcm, 3.15, 3.85);
    const bedOnly = 0.3 / Math.SQRT2;
    const toneOnly = (0.8 * 0.5) / Math.SQRT2;
    const both = Math.hypot(bedOnly, toneOnly);
    assert(Math.abs(before - bedOnly) / bedOnly < 0.15 && Math.abs(silentPart - bedOnly) / bedOnly < 0.15, `قبل النغمة الموسيقى وحدها بعلوّها: ${before.toFixed(3)} و${silentPart.toFixed(3)} (المتوقَّع ${bedOnly.toFixed(3)})`);
    assert(Math.abs(toneOn - both) / both < 0.15, `والنغمةُ تدخل عند ٢ث بالضبط — ثانيةُ ملفّها الأولى بعد بدايته عند ١ث — بنصف علوّها فوق الموسيقى: ${toneOn.toFixed(3)} (المتوقَّع ${both.toFixed(3)}؛ ولو طُبِّع الخلطُ لكان ${(both / 2).toFixed(3)})`);
    assert(Math.abs(after - bedOnly) / bedOnly < 0.15, `وتنقطع عند نهاية مقطعها (٣ث) ولو بقي في ملفّها شيء: ${after.toFixed(3)}`);
  }

  // ═══════════════ ٦. الفيديو من أوّله حيث يبدأ مقطعُه ═══════════════
  const b64 = fs.readFileSync(VIDEO_FIXTURE).toString('base64');
  await page.evaluate(async ({ base64 }) => {
    const res = await fetch(`data:video/mp4;base64,${base64}`);
    const file = new File([await res.blob()], 'clip.mp4', { type: 'video/mp4' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const target = document.querySelector('[data-testid="artboard"]');
    const rect = target.getBoundingClientRect();
    const clientX = rect.left + rect.width * 0.5;
    const clientY = rect.top + rect.height * 0.5;
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
  }, { base64: b64 });
  await page.waitForTimeout(1500);
  const d5 = await doc(page);
  const vid = d5.elements.find((e) => e.type === 'video');
  await page.locator(`[data-testid="layer-name-${vid.id}"]`).click();
  await typeTiming(page, 'start', 1);
  await parkAtFrame(page, 45);
  await page.waitForTimeout(700);
  const vidTime = await page.evaluate((id) => document.querySelector(`[data-el-id="${id}"] video`)?.currentTime, vid.id);
  assert(Math.abs(vidTime - 0.5) < 0.12, `المعاينة: فيديو مقطعُه يبدأ عند ١ث يعرض ثانيةَ ملفّه ٠٫٥ عند ١٫٥ث (${vidTime})`);
  const d6 = await doc(page);
  const px = await page.evaluate(async ({ elements, id }) => {
    const ex = await import('/src/lib/exportArtboard.ts');
    const el = elements.find((e) => e.id === id);
    const blob = await ex.renderArtboardPng({ size: { id: 'p', ar: '', en: '', w: 1080, h: 1920, kind: 'timed' }, palette: { bg: '#000000', fg: '#ffffff', ac: '#ffb703' }, elements: [el], transparent: false, lang: 'ar', scale: 0.25, decorAccent: false, time: 1.5 });
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    const x = Math.round((el.geo.x + el.geo.w / 2) * bmp.width);
    const y = Math.round((el.geo.y + el.geo.h / 2) * bmp.height);
    const d = g.getImageData(x, y, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  }, { elements: d6.elements, id: vid.id });
  assert(px.r > 150 && px.g < 100 && px.b < 100, `والتصدير كذلك: الأحمرُ (ثانيةُ الملف الأولى) عند ١٫٥ث لا الأخضر (ثانيته الثانية) — ${JSON.stringify(px)}`);

  // ═══════════════ ٧. الحفظ ═══════════════
  await page.waitForTimeout(1300);
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.waitForTimeout(500);
  const d7 = await doc(page);
  const tone3 = d7.elements.find((e) => e.id === tone.id);
  assert(tone3 && tone3.src === tone2.src && Math.abs(tone3.volume - 0.5) < 1e-9 && tone3.muted === false && Math.abs(tone3.anim.start - 1) < 1e-9, 'الصوتُ يبقى بعد إعادة التحميل: ملفُّه وعلوُّه وتوقيتُه');

  assert(pageErrors.length === 0, `لا أخطاءَ في الصفحة: ${JSON.stringify(pageErrors)}`);
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail) {
    for (const f of failures) console.error('  ↳ FAILED:', f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
