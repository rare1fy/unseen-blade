// 第二关 · 洛阳余烬的部件库（三个地点共用）：董卓焚城后的废都。焦黑的朱柱、烧裂的宫墙（朱漆一块块剥落露出夯土层）、
// 残瓦顶、铜驼、石兽、残碑、砖瓦堆、焦梁、钱范、铜钱堆、铜锭、火盆、余火堆、半熔的铜人。
// 铁律同黄巾残村：横平竖直的大块体，斜面一律几层宽台阶（每层 ≥ 3～4 格），花纹只画结构（砖缝、夯土层、瓦垄、范上的浇道），
// 没有逐格随机色；换色以整块（整块砖、整片朱漆、整层夯土）为单位。体素 7 厘米一格。
// 通用的本地框（frame / up / faceOf / orient）、汉瓦顶、碑、辟邪、倒梁、烟柱借破庙的部件库（只读引用，不改那边）。
import { hash } from '../../scenes/props';
import type { Ctx } from '../../scenes/stage';
import type { Bx, P3 } from '../../scenes/k_village';
import { locM } from '../../scenes/k_village';
import { M } from '../../scenes/props';
import type { Place } from '../types';
import { frame, up, at, mir, faceOf, orient, shell, hanRoof, beamDown, stele, bixie, smoke } from '../hanmo/hj_temple_kit';
import { deadTree } from '../../scenes/flora';
export { frame, up, at, mir, faceOf, orient, shell, hanRoof, beamDown, stele, bixie, smoke };

/** 洛阳调色：焦砖、灰、夯土、剥落的朱漆、汉瓦、铜绿、新熔的赤铜、铁水橙。每种材料两三档（本体 / 暗 / 亮） */
export const LY = {
  brick: 0x5e5854, brickD: 0x46413e, brickL: 0x76706a,
  earth: 0x8a7458, earthD: 0x6e5c46, earthL: 0xa08a6a,
  red: 0x7a3226, redD: 0x5a241c, redL: 0x94442e,
  char: 0x26211e, charL: 0x3a332e, charD: 0x1a1614,
  ash: 0x6e6862, ashL: 0x8a847c, ashD: 0x55504b,
  tile: 0x45474c, tileD: 0x2e3034, tileL: 0x5c5e64,
  stone: 0x7a7670, stoneD: 0x5e5a56, stoneL: 0x949088, stoneDD: 0x45423f,
  bronze: 0x4e6a58, bronzeD: 0x34483c, bronzeL: 0x6e8a72,
  copper: 0x9a5a34, copperD: 0x6e3e24, copperL: 0xc07a44,
  coin: 0xa07a3e, coinD: 0x7a5a2e, coinL: 0xc09a52,
  clay: 0x8a6a50, clayD: 0x6a4e3a, clayL: 0xa0805e,
  iron: 0x34323a, ironL: 0x55535c, slag: 0x3a3432,
  wood: 0x5a4432, woodD: 0x3e2e22, rope: 0x8a7a5a,
  ember: 0xd8602a, flame: 0xff9a38, flameL: 0xffc864, molten: 0xff7a1e, moltenL: 0xffb040,
};

/** a stable [0, 1) number for a block index (whole-block colour picks, never per cell) */
export const hk = (a: number, b: number, salt = 0) => hash(a * 31 + 7, b * 17 + 3, salt + 211);
/** the world point of a local cell of a piece built with frame(p.x, p.z, r) */
export const wp = (p: Place, r: number, lx: number, y: number, lz: number): P3 => locM(M(p.x), M(p.z), r, lx, y, lz);
/** a warm point light (fires are this region's main light, so they stay on from dusk to dawn; noon only in the rooms that ask) */
export const fireLight = (c: Ctx, p: Place, at3: P3, k = 1, d = 5) => { if (p.lamp > 0.2) c.light(at3, 0xff8a3a, 2.4 * Math.max(p.lamp, 0.8) * k, d); };

// ------------------------------------------------------------------ columns and walls
/**
 * 焦朱柱: a plus-section column (reads round) on a stone base. Below charAt it keeps its dull red, a charred band at its foot; above
 * it the fire took it black. broken: snapped at h, one half of the section standing three cells higher (a break in one wide step).
 * Returns the top y.
 */
