// 11-18 微信帧率: the shadow of a big static place, drawn from 12 m tiles of position-only geometry instead of the whole mesh.
// A stage is one mesh of ~190k triangles over 55 × 72 m; the moon's shadow box is 26 m round the view, yet the whole mesh went
// through the shadow pass every frame. The tiles are invisible to the view (visible = false); the shadow pass turns them on for
// its own traversal (three builds the view's draw list before it draws the shadows, so the view never sees them).
// Each tile's triangles are sorted by the way they face: the shadow pass draws back faces (as seen from the light), so the faces
// turned toward the light are culled anyway — with the light above and behind (every mood: y > 0, z < 0) the draw range stops before
// them (−y, +z and the x side facing away; both x sides when the light is straight behind).
import * as THREE from 'three';
import { OPT } from './perfOpts';

export const TILE_M = 12;
// blocks in this order: −y, +z, +x, −x, +y, −z (DIRS indices 3, 4, 0, 1, 2, 5)
const ORDER = [3, 4, 0, 1, 2, 5];
const dirIndex = (nx: number, ny: number, nz: number) => (nx > 0.5 ? 0 : nx < -0.5 ? 1 : ny > 0.5 ? 2 : ny < -0.5 ? 3 : nz > 0.5 ? 4 : 5);
interface Tile { mesh: THREE.Mesh; src: THREE.Mesh; ends: number[] }
const TILES = new Set<Tile>();

/** position-only shadow tiles of a quad-soup mesh (4 vertices + 6 indices per quad, in order); [] when the mesh is small */
export function shadowTiles(src: THREE.Mesh, T = TILE_M): THREE.Mesh[] {
  const g = src.geometry, P = g.attributes.position.array as ArrayLike<number>, N = g.attributes.normal.array as ArrayLike<number>, I = g.index!.array as ArrayLike<number>;
  const nq = I.length / 6; if (!nq) return [];
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < P.length; i += 3) { const x = P[i], z = P[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  if (x1 - x0 < T * 1.4 && z1 - z0 < T * 1.4) return [];
  // tile → per-direction lists of quads
  const tiles = new Map<number, number[][]>();
  for (let q = 0; q < nq; q++) {
    let cx = 0, cz = 0; for (let v = 0; v < 4; v++) { cx += P[(q * 4 + v) * 3]; cz += P[(q * 4 + v) * 3 + 2]; }
    const tk = Math.floor(cx / 4 / T) * 4096 + Math.floor(cz / 4 / T), v0 = q * 4 * 3;
    let t = tiles.get(tk); if (!t) tiles.set(tk, (t = [[], [], [], [], [], []]));
    t[dirIndex(N[v0], N[v0 + 1], N[v0 + 2])].push(q);
  }
  const out: THREE.Mesh[] = [];
  for (const t of tiles.values()) {
    let nv = 0; for (const l of t) nv += l.length * 4;
    const pos = new Float32Array(nv * 3), idx = nv > 65535 ? new Uint32Array(nv / 4 * 6) : new Uint16Array(nv / 4 * 6), ends: number[] = [];
    let vo = 0, io = 0;
    for (const d of ORDER) {
      for (const q of t[d]) {
        for (let k = 0; k < 12; k++) pos[vo * 3 + k] = P[q * 12 + k];
        for (let k = 0; k < 6; k++) idx[io++] = I[q * 6 + k] - q * 4 + vo;
        vo += 4;
      }
      ends.push(io);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setIndex(new THREE.BufferAttribute(idx, 1)); sg.computeBoundingSphere();
    const m = new THREE.Mesh(sg, src.material); m.castShadow = true; m.receiveShadow = false; m.visible = false; m.name = 'shadowTile';
    const tile: Tile = { mesh: m, src, ends }; TILES.add(tile);
    sg.addEventListener('dispose', () => TILES.delete(tile));
    out.push(m);
  }
  return out;
}

const L = new THREE.Vector3();
/** wrap the renderer's shadow pass: the tiles are on for it, with the draw range for this light */
export function installShadowTiles(r: THREE.WebGLRenderer) {
  const sm = r.shadowMap as unknown as { render: (lights: THREE.Light[], scene: THREE.Scene, camera: THREE.Camera) => void }, orig = sm.render.bind(sm);
  sm.render = (lights, scene, camera) => {
    if (!TILES.size || !r.shadowMap.enabled) return orig(lights, scene, camera);
    if (!OPT.shadowTiles) { for (const t of TILES) t.src.castShadow = true; return orig(lights, scene, camera); }
    // the one shadow-casting light (the moon); with more than one, or an odd angle, the tiles draw whole
    let n = 0, dl: THREE.DirectionalLight | null = null;
    for (const l of lights) if (l.castShadow) { n++; if ((l as THREE.DirectionalLight).isDirectionalLight) dl = l as THREE.DirectionalLight; }
    let blocks = 6;
    if (n === 1 && dl) {
      L.copy(dl.position).sub(dl.target.position);
      if (L.y > 0.01 && L.z < -0.01) blocks = L.x < -0.01 ? 3 : 4;
    }
    for (const t of TILES) { t.src.castShadow = false; t.mesh.visible = true; t.mesh.geometry.setDrawRange(0, t.ends[blocks - 1]); }
    try { orig(lights, scene, camera); } finally { for (const t of TILES) t.mesh.visible = false; }
  };
}
