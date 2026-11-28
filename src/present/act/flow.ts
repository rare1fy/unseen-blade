// 一局五关的流程（11-18）：纯逻辑、不碰画面，单测直接测这里。一局里的位置 = (关 region, 这一关的第几间 room)，两个都从 0 起。
// 规则：每关 rooms + 1 间（最后一间是头目间）；打完一关的头目，进下一关的第一间；最后一关的头目打完 = 通关。
// 局外货币按「打过的间」算，越往后的关一间算得越多（act-161：1 / 1.2 / 1.4 / 1.7 / 2 间，原来是 1 / 2 / 3 / 4 / 5，通关一次就买穿全树）；难度从第二关起逐关加码（第一关不变）。
import { regionsFor } from './regions';
import type { RouteId } from './regionDef';

/** how many rooms region ri has, its boss room included */
export const roomsIn = (ri: number, route: RouteId = 'south') => (regionsFor(route)[ri]?.rooms ?? 0) + 1;
/** the boss room of region ri is room roomsIn(ri) − 1 */
export const isBossRoom = (ri: number, room: number, route: RouteId = 'south') => room === roomsIn(ri, route) - 1;
/** after the boss of region ri: the next region's index, or 'won' (it was the last) */
export function afterBoss(ri: number, route: RouteId = 'south'): number | 'won' {
  return ri + 1 < regionsFor(route).length ? ri + 1 : 'won';
}

/** what the haul home counts as rooms: every room cleared in region n (1 起) counts n — a room deeper in the run is worth more.
 *  North route starts at higher mid-game stakes (1.4 / 1.7 / 2.0 / 2.4) so alternating routes feeds meta progression handsomely. */
const ROOM_WORTH = [1, 1.2, 1.4, 1.7, 2.0];
const NORTH_WORTH = [1.4, 1.7, 2.0, 2.4];
const worthOf = (ri: number, route: RouteId = 'south') => {
  const arr = route === 'north' ? NORTH_WORTH : ROOM_WORTH;
  return arr[Math.max(0, Math.min(arr.length - 1, ri))];
};
export function roomsWorth(region: number, room: number, won = false, route: RouteId = 'south'): number {
  let n = 0;
  for (let i = 0; i < region; i++) n += roomsIn(i, route) * worthOf(i, route);
  return n + (won ? roomsIn(region, route) : Math.max(0, room)) * worthOf(region, route);
}

/** the foes' strength in region ri (11-28 balance overhaul: firm R1-R2 melee pressure & 2→4 attackers so mobs never melt passively) */
export interface RegionScale { hp: number; dmg: number; quick: number; calm: number; attackers: number }
const HP_CURVE  = [1.25, 1.75, 2.30, 2.95, 3.60];
const DMG_CURVE = [1.15, 1.45, 1.75, 2.05, 2.35];
const SPD_CURVE = [0.98, 1.06, 1.14, 1.22, 1.30];
const CALM_OFF  = [0, -0.07, -0.14, -0.21, -0.28];
const ATK_CAP   = [2, 2, 3, 3, 4];
const SHOP_MUL  = [1.0, 1.15, 1.30, 1.45, 1.60];
export function regionScale(ri: number): RegionScale {
  const n = Math.max(0, Math.floor(ri));
  const i = Math.min(HP_CURVE.length - 1, n), extra = Math.max(0, n - i);
  return {
    hp: HP_CURVE[i] + extra * 0.9,
    dmg: DMG_CURVE[i] + extra * 0.35,
    quick: SPD_CURVE[i] + extra * 0.08,
    calm: CALM_OFF[i] - extra * 0.08,
    attackers: ATK_CAP[i],
  };
}
/** shop price multiplier by region (1.0× in Act 1 up to 2.3× in Act 5 so late-run coins don't trivially clear every stall) */
export function shopPriceMul(ri: number): number {
  const n = Math.max(0, Math.min(SHOP_MUL.length - 1, Math.floor(ri)));
  return SHOP_MUL[n];
}

/** the banner when she walks into region ri's first room: its name and its line */
export const regionBanner = (ri: number, route: RouteId = 'south') => {
  const r = regionsFor(route)[ri];
  return { title: r?.name ?? '', sub: r?.tag ?? '' };
};
/** the boss of the last region (the win card says it fell) */
export const lastBoss = (route: RouteId = 'south') => {
  const list = regionsFor(route);
  return list[list.length - 1].boss;
};
