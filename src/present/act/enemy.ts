// 敌人（动作原型）：每种一套状态机，出招前一定先在地上亮预警（tele.ts），预警长满的那一帧就是打击帧。
//   旧的四种（日式占位，房间换完前留着）：山贼（扇形劈）、山犬（长条扑咬）、弓手（细线瞄准放箭）、山贼头目（扇形重劈 / 前方砸地，有架势）。
//   地域一「黄巾残村」（模型在 foes/hj_models.ts）：
//     黄巾刀手：同山贼，扇形劈，挨打硬直。精英：连劈两刀（第二刀反手、重新瞄准）。
//     黄巾力士：慢、有架势；前方砸地（圆，能跳过，白横纹）和大横扫（宽扇形）。精英：砸地后一圈冲击波往外扩（能跳过）。
//     符水道士：保持 6～8 米，人近了后撤；放符火（慢速、微追踪的纸符火球，飞到头或碰到人炸一小圈，炸之前地上先亮圈），
//               能像箭一样被刀砍回去（回去的炸敌人）。精英：一次三张扇形散开。
//     流民：成群、弱、快、短戳（小长条），没有架势，没有精英。
//     黄巾弓手 / 猎犬：同弓手 / 山犬。精英：三箭齐射 / 连扑两次。
//     黄巾渠帅（首领，两阶段）：扇形重扫、突刺（长条）、雷法（举戟招三道雷：主角脚下和身边三个圈长满后落雷）；
//               半血时怒吼（短暂无敌、黄白光），之后更快，雷改成朝主角一条线的一串圈，每 8 秒从场边叫两个流民。
//   精英（spawnFoe 的 elite）：血 +80%、大 15%、金边 / 发光黄巾尾、起手快一点、每种多一招。
// 同时出手的敌人有上限（TUNE.maxAttackers，流民算半个），其余的绕着你走位，场面读得清。
// 能跳过去的「低招」：犬的扑咬、头目 / 力士的砸地、力士精英的冲击波；预警带白色横纹（tele.ts），主角离地够高时打不中。
// 木人桩（练武场）：不动、不出招、打不死，挨打会晃。
// 箭：被刀砍到就随机弹飞（show.ts 定方向），弹飞的箭打着转、拖金光，能打中敌人。符火、雷、冲击波也挂在 w.arrows 里（雷和冲击波
// 标成 friendly，show.ts 的刀就不会去「砍」它们）。
import * as THREE from 'three';
import { V3, scene, R } from '../engine/world';
import { BattleActor } from '../bestiary/battle';
import { CELL } from '../bestiary/kit';
import '../ronin/models';   // registers the old foe models (jp_bandit / jp_dog / jp_archer / jp_bandit_chief) in the bestiary ROSTER
import './foes/hj_models';  // registers the 黄巾 foe models (hj_*) in the bestiary ROSTER
import './foes/hj_poses';
import { Action } from '../actors/rig';
import { Tele, inside, HOT, type TeleShape } from './tele';
import { TUNE } from './tune';
import { toon } from '../look/toon';
import { cue } from '../../audio/cues';
import { shake, clock } from '../engine/clock';
import { fxSparks, fxSmoke, fxRing, fxGlow, fxEmbers, fxFlare, fxChips, trailSeg } from '../fx/fx';
import { fxBolt, fxShock } from '../fx/skillFx';
import { ROLE_AI, type ThinkCtx } from './foes/roles';

export type EKind = 'bandit' | 'dog' | 'archer' | 'chief' | 'dummy' | 'hj_blade' | 'hj_brute' | 'hj_taoist' | 'hj_mob' | 'hj_archer' | 'hj_hound' | 'hj_boss'
  // wp/regB (第四关 · 锁江 / 第五关 · 许都雪): their foes live in foes/r45_ai.ts and register themselves into EDEFS (role 'ext')
  | 'wl_spear' | 'wl_chain' | 'wl_oil' | 'wl_xbow' | 'wl_diver' | 'wl_shield' | 'wl_boss' | 'cx_club' | 'cx_sword' | 'cx_shade' | 'cx_guard' | 'cx_zhu' | 'cx_boss'
  // 11-18 (一局五关): the later regions' foes, registered from their own files (foes/roles.ts ROLE_AI + addFoes) — any id works here
  | (string & {});
/** what the AI does (the old kinds and their 黄巾 counterparts share one); 'ext' = driven by FOE_AI[kind] (regions four and five);
 *  any other string = a region role in foes/roles.ts ROLE_AI (regions two and three) */
type Role = 'blade' | 'hound' | 'archer' | 'chief' | 'brute' | 'taoist' | 'mob' | 'boss' | 'dummy' | 'ext' | (string & {});
export interface EDef { model: string; hp: number; r: number; speed: number; mass: number; poise: number; gold: number; name: string; role: Role;
  /** the elite look's model (kinds without one have no elite) */ elite?: string; /** other looks picked at random */ alt?: string[];
  /** a region boss: the long bar at the top, the banner, the big death */ boss?: boolean; /** the banner's second line */ tag?: string;
  /** wp/regB: counts as half an attacker (a crowd foe, like the 流民) */ half?: boolean;
  /** 11-18: counts as this many attackers toward TUNE.maxAttackers (the crowds: 0.5) */ weight?: number;
  /** 11-18: a line it says over its head when it comes in (a boss), and its own bark lines (barks.ts) */ intro?: string; barks?: string[] }
/** act-114 第四关曹军水寨 / 第五关崔府门客战斗喊话（暗袭系水鬼与死士保持静默） */
const BARK_WL = ['护住主舰，别让瞎子过桥！', '火船靠过来了，快砍铁索！', '强弩压住甲板！', '放箭，把那白发贼射下江！', '曹军水师，结盾迎敌！', '哪来的盲眼刺客，拦下她！', '甩钩索，扯进江里！', '泼火油，烧死这疯子！'];
const BARK_CX = ['何人夜闯司空府！', '拿下这蒙眼刺客，重重有赏！', '文家刀？！快报长史大人！', '结剑阵，莫让她近阁门！', '瞎子也敢擅闯崔府？找死！', '百辟刀卫，封死长廊！', '击筑起音，乱她耳力！', '雪夜行刺，留她不得！'];
export const EDEFS: Record<EKind, EDef> = {
  bandit: { model: 'jp_bandit', hp: 40, r: 0.42, speed: 2.7, mass: 1, poise: 0, gold: 3, name: '山贼', role: 'blade' },
  dog: { model: 'jp_dog', hp: 24, r: 0.45, speed: 4.2, mass: 0.7, poise: 0, gold: 2, name: '山犬', role: 'hound' },
  archer: { model: 'jp_archer', hp: 28, r: 0.42, speed: 2.6, mass: 0.9, poise: 0, gold: 3, name: '弓手', role: 'archer' },
  chief: { model: 'jp_bandit_chief', hp: 260, r: 0.8, speed: 1.9, mass: 3.2, poise: 46, gold: 20, name: '山贼头目', role: 'chief', boss: true, tag: '架势被打空才会晕' },
  dummy: { model: 'act_dummy', hp: 999, r: 0.45, speed: 0, mass: 99, poise: 0, gold: 0, name: '木人桩', role: 'dummy' },
  hj_blade: { model: 'hj_blade', hp: 48, r: 0.44, speed: 2.8, mass: 1, poise: 0, gold: 4, name: '黄巾刀手', role: 'blade', elite: 'hj_blade_e' },
  hj_brute: { model: 'hj_brute', hp: 115, r: 0.7, speed: 2.0, mass: 2.6, poise: 34, gold: 10, name: '黄巾力士', role: 'brute', elite: 'hj_brute_e' },
  hj_taoist: { model: 'hj_taoist', hp: 34, r: 0.42, speed: 2.5, mass: 0.9, poise: 0, gold: 5, name: '符水道士', role: 'taoist', elite: 'hj_taoist_e' },
  hj_mob: { model: 'hj_mob', hp: 18, r: 0.36, speed: 3.7, mass: 0.6, poise: 0, gold: 2, name: '流民', role: 'mob', alt: ['hj_mob_b'] },
  hj_archer: { model: 'hj_archer', hp: 32, r: 0.44, speed: 2.6, mass: 0.9, poise: 0, gold: 4, name: '黄巾弓手', role: 'archer', elite: 'hj_archer_e' },
  hj_hound: { model: 'hj_hound', hp: 28, r: 0.45, speed: 4.3, mass: 0.7, poise: 0, gold: 3, name: '猎犬', role: 'hound', elite: 'hj_hound_e' },
  hj_boss: { model: 'hj_boss', hp: 420, r: 0.85, speed: 2.0, mass: 3.6, poise: 64, gold: 40, name: '黄巾渠帅 · 石雷', role: 'boss', boss: true, tag: '苍天已死 · 黄天当立' },
  // wp/regB — 第四关 · 锁江（乌林曹军水寨）: names by agy; the AI is foes/r45_ai.ts (FOE_AI), the models foes/r45_models.ts
  wl_spear: { model: 'wl_spear', hp: 22, r: 0.4, speed: 3.4, mass: 0.8, poise: 0, gold: 2, name: '执矛水卒', role: 'ext', half: true, alt: ['wl_spear_b'], barks: BARK_WL },
  wl_chain: { model: 'wl_chain', hp: 58, r: 0.48, speed: 2.6, mass: 1.3, poise: 0, gold: 5, name: '拽索手', role: 'ext', elite: 'wl_chain_e', barks: BARK_WL },
  wl_oil: { model: 'wl_oil', hp: 34, r: 0.44, speed: 2.7, mass: 0.9, poise: 0, gold: 4, name: '掷火卒', role: 'ext', elite: 'wl_oil_e', barks: BARK_WL },
  wl_xbow: { model: 'wl_xbow', hp: 36, r: 0.44, speed: 2.4, mass: 0.9, poise: 0, gold: 4, name: '楼船弩士', role: 'ext', elite: 'wl_xbow_e', barks: BARK_WL },
  wl_diver: { model: 'wl_diver', hp: 40, r: 0.44, speed: 3.6, mass: 0.9, poise: 0, gold: 5, name: '没水鬼', role: 'ext', elite: 'wl_diver_e' },
  wl_shield: { model: 'wl_shield', hp: 90, r: 0.58, speed: 2.2, mass: 2.0, poise: 0, gold: 7, name: '执楯刀士', role: 'ext', elite: 'wl_shield_e', barks: BARK_WL },
  wl_boss: { model: 'wl_boss', hp: 640, r: 0.6, speed: 2.4, mass: 3.0, poise: 40, gold: 60, name: '督造少监 · 周默', role: 'ext', boss: true, tag: '机关算尽，只求活' },
  // wp/regB — 第五关 · 许都雪（崔府深宅）
  cx_club: { model: 'cx_club', hp: 26, r: 0.4, speed: 3.5, mass: 0.8, poise: 0, gold: 2, name: '持杖僮奴', role: 'ext', half: true, alt: ['cx_club_b'], barks: BARK_CX },
  cx_sword: { model: 'cx_sword', hp: 64, r: 0.44, speed: 3.0, mass: 1.1, poise: 0, gold: 6, name: '门下剑客', role: 'ext', elite: 'cx_sword_e', barks: BARK_CX },
  cx_shade: { model: 'cx_shade', hp: 38, r: 0.42, speed: 4.2, mass: 0.9, poise: 0, gold: 6, name: '匿影死士', role: 'ext', elite: 'cx_shade_e' },
  cx_guard: { model: 'cx_guard', hp: 96, r: 0.5, speed: 2.6, mass: 1.6, poise: 30, gold: 8, name: '百辟刀卫', role: 'ext', elite: 'cx_guard_e', barks: BARK_CX },
  cx_zhu: { model: 'cx_zhu', hp: 30, r: 0.42, speed: 2.6, mass: 0.9, poise: 0, gold: 5, name: '击筑客', role: 'ext', elite: 'cx_zhu_e', barks: BARK_CX },
  cx_boss: { model: 'cx_boss', hp: 960, r: 0.6, speed: 2.6, mass: 3.0, poise: 50, gold: 80, name: '司空长史 · 崔玄', role: 'ext', boss: true, tag: '弹指落子，定生死' },
};
/** wp/regB: the behaviour of a role-'ext' foe (regions four and five). Filled by foes/r45_ai.ts when it is imported (the region files
 *  import it); enemy.ts only calls in. Every hook is optional; what a hook does not take over runs the usual way (the wind-up's
 *  tracking, the strike's area / lunge test, the recover). */