export function charPost(B: Bx, x: number, z: number, h: number, o: { broken?: boolean; charAt?: number } = {}) {
  B(x - 4, -1, z - 4, x + 4, 1, z + 4, LY.stoneD); B(x - 3, 2, z - 3, x + 3, 2, z + 3, LY.stone);
  const top = o.broken ? h - 3 : h, ca = Math.min(top, o.charAt ?? Math.round(h * 0.45));
  const sec = (y0: number, y1: number, col: number) => { if (y1 < y0) return; B(x - 2, y0, z - 1, x + 2, y1, z + 1, col); B(x - 1, y0, z - 2, x + 1, y1, z + 2, col); };
  sec(3, ca, LY.redD); sec(3, 4, LY.charL); sec(ca + 1, top, LY.char); if (ca + 1 <= top) sec(ca + 1, ca + 1, LY.charL);
  if (o.broken) { B(x - 2, top + 1, z - 1, x + 2, top + 1, z + 1, LY.charD); B(x - 2, top + 2, z - 1, x, top + 4, z + 1, LY.char); }
  return o.broken ? top + 4 : top;
}
/**
 * 烧裂宫墙 along local x from x0 to x1, the band z0..z1 across. A stone plinth, a rammed-earth core (layer lines every 6 rows on both
 * faces), red plaster kept on the lower wall in whole panels 12 cells wide (each panel's top at its own height: the plaster fell off
 * above it and the earth shows), a soot band under the top, a tiled coping on the stretches still at full height. drops = [a, b, h]
 * stretches knocked lower (straight steps, never a slope).
 */
export function palaceWall(B: Bx, x0: number, x1: number, z0: number, z1: number, H: number, o: { drops?: Array<[number, number, number]>; seed?: number; plaster?: number } = {}) {
  const sd = o.seed ?? 1, cuts = new Set<number>([x0, x1 + 1]);
  for (const [a, b] of o.drops ?? []) { cuts.add(Math.max(x0, a)); cuts.add(Math.min(x1, b) + 1); }
  const xs = [...cuts].sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1] - 1, d = (o.drops ?? []).find(([p, q]) => a >= p && b <= q), h = d ? d[2] : H;
    B(a, -1, z0 - 1, b, 1, z1 + 1, LY.stoneD); B(a, 2, z0 - 1, b, 2, z1 + 1, LY.stone);
    B(a, 3, z0, b, h, z1, LY.earth);
    for (let y = 8; y < h - 3; y += 6) { B(a, y, z0, b, y, z0, LY.earthD); B(a, y, z1, b, y, z1, LY.earthD); }
    // the plaster panels (whole panels, a dark foot row), each on both faces
    for (let p = a; p <= b; p += 12) {
      const q = Math.min(b, p + 11), k = Math.floor(p / 12), top = Math.min(h - 4, 3 + Math.round((o.plaster ?? 0.55) * (h - 6) * (0.45 + hk(k, sd, 3) * 0.8)));
      if (top < 6) continue;
      for (const zf of [z0, z1]) { B(p, 3, zf, q, top, zf, LY.red); B(p, 3, zf, q, 4, zf, LY.redD); if (hk(k, sd, 5) < 0.35) B(p, top, zf, q, top, zf, LY.redL); }
    }
    // the soot of the fire on the upper wall
    for (const zf of [z0, z1]) { B(a, Math.max(5, h - 4), zf, b, h - 2, zf, LY.charL); B(a, h - 1, zf, b, h, zf, LY.char); }
    if (h >= H) { B(a, h + 1, z0 - 1, b, h + 1, z1 + 1, LY.tileD); B(a, h + 2, z0, b, h + 2, z1, LY.tile); B(a, h + 3, z0 + 1, b, h + 3, z1 - 1, LY.tileL); }
    else B(a, h, z0, b, h, z1, LY.earthL);
  }
}

