import { hasDesktopSidecars } from './tauriEnv';

/** ربطُ مزيج بتطبيقات الذكاء على الكمبيوتر — الواجهةُ الأماميّة لـ `src-tauri/src/link.rs`.
 *
 * المستخدم يكلّم Claude (أو Codex) في تطبيقه الرسميّ باشتراكه هو، وClaude يعدّل التصميم
 * المفتوح في مزيج عبر خادم أدواته المحلّيّ. لا مفاتيح ولا خادمَ لمزيج ولا كلفة عليه. */

export type LinkTargetId = 'claude-desktop' | 'claude-code' | 'codex';

export interface LinkTarget {
  id: LinkTargetId;
  installed: boolean;
  linked: boolean;
}

export async function linkStatus(): Promise<LinkTarget[]> {
  if (!hasDesktopSidecars) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<LinkTarget[]>('ai_link_status');
}

export async function link(target: LinkTargetId): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('ai_link', { target });
}

export async function unlink(target: LinkTargetId): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('ai_unlink', { target });
}

export async function restartClaudeDesktop(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('ai_restart_claude_desktop');
}

const PREF = 'mazij.ai.link';

/** «اسمح لتطبيقات الذكاء تتحكم بمزيج»: يبقي خادمَ الأدوات المحلّيّ شغّالًا ما دام مزيج
 * مفتوحًا، ويُستعاد عند كلّ تشغيل. */
export function linkAllowed(): boolean {
  try {
    return localStorage.getItem(PREF) === '1';
  } catch {
    return false;
  }
}

export function setLinkAllowed(on: boolean): void {
  try {
    localStorage.setItem(PREF, on ? '1' : '0');
  } catch {
    /* تفضيلٌ لكلّ جهاز */
  }
}

export const DOWNLOAD_URL: Record<LinkTargetId, string> = {
  'claude-desktop': 'https://claude.ai/download',
  'claude-code': 'https://claude.com/product/claude-code',
  codex: 'https://developers.openai.com/codex',
};
