// Scene building blocks for the chapter-1 stages, all on the shared block grid (CELL, 7 cm). House rules (the user's): only
// axis-aligned masses, tapering by a few wide tiers, no diagonal or curved runs, no random speckle. Detail comes from structure —
// plinths, copings, pilasters, frames, rails, hoops, coursed joints, board seams, nail rows — in two or three tones per prop (body,
// a darker joint / structure tone, a lighter edge / trim tone), and every prop mixes at least two materials (stone + wood + iron).
// Every helper takes metres for placement (M converts) and writes cells into a VoxWorld; sizes given "in blocks" are cells.
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';

export const M = (m: number) => Math.round(m / CELL);
export const hash = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export type W = VoxWorld;
export const pick = <T>(arr: T[], a: number, b = 0, c = 0) => arr[Math.floor(hash(a, b, c) * arr.length) % arr.length];

/** the stage rectangle every scene floors (metres) and the clear battle area inside it (act-135: extended south z1 8→13.5 so camera-side never clips into void) */
export const AREA = { x0: -11, x1: 11, z0: -13, z1: 13.5 };
export const PLAY = { x0: -5.2, x1: 5.4, z0: -6.4, z1: 5.6 };
/** the original (act-01…18) stage; layouts and locales are written in these coordinates */
const PLAY0 = { ...PLAY }, AREA0 = { ...AREA };
/** act-19 (user: 「战斗舞台太小了」 → 边长 2 倍): the 黄巾 rooms are built on a stage whose battle floor is twice as wide and deep.
 *  Layout and locale coordinates stay written for the old stage and go through SX / SZ: inside the old floor they scale by 2 about
 *  the origin, outside it they shift outward by the floor's growth (so a wing group keeps its distance from the floor's edge and its
 *  size). setStage(true) before assembling a big room, setStage(false) for the yard; PLAY / AREA are updated in place. */
/** 11-18 屋子形态 (用户：「场景再大些，形态多样一些」): the stretch is per axis now (kx across, kz in depth; 2 = the act-19 2x stage),
 *  so a room's shape (asm/roomShape.ts) can ask for a floor up to ≈ 30 × 40 m. Everything outside the old floor still just shifts out
 *  by the floor's growth. */
export const STAGE_BIG = { on: false, kx: 2, kz: 2 };
export const SX = (x: number) => !STAGE_BIG.on ? x : x > PLAY0.x1 ? x + PLAY0.x1 * (STAGE_BIG.kx - 1) : x < PLAY0.x0 ? x + PLAY0.x0 * (STAGE_BIG.kx - 1) : x * STAGE_BIG.kx;
export const SZ = (z: number) => !STAGE_BIG.on ? z : z > PLAY0.z1 ? z + PLAY0.z1 * (STAGE_BIG.kz - 1) : z < PLAY0.z0 ? z + PLAY0.z0 * (STAGE_BIG.kz - 1) : z * STAGE_BIG.kz;
/** the floor grid's step (m): 7 cells, a wall's thickness — the big floor's edges sit on it (asm/roomShape.ts) */
export const GRID = 0.49;
const snapG = (v: number) => Math.round(v / GRID) * GRID;
export function setStage(big: boolean, k: { x: number; z: number } = { x: 2, z: 2 }) {
  STAGE_BIG.on = big; STAGE_BIG.kx = k.x; STAGE_BIG.kz = k.z;
  Object.assign(PLAY, { x0: SX(PLAY0.x0), x1: SX(PLAY0.x1), z0: SZ(PLAY0.z0), z1: SZ(PLAY0.z1) });
  // (the big floor's edges on the floor grid (asm/roomShape.ts), so the walls built from it line up with the cells)
  if (big) Object.assign(PLAY, { x0: snapG(PLAY.x0), x1: snapG(PLAY.x1), z0: snapG(PLAY.z0), z1: snapG(PLAY.z1) });
  Object.assign(AREA, { x0: SX(AREA0.x0), x1: SX(AREA0.x1), z0: SZ(AREA0.z0), z1: SZ(AREA0.z1) });
}
/** the stage as it is now (to put it back after building something else ahead of time) */
export const stageNow = () => ({ big: STAGE_BIG.on, k: { x: STAGE_BIG.kx, z: STAGE_BIG.kz } });
export const inPlay = (x: number, z: number) => x > PLAY.x0 && x < PLAY.x1 && z > PLAY.z0 && z < PLAY.z1;

// ------------------------------------------------------------------ colour and frame helpers
const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
/** a colour scaled in brightness (k < 1 darker, k > 1 lighter) — for the joint / trim tones of a prop */
export const shade = (c: number, k: number) => (ch(((c >> 16) & 255) * k) << 16) | (ch(((c >> 8) & 255) * k) << 8) | ch((c & 255) * k);
/** linear mix of two colours */
export const mix = (a: number, b: number, t: number) => (ch(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t) << 16) | (ch(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) << 8) | ch((a & 255) * (1 - t) + (b & 255) * t);
const DARK = 0x1a1418, BRASS = 0xb08a48, IRON_M = 0x46424e, ROPE = 0xa89068, LEATHER = 0x4a3020;

/** compass facing: 's' = toward +z (the battle camera), 'n' = −z, 'e' = +x, 'w' = −x */
export type Dir = 'n' | 's' | 'e' | 'w';
/** a local frame at cell (X, Z) whose +dz looks along `f` (the prop's front) and +dx runs to its right-hand side as seen from the front */
function facing(w: W, X: number, Z: number, f: Dir = 's') {
  const tr = (dx: number, dz: number): [number, number] => f === 's' ? [X + dx, Z + dz] : f === 'n' ? [X - dx, Z - dz] : f === 'e' ? [X + dz, Z - dx] : [X - dz, Z + dx];
  return {
    set(dx: number, y: number, dz: number, c: number | null, g = 0) { const [a, b] = tr(dx, dz); w.set(a, y, b, c, g); },
    box(dx0: number, y0: number, dz0: number, dx1: number, y1: number, dz1: number, c: number | null, g = 0) { const [a, b] = tr(dx0, dz0), [p, q] = tr(dx1, dz1); w.box(a, y0, b, p, y1, q, c, g); },
    /** the centre of a local cell, in metres */
    pos(dx: number, y: number, dz: number): [number, number, number] { const [a, b] = tr(dx, dz); return [(a + 0.5) * CELL, (y + 0.5) * CELL, (b + 0.5) * CELL]; },
  };
}
/** a notched square: half-size r, corners cut by one cell (reads round without stair-steps) */
function nsq(w: W, X: number, Z: number, r: number, y0: number, y1: number, c: number | null, g = 0) {
  if (r <= 0) { w.box(X, y0, Z, X, y1, Z, c, g); return; }
  w.box(X - r, y0, Z - r + 1, X + r, y1, Z + r - 1, c, g).box(X - r + 1, y0, Z - r, X + r - 1, y1, Z + r, c, g);
}
interface Run {
  alongX: boolean; len: number;
  /** +1 / −1: which v side faces the battle camera (+z for x-runs, toward x = 0 for z-runs) */
  front: 1 | -1;
  /** cell u of an absolute coordinate along the run (x for x-runs, z for z-runs), in metres */
  uOf(m: number): number;
  box(u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, c: number | null, g?: number): void;
  set(u: number, y: number, v: number, c: number | null, g?: number): void;
  /** world metres of a cell */
  pos(u: number, v: number): [number, number];
}
/** a straight run along x or z: u = cells from its low end, v = cells across (+ = toward +z for x-runs, toward +x for z-runs) */
function run(w: W, x0: number, z0: number, x1: number, z1: number): Run {
  const X0 = M(Math.min(x0, x1)), X1 = M(Math.max(x0, x1)), Z0 = M(Math.min(z0, z1)), Z1 = M(Math.max(z0, z1));
  const alongX = X1 - X0 >= Z1 - Z0, len = alongX ? X1 - X0 : Z1 - Z0, U0 = alongX ? X0 : Z0, C = alongX ? Z0 : X0;
  const at = (u: number, v: number): [number, number] => alongX ? [U0 + u, C + v] : [C + v, U0 + u];
  return {
    alongX, len, front: alongX ? 1 : C < 0 ? 1 : -1,
    uOf: m => M(m) - U0,
    box(u0, y0, v0, u1, y1, v1, c, g = 0) { const [a, b] = at(u0, v0), [p, q] = at(u1, v1); w.box(a, y0, b, p, y1, q, c, g); },
    set(u, y, v, c, g = 0) { const [a, b] = at(u, v); w.set(a, y, b, c, g); },
    pos(u, v) { const [a, b] = at(u, v); return [(a + 0.5) * CELL, (b + 0.5) * CELL]; },
  };
}

// ------------------------------------------------------------------ floors (top surface at y = 0: cells at y = -1)
type Rect = { x0: number; z0: number; x1: number; z1: number };
const cellsOf = (r: Rect) => ({ X0: M(r.x0), X1: M(r.x1), Z0: M(r.z0), Z1: M(r.z1) });
export interface TileOpt {
  /** big-stone size in cells, joint included (default 15 ≈ 1 m) */
  size?: number; moss?: number; mossCol?: number;
  /**
   * 'pinwheel' (default): big squares with small squares in the corners between them, every stone axis-aligned, one regular
   * repeat; 'running': staggered squares (the old floor); 'grid': plain squares.
   */
  pattern?: 'pinwheel' | 'running' | 'grid';
  /** kerb band round the rectangle: its colour, or false for none (default a slightly darker tone of cols[0]) */
  border?: number | false;
  /** colour of the small squares (default a darker tone of cols[0]) */
  accent?: number;
}
/** flagstones with recessed joints: a kerb band round the edge and a regular pinwheel of big and small stones inside */
export function tiles(w: W, r: Rect, cols: number[], grout: number, o: TileOpt = {}) {
  const { X0, X1, Z0, Z1 } = cellsOf(r), P = o.size ?? 15, pat = o.pattern ?? 'pinwheel';
  const bw = o.border === false ? 0 : Math.max(4, Math.round(P * 0.45)), bc = typeof o.border === 'number' ? o.border : shade(cols[0], 0.9);
  const a = P, b = Math.max(3, Math.round(P * 0.4)), L2 = a * a + b * b, acc = o.accent ?? shade(cols[0], 0.86), nBig = Math.min(2, cols.length);
  const mod = (v: number, m: number) => ((v % m) + m) % m;
  for (let x = X0; x < X1; x++) for (let z = Z0; z < Z1; z++) {
    const ex = Math.min(x - X0, X1 - 1 - x), ez = Math.min(z - Z0, Z1 - 1 - z);
    if (bw && Math.min(ex, ez) < bw) {   // the kerb: long stones along each edge, square stones in the corners
      const gr = ex < bw && ez < bw ? ex === bw - 1 || ez === bw - 1 : ez < bw ? ez === bw - 1 || mod(x - X0 - bw, a) === a - 1 : ex === bw - 1 || mod(z - Z0 - bw, a) === a - 1;
      if (gr) w.set(x, -2, z, grout); else w.set(x, -1, z, bc);
      continue;
    }
    const px = x - X0 - bw, pz = z - Z0 - bw;
    let id = 0, lx = 0, lz = 0, sz = a, small = false;
    if (pat === 'pinwheel') {
      // lattice (a, b), (−b, a): a big square at every lattice point, a small b-square tucked at its (a−b, a) corner
      const m0 = Math.floor((px * a + pz * b) / L2), n0 = Math.floor((-px * b + pz * a) / L2);
      found: for (let m = m0 - 1; m <= m0 + 1; m++) for (let n = n0 - 1; n <= n0 + 1; n++) {
        const qx = px - (m * a - n * b), qz = pz - (m * b + n * a);
        if (qx >= 0 && qx < a && qz >= 0 && qz < a) { id = m * 7919 + n; lx = qx; lz = qz; break found; }
        if (qx >= a - b && qx < a && qz >= a && qz < a + b) { id = m * 7919 + n; lx = qx - (a - b); lz = qz - a; sz = b; small = true; break found; }
      }
    } else {
      const tz = Math.floor(pz / P), sx = px + (pat === 'running' && tz & 1 ? P >> 1 : 0), tx = Math.floor(sx / P);
      id = tx * 7919 + tz; lx = mod(sx, P); lz = mod(pz, P);
    }
    if (lx === sz - 1 || lz === sz - 1) { w.set(x, -2, z, grout); continue; }
    const mossy = o.moss && !small && hash(id, 9) < o.moss && !inPlay(x * CELL, z * CELL);
    w.set(x, -1, z, mossy ? (o.mossCol ?? 0x4e7038) : small ? acc : cols[Math.floor(hash(id, 1) * nBig)]);
  }
}
export interface PlankOpt {
  /** board length in cells, end joint included (default 30 ≈ 2 m) */
  len?: number;
  /** boards run along z instead of x */
  alongZ?: boolean;
  /** a pair of nails at the head of every board (default on) */
  nails?: boolean;
  /** board width in cells (default 5) */
  width?: number;
}
/** floorboards with recessed seams, board ends staggered by thirds (a regular bond, not random), a nail pair at the head of every board */
export function planks(w: W, r: Rect, cols: number[], seam: number, o: PlankOpt = {}) {
  const { X0, X1, Z0, Z1 } = cellsOf(r), L = o.len ?? 30, BW = o.width ?? 5, PER = BW + 1, nails = o.nails !== false, third = Math.round(L / 3);
  for (let x = X0; x < X1; x++) for (let z = Z0; z < Z1; z++) {
    const al = o.alongZ ? z - Z0 : x - X0, ac = o.alongZ ? x - X0 : z - Z0;
    const row = Math.floor(ac / PER), lc = ac % PER;
    if (lc === BW) { w.set(x, -2, z, seam); continue; }
    const s = al + [0, 2, 1][row % 3] * third, la = s % L, board = Math.floor(s / L);
    if (la === L - 1) { w.set(x, -2, z, seam); continue; }
    const col = cols[Math.floor(hash(row, board, 3) * cols.length)];
    const nail = nails && la === 1 && (lc === 1 || lc === BW - 2);
    w.set(x, -1, z, nail ? shade(col, 0.74) : col);
  }
}
/** smooth low-frequency field in about −1..1 (for ground regions that read as blobs, not a checkerboard) */
export const field = (x: number, z: number, seed = 1) => Math.sin(x * 0.23 + seed * 1.7) * Math.cos(z * 0.19 + seed * 0.9) * 0.7 + Math.sin((x + z) * 0.13 + seed * 2.3) * 0.5 + Math.cos((x - z) * 0.09 + seed) * 0.3;
/** ground in coherent regions: the first colour dominates, the others form a few large blobs (blocky edges, no speckle) */
export function patches(w: W, r: Rect, cols: number[], o: { size?: number; raise?: number[]; seed?: number } = {}) {
  const { X0, X1, Z0, Z1 } = cellsOf(r), S = o.size ?? 8, sd = o.seed ?? 1;
  const thr = [0, 0.55, 0.85, 1.1];
  for (let x = X0; x < X1; x++) for (let z = Z0; z < Z1; z++) {
    const px = Math.floor(x / S), pz = Math.floor(z / S), f = field(px, pz, sd);
    let i = 0; for (let k = 1; k < cols.length; k++) if ((k & 1 ? f : -f) > thr[Math.min(k, thr.length - 1)] - (k > 1 ? 0.15 : 0)) i = k;
    w.set(x, -1, z, cols[i]);
    if (o.raise && o.raise.includes(i) && !inPlay(x * CELL, z * CELL)) w.set(x, 0, z, cols[i]);
  }
}
/**
 * A path of flat slabs from (x, z0) to (x, z1): one wide slab, then a pair of half slabs, repeating; each sits flush with the
 * ground inside a dark joint, so the path is safe on the battle floor. w = path width in metres.
 */
