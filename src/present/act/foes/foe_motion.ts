import { Euler, Mesh, Quaternion, Vector3 } from 'three';
import { curve, mov, rot, snap, type Action, type Bone } from '../../actors/rig';
import type { BattleActor } from '../../bestiary/battle';
import { MOTION_TUNE } from '../motionTune';
/** the long-robed (a skirt to the ground on the hips): they walk in short, low steps under the hem */
export const ROBED = new Set(['hj_taoist', 'hj_taoist_e', 'xp_frost', 'xp_frost_e', 'cx_zhu', 'cx_zhu_e', 'cx_boss', 'wl_boss', 'xp_boss']);

type Bones = Record<string, Bone>;
const TAU = Math.PI * 2;
const SIDES = ['L', 'R'] as const;
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (x: number) => { const u = clamp(x); return u * u * (3 - 2 * u); };
const wrap = (x: number) => x - Math.floor(x);
export const angleDelta = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

const target = new Vector3(), pelvisInverse = new Quaternion(), joint = new Quaternion(), euler = new Euler();
const toe = new Quaternion();

function strideFoot(u: number, duty: number, stride: number, lift: number) {
  const swing = clamp((u - duty) / (1 - duty));
  const advance = smooth(swing);
  const clearance = lift * Math.sin(Math.PI * swing) ** 2;
  const toeRoom = clearance / 0.24;
  return {
    planted: u <= duty,
    travel: stride * (duty / 2 - u + advance),
    lift: clearance,
    pitch: clamp(0.25 * Math.sin(TAU * swing) * Math.sin(Math.PI * swing), -toeRoom, toeRoom),
  };
}

function aimLeg(b: Bones, side: typeof SIDES[number], x: number, y: number, z: number, pitch: number, weight: number) {
  const leg = b['leg' + side], shin = b['shin' + side], foot = b['foot' + side];
  target.set(x, y, z).sub(b.hips.position).applyQuaternion(pelvisInverse).sub(leg.position);
  const upper = -shin.rest!.p.y, lower = -foot.rest!.p.y;
  const reach = Math.min(upper + lower, target.length());
  const knee = Math.acos(clamp((reach ** 2 - upper ** 2 - lower ** 2) / (2 * upper * lower), -1, 1));
  const roll = Math.atan2(target.x, -target.y);
  const swing = Math.atan2(-target.z, Math.hypot(target.x, target.y))
    - Math.atan2(lower * Math.sin(knee), upper + lower * Math.cos(knee));
  leg.quaternion.slerp(joint.setFromEuler(euler.set(swing, 0, roll, 'ZXY')), weight);
  shin.quaternion.slerp(joint.setFromEuler(euler.set(knee, 0, 0)), weight);
  toe.copy(b.hips.quaternion).multiply(leg.quaternion).multiply(shin.quaternion).invert();
  toe.multiply(joint.setFromEuler(euler.set(pitch, 0, 0)));
  foot.quaternion.slerp(toe, weight);
}

/** Distance advances the stance target by exactly the distance the actor traveled. */
export class FoeGait {
  phase: number;
  speed = 0;
  armSwing = 0;
  private readonly tempo: number;
  private lastX: number;
  private lastZ: number;
  private lastYaw: number;
  private heading: number;
  private turn = 0;
  private settle = 0;
  private stopping = false;
  /** the velocity over the ground, smoothed as a vector (a body pushed back and forth between a crate and its neighbours cancels out) */
  private vx = 0; private vz = 0; private jostle = 0;

  constructor(a: BattleActor) {
    this.phase = wrap(a.t * 0.731);
    this.speed = a.moveSpeed ?? 0;
    this.tempo = mix(0.92, 1.08, wrap(a.t * 1.357));
    this.lastX = a.home.x;
    this.lastZ = a.home.z;
    this.heading = this.lastYaw = a.yaw;
  }

  pose(a: BattleActor, dt: number, active: boolean) {
    const dx = a.home.x - this.lastX, dz = a.home.z - this.lastZ;
    const distance = Math.hypot(dx, dz), dyaw = angleDelta(a.yaw - this.lastYaw);
    this.lastX = a.home.x; this.lastZ = a.home.z; this.lastYaw = a.yaw;
    // (11-19 用户：「敌人经常会被卡在场景可破坏建筑里原地跑」: measured frame by frame, a foe jostled between a prop and the crowd —
    //  pushed in, pushed out, a few cm each frame — read as walking at a good pace and ran on the spot. The velocity is also smoothed as
    //  a vector over ~0.12 s: where back-and-forth cancels out (the smoothed speed far below the frame's), it is jostling, not a walk.
    //  A real walk keeps the frame's own distance, so the stride stays locked to the ground it covers and the planted foot holds)
    // (jostling = this frame's step runs against the smoothed motion — a push back out after a push in; a walk starting from a stand,
    //  every step the same way, is never taken for it)
    const raw = dt > 0 ? distance / dt : 0, against = raw > 0.3 && dt > 0 && (dx * this.vx + dz * this.vz) / dt < -0.25 * raw * Math.hypot(this.vx, this.vz);
    this.jostle = Math.max(0, Math.min(1, this.jostle + (against ? dt * 6 : -dt * 3)));
    if (dt > 0 && raw < 12) { const f = 1 - Math.exp(-dt / 0.12); this.vx += (dx / dt - this.vx) * f; this.vz += (dz / dt - this.vz) * f; }
    const measured = this.jostle > 0.3 ? Math.hypot(this.vx, this.vz) : raw;
    // Warps are not steps. Reported speed also supports actors on a treadmill.
    const moving = measured > 0.015 && measured < (a.act?.name === 'ramRun' ? 26 : 12);
    if (moving) this.heading = Math.atan2(dx, dz);
    else if (dt > 0) this.heading += angleDelta(a.yaw - this.heading) * (1 - Math.exp(-dt / 0.09));
    // (11-19 用户：「敌人经常会被卡在场景可破坏建筑里原地跑」: a foe knocked into a crate / cover is stopped there with its knock-back
    //  speed still reported — the legs ran at that speed on the spot. Standing still, the reported speed counts only while it is asked to
    //  run (the preview page's and the lab's treadmill); otherwise the legs follow where it actually goes)
    const targetSpeed = active ? (moving ? measured : a.running ? a.moveSpeed ?? 3 : a.moveSpeed === undefined ? a.walkK * 1.5 : 0) : 0;
    const old = this.speed, filter = 1 - Math.exp(-dt / 0.075);
    this.speed += (targetSpeed - old) * filter;
    this.turn += ((dt > 0 ? dyaw / dt : 0) - this.turn) * filter;
    const acceleration = dt > 0 ? (this.speed - old) / dt : 0;
    const weight = smooth(this.speed / 0.65);
    this.armSwing = 0;
    if (!active || weight < 0.0001) return;
    if (targetSpeed < 0.08 && old > 0.28 && !this.stopping) this.settle = 0.15;
    this.stopping = targetSpeed < 0.08;
    const settle = Math.sin(Math.PI * this.settle / 0.15);
    this.settle = Math.max(0, this.settle - dt);
    if (a.def.kind === 'quad') {
      this.hound(a.bones, targetSpeed, dt, weight);
      return;
    }
    this.biped(a, targetSpeed, dt, weight, acceleration, settle);
  }

