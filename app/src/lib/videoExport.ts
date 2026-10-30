import { homeDir, join } from '@tauri-apps/api/path';
import { mkdir, remove, writeFile } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';

import { renderArtboardFrames, type ArtboardRenderSpec } from './exportArtboard';
import { audioMixFilter, audioMixPlan, dataUrlBytes, extForDataUrl, type MixSegment } from './audioMix';
import type { ShutterSpec } from './motionBlur';
import { ExportCancelled, isExportCancelled, setRunningProcess, throwIfCancelled } from './exportCancel';

export type VideoFormat = 'mp4' | 'gif' | 'mov' | 'webm';

export interface VideoExportOptions {
  format: VideoFormat;
  /** طولُ المستند بالثواني، مشتقًّا من مقاطعه (`documentDuration`). */
  durationSeconds: number;
  fps: number;
  quality: 'high' | 'med';
  /** Only meaningful for GIF — MP4 (yuv420p/H.264) has no alpha channel, so the
   * caller must pass `false` here when `format === 'mp4'` (ExportDialog disables the
   * transparent toggle for mp4 rather than silently dropping it here). */
  transparent: boolean;
  /** ترميزُ MP4 — H.264 أو H.265. يُتجاهَل في غيرها. */
  codec?: 'h264' | 'hevc';
  /** `false` يُصدِّر فيديو صامتًا ولو كان في المستند صوت. */
  audio?: boolean;
  /** ضبابُ الحركة. غيابُه — أو `samplesPerFrame = 1` — يُبقي المسارَ القديم
   * بسطره، مقيسًا بايتًا ببايت. والثمنُ **دون الخطّيّ** (نحو نصفِ N) ومقيسٌ في
   * `docs/DECISION-motion-blur-parity.md` §٦. */
  shutter?: ShutterSpec;
}

const FRAME_DIGITS = 5;

/** معاملاتُ ترميز الصورة لكلّ صيغة (٣٠ أكتوبر ٢٠٢٦):
 * - MP4: H.264 (`libx264`، الأوسعُ قبولًا) أو H.265 (`libx265`، نحو نصف الحجم، وسمُ `hvc1` لتشغيله في أجهزة آبل).
 * - MOV: ProRes 4444 بقناة ألفا متى طُلبت الشفافيّة («التفريغ» للمونتاج فوق مقاطع أخرى)، وإلا ProRes 422 HQ.
 * - WebM: VP9 بقناة ألفا متى طُلبت — يُشغَّل في المتصفّحات بخلفيّةٍ شفّافة. */
function videoCodecArgs(opts: VideoExportOptions, crf: string, transparent: boolean): string[] {
  if (opts.format === 'mov') {
    return transparent
      ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0']
      : ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0'];
  }
  if (opts.format === 'webm') {
    const q = opts.quality === 'high' ? '24' : '32';
    return ['-c:v', 'libvpx-vp9', '-pix_fmt', transparent ? 'yuva420p' : 'yuv420p', '-b:v', '0', '-crf', q, '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4'];
  }
  if (opts.codec === 'hevc') {
    const q = opts.quality === 'high' ? '22' : '27';
    return ['-pix_fmt', 'yuv420p', '-c:v', 'libx265', '-preset', 'medium', '-crf', q, '-tag:v', 'hvc1'];
  }
  return ['-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', crf];
}
function frameFileName(index: number): string {
  return `frame-${String(index + 1).padStart(FRAME_DIGITS, '0')}.png`;
}

/** Spawns the bundled ffmpeg sidecar and reports real encode progress parsed from
 * its own `-progress pipe:1` machine-readable stream — never a simulated timer. */
