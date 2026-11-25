#!/usr/bin/env node
// TapTap Mini-Game package builder:
//   Single-package (CLI upload):  npm run tap-minigame -- [--tag <label>] [--reuse-scenes] [--diag]
//   Split-audio (Web subpackage): npm run tap-minigame:split -- [--tag <label>] [--reuse-scenes] [--diag]
// Both modes seal the entire `game.js` (shim + adapter + glue + Vite bundle) inside ONE strict IIFE in the
// main package so startup NEVER calls `loadSubpackage('engine')` and leaks ZERO top-level globals.
// In `--split` mode, audio folders (`audio1`..`audio7`) are declared as `subpackages` in `game.json`, cutting
// the initial main-package download down to ~2.5 MB compressed!
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = process.argv.slice(2), arg = k => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : undefined; };
const SPLIT = A.includes('--split');
const OUT_ROOT = path.resolve(arg('--out') ?? path.join(ROOT, 'dist-tap-minigame'));
const STAGE_DIR = path.join(OUT_ROOT, SPLIT ? 'pkg-split' : 'pkg');
let TAG = arg('--tag');
if (!TAG) {
  try { TAG = execFileSync('git', ['describe', '--tags', '--abbrev=0'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { TAG = 'dev'; }
}
const ZIP = path.join(OUT_ROOT, `unseen-blade-tap-minigame${SPLIT ? '-split' : ''}-${TAG}.zip`);
const REUSE_SCENES = A.includes('--reuse-scenes');
const SHOW_DIAG = A.includes('--diag');
const COPY_DESKTOP = A.includes('--desktop');
const kb = n => (n / 1024 / 1024).toFixed(2) + ' MB';
const size = d => {
  let n = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    n += e.isDirectory() ? size(p) : fs.statSync(p).size;
  }
  return n;
};

// 1. Build the mini-game JS bundle + asset manifest
await build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), mode: 'wechat', logLevel: 'warn' });
const DW = path.join(ROOT, 'dist-wx');
const bundle = fs.readFileSync(path.join(DW, 'game.js'), 'utf8');
const assets = JSON.parse(fs.readFileSync(path.join(DW, 'wx-assets.json'), 'utf8'));

// 2. Bake static stages — keep title-snow + pro-village + pro-boss + yard in the main package (~0.95 MB) so
//    cold start, clicking "开始游戏", and background Cui Xuan prefetch unpack in ~100 ms with zero +680 MB RAM spike.
const scenes = new Map();
const KEEP_SCENES = new Set(['title-snow.bin', 'pro-village.bin', 'pro-boss.bin', 'yard.bin']);
const packBudget = (rawBins) => {
  let skipped = 0;
  for (const { name, data } of rawBins) {
    if (!KEEP_SCENES.has(name)) { skipped++; continue; }
    scenes.set(name.slice(0, -4), { to: 'assets/scenes/' + name, data });
  }
  if (skipped) console.log(`  （极致冷启动瘦身：首包仅保留 ${scenes.size} 张首屏/序章/据点烘焙场景，其余 ${skipped} 张关卡走后台分帧生成）`);
};

