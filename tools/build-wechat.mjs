#!/usr/bin/env node
// 11-18 微信小游戏打包（用户：「我们后续开发什么的都放在一个工程下面做，以微信小游戏这个为准」）: the WeChat mini-game project, from
// this repository, in one command:
//   npm run wx -- [--out <dir>] [--tag act-NN] [--zip <file.zip>] [--no-ios-hp] [--no-ios-hp-plus]
// Default out: Desktop\不见刀_微信小游戏 (no zip by default; pass --zip <file.zip> if a zip archive is needed). An existing project.config.json in
// the out folder keeps its appid (the user's own AppID for scanning on a phone).
//   game.js        'use strict' + wechat/adapter.js (pxui's shims three.js needs) + wechat/glue.js (localStorage, atob, fetch of
//                  package files, image elements, the WebAudio context) + the game bundle (vite build --mode wechat)
//   assets/        body fonts and portraits (main package)
//   audio1…/       the sounds and voice lines in subpackages of ~3.8 MB, each with an empty game.js; loaded on first use
//   game.json      landscape, no status bar, the subpackages, iOS high-performance mode (JIT on iPhone; --no-ios-hp turns it off) and
//                  high-performance+ (11-19 用户：「我们把高性能+做了吧」: rendering back in WeChat's process, WebGL2 on every iOS — WeChat
//                  ≥ 8.0.45, older clients fall back to plain high-performance; --no-ios-hp-plus turns it off)
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
const ZIP = arg('--zip') ?? null;
const REUSE_SCENES = A.includes('--reuse-scenes');
const HP = !A.includes('--no-ios-hp'), HP_PLUS = HP && !A.includes('--no-ios-hp-plus');
const kb = n => (n / 1024 / 1024).toFixed(2) + ' MB';
const size = d => { let n = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); n += e.isDirectory() ? size(p) : fs.statSync(p).size; } return n; };

