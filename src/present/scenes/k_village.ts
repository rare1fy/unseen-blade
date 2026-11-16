// Village & interiors kit (owned by the village scenes): walls with structure (stone plinth, proud posts and rails, cap beam, openings
// recessed into the wall with frame and sill), furniture made of real parts (top + apron + legs, seat + back rails, bed posts + bedding,
// carcass + doors + cornice, shelves with books in groups), and the landmarks of the four village scenes (fireplace, altar and stained
// glass, cauldron under a hood, the well, house fronts). House rules as in props.ts: axis-aligned masses, slopes and arches as a few
// wide steps, patterns only where they are structure (courses, boards, panes, stripes) and always in runs or groups, never per cell.
import type { VoxWorld } from '../look/voxkit';
import { addCardKind } from './cards';
import { M, hash } from './props';
import { CELL } from '../bestiary/kit';

type W = VoxWorld;
export type Bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null, g?: number) => void;
export type P3 = [number, number, number];

// ------------------------------------------------------------------ palette (two or three steps per material)
export const WD = 0x6a4a32, WD_D = 0x4a3222, WD_L = 0x86603e, WD_DD = 0x33231a;
export const PLAS = 0x9c8f7c, PLAS_D = 0x83786a, TIM = 0x4a3324, TIM_D = 0x36251a;
export const ST = 0x5e5c68, ST_L = 0x74727e, ST_D = 0x484650, ST_DD = 0x34323c, MORT = 0x403e48;
export const IRN = 0x2e2c36, IRN_L = 0x4c4a58, BRASS = 0xc09a48, LINEN = 0xd2c6ae, WAX = 0xeee4ca, SOOT = 0x1c1616, BONE_C = 0xe2d8c0;
export const FLM = 0xffc860, FLM2 = 0xff9030, FLM3 = 0xffeaa0, EMBER = 0xd8541a, LANT = 0xffb050;
export const SLATE = 0x4c4c60, SLATE_D = 0x363644, SLATE_L = 0x5e5e74;
export const LOG = 0x3e2c22, LOG_END = 0x9a7a52;

export const cm = (n: number) => n * CELL;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** a box function in a piece's own frame: local x across, local z toward the piece's front, rotated r quarter turns
 *  (r = 0 front faces +z, 1 faces +x, 2 faces −z, 3 faces −x) about the world cell (X, Z) */
export function loc(w: W, X: number, Z: number, r = 0): Bx {
  const p = (lx: number, lz: number) => (r === 0 ? [X + lx, Z + lz] : r === 1 ? [X + lz, Z - lx] : r === 2 ? [X - lx, Z - lz] : [X - lz, Z + lx]);
  return (x0, y0, z0, x1, y1, z1, c, g = 0) => { const [a, b] = p(x0, z0), [e, f] = p(x1, z1); w.box(a, y0, b, e, y1, f, c, g); };
}
/** world metres of a local cell (centre) of a piece placed with loc() */
export function locM(X: number, Z: number, r: number, lx: number, y: number, lz: number): P3 {
  const [a, b] = r === 0 ? [X + lx, Z + lz] : r === 1 ? [X + lz, Z - lx] : r === 2 ? [X - lx, Z - lz] : [X - lz, Z + lx];
  return [(a + 0.5) * CELL, (y + 0.5) * CELL, (b + 0.5) * CELL];
}

/** coursed masonry: bricks bw×bh with flush mortar lines, every other course offset by half a brick */
export const brick = (a: number, y: number, base: number, mortar: number, bw = 6, bh = 4) => {
  const row = Math.floor((y + 64) / bh), ly = (y + 64) % bh; if (ly === bh - 1) return mortar;
  return mod(a + (row & 1) * (bw >> 1), bw) === bw - 1 ? mortar : base;
};
/** ashlar: big blocks in courses, each block one of two close tones (whole blocks, never single cells), mortar lines between */
export const ashlar = (a: number, y: number, A: number, B: number, mortar: number, bw = 10, bh = 5) => {
  const row = Math.floor((y + 64) / bh), ly = (y + 64) % bh, sx = a + 512 + (row & 1) * (bw >> 1);
  if (ly === bh - 1 || sx % bw === bw - 1) return mortar;
  return hash(Math.floor(sx / bw), row, 7) < 0.72 ? A : B;
};

// ------------------------------------------------------------------ walls
/** a straight wall in its own frame: a runs along it (world x or z cells), d goes from the room-side face outward (d < 0 = proud
 *  into the room), y up. face = the world cell row of the wall's room-side layer, out = which way the wall's thickness goes. */
export class Run {
  constructor(readonly w: W, readonly axis: 'x' | 'z', readonly face: number, readonly out: 1 | -1) {}
  private v(d: number) { return this.face + this.out * d; }
  put(a: number, d: number, y: number, c: number | null, g = 0) { const v = this.v(d); if (this.axis === 'x') this.w.set(a, y, v, c, g); else this.w.set(v, y, a, c, g); return this; }
  box(a0: number, d0: number, y0: number, a1: number, d1: number, y1: number, c: number | null, g = 0) {
    const v0 = this.v(d0), v1 = this.v(d1);
    if (this.axis === 'x') this.w.box(a0, y0, v0, a1, y1, v1, c, g); else this.w.box(v0, y0, a0, v1, y1, a1, c, g);
    return this;
  }
  /** metres of a cell centre */
  m(a: number, d: number, y: number): P3 { const v = this.v(d); return this.axis === 'x' ? [(a + 0.5) * CELL, (y + 0.5) * CELL, (v + 0.5) * CELL] : [(v + 0.5) * CELL, (y + 0.5) * CELL, (a + 0.5) * CELL]; }
  /** the same frame as a Bx (local x = a, local z = d) */
  bx(): Bx { return (x0, y0, z0, x1, y1, z1, c, g = 0) => { this.box(x0, z0, y0, x1, z1, y1, c, g); }; }
}

export interface WallOpt {
  t?: number; plinth?: number; cPlinth: number; cCap?: number;
  body: (a: number, y: number) => number;
  /** post (or pilaster) starts along the run, each postW wide, proud of the face by one block */
  posts?: number[]; postW?: number; cPost?: number;
  /** horizontal rails proud of the face: [y, height, colour] */
  rails?: Array<[number, number, number]>;
  /** cap beam colour, laid where the wall stands at its full height (h >= full); broken stretches get a rubble top instead */
  top?: number; full?: number; rubble?: number;
  /** first row to build (cells): a wall continued in the cutaway layer starts above the part kept in the world */
  from?: number;
}
export function buildWall(R: Run, a0: number, a1: number, h: (a: number) => number, o: WallOpt) {
  const t = o.t ?? 5, pl = o.plinth ?? 6, pw = o.postW ?? 3, full = o.full ?? 1e9;
  const isPost = (a: number) => (o.posts ?? []).some(p => a >= p && a < p + pw);
  for (let a = a0; a <= a1; a++) {
    const H = h(a), post = isPost(a), broken = H < full, top = broken && o.rubble != null ? H - 2 : H;
    const y0 = o.from ?? -2;
    for (let y = y0; y <= H; y++) {
      let c = y <= pl ? o.cPlinth : post ? (o.cPost ?? TIM) : o.body(a, y);
      if (y > top && y > pl) c = o.rubble!;
      R.box(a, 0, y, a, t - 1, y, c);
    }
    if (y0 <= pl) { R.box(a, -1, y0, a, -1, Math.min(pl, H) - 1, o.cPlinth); if (H >= pl) R.put(a, -1, pl, o.cCap ?? o.cPlinth); }
    if (post && top > pl + 1) R.box(a, -1, Math.max(pl + 1, y0), a, -1, top, o.cPost ?? TIM);
    for (const [ry, rh, rc] of o.rails ?? []) if (ry + rh - 1 <= top && ry >= y0) R.box(a, -1, ry, a, -1, ry + rh - 1, rc);
    if (o.top != null && !broken) R.box(a, -1, H + 1, a, t, H + 2, o.top);
  }
}

export interface OpenOpt {
  t?: number;
  /** stepped head: number of tiers, rows per tier, how far each tier steps in per side */
  tiers?: number; tierH?: number; tierIn?: number;
  /** casing colour: lines the reveal through the whole wall and rings the opening on the room face */
  frame?: number; sill?: number; lintel?: number;
  /** what fills the opening at depth glassD: [colour, glow] or null for open */
  glass?: (u: number, v: number) => [number, number] | null; glassD?: number;
}
/** cut an opening through a wall run (centre ac, bottom y0, half-width hw, height ht) */
export function opening(R: Run, ac: number, y0: number, hw: number, ht: number, o: OpenOpt = {}) {
  const t = o.t ?? 5, tiers = o.tiers ?? 0, tH = o.tierH ?? 3, tIn = o.tierIn ?? 2, body = ht - tiers * tH;
  const half = (y: number) => { if (y < y0 || y >= y0 + ht) return -1; const v = y - y0; return v < body ? hw : hw - (Math.floor((v - body) / tH) + 1) * tIn; };
  const inside = (a: number, y: number) => { const h = half(y); return h >= 0 && Math.abs(a - ac) <= h; };
  for (let y = y0; y < y0 + ht; y++) { const h = half(y); if (h >= 0) R.box(ac - h, -1, y, ac + h, t, y, null); }
  if (o.frame != null) for (let y = Math.max(0, y0 - 1); y <= y0 + ht; y++) for (let a = ac - hw - 1; a <= ac + hw + 1; a++) {
    if (inside(a, y) || !(inside(a - 1, y) || inside(a + 1, y) || inside(a, y - 1) || inside(a, y + 1))) continue;
    R.box(a, -1, y, a, t - 1, y, o.frame);
  }
  if (o.lintel != null) R.box(ac - hw - 2, -1, y0 + ht, ac + hw + 2, -1, y0 + ht + 1, o.lintel);
  if (o.sill != null && y0 > 0) R.box(ac - hw - 1, -2, y0 - 1, ac + hw + 1, t - 1, y0 - 1, o.sill);
  if (o.glass) { const gd = o.glassD ?? (t >> 1); for (let y = y0; y < y0 + ht; y++) { const h = half(y); for (let a = ac - h; a <= ac + h; a++) { const gl = o.glass(a - ac, y - y0); if (gl) R.put(a, gd, y, gl[0], gl[1]); } } }
  return { inside, half };
}
/** mullioned window panes: a cross of bars, the panes filled with c (glowing g); broken panes left open in one quadrant */
export const panes = (hw: number, ht: number, c: number, g: number, bar = TIM_D, broken = -1) => (u: number, v: number): [number, number] | null => {
  if (u === 0 || v === ht >> 1) return [bar, 0];
  const q = (u < 0 ? 0 : 1) + (v < ht >> 1 ? 0 : 2);
  return q === broken ? null : [c, g];
};
/** curtains on a rod either side of a window (on the room face): pleats as two-tone columns, a dark hem */
export function curtains(R: Run, ac: number, y0: number, hw: number, ht: number, c: number, c2: number, hem: number, torn = false) {
  R.box(ac - hw - 7, -2, y0 + ht + 2, ac + hw + 7, -2, y0 + ht + 2, IRN_L);
  for (const s of [-1, 1]) for (let k = 1; k <= 5; k++) {
    const a = ac + s * (hw + k), bot = torn && s > 0 ? y0 + 6 + (k & 1) * 3 : y0 - 6;
    R.box(a, -2, bot + 1, a, -2, y0 + ht + 1, k & 1 ? c : c2); R.put(a, -2, bot, hem);
  }
}

