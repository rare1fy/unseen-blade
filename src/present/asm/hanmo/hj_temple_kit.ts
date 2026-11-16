// 黄巾残村 · 破庙的部件库（temple 代理）：汉代祠庙被太平道占作法坛。夯土台基、褪色的朱漆柱（十字截面读作圆柱）、
// 斗拱（栌斗 + 拱 + 三个小斗，全是平叠的方块）、汉式平直瓦顶（两三层平板退台，不起翘）、汉阙、碑、铜鼎、火盆、黄幡、符纸。
// 铁律：横平竖直的大块体，斜面一律几层宽台阶（每层 ≥ 4 格），花纹只画结构（石缝、夯土层、瓦垄、布边），没有逐格随机色。
// 所有部件在本地框里搭（k_village.loc：本地 x 横向，本地 z 朝正面，r = 转几个 90°），同一个部件能朝镜头也能朝战斗区。
import * as THREE from 'three';
import { M, type W } from '../../scenes/props';
import type { Ctx } from '../../scenes/stage';
import { loc, type Bx, type P3 } from '../../scenes/k_village';
import { onUpdate, scene } from '../../engine/world';
import { PALPHA, TILE } from '../../engine/particles';

/** 破庙调色：风化灰石、暗朱漆、焦木、夯土黄褐、汉瓦灰；黄巾黄是唯一的强调色。每种材料两三档（本体 / 暗 / 亮） */
export const HC = {
  stone: 0x8a8780, stoneD: 0x6c6a64, stoneL: 0xa4a19a, stoneDD: 0x4e4c48,
  slab: 0x7f7c75, slabB: 0x878480, slabC: 0x77746e, joint: 0x5c5a55, kerb: 0x66635d,
  red: 0x8e3b2c, redD: 0x6a2b21, redL: 0xa44c36, redF: 0x7c4a3a,
  char: 0x2e2724, charL: 0x463b34, ash: 0x5c5650,
  wood: 0x6a5039, woodD: 0x4a3828, woodL: 0x8a6c4c,
  earth: 0xa38c66, earthD: 0x8a7556, earthL: 0xb8a27c,
  ground: 0x7a6a4e, groundD: 0x6c5d44, groundL: 0x887858,
  tile: 0x4c4e55, tileD: 0x37393f, tileL: 0x60626a,
  yel: 0xd2a832, yelD: 0xa8821e, yelL: 0xe2c25a,
  ink: 0x9a2a1e, chalk: 0xd6d0c2,
  bronze: 0x5a6a4e, bronzeD: 0x3c4838, bronzeL: 0x7a8a62, gilt: 0xa8904a,
  iron: 0x34323a, ironL: 0x55535c,
  ember: 0xd8602a, flame: 0xff9a38, flameL: 0xffc864,
  water: 0x7a8c78, waterG: 0xb8c890,
  clay: 0x7a5238, clayL: 0x946648, clayD: 0x5a3a28,
  hide: 0xc2aa80, hideD: 0x9a8460, sack: 0xa89470, sackD: 0x86744f, grain: 0xc8b47a,
  bamboo: 0x8a8a4a, bambooD: 0x5e5e32,
};

/** the local frame of a piece at world (x, z) metres, front turned by r quarter turns (0 = +z, 1 = +x, 3 = −x) */
export const frame = (w: W, x: number, z: number, r = 0) => loc(w, M(x), M(z), r);
/** a group in a wing faces the battle floor; a group in the middle (s = 0) faces the camera */
export const faceOf = (s: number) => (s > 0 ? 3 : s < 0 ? 1 : 0);
/** square pieces at the back rows face the camera, everything else faces the battle floor */
export const orient = (p: { z: number; s: number }) => (p.z < -8.6 ? 0 : faceOf(p.s));
/** a mirrored box function: local x is flipped when m = −1 (a pair of towers built from one recipe) */
export const mir = (B: Bx, m: 1 | -1): Bx => (x0, y0, z0, x1, y1, z1, c, g) => B(m * x0, y0, z0, m * x1, y1, z1, c, g);

