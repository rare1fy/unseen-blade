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
import { trailSeg } from '../fx/fx';
import { dustBlocks } from '../kyoto/ninja_fx';
import { ninja } from '../kyoto/ninja';
import { ROSTER, type ModelDef } from '../bestiary/models';
import { idle, mix, apply, hurt, attack as leapCut, cast, type Pose } from '../kyoto/ninja_pose';
import { BLIND } from './blind';
import { SLIM } from './blind2';

type Keys = Array<[number, number]>;
const TAU = Math.PI * 2;
const hump = (k: number, a: number, b: number) => (k <= a || k >= b ? 0 : Math.sin(((k - a) / (b - a)) * Math.PI));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** per-actor locomotion the controller writes every frame: run = 0..1 of top speed, phase = stride phase (rad), charge = 0..1,
 *  air = height off the ground (m), rise = vertical speed / take-off speed (1 at take-off, 0 at the top, < 0 falling),
 *  land = the landing squat (1 → 0), flip = the double jump's somersault (0..1 while it turns, else 0),
 *  creep = 0..1 moving while in the stance (the feet shuffle), dart = 0..1 through a dart throw (the left arm only, over anything) */
export interface Motion { run: number; phase: number; charge: number; air: number; rise: number; land: number; flip: number; creep: number; dart: number; dartBack: number }
export const MOTION = new WeakMap<object, Motion>();
export const motionOf = (a: object) => { let m = MOTION.get(a); if (!m) { m = { run: 0, phase: 0, charge: 0, air: 0, rise: 0, land: 0, flip: 0, creep: 0, dart: 0, dartBack: 0 }; MOTION.set(a, m); } return m; };

