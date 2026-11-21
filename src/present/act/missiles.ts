// The hero's two things that fly (act-13, 用户：「升级的那个剑气我觉得应该是发射一个很干脆的刀光出去，现在像发射了一个子弹出去」
// 「影分身……可以改成丢飞镖的普攻」):
//  · Dart — a 柳叶镖: a slim steel leaf with a ring and a red tassel, thrown from the left hand, flying straight with a thin white
//    streak; small damage, no stagger.
//  · BladeWave — the 刀芒 秘传's sword light: a thin bright crescent (white core, pale jade glow), lying flat at waist height with its
//    bulge forward, fast and straight; ghost copies peel off behind it, it thins out and fades at the end of its run.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { V3, scene } from '../engine/world';
import { toon } from '../look/toon';
import { trailSeg, fxSparks } from '../fx/fx';
import { addBlock } from '../fx/blocks';

// ------------------------------------------------------------------ the dart
const box = (w: number, h: number, d: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(0, 0, z);
/** the steel: a leaf blade (narrow tip, a wider belly, a neck) and the ring at the back — axis-aligned blocks, forward = +z */
const dartGeo = mergeGeometries([box(0.05, 0.03, 0.12, 0.22), box(0.09, 0.03, 0.16, 0.09), box(0.05, 0.03, 0.1, -0.03), box(0.08, 0.06, 0.04, -0.1)])!;
const tasselGeo = new THREE.BoxGeometry(0.08, 0.08, 0.16).translate(0, 0, -0.08);
const steelMat = toon(0xdde3ec), tasselMat = toon(0xc0302a);
/** stuck in a foe: the steel glows indigo (追影 can follow it), a small indigo ring pulses at the foe's feet */
const markMat = (() => { const m = new THREE.MeshBasicMaterial({ color: 0x8a96ff, toneMapped: false }); m.color.multiplyScalar(1.6); return m; })();
const ringGeo = new THREE.RingGeometry(0.62, 0.74, 32).rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x7a86ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

export class Dart {
  g = new THREE.Group(); dead = false; life: number; private tassel = new THREE.Mesh(tasselGeo, tasselMat); private t = Math.random() * 6;
  private blade!: THREE.Mesh; private ring: THREE.Mesh | null = null; private off = new THREE.Vector3();
  /** the foe it is stuck in (追影 follows it) and for how long */
  stuck: { pos: THREE.Vector3; d: { r: number } } | null = null; stuckT = 0;
  /** 11-17: the link volley it belongs to (迎面镖 / 回身镖; 0 = a plain throw) — the volley's first strike fills 气 */
  link = 0;
  /** 11-18 秘传 折返: > 0 = it comes back (the way home strikes for this share); on the way home; the foes it has gone through (each once
   *  each way: cleared when it turns) */
  back = 0; returning = false; readonly passed = new Set<number>();
  /** turn round at the end of its run: a glint, a little whirr, then it flies home (show.ts steers it with homeTo) */
  turnBack() {
    if (this.returning) return; this.returning = true; this.passed.clear(); this.life = 2;
    fxSparks(this.p.clone(), 0xe8f0ff, 6, 2.5); this.v.multiplyScalar(-0.3);
  }
  /** fly at `to` (her hand, moving) at `speed`, turning hard — a homing curve, never a straight snap (call before step) */
  homeTo(to: THREE.Vector3, speed: number, dt: number) {
    const want = to.clone().sub(this.p).normalize().multiplyScalar(speed);
    this.v.lerp(want, 1 - Math.exp(-14 * dt)); this.g.lookAt(this.p.clone().add(this.v));
  }
  constructor(public p: THREE.Vector3, public v: THREE.Vector3, public dmg: number, range: number) {
    const blade = this.blade = new THREE.Mesh(dartGeo, steelMat); this.tassel.position.z = -0.12; this.g.add(blade, this.tassel);
    this.g.scale.setScalar(1.25); this.g.position.copy(p); this.g.lookAt(p.clone().add(v)); scene.add(this.g);
    this.life = range / Math.max(1, v.length());
  }
  /** fly one step; returns the start of the step (the hit test sweeps from there) */
  step(dt: number) {
    const p0 = this.p.clone(); this.p.addScaledVector(this.v, dt); this.life -= dt; this.t += dt;
    this.g.position.copy(this.p);
    // the tassel streams behind and flicks side to side
    this.tassel.rotation.y = Math.sin(this.t * 40) * 0.35; this.tassel.rotation.x = Math.sin(this.t * 31) * 0.2;
    trailSeg(p0, this.p.clone(), 0xeef4ff, 0.05, { life: 0.12, bright: 1.8, spark: 0 });
    return p0;
  }
  /** struck a foe: the dart stays in it (glowing indigo, a ring at its feet) for `life` seconds — the 追影 mark */
  stickIn(foe: { pos: THREE.Vector3; d: { r: number } }, life: number) {
    this.stuck = foe; this.stuckT = 0; this.life = life; this.v.set(0, 0, 0);
    this.off.copy(this.p).sub(foe.pos); this.off.setY(Math.min(1.5, Math.max(0.8, this.off.y)));
    this.off.x *= 0.6; this.off.z *= 0.6;   // pulled in onto the body
    this.blade.material = markMat; fxSparks(this.p.clone(), 0xb8c0ff, 8, 3);
    this.ring = new THREE.Mesh(ringGeo, ringMat.clone()); this.ring.scale.setScalar(foe.d.r / 0.5 + 0.2); scene.add(this.ring);
  }
  /** riding in the foe: follows it, the ring pulses; returns false once the mark has run out */
  ride(dt: number) {
    if (!this.stuck) return false;
    this.stuckT += dt; this.life -= dt; this.t += dt;
    this.p.copy(this.stuck.pos).add(this.off); this.g.position.copy(this.p);
    if (this.ring) { this.ring.position.set(this.stuck.pos.x, 0.06, this.stuck.pos.z); const m = this.ring.material as THREE.MeshBasicMaterial; m.opacity = (0.55 + 0.35 * Math.sin(this.t * 14)) * Math.min(1, this.life * 4); }
    return this.life > 0;
  }
  /** struck something: a small spray of sparks and gone */
  stop(spark = true) { if (spark) fxSparks(this.p.clone(), 0xf0f4ff, 6, 3); this.kill(); }
  kill() { this.dead = true; this.g.parent?.remove(this.g); if (this.ring) { scene.remove(this.ring); (this.ring.material as THREE.Material).dispose(); this.ring = null; } }
}

// ------------------------------------------------------------------ the blade wave (act-146: pure 3D stepped-voxel pixel crescent)
export type WaveStyle = 'hanshan' | 'thunder' | 'frost' | 'blunt';
const WAVE_PALS: Record<WaveStyle, { edge: number; mid: number; tail: number; chip: number }> = {
  hanshan: { edge: 0xf4f8fc, mid: 0xbfcdda, tail: 0x4b5868, chip: 0xdce6f0 },
  thunder: { edge: 0xfff6d4, mid: 0xe6b244, tail: 0x764e1c, chip: 0xf2c868 },
  frost:   { edge: 0xecfcff, mid: 0x86d8ee, tail: 0x305e76, chip: 0xb6ecfa },
  blunt:   { edge: 0xfff0d4, mid: 0xe26a3c, tail: 0x6a241a, chip: 0xf08c5c },
};

/** Build a crisp axis-aligned 3D voxel-stepped crescent in the XZ plane (bulging toward +Z) — zero smooth vector curves or neon fog. */
function buildVoxelCrescent(pal: { edge: number; mid: number; tail: number }): THREE.BufferGeometry {
  const S = 0.075; // crisp 7.5 cm pixel-voxel grid
  const halfCols = 15; // 31 stepped columns across ~2.3m span
  const geos: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  const pushVox = (gx: number, gz: number, h: number, hex: number) => {
    const g = new THREE.BoxGeometry(S * 1.02, h, S * 1.02);
    g.translate(gx * S, 0, gz * S);
    const n = g.attributes.position.count, cs = new Float32Array(n * 3);
    c.setHex(hex);
    for (let i = 0; i < n; i++) { cs[i * 3] = c.r; cs[i * 3 + 1] = c.g; cs[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cs, 3));
    geos.push(g);
  };
  for (let gx = -halfCols; gx <= halfCols; gx++) {
    const u = Math.abs(gx) / halfCols; // 0 at center, 1 at tips
    const arch = Math.cos(u * Math.PI * 0.5);
    const gzFront = Math.round(arch * 7.2);
    // Razor bright front cutting-edge voxel
    pushVox(gx, gzFront, 0.052, pal.edge);
    // Stepped body thickness: 2 voxels deep across belly, 1 near tips
    if (u < 0.92) pushVox(gx, gzFront - 1, 0.074, pal.mid);
    if (u < 0.62) pushVox(gx, gzFront - 2, 0.064, pal.mid);
    // Crisp dark steel-ink trailing voxel ridge for contrast against both bright & dark floors
    const tailOffset = u < 0.62 ? 3 : 2;
    if (u < 0.80) pushVox(gx, gzFront - tailOffset, 0.044, pal.tail);
  }
  const merged = mergeGeometries(geos)!;
  for (const g of geos) g.dispose();
  return merged;
}

const WAVE_GEOS: Record<WaveStyle, THREE.BufferGeometry> = {
  hanshan: buildVoxelCrescent(WAVE_PALS.hanshan),
  thunder: buildVoxelCrescent(WAVE_PALS.thunder),
  frost:   buildVoxelCrescent(WAVE_PALS.frost),
  blunt:   buildVoxelCrescent(WAVE_PALS.blunt),
};

export class BladeWave {
  g = new THREE.Group(); dead = false; hit = new Set<number>(); private age = 0; private chipT = 0;
  private mesh: THREE.Mesh; private mat: THREE.MeshBasicMaterial; private chipCol: number;
  readonly fwd: THREE.Vector3;
  private right: THREE.Vector3;
  constructor(public p: THREE.Vector3, dir: THREE.Vector3, public speed = 20, public life = 0.42, style: WaveStyle = 'hanshan') {
    this.fwd = dir.clone().setY(0).normalize();
    this.right = V3(this.fwd.z, 0, -this.fwd.x);
    this.chipCol = WAVE_PALS[style].chip;
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1 });
    this.mesh = new THREE.Mesh(WAVE_GEOS[style], this.mat);
    this.mesh.renderOrder = 4;
    this.g.add(this.mesh);
    this.g.position.copy(p); this.g.rotation.y = Math.atan2(this.fwd.x, this.fwd.z); scene.add(this.g);
  }
  /** half width across the travel (the crescent's span) */
  get half() { return 1.2; }
  /** still flying (hits count) */
  get live() { return this.age < this.life; }
  step(dt: number) {
    const p0 = this.p.clone(); this.age += dt;
    if (this.live) { this.p.addScaledVector(this.fwd, this.speed * dt); this.g.position.copy(this.p); } else this.g.visible = false;
    const k = Math.min(1, this.age / this.life), fade = k < 0.72 ? 1 : Math.max(0, 1 - (k - 0.72) / 0.28);
    // Crisp stepped expansion on launch, clean pixel-thin taper at end of flight
    this.g.scale.set(0.84 + 0.22 * Math.min(1, k * 5), Math.max(0.25, fade), Math.max(0.22, fade));
    this.mat.opacity = fade;
    // Shed crisp square 3D pixel voxel chips behind the blade edge (replaces blurry smooth ghost crescents)
    this.chipT -= dt;
    if (this.live && this.chipT <= 0 && fade > 0.25) {
      this.chipT = 0.028;
      for (const s of [-0.95, 0, 0.95]) {
        const off = s * (0.85 + Math.random() * 0.25);
        const pos = this.p.clone().addScaledVector(this.right, off).addScaledVector(this.fwd, s === 0 ? 0.18 : -0.18);
        addBlock(pos, {
          size: s === 0 ? 0.08 : 0.065,
          col: this.chipCol,
          glow: false,
          life: 0.13,
          shrink: 0.08,
          v: this.fwd.clone().multiplyScalar(-1.6).add(V3(0, (Math.random() - 0.4) * 0.5, 0)),
        });
      }
    }
    if (!this.live) this.kill();
    return p0;
  }
  /** is a point (with radius r) inside the band the crescent swept from p0 to here? */
  sweeps(p0: THREE.Vector3, at: THREE.Vector3, r: number) {
    const d = at.clone().sub(p0).setY(0), along = d.dot(this.fwd), side = d.x * this.fwd.z - d.z * this.fwd.x, len = this.p.clone().sub(p0).setY(0).length();
    return along > -0.5 - r && along < len + 0.3 + r && Math.abs(side) < this.half + r * 0.6;
  }
  kill() {
    if (this.dead) return; this.dead = true; scene.remove(this.g);
    this.mat.dispose();
  }
}
