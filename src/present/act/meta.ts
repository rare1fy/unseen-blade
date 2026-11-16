import type { Profile } from './profile';

export type Cur = 'iron' | 'herb';
export type Who = 'forge' | 'medic';
export interface MetaUp { id: string; who: Who; cur: Cur; name: string; desc: [string, string]; costs: number[] }

import { UP_COPY } from './hideoutLines';
export const META: MetaUp[] = [
  { id: 'blade', who: 'forge', cur: 'iron', name: '刀身', desc: ['斩击伤害提高', '每级多一成'], costs: [20, 40, 70] },
  { id: 'darts', who: 'forge', cur: 'iron', name: '镖匣', desc: ['飞镖多带一枚', '每级加一枚'], costs: [30, 60] },
  { id: 'manual', who: 'forge', cur: 'iron', name: '旧谱', desc: ['每局开局', '先挑一本刀谱'], costs: [80] },
  { id: 'vigor', who: 'medic', cur: 'herb', name: '筋骨', desc: ['生命上限提高', '每级加十五'], costs: [15, 30, 50] },
  { id: 'breath', who: 'medic', cur: 'herb', name: '闭息', desc: ['每局一次', '致命伤时留三成血'], costs: [60] },
  { id: 'intent', who: 'medic', cur: 'herb', name: '杀气', desc: ['每间开始', '自带一格杀气'], costs: [40] },
  { id: 'ear', who: 'medic', cur: 'herb', name: '听宫', desc: ['敌人起手', '每级慢一成'], costs: [25, 50] },
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

export function buy(p: Profile, id: string): boolean {
  const up = META.find(x => x.id === id);
  if (!up || !canBuy(p, id)) return false;
  const cost = nextCost(p, id)!;
  p[up.cur] -= cost;
  p.perks[id] = level(p, id) + 1;
  return true;
}

export interface RunMods { dmgMul: number; dartBonus: number; hpBonus: number; deathDefy: number; startIntent: number; windupMul: number; startManual: boolean }

export function runMods(p: Profile): RunMods {
  return {
    dmgMul: 1 + 0.1 * level(p, 'blade'),
    dartBonus: level(p, 'darts'),
    hpBonus: 15 * level(p, 'vigor'),
    deathDefy: level(p, 'breath'),
    startIntent: level(p, 'intent'),
    windupMul: 1 + 0.1 * level(p, 'ear'),
    startManual: level(p, 'manual') >= 1,
  };
}

export interface RunStats { rooms: number; elites: number; boss: boolean; won: boolean; kills: number }

export function runReward(s: RunStats): { iron: number; herb: number } {
  return {
    iron: s.rooms + 3 * s.elites + (s.boss ? 15 : 0) + (s.won ? 10 : 0),
    herb: 2 * s.rooms + (s.won ? 15 : 0) + Math.floor(s.kills / 10),
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
