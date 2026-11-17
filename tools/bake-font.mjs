#!/usr/bin/env node
// Bake the pixel font into ui/font.js (a 1-bit 16px glyph atlas, drawn by src/present/v2/pix.ts).
// Font: 「长坂点宋 16」 ChangBanDianSong 16 SC (16px bitmap bold Song, SIL OFL 1.1, github.com/yzdnn/ChangBanDianSong-16, v1.3.2) —
// act-34 用户：「我们的长坂点宋字体要用16号的版本。」(the 12 px one was the user's pick on 2026-11-16); any character it lacks falls back to Fusion Pixel 12px (fonts/fusion-pixel, also OFL). Rasterised in headless Chrome
// (tools/cdp.mjs drives the installed Chrome). Character set: GB2312 level-1 + ASCII + common CJK punctuation + every non-ASCII char in
// src/**/*.{ts,js,json}.
// Usage: node tools/bake-font.mjs [--extra "字符"]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONT = path.join(ROOT, 'fonts/changban16/ChangBanDianSong-16-SC.ttf'), Z = 16;   // the font's pixel size
const FALLBACK = path.join(ROOT, 'fonts/fusion-pixel/fusion-pixel-12px-zh_hans.woff2');
/** the 3755 most common hanzi (GB2312 level 1) */
function gb2312Level1() { const td = new TextDecoder('gbk'); let s = ''; for (let hi = 0xB0; hi <= 0xD7; hi++) for (let lo = 0xA1; lo <= 0xFE; lo++) { if (hi === 0xD7 && lo > 0xF9) break; s += td.decode(new Uint8Array([hi, lo])); } return s; }
/** printable ASCII + common CJK punctuation and symbols (same set as pxui's BASE_CHARS) */
const BASE_CHARS = String.fromCharCode(...Array.from({ length: 95 }, (_, i) => 32 + i)) +
  '，。、；：？！“”‘’（）《》【】「」『』…—～·％＋－×÷＝＜＞０１２３４５６７８９　①②③④⑤⑥⑦⑧⑨⑩←↑→↓★☆●○■□▲△◆◇♥♦♣♠✓✕';

export function scanGameChars() {
  const out = new Set();
  const add = f => { if (!fs.existsSync(f)) return; for (const ch of fs.readFileSync(f, 'utf8')) if (ch.codePointAt(0) > 0x7e) out.add(ch); };
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|js|json)$/.test(e.name)) add(p); } };
  walk(path.join(ROOT, 'src'));
  return [...out].join('');
}

// runs in the page: both fonts loaded; each char drawn 8× (96px, baseline at the 长坂 ascent 880/1024 × 96 = 82.5 px, where its outline
// edges fall on multiples of 8 px) and read at the centre of every 8×8 cell — drawing at 12px straight blurs it half a pixel (the
// strokes' 1-px gaps fill in). Kept when it isn't the fallback's missing-glyph box.
const PAGE = `async (chars, Z) => {
  const cb = new FontFace('UbChangban', 'url(/changban.ttf)'), fp = new FontFace('UbFusion', 'url(/fusion.woff2)');
  await cb.load(); await fp.load(); document.fonts.add(cb); document.fonts.add(fp);
  const S = 8, CW = Z + 4, c = new OffscreenCanvas(CW * S, Z * S), g = c.getContext('2d', { willReadFrequently: true });
  g.font = (Z * S) + 'px UbChangban, UbFusion'; g.textBaseline = 'alphabetic'; const base = 880 / 1024 * Z * S;
  const raster = ch => { g.clearRect(0, 0, CW * S, Z * S); g.fillStyle = '#fff'; g.fillText(ch, 0, base);
    let adv = Math.round(g.measureText(ch).width / S); if (!(adv > 0)) return null; adv = Math.min(16, adv);
    const img = g.getImageData(0, 0, CW * S, Z * S).data, bits = new Uint8Array(adv * Z);
    for (let y = 0; y < Z; y++) for (let x = 0; x < adv; x++) if (img[((y * S + S / 2) * CW * S + x * S + S / 2) * 4 + 3] >= 128) bits[y * adv + x] = 1;
    return { adv, bits }; };
  const nd = raster('\\uE000'), notdef = nd ? nd.bits.join('') : '';
  const list = [...new Set([...chars])].filter(ch => ch !== '\\n' && ch !== '\\r' && ch !== '\\t'), ok = [], adv = [], all = [], missing = [];
  for (const ch of list) { const r = raster(ch); if (!r || (ch !== ' ' && r.bits.join('') === notdef)) { missing.push(ch); continue; } ok.push(ch); adv.push((r.adv - 1).toString(16)); for (const b of r.bits) all.push(b); }
  const bytes = new Uint8Array(Math.ceil(all.length / 8)); for (let i = 0; i < all.length; i++) if (all[i]) bytes[i >> 3] |= 128 >> (i & 7);
  const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = '';
  for (let i = 0; i < bytes.length; i += 3) { const a = bytes[i], b = bytes[i + 1], d = bytes[i + 2], v = (a << 16) | ((b || 0) << 8) | (d || 0); s += B[v >> 18 & 63] + B[v >> 12 & 63] + (i + 1 < bytes.length ? B[v >> 6 & 63] : '=') + (i + 2 < bytes.length ? B[v & 63] : '='); }
  // adv: one hex digit per glyph, the advance minus one (16 px wide fits in a digit); advOff tells the reader
  return { font: { name: 'changban-dian-song-' + Z, size: Z, advOff: 1, chars: ok.join(''), adv: adv.join(''), bits: s }, missing, count: ok.length, bytes: bytes.length };
}`;

async function bake(chars) {
  const files = { '/changban.ttf': [FONT, 'font/ttf'], '/fusion.woff2': [FALLBACK, 'font/woff2'] };
  const srv = http.createServer((req, res) => { const u = new URL(req.url, 'http://x').pathname;
    if (u === '/bake.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><meta charset="utf-8"><body>bake</body>'); }
    const f = files[u]; if (!f) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f[1] }); res.end(fs.readFileSync(f[0])); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port; const br = await launch();
  try { const p = await br.newPage(); await p.goto(`http://127.0.0.1:${port}/bake.html`, 'document.readyState==="complete"');
    const r = await p.eval(`(${PAGE})(${JSON.stringify(chars)}, ${Z})`, 120000); p.close(); return r; } finally { await br.close(); srv.close(); }
}

const args = process.argv.slice(2), xi = args.indexOf('--extra');
const scanned = scanGameChars();
const chars = [...new Set([...BASE_CHARS, ...gb2312Level1(), ...scanned, ...(xi >= 0 ? args[xi + 1] : '')])].join('');
console.log(`字库: 烘焙 ${[...chars].length} 字（游戏内扫到 ${[...scanned].length} 个非 ASCII 字符）…`);
const r = await bake(chars);
const out = path.join(ROOT, 'ui', 'font.js');
fs.writeFileSync(out, `// generated by tools/bake-font.mjs — 长坂点宋 12 / ChangBanDianSong 12 (SIL OFL 1.1; missing glyphs from Fusion Pixel 12px, OFL), ${r.count} glyphs, ${r.bytes} bytes of 1-bit bitmaps.\n// Re-bake after adding new text: npm run font\nexport default ${JSON.stringify(r.font)};\n`);
console.log(`ui/font.js: ${r.count} 字, ${(fs.statSync(out).size / 1024).toFixed(0)} KB` + (r.missing.length ? `\n两套字体都没有（${r.missing.length}）: ${r.missing.slice(0, 80).join('')}` : ''));
process.exit(0);
