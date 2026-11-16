// The forest scenes' own kit (trail, lumber camp, camp, merchant, shrine): ground design (paths with kerbs, trampled rings, decks),
// the landmark builders (ruined gate, sawmill shed, tents, covered wagon, market stall, stone shrine) and the story props around
// them. House rules as in props.ts: axis-aligned masses; slopes, roofs and wheels as a few WIDE right-angle tiers, never a one-cell
// staircase; detail from structured, low-contrast patterns (courses, board seams, rims, bands), never random speckle.
// Placement is in metres (M converts); sizes are in blocks (CELL = 7 cm). Ground top is y = 0 (ground cells at y = -1).
import { M, hash, PLAY, type W } from './props';
import { CELL } from '../bestiary/kit';

export type P3 = [number, number, number];
export type Rect = { x0: number; z0: number; x1: number; z1: number };
/** centre of a cell, in metres */
export const at = (X: number, Y: number, Z: number): P3 => [(X + 0.5) * CELL, (Y + 0.5) * CELL, (Z + 0.5) * CELL];
const inPlayC = (X: number, Z: number) => { const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL; return x > PLAY.x0 && x < PLAY.x1 && z > PLAY.z0 && z < PLAY.z1; };

/** the forest kit's palette: every material in three steps (body, dark seam / lip, light edge) */
export const KC = {
  stone: 0x6e6c80, stoneD: 0x56546a, stoneL: 0x8a889c, mortar: 0x4a4858, slate: 0x4a4c62, slateD: 0x363848, statue: 0x9c9aae,
  moss: 0x40553a, mossL: 0x51643f,
  wood: 0x5a4c42, woodD: 0x3a302c, woodL: 0x6e625a, plank: 0x5e5249, plankB: 0x52473f, seam: 0x1e1a18, shingle: 0x46403e, shingleD: 0x2e2a2a,
  bark: 0x3a3434, barkD: 0x262224, ring: 0x84705a, ringD: 0x62523f,
  canvas: 0x8c8472, canvasD: 0x625c4e, canvasL: 0x9c9482,
  red: 0x6a302c, redD: 0x4a2422, cream: 0xa8a290, blue: 0x3a4458, green: 0x3e4e38,
  iron: 0x302e36, ironL: 0x4e4a52, brass: 0x8a6a3a, rope: 0x6e6250, rust: 0x74442e, rustD: 0x52321f, bone: 0xb8b0a0,
  earth: 0x4a3e30, earthL: 0x5a4c3a, earthD: 0x382e26, sawdust: 0x9a8058, ash: 0x3a3634, char: 0x221c1c,
  warm: 0xffc070, ember: 0xff7a30, cold: 0x5ad8ff, teal: 0x6affd8, dark: 0x161214,
};

// ------------------------------------------------------------------ patterned masses
/** a stone mass (cells, inclusive) whose faces show courses: a mortar line every ch cells up and a joint every cl cells along,
 *  offset half a block on alternate courses; cap = colour of the top layer (coping, moss) */
export function masonry(w: W, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number, mortar: number, o: { ch?: number; cl?: number; cap?: number } = {}) {
  const ch = o.ch ?? 4, cl = o.cl ?? 7;
  w.box(x0, y0, z0, x1, y1, z1, col);
  for (let y = y0; y < y1; y++) {
    const ly = (y - y0) % ch, off = Math.floor((y - y0) / ch) & 1 ? cl >> 1 : 0;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const sx = x === x0 || x === x1, sz = z === z0 || z === z1; if (!sx && !sz) continue;
      if (ly === ch - 1 || (sz && (x - x0 + off) % cl === cl - 1) || (sx && (z - z0 + off) % cl === cl - 1)) w.set(x, y, z, mortar);
    }
  }
  if (o.cap != null) w.box(x0, y1, z0, x1, y1, z1, o.cap);
}
/** boards bw blocks wide standing side by side along the longer horizontal axis, two tones, a dark seam between them */
export function boardWall(w: W, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, a: number, b: number, seam: number, bw = 4) {
  const alongX = x1 - x0 >= z1 - z0, n = alongX ? x1 - x0 : z1 - z0;
  for (let i = 0; i <= n; i++) {
    const li = i % (bw + 1), col = li === bw ? seam : Math.floor(i / (bw + 1)) & 1 ? b : a;
    if (alongX) w.box(x0 + i, y0, z0, x0 + i, y1, z1, col); else w.box(x0, y0, z0 + i, x1, y1, z0 + i, col);
  }
}
/** a stepped gable roof: tiers th blocks tall stepping in d blocks from both eaves; each tier's eave row is the darker lip; a cap
 *  beam on the ridge. ridge 'x' = ridge runs along x (slopes face ±z). Returns the y above the ridge cap. */
export function gable(w: W, x0: number, x1: number, z0: number, z1: number, y: number, o: { ridge: 'x' | 'z'; tiers: number; th: number; d: number; col: number; lip: number; cap: number; skip?: (i: number, u: number, side: number) => boolean }) {
  const RX = o.ridge === 'x';
  for (let i = 0; i < o.tiers; i++) {
    const ya = y + i * o.th, yb = ya + o.th - 1;
    const a = (RX ? z0 : x0) + i * o.d, b = (RX ? z1 : x1) - i * o.d; if (a > b) break;
    const u0 = RX ? x0 : z0, u1 = RX ? x1 : z1;
    for (let u = u0; u <= u1; u++) for (let v = a; v <= b; v++) {
      const side = v < (a + b) / 2 ? 0 : 1; if (o.skip && o.skip(i, u, side) && (v - a < o.d || b - v < o.d)) continue;
      for (let yy = ya; yy <= yb; yy++) { const lip = yy === ya && (v === a || v === b); if (RX) w.set(u, yy, v, lip ? o.lip : o.col); else w.set(v, yy, u, lip ? o.lip : o.col); }
    }
  }
  const top = y + o.tiers * o.th, c = RX ? (z0 + z1) >> 1 : (x0 + x1) >> 1;
  if (RX) w.box(x0 - 1, top, c - 1, x1 + 1, top + 1, c + 1, o.cap); else w.box(c - 1, top, z0 - 1, c + 1, top + 1, z1 + 1, o.cap);
  return top + 2;
}
/** a stepped hip roof: every tier steps in d blocks on all four sides; the bottom row of each tier is the lip */
export function hipRoof(w: W, x0: number, x1: number, z0: number, z1: number, y: number, tiers: number, th: number, d: number, col: number, lip: number, top?: number) {
  let yy = y;
  for (let i = 0; i < tiers; i++) {
    const a = x0 + i * d, b = x1 - i * d, c = z0 + i * d, e = z1 - i * d; if (a > b || c > e) break;
    w.box(a, yy, c, b, yy + th - 1, e, i === tiers - 1 && top != null ? top : col);
    w.box(a, yy, c, b, yy, c, lip).box(a, yy, e, b, yy, e, lip).box(a, yy, c, a, yy, e, lip).box(b, yy, c, b, yy, e, lip);
    yy += th;
  }
  return yy;
}
/** a spoked wheel standing in a vertical plane: the rim is an octagon of three wide rectangles (no staircase), four spokes in a
 *  plus, an iron hub that sticks out past the rim. (X, Y, Z) = hub centre in cells; axle 'z' = wheel faces ±z. */
export function wheel(w: W, X: number, Y: number, Z: number, r: number, axle: 'x' | 'y' | 'z', rim: number, spoke: number, hub: number, t = 2, tyre?: number, broken = false) {
  const q = Math.round(r * 0.45), m = Math.round(r * 0.78), rects: Array<[number, number]> = [[r, q], [m, m], [q, r]];
  const inside = (a: number, b: number, sh: number) => rects.some(([p, s]) => Math.abs(a) <= p - sh && Math.abs(b) <= s - sh);
  for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
    let c: number | null = null;
    if (inside(a, b, 0) && !inside(a, b, 2)) c = tyre != null && !inside(a, b, 1) ? tyre : rim; else if (inside(a, b, 2) && (a === 0 || b === 0)) c = spoke;
    if (Math.abs(a) <= 1 && Math.abs(b) <= 1) c = hub;
    if (c == null || (broken && a > 1 && b > Math.round(r * 0.2))) continue;
    for (let k = 0; k < t; k++) { if (axle === 'z') w.set(X + a, Y + b, Z + k, c); else if (axle === 'y') w.set(X + a, Y + k, Z + b, c); else w.set(X + k, Y + b, Z + a, c); }
  }
  if (axle === 'z') w.box(X, Y, Z - 1, X, Y, Z + t, hub); else if (axle === 'y') w.box(X, Y - 1, Z, X, Y + t, Z, hub); else w.box(X - 1, Y, Z, X + t, Y, Z, hub);
}
/** a hanging lantern below the hook cell (X, Y, Z): chain link, cap, glowing panes between four corner posts, base. Returns the
 *  light position (metres). */
export function lantern(w: W, X: number, Y: number, Z: number, frame: number, glowC: number, big = false, lit = true) {
  const s = big ? 2 : 1, h = big ? 4 : 3;
  w.set(X, Y, Z, frame).box(X - s, Y - 1, Z - s, X + s, Y - 1, Z + s, frame).set(X, Y, Z, frame);
  if (lit) w.box(X - s, Y - 1 - h, Z - s, X + s, Y - 2, Z + s, glowC, 1);
  else w.box(X - s, Y - 1 - h, Z - s, X + s, Y - 2, Z + s, 0x24242a).box(X - s, Y - 1 - h, Z + s, X, Y - 3, Z + s, null);
  for (const [a, b] of [[-s, -s], [s, -s], [-s, s], [s, s]]) w.box(X + a, Y - 1 - h, Z + b, X + a, Y - 2, Z + b, frame);
  w.box(X - s, Y - 2 - h, Z - s, X + s, Y - 2 - h, Z + s, frame);
  return at(X, Y - 1 - (h >> 1), Z);
}

