// لقطةُ الزجاج بخطٍّ من ملفّ، بمحرّك WebKit:  node qa/helpers/glass-font-shot.mjs <font.ttf> <out.png> [text]
import { webkit } from 'playwright';
import { readFileSync } from 'node:fs';
const [, , fontPath, out, text = 'صارت على مقاسك'] = process.argv;
const b64 = readFileSync(fontPath).toString('base64');
const b = await webkit.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto('http://localhost:1420/qa/fixtures/blank.html');
await p.evaluate(
  async ([b64, text]) => {
    const { paintGlass } = await import('/src/lib/glass.ts');
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    const face = new FontFace('GT', bin, { weight: '100 900' });
    await face.load();
    document.fonts.add(face);
    const cv = document.createElement('canvas');
    cv.width = 1920;
    cv.height = 1080;
    document.body.appendChild(cv);
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 1920, 1080);
    const tube = { mode: 'tube', colors: ['#ff3d8f', '#ff2a6d', '#f2368f', '#c13dff'], rim: '#6a6cff', core: '#ff7a1f', flow: 0.18, angle: 90, highlight: 0.7 };
    const draw = (str, y, px) => {
      c.save();
      c.translate(80, y);
      paintGlass(c, 1760, px * 1.3, 0.5, tube, px * 0.09, (m) => {
        m.font = `800 ${px}px GT`;
        m.direction = 'rtl';
        m.textAlign = 'center';
        m.fillText(str, 880, px);
      });
      c.restore();
    };
    draw(text, 40, 300);
    c.font = '800 220px GT';
    c.direction = 'rtl';
    c.textAlign = 'center';
    c.fillStyle = '#000';
    c.fillText(text, 960, 900);
  },
  [b64, text],
);
await p.screenshot({ path: out });
await b.close();
console.log('ok', out);
