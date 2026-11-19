// 开篇（act-29，用户选方案 1：「方案1开做吧」；设计见 docs/DESIGN.md「故事开篇与对话演出」「按钮说明、界面优化、开篇方案 1 开工」）。
// 那一夜（寒山坞，冷开场）→「七年后」→ 雪夜残村（序章第一间，一个人打几个黄巾哨兵）→ 雪夜破庙见褚雷，两三句后开打，他打不死，
// 到时候一杖把她砸倒 → 倒在雪里，镜头升高、雪往下落 → 天亮：收尸的杜五牵驴扒死人鞋，摸到她还有气，犹豫，把她拖走 → 破窑醒来。
// 这里只放演出的镜头（timeline 只交代事和氛围，台词走立绘对话，show.ts 在镜头之间插 talk()）。全是中远景，没有特写。
import * as THREE from 'three';
import { V3 } from '../engine/world';
import { Action, resetPose, rot, mov } from '../actors/rig';
import { fxRing, fxSparks, fxImpact, fxGlow, fxSmoke } from '../fx/fx';
import { fxBolt } from '../fx/skillFx';
import { shake, slowmo } from '../engine/clock';
import { cue } from '../../audio/cues';
import { flashSky, currentStage } from '../scenes/stage';
import { PLAY } from '../scenes/props';
import { toon, glow } from '../look/toon';
import { onUpdate } from '../engine/world';
import { motionOf, bladeTip } from './ninjaAct';
import { blood } from './blood';
import type { Foe, EKind } from './enemy';
import type { CineShot, V } from './timeline';
import type { BattleActor } from '../bestiary/battle';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface PrologueHost {
  hero: { a: BattleActor; pos: THREE.Vector3 };
  /** 11-18: her pose from the blow until she is lifted onto the donkey (Kneel) */
  kneel: Kneel;
  /** a person placed in the scene for the cutscene (杜五, the donkey); the host updates and removes them */
  person(id: 'duwu' | 'donkey', x: number, z: number, yaw: number): BattleActor;
  puppet(kind: EKind, x: number, z: number, faceX: number, faceZ: number): Foe;
  /** 11-19: a body held off the walls and the props (the game's clamp) — 石雷 walking off, not through the wall */
  hold?(p: THREE.Vector3, r: number): void;
}

/** 11-18 (用户：「第一个剧情杀，主角被打倒以后的动作太搞笑了，直接侧躺在地上，做成单膝跪地胸口持续溅血的idle效果」): struck down by
 *  石雷 she goes down on her right knee (the left foot planted ahead, the front shin near upright, the back toes tucked), bent over, the
 *  left hand pressed to the wound in her chest. The blow knocks the sabre out of her hand onto the snow ahead of her; at the line where
 *  her fingers reach for its hilt the right arm stretches toward it, shaking. She breathes in heaves; each one jolts her and the wound
 *  spurts, and it runs the whole time (drops from under her hand, a pool spreading in the snow). At dawn (dawn()) the bleeding has
 *  stopped, a dark pool is left and she has the sabre again, clutched to her (杜五：「怀里还抱着把好刀」): her fist on the hilt before her
 *  chest, the blade down along her right side, its point resting in the snow behind her, her head down.
 *  frame(a) runs every frame after a.update(dt) (the cutscene ticks, and as the hero's scriptPose through the talks). */
let HIP_H = -1;
const KNEE_Y = 0.055, FOOT_AHEAD = 0.4, BREATH = 1.7;
/** the arms' angles (x / y / z offsets on the rest pose): the left hand on the wound, the right one reaching, the right fist at dawn —
 *  fitted by measuring the hand against the wound on the lab floor (__dh.labPose.kneel, __dh.kneelArms) */
