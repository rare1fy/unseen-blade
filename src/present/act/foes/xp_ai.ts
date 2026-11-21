// 第三关 · 下邳寒沼的敌人（11-18）：EDEFS + 每种自己的打法（foes/roles.ts 的 RoleAI，enemy.ts 的状态机调用）。
// 模型在 foes/xp_models.ts（细格子 3.5 厘米，专用动作在 xp_poses.ts）。设计和「怎么打」见 docs/DESIGN.md「第二关、第三关的敌人和头目」。
//   覆面影刃（死士）xp_assassin  隐身绕到你身后（只剩脚下一圈圈声纹），现身背刺（短扇形）；挨一刀现形 3 秒；破势接住背刺 → 打回原形。
//   寒针幽卒 xp_needle          远处吹针（细线，针快），中了寒毒：脚步慢四成 2 秒；2 秒内再中一针冻住 0.6 秒；怕近身，一靠近就跑。
//   凝霜毒吏 xp_frost           保持 6～8 米，在你脚下和周围放 2～3 个圈，落下后那里结冰霜 3 秒（站上去脚步慢四成）。精英：一串圈追着你走。
//   沉江恶鬼（水鬼）xp_diver     只在积水里潜行（只露一圈水纹），从你脚下冒出来往上刺（圆，能跳过）；冒出来 1 秒才潜回去；
//                              引到没水的地方他就潜不下去，只能走着打。
//   枷铁狱吏 xp_chain           抡链锤：一圈圆环（内圈 1.2 米安全，外圈 3.4 米挨打），抡完晕头 1 秒。精英：再往前砸一锤。
//   冻骨溃兵 xp_conscript       成群、弱，短戳，算半个出手的人。
//   头目 截指鬼医 · 封鸩 xp_boss：银针五针扇 / 寒针地 / 截指刀（贴脸才用，快；破势接住 → 踉跄 1.6 秒）；挨三刀或被贴身 2 秒就雾遁
//                              （现身处先冒白雾）；半血饮毒：身上结霜，银针七针，加寒毒爆（中间空心的大圆环）、召死士、走过的地方结霜。
import * as THREE from 'three';
import { V3, R, scene } from '../../engine/world';
import { Action } from '../../actors/rig';
import { cue } from '../../../audio/cues';
import { shake, clock, after } from '../../engine/clock';
import { fxSparks, fxSmoke, fxRing, fxGlow, trailSeg } from '../../fx/fx';
import { fxShock } from '../../fx/skillFx';
import { TUNE } from '../tune';
import { PLAY } from '../../scenes/props';
import { Tele, inside } from '../tele';
import { addFoes, AI, Arrow, spawnFoe, LOW_CLEAR, dropTeles, type Foe, type FoeWorld } from '../enemy';
import { ROLE_AI, type RoleAI, type ThinkCtx } from './roles';
import { fade, fadeTo } from './fade';

// ------------------------------------------------------------------ the roster (names: agy)
/** 吕布军败兵开打时喊的（agy） */
const BARK_XP = ['泡在冷水里，都别活！', '温侯已死，拉你陪葬！', '水底下……有手抓你！', '尝尝这口寒毒针！', '城都淹了，谁怕死！', '截了你的大拇指！', '白门楼前无生路！', '一起烂在这臭泥里！', '淹死也是死，拼了！', '毒发了，跪下吧！'];
addFoes({
  xp_assassin: { model: 'xp_assassin', hp: 34, r: 0.4, speed: 3.6, mass: 0.8, poise: 0, gold: 5, name: '覆面影刃', role: 'xp_assassin', elite: 'xp_assassin_e' },
  xp_needle: { model: 'xp_needle', hp: 26, r: 0.42, speed: 2.4, mass: 0.8, poise: 0, gold: 4, name: '寒针幽卒', role: 'xp_needle', elite: 'xp_needle_e', barks: BARK_XP },
  xp_frost: { model: 'xp_frost', hp: 32, r: 0.44, speed: 2.4, mass: 0.9, poise: 0, gold: 5, name: '凝霜毒吏', role: 'xp_frost', elite: 'xp_frost_e', barks: BARK_XP },
  xp_diver: { model: 'xp_diver', hp: 40, r: 0.44, speed: 3.0, mass: 1.0, poise: 0, gold: 5, name: '沉江恶鬼', role: 'xp_diver', elite: 'xp_diver_e' },
  xp_chain: { model: 'xp_chain', hp: 120, r: 0.7, speed: 1.9, mass: 2.6, poise: 36, gold: 8, name: '枷铁狱吏', role: 'xp_chain', elite: 'xp_chain_e', barks: BARK_XP },
  xp_conscript: { model: 'xp_conscript', hp: 22, r: 0.36, speed: 3.4, mass: 0.6, poise: 0, gold: 2, name: '冻骨溃兵', role: 'xp_conscript', alt: ['xp_conscript_b'], weight: 0.5, barks: BARK_XP },
  xp_boss: { model: 'xp_boss', hp: 480, r: 0.55, speed: 2.7, mass: 1.8, poise: 44, gold: 50, name: '截指鬼医 · 封寒', role: 'xp_boss', boss: true, tag: '银针刺骨，截指入药', intro: '脉相浮而乱，该截下拇指了。' },
});

