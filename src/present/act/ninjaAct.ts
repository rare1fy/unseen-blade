// 动作原型 · 主角的动作（影忍和所有蒙眼刀客共用一套：同一套关节名、同一张姿势表；腿长按各模型自己的骨头算）。身体照用京都篇
// 忍者的整身姿势表（kyoto/ninja_pose.ts：受击、重斩、结印），这里加上动作游戏要的：
//   待机：影忍是原来的低伏弓步；蒙眼刀客站直、重心在后脚、刀尖斜指地面、左手松垂，偶尔侧头听声（11-16 用户要「更酷、更潇洒」）。
//   走 / 跑：慢推摇杆是走；推满是奔跑——身体前倾、大步幅、后腿折起、刀拖在身后，步与步之间有腾空；上身稳住不扭不晃
//            （11-16 用户：「现在奔跑的动作左摇右晃的，不帅」）；跑满时脚下踢起一点土。
//   五段连斩（11-16 用户选 5 段）：横斩 → 反手撩斩 + 左手补一下 → 回身旋斩（一整圈）→ 两记弓步大刺 → 跃起重劈收尾；
//   蓄力下伏、蓄力释放的突进斩、冲刺。
//   跳（11-16 用户：「3D动作肉鸽，跳跃应该也是一个比较重要的动作」）：上升时收腿、刀拖在后、左臂张开；下落时腿往下够；
//   落地下蹲一下。空中按斩是下劈：先在空中把刀举过头顶（顿一下），再连人带刀砸下去，落地单膝跪地、刀尖点地，再起身。
// 每一记斩的出刀段画刀光（fx/fx.ts trailSeg），冲刺起步、跑步、落地踢起土块。
// 布尾（影忍的围巾、刀客的蒙眼布、披发、战袍）都是关节链，tails() 统一处理：先抵消上面各节的俯仰让它下垂，再按风和动作往后飘。
import * as THREE from 'three';
import { type Action, type Bone, curve, snap, rot } from '../actors/rig';
import { POSE_HOOKS } from '../bestiary/poseHooks';
import { CELL } from '../bestiary/kit';
import type { BActor } from '../bestiary/bactor';
import { dustBlocks } from '../kyoto/ninja_fx';
import { ninja } from '../kyoto/ninja';
import { ROSTER, type ModelDef } from '../bestiary/models';
import { idle, mix, apply, hurt, attack as leapCut, cast, type Pose } from '../kyoto/ninja_pose';
import { BLIND } from './blind';
import { SLIM } from './blind2';
import { stepWalk } from './heroWalk';
import { slashArc } from './slashArc';
import { MOTION_TUNE } from './motionTune';

type Keys = Array<[number, number]>;
const TAU = Math.PI * 2;
const hump = (k: number, a: number, b: number) => (k <= a || k >= b ? 0 : Math.sin(((k - a) / (b - a)) * Math.PI));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** brief high-frequency damped shudder right after an impact key `at` (0 before impact) */
function postShudder(k: number, at: number, span = 0.14) {
  const u = k - at;
  if (u <= 0 || u >= span) return 0;
  const n = u / span;
  return Math.sin(n * Math.PI * 5.5) * Math.exp(-n * 3.4) * MOTION_TUNE.shudder;
}
/** asymmetric natural breath: slightly brisker inhale (42%), slower relaxed exhale (58%) */
function breathWave(t: number, period = 3.2) {
  const u = ((t / period) % 1 + 1) % 1;
  const val = u < 0.42
    ? Math.sin((u / 0.42) * Math.PI * 0.5) ** 1.35 * 2 - 1
    : Math.cos(((u - 0.42) / 0.58) * Math.PI);
  return { val, exDrop: Math.max(0, -val) };
}
/** 11-18 节奏 (用户：「现在一招一式节奏都差不多，感觉缺乏节奏感」): an action's time re-spread over its pose. keys: [time k, pose k, ease
 *  into it] — 'in' accelerates (the blow: two or three frames into the impact), 'out' decelerates (through to full reach), 'io' eases
 *  both ends (the wind-up, the recovery), 'lin' even (a stop held at full reach drifts on a hair so it never looks frozen). The pose
 *  functions stay as they are; the cuts carry their keys in Action.data.warp (hero.ts CUT_T) */
export type WarpKey = [number, number, 'io' | 'in' | 'out' | 'lin'];
export function warpK(k: number, keys: WarpKey[]) {
  let r0 = 0, p0 = 0;
  for (const [r1, p1, e] of keys) {
    if (k <= r1) { const t = clamp01((k - r0) / Math.max(1e-6, r1 - r0)), s = e === 'in' ? t * t : e === 'out' ? 1 - (1 - t) ** 3 : e === 'io' ? t * t * (3 - 2 * t) : t; return p0 + (p1 - p0) * s; }
    r0 = r1; p0 = p1;
  }
  return p0 + (1 - p0) * clamp01((k - r0) / Math.max(1e-6, 1 - r0));
}
/** the pose k of an action (its warp, if it has one) */
export const poseK = (a: Action) => { const w = a.data.warp as WarpKey[] | undefined; return w ? warpK(a.k, w) : a.k; };

/** per-actor locomotion the controller writes every frame: run = 0..1 of top speed, phase = stride phase (rad), charge = 0..1,
 *  air = height off the ground (m), rise = vertical speed / take-off speed (1 at take-off, 0 at the top, < 0 falling),
 *  land = the landing squat (1 → 0), flip = the double jump's somersault (0..1 while it turns, else 0),
 *  creep = 0..1 moving while in the stance (the feet shuffle), dart = 0..1 through a dart throw (the left arm only, over anything) */
export interface Motion { run: number; phase: number; charge: number; air: number; rise: number; land: number; flip: number; creep: number; dart: number; dartBack: number;
  /** 11-18 跳跃: takeoff = 1 → 0 over the push off the ground; lean = 0..1 of running speed the way she faces in the air; landW = how
   *  hard the landing was (0..1, less when running on), landDur = its length (s) */
  takeoff: number; lean: number; landW: number; landDur: number;
  /** 11-18 (act-42 反馈): squat = 0 → 1 through the crouch on the ground before a jump; airT = seconds since a plain jump left the ground */
  squat: number; airT: number;
  /** 11-18 3C: bank = the body leaning into a turn (rad, + = to her left); skid / brake / start = 1 → 0 through a reversal at speed,
   *  a stop from a run, the first push of a run; ready = 0..1 the guard held for a while after fighting;
   *  coil = 0..1 instant 0-frame pre-cut coil while 斩 is held prior to tap release / 藏锋 transition (act-109);
   *  treadmill = optional virtual forward speed (m/s) in ?anim preview */
  bank: number; skid: number; brake: number; start: number; ready: number; coil: number; treadmill?: number }
export const MOTION = new WeakMap<object, Motion>();
export const motionOf = (a: object) => { let m = MOTION.get(a); if (!m) { m = { run: 0, phase: 0, charge: 0, air: 0, rise: 0, land: 0, flip: 0, creep: 0, dart: 0, dartBack: 0, takeoff: 0, lean: 0, landW: 0.6, landDur: 0.16, squat: 0, airT: 9, bank: 0, skid: 0, brake: 0, start: 0, ready: 0, coil: 0 }; MOTION.set(a, m); } return m; };

/** walk → run: symmetric upright walk below ~58% (handed to heroWalk zero-slide IK), blending past ~60% into an
 *  explosive forward-leaning sprint with buoyant airborne flight height, high trailing knee fold and rock-steady torso */
function run(I: Pose, r: number, ph: number, off: THREE.Vector3): Pose {
  const sL = Math.sin(ph), sR = -sL, sp = smooth(0.56, 0.94, r);
  const walkW = smooth(0.02, 0.24, r); // reach full symmetric gait early so asymmetric idle leg stance NEVER causes a limp
  const wAmp = 0.50 + 0.34 * clamp01(r / 0.6);
  const wKnee = (p: number) => {
    const s = Math.sin(p), c = Math.cos(p);
    // Clean swing-phase knee clearance as foot lifts behind and passes under hip, straightening smoothly into heel-strike
    const swing = Math.max(0, -(s * 0.38 - c * 0.92));
    return 0.12 + 0.88 * swing * swing;
  };
  const W: Partial<Pose> = {
    px: 0, pz: 0,
    tL: -wAmp * sL, kL: wKnee(ph), pL: 0.03, tR: -wAmp * sR, kR: wKnee(ph + Math.PI), pR: -0.03,
    // Poised upright posture & true pelvic-thoracic counter-rotation (never hunched over stomach)
    hx: 0, hy: -0.048 * sL, hz: 0.02 * sL, sx: 0.05 + 0.12 * sp, sy: 0.095 * sL, sz: -0.02 * sL, cx: 0, nx: -0.04, ny: -0.045 * sL,
    aRx: 0.16 - 0.16 * sL, aRz: -0.18, fR: -0.18 - 0.06 * Math.max(0, sL), eR: -0.56, yR: -0.15,
    aLx: 0.0 + 0.32 * sL, aLz: 0.14, fL: -0.24 - 0.12 * Math.max(0, -sL), eL: -0.15, yL: 0.15,
    lift: 0.7 + 0.4 * r, flut: 0.65 + 0.3 * r,
  };
  // asymmetric sprint stride: crisp push-off drive backward (-sin + 2nd harmonic) & snappy high knee recovery fold
  const sb = MOTION_TUNE.sprintBurst;
  const stride = (p: number) => {
    const s = Math.sin(p), c = Math.cos(p);
    return (-1.16 * (s + 0.15 * Math.sin(2 * p - 0.35)) + 0.06 * c) * sb;
  };
  const fold = (p: number) => {
    const s = Math.sin(p), c = Math.cos(p);
    const rec = Math.max(0, -(s * 0.48 - c * 0.88));
    const absorb = 0.24 * Math.max(0, s * 0.65 + c * 0.76) ** 2;
    return 0.18 + 1.58 * (rec ** 1.15) * sb + absorb;
  };
  const Sp: Partial<Pose> = {
    px: 0, pz: 0,
    tL: stride(ph), kL: fold(ph), pL: 0.04, tR: stride(ph + Math.PI), kR: fold(ph + Math.PI), pR: -0.04,
    // rock-steady upper body (hz=0, sz=0: never sways side-to-side), crisp hip/chest counter-twist, level eyes
    hx: 0.11 * sb, hy: -0.07 * sL * sb, hz: 0, sx: 0.46 * sb, sy: 0.15 * sL * sb, sz: 0, cx: 0.06 * sb, nx: -0.48 * sb, ny: -0.075 * sL * MOTION_TUNE.gazeLock,
    aRx: 0.88 - 0.34 * sL, aRz: -0.3, fR: -0.28 - 0.08 * Math.max(0, sL), eR: -0.08, yR: -2.55,
    aLx: -0.18 + 0.84 * sL, aLz: 0.19, fL: -0.88 - 0.48 * Math.max(0, -sL), eL: -0.2, yL: 0.2,
    lift: 1.4, flut: 1,
  };
  const P = mix(mix(I, W, walkW), Sp, sp);
  // apply() sinks hips by average of both legs' drop; lift back to the supporting (straighter) leg first,
  // then add genuine vertical running buoyancy so flight phase visibly springs off the ground instead of feeling pressed down!
  const dL = legDrop(P.tL, P.kL, P.pL), dR = legDrop(P.tR, P.kR, P.pR);
  off.y += ((dL + dR) / 2 - Math.min(dL, dR)) * Math.max(walkW * 0.8, sp);
  // Walk bob: highest passing over mid-stance (cos ph = ±1); Sprint flight: peaks ~0.25 rad after push-off with clear airborne height
  const walkBob = 0.032 * Math.abs(Math.cos(ph)) * walkW * (1 - sp);
  const flight = Math.pow(Math.abs(Math.sin(ph - 0.25)), 1.25);
  const cushion = Math.pow(Math.max(0, Math.cos(2 * (ph - 0.10))), 2);
  const sprintBounce = (0.28 * flight - 0.032 * cushion) * sp * sb;
  off.y += walkBob + sprintBounce;
  return P;
}
/** the posed model's thigh and shin lengths (m), set by the hook from its bones (the ninja: 5 and 3 cells; the slim heroes: 5 and 4) */
const LEN = { T: 5 * CELL, S: 3 * CELL };
const legDrop = (t: number, k: number, p: number, T = LEN.T, Sh = LEN.S) => T * (1 - Math.cos(t)) + Sh * (1 - Math.cos(t + k)) + (T + Sh) * (1 - Math.cos(p));
const lensOf = new WeakMap<object, { T: number; S: number }>();
function legLens(b: Record<string, Bone>) {
  let L = lensOf.get(b); if (L) return L;
  const T = Math.abs(b.shinL?.rest?.p.y ?? 5 * CELL), Sh = Math.abs(b.footL?.rest?.p.y ?? 3 * CELL);
  L = { T, S: Sh }; lensOf.set(b, L); return L;
}
/** apply() (kyoto/ninja_pose) sinks the hips for 5 + 3-cell legs; re-sink them for this model's legs so the feet stay on the ground */
function fixHips(b: Record<string, Bone>, P: Pose) {
  const c = legDrop(P.tL, P.kL, P.pL, 5 * CELL, 3 * CELL) + legDrop(P.tR, P.kR, P.pR, 5 * CELL, 3 * CELL);
  const r = legDrop(P.tL, P.kL, P.pL) + legDrop(P.tR, P.kR, P.pR);
  if (b.hips) b.hips.position.y += (c - r) / 2;
}
/** the blind swordsmen's idle: poised and alive — asymmetric chest breathing with relaxed exhale shoulder drop (never shrugging),
 *  subtle organic weight shift, blade point resting calmly downward without circular spinning, left arm hanging naturally with a
 *  soft elbow bend (never straight) */
function coolIdle(t: number): Pose {
  const ib = MOTION_TUNE.idleBreath;
  const bw = breathWave(t, 3.2), br = bw.val * ib, exDrop = bw.exDrop * ib;
  const sway = (Math.sin(t * TAU / 5.4) * 0.78 + Math.sin(t * TAU / 11.7 + 0.9) * 0.22) * ib;
  return {
    px: sway * 0.048, pz: 0.008 * br, hx: 0.015 * exDrop, hy: -0.22 + 0.065 * sway, hz: -sway * 0.045,
    sx: 0.065 + 0.042 * br, sy: 0.11 + 0.05 * sway, sz: sway * 0.038, cx: 0.065 * br, nx: -0.055 - 0.045 * br, ny: 0.11 - 0.08 * sway,
    // relaxed swordsman arm hanging naturally beside hip (forearm nearly vertical so wrist & grip stay seamlessly aligned)
    aRx: 0.16 - 0.03 * br + 0.02 * exDrop, aRz: -0.20 - 0.025 * br, fR: -0.18 - 0.035 * exDrop,
    // left arm hangs naturally at side with permanent soft elbow flex (never straight, never propped forward)
    aLx: -0.02 + 0.028 * br + 0.022 * sway, aLz: 0.13 + 0.02 * br, fL: -0.27 - 0.045 * exDrop,
    tL: -0.25 + 0.08 * sway, kL: 0.32 + 0.13 * Math.max(0, sway), pL: 0.1, tR: 0.2 - 0.06 * sway, kR: 0.18 + 0.13 * Math.max(0, -sway), pR: -0.12,
    eR: -0.60 - 0.042 * exDrop + 0.02 * br, yR: -0.25 + 0.04 * sway, eL: -0.05, yL: 0.15,
    lift: 0.28 + 0.10 * Math.sin(t * 0.85), flut: 0.35,
  };
}
const S = (k: number, keys: Keys) => snap(k, keys);
/** shift pose phase k by waveLead offset (at waveLead=1, returns exact k) */
const wk = (k: number, dt: number) => clamp01(k + dt * (MOTION_TUNE.waveLead - 1));
/** 1st cut: right to left, flat (impact k ≈ 0.42) — 5-stage kinematic wave: legs → hips → spine/chest → upper arm → forearm/wrist,
 *  2-3 frame whip burst into impact, impact micro-shudder + inertia overshoot rebound into zanshin */
