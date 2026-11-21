// 三国四大名将奇遇解困微解谜系统（act-125，11-21 用户拍板）：
//   不再让名将突兀地拉出来帮打普通波次或强行对打，而是每大关岔路必刷一条金色「名将奇遇」房，
//   进屋后是 45～90 秒紧扣历史典故与「蒙眼听声」的专属解困事件：
//     0 · 赵云「听声辨井」：斩碎 2 处紫红干扰妖铃 → 听青白声纹锁真井斩锁救乡民
//     1 · 吕布「辕门断锁」：听准三处青铜铁索金色共振拍，以刀/镖三连断锁救赤兔（忌砍红柱）
//     2 · 夏侯惇「雾巷破弩」：听四面弦响，挥刀弹箭反毁或飞镖/近身清光 5 架高台连弩
//     3 · 陆逊「借风引火」：关逆流水闸 + 断绳落油桥打通火链，劈爆引火油坛连环焚舰
//   全部采用纯 3D 体素模型与横平竖直方形声纹，零软锁、支持键盘/手柄/触屏全输入。
import * as THREE from 'three';
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import { V3 } from '../engine/world';
import { BattleActor } from '../bestiary/battle';
import { ROSTER } from '../bestiary/models';
import { fxRing, fxSparks, fxSmoke, fxEmbers, fxFlare } from '../fx/fx';
import { addBlock } from '../fx/blocks';
import { shake, hitstop, after } from '../engine/clock';
import { cue } from '../../audio/cues';
import { trimShadows } from './enemy';
import type { Strike } from './puzzles';
import type { KeepsakeId } from './keepsakes';
import './foes/generals_models';
import './foes/generals_pose';

export type GeneralBlessingId = 'zhaoyun' | 'lubu' | 'xiahoudun' | 'luxun';

export interface GeneralEventMeta {
  region: number;
  id: GeneralBlessingId;
  keepsake: KeepsakeId;
  name: string;
  eventTitle: string;
  boardTitle: string;
  objective: string;
  blessingName: string;
  blessingDesc: string;
  intro: Array<{ who: string; text: string }>;
  outro: Array<{ who: string; text: string }>;
}

export const GENERAL_EVENTS: GeneralEventMeta[] = [
  {
    region: 0,
    id: 'zhaoyun',
    keepsake: 'zhaoyun',
    name: '常山 · 赵云',
    eventTitle: '听声辨井',
    boardTitle: '赵云奇遇',
    objective: '斩碎两处紫红妖铃，听青白声纹寻真井救人',
    blessingName: '常山枪意',
    blessingDesc: '本局穿风斩与凌空招式伤害 +35%，回气加快',
    intro: [
      { who: 'zhaoyun', text: '常山赵子龙。妖道把乡民锁在四口枯井之一，四周悬铃乱听！' },
      { who: 'zhaoyun', text: '我替你守住外围火势——姑娘耳目通神，先碎干扰妖铃，听出真井救人！' },
    ],
    outro: [
      { who: 'zhaoyun', text: '蒙目反比明眼人听得真切！乡民脱险，赵某代他们谢过。' },
      { who: 'zhaoyun', text: '这枚龙胆银穗与一缕枪意赠予姑娘，乱世前路保重！' },
    ],
  },
  {
    region: 1,
    id: 'lubu',
    keepsake: 'lubu',
    name: '温侯 · 吕布',
    eventTitle: '辕门断锁',
    boardTitle: '吕布奇遇',
    objective: '趁三处青铜铁索亮起金鸣共振时，以刀或镖精准斩断',
    blessingName: '无双破势',
    blessingDesc: '本局全招削减架势 +45%，破甲追伤 +25%',
    intro: [
      { who: 'lubu', text: '残梁三道连环铜锁困住赤兔，本侯画戟太重，硬劈反倒震塌火梁！' },
      { who: 'lubu', text: '盲女既夸口听风辨刃——趁三处铜扣金鸣共振时斩断铁索，别碰红柱！' },
    ],
    outro: [
      { who: 'lubu', text: '哈！三锁齐断、火梁不晃！赤兔脱困，本侯认你这把刀了。' },
      { who: 'lubu', text: '这缕赤兔红鬃拿去，再去铸钱场把阎虎那蠢物宰了！' },
    ],
  },
  {
    region: 2,
    id: 'xiahoudun',
    keepsake: 'xiahoudun',
    name: '独眼猛将 · 夏侯惇',
    eventTitle: '雾巷破弩',
    boardTitle: '夏侯惇奇遇',
    objective: '挥刀弹箭反毁、或以飞镖摧毁全部 5 架高台暗弩',
    blessingName: '啖睛孤刃',
    blessingDesc: '本局弹箭与破势反击伤害翻倍，受击后下刀必暴回血',
    intro: [
      { who: 'xiahoudun', text: '鼠辈在雾巷高台藏了五架连弩！曹某左目新伤，暗处吃亏！' },
      { who: 'jiangjin', text: '暗处，归我。' },
    ],
    outro: [
      { who: 'xiahoudun', text: '好俊的听弦弹箭……你我同在暗处挥刀，今日欠你一人情。' },
      { who: 'xiahoudun', text: '这幅玄铁眼带留给你，白门楼的账你自己去算！' },
    ],
  },
  {
    region: 3,
    id: 'luxun',
    keepsake: 'luxun',
    name: '江东 · 陆逊',
    eventTitle: '借风引火',
    boardTitle: '陆逊奇遇',
    objective: '先关西侧水闸、再斩东侧绳桩落桥，最后劈爆引火油坛连环焚舰',
    blessingName: '连营火势',
    blessingDesc: '本局击杀敌人触发体素火爆，火油与撞墙伤害翻倍',
    intro: [
      { who: 'luxun', text: '江东陆逊。火烧连船只差一步：西侧水闸挡流、东侧油桥悬空。' },
      { who: 'luxun', text: '请姑娘先关闸落桥连成火路，再劈开引火油坛，送曹军艨艟上天！' },
    ],
    outro: [
      { who: 'luxun', text: '火借江风、连营成势！好利落的身手，陆某佩服！' },
      { who: 'luxun', text: '这枚江东火折赠予姑娘，周默困在楼船已走不脱了。' },
    ],
  },
];