// ------------------------------------------------------------------ shared bits
const fwd = (yaw: number) => V3(Math.sin(yaw), 0, Math.cos(yaw));
const away = (k: ThinkCtx, m = 1) => k.dir.clone().multiplyScalar(-m);
const recover = (f: Foe, s: number) => { f.lunge = null; AI.calm(TUNE.atkCalm); AI.setSt(f, 'recover', s); };
function areaHit(f: Foe, w: FoeWorld, low = false) {
  const s = f.shape; if (!s || !w.heroAlive) return false;
  if (inside(s, f.telePos.x, f.telePos.z, f.teleYaw, w.heroPos.x, w.heroPos.z, w.heroR)) { if (low && w.heroY >= LOW_CLEAR) w.dodged(f.pos.clone()); else { w.hurtHero(f.dmg, f.pos.clone(), f); return true; } }
  else if (w.heroDodge && inside(s, f.telePos.x, f.telePos.z, f.teleYaw, w.heroPos.x, w.heroPos.z, w.heroR + 1.1)) w.dodged(f.pos.clone());
  return false;
}
/** a free spot on the floor at distance d0..d1 from p (the walls kept off) */
function spotNear(p: THREE.Vector3, d0: number, d1: number, w: FoeWorld) {
  for (let t = 0; t < 20; t++) {
    const a = Math.random() * Math.PI * 2, d = R(d0, d1), q = V3(p.x + Math.sin(a) * d, 0, p.z + Math.cos(a) * d);
    if (q.x > PLAY.x0 + 1.5 && q.x < PLAY.x1 - 1.5 && q.z > PLAY.z0 + 1.5 && q.z < PLAY.z1 - 2) return q;
  }
  const q = p.clone().setY(0); w.clamp(q, 0.6); return q;
}

// ------------------------------------------------------------------ 寒毒: her steps slowed; two in a row freeze her
/** the last needle that chilled her (s, game time): a second within CHILL_T freezes */
let chilledAt = -9;
const CHILL_T = 2, CHILL_K = 0.6, FREEZE_T = 0.6;
function chillHero(w: FoeWorld) {
  if (clock.time - chilledAt < CHILL_T) { w.freeze?.(FREEZE_T); chilledAt = -9; fxRing(w.heroPos.clone().setY(0.1), 0xdff4ff, 1.0, { life: 0.5 } as never); cue('parry', 0.6); }
  else { chilledAt = clock.time; w.chill?.(CHILL_T, CHILL_K); }
}
/** a frost needle: fast, thin; it can be cut out of the air (an Arrow) and chills what it hits */
class Needle extends Arrow {
  constructor(p: THREE.Vector3, yaw: number, dmg: number) {
    super(p, yaw, dmg, 20, true);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.42), new THREE.MeshBasicMaterial({ color: 0xe8f6ff })); this.body.add(m);
  }
  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    if (this.friendly) { super.update(dt, w); return; }
    const p0 = this.p.clone(); this.p.addScaledVector(this.v, dt); this.g.position.copy(this.p); this.life -= dt;
    trailSeg(p0, this.p.clone(), 0xbfe4ff, 0.05, { life: 0.12, bright: 2, spark: 0 });
    if (w.heroAlive && !this.grazed && w.heroDodge && Math.hypot(this.p.x - w.heroPos.x, this.p.z - w.heroPos.z) < w.heroR + 0.9) { this.grazed = true; w.dodged(this.p.clone()); }
    else if (w.heroAlive && !this.grazed && w.heroY < 1.6 && Math.hypot(this.p.x - w.heroPos.x, this.p.z - w.heroPos.z) < w.heroR + 0.15) { w.hurtHero(this.dmg, this.p.clone().addScaledVector(this.v, -0.1)); chillHero(w); this.kill(); return; }
    const q = this.p.clone(); w.clamp(q, 0); if (q.distanceTo(this.p) > 0.3 || this.life <= 0) { fxSparks(this.p, 0xdff0ff, 4, 2); this.kill(); }
  }
}
/** frost on the floor: a pale patch for `dur` s; standing in it slows her steps (friendly: the blade code leaves it be) */
class FrostPatch extends Arrow {
  private t = 0; private disc: THREE.Mesh;
  constructor(at: THREE.Vector3, private r: number, private dur: number) {
    super(V3(at.x, 0.04, at.z), 0, 0, 0, true); this.friendly = true; this.life = 99;
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(r, 8, Math.PI / 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdcecf8, transparent: true, opacity: 0.5, depthWrite: false }));
    this.disc.renderOrder = 2; this.g.add(this.disc);
  }
  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    this.t += dt; (this.disc.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.min(1, (this.dur - this.t) / 0.5, this.t / 0.15);
    if (Math.random() < dt * 6) fxSparks(V3(this.p.x + R(-this.r, this.r) * 0.7, 0.1, this.p.z + R(-this.r, this.r) * 0.7), 0xf0f8ff, 1, 0.6, { life: 0.4 });
    if (w.heroAlive && w.heroY < 0.2 && Math.hypot(w.heroPos.x - this.p.x, w.heroPos.z - this.p.z) < this.r + w.heroR * 0.4) w.chill?.(0.25, CHILL_K);
    if (this.t >= this.dur) this.kill();
  }
}
/** a frost mark: a circle that fills (after a delay), then the frost comes down — a hit inside it, and a patch left behind */
class FrostMark extends Arrow {
  private tele: Tele | null = null; private t = 0; private fadeT = -1;
  constructor(at: THREE.Vector3, dmg: number, private delay: number, private fill: number, private r = 1.2, private patch = 3) {
    super(V3(at.x, 0.05, at.z), 0, dmg, 0, true); this.friendly = true; this.life = 99;
  }
  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    this.t += dt;
    if (this.fadeT >= 0) { this.fadeT -= dt; this.tele?.update(dt); if (this.fadeT < 0) this.kill(); return; }
    if (this.t < this.delay) return;
    if (!this.tele) this.tele = new Tele({ k: 'circle', r: this.r, ahead: 0 });
    const k = (this.t - this.delay) / this.fill; this.tele.set(this.p.x, this.p.z, 0, k, (1 - k) * this.fill);
    if (k >= 1) {
      const g = V3(this.p.x, 0.1, this.p.z);
      fxShock(g, 0xdff4ff, this.r + 0.2, { life: 0.35 }); fxSparks(g.clone().setY(0.4), 0xf0f8ff, 14, 4); fxSmoke(g.clone().setY(0.3), 0xe6eef4, 5, { r: this.r * 0.6, spd: 0.8, up: 0.4, s: 0.4, life: 0.8 }); cue('parry', 0.35);
      const d = Math.hypot(g.x - w.heroPos.x, g.z - w.heroPos.z);
      if (w.heroAlive && d <= this.r + w.heroR) { if (w.heroDodge) w.dodged(g); else w.hurtHero(this.dmg, g); }
      else if (w.heroAlive && w.heroDodge && d <= this.r + w.heroR + 0.9) w.dodged(g);
      if (this.patch > 0) w.arrows.push(new FrostPatch(g, this.r, this.patch));
      this.tele.flash(); this.fadeT = 0.25;
    }
  }
  kill() { this.tele?.dispose(); this.tele = null; super.kill(); }
}

