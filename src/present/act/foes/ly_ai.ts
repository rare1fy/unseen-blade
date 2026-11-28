// 第二关 · 洛阳余烬的敌人（11-18）：EDEFS + 每种自己的打法（foes/roles.ts 的 RoleAI，enemy.ts 的状态机调用）。
// 模型在 foes/ly_models.ts（细格子 3.5 厘米，专用动作在 ly_poses.ts）。设计和「怎么打」见 docs/DESIGN.md「第二关、第三关的敌人和头目」。
//   飞熊长戟 ly_halberd   保持 3～4 米，太近往后跳；长戟直刺（长条 4.6 × 0.8）；刺完收戟 0.9 秒、正面空门。精英：刺完接横扫。
//   凉州突骑 ly_rider     拉开到 8 米以上，刨地，冲锋（长条 12 × 1.6，能跳过）；冲到头 1.2 秒才掉头；撞墙 / 掩体摔下马晕 2 秒。精英：连冲两趟。
//   覆铁重盾 ly_shield    大盾一直对着你，正面挨刀只弹火星；背后 / 侧后才进刀；劈山、爆炸、撞墙照样伤；盾撞（短长条）；破势接住盾撞 →
//                        盾震开 2.5 秒（正面也能砍）。精英：盾撞后接一刀。
//   摧坚强弩 ly_xbow      后排；两个以上时一起齐射（错开 0.1 秒），之间装填 2.2 秒；箭能砍飞。精英：一人三连发。
//   泼油狂卒 ly_torch     5～7 米，抛火油罐：落点圆圈，砸碎地上烧一片（2.5 秒）；罐子在空中能砍回去；被火或爆炸碰到当场自爆。精英：三罐。
//   搜骨乱卒 ly_looter    成群、弱、快，短戳（同流民），算半个出手的人。
//   头目 飞熊校尉 · 阎虎 ly_boss：抡斧横扫 / 开山劈（破势接住 → 斧卡地 1.5 秒）/ 冲阵（引他撞墙 → 晕 2.2 秒）；半血扯甲：
//                        甲片甩落、架势少四成、起手快两成，加掷斧（来回两趟）和铁水泼地（扇形落下后变成烧红的铁水，4 秒）；每 12 秒叫人。
import * as THREE from 'three';
import { V3, R } from '../../engine/world';
import { Action } from '../../actors/rig';
import { cue } from '../../../audio/cues';
import { shake, clock, after } from '../../engine/clock';
import { fxSparks, fxSmoke, fxRing, fxGlow, fxEmbers, trailSeg } from '../../fx/fx';
import { fxShock } from '../../fx/skillFx';
import { addBlock } from '../../fx/blocks';
import { TUNE } from '../tune';
import { Tele, inside } from '../tele';
import { EDEFS, addFoes, AI, Arrow, Shockwave, spawnFoe, LOW_CLEAR, dropTeles, applyAllySpread, bossBarrierFx, shatterBossBarrier, liveBossAdds, type Foe, type FoeWorld } from '../enemy';
import { ROLE_AI, type RoleAI, type ThinkCtx } from './roles';

// ------------------------------------------------------------------ the roster (names: agy)
/** 西凉兵开打时喊的（agy） */
const BARK_LY = ['哪来的蒙眼瞎狗！', '瞎子也敢来送死！', '抓去填炉铸小钱！', '扔进铁水化成渣！', '剁碎了喂西凉马！', '泼油，烧死这瞎子！', '结大盾，撞烂他！', '强弩齐射，扎成猬！', '飞熊军前不留活口！', '听风辨位？听你娘！'];
addFoes({
  ly_halberd: { model: 'ly_halberd', hp: 46, r: 0.46, speed: 2.6, mass: 1.1, poise: 0, gold: 2, name: '飞熊长戟', role: 'ly_halberd', elite: 'ly_halberd_e', barks: BARK_LY },
  ly_rider: { model: 'ly_rider', hp: 70, r: 0.85, speed: 3.4, mass: 2.4, poise: 0, gold: 4, name: '凉州突骑', role: 'ly_rider', elite: 'ly_rider_e', barks: BARK_LY },
  ly_shield: { model: 'ly_shield', hp: 64, r: 0.55, speed: 1.9, mass: 2.0, poise: 0, gold: 3, name: '覆铁重盾', role: 'ly_shield', elite: 'ly_shield_e', barks: BARK_LY },
  ly_xbow: { model: 'ly_xbow', hp: 30, r: 0.44, speed: 2.4, mass: 0.9, poise: 0, gold: 2, name: '摧坚强弩', role: 'ly_xbow', elite: 'ly_xbow_e', barks: BARK_LY },
  ly_torch: { model: 'ly_torch', hp: 32, r: 0.44, speed: 2.7, mass: 0.9, poise: 0, gold: 2, name: '泼油狂卒', role: 'ly_torch', elite: 'ly_torch_e', barks: BARK_LY },
  ly_looter: { model: 'ly_looter', hp: 22, r: 0.38, speed: 3.6, mass: 0.6, poise: 0, gold: 1, name: '搜骨乱卒', role: 'ly_looter', alt: ['ly_looter_b'], weight: 0.5, barks: BARK_LY },
  ly_boss: { model: 'ly_boss', hp: 640, r: 0.95, speed: 2.1, mass: 4.2, poise: 140, gold: 35, name: '飞熊校尉 · 阎虎', role: 'ly_boss', boss: true, tag: '高炉火烈，大斧生嚼', intro: '哪来的瞎狗？投进炉里铸钱！' },
});