// ------------------------------------------------------------------ heaps
/** a heap of fallen brick and tile: two or three flat tiers (brick / tile / brick), brick courses on the tiers; beam = a charred beam on top */
export function rubble(B: Bx, x: number, z: number, hw: number, hd: number, tiers = 3, o: { beam?: boolean } = {}) {
  let top = 0;
  for (let i = 0; i < tiers; i++) {
    const a = hw - i * 4, b = hd - i * 3, y0 = i === 0 ? -1 : i * 3, y1 = i * 3 + 2; if (a < 2 || b < 2) break;
    B(x - a, y0, z - b, x + a, y1, z + b, i % 2 ? LY.tileD : i ? LY.brickD : LY.brick);
    for (let xx = x - a + 2; xx <= x + a - 1; xx += 5) B(xx, y1, z - b, xx, y1, z + b, i % 2 ? LY.tile : LY.brickL);
    top = y1;
  }
  if (o.beam) B(x - hw - 3, top + 1, z - 1, x + hw - 4, top + 2, z + 1, LY.char);
  return top;
}
/** a smouldering heap: an ash ring, charred lumps and two crossed beams, the embers in the middle (glow when lit). Returns the fire point. */
export function emberHeap(B: Bx, x: number, z: number, lit: boolean): P3 {
  B(x - 12, -1, z - 10, x + 12, -1, z + 10, LY.ash); B(x - 9, -1, z - 7, x + 9, -1, z + 7, LY.ashD);
  B(x - 8, 0, z - 6, x + 8, 2, z + 6, LY.charL);
  B(x - 15, 0, z - 2, x + 11, 2, z + 1, LY.char); B(x - 3, 0, z - 11, x, 2, z + 9, LY.charD);
  B(x - 4, 3, z - 3, x + 3, 3, z + 2, lit ? LY.ember : LY.ashD, lit ? 1 : 0);
  B(x - 5, 3, z - 5, x - 1, 5, z - 3, LY.char); B(x + 2, 3, z + 1, x + 6, 4, z + 4, LY.charL);
  if (lit) { B(x - 1, 4, z - 1, x + 1, 6, z + 1, LY.flame, 1); B(x, 7, z, x, 7, z, LY.flameL, 1); }
  return [x, 5, z];
}

// ------------------------------------------------------------------ fire
/** an iron fire basin on four square legs; lit = an ember bed and a stepped plus-shaped flame (glow). Returns the flame point (local). */
export function fireBasin(B: Bx, x: number, z: number, lit: boolean, h = 10): P3 {
  for (const a of [-5, 4]) for (const b of [-5, 4]) B(x + a, -1, z + b, x + a + 1, h, z + b + 1, LY.iron);
  B(x - 7, h + 1, z - 7, x + 7, h + 4, z + 7, LY.iron); B(x - 6, h + 3, z - 6, x + 6, h + 4, z + 6, null);
  for (const s of [-8, 8]) { B(x - 8, h + 4, z + s, x + 8, h + 4, z + s, LY.ironL); B(x + s, h + 4, z - 8, x + s, h + 4, z + 8, LY.ironL); }
  if (!lit) { B(x - 6, h + 3, z - 6, x + 6, h + 3, z + 6, LY.ash); B(x - 2, h + 4, z - 1, x + 3, h + 4, z, LY.char); return [x, h + 4, z]; }
  B(x - 6, h + 3, z - 6, x + 6, h + 3, z + 6, LY.ember, 1);
  B(x - 4, h + 4, z - 1, x + 4, h + 6, z + 1, LY.flame, 1); B(x - 1, h + 4, z - 4, x + 1, h + 6, z + 4, LY.flame, 1);
  B(x - 2, h + 7, z, x + 2, h + 8, z, LY.flameL, 1); B(x, h + 7, z - 2, x, h + 8, z + 2, LY.flameL, 1);
  return [x, h + 6, z];
}

// ------------------------------------------------------------------ bronze
/**
 * 铜驼 on a stone plinth, its length along local z, facing +z: a two-humped camel of bronze gone green — four straight square legs,
 * a long body with a dark belly band, two humps, the neck up from the chest, the head forward. broken: the front hump and the head are
 * gone (the head lies by the plinth). Top ≈ 42 cells (2.9 m), plinth 17 × 39 cells.
 */
