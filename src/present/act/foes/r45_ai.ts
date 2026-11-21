// 第四关 · 锁江和第五关 · 许都雪的敌人打法（wp/regB，设计见 docs/DESIGN.md「第四关、第五关的敌人和头目」）。
// enemy.ts 里 role: 'ext' 的敌人由这里的 FOE_AI[kind] 驱动：think（走位、选招）、windup（瞄准）、strike（出手）、guard（格挡）、
// follow（连招）、tick / post（每帧：潜水、隐身、头目的机关和阶段）。起手 → 出手 → 收招的状态机、近战判定、冲撞照旧是 enemy.ts 的。
// 远处的机关（床弩、拍竿、连环索、火油、棋子）是挂在 w.arrows 里的「地面预警」（同落雷：friendly = true，刀不会去砍它们）。
// 主角是瞎子：水鬼在水下、死士在烟里时看不见（hiddenFoe），只看得见水纹 / 脚步声纹；文家刀出鞘前先亮一圈金色声纹（她听得见）。
import * as THREE from 'three';
import { V3, R, scene } from '../../engine/world';
import { shake } from '../../engine/clock';
import { cue } from '../../../audio/cues';
import { fxSparks, fxSmoke, fxRing, fxGlow, fxEmbers, fxFlare, trailSeg } from '../../fx/fx';
import { fxShock } from '../../fx/skillFx';
import { toon } from '../../look/toon';
import { Action } from '../../actors/rig';
import { Tele, inside, type TeleShape } from '../tele';
import { TUNE } from '../tune';
import {
  FOE_AI, fx_, FOE_X, spawnFoe, startAttack, setFoeState, dropTeles, canStrike, steerFoe, turnFoe, meleeLands, defaultStrike, interruptFoe, applyAllySpread,
  Arrow, Shockwave, LOW_CLEAR, bossBarrierFx, shatterBossBarrier, liveBossAdds, type Foe, type FoeWorld, type EKind,
} from '../enemy';
import './r45_models';
import './r45_pose';

const dmgOf = (n: number) => Math.round(n * TUNE.enemyDmg);
const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
const ang = (y: number) => V3(Math.sin(y), 0, Math.cos(y));
/** the hero is behind / to the side of the foe's facing (outside its front arc of half-angle `half`) */
const outsideFront = (f: Foe, from: THREE.Vector3, half: number) => { const d = from.clone().sub(f.pos).setY(0); if (d.lengthSq() < 1e-4) return false; const fw = ang(f.yaw); return Math.acos(Math.max(-1, Math.min(1, d.normalize().dot(fw)))) > half; };
const side = (dir: THREE.Vector3, s: number) => V3(dir.z, 0, -dir.x).multiplyScalar(s);
/** the boss's own scratch values (phase timers, machinery cool-downs) */
const X = fx_;

// ================================================================== ground warnings (the jar's landing, the fire, the stones, the ballista)
/** a warning on the ground that fills for `fill` s (after `delay`), then lands: hurts the hero inside (low = a jump clears it), and
 *  optionally the foes too; the shape is placed at (x, z, yaw). onLand runs after (smoke, a fire patch, a sound). Never cut out of the air. */
export class GroundBlow extends Arrow {
  private tele: Tele | null = null; private t = 0; private fade = -1;
  constructor(private at: THREE.Vector3, private shape: TeleShape, private yaw: number, dmg: number, private delay: number, private fill: number,
    private o: { low?: boolean; foes?: boolean; owner?: Foe | null; onLand?: (w: FoeWorld, hitHero: boolean, yaw: number) => void;
      /** the warning follows: a new spot and / or a new yaw each frame until this share of the fill */ track?: () => { at?: THREE.Vector3; yaw?: number } | null; trackUntil?: number } = {}) {
    super(V3(at.x, 0.05, at.z), 0, dmg, 0, true); this.friendly = true; this.life = 99;
  }
  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    this.t += dt;
    if (this.fade >= 0) { this.fade -= dt; this.tele?.update(dt); if (this.fade < 0) this.kill(); return; }
    if (this.t < this.delay) return;
    const k = (this.t - this.delay) / this.fill;
    if (this.o.track && k < (this.o.trackUntil ?? 0)) { const q = this.o.track(); if (q?.at) this.at.set(q.at.x, 0, q.at.z); if (q?.yaw != null) this.yaw = q.yaw; }
    if (!this.tele) this.tele = new Tele(this.shape, { low: this.o.low });
    this.tele.set(this.at.x, this.at.z, this.yaw, k, Math.max(0, (1 - k) * this.fill));
    this.tele.update(dt);
    if (k >= 1) this.land(w);
  }
  private land(w: FoeWorld) {
    this.tele?.flash(); this.fade = 0.25;
    const inH = w.heroAlive && inside(this.shape, this.at.x, this.at.z, this.yaw, w.heroPos.x, w.heroPos.z, w.heroR);
    let hit = false;
    if (inH) { if ((this.o.low && w.heroY >= LOW_CLEAR) || w.heroDodge) w.dodged(this.at.clone()); else { w.hurtHero(this.dmg, this.at.clone()); hit = true; } }
    else if (w.heroAlive && w.heroDodge && inside(this.shape, this.at.x, this.at.z, this.yaw, w.heroPos.x, w.heroPos.z, w.heroR + 0.6)) w.dodged(this.at.clone());
    if (this.o.foes) for (const f of w.foes.slice()) if (f !== this.o.owner && f.st !== 'dead' && f.kind !== 'dummy' && inside(this.shape, this.at.x, this.at.z, this.yaw, f.pos.x, f.pos.z, f.d.r)) w.arrowHit(f, this);
    this.o.onLand?.(w, hit, this.yaw);
  }
  /** where it will land (the bot / tests) */ get spot() { return this.at; }
  /** is it still to land (a warning on the ground) */ get live() { return this.fade < 0 && this.t >= this.delay; }
  /** the shape, its yaw (the bot reads where not to stand) */ get area() { return { s: this.shape, x: this.at.x, z: this.at.z, yaw: this.yaw, low: !!this.o.low }; }
  kill() { this.tele?.dispose(); this.tele = null; super.kill(); }
}

/** a patch of fire on the planks (火油): flames and embers, hurts the hero standing in it every 0.5 s and nudges her out */
const fireGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
export class FirePatch extends Arrow {
  private t = 0; private tick = 0; private disc: THREE.Mesh;
  constructor(at: THREE.Vector3, private r: number, private dur: number, dmg: number) {
    super(V3(at.x, 0.05, at.z), 0, dmg, 0, true); this.friendly = true; this.life = 99;
    this.disc = new THREE.Mesh(fireGeo, new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.disc.scale.setScalar(r); this.disc.position.set(at.x, 0.06, at.z); this.disc.renderOrder = 3; scene.add(this.disc);
  }
  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    this.t += dt; this.tick -= dt;
    const k = this.t / this.dur, m = this.disc.material as THREE.MeshBasicMaterial; m.opacity = 0.38 * Math.min(1, (1 - k) * 4) * (0.85 + 0.15 * Math.sin(this.t * 13));
    if (Math.random() < dt * 22) fxEmbers(V3(this.p.x + R(-this.r, this.r) * 0.7, 0.1, this.p.z + R(-this.r, this.r) * 0.7), 0xff9a3a, 1, { r: 0.2, up: 1.6, life: 0.6 });
    if (Math.random() < dt * 6) fxSmoke(V3(this.p.x + R(-0.5, 0.5), 0.5, this.p.z + R(-0.5, 0.5)), 0x3a3230, 1, { r: 0.3, spd: 0.6, up: 1.2, s: 0.4, life: 1.0 });
    if (this.tick <= 0 && w.heroAlive && w.heroY < 0.6 && flat(this.p, w.heroPos) < this.r + w.heroR * 0.5) { this.tick = 0.5; w.hurtHero(this.dmg, this.p.clone()); }
    if (k >= 1) this.kill();
  }
  kill() { this.disc.parent?.remove(this.disc); (this.disc.material as THREE.Material).dispose(); super.kill(); }
}

/** a thrown clay jar of oil: a lob from the hand to the spot (an arc), a burst and a fire patch. A cut sends it back (show.ts deflect:
 *  friendly = false while it flies, so the blade can bat it; batted, it bursts on the foes) */
