import { useState } from 'react';
import { Icon } from './Icon';
import { useStudio } from '../state/StudioContext';
import { PALETTES, sizeAt } from '../data/constants';

/** Roadmap #16 — list/add/rename/duplicate/delete/switch for every artboard in the
 * document, same modal idiom as `TemplatesDialog.tsx` (list of rows with inline
 * action buttons, one name input + add button at the top). */
export function ArtboardsDialog() {
  const { state, actions, dict: L } = useStudio();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  if (!state.artboardsOpen) return null;

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameDraft(currentName);
  };
  const commitRename = () => {
    if (renamingId && renameDraft.trim()) actions.renameArtboard(renamingId, renameDraft.trim());
    setRenamingId(null);
  };

  return (
    <div data-testid="artboards-dialog" onClick={actions.closeArtboards} style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--overlay)', display: 'grid', placeItems: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'calc(var(--r) + 2px)', boxShadow: '0 30px 80px rgba(0,0,0,.35)', padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, flex: 1 }}>{L.artboards_title}</h2>
          <button data-testid="close-artboards-btn" onClick={actions.closeArtboards} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}>
            <Icon size={16} path="M5 5l10 10M15 5L5 15" />
          </button>
        </div>

        <button
          data-testid="add-artboard-btn"
          onClick={actions.addArtboard}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 36, border: '1px dashed var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', color: 'var(--accentText)', fontWeight: 600, fontSize: 13 }}
        >
          <Icon size={14} strokeWidth={2.2} path="M10 4v12M4 10h12" />
          {L.artboards_add}
        </button>

        {!state.artboards.length && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{L.artboards_empty}</div>}

        <div data-testid="artboards-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.artboards.map((ab) => {
            const active = ab.id === state.activeArtboardId;
            const pal = PALETTES[ab.paletteIdx] ?? PALETTES[0];
            // Active artboard's size comes from the live doc fields (the one place
            // its content currently lives); every other artboard's own stored doc.
            const doc = active ? { sizeIdx: state.sizeIdx, customW: state.customW, customH: state.customH } : state.artboardDocs[ab.id]?.doc;
            const size = doc ? sizeAt(doc.sizeIdx, doc.customW, doc.customH) : null;
            const renaming = renamingId === ab.id;
            return (
              <div
                key={ab.id}
                data-testid={`artboard-row-${ab.id}`}
                data-active={active}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: `1.5px solid ${active ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--rs)', background: active ? 'var(--accentSoft)' : 'transparent' }}
              >
                <span style={{ width: 20, height: 20, borderRadius: 5, background: pal.bg, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)', flex: 'none' }} />
                {renaming ? (
                  <input
                    data-testid={`artboard-rename-input-${ab.id}`}
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={commitRename}
                    placeholder={L.artboards_name_ph}
                    style={{ flex: 1, height: 28, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, padding: '0 8px' }}
                  />
                ) : (
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ab.name}</span>
                )}
                {size && (
                  <span dir="ltr" style={{ fontSize: 11, color: 'var(--muted)', flex: 'none' }}>
                    {size.w}×{size.h}
                  </span>
                )}
                {active && (
                  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: 'var(--accent)', color: 'var(--onAccent)', flex: 'none' }}>{L.artboards_active_badge}</span>
                )}
                {!active && (
                  <button data-testid={`switch-artboard-${ab.id}`} onClick={() => actions.switchArtboard(ab.id)} style={{ height: 26, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--text)', fontSize: 11 }}>
                    {L.artboards_switch}
                  </button>
                )}
                <button data-testid={`rename-artboard-${ab.id}`} title={L.artboards_rename} onClick={() => startRename(ab.id, ab.name)} style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}>
                  <Icon size={13} path="M14 3l3 3-9 9H5v-3z" />
                </button>
                <button data-testid={`duplicate-artboard-${ab.id}`} title={L.artboards_duplicate} onClick={() => actions.duplicateArtboard(ab.id)} style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}>
                  <Icon size={13} path="M7 7h8v8H7zM5 5h8v2H7v6H5z" />
                </button>
                <button
                  data-testid={`delete-artboard-${ab.id}`}
                  title={state.artboards.length <= 1 ? L.artboards_delete_last_hint : L.artboards_delete}
                  disabled={state.artboards.length <= 1}
                  onClick={() => actions.deleteArtboard(ab.id)}
                  style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)', opacity: state.artboards.length <= 1 ? 0.35 : 1 }}
                >
                  <Icon size={13} path="M5 5l10 10M15 5L5 15" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