export function slabPath(w: W, x: number, z0: number, z1: number, c: number, o: { w?: number; groove?: number } = {}) {
  const Xc = M(x), half = Math.max(3, Math.round(M(o.w ?? 0.8) / 2)), g = o.groove ?? shade(c, 0.5), lite = shade(c, 1.06);
  const slab = (ax: number, az: number, bx: number, bz: number, col: number) => { w.box(ax - 1, -1, az - 1, bx + 1, -1, bz + 1, null).box(ax - 1, -2, az - 1, bx + 1, -2, bz + 1, g).box(ax, -1, az, bx, -1, bz, col); };
  for (let z = M(z0), i = 0; z < M(z1); i++) {
    const ox = Math.round((hash(i, 5) - 0.5) * 4);
    if (i % 2 === 0) { slab(Xc - half + ox, z, Xc + half + ox, z + 6, c); z += 10; }
    else { slab(Xc - half + ox, z, Xc - 1 + ox, z + 4, lite); slab(Xc + 1 + ox, z, Xc + half + ox, z + 4, lite); z += 8; }
  }
}
/**
 * A woven rug flush with the floor (it replaces the top floor layer, so it may lie on the battle floor): border band, a thin inner
 * line, the field, a medallion of nested rectangles and a square in each corner of the field.
 */
export function rug(w: W, r: Rect, fieldCol: number, border: number, o: { motif?: number } = {}) {
  const { X0, X1, Z0, Z1 } = cellsOf(r), mo = o.motif ?? shade(border, 1.3), Wd = X1 - X0, Dp = Z1 - Z0, bw = Math.max(2, Math.round(Math.min(Wd, Dp) / 9));
  const cx = (X0 + X1 - 1) / 2, cz = (Z0 + Z1 - 1) / 2, mx = Math.max(3, Wd * 0.2), mz = Math.max(3, Dp * 0.2);
  for (let x = X0; x < X1; x++) for (let z = Z0; z < Z1; z++) {
    const ex = Math.min(x - X0, X1 - 1 - x), ez = Math.min(z - Z0, Z1 - 1 - z), d = Math.min(ex, ez);
    let col = fieldCol;
    if (d < bw) col = border;
    else if (d === bw) col = mo;
    else {
      const k = Math.max(Math.abs(x - cx) / mx, Math.abs(z - cz) / mz);
      if (k <= 1) col = k > 0.78 ? mo : k > 0.5 ? fieldCol : k > 0.28 ? border : mo;
      else if (ex >= bw + 2 && ex < bw + 5 && ez >= bw + 2 && ez < bw + 5) col = mo;
    }
    w.set(x, -1, z, col);
  }
}

// ------------------------------------------------------------------ walls (cutaway: tall at the back, stepping down toward the camera)
export interface WallOpt {
  /** thickness in blocks (default 4) */
  t?: number;
  /** plinth and pilaster colour (default a darker tone of the wall) */
  band?: number;
  /** fraction of the height lost where the wall is broken (0..0.85); the break is two or three wide steps */
  broken?: number; seed?: number;
  /** where the break sits: z-runs default to 'end' (it drops toward the camera), x-runs to 'mid' (a notch) */
  breakAt?: 'start' | 'mid' | 'end';
  /** pilaster spacing in metres (default 2.6; 0 = none) */
  pier?: number;
  /** face pattern: coursed brick (default), large ashlar blocks, or plain (plaster) */
  pattern?: 'brick' | 'block' | 'plain';
  /** pattern on the camera-side face only (default) or both faces */
  faces?: 'front' | 'both';
  /** cut the bed joints one block deep (crisper up close, but ~6 triangles per joint cell; default: a flush darker line) */
  recess?: boolean;
  /** coping colour (default a lighter tone of the wall) */
  cap?: number;
  /** pilaster colour (default = band) */
  pierCol?: number;
  /** plinth height in metres (default 0.42) */
  plinth?: number;
  /** window centres along the wall (metres: x for x-runs, z for z-runs) */
  windows?: number[];
  /** window size (metres) and look: glow = a lit pane colour, bars = iron bars colour, frame = surround colour */
  win?: { w?: number; h?: number; y?: number; glow?: number; frame?: number; bars?: number };
  /** doorway centres along the wall (metres) */
  doors?: number[];
  /** door size (metres); leaf = door-leaf colour (null = an open doorway) */
  door?: { w?: number; h?: number; leaf?: number | null; frame?: number };
}
/**
 * A wall run along x or z: plinth, coursed body, overhanging coping, pilasters every ~2.6 m that rise above the coping with their own
 * caps, optional windows (framed, sill, stepped head, lit pane with a cross of glazing bars) and doorways. `broken` takes a bite out
 * of the top in two or three wide steps. h in metres, t = thickness in blocks, centred on the line.
 */