const jarMat = toon(0x8a4a2c), jarTop = toon(0x2a2220);
export class OilJar extends Arrow {
  private t = 0; private flight: number; private from: THREE.Vector3; private to: THREE.Vector3;
  constructor(from: THREE.Vector3, to: THREE.Vector3, dmg: number, private burnDmg: number, private owner: Foe | null) {
    super(from.clone(), 0, dmg, 0, true);
    this.from = from.clone(); this.to = to.clone().setY(0.05); this.flight = Math.max(0.55, Math.min(0.95, flat(from, to) / 11));
    const j = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.24), jarMat), t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), jarTop); t.position.y = 0.18; this.body.add(j, t);
    this.v = this.to.clone().sub(this.from).setY(0).divideScalar(this.flight);
  }
  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    const p0 = this.p.clone();
    if (this.friendly) {
      this.p.addScaledVector(this.v, dt); this.g.position.copy(this.p); this.life -= dt; this.body.rotation.x += dt * 14;
      trailSeg(p0, this.p.clone(), 0xffb060, 0.12, { life: 0.2, bright: 2.2 });
      for (const f of w.foes) if (f.st !== 'dead' && f !== this.owner && flat(this.p, f.pos) < f.d.r + 0.35) { this.burst(w, true); return; }
      if (this.life <= 0) this.burst(w, true);
      return;
    }
    this.t += dt; const k = Math.min(1, this.t / this.flight);
    this.p.lerpVectors(this.from, this.to, k); this.p.y = this.from.y * (1 - k) + 0.05 + Math.sin(k * Math.PI) * 2.6; this.g.position.copy(this.p);
    this.body.rotation.x += dt * 9; this.body.rotation.z += dt * 5;
    if (Math.random() < dt * 30) fxEmbers(this.p.clone().add(V3(0, 0.2, 0)), 0xffa040, 1, { r: 0.05, up: 0.4, life: 0.3 });
    if (k >= 1) this.burst(w, false);
  }
  private burst(w: FoeWorld, friendly: boolean) {
    const c = V3(this.p.x, 0.05, this.p.z), r = 1.5;
    fxRing(c, 0xff8a30, r, { life: 0.35 } as never); fxSparks(c.clone().setY(0.3), 0xffb050, 26, 6); fxGlow(c.clone().setY(0.4), 0xff9a40, 1.8, 0.25);
    fxSmoke(c.clone().setY(0.5), 0x3a3230, 8, { r: 0.6, s: 0.5, life: 0.9 }); cue('boom', 0.5); cue('fire', 0.7);
    if (friendly) { for (const f of w.foes.slice()) if (f.st !== 'dead' && flat(c, f.pos) <= r + f.d.r) w.arrowHit(f, this); }
    else {
      const d = flat(c, w.heroPos);
      if (w.heroAlive && w.heroY < 1.4 && d <= r + w.heroR) { if (w.heroDodge) w.dodged(c); else w.hurtHero(this.dmg, c); }
      else if (w.heroAlive && w.heroDodge && d <= r + w.heroR + 0.6) w.dodged(c);
      w.arrows.push(new FirePatch(c, 1.35, 3, this.burnDmg));
    }
    this.kill();
  }
  deflect(dir: THREE.Vector3) {
    fxSparks(this.p, 0xfff0c0, 18, 6); cue('parry', 0.7);
    this.friendly = true; this.life = 0.8; this.v.copy(dir).setY(0).normalize().multiplyScalar(14); this.p.y = 1.0;
  }
}
/** an enemy bolt that a cover piece stops (w.clamp pushes it: the Arrow already dies on that) — the crossbow's: faster, heavier */
class Bolt extends Arrow { constructor(p: THREE.Vector3, yaw: number, dmg: number) { super(p, yaw, dmg, 22); this.body.scale.set(1.3, 1.3, 0.85); } }

// ================================================================== the 'sound' warnings: ripples under the planks, steps in the smoke, the blade's ring
const ringGeo = new THREE.RingGeometry(0.82, 1, 28).rotateX(-Math.PI / 2);
interface SoundRing { m: THREE.Mesh; t: number; life: number; r: number; a: number }
const RINGS: SoundRing[] = [];
/** a soft ring on the ground at p, growing and fading (the diver's ripples, the shade's steps, the blade's ring before it is drawn);
 *  stepped with the game clock (soundRingsStep, from the foes' frame), so it stops with a pause and stretches with a hit-stop */
function soundRing(p: THREE.Vector3, col: number, r: number, life: number, a = 0.6) {
  let s = RINGS.find(x => x.t >= x.life);
  if (!s) { if (RINGS.length >= 40) return; s = { m: new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 })), t: 0, life: 0, r: 0, a: 0 }; s.m.renderOrder = 4; RINGS.push(s); }
  (s.m.material as THREE.MeshBasicMaterial).color.setHex(col); s.m.position.set(p.x, 0.07, p.z); s.t = 0; s.life = life; s.r = r; s.a = a; s.m.scale.setScalar(r * 0.35); scene.add(s.m);
}
export function soundRingsStep(dt: number) {
  for (const s of RINGS) { if (s.t >= s.life) continue; s.t += dt; const k = Math.min(1, s.t / s.life); s.m.scale.setScalar(s.r * (0.35 + 0.65 * k)); (s.m.material as THREE.MeshBasicMaterial).opacity = s.a * (1 - k); if (k >= 1) s.m.parent?.remove(s.m); }
}
/** a room change: every ring and every stone left lying goes */
export function r45Clear() { for (const s of RINGS) { s.t = s.life; s.m.parent?.remove(s.m); } for (const m of STONES) m.m.parent?.remove(m.m); STONES.length = 0; }
/** the hidden body: drawn or not, and with no contact shadow / HUD bar (show.ts / hud.ts read hiddenFoe) */
function hide(f: Foe, on: boolean) { if (on && f.mem.noHide) return; X(f).hidden = on ? 1 : 0; f.mem.hidden = on; f.a.root.visible = !on; }
/** Force a hidden / stealthed foe (e.g. Cui Xuan in Phase 3 dark) back into full visibility (used by cutscenes & prologueFall). */
export function revealFoe(f: Foe) {
  const x = X(f); x.hidden = 0; x.hid = 0; x.dark = 0; x.under = 0; x.up = 0;
  f.mem.hidden = false;
  f.a.root.visible = true; f.a.body.visible = true;
}
/** a 文家刀 is about to be drawn: she hears it first — a gold ring at her feet and a low iron ring in the air (0.35 s before the red) */
function bladeRing(w: FoeWorld) { soundRing(w.heroPos, 0xffd27a, 1.25, 0.5, 0.85); cue('bladeRing', 0.8); }
/** how long the gold ring leads the red warning (s) */
const HEAR_LEAD = 0.35;
/** in the wind-up of a 文家刀 cut: the red warning only after the lead (only the first cut of a combo; the follow-ups are seen) */
function heardFirst(f: Foe) { if (!f.tele || f.combo < 0) return; const on = f.t > HEAR_LEAD || !!X(f).heard; f.tele.g.visible = on; for (const e of f.extra) e.t.g.visible = on; }

// ================================================================== the region-four foes
/** 执矛水卒: in a crowd, a straight thrust (a long narrow strip); one cut breaks it */
FOE_AI.wl_spear = {
  think(f, w, dt, dist, dir, yawTo) {
    const can = canStrike(f, w), want = V3();
    if (!can) {
      if (dist > 3.6) want.copy(dir).addScaledVector(side(dir, f.strafe), 0.75);
      else if (dist < 2.4) want.copy(dir).multiplyScalar(-0.45).addScaledVector(side(dir, f.strafe), 0.95);
      else want.copy(side(dir, f.strafe)).multiplyScalar(0.95);
    } else if (dist > 2.2) want.copy(dir).addScaledVector(side(dir, f.strafe), 0.3);
    if (can && dist < 2.8) { startAttack(f, w, { k: 'rect', len: 2.6, w: 0.5 }, 0.5, 7, yawTo, { atk: 'poke' }); f.cd = R(0.5, 1.0); return; }
    steerFoe(f, want, f.d.speed, dt, yawTo);
  },
  windup(f, _w, dt, p, yawTo) { if (p < 0.4) { f.teleYaw = yawTo; turnFoe(f, yawTo, dt, 14); } return true; },
  recover: () => 0.5,
};

/** 拽索手: the chain swept low round him (jump it), or thrown along a line — caught, she is dragged to him and a short cut follows */
FOE_AI.wl_chain = {
  think(f, w, dt, dist, dir, yawTo) {
    const can = canStrike(f, w), want = V3();
    if (dist > 4.6) want.copy(dir); else if (dist < 2.2) want.copy(dir).multiplyScalar(-0.7).addScaledVector(side(dir, f.strafe), 0.5); else want.copy(side(dir, f.strafe)).addScaledVector(dir, 0.15);
    if (can && dist < 3.4 && Math.random() < 0.7) { f.combo = f.elite ? 1 : 0; startAttack(f, w, { k: 'cone', r: 3.4, half: 1.4 }, 0.8, 11, yawTo, { atk: 'sweep', low: true }); f.cd = R(0.8, 1.4); return; }
    if (can && dist > 2.6 && dist < 7) { startAttack(f, w, { k: 'rect', len: 7, w: 0.7 }, 0.75, 6, yawTo, { atk: 'pull' }); f.cd = R(1.2, 1.8); return; }
    steerFoe(f, want, f.d.speed, dt, yawTo);
  },
  windup(f, w, dt, p, yawTo) {
    if (p < (f.atk === 'pull' ? 0.55 : 0.3)) { f.teleYaw = yawTo; turnFoe(f, yawTo, dt, 10); }
    // the chain whirls over his head while he winds up: a few links' glints
    if (Math.random() < dt * 20) fxSparks(f.a.weapon(), 0xb8c0cc, 1, 2, { life: 0.2 });
    void w; return true;
  },
  strike(f, w) {
    if (f.atk !== 'pull') { f.tele?.flash(); setFoeState(f, 'strike', 0.2); cue('foeHeavy', 0.8); fxSparks(f.pos.clone().setY(0.2), 0xc8c0b0, 14, 5); meleeLands(f, w); return true; }
    // the throw: the chain's line flashes; caught (in it, not dashing, not drawing to parry) — dragged to him
    f.tele?.flash(); setFoeState(f, 'strike', 0.3); cue('foeSwing', 0.9);
    const end = f.pos.clone().addScaledVector(ang(f.teleYaw), 7).setY(1.0); trailSeg(f.a.weapon(), end, 0xb8c0cc, 0.08, { life: 0.25, bright: 1.6 });
    if (w.heroAlive && inside(f.shape!, f.telePos.x, f.telePos.z, f.teleYaw, w.heroPos.x, w.heroPos.z, w.heroR)) {
      if (w.heroDodge) { w.dodged(f.pos.clone()); return true; }
      w.hurtHero(f.dmg, f.pos.clone(), f);
      X(f).pulled = 1;
    }
    return true;
  },
  follow(f, w, yawTo) {
    const x = X(f);
    if (x.pulled) { x.pulled = 0; w.pull?.(f.pos.clone().addScaledVector(ang(yawTo), 1.4)); startAttack(f, w, { k: 'cone', r: 2.2, half: 0.9 }, 0.3, 9, yawTo, { atk: 'cut' }); return true; }
    if (f.combo > 0 && f.atk === 'sweep') { f.combo--; startAttack(f, w, { k: 'cone', r: 3.4, half: 1.4 }, 0.42, 11, yawTo + Math.PI * 0.0, { atk: 'sweep', low: true }); return true; }
    return false;
  },
  recover: f => (f.atk === 'pull' ? 0.9 : 0.75),
};

