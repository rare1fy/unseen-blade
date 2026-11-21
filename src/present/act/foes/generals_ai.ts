// act-114 / 主角级招式与实战 AI 升级：三国四大名将战斗系统
//   - 友军名将（第一关赵云、第四关陆逊）：AllyGeneral 与刘白并肩斩杀当间敌人，拥有与主角同级的闪步残影（fxAfterimage）、
//     实时贴武器 3D 体素刀/枪光（slashArc）、多段连刺（七探蛇盘三连刺 / 惊鸿三连剑）、360° 旋扫与三段连环青炎焚江阵。
//   - 交锋名将（第二关吕布、第三关夏侯惇）：注册进 EDEFS + FOE_AI，拥有多段衔接连招（follow()：戟裂长空二连斩 / 狂澜二连斩）、
//     跃空裂地冲击波、360° 辕门旋风斩、闪步突刺残影与真实体素光束，全部保留地面预警与可「破势」弹反窗口。
import * as THREE from 'three';
import { V3, R, scene } from '../../engine/world';
import { after, shake } from '../../engine/clock';
import { Action } from '../../actors/rig';
import { BattleActor } from '../../bestiary/battle';
import { ROSTER } from '../../bestiary/models';
import { cue } from '../../../audio/cues';
import { fxRing, fxSparks, fxSmoke, fxEmbers } from '../../fx/fx';
import { fxAfterimage, fxShock } from '../../fx/skillFx';
import { addBlock } from '../../fx/blocks';
import { slashArc } from '../slashArc';
import { TUNE } from '../tune';
import {
  addFoes, FOE_AI, fx_, startAttack, canStrike, steerFoe, turnFoe, trimShadows,
  type Foe, type FoeWorld,
} from '../enemy';
import './generals_models';
import './generals_pose';

const dmgOf = (n: number) => Math.round(n * TUNE.enemyDmg);
const side = (dir: THREE.Vector3, s: number) => V3(dir.z, 0, -dir.x).multiplyScalar(s);

/** Pure 3D voxel burst along a spear/halberd/blade trajectory (100% voxel-cube aesthetic) */
function voxelBurst(from: THREE.Vector3, dir: THREE.Vector3, colA: number, colB: number, count: number, range: number, spread = 0.45) {
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count;
    const p = from.clone().addScaledVector(dir, 0.5 + u * range).add(V3((Math.random() - 0.5) * spread, 0.72 + Math.random() * 0.58, (Math.random() - 0.5) * spread));
    addBlock(p, {
      size: 0.08 + Math.random() * 0.075,
      v: dir.clone().multiplyScalar(2.6 + Math.random() * 2.2).add(V3((Math.random() - 0.5) * 1.3, 0.9 + Math.random() * 1.3, (Math.random() - 0.5) * 1.3)),
      col: i % 2 ? colA : colB, bright: 1.45, life: 0.30 + Math.random() * 0.16, shrink: 0.6, drag: 1.8, grav: 1.2,
    });
  }
}

// ------------------------------------------------------------------ 1. 交锋名将（吕布 / 夏侯惇）注册进 EDEFS + FOE_AI
addFoes({
  gen_lubu: {
    model: 'gen_lubu', hp: 620, r: 0.72, speed: 3.3, mass: 4.0, poise: 58, gold: 0,
    name: '温侯 · 吕布', role: 'ext', boss: true, tag: '人中吕布 · 戟裂长空',
  },
  gen_xiahoudun: {
    model: 'gen_xiahoudun', hp: 540, r: 0.65, speed: 3.05, mass: 3.4, poise: 50, gold: 0,
    name: '独眼猛将 · 夏侯惇', role: 'ext', boss: true, tag: '拔矢啖睛 · 暗处孤刃',
  },
});

