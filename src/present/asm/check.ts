// 摆放检查：一个道具组先建在临时层里，量出它实际占的格子，再按下面几条规则判它能不能并入场景。
// 只看「实际建出来的格子」，不信组自己声明的尺寸，所以组写错了尺寸、多摆了东西，也会在这里被拦下。
//   play     战斗矩形内（外扩 0.3 m）出现任何高于地面的格子
//   walk     走道（参道、街道）上出现高于地面的格子
//   front    前景带（z > 6，镜头前）出现高于 0.9 m 的格子
//   collide  和已经放下的东西在 0.6 m 以下的「身体层」里重叠（上面的树冠、屋檐可以互相探进去）
//   float    贴地层（y = 0）完全没有格子：整组悬空。树冠、屋檐的悬空部分不算，只要整组有落地的部分
//   foot     实际落地占地超出声明尺寸太多（声明不实）
//   los      挡住战斗机位看任何一个站位的视线（站位胸口高度那条射线穿过 1.2 m 以上的实心格）
//   bounds   超出舞台范围
import { CELL } from '../bestiary/kit';
import { PLAY, SX, SZ } from '../scenes/props';
import type { Issue, Rect } from './types';

const key = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
const unkey = (k: number): [number, number, number] => [Math.floor(k / (1024 * 1024)) - 512, (Math.floor(k / 1024) % 1024) - 512, (k % 1024) - 512];

/** cells → metres (centre of the cell) */
const m = (X: number) => (X + 0.5) * CELL;
/** the battle floor, grown by 0.3 m, in cells */
const playC = () => ({ x0: Math.floor((PLAY.x0 - 0.3) / CELL), x1: Math.ceil((PLAY.x1 + 0.3) / CELL), z0: Math.floor((PLAY.z0 - 0.3) / CELL), z1: Math.ceil((PLAY.z1 + 0.3) / CELL) });
const inC = (r: { x0: number; x1: number; z0: number; z1: number }, X: number, Z: number) => X >= r.x0 && X < r.x1 && Z >= r.z0 && Z < r.z1;
const toC = (r: Rect) => ({ x0: Math.floor(r.x0 / CELL), x1: Math.ceil(r.x1 / CELL), z0: Math.floor(r.z0 / CELL), z1: Math.ceil(r.z1 / CELL) });

/** the stand points and the battle camera (v2 battleCamera: hero, the three lanes, the boss mark) for the line-of-sight test */
const STANDS: Array<[number, number]> = [[-1.6, 3.0], [0, -1.9], [-2.3, -2.5], [2.3, -2.5], [0, -3.6], [-4.0, -2.0], [4.0, -2.0]];
// the battle eye from the game's tuned camera (v2/battleCamera CAMERA_TUNE): look + back × dist
import { CAMERA_TUNE } from '../v2/battleCamera';
const T = CAMERA_TUNE;
let EYE: [number, number, number] = [T.back[0] * T.dist, T.lookY + T.back[1] * T.dist, T.lookZ + T.back[2] * T.dist];
export function setCheckEye(e: [number, number, number]) { EYE = e; }

/** the "body" band: what a person would walk into (cells 0..8 ≈ 0–0.6 m). Above it trees and eaves may overlap. */
const BODY_Y = 8;

export interface Occ { cells: Set<number>; /** column keys (x, z) of body-band cells */ body: Set<number> }
export const newOcc = (): Occ => ({ cells: new Set(), body: new Set() });
const col = (X: number, Z: number) => (X + 512) * 1024 + (Z + 512);

/** check the cells a group just built (keys of a temporary VoxWorld) against the scene so far. foot = declared footprint (m), mirrored
 *  and centred at the anchor. Returns the problems (empty = OK). */