let reusedScenes = false;
if (REUSE_SCENES) {
  const raw = [];
  const collect = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.endsWith('.bin')) raw.push({ name, data: fs.readFileSync(path.join(dir, name)) });
    }
  };
  for (const candidate of [STAGE_DIR, path.join(OUT_ROOT, 'pkg')]) {
    collect(path.join(candidate, 'assets', 'scenes'));
    if (fs.existsSync(candidate)) {
      for (const e of fs.readdirSync(candidate, { withFileTypes: true })) {
        if (e.isDirectory() && e.name.startsWith('scenery')) collect(path.join(candidate, e.name));
      }
    }
    if (raw.length) break;
  }
  if (raw.length) {
    packBudget(raw);
    if (scenes.size === KEEP_SCENES.size) {
      reusedScenes = true;
      console.log(`  复用已有烘焙场景 ${scenes.size} 个（--reuse-scenes）`);
    } else {
      scenes.clear();
    }
  }
}
if (!reusedScenes) {
  const bakeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-tap-scenes-'));
  try {
    const onlyKeys = [...KEEP_SCENES].map(n => n.slice(0, -4)).join(',');
    execFileSync(process.execPath, [path.join(ROOT, 'node_modules/vite-node/vite-node.mjs'), 'tools/bake-wechat-stages.ts'], {
      cwd: ROOT, env: { ...process.env, UB_STAGE_OUT: bakeDir, UB_STAGE_ONLY: onlyKeys }, stdio: 'inherit',
    });
    packBudget(fs.readdirSync(bakeDir).map(name => ({ name, data: fs.readFileSync(path.join(bakeDir, name)) })));
  } finally {
    fs.rmSync(bakeDir, { recursive: true, force: true });
  }
}

// Detect audio subpackages when --split is enabled
const audioSubs = new Set();
if (SPLIT) {
  for (const to of Object.keys(assets)) {
    const top = to.split('/')[0];
    if (/^audio\d+$/.test(top)) audioSubs.add(top);
  }
}
const subMap = SPLIT ? Object.fromEntries([...audioSubs].sort().map(n => [n, true])) : null;
const stageFiles = Object.fromEntries([...scenes].map(([key, file]) => [key, file.to]));
const rd = f => fs.readFileSync(path.join(ROOT, 'wechat', f), 'utf8');

// Seal the entire boot + adapter + glue + game bundle inside ONE IIFE so zero `var` declarations leak globally.
const tapRuntimeLookup = [
  'var __ubG = typeof GameGlobal !== "undefined" ? GameGlobal : (typeof globalThis !== "undefined" ? globalThis : this);',
  'var wx = (__ubG && __ubG.wx && __ubG.wx.createCanvas) ? __ubG.wx',
  '  : (typeof tap !== "undefined" && tap && tap.createCanvas) ? tap',
  '  : (typeof tj !== "undefined" && tj && tj.createCanvas) ? tj',
  '  : (__ubG && __ubG.tap && __ubG.tap.createCanvas) ? __ubG.tap',
  '  : (__ubG && __ubG.tj && __ubG.tj.createCanvas) ? __ubG.tj',
  '  : (__ubG && __ubG.wx) ? __ubG.wx',
  '  : null;',
  'if (wx && __ubG && !__ubG.wx) { try { __ubG.wx = wx; } catch (e) {} }',
  'if (wx && typeof wx.setPreferredFramesPerSecond === "function") { try { wx.setPreferredFramesPerSecond(60); } catch (e) {} }',
  'if (__ubG) { __ubG.__ubTapMiniGame = true; __ubG.__ubBuildTag = ' + JSON.stringify(TAG) + '; __ubG.__ubBuildTime = ' + JSON.stringify(new Date().toISOString()) + '; __ubG.__ubSinglePkg = ' + (SPLIT ? 'false' : 'true') + '; __ubG.__ubSubpackages = ' + JSON.stringify(subMap) + '; __ubG.__ubStageFiles = ' + JSON.stringify(stageFiles) + '; }',
].join('\n');

const fullGameJs = [
  ';(function () {',
  "'use strict';",
  SHOW_DIAG ? '' : 'var __UB_NO_DIAG = true;',
  tapRuntimeLookup,
  rd('adapter.js'),
  rd('glue.js'),
  bundle,
  '})();',
].join('\n');

// ES2015 syntax guard
if (!A.includes('--no-syntax-check')) {
  const { parse } = await import('acorn');
  try {
    parse(fullGameJs, { ecmaVersion: 2015, sourceType: 'script', allowReturnOutsideFunction: true });
  } catch (e) {
    const ln = fullGameJs.split('\n')[(e.loc ? e.loc.line : 1) - 1] || '', c = e.loc ? e.loc.column : 0;
    console.error(`game.js 不是 ES2015：${e.message}\n  …${ln.slice(Math.max(0, c - 80), c + 80)}…`);
    process.exit(1);
  }
  console.log(`  game.js (${SPLIT ? '分包版主包' : '单包'} IIFE) 按 ES2015 解析通过`);
}