export const KNEEL_ARMS = { armL: [-0.02, -0.85, -0.48], foreL: [-1.77, 0, 0], handL: [0.2, 0, 0.25], armR: [-0.28, 0, -0.1], foreR: [-0.3, 0, 0], reachR: [-0.95, 0, -0.12], reachF: [0.15, 0, 0], gripR: [0.28, 0.64, -0.71], gripF: [-2.02, 0, 0] };
const smK = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export class Kneel {
  private on = false; private a: BattleActor | null = null; private lastT = 0; private t = 0;
  /** 0 → 1: her right arm going out toward the hilt on the snow (reachWant is where it is headed) */
  reach = 0; reachWant = 0;
  /** the wound still bleeding (spurts and drops); off at dawn */
  fresh = true;
  /** dawn: the sabre clutched to her, its point in the snow behind */
  grip = false;
  /** 11-19 (用户：「说完话以后主角应该要体力不支趴下，这样等杜五出现的时候才会感觉是死人」): she gives way after his words — 0 kneeling →
   *  1 face down in the snow (slumpWant is where it is headed; the fall takes ~0.9 s); at dawn she is found lying so */
  slump = 0; slumpWant = 0;
  private beat = 0; private jerk = 0; private dripT = 0; private pooled = false;
  private sword: { g: THREE.Object3D; p0: THREE.Vector3; q0: THREE.Quaternion; p1: THREE.Vector3; q1: THREE.Quaternion; t: number } | null = null;
  private bladeLen = 0;
  private snap: Array<[THREE.Object3D, THREE.Vector3, THREE.Euler]> = [];
  /** the blow lands: from here she sinks onto the knee (over ~0.6 s, out of the hit she is playing) */
  start() { this.on = true; this.lying = false; this.slump = this.slumpWant = 0; this.t = 0; this.reach = this.reachWant = 0; this.fresh = true; this.grip = false; this.pooled = false; this.beat = 0.9; this.jerk = 0; this.a = null; this.dropSword(); }
  /** the next morning (a new hero actor, the same place): kneeling still, the blood stopped, the sabre in her hand */
  dawn() { this.on = true; this.t = 99; this.fresh = false; this.grip = false; this.lying = true; this.reach = this.reachWant = 0; this.slump = this.slumpWant = 1; this.pooled = false; this.jerk = 0; this.a = null; this.dropSword(); }
  /** dawn: she has lain there all night — the sabre lies in the snow by her hand (laid there, not thrown), nothing moves */
  private lying = false;
  get active() { return this.on; }
  /** done with it (she is lifted onto the donkey): the loose sabre goes */
  stop() { this.on = false; this.dropSword(); }
  private dropSword() { if (this.sword) { this.sword.g.removeFromParent(); this.sword = null; } }
  frame(a: BattleActor) {
    if (!this.on) return;
    if (a !== this.a) { this.a = a; this.lastT = a.t; }
    const dt = Math.max(0, Math.min(0.1, a.t - this.lastT)); this.lastT = a.t; this.t += dt;
    const e = smK((this.t - 0.1) / 0.55);
    this.reach += (this.reachWant - this.reach) * Math.min(1, dt * 2.2);
    // (the fall forward: slow to start — she sways — then all at once, the last of it a heavy drop into the snow)
    if (this.slumpWant > this.slump) { const was = this.slump; this.slump = Math.min(1, this.slump + dt / 0.9); if (was < 0.7 && this.slump >= 0.7) { cue('bodyFall', 0.7); snowPuff(a.home.clone().addScaledVector(V3(Math.sin(a.yaw), 0, Math.cos(a.yaw)), 0.6).setY(0.05)); } }
    if (e < 1) { this.snap.length = 0; for (const b of Object.values(a.bones)) if (b) this.snap.push([b, b.position.clone(), b.rotation.clone()]); }
    this.pose(a, dt);
    if (this.slump > 0) this.prone(a, this.slump);
    if (e < 1) for (const [b, p, r] of this.snap) { b.position.lerpVectors(p, b.position, e); b.rotation.set(r.x + (b.rotation.x - r.x) * e, r.y + (b.rotation.y - r.y) * e, r.z + (b.rotation.z - r.z) * e); }
    // the ponytail and the blindfold's tails hang down her back (stiff chains: with the head bowed they'd stick up)
    const f = V3(Math.sin(a.yaw), 0, Math.cos(a.yaw)), side = V3(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
    hangChains(a, (n) => V3(0, -1, 0).addScaledVector(f, n.startsWith('hr') ? -0.45 : -0.3).addScaledVector(side, n.startsWith('bfA') ? 0.18 : n.startsWith('bfB') ? -0.18 : 0), e);
    if (this.grip) this.plant(a);
    if (this.t > 0.15 && !this.sword && !this.grip) { this.knockSword(a); const sw = this.sword as { t: number } | null; if (this.lying && sw) sw.t = 1; }
    this.flySword(dt);
    this.bleed(a, dt);
  }
  private pose(a: BattleActor, dt: number) {
    const b = a.bones; resetPose(b);
    a.root.position.copy(a.home).setY(0); a.root.rotation.set(0, a.yaw, 0); a.body.position.set(0, 0, 0); a.body.rotation.set(0, 0, 0); a.body.scale.set(1, 1, 1);
    if (b.weapon) b.weapon.visible = this.grip;
    const H = hipHeight(a), T = b.shinL ? b.shinL.position.length() : 0.35, S = b.footL ? b.footL.position.length() : 0.28, ANK = H - T - S;
    // breathing in heaves; a spurt is a jolt (the shoulders hunch, the head drops) that eases off
    const live = this.grip ? 0.25 : 1, br = Math.sin((this.t / BREATH) * Math.PI * 2) * live;
    this.jerk = Math.max(0, this.jerk - dt / 0.4); const jk = this.jerk > 0 ? Math.sin(Math.PI * this.jerk) : 0;
    // the right knee on the snow: the thigh a little ahead of upright, the shin back and up to the tucked toes
    const tR = -0.12, hipY = KNEE_Y + T * Math.cos(tR), hz = -0.04;
    mov(b.hips, 0, hipY - H + 0.006 * br, hz);
    rot(b.legR, tR, 0, -0.07); rot(b.shinR, Math.PI / 2 + 0.3 - tR); rot(b.footR, 0);
    // the left foot flat on the snow ahead (two-bone IK in the leg's plane: the knee up, the shin near upright)
    { const dz = FOOT_AHEAD - hz, dy = ANK - hipY, L = Math.min(T + S - 1e-4, Math.hypot(dz, dy));
      const al = Math.acos(Math.max(-1, Math.min(1, (T * T + L * L - S * S) / (2 * T * L)))), be = Math.atan2(dz, -dy);
      const tL = -(be + al), sL = Math.PI - Math.acos(Math.max(-1, Math.min(1, (T * T + S * S - L * L) / (2 * T * S))));
      rot(b.legL, tL, 0, 0.1); rot(b.shinL, sL); rot(b.footL, -(tL + sL)); }
    // bent over the wound; turned a little toward the sabre as she reaches; lower and stiller by morning
    const r = this.reach, dawn = this.grip ? 1 : 0;
    rot(b.spine, 0.32 + 0.2 * r + 0.06 * dawn + 0.03 * br + 0.1 * jk, -0.14 * r - 0.1 * dawn, -0.05 * r);
    rot(b.chest, 0.14 + 0.04 * dawn - 0.03 * br + 0.12 * jk, -0.06 * r);
    // (the head bowed ~50° in all, ~60° by morning — more and the top of her head faces the camera)
    rot(b.neck, 0.08 + 0.04 * dawn + 0.05 * jk); rot(b.head, 0.12 + 0.06 * dawn + 0.1 * jk - 0.12 * r, 0.06 * Math.sin(this.t * 0.7) * live, 0.05 * Math.sin(this.t * 0.9) * live);
    // the left hand pressed to the wound (harder in each jolt)
    const K = KNEEL_ARMS;
    rot(b.armL, K.armL[0] - 0.08 * jk, K.armL[1], K.armL[2]); rot(b.foreL, K.foreL[0] - 0.1 * jk, K.foreL[1], K.foreL[2]); rot(b.handL, K.handL[0], K.handL[1], K.handL[2]);
    // the right arm: hanging; or out for the hilt, shaking; or (dawn) its fist on the planted sabre
    const shake = r * (0.04 * Math.sin(this.t * 31) + 0.025 * Math.sin(this.t * 53 + 1.3)) * (this.fresh ? 1 : 0.2);
    if (this.grip) { rot(b.armR, K.gripR[0], K.gripR[1], K.gripR[2]); rot(b.foreR, K.gripF[0], K.gripF[1], K.gripF[2]); }
    else { rot(b.armR, K.armR[0] + K.reachR[0] * r + shake, K.armR[1] + K.reachR[1] * r, K.armR[2] + K.reachR[2] * r); rot(b.foreR, K.foreR[0] + K.reachF[0] * r + shake * 0.6, K.foreR[1] + K.reachF[1] * r, K.foreR[2] + K.reachF[2] * r); rot(b.handR, 0.35 * r); }
  }
  /** she gives way (k 0 → 1): from the kneel, the trunk pitches forward past the knee, the hands come off the wound and out to break
   *  nothing, and she lies face down in the snow — the body pivots at the knee on the ground, the head turned to one side, the legs
   *  straightening out behind. Laid over the kneel pose (k = 1: the kneel is gone) */
  private prone(a: BattleActor, k: number) {
    const b = a.bones, e = k < 0.45 ? 0.35 * (k / 0.45) ** 2 : 0.35 + 0.65 * (1 - (1 - (k - 0.45) / 0.55) ** 2);
    // the whole body pitches forward about the knee on the snow (it is ~0.5 m ahead of the hips' ground point when she kneels)
    const pitch = (Math.PI / 2 - 0.08) * e, piv = 0.06;
    a.body.rotation.set(pitch, 0, 0.12 * e); a.body.position.set(0, piv * Math.sin(pitch) * 0.3 + 0.1 * e, (1 - Math.cos(pitch)) * 0.15 + 0.32 * e);
    // the hips back to their standing height as she goes (the kneel dropped them ~0.3 m; left there, the straightened legs reached
    //  below the root and the feet sank into the snow once she lay down)
    { const hp = b.hips as (THREE.Object3D & { rest?: { p: THREE.Vector3 } }) | undefined; if (hp?.rest) { hp.position.y += (hp.rest.p.y - hp.position.y) * e; hp.position.z += (hp.rest.p.z - hp.position.z) * e; } }
    // the legs: from the kneel to lying straight behind her (the knees undo, the feet lie on their tops)
    const back = e;
    for (const s of ['L', 'R'] as const) {
      const leg = b['leg' + s], shin = b['shin' + s], ft = b['foot' + s]; if (!leg || !shin || !ft) continue;
      leg.rotation.x *= 1 - back; shin.rotation.x *= 1 - back * 0.9; ft.rotation.x = ft.rotation.x * (1 - back) + 0.9 * back;
      leg.rotation.z += (s === 'L' ? 0.08 : -0.1) * back;
    }
    // the trunk straightens along the snow; the head turned to her right, cheek down
    if (b.spine) b.spine.rotation.x *= 1 - e; if (b.chest) b.chest.rotation.x *= 1 - e;
    if (b.neck) b.neck.rotation.x = b.neck.rotation.x * (1 - e) - 0.25 * e;
    if (b.head) { b.head.rotation.x = b.head.rotation.x * (1 - e) - 0.1 * e; b.head.rotation.y = b.head.rotation.y * (1 - e) + 1.05 * e; }
    // the arms: off the wound, flung out ahead and to the side as she goes down, lying slack in the snow
    for (const [arm, fore, sx] of [[b.armL, b.foreL, 1], [b.armR, b.foreR, -1]] as const) {
      if (!arm || !fore) continue;
      arm.rotation.set(arm.rotation.x * (1 - e) - 2.55 * e, arm.rotation.y * (1 - e), arm.rotation.z * (1 - e) + sx * 0.5 * e);
      fore.rotation.x = fore.rotation.x * (1 - e) - 0.35 * e;
    }
  }
  /** her sabre knocked out of her hand by the blow: it flies a little and lands flat on the snow ahead of her, to her right */
  private knockSword(a: BattleActor) {
    const w = a.bones.weapon, parent = currentStage()?.root ?? a.root.parent; if (!w || !parent) return;
    a.root.updateMatrixWorld(true);
    const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), s0 = new THREE.Vector3(); w.matrixWorld.decompose(p0, q0, s0);
    const g = w.clone(true); g.visible = true; g.traverse(o => { o.visible = true; });
    const f = V3(Math.sin(a.yaw), 0, Math.cos(a.yaw)), right = V3(-f.z, 0, f.x);
    const dir = f.clone().multiplyScalar(0.55).addScaledVector(right, 0.84).normalize();   // (the blade across her front-right, the hilt nearest her hand)
    const q1 = new THREE.Quaternion().setFromRotationMatrix(flatBasis(dir));
    const p1 = a.home.clone().addScaledVector(f, 0.72).addScaledVector(right, 0.12).setY(0);
    g.position.copy(p1); g.quaternion.copy(q1); g.scale.copy(s0); parent.add(g); g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g); p1.y += 0.006 - box.min.y;
    g.position.copy(p0); g.quaternion.copy(q0);
    this.sword = { g, p0, q0, p1, q1, t: 0 };
  }
  private flySword(dt: number) {
    const s = this.sword; if (!s || s.t >= 1) return;
    s.t = Math.min(1, s.t + dt / 0.42); const u = s.t;
    s.g.position.lerpVectors(s.p0, s.p1, u).add(V3(0, 0.45 * 4 * u * (1 - u), 0)); s.g.quaternion.slerpQuaternions(s.q0, s.q1, Math.min(1, u * 1.3));
    if (u >= 1) { cue('parry', 0.22); snowPuff(s.p1.clone().setY(0.05)); }
  }
  /** dawn: the sabre held to her — from her fist before the chest the blade runs down past her right hip to the snow behind her */
  private plant(a: BattleActor) {
    const w = a.bones.weapon; if (!w || !w.parent) return;
    a.root.updateMatrixWorld(true);
    const grip = new THREE.Vector3(); w.getWorldPosition(grip);
    if (!this.bladeLen) this.bladeLen = Math.max(0.3, bladeTip(a).distanceTo(grip));
    const f = V3(Math.sin(a.yaw), 0, Math.cos(a.yaw)), right = V3(-f.z, 0, f.x), h = Math.max(0, grip.y - 0.02);
    const out = f.clone().multiplyScalar(-0.72).addScaledVector(right, 0.7).normalize(), d = Math.sqrt(Math.max(0, this.bladeLen * this.bladeLen - h * h));
    const dir = out.multiplyScalar(d).add(V3(0, -h, 0)).normalize();
    const side = V3(0, 1, 0).cross(dir).normalize();   // (the flat of the blade faces sideways, the edge forward)
    const qw = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, dir.clone().cross(side), dir));
    const qp = new THREE.Quaternion(); w.parent.getWorldQuaternion(qp); w.quaternion.copy(qp.invert().multiply(qw)); w.updateMatrixWorld(true);
  }
  private bleed(a: BattleActor, dt: number) {
    const c = a.bones.chest; if (!c) return;
    const f = V3(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    if (!this.pooled && this.t > (this.fresh ? 1.0 : 0)) { this.pooled = true; const p = a.home.clone().addScaledVector(f, 0.22); blood.pool(p.x, p.z, this.fresh ? 0.7 : 1.1, this.fresh ? 120 : 600); }
    if (!this.fresh || this.t < 0.3) return;
    a.root.updateMatrixWorld(true); const wound = c.localToWorld(V3(-0.02, 0.06, 0.16));
    // it runs all the time (from under her hand) …
    this.dripT -= dt; while (this.dripT <= 0) { this.dripT += 0.09; blood.drip(wound); }
    // … and with each heave it spurts and she jolts
    this.beat -= dt; if (this.beat <= 0) { this.beat += BREATH; this.jerk = 1; blood.spray(wound, f.clone().add(V3(0, -0.4, 0)).normalize(), 9, 0.45); }
  }
}
/** a basis whose +z runs along dir on the ground and whose +x (the blade's thickness) points up: a sabre lying flat */
function flatBasis(dir: THREE.Vector3) { const x = V3(0, 1, 0), z = dir.clone().setY(0).normalize(), y = z.clone().cross(x); return new THREE.Matrix4().makeBasis(x, y, z); }
/** her hips' height standing (the rig at rest, measured once) */
function hipHeight(a: BattleActor) {
  const hips = a.bones.hips as (THREE.Object3D & { rest?: { p: THREE.Vector3 } }) | undefined;
  if (HIP_H < 0 && hips) {
    const r = a.root.position.clone(), rr = a.root.rotation.clone(), bp = a.body.position.clone(), brot = a.body.rotation.clone(), hp0 = hips.position.clone();
    if (hips.rest) hips.position.copy(hips.rest.p);
    a.body.rotation.set(0, 0, 0); a.body.position.set(0, 0, 0); a.root.position.set(0, 0, 0); a.root.rotation.set(0, 0, 0); a.root.updateMatrixWorld(true);
    const hp = new THREE.Vector3(); hips.getWorldPosition(hp); HIP_H = Math.max(0.4, hp.y);
    hips.position.copy(hp0); a.root.position.copy(r); a.root.rotation.copy(rr); a.body.position.copy(bp); a.body.rotation.copy(brot); a.root.updateMatrixWorld(true);
  }
  return HIP_H > 0 ? HIP_H : 0.75;
}

