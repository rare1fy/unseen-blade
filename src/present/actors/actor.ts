// Common actor shell: placement, facing, hit flash, knockback, squash, the action queue and world anchor points.
import * as THREE from 'three';
import { OPT } from '../engine/perfOpts';
import { QUALITY } from '../look/quality';
import { camera, scene, V3 } from '../engine/world';
import { clock } from '../engine/clock';
import { Action, Spring, resetPose, type Bone } from './rig';
import { batchActor } from '../engine/rigidBatch';

export abstract class Actor {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  bones: Record<string, Bone> = {};
  meshes: THREE.Mesh[] = [];
  home = V3();
  /** world yaw the actor faces */
  yaw = 0;
  /** extra local offset (lunges, knockback) in the actor's facing frame: x right, z forward */
  off = V3();
  flash = 0; flashCol = new THREE.Color(1, 1, 1);
  squash = new Spring(0, 220, 16);
  knock = new Spring(0, 160, 14);
  /** 11-20 (act-109 打击感): real-time hitstop micro-jitter along the blow direction */
  private joltT = 0; private joltDur = 0.1; private joltAmp = 0; private joltX = 0; private joltZ = 1;
  t = Math.random() * 10;
  act: Action | null = null;
  dead = false;
  lowHp = 0;
  abstract readonly height: number;
  protected flashMats: Array<{ m: THREE.MeshToonMaterial | THREE.MeshStandardMaterial; base: THREE.Color }> = [];

  constructor() { this.root.add(this.body); scene.add(this.root); batchActor(this.root); }   // (11-18 微信帧率: its parts drawn as one mesh per material)

  protected finish(meshes: THREE.Mesh[]) {
    this.meshes = meshes;
    // per-actor material clones so hit flashes do not light up every actor sharing a material
    const clones = new Map<THREE.Material, THREE.Material>();
    for (const m of meshes) {
      const src = m.material as THREE.Material;
      if (!(src instanceof THREE.MeshToonMaterial || src instanceof THREE.MeshStandardMaterial)) continue;
      if (!clones.has(src)) { const c = src.clone() as THREE.MeshToonMaterial; c.onBeforeCompile = src.onBeforeCompile; c.customProgramCacheKey = src.customProgramCacheKey; (c as unknown as { extensions?: unknown }).extensions = (src as unknown as { extensions?: unknown }).extensions; clones.set(src, c); this.flashMats.push({ m: c, base: c.emissive.clone() }); }
      m.material = clones.get(src)!;
    }
  }

  place(p: THREE.Vector3, yaw?: number) { this.home.copy(p); if (yaw != null) this.yaw = yaw; this.apply(); }
  faceToward(p: THREE.Vector3) { this.yaw = Math.atan2(p.x - this.home.x, p.z - this.home.z); }
  /** forward unit vector in world space */
  fwd() { return V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  local(x: number, y: number, z: number) { return this.root.localToWorld(V3(x, y, z)); }
  bonePos(name: string, x = 0, y = 0, z = 0) { const b = this.bones[name]; return b ? b.localToWorld(V3(x, y, z)) : this.local(0, this.height * 0.6, 0); }
  head() { return this.bonePos('head', 0, 0.2, 0); }
  chest() { return this.bonePos('chest', 0, 0.2, 0.2); }
  abstract weapon(): THREE.Vector3;

  play(a: Action) { this.act?.cancel(); this.act = a; return a; }
  hit(power = 1) { this.flash = 1; this.flashCol.set(1, 1, 1); this.knock.kick(-6 * power); this.squash.kick(5 * power); }
  /** 11-20 (act-109): real-time high-frequency shudder on the struck body during hitstop */
  jolt(dir: THREE.Vector3, power = 1) {
    const l = Math.hypot(dir.x, dir.z);
    if (l > 1e-4) { this.joltX = dir.x / l; this.joltZ = dir.z / l; }
    else { this.joltX = Math.sin(this.yaw); this.joltZ = Math.cos(this.yaw); }
    const p = Math.min(1.5, Math.max(0.25, power));
    this.joltDur = 0.08 + 0.045 * p;
    this.joltT = this.joltDur;
    this.joltAmp = 0.036 + 0.044 * p;
  }
  tint(c: THREE.ColorRepresentation, k = 1) { this.flash = k; this.flashCol.set(c); }

  /** subclasses pose bones here (after resetPose) */
  protected abstract pose(dt: number): void;

  private nextPose = 0;
  private posePosition = V3();
  update(dt: number) {
    if (!this.root.visible) return;
    this.t += dt;
    if (this.act && !this.act.step(dt)) this.act = null;
    let interval = 0;
    if (OPT.poseLod && QUALITY.tier !== 'high' && this.root.parent === scene) {
      const p = this.posePosition.copy(this.home); p.y += this.height * 0.5;
      p.project(camera);
      if (Math.abs(p.x) > 1.35 || Math.abs(p.y) > 1.5 || p.z > 1 || this.home.distanceToSquared(camera.position) > 38 * 38) interval = 0.10;
    }
    this.nextPose += dt;
    if (this.nextPose >= interval) {
      resetPose(this.bones); this.pose(this.nextPose); this.nextPose = 0;
    }
    const sq = this.squash.step(0, dt), kn = this.knock.step(0, dt);
    this.body.scale.set(1 + sq * 0.06, 1 - sq * 0.08, 1 + sq * 0.06);
    if (this.joltT > 0) this.joltT = Math.max(0, this.joltT - Math.max(clock.rdt, dt));
    this.apply(kn);
    this.flash = Math.max(0, this.flash - dt * 4.8);
    // crisp peak flash on the first ~2 impact frames (flash > 0.72), without washing out lower-intensity tints
    const fk = Math.min(1, this.flash), peak = fk > 0.72 ? (fk - 0.72) / 0.28 : 0;
    const em = fk * (0.55 + 0.3 * peak);
    for (const f of this.flashMats) f.m.emissive.copy(f.base).lerp(this.flashCol, em);
  }
  private apply(kn = 0) {
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw), forward = this.off.z + kn * 0.12;
    let jx = 0, jz = 0;
    if (this.joltT > 0) {
      const k = this.joltT / Math.max(1e-4, this.joltDur);
      const osc = Math.sin(clock.rtime * 150) * this.joltAmp * k;
      jx = this.joltX * osc; jz = this.joltZ * osc;
    }
    this.root.position.set(this.home.x + sin * forward + cos * this.off.x + jx, this.home.y + this.off.y,
      this.home.z + cos * forward - sin * this.off.x + jz);
    this.root.rotation.y = this.yaw;
  }
}
