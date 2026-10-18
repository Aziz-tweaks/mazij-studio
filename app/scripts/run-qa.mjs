#!/usr/bin/env node
// `npm test` / `pnpm test` — the whole QA suite, one command.
//
// WHY THIS FILE EXISTS. The suite is 42 standalone Node programs under `qa/`,
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
    child.on('close', (code) => resolve({ code, out }));
  });
}

/** Two summary formats are in use: `N passed, M failed` in 38 specs and
 * `name: N pass, M fail` in 4 (designer-flow, migration-roundtrip,
 * motion-journey, phase1-representation). The last match in the output wins. */
function countsFrom(out) {
  const matches = [...out.matchAll(/(\d+)\s+pass(?:ed)?,\s*(\d+)\s+fail(?:ed)?/g)];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  return { pass: Number(last[1]), fail: Number(last[2]) };
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

    let pass = 0;
    let fail = 0;
    const unreadable = [];
    const nonZero = [];

    for (const file of specs) {
      console.log(`\n──── ${file} ────`);
      const { code, out } = await runSpec(file);
      const counts = countsFrom(out);
      if (counts) {
        pass += counts.pass;
        fail += counts.fail;
      } else {
        unreadable.push(file);
      }
      if (code !== 0) nonZero.push(`${file} (exit ${code})`);
    }

    console.log(`\n════ ${pass} passed, ${fail} failed · ${specs.length} suites ════`);
    if (unreadable.length) {
      console.log(`no summary line printed by: ${unreadable.join(', ')}`);
    }
    if (nonZero.length) {
      console.log(`exited non-zero: ${nonZero.join(', ')}`);
    }
    process.exitCode = fail > 0 || nonZero.length || unreadable.length ? 1 : 0;
  } finally {
    stop();
  }
}

main().catch((err) => {
  console.error('QA run could not start:', err.message);
  process.exit(1);
});