/** act-40 (用户：「刘白被驼走的动画，人就这么粘在骡子旁边……僵硬过头了」): her body slung across the donkey's back — face down, the waist
 *  on its spine, the trunk and arms hanging down one side, the legs down the other, everything limp and swinging a little with the
 *  stride (ph = the donkey's walk phase). (x, y, z) is the top of its back, yaw its heading */
export function drapeOver(a: BattleActor, x: number, y: number, z: number, yaw: number, ph: number) {
  // (act-44 用户：「人还是没有被驮着，纯是头顶地面，腰部没有弯曲挂在骡子背上」: measured on the heroine's rig — the hips 0.75 m up;
  //  a positive spine angle bends forward, a positive thigh angle swings the leg BACK (so the legs hang with a negative one; the last
  //  version had them backward and stood her on her head); every bone starts from its rest pose so nothing of the fall is left in)
  const b = a.bones; resetPose(b);
  if (b.weapon) b.weapon.visible = false;   // (杜五 has her sabre: 「在火堆边烤着呢」 — she gets it back at the end of the wake)
  if (HIP_H < 0 && b.hips) { a.body.rotation.set(0, 0, 0); a.body.position.set(0, 0, 0); a.root.position.set(0, 0, 0); a.root.rotation.set(0, 0, 0); a.root.updateMatrixWorld(true); const hp = new THREE.Vector3(); b.hips.getWorldPosition(hp); HIP_H = Math.max(0.4, hp.y); }
  const sw = Math.sin(ph), sw2 = Math.sin(ph * 2 + 0.6);
  a.root.position.set(x, y + Math.abs(sw) * 0.02, z); a.root.rotation.set(0, yaw + Math.PI / 2, 0);
  // face down across the back (head toward the root's +z), the hips on the root a hand above the back
  a.body.rotation.set(Math.PI / 2, 0, 0.04 * sw); a.body.position.set(0, 0.13, -HIP_H);
  // the trunk folds down over the far side, the head hangs; the arms hang on past the head toward the ground, swinging
  rot(b.spine, 1.0 + 0.04 * sw2); rot(b.chest, 0.45); rot(b.neck, 0.2); rot(b.head, 0.3, 0.12 * sw);
  rot(b.armL, -2.7 + 0.1 * sw, 0, 0.12); rot(b.foreL, -0.25); rot(b.armR, -2.7 - 0.1 * sw, 0, -0.12); rot(b.foreR, -0.3);
  // the legs hang down the near side, the knees a little bent, out of step with the arms
  rot(b.legL, -1.35 + 0.06 * sw2, 0, 0.05); rot(b.shinL, 0.35); rot(b.footL, 0.25); rot(b.legR, -1.35 - 0.06 * sw2, 0, -0.05); rot(b.shinR, 0.4); rot(b.footR, 0.25);
  // the ponytail's knot and the blindfold's knot hang a hand off the ground: the tails lie out along the ground, away from the donkey's
  // flank, the two blindfold tails a little apart, trailing a touch behind with the step
  a.root.updateMatrixWorld(true); const hd = new THREE.Vector3(); (b.head ?? b.hips)!.getWorldPosition(hd);
  const out = V3(hd.x - x, 0, hd.z - z); if (out.lengthSq() < 1e-4) out.set(Math.cos(yaw), 0, -Math.sin(yaw)); out.normalize();
  const fw = V3(Math.sin(yaw), 0, Math.cos(yaw));
  hangChains(a, (n) => out.clone().add(fw.clone().multiplyScalar((n.startsWith('bfA') ? 0.45 : n.startsWith('bfB') ? -0.45 : 0) - 0.25 + 0.1 * sw)).setY(-0.12));
}

