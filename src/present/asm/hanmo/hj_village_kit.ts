// 残村的道具库（黄巾残村 · village 代理）：夯土墙、两三层平台阶的草顶 / 瓦顶、汉式农舍（直棂窗、板门、铺首、土烟囱）、院墙、
// 圆形大件（瓮、草垛、石磨）用两三块矩形叠成八角，实心车轮。烧过的房子：椽子烧剩的黑木条、墙头烟熏、屋里的灰和倒梁。
// 铁律同忍之章：横平竖直的大块体；坡面只用两三层宽台阶（每层水平收进都比竖直高度大），不做一格一格的斜阶；
// 花纹只用夯层、板缝、瓦垄这些结构线，不用逐格随机色。所有部件在本地框里搭（front = 本地 +z，r = 转几个 90°）。
import { M, type W } from '../../scenes/props';
import type { Ctx } from '../../scenes/stage';
import { loc, locM, type Bx, type P3 } from '../../scenes/k_village';
import type { Place } from '../types';
export { smoke } from '../ninja/village_kit';

/** 残村调色：夯土黄、灰褐茅草、灰瓦、旧木、焦黑，黄巾黄只做点缀 */
export const HV = {
  // rammed earth (夯土): body, the tamped seam, the lit coping, the damp foot; soot-stained earth
  earth: 0xa88a60, earthS: 0x957a54, earthL: 0xbc9e72, earthD: 0x7e6848, soot: 0x5e4e3e, sootD: 0x45392e,
  // thatch: old grey-brown straw
  th: 0x857660, thD: 0x564a3a, thM: 0x6e624e, thL: 0x9e8e72, ridge: 0x4a4032, bind: 0x352d24,
  // grey tile
  tile: 0x56585e, tileD: 0x3a3c42, tileL: 0x72747a, tileR: 0x44464c,
  // timber, red-lacquered columns of the hall
  wood: 0x6a5038, woodD: 0x48362a, woodL: 0x8a6c4c, post: 0x3c2c20, red: 0x7e3626, redD: 0x5a271c,
  // fire: charred timber, ash, embers
  char: 0x2c2622, charD: 0x1c1816, charL: 0x433830, ash: 0x5c5650, ashL: 0x766e66, ember: 0xd8602a, emberL: 0xffa040,
  // stone and grey brick
  stone: 0x86827a, stoneD: 0x67635c, stoneL: 0xa09a90, brick: 0x77736e, brickD: 0x5a5753,
  // straw, rope, cloth
  straw: 0xc8ac68, strawD: 0xa08a50, strawL: 0xd8c084, rope: 0x86724e,
  hemp: 0xc0b08c, hempD: 0x9e906e, indigo: 0x33405a, indigoL: 0x4a5878, ochre: 0xa47640,
  // the Yellow Turbans' yellow: accents only
  yellow: 0xd4ac30, yellowD: 0xa4821e, yellowL: 0xe4c454,
  // pottery: red-brown earthenware and Han grey ware
  clay: 0x8a5c3e, clayD: 0x684430, clayL: 0xa0704e, grey: 0x7a7670, greyD: 0x5c5955, greyL: 0x928e88,
  iron: 0x38363a, ironL: 0x5a585e, bronze: 0x56664e, bronzeL: 0x748866,
  dark: 0x1c1612, glow: 0xc08848, water: 0x2c4848,
  // the ground: loess (黄土), the cart track and its ruts, tilled soil
  loess: 0x8c7454, loessD: 0x7c6649, loessL: 0x9a8260, track: 0xa08a64, rut: 0x6e5c42, soil: 0x5a4834, soilL: 0x6a563e,
};

/** the local frame of a piece at world (x, z) metres, front turned by r quarter turns (0 = +z, 1 = +x, 3 = −x) */
export const frame = (w: W, x: number, z: number, r = 0) => loc(w, M(x), M(z), r);
/** a group in a wing faces the battle floor; a group at the back faces the camera */
export const faceOf = (s: number) => (s > 0 ? 3 : s < 0 ? 1 : 0);
/** square pieces at the back rows face the camera, everything else faces the battle floor */
export const orient = (p: Place) => (p.z < -8.6 ? 0 : faceOf(p.s));
export const ring = (B: Bx, a: number, c: number, b: number, e: number, y: number, col: number) => { B(a, y, c, b, y, c, col); B(a, y, e, b, y, e, col); B(a, y, c, a, y, e, col); B(b, y, c, b, y, e, col); };
/** recolour only the cells that are already there, in a local box (soot on a wall, char on a cut roof end) */
export function stain(w: W, X: number, Z: number, r: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number) {
  const p = (lx: number, lz: number) => (r === 0 ? [X + lx, Z + lz] : r === 1 ? [X + lz, Z - lx] : r === 2 ? [X - lx, Z - lz] : [X - lz, Z + lx]);
  for (let a = Math.min(x0, x1); a <= Math.max(x0, x1); a++) for (let b = Math.min(z0, z1); b <= Math.max(z0, z1); b++) {
    const [wx, wz] = p(a, b);
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { const c = w.get(wx, y, wz); if (c) c.c = col; }
  }
}