export function camel(B: Bx, x: number, z: number, o: { broken?: boolean } = {}) {
  B(x - 8, -1, z - 20, x + 8, 4, z + 18, LY.stoneD); B(x - 7, 5, z - 19, x + 7, 5, z + 17, LY.stone); B(x - 8, 2, z - 20, x + 8, 2, z + 18, LY.stoneDD);
  for (const lz of [-14, 9]) for (const s of [-1, 1]) B(x + s * 4 - 1, 6, z + lz - 1, x + s * 4 + 1, 18, z + lz + 1, LY.bronzeD);
  B(x - 5, 19, z - 17, x + 5, 27, z + 13, LY.bronze); B(x - 5, 19, z - 15, x + 5, 20, z + 11, LY.bronzeD); B(x - 4, 28, z - 16, x + 4, 28, z + 12, LY.bronzeL);
  B(x - 1, 20, z - 20, x + 1, 26, z - 18, LY.bronzeD);
  B(x - 3, 29, z - 12, x + 3, 34, z - 5, LY.bronze); B(x - 2, 35, z - 11, x + 2, 35, z - 6, LY.bronzeL);
  if (!o.broken) {
    B(x - 3, 29, z + 1, x + 3, 33, z + 8, LY.bronze); B(x - 2, 34, z + 2, x + 2, 34, z + 7, LY.bronzeL);
    B(x - 2, 22, z + 14, x + 2, 38, z + 18, LY.bronze); B(x - 2, 36, z + 19, x + 2, 41, z + 25, LY.bronze); B(x - 2, 42, z + 19, x + 2, 42, z + 23, LY.bronzeL);
    B(x - 3, 42, z + 18, x - 3, 44, z + 19, LY.bronzeD); B(x + 3, 42, z + 18, x + 3, 44, z + 19, LY.bronzeD);
  } else {
    B(x - 2, 22, z + 14, x + 2, 29, z + 17, LY.bronze); B(x - 2, 30, z + 14, x + 2, 30, z + 17, LY.copper);
    B(x + 10, -1, z + 4, x + 16, 4, z + 12, LY.bronze); B(x + 10, 5, z + 5, x + 16, 5, z + 11, LY.bronzeL);
  }
}
/**
 * a camel fallen on its side, its length along local x (head toward +x), the humps out toward −z, the legs toward +z; a patch of ash
 * where it fell. cut: the looters have hacked the head off (it lies a little apart, the neck stump shows bright copper).
 * Extent x −18..26, z −13..17 (3.2 × 2.2 m).
 */
export function camelDown(B: Bx, x: number, z: number, o: { cut?: boolean } = {}) {
  B(x - 18, -1, z - 12, x + 26, -1, z + 17, LY.ashD);
  B(x - 14, 0, z - 8, x + 8, 9, z + 3, LY.bronze); B(x - 14, 10, z - 7, x + 8, 10, z + 2, LY.bronzeL); B(x - 14, 0, z - 8, x + 8, 1, z - 8, LY.bronzeD);
  B(x - 10, 2, z - 13, x - 4, 8, z - 9, LY.bronze); B(x - 1, 2, z - 13, x + 5, 7, z - 9, LY.bronze); B(x - 10, 8, z - 12, x - 4, 8, z - 10, LY.bronzeL);
  for (const a of [-12, -7, 1, 5]) B(x + a, 0, z + 4, x + a + 2, 2, z + 15, LY.bronzeD);
  B(x - 17, 0, z - 3, x - 15, 2, z - 1, LY.bronzeD);
  if (!o.cut) { B(x + 9, 0, z - 4, x + 16, 5, z + 1, LY.bronze); B(x + 17, 0, z - 5, x + 24, 6, z + 2, LY.bronze); B(x + 17, 7, z - 4, x + 23, 7, z + 1, LY.bronzeL); }
  else { B(x + 9, 0, z - 4, x + 11, 5, z + 1, LY.bronze); B(x + 12, 0, z - 4, x + 12, 5, z + 1, LY.copperL); B(x + 17, 0, z - 5, x + 24, 6, z + 2, LY.bronze); B(x + 17, 0, z - 5, x + 17, 6, z + 2, LY.copper); }
}
/**
 * 半熔铜人: a bronze giant on its back along local x (feet at −x), arms at its sides, a belt band; the head end has run into a stepped
 * puddle of red copper, the core still molten (glow when lit). Extent x −38..38, z −14..14 (5.4 × 2.0 m). Returns the molten point.
 */
