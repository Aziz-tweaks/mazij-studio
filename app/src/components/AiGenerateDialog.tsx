import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { useStudio } from '../state/StudioContext';
import { AI_PROVIDERS, type AiProviderInfo } from '../lib/aiProviders';
import { clearApiKey, hasApiKey, saveApiKey } from '../lib/aiKeyStore';

type KeyStatus = 'configured' | 'no-key' | 'disabled';

function statusOf(provider: AiProviderInfo, hasKey: boolean): KeyStatus {
  if (!provider.enabled) return 'disabled';
  return hasKey ? 'configured' : 'no-key';
}

const STATUS_LABEL: Record<KeyStatus, string> = {
  configured: 'مُهيَّأ بمفتاحك',
  'no-key': 'بلا مفتاح',
  disabled: 'معطّل',
};

const STATUS_COLOR: Record<KeyStatus, string> = {
  configured: 'var(--accent)',
  'no-key': 'var(--muted)',
  disabled: 'var(--muted)',
};

/** Roadmap #22's settings+generation surface: a code-defined provider registry
 * (`aiProviders.ts`, same extensible-list shape as `LOCAL_MODELS` in
 * `localModels.ts`) plus a per-provider API key the user types in and that is
 * stored only on this device (`aiKeyStore.ts`) — never a key mazij ships, never
 * sent anywhere but that provider's own real endpoint. A successful generation is
 * inserted as a real image/video element via `insertLoadedImage`/`insertLoadedVideo`
 * (the exact same single-undo-step path a normal file import uses), onto whichever
 * artboard is active (roadmap #16). */