// ------------------------------------------------------------------ shared bits
const side = (k: ThinkCtx, m: number) => k.side.clone().multiplyScalar(m);
const away = (k: ThinkCtx, m = 1) => k.dir.clone().multiplyScalar(-m);
const fwd = (yaw: number) => V3(Math.sin(yaw), 0, Math.cos(yaw));
/** turn toward a yaw at most `rate` rad/s (the slow turners: the shield, the boss) */
const turn = (f: Foe, yaw: number, rate: number, dt: number) => { let d = yaw - f.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; f.yaw += Math.max(-rate * dt, Math.min(rate * dt, d)); };
/** the hero is behind the foe's facing by more than `half` rad (0 = straight behind is π) */
const angleTo = (f: Foe, p: THREE.Vector3) => { const d = p.clone().sub(f.pos).setY(0); let a = Math.atan2(d.x, d.z) - f.yaw; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return Math.abs(a); };
/** an area blow at the end of a wind-up over the foe's warning shape: hurt / a perfect dodge (the generic strike's rule) */
function areaHit(f: Foe, w: FoeWorld, low = false) {
  const s = f.shape; if (!s || !w.heroAlive) return;
  if (inside(s, f.telePos.x, f.telePos.z, f.teleYaw, w.heroPos.x, w.heroPos.z, w.heroR)) { if (low && w.heroY >= LOW_CLEAR) w.dodged(f.pos.clone()); else w.hurtHero(f.dmg, f.pos.clone(), f); }
  else if (w.heroDodge && inside(s, f.telePos.x, f.telePos.z, f.teleYaw, w.heroPos.x, w.heroPos.z, w.heroR + 0.65)) w.dodged(f.pos.clone());
}
/** end the attack into its recover (the calm after a blow, as enemy.ts does) */
const recover = (f: Foe, s: number) => { f.lunge = null; AI.calm(TUNE.atkCalm); AI.setSt(f, 'recover', s); };

// ------------------------------------------------------------------ 飞熊长戟: keeps its distance, a long straight thrust
const halberd: RoleAI = {
  think(f, w, k) {
    const d = k.dist;
    // too close: a hop back (a short burst of speed straight away) — at most every 1.4 s
    if (d < 2.2 && (f.mem.hopT ?? 0) <= 0) { f.mem.hopT = 1.4; f.vel.copy(away(k, 5.2)); f.a.play(new Action('hop', 0.45, 0.5)); return 'busy'; }
    if (k.can && d > 2.0 && d < 5.2) {
      f.combo = f.elite ? 1 : 0;
      AI.startAttack(f, w, { k: 'rect', len: 4.6, w: 0.8 }, 0.75, 12, k.yawTo, { atk: 'thrust', act: { name: 'thrust', imp: 0.6, data: { dist: 0.5 } } });
      return 'busy';
    }
    if (d > 4.4) return { want: k.dir.clone().addScaledVector(k.side, 0.3) };
    if (d < 3.0) return { want: away(k, 0.7).addScaledVector(k.side, 0.6), aim: true };
    return { want: side(k, 0.7), aim: true };
  },
  tick(f, _w, dt) { f.mem.hopT = (f.mem.hopT ?? 0) - dt; },
  windup(f, _w, _dt, p, yawTo) { if (p < 0.55) { f.teleYaw = yawTo; f.yaw = yawTo; } return true; },
  strike(f, w) {
    if (f.atk === 'sweepH') { areaHit(f, w); cue('foeSwing', 0.8); AI.setSt(f, 'strike', 0.2); return true; }
    areaHit(f, w); cue('foeSwing', 0.8); fxSparks(f.a.weapon(), 0xe8ecf2, 6, 3);
    AI.setSt(f, 'strike', 0.15);
    return true;
  },
  striking(f, w) {
    if (f.t < f.dur) return;
    // the elite: straight on into a sweep (so a thrust dodged by stepping in front of the shaft is not safe)
    if (f.combo > 0 && w.heroAlive) { f.combo--; AI.startAttack(f, w, { k: 'cone', r: 2.6, half: 1.1 }, 0.4, 10, Math.atan2(w.heroPos.x - f.pos.x, w.heroPos.z - f.pos.z), { atk: 'sweepH', act: { name: 'sweepHalberd', imp: 0.55 } }); return; }
    // the shaft comes back slowly: the open moment in front of him
    f.combo = 0; recover(f, 0.9);
  },
  recover: () => 0.9,
};

// ------------------------------------------------------------------ 凉州突骑: a long charge across the floor
const RIDE_LEN = 12, RIDE_SPEED = 16;
const rideLane = (d: number) => Math.min(RIDE_LEN, d + 4);
const rider: RoleAI = {
  think(f, w, k) {
    const d = k.dist;
    if (k.can && d > 6.5 && (f.mem.rideCd ?? 0) <= 0) {
      // the run up: pawing the ground, the lance down; a long lane from him past her (jumpable: white bars)
      f.combo = f.elite ? 1 : 0; f.mem.rideCd = 3.0;
      AI.startAttack(f, w, { k: 'rect', len: rideLane(d), w: 1.6 }, 1.1, 16, k.yawTo, { atk: 'ride', act: { name: 'paw', imp: 0.92 } });
      return 'busy';
    }
    // circling wide: out to 8 m and round
    if (d < 7.5) return { want: away(k, 0.8).addScaledVector(k.side, 1.0), sp: 1.0, aim: false };
    return { want: side(k, 1.0).addScaledVector(k.dir, 0.15), sp: 0.8 };
  },
  tick(f, _w, dt) { f.mem.rideCd = (f.mem.rideCd ?? 0) - dt; },
  windup(f, _w, _dt, p, yawTo) { if (p < 0.6) { f.teleYaw = yawTo; f.yaw = yawTo; } return true; },
  low: (_f, s) => s.k === 'rect',
  strike(f) {
    // at a steady gallop along the lane (a short lane is a short ride, not a slow one); the contact is enemy.ts's lunge check (low: a jump clears it)
    const len = f.shape && f.shape.k === 'rect' ? f.shape.len : RIDE_LEN, t = len / RIDE_SPEED;
    f.lunge = fwd(f.teleYaw).multiplyScalar(RIDE_SPEED); f.yaw = f.teleYaw; f.mem.thrown = false;
    AI.setSt(f, 'strike', t); f.a.play(new Action('charge', t + 0.2, 0.5)); cue('foeCry', 0.9, 1); cue('dash', 0.7);
    return true;
  },
  striking(f, w, dt) {
    if (Math.random() < dt * 30) fxSmoke(f.pos.clone().setY(0.15), 0x6a6058, 1, { r: 0.4, spd: 0.8, up: 0.3, s: 0.3, life: 0.5 });
    if (f.t < f.dur || f.mem.thrown) return;
    f.lunge = null; f.vel.multiplyScalar(0.25);
    if (f.combo > 0 && w.heroAlive) { f.combo--; const y = Math.atan2(w.heroPos.x - f.pos.x, w.heroPos.z - f.pos.z); AI.startAttack(f, w, { k: 'rect', len: rideLane(f.pos.distanceTo(w.heroPos)), w: 1.6 }, 0.8, 16, y, { atk: 'ride', act: { name: 'paw', imp: 0.92 } }); return; }
    // at the end of the run: 1.2 s to rein in and turn — the time to cut him
    recover(f, 1.2);
    // Only the rig turns during this recovery; the next attack still locks its own direction.
    const turn = Math.atan2(w.heroPos.x - f.pos.x, w.heroPos.z - f.pos.z) - f.yaw;
    f.a.play(new Action('rein', 1.2, 0.5, { turn: Math.atan2(Math.sin(turn), Math.cos(turn)) }));
  },
  // into a wall / cover at speed: thrown from the saddle, down 2 s
  bumped(f, _w, dx, dz) {
    if (f.st !== 'strike' || !f.lunge || f.mem.thrown || Math.hypot(dx, dz) < 0.02) return;
    f.mem.thrown = true; f.lunge = null; f.vel.set(0, 0, 0); f.attacking = false; dropTeles(f);
    // The fall rolls off the free side of the saddle, away from the surface that stopped the horse.
    const fallSide = Math.sign(dx * Math.cos(f.yaw) - dz * Math.sin(f.yaw)) || -1;
    AI.setSt(f, 'stagger', 2.0); f.a.play(new Action('unhorse', 2.0, 0.3, { fallSide })); shake(0.25 * TUNE.shake); cue('wallSlam', 1); cue('foePain', 1, 1);
    fxSmoke(f.pos.clone().setY(0.4), 0x8a7a6a, 10, { r: 0.8, spd: 1.8, up: 0.8, s: 0.5, life: 0.8 });
  },
  recover: () => 1.2,
};