/** act-44 (用户：「躺着那个更扯，头都插进墙了，起来的时候直接以足底为圆心旋转」): lying on her back (k = 0) and getting up (k → 1)
 *  with the hips as the pivot — up on her elbows, sitting with the legs out along the ground, rocking forward onto her feet into a
 *  squat, standing. The root is where her hips are (her head toward the root's −z, her feet +z); the feet stay put from the squat
 *  on, so she ends standing `GETUP_STEP` m ahead of the root (the caller moves her there and clears the body offset). */
export const GETUP_STEP = 0.45;
/** her hips' height lying and sitting on 孙媪's mat (the mat is one 7 cm cell of straw; the pelvis rests on it) */
const MAT_HIP = 0.18, MAT_TOP = 0.07;
export function getUpPose(a: BattleActor, k: number) {
  const b = a.bones; resetPose(b);
  if (b.weapon) b.weapon.visible = false;
  if (HIP_H < 0 && b.hips) { const r = a.root.position.clone(), ry = a.root.rotation.y; a.body.rotation.set(0, 0, 0); a.body.position.set(0, 0, 0); a.root.position.set(0, 0, 0); a.root.rotation.set(0, 0, 0); a.root.updateMatrixWorld(true); const hp = new THREE.Vector3(); b.hips.getWorldPosition(hp); HIP_H = Math.max(0.4, hp.y); a.root.position.copy(r); a.root.rotation.y = ry; }
  const H = HIP_H > 0 ? HIP_H : 0.75, sm = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)), seg = (a0: number, a1: number) => sm((k - a0) / (a1 - a0));
  // 1 on her back → up on her elbows → 2 sitting, legs out → 3a the knees drawn up (the feet slide back) → 3b rocking forward over the
  // feet into a squat → 4 standing up on them
  const u1 = seg(0, 0.2), u2 = seg(0.2, 0.45), u3a = seg(0.45, 0.58), u3 = seg(0.58, 0.74), u4 = seg(0.74, 1);
  const T = b.shinL ? b.shinL.position.length() : 0.35, S = b.footL ? b.footL.position.length() : 0.28, ANK = H - T - S;
  // the trunk's tilt about the hips (−π/2 = flat; lying, the shoulders a little up — her neck on the mat's wooden headrest)
  const th = -Math.PI / 2 + 0.12 + 0.45 * u1 + (Math.PI / 2 - 0.57) * u2;
  const SQ = 0.225, hy = MAT_HIP + (0.31 - MAT_HIP) * u3 + (H - 0.31) * u4, hz = SQ * u3 + (GETUP_STEP - SQ) * u4;
  a.body.rotation.set(th, 0, 0); a.body.position.set(0, hy - H * Math.cos(th), hz - H * Math.sin(th));
  // the legs: flat along the mat while she lies and sits up (against the trunk's tilt, the knees easing up a little); from sitting
  // on, two-bone IK on an ankle spot — slid back as the knees come up, then nailed GETUP_STEP ahead while she rocks over her feet
  // and stands (the soles flat, never sliding; on the straw, sinking into it as her weight comes on)
  let thigh: number, shin: number, foot: number;
  if (k < 0.45) { thigh = -(th + Math.PI / 2) - 0.25 * u2; shin = 0.62 * u2; foot = 0; }
  else {
    const az = 0.6 - (0.6 - GETUP_STEP) * u3a, ay = ANK + MAT_TOP * (1 - u4);
    const dz = az - hz, dy = ay - hy, L = Math.min(T + S - 1e-4, Math.hypot(dz, dy));
    const al = Math.acos(Math.max(-1, Math.min(1, (T * T + L * L - S * S) / (2 * T * L)))), be = Math.atan2(dz, -dy);
    thigh = -(be + al); shin = Math.PI - Math.acos(Math.max(-1, Math.min(1, (T * T + S * S - L * L) / (2 * T * S)))); foot = -(thigh + shin) * Math.max(u3a, u3);
  }
  const spread = 0.05 * (1 - u4);
  rot(b.legL, thigh, 0, spread); rot(b.legR, thigh, 0, -spread); rot(b.shinL, shin); rot(b.shinR, shin); rot(b.footL, foot); rot(b.footR, foot);
  // the trunk and head: the head rolled aside on the headrest while she lies, chin up on the elbows, a lean forward to rise
  rot(b.spine, 0.2 * u2 * (1 - u3) + 0.55 * u3 * (1 - u4)); rot(b.chest, 0.1 * u3 * (1 - u4));
  rot(b.head, -0.15 * u1 * (1 - u2), 0.4 * (1 - u1), 0.1 * (1 - u1));
  // the arms: limp at her sides; back as props on the elbows; hands down beside the hips sitting; reaching forward to rise
  const prop = u1 * (1 - u2), sit = u2 * (1 - u3), rise = u3 * (1 - u4);
  for (const [arm, fore, sx] of [[b.armL, b.foreL, 1], [b.armR, b.foreR, -1]] as const) {
    rot(arm, 0.75 * prop + 0.35 * sit - 0.7 * rise, 0, sx * (0.18 * (1 - u1) + 0.12 * sit));
    rot(fore, -1.3 * prop - 0.15 * sit - 0.5 * rise);
  }
  // the ponytail and the blindfold's tails: fanned out sideways on the mat by her head while she lies (not out past the mat's end),
  // falling back down her back as she sits up
  // (all to her right, away from 孙媪's medicine stove — by its fire the white hair glared)
  const up = 1 - u2; if (up > 0) hangChains(a, (n) => V3(-1, -0.08 - 0.9 * u1, n.startsWith('hr') ? 0.1 : n.startsWith('bfA') ? -0.6 : -0.25), up);
}