export function wall(w: W, x0: number, z0: number, x1: number, z1: number, h: number, c: number, o: WallOpt = {}) {
  const R = run(w, x0, z0, x1, z1), t = Math.max(1, o.t ?? 4), H = M(h), len = R.len, sd = o.seed ?? 1;
  const vA = -(t >> 1), vB = t - 1 - (t >> 1);
  const pl = o.band ?? shade(c, 0.8), capC = o.cap ?? shade(c, 1.13), pierC = o.pierCol ?? pl, jointC = shade(c, 0.86), bedC = shade(c, 0.8);
  const block = o.pattern === 'block', CP = block ? 7 : 5, BL = block ? 12 : 8;
  const Hp = Math.max(1, Math.min(M(o.plinth ?? 0.42), Math.round(H * 0.3)));
  // openings (pilasters keep clear of them)
  const ww = M(o.win?.w ?? 0.9), wy = M(o.win?.y ?? 1.0), wh = M(o.win?.h ?? 1.5), dw = M(o.door?.w ?? 1.2), dh = M(o.door?.h ?? 2.1);
  const wins = (o.windows ?? []).map(R.uOf), doors = (o.doors ?? []).map(R.uOf);
  const spans = [...wins.map(u => [u - (ww >> 1) - 3, u + (ww >> 1) + 3]), ...doors.map(u => [u - (dw >> 1) - 3, u + (dw >> 1) + 3])];
  // height profile
  const D = o.broken ? Math.round(H * Math.min(0.85, o.broken)) : 0, nSteps = hash(sd, 7) < 0.5 ? 2 : 3, at = o.breakAt ?? (R.alongX ? 'mid' : 'end');
  const quant = (y: number) => Math.min(H - 2, Math.max(Hp + CP - 2, Hp + Math.round((y - Hp + 2) / CP) * CP - 2));
  const c0 = len * (0.32 + 0.36 * hash(sd, 3)), hw = len * (0.17 + 0.08 * hash(sd, 4)), b0 = 0.42 + 0.16 * hash(sd, 2);
  const hAt = (u: number) => {
    if (!D) return H;
    let k = 0;
    if (at === 'mid') { const d = Math.abs(u - c0); if (d < hw) k = Math.min(nSteps, Math.floor((1 - d / hw) * nSteps) + 1); }
    else { const f = at === 'end' ? u / len : 1 - u / len; if (f > b0) k = Math.min(nSteps, Math.floor(((f - b0) / (1 - b0)) * nSteps) + 1); }
    return k ? quant(H - (D * k) / nSteps) : H;
  };
  const faces = o.faces === 'both' ? [vA, vB] : [R.front > 0 ? vB : vA];
  // plinth and pilasters stand proud only on the patterned face(s): the far face of a back or side wall is never seen
  const pA = faces.includes(vA) ? 1 : 0, pB = faces.includes(vB) ? 1 : 0;
  for (let u = 0; u <= len; u++) {
    const hh = hAt(u), intact = hh >= H;
    R.box(u, -2, vA, u, hh, vB, c);
    R.box(u, -2, vA - pA, u, Hp - 1, vB + pB, pl);
    if (intact) R.box(u, H - 1, vA - 1, u, H, vB + 1, capC);
    if (o.pattern !== 'plain' && (t >= 2 || !o.recess)) for (const vf of faces) {
      for (let y = Hp, top = intact ? H - 2 : hh; y <= top; y++) {
        const rr = y - Hp, course = Math.floor(rr / CP);
        if (rr % CP === CP - 1) R.set(u, y, vf, o.recess ? null : bedC);
        else if ((u + (course & 1) * (BL >> 1)) % BL === BL - 1) R.set(u, y, vf, jointC);
      }
    }
  }
  // a loose block or two left on the broken steps
  if (D) for (let u = 4; u < len - 6; u += 13) { const hh = hAt(u); if (hh < H && hAt(u + 5) === hh && hash(u, sd, 11) < 0.45) R.box(u, hh + 1, vA + (t > 3 ? 1 : 0), u + (block ? 5 : 3), hh + 2, vB - (t > 3 ? 1 : 0), c); }
  // pilasters
  const PS = o.pier === 0 ? 0 : M(o.pier ?? 2.6);
  if (PS > 0 && len >= 10) {
    const n = Math.max(1, Math.round(len / PS));
    for (let i = 0; i <= n; i++) {
      const uc = Math.round((i * len) / n); if (spans.some(([p, q]) => uc + 3 >= p && uc - 3 <= q)) continue;
      let hh = H; for (let u = uc - 2; u <= uc + 2; u++) hh = Math.min(hh, hAt(Math.max(0, Math.min(len, u))));
      R.box(uc - 3, -2, vA - 2 * pA, uc + 3, Hp - 1, vB + 2 * pB, pl);
      R.box(uc - 2, Hp, vA - pA, uc + 2, hh, vB + pB, pierC);
      if (hh >= H) { R.box(uc - 3, H + 1, vA - 1 - pA, uc + 3, H + 2, vB + 1 + pB, capC); R.box(uc - 2, H + 3, vA - pA, uc + 2, H + 3, vB + pB, capC); }
    }
  }
  const frame = o.win?.frame ?? pierC;
  for (const uc of wins) if (hAt(uc) >= wy + wh + 3) opening(R, uc, wy, ww, wh, vA, vB, { frame, sill: capC, glow: o.win?.glow, bars: o.win?.bars });
  for (const uc of doors) doorway(R, uc, dw, dh, vA, vB, { frame: o.door?.frame ?? pierC, leaf: o.door?.leaf === undefined ? 0x4a3222 : o.door.leaf, front: R.front });
}
/** a window through a wall run: stepped head, framed on both faces, sill, optional lit pane with glazing bars or iron bars */
function opening(R: Run, uc: number, y0: number, ow: number, oh: number, vA: number, vB: number, o: { frame: number; sill?: number; glow?: number; bars?: number }) {
  const a = uc - (ow >> 1), b = a + ow - 1, s1 = Math.max(1, Math.round(ow / 4)), yT = y0 + oh - 1, vm = (vA + vB) >> 1;
  R.box(a, y0, vA - 1, b, yT - 2, vB + 1, null); R.box(a + s1, yT - 1, vA - 1, b - s1, yT, vB + 1, null);
  for (const vf of [vA - 1, vB + 1]) {
    const sg = vf < 0 ? -1 : 1;
    R.box(a - 2, y0, vf, a - 1, yT - 2, vf, o.frame); R.box(b + 1, y0, vf, b + 2, yT - 2, vf, o.frame);
    R.box(a - 2, yT - 1, vf, a + s1 - 1, yT, vf, o.frame); R.box(b - s1 + 1, yT - 1, vf, b + 2, yT, vf, o.frame);
    R.box(a - 2, yT + 1, vf, b + 2, yT + 2, vf, o.frame);
    R.box(uc - 1, yT + 1, vf + sg, uc + 1, yT + 3, vf + sg, o.sill ?? o.frame);   // keystone
    R.box(a - 3, y0 - 2, vf, b + 3, y0 - 1, vf + sg, o.sill ?? o.frame);           // sill, two deep
  }
  if (o.glow != null) {
    R.box(a, y0, vm, b, yT - 2, vm, o.glow, 1); R.box(a + s1, yT - 1, vm, b - s1, yT, vm, o.glow, 1);
    if (ow >= 5) R.box(uc, y0, vm, uc, yT, vm, o.frame);
    R.box(a, y0 + ((oh - 2) >> 1), vm, b, y0 + ((oh - 2) >> 1), vm, o.frame);
  } else if (o.bars != null) for (let u = a + 1; u < b; u += 2) R.box(u, y0, vm, u, yT, vm, o.bars);
}
/** a doorway: cut to the floor, jambs and lintel on both faces, threshold, and a plank leaf with iron straps unless leaf is null */
function doorway(R: Run, uc: number, dw: number, dh: number, vA: number, vB: number, o: { frame: number; leaf: number | null; front: number }) {
  const a = uc - (dw >> 1), b = a + dw - 1, s1 = Math.max(1, Math.round(dw / 5)), yT = dh - 1;
  R.box(a, 0, vA - 2, b, yT - 2, vB + 2, null); R.box(a + s1, yT - 1, vA - 1, b - s1, yT, vB + 1, null);
  R.box(a, -1, vA - 1, b, -1, vB + 1, shade(o.frame, 1.1));
  for (const vf of [vA - 1, vB + 1]) {
    R.box(a - 2, 0, vf, a - 1, yT - 2, vf, o.frame); R.box(b + 1, 0, vf, b + 2, yT - 2, vf, o.frame);
    R.box(a - 2, yT - 1, vf, a + s1 - 1, yT, vf, o.frame); R.box(b - s1 + 1, yT - 1, vf, b + 2, yT, vf, o.frame);
    R.box(a - 3, yT + 1, vf, b + 3, yT + 2, vf, o.frame);
  }
  if (o.leaf == null) return;
  const vL = o.front > 0 ? vB - 1 : vA + 1, seam = shade(o.leaf, 0.75), vS = vL + (o.front > 0 ? 1 : -1);
  R.box(a, 0, vL, b, yT - 2, vL, o.leaf); R.box(a + s1, yT - 1, vL, b - s1, yT, vL, o.leaf);
  for (let u = a + 2; u < b; u += 3) R.box(u, 0, vL, u, yT - 2, vL, seam);
  for (const y of [3, yT - 5]) R.box(a, y, vS, b, y, vS, IRON_M);
  R.set(b - 2, (yT >> 1) - 1, vS, BRASS);
}
export interface CottageOpt {
  /** window centres (metres along the run); default: the odd bays get one; false = none */
  windows?: number[] | false;
  /** lit-pane colour (default warm amber) */
  glow?: number;
  /** step the far end down in two wide steps (default true, as before) */
  broken?: boolean;
  /** roof-tile colour: adds an eave of three wide tile tiers rising away from the camera */
  roof?: number;
  /** shutter colour (default a light tone of the timber) */
  shutter?: number;
  /** bay width in metres (default 1.5) */
  bay?: number;
}
/**
 * A timber-framed cottage wall: coursed stone footing, sill beam, posts every bay, a middle rail and a top plate (no diagonal braces),
 * plaster panels set back between the timbers, framed windows with sills, shutters and a warm lit pane; the far end steps down.
 */
export function cottageWall(w: W, x0: number, z0: number, x1: number, z1: number, h: number, stone: number, timber: number, plaster: number, o: CottageOpt = {}) {
  const R = run(w, x0, z0, x1, z1), H = M(h), len = R.len, Hf = Math.min(M(0.56), Math.round(H * 0.25)), fs = R.front;
  const nb = Math.max(1, Math.round(len / M(o.bay ?? 1.5))), bayU = (i: number) => Math.round((i * len) / nb), Hm = Hf + Math.round((H - Hf) * 0.4);
  const brk = o.broken !== false && nb >= 2;
  const hAt = (u: number) => { if (!brk) return H; const bi = Math.min(nb - 1, Math.floor((u * nb) / (len + 1))); return bi === nb - 1 ? Math.max(Hm + 2, Math.round(H * 0.4)) : bi === nb - 2 && nb >= 3 ? Math.round(H * 0.7) : H; };
  const stoneD = shade(stone, 0.84), plate = shade(timber, 1.15), vf = fs > 0 ? 2 : -2;
  for (let u = 0; u <= len; u++) {
    const hh = hAt(u), intact = hh >= H;
    R.box(u, -2, -2, u, Hf, 2, stone);
    for (let y = 0; y < Hf; y++) { if (y % 4 === 3) R.set(u, y, vf, null); else if ((u + (Math.floor(y / 4) & 1) * 4) % 9 === 8) R.set(u, y, vf, stoneD); }
    if (hh > Hf) R.box(u, Hf + 1, -1, u, hh, 1, plaster);
    R.box(u, Hf + 1, -2, u, Hf + 2, 2, timber);
    if (hh > Hm + 1) R.box(u, Hm, -2, u, Hm + 1, 2, timber);
    if (intact) { R.box(u, H - 2, -2, u, H, 2, timber); R.box(u, H + 1, -3, u, H + 1, 3, plate); }
  }
  for (let i = 0; i <= nb; i++) { const u = bayU(i), hh = Math.max(hAt(Math.max(0, u - 2)), hAt(Math.min(len, u + 2))); R.box(u - 1, Hf + 1, -2, u + 1, hh, 2, timber); if (hh >= H) R.box(u - 1, H + 1, -3, u + 1, H + 1, 3, plate); }
  // windows in the upper panels
  const wu = o.windows === false ? [] : o.windows ? o.windows.map(R.uOf) : Array.from({ length: nb }, (_, i) => i).filter(i => i % 2 === 1 && hAt(bayU(i) + 2) >= H && hAt(bayU(i + 1) - 2) >= H).map(i => (bayU(i) + bayU(i + 1)) >> 1);
  // a stud up the middle of each bay: through the lower panel always, through the upper one where no window sits
  for (let i = 0; i < nb; i++) {
    const um = (bayU(i) + bayU(i + 1)) >> 1, hh = hAt(um); if (bayU(i + 1) - bayU(i) < 12) continue;
    if (hh > Hm) R.box(um, Hf + 3, -2, um, Hm - 1, 2, timber);
    if (hh > Hm + 3 && !wu.some(u => Math.abs(u - um) < 8)) R.box(um, Hm + 2, -2, um, hh >= H ? H - 3 : hh, 2, timber);
  }
  const glow = o.glow ?? 0x9a6a30, sh = o.shutter ?? shade(timber, 1.55), y0 = Hm + 3, yT = H - 4;
  if (yT - y0 >= 6) for (const uc of wu) {
    const a = uc - 3, b = uc + 3;
    R.box(a, y0, -2, b, yT, 2, null);
    R.box(a, y0, 0, b, yT, 0, glow, 1); R.box(uc, y0, 0, uc, yT, 0, timber); R.box(a, (y0 + yT) >> 1, 0, b, (y0 + yT) >> 1, 0, timber);
    for (const v of [-2, 2]) { R.box(a - 1, y0 - 1, v, a - 1, yT + 1, v, timber); R.box(b + 1, y0 - 1, v, b + 1, yT + 1, v, timber); R.box(a - 1, yT + 1, v, b + 1, yT + 1, v, timber); }
    R.box(a - 2, y0 - 2, -3, b + 2, y0 - 1, 3, plate);
    for (const [p, q] of [[a - 4, a - 2], [b + 2, b + 4]]) { R.box(p, y0, vf, q, yT, vf, sh); R.box(p + 1, y0, vf, p + 1, yT, vf, shade(sh, 0.82)); R.box(p, y0 + 1, vf, q, y0 + 1, vf, shade(sh, 0.82)); R.box(p, yT - 1, vf, q, yT - 1, vf, shade(sh, 0.82)); }
  }
  // the eave: beam ends under three wide tiers of tiles rising away from the camera
  if (o.roof != null) {
    const rD = shade(o.roof, 0.78);
    for (let u = -3; u <= len + 3; u++) {
      if (hAt(Math.max(0, Math.min(len, u))) < H) continue;
      R.box(u, H + 2, -fs * 3, u, H + 3, fs * 5, o.roof); R.set(u, H + 2, fs * 5, rD); R.set(u, H + 3, fs * 5, rD);
      R.box(u, H + 4, -fs * 6, u, H + 5, fs * 1, o.roof); R.set(u, H + 4, fs * 1, rD); R.set(u, H + 5, fs * 1, rD);
      R.box(u, H + 6, -fs * 9, u, H + 7, -fs * 3, o.roof); R.set(u, H + 6, -fs * 3, rD); R.set(u, H + 7, -fs * 3, rD);
    }
    for (let i = 0; i <= nb * 2; i++) { const u = Math.round((i * len) / (nb * 2)); if (hAt(u) >= H) R.box(u, H, fs * 3, u + 1, H + 1, fs * 4, timber); }
  }
}
/** an overhead timber beam (interiors: rafters that frame the top of the shot) from (x0,z0) to (x1,z1) at height y metres, iron straps every ~1.4 m */
export function beam(w: W, x0: number, z0: number, x1: number, z1: number, y: number, wood: number, o: { iron?: number } = {}) {
  const R = run(w, x0, z0, x1, z1), Y = M(y), iron = o.iron ?? IRON_M;
  R.box(0, Y, -1, R.len, Y + 3, 1, wood); R.box(0, Y, -1, R.len, Y, 1, shade(wood, 0.8));
  for (let u = 6; u < R.len - 3; u += 20) R.box(u, Y - 1, -2, u + 1, Y + 4, 2, iron);
}