// ------------------------------------------------------------------ 覆铁重盾: the shield faces her; go round, or break it
/** how much of the front the shield covers (rad either side of his facing), and how fast he can turn it (rad/s: slower than she can
 *  circle him at close range, ~2.7 rad/s at 2 m — so going round him works; a dash round is quicker still) */
const SHIELD_HALF = 1.05, SHIELD_TURN = 1.7;
const shield: RoleAI = {
  think(f, w, k) {
    // always squaring up to her, slowly; a slow walk in
    turn(f, k.yawTo, SHIELD_TURN, k.dt);
    if (k.can && k.dist < 2.4 && (f.mem.stunT ?? 0) <= 0 && angleTo(f, w.heroPos) < 0.6) {
      f.combo = f.elite ? 1 : 0;
      AI.startAttack(f, w, { k: 'rect', len: 2.0, w: 1.3 }, 0.65, 8, f.yaw, { atk: 'bash', act: { name: 'bash', imp: 0.55, data: { dist: 0.9 } } });
      return 'busy';
    }
    const want = k.dist > 1.6 ? k.dir.clone().addScaledVector(k.side, 0.12) : V3();
    applyAllySpread(f, w, want);
    if (want.lengthSq() > 0.0025) want.normalize().multiplyScalar(f.d.speed);
    f.vel.lerp(want, Math.min(1, k.dt * 6)); f.a.setRunning(f.vel.length() > 0.6);
    return 'busy';
  },
  tick(f, _w, dt) {
    if ((f.mem.stunT ?? 0) > 0) { f.mem.stunT -= dt; if (f.mem.stunT <= 0 && f.st === 'move') f.cd = Math.max(f.cd, 0.3); }
  },
  // the bash aims where the shield already faces (no snapping round to her)
  windup(f, _w, dt, _p, yawTo) { turn(f, yawTo, SHIELD_TURN * 0.5, dt); f.teleYaw = f.yaw; return true; },
  strike(f, w) {
    if (f.atk === 'cutS') { areaHit(f, w); cue('foeSwing', 0.7); AI.setSt(f, 'strike', 0.18); return true; }
    // the bash: a shove along the short lane; a hit sends her back
    areaHit(f, w); cue('foeHeavy', 0.6); f.vel.copy(fwd(f.teleYaw).multiplyScalar(4)); AI.setSt(f, 'strike', 0.2);
    return true;
  },
  striking(f, w) {
    if (f.t < f.dur) return;
    if (f.combo > 0 && w.heroAlive && f.atk === 'bash') { f.combo--; AI.startAttack(f, w, { k: 'cone', r: 2.2, half: 0.9 }, 0.32, 10, Math.atan2(w.heroPos.x - f.pos.x, w.heroPos.z - f.pos.z), { atk: 'cutS', act: { name: 'cutAfter', imp: 0.5 } }); return; }
    f.combo = 0; recover(f, 0.7);
  },
  // the shield: from in front (within SHIELD_HALF of where he faces) a blade glances off — 劈山, a slam into a wall, a blast, fire and
  // 一闪 / 破势 go through; while it is knocked aside (stunT) nothing is held
  guard(f, dmg, from, kind) {
    if ((f.mem.stunT ?? 0) > 0) return undefined;
    if (kind === 'plunge' || kind === 'school' || kind === 'rel' || kind === 'parry' || kind === 'clash' || kind === 'ult' || kind === 'ultTick') return undefined;
    if (angleTo(f, from) > SHIELD_HALF) return undefined;   // from the side or behind: the blade gets in
    void dmg; return 0;
  },
  // 破势 caught the bash: the shield is knocked wide, 2.5 s (only a bash in its wind-up — 一闪 pinning him on her way is no catch)
  interrupted(f) { if (f.mem.intFrom === 'windup' && f.atk === 'bash') { f.mem.stunT = 2.5; f.a.play(new Action('stun', 2.5, 0.2)); cue('guardBreak', 1); } },
  recover: () => 0.7,
};

