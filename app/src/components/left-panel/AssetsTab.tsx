import { useRef, useState } from 'react';
import { Icon } from '../Icon';
import { BRAND, PALETTES, sizeAt } from '../../data/constants';
import type { AssetsTab as AssetsTabId } from '../../state/types';
import { firstSelectedElement, useStudio } from '../../state/StudioContext';
import { isAudioFile } from '../../lib/audioFile';

/** لوح «علامتي» و«ملفاتي» — بابان في شريط الإضافة على لوحٍ واحد.
 *
 * **علامتي** (الألوان والخطوط): ما يجعل التصميم يشبه صاحبه. **ملفاتي**: رفعٌ حقيقيّ —
 * صورة أو فيديو أو ملصق لوتي ينزل في وسط اللوحة. كان «الملفات» شبكةَ ملفّاتٍ وهميّة
 * (`product-01.png`، `hero.mp4`) بوسم «قريبًا»: واجهةٌ تَعِد بما لا تفعل، وهي من «الأشياء
 * الغريبة» التي شكا منها المالك. وتبويب «المقاسات» كان نسخةً ثانيةً من قائمة المقاس
 * فوق اللوحة، فرُفع. */
const BRAND_TABS: Array<Extract<AssetsTabId, 'colors' | 'fonts'>> = ['colors', 'fonts'];

