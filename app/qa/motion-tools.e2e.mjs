#!/usr/bin/env node
// **أدواتُ الحركة عبر MCP — على التطبيق الحقيقيّ (٢٩ أكتوبر ٢٠٢٦).**
// يُشغَّل والتطبيقُ مفتوحٌ على المحرّر والربطُ مُفعَّل: node qa/motion-tools.e2e.mjs
// يُصفّر المستندَ الحاليّ، فلا يُشغَّل على مشروعٍ تريد إبقاءه.
// يتحقّق من: تحويلِ البكسل إلى الكسر في المفاتيح، والتعبئةِ الدائريّة، والعدّاد، والجُسيمات،
// والتتابع، ومراجعِ `$N` في الدُّفعة، وانتظارِ التصدير الطويل، و**نقطتَي الياء الأخيرة في
// النصّ المتدرّج داخل الملفّ المُصدَّر** (علّةُ WebKit التي كانت تجعل «في» «فى»).
import { call } from '../scripts/mcp-call.mjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

let pass = 0;
let fail = 0;
const ok = (c, m) => (c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('FAIL:', m)));
const near = (a, b, e = 1e-4) => Math.abs(a - b) < e;

function project() {
  const dir = join(homedir(), 'Library/Application Support/studio.mazij.app');
  const id = JSON.parse(readFileSync(join(dir, 'current.json'), 'utf8')).id;
  return JSON.parse(readFileSync(join(dir, 'projects', `${id}.json`), 'utf8'));
}
function findEl(doc, id) {
  let hit = null;
  const walk = (v) => {
    if (hit || !v || typeof v !== 'object') return;
    if (v.id === id && v.type) hit = v;
    else for (const x of Object.values(v)) walk(x);
  };
  walk(doc);
  return hit;
}
const settle = () => new Promise((r) => setTimeout(r, 2500)); // الحفظُ التلقائيّ

const tools = (await import('../scripts/mcp-call.mjs')).rpc;
const list = (await tools('tools/list', {})).tools.map((t) => t.name);
for (const t of ['element_animate', 'element_set_fill', 'element_set_look', 'text_set_stagger', 'text_set_counter', 'text_set_spacing', 'effect_particle_burst', 'batch', 'element_set_glass', 'group_camera', 'templates_render_png', 'fonts_add_from_path']) ok(list.includes(t), `الأداة ${t} معروضة`);

await call('document_new', { sizeId: 'yt-video' });
const W = 1920;

// ١. element_animate — بكسل → كسر، والتوقيت والحدّ
const sh = await call('element_add_shape', { shape: 'rect', x: 100, y: 100, w: 200, h: 200 });
const a = await call('element_animate', { id: sh.id, start: 1.5, duration: 2, bounded: true, tracks: { x: [{ t: 0, v: 192 }, { t: 1, v: 0, easing: 'back' }], blur: [{ t: 0, v: 19.2 }, { t: 0.5, v: 0 }], opacity: [{ t: 0, v: 0 }, { t: 0.4, v: 1 }] } });
ok(a.start === 1.5 && near(a.duration, 2) && a.bounded === true, 'توقيتُ المقطع وحدُّه');
ok(['x', 'blur', 'opacity'].every((k) => a.tracks.includes(k)), 'المساراتُ الثلاثة مكتوبة');

// ٢. تعبئةٌ دائريّة
await call('element_set_fill', { id: sh.id, kind: 'radial', from: '#ff0000', to: '#0000ff00' });

// ٣. نصٌّ متدرّج + عدّاد + تتابع + تباعد
const tx = await call('element_add_text', { text: 'x', x: 200, y: 400, w: 1500, h: 300, fontSize: 120, fontFamily: "'Readex Pro'" });
await call('element_set_text_style', { id: tx.id, halign: 'center', valign: 'middle' });
const c = await call('text_set_counter', { id: tx.id, from: 0, to: 45708, prefix: '$', duration: 1 });
ok(c.counter.to === 45708, 'العدّادُ مضبوط');
const st = await call('text_set_stagger', { id: tx.id, unit: 'word', effect: 'blur', stagger: 0.1 });
ok(st.textAnim.enabled && st.textAnim.effect === 'blur' && st.textAnim.unit === 'word', 'التتابعُ مُفعَّل');
await call('text_set_spacing', { id: tx.id, tracking: -2, lineHeight: 1.4 });

// ٤. جُسيمات
const pb = await call('effect_particle_burst', { cx: 960, cy: 540, count: 24, start: 0.5 });
ok(pb.ids.length === 24 && typeof pb.groupId === 'string', '٢٤ جُسيمًا في مجموعةٍ واحدة');

// ٥. دفعةٌ بمراجع $0
const b = await call('batch', {
  calls: [
    { tool: 'element_add_text', args: { text: 'في تطبيقٍ واحد', x: 160, y: 700, w: 1600, h: 300, fontSize: 100, fontFamily: "'Readex Pro'" } },
    { tool: 'element_set_text_style', args: { id: '$0', halign: 'center', valign: 'middle', color: '#000000' } },
    { tool: 'element_set_fill', args: { id: '$0', kind: 'linear', from: '#ff00aa', to: '#7700ff', angle: 90 } },
    { tool: 'element_set_look', args: { id: '$0', name: 'عنوانٌ متدرّج', pivot: { x: 0.5, y: 1 } } },
  ],
});
ok(b.ok && b.results.length === 4, 'الدفعةُ نفّذت أربعةَ نداءات بمرجع $0');
const bad = await call('batch', { calls: [{ tool: 'element_set_look', args: { id: '$5' } }] });
ok(bad.ok === false && bad.failedAt === 0, 'مرجعٌ غيرُ موجودٍ يُبلَّغ بلا تنفيذ');