const ring = (B: Bx, a: number, c: number, b: number, e: number, y: number, col: number) => { B(a, y, c, b, y, c, col); B(a, y, e, b, y, e, col); B(a, y, c, a, y, e, col); B(b, y, c, b, y, e, col); };
/** a hollow block: four walls t cells thick and a full top layer (platforms are big; the inside is never seen) */
export function shell(B: Bx, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, side: number, top: number, t = 2) {
  B(x0, y0, z0, x1, y1 - 1, z0 + t - 1, side); B(x0, y0, z1 - t + 1, x1, y1 - 1, z1, side);
  B(x0, y0, z0, x0 + t - 1, y1 - 1, z1, side); B(x1 - t + 1, y0, z0, x1, y1 - 1, z1, side);
  B(x0, y1, z0, x1, y1, z1, top);
}

// ------------------------------------------------------------------ roofs
/**
 * A Han tiled roof, straight and heavy (no upturned corners): flat slabs stepping in, tiers = [inset, thickness]. The lowest `hip`
 * tiers step in on all four sides, the rest only front and back. Tile rows (筒瓦垄) run front to back as light lines every 4 cells on
 * each slab's top, the eave row is dark, and a ridge with its two ends raised one block sits on top. cut0 / cut1 = that x end is
 * broken off (no ridge end, a few charred rafter ends stick out of the cut).
 */
export function hanRoof(B: Bx, x0: number, x1: number, z0: number, z1: number, y: number, tiers: Array<[number, number]>, hip: number, o: { cut0?: boolean; cut1?: boolean; ridge?: boolean } = {}) {
  let ix = 0, iz = 0, ya = y;
  for (let i = 0; i < tiers.length; i++) {
    const [d, th] = tiers[i];
    if (i > 0) { iz += d; if (i < hip) ix += d; }
    const a = x0 + (o.cut0 ? 0 : ix), b = x1 - (o.cut1 ? 0 : ix), c = z0 + iz, e = z1 - iz; if (c + 2 > e) break;
    B(a, ya, c, b, ya + th - 1, e, HC.tile);
    for (let x = a + 2; x <= b - 1; x += 4) B(x, ya + th - 1, c, x, ya + th - 1, e, HC.tileL);
    if (i === 0) { B(a, ya, c, b, ya, c, HC.tileD); B(a, ya, e, b, ya, e, HC.tileD); if (!o.cut0) B(a, ya, c, a, ya, e, HC.tileD); if (!o.cut1) B(b, ya, c, b, ya, e, HC.tileD); }
    ya += th;
  }
  const a = x0 + (o.cut0 ? 0 : ix), b = x1 - (o.cut1 ? 0 : ix), cz = Math.round((z0 + z1) / 2);
  if (o.ridge !== false) {
    B(a + (o.cut0 ? 0 : 2), ya, cz - 2, b - (o.cut1 ? 0 : 2), ya + 2, cz + 2, HC.tileD);
    B(a + (o.cut0 ? 0 : 2), ya + 3, cz - 1, b - (o.cut1 ? 0 : 2), ya + 3, cz + 1, HC.tile);
    if (!o.cut0) B(a, ya, cz - 2, a + 3, ya + 5, cz + 2, HC.tileD);
    if (!o.cut1) B(b - 3, ya, cz - 2, b, ya + 5, cz + 2, HC.tileD);
  }
  // charred rafter ends standing out of a broken end
  for (const [cut, xe, out] of [[o.cut0, x0, -1], [o.cut1, x1, 1]] as const) if (cut) for (let k = 0, zz = z0 + 4; zz < z1 - 3; zz += 7, k++) B(xe, y + 1, zz, xe + out * (3 + (k % 2) * 4), y + 2, zz + 1, HC.char);
  return ya + 6;
}

// ------------------------------------------------------------------ columns and brackets
/**
 * A lacquered timber column on a stone base (柱础): a plus-section shaft (it reads round), dull red with a dark band at the foot.
 * broken: snapped at h with a charred end, one half of the section standing three cells higher (a break in one wide step).
 */
