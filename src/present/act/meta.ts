import type { Profile } from './profile';
import { msg } from './i18n';

export type Cur = 'iron' | 'herb';
export type Who = 'forge' | 'medic';
export interface MetaUp { id: string; who: Who; cur: Cur; name: string; desc: [string, string]; costs: number[] }

import { UP_COPY } from './hideoutLines';
export const META: MetaUp[] = [
  { id: 'blade', who: 'forge', cur: 'iron', name: '刀身', desc: ['斩击增伤并提暴击', '每级+5%伤+2%暴'], costs: [20, 45, 85] },
  { id: 'darts', who: 'forge', cur: 'iron', name: '镖匣', desc: ['飞镖扩容且快装', '每级+1枚-12%冷却'], costs: [25, 55] },
  { id: 'manual', who: 'forge', cur: 'iron', name: '旧谱', desc: ['每局开局', '先挑一本刀谱'], costs: [75] },
  { id: 'vigor', who: 'medic', cur: 'herb', name: '筋骨', desc: ['生命上限提高', '每级加十二'], costs: [10, 22, 38] },
  { id: 'ear', who: 'medic', cur: 'herb', name: '听宫', desc: ['敌人起手更慢', '每级慢六分易识破'], costs: [14, 30] },
  { id: 'intent', who: 'medic', cur: 'herb', name: '杀气', desc: ['每间开场带杀气', '自带一格杀气半格气'], costs: [20] },
  { id: 'leech', who: 'medic', cur: 'herb', name: '养气', desc: ['破甲或完美闪避', '每级回复3点生命'], costs: [24, 48] },
  { id: 'breath', who: 'medic', cur: 'herb', name: '闭息', desc: ['每局一次', '致命伤留二成半血'], costs: [35] },
];

export function level(p: Profile, id: string): number { return p.perks[id] ?? 0; }

export function nextCost(p: Profile, id: string): number | null {
  const up = META.find(x => x.id === id);
  return up?.costs[level(p, id)] ?? null;
}

export function canBuy(p: Profile, id: string): boolean {
  const up = META.find(x => x.id === id);
  const cost = nextCost(p, id);
  return !!up && cost !== null && p[up.cur] >= cost;
}

/** act-161: the medic's old list (vigor / ear / intent / leech / breath) retired into the altar's cards — her 'something to buy' is the altar's */
export function hasAffordable(p: Profile, who?: Who): boolean {
  if (who === 'medic') return hasArcanaActionable(p);
  return META.some(u => u.who !== 'medic' && (!who || u.who === who) && canBuy(p, u.id)) || (!who && hasArcanaActionable(p));
}

export function buy(p: Profile, id: string): boolean {
  const up = META.find(x => x.id === id);
  if (!up || !canBuy(p, id)) return false;
  const cost = nextCost(p, id)!;
  p[up.cur] -= cost;
  p.perks[id] = level(p, id) + 1;
  return true;
}

export interface MirrorSide { name: string; desc: string; vals: [number, number, number]; unit: string }
export interface MirrorDef { id: string; group: string; cur: Cur; costs: [number, number, number]; sides: [MirrorSide, MirrorSide] }
/** act-118: 碑铭潜能 (Hades Mirror of Night-style dual-aspect permanent talents at 复仇碑) */
export const MIRROR: MirrorDef[] = [
  { id: 'edge', group: '锋势', cur: 'iron', costs: [8, 18, 32], sides: [
    { name: '破军', desc: '满血敌人首刀必暴且增伤', vals: [20, 32, 45], unit: '%' },
    { name: '叠势', desc: '变招连击每档额外增伤', vals: [5, 9, 13], unit: '%' },
  ] },
  { id: 'step', group: '身法', cur: 'herb', costs: [8, 18, 32], sides: [
    { name: '追风', desc: '冲刺冷却缩短更灵动', vals: [8, 14, 20], unit: '%' },
    { name: '铁骨', desc: '破势或完美闪避后反击增伤', vals: [15, 28, 40], unit: '%' },
  ] },
  { id: 'arms', group: '兵械', cur: 'iron', costs: [12, 26, 44], sides: [
    { name: '暗影', desc: '对中镖敌人斩击额外增伤', vals: [12, 22, 32], unit: '%' },
    { name: '崩岳', desc: '全招削减敌人架势加快', vals: [15, 28, 40], unit: '%' },
  ] },
  { id: 'luck', group: '气运', cur: 'herb', costs: [12, 26, 44], sides: [
    { name: '绝品缘', desc: '秘传三选一珍绝品概率提高', vals: [15, 30, 45], unit: '%' },
    { name: '聚财', desc: '每过一关按身上铜钱生息，单次有封顶', vals: [10, 18, 25], unit: '%' },
  ] },
];

