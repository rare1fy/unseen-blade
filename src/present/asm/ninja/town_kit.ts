// 城下町的道具库（town 代理）：町屋立面（格子、暖帘、虫笼窗、出檐、卯建）、瓦顶 / 板葺顶、提灯、行灯、酒樽、招牌。
// 铁律：横平竖直的大块体；屋顶是 3～5 块宽台阶板（每段 ≥ 3 格），不做斜坡；花纹只用框、带、缝和大色块，不用随机色点。
// 町屋在「立面坐标」里搭：u = 从临街檐口往里的进深（格），v = 沿街方向（格，从 Z0 起），y = 高。p.s 决定往哪边是里。
// 镜头从街口斜着看两排立面，所以「垂直于立面」的东西（悬挂招牌、卯建、山墙、立看板）是正对镜头的，重点做它们。
import { M, type W } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import type { Ctx } from '../../scenes/stage';
import type { Place } from '../types';

/** 城下町调色：深木、红殻格子、白壁、靛蓝暖帘、暖橙灯 */
export const TW = {
  wood: 0x4a3224, woodD: 0x2a1c16, woodL: 0x6c4c36, bengara: 0x7a3222, bengaraD: 0x4c1e16,
  plaster: 0xe2dccc, plasterD: 0xc4bcaa, namako: 0x34383f, stoneD: 0x5e5a54, stone: 0x7c7870, stoneL: 0x96928a,
  tile: 0x444852, tileD: 0x26282e, tileL: 0x5c616c, ridge: 0x30323a, board: 0x5e5246, boardD: 0x3e352e, boardL: 0x7a6c5a,
  indigo: 0x26386a, indigoD: 0x182340, indigoL: 0x3a5290, white: 0xe8e2d2, red: 0xa02c20, redD: 0x701e18, gold: 0xc29440,
  straw: 0xc4ae7c, strawD: 0x9a8458, rope: 0x5a4a34, cedar: 0x2e4a2a, cedarL: 0x46683a, bamboo: 0x7a6a42, bambooD: 0x524630, bambooG: 0x5c8a40,
  paper: 0x8c7a5a, glowMid: 0xb8763a, glowCore: 0xe8a052, earth: [0x7a6a52, 0x74644e, 0x806e56] as number[], earthD: 0x5c5040,
  flag: [0x84827a, 0x7a7870, 0x8c8a80] as number[], joint: 0x4a4842, kerb: 0x6a6862, gutter: 0x2e3438, gutterL: 0x3c444a,
  brown: 0x6e3424, green: 0x3a5a3a, iron: 0x3a3a40,
};
/** noren / banner colours (the town's one strong accent besides the lamps) */
export const NOREN = [TW.indigo, TW.indigo, TW.brown, 0x3a4a3a, TW.indigoD];

// ------------------------------------------------------------------ the facade frame
/** a building's local frame. ax 'x': the street face is a line of constant x (I), rooms grow away from the street by s, the frontage
 *  runs along +z from A0. ax 'z': the street face is a line of constant z facing +z (toward the camera), the frontage runs along +x. */