// ------------------------------------------------------------------ 覆面影刃（死士）: unseen, round behind her, a stab in the back
const STALK_K = 0.1;
const assassin: RoleAI = {
  think(f, w, k) {
    const revealed = (f.mem.revealT ?? 0) > 0;
    // where to be: behind her (her back, 1.6 m), circling round to it on the far side
    const hy = w.heroYaw ?? 0, back = w.heroPos.clone().addScaledVector(fwd(hy), -1.6), toBack = back.clone().sub(f.pos).setY(0), behind = Math.abs(angleDiff(Math.atan2(f.pos.x - w.heroPos.x, f.pos.z - w.heroPos.z), hy + Math.PI)) < 1.2;
    f.mem.stalkT = (f.mem.stalkT ?? 0) + k.dt;
    if (k.can && k.dist < 2.1 && (behind || f.mem.stalkT > 6 || revealed)) {
      // out of the shadow: 0.35 s of him solid again before the blade comes
      f.mem.stalkT = 0; f.mem.revealT = Math.max(f.mem.revealT ?? 0, 0.9); f.combo = f.elite ? 1 : 0;
      AI.startAttack(f, w, { k: 'cone', r: 1.9, half: 0.9 }, 0.55, 14, k.yawTo, { atk: 'stab', act: { name: f.elite ? 'backstab2' : 'backstab', imp: 0.6, data: { dist: 0.6 } } });
      cue('swish', 0.5); return 'busy';
    }
    if (!revealed && f.a.act?.name !== 'stalk') f.a.play(new Action('stalk', 99, 1));
    // round her at a distance, then into her back
    const want = toBack.length() > 0.5 ? toBack.normalize() : k.side.clone();
    if (k.dist < 2.6 && !behind) want.addScaledVector(k.side, 1.2).addScaledVector(k.dir, -0.4);
    return { want, sp: revealed ? 0.9 : 1.0 };
  },
  tick(f, _w, dt) {
    f.mem.revealT = Math.max(0, (f.mem.revealT ?? 0) - dt);
    const seen = f.mem.revealT > 0 || f.st === 'windup' || f.st === 'strike' || f.st === 'stagger' || f.st === 'enter';
    fadeTo(f, seen ? 1 : STALK_K, dt, seen ? 12 : 3);
    // the sound of his steps: a faint ring at his feet every step while he is unseen (she hears him: 声纹)
    if (!seen && f.vel.lengthSq() > 0.5 && (f.mem.stepT = (f.mem.stepT ?? 0) - dt) <= 0) { f.mem.stepT = 0.42; fxRing(f.pos.clone().setY(0.06), 0xd8e8f4, 0.55, { life: 0.5 } as never); }
  },
  windup(f, _w, _dt, p, yawTo) { if (p < 0.4) { f.teleYaw = yawTo; f.yaw = yawTo; } return true; },
  strike(f, w) { areaHit(f, w); cue('foeSwing', 0.7); AI.setSt(f, 'strike', 0.15); return true; },
  striking(f, w) {
    if (f.t < f.dur) return;
    if (f.combo > 0 && w.heroAlive) { f.combo--; AI.startAttack(f, w, { k: 'cone', r: 1.9, half: 0.9 }, 0.3, 12, Math.atan2(w.heroPos.x - f.pos.x, w.heroPos.z - f.pos.z), { atk: 'stab', act: { name: 'backstab', imp: 0.5, data: { dist: 0.4 } } }); return; }
    recover(f, 0.6); f.mem.revealT = Math.max(f.mem.revealT ?? 0, 0.8);
  },
  // a cut that finds him brings him out of the shadow for 3 s
  guard(f) { f.mem.revealT = 3; return undefined; },
  // 破势 caught the stab: back in the open, 4 s
  interrupted(f) { if (f.mem.intFrom === 'windup') f.mem.revealT = 4; },
  recover: () => 0.6,
};
const angleDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// ------------------------------------------------------------------ 寒针幽卒: a needle from afar; afraid of her near
const needle: RoleAI = {
  think(f, w, k) {
    const d = k.dist;
    if (d < 3.6) { if (f.a.act?.name !== 'flee') f.a.play(new Action('flee', 0.8, 1)); return { want: away(k, 1).addScaledVector(k.side, 0.3), sp: 0.85 }; }
    if (k.can && d > 4 && d < 12) {
      const len = Math.min(13, d + 3), extra = f.elite ? [{ s: { k: 'line' as const, len }, dy: 0.18 }, { s: { k: 'line' as const, len }, dy: -0.18 }] : [];
      AI.startAttack(f, w, { k: 'line', len }, 0.8, 4, k.yawTo, { atk: 'blow', extra, act: { name: 'blow', imp: 0.85 } }); f.cd = R(1.2, 1.8); return 'busy';
    }
    if (d > 9) return { want: k.dir.clone(), aim: true };
    return { want: k.side.clone().multiplyScalar(0.6), aim: true };
  },
  windup(f, _w, _dt, p, yawTo) { if (p < 0.75) { f.teleYaw = yawTo; f.yaw = yawTo; } return true; },
  strike(f, w) {
    for (const dy of [0, ...f.extra.map(e => e.dy)]) w.arrows.push(new Needle(f.pos.clone().add(V3(0, 1.3, 0)), f.teleYaw + dy, f.dmg));
    cue('arrow', 0.5); AI.setSt(f, 'strike', 0.15); return true;
  },
  recover: () => 0.5,
};

