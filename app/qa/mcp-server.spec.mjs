#!/usr/bin/env node
// Covers roadmap item #20: Mazij as an MCP server. Proves the whole chain for
// real — not just "the schemas look right":
//
//   1. With no server process running at all, a connection attempt fails clearly
//      (the documented "app isn't running" behavior — nothing to disable).
//   2. The real Rust binary (`src-tauri/target/debug/mcp_server`, the exact same
//      `mcp.rs` module the shipped Tauri app embeds via `lib.rs`) refuses
//      `tools/call` before anyone opts in, with a clear JSON-RPC error.
//   3. A real browser tab (the actual React app, not a stub) opens the MCP
//      settings dialog and flips the real toggle — exercising the identical UI a
//      person would click — which makes the frontend register its real tool
//      catalog and start answering the bridge.
//   4. A real MCP client (plain JSON-RPC-over-HTTP, this script) calls
//      `tools/list` and sanity-checks every schema, then runs a real sequence —
//      new document → add text → apply a palette to every element → export a
//      PNG → undo — and for each step asserts the *effect*, not just a 200: the
//      in-app document state returned by `document_get` actually changed, and
//      the exported PNG is a real file with the exact requested pixel
//      dimensions (read from its own IHDR chunk, not trusted from the tool's
//      reported path).
//   5. The access-control properties, as a block of their own (`securityProbes`
//      below). These are regression tests for a CSRF that was *reproduced* with
//      curl against the packaged app, not a hypothetical: the bridge used to bind
//      at launch regardless of the UI switch, answer `tools/list` to anyone, and
//      accept `POST /enable` with a `text/plain` body (a CORS simple request, so
//      no preflight) from an arbitrary `Origin`. Assertion (1) above is part of
//      that same regression set — it failed against the real running app for
//      exactly this reason, because the socket existed before any opt-in.
//
// Why a real browser tab instead of the native Tauri window: Tauri on macOS uses
// WKWebView, which Playwright cannot drive (it only speaks to Chromium/Firefox/
// WebKit's own remote-debugging protocols, and Tauri's WKWebView isn't exposed
// that way). The frontend's bridge (`src/lib/mcpBridge.ts`) talks to the Rust
// server over plain HTTP long-polling specifically so this is possible: the same
// code runs identically whether the page is the real Tauri window or this plain
// browser tab pointed at the dev server.
//
// Run: node qa/mcp-server.spec.mjs   (dev server must be running; see BASE_URL)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bootDemo } from './helpers/boot.mjs';

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:1420';
const MCP_PORT = 7420;
const MCP_URL = `http://127.0.0.1:${MCP_PORT}/mcp`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_BIN = path.resolve(__dirname, '../src-tauri/target/debug/mcp_server');

// Every route on the bridge now requires a bearer token. In the shipped app the
// token is minted by `mcp_start` and shown in the MCP dialog for the user to paste
// into their client; here the harness owns it, hands it to the server binary
// through `MAZIJ_MCP_TOKEN`, and injects the same value into the browser tab as
// `window.__MAZIJ_MCP_TOKEN__`. Nothing ever prints or persists it — a QA binary
// that echoed a credential to stdout would be its own small version of the defect
// this file exists to guard.
const TOKEN = randomBytes(24).toString('hex');
const AUTH = { Authorization: `Bearer ${TOKEN}` };

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(msg);
    console.error('FAIL:', msg);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let rpcId = 0;
async function rpc(method, params) {
  rpcId += 1;
  const res = await fetch(MCP_URL, {
    method: 'POST',
    // Node's fetch sends no `Origin`, which is exactly how a real MCP client
    // behaves and exactly why the server can treat the presence of one as fatal.
    headers: { 'Content-Type': 'application/json', ...AUTH },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId, method, params }),
  });
  if (res.status !== 200) throw new Error(`rpc ${method} got HTTP ${res.status}, expected 200`);
  return res.json();
}