FOE_AI.gen_lubu = {
  think(f, w, dt, dist, dir, yawTo) {
    if (!w.heroAlive) return;
    if (dist > 3.2) {
      steerFoe(f, dir.clone(), f.d.speed * 1.08, dt, yawTo);
    } else if (dist < 1.8) {
      steerFoe(f, dir.clone().multiplyScalar(-1), f.d.speed * 0.45, dt, yawTo, true);
    } else {
      steerFoe(f, side(dir, f.strafe), f.d.speed * 0.75, dt, yawTo, true);
    }
    if (!canStrike(f, w)) return;
    const x = fx_(f);
    x.combo = 0;
    if (dist < 3.4) {
      const r = Math.random();
      if (r < 0.56) {
        // 戟裂长空二连斩 (opens with wide crescent sweep -> chains into reverseSweep via follow!)
        x.combo = 1;
        startAttack(f, w, { k: 'cone', r: 4.0, half: 1.25 }, 0.60, dmgOf(17), yawTo, {
          atk: 'sweep', act: { name: 'attack', imp: 0.54, tail: 0.32, data: { atk: 'sweep' } },
        });
      } else {
        // 辕门旋风斩 (360° heroic halberd cyclone!)
        startAttack(f, w, { k: 'circle', r: 3.5, ahead: 0.2 }, 0.68, dmgOf(19), yawTo, {
          atk: 'whirl', act: { name: 'attack', imp: 0.56, tail: 0.38, data: { atk: 'whirl' } },
        });
      }
    } else if (dist < 6.8 && Math.random() < dt * 2.6) {
      if (Math.random() < 0.5) {
        // 鬼神跃空裂地砸 (soaring acrobatic sky-slam — jumpable low shockwave!)
        startAttack(f, w, { k: 'circle', r: 3.1, ahead: 1.6 }, 0.78, dmgOf(22), yawTo, {
          atk: 'slam', low: true,
          act: { name: 'attack', imp: 0.58, tail: 0.42, data: { atk: 'slam' } },
        });
      } else {
        // 霸王穿阵突 (crimson-gold afterimage lunge + straight halberd beam!)
        fxAfterimage(f.pos.clone(), 2.2, 0xdc3832, { life: 0.36, glow: 0.55 });
        startAttack(f, w, { k: 'rect', len: 6.2, w: 1.6 }, 0.62, dmgOf(18), yawTo, {
          atk: 'thrust',
          act: { name: 'attack', imp: 0.54, tail: 0.34, data: { atk: 'thrust' } },
        });
      }
    }
  },
  windup(f, _w, dt, _p, yawTo) { turnFoe(f, yawTo, dt, 4.8); },
  strike(f) {
    const atk = f.atk;
    const fwd = V3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
    const s = side(fwd, 1);
    if (atk === 'slam') {
      const land = f.pos.clone().addScaledVector(fwd, 1.6);
      fxShock(land, 0xf25232, 3.1, { life: 0.52 });
      fxSparks(land.clone().setY(0.35), 0xf8ce5c, 16, 6.5, { hot: true });
      voxelBurst(land, fwd, 0xf8ce5c, 0xdc2e34, 12, 2.0, 1.4);
      shake(0.16);
      cue('hitHeavy', 0.85);
    } else if (atk === 'thrust') {
      const b0 = f.pos.clone().addScaledVector(fwd, 5.8);
      slashArc.line({ a: f.pos.clone(), b: b0, width: 1.05, y: 1.15, palette: 'lubu', fade: 0.28 });
      voxelBurst(f.pos, fwd, 0xf8ce5c, 0xe83834, 10, 5.4, 0.4);
      cue('swingStab', 0.82);
    } else if (atk === 'whirl') {
      fxRing(f.pos.clone().setY(0.9), 0xf25232, 3.4, { life: 0.36, width: 0.24, bright: 1.6 } as never);
      fxSparks(f.pos.clone().setY(1.1), 0xf8ce5c, 14, 5.5);
      cue('swishHeavy', 0.85);
    } else {
      const at = f.pos.clone().addScaledVector(fwd, 2.2).setY(1.1);
      slashArc.clashCross(at, s, atk === 'reverseSweep' ? -0.35 : 0.35, 'lubu', 0.16, 1.15);
      fxSparks(at, 0xf8ce5c, 10, 4.8);
    }
    return false; // preserve full real hit detection & parry window!
  },
  follow(f, w, yawTo) {
    const x = fx_(f);
    if (f.atk === 'sweep' && x.combo === 1) {
      x.combo = 0;
      startAttack(f, w, { k: 'cone', r: 4.1, half: 1.3 }, 0.48, dmgOf(19), yawTo, {
        atk: 'reverseSweep', act: { name: 'attack', imp: 0.52, tail: 0.36, data: { atk: 'reverseSweep' } },
      });
      return true;
    }
    return false;
  },
  recover: () => 0.62,
};

