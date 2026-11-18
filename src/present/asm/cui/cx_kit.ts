// 崔府场景共用的体素部件。按实物划分材质，大面用整块颜色。
import type { Ctx } from '../../scenes/stage';
import { CELL } from '../../bestiary/kit';
import { AREA, M, type W } from '../../scenes/props';
import { loc, locM, type Bx, type P3 } from '../../scenes/k_village';

export const CX = {
  brickD: 0x4c4e54, plaster: 0xdcd8cc, plasterD: 0xbcb8ac, ink: 0x1c1a20, inkL: 0x2c2a30,
  tile: 0x34363c, tileD: 0x26282c, tileL: 0x4a4c54,
  red: 0x7a2420, redD: 0x581a18, wood: 0x4a3626, woodD: 0x34261c,
  stone: 0x8a8a8e, stoneD: 0x6c6c72, stoneL: 0xa4a4a8, bronze: 0x7a6a3a, bronzeD: 0x5a4c28,
  plum: 0x3a2a26, plumD: 0x261c18, blossom: 0xd84a5a, blossomL: 0xf08090, bamboo: 0x4a6a4a, bambooD: 0x34503a, bambooL: 0x6a8a5a,
  snow: 0xc8d0dc, steel: 0xd8dee8, steelD: 0x8a92a0, jade: 0x7a9a88,
};
export const frame = (w: W, x: number, z: number, r = 0) => loc(w, M(x), M(z), r);
export const wp = (x: number, z: number, r: number, lx: number, y: number, lz: number): P3 => locM(M(x), M(z), r, lx, y, lz);

export function paintFloor(c: Ctx, color: (X: number, Z: number, x: number, z: number) => number) {
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    c.w.set(X, -1, Z, color(X, Z, (X + 0.5) * CELL, (Z + 0.5) * CELL));
  }
}

/** 宽板连续铺同色，每一板带一段横接缝，棋盘状的明暗会把木板看成小块砖。 */
export function planks(across: number, along: number, body: number, joint: number) {
  const board = Math.floor(across / 8);
  return across - board * 8 === 7 || (along + board * 21) % 42 === 0 ? joint : body;
}

/** a black tile roof over local [x0..x1] × [z0..z1] from y: tiers stepping in front and back (Han: flat, heavy, no upturned eaves),
 *  one dark ridge carries across the roof. Returns the top y */
export function roofK(B: Bx, x0: number, x1: number, z0: number, z1: number, y: number, tiers = 2) {
  const D = z1 - z0 + 1; let top = y;
  for (let i = 0; i < tiers; i++) { const k = Math.round(D * i * 0.24), a = z0 + k, b = z1 - k, ya = y + i * 3, yb = ya + 2;
    B(x0, ya, a, x1, yb, b, CX.tile); B(x0, yb, a, x1, yb, b, CX.tileL); B(x0, ya, a, x1, ya, a, CX.tileD); B(x0, ya, b, x1, ya, b, CX.tileD);
    top = yb; }
  const zc = Math.round((z0 + z1) / 2); B(x0, top + 1, zc - 2, x1, top + 2, zc + 2, CX.ink); for (const e of [x0, x1 - 2]) B(e, top + 1, zc - 2, e + 2, top + 4, zc + 2, CX.ink);
  return top + 4;
}

/** a red column on a stone base (a cross-section that reads round: a square with the corners cut), its top under a bracket block */
export function column(B: Bx, x: number, z: number, H: number) {
  B(x - 3, 0, z - 3, x + 3, 2, z + 3, CX.stone); B(x - 3, 2, z - 3, x + 3, 2, z + 3, CX.stoneL);
  B(x - 2, 3, z - 1, x + 2, H, z + 1, CX.red); B(x - 1, 3, z - 2, x + 1, H, z + 2, CX.red); B(x + 2, 3, z - 1, x + 2, H, z + 1, CX.redD);
  B(x - 3, H + 1, z - 3, x + 3, H + 2, z + 3, CX.wood);
}

/** an old plum tree: a dark crooked trunk in stepped offsets, three branches out flat, red blossom in small clumps on the branch tips
 *  (whole 2-cell clumps, never single cells), snow on the branches */