export function column(B: Bx, x: number, z: number, h: number, o: { broken?: boolean; char?: boolean } = {}) {
  B(x - 4, -1, z - 4, x + 4, 1, z + 4, HC.stoneD); B(x - 3, 2, z - 3, x + 3, 2, z + 3, HC.stone);
  const top = o.broken ? h - 3 : h, body = o.char ? HC.charL : HC.red;
  B(x - 2, 3, z - 1, x + 2, top, z + 1, body); B(x - 1, 3, z - 2, x + 1, top, z + 2, body);
  B(x - 2, 3, z - 1, x + 2, 5, z + 1, HC.redD); B(x - 1, 3, z - 2, x + 1, 5, z + 2, HC.redD);
  if (o.broken) {
    B(x - 2, top + 1, z - 1, x + 2, top + 2, z + 1, HC.char); B(x - 1, top + 1, z - 2, x + 1, top + 2, z + 2, HC.char);
    B(x - 2, top + 3, z - 1, x, top + 5, z + 1, HC.char);
  }
  return o.broken ? top + 5 : h;
}
/** 斗拱 as plain stacked blocks: a big bearing block (栌斗), an arm along local x (拱), three small blocks on the arm. Returns the top y. */
export function bracket(B: Bx, x: number, z: number, y: number, half = 8) {
  B(x - 3, y, z - 3, x + 3, y + 2, z + 3, HC.woodD);
  B(x - half, y + 3, z - 1, x + half, y + 4, z + 1, HC.wood);
  for (const a of [-half + 1, 0, half - 1]) B(x + a - 1, y + 5, z - 2, x + a + 1, y + 6, z + 2, HC.woodD);
  return y + 7;
}
/** a beam lying on the ground along local x (charred: dark with a lighter split end) */
export function beamDown(B: Bx, x0: number, x1: number, z: number, y = 0, col = HC.char) {
  B(x0, y, z - 2, x1, y + 2, z + 1, col); B(x0, y + 1, z - 1, x0, y + 1, z, HC.charL); B(x1, y + 1, z - 1, x1, y + 1, z, HC.charL);
}
/** a fallen column lying on the ground along local x, a stone base block left at one end */
export function columnDown(B: Bx, x0: number, x1: number, z: number) {
  B(x0, -1, z - 2, x1, 1, z + 2, HC.red); B(x0, 2, z - 1, x1, 2, z + 1, HC.red); B(x0, 0, z - 2, x1, 0, z + 2, HC.redD);
  B(x1 - 2, -1, z - 2, x1, 2, z + 2, HC.char);
}

// ------------------------------------------------------------------ heaps, steles, beasts
/** a heap of fallen roof tiles: two or three broad flat tiers, tile rows on the tiers, a few whole ridge tiles on top */
export function tileHeap(B: Bx, x: number, z: number, hw: number, hd: number, tiers = 3) {
  for (let i = 0; i < tiers; i++) {
    const a = hw - i * 4, b = hd - i * 3, y0 = i === 0 ? -1 : i * 3, y1 = i * 3 + 2; if (a < 2 || b < 2) break;
    B(x - a, y0, z - b, x + a, y1, z + b, i % 2 ? HC.tileD : HC.tile);
    for (let xx = x - a + 2; xx <= x + a - 1; xx += 4) B(xx, y1, z - b, xx, y1, z + b, HC.tileL);
  }
}
/**
 * A Han stele (碑) facing local +z: a low base (a block with a tortoise head looking forward), a slab with a darker inscription panel,
 * a two-tier 圭 top. state: 'whole', 'broken' (the top half lies flat in front, the stump has a one-step break), 'fallen' (the whole
 * slab lies flat beside its empty base). Returns nothing; built round (x, z).
 */
export function stele(B: Bx, x: number, z: number, state: 'whole' | 'broken' | 'fallen', o: { fu?: boolean; h?: number } = {}) {
  const H = o.h ?? 30;
  B(x - 8, -1, z - 5, x + 8, 3, z + 5, HC.stoneD); B(x - 7, 4, z - 4, x + 7, 4, z + 4, HC.stone);
  B(x - 3, -1, z + 6, x + 3, 3, z + 9, HC.stoneD); B(x - 2, 1, z + 10, x + 2, 3, z + 10, HC.stoneDD);
  const slab = (y0: number, y1: number) => { B(x - 6, y0, z - 1, x + 6, y1, z + 2, HC.stone); B(x - 4, Math.max(y0, 8), z + 3, x + 4, Math.min(y1 - 2, H - 2), z + 3, HC.stoneD); };
  if (state === 'whole') {
    slab(5, H); B(x - 5, H + 1, z - 1, x + 5, H + 3, z + 2, HC.stoneL); B(x - 3, H + 4, z - 1, x + 3, H + 5, z + 2, HC.stoneL);
    if (o.fu) { B(x - 2, 14, z + 4, x + 2, 22, z + 4, HC.yel); B(x, 15, z + 5, x, 21, z + 5, HC.ink); B(x - 1, 19, z + 5, x + 1, 19, z + 5, HC.ink); }
  } else if (state === 'broken') {
    const k = Math.round(H * 0.5);
    slab(5, k); B(x - 6, k + 1, z - 1, x - 1, k + 4, z + 2, HC.stone);
    // the top half flat on the ground in front: face up, the 圭 top toward local −x
    B(x - 6 - (H - k), -1, z + 12, x + 4 - (H - k), 1, z + 18, HC.stone); B(x - 4 - (H - k), 2, z + 13, x + 2 - (H - k), 2, z + 17, HC.stoneD);
  } else {
    B(x - 12, -1, z + 12, x + 18, 1, z + 23, HC.stone); B(x - 9, 2, z + 14, x + 14, 2, z + 21, HC.stoneD);
    B(x + 19, -1, z + 13, x + 21, 0, z + 22, HC.stoneL);
  }
}
/**
 * A stone guardian beast (辟邪) crouching on a plinth, facing local +z: a long body, raised chest and a square head, two front legs,
 * flat stepped wings on its flanks, a curled tail block. headless: the head lies on the ground beside the plinth. Top ≈ 22 cells.
 */