// 3. Stage files into STAGE_DIR
fs.rmSync(STAGE_DIR, { recursive: true, force: true });
fs.mkdirSync(STAGE_DIR, { recursive: true });
fs.writeFileSync(path.join(STAGE_DIR, 'game.js'), fullGameJs);

for (const { to, data } of scenes.values()) {
  const dst = path.join(STAGE_DIR, to);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, data);
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
    skip_parts = {'compare-demo', 'concept-demo', 'crossroads-demo', 'liubai-preview', 'stage1-showcase'}
    skip_files = {'lab.ts', 'tunePanel.ts', 'animPreview.ts', 'movesPreview.ts'}
    for p in (root / 'src').rglob('*.ts'):
        if p.name in skip_files or any(part in skip_parts for part in p.parts): continue
        txt = p.read_text(encoding='utf-8', errors='ignore')
        txt = re.sub(r'//.*', '', txt)
        txt = re.sub(r'/\\*[\\s\\S]*?\\*/', '', txt)
        for ch in txt:
            if ord(ch) > 0x7e: chars.add(ch)
    cmap = f.getBestCmap() or {}
    keep = [cp for cp in cmap if chr(cp) in chars]
    opt = subset.Options(); opt.hinting = False; opt.layout_features = ['*']; opt.name_IDs = ['*']; opt.notdef_outline = True
    s = subset.Subsetter(opt); s.populate(unicodes=keep); s.subset(f)
    for rec in f['name'].names:
        if rec.nameID in (1, 4, 6):
            rec.string = 'UBWenKai'.encode(rec.getEncoding())
except Exception as e:
    print('subset fallback:', e, file=sys.stderr)
f.flavor = None
f.save(dst)
`;

const mp3Jobs = [];
for (const [to, from] of Object.entries(assets)) {
  const dst = path.join(STAGE_DIR, to);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (/\.ttf$/i.test(to) && /\.woff2$/i.test(from)) {
    try { execFileSync('python', ['-c', subsetFontPy, ROOT, from, dst], { stdio: 'pipe' }); }
    catch (e) {
      console.log(`  （${path.basename(from)} 没转成 ttf：${String(e.stderr || e.message).trim().split(/\r?\n/).pop()}，原样放进去）`);
      fs.copyFileSync(from, dst);
    }
  } else if (/\.json$/i.test(to)) {
    fs.writeFileSync(dst, JSON.stringify(JSON.parse(fs.readFileSync(from, 'utf8'))));
  } else if (/\.mp3$/i.test(to) && !A.includes('--no-audio-slim')) {
    mp3Jobs.push([from, dst, path.basename(to)]);
  } else {
    fs.copyFileSync(from, dst);
  }
}

if (mp3Jobs.length) {
  const audioCacheDir = path.join(OUT_ROOT, '.audio-cache-v2');
  fs.mkdirSync(audioCacheDir, { recursive: true });
  const slimAudioPy = `
import concurrent.futures, hashlib, json, os, shutil, subprocess, sys
cache_dir = sys.argv[1]
jobs = json.loads(sys.stdin.read())
ffmpeg = shutil.which('ffmpeg')
if not ffmpeg:
    try:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        ffmpeg = None
if not ffmpeg:
    for src, dst, _ in jobs:
        shutil.copy2(src, dst)
    print('  （未找到 ffmpeg，音频原样打包）')
    sys.exit(0)

def profile(name):
    if name.startswith('bgm_'):
        return ('bgm16', ['-ac', '1', '-ar', '16000', '-b:a', '16k'])
    if name.startswith('ub_') and not name.startswith('ub_vo_') and not name.startswith('ub_sting_'):
        return ('sfx24', ['-ac', '1', '-ar', '22050', '-b:a', '24k'])
    return ('vo12', ['-ac', '1', '-ar', '16000', '-b:a', '12k'])

