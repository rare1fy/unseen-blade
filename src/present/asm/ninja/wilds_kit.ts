// 竹山的私有道具库（wilds 代理）：调色板、杉、竹丛、溪沟、注连绳、素木鸟居、山中小祠、叠石、狐火。
// 全部横平竖直：岩石是 2～3 层错位的大块，绳子是水平的粗绳带直垂的穗子和纸垂，水是一块块竖直的水幕。
import type { Ctx } from '../../scenes/stage';
import { M, hash, type W } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { pine } from '../../scenes/flora';
import { bamboo, skinBox } from '../../kyoto/temple_kit';
import type { Place } from '../types';

export const WC = {
  rock: 0x5c625e, rockD: 0x424846, rockL: 0x767c76, rockT: 0x8a8e86,
  moss: 0x4a6634, mossL: 0x5e7c40,
  earth: 0x4a3e30, earthD: 0x3c3228, earthL: 0x5a4c3a, litter: 0x6c6040, litterL: 0x7c7048,
  water: 0x4e9aa0, waterL: 0x8ccad0, foam: 0xd0ecee, bed: 0x14262a, bedL: 0x1e3a3a, plane: 0x3e8288,
  cedar: 0x1f3a28, cedarL: 0x2e5236, bark: 0x4e3628, barkD: 0x30201a,
  log: 0x5a4632, logD: 0x3c2e22, logEnd: 0x9a7e58, logRing: 0x76603e,
  rope: 0xd8c48a, ropeD: 0xae9a62, paper: 0xf4f0e4,
  wood: 0x6a625a, woodD: 0x48423c, woodL: 0x847c72,
  leaf: 0x2c4c26, leafL: 0x3e6432,
  foxfire: 0x9fe4ff, candle: 0xffb868,
};
type Box6 = [number, number, number, number, number, number];

/** a Japanese cedar (sugi): the generic pine with a slimmer crown in deep green */
export function cedar(w: W, x: number, z: number, h: number, seed: number) { pine(w, x, z, h, WC.bark, WC.cedar, WC.cedarL, { seed, slim: 0.82 }); }

/** a stand of bamboo over a rect (metres): n culms and a flat two-layer leaf canopy. Every canopy slab has its own culm under its
 *  centre, so nothing floats. */
export function grove(c: Ctx, x0: number, z0: number, x1: number, z1: number, n: number, seed: number, h: [number, number] = [6.2, 8.2]) {
  const w = c.w, r = (k: number) => hash(seed, k, 17);
  for (let i = 0; i < n; i++) bamboo(w, x0 + r(i) * (x1 - x0), z0 + (i + 0.5) * (z1 - z0) / n, h[0] + r(40 + i) * (h[1] - h[0]), seed * 31 + i);
  const m = Math.max(1, Math.round((z1 - z0) / 1.4));
  for (let i = 0; i < m; i++) {
    const cx = (x0 + x1) / 2 + (r(80 + i) - 0.5) * (x1 - x0) * 0.4, cz = z0 + (i + 0.5) * (z1 - z0) / m, X = M(cx), Z = M(cz);
    const hx = Math.max(6, Math.min(9, Math.round((x1 - x0) / CELL / 2) + 2)), hz = 8 + Math.floor(r(90 + i) * 3), y0 = M(h[0] - 1.0 + r(100 + i) * 0.8);
    bamboo(w, cx, cz, (y0 + 8) * CELL, seed * 37 + i);
    const body: Box6 = [X - hx, y0, Z - hz, X + hx, y0 + 5, Z + hz], cap: Box6 = [X - hx + 3, y0 + 6, Z - hz + 3, X + hx - 3, y0 + 7, Z + hz - 3];
    w.box(...body, WC.leaf).box(...cap, WC.leafL); skinBox(c, body, WC.leaf, 'leafskin', true); skinBox(c, cap, WC.leafL, 'leafskin', false);
  }
}

/** a sunk brook bed over a rect (cells, inclusive): the floor cell removed, a dark bed one below (glowing a little, so the winter
 *  pass leaves it open), a lighter shallow band along both banks, and the water plane over it */