function cut1(I: Pose, k: number): Pose {
  const sh = postShudder(k, 0.42, 0.15);
  const kH = wk(k, 0.045), kA = wk(k, -0.035), kW = wk(k, -0.06), ov = MOTION_TUNE.overshoot - 1;
  const A: Partial<Pose> = {
    // Layer 0 (Legs / Weight): sink & drive first
    px: S(kH, [[0, 0], [0.20, -0.06], [0.39, 0.085], [0.54, 0.095], [0.68, 0.06], [1, 0]]),
    pz: S(kH, [[0, 0], [0.20, -0.045], [0.39, 0.095], [0.54, 0.105], [0.68, 0.07], [1, 0]]),
    tL: S(kH, [[0, -0.75], [0.20, -0.56], [0.39, -1.32], [0.55, -1.36], [0.72, -1.16], [1, -0.75]]),
    kL: S(kH, [[0, 1.05], [0.20, 0.88], [0.39, 1.42], [0.55, 1.46], [0.72, 1.26], [1, 1.05]]),
    tR: S(kH, [[0, 0.45], [0.20, 0.28], [0.39, 0.96], [0.55, 0.98], [0.72, 0.80], [1, 0.45]]),
    kR: S(kH, [[0, 0.75], [0.20, 0.95], [0.39, 0.18], [0.55, 0.16], [0.72, 0.30], [1, 0.75]]),
    // Layer 1 (Hips): coil deepest & unwind earliest
    hy: S(kH, [[0, -0.32], [0.19, -0.84], [0.36, 0.24], [0.50, 0.46 + 0.16 * ov], [0.64, 0.34], [0.80, 0.06], [1, -0.32]]),
    // Layer 2 (Waist / Chest): follows hips ~0.04 behind, overshoots then rebounds into zanshin
    sy: S(k, [[0, 0.12], [0.24, -0.82], [0.41, 0.62], [0.55, 0.94 + 0.22 * ov], [0.67, 0.76], [0.82, 0.42], [1, 0.12]]),
    sx: S(k, [[0, 0.32], [0.23, 0.36], [0.42, 0.68 + 0.025 * sh], [0.56, 0.71], [0.68, 0.56], [1, 0.32]]),
    cx: S(k, [[0, 0.02], [0.24, -0.04], [0.42, 0.10], [0.58, 0.12], [0.74, 0.05], [1, 0.02]]),
    nx: S(k, [[0, -0.15], [0.42, -0.46], [0.68, -0.40], [1, -0.15]]),
    ny: S(k, [[0, 0], [0.24, 0.72], [0.42, -0.58], [0.56, -0.74], [0.70, -0.60], [1, 0]]) * MOTION_TUNE.gazeLock,
    // Layer 3 (Upper Arm): accelerates after chest
    aRx: S(kA, [[0, -0.5], [0.27, -1.28], [0.43, -1.38], [0.57, -1.42 + 0.03 * sh], [0.70, -1.22], [1, -0.5]]),
    aRz: S(kA, [[0, -0.45], [0.27, -1.24], [0.43, 0.52], [0.57, 0.68 + 0.16 * ov], [0.70, 0.50], [1, -0.45]]),
    // Layer 4 (Forearm & Wrist / Blade): lags longest in coil, whips last through k=0.42 with cutting edge leading (+X)
    fR: S(kW, [[0, -1.25], [0.30, -1.72], [0.44, -0.36], [0.59, -0.28 + 0.04 * sh], [0.70, -0.62], [1, -1.25]]),
    eR: S(kW, [[0, 0.6], [0.30, 0.84], [0.44, -0.04 + 0.05 * sh], [0.59, -0.12], [0.70, 0.08], [1, 0.6]]),
    yR: S(kW, [[0, -0.15], [0.30, -1.62], [0.44, 1.18 + 0.06 * sh], [0.59, 1.42 + 0.24 * ov], [0.70, 1.10], [1, -0.15]]),
    rR: S(kW, [[0, 0], [0.28, 0.90], [0.44, 1.38], [0.60, 1.30], [0.76, 0.55], [1, 0]]),
    // Empty left arm: always bent, trails ~0.05 behind blade to counter-balance torque
    aLx: S(k, [[0, 0], [0.28, -0.42], [0.58, 0.68], [0.72, 0.50], [0.84, 0.30], [1, 0]]),
    aLz: S(k, [[0, 0.14], [0.28, 0.26], [0.58, 0.66], [0.72, 0.50], [0.84, 0.34], [1, 0.14]]),
    fL: S(k, [[0, -0.26], [0.28, -0.88], [0.58, -0.48], [0.72, -0.56], [1, -0.26]]),
    eL: S(k, [[0, -0.05], [0.28, 0.2], [0.58, -0.15], [1, -0.05]]),
    lift: 0.35 + 0.78 * hump(k, 0.22, 0.9), flut: 0.35 + 0.65 * hump(k, 0.22, 0.9),
  };
  return mix(I, A, curve(k, [[0, 0], [0.06, 1], [0.86, 1], [1, 0]]));
}
/** 2nd cut: backhand left to right, rising (impact k ≈ 0.40) — staggered kinematic wave with rising diagonal whip & overshoot */
function cut2(I: Pose, k: number): Pose {
  const sh = postShudder(k, 0.40, 0.15);
  const kH = wk(k, 0.045), kA = wk(k, -0.035), kW = wk(k, -0.06), ov = MOTION_TUNE.overshoot - 1;
  const A: Partial<Pose> = {
    px: S(kH, [[0, 0], [0.19, 0.06], [0.38, -0.08], [0.52, -0.09], [0.68, -0.045], [1, 0]]),
    pz: S(kH, [[0, 0], [0.19, -0.04], [0.38, 0.09], [0.52, 0.10], [0.68, 0.06], [1, 0]]),
    tL: S(kH, [[0, -0.75], [0.20, -0.95], [0.40, -0.32], [0.56, -0.28], [0.72, -0.42], [1, -0.75]]),
    kL: S(kH, [[0, 1.05], [0.20, 1.22], [0.40, 0.68], [0.56, 0.65], [0.72, 0.76], [1, 1.05]]),
    tR: S(kH, [[0, 0.45], [0.20, 0.60], [0.40, -0.76], [0.56, -0.80], [0.72, -0.60], [1, 0.45]]),
    kR: S(kH, [[0, 0.75], [0.20, 0.58], [0.40, 1.36], [0.56, 1.40], [0.72, 1.20], [1, 0.75]]),
    // Hips unwind first, chest follows ~0.04 later
    hy: S(kH, [[0, -0.32], [0.18, 0.36], [0.35, -0.78], [0.49, -0.96 - 0.16 * ov], [0.64, -0.78], [0.80, -0.48], [1, -0.32]]),
    sy: S(k, [[0, 0.12], [0.22, 0.82], [0.40, -0.64], [0.54, -0.94 - 0.22 * ov], [0.67, -0.76], [0.82, -0.38], [1, 0.12]]),
    sx: S(k, [[0, 0.32], [0.22, 0.36], [0.40, 0.62 + 0.025 * sh], [0.55, 0.56], [0.68, 0.48], [1, 0.32]]),
    cx: S(k, [[0, 0.02], [0.22, 0.05], [0.40, -0.06], [0.56, -0.08], [0.72, 0.0], [1, 0.02]]),
    nx: S(k, [[0, -0.15], [0.40, -0.44], [0.68, -0.36], [1, -0.15]]),
    ny: S(k, [[0, 0], [0.22, -0.68], [0.40, 0.64], [0.54, 0.76], [0.70, 0.58], [1, 0]]) * MOTION_TUNE.gazeLock,
    // Upper arm -> forearm/wrist rising whip (cutting edge rolls to lead the rising left-to-right cut!)
    aRx: S(kA, [[0, -0.5], [0.25, -1.32], [0.41, -1.44], [0.55, -1.52 + 0.03 * sh], [0.68, -1.28], [1, -0.5]]),
    aRz: S(kA, [[0, -0.45], [0.25, 0.64], [0.41, -1.04], [0.55, -1.18 - 0.16 * ov], [0.68, -0.92], [1, -0.45]]),
    fR: S(kW, [[0, -1.25], [0.28, -1.78], [0.42, -0.34], [0.56, -0.26 + 0.04 * sh], [0.68, -0.60], [1, -1.25]]),
    eR: S(kW, [[0, 0.6], [0.28, 0.78], [0.42, -0.02 + 0.05 * sh], [0.56, 0.14], [0.68, 0.04], [1, 0.6]]),
    yR: S(kW, [[0, -0.15], [0.28, 1.42], [0.42, -1.38 - 0.06 * sh], [0.56, -1.56 - 0.24 * ov], [0.68, -1.22], [1, -0.15]]),
    rR: S(kW, [[0, 0], [0.26, -1.05], [0.42, -1.78], [0.56, -1.82], [0.74, -0.70], [1, 0]]),
    // Empty left arm biomechanical counter-torque: gathers compactly by left-front ribs during coil (0.24),
    // then snaps down-back-out opposite the rising blade on release (0.44) with elastic zanshin rebound
    aLx: S(k, [[0, 0], [0.24, -0.52], [0.44, 0.64], [0.58, 0.56], [0.74, 0.30], [1, 0]]),
    aLz: S(k, [[0, 0.14], [0.24, 0.24], [0.44, 0.58], [0.58, 0.48], [0.74, 0.30], [1, 0.14]]),
    fL: S(k, [[0, -0.26], [0.24, -1.18], [0.44, -0.52], [0.58, -0.66], [0.74, -0.44], [1, -0.26]]),
    eL: S(k, [[0, -0.05], [0.24, 0.12], [0.44, -0.18], [0.74, -0.10], [1, -0.05]]),
    lift: 0.35 + 0.85 * hump(k, 0.18, 0.9), flut: 0.35 + 0.65 * hump(k, 0.18, 0.9),
  };
  return mix(I, A, curve(k, [[0, 0], [0.06, 1], [0.86, 1], [1, 0]]));
}
/** 3rd cut: turning cut (impact k ≈ 0.5) — hip-led 360° whip with unlocked spine torque, active pivot legs, hard brake counter-twist,
 *  and martial-arts head spotting (eyes hold target → snap rapidly around → re-lock target) */
function spinCut(I: Pose, k: number): Pose {
  const sh = postShudder(k, 0.50, 0.16);
  // Hips accelerate into spin slightly earlier and brake with crisp overshoot rebound
  const uH = clamp01((k - 0.16) / 0.54), eH = uH < 0.45 ? 2.469 * uH * uH : 1 - (1 - uH) ** 2.6 * 1.4;
  const spinH = clamp01(eH);
  const hy = k < 0.16 ? S(k, [[0, -0.32], [0.16, 0.68]])
    : k < 0.72 ? 0.68 - (1.00 + TAU) * spinH
    : S(k, [[0.72, -0.32 - 0.16], [0.82, -0.26], [1, -0.32]]);
  // Spine trails hips during early launch (winding torque), whips through impact, counter-brakes at finish
  const sy = S(k, [[0, 0.12], [0.16, 0.36], [0.26, 0.52], [0.46, -0.18], [0.68, -0.42], [0.78, -0.24], [0.88, 0.08], [1, 0.12]]);
  // Martial-arts Spotting (留头甩头): hold gaze on target as spin begins, snap head around fast near k=0.36..0.52, re-lock forward
  const ny = S(k, [[0, 0], [0.16, -0.68], [0.30, 0.68], [0.44, 0.05], [0.56, -0.65], [0.72, 0.36], [0.86, 0.06], [1, 0]]) * MOTION_TUNE.gazeLock;
  const A: Partial<Pose> = {
    hy, sy, ny,
    sx: S(k, [[0, 0.30], [0.16, 0.44], [0.48, 0.40], [0.72, 0.42], [0.84, 0.36], [1, 0.30]]),
    nx: S(k, [[0, -0.25], [0.16, -0.34], [0.50, -0.32], [0.72, -0.34], [1, -0.25]]),
    // Clean horizontal sword-arm extension aligned with blade (no awkward downward chicken-wing twist),
    // with cutting edge (-Y) rolled outward into the CW spin (rR ≈ -1.52) so the sharp edge slices instead of slapping flat!
    aRx: S(k, [[0, -0.5], [0.18, -0.95], [0.29, -0.84], [0.52, -0.82 + 0.03 * sh], [0.72, -0.80], [1, -0.5]]),
    aRz: S(k, [[0, -0.45], [0.18, 0.42], [0.29, -1.24], [0.52, -1.30], [0.72, -1.12], [1, -0.45]]),
    fR: S(k, [[0, -1.25], [0.18, -1.65], [0.30, -0.24], [0.52, -0.22 + 0.04 * sh], [0.72, -0.42], [1, -1.25]]),
    eR: S(k, [[0, 0.6], [0.18, 0.22], [0.30, 0.02 + 0.04 * sh], [0.52, 0.04], [0.72, 0.06], [1, 0.6]]),
    yR: S(k, [[0, -0.15], [0.18, 1.25], [0.30, -1.35 - 0.06 * sh], [0.52, -1.40], [0.72, -1.22], [1, -0.15]]),
    rR: S(k, [[0, 0], [0.18, -0.65], [0.28, -1.52], [0.70, -1.48], [0.86, -0.45], [1, 0]]),
    aLx: S(k, [[0, 0], [0.18, 0.28], [0.32, 0.22], [0.72, 0.32], [1, 0]]),
    aLz: S(k, [[0, 0.14], [0.18, 0.54], [0.32, 1.22], [0.72, 1.04], [1, 0.14]]),
    fL: S(k, [[0, -0.26], [0.18, -0.84], [0.32, -0.46], [0.72, -0.54], [1, -0.26]]),
    eL: S(k, [[0, -0.05], [0.32, 0.2], [0.72, 0.2], [1, -0.05]]),
    // Dynamic pivot footwork instead of frozen legs: sink deep to launch, gather during spin, plant wide on brake
    tL: S(k, [[0, -0.65], [0.16, -0.92], [0.42, -0.58], [0.72, -1.02], [0.85, -0.85], [1, -0.65]]),
    kL: S(k, [[0, 1.05], [0.16, 1.46], [0.42, 1.08], [0.72, 1.48], [0.85, 1.25], [1, 1.05]]),
    tR: S(k, [[0, 0.45], [0.16, 0.68], [0.42, 0.38], [0.72, 0.78], [0.85, 0.58], [1, 0.45]]),
    kR: S(k, [[0, 0.85], [0.16, 1.18], [0.42, 0.92], [0.72, 0.95], [0.85, 0.90], [1, 0.85]]),
    pL: 0.24, pR: -0.24,
    lift: 0.45 + 0.95 * hump(k, 0.18, 0.9), flut: 0.45 + 0.55 * hump(k, 0.18, 0.9),
  };
  return mix(I, A, curve(k, [[0, 0], [0.06, 1], [0.88, 1], [1, 0]]));
}
/** 4th cut: two lunging thrusts (impacts k ≈ 0.30 and 0.56) — broken into 4 staggered kinematic waves (legs → hips → chest → arm/wrist)
 *  so each thrust launches from the rear leg and hips before the shoulder and blade punch out with impact shudder */
function thrust(I: Pose, k: number, off: THREE.Vector3): Pose {
  const sampleE = (kk: number) => S(clamp01(kk), [
    [0, 0], [0.20, -0.40], [0.24, -0.40], [0.30, 1.05], [0.38, 0.98],
    [0.46, 0.18], [0.50, 0.18], [0.56, 1.16], [0.64, 1.10], [0.74, 1.06], [0.90, 0.26], [1, 0],
  ]);
  const wl = MOTION_TUNE.waveLead;
  const eLeg = sampleE(k + 0.032 * wl), eHip = sampleE(k + 0.022 * wl), eCh = sampleE(k + 0.010 * wl), eArm = sampleE(k), eWr = sampleE(k - 0.008 * wl);
  const uH = clamp01((eHip + 0.40) / 1.56), uC = clamp01((eCh + 0.40) / 1.56), uA = clamp01((eArm + 0.40) / 1.56), uW = clamp01((eWr + 0.40) / 1.56);
  const lungeL = clamp01(eLeg), lungeC = clamp01(eCh), lungeA = clamp01(eArm);
  const sh = postShudder(k, 0.30, 0.09) * 0.7 + postShudder(k, 0.56, 0.14);
  off.z += S(k, [[0, 0], [0.20, -0.18], [0.30, 0.34], [0.46, 0.18], [0.56, 0.54], [0.74, 0.52], [0.90, 0.18], [1, 0]]);
  const hy = -0.46 + 0.80 * uH, sy = -0.58 + 0.98 * uC;
  const A: Partial<Pose> = {
    hy, sy, sx: 0.32 + 0.40 * lungeC, cx: 0.04 + 0.06 * lungeC,
    nx: -0.24 - 0.38 * lungeC, ny: clamp(-(hy + sy) * 0.78, -0.72, 0.72),
    aRx: 0.42 - 1.94 * uA + 0.03 * sh, aRz: -0.24 + 0.24 * uA,
    fR: -1.78 + 1.72 * uW, eR: -0.04 + 0.04 * sh, yR: 0.03 * sh,
    aLx: 0.26 + 0.66 * lungeA, aLz: 0.26 + 0.38 * lungeA, fL: -0.92 + 0.38 * lungeA, eL: 0.2, yL: 0.2,
    tL: -0.65 - 0.76 * lungeL, kL: 1.15 + 0.26 * lungeL, pL: 0.1,
    tR: 0.50 + 0.50 * lungeL, kR: 1.05 - 0.95 * lungeL, pR: -0.1,
    lift: 0.4 + 0.95 * lungeA, flut: 0.4 + 0.6 * lungeA,
  };
  return mix(I, A, curve(k, [[0, 0], [0.08, 1], [0.9, 1], [1, 0]]));
}
/** 5th cut (k5, blind swordsmen): crouch spring → soaring two-handed overhead apex hang (k=0.42..0.44 matches CUT_T.k5 吸气) →
 *  violent hip-led downward cleave (impact k=0.50) → deep braced lunge slam with shudder → composed zanshin rise (no ninja back-hop) */
function heavyLeapCut(I: Pose, k: number, off: THREE.Vector3): Pose {
  const sh = postShudder(k, 0.50, 0.16);
  const hangTrem = k > 0.38 && k < 0.45 ? Math.sin(k * 780) * 0.018 : 0;
  // Clean athletic leap arc peaking right at the overhead 吸气 apex (0.34..0.43), slamming back down just ahead of impact (0.48)
  off.y += S(k, [[0, 0], [0.14, 0], [0.34, 0.58], [0.43, 0.60], [0.48, 0.05], [0.51, 0], [1, 0]]);
  const A: Partial<Pose> = {
    // Soaring leap leg silhouette: crouch coil (0.14) -> lead left knee lifted dynamically while trail right leg hangs naturally downward-back
    // (toes pointed downward via heroHook plantarflexion!) -> deep braced slam lunge (0.49..0.68) -> grounded rise
    tL: S(k, [[0, -0.65], [0.14, -1.16], [0.34, -1.14], [0.43, -1.10], [0.49, -1.36], [0.64, -1.30], [1, -0.65]]),
    kL: S(k, [[0, 0.95], [0.14, 1.78], [0.34, 1.48], [0.43, 1.42], [0.49, 1.62], [0.64, 1.52], [1, 0.95]]),
    tR: S(k, [[0, 0.40], [0.14, -0.25], [0.34, 0.28], [0.43, 0.32], [0.49, 0.98], [0.64, 0.94], [1, 0.40]]),
    kR: S(k, [[0, 0.70], [0.14, 1.48], [0.34, 0.24], [0.43, 0.28], [0.49, 0.26], [0.64, 0.30], [1, 0.70]]),
    pL: 0.10, pR: -0.10,
    // Hips & Spine arch cleanly into the leap while the head tilts UP (negative nx = 仰头!) clearing the raised arms
    hy: S(k, [[0, -0.30], [0.14, -0.40], [0.42, -0.18], [0.48, 0.16], [0.58, 0.22], [0.70, 0.12], [1, -0.30]]),
    sy: S(k, [[0, 0.10], [0.16, -0.22], [0.42, -0.12], [0.49, 0.24], [0.59, 0.32], [0.72, 0.18], [1, 0.10]]),
    sx: S(k, [[0, 0.30], [0.14, 0.56], [0.38, -0.28 + hangTrem], [0.43, -0.30 + hangTrem], [0.49, 0.72 + 0.03 * sh], [0.60, 0.76], [0.70, 0.60], [1, 0.30]]),
    cx: S(k, [[0, 0.02], [0.38, -0.14], [0.43, -0.16], [0.50, 0.14], [0.62, 0.12], [1, 0.02]]),
    nx: S(k, [[0, -0.18], [0.14, -0.28], [0.36, -0.42], [0.43, -0.45], [0.50, -0.48], [0.68, -0.42], [1, -0.18]]),
    ny: S(k, [[0, 0], [0.42, 0.18], [0.50, -0.24], [0.60, -0.30], [1, 0]]),
    // Both arms raise HIGH forward-above the upturned brow (elbows clear outside temples, fists meet above crown on hilt center!)
    aRx: S(k, [[0, -0.55], [0.14, 0.22], [0.38, -2.46 + hangTrem], [0.44, -2.50], [0.50, -0.88], [0.60, -0.74 + 0.04 * sh], [0.70, -0.84], [1, -0.55]]),
    aRz: S(k, [[0, -0.42], [0.14, -0.25], [0.42, 0.22], [0.50, 0.32], [0.60, 0.36], [0.70, 0.24], [1, -0.42]]),
    fR: S(k, [[0, -1.20], [0.14, -0.55], [0.42, -0.28], [0.50, -0.20], [0.60, -0.24 + 0.04 * sh], [0.70, -0.42], [1, -1.20]]),
    eR: S(k, [[0, 0.55], [0.14, -0.55], [0.42, 2.04 + hangTrem], [0.45, 2.08], [0.51, -0.64 + 0.06 * sh], [0.60, -0.86], [0.70, -0.72], [1, 0.55]]),
    yR: S(k, [[0, -0.15], [0.42, -0.04], [0.51, 0.10], [0.60, 0.16], [0.70, 0.12], [1, -0.15]]),
    // Left arm clears temple cleanly and converges right onto the hilt center-line high above the upturned brow!
    aLx: S(k, [[0, 0], [0.14, 0.28], [0.38, -2.40 + hangTrem], [0.44, -2.44], [0.50, -0.82], [0.60, -0.68], [0.70, -0.72], [1, 0]]),
    aLz: S(k, [[0, 0.14], [0.14, 0.12], [0.42, -0.26], [0.50, -0.42], [0.60, -0.42], [0.70, -0.26], [1, 0.14]]),
    fL: S(k, [[0, -0.28], [0.14, -0.72], [0.42, -0.36], [0.50, -0.42], [0.60, -0.46], [0.70, -0.56], [1, -0.28]]),
    eL: 0.25, yL: 0.1,
    lift: 0.4 + 1.0 * hump(k, 0.14, 0.88), flut: 0.4 + 0.6 * hump(k, 0.14, 0.88),
  };
  return mix(I, A, curve(k, [[0, 0], [0.06, 1], [0.88, 1], [1, 0]]));
}
/** held attack: down low, the blade swung back and down, the left hand up at the chest; shivers as the charge fills */
/** 藏锋 (act-19, user: 「见切的动作也不是做的收刀动作预备，需要改成收刀拔刀的动作」): holding the cut button first sheathes the
 *  blade (the 归鞘 cross-over to the left hip, quick), then the body sinks into the draw stance — left hand on the scabbard mouth,
 *  right hand on the hilt, chest turned a little toward the scabbard, weight forward; releasing draws from the sheath (release()) */
