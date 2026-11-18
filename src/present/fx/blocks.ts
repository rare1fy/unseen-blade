import { instanceMatrix, instanceColor, finishInstances } from '../engine/uploads';
import { OPT, CAPS } from '../engine/perfOpts';
import { effectLimit, QUALITY } from '../look/quality';
import type { ContactBatch } from '../engine/contactBatch';
// fx5: voxel FX blocks — the solid pieces of skill effects (铁壁 armour wall, ice shell / ice spikes, meteor rock, thrown knife,
// stun stars, rune blocks of a magic circle). Two pooled instanced meshes (additive glow + lit solid), so every block on screen costs
// at most 2 draw calls in total; a block is recycled as soon as its life runs out. Blocks are axis-aligned boxes (art rule: big
// straight masses, no staircase diagonals) unless they are given a spin.
import * as THREE from 'three';
import { scene, V3, C, onUpdate } from '../engine/world';
import { ease } from '../engine/clock';

export interface Blk {
  /** world position (or the orbit centre when `orbit` is set without a host) */
  p: THREE.Vector3; v: THREE.Vector3; size: THREE.Vector3; col: THREE.Color; bright: number;
  life: number; age: number; delay: number; grow: number; shrink: number; grav: number; drag: number;
  q: THREE.Quaternion; w: THREE.Vector3; glow: boolean; dead: boolean;
  /** follow an object: world = host.localToWorld(lp) (+ orbit) */
  host: THREE.Object3D | null; lp: THREE.Vector3;
  orbit: { r: number; w: number; a: number; bob: number } | null;
  /** stays at full size until release() (life is then the fade-out) */
  hold: boolean;
  /** grows along y only (spikes, walls rising from the ground) */
  rise: boolean;
  /** the floor height it bounces / rests on (debris-like blocks); null = no floor */
  floor: number | null; debris: boolean;
}
export interface BlkOpts {
  v?: THREE.Vector3; size?: number | [number, number, number]; col?: THREE.ColorRepresentation; bright?: number; life?: number; delay?: number;
  grow?: number; shrink?: number; grav?: number; drag?: number; spin?: number; glow?: boolean; host?: THREE.Object3D | null; lp?: THREE.Vector3;
  orbit?: { r: number; w: number; a: number; bob?: number }; hold?: boolean; rise?: boolean; floor?: number | null; debris?: boolean; rot?: number;
}

const MAX = 480;
let glowMesh: THREE.InstancedMesh | null = null, solidMesh: THREE.InstancedMesh | null = null;
let debrisMesh: THREE.InstancedMesh | null = null;
const live: Blk[] = [];
const _m = new THREE.Matrix4(), _p = V3(), _s = V3(), _c = new THREE.Color(), _q = new THREE.Quaternion(), _ax = V3(), _zero = V3();

function init() {
  if (glowMesh) return;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const gm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  glowMesh = new THREE.InstancedMesh(geo, gm, MAX); glowMesh.renderOrder = 17;
  const sm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05 });
  solidMesh = new THREE.InstancedMesh(geo, sm, MAX);
  for (const m of [glowMesh, solidMesh]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color(1, 1, 1)); m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.visible = false; scene.add(m);
  }
  onUpdate(dt => update(dt));
}

/** spawn one block at p (world, or local to `host`) */
export function addBlock(p: THREE.Vector3, o: BlkOpts = {}): Blk {
  init();
  const sz = o.size ?? 0.12, size = typeof sz === 'number' ? V3(sz, sz, sz) : V3(sz[0], sz[1], sz[2]);
  const b: Blk = {
    p: p.clone(), v: (o.v ?? _zero).clone(), size, col: C(o.col ?? 0xffffff), bright: o.bright ?? 1, life: o.life ?? 1, age: 0, delay: o.delay ?? 0,
    grow: o.grow ?? 0.12, shrink: o.shrink ?? 0.25, grav: o.grav ?? 0, drag: o.drag ?? 0, q: new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), o.rot ?? 0),
    w: o.spin ? V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(o.spin) : V3(), glow: o.glow ?? true, dead: false,
    host: o.host ?? null, lp: (o.lp ?? V3()).clone(), orbit: o.orbit ? { bob: 0, ...o.orbit } : null, hold: !!o.hold, rise: !!o.rise, floor: o.floor ?? null, debris: !!o.debris,
  };
  // too many: the oldest goes first
  if (live.length >= effectLimit(MAX) * 2) live.shift();
  live.push(b); return b;
}
/** a held block starts its fade-out now (life = the fade time) */
export function release(b: Blk, fade = 0.25) { if (b.dead) return; b.hold = false; b.shrink = fade; b.life = b.age + fade; }
/** burst a block into motion (a shell breaking): it leaves its host and flies with v */
export function fling(b: Blk, v: THREE.Vector3, o: { grav?: number; life?: number; spin?: number; floor?: number } = {}) {
  if (b.dead) return;
  const at = worldOf(b); b.p.copy(at); b.host = null; b.orbit = null; b.hold = false; b.v.copy(v); b.grav = o.grav ?? 14; b.drag = 0.6; b.floor = o.floor ?? 0;
  b.shrink = 0.35; b.life = b.age + (o.life ?? 0.9); b.rise = false;
  const s = o.spin ?? 8; b.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(s);
}
export function worldOf(b: Blk, out = V3()) {
  if (b.host) { out.copy(b.lp); if (b.orbit) { const a = b.orbit.a + b.orbit.w * b.age; out.x += Math.cos(a) * b.orbit.r; out.z += Math.sin(a) * b.orbit.r; out.y += Math.sin(b.age * 5 + b.orbit.a) * b.orbit.bob; } return b.host.localToWorld(out); }
  out.copy(b.p); if (b.orbit) { const a = b.orbit.a + b.orbit.w * b.age; out.x += Math.cos(a) * b.orbit.r; out.z += Math.sin(a) * b.orbit.r; out.y += Math.sin(b.age * 5 + b.orbit.a) * b.orbit.bob; }
  return out;
}
export const blockCount = () => live.length;