export interface EventBolt {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  turretIdx: number;
  reflected: boolean;
  mesh: THREE.Group;
  life: number;
}

export interface EventHost {
  heroPos: () => THREE.Vector3;
  hurtHero: (dmg: number, from: THREE.Vector3) => void;
  bark: (at: () => THREE.Vector3, text: string) => void;
  banner: (title: string, sub: string, dur?: number, col?: string) => void;
  onSolved: (meta: GeneralEventMeta) => void;
}

// Square axis-aligned soundwave geometry (横平竖直 3D voxel aesthetic)
const SQ_RING_GEO = (() => {
  const g = new THREE.BufferGeometry(), o = 1, i = 0.82;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -o, 0, -o, o, 0, -o, o, 0, o, -o, 0, o,
    -i, 0, -i, i, 0, -i, i, 0, i, -i, 0, i,
  ]), 3));
  g.setIndex([0, 5, 1, 0, 4, 5, 1, 6, 2, 1, 5, 6, 2, 7, 3, 2, 6, 7, 3, 4, 0, 3, 7, 4]);
  return g;
})();

function makeVoxGroup(draw: (w: VoxWorld) => void): THREE.Group {
  const w = new VoxWorld(CELL);
  draw(w);
  const g = new THREE.Group();
  for (const m of w.build({ rim: 0.25, edge: 0.14, ground: false })) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

function makeSqRing(col: number, x: number, z: number, scale = 1.1): THREE.Mesh {
  const m = new THREE.Mesh(SQ_RING_GEO, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }));
  m.position.set(x, 0.05, z);
  m.scale.set(scale, 1, scale);
  m.renderOrder = 4;
  return m;
}

function strikeHits(s: Strike, x: number, z: number, rad: number): boolean {
  if (s.k === 'circle') return Math.hypot(x - s.x, z - s.z) <= s.r + rad;
  if (s.k === 'seg') {
    const abx = s.bx - s.ax, abz = s.bz - s.az, L2 = Math.max(1e-4, abx * abx + abz * abz);
    const t = Math.max(0, Math.min(1, ((x - s.ax) * abx + (z - s.az) * abz) / L2));
    return Math.hypot(x - (s.ax + abx * t), z - (s.az + abz * t)) <= s.r + rad;
  }
  const dx = x - s.x, dz = z - s.z, l = Math.hypot(dx, dz);
  if (l > s.range + rad) return false;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  return l < rad + 0.45 || Math.abs(Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz)) <= s.half;
}

interface PropTarget {
  kind: string;
  x: number;
  z: number;
  r: number;
  hp: number;
  done: boolean;
  mesh: THREE.Group;
  ring: THREE.Mesh;
  extra?: Record<string, unknown>;
}

/** Interactive 3D voxel General Encounter Puzzle Controller */
export class GeneralEventRunner {
  readonly meta: GeneralEventMeta;
  readonly root = new THREE.Group();
  readonly actor: BattleActor;
  solved = false;
  active = false;
  private t = 0;
  private targets: PropTarget[] = [];
  private bolts: EventBolt[] = [];
  private teleLines: THREE.Mesh[] = [];
  private extraMeshes: THREE.Object3D[] = [];
  private fireTimer = 1.1;
  private nextTurret = 0;
  private chainPending = false;

  constructor(parent: THREE.Object3D, region: number, private host: EventHost) {
    const idx = Math.max(0, Math.min(GENERAL_EVENTS.length - 1, region));
    this.meta = GENERAL_EVENTS[idx];
    parent.add(this.root);

    const modelKey = 'gen_' + this.meta.id;
    const def = ROSTER.find(m => m.id === modelKey)!;
    const gPos = idx === 0 ? V3(0, 0, -7.2) : idx === 1 ? V3(0, 0, -7.4) : idx === 2 ? V3(-5.2, 0, 5.2) : V3(5.8, 0, 4.4);
    const gYaw = idx === 2 ? 0.65 : idx === 3 ? -0.75 : 0;
    this.actor = new BattleActor(def);
    this.actor.place(gPos, gYaw);
    this.actor.yaw = gYaw;
    trimShadows(this.actor.root, 5);
    this.root.add(this.actor.root);

    if (idx === 0) this.buildZhaoYun();
    else if (idx === 1) this.buildLuBu();
    else if (idx === 2) this.buildXiahouDun();
    else this.buildLuXun();
  }