export function AssetsTab() {
  const { state, actions, dict: L } = useStudio();
  const brand = state.assetsTab === 'colors' || state.assetsTab === 'fonts';

  return (
    <>
      {brand && (
        <div style={{ display: 'flex', gap: 2, padding: '6px 12px 0', borderBottom: '1px solid var(--line)', flex: 'none' }}>
          {BRAND_TABS.map((id) => {
            const active = state.assetsTab === id;
            return (
              <button
                key={id}
                data-testid={`assets-tab-${id}`}
                onClick={() => actions.setAssetsTab(id)}
                style={{ height: 32, padding: '0 10px', border: 0, borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, background: 'transparent', color: active ? 'var(--text)' : 'var(--muted)', fontSize: 12, fontWeight: 600, marginBottom: -1 }}
              >
                {L[`tab_${id}` as const]}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!brand && <FilesPane only={state.assetsTab === 'images' ? 'image' : state.assetsTab === 'videos' ? 'video' : undefined} />}
        {state.assetsTab === 'fonts' && <FontsPane />}
        {state.assetsTab === 'colors' && <ColorsPane />}
      </div>
    </>
  );
}

/** وسائطُ المشروع كلِّه (كلّ اللوحات)، بلا تكرارٍ للمصدر نفسه — ما رُفع مرّةً يُعاد
 * استعمالُه بنقرة بدل أن يُرفَع ثانيةً (لوحُ «الرفع» في الأداة الشائعة يحفظ ما رُفع). */
function projectMedia(state: ReturnType<typeof useStudio>['state'], only?: 'image' | 'video'): Array<{ key: string; type: 'image' | 'video'; src: string; name: string }> {
  const docs = [state.elements, ...state.artboards.filter((a) => a.id !== state.activeArtboardId).map((a) => (a as { doc?: { elements?: unknown[] } }).doc?.elements ?? [])];
  const seen = new Set<string>();
  const out: Array<{ key: string; type: 'image' | 'video'; src: string; name: string }> = [];
  for (const els of docs) {
    for (const raw of els as Array<{ type?: string; src?: string; name?: string; id?: string }>) {
      if (!raw || (raw.type !== 'image' && raw.type !== 'video') || !raw.src) continue;
      if (only && raw.type !== only) continue;
      if (seen.has(raw.src)) continue;
      seen.add(raw.src);
      out.push({ key: raw.id ?? String(out.length), type: raw.type, src: raw.src, name: raw.name ?? '' });
    }
  }
  return out;
}

function FilesPane({ only }: { only?: 'image' | 'video' }) {
  const { state, actions, dict: L } = useStudio();
  const media = projectMedia(state, only);
  const reuse = async (m: { type: 'image' | 'video'; src: string; name: string }) => {
    const size = sizeAt(state.sizeIdx, state.customW, state.customH);
    const blob = await (await fetch(m.src)).blob();
    const file = new File([blob], m.name || (m.type === 'image' ? 'image' : 'video'), { type: blob.type });
    const p = { x: size.w / 2, y: size.h / 2 };
    if (m.type === 'image') void actions.insertImageFromFile(file, p);
    else void actions.insertVideoFromFile(file, p);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const place = (files: FileList | File[] | null) => {
    if (!files) return;
    const size = sizeAt(state.sizeIdx, state.customW, state.customH);
    const p = { x: size.w / 2, y: size.h / 2 };
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) void actions.insertImageFromFile(file, p);
      else if (/\.(json|lottie)$/i.test(file.name)) void actions.insertLottieFromFile(file, p);
      else if (file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name)) void actions.insertVideoFromFile(file, p);
      else if (isAudioFile(file)) void actions.insertAudioFromFile(file);
    }
  };
  return (
    <>
      <div
        data-testid="upload-drop"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          place(e.dataTransfer.files);
        }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '22px 14px', border: `1.5px dashed ${over ? 'var(--accent)' : 'var(--lineStrong)'}`, borderRadius: 12, background: over ? 'var(--accentSoft)' : 'transparent', color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}
      >
        <Icon size={24} strokeWidth={1.5} path="M10 13V4M6 8l4-4 4 4M4 16h12" />
        <span>{L.up_drop}</span>
        <button data-testid="upload-pick" onClick={() => inputRef.current?.click()} style={{ height: 34, padding: '0 16px', border: 0, borderRadius: 9, background: 'var(--accent)', color: 'var(--onAccent)', fontSize: 12.5, fontWeight: 600 }}>
          {L.up_pick}
        </button>
        <input
          ref={inputRef}
          data-testid="upload-input"
          type="file"
          multiple
          accept={only === 'image' ? 'image/*' : only === 'video' ? 'video/*,.mov,.m4v,.webm' : 'image/*,video/*,audio/*,.json,.lottie'}
          style={{ display: 'none' }}
          onChange={(e) => {
            place(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--faint)', lineHeight: 1.6 }}>{only === 'image' ? L.up_note_images : only === 'video' ? L.up_note_videos : L.up_note}</p>
      {media.length > 0 && (
        <>
          <span className="mz-label">{L.up_in_project}</span>
          <div data-testid="project-media" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {media.map((m) => (
              <button
                key={m.key}
                data-testid="project-media-tile"
                title={L.up_reuse}
                onClick={() => void reuse(m)}
                style={{ aspectRatio: '1', padding: 0, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface2)', cursor: 'pointer' }}
              >
                {m.type === 'image'
                  ? <img src={m.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <video src={m.src} muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function FontsPane() {
  const { state, actions, dict: L } = useStudio();
  const selectedEl = firstSelectedElement(state);
  const selectedFontFamily = selectedEl?.type === 'text' ? selectedEl.fontFamily : null;
  const [systemName, setSystemName] = useState('');
  return (
    <>
      {/* **خطٌّ من الجهاز** — ملفٌّ يُحفَظ في مكتبة الخطوط، أو خطٌّ مثبّتٌ يُستعمَل باسمه. كان
          «أضف خط» رابطًا وحده، والخطُّ المحمَّل يضيع عند إعادة التشغيل (`fontsStore.ts`). */}
      <div data-testid="font-device" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)' }}>
        <button
          data-testid="font-from-file"
          onClick={() => void actions.addFontFromFile()}
          style={{ height: 34, border: '1px dashed var(--lineStrong)', borderRadius: 'var(--rs)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 700 }}
        >
          {L.font_from_file}
        </button>
        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{L.font_from_file_hint}</div>
        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{L.font_system}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            data-testid="font-system-name"
            dir="ltr"
            value={systemName}
            onChange={(e) => setSystemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                actions.addSystemFont(systemName);
                setSystemName('');
              }
            }}
            placeholder={L.font_system_ph}
            style={{ flex: 1, minWidth: 0, height: 32, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', outline: 0, fontSize: 12, textAlign: 'left' }}
          />
          <button
            data-testid="font-system-use"
            onClick={() => {
              actions.addSystemFont(systemName);
              setSystemName('');
            }}
            style={{ height: 32, padding: '0 12px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontSize: 12, fontWeight: 600, opacity: systemName.trim() ? 1 : 0.5 }}
          >
            {L.font_use}
          </button>
        </div>
        {state.fontError && (
          <div data-testid="font-error" style={{ fontSize: 11, color: 'var(--danger)', lineHeight: 1.5 }}>
            {state.fontError}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)' }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{L.add_font}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            dir="ltr"
            value={state.fontUrl}
            onChange={(e) => actions.setFontUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') actions.addFont();
            }}
            placeholder={L.font_url_ph}
            style={{ flex: 1, minWidth: 0, height: 32, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', outline: 0, fontSize: 12, textAlign: 'left' }}
          />
          <button onClick={actions.addFont} style={{ height: 32, padding: '0 12px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontSize: 12, fontWeight: 600, opacity: state.fontUrl.trim() ? 1 : 0.5 }}>
            {L.load}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{L.font_note}</div>
      </div>
      <div className="mz-label">{L.installed}</div>
      <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 'var(--rs)', overflow: 'hidden' }}>
        {state.fonts.map((f) => {
          const selected = selectedFontFamily === f.family;
          const selectable = f.status === 'ready' && !!selectedEl && selectedEl.type === 'text';
          // الصفُّ حاويةٌ لا زرّ: زرُّ الاختيار يُعطَّل بلا نصٍّ محدَّد، والزرُّ المعطَّل يبتلع
          // نقرات ما بداخله — فكان «×» الإزالة ميّتًا كلّما لم يُحدَّد نصّ (مقيسٌ في
          // `qa/user-fonts.spec.mjs`). فالإزالةُ زرٌّ شقيقٌ لا ابن.
          return (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--line)', background: selected ? 'var(--accentSoft)' : 'transparent' }}>
              <button
                onClick={() => selectable && actions.setElementFont(selectedEl!.id, f.family)}
                disabled={!selectable}
                style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 0, background: 'transparent', textAlign: 'start', cursor: selectable ? 'pointer' : 'default' }}
              >
                <span data-testid={`font-row-${f.name}`} data-family={f.family} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 17, lineHeight: 1.2, fontFamily: f.family, opacity: f.status === 'ready' ? 1 : 0.5 }}>{L.sample}</span>
                  <span dir="ltr" style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'start', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                  {f.status === 'error' && f.error && (
                    <span style={{ fontSize: 10, color: 'var(--danger)', textAlign: 'start' }}>{f.error}</span>
                  )}
                </span>
                {f.custom && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 600,
                      background: f.status === 'ready' ? 'var(--accentSoft)' : f.status === 'error' ? 'rgba(255,107,107,.14)' : 'var(--surface2)',
                      color: f.status === 'ready' ? 'var(--accentText)' : f.status === 'error' ? 'var(--danger)' : 'var(--muted)',
                    }}
                  >
                    {f.status === 'ready' ? (f.system ? L.font_system_badge : L.ready) : f.status === 'error' ? L.font_error : L.loading}
                  </span>
                )}
              </button>
              {f.user && (
                <button
                  data-testid={`font-remove-${f.name}`}
                  title={L.font_remove}
                  aria-label={L.font_remove}
                  onClick={() => actions.removeUserFont(f.family)}
                  style={{ width: 28, height: 28, marginInlineEnd: 6, display: 'grid', placeItems: 'center', border: 0, borderRadius: 6, background: 'transparent', color: 'var(--muted)', fontSize: 15, cursor: 'pointer' }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function ColorsPane() {
  const { state, actions, dict: L } = useStudio();
  const pal = PALETTES[state.postPalette];
  const swatches = Array.from(new Set([pal.fg, pal.ac, pal.bg, ...(pal.ac2 ? [pal.ac2] : [])]));
  const target = firstSelectedElement(state);
  const paintable = !!target && (target.type === 'text' || target.type === 'shape');
  const paint = (hex: string) => {
    if (!target) return;
    if (target.type === 'text') actions.setElementColor(target.id, hex);
    else if (target.type === 'shape') actions.setShapeFill(target.id, hex);
  };
  return (
    <>
      <div className="mz-label">{L.post_palettes}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {PALETTES.map((p, i) => {
          // اللوحة الأخيرة وحدها رباعيّة (تضبط `ac2`)، فلها اسمٌ معروضٌ وتعريفٌ
          // خاصّ في الاختبارات — لا لأنها «لوحةٌ مميّزة» بل لأنها الحالة الوحيدة
          // التي تُظهر أربع مربّعاتٍ لا ثلاثة.
          const isEmerald = i === PALETTES.length - 1;
          const active = state.postPalette === i;
          return (
            <button
              key={i}
              onClick={() => actions.setPostPalette(i)}
              title={isEmerald ? L.palette_emerald : undefined}
              data-testid={isEmerald ? 'palette-emerald' : `palette-${i}`}
              style={{ display: 'flex', gap: 3, padding: 5, border: `1.5px solid ${active ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, background: 'var(--surface2)' }}
            >
              <span style={{ width: 16, height: 16, borderRadius: 4, background: p.bg, display: 'block', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)' }} />
              <span style={{ width: 16, height: 16, borderRadius: 4, background: p.fg, display: 'block', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)' }} />
              <span style={{ width: 16, height: 16, borderRadius: 4, background: p.ac, display: 'block' }} />
              {p.ac2 && <span style={{ width: 16, height: 16, borderRadius: 4, background: p.ac2, display: 'block' }} />}
            </button>
          );
        })}
      </div>
      <button
        data-testid="apply-palette-all"
        onClick={() => actions.applyPaletteToAll()}
        title={L.apply_palette_hint}
        style={{ height: 32, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--accentSoft)', color: 'var(--accentText)', fontSize: 12, fontWeight: 600 }}
      >
        {L.apply_palette_all}
      </button>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{L.apply_palette_hint}</p>

      {/* مفتاح زخرفة اللوحة. مكانه هنا لا في لوح «التصميم» لأنه صفةُ **المستند** لا
          صفةُ عنصرٍ محدَّد — ولوح «التصميم» لا يعرض شيئًا أصلًا حين لا تحديد، فلو
          وُضع فيه لما وُجد إلا بالصدفة. وهو يجاور لوحات الألوان لأن الزخرفة تُرسَم
          بلون اللوحة النشطة، فالقراران يُتَّخذان في مكانٍ واحد. */}
      <div className="mz-label">{L.decor_title}</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
        <input
          data-testid="decor-accent-toggle"
          type="checkbox"
          checked={state.decorAccent}
          onChange={(e) => actions.setDecorAccent(e.target.checked)}
        />
        <span style={{ flex: 1 }}>{L.decor_accent}</span>
      </label>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{L.decor_hint}</p>

      {/* الألوان هنا **تُطبَّق**: نقرةٌ على لونٍ تلوّن المحدَّد (نصًّا أو شكلًا). كانت
          مربّعاتٍ للعرض وحده — والمصمّم ينقر اللون الذي يراه. */}
      <div className="mz-label">{L.project_colors}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {swatches.map((hex) => (
          <button key={hex} data-testid={`project-color-${hex.replace('#', '')}`} onClick={() => paint(hex)} disabled={!paintable} title={hex} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', border: 0, padding: 0, background: 'transparent', cursor: paintable ? 'pointer' : 'default' }}>
            <span style={{ width: 44, height: 44, borderRadius: 'var(--rs)', background: hex, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.1)', display: 'block' }} />
            <span dir="ltr" style={{ fontSize: 10, color: 'var(--muted)' }}>{hex}</span>
          </button>
        ))}
      </div>
      <div className="mz-label">{L.brand}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
        {BRAND.map((hex) => (
          <button key={hex} data-testid={`brand-color-${hex.replace('#', '')}`} onClick={() => paint(hex)} disabled={!paintable} title={hex} style={{ aspectRatio: '1', border: 0, borderRadius: 'var(--rs)', background: hex, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.1)', cursor: paintable ? 'pointer' : 'default' }} />
        ))}
      </div>
      {!paintable && <p style={{ margin: 0, fontSize: 11, color: 'var(--faint)' }}>{L.brand_pick_hint}</p>}
    </>
  );
}
