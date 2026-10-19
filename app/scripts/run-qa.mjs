#!/usr/bin/env node
// `npm test` / `pnpm test` — the whole QA suite, one command.
//
// WHY THIS FILE EXISTS. The suite is 45 standalone Node programs under `qa/`,
// each of which launches Playwright itself, prints `N passed, M failed` and
// exits non-zero if anything failed. It has always been run by hand, in two
// steps, in two terminals:
//
//     npm run dev                      # Vite on :1420, left running
//     for f in qa/*.mjs; do node "$f"; done
//
// That is exactly what this script does — same files, same order, same `node`
// invocation, same pass/fail judgement from the same exit codes. Nothing here
// interprets a test; it starts the dev server the specs need, runs them one at a
// time, adds up the two summary formats they print, and stops the server. No
// assertion, no spec, and no threshold lives in this file.
//
// WHY IT COUNTS SUITES AND NOT ONLY ASSERTIONS. A measured defect, reproduced
// deliberately before it was fixed: this runner reported a crashed suite as
// `0 passed, 0 failed` and exited 0, so `npm test` was green about work it had
// not measured. The path is quiet. Several specs own a `pass`/`fail` counter and
// print it from a `finally`; when such a spec dies before its first assertion,
// its counters are still at zero, so it prints a perfectly parseable
// `0 passed, 0 failed` and exits 0 because `fail` was never incremented. This
// runner then summed zero, added nothing to the totals, and called the run a
// success. The observed reproduction: a run of two suites where one had died
// printed `34 passed, 0 failed` and exited 0.
//
// The totals alone cannot catch that — reading them correctly requires already
// knowing what the total should be, which is exactly the knowledge a test suite
// is supposed to supply. So the run is judged on two numbers, not one:
//
//   1. every assertion that passed or failed, and
//   2. how many of the suites launched actually reported a measurement.
//
// A suite counts as *measured* only when it printed a parseable summary that
// accounts for at least one assertion. Fewer measured than launched is itself a
// failure, named suite by suite, regardless of how the assertions went. Silence
// is the loudest thing this script can report.
//
// And a suite that died is reported apart from a suite that failed: failing
// assertions are a defect in the app, while a suite that never printed is a
// defect in the measurement, and the two are not fixed in the same place.
//
// WHY NOT `pretest`. The dev server has to be alive *during* the run, not before
// it, so it cannot be a `pretest` step — a `pretest` process would be reaped
// before the first spec opened a browser. Hence one script that owns the
// server's whole lifetime.
//
// Env:
//   QA_PORT   port for the dev server (default 1420). Set this when another
//             worktree of this repo already holds 1420 — see
//             qa/helpers/port-redirect.mjs for why that matters.
//   QA_SPECS  space- or comma-separated spec names to run instead of all of
//             them, e.g. QA_SPECS="engine timeline".

import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QA_DIR = path.join(APP_DIR, 'qa');
const PORT = String(process.env.QA_PORT || 1420);
const BASE_URL = `http://localhost:${PORT}`;
// The port the specs that hardcode a URL were written against; the redirect
// preload rewrites that host:port and nothing else.
const FROM_PORT = '1420';

/** The suite, in the order the shell glob produced it. Every runnable spec is a
 * top-level `qa/*.spec.mjs`; the `.mjs` files under `qa/helpers`, `qa/migration`
 * and `qa/replication` are libraries and one-shot tools, not specs, and the
 * documented `qa/*.mjs` glob never reached them. */
function listSpecs() {
  const all = fs
    .readdirSync(QA_DIR)
    .filter((f) => f.endsWith('.spec.mjs'))
    .sort();
  const wanted = (process.env.QA_SPECS || '').split(/[\s,]+/).filter(Boolean);
  if (!wanted.length) return all;
  return wanted.map((name) => {
    const file = name.endsWith('.spec.mjs') ? name : `${name}.spec.mjs`;
    if (!all.includes(file)) throw new Error(`QA_SPECS names a spec that does not exist: ${file}`);
    return file;
  });
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: Number(port) });
    socket.setTimeout(700);
    socket.on('connect', () => (socket.destroy(), resolve(true)));
    socket.on('timeout', () => (socket.destroy(), resolve(false)));
    socket.on('error', () => resolve(false));
  });
}