  /** Start the interactive puzzle after the intro dialogue finishes */
  begin() {
    this.active = true;
    this.host.banner(this.meta.eventTitle, this.meta.objective, 3.2, '#ffe08a');
  }

  /** Returns target coordinates for hero auto-aim / dart homing inside the puzzle room */
  aimTargets(): Array<{ x: number; z: number; y: number; r: number }> {
    if (!this.active || this.solved) return [];
    const out: Array<{ x: number; z: number; y: number; r: number }> = [];
    for (const tg of this.targets) {
      if (tg.done || tg.kind === 'pillar') continue;
      if (this.meta.region === 0 && tg.kind === 'well' && !tg.extra?.isTrue && this.bannersLeft() === 0) continue;
      out.push({ x: tg.x, z: tg.z, y: tg.kind === 'turret' ? 1.55 : 1.0, r: tg.r });
    }
    return out;
  }

  private bannersLeft() {
    return this.targets.filter(tg => tg.kind === 'banner' && !tg.done).length;
  }

  // ------------------------------------------------------------------ 0. 赵云：听声辨井
  private buildZhaoYun() {
    const wells: Array<[number, number]> = [[-5.8, -2.0], [5.8, -2.0], [-5.2, 3.4], [5.2, 3.4]];
    const trueIdx = Math.floor(Math.random() * wells.length);
    wells.forEach(([x, z], i) => {
      const isTrue = i === trueIdx;
      const g = makeVoxGroup(w => {
        // Voxel stone well curb + wooden grate cover + iron padlock bar
        w.box(-7, 0, -7, 7, 7, 7, 0x76726a);
        w.box(-5, 2, -5, 5, 7, 5, 0x1a1c20);
        w.box(-7, 8, -7, 7, 8, 7, 0x948f86);
        // Locked wooden plank lid & bronze lock
        w.box(-6, 9, -5, 6, 10, 5, 0x62442c);
        w.box(-2, 11, -2, 2, 13, 2, 0xc89a40);
      });
      g.position.set(x, 0, z);
      this.root.add(g);
      const ring = makeSqRing(0xe04888, x, z, 1.35);
      this.root.add(ring);
      this.targets.push({ kind: 'well', x, z, r: 0.95, hp: 2, done: false, mesh: g, ring, extra: { isTrue, pulse: i * 0.7 } });
    });
    // Two cursed Yellow Turban interference bell-banners
    for (const [bx, bz] of [[-3.2, -5.0], [3.2, -5.0]] as const) {
      const g = makeVoxGroup(w => {
        w.box(-1, 0, -1, 1, 24, 1, 0x523620);
        w.box(-5, 19, -1, 5, 20, 1, 0x6c482c);
        // Yellow turban talisman cloth & purple-bronze bell
        w.box(-4, 10, 0, 4, 18, 0, 0xd4a434);
        w.box(-1, 12, 1, 1, 16, 1, 0x9c2848);
        w.box(-2, 16, -2, 2, 19, 2, 0xb87638);
      });
      g.position.set(bx, 0, bz);
      this.root.add(g);
      const ring = makeSqRing(0xff5288, bx, bz, 1.05);
      this.root.add(ring);
      this.targets.push({ kind: 'banner', x: bx, z: bz, r: 0.65, hp: 1, done: false, mesh: g, ring, extra: { pulse: bx } });
    }
  }