  private biped(a: BattleActor, speed: number, dt: number, weight: number, acceleration: number, settle: number) {
    const b = a.bones, hips = b.hips, stand = hips.rest!.p.y;
    const upper = -b.shinL.rest!.p.y, lower = -b.footL.rest!.p.y, length = upper + lower;
    const run = smooth((this.speed - 2) / 1.2), duty = mix(0.52, 0.45, run);
    const scale = Math.max(0.01, a.root.scale.x);
    // (11-18 用户：「道士走路脚会穿帮漏出来」: a robe to the ground hides the legs — its feet take short, quick, low steps that stay
    //  under the hem, the hips hardly turn)
    //  (the steps keep a walking rhythm — a tiny stride would patter — but the feet swing less than a fifth as far, so the shoes stay at the
    //  hem; they slide a little, under the robe where nobody sees)
    const robe = ROBED.has(a.def.id) ? 1 : 0;
    const stride = stand * mix(1.6, 2.4, run) * this.tempo * mix(1, 0.7, robe), reach = stride * mix(1, 0.18, robe);
    this.phase = wrap(this.phase + speed * dt / (stride * scale));
    const lift = stand * mix(0.035, 0.14, run) * mix(1, 0.25, robe);
    const left = strideFoot(this.phase, duty, reach, lift);
    const right = strideFoot(wrap(this.phase + 0.5), duty, reach, lift);
    const flight = duty < 0.5 ? 0.018 * run * Math.sin(Math.PI * clamp((this.phase % 0.5 - duty) / (0.5 - duty))) : 0;
    left.lift += flight;
    right.lift += flight;
    const twist = Math.cos(this.phase * TAU);
    const stepLat = Math.sin(this.phase * TAU);
    const heading = angleDelta(this.heading - a.yaw);
    const across = Math.sin(heading), forward = Math.cos(heading);
    // Robed foes have short hidden steps under the hem, so supply real step weight-shift (hip roll, yaw & vertical bob)
    // to keep every walk/run grounded with tangible footfalls instead of gliding like a ghost.
    const robeRoll = robe * 0.048 * stepLat * weight;
    rot(hips, robe * 0.025 * Math.sin(this.phase * TAU * 2) * weight, 0.10 * twist * weight * mix(1, 0.78, robe),
      clamp(-this.turn * this.speed * 0.015, -0.12, 0.12) * weight + robeRoll);

    // Solve hip height from the longest reach each ankle needs. Near mid-stance the
    // support leg extends. At transfer the two splayed legs draw the pelvis down.
    const robeBob = robe * mix(0.024, 0.040, run) * (Math.abs(stepLat) - 0.5) * weight;
    let hipY = stand + 0.018 * run * Math.abs(stepLat) + robeBob;
    for (const side of SIDES) {
      const foot = side === 'L' ? left : right;
      if (!foot.planted && (left.planted || right.planted)) continue;
      target.copy(b['leg' + side].position).applyQuaternion(hips.quaternion);
      const planted = b['leg' + side].rest!.p;
      const horizontal = Math.hypot(planted.x + across * foot.travel - target.x, forward * foot.travel - target.z);
      const reach = Math.sqrt(Math.max(0, (length * 0.999) ** 2 - horizontal ** 2));
      hipY = Math.min(hipY, stand - length + foot.lift + reach + planted.y - target.y + robeBob);
    }
    const crouch = a.act?.name === 'stalk' ? 0.06 : a.act?.name === 'flee' ? 0.026 : 0;
    hips.position.x = mix(hips.position.x, hips.rest!.p.x + robe * 0.020 * stepLat * weight, weight);
    hips.position.y = mix(hips.position.y, hipY - 0.025 * settle - crouch, weight);
    pelvisInverse.copy(hips.quaternion).invert();
    aimLeg(b, 'L', b.legL.rest!.p.x + across * left.travel, stand - length + b.legL.rest!.p.y + left.lift, left.travel * forward, left.pitch, weight);
    aimLeg(b, 'R', b.legR.rest!.p.x + across * right.travel, stand - length + b.legR.rest!.p.y + right.lift, right.travel * forward, right.pitch, weight);

    const swing = twist * weight;
    this.armSwing = swing;
    rot(b.spine, (mix(0.02, 0.18, run) + clamp(acceleration * 0.012, -0.10, 0.13)) * weight, 0, 0);
    rot(b.chest, 0.08 * run * weight, -0.14 * twist * weight, 0);
    rot(b.neck, 0, 0.04 * twist * weight, 0);
    const shield = a.def.id.includes('shield') || a.def.id.startsWith('cx_guard');
    const leftGrip = shield ? 0.25 : b.offhand?.children.length ? 0.4 : 1;
    const rightGrip = b.weapon?.children.length ? 0.4 : 1;
    const pump = mix(0.35, 0.61, run);
    rot(b.armL, pump * swing * leftGrip, 0, 0); rot(b.armR, -pump * swing * rightGrip, 0, 0);
    rot(b.foreL, -0.8 * run * weight * leftGrip, 0, 0); rot(b.foreR, -0.8 * run * weight * rightGrip, 0, 0);
  }

