// 洛阳动作叠在通用待机、跑、挨打、倒地之后。a.at 由 ly_ai 给，打击那一帧不用随精英或关卡速度另算。
import { Euler, Quaternion, Vector3 } from 'three';
import { curve, mov, rot, snap, type Action, type Bone } from '../../actors/rig';
import { POSE_AFTER, type PoseFn } from '../../bestiary/poseHooks';
import type { BattleActor } from '../../bestiary/battle';

type Bones = Record<string, Bone>;
type Side = 'L' | 'R';
const PI = Math.PI, CELL = 0.035;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const angle = (r: number) => Math.atan2(Math.sin(r), Math.cos(r));
const put = (b: Bone, x = 0, y = 0, z = 0) => b.rotation.set(x, y, z);
const paired = (id: string, fn: PoseFn) => { POSE_AFTER[id] = fn; POSE_AFTER[id + '_e'] = fn; };
const passive = (a: Action | null) => a?.name === 'fall' || a?.name === 'collapse' || a?.name === 'roar';

const down = new Vector3(0, -1, 0), wrist = new Vector3(), delta = new Vector3(), pole = new Vector3(), elbow = new Vector3();
const inv = new Quaternion(), parentQ = new Quaternion();
const gripQ = new Quaternion(), axis = new Vector3(), handPoint = new Vector3(), gripShift = new Vector3(), axes = new Euler();

/** 从握点倒推肘的位置。兵器仍是 hand 的孩子，手伸不到时先保肘的长度，再让另一手沿杆就近握。 */
function handAt(b: Bones, side: Side, point: Vector3, q: Quaternion, grip = true) {
  const arm = b['arm' + side], fore = b['fore' + side], hand = b['hand' + side], p = arm.parent!;
  wrist.copy(point);
  if (grip) wrist.sub(gripShift.set(0, -CELL, 0).applyQuaternion(q));
  b.root.localToWorld(wrist); p.worldToLocal(wrist); wrist.sub(arm.position);
  const upper = fore.position.length(), lower = hand.position.length();
  const length = Math.max(Math.abs(upper - lower) + 0.002, Math.min(upper + lower - 0.002, wrist.length()));
  delta.copy(wrist).normalize();
  pole.set(side === 'L' ? 0.9 : -0.9, -1, -0.38);
  pole.addScaledVector(delta, -pole.dot(delta)).normalize();
  const d = (upper * upper - lower * lower + length * length) / (2 * length);
  elbow.copy(delta).multiplyScalar(d).addScaledVector(pole, Math.sqrt(Math.max(0, upper * upper - d * d)));
  arm.quaternion.setFromUnitVectors(down, pole.copy(elbow).normalize());
  inv.copy(arm.quaternion).invert();
  fore.quaternion.setFromUnitVectors(down, delta.multiplyScalar(length).sub(elbow).applyQuaternion(inv).normalize());

  // 抵消上半身的转动，手、掌心通孔和杆保持同一朝向。
  parentQ.identity();
  for (let n = hand.parent; n && n !== b.root; n = n.parent) parentQ.premultiply(n.quaternion);
  hand.quaternion.copy(parentQ.invert().multiply(q));
  return hand;
}

function aim(pitch: number, yaw: number, roll = 0) {
  return gripQ.setFromEuler(axes.set(pitch, yaw, roll, 'YXZ'));
}