// ------------------------------------------------------------------ 凝霜毒吏: frost sown at her feet
const frost: RoleAI = {
  think(f, w, k) {
    const d = k.dist;
    if (k.can && d > 3 && d < 11) { AI.startAttack(f, w, { k: 'circle', r: 0.7, ahead: 0 }, 0.6, 8, k.yawTo, { atk: 'sow', act: { name: 'sow', imp: 0.7 } }); f.cd = R(3.0, 3.6); return 'busy'; }
    if (d < 5.5) return { want: away(k, 1).addScaledVector(k.side, 0.6), sp: 1.1, aim: true };
    if (d > 8.5) return { want: k.dir.clone(), aim: true };
    return { want: k.side.clone().multiplyScalar(0.55), aim: true };
  },
  windup(f, _w, _dt, p, yawTo) { if (p < 0.8) { f.teleYaw = yawTo; f.yaw = yawTo; } return true; },
  strike(f, w) {
    f.tele?.dispose(); f.tele = null;
    const h = w.heroPos.clone().setY(0), dmg = f.dmg;
    if (f.elite) {
      // a line of marks walking from him to her (they come down in turn)
      const dir = h.clone().sub(f.pos).setY(0), L = Math.max(2, dir.length()); dir.normalize();
      for (let i = 0; i < 5; i++) { const p = f.pos.clone().setY(0).addScaledVector(dir, 1.6 + i * Math.max(1.2, (L + 1 - 1.6) / 4)); w.clamp(p, 0.3); w.arrows.push(new FrostMark(p, dmg, 0.12 * i, 0.8, 1.1, 2.5)); }
    } else {
      // her feet, and two either side of where she is going
      w.arrows.push(new FrostMark(h, dmg, 0, 1.0));
      const a0 = Math.random() * Math.PI * 2;
      for (let i = 0; i < 2; i++) { const a = a0 + i * Math.PI, p = h.clone().add(V3(Math.sin(a) * 2.1, 0, Math.cos(a) * 2.1)); w.clamp(p, 0.3); w.arrows.push(new FrostMark(p, dmg, 0.15 * (i + 1), 1.0)); }
    }
    cue('magic', 0.5); fxSparks(f.a.weapon(), 0xdff4ff, 10, 3); AI.setSt(f, 'strike', 0.3); return true;
  },
  recover: () => 0.6,
};

