#!/usr/bin/env node
// عميلٌ صغير لخادم مزيج المحلّي (MCP) — ما يفعله Claude Code حين يُربَط، بلا نموذج:
//   node scripts/mcp-call.mjs <tool> '<json args>'
//   node scripts/mcp-call.mjs --list
// يقرأ العنوانَ والرمزَ من ملفّ النقطة الذي يكتبه التطبيقُ وهو يعمل.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const file = join(homedir(), 'Library/Application Support/studio.mazij.app/mcp-endpoint.json');
let ep;
try {
  ep = JSON.parse(readFileSync(file, 'utf8'));
} catch {
  console.error('Mazij is not running with the AI link on (no endpoint file).');
  process.exit(2);
}
const url = ep.url ?? `http://127.0.0.1:${ep.port}/mcp`;
let rid = 1;
export async function rpc(method, params) {
  // `http` لا `fetch`: التصديرُ الطويل يُبقي الردَّ دقائق، ومهلةُ fetch في Node (خمسُ دقائق
  // للرؤوس) كانت تقطعه والتصديرُ ماضٍ في مزيج. الخادمُ نفسُه يحدّ كلَّ أداةٍ بمهلتها.
  const { request } = await import('node:http');
  const payload = JSON.stringify({ jsonrpc: '2.0', id: rid++, method, params });
  const text = await new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), authorization: `Bearer ${ep.token}` } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end(payload);
  });
  const body = JSON.parse(text);
  if (body.error) throw new Error(JSON.stringify(body.error));
  return body.result;
}
export async function call(name, args = {}) {
  const r = await rpc('tools/call', { name, arguments: args });
  const text = r?.content?.map((c) => c.text).join('\n') ?? '';
  if (r?.isError) throw new Error(`${name}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , tool, json] = process.argv;
  if (tool === '--list') {
    const r = await rpc('tools/list', {});
    for (const t of r.tools) console.log(t.name);
  } else {
    console.log(JSON.stringify(await call(tool, json ? JSON.parse(json) : {}), null, 2));
  }
}