export function brookCells(c: Ctx, X0: number, Z0: number, X1: number, Z1: number, alongX = true) {
  const w = c.w;
  w.box(X0, -1, Z0, X1, -1, Z1, null).box(X0, -2, Z0, X1, -2, Z1, WC.bed, 1);
  if (alongX) w.box(X0, -2, Z0, X1, -2, Z0 + 1, WC.bedL, 1).box(X0, -2, Z1 - 1, X1, -2, Z1, WC.bedL, 1);
  else w.box(X0, -2, Z0, X0 + 1, -2, Z1, WC.bedL, 1).box(X1 - 1, -2, Z0, X1, -2, Z1, WC.bedL, 1);
  c.water(X0 * CELL, Z0 * CELL, (X1 + 1) * CELL, (Z1 + 1) * CELL, WC.plane);
}

export type BoxFn = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null, g?: number) => void;
export const boxOf = (w: W): BoxFn => (x0, y0, z0, x1, y1, z1, c, g = 0) => { w.box(x0, y0, z0, x1, y1, z1, c, g); };
/** a rock built as stacked, offset boxes (cells: [half-u, half-v, height, du, dv] per tier, bottom first) around (U, V), a light top
 *  on each tier and a moss pad on the exposed top. Returns the top y and the boxes of each tier. */
export function crag(B: BoxFn, U: number, V: number, tiers: Array<[number, number, number, number, number]>, moss?: number, col = WC.rock, top = WC.rockL, Y0 = -1) {
  let y = Y0; const boxes: Box6[] = [];
  tiers.forEach(([hu, hv, h, du, dv], i) => {
    const y1 = y + h, u0 = U + du - hu, u1 = U + du + hu, v0 = V + dv - hv, v1 = V + dv + hv;
    B(u0, y, v0, u1, y1 - 1, v1, i === 0 ? WC.rockD : col); B(u0, y1, v0, u1, y1, v1, top);
    if (moss != null && hu > 3 && hv > 3 && i === tiers.length - 1) B(u0 + 2, y1 + 1, v0 + 2, u1 - 2, y1 + 1, v1 - 2, moss);
    boxes.push([u0, y, v0, u1, y1, v1]); y = y1 + 1;
  });
  return { top: y, boxes };
}

/** a sacred straw rope (shimenawa) along u: a thick rope with a twist band every 4 cells, straw tassels hanging straight down and
 *  zig-zag paper streamers (shide) between them. a..b along u (cells), Y its lower edge, v its front face. */
export function rope(B: BoxFn, a: number, b: number, Y: number, v: number, o: { thick?: number; tassel?: number } = {}) {
  const t = o.thick ?? 2, lo = Math.min(a, b), hi = Math.max(a, b);
  B(lo, Y, v - t + 1, hi, Y + t - 1, v, WC.rope);
  for (let u = lo + 2; u <= hi; u += 4) B(u, Y, v, u, Y + t - 1, v, WC.ropeD);
  const len = o.tassel ?? 3, span = hi - lo, n = Math.max(1, Math.floor(span / 10));
  for (let i = 0; i <= n; i++) {
    const u = Math.round(lo + 3 + (span - 6) * (n ? i / n : 0.5));
    B(u, Y - len, v, u, Y - 1, v, WC.ropeD);
    if (i < n) { const m = Math.round(lo + 3 + (span - 6) * (i + 0.5) / n); B(m, Y - 3, v, m + 1, Y - 1, v, WC.paper); B(m + 1, Y - 5, v, m + 2, Y - 4, v, WC.paper); }
  }
}
/** a rope ring round a box (cells, inclusive), one cell outside its faces, streamers on the front (+v) face */
export function ropeRing(B: BoxFn, b: Box6, Y: number) {
  const [u0, , v0, u1, , v1] = b;
  B(u0 - 1, Y, v0 - 1, u1 + 1, Y + 1, v0 - 1, WC.rope); B(u0 - 1, Y, v1 + 1, u1 + 1, Y + 1, v1 + 1, WC.rope);
  B(u0 - 1, Y, v0, u0 - 1, Y + 1, v1, WC.rope); B(u1 + 1, Y, v0, u1 + 1, Y + 1, v1, WC.rope);
  for (let u = u0 + 2; u < u1 - 1; u += 6) { B(u, Y - 4, v1 + 1, u, Y - 1, v1 + 1, WC.ropeD); B(u + 3, Y - 3, v1 + 1, u + 4, Y - 1, v1 + 1, WC.paper); B(u + 4, Y - 5, v1 + 1, u + 5, Y - 4, v1 + 1, WC.paper); }
}