/** act-44: the ponytail (hrA…) and the blindfold's tails (bfA…, bfB…) turned so each chain's line points along dir(name) in the
 *  world (gravity, or spread on a mat) — they are stiff chains hung off the head, so with the head upside down they'd stand up;
 *  w < 1 = only part of the way */
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _id = new THREE.Quaternion();
export function hangChains(a: BattleActor, dir: (name: string) => THREE.Vector3, w = 1) {
  a.root.updateMatrixWorld(true);
  for (const [name, b] of Object.entries(a.bones)) {
    if (!b || !b.parent || !/^(hr|bf)[A-Z]1$/.test(name)) continue;
    const base = name.slice(0, -1), end = a.bones[base + '3'] ?? a.bones[base + '2']; if (!end) continue;
    b.getWorldPosition(_p0); end.getWorldPosition(_p1); const cur = _p1.sub(_p0); if (cur.lengthSq() < 1e-6) continue;
    _q.setFromUnitVectors(cur.normalize(), dir(name).normalize()); if (w < 1) _q.slerp(_id, 1 - w);
    b.getWorldQuaternion(_q2); _q.multiply(_q2); b.parent.getWorldQuaternion(_q2); b.quaternion.copy(_q2.invert().multiply(_q)); b.updateMatrixWorld(true);
  }
}

/** act-37 (用户：「人物的动作也很僵硬，也有很多穿模的问题」): a cutscene camera stays over the yard — inside the walls left, right and
 *  behind (the 2x stage's court), free to stand back in front (the open side), never lower than a man's head — so a shot set relative
 *  to where she fell can't end up inside the buildings beyond the wall */
export function inYard(v: V): V { return [Math.max(PLAY.x0 + 0.8, Math.min(PLAY.x1 - 0.8, v[0])), Math.max(2.5, v[1]), Math.max(PLAY.z0 + 0.8, Math.min(PLAY.z1 + 12, v[2]))]; }
const camKey = (k: { pos: V; look: V; fov: number }) => ({ ...k, pos: inYard(k.pos) });
/** act-37 (用户：「开场的战斗不是雪夜吗，光影上明明就是大白天」): the snowy night's warm points — iron braziers on three legs, a fire
 *  of glowing blocks that dances and a warm light that flickers with it; they are things in the yard (a solid round each) */
const BRAZIERS = new Set<{ g: THREE.Group; light: THREE.PointLight; flames: THREE.Mesh[]; s: number }>();
let brazT = 0;
onUpdate((dt) => {
  brazT += dt;
  for (const b of BRAZIERS) {
    if (!b.g.parent) { BRAZIERS.delete(b); continue; }
    const k = 1 + Math.sin(brazT * 9 + b.s) * 0.12 + Math.sin(brazT * 23 + b.s * 2) * 0.07;
    b.light.intensity = 4.2 * k;
    b.flames.forEach((f, i) => { const q = 1 + Math.sin(brazT * (7 + i) + b.s + i) * 0.18; f.scale.set(q, 1.1 * q + 0.15 * Math.sin(brazT * 11 + i), q); });
  }
});
export function brazier(x: number, z: number) {
  const g = new THREE.Group(), iron = toon(0x2a2a30), ironL = toon(0x4a4a54);
  const box = (w: number, h: number, d: number, m: THREE.Material, px: number, py: number, pz: number) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); o.castShadow = true; g.add(o); return o; };
  for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [0, 0.26]]) box(0.06, 0.8, 0.06, iron, lx, 0.4, lz);
  box(0.66, 0.1, 0.66, iron, 0, 0.82, 0); box(0.72, 0.16, 0.08, ironL, 0, 0.92, 0.33); box(0.72, 0.16, 0.08, ironL, 0, 0.92, -0.33); box(0.08, 0.16, 0.72, ironL, 0.33, 0.92, 0); box(0.08, 0.16, 0.72, ironL, -0.33, 0.92, 0);
  box(0.5, 0.08, 0.5, toon(0x3a1a10), 0, 0.92, 0);   // coals
  const flames: THREE.Mesh[] = [];
  for (const [fx, fz, h, c] of [[0, 0, 0.36, 0xffb040], [-0.12, 0.08, 0.24, 0xff7a2a], [0.12, -0.06, 0.26, 0xff8a30], [0.02, -0.12, 0.18, 0xffd070]] as Array<[number, number, number, number]>) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14).translate(0, h / 2, 0), glow(c, 2.2)); f.position.set(fx, 0.96, fz); g.add(f); flames.push(f);
  }
  const light = new THREE.PointLight(0xff9a4a, 4.2, 8, 1.6); light.position.set(0, 1.4, 0); g.add(light);
  g.position.set(x, 0, z); BRAZIERS.add({ g, light, flames, s: x * 1.7 + z });
  return g;
}

