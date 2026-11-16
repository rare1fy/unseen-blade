// 出口（浪人篇 docs/ronin/DESIGN.md §3.3）：一张场景可以要几条「去路」。每条去路是一条通道矩形，从战斗区边缘一直通到舞台外；
// 通道并进构图的走道（layout.path），所以地点照走道的画法铺路，所有道具组都按走道检查给它让开；压到通道的插槽这一张不用。
//   left / right：侧路，在敌人站位后面一点的高度横穿两翼，通向舞台外；
//   back：构图自己的参道 / 小径的后端（通向地标那一侧），不另开通道。
// 路牌（道標）和走过去的路线点由 exitInfo 给出，选路时（present/ronin/route.ts）用。
import { PLAY } from '../scenes/props';
import type { Layout, Rect } from './types';

export type ExitId = 'left' | 'right' | 'back';
/** the side road's band (z), behind the enemy line */
const SIDE = { z0: -5.7, z1: -3.5, out: 13.5 };

export interface ExitInfo {
  id: ExitId;
  /** the road, from the battle floor's edge to beyond the stage */
  lane: Rect;
  /** where the hero walks: from the battle floor along the road out of the stage (m, x / z) */
  walk: Array<[number, number]>;
  /** the signpost: its foot (m) and the direction it faces (yaw, radians; 0 = +z, toward the camera) */
  sign: { x: number; z: number; yaw: number };
  /** which way the road leaves (unit x / z) */
  dir: [number, number];
}

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
/** the back exit: the end of the layout's path that reaches deepest */
function backOf(l: Layout): ExitInfo {
  const p = l.path.slice().sort((a, b) => a.z0 - b.z0)[0], cx = (p.x0 + p.x1) / 2, z = Math.min(p.z0, PLAY.z0 - 1.2);
  return { id: 'back', lane: { x0: p.x0, x1: p.x1, z0: p.z0, z1: PLAY.z0 }, walk: [[cx, PLAY.z0 + 0.6], [cx, z + 0.4], [cx, z - 2.2]], sign: { x: cx + (p.x1 - p.x0) / 2 + 1.6, z: PLAY.z0 - 0.6, yaw: 0 }, dir: [0, -1] };
}
export function exitInfo(l: Layout, id: ExitId): ExitInfo {
  if (id === 'back') return backOf(l);
  const s = id === 'left' ? -1 : 1, edge = s < 0 ? PLAY.x0 : PLAY.x1, zc = (SIDE.z0 + SIDE.z1) / 2;
  const lane = s < 0 ? { x0: -SIDE.out, x1: edge, z0: SIDE.z0, z1: SIDE.z1 } : { x0: edge, x1: SIDE.out, z0: SIDE.z0, z1: SIDE.z1 };
  return { id, lane, walk: [[edge - s * 0.8, zc + 1.2], [edge + s * 1.2, zc], [s * (SIDE.out - 1.0), zc]], sign: { x: edge + s * 1.9, z: SIDE.z0 - 0.5, yaw: 0 }, dir: [s, 0] };
}
/** a layout with these exits cut in: side roads join the path (paved by the locale, kept free by the walk check), slots they cross go */
export function withExits(l: Layout, ids: ExitId[]): Layout {
  const lanes = ids.filter(i => i !== 'back').map(i => exitInfo(l, i).lane);
  if (!lanes.length) return l;
  return { ...l, path: [...l.path, ...lanes], slots: l.slots.filter(s => !lanes.some(r => overlaps(r, { x0: s.x - s.w / 2, x1: s.x + s.w / 2, z0: s.z - s.d / 2, z1: s.z + s.d / 2 }))) };
}
