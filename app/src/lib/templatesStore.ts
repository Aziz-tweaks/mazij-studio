import type { Template } from './templates';
import { inTauri } from './tauriEnv';

const LOCAL_KEY = 'mazij.templates.v1';
const FILE_NAME = 'templates.json';

/** Persists the whole template library, mirroring `persist.ts`'s doc autosave: real
 * disk (Tauri app-data dir) when packaged, localStorage in the browser preview. */
export async function saveTemplates(templates: Template[]): Promise<void> {
  const json = JSON.stringify(templates);
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

/** Never throws: no saved library yet (first run, or any app version that predates
 * this feature) just means "start from an empty library", same as a missing autosave
 * means "start from the default document" in `persist.ts`. */
export async function loadTemplates(): Promise<Template[]> {
  try {
    let json: string | null;
    if (inTauri) {
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const filePath = await join(await appDataDir(), FILE_NAME);
      json = (await exists(filePath)) ? await readTextFile(filePath) : null;
    } else {
      json = window.localStorage.getItem(LOCAL_KEY);
    }
    if (!json) return [];
    const parsed = JSON.parse(json) as Template[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}
