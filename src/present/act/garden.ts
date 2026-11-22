// 营地外扩「竹溪药圃」种田系统（act-132，哈迪斯2式双轨成熟促进回流）：
//   - 6 块 3D 体素药畦（初始开 2 块，剩余 4 块可用药草/残铁开垦），位于东翼跨溪木桥之外的竹溪梯田；
//   - 双轨成熟：局内每通关 1 间战斗屋自动推进 1 格 + 离线按真实时间自然生长（跨小时/隔天回来正好收菜）；
//   - 4 种三国灵植：白芷草（稳产药草）、赤铁兰（稳产残铁）、霜魂莲（双资源 + 下局「温脉药汤」）、九叶玄芝（大丰收 + 下局「玄芝丹气」）；
//   - 种子来源：新档孙媪赠起步种 + 每日回营领赠种 + 战斗清房 / 秘藏宝箱 / 斩杀头目掉落。
import * as THREE from 'three';
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import type { Profile } from './profile';

export type SeedId = 'angelica' | 'ironorchid' | 'frostlotus' | 'xuanzhi';
export type GardenBuffId = 'lotus' | 'xuanzhi';

export interface SeedDef {
  id: SeedId;
  name: string;
  col: number;
  hex: string;
  /** Number of growth steps to reach full maturity */
  steps: number;
  /** Offline real-world minutes per growth step (dual-track with combat rooms!) */
  minsPerStep: number;
  herb: number;
  iron: number;
  buff?: GardenBuffId;
  buffName?: string;
  desc: string;
  buffDesc?: string;
}

export interface GardenPlot {
  seed: SeedId;
  plantedAt: number;
  /** Growth steps accelerated by clearing combat rooms */
  rooms: number;
}

export interface GardenState {
  unlocked: number;
  plots: Array<GardenPlot | null>;
  seeds: Record<SeedId, number>;
  /** One-run elixir buff brewed from harvesting 霜魂莲 or 九叶玄芝 (consumed on departure) */
  buff?: GardenBuffId | null;
  /** Local YYYY-MM-DD of last daily seed gift from 孙媪 */
  dailyDay?: string;
}

export const PLOT_COUNT = 6;
export const SEED_ORDER: SeedId[] = ['angelica', 'ironorchid', 'frostlotus', 'xuanzhi'];

export const SEEDS: Record<SeedId, SeedDef> = {
  angelica: {
    id: 'angelica', name: '白芷草', col: 0x7de08e, hex: '#86e898',
    steps: 3, minsPerStep: 12, herb: 16, iron: 0,
    desc: '药引 +16',
  },
  ironorchid: {
    id: 'ironorchid', name: '赤铁兰', col: 0xf08c54, hex: '#f49a62',
    steps: 5, minsPerStep: 15, herb: 0, iron: 18,
    desc: '残铁 +18',
  },
  frostlotus: {
    id: 'frostlotus', name: '霜魂莲', col: 0x74d8f2, hex: '#80e2ff',
    steps: 6, minsPerStep: 18, herb: 12, iron: 12,
    buff: 'lotus', buffName: '温脉药汤',
    desc: '药引 +12 · 残铁 +12',
    buffDesc: '下局气血 +18 · 重随 +1',
  },
  xuanzhi: {
    id: 'xuanzhi', name: '九叶玄芝', col: 0xd696ff, hex: '#e0a8ff',
    steps: 9, minsPerStep: 20, herb: 24, iron: 24,
    buff: 'xuanzhi', buffName: '玄芝丹气',
    desc: '药引 +24 · 残铁 +24',
    buffDesc: '下局珍绝 +25% · 杀气 +1',
  },
};

export const PLOT_COSTS: Array<{ cur: 'herb' | 'iron'; n: number } | null> = [
  null,
  null,
  { cur: 'herb', n: 8 },
  { cur: 'iron', n: 10 },
  { cur: 'herb', n: 18 },
  { cur: 'iron', n: 24 },
];