  private hound(b: Bones, speed: number, dt: number, weight: number) {
    const bound = smooth((this.speed - 3.15) / 0.7);
    const stride = (b.hips.rest?.p.y ?? 0.6) * mix(2.0, 3.0, bound) * this.tempo;
    this.phase = wrap(this.phase + speed * dt / stride);
    const p = this.phase * TAU, flex = Math.sin(p);
    rot(b.chest, 0.23 * flex * bound * weight, 0.05 * Math.sin(p * 2) * weight, 0);
    rot(b.hips, -0.13 * flex * bound * weight, 0, 0);
    mov(b.hips, 0, (0.025 * Math.abs(flex) + 0.065 * bound * Math.max(0, -flex)) * weight, 0);
    rot(b.neck, (-0.04 * Math.cos(p * 2) - 0.12 * flex * bound) * weight, 0, 0);
    rot(b.head, 0.09 * Math.sin(p - 0.55) * bound * weight, 0, 0);
    rot(b.tail, 0.13 * Math.sin(p - 0.65) * weight, 0, 0);
    rot(b.tail2, 0.17 * Math.sin(p - 1.2) * weight, 0, 0);
    for (const [name, trot, gallop] of [['legFL', 0, 0], ['legFR', 0.5, 0.07], ['legBL', 0.5, 0.48], ['legBR', 0, 0.55]] as const) {
      const u = wrap(this.phase + mix(trot, gallop, bound));
      const step = strideFoot(u, mix(0.55, 0.43, bound), stride, 0.13);
      const leg = b[name];
      const reach = Math.max(0.13, (leg?.rest?.p.y ?? -0.1) + (b.hips.rest?.p.y ?? 0.6));
      rot(leg, -Math.atan2(step.travel, reach - step.lift) * weight, 0, 0);
    }
  }
}

/** Pose only. Offsets are in seconds so the hip/chest lead survives different elite timings. */
export function attackBeats(a: Action, heavy = false, impact = a.at, overshoot = 0.15) {
  const ov = overshoot * MOTION_TUNE.overshoot;
  const time = a.t, end = a.dur, at = end * impact;
  const launch = Math.max(at * 0.62, at - (heavy ? 0.13 : 0.095));
  const fast = Math.max(launch, at - 0.028);
  const peak = at + Math.min(0.08, (end - at) * 0.24);
  const damp = peak + (end - peak) * 0.30;
  const reach = (t: number) => {
    if (t < fast) {
      const u = clamp((t - launch) / Math.max(0.001, fast - launch));
      // Tighter coil-hold then faster acceleration into the 2–3 frame whip burst
      return 0.5 * (u * u * u * (2 - u));
    }
    if (t < at) return snap(t, [[fast, 0.5], [at, 1]]);
    if (t === at) return 1;
    if (t >= end) return 0;
    if (t < peak) return mix(1, 1 + ov, smooth((t - at) / (peak - at)));
    if (t < damp) {
      // Overshoot settles with a crisp elastic pull-back
      const u = smooth((t - peak) / (damp - peak));
      return mix(1 + ov, 0.72, u);
    }
    return 0.72 * (1 - smooth((t - damp) / (end - damp))) ** 2;
  };
  const load = curve(time, [[0, 0], [launch * (heavy ? 0.56 : 0.82), 1], [launch, 1], [at, 0], [end, 0]]);
  const dip = curve(time, [[0, 0], [launch * 0.25, 1], [launch * 0.70, 0], [end, 0]]);
  const lead = Math.min(0.04, launch * 0.35) * smooth(time / Math.max(0.001, launch * 0.7)) * MOTION_TUNE.waveLead;
  const late = 0.036 * (1 - smooth((time - damp) / Math.max(0.001, end - damp))) * MOTION_TUNE.waveLead;
  const kick = curve(time, [[at, 0], [at + Math.min(0.035, (end - at) * 0.25), 1], [damp, 0], [end, 0]]);
  // Brief high-frequency impact micro-shudder right after strike contact (0 before at, decays in ~75ms)
  const post = time - at;
  const shudder = post > 0 && post < 0.095 ? Math.sin(post * 115) * Math.exp(-post * 30) * (heavy ? 1 : 0.6) * MOTION_TUNE.shudder : 0;
  return {
    load, dip, hit: reach(time), hip: reach(time + lead * 2), chest: reach(time + lead), late: reach(time - late), kick, shudder,
    tremble: heavy ? Math.sin(time * 65) * 0.032 * smooth((load - 0.80) / 0.20) : 0,
  };
}

export function attackBody(b: Bones, beats: ReturnType<typeof attackBeats>, style: 'melee' | 'ranged' | 'cast' = 'melee', weight = 1) {
  const { load, dip, hip, chest, late, kick, tremble, shudder } = beats;
  const melee = style === 'melee', ranged = style === 'ranged';
  const turn = melee ? 1 : 0.35;
  // Clear coil sink & staggered hip -> chest twist with automatic neck gaze counter-rotation
  mov(b.hips, 0, -weight * (0.045 * dip + 0.034 * load + (melee ? 0.049 : 0.012) * hip), -0.048 * dip * weight);
  const hipYaw = turn * weight * (-0.16 * load + 0.20 * hip);
  const chestYaw = turn * weight * (-0.11 * load + 0.14 * chest);
  rot(b.hips, 0, hipYaw, 0.050 * (load - hip) * weight);
  rot(b.chest, weight * (0.10 * dip + (ranged ? -0.13 * kick : 0.11 * chest) + tremble + 0.022 * shudder), chestYaw, 0);
  const gazeY = clamp(-(hipYaw + chestYaw) * 0.72 * MOTION_TUNE.gazeLock + 0.05 * (load - late) * weight, -0.58, 0.58);
  rot(b.neck, -0.095 * late * weight - 0.018 * shudder, gazeY, 0);
  rot(b.shL, tremble, 0, style === 'cast' ? -0.14 * load * weight : 0);
  rot(b.shR, -tremble, 0, style === 'cast' ? 0.14 * load * weight : 0);
  rot(b.legR, 0.16 * dip * weight, 0, 0);
  rot(b.shinR, 0.27 * dip * weight, 0, 0);
}