// ------------------------------------------------------------------ floors
type CRect = { X0: number; Z0: number; X1: number; Z1: number };
/** boards along x or z with staggered butt joints and dark seams (flush colour lines: they read the same from above at a fraction of the faces) */
export function boards(w: W, r: CRect, along: 'x' | 'z', cols: number[], seam: number, len = 34, wid = 5, seed = 1) {
  for (let x = r.X0; x <= r.X1; x++) for (let z = r.Z0; z <= r.Z1; z++) {
    const u = along === 'x' ? x : z, v = along === 'x' ? z : x, row = Math.floor((v + 4096) / wid), lv = (v + 4096) % wid;
    const off = Math.floor(hash(row, seed, 3) * len), lu = mod(u + off, len), board = Math.floor((u + off + 4096) / len);
    w.set(x, -1, z, lv === wid - 1 || lu === len - 1 ? seam : cols[Math.floor(hash(row, board, seed) * cols.length)]);
  }
}
/** flagstones in courses along x: rows `dep` deep, slab lengths varying, flush grout lines */
export function flags(w: W, r: CRect, cols: number[], grout: number, dep = 9, seed = 2) {
  for (let z = r.Z0; z <= r.Z1; z++) {
    const row = Math.floor((z + 4096) / dep), lz = (z + 4096) % dep;
    let x = r.X0, k = 0, start = r.X0 - Math.floor(hash(row, seed) * 8);
    while (x <= r.X1) {
      const L = 10 + Math.floor(hash(row, k, seed) * 7), end = start + L, c = cols[Math.floor(hash(row, k, seed + 1) * cols.length)];
      for (; x <= Math.min(end, r.X1); x++) {
        w.set(x, -1, z, lz === dep - 1 || x === end ? grout : c);
      }
      start = end + 1; k++;
    }
  }
}
/** small square setts (cobbles) in a grid */
export function setts(w: W, r: CRect, cols: number[], grout: number, s = 5) {
  for (let x = r.X0; x <= r.X1; x++) for (let z = r.Z0; z <= r.Z1; z++) {
    const lx = mod(x + (Math.floor((z + 4096) / s) & 1) * (s >> 1), s), lz = mod(z, s);
    w.set(x, -1, z, lx === s - 1 || lz === s - 1 ? grout : cols[Math.floor(hash(Math.floor((x + 4096) / s), Math.floor((z + 4096) / s), 5) * cols.length)]);
  }
}
/** a rug flush with the floor: dark edge lines bounding a border band with a dashed motif row, an inner frame line, corner squares, a
 *  stepped-lozenge medallion (three nested rectangles), fringed short ends */
export function rug(w: W, r: CRect, c: { field: number; band: number; edge: number; motif: number; fringe?: number }, o: { worn?: boolean; skip?: (x: number, z: number) => boolean } = {}) {
  const { X0, X1, Z0, Z1 } = r, cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, m = Math.min(X1 - X0, Z1 - Z0) / 2 - 10;
  for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) {
    const ex = Math.min(x - X0, X1 - x), ez = Math.min(z - Z0, Z1 - z), e = Math.min(ex, ez), u = Math.abs(x - cx), v = Math.abs(z - cz);
    let col = c.field;
    if (e === 0 || e === 4) col = c.edge;
    else if (e <= 3) col = e === 2 && mod(ex < ez ? z - Z0 : x - X0, 6) < 3 ? c.motif : c.band;
    else if (e === 7) col = c.band;
    else if (ex >= 9 && ex <= 13 && ez >= 9 && ez <= 13) col = c.motif;
    else if (u <= 2 && v <= 2) col = c.motif;
    else if (u <= m * 0.16 && v <= m * 0.16) col = c.edge;
    else if ((u <= m * 0.62 && v <= m * 0.22) || (u <= m * 0.42 && v <= m * 0.42) || (u <= m * 0.22 && v <= m * 0.62)) col = (u <= m * 0.62 - 3 && v <= m * 0.22 - 3) || (u <= m * 0.42 - 3 && v <= m * 0.42 - 3) || (u <= m * 0.22 - 3 && v <= m * 0.62 - 3) ? c.band : c.edge;
    if (o.worn && e > 4 && hash(x >> 3, z >> 3, 41) < 0.07) col = shade(col, 0.8);
    if (o.skip?.(x, z)) continue;
    w.set(x, -1, z, col);
  }
  if (c.fringe != null) for (let x = X0 + 1; x <= X1 - 1; x += 2) { if (!o.skip?.(x, Z0)) w.set(x, -1, Z0 - 1, c.fringe); if (!o.skip?.(x, Z1)) w.set(x, -1, Z1 + 1, c.fringe); }
}

// ------------------------------------------------------------------ small things (world cells)
export function candleStick(w: W, X: number, y0: number, Z: number, h = 3, metal = BRASS, lit = true): P3 {
  w.box(X - 1, y0, Z - 1, X + 1, y0, Z + 1, metal).box(X, y0 + 1, Z, X, y0 + 2, Z, metal).box(X - 1, y0 + 3, Z, X + 1, y0 + 3, Z, metal);
  w.box(X, y0 + 4, Z, X, y0 + 3 + h, Z, WAX); if (lit) w.set(X, y0 + 4 + h, Z, FLM, 1); else w.set(X, y0 + 4 + h, Z, 0x2a2420);
  return [(X + 0.5) * CELL, (y0 + 4.6 + h) * CELL, (Z + 0.5) * CELL];
}
/** a cluster of three bare candles of different heights */
export function candles(w: W, X: number, y0: number, Z: number, wax = WAX, flame = FLM, hs: [number, number, number] = [5, 3, 2]): P3 {
  const spots: Array<[number, number]> = [[0, 0], [2, 1], [-1, 2]];
  spots.forEach(([dx, dz], i) => { w.box(X + dx, y0, Z + dz, X + dx, y0 + hs[i] - 1, Z + dz, wax).set(X + dx, y0 + hs[i], Z + dz, flame, 1); });
  return [(X + 0.5) * CELL, (y0 + hs[0] + 1) * CELL, (Z + 0.5) * CELL];
}
export function pot(w: W, X: number, y0: number, Z: number, c = IRN, fill = 0x5a4a3a) {
  w.box(X - 1, y0, Z - 1, X + 1, y0, Z + 1, c).box(X - 2, y0 + 1, Z - 2, X + 2, y0 + 3, Z + 2, c).box(X - 2, y0 + 4, Z - 2, X + 2, y0 + 4, Z + 2, c)
    .box(X - 1, y0 + 4, Z - 1, X + 1, y0 + 4, Z + 1, fill).set(X - 3, y0 + 3, Z, c).set(X + 3, y0 + 3, Z, c);
}
export function bowl(w: W, X: number, y0: number, Z: number, c = WD_L, fill = 0xb88a4a) { w.box(X - 1, y0, Z - 1, X + 1, y0, Z + 1, c).box(X - 1, y0 + 1, Z - 1, X + 1, y0 + 1, Z + 1, fill).box(X - 2, y0 + 1, Z, X + 2, y0 + 1, Z, c).box(X, y0 + 1, Z - 2, X, y0 + 1, Z + 2, c); }
export function jug(w: W, X: number, y0: number, Z: number, c = 0x8a5a3a) { w.box(X - 1, y0, Z - 1, X + 1, y0 + 3, Z + 1, c).box(X, y0 + 4, Z, X, y0 + 4, Z, c).set(X + 2, y0 + 2, Z, c).set(X + 2, y0 + 3, Z, c); }
export function bookFlat(w: W, X: number, y0: number, Z: number, c: number, pages = LINEN, alongX = true) { const a = alongX ? 2 : 1, b = alongX ? 1 : 2; w.box(X - a, y0, Z - b, X + a, y0, Z + b, c).box(X - a + (alongX ? 0 : 1), y0 + 1, Z - b + (alongX ? 1 : 0), X + a - (alongX ? 1 : 0), y0 + 1, Z + b - (alongX ? 0 : 1), pages).box(X - a, y0 + 2, Z - b, X + a, y0 + 2, Z + b, c); }
export function openBook(w: W, X: number, y0: number, Z: number, cover: number) { w.box(X - 4, y0, Z - 2, X + 4, y0, Z + 2, cover).box(X - 3, y0 + 1, Z - 2, X - 1, y0 + 1, Z + 2, LINEN).box(X + 1, y0 + 1, Z - 2, X + 3, y0 + 1, Z + 2, LINEN).box(X, y0 + 1, Z - 2, X, y0 + 1, Z + 2, 0x8a7a62); }
export function loaf(w: W, X: number, y0: number, Z: number) { w.box(X - 2, y0, Z - 1, X + 2, y0 + 1, Z + 1, 0x9a6a32).box(X - 1, y0 + 2, Z - 1, X + 1, y0 + 2, Z, 0xb88a4a); }
export function skullAt(w: W, X: number, y0: number, Z: number, face: 'x' | 'z' | '-x' | '-z' = 'z', c = BONE_C) {
  w.box(X - 1, y0 + 1, Z - 1, X + 1, y0 + 3, Z + 1, c).box(X - 1, y0, Z - 1, X + 1, y0, Z + 1, null);
  const f = face === 'z' ? [0, 1] : face === '-z' ? [0, -1] : face === 'x' ? [1, 0] : [-1, 0], [fx, fz] = f;
  if (fz) { w.box(X - 1, y0, Z + fz, X + 1, y0, Z + fz, c).set(X - 1, y0 + 2, Z + fz, 0x1a1418).set(X + 1, y0 + 2, Z + fz, 0x1a1418); }
  else { w.box(X + fx, y0, Z - 1, X + fx, y0, Z + 1, c).set(X + fx, y0 + 2, Z - 1, 0x1a1418).set(X + fx, y0 + 2, Z + 1, 0x1a1418); }
}

// ------------------------------------------------------------------ furniture (metres for placement, rotation r as in loc)
/** table: two-block top, apron under it, square legs, a stretcher; returns the top's surface y (cells) */
export function tableK(w: W, x: number, z: number, r = 0, L = 28, D = 16, top = WD_L, leg = WD_D) {
  const b = loc(w, M(x), M(z), r), a = L >> 1, d = D >> 1;
  b(-a, 10, -d, a, 11, d, top); b(-a + 2, 8, -d + 2, a - 2, 9, d - 2, leg);
  for (const [i, j] of [[-a + 1, -d + 1], [a - 2, -d + 1], [-a + 1, d - 2], [a - 2, d - 2]]) b(i, 0, j, i + 1, 9, j + 1, leg);
  b(-a + 3, 2, -1, a - 3, 2, 0, leg);
  return 12;
}
export function chairK(w: W, x: number, z: number, r = 0, c = WD, c2 = WD_D) {
  const b = loc(w, M(x), M(z), r);
  b(-3, 6, -3, 3, 6, 3, c); b(-3, 5, 3, 3, 5, 3, c2);
  for (const [i, j] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) b(i, 0, j, i, 5, j, c2);
  b(-3, 7, -3, -3, 16, -3, c2); b(3, 7, -3, 3, 16, -3, c2);
  b(-2, 10, -3, 2, 10, -3, c); b(-2, 13, -3, 2, 15, -3, c);
}
/** a chair knocked over onto its back */
export function chairDown(w: W, x: number, z: number, r = 0, c = WD, c2 = WD_D) {
  const b = loc(w, M(x), M(z), r);
  b(-3, 0, -12, -3, 0, -3, c2); b(3, 0, -12, 3, 0, -3, c2); b(-2, 0, -9, 2, 0, -9, c); b(-2, 0, -6, 2, 0, -4, c);   // back flat on the floor
  b(-3, 1, -3, 3, 7, -3, c);                                                                                       // seat on edge
  for (const [i, y] of [[-3, 1], [3, 1], [-3, 7], [3, 7]]) b(i, y, -2, i, y, 3, c2);                                // legs pointing out
}
export function benchK(w: W, x: number, z: number, r = 0, L = 22) {
  const b = loc(w, M(x), M(z), r), a = L >> 1;
  b(-a, 6, -2, a, 6, 2, WD_L); b(-a + 1, 0, -2, -a + 2, 5, 2, WD_D); b(a - 2, 0, -2, a - 1, 5, 2, WD_D); b(-a + 3, 2, 0, a - 3, 2, 0, WD_D);
}
export function stoolK(w: W, x: number, z: number) { const b = loc(w, M(x), M(z)); b(-2, 5, -2, 2, 5, 2, WD_L); for (const [i, j] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) b(i, 0, j, i, 4, j, WD_D); b(-2, 2, 0, 2, 2, 0, WD_D); }
/** bed with its head against the back (−z local): corner posts with caps, panelled headboard, mattress, blanket with a folded sheet
 *  and a stripe, two pillows */