/** 掷火卒: keeps away, lobs an oil jar at where she stands (a circle that follows her for its first part, then locks), a fire patch
 *  after; batted in the air, the jar bursts on the foes */
FOE_AI.wl_oil = {
  think(f, w, dt, dist, dir, yawTo) {
    const can = canStrike(f, w), want = V3();
    if (dist < 5) { want.copy(dir).multiplyScalar(-1).addScaledVector(side(dir, f.strafe), 0.5); } else if (dist > 9) want.copy(dir); else want.copy(side(dir, f.strafe)).multiplyScalar(0.55);
    if (can && dist > 3 && dist < 11) {
      startAttack(f, w, { k: 'circle', r: 1.5, ahead: 0 }, 1.0, 9, yawTo, { atk: 'lob', at: w.heroPos.clone(), anchor: true,
        extra: f.elite ? [{ s: { k: 'circle', r: 1.5, ahead: 2.6 }, dy: 0.0 }, { s: { k: 'circle', r: 1.5, ahead: -2.6 }, dy: 0.0 }] : [] });
      f.cd = R(1.6, 2.4); return;
    }
    steerFoe(f, want, dist < 5 ? f.d.speed * 1.15 : f.d.speed, dt, yawTo, true);
  },
  windup(f, w, dt, p, yawTo) {
    turnFoe(f, yawTo, dt, 10);
    // the landing circle follows her for the first four tenths, then locks (step out of it after that)
    if (p < 0.4) { f.telePos.set(w.heroPos.x, 0, w.heroPos.z); f.teleYaw = Math.atan2(w.heroPos.x - f.pos.x, w.heroPos.z - f.pos.z) + Math.PI / 2; }
    if (Math.random() < dt * 18) fxEmbers(f.a.weapon(), 0xffa040, 1, { r: 0.05, up: 0.5, life: 0.3 });
    return true;
  },
  strike(f, w) {
    // the circle is the jar's landing: the jar itself lands there (the warning fades as it flies, the jar's own burst does the harm)
    dropTeles(f); setFoeState(f, 'strike', 0.25); cue('foeSwing', 0.6);
    const spots = [f.telePos.clone()];
    if (f.elite) { const s = ang(f.teleYaw).multiplyScalar(2.6); spots.push(f.telePos.clone().add(s), f.telePos.clone().sub(s)); }
    for (const s of spots) w.arrows.push(new OilJar(f.a.weapon(), s, f.dmg, dmgOf(4), f));
    return true;
  },
  recover: () => 0.7,
};

/** 楼船弩士: a slow aim (a thin line), a fast heavy bolt; the volley — the crossbowmen near him aim and loose together; after a shot he
 *  kneels to span the bow for 2 s (the moment to close in). Cover stops bolts; a cut bats them */
FOE_AI.wl_xbow = {
  think(f, w, dt, dist, dir, yawTo) {
    const x = X(f), want = V3();
    if ((x.span ?? 0) > 0) { x.span -= dt; f.vel.multiplyScalar(Math.exp(-dt * 8)); turnFoe(f, yawTo, dt, 3); f.a.setRunning(false); if (x.span <= 0) f.a.play(new Action('cast', 0.3, 0.9)); return; }
    if (dist < 4.5) want.copy(dir).multiplyScalar(-1).addScaledVector(side(dir, f.strafe), 0.5); else if (dist > 10) want.copy(dir); else want.copy(side(dir, f.strafe)).multiplyScalar(0.5);
    const can = canStrike(f, w);
    if (can && dist < 13 && dist > 2.6) {
      const len = Math.min(14, dist + 3), ex = f.elite ? [{ s: { k: 'line', len } as TeleShape, dy: 0.2 }, { s: { k: 'line', len } as TeleShape, dy: -0.2 }] : [];
      startAttack(f, w, { k: 'line', len }, 1.1, 9, yawTo, { atk: 'shoot', extra: ex });
      // the volley: the others near him who are free and loaded aim with him (the same beat — one red pulse, one loose)
      for (const o of w.foes) if (o !== f && o.kind === 'wl_xbow' && o.st === 'move' && !((X(o).span ?? 0) > 0) && flat(o.pos, f.pos) < 7) { const oy = Math.atan2(w.heroPos.x - o.pos.x, w.heroPos.z - o.pos.z); startAttack(o, w, { k: 'line', len: Math.min(14, flat(o.pos, w.heroPos) + 3) }, 1.1, 9, oy, { atk: 'shoot' }); o.dur = f.dur; }
      return;
    }
    steerFoe(f, want, f.d.speed, dt, yawTo, true);
  },
  windup(f, _w, dt, p, yawTo) { if (p < 0.68) { f.teleYaw = yawTo; f.yaw = yawTo; } void dt; return true; },
  strike(f, w) {
    f.tele?.flash(); for (const e of f.extra) e.t.flash(); setFoeState(f, 'strike', 0.18);
    for (const dy of [0, ...f.extra.map(e => e.dy)]) w.arrows.push(new Bolt(f.pos.clone().add(V3(0, 1.2, 0)), f.teleYaw + dy, f.dmg));
    cue('arrow', 0.8); X(f).span = 2.0; return true;
  },
  recover: () => 0.25,
};

/** 没水鬼: under the planks — only ripples and bubbles swimming toward her; at her feet a circle fills, he bursts up (dash / jump out);
 *  up, he hooks at her for 2.5 s, then goes down again. A cut on the ripples drives him out (blades find him; darts and aim do not) */
FOE_AI.wl_diver = {
  tick(f, w, dt) {
    const x = X(f);
    if (x.init == null) { x.init = 1; x.under = 1; x.up = 0; hide(f, true); f.st = 'move'; }
    if (!x.under) {
      x.up = (x.up ?? 0) + dt;
      if (x.up > (f.elite ? 3.2 : 2.5) && f.st === 'move') { x.under = 1; x.up = 0; hide(f, true); f.attacking = false; fxSmoke(f.pos.clone().setY(0.2), 0x6a7a88, 6, { r: 0.4, spd: 1, up: 0.3, s: 0.35, life: 0.6 }); cue('land', 0.5); }
      return false;
    }
    // swimming: fast to a spot just beside her, ripples every 0.22 s (f.t / f.cd are already advanced by updateFoe)
    x.rip = (x.rip ?? 0) - dt; if (x.rip <= 0) { x.rip = 0.22; soundRing(f.pos, 0x9ab8d0, 0.9, 0.7, 0.5); if (Math.random() < 0.5) fxSparks(f.pos.clone().setY(0.05), 0xc8d8e8, 2, 1, { life: 0.3, grav: -2 }); }
    if (f.st === 'windup') {
      // the burst coming: the circle fills where he will come up; at the end he is out and strikes
      f.vel.multiplyScalar(Math.exp(-dt * 10)); const left = f.dur - f.t; f.tele?.set(f.telePos.x, f.telePos.z, 0, f.t / f.dur, left);
      if (Math.random() < dt * 30) fxSparks(f.telePos.clone().setY(0.05), 0xd8e8f8, 1, 2, { life: 0.3, grav: -3 });
      if (f.t >= f.dur) {
        x.under = 0; x.up = 0; hide(f, false); f.pos.set(f.telePos.x, 0, f.telePos.z);
        f.tele?.flash(); setFoeState(f, 'strike', 0.2); cue('foeCry', 0.9); fxSmoke(f.pos.clone().setY(0.3), 0x8aa0b4, 12, { r: 0.8, spd: 2, up: 1.2, s: 0.4, life: 0.7 }); fxSparks(f.pos.clone().setY(0.4), 0xe0f0ff, 20, 5);
        meleeLands(f, w); f.a.play(new Action('attack', 0.5, 0.4, { dist: 0.3 }));
      }
      return true;
    }
    const toH = w.heroPos.clone().sub(f.pos).setY(0), d = toH.length();
    if (d > 0.4) f.vel.lerp(toH.normalize().multiplyScalar(f.d.speed * (d > 2 ? 1 : 0.4)), Math.min(1, dt * 4)); else f.vel.multiplyScalar(0.8);
    if (canStrike(f, w) && d < 1.6 && f.t > 1.2) { startAttack(f, w, { k: 'circle', r: 1.3, ahead: 0 }, 0.6, 12, 0, { atk: 'burst', at: w.heroPos.clone(), anchor: true }); f.a.root.visible = false; f.cd = 1.5; }
    return true;
  },
  think(f, w, dt, dist, dir, yawTo) {
    const can = canStrike(f, w, { slots: TUNE.maxAttackers + 1 }), want = V3();
    if (dist > 1.6) want.copy(dir); else if (!can) want.copy(side(dir, f.strafe)).addScaledVector(dir, -0.3);
    if (can && dist < 2.2) { f.combo = 1; startAttack(f, w, { k: 'cone', r: 1.9, half: 1.0 }, 0.4, 8, yawTo, { atk: 'cut' }); f.cd = R(0.3, 0.6); return; }
    steerFoe(f, want, f.d.speed * 0.9, dt, yawTo);
  },
  follow(f, w, yawTo) { if (f.combo > 0) { f.combo--; startAttack(f, w, { k: 'cone', r: 1.9, half: 1.0 }, 0.3, 8, yawTo, { atk: 'cut' }); return true; } return false; },
  // a blade on the ripples: he is struck out of the water (the blow lands; hiding ends at once, a short stagger)
  guard(f) { const x = X(f); if (x.under) { x.under = 0; x.up = 0; hide(f, false); dropTeles(f); f.attacking = false; fxSmoke(f.pos.clone().setY(0.3), 0x8aa0b4, 10, { r: 0.6, spd: 1.6, up: 1, s: 0.4, life: 0.6 }); } return false; },
  recover: () => 0.55,
};

