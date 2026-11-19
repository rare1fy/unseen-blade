// 11-18 微信帧率: the shadow of a big static place, drawn from 12 m tiles of position-only geometry instead of the whole mesh.
// A stage is one mesh of ~190k triangles over 55 × 72 m; the moon's shadow box is 26 m round the view, yet the whole mesh went
// through the shadow pass every frame. The tiles are invisible to the view (visible = false); the shadow pass turns them on for
// its own traversal (three builds the view's draw list before it draws the shadows, so the view never sees them).
// Each tile's triangles are sorted by the way they face: the shadow pass draws back faces (as seen from the light), so the faces
// turned toward the light are culled anyway — with the light above and behind (every mood: y > 0, z < 0) the draw range stops before
// them (−y, +z and the x side facing away; both x sides when the light is straight behind).
import * as THREE from 'three';
import { OPT } from './perfOpts';
import { QUALITY } from '../look/quality';

export const TILE_M = 12;
// blocks in this order: −y, +z, +x, −x, +y, −z (DIRS indices 3, 4, 0, 1, 2, 5)
const ORDER = [3, 4, 0, 1, 2, 5];
const dirIndex = (nx: number, ny: number, nz: number) => (nx > 0.5 ? 0 : nx < -0.5 ? 1 : ny > 0.5 ? 2 : ny < -0.5 ? 3 : nz > 0.5 ? 4 : 5);
interface Tile { box: THREE.Box3; mesh: THREE.Mesh; src: THREE.Mesh; ends: number[] }
interface ViewTiles {
  src: THREE.Mesh;
  original: Uint16Array | Uint32Array;
  membership: Uint32Array;
  tiles: Tile[];
  visible: boolean[];
  clipped: boolean;
  lastCamera: string;
  coarse: boolean[];
  groups: THREE.Box3[];
  groupOf: Uint32Array;
  groupsOn: boolean[];
  partner: Int32Array;
}
const views = new Set<ViewTiles>();
const frustum = new THREE.Frustum(), projection = new THREE.Matrix4(), box = new THREE.Box3();
const shadows = new THREE.Box3(), offset = new THREE.Vector3();
const localCamera = new THREE.Vector3(), corner = new THREE.Vector3();

export function updateStageTiles(camera: THREE.Camera) {
  frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  for (const view of views) {
    const { src, original, membership, tiles, visible } = view;
    if (!src.userData.stageTerrain || !src.parent?.parent || src.geometry.attributes.aChunk) continue;
    const geometry = src.geometry, index = geometry.index!;
    if (!OPT.cameraTiles || !OPT.shadowTiles) {
      if (view.clipped) {
        index.array.set(original); index.clearUpdateRanges(); index.needsUpdate = true; geometry.setDrawRange(0, original.length);
        view.clipped = false;
      }
      continue;
    }
    src.worldToLocal(localCamera.copy(camera.position));
    const cx = Math.floor(localCamera.x), cy = Math.floor(localCamera.y), cz = Math.floor(localCamera.z);
    const key = cx + '/' + cy + '/' + cz + '/' + QUALITY.tier;
    let changed = !view.clipped || key !== view.lastCamera;
    view.lastCamera = key;
    for (let i = 0; i < tiles.length; i++) {
      box.copy(tiles[i].box).applyMatrix4(src.matrixWorld).expandByScalar(1.5);
      const on = frustum.intersectsBox(box);
      // Choose the exterior mesh before it enters the padded view. A visible tile keeps its mesh as the camera tracks.
      if (!visible[i] || !view.clipped || QUALITY.tier === 'high') view.coarse[i] = QUALITY.tier !== 'high' && box.distanceToPoint(camera.position) > 26;
      if (visible[i] !== on) { visible[i] = on; changed = true; }
    }
    for (let i=0; i<view.groups.length; i++) {
      box.copy(view.groups[i]).applyMatrix4(src.matrixWorld).expandByScalar(0.7);
      const on = frustum.intersectsBox(box);
      if (view.groupsOn[i] !== on) { view.groupsOn[i] = on; changed = true; }
    }
    if (!changed) continue;
    // Keep original triangle order (coplanar details); only the index prefix changes at tile boundaries.
    let n = 0;
    const p = geometry.attributes.position.array, normal = geometry.attributes.normal.array;
    for (let q = 0; q < membership.length; q++) if (visible[membership[q]] && view.groupsOn[view.groupOf[q]]) {
      const v = q*12;
      // Back faces cannot contribute to the opaque colour pass. Keep a whole metre of slack for the cached camera cell.
      if ((cx-p[v])*normal[v] + (cy-p[v+1])*normal[v+1] + (cz-p[v+2])*normal[v+2] < -1.1) continue;
      const start = q * 6;
      const pair = view.coarse[membership[q]] ? view.partner[q] : 0;
      if (pair < 0) continue;
      for (let k = 0; k < 6; k++) {
        const i = original[start+k], c = i-q*4;
        index.array[n++] = pair && (c === 1 || c === 2) ? (pair-1)*4+c : i;
      }
    }
    geometry.setDrawRange(0, n);
    index.clearUpdateRanges(); if (n) index.addUpdateRange(0, n);
    index.needsUpdate = true; view.clipped = true;
  }
}
const TILES = new Set<Tile>();

