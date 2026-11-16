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
import { dustBlocks } from '../kyoto/ninja_fx';
import { addBlock } from '../fx/blocks';
import { cue } from '../../audio/cues';
import { ACT_NINJA, motionOf } from './ninjaAct';
import { TUNE } from './tune';
import type { Input } from './input';
import { trimShadows, type Foe } from './enemy';

export type HSt = 'free' | 'k1' | 'k2' | 'k3' | 'k4' | 'k5' | 'charge' | 'rel' | 'dash' | 'hurt' | 'dead' | 'air' | 'plunge' | 'plungeL';
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

export interface HeroWorld {
  foes: Foe[];
  /** a blade swing lands: the world applies damage, FX and the arrows it cuts. Returns how many it hit */
  swing(o: { from: THREE.Vector3; yaw: number; range: number; half: number; dmg: number; knock: number; heavy: boolean; kind: string; n?: number; counter?: boolean }): number;
  /** a path cut (the charge release): everything within r of the segment */
  sweep(o: { a: THREE.Vector3; b: THREE.Vector3; r: number; dmg: number; knock: number }): number;
  /** a dart leaves the left hand, flying along dir (show.ts flies it and lands its hits) */
  dart(o: { from: THREE.Vector3; dir: THREE.Vector3 }): void;
  /** 散手 · 三叶: darts go out three at a time */
  darts3: boolean;
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
  a: BattleActor; st: HSt = 'free'; t = 0; dur = 0; hp = TUNE.heroHp; maxHp = TUNE.heroHp;
  vel = V3(); inv = 0; dashCd = 0; dartCd = 0; private buf = { atk: 0, press: 0, dash: 0, sp: 0, jump: 0 };
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
  get dodging() { return this.st === 'dash' && this.t < TUNE.dashIframe + 0.04; }
  /** during a dash or just after it: an attack that would have caught the hero, or passes close, counts as a perfect dodge */
  get dodgeWin() { return this.st === 'dash' || this.age - this.dashEndAt < 0.18; }
  private age = 0; private dashEndAt = -9;
  private chargeK = 0; private relFrom = V3(); private relTo = V3(); private dashDir = V3(); private ghostT = 0;
  /** time into a dart throw (-1 = none); the dart leaves the hand at DART_REL of it */
  private dartT = -1; private dartDir = V3(); private dartGone = true;
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
  get iframe() { return this.inv > 0 || (this.st === 'dash' && this.t < TUNE.dashIframe) || (this.st === 'rel' && this.t < this.dur * 0.55); }
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
  private startCut(n: Cut, w: HeroWorld) {
    const dur = TUNE[n] / TUNE.atkSpeed; this.set(n, dur); this.next = null; const tgt = this.aim(w);
    this.counterCut = this.counterT > 0; if (this.counterCut) this.counterT = 0;
    // the step in: TUNE.atkLunge × this cut's share; with a foe ahead, stop TUNE.lungeStop short of it
    const full = TUNE.atkLunge * SW[n].lunge;
    this.lungeLen = tgt ? Math.max(0, Math.min(full, tgt.pos.distanceTo(this.pos) - (tgt.d.r + TUNE.lungeStop))) : full;
    this.a.play(new Action(n, dur, SW[n].imps[0])); cue('whoosh', n === 'k5' ? 0.8 : n === 'k3' ? 0.7 : 0.5);
  }
  private startDash(w: HeroWorld) {
    const s = w.stickWorld(); this.dashDir.copy(s.lengthSq() > 0.04 ? s.normalize() : this.a.fwd());
    this.a.yaw = Math.atan2(this.dashDir.x, this.dashDir.z); this.set('dash', TUNE.dashTime); this.dashCd = TUNE.dashCd; this.ghostT = 0;
    this.vy = 0;   // an air dash holds its height
    this.a.play(new Action('dashA', TUNE.dashTime * 1.4, 0.2)); cue('whoosh', 0.7);
  }
  private startJump() {
    this.v0 = (4 * TUNE.jumpH) / TUNE.jumpT; this.vy = this.v0; this.y = Math.max(this.y, 0.001); this.jumps = 1; this.flipT = -1; this.pendT = 0;
    this.set('air', 99); this.a.act?.cancel(); this.a.act = null; this.next = null;
    dustBlocks(this.pos.clone(), 5); cue('whoosh', 0.45);
  }
  /** the double jump: a fresh kick upward from wherever the hero is, a forward somersault, a puff of air under the feet */
  private startJump2() {
    const v = Math.sqrt(2 * this.gravity * TUNE.jump2H); this.v0 = v; this.vy = Math.max(this.vy, v); this.jumps = 2; this.flipT = 0;
    this.set('air', 99); this.a.act?.cancel(); this.a.act = null; this.next = null; this.pendT = 0;
    // the air it kicked off: a flat ring of pale blocks spreading out under the feet, and the body left behind for a blink
    const at = this.pos.clone().setY(this.y + 0.05);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; addBlock(at.clone().add(V3(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2)), { size: 0.09, v: V3(Math.cos(a) * 3.2, -0.4, Math.sin(a) * 3.2), col: 0xdfe8f0, glow: false, life: 0.32, shrink: 0.32, drag: 6, grav: 0 }); }
    fxAfterimage(this.pos.clone().setY(this.y), 1.9, 0x9ab4d8, { life: 0.25, glow: 0.3 });
    cue('whoosh', 0.7);
  }
  private startPlunge(w: HeroWorld) {
    this.aim(w, 3.5); this.set('plunge', 99); this.vy = 0; this.vel.multiplyScalar(0.25);
    // the action runs over the hang plus the fall (so the blade comes down as the body does)
    this.a.play(new Action('plunge', PLUNGE_HANG + this.y / PLUNGE_V + 0.02, 0.98)); cue('magic', 0.35);
  }
  get gravity() { return (8 * TUNE.jumpH) / (TUNE.jumpT * TUNE.jumpT); }
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
    this.t += dt; this.age += dt; this.parryT = Math.max(0, this.parryT - dt); this.fullT = Math.max(0, this.fullT - dt); this.counterT = Math.max(0, this.counterT - dt); this.inv = Math.max(0, this.inv - dt); this.dashCd -= dt; this.dartCd -= dt; m.land = Math.max(0, m.land - dt / 0.16);
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
    // 飞镖: a tap of the special throws one (held, one every TUNE.dartCd); free on the ground or in the air, it never stops the hero
    if ((this.st === 'free' || this.st === 'air') && this.dartCd <= 0 && (this.buf.sp > 0 || (B.special.down && B.special.held > 0.12))) { this.buf.sp = 0; this.startDart(w); }
    if (this.dartT >= 0) {
      this.dartT += dt;
      if (!this.dartGone && this.dartT >= DART_REL) {
        this.dartGone = true;
        const hand = this.handL(), dirs = w.darts3 ? [-0.2, 0, 0.2] : [0];
        for (const a of dirs) { const d = this.dartDir.clone().applyAxisAngle(V3(0, 1, 0), a); w.dart({ from: hand, dir: d }); }
        cue('whoosh', 0.35);
      }
      if (this.dartT >= DART_T || (this.st !== 'free' && this.st !== 'air')) this.dartT = -1;
    }
    switch (this.st) {
      case 'free': {
        steer(TUNE.heroAccel);
        if (canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (canJump) { this.buf.jump = 0; this.startJump(); break; }
        // a tap cuts (at the release; a press begun in the last cut carries the combo on); a hold goes straight into the stance, no cut
        if (this.buf.atk > 0) { this.buf.atk = 0; const n = this.pendT > 0 && this.pendNext ? this.pendNext as Cut : 'k1'; this.pendT = 0; this.startCut(n, w); break; }
        if (holding) this.startCharge();
        break;
      }
      case 'air': {
        steer(TUNE.heroAccel * 0.7);
        this.vy -= this.gravity * dt; this.y += this.vy * dt;
        // the double jump: jump again in the air (once until landing)
        if (this.buf.jump > 0 && this.jumps < 2) { this.buf.jump = 0; this.startJump2(); break; }
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
          w.swing({ from: this.pos.clone(), yaw: this.a.yaw, range: TUNE.atkRange + sw.range, half: sw.half / 2 + (cut === 'k4' ? 0.1 : 0.35), dmg: sw.dmg(), knock: sw.knock, heavy: sw.heavy, kind: cut, n: this.hits, counter: this.counterCut && this.hits === 1 });
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
        if (this.hitDone && canDash) { this.buf.dash = 0; this.startDash(w); break; }
        if (this.hitDone && canJump) { this.buf.jump = 0; this.startJump(); break; }
        // the next cut waits until this one has played out to TUNE.chainAt (the recovery is part of the rhythm)
        const last = sw.imps[sw.imps.length - 1];
        if (this.next && k >= Math.max(last + 0.12, TUNE.chainAt)) { const n = this.next as Cut; this.buf.atk = 0; this.startCut(n, w); break; }
        if (k >= 1) this.set('free', 0);
        break;
      }
      case 'charge': {
        this.chargeK = Math.min(1, this.chargeK + dt / TUNE.chargeFull); m.charge = this.chargeK;
        this.vel.lerp(stick.clone().multiplyScalar(TUNE.heroSpeed * TUNE.stanceSpeed), 1 - Math.exp(-12 * dt));
        if (sl > 0.1) this.a.yaw = Math.atan2(stick.x, stick.z);
        if (this.chargeK >= 1 && this.chargeK - dt / TUNE.chargeFull < 1) { cue('reveal', 0.6); this.a.tint(0xfff4d0, 0.4); this.fullT = 0.35; }
        if (canDash) { m.charge = 0; this.buf.dash = 0; this.startDash(w); break; }
        if (!B.attack.down) {
          // the draw: an attack about to land is caught (见切) and the draw goes straight at the attacker; otherwise the long lunge
          m.charge = 0;
          const caught = w.iaiCatch(TUNE.iaiWin);
          let len = TUNE.relDist * (0.6 + 0.4 * this.chargeK);
          if (caught) { const d = caught.clone().sub(this.pos).setY(0); this.a.yaw = Math.atan2(d.x, d.z); len = Math.max(0.3, Math.min(len, d.length() - 1.0)); }
          else this.aim(w, 6);
          const dir = this.a.fwd();
          this.relFrom.copy(this.pos); this.relTo.copy(this.pos).addScaledVector(dir, len); w.clamp(this.relTo, this.r);
          const dur = 0.42; this.set('rel', dur); this.a.play(new Action('rel', dur, 0.3)); cue('whoosh', 1);
          this.parryT = TUNE.iaiWin; this.iaiBonus = !!caught;
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
        if (k >= 1) this.set('free', 0);
        break;
      }
      case 'dash': {
        const sp = TUNE.dashDist / TUNE.dashTime; this.vel.copy(this.dashDir).multiplyScalar(sp * (this.t < this.dur * 0.75 ? 1 : 0.4));
        this.ghostT -= dt; if (this.ghostT <= 0) { this.ghostT = 0.035; fxAfterimage(this.pos.clone().setY(this.y), 1.9, 0x5a6aa8, { life: 0.2, glow: 0.25 }); }
        if (this.t >= this.dur) {
          this.vel.multiplyScalar(0.35); this.dashEndAt = this.age;
          if (this.airborne) { this.set('air', 99); this.vy = 0; break; }
          this.set('free', 0);
          // a dash straight into an attack / a jump: the press during the dash starts it at once
          if (this.buf.atk > 0) { this.buf.atk = 0; this.startCut('k1', w); }
          else if (this.buf.jump > 0) { this.buf.jump = 0; this.startJump(); }
        }
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
    m.dart = this.dartT >= 0 ? Math.min(1, this.dartT / DART_T) : 0;
    m.creep = this.st === 'charge' ? Math.min(1, sp / Math.max(0.3, TUNE.heroSpeed * TUNE.stanceSpeed)) : 0;
    if (this.st !== 'charge') m.charge = 0;
  }
  private fall(dt: number) {
    if (this.y <= 0) { this.y = 0; return; }
    this.vy -= this.gravity * dt; this.y += this.vy * dt; if (this.y <= 0) { this.y = 0; this.vy = 0; }
  }
  private landed(w: HeroWorld) {
    this.y = 0; this.vy = 0; this.jumps = 0; this.flipT = -1; const m = motionOf(this.a); m.land = 1;
    dustBlocks(this.pos.clone(), 6); cue('impact', 0.25);
    this.set('free', 0);
    // a press just before touching down: the cut / the next jump starts on landing
    if (this.buf.atk > 0) { this.buf.atk = 0; this.startCut('k1', w); }
    else if (this.buf.jump > 0) { this.buf.jump = 0; this.startJump(); }
  }
  private startCharge() { this.set('charge', 99); this.chargeK = 0; this.next = null; this.pendT = 0; this.a.act?.cancel(); this.a.act = null; cue('magic', 0.3); }
  /** 飞镖: the nearest foe within the dart's range, inside a wide cone round the stick (or the facing when the stick is idle);
   *  returns the direction to its chest from the left hand, or straight along that way when nobody is there */
  private dartAim(w: HeroWorld, from: THREE.Vector3) {
    const s = w.stickWorld(), want = s.lengthSq() > 0.04 ? s.clone().normalize() : this.a.fwd().setY(0).normalize();
    let best: Foe | null = null, bd = 1e9;
    for (const f of w.foes) {
      if (f.st === 'dead') continue;
      const d = f.pos.clone().sub(this.pos).setY(0), l = d.length(); if (l > TUNE.dartRange || l < 1e-3) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, d.dot(want) / l))); if (ang > 0.9) continue;
      const score = l * (1 + ang * 1.5); if (score < bd) { bd = score; best = f; }
    }
    return best ? best.a.chest().sub(from).normalize() : want.clone().setY(-0.03).normalize();
  }
  /** the throw: the arm animation starts now, the dart leaves the hand a moment later (update) */
  private startDart(w: HeroWorld) {
    this.dartT = 0; this.dartGone = false; this.dartCd = TUNE.dartCd;
    // standing still, the hero turns to the throw; running or in the air it keeps its way
    const from = this.pos.clone().add(V3(0, 1.3, 0)); this.dartDir.copy(this.dartAim(w, from));
    if (Math.hypot(this.vel.x, this.vel.z) < 1 && !this.airborne) this.a.yaw = Math.atan2(this.dartDir.x, this.dartDir.z);
  }
  /** where the left hand is now (the dart's start) */
  private handL() { const b = this.a.bones?.offhand ?? this.a.bones?.foreL; return b ? b.localToWorld(V3(0, 0, 0)) : this.pos.clone().add(V3(0, 1.25, 0)).addScaledVector(V3(Math.cos(this.a.yaw), 0, -Math.sin(this.a.yaw)), 0.3); }
  private move(dt: number, w: HeroWorld) {
    this.pos.addScaledVector(this.vel, dt);
    // high in the air the hero passes over the foes; on the ground (and in a dash or the lunge) the usual push-out
    if (this.y < 0.6) for (const f of w.foes) if (f.st !== 'dead') { const d = this.pos.clone().sub(f.pos).setY(0), l = d.length(), mm = this.r + f.d.r; if (l < mm && l > 1e-4 && this.st !== 'dash' && this.st !== 'rel') this.pos.addScaledVector(d, (mm - l) / l * 0.6); }
    w.clamp(this.pos, this.r);
  }
}
