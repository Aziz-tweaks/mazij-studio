import { useCallback, useEffect, useState } from 'react';
import { useStudio } from '../../state/StudioContext';
import { DOWNLOAD_URL, link, linkAllowed, linkStatus, restartClaudeDesktop, setLinkAllowed, unlink, type LinkTarget, type LinkTargetId } from '../../lib/aiLink';

/** **«اربط مزيج بتطبيقات الذكاء»** — داخل لوح مِزو على الكمبيوتر.
 *
 * ثلاثة تطبيقات رسميّة، كلٌّ بحالته: غيرُ مثبّت (رابطُ تنزيله)، مثبّتٌ وغيرُ مربوط (زرّ
 * «اربط»)، مربوط. ومفتاحٌ واحدٌ يسمح لها بالتحكّم بمزيج ويبقى بعد إعادة التشغيل. */

const T = {
  ar: {
    title: 'اربط مزيج بتطبيقات الذكاء',
    body: 'كلّم Claude في تطبيقه الرسمي، والتصميم يتغيّر هنا قدامك — على اشتراكك أنت، بدون مفاتيح.',
    allow: 'اسمح لها تتحكم بمزيج',
    allowHint: 'يبقى شغّال ما دام مزيج مفتوح.',
    names: { 'claude-desktop': 'تطبيق Claude', 'claude-code': 'Claude Code', codex: 'Codex' } as Record<LinkTargetId, string>,
    notInstalled: 'غير مثبّت',
    get: 'نزّله',
    link: 'اربط',
    linked: 'مربوط',
    unlink: 'فك الربط',
    restart: 'أعد تشغيل Claude ليقرأ الربط',
    restarted: 'أُعيد تشغيله — اكتب له «صمم لي بوست في مزيج»',
    error: 'تعذّر الربط',
  },
  en: {
    title: 'Connect Mazij to AI apps',
    body: 'Talk to Claude in its official app and the design changes here — on your own subscription, no keys.',
    allow: 'Allow them to control Mazij',
    allowHint: 'Stays on while Mazij is open.',
    names: { 'claude-desktop': 'Claude app', 'claude-code': 'Claude Code', codex: 'Codex' } as Record<LinkTargetId, string>,
    notInstalled: 'Not installed',
    get: 'Get it',
    link: 'Connect',
    linked: 'Connected',
    unlink: 'Disconnect',
    restart: 'Restart Claude to load the connection',
    restarted: 'Restarted — ask it to “design a post in Mazij”',
    error: 'Could not connect',
  },
};

export function AiLinkSection() {
  const { state, actions } = useStudio();
  const t = T[state.lang];
  const [targets, setTargets] = useState<LinkTarget[] | null>(null);
  const [allowed, setAllowed] = useState(linkAllowed);
  const [busy, setBusy] = useState<LinkTargetId | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [restarted, setRestarted] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void linkStatus().then(setTargets).catch(() => setTargets([]));
  }, []);
  useEffect(refresh, [refresh]);

  const toggleAllowed = () => {
    const on = !allowed;
    setAllowed(on);
    setLinkAllowed(on);
    actions.setMcpServerEnabled(on);
  };

  const doLink = async (id: LinkTargetId) => {
    setBusy(id);
    setErr(null);
    try {
      await link(id);
      if (!allowed) toggleAllowed();
      if (id === 'claude-desktop') setNeedsRestart(true);
      refresh();
    } catch (e) {
      setErr(`${t.error}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const doUnlink = async (id: LinkTargetId) => {
    setBusy(id);
    try {
      await unlink(id);
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const openUrl = async (url: string) => {
    const { openUrl: open } = await import('@tauri-apps/plugin-opener');
    await open(url).catch(() => undefined);
  };

  return (
    <section data-testid="ai-link" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 'var(--r)', background: 'var(--surface2)', border: '1px solid var(--line)' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.title}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{t.body}</div>

      <button data-testid="ai-link-allow" role="switch" aria-checked={allowed} onClick={toggleAllowed} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', border: 0, background: 'transparent', color: 'var(--text)', textAlign: 'start' }}>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{t.allow}</span>
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{t.allowHint}</span>
        </span>
        <span dir="ltr" style={{ position: 'relative', width: 34, height: 20, borderRadius: 999, background: allowed ? 'var(--accent)' : 'var(--line)', flex: 'none' }}>
          <span style={{ position: 'absolute', top: 2, left: allowed ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
        </span>
      </button>

      {(targets ?? []).map((tg) => (
        <div key={tg.id} data-testid={`ai-link-${tg.id}`} data-linked={tg.linked} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{t.names[tg.id]}</span>
          {!tg.installed ? (
            <>
              <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{t.notInstalled}</span>
              <button onClick={() => void openUrl(DOWNLOAD_URL[tg.id])} style={chip(false)}>{t.get}</button>
            </>
          ) : tg.linked ? (
            <>
              <span style={{ fontSize: 11, color: 'var(--accentText)', fontWeight: 700 }}>✓ {t.linked}</span>
              <button disabled={busy === tg.id} onClick={() => void doUnlink(tg.id)} style={chip(false)}>{t.unlink}</button>
            </>
          ) : (
            <button data-testid={`ai-link-btn-${tg.id}`} disabled={busy === tg.id} onClick={() => void doLink(tg.id)} style={chip(true)}>
              {t.link}
            </button>
          )}
        </div>
      ))}

      {needsRestart && (
        <button
          data-testid="ai-link-restart"
          onClick={() => {
            void restartClaudeDesktop().then(() => setRestarted(true));
            setNeedsRestart(false);
          }}
          style={{ ...chip(true), height: 30 }}
        >
          {t.restart}
        </button>
      )}
      {restarted && <div style={{ fontSize: 11, color: 'var(--accentText)' }}>{t.restarted}</div>}
      {err && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{err}</div>}
    </section>
  );
}

function chip(primary: boolean) {
  return {
    height: 26,
    padding: '0 10px',
    border: primary ? 0 : '1px solid var(--line)',
    borderRadius: 'var(--rs)',
    background: primary ? 'var(--accent)' : 'transparent',
    color: primary ? 'var(--onAccent)' : 'var(--text)',
    fontSize: 11.5,
    fontWeight: 600,
  } as const;
}
