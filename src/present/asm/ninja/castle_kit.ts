// 忍之章 · 城郭的道具库（castle 代理）：石垣（3～4 段大台阶，成行的大块石、算木积的长短角石）、白壁黑板的墙身（下见板、
// 连子窗、狭间）、金鯱、本地镜像坐标。铁律：横平竖直的大块体；花纹只用结构（石缝、框、带），不逐格随机。
// 坐标：米用 M() 换算成格（7 厘米），地面顶 y = 0（地面格在 y = −1）。
import { M, hash, type W } from '../../scenes/props';
import { TC } from '../../kyoto/temple_kit';

/** 城郭调色：灰白石垣、白壁、黑板、金、朱 */
export const CC = {
  st: [0x948f84, 0x8a857a, 0x9d998e] as const, stJ: 0x57534b, stC: 0xaaa69a, stTop: 0xa39f93,
  wall: 0xe8e4d8, wallD: 0xcfcabd, board: 0x2c2826, boardL: 0x3e3936, boardD: 0x1a1716, hole: 0x141210,
  gold: 0xd8a848, goldD: 0x9a7432, goldL: 0xf0cc70,
  verm: TC.verm, vermD: TC.vermD, vermL: TC.vermL,
  iron: 0x34343a, ironL: 0x5c5c66,
  wood: 0x5a4030, woodD: 0x3a2a20, woodL: 0x7a5a40, pale: 0x9a7a58,
  earth: 0x605848, earthD: 0x585040, earthL: 0x6a604f, gravel: 0x6a6862, gravelD: 0x605e58, gran: [0x7e7b72, 0x76736a, 0x858279] as const, granJ: 0x4e4c46, gutter: 0x46443e,
  cloth: 0xece6d8, clothD: 0xcdc6b6, indigo: 0x2a3452, indigoL: 0x3c4a6e,
  straw: 0xa88c4c, strawD: 0x86703a, strawL: 0xb89c5c, rope: 0x6a4e2a,
  fire: 0xc0642a, fireCore: 0xffb060, ember: 0x8a3a1c,
  tile: 0x474c52, tileD: 0x2a2e34, tileL: 0x60666c, ridge: 0x34383e, lamp: 0x9a5c2c, paper: 0xa0602c, paperD: 0x7a4422, core: 0xffb868,
  horse: 0x6a4630, horseD: 0x3e2a1e, grey: 0xb8b4ac, greyD: 0x8a867e,
};

/** a mirrored local frame: lx grows away from the battle floor (s = +1 → +x, s = −1 → −x, 0 counts as +1) */
export function fr(w: W, X: number, s: number) {
  const k = s < 0 ? -1 : 1;
  return {
    k, x: (a: number) => X + k * a,
    box(a: number, y0: number, z0: number, b: number, y1: number, z1: number, c: number | null, g = 0) { w.box(X + k * a, y0, z0, X + k * b, y1, z1, c, g); return this; },
    set(a: number, y: number, z: number, c: number | null, g = 0) { w.set(X + k * a, y, z, c, g); return this; },
  };
}

/** a solid box. (A hollow shell looks cheaper but is not: the mesher emits every inner face of the hollow, ~100× the triangles.) */
export function shell(w: W, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, _t = 2) {
  w.box(x0, y0, z0, x1, y1, z1, c);
}

// ------------------------------------------------------------------ ishigaki: the battered stone base in a few big tiers
export interface Tier { h: number; inset: number }
/**
 * A stone base over [x0..x1]×[z0..z1] (cells) from y0: each tier steps in by its inset on all four sides (the batter of the wall in
 * three or four big steps). Faces: two courses per tier, blocks 8–12 cells long in three close greys with dark joints, the corners
 * built of long and short light stones alternating (sangi-zumi), the lip of each tier a light row. Returns the top rect and the y
 * above it. faces: which sides to dress ('xz' all; the far ring passes fewer to save quads).
 */
