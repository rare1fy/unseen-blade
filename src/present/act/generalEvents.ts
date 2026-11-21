// 三国四大名将奇遇试炼系统（act-132，11-21 用户拍板「守 × 斗 × 猎 × 谋」+ Breeze TTS 2 全语音）：
//   参考《燕云十六声》奇遇多样化设计，四位名将立场各异、玩法完全不同，每关专精训练《不见刀》一项核心操作：
//     0 · 第一关 赵云「断后护民」（并肩友军 · 阵地守卫）：护 3 名受伤乡民顶住 3 拍扑犬/冷箭/刀手，练走位拉扯、弹箭救场、穿风截杀
//     1 · 第二关 吕布「三合试锋」（敌对切磋 · 1v1 卸势决斗）：纯单挑 gen_lubu，平砍刮不动重甲，靠藏锋破势/完美闪避/拼刀赢 3 次认可（打输不死）
//     2 · 第三关 夏侯惇「雾巷听弦」（亦敌亦友 · 雾巷反猎）：弹箭反毁 4 架连弩 + 听青白声纹锁雾中真身、飞镖钉针接「追影」破隐 3 次
//     3 · 第四关 陆逊「借风引火」（智谋合作 · 机关破盾）：破除守闸/守桩重盾兵，关西闸 + 断东绳落油桥，劈爆引火油坛连环焚舰
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
import { sayEventVoice } from '../../audio/voice';
import { trimShadows, type Foe } from './enemy';
import { AllyGeneral } from './foes/generals_ai';
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
    eventTitle: '断后护民',
    boardTitle: '赵云奇遇',
    objective: '与赵云并肩护住 3 名乡民，截杀恶犬、弹开冷箭、击退三拍黄巾贼',
    blessingName: '常山枪意',
    blessingDesc: '本局穿风斩与凌空招式伤害 +35%，回气加快',
    intro: [
      { who: 'zhaoyun', text: '常山赵子龙！贼兵四面围村，我正护着乡民退守井台！' },
      { who: 'zhaoyun', text: '姑娘快替我断后——挡住冷箭与恶犬，莫让贼兵冲垮乡民防线！' },
    ],
    outro: [
      { who: 'zhaoyun', text: '乡民安然无恙！姑娘身手敏捷，赵某代父老谢过！' },
      { who: 'zhaoyun', text: '这枚龙胆银穗与一缕枪意赠予姑娘，乱世前路保重！' },
    ],
  },
  {
    region: 1,
    id: 'lubu',
    keepsake: 'lubu',
    name: '温侯 · 吕布',
    eventTitle: '三合试锋',
    boardTitle: '吕布奇遇',
    objective: '1v1 单挑吕布：以藏锋破势、完美闪避或拼刀赢得 3 次试锋认可（平砍难破重甲）',
    blessingName: '无双破势',
    blessingDesc: '本局全招削减架势 +45%，破甲追伤 +25%',
    intro: [
      { who: 'lubu', text: '哼，一个蒙眼盲女，也敢提刀闯本侯的地界？' },
      { who: 'lubu', text: '少废话！接住我三合戟势不退，本侯便认你这把刀！' },
    ],
    outro: [
      { who: 'lubu', text: '哈哈哈哈！好俊的卸势破招！本侯认你这把盲刀了！' },
      { who: 'lubu', text: '这缕赤兔红鬃拿去，再去铸钱场把阎虎那蠢物宰了！' },
    ],
  },
  {
    region: 2,
    id: 'xiahoudun',
    keepsake: 'xiahoudun',
    name: '独眼猛将 · 夏侯惇',
    eventTitle: '雾巷听弦',
    boardTitle: '夏侯惇奇遇',
    objective: '弹箭反毁高台连弩，循青白声纹甩镖钉住雾中真身、按斩「追影」破隐 3 次',
    blessingName: '啖睛孤刃',
    blessingDesc: '本局弹箭与破势反击伤害翻倍，受击后下刀必暴回血',
    intro: [
      { who: 'xiahoudun', text: '雾巷连弩暗伏，曹某左目新伤，偏要试你一试！' },
      { who: 'xiahoudun', text: '我藏身雾影之中——听声甩镖追影破我三回，便算你赢！' },
      { who: 'jiangjin', text: '暗处，归我。' },
    ],
    outro: [
      { who: 'xiahoudun', text: '好俊的听弦追影……你我同在暗处挥刀，曹某服你了。' },
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
    objective: '破盾关西侧水闸、断东侧绳桩落桥，劈爆引火油坛连环焚舰',
    blessingName: '连营火势',
    blessingDesc: '本局击杀敌人触发体素火爆，火油与撞墙伤害翻倍',
    intro: [
      { who: 'luxun', text: '江东陆逊。水闸与油桥皆有重盾曹兵把守，正面硬拼只会吃亏。' },
      { who: 'luxun', text: '姑娘善借地势——破盾关闸、断绳落桥，再劈爆引火油坛连环焚舰！' },
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

export interface EventOutcome {
  won: boolean;
  bonusCoins?: number;
  customOutro?: Array<{ who: string; text: string }>;
}

export interface EventHost {
  heroPos: () => THREE.Vector3;
  hurtHero: (dmg: number, from: THREE.Vector3) => void;
  bark: (at: () => THREE.Vector3, text: string) => void;
  banner: (title: string, sub: string, dur?: number, col?: string) => void;
  pop: (text: string, at: THREE.Vector3, col?: string, accent?: string) => void;
  spawnFoe: (kind: string, x: number, z: number, elite?: boolean) => Foe;
  foes: () => Foe[];
  hitFoe: (f: Foe, dmg: number, from: THREE.Vector3, col: number) => void;
  clamp: (p: THREE.Vector3, r: number) => void;
  addOilJar: (x: number, z: number) => void;
  grantChaseMove: (on: boolean) => void;
  onSolved: (meta: GeneralEventMeta, outcome: EventOutcome) => void;
}

// Square axis-aligned soundwave geometry (横平竖直 3D voxel aesthetic)
const SQ_RING_GEO = (() => {
  const g = new THREE.BufferGeometry(), o = 1, i = 0.84;
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
  const m = new THREE.Mesh(
    SQ_RING_GEO,
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }),
  );
  m.position.set(x, 0.06, z);
  m.scale.set(scale, 1, scale);
  return m;
}

function segDist2(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  if (l2 < 1e-6) return (px - ax) ** 2 + (pz - az) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  const cx = ax + dx * t, cz = az + dz * t;
  return (px - cx) ** 2 + (pz - cz) ** 2;
}

function strikeHits(s: Strike, x: number, z: number, radius: number): boolean {
  if (s.k === 'seg') return segDist2(s.ax, s.az, s.bx, s.bz, x, z) <= (s.r + radius) ** 2;
  if (s.k === 'circle') return (x - s.x) ** 2 + (z - s.z) ** 2 <= (s.r + radius) ** 2;
  const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz);
  if (d > s.range + radius) return false;
  if (d < radius + 0.5) return true;
  let ang = Math.atan2(dx, dz) - s.yaw;
  while (ang > Math.PI) ang -= Math.PI * 2;
  while (ang < -Math.PI) ang += Math.PI * 2;
  return Math.abs(ang) <= s.half + 0.28;
}

function burstVoxels(pos: THREE.Vector3, colA: number, colB: number, count = 14) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const spd = 2.0 + Math.random() * 3.4;
    addBlock(pos.clone().add(V3((Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.7, (Math.random() - 0.5) * 0.5)), {
      size: 0.09 + Math.random() * 0.07,
      v: V3(Math.cos(a) * spd, 2.2 + Math.random() * 2.4, Math.sin(a) * spd),
      col: i % 2 ? colA : colB, bright: 1.4, life: 0.42 + Math.random() * 0.22, shrink: 0.5, drag: 1.5, grav: 7.5,
    });
  }
}