export interface FoeAI {
  /** free movement and choosing an attack (instead of think) */ think(f: Foe, w: FoeWorld, dt: number, dist: number, dir: THREE.Vector3, yawTo: number): void;
  /** every frame before the state machine (hiding, auras, phases, timers); return true to skip the rest of the frame */ tick?(f: Foe, w: FoeWorld, dt: number): boolean | void;
  /** during the wind-up (aim tracking); return true when it handled the aim itself */ windup?(f: Foe, w: FoeWorld, dt: number, p: number, yawTo: number): boolean | void;
  /** the blow lands; return true when it handled the strike itself (missiles, pulls) */ strike?(f: Foe, w: FoeWorld): boolean | void;
  /** a blow of the hero's is about to land on it (from = where it came from; heavy = a blow that breaks a guard; dart = a thrown dart):
   *  return true to turn it aside (a shield, a parry). Called by regions/r45_hook.ts before the game's hit (so a turned blow shows no
   *  blood and no number) */ guard?(f: Foe, from: THREE.Vector3, o: { heavy: boolean; dart: boolean }): boolean;
  /** the recover length after a blow (s) */ recover?(f: Foe): number;
  /** a follow-up after the strike (the combo): start the next attack and return true, or false to recover */ follow?(f: Foe, w: FoeWorld, yawTo: number): boolean;
  /** every frame after the state machine (a foe that took over the frame in tick gets it too) */ post?(f: Foe, w: FoeWorld, dt: number): void;
  /** its attack was broken off by the hero (破势 caught it, 一闪 pinned it); wasAttacking = it was mid-attack */ interrupted?(f: Foe, wasAttacking: boolean): void;
  /** what a blow is multiplied by right now (a disarmed guard takes double) */ taken?(f: Foe): number;
}
export const FOE_AI: Partial<Record<EKind, FoeAI>> = {};
/** wp/regB: per-foe state the 'ext' AIs keep (hidden, pulled, the boss's machinery …) */
export const FOE_X = new WeakMap<Foe, Record<string, number>>();
export const fx_ = (f: Foe) => { let o = FOE_X.get(f); if (!o) { o = {}; FOE_X.set(f, o); } return o; };
/** wp/regB: a foe the hero cannot see or target right now (a diver under the planks, a shade in its smoke) — the hero's aim, the
 *  darts, the HUD bars and the contact shadows skip it; blades still find it where it is (a cut on the ripples drives it out) */
export const hiddenFoe = (f: Foe) => !!FOE_X.get(f)?.hidden;

/** 11-18 (一局五关): a later region's foes into EDEFS (their AI goes into foes/roles.ts ROLE_AI under their role) */
export function addFoes(defs: Record<string, EDef>) { Object.assign(EDEFS, defs); }
/** the boss bar / banner / big death (show.ts, hud.ts) */
export const isBoss = (f: { d: EDef }) => !!f.d.boss;

/** act-113: guard-break vulnerability duration (s) and incoming damage multiplier */
export const POISE_BREAK_DUR = 2.6;
export const POISE_BREAK_MUL = 1.5;
/** act-113 / act-122: ranged pressure roles that stagger cleanly on their own cadence instead of locking out melee */
export const isRangedFoe = (f: { kind: string; role: string }) =>
  f.role === 'archer' || f.role === 'taoist' || f.role === 'ly_xbow' || f.role === 'ly_torch' || f.role === 'xp_needle' || f.role === 'xp_frost'
  || f.kind === 'hj_jar' || f.kind === 'wl_xbow' || f.kind === 'wl_oil' || f.kind === 'cx_zhu';

type St = 'enter' | 'move' | 'windup' | 'strike' | 'recover' | 'stagger' | 'roar' | 'dead';
export interface Foe {
  kind: EKind; d: EDef; a: BattleActor; hp: number; maxHp: number; pos: THREE.Vector3; vel: THREE.Vector3; yaw: number;
  /** act-19: thrown into the air (挑空斩, 飞踢, a heavy blow): the upward speed; undefined = on the ground */ airV?: number;
  st: St; t: number; dur: number; tele: Tele | null; teleYaw: number; telePos: THREE.Vector3; shape: TeleShape | null; dmg: number;
  cd: number; poise: number; /** act-113: guard-broken vulnerability timer (>0 takes ×1.5 dmg) & idle timer before poise slowly recovers */ brokenT: number; poiseIdleT: number; attacking: boolean; hitHero: boolean; lunge: THREE.Vector3 | null; strafe: number; move: string;
  /** the last blow's numbers (death form), and timed blade wounds */ lastDmg: number; uid: number; bleed: number; bleedT: number; bleedTick: number; bleedDrop: number; sunderT: number;
  /** act-118: boomerang dart-mark window (keeps 寻声/牵红 working with 折返!) and exposed window (next blade hit guaranteed crit) */
  dartMarkT?: number; exposeT?: number;
  /** the dummy's wobble (lean angles and their speeds, rad) */ wob: { x: number; z: number; vx: number; vz: number };
  /** the stronger variant (+80 % HP, bigger, one extra trick) */ elite: boolean; role: Role;
  /** the attack under way ('cut' 'slam' 'sweep' 'poke' 'lunge' 'shoot' 'cast' 'thunder' …) and follow-ups left (elite double cut / lunge) */
  atk: string; glint?: boolean; combo: number; /** extra warning shapes of this attack (yaw offset from the main one) */ extra: Array<{ t: Tele; dy: number }>;
  /** invulnerable for this long (the boss's roar) */ inv: number; /** the boss: 1, then 2 after the roar */ phase: number; summonT: number; thunderCd: number; auraT: number;
  /** wp/regB: the warning stays where the attack put it (a jar's landing, a stone's fall) instead of following the foe */ anchor?: boolean;
  /** wp/regB: this attack is a low one (a jump clears it) */ lowAtk?: boolean;
  /** 11-18: a region role's own state (timers, flags: foes/roles.ts) */ mem: Record<string, any>;
}
/** the dummy's lean, read by its pose hook (yard.ts) */
export const WOBBLE = new WeakMap<object, { x: number; z: number }>();
export interface FoeWorld {
  heroPos: THREE.Vector3; heroR: number; heroAlive: boolean; /** the hero's height off the ground (a jump clears low attacks) */ heroY: number;
  /** the hero is dashing (or just dashed): a near miss counts as a perfect dodge */ heroDodge: boolean;
  hurtHero(dmg: number, from: THREE.Vector3, attacker?: Foe): void;
  killFoe(f: Foe, from: THREE.Vector3): void;
  bleedDamage(f: Foe): number; bleedSpill(f: Foe): void;
  foes: Foe[];
  arrows: Arrow[];
  clamp(p: THREE.Vector3, r: number): void;
  /** 11-18 屋子形态 (asm/roomShape.ts): a projectile's clamp — the walls stop it, the pits don't (absent = clamp) */
  clampAir?(p: THREE.Vector3, r: number): void;
  /** a foe's own clamp: knocked back hard or thrown, it can go over a pit's edge (and falls); walking, the edge holds it (absent = clamp) */
  clampFoe?(f: Foe): void;
  /** the way round to the hero over the floor grid: a unit direction to walk, or null = straight at her (absent = always straight) */
  way?(f: Foe): THREE.Vector3 | null;
  /** nothing that blocks sight between this foe and the hero (a ranged foe only shoots when it does; absent = always) */
  sees?(f: Foe): boolean;
  /** act-19: after the clamp moved a foe by (dx, dz) — a wall / cover / prop pushed it back (the wall slam reads this) */
  pushed?(f: Foe, dx: number, dz: number): void;
  /** a deflected arrow strikes a foe */
  arrowHit(f: Foe, a: Arrow): void;
  /** an attack that would have hit was jumped over (a perfect dodge) */
  dodged(from: THREE.Vector3): void;
  // ---- wp/regB: what the region-four / -five foes ask of the game (installed by regions/r45_hook.ts; absent = nothing happens)
  /** drag / shove the hero to a point over a moment (the chain's pull, the fan's push) */ pull?(to: THREE.Vector3): void;
  /** a line over a foe's head (a boss changing phase) */ say?(f: Foe, line: string): void;
  /** 周黯's fire: 1 = the deck catches (the ring of fire, the warm light), 0 = it burns one step further in */ burnStage?(n: 0 | 1): void;
  /** 崔玄's dark: the lamps go out (1) */ dark?(on: 0 | 1): void;
  /** the way the hero faces (flat) */ heroFwd?: THREE.Vector3;
  /** the hero is in the parry's window right now (a chain throw does not drag her) */ heroParry?: boolean;
  // 11-18 (一局五关): what the region-two / -three foes do to the world and to her (show.ts implements them; tests may leave them out)
  /** a patch of fire on the floor (the breakables' fire: it burns her, the foes and the props) */ ignite?(x: number, z: number, r: number, t: number): void;
  /** 寒毒: her steps slowed to k of her speed for t s (stacks refresh; the region-three poison) */ chill?(t: number, k: number): void;
  /** frozen in place for t s (no moving, no buttons) */ freeze?(t: number): void;
  /** the stage's floor is water here (下邳's pools) */ wet?(x: number, z: number): boolean;
  /** which way she faces (rad; the 死士 go round to her back) */ heroYaw?: number;
  /** the room's shallow water (下邳: the 水鬼 make for it) */ pools?: Array<{ x0: number; x1: number; z0: number; z1: number }>;
}
/** how high the hero must be to clear a low attack (m) */
export const LOW_CLEAR = 0.45;
let UID = 1;
/** draw-call budget: only an actor's n biggest parts cast shadows (each caster is drawn twice; small parts' shadows don't read anyway) */
export function trimShadows(root: THREE.Object3D, n: number) {
  const ms: THREE.Mesh[] = []; root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) ms.push(m); });
  ms.sort((a, b) => (b.geometry.attributes.position?.count ?? 0) - (a.geometry.attributes.position?.count ?? 0));
  const grounded = (m: THREE.Mesh) => /^(foot|shin)/.test(m.name);
  ms.forEach((m, i) => { m.castShadow = i < n || grounded(m); });
}