export function ishigaki(w: W, x0: number, z0: number, x1: number, z1: number, y0: number, tiers: Tier[], o: { seed?: number; top?: number; plain?: boolean } = {}) {
  const sd = o.seed ?? 1;
  let a = x0, b = x1, c = z0, e = z1, y = y0;
  for (let t = 0; t < tiers.length; t++) {
    const { h, inset } = tiers[t];
    if (t > 0) { a += inset; b -= inset; c += inset; e -= inset; }
    const ya = y, yb = y + h - 1;
    shell(w, a, ya, c, b, yb, e, CC.st[0]);
    w.box(a, yb, c, b, yb, e, o.top ?? CC.stTop);
    const ch = Math.max(3, Math.ceil(h / 2));
    // one face: u runs along it, put(u, y, col)
    const face = (u0: number, u1: number, fid: number, alongX: boolean, put: (u: number, yy: number, col: number) => void) => {
      // plain (far ring): only the course lines and the tier lip, which merge into long strips
      if (o.plain) { for (let yy = ya; yy <= yb; yy++) { const ly = (yy - ya) % ch; for (let u = u0; u <= u1; u++) put(u, yy, yy === yb ? CC.stTop : ly === ch - 1 ? CC.stJ : CC.st[(t + Math.floor((yy - ya) / ch)) % 3]); } return; }
      for (let yy = ya; yy <= yb; yy++) {
        const r = Math.floor((yy - ya) / ch) + t * 2, ly = (yy - ya) % ch, L = 8 + Math.floor(hash(r, fid, sd * 7 + 11) * 5), off = Math.floor(hash(r, fid, sd * 7 + 12) * L);
        const cl = (r + (alongX ? 0 : 1)) & 1 ? 10 : 5;
        for (let u = u0; u <= u1; u++) {
          const d0 = u - u0, d1 = u1 - u; let col: number;
          if (yy === yb) col = CC.stTop;
          else if (d0 < cl || d1 < cl) col = ly === ch - 1 || d0 === cl - 1 || d1 === cl - 1 ? CC.stJ : CC.stC;
          else { const k = u - u0 - cl + off; col = ly === ch - 1 || k % L === L - 1 ? CC.stJ : CC.st[Math.floor(hash(Math.floor(k / L), r, fid * 31 + sd) * 3)]; }
          put(u, yy, col);
        }
      }
    };
    face(a, b, 0, true, (u, yy, col) => w.set(u, yy, e, col));
    face(a, b, 1, true, (u, yy, col) => w.set(u, yy, c, col));
    face(c, e, 2, false, (u, yy, col) => w.set(b, yy, u, col));
    face(c, e, 3, false, (u, yy, col) => w.set(a, yy, u, col));
    y = yb + 1;
  }
  return { x0: a, x1: b, z0: c, z1: e, y };
}

// ------------------------------------------------------------------ a castle storey: black boards below, white plaster above
export interface StoreyOpt {
  /** height of the black weatherboard band (cells); 0 = all white */
  bh: number;
  /** window pitch along each face (cells, 0 = none), window height, window bottom above y0 */
  win?: number; winH?: number; winY?: number;
  /** small gun / arrow ports in the white band between the windows */
  ports?: boolean;
  /** which faces get openings: any of 'n' (−z) 's' (+z) 'e' (+x) 'w' (−x); default all */
  open?: string;
  /** night: every other window glows warm (lamp-lit rooms) */
  lit?: boolean;
}
/**
 * A hollow storey [x0..x1]×[z0..z1] from y0, h cells tall: weatherboards (black, a lighter batten every 9 cells, a dark sill on top),
 * white plaster above, a dark beam under the eave. Windows are real recesses (the outer cell cut away, a dark cell behind) with one
 * board-coloured bar down the middle; ports are 2×2 squares and 1×3 slots, alternating.
 */
