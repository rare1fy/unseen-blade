// act-114 三国名将战斗系统：
//   - 友军名将（第一关赵云、第四关陆逊）：AllyGeneral 实打实与刘白并肩斩杀当间敌人，走房间真实 clamp/solids 不穿墙，
//     出招带纯体素光块特效（赵云银枪芒 / 陆逊青炎剑风），清场后抱拳告别。
//   - 交锋名将（第二关吕布、第三关夏侯惇）：注册进 EDEFS + FOE_AI，真实地面预警、可被「破势」弹反，削血至 75% 或两次破势
//     或交手满 22 秒即优雅收招触发战后对白与馈赠（绝不强杀历史名将、也不卡死玩家）。
import * as THREE from 'three';
import { V3, R, scene } from '../../engine/world';
import { Action } from '../../actors/rig';
import { BattleActor } from '../../bestiary/battle';
import { ROSTER } from '../../bestiary/models';
import { cue } from '../../../audio/cues';
import { fxRing, fxSparks, fxSmoke } from '../../fx/fx';
import { addBlock } from '../../fx/blocks';
import { TUNE } from '../tune';
import {
  addFoes, FOE_AI, startAttack, canStrike, steerFoe, turnFoe, trimShadows,
  type Foe, type FoeWorld,
} from '../enemy';
import './generals_models';
import './generals_pose';

const dmgOf = (n: number) => Math.round(n * TUNE.enemyDmg);
const side = (dir: THREE.Vector3, s: number) => V3(dir.z, 0, -dir.x).multiplyScalar(s);

// ------------------------------------------------------------------ 1. 交锋名将（吕布 / 夏侯惇）注册进 EDEFS + FOE_AI
addFoes({
  gen_lubu: {
    model: 'gen_lubu', hp: 580, r: 0.68, speed: 3.1, mass: 3.8, poise: 56, gold: 0,
    name: '温侯 · 吕布', role: 'ext', boss: true, tag: '人中吕布 · 戟裂长空',
  },
  gen_xiahoudun: {
    model: 'gen_xiahoudun', hp: 520, r: 0.62, speed: 2.9, mass: 3.2, poise: 48, gold: 0,
    name: '独眼猛将 · 夏侯惇', role: 'ext', boss: true, tag: '拔矢啖睛 · 暗处孤刃',
  },
});

FOE_AI.gen_lubu = {
  think(f, w, dt, dist, dir, yawTo) {
    if (!w.heroAlive) return;
    if (dist > 3.0) {
      steerFoe(f, dir.clone(), f.d.speed * 1.05, dt, yawTo);
    } else if (dist < 1.8) {
      steerFoe(f, dir.clone().multiplyScalar(-1), f.d.speed * 0.45, dt, yawTo, true);
    } else {
      steerFoe(f, side(dir, f.strafe), f.d.speed * 0.7, dt, yawTo, true);
    }
    const can = canStrike(f, w);
    if (!can) return;
    if (dist < 3.4) {
      startAttack(f, w, { k: 'cone', r: 3.8, half: 1.2 }, 0.62, dmgOf(18), yawTo, {
        atk: 'sweep', act: { name: 'attack', imp: 0.55, tail: 0.35, data: { atk: 'sweep' } },
      });
    } else if (dist < 6.4 && Math.random() < dt * 2.4) {
      if (Math.random() < 0.5) {
        // Jumpable halberd slam (low shockwave!)
        startAttack(f, w, { k: 'circle', r: 2.8, ahead: 1.4 }, 0.76, dmgOf(20), yawTo, {
          atk: 'slam', low: true,
          act: { name: 'attack', imp: 0.58, tail: 0.4, data: { atk: 'slam' } },
        });
      } else {
        // Long piercing halberd thrust
        startAttack(f, w, { k: 'rect', len: 5.8, w: 1.5 }, 0.64, dmgOf(16), yawTo, {
          atk: 'thrust',
          act: { name: 'attack', imp: 0.54, tail: 0.35, data: { atk: 'thrust' } },
        });
      }
    }
  },
  windup(f, _w, dt, _dist, yawTo) { turnFoe(f, yawTo, dt, 4.5); },
  recover: () => 0.65,
};