// ------------------------------------------------------------------ rock (stratified: level beds, set back as they rise, a capping bed on top)
export interface CliffOpt {
  /** the way the face looks (toward the stage) */
  inward: Dir;
  /** how far the rock mass runs behind the face line (metres, default 1.6) */
  depth?: number; seed?: number;
  /** colour of the capping bed (default a lighter tone of cols[0]) */
  top?: number;
  /** 0..1: height lost from the start of the run to its end (side walls fall toward the camera) */
  fall?: number;
  /** how far the bottom bed stands out in front of the line (metres, default 0.5) */
  bulge?: number;
  /** a few fallen blocks at the foot (default true) */
  talus?: boolean;
}
/** a stratified rock face along one axis-aligned edge: level beds that recede as they climb, segment tops in wide steps, a capping bed */
export function cliff(w: W, x0: number, z0: number, x1: number, z1: number, h: number, cols: number[], o: CliffOpt) {
  const R = run(w, x0, z0, x1, z1), len = R.len, sd = o.seed ?? 1, D = M(o.depth ?? 1.6), topC = o.top ?? shade(cols[0], 1.16), bulge = M(o.bulge ?? 0.5);
  const sv = o.inward === 's' || o.inward === 'e' ? 1 : -1, LT = [9, 8, 10, 9, 8, 10, 9, 8];
  const Hmax = M(h);
  for (let u0 = 0, s = 0; u0 <= len; s++) {
    // each segment is its own mass: its own plan offset, its beds shifted a little against its neighbours', a hard bed jutting here and there
    const sl = 22 + Math.floor(hash(s, sd, 5) * 26), u1 = Math.min(len, u0 + sl - 1), fr = (u0 + u1) / 2 / Math.max(1, len), um = (u0 + u1) >> 1;
    const hs = Hmax * (1 - (o.fall ?? 0) * fr) * (0.62 + 0.38 * hash(s, sd, 1)), Bs = bulge + [0, -4, 3, -2, -6, 2][Math.floor(hash(s, sd, 2) * 6)], yOff = Math.floor(hash(s, sd, 4) * 4);
    let y = -2, j = 0, fTop = Bs;
    while (y < hs - 3 || j === 0) {
      const lt = LT[(j + s) % LT.length] + (j === 0 ? yOff : 0), last = y + lt >= hs - 3, jr = hash(s, j, sd), f = Bs - 2 * j + (jr < 0.22 ? 2 : jr < 0.45 ? -2 : 0);
      const col = cols[(j + (s & 1)) % cols.length], vF = sv * f, vBk = -sv * D;
      if (last) R.box(u0, y, vF, u1, y + lt - 1, vBk, col);
      else { R.box(u0, y, vF, u1, y + lt - 1, vF - sv * 8, col); R.box(u0, y, vF, u0, y + lt - 1, vBk, col); R.box(u1, y, vF, u1, y + lt - 1, vBk, col); }
      y += lt; j++; fTop = f;
      if (last) break;
    }
    // the capping bed: thinner, set back, lighter; on long segments one half carries a spur a bed higher
    R.box(u0, y, sv * (fTop - 2), u1, y + 2, -sv * D, topC);
    if (u1 - u0 > 30 && hash(s, sd, 6) < 0.6) { const left = hash(s, sd, 7) < 0.5, a = left ? u0 + 2 : um, b = left ? um : u1 - 2; R.box(a, y + 3, sv * (fTop - 4), b, y + 8, -sv * D, cols[(j + 1) % cols.length]); R.box(a + 1, y + 9, sv * (fTop - 6), b - 1, y + 10, -sv * D, topC); }
    // talus: one or two squared blocks fallen at the foot
    if (o.talus !== false && hash(s, sd, 8) < 0.55 && u1 - u0 > 12) {
      const uc = u0 + 3 + Math.floor(hash(s, sd, 9) * (u1 - u0 - 10)), vb = sv * (Bs + 1), [mx, mz] = R.pos(uc + 3, vb + sv * 3);
      if (!inPlay(mx, mz)) { R.box(uc, -2, vb, uc + 6, 4, vb + sv * 5, cols[1 % cols.length]); R.box(uc + 1, 5, vb + sv, uc + 4, 7, vb + sv * 3, cols[0]); }
    }
    u0 = u1 + 1;
  }
}
/** a rock wall of stratified cliffs round a rectangle's back and sides (caves): the back is tallest, the sides fall toward the camera */
export function rockRing(w: W, r: Rect, h: number, cols: number[], o: { front?: boolean; seed?: number; top?: number; depth?: number } = {}) {
  const sd = o.seed ?? 1, d = o.depth ?? 1.6;
  cliff(w, r.x0 - d, r.z0, r.x1 + d, r.z0, h, cols, { inward: 's', seed: sd, top: o.top, depth: d });
  cliff(w, r.x0, r.z0, r.x0, r.z1, h * 0.75, cols, { inward: 'e', seed: sd + 1, top: o.top, depth: d, fall: 0.5 });
  cliff(w, r.x1, r.z0, r.x1, r.z1, h * 0.75, cols, { inward: 'w', seed: sd + 2, top: o.top, depth: d, fall: 0.5 });
  if (o.front) cliff(w, r.x0, r.z1, r.x1, r.z1, Math.max(0.5, h * 0.18), cols, { inward: 'n', seed: sd + 3, top: o.top, depth: d * 0.6, talus: false });
}

// ------------------------------------------------------------------ props (x, z in metres at the base; sizes in blocks unless noted)
/** a boulder: a broad footing mass with a darker bed line, a smaller mass set off to one side on top, a capping slab, and a block leaning on the other side */
export function rock(w: W, x: number, z: number, s: number, h: number, c: number, top?: number) {
  const X = M(x), Z = M(z), t = top ?? c, ox = hash(X, Z, 5) < 0.5 ? 1 : -1, oz = hash(X, Z, 6) < 0.5 ? 1 : -1;
  const h1 = Math.max(1, Math.round(h * 0.55)), off = Math.max(1, s >> 1), s2 = Math.max(2, s - 2);
  const cx0 = Math.max(X - s, X + ox * off - s2), cx1 = Math.min(X + s, X + ox * off + s2), cz0 = Math.max(Z - s, Z + oz * (off >> 1) - s2), cz1 = Math.min(Z + s, Z + oz * (off >> 1) + s2);
  w.box(X - s, -2, Z - s, X + s, h1, Z + s, c);
  if (h1 > 3) w.box(X - s, h1 - 2, Z - s, X + s, h1 - 2, Z + s, shade(c, 0.88));
  if (h > h1) w.box(cx0, h1 + 1, cz0, cx1, h, cz1, c);
  w.box(cx0 + 1, h + 1, cz0 + 1, cx1 - 1, h + 2, cz1 - 1, t);
  const lx = X - ox * (s + 1), sz = Math.max(2, s >> 1);
  if (s >= 4 && !inPlay((lx - ox * (sz >> 1)) * CELL, Z * CELL)) w.box(lx, -2, Z - oz * sz - sz, lx - ox * sz, Math.round(h * 0.38), Z - oz * sz + sz - 1, shade(c, 0.9)).box(lx - ox, Math.round(h * 0.38) + 1, Z - oz * sz - sz + 1, lx - ox * (sz - 1), Math.round(h * 0.38) + 1, Z - oz * sz + sz - 2, t);
}
/** a crate (edge 2s+1 blocks): board panels set back inside an edge-batten frame, a rail round the middle and across the lid, iron corner caps */
export function crate(w: W, x: number, z: number, s: number, c: number, band: number, o: { iron?: number; y0?: number } = {}) {
  const X = M(x), Z = M(z), y0 = o.y0 ?? 0, T = y0 + 2 * s, iron = o.iron ?? IRON_M;
  w.box(X - s + 1, y0, Z - s + 1, X + s - 1, T - 1, Z + s - 1, c);
  const ring = (y: number) => { w.box(X - s, y, Z - s, X + s, y, Z - s, band).box(X - s, y, Z + s, X + s, y, Z + s, band).box(X - s, y, Z - s, X - s, y, Z + s, band).box(X + s, y, Z - s, X + s, y, Z + s, band); };
  for (const sx of [-s, s]) for (const sz of [-s, s]) w.box(X + sx, y0, Z + sz, X + sx, T, Z + sz, band);
  ring(y0); ring(T); ring(y0 + s);
  w.box(X - s, T, Z, X + s, T, Z, band);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [0, 1]) {
    const xa = sx < 0 ? X - s : X + s - 1, za = sz < 0 ? Z - s : Z + s - 1, ya = sy ? T - 1 : y0;
    w.box(xa, ya, za, xa + 1, ya + 1, za + 1, iron);
  }
}
/**
 * A barrel: staves bulging between two pairs of iron hoops (sections are notched squares — round without stair-steps), stave seams,
 * a lid set down inside the rim with a bung. lying: on its side, along x (alongX, default) or z.
 */
export function barrel(w: W, x: number, z: number, c: number, hoop: number, o: { lying?: boolean; alongX?: boolean; lid?: number; y0?: number } = {}) {
  const X = M(x), Z = M(z), y0 = o.y0 ?? 0, lid = o.lid ?? shade(c, 1.18), seam = shade(c, 0.8);
  const put = (dx: number, ly: number, dz: number, col: number) => o.lying ? (o.alongX !== false ? w.set(X + ly - 6, y0 + 4 + dz, Z + dx, col) : w.set(X + dx, y0 + 4 + dz, Z + ly - 6, col)) : w.set(X + dx, y0 + ly, Z + dz, col);
  for (let ly = 0; ly < 12; ly++) {
    const belly = ly >= 2 && ly <= 9, r = belly ? 4 : 3, isHoop = ly === 1 || ly === 3 || ly === 8 || ly === 10;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
      const edge = Math.abs(dx) === r || Math.abs(dz) === r, along = Math.abs(dx) === r ? dz : dx;
      if (ly === 11) { if (edge) put(dx, ly, dz, c); continue; }
      if (ly === 10 && !edge) { put(dx, ly, dz, dx === 1 && dz === 1 ? seam : lid); continue; }
      put(dx, ly, dz, edge && isHoop ? hoop : edge && belly && Math.abs(along) === 2 ? seam : c);
    }
  }
}
/** a table: two-cell top with board seams, an apron under it, 2×2 legs, an H stretcher; cloth = a runner down the long axis */
export function table(w: W, x: number, z: number, lx: number, lz: number, c: number, leg: number, o: { cloth?: number } = {}) {
  const X = M(x), Z = M(z), a = M(lx) >> 1, b = M(lz) >> 1, seam = shade(c, 0.84), ax = a >= b;
  w.box(X - a, 10, Z - b, X + a, 11, Z + b, c);
  if (ax) for (let k = -b + 4; k <= b - 2; k += 4) w.box(X - a, 11, Z + k, X + a, 11, Z + k, seam);
  else for (let k = -a + 4; k <= a - 2; k += 4) w.box(X + k, 11, Z - b, X + k, 11, Z + b, seam);
  w.box(X - a + 1, 8, Z - b + 1, X + a - 1, 9, Z - b + 1, leg).box(X - a + 1, 8, Z + b - 1, X + a - 1, 9, Z + b - 1, leg).box(X - a + 1, 8, Z - b + 1, X - a + 1, 9, Z + b - 1, leg).box(X + a - 1, 8, Z - b + 1, X + a - 1, 9, Z + b - 1, leg);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const xa = sx < 0 ? X - a + 1 : X + a - 2, za = sz < 0 ? Z - b + 1 : Z + b - 2; w.box(xa, 0, za, xa + 1, 9, za + 1, leg); }
  if (ax) w.box(X - a + 3, 2, Z, X + a - 3, 2, Z, leg).box(X - a + 1, 2, Z - b + 3, X - a + 2, 2, Z + b - 3, leg).box(X + a - 2, 2, Z - b + 3, X + a - 1, 2, Z + b - 3, leg);
  else w.box(X, 2, Z - b + 3, X, 2, Z + b - 3, leg).box(X - a + 3, 2, Z - b + 1, X + a - 3, 2, Z - b + 2, leg).box(X - a + 3, 2, Z + b - 2, X + a - 3, 2, Z + b - 1, leg);
  if (o.cloth != null) {
    const k = Math.max(1, Math.round((ax ? b : a) * 0.4));
    if (ax) w.box(X - a, 11, Z - k, X + a, 11, Z + k, o.cloth).box(X - a - 1, 7, Z - k, X - a - 1, 11, Z + k, o.cloth).box(X + a + 1, 7, Z - k, X + a + 1, 11, Z + k, o.cloth);
    else w.box(X - k, 11, Z - b, X + k, 11, Z + b, o.cloth).box(X - k, 7, Z - b - 1, X + k, 11, Z - b - 1, o.cloth).box(X - k, 7, Z + b + 1, X + k, 11, Z + b + 1, o.cloth);
  }
}
/**
 * Candles on a brass dish (y0 in blocks: the surface it stands on), melted wax heaped round the feet. n = 1..3 makes a cluster
 * of stepped heights in a row on one long dish; holder: null = no dish.
 */
