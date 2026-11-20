// act-114 三国名将动作（赵云、吕布、夏侯惇、陆逊）：
//   严格遵循不穿模、脚贴地、长袍收小步幅（陆逊）以及兵器真实参与出招的原则。
import { rot, mov, curve, type Action, type Bone } from '../../actors/rig';
import { POSE_HOOKS, type PoseFn } from '../../bestiary/poseHooks';
import { attackBeats, attackBody } from './foe_motion';
import { stance, engagement } from './weapon_pose';
import type * as THREE from 'three';

type Bones = Record<string, Bone>;

function clothSway(b: Bones, t: number, speed = 0) {
  const w = 0.08 + speed * 0.16;
  if (b.clA1) rot(b.clA1, w + Math.sin(t * 2.4) * 0.06, 0, Math.sin(t * 1.7) * 0.04);
  if (b.clA2) rot(b.clA2, w * 0.7 + Math.sin(t * 2.4 - 0.8) * 0.08, 0, Math.sin(t * 1.7 - 0.6) * 0.05);
  // Lu Bu twin pheasant plumes
  if (b.plL1) rot(b.plL1, 0.05 + Math.sin(t * 3.1) * 0.07 + speed * 0.14, 0, Math.sin(t * 2.1) * 0.05);
  if (b.plL2) rot(b.plL2, Math.sin(t * 3.1 - 0.9) * 0.10, 0, Math.sin(t * 2.1 - 0.7) * 0.07);
  if (b.plR1) rot(b.plR1, 0.05 + Math.sin(t * 3.1 + 0.5) * 0.07 + speed * 0.14, 0, -Math.sin(t * 2.1 + 0.4) * 0.05);
  if (b.plR2) rot(b.plR2, Math.sin(t * 3.1 - 0.4) * 0.10, 0, -Math.sin(t * 2.1 - 0.3) * 0.07);
  // Lu Xun robe hem: gentle sway, never penetrated by feet
  if (b.robe1) rot(b.robe1, 0.02 + speed * 0.06, 0, Math.sin(t * 1.6) * 0.02);
  if (b.robe2) rot(b.robe2, 0.03 + speed * 0.08, 0, Math.sin(t * 1.6 - 0.5) * 0.025);
}

function commonShared(b: Bones, a: Action | null, off: THREE.Vector3): boolean {
  if (!a) return true;
  const k = a.k;
  if (a.name === 'roar') {
    const s = curve(k, [[0, 0], [0.25, 1], [0.78, 1], [1, 0]]);
    rot(b.spine, -0.22 * s, 0, 0); rot(b.neck, -0.2 * s, 0, 0);
    rot(b.armL, -0.8 * s, 0, 0.5 * s); rot(b.armR, -1.1 * s, 0, -0.4 * s);
    off.y += 0.06 * s;
    return true;
  }
  if (a.name === 'salute') {
    const s = curve(k, [[0, 0], [0.25, 1], [0.75, 1], [1, 0]]);
    rot(b.spine, 0.14 * s, 0, 0); rot(b.neck, 0.08 * s, 0, 0);
    rot(b.armL, -0.85 * s, -0.35 * s, -0.25 * s); rot(b.foreL, -1.1 * s, 0, 0);
    rot(b.armR, -0.65 * s, 0.25 * s, 0.2 * s); rot(b.foreR, -0.95 * s, 0, 0);
    return true;
  }
  return a.name !== 'attack' && a.name !== 'cast';
}