export function bedK(w: W, x: number, z: number, r: number, blanket: number, stripe: number) {
  const b = loc(w, M(x), M(z), r), hw = 10, hl = 15;
  b(-hw, 0, -hl, -hw + 1, 17, -hl + 1, WD_D); b(hw - 1, 0, -hl, hw, 17, -hl + 1, WD_D); b(-hw, 18, -hl, -hw + 1, 18, -hl + 1, WD_L); b(hw - 1, 18, -hl, hw, 18, -hl + 1, WD_L);
  b(-hw, 0, hl - 1, -hw + 1, 10, hl, WD_D); b(hw - 1, 0, hl - 1, hw, 10, hl, WD_D); b(-hw, 11, hl - 1, -hw + 1, 11, hl, WD_L); b(hw - 1, 11, hl - 1, hw, 11, hl, WD_L);
  b(-hw + 2, 6, -hl, hw - 2, 15, -hl, WD); b(-hw + 2, 16, -hl, hw - 2, 16, -hl, WD_D); b(-hw + 4, 8, -hl + 1, hw - 4, 13, -hl + 1, WD_L);
  b(-hw + 2, 6, hl, hw - 2, 9, hl, WD); b(-hw + 2, 10, hl, hw - 2, 10, hl, WD_D);
  b(-hw, 3, -hl + 2, -hw, 5, hl - 2, WD_D); b(hw, 3, -hl + 2, hw, 5, hl - 2, WD_D);
  b(-hw + 1, 3, -hl + 1, hw - 1, 7, hl - 1, LINEN);
  b(-hw + 1, 5, -3, hw - 1, 8, hl - 1, blanket); b(-hw + 2, 5, -3, hw - 2, 7, hl - 1, LINEN);   // blanket over the top and down both sides
  b(-hw + 1, 8, -5, hw - 1, 9, -4, 0xe4dccb); b(-hw + 1, 5, hl - 6, hw - 1, 8, hl - 5, stripe); b(-hw + 1, 5, hl - 3, hw - 1, 8, hl - 3, stripe);
  b(-hw + 2, 8, -hl + 2, -1, 10, -hl + 5, 0xe8e2d4); b(1, 8, -hl + 2, hw - 2, 10, -hl + 5, 0xe8e2d4);
}
/** chest: body, two-step lid, iron straps over front, lid and back, a brass lock */
export function chestK(w: W, x: number, z: number, r = 0, wood = WD, band = IRN) {
  const b = loc(w, M(x), M(z), r);
  b(-7, 0, -4, 7, 7, 4, wood); b(-7, 8, -4, 7, 9, 4, WD_L); b(-6, 10, -3, 6, 10, 3, WD_L);
  for (const i of [-5, 4]) { b(i, 0, 5, i + 1, 9, 5, band); b(i, 0, -5, i + 1, 9, -5, band); b(i, 8, -4, i + 1, 10, 4, band); }
  b(-8, 0, -4, -8, 7, 4, WD_D); b(8, 0, -4, 8, 7, 4, WD_D); b(-1, 5, 5, 1, 7, 5, BRASS);
}
export function nightstand(w: W, x: number, z: number, r = 0) { const b = loc(w, M(x), M(z), r); b(-3, 0, -3, 3, 8, 3, WD_D); b(-4, 9, -4, 4, 9, 4, WD_L); b(-2, 5, 4, 2, 7, 4, WD); b(0, 6, 5, 0, 6, 5, BRASS); return 10; }
/** wardrobe / cupboard: carcass, two raised door panels, cornice and plinth, brass pulls */
export function cupboard(w: W, x: number, z: number, r = 0, W2 = 10, H = 30, D = 4) {
  const b = loc(w, M(x), M(z), r);
  b(-W2, 0, -D, W2, H, D, WD_D); b(-W2 - 1, H + 1, -D - 1, W2 + 1, H + 2, D + 1, WD_L); b(-W2 - 1, 0, -D - 1, W2 + 1, 1, D + 1, WD_DD);
  b(-W2 + 2, 4, D + 1, -1, H - 3, D + 1, WD); b(1, 4, D + 1, W2 - 2, H - 3, D + 1, WD); b(-W2 + 3, 6, D + 1, -2, H - 5, D + 1, WD_L); b(2, 6, D + 1, W2 - 3, H - 5, D + 1, WD_L);
  b(-1, 14, D + 2, -1, 16, D + 2, BRASS); b(1, 14, D + 2, 1, 16, D + 2, BRASS);
}
/** a row of books standing on a shelf (local frame): groups of 2–6 of one colour (alternate books a shade darker), each group its own
 *  height, an occasional gap or a lying stack; `fill` < 1 leaves the shelf partly empty */
export function books(b: Bx, x0: number, x1: number, z0: number, z1: number, y: number, hMax: number, seed: number, pal: number[], fill = 1) {
  let x = x0, g = 0;
  while (x <= x1) {
    const r = hash(g, seed, 3);
    if (r > fill) { x += 2 + Math.floor(hash(g, seed, 4) * 4); g++; continue; }
    const col = pal[Math.floor(hash(g, seed, 5) * pal.length)], dark = shade(col, 0.82);
    if (r < 0.12 && x + 4 <= x1) { const n = 2 + Math.floor(hash(g, seed, 6) * 2); for (let k = 0; k < n; k++) b(x, y + k, z0, x + 4, y + k, z1 - 1, k & 1 ? dark : col); x += 6; g++; continue; }
    const n = 2 + Math.floor(hash(g, seed, 7) * 5), h = hMax - Math.floor(hash(g, seed, 8) * 3);
    for (let k = 0; k < n && x <= x1; k++, x++) b(x, y, z0, x, y + h - 1 - (k === n - 1 && n > 3 ? 1 : 0), z1, k & 1 ? dark : col);
    if (hash(g, seed, 9) < 0.3) x++;
    g++;
  }
}
export const shade = (c: number, k: number) => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
export const BOOKS = [0x7a2a2a, 0x2e4a6a, 0x3a5a32, 0x8a6a2a, 0x4e2e4e, 0x6a4a32];
/** bookshelf: dark back, two-block sides, plinth, cornice, shelves every 9 blocks filled with books */
export function bookshelf(w: W, x: number, z: number, r: number, W2: number, H: number, seed: number, pal = BOOKS, fill = 0.85) {
  const b = loc(w, M(x), M(z), r);
  b(-W2, 0, -3, W2, H, -3, 0x2a1c14); b(-W2, 0, -3, -W2 + 1, H, 2, WD_D); b(W2 - 1, 0, -3, W2, H, 2, WD_D);
  b(-W2 - 1, H + 1, -4, W2 + 1, H + 2, 3, WD_L); b(-W2, 0, -2, W2, 1, 2, WD_D);
  for (let y = 1, k = 0; y + 8 <= H; y += 9, k++) { b(-W2 + 2, y, -2, W2 - 2, y, 2, WD); books(b, -W2 + 2, W2 - 2, -2, 1, y + 1, 7, seed * 13 + k, pal, fill); }
}
/** dresser (hutch): cupboard below with two panelled doors and a drawer row, open shelves above with plates and jugs */
export function dresser(w: W, x: number, z: number, r = 0) {
  const b = loc(w, M(x), M(z), r), a = 11;
  b(-a, 0, -4, a, 11, 3, WD_D); b(-a - 1, 12, -4, a + 1, 12, 4, WD_L);
  b(-a + 1, 2, 4, -1, 7, 4, WD); b(1, 2, 4, a - 1, 7, 4, WD); b(-a + 1, 9, 4, a - 1, 10, 4, WD); b(-2, 5, 5, -2, 5, 5, BRASS); b(2, 5, 5, 2, 5, 5, BRASS); b(-6, 10, 5, -6, 10, 5, BRASS); b(6, 10, 5, 6, 10, 5, BRASS);
  b(-a, 13, -4, a, 30, -4, 0x2e2018); b(-a, 13, -4, -a + 1, 30, -1, WD_D); b(a - 1, 13, -4, a, 30, -1, WD_D); b(-a - 1, 31, -5, a + 1, 32, 0, WD_L);
  for (const y of [19, 25]) b(-a + 2, y, -3, a - 2, y, -1, WD);
  for (const [px, y] of [[-8, 20], [-4, 20], [4, 20], [8, 20], [-6, 26], [-2, 26], [2, 26]]) b(px - 1, y, -3, px + 1, y + 3, -3, 0xd8d2c4), b(px, y + 1, -3, px, y + 2, -3, 0x6a7a9a);
  b(6, 26, -3, 8, 28, -2, 0x8a5a3a); b(0, 13, -2, 2, 16, 0, 0x8a5a3a); b(-7, 13, -2, -4, 14, 1, WD_L);
}
/** kitchen counter: cupboard run with door panels, a stone top overhanging the front */
export function counter(w: W, x: number, z: number, r: number, L: number) {
  const b = loc(w, M(x), M(z), r), a = L >> 1;
  b(-a, 0, -4, a, 11, 3, WD_D); b(-a, 0, 4, a, 1, 4, WD_DD);
  for (let i = -a + 1; i + 7 <= a; i += 10) { b(i, 3, 4, i + 7, 10, 4, WD); b(i + 6, 8, 5, i + 6, 8, 5, BRASS); }
  b(-a - 1, 12, -4, a + 1, 13, 5, ST_L); b(-a - 1, 12, 5, a + 1, 12, 5, ST);
  return 14;
}
/** wall shelf on brackets (in a wall's frame) */
export function shelfOn(R: Run, a0: number, a1: number, y: number, dep = 5, c = WD, br = WD_D) { R.box(a0, -dep, y, a1, -1, y, c); for (const a of [a0 + 1, a1 - 1]) R.box(a, -dep + 1, y - 3, a, -1, y - 1, br).box(a, -2, y - 4, a, -1, y - 4, br); }
/** a jar or bottle standing in a wall's frame at (a, d) */
export function jarOn(R: Run, a: number, d: number, y: number, h: number, c: number, lid: number, g = 0) { R.box(a, d - 1, y, a + 1, d, y + h - 1, c, g); R.box(a, d - 1, y + h, a + 1, d, y + h, lid); }
export function bottleOn(R: Run, a: number, d: number, y: number, kind: number, c: number, g = 1) {
  if (kind === 0) { R.box(a, d - 1, y, a + 1, d, y + 3, c, g); R.put(a, d, y + 4, 0x6a6a7a); R.put(a, d, y + 5, 0x8a6a4a); return 2; }
  if (kind === 1) { R.box(a, d - 2, y, a + 2, d, y + 2, c, g); R.put(a + 1, d - 1, y + 3, 0x6a6a7a); R.put(a + 1, d - 1, y + 4, 0x8a6a4a); return 3; }
  R.box(a, d, y, a, d, y + 2, c, g); R.put(a, d, y + 3, 0x8a6a4a); return 1;
}
export function barrelK(w: W, x: number, z: number, wood = WD, hoop = IRN, lid = WD_L) {
  const X = M(x), Z = M(z);
  w.box(X - 3, 0, Z - 3, X + 3, 1, Z + 3, wood).box(X - 4, 2, Z - 4, X + 4, 10, Z + 4, wood).box(X - 3, 11, Z - 3, X + 3, 12, Z + 3, wood);
  w.box(X - 4, 3, Z - 4, X + 4, 3, Z + 4, hoop).box(X - 4, 9, Z - 4, X + 4, 9, Z + 4, hoop).box(X - 3, 1, Z - 3, X + 3, 1, Z + 3, hoop).box(X - 3, 11, Z - 3, X + 3, 11, Z + 3, hoop);
  for (const [i, j] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) w.box(X + i, 2, Z + j, X + i, 10, Z + j, null);
  w.box(X - 2, 12, Z - 2, X + 2, 12, Z + 2, lid);
  return 13;
}
/** crate: planked box with a frame on every edge */
export function crateK(w: W, x: number, z: number, s = 5, c = WD_L, band = WD_D, y0 = 0) {
  const X = M(x), Z = M(z), y1 = y0 + 2 * s;
  w.box(X - s, y0, Z - s, X + s, y1, Z + s, c);
  for (const [i, j] of [[-s, -s], [s, -s], [-s, s], [s, s]]) w.box(X + i, y0, Z + j, X + i, y1, Z + j, band);
  for (const y of [y0, y1]) w.box(X - s, y, Z - s, X + s, y, Z - s, band).box(X - s, y, Z + s, X + s, y, Z + s, band).box(X - s, y, Z - s, X - s, y, Z + s, band).box(X + s, y, Z - s, X + s, y, Z + s, band);
  w.box(X - s, y0 + s, Z + s, X + s, y0 + s, Z + s, band).box(X - s, y0 + s, Z - s, X + s, y0 + s, Z - s, band);
  return y1 + 1;
}
export function sackK(w: W, x: number, z: number, c = 0xa08a62, tie = 0x6a5a3a) {
  const X = M(x), Z = M(z);
  w.box(X - 3, 0, Z - 2, X + 3, 4, Z + 2, c).box(X - 2, 5, Z - 2, X + 2, 6, Z + 1, c).box(X - 1, 7, Z - 1, X + 1, 7, Z, tie).box(X - 1, 8, Z - 1, X, 9, Z, c);
}
/** firewood stack against a wall: log ends in a grid (bark corners, cut-wood plus), two posts holding it */
export function woodStack(w: W, x: number, z: number, r: number, cols: number, rows: number) {
  const b = loc(w, M(x), M(z), r), a = Math.floor(cols * 3 / 2);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const lx = -a + i * 3 + (j & 1), y = j * 3;
    b(lx, y, -5, lx + 2, y + 2, 2, LOG); b(lx + 1, y, 3, lx + 1, y + 2, 3, LOG_END); b(lx, y + 1, 3, lx + 2, y + 1, 3, LOG_END);
  }
  b(-a - 2, 0, -1, -a - 1, rows * 3 + 1, 0, WD_D); b(a + 2, 0, -1, a + 3, rows * 3 + 1, 0, WD_D);
}
export function hangLantern(w: W, X: number, yTop: number, Z: number, len: number, glowC = LANT, lit = true): P3 {
  const y1 = yTop - len;
  w.box(X, y1 + 1, Z, X, yTop, Z, IRN);
  w.box(X - 1, y1, Z - 1, X + 1, y1, Z + 1, IRN).box(X - 2, y1 - 1, Z - 2, X + 2, y1 - 1, Z + 2, IRN);
  w.box(X - 2, y1 - 5, Z - 2, X + 2, y1 - 2, Z + 2, lit ? glowC : 0x24222a, lit ? 1 : 0); if (!lit) w.box(X - 1, y1 - 4, Z + 2, X + 1, y1 - 3, Z + 2, null);
  for (const [i, j] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) w.box(X + i, y1 - 5, Z + j, X + i, y1 - 2, Z + j, IRN);
  w.box(X - 2, y1 - 6, Z - 2, X + 2, y1 - 6, Z + 2, IRN).set(X, y1 - 7, Z, IRN);
  return [(X + 0.5) * CELL, (y1 - 3.5) * CELL, (Z + 0.5) * CELL];
}
/** iron ring chandelier on a chain: a square ring with cross arms, eight candles */
export function chandelier(w: W, X: number, yTop: number, Z: number, len: number, hs = 6, lit = true): P3 {
  const y = yTop - len;
  w.box(X, y + 1, Z, X, yTop, Z, IRN);
  w.box(X - hs, y, Z - hs, X + hs, y, Z - hs, IRN).box(X - hs, y, Z + hs, X + hs, y, Z + hs, IRN).box(X - hs, y, Z - hs, X - hs, y, Z + hs, IRN).box(X + hs, y, Z - hs, X + hs, y, Z + hs, IRN);
  w.box(X - hs, y + 1, Z, X + hs, y + 1, Z, IRN).box(X, y + 1, Z - hs, X, y + 1, Z + hs, IRN).box(X - 1, y - 1, Z - 1, X + 1, y + 1, Z + 1, IRN_L);
  for (const [i, j] of [[-hs, -hs], [hs, -hs], [-hs, hs], [hs, hs], [0, -hs], [0, hs], [-hs, 0], [hs, 0]]) { w.box(X + i, y + 1, Z + j, X + i, y + 2 - (lit ? 0 : (i + j) & 1), Z + j, WAX); if (lit) w.set(X + i, y + 3, Z + j, FLM, 1); }
  return [(X + 0.5) * CELL, (y + 2) * CELL, (Z + 0.5) * CELL];
}
/** herb bundles hanging from a pole (world cells along x at height y): strings and bundles in colour groups of three */
export function herbs(w: W, X0: number, X1: number, y: number, Z: number, seed: number, cols = [0x5a7a3a, 0x8a7a3a, 0x6a4a6a, 0x7a4a2a], step = 4) {
  let i = 0;
  for (let x = X0 + 1; x + 1 <= X1 - 1; x += step, i++) {
    const c = cols[Math.floor(i / 3 + seed) % cols.length], L = 4 + Math.floor(hash(i, seed) * 3), s = 1 + (i % 3 === 1 ? 1 : 0);
    w.box(x, y - 2, Z, x, y - 1, Z, 0x8a7a5a).box(x - 1, y - 2 - L, Z - 1, x + 1, y - 3, Z + s - 1, c).box(x - 1, y - 3, Z - 1, x + 1, y - 3, Z + s - 1, shade(c, 0.75));
  }
}