/** 执楯刀士: the shield turns every cut and dart from the front (140°); he turns slowly; a heavy blow knocks it aside (1.2 s open);
 *  attacks: a shield rush along a lane, a short cut */
FOE_AI.wl_shield = {
  think(f, w, dt, dist, dir, yawTo) {
    const can = canStrike(f, w), want = V3();
    if (dist > 2) want.copy(dir).addScaledVector(side(dir, f.strafe), 0.2);
    if (can && dist < 2.4) { startAttack(f, w, { k: 'cone', r: 2.2, half: 0.85 }, 0.55, 10, yawTo, { atk: 'cut' }); return; }
    if (can && dist >= 2.4 && dist < 4.6 && Math.random() < dt * 1.4) { startAttack(f, w, { k: 'rect', len: 3.5, w: 1.2 }, 0.7, 11, yawTo, { atk: 'lunge' }); return; }
    // the slow turn: he swings round toward her at a third of the usual rate (so she can get round him)
    applyAllySpread(f, w, want);
    const m = want.length(); if (m > 0.05) { want.multiplyScalar(f.d.speed / m); } turnFoe(f, yawTo, dt, 2.2);
    f.vel.lerp(want, Math.min(1, dt * 6)); f.a.setRunning(f.vel.length() > 0.6);
  },
  post(f, _w, dt) { const x = X(f); if ((x.open ?? 0) > 0) x.open -= dt; },
  windup(f, _w, dt, p, yawTo) { if (p < 0.4) { f.teleYaw = yawTo; turnFoe(f, yawTo, dt, 4); } return true; },
  guard(f, from, o) {
    const x = X(f);
    if ((x.open ?? 0) > 0 || outsideFront(f, from, 1.22)) return false;
    if (o.heavy && !o.dart) {
      // a heavy blow knocks the shield aside: open for 1.2 s (and the blow itself lands)
      x.open = 1.2; x.blocks = 0; dropTeles(f); f.attacking = false; setFoeState(f, 'stagger', 1.2); f.a.play(new Action('hurt', 1.0, 0.1, { power: 1.6 })); cue('guardBreak', 1);
      fxSparks(f.a.chest(), 0xffd8a0, 22, 6); return false;
    }
    fxSparks(f.a.chest().addScaledVector(ang(f.yaw), 0.4), 0xffe0b0, 12, 4); cue('parry', 0.6); f.a.tint(0xffffff, 0.4);
    x.blocks = (x.blocks ?? 0) + 1;
    // the elite answers the second turned blow with a shove
    if (f.elite && x.blocks >= 2 && f.st === 'move' && WORLD) { x.blocks = 0; f.cd = 0; startAttack(f, WORLD, { k: 'rect', len: 2.4, w: 1.2 }, 0.32, 9, f.yaw, { atk: 'lunge' }); }
    return true;
  },
  recover: f => (f.atk === 'lunge' ? 0.9 : 0.6),
};

// ================================================================== the region-five foes
/** 持杖僮奴: a crowd with staves, an overhead whack along a strip; the pincer — when one strikes, the one nearest her on her far side
 *  strikes with it (two warnings, one beat) */
FOE_AI.cx_club = {
  think(f, w, dt, dist, dir, yawTo) {
    const can = canStrike(f, w), want = V3();
    if (!can) {
      if (dist > 3.2) want.copy(dir).addScaledVector(side(dir, f.strafe), 0.8);
      else if (dist < 2.1) want.copy(dir).multiplyScalar(-0.45).addScaledVector(side(dir, f.strafe), 0.95);
      else want.copy(side(dir, f.strafe)).multiplyScalar(0.95);
    } else if (dist > 1.8) want.copy(dir).addScaledVector(side(dir, f.strafe), 0.35);
    if (can && dist < 2.4) {
      startAttack(f, w, { k: 'rect', len: 2.2, w: 0.7 }, 0.55, 6, yawTo, { atk: 'cut' }); f.cd = R(0.6, 1.1);
      // the pincer partner: the nearest other servant on her far side, free, within reach of her
      let best: Foe | null = null, bd = 3.2;
      for (const o of w.foes) { if (o === f || o.kind !== 'cx_club' || o.st !== 'move') continue; const d = flat(o.pos, w.heroPos); const far = o.pos.clone().sub(w.heroPos).setY(0).dot(f.pos.clone().sub(w.heroPos).setY(0)) < 0; if (far && d < bd) { bd = d; best = o; } }
      if (best) { const oy = Math.atan2(w.heroPos.x - best.pos.x, w.heroPos.z - best.pos.z); startAttack(best, w, { k: 'rect', len: 2.2, w: 0.7 }, 0.55, 6, oy, { atk: 'cut' }); best.dur = f.dur; best.cd = R(0.8, 1.2); }
      return;
    }
    steerFoe(f, want, f.d.speed, dt, yawTo);
  },
  windup(f, _w, dt, p, yawTo) { if (p < 0.35) { f.teleYaw = yawTo; turnFoe(f, yawTo, dt, 12); } return true; },
  recover: () => 0.5,
};

/** 门下剑客: the guard (sword upright, a cold sheen) turns cuts and darts from the front and answers at once with a riposte; heavy blows
 *  (the finishing cut, 劈山, 箭步斩, 穿心腿) break it; attacks: three quick thrusts, a stepping thrust */
FOE_AI.cx_sword = {
  think(f, w, dt, dist, dir, yawTo) {
    const x = X(f), can = canStrike(f, w), want = V3();
    // the guard comes up while she is close and he is not attacking (a sheen on the blade)
    x.guard = dist < 3.6 ? Math.min(1, (x.guard ?? 0) + dt * 4) : Math.max(0, (x.guard ?? 0) - dt * 3);
    if (x.guard > 0.6 && Math.random() < dt * 8) fxSparks(f.a.weapon(), 0xe8f0ff, 1, 1, { life: 0.25 });
    if (dist > 2.6) want.copy(dir).addScaledVector(side(dir, f.strafe), 0.25); else if (!can) want.copy(side(dir, f.strafe)).multiplyScalar(0.6);
    if (can && dist < 3.0) { x.guard = 0; f.combo = 2; startAttack(f, w, { k: 'rect', len: 2.8, w: 0.35 }, 0.6, 7, yawTo, { atk: 'poke' }); return; }
    if (can && dist >= 3.0 && dist < 5 && Math.random() < dt * 1.2) { x.guard = 0; startAttack(f, w, { k: 'rect', len: 4, w: 0.5 }, 0.7, 10, yawTo, { atk: 'lunge' }); return; }
    steerFoe(f, want, f.d.speed, dt, yawTo, dist < 4);
  },
  windup(f, _w, dt, p, yawTo) { if (p < 0.4) { f.teleYaw = yawTo; turnFoe(f, yawTo, dt, 14); } return true; },
  follow(f, w, yawTo) { if (f.combo > 0 && f.atk === 'poke') { f.combo--; startAttack(f, w, { k: 'rect', len: 2.8, w: 0.35 }, 0.3, 7, yawTo, { atk: 'poke' }); return true; } return false; },
  guard(f, from, o) {
    const x = X(f);
    if (f.st !== 'move' || (x.guard ?? 0) < 0.6 || outsideFront(f, from, f.elite ? 1.3 : 1.1)) return false;
    if (o.heavy && !o.dart) { x.guard = 0; cue('guardBreak', 0.9); fxSparks(f.a.weapon(), 0xfff0d0, 20, 6); return false; }
    // turned aside — 叮 — and the riposte at once (a short fast thrust)
    fxSparks(f.a.weapon(), 0xe8f0ff, 14, 5); cue('parry', 0.7); f.a.tint(0xdfeaff, 0.5);
    if (WORLD) { f.cd = 0; const y = Math.atan2(WORLD.heroPos.x - f.pos.x, WORLD.heroPos.z - f.pos.z); startAttack(f, WORLD, { k: 'rect', len: 2.8, w: 0.45 }, 0.28, 12, y, { atk: 'poke' }); f.combo = 0; }
    return true;
  },
  recover: f => (f.atk === 'lunge' ? 0.8 : 0.55),
};

/** 匿影死士: a puff of smoke and he is gone; only a line of footstep rings circling to her back; behind her he comes out with a glint
 *  (a 90° cone, fast) and a second cut; out for 2 s, then gone again. A blade on his steps finds him; the elite feints once */
