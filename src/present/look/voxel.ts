// Voxel look: turns any mesh (skinned or rigid) into a block model at load time. Triangles are sampled onto a grid; each surface voxel
// takes the colour of the sample nearest its centre and binds 100% to that vertex's strongest bone, so a voxelised character plays
// the same animation clips as the smooth one — limbs move as rigid blocks, the way hand-made voxel characters animate.
// Faces between two voxels of the same bone are dropped; a small per-voxel brightness jitter gives the blocks a hand-painted grain.
import * as THREE from 'three';
import { toon } from './toon';

/** the current look; actors and the arena listen and swap meshes */
export const LOOK = { voxel: false, subs: new Set<(v: boolean) => void>() };
export function setLook(voxel: boolean) { LOOK.voxel = voxel; for (const f of LOOK.subs) f(voxel); }
export function onLook(f: (v: boolean) => void) { LOOK.subs.add(f); f(LOOK.voxel); return () => LOOK.subs.delete(f); }

interface Cand { d: number; r: number; g: number; b: number; bone: number; nx: number; ny: number; nz: number }
interface Cell { c: Cand[]; r: number; g: number; b: number; bone: number }
const DIRS: Array<[number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const key = (x: number, y: number, z: number) => ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
const hash3 = (x: number, y: number, z: number) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Voxelise one geometry (in its own space). `skinned` keeps a single bone index per voxel. */
export function voxelGeometry(geo: THREE.BufferGeometry, size: number, o: { skinned?: boolean; jitter?: number; color?: THREE.Color; minFaces?: boolean } = {}) {
  const pos = geo.attributes.position, col = geo.attributes.color, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const idx = geo.index, tris = idx ? idx.count / 3 : pos.count / 3, cells = new Map<number, Cell>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3(), tn = new THREE.Vector3(), e1 = new THREE.Vector3(), inv = 1 / size, base = o.color || new THREE.Color(1, 1, 1);
  const vi = [0, 0, 0];
  const strongest = (v: number) => { if (!si || !sw) return 0; let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > bw) { bw = w; best = si.getComponent(v, k); } } return best; };
  for (let t = 0; t < tris; t++) {
    for (let k = 0; k < 3; k++) vi[k] = idx ? idx.getX(t * 3 + k) : t * 3 + k;
    a.fromBufferAttribute(pos, vi[0]); b.fromBufferAttribute(pos, vi[1]); c.fromBufferAttribute(pos, vi[2]);
    tn.subVectors(b, a).cross(e1.subVectors(c, a)); if (tn.lengthSq() < 1e-14) continue; tn.normalize();
    const n = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) * inv * 2.2));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, w = 1 - u - v;
      p.set(a.x * w + b.x * u + c.x * v, a.y * w + b.y * u + c.y * v, a.z * w + b.z * u + c.z * v);
      const ix = Math.floor(p.x * inv), iy = Math.floor(p.y * inv), iz = Math.floor(p.z * inv);
      const dx = p.x * inv - ix - 0.5, dy = p.y * inv - iy - 0.5, dz = p.z * inv - iz - 0.5, d = dx * dx + dy * dy + dz * dz;
      const kk = key(ix, iy, iz); let cell = cells.get(kk);
      if (!cell) { cell = { c: [], r: 1, g: 1, b: 1, bone: 0 }; cells.set(kk, cell); }
      // one candidate per facing direction (within ~45°): keep the sample closest to the cell centre
      let cand = cell.c.find(x => x.nx * tn.x + x.ny * tn.y + x.nz * tn.z > 0.7);
      if (cand && cand.d <= d) continue;
      const near = w >= u && w >= v ? vi[0] : u >= v ? vi[1] : vi[2];
      if (!cand) { if (cell.c.length >= 6) continue; cand = {} as Cand; cell.c.push(cand); }
      cand.d = d; cand.r = (col ? col.getX(near) : 1) * base.r; cand.g = (col ? col.getY(near) : 1) * base.g; cand.b = (col ? col.getZ(near) : 1) * base.b;
      cand.bone = o.skinned ? strongest(near) : 0; cand.nx = tn.x; cand.ny = tn.y; cand.nz = tn.z;
    }
  }
  // resolve each cell: the candidate whose surface faces the cell's open sides wins (else the one nearest the centre)
  for (const [kk, cell] of cells) {
    const iz = (kk % 2048) - 1024, iy = (Math.floor(kk / 2048) % 2048) - 1024, ix = Math.floor(kk / (2048 * 2048)) - 1024;
    let ex = 0, ey = 0, ez = 0; for (const [dx, dy, dz] of DIRS) if (!cells.has(key(ix + dx, iy + dy, iz + dz))) { ex += dx; ey += dy; ez += dz; }
    let best = cell.c[0], bs = -1e9;
    for (const x of cell.c) { const sc = (x.nx * ex + x.ny * ey + x.nz * ez) * 4 - x.d; if (sc > bs) { bs = sc; best = x; } }
    cell.r = best.r; cell.g = best.g; cell.b = best.b; cell.bone = best.bone;
  }
  // exposed faces, bucketed per (direction, slice); same-colour same-bone faces in a slice are merged greedily into rectangles
  const P: number[] = [], N: number[] = [], C: number[] = [], SI: number[] = [], I: number[] = [];
  const jit = o.jitter ?? 0.07, q = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
  const slices = new Map<number, Map<number, number>>();   // slice → (u,v) → colour/bone key
  for (const [kk, cell] of cells) {
    const iz = (kk % 2048) - 1024, iy = (Math.floor(kk / 2048) % 2048) - 1024, ix = Math.floor(kk / (2048 * 2048)) - 1024;
    const shade = 1 + (hash3(ix, iy, iz) - 0.5) * 2 * jit, ck = ((q(cell.r * shade) * 256 + q(cell.g * shade)) * 256 + q(cell.b * shade)) * 128 + cell.bone;
    for (let d = 0; d < 6; d++) {
      const [dx, dy, dz] = DIRS[d], nb = cells.get(key(ix + dx, iy + dy, iz + dz));
      if (nb && nb.bone === cell.bone) continue;
      // u = first tangent axis, v = second (t1 × t2 = +axis): x → (y, z), y → (z, x), z → (x, y)
      const a = dx ? ix : dy ? iy : iz, u = dx ? iy : dy ? iz : ix, v = dx ? iz : dy ? ix : iy;
      const sk = d * 4096 + a + 2048; let sl = slices.get(sk); if (!sl) slices.set(sk, (sl = new Map()));
      sl.set((u + 1024) * 2048 + v + 1024, ck);
    }
  }
  for (const [sk, sl] of slices) {
    const d = Math.floor(sk / 4096), a = (sk % 4096) - 2048, [dx, dy, dz] = DIRS[d], pos = dx + dy + dz > 0;
    const plane = (pos ? a + 1 : a) * size;
    const keys = [...sl.keys()].sort((x, y) => x - y), done = new Set<number>();
    for (const k0 of keys) {
      if (done.has(k0)) continue;
      const ck = sl.get(k0)!, u0 = Math.floor(k0 / 2048) - 1024, v0 = (k0 % 2048) - 1024;
      const at = (uu: number, vv: number) => (uu + 1024) * 2048 + vv + 1024;
      let v1 = v0; while (sl.get(at(u0, v1 + 1)) === ck && !done.has(at(u0, v1 + 1))) v1++;
      let u1 = u0;
      grow: for (;;) { for (let vv = v0; vv <= v1; vv++) { const kx = at(u1 + 1, vv); if (sl.get(kx) !== ck || done.has(kx)) break grow; } u1++; }
      for (let uu = u0; uu <= u1; uu++) for (let vv = v0; vv <= v1; vv++) done.add(at(uu, vv));
      const base = P.length / 3, bone = ck % 128, rgb = Math.floor(ck / 128), r = Math.floor(rgb / 65536) / 255, g = (Math.floor(rgb / 256) % 256) / 255, b = (rgb % 256) / 255;
      for (const [uu, vv] of [[u0, v0], [u1 + 1, v0], [u1 + 1, v1 + 1], [u0, v1 + 1]]) {
        const U = uu * size, V = vv * size;
        if (dx) P.push(plane, U, V); else if (dy) P.push(V, plane, U); else P.push(U, V, plane);
        N.push(dx, dy, dz); C.push(r, g, b); SI.push(bone);
      }
      if (pos) I.push(base, base + 1, base + 2, base, base + 2, base + 3); else I.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  if (!I.length) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  if (o.skinned) {
    const n = SI.length, idx4 = new Uint16Array(n * 4), w4 = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { idx4[i * 4] = SI[i]; w4[i * 4] = 1; }
    out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx4, 4)); out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w4, 4));
  }
  out.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return { geo: out, voxels: cells.size };
}

