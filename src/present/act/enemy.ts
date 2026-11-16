// 敌人（动作原型）：四种，每种一套状态机，出招前一定先在地上亮预警（tele.ts），预警长满的那一帧就是打击帧。
//   山贼：冲上来，扇形劈砍。挨打会被打断（硬直）。
//   山犬：绕到侧面，伏低，地上亮一条长条，然后扑咬冲过去。
//   弓手：保持距离，人近了就后撤；瞄准时地上一条细线跟着你，最后 0.25 秒锁死，然后放箭（箭是飞行物，能躲）。
//   山贼头目：慢、血厚、有「架势」（普通攻击打不出硬直，架势被打空才晕）；扇形重劈和前方砸地两种。
// 同时出手的敌人有上限（TUNE.maxAttackers），其余的绕着你走位，场面读得清。
// 能跳过去的「低招」：山犬的扑咬、头目的砸地。这两种的地面预警带白色横纹（tele.ts），主角离地够高时打不中。
// 木人桩（练武场）：不动、不出招、打不死，挨打会晃。
// 箭：被刀砍到就随机弹飞（show.ts 定方向），弹飞的箭打着转、拖金光，能打中敌人（11-16 用户：「弓箭应该要被随机弹飞，
// 可以造成砍到其他地方去打到敌人的效果」）。
import * as THREE from 'three';
import { V3, scene, R } from '../engine/world';
import { BattleActor } from '../bestiary/battle';
import { Action } from '../actors/rig';
import { Tele, inside, type TeleShape } from './tele';
import { TUNE } from './tune';
import { toon } from '../look/toon';
import { cue } from '../../audio/cues';
import { fxSparks, fxSmoke, trailSeg } from '../fx/fx';

export type EKind = 'bandit' | 'dog' | 'archer' | 'chief' | 'dummy';
interface EDef { model: string; hp: number; r: number; speed: number; mass: number; poise: number; gold: number; name: string }
export const EDEFS: Record<EKind, EDef> = {
  bandit: { model: 'jp_bandit', hp: 40, r: 0.42, speed: 2.7, mass: 1, poise: 0, gold: 3, name: '山贼' },
  dog: { model: 'jp_dog', hp: 24, r: 0.45, speed: 4.2, mass: 0.7, poise: 0, gold: 2, name: '山犬' },
  archer: { model: 'jp_archer', hp: 28, r: 0.42, speed: 2.6, mass: 0.9, poise: 0, gold: 3, name: '弓手' },
  chief: { model: 'jp_bandit_chief', hp: 260, r: 0.8, speed: 1.9, mass: 3.2, poise: 46, gold: 20, name: '山贼头目' },
  dummy: { model: 'act_dummy', hp: 999, r: 0.45, speed: 0, mass: 99, poise: 0, gold: 0, name: '木人桩' },
};

