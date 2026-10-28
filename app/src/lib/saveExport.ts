import { inTauri, onMobile } from './tauriEnv';

/** Writes a PNG blob to ~/Mazij/Exports when running inside Tauri (real file on
 * disk via the fs plugin). In the plain browser/dev preview, where there is no
 * filesystem access, triggers a real browser download instead — never a no-op. */
export async function saveExportedFile(fileName: string, blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());

  if (inTauri) {
    const { writeFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const { homeDir, documentDir, join } = await import('@tauri-apps/api/path');
    // في الجوال: مجلّدُ مستندات التطبيق، وهو ما يعرضه تطبيقُ «الملفات» في الآيفون
    // (`Info.ios.plist`). مجلّدُ المستخدم في الجوال صندوقٌ مغلق لا يراه أحد.
    const dir = onMobile ? await join(await documentDir(), 'Exports') : await join(await homeDir(), 'Mazij', 'Exports');
    await mkdir(dir, { recursive: true });
    const filePath = await join(dir, fileName);
    await writeFile(filePath, bytes);
    return filePath;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return `~/Downloads/${fileName}`;
}