/** a local frame: u across, v toward the front. front: which world direction the front faces */
export type Front = 'z+' | 'x+' | 'x-';
export const frontOf = (s: number): Front => s > 0 ? 'x-' : s < 0 ? 'x+' : 'z+';
export function frame(w: W, X: number, Z: number, f: Front) {
  const box = (u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, col: number | null, g = 0) => {
    if (f === 'z+') w.box(X + u0, y0, Z + v0, X + u1, y1, Z + v1, col, g);
    else if (f === 'x+') w.box(X + v0, y0, Z - u1, X + v1, y1, Z - u0, col, g);
    else w.box(X - v1, y0, Z + u0, X - v0, y1, Z + u1, col, g);
  };
  return box;
}

/** a plain torii of weathered wood or stone (no vermilion): two posts with black feet, a tie beam, and a top beam whose ends lift in
 *  two flat steps. front faces f (the beams run across it). h, span in metres. */
export function kiTorii(w: W, x: number, z: number, h: number, span: number, f: Front, col = WC.wood, colD = WC.woodD) {
  const B = frame(w, M(x), M(z), f), H = M(h), S = Math.round(M(span) / 2);
  for (const u of [-S, S]) { B(u - 2, -1, -2, u + 1, H, 1, col); B(u - 3, -1, -3, u + 2, 2, 2, colD); }
  const ny = Math.round(H * 0.74);
  B(-S - 5, ny, -1, S + 4, ny + 2, 0, col);
  B(-S - 6, H + 1, -2, S + 5, H + 2, 1, col);
  B(-S - 3, H + 3, -2, S + 2, H + 3, 1, colD);
  B(-S - 9, H + 3, -2, -S - 4, H + 4, 1, colD); B(S + 3, H + 3, -2, S + 8, H + 4, 1, colD);
}

/** a small mountain shrine (hokora) on a two-tier stone base: a dark wooden box with a lattice door, a verdigris copper roof in two
 *  plates, a rope with paper streamers over the door, a candle glowing inside. front faces f. Returns the candle position (metres). */
export function hokora(w: W, x: number, z: number, f: Front, Y = -1): [number, number, number] {
  const X = M(x), Z = M(z), B = frame(w, X, Z, f);
  B(-11, Y, -10, 11, Y + 3, 10, WC.rockD); B(-9, Y + 4, -8, 9, Y + 4, 8, WC.rockL);
  B(-6, Y + 5, -6, 6, Y + 17, 4, WC.woodD);
  B(-4, Y + 6, 4, 4, Y + 14, 4, 0x1c1814); B(-2, Y + 6, 5, -2, Y + 14, 5, WC.woodL); B(2, Y + 6, 5, 2, Y + 14, 5, WC.woodL);
  B(0, Y + 8, 4, 0, Y + 9, 4, WC.candle, 1);
  B(-9, Y + 18, -9, 9, Y + 19, 8, 0x34564c); B(-7, Y + 20, -7, 7, Y + 21, 6, 0x4a7466); B(-8, Y + 22, -1, 8, Y + 23, 0, 0x689486);
  B(-6, Y + 16, 5, 6, Y + 16, 5, WC.rope); B(-3, Y + 13, 5, -3, Y + 15, 5, WC.paper); B(3, Y + 13, 5, 3, Y + 15, 5, WC.paper);
  B(-2, Y + 5, 7, 2, Y + 5, 9, WC.rockT);
  const cx = f === 'z+' ? X : f === 'x+' ? X + 4 : X - 4, cz = f === 'z+' ? Z + 4 : Z;
  return [(cx + 0.5) * CELL, (Y + 9) * CELL, (cz + 0.5) * CELL];
}

/** fox fire: a few pale blue flames hovering at given points and one weak cool light (night only) */
export function foxfire(c: Ctx, p: Place, pts: Array<[number, number, number]>, k = 1) {
  for (const q of pts) c.flame(q, WC.foxfire, 0.07 + (Math.abs(q[0] * 7 + q[2] * 3) % 3) * 0.012);
  if (p.lamp > 0.3 && pts.length) { const q = pts[0]; c.light([q[0], q[1] + 0.2, q[2]], 0x8fd8ff, 1.8 * p.lamp * k, 4); }
}