/** act-118: every elite spawns with a real poise bar (resists brainless basic-attack stunlock, rewards 见切/破势/重击) */
export const elitePoise = (base: EDef, kind: string) =>
  base.poise > 0 ? Math.round(base.poise * 1.45) : (isRangedFoe({ kind, role: base.role }) ? 22 : 30);

export function spawnFoe(kind: EKind, at: THREE.Vector3, face: THREE.Vector3, elite = false): Foe {
  const base = EDEFS[kind], el = elite && !!base.elite;
  const d: EDef = el ? { ...base, r: base.r * 1.15, mass: base.mass * 1.3, poise: elitePoise(base, kind), gold: base.gold * 2 + 2 } : base;
  const model = el ? base.elite! : base.alt ? [base.model, ...base.alt][Math.floor(Math.random() * (base.alt.length + 1))] : base.model;
  const a = new BattleActor(model); a.place(at.clone()); a.faceToward(face); trimShadows(a.root, d.boss ? 6 : base.role === 'brute' ? 5 : 3);
  if (el) a.root.scale.setScalar(1.15);
  const hp = Math.round(d.hp * TUNE.enemyHp * (el ? 1.8 : 1));
  return { kind, d, a, hp, maxHp: hp, pos: a.home, vel: V3(), yaw: a.yaw, st: 'enter', t: 0, dur: 0.55, tele: null, teleYaw: 0, telePos: V3(), shape: null, dmg: 0,
    cd: R(0.4, 1.2), poise: d.poise, brokenT: 0, poiseIdleT: 0, attacking: false, hitHero: false, lunge: null, strafe: Math.random() < 0.5 ? -1 : 1, move: '', lastDmg: 0, bleed: 0, bleedT: 0, bleedTick: 0, bleedDrop: 0, sunderT: 0, uid: UID++,
    wob: { x: 0, z: 0, vx: 0, vz: 0 }, elite: el, role: base.role, atk: '', combo: 0, extra: [], inv: 0, phase: 1, summonT: 3, thunderCd: R(2, 4), auraT: 0, mem: {} };
}

const setSt = (f: Foe, st: St, dur: number) => { f.st = st; f.t = 0; f.dur = dur; };
/** wp/regB: for the 'ext' AIs (foes/r45_ai.ts) */
export { setSt as setFoeState };
export type { St as FoeState };
export const dropTeles = (f: Foe) => { f.tele?.dispose(); f.tele = null; for (const e of f.extra) e.t.dispose(); f.extra = []; };
/** the body's own wind-up for each attack (the old kinds keep their own) */
const ANIM: Record<string, 'attack' | 'cast'> = { cut: 'attack', slam: 'attack', sweep: 'attack', poke: 'attack', lunge: 'attack', shoot: 'attack', bite: 'attack', cast: 'cast', thunder: 'cast' };
export function startAttack(f: Foe, w: FoeWorld, shape: TeleShape | null, windup: number, dmg: number, yaw: number, o: { atk?: string; extra?: Array<{ s: TeleShape; dy: number; low?: boolean }>; at?: THREE.Vector3; low?: boolean; anchor?: boolean;
  /** 11-18: the model's own action for this attack (its name, where its impact frame sits 0..1, its data) instead of the generic one */
  act?: { name: string; imp?: number; tail?: number; data?: Record<string, unknown> } } = {}) {
  f.atk = o.atk ?? ''; dropTeles(f); f.lowAtk = !!o.low; f.anchor = !!o.anchor;
  f.shape = shape; f.dmg = Math.round(dmg * TUNE.enemyDmg); f.teleYaw = yaw; f.telePos.copy(o.at ?? f.pos); f.hitHero = false; f.attacking = true;
  if (shape) { f.tele = new Tele(shape, { low: isLow(f, shape) }); f.tele.set(f.telePos.x, f.telePos.z, yaw, 0, windup); }
  f.glint = false;
  // act-23: the first beat: a dull red pulse through the attacker as the wind-up starts
  f.a.tint(0x8a1a10, 0.7);
  for (const e of o.extra ?? []) { const t = new Tele(e.s, { low: e.low }); t.set(f.telePos.x, f.telePos.z, yaw + e.dy, 0); f.extra.push({ t, dy: e.dy }); }
  const wu = windup / TUNE.aggression * (f.elite ? 0.85 : 1) * (f.phase > 1 ? 0.75 : 1); setSt(f, 'windup', wu);
  // act-113: staggered cross-beat between melee and ranged so arrows and slashes alternate cleanly instead of landing on the same frame
  crossBeatUntil = Math.max(crossBeatUntil, clock.time + 0.30);
  // the body's own wind-up: the attack action timed so its impact frame lands at the end of the wind-up
  const imp = o.act?.imp ?? (f.role === 'hound' ? 0.42 : 0.5), total = Math.max(wu / imp, wu + (o.act?.tail ?? 0));
  if (o.act) f.a.play(new Action(o.act.name, total, wu / total, o.act.data ?? {}));
  else if (f.role === 'archer') f.a.play(new Action('attack', total, imp));
  else f.a.play(new Action(ANIM[f.atk] ?? 'attack', total, imp, { dist: f.role === 'chief' || f.role === 'boss' || f.role === 'brute' ? 0.4 : f.atk === 'lunge' ? 0 : 0.6, atk: f.atk }));   // (wp/regB: atk = which attack, for the new foes' own poses)
  void w;
}
/** the attacks a jump clears: the hounds' lunge and the slams (wp/regB: and any attack started with low: true; 11-18: a region role's own low) */
const isLow = (f: Foe, s: TeleShape) => !!f.lowAtk || (ROLE_AI[f.role]?.low?.(f, s) ?? ((f.role === 'hound' && s.k === 'rect') || ((f.role === 'chief' || f.role === 'brute') && s.k === 'circle')));
/** the foe is winding up an attack a jump clears (the bot jumps these) */
export const lowAttack = (f: Foe) => f.st === 'windup' && !!f.shape && isLow(f, f.shape);
/** act-20 / act-113: separate melee & ranged attacker cadence with a 0.30s cross-beat so ranged snipers don't freeze all melee foes into standing around */
let meleeCalmUntil = 0;
let rangedCalmUntil = 0;
let crossBeatUntil = 0;
const meleeAttackers = (w: FoeWorld) => w.foes.reduce((n, o) => n + (o.attacking && o.st !== 'dead' && !isRangedFoe(o) ? (o.d.weight ?? (o.role === 'mob' || o.d.half ? 0.5 : 1)) : 0), 0);
const rangedAttackers = (w: FoeWorld) => w.foes.reduce((n, o) => n + (o.attacking && o.st !== 'dead' && isRangedFoe(o) ? 1 : 0), 0);
const attackers = (w: FoeWorld) => meleeAttackers(w);
// ---- wp/regB: what the 'ext' AIs (foes/r45_ai.ts) share with the old ones
/** may this foe start an attack now (its cool-down, staggered melee/ranged slot budget, and calm after a blow; a boss ignores calm) */
export const canStrike = (f: Foe, w: FoeWorld, o: { calm?: boolean; slots?: number } = {}) => {
  if (!w.heroAlive || f.cd > 0) return false;
  if (isRangedFoe(f)) {
    return rangedAttackers(w) < 1 && (clock.time >= rangedCalmUntil || !!o.calm) && clock.time >= crossBeatUntil;
  }
  return meleeAttackers(w) < (o.slots ?? TUNE.maxAttackers) && (clock.time >= meleeCalmUntil || !!o.calm || !!f.d.boss);
};
/** the calm after a blow starts now (an AI that recovers in its own way) */
export const markCalm = (f?: Foe) => {
  if (f && isRangedFoe(f)) rangedCalmUntil = Math.max(rangedCalmUntil, clock.time + Math.max(0.55, TUNE.atkCalm * 0.9));
  else meleeCalmUntil = Math.max(meleeCalmUntil, clock.time + TUNE.atkCalm);
};
/** act-122: soft ally-spread steering shared across ALL 5 regions so melee/ranged foes fan out into flanking arcs / crossfire instead of clumping */
export function applyAllySpread(f: Foe, w: FoeWorld, want: THREE.Vector3) {
  if (f.d.boss || f.role === 'boss' || f.role === 'chief' || f.kind === 'dummy') return;
  const ranged = isRangedFoe(f);
  const spreadR = ranged ? 3.2 : 2.15, r2 = spreadR * spreadR;
  for (const o of w.foes) {
    if (o === f || o.st === 'dead' || o.kind === 'dummy') continue;
    if (ranged !== isRangedFoe(o)) continue;
    const dx = f.pos.x - o.pos.x, dz = f.pos.z - o.pos.z, d2 = dx * dx + dz * dz;
    if (d2 > 1e-4 && d2 < r2) {
      const d = Math.sqrt(d2), push = ((spreadR - d) / spreadR) * 0.9;
      want.x += (dx / d) * push; want.z += (dz / d) * push;
    }
  }
}
/** current FoeWorld while updateFoe drives ext AIs, so steerFoe gets ally-spread & obstacle avoidance automatically */
let activeWorld: FoeWorld | null = null;
/** turn toward yaw y at rate k (as think does) */
export function turnFoe(f: Foe, y: number, dt: number, k = 10) { let dy = y - f.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; f.yaw += dy * Math.min(1, dt * k); }
/** the end of think: walk toward `want` at speed sp (a zero want stands and faces the hero), the run pose, the odd strafe flip */
export function steerFoe(f: Foe, want: THREE.Vector3, sp: number, dt: number, yawTo: number, aim = false, w?: FoeWorld) {
  const world = w ?? activeWorld;
  if (world) {
    applyAllySpread(f, world, want);
    const m0 = want.length();
    if (m0 > 0.05 && world.way) {
      const toH = world.heroPos.clone().sub(f.pos).setY(0), dH = toH.length();
      if (dH > 1e-3 && want.dot(toH) > 0.3 * m0 * dH) { const wd = world.way(f); if (wd) want.copy(wd).multiplyScalar(m0); }
    }
    if (aim && world.way && world.sees && !world.sees(f)) { const wd = world.way(f); if (wd) want.copy(wd); }
  }
  const m = want.length();
  if (m > 0.05) { want.multiplyScalar(sp / m); turnFoe(f, aim && (!world?.sees || world.sees(f)) ? yawTo : Math.atan2(want.x, want.z), dt, 8); } else turnFoe(f, yawTo, dt, 6);
  f.vel.lerp(want, Math.min(1, dt * 6)); f.a.setRunning(f.vel.length() > 0.6, Math.hypot(f.vel.x, f.vel.z), yawTo, f.vel);
  if (Math.random() < dt * 0.25) f.strafe *= -1;
}
/** 11-18: the shared pieces a region's RoleAI uses (startAttack, the attacker count, the calm, the state setter) */
export const AI = { startAttack: (f: Foe, w: FoeWorld, shape: TeleShape, windup: number, dmg: number, yaw: number, o?: Parameters<typeof startAttack>[6]) => startAttack(f, w, shape, windup, dmg, yaw, o),
  attackers, setSt: (f: Foe, st: St, dur: number) => setSt(f, st, dur), calm: (s: number) => { meleeCalmUntil = Math.max(meleeCalmUntil, clock.time + s); }, calmOver: () => clock.time >= meleeCalmUntil, isLow: (f: Foe, s: TeleShape) => isLow(f, s) };