  // ------------------------------------------------------------------ 1. 吕布：辕门断锁
  private buildLuBu() {
    // North bronze gate cage housing Red Hare silhouette
    const cage = makeVoxGroup(w => {
      w.box(-18, 0, -4, 18, 2, 4, 0x585450);
      for (let x = -16; x <= 16; x += 4) w.box(x, 3, 2, x + 1, 20, 3, 0x3e424a);
      w.box(-18, 21, -4, 18, 23, 4, 0x863628);
      // Red Hare voxel silhouette behind bars
      w.box(-6, 3, -3, 6, 10, -1, 0x982a1e);
      w.box(5, 9, -3, 8, 15, -1, 0xb43424);
      w.box(-5, 0, -3, -3, 3, -1, 0x421814);
      w.box(3, 0, -3, 5, 3, -1, 0x421814);
    });
    cage.position.set(0, 0, -8.8);
    this.root.add(cage);
    this.extraMeshes.push(cage);

    // Three heavy bronze chain-winch locks cycling golden resonance beats
    const locks: Array<[number, number, number]> = [[-6.0, -2.2, 0], [0, -4.8, 0.85], [6.0, -2.2, 1.7]];
    locks.forEach(([x, z, phase]) => {
      const g = makeVoxGroup(w => {
        w.box(-5, 0, -5, 5, 4, 5, 0x4a4c54);
        w.box(-3, 5, -3, 3, 14, 3, 0x7c5a2c);
        w.box(-4, 10, -4, 4, 13, 4, 0xc8983e);
        w.box(-2, 15, -2, 2, 17, 2, 0xffe07a);
      });
      g.position.set(x, 0, z);
      this.root.add(g);
      const ring = makeSqRing(0x6e7484, x, z, 1.25);
      this.root.add(ring);
      this.targets.push({ kind: 'lock', x, z, r: 0.85, hp: 1, done: false, mesh: g, ring, extra: { phase, hot: false } });
    });

    // Two crimson palace load-bearing pillars (do NOT strike)
    for (const [px, pz] of [[-3.1, -3.5], [3.1, -3.5]] as const) {
      const g = makeVoxGroup(w => {
        w.box(-4, 0, -4, 4, 3, 4, 0x6e6a64);
        w.box(-3, 4, -3, 3, 26, 3, 0x8e2820);
        w.box(-4, 24, -4, 4, 26, 4, 0xc49438);
      });
      g.position.set(px, 0, pz);
      this.root.add(g);
      const ring = makeSqRing(0xb02820, px, pz, 0.78);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.25;
      this.root.add(ring);
      this.targets.push({ kind: 'pillar', x: px, z: pz, r: 0.55, hp: 99, done: false, mesh: g, ring });
    }
  }

  // ------------------------------------------------------------------ 2. 夏侯惇：雾巷破弩
  private buildXiahouDun() {
    const turrets: Array<[number, number]> = [[-7.0, -4.4], [0, -6.4], [7.0, -4.4], [-7.0, 1.6], [7.0, 1.6]];
    turrets.forEach(([x, z], i) => {
      const g = makeVoxGroup(w => {
        // Elevated timber turret tower + dark iron repeating crossbow mounted on top
        w.box(-5, 0, -5, 5, 14, 5, 0x523a26);
        w.box(-6, 15, -6, 6, 16, 6, 0x6e4e34);
        // Crossbow stock & bow arms
        w.box(-2, 17, -5, 2, 20, 6, 0x3a3e48);
        w.box(-8, 18, 2, 8, 20, 3, 0x8a6436);
        w.box(-1, 20, 3, 1, 21, 7, 0xffd268);
      });
      g.position.set(x, 0, z);
      g.rotation.y = Math.atan2(-x, -z);
      this.root.add(g);
      const ring = makeSqRing(0xff6848, x, z, 1.1);
      this.root.add(ring);
      // Aiming telegraph laser line (pure flat voxel bar)
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.04, 1),
        new THREE.MeshBasicMaterial({ color: 0xffc862, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      );
      line.visible = false;
      this.root.add(line);
      this.teleLines.push(line);
      this.targets.push({ kind: 'turret', x, z, r: 0.9, hp: 2, done: false, mesh: g, ring, extra: { idx: i, charge: 0, line } });
    });
  }

  // ------------------------------------------------------------------ 3. 陆逊：借风引火
  private buildLuXun() {
    // Two northern enemy Cao warship hulls to ignite
    for (const wx of [-2.8, 2.8]) {
      const hull = makeVoxGroup(w => {
        w.box(-12, 0, -6, 12, 10, 6, 0x483222);
        w.box(-11, 11, -5, 11, 14, 5, 0x64442c);
        w.box(-2, 15, -2, 2, 26, 2, 0x3e2a1c);
        w.box(-7, 17, 0, 7, 24, 0, 0x8a2820);
      });
      hull.position.set(wx, 0, -7.2);
      this.root.add(hull);
      this.extraMeshes.push(hull);
    }

    // Visual water sluice barrier & raised bridge gap
    const barrier = makeVoxGroup(w => {
      w.box(-16, 0, -5, 16, 4, 5, 0x3888b8);
      w.box(-16, 5, -4, 16, 5, 4, 0x76d4f8);
    });
    barrier.position.set(0, 0, 0.5);
    this.root.add(barrier);
    this.extraMeshes.push(barrier);

    const bridge = makeVoxGroup(w => {
      w.box(-7, 0, -7, 7, 2, 7, 0x765032);
      w.box(-6, 3, -5, 6, 3, 5, 0x9c3a22); // oil-soaked plank strip
    });
    bridge.position.set(0, 2.8, -1.8);
    bridge.rotation.x = -0.95; // raised until rope post cut
    this.root.add(bridge);
    this.extraMeshes.push(bridge);

    // 1) West water sluice wheel (2 hits)
    const wheel = makeVoxGroup(w => {
      w.box(-4, 0, -4, 4, 4, 4, 0x585c64);
      w.box(-1, 5, -1, 1, 16, 1, 0x6a4a2c);
      w.box(-6, 11, -2, 6, 15, 2, 0xb8863c);
    });
    wheel.position.set(-5.0, 0, 1.2);
    this.root.add(wheel);
    const wRing = makeSqRing(0x62d4ff, -5.0, 1.2, 1.15);
    this.root.add(wRing);
    this.targets.push({ kind: 'sluice', x: -5.0, z: 1.2, r: 0.85, hp: 2, done: false, mesh: wheel, ring: wRing, extra: { barrier } });

    // 2) East rope post holding oil bridge (1 hit)
    const post = makeVoxGroup(w => {
      w.box(-2, 0, -2, 2, 18, 2, 0x5a3c24);
      w.box(-3, 12, -3, 3, 15, 3, 0xb89660);
    });
    post.position.set(5.0, 0, -1.6);
    this.root.add(post);
    const pRing = makeSqRing(0x62d4ff, 5.0, -1.6, 1.15);
    this.root.add(pRing);
    this.targets.push({ kind: 'rope', x: 5.0, z: -1.6, r: 0.8, hp: 1, done: false, mesh: post, ring: pRing, extra: { bridge } });

    // 3) Starting oil jar + 5 linked powder kegs along the deck
    const makeJar = (x: number, z: number, starter: boolean) => {
      const j = makeVoxGroup(w => {
        w.box(-3, 0, -3, 3, 8, 3, starter ? 0xb43222 : 0x7c3424);
        w.box(-2, 9, -2, 2, 10, 2, 0xd8a048);
        w.box(-3, 4, -3, 3, 5, 3, 0xf2c85c);
      });
      j.position.set(x, 0, z);
      this.root.add(j);
      return j;
    };
    const startJar = makeJar(0, 3.6, true);
    const jRing = makeSqRing(0xff9a3c, 0, 3.6, 1.15);
    this.root.add(jRing);
    const kegPos: Array<[number, number]> = [[0, 1.6], [0, -0.4], [0, -2.6], [-2.6, -4.6], [2.6, -4.6]];
    const kegs = kegPos.map(([x, z]) => ({ x, z, mesh: makeJar(x, z, false) }));
    this.targets.push({ kind: 'starter', x: 0, z: 3.6, r: 0.78, hp: 1, done: false, mesh: startJar, ring: jRing, extra: { kegs, respawnT: 0 } });
  }