export function bixie(B: Bx, x: number, z: number, o: { headless?: boolean } = {}) {
  B(x - 8, -1, z - 12, x + 8, 3, z + 10, HC.stoneD); B(x - 7, 4, z - 11, x + 7, 4, z + 9, HC.stone);
  const S = HC.stone, L = HC.stoneL;
  B(x - 5, 5, z - 9, x + 5, 12, z + 4, S); B(x - 4, 13, z - 8, x + 4, 13, z + 2, L);
  B(x - 5, 5, z + 3, x + 5, 16, z + 8, S);
  for (const s of [-1, 1]) B(x + s * 3, 5, z + 8, x + s * 5, 9, z + 9, HC.stoneD);
  for (const s of [-1, 1]) { B(x + s * 6, 10, z - 6, x + s * 6, 14, z + 3, L); B(x + s * 6, 15, z - 4, x + s * 6, 16, z + 1, L); }
  B(x - 2, 11, z - 12, x + 2, 18, z - 10, S); B(x - 2, 19, z - 11, x + 2, 19, z - 9, L);
  const head = (hx: number, hy: number, hz: number) => {
    B(hx - 4, hy, hz - 3, hx + 4, hy + 5, hz + 4, S); B(hx - 4, hy + 6, hz - 3, hx + 4, hy + 6, hz + 2, L);
    B(hx - 3, hy + 1, hz + 5, hx + 3, hy + 2, hz + 5, HC.stoneDD); B(hx - 4, hy + 4, hz + 5, hx + 4, hy + 4, hz + 5, HC.stoneDD);
  };
  if (!o.headless) head(x, 16, z + 5);
  else { B(x - 4, 17, z + 3, x + 4, 17, z + 8, HC.stoneD); head(x + 13, -1, z + 2); }
}

// ------------------------------------------------------------------ cloth, fire, bronze
/** a hanging 幡 on local face z (cloth in the plane x0..x1 at z), from y1 down; the hem torn in three wide steps; a red talisman stroke */
export function banner(B: Bx, x0: number, x1: number, z: number, y1: number, len: number, o: { fu?: boolean; rod?: boolean; col?: number } = {}) {
  const col = o.col ?? HC.yel, w = x1 - x0 + 1, k = Math.max(2, Math.floor(w / 3)), y0 = y1 - len;
  B(x0, y0 + 3, z, x0 + k - 1, y1, z, col); B(x0 + k, y0, z, x1 - k, y1, z, col); B(x1 - k + 1, y0 + 5, z, x1, y1, z, col);
  B(x0, y1 - 2, z, x1, y1 - 2, z, HC.yelD);
  if (o.rod !== false) B(x0 - 2, y1 + 1, z, x1 + 2, y1 + 1, z, HC.woodD);
  if (o.fu) { const cx = Math.round((x0 + x1) / 2), t = y1 - 5, a = Math.min(3, Math.floor((x1 - x0) / 2) - 1); B(cx, y0 + 6, z, cx, t, z, HC.ink); for (const yy of [t - 2, t - 7, t - 12]) if (yy > y0 + 6) B(cx - a, yy, z, cx + a, yy, z, HC.ink); }
}
/** lift a box function by dy cells (a piece standing on a platform) */
export const up = (B: Bx, dy: number): Bx => (x0, y0, z0, x1, y1, z1, c, g) => B(x0, y0 + dy, z0, x1, y1 + dy, z1, c, g);
/** shift a box function by (dx, dz) cells in its own frame */
export const at = (B: Bx, dx: number, dz: number): Bx => (x0, y0, z0, x1, y1, z1, c, g) => B(x0 + dx, y0, z0 + dz, x1 + dx, y1, z1 + dz, c, g);