export const voxMat = (rim = 0.8, self = 0) => toon(0xffffff, { vertexColors: true, rim, self });

/**
 * Build a voxel twin of every mesh under `model` (skinned meshes keep their skeleton) and add it next to the original.
 * `size` is in the model's own units. Returns the smooth and voxel meshes so the owner can swap them.
 */
export function voxelTwin(model: THREE.Object3D, size: number, o: { mat?: (src: THREE.Mesh) => THREE.Material | null; self?: number } = {}) {
  const smooth: THREE.Mesh[] = [], vox: THREE.Mesh[] = [];
  model.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = []; model.traverse(x => { if ((x as THREE.Mesh).isMesh && !x.userData.vox) meshes.push(x as THREE.Mesh); });
  for (const m of meshes) {
    const skinned = (m as THREE.SkinnedMesh).isSkinnedMesh;
    if (m.userData.glow) {
      const g = m.geometry.clone(); g.computeBoundingBox(); const c = g.boundingBox!.getCenter(new THREE.Vector3());
      g.translate(-c.x, -c.y, -c.z); g.scale(1.5, 1.5, 1.5); g.translate(c.x, c.y, c.z + size * 1.1);
      const v = skinned ? new THREE.SkinnedMesh(g, m.material) : new THREE.Mesh(g, m.material);
      if (skinned) (v as THREE.SkinnedMesh).bind((m as THREE.SkinnedMesh).skeleton, (m as THREE.SkinnedMesh).bindMatrix);
      v.position.copy(m.position); v.quaternion.copy(m.quaternion); v.scale.copy(m.scale); v.userData.vox = true; v.frustumCulled = false; m.parent!.add(v); smooth.push(m); vox.push(v); continue;
    }
    // rigid parts may be scaled inside the model; keep the voxel size constant in model units
    const s = skinned ? 1 : new THREE.Vector3().setFromMatrixScale(m.matrixWorld).x / Math.max(1e-6, new THREE.Vector3().setFromMatrixScale(model.matrixWorld).x);
    const r = voxelGeometry(m.geometry, size / Math.max(1e-4, s), { skinned });
    if (!r) continue;
    const mat = o.mat?.(m) ?? voxMat(0.8, o.self ?? 0);
    let v: THREE.Mesh;
    if (skinned) { const sm = m as THREE.SkinnedMesh, vs = new THREE.SkinnedMesh(r.geo, mat); vs.bind(sm.skeleton, sm.bindMatrix); v = vs; }
    else v = new THREE.Mesh(r.geo, mat);
    v.position.copy(m.position); v.quaternion.copy(m.quaternion); v.scale.copy(m.scale); v.name = m.name + '_vox'; v.userData.vox = true;
    v.castShadow = m.castShadow; v.receiveShadow = m.receiveShadow; v.frustumCulled = false;
    m.parent!.add(v); smooth.push(m); vox.push(v);
  }
  return { smooth, vox };
}

