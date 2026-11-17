// 主角的操控：移动（慢走、推满奔跑）、五段连斩（横斩 → 反撩 → 回身旋斩 → 连刺两下 → 跃起重劈；按键缓冲、出刀后可以接冲刺或跳取消；
// 每一刀往前冲 TUNE.atkLunge 米乘各段倍数，前面有敌人就冲到离它 TUNE.lungeStop 米停下）、按住蓄力 → 松开突进斩、冲刺（无敌帧 + 残影）、
// 跳（空中能转向、能冲刺；空中按斩 = 下劈，落地一圈冲击）、影分身（烟遁，两道分身斩开身边的敌人）、挨打（硬直 + 无敌闪烁）、倒下。
// 出刀自动吸附：起手时朝摇杆方向 ±70° 内最近的敌人转身，没有就朝摇杆方向（手机上不用精确瞄准）。
// 跳的抛物线由「最高点」和「滞空时间」两个参数定（TUNE.jumpH / jumpT）：起跳速度 = 4H/T，重力 = 8H/T²。
import * as THREE from 'three';
import { V3 } from '../engine/world';
import { BattleActor } from '../bestiary/battle';
import { Action } from '../actors/rig';
import type { ModelDef } from '../bestiary/models';
import { fxAfterimage } from '../fx/skillFx';
import { fxSparks } from '../fx/fx';
import { dustBlocks } from '../kyoto/ninja_fx';
import { addBlock } from '../fx/blocks';
import { cue } from '../../audio/cues';
import { ACT_NINJA, motionOf } from './ninjaAct';
import { TUNE } from './tune';
import type { Input } from './input';
import { trimShadows, type Foe } from './enemy';
import { newPerks, v, v2, type Perks } from './boons';

export type HSt = 'free' | 'k1' | 'k2' | 'k3' | 'k4' | 'k5' | 'charge' | 'rel' | 'dash' | 'dcut' | 'noto' | 'hurt' | 'dead' | 'air' | 'plunge' | 'plungeL' | 'launch' | 'kick';
/** one cut's numbers: impact moments (share of the action), extra range, arc (rad, full width), damage per impact, knock,
 *  lunge (× TUNE.atkLunge), heavy (the finisher's stagger / FX) */
