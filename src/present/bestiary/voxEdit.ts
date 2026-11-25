// 用户自己改模型（act-20，「我能自己微调模型吗」→ MagicaVoxel 来回改）：模型 ↔ .vox。
// 一个身体部件（骨骼）= MagicaVoxel 里一个物件，名字就是骨骼名，都摆在原位拼成整人；所有物件共用同一个画框（整个人四周留出空白），
// 这样用户在哪个物件里往外画都画得下。轴：游戏「x 右、y 上、前方 +z」→ MagicaVoxel「x 右、z 上、正面朝 −y」，即
// 游戏格 (x, y, z) ↔ MagicaVoxel 世界格 (x, −z − 1, y)——一次旋转，不镜像（左手还是左手）。
// 读回：文件名（不含 .vox）= 模型 id；文件里有的部件替换代码里的那个部件，没有的照代码；发光度按原来同色格子补回。
import type { VoxChar } from '../look/voxkit';
import { readVox, writeVox, voxWorld, type VoxFile, type VoxModel } from '../look/vox';
import { ROSTER, type ModelDef } from './models';

/** blank cells kept round the figure on every side of the shared frame (room to draw into) */
const PAD = 8;
const toVox = (x: number, y: number, z: number): [number, number, number] => [x, -z - 1, y];
const fromVox = (wx: number, wy: number, wz: number): [number, number, number] => [wx, wz, -wy - 1];

/** a built model → a .vox scene, one named object per part that has cells (bones without cells are left out) */
export function modelToVox(v: VoxChar): VoxFile {
  const cells = [...v.cells.values()]; if (!cells.length) return { models: [], palette: [] };
  // the palette: the model's colours in order of first use (index 1 = palette[0])
  const pal: number[] = [], idx = new Map<number, number>();
  for (const c of cells) if (!idx.has(c.c)) { if (pal.length >= 255) throw new Error('more than 255 colours'); pal.push(c.c); idx.set(c.c, pal.length); }
  // the shared frame, in MagicaVoxel world cells, padded and made even (so the centre is exact)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const c of cells) { const w = toVox(c.x, c.y, c.z); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], w[i]); hi[i] = Math.max(hi[i], w[i]); } }
  // (the frame's floor is the ground: nothing to draw below the feet)
  // (a 3.5 cm model gets more cells of margin: about the same room in centimetres)
  const pad = v.s < 0.06 ? 14 : PAD;
  const min = [lo[0] - pad, lo[1] - pad, Math.min(lo[2], 0)], size = hi.map((h, i) => { const n = h + pad - min[i] + 1; return n + (n & 1); }) as [number, number, number];
  const t = [0, 1, 2].map(i => min[i] + Math.floor(size[i] / 2)) as [number, number, number];
  const byPart = new Map<string, Array<[number, number, number, number]>>();
  for (const c of cells) { const w = toVox(c.x, c.y, c.z), l: [number, number, number, number] = [w[0] - min[0], w[1] - min[1], w[2] - min[2], idx.get(c.c)!]; (byPart.get(c.part) ?? byPart.set(c.part, []).get(c.part)!).push(l); }
  // parts in skeleton order (the outliner reads head-to-toe the way the bones were made)
  const order = [...v.bonesAbs.keys()].filter(b => byPart.has(b));
  const models: VoxModel[] = order.map(name => ({ name, size, t, voxels: byPart.get(name)! }));
  return { models, palette: pal };
}

/** a .vox scene onto a built model: each object named after one of its bones replaces that part's cells */
export function applyVox(v: VoxChar, f: VoxFile, warn: (msg: string) => void = () => {}) {
  // the glow each colour had in the code model (the most common one), for the cells that come back
  const glow = new Map<number, Map<number, number>>();
  for (const c of v.cells.values()) { const m = glow.get(c.c) ?? glow.set(c.c, new Map()).get(c.c)!; m.set(c.g, (m.get(c.g) ?? 0) + 1); }
  const gOf = (col: number) => { const m = glow.get(col); if (!m) return 0; let best = 0, n = -1; for (const [g, k] of m) if (k > n) { n = k; best = g; } return best; };
  const splitHipSlv = v.bonesAbs.has('hipSlv1') && v.bonesAbs.has('hipSlv2') && v.bonesAbs.has('hipSlv3') && !v.bonesAbs.has('hipSlv');
  const mine = f.models.filter(m => {
    if (v.bonesAbs.has(m.name) || (splitHipSlv && m.name === 'hipSlv')) return true;
    warn(`vox: no bone "${m.name}" — that object is ignored`); return false;
  });
  const names = new Set<string>();
  for (const m of mine) {
    if (splitHipSlv && m.name === 'hipSlv') { names.add('hipSlv1'); names.add('hipSlv2'); names.add('hipSlv3'); }
    else names.add(m.name);
  }
  for (const [k, c] of v.cells) if (names.has(c.part)) v.cells.delete(k);
  for (const m of mine) {
    if (splitHipSlv && m.name === 'hipSlv') {
      for (const [x, y, z, ci] of m.voxels) {
        const [gx, gy, gz] = fromVox(...voxWorld(m, x, y, z)), col = f.palette[ci - 1] ?? 0xff00ff;
        const part = gy >= 21 ? 'hipSlv1' : gy >= 17 ? 'hipSlv2' : 'hipSlv3';
        v.part(part).set(gx, gy, gz, col, gOf(col));
      }
      continue;
    }
    v.part(m.name);
    for (const [x, y, z, ci] of m.voxels) { const [gx, gy, gz] = fromVox(...voxWorld(m, x, y, z)), col = f.palette[ci - 1] ?? 0xff00ff; v.set(gx, gy, gz, col, gOf(col)); }
  }
  return v;
}

/** the edited models: vox/<model id>.vox in the repo (bundled into the build; the dev server reloads when one is saved) */
// (vite.config.ts's vox-bytes plugin turns each file into its bytes in base64)
const FILES = import.meta.glob('../../../vox/*.vox', { eager: true, import: 'default' }) as Record<string, string>;
const b64 = (s64: string) => { const s = atob(s64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const voxBytes = (src: string): Uint8Array => {
  if (__WX__ && /\.(?:vox|bin)$/i.test(src)) {
    const data = wx.getFileSystemManager().readFileSync(src);
    return data instanceof Uint8Array ? data : new Uint8Array(data);
  }
  return b64(src);
};
/** the code-built version of each edited model (for before / after comparisons) */
export const CODE_BUILD = new Map<string, () => VoxChar>();
/** the models with an edited file: their build() lays the code model down, then the file's parts over it */
export function installVoxEdits(defs: ModelDef[] = ROSTER) {
  const done: string[] = [];
  for (const [path, url] of Object.entries(FILES)) {
    const id = path.slice(path.lastIndexOf('/') + 1, -4), def = defs.find(d => d.id === id); if (!def) { console.warn(`vox: no model "${id}" for ${path}`); continue; }
    const code = def.build; CODE_BUILD.set(id, code);
    let parsed: VoxFile | null | undefined;
    def.build = () => {
      if (parsed === undefined) {
        try { parsed = readVox(voxBytes(url)); } catch (e) { console.error(`vox: can't read ${path}`, e); parsed = null; }
      }
      const v = code();
      return parsed ? applyVox(v, parsed, m => console.warn(m)) : v;
    };
    done.push(id);
  }
  return done;
}
/** a model as .vox bytes (the export tool and __dh.voxOut) */
export const exportVox = (def: ModelDef) => writeVox(modelToVox(def.build()));