function hold(b: Bones, x: number, y: number, z: number, pitch: number, yaw: number, roll = 0, support = 0) {
  const q = aim(pitch, yaw, roll);
  put(b.weapon);
  handAt(b, 'R', handPoint.set(x, y, z), q);
  if (!support) return;
  // 用右手实际落点，保证副手跟着杆。算出左肩够得到的那段，再选离惯用握点最近的位置。
  b.weapon.getWorldPosition(handPoint); b.root.worldToLocal(handPoint);
  axis.set(0, 0, 1).applyQuaternion(q);
  b.armL.getWorldPosition(wrist); b.root.worldToLocal(wrist); wrist.sub(handPoint);
  const reach = b.foreL.position.length() + b.handL.position.length() - 0.025;
  const along = wrist.dot(axis), room = reach * reach - (wrist.lengthSq() - along * along);
  const span = Math.sqrt(Math.max(0, room));
  const grip = Math.min(Math.max(support, along - span), along + span);
  // 没有可握的一段时，左手按来路收着；贴近右手的地方也不能两拳重叠。
  if (room > 0 && Math.abs(grip) > 0.16) handAt(b, 'L', handPoint.addScaledVector(axis, grip), q);
  else { put(b.armL, -0.45, 0, 0.3); put(b.foreL, -0.9); }
}

/** 出手之前慢慢沉下去，最后一小拍才加速。两系数在打击帧刚好是 0 / 1。 */
function beats(a: Action, tail = 1) {
  const hit = a.at, start = hit * 0.82, end = hit + (1 - hit) * 0.33;
  return {
    load: curve(a.k, [[0, 0], [start * 0.7, 1], [start, 1], [hit, 0]]),
    fire: snap(a.k, [[0, 0], [start, 0], [hit, 1], [end, 1], [tail, 0]]),
  };
}

function legs(b: Bones, load: number, step: number, left: Side = 'L') {
  const right = left === 'L' ? 'R' : 'L';
  mov(b.hips, 0, -0.085 * load - 0.10 * step, 0);
  const l = -0.34 * load - 0.73 * step, r = -0.24 * load + 0.49 * step;
  const lk = 0.64 * load + 0.86 * step, rk = 0.54 * load + 0.12 * step;
  put(b['leg' + left], l); put(b['shin' + left], lk); put(b['foot' + left], -l - lk);
  put(b['leg' + right], r); put(b['shin' + right], rk); put(b['foot' + right], -r - rk + 0.16 * step);
}

paired('ly_halberd', (b, t, a, off) => {
  if (passive(a)) return;
  const n = a?.name;
  if (a && (n === 'thrust' || n === 'sweepHalberd')) {
    const { load, fire } = beats(a);
    const sweep = n === 'sweepHalberd';
    legs(b, load, fire);
    rot(b.spine, -0.13 * load + 0.28 * fire, sweep ? -0.35 * load + 0.43 * fire : -0.22 * load, 0);
    rot(b.neck, -0.16 * fire, 0, 0);
    off.z += -0.12 * load + (sweep ? 0.18 : 0.49) * fire;
    // 平端时戟杆从右腰送出。横扫先收到右侧，再让钩枝越过正前方。
    hold(b, -0.22 - 0.1 * load + 0.12 * fire, 1.06 - 0.075 * fire, 0.28 - 0.20 * load + 0.22 * fire,
      mix(-0.56, 0, Math.max(load, fire)), -0.19 + (sweep ? -1.26 * load + 1.17 * fire : 0.19 * (load + fire)), 0, 0.33);
    return;
  }
  if (n === 'hop' && a) {
    const spring = curve(a.k, [[0, 0], [0.25, 1], [0.75, 0], [1, 0]]);
    const land = curve(a.k, [[0, 0], [0.64, 0], [0.81, 1], [1, 0]]);
    off.y += 0.22 * spring;
    legs(b, land * 0.9, spring * 0.48, 'R');
    rot(b.spine, -0.2 * spring + 0.3 * land, 0, 0);
  }
  hold(b, -0.24, 1.06 + Math.sin(t * 2.2) * 0.016, 0.28, -0.56, -0.19, 0, 0.31);
});

const mountedMotion = new WeakMap<object, { t: number; yaw: number; gait: number }>();