export function copperMan(B: Bx, x: number, z: number, lit: boolean): P3 {
  for (const s of [-1, 1]) { B(x - 34, -1, z + s * 5 - 3, x - 8, 6, z + s * 5 + 3, LY.bronze); B(x - 34, 7, z + s * 5 - 2, x - 8, 7, z + s * 5 + 2, LY.bronzeL); B(x - 38, -1, z + s * 5 - 3, x - 35, 11, z + s * 5 + 3, LY.bronzeD); }
  B(x - 8, -1, z - 10, x + 14, 9, z + 10, LY.bronze); B(x - 6, 10, z - 8, x + 12, 10, z + 8, LY.bronzeL); B(x - 2, -1, z - 10, x, 9, z + 10, LY.bronzeD);
  for (const s of [-1, 1]) { const a = s > 0 ? z + 11 : z - 14, b = s > 0 ? z + 14 : z - 11; B(x - 6, -1, a, x + 12, 5, b, LY.bronze); B(x - 6, 6, a, x + 12, 6, b, LY.bronzeL); B(x - 10, -1, a, x - 7, 4, b, LY.bronzeD); }
  B(x + 15, -1, z - 4, x + 17, 6, z + 4, LY.bronzeD);
  B(x + 18, -1, z - 7, x + 26, 5, z + 7, LY.bronze); B(x + 18, 6, z - 5, x + 23, 6, z + 5, LY.bronzeL);
  // the run-off: two flat tiers of red copper spreading from the melted head, the molten core in the middle
  B(x + 20, -1, z - 13, x + 38, 0, z + 13, LY.copperD); B(x + 24, 1, z - 10, x + 35, 1, z + 10, LY.copper);
  B(x + 27, 2, z - 6, x + 32, 2, z + 6, lit ? LY.molten : LY.copperL, lit ? 1 : 0);
  if (lit) B(x + 28, 3, z - 3, x + 31, 3, z + 3, LY.moltenL, 1);
  return [x + 30, 3, z];
}

// ------------------------------------------------------------------ the mint's goods
/** 钱范: a clay (or bronze) coin mould plate at height y, its length along local z: a central pouring channel, a funnel at +z, a row
 *  of coin pits each side joined to the channel by a short branch (the mould's own structure, nothing scattered) */
export function qianfan(B: Bx, x: number, z: number, y = 0, o: { bronze?: boolean } = {}) {
  const C = o.bronze ? LY.bronze : LY.clay, D = o.bronze ? LY.bronzeD : LY.clayD, L = o.bronze ? LY.bronzeL : LY.clayL;
  B(x - 5, y, z - 8, x + 5, y + 1, z + 8, C); B(x - 5, y + 1, z - 8, x + 5, y + 1, z - 8, L);
  B(x, y + 1, z - 7, x, y + 1, z + 6, D); B(x - 2, y + 1, z + 6, x + 2, y + 1, z + 8, D);
  for (let zz = z - 6; zz <= z + 3; zz += 3) { B(x - 4, y + 1, zz, x - 3, y + 1, zz + 1, D); B(x + 3, y + 1, zz, x + 4, y + 1, zz + 1, D); B(x - 2, y + 1, zz, x - 1, y + 1, zz, D); B(x + 1, y + 1, zz, x + 2, y + 1, zz, D); }
}
/** a heap of cast cash: flat tiers stepping in, the dark band at each tier's foot, the top tier bright */
export function coinHeap(B: Bx, x: number, z: number, r: number, tiers = 3) {
  for (let i = 0; i < tiers; i++) {
    const a = r - i * 3, y0 = i === 0 ? -1 : i * 2, y1 = i * 2 + 1; if (a < 2) break;
    B(x - a, y0, z - a + 1, x + a, y1, z + a - 1, i === tiers - 1 ? LY.coinL : LY.coin); B(x - a + 1, y0, z - a, x + a - 1, y1, z + a, i === tiers - 1 ? LY.coinL : LY.coin);
    B(x - a, y0 < 0 ? 0 : y0, z - a + 1, x + a, y0 < 0 ? 0 : y0, z + a - 1, LY.coinD);
  }
}
/** strings of cash (贯) lying side by side along local x, a rope knot at each end */
export function cashStrings(B: Bx, x0: number, x1: number, z: number, n = 3, y = 0) {
  for (let i = 0; i < n; i++) {
    const zz = z + i * 3; B(x0, y, zz, x1, y + 1, zz + 1, LY.coin);
    for (let a = x0 + 2; a < x1; a += 4) B(a, y + 1, zz, a, y + 1, zz + 1, LY.coinD);
    B(x0 - 2, y, zz, x0 - 1, y + 2, zz + 1, LY.rope); B(x1 + 1, y, zz, x1 + 2, y + 2, zz + 1, LY.rope);
  }
}
/** copper ingots stacked in crossing layers (each layer turned a quarter, each resting right on the one below), the top layer bright */
export function ingots(B: Bx, x: number, z: number, layers = 3) {
  for (let l = 0; l < layers; l++) {
    const y = l * 2 - 1, col = l === layers - 1 ? LY.copperL : LY.copper;
    for (let k = -1; k <= 1; k++) l % 2 ? B(x + k * 4 - 1, y, z - 5, x + k * 4 + 1, y + 1, z + 5, col) : B(x - 5, y, z + k * 4 - 1, x + 5, y + 1, z + k * 4 + 1, col);
  }
}

