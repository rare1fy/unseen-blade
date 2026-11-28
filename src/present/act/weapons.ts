// 文家四柄名刀系统（act-125，11-21 用户拍板）：
//   每柄名刀改变：① 3.5cm 精细体素刀身模型与刀光配色 ② 普攻连段节奏/段数/范围/霸体/击退 ③ 藏锋拔刀或飞镖联动特技 ④ 冯铁臂处 1→3 阶淬炼机制。
//   所有名刀与现有 4 基础键（斩/冲/跳/镖）和 12 本局内刀谱完全兼容。
import * as THREE from 'three';
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import type { Profile } from './profile';

export type WeaponId = 'hanshan' | 'thunder' | 'frost' | 'blunt';
export type CutPose = 'k1' | 'k2' | 'k3' | 'k4' | 'k5';
export type StanceMode = 'dash' | 'cleave' | 'detonate' | 'flash';

export interface WeaponCut {
  /** which existing hero pose animation drives this step */
  pose: CutPose;
  durMul: number;
  dmgMul: number;
  rangeAdd: number;
  halfMul: number;
  knockMul: number;
  lungeMul: number;
  poiseMul: number;
  qiMul: number;
  heavy: boolean;
  /** cannot be staggered during active swing */
  hyperArmor?: boolean;
  /** frost blade: automatically plants an ice shadow-pin on struck enemies */
  pin?: boolean;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  title: string;
  /** story boss flag required to unlock, or null if unlocked from the start */
  unlockBoss: string | null;
  unlockHint: string;
  summary: string;
  special: string;
  forgeCosts: [number, number, number];
  forgeDesc: [string, string, string];
  col: string;
  hex: number;
  glyph: string[];
  stanceMode: StanceMode;
  parryWinMul: number;
  zeroCancelCharge?: boolean;
  pal: { light: string; heavy: string; iai: string };
  cuts: WeaponCut[];
}

