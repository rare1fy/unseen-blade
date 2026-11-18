// 第三关 · 下邳寒沼的部件库（三个地点共用）：曹操引泗水沂水灌城，城泡在冬天的水里。
// 白灰墙黑瓦的屋（下半截泡过水，水线发黑）、青灰城砖墙和城垛、沙袋、木栈道、系船石、半沉的船、铁栅水门、枯柳、冰凌、缢绳。
// 铁律同前两关：横平竖直的大块体，斜面一律几层宽台阶（每层 ≥ 3～4 格），花纹只画结构（砖缝、瓦垄、板缝、袋缝、窗棂），
// 没有逐格随机色；换色以整块为单位。霜和雪只画在顶面（整层、整块），不撒点。体素 7 厘米一格。
// 通用的本地框（frame / up / at / mir / faceOf / orient / shell）和烟借破庙的部件库（只读引用，不改那边）。
import type { Ctx } from '../../scenes/stage';
import type { Bx, P3 } from '../../scenes/k_village';
import { locM } from '../../scenes/k_village';
import { M, hash } from '../../scenes/props';
import { deadTree } from '../../scenes/flora';
import type { Place } from '../types';
import { frame, up, at, mir, faceOf, orient, shell, smoke } from '../hanmo/hj_temple_kit';
export { frame, up, at, mir, faceOf, orient, shell, smoke };

/** 下邳调色：泡水的青石、淤泥、暗青灰的水、灰木、白灰墙、黑瓦、青灰城砖、湿麻袋、铁、霜雪。每种材料两三档（本体 / 暗 / 亮） */
export const XP = {
  slab: 0x50585e, slabB: 0x576066, slabC: 0x4b5358, joint: 0x343a3f, slabW: 0x424a50,
  mud: 0x3c3e3b, mudD: 0x313330, mudL: 0x484a45,
  shore: 0x343c40, kerb: 0x737b80, bed: 0x10171b, water: 0x24343c,
  plank: 0x5e5749, plankD: 0x453f36, plankL: 0x736b5b, wood: 0x4e4739, woodD: 0x332f29, woodL: 0x665e4f,
  plaster: 0xbcbdb6, plasterD: 0xa3a59f, plasterL: 0xcfd0ca, damp: 0x7d8280, dampD: 0x626766, line: 0x2a2e30,
  tile: 0x2f3337, tileD: 0x222528, tileL: 0x42464c,
  brick: 0x676c6f, brickD: 0x515659, brickL: 0x7b8083, brickW: 0x45494c,
  stone: 0x6e7478, stoneD: 0x53595d, stoneL: 0x899094, stoneDD: 0x40454a,
  sack: 0x7e786c, sackD: 0x625e56, sackW: 0x4c4a46, sackL: 0x948e82,
  iron: 0x2c2e34, ironL: 0x4a4e56, rust: 0x5c4636,
  rope: 0x86795f, ropeD: 0x6a5f4a, straw: 0x777058, strawD: 0x5c5645, mat: 0x6c6450,
  bark: 0x403c37, barkD: 0x2b2926,
  frost: 0x9aa6ae, snow: 0xd2dae2, snowD: 0xbac4ce, ice: 0x98aebb, iceL: 0xc0d0da,
  dark: 0x14171a, red: 0x6a3a30, redD: 0x4e2a24, bronze: 0x4e5e58, bronzeD: 0x36423e,
  ember: 0xd8602a, flame: 0xff9a38, flameL: 0xffc864,
};

/** a stable [0, 1) number for a block index (whole-block colour picks, never per cell) */
export const hk = (a: number, b: number, salt = 0) => hash(a * 31 + 7, b * 17 + 3, salt + 517);
/** the world point of a local cell of a piece built with frame(p.x, p.z, r) */
export const wp = (p: Place, r: number, lx: number, y: number, lz: number): P3 => locM(M(p.x), M(p.z), r, lx, y, lz);
/** what lies on the flat tops: snow when it snows, a pale frost otherwise (winter always; a whole top layer, never dots) */
export const capCol = (p: Place) => (p.weather === 'snow' ? XP.snow : XP.frost);
/** a fire's light: few and weak here (the fires are this region's only warm points; the cold light is the mood's) */
export const fireLight = (c: Ctx, p: Place, at3: P3, k = 1, d = 5) => { if (p.lamp > 0.2) c.light(at3, 0xffa060, 2.0 * Math.max(p.lamp, 0.6) * k, d); };