FOE_AI.gen_xiahoudun = {
  think(f, w, dt, dist, dir, yawTo) {
    if (!w.heroAlive) return;
    if (dist > 2.7) {
      steerFoe(f, dir.clone(), f.d.speed * 1.04, dt, yawTo);
    } else if (dist < 1.5) {
      steerFoe(f, dir.clone().multiplyScalar(-1), f.d.speed * 0.4, dt, yawTo, true);
    } else {
      steerFoe(f, side(dir, f.strafe), f.d.speed * 0.78, dt, yawTo, true);
    }
    if (!canStrike(f, w)) return;
    const x = fx_(f);
    x.combo = 0;
    if (dist < 3.1) {
      if (Math.random() < 0.56) {
        // 狂澜二连斩 (heavy stepping horizontal slash -> chains into rising upSlash!)
        x.combo = 1;
        startAttack(f, w, { k: 'cone', r: 3.3, half: 1.1 }, 0.52, dmgOf(16), yawTo, {
          atk: 'slash', act: { name: 'attack', imp: 0.52, tail: 0.30, data: { atk: 'slash' } },
        });
      } else {
        // 拔矢断岳劈 (crushing overhead iron-mountain cleave!)
        startAttack(f, w, { k: 'rect', len: 4.1, w: 1.8 }, 0.66, dmgOf(22), yawTo, {
          atk: 'cleave',
          act: { name: 'attack', imp: 0.56, tail: 0.40, data: { atk: 'cleave' } },
        });
      }
    } else if (dist < 5.9 && Math.random() < dt * 2.4) {
      // 独眼孤刃突袭 (low predatory blood-iron dash slash with afterimage!)
      fxAfterimage(f.pos.clone(), 2.0, 0xa82228, { life: 0.36, glow: 0.5 });
      startAttack(f, w, { k: 'rect', len: 5.2, w: 1.6 }, 0.60, dmgOf(19), yawTo, {
        atk: 'dashCut',
        act: { name: 'attack', imp: 0.54, tail: 0.36, data: { atk: 'dashCut' } },
      });
    }
  },
  windup(f, _w, dt, _p, yawTo) { turnFoe(f, yawTo, dt, 5.4); },
  strike(f) {
    const atk = f.atk;
    const fwd = V3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
    const s = side(fwd, 1);
    if (atk === 'cleave') {
      const hitAt = f.pos.clone().addScaledVector(fwd, 2.0);
      fxShock(hitAt, 0xc82628, 2.4, { life: 0.46 });
      voxelBurst(hitAt, fwd, 0xd83238, 0x565c68, 12, 2.2, 0.9);
      shake(0.14);
      cue('hitHeavy', 0.84);
    } else if (atk === 'dashCut') {
      const b0 = f.pos.clone().addScaledVector(fwd, 4.8);
      slashArc.line({ a: f.pos.clone(), b: b0, width: 0.95, y: 1.05, palette: 'xiahoudun', fade: 0.26 });
      voxelBurst(f.pos, fwd, 0xd83238, 0xffd2b8, 10, 4.4, 0.45);
      cue('swishHeavy', 0.82);
    } else if (atk === 'upSlash') {
      const at = f.pos.clone().addScaledVector(fwd, 1.8).setY(1.2);
      slashArc.clashCross(at, s, 0.72, 'xiahoudun', 0.16, 1.05);
      fxSparks(at, 0xffb896, 12, 5.2);
    }
    return false;
  },
  follow(f, w, yawTo) {
    const x = fx_(f);
    if (f.atk === 'slash' && x.combo === 1) {
      x.combo = 0;
      startAttack(f, w, { k: 'cone', r: 3.4, half: 1.15 }, 0.46, dmgOf(18), yawTo, {
        atk: 'upSlash', act: { name: 'attack', imp: 0.50, tail: 0.34, data: { atk: 'upSlash' } },
      });
      return true;
    }
    return false;
  },
  recover: () => 0.58,
};

