import type { DocSnapshot } from '../state/types';
import { inTauri } from './tauriEnv';

const LOCAL_KEY = 'mazij.autosave.v1';
const FILE_NAME = 'autosave.json';

/** Roadmap #16 — one artboard's identity + content as written to disk. See
 * `ArtboardMeta`/`DocSnapshot` in `state/types.ts` for what each field means; undo
 * history is intentionally not persisted here, same as before multi-artboard
 * documents existed (a reload always starts with empty history). */
export interface PersistedArtboard {
  id: string;
  name: string;
  paletteIdx: number;
  doc: DocSnapshot;
}

/** The on-disk/localStorage document shape since multi-artboard support (roadmap
 * #16). `loadDoc` returns the raw parsed JSON un-migrated — a document saved
 * before this existed is a bare `DocSnapshot` instead (no `artboards` key at all);
 * wrapping that losslessly into this shape is `StudioContext.tsx`'s job (next to
 * its other doc migrations, `migrateAnim`/`normalizeDoc`), not this module's. */
export interface PersistedDoc {
  artboards: PersistedArtboard[];
  activeArtboardId: string;
}

/** Persists the document snapshot for real: to the app-data directory via Tauri's
 * fs plugin when packaged, or to localStorage in the plain browser/dev preview.
 * Throws on failure so the caller can show a real "save failed" state instead of
 * pretending the save succeeded. */
export async function saveDoc(file: PersistedDoc): Promise<void> {
  const json = JSON.stringify(file);
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

/** Reads back the last autosaved document, if any, as raw parsed JSON — either the
 * current `PersistedDoc` shape or a pre-roadmap-#16 bare `DocSnapshot`; the caller
 * (`migrateToDocFile` in `StudioContext.tsx`) tells those apart and migrates.
 * Never throws: a missing/corrupt/unrecognized save just means "start from the
 * default document", same as a first run. */
export async function loadDoc(): Promise<unknown | null> {
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
    if (!json) return null;
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    const hasLegacyShape = Array.isArray((parsed as { elements?: unknown }).elements);
    const hasArtboardsShape = Array.isArray((parsed as { artboards?: unknown }).artboards);
    if (!hasLegacyShape && !hasArtboardsShape) return null;
    return parsed;
  } catch {
    return null;
  }
}