function update(dt: number) {
  if (!glowMesh || !solidMesh) return;
  const limit = effectLimit(MAX);
  let ng = 0, ns = 0, nd = 0;
  for (let i = live.length - 1; i >= 0; i--) {
    const b = live[i];
    if (b.delay > 0) { b.delay -= dt; continue; }
    b.age += dt;
    if (!b.hold && b.age >= b.life) { b.dead = true; live.splice(i, 1); continue; }
    if (!b.host && !b.orbit) {
      if (b.grav || b.drag) { b.v.y -= b.grav * dt; b.v.multiplyScalar(Math.exp(-b.drag * dt)); }
      b.p.addScaledVector(b.v, dt);
      if (b.floor != null && b.p.y - b.size.y / 2 < b.floor) { b.p.y = b.floor + b.size.y / 2; if (b.v.y < 0) { b.v.y *= -0.3; b.v.x *= 0.6; b.v.z *= 0.6; b.w.multiplyScalar(0.5); } }
    }
    const wl = b.w.length(); if (wl > 1e-4) { _ax.copy(b.w).divideScalar(wl); _q.setFromAxisAngle(_ax, wl * dt); b.q.premultiply(_q); }
  }
  for (const b of live) {
    if (b.delay > 0) continue;
    const gin = b.grow > 0 ? Math.min(1, b.age / b.grow) : 1, gk = b.rise ? ease.outCubic(gin) : ease.outBack(gin);
    const out = b.hold ? 1 : Math.max(0, Math.min(1, (b.life - b.age) / Math.max(1e-3, b.shrink)));
    worldOf(b, _p);
    if (b.rise) { _s.set(b.size.x * Math.min(1, gin * 3), b.size.y * gk * out, b.size.z * Math.min(1, gin * 3)); _p.y += (_s.y - b.size.y) / 2; }
    else _s.copy(b.size).multiplyScalar(Math.max(0.001, gk * (b.glow ? Math.sqrt(out) : out)));
    _m.compose(_p, b.q, _s);
    if (b.glow) { if (ng >= limit) continue; _c.copy(b.col).multiplyScalar(b.bright * out); instanceMatrix(glowMesh, ng, _m); instanceColor(glowMesh, ng, _c); ng++; }
    else if (b.debris && OPT.bakedShadows && QUALITY.tier === 'mid' && CAPS.instancing) {
      // Only chips of broken scenery enter the shadow map. A spell sharing the solid material remains an effect.
      if (nd >= limit) continue;
      if (!debrisMesh) {
        debrisMesh = new THREE.InstancedMesh(solidMesh.geometry, solidMesh.material, MAX);
        debrisMesh.frustumCulled = false; debrisMesh.castShadow = true;
        debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(debrisMesh);
      }
      _c.copy(b.col).multiplyScalar(b.bright); instanceMatrix(debrisMesh, nd, _m); instanceColor(debrisMesh, nd++, _c);
    } else { if (ns >= limit) continue; _c.copy(b.col).multiplyScalar(b.bright); instanceMatrix(solidMesh, ns, _m); instanceColor(solidMesh, ns, _c); ns++; }
  }
  glowMesh.count = ng; solidMesh.count = ns; glowMesh.visible = ng > 0; solidMesh.visible = ns > 0;
  if (debrisMesh) { debrisMesh.count = nd; debrisMesh.visible = nd > 0; finishInstances(debrisMesh); }
  finishInstances(glowMesh);
  finishInstances(solidMesh);
}

/** Ground contact follows each fragment and expires with the physical block. */
export function debrisContacts(batch: ContactBatch) {
  if (!CAPS.instancing) return;
  for (const b of live) if (b.debris && !b.dead && b.delay <= 0) {
    const radius = Math.max(b.size.x, b.size.z) * Math.min(1, (b.life - b.age) / Math.max(0.001, b.shrink));
    batch.add(b.p.x, b.p.z, radius, radius, (b.floor ?? 0) + 0.005);
  }
}