// ------------------------------------------------------------------ timber frames (a house burnt down to its bones)
/** posts at the given (x, z), each from the ground to h (charred, a dark foot); beams along x and z joining them at the top (flat) */
export function frameBay(B: Bx, posts: Array<[number, number, number]>, beams: Array<[number, number, number, number, number]>) {
  for (const [x, z, h] of posts) { B(x - 1, -1, z - 1, x + 1, 0, z + 1, LY.stoneD); B(x - 1, 1, z - 1, x + 1, h, z + 1, LY.char); B(x - 1, 1, z - 1, x + 1, 3, z + 1, LY.charD); }
  for (const [x0, z0, x1, z1, y] of beams) B(x0, y, z0, x1, y + 1, z1, LY.charL);
}
// ------------------------------------------------------------------ 阙, trees, ground rings (second pass, 11-18)
/**
 * 洛阳宫的阙: a brick shaft on a stone plinth facing local +z, built round local x = cx; m = which side its lower sub-tower stands on.
 * Brick courses every 4 rows on all four faces, a soot band under the top. Whole: the timber storey on top burnt to four corner
 * posts and a slab, its tile cap left only over the inner half (rafter ends out of the cut). broken: the shaft knocked down to a
 * stump stepping up once on its inner half, its brick in a heap in front. Whole ≈ 66 cells tall; extent x −14..25, z −10..10
 * (broken: the heap reaches z 21).
 */
export function lyQue(B: Bx, cx: number, m: 1 | -1, o: { broken?: boolean } = {}) {
  const Q: Bx = (x0, y0, z0, x1, y1, z1, c, g) => B(cx + m * x0, y0, z0, cx + m * x1, y1, z1, c, g);
  Q(-14, -1, -10, 25, 2, 10, LY.stoneD); Q(-13, 3, -9, 24, 3, 9, LY.stone);
  const shaft = (x0: number, x1: number, z0: number, z1: number, h: number) => {
    Q(x0, 4, z0, x1, h, z1, LY.brick); Q(x0, 4, z0, x1, 5, z1, LY.brickD);
    for (let y = 9; y < h - 4; y += 4) { Q(x0, y, z0, x1, y, z0, LY.brickD); Q(x0, y, z1, x1, y, z1, LY.brickD); Q(x0, y, z0, x0, y, z1, LY.brickD); Q(x1, y, z0, x1, y, z1, LY.brickD); }
    Q(x0, h - 3, z0, x1, h - 1, z1, LY.charL); Q(x0, h, z0, x1, h, z1, LY.char);
  };
  if (!o.broken) {
    shaft(-10, 10, -7, 7, 40); shaft(11, 21, -6, 6, 24);
    Q(-6, 14, 7, 6, 32, 7, LY.brickD); Q(-5, 15, 7, 5, 31, 7, LY.redD);
    hanRoof(Q, 9, 25, -9, 9, 25, [[0, 2], [3, 2]], 2);
    for (const a of [-10, 8]) for (const b of [-7, 5]) Q(a, 41, b, a + 2, 52, b + 2, LY.char);
    Q(-11, 53, -8, 11, 54, 8, LY.charL);
    hanRoof(Q, -15, 4, -11, 11, 55, [[0, 3], [4, 2]], 2, { cut1: true });
  } else {
    shaft(-10, 10, -7, 7, 24); shaft(11, 21, -6, 6, 16);
    Q(-10, 25, -7, -1, 29, 7, LY.brick); Q(-10, 27, -7, -1, 28, 7, LY.charL); Q(-10, 29, -7, -1, 29, 7, LY.char);
    rubble(Q, 4, 13, 9, 3, 2); beamDown(Q, -12, 6, 19);
  }
}
/** a tree the fire killed: the shared dead tree in char colours, no moss or vines, an ash ring at its foot */
export function charTree(c: Ctx, x: number, z: number, h: number, seed: number, crow = 0.25) {
  const B = frame(c.w, x, z, 0); B(-12, -1, -12, 12, -1, 12, LY.ashD); B(-8, -1, -8, 8, -1, 8, LY.ash);
  deadTree(c.w, x, z, h, LY.charL, LY.charD, { seed, crow, moss: false });
}
/**
 * 高炉 (the mint's great furnace) facing local +z, centred on (x, z): a stone-and-brick base two tiers, the shaft of brick stepping
 * in three times (iron hoops between), a charging platform with a timber frame on top, the mouth on the front low down (molten
 * glow), a stone channel from the mouth running forward to z + runTo, glowing along its length. Two bellows sheds against its
 * sides. lit = glow on. Returns the mouth point, the top (smoke) point (local cells). Extent x ±50, z −34..runTo, top ≈ 110.
 */