export function plum(B: Bx, x: number, z: number, H: number, seed: number) {
  const s = seed % 2 ? 1 : -1;
  B(x - 2, 0, z - 2, x + 2, Math.round(H * 0.4), z + 2, CX.plum); B(x - 2 + s * 2, Math.round(H * 0.4), z - 2, x + 2 + s * 2, Math.round(H * 0.7), z + 2, CX.plum);
  B(x - 1 + s * 3, Math.round(H * 0.7), z - 1, x + 1 + s * 3, H, z + 1, CX.plumD);
  const tips: Array<[number, number, number]> = [];
  for (const [dx, dz, y, L] of [[1, 0, 0.5, 14], [-1, 0, 0.75, 12], [0, 1, 0.9, 10], [0, -1, 0.62, 9]] as const) {
    const yy = Math.round(H * y), bx = x + s * 2, ex = bx + dx * L, ez = z + dz * L;
    B(Math.min(bx, ex), yy, Math.min(z, ez), Math.max(bx, ex), yy + 1, Math.max(z, ez), CX.plum); B(Math.min(bx, ex), yy + 2, Math.min(z, ez), Math.max(bx, ex), yy + 2, Math.max(z, ez), CX.snow);
    tips.push([ex, yy, ez]);
  }
  // the blossom: a small cap of red over each branch tip, a lighter top (whole blocks resting on the tip, never loose points)
  for (const [tx, ty, tz] of tips) { B(tx - 1, ty + 1, tz - 1, tx + 1, ty + 2, tz + 1, CX.blossom); B(tx, ty + 3, tz - 1, tx + 1, ty + 3, tz, CX.blossomL); }
}
/** a stand of bamboo: a row of straight culms with nodes every 6 cells, leaf clumps at the tops in two greens, a dusting of snow */
export function bamboo(B: Bx, x0: number, x1: number, z: number, H: number, seed: number) {
  for (let x = x0, i = 0; x <= x1; x += 4, i++) {
    const h = H - ((i * 7 + seed) % 3) * 6, zz = z + ((i * 5 + seed) % 3) - 1;
    B(x, 0, zz, x + 1, h, zz + 1, CX.bamboo); for (let y = 6; y < h; y += 6) B(x, y, zz, x + 1, y, zz + 1, CX.bambooD);
    B(x - 3, h - 8, zz - 3, x + 4, h - 3, zz + 4, CX.bambooD); B(x - 2, h - 3, zz - 2, x + 3, h + 1, zz + 3, CX.bambooL); B(x - 2, h + 2, zz - 2, x + 3, h + 2, zz + 3, CX.snow);
  }
}

/** the garden wall with a roofed top (as the battle floor's, for the far ring): plaster on a brick foot, a two-tier black coping */
export function gardenWall(B: Bx, x0: number, x1: number, z: number, H: number) {
  B(x0, -1, z - 2, x1, 3, z + 2, CX.brickD); B(x0, 4, z - 2, x1, H, z + 2, CX.plaster); B(x0, 4, z - 2, x1, 4, z + 2, CX.plasterD);
  B(x0, H + 1, z - 4, x1, H + 1, z + 4, CX.tileD); B(x0, H + 2, z - 3, x1, H + 3, z + 3, CX.tile); B(x0, H + 4, z - 1, x1, H + 4, z + 1, CX.tileL);
}

/** a rack of the 文家刀 along local x: two black posts, two rails, ring-pommelled blades hanging point-down (bright steel, the pale wave
 *  line), a red cord tag on each; n blades, some places empty */
export function bladeRack(B: Bx, x0: number, x1: number, z: number, y0: number, n: number, seed: number) {
  B(x0, y0, z, x0 + 1, y0 + 30, z + 1, CX.ink); B(x1 - 1, y0, z, x1, y0 + 30, z + 1, CX.ink); B(x0, y0 + 27, z, x1, y0 + 28, z + 1, CX.inkL); B(x0, y0 + 8, z, x1, y0 + 9, z + 1, CX.inkL);
  const step = Math.max(3, Math.floor((x1 - x0 - 4) / n));
  for (let i = 0, x = x0 + 3; i < n && x < x1 - 2; i++, x += step) {
    if ((i * 7 + seed) % 5 === 4) continue;   // an empty place: a blade taken back
    // the ring pommel hung on the top rail (its top row against the rail), the grip, the guard, the blade point-down; the red cord on the ring
    B(x - 1, y0 + 24, z + 2, x + 1, y0 + 27, z + 2, 0xc8ccd4); B(x, y0 + 25, z + 2, x, y0 + 26, z + 2, null);
    B(x, y0 + 21, z + 2, x, y0 + 23, z + 2, 0x2a1e18); B(x - 1, y0 + 20, z + 2, x + 1, y0 + 20, z + 2, 0x6a6e78);
    B(x, y0 + 4, z + 2, x, y0 + 19, z + 2, CX.steel); if (i % 2) B(x, y0 + 10, z + 2, x, y0 + 12, z + 2, CX.steelD);
    B(x + 1, y0 + 22, z + 3, x + 1, y0 + 24, z + 3, CX.red);
  }
}