export const WEAPON_ORDER: WeaponId[] = ['hanshan', 'thunder', 'frost', 'blunt'];

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  hanshan: {
    id: 'hanshan',
    name: '寒山旧刀',
    title: '五段连环 · 均衡全能',
    unlockBoss: null,
    unlockHint: '初始佩刀',
    summary: '五段连环刀顺滑连贯，攻守兼备',
    special: '藏锋常规箭步斩与破势弹反',
    forgeCosts: [25, 50, 85],
    forgeDesc: ['末刀自带窄月牙刀光', '破势成功额外回半格气', '全招杀气积攒加快两成'],
    col: '#e8e0d0',
    hex: 0xd8d0c0,
    glyph: [
      '........##',
      '.......###',
      '......###.',
      '.....###..',
      '....###...',
      '...###....',
      '..o##.....',
      '.oo#......',
      'oo........',
      'o.........',
    ],
    stanceMode: 'dash',
    parryWinMul: 1,
    pal: { light: 'light', heavy: 'heavy', iai: 'iai' },
    cuts: [
      { pose: 'k1', durMul: 1, dmgMul: 1, rangeAdd: 0, halfMul: 1, knockMul: 1, lungeMul: 1, poiseMul: 1, qiMul: 1, heavy: false },
      { pose: 'k2', durMul: 1, dmgMul: 1, rangeAdd: 0, halfMul: 1, knockMul: 1, lungeMul: 1, poiseMul: 1, qiMul: 1, heavy: false },
      { pose: 'k3', durMul: 1, dmgMul: 1, rangeAdd: 0, halfMul: 1, knockMul: 1, lungeMul: 1, poiseMul: 1, qiMul: 1, heavy: false },
      { pose: 'k4', durMul: 1, dmgMul: 1, rangeAdd: 0, halfMul: 1, knockMul: 1, lungeMul: 1, poiseMul: 1, qiMul: 1, heavy: false },
      { pose: 'k5', durMul: 1, dmgMul: 1, rangeAdd: 0, halfMul: 1, knockMul: 1, lungeMul: 1, poiseMul: 1, qiMul: 1, heavy: true },
    ],
  },
  thunder: {
    id: 'thunder',
    name: '惊雷陌刀',
    title: '三段霸体 · 裂阵重劈',
    unlockBoss: 'ch1_boss_after',
    unlockHint: '斩第一关石雷夺回',
    summary: '三段大开大合重斩，末刀霸体强击飞',
    special: '藏锋变招「裂阵斩」：原地劈出六米雷裂冲击波破盾',
    forgeCosts: [28, 56, 95],
    forgeDesc: ['重斩击飞撞墙伤害翻倍', '裂阵斩命中额外降体素雷柱', '藏锋蓄力期间减伤四成'],
    col: '#ffd066',
    hex: 0xf4b838,
    glyph: [
      '.......###',
      '......####',
      '.....####.',
      '....####..',
      '...####...',
      '..####....',
      '.oo##.....',
      'ooo.......',
      'oo........',
      '..........',
    ],
    stanceMode: 'cleave',
    parryWinMul: 1,
    pal: { light: 'thunder_light', heavy: 'thunder_heavy', iai: 'thunder_heavy' },
    cuts: [
      { pose: 'k1', durMul: 1.24, dmgMul: 1.12, rangeAdd: 0.62, halfMul: 1.22, knockMul: 1.55, lungeMul: 0.92, poiseMul: 1.35, qiMul: 1.2, heavy: false },
      { pose: 'k2', durMul: 1.26, dmgMul: 1.22, rangeAdd: 0.72, halfMul: 1.28, knockMul: 1.75, lungeMul: 1.0, poiseMul: 1.55, qiMul: 1.3, heavy: true },
      { pose: 'k5', durMul: 1.15, dmgMul: 1.32, rangeAdd: 0.85, halfMul: 1.32, knockMul: 2.35, lungeMul: 1.25, poiseMul: 1.85, qiMul: 1.45, heavy: true, hyperArmor: true },
    ],
  },
  frost: {
    id: 'frost',
    name: '霜鳞短刃',
    title: '六段疾风 · 影针引爆',
    unlockBoss: 'ch2_boss_after',
    unlockHint: '斩第二关阎虎夺回',
    summary: '六段疾风快刀攻速极快，每三刀自动钉影针',
    special: '藏锋变招「追霜」：瞬穿引爆沿途所有影针与飞镖',
    forgeCosts: [28, 56, 95],
    forgeDesc: ['飞镖装填速度加快两成半', '引爆影针附带寒气减速', '单次引爆三枚以上立刻刷新冲刺'],
    col: '#88e8ff',
    hex: 0x62d6f8,
    glyph: [
      '.........#',
      '........##',
      '.......##.',
      '......##..',
      '.....##...',
      '....##....',
      '...o#.....',
      '..oo......',
      '.o........',
      '..........',
    ],
    stanceMode: 'detonate',
    parryWinMul: 1,
    pal: { light: 'frost_light', heavy: 'frost_heavy', iai: 'frost_heavy' },
    cuts: [
      { pose: 'k1', durMul: 0.72, dmgMul: 0.74, rangeAdd: -0.08, halfMul: 0.96, knockMul: 0.65, lungeMul: 1.06, poiseMul: 0.85, qiMul: 0.85, heavy: false },
      { pose: 'k2', durMul: 0.72, dmgMul: 0.76, rangeAdd: -0.08, halfMul: 0.96, knockMul: 0.65, lungeMul: 1.06, poiseMul: 0.85, qiMul: 0.85, heavy: false },
      { pose: 'k4', durMul: 0.76, dmgMul: 0.80, rangeAdd: 0.14, halfMul: 0.95, knockMul: 0.70, lungeMul: 1.16, poiseMul: 0.95, qiMul: 1.0, heavy: false, pin: true },
      { pose: 'k1', durMul: 0.70, dmgMul: 0.78, rangeAdd: -0.04, halfMul: 1.0, knockMul: 0.65, lungeMul: 1.1, poiseMul: 0.85, qiMul: 0.85, heavy: false },
      { pose: 'k3', durMul: 0.74, dmgMul: 0.86, rangeAdd: 0.12, halfMul: 1.0, knockMul: 0.88, lungeMul: 0.82, poiseMul: 1.0, qiMul: 1.0, heavy: false },
      { pose: 'k5', durMul: 0.74, dmgMul: 0.96, rangeAdd: 0.16, halfMul: 1.0, knockMul: 1.1, lungeMul: 1.15, poiseMul: 1.15, qiMul: 1.15, heavy: true, pin: true },
    ],
  },
  blunt: {
    id: 'blunt',
    name: '无锋断刃',
    title: '两段引招 · 听声一闪',
    unlockBoss: 'ch3_boss_after',
    unlockHint: '斩第三关封寒夺回',
    summary: '两段简练平斩，任意出刀零帧瞬接藏锋',
    special: '破势窗口宽四成，破势或闪避免费赋予赤金「听声一闪」',
    forgeCosts: [30, 60, 100],
    forgeDesc: ['破势成功震慑周围小怪失衡', '一闪斩杀立刻刷新免费一闪', '不见刀绝技伤害提高两成五'],
    col: '#ff9668',
    hex: 0xf2683c,
    glyph: [
      '......####',
      '.....#####',
      '....#####.',
      '...#####..',
      '..#####...',
      '.oo###....',
      'ooo#......',
      'oo........',
      '..........',
      '..........',
    ],
    stanceMode: 'flash',
    parryWinMul: 1.4,
    zeroCancelCharge: true,
    pal: { light: 'blunt_light', heavy: 'blunt_flash', iai: 'blunt_flash' },
    cuts: [
      { pose: 'k1', durMul: 0.85, dmgMul: 0.84, rangeAdd: 0.06, halfMul: 1.0, knockMul: 0.72, lungeMul: 0.95, poiseMul: 1.1, qiMul: 1.2, heavy: false },
      { pose: 'k2', durMul: 0.84, dmgMul: 0.92, rangeAdd: 0.12, halfMul: 1.08, knockMul: 0.88, lungeMul: 0.86, poiseMul: 1.25, qiMul: 1.35, heavy: false },
    ],
  },
};