/** a static prop (any hierarchy) flattened into one voxel mesh in the prop's root space */
export function voxelProp(root: THREE.Object3D, size: number) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), parts: THREE.BufferGeometry[] = [];
  root.traverse(x => {
    const m = x as THREE.Mesh; if (!m.isMesh) return;
    const g = m.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.color) { const c = ((m.material as THREE.MeshStandardMaterial).color || new THREE.Color(1, 1, 1)), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); }
    else if (g.attributes.color.itemSize === 4 || (g.attributes.color as THREE.BufferAttribute).normalized) { const src = g.attributes.color, n = src.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([src.getX(i), src.getY(i), src.getZ(i)], i * 3); g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); }
    parts.push(g.index ? g : g);
  });
  // voxelise part by part into one shared grid
  const merged = new THREE.BufferGeometry(), P: number[] = [], C: number[] = [], I: number[] = [];
  for (const g of parts) { const base = P.length / 3, pa = g.attributes.position, ca = g.attributes.color; for (let i = 0; i < pa.count; i++) { P.push(pa.getX(i), pa.getY(i), pa.getZ(i)); C.push(ca.getX(i), ca.getY(i), ca.getZ(i)); } if (g.index) for (let i = 0; i < g.index.count; i++) I.push(base + g.index.getX(i)); else for (let i = 0; i < pa.count; i++) I.push(base + i); }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); merged.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); merged.setIndex(I);
  return voxelGeometry(merged, size, { jitter: 0 });
}