/** 马腿有大腿、胫、蹄。逐腿指定落蹄和悬空的位置，收腿时让胫往身下折。 */
function hoof(b: Bones, id: string, y: number, z: number) {
  const thigh = b['horseLeg' + id], shin = b['horseShin' + id], foot = b['hoof' + id];
  const a = -shin.position.y, c = -foot.position.y;
  const d = Math.min(a + c - 0.0001, Math.hypot(y, z));
  const knee = Math.acos(Math.max(-1, Math.min(1, (d * d - a * a - c * c) / (2 * a * c)))) * (id[0] === 'F' ? 1 : -1);
  const swing = Math.atan2(-z, y) - Math.atan2(c * Math.sin(knee), a + c * Math.cos(knee));
  put(thigh, swing); put(shin, knee); put(foot, -swing - knee);
}

paired('ly_rider', (b, t, a, off, self) => {
  if (passive(a)) return;
  const actor = self as BattleActor, n = a?.name, k = a?.k ?? 0;
  const state = mountedMotion.get(actor) ?? { t, yaw: actor.yaw, gait: 0 };
  mountedMotion.set(actor, state);
  const dt = Math.max(0, t - state.t); state.t = t;
  const gallop = n === 'charge', paw = n === 'paw', reining = n === 'rein', fall = n === 'unhorse';
  const turn = reining ? ((a!.data.turn as number | undefined) ?? 1.1) * curve(k, [[0, 0], [0.23, 0], [0.9, 1]]) : 0;
  if (paw || gallop) state.yaw = actor.yaw;
  else state.yaw += angle(actor.yaw + turn - state.yaw) * Math.min(1, dt * 15);
  b.hips.rotation.y = angle(state.yaw - actor.yaw);

  const ramp = gallop ? 1 : paw || fall ? 0 : reining ? 0.65 * (1 - k) : actor.running ? 0.66 : 0;
  state.gait = mix(state.gait, ramp, Math.min(1, dt * (gallop ? 30 : 12)));
  const gait = state.gait, phase = t * (gallop ? 26 : 11);
  const rear = paw ? curve(k, [[0, 0], [0.30, 1], [0.65, 0.85], [a!.at, 0.20], [1, 0]]) : 0;
  const pull = reining ? Math.sin(k * PI) : 0;
  const bail = fall ? curve(k, [[0, 0], [0.13, 0.32], [0.32, 1], [0.63, 1], [0.8, 0.72], [1, 0]]) : 0;
  const vault = fall ? curve(k, [[0, 0], [0.13, 0.38], [0.30, 0], [0.83, 0], [0.92, 0.3], [1, 0]]) : 0;
  const bob = 0.018 * gait * (1 + Math.sin(phase * 2));
  b.hips.position.y = b.hips.rest!.p.y + bob;
  put(b.horse, -0.14 * rear - 0.08 * pull + 0.07 * gait * Math.sin(phase));
  put(b.horseNeck, -0.31 * rear - 0.20 * pull + 0.16 * gait, 0.5 * pull - 0.34 * bail, 0);
  put(b.horseHead, -0.35 * rear + 0.12 * Math.sin(phase) * gait, 0.2 * pull, 0);
  put(b.horseTail, 0.65 * gait + 0.24 * rear, 0.25 * Math.sin(t * 5), 0);
  for (const [i, id] of ['FL', 'FR', 'BL', 'BR'].entries()) {
    const ph = phase + (gallop ? [0, 1.35, 3.2, 4.55][i] : [0, PI, PI, 0][i]);
    const scrape = paw && i === 0 ? rear * Math.max(0, Math.sin(k * 19)) : 0;
    const lift = 0.16 * gait * Math.max(0, Math.cos(ph)) + 0.28 * scrape;
    hoof(b, id, 17 * CELL - bob - lift, 0.39 * gait * Math.sin(ph) + 0.30 * scrape);
  }
  // 马保持独立的四足支撑。人在撞停后越过马肩落地，再用手撑地回到马侧。
  mov(b.horse, 0.33 * bail, 0, -0.29 * bail);
  mov(b.saddleSeat, -0.93 * bail, -1.04 * bail + vault, 0.84 * bail);
  put(b.saddleSeat, -0.14 * rear + 0.21 * gait + 0.42 * bail, 0.27 * bail, -1.12 * bail);
  put(b.spine, 0.13 + 0.14 * gait - 0.22 * rear - 0.16 * pull);
  put(b.legL, -0.53 + 0.26 * bail, 0, 0.1); put(b.legR, -0.53 - 0.18 * bail, 0, -0.1);
  put(b.shinL, 0.96 - 0.38 * bail); put(b.shinR, 0.96 - 0.26 * bail);
  put(b.footL, -0.4); put(b.footR, -0.4);
  const tilt = gallop ? 0.03 : -0.68 + 0.55 * rear;
  if (fall && bail > 0.04) {
    put(b.armR, -0.3 - bail, 0, -0.55 * bail); put(b.foreR, -0.8);
    put(b.weapon, 1.45 * bail, -0.5 * bail, 0);
    put(b.armL, -0.9 * bail, 0, 0.83 * bail); put(b.foreL, -0.4 - 0.45 * bail);
  } else {
    hold(b, -0.43, 1.69 + bob + 0.08 * rear, 0.32 - 0.09 * pull, tilt, -0.22, 0);
    handAt(b, 'L', handPoint.set(0.15, 1.62 + bob + rear * 0.10, 0.36 - 0.12 * pull), aim(-0.5, 0.08), false);
  }
  off.y = 0;
});

