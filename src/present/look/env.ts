// 月夜墓园 — the lich's boss arena: a cracked flagstone courtyard, the lich's raised altar with a rune circle and a broken gothic arch,
// rows of leaning graves, an iron fence, dead trees, soul-fire lanterns, distant spires under a huge moon, and drifting ground mist.
// Static props are merged per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { scene, canvasTex, V3 } from '../engine/world';
import { onUpdate } from '../engine/world';
import { clock } from '../engine/clock';
import { toon, glow } from './toon';
import { onLook, voxelProp, voxMat } from './voxel';
import { buildVoxArena } from './voxarena';
import { dressWorld } from '../scenes/dress';
import { GRADE } from './post';
import { CELL } from '../bestiary/kit';
import type { KKAssets } from '../actors/kk';

export const ARENA = { lichAltar: V3(0, 0.55, -4.7), altarR: 2.2 };
const rnd = (() => { let a = 1337; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
const rr = (a: number, b: number) => a + rnd() * (b - a);

// ---------------------------------------------------------------- batches: geometry collected per material, merged once
class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(g: THREE.BufferGeometry, m: THREE.Material, pos?: THREE.Vector3, rot?: THREE.Euler, scale?: THREE.Vector3 | number) {
    const geo = (g.index ? g.toNonIndexed() : g.clone());
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const mx = new THREE.Matrix4().compose(pos || V3(), new THREE.Quaternion().setFromEuler(rot || new THREE.Euler()), typeof scale === 'number' ? V3(scale, scale, scale) : scale || V3(1, 1, 1));
    geo.applyMatrix4(mx);
    if (!this.parts.has(m)) this.parts.set(m, []); this.parts.get(m)!.push(geo);
  }
  build(parent: THREE.Object3D, o: { cast?: boolean; receive?: boolean } = {}) {
    for (const [m, gs] of this.parts) { const mesh = new THREE.Mesh(mergeGeometries(gs)!, m); mesh.castShadow = o.cast ?? true; mesh.receiveShadow = o.receive ?? true; parent.add(mesh); }
    this.parts.clear();
  }
}

// ---------------------------------------------------------------- textures
function flagstoneTex() {
  const S = 512, t = canvasTex(S, S, g => {
    g.fillStyle = '#2b2a33'; g.fillRect(0, 0, S, S);
    const N = 6, c = S / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const off = y % 2 ? c * 0.5 : 0, X = (x * c + off) % S, v = 70 + rnd() * 40, tint = rnd();
      g.fillStyle = `rgb(${v * (0.92 + tint * 0.1)},${v * 0.95},${v * 1.08})`;
      g.fillRect(X + 3, y * c + 3, c - 6, c - 6); if (X + c > S) g.fillRect(X - S + 3, y * c + 3, c - 6, c - 6);
      for (let i = 0; i < 30; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)'; g.fillRect(X + rnd() * c, y * c + rnd() * c, 3 + rnd() * 10, 2 + rnd() * 6); }
      if (rnd() < 0.35) { g.strokeStyle = 'rgba(10,8,14,0.6)'; g.lineWidth = 2; g.beginPath(); let px = X + rnd() * c, py = y * c + rnd() * c; g.moveTo(px, py); for (let k = 0; k < 4; k++) { px += rr(-25, 25); py += rr(-25, 25); g.lineTo(px, py); } g.stroke(); }
      if (rnd() < 0.3) { g.fillStyle = 'rgba(60,90,60,0.35)'; for (let k = 0; k < 14; k++) g.fillRect(X + rnd() * c, y * c + (rnd() < 0.5 ? 2 : c - 8), 6, 6); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}
/** dark earth and moss as one texel per block, nearest-filtered, so the ground beyond the courtyard reads as voxels too */
function blockEarthTex() {
  const S = 64, cols = ['#2c2628', '#302a2c', '#2a2426', '#2e3a2a', '#34402c', '#3a3640'], t = canvasTex(S, S, g => {
    // calm patches of 8x8 blocks, not per-block noise
    for (let y = 0; y < S; y += 8) for (let x = 0; x < S; x += 8) { const r = rnd(); g.fillStyle = cols[r < 0.55 ? 0 : r < 0.75 ? 1 : r < 0.9 ? 3 : 4]; g.fillRect(x, y, 8, 8); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}
function earthTex() {
  const S = 256, t = canvasTex(S, S, g => {
    g.fillStyle = '#1e1c22'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) { const v = rnd(); g.fillStyle = v < 0.4 ? 'rgba(40,55,40,0.5)' : v < 0.7 ? 'rgba(0,0,0,0.25)' : 'rgba(90,80,100,0.18)'; g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 5, 2 + rnd() * 5); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
export function runeTex() {
  return canvasTex(512, 512, g => {
    g.translate(256, 256); g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff';
    const ring = (r: number, w: number) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
    ring(240, 6); ring(222, 3); ring(150, 4); ring(70, 3);
    for (let i = 0; i < 24; i++) { g.save(); g.rotate((i / 24) * Math.PI * 2); g.fillRect(-3, -222, 6, 22); g.font = 'bold 22px serif'; g.fillText('ᚱᛟᚾᛁᚷᚦᛗᛞᚹᛉ'[i % 10], -8, -168); g.restore(); }
    g.lineWidth = 3; g.beginPath(); for (let i = 0; i <= 5; i++) { const a = (i * 2 * (Math.PI * 2)) / 5 - Math.PI / 2; const x = Math.cos(a) * 150, y = Math.sin(a) * 150; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
  });
}
export function noiseTex() {
  const S = 128, val = new Float32Array(S * S), data = new Uint8Array(S * S * 4);
  for (let o = 0; o < 4; o++) {
    const f = 4 << o, amp = 1 / (o + 1); const grid: number[] = []; for (let i = 0; i < (f + 1) * (f + 1); i++) grid.push(rnd());
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const gx = (x / S) * f, gy = (y / S) * f, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const v = (a: number, b: number) => grid[((b % f) * (f + 1)) + (a % f)];
      val[y * S + x] += amp * ((v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy);
    }
  }
  for (let i = 0; i < S * S; i++) {
    const a = Math.max(0, Math.min(1, (val[i] / 2.08 - 0.42) * 2.4));
    data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255; data[i * 4 + 3] = Math.round(a * 255);
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- sky: gradient dome, stars, moon with halo, cloud band
export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uTop: { value: new THREE.Color(0x0a0a1e) }, uMid: { value: new THREE.Color(0x26204a) }, uHor: { value: new THREE.Color(0x5a4a78) }, uMoonDir: { value: V3(-0.25, 0.42, -1).normalize() }, uMoonCol: { value: new THREE.Color(1.2, 1.15, 1.3) }, uTint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uTop, uMid, uHor, uMoonDir, uMoonCol, uTint; varying vec3 vDir;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main(){ vec3 d = normalize(vDir); float y = d.y;
        vec3 c = mix(uHor, uMid, smoothstep(-0.05, 0.25, y)); c = mix(c, uTop, smoothstep(0.25, 0.8, y));
        vec3 g = floor(d * 220.0); float s = h(g); float star = step(0.9965, s) * smoothstep(0.0, 0.3, y) * (0.6 + 0.4 * sin(uTime * 2.0 + s * 50.0));
        c += vec3(star) * 1.4;
        float m = dot(d, uMoonDir); c += uMoonCol * smoothstep(0.9985, 0.9992, m) * 2.4; c += uMoonCol * 0.35 * pow(max(m, 0.0), 120.0) + uMoonCol * 0.12 * pow(max(m, 0.0), 12.0);
        float band = smoothstep(0.02, 0.12, y) * (1.0 - smoothstep(0.12, 0.3, y)); c = mix(c, uHor * 0.6, band * 0.35);
        gl_FragColor = vec4(c * uTint, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), mat); sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  onUpdate((_dt, rdt) => { mat.uniforms.uTime.value += rdt; });
  return mat;
}

// ---------------------------------------------------------------- props
function tombstone(b: Batch, m: THREE.Material, p: THREE.Vector3, rotY: number, lean: number, s = 1) {
  const kind = rnd();
  const rot = new THREE.Euler(lean * rr(-1, 1), rotY, lean * rr(-1, 1));
  if (kind < 0.45) { b.add(new THREE.BoxGeometry(0.8, 0.9, 0.18), m, p.clone().add(V3(0, 0.45 * s, 0)), rot, s); b.add(new THREE.CylinderGeometry(0.4, 0.4, 0.18, 12, 1, false, 0, Math.PI), m, p.clone().add(V3(0, 0.9 * s, 0)), new THREE.Euler(rot.x + Math.PI / 2, rot.y, rot.z + Math.PI / 2), s); }
  else if (kind < 0.75) { b.add(new THREE.BoxGeometry(0.16, 1.3, 0.16), m, p.clone().add(V3(0, 0.65 * s, 0)), rot, s); b.add(new THREE.BoxGeometry(0.7, 0.16, 0.16), m, p.clone().add(V3(0, 0.95 * s, 0)), rot, s); }
  else { b.add(new THREE.BoxGeometry(0.6, 0.6, 0.3), m, p.clone().add(V3(0, 0.3 * s, 0)), rot, s); b.add(new THREE.ConeGeometry(0.38, 0.5, 4), m, p.clone().add(V3(0, 0.85 * s, 0)), new THREE.Euler(rot.x, rot.y + Math.PI / 4, rot.z), s); }
  b.add(new THREE.BoxGeometry(1.0, 0.12, 0.5), m, p.clone().add(V3(0, 0.04, 0.05)), new THREE.Euler(0, rotY, 0), s);
}
function deadTree(b: Batch, m: THREE.Material, base: THREE.Vector3, h: number) {
  const branch = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, len), mid = from.clone().lerp(to, 0.5);
    const g = new THREE.CylinderGeometry(r * 0.62, r, len, 6); const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
    b.add(g, m, mid, new THREE.Euler().setFromQuaternion(q));
    if (depth <= 0 || r < 0.03) return;
    const n = depth > 2 ? 2 : rnd() < 0.5 ? 2 : 3;
    for (let i = 0; i < n; i++) { const d = dir.clone().add(V3(rr(-0.9, 0.9), rr(-0.1, 0.5), rr(-0.9, 0.9))).normalize(); branch(to, d, len * rr(0.55, 0.78), r * 0.62, depth - 1); }
  };
  branch(base, V3(rr(-0.15, 0.15), 1, rr(-0.15, 0.15)).normalize(), h * 0.42, 0.22, 4);
}

// ---------------------------------------------------------------- KayKit set dressing (Halloween Bits + Forest, CC0)
const ALTAR_VOX = 0.11, ALTAR_VOX_TOP = Math.ceil(0.55 / ALTAR_VOX + 1e-6) * ALTAR_VOX;
type Place = [key: string, x: number, z: number, rotY?: number, s?: number, y?: number];
function kayKitSet(root: THREE.Object3D, kk: KKAssets, lanternAt: THREE.Vector3[], altar: THREE.Object3D, trim: THREE.Object3D) {
  const S = 0.9, A = ARENA.lichAltar, P: Place[] = [];
  // the lich's mausoleum, framed by the arch behind the altar, and shrines either side
  P.push(['crypt', 0, -14.2, 0, 1.0], ['arch_gate', 0, -7.6, 0, 1.3], ['shrine_candles', -4.2, -7.9, 0.3, 1], ['shrine_candles', 4.2, -7.9, -0.3, 1]);
  // back fence with pillars, a broken run on the right
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) { const x = sx * (4.6 + i * 3.6); P.push([(i + (sx > 0 ? 1 : 0)) % 3 === 2 ? 'fence_broken' : 'fence', x, -10.4, 0, S]); P.push([i === 1 && sx > 0 ? 'fence_pillar_broken' : 'fence_pillar', x + sx * 1.8, -10.4, 0, S]); }
  P.push(['fence_pillar', -2.8, -10.4, 0, S], ['fence_pillar', 2.8, -10.4, 0, S]);
  // graves in rough rows on both flanks, leaning a little
  const graves = ['gravestone', 'grave_A', 'gravemarker_A', 'grave_B', 'gravemarker_B', 'grave_A_destroyed', 'gravestone', 'gravemarker_A'];
  let gi = 0;
  for (let row = 0; row < 5; row++) for (let k = 0; k < 2; k++) for (const sx of [-1, 1]) {
    const x = sx * (7.4 + k * 2.3 + rr(-0.3, 0.3) + (row % 2) * 0.6), z = -8.4 + row * 3.0 + rr(-0.4, 0.4);
    P.push([graves[gi++ % graves.length], x, z, rr(-0.25, 0.25) + sx * 0.15, S * rr(0.85, 1.05)]);
  }
  P.push(['grave_A', -5.4, -8.6, 0.2, 0.8], ['gravemarker_B', 5.8, -8.2, -0.3, 0.9], ['grave_A_destroyed', 6.6, 5.2, -0.4, 0.8], ['coffin_decorated', -8.6, 6.4, 0.5, 0.7]);
  // dead trees at the corners, rocks and dry bushes along the courtyard rim
  P.push(['tree_dead_large_decorated', -8.6, -3.2, 0.4, 1.25], ['tree_dead_large', 9.4, -7.6, 2.2, 1.35], ['tree_dead_medium', -10.6, 4.4, 1, 1.3], ['tree_dead_large', 11.2, 2.2, -0.8, 1.2], ['tree_dead_small', -6.9, -9.2, 0, 1.1], ['Tree_Bare_2_B', 13.5, -12, 0, 1.3], ['Tree_Bare_2_B', -13, -12.5, 2, 1.2]);
  P.push(['Rock_1_J', -15, -9, 0.4, 0.8], ['Rock_1_D', -6.6, 2.6, 0.2, 1.1], ['Rock_1_D', 6.8, -1.2, 2, 0.9], ['Rock_2_B', 6.4, 4.2, 1, 1.2], ['Rock_3_C', -6.7, -5.2, 0, 1.2], ['Rock_1_A', 7.6, 6.2, 0, 1.4], ['Rock_1_A', -7.4, 5.8, 1, 1.1]);
  for (const [x, z] of [[-6.4, -1.2], [6.6, 1.8], [-6.2, 4.8], [6.2, -4.6], [-3.2, -7.0], [3.4, -6.8]]) P.push([rnd() < 0.5 ? 'Grass_1_A' : 'Grass_2_B', x, z, rr(0, 6), rr(0.7, 1)]);
  // bones of the lich's past challengers, candles on the altar's back rim, lantern stands
  P.push(['skull', -3.0, -4.2, 0.6, 0.45], ['ribcage', 2.9, -5.6, 1.4, 0.55], ['bone_C', 3.3, -3.9, 0.3, 0.6], ['bone_A', -2.8, -5.8, 2.2, 0.6], ['bone_B', -4.6, 3.2, 1, 0.6], ['skull', 4.8, 4.6, -0.8, 0.4], ['bone_A', 3.6, 4.6, 0.3, 0.6]);
  for (let i = 0; i < 7; i++) { const a = Math.PI * (0.62 + i * 0.125), r = ARENA.altarR - 0.35; P.push([['candle_triple', 'candle_melted', 'skull_candle', 'candle'][i % 4], A.x + Math.cos(a) * r, A.z - Math.sin(a) * r, rr(0, 6), i % 4 === 2 ? 0.4 : 0.55, 0.55]); }
  for (const p of lanternAt) P.push(['fence_pillar_broken', p.x, p.z, 0, 0.9], ['lantern_standing', p.x, p.z, 0, 0.9, 1.35]);

  // smooth: every placement baked into one mesh (one draw call); voxel: each prop voxelised once in its own space, then baked
  const smoothParts: THREE.BufferGeometry[] = [], voxParts: THREE.BufferGeometry[] = [], voxCache = new Map<string, THREE.BufferGeometry | null>();
  for (const [key, x, z, ry = 0, sc = 1, y = 0] of P) {
    const src = kk.props.get(key); if (!src) continue;
    const mx = new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V3(sc, sc, sc));
    src.updateMatrixWorld(true);
    src.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; smoothParts.push(flatColors(m.geometry, new THREE.Matrix4().multiplyMatrices(mx, m.matrixWorld))); });
    if (!voxCache.has(key)) { const bb = new THREE.Box3().setFromObject(src), dim = Math.max(...bb.getSize(V3()).toArray()); voxCache.set(key, voxelProp(src, Math.max(0.075, dim / 38))?.geo ?? null); }
    const vg = voxCache.get(key); if (vg) voxParts.push(flatColors(vg, mx));
  }
  const smooth = new THREE.Mesh(mergeGeometries(smoothParts)!, toon(0xffffff, { vertexColors: true, rim: 0.5 }));
  const vox = new THREE.Mesh(mergeGeometries(voxParts)!, voxMat(0.5));
  for (const m of [smooth, vox]) { m.castShadow = m.receiveShadow = true; root.add(m); }
  // the procedural altar gets a voxel twin too
  const av = voxelProp(altar, ALTAR_VOX), altarVox = av ? new THREE.Mesh(av.geo, voxMat(0.5)) : null;
  if (altarVox) { altarVox.castShadow = altarVox.receiveShadow = true; root.add(altarVox); }
  onLook(v => { smooth.visible = !v; vox.visible = v; altar.visible = !v; trim.visible = !v; if (altarVox) altarVox.visible = v; });
}
/** a geometry with position / normal / float rgb colour only, transformed (so everything merges into one buffer) */
function flatColors(g: THREE.BufferGeometry, mx: THREE.Matrix4) {
  const o = new THREE.BufferGeometry(), pos = g.attributes.position, n = pos.count, col = g.attributes.color, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = col ? col.getX(i) : 1; c[i * 3 + 1] = col ? col.getY(i) : 1; c[i * 3 + 2] = col ? col.getZ(i) : 1; }
  o.setAttribute('position', pos.clone()); if (g.attributes.normal) o.setAttribute('normal', g.attributes.normal.clone()); o.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  o.setIndex(new THREE.Uint32BufferAttribute(g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : Uint32Array.from({ length: n }, (_, i) => i), 1));
  o.applyMatrix4(mx); if (!g.attributes.normal) o.computeVertexNormals();
  return o;
}

export interface Env { root: THREE.Group; sky: THREE.ShaderMaterial; rune: THREE.Mesh; runeMat: THREE.MeshBasicMaterial; soulLights: THREE.PointLight[]; flames: THREE.Mesh[]; mist: THREE.Mesh[]; moon: THREE.DirectionalLight; hemi: THREE.HemisphereLight; warm: THREE.PointLight; phase2(k: number): void }

export function buildEnv(kk?: KKAssets | null, opt: { voxel?: boolean } = {}): Env {
  const vox = !!opt.voxel && !kk;
  scene.background = new THREE.Color(0x0e0c1c);
  scene.fog = new THREE.FogExp2(0x1a1630, 0.028);
  const sky = buildSky();
  const root = new THREE.Group(); scene.add(root);
  // lights
  const hemi = new THREE.HemisphereLight(0x5a6098, 0x1a1418, 0.95); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xb8c4ff, 2.6); moon.position.set(-6, 14, -10); moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -10, right: 10, top: 12, bottom: -10, near: 1, far: 40 }); moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.02;
  scene.add(moon); scene.add(moon.target); moon.target.position.set(0, 0, 0);
  const key = new THREE.DirectionalLight(0xffd2a8, 0.9); key.position.set(5, 8, 10); scene.add(key);   // warm front key for readability
  const warm = new THREE.PointLight(0xff9a50, 6, 8, 1.8); warm.position.set(-3.4, 2.6, 6.2); scene.add(warm);

  // ground: flagstone courtyard + dark earth beyond
  if (!vox) {
    const court = new THREE.Mesh(new THREE.PlaneGeometry(13, 17), toon(0xffffff, { map: (() => { const t = flagstoneTex(); t.repeat.set(3.2, 4.2); return t; })() }));
    court.rotation.x = -Math.PI / 2; court.position.set(0, 0.002, -0.6); court.receiveShadow = true; root.add(court);
  }
  const earthT = vox ? blockEarthTex() : earthTex(); earthT.repeat.set(vox ? 120 / (64 * CELL) : 16, vox ? 120 / (64 * CELL) : 16);
  const earth = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), toon(0xffffff, { map: earthT })); earth.rotation.x = -Math.PI / 2; earth.position.y = vox ? -2 * CELL : 0; earth.receiveShadow = true; root.add(earth);

  const stone = toon(0x6a6c80), stoneD = toon(0x4a4a5c), stoneL = toon(0x8a8ca0), bark = toon(0x3a3036), iron = toon(0x26242c), gold = toon(0xc8a050, { emissive: 0x3a2400 });
  const B = new Batch(), AB = new Batch();
  // courtyard rim: low broken wall segments
  if (!kk && !vox) for (let i = 0; i < 14; i++) { const side = i < 7 ? -1 : 1, z = -8 + (i % 7) * 2.4 + rr(-0.3, 0.3), h = rr(0.3, 0.9); B.add(new THREE.BoxGeometry(0.6, h, rr(1.4, 2.2)), stoneD, V3(side * 6.8 + rr(-0.2, 0.2), h / 2, z), new THREE.Euler(0, rr(-0.1, 0.1), 0)); }
  // the lich's altar: stepped round dais
  const A = ARENA.lichAltar;
  if (!vox) AB.add(new THREE.CylinderGeometry(ARENA.altarR, ARENA.altarR + 0.25, 0.55, 28), stone, V3(A.x, 0.275, A.z));
  if (!vox) AB.add(new THREE.CylinderGeometry(ARENA.altarR + 0.55, ARENA.altarR + 0.75, 0.22, 28), stoneD, V3(A.x, 0.11, A.z));
  if (!vox) for (let i = 0; i < 3; i++) AB.add(new THREE.BoxGeometry(2.6 - i * 0.3, 0.18, 0.5), stoneL, V3(A.x, 0.09 + i * 0.18, A.z + ARENA.altarR + 0.85 - i * 0.42));
  // broken gothic arch behind the altar
  if (!kk && !vox) for (const sx of [-1, 1]) {
    const x = A.x + sx * 2.6, z = A.z - 2.2;
    B.add(new THREE.BoxGeometry(1.0, 0.5, 1.0), stoneD, V3(x, 0.25, z));
    B.add(new THREE.CylinderGeometry(0.38, 0.42, sx < 0 ? 6.2 : 4.4, 10), stone, V3(x, (sx < 0 ? 6.2 : 4.4) / 2 + 0.5, z));
    B.add(new THREE.BoxGeometry(0.95, 0.4, 0.95), stoneL, V3(x, (sx < 0 ? 6.2 : 4.4) + 0.7, z));
  }
  if (!kk && !vox) {
  B.add(new THREE.TorusGeometry(2.6, 0.36, 8, 18, Math.PI * 0.62), stone, V3(A.x, 6.9, A.z - 2.2), new THREE.Euler(0, 0, Math.PI * 0.38));
  // fallen pillar chunks
  B.add(new THREE.CylinderGeometry(0.4, 0.4, 1.6, 10), stoneL, V3(3.9, 0.4, -5.6), new THREE.Euler(Math.PI / 2, 0.6, 0));
  B.add(new THREE.CylinderGeometry(0.4, 0.4, 1.0, 10), stone, V3(4.6, 0.4, -4.4), new THREE.Euler(Math.PI / 2, -0.3, 0.1));
  // graves left and right, in rough rows, leaning
  for (let row = 0; row < 4; row++) for (let k = 0; k < 3; k++) for (const side of [-1, 1]) {
    const x = side * (7.8 + k * 1.6 + rr(-0.3, 0.3)), z = -7 + row * 3.3 + rr(-0.5, 0.5);
    tombstone(B, rnd() < 0.5 ? stone : stoneD, V3(x, 0, z), rr(-0.3, 0.3) + (side < 0 ? 0.2 : -0.2), rnd() < 0.4 ? 0.25 : 0.06, rr(0.85, 1.25));
  }
  for (let i = 0; i < 10; i++) tombstone(B, stoneD, V3(rr(-14, 14), 0, rr(-18, -10)), rr(-0.4, 0.4), 0.15, rr(1, 1.5));
  // iron fence along the back
  for (let i = -9; i <= 9; i++) { if (Math.abs(i) < 3) continue; const x = i * 0.9, z = -10.2; B.add(new THREE.BoxGeometry(0.06, 1.8, 0.06), iron, V3(x, 0.9, z)); B.add(new THREE.ConeGeometry(0.08, 0.22, 4), iron, V3(x, 1.9, z)); }
  B.add(new THREE.BoxGeometry(5.5, 0.06, 0.06), iron, V3(-5.4, 1.5, -10.2)); B.add(new THREE.BoxGeometry(5.5, 0.06, 0.06), iron, V3(5.4, 1.5, -10.2));
  B.add(new THREE.BoxGeometry(5.5, 0.06, 0.06), iron, V3(-5.4, 0.4, -10.2)); B.add(new THREE.BoxGeometry(5.5, 0.06, 0.06), iron, V3(5.4, 0.4, -10.2));
  // dead trees
  for (const [x, z, h] of [[-8.5, -3, 6.5], [9.2, -8.5, 7.5], [-10.5, 4.5, 5.5], [11, 2.5, 6]] as const) deadTree(B, bark, V3(x, 0, z), h);
  }
  // distant spires / hills (silhouettes in the fog)
  const far = toon(0x1c1a2c, { rim: 0.4 });
  for (const [x, z, w, h] of [[-26, -45, 6, 16], [-18, -50, 4, 24], [-12, -48, 5, 13], [16, -46, 7, 18], [24, -52, 5, 26], [32, -44, 8, 12]] as const) { B.add(new THREE.BoxGeometry(w, h, w), far, V3(x, h / 2, z)); if (vox) for (let k = 0; k < 4; k++) B.add(new THREE.BoxGeometry(w * (0.8 - k * 0.2), h * 0.12, w * (0.8 - k * 0.2)), far, V3(x, h + h * 0.06 + k * h * 0.12, z)); else B.add(new THREE.ConeGeometry(w * 0.6, h * 0.45, 4), far, V3(x, h + h * 0.22, z), new THREE.Euler(0, Math.PI / 4, 0)); }
  for (let i = 0; i < 9; i++) { const r = rr(10, 18), x = -60 + i * 15, z = rr(-70, -55); if (vox) for (let k = 0; k < 4; k++) B.add(new THREE.BoxGeometry(r * 3.2 * (1 - k * 0.22), r * 0.14, r * 2 * (1 - k * 0.22)), far, V3(x, -2 + r * 0.07 + k * r * 0.14, z)); else B.add(new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), far, V3(x, -2, z), undefined, V3(1.6, 0.45, 1)); }
  B.build(root);
  const altar = new THREE.Group(); root.add(altar); AB.build(altar);

  // gold trim of the altar, lanterns on posts with soul fire
  const G2 = new Batch();
  if (!vox) G2.add(new THREE.TorusGeometry(ARENA.altarR + 0.02, 0.05, 6, 40), gold, V3(A.x, 0.56, A.z), new THREE.Euler(Math.PI / 2, 0, 0));
  const lanternAt = kk || vox ? [V3(-4.4, 0, -3.4), V3(4.4, 0, -3.4), V3(-5.6, 0, 1.5), V3(5.6, 0, 1.5)] : [V3(-3.2, 0, -3.0), V3(3.2, 0, -3.0), V3(-5.6, 0, 1.5), V3(5.6, 0, 1.5)];
  const flameY = kk ? 1.86 : 2.46;
  if (!kk && !vox) for (const p of lanternAt) { G2.add(new THREE.BoxGeometry(0.14, 2.2, 0.14), iron, p.clone().add(V3(0, 1.1, 0))); G2.add(new THREE.BoxGeometry(0.42, 0.06, 0.42), iron, p.clone().add(V3(0, 2.25, 0))); G2.add(new THREE.ConeGeometry(0.32, 0.3, 4), iron, p.clone().add(V3(0, 2.75, 0)), new THREE.Euler(0, Math.PI / 4, 0)); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) G2.add(new THREE.BoxGeometry(0.04, 0.4, 0.04), iron, p.clone().add(V3(dx * 0.17, 2.45, dz * 0.17))); }
  const trim = new THREE.Group(); root.add(trim); G2.build(trim, { cast: true });
  if (kk) kayKitSet(root, kk, lanternAt, altar, trim);
  const va = vox ? buildVoxArena({ altar: A, altarR: ARENA.altarR, lanterns: lanternAt }) : null;
  if (va) for (const m of va.meshes) root.add(m);
  if (va) { GRADE.exposure = 1.6; GRADE.vig = 0.32; }   // same lift as the chapter stages
  if (va) dressWorld(root, va.world, 'grave', { seed: 11, clear: [{ x0: -2.6, z0: -7.2, x1: 2.6, z1: -2.2 }], shafts: [[-6.6, -7.6, 0.3, 0.32, 1.8], [6.8, -8.6, -0.3, 0.3, 1.4]] });
  const flames: THREE.Mesh[] = [], soulLights: THREE.PointLight[] = [];
  const flameMat = glow(0x5affb0, 3.2);
  for (const [i, p] of lanternAt.entries()) {
    const f = new THREE.Mesh(va ? new THREE.BoxGeometry(CELL * 2, CELL * 2, CELL * 2) : new THREE.OctahedronGeometry(kk ? 0.11 : 0.14, 1), flameMat);
    if (va) f.position.copy(va.flames[i]).add(V3(0, CELL * 1.5, 0)); else f.position.copy(p).add(V3(0, flameY, 0)); root.add(f); flames.push(f);
    if (i < 2) { const l = new THREE.PointLight(0x4affa0, 5, 6, 1.8); l.position.copy(f.position); scene.add(l); soulLights.push(l); }
  }
  // rune circle on the altar
  const runeMat = new THREE.MeshBasicMaterial({ map: runeTex(), color: new THREE.Color(0.35, 1.6, 0.9), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.altarR * 2, ARENA.altarR * 2), runeMat); rune.rotation.x = -Math.PI / 2; rune.position.set(A.x, va ? va.altarTop + 0.006 : 0.565, A.z); root.add(rune);
  if (kk) onLook(v => { rune.position.y = v ? ALTAR_VOX_TOP + 0.015 : 0.565; });
  // ground mist: drifting noise layers
  const nt = noiseTex(), mist: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.MeshBasicMaterial({ map: nt.clone(), color: new THREE.Color(0.32, 0.34, 0.55), transparent: true, opacity: 0.07 + i * 0.015, depthWrite: false, fog: true });
    (m.map as THREE.Texture).wrapS = (m.map as THREE.Texture).wrapT = THREE.RepeatWrapping; (m.map as THREE.Texture).repeat.set(2 + i, 2 + i); (m.map as THREE.Texture).needsUpdate = true;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), m); p.rotation.x = -Math.PI / 2; p.position.y = 0.18 + i * 0.22; p.renderOrder = 3; root.add(p); mist.push(p);
  }
  onUpdate((dt, rdt) => {
    const t = clock.rtime;
    mist.forEach((p, i) => { const map = (p.material as THREE.MeshBasicMaterial).map!; map.offset.x += rdt * (0.006 + i * 0.003); map.offset.y += rdt * 0.003 * (i % 2 ? 1 : -1); });
    flames.forEach((f, i) => { const s = 1 + Math.sin(t * 9 + i * 2) * 0.15 + Math.sin(t * 23 + i) * 0.08; f.scale.set(s, s * 1.3, s); f.rotation.y += dt * 2; });
    soulLights.forEach((l, i) => { l.intensity = 5 + Math.sin(t * 8 + i * 3) * 0.9 + Math.sin(t * 19 + i) * 0.5; });
    runeMat.opacity = 0.45 + Math.sin(t * 1.6) * 0.12; rune.rotation.z += rdt * 0.08;
  });
  return {
    root, sky, rune, runeMat, soulLights, flames, mist, moon, hemi, warm,
    phase2(k: number) {   // the lich's second phase: sickly green sky, thicker fog, brighter runes
      (sky.uniforms.uTint.value as THREE.Color).setRGB(1 - 0.25 * k, 1 + 0.15 * k, 1 - 0.2 * k);
      (scene.fog as THREE.FogExp2).density = 0.028 + 0.012 * k; (scene.fog as THREE.FogExp2).color.setRGB(0.1 - 0.02 * k, 0.086 + 0.05 * k, 0.19 - 0.06 * k);
      runeMat.color.setRGB(0.35 + 0.4 * k, 1.6 + 1.2 * k, 0.9); hemi.color.setRGB(0.42 - 0.1 * k, 0.44 + 0.12 * k, 0.72 - 0.25 * k);
    },
  };
}