// ------------------------------------------------------------------ 沉江恶鬼（水鬼）: under the water, up out of it at her feet
const DIVE_K = 0;
const diver: RoleAI = {
  think(f, w, k) {
    const wet = (x: number, z: number) => !!w.wet?.(x, z), under = !!f.mem.under;
    // out of the water (or no pools in this room): a slow, weak walker that pokes
    if (!under) {
      if (wet(f.pos.x, f.pos.z) && f.st === 'move' && (f.mem.upT ?? 0) <= 0) { dive(f); return 'busy'; }
      if (k.can && k.dist < 1.8) { AI.startAttack(f, w, { k: 'rect', len: 1.8, w: 0.6 }, 0.5, 8, k.yawTo, { atk: 'poke' }); f.cd = R(0.6, 1.0); return 'busy'; }
      // back toward the nearest water if there is some within 6 m (and he has not just climbed out to walk), else at her
      if ((f.mem.upT ?? 0) <= 0 && w.pools?.length) {
        let best: THREE.Vector3 | null = null, bd = 6;
        for (const r of w.pools) { const q = V3(Math.max(r.x0 + 0.4, Math.min(r.x1 - 0.4, f.pos.x)), 0, Math.max(r.z0 + 0.4, Math.min(r.z1 - 0.4, f.pos.z))), d = q.distanceTo(f.pos); if (d < bd) { bd = d; best = q; } }
        if (best) return { want: best.sub(f.pos).setY(0).normalize(), sp: 0.9 };
      }
      return { want: k.dir.clone().addScaledVector(k.side, 0.3), sp: 0.65 };
    }
    // under: swims toward her, but only through the water; up when she is over it and near
    if (k.can && k.dist < 2.6 && wet(w.heroPos.x, w.heroPos.z)) {
      // he goes under her: the circle at her feet (the ripples spin in it), up through it at the end
      f.mem.waitT = 0; f.pos.set(w.heroPos.x, 0, w.heroPos.z);
      AI.startAttack(f, w, { k: 'circle', r: 1.2, ahead: 0 }, 0.7, 13, k.yawTo, { atk: 'rise', act: { name: 'rise', imp: 0.75 }, at: w.heroPos.clone().setY(0) });
      return 'busy';
    }
    const step = k.dir.clone(); const nx = f.pos.x + step.x * 0.6, nz = f.pos.z + step.z * 0.6;
    // she keeps off the water: after a while he gives up waiting and climbs out at the edge, to walk (and he is weak out there)
    f.mem.waitT = (f.mem.waitT ?? 0) + k.dt;
    if (!wet(nx, nz)) { if (f.mem.waitT > 4) { f.mem.waitT = 0; f.mem.under = false; f.mem.upT = 6; f.a.play(new Action('rise', 0.7, 0.75)); fxSmoke(f.pos.clone().setY(0.2), 0x9ab4c4, 6, { r: 0.5, spd: 1.4, up: 0.8, s: 0.35, life: 0.6 }); return 'busy'; } f.vel.multiplyScalar(Math.exp(-k.dt * 6)); return 'busy'; }
    return { want: step, sp: 1.0 };
  },
  tick(f, w, dt) {
    f.mem.upT = Math.max(0, (f.mem.upT ?? 0) - dt);
    if (f.mem.under && f.st !== 'windup') { fadeTo(f, DIVE_K, dt, 8); if ((f.mem.ripT = (f.mem.ripT ?? 0) - dt) <= 0) { f.mem.ripT = 0.32; fxRing(f.pos.clone().setY(0.05), 0x9ab8c8, 0.45, { life: 0.55 } as never); } }
    else if (!f.mem.under) fadeTo(f, 1, dt, 10);
    // surfaced, its 1 s over, still in the water: under again
    if (!f.mem.under && f.st === 'move' && (f.mem.upT ?? 0) <= 0 && w.wet?.(f.pos.x, f.pos.z) && f.mem.rose) { f.mem.rose = false; dive(f); }
  },
  windup(f, _w, dt, p) {
    // the ripples spin in the circle under her; he is seen only as he breaks the surface
    if ((f.mem.ripT = (f.mem.ripT ?? 0) - dt) <= 0) { f.mem.ripT = 0.1; fxRing(f.telePos.clone().setY(0.05), 0xb8d4e0, 0.3 + p * 0.9, { life: 0.3 } as never); }
    if (f.atk === 'rise') fade(f, p > 0.75 ? 1 : 0);
    return true;
  },
  low: (f, s) => f.atk === 'rise' && s.k === 'circle',
  strike(f, w) {
    if (f.atk !== 'rise') return false;
    f.mem.under = false; f.mem.rose = true; f.mem.upT = 1.0; fade(f, 1);
    areaHit(f, w, true);
    fxSmoke(f.pos.clone().setY(0.2), 0x9ab4c4, 10, { r: 0.8, spd: 2, up: 1.2, s: 0.4, life: 0.7 }); fxSparks(f.pos.clone().setY(0.4), 0xd8ecf4, 16, 5); cue('hayBurst', 0.6); cue('foeCry', 0.8);
    AI.setSt(f, 'strike', 0.2); return true;
  },
  // under the water a blade finds nothing (her blows pass over him: −1 = not touched, no sparks either)
  guard(f) { return f.mem.under && f.st !== 'windup' ? -1 : undefined; },
  recover: f => (f.atk === 'rise' ? 1.0 : 0.6),
};
function dive(f: Foe) { f.mem.under = true; f.a.play(new Action('sink', 0.6, 0.5)); fxRing(f.pos.clone().setY(0.05), 0x9ab8c8, 0.9, { life: 0.5 } as never); cue('hayBurst', 0.3); }