export function storey(w: W, x0: number, z0: number, x1: number, z1: number, y0: number, h: number, o: StoreyOpt) {
  const y1 = y0 + h - 1, open = o.open ?? 'nsew';
  shell(w, x0, y0, z0, x1, y1, z1, CC.wall);
  const paint = (u0: number, u1: number, put: (u: number, yy: number, col: number | null) => void, inner: (u: number, yy: number, col: number, g?: number) => void, isOpen: boolean) => {
    for (let yy = y0; yy <= y1; yy++) for (let u = u0; u <= u1; u++) {
      let col = CC.wall;
      if (yy < y0 + o.bh) col = (u - u0) % 9 === 4 ? CC.boardL : CC.board;
      if (o.bh && yy === y0 + o.bh) col = CC.boardD;
      if (yy === y1 || yy === y1 - 1) col = CC.boardD;
      if (u === u0 || u === u1) col = yy < y0 + o.bh ? CC.boardD : CC.wallD;
      put(u, yy, col);
    }
    if (!isOpen) return;
    const len = u1 - u0, win = o.win ?? 0, wh = o.winH ?? 6, wy = y0 + (o.winY ?? o.bh + 3);
    const centres: number[] = [];
    if (win > 0) { const n = Math.max(1, Math.floor((len - 6) / win)); for (let i = 0; i < n; i++) centres.push(Math.round(u0 + len / 2 + (i - (n - 1) / 2) * win)); }
    centres.forEach((cu, wi) => {
      const glow = o.lit && (wi & 1) === 0;
      put(cu - 3, wy - 1, CC.boardD); put(cu + 3, wy - 1, CC.boardD);
      for (let u = cu - 3; u <= cu + 3; u++) { put(u, wy - 1, CC.boardD); put(u, wy + wh, CC.boardD); }
      for (let yy = wy; yy < wy + wh; yy++) { put(cu - 3, yy, CC.boardD); put(cu + 3, yy, CC.boardD); for (let u = cu - 2; u <= cu + 2; u++) { if (u === cu) { put(u, yy, CC.board); continue; } put(u, yy, null); inner(u, yy, glow ? CC.lamp : CC.hole, glow ? 1 : 0); } }
    });
    if (o.ports) {
      const py = Math.max(y0 + o.bh + 2, wy - 1), pts: number[] = [];
      if (centres.length > 1) for (let i = 0; i + 1 < centres.length; i++) pts.push((centres[i] + centres[i + 1]) >> 1);
      else if (len > 18) pts.push(u0 + 6, u1 - 6);
      pts.forEach((pu, i) => {
        if (i & 1) for (let yy = py; yy < py + 3; yy++) { put(pu, yy, null); inner(pu, yy, CC.hole); }
        else for (const [du, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { put(pu + du, py + dy, null); inner(pu + du, py + dy, CC.hole); }
      });
    }
  };
  paint(x0, x1, (u, yy, c) => w.set(u, yy, z1, c), (u, yy, c, g = 0) => w.set(u, yy, z1 - 1, c, g), open.includes('s'));
  paint(x0, x1, (u, yy, c) => w.set(u, yy, z0, c), (u, yy, c, g = 0) => w.set(u, yy, z0 + 1, c, g), open.includes('n'));
  paint(z0, z1, (u, yy, c) => w.set(x1, yy, u, c), (u, yy, c, g = 0) => w.set(x1 - 1, yy, u, c, g), open.includes('e'));
  paint(z0, z1, (u, yy, c) => w.set(x0, yy, u, c), (u, yy, c, g = 0) => w.set(x0 + 1, yy, u, c, g), open.includes('w'));
  return y1 + 1;
}

/** a gold shachi on a ridge end: (X, Y, Z) = the cell on top of the ridge end; out = which way along the ridge is outward (±1);
 *  alongZ = the ridge runs along z. Head toward the ridge, body upright, tail stalk and a wide fin flaring outward at the top. */
export function shachi(w: W, X: number, Y: number, Z: number, out: 1 | -1, alongZ = false) {
  const put = (u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, c: number, g = 0) => alongZ ? w.box(X + v0, y0, Z + out * u0, X + v1, y1, Z + out * u1, c, g) : w.box(X + out * u0, y0, Z + v0, X + out * u1, y1, Z + v1, c, g);
  put(-4, Y, -1, -1, Y + 3, 1, CC.gold);
  put(-1, Y, -2, 1, Y + 5, 2, CC.gold);
  put(-1, Y, -2, 1, Y, 2, CC.goldD);
  put(0, Y + 6, -1, 2, Y + 8, 1, CC.gold);
  put(0, Y + 9, -2, 4, Y + 10, 2, CC.goldL);
  put(3, Y + 8, -2, 4, Y + 8, 2, CC.goldD);
  put(-3, Y + 2, -2, -3, Y + 2, -2, CC.boardD); put(-3, Y + 2, 2, -3, Y + 2, 2, CC.boardD);
}

/** recolour the roof tiles inside a box (roof() paints temple tiles): 'tile' = castle tiles (a touch lighter and greener), 'shingle' =
 *  weathered wood shingles (stables, sheds) */
export function retile(w: W, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, kind: 'tile' | 'shingle' = 'tile') {
  const to = kind === 'tile' ? [CC.tile, CC.tileD, CC.tileL, CC.ridge, 0x50565c] : [0x6a5a48, 0x4a3e32, 0x7e6c56, 0x54483a, 0x6a5a48];
  const map = new Map<number, number>([[TC.tile, to[0]], [TC.tileD, to[1]], [TC.tileL, to[2]], [TC.ridge, to[3]], [TC.ridgeL, to[4]]]);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const v = w.get(x, y, z); if (v) { const n = map.get(v.c); if (n != null) w.set(x, y, z, n, v.g); } }
}

/** a crest (mon) on a flat face, drawn through put(du, dv): a notched square ring r cells out, two thick bars across it (two-bar crest) */
export function mon(put: (du: number, dv: number) => void, r: number) {
  for (let du = -r; du <= r; du++) for (let dv = -r; dv <= r; dv++) {
    const a = Math.abs(du), b = Math.abs(dv); if (a + b > 2 * r - 3) continue;
    const ring = a >= r - 1 || b >= r - 1 || a + b >= 2 * r - 4;
    const bar = a <= r - 2 && (b === 2 || b === 3) && r >= 6;
    if (ring || bar) put(du, dv);
  }
}

/**
 * A white earthen wall (dobei) along a line: u runs a0..a1 (cells) along x (alongX) or z, centred across on c, 4 cells thick, from y0,
 * h cells tall: black weatherboards below, white plaster, a dark top beam, posts every ~2.4 m, gun / arrow ports (dark 2×2 squares and
 * 1×4 slots, alternating) and a small tile cap with a ridge. Returns the y above the cap.
 */
export function hei(w: W, a0: number, a1: number, c: number, y0: number, h: number, alongX: boolean, o: { ports?: boolean; bh?: number; flat?: boolean } = {}) {
  const A = Math.min(a0, a1), B = Math.max(a0, a1), bh = o.bh ?? 7, yt = y0 + h - 1;
  const put = (u0: number, ya: number, v0: number, u1: number, yb: number, v1: number, col: number) => alongX ? w.box(u0, ya, c + v0, u1, yb, c + v1, col) : w.box(c + v0, ya, u0, c + v1, yb, u1, col);
  put(A, y0, -2, B, yt, 1, CC.wall);
  if (bh) { put(A, y0, -2, B, y0 + bh - 1, 1, CC.board); for (let u = A + 4; u <= B; u += 9) put(u, y0, -2, u, y0 + bh - 1, 1, CC.boardL); put(A, y0 + bh, -2, B, y0 + bh, 1, CC.boardD); }
  put(A, yt, -2, B, yt, 1, CC.boardD);
  // posts every ~2.4 m: standing proud of both faces, or (flat: the far ring) flush, only a dark stripe — a proud post's concave edges
  // cost a column of per-cell quads each
  const pv = o.flat ? [-2, 1] : [-3, 2];
  for (let u = A; u <= B - 1; u += 34) put(u, y0, pv[0], u + 1, yt, pv[1], CC.boardD);
  put(B - 1, y0, pv[0], B, yt, pv[1], CC.boardD);
  if (o.ports && h >= bh + 10) { const py = y0 + bh + 4; let i = 0; for (let u = A + 10; u <= B - 8; u += 12, i++) { if (i & 1) put(u, py - 1, -2, u, py + 2, 1, CC.hole); else put(u, py, -2, u + 1, py + 1, 1, CC.hole); } }
  put(A - 1, yt + 1, -4, B + 1, yt + 1, 3, CC.tileD);
  put(A - 1, yt + 2, -3, B + 1, yt + 2, 2, CC.tile);
  put(A - 1, yt + 3, -1, B + 1, yt + 4, 0, CC.ridge);
  return yt + 5;
}
/** a notched square disc / prism (corners cut one cell) */
export function nsq(w: W, X: number, Z: number, r: number, y0: number, y1: number, c: number | null, g = 0) {
  w.box(X - r, y0, Z - r + 1, X + r, y1, Z + r - 1, c, g).box(X - r + 1, y0, Z - r, X + r - 1, y1, Z + r, c, g);
}
/** a hanging paper lantern whose top cap sits at Y (cells): black caps and a waist band, the paper at a warm mid glow (below the
 *  bloom threshold, so it never blows out), one bright core cell; a cord runs up to whatever is above it. Returns the light point (m). */
export function andon(w: W, X: number, Y: number, Z: number, h = 7, o: { crest?: boolean } = {}) {
  for (let y = Y + 1; y < Y + 14 && !w.has(X, y, Z); y++) w.set(X, y, Z, CC.boardD);
  w.box(X - 2, Y, Z - 2, X + 2, Y, Z + 2, CC.boardD).box(X - 2, Y - h - 1, Z - 2, X + 2, Y - h - 1, Z + 2, CC.boardD);
  w.box(X - 3, Y - h, Z - 2, X + 3, Y - 1, Z + 2, CC.paper, 1).box(X - 2, Y - h, Z - 3, X + 2, Y - 1, Z + 3, CC.paper, 1);
  w.box(X - 3, Y - (h >> 1) - 1, Z - 2, X + 3, Y - (h >> 1) - 1, Z + 2, CC.paperD, 1).box(X - 2, Y - (h >> 1) - 1, Z - 3, X + 2, Y - (h >> 1) - 1, Z + 3, CC.paperD, 1);
  if (o.crest) w.box(X - 1, Y - (h >> 1) - 2, Z + 3, X + 1, Y - (h >> 1), Z + 3, CC.boardD);
  w.set(X, Y - (h >> 1), Z, CC.core, 1);
  return [(X + 0.5) * 0.07, (Y - (h >> 1) + 0.5) * 0.07, (Z + 0.5) * 0.07] as [number, number, number];
}
/** m → cells, re-exported for the building files */
export { M };
