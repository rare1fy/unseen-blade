#!/usr/bin/env node
// 11-18 微信小游戏打包（用户：「我们后续开发什么的都放在一个工程下面做，以微信小游戏这个为准」）: the WeChat mini-game project, from
// this repository, in one command:
//   npm run wx -- [--out <dir>] [--tag act-NN] [--zip <file.zip>] [--no-ios-hp]
// Default out: Desktop\不见刀_微信小游戏 (and the zip next to it, 不见刀_微信小游戏_<tag>.zip). An existing project.config.json in
// the out folder keeps its appid (the user's own AppID for scanning on a phone).
//   game.js        'use strict' + wechat/adapter.js (pxui's shims three.js needs) + wechat/glue.js (localStorage, atob, fetch of
//                  package files, image elements, the WebAudio context) + the game bundle (vite build --mode wechat)
//   assets/        body fonts and portraits (main package)
//   audio1…/       the sounds and voice lines in subpackages of ~3.8 MB, each with an empty game.js; loaded on first use
//   game.json      landscape, no status bar, the subpackages, iOS high-performance mode (JIT on iPhone; --no-ios-hp turns it off)
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = process.argv.slice(2), arg = k => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : undefined; };
const DESK = path.join(os.homedir(), 'Desktop');
const OUT = path.resolve(arg('--out') ?? path.join(DESK, '不见刀_微信小游戏'));
let TAG = arg('--tag'); if (!TAG) { try { TAG = execFileSync('git', ['describe', '--tags', '--abbrev=0'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { TAG = 'dev'; } }
const ZIP = arg('--zip') ?? (arg('--out') ? null : path.join(DESK, `不见刀_微信小游戏_${TAG}.zip`));
const HP = !A.includes('--no-ios-hp');
const kb = n => (n / 1024 / 1024).toFixed(2) + ' MB';
const size = d => { let n = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); n += e.isDirectory() ? size(p) : fs.statSync(p).size; } return n; };

// 1. the bundle
await build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), mode: 'wechat', logLevel: 'warn' });
const DW = path.join(ROOT, 'dist-wx'), bundle = fs.readFileSync(path.join(DW, 'game.js'), 'utf8'), assets = JSON.parse(fs.readFileSync(path.join(DW, 'wx-assets.json'), 'utf8'));

// 2. the project folder (the old appid survives)
let appid = 'touristappid';
try { appid = JSON.parse(fs.readFileSync(path.join(OUT, 'project.config.json'), 'utf8')).appid || appid; } catch { /* a new folder */ }
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const rd = f => fs.readFileSync(path.join(ROOT, 'wechat', f), 'utf8');
fs.writeFileSync(path.join(OUT, 'game.js'), `'use strict';\n${rd('adapter.js')}\n${rd('glue.js')}\n${bundle}`);
const subs = new Set();
for (const [to, from] of Object.entries(assets)) {
  const dst = path.join(OUT, to); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(from, dst);
  const top = to.split('/')[0]; if (/^audio\d+$/.test(top)) subs.add(top);
}
const subpackages = [...subs].sort((a, b) => +a.slice(5) - +b.slice(5)).map(n => ({ name: n, root: n + '/' }));
for (const s of subpackages) fs.writeFileSync(path.join(OUT, s.name, 'game.js'), `'use strict';\n`);
fs.writeFileSync(path.join(OUT, 'game.json'), JSON.stringify({ deviceOrientation: 'landscape', showStatusBar: false, ...(HP ? { iOSHighPerformance: true } : {}), subpackages }, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'project.config.json'), JSON.stringify({
  description: `不见刀 · ${TAG} 微信小游戏试玩`, projectname: 'unseen-blade-wechat', compileType: 'game', appid, libVersion: '3.9.0',
  setting: { es6: false, minified: false, postcss: false, enhance: false, uploadWithSourceMap: false },
  packOptions: { ignore: [{ type: 'file', value: '试玩说明.txt' }] },
}, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, '试玩说明.txt'), [
  `不见刀 · 微信小游戏试玩包（${TAG}）`, '',
  '微信开发者工具 → 小游戏 → 导入项目，选择本目录。',
  '本地编译可使用测试号。手机扫码预览时请填入你有开发权限的微信小游戏 AppID（填过的下次打包会保留）。',
  '进入战斗后，砍中敌人、见切和受击会请求手机震动。也可在暂停菜单「设置」点「试一下震动」。',
  '暂停菜单「设置」里有「画质」：自动 / 高 / 中 / 低。自动按机型选，帧率一直偏低会自己降一档。',
  '音频随包提供，按需加载各分包。微信版使用原生音频节点，房间混响取决于运行时支持；自定义正文不支持时用设备字体。', '',
].join('\r\n'));

// 3. sizes (the main package is everything outside the subpackages)
let main = 0; for (const e of fs.readdirSync(OUT, { withFileTypes: true })) { const p = path.join(OUT, e.name); if (subs.has(e.name)) continue; main += e.isDirectory() ? size(p) : fs.statSync(p).size; }
console.log(`微信小游戏工程：${OUT}`);
console.log(`  主包 ${kb(main)}（game.js ${kb(fs.statSync(path.join(OUT, 'game.js')).size)}）`);
for (const s of subpackages) console.log(`  分包 ${s.name} ${kb(size(path.join(OUT, s.name)))}`);
console.log(`  合计 ${kb(size(OUT))}；appid ${appid}；iOS 高性能模式 ${HP ? '开' : '关'}`);

// 4. the zip (Python's zipfile writes UTF-8 names with the flag set, so the Chinese folder name survives on any unzip)
if (ZIP) {
  const py = `import zipfile,os,sys\nsrc,dst=sys.argv[1],sys.argv[2]\nbase=os.path.dirname(src)\nwith zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED) as z:\n  for d,_,fs in os.walk(src):\n    for f in fs:\n      p=os.path.join(d,f); z.write(p,os.path.relpath(p,base))\n`;
  try { fs.rmSync(ZIP, { force: true }); execFileSync('python', ['-c', py, OUT, ZIP], { stdio: 'inherit' }); console.log(`  压缩包 ${ZIP}（${kb(fs.statSync(ZIP).size)}）`); }
  catch (e) { console.log('  （没打压缩包：' + (e && e.message) + '）'); }
}