export function weaponDef(id?: string | null): WeaponDef {
  return (id && id in WEAPONS ? WEAPONS[id as WeaponId] : WEAPONS.hanshan);
}

export function isWeaponUnlocked(p: Profile, id: WeaponId, allUnlocked = false): boolean {
  if (allUnlocked || id === 'hanshan') return true;
  const w = WEAPONS[id];
  if (!w.unlockBoss) return true;
  if (p.seen[w.unlockBoss] || p.wins > 0) return true;
  if ((p.weaponLv?.[id] ?? 0) > 0) return true;
  return false;
}

export function weaponLevel(p: Profile, id: WeaponId): number {
  return Math.max(0, Math.min(3, Math.floor(p.weaponLv?.[id] ?? 0)));
}

export function weaponNextCost(p: Profile, id: WeaponId): number | null {
  const lv = weaponLevel(p, id);
  return WEAPONS[id].forgeCosts[lv] ?? null;
}

export function canForgeWeapon(p: Profile, id: WeaponId, allUnlocked = false): boolean {
  if (!isWeaponUnlocked(p, id, allUnlocked)) return false;
  const cost = weaponNextCost(p, id);
  return cost !== null && p.iron >= cost;
}

export function hasAnyWeaponForgeable(p: Profile, allUnlocked = false): boolean {
  return WEAPON_ORDER.some(id => canForgeWeapon(p, id, allUnlocked));
}