FOE_AI.gen_xiahoudun = {
  think(f, w, dt, dist, dir, yawTo) {
    if (!w.heroAlive) return;
    if (dist > 2.6) {
      steerFoe(f, dir.clone(), f.d.speed, dt, yawTo);
    } else if (dist < 1.5) {
      steerFoe(f, dir.clone().multiplyScalar(-1), f.d.speed * 0.4, dt, yawTo, true);
    } else {
      steerFoe(f, side(dir, f.strafe), f.d.speed * 0.75, dt, yawTo, true);
    }
    const can = canStrike(f, w);
    if (!can) return;
    if (dist < 2.9) {
      if (Math.random() < 0.5) {
        startAttack(f, w, { k: 'cone', r: 3.1, half: 1.05 }, 0.54, dmgOf(16), yawTo, {
          atk: 'slash', act: { name: 'attack', imp: 0.52, tail: 0.32, data: { atk: 'slash' } },
        });
      } else {
        startAttack(f, w, { k: 'rect', len: 3.8, w: 1.6 }, 0.64, dmgOf(20), yawTo, {
          atk: 'cleave',
          act: { name: 'attack', imp: 0.56, tail: 0.38, data: { atk: 'cleave' } },
        });
      }
    } else if (dist < 5.6 && Math.random() < dt * 2.2) {
      startAttack(f, w, { k: 'rect', len: 4.8, w: 1.5 }, 0.62, dmgOf(18), yawTo, {
        atk: 'slash',
        act: { name: 'attack', imp: 0.55, tail: 0.35, data: { atk: 'slash' } },
      });
    }
  },
  windup(f, _w, dt, _dist, yawTo) { turnFoe(f, yawTo, dt, 5.2); },
  recover: () => 0.62,
};

// ------------------------------------------------------------------ 2. 友军名将（赵云 / 陆逊）：并肩作战控制器
export interface AllyHost {
  foes: Foe[];
  heroPos: THREE.Vector3;
  clamp(p: THREE.Vector3, r: number): void;
  hitFoe(f: Foe, dmg: number, from: THREE.Vector3, col: number): void;
  say(head: () => THREE.Vector3, line: string): void;
}

const ALLY_BARKS: Record<'zhaoyun' | 'luxun', string[]> = {
  zhaoyun: ['银枪破阵！', '休伤我身旁之人！', '常山赵云在此！'],
  luxun: ['借风引火！', '连环船已燃，退！', '破开这道防线！'],
};

/** Pure voxel burst along a spear thrust or celadon-flame sword wave (100% voxel-cube aesthetic) */
function voxelBurst(from: THREE.Vector3, dir: THREE.Vector3, colA: number, colB: number, count: number, range: number) {
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count;
    const p = from.clone().addScaledVector(dir, 0.5 + u * range).add(V3((Math.random() - 0.5) * 0.45, 0.75 + Math.random() * 0.55, (Math.random() - 0.5) * 0.45));
    addBlock(p, {
      size: 0.08 + Math.random() * 0.07,
      v: dir.clone().multiplyScalar(2.4 + Math.random() * 2.0).add(V3((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2)),
      col: i % 2 ? colA : colB, bright: 1.5, life: 0.32 + Math.random() * 0.16, shrink: 0.6, drag: 1.8, grav: 1.2,
    });
  }
}

export class AllyGeneral {
  readonly kind: 'zhaoyun' | 'luxun';
  readonly a: BattleActor;
  readonly pos: THREE.Vector3;
  private cd = 0.5;
  private atkT = 0;
  private atkHit = false;
  private atkMode: 'thrust' | 'sweep' = 'thrust';
  private barkCd = 3.2;
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
    fxSmoke(this.pos.clone().setY(0.35), kind === 'zhaoyun' ? 0xd8e8ff : 0x90d8c8, 10, { r: 0.6, spd: 1.1, up: 0.7, s: 0.35, life: 0.55 });
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

