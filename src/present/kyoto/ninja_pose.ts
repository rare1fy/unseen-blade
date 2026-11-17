// 忍者的姿势（POSE_HOOKS['ninja']，待机和全部动作都在这里）。
// 待机：左脚在前的低伏弓步，左肩冲前，右手忍刀斜指前上方，左手反握苦无护在胸前；呼吸、换重心，偶尔翻一下苦无、侧头看一眼。
// attack（0.9 s，命中 k = 0.5）：下沉蓄力 → 蹬地冲刺 → 横斩 → 举刀从左上劈到右下（最重，k = 0.5）→ 苦无补刺 → 后跳收势。
// cast：结印（刀与苦无并立在面前）→ 烟遁（技能特效在 ninja_fx.ts）。hurt：被打退、手臂甩开。roar：侧身风车挽刀 → 刀尖后指、左手立印。
// 两条围巾尾是一串关节：先抵消上身的前倾让它下垂，再按风和动作往后飘，摆动从根部往梢部传。
import * as THREE from 'three';
import { type Bone, type Action, rot, mov, curve, snap } from '../actors/rig';
import { POSE_HOOKS } from '../bestiary/poseHooks';
import { wrist, beat, bump } from '../bestiary/heroPose';
import { CELL } from '../bestiary/kit';
import type { BActor } from '../bestiary/bactor';
import { trailSeg } from '../fx/fx';
import { dustBlocks } from './ninja_fx';

type Keys = Array<[number, number]>;
const TAU = Math.PI * 2;
const hump = (k: number, a: number, b: number) => (k <= a || k >= b ? 0 : Math.sin(((k - a) / (b - a)) * Math.PI));
const lin = (k: number, a: number, b: number) => Math.max(0, Math.min(1, (k - a) / (b - a)));

/** the whole body pose as numbers, so idle and actions can be blended key by key */
export interface Pose {
  px: number; pz: number; hx: number; hy: number; hz: number; sx: number; sy: number; sz: number; cx: number; nx: number; ny: number;
  aRx: number; aRz: number; fR: number; aLx: number; aLz: number; fL: number;
  tL: number; kL: number; pL: number; tR: number; kR: number; pR: number;
  /** weapon directions (elevation, yaw, roll) in the actor's frame: right = ninjato, left = kunai */
  eR: number; yR: number; eL: number; yL: number;
  /** the sword hand's roll round the blade (act-23, the sheathing grip: lets the fist continue the forearm); absent = 0 */
  rR?: number;
  /** scarf tails: how far they stream back (rad) and how hard they flutter (0..1) */
  lift: number; flut: number;
}
export const mix = (a: Pose, b: Partial<Pose>, w: number): Pose => {
  const o = { ...a };
  for (const k of Object.keys(b) as Array<keyof Pose>) { const av = (a[k] as number | undefined) ?? 0; o[k] = av + ((b[k] as number) - av) * w; }
  return o;
};

// thigh 5 cells, shin 3 (knee to ankle): the hip drop that keeps a bent leg's foot on the ground
const LT = 5 * CELL, LS = 3 * CELL;
function leg(b: Record<string, Bone>, s: 'L' | 'R', thigh: number, knee: number, splay: number) {
  rot(b[`leg${s}`], thigh, 0, splay); rot(b[`shin${s}`], knee, 0, 0); rot(b[`foot${s}`], -(thigh + knee), 0, -splay);
  return LT * (1 - Math.cos(thigh)) + LS * (1 - Math.cos(thigh + knee)) + (LT + LS) * (1 - Math.cos(splay));
}

export function idle(t: number, calm: number): Pose {
  const br = Math.sin(t * TAU / 2.4), sway = Math.sin(t * TAU / 2.1);
  const flip = beat(t, 4.6, 0.45, 1.3), look = bump(beat(t, 6.4, 1.2, 3.0)) * calm, d = 1 + 0.06 * br;
  return {
    px: sway * 0.035, pz: 0, hx: 0, hy: -0.32, hz: -sway * 0.03,
    sx: 0.22 + 0.03 * br, sy: 0.12, sz: sway * 0.03, cx: 0.03 * br, nx: -0.2 - 0.03 * br, ny: 0.2 + 0.35 * look,
    aRx: -0.5 - 0.03 * br, aRz: -0.45, fR: -1.25, aLx: -0.95 + 0.03 * br, aLz: 0.1, fL: -0.75,
    tL: -0.55 * d, kL: 0.75 * d, pL: 0.12, tR: 0.3 * d, kR: 0.4 * d, pR: -0.12,
    eR: 0.6 + 0.05 * br, yR: -0.15 + 0.03 * sway, eL: -0.95, yL: 0.25 + (flip < 0 || !calm ? 0 : flip * TAU),
    lift: 0.3 + 0.06 * Math.sin(t * 0.9), flut: 0.25,
  };
}

