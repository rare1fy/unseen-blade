// Character construction kit: a bone hierarchy built from Object3Ds, with body parts collected per (bone, material) and merged so a
// character costs one draw call per bone-material pair. Plus the motion helpers every actor uses: springs, action curves, hit reactions.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { V3 } from '../engine/world';

export type Bone = THREE.Object3D & { rest?: { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3 } };

export class RigBuilder {
  readonly root = new THREE.Group();
  readonly bones: Record<string, Bone> = {};
  private parts = new Map<Bone, Map<THREE.Material, THREE.BufferGeometry[]>>();
  bone(name: string, parent: Bone | THREE.Object3D | null, x = 0, y = 0, z = 0): Bone {
    const b = new THREE.Object3D() as Bone; b.name = name; b.position.set(x, y, z);
    (parent || this.root).add(b); this.bones[name] = b; return b;
  }
  /** Add a part to a bone (geometry in the bone's local space). */
  add(bone: Bone, g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number] = [0, 0, 0], r: [number, number, number] = [0, 0, 0], s: [number, number, number] | number = 1) {
    const geo = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const sc = typeof s === 'number' ? V3(s, s, s) : V3(...s);
    geo.applyMatrix4(new THREE.Matrix4().compose(V3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), sc));
    if (!this.parts.has(bone)) this.parts.set(bone, new Map());
    const byMat = this.parts.get(bone)!; if (!byMat.has(m)) byMat.set(m, []); byMat.get(m)!.push(geo);
  }
  build(o: { shadows?: boolean } = {}) {
    const meshes: THREE.Mesh[] = [];
    for (const [bone, byMat] of this.parts) for (const [m, gs] of byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(gs)!, m); mesh.castShadow = o.shadows ?? true; mesh.receiveShadow = false; bone.add(mesh); meshes.push(mesh);
    }
    for (const b of Object.values(this.bones)) b.rest = { p: b.position.clone(), r: b.rotation.clone(), s: b.scale.clone() };
    this.parts.clear();
    return meshes;
  }
}

/** Reset every bone to its rest pose (call at the start of a pose update, then add offsets). */
export function resetPose(bones: Record<string, Bone>) {
  for (const b of Object.values(bones)) { if (!b.rest) continue; b.position.copy(b.rest.p); b.rotation.copy(b.rest.r); b.scale.copy(b.rest.s); }
}
/** Add Euler offsets to a bone. */
export const rot = (b: Bone | undefined, x = 0, y = 0, z = 0) => { if (!b) return; b.rotation.x += x; b.rotation.y += y; b.rotation.z += z; };
export const mov = (b: Bone | undefined, x = 0, y = 0, z = 0) => { if (!b) return; b.position.x += x; b.position.y += y; b.position.z += z; };

/** Critically damped spring toward a target (scalar). */
export class Spring {
  v = 0; constructor(public x = 0, public k = 120, public d = 18) {}
  step(target: number, dt: number) { const a = (target - this.x) * this.k - this.v * this.d; this.v += a * dt; this.x += this.v * dt; return this.x; }
  kick(v: number) { this.v += v; }
}

/** A timed action: k goes 0 → 1 over dur; curves sample it. `impact` fires once when k crosses `at`. */
export class Action {
  t = 0; fired = false; resolveImpact!: () => void; resolveDone!: () => void;
  readonly impact: Promise<void>; readonly done: Promise<void>;
  constructor(readonly name: string, readonly dur: number, readonly at = 0.5, readonly data: Record<string, unknown> = {}) {
    this.impact = new Promise(r => (this.resolveImpact = r)); this.done = new Promise(r => (this.resolveDone = r));
  }
  get k() { return Math.min(1, this.t / this.dur); }
  step(dt: number) {
    this.t += dt;
    if (!this.fired && this.k >= this.at) { this.fired = true; this.resolveImpact(); }
    if (this.k >= 1) { if (!this.fired) { this.fired = true; this.resolveImpact(); } this.resolveDone(); return false; }
    return true;
  }
  cancel() { if (!this.fired) { this.fired = true; this.resolveImpact(); } this.resolveDone(); }
}

/** Piecewise curve: keys [[k, value], ...] with smoothstep between keys. */
export function curve(k: number, keys: Array<[number, number]>) {
  if (k <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [k1, v1] = keys[i];
    if (k <= k1) { const [k0, v0] = keys[i - 1]; const t = (k - k0) / Math.max(1e-6, k1 - k0), s = t * t * (3 - 2 * t); return v0 + (v1 - v0) * s; }
  }
  return keys[keys.length - 1][1];
}
/** Snappy curve variant: ease-out into each key (fast attack, slow settle). */
export function snap(k: number, keys: Array<[number, number]>) {
  if (k <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [k1, v1] = keys[i];
    if (k <= k1) { const [k0, v0] = keys[i - 1]; const t = (k - k0) / Math.max(1e-6, k1 - k0), s = 1 - Math.pow(1 - t, 3); return v0 + (v1 - v0) * s; }
  }
  return keys[keys.length - 1][1];
}

/** Lathe a smooth profile (radius, height) pairs into a body of revolution. */
export function lathe(profile: Array<[number, number]>, seg = 16) { return new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg); }
/** A tapered limb from (0,0,0) down to (0,-len,0). */
export function limb(r0: number, r1: number, len: number, seg = 10) { const g = new THREE.CylinderGeometry(r0, r1, len, seg, 1); g.translate(0, -len / 2, 0); return g; }
export function ball(r: number, sx = 1, sy = 1, sz = 1, seg = 16) { const g = new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.6 | 0)); g.scale(sx, sy, sz); return g; }
export function capsule(r: number, len: number, seg = 10) { const g = new THREE.CapsuleGeometry(r, len, 4, seg); g.translate(0, -len / 2 - r, 0); return g; }