paired('ly_shield', (b, t, a, off) => {
  if (passive(a)) return;
  let load = 0, fire = 0, cut = 0, open = 0;
  if (a?.name === 'bash' || a?.name === 'cutAfter') {
    ({ load, fire } = beats(a));
    cut = a.name === 'cutAfter' ? fire : 0;
  }
  if (a?.name === 'stun') open = snap(a.k, [[0, 0], [0.09, 1], [0.22, 0.85], [0.84, 0.85], [1, 0]]);
  if (a?.name === 'bash') { off.set(0, 0, -0.14 * load + 0.34 * fire); put(b.spine, -0.1 * load + 0.32 * fire, -0.19 * load, 0); put(b.neck, -0.18 * fire); }
  if (load || fire || open) legs(b, load + 0.45 * open, fire * 0.85);
  rot(b.chest, -0.25 * open, -0.42 * open, -0.1 * open);
  put(b.offhand);
  handAt(b, 'L', handPoint.set(0.10 + 0.51 * open + 0.16 * cut, 0.92 + 0.05 * load + 0.09 * fire - 0.19 * open,
    0.34 - 0.12 * load + 0.17 * fire - 0.37 * open), aim(-0.20 + 0.09 * fire + 0.34 * open, 1.48 * open + 0.68 * cut, -0.33 * open));
  hold(b, -0.38 - 0.1 * load + 0.11 * cut, 0.87 + 0.25 * cut + 0.012 * Math.sin(t * 3), 0.16 + 0.27 * cut,
    0.39 - 0.46 * cut, -0.74 - 0.38 * (a?.name === 'cutAfter' ? load : 0) + 1.25 * cut);
});

paired('ly_xbow', (b, t, a) => {
  const n = a?.name, k = a?.k ?? 0;
  if (passive(a)) return;
  let lift = 0, recoil = 0, down = 0, draw = 0;
  if (n === 'aimXbow') lift = curve(k, [[0, 0], [a!.at * 0.43, 1], [1, 1]]);
  if (n === 'reload') {
    recoil = snap(k, [[0, 0], [0.055, 1], [0.15, 0], [1, 0]]);
    lift = curve(k, [[0, 1], [0.24, 0], [1, 0]]);
    down = curve(k, [[0, 0], [0.24, 1], [0.77, 1], [1, 0]]);
    draw = curve(k, [[0, 0], [0.28, 0], [0.63, 1], [0.79, 1], [1, 0]]);
  }
  const pitch = 0.15 - 0.15 * lift - 0.23 * recoil + 0.99 * down;
  rot(b.spine, -0.14 * recoil + 0.35 * down - 0.18 * draw, 0, 0);
  rot(b.neck, 0.22 * down - 0.12 * lift, 0, 0);
  if (down > 0) legs(b, 0.28 * down, 0.87 * down, 'L');
  hold(b, -0.10 + 0.12 * down, 1.03 + 0.24 * lift + 0.08 * recoil - 0.04 * down + 0.01 * Math.sin(t * 3),
    0.28 - 0.13 * recoil - 0.02 * lift + 0.16 * down, pitch, -0.14 + 0.14 * lift, 0);
  const q = aim(pitch, -0.14 + 0.14 * lift);
  b.weapon.getWorldPosition(handPoint); b.root.worldToLocal(handPoint);
  handPoint.add(axis.set(0.07, -0.035 + 0.15 * down, 0.30 + 0.13 * down - 0.20 * draw).applyQuaternion(q));
  handAt(b, 'L', handPoint, q, false);
  b.bolt.visible = n !== 'reload' || k > 0.69;
});