FOE_AI.cx_shade = {
  tick(f, w, dt) {
    const x = X(f);
    if (x.init == null) { x.init = 1; x.hid = 1; hide(f, true); x.out = 0; f.st = 'move'; f.cd = R(1, 2); }
    if (!x.hid) {
      x.out = (x.out ?? 0) + dt;
      if (x.out > 2 && f.st === 'move') { x.hid = 1; hide(f, true); smoke(f); cue('whoosh', 0.5); f.attacking = false; }
      return false;
    }
    // circling to her back: the target is a point 1.6 m behind her (her facing is unknown here: behind = away from his own side)
    const toH = w.heroPos.clone().sub(f.pos).setY(0), d = toH.length();
    const behind = w.heroPos.clone().add(w.heroFwd ? w.heroFwd.clone().multiplyScalar(-1.6) : toH.clone().normalize().multiplyScalar(1.6));
    const go = behind.sub(f.pos).setY(0), gl = go.length();
    if (gl > 0.3) f.vel.lerp(go.normalize().multiplyScalar(f.d.speed), Math.min(1, dt * 5)); else f.vel.multiplyScalar(0.7);
    x.step = (x.step ?? 0) - dt; if (x.step <= 0 && f.vel.length() > 0.5) { x.step = 0.26; soundRing(f.pos, 0xc8c8d8, 0.55, 0.6, 0.55); }
    if (canStrike(f, w) && d < 2.2 && (gl < 0.8 || f.t > 3) && f.cd <= 0) {
      if (f.elite && !x.feinted) { x.feinted = 1; fxFlare(f.pos.clone().setY(1.2), 0xe8eeff, 0.6, 0.2); cue('swish', 0.4); f.pos.addScaledVector(V3(toH.z, 0, -toH.x).normalize(), 1.8); f.t = 2.2; return true; }
      x.hid = 0; x.out = 0; x.feinted = 0; hide(f, false); smoke(f); f.yaw = Math.atan2(toH.x, toH.z);
      f.combo = 1; startAttack(f, w, { k: 'cone', r: 2.0, half: 0.8 }, 0.42, 14, f.yaw, { atk: 'cut' }); fxFlare(f.a.weapon(), 0xffffff, 1.0, 0.22); cue('draw', 0.6);
      f.cd = R(1.5, 2.2);
    }
    return true;
  },
  think(f, w, dt, dist, dir, yawTo) { const want = V3(); if (dist < 3) want.copy(dir).multiplyScalar(-0.6).addScaledVector(side(dir, f.strafe), 0.6); steerFoe(f, want, f.d.speed * 0.7, dt, yawTo); },
  windup(f, _w, dt, p, yawTo) { if (p < 0.25) { f.teleYaw = yawTo; f.yaw = yawTo; } void dt; return true; },
  follow(f, w, yawTo) { if (f.combo > 0) { f.combo--; startAttack(f, w, { k: 'cone', r: 2.0, half: 0.8 }, 0.3, 8, yawTo, { atk: 'cut' }); return true; } return false; },
  guard(f) { const x = X(f); if (x.hid) { x.hid = 0; x.out = 0.6; hide(f, false); smoke(f); f.attacking = false; dropTeles(f); } return false; },
  recover: () => 0.5,
};
const smoke = (f: Foe) => fxSmoke(f.pos.clone().setY(0.7), 0x2a2830, 12, { r: 0.6, spd: 1.2, up: 0.6, s: 0.45, life: 0.6 });
/** the world the foes act in, kept for the hooks that are called without it (guard: an answer to a turned blow); r45Frame sets it */
let WORLD: FoeWorld | null = null;

/** 百辟刀卫: a 文家刀 — she hears it drawn (the gold ring at her feet before the red); a wide drawing cut, a turning double cut. Caught
 *  by 破势, the blade flies from his hand: 3 s open, every blow doubled. Poise 30 */
FOE_AI.cx_guard = {
  think(f, w, dt, dist, dir, yawTo) {
    const x = X(f), can = canStrike(f, w), want = V3();
    if ((x.disarm ?? 0) > 0) { x.disarm -= dt; f.vel.multiplyScalar(Math.exp(-dt * 6)); f.a.setRunning(false); if (x.disarm <= 0 && f.a.bones.weapon) f.a.bones.weapon.visible = true; return; }
    if (dist > 2.6) want.copy(dir).addScaledVector(side(dir, f.strafe), 0.2);
    if (can && dist < 3.2) {
      bladeRing(w); const two = Math.random() < (f.elite ? 0.6 : 0.4);
      f.combo = two ? 1 : 0; startAttack(f, w, { k: 'cone', r: 3.0, half: two ? 0.85 : 1.0 }, 0.45 + 0.35, two ? 12 : 16, yawTo, { atk: 'cut' });
      return;
    }
    steerFoe(f, want, f.d.speed, dt, yawTo);
  },
  windup(f, _w, dt, p, yawTo) { if (p < 0.4) { f.teleYaw = yawTo; turnFoe(f, yawTo, dt, 10); } heardFirst(f); return true; },
  follow(f, w, yawTo) { if (f.combo > 0) { f.combo--; startAttack(f, w, { k: 'cone', r: 3.0, half: 0.85 }, 0.3, 12, yawTo + Math.PI * 0.35, { atk: 'cut' }); return true; } return false; },
  // 破势 caught his cut (or 一闪 pinned him mid-cut): the blade flies from his hand — 3 s open, every blow doubled
  interrupted(f, was) { if (f.st === 'dead' || !was) return; const x = X(f); x.disarm = 3; f.a.bones.weapon && (f.a.bones.weapon.visible = false); fxSparks(f.a.weapon(), 0xfff4d0, 24, 7); cue('guardBreak', 1); f.dur = Math.max(f.dur, 1.2); },
  taken: f => ((X(f).disarm ?? 0) > 0 ? 2 : 1),
  recover: () => 0.75,
};

/** 击筑客: every 3.5 s a stroke on the 筑 — a grey ring of noise rolls out of him; while it sounds (2.4 s), the warnings of the foes near
 *  him (9 m) show only in their last 0.45 s (her ears are full); he backs off; a blow stops one stroke */
FOE_AI.cx_zhu = {
  think(f, w, dt, dist, dir, yawTo) {
    const x = X(f), want = V3();
    x.beat = (x.beat ?? 1.5) - dt; x.noise = Math.max(0, (x.noise ?? 0) - dt);
    if (x.beat <= 0) {
      x.beat = 3.5; x.noise = 2.4; f.a.play(new Action('cast', 0.5, 0.5));
      fxRing(f.pos.clone().setY(0.08), 0x9a98a8, 9, { life: 0.9 } as never); fxShock(f.pos.clone().setY(0.05), 0xb8b4c8, 3, { life: 0.5 }); cue('clack', 0.9);
      if (f.elite && dist < 3.5) w.pull?.(w.heroPos.clone().addScaledVector(dir, 1.0));
    }
    if (dist < 6) want.copy(dir).multiplyScalar(-1).addScaledVector(side(dir, f.strafe), 0.5); else if (dist > 10) want.copy(dir); else want.copy(side(dir, f.strafe)).multiplyScalar(0.4);
    steerFoe(f, want, dist < 6 ? f.d.speed * 1.1 : f.d.speed * 0.7, dt, yawTo, true);
  },
  guard(f) { const x = X(f); x.beat = Math.max(x.beat ?? 0, 1.2); x.noise = 0; return false; },
};
/** the noise round the zither players now: is (x, z) inside one's sounding ring */
export function deafAt(w: { foes: Foe[] }, x: number, z: number) { for (const f of w.foes) if (f.kind === 'cx_zhu' && f.st !== 'dead' && (FOE_X.get(f)?.noise ?? 0) > 0 && Math.hypot(f.pos.x - x, f.pos.z - z) < 9) return true; return false; }