export function forgeWeapon(p: Profile, id: WeaponId, allUnlocked = false): boolean {
  if (!canForgeWeapon(p, id, allUnlocked)) return false;
  const cost = weaponNextCost(p, id)!;
  p.iron -= cost;
  if (!p.weaponLv) p.weaponLv = {};
  p.weaponLv[id] = weaponLevel(p, id) + 1;
  return true;
}

export function equippedWeapon(p: Profile, allUnlocked = false): WeaponId {
  const cur = (p.weapon && p.weapon in WEAPONS ? p.weapon : 'hanshan') as WeaponId;
  return isWeaponUnlocked(p, cur, allUnlocked) ? cur : 'hanshan';
}

export function equipWeapon(p: Profile, id: WeaponId, allUnlocked = false): boolean {
  if (!isWeaponUnlocked(p, id, allUnlocked)) return false;
  p.weapon = id;
  return true;
}

/** Build a 3.5cm fine-voxel blade replacement mesh in the exact local space of heroineFine's `blade` bone (-7, 19, 6). */
const HERO_BLADE_CACHE = new Map<WeaponId, THREE.Mesh[]>();
export function buildHeroBladeMesh(id: WeaponId): THREE.Group {
  let ms = HERO_BLADE_CACHE.get(id);
  if (!ms) {
    const w = new VoxWorld(CELL / 2);
    if (id === 'hanshan') {
      // Refined ring-pommel Han dao (exact match to fine_white.vox blade: 3×5 beveled iron guard + 3-tone cold steel chisel blade)
      w.box(-2, -3, -1, 0, -3, -1, 0x2a2e38);
      w.box(-2, -2, -1, 0, 0, -1, 0x464c5a);
      w.box(-2, 1, -1, 0, 1, -1, 0x6c7486);
      w.box(-1, -2, 0, -1, -2, 26, 0xf4f8ff);
      w.box(-1, -1, 0, -1, -1, 26, 0xbecad8);
      w.box(-1, 0, 0, -1, 0, 26, 0x525c6e);
      w.box(-1, -1, 27, -1, 0, 28, 0xf4f8ff);
      w.box(-1, 0, 29, -1, 0, 29, 0xf4f8ff);
    } else if (id === 'thunder') {
      // 惊雷陌刀: noticeably longer (42 cells = 1.47m) & wider heavy dark-iron blade with golden lightning spine & bronze guard
      w.box(-2, -3, -1, 1, 1, -1, 0xc89234);
      w.box(-1, -3, 0, -1, -2, 42, 0xfdf6d8);
      w.box(-1, -1, 0, -1, 0, 41, 0x3b3f52);
      w.box(-1, 1, 0, -1, 1, 38, 0xe8b238);
      // Golden inlay ticks along spine
      for (let z = 6; z <= 34; z += 7) w.box(-1, 0, z, -1, 0, z + 1, 0xffe07a);
      // Chisel tip
      w.box(-1, -2, 42, -1, 0, 43, 0xfff8e2);
    } else if (id === 'frost') {
      // 霜鳞短刃: sleek shorter (24 cells = 0.84m) icy-cyan jade-guard swift blade
      w.box(-1, -2, -1, 0, 0, -1, 0xd8eef4);
      w.box(-1, -2, 0, -1, -2, 24, 0xebfcff);
      w.box(-1, -1, 0, -1, -1, 23, 0x6cd8f8);
      w.box(-1, 0, 0, -1, 0, 20, 0x2b6288);
      w.box(-1, -1, 24, -1, -1, 25, 0xffffff);
    } else {
      // 无锋断刃: thick heavy squared-off broken iron slab (27 cells) with deep crimson-gold fuller glint
      w.box(-2, -3, -1, 1, 1, -1, 0x48444a);
      w.box(-1, -3, 0, 0, 1, 25, 0x36343c);
      w.box(-1, -3, 0, -1, -2, 26, 0x625e6a);
      w.box(-1, 1, 0, 0, 1, 24, 0x4a4854);
      // Broken jagged square tip (axis-aligned steps, no diagonal stairs)
      w.box(-1, -3, 26, -1, 0, 27, 0x7a7682);
      // Subtle crimson-gold fuller vein along the center
      w.box(-1, -1, 3, -1, -1, 22, 0xd86238);
    }
    ms = w.build({ rim: 0.28, edge: 0.14, ground: false });
    HERO_BLADE_CACHE.set(id, ms);
  }
  const g = new THREE.Group();
  g.name = 'customWeaponBlade';
  for (const m of ms) {
    const c = new THREE.Mesh(m.geometry, m.material);
    c.castShadow = true;
    g.add(c);
  }
  return g;
}