function attackPoint(f: Foe) {
  if (f.atk === 'lob' && f.kind === 'hj_jar') return f.a.bonePos('jar');
  if (f.a.act?.name.startsWith('hj') && f.a.def.tip) return f.a.bonePos('weapon', 0, 0, f.a.def.tip * CELL / 2);
  return f.a.weapon();
}

export function updateFoe(f: Foe, w: FoeWorld, dt: number) {
  if (f.st === 'dead') return;
  f.sunderT = Math.max(0, f.sunderT - dt);
  if ((f.dartMarkT ?? 0) > 0) f.dartMarkT = Math.max(0, (f.dartMarkT ?? 0) - dt);
  if ((f.exposeT ?? 0) > 0) f.exposeT = Math.max(0, (f.exposeT ?? 0) - dt);
  // act-113: guard-break vulnerability window & slow poise regeneration when left unpressured
  if (f.brokenT > 0) {
    f.brokenT = Math.max(0, f.brokenT - dt);
    if (f.brokenT <= 0) { f.poise = f.d?.poise ?? 0; f.poiseIdleT = 0; }
    else if (f.st === 'stagger') f.a.tint(0xffcf54, 0.20 + 0.16 * Math.sin(clock.time * 16));
  } else if (f.d && f.d.poise > 0 && f.poise < f.d.poise) {
    f.poiseIdleT += dt;
    if (f.poiseIdleT >= 3.5) f.poise = Math.min(f.d.poise, f.poise + f.d.poise * 0.14 * dt);
  }
  if (f.bleed > 0) {
    const active = Math.min(dt, Math.max(0, 3 - f.bleedT)); f.bleedT += dt; f.bleedTick += active; f.bleedDrop += active;
    while (f.bleedDrop >= 0.4) { f.bleedDrop -= 0.4; w.bleedSpill(f); }
    while (f.bleedTick >= 1) { f.bleedTick -= 1; const from = f.pos.clone().add(V3(0, 0, -1)); if (damageFoe(f, w.bleedDamage(f), from, { quiet: true, dot: true })) { w.killFoe(f, from); return; } }
    if (f.bleedT >= 3) { f.bleed = 0; f.bleedTick = 0; f.bleedDrop = 0; }
  }
  // Pause attack clocks as well as movement, including training dummies.
  // act-19: in the air (thrown up / sent flying): a ballistic arc, then a thump and a puff on landing
  if (f.airV != null) { f.pos.y += f.airV * dt; f.airV -= 24 * dt; if (f.pos.y <= 0) { f.pos.y = 0; f.airV = undefined; fxSmoke(f.pos.clone().setY(0.2), 0x8a7a6a, 4, { r: 0.4, spd: 1.4, up: 0.4, s: 0.32, life: 0.5 }); cue('land', 0.6); } }
  if (f.kind === 'dummy') {
    // a stiff spring back to upright, well damped (a couple of swings after a hard hit)
    const o = f.wob, K = 140, D = 9;
    o.vx += (-K * o.x - D * o.vx) * dt; o.vz += (-K * o.z - D * o.vz) * dt; o.x += o.vx * dt; o.z += o.vz * dt;
    WOBBLE.set(f.a, { x: o.x, z: o.z }); return;
  }
  f.t += dt; f.cd -= dt; f.inv = Math.max(0, f.inv - dt); f.thunderCd -= dt;
  const toH = w.heroPos.clone().sub(f.pos).setY(0), dist = toH.length(), dir = dist > 1e-3 ? toH.clone().divideScalar(dist) : V3(0, 0, 1);
  const face = (y: number, k = 10) => { let dy = y - f.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; f.yaw += dy * Math.min(1, dt * k); };
  const yawTo = Math.atan2(dir.x, dir.z);
  if (f.role === 'boss' || f.role === 'chief' || String(f.kind).startsWith('pb_')) bossTick(f, w, dt);
  const rai = ROLE_AI[f.role]; if (rai?.tick) rai.tick(f, w, dt);   // 11-18: a region-two / -three role
  if ((f.st as St) === 'dead') return;
  // wp/regB: a region-four / -five foe runs its own frame first (hiding under the planks, the boss's machinery, its phases)
  const ai = f.role === 'ext' ? FOE_AI[f.kind] : undefined;
  if (ai?.tick?.(f, w, dt)) { teleStep(f, dt); ai.post?.(f, w, dt); integrate(f, w, dt); return; }
  if ((f.st as St) === 'dead') return;
  const free = f.st === 'move';
  if (f.st === 'enter') { if (f.t >= f.dur) setSt(f, 'move', 0); }
  else if (f.st === 'roar') { f.vel.multiplyScalar(Math.exp(-dt * 8)); if (f.inv > 0) f.a.tint(0xfff2b0, 0.7); if (f.t >= f.dur) { setSt(f, 'move', 0); f.cd = 0.2; } }
  else if (f.st === 'stagger') { f.vel.multiplyScalar(Math.exp(-dt * (f.airV != null ? 0.7 : 6))); if (f.t >= f.dur) { setSt(f, 'move', 0); f.cd = Math.max(f.cd, 0.3); } }
  else if (f.st === 'recover') { f.vel.multiplyScalar(Math.exp(-dt * 8)); if (f.t >= f.dur) { setSt(f, 'move', 0); f.attacking = false; } }
  else if (f.st === 'windup') {
    f.vel.multiplyScalar(Math.exp(-dt * 10));
    const p = f.t / f.dur, r = f.role, lane = r === 'hound' || f.atk === 'lunge';
    // aims track the hero early in the wind-up, then lock (so a dodge at the right time works)
    if (ai?.windup?.(f, w, dt, p, yawTo) || rai?.windup?.(f, w, dt, p, yawTo)) { /* the AI aimed it (wp/regB's FOE_AI or a region role) */ }
    else if ((r === 'archer' || r === 'taoist') && p < 0.72) { f.teleYaw = yawTo; f.yaw = yawTo; }
    else if ((r === 'blade' || r === 'mob') && p < 0.35) { f.teleYaw = yawTo; face(yawTo, 14); }
    else if (lane && p < 0.5) { f.teleYaw = yawTo; f.yaw = yawTo; }
    else if ((r === 'chief' || r === 'brute' || r === 'boss') && p < 0.3) { f.teleYaw = yawTo; face(yawTo, 6); }
    if ((r === 'blade' || r === 'boss') && f.atk !== 'thunder' && f.a.act?.name.startsWith('hj')) {
      if (p >= 1) f.yaw = f.teleYaw;
      else face(f.teleYaw, 14);
    }
    if (f.atk === 'thunder') { f.vel.set(0, 0, 0); if (Math.random() < dt * 25) fxSparks(attackPoint(f), 0xfff2a0, 2, 2, { life: 0.3 }); }
    else if (f.anchor) { /* wp/regB: the warning stays where it was put */ }
    else if (!lane || p < 0.5) f.telePos.copy(f.pos);
    const left = f.dur - f.t;
    f.tele?.set(f.telePos.x, f.telePos.z, f.teleYaw, p, left);
    for (const e of f.extra) e.t.set(f.telePos.x, f.telePos.z, f.teleYaw + e.dy, p, left);
    // act-23 / act-118 (统一 0.26s 黄金反制拍点): crisp weapon cross-glint + metallic chime at exact HOT beat so 见切/闪避 timing is uniform
    if (left < HOT && f.atk !== 'thunder') {
      f.a.tint(0xfff0c8, 0.52 * (1 - left / HOT) + 0.18);
      if (!f.glint) {
        f.glint = true;
        const ap = attackPoint(f);
        fxFlare(ap, 0xfff8dc, 1.15, 0.24);
        trailSeg(ap.clone().add(V3(-0.46, 0, 0)), ap.clone().add(V3(0.46, 0, 0)), 0xfff8d0, 0.08, { life: 0.22, bright: 3.2 });
        trailSeg(ap.clone().add(V3(0, -0.46, 0)), ap.clone().add(V3(0, 0.46, 0)), 0xffe488, 0.08, { life: 0.22, bright: 3.0 });
        cue('bladeRing', f.role === 'mob' || f.d.half ? 0.28 : 0.46, foePan(f, w));
      }
    }
    if (f.t >= f.dur) {
      const action = f.a.act;
      if (action?.name.startsWith('hj')) action.t = action.at * action.dur - dt;
      if (!ai?.strike?.(f, w)) strike(f, w);
    }
  } else if (f.st === 'strike') {
    // a lunge (hounds, the boss): flies along the locked lane, hitting once on contact
    if (f.lunge) {
      f.vel.copy(f.lunge);
      const dd = f.pos.distanceTo(w.heroPos), low = f.role === 'hound' || !!f.lowAtk;
      if (!f.hitHero && w.heroAlive && dd < f.d.r + w.heroR + 0.15) { f.hitHero = true; if (!low || w.heroY < LOW_CLEAR) w.hurtHero(f.dmg, f.pos.clone(), f); else w.dodged(f.pos.clone()); }
      else if (!f.hitHero && w.heroAlive && w.heroDodge && dd < f.d.r + w.heroR + 1.1) { f.hitHero = true; w.dodged(f.pos.clone()); }
    }
    rai?.striking?.(f, w, dt);
    if (f.t >= f.dur) {
      f.lunge = null; f.vel.multiplyScalar(0.2);
      // the elite follow-up: a second cut (backhand, re-aimed) / a second lunge
      if (ai) { if (!(w.heroAlive && ai.follow?.(f, w, yawTo))) { markCalm(f); setSt(f, 'recover', ai.recover?.(f) ?? 0.6); } }
      else if (f.combo > 0 && w.heroAlive) {
        f.combo--;
        if (f.role === 'hound') startAttack(f, w, { k: 'rect', len: 5.2, w: 1.0 }, 0.36, 8, yawTo, { atk: 'lunge' });
        else if (f.role === 'boss') startAttack(f, w, { k: 'circle', r: 2.8, ahead: 1.5 }, 0.72, 18, yawTo, { atk: 'slam', low: true, extra: [{ s: { k: 'circle', r: SHOCK_R, ahead: 1.5 }, dy: 0, low: true }] });
        else if (f.role === 'chief') startAttack(f, w, { k: 'cone', r: 3.1, half: 1.0 }, 0.56, 16, yawTo, { atk: 'sweep' });
        else startAttack(f, w, { k: 'cone', r: 2.3, half: 1.0 }, 0.34, 10, yawTo, { atk: 'cut', act: { name: 'hjBackhand', imp: 0.58 } });
      } else { markCalm(f); setSt(f, 'recover', rai?.recover?.(f) ?? (f.role === 'hound' ? 0.7 : f.role === 'chief' ? (f.phase > 1 ? 0.85 : 0.9) : f.role === 'brute' ? 1.0 : f.role === 'boss' ? (f.atk === 'slam' ? 0.95 : f.atk === 'lunge' ? 0.85 : f.atk === 'thunder' ? 0.55 : f.phase > 1 ? 0.5 : 0.75) : f.role === 'mob' ? 0.45 : 0.6)); }
    }
  }
  if (free && ai) { activeWorld = w; try { ai.think(f, w, dt, dist, dir, yawTo); } finally { activeWorld = null; } }
  else if (free && rai) roleThink(rai, f, w, dt, dist, dir, yawTo, face);
  else if (free) think(f, w, dt, dist, dir, yawTo, face);
  // (11-19: a reeling / thrown foe reports the speed it really makes after the push-out — a knock-back into a crate stops it there,
  //  and the legs must not run on at the speed of the blow)
  else if (f.st !== 'windup' && f.st !== 'strike') f.a.setRunning(false, f.st === 'stagger' ? undefined : Math.hypot(f.vel.x, f.vel.z), yawTo, f.vel);
  // The actor advances once after the AI. Sample the same wind-up clock so the blade crosses center on the hit frame.
  if (f.st === 'windup' && f.a.act?.name.startsWith('hj')) f.a.act.t = f.t - dt;
  teleStep(f, dt); ai?.post?.(f, w, dt);
  integrate(f, w, dt);
}
/** the warning shapes' own clocks (their ripples, the strike flash fading) */
function teleStep(f: Foe, dt: number) {
  f.tele?.update(dt); for (const e of f.extra) e.t.update(dt);
  if (f.tele?.done) f.tele = null;
  f.extra = f.extra.filter(e => !e.t.done);
}