export function mirrorState(p: Profile, id: string): { lv: number; side: 0 | 1 } {
  const s = p.mirror?.[id];
  return { lv: s?.lv ?? 0, side: s?.side === 1 ? 1 : 0 };
}
export function mirrorNextCost(p: Profile, id: string): number | null {
  const m = MIRROR.find(x => x.id === id);
  return m?.costs[mirrorState(p, id).lv] ?? null;
}
export function canBuyMirror(p: Profile, id: string): boolean {
  const m = MIRROR.find(x => x.id === id), cost = mirrorNextCost(p, id);
  return !!m && cost !== null && p[m.cur] >= cost;
}
export function hasMirrorAffordable(_p: Profile): boolean { return false; }
export function buyMirror(p: Profile, id: string): boolean {
  const m = MIRROR.find(x => x.id === id);
  if (!m || !canBuyMirror(p, id)) return false;
  const cost = mirrorNextCost(p, id)!, st = mirrorState(p, id);
  p[m.cur] -= cost;
  if (!p.mirror) p.mirror = {};
  p.mirror[id] = { lv: st.lv + 1, side: st.side };
  return true;
}
export function flipMirror(p: Profile, id: string): 0 | 1 {
  const st = mirrorState(p, id), next: 0 | 1 = st.side === 0 ? 1 : 0;
  if (!p.mirror) p.mirror = {};
  p.mirror[id] = { lv: st.lv, side: next };
  return next;
}
function mirrorVal(p: Profile, id: string, side: 0 | 1): number {
  const m = MIRROR.find(x => x.id === id), st = mirrorState(p, id);
  if (!m || st.lv <= 0 || st.side !== side) return 0;
  return m.sides[side].vals[Math.min(2, st.lv - 1)] ?? 0;
}

export interface ArcanaDef {
  id: string;
  name: string;
  short: string;
  /** 0 = center Awakening card (auto-activates when >= 3 other cards are active) */
  grasp: number;
  unlockCost: number;
  upgradeCosts: [number, number];
  vals: [number, number, number];
  unit: string;
  statLabel: string;
  desc: string;
  col: string;
  glyph: string[];
}

export const ARCANA_BASE_CAP = 6;
export const ARCANA_CAP_STEP = 2;
/** act-161 / 11-28: three widenings 6 -> 12 with stepped late-run herb sinks */
export const ARCANA_CAP_COSTS = [20, 38, 60];
/** what the three widenings past 12 used to cost: paid back to a save that bought them */
const ARCANA_CAP_REFUND = [44, 62, 84];