// ------------------------------------------------------------------ water marks
/** a group cannot take floor cells away (it builds in a sandbox), so it paints this colour at y = −1 where the floor is under water;
 *  the place's far() carves the marks (no cell at −1, a dark bed at −2) and the one water plane under the stage shows there */
export const XP_MARK = 0x010203;
/** water in a local rect (cells, at the floor layer) with a dark wet rim `rim` cells wide round it */
export function markWater(B: Bx, x0: number, z0: number, x1: number, z1: number, rim = 2) {
  if (rim > 0) B(x0 - rim, -1, z0 - rim, x1 + rim, -1, z1 + rim, XP.shore);
  B(x0, -1, z0, x1, -1, z1, XP_MARK);
}

// ------------------------------------------------------------------ roofs and walls
/**
 * 黑瓦顶 along local x: flat slabs stepping in (tiers = [inset, thickness]; the lowest steps in on all four sides, the rest front and
 * back), light tile rows every 4 cells on each slab top, the eave row dark, a ridge with its ends raised a block. cap = the frost /
 * snow: when it snows a whole layer on the exposed top of every slab; frost (mist, clear) only on the top slab and the ridge, so from
 * the battle camera the roof still reads black tile with a pale crown. cut1 = the +x end broken off (no ridge end, rafters stick out).
 */
export function blackRoof(B: Bx, x0: number, x1: number, z0: number, z1: number, y: number, tiers: Array<[number, number]>, cap: number | null, o: { cut1?: boolean; ridge?: boolean } = {}) {
  let ix = 0, iz = 0, ya = y;
  const all = cap === XP.snow;
  for (let i = 0; i < tiers.length; i++) {
    const [d, th] = tiers[i];
    if (i > 0) { iz += d; if (i === 1) ix += d; }
    const a = x0 + ix, b = x1 - (o.cut1 ? 0 : ix), c = z0 + iz, e = z1 - iz; if (c + 2 > e) break;
    B(a, ya, c, b, ya + th - 1, e, XP.tile);
    for (let x = a + 2; x <= b - 1; x += 4) B(x, ya + th - 1, c, x, ya + th - 1, e, XP.tileL);
    if (i === 0) { B(a, ya, c, b, ya, c, XP.tileD); B(a, ya, e, b, ya, e, XP.tileD); B(a, ya, c, a, ya, e, XP.tileD); if (!o.cut1) B(b, ya, c, b, ya, e, XP.tileD); }
    if (cap != null && (all || i === tiers.length - 1)) B(a, ya + th, c, b, ya + th, e, cap);
    ya += th;
  }
  const a = x0 + ix, b = x1 - (o.cut1 ? 0 : ix), cz = Math.round((z0 + z1) / 2);
  if (o.ridge !== false) {
    B(a + 2, ya, cz - 2, b - (o.cut1 ? 0 : 2), ya + 2, cz + 2, XP.tileD); B(a, ya, cz - 2, a + 3, ya + 4, cz + 2, XP.tileD);
    if (!o.cut1) B(b - 3, ya, cz - 2, b, ya + 4, cz + 2, XP.tileD);
    if (cap != null) B(a + 4, ya + 3, cz - 1, b - (o.cut1 ? 0 : 4), ya + 3, cz + 1, cap);
  }
  if (o.cut1) for (let k = 0, zz = z0 + 3; zz < z1 - 2; zz += 6, k++) B(x1 + 1, y, zz, x1 + 3 + (k % 2) * 3, y + 1, zz + 1, XP.woodD);
  return ya + 4;
}
/**
 * A white-plaster wall slab (x0..x1 × z0..z1 × y0..y1): dark timber posts every `bay` cells through it, a sill beam at its foot and a
 * plate beam on top; the foot that stood in the flood stained dark up to wl rows (two bands, the lower darker) under a black water line.
 */
