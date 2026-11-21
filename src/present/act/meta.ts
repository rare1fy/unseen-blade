import type { Profile } from './profile';

export type Cur = 'iron' | 'herb';
export type Who = 'forge' | 'medic';
export interface MetaUp { id: string; who: Who; cur: Cur; name: string; desc: [string, string]; costs: number[] }

import { UP_COPY } from './hideoutLines';
export const META: MetaUp[] = [
  { id: 'blade', who: 'forge', cur: 'iron', name: '刀身', desc: ['斩击增伤并提暴击', '每级+12%伤+4%暴'], costs: [10, 22, 40] },
  { id: 'darts', who: 'forge', cur: 'iron', name: '镖匣', desc: ['飞镖扩容且快装', '每级+1枚-15%冷却'], costs: [14, 32] },
  { id: 'reroll', who: 'forge', cur: 'iron', name: '重铸', desc: ['选牌可换一批', '每级每局+1次重随'], costs: [16, 36] },
  { id: 'manual', who: 'forge', cur: 'iron', name: '旧谱', desc: ['每局开局', '先挑一本刀谱'], costs: [35] },
  { id: 'vigor', who: 'medic', cur: 'herb', name: '筋骨', desc: ['生命上限提高', '每级加二十'], costs: [10, 22, 38] },
  { id: 'ear', who: 'medic', cur: 'herb', name: '听宫', desc: ['敌人起手更慢', '每级慢一成易识破'], costs: [14, 30] },
  { id: 'intent', who: 'medic', cur: 'herb', name: '杀气', desc: ['每间开场带杀气', '自带一格杀气半格气'], costs: [20] },
  { id: 'leech', who: 'medic', cur: 'herb', name: '养气', desc: ['破甲或完美闪避', '每级回复5点生命'], costs: [24, 48] },
  { id: 'breath', who: 'medic', cur: 'herb', name: '闭息', desc: ['每局一次', '致命伤留四成血'], costs: [35] },
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

export function hasAffordable(p: Profile, who?: Who): boolean {
  return META.some(u => (!who || u.who === who) && canBuy(p, u.id));
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
    { name: '破军', desc: '满血敌人首刀必暴且增伤', vals: [25, 45, 65], unit: '%' },
    { name: '叠势', desc: '变招连击每档额外增伤', vals: [10, 18, 26], unit: '%' },
  ] },
  { id: 'step', group: '身法', cur: 'herb', costs: [8, 18, 32], sides: [
    { name: '追风', desc: '冲刺冷却缩短更灵动', vals: [12, 22, 30], unit: '%' },
    { name: '铁骨', desc: '破势或完美闪避后反击增伤', vals: [25, 45, 65], unit: '%' },
  ] },
  { id: 'arms', group: '兵械', cur: 'iron', costs: [12, 26, 44], sides: [
    { name: '暗影', desc: '对中镖敌人斩击额外增伤', vals: [18, 32, 46], unit: '%' },
    { name: '崩岳', desc: '全招削减敌人架势加快', vals: [20, 38, 55], unit: '%' },
  ] },
  { id: 'luck', group: '气运', cur: 'herb', costs: [12, 26, 44], sides: [
    { name: '绝品缘', desc: '秘传三选一珍绝品概率提高', vals: [15, 30, 45], unit: '%' },
    { name: '聚财', desc: '进新屋按身上铜钱生息', vals: [12, 22, 32], unit: '%' },
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
export function hasMirrorAffordable(p: Profile): boolean { return MIRROR.some(m => canBuyMirror(p, m.id)); }
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

export interface RunMods {
  dmgMul: number; critBonus: number; dartBonus: number; rerolls: number; hpBonus: number; deathDefy: number; startIntent: number; windupMul: number; startManual: boolean; poiseHeal: number;
  /** act-118: 碑铭潜能 modifiers */
  firstStrikeBonus: number; styleBonus: number; dashCdMul: number; counterBonus: number; markedDmgBonus: number; poiseDmgMul: number; rareOddsBonus: number; interestRate: number;
}

export function runMods(p: Profile): RunMods {
  const gBuff = p.garden?.buff;
  return {
    dmgMul: 1 + 0.12 * level(p, 'blade'),
    critBonus: 0.04 * level(p, 'blade'),
    dartBonus: level(p, 'darts'),
    rerolls: 1 + level(p, 'reroll') + (gBuff === 'lotus' ? 1 : 0),
    hpBonus: 20 * level(p, 'vigor') + (gBuff === 'lotus' ? 25 : 0),
    deathDefy: level(p, 'breath'),
    startIntent: level(p, 'intent') + (gBuff === 'xuanzhi' ? 1 : 0),
    windupMul: 1 + 0.1 * level(p, 'ear'),
    startManual: level(p, 'manual') >= 1,
    poiseHeal: 5 * level(p, 'leech'),
    firstStrikeBonus: mirrorVal(p, 'edge', 0) / 100,
    styleBonus: mirrorVal(p, 'edge', 1) / 100,
    dashCdMul: 1 - mirrorVal(p, 'step', 0) / 100,
    counterBonus: mirrorVal(p, 'step', 1) / 100,
    markedDmgBonus: mirrorVal(p, 'arms', 0) / 100,
    poiseDmgMul: 1 + mirrorVal(p, 'arms', 1) / 100,
    rareOddsBonus: mirrorVal(p, 'luck', 0) / 100 + (gBuff === 'xuanzhi' ? 0.25 : 0),
    interestRate: mirrorVal(p, 'luck', 1) / 100,
  };
}

export interface RunStats { rooms: number; elites: number; boss: boolean; won: boolean; kills: number }

export function runReward(s: RunStats): { iron: number; herb: number } {
  return {
    iron: 6 + 5 * s.rooms + 8 * s.elites + (s.boss ? 25 : 0) + (s.won ? 20 : 0),
    herb: 6 + 5 * s.rooms + Math.floor(s.kills / 3) * 2 + (s.won ? 20 : 0),
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
