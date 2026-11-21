// act-114 / 主角级招式与物理重构：三国四大名将（赵云、吕布、夏侯惇、陆逊）
//   - 真实阻尼弹簧二级物理：披风（clA1/2）、吕布三节双雉鸡翎（plL1..3 / plR1..3）、赵云双节红盔缨（zpA1/2）与枪缨（spT1）、
//     夏侯惇朱红发带（hbA1/2）、陆逊素白玉冠飘带（crA1/2）与两节儒袍下摆（robe1/2），随位移与转身扭矩甩动；
//   - 实机实时贴武器尖端 3D 体素刀/枪/戟光（slashArc.generalStep），与主角同款 1 draw call 世界轴对齐发光体素块；
//   - 每位名将拥有 3～4 套辨识度极高的专属招式与连段动作（多段连刺 / 360° 旋扫 / 跃空裂地 / 反手连斩 / 剑指焚江）。
import * as THREE from 'three';
import { rot, mov, curve, type Action, type Bone } from '../../actors/rig';
import { POSE_HOOKS, type PoseFn } from '../../bestiary/poseHooks';
import { attackBeats, attackBody } from './foe_motion';
import { stance, engagement } from './weapon_pose';
import { slashArc } from '../slashArc';

type Bones = Record<string, Bone>;
type GenPal = 'zhaoyun' | 'lubu' | 'xiahoudun' | 'luxun';

interface Spr2 { x: number; vx: number; z: number; vz: number }
interface GenMem {
  t: number;
  lastX: number;
  lastZ: number;
  lastYaw: number;
  spd: number;
  yawRate: number;
  spr: Map<string, Spr2>;
  trailOn: boolean;
  prevRoot: THREE.Vector3;
  prevTip: THREE.Vector3;
}

const MEM = new WeakMap<object, GenMem>();
const _root = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _wRoot = new THREE.Vector3();
const _wTip = new THREE.Vector3();
const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const wrapAng = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Asymmetric natural martial breath (faster inhale, settled exhale — matches hero & NPC polish) */
function asymBreath(t: number, period: number) {
  const u = ((t / period) % 1 + 1) % 1;
  return u < 0.4 ? Math.sin((u / 0.4) * Math.PI * 0.5) ** 1.25 * 2 - 1 : Math.cos(((u - 0.4) / 0.6) * Math.PI);
}

function getMem(key: object, t: number, self: unknown): { mem: GenMem; dt: number } {
  const actor = self as { home?: THREE.Vector3; yaw?: number; running?: boolean } | undefined;
  const hx = actor?.home?.x ?? 0, hz = actor?.home?.z ?? 0, yaw = actor?.yaw ?? 0;
  let mem = MEM.get(key);
  if (!mem || t < mem.t - 1e-4 || t - mem.t > 0.5) {
    mem = {
      t, lastX: hx, lastZ: hz, lastYaw: yaw, spd: actor?.running ? 3.0 : 0, yawRate: 0,
      spr: new Map(), trailOn: false, prevRoot: new THREE.Vector3(), prevTip: new THREE.Vector3(),
    };
    MEM.set(key, mem);
    return { mem, dt: 0 };
  }
  const dt = Math.min(0.05, Math.max(0, t - mem.t));
  mem.t = t;
  if (dt > 0) {
    const dist = Math.hypot(hx - mem.lastX, hz - mem.lastZ);
    const rawSpd = dist < 2.2 ? dist / dt : (actor?.running ? 3.2 : 0);
    const k = 1 - Math.exp(-dt * 12);
    mem.spd += ((actor?.running ? Math.max(rawSpd, 2.4) : rawSpd) - mem.spd) * k;
    const rawYaw = wrapAng(yaw - mem.lastYaw) / dt;
    mem.yawRate += (Math.max(-9, Math.min(9, rawYaw)) - mem.yawRate) * k;
    mem.lastX = hx; mem.lastZ = hz; mem.lastYaw = yaw;
  }
  return { mem, dt };
}

function stepSpr(mem: GenMem, id: string, tx: number, tz: number, dt: number, stiff: number, zeta = 0.58): Spr2 {
  let s = mem.spr.get(id);
  if (!s) { s = { x: tx, vx: 0, z: tz, vz: 0 }; mem.spr.set(id, s); return s; }
  if (dt <= 0) return s;
  const sub = dt > 0.02 ? 2 : 1, h = dt / sub, damp = 2 * zeta * Math.sqrt(stiff);
  for (let i = 0; i < sub; i++) {
    s.vx += ((tx - s.x) * stiff - s.vx * damp) * h; s.x += s.vx * h;
    s.vz += ((tz - s.z) * stiff - s.vz * damp) * h; s.z += s.vz * h;
  }
  return s;
}