/** 赵云：枪术凌厉舒展（平刺 / 扫枪） */
const zhaoPose: PoseFn = (b, t, a, off, self) => {
  const br = Math.sin(t * 2.4), moving = !!(self as { running?: boolean } | undefined)?.running;
  mov(b.hips, 0, br * 0.014, 0);
  rot(b.spine, 0.05 + br * 0.02, -0.18, 0); rot(b.neck, -0.04, 0.16, 0);
  // Two-hand spear guard stance (spear angled cleanly across front, never clipping torso)
  rot(b.armR, -0.35, 0, -0.18); rot(b.foreR, -0.95, 0, 0); rot(b.weapon, -0.18, 0.15, 0);
  rot(b.armL, -0.58, -0.32, 0.06); rot(b.foreL, -0.85, 0, 0);
  clothSway(b, t, moving ? 1 : 0);
  if (commonShared(b, a, off)) return;
  const m = attackBeats(a!, false), { load, hit, hip, chest } = m, w = engagement(a!);
  attackBody(b, m, 'melee');
  const sweep = a!.data.atk === 'sweep';
  if (sweep) {
    const yaw = -0.75 * load + 0.85 * chest;
    rot(b.spine, 0.15 * chest, yaw, 0);
    rot(b.armR, -0.7 * load - 0.55 * hit, -0.4 * load + 0.9 * hit, -0.25);
    rot(b.foreR, -0.7 * load - 0.2 * hit, 0, 0);
    rot(b.weapon, 0.15, -0.55 * load + 0.8 * hit, 0);
    rot(b.armL, -0.6 * load + 0.2 * hit, 0, 0.3 * hit);
    stance(b, w, 0.22 * hip);
  } else {
    // Dragon-gall straight spear thrust
    rot(b.spine, 0.12 * chest, -0.35 * load + 0.28 * hit, 0);
    rot(b.armR, 0.35 * load - 1.38 * hit, 0, -0.1);
    rot(b.foreR, -1.25 * load - 0.1 * hit, 0, 0);
    rot(b.weapon, -0.08 * hit, 0, 0);
    rot(b.armL, -0.65 * load - 0.85 * hit, -0.25, 0.1);
    rot(b.foreL, -0.9 * load - 0.2 * hit, 0, 0);
    stance(b, w, 0.38 * hip);
    off.z = -0.18 * load + 0.45 * hip;
  }
};

/** 吕布：方天画戟大开大合（横扫 / 跃砸 / 突刺） */
const lubuPose: PoseFn = (b, t, a, off, self) => {
  const br = Math.sin(t * 2.0), moving = !!(self as { running?: boolean } | undefined)?.running;
  mov(b.hips, 0, br * 0.018, 0);
  rot(b.spine, 0.03 + br * 0.02, -0.12, 0); rot(b.neck, -0.05, 0.1, 0);
  // Halberd held proudly outward & slightly forward at right side (clear of crown & pheasant plumes!)
  rot(b.armR, -0.25, 0, -0.32); rot(b.foreR, -0.45, 0, 0); rot(b.weapon, -0.22, 0.12, -0.14);
  rot(b.armL, 0.12, 0, 0.18); rot(b.foreL, -0.35, 0, 0);
  clothSway(b, t, moving ? 1 : 0);
  if (commonShared(b, a, off)) return;
  const m = attackBeats(a!, true), { load, hit, hip, chest } = m, w = engagement(a!);
  attackBody(b, m, 'melee');
  const atk = a!.data.atk;
  if (atk === 'slam') {
    const leap = Math.sin(Math.min(1, a!.k / Math.max(0.1, a!.at)) * Math.PI);
    off.y += leap * 0.85;
    rot(b.spine, -0.25 * load + 0.45 * hit, 0, 0);
    rot(b.armR, -2.5 * load + 0.15 * hit, 0, -0.18);
    rot(b.foreR, -0.45 * load - 0.25 * hit, 0, 0);
    rot(b.armL, -2.3 * load + 0.2 * hit, 0, 0.18);
    rot(b.foreL, -0.5 * load - 0.2 * hit, 0, 0);
    rot(b.weapon, -0.6 * load + 0.85 * hit, 0, 0);
    stance(b, w, 0.35 * hip);
  } else if (atk === 'thrust') {
    rot(b.spine, 0.14 * chest, -0.45 * load + 0.35 * hit, 0);
    rot(b.armR, 0.45 * load - 1.45 * hit, 0, -0.12);
    rot(b.foreR, -1.2 * load - 0.1 * hit, 0, 0);
    rot(b.weapon, -0.05, 0, 0);
    rot(b.armL, -0.5 * load + 0.4 * hit, 0, 0.25);
    stance(b, w, 0.42 * hip);
    off.z = -0.2 * load + 0.5 * hip;
  } else {
    // Wide crescent halberd sweep
    const yaw = -0.9 * load + 1.05 * chest;
    rot(b.spine, 0.12 * chest, yaw, 0);
    rot(b.armR, -0.8 * load - 0.5 * hit, -0.65 * load + 0.95 * hit, -0.35);
    rot(b.foreR, -0.65 * load - 0.15 * hit, 0, 0);
    rot(b.weapon, 0.12, -0.75 * load + 0.85 * hit, 0);
    rot(b.armL, -0.4 * load + 0.55 * hit, 0, 0.35);
    stance(b, w, 0.28 * hip);
  }
};