/** Both address families, because a Vite dev server on macOS can end up
 * listening on `[::1]` only — so an IPv4-only probe reports a held port as free,
 * and then `localhost` resolves to `::1` and the whole run quietly measures the
 * *other* server. That is not hypothetical; it happened while this script was
 * being written. */
async function portIsBusy(port) {
  const results = await Promise.all([canConnect('127.0.0.1', port), canConnect('::1', port)]);
  return results.some(Boolean);
}

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function startDevServer() {
  const vite = path.join(APP_DIR, 'node_modules', '.bin', 'vite');
  if (!fs.existsSync(vite)) {
    throw new Error(`vite is not installed at ${vite} — run your package manager's install first`);
  }
  const child = spawn(vite, ['--port', PORT, '--strictPort'], {
    cwd: APP_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  return child;
}

function runSpec(file) {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(
      process.execPath,
      ['--import', './qa/helpers/port-redirect.mjs', path.join('qa', file)],
      {
        cwd: APP_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, QA_PORT: PORT, QA_FROM_PORT: FROM_PORT, QA_BASE_URL: BASE_URL },
      },
    );
    child.stdout.on('data', (d) => ((out += d), process.stdout.write(d)));
    child.stderr.on('data', (d) => ((out += d), process.stderr.write(d)));
    // A spawn that never starts must not look like a spec that ran and said
    // nothing: it is reported as its own crash, with the reason.
    child.on('error', (err) => resolve({ code: null, out: `${out}\n[spawn failed] ${err.message}` }));
    child.on('close', (code) => resolve({ code, out }));
  });
}

/** Two summary formats are in use: `N passed, M failed` in 41 specs and
 * `name: N pass, M fail` in 4 (designer-flow, migration-roundtrip,
 * motion-journey, phase1-representation). The last match in the output wins.
 * Both shapes go through this one regex, so neither can be misread as missing. */
function countsFrom(out) {
  const matches = [...out.matchAll(/(\d+)\s+pass(?:ed)?,\s*(\d+)\s+fail(?:ed)?/g)];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  return { pass: Number(last[1]), fail: Number(last[2]) };
}

/** Judge one finished spec, and say which of the two different problems it has.
 *
 *   ok       — printed a summary, accounted for at least one assertion, every
 *              one of them passed, and exited 0.
 *   failed   — the app is wrong: the suite ran and reported failing assertions.
 *   crashed  — the measurement is wrong: the suite produced no usable number.
 *
 * A suite is `crashed` in three distinguishable ways, each named in the output:
 * it printed no summary at all; it printed a summary accounting for zero
 * assertions (the quiet shape documented at the top of this file — a swallowed
 * exception leaves the counters at zero and the spec exits 0); or it printed a
 * clean summary and then died anyway, which means the run it reported on was not
 * the run that finished. */
function classify(file, code, out) {
  const counts = countsFrom(out);
  const exited = code === null ? 'killed by a signal, no exit code' : `exit ${code}`;
  if (!counts) {
    return { file, counts: null, kind: 'crashed', why: `printed no summary line at all (${exited})` };
  }
  if (counts.pass + counts.fail === 0) {
    return {
      file,
      counts,
      kind: 'crashed',
      why: `printed a summary that measures nothing — 0 passed, 0 failed (${exited}); it died before its first assertion`,
    };
  }
  if (counts.fail > 0) {
    return {
      file,
      counts,
      kind: 'failed',
      why: `${counts.fail} failing assertion${counts.fail === 1 ? '' : 's'} out of ${counts.pass + counts.fail} (${exited})`,
    };
  }
  if (code !== 0) {
    return {
      file,
      counts,
      kind: 'crashed',
      why: `printed ${counts.pass} passed, 0 failed and then died — ${exited}; the summary describes a run that did not finish`,
    };
  }
  return { file, counts, kind: 'ok', why: null };
}

/** Did the suite report a summary that accounts for anything at all? This is the
 * predicate the launched-vs-reported reconciliation is built on: the runner
 * knows what it launched, so a launched suite that never reported is a hole it
 * can see without being told what the total ought to be. */
function reportedSummary(result) {
  return Boolean(result.counts) && result.counts.pass + result.counts.fail > 0;
}

/** May the suite's numbers go into the run totals? Only from a suite that
 * finished. A suite that printed `12 passed, 0 failed` and then died reported a
 * summary — so it is not "missing" — but it was describing a run that did not
 * complete, so lending its 12 to the totals would inflate them with assertions
 * whose suite never got to the end. Reported and trusted are two questions. */