// act-20 (user: 「现在收刀的动作看起来像肚子痛」): not hunched over the belly — chest up and turned to the scabbard side, head lifted to
// listen, the right elbow out to the side with the hand on the hilt at the left hip, the left hand holding the scabbard mouth
// act-21 (user: 「收刀的动作还是没把刀往另外一只手合，持刀的手没有对应弯曲」): the right hand on the hilt AT the left hand — the right elbow folded
// across the body, the left hand holding the scabbard mouth at the left hip just below it, the hilt pointing forward and a little down
// (angles solved for the targets — tools: the right fist in front of the left hip, the left hand on the scabbard mouth beside it — with
// the rig's own rotation order: raising the upper arm forward and bending the elbow folded the forearm up to the chest instead)
// act-23 (user: 「现在收刀的动作是把刀插到两腿之间的。。太搞笑了……应该是身体微弓，右手持刀把刀刃别在左腿胯部外侧，左臂协同后曲，左手手掌
// 轻轻扶刃」): the fist was right but the blade only followed the wrist — straight back from the belly, between the legs. Re-solved
// (tmp sheath_ik.py, the fine skeleton) for: the body bowed a little and turned to the left; the right fist in front of the left hip at
// the sash; the blade from it back, down and a little out, every cell outside the left hip and thigh; the fist continuing the forearm
// (rR rolls the hand round the blade); the left elbow bent back and the left palm on the blade's flat behind the hip.
// (eR / yR are the blade's world direction for the hips turned hy = −0.3 — the charge and the 归鞘 both settle the hips there)
const SHEATHED: Partial<Pose> = { aRx: 0.18, aRz: 0.23, fR: -1.58, eR: -0.276, yR: 2.516, rR: -1.407, aLx: -0.04, aLz: 0.04, fL: -0.57, eL: 0,
  sy: 1.0, sx: 0.3, hy: -0.3, nx: 0.25, ny: 0.05 };   // act-24 (user: 「面部应该是往左侧微微往下低的，现在是往右上仰起来的」): the head goes with the turned chest, bowed a little toward the blade
function charge(I: Pose, c: number, t: number, creep = 0, ph = 0): Pose {
  const sh = c > 0.98 ? Math.sin(t * 90) * 0.012 : 0;
  // the sheathing: the first ~0.3 s of the stance plays the 归鞘 cross-over (k 0.3 → 1, the click at 0.64)
  const sk = Math.min(1, c / 0.42), arms = sk < 1 ? noto(I, 0.3 + 0.7 * sk) : mix(I, SHEATHED, 1);
  const P = mix(arms, { tL: -0.78, kL: 1.15, tR: 0.52, kR: 0.24, hy: -0.3, sx: 0.3, px: sh, lift: 0.55 + 0.6 * c, flut: 0.5 + 0.5 * c }, Math.min(1, 0.4 + c));
  // moving in the stance: low sliding steps (碎步) — the feet take turns lifting a little and reaching, the crouch and the blade stay put
  if (creep > 0.02) { const s = Math.sin(ph * 1.5);
    P.tL += -0.2 * s * creep; P.kL += 0.35 * Math.max(0, s) * creep; P.tR += -0.2 * s * creep; P.kR += 0.35 * Math.max(0, -s) * creep; }
  return P;
}
/** 收刀 after 见切 (k 0 → 1): crisp 血振 (chiburi flick + brief master pause) → cross-over to scabbard mouth at left hip →
 *  smooth horizontal draw back along thigh → firm click home at k ≈ 0.64 → poised SHEATHED stillness */
function noto(I: Pose, k: number): Pose {
  const flickSh = postShudder(k, 0.14, 0.10);
  const A: Partial<Pose> = {
    aRx: S(k, [[0, -0.50], [0.08, -0.46], [0.15, -0.22 + 0.03 * flickSh], [0.22, -0.24], [0.34, -0.05], [0.48, 0.10], [0.64, 0.18], [1, 0.18]]),
    aRz: S(k, [[0, 0.20], [0.08, -0.25], [0.15, -0.82 + 0.04 * flickSh], [0.22, -0.76], [0.34, 0.45], [0.48, 0.32], [0.64, 0.23], [1, 0.23]]),
    fR: S(k, [[0, -0.60], [0.08, -0.95], [0.15, -0.38 + 0.04 * flickSh], [0.22, -0.44], [0.34, -1.42], [0.48, -1.55], [0.64, -1.58], [1, -1.58]]),
    eR: S(k, [[0, 0.10], [0.08, -0.15], [0.15, -0.96 + 0.05 * flickSh], [0.22, -0.90], [0.34, 0.05], [0.48, -0.15], [0.64, -0.276], [1, -0.276]]),
    yR: S(k, [[0, 0.60], [0.08, -0.15], [0.15, -0.92], [0.22, -0.86], [0.34, 2.00], [0.48, 2.35], [0.64, 2.516], [1, 2.516]]),
    rR: S(k, [[0, 0], [0.15, -0.72], [0.24, -0.55], [0.34, -0.15], [0.48, -0.88], [0.64, -1.407], [1, -1.407]]),
    aLx: S(k, [[0, -0.50], [0.18, -0.42], [0.34, -0.24], [0.64, -0.04], [1, -0.04]]),
    aLz: S(k, [[0, 0.40], [0.18, 0.32], [0.34, 0.10], [0.64, 0.04], [1, 0.04]]),
    fL: S(k, [[0, -1.30], [0.18, -1.18], [0.34, -0.98], [0.64, -0.57], [1, -0.57]]), eL: 0,
    sy: S(k, [[0, 0], [0.15, -0.28], [0.22, -0.24], [0.36, 0.52], [0.50, 0.84], [0.64, 1.00], [1, 1.00]]),
    sx: S(k, [[0, 0.18], [0.15, 0.14], [0.48, 0.26], [0.64, 0.30], [1, 0.30]]),
    nx: S(k, [[0, 0], [0.15, -0.06], [0.48, 0.16], [0.64, 0.25], [1, 0.25]]),
    ny: S(k, [[0, 0], [0.15, 0.16], [0.36, 0.02], [0.64, 0.05], [1, 0.05]]),
    hy: S(k, [[0, -0.22], [0.15, -0.12], [0.64, -0.30], [1, -0.30]]),
    tL: -0.30, kL: 0.36, tR: 0.20, kR: 0.30, lift: S(k, [[0, 0.5], [0.15, 1.05], [0.35, 0.55], [1, 0.45]]), flut: 0.55,
  };
  return mix(I, A, curve(k, [[0, 0.6], [0.06, 1], [0.9, 1], [1, 0.85]]));
}
/** a dart thrown with the left hand (k 0 → 1): crisp shoulder-torso coil & whip; 回身镖 turns head sharply back over left shoulder
 *  to sight the pursuing target while whipping the left hand cleanly past the hip (elbow never locks straight) */
function dartThrow(I: Pose, k: number, back = false): Pose {
  const P = { ...I }, w = curve(k, [[0, 0], [0.10, 1], [0.74, 1], [1, 0]]);
  const T = back ? {
    aLx: S(k, [[0, -0.65], [0.22, -1.05], [0.40, 1.28], [0.66, 1.08], [1, 0.55]]),
    aLz: S(k, [[0, 0.16], [0.22, -0.12], [0.40, 0.42], [1, 0.28]]),
    fL: S(k, [[0, -1.55], [0.22, -1.92], [0.40, -0.34], [0.66, -0.48], [1, -0.65]]),
    sy: S(k, [[0, -0.10], [0.22, -0.32], [0.42, 0.58], [0.72, 0.44], [1, 0.15]]),
    ny: S(k, [[0, 0.15], [0.22, 0.52], [0.42, 0.64], [0.76, 0.48], [1, 0.10]]),
    hy: S(k, [[0, 0], [0.22, -0.10], [0.42, 0.24], [1, 0.05]]),
  } : {
    aLx: S(k, [[0, -0.82], [0.26, -1.12], [0.42, -1.62], [0.68, -1.38], [1, -0.95]]),
    aLz: S(k, [[0, -0.32], [0.26, -0.48], [0.42, 0.26], [1, 0.28]]),
    fL: S(k, [[0, -1.85], [0.26, -2.02], [0.42, -0.38], [0.68, -0.56], [1, -0.72]]),
    sy: S(k, [[0, 0.24], [0.26, 0.38], [0.42, -0.32], [0.72, -0.18], [1, -0.05]]),
    ny: S(k, [[0, -0.10], [0.26, -0.18], [0.44, 0.16], [1, 0.04]]),
    hy: S(k, [[0, 0.08], [0.26, 0.16], [0.44, -0.14], [1, 0]]),
  };
  P.aLx += (T.aLx - P.aLx) * w; P.aLz += (T.aLz - P.aLz) * w; P.fL += (T.fL - P.fL) * w;
  P.sy += T.sy * w; P.hy += T.hy * w;
  P.ny = back ? P.ny + (T.ny - P.ny) * w : P.ny + T.ny * w;
  return P;
}
/** 飞踢 (冲刺派生, k 0 → 1): crisp 3-beat Wuxia flying thrust kick — tight high chamber (提膝蓄劲) → explosive hip-turned
 *  full-extension flying kick with forward kinetic surge & impact shudder → athletic snap-rechamber & clean drop */
function kickPose(I: Pose, k: number, off?: THREE.Vector3): Pose {
  const sh = postShudder(k, 0.22, 0.16);
  if (off) {
    off.z += S(k, [[0, 0], [0.10, -0.06], [0.22, 0.24], [0.48, 0.22], [0.80, 0.06], [1, 0]]);
    off.y += S(k, [[0, 0], [0.12, 0.22], [0.32, 0.38], [0.62, 0.20], [1, 0]]);
  }
  const A: Partial<Pose> = {
    // Beat 1 (0..0.11): tight high knee chamber -> Beat 2 (0.11..0.22): explosive piston thrust kick -> Beat 3: rechamber & drop
    tR: S(k, [[0, -0.65], [0.11, -1.38], [0.21, -1.80 + 0.04 * sh], [0.46, -1.74], [0.66, -1.08], [0.85, -0.42], [1, 0]]),
    kR: S(k, [[0, 1.35], [0.11, 2.06], [0.21, 0.08 + 0.05 * sh], [0.46, 0.10], [0.66, 1.32], [0.85, 0.65], [1, 0.12]]),
    tL: S(k, [[0, -0.35], [0.11, 0.18], [0.22, 0.44], [0.48, 0.46], [0.76, -0.12], [1, 0]]),
    kL: S(k, [[0, 0.85], [0.11, 1.12], [0.22, 1.38], [0.48, 1.32], [0.76, 0.58], [1, 0.20]]),
    // Hips turn open & bank sideways into the kick for genuine martial-arts hip drive!
    hy: S(k, [[0, -0.15], [0.11, -0.44], [0.22, -0.60], [0.48, -0.54], [0.82, -0.15], [1, 0]]),
    hz: S(k, [[0, 0], [0.11, -0.10], [0.22, -0.22], [0.48, -0.18], [1, 0]]),
    sx: S(k, [[0, 0.22], [0.11, 0.08], [0.22, -0.36 - 0.03 * sh], [0.48, -0.32], [0.80, 0.06], [1, 0.10]]),
    sy: S(k, [[0, 0], [0.11, 0.18], [0.22, -0.34], [0.48, -0.28], [1, 0]]),
    nx: S(k, [[0, -0.10], [0.22, 0.24], [0.48, 0.20], [1, -0.05]]),
    ny: S(k, [[0, 0.10], [0.22, 0.56], [0.48, 0.50], [1, 0]]),
    // Blade arm sweeps sleekly back-low counter-balancing the kick; left arm guards chest cleanly
    aRx: S(k, [[0, 0.30], [0.11, 0.52], [0.22, 1.02 + 0.04 * sh], [0.52, 0.88], [1, 0.28]]),
    aRz: S(k, [[0, -0.38], [0.22, -0.78], [0.52, -0.68], [1, -0.36]]),
    fR: S(k, [[0, -0.55], [0.22, -0.32], [1, -0.45]]), eR: 0.08, yR: -2.10,
    aLx: S(k, [[0, -0.45], [0.11, -0.92], [0.22, -1.16], [0.52, -0.96], [1, -0.38]]),
    aLz: S(k, [[0, 0.35], [0.22, 0.42], [1, 0.28]]),
    fL: S(k, [[0, -1.05], [0.22, -1.36], [0.52, -1.24], [1, -0.82]]), eL: 0.35,
    lift: S(k, [[0, 0.9], [0.22, 1.65], [0.52, 1.35], [1, 0.9]]), flut: 1.15,
  };
  return mix(I, A, curve(k, [[0, 0.6], [0.08, 1], [0.84, 1], [1, 0]]));
}
/** the double jump: 3-beat forward somersault — launch tuck → accelerated inverted whip → open reach preparing for landing */
function flip(I: Pose, k: number): Pose {
  const open = smooth(0.68, 0.96, k);
  const tuck: Partial<Pose> = {
    tL: -1.85 + 1.15 * open, kL: 2.25 - 1.55 * open, tR: -1.68 + 1.35 * open, kR: 2.12 - 1.35 * open,
    pL: 0.08, pR: -0.08, sx: 0.62 - 0.46 * open, nx: -0.22 - 0.14 * open,
    aRx: 0.92 - 0.62 * open, aRz: -0.45 - 0.45 * open, fR: -0.95 + 0.52 * open, eR: 0.1, yR: -2.6 + 0.7 * open,
    aLx: 0.72 - 1.15 * open, aLz: 0.4 + 0.62 * open, fL: -1.65 + 0.78 * open, eL: 0.3, yL: 0.3,
    lift: 1.5, flut: 1,
  };
  const P = mix(I, tuck, curve(k, [[0, 0], [0.10, 1], [0.82, 1], [1, 0]]));
  // Nonlinear angular velocity: accelerates through the tight inverted tuck then decelerates as body opens
  const rotU = curve(k, [[0, 0], [0.12, 0.08], [0.46, 0.56], [0.74, 0.95], [1, 1]]);
  P.hx += Math.PI * 2 * rotU;
  return P;
}
/** the draw (见切 · 拔刀破势 / 穿风斩, explosive flash-cut k ≈ 0.13..0.24):
 *  Beat 1 (0..0.13): violent low iai spring-coil compression (deep crouch + tight hip/spine wind + slight pull-back tension)
 *  Beat 2 (0.13..0.24): 3-frame razor whip explosion — piston rear leg drive + forward surge + hip/chest 117° torque burst
 *                       + sayabiki (left arm tears scabbard back) + full-extension 230° cutting-edge blade sweep!
 *  Beat 3 (0.24..0.56): dramatic low zanshin brake hold with high-frequency blade/shoulder recoil shudder & glaring gaze
 *  Beat 4 (0.56..1.00): composed, weighty martial recovery so the preceding flash-cut reads 5× faster by contrast! */