// ------------------------------------------------------------------ landmarks
/** the cottage fireplace on a back wall: stone breast with a stepped lintel and keystone, raised hearth, logs and a stepped flame,
 *  mantel shelf on corbels, chimney narrowing in two stages above, a little painting on the breast */
export function fireplace(R: Run, ac: number, top: number, o: { low?: boolean; bare?: boolean } = {}): { fire: P3; mantelY: number } {
  const P = 12, br = (a: number, y: number) => brick(a, y, ST, MORT, 7, 4), brD = (a: number, y: number) => brick(a, y, ST_D, ST_DD, 7, 4);
  for (let a = ac - 22; a <= ac + 22; a++) for (let y = -2; y <= 21; y++) R.box(a, -P, y, a, -1, y, br(a, y));
  R.box(ac - 20, -P - 6, 0, ac + 20, -P - 1, 1, ST_L); R.box(ac - 20, -P - 6, 0, ac + 20, -P - 6, 1, ST); R.box(ac - 20, -P - 6, 1, ac + 20, -P - 6, 1, ST_L);
  // firebox with a stepped head, soot inside
  R.box(ac - 13, -P, 2, ac + 13, -4, 13, null); R.box(ac - 10, -P, 14, ac + 10, -4, 16, null);
  R.box(ac - 13, -P, 0, ac + 13, -4, 1, SOOT); R.box(ac - 14, -3, 0, ac + 14, -3, 17, SOOT);
  R.box(ac - 14, -P + 1, 2, ac - 14, -4, 13, 0x2a2224); R.box(ac + 14, -P + 1, 2, ac + 14, -4, 13, 0x2a2224); R.box(ac - 13, -P + 1, 17, ac + 13, -4, 17, 0x2a2224);
  for (let a = ac - 15; a <= ac + 15; a++) for (let y = 14; y <= 18; y++) if (!(Math.abs(a - ac) <= 10 && y <= 16)) R.put(a, -P, y, brD(a, y));
  R.box(ac - 2, -P - 1, 17, ac + 2, -P - 1, 20, ST_L);
  // logs, embers, the flame in three stepped tiers
  R.box(ac - 9, -10, 2, ac + 9, -9, 3, LOG); R.box(ac - 9, -10, 2, ac - 9, -9, 3, LOG_END); R.box(ac + 9, -10, 2, ac + 9, -9, 3, LOG_END);
  R.box(ac - 8, -6, 2, ac + 8, -5, 3, LOG); R.box(ac - 8, -6, 2, ac - 8, -5, 3, LOG_END); R.box(ac + 8, -6, 2, ac + 8, -5, 3, LOG_END);
  R.box(ac - 8, -8, 2, ac + 8, -7, 3, EMBER, 1);
  if (o.low) { R.box(ac - 4, -9, 4, ac + 4, -7, 5, FLM2, 1); R.box(ac - 2, -9, 6, ac + 1, -8, 7, FLM, 1); R.box(ac - 6, -10, 2, ac - 2, -9, 3, 0x2a2420); }
  else { R.box(ac - 7, -9, 4, ac + 7, -6, 6, FLM2, 1); R.box(ac - 5, -9, 7, ac + 5, -6, 9, FLM, 1); R.box(ac - 2, -8, 10, ac + 2, -7, 12, FLM3, 1); }
  // mantel on corbels
  R.box(ac - 26, -P - 2, 22, ac + 26, -1, 23, TIM); R.box(ac - 26, -P - 2, 22, ac + 26, -P - 2, 22, TIM_D);
  for (const s of [-1, 1]) R.box(ac + s * 21, -P - 1, 17, ac + s * 24, -P - 1, 21, TIM_D);
  // chimney: two stages and a set-off ledge, a cap above the wall
  for (let a = ac - 17; a <= ac + 17; a++) for (let y = 24; y <= 44; y++) R.box(a, -8, y, a, -1, y, br(a, y));
  R.box(ac - 18, -9, 45, ac + 18, -1, 46, ST_L);
  for (let a = ac - 12; a <= ac + 12; a++) for (let y = 47; y <= top + 9; y++) R.box(a, -6, y, a, -1, y, br(a, y));
  R.box(ac - 14, -8, top + 10, ac + 14, 1, top + 11, ST_L); R.box(ac - 10, -5, top + 12, ac + 10, 0, top + 12, ST_D);
  // a small painting on the breast: a night landscape in three bands, a pale moon
  if (o.bare) { for (let a = ac - 8; a <= ac + 8; a++) for (let y = 28; y <= 39; y++) R.put(a, -8, y, brick(a, y, 0x6c6a76, 0x4e4c58, 7, 4)); R.put(ac, -9, 38, IRN); }   // where the painting hung: cleaner stone, a nail
  else { R.box(ac - 8, -9, 28, ac + 8, -9, 39, TIM_D); R.box(ac - 7, -9, 29, ac + 7, -9, 38, 0x2a3a5c); R.box(ac - 7, -9, 29, ac + 7, -9, 31, 0x2e4a2e); R.box(ac - 7, -9, 32, ac - 1, -9, 33, 0x3a5a36); R.box(ac + 3, -9, 35, ac + 4, -9, 36, 0xe8e0c0); }
  return { fire: R.m(ac, -8, 7), mantelY: 24 };
}
/** a banner hanging on a wall face: rod with finials, cloth with side trim, an emblem, a stepped swallow-tail */
export function banner(R: Run, ac: number, yTop: number, hw: number, H: number, cloth: number, trim: number, emblem: number) {
  R.box(ac - hw - 2, -2, yTop, ac + hw + 2, -2, yTop, IRN_L); R.box(ac - hw - 3, -2, yTop, ac - hw - 3, -2, yTop, BRASS); R.box(ac + hw + 3, -2, yTop, ac + hw + 3, -2, yTop, BRASS);
  for (let y = yTop - H; y < yTop; y++) for (let a = ac - hw; a <= ac + hw; a++) {
    const u = Math.abs(a - ac), v = y - (yTop - H);
    if ((v < 3 && u <= hw - 2) || (v < 6 && u <= (hw - 2) >> 1)) continue;   // swallow-tail cut in two wide steps
    R.put(a, -2, y, u === hw || y === yTop - 2 ? trim : cloth);
  }
  const ey = yTop - Math.round(H * 0.45);
  R.box(ac - 3, -3, ey - 3, ac + 3, -3, ey + 3, emblem); R.box(ac - 2, -3, ey - 2, ac + 2, -3, ey + 2, cloth); R.box(ac - 1, -3, ey - 1, ac + 1, -3, ey + 1, emblem);
}
/** square column: two-tier base, a shaft with its corners cut back (reads round without stairs), two-tier capital; broken = no capital and a
 *  stepped break */