export interface Fr { w: W; ax: 'x' | 'z'; s: 1 | -1; I: number; A0: number; F: number; D: number }
/** a frame for a facade group at p (beside the street, facing it): the eave edge sits 2 cells inside the foot's inner edge */
export function frameX(w: W, p: Place, foot: { w: number; d: number }): Fr {
  const s: 1 | -1 = p.s < 0 ? -1 : 1, I = M(p.x - s * foot.w / 2) + s * 2, A0 = M(p.z - foot.d / 2) + 1, A1 = M(p.z + foot.d / 2) - 1;
  return { w, ax: 'x', s, I, A0, F: A1 - A0, D: M(foot.w) - 5 };
}
/** a frame for a group in a back row facing the camera (+z): foot.w along x is the frontage, foot.d the depth */
export function frameZ(w: W, p: Place, foot: { w: number; d: number }): Fr {
  const I = M(p.z + foot.d / 2) - 2, A0 = M(p.x - foot.w / 2) + 1, A1 = M(p.x + foot.w / 2) - 1;
  return { w, ax: 'z', s: -1, I, A0, F: A1 - A0, D: M(foot.d) - 5 };
}
/** a narrower frame: frontage cells [a, b] of f */
export const sub = (f: Fr, a: number, b: number, D = f.D): Fr => ({ ...f, A0: f.A0 + a, F: b - a, D });
/** frame (u, v) → world cell (X, Z) */
export const fxz = (f: Fr, u: number, v: number): [number, number] => f.ax === 'x' ? [f.I + f.s * u, f.A0 + v] : [f.A0 + v, f.I + f.s * u];
/** a box in frame coordinates (inclusive) */
export function fb(f: Fr, u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, c: number | null, g = 0) {
  const [x0, z0] = fxz(f, u0, v0), [x1, z1] = fxz(f, u1, v1);
  f.w.box(x0, y0, z0, x1, y1, z1, c, g);
}
/** a hollow box: only its six faces (the inside of a house is never seen) */
export function shell(f: Fr, u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, c: number) {
  fb(f, u0, y0, v0, u1, y1, v0, c); fb(f, u0, y0, v1, u1, y1, v1, c);
  fb(f, u0, y0, v0, u0, y1, v1, c); fb(f, u1, y0, v0, u1, y1, v1, c);
  fb(f, u0, y1, v0, u1, y1, v1, c);
}
/** world position (metres) of a frame cell's centre */
export const fat = (f: Fr, u: number, y: number, v: number): [number, number, number] => { const [X, Z] = fxz(f, u, v); return [(X + 0.5) * CELL, (y + 0.5) * CELL, (Z + 0.5) * CELL]; };

// ------------------------------------------------------------------ roofs
export interface RoofCols { body: number; dark: number; lit: number; ridge: number }
export const TILE: RoofCols = { body: TW.tile, dark: TW.tileD, lit: TW.tileL, ridge: TW.ridge };
export const BOARD: RoofCols = { body: TW.board, dark: TW.boardD, lit: TW.boardL, ridge: TW.boardD };
/**
 * A gable roof in frame coordinates: plates stacked from the eave up, each stepping in by its inset from both long sides, eave row
 * dark, top row lit. Ridge along v (hira-iri, eaves to the street) or, with alongU, along u (tsuma-iri: the gable faces the street).
 * Board roofs can carry rows of river stones. Returns the y above the ridge.
 */
export function gableRoof(f: Fr, u0: number, u1: number, v0: number, v1: number, y: number, plates: Array<[number, number]>, rc: RoofCols = TILE, o: { stones?: boolean; ridge?: number; alongU?: boolean; end?: { col: number; at: 0 | 1 | 2 } } = {}) {
  let a = o.alongU ? v0 : u0, b = o.alongU ? v1 : u1, ya = y;
  const P = (p0: number, yy0: number, p1: number, yy1: number, c: number, q0 = o.alongU ? u0 : v0, q1 = o.alongU ? u1 : v1) =>
    o.alongU ? fb(f, q0, yy0, p0, q1, yy1, p1, c) : fb(f, p0, yy0, q0, p1, yy1, q1, c);
  plates.forEach(([ins, th], i) => {
    if (i > 0) { a += ins; b -= ins; }
    if (a > b) return;
    P(a, ya, b, ya + th - 1, rc.body); P(a, ya + th - 1, b, ya + th - 1, rc.lit);
    P(a, ya, a, ya, rc.dark); P(b, ya, b, ya, rc.dark);
    // the gable ends: the end face of each plate in the wall colour with a dark barge row on top (a stepped white gable)
    if (o.end && th > 1 && i > 0) for (const q of o.end.at === 2 ? [o.alongU ? u0 : v0, o.alongU ? u1 : v1] : [o.end.at === 1 ? (o.alongU ? u1 : v1) : (o.alongU ? u0 : v0)]) { P(a + 1, ya, b - 1, ya + th - 2, o.end.col, q, q); P(a, ya + th - 1, b, ya + th - 1, rc.dark, q, q); }
    ya += th;
  });
  const rh = o.ridge ?? 3, m = (a + b) >> 1, q0 = o.alongU ? u0 : v0, q1 = o.alongU ? u1 : v1;
  if (rh > 0) {
    P(m - 2, ya, m + 2, ya + rh - 1, rc.ridge);
    P(m - 3, ya, m + 3, ya + rh + 1, rc.ridge, q0, q0 + 2); P(m - 3, ya, m + 3, ya + rh + 1, rc.ridge, q1 - 2, q1);
  }
  // board roofs (ita-buki) are held down by river stones on battens: big grey blocks in two straight rows
  if (o.stones && !o.alongU) for (const uu of [u0 + 4, u1 - 4]) for (let v = v0 + 4; v < v1 - 3; v += 9) { fb(f, uu - 2, y + plates[0][1], v - 1, uu + 2, y + plates[0][1], v + 3, TW.boardD); fb(f, uu - 1, y + plates[0][1] + 1, v, uu + 1, y + plates[0][1] + 2, v + 2, TW.stone); }
  return ya + rh + 2;
}