type St = 'enter' | 'move' | 'windup' | 'strike' | 'recover' | 'stagger' | 'dead';
export interface Foe {
  kind: EKind; d: EDef; a: BattleActor; hp: number; maxHp: number; pos: THREE.Vector3; vel: THREE.Vector3; yaw: number;
  st: St; t: number; dur: number; tele: Tele | null; teleYaw: number; telePos: THREE.Vector3; shape: TeleShape | null; dmg: number;
  cd: number; poise: number; attacking: boolean; hitHero: boolean; lunge: THREE.Vector3 | null; strafe: number; move: string;
  /** the last blow's numbers (death form) */ lastDmg: number; burn: number; burnT: number; frozen: number; uid: number;
  /** the dummy's wobble (lean angles and their speeds, rad) */ wob: { x: number; z: number; vx: number; vz: number };
}
/** the dummy's lean, read by its pose hook (yard.ts) */
export const WOBBLE = new WeakMap<object, { x: number; z: number }>();
export interface FoeWorld {
  heroPos: THREE.Vector3; heroR: number; heroAlive: boolean; /** the hero's height off the ground (a jump clears low attacks) */ heroY: number;
  /** the hero is dashing (or just dashed): a near miss counts as a perfect dodge */ heroDodge: boolean;
  hurtHero(dmg: number, from: THREE.Vector3): void;
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

export function spawnFoe(kind: EKind, at: THREE.Vector3, face: THREE.Vector3): Foe {
  const d = EDEFS[kind], a = new BattleActor(d.model); a.place(at.clone()); a.faceToward(face); trimShadows(a.root, kind === 'chief' ? 6 : 3);
  const hp = Math.round(d.hp * TUNE.enemyHp);
  return { kind, d, a, hp, maxHp: hp, pos: a.home, vel: V3(), yaw: a.yaw, st: 'enter', t: 0, dur: 0.55, tele: null, teleYaw: 0, telePos: V3(), shape: null, dmg: 0,
    cd: R(0.4, 1.2), poise: d.poise, attacking: false, hitHero: false, lunge: null, strafe: Math.random() < 0.5 ? -1 : 1, move: '', lastDmg: 0, burn: 0, burnT: 0, frozen: 0, uid: UID++,
    wob: { x: 0, z: 0, vx: 0, vz: 0 } };
}

const setSt = (f: Foe, st: St, dur: number) => { f.st = st; f.t = 0; f.dur = dur; };
function startAttack(f: Foe, w: FoeWorld, shape: TeleShape, windup: number, dmg: number, yaw: number, at?: THREE.Vector3) {
  f.shape = shape; f.dmg = Math.round(dmg * TUNE.enemyDmg); f.teleYaw = yaw; f.telePos.copy(at ?? f.pos); f.hitHero = false; f.attacking = true;
  f.tele?.dispose(); f.tele = new Tele(shape, { low: isLow(f, shape) }); f.tele.set(f.telePos.x, f.telePos.z, yaw, 0);
  const wu = windup / TUNE.aggression; setSt(f, 'windup', wu);
  // the body's own wind-up: the attack action timed so its impact frame lands at the end of the wind-up
  const imp = f.kind === 'dog' ? 0.42 : 0.5, total = wu / imp;
  if (f.kind === 'archer') f.a.play(new Action('attack', total, imp)); else f.a.play(new Action('attack', total, imp, { dist: f.kind === 'chief' ? 0.4 : 0.6 }));
  void w;
}
/** the attacks a jump clears: the dog's lunge and the chief's slam */
const isLow = (f: Foe, s: TeleShape) => (f.kind === 'dog' && s.k === 'rect') || (f.kind === 'chief' && s.k === 'circle');
const attackers = (w: FoeWorld) => w.foes.filter(o => o.attacking && o.st !== 'dead').length;

export function updateFoe(f: Foe, w: FoeWorld, dt: number) {
  if (f.st === 'dead') return;
  if (f.kind === 'dummy') {
    // a stiff spring back to upright, well damped (a couple of swings after a hard hit)
    const o = f.wob, K = 140, D = 9;
    o.vx += (-K * o.x - D * o.vx) * dt; o.vz += (-K * o.z - D * o.vz) * dt; o.x += o.vx * dt; o.z += o.vz * dt;
    WOBBLE.set(f.a, { x: o.x, z: o.z }); return;
  }
  f.t += dt; f.cd -= dt;
  const toH = w.heroPos.clone().sub(f.pos).setY(0), dist = toH.length(), dir = dist > 1e-3 ? toH.clone().divideScalar(dist) : V3(0, 0, 1);
  const face = (y: number, k = 10) => { let dy = y - f.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; f.yaw += dy * Math.min(1, dt * k); };
  const yawTo = Math.atan2(dir.x, dir.z);
  // burning: ticks; frozen: stands still
  if (f.burn > 0) { f.burnT -= dt; if (f.burnT <= 0) { f.burnT = 0.5; f.burn--; damageFoe(f, 3, f.pos.clone().add(V3(0, 0, -1)), { quiet: true, burn: true }); } }
  if (f.frozen > 0) { f.frozen -= dt; f.vel.multiplyScalar(0.8); f.a.setRunning(false); integrate(f, w, dt); return; }
  const free = f.st === 'move';
  if (f.st === 'enter') { if (f.t >= f.dur) setSt(f, 'move', 0); }
  else if (f.st === 'stagger') { f.vel.multiplyScalar(Math.exp(-dt * 6)); if (f.t >= f.dur) { setSt(f, 'move', 0); f.cd = Math.max(f.cd, 0.3); } }
  else if (f.st === 'recover') { f.vel.multiplyScalar(Math.exp(-dt * 8)); if (f.t >= f.dur) { setSt(f, 'move', 0); f.attacking = false; } }
  else if (f.st === 'windup') {
    f.vel.multiplyScalar(Math.exp(-dt * 10));
    const p = f.t / f.dur;
    // aims track the hero early in the wind-up, then lock (so a dodge at the right time works)
    if (f.kind === 'archer' && p < 0.72) { f.teleYaw = yawTo; f.yaw = yawTo; }
    else if (f.kind === 'bandit' && p < 0.35) { f.teleYaw = yawTo; face(yawTo, 14); }
    else if (f.kind === 'dog' && p < 0.5) { f.teleYaw = yawTo; f.yaw = yawTo; }
    else if (f.kind === 'chief' && p < 0.3) { f.teleYaw = yawTo; face(yawTo, 6); }
    if (f.kind === 'chief' && f.shape?.k === 'circle') f.telePos.copy(f.pos);
    if (f.kind !== 'dog' || p < 0.5) f.telePos.copy(f.pos);
    f.tele?.set(f.telePos.x, f.telePos.z, f.teleYaw, p);
    if (f.t >= f.dur) strike(f, w);
  } else if (f.st === 'strike') {
    // the dog's lunge: it flies along the locked lane, biting once on contact
    if (f.lunge) {
      f.vel.copy(f.lunge);
      const dd = f.pos.distanceTo(w.heroPos);
      if (!f.hitHero && w.heroAlive && dd < f.d.r + w.heroR + 0.15) { f.hitHero = true; if (w.heroY < LOW_CLEAR) w.hurtHero(f.dmg, f.pos.clone()); else w.dodged(f.pos.clone()); }
      else if (!f.hitHero && w.heroAlive && w.heroDodge && dd < f.d.r + w.heroR + 1.1) { f.hitHero = true; w.dodged(f.pos.clone()); }
    }
    if (f.t >= f.dur) { f.lunge = null; f.vel.multiplyScalar(0.2); setSt(f, 'recover', f.kind === 'dog' ? 0.7 : f.kind === 'chief' ? 0.9 : 0.6); }
  }
  if (free) think(f, w, dt, dist, dir, yawTo, face);
  else if (f.st !== 'windup' && f.st !== 'strike') f.a.setRunning(false);
  f.tele?.update(dt);
  if (f.tele?.done) f.tele = null;
  integrate(f, w, dt);
}

/** free movement: close in / keep away / circle, and decide when to attack */
function think(f: Foe, w: FoeWorld, dt: number, dist: number, dir: THREE.Vector3, yawTo: number, face: (y: number, k?: number) => void) {
  const can = w.heroAlive && f.cd <= 0 && attackers(w) < TUNE.maxAttackers, side = V3(dir.z, 0, -dir.x).multiplyScalar(f.strafe);
  let want = V3(), sp = f.d.speed;
  if (f.kind === 'bandit') {
    if (dist > 1.7) want.copy(dir).addScaledVector(side, attackers(w) >= TUNE.maxAttackers ? 0.8 : 0.15);
    else if (!can) want.copy(side).addScaledVector(dir, -0.4);
    if (can && dist < 2.1) { startAttack(f, w, { k: 'cone', r: 2.2, half: 0.95 }, 0.62, 10, yawTo); return; }
  } else if (f.kind === 'dog') {
    if (dist > 5.2) want.copy(dir); else if (dist < 3.0) want.copy(dir).multiplyScalar(-0.6).add(side); else want.copy(side).addScaledVector(dir, 0.2);
    if (can && dist < 5.6 && dist > 2.2) { startAttack(f, w, { k: 'rect', len: 5.2, w: 1.0 }, 0.55, 8, yawTo); return; }
  } else if (f.kind === 'archer') {
    if (dist < 4.4) { want.copy(dir).multiplyScalar(-1).addScaledVector(side, 0.5); sp *= 1.1; }
    else if (dist > 8.5) want.copy(dir);
    else want.copy(side).multiplyScalar(0.6);
    if (can && dist < 10 && dist > 2.6) { startAttack(f, w, { k: 'line', len: Math.min(11, dist + 3) }, 0.9, 8, yawTo); return; }
  } else {
    if (dist > 2.0) want.copy(dir);
    if (can && dist < 2.8) {
      if (Math.random() < 0.5) startAttack(f, w, { k: 'cone', r: 3.0, half: 0.85 }, 0.85, 15, yawTo);
      else startAttack(f, w, { k: 'circle', r: 2.5, ahead: 1.5 }, 1.1, 20, yawTo);
      return;
    }
  }
  const m = want.length();
  if (m > 0.05) { want.multiplyScalar(sp / m); face(Math.atan2(want.x, want.z) * (f.kind === 'archer' ? 0 : 1) + (f.kind === 'archer' ? yawTo : 0), 8); }
  else face(yawTo, 6);
  f.vel.lerp(want, Math.min(1, dt * 6));
  f.a.setRunning(f.vel.length() > 0.6);
  if (Math.random() < dt * 0.25) f.strafe *= -1;
}

function strike(f: Foe, w: FoeWorld) {
  const s = f.shape!; f.tele?.flash();
  if (f.kind === 'dog') { const d = V3(Math.sin(f.teleYaw), 0, Math.cos(f.teleYaw)); f.lunge = d.multiplyScalar(s.k === 'rect' ? s.len / 0.36 : 10); setSt(f, 'strike', 0.36); f.yaw = f.teleYaw; cue('roar', 0.35); return; }
  setSt(f, 'strike', 0.18);
  if (f.kind === 'archer') { w.arrows.push(new Arrow(f.pos.clone().add(V3(0, 1.25, 0)), f.teleYaw, f.dmg)); cue('whoosh', 0.5); return; }
  cue(f.kind === 'chief' ? 'crit' : 'whoosh', f.kind === 'chief' ? 0.7 : 0.6);
  if (f.kind === 'chief' && s.k === 'circle') { const c = f.pos.clone().add(V3(Math.sin(f.teleYaw) * s.ahead, 0.05, Math.cos(f.teleYaw) * s.ahead)); fxSmoke(c, 0x8a7a6a, 10, { r: 1.4, spd: 2, up: 0.6, s: 0.5, life: 0.8 }); fxSparks(c.clone().add(V3(0, 0.2, 0)), 0xffc080, 16, 6); }
  const cleared = isLow(f, s) && w.heroY >= LOW_CLEAR;
  if (w.heroAlive && inside(s, f.telePos.x, f.telePos.z, f.teleYaw, w.heroPos.x, w.heroPos.z, w.heroR)) { if (cleared) w.dodged(f.pos.clone()); else w.hurtHero(f.dmg, f.pos.clone()); }
  // dashed out of it just in time (the hero is near the area while dashing): a perfect dodge too
  else if (w.heroAlive && w.heroDodge && inside(s, f.telePos.x, f.telePos.z, f.teleYaw, w.heroPos.x, w.heroPos.z, w.heroR + 1.1)) w.dodged(f.pos.clone());
}

function integrate(f: Foe, w: FoeWorld, dt: number) {
  f.pos.addScaledVector(f.vel, dt);
  // keep apart from each other and out of the hero
  for (const o of w.foes) if (o !== f && o.st !== 'dead') { const d = f.pos.clone().sub(o.pos).setY(0), l = d.length(), m = f.d.r + o.d.r; if (l < m && l > 1e-4) f.pos.addScaledVector(d, ((m - l) / l) * (o.d.mass / (o.d.mass + f.d.mass))); }
  if (w.heroAlive && f.st !== 'strike' && w.heroY < 0.6) { const d = f.pos.clone().sub(w.heroPos).setY(0), l = d.length(), m = f.d.r + w.heroR; if (l < m && l > 1e-4) f.pos.addScaledVector(d, (m - l) / l); }
  w.clamp(f.pos, f.d.r);
  f.a.yaw = f.yaw;
}

/** an attack broken off (a parry caught it): the warning goes, the foe reels */
export function interruptFoe(f: Foe, reel = 0.9) {
  if (f.st === 'dead' || f.kind === 'dummy') return;
  f.tele?.dispose(); f.tele = null; f.attacking = false; f.lunge = null; f.hitHero = true; setSt(f, 'stagger', reel); f.cd = Math.max(f.cd, reel + 0.3);
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
  f.hp -= dmg; f.lastDmg = dmg;
  const away = f.pos.clone().sub(from).setY(0); if (away.lengthSq() < 1e-4) away.set(0, 0, -1); away.normalize();
  if (!o.burn) { f.a.hurt(Math.min(1.6, 0.5 + dmg / 18)); f.vel.addScaledVector(away, ((o.knock ?? 1) * 6 * TUNE.knock) / f.d.mass); }
  if (f.hp <= 0) { f.hp = 0; f.st = 'dead'; f.attacking = false; f.tele?.dispose(); f.tele = null; return true; }
  if (o.burn) return false;
  if (f.d.poise > 0) {
    f.poise -= o.poiseDmg ?? dmg;
    if (f.poise <= 0) { f.poise = f.d.poise; f.tele?.dispose(); f.tele = null; f.attacking = false; f.lunge = null; setSt(f, 'stagger', 1.3); f.a.play(new Action('hurt', 1.0, 0.1, { power: 1.6 })); cue('shatter', 0.6); }
  } else if ((o.stagger ?? 0.28) > 0 && f.st !== 'strike') {
    // light foes: a hit breaks the wind-up (reward for pressing in)
    f.tele?.dispose(); f.tele = null; f.attacking = false; f.lunge = null; setSt(f, 'stagger', o.stagger ?? 0.28); f.cd = Math.max(f.cd, 0.25);
  }
  return false;
}

// ------------------------------------------------------------------ arrows
const arrowGeo = (() => { const g = new THREE.BoxGeometry(0.05, 0.05, 0.78); return g; })();
const arrowMat = toon(0x8a6a44), fletchMat = toon(0xe8e0d0);
export class Arrow {
  g = new THREE.Group(); v: THREE.Vector3; life = 1.6; dead = false;
  /** batted away by a cut: flies at the foes, tumbling end over end, with a gold trail */
  friendly = false; private body = new THREE.Group(); private spinAxis = new THREE.Vector3(1, 0, 0); private grazed = false;
  constructor(public p: THREE.Vector3, yaw: number, public dmg: number) {
    const shaft = new THREE.Mesh(arrowGeo, arrowMat), fl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.14), fletchMat), tip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.1), toon(0xc0c8d4));
    fl.position.z = -0.34; tip.position.z = 0.42; this.body.add(shaft, fl, tip); this.g.add(this.body); this.g.rotation.y = yaw; this.g.position.copy(p); scene.add(this.g);
    this.v = V3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(14);
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
