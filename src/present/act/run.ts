// 一局的规划（act-17 起的地域一 · 黄巾残村；11-18 起一局五关，见 regions.ts）：每关第 1 间固定「乱兵」，最后一间是这一关的头目间；
// 中间每间打完出门前两条路二选一，路牌写屋子类型和奖励。屋子类型和名字是 agy 写的（每关的叫法见 ROOM_INFO_BY）。
// 刷什么兵按「这一关的第几间」加码（regions/rN.ts 的 waves）；第一关的兵用黄巾的 id（hj_*），没合进来之前自动退回旧的山贼一系（kindOr）。
// 一局里的位置用 (区, 间) 表示：flow.ts 是纯逻辑（关的顺序、打完头目进下一关、最后一关打完是通关），这里只管一间屋怎么排。
import { EDEFS, type EKind } from './enemy';
import { LOCALES } from '../asm/registry';
import { REGIONS } from './regions';
import type { RegionDef } from './regionDef';
import type { Archetype } from './boons';

const ARCHS: readonly Archetype[] = ['blood', 'poise', 'shadow', 'gale'];

export type RoomType = 'fight' | 'elite' | 'shop' | 'rest' | 'boon' | 'event' | 'boss';
export type Reward = { k: 'boon'; arch?: Archetype } | { k: 'coins'; n: number } | { k: 'heal' } | { k: 'manual' } | { k: 'maxHp'; n: number } | { k: 'meta'; iron: number; herb: number } | null;
/** one room of the run: what it is, where, what clearing it gives, the waves ('kind*' = the elite of that kind); region = which 关 (0 起) */
export interface RoomPlan { type: RoomType; locale: string; reward: Reward; waves: string[][]; region?: number }

/** the rooms of region one, the boss room included (act-152: 7 pre-boss + 1 boss = 8 rooms per region) */
export const RUN_ROOMS = 8;
/** names on the route boards and in the room banner (agy) — region one's */
export const ROOM_INFO: Record<RoomType, { name: string; line: string }> = {
  fight: { name: '乱兵', line: '杀退拦路黄巾贼' },
  elite: { name: '死士', line: '恶战强敌夺取重赏' },
  shop: { name: '行商', line: '铜钱换秘卷与奇货' },
  rest: { name: '歇脚', line: '回血·磨刀·焚香蓄锐' },
  boon: { name: '遗卷', line: '不战自得珍绝秘传' },
  event: { name: '赵云奇遇', line: '断后护民退贼兵' },
  boss: { name: '首领', line: '死战坐镇强敌首领' },
};
/** 11-18: the later regions' own words for their fights and their boss room (boss title stays generic 首领 so route boards never spoil who awaits) */
const ROOM_INFO_BY: Record<string, Partial<Record<RoomType, { name: string; line: string }>>> = {
  r2_luoyang: { fight: { name: '乱兵', line: '斩退焚城飞熊卒' }, event: { name: '吕布奇遇', line: '三合试锋破画戟' }, boss: { name: '首领', line: '铸钱炉前决生死' } },
  r3_xiapi: { fight: { name: '乱兵', line: '扫除浸水吕布兵' }, event: { name: '夏侯惇奇遇', line: '雾巷听弦追影战' }, boss: { name: '首领', line: '白门楼下决生死' } },
  r4_wulin: { fight: { name: '乱兵', line: '杀穿铁索连环船' }, event: { name: '陆逊奇遇', line: '借风破盾连环火' }, boss: { name: '首领', line: '楼船烈火决生死' } },
  r5_cui: { fight: { name: '乱兵', line: '雪夜破袭崔府众' }, boss: { name: '首领', line: '深宅雪落决生死' } },
};
/** a room type's name and line in region `ri` (0 起; out of range = region one's) */
export const roomInfo = (type: RoomType, ri = 0) => ROOM_INFO_BY[REGIONS[ri]?.id ?? '']?.[type] ?? ROOM_INFO[type];

/** the region's places; until the 黄巾 places are merged, the nearest ninja place stands in */
const PLACE_FALLBACK: Record<string, string> = { hj_village: 'ninja_village', hj_field: 'ninja_wilds', hj_temple: 'ninja_temple' };
export const placeOr = (id: string) => (LOCALES[id] ? id : PLACE_FALLBACK[id] ?? 'ninja_wilds');
/** the 黄巾 foes; until they are merged, the old bandit set stands in */
const KIND_FALLBACK: Record<string, EKind> = { hj_blade: 'bandit', hj_brute: 'bandit', hj_taoist: 'archer', hj_mob: 'bandit', hj_archer: 'archer', hj_hound: 'dog', hj_boss: 'chief' };
export function kindOr(k: string): { kind: EKind; elite: boolean } {
  const elite = k.endsWith('*'), id = elite ? k.slice(0, -1) : k;
  return { kind: (id in EDEFS ? id : KIND_FALLBACK[id] ?? 'bandit') as EKind, elite };
}
/** a boss foe (the long bar at the top, the banner, the slow-motion death) */
export const isBossKind = (k: string) => !!(EDEFS as Record<string, { boss?: boolean }>)[k]?.boss;

