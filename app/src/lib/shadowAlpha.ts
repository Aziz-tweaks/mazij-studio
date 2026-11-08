/** **ظلُّ القُماش وشفافيّتُه** (١ نوفمبر ٢٠٢٦) — WebKit (محرّكُ مزيج على الماك) يرسم ظلَّ القُماش
 * بلون `shadowColor` كاملًا ولا يضربه في `globalAlpha`، وChromium يضربه. فكان توهّجُ عنصرٍ
 * يتلاشى يبقى بكامل شدّته في الفيديو المُصدَّر (والنسخُ الباهتة للتمطيط تتوهّج كأنّها صلبة).
 * نقيس السلوكَ مرّةً، وحيث لا يُضرَب نضرب الشفافيّةَ في لون الظلّ نفسِه. */

let respects: boolean | null = null;
let probe: CanvasRenderingContext2D | null = null;

export function shadowRespectsAlpha(): boolean {
  if (respects !== null) return respects;
  try {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 8;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (!x) return (respects = true);
    x.globalAlpha = 0.5;
    x.shadowColor = '#000000';
    x.shadowOffsetX = 8;
    x.shadowBlur = 0;
    x.fillStyle = '#000000';
    x.fillRect(0, 0, 4, 8);
    const a = x.getImageData(10, 4, 1, 1).data[3];
    respects = a < 200;
  } catch {
    respects = true;
  }
  return respects;
}

function rgbaOf(color: string): [number, number, number, number] | null {
  if (typeof document === 'undefined') return null;
  if (!probe) probe = document.createElement('canvas').getContext('2d');
  if (!probe) return null;
  probe.fillStyle = '#000000';
  probe.fillStyle = color;
  const v = String(probe.fillStyle);
  if (v.startsWith('#')) {
    const n = parseInt(v.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((s) => parseFloat(s));
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

/** لونُ الظلّ الذي يُعطي الشدّةَ نفسَها في كلّ محرّك عند `globalAlpha` الحاليّة. */
export function alphaShadow(ctx: CanvasRenderingContext2D, color: string): string {
  const a = ctx.globalAlpha;
  if (a >= 0.999 || shadowRespectsAlpha()) return color;
  const c = rgbaOf(color);
  if (!c) return color;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(c[3] * a).toFixed(4)})`;
}

/** يضرب شفافيّةَ لونٍ في `a`. */
export function mulAlpha(color: string, a: number): string {
  const c = rgbaOf(color);
  if (!c) return color;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${Math.max(0, Math.min(1, c[3] * a)).toFixed(4)})`;
}

/** **ظلٌّ بلا جسم** — يُرسَم الشكلُ خارج القماش بعيدًا ويُعاد ظلُّه إلى مكانه بإزاحة الظلّ،
 * فلا يُرى إلّا الظلّ، وشدّتُه في لونه هو لا في `globalAlpha`. ظلُّ النصّ في WebKit لا يحترم
 * `globalAlpha` (ظلُّ المستطيل يحترمها)، فكان توهّجُ النصّ بكامل شدّته دائمًا وحتى والعنصرُ يختفي. */
export function castShadow(ctx: CanvasRenderingContext2D, color: string, opacity: number, blur: number, ox: number, oy: number, draw: () => void): void {
  const a = ctx.globalAlpha * opacity;
  if (a <= 0.002) return;
  ctx.save();
  const T = ctx.getTransform();
  const OFF = 50000;
  ctx.setTransform(T.a, T.b, T.c, T.d, T.e - OFF, T.f);
  ctx.globalAlpha = 1;
  ctx.shadowColor = mulAlpha(color, a);
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = ox + OFF;
  ctx.shadowOffsetY = oy;
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  draw();
  ctx.restore();
}