function release(I: Pose, k: number, off?: THREE.Vector3): Pose {
  const sh = postShudder(k, 0.24, 0.18);
  // Explosive forward kinetic launch (even visible standing in place in preview!) + subtle compression drop
  if (off) {
    off.z += S(k, [[0, 0], [0.11, -0.11], [0.15, 0.04], [0.24, 0.30], [0.54, 0.28], [0.82, 0.10], [1, 0]]);
  }
  const A: Partial<Pose> = {
    // Beat 1: deep coiled spring crouch -> Beat 2: explosive warrior lunge with piston-straight rear drive leg!
    tL: S(k, [[0, -0.78], [0.12, -1.16], [0.22, -1.34], [0.54, -1.30], [0.80, -0.96], [1, -0.55]]),
    kL: S(k, [[0, 1.15], [0.12, 1.72], [0.22, 1.46], [0.54, 1.44], [0.80, 1.12], [1, 0.72]]),
    tR: S(k, [[0, 0.52], [0.12, 0.74], [0.22, 1.18], [0.54, 1.14], [0.80, 0.72], [1, 0.30]]),
    kR: S(k, [[0, 0.24], [0.12, 0.74], [0.22, 0.08], [0.54, 0.10], [0.80, 0.26], [1, 0.40]]),
    // Hips coil tight left (-0.52), then rip violently open FIRST (0.12..0.20) with aggressive cut-bank roll (hz)
    hy: S(k, [[0, -0.30], [0.11, -0.52], [0.20, 0.54], [0.30, 0.64], [0.56, 0.52], [0.82, 0.10], [1, -0.32]]),
    hz: S(k, [[0, 0], [0.11, 0.08], [0.22, -0.14], [0.54, -0.12], [0.82, -0.03], [1, 0]]),
    // Chest lags hips by ~0.02 then violently unleashes 117° of torque (+1.20 -> -0.90) pitching fiercely forward!
    sy: S(k, [[0, 1.00], [0.13, 1.20], [0.23, -0.78], [0.32, -0.90 + 0.04 * sh], [0.56, -0.78], [0.82, -0.25], [1, 0.12]]),
    sx: S(k, [[0, 0.30], [0.12, 0.68], [0.24, 0.80 + 0.035 * sh], [0.54, 0.74], [0.82, 0.42], [1, 0.20]]),
    sz: S(k, [[0, 0], [0.12, 0.10], [0.24, -0.18], [0.54, -0.14], [1, 0]]),
    cx: S(k, [[0, 0.02], [0.12, 0.14], [0.24, 0.18 + 0.025 * sh], [0.54, 0.14], [1, 0.02]]),
    // Head drops fiercely low during coil, then snaps razor-locked straight down the cut line over her front shoulder!
    ny: S(k, [[0, 0.05], [0.12, -0.34], [0.23, 0.28], [0.34, 0.36], [0.58, 0.30], [1, 0]]),
    nx: S(k, [[0, 0.25], [0.12, 0.18], [0.23, -0.54], [0.56, -0.48], [0.82, -0.22], [1, -0.05]]),
    // Right sword arm: locked tight on hilt until k=0.13, then EXPLODES across a full 230° full-stretch sweep
    // in just ~40ms (k=0.13..0.24) with cutting edge (-Y) rolled razor-sharp into the slash (rR = -1.54)!
    aRx: S(k, [[0, 0.18], [0.12, 0.26], [0.18, -1.28], [0.25, -1.48 + 0.04 * sh], [0.34, -1.36], [0.58, -1.28], [0.82, -0.82], [1, -0.48]]),
    aRz: S(k, [[0, 0.23], [0.12, 0.34], [0.18, 0.18], [0.25, -1.16], [0.34, -1.38 + 0.05 * sh], [0.58, -1.24], [0.82, -0.74], [1, -0.42]]),
    fR: S(k, [[0, -1.58], [0.12, -1.64], [0.19, -0.58], [0.25, -0.10 + 0.05 * sh], [0.34, -0.14], [0.58, -0.24], [0.82, -0.80], [1, -1.25]]),
    eR: S(k, [[0, -0.276], [0.12, -0.26], [0.18, 0.02], [0.25, 0.10 + 0.06 * sh], [0.34, 0.24], [0.58, 0.24], [0.82, 0.42], [1, 0.60]]),
    yR: S(k, [[0, 2.516], [0.12, 2.56], [0.17, 0.85], [0.24, -1.48 - 0.08 * sh], [0.34, -1.84], [0.58, -1.68], [0.82, -0.72], [1, -0.15]]),
    rR: S(k, [[0, -1.407], [0.12, -1.42], [0.24, -1.54], [0.58, -1.50], [0.82, -0.95], [1, 0]]),
    // Sayabiki (鞘引): left hand braces scabbard mouth tightly during coil, then RIPS violently backward-outward
    // in exact opposition to the drawing blade for real martial-arts explosive torque (elbow stays bent <= -0.22!)
    aLx: S(k, [[0, -0.04], [0.12, -0.18], [0.23, 1.08], [0.34, 1.16 + 0.03 * sh], [0.58, 0.96], [0.82, 0.34], [1, -0.12]]),
    aLz: S(k, [[0, 0.04], [0.12, -0.02], [0.23, 0.54], [0.34, 0.62], [0.58, 0.48], [1, 0.28]]),
    fL: S(k, [[0, -0.57], [0.12, -0.82], [0.23, -0.96], [0.34, -0.86], [0.58, -1.04], [1, -0.95]]),
    eL: S(k, [[0, 0.2], [0.24, 0.4], [0.58, 0.25], [1, -0.25]]),
    lift: S(k, [[0, 0.8], [0.12, 0.55], [0.24, 1.95], [0.52, 1.55], [1, 0.6]]),
    flut: S(k, [[0, 0.6], [0.12, 0.45], [0.24, 1.40], [0.55, 1.05], [1, 0.5]]),
  };
  return mix(I, A, curve(k, [[0, 1], [0.86, 1], [1, 0]]));
}
/** 疾步闪避 (dash, k 0 → 1): fluid 3-beat ninja burst — explosive low push-off → sleek aerodynamic skim → lead-foot athletic brake */
function dash(I: Pose, k: number): Pose {
  const K = (keys: Keys) => S(k, keys);
  const A: Partial<Pose> = {
    sx: K([[0, 0.36], [0.16, 0.74], [0.68, 0.68], [0.88, 0.40], [1, 0.18]]),
    hy: K([[0, -0.10], [0.16, -0.22], [0.68, -0.18], [1, -0.10]]),
    sy: K([[0, 0.10], [0.16, 0.24], [0.68, 0.20], [1, 0.08]]),
    hz: K([[0, 0], [0.20, -0.06], [0.70, -0.05], [1, 0]]),
    nx: K([[0, -0.22], [0.18, -0.46], [0.70, -0.42], [1, -0.12]]),
    tL: K([[0, -0.60], [0.16, -1.08], [0.68, -0.96], [0.86, -0.92], [1, -0.42]]),
    kL: K([[0, 0.85], [0.16, 0.72], [0.68, 0.66], [0.86, 1.24], [1, 0.55]]),
    tR: K([[0, 0.35], [0.16, 0.96], [0.68, 0.86], [0.86, 0.52], [1, 0.22]]),
    kR: K([[0, 0.65], [0.16, 0.18], [0.68, 0.82], [0.86, 0.68], [1, 0.35]]),
    aRx: K([[0, 0.35], [0.18, 0.84], [0.72, 0.76], [1, 0.28]]),
    aRz: K([[0, -0.25], [0.18, -0.42], [0.72, -0.38], [1, -0.26]]),
    fR: K([[0, -0.55], [0.18, -0.24], [0.72, -0.30], [1, -0.60]]),
    eR: K([[0, 0.10], [0.18, -0.42], [0.72, -0.36], [1, 0.15]]),
    yR: K([[0, -1.40], [0.18, -2.18], [0.72, -2.10], [1, -0.80]]),
    aLx: K([[0, 0.20], [0.18, 0.62], [0.72, 0.52], [1, -0.10]]),
    aLz: K([[0, 0.22], [0.18, 0.36], [0.72, 0.32], [1, 0.20]]),
    fL: K([[0, -0.95], [0.18, -1.16], [0.72, -1.08], [1, -0.78]]),
    eL: -0.25, yL: 0,
    lift: K([[0, 0.8], [0.18, 1.65], [0.70, 1.40], [1, 0.6]]),
    flut: K([[0, 0.6], [0.18, 1.25], [0.70, 1.05], [1, 0.5]]),
  };
  return mix(I, A, curve(k, [[0, 0], [0.10, 1], [0.86, 1], [1, 0]]));
}
/** 轻功普通跳 (Normal Jump): 4-beat Wuxia swallow/crane leap — asymmetric coiled squat → piston takeoff push →
 *  graceful asymmetric soaring apex (lead knee high, trailing leg sweeping naturally down-back with pointed toe, poised sword-finger left hand,
 *  blade trailing sleekly — ZERO frog-tuck and ZERO panicky T-pose!) → controlled martial landing reach */
const J_SQUAT: Partial<Pose> = {
  tL: -1.08, kL: 1.66, tR: 0.42, kR: 1.38, pL: 0.06, pR: -0.06,
  sx: 0.52, hy: -0.18, sy: 0.14, nx: -0.28,
  aLx: 0.52, aLz: 0.28, fL: -0.88, eL: 0.15,
  aRx: 0.58, aRz: -0.36, fR: -0.46, eR: 0.06, yR: -2.02, lift: 0.85, flut: 0.55,
};
const J_PUSH: Partial<Pose> = {
  tL: -0.82, kL: 1.12, tR: 0.38, kR: 0.14, pL: 0.05, pR: -0.05,
  sx: -0.04, cx: -0.08, hy: -0.14, sy: 0.16, nx: -0.18,
  aLx: -1.32, aLz: 0.34, fL: -0.76, eL: 0.25, yL: 0.2,
  aRx: 0.52, aRz: -0.46, fR: -0.38, eR: 0.08, yR: -2.16, lift: 1.55, flut: 1.05,
};
const J_RISE: Partial<Pose> = {
  tL: -1.04, kL: 1.44, tR: 0.36, kR: 0.38, pL: 0.07, pR: -0.07,
  sx: 0.14, hy: -0.16, sy: 0.18, hz: -0.04, nx: -0.18,
  aLx: -0.86, aLz: 0.38, fL: -0.96, eL: 0.30, yL: 0.25,
  aRx: 0.46, aRz: -0.54, fR: -0.40, eR: 0.10, yR: -2.22, lift: 1.45, flut: 1.0,
};
const J_TUCK: Partial<Pose> = {
  // Graceful Wuxia soaring apex: lead left knee crisp & high, trailing right leg extended smoothly down-back (NEVER frog-curled!)
  tL: -1.24, kL: 1.68, tR: 0.32, kR: 0.56, pL: 0.08, pR: -0.08,
  sx: 0.20, hy: -0.18, sy: 0.20, hz: -0.05, nx: -0.22,
  aLx: -0.66, aLz: 0.42, fL: -1.06, eL: 0.30, yL: 0.25,
  aRx: 0.44, aRz: -0.58, fR: -0.44, eR: 0.10, yR: -2.26, lift: 1.40, flut: 1.0,
};
const J_REACH: Partial<Pose> = {
  // Controlled martial descent: staggered landing legs, poised balanced arms (ZERO wide T-pose flapping!)
  tL: -0.48, kL: 0.44, tR: 0.24, kR: 0.62, pL: 0.09, pR: -0.09,
  sx: 0.16, hy: -0.12, sy: 0.12, nx: -0.10,
  aLx: -0.24, aLz: 0.54, fL: -0.94, eL: 0.25, yL: 0.2,
  aRx: 0.28, aRz: -0.62, fR: -0.48, eR: 0.12, yR: -1.96, lift: 1.50, flut: 1.05,
};
function air(I: Pose, rise: number, airT = 9, lean = 0): Pose {
  const reach = smooth(0.12, 0.58, -rise), apex = smooth(0.08, 0.24, airT) * (1 - reach), push = 1 - smooth(0.04, 0.13, airT);
  let P = mix(I, J_RISE, 1);
  P = mix(P, J_REACH, reach); P = mix(P, J_TUCK, apex); P = mix(P, J_PUSH, push);
  P.sx += 0.16 * lean * (rise > -0.2 ? 1 : 0.4);
  return P;
}
/** the plunge in the air (劈山, k: 0 → hang at 0.55 → impact at 1): head tilted UP heroically, both arms raised forward-up
 *  clear of the head while converging on the hilt center-line, lead left knee raised & right leg hanging down with toes pointed */
function plunge(I: Pose, k: number): Pose {
  const A: Partial<Pose> = {
    // Both arms raise HIGH forward-above the upturned brow (elbows clear outside temples, fists converge above crown on hilt!)
    aRx: S(k, [[0, 0.15], [0.45, -2.46], [0.60, -2.50], [0.85, -0.86], [1, -0.75]]),
    aRz: S(k, [[0, -0.35], [0.45, 0.22], [0.60, 0.24], [0.85, 0.30], [1, 0.26]]),
    fR: S(k, [[0, -0.45], [0.45, -0.28], [0.60, -0.30], [0.85, -0.20], [1, -0.16]]),
    eR: S(k, [[0, 0.2], [0.45, 2.04], [0.60, 2.08], [0.85, -0.92], [1, -1.22]]),
    yR: S(k, [[0, -1.2], [0.45, -0.04], [0.60, 0], [1, 0]]),
    aLx: S(k, [[0, -0.35], [0.45, -2.40], [0.60, -2.44], [0.85, -0.80], [1, -0.68]]),
    aLz: S(k, [[0, 0.25], [0.45, -0.26], [0.60, -0.28], [0.85, -0.42], [1, -0.38]]),
    fL: S(k, [[0, -0.8], [0.45, -0.36], [0.60, -0.38], [0.85, -0.44], [1, -0.42]]),
    // Soaring leap legs: lead left knee bent forward-up, trail right leg hanging naturally downward-back (toes pointed down!)
    tL: S(k, [[0, -0.95], [0.45, -1.12], [0.60, -1.08], [0.85, -0.65], [1, -0.55]]),
    kL: S(k, [[0, 1.35], [0.45, 1.48], [0.60, 1.44], [0.85, 0.82], [1, 0.72]]),
    tR: S(k, [[0, 0.15], [0.45, 0.28], [0.60, 0.32], [0.85, 0.36], [1, 0.34]]),
    kR: S(k, [[0, 0.45], [0.45, 0.24], [0.60, 0.26], [0.85, 0.42], [1, 0.48]]),
    // Arch chest & tilt head UP (negative nx = 仰头!) while soaring overhead, snap eyes down onto target during cleave
    sx: S(k, [[0, 0.20], [0.45, -0.28], [0.60, -0.30], [0.85, 0.56], [1, 0.62]]),
    cx: S(k, [[0, 0.0], [0.45, -0.14], [0.60, -0.16], [0.85, 0.10], [1, 0.12]]),
    nx: S(k, [[0, -0.20], [0.45, -0.44], [0.60, -0.46], [0.85, -0.48], [1, -0.52]]),
    hy: 0, sy: 0, lift: 1.4, flut: 1,
  };
  return mix(I, A, curve(k, [[0, 0], [0.12, 1], [1, 1]]));
}
/** the plunge's landing (劈山落地): 3-beat impact — deep shock compression & blade tremor → heavy knee-down zanshin → strong rise */
function plungeLand(I: Pose, k: number): Pose {
  const sh = postShudder(k, 0.02, 0.22);
  const crush = curve(k, [[0, 0.78], [0.14, 1.12], [0.32, 0.96], [0.56, 0.92], [1, 0]]);
  const A: Partial<Pose> = {
    tL: S(k, [[0, -1.30], [0.14, -1.48], [0.52, -1.32], [1, -0.45]]),
    kL: S(k, [[0, 1.90], [0.14, 2.15], [0.52, 1.92], [1, 0.65]]), pL: 0.12,
    tR: S(k, [[0, 0.90], [0.14, 1.06], [0.52, 0.94], [1, 0.30]]),
    kR: S(k, [[0, 1.72], [0.14, 1.92], [0.52, 1.72], [1, 0.45]]), pR: -0.12,
    sx: S(k, [[0, 0.68], [0.14, 0.84 + 0.03 * sh], [0.52, 0.70], [1, 0.18]]), sy: 0, hy: 0,
    nx: S(k, [[0, -0.52], [0.14, -0.62], [0.52, -0.54], [1, -0.12]]),
    aRx: -0.75 + 0.04 * sh, aRz: 0.06, fR: -0.16, eR: -1.32 + 0.06 * sh, yR: 0,
    aLx: S(k, [[0, 0.20], [0.14, 0.38], [0.52, 0.26], [1, 0]]),
    aLz: S(k, [[0, 0.68], [0.14, 0.84], [0.52, 0.70], [1, 0.20]]),
    fL: S(k, [[0, -1.05], [0.14, -1.24], [0.52, -1.08], [1, -0.35]]), eL: 0.4,
    lift: 0.95, flut: 0.65,
  };
  return mix(I, A, clamp01(crush));
}
// ---- 11-18 四本新刀谱 (用户：「我打了半天了还没个新招，一直在给我加数值」). The cuts keep the rhythm of the ground combo (CUT_T): the
// wind-up eases in, the blow lands in two or three frames, a stop at full reach; the empty hand hangs loose and swings back against
// the blade (act-42 反馈：「整个挥砍动作太多左手放在前方的形态了」), never held out in front
/** 断云一/二段 (airCombo, k 0 → 1, impacts k ≈ .20 / .47): razor cutting-edge aerial flurry —
 *  Cut 1 slices right→left with edge rolled left (+1.48) + shudder; Cut 2 snaps backhand left→right with edge rolled right (-1.48) + shudder;
 *  then raises BOTH arms high clear of her upturned brow to feed seamlessly into 断云三段 (airDrive)! */
function airCombo(I: Pose, k: number): Pose {
  const K = (keys: Keys) => S(k, keys);
  const sh1 = postShudder(k, 0.20, 0.11), sh2 = postShudder(k, 0.47, 0.13);
  const A: Partial<Pose> = {
    aRx: K([[0, -0.60], [0.10, -1.28], [0.20, -1.42 + 0.04 * sh1], [0.32, -1.26], [0.47, -1.46 + 0.04 * sh2], [0.60, -1.36], [0.86, -2.44], [1, -2.48]]),
    aRz: K([[0, -0.50], [0.10, -1.18], [0.20, 0.52 + 0.04 * sh1], [0.32, 0.62], [0.47, -1.12 - 0.04 * sh2], [0.60, -1.04], [0.86, 0.18], [1, 0.22]]),
    fR: K([[0, -1.15], [0.10, -1.62], [0.20, -0.24 + 0.05 * sh1], [0.32, -1.58], [0.47, -0.22 + 0.05 * sh2], [0.60, -0.34], [0.86, -0.32], [1, -0.30]]),
    eR: K([[0, 0.45], [0.10, 0.72], [0.20, 0.04 + 0.05 * sh1], [0.32, 0.68], [0.47, -0.02 + 0.05 * sh2], [0.60, 0.06], [0.86, 1.98], [1, 2.06]]),
    yR: K([[0, -0.20], [0.10, -1.58], [0.20, 1.32 + 0.06 * sh1], [0.32, 1.38], [0.47, -1.48 - 0.06 * sh2], [0.60, -1.40], [0.86, -0.08], [1, -0.02]]),
    // Razor cutting-edge roll: +1.48 slicing right->left, -1.48 slicing left->right, 0 raising overhead!
    rR: K([[0, 0.6], [0.10, 1.46], [0.24, 1.48], [0.33, -1.25], [0.47, -1.48], [0.62, -1.35], [0.84, 0], [1, 0]]),
    hy: K([[0, -0.20], [0.09, -0.64], [0.19, 0.34], [0.31, 0.38], [0.46, -0.68], [0.62, -0.58], [0.88, -0.08], [1, 0]]),
    hz: K([[0, 0], [0.20, 0.12], [0.47, -0.14], [0.86, 0], [1, 0]]),
    sy: K([[0, 0], [0.11, -0.74], [0.21, 0.68], [0.32, 0.72], [0.48, -0.72], [0.62, -0.62], [0.88, -0.06], [1, 0]]),
    sx: K([[0, 0.24], [0.20, 0.48], [0.47, 0.48], [0.82, -0.22], [1, -0.26]]),
    cx: K([[0, 0], [0.20, 0.08], [0.47, 0.08], [0.86, -0.14], [1, -0.16]]),
    // Upturned brow entering overhead raise so arms never clip head!
    nx: K([[0, -0.20], [0.20, -0.40], [0.47, -0.40], [0.86, -0.44], [1, -0.46]]),
    ny: K([[0, 0], [0.12, 0.44], [0.24, -0.34], [0.50, 0.36], [0.86, 0], [1, 0]]),
    // Left arm counter-whips on Cut 1 & 2, then converges UP onto hilt center-line preparing for airDrive!
    aLx: K([[0, 0.10], [0.14, -0.22], [0.24, 0.72], [0.34, 0.48], [0.50, 0.82], [0.66, -0.40], [0.86, -2.36], [1, -2.40]]),
    aLz: K([[0, 0.30], [0.24, 0.64], [0.50, 0.76], [0.86, -0.24], [1, -0.26]]),
    fL: K([[0, -0.65], [0.14, -0.92], [0.24, -0.58], [0.50, -0.56], [0.86, -0.38], [1, -0.36]]), eL: 0.15,
    // Dynamic soaring martial legs (lead left knee high, trailing right leg sleek & responsive — NOT twin frog curl!)
    tL: K([[0, -1.05], [0.20, -1.24], [0.47, -1.16], [1, -1.12]]),
    kL: K([[0, 1.48], [0.20, 1.66], [0.47, 1.56], [1, 1.48]]),
    tR: K([[0, 0.24], [0.20, 0.38], [0.47, 0.22], [1, 0.30]]),
    kR: K([[0, 0.52], [0.20, 0.44], [0.47, 0.62], [1, 0.28]]),
    pL: 0.08, pR: -0.08, lift: 1.55, flut: 1.15,
  };
  return mix(I, A, curve(k, [[0, 0.5], [0.06, 1], [1, 1]]));
}
/** 断云三段重劈 (airDrive, k 0 → hang → cleave): head tilted UP heroically, BOTH hands converging high above crown
 *  on hilt center-line (ZERO head clipping!), soaring asymmetric leap legs with pointed trailing toe, explosive downward cleave + shudder! */
