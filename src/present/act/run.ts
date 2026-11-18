// 一局的规划（act-17 起的地域一 · 黄巾残村；11-18 起一局五关，见 regions.ts）：每关第 1 间固定「乱兵」，最后一间是这一关的头目间；
// 中间每间打完出门前两条路二选一，路牌写屋子类型和奖励。屋子类型和名字是 agy 写的（每关的叫法见 ROOM_INFO_BY）。
// 刷什么兵按「这一关的第几间」加码（regions/rN.ts 的 waves）；第一关的兵用黄巾的 id（hj_*），没合进来之前自动退回旧的山贼一系（kindOr）。
// 一局里的位置用 (区, 间) 表示：flow.ts 是纯逻辑（关的顺序、打完头目进下一关、最后一关打完是通关），这里只管一间屋怎么排。
import { EDEFS, type EKind } from './enemy';
import { LOCALES } from '../asm/registry';
import { REGIONS } from './regions';
import type { RegionDef } from './regionDef';

export type RoomType = 'fight' | 'elite' | 'shop' | 'rest' | 'boon' | 'boss';
export type Reward = { k: 'boon' } | { k: 'coins'; n: number } | { k: 'heal' } | { k: 'manual' } | null;
/** one room of the run: what it is, where, what clearing it gives, the waves ('kind*' = the elite of that kind); region = which 关 (0 起) */
export interface RoomPlan { type: RoomType; locale: string; reward: Reward; waves: string[][]; region?: number }

/** the rooms of region one, the boss room included (the other regions: REGIONS[i].rooms + 1) */
export const RUN_ROOMS = 6;
/** names on the route boards and in the room banner (agy) — region one's */
export const ROOM_INFO: Record<RoomType, { name: string; line: string }> = {
  fight: { name: '乱兵', line: '杀退拦路黄巾贼' },
  elite: { name: '死士', line: '恶战强敌夺取重赏' },
  shop: { name: '行商', line: '用铜钱买随身好物' },
  rest: { name: '歇脚', line: '歇口气回血或磨刀' },
  boon: { name: '遗卷', line: '不战白得一张秘传' },
  boss: { name: '渠帅', line: '死战坐镇黄巾渠帅' },
};
/** 11-18: the later regions' own words for their fights and their boss room (agy; the rest as region one's) */
const ROOM_INFO_BY: Record<string, Partial<Record<RoomType, { name: string; line: string }>>> = {
  r2_luoyang: { fight: { name: '乱兵', line: '斩退焚城飞熊卒' }, boss: { name: '校尉', line: '铸钱炉前斩阎虎' } },
  r3_xiapi: { fight: { name: '乱兵', line: '扫除浸水吕布兵' }, boss: { name: '医官', line: '白门楼下截鬼医' } },
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
/** 11-18 (用户：「我打了半天了还没个新招，一直在给我加数值」): 刀谱 come much more often — every 死士 room gives one, a 乱兵 room about
 *  three times in ten (the rest a boon / coins / a heal), the 遗卷 altar as before; with the first room's one a run sees about 3–4. When
 *  every 刀谱 is learnt, show.ts falls back to a boon (manualPick) */
function rewardFor(type: RoomType, r: Rnd): Reward {
  if (type !== 'fight' && type !== 'elite') return null;
  const x = r();
  if (type === 'elite') return { k: 'manual' };
  return x < 0.3 ? { k: 'manual' } : x < 0.72 ? { k: 'boon' } : x < 0.88 ? { k: 'coins', n: 30 } : { k: 'heal' };
}
function placeFor(type: RoomType, r: Rnd, ri = 0) {
  const R = regionAt(ri);
  return type === 'boss' ? R.bossLocale : type === 'fight' || type === 'elite' ? pick(R.locales, r) : R.locales[0];
}
export function roomOf(type: RoomType, depth: number, r: Rnd, ri = 0): RoomPlan {
  return { type, locale: placeOr(placeFor(type, r, ri)), reward: rewardFor(type, r), waves: wavesFor(type, depth, r, ri), region: ri };
}
/** the first room of a run: a fight in the village, then a 刀谱 (11-18: a new move straight away, not a number) */
export function firstRoom(r: Rnd): RoomPlan { const p = roomOf('fight', 0, r); p.locale = placeOr('hj_village'); p.reward = { k: 'manual' }; return p; }
/** 11-18: the first room of region `ri` (a later one, after its boss fell): a fight in its first place, a boon for it (as firstRoom) */
export function regionFirstRoom(ri: number, r: Rnd): RoomPlan {
  if (ri <= 0) return firstRoom(r);
  const p = roomOf('fight', 0, r, ri); p.locale = placeOr(regionAt(ri).locales[0]); p.reward = { k: 'boon' }; return p;
}

/** the roads out of room `from` (0-based, within region `ri`): two different kinds of room, or the one road to the boss before the last room.
 *  visited = the kinds of room seen in this region, in travel order, the current room last (show.ts pushes it before asking). No two
 *  shops or two rests in a region; leaving a rest, a shop or a 遗卷 both roads lead to a fight (11-18 用户：「刚去篝火然后下一个节点又是
 *  非战斗节点」— the user's own Codex fix, carried over from the main checkout); from a combat room the last fork before the boss offers
 *  a rest or a shop if neither was visited. After the boss: [] (flow.ts goes on into the next region). */
export function doorsFrom(from: number, visited: RoomType[], r: Rnd, ri = 0): RoomPlan[] {
  const next = from + 1, N = regionRooms(ri);
  if (next >= N) return [];
  if (next === N - 1) return [roomOf('boss', next, r, ri)];
  const current = visited[visited.length - 1];
  if (current === 'rest' || current === 'shop' || current === 'boon') {
    // Keep the usual 3:1.5 odds for which combat room appears on the left.
    const fightFirst = r() < 2 / 3;
    return [roomOf(fightFirst ? 'fight' : 'elite', next, r, ri), roomOf(fightFirst ? 'elite' : 'fight', next, r, ri)];
  }
  const w: Array<[RoomType, number]> = [['fight', 3], ['elite', next >= 2 ? 1.5 : 0], ['shop', next >= 2 && !visited.includes('shop') ? 1 : 0], ['rest', next >= 2 && !visited.includes('rest') ? 1 : 0], ['boon', 1]];
  const draw = (not?: RoomType) => { const ws = w.filter(([t]) => t !== not), tot = ws.reduce((s, [, n]) => s + n, 0); let x = r() * tot; for (const [t, n] of ws) { x -= n; if (x <= 0 && n > 0) return t; } return ws.find(([, n]) => n > 0)![0]; };
  const a = draw(); let b = draw(a);
  // the last choice before the boss: a breather if the region had none
  if (next === N - 2 && !visited.includes('shop') && !visited.includes('rest') && a !== 'shop' && a !== 'rest') b = r() < 0.5 ? 'rest' : 'shop';
  return [roomOf(a, next, r, ri), roomOf(b, next, r, ri)];
}
