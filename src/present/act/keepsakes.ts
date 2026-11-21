// 八件随身信物匣系统（act-125，11-21 用户拍板）：
//   据点四人（杜五/孙媪/冯铁臂/卢昭）+ 三国四大名将（赵云/吕布/夏侯惇/陆逊）。
//   每局出门在信物匣选带 1 件；随通关战斗房间数自动从 ★ 升至 ★★★（5 间升 2 星、12 间升 3 星）；
//   四件流派信物显著提高对应流派秘传出现率，出门前即可主动控构筑。
import * as THREE from 'three';
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import type { Archetype } from './boons';
import type { Profile } from './profile';

export type KeepsakeId = 'duwu' | 'sunao' | 'fengtiebi' | 'luzhao' | 'zhaoyun' | 'lubu' | 'xiahoudun' | 'luxun';

export interface KeepsakeDef {
  id: KeepsakeId;
  owner: string;
  name: string;
  source: string;
  /** Optional boon archetype whose offer weight is boosted while equipped */
  arch?: Archetype;
  /** Values at star 1 / 2 / 3 */
  vals: [number, number, number];
  /** Format crisp 1-line effect description for the given star (1..3) */
  effect(star: 1 | 2 | 3): string;
  col: string;
  glyph: string[];
}

/** act-147: Active keepsake roster limited to the 4 Hideout companions (Four Generals encounters removed) */
export const KEEPSAKE_ORDER: KeepsakeId[] = ['duwu', 'sunao', 'fengtiebi', 'luzhao'];
/** Combat rooms cleared with this keepsake to reach ★2 and ★3 */
export const KEEPSAKE_STARS: [number, number] = [5, 12];

export const KEEPSAKES: Record<KeepsakeId, KeepsakeDef> = {
  duwu: {
    id: 'duwu',
    owner: '杜五',
    name: '瓦壶老酒',
    source: '据点找杜五领取干粮后获赠',
    vals: [1, 1, 2],
    effect: s => s === 1 ? '每关首战获 1 层护酒免伤，破酒震退近敌' : s === 2 ? '每关首战获 1 层护酒免伤，破酒震退并回 10 血' : '每关首战获 2 层护酒免伤，破酒震退并回 12 血',
    col: '#ffbe78',
    glyph: [
      '....##....',
      '...####...',
      '....##....',
      '..######..',
      '.###oo###.',
      '.##oooo##.',
      '.########.',
      '..######..',
      '...####...',
      '..........',
    ],
  },
  sunao: {
    id: 'sunao',
    owner: '孙媪',
    name: '百草香囊',
    source: '据点向孙媪问诊行针后获赠',
    vals: [8, 12, 16],
    effect: s => `进入新屋回复 ${[8, 12, 16][s - 1]}% 生命，草垛回血翻倍`,
    col: '#8effb8',
    glyph: [
      '....##....',
      '...####...',
      '..##oo##..',
      '.########.',
      '.##oooo##.',
      '.##oooo##.',
      '..######..',
      '...####...',
      '....##....',
      '..........',
    ],
  },
  fengtiebi: {
    id: 'fengtiebi',
    owner: '冯铁臂',
    name: '淬火残铁',
    source: '据点向冯铁臂锻造后获赠',
    arch: 'poise',
    vals: [15, 25, 35],
    effect: s => `【破势】秘传出现率大增，破甲追伤 +${[15, 25, 35][s - 1]}%`,
    col: '#ffd268',
    glyph: [
      '..........',
      '.########.',
      '##########',
      '..######..',
      '...####...',
      '...####...',
      '..######..',
      '.########.',
      '..........',
      '..........',
    ],
  },
  luzhao: {
    id: 'luzhao',
    owner: '卢昭',
    name: '染血竹简',
    source: '据点水榭与卢昭交谈获赠',
    arch: 'blood',
    vals: [1, 2, 3],
    effect: s => `【血刃】秘传出现率大增，流血上限 +${[1, 2, 3][s - 1]} 层`,
    col: '#ff7870',
    glyph: [
      '.########.',
      '.#oo##oo#.',
      '.#oo##oo#.',
      '.#oo##oo#.',
      '.#oo##oo#.',
      '.#oo##oo#.',
      '.#oo##oo#.',
      '.########.',
      '..........',
      '..........',
    ],
  },
  zhaoyun: {
    id: 'zhaoyun',
    owner: '赵云',
    name: '龙胆银穗',
    source: '第一关与赵云断后护民获赠',
    arch: 'gale',
    vals: [20, 35, 50],
    effect: s => `【凌空】秘传出现率大增，穿风与空招伤害 +${[20, 35, 50][s - 1]}%`,
    col: '#7ce8ff',
    glyph: [
      '....##....',
      '...####...',
      '..##oo##..',
      '...####...',
      '....##....',
      '...#oo#...',
      '..##oo##..',
      '..#.##.#..',
      '.#..##..#.',
      '..........',
    ],
  },
  lubu: {
    id: 'lubu',
    owner: '吕布',
    name: '赤兔红鬃',
    source: '第二关三合试锋赢得吕布认可获赠',
    vals: [15, 25, 35],
    effect: s => `冲刺掠敌大幅削架势，完美闪避后攻移速 +${[15, 25, 35][s - 1]}%`,
    col: '#ff6448',
    glyph: [
      '..##..##..',
      '.###..###.',
      '..######..',
      '...####...',
      '..##oo##..',
      '.###oo###.',
      '.##....##.',
      '..#....#..',
      '..........',
      '..........',
    ],
  },
  xiahoudun: {
    id: 'xiahoudun',
    owner: '夏侯惇',
    name: '玄铁眼带',
    source: '第三关雾巷听弦追影破夏侯惇隐身获赠',
    arch: 'shadow',
    vals: [30, 50, 75],
    effect: s => `【影镖】秘传出现率大增，弹箭与破势反击 +${[30, 50, 75][s - 1]}%`,
    col: '#b0beff',
    glyph: [
      '..........',
      '.########.',
      '###oooo###',
      '##oooooo##',
      '###oooo###',
      '.########.',
      '....##....',
      '...####...',
      '..........',
      '..........',
    ],
  },
  luxun: {
    id: 'luxun',
    owner: '陆逊',
    name: '江东火折',
    source: '第四关帮陆逊借风连环引火获赠',
    vals: [1, 2, 3],
    effect: s => `火油/撞墙/坠坑伤大增，每屋多刷 ${[1, 2, 3][s - 1]} 个火油坛`,
    col: '#ff9c44',
    glyph: [
      '....##....',
      '...####...',
      '..##oo##..',
      '..#oooo#..',
      '...####...',
      '...####...',
      '...####...',
      '...####...',
      '..######..',
      '..........',
    ],
  },
};