// ------------------------------------------------------------------ ground design (all flush at y = -1 inside the battle floor)
type CellSet = Set<number>;
const ck = (X: number, Z: number) => (X + 2048) * 4096 + (Z + 2048);
function cellsOf(rects: Rect[]): CellSet { const s: CellSet = new Set(); for (const r of rects) for (let X = M(r.x0); X < M(r.x1); X++) for (let Z = M(r.z0); Z < M(r.z1); Z++) s.add(ck(X, Z)); return s; }
function each(s: CellSet, f: (X: number, Z: number) => void) { for (const k of s) f(Math.floor(k / 4096) - 2048, (k % 4096) - 2048); }
/** a path over a union of axis-aligned rects: kerb stones along its edges (raised one block outside the battle floor, flush inside
 *  it, a joint every few blocks), a darker worn band inside the kerb, and the surface from surf(X, Z) (null = a groove) */
export function pathway(w: W, rects: Rect[], o: { surf: (X: number, Z: number) => number | null; kerb: number; joint: number; band?: number; raise?: boolean; jointEvery?: number; broken?: number }) {
  const S = cellsOf(rects), has = (X: number, Z: number) => S.has(ck(X, Z)), je = o.jointEvery ?? 6;
  each(S, (X, Z) => {
    const edge = !has(X + 1, Z) || !has(X - 1, Z) || !has(X, Z + 1) || !has(X, Z - 1);
    if (edge) {
      const seg = Math.floor((X + Z) / je), gone = o.broken != null && !inPlayC(X, Z) && hash(seg, X > 0 ? 1 : 2, Z > 0 ? 3 : 4) < o.broken;
      if (gone) { w.set(X, -1, Z, o.band ?? o.joint); return; }
      const j = (X + Z) % je === 0, col = j ? o.joint : o.kerb;
      w.set(X, -1, Z, col);
      if (o.raise !== false && !inPlayC(X, Z) && !j) w.set(X, 0, Z, col);
      return;
    }
    const near = !has(X + 2, Z) || !has(X - 2, Z) || !has(X, Z + 2) || !has(X, Z - 2);
    const c = near && o.band != null ? o.band : o.surf(X, Z);
    if (c == null) { w.set(X, -1, Z, null); w.set(X, -2, Z, o.joint); } else w.set(X, -1, Z, c);
  });
}
/** flagstones in a running bond, size sz blocks, two or three close tones, dark grooves between them */
export const flags = (cols: number[], sz = 11, seed = 3) => (X: number, Z: number): number | null => {
  const r = Math.floor(Z / sz), lz = ((Z % sz) + sz) % sz, sx = X + (r & 1 ? sz >> 1 : 0), c = Math.floor(sx / sz), lx = ((sx % sz) + sz) % sz;
  if (lz === sz - 1 || lx === sz - 1) return null;
  return cols[Math.floor(hash(c, r, seed) * cols.length)];
};
/** a round patch made of four wide nested rectangles (an octagon-ish blob with no staircase): fill, plus an edge ring rw wide */
export function roundPatch(w: W, x: number, z: number, r: number, fill: number, edge: number, rw = 3) {
  const X = M(x), Z = M(z), R = M(r), tiers: Array<[number, number]> = [[1, 0.5], [0.9, 0.78], [0.78, 0.9], [0.5, 1]];
  const inside = (a: number, b: number, sh: number) => tiers.some(([p, q]) => Math.abs(a) <= Math.round(R * p) - sh && Math.abs(b) <= Math.round(R * q) - sh);
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) if (inside(a, b, 0)) w.set(X + a, -1, Z + b, inside(a, b, rw) ? fill : edge);
}
/** a raised plank deck (x0..x1, z0..z1 metres, h blocks tall): a beam frame round the edge, boards along x in two tones with dark
 *  grooves between rows, corner posts, and a step along the front (+z) edge */
export function deck(w: W, r: Rect, h: number, o: { a: number; b: number; frame: number; seam: number; step?: boolean }) {
  const X0 = M(r.x0), X1 = M(r.x1) - 1, Z0 = M(r.z0), Z1 = M(r.z1) - 1;
  w.box(X0, -1, Z0, X1, h - 2, Z1, o.frame);
  for (let Z = Z0 + 1; Z < Z1; Z++) {
    const row = Z - Z0 - 1, lz = row % 4;
    for (let X = X0 + 1; X < X1; X++) {
      if (lz === 3) { w.set(X, h - 2, Z, o.seam); continue; }
      const off = Math.floor(hash(Math.floor(row / 4), 7) * 20), bd = Math.floor((X - X0 + off) / 22), lx = (X - X0 + off) % 22;
      w.set(X, h - 1, Z, lx === 21 ? o.seam : (Math.floor(row / 4) + bd) & 1 ? o.b : o.a);
    }
  }
  w.box(X0, h - 1, Z0, X1, h - 1, Z0, o.frame).box(X0, h - 1, Z1, X1, h - 1, Z1, o.frame).box(X0, h - 1, Z0, X0, h - 1, Z1, o.frame).box(X1, h - 1, Z0, X1, h - 1, Z1, o.frame);
  for (const [px, pz] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) w.box(px, -2, pz, px, h, pz, 0x3a281c);
  if (o.step && h >= 3) w.box(X0 + 4, -1, Z1 + 1, X1 - 4, (h >> 1) - 1, Z1 + 3, o.frame).box(X0 + 4, (h >> 1) - 1, Z1 + 1, X1 - 4, (h >> 1) - 1, Z1 + 3, o.a);
}

// ------------------------------------------------------------------ outdoor bits
/** a boulder in two tiers (wide base, narrower top) with a moss cap on the top tier */
export function boulder(w: W, x: number, z: number, sx: number, sz: number, h: number, col: number, top: number, cap?: number) {
  const X = M(x), Z = M(z), h1 = Math.max(1, Math.round(h * 0.6));
  w.box(X - sx, -2, Z - sz, X + sx, h1, Z + sz, col).box(X - sx + 2, h1 + 1, Z - sz + 1, X + sx - 1, h, Z + sz - 2, top);
  if (cap != null) w.box(X - sx + 3, h + 1, Z - sz + 2, X + sx - 3, h + 1, Z + sz - 3, cap);
}
/** a log lying along x or z with end faces showing bark, a pale ring and a dark heart; d = cross-section in blocks */
export function logX(w: W, X: number, Y: number, Z: number, len: number, d: number, along: 'x' | 'z', bark: number, ring: number, heart: number) {
  const h = d >> 1, v0 = (along === 'x' ? Z : X) - h, v1 = v0 + d - 1, u0 = along === 'x' ? X : Z, u1 = u0 + len - 1;
  const B = (a0: number, a1: number, y0: number, y1: number, b0: number, b1: number, c: number | null) => along === 'x' ? w.box(a0, y0, b0, a1, y1, b1, c) : w.box(b0, y0, a0, b1, y1, a1, c);
  B(u0, u1, Y, Y + d - 1, v0, v1, bark);
  if (d >= 5) for (const yy of [Y, Y + d - 1]) for (const vv of [v0, v1]) B(u0, u1, yy, yy, vv, vv, null);
  for (const e of [u0, u1]) {
    B(e, e, Y + 1, Y + d - 2, v0 + 1, v1 - 1, ring);
    if (d >= 6) B(e, e, Y + 2, Y + d - 3, v0 + 2, v1 - 2, heart);
    if (d === 7 || d === 5) B(e, e, Y + h, Y + h, v0 + h, v0 + h, d === 7 ? ring : heart);
  }
}
/** a stack of logs (rows of n, n-1, ... each row resting in the grooves of the one below; ringed ends), stakes holding its sides */
export function logPile(w: W, x: number, z: number, len: number, rows: number, along: 'x' | 'z', o: { d?: number; bark: number; ring: number; heart: number; post: number }) {
  const d = o.d ?? 5, L = M(len), X = M(x), Z = M(z), half = L >> 1;
  for (let r = 0; r < rows; r++) {
    const n = rows - r;
    for (let i = 0; i < n; i++) {
      const a = Math.round(-((n - 1) * d) / 2 + i * d), sh = (r & 1 ? 1 : 0) + Math.floor(hash(r, i, 3) * 3) - 1;
      const ln = L - Math.floor(hash(i, r, 5) * 4);
      if (along === 'x') logX(w, X - half + sh, r * d, Z + a, ln, d, 'x', o.bark, o.ring, o.heart); else logX(w, X + a, r * d, Z - half + sh, ln, d, 'z', o.bark, o.ring, o.heart);
    }
  }
  const s = Math.round(rows * d / 2) + 1, H = rows * d + 1;
  for (const u of [-half + 4, half - 5]) for (const v of [-s, s]) { if (along === 'x') w.box(X + u, -2, Z + v, X + u + 1, H, Z + v, o.post); else w.box(X + v, -2, Z + u, X + v, H, Z + u + 1, o.post); }
}
/** a view of a world raised by dy blocks: build a prop standing on a deck or a table top with the ordinary helpers */
export function lift(w: W, dy: number): W {
  const v = {
    cells: w.cells, s: w.s,
    box: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null, g = 0) => { w.box(x0, y0 + dy, z0, x1, y1 + dy, z1, c, g); return v; },
    set: (x: number, y: number, z: number, c: number | null, g = 0) => { w.set(x, y + dy, z, c, g); return v; },
    has: (x: number, y: number, z: number) => w.has(x, y + dy, z), get: (x: number, y: number, z: number) => w.get(x, y + dy, z),
  };
  return v as unknown as W;
}
/** a view of a world mirrored in x about block column X (build a prop facing the other way) */
export function mirrorX(w: W, X: number): W {
  const m = (x: number) => 2 * X - x;
  const v = {
    cells: w.cells, s: w.s,
    box: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null, g = 0) => { w.box(m(x0), y0, z0, m(x1), y1, z1, c, g); return v; },
    set: (x: number, y: number, z: number, c: number | null, g = 0) => { w.set(m(x), y, z, c, g); return v; },
    has: (x: number, y: number, z: number) => w.has(m(x), y, z), get: (x: number, y: number, z: number) => w.get(m(x), y, z),
  };
  return v as unknown as W;
}
/** a glowing mushroom: a pale stem h blocks tall, a dark cap in wide tiers with corners cut once; its lower edge shines — a one-block
 *  glowing outline round the rim and a glowing ring of gills one block in beneath it — while the top of the cap stays dark.
 *  s = cap half-width in blocks (3..7). Returns the cap's underside centre. */