// ------------------------------------------------------------------ rammed earth
/** 夯土：a block of rammed earth, a darker tamped seam every 6 courses */
export function earth(B: Bx, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  B(x0, y0, z0, x1, y1, z1, HV.earth);
  for (let y = y0 + 5; y < y1; y += 6) B(x0, y, z0, x1, y, z1, HV.earthS);
}
/** four rammed-earth walls t thick round local [x0..x1] × [z0..z1] */
export function earthRing(B: Bx, x0: number, z0: number, x1: number, z1: number, t: number, y0: number, y1: number) {
  earth(B, x0, y0, z1 - t + 1, x1, y1, z1); earth(B, x0, y0, z0, x1, y1, z0 + t - 1);
  earth(B, x0, y0, z0, x0 + t - 1, y1, z1); earth(B, x1 - t + 1, y0, z0, x1, y1, z1);
}
/**
 * 院墙：a rammed-earth yard wall along local x (a0..a1) centred on local z = zc, 4 cells thick, h high, with a two-course thatch (or
 * tile) coping one cell proud each side. drops: [a, b, d] knocks the top down by d cells over a..b (coping and all — a broken wall).
 */
export function yardWall(B: Bx, a0: number, a1: number, zc: number, h: number, o: { tile?: boolean; drops?: Array<[number, number, number]> } = {}) {
  earth(B, a0, 0, zc - 2, a1, h, zc + 1);
  B(a0 - 1, h + 1, zc - 3, a1 + 1, h + 1, zc + 2, o.tile ? HV.tileD : HV.thM);
  B(a0 - 1, h + 2, zc - 2, a1 + 1, h + 2, zc + 1, o.tile ? HV.tile : HV.thL);
  if (o.tile) for (let a = a0; a <= a1; a += 3) B(a, h + 1, zc + 2, a, h + 1, zc + 2, HV.tileL);
  for (const [a, b, d] of o.drops ?? []) B(a <= a0 ? a0 - 1 : a, h - d + 1, zc - 3, b >= a1 ? a1 + 1 : b, h + 2, zc + 2, null);
}
/** 夯土 along local z instead (a side run of a yard wall) */
export function yardWallZ(B: Bx, b0: number, b1: number, xc: number, h: number, o: { tile?: boolean; drops?: Array<[number, number, number]> } = {}) {
  earth(B, xc - 2, 0, b0, xc + 1, h, b1);
  B(xc - 3, h + 1, b0 - 1, xc + 2, h + 1, b1 + 1, o.tile ? HV.tileD : HV.thM);
  B(xc - 2, h + 2, b0 - 1, xc + 1, h + 2, b1 + 1, o.tile ? HV.tile : HV.thL);
  for (const [a, b, d] of o.drops ?? []) B(xc - 3, h - d + 1, a <= b0 ? b0 - 1 : a, xc + 2, h + 2, b >= b1 ? b1 + 1 : b, null);
}

// ------------------------------------------------------------------ roofs
export type RoofKind = 'thatch' | 'tile';
const ROOF = {
  thatch: { body: HV.th, edge: HV.thD, side: HV.thM, top: HV.thL, ridge: HV.ridge, band: HV.bind },
  tile: { body: HV.tile, edge: HV.tileD, side: HV.tileD, top: HV.tileL, ridge: HV.tileR, band: HV.tileD },
};
/**
 * 悬山 roof over local [x0..x1] × [z0..z1] from y: `tiers` flat slabs (2 or 3), th cells each, stepping in front and back only (the gable
 * ends stay flush and show the stepped profile in a darker tone), a ridge roll on top. Thatch: a light top row on each slab, a dark cut
 * edge at each eave, straw-rope ties over the ridge. Tile: tile rows (筒瓦) as dark lines front-to-back every 3 cells on the tops, light
 * tile ends (瓦当) along each eave, a dark ridge whose ends rise one step (the Han ridge). Returns the ridge top y.
 */