// ------------------------------------------------------------------ 摧坚强弩: they loose together
/** the next volley's time (the crossbows on the floor wait for each other) */
let volleyAt = 0;
const XBOW_RELOAD = 2.2;
const xbow: RoleAI = {
  think(f, w, k) {
    const d = k.dist;
    if (f.mem.reloadT > 0) { f.vel.multiplyScalar(Math.exp(-k.dt * 6)); return 'busy'; }
    // the volley: all the crossbows in range join the one that starts it, 0.1 s apart
    const mates = w.foes.filter(o => o.role === 'ly_xbow' && o.st !== 'dead');
    const ready = clock.time >= volleyAt && d > 3 && d < 12 && k.can;
    if (ready || (f.mem.joinAt != null && clock.time >= f.mem.joinAt)) {
      if (ready && mates.length > 1) { volleyAt = clock.time + 3.4; let i = 0; for (const o of mates) if (o !== f && o.st === 'move' && !(o.mem.reloadT > 0)) o.mem.joinAt = clock.time + 0.1 * ++i; }
      f.mem.joinAt = undefined;
      const len = Math.min(13, d + 3), extra = f.elite ? [{ s: { k: 'line' as const, len }, dy: 0.12 }, { s: { k: 'line' as const, len }, dy: -0.12 }] : [];
      AI.startAttack(f, w, { k: 'line', len }, 1.1, 9, k.yawTo, { atk: 'shoot', extra, act: { name: 'aimXbow', imp: 0.85 } });
      return 'busy';
    }
    if (d < 5) return { want: away(k, 1).addScaledVector(k.side, 0.4), sp: 1.05, aim: true };
    if (d > 10) return { want: k.dir.clone(), aim: true };
    return { want: side(k, 0.5), aim: true };
  },
  tick(f, _w, dt) { if (f.mem.reloadT > 0) f.mem.reloadT -= dt; },
  windup(f, _w, _dt, p, yawTo) { if (p < 0.7) { f.teleYaw = yawTo; f.yaw = yawTo; } return true; },
  strike(f, w) {
    const ys = [0, ...f.extra.map(e => e.dy)];
    ys.forEach((dy, i) => after(i * 0.09, () => { if (f.st !== 'dead') w.arrows.push(new Arrow(f.pos.clone().add(V3(0, 1.2, 0)), f.teleYaw + dy, f.dmg, 18)); }));
    cue('arrow', 0.8); AI.setSt(f, 'strike', 0.18);
    // the reload: the bow down, a foot in the stirrup, both hands on the string — open for a while
    f.mem.reloadT = XBOW_RELOAD; f.a.play(new Action('reload', XBOW_RELOAD, 0.5));
    return true;
  },
  recover: () => 0.3,
};

// ------------------------------------------------------------------ 泼油狂卒: a lobbed oil jar; fire on the floor
/** a jar of oil in flight: an arc to its mark (a circle on the ground for the last part), a cut sends it back; it bursts into fire */
class OilJar extends Arrow {
  private t = 0; private tele: Tele | null = null; private h0: number; private from: THREE.Vector3; private to: THREE.Vector3; private dur: number;
  constructor(from: THREE.Vector3, to: THREE.Vector3, dmg: number, private owner: Foe | null) {
    super(from.clone(), 0, dmg, 0, true);
    this.from = from.clone(); this.to = to.clone().setY(0); this.dur = 0.6 + Math.min(0.35, from.distanceTo(to) * 0.03); this.h0 = from.y; this.life = 9;
    const jar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.2), new THREE.MeshLambertMaterial({ color: 0x8a4a2c })), wick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
    wick.position.y = 0.16; this.body.add(jar, wick);
  }
  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    if (this.friendly) { super.update(dt, w); this.body.rotation.x += dt * 14; return; }
    this.t += dt; const k = Math.min(1, this.t / this.dur);
    this.p.lerpVectors(this.from, this.to, k); this.p.y = this.h0 * (1 - k) + Math.sin(k * Math.PI) * 2.2; this.g.position.copy(this.p); this.body.rotation.x += dt * 9;
    if (Math.random() < dt * 30) fxSparks(this.p.clone().add(V3(0, 0.15, 0)), 0xffa040, 1, 1.2, { life: 0.25 });
    if (!this.tele) { this.tele = new Tele({ k: 'circle', r: 1.4, ahead: 0 }); }
    this.tele.set(this.to.x, this.to.z, 0, k, (1 - k) * this.dur);
    if (k >= 1) this.burst(w, this.to);
  }
  private burst(w: FoeWorld, at: THREE.Vector3) {
    this.tele?.flash(); const c = V3(at.x, 0.1, at.z);
    fxSparks(c.clone().setY(0.4), 0xffb050, 18, 5); fxGlow(c.clone().setY(0.4), 0xff8a30, 1.6, 0.3); fxSmoke(c.clone().setY(0.4), 0x3a2e28, 6, { r: 0.5, s: 0.4, life: 0.7 }); cue('potBreak', 0.8); cue('fire', 0.8);
    if (!this.friendly) {
      const d = Math.hypot(c.x - w.heroPos.x, c.z - w.heroPos.z);
      if (w.heroAlive && w.heroY < 1.2 && d <= 1.4 + w.heroR) { if (w.heroDodge) w.dodged(c); else w.hurtHero(this.dmg, c); }
    } else for (const f of w.foes.slice()) if (f.st !== 'dead' && Math.hypot(c.x - f.pos.x, c.z - f.pos.z) <= 1.4 + f.d.r) w.arrowHit(f, this);
    w.ignite?.(c.x, c.z, 1.5, 2.5);
    this.tele?.dispose(); this.tele = null; this.kill();
  }
  deflect(dir: THREE.Vector3) { super.deflect(dir); this.v.setLength(12); this.life = 0.9; this.tele?.dispose(); this.tele = null; }
  kill() { this.tele?.dispose(); this.tele = null; super.kill(); }
}
const torch: RoleAI = {
  think(f, w, k) {
    const d = k.dist;
    if (k.can && d > 3.5 && d < 9.5) { f.mem.lobs = f.elite ? 3 : 1; AI.startAttack(f, w, { k: 'circle', r: 0.6, ahead: 0 }, 0.9, 10, k.yawTo, { atk: 'lob', act: { name: 'lob', imp: 0.75 } }); f.cd = R(1.8, 2.6); return 'busy'; }
    if (d < 5) return { want: away(k, 1).addScaledVector(k.side, 0.6), sp: 1.1, aim: true };
    if (d > 7.5) return { want: k.dir.clone(), aim: true };
    return { want: side(k, 0.6), aim: true };
  },
  windup(f, _w, _dt, p, yawTo) { if (p < 0.8) { f.teleYaw = yawTo; f.yaw = yawTo; } return true; },
  strike(f, w) {
    // the warning under him is only the throw's beat; the real mark is the circle at the jar's landing
    f.tele?.dispose(); f.tele = null;
    const n = f.mem.lobs ?? 1, at = w.heroPos.clone().setY(0);
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? V3() : fwd(f.teleYaw + Math.PI / 2).multiplyScalar((i - 1) * 2.0).add(fwd(f.teleYaw).multiplyScalar(i === 1 ? 0.8 : 0));
      const to = at.clone().add(off); w.clamp(to, 0.3);
      w.arrows.push(new OilJar(f.pos.clone().add(V3(0, 1.6, 0)), to, f.dmg, f));
    }
    cue('foeSwing', 0.7); AI.setSt(f, 'strike', 0.25);
    return true;
  },
  recover: () => 0.6,
};
/** the jars at his belt: fire, a blast or being slammed into a wall (show.ts brings those in as kind 'school') sets them off a beat
 *  later. It only marks the fuse — the hit itself lands as usual */
