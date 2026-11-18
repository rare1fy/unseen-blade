// Chunky voxel characters, authored as one statue in absolute cell coordinates (y up from the ground, front = +z, x centred so
// symmetric pieces mirror across x = 0). Every cell belongs to a part; every part hangs on a bone of a simple joint rig, so the actor
// animates by rotating bones (procedural poses in the actor classes). Meshing: exposed faces only (faces between two parts are kept,
// they separate when the joints move), per-corner ambient occlusion from the whole statue, and a per-cell UV that the shader uses to
// draw a soft bevel highlight on every block edge — the blocks stay readable as blocks even at a distance.
import * as THREE from 'three';
import { toon } from './toon';
import { PXU } from './pixel';
import type { Bone } from '../actors/rig';
import { shadowTiles, TILE_M } from '../engine/shadowTiles';

export type Col = number;
interface Cell { c: Col; g: number; part: string }
const key = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
const DIRS: Array<[number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// tangent axes per face direction (t1 × t2 = +axis)
const TAN: Array<[[number, number, number], [number, number, number]]> = [[[0, 1, 0], [0, 0, 1]], [[0, 1, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0]], [[0, 0, 1], [1, 0, 0]], [[1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 1, 0]]];
const AO = [0.52, 0.7, 0.86, 1];
/** act-34: the cells' occupancy as a bitset over their bounding box, padded by one cell on every side (null when the box would be
 *  absurdly large — then the caller falls back to the Map) */
function occupancy(cells: Map<number, unknown>) {
  if (cells.size < 4096) return null;   // small statues: the Map is fast enough and the box costs more than it saves
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const k of cells.keys()) {
    const z = (k % 1024) - 512, y = (Math.floor(k / 1024) % 1024) - 512, x = Math.floor(k / (1024 * 1024)) - 512;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const nx = x1 - x0 + 3, ny = y1 - y0 + 3, nz = z1 - z0 + 3, n = nx * ny * nz;
  if (n > 400e6) return null;
  const b = new Uint32Array(Math.ceil(n / 32));
  const at = (x: number, y: number, z: number) => ((x - x0 + 1) * ny + (y - y0 + 1)) * nz + (z - z0 + 1);
  for (const k of cells.keys()) {
    const z = (k % 1024) - 512, y = (Math.floor(k / 1024) % 1024) - 512, x = Math.floor(k / (1024 * 1024)) - 512, i = at(x, y, z);
    b[i >>> 5] |= 1 << (i & 31);
  }
  const occ = (x: number, y: number, z: number) => {
    const X = x - x0 + 1, Y = y - y0 + 1, Z = z - z0 + 1; if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) return false;
    const i = (X * ny + Y) * nz + Z; return ((b[i >>> 5] >>> (i & 31)) & 1) === 1;
  };
  return { b, ny, nz, at, occ };
}

/**
 * the block material: toon + bevel highlight on block edges (attribute aVox).
 * Pixel look (look/pixel.ts, shared uniform uPx): flat per-face tones (top bright, bottom dark, sides in between) and, on faces at least
 * 6 art pixels across, a crisp 1-art-pixel bevel: light on the open edges that face up-left on screen, a darker line on those facing
 * down-right. Smaller faces (character cells) keep their flat colour so nothing turns into speckle.
 */