// 1. the bundle
await build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), mode: 'wechat', logLevel: 'warn' });
const DW = path.join(ROOT, 'dist-wx'), bundle = fs.readFileSync(path.join(DW, 'game.js'), 'utf8'), assets = JSON.parse(fs.readFileSync(path.join(DW, 'wx-assets.json'), 'utf8'));
// Bake static terrain with the same definitions used by procedural rooms.
// Keep the title stage in its own tiny subpackage (`scenery0`, ~0.44 MB) so the main package stays safely under WeChat's 4 MB upload limit.
const scenes = new Map();
const BOSS_IDS = new Set(['mint', 'baimen', 'wl_flagship', 'cx_hall']);
const packBudget = (rawBins) => {
  const allBins = rawBins.map(({ name, data }) => {
    const id = name.startsWith('map-') ? name.split('-')[1] : name.slice(0, -4);
    const prio = name === 'title-snow.bin' ? 0 : name === 'yard.bin' ? 1 : BOSS_IDS.has(id) ? 2 : 3;
    return { name, data, prio };
  }).sort((a, b) => a.prio - b.prio || b.data.length - a.data.length);
  const MAX_SC_TOTAL = 10.8 * 1024 * 1024, MAX_SC_PKG = 3.6 * 1024 * 1024;
  let scTotal = 0, scIdx = 1, scBytes = 0, skipped = 0;
  for (const { name, data } of allBins) {
    if (name === 'title-snow.bin') {
      scenes.set(name.slice(0, -4), { to: 'scenery0/' + name, data });
      continue;
    }
    if (scTotal + data.length > MAX_SC_TOTAL) { skipped++; continue; }
    if (scBytes > 0 && scBytes + data.length > MAX_SC_PKG) { scIdx++; scBytes = 0; }
    scenes.set(name.slice(0, -4), { to: 'scenery' + scIdx + '/' + name, data });
    scBytes += data.length;
    scTotal += data.length;
  }
  if (skipped) console.log(`  （30 MB 总包预算内预烘焙 ${scenes.size} 张重场，其余 ${skipped} 张轻场走后台分帧生成）`);
};
let reusedScenes = false;
if (REUSE_SCENES && (fs.existsSync(path.join(OUT, 'scenery0', 'title-snow.bin')) || fs.existsSync(path.join(OUT, 'assets', 'scenes', 'title-snow.bin')))) {
  const raw = [];
  const collect = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.endsWith('.bin')) raw.push({ name, data: fs.readFileSync(path.join(dir, name)) });
    }
  };
  collect(path.join(OUT, 'assets', 'scenes'));
  for (const e of fs.readdirSync(OUT, { withFileTypes: true })) {
    if (e.isDirectory() && e.name.startsWith('scenery')) collect(path.join(OUT, e.name));
  }
  if (raw.length) {
    packBudget(raw);
    reusedScenes = true;
    console.log(`  复用已有烘焙场景 ${scenes.size} 个（--reuse-scenes）`);
  }
}
if (!reusedScenes) {
  const bakeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-wechat-scenes-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'node_modules/vite-node/vite-node.mjs'), 'tools/bake-wechat-stages.ts'], {
      cwd: ROOT, env: { ...process.env, UB_STAGE_OUT: bakeDir }, stdio: 'inherit',
    });
    // Budget-aware scenery packing: keep total WeChat package safely under 30 MB by pre-baking
    // title, hideout, all boss arenas, and the heaviest rooms first; lighter rooms build smoothly
    // in background slices via readStagePack() → null.
    packBudget(fs.readdirSync(bakeDir).map(name => ({ name, data: fs.readFileSync(path.join(bakeDir, name)) })));
  } finally {
    fs.rmSync(bakeDir, { recursive: true, force: true });
  }
}
const stageFiles = Object.fromEntries([...scenes].map(([key, file]) => [key, file.to]));
const rd = f => fs.readFileSync(path.join(ROOT, 'wechat', f), 'utf8');
// (--no-diag: no native error dialog — wechat/glue.js shows the first error in one while the mini-game is still being brought up)
// Split the main bundle into the `engine` code subpackage so the root main package stays tiny (< 0.3 MB, well under WeChat's 4 MB cap).
const bootGameJs = `'use strict';\n${A.includes('--no-diag') ? 'var __UB_NO_DIAG = true;\n' : ''}${rd('adapter.js')}\n${rd('glue.js')}\nGameGlobal.__ubStageFiles = ${JSON.stringify(stageFiles)};\nwx.loadSubpackage({\n  name: 'engine',\n  fail: function (e) {\n    console.error('[boot] loadSubpackage engine failed', e);\n    if (wx.showModal) wx.showModal({ title: '加载失败', content: '主程序分包加载失败，请重启小游戏：' + String(e && (e.errMsg || e.message) || e), showCancel: false });\n  }\n});\n`;
const engineGameJs = `'use strict';\nvar __e = GameGlobal.__ubEnv || {};\nvar document = __e.document || GameGlobal.document;\nvar WebGL2RenderingContext = __e.WebGL2RenderingContext || GameGlobal.WebGL2RenderingContext;\nvar self = __e.self || GameGlobal.self || GameGlobal;\nvar navigator = __e.navigator || GameGlobal.navigator;\nvar performance = __e.performance || GameGlobal.performance;\nvar localStorage = __e.localStorage || GameGlobal.localStorage;\nvar atob = __e.atob || GameGlobal.atob;\nvar fetch = __e.fetch || GameGlobal.fetch;\n${bundle}`;
// 11-18: the upload refused game.js for a `?.` (「invalid file: game.js, 122:12 SyntaxError: Unexpected token .」): every JS file must be
// ES2015 (vite's wechat target is es2015; wechat/*.js are written by hand) — parse both scripts and stop before touching the project
// folder if either isn't (--no-syntax-check to skip)
if (!A.includes('--no-syntax-check')) {
  const { parse } = await import('acorn');
  for (const [label, src] of [['game.js', bootGameJs], ['engine/game.js', engineGameJs]]) {
    try { parse(src, { ecmaVersion: 2015, sourceType: 'script', allowReturnOutsideFunction: true }); }
    catch (e) {
      const ln = src.split('\n')[(e.loc ? e.loc.line : 1) - 1] || '', c = e.loc ? e.loc.column : 0;
      console.error(`${label} 不是 ES2015（微信上传会拒）：${e.message}\n  …${ln.slice(Math.max(0, c - 80), c + 80)}…`); process.exit(1);
    }
  }
  console.log('  game.js + engine/game.js 按 ES2015 解析通过');
}