/** act-36 (用户：「timeline里面的死人堆，就那么几个，算啥死人堆」): a field of the dead that costs a few draw calls — each body is posed once
 *  (on its side, its back or face down, limbs thrown out), then every visible mesh of every body is baked into world space and merged by
 *  material; the actors themselves are thrown away. The pile never moves again (the dead do not breathe). */
export function bakeStill(roots: THREE.Object3D[], parent: THREE.Object3D) {
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const r of roots) {
    r.updateMatrixWorld(true);
    r.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh || !m.visible || Array.isArray(m.material)) return;
      let vis = true; for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) { vis = false; break; }
      if (!vis) return;
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld); const key = m.material as THREE.Material;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(g);
    });
  }
  const out: THREE.Mesh[] = [];
  for (const [mat, gs] of groups) {
    // (geometries with a different attribute set than the first are merged on their own — never dropped)
    const sets = new Map<string, THREE.BufferGeometry[]>();
    for (const g of gs) { const k = Object.keys(g.attributes).sort().join(',') + (g.index ? '|i' : ''); (sets.get(k) ?? sets.set(k, []).get(k)!).push(g); }
    for (const list of sets.values()) {
      const merged = mergeGeometries(list, false); for (const g of list) g.dispose(); if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; parent.add(mesh); out.push(mesh);
    }
  }
  return out;
}
/** the dead in the temple yard at dawn: the ones given first (he stops at them), then heaps and strays around (deterministic) */
function deadField(ox: number, oz: number, named: Array<[EKind, number, number]>) {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const kinds: EKind[] = ['hj_mob', 'hj_mob', 'hj_blade', 'hj_mob', 'hj_archer', 'hj_blade', 'hj_mob'];
  const out: Array<{ k: EKind; x: number; z: number; y: number; yaw: number; how: 0 | 1 | 2; r: () => number }> = [];
  const free = (x: number, z: number) => Math.hypot(x - ox, z - oz) > 1.6 && out.every(o => Math.hypot(o.x - x, o.z - z) > 0.9 || o.y > 0);
  for (const [k, x, z] of named) out.push({ k, x, z, y: 0, yaw: rnd() * 6.28, how: 0, r: rnd });
  // heaps: two or three bodies, the upper ones lying across the lower (raised, turned)
  const heaps: Array<[number, number, number]> = [[-5.5, -2.5, 3], [4.8, -3.6, 3], [-3.2, -6.4, 2], [6.2, 2.8, 2], [-7.4, 3.2, 3], [2.6, -7.8, 2], [-1.6, 6.8, 2], [7.6, -7.0, 2], [-8.6, -6.0, 2]];
  for (const [hx, hz, n] of heaps) {
    const x0 = ox + hx, z0 = oz + hz; if (!free(x0, z0)) continue;
    for (let i = 0; i < n; i++) out.push({ k: kinds[Math.floor(rnd() * kinds.length)], x: x0 + (rnd() - 0.5) * 0.5, z: z0 + (rnd() - 0.5) * 0.5, y: i * 0.24, yaw: rnd() * 6.28, how: (i === 0 ? 0 : Math.floor(rnd() * 3)) as 0 | 1 | 2, r: rnd });
  }
  // strays: alone, face down or on their backs, across the yard
  for (let t = 0; t < 60 && out.length < 34; t++) {
    const x = ox + (rnd() - 0.5) * 18, z = oz + (rnd() - 0.5) * 16; if (!free(x, z)) continue;
    out.push({ k: kinds[Math.floor(rnd() * kinds.length)], x, z, y: 0, yaw: rnd() * 6.28, how: Math.floor(rnd() * 3) as 0 | 1 | 2, r: rnd });
  }
  return out;
}
/** pose a body as it fell: 0 on its side, 1 on its back, 2 face down; arms and legs thrown out (a little different each one) */
export function layDead(a: BattleActor, how: 0 | 1 | 2, r: () => number) {
  const b = a.bones, rz = (n: string, v: number) => { if (b[n]) b[n].rotation.z = v; }, rx = (n: string, v: number) => { if (b[n]) b[n].rotation.x = v; };
  a.body.rotation.set(0, 0, 0); a.body.position.set(0, 0, 0);
  if (how === 0) { a.body.rotation.z = Math.PI / 2; a.body.rotation.y = (r() - 0.5) * 0.6; a.body.position.set(0.12, 0.12, 0); }
  else if (how === 1) { a.body.rotation.x = -Math.PI / 2; a.body.position.set(0, 0.1, -0.05); }
  else { a.body.rotation.x = Math.PI / 2; a.body.position.set(0, 0.1, 0.05); }
  rz('armL', 0.5 + r() * 1.1); rz('armR', -(0.4 + r() * 1.2)); rx('armL', (r() - 0.5) * 1.2); rx('armR', (r() - 0.5) * 1.2);
  rx('legL', (r() - 0.3) * 0.9); rx('legR', (r() - 0.7) * 0.9); rz('legL', 0.05 + r() * 0.25); rz('legR', -(0.05 + r() * 0.25));
  if (b.head) { b.head.rotation.y = (r() - 0.5) * 1.2; b.head.rotation.z = (r() - 0.5) * 0.5; }
}