export function column(w: W, x: number, z: number, H: number, c: number, cap: number, broken = false) {
  const X = M(x), Z = M(z);
  w.box(X - 6, -2, Z - 6, X + 6, 1, Z + 6, cap).box(X - 5, 2, Z - 5, X + 5, 3, Z + 5, c);
  const sh = broken ? H : H - 4;
  w.box(X - 4, 4, Z - 4, X + 4, sh, Z + 4, c);
  for (const [i, j] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) w.box(X + i, 4, Z + j, X + i, sh, Z + j, null);
  for (const y of [8, sh - 3]) if (y < sh) w.box(X - 4, y, Z - 4, X + 4, y, Z + 4, cap);
  for (const [i, j] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) for (const y of [8, sh - 3]) w.set(X + i, y, Z + j, null);
  if (!broken) w.box(X - 5, H - 3, Z - 5, X + 5, H - 2, Z + 5, cap).box(X - 6, H - 1, Z - 6, X + 6, H, Z + 6, c);
  else w.box(X - 4, sh + 1, Z - 4, X, sh + 4, Z + 1, c).box(X - 4, sh + 5, Z - 4, X - 2, sh + 6, Z - 1, c);
}
/** pew facing local +z: plank seat, a back with a top rail and a hymnal ledge behind, end panels with a two-step top */
export function pew(w: W, x: number, z: number, r: number, a = 11, c = WD, c2 = WD_D) {
  const b = loc(w, M(x), M(z), r);
  b(-a, 6, -2, a, 6, 2, WD_L); b(-a, 5, 2, a, 5, 2, c2); b(-a, 7, -3, a, 13, -3, c); b(-a, 14, -3, a, 14, -3, WD_L); b(-a, 9, -4, a, 9, -5, c2);
  for (const s of [-1, 1]) { const ex = s * (a + 1); b(ex, 0, -3, ex, 10, 2, c2); b(ex, 11, -3, ex, 15, -1, c2); b(ex, 16, -3, ex, 16, -2, WD_L); }
  b(-a, 1, 0, a, 1, 0, c2);
}
/** stepped arch wall along z between two column centres (cells), springing at y0: two inner steps then a closed beam and a coping */
export function arcade(w: W, X: number, Za: number, Zb: number, y0: number, c: number, lip: number, t = 4) {
  const z0 = Math.min(Za, Zb) + 6, z1 = Math.max(Za, Zb) - 6;
  w.box(X - t, y0, z0 - 6, X + t, y0 + 12, z1 + 6, c);
  w.box(X - t, y0, z0 + 5, X + t, y0 + 3, z1 - 5, null).box(X - t, y0 + 4, z0 + 11, X + t, y0 + 7, z1 - 11, null);
  w.box(X - t, y0 + 3, z0 + 5, X + t, y0 + 3, z0 + 10, lip).box(X - t, y0 + 3, z1 - 10, X + t, y0 + 3, z1 - 5, lip).box(X - t, y0 + 7, z0 + 11, X + t, y0 + 7, z1 - 11, lip);
  w.box(X - t - 1, y0 + 13, z0 - 7, X + t + 1, y0 + 14, z1 + 7, lip);
}
/** the stained-glass scheme: lead every 4 blocks, panes coloured by column band and row band, symmetric about the centre */
export function stained(hw: number, ht: number, rows: (pu: number, pv: number, npv: number) => number) {
  return (u: number, v: number): [number, number] | null => {
    if (u % 4 === 0 || v % 4 === 0 || Math.abs(u) === hw) return [0x1a1822, 0];
    return [rows(Math.floor((Math.abs(u) - 1) / 4), Math.floor(v / 4), Math.floor(ht / 4)), 1];
  };
}
/** big cauldron: legs, a belly in three tiers with cut corners, a lipped rim with handles, a glowing brew with bubbles */
export function cauldron(w: W, x: number, z: number, brew: number): P3 {
  const X = M(x), Z = M(z), K = 0x24222a, KL = 0x3a3844;
  const tier = (y0: number, y1: number, h: number, n: number, c: number) => { w.box(X - h, y0, Z - h, X + h, y1, Z + h, c); for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) w.box(X + i * h, y0, Z + j * h, X + i * (h - n + 1), y1, Z + j * (h - n + 1), null); };
  for (const [i, j] of [[-7, -7], [6, -7], [-7, 6], [6, 6]]) w.box(X + i, 0, Z + j, X + i + 1, 4, Z + j + 1, K);
  // the pot swells and narrows in six tiers (corners cut back more where it is widest), then a flared lip
  tier(3, 5, 8, 2, K); tier(6, 8, 11, 3, K); tier(9, 14, 13, 4, K); tier(15, 17, 11, 3, K); tier(18, 19, 10, 2, K); tier(20, 21, 12, 3, KL);
  w.box(X - 13, 11, Z - 13, X + 13, 11, Z + 13, KL); for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) w.box(X + i * 13, 11, Z + j * 13, X + i * 10, 11, Z + j * 10, null);
  w.box(X - 9, 18, Z - 9, X + 9, 21, Z + 9, null); w.box(X - 9, 18, Z - 9, X + 9, 18, Z + 9, brew, 1);
  for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) w.box(X + i * 9, 18, Z + j * 9, X + i * 8, 21, Z + j * 8, K);
  w.box(X - 3, 19, Z - 2, X - 1, 20, Z, brew, 1).box(X + 4, 19, Z + 3, X + 5, 19, Z + 4, brew, 1).box(X + 1, 21, Z - 5, X + 2, 22, Z - 4, brew, 1);
  for (const s of [-1, 1]) w.box(X + s * 14, 16, Z - 3, X + s * 15, 16, Z + 3, KL).box(X + s * 15, 13, Z - 3, X + s * 15, 15, Z - 3, KL).box(X + s * 15, 13, Z + 3, X + s * 15, 15, Z + 3, KL).box(X + s * 14, 13, Z - 3, X + s * 15, 13, Z + 3, KL);
  // the fire under it: a ring of stones, logs, embers
  for (let i = -15; i <= 15; i += 5) for (const [a, b] of [[i, -15], [i, 15], [-15, i], [15, i]]) w.box(X + a - 2, 0, Z + b - 2, X + a + 2, 2, Z + b + 2, (i + 15) % 10 ? ST : ST_L);
  w.box(X - 8, 0, Z - 2, X + 8, 1, Z - 1, LOG).box(X - 2, 0, Z - 8, X - 1, 1, Z + 8, LOG).box(X - 6, 0, Z + 2, X + 6, 0, Z + 4, EMBER, 1).box(X + 2, 0, Z - 6, X + 4, 1, Z + 6, EMBER, 1);
  w.box(X - 3, 2, Z - 3, X + 3, 3, Z + 3, FLM2, 1);
  return [(X + 0.5) * CELL, 1.4, (Z + 0.5) * CELL];
}
/** hanging cage: chain, two-step cap, bars every other block on a square ring, a band, a floor plate */
export function cage(w: W, X: number, yTop: number, Z: number, len: number, o: { bones?: boolean; open?: boolean } = {}) {
  const yt = yTop - len, h = 14, s = 5, yb = yt - h;
  w.box(X, yt + 1, Z, X, yTop, Z, IRN);
  w.box(X - 2, yt, Z - 2, X + 2, yt, Z + 2, IRN).box(X - s, yt - 1, Z - s, X + s, yt - 1, Z + s, IRN);
  for (let i = -s; i <= s; i += 2) for (const [a, b] of [[i, -s], [i, s], [-s, i], [s, i]]) w.box(X + a, yb, Z + b, X + a, yt - 2, Z + b, IRN);
  for (const y of [yb, yb + 6]) w.box(X - s, y, Z - s, X + s, y, Z - s, IRN_L).box(X - s, y, Z + s, X + s, y, Z + s, IRN_L).box(X - s, y, Z - s, X - s, y, Z + s, IRN_L).box(X + s, y, Z - s, X + s, y, Z + s, IRN_L);
  w.box(X - s, yb - 1, Z - s, X + s, yb - 1, Z + s, IRN);
  if (o.open) { w.box(X - 3, yb + 1, Z + s, X + 3, yt - 2, Z + s, null); for (let i = 0; i <= 6; i += 2) w.box(X + 3 + i, yb + 1, Z + s + 1, X + 3 + i, yt - 3, Z + s + 1, IRN); w.box(X + 3, yb + 6, Z + s + 1, X + 9, yb + 6, Z + s + 1, IRN_L); }
  if (o.bones) { skullAt(w, X - 1, yb, Z + 1, 'z'); w.box(X - 3, yb, Z - 3, X + 3, yb, Z - 3, BONE_C).box(X + 2, yb, Z - 2, X + 2, yb, Z + 3, BONE_C).box(X - 2, yb + 4, Z - 1, X + 2, yb + 4, Z - 1, BONE_C); }
}
/** one of her daughters: a spider with a marked abdomen, glowing eyes, eight legs bent at right angles */
export function spider(w: W, X: number, y: number, Z: number, r = 0, body = 0x3a2c42, mark = 0x8aa83e, eye = 0xff4a5a) {
  const b = loc(w, X, Z, r);
  b(-3, y, -9, 3, y + 4, -3, body); b(-2, y + 5, -8, 2, y + 5, -4, body); b(-1, y + 5, -8, 1, y + 5, -4, mark); b(0, y + 5, -7, 0, y + 5, -5, shade(mark, 0.6));
  b(-2, y, -2, 2, y + 3, 2, shade(body, 1.25)); b(-1, y + 2, 3, -1, y + 2, 3, eye, 1); b(1, y + 2, 3, 1, y + 2, 3, eye, 1); b(-1, y, 3, 1, y, 3, body);
  for (const s of [-1, 1]) for (const [lz, reach] of [[1, 6], [-1, 7], [-3, 7], [-5, 6]]) {
    b(s * 3, y + 2, lz, s * (reach - 2), y + 3, lz, body); b(s * (reach - 1), y + 3, lz, s * reach, y + 4, lz, body); b(s * reach, y - 2, lz, s * reach, y + 2, lz, body);
  }
}
/** a twisted root breaking out of a wall: a thick run out of the wall, down to the floor, a branch along the wall, rootlets; all bends
 *  at right angles, thickness stepping down two sizes */
export function root(w: W, R: Run, a: number, y: number, len: number, dir: 1 | -1, c = 0x3a2a26, c2 = 0x2a1e1c) {
  R.box(a - 3, -len, y - 3, a + 3, -1, y + 3, c); R.box(a - 3, -len, y + 3, a + 3, -1, y + 3, c2);
  R.box(a - 3, -len - 6, -2, a + 3, -len, y + 3, c); R.box(a - 4, -len - 7, -2, a + 4, -len + 1, 2, c2);
  R.box(a + dir * 3, -len + 1, y - 10, a + dir * 16, -len + 4, y - 7, c); R.box(a + dir * 13, -len + 1, -2, a + dir * 16, -len + 4, y - 7, c);
  R.box(a - 1, -len - 2, y + 4, a + 1, -len, y + 12, c2); R.box(a - 1, -len - 9, y - 1, a + 1, -len - 7, y + 1, c2); R.box(a - 1, -len - 12, -2, a + 1, -len - 10, y - 1, c2);
  R.box(a + dir * 4, -6, y + 2, a + dir * 10, -5, y + 3, c2);
}
/** egg sac in three steps, a glowing seam */
export function sac(w: W, x: number, z: number, s: number, c = 0x7a7480, glowC = 0x6ad83a, y0 = 0) {
  const X = M(x), Z = M(z);
  w.box(X - s + 1, y0, Z - s + 1, X + s - 1, y0 + 1, Z + s - 1, shade(c, 0.8)).box(X - s, y0 + 2, Z - s, X + s, y0 + 2 * s, Z + s, c).box(X - s + 2, y0 + 2 * s + 1, Z - s + 2, X + s - 2, y0 + 2 * s + 2, Z + s - 2, shade(c, 1.15)).box(X - 1, y0 + 2 * s + 3, Z - 1, X, y0 + 2 * s + 6, Z, shade(c, 1.15));
  for (const y of [y0 + s - 1, y0 + 2 * s - 2]) w.box(X - s, y, Z - s, X + s, y, Z + s, shade(c, 0.74));
  w.box(X, y0 + s, Z + s, X, y0 + s + 1, Z + s, glowC, 1);
}

