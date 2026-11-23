// 据点按「关卡推进进度」逐项渐进解锁（act-135 / act-188）：
//   初醒（未推进关卡）：仅 杜五（干粮）+ 孙婆婆（悟性牌阵），清爽零过载；
//   阶段 1（第 1 关推进过 2 间）：古窑「开炉建坊」工碑 → 冯铁臂与乌漆信物匣落成，同步点亮古窑长明灯；
//   阶段 2（斩第 1 关首领石雷 / 踏入第 2 关）：北台「立文家刀廊」工碑 → 名刀廊落成 + 桓越与试锋碑入驻；
//   阶段 3（推进第 2 关洛阳 3 间 / 斩第 2 关首领阎虎）：东桥「开垦竹溪药圃」工碑 → 6 块药畦 + 卢昭入驻。
//   且每次回据点最多只放出 1 座待建工碑（按 forge → rack → garden 顺序排队），杜绝多设施同时堆叠信息过载。
import * as THREE from 'three';
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import type { Profile } from './profile';
import { bossesDown } from './scripts';

export type HideoutZoneId = 'forge' | 'garden' | 'rack';
export const HIDEOUT_ZONE_ORDER: HideoutZoneId[] = ['forge', 'garden', 'rack'];

export interface HideoutZoneDef {
  id: HideoutZoneId;
  flag: string;
  monument: { x: number; z: number };
  camBase: [number, number, number];
  camLook: [number, number, number];
  camFov: number;
  beaconLabel: string;
  actionLabel: string;
  bannerTitle: string;
  bannerSub: string;
  color: string;
  hex: number;
  npc: 'fengtiebi' | 'luzhao' | 'huanyue';
  npcLine: string;
}

export const HIDEOUT_ZONES: Record<HideoutZoneId, HideoutZoneDef> = {
  forge: {
    id: 'forge',
    flag: 'build_forge',
    monument: { x: 0.25, z: -8.4 },
    camBase: [2.4, 9.2, 0.4],
    camLook: [1.8, 1.0, -8.2],
    camFov: 44,
    beaconLabel: '待建 · 窑口锻坊',
    actionLabel: '开炉建坊 · 冯铁臂与信物匣',
    bannerTitle: '古窑开炉 · 锻坊落成',
    bannerSub: '冯铁臂入驻锻坊 · 乌漆信物匣已备',
    color: '#ffd868',
    hex: 0xffb840,
    npc: 'fengtiebi',
    npcLine: '火膛刚烧旺，铁砧也垫稳了。带回来的残铁拿给我，替你锻骨淬刀；礼台右首的信物匣也已漆好，随身佩上罢。',
  },
  garden: {
    id: 'garden',
    flag: 'build_garden',
    monument: { x: 13.5, z: -0.4 },
    camBase: [18.0, 12.2, 10.2],
    camLook: [18.0, 0.8, -1.2],
    camFov: 46,
    beaconLabel: '待建 · 竹溪药圃',
    actionLabel: '开垦竹溪药圃 · 卢昭',
    bannerTitle: '竹溪药圃落成',
    bannerSub: '六畦药田已备 · 卢昭入驻水榭 · 孙媪赠予初种',
    color: '#8effb0',
    hex: 0x62e898,
    npc: 'luzhao',
    npcLine: '东桥水渠清亮，新垦的药畦就归你打理。孙媪留了几包初种，趁湿土播下罢；前路各关的动静，我也替你留心着。',
  },
  rack: {
    id: 'rack',
    flag: 'build_rack',
    monument: { x: -3.6, z: -5.2 },
    camBase: [-5.2, 9.6, 2.2],
    camLook: [-6.8, 1.0, -7.4],
    camFov: 46,
    beaconLabel: '待建 · 文家刀廊',
    actionLabel: '立文家刀廊 · 桓越',
    bannerTitle: '文家刀廊落成',
    bannerSub: '北台可拔换文家名刀 · 桓越入驻西北石阶',
    color: '#ffe698',
    hex: 0xffd258,
    npc: 'huanyue',
    npcLine: '好一座刀廊！文家散落的名刀每夺回一柄，便挂在此处。我就在西北石阶温一壶山泉酿，换了新刀尽管来试锋论刀。',
  },
};