// ================================================================== 周黯 (督造少监): the ballista, the boom, the chain lines, the sleeve-bow; the fire
FOE_AI.wl_boss = {
  tick(f, w, dt) {
    const x = X(f);
    if (x.init == null) { x.init = 1; x.bal = 3.5; x.pole = 6; x.lines = 9; x.calls = 0; x.fire = 0; x.wind = 0; x.shielded = 0; x.linkFx = 0; x.comboBoom = 0; f.cd = 1.5; }
    // act-138 铁楯护主: while any wl_shield escort is alive, Zhou Mo takes 50% reduced damage & golden shield tethers visibly link them!
    const guards = w.foes.filter(o => o.kind === 'wl_shield' && o.st !== 'dead');
    x.shielded = guards.length > 0 ? 1 : 0;
    if (x.shielded) {
      x.linkFx = (x.linkFx ?? 0) - dt;
      if (x.linkFx <= 0) {
        x.linkFx = 0.32;
        for (const g of guards) trailSeg(g.a.chest(), f.a.chest(), 0xffd878, 0.055, { life: 0.24, bright: 2.0, spark: 0 });
      }
    }
    // Phase 2 combo follow-up: chainLines (jump) -> sweeping boom (dash) 1.15s later
    if ((x.comboBoom ?? 0) > 0) {
      x.comboBoom -= dt;
      if (x.comboBoom <= 0 && w.heroAlive) boom(f, w, false);
    }
    // act-138 Hades-2 Boss Impervious Phase Gates (65% 6s Warship Broadside flee; 33% Shield Escort clear!)
    if (f.mem.barrier > 0) {
      bossBarrierFx(f, dt, 0xffa848);
      f.vel.multiplyScalar(Math.exp(-dt * 8)); f.a.setRunning(false);
      f.mem.barPulseT = (f.mem.barPulseT ?? 0.6) - dt;
      f.mem.barMaxT = (f.mem.barMaxT ?? 24) - dt;
      if (f.mem.barrier === 1) {
        f.mem.fleeT = Math.max(0, (f.mem.fleeT ?? 0) - dt);
        f.mem.barrierLabel = '无敌 · 躲避全舰齐射';
        if (f.mem.barPulseT <= 0 && w.heroAlive) {
          f.mem.barPulseT = 1.5;
          const step = (f.mem.barStep ?? 0) % 4; f.mem.barStep = step + 1;
          if (step === 0) ballista(f, w, true);
          else if (step === 1) chainLines(f, w);
          else if (step === 2) boom(f, w, true);
          else { ballista(f, w, false); chainLines(f, w); }
        }
        if (f.mem.fleeT <= 0) {
          shatterBossBarrier(f, w, 0xffa848, '居然躲过了全舰齐射？！');
          x.bal = 3.5; x.pole = 5; x.lines = 6.5;
        }
      } else {
        f.mem.barrierLabel = '无敌 · 清执楯亲卫';
        if (f.mem.barPulseT <= 0 && w.heroAlive) {
          f.mem.barPulseT = 2.6;
          if ((f.mem.barStep = (f.mem.barStep ?? 0) + 1) % 2 === 0) ballista(f, w, false);
          else chainLines(f, w);
        }
        if (liveBossAdds(f, w) === 0 || f.mem.barMaxT <= 0) {
          shatterBossBarrier(f, w, 0xffd878, '亲卫全没了……别过来！');
        }
      }
      return true;
    }
    // he raises the flag and the ballista crew answers: the ballista's spanning time (he stands still at the windlass, easy to stagger)
    if ((x.wind ?? 0) > 0) { x.wind -= dt; f.vel.multiplyScalar(Math.exp(-dt * 8)); f.a.setRunning(false); if (x.wind <= 0) f.a.play(new Action('cast', 0.3, 0.9)); return f.st === 'move'; }
    // the guards: two at the start
    if (!x.calls) { x.calls = 1; callIn(w, ['wl_shield', 'wl_shield'], f); }
    // Gate 1 at 65% HP: 6.0s Impervious Full Warship Broadside + Fire Phase 2!
    if (!f.mem.gate1 && f.hp <= f.maxHp * 0.65) {
      f.mem.gate1 = true; dropTeles(f); f.attacking = false; f.phase = 2; f.inv = 99; f.poise = f.d.poise;
      f.mem.barrier = 1; f.mem.fleeT = 6.0; f.mem.barPulseT = 0.5; f.mem.barStep = 0; f.mem.barrierLabel = '无敌 · 躲避全舰齐射';
      setFoeState(f, 'roar', 99); f.a.roar(); cue('roar', 1); shake(0.5 * TUNE.shake);
      w.say?.(f, '全舰齐射！把她轰下江去！'); w.burnStage?.(1);
      const c = f.pos.clone().setY(0.08); fxRing(c, 0xff8a30, 4, { life: 0.6 } as never); fxShock(c, 0xff9a40, 3.5, { life: 0.55 });
      x.fire = 8; return true;
    }
    // Gate 2 at 33% HP: Impervious Command Shield + Escort Squad Clear!
    if (!f.mem.gate2 && f.hp <= f.maxHp * 0.33) {
      f.mem.gate2 = true; dropTeles(f); f.attacking = false; f.inv = 99; f.poise = f.d.poise;
      f.mem.barrier = 2; f.mem.barPulseT = 1.6; f.mem.barMaxT = 24; f.mem.barStep = 0; f.mem.barrierLabel = '无敌 · 清执楯亲卫';
      setFoeState(f, 'roar', 99); f.a.roar(); cue('roar', 1); shake(0.45 * TUNE.shake);
      w.say?.(f, '铁楯死守！护住中军，放箭！');
      callIn(w, ['wl_shield', 'wl_shield', 'wl_oil', 'wl_xbow'], f);
      return true;
    }
    if (f.phase > 1) { x.fire -= dt; if (x.fire <= 0) { x.fire = 8; w.burnStage?.(0); } }
    // the machinery runs on its own clocks (not the attacker cap: these are the ship's, not his)
    const sp = f.phase > 1 ? 1.3 : 1;
    x.bal -= dt * sp; x.pole -= dt * sp; x.lines -= dt * sp;
    if (f.st === 'move' && w.heroAlive) {
      if (x.bal <= 0) { x.bal = R(6.5, 8); ballista(f, w, f.phase > 1); x.wind = 1.6; f.a.play(new Action('cast', 0.6, 0.4)); return true; }
      if (x.pole <= 0) { x.pole = R(7, 9); boom(f, w, f.phase > 1); return false; }
      if (x.lines <= 0) { x.lines = R(8.5, 10.5); chainLines(f, w); if (f.phase > 1) x.comboBoom = 1.15; return false; }
    }
    return false;
  },
  taken: f => (X(f).shielded ? 0.5 : 1),
  think(f, w, dt, dist, dir, yawTo) {
    const want = V3(), can = canStrike(f, w, { calm: true });
    // keeps away: backs off when she closes in, holds 6–9 m, edging along the back of the deck
    if (dist < 5) want.copy(dir).multiplyScalar(-1).addScaledVector(side(dir, f.strafe), 0.6); else if (dist > 9) want.copy(dir).multiplyScalar(0.5); else want.copy(side(dir, f.strafe)).multiplyScalar(0.45);
    if (can && dist < 3.2) { startAttack(f, w, { k: 'line', len: 6 }, 0.5, 7, yawTo, { atk: 'shoot', extra: [{ s: { k: 'line', len: 6 }, dy: 0.28 }, { s: { k: 'line', len: 6 }, dy: -0.28 }] }); f.cd = R(1.2, 1.8); return; }
    if (can && f.phase > 1 && dist > 4 && dist < 10 && Math.random() < dt * 0.5) { startAttack(f, w, { k: 'circle', r: 1.5, ahead: 0 }, 0.9, 9, yawTo, { atk: 'lob', at: w.heroPos.clone(), anchor: true }); f.cd = R(1.5, 2.2); return; }
    steerFoe(f, want, f.d.speed * (dist < 5 ? 1.15 : 0.8), dt, yawTo, true);
  },
  windup(f, w, dt, p, yawTo) { if (f.atk === 'lob') return FOE_AI.wl_oil!.windup!(f, w, dt, p, yawTo); if (p < 0.6) { f.teleYaw = yawTo; f.yaw = yawTo; } return true; },
  strike(f, w) {
    if (f.atk === 'lob') return FOE_AI.wl_oil!.strike!(f, w);
    // the sleeve-bow: three bolts and a hop back
    f.tele?.flash(); for (const e of f.extra) e.t.flash(); setFoeState(f, 'strike', 0.2);
    for (const dy of [0, ...f.extra.map(e => e.dy)]) w.arrows.push(new Bolt(f.pos.clone().add(V3(0, 1.2, 0)), f.teleYaw + dy, f.dmg));
    cue('arrow', 0.8); f.vel.copy(ang(f.teleYaw)).multiplyScalar(-6); return true;
  },
  recover: f => (f.phase > 1 ? 0.45 : 0.7),
};
/** the ballista: a long lane right across the deck from behind him at her (wide 1.1), tracking her for six tenths; it hits everyone on
 *  it (his own guards too). Phase two: two of them, crossing */
function ballista(f: Foe, w: FoeWorld, two: boolean) {
  cue('magic', 0.5); fxFlare(f.a.bones.offhand ? f.a.bones.offhand.localToWorld(V3(0, 1.6, 0)) : f.a.head(), 0xff6a4a, 0.8, 0.3);
  for (const i of two ? [0, 1] : [0]) {
    // the first from behind him, the second (phase two) from the deck's side: crossing lanes
    const from = i === 0 ? f.pos.clone().add(ang(f.yaw).multiplyScalar(-2)) : V3(w.heroPos.x > 0 ? -18 : 18, 0, w.heroPos.z);
    const aim = () => { const d = w.heroPos.clone().sub(from).setY(0); return Math.atan2(d.x, d.z); };
    w.arrows.push(new GroundBlow(from, { k: 'rect', len: 34, w: 1.1 }, aim(), dmgOf(22), i * 0.45, 1.3, { foes: true, owner: f, track: () => ({ yaw: aim() }), trackUntil: 0.6,
      onLand: (_w, _h, yaw) => { cue('boom', 0.6); shake(0.25 * TUNE.shake); trailSeg(from.clone().setY(1.0), from.clone().add(ang(yaw).multiplyScalar(30)).setY(1.0), 0xfff0d0, 0.18, { life: 0.3, bright: 2.6, spark: 0.4 }); } }));
  }
}
/** 拍竿: a boom swung down from the ship's side across a strip (1.6 wide, from the rail out past her by 3 m), not jumpable; phase
 *  two: two, left then right */
