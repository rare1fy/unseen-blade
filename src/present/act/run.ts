// 一局的规划（act-17 起的地域一 · 黄巾残村；11-18 起一局五关，见 regions.ts）：每关第 1 间固定「乱兵」，最后一间是这一关的头目间；
// 中间每间打完出门前两条路二选一，路牌写屋子类型和奖励。屋子类型和名字是 agy 写的（每关的叫法见 ROOM_INFO_BY）。
// 刷什么兵按「这一关的第几间」加码（regions/rN.ts 的 waves）；第一关的兵用黄巾的 id（hj_*），没合进来之前自动退回旧的山贼一系（kindOr）。
// 一局里的位置用 (区, 间) 表示：flow.ts 是纯逻辑（关的顺序、打完头目进下一关、最后一关打完是通关），这里只管一间屋怎么排。
import { EDEFS, type EKind } from './enemy';
import { LOCALES } from '../asm/registry';
import { REGIONS } from './regions';
import type { RegionDef } from './regionDef';
import { BOON_CAP, type Archetype } from './boons';

const ARCHS: readonly Archetype[] = ['blood', 'poise', 'shadow', 'gale'];

export type RoomType = 'fight' | 'elite' | 'shop' | 'rest' | 'boon' | 'event' | 'boss';
export type Reward = { k: 'boon'; arch?: Archetype } | { k: 'up' } | { k: 'coins'; n: number } | { k: 'heal' } | { k: 'manual' } | { k: 'maxHp'; n: number } | { k: 'meta'; iron: number; herb: number } | null;
/** one room of the run: what it is, where, what clearing it gives, the waves ('kind*' = the elite of that kind); region = which 关 (0 起) */
/** act-161 / Hades-2 bag: what the route planner knows of her hand and optional per-run combat reward bag */
export type BagRewardKind = 'boon' | 'coins' | 'maxHp' | 'meta' | 'heal';
export interface RunCtx { boons: number; ups: number; bag?: BagRewardKind[] }
export function freshRewardBag(): BagRewardKind[] {
  return ['boon', 'boon', 'coins', 'coins', 'coins', 'maxHp', 'maxHp', 'meta', 'heal', 'heal'];
}
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
/** act-161 秘传节奏（一局原来 20～34 次选牌、16 张必拿空；目标 9 张）: a fight room's boon door 36% -> 22% (the freed share is the heal door's);
 *  an elite room is half a boon, half an upgrade ('up') of one she holds; once her hand is full (BOON_CAP) fights offer no boon door and an
 *  elite room is an upgrade or a purse */
function rewardFor(type: RoomType, r: Rnd, ri = 0, ctx?: RunCtx): Reward {
  if (type !== 'fight' && type !== 'elite') return null;
  const full = !!ctx && ctx.boons >= BOON_CAP, canUp = !!ctx && ctx.ups > 0;
  if (type === 'elite') {
    if (canUp && r() < 0.5) return { k: 'up' };
    return full ? { k: 'coins', n: 60 + ri * 12 } : { k: 'boon', arch: pickArch(r) };
  }
  // Hades-2 Bag Random when a run reward bag is supplied: eliminates streaky 5-room droughts while preserving exact ratios
  if (ctx?.bag) {
    if (!ctx.bag.length) ctx.bag.push(...freshRewardBag());
    const ix = Math.floor(r() * ctx.bag.length) % ctx.bag.length;
    let k = ctx.bag.splice(ix, 1)[0];
    if (k === 'boon' && full) k = 'coins';
    if (k === 'boon') return { k: 'boon', arch: pickArch(r) };
    if (k === 'coins') return { k: 'coins', n: 45 + ri * 10 };
    if (k === 'maxHp') return { k: 'maxHp', n: 12 };
    if (k === 'meta') return { k: 'meta', iron: 8 + ri * 3, herb: 8 + ri * 3 };
    return { k: 'heal' };
  }
  const x = r(), pb = full ? 0 : 0.22;
  if (x < pb) return { k: 'boon', arch: pickArch(r) };
  if (x < pb + 0.26) return { k: 'coins', n: 45 + ri * 10 };
  if (x < pb + 0.44) return { k: 'maxHp', n: 12 };
  if (x < pb + 0.56) return { k: 'meta', iron: 8 + ri * 3, herb: 8 + ri * 3 };
  return { k: 'heal' };
}
/** act-161: a room's doors are drawn up before its own reward is in her hand (the next room is built ahead of time), so a door can
 *  promise a boon her hand has no room left for, or an upgrade when nothing she holds can still go up — what such a door gives by the
 *  time it opens (what rewardFor would have said had it known; every other reward stands) */