export function poseFoeHurt(b: Bones, off: Vector3, a: Action, from: number, variant: number, robed = false) {
  const power = clamp(Number(a.data.power) || 1, 0.1, 1.7);
  const top = Math.min(0.060, a.dur * 0.13), held = top + Math.min(0.042, a.dur * 0.15);
  // Core impact hits immediately; head/neck/arms lag ~32ms behind (whiplash) with damped rebound
  const core = power * curve(a.t, [[0, 0], [top, 1], [held, 1], [a.dur * 0.74, -0.16], [a.dur, 0]]);
  const whipT = Math.max(0, a.t - 0.032 * MOTION_TUNE.hurtWhip);
  const whip = power * curve(whipT, [[0, 0], [top * 1.1, 1.12], [held * 1.15, 1.05], [a.dur * 0.78, -0.18], [a.dur, 0]]) * (0.3 + 0.7 * MOTION_TUNE.hurtWhip);
  const x = -Math.sin(from), z = -Math.cos(from);
  const heavy = smooth((power - 1.05) / 0.55);
  const step = heavy * curve(a.k, [[0, 0], [0.18, 0.96], [0.42, 1], [0.62, 0.68], [1, 0]]);
  const stumble = step * Math.sin(a.k * TAU * 1.4 + 0.7);
  const bias = (variant - 1) * 0.08;
  off.x += x * (0.18 * core + 0.11 * step);
  off.z += z * (0.23 * core + 0.13 * step);
  mov(b.hips, 0, -0.09 * step, 0);
  rot(b.hips, 0.14 * z * core, 0.14 * x * core, -0.13 * x * core);
  rot(b.spine, (0.26 * z + bias) * core, 0, -0.14 * x * core);
  rot(b.chest, 0.16 * z * core, (0.43 * x + bias) * core, -0.18 * x * core);
  rot(b.body, 0.19 * z * core, 0, -0.22 * x * core);
  // Neck, head & arms trail slightly behind torso impact for genuine kinetic whiplash
  rot(b.neck, 0.21 * z * whip, 0.15 * x * whip, -0.12 * x * whip);
  rot(b.head, 0.14 * z * whip, 0.10 * x * whip, -0.13 * x * whip);
  rot(b.jaw, 0.32 * Math.max(0, whip), 0, 0);
  rot(b.armL, (-0.26 + 2 * bias) * whip, 0, (0.31 + bias) * whip);
  rot(b.armR, (-0.22 - 2 * bias) * whip, 0, (-0.28 + bias) * whip);
  // Robed foes keep feet tucked under the hem even during heavy hit stagger
  const legK = robed ? 0.18 : 1;
  rot(b.legL, -0.22 * z * step * legK, 0, -0.14 * x * step * legK); rot(b.shinL, (0.34 * step + 0.12 * stumble) * legK, 0, 0);
  rot(b.legR, 0.38 * z * step * legK, 0, -0.22 * x * step * legK); rot(b.shinR, (0.26 * step - 0.12 * stumble) * legK, 0, 0);
}

export function poseFoeFall(b: Bones, off: Vector3, kind: string, from: number, k: number, collapse: boolean) {
  const buckle = curve(k, [[0, 0], [0.19, 1], [0.45, 0.85], [0.82, 0.43], [1, 0.36]]);
  const tip = curve(k, [[0, 0], [0.21, 0.06], [0.64, 1], [1, 1]]);
  const bounce = curve(k, [[0.64, 0], [0.71, 1], [0.79, 0], [0.86, 0.24], [0.93, 0], [1, 0]]);
  const settle = curve(k, [[0.27, 0], [0.65, 1], [0.75, 0.73], [0.9, 0.86], [1, 0.84]]);
  const x = -Math.sin(from), z = -Math.cos(from);
  const quad = kind === 'quad', ground = b.hips?.rest?.p.y ?? 0.6;
  off.x += 0.29 * tip * x; off.z += 0.29 * tip * z;
  mov(b.hips, 0, -(quad ? 0.55 : 0.66) * ground * tip - ground * 0.16 * buckle + 0.06 * bounce, 0);
  rot(b.hips, (quad ? 0.4 : 1.43) * z * tip, 0.15 * x * tip, (quad ? (x >= 0 ? -1.42 : 1.42) : -1.43 * x) * tip);
  rot(b.spine, (collapse ? 0.42 : 0.19) * buckle + 0.14 * z * settle, 0, -0.18 * x * buckle);
  rot(b.chest, 0.12 * buckle + 0.11 * bounce, 0.19 * x * settle, 0);
  rot(b.neck, -0.23 * buckle + 0.28 * z * settle, 0, -0.18 * x * settle); rot(b.jaw, 0.31 * settle, 0, 0);
  rot(b.legL, -0.45 * buckle, 0, 0.10 * settle); rot(b.shinL, 0.97 * buckle, 0, 0);
  rot(b.legR, -0.57 * buckle + 0.23 * settle, 0, -0.13 * settle); rot(b.shinR, 1.14 * buckle, 0, 0);
  rot(b.armL, -0.3 * buckle - 0.35 * settle, 0, 0.69 * settle);
  rot(b.armR, -0.25 * buckle - 0.17 * settle, 0, -0.75 * settle);
  rot(b.legFL, -0.68 * buckle, 0, 0); rot(b.legFR, -0.60 * buckle, 0, 0);
  rot(b.legBL, 0.55 * buckle, 0, 0); rot(b.legBR, 0.64 * buckle, 0, 0);
}

export function poseFoeIdle(a: BattleActor, speed: number) {
  const b = a.bones, t = a.t, weight = 1 - smooth(speed / 0.65);
  const sway = Math.sin(t * 1.18) * 0.78 + Math.sin(t * 0.53 + 0.8) * 0.22;
  // Asymmetric breathing: slightly brisker inhale (42%), slower settling exhale (58%)
  const bu = ((t / 3.05) % 1 + 1) % 1;
  const breath = (bu < 0.42 ? Math.sin((bu / 0.42) * Math.PI * 0.5) ** 1.3 * 2 - 1 : Math.cos(((bu - 0.42) / 0.58) * Math.PI)) * MOTION_TUNE.idleBreath;
  const glance = smooth((Math.sin(t * 0.91 + 1.1) - 0.24) / 0.58);
  const facing = a.lookYaw === undefined ? Math.sin(t * 0.9) * 0.28 : clamp(angleDelta(a.lookYaw - a.yaw), -0.60, 0.60);
  mov(b.hips, sway * 0.021 * weight, -0.009 * Math.abs(sway) * weight, 0);
  rot(b.hips, 0, 0.028 * sway * weight, 0.038 * sway * weight);
  rot(b.chest, 0.038 * breath * weight, -0.025 * sway * weight, 0);
  const robeK = ROBED.has(a.def.id) ? 0.2 : 1;
  rot(b.legL, -0.092 * Math.max(0, sway) * weight * robeK, 0, 0);
  rot(b.shinL, 0.18 * Math.max(0, sway) * weight * robeK, 0, 0);
  rot(b.legR, -0.092 * Math.max(0, -sway) * weight * robeK, 0, 0);
  rot(b.shinR, 0.18 * Math.max(0, -sway) * weight * robeK, 0, 0);
  rot(b.neck, -0.018 * breath * weight, facing * glance * weight, 0.038 * sway * weight);
  rot(b.handR, 0.026 * breath * weight, 0.024 * sway * weight, 0);

  const fidget = smooth((Math.sin(t * 0.67 - 0.7) - 0.65) / 0.35) * weight;
  if (a.def.id.startsWith('hj_mob') || a.def.id.startsWith('ly_looter')) {
    rot(b.head, 0.075 * fidget, 0.31 * Math.sin(t * 4.9) * fidget, 0);
  } else if (a.def.attack === 'slam') {
    rot(b.shL, 0.13 * fidget, 0, -0.13 * fidget); rot(b.shR, -0.12 * fidget, 0, 0.11 * fidget);
    mov(b.shL, 0, 0.032 * fidget, 0); mov(b.shR, 0, 0.025 * fidget, 0);
  } else if (a.def.bowL) {
    rot(b.armL, -0.15 * fidget, 0, 0); rot(b.foreR, -0.13 * Math.sin(t * 5.2) * fidget, 0, 0);
    rot(b.handR, 0, 0.12 * fidget, 0);
  }
}