// ------------------------------------------------------------------ 枷铁狱吏: the chain-hammer swung round him (the inside is safe)
const CHAIN = { r0: 1.2, r1: 3.4 };
const chain: RoleAI = {
  think(f, w, k) {
    if (k.can && k.dist < 3.2) { f.combo = f.elite ? 1 : 0; AI.startAttack(f, w, { k: 'ring', r0: CHAIN.r0, r1: CHAIN.r1 }, 1.0, 15, k.yawTo, { atk: 'whirl', act: { name: 'whirl', imp: 0.6, data: { turns: 2 } } }); return 'busy'; }
    return { want: k.dir.clone().addScaledVector(k.side, 0.15), sp: 1 };
  },
  windup(f) { f.telePos.copy(f.pos); return true; },
  strike(f, w) {
    if (f.atk === 'slamC') {
      // the hammer comes down: dust and sparks where it lands (the hammer hangs on the chain's last link, not at the fist)
      areaHit(f, w); cue('foeHeavy', 1); shake(0.2 * TUNE.shake);
      const hit = f.a.bones.chain5 ? f.a.bonePos('chain5', 0, 0, 0.2).setY(0.1) : f.pos.clone().add(V3(Math.sin(f.teleYaw) * 3.6, 0.1, Math.cos(f.teleYaw) * 3.6));
      fxSparks(hit.clone().setY(0.3), 0xffd8a0, 14, 5); fxSmoke(hit, 0x7a7a80, 8, { r: 0.6, spd: 1.8, up: 0.5, s: 0.4, life: 0.7 });
      AI.setSt(f, 'strike', 0.2); return true;
    }
    areaHit(f, w); cue('foeHeavy', 0.9); cue('whoosh', 0.9);
    fxRing(f.pos.clone().setY(0.6), 0xc8ccd4, CHAIN.r1, { life: 0.25 } as never);
    AI.setSt(f, 'strike', 0.3); return true;
  },
  striking(f, w) {
    if (f.t < f.dur) return;
    if (f.combo > 0 && w.heroAlive && f.atk === 'whirl') { f.combo--; AI.startAttack(f, w, { k: 'rect', len: 4.2, w: 1.2 }, 0.55, 16, Math.atan2(w.heroPos.x - f.pos.x, w.heroPos.z - f.pos.z), { atk: 'slamC', act: { name: 'slamChain', imp: 0.55 } }); return; }
    // dizzy from the swing: the moment to go in
    recover(f, 1.0); f.a.play(new Action('dizzy', 1.0, 0.5));
  },
  recover: () => 1.0,
};

// ------------------------------------------------------------------ 冻骨溃兵: outer-ring flanker (orbits when waiting for an attack slot)
const conscript: RoleAI = {
  think(f, w, k) {
    if (k.can && k.dist < 1.75) { AI.startAttack(f, w, { k: 'rect', len: 1.6, w: 0.6 }, 0.44, 5, k.yawTo, { atk: 'poke' }); f.cd = R(0.45, 0.95); return 'busy'; }
    if (!k.can) {
      if (k.dist > 3.2) return { want: k.dir.clone().addScaledVector(k.side, 0.8) };
      if (k.dist < 2.1) return { want: away(k, 0.45).addScaledVector(k.side, 0.95) };
      return { want: k.side.clone().multiplyScalar(0.95) };
    }
    if (k.dist > 1.35) return { want: k.dir.clone().addScaledVector(k.side, 0.35) };
    return { want: k.side.clone().addScaledVector(k.dir, -0.3) };
  },
  windup(f, _w, _dt, p, yawTo) { if (p < 0.35) { f.teleYaw = yawTo; f.yaw = yawTo; } return true; },
  recover: () => 0.45,
};