const torchGuard: NonNullable<RoleAI['guard']> = (f, _dmg, _from, kind) => {
  if (kind === 'school' && !f.mem.boomed) { f.mem.boomed = true; f.mem.boomAt = clock.time + 0.25; }
  return undefined;
};
torch.guard = torchGuard;
torch.tick = (f, w) => {
  if (f.mem.boomAt != null && clock.time >= f.mem.boomAt) {
    f.mem.boomAt = undefined; if (f.st === 'dead') return;
    const c = f.pos.clone().setY(0.1);
    fxSparks(c.clone().setY(0.6), 0xffb050, 26, 6); fxShock(c, 0xff9a40, 2.2, { life: 0.4 }); fxGlow(c.clone().setY(0.6), 0xff8a30, 2.2, 0.35); cue('boom', 0.9); shake(0.3 * TUNE.shake);
    w.ignite?.(c.x, c.z, 1.8, 2.5);
    for (const o of w.foes.slice()) if (o !== f && o.st !== 'dead' && o.kind !== 'dummy' && o.pos.distanceTo(c) < 2.3 + o.d.r) w.arrowHit(o, new Arrow(c.clone(), 0, 20, 0, true));
    if (w.heroAlive && Math.hypot(w.heroPos.x - c.x, w.heroPos.z - c.z) < 2.3 && w.heroY < 1.2) { if (w.heroDodge) w.dodged(c); else w.hurtHero(Math.round(12 * TUNE.enemyDmg), c); }
    // dead first, then the death (killFoe counts who is left standing: he must not count)
    f.hp = 0; f.st = 'dead'; f.attacking = false; dropTeles(f); f.lastDmg = f.maxHp;
    w.killFoe(f, c.clone().add(V3(0, 0, 1)));
  }
};

// ------------------------------------------------------------------ 搜骨乱卒: outer-ring flanker (orbits when waiting for an attack slot)
const looter: RoleAI = {
  think(f, w, k) {
    if (k.can && k.dist < 1.75) { AI.startAttack(f, w, { k: 'rect', len: 1.6, w: 0.6 }, 0.44, 5, k.yawTo, { atk: 'poke' }); f.cd = R(0.45, 0.95); return 'busy'; }
    if (!k.can) {
      if (k.dist > 3.2) return { want: k.dir.clone().addScaledVector(k.side, 0.8) };
      if (k.dist < 2.1) return { want: away(k, 0.45).addScaledVector(k.side, 0.95) };
      return { want: side(k, 0.95) };
    }
    if (k.dist > 1.35) return { want: k.dir.clone().addScaledVector(k.side, 0.35) };
    return { want: side(k, 1).addScaledVector(k.dir, -0.3) };
  },
  windup(f, _w, _dt, p, yawTo) { if (p < 0.35) { f.teleYaw = yawTo; f.yaw = yawTo; } return true; },
  recover: () => 0.45,
};