export function glowShroom(w: W, x: number, z: number, s: number, cap: number, crown: number, gill: number, h?: number) {
  const X = M(x), Z = M(z), sw = s >= 4 ? 1 : 0, H = h ?? 2 * s;
  w.box(X - sw, 0, Z - sw, X + sw, H, Z + sw, 0xb8b0c8);
  const layer = (y: number, r: number, f: (a: number, b: number) => [number, number]) => { for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { if (Math.abs(a) === r && Math.abs(b) === r) continue; const [c, g] = f(a, b); w.set(X + a, y, Z + b, c, g); } };
  layer(H, s - 1, (a, b) => (Math.max(Math.abs(a), Math.abs(b)) === s - 1 ? [gill, 1] : [cap, 0]));
  layer(H + 1, s, (a, b) => (Math.max(Math.abs(a), Math.abs(b)) === s ? [gill, 1] : [cap, 0]));
  layer(H + 2, s - 1, () => [cap, 0]);
  if (s >= 4) layer(H + 3, s - 2, () => [crown, 0]);
  if (s >= 6) layer(H + 4, s - 4, () => [crown, 0]);
  return [x, (H + 1) * CELL, z] as P3;
}

/** an old stone tablet: a base, a slab with a stepped head, worn engraving lines on its +z face, moss on the head */
export function stele(w: W, x: number, z: number, h: number, wd: number, stone: number, light: number, groove: number) {
  const X = M(x), Z = M(z);
  w.box(X - wd - 2, -1, Z - 3, X + wd + 2, 1, Z + 3, KC.stoneD);
  w.box(X - wd, 2, Z - 1, X + wd, h, Z + 1, stone).box(X - wd + 1, h + 1, Z - 1, X + wd - 1, h + 2, Z + 1, light).box(X - wd + 3, h + 3, Z - 1, X + wd - 3, h + 3, Z + 1, KC.moss);
  for (let y = h - 4; y >= 6; y -= 3) w.box(X - wd + 2, y, Z + 2, X + wd - 2 - ((y >> 1) % 3), y, Z + 2, groove);
}

/** split firewood stacked between two stakes, end grain toward +z: alternating pale and darker ends in neat rows */
export function firewood(w: W, x: number, z: number, wd: number, h: number, o: { bark: number; a: number; b: number; post: number }) {
  const X = M(x), Z = M(z);
  w.box(X - wd, 0, Z - 3, X + wd, h, Z + 2, o.bark);
  for (let y = 0; y <= h; y++) for (let i = -wd; i <= wd; i++) { const ly = y % 3, li = (i + wd + (Math.floor(y / 3) & 1 ? 1 : 0)) % 3; if (ly < 2 && li < 2) w.set(X + i, y, Z + 2, o.a); }
  w.box(X - wd, h + 1, Z - 3, X + wd, h + 1, Z + 2, o.b);
  w.box(X - wd - 2, -2, Z - 1, X - wd - 1, h + 3, Z, o.post).box(X + wd + 1, -2, Z - 1, X + wd + 2, h + 3, Z, o.post);
}
/** a burlap sack: a squat body, a narrower shoulder, a rope-tied neck */
export function sack(w: W, x: number, z: number, col: number, tie: number, s = 1) {
  const X = M(x), Z = M(z), a = 3 * s, h = 4 * s;
  w.box(X - a, 0, Z - a + 1, X + a, h, Z + a - 1, col).box(X - a + 1, 0, Z - a, X + a - 1, h, Z + a, col).box(X - a + 1, h + 1, Z - a + 2, X + a - 1, h + 2, Z + a - 2, col).box(X - 1, h + 3, Z - 1, X + 1, h + 3, Z + 1, tie).box(X - 1, h + 4, Z - 1, X, h + 5, Z, col);
}
/** a wooden post with an arm reaching toward +x or −x (or ±z) and a lantern on its hook. Returns the light position. */
export function lampPost(w: W, x: number, z: number, h: number, dir: [number, number], wood: number, iron: number, glowC: number, lit = true) {
  const X = M(x), Z = M(z), H = M(h), [dx, dz] = dir;
  w.box(X - 2, -2, Z - 2, X + 2, 1, Z + 2, 0x4e4c5e).box(X - 1, 2, Z - 1, X + 1, H, Z + 1, wood).box(X - 2, H + 1, Z - 2, X + 2, H + 1, Z + 2, wood);
  const ex = X + dx * 7, ez = Z + dz * 7;
  w.box(Math.min(X, ex), H - 2, Math.min(Z, ez), Math.max(X, ex), H - 1, Math.max(Z, ez), wood).box(X + dx * 2, H - 5, Z + dz * 2, X + dx * 2, H - 3, Z + dz * 2, wood);
  return lantern(w, ex, H - 3, ez, iron, glowC, false, lit);
}
/** a signpost: a post with boards pointing along x (arrow ends cut in two steps) and a small cap */
export function signpost(w: W, x: number, z: number, h: number, wood: number, board: number, edge: number, arms: Array<[number, number]>) {
  const X = M(x), Z = M(z), H = M(h);
  w.box(X - 1, -2, Z - 1, X + 1, H, Z + 1, wood).box(X - 2, H + 1, Z - 2, X + 2, H + 1, Z + 2, edge);
  for (const [dir, y] of arms) {
    const a = X + dir * 2, b = X + dir * 14;
    w.box(Math.min(a, b), y - 2, Z + 2, Math.max(a, b), y + 2, Z + 2, board).box(Math.min(a, b), y - 2, Z + 2, Math.max(a, b), y - 2, Z + 2, edge);
    w.box(b + dir, y - 1, Z + 2, b + dir, y + 1, Z + 2, board).set(b + dir * 2, y, Z + 2, board);
  }
}
/** a stone ring round a fire pit with crossed split logs, a bed of embers and ash; lit = glowing embers. Returns the flame spot. */
export function firePit(w: W, x: number, z: number, lit: boolean | 'dying') {
  const X = M(x), Z = M(z), R = 8;
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
    const m = Math.max(Math.abs(a), Math.abs(b)), corner = Math.abs(a) > 5 && Math.abs(b) > 5; if (corner) continue;
    if (m >= R - 1) { const stone = (Math.floor((a + R) / 4) + Math.floor((b + R) / 4)) & 1; w.box(X + a, -1, Z + b, X + a, stone ? 2 : 1, Z + b, stone ? KC.stone : KC.stoneD); }
    else w.set(X + a, -1, Z + b, lit ? KC.char : KC.ash);
  }
  for (const [a, b] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) w.box(X + a - 1, -1, Z + b - 1, X + a + 1, 1, Z + b + 1, KC.stoneD);
  w.box(X - 6, 0, Z - 1, X + 6, 2, Z + 1, KC.bark).box(X - 1, 3, Z - 6, X + 1, 5, Z + 6, KC.bark).box(X - 6, 1, Z - 1, X - 6, 1, Z + 1, KC.ring).box(X + 6, 1, Z - 1, X + 6, 1, Z + 1, KC.ring);
  if (lit === 'dying') w.box(X - 6, 0, Z - 1, X + 6, 2, Z + 1, KC.char).box(X - 1, 3, Z - 6, X + 1, 5, Z + 6, KC.char).box(X - 2, 0, Z - 2, X + 2, 0, Z + 2, KC.ember, 1).box(X - 1, 1, Z - 1, X + 1, 2, Z + 1, 0xff7a2a, 1).box(X, 3, Z, X, 4, Z, 0xffb050, 1);
  else if (lit) w.box(X - 3, 0, Z - 3, X + 3, 1, Z + 3, KC.ember, 1).box(X - 2, 2, Z - 2, X + 2, 4, Z + 2, 0xff9a3a, 1).box(X - 1, 5, Z - 1, X + 1, 7, Z + 1, 0xffd070, 1);
  else w.box(X - 3, 0, Z - 3, X + 3, 0, Z + 3, KC.char).box(X - 1, 1, Z - 1, X, 1, Z, 0xa83a20, 1);
  return [x, 9 * CELL, z] as P3;
}

// ------------------------------------------------------------------ landmarks
/** the ruined gate at the end of the trail: two piers on stepped plinths, a lintel with a stepped crown and a carved keystone (a
 *  glowing rune), stepped corbels rounding the opening's top corners, a raised threshold, and broken wall wings stepping down to
 *  both sides. (x, z) = centre of the opening. Returns the rune position. */