// ------------------------------------------------------------------ 2. 友军名将（赵云 / 陆逊）：主角级并肩作战控制器
export interface AllyHost {
  foes: Foe[];
  heroPos: THREE.Vector3;
  clamp(p: THREE.Vector3, r: number): void;
  hitFoe(f: Foe, dmg: number, from: THREE.Vector3, col: number): void;
  say(head: () => THREE.Vector3, line: string): void;
  /** Optional chokepoint defense anchor: hold this post, prioritize breaching foes, and suppress generic slogans */
  guard?: { x: number; z: number; maxDist: number; breachZ: number; silent?: boolean };
}

const ALLY_BARKS: Record<'zhaoyun' | 'luxun', string[]> = {
  zhaoyun: ['银枪破阵！', '七探蛇盘，休想近身！', '常山赵云在此！', '龙胆穿云！'],
  luxun: ['借风引火！', '青冥惊鸿，破阵！', '连环船已燃，退！', '火势已起，斩！'],
};

type AllyMove = 'thrust' | 'sweep' | 'flurry' | 'dragonDive' | 'fireWave';

export class AllyGeneral {
  readonly kind: 'zhaoyun' | 'luxun';
  readonly a: BattleActor;
  readonly pos: THREE.Vector3;
  private cd = 0.45;
  private atkT = 0;
  private atkDur = 0.56;
  private atkStep = 0;
  private atkMode: AllyMove = 'thrust';
  private moveIdx = 0;
  private barkCd = 3.0;
  active = true;

  constructor(kind: 'zhaoyun' | 'luxun', at: THREE.Vector3, yaw: number) {
    this.kind = kind;
    const def = ROSTER.find(d => d.id === 'gen_' + kind);
    if (!def) throw new Error('missing general model: ' + kind);
    this.a = new BattleActor(def);
    this.pos = at.clone().setY(0);
    this.a.place(this.pos, yaw); this.a.yaw = yaw;
    trimShadows(this.a.root, 4);
    scene.add(this.a.root);
    fxSmoke(this.pos.clone().setY(0.35), kind === 'zhaoyun' ? 0xd8e8ff : 0x90e0c8, 10, { r: 0.6, spd: 1.1, up: 0.7, s: 0.35, life: 0.55 });
  }

  /** idle & update during cutscenes/dialogues */
  idle(dt: number, face?: THREE.Vector3) {
    if (!this.active) return;
    if (face) {
      const dx = face.x - this.pos.x, dz = face.z - this.pos.z;
      if (dx * dx + dz * dz > 1e-4) this.a.yaw = Math.atan2(dx, dz);
    }
    this.a.setRunning(false);
    this.a.home.copy(this.pos);
    this.a.update(dt);
  }