function countsTowardTotals(result) {
  return result.kind === 'ok' || result.kind === 'failed';
}

async function main() {
  const specs = listSpecs();
  let server = null;

  // Deliberately NOT reusing whatever already holds the port. With two worktrees
  // of this repo open at once, a reused server belongs to whichever one started
  // first, and the run would report a green suite about code that is not on this
  // branch — the exact failure qa/helpers/port-redirect.mjs was written to stop.
  // So a busy port is a hard stop with the way out named, not a silent reuse.
  if (await portIsBusy(PORT)) {
    throw new Error(
      `port ${PORT} is already in use — something else is serving ${BASE_URL}, and ` +
        `running against it would measure that build, not this worktree's. ` +
        `Pick a free port instead: QA_PORT=1457 npm test`,
    );
  }
  console.log(`→ starting the dev server on ${BASE_URL}`);
  server = startDevServer();

  const stop = () => {
    if (server && !server.killed) server.kill('SIGTERM');
  };
  process.on('SIGINT', () => (stop(), process.exit(130)));
  process.on('SIGTERM', () => (stop(), process.exit(143)));

  try {
    if (!(await waitForServer(BASE_URL))) {
      throw new Error(`the dev server never answered on ${BASE_URL}`);
    }

    const results = [];

    for (const file of specs) {
      console.log(`\n──── ${file} ────`);
      const { code, out } = await runSpec(file);
      const result = classify(file, code, out);
      results.push(result);
      // Echo what this runner actually read out of the spec's own output, per
      // suite. Without it the totals are unauditable: a wrong total tells you
      // only that something is wrong somewhere in 45 suites.
      console.log(
        result.kind === 'ok'
          ? `  ↳ counted ${result.counts.pass} passed, ${result.counts.fail} failed`
          : `  ↳ ${result.kind.toUpperCase()}: ${result.why}`,
      );
    }

    const counted = results.filter(countsTowardTotals);
    const neverReported = results.filter((r) => !reportedSummary(r));
    const crashed = results.filter((r) => r.kind === 'crashed');
    const failed = results.filter((r) => r.kind === 'failed');

    let pass = 0;
    let fail = 0;
    for (const r of counted) {
      pass += r.counts.pass;
      fail += r.counts.fail;
    }

    // `counted/launched` is in the headline on purpose. It is the one number
    // that cannot be read as green while a suite is missing, and it is the
    // number the old headline left out — it printed the launched count beside
    // the totals, which reads as though every launched suite was in them.
    console.log(
      `\n════ ${pass} passed, ${fail} failed · ${counted.length}/${specs.length} suites counted ════`,
    );

    if (crashed.length) {
      console.log(
        `\n✗ CRASHED — ${crashed.length} of ${specs.length} suites produced no usable measurement:`,
      );
      for (const r of crashed) console.log(`    · ${r.file} — ${r.why}`);
      console.log('  A crashed suite is a defect in the measurement, not a passing suite.');
    }

    if (failed.length) {
      console.log(
        `\n✗ FAILING ASSERTIONS — ${failed.length} suite${failed.length === 1 ? '' : 's'}:`,
      );
      for (const r of failed) console.log(`    · ${r.file} — ${r.why}`);
    }

    // The reconciliation, stated as arithmetic even when the bucket above
    // already named the same files: the runner knows what it launched, so a
    // launched suite that never reported is a hole it is able to see on its own.
    if (neverReported.length) {
      const reported = specs.length - neverReported.length;
      console.log(
        `\n✗ COUNT MISMATCH — launched ${specs.length} suites, ${reported} reported a summary, ` +
          `${neverReported.length} never reported at all: ${neverReported.map((r) => r.file).join(', ')}`,
      );
      console.log(
        '  The assertion totals above are therefore incomplete and must not be quoted as the suite.',
      );
    }

    const green = fail === 0 && !crashed.length && !failed.length && !neverReported.length;
    process.exitCode = green ? 0 : 1;
    if (green) {
      console.log(
        `✓ all ${specs.length} suites launched reported and finished, and every assertion passed`,
      );
    } else {
      console.log('\n✗ QA RUN FAILED');
    }
  } finally {
    stop();
  }
}

main().catch((err) => {
  console.error('QA run could not start:', err.message);
  process.exit(1);
});