export function ruinGate(w: W, x: number, z: number, o: { span: number; h: number; wing: number; rune: number; ruin?: boolean }) {
  const X = M(x), Z = M(z), S = M(o.span) >> 1, H = M(o.h), pw = 5, pd = 5, st = KC;
  const L0 = X - S - 1 - 2 * pw, L1 = X - S - 1, R0 = X + S + 1, R1 = X + S + 1 + 2 * pw;
  // threshold: a two-step stone platform the path runs onto
  masonry(w, L0 - 6, -1, Z - pd - 4, R1 + 6, 1, Z + pd + 4, st.stoneD, st.mortar, { ch: 3, cl: 9, cap: st.stone });
  w.box(X - S - 2, -1, Z + pd + 5, X + S + 2, 0, Z + pd + 8, st.stoneD).box(X - S - 2, 0, Z + pd + 5, X + S + 2, 0, Z + pd + 5, st.stoneL);
  for (const [a, b] of [[L0, L1], [R0, R1]]) {
    w.box(a - 2, 2, Z - pd - 2, b + 2, 3, Z + pd + 2, st.stoneD).box(a - 1, 4, Z - pd - 1, b + 1, 5, Z + pd + 1, st.stoneL);
    masonry(w, a, 6, Z - pd, b, H, Z + pd, st.stone, st.mortar, { ch: 5, cl: 6 });
    w.box(a - 1, H + 1, Z - pd - 1, b + 1, H + 2, Z + pd + 1, st.stoneL);
  }
  // lintel, crown, keystone with its rune
  masonry(w, L0 - 2, H + 3, Z - pd - 1, R1 + 2, H + 8, Z + pd + 1, st.stone, st.mortar, { ch: 6, cl: 10 });
  w.box(L0 + 2, H + 9, Z - pd, R1 - 2, H + 10, Z + pd, st.stoneL).box(L0 + 3, H + 11, Z - pd + 1, R1 - 3, H + 11, Z + pd - 1, st.moss);
  w.box(X - 4, H + 7, Z - pd - 1, X + 4, H + 14, Z + pd + 2, st.stoneL).box(X - 3, H + 15, Z - pd, X + 3, H + 15, Z + pd, st.mossL);
  w.box(X - 1, H + 9, Z + pd + 2, X + 1, H + 9, Z + pd + 2, o.rune, 1).box(X, H + 8, Z + pd + 2, X, H + 12, Z + pd + 2, o.rune, 1).box(X - 2, H + 11, Z + pd + 2, X + 2, H + 11, Z + pd + 2, o.rune, 1);
  for (let x = L0 - 1; x <= R1 + 1; x += 2) w.set(x, H + 3, Z + pd + 2, st.stoneL);
  for (const cx of [(L0 + L1) >> 1, (R0 + R1) >> 1]) w.box(cx, H - 12, Z + pd + 1, cx, H - 8, Z + pd + 1, o.rune, 1).box(cx - 1, H - 10, Z + pd + 1, cx + 1, H - 10, Z + pd + 1, o.rune, 1);
  // corbels: two wide steps in each top corner of the opening
  for (const [s, e] of [[L1 + 1, 1], [R0 - 1, -1]]) { w.box(s, H - 1, Z - pd, s + e * 5, H + 2, Z + pd, st.stone); w.box(s, H - 6, Z - pd, s + e * 2, H - 2, Z + pd, st.stone); w.box(s, H + 2, Z - pd, s + e * 5, H + 2, Z + pd, st.mortar); }
  // wall wings, broken in three steps toward the ends, moss on their tops, a fallen block at each end
  const wl = M(o.wing), wd = 3;
  for (const [s, e] of [[L0 - 1, -1], [R1 + 1, 1]]) {
    for (let k = 0; k < 3; k++) {
      const a = s + e * Math.round(k * wl / 3), b = s + e * (Math.round((k + 1) * wl / 3) - 1), top = Math.round(H * [0.62, 0.42, 0.2][k]);
      masonry(w, Math.min(a, b), 2, Z - wd, Math.max(a, b), top, Z + wd, st.stone, st.mortar, { ch: 5, cl: 7, cap: st.moss });
      w.box(Math.min(a, b), -1, Z - wd - 1, Math.max(a, b), 1, Z + wd + 1, st.stoneD);
    }
    const fx = s + e * (wl + 6);
    w.box(fx - 4, -1, Z + 2, fx + 4, 3, Z + 7, st.stone).box(fx - 3, 4, Z + 3, fx + 3, 4, Z + 6, st.moss);
  }
  if (o.ruin) {
    // the right end of the lintel and half the crown have fallen: a notch in two wide steps, the pieces lying in front of the pier
    w.box(R0 + 4, H + 3, Z - pd - 1, R1 + 2, H + 11, Z + pd + 1, null).box(X + 5, H + 9, Z - pd, R1, H + 11, Z + pd, null);
    w.box(R0 + 4, H + 3, Z - pd - 1, R1 + 2, H + 3, Z + pd + 1, st.stone).box(R0 + 4, H + 2, Z - pd - 1, R1 + 1, H + 2, Z + pd + 1, st.moss);
    w.box(R1 + 3, -1, Z + pd + 6, R1 + 14, 4, Z + pd + 11, st.stone).box(R1 + 4, 5, Z + pd + 7, R1 + 12, 5, Z + pd + 10, st.moss).box(R0 - 2, -1, Z + pd + 9, R0 + 5, 2, Z + pd + 13, st.stoneD);
    // the right pier's rune is cracked out; its capital split, a step dropped
    const rc = (R0 + R1) >> 1; w.box(rc - 1, H - 12, Z + pd + 1, rc + 1, H - 8, Z + pd + 1, st.stoneD);
    w.box(R1 - 3, H + 1, Z - pd - 1, R1 + 1, H + 2, Z, null);
  }
  return at(X, H + 10, Z + pd + 4);
}

/** the abandoned sawmill shed: stone footings, timber posts with stepped brackets, top plates and tie beams, a stepped shingle gable
 *  (a hole in the front slope showing the rafters), a board back wall and half side walls, and inside the saw bench with a log in a
 *  frame saw, a sawdust heap, a plank stack and tools hung on the wall. (x0..x1, z0..z1) = the post grid. Returns the lantern spot. */
export function sawShed(w: W, r: Rect, o: { ruin?: boolean; lit?: boolean } = {}) {
  const X0 = M(r.x0), X1 = M(r.x1), Z0 = M(r.z0), Z1 = M(r.z1), H = 32, k = KC;
  const xs = [X0, (X0 + X1) >> 1, X1];
  // floor: packed sawdust boards
  w.box(X0 - 2, -1, Z0 - 2, X1 + 2, -1, Z1 + 2, 0x6a5a40);
  for (const px of xs) for (const pz of [Z0, Z1]) {
    w.box(px - 3, -2, pz - 3, px + 3, 2, pz + 3, k.stoneD).box(px - 3, 2, pz - 3, px + 3, 2, pz + 3, k.stone);
    w.box(px - 1, 3, pz - 1, px + 1, H, pz + 1, k.woodD);
  }
  // plates along x (front, back) and tie beams along z, stepped brackets under the front plate
  for (const pz of [Z0, Z1]) w.box(X0 - 4, H + 1, pz - 2, X1 + 4, H + 3, pz + 1, k.wood).box(X0 - 4, H + 1, pz + 1, X1 + 4, H + 1, pz + 1, k.woodD);
  for (const px of xs) {
    w.box(px - 1, H + 1, Z0, px + 1, H + 3, Z1, k.wood);
    for (const e of [-1, 1]) w.box(px + e * 2, H - 1, Z1 - 1, px + e * 5, H, Z1 + 1, k.wood).box(px + e * 2, H - 4, Z1 - 1, px + e * 3, H - 2, Z1 + 1, k.wood);
  }
  // back wall boards, half walls on the sides (boards missing where the shed has gone to ruin)
  boardWall(w, X0 + 2, 3, Z0, X1 - 2, H, Z0 + 1, k.plankB, k.plank, k.seam, 4);
  for (const px of [X0, X1]) { boardWall(w, px, 3, Z0 + 2, px + 1, 17, Z1 - 2, k.plankB, k.plank, k.seam, 4); w.box(px - 1, 18, Z0 + 2, px + 2, 18, Z1 - 2, k.wood); }
  if (o.ruin) {
    w.box(xs[1] + 9, 12, Z0, xs[1] + 18, H, Z0 + 1, null).box(xs[1] + 12, 6, Z0, xs[1] + 15, 11, Z0 + 1, null);
    w.box(xs[0] + 3, 20, Z0, xs[0] + 7, H, Z0 + 1, null);
    w.box(X1, 9, Z1 - 16, X1 + 1, 17, Z1 - 2, null).box(X1, 4, Z1 - 10, X1 + 1, 8, Z1 - 2, null);
    w.box(X1 + 4, 0, Z1 - 14, X1 + 6, 0, Z1 - 3, k.plank).box(X1 + 7, 0, Z1 - 12, X1 + 9, 1, Z1 - 4, k.plankB);
  }
  // roof: ridge along x, five tiers, a hole in the front slope over the left bay with three rafters showing
  const hx0 = xs[0] + 5, hx1 = xs[1] - 7, gx0 = xs[1] + 6, gx1 = xs[2] - 10;
  const hole = (i: number, u: number, side: number) => side === 1 && ((i >= 1 && i <= 2 && u >= hx0 && u <= hx1) || (!!o.ruin && i <= 1 && u >= gx0 && u <= gx1) || (!!o.ruin && i === 3 && u >= hx0 + 6 && u <= hx1 + 10));
  gable(w, X0 - 5, X1 + 5, Z0 - 6, Z1 + 6, H + 4, { ridge: 'x', tiers: 5, th: 4, d: 6, col: k.shingle, lip: k.shingleD, cap: k.woodD, skip: hole });
  for (let u = hx0 + 2; u < hx1; u += 6) w.box(u, H + 4, (Z0 + Z1) >> 1, u + 1, H + 12, Z1 + 4, k.woodD);
  if (o.ruin) {
    for (let u = gx0 + 2; u < gx1; u += 6) w.box(u, H + 4, (Z0 + Z1) >> 1, u + 1, H + 8, Z1 + 6, k.woodD);
    // what fell through: shingle slabs and a rafter lying in front of the shed
    for (const [a, b, l] of [[hx0 + 2, 8, 9], [gx0 + 4, 10, 7], [xs[1] - 3, 13, 5]]) w.box(a, 0, Z1 + b, a + l, 1, Z1 + b + 3, k.shingle).box(a, 1, Z1 + b, a + l, 1, Z1 + b, k.shingleD);
    w.box(gx0 - 2, 0, Z1 + 16, gx0 + 20, 1, Z1 + 17, k.woodD);
  }
  // inside: the saw bench with a log, the frame saw cutting it, sawdust heaped below
  const bz = Z0 + 14, b0 = xs[0] + 8, b1 = xs[1] + 14;
  for (const lx of [b0 + 2, b1 - 2]) for (const lz of [bz - 4, bz + 4]) w.box(lx, 0, lz, lx + 1, 11, lz + 1, k.woodD);
  w.box(b0, 12, bz - 5, b1, 13, bz + 5, k.wood).box(b0, 13, bz - 5, b1, 13, bz - 5, k.woodL).box(b0, 13, bz + 5, b1, 13, bz + 5, k.woodL);
  logX(w, b0 - 4, 14, bz, b1 - b0 + 9, 7, 'x', k.bark, k.ring, k.ringD);
  const sx = (b0 + b1) >> 1;
  w.box(sx - 1, 12, bz - 6, sx + 1, 34, bz - 6, k.woodD).box(sx - 1, 12, bz + 6, sx + 1, 34, bz + 6, k.woodD).box(sx - 1, 32, bz - 6, sx + 1, 33, bz + 6, k.wood);
  for (let y = 14; y <= 31; y++) w.set(sx, y, bz, o.ruin ? ((y >> 2) & 1 ? k.rust : k.rustD) : (y & 1) ? k.ironL : 0x8a8898);
  for (let t = 0; t < 3; t++) { const s = 7 - t * 2; w.box(sx - s - 3, t, bz + 6 - s, sx + s - 3, t, bz + 6 + s, t === 2 ? 0xb09868 : k.sawdust); }
  // planks stacked on two bearers, alternating lengths
  const px0 = xs[1] + 18, px1 = xs[2] - 6, pz = Z0 + 10;
  for (const lx of [px0 + 3, px1 - 3]) w.box(lx, 0, pz - 6, lx + 1, 1, pz + 8, k.woodD);
  for (let l = 0; l < 6; l++) w.box(px0 + (l & 1 ? 2 : 0), 2 + l, pz - 5, px1 - (l & 1 ? 0 : 2), 2 + l, pz + 7, l & 1 ? k.woodL : k.plank);
  // tools hung on the back wall: a long two-handled saw with a toothed edge, an axe
  const ty = 22, tz = Z0 + 2;
  const blade = o.ruin ? k.rust : k.ironL;
  w.box(xs[0] + 6, ty, tz, xs[1] - 6, ty + 2, tz, blade);
  for (let u = xs[0] + 6; u <= xs[1] - 6; u += 2) w.set(u, ty - 1, tz, blade);
  for (const u of [xs[0] + 4, xs[1] - 4]) w.box(u, ty - 2, tz, u + (u < xs[1] - 5 ? 1 : 0), ty + 4, tz, k.woodL);
  w.box(xs[1] + 8, 14, tz, xs[1] + 9, 28, tz, k.woodL).box(xs[1] + 6, 25, tz, xs[1] + 11, 29, tz, k.ironL).box(xs[1] + 10, 24, tz, xs[1] + 12, 30, tz, 0x8a8898);
  // the lantern hangs from the front plate over the middle bay
  return lantern(w, (xs[0] + xs[1]) >> 1, H, Z1 + 0, k.iron, k.warm, true, o.lit ?? true);
}

