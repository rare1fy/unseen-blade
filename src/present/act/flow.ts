// 一局五关的流程（11-18）：纯逻辑、不碰画面，单测直接测这里。一局里的位置 = (关 region, 这一关的第几间 room)，两个都从 0 起。
// 规则：每关 rooms + 1 间（最后一间是头目间）；打完一关的头目，进下一关的第一间；最后一关的头目打完 = 通关。
// 局外货币按「打过的间」算，第 n 关（1 起）的一间算 n 间；难度从第二关起逐关加码（第一关不变）。
import { REGIONS } from './regions';

/** how many rooms region ri has, its boss room included */
export const roomsIn = (ri: number) => (REGIONS[ri]?.rooms ?? 0) + 1;
/** the boss room of region ri is room roomsIn(ri) − 1 */
export const isBossRoom = (ri: number, room: number) => room === roomsIn(ri) - 1;
/** after the boss of region ri: the next region's index, or 'won' (it was the last) */
export function afterBoss(ri: number): number | 'won' { return ri + 1 < REGIONS.length ? ri + 1 : 'won'; }

/** what the haul home counts as rooms: every room cleared in region n (1 起) counts n — a room deeper in the run is worth more.
 *  region / room = where she fell (or the last boss room, on a win); won = the last boss fell (that room counts too) */
export function roomsWorth(region: number, room: number, won = false): number {
  let n = 0;
  for (let i = 0; i < region; i++) n += roomsIn(i) * (i + 1);
  return n + (won ? roomsIn(region) : Math.max(0, room)) * (region + 1);
}

/** the foes' strength in region ri (multipliers on the TUNE values of the run; region one is ×1 everywhere) */
export interface RegionScale { hp: number; dmg: number; quick: number; calm: number; attackers: number }
export function regionScale(ri: number): RegionScale {
  const n = Math.max(0, ri);
  return { hp: 1 + 0.22 * n, dmg: 1 + 0.12 * n, quick: 1 / (1 - 0.06 * n), calm: -0.15 * n, attackers: n >= 2 ? 2 : 1 };
}

/** the banner when she walks into region ri's first room: its name and its line */
export const regionBanner = (ri: number) => ({ title: REGIONS[ri]?.name ?? '', sub: REGIONS[ri]?.tag ?? '' });
/** the boss of the last region (the win card says it fell) */
export const lastBoss = () => REGIONS[REGIONS.length - 1].boss;