export function checkCells(cells: Iterable<number>, o: { anchor: [number, number]; foot: { w: number; d: number }; occ: Occ; walk: Rect[]; stage: Rect; skipLos?: boolean; firstOnly?: boolean }): Issue[] {
  const issues: Issue[] = [], walk = o.walk.map(toC), stage = toC(o.stage), PC = playC();
  let groundN = 0, play = 0, walkN = 0, front = 0, hit = 0, outB = 0;
  let gx0 = 1e9, gx1 = -1e9, gz0 = 1e9, gz1 = -1e9;
  const solid: Array<[number, number, number]> = [];
  for (const k of cells) {
    const [X, Y, Z] = unkey(k); if (Y < 0) continue;   // y = −1 is the floor layer: groups may repaint it freely
    solid.push([X, Y, Z]);
    if (Y === 0) { groundN++; }
    if (Y <= BODY_Y) { gx0 = Math.min(gx0, X); gx1 = Math.max(gx1, X); gz0 = Math.min(gz0, Z); gz1 = Math.max(gz1, Z); }
    if (inC(PC, X, Z)) play++;
    if (Y >= 1 && walk.some(r => inC(r, X, Z))) walkN++;
    if (m(Z) > 6 && Y * CELL > 0.9) front++;
    if (Y <= BODY_Y && o.occ.body.has(col(X, Z))) hit++;
    if (!inC(stage, X, Z)) outB++;
    // These counts can only increase. Bounds needs the final denominator, and a group may still touch ground later.
    if (o.firstOnly && (play || walkN || front || hit)) return [{ kind: play ? 'play' : walkN ? 'walk' : front ? 'front' : 'collide', detail: '' }];
  }
  if (!solid.length) return issues;
  if (play) issues.push({ kind: 'play', detail: `${play} cells inside the battle floor` });
  if (walkN) issues.push({ kind: 'walk', detail: `${walkN} cells on a walkway` });
  if (front) issues.push({ kind: 'front', detail: `${front} cells above 0.9 m in front of the camera line` });
  if (hit) issues.push({ kind: 'collide', detail: `${hit} body cells overlap what is already there` });
  if (!groundN) issues.push({ kind: 'float', detail: 'nothing touches the ground' });
  if (outB > solid.length * 0.2) issues.push({ kind: 'bounds', detail: `${outB} cells outside the stage` });
  if (gx1 >= gx0) {
    const w = (gx1 - gx0 + 1) * CELL, d = (gz1 - gz0 + 1) * CELL;
    if (w > o.foot.w + 0.8 || d > o.foot.d + 0.8) issues.push({ kind: 'foot', detail: `real foot ${w.toFixed(1)}×${d.toFixed(1)} m > declared ${o.foot.w}×${o.foot.d}` });
  }
  if (!o.skipLos && !issues.length) {
    // line of sight: march each eye → stand ray (chest height 1.0 m) and look for a cell of this group above 1.2 m on it
    const set = new Set<number>(); for (const [X, Y, Z] of solid) if (Y * CELL > 1.2) set.add(key(X, Y, Z));
    if (set.size) for (const [sx0, sz0] of STANDS) { const sx = SX(sx0), sz = SZ(sz0);
      const ax = EYE[0], ay = EYE[1], az = EYE[2], bx = sx, by = 1.0, bz = sz, L = Math.hypot(bx - ax, by - ay, bz - az), n = Math.ceil(L / (CELL * 0.5));
      for (let i = 1; i < n - 2; i++) { const t = i / n, X = Math.floor((ax + (bx - ax) * t) / CELL), Y = Math.floor((ay + (by - ay) * t) / CELL), Z = Math.floor((az + (bz - az) * t) / CELL); if (set.has(key(X, Y, Z))) { issues.push({ kind: 'los', detail: `blocks the view of (${sx}, ${sz})` }); break; } }
      if (issues.length) break;
    }
  }
  return issues;
}
/** add a group's cells to the scene's occupancy */
export function commit(occ: Occ, cells: Iterable<number>, recordCells = true) {
  for (const k of cells) { const [X, Y, Z] = unkey(k); if (Y < 0) continue; if (recordCells) occ.cells.add(k); if (Y <= BODY_Y) occ.body.add(col(X, Z)); }
}
/** a whole-scene audit after everything is built: floating clusters (no path down to the ground through solid cells) */
export function floatingCells(cells: Pick<Map<number, unknown>, 'has'> & { keys(): Iterable<number> }, maxReport = 8) {
  // flood from every ground-touching cell (y ≤ 0) through 6-neighbours; whatever is left unvisited floats
  const seen = new Set<number>(), stack: number[] = [];
  for (const k of cells.keys()) { const y = (Math.floor(k / 1024) % 1024) - 512; if (y <= 0) { seen.add(k); stack.push(k); } }
  const D = [1024 * 1024, -1024 * 1024, 1024, -1024, 1, -1];
  while (stack.length) { const k = stack.pop()!; for (const d of D) { const n = k + d; if (!seen.has(n) && cells.has(n)) { seen.add(n); stack.push(n); } } }
  const left: number[] = []; for (const k of cells.keys()) if (!seen.has(k)) left.push(k);
  return { count: left.length, sample: left.slice(0, maxReport).map(unkey).map(([x, y, z]) => [+m(x).toFixed(1), +(y * CELL).toFixed(1), +m(z).toFixed(1)]) };
}