export function roof(B: Bx, x0: number, x1: number, z0: number, z1: number, y: number, kind: RoofKind, o: { tiers?: number; th?: number } = {}) {
  const n = o.tiers ?? 2, th = o.th ?? 4, D = z1 - z0 + 1, C = ROOF[kind], ins = n >= 3 ? [0, 0.2, 0.34] : [0, 0.28];
  let top = y;
  for (let i = 0; i < n; i++) {
    const k = Math.round(D * ins[i]), a = z0 + k, b = z1 - k, ya = y + i * th, yb = ya + th - 1;
    B(x0, ya, a, x1, yb, b, C.body); B(x0, yb, a, x1, yb, b, C.top);
    B(x0, ya, a, x1, ya, a, C.edge); B(x0, ya, b, x1, ya, b, C.edge);
    B(x0, ya, a, x0, yb - 1, b, C.side); B(x1, ya, a, x1, yb - 1, b, C.side);
    if (kind === 'tile') {
      for (let x = x0 + 1; x < x1; x += 3) B(x, yb, a, x, yb, b, C.band);
      for (let x = x0 + 1; x < x1; x += 3) { B(x, ya + 1, a, x, ya + 1, a, HV.tileL); B(x, ya + 1, b, x, ya + 1, b, HV.tileL); }
    }
    top = yb;
  }
  const zc = Math.round((z0 + z1) / 2);
  if (kind === 'thatch') {
    B(x0 - 1, top + 1, zc - 2, x1 + 1, top + 2, zc + 2, C.ridge);
    for (let x = x0 + 3; x <= x1 - 3; x += 8) B(x, top + 1, zc - 3, x + 1, top + 3, zc + 3, C.band);
    return top + 3;
  }
  B(x0, top + 1, zc - 2, x1, top + 3, zc + 2, C.ridge); B(x0, top + 3, zc - 1, x1, top + 3, zc + 1, HV.tileD);
  for (const e of [x0 - 1, x1 - 2]) B(e, top + 1, zc - 2, e + 3, top + 5, zc + 2, C.ridge);
  return top + 5;
}

// ------------------------------------------------------------------ openings
/** 直棂窗：a square opening through a wall face at local z = zf (wall t thick behind it), vertical bars every 2 cells, a proud frame */
export function zhiling(B: Bx, wx: number, y0: number, y1: number, zf: number, t: number, back: number, g = 0, hw = 5) {
  B(wx - hw, y0, zf - t + 1, wx + hw, y1, zf, null);
  B(wx - hw - 1, y0 - 1, zf - t, wx + hw + 1, y1 + 1, zf - t, back, g);
  for (let u = wx - hw + 1; u <= wx + hw - 1; u += 2) B(u, y0, zf - 1, u, y1, zf - 1, HV.woodL);
  B(wx - hw - 1, y0 - 1, zf, wx + hw + 1, y0 - 1, zf + 1, HV.woodD); B(wx - hw - 1, y1 + 1, zf, wx + hw + 1, y1 + 1, zf + 1, HV.woodD);
  B(wx - hw - 1, y0, zf, wx - hw - 1, y1, zf + 1, HV.woodD); B(wx + hw + 1, y0, zf, wx + hw + 1, y1, zf + 1, HV.woodD);
}

// ------------------------------------------------------------------ the farmhouse
export interface HouseOpt {
  hw: number; hd: number; H: number; roof?: RoofKind; tiers?: number;
  /** door centre (local x) and the window centres */
  door?: number; wins?: number[];
  /** 0 = whole, 1 = the roof burnt off the −x end (up to local x = cut), 2 = only the walls left */
  burnt?: 0 | 1 | 2; cut?: number;
  /** someone is home: the window and the door glow, the chimney smokes */
  lit?: boolean; chimney?: boolean;
  /** the open door leaf: −1 = the left leaf stands open, 1 = the right */
  open?: -1 | 1;
}
/**
 * 农舍：rammed-earth walls on a stone footing, a plank door in a timber frame (one leaf shut, a bronze knocker ring on it, the other swung
 * in on the dark), 直棂窗 either side, a timber eave beam, a low earth chimney at the back corner, the stepped roof. burnt 1: the roof is
 * burnt away over the −x end — charred rafters across the wall tops, a king post and the ridge beam, the cut roof end blackened, soot
 * over the openings of that end, ash and a fallen beam inside, the gable wall notched; burnt 2: only the walls stand, the front wall
 * broken down in one big step, two charred beams across, rubble heaps inside. Returns door / smoke / ember points (world metres).
 */