/** True spring-damped secondary physics for capes, plumes, ribbons, spear tassels & scholar robes */
function genClothPhysics(b: Bones, mem: GenMem, t: number, dt: number, whip = 0, leap = 0) {
  const runK = Math.min(1.4, mem.spd / 3.4);
  const spin = Math.max(-1.2, Math.min(1.2, (mem.yawRate * 0.14) + whip));
  const breeze = Math.sin(t * 2.5) * 0.055;
  const sideB = Math.sin(t * 1.8) * 0.045;

  // 2-segment Battle Cloak (clA1 -> clA2)
  if (b.clA1) {
    const s1 = stepSpr(mem, 'cl1', 0.10 + runK * 0.42 + leap * 0.35 + breeze, sideB - spin * 0.34, dt, 34, 0.56);
    rot(b.clA1, s1.x, 0, s1.z);
    if (b.clA2) {
      const s2 = stepSpr(mem, 'cl2', s1.x * 0.55 + runK * 0.28 + Math.sin(t * 3.8 - 0.8) * (0.06 + runK * 0.08), s1.z * 0.72 + Math.sin(t * 2.3 - 0.7) * 0.06, dt, 24, 0.48);
      rot(b.clA2, s2.x, 0, s2.z);
    }
  }
  // Zhao Yun 2-segment crimson helm plume (zpA1 -> zpA2)
  if (b.zpA1) {
    const s1 = stepSpr(mem, 'zp1', 0.06 + runK * 0.38 + leap * 0.28 + Math.sin(t * 3.2) * 0.06, -spin * 0.30 + Math.sin(t * 2.2) * 0.04, dt, 42, 0.52);
    rot(b.zpA1, s1.x, 0, s1.z);
    if (b.zpA2) {
      const s2 = stepSpr(mem, 'zp2', s1.x * 0.62 + Math.sin(t * 4.4 - 0.9) * (0.07 + runK * 0.1), s1.z * 0.8 + Math.sin(t * 2.6 - 0.8) * 0.07, dt, 28, 0.44);
      rot(b.zpA2, s2.x, 0, s2.z);
    }
  }
  // Lu Bu twin 3-segment sweeping pheasant tail plumes (plL1..3 / plR1..3)
  for (const [L, dir, ph] of [['L', 1, 0], ['R', -1, 0.55]] as const) {
    const b1 = b['pl' + L + '1'], b2 = b['pl' + L + '2'], b3 = b['pl' + L + '3'];
    if (!b1) continue;
    const s1 = stepSpr(mem, 'pl' + L + '1', 0.04 + runK * 0.28 + leap * 0.32 + Math.sin(t * 3.0 + ph) * 0.06, dir * 0.04 - spin * 0.26 + Math.sin(t * 2.1 + ph) * 0.05, dt, 38, 0.50);
    rot(b1, s1.x, 0, s1.z);
    if (b2) {
      const s2 = stepSpr(mem, 'pl' + L + '2', s1.x * 0.65 + Math.sin(t * 3.8 + ph - 0.7) * (0.08 + runK * 0.08), s1.z * 0.75 + Math.sin(t * 2.5 + ph - 0.6) * 0.07, dt, 26, 0.44);
      rot(b2, s2.x, 0, s2.z);
      if (b3) {
        const s3 = stepSpr(mem, 'pl' + L + '3', s2.x * 0.7 + Math.sin(t * 4.6 + ph - 1.3) * (0.10 + runK * 0.12), s2.z * 0.8 + Math.sin(t * 3.1 + ph - 1.1) * 0.09, dt, 20, 0.40);
        rot(b3, s3.x, 0, s3.z);
      }
    }
  }
  // Xiahou Dun crimson headband tails (hbA1 -> hbA2)
  if (b.hbA1) {
    const s1 = stepSpr(mem, 'hb1', 0.08 + runK * 0.44 + Math.sin(t * 3.4) * 0.07, -spin * 0.35 + Math.sin(t * 2.4) * 0.05, dt, 40, 0.48);
    rot(b.hbA1, s1.x, 0, s1.z);
    if (b.hbA2) {
      const s2 = stepSpr(mem, 'hb2', s1.x * 0.68 + Math.sin(t * 4.6 - 0.8) * (0.09 + runK * 0.12), s1.z * 0.85, dt, 26, 0.42);
      rot(b.hbA2, s2.x, 0, s2.z);
    }
  }
  // Lu Xun ivory crown ribbons (crA1 -> crA2) & scholar robe (robe1 -> robe2)
  if (b.crA1) {
    const s1 = stepSpr(mem, 'cr1', 0.08 + runK * 0.42 + Math.sin(t * 3.0) * 0.07, -spin * 0.34 + Math.sin(t * 2.1) * 0.05, dt, 38, 0.46);
    rot(b.crA1, s1.x, 0, s1.z);
    if (b.crA2) {
      const s2 = stepSpr(mem, 'cr2', s1.x * 0.7 + Math.sin(t * 4.2 - 0.9) * (0.09 + runK * 0.11), s1.z * 0.82, dt, 24, 0.40);
      rot(b.crA2, s2.x, 0, s2.z);
    }
  }
  if (b.robe1) {
    const r1 = stepSpr(mem, 'rb1', 0.02 + runK * 0.09 + Math.sin(t * 1.8) * 0.015, -spin * 0.06, dt, 36, 0.68);
    rot(b.robe1, r1.x, 0, r1.z);
    if (b.robe2) {
      const r2 = stepSpr(mem, 'rb2', r1.x * 0.72 + Math.sin(t * 2.4 - 0.6) * 0.025, r1.z * 0.7, dt, 26, 0.62);
      rot(b.robe2, r2.x, 0, r2.z);
    }
  }
  // Spear / Halberd fluttering crimson tassel (spT1)
  if (b.spT1) {
    const st = stepSpr(mem, 'spT', 0.12 + runK * 0.45 + Math.abs(whip) * 0.55 + Math.sin(t * 4.8) * 0.08, -spin * 0.45, dt, 48, 0.42);
    rot(b.spT1, st.x, 0, st.z);
  }
}

