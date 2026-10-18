import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useStudio } from '../state/StudioContext';
import { inTauri } from '../lib/tauriEnv';
import { detectReferenceVideoStructure, type ReferenceVideoStructure } from '../lib/referenceVideo';

type Status = 'idle' | 'analyzing' | 'ready' | 'error';

/** Roadmap #21's UI: pick/drop a reference video, run FFmpeg scene detection on it,
 * and show exactly what was understood (shot count + each shot's real duration,
 * beats honestly marked "قريبًا") before the user commits to turning it into a
 * template — see referenceVideo.ts for the detection/template-building logic this
 * only drives. Analysis needs a real filesystem path for the FFmpeg sidecar, which
 * only a native file dialog or a real OS drag-drop event can provide — the browser
 * dev-preview path (no Tauri) is told that honestly rather than faking a result,
 * the same limitation `videoExport.ts`/ExportDialog document for MP4/GIF export. */
export function ReferenceVideoDialog() {
  const { state, actions, dict: L } = useStudio();
  const [status, setStatus] = useState<Status>('idle');
  const [structure, setStructure] = useState<ReferenceVideoStructure | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!state.refVideoOpen) {
      setStatus('idle');
      setStructure(null);
      setError('');
      setName('');
      return;
    }
    if (!inTauri) return;
    // Real OS-level drag-drop paths (Tauri v2's webview event, not the HTML5 drop
    // event — a plain browser drop never exposes a real filesystem path). Scoped to
    // this dialog's own lifetime and to drops landing inside the drop-zone element.
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return;
        const rect = dropRef.current?.getBoundingClientRect();
        const { x, y } = event.payload.position;
        if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
        const path = event.payload.paths[0];
        if (path) void analyze(path);
      });
    })();
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.refVideoOpen]);

  if (!state.refVideoOpen) return null;

  const analyze = async (path: string) => {
    setStatus('analyzing');
    setError('');
    setStructure(null);
    try {
      const s = await detectReferenceVideoStructure(path);
      setStructure(s);
      setStatus('ready');
      if (!name.trim()) setName(path.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'قالب من فيديو');
    } catch (err) {
      setError((err as Error).message || L.refvideo_error_generic);
      setStatus('error');
    }
  };

  const pickFile = async () => {
    if (inTauri) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({ multiple: false, filters: [{ name: 'فيديو', extensions: ['mp4', 'mov', 'webm', 'mkv', 'm4v'] }] });
      if (path && typeof path === 'string') void analyze(path);
      return;
    }
    fileInputRef.current?.click();
  };

  // A browser <input type="file"> File object carries no real filesystem path
  // (a deliberate browser security limitation) — there is nothing honest to
  // analyze, so this surfaces the same Tauri-only error the drop zone would.
  const onBrowserFileChosen = () => {
    if (fileInputRef.current?.files?.length) {
      setError(L.refvideo_error_tauri_only);
      setStatus('error');
      fileInputRef.current.value = '';
    }
  };

  const create = () => {
    if (!structure) return;
    actions.importReferenceVideoTemplate(name, structure);
  };

  return (
    <div data-testid="refvideo-dialog" onClick={actions.closeRefVideo} style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--overlay)', display: 'grid', placeItems: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'calc(var(--r) + 2px)', boxShadow: '0 30px 80px rgba(0,0,0,.35)', padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, flex: 1 }}>{L.refvideo_title}</h2>
          <button data-testid="close-refvideo-btn" onClick={actions.closeRefVideo} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}>
            <Icon size={16} path="M5 5l10 10M15 5L5 15" />
          </button>
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{L.refvideo_hint}</div>

        <div
          ref={dropRef}
          data-testid="refvideo-drop-zone"
          onClick={pickFile}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            // Plain browser drop: real File object, but (same as the file input)
            // no usable filesystem path outside Tauri's own drag-drop event above.
            if (!inTauri && e.dataTransfer.files.length) {
              setError(L.refvideo_error_tauri_only);
              setStatus('error');
            }
          }}
          style={{
            border: `1.5px dashed ${dragOver ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: 'var(--rs)',
            padding: '28px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'var(--accentSoft)' : 'var(--surface2)',
            color: 'var(--muted)',
            fontSize: 13,
          }}
        >
          {L.refvideo_drop}
          <div style={{ marginTop: 10 }}>
            <button data-testid="refvideo-pick-btn" onClick={(e) => { e.stopPropagation(); void pickFile(); }} style={{ height: 30, padding: '0 14px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 600, fontSize: 12.5 }}>
              {L.refvideo_pick_btn}
            </button>
          </div>
          <input ref={fileInputRef} data-testid="refvideo-file-input" type="file" accept="video/*" onChange={onBrowserFileChosen} style={{ display: 'none' }} />
        </div>

        {status === 'analyzing' && <div data-testid="refvideo-status" style={{ fontSize: 13, color: 'var(--muted)' }}>{L.refvideo_analyzing}</div>}

        {status === 'error' && <div data-testid="refvideo-error" style={{ fontSize: 13, color: 'var(--danger, #e5484d)' }}>{error}</div>}

        {status === 'ready' && structure && (
          <div data-testid="refvideo-structure" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span data-testid="refvideo-shot-count" style={{ fontWeight: 700 }}>
                {structure.shots.length} {L.refvideo_shots_found}
              </span>
              <span dir="ltr" style={{ color: 'var(--muted)', fontSize: 12 }}>
                {L.refvideo_total_duration}: {structure.totalDuration.toFixed(1)}s
              </span>
            </div>
            {structure.cutTimes.length === 0 && <div data-testid="refvideo-no-cuts-note" style={{ fontSize: 12, color: 'var(--muted)' }}>{L.refvideo_no_cuts}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {structure.shots.map((shot, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>
                    {L.refvideo_shot_label} {i + 1}
                  </span>
                  <span dir="ltr" style={{ color: 'var(--muted)' }}>
                    {shot.start.toFixed(1)}s → {(shot.start + shot.duration).toFixed(1)}s ({shot.duration.toFixed(1)}s)
                  </span>
                </div>
              ))}
            </div>
            <div data-testid="refvideo-beats-note" style={{ fontSize: 11.5, color: 'var(--muted)', opacity: 0.8 }}>
              {L.refvideo_beats_soon}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                data-testid="refvideo-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={L.refvideo_name_ph}
                style={{ flex: 1, height: 34, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, padding: '0 10px' }}
              />
              <button
                data-testid="refvideo-create-btn"
                onClick={create}
                disabled={!name.trim()}
                style={{ height: 34, padding: '0 16px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 600, fontSize: 13, opacity: name.trim() ? 1 : 0.5 }}
              >
                {L.refvideo_create_btn}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
