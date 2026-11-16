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
import '../ronin/models';   // registers the old foe models (jp_bandit / jp_dog / jp_archer / jp_bandit_chief) in the bestiary ROSTER
import './foes/hj_models';  // registers the 黄巾 foe models (hj_*) in the bestiary ROSTER
import { Action } from '../actors/rig';
import { Tele, inside, type TeleShape } from './tele';
import { TUNE } from './tune';
import { toon } from '../look/toon';
import { cue } from '../../audio/cues';
import { shake } from '../engine/clock';
import { fxSparks, fxSmoke, fxRing, fxGlow, fxEmbers, trailSeg } from '../fx/fx';
import { fxBolt, fxShock } from '../fx/skillFx';

export type EKind = 'bandit' | 'dog' | 'archer' | 'chief' | 'dummy' | 'hj_blade' | 'hj_brute' | 'hj_taoist' | 'hj_mob' | 'hj_archer' | 'hj_hound' | 'hj_boss';
/** what the AI does (the old kinds and their 黄巾 counterparts share one) */
type Role = 'blade' | 'hound' | 'archer' | 'chief' | 'brute' | 'taoist' | 'mob' | 'boss' | 'dummy';
interface EDef { model: string; hp: number; r: number; speed: number; mass: number; poise: number; gold: number; name: string; role: Role;
  /** the elite look's model (kinds without one have no elite) */ elite?: string; /** other looks picked at random */ alt?: string[];
  /** a region boss: the long bar at the top, the banner, the big death */ boss?: boolean; /** the banner's second line */ tag?: string }
export const EDEFS: Record<EKind, EDef> = {
  bandit: { model: 'jp_bandit', hp: 40, r: 0.42, speed: 2.7, mass: 1, poise: 0, gold: 3, name: '山贼', role: 'blade' },
  dog: { model: 'jp_dog', hp: 24, r: 0.45, speed: 4.2, mass: 0.7, poise: 0, gold: 2, name: '山犬', role: 'hound' },
  archer: { model: 'jp_archer', hp: 28, r: 0.42, speed: 2.6, mass: 0.9, poise: 0, gold: 3, name: '弓手', role: 'archer' },
  chief: { model: 'jp_bandit_chief', hp: 260, r: 0.8, speed: 1.9, mass: 3.2, poise: 46, gold: 20, name: '山贼头目', role: 'chief', boss: true, tag: '架势被打空才会晕' },
  dummy: { model: 'act_dummy', hp: 999, r: 0.45, speed: 0, mass: 99, poise: 0, gold: 0, name: '木人桩', role: 'dummy' },
  hj_blade: { model: 'hj_blade', hp: 40, r: 0.44, speed: 2.8, mass: 1, poise: 0, gold: 3, name: '黄巾刀手', role: 'blade', elite: 'hj_blade_e' },
  hj_brute: { model: 'hj_brute', hp: 110, r: 0.7, speed: 2.0, mass: 2.6, poise: 34, gold: 8, name: '黄巾力士', role: 'brute', elite: 'hj_brute_e' },
  hj_taoist: { model: 'hj_taoist', hp: 30, r: 0.42, speed: 2.5, mass: 0.9, poise: 0, gold: 4, name: '符水道士', role: 'taoist', elite: 'hj_taoist_e' },
  hj_mob: { model: 'hj_mob', hp: 14, r: 0.36, speed: 3.7, mass: 0.6, poise: 0, gold: 1, name: '流民', role: 'mob', alt: ['hj_mob_b'] },
  hj_archer: { model: 'hj_archer', hp: 28, r: 0.44, speed: 2.6, mass: 0.9, poise: 0, gold: 3, name: '黄巾弓手', role: 'archer', elite: 'hj_archer_e' },
  hj_hound: { model: 'hj_hound', hp: 24, r: 0.45, speed: 4.3, mass: 0.7, poise: 0, gold: 2, name: '猎犬', role: 'hound', elite: 'hj_hound_e' },
  hj_boss: { model: 'hj_boss', hp: 420, r: 0.85, speed: 2.0, mass: 3.6, poise: 64, gold: 40, name: '黄巾渠帅', role: 'boss', boss: true, tag: '苍天已死 · 黄天当立' },
};
/** the boss bar / banner / big death (show.ts, hud.ts) */
export const isBoss = (f: { d: EDef }) => !!f.d.boss;