/** Real-time 3D voxel weapon-light emitter glued directly to the general's real weapon root & tip */
function emitWeaponTrail(
  b: Bones, mem: GenMem, self: unknown,
  active: boolean, pal: GenPal, rootZCells: number, tipZCells: number,
  heavy = false, isThrust = false,
) {
  const actor = self as { root?: THREE.Object3D; cy?: number } | undefined;
  if (!active || !b.weapon || !actor?.root?.parent) {
    mem.trailOn = false;
    return;
  }
  const s = actor.cy ?? 0.035;
  actor.root.updateMatrixWorld(true);
  _root.set(0, 0, rootZCells * s);
  _tip.set(0, 0, tipZCells * s);
  _wRoot.copy(_root);
  _wTip.copy(_tip);
  b.weapon.localToWorld(_wRoot);
  b.weapon.localToWorld(_wTip);
  if (mem.trailOn) {
    slashArc.generalStep(mem.prevRoot, mem.prevTip, _wRoot, _wTip, pal, heavy, isThrust);
  }
  mem.prevRoot.copy(_wRoot);
  mem.prevTip.copy(_wTip);
  mem.trailOn = true;
}

function commonShared(b: Bones, a: Action | null, off: THREE.Vector3): boolean {
  if (!a) return true;
  const k = a.k;
  if (a.name === 'roar') {
    const s = curve(k, [[0, 0], [0.22, 1], [0.76, 1], [1, 0]]);
    rot(b.spine, -0.24 * s, 0, 0); rot(b.neck, -0.22 * s, 0, 0);
    rot(b.armL, -0.95 * s, 0, 0.62 * s); rot(b.foreL, -0.4 * s, 0, 0);
    rot(b.armR, -1.25 * s, 0, -0.52 * s); rot(b.foreR, -0.35 * s, 0, 0);
    off.y += 0.08 * s;
    return true;
  }
  if (a.name === 'salute') {
    const s = curve(k, [[0, 0], [0.22, 1], [0.78, 1], [1, 0]]);
    rot(b.spine, 0.14 * s, 0, 0); rot(b.neck, 0.08 * s, 0, 0);
    rot(b.armL, -0.92 * s, -0.42 * s, -0.22 * s); rot(b.foreL, -1.18 * s, 0, 0);
    rot(b.armR, -0.72 * s, 0.32 * s, 0.22 * s); rot(b.foreR, -1.02 * s, 0, 0);
    return true;
  }
  return a.name !== 'attack' && a.name !== 'cast';
}