export function plasterWall(B: Bx, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, o: { bay?: number; wl?: number } = {}) {
  B(x0, y0, z0, x1, y1, z1, XP.plaster);
  const wl = o.wl ?? 0, bay = o.bay ?? 0;
  if (wl > 1) { B(x0, y0, z0, x1, y0 + wl - 1, z1, XP.damp); B(x0, y0, z0, x1, y0 + Math.floor(wl / 2) - 1, z1, XP.dampD); B(x0, y0 + wl, z0, x1, y0 + wl, z1, XP.line); }
  if (bay > 0) for (let x = x0; x <= x1; x += bay) B(x, y0, z0, Math.min(x1, x + 1), y1, z1, XP.woodD);
  B(x0, y1 - 1, z0, x1, y1, z1, XP.wood); B(x0, y0, z0, x1, y0, z1, XP.woodD);
}
/** a lattice window on the face z: a dark opening, a timber frame, upright bars every 2 cells */
export function lattice(B: Bx, x0: number, x1: number, z: number, y0: number, y1: number) {
  B(x0, y0, z, x1, y1, z, XP.dark);
  for (let x = x0 + 1; x < x1; x += 2) B(x, y0 + 1, z, x, y1 - 1, z, XP.woodL);
  B(x0 - 1, y0 - 1, z, x1 + 1, y0 - 1, z, XP.woodD); B(x0 - 1, y1 + 1, z, x1 + 1, y1 + 1, z, XP.woodD);
}
/**
 * 半淹的屋 facing local +z, half-sizes hw × hd cells, walls H tall: plaster walls on a stone footing (posts every 10, stained to the flood
 * mark wl), a board door (one leaf gone: dark) and two lattice windows on the front, a black tile roof with frost / snow and icicles
 * along the front eave; cut = the +x third of the roof fallen in (rafters, a heap of black tiles in front). The floor round its foot
 * stays under water (markWater). Returns the door's local point.
 */
export function floodedHouse(B: Bx, cap: number, o: { hw: number; hd: number; H: number; wl: number; cut?: boolean; shop?: boolean; wet?: boolean; door?: number }) {
  const { hw, hd, H, wl } = o, dx = o.door ?? 0;
  if (o.wet !== false) markWater(B, -hw - 5, -hd - 4, hw + 5, hd + 7, 2);
  B(-hw - 1, 0, -hd - 1, hw + 1, 1, hd + 1, XP.stoneD);
  plasterWall(B, -hw, hw, hd - 1, hd, 2, H, { bay: 10, wl }); plasterWall(B, -hw, hw, -hd, -hd + 1, 2, H, { bay: 10, wl });
  plasterWall(B, -hw, -hw + 1, -hd, hd, 2, H, { wl }); plasterWall(B, hw - 1, hw, -hd, hd, 2, H, { wl });
  B(-hw + 2, H - 1, -hd + 2, hw - 2, H, hd - 2, XP.woodD);
  if (o.shop) {
    // a shop front: the whole middle bay open (dark inside), a counter board, a plank awning on two posts
    B(-hw + 8, 2, hd, hw - 8, H - 4, hd, XP.dark); B(-hw + 8, 2, hd, hw - 8, 8, hd, XP.wood); B(-hw + 8, 9, hd, hw - 8, 9, hd, XP.woodL);
    for (const s of [-1, 1]) B(s * (hw - 3) - 1, 0, hd + 9, s * (hw - 3), H - 6, hd + 10, XP.woodD);
    B(-hw - 1, H - 5, hd + 1, hw + 1, H - 5, hd + 11, XP.plankD); B(-hw - 1, H - 4, hd + 1, hw + 1, H - 4, hd + 11, XP.plank);
    for (let x = -hw; x <= hw; x += 4) B(x, H - 4, hd + 1, x, H - 4, hd + 11, XP.plankL);
    B(-hw - 1, H - 3, hd + 1, hw + 1, H - 3, hd + 11, cap);
  } else {
    B(dx - 5, 2, hd, dx + 5, 19, hd, XP.dark); B(dx - 6, 20, hd, dx + 6, 21, hd, XP.woodD); B(dx - 6, 2, hd, dx - 6, 19, hd, XP.woodD); B(dx + 6, 2, hd, dx + 6, 19, hd, XP.woodD);
    B(dx - 5, 2, hd, dx - 1, 19, hd, XP.plankD); for (let x = dx - 5; x <= dx - 1; x += 2) B(x, 3, hd, x, 18, hd, XP.plank);
    for (const s of [-1, 1]) { const cx = s * Math.round(hw * 0.6); if (Math.abs(cx - dx) > 9) lattice(B, cx - 4, cx + 4, hd, 13, 19); }
  }
  const top = blackRoof(B, -hw - 4, hw + 4 - (o.cut ? Math.round(hw * 0.6) : 0), -hd - 5, hd + 5, H + 1, [[0, 2], [4, 2], [4, 2]], cap, { cut1: o.cut });
  if (!o.cut) icicles(B, -hw - 3, hw + 3, hd + 5, H, 3);
  else {
    // the fallen third: the walls there broken lower in two wide steps, black tiles heaped in front of the house
    const x0 = hw - Math.round(hw * 0.6) + 5;
    B(x0, H - 6, -hd, hw, H, hd, null); B(x0 + 6, H - 12, -hd, hw, H - 7, hd, null);
    for (let i = 0; i < 2; i++) B(hw - 14 + i * 4, 0, hd + 2, hw + 2 - i * 4, 2 + i * 2, hd + 6 - i, i ? XP.tileL : XP.tile);
  }
  return { door: [dx, 8, hd + 1] as P3, top };
}
/** icicles under the eave row y on face z: one every 3 cells, the lengths a fixed pattern (structure, not scatter) */
export function icicles(B: Bx, x0: number, x1: number, z: number, y: number, k = 3) {
  const L = [3, 1, 2, 1, 4, 2, 1];
  for (let x = x0, i = 0; x <= x1; x += k, i++) { const n = L[i % L.length]; B(x, y - n + 1, z, x, y, z, XP.ice); B(x, y, z, x, y, z, XP.iceL); }
}