// ------------------------------------------------------------------ 3D Voxel Models for Event Set-Pieces

function buildVillagerModel(variant: number): THREE.Group {
  return makeVoxGroup(w => {
    const coat = variant === 0 ? 0x6b5a46 : variant === 1 ? 0x526470 : 0x745848;
    const cloth = 0xdcd2be;
    // Crouching / sheltered villager silhouette
    w.box(-3, 0, -2, 3, 4, 2, 0x3b322a);
    w.box(-3, 5, -2, 3, 10, 2, coat);
    // White cloth shoulder bandage
    w.box(-3, 8, -2, -1, 10, 2, cloth);
    // Head + bamboo hat or kerchief
    w.box(-2, 11, -2, 2, 14, 2, 0xe2b898);
    if (variant === 1) {
      w.box(-4, 15, -4, 4, 15, 4, 0xc8a45e);
      w.box(-2, 16, -2, 2, 16, 2, 0xd8b66e);
    } else {
      w.box(-2, 15, -2, 2, 15, 2, variant === 0 ? 0x484440 : 0x64483a);
    }
  });
}

function buildRefugeWellModel(): THREE.Group {
  return makeVoxGroup(w => {
    const ST = 0x7a766e, STL = 0x98938a, STD = 0x58544e, WD = 0x4a301e;
    // Low defensive stone wall + well behind the villagers
    w.box(-28, 0, -4, 28, 6, 3, ST);
    w.box(-28, 7, -4, 28, 7, 3, STL);
    w.box(-8, 0, -10, 8, 9, 2, STD);
    w.box(-8, 10, -10, 8, 10, 2, STL);
    w.box(-6, 11, -8, 6, 11, 0, 0x1e2228);
    for (const x of [-7, 6]) w.box(x, 10, -5, x + 1, 23, -4, WD);
    w.box(-9, 24, -7, 9, 25, -2, 0x3a3e46);
  });
}

function buildBrazierPostModel(): THREE.Group {
  return makeVoxGroup(w => {
    w.box(-3, 0, -3, 3, 3, 3, 0x56524e);
    w.box(-2, 4, -2, 2, 14, 2, 0x782820);
    w.box(-4, 15, -4, 4, 17, 4, 0x383438);
    w.box(-3, 18, -3, 3, 19, 3, 0xd09234);
    w.box(-2, 20, -2, 2, 22, 2, 0xff7828);
    w.box(-1, 23, -1, 1, 24, 1, 0xffe478);
  });
}

function buildCrossbowTurretModel(): THREE.Group {
  return makeVoxGroup(w => {
    w.box(-5, 0, -5, 5, 3, 5, 0x5a5652);
    w.box(-4, 4, -4, 4, 15, 4, 0x4a3220);
    w.box(-5, 16, -5, 5, 17, 5, 0x6c4c30);
    w.box(-2, 18, -5, 2, 20, 6, 0x3a2618);
    w.box(-7, 19, 3, 7, 20, 4, 0x7c5838);
    w.box(-1, 21, 0, 1, 21, 6, 0xd8dce4);
    w.box(-2, 18, 5, 2, 20, 6, 0xc89238);
  });
}

function buildFogDecoyModel(): THREE.Group {
  return makeVoxGroup(w => {
    // Dark smoky cloaked warrior silhouette matching Xiahou Dun's stature
    w.box(-4, 0, -3, 4, 7, 3, 0x261e30);
    w.box(-5, 8, -3, 5, 18, 3, 0x342640);
    w.box(-6, 15, -2, 6, 19, 2, 0x463052);
    w.box(-3, 20, -3, 3, 25, 3, 0x2a2034);
    w.box(-3, 22, 3, 3, 23, 3, 0x9c48b8);
    // Smoky blade
    w.box(5, 12, 1, 6, 14, 12, 0x583c6a);
  });
}

function buildBoltModel(): THREE.Group {
  return makeVoxGroup(w => {
    w.box(-1, -1, -5, 0, 0, 5, 0xffe880);
    w.box(-1, -1, 5, 0, 0, 7, 0xff4838);
  });
}

function buildSluiceModel(closed: boolean): THREE.Group {
  return makeVoxGroup(w => {
    w.box(-6, 0, -5, 6, 4, 5, 0x585c62);
    w.box(-5, 5, -2, -3, 18, 2, 0x463020);
    w.box(3, 5, -2, 5, 18, 2, 0x463020);
    w.box(-6, 17, -2, 6, 19, 2, 0x66462c);
    const gy = closed ? 4 : 11;
    w.box(-3, gy, -1, 3, gy + 7, 1, 0x3c4452);
    w.box(-2, 19, -2, 2, 21, 2, closed ? 0x62e898 : 0x58c4f8);
  });
}

function buildWaterStreamModel(): THREE.Group {
  return makeVoxGroup(w => {
    w.box(-18, 0, -6, 18, 2, 6, 0x3684c8);
    w.box(-18, 3, -5, 18, 3, 5, 0x68bcf8);
  });
}

function buildRopePostModel(cut: boolean): THREE.Group {
  return makeVoxGroup(w => {
    w.box(-3, 0, -3, 3, 15, 3, 0x523622);
    if (!cut) {
      w.box(-4, 10, -4, 4, 13, 4, 0xd8b262);
      w.box(-1, 14, -4, 1, 24, -2, 0xd8b262);
    } else {
      w.box(-4, 10, -4, 4, 11, 4, 0x866838);
    }
  });
}

function buildPowderKegModel(starter: boolean): THREE.Group {
  return makeVoxGroup(w => {
    const body = starter ? 0xd23828 : 0xa62c22;
    w.box(-4, 0, -4, 4, 10, 4, body);
    w.box(-4, 4, -4, 4, 5, 4, 0xe8b842);
    w.box(-3, 11, -3, 3, 12, 3, starter ? 0xffd054 : 0xd8a238);
  });
}

