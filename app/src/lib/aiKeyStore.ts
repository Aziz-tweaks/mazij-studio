import { inTauri } from './tauriEnv';

// `LOCAL_KEY` is the localStorage *slot name*, not a credential. Secret scanners
// read the identifier and flag the line, so the judgement is recorded here rather
// than re-made on every scan.
const LOCAL_KEY = 'mazij.aikeys.v1'; // gitleaks:allow
const FILE_NAME = 'ai-keys.json';

/** Roadmap #22 — per-provider API keys the user types in themselves. Stored only on
 * this device (Tauri app-data file when packaged, localStorage in the plain
 * browser/dev preview — same storage split `persist.ts` uses) in a file/key of its
 * own, separate from the document (`DocSnapshot`/`PersistedDoc` in `types.ts`), so a
 * key is never bundled into autosave, export, or undo history, and never leaves this
 * device for anywhere other than the one provider it belongs to. */

async function readAll(): Promise<Record<string, string>> {
  try {
    if (inTauri) {
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const filePath = await join(await appDataDir(), FILE_NAME);
      if (!(await exists(filePath))) return {};
      return JSON.parse(await readTextFile(filePath));
    }
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeAll(keys: Record<string, string>): Promise<void> {
  const json = JSON.stringify(keys);
  if (inTauri) {
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const dir = await appDataDir();
    await mkdir(dir, { recursive: true });
    await writeTextFile(await join(dir, FILE_NAME), json);
  } else {
    window.localStorage.setItem(LOCAL_KEY, json);
  }
}

export async function loadApiKey(providerId: string): Promise<string | null> {
  const keys = await readAll();
  return keys[providerId] ?? null;
}

export async function saveApiKey(providerId: string, key: string): Promise<void> {
  const keys = await readAll();
  keys[providerId] = key;
  await writeAll(keys);
}

export async function clearApiKey(providerId: string): Promise<void> {
  const keys = await readAll();
  delete keys[providerId];
  await writeAll(keys);
}

export async function hasApiKey(providerId: string): Promise<boolean> {
  return (await loadApiKey(providerId)) !== null;
}