// ٦. الزجاج والكاميرا والقوالب والخطوط
const gl = await call('element_set_glass', { id: tx.id, mode: 'tube', colors: ['#ff2d87', '#ff6a2b'], rim: '#7f8cff', core: '#ff7a1f' });
ok(gl.glass?.mode === 'tube', 'خامةُ الزجاج على النصّ');
const cam = await call('group_camera', { ids: [sh.id], keys: [{ t: 1.5, zoom: 1 }, { t: 2.5, zoom: 3 }] });
ok(cam.moved === 1, 'حركةُ الكاميرا كُتبت في مفاتيح العنصر');
const rnd = await call('templates_render_png', { ids: ['demo-poster'] });
ok(rnd.renders?.length === 1 && rnd.renders[0].path.endsWith('demo-poster.png'), 'قالبٌ جاهز صُدِّر صورةً');
const fontFile = join(homedir(), 'Mazij/Fonts/test-arabic-bold.ttf');
let fontOk = true;
try { statSync(fontFile); } catch { fontOk = false; }
if (fontOk) {
  const f1 = await call('fonts_add_from_path', { path: fontFile });
  const f2 = await call('fonts_add_from_path', { path: fontFile });
  ok(typeof f1.family === 'string' && f2.family === f1.family && f2.reused === true, 'الخطُّ يُضاف مرّةً ويُعاد استعمالُه بلا تكرار');
}

await settle();
const doc = project();
const se = findEl(doc, sh.id);
ok(se && near(se.anim.tracks.x[0].value, 192 / W) && near(se.anim.tracks.blur[0].value, 19.2 / W), 'x وblur خُزّنا كسرًا من عرض اللوحة');
ok(se && se.anim.tracks.x[0].easing === 'easeOut' && se.anim.tracks.x[1].easing === 'back', 'التسهيلُ لكلّ مفتاح');
ok(se && se.appearance?.fills?.[0]?.gradientType === 'radial', 'التعبئةُ دائريّة في المستند');
const te = findEl(doc, tx.id);
ok(te && te.counter?.prefix === '$' && te.text === '$45,708', 'نصُّ العدّاد المخزونُ قيمةُ النهاية');
ok(te && te.tracking === -2 && te.lineHeight === 1.4, 'التتبّعُ وتباعدُ الأسطر');
const ge = findEl(doc, b.results[0].id);
ok(ge && ge.name === 'عنوانٌ متدرّج' && ge.pivot?.y === 1, 'الاسمُ والارتكاز');
ok(te && te.glass?.mode === 'tube', 'الزجاجُ محفوظٌ في المستند');
ok(se && se.anim.tracks.scale.length > 20 && Math.abs(se.anim.tracks.scale[se.anim.tracks.scale.length - 1].value - 3) < 0.05, 'الكاميرا: المقياسُ يبلغ ٣ في آخر المقطع');

// ٦. التصدير — PNG، ونقطتا الياء في «في» المتدرّجة
const exportsDir = join(homedir(), 'Mazij/Exports');
const before = new Set(readdirSync(exportsDir));
// النصُّ المتدرّج وحده: نُخفي ما سواه بحذفه، لأنّ القياس على عمود الياء.
for (const id of [sh.id, tx.id, ...pb.ids]) await call('element_delete', { id });
await call('document_set_background', { color: '#ffffff' });
const ex = await call('export_run', { targets: ['yt-video'], format: 'png', timeoutSec: 120 });
ok(ex.state === 'done', 'التصديرُ اكتمل');
const out = readdirSync(exportsDir).filter((f) => !before.has(f) && f.endsWith('.png')).map((f) => join(exportsDir, f)).sort((p, q) => statSync(q).mtimeMs - statSync(p).mtimeMs)[0];
ok(!!out, 'ملفُّ PNG جديد');
if (out) {
  // تحت خطّ القاعدة في عمود «في» (أقصى يمين النصّ الموسَّط) لا بدّ من بكسلاتٍ ملوّنة: النقطتان.
  const [W2, H2] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out]).toString().trim().split(',').map(Number);
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', out, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 << 20 });
  const dark = (x, y) => {
    const i = (y * W2 + x) * 3;
    return raw[i] + raw[i + 1] + raw[i + 2] < 600;
  };
  const lowest = (x0, x1) => {
    let lo = -1;
    for (let y = Math.round(H2 * 0.62); y < H2; y++) for (let x = x0; x < x1; x += 2) if (dark(x, y)) { lo = y; break; }
    return lo;
  };
  const right = lowest(Math.round(W2 * 0.62), Math.round(W2 * 0.9));
  const mid = lowest(Math.round(W2 * 0.3), Math.round(W2 * 0.6));
  ok(right > 0 && mid > 0, `النصُّ مرسوم (أدنى صفّ: «في» ${right}، «تطبيق» ${mid})`);
  // نقطتا الياء تنزلان تحت قاعدة السطر إلى قرب ذيل القاف؛ بدونهما يقف أدنى «في» فوقه بكثير.
  ok(right >= mid - (25 * H2) / 1080, 'نقطتا الياء الأخيرة ظاهرتان في الملفّ المُصدَّر');
}

console.log(`\nmotion-tools.e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