def work(item):
    src, dst, name = item
    src_sz = os.path.getsize(src)
    tag, flags = profile(name)
    st = os.stat(src)
    key = hashlib.md5(f'{tag}:{name}:{st.st_size}:{int(st.st_mtime)}'.encode()).hexdigest()
    cached = os.path.join(cache_dir, key + '.mp3')
    if not os.path.exists(cached):
        tmp = cached + '.tmp.mp3'
        cmd = [ffmpeg, '-y', '-loglevel', 'error', '-i', src, '-vn', '-map_metadata', '-1', '-c:a', 'libmp3lame'] + flags + [tmp]
        r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if r.returncode == 0 and os.path.exists(tmp) and 200 < os.path.getsize(tmp) < src_sz:
            os.replace(tmp, cached)
        else:
            if os.path.exists(tmp): os.remove(tmp)
            shutil.copy2(src, cached)
    shutil.copy2(cached, dst)
    return src_sz, os.path.getsize(dst)

raw_sum = out_sum = 0
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    for a, b in ex.map(work, jobs):
        raw_sum += a; out_sum += b
print(f'  音频瘦身完成（{len(jobs)} 个）：{raw_sum/1048576:.2f} MB -> {out_sum/1048576:.2f} MB（节省 {(raw_sum-out_sum)/1048576:.2f} MB）')
`;
  execFileSync('python', ['-c', slimAudioPy, audioCacheDir], {
    input: JSON.stringify(mp3Jobs),
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

const subpackages = [...audioSubs].sort().map(n => ({ name: n, root: n + '/' }));
for (const s of subpackages) {
  fs.writeFileSync(path.join(STAGE_DIR, s.name, 'game.js'), `'use strict';\n`);
}

const gameJson = SPLIT
  ? { deviceOrientation: 'landscape', showStatusBar: false, subpackages }
  : { deviceOrientation: 'landscape', showStatusBar: false };
fs.writeFileSync(path.join(STAGE_DIR, 'game.json'), JSON.stringify(gameJson, null, 2) + '\n');

// 4. Zip with files directly at archive root (`game.js`, `game.json`, ...)
fs.rmSync(ZIP, { force: true });
const zipPy = [
  'import zipfile, os, sys',
  'src, dst = sys.argv[1], sys.argv[2]',
  'with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:',
  '    for d, _, fs in os.walk(src):',
  '        for f in sorted(fs):',
  '            p = os.path.join(d, f)',
  '            rel = os.path.relpath(p, src).replace("\\\\", "/")',
  '            z.write(p, rel)',
].join('\n');
execFileSync('python', ['-c', zipPy, STAGE_DIR, ZIP], { stdio: 'inherit' });

let mainRaw = 0;
for (const e of fs.readdirSync(STAGE_DIR, { withFileTypes: true })) {
  const p = path.join(STAGE_DIR, e.name);
  if (audioSubs.has(e.name)) continue;
  mainRaw += e.isDirectory() ? size(p) : fs.statSync(p).size;
}

if (COPY_DESKTOP) {
  const deskDst = path.join(os.homedir(), 'Desktop', `不见刀_TapTap小游戏分包版_${TAG}.zip`);
  fs.copyFileSync(ZIP, deskDst);
  console.log(`  已复制到桌面：${deskDst}`);
}

console.log(`TapTap 小游戏${SPLIT ? '分包' : '单包'}工程：${STAGE_DIR}`);
console.log(`  主包未压缩 ${kb(mainRaw)}（game.js ${kb(fs.statSync(path.join(STAGE_DIR, 'game.js')).size)}）`);
for (const s of subpackages) console.log(`  音频分包 ${s.name} ${kb(size(path.join(STAGE_DIR, s.name)))}`);
console.log(`  总未压缩 ${kb(size(STAGE_DIR))} | 总压缩包 ${ZIP}（${kb(fs.statSync(ZIP).size)}）`);
