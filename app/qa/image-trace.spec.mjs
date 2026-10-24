#!/usr/bin/env node
// **تتبُّع الصورة إلى متجهات — ٢٥ أكتوبر ٢٠٢٦.**
//
// طلب المالك بعد اختبار النسخ اليدويّ: «نقدر نضيف سكربت نفس اللي سويته اعتمادًا على
// النموذج المحلي بالكامل، من اني اعطيك الصوره وتطلع نفس المخرج». فصار في مزيج نفسه:
// المحرّك `src/lib/imageTrace.ts` (بكسلاتٌ ← مسارات، حسابٌ هندسيّ بلا شبكة)، والجسر
// `src/lib/imageTraceDoc.ts` (ما يظهر من الصورة في إطارها ← عناصرُ في مكانها)، والفعل
// `traceImage` في `StudioContext.tsx` بأبوابه الأربعة.
//
// **المقياس**: تطابقُ الألوان بكسلًا ببكسل — كلّ بكسلٍ يُنسب إلى أقرب ألوان الرسم
// الحقيقيّة (أو «شفّاف»)، ويُعدّ ما اتّفق فيه الأصل والنتيجة. والصور المقيسة **تُرسم
// هنا في المتصفّح بلوح Canvas** — رسمٌ اصطناعيّ أصليّ — فلا صورةَ خارجيّة في المستودع.
//
//   ١. المحرّك على صورتين (خلفيّة بيضاء، وشفّافة): الألوان بالضبط، والتطابق ≥ ٩٩٫٥٪،
//      والأشكال كما يرسمها مصمّم — الدائرة ٤ نقاط عند أطرافها، المثلّث ٣ زوايا بلا
//      مقابض، النجمة ١٠، المستطيل المدوَّر ٨، والخطّ الرفيع ≤ ٨ (كان ٨١: داخلُه صار
//      «خلفيّة» لأن لا بكسل واثقًا فيه، فتسنّن محيطه) — والحلقة على الشفافيّة مسارٌ
//      مركّب بثقبٍ معاكس الالتفاف، والنتيجة نفسها في كلّ مرّة.
//   ٢. الوضع في المستند (دالّة محضة): صورةٌ مقصوصةٌ ومكبَّرةٌ ومقلوبةٌ ومُدارة — كلّ
//      نقطةٍ ومقبض يقعان حيث يرسمهما المُصيِّر بالمعادلة نفسها.
//   ٣. الواجهة كما يستعملها مصمّم: إسقاط صورة ← زرّ «تتبّع إلى متجهات» ← مجموعةٌ محدَّدة
//      بألوان الصورة، والصورة مخفيّة لا محذوفة، وخطوة تراجعٍ واحدة — والمستند بالمُصيِّر
//      الحقيقيّ يطابق الصورة ≥ ٩٩٪.
//   ٤. صورةٌ مُدارةٌ ومقلوبةٌ ومكبَّرة داخل إطارها، من الشريط السياقيّ: التطابق ≥ ٩٨٫٥٪.
//   ٥. الأبواب الأخرى: قائمة الزرّ الأيمن، لوحة الأوامر (ولا يظهر الأمر بلا صورةٍ ظاهرة)،
//      ومِزو المحلّي «حوّل الصورة لمتجهات».
//   ٦. القطعة المتتبَّعة تُحرَّر نقطةً نقطة بأداة التحديد المباشر — داخل مجموعتها.
import { chromium } from 'playwright';
import { bootBlank, resumeAfterReload, AUTOSAVE_KEY } from './helpers/boot.mjs';

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

const isMac = process.platform === 'darwin';
const MOD = isMac ? 'Meta' : 'Control';

// ألوان الرسم الحقيقيّة — ما يجب أن تخرج به الأشكال بالضبط.
const TRUTH = { white: '#ffffff', navy: '#14213d', green: '#0a7846', orange: '#f08c1e', red: '#dc2832', purple: '#783caa' };

/** أدوات القياس داخل الصفحة: رسمُ الصورتين، ورسمُ نتيجة التتبّع، وعدُّ التطابق. تُثبَّت
 * بعد كلّ تحميلٍ للصفحة. */
