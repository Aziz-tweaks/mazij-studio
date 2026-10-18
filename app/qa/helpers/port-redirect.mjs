// A Node `--import` preload that points every spec's hardcoded
// `http://localhost:1420` at whatever `QA_PORT` says instead. Not a fix for
// anything — a way to run the suite against *this* worktree's dev server when
// port 1420 is already held by another worktree's.
//
// WHY THIS EXISTS AND WHY IT IS NOT A SPEC EDIT. 31 of the 40 spec files write
// `const BASE_URL = 'http://localhost:1420'` as a literal (the other 9 already
// read `QA_BASE_URL`). With two worktrees of this repo open at once, 1420 belongs
// to whichever dev server started first, so a spec run from here would silently
// measure *someone else's* build and report a green suite about code that is not
// on this branch. That is the worst possible failure mode for a phase whose whole
// job is proving a migration, so the redirect happens in the harness rather than
// by rewriting a URL in 31 files that this phase has no other reason to touch.
//
// It rewrites only the host:port of a `page.goto` target, and only when the
// target names the port being redirected away from. Everything else — the paths,
// the wait conditions, the assertions — is untouched.
//
// Usage: node --import ./qa/helpers/port-redirect.mjs qa/some.spec.mjs
// Env:   QA_PORT (default 1443), QA_FROM_PORT (default 1420)

import { chromium } from 'playwright';

const FROM = process.env.QA_FROM_PORT || '1420';
const TO = process.env.QA_PORT || '1443';

/** `http://localhost:1420/x` → `http://localhost:1443/x`; anything else is
 * returned byte-identical, so a spec that already reads `QA_BASE_URL` and was
 * handed the right port is not touched twice. */
function redirect(url) {
  if (typeof url !== 'string') return url;
  return url.replace(
    new RegExp(`^(https?://(?:localhost|127\\.0\\.0\\.1|\\[::1\\])):${FROM}\\b`),
    `$1:${TO}`,
  );
}

/** Wraps one `Page` so `goto` redirects, leaving every other method as-is. The
 * wrapper is a Proxy rather than a copy because specs reach for a wide and
 * growing slice of the Page API (`locator`, `evaluate`, `keyboard`, `mouse`,
 * `waitForSelector`, `$$eval`, …) and enumerating it here would rot. */
function wrapPage(page) {
  return new Proxy(page, {
    get(target, prop, receiver) {
      if (prop === 'goto') {
        return (url, ...rest) => target.goto(redirect(url), ...rest);
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function wrapPageFactory(host) {
  return new Proxy(host, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop === 'newPage') {
        return async (...args) => wrapPage(await target.newPage(...args));
      }
      if (prop === 'newContext') {
        return async (...args) => wrapPageFactory(await target.newContext(...args));
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

const originalLaunch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => wrapPageFactory(await originalLaunch(...args));

const originalLaunchPersistent = chromium.launchPersistentContext?.bind(chromium);
if (originalLaunchPersistent) {
  chromium.launchPersistentContext = async (...args) =>
    wrapPageFactory(await originalLaunchPersistent(...args));
}