export function blastFurnace(B: Bx, x: number, z: number, lit: boolean, runTo = 44): { mouth: P3; top: P3; run: P3 } {
  const L = lit ? 1 : 0;
  // the base: a stone plinth and a brick tier, a dark stoke hole each side
  B(x - 40, -1, z - 34, x + 40, 6, z + 22, LY.stoneD); B(x - 40, 7, z - 34, x + 40, 7, z + 22, LY.stone);
  B(x - 34, 8, z - 30, x + 34, 22, z + 18, LY.brick); for (let y = 12; y < 22; y += 4) B(x - 34, y, z + 18, x + 34, y, z + 18, LY.brickD);
  B(x - 34, 8, z - 30, x + 34, 9, z + 18, LY.brickD); B(x - 35, 22, z - 31, x + 35, 23, z + 19, LY.iron);
  // the shaft: three tiers stepping in, a hoop at each step, soot on the upper courses
  const tiers: Array<[number, number, number, number]> = [[26, 24, 48, 14], [20, 49, 74, 10], [14, 75, 96, 6]];
  for (const [hw, y0, y1, fz] of tiers) {
    B(x - hw, y0, z - 26 + (26 - hw), x + hw, y1, z + fz, LY.brick);
    for (let y = y0 + 4; y < y1; y += 4) { B(x - hw, y, z + fz, x + hw, y, z + fz, LY.brickD); B(x - hw, y, z - 26 + (26 - hw), x - hw, y, z + fz, LY.brickD); B(x + hw, y, z - 26 + (26 - hw), x + hw, y, z + fz, LY.brickD); }
    B(x - hw - 1, y1, z - 27 + (26 - hw), x + hw + 1, y1, z + fz + 1, LY.iron);
    B(x - hw, y1 - 6, z + fz, x + hw, y1 - 1, z + fz, LY.charL);
  }
  // the throat on top: the charging platform (iron), its timber frame and a dark mouth with a glow inside
  B(x - 18, 97, z - 18, x + 18, 98, z + 10, LY.ironL); B(x - 8, 97, z - 10, x + 8, 98, z + 2, null); B(x - 8, 95, z - 10, x + 8, 96, z + 2, lit ? LY.molten : LY.charD, L);
  for (const a of [-17, 15]) for (const b of [-17, 8]) B(x + a, 99, z + b, x + a + 2, 110, z + b + 2, LY.char);
  B(x - 18, 111, z - 18, x + 18, 112, z - 16, LY.charL); B(x - 18, 111, z + 8, x + 18, 112, z + 10, LY.charL);
  // the mouth: an arched (stepped) opening on the base's front, the glow inside, a stone lip
  B(x - 10, 8, z + 18, x + 10, 22, z + 18, LY.brickD); B(x - 8, 8, z + 14, x + 8, 18, z + 18, null); B(x - 6, 19, z + 14, x + 6, 20, z + 18, null);
  B(x - 8, 8, z + 13, x + 8, 18, z + 13, lit ? LY.molten : LY.charD, L); if (lit) B(x - 5, 9, z + 13, x + 5, 15, z + 13, LY.moltenL, L);
  B(x - 10, 7, z + 19, x + 10, 7, z + 24, LY.stoneL);
  // the run-out channel forward along the ground, the copper glowing in it
  B(x - 5, -1, z + 22, x + 5, 3, z + runTo, LY.stoneD); B(x - 5, 4, z + 22, x + 5, 4, z + runTo, LY.stone); B(x - 3, 2, z + 22, x + 3, 4, z + runTo - 2, null);
  B(x - 3, 2, z + 22, x + 3, 2, z + runTo - 2, lit ? LY.molten : LY.copperD, L); if (lit) B(x - 1, 3, z + 22, x + 1, 3, z + runTo - 4, LY.moltenL, L);
  // the bellows sheds on its flanks: posts, a plank roof, the bellows box and its pipe into the base
  for (const s of [-1, 1]) {
    const a = x + s * 36, b = x + s * 50;
    for (const px of [a, b]) for (const pz of [z - 24, z + 6]) B(Math.min(px, px + s * 2), -1, pz, Math.max(px, px + s * 2), 30, pz + 2, LY.char);
    B(Math.min(a, b) - 1, 31, z - 26, Math.max(a, b) + 3, 32, z + 10, LY.wood); for (let k = z - 24; k <= z + 8; k += 6) B(Math.min(a, b) - 1, 33, k, Math.max(a, b) + 3, 33, k + 1, LY.woodD);
    B(Math.min(a, b) + 3, 7, z - 16, Math.max(a, b) - 1, 16, z - 2, LY.wood); B(Math.min(a, b) + 3, 17, z - 16, Math.max(a, b) - 1, 17, z - 2, LY.woodD);
    B(Math.min(a, x + s * 34), 11, z - 10, Math.max(a, x + s * 34), 13, z - 8, LY.clay);
  }
  return { mouth: [x, 14, z + 20], top: [x, 104, z - 4], run: [x, 4, z + Math.round((22 + runTo) / 2)] };
}