function todayKey(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ensure profile.garden exists, grant starter seeds once, and grant Sun Ao's daily return seed gift once per calendar day */
export function ensureGarden(p: Profile, now = Date.now()): { state: GardenState; dailyGift: SeedId[] } {
  let freshInit = false;
  if (!p.garden) {
    freshInit = true;
    p.garden = {
      unlocked: 2,
      plots: Array.from({ length: PLOT_COUNT }, () => null),
      seeds: { angelica: 2, ironorchid: 1, frostlotus: 1, xuanzhi: 0 },
      buff: null,
      dailyDay: todayKey(now),
    };
  }
  const g = p.garden;
  if (!Array.isArray(g.plots) || g.plots.length < PLOT_COUNT) {
    const old = Array.isArray(g.plots) ? g.plots : [];
    g.plots = Array.from({ length: PLOT_COUNT }, (_, i) => old[i] ?? null);
  }
  if (!g.seeds) g.seeds = { angelica: 0, ironorchid: 0, frostlotus: 0, xuanzhi: 0 };
  for (const id of SEED_ORDER) if (typeof g.seeds[id] !== 'number') g.seeds[id] = 0;
  g.unlocked = Math.max(2, Math.min(PLOT_COUNT, g.unlocked || 2));

  const dailyGift: SeedId[] = [];
  const today = todayKey(now);
  if (!freshInit && g.dailyDay !== today) {
    g.dailyDay = today;
    g.seeds.angelica += 1;
    g.seeds.ironorchid += 1;
    dailyGift.push('angelica', 'ironorchid');
  }
  return { state: g, dailyGift };
}

export interface PlotStatus {
  /** 0 = empty, 1 = sprout, 2 = growing, 3 = ripe */
  stage: 0 | 1 | 2 | 3;
  done: boolean;
  stepsDone: number;
  stepsTotal: number;
  leftSteps: number;
  leftMins: number;
}

export function plotStatus(plot: GardenPlot | null, now = Date.now()): PlotStatus {
  if (!plot) return { stage: 0, done: false, stepsDone: 0, stepsTotal: 0, leftSteps: 0, leftMins: 0 };
  const def = SEEDS[plot.seed] ?? SEEDS.angelica;
  const elapsedMin = Math.max(0, (now - plot.plantedAt) / 60000);
  const timeSteps = Math.floor(elapsedMin / def.minsPerStep);
  const stepsDone = Math.min(def.steps, Math.max(0, plot.rooms) + timeSteps);
  const done = stepsDone >= def.steps;
  const ratio = stepsDone / def.steps;
  const stage: 0 | 1 | 2 | 3 = done ? 3 : ratio >= 0.45 ? 2 : 1;
  const leftSteps = Math.max(0, def.steps - stepsDone);
  const fracMin = elapsedMin - timeSteps * def.minsPerStep;
  const leftMins = done ? 0 : Math.max(1, Math.ceil(leftSteps * def.minsPerStep - fracMin));
  return { stage, done, stepsDone, stepsTotal: def.steps, leftSteps, leftMins };
}

export function isPlotUnlocked(p: Profile, idx: number): boolean {
  const { state } = ensureGarden(p);
  return idx >= 0 && idx < state.unlocked;
}

export function canUnlockPlot(p: Profile, idx: number): boolean {
  const { state } = ensureGarden(p);
  if (idx !== state.unlocked || idx >= PLOT_COUNT) return false;
  const cost = PLOT_COSTS[idx];
  return !!cost && p[cost.cur] >= cost.n;
}

export function unlockPlot(p: Profile, idx: number): boolean {
  if (!canUnlockPlot(p, idx)) return false;
  const cost = PLOT_COSTS[idx]!;
  p[cost.cur] -= cost.n;
  p.garden!.unlocked = idx + 1;
  return true;
}

export function plantSeed(p: Profile, idx: number, seed: SeedId, now = Date.now()): boolean {
  const { state } = ensureGarden(p, now);
  if (idx < 0 || idx >= state.unlocked || state.plots[idx]) return false;
  if ((state.seeds[seed] ?? 0) <= 0) return false;
  state.seeds[seed] -= 1;
  state.plots[idx] = { seed, plantedAt: now, rooms: 0 };
  return true;
}

export function harvestPlot(p: Profile, idx: number, now = Date.now()): { seed: SeedDef; herb: number; iron: number; buff?: GardenBuffId } | null {
  const { state } = ensureGarden(p, now);
  const plot = state.plots[idx];
  if (!plot) return null;
  const st = plotStatus(plot, now);
  if (!st.done) return null;
  const def = SEEDS[plot.seed];
  p.herb += def.herb;
  p.iron += def.iron;
  if (def.buff) state.buff = def.buff;
  state.plots[idx] = null;
  return { seed: def, herb: def.herb, iron: def.iron, buff: def.buff };
}

/** Advance all planted plots when the hero clears a combat room; returns names of plots that just ripened */
export function advanceGardenRooms(p: Profile, rooms = 1, now = Date.now()): SeedDef[] {
  const { state } = ensureGarden(p, now);
  const ripened: SeedDef[] = [];
  for (let i = 0; i < state.unlocked; i++) {
    const plot = state.plots[i];
    if (!plot) continue;
    const before = plotStatus(plot, now).done;
    plot.rooms += rooms;
    const after = plotStatus(plot, now).done;
    if (!before && after) ripened.push(SEEDS[plot.seed]);
  }
  return ripened;
}

export function totalSeeds(p: Profile): number {
  const { state } = ensureGarden(p);
  return SEED_ORDER.reduce((s, id) => s + (state.seeds[id] ?? 0), 0);
}

export function ripePlotIndices(p: Profile, now = Date.now()): number[] {
  const { state } = ensureGarden(p, now);
  const out: number[] = [];
  for (let i = 0; i < state.unlocked; i++) {
    if (plotStatus(state.plots[i], now).done) out.push(i);
  }
  return out;
}

export function hasPlantablePlot(p: Profile, now = Date.now()): boolean {
  const { state } = ensureGarden(p, now);
  if (totalSeeds(p) <= 0) return false;
  for (let i = 0; i < state.unlocked; i++) if (!state.plots[i]) return true;
  return false;
}

/** Roll a seed reward during a run (room clear, secret treasure chest, or boss kill) */
export function rollSeedDrop(source: 'room' | 'chest' | 'boss', rng = Math.random): SeedId | null {
  if (source === 'room') {
    if (rng() > 0.30) return null;
    const u = rng();
    return u < 0.45 ? 'angelica' : u < 0.80 ? 'ironorchid' : u < 0.96 ? 'frostlotus' : 'xuanzhi';
  }
  if (source === 'chest') {
    if (rng() > 0.72) return null;
    const u = rng();
    return u < 0.25 ? 'angelica' : u < 0.52 ? 'ironorchid' : u < 0.82 ? 'frostlotus' : 'xuanzhi';
  }
  // boss kill: guaranteed rare or mid-tier seed!
  const u = rng();
  return u < 0.45 ? 'xuanzhi' : u < 0.85 ? 'frostlotus' : 'ironorchid';
}

export function addSeed(p: Profile, seed: SeedId, n = 1): void {
  const { state } = ensureGarden(p);
  state.seeds[seed] = (state.seeds[seed] ?? 0) + n;
}

// ------------------------------------------------------------------ 3D Voxel Garden Plot Builder (pure 7 cm voxel blocks!)
const GCOL = {
  wood: 0x6a5038, woodD: 0x48362a, woodL: 0x8a6c4c,
  soil: 0x463526, soilD: 0x32251a, soilWet: 0x3b2d20,
  stone: 0x7e7a72, stoneD: 0x5c5852, stoneL: 0x98948a,
  stem: 0x4a7434, stemL: 0x629044, stemD: 0x345424,
  brush: 0x6e6244, brushD: 0x4e4430,
};

/** Build a pure 3D voxel garden plot (1.82 × 1.38 m) depicting locked / empty / sprout / growing / ripe states */
export function buildGardenPlotMesh(unlocked: boolean, plot: GardenPlot | null, now = Date.now()): THREE.Group {
  const vw = new VoxWorld(CELL);
  const hw = 13, hd = 9; // 27 × 19 cells = 1.89 × 1.33 m

  // 1) Raised timber curb frame
  vw.box(-hw, 0, -hd, hw, 2, hd, unlocked ? GCOL.wood : GCOL.stoneD);
  vw.box(-hw, 0, -hd, hw, 0, hd, unlocked ? GCOL.woodD : 0x46423c);
  vw.box(-hw, 2, -hd, hw, 2, hd, unlocked ? GCOL.woodL : GCOL.stone);
  // Corner timber / stone pegs
  for (const cx of [-hw, hw]) for (const cz of [-hd, hd]) vw.box(cx, 0, cz, cx, 3, cz, unlocked ? GCOL.woodD : GCOL.stoneL);

  if (!unlocked) {
    // Untamed wild rocky plot awaiting reclamation
    vw.box(-hw + 2, 1, -hd + 2, hw - 2, 2, hd - 2, GCOL.brushD);
    vw.box(-7, 3, -4, -3, 4, 0, GCOL.stone);
    vw.box(3, 3, 1, 7, 5, 4, GCOL.stoneD);
    vw.box(4, 5, 2, 6, 5, 3, GCOL.stoneL);
    vw.box(-1, 3, -2, 2, 4, 2, GCOL.brush);
    // Small wooden reclamation stake in the center
    vw.box(0, 3, 0, 0, 9, 0, GCOL.woodD);
    vw.box(-2, 7, 0, 2, 8, 0, GCOL.woodL);
  } else {
    // Rich dark tilled soil with neat irrigation furrows
    const st = plotStatus(plot, now);
    const soilC = st.stage > 0 ? GCOL.soilWet : GCOL.soil;
    vw.box(-hw + 2, 1, -hd + 2, hw - 2, 2, hd - 2, soilC);
    for (const fz of [-4, 0, 4]) vw.box(-hw + 3, 2, fz, hw - 3, 2, fz, GCOL.soilD);

    if (plot && st.stage > 0) {
      const def = SEEDS[plot.seed];
      const spots: Array<[number, number]> = [[-7, -3], [0, -3], [7, -3], [-7, 3], [0, 3], [7, 3]];
      for (let i = 0; i < spots.length; i++) {
        const [sx, sz] = spots[i];
        const hOff = (i % 2);
        if (st.stage === 1) {
          // Stage 1: tender twin voxel sprouts
          vw.box(sx, 3, sz, sx, 4 + hOff, sz, GCOL.stem);
          vw.box(sx - 1, 4 + hOff, sz, sx + 1, 4 + hOff, sz, GCOL.stemL);
        } else if (st.stage === 2) {
          // Stage 2: leafy branching stems + colored emerging buds
          vw.box(sx, 3, sz, sx, 7 + hOff, sz, GCOL.stemD);
          vw.box(sx - 2, 5, sz - 1, sx + 2, 6, sz + 1, GCOL.stem);
          vw.box(sx - 1, 7 + hOff, sz - 1, sx + 1, 8 + hOff, sz + 1, GCOL.stemL);
          vw.box(sx, 9 + hOff, sz, sx, 9 + hOff, sz, def.col);
        } else {
          // Stage 3: lush mature radiant crop with distinct silhouette per species!
          if (plot.seed === 'xuanzhi') {
            // 九叶玄芝: tiered glowing purple-gold lingzhi mushroom caps!
            vw.box(sx, 3, sz, sx, 7 + hOff, sz, 0x5c3648);
            vw.box(sx - 2, 8 + hOff, sz - 2, sx + 2, 9 + hOff, sz + 2, 0x8e42b8);
            vw.box(sx - 1, 10 + hOff, sz - 1, sx + 1, 11 + hOff, sz + 1, def.col, 1);
          } else if (plot.seed === 'frostlotus') {
            // 霜魂莲: wide jade lotus pads + glowing frost-cyan blossom!
            vw.box(sx - 2, 3, sz - 2, sx + 2, 4, sz + 2, GCOL.stemD);
            vw.box(sx, 5, sz, sx, 8 + hOff, sz, GCOL.stemL);
            vw.box(sx - 2, 8 + hOff, sz - 1, sx + 2, 10 + hOff, sz + 1, def.col, 1);
            vw.box(sx - 1, 9 + hOff, sz - 2, sx + 1, 10 + hOff, sz + 2, def.col, 1);
            vw.box(sx, 11 + hOff, sz, sx, 11 + hOff, sz, 0xe8fbff, 1);
          } else if (plot.seed === 'ironorchid') {
            // 赤铁兰: sharp sword-like orchid leaves + fiery crimson-orange spikes!
            vw.box(sx - 2, 3, sz, sx + 2, 6, sz, GCOL.stemD);
            vw.box(sx, 3, sz - 2, sx, 6, sz + 2, GCOL.stem);
            vw.box(sx, 7, sz, sx, 11 + hOff, sz, def.col, 1);
            vw.box(sx - 1, 9 + hOff, sz - 1, sx + 1, 10 + hOff, sz + 1, 0xffbe68, 1);
          } else {
            // 白芷草: lush emerald cluster topped with bright white-jade umbel blooms!
            vw.box(sx - 2, 3, sz - 1, sx + 2, 6, sz + 1, GCOL.stem);
            vw.box(sx - 1, 5, sz - 2, sx + 1, 7, sz + 2, GCOL.stemL);
            vw.box(sx - 1, 8 + hOff, sz - 1, sx + 1, 9 + hOff, sz + 1, def.col, 1);
            vw.box(sx, 10 + hOff, sz, sx, 10 + hOff, sz, 0xf2fff4, 1);
          }
        }
      }
    }
  }

  const g = new THREE.Group();
  for (const m of vw.build({ rim: 0.25, edge: 0.14 })) {
    if (!m.userData.shadowTiled && m.name !== 'shadowTile') m.castShadow = true;
    g.add(m);
  }
  return g;
}
