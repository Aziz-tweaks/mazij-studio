import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { useStudio } from '../state/StudioContext';
import { LOCAL_MODELS, deleteModel, downloadModel, isModelDownloaded, type LocalModelInfo } from '../lib/localModels';

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Roadmap #9's settings surface: one capability ("إزالة الخلفية") and its
 * candidate models, each with real size/license and a real download/delete
 * control — the minimal slice of the broader #24 "النماذج المحلية" section that
 * this round actually needs (see docs/ROADMAP-PROGRESS.md §24). */
export function LocalModelsDialog() {
  const { state, actions, dict: L } = useStudio();
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!state.localModelsOpen) return;
    let cancelled = false;
    Promise.all(LOCAL_MODELS.map(async (m) => [m.id, await isModelDownloaded(m)] as const)).then((pairs) => {
      if (!cancelled) setDownloaded(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [state.localModelsOpen]);

  if (!state.localModelsOpen) return null;

  const onDownload = async (model: LocalModelInfo) => {
    setBusy((b) => ({ ...b, [model.id]: true }));
    setError((e) => ({ ...e, [model.id]: '' }));
    setProgress((p) => ({ ...p, [model.id]: 0 }));
    try {
      await downloadModel(model, (loaded, total) => setProgress((p) => ({ ...p, [model.id]: total ? loaded / total : 0 })));
      setDownloaded((d) => ({ ...d, [model.id]: true }));
    } catch (err) {
      setError((e) => ({ ...e, [model.id]: (err as Error).message }));
    } finally {
      setBusy((b) => ({ ...b, [model.id]: false }));
    }
  };

  const onDelete = async (model: LocalModelInfo) => {
    await deleteModel(model);
    setDownloaded((d) => ({ ...d, [model.id]: false }));
  };

  return (
    <div data-testid="local-models-dialog" onClick={actions.closeLocalModels} style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--overlay)', display: 'grid', placeItems: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'calc(var(--r) + 2px)', boxShadow: '0 30px 80px rgba(0,0,0,.35)', padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, flex: 1 }}>{L.local_models_title}</h2>
          <button data-testid="close-local-models-btn" onClick={actions.closeLocalModels} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}>
            <Icon size={16} path="M5 5l10 10M15 5L5 15" />
          </button>
        </div>

        {(
          [
            ['background-removal', L.local_models_capability_bg],
            ['speech-to-text', L.local_models_capability_stt],
            ['super-resolution', L.local_models_capability_sr],
          ] as const
        ).map(([task, label]) => (
          <div key={task} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="mz-label">{label}</div>
            {LOCAL_MODELS.filter((m) => m.task === task).map((model) => {
            const isDown = downloaded[model.id] ?? false;
            const isBusy = busy[model.id] ?? false;
            const pct = Math.round((progress[model.id] ?? 0) * 100);
            return (
              <div key={model.id} data-testid={`local-model-row-${model.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--rs)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{state.lang === 'ar' ? model.label : model.labelEn}</span>
                  <span dir="ltr" style={{ fontSize: 11, color: 'var(--muted)' }}>{formatSize(model.sizeBytes)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {L.local_models_license}: {model.license}
                </div>
                {!model.downloadable ? (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{L.local_models_non_commercial}</div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: isDown ? 'var(--accent)' : 'var(--muted)' }}>{isDown ? L.local_models_downloaded : L.local_models_not_downloaded}</span>
                    <div style={{ flex: 1 }} />
                    {isDown ? (
                      <button data-testid={`delete-model-${model.id}`} onClick={() => onDelete(model)} style={{ height: 28, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)', fontSize: 11.5 }}>
                        {L.local_models_delete}
                      </button>
                    ) : (
                      <button data-testid={`download-model-${model.id}`} disabled={isBusy} onClick={() => onDownload(model)} style={{ height: 28, padding: '0 10px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accentSoft)', color: 'var(--accent)', fontSize: 11.5, fontWeight: 600 }}>
                        {isBusy ? `${pct}%` : L.local_models_download}
                      </button>
                    )}
                  </div>
                )}
                {error[model.id] && (
                  <div data-testid={`model-error-${model.id}`} style={{ fontSize: 11, color: '#e5484d' }}>
                    {error[model.id]}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