export function AiGenerateDialog() {
  const { state, actions } = useStudio();
  const [keyedProviders, setKeyedProviders] = useState<Record<string, boolean>>({});
  const [keyInput, setKeyInput] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);

  const selected = AI_PROVIDERS.find((p) => p.id === state.aiGenProviderId) ?? null;

  useEffect(() => {
    if (!state.aiGenOpen) return;
    let cancelled = false;
    Promise.all(AI_PROVIDERS.map(async (p) => [p.id, await hasApiKey(p.id)] as const)).then((pairs) => {
      if (!cancelled) setKeyedProviders(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [state.aiGenOpen]);

  useEffect(() => {
    setKeyInput('');
  }, [state.aiGenProviderId]);

  if (!state.aiGenOpen) return null;

  const onSaveKey = async () => {
    if (!selected || !keyInput.trim()) return;
    setKeyBusy(true);
    try {
      await saveApiKey(selected.id, keyInput.trim());
      setKeyedProviders((m) => ({ ...m, [selected.id]: true }));
      setKeyInput('');
    } finally {
      setKeyBusy(false);
    }
  };

  const onClearKey = async () => {
    if (!selected) return;
    await clearApiKey(selected.id);
    setKeyedProviders((m) => ({ ...m, [selected.id]: false }));
  };

  const hasKey = selected ? (keyedProviders[selected.id] ?? false) : false;
  const canGenerate = !!selected && selected.enabled && hasKey && state.aiGenPrompt.trim().length > 0 && state.aiGenStatus !== 'busy';

  return (
    <div data-testid="ai-gen-dialog" onClick={actions.closeAiGenerate} style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--overlay)', display: 'grid', placeItems: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'calc(var(--r) + 2px)', boxShadow: '0 30px 80px rgba(0,0,0,.35)', padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, flex: 1 }}>توليد بالذكاء الاصطناعي</h2>
          <button data-testid="close-ai-gen-btn" onClick={actions.closeAiGenerate} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}>
            <Icon size={16} path="M5 5l10 10M15 5L5 15" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {AI_PROVIDERS.map((p) => {
            const status = statusOf(p, keyedProviders[p.id] ?? false);
            const active = state.aiGenProviderId === p.id;
            return (
              <button
                key={p.id}
                data-testid={`ai-provider-${p.id}`}
                disabled={!p.enabled}
                onClick={() => actions.setAiGenProviderId(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  height: 44,
                  padding: '0 12px',
                  border: active ? '1.5px solid var(--accent)' : '1px solid var(--line)',
                  borderRadius: 'var(--rs)',
                  background: 'var(--surface2)',
                  textAlign: 'start',
                  opacity: p.enabled ? 1 : 0.55,
                }}
              >
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{p.output === 'image' ? 'صورة' : 'فيديو'}</span>
                <span data-testid={`ai-provider-status-${p.id}`} style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[status] }}>
                  {STATUS_LABEL[status]}
                </span>
              </button>
            );
          })}
        </div>

        {selected && selected.enabled && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--rs)' }}>
              <div className="mz-label">مفتاح API — {selected.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{selected.keyHint}</div>
              {hasKey ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 11.5, color: 'var(--accentText)' }}>تم حفظ المفتاح محليًا على جهازك</span>
                  <button data-testid="ai-key-clear-btn" onClick={onClearKey} style={{ height: 28, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)', fontSize: 11.5 }}>
                    حذف المفتاح
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    data-testid="ai-key-input"
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="الصق مفتاحك هنا"
                    style={{ flex: 1, minWidth: 0, height: 32, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', outline: 0 }}
                  />
                  <button data-testid="ai-key-save-btn" disabled={!keyInput.trim() || keyBusy} onClick={onSaveKey} style={{ height: 32, padding: '0 12px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accentSoft)', color: 'var(--accentText)', fontSize: 12, fontWeight: 600 }}>
                    حفظ
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="mz-label">الوصف (prompt)</div>
              <textarea
                data-testid="ai-prompt-input"
                value={state.aiGenPrompt}
                onChange={(e) => actions.setAiGenPrompt(e.target.value)}
                rows={3}
                placeholder="اكتب وصف الصورة أو الفيديو المطلوب"
                style={{ resize: 'vertical', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', outline: 0, fontFamily: 'inherit', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="mz-label">المقاس</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selected.sizes.map((sz) => (
                  <button
                    key={sz}
                    data-testid={`ai-size-${sz}`}
                    onClick={() => actions.setAiGenSize(sz)}
                    style={{ height: 28, padding: '0 10px', border: state.aiGenSize === sz ? '1.5px solid var(--accent)' : '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', fontSize: 11.5 }}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            {state.aiGenError && (
              <div data-testid="ai-gen-error" style={{ fontSize: 12, color: 'var(--danger)', padding: '8px 10px', border: '1px solid var(--danger)', borderRadius: 'var(--rs)' }}>
                {state.aiGenError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              {state.aiGenStatus === 'busy' ? (
                <>
                  <div data-testid="ai-gen-progress" style={{ flex: 1, height: 36, border: '1px solid var(--line)', borderRadius: 'var(--rs)', position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                    <div style={{ position: 'absolute', inset: 0, insetInlineEnd: `${100 - Math.round(state.aiGenProgress * 100)}%`, background: 'var(--accentSoft)' }} />
                    <span style={{ position: 'relative', fontSize: 12, fontWeight: 600 }}>{Math.round(state.aiGenProgress * 100)}%</span>
                  </div>
                  <button data-testid="ai-gen-cancel-btn" onClick={actions.cancelAiGenerate} style={{ height: 36, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
                    إلغاء
                  </button>
                </>
              ) : (
                <button data-testid="ai-generate-btn" disabled={!canGenerate} onClick={actions.runAiGenerate} style={{ flex: 1, height: 36, border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontSize: 13, fontWeight: 700, opacity: canGenerate ? 1 : 0.5 }}>
                  توليد وإضافة إلى اللوحة
                </button>
              )}
            </div>

            {state.aiGenStatus === 'done' && <div data-testid="ai-gen-done" style={{ fontSize: 12, color: 'var(--accentText)' }}>تمّت الإضافة إلى اللوحة النشِطة</div>}
          </>
        )}
      </div>
    </div>
  );
}