function buildWarshipProwModel(): THREE.Group {
  return makeVoxGroup(w => {
    w.box(-16, 0, -8, 16, 10, 8, 0x483020);
    w.box(-14, 11, -6, 14, 13, 6, 0x64442c);
    w.box(-2, 14, -2, 2, 34, 2, 0x3e281a);
    w.box(-10, 20, -1, 10, 30, 0, 0x9c2420);
    w.box(-8, 22, 0, 8, 28, 1, 0xb83028);
  });
}

// ------------------------------------------------------------------ Event Runner

const FOG_SPOTS: Array<[number, number]> = [
  [-4.2, -2.0], [4.2, -2.0], [0, -4.4],
  [-3.8, 2.0], [3.8, 2.0], [0, 2.4],
];

export class GeneralEventRunner {
  readonly meta: GeneralEventMeta;
  readonly root = new THREE.Group();
  readonly actor: BattleActor;
  private host: EventHost;
  private active = false;
  private solved = false;
  private t = 0;

  // Shared pulse rings
  private rings: Array<{ m: THREE.Mesh; base: number; speed: number; phase: number; on: boolean }> = [];

  // Act 0 · 赵云「断后护民」 (Defense)
  private zhaoAlly: AllyGeneral | null = null;
  private villagers: Array<{ x: number; z: number; hp: number; maxHp: number; alive: boolean; mesh: THREE.Group; bar: THREE.Mesh; hurtCd: number }> = [];
  private defWave = 0;
  private defWaveWait = 0;
  private defFoes: Foe[] = [];

  // Act 1 · 吕布「三合试锋」 (1v1 Parry/Dodge Duel)
  private lubuFoe: Foe | null = null;
  private duelScore = 0;
  private duelArmorHits = 0;
  private duelArmorWarned = false;
  private duelScoreCd = 0;

  // Act 2 · 夏侯惇「雾巷听弦」 (Fog Dart-Chase + Crossbow Deflect)
  private turrets: Array<{ x: number; z: number; alive: boolean; cd: number; mesh: THREE.Group; ring: THREE.Mesh }> = [];
  private bolts: EventBolt[] = [];
  private fogFoe: Foe | null = null;
  private fogDecoys: Array<{ x: number; z: number; alive: boolean; mesh: THREE.Group; ring: THREE.Mesh }> = [];
  private fogTrueRing: THREE.Mesh | null = null;
  private fogExposeCount = 0;
  private fogShiftT = 0;
  private fogStunT = 0;

  // Act 3 · 陆逊「借风引火」 (Mechanism + Shield Guards)
  private sluiceHits = 0;
  private sluiceClosed = false;
  private sluiceMesh: THREE.Group | null = null;
  private streamMesh: THREE.Group | null = null;
  private ropeCut = false;
  private ropeMesh: THREE.Group | null = null;
  private bridgeOilMesh: THREE.Group | null = null;
  private kegs: Array<{ x: number; z: number; starter: boolean; alive: boolean; mesh: THREE.Group; ring: THREE.Mesh }> = [];
  private ships: THREE.Group[] = [];
  private luxunGuards: Foe[] = [];
  private chainActive = false;

  constructor(parent: THREE.Group, regionIdx: number, host: EventHost) {
    this.meta = GENERAL_EVENTS[Math.max(0, Math.min(GENERAL_EVENTS.length - 1, regionIdx))];
    this.host = host;
    parent.add(this.root);

    const modelKey = 'gen_' + this.meta.id;
    const def = ROSTER.find(m => m.id === modelKey);
    if (!def) throw new Error('missing general model: ' + modelKey);
    this.actor = new BattleActor(def);
    trimShadows(this.actor.root, 4);
    const gx = this.meta.id === 'luxun' ? 3.8 : 0;
    const gz = this.meta.id === 'zhaoyun' ? -3.2 : this.meta.id === 'luxun' ? 2.6 : -4.6;
    this.actor.place(V3(gx, 0, gz), 0);
    this.root.add(this.actor.root);

    if (this.meta.id === 'zhaoyun') this.buildZhaoYun();
    else if (this.meta.id === 'lubu') this.buildLuBu();
    else if (this.meta.id === 'xiahoudun') this.buildXiahouDun();
    else this.buildLuXun();
  }

  private addRing(col: number, x: number, z: number, scale: number, speed = 2.4, phase = 0): THREE.Mesh {
    const m = makeSqRing(col, x, z, scale);
    this.root.add(m);
    this.rings.push({ m, base: scale, speed, phase, on: true });
    return m;
  }

  private setRing(m: THREE.Mesh, on: boolean, col?: number) {
    const r = this.rings.find(x => x.m === m);
    if (r) r.on = on;
    m.visible = on;
    if (col !== undefined) (m.material as THREE.MeshBasicMaterial).color.setHex(col);
  }