export function candle(w: W, x: number, z: number, h: number, wax: number, flame: number, y0 = 0, o: { n?: number; holder?: number | null } = {}) {
  const X = M(x), Z = M(z), n = Math.max(1, Math.min(3, o.n ?? 1)), hold = o.holder === undefined ? BRASS : o.holder;
  let base = y0;
  const spots: Array<[number, number, number]> = n === 1 ? [[0, 0, h]] : n === 2 ? [[-1, 0, h], [1, 0, Math.max(2, h - 1)]] : [[-2, 0, Math.max(2, h - 1)], [0, 0, h], [2, 0, Math.max(2, h - 2)]];
  if (hold != null) {
    const r = n === 3 ? 3 : n === 2 ? 2 : 1; w.box(X - r, y0, Z - 1, X + r, y0, Z + 1, hold); base = y0 + 1;
  }
  // melted wax heaped round the feet: a plus round a lone candle, one low ridge under a row
  if (n === 1) w.set(X - 1, base, Z, wax).set(X + 1, base, Z, wax).set(X, base, Z - 1, wax).set(X, base, Z + 1, wax);
  else w.box(X + spots[0][0], base, Z, X + spots[spots.length - 1][0], base, Z, wax);
  for (const [dx, dz, hh] of spots) w.box(X + dx, base, Z + dz, X + dx, base + hh - 1, Z + dz, wax).set(X + dx, base + hh, Z + dz, flame, 1);
}
/** a standing candle-stand: stepped foot, stem with a knop, a cross-arm with three candles on cups; returns the middle flame (metres) */
export function candelabra(w: W, x: number, z: number, h: number, iron: number, wax: number, flame: number, o: { alongX?: boolean } = {}) {
  const X = M(x), Z = M(z), H = M(h), ax = o.alongX !== false, P = (d: number): [number, number] => ax ? [X + d, Z] : [X, Z + d];
  w.box(X - 2, 0, Z - 2, X + 2, 0, Z + 2, iron).box(X - 1, 1, Z - 1, X + 1, 1, Z + 1, iron).box(X, 2, Z, X, H, Z, iron).box(X - 1, H >> 1, Z - 1, X + 1, (H >> 1) + 1, Z + 1, iron);
  const [ax0, az0] = P(-4), [ax1, az1] = P(4); w.box(ax0, H, az0, ax1, H, az1, iron);
  for (const d of [-4, 0, 4]) { const [cx, cz] = P(d), hh = d === 0 ? 4 : 3; w.set(cx, H + 1, cz, BRASS).box(cx, H + 2, cz, cx, H + 1 + hh, cz, wax).set(cx, H + 2 + hh, cz, flame, 1); }
  return [x, (H + 6) * CELL, z] as [number, number, number];
}
/** bones lying flat: two long bones crossed (1-cell shafts with two-cell knuckled ends) and a small skull beside them */
export function bones(w: W, x: number, z: number, bone: number, s = 1) {
  const X = M(x), Z = M(z), L = Math.max(2, Math.round(4 * s)), L2 = Math.max(2, Math.round(3 * s)), cx = X - 2;
  w.box(X - L, 0, Z, X + L, 0, Z, bone).box(X - L - 1, 0, Z - 1, X - L, 1, Z + 1, bone).box(X + L, 0, Z - 1, X + L + 1, 1, Z + 1, bone);
  w.box(cx, 0, Z - L2, cx, 0, Z + L2, bone).box(cx - 1, 0, Z - L2 - 1, cx + 1, 1, Z - L2, bone).box(cx - 1, 0, Z + L2, cx + 1, 1, Z + L2 + 1, bone);
  const sx = X + L - 1, sz = Z + 3;
  w.box(sx - 1, 0, sz, sx + 1, 2, sz + 2, bone).box(sx - 1, 3, sz, sx + 1, 3, sz + 1, bone).set(sx - 1, 1, sz + 2, DARK).set(sx + 1, 1, sz + 2, DARK);
}
/** a skull (5 blocks wide) resting at height y0 (blocks): jaw, cheek row with a nose hole, two recessed eye sockets, a stepped dome; face = the way it looks */
export function skull(w: W, x: number, z: number, y0: number, bone: number, o: { face?: Dir } = {}) {
  const F = facing(w, M(x), M(z), o.face ?? 's');
  F.box(-1, y0, -1, 1, y0, 2, bone);
  F.box(-2, y0 + 1, -2, 2, y0 + 3, 2, bone);
  F.box(-1, y0 + 4, -2, 1, y0 + 4, 1, bone);
  F.set(0, y0 + 1, 2, DARK);
  for (const dx of [-1, 1]) { F.set(dx, y0 + 2, 2, null); F.set(dx, y0 + 2, 1, DARK); }
}
/** a column: two-tier base, shaft with notched corners and recessed drum joints, necking, echinus and abacus; broken = a three-step break and a fallen drum */
export function pillar(w: W, x: number, z: number, h: number, c: number, cap: number, o: { r?: number; broken?: boolean; seed?: number } = {}) {
  const X = M(x), Z = M(z), r = o.r ?? 4, H = M(h), JT = 10;
  w.box(X - r - 2, -2, Z - r - 2, X + r + 2, 1, Z + r + 2, cap); nsq(w, X, Z, r + 1, 2, 3, cap);
  const top = o.broken ? Math.max(8, H - 7) : H - 1;
  nsq(w, X, Z, r, 4, top, c);
  for (let y = 4 + JT; y < top - 3; y += JT) { nsq(w, X, Z, r, y, y, null); nsq(w, X, Z, r - 1, y, y, shade(c, 0.9)); }
  if (!o.broken) { nsq(w, X, Z, r, H, H, shade(cap, 0.92)); nsq(w, X, Z, r + 1, H + 1, H + 1, cap); w.box(X - r - 2, H + 2, Z - r - 2, X + r + 2, H + 3, Z + r + 2, cap); return; }
  const sd = o.seed ?? X * 7 + Z, sx = hash(sd, 1) < 0.5 ? 1 : -1, sz = hash(sd, 2) < 0.5 ? 1 : -1, k = Math.max(2, Math.round(r * 0.6));
  w.box(sx > 0 ? X - r + k : X - r, top + 1, Z - r + 1, sx > 0 ? X + r : X + r - k, top + 4, Z + r - 1, c);
  w.box(sx > 0 ? X + 1 : X - r, top + 5, sz > 0 ? Z + 1 : Z - r + 1, sx > 0 ? X + r : X - 1, top + 7, sz > 0 ? Z + r - 1 : Z - 1, c);
  // the fallen drum lies on the far side from the battle floor
  const side = X > 0 ? 1 : -1, d0 = X + side * (r + 4), d1 = d0 + side * (JT - 1), mx = ((d0 + d1) / 2) * CELL;
  if (!inPlay(mx, z) && Math.abs(mx) < AREA.x1 - 0.3) w.box(d0, 0, Z - r + 1, d1, 2 * r, Z + r - 1, c).box(d0, 1, Z - r, d1, 2 * r - 1, Z + r, c).box(d0, r, Z - r, d1, r, Z + r, null).box(d0, r, Z - r + 1, d1, r, Z + r - 1, shade(c, 0.9));
}
/** a web in a frame: straight strands (a cross and two square rings), between two anchor points on a vertical plane (superseded by the web card; kept for old callers) */
export function web(w: W, x: number, z: number, y0: number, s: number, alongX: boolean, c: number) {
  const X = M(x), Z = M(z), put = (a: number, y: number) => (alongX ? w.set(X + a, y, Z, c) : w.set(X, y, Z + a, c));
  for (let i = -s; i <= s; i++) { put(i, y0 + s); put(0, y0 + s + i); }
  for (const r of [Math.round(s * 0.45), Math.round(s * 0.85)]) for (let i = -r; i <= r; i++) { put(i, y0 + s - r); put(i, y0 + s + r); put(-r, y0 + s + i); put(r, y0 + s + i); }
}
/** a clutch of spider eggs on a silk mat: one big egg and two smaller ones (skipped on the battle floor), each three stacked tiers with a silk band, a glowing seam down the front */
export function eggSac(w: W, x: number, z: number, s: number, c: number, glowC: number) {
  const X = M(x), Z = M(z), r2 = Math.max(2, s - 1);
  const egg = (ex: number, ez: number, r: number) => {
    nsq(w, ex, ez, Math.max(1, r - 1), 1, 1, c); nsq(w, ex, ez, r, 2, 2 * r, c); nsq(w, ex, ez, Math.max(1, r - 1), 2 * r + 1, 2 * r + 1, c); if (r >= 3) nsq(w, ex, ez, r - 2, 2 * r + 2, 2 * r + 2, c);
    nsq(w, ex, ez, r, r + 3, r + 3, shade(c, 1.1));   // a band of silk wrapped round it
    w.box(ex, r, ez + r, ex, r + 2, ez + r, glowC, 1);
  };
  const eggs = ([[X, Z, s], [X + s + r2, Z + 1, r2], [X - s - r2 + 1, Z + 2, r2]] as Array<[number, number, number]>).filter(([ex, ez, r]) => r === s || !inPlay(ex * CELL, ez * CELL));
  const mx0 = Math.min(...eggs.map(([ex, , r]) => ex - r)) - 2, mx1 = Math.max(...eggs.map(([ex, , r]) => ex + r)) + 2, mz0 = Math.min(...eggs.map(([, ez, r]) => ez - r)) - 1, mz1 = Math.max(...eggs.map(([, ez, r]) => ez + r)) + 2;
  w.box(mx0, 0, mz0, mx1, 0, mz1, shade(c, 0.86));
  for (const [ex, ez, r] of eggs) egg(ex, ez, r);
}
/** a sarcophagus: plinth, chest with sunk panels, an overhanging lid with a chamfer tier, and a recumbent figure in right-angled blocks (pillow, head, chest, legs, feet, hands on a sword) */
export function sarcophagus(w: W, x: number, z: number, alongX: boolean, stone: number, lid: number, o: { effigy?: boolean } = {}) {
  const X = M(x), Z = M(z), A = 13, B = 6, lit = shade(lid, 1.1);
  const P = (l: number, d: number): [number, number] => alongX ? [X + l, Z + d] : [X + d, Z + l];
  const bx = (l0: number, y0: number, d0: number, l1: number, y1: number, d1: number, c: number | null) => { const [a, b] = P(l0, d0), [p, q] = P(l1, d1); w.box(a, y0, b, p, y1, q, c); };
  bx(-A - 1, -1, -B - 1, A + 1, 1, B + 1, shade(stone, 0.8));
  bx(-A, 2, -B, A, 7, B, stone);
  for (const s of [-1, 1]) { bx(-A + 2, 3, s * B, -1, 6, s * B, null); bx(1, 3, s * B, A - 2, 6, s * B, null); bx(s * A, 3, -B + 2, s * A, 6, B - 2, null); }
  bx(-A - 1, 8, -B - 1, A + 1, 9, B + 1, lid);
  bx(-A, 10, -B, A, 10, B, lid);
  if (o.effigy === false) return;
  bx(-A + 1, 11, -3, -A + 5, 11, 3, shade(lid, 0.9));
  bx(-A + 2, 12, -2, -A + 5, 13, 2, lit);
  bx(-A + 6, 11, -4, -A + 14, 12, 4, lid);
  bx(-A + 15, 11, -3, A - 4, 12, 3, lid);
  bx(A - 3, 11, -3, A - 2, 13, -1, lit); bx(A - 3, 11, 1, A - 2, 13, 3, lit);
  bx(-A + 9, 13, -1, -A + 11, 13, 1, lit);
  bx(-A + 12, 13, -2, -A + 12, 13, 2, lit);
  bx(-A + 13, 13, 0, A - 5, 13, 0, lit);
}
/**
 * An iron grille in one plane (so a doorway can be cut with a one-cell-thick null box): two-cell top and bottom rails, end posts,
 * bars every `gap` cells, a cross rail at ~40% height with a lighter rivet on every bar.
 */