export interface ShadowLayout {
  tiles: { ends: number[]; box: number[]; sphere: number[] }[];
  groups: number[][];
  order: Uint32Array;
  groupOf: Uint32Array;
  partner: Int32Array;
}
// Only the offline baker requests a copy of the face order.
export const shadowBake: { capture?: (src: THREE.Mesh, layout: ShadowLayout) => void } = {};
const bounds = (b: THREE.Box3) => [...b.min.toArray(), ...b.max.toArray()];
const readBox = (b: number[]) => new THREE.Box3(new THREE.Vector3().fromArray(b), new THREE.Vector3().fromArray(b, 3));

function installView(src: THREE.Mesh, tiles: Tile[], membership: Uint32Array, groups: THREE.Box3[], groupOf: Uint32Array, partner: Int32Array) {
  const g = src.geometry;
  const view: ViewTiles = { src, tiles, original: g.index!.array.slice() as Uint16Array | Uint32Array, membership,
    visible: [], clipped: false, lastCamera: '', coarse: [], groups, groupOf, groupsOn: [], partner };
  views.add(view);
  g.addEventListener('dispose', () => views.delete(view));
}

export function* restoreShadowTiles(src: THREE.Mesh, layout: ShadowLayout) {
  const index = src.geometry.index!.array, members = new Uint32Array(layout.order.length), tiles: Tile[] = [];
  let offset = 0;
  for (const t of layout.tiles) {
    const length = t.ends[5], count = length / 6;
    const indices = index instanceof Uint32Array ? new Uint32Array(length) : new Uint16Array(length);
    for (let j = 0; j < count; j++) {
      const q = layout.order[offset + j];
      members[q] = tiles.length;
      for (let k = 0; k < 6; k++) indices[j * 6 + k] = index[q * 6 + k];
      if ((j & 2047) === 2047) yield;
    }
    offset += count;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.geometry.attributes.position);
    g.setIndex(new THREE.BufferAttribute(indices, 1));
    g.boundingBox = readBox(t.box);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3().fromArray(t.sphere), t.sphere[3]);
    const mesh = new THREE.Mesh(g, src.material);
    mesh.name = 'shadowTile'; mesh.castShadow = true; mesh.visible = false;
    const tile = { mesh, src, ends: t.ends, box: g.boundingBox };
    tiles.push(tile);
    yield;
  }
  // Register together, after the final yield, so an abandoned decoder leaves no global references.
  for (const t of tiles) {
    TILES.add(t);
    t.mesh.geometry.addEventListener('dispose', () => TILES.delete(t));
  }
  installView(src, tiles, members, layout.groups.map(readBox), layout.groupOf, layout.partner);
  return tiles.map(t => t.mesh);
}

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
  const members = new Uint32Array(nq), parts: Tile[] = [];
  const order = shadowBake.capture ? new Uint32Array(nq) : null;
  let oi = 0;
  for (const t of tiles.values()) {
    let nv = 0; for (const l of t) nv += l.length * 4;
    const pos = new Float32Array(nv * 3), idx = nv > 65535 ? new Uint32Array(nv / 4 * 6) : new Uint16Array(nv / 4 * 6), ends: number[] = [];
    let vo = 0, io = 0;
    for (const d of ORDER) {
      for (const q of t[d]) {
        if (order) order[oi++] = q;
        members[q] = parts.length;
        for (let k = 0; k < 12; k++) pos[vo * 3 + k] = P[q * 12 + k];
        for (let k = 0; k < 6; k++) idx[io++] = I[q * 6 + k] - q * 4 + vo;
        vo += 4;
      }
      ends.push(io);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setIndex(new THREE.BufferAttribute(idx, 1)); sg.computeBoundingSphere();
    const m = new THREE.Mesh(sg, src.material); m.castShadow = true; m.receiveShadow = false; m.visible = false; m.name = 'shadowTile';
    sg.computeBoundingBox();
    const tile: Tile = { box: sg.boundingBox!, mesh: m, src, ends }; TILES.add(tile); parts.push(tile);
    sg.addEventListener('dispose', () => TILES.delete(tile));
    out.push(m);
  }
  const groupOf = new Uint32Array(nq), groups: THREE.Box3[] = [], groupIds = new Map<number, number>();
  const leftEdges = new Map<string, number>(), partner = new Int32Array(nq);
  const colors = g.attributes.color?.array;
  function edgeKey(q: number, a: number, b: number) {
    const v=q*12, A=v+a*3, B=v+b*3;
    // Opposite corners of a shared edge may have different AO. Colour buckets keep distant wall patterns legible.
    const col = colors ? (Math.round(colors[v]*15)*256 + Math.round(colors[v+1]*15)*16 + Math.round(colors[v+2]*15)) : 0;
    return [groupOf[q], members[q], dirIndex(N[v],N[v+1],N[v+2]), col, P[A],P[A+1],P[A+2],P[B],P[B+1],P[B+2]].join('/');
  }
  for (let q=0; q<nq; q++) {
    const v=q*12, x=(P[v]+P[v+6])/2, z=(P[v+2]+P[v+8])/2, id=Math.floor(x/3)*65536+Math.floor(z/3);
    let i=groupIds.get(id);
    if (i===undefined) { i=groups.length; groups.push(new THREE.Box3()); groupIds.set(id,i); }
    groupOf[q]=i;
    for(let k=v;k<v+12;k+=3) groups[i].expandByPoint(corner.set(P[k],P[k+1],P[k+2]));
    leftEdges.set(edgeKey(q,0,3),q);
  }
  for (let q=0; q<nq; q++) {
    if (partner[q]) continue;
    const other=leftEdges.get(edgeKey(q,1,2));
    if (other===undefined || partner[other] || other===q) continue;
    partner[q]=other+1; partner[other]=-1;
  }
  installView(src, parts, members, groups, groupOf, partner);
  if (order) shadowBake.capture!(src, { order, groupOf, partner, groups: groups.map(bounds), tiles: parts.map(t => {
    const sphere = t.mesh.geometry.boundingSphere!;
    return { ends: t.ends, box: bounds(t.box), sphere: [...sphere.center.toArray(), sphere.radius] };
  }) });
  return out;
}