function airDrive(I: Pose, k: number, hang: number): Pose {
  const h = Math.max(0.05, Math.min(0.6, hang)), K = (keys: Keys) => S(k, keys);
  const sh = postShudder(k, h + 0.18, 0.18);
  const A: Partial<Pose> = {
    aRx: K([[0, -2.48], [h, -2.56], [h + 0.18, -0.84 + 0.05 * sh], [1, -0.74]]),
    aRz: K([[0, 0.22], [h, 0.24], [h + 0.18, 0.34], [1, 0.28]]),
    fR: K([[0, -0.30], [h, -0.32], [h + 0.18, -0.16 + 0.05 * sh], [1, -0.18]]),
    eR: K([[0, 2.06], [h, 2.14], [h + 0.18, -1.08 + 0.06 * sh], [1, -1.24]]),
    yR: K([[0, -0.02], [h, 0], [h + 0.18, 0.38], [1, 0.22]]),
    rR: 0,
    // Both hands converge onto the hilt center-line during overhead charge AND drive down together through the cleave!
    aLx: K([[0, -2.40], [h, -2.48], [h + 0.18, -0.78 + 0.04 * sh], [1, -0.66]]),
    aLz: K([[0, -0.26], [h, -0.28], [h + 0.18, -0.40], [1, -0.34]]),
    fL: K([[0, -0.36], [h, -0.38], [h + 0.18, -0.44], [1, -0.46]]), eL: 0.15,
    hy: K([[0, 0], [h, -0.10], [h + 0.18, 0.24], [1, 0.18]]),
    sy: K([[0, 0], [h, -0.12], [h + 0.18, 0.32], [1, 0.24]]),
    sx: K([[0, -0.26], [h, -0.32], [h + 0.18, 0.68 + 0.04 * sh], [1, 0.64]]),
    cx: K([[0, -0.16], [h, -0.18], [h + 0.18, 0.14], [1, 0.12]]),
    nx: K([[0, -0.46], [h, -0.48], [h + 0.18, -0.54], [1, -0.52]]),
    // Soaring leap legs: lead left knee high, trailing right leg hanging smoothly down-back with pointed toe (NEVER frog-curled!)
    tL: K([[0, -1.12], [h, -1.16], [h + 0.24, -0.74], [1, -0.58]]),
    kL: K([[0, 1.48], [h, 1.52], [h + 0.24, 0.92], [1, 0.72]]),
    tR: K([[0, 0.30], [h, 0.34], [h + 0.24, 0.38], [1, 0.32]]),
    kR: K([[0, 0.28], [h, 0.24], [h + 0.24, 0.44], [1, 0.50]]),
    pL: 0.08, pR: -0.08, lift: 1.65, flut: 1.2,
  };
  return mix(I, A, 1);
}
/** 掠地俯冲斩 (swoopPose, k 0 → 1; falcon dive 0..0.34 → explosive ground-skim razor cut 0.34..0.46 → low zanshin slide):
 *  true hawk-dive body pitch (hx), swept-back aerodynamic legs, razor cutting-edge rR (+1.52), forward skim surge & shudder! */
function swoopPose(I: Pose, k: number, off?: THREE.Vector3): Pose {
  const K = (keys: Keys) => S(k, keys);
  const sh = postShudder(k, 0.44, 0.16);
  if (off) {
    off.z += S(k, [[0, 0], [0.30, 0.06], [0.44, 0.30], [0.72, 0.26], [1, 0]]);
  }
  const A: Partial<Pose> = {
    hx: K([[0, 0.18], [0.12, 0.36], [0.32, 0.32], [0.44, 0.04], [1, 0]]),
    hz: K([[0, 0], [0.30, -0.10], [0.44, 0.16], [0.72, 0.12], [1, 0]]),
    sx: K([[0, 0.44], [0.12, 0.64], [0.32, 0.66], [0.44, 0.74 + 0.03 * sh], [0.72, 0.66], [1, 0.26]]),
    nx: K([[0, -0.42], [0.16, -0.58], [0.34, -0.58], [0.46, -0.54], [1, -0.18]]),
    hy: K([[0, -0.35], [0.30, -0.60], [0.42, 0.46], [0.72, 0.40], [1, -0.18]]),
    sy: K([[0, -0.45], [0.30, -0.74], [0.44, 0.78 + 0.04 * sh], [0.72, 0.68], [1, 0.10]]),
    aRx: K([[0, 0.35], [0.30, 0.62], [0.38, -1.10], [0.45, -1.42 + 0.04 * sh], [0.72, -1.30], [1, -0.55]]),
    aRz: K([[0, -0.58], [0.30, -0.82], [0.38, -0.18], [0.45, 0.72], [0.72, 0.64], [1, -0.32]]),
    fR: K([[0, -0.32], [0.30, -0.26], [0.45, -0.16 + 0.05 * sh], [0.72, -0.26], [1, -1.00]]),
    eR: K([[0, -0.28], [0.30, -0.38], [0.45, -0.18 + 0.05 * sh], [0.72, -0.14], [1, 0.40]]),
    yR: K([[0, -2.05], [0.30, -2.36], [0.38, -0.55], [0.45, 1.56 + 0.06 * sh], [0.72, 1.46], [1, 0]]),
    // Razor cutting-edge (+1.52) leading the low right->left ground-skim cut!
    rR: K([[0, 1.20], [0.30, 1.48], [0.46, 1.54], [0.74, 1.42], [1, 0]]),
    aLx: K([[0, 0.52], [0.30, 0.68], [0.45, 0.96], [0.72, 0.78], [1, 0.10]]),
    aLz: K([[0, 0.34], [0.30, 0.44], [0.45, 0.78], [0.72, 0.62], [1, 0.22]]),
    fL: K([[0, -0.78], [0.30, -0.68], [0.45, -0.54], [1, -0.52]]), eL: 0.15,
    // Dive: streamlined swept-back legs -> Touchdown cut: deep low predator lunge!
    tL: K([[0, -0.55], [0.30, -0.44], [0.42, -1.32], [0.72, -1.26], [1, -0.56]]),
    kL: K([[0, 0.95], [0.30, 0.88], [0.42, 1.52], [0.72, 1.42], [1, 0.76]]),
    tR: K([[0, 0.48], [0.30, 0.66], [0.42, 1.10], [0.72, 1.02], [1, 0.36]]),
    kR: K([[0, 0.85], [0.30, 0.72], [0.42, 0.14], [0.72, 0.22], [1, 0.52]]),
    lift: K([[0, 1.5], [0.30, 1.75], [0.45, 1.95], [1, 0.8]]),
    flut: K([[0, 1.1], [0.45, 1.40], [1, 0.6]]),
  };
  return mix(I, A, curve(k, [[0, 0.6], [0.08, 1], [0.82, 1], [1, 0]]));
}
/** 牵红 (reelPose, k 0 → 1):
 *  - self=false (拉怪): full-body tug-of-war deadlift haul — reach forward → violently throw weight onto braced back leg (-0.22m),
 *    front leg locks straight anchor, left elbow rips past hip with wire-snap shudder, right blade coils low-ready to bisect!
 *  - self=true (飞身拉近): dynamic 3-beat streamlined zip flight (never frozen!) — launch jerk → aerodynamic dash-zip with right blade
 *    actively cocking back for arrival slash → athletic pre-arrival tuck (fL strictly <= -0.32!) */
function reelPose(I: Pose, k: number, self: boolean, off?: THREE.Vector3): Pose {
  const K = (keys: Keys) => S(k, keys);
  const sh = self ? 0 : postShudder(k, 0.30, 0.16);
  if (off) {
    off.z += self
      ? S(k, [[0, 0], [0.14, -0.06], [0.30, 0.20], [0.80, 0.18], [1, 0]])
      : S(k, [[0, 0], [0.12, 0.08], [0.30, -0.22], [0.64, -0.18], [1, 0]]);
  }
  const A: Partial<Pose> = self ? {
    hx: K([[0, 0.08], [0.18, 0.34], [0.74, 0.32], [0.92, 0.12], [1, 0]]),
    sx: K([[0, 0.28], [0.18, 0.46], [0.74, 0.42], [1, 0.28]]),
    nx: K([[0, -0.30], [0.18, -0.54], [0.76, -0.52], [1, -0.24]]),
    hy: K([[0, 0.12], [0.18, 0.24], [0.74, 0.18], [1, 0]]),
    sy: K([[0, 0.18], [0.18, 0.32], [0.74, 0.26], [1, 0.10]]),
    aLx: K([[0, -1.25], [0.18, -1.56], [0.74, -1.48], [1, -0.68]]),
    aLz: K([[0, 0.12], [0.18, 0.08], [0.74, 0.14], [1, 0.22]]),
    fL: K([[0, -0.48], [0.18, -0.32], [0.74, -0.38], [1, -0.78]]), eL: 0.10,
    // Sword arm actively coils back-ready during zip flight so she arrives poised to slash!
    aRx: K([[0, 0.30], [0.22, 0.68], [0.74, 0.84], [1, -0.35]]),
    aRz: K([[0, -0.45], [0.22, -0.66], [0.74, -0.74], [1, -0.35]]),
    fR: K([[0, -0.45], [0.22, -0.38], [0.74, -0.52], [1, -0.95]]),
    eR: K([[0, -0.20], [0.22, -0.34], [0.74, -0.24], [1, 0.30]]),
    yR: K([[0, -1.80], [0.22, -2.15], [0.74, -2.28], [1, -0.50]]),
    tL: K([[0, -0.65], [0.20, -0.96], [0.74, -1.08], [1, -0.72]]),
    kL: K([[0, 0.90], [0.20, 1.38], [0.74, 1.54], [1, 1.05]]),
    tR: K([[0, 0.40], [0.20, 0.68], [0.74, 0.56], [1, 0.32]]),
    kR: K([[0, 0.65], [0.20, 0.36], [0.74, 0.42], [1, 0.55]]),
    lift: 1.75, flut: 1.25,
  } : {
    sx: K([[0, 0.24], [0.12, 0.34], [0.30, -0.18 - 0.04 * sh], [0.64, -0.08], [1, 0.18]]),
    nx: K([[0, -0.20], [0.12, -0.28], [0.30, 0.08], [0.64, 0.02], [1, -0.10]]),
    hy: K([[0, 0.14], [0.12, 0.22], [0.30, -0.48], [0.64, -0.38], [1, -0.20]]),
    hz: K([[0, 0], [0.30, 0.10], [0.64, 0.08], [1, 0]]),
    sy: K([[0, 0.28], [0.12, 0.36], [0.30, -0.60 - 0.05 * sh], [0.64, -0.46], [1, -0.10]]),
    // Left arm reaches forward -> violently rips past hip like hauling a heavy enemy on wire!
    aLx: K([[0, -1.32], [0.12, -1.52], [0.30, 0.98 + 0.05 * sh], [0.64, 0.78], [1, 0.10]]),
    aLz: K([[0, 0.04], [0.12, 0.02], [0.30, 0.48], [0.64, 0.42], [1, 0.22]]),
    fL: K([[0, -0.42], [0.12, -0.30], [0.30, -1.42 + 0.05 * sh], [0.64, -1.24], [1, -0.58]]), eL: 0.25,
    // Right blade coils low & taut at right flank ready to punish the pulled foe
    aRx: K([[0, -0.35], [0.12, -0.20], [0.30, -0.78], [0.64, -0.72], [1, -0.52]]),
    aRz: K([[0, -0.36], [0.30, -0.82], [0.64, -0.74], [1, -0.48]]),
    fR: K([[0, -1.05], [0.30, -1.42], [0.64, -1.32], [1, -1.15]]),
    eR: K([[0, 0.48], [0.30, 0.84], [1, 0.66]]),
    yR: K([[0, -0.32], [0.30, -1.02], [1, -0.65]]),
    // Braced tug-of-war legs: front left leg locks straight forward anchor, back right leg deeply loads weight!
    tL: K([[0, -0.45], [0.12, -0.58], [0.30, -0.96], [0.64, -0.84], [1, -0.52]]),
    kL: K([[0, 0.65], [0.12, 0.82], [0.30, 0.34], [0.64, 0.44], [1, 0.60]]),
    tR: K([[0, 0.32], [0.12, 0.24], [0.30, 0.68], [0.64, 0.56], [1, 0.38]]),
    kR: K([[0, 0.50], [0.12, 0.42], [0.30, 1.28], [0.64, 1.08], [1, 0.62]]),
    lift: K([[0, 0.8], [0.30, 1.45], [1, 0.7]]), flut: 0.95,
  };
  return mix(I, A, curve(k, [[0, 0.7], [0.08, 1], [0.85, 1], [1, 0.6]]));
}
/** 踏顶借力 (stompPose, k 0 → 1, contact k ≈ .50): crisp 3-beat Wuxia light-footwork springboard vault —
 *  precision right-foot stomp down → deep weight compression (-0.08m dip, arms sweep cleanly back) → explosive vault push-off! */
function stompPose(I: Pose, k: number, off?: THREE.Vector3): Pose {
  const K = (keys: Keys) => S(k, keys);
  if (off) {
    off.y += S(k, [[0, 0.04], [0.36, 0], [0.56, -0.10], [0.86, 0.08], [1, 0.12]]);
  }
  return mix(I, {
    tL: K([[0, -1.10], [0.34, -1.18], [0.56, -1.42], [0.88, -1.12], [1, -0.95]]),
    kL: K([[0, 1.55], [0.34, 1.66], [0.56, 2.04], [0.88, 1.44], [1, 1.24]]),
    tR: K([[0, -0.36], [0.34, -0.22], [0.56, -0.86], [0.88, 0.28], [1, 0.36]]),
    kR: K([[0, 0.38], [0.34, 0.22], [0.56, 1.56], [0.88, 0.16], [1, 0.14]]),
    pL: 0.08, pR: -0.08,
    sx: K([[0, 0.16], [0.34, 0.12], [0.56, 0.52], [0.88, -0.06], [1, -0.04]]),
    hy: K([[0, -0.10], [0.56, -0.18], [1, -0.12]]),
    sy: K([[0, 0.10], [0.56, 0.18], [1, 0.14]]),
    nx: K([[0, -0.32], [0.34, -0.38], [0.56, -0.28], [0.88, -0.20], [1, -0.18]]),
    // Poised arms: balanced during stomp -> sweep cleanly down-back on compression -> left arm drives skyward on vault!
    aLx: K([[0, -0.45], [0.34, -0.32], [0.56, 0.58], [0.88, -1.26], [1, -1.18]]),
    aLz: K([[0, 0.44], [0.34, 0.48], [0.56, 0.34], [0.88, 0.36], [1, 0.36]]),
    fL: K([[0, -0.95], [0.56, -0.82], [0.88, -0.74], [1, -0.78]]), eL: 0.20,
    aRx: K([[0, 0.34], [0.34, 0.30], [0.56, 0.68], [0.88, 0.46], [1, 0.44]]),
    aRz: K([[0, -0.48], [0.34, -0.52], [0.56, -0.44], [0.88, -0.48], [1, -0.48]]),
    fR: -0.44, eR: -0.10, yR: -2.05,
    lift: K([[0, 1.2], [0.56, 0.9], [0.90, 1.65], [1, 1.5]]), flut: 1.1,
  }, 1);
}
/** 11-18 3C poses: the guard after a fight, a braking step (weight back, the front foot out), a skid (lower, leaning hard back) */
const READY: Partial<Pose> = { sx: 0.2, tL: -0.4, kL: 0.55, tR: 0.3, kR: 0.5, nx: -0.08 };
// (act-50 用户：「往一个方向跑步停下来那个身体后仰的动作很像挨了一下打」: the old step leaned back with both arms flung out, full on
//  in 0.04 s — a flinch. Now the stop sinks: the front foot planted, both knees taking the weight, the trunk carried a touch forward by the
//  run and coming back upright, the arms only swinging on a little ahead; eased in and out)
const BRAKE: Partial<Pose> = { sx: 0.1, tL: -0.5, kL: 0.5, tR: 0.3, kR: 0.65, aLx: -0.25, aLz: 0.12, aRz: -0.12, nx: 0.04 };
const SKID: Partial<Pose> = { sx: -0.26, tL: -0.8, kL: 0.3, tR: 0.5, kR: 0.95, aLx: -0.7, aLz: 0.85, aRz: -0.85, nx: -0.15 };
/** the landing (11-18): poised martial bow-stance absorption (ZERO wide T-pose flapping!) — deeper the harder the fall, then smooth rise */
function land(I: Pose, k: number, w = 0.6): Pose {
  const s = w * curve(1 - k, [[0, 0.55], [0.18, 1], [1, 0]]);
  return mix(I, {
    tL: -1.08, kL: 1.68, tR: 0.46, kR: 1.28, pL: 0.07, pR: -0.07,
    sx: 0.50, hy: -0.16, sy: 0.14, nx: -0.34,
    aLx: -0.20, aLz: 0.44, fL: -1.02, eL: 0.22,
    aRx: 0.38, aRz: -0.48, fR: -0.46, eR: 0.08, yR: -1.96,
  }, s);
}