paired('ly_torch', (b, t, a, off) => {
  const n = a?.name;
  if (passive(a)) return;
  const { load, fire } = a && n === 'lob' ? beats(a) : { load: 0, fire: 0 };
  legs(b, 0.55 * load, 0.75 * fire);
  rot(b.spine, -0.32 * load + 0.34 * fire, -0.28 * load + 0.28 * fire, 0);
  rot(b.neck, 0.15 * load - 0.12 * fire, 0, 0);
  off.z += 0.13 * fire;
  hold(b, -0.39 - 0.05 * load + 0.18 * fire, 1.11 + 0.52 * load + 0.27 * fire, 0.27 - 0.45 * load + 0.31 * fire,
    0.02 + 0.08 * load - 0.38 * fire, -0.31 * load + 0.3 * fire);
  put(b.armL, -0.58 * load + 0.36 * fire - 0.12, 0, 0.2 + 0.59 * fire);
  put(b.foreL, -0.54 - 0.37 * load);
  b.weapon.visible = n !== 'lob' || a!.k < a!.at || a!.k > 0.93;
  rot(b.jarBelt, -0.14 * fire, -0.12 * load, 0.09 * Math.sin(t * 7));
  b.wick.scale.y = 0.88 + 0.22 * Math.sin(t * 17) ** 2;
});

const looter: PoseFn = (b, t, a, off) => {
  if (passive(a)) return;
  const { load, fire } = a?.name === 'attack' ? beats(a) : { load: 0, fire: 0 };
  if (a?.name === 'attack') { off.z = 0.31 * fire; off.y = 0; put(b.spine, 0.16 + 0.35 * fire, -0.18 * load, 0); legs(b, 0.5 * load, 0.6 * fire); }
  else rot(b.spine, 0.15, 0, 0);
  rot(b.neck, -0.16 * fire, 0, 0);
  put(b.cape, 0.03 * Math.sin(t * 6) - 0.12 * fire);
  hold(b, -0.25, 0.94 - 0.05 * fire, 0.2 - 0.13 * load + 0.34 * fire, 0.54 - 0.55 * fire, -0.38 + 0.38 * fire);
};
POSE_AFTER.ly_looter = looter;
POSE_AFTER.ly_looter_b = looter;

function axeReady(b: Bones, t: number) {
  hold(b, -0.34, 1.22 + 0.012 * Math.sin(t * 3), 0.3, -1.15, -0.76, 0.18);
}

/** 斧刃触地的同一个落点，劈中和卡斧之间不用换姿势。 */
function plantAxe(b: Bones, off: Vector3, t: number, s: number, strain = 0) {
  legs(b, 0.16 * s, 0.83 * s);
  rot(b.spine, 0.56 * s - 0.08 * strain, 0, 0);
  rot(b.neck, -0.32 * s, 0, 0);
  off.z += 0.26 * s;
  hold(b, mix(-0.34, -0.13, s), mix(1.22 + 0.012 * Math.sin(t * 3), 1.03, s), mix(0.3, 0.50, s),
    mix(-1.15, 0.108, s), -0.76 * (1 - s), mix(0.18, 1.25, s), -0.22);
}