/** Status code only — these probes are about admission, not payloads. */
async function probe(url, init) {
  const res = await fetch(url, init);
  return { status: res.status, acao: res.headers.get('access-control-allow-origin') };
}

async function callTool(name, args) {
  const resp = await rpc('tools/call', { name, arguments: args ?? {} });
  if (resp.error) throw new Error(`tools/call ${name} failed: ${resp.error.message}`);
  const text = resp.result?.content?.[0]?.text ?? '{}';
  if (resp.result?.isError) throw new Error(`tool ${name} returned isError: ${text}`);
  return JSON.parse(text);
}

function pngDimensions(buf) {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('not a PNG file');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/status`, { headers: AUTH });
      // 200 (not merely "something answered") proves it is *our* server with *our*
      // token, not some other process that happened to grab the port.
      if (res.status === 200) return true;
    } catch {
      // not up yet
    }
    await sleep(150);
  }
  return false;
}

async function portIsClosed(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/status`, { headers: AUTH });
    return false;
  } catch {
    return true;
  }
}

/** The access-control regression set. Each of these corresponds to something that
 * was confirmed exploitable with curl against the packaged app before the fix. */
async function securityProbes() {
  const noToken = await probe(MCP_URL, {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert(noToken.status === 401, `POST /mcp tools/list with no bearer token must be 401 (the catalog used to be served to anyone with 200), got ${noToken.status}`);

  const wrongToken = await probe(MCP_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${'0'.repeat(TOKEN.length)}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert(wrongToken.status === 401, `POST /mcp with a wrong-but-right-length token must be 401, got ${wrongToken.status}`);

  // The exact reproduced exploit, byte for byte: a `text/plain` POST is a CORS
  // simple request, so a browser sends it with no preflight, and this used to
  // return {"enabled":true} / 200 from any page the user had open.
  const forgedEnable = await probe(`http://127.0.0.1:${MCP_PORT}/enable`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', Origin: 'https://evil.example' },
    body: '',
  });
  assert(forgedEnable.status === 403, `the reproduced CSRF (POST /enable, text/plain, Origin: https://evil.example) must be 403, got ${forgedEnable.status}`);
  assert(forgedEnable.acao === null, `a refused cross-origin request must not get an Access-Control-Allow-Origin header back (it used to get "*"), got ${forgedEnable.acao}`);

  // Even *with* the real token, an Origin header is fatal on the client surface: a
  // legitimate local MCP client never sends one, a browser always does, so this
  // closes the whole forgery class rather than one content-type trick.
  const tokenWithOrigin = await probe(MCP_URL, {
    method: 'POST',
    headers: { ...AUTH, Origin: 'https://evil.example' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert(tokenWithOrigin.status === 403, `POST /mcp with a valid token but an Origin header must be 403, got ${tokenWithOrigin.status}`);

  const sameOriginAttempt = await probe(MCP_URL, {
    method: 'POST',
    headers: { ...AUTH, Origin: 'http://localhost:1420' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert(sameOriginAttempt.status === 403, `the client surface must refuse *every* Origin, including the app's own — the bridge routes are the only browser-facing ones; got ${sameOriginAttempt.status}`);

  const preflight = await probe(MCP_URL, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert(preflight.status === 405, `OPTIONS must be refused rather than answered as a preflight, got ${preflight.status}`);
  assert(preflight.acao === null, 'a refused OPTIONS must not carry CORS headers');

  const ok = await probe(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AUTH },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert(ok.status === 200, `POST /mcp with the right token and no Origin must still be 200, got ${ok.status}`);
  assert(ok.acao === null, `a legitimate no-Origin request must get no Access-Control-Allow-Origin at all (the wildcard is what let evil.example read replies), got ${ok.acao}`);

  const bridgeNoToken = await probe(`http://127.0.0.1:${MCP_PORT}/bridge/next`, { method: 'GET' });
  assert(bridgeNoToken.status === 401, `the webview bridge surface must require the token too, got ${bridgeNoToken.status} on /bridge/next`);

  const bridgeForeignOrigin = await probe(`http://127.0.0.1:${MCP_PORT}/bridge/attach?token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', Origin: 'https://evil.example' },
    body: '{"tools":[]}',
  });
  assert(bridgeForeignOrigin.status === 403, `the bridge surface must accept only the app's own origins, got ${bridgeForeignOrigin.status} for https://evil.example`);
}

async function main() {
  // 1) Nothing listening yet — the documented "app isn't running" failure mode,
  //    and now also the documented "bridge switched off" one. This assertion is a
  //    real regression test: it *failed* against the packaged app, because
  //    `lib.rs::run()` bound the port at launch no matter what the UI said. If a
  //    Mazij window is open with the MCP switch on, this will fail again, and it
  //    should — that is the state it is measuring.
  let refused = false;
  try {
    await fetch(MCP_URL, { method: 'POST', body: '{}' });
  } catch {
    refused = true;
  }
  assert(refused, 'connecting to the MCP port before anything is listening should fail (connection refused), not hang or silently succeed — if this fails, something already holds 127.0.0.1:7420 (a Mazij window with the MCP bridge enabled?)');

  // 2) Start the real Rust server binary (same mcp.rs the shipped app embeds). It
  //    refuses to bind without a token, so there is no unauthenticated mode to
  //    accidentally test against.
  const startServer = () => spawn(SERVER_BIN, [], { stdio: 'ignore', env: { ...process.env, MAZIJ_MCP_TOKEN: TOKEN } });
  let server = startServer();
  try {
    const up = await waitForPort(MCP_PORT, 10_000);
    assert(up, 'mcp_server binary did not start listening in time — did you `cargo build --bin mcp_server`?');

    // 2b) The whole access-control surface, before anything else touches it.
    await securityProbes();

    // 3) Disabled by default: tools/call must be refused with a clear error. A
    //    bound socket is not an opted-in bridge — the headless binary binds with no
    //    window attached, which is exactly this state.
    const disabledResp = await rpc('tools/call', { name: 'document_get', arguments: {} });
    assert(disabledResp.error && disabledResp.error.code === -32000, 'tools/call before opt-in should return a clear "disabled" JSON-RPC error, not succeed or hang');

    // 4) Real browser tab, real UI click to opt in.
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      // The page cannot invoke `mcp_start` (no Tauri here), so the harness plays
      // the part the user plays in the real app: it supplies the token the dialog
      // would have displayed.
      await page.addInitScript((token) => {
        window.__MAZIJ_MCP_TOKEN__ = token;
      }, TOKEN);
      // The MCP controls live in the TopBar's more-tools menu, which only exists
      // in the editor — so the editor has to be opened explicitly now that the
      // app boots on the start screen. The demo document is used (rather than a
      // blank one) because the tool-catalog assertions below operate on real
      // elements, exactly as they always did.
      await bootDemo(page, BASE_URL);
      await page.locator('[data-testid="more-tools-btn"]').click();
      await page.click('[data-testid="open-mcp-btn"]');
      assert(await page.locator('[data-testid="mcp-dialog"]').isVisible(), 'MCP settings dialog should open from the TopBar button');
      // Before opting in, the dialog must say so in terms the user can check —
      // the old copy claimed "off" while a socket was wide open.
      const offText = await page.locator('[data-testid="mcp-listen-state"]').innerText();
      assert(/7420/.test(offText), `with the bridge off the dialog must name the port that is NOT listening, got "${offText}"`);
      assert((await page.locator('[data-testid="mcp-token"]').count()) === 0, 'no bearer token should be shown while the bridge is off — there is no listening period to have minted one');

      await page.click('[data-testid="mcp-toggle-btn"]');
      await page.waitForSelector('[data-testid="mcp-status"]:has-text("نشط"), [data-testid="mcp-status"]:has-text("Active")', { timeout: 5000 });
      // The token the user has to paste into their MCP client must actually be on
      // screen, and must be the one this listening period accepts.
      const shownToken = (await page.locator('[data-testid="mcp-token"]').innerText()).trim();
      assert(shownToken === TOKEN, `the MCP dialog must display the bearer token for the current listening period, got "${shownToken}"`);
      await page.click('[data-testid="close-mcp-btn"]');
      assert(await page.locator('[data-testid="mcp-active-badge"]').isVisible(), 'an active badge should be visible in the TopBar once the server is enabled (opt-in must be surfaced in the UI)');

      // Give the frontend's long-poll loop a moment to register its real tool
      // catalog with the Rust server.
      let toolsResp;
      for (let i = 0; i < 20; i++) {
        toolsResp = await rpc('tools/list', {});
        if ((toolsResp.result?.tools ?? []).length > 0) break;
        await sleep(300);
      }
      const tools = toolsResp.result?.tools ?? [];
      assert(tools.length >= 18, `expected a real catalog of MCP tools (>=18), got ${tools.length}`);
      for (const t of tools) {
        assert(typeof t.name === 'string' && t.name.length > 0, `tool is missing a name: ${JSON.stringify(t)}`);
        assert(typeof t.description === 'string' && t.description.length > 0, `tool "${t.name}" is missing a description`);
        assert(t.inputSchema && t.inputSchema.type === 'object', `tool "${t.name}" inputSchema must be a JSON-schema object`);
        if (Array.isArray(t.inputSchema.required)) {
          const propKeys = Object.keys(t.inputSchema.properties ?? {});
          for (const req of t.inputSchema.required) {
            assert(propKeys.includes(req), `tool "${t.name}" lists "${req}" as required but it isn't in properties`);
          }
        }
      }
      const names = new Set(tools.map((t) => t.name));
      for (const expected of ['document_new', 'document_get', 'element_add_text', 'document_set_palette', 'export_run', 'undo']) {
        assert(names.has(expected), `expected tool "${expected}" in the catalog`);
      }

      // 5) The real sequence: new doc -> add text -> apply palette -> export PNG -> undo.
      const created = await callTool('document_new', { sizeId: 'ig' });
      assert(created.elementCount === 0 && created.size.w === 1080 && created.size.h === 1080, `document_new should produce a blank 1080x1080 doc, got ${JSON.stringify(created.size)} / ${created.elementCount} elements`);

      const added = await callTool('element_add_text', { text: 'عنوان العرض', fontSize: 64 });
      assert(typeof added.id === 'string' && added.element?.text === 'عنوان العرض', 'element_add_text should return the real new element with the requested text');

      const afterAdd = await callTool('document_get', {});
      assert(afterAdd.elementCount === 1 && afterAdd.elements[0].color === null, 'document_get should reflect the real in-app state: one text element, no color override yet');

      // Give the element a manual color override first, so applying a palette to
      // every element has something real to actually clear (the app's documented
      // behavior: applyPaletteToAll intentionally drops manual overrides so every
      // element follows the new palette — see docs/CONTROLS.md phase 7/§5).
      await callTool('element_set_text_style', { id: added.id, color: '#ff0000' });
      const afterManualColor = await callTool('document_get', {});
      assert(afterManualColor.elements[0].color === '#ff0000', 'element_set_text_style should really set the manual color override');

      await callTool('document_set_palette', { paletteIndex: 2, applyToAllElements: true });
      const afterPalette = await callTool('document_get', {});
      assert(afterPalette.paletteIndex === 2, 'document_set_palette should change the live postPalette index');
      assert(afterPalette.elements[0].color === null, 'applyToAllElements:true should really clear the manual color override so the element follows the palette (not leave the old manual color in place)');

      const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
      const exportPromise = callTool('export_run', { targets: ['ig'], format: 'png', scale: 1 });
      const [download, exportResult] = await Promise.all([downloadPromise, exportPromise]);
      assert(exportResult.state === 'done' && exportResult.paths.length === 1, `export_run should report a completed export with one path, got ${JSON.stringify(exportResult)}`);

      const savedPath = path.join('/tmp', `mazij-mcp-qa-${Date.now()}.png`);
      await download.saveAs(savedPath);
      try {
        const bytes = readFileSync(savedPath);
        assert(bytes.length > 500, 'exported PNG should be a real non-trivial file, not an empty/stub one');
        const dims = pngDimensions(bytes);
        assert(dims.width === 1080 && dims.height === 1080, `exported PNG should be 1080x1080 (artboard size × scale 1), got ${dims.width}x${dims.height}`);
      } finally {
        rmSync(savedPath, { force: true });
      }

      await callTool('undo', {});
      const afterUndo = await callTool('document_get', {});
      assert(afterUndo.elements[0].color === '#ff0000', 'undo should really revert the applyPaletteToAll mutation in the live app, back to the manual color override');

      // 5b) The disable→enable regression, with the *same page* still open. In the
      //     shipped app each toggle destroys and recreates the listener; the page
      //     keeps running and must re-attach to the new one. It did not, for two
      //     separate reasons found against the packaged app — a rejected POST body
      //     left unread desynced the keep-alive connection, and a request WebKit
      //     sent down a socket belonging to the destroyed listener was never
      //     answered at all, parking the poll loop forever. Both produced the same
      //     silent failure: listening, tokenised, connected, and deaf. Killing and
      //     respawning the binary around a real UI toggle is the closest a
      //     Tauri-less harness gets to that, and it reproduces the same handoff.
      await page.locator('[data-testid="more-tools-btn"]').click();
      await page.click('[data-testid="open-mcp-btn"]');
      await page.click('[data-testid="mcp-toggle-btn"]'); // off
      await sleep(500);
      server.kill();
      await sleep(500);
      server = startServer();
      assert(await waitForPort(MCP_PORT, 10_000), 'the replacement listener should come up on the same port');
      await page.click('[data-testid="mcp-toggle-btn"]'); // on
      await page.click('[data-testid="close-mcp-btn"]');

      let reattached = false;
      for (let i = 0; i < 40; i++) {
        const res = await fetch(`http://127.0.0.1:${MCP_PORT}/status`, { headers: AUTH });
        const st = await res.json();
        if (st.enabled && st.toolCount >= 18) {
          reattached = true;
          break;
        }
        await sleep(300);
      }
      assert(reattached, 'after disable → enable the page must re-attach to the new listener (real catalog, enabled) instead of leaving a listening-but-deaf bridge');

      const afterReattach = await callTool('document_get', {});
      assert(afterReattach.elementCount === 1, 'tools/call must work again through the re-attached bridge, against the same live document');
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }

  // 6) The listener's lifetime really is bounded: once the process that bound the
  //    port is gone the port is gone, and the same port can be bound again
  //    immediately without "address already in use". In the shipped app this is
  //    what `mcp_start`/`mcp_stop` do per toggle (`mcp::stop()` unblocks the accept
  //    loop, joins it and drops the `Server`); here it is the same `mcp.rs`
  //    bind/rebind path, exercised the only way a Tauri-less harness can.
  let closed = false;
  for (let i = 0; i < 40; i++) {
    if (await portIsClosed(MCP_PORT)) {
      closed = true;
      break;
    }
    await sleep(100);
  }
  assert(closed, 'after the server stops, nothing may still be listening on 127.0.0.1:7420');

  const again = spawn(SERVER_BIN, [], { stdio: 'ignore', env: { ...process.env, MAZIJ_MCP_TOKEN: TOKEN } });
  try {
    assert(await waitForPort(MCP_PORT, 10_000), 'rebinding 127.0.0.1:7420 straight after a shutdown must succeed — enable → disable → enable must never hit "address already in use"');
  } finally {
    again.kill();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.error('\nFailures:');
    failures.forEach((f) => console.error(' -', f));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