const matCache = new Map<string, THREE.MeshToonMaterial>();
export function voxToon(o: { rim?: number; self?: number; edge?: number } = {}) {
  const k = `${o.rim ?? 0.6}|${o.self ?? 0.05}|${o.edge ?? 0.2}`;
  if (matCache.has(k)) return matCache.get(k)!;
  // a private copy: the cached toon material is shared, and this one gets an extra shader stage
  const src = toon(0xffffff, { vertexColors: true, rim: o.rim ?? 0.6, self: o.self ?? 0.05 }), m = src.clone(), edge = o.edge ?? 0.2;
  m.onBeforeCompile = (sh, r) => {
    src.onBeforeCompile(sh, r);
    sh.uniforms.uPx = PXU.uPx; sh.uniforms.uPxEdge = PXU.uPxEdge;
    sh.vertexShader = 'attribute vec2 aVox; attribute vec2 aSize; attribute vec4 aOpen; varying vec2 vVox; varying vec2 vSize; varying vec4 vOpen; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vVox = aVox; vSize = aSize; vOpen = aOpen; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = 'varying vec2 vVox; varying vec2 vSize; varying vec4 vOpen; varying vec3 vWN; uniform float uPx, uPxEdge;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { float d = 1.0; if (vOpen.x > 0.5) d = min(d, vVox.x); if (vOpen.y > 0.5) d = min(d, vSize.x - vVox.x); if (vOpen.z > 0.5) d = min(d, vVox.y); if (vOpen.w > 0.5) d = min(d, vSize.y - vVox.y);
        float bev = 1.0 + ${edge.toFixed(3)} * (1.0 - smoothstep(0.03, 0.1, d));
        if (uPx > 0.5) {
          vec3 wn = normalize(vWN);
          float tone = wn.y > 0.6 ? 1.06 : wn.y < -0.6 ? 0.66 : wn.x > 0.6 ? 0.9 : wn.x < -0.6 ? 0.92 : wn.z > 0.6 ? 1.0 : 0.84;
          vec2 gx = dFdx(vVox), gy = dFdy(vVox), fw = max(abs(gx) + abs(gy), vec2(1e-4));
          float span = min(vSize.x / fw.x, vSize.y / fw.y), hl = 0.0, dk = 0.0;
          if (span > 6.0) {
            vec2 ux = normalize(vec2(gx.x, gy.x) + 1e-6), uy = normalize(vec2(gx.y, gy.y) + 1e-6), L = vec2(-0.5, 0.866);
            float e0 = vOpen.x > 0.5 ? vVox.x / fw.x : 1e4, e1 = vOpen.y > 0.5 ? (vSize.x - vVox.x) / fw.x : 1e4;
            float e2 = vOpen.z > 0.5 ? vVox.y / fw.y : 1e4, e3 = vOpen.w > 0.5 ? (vSize.y - vVox.y) / fw.y : 1e4;
            float s0 = dot(-ux, L), s1 = dot(ux, L), s2 = dot(-uy, L), s3 = dot(uy, L);
            if (e0 < 1.0) { hl = max(hl, step(0.2, s0)); dk = max(dk, step(s0, -0.2)); }
            if (e1 < 1.0) { hl = max(hl, step(0.2, s1)); dk = max(dk, step(s1, -0.2)); }
            if (e2 < 1.0) { hl = max(hl, step(0.2, s2)); dk = max(dk, step(s2, -0.2)); }
            if (e3 < 1.0) { hl = max(hl, step(0.2, s3)); dk = max(dk, step(s3, -0.2)); }
          }
          bev = tone * (1.0 + uPxEdge * hl) * (1.0 - 0.2 * dk * (1.0 - hl));
        }
        diffuseColor.rgb *= bev; }`);
  };
  m.customProgramCacheKey = () => src.customProgramCacheKey() + '|vox' + edge + '|px';
  matCache.set(k, m); return m;
}
const glowMats = new Map<number, THREE.MeshBasicMaterial>();
const glowMat = (k: number) => { if (!glowMats.has(k)) glowMats.set(k, new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), vertexColors: true, toneMapped: false })); return glowMats.get(k)!; };

export class VoxChar {
  cells = new Map<number, Cell & { x: number; y: number; z: number }>();
  bonesAbs = new Map<string, { parent: string | null; p: THREE.Vector3 }>();
  private cur = 'root';
  constructor(readonly s: number) { this.bonesAbs.set('root', { parent: null, p: new THREE.Vector3() }); }

  /** a joint at absolute cell-corner coordinates */
  bone(name: string, parent: string, x: number, y: number, z: number) { this.bonesAbs.set(name, { parent, p: new THREE.Vector3(x, y, z) }); return this; }
  /** subsequent cells belong to this bone's part */
  part(bone: string) { if (!this.bonesAbs.has(bone)) throw new Error('no bone ' + bone); this.cur = bone; return this; }

  set(x: number, y: number, z: number, c: Col | null, g = 0) { const k = key(x, y, z); if (c == null) this.cells.delete(k); else this.cells.set(k, { x, y, z, c, g, part: this.cur }); return this; }
  get(x: number, y: number, z: number) { return this.cells.get(key(x, y, z)); }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null, g = 0) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, c, g);
    return this;
  }
  /** mirrored across x = 0 (cell x ↔ −1 − x) */
  symBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null, g = 0) { this.box(x0, y0, z0, x1, y1, z1, c, g); return this.box(-1 - x0, y0, z0, -1 - x1, y1, z1, c, g); }
  sym(x: number, y: number, z: number, c: Col | null, g = 0) { this.set(x, y, z, c, g); return this.set(-1 - x, y, z, c, g); }
  ell(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: Col, g = 0) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz; if (dx * dx + dy * dy + dz * dz <= 1) this.set(x, y, z, c, g);
    }
    return this;
  }
  /** recolour existing cells: fn returns a colour (or null to keep) */
  paint(fn: (c: Cell & { x: number; y: number; z: number }) => Col | null | undefined, onlyPart?: string) {
    for (const v of this.cells.values()) { if (onlyPart && v.part !== onlyPart) continue; const r = fn(v); if (r != null) v.c = r; }
    return this;
  }
  /** a straight run of cells between two cell centres (staffs, straps) */
  line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, g = 0) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 1);
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), Math.round(z0 + ((z1 - z0) * i) / n), c, g);
    return this;
  }

  /**
   * Build the rig: returns bones (Object3D, positioned relative to their parents, rest pose recorded) and the meshes per part.
   * jitter: per-cell brightness grain; glow: brightness multiplier for glowing cells (they feed the bloom).
   */
  build(o: { jitter?: number; glow?: number; rim?: number; self?: number; edge?: number } = {}) {
    const s = this.s, bones: Record<string, Bone> = {}, meshes: THREE.Mesh[] = [];
    for (const [name, b] of this.bonesAbs) {
      const o3 = new THREE.Object3D() as Bone; o3.name = name; bones[name] = o3;
      const par = b.parent ? this.bonesAbs.get(b.parent)!.p : new THREE.Vector3();
      o3.position.copy(b.p).sub(par).multiplyScalar(s);
    }
    for (const [name, b] of this.bonesAbs) if (b.parent) bones[b.parent].add(bones[name]);
    const occ = (x: number, y: number, z: number) => this.cells.has(key(x, y, z));
    const jit = o.jitter ?? 0.05, col = new THREE.Color();
    const byPart = new Map<string, { solid: number[][]; glow: number[][] }>();
    const hash = (x: number, y: number, z: number) => { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    for (const v of this.cells.values()) {
      if (!byPart.has(v.part)) byPart.set(v.part, { solid: [[], [], [], [], [], [], []], glow: [[], [], [], [], [], [], []] });
      const tgt = v.g > 0 ? byPart.get(v.part)!.glow : byPart.get(v.part)!.solid, [P, N, C, U, I, E, S] = tgt;
      col.set(v.c); const sh = v.g > 0 ? 1 : 1 + (hash(v.x, v.y, v.z) - 0.5) * 2 * jit;
      const bp = this.bonesAbs.get(v.part)!.p;
      for (let d = 0; d < 6; d++) {
        const [dx, dy, dz] = DIRS[d], nb = this.cells.get(key(v.x + dx, v.y + dy, v.z + dz));
        if (nb && nb.part === v.part && (nb.g > 0) === (v.g > 0)) continue;
        const [t1, t2] = TAN[d], base = P.length / 3, pos = dx + dy + dz > 0;
        const cx = v.x + 0.5 + dx * 0.5, cy = v.y + 0.5 + dy * 0.5, cz = v.z + 0.5 + dz * 0.5;
        const aos: number[] = [];
        // an edge of this face is "open" (gets the bevel) only where the block sticks out (convex edge)
        const open = (tx: number, ty: number, tz: number) => (occ(v.x + tx, v.y + ty, v.z + tz) ? 0 : 1);
        const eo = [open(-t1[0], -t1[1], -t1[2]), open(t1[0], t1[1], t1[2]), open(-t2[0], -t2[1], -t2[2]), open(t2[0], t2[1], t2[2])];
        for (const [s1, s2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          P.push((cx + (t1[0] * s1 + t2[0] * s2) * 0.5 - bp.x) * s, (cy + (t1[1] * s1 + t2[1] * s2) * 0.5 - bp.y) * s, (cz + (t1[2] * s1 + t2[2] * s2) * 0.5 - bp.z) * s);
          N.push(dx, dy, dz); U.push(s1 > 0 ? 1 : 0, s2 > 0 ? 1 : 0); E.push(...eo); S.push(1, 1);
          // corner AO from the three cells in front of the face around this corner
          const ox = v.x + dx, oy = v.y + dy, oz = v.z + dz;
          const a1 = occ(ox + t1[0] * s1, oy + t1[1] * s1, oz + t1[2] * s1) ? 1 : 0, a2 = occ(ox + t2[0] * s2, oy + t2[1] * s2, oz + t2[2] * s2) ? 1 : 0;
          const a3 = occ(ox + t1[0] * s1 + t2[0] * s2, oy + t1[1] * s1 + t2[1] * s2, oz + t1[2] * s1 + t2[2] * s2) ? 1 : 0;
          const ao = v.g > 0 ? 3 : a1 && a2 ? 0 : 3 - (a1 + a2 + a3); aos.push(ao);
          const f = AO[ao] * sh; C.push(col.r * f, col.g * f, col.b * f);
        }
        // flip the quad diagonal so AO interpolates without the anisotropy seam
        const flip = aos[0] + aos[2] < aos[1] + aos[3];
        const q = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
        if (pos) I.push(...q.map(i => base + i)); else I.push(base + q[0], base + q[2], base + q[1], base + q[3], base + q[5], base + q[4]);
      }
    }
    const solidMat = voxToon({ rim: o.rim, self: o.self, edge: o.edge });
    for (const [part, { solid, glow }] of byPart) {
      for (const [arr, isGlow] of [[solid, false], [glow, true]] as const) {
        const [P, N, C, U, I, E, S] = arr; if (!I.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aVox', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('aOpen', new THREE.Float32BufferAttribute(E, 4)); g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 2)); g.setIndex(I);
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, isGlow ? glowMat(o.glow ?? 2.6) : solidMat); m.castShadow = !isGlow; m.receiveShadow = false; m.name = part + (isGlow ? '_glow' : '');
        bones[part].add(m); if (!isGlow) meshes.push(m);
      }
    }
    for (const b of Object.values(bones)) b.rest = { p: b.position.clone(), r: b.rotation.clone(), s: b.scale.clone() };
    return { bones, meshes, root: bones.root };
  }
}

// ================================================================== static voxel world (the arena)
/**
 * Cells for scenery. build() merges coplanar faces of one colour that have no ambient occlusion into rectangles (greedy), so large
 * floors and walls cost a handful of quads; faces next to other blocks keep per-cell AO. Every face gets the same bevel as the
 * characters (edges that stick out), measured in cells so a merged slab is bevelled only along its border.
 */
export class VoxWorld {
  cells = new Map<number, { c: number; g: number }>();
  constructor(readonly s: number) {}
  set(x: number, y: number, z: number, c: number | null, g = 0) { const k = key(x, y, z); if (c == null) this.cells.delete(k); else this.cells.set(k, { c, g }); return this; }
  has(x: number, y: number, z: number) { return this.cells.has(key(x, y, z)); }
  get(x: number, y: number, z: number) { return this.cells.get(key(x, y, z)); }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null, g = 0) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, c, g);
    return this;
  }
  /** chunk (cells, > 0): no merged rectangle crosses a chunk border in x or z, and every vertex carries its chunk's centre (world xz)
   *  as aChunk — the voxel-wave transition (scenes/transVox.ts) moves each 1 m column as one rigid block */
  build(o: { glow?: number; rim?: number; self?: number; edge?: number; chunk?: number; tile?: number; ground?: boolean } = {}) {
    // act-34 (用户：「现在转场的时候有点卡」): a big place (the snowy village, 2.2 M cells) spent 2.7 s here asking the cell Map about
    // every neighbour. The occupancy now sits in a bitset over the cells' bounding box (padded by one cell, so every neighbour test of
    // a face, its AO corners and its edges stays inside it) and the face loop walks neighbours by index steps.
    const s = this.s, CH = o.chunk ?? 0, bits = occupancy(this.cells);
    // (a whole place, not a prop that may topple or fly: those keep every face)
    const GROUND = o.ground ?? this.cells.size > 200000;
    const occ = bits ? bits.occ : (x: number, y: number, z: number) => this.cells.has(key(x, y, z));
    const chk = (x: number, z: number) => (CH ? Math.floor(x / CH) * 4096 + Math.floor(z / CH) : 0);
    const out = { solid: [[], [], [], [], [], [], [], []] as number[][], glow: [[], [], [], [], [], [], [], []] as number[][] };
    const col = new THREE.Color();
    // slices for merging: (dir, plane) → (u,v) → colour key
    const slices = new Map<number, Map<number, number>>();
    const uvKey = (u: number, v: number) => (u + 512) * 1024 + (v + 512);
    const quad = (tgt: number[][], corners: number[][], n: number[], c: THREE.Color, ao: number[], size: [number, number], open: number[], pos: boolean, cell: [number, number] = [0, 0]) => {
      const [P, N, C, U, I, E, S, K] = tgt, base = P.length / 3;
      const kx = CH ? (Math.floor(cell[0] / CH) + 0.5) * CH * s : 0, kz = CH ? (Math.floor(cell[1] / CH) + 0.5) * CH * s : 0;
      corners.forEach((p, i) => { P.push(p[0] * s, p[1] * s, p[2] * s); N.push(n[0], n[1], n[2]); const f = AO[ao[i]]; C.push(c.r * f, c.g * f, c.b * f); if (CH) K.push(kx, kz);
        U.push(i === 1 || i === 2 ? size[0] : 0, i === 2 || i === 3 ? size[1] : 0); E.push(...open); S.push(size[0], size[1]); });
      const flip = ao[0] + ao[2] < ao[1] + ao[3], q = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
      if (pos) I.push(...q.map(i => base + i)); else I.push(base + q[0], base + q[2], base + q[1], base + q[3], base + q[5], base + q[4]);
    };
    const B = bits?.b, SX = bits ? bits.ny * bits.nz : 0, SY = bits ? bits.nz : 0;
    const DD = DIRS.map(([a, b, c]) => a * SX + b * SY + c), TD = TAN.map(([p, q]) => [p[0] * SX + p[1] * SY + p[2], q[0] * SX + q[1] * SY + q[2]]);
    const SG: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const aos = [0, 0, 0, 0];
    for (const [k, v] of this.cells) {
      const z = (k % 1024) - 512, y = (Math.floor(k / 1024) % 1024) - 512, x = Math.floor(k / (1024 * 1024)) - 512;
      const ci = bits ? bits.at(x, y, z) : 0;
      for (let d = 0; d < 6; d++) {
        if (d === 3 && y <= 0 && GROUND) continue;   // 11-18 微信帧率: in a whole place, the underside of what lies on (or under) the ground is never seen, nor needed for a shadow
        const [dx, dy, dz] = DIRS[d], [t1, t2] = TAN[d], ox = x + dx, oy = y + dy, oz = z + dz;
        if (B) {
          const oi = ci + DD[d]; if ((B[oi >>> 5] >>> (oi & 31)) & 1) continue;
          const T1 = TD[d][0], T2 = TD[d][1];
          for (let q = 0; q < 4; q++) {
            const s1 = SG[q][0], s2 = SG[q][1], i1 = oi + T1 * s1, i2 = oi + T2 * s2, i3 = i1 + T2 * s2;
            const a1 = (B[i1 >>> 5] >>> (i1 & 31)) & 1, a2 = (B[i2 >>> 5] >>> (i2 & 31)) & 1, a3 = (B[i3 >>> 5] >>> (i3 & 31)) & 1;
            aos[q] = v.g > 0 ? 3 : a1 && a2 ? 0 : 3 - (a1 + a2 + a3);
          }
        } else {
          if (occ(ox, oy, oz)) continue;
          for (let q = 0; q < 4; q++) {
            const s1 = SG[q][0], s2 = SG[q][1];
            const a1 = occ(ox + t1[0] * s1, oy + t1[1] * s1, oz + t1[2] * s1) ? 1 : 0, a2 = occ(ox + t2[0] * s2, oy + t2[1] * s2, oz + t2[2] * s2) ? 1 : 0;
            const a3 = occ(ox + t1[0] * s1 + t2[0] * s2, oy + t1[1] * s1 + t2[1] * s2, oz + t1[2] * s1 + t2[2] * s2) ? 1 : 0;
            aos[q] = v.g > 0 ? 3 : a1 && a2 ? 0 : 3 - (a1 + a2 + a3);
          }
        }
        const a = dx ? x : dy ? y : z, u = dx ? y : dy ? z : x, w = dx ? z : dy ? x : y;
        if (v.g === 0 && aos[0] === 3 && aos[1] === 3 && aos[2] === 3 && aos[3] === 3) {
          const sk = d * 2048 + a + 1024; let sl = slices.get(sk); if (!sl) slices.set(sk, (sl = new Map()));
          sl.set(uvKey(u, w), v.c); continue;
        }
        const cx = x + 0.5 + dx * 0.5, cy = y + 0.5 + dy * 0.5, cz = z + 0.5 + dz * 0.5;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s1, s2]) => [cx + (t1[0] * s1 + t2[0] * s2) * 0.5, cy + (t1[1] * s1 + t2[1] * s2) * 0.5, cz + (t1[2] * s1 + t2[2] * s2) * 0.5]);
        const open = [occ(x - t1[0], y - t1[1], z - t1[2]) ? 0 : 1, occ(x + t1[0], y + t1[1], z + t1[2]) ? 0 : 1, occ(x - t2[0], y - t2[1], z - t2[2]) ? 0 : 1, occ(x + t2[0], y + t2[1], z + t2[2]) ? 0 : 1];
        col.set(v.c); quad(v.g > 0 ? out.glow : out.solid, corners, [dx, dy, dz], col, aos.slice(), [1, 1], open, dx + dy + dz > 0, [x, z]);
      }
    }
    // greedy rectangles per slice
    for (const [sk, sl] of slices) {
      const d = Math.floor(sk / 2048), a = (sk % 2048) - 1024, [dx, dy, dz] = DIRS[d], pos = dx + dy + dz > 0, plane = pos ? a + 1 : a;
      const keys = [...sl.keys()].sort((p, q) => p - q), done = new Set<number>();
      const cellAt = (u: number, w: number) => (dx ? [a, u, w] : dy ? [w, a, u] : [u, w, a]) as [number, number, number];
      for (const k0 of keys) {
        if (done.has(k0)) continue;
        const ck = sl.get(k0)!, u0 = Math.floor(k0 / 1024) - 512, w0 = (k0 % 1024) - 512;
        const c0 = cellAt(u0, w0), ch0 = chk(c0[0], c0[2]), same = (u: number, w: number) => { if (!CH) return true; const c = cellAt(u, w); return chk(c[0], c[2]) === ch0; };
        let w1 = w0; while (sl.get(uvKey(u0, w1 + 1)) === ck && !done.has(uvKey(u0, w1 + 1)) && same(u0, w1 + 1)) w1++;
        let u1 = u0;
        grow: for (;;) { for (let ww = w0; ww <= w1; ww++) { const kk = uvKey(u1 + 1, ww); if (sl.get(kk) !== ck || done.has(kk) || !same(u1 + 1, ww)) break grow; } u1++; }
        for (let uu = u0; uu <= u1; uu++) for (let ww = w0; ww <= w1; ww++) done.add(uvKey(uu, ww));
        // an edge of the rectangle is bevelled where the surface does not continue in-plane beyond it
        const t1 = TAN[d][0], t2 = TAN[d][1];
        const edgeOpen = (cells: Array<[number, number, number]>, t: number[], sgn: number) => cells.every(([cx, cy, cz]) => !occ(cx + t[0] * sgn, cy + t[1] * sgn, cz + t[2] * sgn)) ? 1 : 0;
        const colU = (uu: number) => { const r: Array<[number, number, number]> = []; for (let ww = w0; ww <= w1; ww++) r.push(cellAt(uu, ww)); return r; };
        const rowW = (ww: number) => { const r: Array<[number, number, number]> = []; for (let uu = u0; uu <= u1; uu++) r.push(cellAt(uu, ww)); return r; };
        const open = [edgeOpen(colU(u0), t1, -1), edgeOpen(colU(u1), t1, 1), edgeOpen(rowW(w0), t2, -1), edgeOpen(rowW(w1), t2, 1)];
        const corners = [[u0, w0], [u1 + 1, w0], [u1 + 1, w1 + 1], [u0, w1 + 1]].map(([uu, ww]) => (dx ? [plane, uu, ww] : dy ? [ww, plane, uu] : [uu, ww, plane]));
        col.set(ck); quad(out.solid, corners, [dx, dy, dz], col, [3, 3, 3, 3], [u1 - u0 + 1, w1 - w0 + 1], open, pos, [c0[0], c0[2]]);
      }
    }
    const meshes: THREE.Mesh[] = [];
    for (const [arr, isGlow] of [[out.solid, false], [out.glow, true]] as const) {
      const [P, N, C, U, I, E, S, K] = arr; if (!I.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      g.setAttribute('aVox', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('aOpen', new THREE.Float32BufferAttribute(E, 4)); g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 2));
      if (CH) g.setAttribute('aChunk', new THREE.Float32BufferAttribute(K, 2));
      g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1)); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, isGlow ? glowMat(o.glow ?? 2.4) : voxToon({ rim: o.rim ?? 0.35, self: o.self ?? 0.03, edge: o.edge ?? 0.16 }));
      m.castShadow = !isGlow; m.receiveShadow = true; meshes.push(m);
      // 11-18 微信帧率: a big place draws its shadow from 12 m position-only tiles instead (engine/shadowTiles.ts)
      if (!isGlow) { const tiles = shadowTiles(m, o.tile ?? TILE_M); if (tiles.length) { m.castShadow = false; m.userData.shadowTiled = true; meshes.push(...tiles); } }
    }
    return meshes;
  }
}