// ================================================================== 1. 赵云（常山赵子龙 · 游龙七探枪法）
const zhaoPose: PoseFn = (b, t, a, off, self) => {
  const { mem, dt } = getMem(self ?? b, t, self);
  const br = asymBreath(t, 2.8);
  mov(b.hips, 0, br * 0.015, 0);
  rot(b.spine, 0.06 + br * 0.02, -0.22, 0); rot(b.neck, -0.05, 0.20, 0);
  // Heroic two-handed dragon-spear guard stance
  rot(b.armR, -0.34, 0, -0.18); rot(b.foreR, -0.92, 0, 0); rot(b.weapon, -0.16, 0.18, 0);
  rot(b.armL, -0.62, -0.34, 0.08); rot(b.foreL, -0.88, 0, 0);

  if (commonShared(b, a, off)) {
    genClothPhysics(b, mem, t, dt, 0, 0);
    emitWeaponTrail(b, mem, self, false, 'zhaoyun', 22, 51);
    return;
  }
  const atk = String(a!.data.atk ?? 'thrust');
  const m = attackBeats(a!, false), { load, hit, hip, chest } = m, w = engagement(a!);
  attackBody(b, m, 'melee');
  let whip = 0, leap = 0, trailOn = false, isThrust = false, heavy = false;

  if (atk === 'flurry') {
    // 七探蛇盘三连刺: 3 lightning-fast staccato dragon spear stabs (left -> center -> right)!
    const u = clamp01((a!.k - 0.14) / 0.72);
    const seg = Math.min(2, Math.floor(u * 3));
    const su = (u * 3) - seg;
    const jab = Math.sin(Math.min(1, su / 0.75) * Math.PI);
    const aimY = (seg - 1) * 0.24;
    const aimX = (seg === 1 ? -0.08 : 0.06);
    rot(b.hips, 0, -0.28 + jab * 0.45 + aimY * 0.4, 0);
    rot(b.spine, 0.12 + jab * 0.14, -0.22 + jab * 0.42 + aimY, 0);
    rot(b.neck, -0.10, -aimY * 0.7, 0);
    rot(b.armR, 0.48 - jab * 1.95 + aimX, aimY * 0.5, -0.12);
    rot(b.foreR, -1.35 + jab * 1.25, 0, 0);
    rot(b.weapon, -0.08 * jab, aimY * 0.4, 0);
    rot(b.armL, -0.58 - jab * 0.42, -0.32, 0.16);
    rot(b.foreL, -0.95 + jab * 0.65, 0, 0);
    stance(b, w, 0.28 + 0.16 * jab);
    off.z = 0.12 + 0.34 * jab;
    whip = jab * (seg === 0 ? -0.9 : seg === 2 ? 0.9 : 0.3);
    trailOn = a!.k >= 0.16 && a!.k <= 0.86;
    isThrust = true;
  } else if (atk === 'sweep') {
    // 回马盘龙 360° 旋扫: full spinning silver dragon sweep!
    const spin = curve(a!.k, [[0, -0.45], [0.22, -0.85], [0.64, TAU - 0.25], [1, TAU]]);
    rot(b.hips, 0, spin, 0);
    rot(b.spine, 0.16 * chest, 0.28 * hit, 0);
    rot(b.armR, -0.65 * load - 0.62 * hit, -0.35 * load + 0.75 * hit, -0.45);
    rot(b.foreR, -0.55 * load - 0.12 * hit, 0, 0);
    rot(b.weapon, 0.12, -0.45 * load + 0.92 * hit, 0);
    rot(b.armL, -0.45 * load + 0.35 * hit, 0, 0.55 * hit);
    stance(b, w, 0.26 * hip);
    whip = hit * 1.2;
    trailOn = a!.k >= a!.at - 0.18 && a!.k <= a!.at + 0.26;
    heavy = true;
  } else if (atk === 'dragonDive') {
    // 惊龙升空挑斩: agile upward leap & downward silver-dragon strike!
    leap = Math.sin(Math.min(1, a!.k / 0.72) * Math.PI);
    off.y += leap * 0.72;
    off.z += 0.35 * hip;
    rot(b.spine, -0.25 * load + 0.42 * hit, -0.2 * load + 0.25 * hit, 0);
    rot(b.armR, -2.35 * load - 0.15 * hit, 0.15 * hit, -0.20);
    rot(b.foreR, -0.55 * load - 0.15 * hit, 0, 0);
    rot(b.weapon, -0.5 * load + 0.75 * hit, 0, 0);
    rot(b.armL, -1.8 * load + 0.45 * hit, 0, 0.35);
    stance(b, w, 0.32 * hip);
    whip = hit * 0.8;
    trailOn = a!.k >= a!.at - 0.16 && a!.k <= a!.at + 0.22;
    heavy = true;
  } else {
    // 游龙穿云刺: coiled dragon lunge thrust!
    rot(b.hips, 0, -0.35 * load + 0.28 * hit, 0);
    rot(b.spine, 0.16 * chest, -0.42 * load + 0.36 * hit, 0);
    rot(b.neck, -0.10 * chest, 0.35 * load - 0.28 * hit, 0);
    rot(b.armR, 0.52 * load - 1.52 * hit, 0, -0.10);
    rot(b.foreR, -1.32 * load - 0.06 * hit, 0, 0);
    rot(b.weapon, -0.06 * hit, 0, 0);
    rot(b.armL, -0.68 * load - 0.82 * hit, -0.28, 0.12);
    rot(b.foreL, -0.95 * load - 0.12 * hit, 0, 0);
    stance(b, w, 0.46 * hip);
    off.z = -0.22 * load + 0.56 * hip;
    whip = hit * 0.65;
    trailOn = a!.k >= a!.at - 0.14 && a!.k <= a!.at + 0.20;
    isThrust = true;
  }
  genClothPhysics(b, mem, t, dt, whip, leap);
  emitWeaponTrail(b, mem, self, trailOn, 'zhaoyun', 22, 51, heavy, isThrust);
};

