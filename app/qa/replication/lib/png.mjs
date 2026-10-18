// فكّ ترميز PNG بلا اعتماد خارجي — نسخةٌ مشتركة من الفاكّ الذي كتبته حزمُ الرحلات
// لنفسها (`start-screen` و`still-post-journey` و`artboards`)، استُخرج هنا لأن حلقة
// المحاكاة تحتاجه في كل جولة، وثلاث نسخٍ من فاكّ واحد هي ثلاثة أماكن يختلف فيها
// الجواب عن السؤال نفسه.
//
// يدعم عمق ٨ بت بأنواع الألوان ٠ و٢ و٦ — وهو كلُّ ما يُخرجه مزيج وكلُّ ما يُخرجه
// المتصفّح. أيُّ شيء آخر يرفع خطأً بدل أن يُخمِّن.
import fs from 'node:fs';
import zlib from 'node:zlib';

export function decodePng(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`decodePng: unsupported bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : null;
  if (!channels) throw new Error(`decodePng: unsupported color type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[pos];
    pos += 1;
    const scanline = raw.subarray(pos, pos + stride);
    pos += stride;
    const prevStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[prevStart + x] : 0;
      const c = y > 0 && x >= channels ? pixels[prevStart + x - channels] : 0;
      let val = scanline[x];
      if (filterType === 1) val = (val + a) & 0xff;
      else if (filterType === 2) val = (val + b) & 0xff;
      else if (filterType === 3) val = (val + Math.floor((a + b) / 2)) & 0xff;
      else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        val = (val + pred) & 0xff;
      }
      pixels[y * stride + x] = val;
    }
  }
  return { width, height, channels, pixels };
}

/** لون البكسل عند إحداثيّين **نسبيّين** (٠..١) لا مطلقين — فالهدف والمحاولة قد
 * يختلفان في المقاس، والسؤال «ما لون هذه النقطة من التصميم» لا «ما لون البكسل
 * ٣٤٧». يُرجع {r,g,b}. */
export function pixelAt(img, fx, fy) {
  const x = Math.min(img.width - 1, Math.max(0, Math.round(fx * (img.width - 1))));
  const y = Math.min(img.height - 1, Math.max(0, Math.round(fy * (img.height - 1))));
  const i = y * img.width * img.channels + x * img.channels;
  if (img.channels === 1) return { r: img.pixels[i], g: img.pixels[i], b: img.pixels[i] };
  return { r: img.pixels[i], g: img.pixels[i + 1], b: img.pixels[i + 2] };
}

/** متوسّط اللون داخل مستطيلٍ نسبيّ. أصدق من بكسلٍ مفرد عند مقارنة منطقةٍ ملوّنة:
 * بكسلٌ واحد قد يقع على حافّةٍ مُنعَّمة أو على حرفٍ فوق الخلفية. */
export function averageColor(img, { x, y, w, h }) {
  const x0 = Math.round(x * img.width);
  const y0 = Math.round(y * img.height);
  const x1 = Math.min(img.width, Math.round((x + w) * img.width));
  const y1 = Math.min(img.height, Math.round((y + h) * img.height));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = yy * img.width * img.channels + xx * img.channels;
      if (img.channels === 1) {
        r += img.pixels[i];
        g += img.pixels[i];
        b += img.pixels[i];
      } else {
        r += img.pixels[i];
        g += img.pixels[i + 1];
        b += img.pixels[i + 2];
      }
      n++;
    }
  }
  if (!n) return { r: 0, g: 0, b: 0 };
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

export const hexOf = ({ r, g, b }) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

export function parseHex(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/** مسافة اللون في فضاء sRGB الموزون إدراكيًّا تقريبًا. المسافة الإقليدية الخام
 * تعامل انحرافًا في الأزرق كانحرافٍ في الأخضر، والعين لا تفعل — والمعيار هنا هو
 * «هل يراه المصمّم لونًا آخر». الناتج ٠..~٧٦٥. */
export function colorDistance(a, b) {
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}
