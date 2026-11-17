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

// ------------------------------------------------------------------ the blade wave
/** a flat crescent in the xz plane, bulging toward +z: outer arc radius R over ±A, the inner edge set back `thick` at the middle and
 *  meeting the outer one at the tips */
function crescent(R: number, A: number, thick: number, n = 24) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) { const a = -A + (2 * A * i) / n, x = R * Math.sin(a), y = R * Math.cos(a) - R; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  for (let i = n - 1; i > 0; i--) { const a = -A + (2 * A * i) / n, x = R * Math.sin(a), y = R * Math.cos(a) - R - thick * Math.cos((a / A) * Math.PI / 2); s.lineTo(x, y); }
  return new THREE.ShapeGeometry(s).rotateX(Math.PI / 2);   // shape y → world z (forward)
}
// thin and sharp: a hairline-bright core and only a narrow rim of glow (the first try, thick and over-bright, bloomed into a white fog)
const WAVE_CORE = crescent(1.3, 1.1, 0.15), WAVE_GLOW = crescent(1.38, 1.12, 0.3);
const waveMat = (c: number, k: number, o: number) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }); m.color.multiplyScalar(k); return m; };

export class BladeWave {
  g = new THREE.Group(); dead = false; hit = new Set<number>(); private age = 0; private ghostT = 0;
  private core: THREE.Mesh; private glow: THREE.Mesh; private ghosts: Array<{ m: THREE.Mesh; t: number }> = [];
  readonly fwd: THREE.Vector3;
  constructor(public p: THREE.Vector3, dir: THREE.Vector3, public speed = 20, public life = 0.42) {
    this.fwd = dir.clone().setY(0).normalize();
    this.core = new THREE.Mesh(WAVE_CORE, waveMat(0xffffff, 1.5, 1)); this.glow = new THREE.Mesh(WAVE_GLOW, waveMat(0x7affc0, 0.8, 0.25));
    this.glow.position.z = 0.06; this.g.add(this.glow, this.core); this.core.renderOrder = this.glow.renderOrder = 4;
    this.g.position.copy(p); this.g.rotation.y = Math.atan2(this.fwd.x, this.fwd.z); scene.add(this.g);
  }
  /** half width across the travel (the crescent's span) */
  get half() { return 1.2; }
  /** still flying (hits count); after its run it lingers only while the last ghosts fade */
  get live() { return this.age < this.life; }
  step(dt: number) {
    const p0 = this.p.clone(); this.age += dt;
    if (this.live) { this.p.addScaledVector(this.fwd, this.speed * dt); this.g.position.copy(this.p); } else this.g.visible = false;
    const k = Math.min(1, this.age / this.life), fade = k < 0.65 ? 1 : Math.max(0, 1 - (k - 0.65) / 0.35);
    // it opens out a touch as it leaves the blade, and thins to a line at the end
    this.g.scale.set(0.8 + 0.25 * Math.min(1, k * 4), 1, Math.max(0.15, fade));
    (this.core.material as THREE.MeshBasicMaterial).opacity = fade; (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.25 * fade;
    // ghost copies left behind every few centimetres of flight, fading fast
    this.ghostT -= dt;
    if (this.live && this.ghostT <= 0 && fade > 0.2) {
      this.ghostT = 0.035; const m = new THREE.Mesh(WAVE_CORE, waveMat(0xb8ffe0, 0.9, 0.18 * fade));
      m.position.copy(this.p); m.rotation.y = this.g.rotation.y; m.scale.copy(this.g.scale); m.renderOrder = 3; scene.add(m); this.ghosts.push({ m, t: 0 });
    }
    for (const gh of this.ghosts) { gh.t += dt; const mt = gh.m.material as THREE.MeshBasicMaterial; mt.opacity = Math.max(0, 0.18 * (1 - gh.t / 0.09)); gh.m.scale.z *= 0.85; }
    for (let i = this.ghosts.length - 1; i >= 0; i--) if (this.ghosts[i].t >= 0.09) { const gh = this.ghosts[i]; scene.remove(gh.m); (gh.m.material as THREE.Material).dispose(); this.ghosts.splice(i, 1); }
    if (!this.live && !this.ghosts.length) this.kill();
    return p0;
  }
  /** is a point (with radius r) inside the band the crescent swept from p0 to here? */
  sweeps(p0: THREE.Vector3, at: THREE.Vector3, r: number) {
    const d = at.clone().sub(p0).setY(0), along = d.dot(this.fwd), side = d.x * this.fwd.z - d.z * this.fwd.x, len = this.p.clone().sub(p0).setY(0).length();
    return along > -0.5 - r && along < len + 0.3 + r && Math.abs(side) < this.half + r * 0.6;
  }
  kill() {
    if (this.dead) return; this.dead = true; scene.remove(this.g);
    (this.core.material as THREE.Material).dispose(); (this.glow.material as THREE.Material).dispose();
    for (const gh of this.ghosts) { scene.remove(gh.m); (gh.m.material as THREE.Material).dispose(); } this.ghosts = [];
  }
}