// ================================================================== 2. 吕布（温侯战神 · 鬼神无双戟法）
const lubuPose: PoseFn = (b, t, a, off, self) => {
  const { mem, dt } = getMem(self ?? b, t, self);
  const br = asymBreath(t, 3.1);
  mov(b.hips, 0, br * 0.02, 0);
  rot(b.spine, 0.02 + br * 0.022, -0.16, 0); rot(b.neck, -0.06, 0.14, 0);
  // Towering arrogant God-of-War halberd posture (held wide & proud, zero plume clipping)
  rot(b.armR, -0.22, 0, -0.34); rot(b.foreR, -0.42, 0, 0); rot(b.weapon, -0.20, 0.12, -0.14);
  rot(b.armL, 0.14, 0, 0.22); rot(b.foreL, -0.45, 0, 0);

  if (commonShared(b, a, off)) {
    genClothPhysics(b, mem, t, dt, 0, 0);
    emitWeaponTrail(b, mem, self, false, 'lubu', 24, 53);
    return;
  }
  const atk = String(a!.data.atk ?? 'sweep');
  const m = attackBeats(a!, true), { load, hit, hip, chest } = m, w = engagement(a!);
  attackBody(b, m, 'melee');
  let whip = 0, leap = 0, trailOn = false, isThrust = false;

  if (atk === 'slam') {
    // 鬼神跃空裂地砸: massive sky-high acrobatic leap -> crushing overhead halberd slam!
    leap = Math.sin(Math.min(1, a!.k / Math.max(0.12, a!.at)) * Math.PI);
    off.y += leap * 1.12;
    off.z += 0.35 * hip;
    rot(b.spine, -0.32 * load + 0.52 * hit, 0, 0);
    rot(b.neck, -0.15 * load - 0.18 * hit, 0, 0);
    rot(b.armR, -2.65 * load + 0.22 * hit, 0, -0.22);
    rot(b.foreR, -0.45 * load - 0.18 * hit, 0, 0);
    rot(b.armL, -2.45 * load + 0.25 * hit, 0, 0.22);
    rot(b.foreL, -0.52 * load - 0.18 * hit, 0, 0);
    rot(b.weapon, -0.68 * load + 0.92 * hit, 0, 0);
    // Mid-air knee tuck!
    if (b.legL) rot(b.legL, -0.65 * leap, 0, 0.1);
    if (b.shinL) rot(b.shinL, 1.05 * leap, 0, 0);
    if (b.legR) rot(b.legR, -0.45 * leap, 0, -0.1);
    if (b.shinR) rot(b.shinR, 0.85 * leap, 0, 0);
    stance(b, w * (1 - leap * 0.7), 0.38 * hip);
    whip = hit * 0.9;
    trailOn = a!.k >= a!.at - 0.16 && a!.k <= a!.at + 0.20;
  } else if (atk === 'whirl') {
    // 辕门旋风斩: full 360° unstoppable War-God halberd cyclone!
    const spin = curve(a!.k, [[0, -0.35], [0.24, -0.95], [0.68, TAU - 0.18], [1, TAU]]);
    rot(b.hips, 0, spin, 0);
    rot(b.spine, 0.18 * chest, 0.32 * hit, 0);
    rot(b.armR, -0.78 * load - 0.65 * hit, -0.45 * load + 0.85 * hit, -0.52);
    rot(b.foreR, -0.55 * load - 0.12 * hit, 0, 0);
    rot(b.weapon, 0.14, -0.65 * load + 0.95 * hit, 0);
    rot(b.armL, -0.55 * load + 0.55 * hit, 0, 0.55);
    stance(b, w, 0.32 * hip);
    whip = 1.4 * hit;
    trailOn = a!.k >= a!.at - 0.20 && a!.k <= a!.at + 0.28;
  } else if (atk === 'reverseSweep') {
    // 鬼神回戟反斩: ferocious left-to-right reverse crescent combo finisher!
    const yaw = 0.95 * load - 1.15 * chest;
    rot(b.hips, 0, yaw * 0.45, 0);
    rot(b.spine, 0.16 * chest, yaw, 0);
    rot(b.armR, -0.68 * load - 0.58 * hit, 0.85 * load - 0.95 * hit, -0.36);
    rot(b.foreR, -0.55 * load - 0.12 * hit, 0, 0);
    rot(b.weapon, 0.12, 0.85 * load - 0.95 * hit, 0);
    rot(b.armL, 0.35 * load - 0.55 * hit, 0, 0.38);
    stance(b, w, 0.36 * hip);
    off.z += 0.28 * hip;
    whip = -1.25 * hit;
    trailOn = a!.k >= a!.at - 0.15 && a!.k <= a!.at + 0.22;
  } else if (atk === 'thrust') {
    // 霸王穿阵突: explosive crimson-gold piercing halberd lunge!
    rot(b.hips, 0, -0.38 * load + 0.32 * hit, 0);
    rot(b.spine, 0.16 * chest, -0.48 * load + 0.38 * hit, 0);
    rot(b.armR, 0.55 * load - 1.55 * hit, 0, -0.14);
    rot(b.foreR, -1.25 * load - 0.08 * hit, 0, 0);
    rot(b.weapon, -0.05, 0, 0);
    rot(b.armL, -0.55 * load + 0.45 * hit, 0, 0.30);
    stance(b, w, 0.48 * hip);
    off.z = -0.24 * load + 0.60 * hip;
    whip = 0.75 * hit;
    trailOn = a!.k >= a!.at - 0.14 && a!.k <= a!.at + 0.20;
    isThrust = true;
  } else {
    // 戟裂长空横扫: monumental wide right-to-left halberd crescent cleave!
    const yaw = -0.98 * load + 1.12 * chest;
    rot(b.hips, 0, yaw * 0.42, 0);
    rot(b.spine, 0.14 * chest, yaw, 0);
    rot(b.armR, -0.82 * load - 0.52 * hit, -0.72 * load + 1.02 * hit, -0.38);
    rot(b.foreR, -0.62 * load - 0.14 * hit, 0, 0);
    rot(b.weapon, 0.14, -0.82 * load + 0.92 * hit, 0);
    rot(b.armL, -0.45 * load + 0.60 * hit, 0, 0.38);
    stance(b, w, 0.34 * hip);
    off.z += 0.22 * hip;
    whip = 1.2 * hit;
    trailOn = a!.k >= a!.at - 0.15 && a!.k <= a!.at + 0.22;
  }
  genClothPhysics(b, mem, t, dt, whip, leap);
  emitWeaponTrail(b, mem, self, trailOn, 'lubu', 24, 53, true, isThrust);
};