// ------------------------------------------------------------------ the city wall
/**
 * 城墙 along local x (x0..x1), the band z0..z1 across, H tall: a stone footing in two wide steps, grey brick in courses of 4 rows with
 * the vertical joints staggered half a brick (on the front face z1), the foot stained by the flood under a black line at `stain`;
 * a walkway on top and a crenellated parapet along the front (merlons 6 wide, gaps 4), frost / snow on every flat top.
 */
export function cityWall(B: Bx, x0: number, x1: number, z0: number, z1: number, H: number, cap: number, o: { stain?: number; crenel?: boolean; back?: boolean; hollow?: boolean } = {}) {
  B(x0, -1, z0, x1, 3, z1 + 4, XP.stoneD); B(x0, 4, z0, x1, 4, z1 + 4, XP.stone); B(x0, 5, z0, x1, 7, z1 + 2, XP.stoneD); B(x0, 8, z0, x1, 8, z1 + 2, XP.stone);
  // hollow (the long wall across a whole stage: ~200 k cells instead of ~1.6 M): only a 3-cell front skin and the top are solid —
  // the camera never sees inside or behind it
  if (o.hollow) { B(x0, 9, z1 - 2, x1, H, z1, XP.brick); B(x0, H - 1, z0, x1, H, z1 - 3, XP.brick); B(x0, 9, z0, x0 + 1, H, z1, XP.brick); B(x1 - 1, 9, z0, x1, H, z1, XP.brick); }
  else B(x0, 9, z0, x1, H, z1, XP.brick);
  for (let y = 12; y < H; y += 4) { B(x0, y, z1, x1, y, z1, XP.brickD); if (o.back) B(x0, y, z0, x1, y, z0, XP.brickD); }
  for (let y = 9, k = 0; y < H; y += 4, k++) for (let x = x0 + (k % 2 ? 4 : 0); x <= x1; x += 8) B(x, y, z1, x, Math.min(H, y + 2), z1, XP.brickD);
  const st = o.stain ?? 0;
  if (st > 9) { B(x0, 9, z1, x1, st - 1, z1, XP.brickW); B(x0, st, z1, x1, st, z1, XP.line); }
  B(x0, H + 1, z0, x1, H + 1, z1, XP.stoneD); B(x0, H + 2, z0, x1, H + 2, z1 - 3, cap);
  if (o.crenel !== false) {
    B(x0, H + 2, z1 - 2, x1, H + 4, z1, XP.brick);
    for (let x = x0; x + 5 <= x1; x += 10) { B(x, H + 5, z1 - 2, x + 5, H + 9, z1, XP.brick); B(x, H + 10, z1 - 2, x + 5, H + 10, z1, cap); B(x, H + 6, z1, x + 5, H + 6, z1, XP.brickD); }
    for (let x = x0 + 6; x + 3 <= x1; x += 10) B(x, H + 5, z1 - 2, x + 3, H + 5, z1, cap);
  }
}
/** an iron grille on the face z between x0..x1, y0..y1: upright bars every 3 cells, three cross bands, a rusted frame */
export function grille(B: Bx, x0: number, x1: number, z: number, y0: number, y1: number) {
  B(x0, y0, z - 1, x1, y1, z - 1, XP.dark);
  for (let x = x0 + 1; x < x1; x += 3) B(x, y0, z, x, y1, z, XP.iron);
  for (const y of [y0 + 2, Math.round((y0 + y1) / 2), y1 - 1]) B(x0, y, z, x1, y, z, XP.ironL);
  B(x0 - 1, y0, z, x0 - 1, y1 + 1, z, XP.rust); B(x1 + 1, y0, z, x1 + 1, y1 + 1, z, XP.rust); B(x0 - 1, y1 + 1, z, x1 + 1, y1 + 1, z, XP.rust);
}