/** a canvas A-frame tent, ridge along z, its open gable toward the camera: three steep tiers (each a wide step, taller than it steps
 *  in) in dull canvas, the skirt flaring at the ground. The cloth's edge stands one block proud of both gables in a darker hem that
 *  traces the stepped outline; at the front the flaps are folded back and tied, filling the gable round a dark doorway. A ridge pole
 *  lies along the top and sticks out both ends on two uprights; guy lines run level from the sides to thin stakes with pegs at their
 *  feet. hw = half width (x), hd = half depth (z), in blocks. */
export function tent(w: W, x: number, z: number, o: { hw: number; hd: number; tiers?: number; th?: number; c: number; d: number; l: number; pole: number; torn?: boolean; patch?: number; collapse?: boolean }) {
  const X = M(x), Z = M(z), n = o.tiers ?? 3, th = o.th ?? 9, hd = o.hd, rope = 0x6e5e42;
  const hws = Array.from({ length: n }, (_, i) => Math.round(o.hw - (i * (o.hw - 2)) / (n - 1)));
  hws.forEach((r, i) => w.box(X - r, i * th, Z - hd, X + r, i * th + th - 1, Z + hd, o.c));
  const top = n * th;
  for (const e of [-1, 1]) w.box(X + e * (hws[0] + 1), 0, Z - hd, X + e * (hws[0] + 1), 1, Z + hd, o.d);
  // the hem round both gables, one block proud
  for (const ez of [Z + hd + 1, Z - hd - 1]) hws.forEach((r, i) => {
    const ya = i * th, yb = ya + th - 1, nx = i < n - 1 ? hws[i + 1] : -1;
    w.box(X - r, ya, ez, X - r, yb, ez, o.d).box(X + r, ya, ez, X + r, yb, ez, o.d);
    if (nx < 0) w.box(X - r, yb, ez, X + r, yb, ez, o.d); else w.box(X - r, yb, ez, X - nx - 1, yb, ez, o.d).box(X + nx + 1, yb, ez, X + r, yb, ez, o.d);
  });
  // the doorway, dark and recessed, stepping with the cloth; the flaps folded back filling the gable to the hem, tied at the waist
  for (let i = 0; i < n - 1; i++) {
    const dw = hws[i + 1] - 1, ya = i * th, yb = ya + th - 1; if (dw < 1) break;
    w.box(X - dw, ya, Z + hd - 2, X + dw, yb, Z + hd, null).box(X - dw, ya, Z + hd - 3, X + dw, yb, Z + hd - 3, KC.dark);
    for (const e of [-1, 1]) if (hws[i] - 1 > dw) { const a0 = X + e * (dw + 1), a1 = X + e * (hws[i] - 1); w.box(Math.min(a0, a1), ya, Z + hd + 1, Math.max(a0, a1), i === n - 2 ? yb - 1 : yb, Z + hd + 1, o.l); }
  }
  for (const e of [-1, 1]) w.box(X + e * (hws[1] + 1), th - 3, Z + hd + 2, X + e * (hws[0] - 1), th - 3, Z + hd + 2, rope);
  // the ridge pole on top, out past both gables on its uprights
  w.box(X, top, Z - hd - 4, X, top, Z + hd + 4, o.pole).box(X, -2, Z + hd + 4, X, top, Z + hd + 4, o.pole).box(X, -2, Z - hd - 4, X, top, Z - hd - 4, o.pole);
  // guy lines: level from the second tier's sides to thin stakes, a peg at each stake's foot
  const gy = th + 2, gx = hws[0] + 6;
  for (const e of [-1, 1]) for (const zz of [Z - hd + 4, Z + hd - 4]) {
    w.box(X + e * (hws[1] + 1), gy, zz, X + e * gx, gy, zz, rope);
    w.box(X + e * gx, -2, zz, X + e * gx, gy + 1, zz, o.pole).box(X + e * gx - 1, 0, zz - 1, X + e * gx + 1, 0, zz + 1, 0x3a281c);
  }
  if (o.torn) { const ya = th, r = hws[1]; w.box(X + r - 2, ya + 1, Z - 5, X + r, ya + th - 2, Z + 3, null).box(X + r - 3, ya + 1, Z - 5, X + r - 3, ya + th - 2, Z + 3, KC.dark).box(X + r + 1, ya - 3, Z - 4, X + r + 1, ya - 1, Z + 1, o.l); }
  // patches sewn on: squares of other cloth on both slopes, a darker stitched edge
  if (o.patch != null) for (const [e, i, z0, z1] of [[1, 0, Z - 9, Z - 3], [-1, 1, Z + 1, Z + 7], [-1, 0, Z - hd + 3, Z - hd + 8]] as const) {
    const r = hws[i], ya = i * th; w.box(X + e * r, ya + 2, z0, X + e * r, ya + th - 2, z1, o.patch).box(X + e * r, ya + 2, z0, X + e * r, ya + 2, z1, o.d);
  }
  // the back half has come down: the upper tiers gone behind the middle, a low heap of cloth there, the back upright fallen flat
  if (o.collapse) {
    for (let i = 1; i < n; i++) w.box(X - hws[i] - 1, i * th - 1, Z - hd - 5, X + hws[i] + 1, top + 1, Z - 3, null);
    w.box(X - hws[1], th, Z - hd, X + hws[1], th + 2, Z - 3, o.c).box(X - hws[1], th, Z - hd, X + hws[1], th, Z - hd, o.d).box(X - hws[2] - 1, th + 3, Z - hd + 4, X + hws[2] + 3, th + 3, Z - 6, o.c);
    w.box(X, -2, Z - hd - 4, X, top, Z - hd - 4, null).box(X + hws[0] + 3, 0, Z - hd - 2, X + hws[0] + 3, 0, Z - 4, o.pole);
  }
  return top;
}

/** the merchant's covered wagon, bed along x: board sides with a light top rail and iron corner straps, four spoked wheels, a canvas
 *  cover in four wide tiers with darker hoops standing proud every so often, a dark open back with crates inside, a driver's bench,
 *  shafts and a yoke reaching forward (−x). (x, z) = bed centre. Returns the lantern spot (hung on the front hoop). */