/** the blow that ends the first fight: he winds up the ringed staff, lightning, she is struck down; then the camera rises */
export function fallShots(h: PrologueHost, boss: Foe): CineShot[] {
  const hp = () => h.hero.pos, b = () => boss.pos;
  // from the side of the line between them, far enough to see both whole (a medium-wide, never over his shoulder)
  const side = (dist: number, up: number): { pos: V; look: V; fov: number } => {
    const mx = (hp().x + b().x) / 2, mz = (hp().z + b().z) / 2; let dx = b().x - hp().x, dz = b().z - hp().z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let nx = -dz, nz = dx; if (nz < 0) { nx = -nx; nz = -nz; }
    return camKey({ pos: [mx + nx * dist, up, mz + nz * dist] as V, look: [mx, 1.0, mz] as V, fov: 36 });
  };
  let down = false;
  return [
    { dur: 2.2, ease: 'out', from: () => side(11, 5.5), to: () => side(10, 5.0),
      at: [[0.1, () => { boss.a.yaw = Math.atan2(hp().x - b().x, hp().z - b().z); boss.a.roar(); cue(boss.kind === 'hj_boss' ? 'roar' : 'draw', 0.8); }],
        // (11-19 剧情改版: 崔玄 in the forecourt — no thunder: one cut, the blade off her hands, the hilt into her chest)
        [0.9, () => { if (boss.kind === 'hj_boss') { flashSky(1); fxBolt(V3(b().x, 24, b().z), V3(b().x, 3.4, b().z), 0xd8c8ff, { width: 0.5, life: 0.4, bright: 0.7 }); cue('thunder', 1); }
          else { const d = hp().clone().sub(b()).setY(0); const l = d.length() || 1; boss.pos.addScaledVector(d, Math.max(0, l - 1.3) / l); boss.a.home.copy(boss.pos); boss.a.root.position.copy(boss.pos); fxSparks(h.hero.a.chest(), 0xffffff, 12, 3); cue('parry', 1); } }],
        [1.25, () => { slowmo(0.9, 0.2); shake(0.6); fxImpact(h.hero.a.chest(), 0xfff0d0, 2.2, { stop: false }); fxRing(hp().clone().setY(0.06), 0xffffff, 3, { life: 0.6 } as never);
          h.hero.a.play(new Action('hurt', 0.6, 0.1, { power: 2 })); cue('cutHeavy', 1); cue('hurt', 1); down = true; h.kneel.start(); }],
        // (11-18: down on one knee — the knee meets the snow; the blood starts)
        [1.85, () => { cue('land', 0.45); snowPuff(hp().clone().setY(0.05)); blood.spray(h.hero.a.chest(), V3(Math.sin(h.hero.a.yaw), -0.3, Math.cos(h.hero.a.yaw)).normalize(), 18, 0.8); }]],
      tick: (_t, dt) => { h.hero.a.update(dt); if (down) h.kneel.frame(h.hero.a); boss.a.update(dt); } },
  ];
}
/** after his line: she lies in the snow, the camera rises slowly away, the snow keeps falling */
export function snowShots(h: PrologueHost, boss: Foe): CineShot[] {
  const p = h.hero.pos.clone();
  // (11-19 用户：「如果在墙边，他会直接穿墙离开？」: he walked straight back whatever stood there — the temple's back wall is close
  //  behind the court. Now he turns away from her toward the open front of the yard and walks off round whatever is in the way,
  //  held off the walls and the props by the game's clamp, the steps by the ground he covers)
  const away = (() => { const dx = boss.pos.x - p.x, dz = boss.pos.z - p.z, l = Math.hypot(dx, dz) || 1; const ax = dx / l * 0.5, az = dz / l * 0.5 + 1; const m = Math.hypot(ax, az) || 1; return { x: ax / m, z: az / m }; })();
  return [
    // (11-19: after his words she gives way — the kneel pitches forward and she lies face down in the snow; the camera holds on it)
    { dur: 2.0, ease: 'inOut', from: camKey({ pos: [p.x + 2.8, 2.2, p.z + 3.8], look: [p.x, 0.4, p.z], fov: 34 }), to: camKey({ pos: [p.x + 2.6, 2.6, p.z + 4.0], look: [p.x, 0.25, p.z + 0.3], fov: 34 }),
      at: [[0.15, () => { h.kneel.slumpWant = 1; }]],
      tick: (_t, dt) => { h.hero.a.update(dt); h.kneel.frame(h.hero.a); boss.a.update(dt); } },
    { dur: 6.5, ease: 'inOut', from: camKey({ pos: [p.x + 2.5, 3.2, p.z + 4.0], look: [p.x, 0.3, p.z], fov: 34 }), to: camKey({ pos: [p.x + 1.0, 13, p.z + 7], look: [p.x, 0, p.z - 1], fov: 38 }),
      at: [[0.4, () => { boss.a.yaw = Math.atan2(away.x, away.z); }]],
      tick: (t, dt) => {
        h.hero.a.update(dt); h.kneel.frame(h.hero.a);
        if (t > 0.8) { const was = boss.pos.clone(); boss.pos.x += away.x * dt * 1.3; boss.pos.z += away.z * dt * 1.3; h.hold?.(boss.pos, boss.d.r);
          const mx = boss.pos.x - was.x, mz = boss.pos.z - was.z, v = Math.hypot(mx, mz) / Math.max(1e-4, dt); if (v > 0.05) boss.a.yaw = Math.atan2(mx, mz); boss.a.setRunning(v > 0.4, v); }
        boss.a.update(dt);
      } },
  ];
}
/** act-30 (用户：「人物的动画、穿模那些问题必须好好解决一下了，不然看起来太滑稽了」): the people really walk (legs, arms, bob — the
 *  hooks read walkPh), crouch over what they pick at, and the dead and the unconscious do not move at all (their poses are set once
 *  and never updated again) */