type St = 'enter' | 'move' | 'windup' | 'strike' | 'recover' | 'stagger' | 'roar' | 'dead';
export interface Foe {
  kind: EKind; d: EDef; a: BattleActor; hp: number; maxHp: number; pos: THREE.Vector3; vel: THREE.Vector3; yaw: number;
  st: St; t: number; dur: number; tele: Tele | null; teleYaw: number; telePos: THREE.Vector3; shape: TeleShape | null; dmg: number;
  cd: number; poise: number; attacking: boolean; hitHero: boolean; lunge: THREE.Vector3 | null; strafe: number; move: string;
  /** the last blow's numbers (death form) */ lastDmg: number; burn: number; burnT: number; frozen: number; uid: number;
  /** school frost: stacks, remaining slow time, fraction of movement speed removed */ chill: number; slowT: number; slowK: number;
  /** the dummy's wobble (lean angles and their speeds, rad) */ wob: { x: number; z: number; vx: number; vz: number };
  /** the stronger variant (+80 % HP, bigger, one extra trick) */ elite: boolean; role: Role;
  /** the attack under way ('cut' 'slam' 'sweep' 'poke' 'lunge' 'shoot' 'cast' 'thunder' …) and follow-ups left (elite double cut / lunge) */
  atk: string; combo: number; /** extra warning shapes of this attack (yaw offset from the main one) */ extra: Array<{ t: Tele; dy: number }>;
  /** invulnerable for this long (the boss's roar) */ inv: number; /** the boss: 1, then 2 after the roar */ phase: number; summonT: number; thunderCd: number; auraT: number;
}
/** the dummy's lean, read by its pose hook (yard.ts) */
export const WOBBLE = new WeakMap<object, { x: number; z: number }>();
export interface FoeWorld {
  heroPos: THREE.Vector3; heroR: number; heroAlive: boolean; /** the hero's height off the ground (a jump clears low attacks) */ heroY: number;
  /** the hero is dashing (or just dashed): a near miss counts as a perfect dodge */ heroDodge: boolean;
  hurtHero(dmg: number, from: THREE.Vector3, attacker?: Foe): void;
  killFoe(f: Foe, from: THREE.Vector3): void;
  foes: Foe[];
  arrows: Arrow[];
  clamp(p: THREE.Vector3, r: number): void;
  /** a deflected arrow strikes a foe */
  arrowHit(f: Foe, a: Arrow): void;
  /** an attack that would have hit was jumped over (a perfect dodge) */
  dodged(from: THREE.Vector3): void;
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

export function spawnFoe(kind: EKind, at: THREE.Vector3, face: THREE.Vector3, elite = false): Foe {
  const base = EDEFS[kind], el = elite && !!base.elite;
  const d: EDef = el ? { ...base, r: base.r * 1.15, mass: base.mass * 1.3, poise: Math.round(base.poise * 1.4), gold: base.gold * 2 } : base;
  const model = el ? base.elite! : base.alt ? [base.model, ...base.alt][Math.floor(Math.random() * (base.alt.length + 1))] : base.model;
  const a = new BattleActor(model); a.place(at.clone()); a.faceToward(face); trimShadows(a.root, d.boss ? 6 : base.role === 'brute' ? 5 : 3);
  if (el) a.root.scale.setScalar(1.15);
  const hp = Math.round(d.hp * TUNE.enemyHp * (el ? 1.8 : 1));
  return { kind, d, a, hp, maxHp: hp, pos: a.home, vel: V3(), yaw: a.yaw, st: 'enter', t: 0, dur: 0.55, tele: null, teleYaw: 0, telePos: V3(), shape: null, dmg: 0,
    cd: R(0.4, 1.2), poise: d.poise, attacking: false, hitHero: false, lunge: null, strafe: Math.random() < 0.5 ? -1 : 1, move: '', lastDmg: 0, burn: 0, burnT: 0, frozen: 0, chill: 0, slowT: 0, slowK: 0, uid: UID++,
    wob: { x: 0, z: 0, vx: 0, vz: 0 }, elite: el, role: base.role, atk: '', combo: 0, extra: [], inv: 0, phase: 1, summonT: 3, thunderCd: R(2, 4), auraT: 0 };
}

const setSt = (f: Foe, st: St, dur: number) => { f.st = st; f.t = 0; f.dur = dur; };
const dropTeles = (f: Foe) => { f.tele?.dispose(); f.tele = null; for (const e of f.extra) e.t.dispose(); f.extra = []; };
/** the body's own wind-up for each attack (the old kinds keep their own) */
const ANIM: Record<string, 'attack' | 'cast'> = { cut: 'attack', slam: 'attack', sweep: 'attack', poke: 'attack', lunge: 'attack', shoot: 'attack', bite: 'attack', cast: 'cast', thunder: 'cast' };
function startAttack(f: Foe, w: FoeWorld, shape: TeleShape, windup: number, dmg: number, yaw: number, o: { atk?: string; extra?: Array<{ s: TeleShape; dy: number; low?: boolean }>; at?: THREE.Vector3 } = {}) {
  f.atk = o.atk ?? ''; dropTeles(f);
  f.shape = shape; f.dmg = Math.round(dmg * TUNE.enemyDmg); f.teleYaw = yaw; f.telePos.copy(o.at ?? f.pos); f.hitHero = false; f.attacking = true;
  f.tele = new Tele(shape, { low: isLow(f, shape) }); f.tele.set(f.telePos.x, f.telePos.z, yaw, 0);
  for (const e of o.extra ?? []) { const t = new Tele(e.s, { low: e.low }); t.set(f.telePos.x, f.telePos.z, yaw + e.dy, 0); f.extra.push({ t, dy: e.dy }); }
  const wu = windup / TUNE.aggression * (f.elite ? 0.85 : 1) * (f.phase > 1 ? 0.75 : 1); setSt(f, 'windup', wu);
  // the body's own wind-up: the attack action timed so its impact frame lands at the end of the wind-up
  const imp = f.role === 'hound' ? 0.42 : 0.5, total = wu / imp;
  if (f.role === 'archer') f.a.play(new Action('attack', total, imp));
  else f.a.play(new Action(ANIM[f.atk] ?? 'attack', total, imp, { dist: f.role === 'chief' || f.role === 'boss' || f.role === 'brute' ? 0.4 : f.atk === 'lunge' ? 0 : 0.6 }));
  void w;
}
/** the attacks a jump clears: the hounds' lunge and the slams */
const isLow = (f: Foe, s: TeleShape) => (f.role === 'hound' && s.k === 'rect') || ((f.role === 'chief' || f.role === 'brute') && s.k === 'circle');
/** the foe is winding up an attack a jump clears (the bot jumps these) */
export const lowAttack = (f: Foe) => f.st === 'windup' && !!f.shape && isLow(f, f.shape);
const attackers = (w: FoeWorld) => w.foes.reduce((n, o) => n + (o.attacking && o.st !== 'dead' ? (o.role === 'mob' ? 0.5 : 1) : 0), 0);

export function updateFoe(f: Foe, w: FoeWorld, dt: number) {
  if (f.st === 'dead') return;
  // Burning still ticks on ice; a lethal tick must reach the normal death/boon hooks.
  if (f.burn > 0) {
    f.burnT -= dt;
    if (f.burnT <= 0) {
      f.burnT = 0.5; f.burn--;
      const from = f.pos.clone().add(V3(0, 0, -1));
      if (damageFoe(f, 3, from, { quiet: true, burn: true })) { w.killFoe(f, from); return; }
    }
  }
  // Pause attack clocks as well as movement, including training dummies.
  if (f.frozen > 0) { f.frozen = Math.max(0, f.frozen - dt); f.vel.set(0, 0, 0); f.a.setRunning(false); f.a.tint(0x9ae8ff, 0.65); return; }
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
  if (f.role === 'boss') bossTick(f, w, dt);
  if ((f.st as St) === 'dead') return;
  const free = f.st === 'move';
  if (f.st === 'enter') { if (f.t >= f.dur) setSt(f, 'move', 0); }
  else if (f.st === 'roar') { f.vel.multiplyScalar(Math.exp(-dt * 8)); if (f.inv > 0) f.a.tint(0xfff2b0, 0.7); if (f.t >= f.dur) { setSt(f, 'move', 0); f.cd = 0.2; } }
  else if (f.st === 'stagger') { f.vel.multiplyScalar(Math.exp(-dt * 6)); if (f.t >= f.dur) { setSt(f, 'move', 0); f.cd = Math.max(f.cd, 0.3); } }
  else if (f.st === 'recover') { f.vel.multiplyScalar(Math.exp(-dt * 8)); if (f.t >= f.dur) { setSt(f, 'move', 0); f.attacking = false; } }
  else if (f.st === 'windup') {
    f.vel.multiplyScalar(Math.exp(-dt * 10));
    const p = f.t / f.dur, r = f.role, lane = r === 'hound' || f.atk === 'lunge';
    // aims track the hero early in the wind-up, then lock (so a dodge at the right time works)
    if ((r === 'archer' || r === 'taoist') && p < 0.72) { f.teleYaw = yawTo; f.yaw = yawTo; }
    else if ((r === 'blade' || r === 'mob') && p < 0.35) { f.teleYaw = yawTo; face(yawTo, 14); }
    else if (lane && p < 0.5) { f.teleYaw = yawTo; f.yaw = yawTo; }
    else if ((r === 'chief' || r === 'brute' || r === 'boss') && p < 0.3) { f.teleYaw = yawTo; face(yawTo, 6); }
    if (f.atk === 'thunder') { f.vel.set(0, 0, 0); if (Math.random() < dt * 30) fxSparks(f.a.weapon(), 0xfff2a0, 2, 2, { life: 0.3 }); }
    else if (!lane || p < 0.5) f.telePos.copy(f.pos);
    f.tele?.set(f.telePos.x, f.telePos.z, f.teleYaw, p);
    for (const e of f.extra) e.t.set(f.telePos.x, f.telePos.z, f.teleYaw + e.dy, p);
    if (f.t >= f.dur) strike(f, w);
  } else if (f.st === 'strike') {
    // a lunge (hounds, the boss): flies along the locked lane, hitting once on contact
    if (f.lunge) {
      f.vel.copy(f.lunge);
      const dd = f.pos.distanceTo(w.heroPos), low = f.role === 'hound';
      if (!f.hitHero && w.heroAlive && dd < f.d.r + w.heroR + 0.15) { f.hitHero = true; if (!low || w.heroY < LOW_CLEAR) w.hurtHero(f.dmg, f.pos.clone(), f); else w.dodged(f.pos.clone()); }
      else if (!f.hitHero && w.heroAlive && w.heroDodge && dd < f.d.r + w.heroR + 1.1) { f.hitHero = true; w.dodged(f.pos.clone()); }
    }
    if (f.t >= f.dur) {
      f.lunge = null; f.vel.multiplyScalar(0.2);
      // the elite follow-up: a second cut (backhand, re-aimed) / a second lunge
      if (f.combo > 0 && w.heroAlive) {
        f.combo--;
        if (f.role === 'hound') startAttack(f, w, { k: 'rect', len: 5.2, w: 1.0 }, 0.36, 8, yawTo, { atk: 'lunge' });
        else startAttack(f, w, { k: 'cone', r: 2.3, half: 1.0 }, 0.34, 10, yawTo, { atk: 'cut' });
      } else setSt(f, 'recover', f.role === 'hound' ? 0.7 : f.role === 'chief' ? 0.9 : f.role === 'brute' ? 1.0 : f.role === 'boss' ? (f.atk === 'thunder' ? 0.5 : f.phase > 1 ? 0.45 : 0.75) : f.role === 'mob' ? 0.45 : 0.6);
    }
  }
  if (free) think(f, w, dt, dist, dir, yawTo, face);
  else if (f.st !== 'windup' && f.st !== 'strike') f.a.setRunning(false);
  f.tele?.update(dt); for (const e of f.extra) e.t.update(dt);
  if (f.tele?.done) f.tele = null;
  f.extra = f.extra.filter(e => !e.t.done);
  integrate(f, w, dt);
}

/** free movement: close in / keep away / circle, and decide when to attack */
function think(f: Foe, w: FoeWorld, dt: number, dist: number, dir: THREE.Vector3, yawTo: number, face: (y: number, k?: number) => void) {
  const can = w.heroAlive && f.cd <= 0 && attackers(w) < TUNE.maxAttackers, side = V3(dir.z, 0, -dir.x).multiplyScalar(f.strafe);
  let want = V3(), sp = f.d.speed, aim = false;
  const r = f.role;
  if (r === 'blade') {
    if (dist > 1.7) want.copy(dir).addScaledVector(side, attackers(w) >= TUNE.maxAttackers ? 0.8 : 0.15);
    else if (!can) want.copy(side).addScaledVector(dir, -0.4);
    if (can && dist < 2.1) { f.combo = f.elite ? 1 : 0; startAttack(f, w, { k: 'cone', r: 2.2, half: 0.95 }, 0.62, 10, yawTo, { atk: 'cut' }); return; }
  } else if (r === 'mob') {
    // the crowd: straight in, a little weave, quick short pokes
    if (dist > 1.3) want.copy(dir).addScaledVector(side, 0.35); else if (!can) want.copy(side).addScaledVector(dir, -0.3);
    if (can && dist < 1.7) { startAttack(f, w, { k: 'rect', len: 1.6, w: 0.6 }, 0.42, 5, yawTo, { atk: 'poke' }); f.cd = R(0.4, 0.9); return; }
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
    if (can && dist < 3.3) { startAttack(f, w, { k: 'cone', r: 3.3, half: 1.05 }, 0.85, 15, yawTo, { atk: 'sweep' }); f.cd = f.phase > 1 ? 0.15 : 0.4; return; }
    if (can && dist >= 3.3 && dist < 6.5 && Math.random() < dt * 1.6) { startAttack(f, w, { k: 'rect', len: Math.min(6.5, dist + 1.6), w: 1.4 }, 0.75, 16, yawTo, { atk: 'lunge' }); f.cd = f.phase > 1 ? 0.15 : 0.4; return; }
  } else {
    if (dist > 2.0) want.copy(dir);
    if (can && dist < 2.8) {
      if (Math.random() < 0.5) startAttack(f, w, { k: 'cone', r: 3.0, half: 0.85 }, 0.85, 15, yawTo, { atk: 'sweep' });
      else startAttack(f, w, { k: 'circle', r: 2.5, ahead: 1.5 }, 1.1, 20, yawTo, { atk: 'slam' });
      return;
    }
  }
  const m = want.length();
  if (m > 0.05) { want.multiplyScalar(sp / m); face(aim ? yawTo : Math.atan2(want.x, want.z), 8); }
  else face(yawTo, 6);
  f.vel.lerp(want, Math.min(1, dt * 6));
  f.a.setRunning(f.vel.length() > 0.6);
  if (Math.random() < dt * 0.25) f.strafe *= -1;
}

// ------------------------------------------------------------------ the boss: 雷法, the roar at half HP, the summons
const SHOCK_R = 4.4;
function startThunder(f: Foe, w: FoeWorld) {
  f.atk = 'thunder'; dropTeles(f); f.shape = null; f.attacking = true; f.hitHero = false;
  const wu = (f.phase > 1 ? 0.45 : 0.6) / TUNE.aggression; setSt(f, 'windup', wu);
  f.a.play(new Action('cast', wu + 1.3, wu / (wu + 1.3)));
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
  cue('crit', 0.5); fxSparks(f.a.weapon(), 0xfff4c0, 18, 6);
}
/** every frame for the boss: the roar at half HP, phase 2's aura and summons */
function bossTick(f: Foe, w: FoeWorld, dt: number) {
  if (f.phase === 1 && f.hp <= f.maxHp * 0.5) {
    // the roar: the attack breaks off, a brief invulnerable flash, the yellow-white aura from now on
    dropTeles(f); f.attacking = false; f.lunge = null; f.phase = 2; f.inv = 1.1; f.poise = f.d.poise; setSt(f, 'roar', 1.3);
    f.a.roar(); cue('roar', 1); shake(0.45 * TUNE.shake);
    const c = f.pos.clone().setY(0.08); fxRing(c, 0xfff2b0, 3.2, { life: 0.6 } as never); fxShock(c, 0xffe080, 3.0, { life: 0.55 }); fxSparks(f.a.chest(), 0xfff2c0, 30, 7);
    f.summonT = 2.5; f.thunderCd = Math.min(f.thunderCd, 1.5);
  }
  if (f.phase > 1 && f.st !== 'dead') {
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
  }
}

function strike(f: Foe, w: FoeWorld) {
  f.tele?.flash(); for (const e of f.extra) e.t.flash();
  if (f.atk === 'thunder') { setSt(f, 'strike', 0.9); callThunder(f, w); return; }
  const s = f.shape!;
  if (f.role === 'hound' || f.atk === 'lunge') {
    const d = V3(Math.sin(f.teleYaw), 0, Math.cos(f.teleYaw)), t = f.role === 'boss' ? 0.4 : 0.36;
    f.lunge = d.multiplyScalar(s.k === 'rect' ? s.len / t : 10); setSt(f, 'strike', t); f.yaw = f.teleYaw; cue(f.role === 'boss' ? 'whoosh' : 'roar', 0.35); return;
  }
  setSt(f, 'strike', 0.18);
  if (f.role === 'archer') {
    for (const dy of [0, ...f.extra.map(e => e.dy)]) w.arrows.push(new Arrow(f.pos.clone().add(V3(0, 1.25, 0)), f.teleYaw + dy, f.dmg));
    cue('whoosh', 0.5); return;
  }
  if (f.role === 'taoist') {
    const len = s.k === 'line' ? s.len : 7;
    for (const dy of [0, ...f.extra.map(e => e.dy)]) { const y = f.teleYaw + dy; w.arrows.push(new Talisman(f.pos.clone().add(V3(Math.sin(y) * 0.6, 1.15, Math.cos(y) * 0.6)), y, f.dmg, len + 0.6)); }
    cue('magic', 0.6); fxSparks(f.a.weapon(), 0xffb050, 10, 3); return;
  }
  const heavy = f.role === 'chief' || f.role === 'brute' || f.role === 'boss';
  cue(heavy ? 'crit' : 'whoosh', heavy ? 0.7 : f.role === 'mob' ? 0.4 : 0.6);
  if (s.k === 'circle') {
    const c = f.pos.clone().add(V3(Math.sin(f.teleYaw) * s.ahead, 0.05, Math.cos(f.teleYaw) * s.ahead)); fxSmoke(c, 0x8a7a6a, 10, { r: 1.4, spd: 2, up: 0.6, s: 0.5, life: 0.8 }); fxSparks(c.clone().add(V3(0, 0.2, 0)), 0xffc080, 16, 6);
    if (f.elite && f.role === 'brute') w.arrows.push(new Shockwave(c, Math.round(10 * TUNE.enemyDmg), 0.8, SHOCK_R, 0.45));
  }
  const cleared = isLow(f, s) && w.heroY >= LOW_CLEAR;
  if (w.heroAlive && inside(s, f.telePos.x, f.telePos.z, f.teleYaw, w.heroPos.x, w.heroPos.z, w.heroR)) { if (cleared) w.dodged(f.pos.clone()); else w.hurtHero(f.dmg, f.pos.clone(), f); }
  // dashed out of it just in time (the hero is near the area while dashing): a perfect dodge too
  else if (w.heroAlive && w.heroDodge && inside(s, f.telePos.x, f.telePos.z, f.teleYaw, w.heroPos.x, w.heroPos.z, w.heroR + 1.1)) w.dodged(f.pos.clone());
}

function integrate(f: Foe, w: FoeWorld, dt: number) {
  f.pos.addScaledVector(f.vel, dt * (f.slowT > 0 ? 1 - f.slowK : 1));
  // keep apart from each other and out of the hero
  for (const o of w.foes) if (o !== f && o.st !== 'dead') { const d = f.pos.clone().sub(o.pos).setY(0), l = d.length(), m = f.d.r + o.d.r; if (l < m && l > 1e-4) f.pos.addScaledVector(d, ((m - l) / l) * (o.d.mass / (o.d.mass + f.d.mass))); }
  if (w.heroAlive && f.st !== 'strike' && w.heroY < 0.6) { const d = f.pos.clone().sub(w.heroPos).setY(0), l = d.length(), m = f.d.r + w.heroR; if (l < m && l > 1e-4) f.pos.addScaledVector(d, (m - l) / l); }
  w.clamp(f.pos, f.d.r);
  f.a.yaw = f.yaw;
}

/** an attack broken off (a parry caught it): the warning goes, the foe reels */
export function interruptFoe(f: Foe, reel = 0.9) {
  if (f.st === 'dead' || f.kind === 'dummy') return;
  dropTeles(f); f.attacking = false; f.lunge = null; f.hitHero = true; f.combo = 0; setSt(f, 'stagger', reel); f.cd = Math.max(f.cd, reel + 0.3);
}
/** a hit on a foe: HP, flash, knock-back, the stagger (light foes) or the poise (the chief). Returns true if it died */
export function damageFoe(f: Foe, dmg: number, from: THREE.Vector3, o: { knock?: number; stagger?: number; poiseDmg?: number; quiet?: boolean; burn?: boolean } = {}): boolean {
  if (f.st === 'dead') return false;
  if (f.kind === 'dummy') {
    // never dies: rocks back from the blow and flashes
    const away = f.pos.clone().sub(from).setY(0); if (away.lengthSq() < 1e-4) away.set(0, 0, -1); away.normalize();
    const k = Math.min(1.6, 0.35 + dmg / 14) * (0.6 + 0.4 * (o.knock ?? 1)) * 3.2;
    f.wob.vx += away.z * k; f.wob.vz -= away.x * k; f.lastDmg = dmg;
    if (!o.burn) f.a.hit(Math.min(1.4, 0.5 + dmg / 18));
    return false;
  }
  // the boss's roar: the blow glances off
  if (f.inv > 0) { f.a.tint(0xffffff, 1); fxSparks(f.a.chest(), 0xfff6d0, 10, 4); return false; }
  f.hp -= dmg; f.lastDmg = dmg;
  const away = f.pos.clone().sub(from).setY(0); if (away.lengthSq() < 1e-4) away.set(0, 0, -1); away.normalize();
  if (!o.burn) {
    // poise foes in the middle of an attack only flinch (the wind-up's pose stays readable); everyone else plays the hurt
    if (f.d.poise > 0 && (f.st === 'windup' || f.st === 'strike')) f.a.hit(Math.min(1.4, 0.5 + dmg / 18)); else f.a.hurt(Math.min(1.6, 0.5 + dmg / 18));
    f.vel.addScaledVector(away, ((o.knock ?? 1) * 6 * TUNE.knock) / f.d.mass);
  }
  if (f.hp <= 0) { f.hp = 0; f.st = 'dead'; f.attacking = false; dropTeles(f); return true; }
  if (o.burn) return false;
  if (f.d.poise > 0) {
    f.poise -= o.poiseDmg ?? dmg;
    if (f.poise <= 0) { f.poise = f.d.poise; dropTeles(f); f.attacking = false; f.lunge = null; f.combo = 0; setSt(f, 'stagger', 1.3); f.a.play(new Action('hurt', 1.0, 0.1, { power: 1.6 })); cue('shatter', 0.6); }
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
    const q = this.p.clone(); w.clamp(q, 0); if (q.distanceTo(this.p) > 0.3 || this.life <= 0) { fxSparks(this.p, 0xc0a080, 5, 2); this.kill(); }
  }
  /** cut out of the air: sent off flat along dir, fast, and now it hurts the foes */
  deflect(dir: THREE.Vector3) {
    fxSparks(this.p, 0xfff0c0, 18, 6); cue('block', 0.9);
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
    const q = this.p.clone(); w.clamp(q, 0); if (q.distanceTo(this.p) > 0.3 || this.life <= 0) this.burst(w);
  }
  private burst(w: FoeWorld) {
    const c = V3(this.p.x, 0.06, this.p.z), col = this.friendly ? 0xffd070 : 0xff8a30;
    fxRing(c, col, TALIS.r, { life: 0.35 } as never); fxSparks(this.p, 0xffb050, 22, 5); fxGlow(this.p, col, 1.6, 0.25);
    fxSmoke(c.clone().setY(0.4), 0x5a4a3a, 6, { r: 0.5, s: 0.4, life: 0.7 }); cue('impact', 0.7);
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
    fxBolt(top, g, 0xfff2a0, { jag: 0.5, seg: 10, width: 0.24, life: 0.3 }); fxBolt(top.clone().add(V3(R(-0.4, 0.4), 0, R(-0.4, 0.4))), g, 0xc8e0ff, { width: 0.12, life: 0.22, branch: false });
    fxShock(g, 0xfff0a0, this.r + 0.3, { life: 0.4 }); fxSparks(g.clone().setY(0.3), 0xfff4c0, 24, 7); fxGlow(g.clone().setY(0.8), 0xfff2b0, 2.2, 0.25);
    cue('crit', 0.8); shake(0.22 * TUNE.shake);
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