export function settleReward(p: RoomPlan, ctx: RunCtx): Reward {
  const rw = p.reward, ri = p.region ?? 0, full = ctx.boons >= BOON_CAP;
  if (p.type !== 'fight' && p.type !== 'elite') return rw;
  if (rw?.k === 'boon' && full) return p.type === 'elite' ? (ctx.ups > 0 ? { k: 'up' } : { k: 'coins', n: 60 + ri * 12 }) : { k: 'coins', n: 45 + ri * 10 };
  if (rw?.k === 'up' && ctx.ups <= 0) return full ? { k: 'coins', n: 60 + ri * 12 } : { k: 'boon' };
  return rw;
}
function placeFor(type: RoomType, r: Rnd, ri = 0) {
  const R = regionAt(ri);
  return type === 'boss' ? R.bossLocale : type === 'fight' || type === 'elite' ? pick(R.locales, r) : R.locales[0];
}
export function roomOf(type: RoomType, depth: number, r: Rnd, ri = 0, ctx?: RunCtx): RoomPlan {
  return { type, locale: placeOr(placeFor(type, r, ri)), reward: rewardFor(type, r, ri, ctx), waves: wavesFor(type, depth, r, ri), region: ri };
}
/** the first room of a run: a fight in the village, then Weapon Manual #1 */
export function firstRoom(r: Rnd): RoomPlan { const p = roomOf('fight', 0, r); p.locale = placeOr('hj_village'); p.reward = { k: 'manual' }; return p; }
/** 11-18 / act-152 / act-161: the first room of region `ri` — region 3 grants Manual #2, region 2 an archetype boon, regions 4 and 5 a purse */
export function regionFirstRoom(ri: number, r: Rnd): RoomPlan {
  if (ri <= 0) return firstRoom(r);
  const p = roomOf('fight', 0, r, ri); p.locale = placeOr(regionAt(ri).locales[0]); p.reward = ri === 2 ? { k: 'manual' } : ri === 1 ? { k: 'boon', arch: pickArch(r) } : { k: 'coins', n: 45 + ri * 10 }; return p;
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

export function doorsFrom(from: number, visited: RoomType[], r: Rnd, ri = 0, ctx?: RunCtx, mustRest = false): RoomPlan[] {
  const next = from + 1, N = regionRooms(ri);
  if (next >= N) return [];
  if (next === N - 1) return [roomOf('boss', next, r, ri)];
  // act-188: guarantee a single pre-boss campfire rest room in Acts 1 & 2 if the player skipped earlier rests and hasn't seen Du Wu's roadside story yet
  if (mustRest && next === N - 2 && !visited.includes('rest')) {
    return [roomOf('rest', next, r, ri, ctx)];
  }
  const current = visited[visited.length - 1];
  if (current === 'rest' || current === 'shop' || current === 'boon' || current === 'event') {
    const fightFirst = r() < 2 / 3;
    return distinctFork([roomOf(fightFirst ? 'fight' : 'elite', next, r, ri, ctx), roomOf(fightFirst ? 'elite' : 'fight', next, r, ri, ctx)], r);
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
  // act-161: every region shows a merchant's door at least once — at one of its last two forks if none has come up
  if (next >= N - 3 && !visited.includes('shop') && a !== 'shop' && b !== 'shop') b = 'shop';
  return distinctFork([roomOf(a, next, r, ri, ctx), roomOf(b, next, r, ri, ctx)], r);
}