  /** live combat update: hunts foes safely inside room bounds */
  update(dt: number, host: AllyHost) {
    if (!this.active) return;
    this.cd = Math.max(0, this.cd - dt);
    this.barkCd -= dt;
    const live = host.foes.filter(f => f.st !== 'dead' && f.st !== 'enter' && f.kind !== 'dummy' && !f.mem.hidden);

    // Finish active attack animation
    if (this.atkT > 0) {
      this.atkT -= dt;
      if (!this.atkHit && this.atkT <= 0.24) {
        this.atkHit = true;
        this.landStrike(host, live);
      }
      this.a.setRunning(false);
      this.a.home.copy(this.pos);
      this.a.update(dt);
      return;
    }

    if (!live.length) {
      // Escort near hero at respectful offset (2.2 m away, never blocking her)
      const toHero = host.heroPos.clone().sub(this.pos).setY(0);
      const d = toHero.length();
      if (d > 2.8) {
        toHero.normalize();
        this.pos.addScaledVector(toHero, Math.min(d - 2.2, 3.2 * dt));
        host.clamp(this.pos, 0.5);
        this.a.yaw = Math.atan2(toHero.x, toHero.z);
        this.a.setRunning(true, 3.2);
      } else {
        this.a.setRunning(false);
      }
      this.a.home.copy(this.pos);
      this.a.update(dt);
      return;
    }

    // Pick closest live foe
    let target = live[0], best = this.pos.distanceToSquared(live[0].pos);
    for (let i = 1; i < live.length; i++) {
      const d2 = this.pos.distanceToSquared(live[i].pos);
      if (d2 < best) { best = d2; target = live[i]; }
    }
    const dir = target.pos.clone().sub(this.pos).setY(0);
    const dist = dir.length() || 1;
    dir.divideScalar(dist);
    this.a.yaw = Math.atan2(dir.x, dir.z);

    const reach = this.kind === 'zhaoyun' ? 2.6 : 2.9;
    if (dist > reach) {
      const spd = this.kind === 'zhaoyun' ? 4.3 : 3.8;
      this.pos.addScaledVector(dir, spd * dt);
      host.clamp(this.pos, 0.52);
      this.a.setRunning(true, spd);
    } else if (this.cd <= 0) {
      this.atkMode = Math.random() < 0.5 ? 'thrust' : 'sweep';
      this.atkT = 0.52;
      this.atkHit = false;
      this.cd = this.kind === 'zhaoyun' ? 1.15 : 1.35;
      this.a.setRunning(false);
      this.a.play(new Action(this.kind === 'luxun' && this.atkMode === 'sweep' ? 'cast' : 'attack', 0.52, 0.5, { atk: this.atkMode }));
      cue(this.kind === 'zhaoyun' ? 'swingStab' : 'swishHeavy', 0.7);
      if (this.barkCd <= 0) {
        this.barkCd = R(6.5, 9.5);
        const pool = ALLY_BARKS[this.kind];
        host.say(() => this.a.head(), pool[Math.floor(Math.random() * pool.length)]);
      }
    } else {
      // Strafe briskly between attacks
      const st = side(dir, Math.sin(this.a.t * 1.5) >= 0 ? 1 : -1);
      this.pos.addScaledVector(st, 1.8 * dt);
      host.clamp(this.pos, 0.52);
      this.a.setRunning(true, 1.8);
    }

    this.a.home.copy(this.pos);
    this.a.update(dt);
  }

  private landStrike(host: AllyHost, live: Foe[]) {
    const fwd = V3(Math.sin(this.a.yaw), 0, Math.cos(this.a.yaw));
    const isZhao = this.kind === 'zhaoyun';
    const range = isZhao ? 3.3 : 3.6;
    const colA = isZhao ? 0xe8f4ff : 0x90f0d8;
    const colB = isZhao ? 0x80b8ff : 0xff9a38;
    voxelBurst(this.pos, fwd, colA, colB, 10, range);
    if (!isZhao) fxRing(this.pos.clone().addScaledVector(fwd, 1.4).setY(0.08), 0xff8a30, 1.8, { life: 0.45 } as never);
    else fxSparks(this.pos.clone().addScaledVector(fwd, 2.0).setY(1.0), 0xe8f4ff, 8, 4);

    let hitAny = false;
    for (const f of live) {
      const to = f.pos.clone().sub(this.pos).setY(0);
      const d = to.length();
      if (d > range + f.d.r) continue;
      const dot = d > 1e-4 ? to.dot(fwd) / d : 1;
      if (this.atkMode === 'sweep' ? dot > -0.1 : dot > 0.45) {
        host.hitFoe(f, isZhao ? 20 : 22, this.pos, colA);
        hitAny = true;
      }
    }
    if (hitAny) cue(isZhao ? 'hitStab' : 'fire', 0.72);
  }

  salute() { if (this.active) this.a.play(new Action('salute', 1.1, 0.5)); }

  dispose() {
    if (!this.active) return;
    this.active = false;
    fxSmoke(this.pos.clone().setY(0.5), this.kind === 'zhaoyun' ? 0xd8e8ff : 0x90d8c8, 10, { r: 0.6, spd: 1.0, up: 0.8, s: 0.35, life: 0.5 });
    this.a.dispose();
  }
}

export const GENERAL_REGIONS: Array<{ id: 'zhaoyun' | 'lubu' | 'xiahoudun' | 'luxun'; mode: 'ally' | 'duel'; name: string; title: string }> = [
  { id: 'zhaoyun', mode: 'ally', name: '赵云', title: '常山赵子龙 · 并肩破阵' },
  { id: 'lubu', mode: 'duel', name: '吕布', title: '温侯 · 三合试锋' },
  { id: 'xiahoudun', mode: 'duel', name: '夏侯惇', title: '独眼猛将 · 暗处交锋' },
  { id: 'luxun', mode: 'ally', name: '陆逊', title: '江东儒将 · 借火同行' },
];