type Rnd = () => number;
const pick = <T>(a: T[], r: Rnd) => a[Math.floor(r() * a.length) % a.length];
const regionAt = (ri: number): RegionDef => REGIONS[Math.max(0, Math.min(REGIONS.length - 1, ri))];
/** the rooms of region `ri`, its boss room included */
export const regionRooms = (ri: number) => regionAt(ri).rooms + 1;

/** the waves of a room of region one, stronger the deeper in the run (depth = room index 0..5) */
export function wavesFor(type: RoomType, depth: number, r: Rnd, ri = 0): string[][] {
  const R = regionAt(ri);
  if (type === 'boss') return R.bossWaves.map(w => [...w]);
  return R.waves(type, depth, r);
}
/** act-152 哈迪斯2强化节奏: 刀谱整局严控 2~3 本；秘传门直接标明流派（血刃/破势/影镖/凌空），过门前一目了然！ */
function pickArch(r: Rnd, exclude?: Archetype): Archetype {
  const pool = exclude ? ARCHS.filter(a => a !== exclude) : ARCHS;
  return pool[Math.floor(r() * pool.length) % pool.length];
}
function rewardFor(type: RoomType, r: Rnd, ri = 0): Reward {
  if (type !== 'fight' && type !== 'elite') return null;
  if (type === 'elite') return { k: 'boon', arch: pickArch(r) };
  const x = r();
  if (x < 0.36) return { k: 'boon', arch: pickArch(r) };
  if (x < 0.62) return { k: 'coins', n: 45 + ri * 10 };
  if (x < 0.80) return { k: 'maxHp', n: 12 };
  if (x < 0.92) return { k: 'meta', iron: 8 + ri * 3, herb: 8 + ri * 3 };
  return { k: 'heal' };
}
function placeFor(type: RoomType, r: Rnd, ri = 0) {
  const R = regionAt(ri);
  return type === 'boss' ? R.bossLocale : type === 'fight' || type === 'elite' ? pick(R.locales, r) : R.locales[0];
}
export function roomOf(type: RoomType, depth: number, r: Rnd, ri = 0): RoomPlan {
  return { type, locale: placeOr(placeFor(type, r, ri)), reward: rewardFor(type, r, ri), waves: wavesFor(type, depth, r, ri), region: ri };
}
/** the first room of a run: a fight in the village, then Weapon Manual #1 */
export function firstRoom(r: Rnd): RoomPlan { const p = roomOf('fight', 0, r); p.locale = placeOr('hj_village'); p.reward = { k: 'manual' }; return p; }
/** 11-18 / act-152: the first room of region `ri` — Region 3 (mid-run) grants Manual #2; others grant an archetype boon */
export function regionFirstRoom(ri: number, r: Rnd): RoomPlan {
  if (ri <= 0) return firstRoom(r);
  const p = roomOf('fight', 0, r, ri); p.locale = placeOr(regionAt(ri).locales[0]); p.reward = ri === 2 ? { k: 'manual' } : { k: 'boon', arch: pickArch(r) }; return p;
}

/** Ensure two combat doors at a fork offer visibly distinct rewards/archetypes (like Hades 2 route planning). */
function distinctFork(pair: RoomPlan[], r: Rnd): RoomPlan[] {
  if (pair.length < 2) return pair;
  const [p0, p1] = pair;
  if (p0.reward?.k === 'boon' && p1.reward?.k === 'boon' && p0.reward.arch && p0.reward.arch === p1.reward.arch) {
    p1.reward = { k: 'boon', arch: pickArch(r, p0.reward.arch) };
  }
  return pair;
}

export function doorsFrom(from: number, visited: RoomType[], r: Rnd, ri = 0): RoomPlan[] {
  const next = from + 1, N = regionRooms(ri);
  if (next >= N) return [];
  if (next === N - 1) return [roomOf('boss', next, r, ri)];
  const current = visited[visited.length - 1];
  if (current === 'rest' || current === 'shop' || current === 'boon' || current === 'event') {
    const fightFirst = r() < 2 / 3;
    return distinctFork([roomOf(fightFirst ? 'fight' : 'elite', next, r, ri), roomOf(fightFirst ? 'elite' : 'fight', next, r, ri)], r);
  }
  // act-147: Four Generals ('event') encounters removed from runs (user: 玩法走过场、先拿掉)
  const w: Array<[RoomType, number]> = [
    ['fight', 3.2],
    ['elite', next >= 1 ? 1.4 : 0],
    ['shop', next >= 2 && !visited.includes('shop') ? 1 : 0],
    ['rest', next >= 3 && !visited.includes('rest') ? 0.9 : 0],
    ['boon', next >= 1 && !visited.includes('boon') ? 0.75 : 0],
  ];
  const draw = (not?: RoomType): RoomType => { const ws = w.filter(([t]) => t !== not), tot = ws.reduce((s, [, n]) => s + n, 0); let x = r() * tot; for (const [t, n] of ws) { x -= n; if (x <= 0 && n > 0) return t; } return ws.find(([, n]) => n > 0)?.[0] ?? 'fight'; };
  const a = draw(); let b = draw(a);
  if (next === N - 2 && !visited.includes('shop') && !visited.includes('rest') && a !== 'shop' && a !== 'rest') b = r() < 0.5 ? 'rest' : 'shop';
  return distinctFork([roomOf(a, next, r, ri), roomOf(b, next, r, ri)], r);
}