const FORGE_PERK_KEYS = ['blade', 'darts', 'manual'];

export interface HideoutProgressState {
  forgeReady: boolean;
  forgeBuilt: boolean;
  gardenReady: boolean;
  gardenBuilt: boolean;
  rackReady: boolean;
  rackBuilt: boolean;
  lanternReady: boolean;
  visibleNpcs: Array<'duwu' | 'sunao' | 'fengtiebi' | 'luzhao' | 'huanyue'>;
  pendingZones: HideoutZoneId[];
}

/** Whether Du Wu has perished at Xiapi White Gate (shifts his SE hearth into a memorial tended by Sun Ao) */
export function isDuwuDead(p: Profile): boolean {
  return !!p.seen?.['duwu_dead'];
}

/** Record furthest stage progress reached (monotonic watermark in region/room order) */
export function recordStageProgress(p: Profile, region: number, roomCleared: number) {
  const prevReg = p.bestRegion ?? 0;
  const prevRoom = p.bestRoom ?? 0;
  if (region > prevReg) {
    p.bestRegion = region;
    p.bestRoom = Math.max(0, roomCleared);
  } else if (region === prevReg && roomCleared > prevRoom) {
    p.bestRoom = roomCleared;
  }
}

/** Pure query for hideout stage-driven progressive unlock state (strictly 1 pending zone at a time; backward-compatible with veteran saves) */
export function hideoutProgress(p: Profile, allWeapons = false): HideoutProgressState {
  const forgeVeteran = FORGE_PERK_KEYS.some(k => (p.perks?.[k] ?? 0) > 0) || p.keepsake != null;
  const gardenVeteran = !!p.garden && (p.garden.plots.some(Boolean) || p.garden.unlocked > 2);
  const rackVeteran = (p.weapon != null && p.weapon !== 'hanshan') || Object.values(p.weaponLv ?? {}).some(v => (v ?? 0) > 0);

  const forgeBuilt = allWeapons || !!p.seen?.['build_forge'] || forgeVeteran;
  const gardenBuilt = allWeapons || !!p.seen?.['build_garden'] || gardenVeteran;
  const rackBuilt = allWeapons || !!p.seen?.['build_rack'] || rackVeteran;

  const down = bossesDown(p.seen ?? {});
  const bestReg = p.bestRegion ?? 0;
  const bestRoom = p.bestRoom ?? 0;

  // Stage-progress unlocks (NOT run-count):
  //   1. Forge (冯铁臂 + 信物匣): clear 2 rooms in Act 1 (or deeper / any boss)
  //   2. Rack  (名刀廊 + 桓越): beat Act 1 Boss Shi Lei / enter Act 2
  //   3. Garden (竹溪药圃 + 卢昭): reach Act 2 Room 3+ / beat Act 2 Boss Yan Hu
  const forgeReady = forgeBuilt || bestRoom >= 2 || bestReg >= 1 || down >= 1 || p.wins > 0;
  const rackReady = rackBuilt || down >= 1 || bestReg >= 1 || p.wins > 0;
  const gardenReady = gardenBuilt || (bestReg >= 1 && bestRoom >= 3) || bestReg >= 2 || down >= 2 || p.wins > 0;
  const lanternReady = allWeapons || forgeBuilt || (p.ads?.total ?? 0) > 0;

  const visibleNpcs: HideoutProgressState['visibleNpcs'] = isDuwuDead(p) ? ['sunao'] : ['duwu', 'sunao'];
  if (forgeBuilt) visibleNpcs.push('fengtiebi');
  if (gardenBuilt) visibleNpcs.push('luzhao');
  if (rackBuilt) visibleNpcs.push('huanyue');

  // Strict single-zone queue: reveal at most ONE construction monument at a time so players are never bombarded with multiple systems at once
  const pendingZones: HideoutZoneId[] = [];
  if (forgeReady && !forgeBuilt) pendingZones.push('forge');
  else if (rackReady && !rackBuilt) pendingZones.push('rack');
  else if (gardenReady && !gardenBuilt) pendingZones.push('garden');

  return { forgeReady, forgeBuilt, gardenReady, gardenBuilt, rackReady, rackBuilt, lanternReady, visibleNpcs, pendingZones };
}