// ================================================================== 3. 夏侯惇（独眼猛将 · 拔矢断岳重刀）
const xiahoudunPose: PoseFn = (b, t, a, off, self) => {
  const { mem, dt } = getMem(self ?? b, t, self);
  const br = asymBreath(t, 2.9);
  mov(b.hips, 0, br * 0.017, 0);
  rot(b.spine, 0.09 + br * 0.022, -0.14, 0); rot(b.neck, -0.06, 0.12, 0);
  // Heavy prowling wolf heavy-cleaver guard
  rot(b.armR, -0.28, 0, -0.20); rot(b.foreR, -0.88, 0, 0); rot(b.weapon, -0.26, 0, 0);
  rot(b.armL, -0.16, 0, 0.18); rot(b.foreL, -0.50, 0, 0);

  if (commonShared(b, a, off)) {
    genClothPhysics(b, mem, t, dt, 0, 0);
    emitWeaponTrail(b, mem, self, false, 'xiahoudun', 10, 38);
    return;
  }
  const atk = String(a!.data.atk ?? 'slash');
  const m = attackBeats(a!, true), { load, hit, hip, chest } = m, w = engagement(a!);
  attackBody(b, m, 'melee');
  let whip = 0, leap = 0, trailOn = false;

  if (atk === 'cleave') {
    // 拔矢断岳劈: intimidating high two-handed overhead iron-mountain cleave!
    leap = Math.sin(Math.min(1, a!.k / Math.max(0.15, a!.at)) * Math.PI) * 0.45;
    off.y += leap * 0.45;
    rot(b.spine, -0.28 * load + 0.50 * hit, -0.22 * load + 0.30 * hit, 0);
    rot(b.armR, -2.55 * load + 0.22 * hit, 0, -0.24);
    rot(b.foreR, -0.52 * load - 0.18 * hit, 0, 0);
    rot(b.armL, -2.25 * load + 0.25 * hit, -0.25 * load, 0.24);
    rot(b.foreL, -0.55 * load - 0.18 * hit, 0, 0);
    rot(b.weapon, -0.62 * load + 0.88 * hit, 0, 0);
    stance(b, w, 0.38 * hip);
    whip = 0.85 * hit;
    trailOn = a!.k >= a!.at - 0.15 && a!.k <= a!.at + 0.20;
  } else if (atk === 'upSlash') {
    // 反手挑岳斩: ferocious low-to-high rising diagonal backhand cleaver uppercut!
    const yaw = 0.88 * load - 0.96 * chest;
    rot(b.hips, 0, yaw * 0.4, 0);
    rot(b.spine, 0.24 * load - 0.28 * hit, yaw, 0);
    rot(b.armR, 0.55 * load - 2.05 * hit, 0.65 * load - 0.72 * hit, -0.32);
    rot(b.foreR, -0.65 * load - 0.18 * hit, 0, 0);
    rot(b.weapon, 0.35 * load - 0.45 * hit, 0.55 * load - 0.65 * hit, 0);
    rot(b.armL, 0.3 * load - 0.6 * hit, 0, 0.34);
    stance(b, w, 0.34 * hip);
    off.z += 0.24 * hip;
    whip = -1.1 * hit;
    trailOn = a!.k >= a!.at - 0.15 && a!.k <= a!.at + 0.22;
  } else if (atk === 'dashCut') {
    // 独眼孤刃突袭: low predatory forward surge + razor horizontal slash!
    const yaw = -0.92 * load + 1.08 * chest;
    rot(b.hips, 0, yaw * 0.45, 0);
    rot(b.spine, 0.28 * load + 0.22 * hit, yaw, 0);
    rot(b.armR, -0.68 * load - 0.52 * hit, -0.75 * load + 0.98 * hit, -0.32);
    rot(b.foreR, -0.68 * load - 0.14 * hit, 0, 0);
    rot(b.weapon, 0.08, -0.65 * load + 0.85 * hit, 0);
    rot(b.armL, -0.45 * load + 0.55 * hit, 0, 0.36);
    stance(b, w, 0.48 * hip);
    off.z = -0.18 * load + 0.64 * hip;
    whip = 1.25 * hit;
    trailOn = a!.k >= a!.at - 0.15 && a!.k <= a!.at + 0.22;
  } else {
    // 狂澜重斩: thunderous stepping right-to-left iron cleave!
    const yaw = -0.92 * load + 1.02 * chest;
    rot(b.hips, 0, yaw * 0.4, 0);
    rot(b.spine, 0.18 * chest, yaw, 0);
    rot(b.armR, -0.78 * load - 0.48 * hit, -0.65 * load + 0.95 * hit, -0.30);
    rot(b.foreR, -0.68 * load - 0.14 * hit, 0, 0);
    rot(b.weapon, 0.08, -0.58 * load + 0.80 * hit, 0);
    rot(b.armL, -0.38 * load + 0.52 * hit, 0, 0.34);
    stance(b, w, 0.36 * hip);
    off.z = -0.14 * load + 0.38 * hip;
    whip = 1.05 * hit;
    trailOn = a!.k >= a!.at - 0.15 && a!.k <= a!.at + 0.22;
  }
  genClothPhysics(b, mem, t, dt, whip, leap);
  emitWeaponTrail(b, mem, self, trailOn, 'xiahoudun', 10, 38, true, false);
};