const L = new THREE.Vector3();
/** wrap the renderer's shadow pass: the tiles are on for it, with the draw range for this light */
export function installShadowTiles(r: THREE.WebGLRenderer) {
  const sm = r.shadowMap as unknown as { render: (lights: THREE.Light[], scene: THREE.Scene, camera: THREE.Camera) => void }, orig = sm.render.bind(sm);
  sm.render = (lights, scene, camera) => {
    if (!TILES.size || !r.shadowMap.enabled) return orig(lights, scene, camera);
    if (!OPT.shadowTiles) { for (const t of TILES) t.src.castShadow = !t.src.userData.usingBaked; return orig(lights, scene, camera); }
    // the one shadow-casting light (the moon); with more than one, or an odd angle, the tiles draw whole
    let n = 0, dl: THREE.DirectionalLight | null = null;
    for (const l of lights) if (l.castShadow) { n++; if ((l as THREE.DirectionalLight).isDirectionalLight) dl = l as THREE.DirectionalLight; }
    let blocks = 6;
    if (n === 1 && dl) {
      L.copy(dl.position).sub(dl.target.position);
      if (L.y > 0.01 && L.z < -0.01) blocks = L.x < -0.01 ? 3 : 4;
    }
    for (const t of TILES) { if (!t.src.parent?.parent) continue; t.src.castShadow = false; t.mesh.visible = !t.src.userData.usingBaked;
      if (t.mesh.visible && dl && dl.position.y > dl.target.position.y && OPT.cameraTiles && t.src.userData.stageTerrain && !t.src.geometry.attributes.aChunk) {
        // A roof outside the view can still cast into it. Test the full projected footprint too.
        box.copy(t.box).applyMatrix4(t.src.matrixWorld);
        offset.copy(dl.target.position).sub(dl.position).multiplyScalar(Math.max(0, box.max.y + 2) / (dl.position.y - dl.target.position.y));
        shadows.copy(box).translate(offset); box.union(shadows).expandByScalar(2);
        t.mesh.visible = frustum.intersectsBox(box);
      }
      t.mesh.geometry.setDrawRange(0, t.ends[blocks - 1]); }
    try { orig(lights, scene, camera); } finally { for (const t of TILES) t.mesh.visible = false; }
  };
}