/** 夏侯惇：刚猛沉重的单手/双手重刀（劈斩 / 突进斩） */
const xiahoudunPose: PoseFn = (b, t, a, off, self) => {
  const br = Math.sin(t * 2.1), moving = !!(self as { running?: boolean } | undefined)?.running;
  mov(b.hips, 0, br * 0.016, 0);
  rot(b.spine, 0.08 + br * 0.02, -0.1, 0); rot(b.neck, -0.04, 0.08, 0);
  // Heavy sabre resting low-forward at right flank
  rot(b.armR, -0.3, 0, -0.18); rot(b.foreR, -0.85, 0, 0); rot(b.weapon, -0.25, 0, 0);
  rot(b.armL, -0.12, 0, 0.16); rot(b.foreL, -0.45, 0, 0);
  clothSway(b, t, moving ? 1 : 0);
  if (commonShared(b, a, off)) return;
  const m = attackBeats(a!, true), { load, hit, hip, chest } = m, w = engagement(a!);
  attackBody(b, m, 'melee');
  if (a!.data.atk === 'cleave') {
    rot(b.spine, -0.22 * load + 0.42 * hit, -0.25 * load + 0.35 * hit, 0);
    rot(b.armR, -2.35 * load + 0.1 * hit, 0, -0.22);
    rot(b.foreR, -0.55 * load - 0.2 * hit, 0, 0);
    rot(b.weapon, -0.55 * load + 0.8 * hit, 0, 0);
    rot(b.armL, -0.5 * load + 0.55 * hit, 0, 0.3);
    stance(b, w, 0.34 * hip);
  } else {
    const yaw = -0.85 * load + 0.95 * chest;
    rot(b.spine, 0.18 * chest, yaw, 0);
    rot(b.armR, -0.75 * load - 0.45 * hit, -0.6 * load + 0.9 * hit, -0.28);
    rot(b.foreR, -0.7 * load - 0.15 * hit, 0, 0);
    rot(b.weapon, 0.05, -0.55 * load + 0.75 * hit, 0);
    rot(b.armL, -0.35 * load + 0.5 * hit, 0, 0.32);
    stance(b, w, 0.32 * hip);
    off.z = -0.12 * load + 0.36 * hip;
  }
};

/** 陆逊：儒雅清逸的吴钩剑法（长袍步行收小腿幅防穿帮） */
const luxunPose: PoseFn = (b, t, a, off, self) => {
  const br = Math.sin(t * 2.2), moving = !!(self as { running?: boolean } | undefined)?.running;
  mov(b.hips, 0, br * 0.012, 0);
  rot(b.spine, 0.02 + br * 0.015, -0.14, 0); rot(b.neck, -0.03, 0.12, 0);
  rot(b.armR, -0.45, 0, -0.12); rot(b.foreR, -0.95, 0, 0); rot(b.weapon, -0.35, 0, 0);
  rot(b.armL, 0.22, 0, 0.18); rot(b.foreL, -0.78, 0, 0); // left hand poised behind waist
  // Dampen leg swing inside scholar robe so boots NEVER poke through robe1/robe2
  for (const s of ['L', 'R'] as const) {
    if (b['leg' + s]) b['leg' + s].rotation.x *= 0.22;
    if (b['shin' + s]) b['shin' + s].rotation.x *= 0.22;
  }
  clothSway(b, t, moving ? 0.7 : 0);
  if (commonShared(b, a, off)) return;
  const m = attackBeats(a!, false), { load, hit, hip, chest } = m, w = engagement(a!);
  attackBody(b, m, a!.name === 'cast' ? 'cast' : 'melee');
  const yaw = -0.65 * load + 0.75 * chest;
  rot(b.spine, 0.12 * chest, yaw, 0);
  rot(b.armR, -1.05 * load - 0.35 * hit, -0.45 * load + 0.85 * hit, -0.18);
  rot(b.foreR, -0.75 * load - 0.12 * hit, 0, 0);
  rot(b.weapon, -0.25 * load + 0.45 * hit, -0.4 * load + 0.65 * hit, 0);
  rot(b.armL, -0.4 * load + 0.45 * hit, 0, 0.28);
  stance(b, w * 0.4, 0.14 * hip); // keep feet safely inside robe hem!
};

POSE_HOOKS.gen_zhaoyun = zhaoPose;
POSE_HOOKS.gen_lubu = lubuPose;
POSE_HOOKS.gen_xiahoudun = xiahoudunPose;
POSE_HOOKS.gen_luxun = luxunPose;