  // ------------------------------------------------------------------ Strike / Dart / Deflect handling
  strike(s: Strike): boolean {
    if (!this.active || this.solved) return false;
    let hitAny = false;
    for (const tg of this.targets) {
      if (tg.done) continue;
      if (!strikeHits(s, tg.x, tg.z, tg.r)) continue;
      hitAny = true;
      this.onTargetHit(tg);
    }
    return hitAny;
  }

  /** Called by show.ts when a thrown hero dart approaches (x, z) */
  hitByDart(x: number, z: number): boolean {
    if (!this.active || this.solved) return false;
    for (const tg of this.targets) {
      if (tg.done) continue;
      if (Math.hypot(x - tg.x, z - tg.z) <= tg.r + 0.45) {
        this.onTargetHit(tg);
        return true;
      }
    }
    return false;
  }

  /** Called by show.ts when hero slashes or parries inside the Xiahou Dun fog-alley event */
  deflectBolts(heroPos: THREE.Vector3, yaw: number, range: number, isParry = false): number {
    if (!this.active || this.solved || this.meta.region !== 2) return 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let count = 0;
    for (const b of this.bolts) {
      if (b.reflected) continue;
      const dx = b.pos.x - heroPos.x, dz = b.pos.z - heroPos.z, d = Math.hypot(dx, dz);
      if (d > range + 0.9) continue;
      if (!isParry && d > 0.7 && (dx * fx + dz * fz) / d < -0.15) continue;
      b.reflected = true;
      b.life = 2.0;
      const tg = this.targets[b.turretIdx];
      if (tg && !tg.done) {
        const to = V3(tg.x - b.pos.x, 0.2, tg.z - b.pos.z).normalize();
        b.vel.copy(to).multiplyScalar(22);
      } else {
        b.vel.negate().multiplyScalar(1.5);
      }
      b.mesh.rotation.y = Math.atan2(b.vel.x, b.vel.z);
      fxSparks(b.pos.clone(), 0xffe488, 12, 5, { hot: true });
      fxRing(b.pos.clone().setY(0.1), 0xffe488, 1.2, { life: 0.3 } as never);
      cue('parry', 0.95);
      hitstop(0.055);
      shake(0.14);
      count++;
    }
    return count;
  }