/** 11-18 / act-122: a region role's free movement — its think() decides; ally-spread, obstacle routing, and steering are shared */
function roleThink(ai: NonNullable<(typeof ROLE_AI)[string]>, f: Foe, w: FoeWorld, dt: number, dist: number, dir: THREE.Vector3, yawTo: number, face: (y: number, k?: number) => void) {
  const can = canStrike(f, w, { calm: !!f.d.boss }) && (!w.sees || !isRangedFoe(f) || w.sees(f)), side = V3(dir.z, 0, -dir.x).multiplyScalar(f.strafe);
  const k: ThinkCtx = { dt, dist, dir, yawTo, can, side, face };
  const r = ai.think(f, w, k); if (r === 'busy') return;
  const want = r.want.clone(), sp = f.d.speed * (r.sp ?? 1);
  applyAllySpread(f, w, want);
  const m = want.length();
  if (m > 0.05 && w.way && want.dot(dir) > 0.3 * m) { const wd = w.way(f); if (wd) want.copy(wd).multiplyScalar(m); }
  if (r.aim && w.way && w.sees && !w.sees(f)) { const wd = w.way(f); if (wd) want.copy(wd); }
  const l = want.length();
  if (l > 0.05) { want.multiplyScalar(sp / l); face(r.aim && (!w.sees || w.sees(f)) ? yawTo : Math.atan2(want.x, want.z), 8); } else face(yawTo, 6);
  f.vel.lerp(want, Math.min(1, dt * 6)); f.a.setRunning(f.vel.length() > 0.6, Math.hypot(f.vel.x, f.vel.z), yawTo, f.vel);
  if (Math.random() < dt * 0.25) f.strafe *= -1;
}
/** free movement: close in / keep away / circle, and decide when to attack */
function think(f: Foe, w: FoeWorld, dt: number, dist: number, dir: THREE.Vector3, yawTo: number, face: (y: number, k?: number) => void) {
  // (11-18 屋子形态: a ranged foe behind a wall / a walled-off block does not loose at her — its arrow would hit the wall)
  const can = canStrike(f, w, { calm: f.role === 'boss' }) && (!w.sees || !isRangedFoe(f) || w.sees(f)), side = V3(dir.z, 0, -dir.x).multiplyScalar(f.strafe);
  let want = V3(), sp = f.d.speed, aim = false;
  const r = f.role;
  if (r === 'blade') {
    const busy = !can || meleeAttackers(w) >= TUNE.maxAttackers;
    // act-118: non-attacking blades hold an outer flanking ring (2.8–3.8m) instead of stacking right in front of the hero's swings
    if (busy) {
      if (dist > 3.8) want.copy(dir).addScaledVector(side, 0.75);
      else if (dist < 2.6) want.copy(dir).multiplyScalar(-0.45).addScaledVector(side, 0.95);
      else want.copy(side).multiplyScalar(1.0).addScaledVector(dir, 0.12);
    } else if (dist > 1.75) {
      want.copy(dir).addScaledVector(side, 0.24);
    }
    if (can && dist < 2.2) { f.combo = f.elite ? 1 : 0; startAttack(f, w, { k: 'cone', r: 2.2, half: 0.95 }, 0.62, 10, yawTo, { atk: 'cut', act: f.kind === 'hj_blade' ? { name: 'hjCut', imp: 0.57 } : undefined }); return; }
  } else if (r === 'mob') {
    // act-118: flankers orbit when waiting for a slot, then dart in from the side
    if (!can) {
      if (dist > 3.2) want.copy(dir).addScaledVector(side, 0.8);
      else if (dist < 2.1) want.copy(dir).multiplyScalar(-0.45).addScaledVector(side, 0.95);
      else want.copy(side).multiplyScalar(0.95);
    } else if (dist > 1.35) want.copy(dir).addScaledVector(side, 0.35);
    if (can && dist < 1.75) { startAttack(f, w, { k: 'rect', len: 1.6, w: 0.6 }, 0.44, 5, yawTo, { atk: 'poke' }); f.cd = R(0.45, 0.95); return; }
  } else if (r === 'hound') {
    if (dist > 5.2) want.copy(dir); else if (dist < 3.0) want.copy(dir).multiplyScalar(-0.6).add(side); else want.copy(side).addScaledVector(dir, 0.2);
    if (can && dist < 5.6 && dist > 2.2) { f.combo = f.elite ? 1 : 0; startAttack(f, w, { k: 'rect', len: 5.2, w: 1.0 }, 0.55, 8, yawTo, { atk: 'lunge' }); return; }
  } else if (r === 'archer') {
    aim = true;
    if (dist < 4.4) { want.copy(dir).multiplyScalar(-1).addScaledVector(side, 0.5); sp *= 1.1; }
    else if (dist > 8.5) want.copy(dir);
    else want.copy(side).multiplyScalar(0.6);
    if (can && dist < 10 && dist > 2.6) {
      const len = Math.min(11, dist + 3);
      startAttack(f, w, { k: 'line', len }, 0.9, 8, yawTo, { atk: 'shoot', extra: f.elite ? [{ s: { k: 'line', len }, dy: 0.22 }, { s: { k: 'line', len }, dy: -0.22 }] : [] }); return;
    }
  } else if (r === 'taoist') {
    // keeps 6–8 m off: backs away when the hero closes in, steps in when too far, otherwise drifts sideways
    aim = true;
    if (dist < 5.6) { want.copy(dir).multiplyScalar(-1).addScaledVector(side, 0.6); sp *= 1.15; }
    else if (dist > 8.4) want.copy(dir);
    else want.copy(side).multiplyScalar(0.55);
    if (can && dist < 11 && dist > 2.4) {
      const len = Math.min(9, dist);
      startAttack(f, w, { k: 'line', len }, 0.95, 10, yawTo, { atk: 'cast', extra: f.elite ? [{ s: { k: 'line', len }, dy: 0.38 }, { s: { k: 'line', len }, dy: -0.38 }] : [] });
      f.cd = R(1.4, 2.2); return;
    }
  } else if (r === 'brute') {
    if (dist > 2.2) want.copy(dir);
    if (can && dist < 3.0) {
      if (Math.random() < 0.55) startAttack(f, w, { k: 'circle', r: 2.2, ahead: 1.4 }, 1.05, 18, yawTo, { atk: 'slam', extra: f.elite ? [{ s: { k: 'circle', r: SHOCK_R, ahead: 1.4 }, dy: 0, low: true }] : [] });
      else startAttack(f, w, { k: 'cone', r: 3.0, half: 1.2 }, 0.85, 13, yawTo, { atk: 'sweep' });
      return;
    }
  } else if (r === 'boss') {
    sp *= f.phase > 1 ? 1.2 : 1;
    if (dist > 2.4) want.copy(dir).addScaledVector(side, 0.2);
    if (can && f.thunderCd <= 0 && (dist > 3.4 || Math.random() < 0.3)) { startThunder(f, w); return; }
    if (can && dist < 3.3) { f.combo = f.phase > 1 ? 1 : 0; startAttack(f, w, { k: 'cone', r: 3.3, half: 1.05 }, f.phase > 1 ? 0.78 : 0.85, 15, yawTo, { atk: 'sweep', act: { name: 'hjSweep', imp: 0.56 } }); f.cd = f.phase > 1 ? 0.2 : 0.4; return; }
    if (can && dist >= 3.3 && dist < 6.5 && Math.random() < dt * 1.6) { startAttack(f, w, { k: 'rect', len: Math.min(6.5, dist + 1.6), w: 1.4 }, 0.75, 16, yawTo, { atk: 'lunge', act: { name: 'hjThrust', imp: 0.55, tail: 0.58 } }); f.cd = f.phase > 1 ? 0.25 : 0.4; return; }
  } else {
    if (dist > 2.0) want.copy(dir);
    if (can && dist < 2.8) {
      if (Math.random() < 0.5) { f.combo = f.phase > 1 ? 1 : 0; startAttack(f, w, { k: 'cone', r: 3.0, half: 0.85 }, 0.85, 15, yawTo, { atk: 'sweep' }); }
      else startAttack(f, w, { k: 'circle', r: 2.5, ahead: 1.5 }, 1.1, 20, yawTo, { atk: 'slam' });
      return;
    }
  }
  // act-118 / act-122: soft ally-spread steering so foes fan out into flanking arcs / crossfire instead of clumping on one spot
  applyAllySpread(f, w, want);
  const m = want.length();
  // 11-18 敌人绕路 (屋子形态): a foe walking at the hero with a wall, a walled-off block or a pit between them follows the floor grid's
  // way round instead (the attack choices above are untouched: they still read the straight distance). Backing off / circling stay
  // as they were — the clamp holds them on the floor. A ranged foe that cannot see her walks round too, until it can.
  if (m > 0.05 && w.way && want.dot(dir) > 0.3 * m) { const wd = w.way(f); if (wd) want.copy(wd).multiplyScalar(m); }
  if (aim && w.way && w.sees && !w.sees(f)) { const wd = w.way(f); if (wd) want.copy(wd); }
  if (want.lengthSq() > 0.0025) { const l = want.length(); want.multiplyScalar(sp / l); face(aim && (!w.sees || w.sees(f)) ? yawTo : Math.atan2(want.x, want.z), 8); }
  else face(yawTo, 6);
  f.vel.lerp(want, Math.min(1, dt * 6));
  f.a.setRunning(f.vel.length() > 0.6, Math.hypot(f.vel.x, f.vel.z), yawTo, f.vel);
  if (Math.random() < dt * 0.25) f.strafe *= -1;
}

