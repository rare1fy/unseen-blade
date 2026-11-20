// 主角的操控：移动（慢走、推满奔跑）、五段连斩（横斩 → 反撩 → 回身旋斩 → 连刺两下 → 跃起重劈；按键缓冲、出刀后可以接冲刺或跳取消；
// 每一刀往前冲 TUNE.atkLunge 米乘各段倍数，前面有敌人就冲到离它 TUNE.lungeStop 米停下）、按住蓄力 → 松开突进斩、冲刺（无敌帧 + 残影）、
// 跳（空中能转向、能冲刺；空中按斩 = 下劈，落地一圈冲击）、影分身（烟遁，两道分身斩开身边的敌人）、挨打（硬直 + 无敌闪烁）、倒下。
// 出刀自动吸附：起手时朝摇杆方向 ±70° 内最近的敌人转身，没有就朝摇杆方向（手机上不用精确瞄准）。
// 跳的抛物线由「最高点」和「滞空时间」两个参数定（TUNE.jumpH / jumpT）：起跳速度 = 4H/T，重力 = 8H/T²。
import * as THREE from 'three';
import { V3 } from '../engine/world';
import { BattleActor } from '../bestiary/battle';
import { Action, rot, mov } from '../actors/rig';
import type { ModelDef } from '../bestiary/models';
import { fxAfterimage } from '../fx/skillFx';
import { fxSparks } from '../fx/fx';
import { dustBlocks } from '../kyoto/ninja_fx';
import { addBlock } from '../fx/blocks';
import { cue, type Cue } from '../../audio/cues';
import { ACT_NINJA, motionOf, type WarpKey } from './ninjaAct';
import { TUNE } from './tune';
import type { Input } from './input';
import { trimShadows, lowAttack, type Foe } from './enemy';
import { newPerks, v, v2, hasBoon, type Perks } from './boons';

/** 11-18 秘传 撒星 / 回身镖: n darts fanned out evenly, `step` rad apart */
const fanOf = (n: number, step: number) => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step);

export type HSt = 'squat' | 'free' | 'k1' | 'k2' | 'k3' | 'k4' | 'k5' | 'charge' | 'rel' | 'dash' | 'dcut' | 'noto' | 'hurt' | 'dead' | 'air' | 'plunge' | 'plungeL' | 'launch' | 'kick'
  // 11-18 四本新刀谱 (用户：「我打了半天了还没个新招，一直在给我加数值」): 断云 the flurry in the air and its drive down, 掠地 the dive,
  // 牵红 the reel, 踏顶 the stomp on a head
  | 'acut' | 'acutF' | 'swoop' | 'reel' | 'stomp';
/** one cut's numbers: impact moments (share of the action), extra range, arc (rad, full width), damage per impact, knock,
 *  lunge (× TUNE.atkLunge), heavy (the finisher's stagger / FX) */
interface Swing { imps: number[]; range: number; half: number; dmg: () => number; knock: number; lunge: number; heavy: boolean }
type Cut = 'k1' | 'k2' | 'k3' | 'k4' | 'k5';
/** 11-18 节奏 (用户：「现在一招一式节奏都差不多，感觉缺乏节奏感」): 快、快、蓄、连、重. Each cut in real seconds at its base length
 *  (TUNE.k1..k5 scale it): hits = the blows; chain = when the next cut may start (after the stop at full reach — not a flat 75%);
 *  step = the step in (from, to); warp = [time, pose k, ease] — the wind-up slow then fast, the blow in two or three frames, a stop at
 *  full reach, a slow recovery (ninjaAct warpK). Pose keys: cut1 top .30 / blow .42 / reach .62; cut2 .28 / .40 / .58; the spin
 *  wound .18, arm out .28, the circle to .72 (blow .5); the thrusts back .24, out .30, half back .50, out .56, held to .74; the
 *  leaping cut raised .42, blow .50, reach .62. The 5th holds at the top a beat (吸气) before it falls */
const CUT_T: Record<Cut, { dur: number; hits: number[]; chain: number; step: [number, number]; warp: WarpKey[] }> = {
  k1: { dur: 0.46, hits: [0.13], chain: 0.25, step: [0.03, 0.15], warp: [[0.09, 0.3, 'io'], [0.13, 0.42, 'in'], [0.19, 0.62, 'out'], [0.25, 0.65, 'lin'], [0.46, 1, 'io']] },
  k2: { dur: 0.46, hits: [0.13], chain: 0.25, step: [0.03, 0.15], warp: [[0.09, 0.28, 'io'], [0.13, 0.4, 'in'], [0.19, 0.58, 'out'], [0.25, 0.62, 'lin'], [0.46, 1, 'io']] },
  k3: { dur: 0.62, hits: [0.31], chain: 0.46, step: [0.18, 0.33], warp: [[0.22, 0.18, 'io'], [0.25, 0.28, 'in'], [0.31, 0.5, 'lin'], [0.4, 0.72, 'out'], [0.46, 0.75, 'lin'], [0.62, 1, 'io']] },
  k4: { dur: 0.58, hits: [0.13, 0.24], chain: 0.36, step: [0.09, 0.25], warp: [[0.1, 0.24, 'io'], [0.13, 0.3, 'in'], [0.17, 0.4, 'out'], [0.21, 0.5, 'io'], [0.24, 0.56, 'in'], [0.34, 0.74, 'lin'], [0.58, 1, 'io']] },
  k5: { dur: 0.88, hits: [0.38], chain: 0.56, step: [0.3, 0.4], warp: [[0.22, 0.42, 'io'], [0.34, 0.43, 'lin'], [0.38, 0.5, 'in'], [0.46, 0.62, 'out'], [0.56, 0.65, 'lin'], [0.88, 1, 'io']] },
};
/** the same as shares of each cut (what the state machine and the pose read) */
const CUT_F = Object.fromEntries((Object.keys(CUT_T) as Cut[]).map(c => { const t = CUT_T[c]; return [c, {
  hits: t.hits.map(h => h / t.dur), chain: t.chain / t.dur, step: t.step.map(s => s / t.dur) as [number, number], warp: t.warp.map(([r, p, e]) => [r / t.dur, p, e] as WarpKey) }]; })) as Record<Cut, { hits: number[]; chain: number; step: [number, number]; warp: WarpKey[] }>;
export const CUT_BASE = Object.fromEntries((Object.keys(CUT_T) as Cut[]).map(c => [c, CUT_T[c].dur])) as Record<Cut, number>;
const SW: Record<Cut, Swing> = {
  k1: { imps: CUT_F.k1.hits, range: 0, half: 1.3, dmg: () => TUNE.atkDmg, knock: 0.55, lunge: 1.0, heavy: false },
  k2: { imps: CUT_F.k2.hits, range: 0, half: 1.4, dmg: () => TUNE.atkDmg, knock: 0.6, lunge: 0.8, heavy: false },
  // the turning cut: all the way round
  k3: { imps: CUT_F.k3.hits, range: 0.15, half: 9, dmg: () => TUNE.atkDmg, knock: 0.9, lunge: 0.4, heavy: false },
  // two lunging thrusts: a long narrow line, each thrust carries half the step in
  k4: { imps: CUT_F.k4.hits, range: 0.8, half: 0.3, dmg: () => Math.max(2, Math.round(TUNE.atkDmg * 0.8)), knock: 0.5, lunge: 1.4, heavy: false },
  k5: { imps: CUT_F.k5.hits, range: 0.35, half: 1.5, dmg: () => TUNE.finDmg, knock: 1.7, lunge: 1.5, heavy: true },
};
const NEXT: Record<Cut, Cut | null> = { k1: 'k2', k2: 'k3', k3: 'k4', k4: 'k5', k5: null };
/** the whoosh of each cut and how long before its blow it starts (s) */
const SWISH_CUE: Record<Cut, Cue> = { k1: 'swingLight', k2: 'swingLight', k3: 'swingSpin', k4: 'swingStab', k5: 'swingHeavy' };
const SWISH_LEAD: Record<Cut, number> = { k1: 0.05, k2: 0.05, k3: 0.08, k4: 0.04, k5: 0.07 };
/** 11-17 气 (bars) for a blow that finds someone: the plain cuts (a whole 连环刀 ≈ 0.9 of a bar; 穿风斩 counts as a plain cut), a 刀谱
 *  link (挑云 / 迎面镖 / 游身斩 / 扫八方 / 穿心腿 / 寻声 / 回身镖) twice that, 劈山 between; the draw costs QI_COST */
const QI_CUT: Record<Cut, number> = { k1: 0.15, k2: 0.15, k3: 0.15, k4: 0.1, k5: 0.25 };
export const QI_LINK = 0.3, QI_DCUT = 0.15, QI_PLUNGE = 0.2, QI_COST = 1;
const PLUNGE_HANG = 0.1, PLUNGE_V = 22, FLIP_T = 0.42;
/** the dart throw's length and the moment the dart leaves the hand (s) — act-109: snappier release 0.12 → 0.06 */
const DART_T = 0.2, DART_REL = 0.06;
/** act-27: holding the dart button this long turns the throw into an aimed one */
const AIM_T = 0.2;
/** 穿风斩: the whole move and its dash part (s) */
const DCUT_T = 0.42, DCUT_MOVE = 0.17;
/** 11-18: the crouch before a jump leaves the ground (s) — act-109: 0.1 → 0.04 so jumping feels instant while keeping the visual dip */
const JUMP_SQUAT = 0.04;
/** the sheathing after 见切 (s), and the moment the blade clicks home (fraction of it) */
const NOTO_T = 0.95, NOTO_CLICK = 0.64;
/** 11-18 断云: up beside him — two quick cuts and the blade raised overhead (s; the blows at ACUT_HITS, ninjaAct airCombo), then the
 *  third (acutF): held up there ACUTF_HANG, it comes down and drives both of them into the ground. The two air cuts each fill a third
 *  of a 刀谱 link's 气, the slam a whole one */
const ACUT_T = 0.36, ACUT_HITS = [0.07, 0.17], ACUTF_HANG = 0.08, QI_ACUT = 0.1;
/** 11-18 掠地: the whole move, the dive part (s); how far it looks for someone to land behind, the longest dive (m) */
const SWOOP_T = 0.44, SWOOP_MOVE = 0.15, SWOOP_REACH = 4.2, SWOOP_MAX = 5.6;
/** 11-18 牵红: the yank (s); a dart in someone nearer than this is not worth the rope (m — it is the cut's to follow) */
const REEL_T = 0.34, REEL_MIN = 2.0;
/** 11-18 踏顶: the step up onto the head, the moment on it before she kicks off (s); how high the kick-off goes (× the jump) */
const STOMP_UP = 0.1, STOMP_T = 0.18, STOMP_H = 0.95;