export function house(c: Ctx, x: number, z: number, r: number, o: HouseOpt) {
  const w = c.w, X = M(x), Z = M(z), B = loc(w, X, Z, r), { hw, hd, H } = o, t = 3, burnt = o.burnt ?? 0, dc = o.door ?? 0, kind = o.roof ?? 'thatch';
  const lit = !!o.lit && burnt === 0, cut = o.cut ?? Math.round(-hw * 0.15);
  B(-hw - 1, -1, -hd - 1, hw + 1, -1, hd + 1, HV.stoneD); B(-hw - 1, 0, -hd - 1, hw + 1, 0, hd + 1, HV.stone);
  earthRing(B, -hw, -hd, hw, hd, t, 1, H);
  B(-hw + t, 0, -hd + t, hw - t, 0, hd - t, burnt ? HV.ash : HV.loessD);
  // the door: posts through the wall and one cell proud, a lintel, a step stone; one leaf shut with battens and the knocker
  const dw = 6, dh = 23, op = o.open ?? 1;
  B(dc - dw + 1, 1, hd - t + 1, dc + dw - 1, dh, hd, null);
  for (const s of [-1, 1]) B(dc + s * dw, 1, hd - t + 1, dc + s * dw, dh, hd + 1, HV.post);
  B(dc - dw - 3, dh + 1, hd - 1, dc + dw + 3, dh + 2, hd + 1, HV.woodD);
  B(dc - dw, 0, hd + 2, dc + dw, 0, hd + 3, HV.stoneL);
  const la = op > 0 ? dc - dw + 1 : dc + 1, lb = op > 0 ? dc - 1 : dc + dw - 1;
  B(la, 1, hd - 1, lb, dh, hd - 1, HV.wood); for (const y of [4, 12, dh - 3]) B(la, y, hd - 1, lb, y, hd - 1, HV.woodD);
  const kx = op > 0 ? lb - 1 : la + 1; B(kx, 13, hd, kx, 14, hd, HV.bronzeL); B(kx, 11, hd, kx, 11, hd, HV.bronze);
  if (burnt === 0) {
    // the dark room behind the open leaf (and the hearth glow when someone is home)
    const oa = op > 0 ? dc : dc - dw + 1, ob = op > 0 ? dc + dw - 1 : dc;
    B(oa, 1, hd - t - 3, ob, dh, hd - t - 3, HV.dark); B(oa, 1, hd - t - 3, ob, 1, hd - t, HV.dark);
    if (lit) B(oa + 1, 1, hd - t - 3, ob - 1, 3, hd - t - 3, HV.ember, 1);
  }
  // windows
  const wins = o.wins ?? [-Math.round(hw * 0.58), Math.round(hw * 0.58)].filter(v => Math.abs(v - dc) > dw + 7);
  for (const wx of wins) zhiling(B, wx, 11, 19, hd, t, lit ? HV.glow : HV.dark, lit ? 1 : 0);
  // the eave beam along the front wall head, beam ends at the corners
  B(-hw - 1, H - 1, hd + 1, hw + 1, H, hd + 1, HV.woodD);
  // the chimney: a square earth stack at the back +x corner, a flat cap
  const chim = o.chimney !== false;
  const roofTop = H + 1 + (o.tiers ?? 2) * 4 + 2;
  if (chim && burnt < 2) { B(hw - 8, 1, -hd - 3, hw - 4, roofTop + 2, -hd + 1, HV.earthD); B(hw - 9, roofTop + 3, -hd - 4, hw - 3, roofTop + 3, -hd + 2, HV.brickD); B(hw - 7, roofTop + 3, -hd - 2, hw - 5, roofTop + 3, -hd, HV.dark); }
  const out = { door: locM(X, Z, r, dc, 12, hd + 4), smoke: locM(X, Z, r, hw - 6, roofTop + 5, -hd - 1), ember: null as P3 | null, top: roofTop };
  if (burnt < 2) roof(B, -hw - 3, hw + 3, -hd - 5, hd + 5, H + 1, kind, { tiers: o.tiers });
  if (burnt === 1) {
    // the roof is gone over the −x end: carve it, blacken the cut end, lay charred rafters on the wall heads, a king post and ridge beam
    B(-hw - 4, H + 1, -hd - 6, cut, H + 24, hd + 6, null);
    stain(w, X, Z, r, cut + 1, H + 1, -hd - 6, cut + 2, H + 20, hd + 6, HV.charL);
    for (let a = -hw + 2; a <= cut - 3; a += 7) B(a, H + 1, -hd - 3, a + 1, H + 2, hd + 3, HV.char);
    const kp = -hw + 2 + 7 * Math.max(0, Math.floor((cut - 3 + hw - 2) / 14));
    B(kp, H + 3, -1, kp + 1, H + 6, 0, HV.char); B(-hw + 2, H + 7, -1, cut + 1, H + 8, 0, HV.charD);
    // the gable end wall notched, soot over that end of the front wall
    B(-hw, H - 7, -hd + t + 2, -hw + t - 1, H, hd - t - 2, null);
    stain(w, X, Z, r, -hw, dh + 3, hd, cut, H, hd + 1, HV.soot);
    stain(w, X, Z, r, -hw, H - 8, -hd + t + 2, -hw, H - 8, hd - t - 2, HV.sootD);
    for (const wx of wins) if (wx < cut) stain(w, X, Z, r, wx - 6, 20, hd, wx + 6, dh + 2, hd + 1, HV.sootD);
    // inside: a fallen beam lying along x, a heap of fallen thatch and earth
    B(-hw + t + 2, 1, -3, cut - 3, 2, -2, HV.char);
    B(-hw + t + 1, 1, -hd + t, -hw + t + 9, 5, -hd + t + 6, HV.thM); B(-hw + t + 2, 6, -hd + t + 1, -hw + t + 7, 7, -hd + t + 4, HV.thD);
    if (o.lit) { B(-hw + t + 6, 3, -3, -hw + t + 9, 3, -2, HV.ember, 1); out.ember = locM(X, Z, r, -hw + t + 8, 4, -2); }
  }
  if (burnt === 2) {
    // the front wall broken down in one big step over its +x half, the −x gable notched, beams across, rubble inside
    const br = Math.round(hw * 0.25);
    B(br, H - 9, hd - t + 1, hw - t, H, hd, null);
    B(-hw, H - 11, -hd + t + 3, -hw + t - 1, H, hd - t - 3, null);
    stain(w, X, Z, r, -hw, H - 4, -hd, hw, H, hd, HV.soot);
    stain(w, X, Z, r, br, H - 13, hd, hw - t, H - 10, hd, HV.soot);
    for (const a of [-Math.round(hw * 0.6), -Math.round(hw * 0.1)]) B(a, H + 1, -hd - 2, a + 1, H + 2, hd + 2, HV.char);
    B(-hw + t + 1, 1, -hd + t + 2, hw - t - 4, 2, -hd + t + 3, HV.char);
    B(hw - t - 10, 1, -hd + t, hw - t - 1, 6, -hd + t + 7, HV.earthD); B(hw - t - 8, 7, -hd + t + 1, hw - t - 3, 9, -hd + t + 5, HV.soot);
    B(-hw + t, 1, hd - t - 7, -hw + t + 7, 4, hd - t - 1, HV.earthD);
    if (o.lit) { B(-hw + t + 8, 3, -hd + t + 2, -hw + t + 12, 3, -hd + t + 3, HV.ember, 1); out.ember = locM(X, Z, r, -hw + t + 10, 4, -hd + t + 2); }
  }
  return out;
}