// ------------------------------------------------------------------ the village square
/** the well: platform in two steps, a curb ring with cut corners in courses, coping, dark water, posts, a winch with a crank and a rope
 *  coil, the bucket still hanging, a small stepped gable roof, a lantern under it; returns the lantern position */
export function well(w: W, x: number, z: number): P3 {
  const X = M(x), Z = M(z), cut = (y0: number, y1: number, h: number, c: number | null) => { for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) w.box(X + i * h, y0, Z + j * h, X + i * (h - 1), y1, Z + j * (h - 1), c); };
  w.box(X - 18, 0, Z - 18, X + 18, 1, Z + 18, ST); w.box(X - 18, 1, Z - 18, X + 18, 1, Z + 18, ST_L); cut(0, 1, 18, null);
  w.box(X - 15, 2, Z - 15, X + 15, 2, Z + 15, ST_D); cut(2, 2, 15, null);
  for (let y = 3; y <= 12; y++) for (let a = -12; a <= 12; a++) for (let b = -12; b <= 12; b++) w.set(X + a, y, Z + b, Math.abs(a) <= 11 && Math.abs(b) <= 11 ? ST_DD : brick(Math.abs(a) === 12 ? b : a, y, ST, MORT, 6, 3));
  w.box(X - 8, 3, Z - 8, X + 8, 13, Z + 8, null); cut(3, 12, 12, null); for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) w.box(X + i * 10, 3, Z + j * 10, X + i * 10, 12, Z + j * 10, ST);
  w.box(X - 13, 13, Z - 13, X + 13, 14, Z + 13, ST_L); w.box(X - 9, 13, Z - 9, X + 9, 14, Z + 9, null); cut(13, 14, 13, null);
  w.box(X - 8, -1, Z - 8, X + 8, 2, Z + 8, null); w.box(X - 8, -1, Z - 8, X + 8, -1, Z + 8, 0x0e1a30, 1);
  // posts with stone feet, a tie beam, the roof
  for (const s of [-1, 1]) w.box(X + s * 11 - 1, 15, Z - 1, X + s * 11 + 1, 40, Z + 1, TIM).box(X + s * 11 - 2, 15, Z - 2, X + s * 11 + 2, 16, Z + 2, ST_D);
  w.box(X - 13, 38, Z - 1, X + 13, 39, Z + 1, TIM_D);
  const roof: Array<[number, number, number]> = [[41, 16, 17], [43, 12, 16], [45, 8, 15], [47, 4, 14]];
  for (const [y, hz, hx] of roof) { w.box(X - hx, y, Z - hz, X + hx, y + 1, Z + hz, SLATE); w.box(X - hx, y, Z - hz, X + hx, y, Z - hz, SLATE_D).box(X - hx, y, Z + hz, X + hx, y, Z + hz, SLATE_D); w.box(X - hx, y + 1, Z - hz, X - hx, y + 1, Z + hz, TIM_D).box(X + hx, y + 1, Z - hz, X + hx, y + 1, Z + hz, TIM_D); }
  w.box(X - 15, 49, Z - 1, X + 15, 50, Z + 1, TIM_D); w.box(X - 9, 40, Z, X + 9, 40, Z, TIM);
  // winch: axle, rope coil, crank
  w.box(X - 13, 29, Z, X + 13, 30, Z + 1, TIM_D); w.box(X - 5, 28, Z - 1, X + 5, 31, Z + 2, 0xa8925e); for (let i = -5; i <= 5; i += 2) w.box(X + i, 28, Z - 1, X + i, 31, Z - 1, 0x8a7448);
  w.box(X + 14, 24, Z, X + 14, 30, Z, IRN).box(X + 14, 24, Z, X + 18, 24, Z, IRN).box(X + 18, 24, Z, X + 18, 26, Z, WD_L);
  // rope and bucket (iron bands, a bail handle), hanging in the mouth of the well
  w.box(X, 19, Z, X, 27, Z, 0xa8925e);
  w.box(X - 3, 11, Z - 3, X + 3, 16, Z + 3, WD).box(X - 3, 12, Z - 3, X + 3, 12, Z + 3, IRN).box(X - 3, 15, Z - 3, X + 3, 15, Z + 3, IRN).box(X - 2, 16, Z - 2, X + 2, 16, Z + 2, 0x24344a, 1);
  w.box(X - 3, 17, Z, X - 3, 18, Z, IRN).box(X + 3, 17, Z, X + 3, 18, Z, IRN).box(X - 3, 18, Z, X + 3, 18, Z, IRN);
  w.box(X - 17, 34, Z, X - 12, 34, Z, IRN);
  return hangLantern(w, X - 16, 33, Z, 1);
}
export type WinState = 'lit' | 'dark' | 'boarded';
/** dark glass: dull panes behind the bars, one quadrant smashed (black) */
export const darkPanes = (_hw: number, ht: number, bar = TIM_D, broken = 1) => (u: number, v: number): [number, number] | null => {
  if (u === 0 || v === ht >> 1) return [bar, 0];
  const q = (u < 0 ? 0 : 1) + (v < ht >> 1 ? 0 : 2);
  return [q === broken ? 0x08070a : 0x1a1c26, 0];
};
/** boarded up from inside: horizontal planks three blocks tall with a dark gap between, two battens, one plank missing */
export const boardedUp = (hw: number, _ht: number, seed = 1) => (u: number, v: number): [number, number] | null => {
  const row = Math.floor(v / 4);
  if (v % 4 === 3 || (row === 1 + (seed % 2) && u > 0)) return [0x0c0a0e, 0];
  if (Math.abs(u) === hw - 2) return [0x3a332c, 0];
  return [row & 1 ? 0x5a5046 : 0x4c443b, 0];
};
/** a house front facing +z with its body behind, left to rot: stone plinth, a timber frame over grey plaster (peeling where `peel`
 *  says), the door open, fallen or shut, windows dark / boarded / (rarely) lit, dead flower boxes, a shutter hanging or fallen,
 *  roof in wide steps with holes knocked through, chimney. Returns light positions (a lit door lamp, if any). Cells; zf = facade row. */
export interface HouseOpt {
  depth: number; H: number; gable?: boolean; door: number; doorState?: 'open' | 'fallen' | 'shut'; doorLamp?: boolean;
  wins: number[]; winState?: WinState[]; upWin?: WinState; chimney?: number; plaster?: number; tim?: number; roof?: [number, number, number];
  sign?: number; glowC?: number; peel?: Array<[number, number, number, number]>; roofHoles?: Array<[number, number, number, number]>;
}
export function house(w: W, X0: number, X1: number, zf: number, o: HouseOpt): P3[] {
  const D = o.depth, H = o.H, pl = o.plaster ?? 0x7c766c, tm = o.tim ?? 0x3a322c, [rf, rfD, rfL] = o.roof ?? [0x40424e, 0x2c2e38, 0x50525e], lights: P3[] = [];
  const peel = (a: number, y: number) => (o.peel ?? []).some(([a0, y0, a1, y1]) => a >= a0 && a <= a1 && y >= y0 && y <= y1);
  w.box(X0, -2, zf - D, X1, H, zf, pl);
  const F = new Run(w, 'x', zf, -1), posts: number[] = [];
  for (let a = X0; a <= X1 - 2; a += 26) posts.push(a); posts.push(X1 - 2);
  buildWall(F, X0, X1, () => H, { t: 4, plinth: 6, cPlinth: ST_D, cCap: ST, body: (a, y) => (peel(a, y) ? brick(a, y, 0x5a4e48, 0x3a322e, 6, 3) : y < 18 ? shade(pl, 0.86) : pl), posts, cPost: tm, rails: [[7, 2, tm], [26, 2, tm]] });
  for (const x of [X0, X1]) w.box(x, -2, zf - D, x, 6, zf, ST_D);
  // door: casing, lintel, steps; the leaf shut, swung open into the dark, or fallen flat on the steps
  const dc = o.door, ds = o.doorState ?? 'shut'; opening(F, dc, 0, 6, 30, { t: 4, frame: tm, lintel: TIM_D });
  F.box(dc - 6, -1, 0, dc + 6, 3, 3, ST_L); F.box(dc - 9, -7, 0, dc + 9, -4, 1, ST); F.box(dc - 8, -3, 0, dc + 8, -2, 3, ST_L); F.box(dc - 9, -7, 1, dc + 9, -7, 1, ST_L);
  const leaf = (fn: (i: number, y: number, c: number) => void) => { for (let i = 0; i <= 12; i++) for (let y = 4; y <= 29; y++) fn(i, y, y === 8 || y === 9 || y === 23 || y === 24 ? 0x4a3226 : i % 3 === 0 ? 0x3a3028 : 0x4c4036); };
  if (ds === 'shut') leaf((i, y, c) => F.put(dc - 6 + i, 2, y, c));
  else {
    F.box(dc - 6, 2, 4, dc + 6, 6, 29, null); F.box(dc - 6, 7, 4, dc + 6, 7, 29, 0x0a080c);                        // the dark inside
    if (ds === 'open') leaf((i, y, c) => { if (i <= 5) F.put(dc + 6, 2 + i, y, c); });
    else leaf((i, y, c) => { if ((y & 1) === 0) F.put(dc - 6 + i, -4 - ((y - 4) >> 1), 4, c); });                  // flat on the steps
  }
  if (o.doorLamp) { F.box(dc + 10, -1, 26, dc + 10, -4, 26, IRN); lights.push(hangLantern(w, dc + 10, 25, zf + 4, 1, 0xc07a38)); }
  else F.box(dc + 10, -1, 26, dc + 10, -3, 26, 0x5a3a26);                                                          // a rusted bracket, the lamp gone
  // windows
  o.wins.forEach((wc, i) => {
    const st = o.winState?.[i] ?? 'dark';
    opening(F, wc, 13, 7, 14, { t: 4, frame: tm, sill: ST_L, glassD: 2, glass: st === 'lit' ? panes(7, 14, o.glowC ?? 0xb87a3c, 1, TIM_D) : st === 'boarded' ? boardedUp(7, 14, i) : darkPanes(7, 14, TIM_D, i % 4) });
    F.box(wc - 8, -4, 8, wc + 8, -1, 10, 0x3a3029); F.box(wc - 7, -4, 10, wc + 7, -2, 10, 0x221a16);             // a dead flower box
    for (let a = wc - 6; a <= wc + 6; a += 3) F.box(a, -3, 11, a, -3, 12 + (a & 1), 0x6a5a3a);
    // shutters: one still hanging, the other dropped a hinge (lower and pulled out), or lying under the window
    F.box(wc - 15, -1, 13, wc - 9, -1, 26, 0x4a4036); for (let a = 9; a <= 15; a += 2) F.box(wc - a, -1, 13, wc - a, -1, 26, 0x3a322a);
    if (i % 2 === 0) { F.box(wc + 9, -2, 9, wc + 15, -2, 22, 0x4a4036); F.box(wc + 9, -2, 15, wc + 15, -2, 15, 0x3a322a); }
    else F.box(wc + 8, -9, 0, wc + 14, -3, 0, 0x4a4036);
  });
  // roof
  const hole = (x: number, z: number) => (o.roofHoles ?? []).some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
  if (!o.gable) {
    for (let k = 0; ; k++) {
      const y = H + 1 + k * 3, zfront = zf + 4 - k * 5; if (zfront < zf - (D >> 1)) break;
      for (let x = X0 - 3; x <= X1 + 3; x++) for (let z = zf - D + 2; z <= zfront; z++) {
        if (hole(x, z) && k > 0 && z <= zf - 2) { if ((x & 7) === 0) w.set(x, y, z, TIM_D); continue; }
        const end = x === X0 - 3 || x === X1 + 3, c = end ? TIM_D : z === zfront ? rfD : rf;
        w.box(x, y, z, x, y + 2, z, c); if (z >= zfront - 1 && !end && z !== zfront) w.set(x, y + 2, z, rfL);
      }
    }
    for (const [x0, z0, x1, z1] of o.roofHoles ?? []) w.box(x0, H, Math.max(z0, zf - D), x1, H, Math.min(z1, zf - 1), 0x141016);
  } else {
    const cx = (X0 + X1) >> 1, hw0 = ((X1 - X0) >> 1) + 3;
    for (let k = 0; ; k++) {
      const y = H + 1 + k * 4, hw = hw0 - k * 7; if (hw < 3) { w.box(cx - 3, y, zf - D, cx + 3, y + 1, zf + 3, TIM_D); break; }
      for (let x = cx - hw; x <= cx + hw; x++) for (let z = zf - D - 2; z <= zf + 3; z++) { if (hole(x, z) && z < zf - 3) continue; w.box(x, y, z, x, y + 3, z, z === zf + 3 ? TIM_D : (x === cx - hw || x === cx + hw) ? rfL : rf); }
      if (hw > 6) { w.box(cx - hw + 3, y, zf - 1, cx + hw - 3, y + 3, zf + 2, pl); w.box(cx - hw + 3, y, zf + 2, cx + hw - 3, y, zf + 2, tm); }
    }
    if (o.upWin) { const y = H + 4, lit = o.upWin === 'lit'; F.box(cx - 4, -3, y, cx + 4, -2, y + 9, null); F.box(cx - 5, -3, y - 1, cx + 5, -3, y + 10, tm); F.box(cx - 4, -3, y, cx + 4, -3, y + 9, lit ? (o.glowC ?? 0xb87a3c) : 0x16141c, lit ? 1 : 0); F.box(cx, -3, y, cx, -3, y + 9, TIM_D); F.box(cx - 4, -3, y + 5, cx + 4, -3, y + 5, TIM_D); F.box(cx - 6, -4, y - 2, cx + 6, -2, y - 2, ST_L); }
  }
  if (o.chimney != null) { const cx = o.chimney, z0 = zf - (D >> 1) - 4; w.box(cx - 4, H, z0 - 4, cx + 4, H + 30, z0 + 4, ST_D); for (let y = H; y <= H + 30; y += 4) w.box(cx - 4, y, z0 + 4, cx + 4, y, z0 + 4, ST_DD); w.box(cx - 5, H + 31, z0 - 5, cx + 5, H + 32, z0 + 5, ST); w.box(cx - 5, H + 31, z0 - 5, cx - 1, H + 32, z0 - 1, null); }
  if (o.sign != null) { const sa = o.sign; F.box(sa, -1, 32, sa, -9, 32, 0x5a3a26); F.box(sa + 1, -9, 22, sa + 4, -9, 31, 0x4c4036); F.box(sa + 1, -10, 24, sa + 3, -10, 27, 0x6a6050); F.box(sa - 1, -9, 30, sa - 1, -9, 31, 0x5a3a26); }   // the sign hangs by one chain
  return lights;
}
/** market stall left to rot, facing local +z: counter, four posts, the awning faded and torn (stripes missing, the front course sagged a
 *  step), the valance in shreds, crates of spoiled produce, one crate knocked off */