function boom(f: Foe, w: FoeWorld, two: boolean) {
  const xs = two ? [-1, 1] : [w.heroPos.x < 0 ? -1 : 1];
  xs.forEach((s, i) => {
    const rail = s * 16, from = V3(rail, 0, w.heroPos.z + R(-0.6, 0.6)), yaw = s > 0 ? -Math.PI / 2 : Math.PI / 2, len = Math.max(9, Math.abs(rail - w.heroPos.x) + 3);
    w.arrows.push(new GroundBlow(from, { k: 'rect', len, w: 1.6 }, yaw, dmgOf(18), i * 0.7, 1.1, { foes: true, owner: f, onLand: () => { cue('pillarFall', 0.8); shake(0.3 * TUNE.shake); fxSmoke(V3(w.heroPos.x, 0.3, from.z), 0x6a5a4a, 10, { r: 1.2, spd: 2, up: 0.4, s: 0.5, life: 0.7 }); } }));
  });
}
/** 连环索: three iron chains snapped taut across the deck, low (jump them), 3 m apart, through where she stands */
function chainLines(f: Foe, w: FoeWorld) {
  cue('foeHeavy', 0.6);
  for (const k of [-1, 0, 1]) {
    const z = w.heroPos.z + k * 3;
    w.arrows.push(new GroundBlow(V3(-18, 0, z), { k: 'rect', len: 36, w: 0.45 }, Math.PI / 2, dmgOf(10), 0.05 * (k + 1), 0.9, { low: true, owner: f, onLand: () => { cue('wallSlam', 0.4); fxSparks(V3(w.heroPos.x, 0.3, z), 0xc8c0b0, 10, 4); } }));
  }
}
/** someone the boss calls in (from the stage's edge, a puff) */
function callIn(w: FoeWorld, kinds: EKind[], boss: Foe) {
  kinds.forEach((k, i) => {
    if (w.spawnReinforce) {
      w.spawnReinforce(k, i);
    } else {
      const s = i % 2 ? 1 : -1, p = V3(boss.pos.x + s * 5, 0, boss.pos.z + 2); w.clamp(p, 0.6); const m = spawnFoe(k, p, w.heroPos.clone()); m.cd = R(0.8, 1.4); w.foes.push(m);
      fxSmoke(p.clone().add(V3(0, 0.3, 0)), 0x6a6a74, 8, { r: 0.6, spd: 1.2, up: 0.6, s: 0.4, life: 0.7 });
    }
  });
  cue('summon', 0.6);
}

// ================================================================== 崔玄 (司空长史): 落子, 取刀, 灭灯
FOE_AI.cx_boss = {
  tick(f, w, dt) {
    const x = X(f);
    if (x.init == null) { x.init = 1; x.stone = 3; x.call = 0; x.calls = 0; x.dark = 0; f.cd = 1.2; drawn(f, false); }
    // act-138 Hades-2 Boss Impervious Phase Gates (66% 6s Go-stone death-trap flee; 33% Lights-out zither+shades clear)
    if (f.mem.barrier > 0) {
      bossBarrierFx(f, dt, 0xd8e4ff);
      f.vel.multiplyScalar(Math.exp(-dt * 8)); f.a.setRunning(false);
      f.mem.barPulseT = (f.mem.barPulseT ?? 0.6) - dt;
      f.mem.barMaxT = (f.mem.barMaxT ?? 24) - dt;
      if (f.mem.barrier === 1) {
        f.mem.fleeT = Math.max(0, (f.mem.fleeT ?? 0) - dt);
        f.mem.barrierLabel = '无敌 · 走气眼躲棋阵';
        if (f.mem.barPulseT <= 0 && w.heroAlive) {
          f.mem.barPulseT = 1.85;
          const step = (f.mem.barStep ?? 0) % 3; f.mem.barStep = step + 1;
          if (step === 0) ring(f, w);
          else if (step === 1) { dragon(f, w); w.arrows.push(new Shockwave(f.pos.clone(), dmgOf(14), 1.0, 12.0, 1.5)); }
          else { ring(f, w); dragon(f, w); }
          f.a.play(new Action('cast', 0.6, 0.45));
        }
        if (f.mem.fleeT <= 0) {
          shatterBossBarrier(f, w, 0xe8ecff);
          drawn(f, true); fxFlare(f.a.weapon(), 0xffffff, 1.2, 0.35); bladeRing(w);
          cue('draw', 1); cue('bladeChorus', 0.85);
        }
      } else {
        f.mem.barrierLabel = '无敌 · 诛击筑与影卫';
        if (f.mem.barPulseT <= 0 && w.heroAlive) {
          f.mem.barPulseT = 2.8;
          dragon(f, w);
          w.arrows.push(new Shockwave(f.pos.clone(), dmgOf(13), 1.0, 12.0, 1.55));
        }
        if (liveBossAdds(f, w) === 0 || f.mem.barMaxT <= 0) {
          shatterBossBarrier(f, w, 0xc8d8ff, '有点意思……那便亲手送你上路。');
          x.hid = 1; hide(f, true); f.cd = 1.4;
        }
      }
      return true;
    }
    // the phases: at two thirds 6s Go-stone flee -> blade; at a third lights-out zither+shade barrier (prologue skips barriers)
    if (f.phase === 1 && f.hp <= f.maxHp * (2 / 3)) {
      if (f.mem.noHide) { phaseTo(f, w, 2); return true; }
      dropTeles(f); f.attacking = false; f.phase = 2; f.inv = 99; f.poise = f.d.poise;
      f.mem.barrier = 1; f.mem.fleeT = 6.0; f.mem.barPulseT = 0.5; f.mem.barStep = 0; f.mem.barrierLabel = '无敌 · 走气眼躲棋阵';
      setFoeState(f, 'roar', 99); f.a.play(new Action('cast', 1.2, 0.6)); cue('snowWind', 0.9); shake(0.4 * TUNE.shake);
      w.say?.(f, '天元死局！连环三手，看你往哪逃！');
      return true;
    }
    if (f.phase === 2 && f.hp <= f.maxHp / 3 && !f.mem.noHide) {
      dropTeles(f); f.attacking = false; f.phase = 3; f.inv = 99; f.poise = f.d.poise;
      f.mem.barrier = 2; f.mem.barPulseT = 1.6; f.mem.barMaxT = 26; f.mem.barrierLabel = '无敌 · 诛击筑与影卫';
      setFoeState(f, 'roar', 99); f.a.play(new Action('cast', 1.0, 0.5));
      w.dark?.(1); x.dark = 1; x.cuts = 0; x.hid = 0;
      cue('snowWind', 1); cue('boom', 0.5); shake(0.45 * TUNE.shake);
      w.say?.(f, '灭灯！影卫与击筑齐发，看你听得清谁！');
      callIn(w, ['cx_zhu', 'cx_shade', 'cx_shade'], f);
      return true;
    }
    // summons through the first two phases: one at each sixth of his life (Phase 2 includes 击筑客 to jam auditory cues!)
    const sixth = Math.floor((1 - f.hp / f.maxHp) * 6);
    if (f.phase < 3 && sixth > (x.calls ?? 0)) {
      x.calls = sixth;
      const pick = f.phase === 2 && !w.foes.some(o => o.kind === 'cx_zhu' && o.st !== 'dead') ? 'cx_zhu' : (Math.random() < 0.5 ? 'cx_sword' : 'cx_guard');
      callIn(w, [pick], f);
    }
    if ((x.exposed ?? 0) > 0) x.exposed = Math.max(0, x.exposed - dt);
    // phase three: in the dark — hidden, only footsteps; three cuts, then a shade called
    if (f.phase === 3) return darkTick(f, w, dt);
    // the stones: one move every 6 s (phase one: every 4.5)
    x.stone -= dt;
    if (x.stone <= 0 && f.st === 'move' && w.heroAlive) { x.stone = f.phase === 1 ? R(4, 5) : R(5.5, 6.5); if (Math.random() < 0.5) dragon(f, w); else ring(f, w); f.a.play(new Action('cast', 0.6, 0.45)); }
    return false;
  },
  think(f, w, dt, dist, dir, yawTo) {
    const want = V3(), can = canStrike(f, w, { calm: true });
    // the dark: out of the smoke for a moment after a cut (or caught by 破势) — he only falls back toward the dark; the cuts come hidden
    if (f.phase === 3) { if (dist < 4) want.copy(dir).multiplyScalar(-1).addScaledVector(side(dir, f.strafe), 0.4); steerFoe(f, want, f.d.speed * 0.8, dt, yawTo, true); return; }
    if (f.phase === 1) {
      // a slow walk, never hurried: keeps 4–7 m, edging round her
      if (dist < 3.5) want.copy(dir).multiplyScalar(-0.6).addScaledVector(side(dir, f.strafe), 0.5); else if (dist > 7) want.copy(dir).multiplyScalar(0.6); else want.copy(side(dir, f.strafe)).multiplyScalar(0.35);
      if (can && dist < 2.6) { startAttack(f, w, { k: 'cone', r: 2.4, half: 0.9 }, 0.5, 10, yawTo, { atk: 'fan' }); f.cd = R(1.0, 1.5); return; }
      steerFoe(f, want, f.d.speed * 0.6, dt, yawTo, true); return;
    }
    // phase two: the blade
    if (dist > 3) want.copy(dir).addScaledVector(side(dir, f.strafe), 0.2);
    if (can && dist < 3.4) { bladeRing(w); cue('draw', 0.72); f.combo = 2; startAttack(f, w, { k: 'cone', r: 3.0, half: 0.9 }, 0.42 + 0.35, 11, yawTo + 0.35, { atk: 'cut' }); f.cd = R(0.6, 1.0); return; }
    if (can && dist >= 3.4 && dist < 7 && Math.random() < dt * 1.3) { bladeRing(w); cue('draw', 0.85); cue('snowWind', 0.55); startAttack(f, w, { k: 'rect', len: 6, w: 1.2 }, 0.55 + 0.35, 18, yawTo, { atk: 'lunge' }); f.cd = R(1.0, 1.4); return; }
    steerFoe(f, want, f.d.speed, dt, yawTo);
  },
  windup(f, _w, dt, p, yawTo) { if (p < 0.4) { f.teleYaw = f.atk === 'cut' ? f.teleYaw : yawTo; turnFoe(f, yawTo, dt, 10); } return true; },
  strike(f, w) {
    if (f.atk !== 'fan') return false;
    // the fan: a cold gust that drives her back out of his reach
    f.tele?.flash(); setFoeState(f, 'strike', 0.2); cue('snowWind', 0.85); cue('swingHeavy', 0.82);
    if (meleeLands(f, w)) w.pull?.(w.heroPos.clone().add(w.heroPos.clone().sub(f.pos).setY(0).normalize().multiplyScalar(2.4)));
    return true;
  },
  follow(f, w, yawTo) { if (f.combo > 0 && f.atk === 'cut') { const s = f.combo % 2 ? -0.35 : 0.35; f.combo--; cue('bladeRing', 0.65); startAttack(f, w, { k: 'cone', r: 3.0, half: 0.9 }, 0.3, 11, yawTo + s, { atk: 'cut' }); return true; } return false; },
  // act-138 Phase 3 灭灯暗室: blind swings deal only 40% dmg until exposed by 破势 / 闪反 / 追影!
  taken: f => (f.phase === 3 && f.st !== 'stagger' && f.brokenT <= 0 && (X(f).exposed ?? 0) <= 0 ? 0.4 : 1),
  recover: f => (f.atk === 'lunge' ? 0.7 : f.phase > 1 ? 0.5 : 0.8),
};
/** he holds the fan / the drawn 文家刀 */
function drawn(f: Foe, on: boolean) { const b = f.a.bones; if (b.fan) b.fan.visible = !on; if (b.blade) b.blade.visible = on; }
function phaseTo(f: Foe, w: FoeWorld, n: 2 | 3) {
  dropTeles(f); f.attacking = false; f.phase = n; f.inv = 1.4; f.poise = f.d.poise; setFoeState(f, 'roar', 1.5);
  w.say?.(f, n === 2 ? PHASE_LINES.cx_boss2 : PHASE_LINES.cx_boss3);
  if (n === 2) { cue('draw', 1); cue('bladeChorus', 0.85); } else { cue('snowWind', 1); cue('boom', 0.5); }
  shake(0.3 * TUNE.shake);
  if (n === 2) { drawn(f, true); f.a.play(new Action('cast', 1.2, 0.6)); fxFlare(f.a.weapon(), 0xffffff, 1.2, 0.35); bladeRing(w); }
  else { f.a.play(new Action('cast', 1.0, 0.5)); w.dark?.(1); X(f).dark = 1; X(f).cuts = 0; X(f).hid = 1; hide(f, true); f.cd = 1.6; }
}
/** the dark: hidden, footsteps circling her; the cut — the gold ring 0.6 s before, the red only in the last 0.3 s, a heavy cone at her
 *  side; 破势 on the gold catches him (he is out and reeling 2 s). Three cuts, then a shade called */
