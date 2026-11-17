// MagicaVoxel .vox files (act-20, 用户：「我能自己微调模型吗」→ MagicaVoxel 来回改): a reader and a writer for the parts the game
// uses — several named models placed in one scene (one per body part), and the 256-colour palette. Pure byte work, no DOM.
// Format: "VOX " 150, a MAIN chunk holding SIZE / XYZI pairs (one per model), the scene graph (nTRN → nGRP → nTRN / nSHP per model,
// a transform node carries the object's name `_name` and its translation `_t`), and RGBA. Unknown chunks are skipped on reading.
// Where a voxel lands in the scene: world = _t + local − floor(size / 2) (MagicaVoxel centres a model on its translation).

export interface VoxModel {
  /** the object's name in MagicaVoxel (the game: a bone name) */ name: string;
  /** cells across x, y, z (MagicaVoxel axes: z up) */ size: [number, number, number];
  /** the object's translation */ t: [number, number, number];
  /** cells in model space (0..size−1) and a palette index 1..255 */ voxels: Array<[number, number, number, number]>;
}
export interface VoxFile { models: VoxModel[]; /** 256 colours, 0xRRGGBB; entry i is palette index i + 1 */ palette: number[] }

/** where a model's voxel sits in the scene */
export const voxWorld = (m: VoxModel, x: number, y: number, z: number): [number, number, number] =>
  [m.t[0] + x - Math.floor(m.size[0] / 2), m.t[1] + y - Math.floor(m.size[1] / 2), m.t[2] + z - Math.floor(m.size[2] / 2)];

// ------------------------------------------------------------------ reading
export function readVox(buf: ArrayBuffer | Uint8Array): VoxFile {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (o: number) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== 'VOX ') throw new Error('not a .vox file');
  const sizes: Array<[number, number, number]> = [], data: Array<Array<[number, number, number, number]>> = [];
  const trn = new Map<number, { name: string; t: [number, number, number]; child: number }>(), shp = new Map<number, number[]>();
  let palette: number[] | null = null;
  // the dictionaries of the scene graph: n × (string key, string value)
  const str = (o: number): [string, number] => { const n = dv.getInt32(o, true); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8[o + 4 + i]); return [decodeURIComponent(escape(s)), o + 4 + n]; };
  const dict = (o: number): [Record<string, string>, number] => { const n = dv.getInt32(o, true); o += 4; const d: Record<string, string> = {}; for (let i = 0; i < n; i++) { const [k, o1] = str(o); const [v, o2] = str(o1); d[k] = v; o = o2; } return [d, o]; };
  // MAIN starts at 8; its children follow its 12-byte header
  let o = 8 + 12;
  while (o + 12 <= u8.length) {
    const id = tag(o), n = dv.getInt32(o + 4, true), m = dv.getInt32(o + 8, true), c = o + 12;
    if (id === 'SIZE') sizes.push([dv.getInt32(c, true), dv.getInt32(c + 4, true), dv.getInt32(c + 8, true)]);
    else if (id === 'XYZI') { const k = dv.getInt32(c, true), vs: Array<[number, number, number, number]> = []; for (let i = 0; i < k; i++) { const b = c + 4 + i * 4; vs.push([u8[b], u8[b + 1], u8[b + 2], u8[b + 3]]); } data.push(vs); }
    else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { const b = c + i * 4; palette.push((u8[b] << 16) | (u8[b + 1] << 8) | u8[b + 2]); } }
    else if (id === 'nTRN') {
      const node = dv.getInt32(c, true); let [attr, p] = dict(c + 4); const child = dv.getInt32(p, true); p += 4 + 4 + 4; const frames = dv.getInt32(p, true); p += 4;
      let t: [number, number, number] = [0, 0, 0];
      for (let f = 0; f < frames; f++) { const [fa, p2] = dict(p); p = p2; if (f === 0 && fa._t) { const q = fa._t.trim().split(/\s+/).map(Number); t = [q[0] | 0, q[1] | 0, q[2] | 0]; } }
      trn.set(node, { name: attr._name ?? '', t, child });
    } else if (id === 'nSHP') { const node = dv.getInt32(c, true); let [, p] = dict(c + 4); const k = dv.getInt32(p, true); p += 4; const ids: number[] = []; for (let i = 0; i < k; i++) { ids.push(dv.getInt32(p, true)); p += 4; const [, p2] = dict(p); p = p2; } shp.set(node, ids); }
    o = c + n + m;
  }
  // each shape under a transform: the transform's name and translation (nested groups' translations are not used by the game files)
  const models: VoxModel[] = [], used = new Set<number>();
  for (const tr of trn.values()) { const ids = shp.get(tr.child); if (!ids) continue; for (const i of ids) if (sizes[i]) { used.add(i); models.push({ name: tr.name, size: sizes[i], t: tr.t, voxels: data[i] ?? [] }); } }
  // a file with no scene graph (one plain model, old MagicaVoxel): the model sits centred at the origin, unnamed
  sizes.forEach((s, i) => { if (!used.has(i) && !trn.size) models.push({ name: '', size: s, t: [0, 0, 0], voxels: data[i] ?? [] }); });
  return { models, palette: palette ?? DEFAULT_PALETTE() };
}