export function stall(w: W, x: number, z: number, r: number, a = 15): P3 {
  const X = M(x), Z = M(z), b = loc(w, X, Z, r), RED = 0x56383a, CRM = 0x7e786a;
  b(-a, 0, -3, a, 11, 4, 0x3e3029); b(-a - 1, 12, -4, a + 1, 12, 6, 0x5a4a3a); for (let i = -a + 2; i <= a - 2; i += 6) b(i, 2, 5, i + 3, 10, 5, 0x4a3c30);
  b(-a + 8, 12, -4, -a + 13, 12, 6, null);                                                                            // a board gone from the top
  for (const [i, j, h] of [[-a - 1, -8, 36], [a, -8, 36], [-a - 1, 6, 30], [a, 6, 27]]) b(i, 0, j, i + 1, h, j + 1, 0x3a322c);
  const tiers: Array<[number, number, number]> = [[37, -10, -3], [34, -3, 3], [28, 3, 9]];
  tiers.forEach(([y, z0, z1], t) => { for (let i = -a - 3; i <= a + 3; i++) { const g = Math.floor((i + a + 3) / 3), dy = t === 2 && i > 0 ? 2 : 0; if ((t === 1 && (g === 2 || g === 3)) || (t === 2 && g >= 8)) continue; b(i, y - dy, z0, i, y + 1 - dy, z1, g & 1 ? CRM : RED); } });
  for (let i = -a - 3; i <= a + 3; i++) { const g = Math.floor((i + a + 3) / 3); if (g % 3 === 1 || g >= 8) continue; b(i, 24 - (g & 1) * 2, 9, i, 27, 9, g & 1 ? CRM : RED); }
  const goods: Array<[number, number]> = [[-10, 0x4a3a2c], [-3, 0x3e4630], [4, 0x5a4428]];
  for (const [gx, gc] of goods) { b(gx - 3, 13, -2, gx + 3, 16, 3, 0x5a4a3a); b(gx - 3, 16, -2, gx + 3, 16, 3, 0x3e3029); b(gx - 2, 17, -1, gx + 2, 17, 2, gc); b(gx - 1, 18, 0, gx, 18, 1, shade(gc, 0.8)); }
  b(8, 0, 8, 14, 6, 13, 0x5a4a3a); b(9, 1, 13, 13, 5, 13, 0x2a2018); b(9, 0, 14, 12, 0, 16, 0x4a3a2c);              // the knocked-off crate, spilled
  return locM(X, Z, r, 0, 30, 4);
}
export function noticeBoard(w: W, x: number, z: number, r: number) {
  const b = loc(w, M(x), M(z), r);
  for (const s of [-1, 1]) b(s * 11 - 1, -2, -1, s * 11, 30, 0, 0x3a322c);
  b(-12, 31, -3, 2, 31, 2, 0x2c2e38); b(-10, 32, -2, 0, 32, 1, 0x40424e);
  b(-10, 14, 0, 10, 28, 0, 0x5a5044); b(-10, 19, 0, 10, 19, 0, 0x1a1418); b(-10, 14, 1, 10, 14, 1, 0x3a322c); b(-10, 28, 1, 10, 28, 1, 0x3a322c);
  const notes: Array<[number, number, number, number]> = [[-9, 20, 4, 5], [0, 22, 4, 3], [5, 21, 4, 6]];
  for (const [nx, ny, nw, nh] of notes) { b(nx, ny, 1, nx + nw - 1, ny + nh - 1, 1, 0xa8a090); b(nx, ny + nh - 2, 1, nx + nw - 2, ny + nh - 2, 1, 0x6a6458); b(nx + (nw >> 1), ny + nh - 1, 2, nx + (nw >> 1), ny + nh - 1, 2, 0x5a3a26); }
  b(-4, 25, 1, -2, 27, 1, 0xa8a090); b(-4, 24, 1, -4, 24, 1, 0xa8a090);                                                // half of a torn notice
}
/** hand cart, abandoned: one wheel off and lying flat beside it, the bed dropped a step on that side, the shafts on the ground */
export function cart(w: W, x: number, z: number, r: number, broken = true) {
  const b = loc(w, M(x), M(z), r), hw = 9, hl = 15, W1 = 0x4c4036, W2 = 0x3a322a;
  for (const side of [-1, 1]) {
    const drop = broken && side > 0 ? 4 : 0, x0 = side < 0 ? -hw : 1, x1 = side < 0 ? 0 : hw;
    b(x0, 8 - drop, -hl, x1, 9 - drop, hl, W1); for (let i = -hl; i <= hl; i += 6) b(x0, 8 - drop, i, x1, 8 - drop, i, W2);
    b(side * hw, 10 - drop, -hl, side * hw, 14 - drop, hl, 0x5a4e40); b(side * hw, 12 - drop, -hl, side * hw, 12 - drop, hl, W2); b(x0, 10 - drop, -hl, x1, 14 - drop, -hl, 0x5a4e40);
  }
  b(1, 6, -hl, 4, 10, -hl, null);                                                                                    // a board out of the tailgate
  const wheel = (fn: (i: number, j: number, c: number) => void) => { for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) { const e = Math.max(Math.abs(i), Math.abs(j)), m = Math.abs(i) + Math.abs(j); if (m > 11) continue; if (e >= 6 || m >= 10) fn(i, j, e >= 7 || m >= 11 ? 0x4a2e22 : W2); else if (i === 0 || j === 0) fn(i, j, W2); } };
  wheel((i, j, c) => b(-(hw + 2), 7 + j, i, -(hw + 2), 7 + j, i, c)); b(-hw - 2, 6, -1, -hw - 1, 8, 1, 0x5a3a26);
  if (broken) wheel((i, j, c) => b(hw + 11 + i, 0, j + 4, hw + 11 + i, 0, j + 4, c)); else wheel((i, j, c) => b(hw + 2, 7 + j, i, hw + 2, 7 + j, i, c));
  b(-hw - 1, 7, -1, 0, 7, 0, 0x4a2e22);
  for (const s of [-1, 1]) b(s * 6, 0, hl + 1, s * 6, 1, hl + 14, W2);
  b(-6, 0, hl + 12, 6, 0, hl + 12, W2);
}
/** a crow (static): black body, head with a grey beak and a pale eye, tail, legs; perched with its feet on y */
export function crow(w: W, X: number, y: number, Z: number, r = 0) {
  const b = loc(w, X, Z, r), K = 0x18161e, K2 = 0x26242e;
  b(0, y, 0, 0, y, 0, 0x3a3030); b(0, y, -2, 0, y, -2, 0x3a3030);
  b(-1, y + 1, -3, 1, y + 3, 1, K); b(-2, y + 2, -3, -2, y + 3, 0, K2); b(2, y + 2, -3, 2, y + 3, 0, K2);
  b(-1, y + 3, 1, 1, y + 5, 3, K); b(0, y + 4, 4, 0, y + 4, 5, 0x6a6258); b(-1, y + 5, 2, -1, y + 5, 2, 0xc8b878); b(1, y + 5, 2, 1, y + 5, 2, 0xc8b878);
  b(-1, y + 2, -6, 1, y + 2, -4, K);
}
/** gable roof for the cutaway layer: ridge along `axis`, tile courses as wide steps (dark step faces, a lit lip), trusses (tie beam, king
 *  post, queen posts, collar), purlins and stepped rafters under the tiles, holes knocked through (rafters left across some of them),
 *  gable walls at both ends. a = along the ridge, b = across it; all in cells. */