async function runFfmpeg(args: string[], totalFrames: number, onFrame: (frame: number) => void): Promise<void> {
  const command = Command.sidecar('binaries/ffmpeg', args);
  let stderr = '';
  command.stderr.on('data', (line: string) => {
    stderr += `${line}\n`;
  });
  command.stdout.on('data', (line: string) => {
    const m = /^frame=(\d+)/.exec(line.trim());
    if (m) onFrame(Math.min(totalFrames, parseInt(m[1], 10)));
  });

  throwIfCancelled();
  await new Promise<void>((resolve, reject) => {
    command.on('close', (data) => {
      setRunningProcess(null);
      if (isExportCancelled()) reject(new ExportCancelled());
      else if (data.code === 0) resolve();
      else reject(new Error(`ffmpeg (${args[args.length - 1]}) exited with code ${data.code}\n${stderr.slice(-4000)}`));
    });
    command.on('error', (err) => reject(new Error(String(err))));
    command.spawn().then((child) => setRunningProcess(child)).catch(reject);
  });
}

/** أفي هذا الملف مسارُ صوت؟ — FFmpeg يطبع سطرَ «Audio:» لكلّ مسارٍ قبل أن يسأل عن مخرج.
 * فيديو صامتٌ يُسقَط من الخلط: `[n:a]` على ملفٍّ بلا صوتٍ خطأٌ يُفشل التصدير كلَّه. */
async function hasAudioStream(path: string): Promise<boolean> {
  const probe = Command.sidecar('binaries/ffmpeg', ['-i', path]);
  let stderr = '';
  probe.stderr.on('data', (line: string) => {
    stderr += `${line}\n`;
  });
  await new Promise<void>((resolve) => {
    probe.on('close', () => resolve());
    probe.on('error', () => resolve());
    probe.spawn().catch(() => resolve());
  });
  return /Stream #\d+:\d+[^\n]*Audio:/.test(stderr);
}

/** Renders the current document's animation to a real MP4 or GIF file: rasterizes
 * one frame per output-fps tick through the same canvas path PNG export uses
 * (`renderArtboardFrames`, so a video frame matches a PNG export of the same
 * instant exactly), writes the frames to a scratch directory, then encodes them
 * with the ffmpeg sidecar. `onProgress` receives real 0..1 progress — frame
 * rendering and ffmpeg's own `-progress pipe:1` output, never a fake timer.
 *
 * MP4 tags its output as Rec.709 SDR (`-color_range/-colorspace/-color_primaries`)
 * so players interpret the colors correctly. The competitive analysis
 * (docs/COMPETITIVE-ANALYSIS.md §1.7) documents a colorspace *filter* أداة تصميم شائعة's
 * engineering team needed in 2023 to fix a desaturation bug on their ffmpeg build —
 * verified by hand against the ffmpeg version this app actually bundles and found
 * to do the opposite here (see the comment at the mp4 branch below for the
 * measurement), so only the harmless metadata tagging is applied, not that pixel-
 * transforming filter. GIF doesn't need either (palette-based, no YUV colorspace
 * involved) but gets a real two-pass palettegen/paletteuse instead of GIF's default
 * fixed palette, which is what causes the usual GIF banding/dithering mess.
 */