export function wagon(w0: W, x: number, z: number, o: { len: number; wid: number; flip?: boolean; worn?: boolean }) {
  const k = KC, X = M(x), Z = M(z), hl = M(o.len) >> 1, hz = M(o.wid) >> 1, yb = 11, w = o.flip ? mirrorX(w0, X) : w0;
  const X0 = X - hl, X1 = X + hl, Z0 = Z - hz, Z1 = Z + hz;
  // axles, wheels (front pair smaller), the bed
  for (const [ax, r] of [[X0 + 10, 8], [X1 - 12, 10]] as const) {
    w.box(ax, r - 1, Z0 - 3, ax, r, Z1 + 3, k.iron);
    const bad = !!o.worn && r === 10;
    wheel(w, ax, r, Z0 - 4, r, 'z', k.woodL, k.wood, k.iron, 2, o.worn ? k.rust : k.ironL); wheel(w, ax, r, Z1 + 3, r, 'z', k.woodL, k.wood, k.iron, 2, o.worn ? k.rust : k.ironL, bad);
    // the broken wheel can't carry the axle: a stack of stones and a block of wood props it up
    if (bad) w.box(ax - 4, -1, Z1 + 1, ax + 4, 3, Z1 + 6, k.stoneD).box(ax - 3, 4, Z1 + 1, ax + 3, 7, Z1 + 5, k.stone).box(ax - 2, 8, Z1 + 1, ax + 2, r - 2, Z1 + 4, k.woodD);
  }
  w.box(X0, yb - 2, Z0 + 2, X1, yb - 1, Z1 - 2, k.woodD);
  w.box(X0, yb, Z0, X1, yb + 1, Z1, k.wood);
  boardWall(w, X0, yb + 2, Z0, X1, yb + 6, Z0, k.plank, k.plankB, k.seam, 5); boardWall(w, X0, yb + 2, Z1, X1, yb + 6, Z1, k.plank, k.plankB, k.seam, 5);
  w.box(X0, yb + 2, Z0, X0, yb + 6, Z1, k.plankB).box(X1, yb + 2, Z0, X1, yb + 6, Z1, k.plankB);
  w.box(X0, yb + 7, Z0, X1, yb + 7, Z0, k.woodL).box(X0, yb + 7, Z1, X1, yb + 7, Z1, k.woodL);
  for (const ex of [X0, X1]) for (const ez of [Z0, Z1]) w.box(ex, yb, ez, ex, yb + 7, ez, k.iron);
  // canvas cover over the back three quarters: four tiers, hoops standing proud
  const c0 = X0 + 12, c1 = X1, base = yb + 8, tiers: Array<[number, number]> = [[hz, 9], [hz - 2, 4], [hz - 5, 3], [hz - 9, 2]];
  let y = base;
  const cv = o.worn ? 0x8e8a7a : 0xd2c6a6, cvL = o.worn ? 0x9c988a : 0xe2d8bc;
  for (const [hw, h] of tiers) {
    w.box(c0, y, Z - hw, c1, y + h - 1, Z + hw, cv);
    w.box(c0, y + h - 1, Z - hw, c1, y + h - 1, Z - hw, cvL).box(c0, y + h - 1, Z + hw, c1, y + h - 1, Z + hw, cvL);
    for (let u = c0 + 2; u <= c1; u += 11) w.box(u, y, Z - hw - 1, u + 1, y + h - (hw === tiers[3][0] ? 0 : 1), Z + hw + 1, k.wood);
    y += h;
  }
  const band = o.worn ? 0x4e3432 : k.red;
  w.box(c0, base, Z - hz - 1, c1, base + 1, Z - hz - 1, band).box(c0, base, Z + hz + 1, c1, base + 1, Z + hz + 1, band);
  { const ex = (c0 + c1) >> 1, ey = base + 6; wheel(w, ex, ey, Z + hz + 1, 4, 'z', k.brass, k.brass, k.brass, 1); w.box(ex - 1, ey - 1, Z + hz + 1, ex + 1, ey + 1, Z + hz + 1, k.canvas).box(ex, ey, Z + hz - 1, ex, ey, Z + hz + 2, k.canvas); }
  if (o.worn) {
    // patched and torn: two sewn squares of darker cloth, a rent in the top with the dark inside showing, ragged ends hanging at the foot
    w.box(c0 + 4, base + 2, Z + hz, c0 + 9, base + 7, Z + hz, 0x6a6658).box(c1 - 12, base + 9, Z + hz - 2, c1 - 7, base + 12, Z + hz - 2, 0x5e5a4c);
    w.box(c0 + 14, base + 13, Z + 1, c0 + 21, base + 18, Z + hz - 4, null).box(c0 + 14, base + 12, Z + 1, c0 + 21, base + 12, Z + hz - 4, KC.dark);
    for (let u = c0 + 1; u < c1; u += 5) if (hash(u, 7) < 0.6) w.box(u, base - 1 - (u % 3 === 0 ? 1 : 0), Z + hz, u + 1, base - 1, Z + hz, cv);
  }
  // open back: the canvas is cut back and the inside is dark with goods; the front end closed with a gathered panel
  w.box(X1 - 1, base, Z - hz + 2, X1, base + 12, Z + hz - 2, null).box(X1 - 2, base, Z - hz + 2, X1 - 2, base + 12, Z + hz - 2, KC.dark);
  w.box(X1 - 6, base - 1, Z - 6, X1 - 3, base + 4, Z - 1, k.woodL).box(X1 - 5, base - 1, Z + 1, X1 - 3, base + 6, Z + 5, 0x8a5a3a);
  w.box(c0, base, Z - hz + 3, c0, base + 12, Z + hz - 3, k.canvasD);
  // driver's bench and footboard, shafts and yoke
  w.box(X0 + 2, yb + 8, Z0 + 2, X0 + 6, yb + 9, Z1 - 2, k.woodL).box(X0 + 6, yb + 10, Z0 + 2, X0 + 7, yb + 13, Z1 - 2, k.wood);
  w.box(X0 - 3, yb + 2, Z0 + 2, X0 - 1, yb + 2, Z1 - 2, k.wood);
  for (const sz of [Z - 5, Z + 4]) w.box(X0 - 26, 6, sz, X0 + 8, 7, sz + 1, k.wood);
  w.box(X0 - 26, 6, Z - 7, X0 - 25, 8, Z + 7, k.woodD).box(X0 - 24, -1, Z - 2, X0 - 20, 5, Z + 2, k.woodD);
  // the lantern hangs off an iron bracket on the front hoop, on the near (+z) side
  w.box(c0 - 4, base + 9, Z1 + 1, c0 + 1, base + 9, Z1 + 1, k.iron).box(c0 - 4, base + 9, Z1 + 2, c0 - 4, base + 9, Z1 + 3, k.iron);
  const p = lantern(w, c0 - 4, base + 8, Z1 + 3, k.iron, k.warm, true);
  if (o.flip) p[0] = 2 * X * CELL + CELL - p[0];
  return p;
}

/** a market stall: four posts, a counter with a board front, a light top and a dark kick rail, shelves on the back posts, and a
 *  striped awning in two tiers dropping toward the front with a toothed valance. (x, z) = centre; front faces +z. */
export function stall(w: W, x: number, z: number, o: { wid: number; dep: number; stripe: [number, number]; tattered?: boolean }) {
  const k = KC, X = M(x), Z = M(z), hx = M(o.wid) >> 1, hz = M(o.dep) >> 1, H = 30;
  for (const px of [X - hx, X + hx]) for (const pz of [Z - hz, Z + hz]) w.box(px - 1, -2, pz - 1, px + 1, pz === Z + hz ? H - 3 : H, pz + 1, k.woodD);
  // counter
  boardWall(w, X - hx + 2, 0, Z + hz - 2, X + hx - 2, 11, Z + hz - 1, k.plank, k.plankB, k.seam, 4);
  w.box(X - hx + 2, 0, Z + hz - 1, X + hx - 2, 1, Z + hz - 1, k.woodD);
  w.box(X - hx + 1, 12, Z + hz - 5, X + hx - 1, 12, Z + hz, k.woodL);
  w.box(X - hx + 2, 0, Z + hz - 6, X + hx - 2, 11, Z + hz - 3, k.woodD);
  // back shelves between the back posts
  for (const sy of [10, 18]) w.box(X - hx + 2, sy, Z - hz, X + hx - 2, sy, Z - hz + 3, k.wood);
  boardWall(w, X - hx + 2, 0, Z - hz - 1, X + hx - 2, 24, Z - hz - 1, k.plankB, k.plank, k.seam, 4);
  // awning: back tier high, front tier lower and reaching past the front posts; stripes along z; a toothed valance
  const [s0, s1] = o.stripe, st = (u: number) => (Math.floor((u - (X - hx - 4)) / 4) & 1 ? s1 : s0);
  for (let u = X - hx - 3; u <= X + hx + 3; u++) {
    w.box(u, H + 1, Z - hz - 2, u, H + 2, Z, st(u));
    w.box(u, H - 2, Z + 1, u, H - 1, Z + hz + 5, st(u));
    const gone = !!o.tattered && hash(u, 11) < 0.4, long = !!o.tattered && hash(u, 12) < 0.18;
    if (((u - X) & 1) === 0) { if (!gone) w.box(u, long ? H - 5 : H - 3, Z + hz + 5, u, H - 3, Z + hz + 5, st(u)); } else w.set(u, H - 2, Z + hz + 6, 0x2a2228);
  }
  w.box(X - hx - 3, H, Z - hz - 2, X + hx + 3, H, Z - hz - 2, k.woodD).box(X - hx - 3, H - 3, Z + hz + 6, X + hx + 3, H - 3, Z + hz + 6, null);
  if (o.tattered) {
    // a rent through the front tier (the counter shows through), the back boards gapped, one shelf come down at one end
    w.box(X + 3, H - 2, Z + hz - 2, X + 8, H - 1, Z + hz + 2, null).box(X - 12, H - 2, Z + hz + 3, X - 9, H - 1, Z + hz + 5, null);
    w.box(X - hx + 7, 13, Z - hz - 1, X - hx + 10, 24, Z - hz - 1, null).box(X + 4, 17, Z - hz - 1, X + 6, 24, Z - hz - 1, null);
    w.box(X + 2, 18, Z - hz, X + hx - 2, 18, Z - hz + 3, null).box(X + 2, 16, Z - hz, X + hx - 2, 16, Z - hz + 3, k.wood);
  }
  return { top: 13, X, Z, hx, hz };
}

/** the old shrine: a three-step stone platform, a tiled floor, four columns (base, shaft, capital), a back wall with a niche holding a
 *  hooded statue whose hands cup a glowing orb, low side parapets, an entablature ring and a slate hip roof in wide tiers with moss on
 *  its upper treads and a finial. (x, z) = platform centre; the open front faces +z. Returns the orb position. */
