#!/usr/bin/env node
// المحكّم المرئي: يأخذ مقطعًا ويحكم عليه ببنود مواصفة الهدف، بندًا بندًا.
//
// توأمُ `judge.mjs` لا بديلُه: بنودُ الصورة الساكنة هي نفسُها بعينها، مُقاسةً على
// إطارٍ مستخرجٍ عند لحظةٍ مسمّاة؛ والجديدُ وحده هو ما لا يوجد إلا لأن الزمن موجود —
// حقائقُ الحاوية، وحركةُ الدخول، وسكونُ اللقطة، وأن شيئًا تحرّك أصلًا.
//
// التشغيل:
//   node qa/replication/judge-video.mjs t00-video-calib /path/to/attempt.mp4
//   node qa/replication/judge-video.mjs t00-video-calib attempt.mp4 --json
//   node qa/replication/judge-video.mjs t00-video-calib attempt.mp4 --keep-frames
//
// و`--keep-frames` ليس ترفًا: بندٌ زمنيّ ساقطٌ يُسمّي رقمَ الإطار، ومن أراد أن
// يرى بعينه ما حكم عليه المحكّم يحتاج ذلك الملفّ على القرص.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreVideoAttempt, formatVideoReport } from './lib/score-video.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('--'));
  const [id, attempt] = args.filter((a) => !a.startsWith('--'));
  const asJson = flags.includes('--json');
  const keepFrames = flags.includes('--keep-frames');

  if (!id || !attempt) {
    console.error('usage: node qa/replication/judge-video.mjs <target-id> <attempt.mp4> [--json] [--keep-frames]');
    process.exit(2);
  }

  const dir = path.join(__dirname, 'targets', id);
  const specPath = path.join(dir, 'spec.json');
  if (!fs.existsSync(specPath)) {
    console.error(`لا مواصفةَ عند ${specPath}`);
    process.exit(2);
  }
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  if (!fs.existsSync(attempt)) {
    console.error(`لا محاولة عند ${attempt}`);
    process.exit(2);
  }

  // المرجعُ يُقرأ **إن وُجد** فقط، وللتشابه العامّ المساند وحده — كما في الصورة
  // الساكنة. فالبنود تُقاس من المحاولة نفسها، ومن استنسخ المستودع بلا مرجعٍ
  // محليٍّ يستطيع أن يُحكَم عليه بندًا بندًا ولا يفقد إلا رقمًا بلا عتبة.
  const targetVideo = path.join(dir, 'target.mp4');
  const outcome = scoreVideoAttempt(
    spec,
    attempt,
    fs.existsSync(targetVideo) && path.resolve(targetVideo) !== path.resolve(attempt) ? targetVideo : null,
    { keepFrames },
  );

  if (asJson) {
    console.log(JSON.stringify({ target: id, attempt, ...outcome }, null, 2));
  } else {
    console.log(formatVideoReport(spec, outcome));
  }

  // رمزُ الخروج هو الحكم: صفرٌ يعني أن كل بندٍ تحقّق. «١٠٠٪» تعني مئة بالمئة.
  process.exit(outcome.passed === outcome.total ? 0 : 1);
}

main();
