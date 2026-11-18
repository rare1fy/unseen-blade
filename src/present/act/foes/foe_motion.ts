import { Euler, Quaternion, Vector3 } from 'three';
import { curve, mov, rot, snap, type Action, type Bone } from '../../actors/rig';
import type { BattleActor } from '../../bestiary/battle';
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
    const measured = dt > 0 ? distance / dt : 0;
    // Warps are not steps. Reported speed also supports actors on a treadmill.
    const moving = measured > 0.015 && measured < (a.act?.name === 'ramRun' ? 26 : 12);
    if (moving) this.heading = Math.atan2(dx, dz);
    else if (dt > 0) this.heading += angleDelta(a.yaw - this.heading) * (1 - Math.exp(-dt / 0.09));
    const targetSpeed = active ? (moving ? measured : a.moveSpeed ?? (a.running ? 3 : a.walkK * 1.5)) : 0;
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
    const heading = angleDelta(this.heading - a.yaw);
    const across = Math.sin(heading), forward = Math.cos(heading);
    rot(hips, 0, 0.10 * twist * weight * mix(1, 0.4, robe), clamp(-this.turn * this.speed * 0.015, -0.12, 0.12) * weight);

    // Solve hip height from the longest reach each ankle needs. Near mid-stance the
    // support leg extends. At transfer the two splayed legs draw the pelvis down.
    let hipY = stand + 0.018 * run * Math.abs(Math.sin(this.phase * TAU));
    for (const side of SIDES) {
      const foot = side === 'L' ? left : right;
      if (!foot.planted && (left.planted || right.planted)) continue;
      target.copy(b['leg' + side].position).applyQuaternion(hips.quaternion);
      const planted = b['leg' + side].rest!.p;
      const horizontal = Math.hypot(planted.x + across * foot.travel - target.x, forward * foot.travel - target.z);
      const reach = Math.sqrt(Math.max(0, (length * 0.999) ** 2 - horizontal ** 2));
      hipY = Math.min(hipY, stand - length + foot.lift + reach + planted.y - target.y);
    }
    const crouch = a.act?.name === 'stalk' ? 0.06 : a.act?.name === 'flee' ? 0.026 : 0;
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
  const time = a.t, end = a.dur, at = end * impact;
  const launch = Math.max(at * 0.62, at - (heavy ? 0.13 : 0.095));
  const fast = Math.max(launch, at - 0.028);
  const peak = at + Math.min(0.08, (end - at) * 0.24);
  const damp = peak + (end - peak) * 0.30;
  const reach = (t: number) => {
    if (t < fast) return 0.5 * smooth((t - launch) / Math.max(0.001, fast - launch));
    if (t < at) return snap(t, [[fast, 0.5], [at, 1]]);
    if (t === at) return 1;
    if (t >= end) return 0;
    if (t < peak) return mix(1, 1 + overshoot, smooth((t - at) / (peak - at)));
    if (t < damp) return mix(1 + overshoot, 0.72, smooth((t - peak) / (damp - peak)));
    return 0.72 * (1 - smooth((t - damp) / (end - damp))) ** 2;
  };
  const load = curve(time, [[0, 0], [launch * (heavy ? 0.62 : 0.88), 1], [launch, 1], [at, 0], [end, 0]]);
  const dip = curve(time, [[0, 0], [launch * 0.27, 1], [launch * 0.72, 0], [end, 0]]);
  const lead = Math.min(0.04, launch * 0.35) * smooth(time / Math.max(0.001, launch * 0.7));
  const late = 0.032 * (1 - smooth((time - damp) / Math.max(0.001, end - damp)));
  const kick = curve(time, [[at, 0], [at + Math.min(0.035, (end - at) * 0.25), 1], [damp, 0], [end, 0]]);
  return {
    load, dip, hit: reach(time), hip: reach(time + lead * 2), chest: reach(time + lead), late: reach(time - late), kick,
    tremble: heavy ? Math.sin(time * 65) * 0.028 * smooth((load - 0.84) / 0.16) : 0,
  };
}