// ------------------------------------------------------------------ round things (octagons of two or three rects, never a pixel circle)
/** a round slab: centre (a, b), radius r, from y0 to y1. r < 6: one corner step; larger: three rects */
export function disc(B: Bx, a: number, b: number, r: number, y0: number, y1: number, col: number | null, g = 0) {
  if (r <= 1) { B(a - r, y0, b - r, a + r, y1, b + r, col, g); return; }
  if (r < 6) { const k = Math.max(1, Math.round(r * 0.34)); B(a - r, y0, b - r + k, a + r, y1, b + r - k, col, g); B(a - r + k, y0, b - r, a + r - k, y1, b + r, col, g); return; }
  const q = Math.round(r * 0.5), m = Math.round(r * 0.82);
  B(a - r, y0, b - q, a + r, y1, b + q, col, g); B(a - m, y0, b - m, a + m, y1, b + m, col, g); B(a - q, y0, b - r, a + q, y1, b + r, col, g);
}
/** 瓮 (big = 1) or 罐 (0) at local (a, b): the belly, the shoulder, the neck, the lip with the dark mouth; grey ware or red-brown.
 *  broken: the shoulder knocked in, a jagged rim in two heights, two shards at the foot */
export function jar(B: Bx, a: number, b: number, big: 0 | 1, grey: boolean, o: { broken?: boolean; lid?: boolean } = {}) {
  const body = grey ? HV.grey : HV.clay, dk = grey ? HV.greyD : HV.clayD, lt = grey ? HV.greyL : HV.clayL;
  const R = big ? 5 : 3, yb = big ? 7 : 4;
  disc(B, a, b, R - 1, 0, 0, dk); disc(B, a, b, R, 1, yb, body); disc(B, a, b, R - 1, yb + 1, yb + 2, lt);
  if (o.broken) {
    disc(B, a, b, R - 2, yb - 1, yb + 2, null); B(a - R + 2, 2, b - R + 2, a + R - 2, 2, b + R - 2, HV.dark);
    B(a - R, yb - 2, b - 1, a - R + 1, yb + 2, b + 2, body); B(a + R - 2, yb + 1, b - R + 1, a + R - 1, yb + 3, b, lt);
    B(a + R + 1, 0, b + 1, a + R + 3, 0, b + 2, body); B(a - 1, 0, b + R + 1, a + 1, 0, b + R + 2, lt);
    return;
  }
  const n = big ? 2 : 1;
  disc(B, a, b, n, yb + 3, yb + 3 + n, body); disc(B, a, b, n + 1, yb + 4 + n, yb + 4 + n, lt);
  if (o.lid) B(a - n - 1, yb + 5 + n, b - n - 1, a + n + 1, yb + 5 + n, b + n + 1, HV.woodL); else B(a - n + 1, yb + 4 + n, b - n + 1, a + n - 1, yb + 4 + n, b + n - 1, HV.dark);
}
/** 麦秸垛：a round straw stack in three tiers with a plastered mud cap, a weathered dark foot band and two rope ties */
export function strawStack(B: Bx, a: number, b: number, r: number, h: number) {
  const y1 = Math.round(h * 0.5), y2 = Math.round(h * 0.78), y3 = h - 3;
  disc(B, a, b, r, 0, y1, HV.straw); disc(B, a, b, r, 0, 1, HV.strawD);
  disc(B, a, b, Math.round(r * 0.78), y1 + 1, y2, HV.straw); disc(B, a, b, Math.round(r * 0.5), y2 + 1, y3, HV.strawL);
  disc(B, a, b, Math.round(r * 0.78), y1 + 1, y1 + 1, HV.strawL); disc(B, a, b, Math.round(r * 0.5), y2 + 1, y2 + 1, HV.strawL);
  disc(B, a, b, r, Math.round(h * 0.3), Math.round(h * 0.3), HV.rope);
  disc(B, a, b, Math.max(2, Math.round(r * 0.28)), y3 + 1, h, HV.earthD); disc(B, a, b, 1, h, h, HV.earthS);
}
/** a solid cart wheel in the local x-y plane, seen face-on from the front: three rects for the outline, a 2-cell rim band, two plank
 *  seams, an iron hub through it and a cap on the front. Centre (a, cy, b), radius R, thickness 2t + 1 along z */
export function cartWheel(B: Bx, a: number, cy: number, b: number, R: number, t = 1) {
  const q = Math.round(R * 0.5), m = Math.round(R * 0.8), rects: Array<[number, number]> = [[R, q], [m, m], [q, R]];
  for (const [u, v] of rects) B(a - u, cy - v, b - t, a + u, cy + v, b + t, HV.woodD);
  for (const [u, v] of rects) B(a - u + 2, cy - v + 2, b - t, a + u - 2, cy + v - 2, b + t, HV.wood);
  const s = Math.round(R / 3); for (const k of [-s, s]) B(a + k, cy - R + 3, b + t, a + k, cy + R - 3, b + t, HV.woodD);
  B(a - 2, cy - 2, b - t - 1, a + 2, cy + 2, b + t + 1, HV.iron); B(a - 1, cy - 1, b + t + 2, a + 1, cy + 1, b + t + 2, HV.ironL);
}