class Lag {
  value = 0;
  velocity = 0;

  step(target: number, dt: number, rate: number) {
    if (dt <= 0) return this.value;
    const h = Math.min(0.05, dt);
    const offset = this.value - target, drift = this.velocity + rate * offset;
    const decay = Math.exp(-h * rate);
    this.value = target + (offset + drift * h) * decay;
    this.velocity = (this.velocity - rate * drift * h) * decay;
    return this.value;
  }

  /** Underdamped 2nd-order elastic spring for natural cloth/robe/pendant overshoot & gentle settle */
  spring(target: number, dt: number, stiff: number, zeta = 0.60) {
    if (dt <= 0) return this.value;
    const h0 = Math.min(0.05, dt), sub = h0 > 0.02 ? 2 : 1, h = h0 / sub;
    const damp = 2 * zeta * Math.sqrt(stiff);
    for (let i = 0; i < sub; i++) {
      this.velocity += ((target - this.value) * stiff - this.velocity * damp) * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}

interface TailLink { bone: Bone; x: Lag; z: Lag }
interface TailChain { links: TailLink[]; phase: number }
interface RobeLink { bone: Bone; x: Lag; y: Lag; z: Lag }
interface PendLink { bone: Bone; x: Lag; z: Lag; phase: number; front: boolean }
const _fDown = new Vector3(0, -1, 0), _fPos = new Vector3(), _fVel = new Vector3();
const _fWant = new Vector3(), _fLoc = new Vector3(), _fQ = new Quaternion(), _fQi = new Quaternion();
const _shDir = new Vector3(), _shQ = new Quaternion(), _shTgt = new Quaternion(), _shDel = new Quaternion(), _shEul = new Euler();
const _lwTwist = new Quaternion(), _lwSwing = new Quaternion(), _lwInv = new Quaternion();
const _lwHandSwing = new Quaternion(), _lwHand = new Quaternion(), _lwProp = new Quaternion();

/** Universal Swing-Twist anatomical wrist limiter (runs on both armed and supporting/empty hands):
 *  prevents 100–165° wrist snapping while preserving exact world weapon orientation & tip alignment. */
export function limitAnatomicalWrist(hand: Bone | undefined, prop: Bone | undefined, maxBend = 0.96) {
  if (!hand) return;
  const hasProp = !!(prop && prop.children.length);
  // Bow string-draw hand (empty `weapon` bone) anchors nock at `handR` rest offset — leave unshifted!
  if (!hasProp && prop?.name === 'weapon') return;
  // Skip manually offset props (like wl_xbow kneeling string draw), but NEVER skip props only shifted by an earlier wrist-limit pass!
  if (hasProp && !prop!.userData?._wShifted && prop!.rest && prop!.position.distanceToSquared(prop!.rest.p) > 1e-6) return;
  const limit = hasProp ? maxBend : Math.min(maxBend, 0.88);
  const qFull = hand.quaternion;
  const lenT = Math.hypot(qFull.y, qFull.w);
  if (lenT > 1e-5) _lwTwist.set(0, qFull.y / lenT, 0, qFull.w / lenT);
  else _lwTwist.identity();
  _lwSwing.copy(qFull).multiply(_lwInv.copy(_lwTwist).invert());
  if (_lwSwing.w < 0) _lwSwing.set(-_lwSwing.x, -_lwSwing.y, -_lwSwing.z, -_lwSwing.w);
  const swingAng = 2 * Math.acos(Math.min(1, _lwSwing.w));
  if (swingAng > limit) {
    const s = Math.sin(limit * 0.5) / Math.max(1e-6, Math.sin(swingAng * 0.5));
    _lwHandSwing.set(_lwSwing.x * s, _lwSwing.y * s, _lwSwing.z * s, Math.cos(limit * 0.5)).normalize();
    _lwHand.copy(_lwHandSwing).multiply(_lwTwist);
    if (prop) {
      _lwProp.copy(_wInvQ(_lwHand)).multiply(qFull);
      hand.quaternion.copy(_lwHand);
      prop.quaternion.premultiply(_lwProp);
      prop.position.applyQuaternion(_lwProp);
      prop.userData._wShifted = true;
    } else {
      hand.quaternion.copy(_lwHand);
    }
  }
}
function _wInvQ(q: Quaternion) { return _lwInv.copy(q).invert(); }

/** Per-actor spring physics tracks torso, pauldrons, armor skirts, capes, articulated robes (robe1..3),
 *  turban tails (scA/scB), waist pendants/gourds, gravity sword tassels and weapon follow-through. */
export class FoeAccessories {
  private readonly cloth = new Lag();
  private readonly turn = new Lag();
  private readonly tip = new Lag();
  private readonly speedLag = new Lag();
  private readonly capeX = new Lag();
  private readonly capeZ = new Lag();
  private readonly skirtX = new Lag();
  private readonly skirtZ = new Lag();
  private readonly shHasMesh: { L: boolean; R: boolean };
  private readonly hasCapeMesh: boolean;
  private readonly ribbons: Bone[];
  private readonly chains: TailChain[] = [];
  private readonly robe: RobeLink[] = [];
  private readonly pendants: PendLink[] = [];
  private readonly swTassel: Bone | undefined;
  private tasselDir = new Vector3(0, -1, 0);
  private tasselVel = new Vector3();
  private lastTasselPos?: Vector3;
  private readonly tips: Bone[];
  private readonly rigidTip: Bone | undefined;
  private lastYaw?: number;
  private lastX?: number;
  private lastZ?: number;
  private lastSp = 0;

  constructor(a: BattleActor) {
    const b = a.bones;
    const hasMesh = (bone?: Bone) => !!bone && bone.children.some(c => c instanceof Mesh);
    this.shHasMesh = { L: hasMesh(b.shL), R: hasMesh(b.shR) };
    this.hasCapeMesh = hasMesh(b.cape);
    this.ribbons = Object.values(b).filter(bone => /^(?:topknot|knot|ribbon|tassel)/i.test(bone.name));
    // Collect articulated cloth / Yellow Turban tail chains (scA1..3, scB1..2, clA1..2, tlA1..2)
    const prefixes: Array<[string, number]> = [['scA', 0.4], ['scB', 2.3], ['clA', 1.1], ['tlA', 1.8]];
    for (const [pre, phase] of prefixes) {
      const links: TailLink[] = [];
      for (let i = 1; i <= 4; i++) {
        const bone = b[pre + i];
        if (!bone) break;
        links.push({ bone, x: new Lag(), z: new Lag() });
      }
      if (links.length) this.chains.push({ links, phase });
    }
    // Collect articulated long-robe tiers (robe1 -> robe2 [-> robe3]) on robed foes
    for (let i = 1; i <= 3; i++) {
      const bone = b['robe' + i];
      if (!bone) break;
      this.robe.push({ bone, x: new Lag(), y: new Lag(), z: new Lag() });
    }
    // Collect articulated waist pendants / talismans / gourds (pendL, pendR, gourd)
    for (const [name, phase, front] of [['pendL', 0.3, true], ['pendR', 1.7, true], ['gourd', 2.4, false]] as const) {
      if (b[name]) this.pendants.push({ bone: b[name], x: new Lag(), z: new Lag(), phase, front });
    }
    this.swTassel = b.swTassel;
    this.tips = ['blade', 'weaponTip', 'chain3', 'chain4', 'chain5'].map(name => b[name]).filter(Boolean);
    const twoHanded = /^(ly_(halberd|rider|xbow|boss)|wl_(spear|xbow)|cx_club)/.test(a.def.id);
    if (!twoHanded && (a.def.tip ?? 0) >= 25 && !b.blade) this.rigidTip = b.weapon;
  }

  pose(a: BattleActor, dt: number) {
    const b = a.bones;
    const hdt = Math.min(0.05, Math.max(0, dt));
    const hipPitch = clamp(b.hips?.rotation.x ?? 0, -0.6, 0.6);
    const pitch = clamp((b.spine?.rotation.x ?? 0) + (b.chest?.rotation.x ?? 0) + 0.6 * a.off.z, -0.7, 0.7);
    const headPitch = pitch + (b.neck?.rotation.x ?? 0) + (b.head?.rotation.x ?? 0);
    const twist = (b.hips?.rotation.y ?? 0) + (b.spine?.rotation.y ?? 0) + (b.chest?.rotation.y ?? 0);
    const yawRate = this.lastYaw === undefined || hdt <= 0 ? 0 : angleDelta(a.yaw - this.lastYaw) / hdt;
    this.lastYaw = a.yaw;
    let moveSp = a.running ? (a.moveSpeed ?? 3) : 0;
    if (this.lastX !== undefined && this.lastZ !== undefined && hdt > 0) {
      const dist = Math.hypot(a.home.x - this.lastX, a.home.z - this.lastZ);
      const raw = dist / hdt;
      if (raw < 16) moveSp = Math.max(moveSp, raw);
    }
    this.lastX = a.home.x; this.lastZ = a.home.z;
    const sp = this.speedLag.step(clamp(moveSp / 4.2, 0, 1.35), hdt, 11);
    const acc = hdt > 0 ? clamp((sp - this.lastSp) / hdt, -8, 8) : 0;
    this.lastSp = sp;
    const cloth = this.cloth.step(pitch, hdt, 14) - pitch;
    const roll = this.turn.step(clamp(twist + 0.03 * yawRate, -0.75, 0.75), hdt, 11);
    const rs = MOTION_TUNE.ribbonSpring;
    rot(b.hat, 0.13 * cloth, -0.10 * roll, 0.11 * roll);
    if (b.cape) {
      if (this.hasCapeMesh && !a.def.id.startsWith('ly_looter')) {
        // Elastic 2nd-order war-cape / officer cloak: streams back on movement & attack bursts, whips laterally on turns/twists,
        // strictly clamped >= 0.02 so capes NEVER clip forward into armored backs!
        const t = a.t;
        const atkBurst = a.act && a.act.name !== 'hurt' && a.act.name !== 'fall'
          ? 0.24 * clamp(Math.abs(twist) + Math.abs(cloth) * 2.4, 0, 1.2) : 0;
        const strideBob = Math.sin(a.stridePhase * TAU * 2) * 0.055 * clamp(sp, 0, 1);
        const breeze = 0.032 + 0.024 * Math.sin(t * 2.5) + 0.018 * Math.sin(t * 5.3 + 0.9);
        const targetX = clamp((0.06 + 0.54 * sp + 0.045 * Math.max(0, acc) + atkBurst + strideBob + breeze) * rs - pitch * 0.55 - 0.35 * cloth, 0.02, 1.05);
        const targetZ = clamp((-0.42 * roll - 0.10 * clamp(yawRate * 0.14, -1, 1) + Math.sin(t * (2.6 + 2.0 * sp) + 1.1) * (0.025 + 0.055 * sp)) * rs, -0.52, 0.52);
        const cx = this.capeX.spring(targetX, hdt, 44, 0.54);
        const cz = this.capeZ.spring(targetZ, hdt, 38, 0.52);
        rot(b.cape, Math.max(0.02, cx), -0.26 * roll * rs, cz);
      } else {
        rot(b.cape, -0.47 * cloth + 0.28 * sp * rs, -0.34 * roll * rs, 0.20 * roll * rs);
      }
    }
    // Articulated heavy lamellar war-skirt (e.g. ly_boss armorSkirt): opens dynamically ahead of striding/kicking thighs + twist lag!
    if (b.armorSkirt) {
      const legFwd = Math.max(0, -(b.legL?.rotation.x ?? 0), -(b.legR?.rotation.x ?? 0));
      const legBack = Math.max(0, b.legL?.rotation.x ?? 0, b.legR?.rotation.x ?? 0);
      const sxTgt = clamp(-legFwd * 0.42 + legBack * 0.12 - hipPitch * 0.35, -0.48, 0.20);
      const szTgt = clamp(-0.24 * roll, -0.22, 0.22);
      const sx = this.skirtX.spring(sxTgt, hdt, 64, 0.62);
      const sz = this.skirtZ.spring(szTgt, hdt, 52, 0.60);
      rot(b.armorSkirt, sx, -0.20 * roll, sz);
    }
    rot(b.tail, -0.27 * cloth, -0.31 * roll, 0);
    rot(b.tail2, -0.40 * cloth, -0.49 * roll, 0);
    rot(b.horseTail, -0.40 * cloth, -0.42 * roll, 0);
    for (const bone of this.ribbons) rot(bone, -0.42 * cloth + 0.25 * sp * rs, -0.30 * roll * rs, 0.14 * roll * rs);

    // Articulated 2-3 tier long-robe physics (robe1 -> robe2 [-> robe3]):
    // directly coupled to real gait stridePhase so walking AND running produce clear, grounded step-driven
    // skirt sway, swirl, and trailing hem wave (never frozen, never floating, zero detached shoes).
    if (this.robe.length) {
      const t = a.t;
      const moveSpeed = Math.max(moveSp, a.gaitSpeed);
      const walkK = smooth(moveSpeed / 0.45);
      const spR = clamp(moveSpeed / 3.2, 0, 1.3);
      const ph = a.stridePhase * TAU;
      const isCast = a.act?.name === 'cast', isHurt = a.act?.name === 'hurt';
      const actFlutter = isCast ? Math.sin(t * 9.5) * 0.05 * rs : a.act && !isHurt ? 0.05 * rs : 0;
      const hurtSwing = isHurt ? clamp(-hipPitch * 0.9, -0.11, 0.11) * rs : 0;
      const breeze = (0.018 * Math.sin(t * 2.1) + 0.012 * Math.sin(t * 4.5 + 0.8)) * rs;
      // Clear walking trail even at slow walk speed (walkK=1), scaling gracefully up into sprint
      const trailBase = clamp((0.055 * walkK + 0.085 * spR + 0.028 * Math.max(0, acc) + actFlutter) * rs + hurtSwing - hipPitch * 0.45 + breeze, -0.10, 0.16);
      const sideBase = clamp((-0.28 * roll - 0.09 * clamp(yawRate * 0.16, -1, 1) + (isCast ? Math.sin(t * 6.4) * 0.06 : 0)) * rs, -0.24, 0.24);
      const swirlBase = clamp((-0.28 * roll - 0.11 * clamp(yawRate * 0.16, -1, 1) + (isCast ? Math.cos(t * 5.8) * 0.10 : 0)) * rs, -0.28, 0.28);
      let prevX = trailBase, prevZ = sideBase, prevY = swirlBase;
      for (let i = 0; i < this.robe.length; i++) {
        const lk = this.robe[i];
        const maxX = i === 0 ? 0.11 : i === 1 ? 0.15 : 0.19;
        const minX = i === 0 ? -0.08 : i === 1 ? -0.10 : -0.12;
        // Stride-coupled traveling wave down robe1 -> robe2 -> robe3:
        // knee-push double-step ripple in X, alternating left-right skirt sway in Z, waist-stride swish in Y!
        const stepKickX = Math.sin(ph * 2 - i * 0.95) * (0.042 + 0.028 * i) * walkK * rs;
        const stepSwayZ = Math.sin(ph - i * 0.78) * (0.095 + 0.055 * i) * walkK * rs;
        const stepSwirlY = Math.cos(ph - i * 0.85) * (0.145 + 0.075 * i) * walkK * rs;
        const idleWave = Math.sin(t * 3.2 - i * 1.15) * (0.014 + (isCast ? 0.028 : 0)) * rs;
        const tx = i === 0
          ? clamp(trailBase * 0.65 + stepKickX + idleWave * 0.6, minX, maxX)
          : clamp(prevX * 0.70 + (0.038 * walkK + 0.042 * spR + actFlutter * 0.5) * rs + stepKickX + idleWave, minX, maxX);
        const tz = i === 0
          ? clamp(sideBase * 0.55 + stepSwayZ, -0.18, 0.18)
          : clamp(prevZ * 0.65 + stepSwayZ, -0.24, 0.24);
        const ty = i === 0
          ? clamp(swirlBase * 0.50 + stepSwirlY, -0.22, 0.22)
          : clamp(prevY * 0.68 + stepSwirlY * 0.85, -0.32, 0.32);
        // Decreasing stiffness root -> hem creates a silky traveling wave down the long robe
        const stiff = Math.max(20, 56 - i * 16);
        const rx = lk.x.spring(tx, hdt, stiff, 0.58);
        const rz = lk.z.spring(tz, hdt, stiff * 0.84, 0.54);
        const ry = lk.y.spring(ty, hdt, stiff * 0.86, 0.58);
        rot(lk.bone, clamp(rx, minX, maxX), clamp(ry, -0.32, 0.32), clamp(rz, -0.24, 0.24));
        prevX = rx; prevZ = rz; prevY = ry;
      }
    }

    // Articulated waist pendants / talismans / gourds (pendL, pendR, gourd)
    if (this.pendants.length) {
      const t = a.t;
      for (const p of this.pendants) {
        const swayX = (p.front ? -(0.04 + 0.18 * sp) : (0.06 + 0.32 * sp)) * rs + Math.sin(t * (3.4 + 2.2 * sp) + p.phase) * (0.03 + 0.06 * sp) * rs - hipPitch * 0.65;
        const swayZ = (-0.34 * roll + Math.sin(t * (2.5 + 1.8 * sp) + p.phase * 1.3) * (0.03 + 0.05 * sp)) * rs;
        const rx = p.x.spring(p.front ? clamp(swayX, -0.45, 0.03) : clamp(swayX, -0.04, 0.55), hdt, 48, 0.52);
        const rz = p.z.spring(clamp(swayZ, -0.42, 0.42), hdt, 42, 0.52);
        rot(p.bone, p.front ? Math.min(0.03, rx) : Math.max(-0.04, rx), 0, rz);
      }
    }

    // World-gravity pendulum for foe sword tassel (e.g. Taoist peach-wood sword red tassel)
    if (this.swTassel && b.weapon && b.root) {
      b.root.updateMatrixWorld(true);
      b.weapon.getWorldQuaternion(_fQ);
      this.swTassel.getWorldPosition(_fPos);
      _fVel.set(0, 0, 0);
      if (this.lastTasselPos && hdt > 0) {
        _fVel.subVectors(_fPos, this.lastTasselPos).divideScalar(hdt);
        const vl = _fVel.length();
        if (vl > 12) _fVel.multiplyScalar(12 / vl);
      }
      if (!this.lastTasselPos) this.lastTasselPos = _fPos.clone(); else this.lastTasselPos.copy(_fPos);
      const runX = -Math.sin(a.yaw) * sp * 0.55 * rs, runZ = -Math.cos(a.yaw) * sp * 0.55 * rs;
      _fWant.set(-_fVel.x * 0.14 * rs + runX + Math.sin(a.t * 3.5) * 0.08 * rs, -1.0 - _fVel.y * 0.08 * rs, -_fVel.z * 0.14 * rs + runZ + Math.cos(a.t * 2.8) * 0.08 * rs).normalize();
      _fLoc.copy(_fWant).applyQuaternion(_fQi.copy(_fQ).invert()).normalize();
      if (hdt > 0) {
        const stiff = 58, damp = 2 * 0.54 * Math.sqrt(stiff);
        this.tasselVel.x += ((_fLoc.x - this.tasselDir.x) * stiff - this.tasselVel.x * damp) * hdt;
        this.tasselVel.y += ((_fLoc.y - this.tasselDir.y) * stiff - this.tasselVel.y * damp) * hdt;
        this.tasselVel.z += ((_fLoc.z - this.tasselDir.z) * stiff - this.tasselVel.z * damp) * hdt;
        this.tasselDir.addScaledVector(this.tasselVel, hdt);
        if (this.tasselDir.lengthSq() > 1e-6) this.tasselDir.normalize(); else this.tasselDir.copy(_fLoc);
      } else this.tasselDir.copy(_fLoc);
      this.swTassel.quaternion.setFromUnitVectors(_fDown, this.tasselDir);
    }

    // Underdamped 2nd-order elastic spring chains for Yellow Turban tails (scA/scB) & cloaks:
    // +x rotation streams a hanging -y tail backward (-z), never clipping forward into the head.
    if (this.chains.length) {
      const t = a.t;
      const gust = (0.08 + 0.06 * Math.sin(t * 2.1) + 0.04 * Math.sin(t * 4.7 + 1.1)) * rs;
      const attackWhip = a.act ? 0.24 * clamp(Math.abs(twist) + Math.abs(cloth) * 2.2, 0, 1.2) * rs : 0;
      const stream = clamp((0.14 + 0.82 * sp + 0.04 * acc) * rs + attackWhip + gust, 0.04, 1.45);
      const sideTarget = clamp((-0.52 * roll - 0.14 * clamp(yawRate * 0.12, -1, 1)) * rs, -0.75, 0.75);
      for (const ch of this.chains) {
        let prevX = stream;
        let prevZ = sideTarget;
        for (let i = 0; i < ch.links.length; i++) {
          const link = ch.links[i];
          const flutter = (0.045 + 0.115 * sp + 0.065 * attackWhip) * (1 + 0.45 * i);
          const windX = Math.sin(t * (3.6 + 2.8 * sp) - i * 1.15 + ch.phase) * flutter;
          const windZ = Math.sin(t * (2.4 + 1.9 * sp) - i * 0.95 + ch.phase * 1.4) * (0.04 + 0.07 * sp) * (1 + 0.35 * i);
          const targetX = i === 0
            ? Math.max(0.02, prevX - headPitch * 0.85 - 0.35 * cloth + windX)
            : clamp(0.24 * prevX + windX, -0.22, 0.95);
          const targetZ = i === 0 ? prevZ + windZ : clamp(0.45 * prevZ + windZ, -0.55, 0.55);
          // Decreasing stiffness root -> tip with elastic underdamping for lively silk/cloth whip
          const stiff = Math.max(24, 62 - i * 15);
          const sx = link.x.spring(targetX, hdt, stiff, 0.58);
          const sz = link.z.spring(targetZ, hdt, stiff * 0.86, 0.56);
          rot(link.bone, i === 0 ? Math.max(0, sx) : sx, 0, sz);
          prevX = sx;
          prevZ = sz;
        }
      }
    }

    const swing = clamp((b.armR?.rotation.x ?? 0) + 0.6 * (b.foreR?.rotation.x ?? 0), -3, 3);
    const tip = this.tip.step(swing, hdt, 21) - swing;
    // These poses already drive the blade or every chain link through the strike.
    const name = a.act?.name;
    const aimed = name === 'hjCut' || name === 'hjBackhand' || name === 'whirl' || name === 'slamChain'
      || (name === 'attack' && a.def.id === 'cx_boss');
    if (!aimed) for (const bone of this.tips) rot(bone, clamp(0.07 * tip, -0.13, 0.13), -0.12 * roll, 0);
    // A rigid weapon driven by both hands or aimed down a lane cannot lag behind its grip.
    const locked = name === 'attack' && /^(hj_(brute|mob)|xp_(diver|conscript))/.test(a.def.id);
    if (!locked)
      rot(this.rigidTip, clamp(0.022 * tip, -0.047, 0.047), 0, 0);

    // Scapulohumeral pauldron articulation: whenever an armored foe raises or abducts an arm,
    // hinge the shoulder pauldron (`armorShL/R` or mesh-bearing `shL/R`) smoothly UP and OUT over the upper arm
    // while inversely compensating `armL/R` so hand/weapon world positions remain 100.000% unchanged!
    for (const [side, s] of [['L', 1], ['R', -1]] as const) {
      const sh = b['sh' + side], arm = b['arm' + side];
      const armorSh = b['armorSh' + side];
      if (!sh || !arm || (!armorSh && !this.shHasMesh[side])) continue;
      _shQ.copy(sh.quaternion).multiply(arm.quaternion); // combined arm rotation in chest frame
      _shDir.set(0, -1, 0).applyQuaternion(_shQ);
      const liftUp = clamp((_shDir.y + 0.65) / 1.45, 0, 1);
      const fwdAng = -Math.atan2(_shDir.z, Math.max(0.22, -_shDir.y));
      const outX = Math.max(0, s * _shDir.x);
      const shPitch = clamp(fwdAng * 0.56 - liftUp * 0.48, -1.28, 0.50);
      const shRoll = s * clamp(outX * 0.65 + liftUp * 0.56, 0, 0.74);
      _shTgt.setFromEuler(_shEul.set(shPitch, 0, shRoll, 'XYZ'));
      if (armorSh) {
        armorSh.quaternion.copy(sh.quaternion).invert().multiply(_shTgt);
      } else if (arm.position.lengthSq() < 1e-6) {
        sh.quaternion.copy(_shTgt);
        arm.quaternion.copy(_shTgt).invert().multiply(_shQ);
      }
    }

    // Universal post-pose anatomical wrist guard: catches ANY pose (IK or FK, armed or empty/supporting fist)
    // so wrists NEVER snap 100-165 deg off the forearm while keeping exact weapon orientation & tip alignment.
    limitAnatomicalWrist(b.handL, b.offhand, 0.96);
    limitAnatomicalWrist(b.handR, b.weapon, 0.96);
  }
}