export function shrineTemple(w: W, x: number, z: number, o: { orb: number; ruin?: boolean }) {
  const k = KC, X = M(x), Z = M(z), hx = M(2.5), hz = M(1.9);
  // stepped platform: each step a darker riser and a light nosing
  for (let i = 0; i < 3; i++) { const a = hx - i * 5, b = hz - i * 5, yt = 1 + i * 3; masonry(w, X - a, -1, Z - b, X + a, yt, Z + b, k.stoneD, k.mortar, { ch: 3, cl: 8, cap: k.stoneL }); }
  const F = 8, ix = hx - 10, iz = hz - 10;
  for (let a = -ix; a <= ix; a++) for (let b = -iz; b <= iz; b++) { const t = ((Math.floor((a + ix) / 6) + Math.floor((b + iz) / 6)) & 1); w.set(X + a, F - 1, Z + b, t ? k.stone : 0x646276); }
  // columns at the corners, the back wall with its niche, low parapets on the sides
  const cx = ix - 3, cz = iz - 3, CH = F + 30;
  for (const a of [-cx, cx]) for (const b of [-cz, cz]) {
    w.box(X + a - 3, F, Z + b - 3, X + a + 3, F + 1, Z + b + 3, k.stoneL);
    masonry(w, X + a - 2, F + 2, Z + b - 2, X + a + 2, CH - 2, Z + b + 2, k.stone, k.mortar, { ch: 6, cl: 5 });
    w.box(X + a - 3, CH - 1, Z + b - 3, X + a + 3, CH, Z + b + 3, k.stoneL);
  }
  masonry(w, X - cx + 3, F, Z - cz - 2, X + cx - 3, CH, Z - cz + 1, k.stone, k.mortar, { ch: 5, cl: 8 });
  w.box(X - 6, F + 4, Z - cz, X + 6, CH - 6, Z - cz + 1, null).box(X - 6, F + 4, Z - cz - 1, X + 6, CH - 6, Z - cz - 1, 0x3a3848);
  w.box(X - 7, CH - 5, Z - cz + 1, X + 7, CH - 5, Z - cz + 1, k.stoneL).box(X - 7, F + 3, Z - cz + 1, X + 7, F + 3, Z - cz + 1, k.stoneL);
  for (const a of [-cx, cx]) { masonry(w, X + a - 1, F, Z - cz + 3, X + a + 1, F + 9, Z + cz - 3, k.stone, k.mortar, { ch: 5, cl: 6, cap: k.stoneL }); }
  // the statue: pedestal, robe in two tiers, shoulders, hooded head, cupped hands with the orb
  const SZ = Z - cz + 4;
  w.box(X - 4, F, SZ - 3, X + 4, F + 2, SZ + 3, k.stoneD).box(X - 3, F + 3, SZ - 2, X + 3, F + 3, SZ + 2, k.stoneL);
  w.box(X - 3, F + 4, SZ - 2, X + 3, F + 13, SZ + 2, k.statue).box(X - 2, F + 14, SZ - 2, X + 2, F + 19, SZ + 1, k.statue);
  w.box(X - 3, F + 18, SZ - 2, X + 3, F + 19, SZ + 1, k.statue).box(X - 2, F + 20, SZ - 2, X + 2, F + 24, SZ + 2, 0x8a889c).box(X - 1, F + 21, SZ + 2, X + 1, F + 23, SZ + 2, 0x2a2834);
  w.box(X - 3, F + 4, SZ + 3, X + 3, F + 4, SZ + 3, 0x8a889c).box(X - 2, F + 13, SZ + 2, X + 2, F + 14, SZ + 4, k.statue).box(X - 1, F + 15, SZ + 3, X + 1, F + 16, SZ + 4, o.orb, 1);
  w.box(X - 3, F + 20, SZ - 2, X - 3, F + 20, SZ, k.moss).box(X + 3, F + 19, SZ - 2, X + 3, F + 19, SZ - 1, k.moss);
  // entablature ring and roof
  const ex = cx + 4, ez = cz + 4;
  w.box(X - ex, CH + 1, Z - ez, X + ex, CH + 3, Z + ez, k.stoneL).box(X - ex, CH + 2, Z - ez, X + ex, CH + 2, Z + ez, k.stone);
  w.box(X - ex + 2, CH + 1, Z - ez + 2, X + ex - 2, CH + 3, Z + ez - 2, k.stone);
  const ry = hipRoof(w, X - ex - 4, X + ex + 4, Z - ez - 4, Z + ez + 4, CH + 4, 4, 3, 5, k.slate, k.slateD, k.moss);
  w.box(X - 2, ry, Z - 2, X + 2, ry + 1, Z + 2, k.stoneL).box(X - 1, ry + 2, Z - 1, X + 1, ry + 5, Z + 1, k.stone).set(X, ry + 6, Z, k.stoneL);
  if (o.ruin) {
    // the front-right corner of the roof has caved in two wide steps; the column under it lost a bite; slates and a capital lie below
    w.box(X + ex - 7, CH + 7, Z + ez - 7, X + ex + 5, ry + 1, Z + ez + 5, null).box(X + ex - 2, CH + 1, Z + ez - 2, X + ex + 5, CH + 6, Z + ez + 5, null);
    w.box(X + ex - 7, CH + 6, Z + ez - 7, X + ex - 3, CH + 6, Z + ez - 3, k.slateD).box(X + ex - 2, CH, Z + ez - 6, X + ex - 1, CH, Z + ez - 2, k.stoneL);
    w.box(X + cx + 1, F + 12, Z + cz + 1, X + cx + 2, F + 18, Z + cz + 2, null);
    for (const [a, b, l] of [[ex + 6, ez + 2, 6], [ex + 2, ez + 7, 8], [ex + 9, ez + 8, 5]]) w.box(X + a, 0, Z + b, X + a + l, 1, Z + b + 3, k.slate).box(X + a, 1, Z + b, X + a + l, 1, Z + b, k.slateD);
    w.box(X + ex + 4, 0, Z + ez + 12, X + ex + 9, 3, Z + ez + 16, k.stoneL);
    // the statue's face worn smooth; moss over the hood and the steps; one step heaved up by a root
    w.box(X - 1, F + 21, SZ + 2, X + 1, F + 23, SZ + 2, k.statue).box(X - 2, F + 24, SZ - 2, X + 2, F + 24, SZ + 2, k.moss);
    w.box(X - hx + 6, 1, Z + hz - 2, X - hx + 14, 2, Z + hz, k.stoneD).box(X - hx + 6, 3, Z + hz - 2, X - hx + 14, 3, Z + hz, k.stoneL).box(X - hx + 2, 0, Z + hz + 1, X - hx + 18, 0, Z + hz + 2, k.bark);
    w.box(X - hx, 2, Z - hz, X - hx + 10, 2, Z - hz + 6, k.moss).box(X + hx - 12, 5, Z + hz - 5, X + hx - 5, 5, Z + hz - 5, k.moss);
  }
  return at(X, F + 16, SZ + 4);
}

/** a stone lantern post (shrine approach): stepped base, square shaft, a lamp box glowing through its four windows, a stepped cap */
export function stoneLamp(w: W, x: number, z: number, glowC: number, lit = true) {
  const k = KC, X = M(x), Z = M(z);
  w.box(X - 4, -1, Z - 4, X + 4, 1, Z + 4, k.stoneD).box(X - 3, 2, Z - 3, X + 3, 3, Z + 3, k.stone).box(X - 2, 4, Z - 2, X + 2, 14, Z + 2, k.stone);
  w.box(X - 3, 15, Z - 3, X + 3, 15, Z + 3, k.stoneL).box(X - 3, 16, Z - 3, X + 3, 21, Z + 3, k.stone);
  w.box(X - 1, 17, Z - 3, X + 1, 20, Z + 3, lit ? glowC : 0x1e1c24, lit ? 1 : 0).box(X - 3, 17, Z - 1, X + 3, 20, Z + 1, lit ? glowC : 0x1e1c24, lit ? 1 : 0);
  w.box(X - 4, 22, Z - 4, X + 4, 23, Z + 4, k.stoneL).box(X - 2, 24, Z - 2, X + 2, 25, Z + 2, k.stone).box(X - 2, 25, Z - 2, X + 2, 25, Z + 2, k.moss);
  return [x, 19 * CELL, z] as P3;
}

/** a wayside shrine by the trail: a stone post on a stepped base with a niche toward +z holding a candle, a two-tier stone hood,
 *  a little offering bowl and a cairn of flat stones at its foot. Returns the candle spot. */
export function wayShrine(w: W, x: number, z: number) {
  const k = KC, X = M(x), Z = M(z);
  w.box(X - 5, -1, Z - 5, X + 5, 1, Z + 5, k.stoneD).box(X - 4, 2, Z - 4, X + 4, 3, Z + 4, k.stoneL);
  masonry(w, X - 3, 4, Z - 3, X + 3, 22, Z + 3, k.stone, k.mortar, { ch: 5, cl: 4 });
  w.box(X - 2, 11, Z + 2, X + 2, 17, Z + 3, null).box(X - 2, 11, Z + 1, X + 2, 17, Z + 1, 0x2a2834).box(X - 3, 10, Z + 3, X + 3, 10, Z + 4, k.stoneL);
  w.box(X, 11, Z + 2, X, 12, Z + 2, KC.cream).set(X, 13, Z + 2, KC.warm, 1);
  w.box(X - 5, 23, Z - 5, X + 5, 24, Z + 5, k.slate).box(X - 5, 23, Z - 5, X + 5, 23, Z + 5, k.slateD).box(X - 3, 25, Z - 3, X + 3, 26, Z + 3, k.slate).box(X - 3, 27, Z - 3, X + 3, 27, Z + 3, k.moss).box(X - 1, 28, Z - 1, X + 1, 29, Z + 1, k.stoneL);
  w.box(X + 6, 0, Z + 4, X + 9, 0, Z + 7, k.stoneD).box(X + 7, 1, Z + 5, X + 8, 1, Z + 6, 0x7a4a2a).set(X + 7, 2, Z + 5, 0xc84a3a).set(X + 8, 2, Z + 6, 0xd8b040);
  w.box(X - 9, 0, Z + 3, X - 6, 0, Z + 6, k.stoneD).box(X - 9, 1, Z + 4, X - 7, 1, Z + 6, k.stone).box(X - 8, 2, Z + 4, X - 7, 2, Z + 5, k.stoneL).set(X - 8, 3, Z + 4, k.stone);
  return at(X, 14, Z + 3);
}