type Walker = BattleActor & { walkPh?: number; kneel?: number };
const place = (a: BattleActor, x: number, z: number, yaw: number) => { a.home.set(x, 0, z); a.yaw = yaw; a.root.position.set(x, 0, z); a.root.rotation.y = yaw; };
/** dawn: the snow has stopped; a lean man with a grey donkey picks over the dead (boots, coins) and comes to her */
export function dawnShots(h: PrologueHost, at: { x: number; z: number }, dead: Array<[EKind, number, number]>, out: { duwu: BattleActor | null; donkey: BattleActor | null }): CineShot[] {
  const ox = at.x, oz = at.z;
  let duwu: Walker | null = null, donkey: Walker | null = null; const corpses: Foe[] = [];
  // where he goes: in from the left, a stop (crouched) at each body, then to her
  // (11-18: she kneels now, facing where she fell — he comes to stand a step in front of her, a little to her right where the sabre is,
  //  not into her: the old end point was beside a body lying flat)
  const hy = h.hero.a.yaw, stop: [number, number, number] = [ox + Math.sin(hy) * 1.1 - Math.cos(hy) * 0.3, oz + Math.cos(hy) * 1.1 + Math.sin(hy) * 0.3, 0];
  const way: Array<[number, number, number]> = [[ox - 10, oz + 6, 0], ...dead.slice(0, 2).map(([, x, z]) => [x + 0.8, z + 0.5, 1.7] as [number, number, number]), stop];
  let seg = 0, segT = 0, dwell = 0, crouch = 0, heading = 0;
  const fx = { x: ox - 4, z: oz + 3 };
  const cam = () => { const d = duwu as Walker | null; if (d) { fx.x += ((d.home.x + ox) / 2 - fx.x) * 0.06; fx.z += ((d.home.z + oz) / 2 - fx.z) * 0.06; }
    return camKey({ pos: [fx.x + 5.2, 4.6, fx.z + 6.4] as V, look: [fx.x, 0.6, fx.z] as V, fov: 38 }); };
  const step = (dt: number) => {
    if (!duwu || !donkey) return;
    if (dwell > 0) {
      dwell -= dt; crouch = Math.min(1, crouch + dt * 3); if (dwell < 0.35) crouch = Math.max(0, crouch - dt * 6);
      duwu.walkPh = undefined; donkey.walkPh = undefined; duwu.kneel = crouch; if (dwell <= 0) { duwu.kneel = 0; crouch = 0; }
    } else if (seg < way.length - 1) {
      const [x0, z0] = way[seg], [x1, z1, d1] = way[seg + 1], L = Math.hypot(x1 - x0, z1 - z0), dur = L / 1.25; segT += dt;
      const k = Math.min(1, segT / dur); heading = Math.atan2(x1 - x0, z1 - z0);
      duwu.walkPh = (duwu.walkPh ?? 0) + dt * 7.5; donkey.walkPh = (donkey.walkPh ?? 0) + dt * 6.5; duwu.kneel = 0;
      place(duwu, x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, heading);
      if (k >= 1) { seg++; segT = 0; if (d1 > 0) { dwell = d1; cue('coin', 0.25); } }
    } else { duwu.walkPh = undefined; donkey.walkPh = undefined; duwu.kneel = 0; duwu.yaw = Math.atan2(ox - duwu.home.x, oz - duwu.home.z); }
    // the donkey keeps a pace behind him, on his line
    const bx = duwu.home.x - Math.sin(heading) * 1.9, bz = duwu.home.z - Math.cos(heading) * 1.9;
    place(donkey, donkey.home.x + (bx - donkey.home.x) * Math.min(1, dt * 3), donkey.home.z + (bz - donkey.home.z) * Math.min(1, dt * 3), heading);
    duwu.update(dt); donkey.update(dt);
  };
  return [
    // the yard at dawn, wide: the dead in the snow, her among them; far off a man and a donkey come in
    { dur: 5.5, ease: 'inOut', from: camKey({ pos: [ox + 10, 9.5, oz + 14], look: [ox - 2, 0.2, oz + 1], fov: 40 }), to: camKey({ pos: [ox + 7, 7.5, oz + 11], look: [ox - 2, 0.2, oz + 1.5], fov: 38 }),
      at: [[0, () => {
        // the dead: laid down once, never updated again (no breathing corpses)
        // act-36 (用户：「死人堆，就那么几个，算啥死人堆」): the two he stops at, then the rest of the night's dead — heaps of two and three
        // (bodies thrown across each other), a few alone, all around the yard and up the steps; posed once and baked into a few meshes
        const roots: THREE.Object3D[] = [];
        for (const d of deadField(ox, oz, dead)) {
          const f = h.puppet(d.k, d.x, d.z, d.x + Math.sin(d.yaw), d.z + Math.cos(d.yaw)); f.a.update(0.016); layDead(f.a, d.how, d.r);
          f.a.root.position.set(d.x, d.y, d.z); f.a.root.rotation.y = d.yaw; f.a.root.userData.still = true; roots.push(f.a.root); corpses.push(f);
        }
        const st = currentStage(); if (st) { bakeStill(roots, st.root); for (const r of roots) r.visible = false; }
        duwu = h.person('duwu', way[0][0], way[0][1], 0) as Walker; donkey = h.person('donkey', way[0][0] - 1.9, way[0][1], 0) as Walker; out.duwu = duwu; out.donkey = donkey;
      }]],
      tick: (_t, dt) => { step(dt); h.hero.a.update(dt); h.kneel.frame(h.hero.a); } },
    // closer (medium): he stops, crouches over the bodies, then comes to her
    // (the camera keeps him in frame: it follows a smoothed point between him and her)
    { dur: 9.5, ease: 'linear', from: () => cam(), to: () => cam(),
      tick: (_t, dt) => { step(dt); h.hero.a.update(dt); h.kneel.frame(h.hero.a); } },
  ];
}
/** after his words: he kneels to her, looks round; then (a cut) she lies across the donkey's back and he leads it away */
/** the top of the grey donkey's back (m) */
const DONKEY_BACK = 1.02;
export function loadShots(h: PrologueHost, who: { duwu: BattleActor | null; donkey: BattleActor | null }): CineShot[] {
  const duwu = who.duwu as Walker | null, donkey = who.donkey as Walker | null, p = h.hero.pos.clone();
  let crouch = 0; const dir = Math.atan2(-1, 0.35);   // away to the left, toward the yard's way out
  return [
    { dur: 2.6, ease: 'inOut', from: camKey({ pos: [p.x + 4.2, 2.8, p.z + 4.6], look: [p.x, 0.5, p.z], fov: 34 }),
      at: [[1.0, () => { if (duwu) duwu.yaw += 0.6; }], [1.6, () => { if (duwu) duwu.yaw -= 1.1; }], [2.1, () => cue('land', 0.3)]],
      tick: (_t, dt) => { h.hero.a.update(dt); h.kneel.frame(h.hero.a); if (!duwu) return; crouch = Math.min(1, crouch + dt * 2.5); duwu.kneel = crouch; duwu.walkPh = undefined; duwu.update(dt); donkey?.update(dt); } },
    // she is across the donkey's back now; he leads it off, she rides along limp
    { dur: 5.5, ease: 'linear', from: camKey({ pos: [p.x + 7.5, 5.2, p.z + 8.5], look: [p.x - 2.5, 0.6, p.z + 1.5], fov: 38 }),
      at: [[0, () => {
        h.kneel.stop();
        if (!duwu || !donkey) return;
        place(donkey, p.x - 0.6, p.z + 0.9, dir); place(duwu, p.x - 0.6 + Math.sin(dir) * 1.5, p.z + 0.9 + Math.cos(dir) * 1.5, dir); duwu.kneel = 0;
      }]],
      tick: (t, dt) => {
        if (!duwu || !donkey) return;
        const v = 1.0 * Math.min(1, t * 1.5);
        duwu.walkPh = (duwu.walkPh ?? 0) + dt * 6.5 * Math.min(1, t * 1.5); donkey.walkPh = (donkey.walkPh ?? 0) + dt * 6 * Math.min(1, t * 1.5);
        place(duwu, duwu.home.x + Math.sin(dir) * v * dt, duwu.home.z + Math.cos(dir) * v * dt, dir);
        place(donkey, donkey.home.x + Math.sin(dir) * v * dt, donkey.home.z + Math.cos(dir) * v * dt, dir);
        // her: slung across its back, limp, swinging with its stride (act-40)
        drapeOver(h.hero.a, donkey.home.x, DONKEY_BACK, donkey.home.z, dir, donkey.walkPh ?? 0);
        duwu.update(dt); donkey.update(dt);
      } },
  ];
}
/** snow in the air for the snow shots (the room's weather does it in play; the cutscenes add a little more near the camera) */
export function snowPuff(p: THREE.Vector3) { fxSmoke(p.clone().setY(0.2), 0xe8eef8, 2, { r: 0.4, spd: 0.4, up: 0.3, s: 0.3, life: 0.8, alpha: 0.4 }); fxGlow(p, 0xffffff, 0.3, 0.2, 0.5); fxSparks(p, 0xffffff, 2, 1); }