  private onTargetHit(tg: PropTarget) {
    const p = V3(tg.x, 1.0, tg.z);
    if (this.meta.region === 0) {
      if (tg.kind === 'banner') {
        tg.done = true; tg.mesh.visible = false; tg.ring.visible = false;
        fxSparks(p, 0xff78a0, 14, 5); fxSmoke(p, 0x8a3854, 8, { r: 0.5, spd: 1.5, up: 1.0, s: 0.35, life: 0.55 });
        cue('crateBreak', 0.9); shake(0.12);
        if (this.bannersLeft() === 0) {
          this.host.bark(() => this.actor.head(), '妖铃尽碎！快听清那口青白敲声的枯井！');
          cue('reveal', 0.85);
        }
      } else if (tg.kind === 'well') {
        if (tg.extra?.isTrue) {
          tg.hp--;
          fxSparks(p, 0x8cf4ff, 12, 5, { hot: true });
          cue('parry', 0.8); shake(0.14);
          if (tg.hp <= 0) {
            tg.done = true; tg.ring.visible = false;
            fxFlare(p, 0xffe890, 2.2, 0.5);
            this.complete();
          }
        } else {
          fxSmoke(p, 0x702848, 10, { r: 0.6, spd: 1.2, up: 0.9, s: 0.35, life: 0.6 });
          cue('hitLight', 0.6);
          this.host.bark(() => this.actor.head(), this.bannersLeft() > 0 ? '先碎两处干扰妖铃，再听声辨井！' : '这口是空井！听那口青白声纹的枯井！');
        }
      }
      return;
    }

    if (this.meta.region === 1) {
      if (tg.kind === 'pillar') {
        fxSmoke(p, 0x8e5a42, 8, { r: 0.5, spd: 1.0, up: 0.6, s: 0.3, life: 0.5 });
        shake(0.18); cue('hitHeavy', 0.7);
        this.host.bark(() => this.actor.head(), '小心红柱！切莫震塌火梁惊了赤兔！');
        return;
      }
      if (tg.kind === 'lock') {
        if (tg.extra?.hot) {
          tg.done = true; tg.mesh.visible = false; tg.ring.visible = false;
          fxSparks(p, 0xffe078, 18, 6.5, { hot: true });
          fxRing(V3(tg.x, 0.08, tg.z), 0xffd268, 2.0, { life: 0.4 } as never);
          cue('bladeRing', 1.0); hitstop(0.06); shake(0.18);
          const left = this.targets.filter(x => x.kind === 'lock' && !x.done).length;
          if (left === 0) this.complete();
          else this.host.bark(() => this.actor.head(), left === 1 ? '好刀！还剩最后一道铜锁！' : '利落！再断其余两道！');
        } else {
          fxSparks(p, 0x9aa4b4, 8, 3.5);
          cue('parry', 0.55);
          this.host.bark(() => this.actor.head(), '未到金鸣共振之时，听准亮金再斩！');
        }
      }
      return;
    }

    if (this.meta.region === 2 && tg.kind === 'turret') {
      tg.hp--;
      fxSparks(p, 0xffd068, 12, 5);
      cue('crateBreak', 0.85); shake(0.14);
      if (tg.hp <= 0) this.destroyTurret(tg);
      return;
    }

    if (this.meta.region === 3) {
      if (tg.kind === 'sluice') {
        tg.hp--; tg.mesh.rotation.y += Math.PI * 0.45;
        fxSparks(p, 0x76e0ff, 10, 4.5); cue('crateBreak', 0.75);
        if (tg.hp <= 0) {
          tg.done = true; tg.ring.visible = false;
          const bar = tg.extra?.barrier as THREE.Object3D | undefined;
          if (bar) bar.visible = false;
          fxRing(V3(tg.x, 0.08, tg.z), 0x76e8ff, 2.2, { life: 0.45 } as never);
          this.checkLuXunReady();
        }
      } else if (tg.kind === 'rope') {
        tg.done = true; tg.mesh.visible = false; tg.ring.visible = false;
        const br = tg.extra?.bridge as THREE.Object3D | undefined;
        if (br) { br.position.y = 0.02; br.rotation.x = 0; }
        fxSparks(p, 0xffd888, 14, 5); cue('hitHeavy', 0.85); shake(0.16);
        this.checkLuXunReady();
      } else if (tg.kind === 'starter' && !this.chainPending) {
        const sluiceDone = this.targets.find(x => x.kind === 'sluice')?.done;
        const ropeDone = this.targets.find(x => x.kind === 'rope')?.done;
        tg.mesh.visible = false; tg.ring.visible = false;
        fxEmbers(p, 16, 4.5); fxFlare(p, 0xff9a3c, 1.8, 0.4); cue('boom', 0.9); shake(0.2);
        if (!sluiceDone || !ropeDone) {
          tg.done = true;
          this.host.bark(() => this.actor.head(), '火路未通！先关西闸再斩东绳，陆某重备油坛！');
          after(1.4, () => {
            if (this.solved) return;
            tg.done = false; tg.mesh.visible = true; tg.ring.visible = true;
            fxRing(V3(tg.x, 0.08, tg.z), 0xffa84c, 1.2, { life: 0.35 } as never);
          });
        } else {
          tg.done = true;
          this.chainPending = true;
          const kegs = (tg.extra?.kegs as Array<{ x: number; z: number; mesh: THREE.Group }>) ?? [];
          kegs.forEach((kg, k) => {
            after(0.22 * (k + 1), () => {
              kg.mesh.visible = false;
              const kp = V3(kg.x, 0.9, kg.z);
              fxEmbers(kp, 22, 6); fxFlare(kp, 0xff7a28, 2.4, 0.55);
              for (let b = 0; b < 10; b++) {
                addBlock(kp.clone(), { size: 0.14, v: V3((Math.random() - 0.5) * 5, 2.5 + Math.random() * 4, (Math.random() - 0.5) * 5), col: b % 2 ? 0xffa838 : 0xff4820, bright: 1.5, life: 0.55, shrink: 0.5, drag: 1.5, grav: 5 });
              }
              cue('boom', 0.95); shake(0.24);
              if (k === kegs.length - 1) after(0.45, () => this.complete());
            });
          });
        }
      }
    }
  }