/** act-149: 孙媪药炉冥想 · 3×3 周天悟性牌阵 (Hades 2 Altar of Ashes style: toggle cards within Grasp cap + center 0-grasp Awakening!) */
export const ARCANA: ArcanaDef[] = [
  {
    id: 'vigor', name: '沸血筋骨', short: '筋骨', grasp: 1, unlockCost: 0, upgradeCosts: [22, 45],
    vals: [12, 24, 36], unit: '', statLabel: '生命上限', desc: '运药活血，周身气血更盛', col: '#7ef0a8',
    glyph: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...', '.......'],
  },
  {
    id: 'ear', name: '贯耳听宫', short: '听宫', grasp: 2, unlockCost: 0, upgradeCosts: [25, 50],
    vals: [6, 12, 18], unit: '%', statLabel: '起手放慢', desc: '凝神听风，敌人出招破绽更显', col: '#90e4ff',
    glyph: ['..###..', '.#...#.', '#..o..#', '#.ooo.#', '#..o..#', '.#...#.', '..###..'],
  },
  {
    id: 'wind', name: '踏风步', short: '踏风', grasp: 1, unlockCost: 16, upgradeCosts: [24, 48],
    vals: [8, 14, 20], unit: '%', statLabel: '冲刺缩冷', desc: '吐纳轻身，闪避冲刺周转更快', col: '#8ceeff',
    glyph: ['.......', '....#..', '######.', '#######', '######.', '....#..', '.......'],
  },
  {
    id: 'intent', name: '出鞘杀意', short: '杀意', grasp: 2, unlockCost: 22, upgradeCosts: [30, 58],
    vals: [1, 2, 2], unit: '格', statLabel: '开场杀意', desc: '入阵先蓄杀意，更快斩出不见刀', col: '#ffb866',
    glyph: ['...#...', '..###..', '..###..', '.#####.', '.##o##.', '..###..', '...#...'],
  },
  {
    id: 'center', name: '周天归元', short: '归元', grasp: 0, unlockCost: 26, upgradeCosts: [36, 68],
    vals: [5, 10, 15], unit: '%', statLabel: '全招增伤', desc: '【零悟性唤醒】同启3张牌自动点亮', col: '#ffe278',
    glyph: ['...o...', '..ooo..', '.oo#oo.', 'oo###oo', '.oo#oo.', '..ooo..', '...o...'],
  },
  {
    id: 'leech', name: '破势养气', short: '养气', grasp: 2, unlockCost: 28, upgradeCosts: [34, 64],
    vals: [3, 5, 7], unit: '点', statLabel: '破势回血', desc: '破势弹反或完美闪避立回气血', col: '#84f6b8',
    glyph: ['...#...', '..###..', '.##o##.', '##ooo##', '.##o##.', '..###..', '...#...'],
  },
  {
    id: 'keen', name: '藏锋心眼', short: '心眼', grasp: 2, unlockCost: 34, upgradeCosts: [36, 70],
    vals: [4, 8, 12], unit: '%', statLabel: '暴击几率', desc: '静心观隙，刀锋更易斩中要害', col: '#ffd080',
    glyph: ['.......', '.#####.', '#..o..#', '#.ooo.#', '#..o..#', '.#####.', '.......'],
  },
  {
    id: 'poise', name: '崩岳断骨', short: '断骨', grasp: 3, unlockCost: 40, upgradeCosts: [40, 74],
    vals: [12, 22, 32], unit: '%', statLabel: '削韧加快', desc: '沉肩坠肘，全招更易崩碎敌架势', col: '#f0b880',
    glyph: ['.#...#.', '..###..', '...#...', '..###..', '...#...', '..###..', '.#...#.'],
  },
  {
    id: 'breath', name: '绝处闭息', short: '闭息', grasp: 4, unlockCost: 50, upgradeCosts: [46, 86],
    vals: [1, 1, 1], unit: '次', statLabel: '死境留命', desc: '致命伤闭息护心，留二成半血续战', col: '#ff9690',
    glyph: ['..###..', '.#####.', '##o#o##', '#######', '.#####.', '..#.#..', '.......'],
  },
];

/** the medic's old list: its levels live on only as altar ranks (act-161) */
const LEGACY_MEDIC = ['vigor', 'ear', 'intent', 'leech', 'breath'];
export function ensureArcana(p: Profile) {
  if (!p.arcana) p.arcana = { cap: ARCANA_BASE_CAP, rank: {}, active: {} };
  const st = p.arcana;
  // act-182: Mirror of Night (复仇碑阴阳潜能) retired to eliminate confusion with Sun Ao's Altar — refund 100% of spent iron/herb cleanly once
  if (p.mirror && Object.keys(p.mirror).length > 0) {
    for (const m of MIRROR) {
      const ms = p.mirror[m.id];
      const lv = Math.max(0, Math.min(m.costs.length, ms?.lv ?? 0));
      for (let k = 0; k < lv; k++) p[m.cur] += m.costs[k];
    }
    p.mirror = {};
  }
  // act-161: fold each old medic level into its card once, then drop it — it used to stay in p.perks and runMods() counted both
  // (a maxed old save: +72 health for +36, three starting intent, two death-defies)
  let folded = false;
  for (const id of LEGACY_MEDIC) {
    const lv = p.perks?.[id] ?? 0;
    if (lv > 0) { st.rank[id] = Math.max(st.rank[id] ?? 0, Math.min(3, lv)); folded = true; }
    if (p.perks && id in p.perks) delete p.perks[id];
  }
  for (const def of ARCANA) {
    if (def.unlockCost === 0 && !(st.rank[def.id] > 0)) st.rank[def.id] = 1;
  }
  // act-161: the cap tops out at 12 now; a save that widened past it gets that herb back, and its dearest cards switch off until the rest fit
  const maxCap = ARCANA_BASE_CAP + ARCANA_CAP_STEP * ARCANA_CAP_COSTS.length;
  if (st.cap > maxCap) {
    const over = Math.round((st.cap - maxCap) / ARCANA_CAP_STEP);
    for (let i = 0; i < over; i++) p.herb += ARCANA_CAP_REFUND[i] ?? 0;
    st.cap = maxCap;
    const dear = [...ARCANA].sort((a, b) => b.grasp - a.grasp);
    for (const def of dear) { if (arcanaUsed(p) <= st.cap) break; if (def.grasp > 0 && st.active[def.id]) st.active[def.id] = false; }
  }
  // an old save just folded in: switch on what fits (cheapest first) so nothing she paid for goes dark on its own
  if (folded) for (const def of [...ARCANA].sort((a, b) => a.grasp - b.grasp)) {
    if (def.grasp > 0 && (st.rank[def.id] ?? 0) > 0 && !st.active[def.id] && arcanaUsed(p) + def.grasp <= st.cap) st.active[def.id] = true;
  }
  return st;
}