// ================================================================== 4. 陆逊（江东儒将 · 青冥焚江剑阵）
const luxunPose: PoseFn = (b, t, a, off, self) => {
  const { mem, dt } = getMem(self ?? b, t, self);
  const br = asymBreath(t, 3.2);
  mov(b.hips, 0, br * 0.012, 0);
  rot(b.spine, 0.02 + br * 0.015, -0.18, 0); rot(b.neck, -0.03, 0.16, 0);
  // Aristocratic poised sword-sage guard (Wu Jian angled cleanly, left sword-finger poised behind waist)
  rot(b.armR, -0.44, 0, -0.14); rot(b.foreR, -0.92, 0, 0); rot(b.weapon, -0.32, 0, 0);
  rot(b.armL, 0.24, 0, 0.20); rot(b.foreL, -0.82, 0, 0);
  // Dampen leg swing inside scholar robe so boots NEVER poke through robe1/robe2
  for (const s of ['L', 'R'] as const) {
    if (b['leg' + s]) b['leg' + s].rotation.x *= 0.20;
    if (b['shin' + s]) b['shin' + s].rotation.x *= 0.20;
  }

  if (commonShared(b, a, off)) {
    genClothPhysics(b, mem, t, dt, 0, 0);
    emitWeaponTrail(b, mem, self, false, 'luxun', 10, 36);
    return;
  }
  const atk = String(a!.data.atk ?? 'sweep');
  const m = attackBeats(a!, false), { load, hit, hip, chest } = m, w = engagement(a!);
  attackBody(b, m, a!.name === 'cast' ? 'cast' : 'melee');
  let whip = 0, trailOn = false, isThrust = false, heavy = false;

  if (atk === 'flurry') {
    // 惊鸿三连剑: graceful lightning 3-beat sword dance (left diag -> right diag -> piercing thrust)!
    const u = clamp01((a!.k - 0.12) / 0.76);
    const seg = Math.min(2, Math.floor(u * 3));
    const su = (u * 3) - seg;
    const sw = Math.sin(Math.min(1, su / 0.78) * Math.PI);
    const dir = seg === 0 ? 1 : seg === 1 ? -1 : 0;
    rot(b.hips, 0, dir * sw * 0.45, 0);
    rot(b.spine, 0.10 + sw * 0.12, dir * sw * 0.72, 0);
    rot(b.armR, -0.75 - sw * (seg === 2 ? 0.85 : 0.35), dir * (-0.55 + sw * 1.35), -0.22);
    rot(b.foreR, -0.85 + sw * 0.72, 0, 0);
    rot(b.weapon, -0.15 + sw * 0.25, dir * (-0.45 + sw * 1.05), 0);
    rot(b.armL, -0.55 + sw * 0.35, -0.35, 0.32);
    rot(b.foreL, -0.85, 0, 0);
    stance(b, w * 0.35, 0.12 * sw);
    off.z = 0.08 + 0.24 * sw;
    whip = dir * sw * 0.95;
    trailOn = a!.k >= 0.14 && a!.k <= 0.86;
    isThrust = seg === 2;
  } else if (atk === 'fireWave') {
    // 借风焚江阵: sword-finger incantation -> crisp wide jade-flame sword draw!
    const yaw = -0.85 * load + 1.05 * chest;
    rot(b.hips, 0, yaw * 0.35, 0);
    rot(b.spine, -0.08 * load + 0.16 * chest, yaw, 0);
    rot(b.armL, -1.25 * load - 0.35 * hit, -0.35 * load, 0.28 * hit); // left sword-finger raised high!
    rot(b.foreL, -0.65 * load - 0.2 * hit, 0, 0);
    rot(b.armR, -1.15 * load - 0.45 * hit, -0.55 * load + 1.05 * hit, -0.24);
    rot(b.foreR, -0.72 * load - 0.10 * hit, 0, 0);
    rot(b.weapon, -0.28 * load + 0.48 * hit, -0.45 * load + 0.85 * hit, 0);
    stance(b, w * 0.35, 0.14 * hip);
    whip = 1.1 * hit;
    trailOn = a!.k >= a!.at - 0.16 && a!.k <= a!.at + 0.24;
    heavy = true;
  } else {
    // 青冥流风斩: dancing twirl-slash with celadon-jade crescent wave!
    const spin = curve(a!.k, [[0, -0.35], [0.22, -0.72], [0.66, TAU - 0.2], [1, TAU]]);
    rot(b.hips, 0, spin, 0);
    rot(b.spine, 0.12 * chest, 0.25 * hit, 0);
    rot(b.armR, -0.95 * load - 0.38 * hit, -0.48 * load + 0.95 * hit, -0.22);
    rot(b.foreR, -0.72 * load - 0.10 * hit, 0, 0);
    rot(b.weapon, -0.22 * load + 0.42 * hit, -0.42 * load + 0.75 * hit, 0);
    rot(b.armL, -0.45 * load + 0.48 * hit, 0, 0.38);
    stance(b, w * 0.35, 0.12 * hip);
    whip = 1.05 * hit;
    trailOn = a!.k >= a!.at - 0.16 && a!.k <= a!.at + 0.24;
  }
  genClothPhysics(b, mem, t, dt, whip, 0);
  emitWeaponTrail(b, mem, self, trailOn, 'luxun', 10, 36, heavy, isThrust);
};

POSE_HOOKS.gen_zhaoyun = zhaoPose;
POSE_HOOKS.gen_lubu = lubuPose;
POSE_HOOKS.gen_xiahoudun = xiahoudunPose;
POSE_HOOKS.gen_luxun = luxunPose;