POSE_AFTER.ly_boss = (b, t, a, off, self) => {
  const n = a?.name, k = a?.k ?? 0;
  b.trough.visible = n === 'kick' && k > 0.12 && k < 0.92;
  if (passive(a)) return;
  const { load, fire } = a ? beats(a) : { load: 0, fire: 0 };
  if (n === 'axeSweep') {
    legs(b, 0.62 * load, 0.74 * fire);
    rot(b.hips, 0, -0.26 * load + 0.33 * fire, 0);
    rot(b.spine, 0.19 * fire, -0.35 * load + 0.35 * fire, -0.13 * load + 0.16 * fire);
    off.z += 0.28 * fire - 0.10 * load;
    hold(b, -0.34 - 0.15 * load + 0.28 * fire, 1.22 - 0.11 * load, 0.30 - 0.17 * load + 0.17 * fire,
      -1.15 + 1.06 * load + 1.15 * fire, -0.76 - 0.85 * load + 1.65 * fire, 0.18, -0.3);
    return;
  }
  if (a && n === 'axeChop') {
    const hit = snap(k, [[0, 0], [a.at * 0.82, 0], [a.at, 1], [1, 1]]);
    if (hit > 0.999) { plantAxe(b, off, t, 1); return; }
    const lift = load, s = Math.max(hit, lift);
    legs(b, 0.29 * lift, 0.83 * hit);
    rot(b.spine, -0.23 * lift + 0.56 * hit, 0, 0);
    rot(b.neck, -0.25 * lift - 0.32 * hit, 0, 0);
    off.z += 0.26 * hit - 0.08 * lift;
    hold(b, -0.34 + 0.15 * lift + 0.21 * hit, 1.22 + 0.72 * lift - 0.19 * hit,
      0.30 - 0.39 * lift + 0.20 * hit, -1.15 - 0.82 * lift + 1.258 * hit, -0.76 * (1 - s), 0.18 + 1.07 * hit, -0.26);
    return;
  }
  if (n === 'axeStuck') {
    const push = curve(k, [[0, 1], [0.71, 1], [1, 0]]);
    plantAxe(b, off, t, push, Math.abs(Math.sin(k * 14)) * push);
    return;
  }
  if (a && (n === 'ram' || n === 'ramRun')) {
    const runTime = n === 'ramRun' ? a.t : 0;
    const rush = n === 'ramRun' ? curve(runTime, [[0, 1], [0.49, 1], [a.dur, 0]]) : fire;
    const step = Math.sin(runTime * 30) * rush;
    legs(b, 0.68 * load + 0.17 * rush, 0.34 * rush);
    rot(b.legL, step * 0.83, 0, 0); rot(b.legR, -step * 0.83, 0, 0);
    rot(b.shinL, 0.84 * Math.max(0, step), 0, 0); rot(b.shinR, 0.84 * Math.max(0, -step), 0, 0);
    rot(b.spine, 0.27 * load + 0.36 * rush, -0.20 * rush, 0);
    mov(b.hips, 0, Math.abs(step) * 0.07, 0);
    hold(b, -0.34, 1.22 - 0.2 * rush, 0.3 + 0.07 * rush, -1.15 + 1.06 * Math.max(load, rush), -0.76 - 0.68 * Math.max(load, rush), 0.18, -0.26);
    return;
  }
  if (n === 'dazed') {
    const stun = curve(k, [[0, 1], [0.15, 0.85], [0.72, 0.7], [1, 0]]);
    legs(b, 0.7 * stun, 0.15 * stun);
    rot(b.spine, 0.45 * stun, 0, 0.27 * Math.sin(t * 5) * stun);
    rot(b.neck, -0.28 * stun, 0, -0.18 * Math.sin(t * 5) * stun);
    hold(b, -0.34, 1.19 - 0.19 * stun, 0.28, -1.15 + 1.57 * stun, -0.76 - 0.7 * stun);
    return;
  }
  if (n === 'axeThrow') {
    legs(b, 0.45 * load, 0.61 * fire);
    rot(b.spine, -0.31 * load + 0.38 * fire, -0.25 * load, 0);
    if (b.weapon.visible) hold(b, -0.34 + 0.17 * load, 1.22 + 0.72 * load, 0.3 - 0.53 * load, -1.15 - 0.99 * load, -0.76 + 0.72 * load, 0.18, 0.25);
    else {
      put(b.armR, -1.56 * fire, 0, -0.14 * fire); put(b.foreR, -0.32 - 0.35 * fire);
      put(b.armL, -1.67 * fire, 0, 0.19 * fire); put(b.foreL, -0.42 - 0.2 * fire);
    }
    return;
  }
  if (!b.weapon.visible) {
    const stride = (self as BattleActor).running ? Math.sin(t * 11) * 0.3 : 0;
    put(b.armR, -0.15 + stride, 0, -0.18); put(b.foreR, -0.34);
    put(b.armL, -0.22 - stride, 0, 0.18); put(b.foreL, -0.48);
    return;
  }
  if (n === 'catchAxe') {
    const catchIt = curve(k, [[0, 1], [0.22, 1], [0.56, 0.33], [1, 0]]);
    rot(b.spine, -0.18 * catchIt, 0, 0);
    hold(b, -0.34 + 0.08 * catchIt, 1.22 + 0.18 * catchIt, 0.3 + 0.26 * catchIt, -1.15 + 0.8 * catchIt, -0.76 + 0.55 * catchIt, 0.18, 0.23);
    return;
  }
  if (n === 'kick') {
    rot(b.spine, -0.30 * load - 0.33 * fire, -0.27 * fire, 0);
    rot(b.neck, 0.28 * (load + fire), 0, 0);
    put(b.legL, -0.66 * load - 1.31 * fire);
    put(b.shinL, 1.24 * load + 0.16 * fire); put(b.footL, 0.1 * load + 0.54 * fire);
    put(b.armL, 0.38 * fire, 0, 0.28 * fire); put(b.foreL, -0.5 - 0.6 * load);
    const spill = curve(k, [[0, 0], [a!.at, 0], [0.92, 1]]);
    mov(b.trough, 0, 0.48 * Math.sin(spill * PI) - 0.30 * spill, 1.15 * spill);
    rot(b.trough, 3.2 * spill, 0.58 * spill, 0.35 * spill);
    hold(b, -0.34 - 0.13 * fire, 1.22, 0.3 - 0.24 * fire, -1.15, -0.76 - 0.64 * fire, 0.18);
    return;
  }
  if (n === 'rip' && a) {
    const tear = 0.7 / a.dur;
    const grab = curve(k, [[0, 0], [tear * 0.55, 1], [tear * 0.84, 1], [tear, 0]]);
    const shout = snap(k, [[0, 0], [tear * 0.84, 0], [tear, 1], [0.74, 0.92], [1, 0]]);
    legs(b, 0.8 * grab + 0.34 * shout, 0);
    rot(b.spine, 0.27 * grab - 0.37 * shout, 0, 0);
    rot(b.neck, -0.32 * shout, 0, 0); rot(b.jaw, 0.72 * shout, 0, 0);
    rot(b.armorChest, 0.22 * grab, 0, 0);
    const q = aim(-0.65 - 0.21 * shout, -0.8 - 0.77 * shout);
    handAt(b, 'R', handPoint.set(-0.34 + 0.18 * grab - 0.36 * shout, 1.22 + 0.24 * grab + 0.04 * shout, 0.3 + 0.07 * grab - 0.15 * shout), q);
    handAt(b, 'L', handPoint.set(0.44 - 0.24 * grab + 0.29 * shout, 1.08 + 0.43 * grab + 0.20 * shout, 0.14 + 0.15 * grab - 0.22 * shout), aim(-0.64, 0.72 + 0.9 * shout), false);
    put(b.weapon);
    return;
  }
  axeReady(b, t);
};