export function attackBody(b: Bones, beats: ReturnType<typeof attackBeats>, style: 'melee' | 'ranged' | 'cast' = 'melee', weight = 1) {
  const { load, dip, hip, chest, late, kick, tremble } = beats;
  const melee = style === 'melee', ranged = style === 'ranged';
  const turn = melee ? 1 : 0.35;
  mov(b.hips, 0, -weight * (0.042 * dip + 0.031 * load + (melee ? 0.047 : 0.012) * hip), -0.045 * dip * weight);
  rot(b.hips, 0, turn * weight * (-0.14 * load + 0.19 * hip), 0.045 * (load - hip) * weight);
  rot(b.chest, weight * (0.10 * dip + (ranged ? -0.12 * kick : 0.11 * chest) + tremble), turn * weight * (-0.10 * load + 0.13 * chest), 0);
  rot(b.neck, -0.09 * late * weight, 0.07 * (load - late) * weight, 0);
  rot(b.shL, tremble, 0, style === 'cast' ? -0.13 * load * weight : 0);
  rot(b.shR, -tremble, 0, style === 'cast' ? 0.13 * load * weight : 0);
  rot(b.legR, 0.16 * dip * weight, 0, 0);
  rot(b.shinR, 0.27 * dip * weight, 0, 0);
}

export function poseFoeHurt(b: Bones, off: Vector3, a: Action, from: number, variant: number) {
  const power = clamp(Number(a.data.power) || 1, 0.1, 1.7);
  const top = Math.min(0.064, a.dur * 0.14), held = top + Math.min(0.045, a.dur * 0.16);
  const s = power * curve(a.t, [[0, 0], [top, 1], [held, 1], [a.dur * 0.77, -0.14], [a.dur, 0]]);
  const x = -Math.sin(from), z = -Math.cos(from);
  const heavy = smooth((power - 1.05) / 0.55);
  const step = heavy * curve(a.k, [[0, 0], [0.19, 0.94], [0.42, 1], [0.60, 0.70], [1, 0]]);
  const stumble = step * Math.sin(a.k * TAU * 1.4 + 0.7);
  const bias = (variant - 1) * 0.08;
  off.x += x * (0.17 * s + 0.10 * step);
  off.z += z * (0.22 * s + 0.12 * step);
  mov(b.hips, 0, -0.085 * step, 0);
  rot(b.hips, 0.13 * z * s, 0.12 * x * s, -0.12 * x * s);
  rot(b.spine, (0.24 * z + bias) * s, 0, -0.13 * x * s);
  rot(b.chest, 0.14 * z * s, (0.40 * x + bias) * s, -0.17 * x * s);
  rot(b.body, 0.18 * z * s, 0, -0.21 * x * s);
  rot(b.neck, 0.17 * z * s, 0.13 * x * s, -0.1 * x * s);
  rot(b.head, 0.1 * z * s, 0.08 * x * s, -0.11 * x * s);
  rot(b.jaw, 0.29 * Math.max(0, s), 0, 0);
  rot(b.armL, (-0.24 + 2 * bias) * s, 0, (0.28 + bias) * s);
  rot(b.armR, (-0.20 - 2 * bias) * s, 0, (-0.25 + bias) * s);
  rot(b.legL, -0.22 * z * step, 0, -0.14 * x * step); rot(b.shinL, 0.34 * step + 0.12 * stumble, 0, 0);
  rot(b.legR, 0.38 * z * step, 0, -0.22 * x * step); rot(b.shinR, 0.26 * step - 0.12 * stumble, 0, 0);
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
  const sway = Math.sin(t * 1.22), breath = Math.sin(t * 2.06 + 0.6), glance = smooth((Math.sin(t * 0.91 + 1.1) - 0.24) / 0.58);
  const facing = a.lookYaw === undefined ? Math.sin(t * 0.9) * 0.28 : clamp(angleDelta(a.lookYaw - a.yaw), -0.60, 0.60);
  mov(b.hips, sway * 0.021 * weight, -0.009 * Math.abs(sway) * weight, 0);
  rot(b.hips, 0, 0.028 * sway * weight, 0.038 * sway * weight);
  rot(b.chest, 0.034 * breath * weight, -0.025 * sway * weight, 0);
  rot(b.legL, -0.092 * Math.max(0, sway) * weight, 0, 0);
  rot(b.shinL, 0.18 * Math.max(0, sway) * weight, 0, 0);
  rot(b.legR, -0.092 * Math.max(0, -sway) * weight, 0, 0);
  rot(b.shinR, 0.18 * Math.max(0, -sway) * weight, 0, 0);
  rot(b.neck, 0, facing * glance * weight, 0.038 * sway * weight);
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
  private velocity = 0;

  step(target: number, dt: number, rate: number) {
    const offset = this.value - target, drift = this.velocity + rate * offset;
    const decay = Math.exp(-dt * rate);
    this.value = target + (offset + drift * dt) * decay;
    this.velocity = (this.velocity - rate * drift * dt) * decay;
    return this.value;
  }
}