/** every cloth chain on the model: [joint names root → tip, phase, kind]. Missing chains are skipped */
const CHAINS: Array<[string[], number, 'ribbon' | 'hair' | 'sleeve' | 'cloak']> = [
  [['scA1', 'scA2', 'scA3'], 0, 'ribbon'], [['scB1', 'scB2'], 1.9, 'ribbon'],          // 影忍 scarf tails
  [['bfA1', 'bfA2', 'bfA3'], 0.7, 'ribbon'], [['bfB1', 'bfB2', 'bfB3'], 2.6, 'ribbon'], // blindfold silk ribbons
  [['hrA1', 'hrA2', 'hrA3'], 1.3, 'hair'],                                               // heavy white ponytail
  [['hipSlv1', 'hipSlv2', 'hipSlv3'], 0.5, 'sleeve'],                                    // waist-tied empty right sleeve
  [['clA1', 'clA2'], 0.4, 'cloak'],                                                      // long cloak
];
/** how far the joints above this one have pitched / rolled */
function above(B: Record<string, Bone>, b: Bone, ax: 'x' | 'z') { let s = 0; for (let p = b.parent, i = 0; p && p !== B.root && i < 12; p = p.parent, i++) s += p.rotation[ax]; return s; }

interface LinkSpr { x: number; vx: number; z: number; vz: number }
interface VecSpr { dir: THREE.Vector3; vel: THREE.Vector3 }
interface PendSpr { dir: THREE.Vector3; vel: THREE.Vector3; lastPos: THREE.Vector3 | null }
interface ClothMem {
  t: number; x: number; y: number; z: number; yaw: number; twist: number;
  vFwd: number; vLat: number; vUp: number; aFwd: number; vYaw: number; vTwist: number;
  links: Map<string, LinkSpr>;
  vecs: Map<string, VecSpr>;
  tassel: PendSpr;
}
const CLOTH = new WeakMap<object, ClothMem>();
const wrapAng = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const _pDown = new THREE.Vector3(0, -1, 0), _pPos = new THREE.Vector3(), _pVel = new THREE.Vector3();
const _pWant = new THREE.Vector3(), _pLoc = new THREE.Vector3(), _pQ = new THREE.Quaternion(), _pQi = new THREE.Quaternion();
function stepSpr(s: LinkSpr, tx: number, tz: number, dt: number, stiff: number, zeta = 0.64) {
  if (dt <= 0) return;
  const sub = dt > 0.02 ? 2 : 1, h = dt / sub, damp = 2 * zeta * Math.sqrt(stiff);
  for (let i = 0; i < sub; i++) {
    s.vx += ((tx - s.x) * stiff - s.vx * damp) * h; s.x += s.vx * h;
    s.vz += ((tz - s.z) * stiff - s.vz * damp) * h; s.z += s.vz * h;
  }
}
function stepVecSpr(s: VecSpr, target: THREE.Vector3, dt: number, stiff: number, zeta: number) {
  if (dt <= 0) { s.dir.copy(target); return; }
  const sub = Math.max(dt > 0.02 ? 2 : 1, Math.ceil(dt * Math.sqrt(stiff) * 1.25));
  const h = dt / sub, damp = 2 * zeta * Math.sqrt(stiff);
  for (let i = 0; i < sub; i++) {
    s.vel.x += ((target.x - s.dir.x) * stiff - s.vel.x * damp) * h;
    s.vel.y += ((target.y - s.dir.y) * stiff - s.vel.y * damp) * h;
    s.vel.z += ((target.z - s.dir.z) * stiff - s.vel.z * damp) * h;
    s.dir.addScaledVector(s.vel, h);
    if (s.dir.lengthSq() > 1e-6) s.dir.normalize(); else s.dir.copy(target);
  }
}

/** True world-space gravity + air-drag + traveling-wave multi-link solver for hair, ribbons, tied hip sleeve & sword tassel:
 *  every segment respects world downward gravity so hair & ribbons NEVER float upward into the sky during sprint,
 *  instead streaming naturally back-and-down with realistic weight, catenary droop, stride ripples, and slash whip. */
export function tails(b: Record<string, Bone>, t: number, lift: number, flut: number, hair = 0.55, self?: BActor) {
  void hair;
  const key = (self ?? b) as object;
  let cm = CLOTH.get(key);
  const hx = self?.home.x ?? 0, hy = (self?.off.y ?? 0) + (self ? (MOTION.get(self)?.air ?? 0) : 0), hz = self?.home.z ?? 0, yaw = self?.yaw ?? 0;
  const m = self ? MOTION.get(self) : undefined;
  const twist = (b.hips?.rotation.y ?? 0) + (b.spine?.rotation.y ?? 0) + (b.chest?.rotation.y ?? 0);
  if (!cm || t < cm.t - 1e-4 || t - cm.t > 0.6) {
    cm = {
      t, x: hx, y: hy, z: hz, yaw, twist, vFwd: 0, vLat: 0, vUp: 0, aFwd: 0, vYaw: 0, vTwist: 0,
      links: new Map(), vecs: new Map(),
      tassel: { dir: new THREE.Vector3(0, -1, 0), vel: new THREE.Vector3(), lastPos: null },
    };
    CLOTH.set(key, cm);
  }
  const dt = Math.min(0.05, Math.max(0, t - cm.t));
  cm.t = t;
  if (dt > 0) {
    const dx = hx - cm.x, dz = hz - cm.z, d = Math.hypot(dx, dz);
    const f = 1 - Math.exp(-dt * 14);
    let rawFwd = m?.treadmill ?? 0, rawLat = 0;
    if (d > 1e-5 && d < 2.5) {
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      rawFwd = (dx * sy + dz * cy) / dt;
      rawLat = (dx * cy - dz * sy) / dt;
    } else if (m && m.run > 0.05 && rawFwd <= 0) {
      rawFwd = m.run * 5.2;
    }
    const prevFwd = cm.vFwd;
    cm.vFwd += (rawFwd - cm.vFwd) * f;
    cm.vLat += (rawLat - cm.vLat) * f;
    const rawUp = clamp((hy - cm.y) / dt, -10, 10);
    cm.vUp += (rawUp - cm.vUp) * f;
    const rawAcc = clamp((cm.vFwd - prevFwd) / dt, -22, 22);
    cm.aFwd += (rawAcc - cm.aFwd) * (1 - Math.exp(-dt * 12));
    const rawYaw = clamp(wrapAng(yaw - cm.yaw) / dt, -10, 10);
    const rawTwist = clamp(wrapAng(twist - cm.twist) / dt, -12, 12);
    cm.vYaw += (rawYaw - cm.vYaw) * f;
    cm.vTwist += (rawTwist - cm.vTwist) * f;
  }
  cm.x = hx; cm.y = hy; cm.z = hz; cm.yaw = yaw; cm.twist = twist;

  const rs = MOTION_TUNE.ribbonSpring;
  const speedNorm = clamp(Math.max(0, cm.vFwd) / 6.0, 0, 1.15);
  const speedDrag = speedNorm * rs;
  const trueFall = !!(m && m.air > 0.12 && cm.vUp < -1.6);
  // Real vertical aerodynamics: genuine mid-air freefall lifts cloth; grounded sprint bounce only adds subtle vertical ripple
  const fallUp = trueFall ? clamp(-cm.vUp * 0.30 * rs, 0, 1.35) : clamp(-cm.vUp * 0.09 * rs, -0.24, 0.22);
  const accelBack = clamp(cm.aFwd * 0.045 * rs, -0.45, 0.55);
  const whipLat = clamp((-cm.vYaw * 0.20 - cm.vTwist * 0.16 - cm.vLat * 0.12) * rs, -1.6, 1.6);
  // Subtle attack/dash wind burst from Pose.lift (only horizontal back-drag, never upward anti-gravity!)
  const actBurst = Math.max(0, lift - 0.55) * 0.45 * rs;
  const stridePh = m ? m.phase : t * 4.5;
  const strideRun = m ? clamp(m.run, 0, 1) : 0;
  const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
  const leftX = Math.cos(yaw), leftZ = -Math.sin(yaw);
  const freq = 3.4 + 4.4 * Math.max(flut * 0.5, speedNorm);

  const rootObj = self?.root ?? b.root;
  if (rootObj) rootObj.updateMatrixWorld(true);

  for (const [names, ph, kind] of CHAINS) {
    if (!b[names[0]]) continue;
    // Physical weight & aerodynamic parameters per material:
    // High ponytail ('hair'): supple, bouncy spring with lively 2x vertical stride-bounce + 1x left-right stride swish
    // traveling root -> mid -> tip, while staying strictly below horizontal (never floating skyward!).
    const grav0 = kind === 'hair' ? 1.24 : kind === 'sleeve' ? 1.32 : kind === 'cloak' ? 1.45 : 1.05;
    const dragK = kind === 'hair' ? 1.14 : kind === 'sleeve' ? 1.25 : kind === 'cloak' ? 1.05 : 1.62;
    const waveK = kind === 'hair' ? 0.34 : kind === 'sleeve' ? 0.30 : kind === 'cloak' ? 0.16 : 0.40;
    const zeta = kind === 'hair' ? 0.46 : kind === 'sleeve' ? 0.50 : kind === 'cloak' ? 0.64 : 0.48;
    const baseDownY = kind === 'hair' ? 0.25 : kind === 'sleeve' ? 0.44 : kind === 'cloak' ? 0.56 : 0.34;

    for (let i = 0; i < names.length; i++) {
      const n = names[i], bone = b[n];
      if (!bone || !bone.parent) continue;
      const minDownY = Math.min(0.86, baseDownY + (kind === 'hair' ? 0.08 * i : kind === 'ribbon' ? 0.08 * i : 0.11 * i));
      // Traveling wave phase lags down the chain (root -> mid -> tip)
      const lag = i * 1.42;
      const tipGain = 0.38 + 0.68 * i; // root steadier, mid & tip curve/ripple visibly!
      const wMain = Math.sin(t * freq - lag + ph) * 0.72 + Math.sin(t * freq * 1.71 - lag * 1.3 + ph * 1.4) * 0.28;
      const wLat = Math.sin(t * (freq * 0.68) - lag * 0.95 + ph * 1.2);
      // Stride-coupled vertical bounce & left-right swish:
      // High ponytail resonates naturally with running stride (~16 rad/s swish, ~32 rad/s footfall bounce) with root->tip whip lag!
      const hairBounceY = kind === 'hair'
        ? Math.sin(stridePh * 2 - i * 1.15) * (0.76 + 0.54 * i) * strideRun * rs
        : 0;
      const hairSwishLat = kind === 'hair'
        ? Math.sin(stridePh - i * 0.92) * (0.48 + 0.36 * i) * strideRun * rs
        : 0;
      const legKick = kind === 'sleeve'
        ? (0.44 * Math.max(0, Math.sin(stridePh + Math.PI - i * 0.95)) + 0.18 * Math.sin(stridePh * 2 - i * 1.15)) * strideRun * rs
        : kind === 'hair'
          ? Math.cos(stridePh * 2 - i * 1.15) * (0.22 + 0.14 * i) * strideRun * rs
          : 0.14 * Math.sin(stridePh * 2 - i * 0.95) * strideRun * rs;
      const legLat = kind === 'sleeve' ? 0.36 * Math.sin(stridePh - i * 0.85) * strideRun * rs : hairSwishLat;

      // Progressive catenary weight: each downstream link feels slightly heavier relative to horizontal drag,
      // producing a natural downward arc + supple wave instead of a stiff rod!
      const grav = grav0 * (1 + (kind === 'hair' ? 0.22 * i : kind === 'ribbon' ? 0.20 * i : 0.26 * i));
      const dragTaper = 1 - 0.12 * i;
      const backPull = (0.14 * rs + speedDrag * dragK * dragTaper + actBurst + accelBack + legKick)
        + wMain * waveK * (0.18 + 0.82 * Math.max(speedNorm, flut * 0.45)) * tipGain * rs;
      const sidePull = whipLat * (0.50 + 0.34 * i) + legLat
        + wLat * (0.10 + 0.28 * Math.max(speedNorm, flut * 0.4)) * tipGain * rs;
      const vertForce = -grav + fallUp * (0.75 + 0.25 * i) + hairBounceY
        + wMain * (waveK * 0.62) * speedNorm * tipGain * rs;

      _pWant.set(
        -fwdX * backPull + leftX * sidePull,
        vertForce,
        -fwdZ * backPull + leftZ * sidePull,
      );
      if (_pWant.lengthSq() < 1e-6) _pWant.set(0, -1, 0);
      _pWant.normalize();
      // Hard gravity ceiling unless truly falling in mid-air: prevents hair/ribbons from EVER floating up into the sky!
      if (!trueFall && _pWant.y > -minDownY) {
        const xy = Math.hypot(_pWant.x, _pWant.z);
        const keep = Math.sqrt(Math.max(0, 1 - minDownY * minDownY));
        _pWant.y = -minDownY;
        if (xy > 1e-5) { _pWant.x *= keep / xy; _pWant.z *= keep / xy; }
      }

      // Step the 2nd-order elastic spring directly in WORLD SPACE so downstream links NEVER inherit
      // cascading overshoot or head-pitch jumps, and strictly enforce the gravity ceiling after spring integration!
      // Hair uses stride-resonant natural frequencies (~10-14.5 rad/s) so sprint bounce & swish aren't low-pass crushed!
      const stiff = kind === 'hair'
        ? Math.max(92, 210 - i * 58)
        : Math.max(22, (kind === 'sleeve' ? 58 : 66) - i * 14);
      let vs = cm.vecs.get(n);
      if (!vs) { vs = { dir: _pWant.clone(), vel: new THREE.Vector3() }; cm.vecs.set(n, vs); }
      stepVecSpr(vs, _pWant, dt, stiff, zeta);
      if (!trueFall && vs.dir.y > -minDownY) {
        const xy = Math.hypot(vs.dir.x, vs.dir.z);
        const keep = Math.sqrt(Math.max(0, 1 - minDownY * minDownY));
        vs.dir.y = -minDownY;
        if (xy > 1e-5) { vs.dir.x *= keep / xy; vs.dir.z *= keep / xy; }
        if (vs.vel.y > 0) vs.vel.y = 0;
      }

      // Convert simulated world direction into parent bone's local frame (with fresh parent world transform)
      bone.parent.getWorldQuaternion(_pQ);
      _pLoc.copy(vs.dir).applyQuaternion(_pQi.copy(_pQ).invert()).normalize();

      // Collision guard on root link (i === 0): keep clear of upright head/back,
      // but relax smoothly when head bows sharply or lies sideways (e.g. kneeling/fallen death) so ribbons drape onto ground!
      if (i === 0) {
        const upY = _pDown.clone().applyQuaternion(_pQ).y; // -1 when head is upright, ~0 when bowed/lying
        const uprightK = clamp((-upY - 0.25) / 0.55, 0, 1);
        const minBack = (kind === 'hair' ? 0.14 : kind === 'sleeve' ? 0.16 : 0.08) * uprightK;
        if (minBack > 0.01 && _pLoc.z > -minBack) {
          _pLoc.z = -minBack;
          if (_pLoc.y > -0.15 && !trueFall) _pLoc.y = -0.15;
          _pLoc.normalize();
        }
        if (kind === 'sleeve' && uprightK > 0.2 && _pLoc.x > 0.14) { _pLoc.x = 0.14; _pLoc.normalize(); }
      }
      bone.quaternion.setFromUnitVectors(_pDown, _pLoc);
      bone.updateMatrixWorld(true);
    }
  }

  // Face-framing side hair locks (hairL / hairR): soft gravity-preserving sway, strictly clamped outward so never clipping cheeks
  for (const [bn, sideSign] of [['hairL', 1], ['hairR', -1]] as const) {
    const hb = b[bn]; if (!hb) continue;
    const hpx = above(b, hb, 'x'), hpz = above(b, hb, 'z');
    const tx = clamp((0.08 + 0.34 * speedDrag + clamp(fallUp * 0.25, -0.2, 0.3)) * rs - hpx * 0.55 + Math.sin(t * 2.8 + sideSign) * 0.03 * rs, -0.18, 0.52);
    const rawZ = -hpz * 0.5 + whipLat * 0.20 + Math.sin(t * 2.1 + sideSign * 1.4) * 0.025 * rs + sideSign * (0.04 + 0.12 * speedDrag) * rs;
    const tz = sideSign > 0 ? clamp(rawZ, 0, 0.42) : clamp(rawZ, -0.42, 0);
    let sp = cm.links.get(bn); if (!sp) { sp = { x: tx, vx: 0, z: tz, vz: 0 }; cm.links.set(bn, sp); }
    stepSpr(sp, tx, tz, dt, 54, 0.64);
    rot(hb, clamp(sp.x, -0.18, 0.52), 0, sideSign > 0 ? Math.max(0, sp.z) : Math.min(0, sp.z));
  }

  // Front waist sash knot / cord (sashT): stays clear outside pelvis (rot.x <= 0.02), responds smoothly to steps & jumps
  if (b.sashT) {
    const spx = above(b, b.sashT, 'x');
    const stepKick = Math.abs(Math.sin(stridePh)) * 0.14 * strideRun * rs;
    const tx = clamp(-Math.max(0, 0.06 + 0.20 * speedDrag + stepKick + Math.max(0, fallUp * 0.25)) * rs - Math.max(0, spx) * 0.55 - Math.abs(Math.sin(t * 2.6)) * 0.03 * rs, -0.52, 0.02);
    const tz = clamp(whipLat * 0.20 + Math.sin(t * 2.4 + 1.1) * 0.035 * rs, -0.36, 0.36);
    let sp = cm.links.get('sashT'); if (!sp) { sp = { x: tx, vx: 0, z: tz, vz: 0 }; cm.links.set('sashT', sp); }
    stepSpr(sp, tx, tz, dt, 50, 0.56);
    rot(b.sashT, Math.min(0.02, sp.x), 0, sp.z);
  }

  // World-space gravity + swing-inertia pendulum for the sword's crimson tassel (swTassel):
  // ALWAYS hangs naturally with gravity and trails behind slashes instead of pointing rigidly skyward!
  if (b.swTassel && b.weapon && b.root) {
    b.root.updateMatrixWorld(true);
    b.weapon.getWorldQuaternion(_pQ);
    b.swTassel.getWorldPosition(_pPos);
    _pVel.set(0, 0, 0);
    if (cm.tassel.lastPos && dt > 0) {
      _pVel.subVectors(_pPos, cm.tassel.lastPos).divideScalar(dt);
      const vl = _pVel.length();
      if (vl > 14) _pVel.multiplyScalar(14 / vl);
    }
    if (!cm.tassel.lastPos) cm.tassel.lastPos = _pPos.clone(); else cm.tassel.lastPos.copy(_pPos);
    const windX = Math.sin(t * 3.7) * 0.09 * rs, windZ = Math.cos(t * 2.9) * 0.09 * rs;
    const runX = -fwdX * speedDrag * 0.65, runZ = -fwdZ * speedDrag * 0.65;
    _pWant.set(-_pVel.x * 0.14 * rs + runX + windX, -1.0 - _pVel.y * 0.10 * rs, -_pVel.z * 0.14 * rs + runZ + windZ).normalize();
    _pLoc.copy(_pWant).applyQuaternion(_pQi.copy(_pQ).invert()).normalize();
    if (dt > 0) {
      const stiff = 62, damp = 2 * 0.52 * Math.sqrt(stiff);
      const sub = dt > 0.02 ? 2 : 1, h = dt / sub;
      for (let i = 0; i < sub; i++) {
        cm.tassel.vel.x += ((_pLoc.x - cm.tassel.dir.x) * stiff - cm.tassel.vel.x * damp) * h;
        cm.tassel.vel.y += ((_pLoc.y - cm.tassel.dir.y) * stiff - cm.tassel.vel.y * damp) * h;
        cm.tassel.vel.z += ((_pLoc.z - cm.tassel.dir.z) * stiff - cm.tassel.vel.z * damp) * h;
        cm.tassel.dir.addScaledVector(cm.tassel.vel, h);
        if (cm.tassel.dir.lengthSq() > 1e-6) cm.tassel.dir.normalize(); else cm.tassel.dir.copy(_pLoc);
      }
    } else cm.tassel.dir.copy(_pLoc);
    b.swTassel.quaternion.setFromUnitVectors(_pDown, cm.tassel.dir);
  }

  // a cape on the cape joint: damped spring response to speed & turning
  if (b.cape && b.cape.children.length) {
    let sp = cm.links.get('cape');
    const tx = clamp(0.10 + 0.45 * speedDrag + clamp(fallUp * 0.25, -0.2, 0.35) - above(b, b.cape, 'x') * 0.6, 0, 0.85) + Math.sin(t * freq) * 0.04 * flut;
    const tz = clamp(whipLat * 0.22 + Math.sin(t * freq * 0.7) * 0.03 * flut, -0.45, 0.45);
    if (!sp) { sp = { x: tx, vx: 0, z: tz, vz: 0 }; cm.links.set('cape', sp); }
    stepSpr(sp, tx, tz, dt, 40, 0.68);
    rot(b.cape, Math.max(0, sp.x), 0, sp.z);
  }
}

