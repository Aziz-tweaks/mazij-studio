import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** أيقوناتُ الجوال — طقمٌ واحدٌ بخطٍّ واحد (١٫٧) على شبكة ٢٠×٢٠، فلا يتجاور
 * رمزان من عائلتين. وكلُّ أداةٍ برمزٍ لا يشبه غيره: «مِزو» نجمة، و«تأثيرات» ثلاثُ
 * دوائر (فلاتر)، لا نجمتان متشابهتان كما كان. */
export const MI = {
  back: 'M12.5 4.5L7 10l5.5 5.5',
  chevronDown: 'M5 8l5 5 5-5',
  chevron: 'M8 4.5l5.5 5.5L8 15.5',
  undo: 'M7.5 5.5L4 9l3.5 3.5M4 9h8.5a3.5 3.5 0 0 1 0 7H10',
  redo: 'M12.5 5.5L16 9l-3.5 3.5M16 9H7.5a3.5 3.5 0 0 0 0 7H10',
  share: 'M10 12.5V3M6.5 6.5L10 3l3.5 3.5M6 9.5H4.5v7.5h11V9.5H14',
  text: 'M4.5 5.5V4h11v1.5M10 4v12M7.5 16h5',
  shapes: 'M3.5 3.5h7v7h-7zM13.5 9.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
  image: 'M3.5 4.5h13v11h-13zM3.5 13l3.5-3.5 3 3 2.5-2.5 4 4M13 7.5h.01',
  video: 'M3 5.5h10v9H3zM13 8.5l4-2v7l-4-2z',
  audio: 'M8 15V5l8-1.5v10M8 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 13.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  fx: 'M10 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM6.5 8.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM13.5 8.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  sticker: 'M4 4h8l4 4v8H4zM12 4v4h4M7.5 12c1.4 1.3 3.6 1.3 5 0',
  folder: 'M3 5.5h5l1.8 2H17v8.5H3z',
  mizo: 'M9.5 3l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4L3.5 9l4.4-1.6zM15.5 13l.7 1.6 1.6.7-1.6.6-.7 1.6-.6-1.6-1.6-.6 1.6-.7z',
  layers: 'M10 3.5l7 3.8-7 3.8-7-3.8zM3 11l7 3.8 7-3.8',
  timeline: 'M3.5 6h8M6.5 10h10M3.5 14h6M14 3.5v13',
  check: 'M4.5 10.5l3.5 3.5 7.5-8',
  close: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  trash: 'M4.5 6h11M8 6V4.5h4V6M6 6l.8 10h6.4L14 6',
  duplicate: 'M7 7h9v9H7zM13 7V4H4v9h3',
  edit: 'M12.5 4.5l3 3L8 15H5v-3z',
  font: 'M3 15.5l4-11 4 11M4.4 11.8h5.2M16.5 9.5v6M16.5 12.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  color: 'M10 3s5.5 5.4 5.5 9a5.5 5.5 0 0 1-11 0C4.5 8.4 10 3 10 3z',
  size: 'M3 7V5h8v2M7 5v10M5.5 15h3M12 10.5V9.5h6v1M15 9.5V15M13.8 15h2.4',
  align: 'M4 5h12M6.5 8.5h7M4 12h12M6.5 15.5h7',
  alignStart: 'M4 5h12M4 8.5h7M4 12h12M4 15.5h7',
  alignEnd: 'M4 5h12M9 8.5h7M4 12h12M9 15.5h7',
  bold: 'M6 4h5a3 3 0 0 1 0 6H6zM6 10h6a3 3 0 0 1 0 6H6z',
  opacity: 'M10 3.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM10 3.5v13M10 7h4.5M10 10h6M10 13h4.5',
  order: 'M6 14V4M3.5 6.5L6 4l2.5 2.5M14 6v10M11.5 13.5L14 16l2.5-2.5',
  crop: 'M5.5 2.5v12h12M2.5 5.5h12v12',
  flip: 'M10 3v14M7.5 6L3 14h4.5zM12.5 6L17 14h-4.5z',
  replace: 'M4.5 8.5a6 6 0 0 1 10.8-2.8M15.5 11.5a6 6 0 0 1-10.8 2.8M15.5 3v3h-3M4.5 17v-3h3',
  volume: 'M3.5 8h3l4-3.5v11l-4-3.5h-3zM13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5.5a6.5 6.5 0 0 1 0 9',
  mute: 'M3.5 8h3l4-3.5v11l-4-3.5h-3zM13.5 8l4 4M17.5 8l-4 4',
  split: 'M7 6.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 13.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM6.5 7.5L16.5 14M6.5 12.5L16.5 6',
  motion: 'M2.5 10h4M4.5 6.5h4M4.5 13.5h4M13 5.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z',
  corners: 'M4 16V9.5A5.5 5.5 0 0 1 9.5 4H16',
  stroke: 'M3.5 3.5h13v13h-13zM7 7h6v6H7z',
  play: 'M6.5 4.5v11l9-5.5z',
  pause: 'M7 4.5v11M13 4.5v11',
  plus: 'M10 4v12M4 10h12',
  minus: 'M4 10h12',
  eye: 'M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5zM10 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z',
  eyeOff: 'M3.5 3.5l13 13M8.2 5.3A7.6 7.6 0 0 1 10 5c4.7 0 7.5 5 7.5 5a12 12 0 0 1-2 2.6M12 14.6a7 7 0 0 1-2 .4c-4.7 0-7.5-5-7.5-5a12 12 0 0 1 2.6-3',
  lock: 'M5 9h10v8H5zM7 9V6.5a3 3 0 0 1 6 0V9',
  unlock: 'M5 9h10v8H5zM7 9V6.5a3 3 0 0 1 5.8-1',
  more: 'M5 10h.01M10 10h.01M15 10h.01',
  sliders: 'M4 6h12M4 14h12M8 4v4M12 12v4',
  grid: 'M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5zM11.5 11.5h5v5h-5z',
  send: 'M16.5 3.5l-13 5.5 5.5 2 2 5.5z',
  sparkle: 'M10 2.5l1.8 5.7 5.7 1.8-5.7 1.8-1.8 5.7-1.8-5.7-5.7-1.8 5.7-1.8z',
  photos: 'M3.5 6.5h11v10h-11zM6 4h10.5v10M3.5 14l3-3 2.5 2.5 2-2 3.5 3.5',
  doc: 'M5 3h7l3.5 3.5V17H5zM12 3v3.5h3.5',
  clock: 'M10 3.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM10 6.5V10l2.5 1.5',
} as const;