  private buildZhaoYun() {
    const refuge = buildRefugeWellModel();
    refuge.position.set(0, 0, -6.2);
    this.root.add(refuge);
    // Defensive perimeter square around the 3 sheltered villagers
    this.addRing(0x70e8c8, 0, -4.9, 3.3, 1.8, 0);
    const xs = [-2.2, 0, 2.2];
    xs.forEach((x, i) => {
      const z = -5.1;
      const mesh = buildVillagerModel(i);
      mesh.position.set(x, 0, z);
      this.root.add(mesh);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.11, 0.11),
        new THREE.MeshBasicMaterial({ color: 0x62e898 }),
      );
      bar.position.set(x, 1.75, z);
      this.root.add(bar);
      this.villagers.push({ x, z, hp: 100, maxHp: 100, alive: true, mesh, bar, hurtCd: 0 });
    });
  }

  private buildLuBu() {
    // 4 blazing bronze brazier posts framing the 1v1 Trial Arena
    for (const [x, z] of [[-5.4, -4.8], [5.4, -4.8], [-5.4, 3.8], [5.4, 3.8]] as const) {
      const p = buildBrazierPostModel();
      p.position.set(x, 0, z);
      this.root.add(p);
    }
    this.addRing(0xffc848, 0, -0.5, 4.8, 1.6, 0);
  }

  private buildXiahouDun() {
    const coords: Array<[number, number]> = [
      [-6.0, -3.6], [6.0, -3.6],
      [-6.0, 3.0], [6.0, 3.0],
    ];
    coords.forEach(([x, z], i) => {
      const mesh = buildCrossbowTurretModel();
      mesh.position.set(x, 0, z);
      mesh.rotation.y = Math.atan2(-x, -z);
      this.root.add(mesh);
      const ring = this.addRing(0xff5242, x, z, 1.05, 3.0, i * 0.9);
      this.turrets.push({ x, z, alive: true, cd: 1.8 + i * 0.85, mesh, ring });
    });
  }

  private buildLuXun() {
    for (const sx of [-2.8, 2.8]) {
      const ship = buildWarshipProwModel();
      ship.position.set(sx, 0, -6.6);
      this.root.add(ship);
      this.ships.push(ship);
    }
    this.sluiceMesh = buildSluiceModel(false);
    this.sluiceMesh.position.set(-5.2, 0, -1.2);
    this.root.add(this.sluiceMesh);
    this.addRing(0x58c4f8, -5.2, -1.2, 1.25, 2.8, 0);

    this.streamMesh = buildWaterStreamModel();
    this.streamMesh.position.set(0, 0.02, -1.2);
    this.root.add(this.streamMesh);

    this.ropeMesh = buildRopePostModel(false);
    this.ropeMesh.position.set(5.2, 0, -1.2);
    this.root.add(this.ropeMesh);
    this.addRing(0x70e8c8, 5.2, -1.2, 1.15, 2.8, 1.4);

    this.bridgeOilMesh = buildPowderKegModel(false);
    this.bridgeOilMesh.position.set(0, 2.9, -4.4);
    this.root.add(this.bridgeOilMesh);

    const kpts: Array<[number, number, boolean]> = [
      [0, 2.2, true],
      [0, 0.2, false],
      [0, -2.6, false],
      [-1.8, -5.0, false],
      [1.8, -5.0, false],
    ];
    kpts.forEach(([x, z, starter], i) => {
      const mesh = buildPowderKegModel(starter);
      mesh.position.set(x, 0, z);
      this.root.add(mesh);
      const ring = this.addRing(starter ? 0xffd054 : 0xff6232, x, z, starter ? 1.15 : 0.72, starter ? 3.2 : 1.8, i * 0.6);
      if (!starter) this.setRing(ring, false);
      this.kegs.push({ x, z, starter, alive: true, mesh, ring });
    });
  }

  /** Activate the trial right after the intro cutscene & voiced dialogue finish */
  begin() {
    this.active = true;
    this.host.banner(this.meta.eventTitle, this.meta.objective, 3.2, '#ffd868');

    if (this.meta.id === 'zhaoyun') {
      this.actor.root.visible = false;
      this.zhaoAlly = new AllyGeneral('zhaoyun', V3(0, 0, -3.2), 0);
      this.defWave = 0;
      this.spawnZhaoWave(1);
    } else if (this.meta.id === 'lubu') {
      this.actor.root.visible = false;
      this.lubuFoe = this.host.spawnFoe('gen_lubu', 0, -4.2, false);
      this.lubuFoe.st = 'move';
      this.duelScore = 0;
      this.host.pop('藏锋破势 / 完美闪避 0/3', V3(0, 2.2, -4.2), '#ffe082', '#ff8832');
    } else if (this.meta.id === 'xiahoudun') {
      this.actor.root.visible = false;
      this.host.grantChaseMove(true);
      this.fogFoe = this.host.spawnFoe('gen_xiahoudun', 0, -4.4, false);
      this.fogExposeCount = 0;
      this.shuffleFogPositions();
    } else if (this.meta.id === 'luxun') {
      // Spawn 2 shielded Cao heavy guards defending the west sluice & east rope post + 2 tactical oil jars nearby
      const gW = this.host.spawnFoe('wl_shield', -4.2, 0.4, false); gW.st = 'move';
      const gE = this.host.spawnFoe('wl_shield', 4.2, 0.4, false); gE.st = 'move';
      this.luxunGuards = [gW, gE];
      this.host.addOilJar(-5.5, 1.8);
      this.host.addOilJar(5.5, 1.8);
    }
  }

  private spawnZhaoWave(n: number) {
    this.defWave = n;
    this.defFoes = [];
    if (n === 1) {
      this.defFoes.push(
        this.host.spawnFoe('hj_hound', -5.4, 2.2, false),
        this.host.spawnFoe('hj_hound', 5.4, 2.2, false),
        this.host.spawnFoe('hj_blade', 0, 4.4, false),
      );
      this.zhaoBark('恶犬扑向乡民了，穿风截住！', 'ev1_bark_dog');
    } else if (n === 2) {
      this.defFoes.push(
        this.host.spawnFoe('hj_archer', -5.8, -0.2, false),
        this.host.spawnFoe('hj_archer', 5.8, -0.2, false),
        this.host.spawnFoe('hj_blade', -2.4, 4.4, false),
        this.host.spawnFoe('hj_blade', 2.4, 4.4, false),
      );
      this.zhaoBark('冷箭来了，挥刀弹开！', 'ev1_bark_arrow');
    } else {
      this.defFoes.push(
        this.host.spawnFoe('hj_blade', 0, 4.6, true),
        this.host.spawnFoe('hj_hound', -5.2, 1.6, false),
        this.host.spawnFoe('hj_hound', 5.2, 1.6, false),
        this.host.spawnFoe('hj_archer', 0, 5.8, false),
      );
      this.zhaoBark('贼兵压上来了，顶住！', 'ev1_bark_wave');
    }
    for (const f of this.defFoes) f.st = 'move';
  }

  private zhaoBark(text: string, voiceId: string) {
    const at = () => this.zhaoAlly ? this.zhaoAlly.a.head() : this.actor.head();
    this.host.bark(at, text);
    sayEventVoice('zhaoyun', voiceId);
  }

  // ------------------------------------------------------------------ Xiahou Dun Fog Stealth helpers
  private clearFogDecoys() {
    for (const d of this.fogDecoys) {
      this.root.remove(d.mesh);
      this.root.remove(d.ring);
      this.rings = this.rings.filter(r => r.m !== d.ring);
    }
    this.fogDecoys = [];
    if (this.fogTrueRing) {
      this.root.remove(this.fogTrueRing);
      this.rings = this.rings.filter(r => r.m !== this.fogTrueRing);
      this.fogTrueRing = null;
    }
  }

  private shuffleFogPositions() {
    if (!this.fogFoe) return;
    this.clearFogDecoys();
    const hp = this.host.heroPos();
    // Pick 3 spots not right on top of the hero
    const pool = [...FOG_SPOTS].sort((a, b) => Math.hypot(b[0] - hp.x, b[1] - hp.z) - Math.hypot(a[0] - hp.x, a[1] - hp.z));
    const chosen = pool.slice(0, 4).sort(() => Math.random() - 0.5).slice(0, 3);
    const [tx, tz] = chosen[0];
    this.fogFoe.pos.set(tx, 0, tz);
    this.fogFoe.vel.set(0, 0, 0);
    this.fogFoe.st = 'stagger';
    this.fogFoe.t = 0;
    this.fogFoe.dur = 99;
    this.fogFoe.cd = 99;
    this.fogFoe.a.place(this.fogFoe.pos, Math.atan2(hp.x - tx, hp.z - tz));
    fxSmoke(V3(tx, 0.8, tz), 0x82e8ff, 12, { r: 0.7, spd: 1.4, up: 0.9, s: 0.45, life: 0.55 });
    // True Xiahou Dun emits bright cyan blind-listening square ring!
    this.fogTrueRing = this.addRing(0x82f2ff, tx, tz, 1.35, 3.6, 0);

    for (let i = 1; i < chosen.length; i++) {
      const [dx, dz] = chosen[i];
      const mesh = buildFogDecoyModel();
      mesh.position.set(dx, 0, dz);
      mesh.rotation.y = Math.atan2(hp.x - dx, hp.z - dz);
      this.root.add(mesh);
      fxSmoke(V3(dx, 0.8, dz), 0x482c62, 10, { r: 0.65, spd: 1.2, up: 0.8, s: 0.42, life: 0.5 });
      const ring = this.addRing(0x8a3898, dx, dz, 1.05, 1.9, i * 1.1);
      this.fogDecoys.push({ x: dx, z: dz, alive: true, mesh, ring });
    }
    this.fogShiftT = 7.5;
  }

  private exposeXiahouDun(viaChase: boolean) {
    if (!this.active || this.solved || this.meta.id !== 'xiahoudun' || !this.fogFoe || this.fogStunT > 0) return;
    this.fogExposeCount++;
    this.fogStunT = 1.05;
    const pos = this.fogFoe.pos.clone();
    hitstop(viaChase ? 0.14 : 0.09);
    shake(viaChase ? 0.34 : 0.22);
    cue('parry', 0.95);
    cue('bladeRing', 0.9);
    fxRing(pos.clone().setY(0.9), 0x82f2ff, 2.6, { life: 0.45 } as never);
    burstVoxels(pos, 0x82f2ff, 0xffd878, 16);
    this.host.pop(
      viaChase ? `追影破隐！${this.fogExposeCount}/3` : `破隐！${this.fogExposeCount}/3`,
      pos.clone().add(V3(0, 1.9, 0)),
      '#b8f4ff', '#ffd868',
    );
    this.host.bark(() => this.fogFoe!.a.head(), '好利落的追影！竟真听出我藏在哪！');
    sayEventVoice('xiahoudun', 'ev3_bark_expose');
    this.fogFoe.dartMarkT = 0;

    if (this.fogExposeCount >= 3) {
      this.clearFogDecoys();
      for (const tu of this.turrets) if (tu.alive) {
        tu.alive = false;
        this.root.remove(tu.mesh);
        this.setRing(tu.ring, false);
        burstVoxels(V3(tu.x, 1.0, tu.z), 0xd8a852, 0x624832, 10);
      }
      this.clearBolts();
      this.complete({ won: true });
    } else {
      after(0.85, () => {
        if (!this.solved && this.active && this.meta.id === 'xiahoudun') {
          this.fogStunT = 0;
          this.shuffleFogPositions();
        }
      });
    }
  }

  // ------------------------------------------------------------------ Hooks called by show.ts

  /** True if `f` is our Act 2 Lu Bu duel foe (reduces mindless light-attack HP spam) */
  isDuelFoe(f: Foe): boolean {
    return this.active && !this.solved && this.meta.id === 'lubu' && this.lubuFoe === f;
  }

  /** True if `f` is our Act 3 Xiahou Dun fog foe (never dies; hit/chase breaks stealth!) */
  isFogFoe(f: Foe): boolean {
    return this.active && !this.solved && this.meta.id === 'xiahoudun' && this.fogFoe === f;
  }

  /** Called when hero lands a normal melee hit on an event foe */
  onFoeHit(f: Foe, kind: string) {
    if (!this.active || this.solved) return;
    if (this.isDuelFoe(f)) {
      if (kind !== 'parry' && kind !== 'counter' && kind !== 'chase') {
        this.duelArmorHits++;
        if (this.duelArmorHits >= 2 && !this.duelArmorWarned) {
          this.duelArmorWarned = true;
          this.host.bark(() => f.a.head(), '光靠平砍可破不了本侯重甲！藏锋破势试试！');
          sayEventVoice('lubu', 'ev2_bark_armor');
          this.host.pop('请用藏锋破势 / 完美闪避！', f.pos.clone().add(V3(0, 2.2, 0)), '#ffd868', '#ff5a38');
        }
      }
      if (kind === 'counter') this.scoreLuBuDuel('回锋反击');
    } else if (this.isFogFoe(f)) {
      if (kind === 'dart') {
        // Dart sticks in true Xiahou Dun -> immediately highlight Chase prompt!
        f.dartMarkT = 3.2;
        fxRing(f.pos.clone().setY(1.0), 0x9ad8ff, 1.8, { life: 0.5 } as never);
        this.host.pop('影针锁真！按斩追影！', f.pos.clone().add(V3(0, 2.1, 0)), '#a8e8ff', '#62b8ff');
      } else {
        this.exposeXiahouDun(kind === 'chase');
      }
    }
  }

  /** Called when hero performs 追影 blink-strike on a foe */
  onHeroChase(f: Foe) {
    if (this.isFogFoe(f)) this.exposeXiahouDun(true);
  }

  /** Called when hero parries (藏锋破势) */
  onHeroParry(attacker: Foe | null) {
    if (!this.active || this.solved) return;
    if (this.meta.id === 'lubu' && (!attacker || attacker === this.lubuFoe)) {
      this.scoreLuBuDuel('卸势破招');
    }
  }

  /** Called when hero triggers Perfect Dodge */
  onHeroPerfectDodge() {
    if (!this.active || this.solved) return;
    if (this.meta.id === 'lubu') this.scoreLuBuDuel('身法闪避');
  }

  /** Called when hero wins a Clash QTE */
  onHeroClashWin() {
    if (!this.active || this.solved) return;
    if (this.meta.id === 'lubu') this.scoreLuBuDuel('拼刀胜出');
  }

  /** Called when hero breaks a foe's poise */
  onFoePoiseBreak(f: Foe) {
    if (!this.active || this.solved) return;
    if (this.isDuelFoe(f)) this.scoreLuBuDuel('破甲重创');
  }

  private scoreLuBuDuel(reason: string) {
    if (!this.lubuFoe || this.solved || this.duelScoreCd > 0) return;
    this.duelScoreCd = 0.65;
    this.duelScore++;
    const p = this.lubuFoe.pos.clone();
    this.lubuFoe.poise = Math.max(0, this.lubuFoe.poise - Math.round((this.lubuFoe.d.poise || 58) * 0.38));
    fxRing(p.clone().setY(1.0), 0xffe078, 2.4, { life: 0.42 } as never);
    this.host.pop(`${reason} · 认可 ${this.duelScore}/3`, p.clone().add(V3(0, 2.2, 0)), '#fff0a0', '#ff9838');
    if (this.duelScore >= 3) {
      this.complete({ won: true });
    } else {
      this.host.bark(() => this.lubuFoe!.a.head(), '好胆！再来一合！');
      sayEventVoice('lubu', 'ev2_bark_parry');
    }
  }

  /** Called right before hero would die — returns true if trial intercepts lethality (Act 2 Lu Bu) */
  onHeroWouldDie(): boolean {
    if (!this.active || this.solved || this.meta.id !== 'lubu') return false;
    this.complete({
      won: false,
      customOutro: [{ who: 'lubu', text: '火候还差三分！留你一命，练好破势再来见本侯！' }],
    });
    return true;
  }

  /** Called by show.ts when any foe dies inside an event room */
  onFoeKilled(f: Foe) {
    if (!this.active || this.solved) return;
    if (this.meta.id === 'zhaoyun') {
      const alive = this.defFoes.filter(x => x.st !== 'dead').length;
      if (alive === 0) {
        if (this.defWave < 3) {
          this.defWaveWait = 1.05;
        } else {
          const saved = this.villagers.filter(v => v.alive).length;
          this.complete({
            won: saved > 0,
            bonusCoins: saved === 3 ? 60 : 0,
            customOutro: saved === 0 ? [{ who: 'zhaoyun', text: '乡民皆受重伤……所幸贼兵已退，前路还请多加小心。' }] : undefined,
          });
        }
      }
    }
  }

  /** Provide targetable world coordinates for darts / auto-aim */
  aimTargets(): Array<{ x: number; z: number; r: number }> {
    if (!this.active || this.solved) return [];
    const out: Array<{ x: number; z: number; r: number }> = [];
    if (this.meta.id === 'xiahoudun') {
      for (const tu of this.turrets) if (tu.alive) out.push({ x: tu.x, z: tu.z, r: 0.9 });
      for (const d of this.fogDecoys) if (d.alive) out.push({ x: d.x, z: d.z, r: 0.7 });
    } else if (this.meta.id === 'luxun') {
      if (!this.sluiceClosed) out.push({ x: -5.2, z: -1.2, r: 0.9 });
      if (!this.ropeCut) out.push({ x: 5.2, z: -1.2, r: 0.85 });
      const starter = this.kegs.find(k => k.starter && k.alive);
      if (starter) out.push({ x: starter.x, z: starter.z, r: 0.85 });
    }
    return out;
  }

  /** Process dart projectile collision against puzzle set-pieces */
  hitByDart(x: number, z: number, r = 0.55): boolean {
    return this.strike({ k: 'circle', x, z, r });
  }

  /** Process player melee swing, dash-cut, or dart hit against puzzle set-pieces */
  strike(s: Strike): boolean {
    if (!this.active || this.solved) return false;
    let hit = false;

    if (this.meta.id === 'xiahoudun') {
      for (const tu of this.turrets) {
        if (!tu.alive || !strikeHits(s, tu.x, tu.z, 0.95)) continue;
        this.destroyTurret(tu);
        hit = true;
      }
      for (const d of this.fogDecoys) {
        if (!d.alive || !strikeHits(s, d.x, d.z, 0.85)) continue;
        d.alive = false;
        this.root.remove(d.mesh);
        this.setRing(d.ring, false);
        fxSmoke(V3(d.x, 0.9, d.z), 0x6a3288, 14, { r: 0.8, spd: 1.5, up: 1.0, s: 0.5, life: 0.6 });
        cue('swish', 0.85);
        this.host.bark(() => (this.fogFoe ? this.fogFoe.a.head() : this.actor.head()), '斩空了！那是假影，听清青白声纹！');
        sayEventVoice('xiahoudun', 'ev3_bark_decoy');
        hit = true;
      }
    } else if (this.meta.id === 'luxun') {
      if (!this.sluiceClosed && strikeHits(s, -5.2, -1.2, 1.05)) {
        this.sluiceHits++;
        cue('hitHeavy', 0.85); shake(0.16);
        burstVoxels(V3(-5.2, 1.0, -1.2), 0x58c4f8, 0x98a4b2, 10);
        if (this.sluiceHits >= 2) {
          this.sluiceClosed = true;
          if (this.sluiceMesh) this.root.remove(this.sluiceMesh);
          this.sluiceMesh = buildSluiceModel(true);
          this.sluiceMesh.position.set(-5.2, 0, -1.2);
          this.root.add(this.sluiceMesh);
          if (this.streamMesh) { this.root.remove(this.streamMesh); this.streamMesh = null; }
          fxSmoke(V3(0, 0.4, -1.2), 0x8cd4f8, 16, { r: 1.8, spd: 1.4, up: 1.0, s: 0.5, life: 0.7 });
          this.checkLuXunReady();
        }
        hit = true;
      }
      if (!this.ropeCut && strikeHits(s, 5.2, -1.2, 0.95)) {
        this.ropeCut = true;
        cue('bladeRing', 0.9); shake(0.18);
        if (this.ropeMesh) this.root.remove(this.ropeMesh);
        this.ropeMesh = buildRopePostModel(true);
        this.ropeMesh.position.set(5.2, 0, -1.2);
        this.root.add(this.ropeMesh);
        burstVoxels(V3(5.2, 1.1, -1.2), 0xe8c468, 0x6c4830, 12);
        if (this.bridgeOilMesh) {
          this.bridgeOilMesh.position.set(0, 0, -4.4);
          shake(0.24);
          fxRing(V3(0, 0.08, -4.4), 0xffb848, 2.0, { life: 0.45 } as never);
        }
        this.checkLuXunReady();
        hit = true;
      }
      const starter = this.kegs.find(k => k.starter && k.alive);
      if (starter && strikeHits(s, starter.x, starter.z, 0.95)) {
        if (!this.sluiceClosed || !this.ropeCut) {
          cue('hitHeavy', 0.75);
          fxEmbers(V3(starter.x, 0.6, starter.z), 12);
          this.host.bark(() => this.actor.head(), '火路未通！先关西闸再斩东绳，陆某重备油坛！');
        } else if (!this.chainActive) {
          this.triggerLuXunChain();
        }
        hit = true;
      }
    }
    return hit;
  }

  private checkLuXunReady() {
    if (this.sluiceClosed && this.ropeCut) {
      this.host.bark(() => this.actor.head(), '水退桥落、火路已成！快劈开引火油坛！');
      sayEventVoice('luxun', 'ev4_bark_ready');
      cue('exitChime', 0.85);
    } else {
      this.host.bark(() => this.actor.head(), this.sluiceClosed ? '水闸已闭！再去斩断东侧绳桩落桥！' : '油桥已落！再去关闭西侧逆流水闸！');
    }
  }

  private triggerLuXunChain() {
    this.chainActive = true;
    // Also blast any surviving shield guards caught in the inferno!
    const blow = (idx: number) => {
      if (idx >= this.kegs.length) {
        if (this.bridgeOilMesh) { this.root.remove(this.bridgeOilMesh); this.bridgeOilMesh = null; }
        for (const ship of this.ships) {
          const sp = ship.position.clone();
          fxFlare(sp.clone().add(V3(0, 1.4, 0)), 0xff7824, 3.8, { life: 0.75 } as never);
          fxEmbers(sp.clone().add(V3(0, 1.2, 0)), 28);
          burstVoxels(sp.clone().add(V3(0, 1.0, 0)), 0xff5a20, 0x3a281c, 22);
          this.root.remove(ship);
        }
        this.ships = [];
        for (const g of this.luxunGuards) if (g.st !== 'dead') this.host.hitFoe(g, 999, V3(0, 0, -2), 0xff6820);
        hitstop(0.16); shake(0.55); cue('boom', 1); cue('win', 0.7);
        after(0.55, () => this.complete({ won: true }));
        return;
      }
      const k = this.kegs[idx];
      if (k.alive) {
        k.alive = false;
        this.root.remove(k.mesh);
        this.setRing(k.ring, false);
        const p = V3(k.x, 0.5, k.z);
        fxFlare(p, 0xff8828, 2.4, { life: 0.55 } as never);
        fxEmbers(p, 16);
        burstVoxels(p, 0xff7224, 0xffe068, 14);
        cue('boom', 0.85);
        shake(0.24);
      }
      after(0.18, () => blow(idx + 1));
    };
    blow(0);
  }

  /** Deflect crossbow bolts back into their turrets during Act 3 Xiahou Dun trial */
  deflectBolts(heroPos: THREE.Vector3, heroYaw: number, range = 2.6, wide = false): boolean {
    if (!this.active || this.solved || this.meta.id !== 'xiahoudun') return false;
    let reflected = false;
    for (const b of this.bolts) {
      if (b.reflected) continue;
      const d = Math.hypot(b.pos.x - heroPos.x, b.pos.z - heroPos.z);
      if (d > range) continue;
      if (!wide) {
        let ang = Math.atan2(b.pos.x - heroPos.x, b.pos.z - heroPos.z) - heroYaw;
        while (ang > Math.PI) ang -= Math.PI * 2;
        while (ang < -Math.PI) ang += Math.PI * 2;
        if (Math.abs(ang) > 1.35) continue;
      }
      b.reflected = true;
      const tu = this.turrets[b.turretIdx];
      if (tu && tu.alive) {
        const dx = tu.x - b.pos.x, dz = tu.z - b.pos.z, l = Math.max(0.01, Math.hypot(dx, dz));
        b.vel.set((dx / l) * 19, 0, (dz / l) * 19);
        b.mesh.rotation.y = Math.atan2(b.vel.x, b.vel.z);
      } else {
        b.vel.multiplyScalar(-1.6);
      }
      b.life = 1.6;
      hitstop(0.08); shake(0.22); cue('parry', 0.95);
      fxSparks(b.pos.clone(), 0xffe898, 14, 5.5, { hot: true });
      reflected = true;
    }
    return reflected;
  }

  private destroyTurret(tu: { x: number; z: number; alive: boolean; mesh: THREE.Group; ring: THREE.Mesh }) {
    if (!tu.alive) return;
    tu.alive = false;
    this.root.remove(tu.mesh);
    this.setRing(tu.ring, false);
    const p = V3(tu.x, 1.1, tu.z);
    burstVoxels(p, 0xffd068, 0x624630, 16);
    fxRing(V3(tu.x, 0.08, tu.z), 0xffb848, 2.0, { life: 0.45 } as never);
    hitstop(0.08); shake(0.25); cue('boom', 0.72);
    this.host.pop('破弩！', p.clone().add(V3(0, 0.8, 0)), '#ffe082', '#ff8832');
  }

  /** Debug instant-solve helper (`__dh.solveEvent()`) */
  forceSolve() {
    if (this.solved) return;
    this.active = true;
    if (this.meta.id === 'luxun' && !this.chainActive) {
      this.sluiceClosed = true;
      this.ropeCut = true;
      if (this.streamMesh) { this.root.remove(this.streamMesh); this.streamMesh = null; }
      this.triggerLuXunChain();
      return;
    }
    this.complete({ won: true });
  }

  private complete(outcome: EventOutcome) {
    if (this.solved) return;
    this.solved = true;
    this.active = false;
    this.clearBolts();
    this.clearFogDecoys();
    if (this.meta.id === 'xiahoudun') this.host.grantChaseMove(false);

    // Restore clean cutscene actor at general's final position for outro salute/dialogue
    if (this.zhaoAlly) {
      this.actor.place(this.zhaoAlly.pos.clone(), 0);
      this.zhaoAlly.dispose();
      this.zhaoAlly = null;
      this.actor.root.visible = true;
    }
    if (this.lubuFoe) {
      this.actor.place(this.lubuFoe.pos.clone(), Math.atan2(this.host.heroPos().x - this.lubuFoe.pos.x, this.host.heroPos().z - this.lubuFoe.pos.z));
      this.lubuFoe.st = 'dead';
      this.lubuFoe.a.root.visible = false;
      this.actor.root.visible = true;
    }
    if (this.fogFoe) {
      this.actor.place(this.fogFoe.pos.clone(), Math.atan2(this.host.heroPos().x - this.fogFoe.pos.x, this.host.heroPos().z - this.fogFoe.pos.z));
      this.fogFoe.st = 'dead';
      this.fogFoe.a.root.visible = false;
      this.actor.root.visible = true;
    }
    for (const f of [...this.defFoes, ...this.luxunGuards]) {
      if (f.st !== 'dead') { f.st = 'dead'; f.a.root.visible = false; }
    }
    for (const r of this.rings) { r.on = false; r.m.visible = false; }

    hitstop(0.12);
    cue(outcome.won ? 'win' : 'parry', 0.8);
    this.host.onSolved(this.meta, outcome);
  }

  update(dt: number) {
    this.t += dt;
    if (this.duelScoreCd > 0) this.duelScoreCd = Math.max(0, this.duelScoreCd - dt);
    const hp = this.host.heroPos();
    if (this.actor.root.visible) {
      this.actor.yaw = Math.atan2(hp.x - this.actor.home.x, hp.z - this.actor.home.z);
      this.actor.update(dt);
    }

    // Pulse all active square soundwave rings
    for (const r of this.rings) {
      if (!r.on) continue;
      const p = 0.5 + 0.5 * Math.sin(this.t * r.speed + r.phase);
      const s = r.base * (0.94 + p * 0.16);
      r.m.scale.set(s, 1, s);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.35 + p * 0.52;
    }

    if (!this.active || this.solved) return;

    // Act 0 · 赵云「断后护民」
    if (this.meta.id === 'zhaoyun') {
      if (this.zhaoAlly) {
        this.zhaoAlly.update(dt, {
          foes: this.host.foes(),
          heroPos: hp,
          clamp: (p, r) => this.host.clamp(p, r),
          hitFoe: (f, dmg, from, col) => this.host.hitFoe(f, dmg, from, col),
          say: (head, line) => this.host.bark(head, line),
        });
      }
      if (this.defWaveWait > 0) {
        this.defWaveWait -= dt;
        if (this.defWaveWait <= 0) this.spawnZhaoWave(this.defWave + 1);
      }
      // Check enemy threats to sheltered villagers
      const liveFoes = this.defFoes.filter(f => f.st !== 'dead');
      for (const v of this.villagers) {
        if (!v.alive) continue;
        if (v.hurtCd > 0) v.hurtCd -= dt;
        for (const f of liveFoes) {
          const d = Math.hypot(f.pos.x - v.x, f.pos.z - v.z);
          // Gently steer un-engaged hounds/blades toward the villagers if they're closer to villagers than hero
          if (d < 4.5 && d < f.pos.distanceTo(hp) && f.st === 'move') {
            const dx = v.x - f.pos.x, dz = v.z - f.pos.z, l = Math.max(0.01, Math.hypot(dx, dz));
            f.pos.x += (dx / l) * 0.9 * dt;
            f.pos.z += (dz / l) * 0.9 * dt;
          }
          if (d < 1.55 && v.hurtCd <= 0) {
            v.hurtCd = 1.25;
            v.hp = Math.max(0, v.hp - 18);
            fxSparks(V3(v.x, 0.9, v.z), 0xff4a3a, 8, 3.2);
            const ratio = v.hp / v.maxHp;
            v.bar.scale.x = Math.max(0.05, ratio);
            (v.bar.material as THREE.MeshBasicMaterial).color.setHex(ratio > 0.5 ? 0x62e898 : ratio > 0.25 ? 0xffd054 : 0xff4a3a);
            if (v.hp <= 0) {
              v.alive = false;
              v.mesh.visible = false;
              v.bar.visible = false;
              fxSmoke(V3(v.x, 0.7, v.z), 0xd8c8b0, 10, { r: 0.6, spd: 1.0, up: 0.8, s: 0.35, life: 0.5 });
              this.host.pop('乡民退避！', V3(v.x, 1.5, v.z), '#ff8a7a', '#ff3a2a');
            }
          }
        }
      }
    }

    // Act 1 · 吕布「三合试锋」: clamp HP floor at 20% so Lu Bu is won via skill (parry/dodge/clash/poise)
    if (this.meta.id === 'lubu' && this.lubuFoe && this.lubuFoe.st !== 'dead') {
      const floor = Math.ceil(this.lubuFoe.maxHp * 0.22);
      if (this.lubuFoe.hp < floor) this.lubuFoe.hp = floor;
    }

    // Act 2 · 夏侯惇「雾巷听弦」: fog stealth cycling + crossbow bolts
    if (this.meta.id === 'xiahoudun') {
      if (this.fogFoe && this.fogFoe.st !== 'dead') {
        const floor = Math.ceil(this.fogFoe.maxHp * 0.35);
        if (this.fogFoe.hp < floor) this.fogFoe.hp = floor;
        if (this.fogStunT <= 0) {
          this.fogFoe.st = 'stagger';
          this.fogFoe.t = 0;
          this.fogFoe.dur = 99;
          this.fogFoe.vel.set(0, 0, 0);
          this.fogFoe.a.yaw = Math.atan2(hp.x - this.fogFoe.pos.x, hp.z - this.fogFoe.pos.z);
          this.fogShiftT -= dt;
          if (this.fogShiftT <= 0 && (this.fogFoe.dartMarkT ?? 0) <= 0) {
            this.shuffleFogPositions();
          }
        }
      }

      for (let i = 0; i < this.turrets.length; i++) {
        const tu = this.turrets[i];
        if (!tu.alive) continue;
        tu.mesh.rotation.y = Math.atan2(hp.x - tu.x, hp.z - tu.z);
        tu.cd -= dt;
        if (tu.cd <= 0) {
          tu.cd = 2.75 + Math.random() * 0.8;
          const dx = hp.x - tu.x, dz = hp.z - tu.z, l = Math.max(0.01, Math.hypot(dx, dz));
          const spd = 11.2;
          const bMesh = buildBoltModel();
          bMesh.position.set(tu.x, 1.35, tu.z);
          bMesh.rotation.y = Math.atan2(dx, dz);
          this.root.add(bMesh);
          this.bolts.push({ pos: V3(tu.x, 1.35, tu.z), vel: V3((dx / l) * spd, 0, (dz / l) * spd), turretIdx: i, reflected: false, mesh: bMesh, life: 2.8 });
          cue('arrow', 0.65);
        }
      }
      for (let i = this.bolts.length - 1; i >= 0; i--) {
        const b = this.bolts[i];
        b.life -= dt;
        b.pos.addScaledVector(b.vel, dt);
        b.mesh.position.copy(b.pos);
        if (b.reflected) {
          const tu = this.turrets[b.turretIdx];
          if (tu && tu.alive && Math.hypot(b.pos.x - tu.x, b.pos.z - tu.z) < 1.15) {
            this.destroyTurret(tu);
            this.removeBolt(i);
            continue;
          }
        } else {
          if (Math.hypot(b.pos.x - hp.x, b.pos.z - hp.z) < 0.72) {
            this.host.hurtHero(10, b.pos.clone());
            this.removeBolt(i);
            continue;
          }
        }
        if (b.life <= 0 || Math.abs(b.pos.x) > 10 || Math.abs(b.pos.z) > 10) this.removeBolt(i);
      }
    }
  }

  private removeBolt(idx: number) {
    const b = this.bolts[idx];
    this.root.remove(b.mesh);
    this.bolts.splice(idx, 1);
  }

  private clearBolts() {
    for (const b of this.bolts) this.root.remove(b.mesh);
    this.bolts.length = 0;
  }

  dispose() {
    this.clearBolts();
    this.clearFogDecoys();
    if (this.zhaoAlly) { this.zhaoAlly.dispose(); this.zhaoAlly = null; }
    if (this.meta.id === 'xiahoudun') this.host.grantChaseMove(false);
    this.actor.dispose();
    this.root.parent?.remove(this.root);
  }
}