export interface RoofOpt {
  axis: 'x' | 'z'; a0: number; a1: number; b0: number; b1: number; E: number; run?: number; rise?: number; over?: number;
  tiles: [number, number, number]; moss?: number; wood: number; woodD: number; trusses?: number[]; rafterEvery?: number;
  holes?: Array<[number, number, number, number]>; gableT?: number; gable?: (b: number, y: number) => number;
}
export function roof(w: W, o: RoofOpt) {
  const run = o.run ?? 8, rise = o.rise ?? 4, over = o.over ?? 4, bc = (o.b0 + o.b1 + 1) / 2, half = (o.b1 - o.b0 + 1) / 2 + over;
  const set = (a: number, y: number, b: number, c: number | null) => { if (o.axis === 'x') w.set(a, y, b, c); else w.set(b, y, a, c); };
  const box = (a0: number, y0: number, b0: number, a1: number, y1: number, b1: number, c: number | null) => { if (o.axis === 'x') w.box(a0, y0, b0, a1, y1, b1, c); else w.box(b0, y0, a0, b1, y1, a1, c); };
  const inHole = (a: number, b: number) => (o.holes ?? []).some(([h0, k0, h1, k1]) => a >= h0 && a <= h1 && b >= k0 && b <= k1);
  const dist = (b: number) => half - Math.abs(b + 0.5 - bc), tier = (b: number) => Math.floor(dist(b) / run), top = (b: number) => o.E + (tier(b) + 1) * rise;
  const B0 = Math.round(bc - half), B1 = Math.round(bc + half) - 1, A0 = o.a0 - over, A1 = o.a1 + over, [tA, tEdge, tLip] = o.tiles, tB = shade(tA, 0.9);
  const under = (b: number) => (dist(b) - tier(b) * run < 1 ? top(b) - rise - 1 : top(b) - 2);
  for (let b = B0; b <= B1; b++) {
    if (dist(b) < 0) continue;
    const k = tier(b), T = top(b), edge = dist(b) - k * run < 1, inner = dist(b) - k * run >= run - 1;
    for (let a = A0; a <= A1; a++) {
      const hole = inHole(a, b), r = o.rafterEvery ?? 12, ra = ((a - A0) % r + r) % r;
      if (!hole) {
        const mossy = o.moss != null && hash(Math.floor((a + 512) / 22), k, 17) < 0.2;
        if (edge) { box(a, T - rise, b, a, T - 1, b, tEdge); set(a, T, b, tLip); } else box(a, T - 1, b, a, T, b, mossy ? o.moss! : k & 1 ? tB : tA);
      }
      if (ra < 2 && (!hole || Math.floor((a - A0) / r) % 2 === 0)) set(a, under(b), b, o.wood);                                       // rafters
      if (inner && k % 2 === 0 && (!hole || ((a >> 3) & 1))) box(a, under(b) - 3, b, a, under(b) - 1, b, o.woodD);                    // purlins
    }
  }
  const Tm = top(Math.floor(bc)); box(A0, Tm + 1, Math.floor(bc) - 1, A1, Tm + 2, Math.ceil(bc), tEdge);
  for (const p of o.trusses ?? []) {
    box(p - 1, o.E - 1, o.b0 + (o.gableT ?? 5) + 1, p + 1, o.E + 1, o.b1 - (o.gableT ?? 5) - 1, o.woodD);
    box(p - 1, o.E + 1, Math.floor(bc) - 1, p + 1, Tm - 3, Math.ceil(bc), o.woodD);
    const q = Math.round(half * 0.5), bq0 = Math.round(bc - q), bq1 = Math.round(bc + q) - 1, yq = Math.min(under(bq0), under(bq1)) - 1;
    box(p - 1, o.E + 1, bq0 - 1, p + 1, yq, bq0 + 1, o.woodD); box(p - 1, o.E + 1, bq1 - 1, p + 1, yq, bq1 + 1, o.woodD);
    box(p - 1, yq - 2, bq0, p + 1, yq, bq1, o.wood);
  }
  if (o.gableT && o.gable) for (const [g0, g1] of [[o.a0, o.a0 + o.gableT - 1], [o.a1 - o.gableT + 1, o.a1]]) for (let b = o.b0; b <= o.b1; b++) for (let y = o.E; y <= under(b); y++) box(g0, y, b, g1, y, b, o.gable(b, y));
}
/** a floor broken through: two overlapping rectangles of boards gone (cells), dark earth below, the broken board ends lighter */
export function floorHole(w: W, X0: number, Z0: number, X1: number, Z1: number) {
  const inH = (x: number, z: number) => (x >= X0 && x <= X1 && z >= Z0 + 3 && z <= Z1) || (x >= X0 + 4 && x <= X1 - 3 && z >= Z0 && z <= Z1 + 3);
  for (let x = X0 - 1; x <= X1 + 1; x++) for (let z = Z0 - 1; z <= Z1 + 4; z++) {
    if (inH(x, z)) { w.set(x, -1, z, null).set(x, -2, z, 0x1a1612); continue; }
    if (inH(x + 1, z) || inH(x - 1, z) || inH(x, z + 1) || inH(x, z - 1)) w.set(x, -1, z, 0x7a5a3e);
  }
}
/** roof slates fallen in a heap: three stepped slabs, a rafter piece across them */
export function slateHeap(w: W, x: number, z: number, s: number, c: [number, number, number] = [SLATE_D, SLATE, SLATE_L], along: 'x' | 'z' = 'x') {
  const X = M(x), Z = M(z);
  w.box(X - s, 0, Z - s + 1, X + s, 0, Z + s - 1, c[0]).box(X - s + 2, 1, Z - s + 2, X + s - 1, 1, Z + s - 2, c[1]).box(X - 1, 2, Z - 2, X + 2, 2, Z + 1, c[2]);
  if (along === 'x') w.box(X - s - 4, 2, Z, X + s + 3, 3, Z + 1, 0x3e2e24); else w.box(X, 2, Z - s - 4, X + 1, 3, Z + s + 3, 0x3e2e24);
}
export function lampPost(w: W, x: number, z: number, armDir: 'x' | '-x' | 'z' | '-z', lit = true): P3 {
  const X = M(x), Z = M(z), [dx, dz] = armDir === 'x' ? [1, 0] : armDir === '-x' ? [-1, 0] : armDir === 'z' ? [0, 1] : [0, -1];
  w.box(X - 3, -2, Z - 3, X + 3, 2, Z + 3, ST).box(X - 2, 3, Z - 2, X + 2, 4, Z + 2, ST_L).box(X - 1, 5, Z - 1, X, 38, Z, IRN).box(X - 2, 39, Z - 2, X + 1, 39, Z + 1, IRN_L).set(X, 40, Z, IRN_L);
  for (let k = 1; k <= 7; k++) w.set(X + dx * k - (dx < 0 ? 1 : 0), 36, Z + dz * k - (dz < 0 ? 1 : 0), IRN);
  w.set(X + dx * 2 - (dx < 0 ? 1 : 0), 35, Z + dz * 2 - (dz < 0 ? 1 : 0), IRN).set(X + dx * 2 - (dx < 0 ? 1 : 0), 34, Z + dz * 2 - (dz < 0 ? 1 : 0), IRN);
  return hangLantern(w, X + dx * 6, 35, Z + dz * 6, 2, 0xd08a40, lit);
}
/** low picket fence along x or z: posts every 9 with a capped top, two rails, pickets every other block */
export function picket(w: W, x0: number, z0: number, len: number, along: 'x' | 'z', h = 11, c = WD_D, c2 = WD) {
  const X = M(x0), Z = M(z0), n = M(len);
  for (let i = 0; i <= n; i++) {
    const x = along === 'x' ? X + i : X, z = along === 'z' ? Z + i : Z;
    if (i % 9 === 0) { w.box(x, -2, z, x, h + 1, z, c); continue; }
    w.set(x, 3, z, c).set(x, h - 2, z, c); if (i % 2 === 0) w.box(x, 0, z, x, h - (i % 4 === 0 ? 0 : 1), z, c2);
  }
}
export function hay(w: W, x: number, z: number, r = 0, s = 1) {
  const b = loc(w, M(x), M(z), r), a = 7 * s, d = 4 * s, h = 7 * s;
  b(-a, 0, -d, a, h, d, 0xc8a84a); b(-a, h, -d, a, h, d, 0xd8bc62); for (const i of [-a + 3, a - 3]) b(i, 0, -d - 1, i, h + 1, d + 1, 0x8a6a2a); b(-a, h >> 1, d, a, h >> 1, d, 0xb0903a);
}

// ------------------------------------------------------------------ cards of our own
/** the ritual circle (decal, glowing): an octagon ring, a square inside, crossing axes, rune blocks between the rings — every line on an
 *  axis or exactly 45°, two texels wide */
addCardKind('ritual', { kind: 'decal', w: 64, h: 64, glow: 0.85 }, g => {
  const px = (x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  const rect = (x: number, y: number, w2: number, h2: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w2, h2); };
  const A = '#9a4ef0', B = '#d4aaff', cx = 32, cy = 32;
  const oct = (r: number, c: string) => { const b = Math.round(r * 0.414); for (let k = -b; k <= b; k++) for (const t of [0, 1]) { px(cx + r - t, cy + k, c); px(cx - r + t - 1, cy + k, c); px(cx + k, cy + r - t, c); px(cx + k, cy - r + t - 1, c); } for (let k = 0; k <= r - b; k++) for (const t of [0, 1]) { const a = b + k, c2 = r - k - t; px(cx + a, cy + c2, c); px(cx - a - 1, cy + c2, c); px(cx + a, cy - c2 - 1, c); px(cx - a - 1, cy - c2 - 1, c); } };
  oct(30, A); oct(25, A);
  rect(cx - 15, cy - 15, 30, 2, A); rect(cx - 15, cy + 13, 30, 2, A); rect(cx - 15, cy - 15, 2, 30, A); rect(cx + 13, cy - 15, 2, 30, A);
  rect(cx - 1, cy - 24, 2, 48, B); rect(cx - 24, cy - 1, 48, 2, B);
  rect(cx - 5, cy - 5, 10, 10, A); rect(cx - 3, cy - 3, 6, 6, 'rgba(0,0,0,0)'); g.clearRect(cx - 3, cy - 3, 6, 6); rect(cx - 1, cy - 1, 2, 2, B);
  // rune blocks between the octagons: little L / T / bar glyphs in a fixed order around the ring
  const glyphs = [[[0, 0, 4, 1], [0, 0, 1, 4]], [[0, 0, 4, 1], [1, 0, 1, 4]], [[0, 0, 1, 4], [0, 3, 4, 1]], [[0, 1, 4, 1], [1, 0, 1, 4], [3, 0, 1, 4]]];
  for (let i = 0; i < 8; i++) { const ang = (i + 0.5) * Math.PI / 4, gx = Math.round(cx + Math.cos(ang) * 27.5 - 2), gy = Math.round(cy + Math.sin(ang) * 27.5 - 2); for (const [x, y, w2, h2] of glyphs[i % 4]) rect(gx + x, gy + y, w2, h2, B); }
  for (const [x, y] of [[cx - 15, cy - 15], [cx + 13, cy - 15], [cx - 15, cy + 13], [cx + 13, cy + 13]]) rect(x - 1, y - 1, 4, 4, B);
});
/** loose pages / torn paper scattered on the floor (decal) */
addCardKind('pages', { kind: 'decal', w: 16, h: 16 }, g => {
  const rect = (x: number, y: number, w2: number, h2: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w2, h2); };
  rect(1, 2, 5, 6, '#d8cdb2'); rect(1, 3, 4, 1, '#9a8e76'); rect(1, 5, 3, 1, '#9a8e76'); rect(8, 6, 6, 4, '#cfc3a6'); rect(9, 7, 4, 1, '#958a70'); rect(5, 11, 5, 4, '#e0d6bc'); rect(6, 12, 3, 1, '#9a8e76');
});
/** straw strewn on a floor (decal): short straight stalks in two yellows, laid on the axes */
addCardKind('straw', { kind: 'decal', w: 16, h: 16 }, g => {
  const rect = (x: number, y: number, w2: number, h2: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w2, h2); };
  for (const [x, y, w2, h2, c] of [[1, 2, 6, 1, '#c8a84a'], [4, 4, 1, 5, '#a88a3a'], [8, 3, 6, 1, '#d8bc62'], [2, 9, 5, 1, '#a88a3a'], [9, 7, 1, 6, '#c8a84a'], [11, 12, 4, 1, '#d8bc62'], [5, 13, 4, 1, '#c8a84a']] as const) rect(x, y, w2, h2, c);
});