// ------------------------------------------------------------------ the boss: 雷法, the roar at half HP, the summons
const SHOCK_R = 4.4;
function startThunder(f: Foe, w: FoeWorld) {
  f.atk = 'thunder'; dropTeles(f); f.shape = null; f.attacking = true; f.hitHero = false;
  const wu = (f.phase > 1 ? 0.45 : 0.6) / TUNE.aggression; setSt(f, 'windup', wu);
  f.a.play(new Action('hjThunder', wu + 1.3, wu / (wu + 1.3)));
  f.thunderCd = f.phase > 1 ? R(4.5, 6) : R(6, 8); cue('magic', 0.8);
  fxRing(f.pos.clone().setY(0.08), 0xfff0a0, 1.6, { life: 0.5 } as never);
  void w;
}
/** the bolts: phase 1 = three circles on and round the hero; phase 2 = a line of five walking from the boss to the hero */
function callThunder(f: Foe, w: FoeWorld) {
  const dmg = Math.round(14 * TUNE.enemyDmg), h = w.heroPos.clone().setY(0);
  if (f.phase === 1) {
    const a0 = Math.random() * Math.PI * 2;
    w.arrows.push(new Thunder(h, dmg, 0, 0.9, f));
    for (let i = 0; i < 2; i++) { const a = a0 + i * Math.PI, p = h.clone().add(V3(Math.sin(a) * 1.9, 0, Math.cos(a) * 1.9)); w.clamp(p, 0.3); w.arrows.push(new Thunder(p, dmg, 0.18 * (i + 1), 0.9, f)); }
  } else {
    const d = h.clone().sub(f.pos).setY(0), L = Math.max(2, d.length()); d.normalize();
    for (let i = 0; i < 5; i++) { const p = f.pos.clone().setY(0).addScaledVector(d, 1.6 + i * Math.max(1.3, (L + 1.0 - 1.6) / 4)); w.clamp(p, 0.3); w.arrows.push(new Thunder(p, dmg, 0.12 * i, 0.8, f)); }
  }
  cue('thunder', 0.8); fxSparks(attackPoint(f), 0xfff4c0, 14, 5);
}
/** act-114: stereo pan (-0.8..+0.8) from foe's horizontal offset relative to hero (blind swordswoman hears direction) */
const foePan = (f: Foe, w: FoeWorld) => Math.max(-0.8, Math.min(0.8, (f.pos.x - w.heroPos.x) / 8));

/** every frame for the boss: the roar at half HP, phase 2's aura and summons */
function bossTick(f: Foe, w: FoeWorld, dt: number) {
  if (f.phase === 1 && f.hp <= f.maxHp * 0.5) {
    // the roar: the attack breaks off, a brief invulnerable flash, the yellow-white aura from now on
    const isHj = f.role === 'boss';
    dropTeles(f); f.attacking = false; f.lunge = null; f.combo = 0; f.brokenT = 0; f.phase = 2; f.inv = isHj ? 1.1 : 0.85; f.poise = f.d.poise; setSt(f, 'roar', isHj ? 1.3 : 0.95);
    f.a.roar(); cue('roar', 1); if (isHj) { cue('thunder', 0.85); w.say?.(f, '天雷降世，劈死这瞎子！'); } shake(0.45 * TUNE.shake);
    const c = f.pos.clone().setY(0.08); fxRing(c, 0xfff2b0, 3.2, { life: 0.6 } as never); fxShock(c, 0xffe080, 3.0, { life: 0.55 });
    fxSparks(f.a.chest(), 0xfff2c0, 30, 7); fxChips(f.a.chest(), [0xffe888, 0xffc844, 0xffffff], 10, { speed: 5.2, up: 3.4, size: 0.09, glow: 0.9 });
    if (isHj) { f.summonT = 2.5; f.thunderCd = Math.min(f.thunderCd, 1.5); }
  }
  if (f.role === 'boss' && f.phase > 1 && f.st !== 'dead') {
    f.auraT -= dt; if (f.auraT <= 0) { f.auraT = 0.12; fxEmbers(f.pos.clone().setY(0.4), 0xfff0a0, 2, { r: 0.7, up: 1.4, life: 0.8 }); }
    f.summonT -= dt;
    if (f.summonT <= 0 && w.heroAlive && f.st !== 'roar') {
      f.summonT = 8;
      const mobs = w.foes.filter(o => o.role === 'mob' && o.st !== 'dead').length;
      for (let i = 0; i < Math.min(2, 4 - mobs); i++) {
        const side = Math.random() < 0.5 ? -1 : 1, p = V3(side * 30, 0, R(-5, 2)); w.clamp(p, 0.5);
        const m = spawnFoe('hj_mob', p, w.heroPos.clone()); m.cd = R(0.6, 1.2); w.foes.push(m);
        fxSmoke(p.clone().add(V3(0, 0.3, 0)), 0x6a6a74, 8, { r: 0.6, spd: 1.2, up: 0.6, s: 0.4, life: 0.7 }); fxRing(p.clone().setY(0.05), 0xffc040, 1.0, { life: 0.4 } as never);
      }
      cue('summon', 0.6);
    }
  } else if (String(f.kind).startsWith('pb_') && f.phase > 1 && f.st !== 'dead') {
    // Phase 2 ember aura for replacement pool bosses (no extra mob spam)
    f.auraT -= dt; if (f.auraT <= 0) { f.auraT = 0.14; fxEmbers(f.pos.clone().setY(0.45), 0xffb858, 2, { r: 0.65, up: 1.3, life: 0.7 }); }
  }
}

function strike(f: Foe, w: FoeWorld) {
  f.tele?.flash(); for (const e of f.extra) e.t.flash();
  if (ROLE_AI[f.role]?.strike?.(f, w)) return;   // 11-18: a region role's own blow
  if (f.atk === 'thunder') { setSt(f, 'strike', 0.9); callThunder(f, w); return; }
  const s = f.shape!, pan = foePan(f, w);
  if (f.role === 'hound' || f.atk === 'lunge') {
    const d = V3(Math.sin(f.teleYaw), 0, Math.cos(f.teleYaw)), t = f.role === 'boss' ? 0.4 : 0.36;
    f.lunge = d.multiplyScalar(s.k === 'rect' ? s.len / t : 10); setSt(f, 'strike', t); f.yaw = f.teleYaw;
    if (f.role === 'boss') cue('foeHeavy', 0.85, pan);
    else cue(f.role === 'hound' ? 'hound' : 'foeCry', f.role === 'hound' ? 0.8 : 0.7, f.role === 'brute' ? 1 : 0);
    if (f.role !== 'hound') cue('foeSwing', 0.6, pan); return;   // (11-18: a shout and a rush, not the 1.4 s thunder it was)
  }
  setSt(f, 'strike', 0.18);
  if (f.role === 'archer') {
    for (const dy of [0, ...f.extra.map(e => e.dy)]) w.arrows.push(new Arrow(f.pos.clone().add(V3(0, 1.25, 0)), f.teleYaw + dy, f.dmg));
    cue('arrow', 0.6, pan); return;
  }
  if (f.role === 'taoist') {
    const len = s.k === 'line' ? s.len : 7;
    for (const dy of [0, ...f.extra.map(e => e.dy)]) { const y = f.teleYaw + dy; w.arrows.push(new Talisman(f.pos.clone().add(V3(Math.sin(y) * 0.6, 1.15, Math.cos(y) * 0.6)), y, f.dmg, len + 0.6)); }
    cue('magic', 0.6); fxSparks(f.a.weapon(), 0xffb050, 10, 3); return;
  }
  const heavy = f.role === 'chief' || f.role === 'brute' || f.role === 'boss' || (f.role === 'ext' && f.dmg >= 14);
  cue(heavy ? 'foeHeavy' : 'foeSwing', heavy ? 1 : f.role === 'mob' || f.d.half ? 0.45 : 0.7, pan);   // (11-18: the heavy swing has its own sound — it used the hero's heavy hit)
  if (s.k === 'circle' && f.role !== 'ext') {
    const c = f.pos.clone().add(V3(Math.sin(f.teleYaw) * s.ahead, 0.05, Math.cos(f.teleYaw) * s.ahead)); fxSmoke(c, 0x8a7a6a, 10, { r: 1.4, spd: 2, up: 0.6, s: 0.5, life: 0.8 }); fxSparks(c.clone().add(V3(0, 0.2, 0)), 0xffc080, 16, 6);
    if ((f.elite && f.role === 'brute') || f.role === 'boss') {
      w.arrows.push(new Shockwave(c, Math.round((f.role === 'boss' ? 12 : 10) * TUNE.enemyDmg), 0.85, SHOCK_R, 0.45));
      if (f.role === 'boss') { cue('thunder', 0.65); fxChips(c.clone().setY(0.25), [0xffe888, 0xffc240, 0x6a5c4a], 8, { speed: 4.5, up: 3.0, size: 0.09, glow: 0.7 }); }
    }
  }
  meleeLands(f, w);
}
/** wp/regB: the area test of a melee blow at the warning (hurt / jumped / dodged); returns true if the hero was in it */
export function meleeLands(f: Foe, w: FoeWorld, s: TeleShape = f.shape!, yaw = f.teleYaw, at: THREE.Vector3 = f.telePos) {
  const cleared = isLow(f, s) && w.heroY >= LOW_CLEAR;
  if (w.heroAlive && inside(s, at.x, at.z, yaw, w.heroPos.x, w.heroPos.z, w.heroR)) { if (cleared) w.dodged(f.pos.clone()); else w.hurtHero(f.dmg, f.pos.clone(), f); return !cleared; }
  // dashed out of it just in time (the hero is near the area while dashing): a perfect dodge too
  else if (w.heroAlive && w.heroDodge && inside(s, at.x, at.z, yaw, w.heroPos.x, w.heroPos.z, w.heroR + 1.1)) w.dodged(f.pos.clone());
  return false;
}
/** wp/regB: the usual strike (a lunge along the lane, else a blow at the warning) — for an 'ext' AI that only adds to it */
export { strike as defaultStrike };