/**
 * 汉阙: one stone tower on a plinth facing local +z, built round local x = cx. m = which side its lower sub-tower (子阙) stands on
 * (+1 = local +x). A coursed shaft, a dark imitation-timber band with bracket blocks standing out on all four faces, a two-tier
 * straight tiled cap with a ridge; the sub-tower has its own smaller cap. broken: the outer half of the cap is gone (its tiles in a
 * heap in front), a crack runs down the front. panel: a framed relief panel on the front. Height ≈ 66 cells.
 */
export function que(B: Bx, cx: number, m: 1 | -1, o: { broken?: boolean; panel?: boolean } = {}) {
  const Q: Bx = (x0, y0, z0, x1, y1, z1, c, g) => B(cx + m * x0, y0, z0, cx + m * x1, y1, z1, c, g);
  Q(-15, -1, -10, 26, 3, 10, HC.stoneD); Q(-14, 4, -9, 25, 4, 9, HC.stone);
  Q(-11, 5, -7, 11, 46, 7, HC.stone);
  for (const y of [15, 25, 35]) Q(-11, y, -7, 11, y, 7, HC.stoneD);
  Q(12, 5, -6, 22, 32, 6, HC.stone); for (const y of [15, 25]) Q(12, y, -6, 22, y, 6, HC.stoneD);
  Q(12, 33, -7, 23, 34, 7, HC.stoneDD);
  hanRoof(Q, 10, 27, -10, 10, 35, [[0, 2], [4, 2]], 2);
  Q(-12, 47, -8, 12, 48, 8, HC.stoneDD); Q(-10, 49, -6, 10, 51, 6, HC.stoneDD);
  for (const a of [-9, -3, 3, 9]) Q(a - 1, 49, -9, a + 1, 51, 9, HC.stoneD);
  for (const b of [-4, 4]) Q(-12, 49, b - 1, 12, 51, b + 1, HC.stoneD);
  Q(-14, 52, -10, 14, 53, 10, HC.stone);
  const top = hanRoof(Q, -18, 18, -14, 14, 54, [[0, 3], [5, 3]], 2);
  if (o.panel) { Q(-7, 18, 7, 7, 33, 7, HC.stoneD); Q(-5, 20, 7, 5, 31, 7, HC.stone); }
  if (o.broken) { Q(1, 54, -15, 20, top + 2, 15, null); Q(3, 30, 7, 4, 46, 7, HC.stoneDD); tileHeap(Q, 17, 16, 8, 4, 2); }
  return top;
}
/** a banner pole: stone pile at the foot, a pole, a cross arm; the 幡 hangs from the arm on its front (local +z). Returns nothing. */
export function bannerPole(B: Bx, x: number, z: number, H: number, o: { fu?: boolean; len?: number; wd?: number } = {}) {
  B(x - 3, -1, z - 3, x + 3, 1, z + 3, HC.stoneD); B(x - 2, 2, z - 2, x + 2, 2, z + 2, HC.stone);
  B(x - 1, 3, z - 1, x + 1, H, z + 1, HC.woodD);
  const wd = o.wd ?? 4;
  B(x - wd - 2, H - 3, z + 2, x + wd + 2, H - 2, z + 2, HC.wood); B(x, H - 3, z, x, H - 2, z + 1, HC.wood);
  banner(B, x - wd, x + wd, z + 3, H - 3, o.len ?? Math.round(H * 0.55), { fu: o.fu, rod: false });
  B(x - 2, H + 1, z - 2, x + 2, H + 1, z + 2, HC.wood);
}
/** a rope of talisman strips along local x at height y on face z: two-cell paper strips every 4 cells, alternating lengths, a red mark */
export function fuRope(B: Bx, x0: number, x1: number, z: number, y: number) {
  B(x0, y, z, x1, y, z, HC.woodL);
  for (let x = x0 + 2, k = 0; x + 1 <= x1 - 1; x += 4, k++) { const L = k % 2 ? 6 : 4; B(x, y - L, z, x + 1, y - 1, z, HC.yelL); B(x, y - 3, z, x + 1, y - 3, z, HC.ink); }
}
/** static fire in a bowl (glow cells): an ember bed and a plus-shaped flame of two tiers. Returns the flame point (local cells). */
export function fireBed(B: Bx, x: number, y: number, z: number, r: number) {
  B(x - r, y, z - r, x + r, y, z + r, HC.ember, 1);
  const a = Math.max(1, r - 2), b = Math.max(1, r - 3);
  B(x - a, y + 1, z - 1, x + a, y + 3, z + 1, HC.flame, 1); B(x - 1, y + 1, z - a, x + 1, y + 3, z + a, HC.flame, 1);
  B(x - b, y + 4, z, x + b, y + 5, z, HC.flameL, 1); B(x, y + 4, z - b, x, y + 5, z + b, HC.flameL, 1);
  return [x, y + 3, z] as const;
}
/** an iron fire bowl on a squat stone post. lit = embers and flame. Returns the flame point in local cells. */
export function fireBowl(B: Bx, x: number, z: number, lit: boolean, post = 8) {
  B(x - 4, -1, z - 4, x + 4, 1, z + 4, HC.stoneD); B(x - 3, 2, z - 3, x + 3, post, z + 3, HC.stone);
  const y = post + 1;
  B(x - 6, y, z - 6, x + 6, y + 3, z + 6, HC.iron); B(x - 5, y + 2, z - 5, x + 5, y + 3, z + 5, null);
  B(x - 7, y + 3, z - 7, x + 7, y + 3, z - 7, HC.ironL); B(x - 7, y + 3, z + 7, x + 7, y + 3, z + 7, HC.ironL); B(x - 7, y + 3, z - 7, x - 7, y + 3, z + 7, HC.ironL); B(x + 7, y + 3, z - 7, x + 7, y + 3, z + 7, HC.ironL);
  if (lit) { const f = fireBed(B, x, y + 2, z, 5); return [f[0], f[1], f[2]] as [number, number, number]; }
  B(x - 5, y + 2, z - 5, x + 5, y + 2, z + 5, HC.ash); B(x - 2, y + 3, z - 1, x + 3, y + 3, z, HC.char);
  return [x, y + 3, z] as [number, number, number];
}
/**
 * A bronze 鼎: three thick legs (two in front, one behind), a body octagonal in plan (two crossed boxes), a dark band of block
 * motifs, a lip, two upright loop ears. lit = an ember bed and flames inside. s = scale step (0 normal, 1 big). Returns the fire
 * point (local cells) and the top.
 */