/** Per-actor lag tracks the posed torso and hand, including attacks and recoil. */
export class FoeAccessories {
  private readonly cloth = new Lag();
  private readonly turn = new Lag();
  private readonly tip = new Lag();
  private readonly ribbons: Bone[];
  private readonly tips: Bone[];
  private readonly rigidTip: Bone | undefined;
  private lastYaw?: number;

  constructor(a: BattleActor) {
    const b = a.bones;
    this.ribbons = Object.values(b).filter(bone => /^(?:topknot|knot|ribbon|tassel)/i.test(bone.name));
    this.tips = ['blade', 'weaponTip', 'chain3', 'chain4', 'chain5'].map(name => b[name]).filter(Boolean);
    const twoHanded = /^(ly_(halberd|rider|xbow|boss)|wl_(spear|xbow)|cx_club)/.test(a.def.id);
    if (!twoHanded && (a.def.tip ?? 0) >= 25 && !b.blade) this.rigidTip = b.weapon;
  }

  pose(a: BattleActor, dt: number) {
    const b = a.bones;
    const pitch = clamp((b.spine?.rotation.x ?? 0) + (b.chest?.rotation.x ?? 0) + 0.6 * a.off.z, -0.7, 0.7);
    const twist = (b.hips?.rotation.y ?? 0) + (b.chest?.rotation.y ?? 0);
    const yawRate = this.lastYaw === undefined || dt <= 0 ? 0 : angleDelta(a.yaw - this.lastYaw) / dt;
    this.lastYaw = a.yaw;
    const cloth = this.cloth.step(pitch, dt, 15) - pitch;
    const roll = this.turn.step(clamp(twist + 0.025 * yawRate, -0.65, 0.65), dt, 12);
    rot(b.hat, 0.13 * cloth, -0.10 * roll, 0.11 * roll);
    rot(b.cape, -0.47 * cloth, -0.34 * roll, 0.20 * roll);
    rot(b.tail, -0.27 * cloth, -0.31 * roll, 0);
    rot(b.tail2, -0.40 * cloth, -0.49 * roll, 0);
    rot(b.horseTail, -0.40 * cloth, -0.42 * roll, 0);
    for (const bone of this.ribbons) rot(bone, -0.42 * cloth, -0.30 * roll, 0.14 * roll);
    const swing = clamp((b.armR?.rotation.x ?? 0) + 0.6 * (b.foreR?.rotation.x ?? 0), -3, 3);
    const tip = this.tip.step(swing, dt, 21) - swing;
    for (const bone of this.tips) rot(bone, clamp(0.07 * tip, -0.13, 0.13), -0.12 * roll, 0);
    // A second hand locks the brute's haft during a swing and the head rests on the floor after a slam.
    if (!(a.act?.name === 'attack' && (a.def.id === 'hj_brute' || a.def.id === 'hj_brute_e')))
      rot(this.rigidTip, clamp(0.022 * tip, -0.047, 0.047), 0, 0);
  }
}