export interface HeroWorld {
  foes: Foe[];
  /** act-27: the aim of a held dart in the world (the dart button dragged, or the stick), or null */
  aimWorld?(): THREE.Vector3 | null;
  /** act-19 挑空斩: a rising cut — the light foes in the arc go up into the air */
  launch?(o: { from: THREE.Vector3; yaw: number; range: number; half: number; dmg: number }): number;
  /** act-19 飞踢: the kick lands — the first foe in front is sent flying along dir */
  kick?(o: { from: THREE.Vector3; dir: THREE.Vector3; dmg: number }): number;
  /** a blade swing lands: the world applies damage, FX and the arrows it cuts. Returns how many it hit */
  swing(o: { from: THREE.Vector3; yaw: number; range: number; half: number; dmg: number; knock: number; heavy: boolean; kind: string; n?: number; counter?: boolean }): number;
  /** a path cut (the charge release): everything within r of the segment */
  sweep(o: { a: THREE.Vector3; b: THREE.Vector3; r: number; dmg: number; knock: number; col?: number; kind?: string }): number;
  /** 追影: the foe with the freshest dart still stuck in it (within reach), or null */
  chaseTarget(): Foe | null;
  /** 追影: the blink's smoke, afterimage and shadow line; the darts in the foe are spent */
  chase(o: { from: THREE.Vector3; to: THREE.Vector3; foe: Foe }): void;
  /** a dart leaves the left hand, flying along dir (show.ts flies it and lands its hits) */
  dart(o: { from: THREE.Vector3; dir: THREE.Vector3; /** 11-17: a link volley (迎面镖 / 回身镖) — its first strike fills 气 */ link?: number }): void;
  /** the blade is up: arrows inside this arc are batted away (called every frame of a cut's guard window) */
  guard(o: { from: THREE.Vector3; yaw: number; range: number }): void;
  /** the direction to the nearest arrow flying at the hero within reach (cuts turn to meet it), or null */
  incoming(reach: number): THREE.Vector3 | null;
  /** 居合 · 见切 at the draw: an attack about to land on the hero within `win` seconds is caught now (show.ts breaks it off, throws
   *  the attacker, sends arrows back); returns where the attacker stands (the draw goes at it), or null */
  iaiCatch(win: number): THREE.Vector3 | null;
  /** 11-18 一闪 (用户：「蓄能大招反馈不足」): the draw leaves the stance — the foes on her path are pinned where they stand, a flash */
  iaiGo?(o: { from: THREE.Vector3; to: THREE.Vector3; r: number; /** 11-18 追步's second draw: no full flash */ soft?: boolean }): void;
  /** she has arrived: the world holds its breath a beat, then her path opens — the sweep (damage) is the world's to play after it */
  iaiCut?(o: { a: THREE.Vector3; b: THREE.Vector3; r: number; dmg: number; knock: number }): void;
  /** that beat is still being held (no cancelling out of it) */
  iaiBusy?(): boolean;
  /** the plunge lands: a ring of impact round the hero */
  slam(o: { at: THREE.Vector3; r: number; dmg: number; yaw: number }): number;
  /** 11-18 秘传 错身: a dash on its way — the path so far (each foe on it is cut once per dash `n`) */
  passing?(o: { a: THREE.Vector3; b: THREE.Vector3; n: number }): void;
  /** 11-18 秘传 掠顶: in the air at height y over the ground — a foe right under her takes a downward cut (once per jump `n`); returns how many */
  overhead?(o: { at: THREE.Vector3; y: number; n: number }): number;
  /** 11-18 秘传 留影: a dash has started from `at` (show.ts leaves the afterimage, if the boon is ready) */
  dashed?(o: { at: THREE.Vector3; yaw: number }): void;
  // ---- 11-18 四本新刀谱 (用户：「我打了半天了还没个新招，一直在给我加数值」)
  /** 断云: the nearest foe up in the air (thrown by 挑云, a kick, a heavy blow) within reach of her, or null */
  airFoe?(from: THREE.Vector3, y: number, reach: number): Foe | null;
  /** 断云: hold him up in the air at her height while she cuts (every frame of it) */
  airHold?(foe: Foe, y: number): void;
  /** 断云: a cut in the air on him (n 1..3), or the drive down (n 4 — he is sent into the ground). Returns how many it hit */
  airCut?(o: { foe: Foe | null; from: THREE.Vector3; yaw: number; dmg: number; n: number }): number;
  /** 断云: she lands from the drive beside him — the ground takes him, a ring of dust; whoever stands close is thrown off */
  airSlam?(o: { at: THREE.Vector3; foe: Foe | null; dmg: number; yaw: number }): number;
  /** 掠地: the dive has reached the ground — everyone along her way takes the cut */
  swoop?(o: { a: THREE.Vector3; b: THREE.Vector3; r: number; dmg: number }): number;
  /** 牵红: the foe with a dart in him that the cord reaches (not nearer than min), and whether he is too heavy to pull, or null */
  reelTarget?(from: THREE.Vector3, min: number): { foe: Foe; heavy: boolean } | null;
  /** 牵红: the yank — the red cord from her hand; a light one is drawn to `to` over dur, a heavy one stays (she goes); the dart is spent */
  reel?(o: { foe: Foe; to: THREE.Vector3; dur: number; dmg: number; self: boolean }): void;
  /** 踏顶: a foe on the ground beside her whose head is about her height (she can kick off it), or null */
  stompable?(from: THREE.Vector3, y: number): Foe | null;
  /** 踏顶: her foot lands on his head — he goes flat on the ground */
  stomp?(o: { foe: Foe; from: THREE.Vector3; dmg: number }): number;
  clamp(p: THREE.Vector3, r: number): void;
  /** screen stick → world direction */
  stickWorld(): THREE.Vector3;
}