function darkTick(f: Foe, w: FoeWorld, dt: number) {
  const x = X(f);
  if (!x.hid) { x.out = (x.out ?? 0) + dt; if (x.out > 1.6 && f.st === 'move') { x.hid = 1; hide(f, true); smoke(f); cue('dash', 0.65); cue('snowWind', 0.48); } return false; }
  if (f.st === 'windup') {
    // the gold first (her ears), the red only in the last 0.3 s
    const left = f.dur - f.t, show = left < 0.3; if (f.tele) f.tele.g.visible = show;
    f.tele?.set(f.telePos.x, f.telePos.z, f.teleYaw, f.t / f.dur, left);
    if (f.t >= f.dur) { hide(f, false); x.hid = 0; x.out = 0; if (f.tele) f.tele.g.visible = true; cue('foeHeavy', 0.95); defaultStrike(f, w); x.cuts = (x.cuts ?? 0) + 1; if (x.cuts >= 3) { x.cuts = 0; callIn(w, ['cx_shade'], f); } }
    return true;
  }
  const toH = w.heroPos.clone().sub(f.pos).setY(0), d = toH.length();
  const sideP = w.heroPos.clone().add(V3(toH.z, 0, -toH.x).normalize().multiplyScalar(2.2 * f.strafe));
  const go = sideP.sub(f.pos).setY(0); if (go.length() > 0.3) f.vel.lerp(go.normalize().multiplyScalar(f.d.speed * 1.2), Math.min(1, dt * 5));
  x.step = (x.step ?? 0) - dt; if (x.step <= 0) { x.step = 0.3; soundRing(f.pos, 0xc8c8d8, 0.6, 0.6, 0.5); cue('land', 0.36); }
  if (f.cd <= 0 && w.heroAlive && d < 3.2) {
    soundRing(w.heroPos, 0xffd27a, 1.3, 0.7, 0.9); cue('bladeRing', 1); cue('draw', 0.75);
    const y = Math.atan2(toH.x, toH.z); f.yaw = y; f.combo = 0; startAttack(f, w, { k: 'cone', r: 3.2, half: 0.85 }, 0.9, 20, y, { atk: 'cut' }); if (f.tele) f.tele.g.visible = false;
    f.cd = R(1.6, 2.2);
  }
  return true;
}
/** 一条龙: five black stones falling one after another from him toward her (circles r 1.2, 0.15 s apart, each filling 0.8 s) */
function dragon(f: Foe, w: FoeWorld) {
  const d = w.heroPos.clone().sub(f.pos).setY(0), L = Math.max(4, d.length() + 2); d.normalize();
  for (let i = 0; i < 5; i++) { const p = f.pos.clone().addScaledVector(d, 1.6 + i * (L - 1.6) / 4); w.clamp(p, 0.3); w.arrows.push(stone(p, 1.2, 0.15 * i, 0.8, f, true)); }
  cue('stoneCarve', 0.85); cue('snowWind', 0.55);
}
/** 围 (act-138 真棋局气眼): 8 dense high-damage black stones encircle the hero with ONE bright white-stone safe gap (气眼) — must step into the eye! */
function ring(f: Foe, w: FoeWorld) {
  const n = 8, gap = Math.floor(Math.random() * n), a0 = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + i * Math.PI * 2 / n, p = w.heroPos.clone().add(V3(Math.sin(a) * 2.55, 0, Math.cos(a) * 2.55));
    w.clamp(p, 0.3);
    if (i === gap) { whiteStone(p); continue; }
    w.arrows.push(stone(p, 1.55, 0, 1.25, f, true, 18));
  }
  w.arrows.push(stone(w.heroPos.clone(), 1.25, 0, 1.25, f, true, 18));
  cue('stoneCarve', 0.9); cue('snowWind', 0.65); cue('bladeRing', 0.45);
}
const stoneGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.12, 12), blackMat = toon(0x1a1a20), whiteMat = toon(0xeeeee6);
/** the stones lying on the snow, each for a moment (stepped in soundRingsStep's frame via stonesStep) */
const STONES: Array<{ m: THREE.Mesh; t: number }> = [];
function lay(p: THREE.Vector3, black: boolean, t: number) { const m = new THREE.Mesh(stoneGeo, black ? blackMat : whiteMat); m.position.set(p.x, 0.07, p.z); scene.add(m); STONES.push({ m, t }); }
export function stonesStep(dt: number) { for (let i = STONES.length - 1; i >= 0; i--) { STONES[i].t -= dt; if (STONES[i].t <= 0) { STONES[i].m.parent?.remove(STONES[i].m); STONES.splice(i, 1); } } }
/** a falling go stone: a circle on the snow fills, the stone drops onto it and stays a moment (black), bursting the snow */
function stone(p: THREE.Vector3, r: number, delay: number, fill: number, owner: Foe, black: boolean, baseDmg = 12) {
  return new GroundBlow(p, { k: 'circle', r, ahead: 0 }, 0, dmgOf(baseDmg), delay, fill, { owner, onLand: () => {
    lay(p, black, 1.5);
    fxSmoke(V3(p.x, 0.2, p.z), 0xe8ecf4, 6, { r: 0.5, spd: 1.4, up: 0.4, s: 0.3, life: 0.5 }); fxSparks(V3(p.x, 0.2, p.z), 0xf0f4ff, 8, 3);
    cue('wallSlam', 0.62); cue('potBreak', 0.38);
  } });
}
/** the 眼: a white stone that never falls (the way out of the ring), and a bright pale ring round it */
function whiteStone(p: THREE.Vector3) { lay(p, false, 2.0); fxRing(V3(p.x, 0.08, p.z), 0xffffff, 1.15, { life: 1.35 } as never); fxRing(V3(p.x, 0.09, p.z), 0xdff6ff, 0.7, { life: 1.35 } as never); }

/** the bosses' lines on changing phase (agy); the arrival lines are in the region files */
export const PHASE_LINES = { wl_boss: '点火！连船带索，全烧了！', cx_boss2: '听好了，这是你文家第几柄刀？', cx_boss3: '灯灭了，老夫的刀你可看得见？' };
// 崔玄 caught by 破势 (or pinned by 一闪): out of the dark at once, exposed for 3.5s full damage, and he reels a moment longer
FOE_AI.cx_boss!.interrupted = f => { const x = X(f); if (x.hid) { x.hid = 0; x.out = 0; hide(f, false); } if (f.phase === 3) x.exposed = 3.5; if (f.tele) f.tele.g.visible = true; f.dur = Math.max(f.dur, f.phase === 3 ? 2 : 1.5); };
// a shade or a diver caught out of hiding mid-strike shows itself
FOE_AI.cx_shade!.interrupted = f => { const x = X(f); x.hid = 0; x.out = 0; hide(f, false); };
FOE_AI.wl_diver!.interrupted = f => { const x = X(f); x.under = 0; x.up = 0; hide(f, false); };
/** a frame's bookkeeping: the world handle the guards' answers need, the sound rings and the lying stones */
export function r45Frame(w: FoeWorld, dt: number) { WORLD = w; soundRingsStep(dt); stonesStep(dt); }