export function ding(B: Bx, x: number, z: number, y0: number, o: { lit: boolean; big?: boolean }) {
  const k = o.big ? 1.45 : 1, R = Math.round(15 * k), r = Math.round(11 * k), L = Math.round(10 * k), H = Math.round(16 * k);
  const legs: Array<[number, number]> = [[-Math.round(R * 0.6), Math.round(R * 0.45)], [Math.round(R * 0.6), Math.round(R * 0.45)], [0, -Math.round(R * 0.6)]];
  const lw = o.big ? 3 : 2;
  for (const [a, b] of legs) { B(x + a - lw, y0, z + b - lw, x + a + lw, y0 + L, z + b + lw, HC.bronzeD); B(x + a - lw - 1, y0, z + b - lw - 1, x + a + lw + 1, y0 + 1, z + b + lw + 1, HC.bronzeD); }
  const yb = y0 + L + 1, yt = yb + H;
  B(x - R, yb + 2, z - r, x + R, yt, z + r, HC.bronze); B(x - r, yb + 2, z - R, x + r, yt, z + R, HC.bronze);
  B(x - R + 2, yb, z - r + 2, x + R - 2, yb + 1, z + r - 2, HC.bronzeD); B(x - r + 2, yb, z - R + 2, x + r - 2, yb + 1, z + R - 2, HC.bronzeD);
  // the motif band: dark band, light blocks in it every 6 cells (cast decoration as structure)
  const by = yt - Math.round(5 * k);
  B(x - R, by, z - r, x + R, by + 2, z + r, HC.bronzeD); B(x - r, by, z - R, x + r, by + 2, z + R, HC.bronzeD);
  for (let a = -r + 2; a + 1 <= r - 2; a += 6) { B(x + a, by + 1, z + R, x + a + 1, by + 1, z + R, HC.gilt); B(x + a, by + 1, z - R, x + a + 1, by + 1, z - R, HC.gilt); }
  for (let b = -r + 2; b + 1 <= r - 2; b += 6) { B(x + R, by + 1, z + b, x + R, by + 1, z + b + 1, HC.gilt); B(x - R, by + 1, z + b, x - R, by + 1, z + b + 1, HC.gilt); }
  // the lip and the hollow
  B(x - R - 1, yt + 1, z - r, x + R + 1, yt + 1, z + r, HC.bronzeL); B(x - r, yt + 1, z - R - 1, x + r, yt + 1, z + R + 1, HC.bronzeL);
  B(x - R + 2, yt - 1, z - r + 2, x + R - 2, yt + 1, z + r - 2, null); B(x - r + 2, yt - 1, z - R + 2, x + r - 2, yt + 1, z + R - 2, null);
  B(x - R + 2, yt - 2, z - r + 2, x + R - 2, yt - 2, z + r - 2, HC.char); B(x - r + 2, yt - 2, z - R + 2, x + r - 2, yt - 2, z + R - 2, HC.char);
  // the ears: upright loops on the lip at ±x
  const eh = Math.round(8 * k), ex = R - 1;
  for (const s of [-1, 1]) { B(x + s * ex - 1, yt + 2, z - 3, x + s * ex + 1, yt + eh, z + 3, HC.bronzeL); B(x + s * ex - 1, yt + 3, z - 1, x + s * ex + 1, yt + eh - 2, z + 1, null); }
  let fire: [number, number, number] = [x, yt, z];
  if (o.lit) { const f = fireBed(B, x, yt - 1, z, r - 3); fire = [f[0], f[1], f[2]]; }
  return { fire, top: yt + eh };
}