export function arcanaRank(p: Profile, id: string): number {
  const st = p.arcana;
  if (st) return Math.max(0, Math.min(3, st.rank[id] ?? 0));
  const def = ARCANA.find(a => a.id === id);
  return def && def.unlockCost === 0 ? 1 : 0;
}

export function arcanaCap(p: Profile): number {
  return p.arcana?.cap ?? ARCANA_BASE_CAP;
}

export function arcanaNextCapCost(p: Profile): number | null {
  const cap = arcanaCap(p);
  const idx = Math.floor((cap - ARCANA_BASE_CAP) / ARCANA_CAP_STEP);
  return ARCANA_CAP_COSTS[idx] ?? null;
}

export function arcanaUsed(p: Profile): number {
  const st = p.arcana;
  if (!st) return 0;
  let sum = 0;
  for (const def of ARCANA) {
    if (def.grasp > 0 && st.active[def.id] && (st.rank[def.id] ?? 0) > 0) sum += def.grasp;
  }
  return sum;
}

export function arcanaActiveCount(p: Profile): number {
  const st = p.arcana;
  if (!st) return 0;
  let n = 0;
  for (const def of ARCANA) {
    if (def.grasp > 0 && st.active[def.id] && (st.rank[def.id] ?? 0) > 0) n++;
  }
  return n;
}

export function isArcanaActive(p: Profile, id: string): boolean {
  const st = p.arcana;
  if (!st || !(st.rank[id] > 0)) return false;
  const def = ARCANA.find(a => a.id === id);
  if (!def) return false;
  if (def.grasp === 0) return arcanaActiveCount(p) >= 3;
  return !!st.active[id];
}

export function arcanaUpgradeCost(p: Profile, id: string): number | null {
  const def = ARCANA.find(a => a.id === id);
  if (!def) return null;
  const rk = arcanaRank(p, id);
  if (rk <= 0 || rk >= 3) return null;
  return def.upgradeCosts[rk - 1] ?? null;
}

export function unlockArcana(p: Profile, id: string): boolean {
  const def = ARCANA.find(a => a.id === id);
  if (!def) return false;
  const st = ensureArcana(p);
  if ((st.rank[id] ?? 0) > 0) return false;
  if (p.herb < def.unlockCost) return false;
  p.herb -= def.unlockCost;
  st.rank[id] = 1;
  // Auto-activate upon first comprehension if it fits within Grasp cap!
  if (def.grasp > 0 && arcanaUsed(p) + def.grasp <= st.cap) {
    st.active[id] = true;
  }
  return true;
}

export function toggleArcana(p: Profile, id: string): 'on' | 'off' | 'noCap' | 'locked' | 'auto' {
  const def = ARCANA.find(a => a.id === id);
  if (!def) return 'locked';
  const st = ensureArcana(p);
  if (!(st.rank[id] > 0)) return 'locked';
  if (def.grasp === 0) return 'auto';
  if (st.active[id]) {
    st.active[id] = false;
    return 'off';
  }
  if (arcanaUsed(p) + def.grasp > st.cap) return 'noCap';
  st.active[id] = true;
  return 'on';
}

export function upgradeArcana(p: Profile, id: string): boolean {
  const cost = arcanaUpgradeCost(p, id);
  if (cost == null || p.herb < cost) return false;
  const st = ensureArcana(p);
  p.herb -= cost;
  st.rank[id] = Math.min(3, (st.rank[id] ?? 1) + 1);
  return true;
}

export function expandArcanaCap(p: Profile): boolean {
  const cost = arcanaNextCapCost(p);
  if (cost == null || p.herb < cost) return false;
  const st = ensureArcana(p);
  p.herb -= cost;
  st.cap += ARCANA_CAP_STEP;
  return true;
}

export function hasArcanaActionable(p: Profile): boolean {
  const capCost = arcanaNextCapCost(p);
  if (capCost != null && p.herb >= capCost) return true;
  return ARCANA.some(def => {
    const rk = arcanaRank(p, def.id);
    if (rk <= 0) return p.herb >= def.unlockCost;
    const uc = arcanaUpgradeCost(p, def.id);
    return uc != null && p.herb >= uc;
  });
}