export function bars(w: W, x0: number, z0: number, x1: number, z1: number, h: number, iron: number, o: { gap?: number } = {}) {
  const X0 = M(x0), X1 = M(x1), Z0 = M(z0), Z1 = M(z1), H = M(h), alongX = Math.abs(X1 - X0) > Math.abs(Z1 - Z0), n = alongX ? X1 - X0 : Z1 - Z0;
  const N = Math.abs(n), st = n >= 0 ? 1 : -1, gap = o.gap ?? 3, lite = shade(iron, 1.5), ym = Math.round(H * 0.42);
  for (let k = 0; k <= N; k++) {
    const x = alongX ? X0 + k * st : X0, z = alongX ? Z0 : Z0 + k * st, end = k <= 1 || k >= N - 1, bar = !end && k % gap === 0;
    if (end) w.box(x, 0, z, x, H + 1, z, iron); else if (bar) w.box(x, 2, z, x, H - 2, z, iron);
    w.box(x, 0, z, x, 1, z, iron).box(x, H - 1, z, x, H, z, iron).set(x, ym, z, bar ? lite : iron);
  }
}
/** a fire post: stone footing, banded post, four short brackets under an iron bowl of embers and flame; returns the flame point (metres) */
export function torchPost(w: W, x: number, z: number, h: number, wood: number, fire: number) {
  const X = M(x), Z = M(z), H = M(h), ir = 0x2c2a32;
  w.box(X - 2, -2, Z - 2, X + 2, 0, Z + 2, shade(wood, 0.75)).box(X - 1, 1, Z - 1, X + 1, H, Z + 1, wood);
  for (const y of [Math.round(H * 0.35), H - 3]) w.box(X - 1, y, Z - 1, X + 1, y, Z + 1, ir);
  w.box(X - 2, H - 1, Z, X + 2, H, Z, ir).box(X, H - 1, Z - 2, X, H, Z + 2, ir);
  w.box(X - 2, H + 1, Z - 2, X + 2, H + 1, Z + 2, ir);
  nsq(w, X, Z, 3, H + 2, H + 3, ir); nsq(w, X, Z, 2, H + 3, H + 3, shade(fire, 0.55), 1);
  w.box(X - 1, H + 4, Z - 1, X + 1, H + 5, Z + 1, fire, 1).set(X, H + 6, Z, fire, 1);
  return [x, (H + 5) * CELL, z] as [number, number, number];
}
/** a brazier: four (or three) legs with feet and a brace ring, a round-ish bowl, coal, a ring of embers and the flame; returns the flame point */
export function brazier(w: W, x: number, z: number, iron: number, fire: number, o: { legs?: 3 | 4 } = {}) {
  const X = M(x), Z = M(z), legs: Array<[number, number]> = o.legs === 3 ? [[-3, 2], [3, 2], [0, -3]] : [[-3, -3], [3, -3], [-3, 3], [3, 3]];
  for (const [dx, dz] of legs) w.box(X + dx, 0, Z + dz, X + dx, 7, Z + dz, iron).set(X + dx + Math.sign(dx), 0, Z + dz + (dx ? 0 : Math.sign(dz)), iron);
  w.box(X - 3, 3, Z - 3, X + 3, 3, Z - 3, iron).box(X - 3, 3, Z + 3, X + 3, 3, Z + 3, iron).box(X - 3, 3, Z - 3, X - 3, 3, Z + 3, iron).box(X + 3, 3, Z - 3, X + 3, 3, Z + 3, iron);
  nsq(w, X, Z, 3, 8, 8, iron); nsq(w, X, Z, 4, 9, 11, iron); nsq(w, X, Z, 3, 10, 11, null);
  nsq(w, X, Z, 3, 10, 10, 0x2a1a18); nsq(w, X, Z, 2, 11, 11, shade(fire, 0.6), 1);
  w.box(X - 1, 12, Z - 1, X + 1, 13, Z + 1, fire, 1).set(X, 14, Z, fire, 1);
  return [x, 14 * CELL, z] as [number, number, number];
}
/** a rail fence along x (or along z with alongZ: then x0/x1 are z positions and z is the x position): capped posts, two rails, gaps where broken */
export function fence(w: W, x0: number, z: number, x1: number, wood: number, o: { alongZ?: boolean; broken?: number; seed?: number } = {}) {
  const R = o.alongZ ? run(w, z, x0, z, x1) : run(w, x0, z, x1, z), capC = shade(wood, 1.2), rail = shade(wood, 1.1), sd = o.seed ?? 1;
  for (let u = 0; u <= R.len; u++) {
    const seg = Math.floor(u / 12);
    if ((u % 12) === 0) { R.box(u, -2, 0, u + 1, 12, 1, wood); R.box(u - 1, 13, -1, u + 2, 13, 2, capC); R.box(u, 14, 0, u + 1, 14, 1, capC); }
    else {
      if (!(o.broken && hash(seg, sd, 1) < o.broken)) R.box(u, 9, 2, u, 10, 2, rail);
      if (!(o.broken && hash(seg, sd, 2) < o.broken * 0.6)) R.box(u, 4, 2, u, 5, 2, rail);
    }
  }
}
/**
 * A grave marker; kind (0..1) picks the type: < 0.25 a round-headed stone in three wide steps with a sunk panel and raised cross,
 * < 0.5 a stele on a stepped plinth with a gable and a name plate, < 0.75 a cross on a stepped base with flared ends, else an
 * obelisk in three tiers. mound = colour of an earth mound in front.
 */
export function grave(w: W, x: number, z: number, s: number, stone: number, kind: number, engrave = 0x3a3a4a, o: { mound?: number } = {}) {
  const X = M(x), Z = M(z), H = Math.round(16 * s), Wd = Math.max(3, Math.round(5 * s)), base = shade(stone, 0.8);
  w.box(X - Wd - 2, -2, Z - 3, X + Wd + 2, 0, Z + 3, base);
  if (kind < 0.25) {
    w.box(X - Wd, 1, Z - 1, X + Wd, H - 4, Z + 1, stone).box(X - Wd + 1, H - 3, Z - 1, X + Wd - 1, H - 2, Z + 1, stone).box(X - Wd + 3, H - 1, Z - 1, X + Wd - 3, H, Z + 1, stone);
    w.box(X - Wd + 2, 3, Z + 1, X + Wd - 2, H - 5, Z + 1, null).box(X - Wd + 2, 3, Z, X + Wd - 2, H - 5, Z, engrave);
    const cy = H - 9; w.box(X, 5, Z + 1, X, H - 6, Z + 1, stone).box(X - 2, cy, Z + 1, X + 2, cy, Z + 1, stone);
  } else if (kind < 0.5) {
    w.box(X - Wd - 1, 1, Z - 2, X + Wd + 1, 2, Z + 2, base);
    w.box(X - Wd + 1, 3, Z - 1, X + Wd - 1, H - 3, Z + 1, stone).box(X - Wd, H - 2, Z - 2, X + Wd, H - 2, Z + 2, shade(stone, 1.08));
    w.box(X - Wd + 2, H - 1, Z - 1, X + Wd - 2, H - 1, Z + 1, stone).box(X - 1, H, Z - 1, X + 1, H + 1, Z + 1, stone);
    const py = Math.round(H * 0.45); w.box(X - Wd + 3, py, Z + 1, X + Wd - 3, py + 3, Z + 1, null).box(X - Wd + 3, py, Z, X + Wd - 3, py + 3, Z, engrave);
  } else if (kind < 0.75) {
    w.box(X - 3, 1, Z - 2, X + 3, 2, Z + 2, base);
    w.box(X - 1, 3, Z - 1, X + 1, H + 2, Z + 1, stone);
    const ay = Math.round((H + 3) * 0.64);
    w.box(X - Wd - 1, ay, Z - 1, X + Wd + 1, ay + 2, Z + 1, stone);
    w.box(X - Wd - 2, ay - 1, Z - 1, X - Wd - 1, ay + 3, Z + 1, stone).box(X + Wd + 1, ay - 1, Z - 1, X + Wd + 2, ay + 3, Z + 1, stone).box(X - 2, H + 1, Z - 1, X + 2, H + 2, Z + 1, stone);
  } else {
    w.box(X - 4, 1, Z - 4, X + 4, 2, Z + 4, base).box(X - 3, 3, Z - 3, X + 3, 4, Z + 3, stone);
    const t1 = Math.round(H * 0.62);
    w.box(X - 2, 5, Z - 2, X + 2, t1, Z + 2, stone).box(X - 1, t1 + 1, Z - 1, X + 1, H + 1, Z + 1, stone).box(X, H + 2, Z, X, H + 3, Z, stone);
    w.box(X - 1, Math.round(H * 0.3), Z + 2, X + 1, Math.round(H * 0.3) + 2, Z + 2, engrave);
  }
  if (o.mound != null) w.box(X - Wd, 0, Z + 4, X + Wd, 1, Z + 4 + 2 * Wd, o.mound).box(X - Wd + 2, 2, Z + 6, X + Wd - 2, 2, Z + 2 + 2 * Wd, shade(o.mound, 1.1));
}

// ------------------------------------------------------------------ furniture, clutter and village pieces (new; use freely)
/**
 * A bookshelf against a wall. (x, z) = middle of its back, face = the way its open front looks, len and h in metres. Carcass in
 * `wood` (sides, cornice, recessed kick plinth, a divider about every 1.2 m), shelves in `trim`. Books stand in runs of one colour
 * (the `books` colours cycle, two heights alternate, each run with a lighter band across the spines); now and then a run is a short
 * stack lying flat. No per-book random colour.
 */