export class Hero {
  perks: Perks = newPerks();
  a: BattleActor; st: HSt = 'free'; t = 0; dur = 0; hp = TUNE.heroHp; maxHp = TUNE.heroHp;
  vel = V3(); inv = 0; dashCd = 0; dartCd = 0;
  /** darts in hand, and the reload left once they are all thrown (s; 0 = not reloading) */
  dartAmmo = TUNE.dartCharges; dartReload = 0; private buf = { atk: 0, press: 0, dash: 0, sp: 0, jump: 0 };
  /** the cut button: a press only becomes a cut when it is let go within TUNE.holdToCharge (a tap); held longer it is the stance and no
   *  cut at all (11-16 用户「起手就长按的话不应该无论如何都会先砍一刀」). atkEaten: this press was used up (a plunge, the QTE) and its
   *  release does nothing; pendNext / pendT: a press that started during a cut and is still undecided carries on the combo */
  private atkEaten = false; private pendNext: HSt | null = null; private pendT = 0;
  /** jumps made since leaving the ground (2 = the double jump is spent); time into the double jump's flip (-1 = none) */
  private jumps = 0; private flipT = -1; private next: HSt | null = null; private hitDone = false; private hit2Done = false;
  private hits = 0; private lungeLen = 0; private swished = 0;
  /** > 0 just after the charge filled (the ring flashes) */
  fullT = 0;
  /** > 0: a perfect dodge earned a counter — the next cut started in this time hits harder (show.ts) */
  counterT = 0; private counterCut = false;
  /** 居合 · 见切: for TUNE.iaiWin after the draw from the stance, a blow landing on the hero is parried (show.ts); the parried draw
   *  cuts for double */
  parryT = 0; iaiBonus = false;
  get parrying() { return this.parryT > 0; }
  /** drop any buffered press (the QTE swallowed it) */
  clearInput() { this.buf.atk = 0; this.buf.press = 0; this.next = null; this.atkEaten = true; this.pendT = 0; }
  /** stop whatever the hero is doing (the 一刀 sequence moves it by hand) */
  forceFree() { this.set('free', 0); this.vel.set(0, 0, 0); this.y = 0; this.vy = 0; motionOf(this.a).charge = 0; }
  /** the dash's invulnerable moment (a blow landing now is a perfect dodge) */
  get dodging() { return this.st === 'dash' && this.t < TUNE.dashIframe + 0.04; }
  /** during a dash or just after it: an attack that would have caught the hero, or passes close, counts as a perfect dodge */
  get dodgeWin() { return this.st === 'dash' || this.age - this.dashEndAt < 0.18; }
  private age = 0; private dashEndAt = -9;
  private chargeK = 0; private relFrom = V3(); private relTo = V3(); private dashDir = V3(); private ghostT = 0;
  /** time into a dart throw (-1 = none); the dart leaves the hand at DART_REL of it */
  private dartT = -1; private dartDir = V3(); private dartGone = true; private dartBack = false;
  /** act-27: aiming a dart (the button held) and where; spUsed = this press already went into a derivative / 回身镖 */
  aiming = false; readonly aimDir = V3(0, 0, 1); private spUsed = false;
  /** 回身镖 is once per dash; 穿风斩's start point and whether its sweep has landed; 追影's cut hits harder */
  private dashDarted = false; private dcutFrom = V3(); private dcutHit = false; private chaseOn = false;
  /** 11-18 秘传: which dash / jump this is (错身 cuts each foe once a dash, 掠顶 once a jump; show.ts keys its sets on these), where the dash
   *  began (错身's path, 留影's afterimage, act-118 完美闪避残影); 追步: the draw going on now is the second one */
  dashN = 0; jumpN = 0; readonly dashFrom = V3(); dashStartYaw = 0; private relSecond = false;
  /** act-118: run modifiers from 碑铭潜能 & 流派成势 (dash cooldown, dart reload, 凌空 3pc haste/crit buff) */
  dashCdMul = 1; dartReloadMul = 1; galeBuffT = 0;
  /** act-19 刀谱 (the user: 「很多都应该做进强化」): the moves this run has unlocked — chase 寻声, backDart 回身镖, dbl 二段跳,
   *  launch 挑空斩, cutDart 近身三镖, keep 游身不断招, pause 停顿变招 (the yard unlocks them all; show sets this) */
  moves: Record<string, boolean> = {};
  private has(id: string) { return !!this.moves[id]; }
  /** 游身不断招: the cut that comes next after a dash out of the combo, and how long it stays on offer */
  private keepNext: Cut | null = null; private keepT = 0;
  /** 停顿变招: the window after the 2nd cut finished in which a press turns the 3rd into the double spin */
  private pauseT = 0; private spinsLeft = 0; private bigSpin = false;
  /** 11-17 (用户：「连招的窗口很多都太短了，很难放的出来，更很难被玩家感知到」): every link stays open at least about half a second.
   *  dashTailT: after a dash stops on the ground, the dash links (穿风斩 / 回身镖 / 穿心腿) are still on for TUNE.linkDash;
   *  linkT: after a cut's blow, the cut links (挑云 / 迎面镖) are on for TUNE.linkCut, even once the next cut has begun */
  private dashTailT = 0; private linkT = 0;
  /** 11-17 气 (用户：「缺少了一个限制放强力技能的战斗资源，比如能量」): three bars. Cuts that land fill it (the 刀谱 links twice as fast),
   *  a perfect dodge and a batted arrow add to it; the draw from 藏锋 (箭步斩 / 破势) spends one bar, a 破势 gives nothing back.
   *  qiDenied: a hold that found less than a bar (show.ts shakes the button once and clears it); exhaled: the breath ran out in the
   *  stance — the bar is gone and she straightens up (show.ts puffs the breath and clears it); heldFull: time held since the stance filled */
  qi = TUNE.qiStart; qiDenied = false; exhaled = false; private heldFull = 0; private keepCut = false;
  static readonly QI_MAX = 3;
  gainQi(n: number) { if (n > 0 && this.alive) this.qi = Math.min(Hero.QI_MAX, this.qi + n * TUNE.qiGain); }
  /** 屏息: 1 → 0 over the hold allowed once the stance is full (1 while it fills or outside the stance) */
  get breath() { return this.st === 'charge' && this.chargeK >= 1 ? Math.max(0, 1 - this.heldFull / Math.max(0.05, TUNE.stanceHold)) : 1; }
  /** 挑空斩: its blow has gone out; 近身三镖: the next throw is a fan of three */
  private launchHit = false; private fanNext = false;
  /** 11-18 the new 刀谱's targets this frame (what the buttons show and what a press does): 断云's foe in the air, 踏顶's head, 牵红's
   *  stuck dart */
  private airTgt: Foe | null = null; private stompTgt: Foe | null = null; private reelTgt: { foe: Foe; heavy: boolean } | null = null;
  /** 断云: who she is cutting in the air, the height she holds him at; 掠地: the dive's start, its end on the ground, the height it
   *  left from; 牵红: she goes (a heavy one) from → to; 踏顶: whose head, where she came from, the top of his head, her height then */
  private acutFoe: Foe | null = null; private acutY = 1.6; private swoopFrom = V3(); private swoopTo = V3(); private swoopY0 = 0;
  private reelSelf = false; private reelFrom = V3(); private reelTo = V3();
  private stompFoe: Foe | null = null; private stompFrom = V3(); private stompTop = 0; private stompY0 = 0;
  /** height off the ground and vertical speed */
  y = 0; vy = 0; private v0 = 1;
  readonly r = 0.38;
  get pos() { return this.a.home; }
  constructor(at: THREE.Vector3, public def: ModelDef = ACT_NINJA) { this.a = this.makeActor(def, at, Math.PI); }
  private makeActor(def: ModelDef, at: THREE.Vector3, yaw: number) { const a = new BattleActor(def); a.place(at.clone(), yaw); a.yaw = yaw; trimShadows(a.root, 7); return a; }
  /** put on another body (the yard's rack): same place, facing, state reset to free */
  setModel(def: ModelDef) {
    const at = this.pos.clone(), yaw = this.a.yaw; this.a.dispose(); this.def = def; this.a = this.makeActor(def, at, yaw);
    this.set('free', 0); this.y = 0; this.vy = 0;
  }
  get alive() { return this.st !== 'dead'; }
  /** act-40 (用户：「现在主角死了的动画太僵硬了」 — it was the generic stiff fall: the hips swung back 1.35 rad, a plank): her own death,
   *  laid over the pose each frame after the actor's update — the blow throws her back, the knees go and she sinks onto them, the
   *  blade's point drops to the ground, she sags forward, then topples onto her side and goes limp */
  deathSide: 1 | -1 = 1;
  /** act-44: a cutscene's own pose, laid on after the actor's update each frame (getting up off the mat); null = none */
  scriptPose: (() => void) | null = null;
  deathPose() {
    // Handled natively inside ninjaAct.ts heroFall() (4-beat kneel -> blade-prop -> side-forward collapse) for both gameplay & preview
    if (this.st !== 'dead') return;
    this.a.body.rotation.set(0, 0, 0);
    this.a.body.position.set(0, 0, 0);
  }
  /** 0..1 while holding a charge (the HUD and the ring under the hero show it), else 0 */
  get charge() { return this.st === 'charge' ? this.chargeK : 0; }
  get airborne() { return this.y > 0.01; }
  get iframe() { return this.inv > 0 || (this.st === 'dash' && this.t < TUNE.dashIframe) || (this.st === 'rel' && this.t < this.dur * 0.55) || (this.st === 'dcut' && this.t < DCUT_MOVE + 0.05)
    // 11-18: 掠地's dive and 牵红 pulling her to a big one pass through blows like a dash (no blinking inv for them)
    || (this.st === 'swoop' && this.t < SWOOP_MOVE + 0.05) || (this.st === 'reel' && this.reelSelf); }
  private set(st: HSt, dur: number) { this.st = st; this.t = 0; this.dur = dur; this.hitDone = false; this.hit2Done = false; this.hits = 0; }
  /** face the best target near the stick direction (or the stick direction itself) */
  private aim(w: HeroWorld, reach = 4.2) {
    // an arrow about to hit: meet it first
    const arrow = w.incoming(4.5); if (arrow) { this.a.yaw = Math.atan2(arrow.x, arrow.z); return null; }
    const s = w.stickWorld(), has = s.lengthSq() > 0.04; let best: Foe | null = null, bd = 1e9;
    for (const f of w.foes) {
      if (f.st === 'dead') continue;
      const d = f.pos.clone().sub(this.pos).setY(0), l = d.length(); if (l > reach) continue;
      if (has) { const ang = Math.acos(Math.max(-1, Math.min(1, d.dot(s) / (l * s.length() || 1)))); if (ang > 1.25) continue; }
      if (l < bd) { bd = l; best = f; }
    }
    if (best) this.a.yaw = Math.atan2(best.pos.x - this.pos.x, best.pos.z - this.pos.z);
    else if (has) this.a.yaw = Math.atan2(s.x, s.z);
    return best;
  }
  /** 11-18 3C: the skid, the braking step, the push (s left); the guard after fighting (s left); the stick a frame ago; facing a frame ago */
  private skidT = 0; private brakeT = 0; private startT = 0; private readyT = 0; private prevSl = 0; private prevYaw = 0;
  /** 11-20 (act-109 普攻起手去延迟): time spent coiling on pressing 斩 in free state before release/藏锋; lungeStart adapts step window */
  private coilT = 0; private lungeStart = 0;
  private startCut(n: Cut, w: HeroWorld, chase = false, big = false, keep = false, skip = 0) {
    this.readyT = 2.2; this.coilT = 0;
    this.chaseOn = chase; this.bigSpin = big; this.keepCut = keep;
    const dur = TUNE[n] / (TUNE.atkSpeed * (this.galeBuffT > 0 ? 1.18 : 1)); this.set(n, dur); this.next = null; const tgt = this.aim(w);
    this.counterCut = this.counterT > 0; if (this.counterCut) this.counterT = 0;
    // the step in: TUNE.atkLunge × this cut's share; with a foe ahead, stop TUNE.lungeStop short of it
    const full = TUNE.atkLunge * SW[n].lunge;
    this.lungeLen = tgt ? Math.max(0, Math.min(full, tgt.pos.distanceTo(this.pos) - (tgt.d.r + TUNE.lungeStop))) : full;
    const act = this.a.play(new Action(n, dur, SW[n].imps[0], { warp: CUT_F[n].warp })); this.swished = 0;
    // act-109: if the player already coiled in free state before releasing tap, fast-forward the wind-up (never past impact or swish)
    const maxSkip = Math.max(0, (SW[n].imps[0] - 0.055) * dur);
    const adv = skip > 0 ? Math.min(skip * 0.85, maxSkip) : 0;
    if (adv > 0) { this.t = adv; act.t = adv; }
    this.lungeStart = Math.max(CUT_F[n].step[0], adv / dur);
  }
  private startDash(w: HeroWorld) {
    const s = w.stickWorld(); this.dashDir.copy(s.lengthSq() > 0.04 ? s.normalize() : this.a.fwd());
    this.a.yaw = Math.atan2(this.dashDir.x, this.dashDir.z); this.dashStartYaw = this.a.yaw;
    this.set('dash', TUNE.dashTime); this.dashCd = TUNE.dashCd * Math.max(0.45, this.dashCdMul); this.dashN++; this.dashFrom.copy(this.pos); this.ghostT = 0; this.dashDarted = false; this.dashTailT = 0; this.linkT = 0;
    this.vy = 0;   // an air dash holds its height
    this.a.play(new Action('dashA', TUNE.dashTime * 1.4, 0.2)); cue('dash', 0.8);
    w.dashed?.({ at: this.pos.clone(), yaw: this.a.yaw });   // (11-18 留影)
  }
  /** 11-18 (act-42 反馈：「应该是先下蹲然后蹬出去腾空」): a jump from the ground crouches first (JUMP_SQUAT on the ground — a dash
   *  still cancels it), then leaves; the double jump and 挑云 go at once */
  private startJump() {
    if (this.y > 0.001) { this.launchJump(); return; }
    this.set('squat', JUMP_SQUAT); this.a.act?.cancel(); this.a.act = null; this.next = null; this.pendT = 0; this.linkT = 0; this.dashTailT = 0;
  }
  private launchJump() {
    this.v0 = (4 * TUNE.jumpH) / TUNE.jumpT; this.vy = this.v0; this.y = Math.max(this.y, 0.001); this.jumps = 1; this.flipT = -1; this.pendT = 0; this.linkT = 0; this.dashTailT = 0; this.airT = 0; this.jumpN++;
    this.set('air', 99); this.a.act?.cancel(); this.a.act = null; this.next = null;
    dustBlocks(this.pos.clone(), 5); cue('jump', 0.6);
  }
  /** the double jump: a fresh kick upward from wherever the hero is, a forward somersault, a puff of air under the feet */
  private startJump2() {
    const v = Math.sqrt(2 * this.gravity * TUNE.jump2H); this.v0 = v; this.vy = Math.max(this.vy, v); this.jumps = 2; this.flipT = 0;
    this.set('air', 99); this.a.act?.cancel(); this.a.act = null; this.next = null; this.pendT = 0;
    // the air it kicked off: a flat ring of pale blocks spreading out under the feet, and the body left behind for a blink
    const at = this.pos.clone().setY(this.y + 0.05);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; addBlock(at.clone().add(V3(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2)), { size: 0.09, v: V3(Math.cos(a) * 3.2, -0.4, Math.sin(a) * 3.2), col: 0xdfe8f0, glow: false, life: 0.32, shrink: 0.32, drag: 6, grav: 0 }); }
    fxAfterimage(this.pos.clone().setY(this.y), 1.9, 0x9ab4d8, { life: 0.25, glow: 0.3 });
    cue('jump', 0.8); cue('swish', 0.4);
  }
  private startPlunge(w: HeroWorld) {
    this.aim(w, 3.5); this.set('plunge', 99); this.vy = 0; this.vel.multiplyScalar(0.25);
    // the action runs over the hang plus the fall (so the blade comes down as the body does)
    this.a.play(new Action('plunge', PLUNGE_HANG + this.y / PLUNGE_V + 0.02, 0.98)); cue('swishHeavy', 0.6);
  }
  get gravity() { return (8 * TUNE.jumpH) / (TUNE.jumpT * TUNE.jumpT); }
  /** 11-18 跳跃: gravity as she flies — the rise as before, half near the top (a moment's hang), 1.6× on the way down (a jump that
   *  falls as fast as it rose reads floaty and stiff) */
  private gravAt(vy: number) { return this.gravity * (vy > 1.4 ? 1 : vy > -1.4 ? 0.5 : 1.6); }
  /** seconds since the last take-off (the push pose) */
  private airT = 9;
  /** 回据点 from the pause menu: she falls where she stands (the run ends as a death) */
  giveUp() { this.hp = 0; this.set('dead', 99); this.a.fall(0); }
  hurt(dmg: number, from: THREE.Vector3): boolean {
    if (!this.alive || this.iframe) return false;
    this.hp = Math.max(0, this.hp - dmg); this.inv = TUNE.hurtIframe; this.linkT = 0; this.dashTailT = 0;
    const away = this.pos.clone().sub(from).setY(0); if (away.lengthSq() < 1e-4) away.set(0, 0, 1); away.normalize();
    // Direction blow arrived FROM in hero's local frame (0 = front, PI = back, +PI/2 = left, -PI/2 = right)
    const rawFrom = Math.atan2(from.x - this.pos.x, from.z - this.pos.z) - this.a.yaw;
    const fromAngle = Math.atan2(Math.sin(rawFrom), Math.cos(rawFrom));
    this.vel.copy(away).multiplyScalar(7); motionOf(this.a).charge = 0;
    if (this.vy > 0) this.vy = 0;
    if (this.hp <= 0) { this.set('dead', 99); this.deathSide = Math.random() < 0.5 ? 1 : -1; this.a.fall(fromAngle); return true; }
    this.set('hurt', 0.26); this.a.play(new Action('hurt', 0.42, 0.1, { power: 1.2, fromAngle })); this.a.hit(1);
    return true;
  }
  update(dt: number, inp: Input, w: HeroWorld) {
    const m = motionOf(this.a), B = inp.b;
    this.showBlade();
    this.t += dt; this.age += dt; this.keepT = Math.max(0, this.keepT - dt); this.dashTailT = Math.max(0, this.dashTailT - dt); this.linkT = Math.max(0, this.linkT - dt); this.pauseT = Math.max(0, this.pauseT - dt); this.parryT = Math.max(0, this.parryT - dt); this.fullT = Math.max(0, this.fullT - dt); this.counterT = Math.max(0, this.counterT - dt); this.inv = Math.max(0, this.inv - dt); this.dashCd -= dt; this.dartCd -= dt; this.galeBuffT = Math.max(0, this.galeBuffT - dt);
    if (this.dartReload > 0) { this.dartReload -= dt; if (this.dartReload <= 0) { this.dartReload = 0; this.dartAmmo = TUNE.dartCharges; } } m.land = Math.max(0, m.land - dt / Math.max(0.05, m.landDur)); this.airT += dt;
    // buffers: a press counts for a short while (so a press slightly early still chains);
    // act-109: freeze buffer decay during 一闪 stillness so inputs pressed during the 0.16s beat are never swallowed
    const A = B.attack, bdt = w.iaiBusy?.() ? 0 : dt;
    if (A.pressed) this.atkEaten = false;
    const tap = A.released && A.last < TUNE.holdToCharge && !this.atkEaten, holding = A.down && A.held >= TUNE.holdToCharge && !this.atkEaten;
    this.buf.atk = tap ? 0.26 : Math.max(0, this.buf.atk - bdt);
    this.buf.press = A.pressed ? 0.24 : Math.max(0, this.buf.press - bdt);
    this.pendT = Math.max(0, this.pendT - bdt);
    if (this.flipT >= 0) { this.flipT += dt; if (this.flipT >= FLIP_T) this.flipT = -1; }
    this.buf.dash = B.dash.pressed ? 0.24 : Math.max(0, this.buf.dash - bdt);
    // (11-17: 0.15 / 0.12 → 0.2 — a link pressed a moment before its window opens still counts)
    this.buf.sp = B.special.pressed ? 0.22 : Math.max(0, this.buf.sp - bdt);
    this.buf.jump = B.jump.pressed ? 0.22 : Math.max(0, this.buf.jump - bdt);
    // flicker while invulnerable after a hit
    // (the hit blink is for the short i-frames after a hit; a scripted invulnerability — the prologue's fall sets 99 — must not blink:
    //  act-40 用户：「剧情杀的时候主角的模型不见了」— a cutscene froze her on an off frame of the blink)
    this.a.root.visible = this.st === 'dead' || this.inv <= 0 || this.inv > 20 || Math.floor(this.inv * 18) % 2 === 0;
    if (this.st === 'dead') { this.vel.multiplyScalar(Math.exp(-dt * 6)); this.fall(dt); this.move(dt, w); m.run = 0; m.air = this.y; return; }
    const stick = w.stickWorld(), sl = Math.min(1, stick.length());
    const canDash = this.dashCd <= 0 && this.buf.dash > 0, canJump = this.buf.jump > 0 && !this.airborne;
    const steer = (accel: number) => {
      const want = stick.clone().multiplyScalar(TUNE.heroSpeed * (this.galeBuffT > 0 ? 1.16 : 1));
      this.vel.lerp(want, 1 - Math.exp(-accel * dt));
      if (sl > 0.1) { const y = Math.atan2(stick.x, stick.z); let dy = y - this.a.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; this.a.yaw += dy * Math.min(1, dt * 20); }
    };
    // 追影 (act-118 防误抢连招): a dart marked foe + 斩 blinks to it, UNLESS mid-combo (k2-k4) against a closer foe right in front
    const cutting = this.st === 'k1' || this.st === 'k2' || this.st === 'k3' || this.st === 'k4' || this.st === 'k5';
    if (A.pressed && (this.st === 'free' || this.st === 'air' || this.st === 'dash' || cutting)) {
      const f = this.has('chase') ? w.chaseTarget() : null;
      const midBusy = (this.st === 'k2' || this.st === 'k3' || this.st === 'k4') && f && f.pos.distanceTo(this.pos) > 3.2 && w.foes.some(o => o !== f && o.st !== 'dead' && o.pos.distanceTo(this.pos) < 2.1);
      if (f && !midBusy) { this.atkEaten = true; this.buf.atk = 0; this.buf.press = 0; this.startChase(f, w); }
    }
    // 11-18 新刀谱: what each of them could take right now (the buttons turn over to it; a press takes it)
    if (!this.airborne) this.lastStomp = null;
    this.airTgt = this.has('acut') && this.st === 'air' && this.airborne ? w.airFoe?.(this.pos, this.y, 2.6) ?? null : null;
    this.stompTgt = this.has('stomp') && this.st === 'air' && this.y > 0.4 ? w.stompable?.(this.pos, this.y) ?? null : null;
    if (this.stompTgt && this.stompTgt === this.lastStomp) this.stompTgt = null;   // (not the same head twice in one jump)
    this.reelTgt = this.has('reel') && !this.airborne && (this.st === 'free' || (cutting && this.hitDone)) ? w.reelTarget?.(this.pos, REEL_MIN) ?? null : null;
    // 飞镖 (act-27, user: 「飞刀要自动索敌一下，按住可以通过技能按钮指定方向」): a tap throws on release at the nearest foe (auto-aim);
    // held past AIM_T it is aimed — the finger dragged off the button (touch) or the stick (keys / pad) — with a line on the ground, and
    // goes on release. Free on the ground or in the air, it never stops the hero. (Holding no longer rapid-fires.)
    const SP = B.special, dartOk = (this.st === 'free' || this.st === 'air') && this.dartAmmo > 0;
    if (SP.pressed) { this.spUsed = false; this.aimDir.copy(this.a.fwd().setY(0).normalize()); }
    // 牵红 (刀谱): a dart already in someone a way off + the dart button = the red cord yanks him in (a heavy one: she goes to him);
    // this press throws nothing
    if (SP.pressed && this.reelTgt) { this.spUsed = true; this.buf.sp = 0; this.startReel(this.reelTgt, w); }
    this.aiming = dartOk && SP.down && SP.held >= AIM_T && !this.spUsed;
    if (this.aiming) { const a = w.aimWorld?.(); if (a && a.lengthSq() > 1e-4) this.aimDir.copy(a).setY(0).normalize(); }
    if (SP.released && dartOk && !this.spUsed && this.dartCd <= 0) { this.buf.sp = 0; this.startDart(w, SP.last >= AIM_T ? this.aimDir.clone() : null); }
    if (this.dartT >= 0) {
      this.dartT += dt;
      if (!this.dartGone && this.dartT >= DART_REL) {
        this.dartGone = true;
        const hand = this.handL(), count = v(this.perks, 'darts3'), dirs = count > 1 ? fanOf(count, count >= 5 ? 0.18 : 0.24) : this.fanNext ? [-0.24, 0, 0.24] : [0];
        const link = this.fanNext ? ++this.volley : 0; this.fanNext = false;   // (11-17: 迎面镖's volley fills 气 once, on its first dart that strikes)
        for (const a of dirs) { const d = this.dartDir.clone().applyAxisAngle(V3(0, 1, 0), a); w.dart({ from: hand, dir: d, link }); }
        cue('dartThrow', 0.6);
      }
      if (this.dartT >= DART_T || (this.st !== 'free' && this.st !== 'air' && this.st !== 'dash')) this.dartT = -1;
    }
    switch (this.st) {
      case 'squat': {
        // the crouch before a jump: the run eases off, a dash cancels it, then she leaves the ground
        this.vel.multiplyScalar(Math.exp(-dt * 5));
        if (canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (this.t >= this.dur) { this.launchJump(); dustBlocks(this.pos.clone(), 4); }
        break;
      }
      case 'free': {
        // 11-18 3C (用户：「3C总之都要再加强」): a reversal at speed skids, a stop from a run takes a braking step, a run from standing
        // starts with a push — each with a little dirt (and a scrape for the skid / the stop). Read before steering: the steer
        // takes half the speed off in the first frame
        { const hs = Math.hypot(this.vel.x, this.vel.z), top = TUNE.heroSpeed;
          if (sl > 0.5 && hs > 0.65 * top && this.skidT <= 0 && (this.vel.x * stick.x + this.vel.z * stick.z) / (hs * sl) < -0.35) { this.skidT = 0.18; dustBlocks(this.pos.clone(), 6, this.vel.clone().normalize()); cue('skid', 0.7); }
          else if (this.prevSl > 0.5 && sl < 0.15 && hs > 0.7 * top && this.brakeT <= 0) { this.brakeT = 0.3; dustBlocks(this.pos.clone(), 4, this.vel.clone().normalize()); cue('skid', 0.35); }
          else if (this.prevSl < 0.15 && sl > 0.5 && hs < 0.3 * top) { this.startT = 0.16; dustBlocks(this.pos.clone(), 3, stick.clone().multiplyScalar(-1)); } }
        steer(TUNE.heroAccel);
        // 11-17: the dash links stay on for TUNE.linkDash after the dash has stopped (on the ground). Out of a combo, with 游身斩
        // learnt, a cut pressed after the dash is 游身斩 instead (in the dash it is still 穿风斩)
        if (this.dashTailT > 0 && !this.airborne) {
          if (A.pressed && !this.keepOpen) { this.buf.press = 0; this.buf.atk = 0; this.atkEaten = true; this.startDashCut(); break; }
          if (B.special.pressed && this.has('backDart') && !this.dashDarted && this.dartAmmo > 0) { this.buf.sp = 0; this.spUsed = true; this.dashDarted = true; this.backDarts(w); }
          if (B.jump.pressed && this.has('kick')) { this.buf.jump = 0; this.startKick(); break; }
        }
        // 11-17 / act-118: 挑云 only triggers on intentional quick link (not while jumping over an incoming low attack)
        if (this.linkT > 0 && !this.airborne) {
          if (this.buf.sp > 0 && this.has('cutDart') && this.dartAmmo > 0 && this.dartCd <= 0) { this.buf.sp = 0; this.spUsed = true; this.fanNext = true; this.linkT = 0; this.startDart(w); }
          if (canJump && this.has('launch') && this.linkT > TUNE.linkCut * 0.36 && !this.lowThreatNear(w)) { this.buf.jump = 0; this.startLaunch(w); break; }
        }
        if (canDash) { this.coilT = 0; this.buf.dash = 0; this.startDash(w); break; }
        if (canJump) { this.coilT = 0; this.buf.jump = 0; this.startJump(); break; }
        // act-109 (普攻起手去延迟): pressing 斩 in free state snaps aim & coils on frame 0; releasing within holdToCharge fast-forwards
        // the cut's wind-up by the time already coiled; holding past holdToCharge flows straight into 藏锋 with no unwanted cut
        if (A.down && !this.atkEaten && !holding) {
          if (this.coilT <= 0) { this.aim(w); this.readyT = 2.2; }
          this.coilT += dt;
          this.vel.multiplyScalar(Math.exp(-dt * 5));
        }
        // a tap cuts (at the release; a press begun in the last cut carries the combo on); a hold goes straight into the stance, no cut
        if (this.buf.atk > 0) {
          const skip = this.coilT; this.coilT = 0; this.buf.atk = 0;
          // 游身不断招: out of a dash that broke off the combo, the combo goes on from the side
          if (this.keepOpen) { const n = this.keepNext!; this.keepNext = null; this.keepT = 0; this.pendT = 0; this.startCut(n, w, false, false, true, skip); this.sideCut(w); break; }
          // 停顿变招: a beat's pause after the 2nd cut, then a press = the 3rd as a double spin that sweeps everyone outward
          if (this.pauseT > 0 && this.pauseT < 0.8 && this.has('pause')) { this.pauseT = 0; this.pendT = 0; this.spinsLeft = 2; this.startCut('k3', w, false, true, false, skip); break; }
          const n = this.pendT > 0 && this.pendNext ? this.pendNext as Cut : 'k1'; this.pendT = 0; this.startCut(n, w, false, false, false, skip); break;
        }
        if (!A.down) this.coilT = 0;
        if (holding) { this.coilT = 0; this.tryCharge(); }
        break;
      }
      case 'air': {
        steer(TUNE.heroAccel * 0.7);
        this.vy -= this.gravAt(this.vy) * dt; this.y += this.vy * dt;
        // 11-18 秘传 掠顶: high enough over a foe, a quick cut down at it (show.ts; once a foe a jump, and only while she is high)
        if (this.y > 0.7 && w.overhead) w.overhead({ at: this.pos.clone(), y: this.y, n: this.jumpN });
        // 踏顶 (刀谱): beside someone whose head is about her height, jump = a foot on his head and up again (before the double jump,
        // which it gives back)
        if (this.buf.jump > 0 && this.stompTgt) { this.buf.jump = 0; this.startStomp(this.stompTgt); break; }
        // the double jump: jump again in the air (once until landing)
        if (this.buf.jump > 0 && this.jumps < 2 && this.has('dbl')) { this.buf.jump = 0; this.startJump2(); break; }
        // in the air a press is the plunge at once (no stance up here); its release then does nothing.
        // 断云 (刀谱): with someone up in the air beside her (挑云 threw him), the press is three cuts on him up here instead
        if (this.buf.press > 0) { this.buf.press = 0; this.buf.atk = 0; this.atkEaten = true; if (this.airTgt) this.startAirCut(this.airTgt, w); else this.startPlunge(w); break; }
        // 掠地 (act-118 防抢空冲): dives when dashing toward a foe ahead; dashing away into open space keeps normal defensive air-dash
        if (canDash) { this.buf.dash = 0; if (this.has('swoop') && this.hasSwoopTarget(w)) this.startSwoop(w); else this.startDash(w); break; }
        if (this.y <= 0) this.landed(w);
        break;
      }
      case 'acut': {
        // 断云: up beside him, holding him up there — three quick cuts (the third after a beat), then the drive down
        const f = this.acutFoe, live = !!f && f.st !== 'dead';
        this.vel.set(0, 0, 0); this.vy = 0; this.y += (this.acutY - this.y) * Math.min(1, dt * 12);
        if (live) {
          const d = f!.pos.clone().sub(this.pos).setY(0), l = d.length();
          if (l > 1e-3) { d.divideScalar(l); this.a.yaw = Math.atan2(d.x, d.z); const want = f!.pos.clone().addScaledVector(d, -(f!.d.r + 0.7)); const e = 1 - Math.exp(-dt * 22); this.pos.x += (want.x - this.pos.x) * e; this.pos.z += (want.z - this.pos.z) * e; }
          w.airHold?.(f!, this.y);
        }
        while (this.hits < ACUT_HITS.length && this.t >= ACUT_HITS[this.hits]) {
          this.hits++; this.hitDone = true; cue('swingLight', 0.6);
          if ((w.airCut?.({ foe: live ? f : null, from: this.pos.clone().setY(this.y), yaw: this.a.yaw, dmg: Math.round(TUNE.atkDmg * 1.0), n: this.hits }) ?? 0) > 0) this.gainQi(QI_ACUT);
        }
        if (this.t >= this.dur) this.startAirCutDown();
        break;
      }
      case 'acutF': {
        // 断云's third cut: the blade over the head a moment (he is still held), then it comes down and both of them with it
        const f = this.acutFoe, live = !!f && f.st !== 'dead'; this.vel.multiplyScalar(Math.exp(-dt * 10));
        if (this.t < ACUTF_HANG) { this.vy = 0; if (live) w.airHold?.(f!, this.y); break; }
        if (!this.hitDone) { this.hitDone = true; cue('swingHeavy', 1); w.airCut?.({ foe: live ? f : null, from: this.pos.clone().setY(this.y), yaw: this.a.yaw, dmg: Math.round(TUNE.atkDmg * 1.5), n: 3 }); }
        this.vy = -PLUNGE_V; this.y = Math.max(0, this.y + this.vy * dt);
        if (this.y <= 0) {
          this.y = 0; this.vy = 0; this.vel.set(0, 0, 0); this.jumps = 0; this.flipT = -1;
          if ((w.airSlam?.({ at: this.pos.clone(), foe: live ? f : null, dmg: Math.round(TUNE.atkDmg * 2.2), yaw: this.a.yaw }) ?? 0) > 0) this.gainQi(QI_LINK);
          this.acutFoe = null; this.set('plungeL', 0.34); this.a.play(new Action('plungeL', 0.34, 0.05));
        }
        break;
      }
      case 'swoop': {
        // 掠地: the dive — faster as it goes, down to the ground behind them; the cut opens along the way when she lands
        if (this.t < SWOOP_MOVE) {
          const u = this.t / SWOOP_MOVE, e = u * u * (2 - u);
          this.pos.x = this.swoopFrom.x + (this.swoopTo.x - this.swoopFrom.x) * e; this.pos.z = this.swoopFrom.z + (this.swoopTo.z - this.swoopFrom.z) * e;
          this.y = this.swoopY0 * (1 - e); this.vel.set(0, 0, 0);
          this.ghostT -= dt; if (this.ghostT <= 0) { this.ghostT = 0.035; fxAfterimage(this.pos.clone().setY(this.y), 1.9, 0x6ab88a, { life: 0.2, glow: 0.25 }); }
          break;
        }
        if (!this.hitDone) {
          this.hitDone = true; this.y = 0; this.vy = 0; this.pos.x = this.swoopTo.x; this.pos.z = this.swoopTo.z; this.jumps = 0; this.flipT = -1;
          this.vel.copy(this.dashDir).multiplyScalar(2.5);
          if ((w.swoop?.({ a: this.swoopFrom.clone(), b: this.pos.clone(), r: 1.0, dmg: Math.round(TUNE.atkDmg * 2.1) }) ?? 0) > 0) this.gainQi(QI_LINK);
          dustBlocks(this.pos.clone(), 8, this.dashDir.clone()); cue('land', 0.7); cue('skid', 0.5);
        }
        this.vel.multiplyScalar(Math.exp(-dt * 9));
        if (canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (canJump) { this.buf.jump = 0; this.startJump(); break; }
        if (this.buf.atk > 0 && this.t > SWOOP_MOVE + 0.12) { this.buf.atk = 0; this.startCut('k1', w); break; }
        if (this.t >= this.dur) this.set('free', 0);
        break;
      }
      case 'reel': {
        // 牵红: the yank (a light one comes to her — show.ts drags him); a heavy one stays and she goes along the cord to him
        if (this.reelSelf) {
          const u = Math.max(0, Math.min(1, (this.t - 0.08) / (this.dur - 0.08))), e = u * u * (3 - 2 * u);
          this.pos.x = this.reelFrom.x + (this.reelTo.x - this.reelFrom.x) * e; this.pos.z = this.reelFrom.z + (this.reelTo.z - this.reelFrom.z) * e; this.vel.set(0, 0, 0);
          this.ghostT -= dt; if (u > 0 && u < 1 && this.ghostT <= 0) { this.ghostT = 0.045; fxAfterimage(this.pos.clone(), 1.9, 0x8a4a5a, { life: 0.18, glow: 0.2 }); }
        } else this.vel.multiplyScalar(Math.exp(-dt * 12));
        if (canDash && this.t > 0.1) { this.buf.dash = 0; this.startDash(w); break; }
        if (this.buf.atk > 0 && this.t > (this.reelSelf ? this.dur * 0.75 : 0.16)) { this.buf.atk = 0; this.pendT = 0; this.startCut('k1', w); break; }
        if (this.t >= this.dur) this.set('free', 0);
        break;
      }
      case 'stomp': {
        // 踏顶: up onto his head (STOMP_UP), a crouch on it as he goes down under her foot, then off it like a fresh jump
        const f = this.stompFoe, half = STOMP_UP; this.vel.set(0, 0, 0); this.vy = 0;
        if (this.t < half && f) {
          const u = this.t / half, e = 1 - (1 - u) ** 2, back = this.stompFrom.clone().sub(f.pos).setY(0); if (back.lengthSq() < 1e-4) back.copy(this.a.fwd()).multiplyScalar(-1);
          const to = f.pos.clone().addScaledVector(back.normalize(), 0.12);
          this.pos.x = this.stompFrom.x + (to.x - this.stompFrom.x) * e; this.pos.z = this.stompFrom.z + (to.z - this.stompFrom.z) * e;
          this.y = this.stompY0 + (this.stompTop - this.stompY0) * e;
        }
        if (this.t >= half && !this.hitDone) {
          this.hitDone = true; this.y = this.stompTop;
          if (f && (w.stomp?.({ foe: f, from: this.pos.clone().setY(this.y), dmg: Math.round(TUNE.atkDmg * 1.3) }) ?? 0) > 0) this.gainQi(QI_LINK);
        }
        if (this.t >= this.dur) {
          // kick off it: a jump of its own from up here (the double jump is back for after)
          const v0 = Math.sqrt(2 * this.gravity * TUNE.jumpH * STOMP_H); this.v0 = v0; this.vy = v0; this.jumps = 1; this.flipT = -1; this.airT = 0; this.stompFoe = null;
          this.set('air', 99); this.a.act?.cancel(); this.a.act = null;
          const at = this.pos.clone().setY(this.y + 0.03);
          for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; addBlock(at.clone().add(V3(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18)), { size: 0.09, v: V3(Math.cos(a) * 2.6, -0.3, Math.sin(a) * 2.6), col: 0xb8a888, glow: false, life: 0.3, shrink: 0.3, drag: 6, grav: 0 }); }
          cue('jump', 0.8);
        }
        break;
      }
      case 'plunge': {
        this.vel.multiplyScalar(Math.exp(-dt * 10));
        if (this.t >= PLUNGE_HANG) { this.vy = -PLUNGE_V; this.y += this.vy * dt; }
        if (this.y <= 0) {
          this.y = 0; this.vy = 0; this.vel.set(0, 0, 0);
          if (w.slam({ at: this.pos.clone(), r: TUNE.plungeR, dmg: TUNE.plungeDmg, yaw: this.a.yaw }) > 0) this.gainQi(QI_PLUNGE);
          this.set('plungeL', 0.34); this.a.play(new Action('plungeL', 0.34, 0.05));
        }
        break;
      }
      case 'plungeL': {
        this.vel.multiplyScalar(Math.exp(-dt * 14));
        if (this.t > 0.1 && canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (this.t > 0.1 && canJump) { this.buf.jump = 0; this.startJump(); break; }
        if (this.t > 0.14 && this.buf.atk > 0) { this.buf.atk = 0; this.startCut('k1', w); break; }
        if (this.t > 0.18 && sl > 0.4) { this.set('free', 0); break; }
        if (this.t >= this.dur) this.set('free', 0);
        break;
      }
      case 'k1': case 'k2': case 'k3': case 'k4': case 'k5': {
        const cut = this.st as Cut, sw = SW[cut], k = this.t / this.dur, cf = CUT_F[cut];
        // the lunge: the cut steps in over its step window; afterwards damp smoothly instead of dead-stopping like glue
        const ahead = this.a.fwd(), s0 = this.lungeStart, s1 = cf.step[1], inWin = k > s0 && k < s1 && s1 > s0 + 0.01;
        if (inWin) this.vel.copy(ahead).multiplyScalar(this.lungeLen / (this.dur * (s1 - s0)));
        else this.vel.multiplyScalar(Math.exp(-dt * 14));
        // 11-18: the blade's whoosh rides the blow itself (a beat before each impact), not the start of the wind-up
        while (this.swished < sw.imps.length && k >= sw.imps[this.swished] - SWISH_LEAD[cut] / this.dur) {
          this.swished++; cue(SWISH_CUE[cut], cut === 'k5' ? 1 : cut === 'k3' ? 0.8 : 0.6);
          if (cut === 'k5' && this.swished === 1) cue('breath', 0.8);
        }
        while (this.hits < sw.imps.length && k >= sw.imps[this.hits]) {
          this.hits++; this.hitDone = true; this.linkT = TUNE.linkCut;
          // 气: a cut that finds someone fills a share of a bar; the 刀谱 links (寻声's cut, 游身斩, 扫八方) twice what a plain cut gives
          const link = (this.chaseOn || this.keepCut) && this.hits === 1 || this.bigSpin;
          // 11-18 秘传 荡刃: the 3rd cut's ring reaches further and cuts harder (show.ts draws the wider ring of wind)
          const wide = cut === 'k3' && hasBoon(this.perks, 'spin'), range = TUNE.atkRange + sw.range + (this.bigSpin ? 0.9 : 0) + (wide ? v(this.perks, 'spin') : 0);
          const got = w.swing({ from: this.pos.clone(), yaw: this.a.yaw, range, half: sw.half / 2 + (cut === 'k4' ? 0.1 : 0.35), dmg: Math.round(sw.dmg() * (this.chaseOn && this.hits === 1 ? 2.0 : 1) * (this.bigSpin ? 1.35 : 1) * (wide ? v2(this.perks, 'spin') / 100 : 1)), knock: this.bigSpin ? 1.9 : wide ? 1.3 : sw.knock, heavy: sw.heavy || (this.chaseOn && this.hits === 1) || this.bigSpin, kind: this.chaseOn && this.hits === 1 ? 'chase' : cut, n: this.hits, counter: this.counterCut && this.hits === 1 });
          if (got > 0) this.gainQi(link ? QI_LINK : QI_CUT[cut]);
        }
        // the guard window: from the start of the cut until TUNE.deflectWin after (0.1 s before) the last blow, the blade bats arrows away
        const ts = this.t, lastI = sw.imps[sw.imps.length - 1];
        if (ts >= 0.03 && ts <= Math.max(sw.imps[0] * this.dur - 0.1 + TUNE.deflectWin, lastI * this.dur - 0.1 + TUNE.deflectWin * 0.6)) w.guard({ from: this.pos.clone(), yaw: this.a.yaw, range: TUNE.atkRange + sw.range + 0.5 });
        // (11-18: the 2nd cut's left-hand strike is gone — act-42 反馈 found the left hand pushed out in front stiff)
        if (A.pressed) {
          this.pendNext = NEXT[cut]; this.pendT = 0.45;
          // act-109: when Qi < 1 bar (cannot enter 藏锋 anyway), queue the next cut on press with 0 release latency
          if (this.qi < QI_COST - 1e-6 && NEXT[cut]) { this.next = NEXT[cut]; this.atkEaten = true; }
        }
        if (this.buf.atk > 0) this.next = NEXT[cut];
        // a press held in the cut: after the blow lands it turns into the stance (the next cut is not queued by a hold)
        if (this.hitDone && holding) { if (this.tryCharge()) break; }
        // cancels: act-109 去黏手 — dash cancels ANYTIME (including wind-up, like Hades / Dead Cells) so dodging is never locked or swallowed
        if (canDash) { const nx = this.hitDone ? NEXT[cut] : cut; if (this.has('keep') && nx) { this.keepNext = nx; this.keepT = TUNE.dashTime + TUNE.linkKeep; } this.buf.dash = 0; this.startDash(w); break; }
        // 近身三镖: after the blow, the dart button = three darts from the left hand straight into the face of the foe
        // (11-17: the cut links stay open TUNE.linkCut after the blow — also through the wind-up of the next cut, so mashing 斩 still lets them in)
        const linkOn = this.hitDone || this.linkT > 0;
        if (linkOn && this.buf.sp > 0 && this.has('cutDart') && this.dartAmmo > 0 && this.dartCd <= 0) { this.buf.sp = 0; this.spUsed = true; this.fanNext = true; this.linkT = 0; this.set('free', 0); this.startDart(w); break; }
        // 挑空斩: after the blow, jump = a rising cut unless jumping over an incoming low attack
        if (canJump && (this.hitDone || (this.linkT > 0 && this.has('launch')))) { this.buf.jump = 0; if (this.has('launch') && !this.airborne && !this.lowThreatNear(w)) this.startLaunch(w); else this.startJump(); break; }
        // 停顿变招: the second spin follows the first at once
        if (cut === 'k3' && this.spinsLeft > 1 && k >= 0.9) { this.spinsLeft--; this.startCut('k3', w, false, true); break; }
        // the next cut waits until this one has played out to cf.chain (the recovery is part of the rhythm)
        const last = sw.imps[sw.imps.length - 1];
        if (this.next && k >= Math.max(last + 0.04, cf.chain)) { const n = this.next as Cut; const sk = A.last > 0 && A.last < TUNE.holdToCharge ? A.last * 0.5 : 0; this.buf.atk = 0; this.startCut(n, w, false, false, false, sk); break; }
        // 11-18 → act-109 操控: once the blow reaches cf.chain, pushing the stick (> 0.35) cleanly cancels the recovery and runs
        if (!this.next && this.buf.atk <= 0 && k >= cf.chain && sl > 0.35 && !holding) { this.spinsLeft = 0; this.set('free', 0); break; }
        if (k >= 1) { if (cut === 'k2' && this.has('pause')) this.pauseT = 0.95; this.spinsLeft = 0; this.set('free', 0); }
        break;
      }
      case 'kick': {
        // a low flying kick: the body shoots on along the dash, the foot lands at KICK_IMP, then it drops and recovers
        const k = this.t / this.dur;
        this.vel.copy(this.dashDir).multiplyScalar(k < 0.38 ? 8.5 : 8.5 * Math.exp(-(k - 0.38) * 9));
        if (!this.kickHit && k >= 0.3) { this.kickHit = true; this.hitDone = true; if ((w.kick?.({ from: this.pos.clone(), dir: this.dashDir.clone(), dmg: Math.round(TUNE.atkDmg * 1.8) }) ?? 0) > 0) this.gainQi(QI_LINK); }
        if (this.kickHit && k > 0.55 && canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (this.t >= this.dur) this.set('free', 0);
        break;
      }
      case 'launch': {
        // the rising cut: a short step in, the blow at LAUNCH_IMP, then up into the air after the foes
        const k = this.t / this.dur; this.vel.copy(this.a.fwd()).multiplyScalar(k < 0.3 ? 2.2 : 0.4);
        if (!this.launchHit && k >= 0.3) {
          this.launchHit = true; this.hitDone = true;
          if ((w.launch?.({ from: this.pos.clone(), yaw: this.a.yaw, range: TUNE.atkRange + 0.5, half: 0.95, dmg: Math.round(TUNE.atkDmg * 1.5) }) ?? 0) > 0) this.gainQi(QI_LINK);
          this.vy = Math.sqrt(2 * this.gravity * 2.3); this.y = Math.max(this.y, 0.01); this.jumps = 1; this.set('air', 99); cue('swishHeavy', 0.8); cue('jump', 0.5);
        }
        break;
      }
      case 'charge': {
        const chargeFull = TUNE.chargeFull;
        const wasK = this.chargeK; this.chargeK = Math.min(1, this.chargeK + dt / chargeFull); m.charge = this.chargeK;
        this.vel.lerp(stick.clone().multiplyScalar(TUNE.heroSpeed * TUNE.stanceSpeed), 1 - Math.exp(-12 * dt));
        if (sl > 0.1) this.a.yaw = Math.atan2(stick.x, stick.z);
        // (11-18: only the frame it fills — the old test held true every frame once full, so the cue, the tint and the ring repeated)
        if (this.chargeK >= 1 && wasK < 1) { cue('bladeRing', 1); this.a.tint(0xfff4d0, 0.4); this.fullT = 0.35; }
        if (canDash) { m.charge = 0; this.buf.dash = 0; this.startDash(w); break; }   // (dashing out of the stance costs no 气)
        // 屏息 (11-17): full, the stance holds only TUNE.stanceHold more — then she lets the breath go and straightens up, the bar spent
        // for nothing, and the button's release does nothing (no camping in the stance waiting for the cue)
        if (this.chargeK >= 1 && B.attack.down) {
          this.heldFull += dt;
          if (this.heldFull >= TUNE.stanceHold) { m.charge = 0; this.qi = Math.max(0, this.qi - QI_COST); this.exhaled = true; this.atkEaten = true; this.set('free', 0); cue('whoosh', 0.3); break; }
        }
        if (!B.attack.down) {
          // the draw: an attack about to land is caught (见切) and the draw goes straight at the attacker; otherwise the long lunge.
          // 11-17: the draw is what costs a bar of 气 — 箭步斩 and 破势 alike (a catch gives nothing back)
          m.charge = 0; this.iaiBonus = false; this.qi = Math.max(0, this.qi - QI_COST);
          // (the world's parry sets iaiBonus for any catch — arrows too, which return no attacker position)
          const caught = w.iaiCatch(TUNE.iaiWin);
          let len = TUNE.relDist * (0.6 + 0.4 * this.chargeK);
          if (caught) { const d = caught.clone().sub(this.pos).setY(0); this.a.yaw = Math.atan2(d.x, d.z); len = Math.max(0.3, Math.min(len, d.length() - 1.0)); }
          else this.aim(w, 6);
          const dir = this.a.fwd();
          this.relFrom.copy(this.pos); this.relTo.copy(this.pos).addScaledVector(dir, len); w.clamp(this.relTo, this.r);
          const dur = 0.42; this.set('rel', dur); this.relSecond = false; this.a.play(new Action('rel', dur, 0.3)); cue('draw', 0.9); cue('swishHeavy', 0.7);
          this.parryT = TUNE.iaiWin; this.iaiBonus = this.iaiBonus || !!caught;
          w.iaiGo?.({ from: this.relFrom.clone(), to: this.relTo.clone(), r: 1.05 }); cue('breath', 1);
        }
        break;
      }
      case 'rel': {
        // 11-18 一闪: she crosses as a streak of light (faster than before: ≈ 0.09 s), white-gold, then stands; the cut opens after the
        // world's held beat (iaiCut), not as she passes
        const k = this.t / this.dur, u = Math.min(1, Math.max(0, (k - 0.08) / 0.22));
        const p = this.relFrom.clone().lerp(this.relTo, 1 - (1 - u) ** 3); this.vel.set(0, 0, 0); this.pos.x = p.x; this.pos.z = p.z;
        this.ghostT -= dt; if (k < 0.36 && this.ghostT <= 0) { this.ghostT = 0.025; fxAfterimage(this.pos.clone(), 1.9, 0xfff0c8, { life: 0.3, glow: 0.7 }); }
        if (!this.hitDone && k >= 0.36) {
          this.hitDone = true; const o = { a: this.relFrom.clone(), b: this.pos.clone(), r: 1.05, dmg: Math.round(TUNE.relDmg * (1 + this.chargeK) * (this.iaiBonus ? 2 : 1) * (this.relSecond ? v(this.perks, 'twinDraw') / 100 : 1)), knock: this.iaiBonus ? 2 : 1.4 };
          if (w.iaiCut && !this.relSecond) w.iaiCut(o); else w.sweep({ ...o, kind: this.relSecond ? 'rel2' : 'rel' });
        }
        const held = !!w.iaiBusy?.();
        // 11-18 秘传 追步: once the first draw's line has opened, she goes again at the next foe near the end of it (a second, shorter
        // streak, cut at once — no second held beat); the stance's bar of 气 pays for both
        if (this.hitDone && !held && !this.relSecond && hasBoon(this.perks, 'twinDraw') && k >= 0.5 && this.startDraw2(w)) break;
        if (this.hitDone && !held && canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (this.hitDone && !held && canJump) { this.buf.jump = 0; this.startJump(); break; }
        // act-109 一闪去黏手: once the slash has opened, chain straight into k1 or walk out (no forced 0.27s recovery freeze)
        if (this.hitDone && !held && k >= 0.44 && this.buf.atk > 0) { this.buf.atk = 0; this.startCut('k1', w); break; }
        if (this.hitDone && !held && k >= 0.48 && sl > 0.4 && (!hasBoon(this.perks, 'twinDraw') || this.relSecond)) { this.set('free', 0); break; }
        if (k >= 1) { if (this.iaiBonus) this.startNoto(); else this.set('free', 0); }
        break;
      }
      case 'noto': {
        // the sheathing is only a flourish: any input breaks it off at once
        this.vel.multiplyScalar(Math.exp(-dt * 14));
        if (sl > 0.15 || A.pressed || this.buf.atk > 0 || this.buf.dash > 0 || this.buf.jump > 0 || this.buf.sp > 0) { this.a.act?.cancel(); this.a.act = null; this.set('free', 0); break; }
        if (!this.notoClicked && this.t >= this.dur * NOTO_CLICK) { this.notoClicked = true; cue('sheathe', 0.7); fxSparks(this.pos.clone().add(V3(Math.cos(this.a.yaw) * 0.28, 0.95, -Math.sin(this.a.yaw) * 0.28)), 0xffe2a8, 7, 1.6); }
        if (this.t >= this.dur) this.set('free', 0);
        break;
      }
      case 'dash': {
        // 穿风斩: 斩 pressed in a ground dash — the dash turns into a cut through everything on its way (on the press, not the release)
        if (A.pressed && !this.airborne) { this.buf.press = 0; this.buf.atk = 0; this.atkEaten = true; this.startDashCut(); break; }
        // 飞踢 (刀谱): 跳 pressed in a ground dash — a flying kick along the dash that sends the first foe flying
        if (B.jump.pressed && this.has('kick') && !this.airborne) { this.buf.jump = 0; this.startKick(); break; }
        // 回身镖: 镖 pressed in a dash — darts thrown back at whoever is behind; the dash goes on
        if (B.special.pressed && this.has('backDart') && !this.dashDarted && this.dartAmmo > 0) { this.buf.sp = 0; this.spUsed = true; this.dashDarted = true; this.backDarts(w); }
        const sp = TUNE.dashDist / TUNE.dashTime; this.vel.copy(this.dashDir).multiplyScalar(sp * (this.t < this.dur * 0.75 ? 1 : 0.4));
        // 11-18 秘传 错身: whoever the dash goes through is cut (show.ts, once a foe a dash) — on the ground only
        if (!this.airborne) w.passing?.({ a: this.dashFrom.clone(), b: this.pos.clone(), n: this.dashN });
        this.ghostT -= dt; if (this.ghostT <= 0) { this.ghostT = 0.035; fxAfterimage(this.pos.clone().setY(this.y), 1.9, 0x5a6aa8, { life: 0.2, glow: 0.25 }); }
        if (this.t >= this.dur) {
          this.vel.multiplyScalar(0.35); this.dashEndAt = this.age;
          if (this.airborne) { this.set('air', 99); this.vy = 0; break; }
          this.set('free', 0); this.dashTailT = TUNE.linkDash;   // (11-17: the dash links stay on a moment after it stops)
          // a dash straight into an attack / a jump: the press during the dash starts it at once
          if (this.buf.atk > 0) { this.buf.atk = 0; if (this.keepOpen) { const n = this.keepNext!; this.keepNext = null; this.keepT = 0; this.startCut(n, w, false, false, true); this.sideCut(w); } else this.startCut('k1', w); }
          else if (this.buf.jump > 0) { this.buf.jump = 0; this.startJump(); }
        }
        break;
      }
      case 'dcut': {
        if (this.t < DCUT_MOVE) {
          this.vel.copy(this.dashDir).multiplyScalar(TUNE.dashCutDist / DCUT_MOVE);
          this.ghostT -= dt; if (this.ghostT <= 0) { this.ghostT = 0.025; fxAfterimage(this.pos.clone(), 1.9, 0x9ad8ff, { life: 0.22, glow: 0.45 }); }
        } else {
          this.vel.multiplyScalar(Math.exp(-dt * 18));
          if (!this.dcutHit) { this.dcutHit = true; if (w.sweep({ a: this.dcutFrom.clone(), b: this.pos.clone(), r: 1.0, dmg: TUNE.dashCutDmg, knock: 1.0, col: 0xbfeaff, kind: 'dcut' }) > 0) this.gainQi(QI_DCUT); }
        }
        if (this.dcutHit && canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (this.dcutHit && canJump) { this.buf.jump = 0; this.startJump(); break; }
        // act-109 去黏手: 穿风斩 can chain smoothly into k1 or move-cancel right after the slash lands
        if (this.dcutHit && this.t >= DCUT_MOVE + 0.06 && this.buf.atk > 0) { this.buf.atk = 0; this.startCut('k1', w); break; }
        if (this.dcutHit && this.t >= DCUT_MOVE + 0.11 && sl > 0.45) { this.set('free', 0); break; }
        if (this.t >= this.dur) this.set('free', 0);
        break;
      }
      case 'hurt': this.vel.multiplyScalar(Math.exp(-dt * 9)); if (this.t >= this.dur) this.set(this.airborne ? 'air' : 'free', this.airborne ? 99 : 0); break;
    }
    // states that don't fly themselves still fall (a hit in the air) — 11-18: 断云, 掠地 and 踏顶 set her height themselves
    if (this.st !== 'air' && this.st !== 'plunge' && this.st !== 'dash' && this.st !== 'acut' && this.st !== 'acutF' && this.st !== 'swoop' && this.st !== 'stomp') this.fall(dt);
    this.move(dt, w);
    const sp = Math.hypot(this.vel.x, this.vel.z), r = Math.min(1, sp / TUNE.heroSpeed);
    { // 11-18 3C: what the body shows of the controls
      this.skidT = Math.max(0, this.skidT - dt); this.brakeT = Math.max(0, this.brakeT - dt); this.startT = Math.max(0, this.startT - dt); this.readyT = Math.max(0, this.readyT - dt);
      if (this.st === 'charge' || this.st === 'rel' || this.st === 'dcut' || this.st === 'hurt') this.readyT = 2.2;
      let dy = this.a.yaw - this.prevYaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; this.prevYaw = this.a.yaw;
      const bank = this.st === 'free' && dt > 0 ? Math.max(-0.3, Math.min(0.3, dy / dt * 0.05)) : 0;
      m.bank += (bank - m.bank) * Math.min(1, dt * 10);
      m.skid = this.skidT / 0.18; m.brake = this.brakeT / 0.3; m.start = this.startT / 0.16;
      m.ready = this.st === 'free' ? Math.min(1, this.readyT / 0.6) : 0;
      m.coil = this.st === 'free' ? Math.min(1, this.coilT / 0.12) : 0;
      if (this.st !== 'free') this.coilT = 0;
      this.prevSl = Math.min(1, w.stickWorld().length());
    }
    m.run = this.st === 'free' ? r : 0; m.phase += sp * (3.0 - 0.5 * r) * dt;
    m.air = this.y; m.rise = this.v0 > 0 ? this.vy / this.v0 : 0;
    m.takeoff = this.airborne && this.jumps === 1 && this.airT < 0.16 ? 1 - this.airT / 0.16 : 0;
    m.squat = this.st === 'squat' ? Math.min(1, this.t / Math.max(1e-3, this.dur)) : 0; m.airT = this.airborne && this.jumps === 1 ? this.airT : 9;
    m.lean = this.airborne ? Math.max(0, Math.min(1, (this.vel.x * Math.sin(this.a.yaw) + this.vel.z * Math.cos(this.a.yaw)) / TUNE.heroSpeed)) : 0;
    m.flip = this.flipT >= 0 && this.airborne ? Math.min(1, this.flipT / FLIP_T) : 0;
    m.dart = this.dartT >= 0 ? Math.min(1, this.dartT / DART_T) : 0; m.dartBack = this.dartBack ? 1 : 0;
    m.creep = this.st === 'charge' ? Math.min(1, sp / Math.max(0.3, TUNE.heroSpeed * TUNE.stanceSpeed)) : 0;
    if (this.st !== 'charge') m.charge = 0;
  }
  private fall(dt: number) {
    if (this.y <= 0) { this.y = 0; return; }
    this.vy -= this.gravAt(this.vy) * dt; this.y += this.vy * dt; if (this.y <= 0) { this.y = 0; this.vy = 0; }
  }
  private landed(w: HeroWorld) {
    // 11-18: the landing as hard as the fall was — a full jump sinks deep and rises slowly; running on, a shallow dip she runs out of
    const m = motionOf(this.a), hard = Math.min(1, Math.max(0.3, -this.vy / 12)), run = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / TUNE.heroSpeed);
    m.landW = hard * (1 - 0.5 * run); m.landDur = 0.1 + 0.18 * m.landW; m.land = 1;
    this.y = 0; this.vy = 0; this.jumps = 0; this.flipT = -1; this.lastStomp = null;
    dustBlocks(this.pos.clone(), Math.round(4 + 6 * m.landW)); cue('land', 0.35 + 0.6 * m.landW);
    this.set('free', 0);
    // a press just before touching down: the cut / the next jump starts on landing
    if (this.buf.atk > 0) { this.buf.atk = 0; this.startCut('k1', w); }
    else if (this.buf.jump > 0) { this.buf.jump = 0; this.startJump(); }
  }
  private startCharge() { this.set('charge', 99); this.chargeK = 0; this.heldFull = 0; this.next = null; this.pendT = 0; this.linkT = 0; this.dashTailT = 0; this.a.act?.cancel(); this.a.act = null; cue('sheathe', 0.5); }
  /** 11-17: the stance needs a bar of 气 in hand; without it the hold is refused once (the button shakes, dull red) and its release
   *  does nothing. Returns whether the stance began */
  private tryCharge() {
    if (this.qi >= QI_COST - 1e-6) { this.startCharge(); return true; }
    this.atkEaten = true; this.qiDenied = true; return false;
  }
  /** a held dart volley's id (迎面镖 / 回身镖): its first strike fills 气 */
  private volley = 0;
  /** 飞镖 (act-27): auto (aim = null) = the nearest foe in range anywhere round the hero, a little in favour of the stick / facing;
   *  aimed = straight along aim, bent onto a foe only if one is within a narrow cone of it. Returns the direction from the left hand */
  private dartAim(w: HeroWorld, from: THREE.Vector3, aim: THREE.Vector3 | null = null) {
    const s = w.stickWorld(), want = aim ? aim.clone().setY(0).normalize() : s.lengthSq() > 0.04 ? s.clone().normalize() : this.a.fwd().setY(0).normalize();
    let best: Foe | null = null, bd = 1e9;
    for (const f of w.foes) {
      if (f.st === 'dead') continue;
      const d = f.pos.clone().sub(this.pos).setY(0), l = d.length(); if (l > TUNE.dartRange || l < 1e-3) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, d.dot(want) / l))); if (aim && ang > 0.22) continue;
      const score = aim ? ang * 10 + l * 0.05 : l * (1 + ang * 0.25); if (score < bd) { bd = score; best = f; }
    }
    return best ? best.a.chest().sub(from).normalize() : want.clone().setY(-0.03).normalize();
  }
  /** act-27: where an aimed throw would go right now (the aim line in show.ts), and whether it bends onto a foe */
  aimPreview(w: HeroWorld) { const from = this.pos.clone().add(V3(0, 1.3, 0)), d = this.dartAim(w, from, this.aimDir); const onFoe = d.angleTo(this.aimDir.clone().setY(-0.03).normalize()) > 0.01; return { dir: d.setY(0).normalize(), onFoe }; }
  /** the throw: the arm animation starts now, the dart leaves the hand a moment later (update) */
  private startDart(w: HeroWorld, aim: THREE.Vector3 | null = null) {
    this.dartT = 0; this.dartGone = false; this.dartBack = false; this.dartCd = TUNE.dartCd; this.useDart(); this.aiming = false;
    // standing still, the hero turns to the throw; running or in the air it keeps its way
    const from = this.pos.clone().add(V3(0, 1.3, 0)); this.dartDir.copy(this.dartAim(w, from, aim));
    if (Math.hypot(this.vel.x, this.vel.z) < 1 && !this.airborne) this.a.yaw = Math.atan2(this.dartDir.x, this.dartDir.z);
  }
  /** 穿风斩: on from where the dash is now, low and fast along the same way; the cut lands when the run stops (show.ts sweep) */
  private startDashCut() {
    this.dcutFrom.copy(this.pos); this.set('dcut', DCUT_T); this.dcutHit = false; this.ghostT = 0; this.dashCd = TUNE.dashCd * Math.max(0.45, this.dashCdMul);
    this.a.yaw = Math.atan2(this.dashDir.x, this.dashDir.z); this.a.play(new Action('rel', DCUT_T, 0.32)); cue('swishHeavy', 1); cue('dash', 0.6);
  }
  /** 回身镖: three darts (five with 散手 · 三叶) flung back at the nearest foe behind the dash, or straight back */
  private backDarts(w: HeroWorld) {
    const back = this.dashDir.clone().multiplyScalar(-1), from = this.pos.clone().add(V3(0, 1.3, 0));
    let best: Foe | null = null, bd = 1e9;
    for (const f of w.foes) {
      if (f.st === 'dead') continue;
      const d = f.pos.clone().sub(this.pos).setY(0), l = d.length(); if (l > TUNE.dartRange || l < 1e-3) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, d.dot(back) / l))); if (ang > 1.4) continue;
      const s = l * (1 + ang); if (s < bd) { bd = s; best = f; }
    }
    const dir = best ? best.a.chest().sub(from).normalize() : back.clone().setY(-0.03).normalize();
    const hand = this.handL(), n = v(this.perks, 'darts3'), spread = n >= 5 ? fanOf(5, 0.18) : [-0.18, 0, 0.18];
    const link = ++this.volley; for (const a of spread) w.dart({ from: hand.clone(), dir: dir.clone().applyAxisAngle(V3(0, 1, 0), a), link });
    this.dartT = 0; this.dartGone = true; this.dartBack = true; this.dartCd = TUNE.dartCd; this.useDart(); cue('dartThrow', 0.8);
  }
  /** 追影: smoke here, the hero at the marked foe's near side facing it, a heavy first cut */
  private startChase(f: Foe, w: HeroWorld) {
    const from = this.pos.clone().setY(0), d = f.pos.clone().sub(from).setY(0), l = d.length() || 1; d.divideScalar(l);
    const to = f.pos.clone().addScaledVector(d, -(f.d.r + 0.85)).setY(0); w.clamp(to, this.r);
    w.chase({ from, to, foe: f });
    this.pos.x = to.x; this.pos.z = to.z; this.y = 0; this.vy = 0; this.jumps = 0; this.flipT = -1; this.vel.set(0, 0, 0); this.dartT = -1;
    this.a.yaw = Math.atan2(d.x, d.z); this.inv = Math.max(this.inv, 0.12);
    this.startCut('k1', w, true);
  }
  /** act-19 飞踢 */
  private kickHit = false;
  private startKick() {
    this.set('kick', 0.52); this.kickHit = false; this.a.yaw = Math.atan2(this.dashDir.x, this.dashDir.z);
    this.a.play(new Action('kick', 0.52, 0.3)); cue('swishHeavy', 0.6); cue('jump', 0.4);
  }
  get canKick() { return (this.st === 'dash' || this.inDashTail) && !this.airborne && this.has('kick'); }
  /** 11-17: just after a dash stopped on the ground, the dash links still on */
  private get inDashTail() { return this.st === 'free' && this.dashTailT > 0 && !this.airborne; }
  /** 游身斩 on offer (a dash out of the combo, the next cut held for it) */
  private get keepOpen() { return this.keepT > 0 && !!this.keepNext && this.has('keep'); }
  /** 穿风斩 open: a ground dash, or just after one (unless 游身斩 is on offer then) */
  get canDashCut() { return (this.st === 'dash' && !this.airborne) || (this.inDashTail && !this.keepOpen); }
  /** act-19 挑空斩 */
  private startLaunch(w: HeroWorld) {
    this.aim(w); this.set('launch', 0.42); this.launchHit = false; this.next = null; this.pendT = 0;
    this.a.play(new Action('k2', 0.42, 0.3)); cue('swish', 0.6);
  }
  // ------------------------------------------------------------ 11-18 四本新刀谱
  /** 断云: up at him — she faces him and holds a little above his middle, three quick cuts in the air (ninjaAct airCombo) */
  private startAirCut(f: Foe, w: HeroWorld) {
    this.acutFoe = f; this.acutY = Math.max(1.5, Math.min(2.6, Math.max(this.y, f.pos.y))); this.vy = 0; this.vel.set(0, 0, 0); this.jumps = 2; this.flipT = -1;
    const d = f.pos.clone().sub(this.pos).setY(0); if (d.lengthSq() > 1e-4) this.a.yaw = Math.atan2(d.x, d.z);
    this.set('acut', ACUT_T); this.a.play(new Action('acut', ACUT_T, ACUT_HITS[0] / ACUT_T)); this.next = null; this.pendT = 0;
    w.airHold?.(f, this.y); cue('breath', 0.5);
  }
  /** 断云's third cut: from the blade raised overhead (where the air cuts left it), down to the ground with him */
  private startAirCutDown() {
    const fall = ACUTF_HANG + this.y / PLUNGE_V + 0.03, hang = ACUTF_HANG / fall;
    this.set('acutF', 99); this.a.play(new Action('acutF', fall, hang, { hang })); cue('breath', 0.8);
  }
  /** 掠地: a dive along the stick (or ahead) down to the ground — on past the first one in the way so it lands behind them */
  private startSwoop(w: HeroWorld) {
    const s = w.stickWorld(), dir = s.lengthSq() > 0.04 ? s.normalize() : this.a.fwd().setY(0).normalize();
    // the first foe ahead within reach (a cone of ±0.5 rad): land a step past him; nobody: the dive goes a dash's length
    let best: Foe | null = null, bl = 1e9;
    for (const f of w.foes) {
      if (f.st === 'dead') continue;
      const d = f.pos.clone().sub(this.pos).setY(0), l = d.length(); if (l < 0.3 || l > SWOOP_REACH) continue;
      if (d.dot(dir) / l < Math.cos(0.5)) continue; if (l < bl) { bl = l; best = f; }
    }
    if (best) { const d = best.pos.clone().sub(this.pos).setY(0).normalize(); dir.copy(d); }
    const len = Math.min(SWOOP_MAX, best ? bl + best.d.r + 1.1 : TUNE.dashDist * 1.1);
    this.dashDir.copy(dir); this.a.yaw = Math.atan2(dir.x, dir.z);
    this.swoopFrom.copy(this.pos); this.swoopTo.copy(this.pos).addScaledVector(dir, len); w.clamp(this.swoopTo, this.r); this.swoopY0 = this.y;
    this.set('swoop', SWOOP_T); this.a.play(new Action('swoop', SWOOP_T, SWOOP_MOVE / SWOOP_T)); this.ghostT = 0; this.vy = 0; this.next = null; this.pendT = 0;
    this.dashCd = TUNE.dashCd * Math.max(0.45, this.dashCdMul);
    cue('dash', 0.8); cue('swishHeavy', 0.8);
  }
  /** act-118: does a foe lie in front along the air-dash stick direction? (if not, air-dash stays a clean defensive dodge!) */
  private hasSwoopTarget(w: HeroWorld): boolean {
    const s = w.stickWorld(), dir = s.lengthSq() > 0.04 ? s.clone().normalize() : this.a.fwd().setY(0).normalize();
    for (const f of w.foes) {
      if (f.st === 'dead') continue;
      const d = f.pos.clone().sub(this.pos).setY(0), l = d.length();
      if (l >= 0.3 && l <= SWOOP_REACH + 1.0 && d.dot(dir) / l >= Math.cos(0.75)) return true;
    }
    return false;
  }
  /** act-118: is a nearby foe winding up a jumpable low attack right now? (keeps Jump defensive instead of hijacking into 挑云) */
  private lowThreatNear(w: HeroWorld): boolean {
    return w.foes.some(f => f.st !== 'dead' && lowAttack(f) && f.pos.distanceTo(this.pos) < 5.5);
  }
  /** 牵红: the red cord to the dart in him — a light one is pulled to just in front of her; a heavy one (力士, 渠帅, an elite) stays and
   *  she is pulled to him instead. The dart is spent, its throw costs nothing more */
  private startReel(t: { foe: Foe; heavy: boolean }, w: HeroWorld) {
    const f = t.foe, d = f.pos.clone().sub(this.pos).setY(0), l = d.length() || 1; d.divideScalar(l); this.a.yaw = Math.atan2(d.x, d.z);
    this.reelSelf = t.heavy; this.reelFrom.copy(this.pos);
    if (t.heavy) { this.reelTo.copy(f.pos).addScaledVector(d, -(f.d.r + 0.75)).setY(0); w.clamp(this.reelTo, this.r); }
    const to = this.pos.clone().addScaledVector(d, this.r + f.d.r + 0.45).setY(0); w.clamp(to, f.d.r);
    const dur = t.heavy ? Math.min(0.42, 0.18 + l * 0.03) : REEL_T;
    w.reel?.({ foe: f, to, dur: t.heavy ? dur : REEL_T * 0.7, dmg: Math.max(4, Math.round(TUNE.atkDmg * 0.9)), self: t.heavy });
    this.set('reel', dur); this.a.play(new Action('reel', dur, 0.25, { self: t.heavy })); this.next = null; this.pendT = 0; this.dartT = -1;
    this.gainQi(QI_LINK); cue('dartThrow', 0.5);
  }
  /** 踏顶: onto his head and down hard (not the same head twice before she lands) */
  private startStomp(f: Foe) {
    this.stompFoe = f; this.lastStomp = f; this.stompFrom.copy(this.pos); this.stompY0 = this.y; this.stompTop = Math.max(0.5, Math.min(2.2, f.a.height * 0.94 + f.pos.y));
    this.set('stomp', STOMP_T); this.a.play(new Action('stomp', STOMP_T, STOMP_UP / STOMP_T)); this.flipT = -1; this.next = null;
  }
  private lastStomp: Foe | null = null;
  /** 断云 on offer: someone up in the air within reach of her up there */
  get canAirCut() { return this.st === 'air' && !!this.airTgt; }
  get canSwoop() { return this.st === 'air' && this.airborne && this.has('swoop') && this.dashCd <= 0; }
  get canReel() { return !!this.reelTgt; }
  get canStomp() { return this.st === 'air' && !!this.stompTgt; }
  /** act-19 游身不断招: the cut out of the dodge comes from the side — a pale streak along the step, the cut aimed at the nearest foe */
  private sideCut(w: HeroWorld) {
    const f = this.aim(w); fxAfterimage(this.pos.clone(), 1.9, 0x9ad8ff, { life: 0.3, glow: 0.45 }); cue('swish', 0.5);
    if (f) { const d = f.pos.clone().sub(this.pos).setY(0); if (d.lengthSq() > 1e-4) this.a.yaw = Math.atan2(d.x, d.z); }
  }
  private get cutting() { return this.st === 'k1' || this.st === 'k2' || this.st === 'k3' || this.st === 'k4' || this.st === 'k5'; }
  /** act-18 / 19 hints: what the buttons can do right now (each only when its 刀谱 is learnt) */
  get canBackDart() { return (this.st === 'dash' || this.inDashTail) && this.has('backDart') && !this.dashDarted && this.dartAmmo > 0; }
  get canDoubleJump() { return this.st === 'air' && this.has('dbl') && this.jumps < 2; }
  /** the cut links: after a blow, for TUNE.linkCut (11-17), in a cut or just after one */
  private get cutLinkOn() { return ((this.cutting && this.hitDone) || this.linkT > 0) && (this.cutting || this.st === 'free'); }
  get canLaunch() { return this.cutLinkOn && this.has('launch') && !this.airborne; }
  get canCutDart() { return this.cutLinkOn && this.has('cutDart') && this.dartAmmo > 0 && this.dartCd <= 0; }
  get canKeep() { return this.keepOpen && (this.st === 'free' || this.st === 'dash'); }
  get canPause() { return this.st === 'free' && this.pauseT > 0 && this.pauseT < 0.8 && this.has('pause'); }
  /** a dart leaves the hand: one fewer; the last one starts the reload */
  private useDart() { this.dartAmmo = Math.max(0, this.dartAmmo - 1); if (this.dartAmmo === 0) this.dartReload = TUNE.dartReload * Math.max(0.4, this.dartReloadMul); }
  /** 收刀 after 见切: a flick of the blade (血振), across to the scabbard at the left hip, pushed home with a click, the hand on the hilt */
  private notoClicked = false;
  /** act-19 hid the blade once the sword was "in its sheath" (藏锋 / 归鞘). act-24 (user: 「收刀的时候刀怎么看不见了？」): the fine heroine
   *  has no scabbard and holds the blade along the outside of her left hip, so it stays in sight the whole time */
  private showBlade() {
    const b = (this.a.bones as Record<string, THREE.Object3D | undefined>).blade; if (!b) return;
    b.visible = true;
  }
  startNoto() { this.set('noto', NOTO_T); this.notoClicked = false; this.a.play(new Action('noto', NOTO_T, NOTO_CLICK)); }
  /** 11-18 秘传 追步: the second draw — at the next foe: the nearest live one within 6 m of where the first draw ended that was not on the
   *  first draw's line (one behind her counts nearly double); only if there is none, one that was. Up to 0.75 of the stance's lunge; a
   *  gold-white streak again, the cut sweeps at once. False: nobody to go at */
  private startDraw2(w: HeroWorld) {
    let best: Foe | null = null, bd = 1e9; const fwd = this.a.fwd(), ab = this.pos.clone().sub(this.relFrom).setY(0), L2 = Math.max(1e-4, ab.lengthSq());
    for (const f of w.foes) {
      if (f.st === 'dead') continue;
      const d = f.pos.clone().sub(this.pos).setY(0), l = d.length(); if (l > 6 || l < 0.4) continue;
      const t = Math.max(0, Math.min(1, f.pos.clone().sub(this.relFrom).setY(0).dot(ab) / L2)), q = this.relFrom.clone().addScaledVector(ab, t);
      const onLine = Math.hypot(f.pos.x - q.x, f.pos.z - q.z) <= 1.05 + f.d.r;
      const s = l * (d.dot(fwd) / (l || 1) < -0.3 ? 1.8 : 1) + (onLine ? 100 : 0); if (s < bd) { bd = s; best = f; }
    }
    if (!best) return false;
    const d = best.pos.clone().sub(this.pos).setY(0), len = Math.max(0.6, Math.min(TUNE.relDist * 0.75, d.length() + 0.9));
    this.a.yaw = Math.atan2(d.x, d.z);
    this.relFrom.copy(this.pos); this.relTo.copy(this.pos).addScaledVector(this.a.fwd(), len); w.clamp(this.relTo, this.r);
    const dur = 0.36; this.set('rel', dur); this.relSecond = true; this.a.play(new Action('rel', dur, 0.3)); cue('draw', 0.8); cue('swishHeavy', 0.8);
    w.iaiGo?.({ from: this.relFrom.clone(), to: this.relTo.clone(), r: 1.05, soft: true });
    return true;
  }
  /** where the left hand is now (the dart's start) */
  private handL() { const b = this.a.bones?.offhand ?? this.a.bones?.foreL; return b ? b.localToWorld(V3(0, 0, 0)) : this.pos.clone().add(V3(0, 1.25, 0)).addScaledVector(V3(Math.cos(this.a.yaw), 0, -Math.sin(this.a.yaw)), 0.3); }
  private move(dt: number, w: HeroWorld) {
    this.pos.addScaledVector(this.vel, dt);
    // high in the air the hero passes over the foes; on the ground (and in a dash or the lunge) the usual push-out
    if (this.y < 0.6) for (const f of w.foes) if (f.st !== 'dead') { const d = this.pos.clone().sub(f.pos).setY(0), l = d.length(), mm = this.r + f.d.r; if (l < mm && l > 1e-4 && this.st !== 'dash' && this.st !== 'rel' && this.st !== 'dcut' && this.st !== 'swoop' && !(this.st === 'reel' && this.reelSelf)) this.pos.addScaledVector(d, (mm - l) / l * 0.6); }
    w.clamp(this.pos, this.r);
  }
}