  private checkLuXunReady() {
    const sluiceDone = this.targets.find(x => x.kind === 'sluice')?.done;
    const ropeDone = this.targets.find(x => x.kind === 'rope')?.done;
    if (sluiceDone && ropeDone) {
      this.host.bark(() => this.actor.head(), '水退桥落、火路已成！快劈开引火油坛！');
      cue('reveal', 0.9);
    } else {
      this.host.bark(() => this.actor.head(), sluiceDone ? '水闸已闭！再去斩断东侧绳桩落桥！' : '油桥已落！再去关闭西侧逆流水闸！');
    }
  }

  private destroyTurret(tg: PropTarget) {
    if (tg.done) return;
    tg.done = true; tg.mesh.visible = false; tg.ring.visible = false;
    const line = tg.extra?.line as THREE.Mesh | undefined;
    if (line) line.visible = false;
    const p = V3(tg.x, 1.3, tg.z);
    fxSparks(p, 0xffe078, 18, 6, { hot: true });
    fxSmoke(p, 0x625a52, 10, { r: 0.7, spd: 1.8, up: 1.2, s: 0.4, life: 0.65 });
    for (let b = 0; b < 8; b++) {
      addBlock(p.clone(), { size: 0.12, v: V3((Math.random() - 0.5) * 4.5, 2.2 + Math.random() * 3.5, (Math.random() - 0.5) * 4.5), col: b % 2 ? 0x6e4e34 : 0xffb848, life: 0.5, shrink: 0.5, drag: 1.6, grav: 7 });
    }
    cue('boom', 0.85); hitstop(0.055); shake(0.2);
    const left = this.targets.filter(x => x.kind === 'turret' && !x.done).length;
    if (left === 0) this.complete();
    else this.host.bark(() => this.actor.head(), left <= 2 ? `漂亮！只剩 ${left} 架暗弩！` : '好箭法！继续清光其余暗弩！');
  }

  private complete() {
    if (this.solved) return;
    this.solved = true;
    for (const b of this.bolts) this.root.remove(b.mesh);
    this.bolts.length = 0;
    for (const l of this.teleLines) l.visible = false;
    cue('win', 0.85);
    this.host.onSolved(this.meta);
  }