export function keepsakeDef(id?: string | null): KeepsakeDef | null {
  return id && id in KEEPSAKES ? KEEPSAKES[id as KeepsakeId] : null;
}

export function isKeepsakeUnlocked(p: Profile, id: KeepsakeId, allUnlocked = false): boolean {
  if (allUnlocked) return true;
  return p.keepsakes?.[id] != null;
}

export function unlockKeepsake(p: Profile, id: KeepsakeId): boolean {
  if (!p.keepsakes) p.keepsakes = {};
  if (p.keepsakes[id] != null) return false;
  p.keepsakes[id] = 0;
  return true;
}

export function keepsakeRooms(p: Profile, id: KeepsakeId): number {
  return Math.max(0, Math.floor(p.keepsakes?.[id] ?? 0));
}

export function keepsakeStar(p: Profile, id: KeepsakeId): 1 | 2 | 3 {
  const n = keepsakeRooms(p, id);
  return n >= KEEPSAKE_STARS[1] ? 3 : n >= KEEPSAKE_STARS[0] ? 2 : 1;
}

export function starLabel(star: 1 | 2 | 3): string {
  return star === 3 ? '★★★' : star === 2 ? '★★' : '★';
}

export function equippedKeepsake(p: Profile, allUnlocked = false): KeepsakeId | null {
  const cur = p.keepsake as KeepsakeId | null | undefined;
  if (!cur || !KEEPSAKE_ORDER.includes(cur)) return null;
  return isKeepsakeUnlocked(p, cur, allUnlocked) ? cur : null;
}

export function equipKeepsake(p: Profile, id: KeepsakeId | null, allUnlocked = false): boolean {
  if (id === null) { p.keepsake = null; return true; }
  if (!KEEPSAKE_ORDER.includes(id) || !isKeepsakeUnlocked(p, id, allUnlocked)) return false;
  p.keepsake = id;
  return true;
}

/** Add combat-room progress to the equipped keepsake; returns new star if it just leveled up, else null. */
export function advanceKeepsake(p: Profile, delta = 1): { id: KeepsakeId; star: 1 | 2 | 3 } | null {
  const id = equippedKeepsake(p);
  if (!id) return null;
  if (!p.keepsakes) p.keepsakes = {};
  const before = keepsakeStar(p, id);
  p.keepsakes[id] = keepsakeRooms(p, id) + delta;
  const after = keepsakeStar(p, id);
  return after > before ? { id, star: after } : null;
}

/** Build the 3D voxel black-lacquer bronze-clasped 信物匣 standing on a wooden altar table. */
export function buildKeepsakeBoxModel(hasEquipped: boolean): THREE.Group {
  const g = new THREE.Group();
  const w = new VoxWorld(CELL);
  const WD = 0x382418, WM = 0x523622, WL = 0x6c4830;
  const LACQ = 0x1e1a22, LACQ_L = 0x322c38, BR = 0xc8963e, BR_L = 0xf2c668, SILK = 0x8e2420;
  // Low timber stand (1.2m × 0.7m × 0.85m)
  for (const [x, z] of [[-7, -4], [6, -4], [-7, 3], [6, 3]]) w.box(x, 0, z, x + 1, 7, z + 1, WD);
  w.box(-8, 8, -5, 7, 9, 4, WM);
  w.box(-8, 9, -5, 7, 9, 4, WL);
  // Crimson silk mat draped on table center
  w.box(-5, 10, -4, 4, 10, 5, SILK);
  // Black lacquer keepsake chest
  w.box(-4, 11, -3, 3, 14, 2, LACQ);
  w.box(-4, 15, -3, 3, 15, 2, LACQ_L);
  // Bronze corner clasps & front lock plate
  for (const x of [-4, 3]) for (const z of [-3, 2]) w.box(x, 11, z, x, 15, z, BR);
  w.box(-1, 12, 3, 0, 14, 3, hasEquipped ? BR_L : BR);
  // Warm jade/amber token resting beside the clasp when one is equipped
  if (hasEquipped) w.box(5, 11, 0, 6, 12, 1, 0x6ce8c4);

  for (const m of w.build({ rim: 0.25, edge: 0.14 })) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}
