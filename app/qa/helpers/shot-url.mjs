// لقطةٌ لصفحةٍ من خادم التطوير بمحرّك WebKit (محرّك مزيج):  node qa/helpers/shot-url.mjs <path> <out.png> [w] [h]
import { webkit } from 'playwright';
const [, , path, out, w = '1920', h = '1080'] = process.argv;
const b = await webkit.launch();
const p = await b.newPage({ viewport: { width: Number(w), height: Number(h) } });
p.on('pageerror', (e) => console.error('pageerror', e.message));
await p.goto(`http://localhost:1420${path}`);
await p.waitForFunction(() => document.title === 'done', null, { timeout: 30000 });
await p.screenshot({ path: out });
await b.close();
console.log('ok', out);