// ------------------------------------------------------------------ lamps, signs, casks
/** a paper chochin hanging under the cell (X, Y + 4, Z): cord, dark caps, glowing paper, a bright core band. Returns its centre (m) */
export function chochin(w: W, X: number, Y: number, Z: number, h = 7, paper = 0xd8a85c, band?: number) {
  w.box(X, Y + 1, Z, X, Y + 3, Z, TW.woodD);
  w.box(X - 2, Y, Z - 2, X + 2, Y, Z + 2, TW.woodD);
  w.box(X - 3, Y - h, Z - 2, X + 3, Y - 1, Z + 2, paper, 1).box(X - 2, Y - h, Z - 3, X + 2, Y - 1, Z + 3, paper, 1);
  w.box(X - 1, Y - h + 2, Z - 3, X + 1, Y - 3, Z + 3, TW.glowCore, 1).box(X - 3, Y - h + 2, Z - 1, X + 3, Y - 3, Z + 1, TW.glowCore, 1);
  if (band != null) w.box(X - 3, Y - (h >> 1) - 1, Z - 2, X + 3, Y - (h >> 1), Z + 2, band).box(X - 2, Y - (h >> 1) - 1, Z - 3, X + 2, Y - (h >> 1), Z + 3, band);
  w.box(X - 2, Y - h - 1, Z - 2, X + 2, Y - h - 1, Z + 2, TW.woodD);
  return [(X + 0.5) * CELL, (Y - h / 2) * CELL, (Z + 0.5) * CELL] as [number, number, number];
}
/** an andon: a standing paper box lamp on four legs with a dark top frame (cells: base centre X, Z). Returns its centre (m) */
export function andon(w: W, X: number, Z: number, lit: boolean, h = 15) {
  for (const [a, b] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) w.box(X + a, -1, Z + b, X + a + 1, 4, Z + b + 1, TW.woodD);
  w.box(X - 3, 5, Z - 3, X + 3, h, Z + 3, lit ? TW.glowMid : TW.paper, lit ? 1 : 0);
  if (lit) w.box(X - 3, 8, Z - 1, X + 3, h - 3, Z + 1, TW.glowCore, 1).box(X - 1, 8, Z - 3, X + 1, h - 3, Z + 3, TW.glowCore, 1);
  w.box(X - 3, 5, Z - 3, X + 3, 5, Z + 3, TW.woodD).box(X - 4, h + 1, Z - 4, X + 4, h + 2, Z + 4, TW.woodD);
  return [(X + 0.5) * CELL, (h * 0.6) * CELL, (Z + 0.5) * CELL] as [number, number, number];
}
/** a straw-wrapped sake cask (komodaru) standing, its label facing ±x (dir), on y0 (cells) */
export function cask(w: W, X: number, Z: number, y0: number, dir: 1 | -1, label: number) {
  w.box(X - 3, y0, Z - 3, X + 3, y0 + 7, Z + 3, TW.straw);
  w.box(X - 3, y0 + 1, Z - 3, X + 3, y0 + 1, Z + 3, TW.rope).box(X - 3, y0 + 6, Z - 3, X + 3, y0 + 6, Z + 3, TW.rope);
  w.box(X - 2, y0 + 8, Z - 2, X + 2, y0 + 8, Z + 2, TW.strawD);
  w.box(X + dir * 3, y0 + 2, Z - 2, X + dir * 3, y0 + 5, Z + 2, label).box(X + dir * 3, y0 + 3, Z - 1, X + dir * 3, y0 + 4, Z + 1, TW.white);
}
/** the same cask with its label on the +z face (toward the camera) */
export function caskZ(w: W, X: number, Z: number, y0: number, label: number) {
  cask(w, X, Z, y0, 1, TW.straw);
  w.box(X - 2, y0 + 2, Z + 3, X + 2, y0 + 5, Z + 3, label).box(X - 1, y0 + 3, Z + 3, X + 1, y0 + 4, Z + 3, TW.white);
}
/** a crest (mon), 7×7 cells, on a vertical plane of the frame: plane 'u' = the plane u = at (a street-facing face, drawn in v / y),
 *  plane 'v' = the plane v = at (a face across the street, drawn in u / y); (m, y) = its centre */