export async function exportVideoTarget(
  spec: Omit<ArtboardRenderSpec, 'time'>,
  opts: VideoExportOptions,
  destFileName: string,
  onProgress: (fraction: number) => void,
): Promise<string> {
  // **المدّة تأتي من المستند لا من ثابت.** كانت `TIMELINE_DURATION * fps`، أي أنّ
  // كلّ تصديرٍ خمسُ ثوانٍ بالضبط أيًّا كان المشروع. وتُمرَّر عبر `opts` لا تُقرأ من
  // هنا، فهذه الوحدة لا تعرف الحالة — وهو ما يُبقي `frameTimes[i] = i / fps`
  // مشتقّةً من الفهرس بلا تراكم، وهي الخصلة التي رصدتها الورقتان وأُكِّدت بالقراءة.
  const frameCount = Math.max(1, Math.round(opts.durationSeconds * opts.fps));
  const frameTimes = Array.from({ length: frameCount }, (_, i) => i / opts.fps);

  const home = await homeDir();
  const exportsDir = await join(home, 'Mazij', 'Exports');
  await mkdir(exportsDir, { recursive: true });
  // Not dot-prefixed: the fs plugin's scope glob ($HOME/Mazij/**) follows normal
  // shell-glob semantics, which don't match dot-directories — a leading dot here
  // would make every write underneath rejected as out-of-scope.
  const tmpDir = await join(home, 'Mazij', 'export-tmp', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });

  try {
    // MP4 has no alpha channel — force an opaque background for its frames
    // regardless of the transparent toggle (ExportDialog disables that toggle for
    // mp4 in the UI; this is the belt-and-suspenders guarantee at the render layer).
    // الشفافيّةُ لصيغٍ تحمل قناةَ ألفا: GIF، وMOV (ProRes 4444)، وWebM (VP9). MP4 لا يحملها.
    const frameSpec = { ...spec, transparent: opts.format !== 'mp4' && spec.transparent };

    let rendered = 0;
    // `frameInterval` يُمرَّر صراحةً ولا تَستنتجه `renderArtboardFrames` من فرق
    // أوّل زمنين. والسببُ أن ذلك الاستنتاجَ **غيرُ معرَّفٍ على إطارٍ واحد**: جدولٌ
    // طولُه واحدٌ لا فرقَ فيه، فتخرج فترةُ الغالق صفرًا ويُطفأ الضبابُ صامتًا.
    // ومُنادو هذه الدالّة بجدولٍ قصيرٍ موجودون فعلًا (اختباراتُ الإطار الواحد في
    // `qa/motion-blur.spec.mjs`). فالمعرفةُ بمعدّل الإطارات تبقى عند من يَملكها،
    // كما بقيت المدّةُ في `opts` ولم تُقرأ من حالةٍ هنا.
    await renderArtboardFrames(frameSpec, frameTimes, async (blob, i) => {
      throwIfCancelled();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await writeFile(await join(tmpDir, frameFileName(i)), bytes);
      rendered += 1;
      onProgress((rendered / frameCount) * 0.4);
    }, { shutter: opts.shutter, frameInterval: 1 / opts.fps });

    const destPath = await join(exportsDir, destFileName);
    const inputPattern = await join(tmpDir, `frame-%0${FRAME_DIGITS}d.png`);

    if (opts.format === 'mp4' || opts.format === 'mov' || opts.format === 'webm') {
      const crf = opts.quality === 'high' ? '18' : '23';
      // **الصوت** (٢٥ أكتوبر ٢٠٢٦): طبقاتُ الصوت وصوتُ الفيديو، بخطّة `audioMixPlan` نفسِها
      // التي تُشغّل بها المعاينة (`mediaTimeAt`). كلُّ مصدرٍ يُكتب ملفًّا مؤقّتًا ويُمرَّر مدخلًا
      // بعد الإطارات، ومرشّحُ `audioMixFilter` يقصّه ويؤخّره ويخلطه. والمستندُ بلا صوتٍ يُصدَّر
      // بالسطر القديم حرفًا — لا مسارَ صوتٍ فارغًا في ملفّه.
      const plan = opts.audio === false ? { inputs: [], segments: [] } as unknown as ReturnType<typeof audioMixPlan> : audioMixPlan(frameSpec.elements, opts.durationSeconds);
      const audioPaths: string[] = [];
      const segments: MixSegment[] = [];
      for (let k = 0; k < plan.inputs.length; k++) {
        const el = plan.inputs[k];
        if (!el.src) continue;
        const path = await join(tmpDir, `audio-${k}.${extForDataUrl(el.src)}`);
        await writeFile(path, dataUrlBytes(el.src));
        if (el.type === 'video' && !(await hasAudioStream(path))) continue;
        audioPaths.push(path);
        segments.push({ ...plan.segments[k], input: audioPaths.length });
      }
      const mix = audioMixFilter(segments);
      await runFfmpeg(
        [
          '-y',
          '-framerate', String(opts.fps),
          '-i', inputPattern,
          ...audioPaths.flatMap((p) => ['-i', p]),
          ...(mix ? ['-filter_complex', mix.filter, '-map', '0:v', '-map', mix.out, ...(opts.format === 'webm' ? ['-c:a', 'libopus', '-b:a', '160k'] : ['-c:a', 'aac', '-b:a', '192k'])] : []),
          '-frames:v', String(frameCount),
          ...videoCodecArgs(opts, crf, frameSpec.transparent),
          // Tag the output stream as standard Rec.709 SDR — metadata only (no `-vf`
          // pixel transform), so players interpret the colors correctly without
          // altering a single pixel value. The competitive analysis (§1.7) documents
          // أداة تصميم شائعة's 2023 fix for a *different* bug: their ffmpeg build implicitly
          // reinterpreted sRGB input through the wrong transfer curve, desaturating
          // output, and their fix was an explicit `colorspace=…itrc=srgb:ispace=bt709`
          // filter that forces a real sRGB→Rec.709 gamma remap. Verified by hand
          // against this ffmpeg build (9.0.2, see docs/CONTROLS.md): adding that same
          // filter here does NOT fix a washed-out bug — there isn't one on this
          // build — it *introduces* one, darkening solid colors by ~15-20/255 per
          // channel (measured via ffmpeg's own `psnr` filter and direct pixel
          // sampling: PSNR 25dB with the filter vs 36-37dB without it, against the
          // same frame rendered as a PNG). Metadata-only tagging matches the source
          // canvas colors far more closely on this build. If a future ffmpeg build
          // reintroduces the original washed-out bug, re-verify with the same
          // PNG-vs-decoded-frame PSNR/pixel-sample comparison before reaching for
          // the filter again — don't reapply it on the blog post's authority alone.
          '-color_range', '1',
          '-colorspace', '1',
          '-color_primaries', '1',
          ...(opts.format === 'webm' ? [] : ['-movflags', '+faststart']),
          '-progress', 'pipe:1',
          '-nostats',
          destPath,
        ],
        frameCount,
        (f) => onProgress(0.4 + (f / frameCount) * 0.6),
      );
    } else {
      const transparent = frameSpec.transparent;
      const palettePath = await join(tmpDir, 'palette.png');
      const palettegenFilter = transparent ? 'palettegen=stats_mode=diff:reserve_transparent=1' : 'palettegen=stats_mode=diff';
      const paletteuseFilter = transparent ? 'paletteuse=dither=bayer:alpha_threshold=128' : 'paletteuse=dither=bayer';

      await runFfmpeg(
        ['-y', '-framerate', String(opts.fps), '-i', inputPattern, '-frames:v', String(frameCount), '-vf', palettegenFilter, '-progress', 'pipe:1', '-nostats', palettePath],
        frameCount,
        (f) => onProgress(0.4 + (f / frameCount) * 0.2),
      );
      await runFfmpeg(
        [
          '-y',
          '-framerate', String(opts.fps),
          '-i', inputPattern,
          '-i', palettePath,
          '-frames:v', String(frameCount),
          '-lavfi', `[0:v][1:v]${paletteuseFilter}`,
          '-loop', '0',
          '-progress', 'pipe:1',
          '-nostats',
          destPath,
        ],
        frameCount,
        (f) => onProgress(0.6 + (f / frameCount) * 0.4),
      );
    }

    onProgress(1);
    return destPath;
  } catch (err) {
    // ملفٌّ نصفُ مكتوبٍ بعد الإلغاء لا يُترَك في مجلّد التصدير يُوهِم أنه نتيجة.
    if (err instanceof ExportCancelled) {
      await remove(await join(exportsDir, destFileName)).catch(() => undefined);
    }
    throw err;
  } finally {
    await remove(tmpDir, { recursive: true }).catch(() => undefined);
  }
}