export function bookshelf(w: W, x: number, z: number, len: number, h: number, face: Dir, wood: number, trim?: number, o: { books?: number[]; depth?: number; seed?: number } = {}) {
  const F = facing(w, M(x), M(z), face), L = M(len) >> 1, H = M(h), D = o.depth ?? 5, tr = trim ?? shade(wood, 1.22), books = o.books ?? [0x6a3432, 0x36405e, 0x4c5632], sd = o.seed ?? 3, SH = 9;
  F.box(-L, 0, 0, L, H, 0, shade(wood, 0.78));
  F.box(-L, 0, 0, -L + 1, H, D, wood); F.box(L - 1, 0, 0, L, H, D, wood);
  F.box(-L - 1, H + 1, 0, L + 1, H + 2, D + 1, tr); F.box(-L, 0, 0, L, 1, D - 1, wood);
  const nd = Math.max(0, Math.round((2 * L) / 17) - 1), divs = Array.from({ length: nd }, (_, i) => -L + Math.round(((i + 1) * 2 * L) / (nd + 1)));
  for (const d of divs) F.box(d, 2, 0, d + 1, H, D, wood);
  const edges = [-L + 1, ...divs.flatMap(d => [d, d + 1]), L - 1];
  let ri = sd * 5;
  for (let y = 2, k = 0; y + SH <= H; y += SH, k++) {
    F.box(-L + 2, y, 0, L - 2, y, D, tr);
    for (let bi = 0; bi < edges.length; bi += 2) {
      const s0 = edges[bi] + 1, s1 = edges[bi + 1] - 1;
      for (let cx = s0; cx <= s1; ri++) {
        const col = books[ri % books.length], rl = 3 + Math.floor(hash(ri, sd) * 4), bh = ri % 2 ? SH - 2 : SH - 3;
        if (hash(ri, sd, 7) < 0.16 && s1 - cx >= 5) { F.box(cx, y + 1, 1, cx + 4, y + 1, D - 2, col); F.box(cx, y + 2, 1, cx + 3, y + 2, D - 2, books[(ri + 1) % books.length]); cx += 6; continue; }
        const e = Math.min(s1, cx + rl - 1);
        F.box(cx, y + 1, 1, e, y + bh, D - 2, col); F.box(cx, y + bh - 1, D - 2, e, y + bh - 1, D - 2, shade(col, 1.4));
        cx = e + 1 + (hash(ri, sd, 9) < 0.15 ? 1 : 0);
      }
    }
  }
  F.box(-L + 2, H - 1, 0, L - 2, H - 1, D, tr);
}
/** a chair whose sitter looks `face`: seat, four legs with side stretchers, a back of two rails and a splat between tall back legs */
export function chair(w: W, x: number, z: number, face: Dir, wood: number, o: { dark?: number } = {}) {
  const F = facing(w, M(x), M(z), face), dk = o.dark ?? shade(wood, 0.78);
  F.box(-3, 6, -3, 3, 6, 3, wood);
  for (const dx of [-3, 3]) { F.box(dx, 0, 3, dx, 5, 3, dk); F.box(dx, 0, -3, dx, 14, -3, dk); F.box(dx, 2, -2, dx, 2, 2, dk); }
  F.box(-2, 9, -3, 2, 9, -3, wood); F.box(-2, 13, -3, 2, 14, -3, wood); F.box(0, 7, -3, 0, 12, -3, wood);
}
/** a bench along x (alongX) or z: seat over slab legs with a stretcher; back = +1 / −1 adds a pew backrest on that side */
export function bench(w: W, x: number, z: number, len: number, alongX: boolean, wood: number, leg?: number, o: { back?: 1 | -1; depth?: number } = {}) {
  const X = M(x), Z = M(z), L = M(len) >> 1, Dp = o.depth ?? 3, lg = leg ?? shade(wood, 0.8);
  const P = (l: number, d: number): [number, number] => alongX ? [X + l, Z + d] : [X + d, Z + l];
  const bx = (l0: number, y0: number, d0: number, l1: number, y1: number, d1: number, c: number) => { const [a, b] = P(l0, d0), [p, q] = P(l1, d1); w.box(a, y0, b, p, y1, q, c); };
  bx(-L, 6, -Dp, L, 6, Dp, wood); bx(-L + 1, 5, -Dp + 1, L - 1, 5, -Dp + 1, lg); bx(-L + 1, 5, Dp - 1, L - 1, 5, Dp - 1, lg);
  const legs = [-L + 1, L - 2, ...(L > 20 ? [-1] : [])];
  for (const l of legs) { bx(l, 1, -Dp + 1, l + 1, 4, Dp - 1, lg); bx(l, 0, -Dp, l + 1, 0, Dp, lg); }
  bx(-L + 3, 2, 0, L - 3, 2, 0, lg);
  if (o.back) { const s = o.back * Dp; bx(-L, 7, s, L, 12, s, wood); bx(-L, 9, s, L, 9, s, shade(wood, 0.82)); bx(-L - 1, 13, s - o.back, L + 1, 13, s, lg); bx(-L, 0, s, -L + 1, 12, s, lg); bx(L - 1, 0, s, L, 12, s, lg); }
}
/**
 * A cloth banner hanging flat in front of a wall. (x, z) = the cell just in front of the wall face, face = the way the banner looks,
 * top at y metres, wd × h metres: a rod with end knobs, cloth with a trim border, a swallow-tail foot (a rectangular notch), and an
 * emblem: a shield with a point in two wide steps and a band across it; glow makes the emblem glow (soul / curse banners).
 */
export function banner(w: W, x: number, z: number, y: number, wd: number, h: number, face: Dir, cloth: number, trim: number, o: { rod?: number; emblem?: number; glow?: boolean; tail?: boolean } = {}) {
  const F = facing(w, M(x), M(z), face), Y = M(y), A = Math.max(3, M(wd) >> 1), Hc = M(h), rod = o.rod ?? IRON_M, em = o.emblem ?? trim, g = o.glow ? 1 : 0, yb = Y - Hc;
  F.box(-A - 2, Y, 0, A + 2, Y, 0, rod); F.box(-A - 3, Y - 1, 0, -A - 3, Y + 1, 0, rod); F.box(A + 3, Y - 1, 0, A + 3, Y + 1, 0, rod);
  F.box(-A, yb, 0, A, Y - 1, 0, cloth);
  F.box(-A, yb, 0, -A, Y - 1, 0, trim); F.box(A, yb, 0, A, Y - 1, 0, trim); F.box(-A, Y - 2, 0, A, Y - 1, 0, trim);
  if (o.tail !== false) { const t = Math.max(1, Math.round(A / 3)); F.box(-t, yb, 0, t, yb + 3, 0, null); F.box(-t - 1, yb, 0, -t - 1, yb + 4, 0, trim); F.box(t + 1, yb, 0, t + 1, yb + 4, 0, trim); F.box(-t, yb + 4, 0, t, yb + 4, 0, trim); F.box(-A, yb, 0, -t - 1, yb, 0, trim); F.box(t + 1, yb, 0, A, yb, 0, trim); }
  else F.box(-A, yb, 0, A, yb, 0, trim);
  const ec = Y - 3 - Math.round(Hc * 0.35), er = Math.max(2, Math.round(A * 0.55));
  F.box(-er, ec - er + 2, 0, er, ec + er, 0, em, g); F.box(-er + 1, ec - er + 1, 0, er - 1, ec - er + 1, 0, em, g); F.box(-er + 2, ec - er, 0, er - 2, ec - er, 0, em, g);
  F.box(-er, ec + 1, 0, er, ec + 1, 0, cloth);
}
/** a hanging candle ring at height y (metres): notched square ring of half-size r on a cross and hub, eight candles, a two-tone link chain up to `top` (metres); returns the light point */
export function chandelier(w: W, x: number, z: number, y: number, r: number, iron: number, wax: number, flame: number, o: { top?: number } = {}) {
  const X = M(x), Z = M(z), Y = M(y), T = M(o.top ?? y + 1.6), lite = shade(iron, 1.45);
  w.box(X - r, Y, Z - r + 1, X - r, Y, Z + r - 1, iron).box(X + r, Y, Z - r + 1, X + r, Y, Z + r - 1, iron).box(X - r + 1, Y, Z - r, X + r - 1, Y, Z - r, iron).box(X - r + 1, Y, Z + r, X + r - 1, Y, Z + r, iron);
  w.box(X - r + 1, Y, Z, X + r - 1, Y, Z, iron).box(X, Y, Z - r + 1, X, Y, Z + r - 1, iron).box(X - 1, Y - 1, Z - 1, X + 1, Y + 1, Z + 1, iron).box(X, Y - 3, Z, X, Y - 2, Z, iron).set(X, Y - 4, Z, lite);
  const h2 = r >> 1;
  for (const [dx, dz] of [[-r, -h2], [-r, h2], [r, -h2], [r, h2], [-h2, -r], [h2, -r], [-h2, r], [h2, r]]) w.box(X + dx, Y + 1, Z + dz, X + dx, Y + 2, Z + dz, wax).set(X + dx, Y + 3, Z + dz, flame, 1);
  for (let yy = Y + 2; yy <= T; yy++) w.set(X, yy, Z, Math.floor((yy - Y) / 2) % 2 ? lite : iron);
  return [x, (Y + 3) * CELL, z] as [number, number, number];
}
/**
 * A lantern hanging at height y (metres, its base): iron base and cap, a glass body (glowing plus-shaped core, iron corner posts), a
 * ring; chain up to `top`. post = colour of a standing post with an arm to hang it from (set back opposite `face`). Returns the light point.
 */
export function lantern(w: W, x: number, z: number, y: number, iron: number, light: number, o: { top?: number; post?: number; face?: Dir } = {}) {
  const X = M(x), Z = M(z), Y = M(y), lite = shade(iron, 1.45);
  w.box(X - 1, Y, Z - 1, X + 1, Y, Z + 1, iron).box(X - 1, Y + 4, Z - 1, X + 1, Y + 4, Z + 1, iron).set(X, Y + 5, Z, iron).set(X, Y + 6, Z, lite);
  w.box(X - 1, Y + 1, Z, X + 1, Y + 3, Z, light, 1).box(X, Y + 1, Z - 1, X, Y + 3, Z + 1, light, 1);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) w.box(X + dx, Y + 1, Z + dz, X + dx, Y + 3, Z + dz, iron);
  if (o.post != null) {
    const F = facing(w, X, Z, o.face ?? 's'), top = Y + 9;
    F.box(-1, -2, -7, 0, top + 1, -6, o.post); F.box(-2, top + 2, -8, 1, top + 2, -5, shade(o.post, 1.15));
    F.box(0, top, -5, 0, top, 0, iron); F.box(0, top - 1, -5, 0, top - 1, -5, iron);
    F.box(0, Y + 7, 0, 0, top - 1, 0, iron);
  } else if (o.top != null) for (let yy = Y + 7; yy <= M(o.top); yy++) w.set(X, yy, Z, Math.floor((yy - Y) / 2) % 2 ? lite : iron);
  return [x, (Y + 2) * CELL, z] as [number, number, number];
}
/** a pile of grain sacks (n = 1..5): two lying side by side, an upright one with a tied neck beside them, more on top; two cloth tones */
export function sacks(w: W, x: number, z: number, n: number, cloth: number, tie: number, o: { face?: Dir } = {}) {
  const F = facing(w, M(x), M(z), o.face ?? 's'), dk = shade(cloth, 0.86);
  const up = (dx: number, dz: number, c: number) => { F.box(dx - 2, 0, dz - 1, dx + 2, 0, dz + 1, c); F.box(dx - 2, 1, dz - 2, dx + 2, 4, dz + 1, c); F.box(dx - 1, 5, dz - 1, dx + 1, 5, dz, c); F.box(dx - 1, 6, dz - 1, dx, 6, dz, tie); F.box(dx - 1, 7, dz, dx + 1, 7, dz, c); };
  const lie = (dx: number, y: number, dz: number, c: number) => { F.box(dx - 3, y, dz - 2, dx + 3, y + 3, dz + 1, c); F.box(dx - 3, y, dz - 2, dx - 3, y, dz + 1, shade(c, 0.9)); F.box(dx + 4, y + 1, dz - 1, dx + 4, y + 2, dz, tie); F.box(dx + 5, y + 1, dz - 1, dx + 5, y + 2, dz, c); };
  if (n <= 1) { up(0, 0, cloth); return; }
  lie(-1, 0, 0, cloth); lie(-1, 0, -4, dk);
  if (n >= 3) up(7, -1, dk);
  if (n >= 4) lie(-1, 4, -2, cloth);
  if (n >= 5) up(-8, -1, cloth);
}
/** a clay pot or urn: stepped foot, wide belly with a painted band, shoulder, a rim with a dark mouth (or a lid); s = 1 small, 2 large */
export function pot(w: W, x: number, z: number, s: number, clay: number, band: number, o: { y0?: number; lid?: number } = {}) {
  const X = M(x), Z = M(z), y0 = o.y0 ?? 0, dk = shade(clay, 0.82);
  if (s <= 1) {
    nsq(w, X, Z, 1, y0, y0, dk); nsq(w, X, Z, 2, y0 + 1, y0 + 3, clay); nsq(w, X, Z, 2, y0 + 2, y0 + 2, band); nsq(w, X, Z, 1, y0 + 4, y0 + 4, clay); nsq(w, X, Z, 2, y0 + 5, y0 + 5, clay);
    if (o.lid != null) w.box(X - 1, y0 + 5, Z - 1, X + 1, y0 + 5, Z + 1, o.lid).set(X, y0 + 6, Z, o.lid); else w.box(X - 1, y0 + 5, Z - 1, X + 1, y0 + 5, Z + 1, clay).set(X, y0 + 5, Z, DARK);
  } else {
    nsq(w, X, Z, 2, y0, y0, dk); nsq(w, X, Z, 3, y0 + 1, y0 + 5, clay); nsq(w, X, Z, 3, y0 + 3, y0 + 3, band); nsq(w, X, Z, 2, y0 + 6, y0 + 6, clay); nsq(w, X, Z, 1, y0 + 7, y0 + 7, clay); nsq(w, X, Z, 2, y0 + 8, y0 + 8, clay);
    if (o.lid != null) w.box(X - 1, y0 + 8, Z - 1, X + 1, y0 + 9, Z + 1, o.lid); else w.box(X - 2, y0 + 8, Z - 2, X + 2, y0 + 8, Z + 2, clay).box(X - 1, y0 + 8, Z - 1, X + 1, y0 + 8, Z + 1, DARK);
  }
}
/**
 * A two-wheeled hand cart along x (alongX) or z: plank bed with side boards and corner stakes, two wheels (iron tyre, rim, plus
 * spokes, hub cap), shafts out the front end (+x / +z). load = colour of sacks heaped in it; broken = one wheel off and lying flat beside it.
 */