// ------------------------------------------------------------------ writing
export function writeVox(f: VoxFile): Uint8Array {
  const parts: number[][] = [];
  const i32 = (a: number[], v: number) => { a.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255); };
  const s = (a: number[], v: string) => { const b = unescape(encodeURIComponent(v)); i32(a, b.length); for (let i = 0; i < b.length; i++) a.push(b.charCodeAt(i)); };
  const dict = (a: number[], d: Record<string, string>) => { const k = Object.keys(d); i32(a, k.length); for (const key of k) { s(a, key); s(a, d[key]); } };
  const chunk = (id: string, body: number[]) => { const a: number[] = []; for (let i = 0; i < 4; i++) a.push(id.charCodeAt(i)); i32(a, body.length); i32(a, 0); a.push(...body); parts.push(a); };
  f.models.forEach(m => {
    const sz: number[] = []; i32(sz, m.size[0]); i32(sz, m.size[1]); i32(sz, m.size[2]); chunk('SIZE', sz);
    const xyzi: number[] = []; i32(xyzi, m.voxels.length); for (const [x, y, z, c] of m.voxels) xyzi.push(x, y, z, c); chunk('XYZI', xyzi);
  });
  // the scene: root transform 0 → group 1 → (transform 2 + 2i → shape 3 + 2i → model i)
  const t0: number[] = []; i32(t0, 0); dict(t0, {}); i32(t0, 1); i32(t0, -1); i32(t0, -1); i32(t0, 1); dict(t0, {}); chunk('nTRN', t0);
  const g: number[] = []; i32(g, 1); dict(g, {}); i32(g, f.models.length); f.models.forEach((_, i) => i32(g, 2 + 2 * i)); chunk('nGRP', g);
  f.models.forEach((m, i) => {
    const t: number[] = []; i32(t, 2 + 2 * i); dict(t, m.name ? { _name: m.name } : {}); i32(t, 3 + 2 * i); i32(t, -1); i32(t, 0); i32(t, 1); dict(t, { _t: `${m.t[0]} ${m.t[1]} ${m.t[2]}` }); chunk('nTRN', t);
    const sh: number[] = []; i32(sh, 3 + 2 * i); dict(sh, {}); i32(sh, 1); i32(sh, i); dict(sh, {}); chunk('nSHP', sh);
  });
  const layer: number[] = []; i32(layer, 0); dict(layer, {}); i32(layer, -1); chunk('LAYR', layer);
  const pal: number[] = []; for (let i = 0; i < 256; i++) { const c = f.palette[i] ?? 0; pal.push((c >> 16) & 255, (c >> 8) & 255, c & 255, 255); } chunk('RGBA', pal);
  const body = parts.flat(), out: number[] = []; for (const ch of 'VOX ') out.push(ch.charCodeAt(0)); i32(out, 150);
  for (const ch of 'MAIN') out.push(ch.charCodeAt(0)); i32(out, 0); i32(out, body.length); out.push(...body);
  return new Uint8Array(out);
}

/** MagicaVoxel's palette when a file carries none (only used by files saved without RGBA, which MagicaVoxel never writes) */
function DEFAULT_PALETTE() { const p: number[] = []; for (let i = 0; i < 256; i++) p.push(((i * 37) & 255) << 16 | ((i * 91) & 255) << 8 | ((i * 53) & 255)); return p; }