async function installHelpers(page) {
  await page.evaluate((TRUTH) => {
    const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    window.__tq = {
      TRUTH,
      draw(transparent) {
        const W = 800;
        const H = 600;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d');
        if (!transparent) {
          g.fillStyle = TRUTH.white;
          g.fillRect(0, 0, W, H);
        }
        g.fillStyle = TRUTH.navy; // مستطيلٌ مدوَّر
        g.beginPath();
        g.roundRect(60, 60, 360, 110, 40);
        g.fill();
        g.fillStyle = TRUTH.green; // مثلّث
        g.beginPath();
        g.moveTo(250, 220);
        g.lineTo(420, 520);
        g.lineTo(80, 520);
        g.closePath();
        g.fill();
        g.fillStyle = TRUTH.orange; // حلقة: ثقبُها خلفيّةٌ (أو فراغ)
        g.beginPath();
        g.arc(610, 190, 130, 0, Math.PI * 2);
        g.arc(610, 190, 70, 0, Math.PI * 2, true);
        g.fill();
        g.fillStyle = TRUTH.red; // قرصٌ داخل الثقب
        g.beginPath();
        g.arc(610, 190, 25, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = TRUTH.purple; // نجمة خماسيّة
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 45 : 110;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const x = 600 + r * Math.cos(a);
          const y = 450 + r * Math.sin(a);
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.closePath();
        g.fill();
        g.strokeStyle = TRUTH.navy; // خطٌّ رفيعٌ مائل (٤ بكسلات)
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(450, 565);
        g.lineTo(760, 590);
        g.stroke();
        return { width: W, height: H, data: g.getImageData(0, 0, W, H).data, dataUrl: c.toDataURL('image/png') };
      },
      /** يرسم نتيجة `traceImage` كما هي (بلا مستند): محيطاتٌ بمقابضها، nonzero. */
      render(res) {
        const c = document.createElement('canvas');
        c.width = res.width;
        c.height = res.height;
        const g = c.getContext('2d');
        if (res.background) {
          g.fillStyle = res.background;
          g.fillRect(0, 0, res.width, res.height);
        }
        for (const sh of res.shapes) {
          const p = new Path2D();
          for (const cont of sh.contours) {
            p.moveTo(cont[0].x, cont[0].y);
            for (let i = 0; i < cont.length; i++) {
              const a = cont[i];
              const b = cont[(i + 1) % cont.length];
              if (a.out || b.in) p.bezierCurveTo(a.x + (a.out ? a.out.x : 0), a.y + (a.out ? a.out.y : 0), b.x + (b.in ? b.in.x : 0), b.y + (b.in ? b.in.y : 0), b.x, b.y);
              else p.lineTo(b.x, b.y);
            }
            p.closePath();
          }
          g.fillStyle = sh.color;
          g.fill(p, 'nonzero');
        }
        return g.getImageData(0, 0, res.width, res.height).data;
      },
      /** نسبة البكسلات التي اتّفق لونها (أقرب ألوان الرسم، أو «شفّاف»). `union` = لا
       * يُعدّ إلا ما هو معتمٌ في أحدهما على الأقلّ — فلا يُضخِّم الفراغُ المشترك النسبة. */
      agreement(A, B, colors, union = false) {
        const P = colors.map(hexRgb);
        const cls = (d, i) => {
          if (d[i + 3] < 128) return -1;
          let best = 0;
          let bd = Infinity;
          for (let k = 0; k < P.length; k++) {
            const dr = d[i] - P[k][0];
            const dg = d[i + 1] - P[k][1];
            const db = d[i + 2] - P[k][2];
            const v = dr * dr + dg * dg + db * db;
            if (v < bd) {
              bd = v;
              best = k;
            }
          }
          return best;
        };
        let same = 0;
        let total = 0;
        for (let i = 0; i < A.length; i += 4) {
          if (union && A[i + 3] < 128 && B[i + 3] < 128) continue;
          total++;
          if (cls(A, i) === cls(B, i)) same++;
        }
        return total ? (100 * same) / total : 0;
      },
    };
  }, TRUTH);
}

/** المستند كما حفظه البرنامج بنفسه (اللوحة النشطة) — قراءةٌ لا كتابة. */
async function readDoc(page) {
  return page.evaluate((key) => {
    const raw = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (!raw) return null;
    const ab = raw.artboards ? (raw.artboards.find((a) => a.id === raw.activeArtboardId) ?? raw.artboards[0]) : null;
    return ab ? ab.doc : raw;
  }, AUTOSAVE_KEY);
}
async function waitDoc(page, pred, timeout = 30000) {
  const t0 = Date.now();
  for (;;) {
    const d = await readDoc(page);
    if (d && pred(d)) return d;
    if (Date.now() - t0 > timeout) return d;
    await page.waitForTimeout(200);
  }
}
const history = (page) => page.evaluate(() => Number(document.querySelector('[data-testid="undo-btn"]')?.getAttribute('data-history-past') ?? -1));

/** الصورة (ظاهرةً) والعناصر المتتبَّعة، كلٌّ وحده بالمُصيِّر الحقيقيّ (`renderArtboardPng`)،
 * ثم التطابق على ما هو معتمٌ في أحدهما. */
async function renderAgreement(page, doc, imageId, tracedIds) {
  return page.evaluate(
    async ({ doc, imageId, tracedIds }) => {
      const mod = await import('/src/lib/exportArtboard.ts');
      const { sizeAt } = await import('/src/data/constants.ts');
      const size = sizeAt(doc.sizeIdx, doc.customW, doc.customH);
      const palette = { bg: '#000000', fg: '#ffffff', ac: '#ffb703' };
      async function px(elements) {
        const blob = await mod.renderArtboardPng({ size, palette, elements, transparent: true, lang: 'ar', scale: 2, decorAccent: false });
        const bmp = await createImageBitmap(blob);
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const g = c.getContext('2d');
        g.drawImage(bmp, 0, 0);
        return g.getImageData(0, 0, bmp.width, bmp.height).data;
      }
      const img = doc.elements.find((e) => e.id === imageId);
      const A = await px([{ ...img, visible: true }]);
      const B = await px(doc.elements.filter((e) => tracedIds.includes(e.id)));
      return window.__tq.agreement(A, B, Object.values(window.__tq.TRUTH), true);
    },
    { doc, imageId, tracedIds },
  );
}

async function dropFixture(page) {
  const before = await page.locator('[data-testid="artboard"] [data-el-id]').count();
  await page.evaluate(async () => {
    const { dataUrl } = window.__tq.draw(false);
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'shapes.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const target = document.querySelector('[data-testid="artboard"]');
    const r = target.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    target.dispatchEvent(new DragEvent('dragover', o));
    target.dispatchEvent(new DragEvent('drop', o));
  });
  await page.waitForTimeout(300);
  return (await page.locator('[data-testid="artboard"] [data-el-id]').count()) === before + 1;
}

/** بعد تتبّعٍ ناجح: الصورة مخفيّة، والجديد كلّه بعدها مباشرةً في مجموعةٍ واحدة. */
function tracedOf(doc, imageId) {
  const at = doc.elements.findIndex((e) => e.id === imageId);
  const img = doc.elements[at];
  const after = doc.elements.slice(at + 1).filter((e) => e.id.startsWith('trace-'));
  return { img, traced: after };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await bootBlank(page, BASE_URL, 'ig');
  await installHelpers(page);

  // ═════════════════════════ ١. المحرّك ═════════════════════════
  console.log('\n١. المحرّك على صورتين اصطناعيّتين');
  const eng = await page.evaluate(async () => {
    const { traceImage } = await import('/src/lib/imageTrace.ts');
    const T = window.__tq;
    const out = {};
    for (const transparent of [false, true]) {
      const fx = T.draw(transparent);
      const t0 = performance.now();
      const res = traceImage({ width: fx.width, height: fx.height, data: fx.data });
      const ms = performance.now() - t0;
      const again = traceImage({ width: fx.width, height: fx.height, data: fx.data });
      const key = (r) => JSON.stringify({ s: r.shapes, p: r.palette, b: r.background });
      const colors = Object.values(T.TRUTH).filter((c) => !transparent || c !== T.TRUTH.white);
      const area = (c) => c.reduce((s, a, i) => s + a.x * c[(i + 1) % c.length].y - c[(i + 1) % c.length].x * a.y, 0) / 2;
      out[transparent ? 'clear' : 'white'] = {
        agree: T.agreement(fx.data, T.render(res), colors),
        ms,
        same: key(res) === key(again),
        palette: res.palette,
        background: res.background,
        anchors: res.stats.anchors,
        shapes: res.shapes.map((s) => ({
          color: s.color,
          counts: s.contours.map((c) => c.length),
          smooth: s.contours[0].filter((a) => a.in || a.out).length,
          signs: s.contours.map((c) => Math.sign(area(c))),
          bbox: s.bbox,
        })),
      };
    }
    return out;
  });
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const close = (a, b) => rgb(a).every((v, i) => Math.abs(v - rgb(b)[i]) <= 2);
  for (const which of ['white', 'clear']) {
    const r = eng[which];
    const want = Object.values(TRUTH).filter((c) => which === 'white' || c !== TRUTH.white);
    const tag = which === 'white' ? 'على الأبيض' : 'على الشفافيّة';
    assert(want.every((c) => r.palette.some((p) => close(p, c))) && r.palette.length === want.length, `${tag}: الألوان هي ألوان الرسم بالضبط (${r.palette.join(' ')})`);
    assert(r.agree >= 99.5, `${tag}: تطابق الألوان بكسلًا ببكسل ${r.agree.toFixed(3)}٪ (≥ ٩٩٫٥)`);
    assert(r.same, `${tag}: النتيجة نفسها في كلّ مرّة`);
    const pick = (hex, pred = () => true) => r.shapes.filter((s) => close(s.color, hex) && pred(s));
    const tri = pick(TRUTH.green)[0];
    assert(tri && tri.counts[0] === 3 && tri.smooth === 0, `${tag}: المثلّث ٣ زوايا بلا مقابض (${tri && tri.counts})`);
    const star = pick(TRUTH.purple)[0];
    assert(star && star.counts[0] === 10 && star.smooth === 0, `${tag}: النجمة ١٠ زوايا (${star && star.counts})`);
    const dot = pick(TRUTH.red)[0];
    assert(dot && dot.counts[0] === 4 && dot.smooth === 4, `${tag}: القرص ٤ نقاطٍ ناعمة (${dot && dot.counts})`);
    const rect = pick(TRUTH.navy, (s) => s.bbox.h > 80)[0];
    assert(rect && rect.counts[0] === 8, `${tag}: المستطيل المدوَّر ٨ نقاط: ٤ أضلاع و٤ أقواس (${rect && rect.counts})`);
    const line = pick(TRUTH.navy, (s) => s.bbox.h < 40)[0];
    assert(line && line.counts[0] <= 8, `${tag}: الخطّ الرفيع ${line && line.counts} نقاط (≤ ٨؛ كان ٨١)`);
    const ring = pick(TRUTH.orange)[0];
    if (which === 'white') {
      assert(ring && ring.counts.length === 1 && ring.counts[0] === 4, `${tag}: الحلقة دائرةٌ بأربع نقاط، وثقبُها قطعةٌ بيضاء فوقها (${ring && ring.counts})`);
      assert(r.background && close(r.background, TRUTH.white), `${tag}: الخلفيّة مستطيلٌ واحد بلونها (${r.background})`);
    } else {
      assert(ring && ring.counts.length === 2 && ring.signs[0] === -ring.signs[1], `${tag}: الحلقة مسارٌ مركّب: محيطٌ وثقبٌ معاكس الالتفاف (${ring && ring.counts}، ${ring && ring.signs})`);
      assert(r.background === null, `${tag}: لا خلفيّة تُرسَم حيث الفراغ`);
    }
    assert(r.anchors <= 60, `${tag}: ${r.anchors} نقطةً للرسم كلّه (≤ ٦٠)`);
    console.log(`     (${tag}: ${r.ms.toFixed(0)} مللي ثانية)`);
  }

  // ═════════════════════════ ٢. الوضع في المستند ═════════════════════════
  console.log('\n٢. الوضع في المستند: قصّ وتكبير وقلب ودوران');
  const place = await page.evaluate(async () => {
    const { placementFor, tracedElements } = await import('/src/lib/imageTraceDoc.ts');
    const { computeImageCropLayout } = await import('/src/lib/imageCrop.ts');
    const art = { w: 1000, h: 800 };
    const natural = { w: 640, h: 480 };
    const el = { geo: { x: 0.12, y: 0.2, w: 0.5, h: 0.45, rotation: 30 }, fit: 'cover', cropX: 0.35, cropY: 0.6, cropScale: 1.5, flipH: true, flipV: false };
    const P = placementFor(el, art, natural);
    const { rw, rh, src, placement } = P;
    // المرجع: سلسلة المُصيِّر نفسها (exportArtboard.ts) — موضعُ بكسل الملفّ (u,v) على اللوحة.
    const bw = el.geo.w * art.w;
    const bh = el.geo.h * art.h;
    const L = computeImageCropLayout({ w: bw, h: bh }, natural, el.fit, el.cropX, el.cropY, el.cropScale);
    const t = (el.geo.rotation * Math.PI) / 180;
    const onArt = (fx, fy) => {
      const x = el.flipH ? bw - fx : fx;
      const y = el.flipV ? bh - fy : fy;
      const dx = x - bw / 2;
      const dy = y - bh / 2;
      return { x: el.geo.x * art.w + bw / 2 + dx * Math.cos(t) - dy * Math.sin(t), y: el.geo.y * art.h + bh / 2 + dx * Math.sin(t) + dy * Math.cos(t) };
    };
    const rasterToArt = (rx, ry) => {
      const u = src.u0 + (rx * src.su) / rw;
      const v = src.v0 + (ry * src.sv) / rh;
      return onArt(L.tx + (u * L.dw) / natural.w, L.ty + (v * L.dh) / natural.h);
    };
    // قطعةٌ اصطناعيّة: أربع زوايا ونقطةٌ منحنية بمقبضين.
    const pts = [
      { x: 10, y: 12, in: null, out: null },
      { x: rw - 15, y: 20, in: null, out: { x: 6, y: 9 } },
      { x: rw - 25, y: rh - 30, in: { x: 4, y: -7 }, out: null },
      { x: 30, y: rh - 10, in: null, out: null },
    ];
    const res = { width: rw, height: rh, background: '#ffffff', palette: ['#ffffff', '#ff0000'], stats: { colors: 2, regions: 1, anchors: 4, ms: 0 }, shapes: [{ color: '#ff0000', contours: [pts], filledArea: 1, bbox: { x: 0, y: 0, w: 1, h: 1 } }] };
    const els = tracedElements(res, placement, { groupId: 'g', opacity: 100, anim: { preset: 'none' }, backgroundName: 'bg', frameRadius: 0.1 });
    const elToArt = (e, p) => {
      const W = e.geo.w * art.w;
      const H = e.geo.h * art.h;
      const cx = (e.geo.x + e.geo.w / 2) * art.w;
      const cy = (e.geo.y + e.geo.h / 2) * art.h;
      const r = (e.geo.rotation * Math.PI) / 180;
      const lx = (p.x - 0.5) * W;
      const ly = (p.y - 0.5) * H;
      return { x: cx + lx * Math.cos(r) - ly * Math.sin(r), y: cy + lx * Math.sin(r) + ly * Math.cos(r) };
    };
    const shape = els[1];
    let err = 0;
    pts.forEach((a, i) => {
      const want = rasterToArt(a.x, a.y);
      const got = elToArt(shape, shape.points[i]);
      err = Math.max(err, Math.hypot(want.x - got.x, want.y - got.y));
      for (const side of ['in', 'out']) {
        if (!a[side]) continue;
        const wantH = rasterToArt(a.x + a[side].x, a.y + a[side].y);
        const h = shape.handles[i][side];
        const gotH = elToArt(shape, { x: shape.points[i].x + h.x, y: shape.points[i].y + h.y });
        err = Math.max(err, Math.hypot(wantH.x - gotH.x, wantH.y - gotH.y));
      }
    });
    // الخلفيّة: زواياها الأربع هي زوايا الجزء الظاهر من الصورة.
    const bg = els[0];
    const corners = [[0, 0], [rw, 0], [rw, rh], [0, rh]].map(([x, y]) => rasterToArt(x, y));
    const bgCorners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => elToArt(bg, { x, y }));
    const bgErr = Math.max(...corners.map((c) => Math.min(...bgCorners.map((b) => Math.hypot(c.x - b.x, c.y - b.y)))));
    return { err, bgErr, rot: shape.geo.rotation, group: els.every((e) => e.groupId === 'g'), fills: shape.appearance.fills.map((f) => f.color), strokes: shape.appearance.strokes.length, bgRadius: bg.radius, rw, rh, partial: src.su < natural.w || src.sv < natural.h };
  });
  assert(place.partial, `الصورة مكبَّرةٌ داخل إطارها: يُتتبَّع الجزء الظاهر وحده (${place.rw}×${place.rh})`);
  assert(place.err < 1e-6, `كلّ نقطةٍ ومقبضٍ حيث يرسمه المُصيِّر — مقلوبًا ومُدارًا ٣٠° (أقصى فرق ${place.err.toExponential(1)} بكسل)`);
  assert(place.bgErr < 1e-6, `والخلفيّة تغطّي الجزء الظاهر بالضبط (فرق ${place.bgErr.toExponential(1)})`);
  assert(place.rot === 30 && place.group, 'كلّ شكلٍ بزاوية الصورة، وكلّها في مجموعةٍ واحدة');
  assert(place.fills.join() === '#ff0000' && place.strokes === 0, 'تعبئةٌ بلون القطعة، وبلا حدٍّ افتراضيّ (المسار بلا مظهرٍ صريح يأخذ حدًّا بسُمك ٢)');
  assert(place.bgRadius === 0.1, 'مستطيل الخلفيّة يملأ الإطار فيأخذ تدوير زوايا الصورة');

  // ═════════════════════════ ٣. الواجهة: إسقاط، زرّ، مجموعة ═════════════════════════
  console.log('\n٣. الواجهة كما يستعملها مصمّم');
  assert(await dropFixture(page), 'إسقاط الصورة على اللوحة يضيفها');
  const btn = page.locator('[data-testid="trace-image-btn"]');
  assert((await btn.count()) === 1 && (await btn.innerText()).includes('تتبّع إلى متجهات'), 'زرّ «تتبّع إلى متجهات» في قسم الصورة المحدَّدة');
  assert((await page.locator('text=على جهازك، بدون نت').count()) > 0, 'وتحته: يعمل على الجهاز بلا إنترنت');
  assert((await page.locator('[data-testid="ctx-trace"]').count()) === 1, 'و«تتبّع الصورة» في الشريط السياقيّ فوقها');
  let doc = await waitDoc(page, (d) => d.elements.some((e) => e.type === 'image'));
  const image = doc.elements.find((e) => e.type === 'image');
  const before = await history(page);
  await btn.click();
  doc = await waitDoc(page, (d) => d.elements.some((e) => e.id === image.id && e.visible === false) && d.elements.some((e) => e.id.startsWith('trace-')));
  let { img, traced } = tracedOf(doc, image.id);
  assert(img && img.visible === false, 'الصورة الأصليّة مخفيّةٌ تحت الأشكال — لم تُحذف');
  assert(traced.length >= 8, `${traced.length} عنصرًا متتبَّعًا فوقها مباشرةً (الخلفيّة + القطع)`);
  const gid = traced[0]?.groupId;
  assert(!!gid && traced.every((e) => e.groupId === gid), 'كلّها مجموعةٌ واحدة');
  const tracedColors = new Set(traced.map((e) => e.appearance?.fills?.[0]?.color));
  assert(Object.values(TRUTH).every((c) => [...tracedColors].some((t) => t && close(t, c))), `بألوان الصورة نفسها (${[...tracedColors].join(' ')})`);
  assert(traced.every((e) => (e.appearance?.strokes?.length ?? 0) === 0), 'تعبئةٌ بلا حدود');
  assert(traced.filter((e) => e.shape === 'path' && !e.outline).every((e) => e.points?.length >= 3), 'القطع ذات المحيط الواحد مساراتٌ بنقاطٍ تُحرَّر');
  assert((await page.locator('[data-testid="ctx-align-sel"]').count()) === 1, 'والمجموعة الناتجة محدَّدة');
  assert((await history(page)) === before + 1, `خطوة تراجعٍ واحدة (${before} ← ${await history(page)})`);
  const agree3 = await renderAgreement(page, doc, image.id, traced.map((e) => e.id));
  assert(agree3 >= 99, `المستند بالمُصيِّر الحقيقيّ يطابق الصورة: ${agree3.toFixed(3)}٪ (≥ ٩٩)`);
  await page.getByTitle('تراجع', { exact: false }).first().click();
  doc = await waitDoc(page, (d) => !d.elements.some((e) => e.id.startsWith('trace-')) && d.elements.some((e) => e.id === image.id && e.visible !== false));
  assert(!doc.elements.some((e) => e.id.startsWith('trace-')) && doc.elements.find((e) => e.id === image.id)?.visible !== false, 'تراجعٌ واحد يُرجع الصورة ظاهرةً بلا أشكال');

  // ═════════════════════════ ٤. صورةٌ مُدارةٌ ومقلوبةٌ ومكبَّرة ═════════════════════════
  console.log('\n٤. صورةٌ مُدارةٌ ومقلوبةٌ ومكبَّرة داخل إطارها');
  await page.waitForTimeout(900);
  await page.evaluate(
    ({ key, id }) => {
      const raw = JSON.parse(window.localStorage.getItem(key));
      const ab = raw.artboards.find((a) => a.id === raw.activeArtboardId) ?? raw.artboards[0];
      ab.doc.elements = ab.doc.elements
        .filter((e) => e.id === id)
        .map((e) => ({ ...e, visible: true, geo: { x: 0.12, y: 0.18, w: 0.72, h: 0.54, rotation: 25 }, fit: 'cover', cropX: 0.46, cropY: 0.54, cropScale: 1.35, flipH: true, flipV: false }));
      window.localStorage.setItem(key, JSON.stringify(raw));
    },
    { key: AUTOSAVE_KEY, id: image.id },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await installHelpers(page);
  await page.locator(`[data-el-id="${image.id}"]`).click();
  await page.waitForTimeout(200);
  const ctxTrace = page.locator('[data-testid="ctx-trace"]');
  assert((await ctxTrace.count()) === 1, 'الصورة المحدَّدة: «تتبّع الصورة» في الشريط السياقيّ');
  await ctxTrace.click();
  doc = await waitDoc(page, (d) => d.elements.some((e) => e.id === image.id && e.visible === false) && d.elements.some((e) => e.id.startsWith('trace-')));
  ({ img, traced } = tracedOf(doc, image.id));
  // التكبير (١٣٥٪) يُخرج الخطّ الرفيع من الإطار، ويقطع الحلقة عند حافّته فينفتح ثقبُها
  // على الخلفيّة — فلا قطعةَ له. ما يُتتبَّع هو الظاهر وحده، فالعدد أقلّ من ٨.
  const kinds = [TRUTH.green, TRUTH.purple, TRUTH.red, TRUTH.orange].filter((c) => traced.some((e) => close(e.appearance.fills[0].color, c)));
  assert(kinds.length === 4 && !traced.some((e) => close(e.appearance.fills[0].color, TRUTH.navy) && e.geo.h < 0.05), `الظاهر وحده: المثلّث والنجمة والقرص والحلقة، والخطّ المقصوص خارج الإطار غائب (${traced.length} أشكال)`);
  assert(traced.every((e) => e.geo.rotation === 25), 'كلُّ شكلٍ بزاوية الصورة (٢٥°)');
  const agree4 = await renderAgreement(page, doc, image.id, traced.map((e) => e.id));
  assert(agree4 >= 98.5, `مُدارةً ومقلوبةً ومكبَّرة: الأشكال فوق ما رُسم بالضبط — ${agree4.toFixed(3)}٪ (≥ ٩٨٫٥)`);
  await page.getByTitle('تراجع', { exact: false }).first().click();
  await waitDoc(page, (d) => !d.elements.some((e) => e.id.startsWith('trace-')));

  // ═════════════════════════ ٥. الأبواب الأخرى ═════════════════════════
  console.log('\n٥. قائمة الزرّ الأيمن، ولوحة الأوامر، ومِزو');
  await page.locator(`[data-el-id="${image.id}"]`).click({ button: 'right' });
  await page.waitForSelector('[data-testid="stage-menu"]');
  const smTrace = page.locator('[data-testid="sm-trace"]');
  assert((await smTrace.count()) === 1, 'الزرّ الأيمن على الصورة: «تتبّع إلى متجهات»');
  await smTrace.click();
  doc = await waitDoc(page, (d) => d.elements.some((e) => e.id.startsWith('trace-')));
  assert(doc.elements.some((e) => e.id.startsWith('trace-')), 'ومنها يتتبّع');
  await page.getByTitle('تراجع', { exact: false }).first().click();
  await waitDoc(page, (d) => !d.elements.some((e) => e.id.startsWith('trace-')));

  await page.locator(`[data-el-id="${image.id}"]`).click();
  await page.keyboard.press(`${MOD}+k`);
  await page.waitForTimeout(150);
  await page.keyboard.type('تتبّع');
  await page.waitForTimeout(150);
  assert((await page.getByText('تتبّع الصورة إلى متجهات').count()) === 1, 'لوحة الأوامر: «تتبّع الصورة إلى متجهات»');
  await page.keyboard.press('Enter');
  doc = await waitDoc(page, (d) => d.elements.some((e) => e.id.startsWith('trace-')));
  assert(doc.elements.some((e) => e.id.startsWith('trace-')), 'وEnter يتتبّع الصورة المحدَّدة');
  await page.getByTitle('تراجع', { exact: false }).first().click();
  await waitDoc(page, (d) => !d.elements.some((e) => e.id.startsWith('trace-')));

  await page.locator('[data-panel-tab="ai"]').click();
  await page.waitForTimeout(200);
  const aiInput = page.getByPlaceholder('اكتب أمرك…');
  await aiInput.fill('حوّل الصورة لمتجهات');
  await aiInput.press('Enter');
  doc = await waitDoc(page, (d) => d.elements.some((e) => e.id.startsWith('trace-')));
  assert(doc.elements.some((e) => e.id.startsWith('trace-')) && doc.elements.find((e) => e.id === image.id)?.visible === false, 'مِزو المحلّي: «حوّل الصورة لمتجهات» يتتبّعها');
  await page.waitForFunction(() => document.body.innerText.includes('إلى متجهات:'), null, { timeout: 10000 }).catch(() => {});
  assert(await page.evaluate(() => document.body.innerText.includes('إلى متجهات:')), 'وردُّه يقول ما صار (عدد الأشكال والألوان، والأصل مخفيّ)');
  // والصورة الآن مخفيّة: لا صورةَ ظاهرة تُتتبَّع، فلا يُعرض الأمر.
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press(`${MOD}+k`);
  await page.waitForTimeout(150);
  await page.keyboard.type('تتبّع');
  await page.waitForTimeout(150);
  assert((await page.getByText('تتبّع الصورة إلى متجهات').count()) === 0, 'بعد التتبّع (الصورة مخفيّة): الأمر لا يُعرض');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);

  // ═════════════════════════ ٦. تحرير النقاط داخل المجموعة ═════════════════════════
  console.log('\n٦. القطعة تُحرَّر نقطةً نقطة');
  ({ traced } = tracedOf(doc, image.id));
  const triangle = traced.find((e) => close(e.appearance.fills[0].color, TRUTH.green) && !e.outline);
  // كما يفعل المصمّم: يخرج من حقل مِزو، ثم «التحديد المباشر» من حبّة الأدوات.
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Escape');
  await page.locator('[data-tool="direct"]').click();
  await page.waitForTimeout(120);
  const box = await page.locator(`[data-el-id="${triangle.id}"]`).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.7);
  await page.waitForTimeout(200);
  assert((await page.locator(`[data-testid="node-edit-${triangle.id}"]`).count()) === 1, 'التحديد المباشر على المثلّث يدخل نقاطه وهو في مجموعته');
  assert((await page.locator(`[data-testid^="node-anchor-${triangle.id}-"]`).count()) === 3, 'ثلاث نقاطٍ تُسحَب — كما رُسم');
  await page.keyboard.press('Escape');
  await page.locator('[data-tool="select"]').click();

  // ولا يُعرض أمرٌ لا يصحّ: بلا صورة في المستند، لا «تتبّع» في لوحة الأوامر.
  await page.evaluate(({ key }) => {
    const raw = JSON.parse(window.localStorage.getItem(key));
    const ab = raw.artboards.find((a) => a.id === raw.activeArtboardId) ?? raw.artboards[0];
    ab.doc.elements = ab.doc.elements.filter((e) => e.type !== 'image');
    window.localStorage.setItem(key, JSON.stringify(raw));
  }, { key: AUTOSAVE_KEY });
  await page.reload({ waitUntil: 'networkidle' });
  await resumeAfterReload(page);
  await page.keyboard.press(`${MOD}+k`);
  await page.waitForTimeout(150);
  await page.keyboard.type('تتبّع');
  await page.waitForTimeout(150);
  assert((await page.getByText('تتبّع الصورة إلى متجهات').count()) === 0, 'بلا صورة: الأمر لا يظهر في لوحة الأوامر (لا صمتٌ يشبه العطل)');
  await page.keyboard.press('Escape');

  // ═════════════════════════ أخطاء صامتة ═════════════════════════
  const realErrors = pageErrors.filter((e) => !/favicon|ResizeObserver loop/i.test(e));
  assert(realErrors.length === 0, realErrors.length ? `بلا أخطاء تشغيل (${realErrors.length}): ${realErrors.slice(0, 3).join(' | ')}` : 'بلا أخطاء تشغيل');

  await browser.close();
  console.log(`\n${'='.repeat(62)}`);
  console.log(`${pass} passed, ${fail} failed.`);
  if (failures.length) {
    console.log('\nfailures:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('harness crashed:', e);
  process.exit(2);
});