// ================================================================== 头目 · 截指鬼医 · 封鸩
const FENG = { mistWarn: 0.6, mistWarn2: 0.4, burstR0: 1.5, burstR1: 4.5 };
/** into the mist: gone (unhittable) for a beat, a white mist rising first where he will come out */
function vanish(f: Foe, w: FoeWorld) {
  const p2 = f.phase > 1, at = spotNear(w.heroPos, 6.5, 9.5, w), warn = p2 ? FENG.mistWarn2 : FENG.mistWarn;
  dropTeles(f); f.attacking = false; f.lunge = null; f.mem.mist = true; f.inv = warn + 0.5; f.mem.hits = 0; f.mem.closeT = 0;
  f.a.play(new Action('vanish', 0.5, 0.5)); AI.setSt(f, 'stagger', warn + 0.45);
  fxSmoke(f.pos.clone().setY(0.6), 0xe6eef4, 14, { r: 0.6, spd: 1.4, up: 0.8, s: 0.5, life: 0.8 }); cue('whoosh', 0.7);
  after(0.3, () => { if (f.st === 'dead') return; fade(f, 0); f.pos.copy(at); f.vel.set(0, 0, 0);
    // the mist where he will stand: rising for the warning's length (run there and he comes out onto the blade)
    const ring = new Tele({ k: 'circle', r: 0.9, ahead: 0 }), t0 = clock.time;
    const tick = () => { if (f.st === 'dead') { ring.dispose(); return; } const k = (clock.time - t0) / warn; ring.set(at.x, at.z, 0, k, Math.max(0, warn - (clock.time - t0))); ring.update(1 / 60); fxSmoke(at.clone().setY(0.2), 0xeef4f8, 1, { r: 0.5, spd: 0.6, up: 0.7, s: 0.35, life: 0.6 }); if (k < 1) after(1 / 30, tick); else { ring.flash(); after(0.2, () => ring.dispose()); appear(f, w); } };
    tick(); });
}
function appear(f: Foe, w: FoeWorld) {
  f.mem.mist = false; f.inv = 0; fade(f, 1); f.yaw = Math.atan2(w.heroPos.x - f.pos.x, w.heroPos.z - f.pos.z);
  f.a.play(new Action('appear', 0.5, 0.5)); fxRing(f.pos.clone().setY(0.06), 0xdff4ff, 1.2, { life: 0.4 } as never); cue('draw', 0.5);
  AI.setSt(f, 'move', 0); f.cd = 0.5;
}
const fengzhen: RoleAI = {
  think(f, w, k) {
    const d = k.dist, p2 = f.phase > 1;
    if (f.mem.mist) return 'busy';
    // close in on him for 2 s, or three cuts: into the mist
    if (d < 2.4) f.mem.closeT = (f.mem.closeT ?? 0) + k.dt; else f.mem.closeT = Math.max(0, (f.mem.closeT ?? 0) - k.dt);
    if ((f.mem.hits ?? 0) >= 3 || f.mem.closeT > 2 || f.mem.vanishNext) { f.mem.vanishNext = false; vanish(f, w); return 'busy'; }
    if (!k.can) return d < 4 ? { want: away(k, 1).addScaledVector(k.side, 0.5), sp: 1.0, aim: true } : { want: k.side.clone().multiplyScalar(0.6), aim: true };
    // up close: the quick cut (and then always away into the mist)
    if (d < 2.1) { AI.startAttack(f, w, { k: 'cone', r: 1.9, half: 0.8 }, 0.45, 16, k.yawTo, { atk: 'snip', act: { name: 'snip', imp: 0.6 } }); return 'busy'; }
    // the burst (second phase): when she is within it
    if (p2 && d < FENG.burstR1 && (f.mem.burstCd ?? 0) <= 0) { f.mem.burstCd = R(7, 9); AI.startAttack(f, w, { k: 'ring', r0: FENG.burstR0, r1: FENG.burstR1 }, 1.4, 18, k.yawTo, { atk: 'burst', act: { name: 'burst', imp: 0.85 } }); return 'busy'; }
    if (d > 3.2 && (f.mem.sowCd ?? 0) <= 0) { f.mem.sowCd = p2 ? R(4, 5) : R(5, 6.5); AI.startAttack(f, w, { k: 'circle', r: 0.7, ahead: 0 }, 0.9, 8, k.yawTo, { atk: 'sow', act: { name: 'sow', imp: 0.7 } }); return 'busy'; }
    if (d > 2.6 && d < 12) {
      const n = p2 ? 7 : 5, spread = p2 ? 0.16 : 0.2, len = Math.min(13, d + 3);
      const extra = Array.from({ length: n - 1 }, (_, i) => ({ s: { k: 'line' as const, len }, dy: (i < (n - 1) / 2 ? -1 : 1) * spread * (1 + Math.floor((i % ((n - 1) / 2))) ) }));
      AI.startAttack(f, w, { k: 'line', len }, 0.7, 5, k.yawTo, { atk: 'fan', extra, act: { name: 'needleFan', imp: 0.8 } }); f.cd = 0.4; return 'busy';
    }
    return { want: d < 6 ? away(k, 1).addScaledVector(k.side, 0.4) : k.side.clone().multiplyScalar(0.7), sp: 1.0, aim: true };
  },
  tick(f, w, dt) {
    for (const key of ['burstCd', 'sowCd']) f.mem[key] = (f.mem[key] ?? 0) - dt;
    if (!f.mem.init) { f.mem.init = true; const fr = f.a.bones.frost; if (fr) fr.visible = false; }
    // the turn at half life: 「饮下至寒，骨肉皆为毒。」 — he drinks the cold poison (stands still 1.6 s; 0.8 s of it unhittable), the
    // frost comes out on him; then seven needles, the burst, the 死士 called up every 14 s, frost where he walks
    if (f.phase === 1 && f.hp <= f.maxHp * 0.5 && !f.mem.mist) {
      dropTeles(f); f.attacking = false; f.lunge = null; f.phase = 2; f.inv = 0.8;
      AI.setSt(f, 'roar', 1.6); f.a.play(new Action('drink', 1.6, 0.5)); cue('roar', 0.7); w.say?.(f, '饮下至寒，骨肉皆为毒。');
      after(0.9, () => { if (f.st === 'dead') return; const fr = f.a.bones.frost; if (fr) fr.visible = true; fxShock(f.pos.clone().setY(0.08), 0xdff4ff, 3.0, { life: 0.5 }); fxSparks(f.a.chest(), 0xf0f8ff, 30, 6); shake(0.3 * TUNE.shake); });
      f.summonT = 3; f.mem.burstCd = 2;
    }
    if (f.phase > 1 && f.st !== 'dead') {
      // frost where he walks
      if (!f.mem.mist && f.vel.lengthSq() > 0.4 && (f.mem.trailT = (f.mem.trailT ?? 0) - dt) <= 0) { f.mem.trailT = 0.55; w.arrows.push(new FrostPatch(f.pos.clone(), 0.85, 3)); }
      f.summonT -= dt;
      if (f.summonT <= 0 && w.heroAlive && f.st !== 'roar') {
        f.summonT = 14;
        if (w.foes.filter(o => o.role === 'xp_assassin' && o.st !== 'dead').length < 3) for (let i = 0; i < 2; i++) {
          if (w.spawnReinforce) {
            w.spawnReinforce('xp_assassin', i);
          } else {
            const p = spotNear(w.heroPos, 5, 8, w), m = spawnFoe('xp_assassin', p, w.heroPos.clone()); m.cd = R(1.0, 2.0); w.foes.push(m);
            fxSmoke(p.clone().setY(0.3), 0x8a98a4, 8, { r: 0.6, spd: 1.2, up: 0.6, s: 0.4, life: 0.7 }); fxRing(p.clone().setY(0.05), 0x9ab8c8, 1.0, { life: 0.4 } as never);
          }
        }
        cue('summon', 0.5);
      }
    }
  },
  windup(f, _w, _dt, p, yawTo) { if (f.atk === 'burst') { f.telePos.copy(f.pos); return true; } if (p < (f.atk === 'snip' ? 0.3 : 0.7)) { f.teleYaw = yawTo; f.yaw = yawTo; } return true; },
  strike(f, w) {
    if (f.atk === 'fan') {
      for (const dy of [0, ...f.extra.map(e => e.dy)]) w.arrows.push(new Needle(f.pos.clone().add(V3(0, 1.3, 0)), f.teleYaw + dy, f.dmg));
      cue('arrow', 0.7); AI.setSt(f, 'strike', 0.2); return true;
    }
    if (f.atk === 'sow') {
      f.tele?.dispose(); f.tele = null; const h = w.heroPos.clone().setY(0), a0 = Math.random() * Math.PI * 2;
      w.arrows.push(new FrostMark(h, f.dmg, 0, 0.9));
      for (let i = 0; i < 2; i++) { const a = a0 + i * Math.PI, p = h.clone().add(V3(Math.sin(a) * 2.2, 0, Math.cos(a) * 2.2)); w.clamp(p, 0.3); w.arrows.push(new FrostMark(p, f.dmg, 0.15 * (i + 1), 0.9)); }
      cue('magic', 0.6); AI.setSt(f, 'strike', 0.3); return true;
    }
    if (f.atk === 'burst') {
      const hit = areaHit(f, w); if (hit) w.freeze?.(0.8);
      fxShock(f.pos.clone().setY(0.1), 0xdff4ff, FENG.burstR1, { life: 0.5 }); fxGlow(f.a.chest(), 0xdff4ff, 2.0, 0.3); fxSparks(f.a.chest(), 0xf0f8ff, 30, 8); cue('boom', 0.7); shake(0.3 * TUNE.shake);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, p = f.pos.clone().add(V3(Math.sin(a) * 3, 0, Math.cos(a) * 3)); w.arrows.push(new FrostPatch(p, 0.9, 2.5)); }
      AI.setSt(f, 'strike', 0.3); return true;
    }
    // the snip: then always away
    areaHit(f, w); cue('foeSwing', 0.9); AI.setSt(f, 'strike', 0.15); f.mem.vanishNext = true; return true;
  },
  striking(f) { if (f.t >= f.dur) recover(f, f.atk === 'burst' ? 0.7 : f.atk === 'snip' ? 0.2 : 0.4); },
  // the cuts that land count toward the mist; in the mist nothing finds him
  guard(f) { if (f.mem.mist) return -1; f.mem.hits = (f.mem.hits ?? 0) + 1; return undefined; },
  // 破势 caught the snip: he reels 1.6 s, then into the mist
  interrupted(f) { if (f.mem.intFrom === 'windup' && f.atk === 'snip') { AI.setSt(f, 'stagger', 1.6); f.mem.vanishNext = true; cue('guardBreak', 1); } },
  recover: f => (f.atk === 'burst' ? 0.7 : 0.4),
};

Object.assign(ROLE_AI, { xp_assassin: assassin, xp_needle: needle, xp_frost: frost, xp_diver: diver, xp_chain: chain, xp_conscript: conscript, xp_boss: fengzhen });
void scene;