/** a big stump with ringed top, an axe buried in its top edge (head upright in the wood, handle level, reaching out over the edge) */
export function stumpAxe(w: W, x: number, z: number, r: number, h: number) {
  const k = KC, X = M(x), Z = M(z);
  w.box(X - r, -2, Z - r, X + r, h, Z + r, k.bark).box(X - r - 2, -2, Z - 2, X + r + 2, 1, Z + 1, k.barkD).box(X - 1, -2, Z - r - 2, X + 1, 1, Z + r + 2, k.barkD);
  w.box(X - r + 1, h, Z - r + 1, X + r - 1, h, Z + r - 1, k.ring).box(X - r + 3, h, Z - r + 3, X + r - 3, h, Z + r - 3, k.ringD).box(X - r + 4, h, Z - r + 4, X + r - 4, h, Z + r - 4, k.ring).set(X, h, Z, k.ringD);
  w.box(X + r - 3, h - 1, Z - 2, X + r - 3, h + 3, Z + 1, k.ironL).box(X + r - 3, h + 1, Z - 3, X + r - 3, h + 3, Z - 3, 0x9a98a8);
  w.box(X + r - 2, h + 2, Z, X + r + 9, h + 2, Z, k.woodL).set(X + r + 9, h + 1, Z, k.woodL);
  return [x, h * CELL, z] as P3;
}
/** a chopping block (short ringed round) with a hatchet lying across it and split pieces beside */
export function choppingBlock(w: W, x: number, z: number) {
  const k = KC, X = M(x), Z = M(z);
  w.box(X - 3, 0, Z - 3, X + 3, 6, Z + 3, k.bark).box(X - 2, 6, Z - 2, X + 2, 6, Z + 2, k.ring).set(X, 6, Z, k.ringD);
  w.box(X - 1, 7, Z - 4, X - 1, 7, Z + 4, k.woodL).box(X - 2, 7, Z + 3, X, 8, Z + 5, k.ironL);
  w.box(X + 5, 0, Z - 2, X + 9, 1, Z - 1, k.ring).box(X + 5, 0, Z + 1, X + 8, 1, Z + 2, k.ringD).box(X + 4, 2, Z, X + 7, 2, Z, k.ring);
}
/** a cooking frame over a fire: two forked uprights, a crossbar, a pot on a short chain */
export function cookFrame(w: W, x: number, z: number) {
  const k = KC, X = M(x), Z = M(z), H = 20;
  for (const e of [-11, 11]) { w.box(X + e, -2, Z, X + e, H, Z, k.woodD); w.box(X + e - 1, H + 1, Z, X + e - 1, H + 2, Z, k.woodD).box(X + e + 1, H + 1, Z, X + e + 1, H + 2, Z, k.woodD); }
  w.box(X - 13, H + 1, Z, X + 13, H + 1, Z, k.wood);
  w.box(X, H - 3, Z, X, H, Z, k.iron);
  w.box(X - 3, H - 9, Z - 3, X + 3, H - 4, Z + 3, k.iron).box(X - 4, H - 4, Z - 4, X + 4, H - 4, Z + 4, k.ironL).box(X - 2, H - 4, Z - 2, X + 2, H - 4, Z + 2, 0x7a5a3a);
}
/** a bedroll: a rolled blanket, a pillow, a folded top edge */
export function bedroll(w: W, x: number, z: number, alongX: boolean, col: number, edge: number) {
  const X = M(x), Z = M(z), a = alongX ? 12 : 5, b = alongX ? 5 : 12;
  w.box(X - a, 0, Z - b, X + a, 1, Z + b, col);
  if (alongX) w.box(X - a, 0, Z - b, X - a + 3, 2, Z + b, edge).box(X - a + 4, 2, Z - 3, X - a + 7, 3, Z + 3, KC.cream); else w.box(X - a, 0, Z - b, X + a, 2, Z - b + 3, edge).box(X - 3, 2, Z - b + 4, X + 3, 3, Z - b + 7, KC.cream);
}
/** a drying rack: two posts, a crossbar, three hides hanging in different sizes and tones */
export function dryingRack(w: W, x: number, z: number, cols: number[]) {
  const k = KC, X = M(x), Z = M(z), H = 22;
  w.box(X - 14, -2, Z, X - 13, H, Z, k.woodD).box(X + 13, -2, Z, X + 14, H, Z, k.woodD).box(X - 15, H + 1, Z, X + 15, H + 1, Z, k.wood);
  [[-11, -4, 12], [-2, 4, 9], [6, 11, 14]].forEach(([a, b, d], i) => { w.box(X + a, H - d, Z + 1, X + b, H, Z + 1, cols[i % cols.length]); w.box(X + a, H, Z + 1, X + b, H, Z + 1, k.woodD); });
}
/** a weapon rack: two posts and two rails, swords and an axe standing in it, a round-ish shield (three wide tiers) on the post */
export function weaponRack(w: W, x: number, z: number) {
  const k = KC, X = M(x), Z = M(z);
  w.box(X - 10, -2, Z, X - 9, 16, Z, k.woodD).box(X + 9, -2, Z, X + 10, 16, Z, k.woodD).box(X - 10, 14, Z - 1, X + 10, 14, Z + 1, k.wood).box(X - 10, 4, Z - 1, X + 10, 4, Z + 1, k.wood);
  for (const u of [-6, -2, 2]) { w.box(X + u, 0, Z, X + u, 18, Z, 0xb8b8c8).box(X + u - 2, 13, Z, X + u + 2, 13, Z, k.brass).box(X + u, 14, Z, X + u, 16, Z, k.woodD); }
  w.box(X + 6, 0, Z, X + 6, 19, Z, k.woodL).box(X + 4, 14, Z, X + 7, 19, Z, k.ironL);
  const SX = X + 13, SY = 9;
  w.box(SX - 4, SY - 2, Z + 1, SX + 4, SY + 2, Z + 1, k.blue).box(SX - 3, SY - 3, Z + 1, SX + 3, SY + 3, Z + 1, k.blue).box(SX - 2, SY - 4, Z + 1, SX + 2, SY + 4, Z + 1, k.blue);
  w.box(SX - 4, SY, Z + 2, SX + 4, SY, Z + 2, k.brass).box(SX, SY - 4, Z + 2, SX, SY + 4, Z + 2, k.brass).box(SX - 1, SY - 1, Z + 2, SX + 1, SY + 1, Z + 3, k.ironL);
}
/** a grindstone: a stone wheel (stepped octagon) on an axle between two posts, a crank, a little water trough below */
export function grindstone(w: W, x: number, z: number) {
  const k = KC, X = M(x), Z = M(z);
  w.box(X - 5, -2, Z - 4, X - 4, 12, Z - 3, k.woodD).box(X - 5, -2, Z + 3, X - 4, 12, Z + 4, k.woodD);
  wheel(w, X - 6, 10, Z - 1, 7, 'x', 0x8a8898, 0x7a7888, k.iron, 3);
  w.box(X - 7, 10, Z - 5, X - 7, 10, Z + 6, k.iron).box(X - 7, 10, Z + 6, X - 7, 13, Z + 6, k.woodL);
  w.box(X - 10, 0, Z - 5, X, 2, Z + 5, k.wood).box(X - 9, 2, Z - 4, X - 1, 2, Z + 4, 0x3a5a7a);
}

// ------------------------------------------------------------------ the dead and the abandoned
/** a crow perched at the leg cell (X, Y, Z), looking along dir: a black body with a slightly lighter back, a raised head, a grey beak,
 *  a tail held low behind. About 0.6 m nose to tail — chunky enough to read from the battle camera. */
export function crow(w: W, X: number, Y: number, Z: number, dir: 'x+' | 'x-' | 'z+' | 'z-') {
  const s = dir[1] === '+' ? 1 : -1, ax = dir[0] === 'x';
  const put = (a0: number, a1: number, y0: number, y1: number, b0: number, b1: number, c: number) => {
    const p0 = s * a0, p1 = s * a1;
    if (ax) w.box(X + Math.min(p0, p1), Y + y0, Z + b0, X + Math.max(p0, p1), Y + y1, Z + b1, c); else w.box(X + b0, Y + y0, Z + Math.min(p0, p1), X + b1, Y + y1, Z + Math.max(p0, p1), c);
  };
  put(0, 0, 0, 0, 0, 1, 0x3a3640);
  put(-2, 1, 1, 3, 0, 1, 0x141218);
  put(-2, 0, 3, 3, 0, 1, 0x26222c);
  put(-4, -3, 2, 2, 0, 1, 0x141218);
  put(1, 2, 3, 5, 0, 1, 0x141218);
  put(3, 3, 4, 4, 0, 0, 0x56525c);
}
/** the highest solid cell under (x, z) plus one — where something set down there would stand (cells) */
export function topAt(w: W, x: number, z: number, from = 120) { const X = M(x), Z = M(z); for (let y = from; y >= -2; y--) if (w.has(X, y, Z)) return y + 1; return 0; }
/** a crow on whatever is highest at (x, z): a post top, a ridge, a branch, a gravestone */
export function perch(w: W, x: number, z: number, dir: 'x+' | 'x-' | 'z+' | 'z-') { crow(w, M(x), topAt(w, x, z), M(z), dir); }
/** a crate gone to pieces: its lid gone, the top of the front stove in (in two wide steps), dark inside, the lid boards on the ground */
export function brokenCrate(w: W, x: number, z: number, sz: number, c: number, band: number) {
  const X = M(x), Z = M(z), H = 2 * sz;
  w.box(X - sz, 0, Z - sz, X + sz, H, Z + sz, c).box(X - sz + 1, 1, Z - sz + 1, X + sz - 1, H, Z + sz - 1, null).box(X - sz + 1, 0, Z - sz + 1, X + sz - 1, 0, Z + sz - 1, KC.dark);
  for (const [a, b] of [[-sz, -sz], [sz, -sz], [-sz, sz], [sz, sz]]) w.box(X + a, 0, Z + b, X + a, H, Z + b, band);
  w.box(X - sz + 1, sz, Z + sz, X + sz - 1, H, Z + sz, null).box(X, sz - 2, Z + sz, X + sz - 1, sz - 1, Z + sz, null);
  w.box(X + sz + 2, 0, Z - sz, X + sz + 4, 0, Z + sz - 1, c).box(X - sz, 0, Z + sz + 2, X - 1, 0, Z + sz + 4, c);
}
/** a barrel lying on its side, rusted hoops, its open end dark, what was in it spilled out as a flat dark stain (the caller adds it) */
export function barrelSide(w: W, x: number, z: number, along: 'x' | 'z', wood: number, hoop: number) {
  const X = M(x), Z = M(z), L = 11;
  logX(w, along === 'x' ? X - (L >> 1) : X, 0, along === 'x' ? Z : Z - (L >> 1), L, 7, along, wood, KC.woodL, KC.dark);
  for (const u of [2, L - 3]) for (let a = -3; a <= 3; a++) for (let y = 0; y < 7; y++) {
    if ((Math.abs(a) === 3 || y === 0 || y === 6) && !(Math.abs(a) === 3 && (y === 0 || y === 6))) { if (along === 'x') w.set(X - (L >> 1) + u, y, Z + a, hoop); else w.set(X + a, y, Z - (L >> 1) + u, hoop); }
  }
  const e = (along === 'x' ? X : Z) - (L >> 1) + L - 1;
  if (along === 'x') w.box(e, 1, Z - 2, e, 5, Z + 2, KC.dark); else w.box(X - 2, 1, e, X + 2, 5, e, KC.dark);
}