/** 11-19 (用户：「敌人经常会被卡在场景可破坏建筑里原地跑」): a foe walking into a pot, a crate, a post or a piece of cover was pushed
 *  straight back out every frame and ran on the spot (the way round only knows the floor grid's walls and the props as they stood when
 *  the room was built; a body wedged against one corner still pushes into it). When the push has been holding it back for a while
 *  (less than a third of the speed it asks for gets through, for 0.35 s) it slides along the thing's edge — the side nearer where it
 *  was heading — for 0.7 s, and tries the other side if that is blocked too */
/** captures: __dh.unstick(false) turns it off to compare */
export const UNSTICK = { on: true };
function unstick(f: Foe, dt: number, asked: number, got: number, nx: number, nz: number) {
  if (!UNSTICK.on) return;
  const m = f.mem as { stuckT?: number; slideT?: number; slideX?: number; slideZ?: number; slideSide?: number; slideFail?: number };
  if ((m.slideT ?? 0) > 0) {
    // (the slide steers the next frame's walk: the velocity the foe's own think set is turned along the edge)
    m.slideT = (m.slideT ?? 0) - dt;
    const sx = m.slideX ?? 0, sz = m.slideZ ?? 0, sp = Math.max(asked, f.d.speed * 0.8);
    f.vel.set(sx * sp, 0, sz * sp);
    if (got < 0.25 * asked && asked > 0.4) { m.slideFail = (m.slideFail ?? 0) + dt; if ((m.slideFail ?? 0) > 0.25) { m.slideSide = -(m.slideSide ?? 1); m.slideX = -sx; m.slideZ = -sz; m.slideFail = 0; } }
    return;
  }
  if (asked > 0.5 && got < 0.33 * asked && (nx || nz)) m.stuckT = (m.stuckT ?? 0) + dt; else m.stuckT = Math.max(0, (m.stuckT ?? 0) - dt * 2);
  if ((m.stuckT ?? 0) < 0.35) return;
  // along the obstacle's face: the push normal turned a quarter, on the side the walk was leaning to
  const l = Math.hypot(nx, nz) || 1, tx = -nz / l, tz = nx / l, side = f.vel.x * tx + f.vel.z * tz >= 0 ? 1 : -1;
  m.slideX = tx * side + nx / l * 0.15; m.slideZ = tz * side + nz / l * 0.15; const q = Math.hypot(m.slideX, m.slideZ) || 1; m.slideX /= q; m.slideZ /= q;
  m.slideSide = side; m.slideT = 0.7; m.slideFail = 0; m.stuckT = 0;
}
function integrate(f: Foe, w: FoeWorld, dt: number) {
  const ax = f.pos.x, az = f.pos.z, asked = Math.hypot(f.vel.x, f.vel.z);
  f.pos.addScaledVector(f.vel, dt);
  // keep apart from each other and out of the hero
  for (const o of w.foes) if (o !== f && o.st !== 'dead') { const d = f.pos.clone().sub(o.pos).setY(0), l = d.length(), m = f.d.r + o.d.r; if (l < m && l > 1e-4) f.pos.addScaledVector(d, ((m - l) / l) * (o.d.mass / (o.d.mass + f.d.mass))); }
  if (w.heroAlive && f.st !== 'strike' && w.heroY < 0.6) { const d = f.pos.clone().sub(w.heroPos).setY(0), l = d.length(), m = f.d.r + w.heroR; if (l < m && l > 1e-4) f.pos.addScaledVector(d, (m - l) / l); }
  const bx = f.pos.x, bz = f.pos.z; if (w.clampFoe) w.clampFoe(f); else w.clamp(f.pos, f.d.r);
  if (f.pos.x !== bx || f.pos.z !== bz) { w.pushed?.(f, f.pos.x - bx, f.pos.z - bz); ROLE_AI[f.role]?.bumped?.(f, w, f.pos.x - bx, f.pos.z - bz); }
  // (walking only: an attack's lunge, a stagger or a throw keeps its own motion)
  if (f.st === 'move' && dt > 0) unstick(f, dt, asked, Math.hypot(f.pos.x - ax, f.pos.z - az) / dt, f.pos.x - bx, f.pos.z - bz);
  f.a.yaw = f.yaw;
}

/** an attack broken off (a parry caught it): the warning goes, the foe reels */
export function interruptFoe(f: Foe, reel = 0.9) {
  if (f.st === 'dead' || f.kind === 'dummy') return;
  const was = f.attacking;
  f.mem.intFrom = f.st;   // (11-18: a region role reads what was broken off — a wind-up caught by 破势, or a foe just pinned)
  dropTeles(f); f.attacking = false; f.lunge = null; f.hitHero = true; f.combo = 0; setSt(f, 'stagger', reel); f.cd = Math.max(f.cd, reel + 0.3);
  if (f.a.act?.name.startsWith('hj')) f.a.play(new Action('hurt', Math.min(reel, 0.45), 0.1, { power: 0.8 }));
  if (f.role === 'ext') FOE_AI[f.kind]?.interrupted?.(f, was);   // wp/regB
  ROLE_AI[f.role]?.interrupted?.(f, null);
}
/** a hit on a foe: HP, flash, knock-back, the stagger (light foes) or the poise (the chief). Returns true if it died */
export function damageFoe(f: Foe, dmg: number, from: THREE.Vector3, o: { knock?: number; stagger?: number; poiseDmg?: number; quiet?: boolean; dot?: boolean } = {}): boolean {
  if (f.st === 'dead') return false;
  if (f.kind === 'dummy') {
    // never dies: rocks back from the blow and flashes
    const away = f.pos.clone().sub(from).setY(0); if (away.lengthSq() < 1e-4) away.set(0, 0, -1); away.normalize();
    const k = Math.min(1.6, 0.35 + dmg / 14) * (0.6 + 0.4 * (o.knock ?? 1)) * 3.2;
    f.wob.vx += away.z * k; f.wob.vz -= away.x * k; f.lastDmg = dmg;
    if (!o.dot) f.a.hit(Math.min(1.4, 0.5 + dmg / 18));
    return false;
  }
  // the boss's roar: the blow glances off
  if (f.inv > 0) { f.a.tint(0xffffff, 1); fxSparks(f.a.chest(), 0xfff6d0, 10, 4); return false; }
  f.hp -= dmg; f.lastDmg = dmg;
  const away = f.pos.clone().sub(from).setY(0); if (away.lengthSq() < 1e-4) away.set(0, 0, -1); away.normalize();
  if (!o.dot) {
    // poise foes in the middle of an attack only flinch (the wind-up's pose stays readable); everyone else plays the hurt
    // (act-43 反馈：「普通攻击几乎感觉不到任何效果」: a bigger flinch — a 7-point cut used to rock them at 0.9, now 1.35)
    if (f.d.poise > 0 && (f.st === 'windup' || f.st === 'strike')) f.a.hit(Math.min(1.5, 0.75 + dmg / 16)); else f.a.hurt(Math.min(1.7, 0.85 + dmg / 14));
    f.vel.addScaledVector(away, ((o.knock ?? 1) * 6 * TUNE.knock) / f.d.mass);
  }
  if (f.hp <= 0) { f.hp = 0; f.st = 'dead'; f.attacking = false; dropTeles(f); return true; }
  if (o.dot) return false;
  if (f.d.poise > 0) {
    if (f.brokenT <= 0) {
      f.poiseIdleT = 0;
      f.poise -= o.poiseDmg ?? dmg;
      if (f.poise <= 0) {
        f.poise = 0;
        f.brokenT = POISE_BREAK_DUR;
        dropTeles(f); f.attacking = false; f.lunge = null; f.combo = 0;
        setSt(f, 'stagger', 1.65);
        f.a.play(new Action('hurt', 1.2, 0.1, { power: 1.7 }));
        f.a.tint(0xfff0b0, 0.95);
        if (!o.quiet) cue('guardBreak', 1);
      }
    }
  } else if ((o.stagger ?? 0.28) > 0 && f.st !== 'strike') {
    // light foes: a hit breaks the wind-up (reward for pressing in)
    dropTeles(f); f.attacking = false; f.lunge = null; f.combo = 0; setSt(f, 'stagger', o.stagger ?? 0.28); f.cd = Math.max(f.cd, 0.25);
  }
  return false;
}

