#!/usr/bin/env node
// المحكّم: يأخذ محاولةً ويحكم عليها ببنود مواصفة الهدف، بندًا بندًا.
//
// هذا هو طرفُ الحلقة الذي لا يملكه المنفّذون: يبنون، فيُحكَم عليهم بمعيارٍ كُتب
// قبل أن يبدؤوا ولا يتغيّر ليناسب ما سلّموه. وحين يسقط بندٌ فالناتج جملةٌ
// تُصلَح — «المحاذاة إلى اليمين غير متحقّقة» — لا رقمُ تشابهٍ لا يُفعَل به شيء.
//
// التشغيل:
//   node qa/replication/judge.mjs t01-sidra /path/to/attempt.png
//   node qa/replication/judge.mjs t01-sidra /path/to/attempt.png --json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreAttempt, formatReport } from './lib/score.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function main() {
  const [id, attempt] = process.argv.slice(2);
  const asJson = process.argv.includes('--json');
  if (!id || !attempt) {
    console.error('usage: node qa/replication/judge.mjs <target-id> <attempt.png> [--json]');
    process.exit(2);
  }

  const dir = path.join(__dirname, 'targets', id);
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'spec.json'), 'utf8'));
  if (!fs.existsSync(attempt)) {
    console.error(`لا محاولة عند ${attempt}`);
    process.exit(2);
  }
  const targetPng = path.join(dir, 'target.png');
  const outcome = scoreAttempt(spec, attempt, fs.existsSync(targetPng) ? targetPng : null);

  if (asJson) {
    console.log(JSON.stringify({ target: id, attempt, ...outcome }, null, 2));
  } else {
    console.log(formatReport(spec, outcome));
  }

  // رمز الخروج هو الحكم نفسه، فيصلح للاستعمال في حلقةٍ آليّة: صفرٌ يعني أن كل
  // بندٍ تحقّق. «١٠٠٪» تعني مئة بالمئة.
  process.exit(outcome.passed === outcome.total ? 0 : 1);
}

main();