export function attack(I: Pose, k: number, D: number, off: THREE.Vector3): Pose {
  const S = (keys: Keys) => snap(k, keys);
  const hop = hump(k, 0.68, 0.88);
  off.z = curve(k, [[0, 0], [0.14, -0.1], [0.28, D], [0.66, D], [0.86, 0], [1, 0]]);
  off.y += 0.2 * hop;
  const A: Partial<Pose> = {
    tL: S([[0, -0.55], [0.14, -0.75], [0.28, -1.05], [0.66, -1.05], [0.88, -0.55], [1, -0.55]]) - 0.3 * hop,
    kL: S([[0, 0.75], [0.14, 1.1], [0.28, 1.0], [0.66, 1.0], [0.88, 0.75], [1, 0.75]]) + 0.5 * hop,
    tR: S([[0, 0.3], [0.14, 0.35], [0.28, 0.65], [0.66, 0.65], [0.88, 0.3], [1, 0.3]]) - 0.3 * hop,
    kR: S([[0, 0.4], [0.14, 0.7], [0.28, 0.25], [0.66, 0.25], [0.88, 0.4], [1, 0.4]]) + 0.6 * hop,
    sx: S([[0, 0.22], [0.14, 0.34], [0.28, 0.45], [0.5, 0.52], [0.66, 0.38], [0.88, 0.22], [1, 0.22]]),
    sy: S([[0, 0.12], [0.14, -0.35], [0.2, -0.5], [0.3, 0.45], [0.42, 0.5], [0.5, -0.5], [0.62, -0.5], [0.88, 0.12], [1, 0.12]]),
    hy: S([[0, -0.32], [0.28, -0.2], [0.5, -0.08], [0.7, -0.2], [1, -0.32]]),
    aRx: S([[0, -0.5], [0.14, -0.35], [0.2, -1.35], [0.3, -1.45], [0.42, -2.7], [0.5, -0.95], [0.62, -0.8], [0.88, -0.5], [1, -0.5]]),
    aRz: S([[0, -0.45], [0.14, -0.85], [0.2, -1.15], [0.3, 0.55], [0.42, 0.25], [0.5, -0.55], [0.62, -0.6], [0.88, -0.45], [1, -0.45]]),
    fR: S([[0, -1.25], [0.14, -1.55], [0.2, -0.35], [0.3, -0.2], [0.42, -0.55], [0.5, -0.15], [0.62, -0.2], [0.88, -1.25], [1, -1.25]]),
    eR: S([[0, 0.6], [0.14, 1.0], [0.2, 0.18], [0.3, 0.05], [0.42, 1.75], [0.5, -0.5], [0.62, -0.65], [0.88, 0.6], [1, 0.6]]),
    yR: S([[0, -0.15], [0.14, -0.8], [0.2, -1.55], [0.3, 1.15], [0.42, 0.85], [0.5, -0.75], [0.62, -0.9], [0.88, -0.15], [1, -0.15]]),
    aLx: S([[0, -0.95], [0.28, -0.55], [0.46, -0.7], [0.5, -0.9], [0.6, -1.55], [0.72, -1.35], [0.88, -0.95], [1, -0.95]]),
    aLz: S([[0, 0.1], [0.28, 0.4], [0.5, 0.2], [0.6, -0.05], [0.88, 0.1], [1, 0.1]]),
    fL: S([[0, -0.75], [0.28, -1.6], [0.5, -1.3], [0.6, -0.1], [0.72, -0.25], [0.88, -0.75], [1, -0.75]]),
    eL: S([[0, -0.95], [0.28, -1.15], [0.5, -0.7], [0.6, -0.05], [0.72, -0.15], [0.88, -0.95], [1, -0.95]]),
    yL: S([[0, 0.25], [0.6, 0.0], [1, 0.25]]),
    lift: 0.3 + 0.8 * curve(k, [[0, 0], [0.18, 0], [0.3, 1], [0.66, 0.8], [0.9, 0.3], [1, 0]]),
    flut: 0.25 + 0.75 * hump(k, 0.18, 0.9),
  };
  const P = mix(I, A, curve(k, [[0, 0], [0.08, 1], [0.86, 1], [1, 0]]));
  P.nx = -P.sx * 0.9; P.ny = -0.85 * (P.hy + P.sy);
  return P;
}

