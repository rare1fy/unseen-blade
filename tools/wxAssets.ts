// 11-18 微信小游戏打包（vite build --mode wechat）: the web build inlines every sound, voice line, portrait and body font as a data: URL
// (one 18 MB html); the mini-game keeps them as files. Here each `?inline` import of those becomes the file's path inside the
// mini-game package, and the list of files goes to <outDir>/wx-assets.json for tools/build-wechat.mjs to copy:
//   fonts/body/*.woff2           → assets/body/<name>        (main package)
//   src/assets/portraits/*.png   → assets/portraits/<name>   (main package)
//   src/assets/audio/*.mp3       → audioN/audio/<name>       (subpackages audio1…, about 3.8 MB each, loaded on first use)
//   src/assets/voice/<who>/*.mp3 → audioN/voice/<who>/<name>
// The game already loads a non-data: URL with fetch() (audio) / an image element (portraits); wechat/glue.js gives those a
// mini-game implementation (fetch = load the subpackage, then read the file).
import type { Plugin } from 'vite';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const BIN = 3.8 * 1024 * 1024;
const norm = (p: string) => p.replace(/\\/g, '/');

export function wxAssets(root: string): Plugin {
  // the audio files packed into subpackages in a fixed order (sorted paths), so the same files land in the same package every build
  const audio: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.mp3$/i.test(e.name)) audio.push(norm(p)); } };
  for (const d of ['src/assets/audio', 'src/assets/voice']) walk(path.join(root, d));
  audio.sort();
  const where = new Map<string, string>();
  let bin = 1, fill = 0;
  for (const f of audio) {
    const sz = statSync(f).size; if (fill > 0 && fill + sz > BIN) { bin++; fill = 0; } fill += sz;
    const rel = norm(path.relative(path.join(root, 'src/assets'), f));   // audio/x.mp3 or voice/who/x.mp3
    where.set(f, `audio${bin}/${rel}`);
  }
  const used = new Map<string, string>();   // package path → source file
  return {
    name: 'wx-assets', enforce: 'pre',
    load(id) {
      const [file, q = ''] = id.split('?'); if (!/(^|&)inline(&|$)/.test(q)) return null;
      const f = norm(file); let out: string | null = null;
      if (where.has(f)) out = where.get(f)!;
      else if (/\/fonts\/body\/[^/]+\.woff2$/.test(f)) out = `assets/body/${path.basename(f)}`;
      else if (/\/src\/assets\/portraits\/[^/]+\.png$/.test(f)) out = `assets/portraits/${path.basename(f)}`;
      if (!out) return null;
      used.set(out, f);
      return `export default ${JSON.stringify(out)};`;
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'wx-assets.json', source: JSON.stringify(Object.fromEntries([...used].sort()), null, 1) });
    },
  };
}