// ---- blade trails along each cut's swing, dust on the dash, the run and the landings
/** the blade's real root (-z) and point (+z) on a model, measured once from its 'blade' part's mesh */
const SPAN = new WeakMap<object, { mesh: THREE.Object3D; root: THREE.Vector3; tip: THREE.Vector3 } | null>();
function measureBlade(self: BActor) {
  let t = SPAN.get(self);
  if (t === undefined) {
    t = null; const b = (self.bones as Record<string, THREE.Object3D | undefined>).blade;
    if (b) b.traverse(o => {
      const m = o as THREE.Mesh;
      if (!t && m.isMesh && m.geometry) {
        m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox!;
        const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
        t = { mesh: m, root: new THREE.Vector3(cx, cy, bb.min.z), tip: new THREE.Vector3(cx, cy, bb.max.z) };
      }
    });
    SPAN.set(self, t);
  }
  return t;
}
export function bladeTip(self: BActor) {
  const t = measureBlade(self);
  if (t) return t.mesh.localToWorld(t.tip.clone());
  return self.bones.weapon.localToWorld(new THREE.Vector3(0, 0, (self.def.tip ?? 13) * ((self as unknown as { cx?: number }).cx ?? CELL)));
}
export function bladeSpan(self: BActor): { root: THREE.Vector3; tip: THREE.Vector3 } {
  const t = measureBlade(self);
  if (t) return { root: t.mesh.localToWorld(t.root.clone()), tip: t.mesh.localToWorld(t.tip.clone()) };
  const len = (self.def.tip ?? 13) * ((self as unknown as { cx?: number }).cx ?? CELL);
  return {
    root: self.bones.weapon.localToWorld(new THREE.Vector3(0, 0, 0)),
    tip: self.bones.weapon.localToWorld(new THREE.Vector3(0, 0, len)),
  };
}
const mem = new WeakMap<object, { root: THREE.Vector3 | null; tip: THREE.Vector3 | null; tipL: THREE.Vector3 | null; k: number; name: string; ph: number; air: number }>();
// act-112: exact blade-acceleration windows for world-axis-aligned 3D voxel blade light glued directly to bladeTip(self)
const VOX_SWING: Record<string, Array<[number, number]>> = {
  k1: [[0.26, 0.56]],
  k2: [[0.24, 0.54]],
  k3: [[0.18, 0.75]],
  k4: [[0.22, 0.39], [0.48, 0.68]],
  k5: [[0.34, 0.66]],
  rel: [[0.12, 0.36]],
  acut: [[0.10, 0.27], [0.30, 0.54]],
  acutF: [[0.30, 0.80]],
  swoop: [[0.30, 0.54]],
  plunge: [[0.55, 1.01]],
};
/** act-109: taut 0-frame coil pose on pressing 斩 in free state — seamlessly feeds k1 (tap) or 藏锋 (hold) */
const COIL: Partial<Pose> = {
  hy: -0.58, sy: -0.45, sx: 0.34, nx: -0.2, ny: 0.3,
  aRx: -1.0, aRz: -0.95, fR: -1.52, eR: 0.65, yR: -1.1,
  aLx: -0.28, aLz: 0.2, fL: -0.65, eL: 0.1,
  tL: -0.65, kL: 0.96, tR: 0.36, kR: 0.86, lift: 0.55, flut: 0.5,
};
function trails(self: BActor, a: Action | null, m: Motion | undefined) {
  let M = mem.get(self); if (!M) { M = { root: null, tip: null, tipL: null, k: 0, name: '', ph: 0, air: 0 }; mem.set(self, M); }
  const k = a ? poseK(a) : 0, name = a?.name ?? '', fresh = name !== M.name || k < M.k, vsw = VOX_SWING[name];
  // act-30 / act-112: measure the blade's real root & tip from the model's blade mesh so voxel slash light stays 100% glued to the tip
  const { root, tip } = bladeSpan(self), tipL = self.bones.offhand.localToWorld(new THREE.Vector3(0, 0, 6 * CELL));
  if (vsw && !fresh && M.tip && M.root && k > M.k) {
    for (const w of vsw) if (k > w[0] && k < w[1]) slashArc.bladeStep(M.root, M.tip, root, tip, name);
  }
  if (name === 'dashA' && (fresh ? -1 : M.k) < 0.05 && k >= 0.05 && (!m || m.air < 0.05)) dustBlocks(self.local(0, 0, -0.2), 7, self.fwd().multiplyScalar(-1));
  if (name === 'rel' && (fresh ? -1 : M.k) < 0.02 && k >= 0.02) dustBlocks(self.local(0, 0, -0.25), 9, self.fwd().multiplyScalar(-1));
  if (m) {
    // sprint footfalls: a small kick of dirt behind each step (the stride phase crossing a multiple of π)
    if (m.run > 0.85 && m.air < 0.02 && !a && Math.floor(m.phase / Math.PI) !== Math.floor(M.ph / Math.PI)) dustBlocks(self.local(0, 0, -0.15), 2, self.fwd().multiplyScalar(-0.6));
    M.ph = m.phase; M.air = m.air;
  }
  M.root = root; M.tip = tip; M.tipL = tipL; M.k = k; M.name = name;
}

/** the blind swordsmen tilt the head now and then, listening */
const HAND_L = new THREE.Euler();
const _qTwist = new THREE.Quaternion(), _qSwing = new THREE.Quaternion(), _qInv = new THREE.Quaternion();
const _qHandSwing = new THREE.Quaternion(), _qHand = new THREE.Quaternion(), _qWep = new THREE.Quaternion();
const _vOff = new THREE.Vector3();
/** Anatomical swing-twist wrist limiter for the sword hand: separates natural forearm pronation/supination (Y twist)
 *  from wrist bending (XZ swing), keeps the fist tightly seated inside the forearm cuff (<= 10.3 deg bend + subtle
 *  cuff-seat tuck + true forearm centerline pivot compensation so the wrist root NEVER exposes a seam or shifts off-axis
 *  even on 180-deg reverse-grip sprints), and absorbs extra grip tilt cleanly around the palm pivot (`weapon`). */
function limitRightWrist(b: Record<string, Bone>, maxBend = 0.18, halfCell = CELL / 4) {
  const hand = b.handR; if (!hand) return;
  const qFull = hand.quaternion;
  const lenT = Math.hypot(qFull.y, qFull.w);
  if (lenT > 1e-5) _qTwist.set(0, qFull.y / lenT, 0, qFull.w / lenT);
  else _qTwist.identity();
  _qSwing.copy(qFull).multiply(_qInv.copy(_qTwist).invert());
  if (_qSwing.w < 0) _qSwing.set(-_qSwing.x, -_qSwing.y, -_qSwing.z, -_qSwing.w);
  const swingAng = 2 * Math.acos(Math.min(1, _qSwing.w));
  const usedBend = Math.min(swingAng, maxBend);
  if (swingAng > maxBend) {
    const s = Math.sin(maxBend * 0.5) / Math.max(1e-6, Math.sin(swingAng * 0.5));
    _qHandSwing.set(_qSwing.x * s, _qSwing.y * s, _qSwing.z * s, Math.cos(maxBend * 0.5)).normalize();
    _qHand.copy(_qHandSwing).multiply(_qTwist);
    _qWep.copy(_qHand).invert().multiply(qFull);
    hand.quaternion.copy(_qHand);
    if (b.weapon) b.weapon.quaternion.copy(_qWep);
  } else if (b.weapon) {
    b.weapon.quaternion.identity();
  }
  // Compensate for handR pivot sitting at z=0 while the forearm/wrist centerline is at z=-0.5 voxel:
  // keeps the fist centered on the forearm cuff even at 180 deg pronation (sprint trailing grip)
  _vOff.set(0, 0, -halfCell).applyQuaternion(hand.quaternion);
  hand.position.x -= _vOff.x;
  hand.position.z -= (_vOff.z + halfCell);
  // Seat the fist root ~0.5 cell upward into the forearm cuff whenever bent or twisted so no wrist-root gap/ledge ever shows
  const twistAng = 2 * Math.acos(Math.min(1, Math.abs(_qTwist.w)));
  hand.position.y += 0.012 + 0.016 * Math.min(1, (usedBend / maxBend) * 0.7 + Math.sin(twistAng * 0.5) * 0.45);
}
/** how far the foot may bend off a right angle with its shin while she walks / runs (rad) */
const ANKLE = 0.3;
/** the boot's reach in front of / behind the ankle pivot (m; fine heroines: toe 5 cells forward, heel 2 back, at 3.5 cm). Tilting the
 *  foot by θ drops the toe (heel) by at most reach·sin θ, so once the ankle is `reach` up any tilt clears the ground */
const TOE = 0.175, HEEL = 0.07;
/** the largest tilt (rad) whose toe / heel drop stays within `lift` (m) */
const tiltRoom = (reach: number, lift: number) => lift >= reach ? Infinity : Math.asin(Math.max(0, lift / reach));
const BLIND_IDS = new Set([...BLIND, ...SLIM].map(d => d.id));
/** alternating subtle "listening" head-tilt with a brief stillness hold (catching wind/footsteps) */
function listen(b: Record<string, Bone>, t: number) {
  const period = 7.6, cyc = Math.floor(t / period), u = ((t % period) + period) % period;
  // Rise smoothly (0..0.55s), hold listening stillness (0.55..1.55s), settle smoothly (1.55..2.35s)
  const k = u < 2.35 ? smooth(0, 0.55, u) * (1 - smooth(1.55, 2.35, u)) : 0;
  const side = cyc % 3 === 1 ? -0.75 : 1; // mostly right ear forward, occasionally checks left
  if (b.head) { b.head.rotation.z += 0.21 * side * k; b.head.rotation.y += 0.24 * side * k; }
}

/** 4-directional (360-deg continuous) martial hurt reaction for Liu Bai:
 *  fromAngle = direction blow arrived FROM in hero local frame (0 = front/+Z, PI = back/-Z, +PI/2 = left/+X, -PI/2 = right/-X).
 *  Features crisp 2-frame torso impact snap, ~32ms delayed neck/head/arm whiplash, grounded recoil footwork, and damped guard recovery. */
function heroHurt(P: Pose, k: number, power = 1, fromAngle = 0, off: THREE.Vector3): Pose {
  const amp = clamp(power || 1, 0.35, 1.55);
  const wMul = 0.35 + 0.65 * MOTION_TUNE.hurtWhip;
  // Core torso snaps rapidly into impact, holds briefly, rebounds subtly past neutral before settling
  const core = amp * curve(k, [[0, 0], [0.11, 1.0], [0.24, 0.96], [0.68, -0.14], [1, 0]]);
  // Delayed whiplash for neck/head & outer limbs (~32ms lag behind torso core)
  const kLag = clamp01(k - 0.08 * MOTION_TUNE.hurtWhip);
  const whip = amp * curve(kLag, [[0, 0], [0.13, 1.12], [0.28, 1.02], [0.74, -0.18], [1, 0]]) * wMul;
  // Recoil vector in hero local frame (+Z forward, +X hero's left): blow fromAngle pushes hero along (-sin, -cos)
  const rx = -Math.sin(fromAngle), rz = -Math.cos(fromAngle);
  const frontW = Math.max(0, -rz); // hit from front -> knocked backward (-Z)
  const backW  = Math.max(0, rz);  // hit from back  -> knocked forward  (+Z)
  const leftHit = Math.max(0, -rx); // hit from left (+X) -> knocked right (-X)
  const rightHit = Math.max(0, rx); // hit from right (-X) -> knocked left (+X)

  off.x += rx * 0.22 * core;
  off.z += rz * 0.25 * core;

  // Torso pitch/roll/twist driven directly by impact direction
  const hy = P.hy + (-0.16 * frontW + 0.14 * backW - 0.30 * leftHit + 0.30 * rightHit) * core;
  const hz = P.hz + (-0.14 * leftHit + 0.14 * rightHit) * core;
  const sx = P.sx + (-0.46 * frontW + 0.58 * backW + 0.10 * (leftHit + rightHit)) * core;
  const sy = P.sy + (-0.24 * frontW + 0.16 * backW - 0.44 * leftHit + 0.44 * rightHit) * core;
  const sz = P.sz + (-0.32 * leftHit + 0.32 * rightHit) * core;
  const cx = P.cx + (-0.22 * frontW + 0.24 * backW) * core;
  // Delayed head whiplash: snaps backward on frontal/rear impact, counter-turns toward attacker on side blows
  const nx = P.nx + (-0.34 * frontW - 0.46 * backW * (1 - smooth(0.32, 0.72, k)) + 0.22 * backW * smooth(0.24, 0.65, k)) * whip;
  const ny = P.ny + (0.20 * frontW + 0.34 * leftHit - 0.34 * rightHit) * whip;

  // Arms react authentically without ever clipping through chest or locking left elbow straight:
  // Front hit: left guard hand snaps reflexively up-across chest, sword arm recoils back-outward guarding blade.
  // Back hit: both arms fling forward-outward catching balance.
  // Side hit: struck-side arm guards ribs/shoulder while far arm whips outward as counterweight.
  const aLx = P.aLx + (-0.68 * frontW - 0.42 * backW - 0.56 * leftHit - 0.28 * rightHit) * whip;
  const aLz = P.aLz + (0.14 * frontW + 0.54 * backW - 0.18 * leftHit + 0.64 * rightHit) * whip;
  const fL  = clamp(P.fL + (-0.62 * frontW - 0.25 * backW - 0.65 * leftHit - 0.18 * rightHit) * whip, -1.85, -0.24);
  const aRx = P.aRx + (0.34 * frontW - 0.28 * backW + 0.18 * leftHit + 0.38 * rightHit) * whip;
  const aRz = P.aRz + (-0.42 * frontW - 0.48 * backW - 0.58 * leftHit - 0.62 * rightHit) * whip;
  const fR  = clamp(P.fR + (-0.25 * frontW + 0.32 * backW + 0.20 * leftHit + 0.28 * rightHit) * whip, -1.75, -0.18);
  const eR  = P.eR + (0.35 * frontW - 0.48 * backW - 0.18 * leftHit + 0.36 * rightHit) * whip;
  const yR  = P.yR + (-0.45 * frontW + 0.25 * backW - 0.62 * leftHit - 0.85 * rightHit) * whip;

  // Legs brace into the stagger direction (absorbing weight into bent knees)
  const tL = P.tL + (0.18 * frontW - 0.48 * backW - 0.20 * rightHit + 0.12 * leftHit) * core;
  const kL = clamp(P.kL + (0.28 * frontW + 0.56 * backW + 0.36 * rightHit + 0.18 * leftHit) * core, 0.12, 1.85);
  const tR = P.tR + (0.24 * frontW + 0.34 * backW - 0.22 * leftHit + 0.12 * rightHit) * core;
  const kR = clamp(P.kR + (0.36 * frontW + 0.24 * backW + 0.40 * leftHit + 0.18 * rightHit) * core, 0.12, 1.85);
  const pL = P.pL + (0.18 * rightHit - 0.08 * leftHit) * core;
  const pR = P.pR + (-0.18 * leftHit + 0.08 * rightHit) * core;

  return {
    ...P, hy, hz, sx, sy, sz, cx, nx, ny,
    aLx, aLz, fL, aRx, aRz, fR, eR, yR,
    tL, kL, pL, tR, kR, pR,
    lift: P.lift + 0.55 * Math.abs(core),
    flut: Math.min(1, P.flut + 0.85 * Math.abs(whip)),
  };
}

/** 4-beat dignified Wuxia swordswoman defeat (k: 0 -> 1 over 1.65s, held at k=1 while dead):
 *  Beat 1 (0.00-0.16): Fatal stagger back, clutching chest;
 *  Beat 2 (0.16-0.50): Both knees buckle properly FORWARD into a right-knee kneel while planting the blade tip vertically
 *                      into the ground to prop herself up for one trembling final breath;
 *  Beat 3 (0.50-0.84): Strength gives out — collapses smoothly forward-left onto her side/shoulder (blade settles flat on earth);
 *  Beat 4 (0.84-1.00): Ground impact micro-settle into complete tragic stillness. */
