// قصُّ الصور المصدريّة الثلاث من `target.png`.
//
// الهدف يختبر **صورًا مستوردة**، فلا بدّ من ملفّاتٍ حقيقيّة تمرّ بمنتقي الملفّات.
// وأصدقُ مصدرٍ لها هو الهدف نفسه: تُقَصّ كلُّ صورةٍ عند صندوق حبرها المقيس بالضبط
// (لا تخمينًا بالعين)، فتصير ثلاثة ملفّاتٍ منفصلة — أيقونة وشارتان — لا لقطةً
// واحدة تضمّها. وهذا هو الفرق الذي يقيسه `badge-gap-clear`.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { decodePng } from './lib/png.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'targets/t03-store-card/target.png');
const OUT = path.join(__dirname, 'assets/t03-store-card');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, rgb) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // مرشّح «لا شيء»
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const img = decodePng(SRC);

/** صناديق الحبر المقيسة من الهدف — انظر `measure.mjs`. */
const CROPS = [
  { name: 'icon.png', x: 486, y: 474, w: 108, h: 109 },
  { name: 'badge-appstore.png', x: 255, y: 953, w: 231, h: 78 },
  { name: 'badge-googleplay.png', x: 614, y: 952, w: 285, h: 85 },
];

fs.mkdirSync(OUT, { recursive: true });
for (const c of CROPS) {
  const rgb = Buffer.alloc(c.w * c.h * 3);
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const si = (c.y + y) * img.width * img.channels + (c.x + x) * img.channels;
      const di = (y * c.w + x) * 3;
      rgb[di] = img.pixels[si];
      rgb[di + 1] = img.pixels[si + (img.channels === 1 ? 0 : 1)];
      rgb[di + 2] = img.pixels[si + (img.channels === 1 ? 0 : 2)];
    }
  }
  fs.writeFileSync(path.join(OUT, c.name), encodePng(c.w, c.h, rgb));
  console.log(`  · ${c.name}  ${c.w}×${c.h}  من (${c.x},${c.y})`);
}
