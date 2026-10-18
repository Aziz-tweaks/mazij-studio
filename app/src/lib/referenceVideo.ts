import type { Bezier } from './easing';
import { DEFAULT_BEZIER } from './easing';
import { DEFAULT_IMAGE_CROP, newElementId, type DocElement, type ImageElement, type PropertyKeyframe } from '../state/elements';
import { TIMELINE_DURATION } from './animTimeline';
import { createTemplate, type Template, type TemplateSlot } from './templates';

/** Roadmap #21: tear down a short reference video into reusable *edit structure* —
 * shot boundaries/durations via FFmpeg scene detection — then hand that off to the
 * existing template system (#7/#19) as a motion template with one image slot per
 * shot. The reference video's pixels are discarded entirely; only the cut timing
 * survives, exactly like Higgsfield Katana's documented approach (see
 * docs/ROADMAP-PROGRESS.md, "لماذا أُضيفت 19-22"). */

export interface DetectedShot {
  /** Seconds from the start of the reference video, as actually detected —
   * never scaled/rounded here, only at template-build time. */
  start: number;
  duration: number;
}

export interface ReferenceVideoStructure {
  totalDuration: number;
  shots: DetectedShot[];
  /** Raw detected cut timestamps (seconds), before being turned into shots —
   * kept for the preview UI and for the ground-truth test to assert against directly. */
  cutTimes: number[];
  /** Always null in this round — see module doc below. Never a fake/synthesized
   * beat grid; the UI must show this as "قريبًا", not silently omit it. */
  beats: number[] | null;
}

/** Chosen empirically against this project's own bundled FFmpeg build (see
 * docs/CONTROLS.md "المرحلة 12"): FFmpeg's `scdet` filter scores a real hard cut
 * between two differently-textured shots at roughly 25-70 on its 0..100 scale, while
 * static noise/grain within one continuous shot stays under ~1. A flat-color-only
 * cut (no texture at all) can score far lower or even ~0 — degenerate synthetic
 * content, not a realistic reference video — so this threshold is tuned for real
 * footage, not solid-color test cards. Lower than the filter's own built-in default
 * of 10 to stay safely above the noise floor while still catching softer cuts
 * (dissolves, whip pans) that score lower than a hard cut. */
export const SCENE_THRESHOLD = 8;

/** Two detected cuts closer together than this are collapsed into one — guards
 * against a single real cut being double-reported across two adjacent frames
 * (observed in practice: a hard cut can register on both the outgoing and incoming
 * frame, a few centiseconds apart) rather than a genuine second shot a few frames long. */
const MIN_SHOT_GAP = 0.3;

export function buildSceneDetectArgs(inputPath: string, threshold = SCENE_THRESHOLD): string[] {
  return ['-loglevel', 'info', '-i', inputPath, '-vf', `scdet=threshold=${threshold}`, '-f', 'null', '-'];
}

const DURATION_RE = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;
const SCD_RE = /lavfi\.scd\.score:\s*([\d.]+),\s*lavfi\.scd\.time:\s*([\d.]+)/g;

/** Pure parser for the scene-detect FFmpeg invocation's stderr text — no process
 * spawning here, so this is directly unit-testable against captured real output
 * (see qa/reference-video.spec.mjs), and is the single place both the live app and
 * the ground-truth test read cut detection from. */
export function parseSceneDetectOutput(stderrText: string): { totalDuration: number | null; cutTimes: number[] } {
  const durationMatch = DURATION_RE.exec(stderrText);
  const totalDuration = durationMatch ? parseInt(durationMatch[1], 10) * 3600 + parseInt(durationMatch[2], 10) * 60 + parseFloat(durationMatch[3]) : null;

  const rawCuts: number[] = [];
  let m: RegExpExecArray | null;
  SCD_RE.lastIndex = 0;
  while ((m = SCD_RE.exec(stderrText))) {
    rawCuts.push(parseFloat(m[2]));
  }
  rawCuts.sort((a, b) => a - b);

  const cutTimes: number[] = [];
  for (const t of rawCuts) {
    if (!cutTimes.length || t - cutTimes[cutTimes.length - 1] >= MIN_SHOT_GAP) cutTimes.push(t);
  }
  // A cut reported within the first instant is almost always the filter's own
  // warm-up artifact (no real "previous shot" exists before frame 0), not a real cut.
  while (cutTimes.length && cutTimes[0] < MIN_SHOT_GAP) cutTimes.shift();

  return { totalDuration, cutTimes };
}

/** Turns raw cut timestamps into shots (start/duration pairs) spanning the whole
 * video. Zero cuts is handled honestly as exactly one shot — the "no cuts detected"
 * case the roadmap item calls out explicitly — never an invented split. */
export function shotsFromCutTimes(cutTimes: number[], totalDuration: number): DetectedShot[] {
  const bounds = [0, ...cutTimes, totalDuration];
  const shots: DetectedShot[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i];
    const duration = bounds[i + 1] - start;
    if (duration > 0.001) shots.push({ start, duration });
  }
  return shots;
}