export function cart(w: W, x: number, z: number, alongX: boolean, wood: number, iron: number, o: { load?: number; broken?: boolean } = {}) {
  const X = M(x), Z = M(z), dk = shade(wood, 0.78), lt = shade(wood, 1.15);
  const P = (l: number, d: number): [number, number] => alongX ? [X + l, Z + d] : [X + d, Z + l];
  const bx = (l0: number, y0: number, d0: number, l1: number, y1: number, d1: number, c: number | null) => { const [a, b] = P(l0, d0), [p, q] = P(l1, d1); w.box(a, y0, b, p, y1, q, c); };
  bx(-13, 7, -8, 13, 8, 8, wood);
  for (const s of [-1, 1]) { bx(-13, 9, s * 8, 13, 12, s * 8, wood); bx(-13, 10, s * 8, 13, 10, s * 8, dk); }
  bx(-13, 9, -8, -13, 12, 8, wood); bx(13, 9, -8, 13, 10, 8, wood);
  for (const l of [-13, 0, 12]) for (const s of [-1, 1]) bx(l, 7, s * 8, l + 1, 14, s * 8, dk);
  bx(0, 5, -11, 1, 6, 11, iron);
  const wheel = (d0: number, flat: boolean) => {
    for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) {
      const aa = Math.abs(a), bb = Math.abs(b); if (aa >= 5 && bb >= 5) continue;
      const tyre = aa === 6 || bb === 6, rim = tyre || aa === 5 || bb === 5 || (aa === 4 && bb === 4), spoke = a === 0 || b === 0, hub = aa <= 1 && bb <= 1;
      if (!rim && !spoke) continue;
      const c = hub ? iron : tyre ? iron : rim ? dk : wood;
      if (flat) { const [p, q] = P(a + 3, d0 + b); w.box(p, 0, q, p, 0, q, c); } else for (const dd of [0, 1]) { const [p, q] = P(a, d0 + Math.sign(d0) * dd); w.set(p, 6 + b, q, c); }
    }
    if (!flat) { const [p, q] = P(0, d0 + Math.sign(d0) * 2); w.box(p, 5, q, p, 7, q, iron); }
  };
  wheel(-10, false);
  if (o.broken) { wheel(18, true); bx(-2, 0, 7, 3, 6, 10, dk); } else wheel(10, false);
  for (const s of [-1, 1]) bx(14, 7, s * 6, 30, 7, s * 6, lt);
  bx(30, 7, -6, 30, 7, 6, lt); bx(28, 0, -1, 28, 6, -1, dk);
  if (o.load != null) { const c2 = shade(o.load, 0.88); bx(-11, 9, -6, -3, 12, -1, o.load); bx(-11, 9, 1, -3, 12, 6, c2); bx(-1, 9, -5, 8, 11, 5, c2); bx(-8, 13, -3, 1, 15, 3, o.load); }
}
/** a signpost: post with a stepped cap and arrow boards pointing the given ways, each with an engraved line */
export function signpost(w: W, x: number, z: number, wood: number, board: number, o: { arms?: Dir[]; h?: number } = {}) {
  const X = M(x), Z = M(z), H = M(o.h ?? 1.9), arms = o.arms ?? ['e', 'w'], eng = shade(board, 0.6);
  w.box(X, -2, Z, X + 1, H, Z + 1, wood).box(X - 1, H + 1, Z - 1, X + 2, H + 1, Z + 2, shade(wood, 1.15)).box(X, H + 2, Z, X + 1, H + 2, Z + 1, shade(wood, 1.15));
  arms.forEach((d, i) => {
    const y = H - 4 - i * 5, sg = d === 'e' || d === 's' ? 1 : -1, ax = d === 'e' || d === 'w';
    const P = (l: number): [number, number] => ax ? [sg > 0 ? X + 1 + l : X - l, Z + 1] : [X + 1, sg > 0 ? Z + 1 + l : Z - l];
    for (let l = 1; l <= 11; l++) { const [p, q] = P(l), tip = l === 11; w.box(p, tip ? y : y - 1, q, p, tip ? y : y + 1, q, board); if (l >= 3 && l <= 8) w.set(p, y, q, eng); }
  });
}
/**
 * A village well: a round-ish coursed stone shaft (notched square), a lighter coping ring, dark water, two posts carrying a
 * windlass with a crank, a rope and bucket, and a gabled roof of three wide tile tiers. alongX = ridge axis.
 */
export function well(w: W, x: number, z: number, stone: number, wood: number, roof: number, o: { alongX?: boolean; water?: number } = {}) {
  const X = M(x), Z = M(z), ax = o.alongX !== false, P = (l: number, d: number): [number, number] => ax ? [X + l, Z + d] : [X + d, Z + l];
  const bx = (l0: number, y0: number, d0: number, l1: number, y1: number, d1: number, c: number | null) => { const [a, b] = P(l0, d0), [p, q] = P(l1, d1); w.box(a, y0, b, p, y1, q, c); };
  const inN = (dx: number, dz: number, r: number) => Math.abs(dx) <= r && Math.abs(dz) <= r && !(Math.abs(dx) === r && Math.abs(dz) === r);
  const ring = (r0: number, r1: number, y0: number, y1: number, c: number | null) => { for (let dx = -r1; dx <= r1; dx++) for (let dz = -r1; dz <= r1; dz++) if (inN(dx, dz, r1) && !inN(dx, dz, r0)) w.box(X + dx, y0, Z + dz, X + dx, y1, Z + dz, c); };
  ring(5, 8, -1, 7, stone); ring(7, 8, 3, 3, null); ring(5, 9, 8, 9, shade(stone, 1.12));
  nsq(w, X, Z, 5, -1, -1, o.water ?? 0x10202c);
  const rf = roof, rD = shade(roof, 0.78), dk = shade(wood, 0.8);
  for (const s of [-1, 1]) bx(s * 8 - (s > 0 ? 1 : 0), 10, -1, s * 8 + (s > 0 ? 0 : 1), 30, 0, wood);
  bx(-7, 22, -1, 7, 23, 0, dk); bx(9, 22, 0, 10, 22, 0, IRON_M); bx(10, 19, 0, 10, 21, 0, IRON_M);
  bx(0, 14, 0, 0, 21, 0, ROPE); bx(-1, 11, -1, 1, 13, 1, wood); bx(-1, 12, -1, 1, 12, 1, IRON_M);
  bx(-11, 31, -10, 11, 32, 10, rf); bx(-11, 31, -10, 11, 31, -10, rD); bx(-11, 31, 10, 11, 31, 10, rD);
  bx(-11, 33, -6, 11, 34, 6, rf); bx(-11, 33, -6, 11, 33, -6, rD); bx(-11, 33, 6, 11, 33, 6, rD);
  bx(-11, 35, -2, 11, 36, 2, rf); bx(-12, 37, -1, 12, 37, 1, rD);
}
/** hay bales (n = 1..3): blocks bound with two bands; two side by side, the third on top */
export function hay(w: W, x: number, z: number, n: number, hayC: number, band: number, o: { alongX?: boolean } = {}) {
  const X = M(x), Z = M(z), ax = o.alongX !== false;
  const bale = (dl: number, y: number, dd: number) => {
    const P = (l: number, d: number): [number, number] => ax ? [X + dl + l, Z + dd + d] : [X + dd + d, Z + dl + l];
    const [a, b] = P(-4, -3), [p, q] = P(4, 2); w.box(a, y, b, p, y + 4, q, hayC);
    for (const l of [-2, 2]) { const [c1, d1] = P(l, -3), [c2, d2] = P(l, 2); w.box(c1, y, d1, c2, y + 4, d2, band); }
    const [e1, f1] = P(-3, -2), [e2, f2] = P(3, 1); w.box(e1, y + 5, f1, e2, y + 5, f2, shade(hayC, 1.08));
  };
  bale(0, 0, 0); if (n >= 2) bale(0, 0, 7); if (n >= 3) bale(0, 6, 3);
}
/** a weapon rack against a wall (face = the way it looks): posts, top rail, a trough rail, a holder bar, three swords point-down and a spear, a shield hung beside it */
export function weaponRack(w: W, x: number, z: number, face: Dir, wood: number, iron: number, o: { shield?: number } = {}) {
  const F = facing(w, M(x), M(z), face), lite = mix(iron, 0xc8ccd8, 0.62);
  F.box(-9, 0, 0, -8, 18, 1, wood); F.box(8, 0, 0, 9, 18, 1, wood); F.box(-9, 17, 0, 9, 18, 1, wood); F.box(-9, 2, 0, 9, 3, 2, wood); F.box(-9, 11, 2, 9, 11, 2, shade(wood, 0.82));
  for (const dx of [-5, -2, 5]) { F.box(dx, 4, 1, dx, 12, 1, lite); F.box(dx - 1, 13, 1, dx + 1, 13, 1, iron); F.box(dx, 14, 1, dx, 15, 1, LEATHER); F.set(dx, 16, 1, iron); }
  F.box(2, 4, 1, 2, 22, 1, wood); F.box(1, 23, 1, 3, 23, 1, iron); F.box(2, 24, 1, 2, 26, 1, lite);
  const sc = o.shield ?? 0x6a2a2a;
  F.box(11, 5, 1, 17, 13, 1, sc); F.box(11, 5, 1, 11, 13, 1, iron); F.box(17, 5, 1, 17, 13, 1, iron); F.box(11, 13, 1, 17, 13, 1, iron); F.box(12, 5, 1, 16, 5, 1, iron); F.box(13, 8, 2, 15, 10, 2, lite);
}
/** a heap of fallen stone: a few big squared blocks in three layers (never gravel); s scales it, the seed mirrors / turns the layout */
export function rubble(w: W, x: number, z: number, s: number, cols: number[], o: { seed?: number } = {}) {
  const X = M(x), Z = M(z), sd = o.seed ?? X * 31 + Z, fx = hash(sd, 1) < 0.5 ? -1 : 1, sw = hash(sd, 2) < 0.5, k = (v: number) => Math.round(v * s);
  const put = (a0: number, b0: number, a1: number, b1: number, y0: number, y1: number, c: number) => {
    const [p0, q0, p1, q1] = sw ? [b0, a0 * fx, b1, a1 * fx] : [a0 * fx, b0, a1 * fx, b1];
    w.box(X + k(p0), k(y0), Z + k(q0), X + k(p1), k(y1), Z + k(q1), c);
  };
  const c0 = cols[0], c1 = cols[1 % cols.length], c2 = cols[2 % cols.length];
  put(-6, -3, -1, 1, 0, 2, c0); put(0, -4, 5, 1, 0, 3, c1); put(-3, 2, 3, 5, 0, 1, c0); put(5, 1, 8, 4, 0, 1, c2);
  put(-4, -2, 1, 1, 3, 5, c1); put(-2, -1, 0, 0, 6, 7, c2);
}
/** a stone fireplace against a wall (x, z = middle of its back, face = the way it opens): coursed chimney breast, firebox with a stepped head and sooted back, wooden mantel, hearth, logs and fire; returns the flame point */
export function fireplace(w: W, x: number, z: number, face: Dir, stone: number, o: { h?: number; wood?: number; fire?: number } = {}) {
  const F = facing(w, M(x), M(z), face), H = M(o.h ?? 2.8), fire = o.fire ?? 0xffa040, wood = o.wood ?? 0x4a3222, Hm = M(1.2);
  F.box(-12, -2, 0, 12, Hm, 7, stone); F.box(-9, Hm + 1, 0, 9, H, 5, stone); F.box(-10, H + 1, 0, 10, H + 2, 6, shade(stone, 1.12));
  for (let y = 4; y < H; y += 5) { if (y <= Hm) F.box(-12, y, 7, 12, y, 7, null); else F.box(-9, y, 5, 9, y, 5, null); }
  F.box(-6, 0, 2, 6, 10, 7, null); F.box(-4, 11, 3, 4, 12, 7, null); F.box(-6, 0, 1, 6, 12, 1, 0x1a1412);
  F.box(-14, -1, 8, 14, 0, 11, shade(stone, 0.85)); F.box(-13, Hm - 1, 6, 13, Hm, 9, wood); F.box(-13, Hm - 2, 8, 13, Hm - 2, 9, shade(wood, 0.8));
  F.box(-4, 0, 3, 4, 1, 4, 0x3a2418); F.box(-3, 2, 4, 3, 2, 5, 0x4a3020);
  F.box(-3, 1, 5, 3, 3, 6, fire, 1); F.box(-1, 4, 5, 1, 6, 6, shade(fire, 1.1), 1); F.set(0, 7, 5, shade(fire, 1.2), 1);
  return F.pos(0, 4, 5);
}