export function crest(f: Fr, plane: 'u' | 'v', at: number, m: number, y: number, c: number, kind: number) {
  const put = (a0: number, dy0: number, a1 = a0, dy1 = dy0) => plane === 'u' ? fb(f, at, y + dy0, m + a0, at, y + dy1, m + a1, c) : fb(f, m + a0, y + dy0, at, m + a1, y + dy1, at, c);
  const k = ((kind % 4) + 4) % 4;
  if (k === 0) { put(-1, -3, 1, 3); put(-3, -1, 3, 1); }                          // a plus
  else if (k === 1) { put(-3, -3, 3, -2); put(-3, 2, 3, 3); put(-3, -1, -2, 1); put(2, -1, 3, 1); }   // a square ring
  else if (k === 2) { put(-3, -3, -2, 3); put(2, -3, 3, 3); put(-1, -1, 1, 1); } // two bars and a dot
  else { put(-3, 1, 3, 2); put(-3, -2, 3, -1); }                                    // two bands
}
/**
 * A hanging shop sign (kanban) sticking out from the eave into the street, perpendicular to the facade so the battle camera sees its
 * face: an iron bracket out of the wall, two short chains, a framed board with a crest. u0..u1 = how far it reaches (frame cells).
 */
export function kanban(f: Fr, v: number, yTop: number, u0: number, u1: number, board: number, mark: number, kind: number) {
  fb(f, u0, yTop, v, u1 + 2, yTop + 1, v, TW.iron);
  fb(f, u0 + 1, yTop - 2, v, u0 + 1, yTop - 1, v, TW.iron); fb(f, u1 - 1, yTop - 2, v, u1 - 1, yTop - 1, v, TW.iron);
  fb(f, u0, yTop - 12, v, u1, yTop - 3, v, TW.woodD); fb(f, u0 + 1, yTop - 11, v, u1 - 1, yTop - 4, v, board);
  crest(f, 'v', v + 1, (u0 + u1) >> 1, yTop - 8, mark, kind); crest(f, 'v', v - 1, (u0 + u1) >> 1, yTop - 8, mark, kind);
}
/** a free-standing lit sign box (andon kanban) under the eave, perpendicular to the facade (its face toward ±z) */
export function standSign(f: Fr, u: number, v: number, lit: boolean, mark: number) {
  fb(f, u - 1, -1, v - 1, u + 1, 2, v + 4, TW.woodD);
  fb(f, u - 1, 3, v - 1, u + 1, 15, v + 4, lit ? TW.glowMid : TW.paper, lit ? 1 : 0);
  fb(f, u - 1, 3, v - 1, u + 1, 3, v + 4, TW.woodD); fb(f, u - 1, 15, v - 1, u + 1, 16, v + 4, TW.woodD);
  fb(f, u, 6, v + 5, u, 12, v + 5, mark); fb(f, u, 6, v - 2, u, 12, v - 2, mark);
}