/** Build the interactive 3D voxel 文家刀廊 (4-slot blade rack for the expanded hideout courtyard). */
export function buildCourtyardWeaponRack(unlocked: Record<WeaponId, boolean>, active: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const w = new VoxWorld(CELL);
  const WD = 0x3c2818, WM = 0x583c24, WL = 0x765236, ST = 0x68645e, STL = 0x86817a, BR = 0xb8863c;
  // Stone plinth + timber frame (3.2m wide × 1.6m tall)
  w.box(-22, 0, -5, 22, 2, 5, ST);
  w.box(-22, 3, -5, 22, 3, 5, STL);
  // Four upright posts + low eaves canopy
  for (const x of [-20, 19]) {
    w.box(x, 4, -3, x + 1, 24, -2, WD);
    w.box(x, 4, 2, x + 1, 24, 3, WD);
  }
  // Horizontal display bars
  w.box(-19, 8, -1, 18, 9, 1, WM);
  w.box(-19, 15, -1, 18, 16, 1, WM);
  w.box(-19, 23, -3, 18, 24, 3, WL);
  // Sloped stepped voxel roof tiles (axis-aligned broad eaves)
  w.box(-23, 25, -6, 22, 26, 6, 0x3c4048);
  w.box(-21, 27, -4, 20, 28, 4, 0x4c525c);
  w.box(-19, 29, -2, 18, 29, 2, 0x5c626e);

  // 4 vertical blade slots evenly spaced along x
  const xs = [-13, -4, 5, 14];
  const styles: Record<WeaponId, { edge: number; spine: number; guard: number; len: number; wide: boolean }> = {
    hanshan: { edge: 0xe6eef6, spine: 0x606a7c, guard: BR, len: 14, wide: false },
    thunder: { edge: 0xffe898, spine: 0x3e4256, guard: 0xd49a38, len: 17, wide: true },
    frost:   { edge: 0xb2f4ff, spine: 0x2e6c92, guard: 0xdcf4f8, len: 12, wide: false },
    blunt:   { edge: 0x726e7a, spine: 0xd86238, guard: 0x4c4850, len: 13, wide: true },
  };
  WEAPON_ORDER.forEach((id, idx) => {
    const cx = xs[idx], st = styles[id];
    // Slot cradle
    w.box(cx - 2, 4, -2, cx + 2, 5, 2, WD);
    if (!unlocked[id]) {
      // Empty recessed iron peg showing the slot awaits its reclaimed blade
      w.box(cx, 6, 0, cx, 10, 0, 0x383a42);
      return;
    }
    const lift = active === id ? 2 : 0; // Active blade sits slightly elevated with bright brass collar
    // Pommel ring + grip + guard
    w.box(cx, 5 + lift, 0, cx, 5 + lift, 0, st.guard);
    w.box(cx, 6 + lift, 0, cx, 8 + lift, 0, 0x6a241c);
    w.box(cx - 1, 9 + lift, 0, cx + 1, 9 + lift, 0, active === id ? 0xffe078 : st.guard);
    // Upright blade pointing skyward
    w.box(cx, 10 + lift, 0, cx, 10 + lift + st.len, 0, st.edge);
    if (st.wide) w.box(cx + 1, 10 + lift, 0, cx + 1, 9 + lift + st.len, 0, st.spine);
  });

  for (const m of w.build({ rim: 0.25, edge: 0.14 })) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}