export function cast(I: Pose, k: number): Pose {
  const shiver = k > 0.18 && k < 0.36 ? Math.sin(k * 260) * 0.008 : 0;
  const A: Partial<Pose> = {
    tL: -0.85, kL: 1.35, pL: 0.15, tR: 0.15, kR: 1.1, pR: -0.15, hy: -0.1, sx: 0.12, sy: 0, nx: -0.12, ny: 0, px: shiver,
    aRx: -1.1, aRz: 0.2, fR: -1.4, eR: 1.5, yR: 0, aLx: -1.0, aLz: -0.2, fL: -1.35, eL: 1.45, yL: 0,
    lift: 0.35 + 1.2 * hump(k, 0.25, 0.75), flut: 0.3 + 0.7 * hump(k, 0.25, 0.75),
  };
  return mix(I, A, curve(k, [[0, 0], [0.14, 1], [0.8, 1], [1, 0]]));
}

function roar(I: Pose, k: number, off: THREE.Vector3): Pose {
  const S = (keys: Keys) => snap(k, keys), wind = curve(lin(k, 0.08, 0.36), [[0, 0], [1, 1]]);
  off.y += 0.12 * hump(k, 0.36, 0.48);
  const A: Partial<Pose> = {
    aRx: S([[0, -0.5], [0.08, -0.2], [0.36, -0.2], [0.46, 0.25], [0.86, 0.25], [1, -0.5]]),
    aRz: S([[0, -0.45], [0.08, -0.95], [0.36, -0.95], [0.46, -0.5], [0.86, -0.5], [1, -0.45]]),
    fR: S([[0, -1.25], [0.08, -0.25], [0.36, -0.25], [0.46, -0.4], [0.86, -0.4], [1, -1.25]]),
    // a forward windmill (two turns) at the right side, then the blade swept back along the arm
    eR: S([[0, 0.6], [0.36, 0.6], [0.46, -0.2], [0.86, -0.2], [1, 0.6]]) - 2 * TAU * wind,
    yR: S([[0, -0.15], [0.36, -0.15], [0.46, -2.6], [0.86, -2.6], [1, -0.15]]),
    aLx: S([[0, -0.95], [0.3, -0.95], [0.46, -1.3], [0.86, -1.3], [1, -0.95]]),
    aLz: S([[0, 0.1], [0.46, -0.15], [0.86, -0.15], [1, 0.1]]),
    fL: S([[0, -0.75], [0.46, -1.5], [0.86, -1.5], [1, -0.75]]),
    eL: S([[0, -0.95], [0.46, 1.4], [0.86, 1.4], [1, -0.95]]),
    yL: S([[0, 0.25], [0.46, 0], [0.86, 0], [1, 0.25]]),
    hy: S([[0, -0.32], [0.4, -0.32], [0.48, -0.6], [0.86, -0.6], [1, -0.32]]),
    sy: S([[0, 0.12], [0.48, 0.28], [0.86, 0.28], [1, 0.12]]),
    sx: S([[0, 0.22], [0.48, 0.08], [0.86, 0.08], [1, 0.22]]),
    tL: S([[0, -0.55], [0.48, -0.4], [0.86, -0.4], [1, -0.55]]), kL: S([[0, 0.75], [0.48, 0.5], [0.86, 0.5], [1, 0.75]]), pL: S([[0, 0.12], [0.48, 0.25], [0.86, 0.25], [1, 0.12]]),
    tR: S([[0, 0.3], [0.48, 0.35], [0.86, 0.35], [1, 0.3]]), kR: S([[0, 0.4], [0.48, 0.35], [0.86, 0.35], [1, 0.4]]), pR: S([[0, -0.12], [0.48, -0.25], [0.86, -0.25], [1, -0.12]]),
    lift: 0.3 + 1.0 * curve(k, [[0, 0], [0.4, 0.3], [0.5, 1], [0.86, 1], [1, 0]]), flut: 1,
  };
  const P = mix(I, A, curve(k, [[0, 0], [0.06, 1], [0.88, 1], [1, 0]]));
  P.nx = -P.sx * 0.9; P.ny = -0.9 * (P.hy + P.sy);
  return P;
}

export function hurt(P: Pose, k: number, power: number, off: THREE.Vector3): Pose {
  const s = snap(k, [[0, 0], [0.12, 1], [1, 0]]) * Math.min(1.6, power || 1);
  off.z = -0.3 * s;
  return { ...P, sx: P.sx - 0.42 * s, nx: P.nx - 0.15 * s, aRz: P.aRz - 0.45 * s, aLz: P.aLz + 0.5 * s, aRx: P.aRx + 0.3 * s, aLx: P.aLx + 0.4 * s,
    eR: P.eR + 0.6 * s, eL: P.eL + 0.7 * s, tL: P.tL + 0.25 * s, kL: P.kL - 0.3 * s, lift: P.lift + 0.6 * s, flut: Math.min(1, P.flut + s) };
}