// 2. the project folder (the old appid survives)
let appid = 'touristappid';
try { appid = JSON.parse(fs.readFileSync(path.join(OUT, 'project.config.json'), 'utf8')).appid || appid; } catch { /* a new folder */ }
// (11-18: the folder may be open in the WeChat devtools — Windows won't remove an open directory (EPERM): clear what's inside instead,
// best effort, and write over it; the devtools pick the new files up)
fs.mkdirSync(OUT, { recursive: true });
for (const e of fs.readdirSync(OUT)) { if (e === 'project.config.json' || e === 'project.private.config.json') continue; try { fs.rmSync(path.join(OUT, e), { recursive: true, force: true }); } catch (err) { console.log(`  （没删掉 ${e}：${err.code}，直接覆盖）`); } }
fs.writeFileSync(path.join(OUT, 'game.js'), bootGameJs);
fs.mkdirSync(path.join(OUT, 'engine'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'engine', 'game.js'), engineGameJs);
// act-179: 1x1 transparent PNG (67 bytes) for WeChat wx.createGameClubButton transparent hitbox overlay (avoids Android rgba black-box bug)
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'assets', 'px_blank.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=', 'base64'));
const subs = new Set(['engine']);
for (const { to, data } of scenes.values()) {
  const dst = path.join(OUT, to);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, data);
  if (!to.startsWith('assets/')) subs.add(to.split('/')[0]);
}
const subsetFontPy = `
import json, pathlib, re, sys
from fontTools import subset
from fontTools.ttLib import TTFont
root, src, dst = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
f = TTFont(src)
try:
    chars = set(''.join(chr(c) for c in range(32, 127)) + '，。、；：？！“”‘’（）《》【】「」『』…—～·％＋－×÷＝＜＞０１２３４５６７８９　←↑→↓★☆●○■□▲△◆◇✓✕一二三四五六七八九十百千万亿零年月日时分秒')
    en = json.loads((root / 'src/present/act/en.json').read_text(encoding='utf-8'))
    for k, v in en.items(): chars.update(k); chars.update(v)
    sc = json.loads((root / 'src/present/act/scriptData.json').read_text(encoding='utf-8'))
    for lines in sc.values():
        for l in lines: chars.update(l.get('text', '')); chars.update(l.get('speaker', ''))
    for p in (root / 'src').rglob('*.ts'):
        txt = p.read_text(encoding='utf-8', errors='ignore')
        txt = re.sub(r'//.*', '', txt)
        txt = re.sub(r'/\\*[\\s\\S]*?\\*/', '', txt)
        for ch in txt:
            if ord(ch) > 0x7e: chars.add(ch)
    cmap = f.getBestCmap() or {}
    keep = [cp for cp in cmap if chr(cp) in chars]
    opt = subset.Options(); opt.hinting = True; opt.layout_features = ['*']; opt.name_IDs = ['*']; opt.notdef_outline = True
    s = subset.Subsetter(opt); s.populate(unicodes=keep); s.subset(f)
    # Give the TTF a clean single-word ASCII family name ("UBWenKai") so wx.loadFont & Canvas2D match identically on iOS/Android/DevTools
    for rec in f['name'].names:
        if rec.nameID in (1, 4, 6):
            rec.string = 'UBWenKai'.encode(rec.getEncoding())
except Exception as e:
    print('subset fallback:', e, file=sys.stderr)
f.flavor = None
f.save(dst)
`;
for (const [to, from] of Object.entries(assets)) {
  const dst = path.join(OUT, to); fs.mkdirSync(path.dirname(dst), { recursive: true });
  // (11-18: wx.loadFont takes TrueType, not woff2 — unpack + subset to player-facing glyphs without hinting to save ~240 KB)
  if (/\.ttf$/i.test(to) && /\.woff2$/i.test(from)) {
    try { execFileSync('python', ['-c', subsetFontPy, ROOT, from, dst], { stdio: 'pipe' }); }
    catch (e) { console.log(`  （${path.basename(from)} 没转成 ttf：${String(e.stderr || e.message).trim().split(/\r?\n/).pop()}，原样放进去）`); fs.copyFileSync(from, dst); }
  } else if (/\.json$/i.test(to)) {
    fs.writeFileSync(dst, JSON.stringify(JSON.parse(fs.readFileSync(from, 'utf8'))));
  } else fs.copyFileSync(from, dst);
  const top = to.split('/')[0]; if (/^audio\d+$/.test(top) || top === 'fonts' || top === 'i18n' || top === 'engine') subs.add(top);   // (everything but assets/ is a subpackage)
}
const subpackages = [...subs].sort().map(n => ({ name: n, root: n + '/' }));
for (const s of subpackages) if (s.name !== 'engine') fs.writeFileSync(path.join(OUT, s.name, 'game.js'), `'use strict';\n`);
fs.writeFileSync(path.join(OUT, 'game.json'), JSON.stringify({ deviceOrientation: 'landscape', showStatusBar: false, ...(HP ? { iOSHighPerformance: true } : {}), ...(HP_PLUS ? { 'iOSHighPerformance+': true } : {}), subpackages }, null, 2) + '\n');
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
console.log(`  合计 ${kb(size(OUT))}；appid ${appid}；iOS 高性能模式 ${HP ? '开' : '关'}，高性能+ ${HP_PLUS ? '开' : '关'}`);
// (11-18: the upload's limits as Cocos 3.8 / the community put them: main package ≤ 4 MB, all packages ≤ 30 MB — over them, stop here
// rather than at the upload; the project folder is already written so it can still be opened and looked at)
{ const MB = 1024 * 1024, total = size(OUT) - (fs.existsSync(path.join(OUT, 'project.private.config.json')) ? fs.statSync(path.join(OUT, 'project.private.config.json')).size : 0);
  const over = [main > 4 * MB && `主包 ${kb(main)} 超过 4 MB`, total > 30 * MB && `合计 ${kb(total)} 超过 30 MB`].filter(Boolean);
  if (over.length) { console.error(`  ⚠ 上传会被拒：${over.join('；')}——把资源挪进分包（tools/wxAssets.ts）`); process.exitCode = 1; } }

// 4. the zip (Python's zipfile writes UTF-8 names with the flag set, so the Chinese folder name survives on any unzip)
if (ZIP) {
  const py = `import zipfile,os,sys\nsrc,dst=sys.argv[1],sys.argv[2]\nbase=os.path.dirname(src)\nwith zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED) as z:\n  for d,_,fs in os.walk(src):\n    for f in fs:\n      if f=='project.private.config.json': continue\n      p=os.path.join(d,f); z.write(p,os.path.relpath(p,base))\n`;   // (the devtools' own per-machine settings stay out)
  try { fs.rmSync(ZIP, { force: true }); execFileSync('python', ['-c', py, OUT, ZIP], { stdio: 'inherit' }); console.log(`  压缩包 ${ZIP}（${kb(fs.statSync(ZIP).size)}）`); }
  catch (e) { console.log('  （没打压缩包：' + (e && e.message) + '）'); }
}