  /** live combat update: fights with protagonist-grade combos, afterimages & 3D voxel weapon trails */
  update(dt: number, host: AllyHost) {
    if (!this.active) return;
    this.cd = Math.max(0, this.cd - dt);
    this.barkCd -= dt;
    const live = host.foes.filter(f => f.st !== 'dead' && f.st !== 'enter' && f.kind !== 'dummy' && !f.mem.hidden);

    // Active attack animation & multi-hit strike timing
    if (this.atkT > 0) {
      this.atkT -= dt;
      const elapsed = this.atkDur - Math.max(0, this.atkT);
      const frac = elapsed / this.atkDur;
      if (this.atkMode === 'flurry') {
        // 3 rapid staccato hits during flurry (at 28%, 52%, 76%)!
        const beats = [0.28, 0.52, 0.76];
        while (this.atkStep < beats.length && frac >= beats[this.atkStep]) {
          this.landStrike(host, live, this.atkStep);
          this.atkStep++;
        }
      } else if (this.atkStep === 0 && frac >= 0.48) {
        this.atkStep = 1;
        this.landStrike(host, live, 0);
      }
      this.a.setRunning(false);
      this.a.home.copy(this.pos);
      this.a.update(dt);
      return;
    }

    const g = host.guard;
    const poolFoes = g
      ? live.filter(f => f.pos.z <= g.breachZ + 1.5 || Math.hypot(f.pos.x - g.x, f.pos.z - g.z) <= g.maxDist)
      : live;

    if (!poolFoes.length) {
      // If guarding a chokepoint, hold the gap facing south toward incoming raiders; otherwise escort near hero
      const destX = g ? g.x : host.heroPos.x;
      const destZ = g ? g.z : host.heroPos.z;
      const stopR = g ? 0.65 : 2.8;
      const toDest = V3(destX - this.pos.x, 0, destZ - this.pos.z);
      const d = toDest.length();
      if (d > stopR) {
        toDest.normalize();
        const step = g ? Math.min(d, 4.4 * dt) : Math.min(d - 2.2, 3.6 * dt);
        this.pos.addScaledVector(toDest, step);
        host.clamp(this.pos, 0.5);
        this.a.yaw = Math.atan2(toDest.x, toDest.z);
        this.a.setRunning(true, g ? 4.4 : 3.6);
      } else {
        this.a.setRunning(false);
        if (g) this.a.yaw = 0; // face south toward the approaching raiders
      }
      this.a.home.copy(this.pos);
      this.a.update(dt);
      return;
    }

    // Pick highest-priority foe: when guarding a chokepoint, intercept anyone breaching north first!
    let target = poolFoes[0], best = Infinity;
    for (const f of poolFoes) {
      const score = g
        ? (f.pos.z <= g.breachZ ? -100 + f.pos.z : Math.hypot(f.pos.x - g.x, f.pos.z - g.z))
        : this.pos.distanceTo(f.pos);
      if (score < best) { best = score; target = f; }
    }
    const dir = target.pos.clone().sub(this.pos).setY(0);
    const dist = dir.length() || 1;
    dir.divideScalar(dist);
    this.a.yaw = Math.atan2(dir.x, dir.z);

    const isZhao = this.kind === 'zhaoyun';
    const reach = isZhao ? 3.1 : 3.4;
    if (dist > reach) {
      const spd = isZhao ? 4.8 : 4.1;
      this.pos.addScaledVector(dir, spd * dt);
      host.clamp(this.pos, 0.52);
      this.a.setRunning(true, spd);
    } else if (this.cd <= 0) {
      // Cycle through each general's full hero repertoire so every fight feels choreographed & dramatic!
      const zhaoPool: AllyMove[] = ['flurry', 'sweep', 'thrust', 'dragonDive'];
      const luxunPool: AllyMove[] = ['flurry', 'fireWave', 'sweep'];
      const pool = isZhao ? zhaoPool : luxunPool;
      this.atkMode = pool[this.moveIdx++ % pool.length];
      this.atkDur = this.atkMode === 'flurry' ? 0.72 : this.atkMode === 'dragonDive' || this.atkMode === 'fireWave' ? 0.64 : 0.56;
      this.atkT = this.atkDur;
      this.atkStep = 0;
      this.cd = isZhao ? 0.92 : 1.08;

      // Protagonist-grade flash-step afterimage on agile gap-closers & flurries!
      if (this.atkMode === 'thrust' || this.atkMode === 'dragonDive' || this.atkMode === 'flurry') {
        fxAfterimage(this.pos.clone(), isZhao ? 2.0 : 1.9, isZhao ? 0x7cc8ff : 0x5ce0b0, { life: 0.36, glow: 0.58 });
        if (dist > 1.6) {
          this.pos.addScaledVector(dir, Math.min(dist - 1.35, 1.4));
          host.clamp(this.pos, 0.52);
        }
      }

      this.a.setRunning(false);
      this.a.play(new Action(this.atkMode === 'fireWave' ? 'cast' : 'attack', this.atkDur, 0.48, { atk: this.atkMode }));
      cue(isZhao ? (this.atkMode === 'sweep' ? 'swishHeavy' : 'swingStab') : 'swishHeavy', 0.74);
      if (this.barkCd <= 0 && !host.guard?.silent) {
        this.barkCd = R(6.0, 9.0);
        const barks = ALLY_BARKS[this.kind];
        host.say(() => this.a.head(), barks[Math.floor(Math.random() * barks.length)]);
      }
    } else {
      // Agile hero strafe between combos
      const st = side(dir, Math.sin(this.a.t * 1.7) >= 0 ? 1 : -1);
      this.pos.addScaledVector(st, 2.2 * dt);
      host.clamp(this.pos, 0.52);
      this.a.setRunning(true, 2.2);
    }

    this.a.home.copy(this.pos);
    this.a.update(dt);
  }

