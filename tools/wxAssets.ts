// 11-18 微信小游戏打包（vite build --mode wechat）: the web build inlines every sound, voice line, portrait and body font as a data: URL
// (one 18 MB html); the mini-game keeps them as files. Here each `?inline` import of those becomes the file's path inside the
// mini-game package, and the list of files goes to <outDir>/wx-assets.json for tools/build-wechat.mjs to copy:
//   fonts/body/*.woff2           → fonts/body/<name>.ttf     (subpackage `fonts`, ~2.7 MB — the main package stays under 4 MB; wx.loadFont refuses woff2 — 「loadFont:fail NOT_WHITELIST_FILE」 —
//                                  so tools/build-wechat.mjs writes them as TrueType)
//   src/assets/portraits/*.png   → assets/portraits/<name>   (main package)
//   src/assets/audio/*.mp3       → audioN/audio/<name>       (subpackages audio1…, at most 3.8 MB each, in the order they are heard —
//                                  the effects alone first; a mini-game starts loading them at boot: src/audio/audio.ts prepare)
//   src/assets/voice/<who>/*.mp3 → audioN/voice/<who>/<name>
// The game already loads a non-data: URL with fetch() (audio) / an image element (portraits); wechat/glue.js gives those a
// mini-game implementation (fetch = load the subpackage, then read the file).
import type { Plugin } from 'vite';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const BIN = 3.8 * 1024 * 1024;
const norm = (p: string) => p.replace(/\\/g, '/');

export function wxAssets(root: string): Plugin {
  // the audio files packed into subpackages in a fixed order, so the same files land in the same package every build. 11-18 (用户：
  // 「现在有声音了，但是声音出来的很慢」): the order is what is heard first — packed by name, all the effects, every voice line and
  // the hideout's track shared the biggest package (4.3 MB), and a phone downloads a whole subpackage before any file in it is read.
  // Now: audio1 = the everyday effects alone (~0.65 MB, the first download); the title's track, the hideout's, each in a package of
  // its own (~1 MB: whichever the first touch wants is a short download); the cold open's with the long win / lose / stele stings;
  // then the voice lines, the fight and boss tracks, the rest, filled up to 3.8 MB.
  const audio: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.mp3$/i.test(e.name)) audio.push(norm(p)); } };
  for (const d of ['src/assets/audio', 'src/assets/voice']) walk(path.join(root, d));
  const FIGHT_TRACKS = ['bgm_battle', 'bgm_boss', 'bgm_fall', 'bgm_elite'], OWN = 3;   // groups 0…OWN each get a package of their own
  const rank = (f: string) => {
    const n = path.basename(f, '.mp3');
    if (/\/voice\//.test(f)) return 4;
    if (!n.startsWith('bgm_')) return /sting/.test(n) ? 3 : 0;
    return n === 'bgm_opening' ? 1 : n === 'bgm_yard' ? 2 : n === 'bgm_coldopen' ? 3 : FIGHT_TRACKS.includes(n) ? 5 : 6;
  };
  audio.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  const where = new Map<string, string>();
  let bin = 1, fill = 0, last = -1;
  for (const f of audio) {
    // The loading blade is already moving before audio1 can download on first launch.
    if (['ub_draw_1.mp3', 'ub_sw_stab_1.mp3'].includes(path.basename(f))) {
      where.set(f, 'assets/audio/' + path.basename(f));
      continue;
    }
    const sz = statSync(f).size, r = rank(f); if (fill > 0 && (fill + sz > BIN || (r !== last && last < OWN + 1))) { bin++; fill = 0; } fill += sz; last = r;
    const rel = norm(path.relative(path.join(root, 'src/assets'), f));   // audio/x.mp3 or voice/who/x.mp3
    where.set(f, `audio${bin}/${rel}`);
  }
  const used = new Map<string, string>();   // package path → source file
  const EN_SRC = norm(path.join(root, 'src/present/act/en.json'));
  const EN_VIRT = '\0wx-i18n-en';
  return {
    name: 'wx-assets', enforce: 'pre',
    resolveId(source, importer) {
      if (source === './en.json' && importer && norm(importer).endsWith('/src/present/act/i18n.ts')) return EN_VIRT;
      return null;
    },
    load(id) {
      if (id === EN_VIRT) {
        const out = 'i18n/en.json';
        used.set(out, EN_SRC);
        return `export default ${JSON.stringify(out)};`;
      }
      const [file, q = ''] = id.split('?');
      const f = norm(file);
      // MagicaVoxel overrides: ship raw binary files inside `engine/vox/` instead of base64 strings inside JS
      if (/\/vox\/[^/]+\.vox$/.test(f)) {
        const out = `engine/vox/${path.basename(f)}`;
        used.set(out, f);
        return `export default ${JSON.stringify(out)};`;
      }
      if (!/(^|&)inline(&|$)/.test(q)) return null;
      let out: string | null = null;
      if (where.has(f)) out = where.get(f)!;
      // Put wenkai.ttf in the main package (`assets/fonts/`) now that main package is only ~0.2 MB:
      // wx.loadFont loads it synchronously on boot with zero subpackage path issues or first-frame fallback flash.
      else if (/\/fonts\/body\/wenkai\.woff2$/.test(f)) out = `assets/fonts/${path.basename(f).replace(/\.woff2$/, '.ttf')}`;
      else if (/\/src\/assets\/portraits\/[^/]+\.png$/.test(f)) out = `assets/portraits/${path.basename(f)}`;
      if (!out) return null;
      used.set(out, f);
      return `export default ${JSON.stringify(out)};`;
    },
    // (11-18: the only dynamic import() left in the bundle — the browser platform's hot reload of the UI font, never run in a mini-game —
    // is ES2020 syntax the WeChat upload refuses; the build parses game.js as ES2015)
    transform(code, id) {
      if (!/pxui[\/]platform[\/]browser\.js$/.test(id.split('?')[0])) return null;
      const out = code.replace("import('/' + 'ui/font.js?t=' + Date.now())", "Promise.reject(new Error('no hot reload in a mini-game'))");
      return out === code ? null : { code: out, map: null };
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'wx-assets.json', source: JSON.stringify(Object.fromEntries([...used].sort()), null, 1) });
    },
  };
}