export function apply(b: Record<string, Bone>, P: Pose) {
  const dL = leg(b, 'L', P.tL, P.kL, P.pL), dR = leg(b, 'R', P.tR, P.kR, P.pR);
  mov(b.hips, P.px, -(dL + dR) / 2, P.pz);
  rot(b.hips, P.hx, P.hy, P.hz); rot(b.spine, P.sx, P.sy, P.sz); rot(b.chest, P.cx, 0, 0); rot(b.neck, P.nx, P.ny, 0);
  rot(b.armR, P.aRx, 0, P.aRz); rot(b.foreR, P.fR, 0, 0); rot(b.armL, P.aLx, 0, P.aLz); rot(b.foreL, P.fL, 0, 0);
  wrist(b, 'R', P.eR, P.yR, P.rR ?? 0); wrist(b, 'L', P.eL, P.yL);
}

/** the scarf tails: hang under the upper body's lean, stream back by `lift`, a wave running from the root to the tip */
export function scarf(b: Record<string, Bone>, t: number, lift: number, flut: number) {
  const px = b.hips.rotation.x + b.spine.rotation.x + b.chest.rotation.x, pz = b.hips.rotation.z + b.spine.rotation.z, w = t * TAU / (1.3 - 0.5 * flut);
  const chains: Array<[string[], number]> = [[['scA1', 'scA2', 'scA3'], 0], [['scB1', 'scB2'], 1.9]];
  for (const [names, ph] of chains) names.forEach((n, i) => {
    const wave = Math.sin(w - i * 1.25 + ph) * (0.05 + 0.13 * flut) * (1 + 0.5 * i);
    const side = Math.sin(w * 0.63 - i * 0.9 + ph) * (0.04 + 0.07 * flut);
    rot(b[n], i === 0 ? Math.max(-0.05, lift - px) + wave : 0.12 * lift + wave, 0, i === 0 ? -pz + side : side);
  });
}

// per-actor memory for the blade trails and the one-off dust puffs
const mem = new WeakMap<object, { tipR: THREE.Vector3 | null; tipL: THREE.Vector3 | null; k: number; name: string }>();
function trails(self: BActor, a: Action | null) {
  let m = mem.get(self); if (!m) { m = { tipR: null, tipL: null, k: 0, name: '' }; mem.set(self, m); }
  const k = a ? a.k : 0, name = a?.name ?? '', fresh = name !== m.name || k < m.k;
  if (a && name === 'attack') {
    const tipR = self.bones.weapon.localToWorld(new THREE.Vector3(0, 0, 13 * CELL)), tipL = self.bones.offhand.localToWorld(new THREE.Vector3(0, 0, 6 * CELL));
    if (!fresh && m.tipR) {
      if (k > 0.2 && k < 0.32) trailSeg(m.tipR, tipR, 0xb8ccff, 0.11, { life: 0.16, bright: 1.8, spark: 0.2 });
      if (k > 0.43 && k < 0.56) trailSeg(m.tipR, tipR, 0xff5a3a, 0.15, { life: 0.22, bright: 2.0, spark: 0.5 });
    }
    if (!fresh && m.tipL && k > 0.53 && k < 0.62) trailSeg(m.tipL, tipL, 0xffd0b8, 0.07, { life: 0.12, bright: 1.6, spark: 0 });
    // kick-off dust behind the back foot, landing dust after the back-hop
    if ((fresh ? -1 : m.k) < 0.16 && k >= 0.16) dustBlocks(self.local(0, 0, -0.25), 6, self.fwd().multiplyScalar(-1));
    if (!fresh && m.k < 0.88 && k >= 0.88) dustBlocks(self.local(0, 0, 0), 5);
    m.tipR = tipR; m.tipL = tipL;
  } else { m.tipR = null; m.tipL = null; }
  m.k = k; m.name = name;
}

POSE_HOOKS['ninja'] = (b, t, a, off, self) => {
  let P = idle(t, a ? 0 : 1);
  if (a) {
    const k = a.k;
    if (a.name === 'attack') P = attack(P, k, (a.data.dist as number | undefined) ?? 0.7, off);
    else if (a.name === 'cast') P = cast(P, k);
    else if (a.name === 'roar' || a.name === 'cheer') P = roar(P, k, off);
    else if (a.name === 'hurt') P = hurt(P, k, a.data.power as number, off);
  }
  apply(b, P);
  scarf(b, t, P.lift, P.flut);
  if (self) trails(self as BActor, a);
};