/** التقاطُ المؤشّر ليبقى السحبُ للعنصر ولو خرج الإصبعُ منه — ولا يُسقط الإيماءة إن رفضه
 * المتصفّح (مؤشّرٌ مُصطنَع أو انتهى قبل الالتقاط). */
export function capture(e: { currentTarget: EventTarget; pointerId: number }) {
  try {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  } catch {
    /* السحبُ يعمل بلا التقاط */
  }
}

export function Glyph({ d, size = 22, sw = 1.7, fill, style }: { d: string; size?: number; sw?: number; fill?: boolean; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none', ...style }} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** زرُّ أداةٍ في الشريط السفليّ: رمزٌ فوق اسم. */
export function ToolButton({ icon, label, onClick, active, danger, testid, disabled }: { icon: string; label: string; onClick: () => void; active?: boolean; danger?: boolean; testid: string; disabled?: boolean }) {
  return (
    <button data-testid={testid} className={`m-tool m-press${danger ? ' m-danger' : ''}`} aria-pressed={active ? true : undefined} onClick={onClick} disabled={disabled}>
      <Glyph d={icon} size={23} />
      <span>{label}</span>
    </button>
  );
}

export function IconButton({ icon, label, onClick, disabled, testid, filled, flip, style, size = 22, data }: { icon: string; label: string; onClick: () => void; disabled?: boolean; testid?: string; filled?: boolean; flip?: boolean; style?: CSSProperties; size?: number; data?: Record<string, string | number> }) {
  return (
    <button data-testid={testid} {...data} className={`m-icon-btn m-press${filled ? ' m-filled' : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled} style={style}>
      <Glyph d={icon} size={size} style={flip ? { transform: 'scaleX(-1)' } : undefined} />
    </button>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, testid }: { value: T; options: Array<{ id: T; label: ReactNode; testid?: string }>; onChange: (v: T) => void; testid?: string }) {
  return (
    <div className="m-seg" role="group" data-testid={testid}>
      {options.map((o) => (
        <button key={String(o.id)} data-testid={o.testid} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** **منزلقٌ يُمسَك من أيّ نقطة** — لا `<input type=range>` (مقبضه صغير ولا يُمسَك إلا
 * من مقبضه). يتتبّع الإصبع ١:١ بـ`setPointerCapture`، ويُبلِّغ `onStart` و`onEnd`
 * ليصير السحبُ كلُّه خطوةَ تراجعٍ واحدة. ويُعكَس في العربيّة كما في iOS. */
export function Slider({
  value,
  min,
  max,
  step = 0.01,
  onChange,
  onStart,
  onEnd,
  label,
  display,
  testid,
  rtl,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  label?: string;
  display?: string;
  testid?: string;
  rtl?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActiveState] = useState(false);
  const activeRef = useRef(false);
  const setActive = (v: boolean) => {
    activeRef.current = v;
    setActiveState(v);
  };
  const frac = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const pick = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    let f = (clientX - r.left) / Math.max(1, r.width);
    if (rtl) f = 1 - f;
    f = Math.min(1, Math.max(0, f));
    const raw = min + f * (max - min);
    const v = Math.round(raw / step) * step;
    onChange(Number(v.toFixed(6)));
  };
  const pos = rtl ? 1 - frac : frac;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {(label || display) && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
          <span dir="ltr" style={{ fontSize: 14, color: 'var(--m-text2)', fontVariantNumeric: 'tabular-nums' }}>{display}</span>
        </div>
      )}
      <div
        ref={ref}
        data-testid={testid}
        data-value={value}
        className="m-slider"
        data-active={active}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        onPointerDown={(e) => {
          capture(e);
          setActive(true);
          onStart?.();
          pick(e.clientX);
        }}
        onPointerMove={(e) => {
          if (activeRef.current) pick(e.clientX);
        }}
        onPointerUp={() => {
          if (!activeRef.current) return;
          setActive(false);
          onEnd?.();
        }}
        onPointerCancel={() => {
          if (!activeRef.current) return;
          setActive(false);
          onEnd?.();
        }}
      >
        <div className="m-slider-track">
          <div className="m-slider-fill" style={rtl ? { left: 'auto', right: 0, width: `${frac * 100}%` } : { width: `${frac * 100}%` }} />
        </div>
        <div className="m-slider-thumb" style={{ left: `${pos * 100}%` }} />
      </div>
    </div>
  );
}

export function SectionTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="m-section-title" style={{ padding: '0 2px 8px', ...style }}>
      {children}
    </div>
  );
}

/** ألوانٌ جاهزة: ألوانُ لوحة المستند أوّلًا (تناسق التصميم)، ثم طيفٌ مختصر، ثم «مخصّص». */
const SPECTRUM = ['#FFFFFF', '#E5E7EB', '#9CA3AF', '#4B5563', '#111111', '#FF5A5F', '#FF8A3D', '#FFC83D', '#3DDC84', '#18C8B4', '#3D8BFF', '#7362FF', '#C04BFF', '#FF4FA3', '#8B5E3C', '#0E3B36'];

export function Swatches({ value, docColors, onPick, testid, allowNone, noneLabel }: { value: string | null; docColors: string[]; onPick: (hex: string | null) => void; testid?: string; allowNone?: boolean; noneLabel?: string }) {
  const norm = (c: string | null) => (c ?? '').toLowerCase();
  const sw = (c: string, key: string, fluid?: boolean) => {
    const on = norm(value) === norm(c);
    return (
      <button
        key={key}
        data-color={c}
        aria-label={c}
        aria-pressed={on}
        className="m-press"
        onClick={() => onPick(c)}
        style={{ width: fluid ? '100%' : 40, maxWidth: 40, aspectRatio: '1', height: fluid ? undefined : 40, flex: 'none', borderRadius: '50%', border: 0, background: c, boxShadow: on ? '0 0 0 2px var(--m-elev), 0 0 0 4px var(--m-text)' : 'inset 0 0 0 1px rgba(255,255,255,.14)' }}
      />
    );
  };
  return (
    <div data-testid={testid} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {allowNone && (
          <button
            aria-label={noneLabel}
            aria-pressed={value === null}
            className="m-press"
            onClick={() => onPick(null)}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 0, background: 'var(--m-elev2)', color: 'var(--m-danger)', display: 'grid', placeItems: 'center', boxShadow: value === null ? '0 0 0 2px var(--m-elev), 0 0 0 4px var(--m-text)' : 'inset 0 0 0 1px rgba(255,255,255,.14)' }}
          >
            <Glyph d="M5 15L15 5" size={20} sw={2} />
          </button>
        )}
        {docColors.map((c, i) => sw(c, `d${i}`))}
        <label className="m-press" style={{ position: 'relative', width: 40, height: 40, borderRadius: '50%', background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)' }}>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value ?? '') ? value! : '#ffffff'} onChange={(e) => onPick(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', border: 0 }} />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: 8, justifyItems: 'center' }}>{SPECTRUM.map((c) => sw(c, c, true))}</div>
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding: '28px 20px' }}>
      <span style={{ width: 56, height: 56, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'var(--m-elev2)', color: 'var(--m-text2)' }}>
        <Glyph d={icon} size={26} />
      </span>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      {body && <div className="m-caption" style={{ maxWidth: 280 }}>{body}</div>}
      {action}
    </div>
  );
}