  update(dt: number) {
    this.t += dt;
    this.actor.update(dt);
    const hp = this.host.heroPos();
    // Gentle facing toward hero
    this.actor.yaw = Math.atan2(hp.x - this.actor.home.x, hp.z - this.actor.home.z);

    if (!this.active || this.solved) return;

    // 0. 赵云：声纹脉动区分真假井
    if (this.meta.region === 0) {
      const scrambled = this.bannersLeft() > 0;
      for (const tg of this.targets) {
        if (tg.done) continue;
        const mat = tg.ring.material as THREE.MeshBasicMaterial;
        if (tg.kind === 'banner') {
          const u = (this.t * 1.4 + Number(tg.extra?.pulse ?? 0)) % 1;
          tg.ring.scale.setScalar(0.8 + u * 1.0);
          mat.opacity = (1 - u) * 0.88;
        } else {
          const isTrue = !!tg.extra?.isTrue;
          if (scrambled) {
            const u = (this.t * 1.8 + Number(tg.extra?.pulse ?? 0)) % 1;
            mat.color.setHex(0xe04888);
            tg.ring.scale.setScalar(0.95 + u * 0.9);
            mat.opacity = (1 - u) * 0.65;
          } else if (isTrue) {
            const u = (this.t * 0.95) % 1;
            mat.color.setHex(0x76f0ff);
            tg.ring.scale.setScalar(0.95 + u * 1.45);
            mat.opacity = (1 - u) * 0.95;
          } else {
            mat.color.setHex(0x6e444a);
            tg.ring.scale.setScalar(0.95);
            mat.opacity = 0.18;
          }
        }
      }
      return;
    }

    // 1. 吕布：三处铁索按节拍亮起金色共振窗（每 2.6 秒亮 1.15 秒）
    if (this.meta.region === 1) {
      for (const tg of this.targets) {
        if (tg.done || tg.kind !== 'lock') continue;
        const cycle = (this.t + Number(tg.extra?.phase ?? 0)) % 2.6;
        const wasHot = !!tg.extra?.hot;
        const hot = cycle < 1.15;
        if (tg.extra) tg.extra.hot = hot;
        const mat = tg.ring.material as THREE.MeshBasicMaterial;
        if (hot) {
          if (!wasHot) cue('bladeRing', 0.35);
          const u = cycle / 1.15;
          mat.color.setHex(0xffe068);
          tg.ring.scale.setScalar(1.0 + Math.sin(u * Math.PI) * 0.65);
          mat.opacity = 0.85;
          tg.mesh.scale.setScalar(1.06);
        } else {
          mat.color.setHex(0x6e7684);
          tg.ring.scale.setScalar(0.92);
          mat.opacity = 0.28;
          tg.mesh.scale.setScalar(1.0);
        }
      }
      return;
    }

    // 2. 夏侯惇：高台暗弩轮流拉弦放箭，主角可弹箭反毁
    if (this.meta.region === 2) {
      const live = this.targets.filter(tg => tg.kind === 'turret' && !tg.done);
      for (const tg of live) {
        const ang = Math.atan2(hp.x - tg.x, hp.z - tg.z);
        tg.mesh.rotation.y = ang;
        const u = (this.t * 1.1 + Number(tg.extra?.idx ?? 0) * 0.3) % 1;
        tg.ring.scale.setScalar(0.9 + u * 0.6);
        (tg.ring.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.55;
        const ch = Number(tg.extra?.charge ?? 0);
        const line = tg.extra?.line as THREE.Mesh | undefined;
        if (ch > 0 && line) {
          const nextCh = ch - dt;
          if (tg.extra) tg.extra.charge = nextCh;
          const dx = hp.x - tg.x, dz = hp.z - tg.z, len = Math.max(1, Math.hypot(dx, dz));
          line.visible = true;
          line.position.set(tg.x + dx * 0.5, 1.15, tg.z + dz * 0.5);
          line.rotation.y = Math.atan2(dx, dz);
          line.scale.set(1, 1, len);
          (line.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.45 * Math.sin(this.t * 28);
          if (nextCh <= 0) {
            line.visible = false;
            this.fireTurretBolt(tg, hp);
          }
        }
      }
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 && live.length > 0) {
        this.fireTimer = 1.45;
        const pick = live[this.nextTurret % live.length];
        this.nextTurret++;
        if (pick.extra && Number(pick.extra.charge ?? 0) <= 0) {
          pick.extra.charge = 0.65;
          cue('arrow', 0.45);
        }
      }
      // Step active bolts
      for (let i = this.bolts.length - 1; i >= 0; i--) {
        const b = this.bolts[i];
        b.life -= dt;
        b.pos.addScaledVector(b.vel, dt);
        b.mesh.position.copy(b.pos);
        if (b.life <= 0) { this.root.remove(b.mesh); this.bolts.splice(i, 1); continue; }
        if (b.reflected) {
          for (const tg of this.targets) {
            if (tg.done || tg.kind !== 'turret') continue;
            if (Math.hypot(b.pos.x - tg.x, b.pos.z - tg.z) <= tg.r + 0.45) {
              this.root.remove(b.mesh); this.bolts.splice(i, 1);
              this.destroyTurret(tg);
              break;
            }
          }
        } else if (Math.hypot(b.pos.x - hp.x, b.pos.z - hp.z) <= 0.62) {
          this.root.remove(b.mesh); this.bolts.splice(i, 1);
          this.host.hurtHero(8, b.pos.clone());
        }
      }
      return;
    }

    // 3. 陆逊：脉冲提示水闸、绳桩和引火油坛
    if (this.meta.region === 3) {
      const ready = this.targets.filter(x => x.kind === 'sluice' || x.kind === 'rope').every(x => x.done);
      for (const tg of this.targets) {
        if (tg.done) continue;
        const u = (this.t * (tg.kind === 'starter' && ready ? 1.8 : 1.0)) % 1;
        tg.ring.scale.setScalar(0.95 + u * (tg.kind === 'starter' && ready ? 1.25 : 0.75));
        (tg.ring.material as THREE.MeshBasicMaterial).opacity = (1 - u) * (tg.kind === 'starter' && !ready ? 0.32 : 0.9);
      }
    }
  }

  private fireTurretBolt(tg: PropTarget, hp: THREE.Vector3) {
    const start = V3(tg.x, 1.15, tg.z);
    const dir = V3(hp.x - tg.x, 0, hp.z - tg.z).normalize();
    const mesh = makeVoxGroup(w => {
      w.box(0, 0, -5, 0, 0, 4, 0xd8a852);
      w.box(0, 0, 5, 0, 0, 7, 0xff5a38);
      w.box(-1, 0, -5, 1, 0, -4, 0xf4f0e8);
    });
    mesh.position.copy(start);
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    this.root.add(mesh);
    this.bolts.push({ pos: start, vel: dir.multiplyScalar(13.5), turretIdx: Number(tg.extra?.idx ?? 0), reflected: false, mesh, life: 2.2 });
    cue('arrow', 0.85);
  }

  /** Instant debug solve (__dh.solveEvent()) */
  forceSolve() {
    if (this.solved) return;
    for (const tg of this.targets) {
      if (tg.kind !== 'pillar') { tg.done = true; tg.mesh.visible = false; tg.ring.visible = false; }
    }
    this.complete();
  }

  dispose() {
    this.actor.dispose();
    this.root.parent?.remove(this.root);
    this.targets.length = 0;
    this.bolts.length = 0;
    this.teleLines.length = 0;
    this.extraMeshes.length = 0;
  }
}