// ------------------------------------------------------------------ timber, bags, stones, boats
/** boards along local z (x0..x1 across, z0..z1 along) at height y: boards 3 cells wide, a dark seam between, butt joints staggered */
export function boardsZ(B: Bx, x0: number, x1: number, z0: number, z1: number, y: number) {
  B(x0, y, z0, x1, y, z1, XP.plank);
  for (let x = x0 + 3, k = 0; x <= x1; x += 4, k++) B(x, y, z0, x, y, z1, XP.plankD);
  for (let x = x0, k = 0; x <= x1; x += 4, k++) for (let z = z0 + 6 + (k % 3) * 7; z < z1; z += 21) B(x, y, z, Math.min(x1, x + 2), y, z, XP.plankD);
  B(x0, y, z0, x1, y, z0, XP.plankL);
}
/** boards along local x (same, turned) */
export function boardsX(B: Bx, x0: number, x1: number, z0: number, z1: number, y: number) {
  B(x0, y, z0, x1, y, z1, XP.plank);
  for (let z = z0 + 3; z <= z1; z += 4) B(x0, y, z, x1, y, z, XP.plankD);
  for (let z = z0, k = 0; z <= z1; z += 4, k++) for (let x = x0 + 6 + (k % 3) * 7; x < x1; x += 21) B(x, y, z, x, y, Math.min(z1, z + 2), XP.plankD);
}
/** a wall of sandbags along local x: courses 3 rows tall, bags 8 long staggered half a bag, the seams dark, the lowest course wet, the cap on top */
export function sackRow(B: Bx, x0: number, x1: number, z0: number, z1: number, courses: number, cap: number) {
  for (let k = 0; k < courses; k++) {
    const y = k * 3, a = x0 + (k % 2) * 2, b = x1 - (k % 2) * 2;
    B(a, y, z0 + (k ? 1 : 0), b, y + 2, z1 - (k ? 1 : 0), k === 0 ? XP.sackW : k === courses - 1 ? XP.sackL : XP.sack);
    B(a, y, z0 + (k ? 1 : 0), b, y, z1 - (k ? 1 : 0), XP.sackD);
    for (let x = a + (k % 2 ? 4 : 0); x <= b; x += 8) { B(x, y + 1, z0 + (k ? 1 : 0), x, y + 2, z0 + (k ? 1 : 0), XP.sackD); B(x, y + 1, z1 - (k ? 1 : 0), x, y + 2, z1 - (k ? 1 : 0), XP.sackD); }
  }
  const t = courses * 3, k = courses - 1; B(x0 + (k % 2) * 2, t, z0 + 1, x1 - (k % 2) * 2, t, z1 - 1, cap);
  return t;
}
/** 系船石: a squat stone post (corners cut by a cell), a collar, a rope wound round it */
export function bollard(B: Bx, x: number, z: number, h = 12) {
  B(x - 4, 0, z - 3, x + 4, h, z + 3, XP.stone); B(x - 3, 0, z - 4, x + 3, h, z + 4, XP.stone);
  B(x - 4, 0, z - 3, x + 4, 1, z + 3, XP.stoneD); B(x - 3, 0, z - 4, x + 3, 1, z + 4, XP.stoneD);
  B(x - 3, h + 1, z - 3, x + 3, h + 2, z + 3, XP.stoneL); B(x - 4, h - 4, z - 3, x + 4, h - 3, z + 3, XP.rope); B(x - 3, h - 4, z - 4, x + 3, h - 3, z + 4, XP.rope);
}
/** a wooden crate (a frame of darker edges, boards on the faces, a lid row); returns its top y */
export function crate(B: Bx, x: number, z: number, s: number, y = 0) {
  B(x - s, y, z - s, x + s, y + 2 * s, z + s, XP.plank);
  for (const a of [-s, s]) for (const b of [-s, s]) B(x + a, y, z + b, x + a, y + 2 * s, z + b, XP.woodD);
  B(x - s, y + 2 * s, z - s, x + s, y + 2 * s, z + s, XP.plankL); B(x - s, y + s, z + s, x + s, y + s, z + s, XP.plankD); B(x - s, y + s, z - s, x + s, y + s, z - s, XP.plankD);
  return y + 2 * s;
}
/**
 * 半沉的船 along local x (len cells, bow at +x): the two sides and the transom above the water, a thwart, the bow end down in the
 * mud a step lower; the water inside it and round it marked. Returns its top y.
 */