  private landStrike(host: AllyHost, live: Foe[], subHit: number) {
    const fwd = V3(Math.sin(this.a.yaw), 0, Math.cos(this.a.yaw));
    const s = side(fwd, 1);
    const isZhao = this.kind === 'zhaoyun';
    const colA = isZhao ? 0xf0f8ff : 0x80f4cc;
    const colB = isZhao ? 0x6cb8ff : 0xff9a38;
    const mode = this.atkMode;

    let range = isZhao ? 3.5 : 3.7;
    let dotMin = 0.42;
    let dmg = isZhao ? 22 : 24;

    if (mode === 'flurry') {
      // 3 rapid staccato strikes with distinct lateral offset & crisp voxel blade-light flashes!
      const lat = (subHit - 1) * 0.42;
      const start = this.pos.clone().addScaledVector(s, lat * 0.4);
      const end = this.pos.clone().addScaledVector(fwd, isZhao ? 3.9 : 3.4).addScaledVector(s, lat);
      slashArc.line({ a: start, b: end, width: 0.72, y: 1.05 + (subHit - 1) * 0.12, palette: isZhao ? 'zhaoyun' : 'luxun', fade: 0.20 });
      if (!isZhao && subHit === 2) {
        slashArc.clashCross(this.pos.clone().addScaledVector(fwd, 2.2).setY(1.1), s, 0.6, 'luxun', 0.18, 1.1);
      }
      fxSparks(this.pos.clone().addScaledVector(fwd, 2.2).addScaledVector(s, lat * 0.6).setY(1.05), colA, 7, 4.4);
      cue(isZhao ? 'swingStab' : 'swish', 0.62);
      dmg = isZhao ? 11 : 12;
      range = isZhao ? 3.9 : 3.6;
      dotMin = 0.35;
    } else if (mode === 'sweep') {
      // 360° heroic spin sweep!
      fxRing(this.pos.clone().setY(0.92), isZhao ? 0x7cc8ff : 0x5ce0b0, range * 0.92, { life: 0.34, width: 0.22, bright: 1.6 } as never);
      voxelBurst(this.pos, fwd, colA, colB, 12, range * 0.85, 1.3);
      dotMin = -1.0; // full 360° AoE!
      dmg = isZhao ? 24 : 23;
    } else if (mode === 'dragonDive') {
      const land = this.pos.clone().addScaledVector(fwd, 1.9);
      fxShock(land, 0x7cc8ff, 2.8, { life: 0.44 });
      voxelBurst(land, fwd, 0xf4faff, 0x6cb8ff, 12, 2.4, 1.1);
      cue('hitHeavy', 0.76);
      range = 3.8;
      dotMin = -0.25;
      dmg = 28;
    } else if (mode === 'fireWave') {
      // 借风焚江阵: 3-stage propagating line of emerald-amber flame eruptions!
      const b0 = this.pos.clone().addScaledVector(fwd, 4.8);
      slashArc.line({ a: this.pos.clone(), b: b0, width: 0.95, y: 0.95, palette: 'luxun', fade: 0.28 });
      for (let i = 0; i < 3; i++) {
        const at = this.pos.clone().addScaledVector(fwd, 1.5 + i * 1.45);
        after(i * 0.09, () => {
          fxRing(at.clone().setY(0.08), i % 2 ? 0xff9434 : 0x5ce0b0, 1.85, { life: 0.48, width: 0.20, bright: 1.8 } as never);
          fxEmbers(at.clone().setY(0.4), 0xff9a38, 10, { r: 0.9, up: 1.8, life: 0.55 });
          voxelBurst(at, fwd, 0x5ce0b0, 0xff9434, 6, 0.9, 1.0);
        });
      }
      cue('fire', 0.78);
      range = 5.2;
      dotMin = 0.52;
      dmg = 26;
    } else {
      // 游龙穿云刺: straight blazing silver-azure lance beam!
      const b0 = this.pos.clone().addScaledVector(fwd, 4.6);
      slashArc.line({ a: this.pos.clone(), b: b0, width: 0.88, y: 1.05, palette: 'zhaoyun', fade: 0.24 });
      voxelBurst(this.pos, fwd, colA, colB, 10, 4.2, 0.35);
      fxSparks(this.pos.clone().addScaledVector(fwd, 2.4).setY(1.0), colA, 10, 4.6);
      range = 4.6;
      dotMin = 0.58;
      dmg = 25;
    }

    let hitAny = false;
    for (const f of live) {
      const to = f.pos.clone().sub(this.pos).setY(0);
      const d = to.length();
      if (d > range + f.d.r) continue;
      const dot = d > 1e-4 ? to.dot(fwd) / d : 1;
      if (dot >= dotMin) {
        host.hitFoe(f, dmg, this.pos, colA);
        hitAny = true;
      }
    }
    if (hitAny) cue(isZhao ? 'hitStab' : 'fire', 0.70);
  }

  salute() { if (this.active) this.a.play(new Action('salute', 1.1, 0.5)); }

  dispose() {
    if (!this.active) return;
    this.active = false;
    fxSmoke(this.pos.clone().setY(0.5), this.kind === 'zhaoyun' ? 0xd8e8ff : 0x90e0c8, 10, { r: 0.6, spd: 1.0, up: 0.8, s: 0.35, life: 0.5 });
    this.a.dispose();
  }
}

export const GENERAL_REGIONS: Array<{ id: 'zhaoyun' | 'lubu' | 'xiahoudun' | 'luxun'; mode: 'ally' | 'duel'; name: string; title: string }> = [
  { id: 'zhaoyun', mode: 'ally', name: '赵云', title: '常山赵子龙 · 并肩破阵' },
  { id: 'lubu', mode: 'duel', name: '吕布', title: '温侯 · 三合试锋' },
  { id: 'xiahoudun', mode: 'duel', name: '夏侯惇', title: '独眼猛将 · 暗处交锋' },
  { id: 'luxun', mode: 'ally', name: '陆逊', title: '江东儒将 · 借火同行' },
];