/** Hades-2 camp payoff hook: returns the single clearest next upgrade the player can afford right now on returning home. */
export function firstAffordableHint(p: Profile): string | null {
  for (const u of META) {
    if (u.who !== 'medic' && canBuy(p, u.id)) {
      return msg`回古窑可强化「${u.name}」`;
    }
  }
  const capCost = arcanaNextCapCost(p);
  if (capCost != null && p.herb >= capCost) return '药炉可扩「悟性容量」';
  for (const def of ARCANA) {
    const rk = arcanaRank(p, def.id);
    if (rk <= 0 && p.herb >= def.unlockCost) return msg`药炉可领悟「${def.name}」`;
    const uc = arcanaUpgradeCost(p, def.id);
    if (rk > 0 && uc != null && p.herb >= uc) return msg`药炉可升阶「${def.name}」`;
  }
  return null;
}

function arcanaVal(p: Profile, id: string): number {
  if (!isArcanaActive(p, id)) return 0;
  const def = ARCANA.find(a => a.id === id);
  const rk = arcanaRank(p, id);
  return def && rk > 0 ? def.vals[Math.min(2, rk - 1)] ?? 0 : 0;
}

export interface RunMods {
  dmgMul: number; critBonus: number; dartBonus: number; startCoins: number; hpBonus: number; deathDefy: number; startIntent: number; windupMul: number; startManual: boolean; poiseHeal: number;
  /** act-118: 碑铭潜能 modifiers */
  firstStrikeBonus: number; styleBonus: number; dashCdMul: number; counterBonus: number; markedDmgBonus: number; poiseDmgMul: number; rareOddsBonus: number; interestRate: number;
}

export function runMods(p: Profile): RunMods {
  ensureArcana(p);   // act-161: old medic levels are folded into the altar here, so they count once
  const gBuff = p.garden?.buff;
  const aCenter = arcanaVal(p, 'center') / 100;
  const aWind = arcanaVal(p, 'wind') / 100;
  const aPoise = arcanaVal(p, 'poise') / 100;
  return {
    dmgMul: (1 + 0.05 * level(p, 'blade')) * (1 + aCenter),
    critBonus: 0.02 * level(p, 'blade') + arcanaVal(p, 'keen') / 100,
    dartBonus: level(p, 'darts'),
    startCoins: gBuff === 'lotus' ? 25 : 0,
    hpBonus: arcanaVal(p, 'vigor') + (gBuff === 'lotus' ? 18 : 0),
    deathDefy: arcanaVal(p, 'breath') > 0 ? 1 : 0,
    startIntent: arcanaVal(p, 'intent') + (gBuff === 'xuanzhi' ? 1 : 0),
    windupMul: 1 + arcanaVal(p, 'ear') / 100,
    startManual: level(p, 'manual') >= 1,
    poiseHeal: arcanaVal(p, 'leech'),
    firstStrikeBonus: 0,
    styleBonus: 0,
    dashCdMul: 1 - aWind,
    counterBonus: 0,
    markedDmgBonus: 0,
    poiseDmgMul: 1 + aPoise,
    rareOddsBonus: gBuff === 'xuanzhi' ? 0.25 : 0,
    interestRate: 0,
  };
}

export interface RunStats { rooms: number; elites: number; boss: boolean; won: boolean; kills: number }

export function runReward(s: RunStats): { iron: number; herb: number } {
  return {
    // 11-28 balance overhaul: pace full meta mastery across ~12–18 runs (5–7 clears); mid-Act 2 death affords 1–2 deliberate upgrades
    iron: Math.round(2 + 1.0 * s.rooms + 1.5 * s.elites + (s.boss ? 6 : 0) + (s.won ? 10 : 0)),
    herb: Math.round(2 + 1.0 * s.rooms + Math.floor(s.kills / 12) * 2 + (s.boss ? 4 : 0) + (s.won ? 10 : 0)),
  };
}

export function bank(p: Profile, s: RunStats): { iron: number; herb: number } {
  const reward = runReward(s);
  p.iron += reward.iron;
  p.herb += reward.herb;
  p.runs += 1;
  if (s.won) p.wins += 1;
  else p.deaths += 1;
  return reward;
}

// act-20: agy's names and lines for the upgrades
for (const u of META) { const c = UP_COPY[u.id]; if (c) { u.name = c[0]; u.desc = [c[1], c[2]]; } }