/** Pure 3D voxel construction monument (落成工碑, 100% axis-aligned 7cm voxel blocks, grounded at y = 0) */
export function buildZoneMonumentModel(zone: HideoutZoneId): THREE.Group {
  const vw = new VoxWorld(CELL);
  const STONE_D = 0x56524c, STONE = 0x767168, STONE_L = 0x948e84;
  const WOOD_D = 0x423024, WOOD = 0x644832, WOOD_L = 0x826044;
  const ROOF_D = 0x363840, ROOF = 0x4c505a;
  const GOLD = 0xdca840, GOLD_L = 0xffe278;
  const LACQUER = 0x2a1d1c;

  // Stepped stone plinth (grounded firmly at y = 0)
  vw.box(-7, 0, -5, 7, 1, 5, STONE_D);
  vw.box(-6, 2, -4, 6, 3, 4, STONE);
  vw.box(-5, 3, -3, 5, 3, 3, STONE_L);

  // Twin timber posts + hanging crossbar + pitched voxel eaves
  vw.box(-5, 4, -1, -4, 18, 1, WOOD_D);
  vw.box(4, 4, -1, 5, 18, 1, WOOD_D);
  vw.box(-4, 4, 1, -4, 17, 1, WOOD);
  vw.box(4, 4, 1, 4, 17, 1, WOOD);
  vw.box(-6, 18, -1, 6, 19, 1, WOOD_L);
  // Roof cap
  vw.box(-7, 20, -2, 7, 20, 2, ROOF_D);
  vw.box(-6, 21, -1, 6, 21, 1, ROOF);
  vw.box(-3, 22, 0, 3, 22, 0, GOLD);

  // Central lacquered wooden plaque framed in bronze-gold
  vw.box(-3, 6, 0, 3, 17, 0, GOLD);
  vw.box(-2, 7, 0, 2, 16, 0, LACQUER);
  // Support bottom beam connecting plaque cleanly to posts
  vw.box(-4, 6, 0, 4, 6, 0, WOOD);

  // Zone-specific 3D embossed emblem on front face (z = 1)
  if (zone === 'forge') {
    // Glowing amber anvil + ember flame
    vw.box(-2, 8, 1, 2, 9, 1, 0x889098);
    vw.box(-1, 10, 1, 1, 10, 1, 0xb0b8c0);
    vw.box(-1, 12, 1, 1, 14, 1, 0xff8c2c);
    vw.box(0, 13, 1, 0, 15, 1, GOLD_L);
  } else if (zone === 'garden') {
    // Sprouting emerald herb shoot
    vw.box(0, 8, 1, 0, 14, 1, 0x4ca858);
    vw.box(-2, 11, 1, -1, 12, 1, 0x72e088);
    vw.box(1, 12, 1, 2, 13, 1, 0x72e088);
    vw.box(0, 15, 1, 0, 15, 1, 0xa8ffb8);
  } else {
    // Gleaming vertical 文家名刀 blade emblem
    vw.box(0, 8, 1, 0, 9, 1, GOLD);
    vw.box(-1, 10, 1, 1, 10, 1, GOLD_L);
    vw.box(0, 11, 1, 0, 15, 1, 0xe4ecf8);
  }

  // Ground-level axis-aligned golden voxel corner brackets (subtle 3D floor mark)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    vw.box(sx * 9, 0, sz * 7, sx * 11, 0, sz * 7, GOLD);
    vw.box(sx * 11, 0, sz * 5, sx * 11, 0, sz * 7, GOLD);
  }

  const g = new THREE.Group();
  for (const m of vw.build({ rim: 0.28, edge: 0.14 })) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}