// ------------------------------------------------------------------ arrows
const arrowGeo = (() => { const g = new THREE.BoxGeometry(0.05, 0.05, 0.78); return g; })();
const arrowMat = toon(0x8a6a44), fletchMat = toon(0xe8e0d0);
export class Arrow {
  g = new THREE.Group(); v: THREE.Vector3; life = 1.6; dead = false;
  /** batted away by a cut: flies at the foes, tumbling end over end, with a gold trail */
  friendly = false; protected body = new THREE.Group(); protected spinAxis = new THREE.Vector3(1, 0, 0); protected grazed = false;
  /** plain: no arrow body (the talisman / bolts build their own look) */
  constructor(public p: THREE.Vector3, yaw: number, public dmg: number, speed = 14, plain = false) {
    if (!plain) {
      const shaft = new THREE.Mesh(arrowGeo, arrowMat), fl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.14), fletchMat), tip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.1), toon(0xc0c8d4));
      fl.position.z = -0.34; tip.position.z = 0.42; this.body.add(shaft, fl, tip);
    }
    this.g.add(this.body); this.g.rotation.y = yaw; this.g.position.copy(p); scene.add(this.g);
    this.v = V3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(speed);
  }
  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    const p0 = this.p.clone();
    this.p.addScaledVector(this.v, dt); this.g.position.copy(this.p); this.life -= dt;
    if (this.friendly) {
      this.body.rotateOnAxis(this.spinAxis, dt * 34);
      trailSeg(p0, this.p.clone(), 0xffd070, 0.14, { life: 0.22, bright: 2.4, spark: 0.25 });
      for (const f of w.foes) if (f.st !== 'dead' && Math.hypot(this.p.x - f.pos.x, this.p.z - f.pos.z) < f.d.r + 0.3) { w.arrowHit(f, this); this.kill(); return; }
    } else if (w.heroAlive && !this.grazed && w.heroDodge && Math.hypot(this.p.x - w.heroPos.x, this.p.z - w.heroPos.z) < w.heroR + 1.0) {
      // an arrow skimming past a dashing hero: a perfect dodge (it flies on)
      this.grazed = true; w.dodged(this.p.clone());
    } else if (w.heroAlive && !this.grazed && w.heroY < 1.6 && Math.hypot(this.p.x - w.heroPos.x, this.p.z - w.heroPos.z) < w.heroR + 0.2) { w.hurtHero(this.dmg, this.p.clone().addScaledVector(this.v, -0.1)); this.kill(); return; }
    const q = this.p.clone(); (w.clampAir ?? w.clamp)(q, 0); if (q.distanceTo(this.p) > 0.3 || this.life <= 0) { fxSparks(this.p, 0xc0a080, 5, 2); this.kill(); }
  }
  /** cut out of the air: sent off flat along dir, fast, and now it hurts the foes */
  deflect(dir: THREE.Vector3) {
    fxSparks(this.p, 0xfff0c0, 18, 6); cue('parry', 0.7);
    this.friendly = true; this.life = 1.1; this.v.copy(dir).setY(0).normalize().multiplyScalar(22);
    this.g.rotation.set(0, Math.atan2(dir.x, dir.z), 0); this.body.rotation.set(0, 0, 0);
  }
  kill() { this.dead = true; this.g.parent?.remove(this.g); }
}

// ------------------------------------------------------------------ 符火: the Taoist's talisman fireball
const TALIS = { speed: 6, r: 1.2, turn: 0.9, lead: 0.6 };
const paperMat = new THREE.MeshBasicMaterial({ color: 0xffe07a }), inkMat = new THREE.MeshBasicMaterial({ color: 0xd02a18 }), goldPaper = new THREE.MeshBasicMaterial({ color: 0xfff4c0 });
/** a glowing paper talisman wrapped in fire: ~6 m/s, turning slowly after the hero; the last stretch of its flight marks the ground where
 *  it bursts (r 1.2); it bursts there or on touching the hero. A cut bats it back like an arrow and then it bursts on the foes. */
export class Talisman extends Arrow {
  private tele: Tele | null = null; private paper: THREE.Mesh; private spin = 0;
  constructor(p: THREE.Vector3, yaw: number, dmg: number, range: number) {
    super(p, yaw, dmg, TALIS.speed, true);
    this.life = Math.max(0.8, Math.min(2.4, range / TALIS.speed));
    this.paper = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.34, 0.03), paperMat); const ink = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.035), inkMat);
    this.body.add(this.paper, ink);
  }
  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    const p0 = this.p.clone();
    if (!this.friendly && w.heroAlive) {
      const want = Math.atan2(w.heroPos.x - this.p.x, w.heroPos.z - this.p.z), cur = Math.atan2(this.v.x, this.v.z);
      let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      const y = cur + Math.max(-TALIS.turn * dt, Math.min(TALIS.turn * dt, d)); this.v.set(Math.sin(y), 0, Math.cos(y)).multiplyScalar(TALIS.speed);
    }
    this.p.addScaledVector(this.v, dt); this.g.position.copy(this.p); this.life -= dt;
    this.spin += dt * (this.friendly ? 18 : 6); this.body.rotation.set(0, this.spin, 0); this.body.position.y = Math.sin(this.spin * 1.3) * 0.05;
    trailSeg(p0, this.p.clone(), this.friendly ? 0xffe080 : 0xff7a2a, 0.26, { life: 0.3, bright: 2.4, spark: 0.35 });
    if (!this.friendly) {
      // the landing mark over the last stretch of the flight
      if (this.life < TALIS.lead) {
        if (!this.tele) this.tele = new Tele({ k: 'circle', r: TALIS.r, ahead: 0 });
        const end = this.p.clone().addScaledVector(this.v, Math.max(0, this.life)); this.tele.set(end.x, end.z, 0, 1 - Math.max(0, this.life) / TALIS.lead);
      }
      if (w.heroAlive && w.heroY < 1.7 && Math.hypot(this.p.x - w.heroPos.x, this.p.z - w.heroPos.z) < w.heroR + 0.3) { this.burst(w); return; }
    } else for (const f of w.foes) if (f.st !== 'dead' && Math.hypot(this.p.x - f.pos.x, this.p.z - f.pos.z) < f.d.r + 0.3) { this.burst(w); return; }
    const q = this.p.clone(); (w.clampAir ?? w.clamp)(q, 0); if (q.distanceTo(this.p) > 0.3 || this.life <= 0) this.burst(w);
  }
  private burst(w: FoeWorld) {
    const c = V3(this.p.x, 0.06, this.p.z), col = this.friendly ? 0xffd070 : 0xff8a30;
    fxRing(c, col, TALIS.r, { life: 0.35 } as never); fxSparks(this.p, 0xffb050, 22, 5); fxGlow(this.p, col, 1.6, 0.25);
    fxSmoke(c.clone().setY(0.4), 0x5a4a3a, 6, { r: 0.5, s: 0.4, life: 0.7 }); cue('fire', 0.7);
    if (!this.friendly) {
      const d = Math.hypot(c.x - w.heroPos.x, c.z - w.heroPos.z);
      if (w.heroAlive && w.heroY < 1.6 && d <= TALIS.r + w.heroR) { if (w.heroDodge) w.dodged(c); else w.hurtHero(this.dmg, c); }
      else if (w.heroAlive && w.heroDodge && d <= TALIS.r + w.heroR + 0.9) w.dodged(c);
    } else for (const f of w.foes.slice()) if (f.st !== 'dead' && Math.hypot(c.x - f.pos.x, c.z - f.pos.z) <= TALIS.r + f.d.r) w.arrowHit(f, this);
    this.kill();
  }
  deflect(dir: THREE.Vector3) {
    super.deflect(dir); this.v.setLength(13); this.life = 1.2; this.tele?.dispose(); this.tele = null; this.paper.material = goldPaper;
  }
  kill() { this.tele?.dispose(); this.tele = null; super.kill(); }
}

// ------------------------------------------------------------------ 雷法: one bolt (the boss), and the elite brute's shockwave
/** a circle on the ground that fills for `fill` s (after `delay`), then a bolt from the sky: hurts the hero (and any foe but the caster)
 *  inside. friendly = true only keeps the blade code in show.ts off it (a bolt can't be cut out of the air). */
export class Thunder extends Arrow {
  private tele: Tele | null = null; private t = 0; private fade = -1;
  constructor(at: THREE.Vector3, dmg: number, private delay: number, private fill: number, private owner: Foe | null, private r = 1.3) {
    super(V3(at.x, 0.05, at.z), 0, dmg, 0, true); this.friendly = true; this.life = 99;
  }
  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    this.t += dt;
    if (this.fade >= 0) { this.fade -= dt; this.tele?.update(dt); if (this.fade < 0) this.kill(); return; }
    if (this.t < this.delay) return;
    if (!this.tele) this.tele = new Tele({ k: 'circle', r: this.r, ahead: 0 });
    const k = (this.t - this.delay) / this.fill; this.tele.set(this.p.x, this.p.z, 0, k);
    if (k > 0.5 && Math.random() < dt * 14) fxSparks(V3(this.p.x + R(-0.4, 0.4), R(1.5, 3.5), this.p.z + R(-0.4, 0.4)), 0xfff4b0, 1, 1.5, { life: 0.25, grav: 0 });
    if (k >= 1) this.bolt(w);
  }
  private bolt(w: FoeWorld) {
    const g = V3(this.p.x, 0.1, this.p.z), top = V3(this.p.x + R(-0.7, 0.7), 9, this.p.z + R(-0.7, 0.7));
    // a crisp bolt, not a white fog (act-17 review): thin, dimmer glow, no flare blob
    fxBolt(top, g, 0xfff2a0, { jag: 0.5, seg: 10, width: 0.12, life: 0.28, bright: 0.5 }); fxBolt(top.clone().add(V3(R(-0.4, 0.4), 0, R(-0.4, 0.4))), g, 0xc8e0ff, { width: 0.06, life: 0.2, branch: false, bright: 0.45 });
    fxShock(g, 0xfff0a0, this.r + 0.3, { life: 0.4 }); fxSparks(g.clone().setY(0.3), 0xfff4c0, 18, 6); fxGlow(g.clone().setY(0.5), 0xfff2b0, 0.9, 0.2, 1.4);
    cue('boom', 0.4); shake(0.22 * TUNE.shake);
    const d = Math.hypot(g.x - w.heroPos.x, g.z - w.heroPos.z);
    if (w.heroAlive && d <= this.r + w.heroR) { if (w.heroDodge) w.dodged(g); else w.hurtHero(this.dmg, g); }
    else if (w.heroAlive && w.heroDodge && d <= this.r + w.heroR + 0.9) w.dodged(g);
    for (const f of w.foes.slice()) if (f !== this.owner && f.st !== 'dead' && f.kind !== 'dummy' && Math.hypot(g.x - f.pos.x, g.z - f.pos.z) <= this.r + f.d.r) w.arrowHit(f, this);
    this.tele?.flash(); this.fade = 0.3;
  }
  kill() { this.tele?.dispose(); this.tele = null; super.kill(); }
}
/** a ring of force running out along the ground from r0 to r1 in `dur` s: hits the hero once as it passes (a jump clears it) */
export class Shockwave extends Arrow {
  private t = 0; private hit = false;
  constructor(at: THREE.Vector3, dmg: number, private r0: number, private r1: number, private dur: number) {
    super(V3(at.x, 0.05, at.z), 0, dmg, 0, true); this.friendly = true; this.life = 99;
    fxRing(V3(at.x, 0.07, at.z), 0xffd8a0, r1, { r0, life: dur, width: 0.25, fill: 0.04, bright: 2 } as never);
  }
  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    this.t += dt; const k = Math.min(1, this.t / this.dur), rr = this.r0 + (this.r1 - this.r0) * k;
    const d = Math.hypot(this.p.x - w.heroPos.x, this.p.z - w.heroPos.z);
    if (!this.hit && w.heroAlive && Math.abs(d - rr) < 0.35 + w.heroR) { this.hit = true; if (w.heroY >= LOW_CLEAR || w.heroDodge) w.dodged(this.p.clone()); else w.hurtHero(this.dmg, this.p.clone()); }
    if (k >= 1) this.kill();
  }
}