// ------------------------------------------------------------------ the 甲子 chalk on a wall
// 「岁在甲子」：黄巾起事前，用白土在京城寺门和州郡官府上写「甲子」二字（《后汉书·皇甫嵩传》）。两字从右往左读，笔画两格宽。
const GLYPH: Record<string, string[]> = {
  jia: ['#####', '#.#.#', '#####', '#.#.#', '#####', '..#..', '..#..', '..#..'],
  zi: ['#####', '....#', '...#.', '..#..', '#####', '..#..', '..#..', '.##..'],
};
/** chalk 甲子 on the face z of a wall (local frame, never a mirrored one), centred on x, top row at y; u = cells per stroke unit.
 *  Side by side 甲 is on the left (read left to right, as players read today); vertical = 甲 above 子 (read top down). */
export function jiazi(B: Bx, x: number, y: number, z: number, u = 2, vertical = false, col = HC.chalk) {
  const put = (g: string[], ox: number, oy: number) => g.forEach((row, i) => { for (let j = 0; j < row.length; j++) if (row[j] === '#') B(ox + j * u, oy - (i + 1) * u + 1, z, ox + j * u + u - 1, oy - i * u, z, col); });
  if (vertical) { const ox = x - Math.floor(5 * u / 2); put(GLYPH.jia, ox, y); put(GLYPH.zi, ox, y - 10 * u); }
  else { put(GLYPH.jia, x - 6 * u, y); put(GLYPH.zi, x + u, y); }
}

// ------------------------------------------------------------------ smoke (a slow column of puffs while the stage is up)
export function smoke(c: Ctx, at: P3, o: { rate?: number; col?: number } = {}) {
  const mk = new THREE.Object3D(), col = new THREE.Color(o.col ?? 0x8a847c), rate = o.rate ?? 2.2;
  mk.addEventListener('added', () => {
    let acc = 0;
    onUpdate((_dt, rdt) => {
      let root: THREE.Object3D = mk; while (root.parent) root = root.parent;
      if (root !== scene || !PALPHA) return;
      acc += Math.min(rdt, 0.1) * rate;
      while (acc >= 1) {
        acc -= 1;
        PALPHA.emit({ p: new THREE.Vector3(at[0] + (Math.random() - 0.5) * 0.25, at[1], at[2] + (Math.random() - 0.5) * 0.25), v: new THREE.Vector3(0.08 + Math.random() * 0.1, 0.4 + Math.random() * 0.2, (Math.random() - 0.5) * 0.08),
          s0: 0.24, s1: 0.9, life: 3.6 + Math.random() * 2, c0: col, alpha: 0.28, tile: TILE.smoke, fadeIn: 0.5, spin: (Math.random() - 0.5) * 0.5 });
      }
    });
  });
  c.add(mk);
}
void ring;