// ================================================================== 头目 · 飞熊校尉 · 阎虎
/** molten iron on the floor: a patch that burns whoever stands in it (6 every 0.4 s), the boss walks through it */
class MoltenPool extends Arrow {
  private t = 0; private tick = 0; private disc: THREE.Mesh;
  constructor(at: THREE.Vector3, private yaw: number, private r: number, private half: number, dmg: number, private dur: number, private owner: Foe) {
    super(V3(at.x, 0.05, at.z), 0, dmg, 0, true); this.friendly = true; this.life = 99;
    const g = new THREE.CircleGeometry(r, 18, Math.PI / 2 - half, half * 2); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI);
    this.disc = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.disc.renderOrder = 2; this.g.add(this.disc); this.g.rotation.y = yaw;
  }
  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    this.t += dt; this.tick -= dt;
    const m = this.disc.material as THREE.MeshBasicMaterial; m.opacity = Math.min(1, (this.dur - this.t) / 0.6) * (0.5 + 0.1 * Math.sin(this.t * 17));
    if (Math.random() < dt * 22) { const a = this.yaw + (Math.random() * 2 - 1) * this.half, d = Math.sqrt(Math.random()) * this.r; fxEmbers(V3(this.p.x + Math.sin(a) * d, 0.08, this.p.z + Math.cos(a) * d), 0xff8a2a, 1, { r: 0.1, up: 1.4, life: 0.6 }); }
    if (this.tick <= 0) {
      this.tick = 0.4;
      if (w.heroAlive && w.heroY < 0.3 && inside({ k: 'cone', r: this.r, half: this.half }, this.p.x, this.p.z, this.yaw, w.heroPos.x, w.heroPos.z, w.heroR * 0.6)) w.hurtHero(this.dmg, this.p.clone());
      for (const f of w.foes.slice()) if (f !== this.owner && f.st !== 'dead' && f.kind !== 'dummy' && inside({ k: 'cone', r: this.r, half: this.half }, this.p.x, this.p.z, this.yaw, f.pos.x, f.pos.z, 0.1)) w.arrowHit(f, this);
    }
    if (this.t >= this.dur) this.kill();
  }
}
/** the thrown axe: out along a lane, spinning, then back to his hand (it hurts both ways) */
class FlyingAxe extends Arrow {
  private t = 0; private hitOut = false; private hitBack = false; private out: THREE.Vector3; private start: THREE.Vector3;
  constructor(private owner: Foe, yaw: number, private len: number, dmg: number) {
    super(owner.pos.clone().add(V3(0, 1.1, 0)), yaw, dmg, 0, true); this.friendly = true; this.life = 9;
    this.start = this.p.clone(); this.out = this.p.clone().add(fwd(yaw).multiplyScalar(len));
    // Spin the same blade about its middle so the broad edge reads on the way out and back.
    const held = owner.a.bones.weapon?.children.find((part): part is THREE.Mesh => part instanceof THREE.Mesh);
    if (held) {
      const flying = new THREE.Mesh(held.geometry, held.material);
      flying.scale.setScalar(0.72); flying.position.z = -0.55; this.body.add(flying);
      return;
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.4), new THREE.MeshLambertMaterial({ color: 0x9aa0a8 })), haft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.2), new THREE.MeshLambertMaterial({ color: 0x3a2418 }));
    head.position.z = 0.5; this.body.add(head, haft);
  }
  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    this.t += dt; const T = 0.55, back = this.t > T + 0.15;
    const k = !back ? Math.min(1, this.t / T) : Math.max(0, 1 - (this.t - T - 0.15) / T);
    const home = this.owner.st !== 'dead' ? this.owner.pos.clone().add(V3(0, 1.1, 0)) : this.start;
    const p0 = this.p.clone(); this.p.lerpVectors(back ? home : this.start, this.out, back ? k : 1 - (1 - k) * (1 - k)); if (back) this.p.lerpVectors(home, this.out, k);
    this.g.position.copy(this.p); this.body.rotation.y += dt * 22;
    trailSeg(p0, this.p.clone(), 0xd8dce4, 0.18, { life: 0.18, bright: 1.6, spark: 0.2 });
    const dd = Math.hypot(this.p.x - w.heroPos.x, this.p.z - w.heroPos.z);
    if (w.heroAlive && w.heroY < 1.6 && dd < 0.9 + w.heroR) {
      if (!back && !this.hitOut) { this.hitOut = true; if (w.heroDodge) w.dodged(this.p.clone()); else w.hurtHero(this.dmg, this.p.clone(), this.owner); }
      if (back && !this.hitBack) { this.hitBack = true; if (w.heroDodge) w.dodged(this.p.clone()); else w.hurtHero(this.dmg, this.p.clone(), this.owner); }
    }
    if (back && k <= 0) { this.owner.mem.axeOut = false; showAxe(this.owner, true); this.owner.a.play(new Action('catchAxe', 0.4, 0.5)); cue('parry', 0.5); this.kill(); }
  }
}
/** the axe in his hands while it flies (the whole axe hangs on the weapon joint): his hands empty, then back */
const showAxe = (f: Foe, on: boolean) => { const b = f.a.bones.weapon; if (b) b.visible = on; };
/** the armour plates thrown off at the turn: glowing blocks bouncing out across the floor */
function throwArmour(f: Foe) {
  const c = f.a.chest();
  for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, s = 2.2 + Math.random() * 3; addBlock(c.clone().add(V3(Math.cos(a) * 0.3, Math.random() * 0.5, Math.sin(a) * 0.3)), { size: 0.1 + Math.random() * 0.1, v: V3(Math.cos(a) * s, 2.5 + Math.random() * 3, Math.sin(a) * s), col: i % 3 ? 0x5a5250 : 0xd86a2a, glow: i % 3 === 0, grav: 14, floor: 0.03, spin: 7, life: 3.5, shrink: 0.3 }); }
  for (const n of ['armorChest', 'armorShL', 'armorShR', 'armorSkirt']) { const b = f.a.bones[n]; if (b) b.visible = false; }
}
const YAN = { sweepR: 3.6, sweepHalf: 1.22, chopLen: 5.0, chopW: 1.4, ramW: 1.8 };
const yanhu: RoleAI = {
  think(f, w, k) {
    if (f.mem.barrier > 0) return 'busy';
    const d = k.dist, p2 = f.phase > 1;
    if (f.mem.axeOut) { return { want: k.dir.clone().addScaledVector(k.side, 0.4), sp: 0.9 }; }   // empty-handed, walking at her (the moment)
    if (!k.can) return d > 2.6 ? { want: k.dir.clone().addScaledVector(k.side, 0.25) } : { want: side(k, 0.6), aim: true };
    // the second phase's two: the thrown axe from range, the kicked trough when she is in front at middle range
    if (p2 && d > 4.5 && d < 10 && (f.mem.throwCd ?? 0) <= 0) { f.mem.throwCd = R(6, 8); AI.startAttack(f, w, { k: 'rect', len: 9, w: 1.0 }, 0.8, 14, k.yawTo, { atk: 'axeThrow', act: { name: 'axeThrow', imp: 0.7 } }); return 'busy'; }
    if (p2 && d > 2.0 && d < 5.5 && (f.mem.ironCd ?? 0) <= 0) { f.mem.ironCd = R(7, 9); AI.startAttack(f, w, { k: 'cone', r: 4.0, half: 0.75 }, 1.2, 12, k.yawTo, { atk: 'iron', act: { name: 'kick', imp: 0.7 } }); return 'busy'; }
    // the charge: from 5 m out, a lane past her (lure him into a wall)
    if (d > 4.8 && d < 11 && (f.mem.ramCd ?? 0) <= 0) { f.mem.ramCd = R(5, 7); AI.startAttack(f, w, { k: 'rect', len: Math.min(12, d + 3), w: YAN.ramW }, 1.0, 18, k.yawTo, { atk: 'ram', act: { name: 'ram', imp: 0.9 } }); return 'busy'; }
    if (d < 3.4) { AI.startAttack(f, w, { k: 'cone', r: YAN.sweepR, half: YAN.sweepHalf }, 0.9, 16, k.yawTo, { atk: 'sweep', act: { name: 'axeSweep', imp: 0.62, data: { dist: 0.4 } } }); f.cd = p2 ? 0.2 : 0.5; return 'busy'; }
    if (d < 5.6 && Math.random() < k.dt * 1.8) { AI.startAttack(f, w, { k: 'rect', len: YAN.chopLen, w: YAN.chopW }, 1.0, 20, k.yawTo, { atk: 'chop', act: { name: 'axeChop', imp: 0.55 } }); f.cd = p2 ? 0.25 : 0.5; return 'busy'; }
    return { want: k.dir.clone().addScaledVector(k.side, 0.2), sp: p2 ? 1.2 : 1 };
  },
  tick(f, w, dt) {
    for (const key of ['throwCd', 'ironCd', 'ramCd']) f.mem[key] = (f.mem[key] ?? 0) - dt;
    // act-138 Hades-2 Boss Impervious Phase Gates (60% 6.2s Furnace Rampage flee; 30% Flying Bear add-clear shield)
    if (f.mem.barrier > 0) {
      bossBarrierFx(f, dt, 0xff7a2a);
      f.mem.barPulseT = (f.mem.barPulseT ?? 0.6) - dt;
      f.mem.barMaxT = (f.mem.barMaxT ?? 24) - dt;
      if (f.mem.barrier === 1) {
        f.mem.fleeT = Math.max(0, (f.mem.fleeT ?? 0) - dt);
        f.mem.barrierLabel = '无敌 · 躲避狂飙冲阵';
        if (f.mem.barPulseT <= 0 && w.heroAlive) {
          f.mem.barPulseT = 1.85;
          const toH = w.heroPos.clone().sub(f.pos).setY(0), yaw = Math.atan2(toH.x, toH.z);
          f.yaw = yaw;
          w.arrows.push(new Shockwave(f.pos.clone(), Math.round(14 * TUNE.enemyDmg), 1.0, 12.0, 1.45));
          w.arrows.push(new MoltenPool(f.pos.clone(), yaw, 4.6, 0.88, Math.round(8 * TUNE.enemyDmg), 6.5, f));
          f.vel.copy(fwd(yaw)).multiplyScalar(11);
          cue('foeCry', 1, 2); cue('fire', 0.9); shake(0.3 * TUNE.shake);
        }
        if (f.mem.fleeT <= 0) {
          shatterBossBarrier(f, w, 0xff8a30, '呼……老子的甲都烧熔了！');
          f.mem.ramCd = 1.8; f.mem.ironCd = 2.5; f.mem.throwCd = 3.5;
        }
      } else {
        f.mem.barrierLabel = '无敌 · 清飞熊亲卫';
        f.vel.multiplyScalar(Math.exp(-dt * 8));
        if (f.mem.barPulseT <= 0 && w.heroAlive) {
          f.mem.barPulseT = 2.8;
          const toH = w.heroPos.clone().sub(f.pos).setY(0), yaw = Math.atan2(toH.x, toH.z);
          f.yaw = yaw;
          w.arrows.push(new Shockwave(f.pos.clone(), Math.round(13 * TUNE.enemyDmg), 1.0, 11.5, 1.5));
          if (!f.mem.axeOut) { f.mem.axeOut = true; showAxe(f, false); w.arrows.push(new FlyingAxe(f, yaw, 10, f.dmg)); cue('whoosh', 1); }
          cue('fire', 0.7);
        }
        if (liveBossAdds(f, w) === 0 || f.mem.barMaxT <= 0) {
          shatterBossBarrier(f, w, 0xff8a30, '废柴！全死绝了！');
        }
      }
      return;
    }
    // Gate 1 at 60% HP: tears off red-hot armor -> 6.2s Impervious Furnace Rampage!
    if (f.phase === 1 && f.hp <= f.maxHp * 0.60) {
      dropTeles(f); f.attacking = false; f.lunge = null; f.phase = 2; f.inv = 99; f.mem.axeOut = false;
      f.mem.barrier = 1; f.mem.fleeT = 6.2; f.mem.barPulseT = 0.7; f.mem.barrierLabel = '无敌 · 躲避狂飙冲阵';
      AI.setSt(f, 'roar', 99); f.a.play(new Action('rip', 1.6, 0.45)); cue('roar', 1); shake(0.45 * TUNE.shake);
      after(0.6, () => { if (f.st !== 'dead') { throwArmour(f); fxShock(f.pos.clone().setY(0.08), 0xff8a40, 3.2, { life: 0.5 }); fxSparks(f.a.chest(), 0xffb060, 30, 7); cue('boom', 0.6); } });
      w.say?.(f, '烫煞老子！炉火狂飙，给老子滚开！');
      f.d = { ...f.d, poise: Math.max(100, Math.round(f.d.poise * 0.8)) }; f.poise = f.d.poise;
      f.summonT = 8;
      return;
    }
    // Gate 2 at 30% HP: Impervious Furnace Shield + Flying Bear squad clear!
    if (f.phase === 2 && !f.mem.gate2 && f.hp <= f.maxHp * 0.30) {
      f.mem.gate2 = true; dropTeles(f); f.attacking = false; f.lunge = null; f.inv = 99;
      f.mem.barrier = 2; f.mem.barPulseT = 1.6; f.mem.barMaxT = 24; f.mem.barrierLabel = '无敌 · 清飞熊亲卫';
      AI.setSt(f, 'roar', 99); f.a.roar(); cue('roar', 1); shake(0.45 * TUNE.shake);
      w.say?.(f, '飞熊合围！看你先死还是先破阵！');
      (['ly_shield', 'ly_torch', 'ly_xbow'] as const).forEach((kd, i) => {
        const a = (i / 3) * Math.PI * 2 + 0.4, p = V3(f.pos.x + Math.cos(a) * 5.0, 0, f.pos.z + Math.sin(a) * 4.5);
        w.clamp(p, 0.6); const m = spawnFoe(kd, p, w.heroPos.clone()); m.cd = R(0.6, 1.2); w.foes.push(m);
        fxSmoke(p.clone().add(V3(0, 0.3, 0)), 0x5a524c, 8, { r: 0.6, spd: 1.2, up: 0.6, s: 0.4, life: 0.7 });
      });
      cue('summon', 0.75);
      return;
    }
    if (f.phase > 1 && f.st !== 'dead') {
      f.auraT -= dt; if (f.auraT <= 0) { f.auraT = 0.1; fxEmbers(f.pos.clone().setY(0.5), 0xff8a3a, 2, { r: 0.6, up: 1.6, life: 0.7 }); }
      f.summonT -= dt;
      if (f.summonT <= 0 && w.heroAlive && f.st !== 'roar') {
        f.summonT = 13;
        const n = w.foes.filter(o => o.st !== 'dead' && o !== f).length;
        const kinds = n < 3 ? ['ly_xbow', 'ly_torch'] : ['ly_looter'];
        kinds.forEach((kd, i) => {
          if (w.spawnReinforce) {
            w.spawnReinforce(kd, i);
          } else {
            const s = Math.random() < 0.5 ? -1 : 1, p = V3(s * 30, 0, R(-6, 2)); w.clamp(p, 0.5);
            const m = spawnFoe(kd, p, w.heroPos.clone()); m.cd = R(0.6, 1.4); w.foes.push(m);
            fxSmoke(p.clone().add(V3(0, 0.3, 0)), 0x5a524c, 8, { r: 0.6, spd: 1.2, up: 0.6, s: 0.4, life: 0.7 });
          }
        });
        cue('summon', 0.6);
      }
    }
    // stuck in the floor (破势 caught the chop) / dazed (the charge into a wall): the timers
    if ((f.mem.stuckT ?? 0) > 0) f.mem.stuckT -= dt;
  },
  windup(f, _w, _dt, p, yawTo) {
    const lane = f.atk === 'ram' || f.atk === 'axeThrow';
    if (p < (lane ? 0.55 : 0.32)) { f.teleYaw = yawTo; f.yaw += (yawTo - f.yaw) * 0.25; if (lane) f.yaw = yawTo; }
    return true;
  },
  low: () => false,
  strike(f, w) {
    const s = f.shape!;
    if (f.atk === 'ram') {
      f.lunge = fwd(f.teleYaw).multiplyScalar((s as { len: number }).len / 0.55); f.yaw = f.teleYaw; f.mem.rammed = false;
      AI.setSt(f, 'strike', 0.55);
      // The wind-up clip only lasts through the first stride; keep the axe braced for the whole run.
      f.a.play(new Action('ramRun', f.dur + 0.28));
      cue('foeCry', 1, 2); cue('dash', 0.8); return true;
    }
    if (f.atk === 'axeThrow') { f.mem.axeOut = true; showAxe(f, false); w.arrows.push(new FlyingAxe(f, f.teleYaw, 9, f.dmg)); cue('whoosh', 1); AI.setSt(f, 'strike', 0.3); return true; }
    if (f.atk === 'iron') {
      areaHit(f, w); cue('foeHeavy', 1); cue('fire', 0.9);
      w.arrows.push(new MoltenPool(f.pos.clone(), f.teleYaw, 4.8, 0.92, Math.round(8 * TUNE.enemyDmg), 7.0, f));
      fxSmoke(f.pos.clone().add(fwd(f.teleYaw).multiplyScalar(1.8)).setY(0.4), 0x4a3a30, 10, { r: 1.2, spd: 1.6, up: 0.8, s: 0.5, life: 0.9 });
      AI.setSt(f, 'strike', 0.3); return true;
    }
    // the sweep and the chop: the area under the warning
    areaHit(f, w); cue('foeHeavy', 1);
    if (f.atk === 'chop') {
      const c = f.pos.clone().add(fwd(f.teleYaw).multiplyScalar(YAN.chopLen * 0.75)).setY(0.05);
      fxSmoke(c, 0x7a6a5a, 10, { r: 1.0, spd: 2, up: 0.6, s: 0.5, life: 0.8 }); fxSparks(c.clone().setY(0.3), 0xffc080, 14, 5); shake(0.25 * TUNE.shake);
      AI.setSt(f, 'strike', 0.2); f.mem.chopStuck = 0.9; return true;
    }
    AI.setSt(f, 'strike', 0.2); return true;
  },
  striking(f, w) {
    if (f.atk === 'ram' && f.lunge) {
      // contact: knocked back and down (her blood), once
      const dd = f.pos.distanceTo(w.heroPos);
      if (!f.hitHero && w.heroAlive && dd < f.d.r + w.heroR + 0.2) { f.hitHero = true; if (w.heroDodge) w.dodged(f.pos.clone()); else w.hurtHero(f.dmg, f.pos.clone(), f); }
      else if (!f.hitHero && w.heroAlive && w.heroDodge && dd < f.d.r + w.heroR + 0.65) { f.hitHero = true; w.dodged(f.pos.clone()); }
    }
    if (f.t < f.dur) return;
    f.lunge = null;
    if (f.atk === 'chop') { recover(f, f.mem.chopStuck ?? 0.9); f.a.play(new Action('axeStuck', f.mem.chopStuck ?? 0.9, 0.5)); return; }
    recover(f, f.atk === 'sweep' ? (f.phase > 1 ? 0.5 : 0.8) : f.atk === 'ram' ? 0.6 : 0.5);
  },
  // the charge into a wall / cover / a pillar: dazed 2.2 s — the best opening of the fight
  bumped(f, _w, dx, dz) {
    if (f.atk !== 'ram' || !f.lunge || f.mem.rammed || Math.hypot(dx, dz) < 0.02) return;
    f.mem.rammed = true; f.lunge = null; f.vel.set(0, 0, 0); f.attacking = false; dropTeles(f);
    AI.setSt(f, 'stagger', 2.2); f.a.play(new Action('dazed', 2.2, 0.3)); f.poise = Math.max(1, Math.round(f.poise * 0.5));
    shake(0.5 * TUNE.shake); cue('wallSlam', 1); cue('foePain', 1, 2);
    fxSmoke(f.pos.clone().setY(0.6), 0x8a7a6a, 14, { r: 1.0, spd: 2, up: 1, s: 0.55, life: 0.9 });
    for (let i = 0; i < 3; i++) fxRing(f.a.head().add(V3(0, 0.3 + i * 0.12, 0)), 0xfff0b0, 0.4, { life: 0.5 } as never);
  },
  // act-138 Phase 1 灼热重甲: frontal light/dart attacks deal only 45% dmg & zero poise — flank behind, lure ram into wall, or parry chop!
  guard(f, dmg, from, kind) {
    f.mem.armoredHit = 0;
    if (f.phase !== 1 || f.st === 'stagger' || f.brokenT > 0 || (f.mem.stuckT ?? 0) > 0) return undefined;
    if (kind === 'parry' || kind === 'clash' || kind === 'plunge' || kind === 'rel' || kind === 'ult' || kind === 'ultTick' || kind === 'school' || kind === 'k5') return undefined;
    if (angleTo(f, from) > 1.15) return undefined;
    f.mem.armoredHit = 1;
    fxSparks(f.a.chest(), 0xffd080, 8, 4); cue('parry', 0.45);
    return Math.max(1, Math.round(dmg * 0.45));
  },
  // 破势 caught the chop: the axe bites the floor and stays there 1.5 s, he bent over it
  interrupted(f) { if (f.mem.intFrom === 'windup' && f.atk === 'chop') { f.mem.stuckT = 1.5; AI.setSt(f, 'stagger', 1.5); f.a.play(new Action('axeStuck', 1.5, 0.5)); cue('guardBreak', 1); } },
  recover: f => (f.atk === 'sweep' ? 0.8 : 0.6),
};

Object.assign(ROLE_AI, { ly_halberd: halberd, ly_rider: rider, ly_shield: shield, ly_xbow: xbow, ly_torch: torch, ly_looter: looter, ly_boss: yanhu });
void EDEFS;