/** walk → run: the walk is the old light stride; past ~60% of top speed it blends into a forward-leaning sprint */
function run(I: Pose, r: number, ph: number, off: THREE.Vector3): Pose {
  const sL = Math.sin(ph), sR = -sL, sp = smooth(0.55, 0.95, r);
  // walk
  const W: Partial<Pose> = {
    tL: -0.8 * sL, kL: 0.3 + 1.05 * Math.max(0, -sL), pL: 0.04, tR: -0.8 * sR, kR: 0.3 + 1.05 * Math.max(0, -sR), pR: -0.04,
    hx: 0, hy: 0.05 * sL, hz: 0, sx: 0.3, sy: -0.04 * sL, sz: 0, cx: 0.04, nx: -0.24, ny: 0,
    aRx: 0.45, aRz: -0.28, fR: -0.35, eR: -0.4, yR: 0.1,
    aLx: -0.2 + 0.3 * sL, aLz: 0.22, fL: -1.4, eL: -0.3, yL: 0.2,
    lift: 1.1, flut: 0.95,
  };
  // sprint: the thigh swings ±1.15, the trailing leg folds high as it comes through (phase-shifted fold), a flight bounce,
  // a forward lean with the head held level; the upper body stays square (hips and spine barely turn with the stride), the left
  // forearm held across the body with a short swing, the blade trailing low behind on the right
  const fold = (s: number, c: number) => 0.25 + 1.55 * Math.max(0, -(s * 0.55 - c * 0.85));
  const cL = Math.cos(ph), cR = -cL;
  const Sp: Partial<Pose> = {
    tL: -1.15 * sL, kL: fold(sL, cL), pL: 0.05, tR: -1.15 * sR, kR: fold(sR, cR), pR: -0.05,
    hx: 0.1, hy: 0.06 * sL, hz: 0, sx: 0.46, sy: -0.06 * sL, sz: 0, cx: 0.06, nx: -0.48, ny: 0,
    aRx: 0.95, aRz: -0.3, fR: -0.25, eR: -0.08, yR: -2.55,
    aLx: -0.45 + 0.3 * sL, aLz: 0.2, fL: -1.55, eL: -0.2, yL: 0.2,
    lift: 1.35, flut: 1,
  };
  off.y += (0.05 * Math.abs(Math.cos(ph)) * (1 - sp) + 0.11 * Math.abs(sL) * sp) * r;
  const P = mix(mix(I, W, r), Sp, sp);
  // apply() sinks the hips by the average of both legs' bend (right for a stance with both feet down); in a run only the
  // straighter leg carries the body, so lift the hips back to that leg's height
  const dL = legDrop(P.tL, P.kL, P.pL), dR = legDrop(P.tR, P.kR, P.pR);
  off.y += ((dL + dR) / 2 - Math.min(dL, dR)) * sp;
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
/** the blind swordsmen's idle: standing tall, the blade's point angled at the ground ahead, the left hand resting at the waist (elbow
 *  out, forearm across the belly — act-06 用户：左手「少了些小臂的弯折，手就老是一直直着」). It reads as waiting by a deep breath
 *  (chest and shoulders rise and fall), the weight rolling slowly from foot to foot and the point drawing small circles. (The blade
 *  flourish of act-06 is gone: 「idle不要做那个转刀，看起来像个bug」) */
function coolIdle(t: number): Pose {
  const br = Math.sin(t * TAU / 3.0), sway = Math.sin(t * TAU / 5.2), circ = t * 1.6;
  return {
    px: sway * 0.05, pz: 0, hx: 0, hy: -0.22 + 0.06 * sway, hz: -sway * 0.05,
    sx: 0.06 + 0.04 * br, sy: 0.1 + 0.05 * sway, sz: sway * 0.04, cx: 0.06 * br, nx: -0.05 - 0.05 * br, ny: 0.12 - 0.08 * sway,
    aRx: -0.32 - 0.06 * br, aRz: -0.3 - 0.06 * br, fR: -0.5 + 0.06 * Math.sin(circ),
    aLx: -0.12 + 0.05 * br, aLz: 0.38 + 0.06 * br, fL: -1.45 - 0.08 * br,
    tL: -0.25 + 0.08 * sway, kL: 0.32 + 0.12 * Math.max(0, sway), pL: 0.1, tR: 0.2 - 0.06 * sway, kR: 0.18 + 0.12 * Math.max(0, -sway), pR: -0.12,
    eR: -0.75 + 0.1 * Math.sin(circ), yR: -0.35 + 0.12 * Math.cos(circ), eL: -0.25, yL: 0.3,
    lift: 0.3 + 0.12 * Math.sin(t * 0.9), flut: 0.38,
  };
}
const S = (k: number, keys: Keys) => snap(k, keys);
/** 1st cut: right to left, flat (impact k ≈ 0.42) */
function cut1(I: Pose, k: number): Pose {
  const A: Partial<Pose> = {
    aRx: S(k, [[0, -0.5], [0.3, -1.25], [0.5, -1.35], [0.75, -1.2], [1, -0.5]]),
    aRz: S(k, [[0, -0.45], [0.3, -1.15], [0.5, 0.55], [0.75, 0.45], [1, -0.45]]),
    fR: S(k, [[0, -1.25], [0.3, -0.5], [0.5, -0.15], [0.75, -0.2], [1, -1.25]]),
    eR: S(k, [[0, 0.6], [0.3, 0.25], [0.5, 0.05], [0.75, 0.1], [1, 0.6]]),
    yR: S(k, [[0, -0.15], [0.3, -1.5], [0.5, 1.2], [0.75, 1.0], [1, -0.15]]),
    sy: S(k, [[0, 0.12], [0.3, -0.45], [0.5, 0.45], [0.75, 0.35], [1, 0.12]]),
    sx: S(k, [[0, 0.22], [0.3, 0.3], [0.5, 0.42], [1, 0.22]]),
    hy: S(k, [[0, -0.32], [0.3, -0.45], [0.5, 0.0], [1, -0.32]]),
    tL: S(k, [[0, -0.55], [0.3, -0.7], [0.5, -1.0], [0.75, -0.95], [1, -0.55]]), kL: S(k, [[0, 0.75], [0.5, 1.05], [1, 0.75]]),
    tR: S(k, [[0, 0.3], [0.5, 0.6], [1, 0.3]]), kR: S(k, [[0, 0.4], [0.5, 0.3], [1, 0.4]]),
    aLx: S(k, [[0, -0.15], [0.3, -1.15], [0.5, 0.35], [0.75, 0.3], [1, -0.15]]), aLz: S(k, [[0, 0.35], [0.3, 0.05], [0.5, 0.55], [0.75, 0.5], [1, 0.35]]),
    fL: S(k, [[0, -1.45], [0.3, -1.95], [0.5, -1.35], [0.75, -1.3], [1, -1.45]]), eL: S(k, [[0, -0.25], [0.3, 1.2], [0.5, -0.1], [1, -0.25]]),
    lift: 0.3 + 0.7 * hump(k, 0.25, 0.9), flut: 0.3 + 0.7 * hump(k, 0.25, 0.9),
  };
  return mix(I, A, curve(k, [[0, 0], [0.06, 1], [0.86, 1], [1, 0]]));
}
/** 2nd cut: backhand left to right, rising, then the left hand strikes in (impact k ≈ 0.4, the left hand at 0.62) */
function cut2(I: Pose, k: number): Pose {
  const A: Partial<Pose> = {
    aRx: S(k, [[0, -0.5], [0.28, -1.3], [0.48, -1.4], [0.75, -1.25], [1, -0.5]]),
    aRz: S(k, [[0, -0.45], [0.28, 0.55], [0.48, -1.0], [0.75, -0.9], [1, -0.45]]),
    fR: S(k, [[0, -1.25], [0.28, -0.9], [0.48, -0.2], [1, -1.25]]),
    eR: S(k, [[0, 0.6], [0.28, 0.35], [0.48, -0.05], [0.75, 0.0], [1, 0.6]]),
    yR: S(k, [[0, -0.15], [0.28, 1.3], [0.48, -1.35], [0.75, -1.2], [1, -0.15]]),
    sy: S(k, [[0, 0.12], [0.28, 0.5], [0.48, -0.5], [0.75, -0.4], [1, 0.12]]),
    hy: S(k, [[0, -0.32], [0.28, 0.1], [0.48, -0.6], [1, -0.32]]),
    aLx: S(k, [[0, -0.15], [0.28, -0.7], [0.5, -1.15], [0.62, -1.45], [0.8, -1.35], [1, -0.15]]),
    aLz: S(k, [[0, 0.35], [0.28, 0.95], [0.5, 0.35], [0.62, 0.12], [1, 0.35]]),
    fL: S(k, [[0, -1.45], [0.28, -1.5], [0.5, -1.6], [0.62, -0.5], [0.8, -0.55], [1, -1.45]]),
    eL: S(k, [[0, -0.25], [0.28, 0.9], [0.62, 1.35], [0.8, 1.25], [1, -0.25]]),
    tL: S(k, [[0, -0.55], [0.48, -0.2], [1, -0.55]]), tR: S(k, [[0, 0.3], [0.48, -0.45], [1, 0.3]]), kR: S(k, [[0, 0.4], [0.48, 0.95], [1, 0.4]]),
    lift: 0.3 + 0.8 * hump(k, 0.2, 0.9), flut: 0.3 + 0.7 * hump(k, 0.2, 0.9),
  };
  return mix(I, A, curve(k, [[0, 0], [0.06, 1], [0.86, 1], [1, 0]]));
}
/** 3rd cut: the turning cut — a wind-up to the left, then the whole body spins once round with the blade held straight out, cutting
 *  everything round the hero (impact k ≈ 0.5). The hips carry the turn (legs pivot on the spot); after the turn the angle is
 *  back where it started, so it settles into the idle without unwinding */
function spinCut(I: Pose, k: number): Pose {
  const u = clamp01((k - 0.18) / 0.54), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
  const hy = k < 0.18 ? S(k, [[0, -0.32], [0.18, 0.6]]) : k < 0.72 ? 0.6 - (0.92 + TAU) * e : -0.32;
  const A: Partial<Pose> = {
    hy, sy: 0, sx: S(k, [[0, 0.22], [0.18, 0.35], [0.72, 0.3], [1, 0.22]]), nx: -0.3,
    aRx: S(k, [[0, -0.5], [0.18, -0.9], [0.28, -0.35], [0.72, -0.35], [1, -0.5]]), aRz: S(k, [[0, -0.45], [0.18, 0.4], [0.28, -1.35], [0.72, -1.3], [1, -0.45]]),
    fR: S(k, [[0, -1.25], [0.18, -1.3], [0.28, -0.1], [0.72, -0.15], [1, -1.25]]), eR: S(k, [[0, 0.6], [0.18, 0.2], [0.28, 0.05], [0.72, 0.05], [1, 0.6]]),
    yR: S(k, [[0, -0.15], [0.18, 1.2], [0.28, -1.35], [0.72, -1.3], [1, -0.15]]),
    aLx: S(k, [[0, -0.15], [0.18, -0.95], [0.28, -0.55], [0.72, -0.55], [1, -0.15]]), aLz: S(k, [[0, 0.35], [0.18, 0.15], [0.28, 0.9], [0.72, 0.85], [1, 0.35]]),
    fL: S(k, [[0, -1.45], [0.18, -1.9], [0.28, -1.3], [0.72, -1.3], [1, -1.45]]), eL: S(k, [[0, -0.25], [0.28, 1.0], [0.72, 1.0], [1, -0.25]]),
    tL: -0.55, kL: 0.95, pL: 0.25, tR: 0.45, kR: 0.85, pR: -0.25,
    lift: 0.4 + 0.9 * hump(k, 0.2, 0.9), flut: 0.4 + 0.6 * hump(k, 0.2, 0.9),
  };
  return mix(I, A, curve(k, [[0, 0], [0.06, 1], [0.88, 1], [1, 0]]));
}
/** 4th cut: two big thrusts (11-16 用户：「刺击的动作完全没表现出来，看起来就是刀剑抖了两下」). Read from the top-down camera by
 *  the whole body: the blade drawn back to the hip with the right shoulder turned away and the knees down, then a lunge — left foot
 *  out, right leg straight, the arm straight out and the point straight ahead, the left arm thrown back; half back, then a longer
 *  second lunge held a beat (impacts k ≈ 0.3 and 0.56). The streak of light ahead of the point is drawn by the world (show.ts) */
function thrust(I: Pose, k: number, off: THREE.Vector3): Pose {
  // e: −0.35 = drawn back at the hip, 0 = ready, 1 = arm straight out
  const e = S(k, [[0, 0], [0.2, -0.35], [0.24, -0.35], [0.3, 1], [0.4, 1], [0.47, 0.25], [0.5, 0.25], [0.56, 1.1], [0.74, 1.1], [0.9, 0.3], [1, 0]]);
  const u = clamp01((e + 0.35) / 1.35), lunge = clamp01(e);
  off.z += S(k, [[0, 0], [0.22, -0.16], [0.3, 0.32], [0.45, 0.2], [0.56, 0.5], [0.74, 0.5], [0.9, 0.2], [1, 0]]);
  const A: Partial<Pose> = {
    hy: -0.4 + 0.7 * u, sy: -0.5 + 0.85 * u, sx: 0.18 + 0.34 * lunge, nx: -0.15 - 0.3 * lunge, ny: 0.35 - 0.6 * u,
    aRx: 0.35 - 1.85 * u, aRz: -0.2 + 0.2 * u, fR: -1.7 + 1.65 * u, eR: -0.04, yR: 0,
    aLx: -0.95 - 1.5 * lunge, aLz: 0.2 + 0.4 * lunge, fL: -1.75 + 0.65 * lunge, eL: 1.2, yL: 0.4,
    tL: -0.5 - 0.7 * lunge, kL: 1.0 + 0.15 * lunge, pL: 0.1, tR: 0.45 + 0.35 * lunge, kR: 0.9 - 0.85 * lunge, pR: -0.1,
    lift: 0.4 + 0.9 * lunge, flut: 0.4 + 0.6 * lunge,
  };
  return mix(I, A, curve(k, [[0, 0], [0.08, 1], [0.9, 1], [1, 0]]));
}
/** held attack: down low, the blade swung back and down, the left hand up at the chest; shivers as the charge fills */
/** 藏锋 (act-19, user: 「见切的动作也不是做的收刀动作预备，需要改成收刀拔刀的动作」): holding the cut button first sheathes the
 *  blade (the 归鞘 cross-over to the left hip, quick), then the body sinks into the draw stance — left hand on the scabbard mouth,
 *  right hand on the hilt, chest turned a little toward the scabbard, weight forward; releasing draws from the sheath (release()) */
const SHEATHED: Partial<Pose> = { aRx: 0.3, aRz: 0.7, fR: -1.75, eR: 0.08, yR: 2.85, aLx: 0.25, aLz: 0.12, fL: -1.45, eL: 0.2, sy: 0.22, nx: 0.12 };
function charge(I: Pose, c: number, t: number, creep = 0, ph = 0): Pose {
  const sh = c > 0.98 ? Math.sin(t * 90) * 0.012 : 0;
  // the sheathing: the first ~0.3 s of the stance plays the 归鞘 cross-over (k 0.3 → 1, the click at 0.64)
  const sk = Math.min(1, c / 0.42), arms = sk < 1 ? noto(I, 0.3 + 0.7 * sk) : mix(I, SHEATHED, 1);
  const P = mix(arms, { tL: -0.95, kL: 1.45, tR: 0.5, kR: 1.2, hy: -0.55, sx: 0.5, px: sh, lift: 0.55 + 0.6 * c, flut: 0.5 + 0.5 * c }, Math.min(1, 0.4 + c));
  // moving in the stance: low sliding steps (碎步) — the feet take turns lifting a little and reaching, the crouch and the blade stay put
  if (creep > 0.02) { const s = Math.sin(ph * 1.5);
    P.tL += -0.2 * s * creep; P.kL += 0.35 * Math.max(0, s) * creep; P.tR += -0.2 * s * creep; P.kR += 0.35 * Math.max(0, -s) * creep; }
  return P;
}
/** 收刀 after 见切 (k 0 → 1): 血振 — the blade flicked out and down to the right; then across to the scabbard mouth at the left hip,
 *  the blade level and pointing back along the scabbard, pushed in (click at k ≈ 0.64); the hand rests on the hilt, the head
 *  bowed a touch; the left hand holds the scabbard mouth from the start of the cross-over */
function noto(I: Pose, k: number): Pose {
  const A: Partial<Pose> = {
    aRx: S(k, [[0, -0.5], [0.12, 0.05], [0.26, 0.15], [0.45, 0.25], [0.64, 0.3], [1, 0.3]]),
    aRz: S(k, [[0, 0.2], [0.12, -1.15], [0.26, -1.0], [0.45, 0.55], [0.64, 0.7], [1, 0.7]]),
    fR: S(k, [[0, -0.4], [0.12, -0.15], [0.26, -0.25], [0.45, -1.35], [0.64, -1.75], [1, -1.75]]),
    eR: S(k, [[0, 0.1], [0.12, -0.85], [0.26, -0.7], [0.45, 0.02], [0.64, 0.08], [1, 0.08]]),
    yR: S(k, [[0, 0.6], [0.12, -0.9], [0.26, -1.0], [0.45, 2.55], [0.64, 2.85], [1, 2.85]]),
    aLx: S(k, [[0, -0.5], [0.3, -0.2], [0.45, 0.25], [1, 0.25]]), aLz: S(k, [[0, 0.4], [0.45, 0.12], [1, 0.12]]), fL: S(k, [[0, -1.3], [0.45, -1.45], [1, -1.45]]),
    sy: S(k, [[0, 0], [0.12, -0.2], [0.45, 0.2], [1, 0.15]]), sx: S(k, [[0, 0.2], [0.45, 0.25], [0.7, 0.32], [1, 0.3]]), nx: S(k, [[0, 0], [0.64, 0.1], [1, 0.2]]),
    tL: -0.3, kL: 0.35, tR: 0.2, kR: 0.3, lift: 0.6, flut: 0.5,
  };
  return mix(I, A, curve(k, [[0, 0.6], [0.06, 1], [0.9, 1], [1, 0.85]]));
}
/** a dart thrown with the left hand (k 0 → 1): the hand cocks back by the right shoulder, whips out forward (the elbow never locks
 *  straight — 单刀看手), then settles; only the left arm and a little twist of the chest, so it runs over the run / jump / anything */
function dartThrow(I: Pose, k: number, back = false): Pose {
  const P = { ...I }, w = curve(k, [[0, 0], [0.12, 1], [0.7, 1], [1, 0]]);
  // 回身镖: the arm flung back past the hip instead of forward, the chest turned with it
  const T = back ? { aLx: S(k, [[0, -0.7], [0.3, -0.9], [0.5, 1.15], [1, 0.7]]), aLz: S(k, [[0, 0.2], [0.5, 0.35], [1, 0.3]]),
    fL: S(k, [[0, -1.6], [0.3, -1.8], [0.5, -0.4], [1, -0.6]]), sy: S(k, [[0, -0.15], [0.3, -0.2], [0.5, 0.4], [1, 0.2]]) } : { aLx: S(k, [[0, -0.9], [0.35, -1.0], [0.5, -1.55], [1, -1.3]]), aLz: S(k, [[0, -0.35], [0.35, -0.45], [0.5, 0.25], [1, 0.3]]),
    fL: S(k, [[0, -1.95], [0.35, -2.0], [0.5, -0.45], [1, -0.7]]), sy: S(k, [[0, 0.22], [0.35, 0.28], [0.5, -0.2], [1, -0.05]]) };
  P.aLx += (T.aLx - P.aLx) * w; P.aLz += (T.aLz - P.aLz) * w; P.fL += (T.fL - P.fL) * w; P.sy += T.sy * w;
  return P;
}
/** the double jump: a tight forward somersault (k 0 → 1) — knees to the chest, arms in, the blade held flat along the back; the whole
 *  body turns once round the hips */
function flip(I: Pose, k: number): Pose {
  const P = mix(I, { tL: -1.75, kL: 2.1, tR: -1.6, kR: 2.0, pL: 0.08, pR: -0.08, sx: 0.55, nx: -0.2, aRx: 0.9, aRz: -0.45, fR: -0.9, eR: 0.1, yR: -2.6,
    aLx: 0.7, aLz: 0.4, fL: -1.6, eL: 0.3, yL: 0.3, lift: 1.4, flut: 1 }, curve(k, [[0, 0], [0.12, 1], [0.78, 1], [1, 0]]));
  P.hx += Math.PI * 2 * curve(k, [[0, 0], [0.1, 0.06], [0.7, 0.94], [1, 1]]);
  return P;
}
/** the charge let go: a lunging cut across (impact k ≈ 0.3) */
/** the draw (拔刀, act-19): from the sheath at the left hip the hand pulls the hilt forward across the belly while the left hand draws
 *  the scabbard back, the blade leaves the mouth and sweeps level across to the right (the cut lands at k ≈ 0.3), follows through, and
 *  comes back to guard */
function release(I: Pose, k: number): Pose {
  const A: Partial<Pose> = {
    aRx: S(k, [[0, 0.3], [0.12, -0.7], [0.3, -1.45], [0.6, -1.3], [1, -0.5]]), aRz: S(k, [[0, 0.7], [0.12, 0.75], [0.3, -0.05], [0.6, -0.85], [1, -0.45]]),
    fR: S(k, [[0, -1.75], [0.12, -1.1], [0.3, -0.12], [0.6, -0.2], [1, -1.25]]), eR: S(k, [[0, 0.08], [0.12, 0.05], [0.3, 0.05], [0.6, 0.2], [1, 0.6]]),
    yR: S(k, [[0, 2.85], [0.12, 2.3], [0.3, 1.4], [0.6, 0.85], [1, -0.15]]),
    sy: S(k, [[0, 0.22], [0.12, 0.3], [0.3, -0.35], [0.6, -0.5], [1, 0.12]]), hy: S(k, [[0, -0.55], [0.3, 0.25], [1, -0.32]]), sx: S(k, [[0, 0.5], [0.3, 0.55], [1, 0.22]]),
    tL: S(k, [[0, -0.95], [0.3, -1.25], [0.75, -1.1], [1, -0.55]]), kL: S(k, [[0, 1.45], [0.3, 0.55], [1, 0.75]]), tR: S(k, [[0, 0.5], [0.3, 0.95], [1, 0.3]]), kR: S(k, [[0, 1.2], [0.3, 0.2], [1, 0.4]]),
    aLx: S(k, [[0, 0.25], [0.12, 0.55], [0.3, 0.6], [0.7, 0.2], [1, -0.15]]), aLz: S(k, [[0, 0.12], [0.3, 0.2], [0.7, 0.3], [1, 0.35]]), fL: S(k, [[0, -1.45], [0.3, -1.2], [0.7, -1.2], [1, -1.45]]),
    eL: S(k, [[0, 0.2], [0.3, 0.3], [1, -0.25]]),
    lift: 1.3, flut: 1,
  };
  return mix(I, A, curve(k, [[0, 1], [0.85, 1], [1, 0]]));
}
function dash(I: Pose, k: number): Pose {
  return mix(I, { sx: 0.68, hy: 0, sy: 0, aRx: 0.75, aRz: -0.3, fR: -0.2, eR: -0.6, yR: 0, aLx: 0.55, aLz: 0.3, fL: -1.15, eL: -0.4, yL: 0,
    tL: -0.95, kL: 0.6, tR: 0.85, kR: 0.95, nx: -0.4, lift: 1.4, flut: 1 }, curve(k, [[0, 0], [0.12, 1], [0.8, 1], [1, 0]]));
}
/** in the air: tucked on the way up (knees high, blade trailing back, left arm out for balance), legs reaching down on the way down */
function air(I: Pose, rise: number): Pose {
  const FALL: Partial<Pose> = { tL: -0.55, kL: 0.65, pL: 0.1, tR: -0.05, kR: 0.85, pR: -0.1, sx: 0.12, sy: 0, hy: -0.1, nx: -0.15,
    aRx: 0.2, aRz: -0.85, fR: -0.35, eR: 0.1, yR: -1.9, aLx: -0.45, aLz: 0.9, fL: -1.2, eL: 0.6, yL: 0.4, lift: 1.3, flut: 1 };
  const TUCK: Partial<Pose> = { tL: -1.3, kL: 1.75, tR: -0.6, kR: 1.6, sx: 0.28, nx: -0.3, aRx: 0.45, aRz: -0.7, fR: -0.5, eR: 0.25, yR: -2.2, aLx: -0.75, aLz: 0.7, fL: -1.5 };
  return mix(mix(I, FALL, 1), TUCK, clamp01(rise * 1.4 + 0.25));
}
/** the plunge in the air (k: 0 → hang at 0.55 → impact at 1): the blade goes up over the head, then the body drives down with it */
function plunge(I: Pose, k: number): Pose {
  const A: Partial<Pose> = {
    aRx: S(k, [[0, 0.2], [0.45, -2.75], [0.6, -2.75], [0.85, -0.9], [1, -0.75]]), aRz: S(k, [[0, -0.6], [0.45, -0.15], [0.85, 0.1], [1, 0.1]]),
    fR: S(k, [[0, -0.4], [0.45, -0.35], [0.85, -0.15], [1, -0.1]]), eR: S(k, [[0, 0.2], [0.45, 2.05], [0.6, 2.1], [0.85, -0.9], [1, -1.2]]), yR: S(k, [[0, -1.9], [0.45, -0.1], [1, 0]]),
    aLx: S(k, [[0, -0.45], [0.45, -1.3], [0.85, -0.4], [1, -0.3]]), aLz: S(k, [[0, 0.9], [0.45, 0.35], [0.85, 0.75], [1, 0.8]]), fL: S(k, [[0, -1.2], [0.45, -1.4], [1, -1.1]]),
    tL: S(k, [[0, -1.2], [0.45, -1.35], [0.85, -0.5], [1, -0.45]]), kL: S(k, [[0, 1.6], [0.45, 1.85], [0.85, 0.55], [1, 0.5]]),
    tR: S(k, [[0, -0.6], [0.45, -0.95], [0.85, 0.15], [1, 0.2]]), kR: S(k, [[0, 1.5], [0.45, 1.75], [0.85, 0.6], [1, 0.6]]),
    sx: S(k, [[0, 0.25], [0.45, -0.18], [0.6, -0.2], [0.85, 0.55], [1, 0.6]]), nx: S(k, [[0, -0.3], [0.45, 0.05], [0.85, -0.5], [1, -0.55]]),
    hy: 0, sy: 0, lift: 1.4, flut: 1,
  };
  return mix(I, A, curve(k, [[0, 0], [0.12, 1], [1, 1]]));
}
/** the plunge's landing: down on one knee, the blade's point in the ground in front, then up (k 0 → 1 over ~0.34 s) */
function plungeLand(I: Pose, k: number): Pose {
  const A: Partial<Pose> = { tL: -1.35, kL: 1.95, pL: 0.12, tR: 0.95, kR: 1.75, pR: -0.12, sx: 0.72, sy: 0, hy: 0, nx: -0.55,
    aRx: -0.75, aRz: 0.05, fR: -0.1, eR: -1.3, yR: 0, aLx: 0.25, aLz: 0.7, fL: -1.1, eL: 0.4, lift: 0.9, flut: 0.6 };
  return mix(I, A, curve(k, [[0, 1], [0.55, 1], [1, 0]]));
}
/** the landing squat after a plain jump */
function land(I: Pose, w: number): Pose {
  return mix(I, { tL: -0.95, kL: 1.5, tR: 0.45, kR: 1.25, sx: 0.5, nx: -0.5 }, w);
}

/** every cloth chain on the model: [joint names root → tip, phase]. Missing chains are skipped */
const CHAINS: Array<[string[], number]> = [
  [['scA1', 'scA2', 'scA3'], 0], [['scB1', 'scB2'], 1.9],          // 影忍 scarf tails
  [['bfA1', 'bfA2', 'bfA3'], 0.7], [['bfB1', 'bfB2', 'bfB3'], 2.6], // blindfold tails
  [['hrA1', 'hrA2', 'hrA3'], 1.3],                                   // loose hair / ponytail
  [['clA1', 'clA2'], 0.4],                                           // a long cloak
];
/** how much each kind of cloth lifts with speed: hair and heavy cloaks less than ribbons */
const LIFT: Record<string, number> = { hr: 0.55, cl: 0.4 };
/** how far the joints above this one have pitched / rolled (so a hanging chain can undo it and hang straight down) */
function above(B: Record<string, Bone>, b: Bone, ax: 'x' | 'z') { let s = 0; for (let p = b.parent, i = 0; p && p !== B.root && i < 12; p = p.parent, i++) s += p.rotation[ax]; return s; }
export function tails(b: Record<string, Bone>, t: number, lift: number, flut: number, hair = 0.55) {
  const w = t * TAU / (1.3 - 0.5 * flut);
  for (const [names, ph] of CHAINS) {
    if (!b[names[0]]) continue;
    const k = names[0].startsWith('hr') ? hair : LIFT[names[0].slice(0, 2)] ?? 1;
    const px = above(b, b[names[0]], 'x'), pz = above(b, b[names[0]], 'z');
    names.forEach((n, i) => {
      if (!b[n]) return;
      const wave = Math.sin(w - i * 1.25 + ph) * (0.05 + 0.13 * flut) * (1 + 0.5 * i) * k;
      const side = Math.sin(w * 0.63 - i * 0.9 + ph) * (0.04 + 0.07 * flut) * k;
      rot(b[n], i === 0 ? Math.max(-0.05, lift * k - px) + wave : 0.12 * lift * k + wave, 0, i === 0 ? -pz + side : side);
    });
  }
  // a cape on the cape joint: hangs, lifts back with speed, ripples a little
  if (b.cape && b.cape.children.length) rot(b.cape, Math.max(0, 0.55 * lift - above(b, b.cape, 'x') * 0.6) + Math.sin(w) * 0.04 * flut, 0, Math.sin(w * 0.7) * 0.03 * flut);
}

// ---- blade trails along each cut's swing, dust on the dash, the run and the landings
const mem = new WeakMap<object, { tip: THREE.Vector3 | null; tipL: THREE.Vector3 | null; k: number; name: string; ph: number; air: number }>();
const SWING: Record<string, Array<[number, number, number, number]>> = {
  k1: [[0.28, 0.54, 0xbcd0ff, 0.11]], k2: [[0.26, 0.52, 0xd8e4ff, 0.12]], k3: [[0.24, 0.74, 0xc8e0ff, 0.12]],
  k4: [[0.25, 0.31, 0xe8f0ff, 0.07], [0.51, 0.57, 0xe8f0ff, 0.08]], k5: [[0.42, 0.57, 0xff5a3a, 0.16]],
  rel: [[0.18, 0.46, 0xff7a4a, 0.17]], plunge: [[0.6, 1.01, 0xffe0a0, 0.16]],
};
function trails(self: BActor, a: Action | null, m: Motion | undefined) {
  let M = mem.get(self); if (!M) { M = { tip: null, tipL: null, k: 0, name: '', ph: 0, air: 0 }; mem.set(self, M); }
  const k = a ? a.k : 0, name = a?.name ?? '', fresh = name !== M.name || k < M.k, sw = SWING[name];
  const tipCells = self.def.tip ?? 13;
  const tip = self.bones.weapon.localToWorld(new THREE.Vector3(0, 0, tipCells * CELL)), tipL = self.bones.offhand.localToWorld(new THREE.Vector3(0, 0, 6 * CELL));
  const heavy = name === 'k5' || name === 'rel' || name === 'plunge';
  if (sw && !fresh && M.tip) for (const w of sw) if (k > w[0] && k < w[1]) trailSeg(M.tip, tip, w[2], w[3], { life: heavy ? 0.24 : name === 'k3' ? 0.2 : 0.16, bright: 1.9, spark: name === 'k5' ? 0.5 : 0.2 });
  if (name === 'k2' && !fresh && M.tipL && k > 0.56 && k < 0.66 && self.bones.offhand.children.length) trailSeg(M.tipL, tipL, 0xffd0b8, 0.07, { life: 0.12, bright: 1.6, spark: 0 });
  if (name === 'dashA' && (fresh ? -1 : M.k) < 0.05 && k >= 0.05 && (!m || m.air < 0.05)) dustBlocks(self.local(0, 0, -0.2), 7, self.fwd().multiplyScalar(-1));
  if (name === 'rel' && (fresh ? -1 : M.k) < 0.02 && k >= 0.02) dustBlocks(self.local(0, 0, -0.25), 9, self.fwd().multiplyScalar(-1));
  if (m) {
    // sprint footfalls: a small kick of dirt behind each step (the stride phase crossing a multiple of π)
    if (m.run > 0.85 && m.air < 0.02 && !a && Math.floor(m.phase / Math.PI) !== Math.floor(M.ph / Math.PI)) dustBlocks(self.local(0, 0, -0.15), 2, self.fwd().multiplyScalar(-0.6));
    M.ph = m.phase; M.air = m.air;
  }
  M.tip = tip; M.tipL = tipL; M.k = k; M.name = name;
}

/** the blind swordsmen tilt the head now and then, listening */
const BLIND_IDS = new Set([...BLIND, ...SLIM].map(d => d.id));
function listen(b: Record<string, Bone>, t: number) {
  const u = ((t % 7.3) + 7.3) % 7.3, k = u < 2.2 ? Math.sin((u / 2.2) * Math.PI) ** 2 : 0;
  if (b.head) { b.head.rotation.z += 0.22 * k; b.head.rotation.y += 0.25 * k; }
}

const heroHook = (b: Record<string, Bone>, t: number, a: Action | null, off: THREE.Vector3, self: unknown) => {
  const m = self ? MOTION.get(self as object) : undefined, inAir = !!m && m.air > 0.01, self0 = self as BActor | undefined;
  const L = legLens(b); LEN.T = L.T; LEN.S = L.S;
  const cool = !!self0 && BLIND_IDS.has(self0.def.id);
  let P = cool ? coolIdle(t) : idle(t, a || (m && (m.run > 0.05 || inAir)) ? 0 : 1);
  if (m && m.run > 0.01 && !inAir && (!a || a.name === 'hurt')) P = run(P, m.run, m.phase, off);
  if (m && inAir && (!a || a.name === 'hurt' || a.name === 'dashA')) P = air(P, m.rise);
  if (m && m.land > 0 && !a) P = land(P, m.land);
  if (m && m.flip > 0 && !a) P = flip(P, m.flip);
  if (m && m.charge > 0 && !a) P = charge(P, m.charge, t, m.creep, m.phase);
  if (a) {
    const k = a.k;
    if (a.name === 'k1') P = cut1(P, k);
    else if (a.name === 'k2') P = cut2(P, k);
    else if (a.name === 'k3') P = spinCut(P, k);
    else if (a.name === 'k4') P = thrust(P, k, off);
    else if (a.name === 'k5') {
      P = leapCut(P, k, 0, off); off.z = 0;
      if (cool) P = mix(P, { aLx: 0.85 * P.aRx - 0.1, aLz: 0.25, fL: -1.5, eL: 0.6, yL: 0.3 }, curve(k, [[0, 0], [0.1, 1], [0.86, 1], [1, 0]]));
    }
    else if (a.name === 'rel') P = release(P, k);
    else if (a.name === 'noto') P = noto(P, k);
    else if (a.name === 'dashA') P = dash(P, inAir ? k * 0.6 : k);
    else if (a.name === 'cast') P = cast(P, k);
    else if (a.name === 'plunge') P = plunge(P, k);
    else if (a.name === 'plungeL') P = plungeLand(P, k);
    else if (a.name === 'hurt') P = hurt(P, k, a.data.power as number, off);
  }
  if (m) off.y += m.air;
  if (m && m.dart > 0) P = dartThrow(P, m.dart, m.dartBack > 0);
  apply(b, P); fixHips(b, P);
  const self2 = self0;
  if (cool && !a && !(m && (m.run > 0.05 || inAir))) listen(b, t);
  tails(b, t, P.lift, P.flut);
  if (self2) trails(self2, a, m);
};

/** the action prototype's heroes: the 京都篇 ninja's body, and the four blind swordsmen (same joints, same poses) */
export const ACT_NINJA: ModelDef = { ...ninja.def, id: 'act_ninja', name: '影忍', tip: 13 };
if (!ROSTER.some(d => d.id === ACT_NINJA.id)) ROSTER.push(ACT_NINJA);
export const HEROES: ModelDef[] = [...SLIM, ...BLIND, ACT_NINJA];
/** the costumes on the yard's rack (the new slim ones, and the first 斗笠 to compare the build) */
export const RACK: ModelDef[] = [...SLIM, BLIND[0]];
for (const d of HEROES) POSE_HOOKS[d.id] = heroHook;