/** Runs the bundled FFmpeg sidecar's scene-detect pass over a real file on disk and
 * returns the parsed structure. Tauri-only (spawns a real child process) — the
 * browser/QA-preview path has no sidecar, same limitation `videoExport.ts` documents
 * for MP4/GIF export; see docs/CONTROLS.md for how that's verified instead. Audio
 * beat detection is NOT attempted: stock FFmpeg ships no onset/beat-tracking filter
 * (verified by hand against this build's `-filters` list — only `silencedetect`/
 * `astats`/EQ-family filters exist, nothing resembling onset detection), so `beats`
 * is always null here and the UI must show "قريبًا", never a synthesized beat grid. */
export async function detectReferenceVideoStructure(filePath: string): Promise<ReferenceVideoStructure> {
  const { Command } = await import('@tauri-apps/plugin-shell');
  const args = buildSceneDetectArgs(filePath);
  const command = Command.sidecar('binaries/ffmpeg', args);
  let stderr = '';
  command.stderr.on('data', (line: string) => {
    stderr += `${line}\n`;
  });

  await new Promise<void>((resolve, reject) => {
    command.on('close', (data) => {
      // Exit code is irrelevant here: `-f null -` with no output file can report a
      // nonzero code on some builds purely from writing to /dev/null — what matters
      // is whether we actually captured a Duration banner + any scdet lines, checked
      // right after by the caller via parseSceneDetectOutput.
      void data;
      resolve();
    });
    command.on('error', (err) => reject(new Error(String(err))));
    command.spawn().catch(reject);
  });

  const { totalDuration, cutTimes } = parseSceneDetectOutput(stderr);
  if (totalDuration === null || totalDuration <= 0) {
    throw new Error('تعذّر قراءة مدة الفيديو — تأكد أن الملف فيديو صالح');
  }
  return { totalDuration, cutTimes, shots: shotsFromCutTimes(cutTimes, totalDuration), beats: null };
}

const FADE_IN = 0.1;

function fadeTrack(): PropertyKeyframe[] {
  const bezier = [...DEFAULT_BEZIER] as Bezier;
  return [
    { id: newElementId('kf'), t: 0, value: 0, easing: 'linear', bezier },
    { id: newElementId('kf'), t: 1, value: 1, easing: 'linear', bezier },
  ];
}

/** Builds the motion template's elements: one full-bleed image slot per detected
 * shot. Each slot's `anim.start` is the shot's own start time, linearly rescaled
 * from the reference video's real duration onto this app's fixed `TIMELINE_DURATION`
 * (every document/template shares one timeline length — see `animTimeline.ts` —
 * so a 3-30s reference video's cut *proportions* are preserved, not its absolute
 * seconds). A shot never needs its own "hide" track: elements are painted in array
 * order (see `createDefaultElements`), so shot N+1 fading in on top at its start
 * automatically covers shot N — exactly the hard-cut look a montage needs, using the
 * entrance-animation mechanism the engine already has rather than inventing a
 * parallel "clip visibility window" concept. The last shot simply stays visible
 * through the end of the timeline, same as any element with no later sibling. */
export function buildReferenceVideoTemplate(name: string, structure: ReferenceVideoStructure, sizeIdx: number, customW: number, customH: number): Template {
  const scale = structure.totalDuration > 0 ? TIMELINE_DURATION / structure.totalDuration : 1;
  const scaledStarts = structure.shots.map((s) => Math.min(TIMELINE_DURATION - 0.01, s.start * scale));

  const elements: DocElement[] = structure.shots.map((_shot, i) => {
    const start = scaledStarts[i];
    const nextStart = i + 1 < scaledStarts.length ? scaledStarts[i + 1] : TIMELINE_DURATION;
    const fadeDuration = Math.max(0.02, Math.min(FADE_IN, (nextStart - start) * 0.3));
    const el: ImageElement = {
      id: newElementId('shot'),
      type: 'image',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      geo: { x: 0, y: 0, w: 1, h: 1, rotation: 0 },
      src: null,
      fit: 'cover',
      ...DEFAULT_IMAGE_CROP,
      flipH: false,
      flipV: false,
      radius: 0,
      stroke: null,
      strokeWidth: 0,
      naturalW: 0,
      naturalH: 0,
      placeholder: true,
      anim: {
        preset: 'none',
        start,
        duration: fadeDuration,
        easing: 'linear',
        bezier: [...DEFAULT_BEZIER] as Bezier,
        keyframes: [],
        tracks: { opacity: fadeTrack() },
      },
    };
    return el;
  });

  const slots: TemplateSlot[] = elements.map((el, i) => ({
    id: el.id,
    elementId: el.id,
    kind: 'image',
    label: `لقطة ${i + 1} · ${structure.shots[i].duration.toFixed(1)}ث`,
  }));

  return createTemplate(name, elements, slots, sizeIdx, customW, customH);
}
