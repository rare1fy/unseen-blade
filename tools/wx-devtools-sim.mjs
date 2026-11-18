#!/usr/bin/env node
// 11-18 微信小游戏: serve a built mini-game project with wechat/devtools-sim.html (a real, read-only document + a fake wx, like the
// WeChat devtools) so tools/cap.mjs can open it:  node tools/wx-devtools-sim.mjs <projectDir> [port=8970]
//   then: node tools/cap.mjs http://127.0.0.1:8970/ out/wxsim '[{"waitFor":"window.__dhready","ms":90000},{"shot":"a"}]' 844x390 2
//   errors the page caught: window.__simErrors
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , PROJ, PORT = '8970'] = process.argv;
if (!PROJ) { console.log('usage: node tools/wx-devtools-sim.mjs <projectDir> [port]'); process.exit(1); }
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // (/__size/<subpackage>: its size in bytes — the stand-in's ?mbps= download time)
  if (p.startsWith('/__size/')) { const d = path.join(path.resolve(PROJ), p.slice(8)); let n = 0; const walk = x => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const q = path.join(x, e.name); if (e.isDirectory()) walk(q); else n += fs.statSync(q).size; } }; if (fs.existsSync(d)) walk(d); res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(String(n)); }
  const f = p === '/' ? path.join(ROOT, 'wechat', 'devtools-sim.html') : p.startsWith('/proj/') ? path.join(path.resolve(PROJ), p.slice(6)) : null;
  if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(+PORT, '127.0.0.1', () => console.log(`devtools stand-in: http://127.0.0.1:${PORT}/  (project ${path.resolve(PROJ)})`));