// ------------------------------------------------------------------ the machiya
export type Bay = 'koshi' | 'shop' | 'door' | 'wall' | 'sudare';
export interface MOpt {
  /** two storeys (upper storey under the main roof) or one */
  two: boolean;
  bays: Bay[];
  /** ground storey height (cells) */
  G?: number;
  /** upper storey wall height (cells) */
  U?: number;
  roof?: RoofCols; stones?: boolean;
  /** lattice colour (bengara red or dark wood) */
  lattice?: number;
  noren?: number;
  upper?: 'mushiko' | 'koshi' | 'balcony' | 'plaster';
  /** a fire wall at the near (+z) gable end, at both ends, or none */
  udatsu?: 0 | 1 | 2;
  lamp?: number;
  /** body depth (cells from the eave edge); default the frame depth */
  D?: number;
  /** the crest on the noren and its colour */
  mark?: number; kind?: number;
}
/** street-face setback: the eave reaches the street edge, the wall stands this far back (the inuyarai and the signs live here) */
export const SB = 8;
/**
 * A town house (machiya) facing the street: a stone sill, a ground storey of posts and bays (lattice over lit paper, open shop with
 * noren, sliding door, bamboo blind, plain wall), a lean-to eave over the street face, a plastered upper storey with mushiko slots or a
 * lattice window or a railed balcony, and the main gable roof. Returns the lamp spots (metres) for the caller to light.
 */