/** a stepped heap of dark slag (or charcoal): flat tiers stepping in, a lighter band at each tier's lip */
export function heap(B: Bx, x: number, z: number, hw: number, hd: number, tiers: number, col: number, lip: number) {
  for (let i = 0; i < tiers; i++) {
    const a = hw - i * 3, b = hd - i * 3, y0 = i === 0 ? -1 : i * 3, y1 = i * 3 + 2; if (a < 2 || b < 2) break;
    B(x - a, y0, z - b, x + a, y1, z + b, col); B(x - a, y1, z - b, x + a, y1, z - b, lip); B(x - a, y1, z + b, x + a, y1, z + b, lip);
  }
}

/** a stretch of rammed-earth ward wall along local x (z0..z1 across), layers, a tiled coping where it still stands at H; drops = lower stretches */
export function earthWall(B: Bx, x0: number, x1: number, z0: number, z1: number, H: number, drops: Array<[number, number, number]> = []) {
  const cuts = new Set<number>([x0, x1 + 1]);
  for (const [a, b] of drops) { cuts.add(Math.max(x0, a)); cuts.add(Math.min(x1, b) + 1); }
  const xs = [...cuts].sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1] - 1, d = drops.find(([p, q]) => a >= p && b <= q), h = d ? d[2] : H;
    B(a, -1, z0, b, h, z1, LY.earth); B(a, -1, z0, b, 1, z1, LY.earthD);
    for (let y = 6; y < h; y += 6) { B(a, y, z0, b, y, z0, LY.earthD); B(a, y, z1, b, y, z1, LY.earthD); }
    B(a, Math.max(2, h - 3), z0, b, h, z0, LY.charL); B(a, Math.max(2, h - 3), z1, b, h, z1, LY.charL);
    if (h >= H) { B(a, h + 1, z0 - 1, b, h + 1, z1 + 1, LY.tileD); B(a, h + 2, z0, b, h + 2, z1, LY.tile); }
    else B(a, h, z0, b, h, z1, LY.earthL);
  }
}