function heroFall(I: Pose, k: number, fromAngle = 0, off: THREE.Vector3): { P: Pose; lieW: number; settle: number } {
  const K = (keys: Keys) => S(k, keys);
  const rz = -Math.cos(fromAngle), rx = -Math.sin(fromAngle);
  // Subtle directional stagger on Beat 1, settling into grounded collapse position
  const stag = curve(k, [[0, 0], [0.14, 1], [0.46, 0.72], [0.85, 0.45], [1, 0.45]]);
  off.z += (rz * 0.16 - 0.06) * stag;
  off.x += rx * 0.10 * stag;
  // Subtle final tremor while propped on the blade (Beat 2)
  const trem = k > 0.24 && k < 0.50 ? Math.sin(k * 95) * 0.015 * Math.sin(((k - 0.24) / 0.26) * Math.PI) : 0;
  // Ground impact micro-bounce at k = 0.84..0.94
  const settle = k > 0.83 && k < 0.95 ? Math.sin(((k - 0.83) / 0.12) * Math.PI) * 0.022 : 0;
  const lieW = smooth(0.48, 0.84, k);

  const A: Partial<Pose> = {
    // Hips: stay upright while kneeling (0..0.48), then collapse gracefully FORWARD-SIDEWAYS along her facing line
    // (hx -> +1.18, hz -> +0.52) so her full silhouette, red blindfold, and resting blade stay clearly visible from ALL cameras!
    hx: K([[0, 0], [0.16, -0.08], [0.46, 0.10], [0.68, 0.82], [0.84, 1.22], [0.92, 1.16], [1, 1.18]]),
    hy: K([[0, -0.25], [0.16, -0.35], [0.46, -0.18], [0.72, -0.32], [0.85, -0.38], [1, -0.38]]),
    hz: K([[0, 0], [0.46, 0.06], [0.68, 0.36], [0.84, 0.56], [0.92, 0.50], [1, 0.52]]),
    // Spine & chest: snap back on blow -> bow forward over planted blade -> settle softly forward-side on earth
    sx: K([[0, 0.15], [0.14, -0.32], [0.34, 0.42 + trem], [0.48, 0.48 + trem], [0.74, 0.24], [0.86, 0.14], [1, 0.14]]),
    sy: K([[0, 0.10], [0.14, -0.22], [0.46, 0.06], [0.84, -0.22], [1, -0.22]]),
    sz: K([[0, 0], [0.46, 0.04], [0.84, 0.14], [1, 0.14]]),
    cx: K([[0, 0], [0.14, -0.18], [0.44, 0.14], [0.84, 0.04], [1, 0.04]]),
    // Head: whips back on impact -> bows heavily while kneeling -> cheek turns gently to the right resting on ground
    nx: K([[0, -0.10], [0.14, -0.36], [0.36, 0.36 + trem], [0.50, 0.42], [0.76, -0.08], [0.88, -0.16], [1, -0.16]]),
    ny: K([[0, 0.10], [0.16, 0.18], [0.48, -0.08], [0.84, -0.68], [1, -0.68]]),
    // Legs: STRICTLY positive forward knee bend (kL/kR > 0)! Kneels onto earth, then extends relaxed along the ground behind hips
    tL: K([[0, -0.35], [0.16, -0.52], [0.36, -1.12], [0.50, -1.14], [0.76, -0.42], [0.88, -0.28], [1, -0.28]]),
    kL: K([[0, 0.45], [0.16, 0.72], [0.36, 1.66], [0.50, 1.72], [0.76, 0.72], [0.88, 0.56], [1, 0.56]]),
    pL: K([[0, 0.08], [0.46, 0.10], [0.84, 0.06], [1, 0.06]]),
    tR: K([[0, 0.20], [0.16, 0.32], [0.36, 0.12], [0.50, 0.16], [0.76, -0.10], [0.88, 0.04], [1, 0.04]]),
    kR: K([[0, 0.35], [0.16, 0.58], [0.36, 1.84], [0.50, 1.88], [0.76, 0.54], [0.88, 0.38], [1, 0.38]]),
    pR: K([[0, -0.08], [0.46, -0.10], [0.84, -0.06], [1, -0.06]]),
    // Right sword arm: holds hilt high enough while kneeling so the FULL 1.3m blade stays visible with tip planted ON y=0,
    // then relaxes out to the right-front with the blade resting flat along the ground!
    aRx: K([[0, -0.35], [0.15, 0.15], [0.34, -1.16], [0.50, -1.12], [0.74, -0.82], [0.86, -0.72], [1, -0.72]]),
    aRz: K([[0, -0.32], [0.15, -0.58], [0.34, -0.12], [0.50, -0.12], [0.74, -0.42], [0.86, -0.52], [1, -0.52]]),
    fR: K([[0, -0.95], [0.15, -0.52], [0.34, -0.42], [0.50, -0.45], [0.74, -0.55], [0.86, -0.58], [1, -0.58]]),
    eR: K([[0, 0.35], [0.15, -0.55], [0.34, -0.82], [0.50, -0.78], [0.74, -0.10], [0.86, -0.02], [1, -0.02]]),
    yR: K([[0, -0.15], [0.15, -0.45], [0.34, -0.10], [0.50, -0.10], [0.74, -0.32], [0.86, -0.42], [1, -0.42]]),
    rR: K([[0, 0], [0.50, 0], [0.76, -1.15], [0.86, -1.48], [1, -1.48]]),
    // Left arm: clutches chest on blow -> braces over left knee -> stretches out forward-left cushioning the fall
    aLx: K([[0, -0.45], [0.15, -0.82], [0.36, -0.56], [0.52, -0.64], [0.74, -1.18], [0.86, -1.28], [1, -1.28]]),
    aLz: K([[0, 0.16], [0.15, -0.22], [0.36, 0.12], [0.52, 0.24], [0.74, 0.42], [0.86, 0.48], [1, 0.48]]),
    fL: K([[0, -0.72], [0.15, -1.52], [0.36, -0.88], [0.52, -0.82], [0.74, -0.62], [0.86, -0.68], [1, -0.68]]),
    eL: 0, yL: 0,
    lift: K([[0, 0.3], [0.15, 0.7], [0.50, 0.15], [0.78, 0.35], [0.92, 0.05], [1, 0.02]]),
    flut: K([[0, 0.25], [0.15, 0.8], [0.50, 0.12], [0.78, 0.4], [0.95, 0.04], [1, 0.02]]),
  };
  return { P: mix(I, A, curve(k, [[0, 0], [0.06, 1], [1, 1]])), lieW, settle };
}

const heroHook = (b: Record<string, Bone>, t: number, a: Action | null, off: THREE.Vector3, self: unknown) => {
  const m = self ? MOTION.get(self as object) : undefined, inAir = !!m && m.air > 0.01, self0 = self as (BActor & { dead?: boolean }) | undefined;
  const L = legLens(b); LEN.T = L.T; LEN.S = L.S;
  const cool = !!self0 && BLIND_IDS.has(self0.def.id);
  const falling = a?.name === 'fall' || !!self0?.dead;
  let P = cool ? coolIdle(t) : idle(t, a || falling || (m && (m.run > 0.05 || inAir)) ? 0 : 1);
  const y0 = off.y;
  if (!falling && m && m.run > 0.01 && !inAir && (!a || a.name === 'hurt')) P = run(P, m.run, m.phase, off);
  const bounce = off.y - y0;   // (the old walk's bob: the distance walk below carries her on the planted leg instead)
  // 11-18 3C: leaning into turns, the first push of a run, a skid when she reverses at speed, a braking step when she stops, and the
  // guard held low for a while after a fight (knees bent, leaning in) before she straightens into the idle
  if (!falling && m && !inAir && !a) {
    if (m.ready > 0 && m.run < 0.3) P = mix(P, READY, m.ready * (1 - m.run / 0.3));
    if (m.run > 0.05) { P.sz += m.bank * m.run; P.hz += 0.5 * m.bank * m.run; P.sx += 0.22 * m.start; }
    if (m.brake > 0) P = mix(P, BRAKE, curve(1 - m.brake, [[0, 0.15], [0.4, 1], [1, 0]]));
    if (m.skid > 0) P = mix(P, SKID, curve(1 - m.skid, [[0, 0.5], [0.15, 1], [1, 0]]));
  }
  if (!falling && m && m.squat > 0 && !inAir && !a) P = mix(P, J_SQUAT, curve(m.squat, [[0, 0.25], [0.55, 1], [1, 1]]));
  if (!falling && m && m.coil > 0 && !inAir && !a && m.charge <= 0) P = mix(P, COIL, m.coil * (2 - m.coil));
  if (!falling && m && inAir && (!a || a.name === 'hurt' || a.name === 'dashA')) P = air(P, m.rise, m.airT, m.lean);
  if (!falling && m && m.land > 0 && !a) P = land(P, m.land, m.landW);
  if (!falling && m && m.flip > 0 && !a) P = flip(P, m.flip);
  if (!falling && m && m.charge > 0 && !a) P = charge(P, m.charge, t, m.creep, m.phase);
  let fallRes: { lieW: number; settle: number } | null = null;
  if (falling) {
    const fk = a?.name === 'fall' ? a.k : 1;
    const fromA = (a?.name === 'fall' ? (a.data.fromAngle as number | undefined) : undefined) ?? 0;
    const res = heroFall(P, fk, fromA, off);
    P = res.P;
    fallRes = { lieW: res.lieW, settle: res.settle };
  } else if (a) {
    const k = poseK(a);
    if (a.name === 'k1') P = cut1(P, k);
    else if (a.name === 'k2') P = cut2(P, k);
    else if (a.name === 'k3') P = spinCut(P, k);
    else if (a.name === 'k4') P = thrust(P, k, off);
    else if (a.name === 'k5') {
      if (cool) P = heavyLeapCut(P, k, off);
      else {
        P = leapCut(P, k, 0, off); off.z = 0;
        const w = curve(k, [[0, 0], [0.1, 1], [0.86, 1], [1, 0]]); P.sx += 0.24 * w; P.nx -= 0.2 * w; P.kL += 0.2 * w; P.kR += 0.15 * w;
      }
    }
    else if (a.name === 'rel') P = release(P, k, off);
    else if (a.name === 'kick') P = kickPose(P, k, off);
    else if (a.name === 'noto') P = noto(P, k);
    else if (a.name === 'dashA') P = dash(P, inAir ? k * 0.6 : k);
    else if (a.name === 'cast') P = cast(P, k);
    else if (a.name === 'plunge') P = plunge(P, k);
    else if (a.name === 'plungeL') P = plungeLand(P, k);
    else if (a.name === 'acut') P = airCombo(P, k);
    else if (a.name === 'acutF') P = airDrive(P, k, a.data.hang as number);
    else if (a.name === 'swoop') P = swoopPose(P, k, off);
    else if (a.name === 'reel') P = reelPose(P, k, !!a.data.self, off);
    else if (a.name === 'stomp') P = stompPose(P, k, off);
    else if (a.name === 'hurt') {
      const fromA = (a.data.fromAngle as number | undefined) ?? 0;
      P = cool ? heroHurt(P, k, a.data.power as number, fromA, off) : hurt(P, k, a.data.power as number, off);
    }
  }
  if (m) off.y += m.air;
  if (!falling && m && m.dart > 0) P = dartThrow(P, m.dart, m.dartBack > 0);
  // Unified gaze stabilization (Counter-Rotation): keep eyes locked forward on opponent/direction when torso twists,
  // skipping sheathed bow (charge/noto), spinCut (has its own martial-arts spotting), back-dart glance, hurt, fall and flip
  if (cool && !falling && !(m && (m.charge > 0 || m.flip > 0 || (m.dart > 0 && m.dartBack > 0))) && a?.name !== 'noto' && a?.name !== 'k3' && a?.name !== 'hurt') {
    const torsoYaw = P.hy + P.sy;
    const autoNy = clamp(-torsoYaw * 0.74 * MOTION_TUNE.gazeLock, -0.76, 0.76);
    const wGaze = a ? 0.55 : (m && m.run > 0.05 ? 0.65 : 0.35);
    P.ny = P.ny + (autoNy - P.ny) * wGaze;
  }
  // Safety guarantee: left elbow NEVER locks straight on blind swordsmen (CLAUDE.md historical rule)
  if (cool && P.fL > -0.22) P.fL = -0.22;
  apply(b, P); fixHips(b, P);
  // Smoothly ground hips during kneel -> side-lying collapse so shoulder, hip & legs rest cleanly ON top of y=0 (zero clipping!)
  if (fallRes && b.hips) {
    const kneelY = b.hips.position.y;
    const lieY = 0.21 + fallRes.settle;
    b.hips.position.y = kneelY + (lieY - kneelY) * fallRes.lieW;
  }
  // Keep right fist anatomically aligned with forearm (no violent 90–160 deg wrist break) while preserving exact blade direction
  if (cool) limitRightWrist(b);
  else if (b.weapon) b.weapon.quaternion.identity();
  // Relaxed exhale shoulder drop in calm idle (strictly downward <= 0, NEVER shrugging up)
  if (cool && !falling && !a && !(m && (m.run > 0.05 || inAir || m.charge > 0))) {
    const drop = -0.008 * breathWave(t, 3.2).exDrop * MOTION_TUNE.idleBreath;
    if (b.shL) b.shL.position.y += drop;
    if (b.shR) b.shR.position.y += drop;
  }
  // 11-18 + sprint heel-to-toe ankle roll: feet stay right-angled to shin in flight, roll heel→flat→toe-off while running,
  // strictly clamped by tiltRoom so boots never clip below the floor
  if (!falling && m && m.run > 0.01 && !inAir && (!a || a.name === 'hurt')) {
    const w = Math.min(1, m.run / 0.25) * (1 - Math.min(1, Math.max(m.squat, m.land, m.brake, m.skid, m.charge > 0 ? 1 : 0)));
    const sp = smooth(0.55, 0.95, m.run);
    const dL = legDrop(P.tL, P.kL, P.pL), dR = legDrop(P.tR, P.kR, P.pR), mid = (dL + dR) / 2;
    for (const [s, th, kn, d, phOff] of [['L', P.tL, P.kL, dL, 0], ['R', P.tR, P.kR, dR, Math.PI]] as const) {
      const f = b[`foot${s}`]; if (!f) continue;
      const level = -(th + kn);
      // Push-off plantarflexion (+0.26 as leg sweeps behind) and pre-strike heel dorsiflexion (-0.18 as leg reaches ahead)
      const pLeg = m.phase + phOff;
      const roll = sp * (0.26 * Math.max(0, -Math.sin(pLeg)) - 0.18 * Math.max(0, Math.sin(pLeg) * Math.cos(pLeg)));
      const tilt = clamp(level, -ANKLE, ANKLE) - level + roll;   // + = toes down (world pitch)
      const lift = Math.max(0, off.y + d - mid - 0.015);         // ankle clearance above ground (m)
      f.rotation.x += clamp(tilt, -tiltRoom(HEEL, lift), tiltRoom(TOE, lift)) * w;
    }
  }
  // Safe shin-local ankle articulation (NEVER breaks ankle by adding onto apply()'s -(t+k) ground-level angle!):
  // - Flying kick (kick): right sole faces squarely FORWARD at target (footR.x -> -0.06, NOT bent down 120 deg!), rear foot tucked cleanly
  // - Airborne leaps/cuts (normal jump, k5, plunge, acut/acutF, swoop dive, reel zip): smooth ballet/wuxia toe-point in shin-local frame
  if (cool && !falling) {
    const lerpFoot = (f: Bone | undefined, targetX: number, w: number) => {
      if (f && w > 0.01) f.rotation.x += (targetX - f.rotation.x) * w;
    };
    if (a && a.name === 'kick') {
      const kickW = curve(poseK(a), [[0, 0.3], [0.12, 1], [0.68, 1], [0.92, 0]]);
      lerpFoot(b.footR, -0.06, kickW); // sole squarely forward toward enemy chest (zero broken ankle!)
      lerpFoot(b.footL, 0.38, kickW);  // tucked trailing foot cleanly pointed
    } else if (a && (a.name === 'k5' || a.name === 'plunge' || a.name === 'acutF' || a.name === 'acut')) {
      const k = poseK(a);
      const airW = a.name === 'k5'
        ? curve(k, [[0.14, 0], [0.24, 1], [0.44, 1], [0.49, 0]])
        : a.name === 'acut'
          ? 0.85
          : curve(k, [[0, 0.3], [0.15, 1], [0.82, 1], [1, 0.2]]);
      lerpFoot(b.footL, 0.36, airW);
      lerpFoot(b.footR, 0.48, airW);
    } else if (a && a.name === 'swoop') {
      const diveW = curve(poseK(a), [[0, 0.7], [0.10, 1], [0.30, 1], [0.40, 0]]);
      lerpFoot(b.footL, 0.36, diveW);
      lerpFoot(b.footR, 0.48, diveW);
    } else if (a && a.name === 'reel' && a.data.self) {
      const zipW = curve(poseK(a), [[0, 0.3], [0.16, 1], [0.76, 1], [1, 0]]);
      lerpFoot(b.footL, 0.34, zipW);
      lerpFoot(b.footR, 0.46, zipW);
    } else if (inAir && !a && m && m.flip <= 0) {
      const reach = smooth(0.12, 0.58, -m.rise);
      const airW = (1 - reach * 0.85) * clamp(m.air / 0.12, 0, 1);
      lerpFoot(b.footL, 0.32, airW);
      lerpFoot(b.footR, 0.46, airW);
    }
  }
  // 11-19 (用户：「开场雪地剧情走路像在走滑步」): below a run the legs step by the ground she covers, the planted foot fixed (heroWalk.ts)
  if (!falling && m && self0) {
    const allow = !a && !inAir ? 1 - Math.min(1, Math.max(m.squat, m.land, m.brake, m.skid, m.flip, m.creep, m.charge > 0 ? 1 : 0)) : 0;
    const g = stepWalk(self0, b, self0.home, self0.yaw, t, m.run, allow, m.treadmill ?? 0);
    if (g.w > 0) { off.y -= bounce * g.w; m.phase = g.ph * TAU + Math.PI / 2; }   // (the hip sway and the arms of the old pose keep in step)
  }
  // act-21 (user: 「人物为啥手掌是这样的，往下吊着的」): apply() aims the left hand in world space (the ninja's kunai) — for an empty
  // hand that left it pointing down off a folded forearm like a limp wrist. The blind swordsmen's left hand follows its forearm,
  // curled a little (eL now only tips it a touch further for palm strikes)
  if (cool && b.handL) b.handL.quaternion.setFromEuler(HAND_L.set(-0.18 - 0.25 * Math.max(0, P.eL), 0, 0));
  const self2 = self0;
  if (cool && !falling && !a && !(m && (m.run > 0.05 || inAir || m.charge > 0))) listen(b, t);   // (act-24: not in the 藏锋 stance — the head stays bowed to the blade)
  tails(b, t, P.lift, P.flut, 0.55, self0);
  if (self2) trails(self2, a, m);
};

/** the action prototype's heroes: the 京都篇 ninja's body, and the four blind swordsmen (same joints, same poses) */
export const ACT_NINJA: ModelDef = { ...ninja.def, id: 'act_ninja', name: '影忍', tip: 13 };
if (!ROSTER.some(d => d.id === ACT_NINJA.id)) ROSTER.push(ACT_NINJA);
export const HEROES: ModelDef[] = [...SLIM, ...BLIND, ACT_NINJA];
/** the costumes on the yard's rack (the new slim ones, and the first 斗笠 to compare the build) */
export const RACK: ModelDef[] = [...SLIM, BLIND[0]];
for (const d of HEROES) POSE_HOOKS[d.id] = heroHook;