export function machiya(c: Ctx, f: Fr, o: MOpt) {
  const G = o.G ?? 34, U = o.U ?? 20, F = f.F, D = o.D ?? f.D, lat = o.lattice ?? TW.bengara, lit = (o.lamp ?? 1) > 0.3;
  const glow = lit ? TW.glowMid : TW.paper, gg = lit ? 1 : 0, lamps: Array<[number, number, number]> = [];
  // the plinth and the hollow body
  fb(f, SB, -1, 0, D, 0, F, TW.stoneD);
  shell(f, SB + 2, 1, 1, D, G, F - 1, TW.plaster);
  // the gable end walls (the +z end faces the camera): dark board wainscot, plaster above, timber posts and beams
  for (const v of [1, F - 1]) {
    fb(f, SB + 2, 1, v, D, 13, v, TW.wood); fb(f, SB + 2, 13, v, D, 13, v, TW.woodD);
    fb(f, SB + 2, 1, v, SB + 3, G, v, TW.woodD); fb(f, D - 1, 1, v, D, G, v, TW.woodD); fb(f, (SB + D) >> 1, 14, v, ((SB + D) >> 1) + 1, G, v, TW.woodD);
    fb(f, SB + 2, G - 2, v, D, G - 1, v, TW.woodD);
  }
  // the street face: sill, posts at the bay lines, the lintel beam proud of the face
  const n = o.bays.length, vs = Array.from({ length: n + 1 }, (_, i) => Math.round(1 + (i * (F - 2)) / n));
  fb(f, SB, 0, 1, SB + 2, 1, F - 1, TW.woodD);
  for (const v of vs) fb(f, SB, 0, v - 1, SB + 2, G, v + 1, TW.wood);
  fb(f, SB - 1, G - 6, 0, SB + 2, G - 4, F, TW.woodD);
  fb(f, SB + 1, G - 3, 1, SB + 1, G, F - 1, TW.plasterD);
  o.bays.forEach((kind, i) => {
    const a = vs[i] + 2, b = vs[i + 1] - 2, top = G - 7;
    if (b < a) return;
    if (kind === 'koshi') {
      // a lattice of slats one cell wide every three over lit paper, rails, and a low two-step inuyarai guard at its foot
      fb(f, SB + 2, 2, a, SB + 2, top, b, glow, gg);
      for (let v = a; v <= b; v += 3) fb(f, SB + 1, 2, v, SB + 1, top, v, lat);
      fb(f, SB + 1, 2, a, SB + 1, 3, b, lat); fb(f, SB + 1, 14, a, SB + 1, 15, b, lat); fb(f, SB + 1, top, a, SB + 1, top, b, lat);
      fb(f, SB - 3, 0, a, SB - 3, 3, b, TW.bambooD); fb(f, SB - 2, 4, a, SB - 1, 5, b, TW.bamboo); fb(f, SB - 2, 0, a, SB - 1, 3, b, TW.bambooD);
    } else if (kind === 'shop') {
      // open to the street: a raised board floor, the lit back wall, goods on the floor, the noren hanging from the lintel
      fb(f, SB + 2, 1, a, SB + 2, top, b, null);
      fb(f, SB, 0, a, SB + 15, 4, b, TW.woodL); fb(f, SB, 4, a, SB, 4, b, TW.woodD);
      fb(f, SB + 16, 1, a, SB + 16, top, b, glow, gg); fb(f, SB + 3, 5, a - 1, SB + 15, top, a - 1, TW.plasterD); fb(f, SB + 3, 5, b + 1, SB + 15, top, b + 1, TW.plasterD);
      fb(f, SB + 3, top + 1, a, SB + 16, top + 1, b, TW.woodD);
      for (let v = a + 1; v + 4 <= b; v += 7) fb(f, SB + 9, 5, v, SB + 14, 9, v + 4, (v / 7) & 1 ? TW.strawD : TW.wood);
      const nc = o.noren ?? TW.indigo;
      for (let v = a; v <= b; v += 6) fb(f, SB - 1, G - 18, v, SB - 1, G - 7, Math.min(b, v + 4), nc);
      crest(f, 'u', SB - 2, (a + b) >> 1, G - 12, o.mark ?? TW.white, o.kind ?? (a + F));
      lamps.push(fat(f, SB + 8, 18, (a + b) >> 1));
    } else if (kind === 'door') {
      // a sliding door: a dark frame, two paper panes and a kick board
      fb(f, SB + 2, 1, a, SB + 2, top, b, TW.woodD);
      fb(f, SB + 1, 9, a + 2, SB + 1, top - 2, b - 2, glow, gg); fb(f, SB + 1, 9, (a + b) >> 1, SB + 1, top - 2, (a + b) >> 1, TW.woodD);
    } else if (kind === 'sudare') {
      // a window behind a rolled-down bamboo blind: lit paper, the blind in wide bands, a small shelf with a pot in front
      fb(f, SB + 2, 12, a, SB + 2, top, b, glow, gg);
      fb(f, SB + 1, 12, a, SB + 1, top - 3, b, TW.bamboo); fb(f, SB + 1, 16, a, SB + 1, 16, b, TW.bambooD); fb(f, SB + 1, top - 3, a, SB + 1, top - 2, b, TW.bambooD);
      fb(f, SB + 1, 1, a, SB + 1, 11, b, TW.wood);
      fb(f, SB - 3, 6, a, SB, 7, b, TW.woodD); fb(f, SB - 2, 0, a, SB - 2, 5, a, TW.woodD); fb(f, SB - 2, 0, b, SB - 2, 5, b, TW.woodD);
      fb(f, SB - 2, 8, a + 1, SB - 1, 10, a + 3, TW.brown); fb(f, SB - 2, 11, a + 1, SB - 1, 13, a + 3, TW.green);
    } else {
      fb(f, SB + 1, 1, a, SB + 1, 13, b, TW.wood); fb(f, SB + 1, 14, a, SB + 1, top, b, TW.plaster);
    }
  });
  // the lean-to eave over the street face (two-storey houses): two plates, low at the street edge, tucked under the upper wall
  const ey = G + 1;
  if (o.two) {
    fb(f, 0, ey, 0, SB + 3, ey + 1, F, TILE.body); fb(f, 0, ey, 0, 0, ey, F, TILE.dark); fb(f, 0, ey + 1, 0, SB + 3, ey + 1, F, TILE.lit);
    fb(f, 4, ey + 2, 0, SB + 3, ey + 3, F, TILE.body); fb(f, 4, ey + 3, 0, SB + 3, ey + 3, F, TILE.lit);
  }
  let roofY = ey, roofU0 = 0;
  if (o.two) {
    // the upper storey: set back over the eave, plastered, with mushiko slots, a lattice window or a railed balcony
    shell(f, SB + 3, ey, 1, D, ey + U, F - 1, TW.plaster);
    fb(f, SB + 3, ey + U, 1, D, ey + U, F - 1, TW.woodD);
    for (const v of [1, F - 1]) { fb(f, SB + 3, ey, v, D, ey + 1, v, TW.woodD); fb(f, (SB + D) >> 1, ey, v, ((SB + D) >> 1) + 1, ey + U, v, TW.woodD); }
    const up = o.upper ?? 'mushiko', wa = Math.round(F * 0.18), wb = Math.round(F * 0.82), y0 = ey + 6, y1 = ey + U - 4;
    if (up === 'mushiko') {
      fb(f, SB + 2, y0 - 1, wa - 1, SB + 2, y1 + 1, wb + 1, TW.plasterD);
      for (let v = wa + 1; v < wb; v += 3) fb(f, SB + 2, y0, v, SB + 2, y1, v, TW.woodD);
    } else if (up === 'koshi') {
      fb(f, SB + 3, y0 - 2, wa, SB + 3, y1, wb, glow, gg);
      for (let v = wa; v <= wb; v += 3) fb(f, SB + 2, y0 - 2, v, SB + 2, y1, v, lat);
      fb(f, SB + 2, y0 - 2, wa, SB + 2, y0 - 2, wb, lat); fb(f, SB + 2, y1, wa, SB + 2, y1, wb, lat);
    } else if (up === 'balcony') {
      // shoji the whole width, a board floor out over the eave and a rail with posts
      fb(f, SB + 3, ey + 2, 2, SB + 3, ey + U - 3, F - 2, glow, gg);
      for (let v = 2; v <= F - 2; v += 8) fb(f, SB + 2, ey + 2, v, SB + 2, ey + U - 3, v, TW.woodD);
      fb(f, SB + 2, ey + 9, 2, SB + 2, ey + 9, F - 2, TW.woodD);
      fb(f, 2, ey + 4, 0, SB + 2, ey + 4, F, TW.woodD);
      fb(f, 2, ey + 5, 0, 2, ey + 5, F, TW.wood); fb(f, 2, ey + 10, 0, 3, ey + 11, F, TW.woodL);
      for (let v = 0; v <= F; v += 6) fb(f, 2, ey + 5, v, 2, ey + 10, v, TW.wood);
    }
    roofY = ey + U + 1; roofU0 = SB;
  }
  const deep = D + 1 - roofU0, k = Math.max(4, Math.floor(deep / 9));
  const top = gableRoof(f, roofU0, D + 1, 0, F, roofY, o.two ? [[0, 3], [k, 3], [k, 3], [k, 3]] : [[0, 3], [k + 2, 3], [k + 2, 3]], o.roof ?? TILE, { stones: o.stones, end: { col: TW.plaster, at: 1 } });
  // udatsu: a plastered fire wall rising through the eave at the gable end, capped with tile (it faces the camera)
  if (o.two && o.udatsu) for (const v of o.udatsu === 2 ? [0, F - 2] : [F - 2]) {
    fb(f, SB + 1, ey + 2, v, SB + 9, roofY + 5, v + 2, TW.plaster);
    fb(f, SB + 1, ey + 2, v, SB + 9, ey + 3, v + 2, TW.woodD);
    fb(f, SB, roofY + 6, v - 1, SB + 10, roofY + 7, v + 3, TILE.body); fb(f, SB, roofY + 7, v - 1, SB + 10, roofY + 7, v + 3, TILE.lit);
  }
  return { lamps, top, G, ey, roofY, vs };
}
/** hang a lantern from the lean-to eave at v (cells along the frontage); returns its centre (m) */
export function eaveLantern(f: Fr, v: number, ey: number, paper?: number, band?: number, h = 7) {
  const [X, Z] = fxz(f, 3, v); return chochin(f.w, X, ey - 4, Z, h, paper, band);
}