interface Swing { imps: number[]; range: number; half: number; dmg: () => number; knock: number; lunge: number; heavy: boolean }
type Cut = 'k1' | 'k2' | 'k3' | 'k4' | 'k5';
const SW: Record<Cut, Swing> = {
  k1: { imps: [0.42], range: 0, half: 1.3, dmg: () => TUNE.atkDmg, knock: 0.55, lunge: 1.0, heavy: false },
  k2: { imps: [0.4], range: 0, half: 1.4, dmg: () => TUNE.atkDmg, knock: 0.6, lunge: 0.8, heavy: false },
  // the turning cut: all the way round
  k3: { imps: [0.5], range: 0.15, half: 9, dmg: () => TUNE.atkDmg, knock: 0.9, lunge: 0.4, heavy: false },
  // two lunging thrusts: a long narrow line, each thrust carries half the step in
  k4: { imps: [0.3, 0.56], range: 0.8, half: 0.3, dmg: () => Math.max(2, Math.round(TUNE.atkDmg * 0.8)), knock: 0.5, lunge: 1.4, heavy: false },
  k5: { imps: [0.5], range: 0.35, half: 1.5, dmg: () => TUNE.finDmg, knock: 1.7, lunge: 1.5, heavy: true },
};
const NEXT: Record<Cut, Cut | null> = { k1: 'k2', k2: 'k3', k3: 'k4', k4: 'k5', k5: null };
const PLUNGE_HANG = 0.1, PLUNGE_V = 22, FLIP_T = 0.42;
/** the dart throw's length and the moment the dart leaves the hand (s) */
const DART_T = 0.26, DART_REL = 0.12;
/** act-27: holding the dart button this long turns the throw into an aimed one */
const AIM_T = 0.2;
/** 穿风斩: the whole move and its dash part (s) */
const DCUT_T = 0.42, DCUT_MOVE = 0.17;
/** the sheathing after 见切 (s), and the moment the blade clicks home (fraction of it) */
const NOTO_T = 0.95, NOTO_CLICK = 0.64;

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
  dart(o: { from: THREE.Vector3; dir: THREE.Vector3 }): void;
  /** the blade is up: arrows inside this arc are batted away (called every frame of a cut's guard window) */
  guard(o: { from: THREE.Vector3; yaw: number; range: number }): void;
  /** the direction to the nearest arrow flying at the hero within reach (cuts turn to meet it), or null */
  incoming(reach: number): THREE.Vector3 | null;
  /** 居合 · 见切 at the draw: an attack about to land on the hero within `win` seconds is caught now (show.ts breaks it off, throws
   *  the attacker, sends arrows back); returns where the attacker stands (the draw goes at it), or null */
  iaiCatch(win: number): THREE.Vector3 | null;
  /** the plunge lands: a ring of impact round the hero */
  slam(o: { at: THREE.Vector3; r: number; dmg: number; yaw: number }): number;
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
  private hits = 0; private lungeLen = 0;
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
  get dodging() { const bonus = v(this.perks, 'evade') / 100; return (this.st === 'dash' && this.t < TUNE.dashIframe + 0.04) || (bonus > 0 && this.age - this.dashEndAt < Math.min(TUNE.dashTime, TUNE.dashIframe + 0.04) * bonus); }
  /** during a dash or just after it: an attack that would have caught the hero, or passes close, counts as a perfect dodge */
  get dodgeWin() { return this.st === 'dash' || this.age - this.dashEndAt < 0.18 * (1 + v(this.perks, 'evade') / 100); }
  private age = 0; private dashEndAt = -9;
  private chargeK = 0; private relFrom = V3(); private relTo = V3(); private dashDir = V3(); private ghostT = 0;
  /** time into a dart throw (-1 = none); the dart leaves the hand at DART_REL of it */
  private dartT = -1; private dartDir = V3(); private dartGone = true; private dartBack = false;
  /** act-27: aiming a dart (the button held) and where; spUsed = this press already went into a derivative / 回身镖 */
  aiming = false; readonly aimDir = V3(0, 0, 1); private spUsed = false;
  /** 回身镖 is once per dash; 穿风斩's start point and whether its sweep has landed; 追影's cut hits harder */
  private dashDarted = false; private dcutFrom = V3(); private dcutHit = false; private chaseOn = false;
  /** act-19 刀谱 (the user: 「很多都应该做进强化」): the moves this run has unlocked — chase 寻声, backDart 回身镖, dbl 二段跳,
   *  launch 挑空斩, cutDart 近身三镖, keep 游身不断招, pause 停顿变招 (the yard unlocks them all; show sets this) */
  moves: Record<string, boolean> = {};
  private has(id: string) { return !!this.moves[id]; }
  /** 游身不断招: the cut that comes next after a dash out of the combo, and how long it stays on offer */
  private keepNext: Cut | null = null; private keepT = 0;
  /** 停顿变招: the window after the 2nd cut finished in which a press turns the 3rd into the double spin */
  private pauseT = 0; private spinsLeft = 0; private bigSpin = false;
  /** 挑空斩: its blow has gone out; 近身三镖: the next throw is a fan of three */
  private launchHit = false; private fanNext = false;
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
  /** 0..1 while holding a charge (the HUD and the ring under the hero show it), else 0 */
  get charge() { return this.st === 'charge' ? this.chargeK : 0; }
  get airborne() { return this.y > 0.01; }
  get iframe() { return this.inv > 0 || (this.st === 'dash' && this.t < TUNE.dashIframe * (1 + v(this.perks, 'evade') / 100)) || (this.st === 'rel' && this.t < this.dur * 0.55) || (this.st === 'dcut' && this.t < DCUT_MOVE + 0.05); }
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
  private startCut(n: Cut, w: HeroWorld, chase = false, big = false) {
    this.chaseOn = chase; this.bigSpin = big;
    const dur = TUNE[n] / (TUNE.atkSpeed * (1 + v(this.perks, 'quick') / 100)); this.set(n, dur); this.next = null; const tgt = this.aim(w);
    this.counterCut = this.counterT > 0; if (this.counterCut) this.counterT = 0;
    // the step in: TUNE.atkLunge × this cut's share; with a foe ahead, stop TUNE.lungeStop short of it
    const full = TUNE.atkLunge * SW[n].lunge;
    this.lungeLen = tgt ? Math.max(0, Math.min(full, tgt.pos.distanceTo(this.pos) - (tgt.d.r + TUNE.lungeStop))) : full;
    this.a.play(new Action(n, dur, SW[n].imps[0])); cue(n === 'k5' ? 'swishHeavy' : 'swish', n === 'k5' ? 0.8 : n === 'k3' ? 0.7 : 0.5);
  }
  private startDash(w: HeroWorld) {
    const s = w.stickWorld(); this.dashDir.copy(s.lengthSq() > 0.04 ? s.normalize() : this.a.fwd());
    this.a.yaw = Math.atan2(this.dashDir.x, this.dashDir.z); this.set('dash', TUNE.dashTime); this.dashCd = TUNE.dashCd * (1 - v2(this.perks, 'evade') / 100); this.ghostT = 0; this.dashDarted = false;
    this.vy = 0;   // an air dash holds its height
    this.a.play(new Action('dashA', TUNE.dashTime * 1.4, 0.2)); cue('dash', 0.8);
  }
  private startJump() {
    this.v0 = (4 * TUNE.jumpH) / TUNE.jumpT; this.vy = this.v0; this.y = Math.max(this.y, 0.001); this.jumps = 1; this.flipT = -1; this.pendT = 0;
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
  /** 回据点 from the pause menu: she falls where she stands (the run ends as a death) */
  giveUp() { this.hp = 0; this.set('dead', 99); this.a.fall(); }
  hurt(dmg: number, from: THREE.Vector3): boolean {
    if (!this.alive || this.iframe) return false;
    this.hp = Math.max(0, this.hp - dmg); this.inv = TUNE.hurtIframe;
    const away = this.pos.clone().sub(from).setY(0); if (away.lengthSq() < 1e-4) away.set(0, 0, 1); away.normalize();
    this.vel.copy(away).multiplyScalar(7); motionOf(this.a).charge = 0;
    if (this.vy > 0) this.vy = 0;
    if (this.hp <= 0) { this.set('dead', 99); this.a.fall(); return true; }
    this.set('hurt', 0.26); this.a.play(new Action('hurt', 0.4, 0.1, { power: 1.2 })); this.a.hit(1);
    return true;
  }
  update(dt: number, inp: Input, w: HeroWorld) {
    const m = motionOf(this.a), B = inp.b;
    this.showBlade();
    this.t += dt; this.age += dt; this.keepT = Math.max(0, this.keepT - dt); this.pauseT = Math.max(0, this.pauseT - dt); this.parryT = Math.max(0, this.parryT - dt); this.fullT = Math.max(0, this.fullT - dt); this.counterT = Math.max(0, this.counterT - dt); this.inv = Math.max(0, this.inv - dt); this.dashCd -= dt; this.dartCd -= dt;
    if (this.dartReload > 0) { this.dartReload -= dt; if (this.dartReload <= 0) { this.dartReload = 0; this.dartAmmo = TUNE.dartCharges; } } m.land = Math.max(0, m.land - dt / 0.16);
    // buffers: a press counts for a short while (so a press slightly early still chains)
    const A = B.attack;
    if (A.pressed) this.atkEaten = false;
    const tap = A.released && A.last < TUNE.holdToCharge && !this.atkEaten, holding = A.down && A.held >= TUNE.holdToCharge && !this.atkEaten;
    this.buf.atk = tap ? 0.2 : Math.max(0, this.buf.atk - dt);
    this.buf.press = A.pressed ? 0.2 : Math.max(0, this.buf.press - dt);
    this.pendT = Math.max(0, this.pendT - dt);
    if (this.flipT >= 0) { this.flipT += dt; if (this.flipT >= FLIP_T) this.flipT = -1; }
    this.buf.dash = B.dash.pressed ? 0.15 : Math.max(0, this.buf.dash - dt);
    this.buf.sp = B.special.pressed ? 0.15 : Math.max(0, this.buf.sp - dt);
    this.buf.jump = B.jump.pressed ? 0.12 : Math.max(0, this.buf.jump - dt);
    // flicker while invulnerable after a hit
    this.a.root.visible = this.st === 'dead' || this.inv <= 0 || Math.floor(this.inv * 18) % 2 === 0;
    if (this.st === 'dead') { this.vel.multiplyScalar(Math.exp(-dt * 6)); this.fall(dt); this.move(dt, w); m.run = 0; m.air = this.y; return; }
    const stick = w.stickWorld(), sl = Math.min(1, stick.length());
    const canDash = this.dashCd <= 0 && this.buf.dash > 0, canJump = this.buf.jump > 0 && !this.airborne;
    const steer = (accel: number) => {
      const want = stick.clone().multiplyScalar(TUNE.heroSpeed);
      this.vel.lerp(want, 1 - Math.exp(-accel * dt));
      if (sl > 0.1) { const y = Math.atan2(stick.x, stick.z); let dy = y - this.a.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; this.a.yaw += dy * Math.min(1, dt * 20); }
    };
    // 追影: a dart still stuck in a foe + a press of 斩 = a blink to it and a heavy cut; the combo carries on from there
    const cutting = this.st === 'k1' || this.st === 'k2' || this.st === 'k3' || this.st === 'k4' || this.st === 'k5';
    if (A.pressed && (this.st === 'free' || this.st === 'air' || this.st === 'dash' || cutting)) {
      const f = this.has('chase') ? w.chaseTarget() : null; if (f) { this.atkEaten = true; this.buf.atk = 0; this.buf.press = 0; this.startChase(f, w); }
    }
    // 飞镖 (act-27, user: 「飞刀要自动索敌一下，按住可以通过技能按钮指定方向」): a tap throws on release at the nearest foe (auto-aim);
    // held past AIM_T it is aimed — the finger dragged off the button (touch) or the stick (keys / pad) — with a line on the ground, and
    // goes on release. Free on the ground or in the air, it never stops the hero. (Holding no longer rapid-fires.)
    const SP = B.special, dartOk = (this.st === 'free' || this.st === 'air') && this.dartAmmo > 0;
    if (SP.pressed) { this.spUsed = false; this.aimDir.copy(this.a.fwd().setY(0).normalize()); }
    this.aiming = dartOk && SP.down && SP.held >= AIM_T && !this.spUsed;
    if (this.aiming) { const a = w.aimWorld?.(); if (a && a.lengthSq() > 1e-4) this.aimDir.copy(a).setY(0).normalize(); }
    if (SP.released && dartOk && !this.spUsed && this.dartCd <= 0) { this.buf.sp = 0; this.startDart(w, SP.last >= AIM_T ? this.aimDir.clone() : null); }
    if (this.dartT >= 0) {
      this.dartT += dt;
      if (!this.dartGone && this.dartT >= DART_REL) {
        this.dartGone = true;
        const hand = this.handL(), count = v(this.perks, 'darts3'), dirs = count === 5 ? [-0.36, -0.18, 0, 0.18, 0.36] : count === 3 || this.fanNext ? [-0.24, 0, 0.24] : [0]; this.fanNext = false;
        for (const a of dirs) { const d = this.dartDir.clone().applyAxisAngle(V3(0, 1, 0), a); w.dart({ from: hand, dir: d }); }
        cue('dartThrow', 0.6);
      }
      if (this.dartT >= DART_T || (this.st !== 'free' && this.st !== 'air' && this.st !== 'dash')) this.dartT = -1;
    }
    switch (this.st) {
      case 'free': {
        steer(TUNE.heroAccel);
        if (canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (canJump) { this.buf.jump = 0; this.startJump(); break; }
        // a tap cuts (at the release; a press begun in the last cut carries the combo on); a hold goes straight into the stance, no cut
        if (this.buf.atk > 0) {
          this.buf.atk = 0;
          // 游身不断招: out of a dash that broke off the combo, the combo goes on from the side
          if (this.keepT > 0 && this.keepNext && this.has('keep')) { const n = this.keepNext; this.keepNext = null; this.keepT = 0; this.pendT = 0; this.startCut(n, w); this.sideCut(w); break; }
          // 停顿变招: a beat's pause after the 2nd cut, then a press = the 3rd as a double spin that sweeps everyone outward
          if (this.pauseT > 0 && this.pauseT < 0.8 && this.has('pause')) { this.pauseT = 0; this.pendT = 0; this.spinsLeft = 2; this.startCut('k3', w, false, true); break; }
          const n = this.pendT > 0 && this.pendNext ? this.pendNext as Cut : 'k1'; this.pendT = 0; this.startCut(n, w); break;
        }
        if (holding) this.startCharge();
        break;
      }
      case 'air': {
        steer(TUNE.heroAccel * 0.7);
        this.vy -= this.gravity * dt; this.y += this.vy * dt;
        // the double jump: jump again in the air (once until landing)
        if (this.buf.jump > 0 && this.jumps < 2 && this.has('dbl')) { this.buf.jump = 0; this.startJump2(); break; }
        // in the air a press is the plunge at once (no stance up here); its release then does nothing
        if (this.buf.press > 0) { this.buf.press = 0; this.buf.atk = 0; this.atkEaten = true; this.startPlunge(w); break; }
        if (canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (this.y <= 0) this.landed(w);
        break;
      }
      case 'plunge': {
        this.vel.multiplyScalar(Math.exp(-dt * 10));
        if (this.t >= PLUNGE_HANG) { this.vy = -PLUNGE_V; this.y += this.vy * dt; }
        if (this.y <= 0) {
          this.y = 0; this.vy = 0; this.vel.set(0, 0, 0);
          w.slam({ at: this.pos.clone(), r: TUNE.plungeR, dmg: TUNE.plungeDmg, yaw: this.a.yaw });
          this.set('plungeL', 0.34); this.a.play(new Action('plungeL', 0.34, 0.05));
        }
        break;
      }
      case 'plungeL': {
        this.vel.multiplyScalar(Math.exp(-dt * 14));
        if (this.t > 0.12 && canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (this.t > 0.12 && canJump) { this.buf.jump = 0; this.startJump(); break; }
        if (this.t >= this.dur) this.set('free', 0);
        break;
      }
      case 'k1': case 'k2': case 'k3': case 'k4': case 'k5': {
        const cut = this.st as Cut, sw = SW[cut], k = this.t / this.dur, i0 = sw.imps[0];
        // the lunge: one cut steps in over the wind-up into its blow; a multi-blow cut steps a share in with each blow
        const n = sw.imps.length, win = n > 1 ? 0.1 : 0.26, ahead = this.a.fwd();
        const inWin = n > 1 ? sw.imps.some(i => k > i - 0.08 && k < i + 0.02) : k > i0 - 0.22 && k < i0 + 0.04;
        const lungeV = inWin ? this.lungeLen / n / (this.dur * win) : 0;
        this.vel.copy(ahead).multiplyScalar(lungeV);
        while (this.hits < sw.imps.length && k >= sw.imps[this.hits]) {
          this.hits++; this.hitDone = true;
          w.swing({ from: this.pos.clone(), yaw: this.a.yaw, range: TUNE.atkRange + sw.range + (this.bigSpin ? 0.9 : 0), half: sw.half / 2 + (cut === 'k4' ? 0.1 : 0.35), dmg: Math.round(sw.dmg() * (this.chaseOn && this.hits === 1 ? 1.5 : 1)), knock: this.bigSpin ? 1.9 : sw.knock, heavy: sw.heavy || (this.chaseOn && this.hits === 1), kind: cut, n: this.hits, counter: this.counterCut && this.hits === 1 });
        }
        // the guard window: from the start of the cut until TUNE.deflectWin after (0.1 s before) the last blow, the blade bats arrows away
        const ts = this.t, lastI = sw.imps[sw.imps.length - 1];
        if (ts >= 0.03 && ts <= Math.max(sw.imps[0] * this.dur - 0.1 + TUNE.deflectWin, lastI * this.dur - 0.1 + TUNE.deflectWin * 0.6)) w.guard({ from: this.pos.clone(), yaw: this.a.yaw, range: TUNE.atkRange + sw.range + 0.5 });
        // the left-hand follow-up on the 2nd cut: a small extra hit
        if (this.st === 'k2' && !this.hit2Done && k >= 0.62) { this.hit2Done = true; w.swing({ from: this.pos.clone(), yaw: this.a.yaw, range: TUNE.atkRange * 0.8, half: 0.5, dmg: Math.max(2, Math.round(TUNE.atkDmg * 0.35)), knock: 0.3, heavy: false, kind: 'kunai' }); }
        if (A.pressed) { this.pendNext = NEXT[cut]; this.pendT = 0.45; }
        if (this.buf.atk > 0) this.next = NEXT[cut];
        // a press held in the cut: after the blow lands it turns into the stance (the next cut is not queued by a hold)
        if (this.hitDone && holding) { this.startCharge(); break; }
        // cancels: after the blow lands a dash or a jump cuts the recovery; the next cut starts a little after the impact
        // 近身三镖: after the blow, the dart button = three darts from the left hand straight into the face of the foe
        if (this.hitDone && this.buf.sp > 0 && this.has('cutDart') && this.dartAmmo > 0 && this.dartCd <= 0) { this.buf.sp = 0; this.spUsed = true; this.fanNext = true; this.set('free', 0); this.startDart(w); break; }
        // 游身不断招: a dash out of the combo keeps its place in it for a moment
        if (this.hitDone && canDash) { if (this.has('keep') && NEXT[cut]) { this.keepNext = NEXT[cut]; this.keepT = TUNE.dashTime + 0.45; } this.buf.dash = 0; this.startDash(w); break; }
        // 挑空斩: after the blow, jump = a rising cut that throws the light foes up, the hero going up after them
        if (this.hitDone && canJump) { this.buf.jump = 0; if (this.has('launch') && !this.airborne) this.startLaunch(w); else this.startJump(); break; }
        // 停顿变招: the second spin follows the first at once
        if (cut === 'k3' && this.spinsLeft > 1 && k >= 0.9) { this.spinsLeft--; this.startCut('k3', w, false, true); break; }
        // the next cut waits until this one has played out to TUNE.chainAt (the recovery is part of the rhythm)
        const last = sw.imps[sw.imps.length - 1];
        if (this.next && k >= Math.max(last + 0.12, TUNE.chainAt)) { const n = this.next as Cut; this.buf.atk = 0; this.startCut(n, w); break; }
        if (k >= 1) { if (cut === 'k2' && this.has('pause')) this.pauseT = 0.95; this.spinsLeft = 0; this.set('free', 0); }
        break;
      }
      case 'kick': {
        // a low flying kick: the body shoots on along the dash, the foot lands at KICK_IMP, then it drops and recovers
        const k = this.t / this.dur;
        this.vel.copy(this.dashDir).multiplyScalar(k < 0.38 ? 8.5 : 8.5 * Math.exp(-(k - 0.38) * 9));
        if (!this.kickHit && k >= 0.3) { this.kickHit = true; this.hitDone = true; w.kick?.({ from: this.pos.clone(), dir: this.dashDir.clone(), dmg: Math.round(TUNE.atkDmg * 1.3) }); }
        if (this.kickHit && k > 0.55 && canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (this.t >= this.dur) this.set('free', 0);
        break;
      }
      case 'launch': {
        // the rising cut: a short step in, the blow at LAUNCH_IMP, then up into the air after the foes
        const k = this.t / this.dur; this.vel.copy(this.a.fwd()).multiplyScalar(k < 0.3 ? 2.2 : 0.4);
        if (!this.launchHit && k >= 0.3) {
          this.launchHit = true; this.hitDone = true;
          w.launch?.({ from: this.pos.clone(), yaw: this.a.yaw, range: TUNE.atkRange + 0.5, half: 0.95, dmg: Math.round(TUNE.atkDmg * 1.1) });
          this.vy = Math.sqrt(2 * this.gravity * 2.3); this.y = Math.max(this.y, 0.01); this.jumps = 1; this.set('air', 99); cue('swishHeavy', 0.8); cue('jump', 0.5);
        }
        break;
      }
      case 'charge': {
        const chargeFull = TUNE.chargeFull * (1 - v(this.perks, 'draw') / 100);
        this.chargeK = Math.min(1, this.chargeK + dt / chargeFull); m.charge = this.chargeK;
        this.vel.lerp(stick.clone().multiplyScalar(TUNE.heroSpeed * TUNE.stanceSpeed), 1 - Math.exp(-12 * dt));
        if (sl > 0.1) this.a.yaw = Math.atan2(stick.x, stick.z);
        if (this.chargeK >= 1 && this.chargeK - dt / chargeFull < 1) { cue('parry', 0.15); this.a.tint(0xfff4d0, 0.4); this.fullT = 0.35; }
        if (canDash) { m.charge = 0; this.buf.dash = 0; this.startDash(w); break; }
        if (!B.attack.down) {
          // the draw: an attack about to land is caught (见切) and the draw goes straight at the attacker; otherwise the long lunge
          m.charge = 0; this.iaiBonus = false;
          // (the world's parry sets iaiBonus for any catch — arrows too, which return no attacker position)
          const caught = w.iaiCatch(TUNE.iaiWin);
          let len = TUNE.relDist * (0.6 + 0.4 * this.chargeK);
          if (caught) { const d = caught.clone().sub(this.pos).setY(0); this.a.yaw = Math.atan2(d.x, d.z); len = Math.max(0.3, Math.min(len, d.length() - 1.0)); }
          else this.aim(w, 6);
          const dir = this.a.fwd();
          this.relFrom.copy(this.pos); this.relTo.copy(this.pos).addScaledVector(dir, len); w.clamp(this.relTo, this.r);
          const dur = 0.42; this.set('rel', dur); this.a.play(new Action('rel', dur, 0.3)); cue('draw', 0.9); cue('swishHeavy', 0.7);
          this.parryT = TUNE.iaiWin; this.iaiBonus = this.iaiBonus || !!caught;
        }
        break;
      }
      case 'rel': {
        const k = this.t / this.dur, u = Math.min(1, Math.max(0, (k - 0.12) / 0.3));
        const p = this.relFrom.clone().lerp(this.relTo, 1 - (1 - u) ** 3); this.vel.set(0, 0, 0); this.pos.x = p.x; this.pos.z = p.z;
        this.ghostT -= dt; if (k < 0.45 && this.ghostT <= 0) { this.ghostT = 0.04; fxAfterimage(this.pos.clone(), 1.9, 0xff5a3a, { life: 0.22, glow: 0.4 }); }
        if (!this.hitDone && k >= 0.36) { this.hitDone = true; w.sweep({ a: this.relFrom.clone(), b: this.pos.clone(), r: 1.05, dmg: Math.round(TUNE.relDmg * (1 + this.chargeK) * (this.iaiBonus ? 2 : 1)), knock: this.iaiBonus ? 2 : 1.4 }); }
        if (this.hitDone && canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (this.hitDone && canJump) { this.buf.jump = 0; this.startJump(); break; }
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
        this.ghostT -= dt; if (this.ghostT <= 0) { this.ghostT = 0.035; fxAfterimage(this.pos.clone().setY(this.y), 1.9, 0x5a6aa8, { life: 0.2, glow: 0.25 }); }
        if (this.t >= this.dur) {
          this.vel.multiplyScalar(0.35); this.dashEndAt = this.age;
          if (this.airborne) { this.set('air', 99); this.vy = 0; break; }
          this.set('free', 0);
          // a dash straight into an attack / a jump: the press during the dash starts it at once
          if (this.buf.atk > 0) { this.buf.atk = 0; if (this.keepT > 0 && this.keepNext && this.has('keep')) { const n = this.keepNext; this.keepNext = null; this.keepT = 0; this.startCut(n, w); this.sideCut(w); } else this.startCut('k1', w); }
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
          if (!this.dcutHit) { this.dcutHit = true; w.sweep({ a: this.dcutFrom.clone(), b: this.pos.clone(), r: 1.0, dmg: TUNE.dashCutDmg, knock: 1.0, col: 0xbfeaff, kind: 'dcut' }); }
        }
        if (this.dcutHit && canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (this.dcutHit && canJump) { this.buf.jump = 0; this.startJump(); break; }
        if (this.t >= this.dur) this.set('free', 0);
        break;
      }
      case 'hurt': this.vel.multiplyScalar(Math.exp(-dt * 9)); if (this.t >= this.dur) this.set(this.airborne ? 'air' : 'free', this.airborne ? 99 : 0); break;
    }
    // states that don't fly themselves still fall (a hit in the air)
    if (this.st !== 'air' && this.st !== 'plunge' && this.st !== 'dash') this.fall(dt);
    this.move(dt, w);
    const sp = Math.hypot(this.vel.x, this.vel.z), r = Math.min(1, sp / TUNE.heroSpeed);
    m.run = this.st === 'free' ? r : 0; m.phase += sp * (3.0 - 0.5 * r) * dt;
    m.air = this.y; m.rise = this.v0 > 0 ? this.vy / this.v0 : 0;
    m.flip = this.flipT >= 0 && this.airborne ? Math.min(1, this.flipT / FLIP_T) : 0;
    m.dart = this.dartT >= 0 ? Math.min(1, this.dartT / DART_T) : 0; m.dartBack = this.dartBack ? 1 : 0;
    m.creep = this.st === 'charge' ? Math.min(1, sp / Math.max(0.3, TUNE.heroSpeed * TUNE.stanceSpeed)) : 0;
    if (this.st !== 'charge') m.charge = 0;
  }
  private fall(dt: number) {
    if (this.y <= 0) { this.y = 0; return; }
    this.vy -= this.gravity * dt; this.y += this.vy * dt; if (this.y <= 0) { this.y = 0; this.vy = 0; }
  }
  private landed(w: HeroWorld) {
    this.y = 0; this.vy = 0; this.jumps = 0; this.flipT = -1; const m = motionOf(this.a); m.land = 1;
    dustBlocks(this.pos.clone(), 6); cue('land', 0.7);
    this.set('free', 0);
    // a press just before touching down: the cut / the next jump starts on landing
    if (this.buf.atk > 0) { this.buf.atk = 0; this.startCut('k1', w); }
    else if (this.buf.jump > 0) { this.buf.jump = 0; this.startJump(); }
  }
  private startCharge() { this.set('charge', 99); this.chargeK = 0; this.next = null; this.pendT = 0; this.a.act?.cancel(); this.a.act = null; cue('sheathe', 0.5); }
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
    this.dcutFrom.copy(this.pos); this.set('dcut', DCUT_T); this.dcutHit = false; this.ghostT = 0; this.dashCd = TUNE.dashCd * (1 - v2(this.perks, 'evade') / 100);
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
    const hand = this.handL(), spread = v(this.perks, 'darts3') === 5 ? [-0.36, -0.18, 0, 0.18, 0.36] : [-0.18, 0, 0.18];
    for (const a of spread) w.dart({ from: hand.clone(), dir: dir.clone().applyAxisAngle(V3(0, 1, 0), a) });
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
  get canKick() { return this.st === 'dash' && !this.airborne && this.has('kick'); }
  /** act-19 挑空斩 */
  private startLaunch(w: HeroWorld) {
    this.aim(w); this.set('launch', 0.42); this.launchHit = false; this.next = null; this.pendT = 0;
    this.a.play(new Action('k2', 0.42, 0.3)); cue('swish', 0.6);
  }
  /** act-19 游身不断招: the cut out of the dodge comes from the side — a pale streak along the step, the cut aimed at the nearest foe */
  private sideCut(w: HeroWorld) {
    const f = this.aim(w); fxAfterimage(this.pos.clone(), 1.9, 0x9ad8ff, { life: 0.3, glow: 0.45 }); cue('swish', 0.5);
    if (f) { const d = f.pos.clone().sub(this.pos).setY(0); if (d.lengthSq() > 1e-4) this.a.yaw = Math.atan2(d.x, d.z); }
  }
  private get cutting() { return this.st === 'k1' || this.st === 'k2' || this.st === 'k3' || this.st === 'k4' || this.st === 'k5'; }
  /** act-18 / 19 hints: what the buttons can do right now (each only when its 刀谱 is learnt) */
  get canBackDart() { return this.st === 'dash' && this.has('backDart') && !this.dashDarted && this.dartAmmo > 0; }
  get canDoubleJump() { return this.st === 'air' && this.has('dbl') && this.jumps < 2; }
  get canLaunch() { return this.cutting && this.hitDone && this.has('launch') && !this.airborne; }
  get canCutDart() { return this.cutting && this.hitDone && this.has('cutDart') && this.dartAmmo > 0 && this.dartCd <= 0; }
  get canKeep() { return this.keepT > 0 && !!this.keepNext && this.has('keep') && (this.st === 'free' || this.st === 'dash'); }
  get canPause() { return this.st === 'free' && this.pauseT > 0 && this.pauseT < 0.8 && this.has('pause'); }
  /** a dart leaves the hand: one fewer; the last one starts the reload */
  private useDart() { this.dartAmmo = Math.max(0, this.dartAmmo - 1); if (this.dartAmmo === 0) this.dartReload = TUNE.dartReload; }
  /** 收刀 after 见切: a flick of the blade (血振), across to the scabbard at the left hip, pushed home with a click, the hand on the hilt */
  private notoClicked = false;
  /** act-19 hid the blade once the sword was "in its sheath" (藏锋 / 归鞘). act-24 (user: 「收刀的时候刀怎么看不见了？」): the fine heroine
   *  has no scabbard and holds the blade along the outside of her left hip, so it stays in sight the whole time */
  private showBlade() {
    const b = (this.a.bones as Record<string, THREE.Object3D | undefined>).blade; if (!b) return;
    b.visible = true;
  }
  startNoto() { this.set('noto', NOTO_T); this.notoClicked = false; this.a.play(new Action('noto', NOTO_T, NOTO_CLICK)); }
  /** where the left hand is now (the dart's start) */
  private handL() { const b = this.a.bones?.offhand ?? this.a.bones?.foreL; return b ? b.localToWorld(V3(0, 0, 0)) : this.pos.clone().add(V3(0, 1.25, 0)).addScaledVector(V3(Math.cos(this.a.yaw), 0, -Math.sin(this.a.yaw)), 0.3); }
  private move(dt: number, w: HeroWorld) {
    this.pos.addScaledVector(this.vel, dt);
    // high in the air the hero passes over the foes; on the ground (and in a dash or the lunge) the usual push-out
    if (this.y < 0.6) for (const f of w.foes) if (f.st !== 'dead') { const d = this.pos.clone().sub(f.pos).setY(0), l = d.length(), mm = this.r + f.d.r; if (l < mm && l > 1e-4 && this.st !== 'dash' && this.st !== 'rel' && this.st !== 'dcut') this.pos.addScaledVector(d, (mm - l) / l * 0.6); }
    w.clamp(this.pos, this.r);
  }
}