export function sunkBoat(B: Bx, x: number, z: number, len: number, w = 6) {
  markWater(B, x - len / 2 - 6, z - w - 6, x + len / 2 + 6, z + w + 6, 2);
  const a = x - Math.round(len / 2), b = x + Math.round(len / 2);
  B(a, 0, z - w, b - 6, 5, z - w + 1, XP.wood); B(a, 0, z + w - 1, b - 6, 5, z + w, XP.wood);
  B(b - 5, 0, z - w + 1, b, 3, z + w - 1, XP.woodD); B(b - 5, 0, z - w + 2, b - 3, 4, z + w - 2, XP.wood);
  B(a, 0, z - w, a + 1, 7, z + w, XP.woodD); B(a, 8, z - w, a + 1, 8, z + w, XP.woodL);
  B(a, 6, z - w, b - 6, 6, z - w + 1, XP.woodL); B(a, 6, z + w - 1, b - 6, 6, z + w, XP.woodL);
  B(Math.round(x - 2), 3, z - w + 2, Math.round(x + 1), 4, z + w - 2, XP.woodD);
  B(a + 3, 0, z - w + 2, b - 7, 0, z + w - 2, XP.water);
  return 8;
}
/** an iron fire basin on four legs; lit = an ember bed and a stepped plus-shaped flame (glow). Returns the flame point (local). */
export function brazier(B: Bx, x: number, z: number, lit: boolean, h = 9): P3 {
  for (const a of [-4, 3]) for (const b of [-4, 3]) B(x + a, 0, z + b, x + a + 1, h, z + b + 1, XP.iron);
  B(x - 6, h + 1, z - 6, x + 6, h + 3, z + 6, XP.iron); B(x - 5, h + 2, z - 5, x + 5, h + 3, z + 5, null);
  for (const s of [-7, 7]) { B(x - 7, h + 3, z + s, x + 7, h + 3, z + s, XP.ironL); B(x + s, h + 3, z - 7, x + s, h + 3, z + 7, XP.ironL); }
  if (!lit) { B(x - 5, h + 2, z - 5, x + 5, h + 2, z + 5, XP.stoneDD); return [x, h + 3, z]; }
  B(x - 5, h + 2, z - 5, x + 5, h + 2, z + 5, XP.ember, 1);
  B(x - 3, h + 3, z - 1, x + 3, h + 5, z + 1, XP.flame, 1); B(x - 1, h + 3, z - 3, x + 1, h + 5, z + 3, XP.flame, 1);
  B(x - 1, h + 6, z, x + 1, h + 7, z, XP.flameL, 1); B(x, h + 6, z - 1, x, h + 7, z + 1, XP.flameL, 1);
  return [x, h + 5, z];
}
/** a hanging rope from (x, yTop, z) down len cells, a loop at its foot (the 缢绳 of 白门楼) */
export function noose(B: Bx, x: number, z: number, yTop: number, len: number) {
  const yb = yTop - len;
  B(x, yb + 1, z, x, yTop, z, XP.rope);
  B(x - 2, yb - 4, z, x - 2, yb, z, XP.rope); B(x + 2, yb - 4, z, x + 2, yb, z, XP.rope); B(x - 2, yb - 5, z, x + 2, yb - 5, z, XP.rope); B(x - 2, yb, z, x + 2, yb, z, XP.ropeD);
}
/** 枯柳: a bare grey willow (the dead tree's right-angle limbs), dead strands hanging off most of them like a willow's */
export function deadWillow(c: Ctx, x: number, z: number, h: number, seed: number) {
  deadTree(c.w, x, z, h, XP.bark, XP.barkD, { seed, crow: 0.25, moss: 0.9, hang: 'deadvine' });
}
/** a heap of rubble stones: two flat tiers, whole blocks */
export function stoneHeap(B: Bx, x: number, z: number, hw: number, hd: number) {
  B(x - hw, 0, z - hd, x + hw, 3, z + hd, XP.stoneD); B(x - hw + 1, 4, z - hd + 1, x + hw - 1, 4, z + hd - 1, XP.stone);
  B(x - hw + 3, 5, z - hd + 2, x + 1, 8, z + hd - 2, XP.stone); B(x - hw + 3, 9, z - hd + 2, x + 1, 9, z + hd - 2, XP.stoneL);
}