// ------------------------------------------------------------------ the storehouse (dozo)
/**
 * A white storehouse with its gable to the street (tsuma-iri): a black namako wainscot (dark tiles with white joints on a 4-cell grid),
 * thick white walls, a heavy stepped door frame with the doors swung open, small barred windows under thick shutters, a heavy roof and
 * a crest high in the gable. Built in frame cells: frontage [0, F], depth [u0, u1].
 */
export function dozo(f: Fr, u0: number, u1: number, H: number, mark: number, lit: boolean) {
  const F = f.F;
  fb(f, u0 - 1, -1, -1, u1 + 1, 1, F + 1, TW.stoneD);
  shell(f, u0, 2, 0, u1, H, F, TW.plaster);
  // the namako wainscot on the street face and the +z side (the two faces the camera sees)
  const nam = (face: 'front' | 'side') => {
    if (face === 'front') { fb(f, u0 - 1, 2, 0, u0 - 1, 16, F, TW.namako); for (let y = 4; y <= 16; y += 4) fb(f, u0 - 1, y, 0, u0 - 1, y, F, TW.plasterD); for (let v = 2; v <= F; v += 4) fb(f, u0 - 1, 2, v, u0 - 1, 16, v, TW.plasterD); }
    else { fb(f, u0, 2, F + 1, u1, 16, F + 1, TW.namako); for (let y = 4; y <= 16; y += 4) fb(f, u0, y, F + 1, u1, y, F + 1, TW.plasterD); for (let u = u0 + 2; u <= u1; u += 4) fb(f, u, 2, F + 1, u, 16, F + 1, TW.plasterD); }
  };
  nam('front'); nam('side');
  fb(f, u0 - 1, 17, 0, u0 - 1, 17, F, TW.woodD); fb(f, u0, 17, F + 1, u1, 17, F + 1, TW.woodD);
  // the door: three stepped frames standing out from the face, the dark opening, the thick doors swung open flat against the wall
  const m = F >> 1, dw = Math.min(8, (F >> 1) - 6);
  fb(f, u0 - 3, 1, m - dw - 4, u0 - 1, 30, m + dw + 4, TW.plaster); fb(f, u0 - 4, 1, m - dw - 2, u0 - 4, 28, m + dw + 2, TW.plasterD);
  fb(f, u0 - 4, 1, m - dw, u0, 25, m + dw, null); fb(f, u0 + 1, 1, m - dw, u0 + 1, 25, m + dw, lit ? TW.glowMid : TW.woodD, lit ? 1 : 0);
  fb(f, u0 - 7, -1, m - dw - 8, u0 - 5, 25, m - dw - 5, TW.plaster); fb(f, u0 - 7, -1, m + dw + 5, u0 - 5, 25, m + dw + 8, TW.plaster);
  fb(f, u0 - 7, 0, m - dw - 8, u0 - 7, 13, m - dw - 5, TW.namako); fb(f, u0 - 7, 0, m + dw + 5, u0 - 7, 13, m + dw + 8, TW.namako);
  fb(f, u0 - 5, -1, m - dw - 2, u0 - 2, 0, m + dw + 2, TW.stone);
  // two small windows high on the front, thick shutters standing out, iron bars
  for (const wv of [Math.round(F * 0.22), Math.round(F * 0.78)]) {
    fb(f, u0 - 2, H - 16, wv - 3, u0 - 1, H - 9, wv + 3, TW.plaster); fb(f, u0 - 2, H - 15, wv - 2, u0 - 1, H - 10, wv + 2, TW.woodD);
    for (const bv of [wv - 1, wv + 1]) fb(f, u0 - 2, H - 15, bv, u0 - 2, H - 10, bv, TW.iron);
  }
  // the roof: gable to the street, plates stepping in along v, with a thick ridge; the crest in the gable
  const top = gableRoof(f, u0 - 4, u1 + 3, -4, F + 4, H + 1, [[0, 3], [5, 3], [5, 3], [5, 3], [4, 3]], TILE, { alongU: true, ridge: 4, end: { col: TW.plaster, at: 0 } });
  crest(f, 'u', u0 - 5, m, H + 8, mark, 1);
  return top;
}
