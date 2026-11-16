// 一局的规划（地域一 · 黄巾残村，act-17，docs/DESIGN.md 第十七轮）：6 间屋。第 1 间固定「乱兵」（残村），第 6 间固定「渠帅」（破庙）；
// 中间每间打完出门前两条路二选一，路牌写屋子类型和奖励。屋子类型和名字是 agy 写的。
// 刷什么兵按「第几间」加码；兵种用黄巾的 id（hj_*），没合进来之前自动退回旧的山贼一系（kindOr）。
import { EDEFS, type EKind } from './enemy';
import { LOCALES } from '../asm/registry';

export type RoomType = 'fight' | 'elite' | 'shop' | 'rest' | 'boon' | 'boss';
export type School = 'tp' | 'jd' | 'sr';
export type Reward = { k: 'boon'; school: School } | { k: 'coins'; n: number } | { k: 'heal' } | { k: 'manual' } | null;
/** one room of the run: what it is, where, what clearing it gives, the waves ('kind*' = the elite of that kind) */
export interface RoomPlan { type: RoomType; locale: string; reward: Reward; waves: string[][] }

/** the rooms in a run of region one */
export const RUN_ROOMS = 6;
/** names on the route boards and in the room banner (agy) */
export const ROOM_INFO: Record<RoomType, { name: string; line: string }> = {
  fight: { name: '乱兵', line: '杀退拦路黄巾贼' },
  elite: { name: '死士', line: '恶战强敌夺取重赏' },
  shop: { name: '行商', line: '用铜钱买随身好物' },
  rest: { name: '歇脚', line: '歇口气回血或磨刀' },
  boon: { name: '遗卷', line: '不战白得一张秘传' },
  boss: { name: '渠帅', line: '死战坐镇黄巾渠帅' },
};
export const SCHOOL_NAME: Record<School, string> = { tp: '太平道', jd: '江东水师', sr: '散人' };

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

/** the waves of a room, stronger the deeper in the run (depth = room index 0..5) */
export function wavesFor(type: RoomType, depth: number, r: Rnd): string[][] {
  if (type === 'boss') return [['hj_blade', 'hj_archer', 'hj_mob', 'hj_mob', 'hj_mob'], ['hj_boss', 'hj_mob', 'hj_mob']];
  if (type === 'elite') {
    const head = pick(['hj_blade', 'hj_brute', 'hj_taoist', 'hj_archer', 'hj_hound'], r) + '*';
    return [[head, 'hj_mob', 'hj_mob', 'hj_mob'], ['hj_blade', pick(['hj_archer', 'hj_taoist'], r), 'hj_hound', ...(depth >= 3 ? ['hj_brute'] : [])]];
  }
  if (type !== 'fight') return [];
  if (depth === 0) return [['hj_blade', 'hj_mob', 'hj_mob', 'hj_mob'], ['hj_blade', 'hj_blade', 'hj_hound', 'hj_mob', 'hj_mob']];
  const w1 = ['hj_blade', 'hj_blade', 'hj_mob', 'hj_mob', 'hj_mob', ...(depth >= 2 ? [pick(['hj_archer', 'hj_taoist'], r)] : [])];
  const w2 = ['hj_blade', pick(['hj_brute', 'hj_hound'], r), pick(['hj_archer', 'hj_taoist'], r), 'hj_mob', 'hj_mob', ...(depth >= 3 ? [pick(['hj_brute', 'hj_taoist', 'hj_hound'], r)] : [])];
  return [w1, w2];
}
function rewardFor(type: RoomType, r: Rnd): Reward {
  if (type !== 'fight' && type !== 'elite') return null;
  const x = r(), school: School = ((): School => { const y = r(); return y < 0.4 ? 'tp' : y < 0.8 ? 'jd' : 'sr'; })();
  if (type === 'elite') return x < 0.6 ? { k: 'manual' } : x < 0.85 ? { k: 'boon', school } : { k: 'coins', n: 50 };   // act-19: 刀谱 mostly
  return x < 0.6 ? { k: 'boon', school } : x < 0.85 ? { k: 'coins', n: 30 } : { k: 'heal' };
}
function placeFor(type: RoomType, r: Rnd) {
  return type === 'boss' ? 'hj_temple' : type === 'fight' || type === 'elite' ? pick(['hj_village', 'hj_field'], r) : 'hj_village';
}
export function roomOf(type: RoomType, depth: number, r: Rnd): RoomPlan {
  return { type, locale: placeOr(placeFor(type, r)), reward: rewardFor(type, r), waves: wavesFor(type, depth, r) };
}
/** the first room of a run: a fight in the village, a boon of a random school for clearing it */
export function firstRoom(r: Rnd): RoomPlan { const p = roomOf('fight', 0, r); p.locale = placeOr('hj_village'); p.reward = { k: 'boon', school: r() < 0.5 ? 'tp' : 'jd' }; return p; }

/** the roads out of room `from` (0-based): two different kinds of room, or the one road to the boss before the last room.
 *  No two shops or two rests in a run; the room before the boss always offers a rest or a shop if neither was visited. */
export function doorsFrom(from: number, visited: RoomType[], r: Rnd): RoomPlan[] {
  const next = from + 1;
  if (next >= RUN_ROOMS) return [];
  if (next === RUN_ROOMS - 1) return [roomOf('boss', next, r)];
  const w: Array<[RoomType, number]> = [['fight', 3], ['elite', next >= 2 ? 1.5 : 0], ['shop', next >= 2 && !visited.includes('shop') ? 1 : 0], ['rest', next >= 2 && !visited.includes('rest') ? 1 : 0], ['boon', 1]];
  const draw = (not?: RoomType) => { const ws = w.filter(([t]) => t !== not), tot = ws.reduce((s, [, n]) => s + n, 0); let x = r() * tot; for (const [t, n] of ws) { x -= n; if (x <= 0 && n > 0) return t; } return ws.find(([, n]) => n > 0)![0]; };
  const a = draw(); let b = draw(a);
  // the last choice before the boss: a breather if the run had none
  if (next === RUN_ROOMS - 2 && !visited.includes('shop') && !visited.includes('rest') && a !== 'shop' && a !== 'rest') b = r() < 0.5 ? 'rest' : 'shop';
  return [roomOf(a, next, r), roomOf(b, next, r)];
}
