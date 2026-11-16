// 忍里的道具（village 代理）：土仓、瞭望台、水车（会转）与水渠、菜畦与稻草人、篝火、木栅门、伪装岩门与地板暗门、米俵、跳桩、信鸽舍、
// 稻架（秋）、鲤鱼旗（春）、雪人（冬）。都在本地框里搭（front = 本地 +z），坐标用格，原点是组的锚点。
import { M, type W } from '../../scenes/props';
import type { Ctx } from '../../scenes/stage';
import { CELL } from '../../bestiary/kit';
import { loc, locM, type Bx, type P3 } from '../../scenes/k_village';
import { VC, thatch } from './village_kit';

const ring = (B: Bx, a: number, c: number, b: number, e: number, y: number, col: number) => { B(a, y, c, b, y, c, col); B(a, y, e, b, y, e, col); B(a, y, c, a, y, e, col); B(b, y, c, b, y, e, col); };
/** a plus-section post (round-ish timber) */
const pole = (B: Bx, x: number, z: number, y0: number, y1: number, col: number) => { B(x - 1, y0, z, x + 1, y1, z, col); B(x, y0, z - 1, x, y1, z + 1, col); };

// ------------------------------------------------------------------ 土仓 storehouse
/** charred-board wainscot, white plaster, a heavy framed door with iron bands, a barred window, the family mark, a hipped thatch */
export function kura(c: Ctx, x: number, z: number, r: number) {
  const B = loc(c.w, M(x), M(z), r), hw = 15, hd = 12, H = 33;
  B(-hw - 1, -1, -hd - 1, hw + 1, 2, hd + 1, VC.stoneD); B(-hw - 1, 3, -hd - 1, hw + 1, 3, hd + 1, VC.stoneL);
  B(-hw, 4, -hd, hw, 13, hd, VC.black);
  for (let a = -hw + 5; a < hw - 2; a += 6) { B(a, 4, hd, a, 13, hd, VC.dark); B(a, 4, -hd, a, 13, -hd, VC.dark); }
  for (let b = -hd + 5; b < hd - 2; b += 6) { B(-hw, 4, b, -hw, 13, b, VC.dark); B(hw, 4, b, hw, 13, b, VC.dark); }
  B(-hw, 14, -hd, hw, 14, hd, VC.woodD); B(-hw, 15, -hd, hw, H, hd, VC.white);
  // corner posts standing proud, a dark band under the eave
  for (const a of [-hw - 1, hw]) for (const b of [-hd - 1, hd]) B(a, 4, b, a + 1, H, b + 1, VC.post);
  ring(B, -hw - 1, -hd - 1, hw + 1, hd + 1, H + 1, VC.woodD); B(-hw, H + 1, -hd, hw, H + 1, hd, VC.woodD);
  // the door: a two-step frame proud of the wall, the door leaves with two iron bands and a lock plate, a stone step
  B(-7, 4, hd + 1, 7, 25, hd + 1, VC.woodD); B(-8, 26, hd + 1, 8, 27, hd + 2, VC.post);
  B(-5, 4, hd + 2, 5, 23, hd + 2, VC.wood); B(0, 4, hd + 2, 0, 23, hd + 2, VC.woodD);
  B(-5, 9, hd + 2, 5, 9, hd + 2, VC.iron); B(-5, 18, hd + 2, 5, 18, hd + 2, VC.iron); B(-1, 12, hd + 3, 1, 14, hd + 3, VC.ironL);
  B(-6, -1, hd + 2, 6, 0, hd + 5, VC.stone);
  // the family mark on the plaster above the door (a square ring with a dot), a barred window on one side
  ring(B, -3, hd + 1, 3, hd + 1, 29, VC.black); B(-3, 29, hd + 1, 3, 32, hd + 1, VC.black); B(-2, 30, hd + 1, 2, 31, hd + 1, VC.white); B(0, 30, hd + 1, 0, 31, hd + 1, VC.black);
  B(hw, 22, -4, hw, 28, 4, VC.dark); for (const b of [-2, 1]) B(hw + 1, 22, b, hw + 1, 28, b, VC.ironL); B(hw + 1, 29, -5, hw + 2, 30, 5, VC.white);
  thatch(B, -hw - 7, hw + 7, -hd - 7, hd + 7, H + 2, [[0, 6], [7, 6], [6, 6]], 3, { vent: false });
}

// ------------------------------------------------------------------ 瞭望台 watchtower
/** four posts on stone footings tied by through-rails, a boarded lookout platform, a hipped thatch cap, a ladder at the front, an alarm
 *  bell and a lookout lamp under the eave. Returns the lamp point (world metres). */
export function yagura(c: Ctx, x: number, z: number, r: number) {
  const X = M(x), Z = M(z), B = loc(c.w, X, Z, r), P = 11, F = 46;
  for (const a of [-P, P]) for (const b of [-P, P]) { B(a - 3, -1, b - 3, a + 3, 1, b + 3, VC.stoneD); B(a - 1, 2, b - 1, a + 1, F + 20, b + 1, VC.post); }
  for (const y of [14, 31]) { for (const b of [-P, P]) B(-P - 3, y, b, P + 3, y + 1, b, VC.woodD); for (const a of [-P, P]) B(a, y, -P - 3, a, y + 1, P + 3, VC.woodD); }
  B(-P - 4, F, -P - 4, P + 4, F + 1, P + 4, VC.wood); ring(B, -P - 4, -P - 4, P + 4, P + 4, F, VC.woodD);
  // the parapet: boards on four sides, seams every 5, a top rail
  for (const [a, b, e, f] of [[-P - 4, P + 4, P + 4, P + 4], [-P - 4, -P - 4, P + 4, -P - 4], [-P - 4, -P - 4, -P - 4, P + 4], [P + 4, -P - 4, P + 4, P + 4]]) B(a, F + 2, b, e, F + 8, f, VC.woodL);
  for (let u = -P; u <= P; u += 5) { B(u, F + 2, P + 4, u, F + 8, P + 4, VC.wood); B(-P - 4, F + 2, u, -P - 4, F + 8, u, VC.wood); B(P + 4, F + 2, u, P + 4, F + 8, u, VC.wood); }
  ring(B, -P - 5, -P - 5, P + 5, P + 5, F + 9, VC.woodD);
  ring(B, -P - 2, -P - 2, P + 2, P + 2, F + 20, VC.post);
  thatch(B, -P - 8, P + 8, -P - 8, P + 8, F + 21, [[0, 5], [6, 5], [5, 5]], 3, { vent: false });
  // the ladder up the front, through a gap in the parapet
  B(-3, F + 2, P + 4, 3, F + 8, P + 4, null);
  for (const a of [-4, 4]) B(a, -1, P + 6, a, F + 9, P + 6, VC.wood);
  for (let y = 4; y <= F; y += 6) B(-3, y, P + 6, 3, y, P + 6, VC.woodL);
  // the alarm bell under the eave (hung from the head ring) and the lamp beside it
  B(-6, F + 17, P + 2, -6, F + 19, P + 2, VC.black); B(-8, F + 13, P, -4, F + 16, P + 4, 0x4a6a5e); B(-7, F + 12, P + 1, -5, F + 12, P + 3, 0x34564c);
  B(6, F + 18, P + 2, 6, F + 19, P + 2, VC.black); B(4, F + 12, P, 8, F + 17, P + 4, VC.paperG, 1); B(4, F + 11, P, 8, F + 11, P + 4, VC.black); B(4, F + 18, P, 8, F + 18, P + 4, VC.black);
  return locM(X, Z, r, 6, F + 14, P + 6);
}

// ------------------------------------------------------------------ 水车 water wheel (a separate mesh that turns)
/**
 * A wheel of radius R cells (a rim as three stepped rects, never a pixel circle), a cross of spokes, a hub, and paddles standing out of the
 * flat rim runs. Built in its own little voxel world and turned about its axle while the stage is up. at = axle centre (world metres),
 * axis = the world axis of the axle, t = half thickness in cells.
 */
export function wheel(c: Ctx, at: P3, axis: 'x' | 'z', R: number, t: number) {
  // static on purpose: turned to any angle but 0° / 90° its stepped rim reads as a staircase (the user's 「梯」), so the wheel stands
  // square to the view and the motion is in the water pouring onto it and the spray at its foot
  const w = c.w, CX = Math.floor(at[0] / CELL), CY = Math.floor(at[1] / CELL), CZ = Math.floor(at[2] / CELL);
  const q = Math.round(R * 0.42), m = Math.round(R * 0.76), rects: Array<[number, number]> = [[R, q], [m, m], [q, R]];
  const inside = (a: number, b: number, sh: number) => rects.some(([p, s]) => Math.abs(a) <= p - sh && Math.abs(b) <= s - sh);
  const put = (a: number, b: number, k: number, col: number) => { if (axis === 'z') w.set(CX + a, CY + b, CZ + k, col); else w.set(CX + k, CY + b, CZ + a, col); };
  for (let a = -R - 3; a <= R + 3; a++) for (let b = -R - 3; b <= R + 3; b++) {
    let col: number | null = null;
    if (inside(a, b, 0) && !inside(a, b, 3)) col = VC.woodD;
    else if (inside(a, b, 3) && (Math.abs(a) <= 1 || Math.abs(b) <= 1)) col = VC.wood;
    else if (!inside(a, b, 0)) {
      // paddles: three on each flat rim run, standing 3 cells out
      const pa = (u: number, len: number) => [-len + 2, 0, len - 2].some(p => Math.abs(u - p) <= 1);
      if ((Math.abs(b) > R && Math.abs(b) <= R + 3 && Math.abs(a) <= q && pa(a, q)) || (Math.abs(a) > R && Math.abs(a) <= R + 3 && Math.abs(b) <= q && pa(b, q))) col = VC.woodL;
    }
    if (Math.abs(a) <= 2 && Math.abs(b) <= 2) col = VC.iron;
    if (col == null || CY + b < 0) continue;
    for (let k = -t; k <= t; k++) put(a, b, k, col);
  }
  for (let k = -t - 1; k <= t + 1; k++) put(0, 0, k, VC.ironL);
}
/** water pouring from (X, Y0, Z) straight down to Y1 (a 3×2 column in two blues) and a foam band where it lands */
export function spill(w: W, X: number, Y0: number, Y1: number, Z: number, alongX = true) {
  if (alongX) w.box(X - 1, Y1, Z, X + 1, Y0, Z + 1, 0x6aaaa6).box(X, Y1, Z, X, Y0, Z + 1, 0x9ad0c8);
  else w.box(X, Y1, Z - 1, X + 1, Y0, Z + 1, 0x6aaaa6).box(X, Y1, Z, X + 1, Y0, Z, 0x9ad0c8);
}
/** a stone-lined water channel along local x from a0 to a1 at local z b0..b1: the floor cells taken out, a dark bed, stone kerbs flush with
 *  the ground and a one-cell coping on both banks; the water surface is a plane (c.water) */
export function channel(c: Ctx, X: number, Z: number, r: number, a0: number, a1: number, b0: number, b1: number) {
  const B = loc(c.w, X, Z, r);
  B(a0, -1, b0, a1, -1, b1, null); B(a0, -2, b0, a1, -2, b1, 0x2a3a34);
  for (const [k0, k1] of [[b0 - 2, b0 - 1], [b1 + 1, b1 + 2]]) { B(a0, -2, k0, a1, -1, k1, VC.stoneD); B(a0, 0, k0, a1, 0, k1, VC.stone); }
  for (let a = a0 + 6; a < a1; a += 12) for (const k of [b0 - 2, b1 + 1]) B(a, 0, k, a, 0, k + 1, VC.stoneD);
  const p = locM(X, Z, r, a0, 0, b0), q = locM(X, Z, r, a1 + 1, 0, b1 + 1);
  c.water(Math.min(p[0], q[0]) - 0.5 * CELL, Math.min(p[2], q[2]) - 0.5 * CELL, Math.max(p[0], q[0]) - 0.5 * CELL, Math.max(p[2], q[2]) - 0.5 * CELL, VC.water);
}
/** 水渠与小水车：a channel the length of the slot, an overshot wheel in it fed by a raised flume on trestles, a plank bridge, a bucket */
export function suiro(c: Ctx, x: number, z: number, r: number, L = 30) {
  const X = M(x), Z = M(z), B = loc(c.w, X, Z, r), R = 15, wx = 12, cy = R - 4;
  channel(c, X, Z, r, -L, L, -4, 2);
  // the axle posts either side of the wheel, the axle between them (cells; the wheel itself is a turning mesh)
  for (const k of [-8, 6]) { B(wx - 2, -1, k, wx + 2, 1, k + 1, VC.stoneD); B(wx - 1, 2, k, wx + 1, cy + 3, k + 1, VC.post); }
  B(wx - 1, cy - 1, -8, wx + 1, cy + 1, 7, VC.iron);
  const ax = locM(X, Z, r, wx, cy, -1);
  wheel(c, [ax[0], ax[1], ax[2]], r === 1 || r === 3 ? 'x' : 'z', R, 2);
  // the flume: a trough on trestles from the back end to just over the wheel, water running in it
  const fy = cy + R + 3;
  for (const a of [-L + 2, -L + 16, -4]) { for (const k of [-5, 3]) B(a, -1, k, a + 1, fy - 1, k, VC.post); B(a, fy - 6, -5, a + 1, fy - 5, 3, VC.woodD); }
  B(-L, fy, -5, wx - 4, fy, 3, VC.woodD); B(-L, fy + 1, -5, wx - 4, fy + 3, -5, VC.wood); B(-L, fy + 1, 3, wx - 4, fy + 3, 3, VC.wood);
  B(-L, fy + 1, -4, wx - 4, fy + 2, 2, 0x5a9a96); B(-L, fy + 2, -2, wx - 4, fy + 2, 0, 0x8ac0b8);
  B(wx - 5, cy + R + 1, -3, wx - 4, fy, 1, 0x8ac0b8); B(wx - 6, cy + R + 1, -2, wx - 6, fy - 1, 0, 0x6aaaa6);
  // a plank bridge over the channel and a wooden bucket on the near bank
  B(-L + 8, 0, -7, -L + 13, 1, 5, VC.woodL); B(-L + 8, 1, -7, -L + 13, 1, -7, VC.woodD); B(-L + 8, 1, 5, -L + 13, 1, 5, VC.woodD);
  B(-14, -1, 7, -10, 4, 11, VC.wood); B(-14, 2, 7, -10, 2, 11, VC.iron); B(-13, 4, 8, -11, 4, 10, 0x5a9a96);
}

// ------------------------------------------------------------------ 菜畦 vegetable beds and the scarecrow
const CROP = {
  spring: (B: Bx, a: number, b: number) => { B(a, 0, b, a + 1, 2, b, VC.leafL); B(a, 2, b - 1, a + 1, 2, b + 1, VC.leafL); },
  summer: (B: Bx, a: number, b: number) => { B(a - 1, 1, b - 1, a + 1, 2, b + 1, VC.leaf); B(a - 1, 3, b, a + 1, 4, b, VC.leafL); B(a, 3, b - 1, a, 4, b + 1, VC.leafL); },
  autumn: (B: Bx, a: number, b: number, k: number) => { if (k & 1) { B(a - 1, 1, b - 1, a + 1, 2, b + 1, VC.kaki); B(a - 2, 1, b, a + 2, 1, b, VC.kakiD); B(a, 3, b, a, 3, b, VC.leaf); } else { B(a - 1, 1, b - 1, a + 1, 2, b + 1, 0x6a7a34); B(a, 3, b - 1, a, 3, b + 1, 0x8a9a44); } },
  winter: (B: Bx, a: number, b: number) => { B(a - 1, 1, b - 2, a + 1, 1, b + 2, VC.strawD); },
};
export function beds(c: Ctx, B: Bx, a0: number, a1: number, b0: number, b1: number, season: keyof typeof CROP) {
  // ridges run along local z: 6 cells of raised soil, a 4-cell furrow; a board edge round the plot
  for (let a = a0; a <= a1; a++) { const k = Math.floor((a - a0) / 10), ridge = (a - a0) % 10 < 6; B(a, -1, b0, a, -1, b1, ridge ? VC.soilL : VC.soil); if (ridge) B(a, 0, b0 + 1, a, 0, b1 - 1, VC.soil); void k; }
  ring(B, a0 - 1, b0 - 1, a1 + 1, b1 + 1, -1, VC.woodD);
  for (let a = a0 + 2, k = 0; a + 3 <= a1; a += 10, k++) for (let b = b0 + 3, j = 0; b <= b1 - 3; b += 6, j++) CROP[season](B, a + 1, b, k + j);
}
export function kakashi(B: Bx, a: number, b: number) {
  B(a, -1, b, a, 23, b, VC.post);
  B(a - 8, 17, b, a + 8, 17, b, VC.woodD); B(a - 9, 15, b, a - 9, 17, b, VC.white); B(a + 9, 15, b, a + 9, 17, b, VC.white);
  B(a - 5, 9, b - 3, a + 5, 13, b + 3, VC.strawD); B(a - 4, 14, b - 2, a + 4, 17, b + 2, VC.straw); B(a - 4, 13, b - 2, a + 4, 13, b + 2, VC.rope);
  B(a - 2, 18, b - 2, a + 2, 22, b + 2, VC.white); B(a - 1, 20, b + 3, a - 1, 20, b + 3, VC.black); B(a + 1, 20, b + 3, a + 1, 20, b + 3, VC.black); B(a - 1, 19, b + 3, a + 1, 19, b + 3, VC.black);
  B(a - 5, 23, b - 5, a + 5, 23, b + 5, VC.straw); B(a - 3, 24, b - 3, a + 3, 24, b + 3, VC.strawD); B(a - 1, 25, b - 1, a + 1, 25, b + 1, VC.straw);
}

// ------------------------------------------------------------------ 篝火 campfire with the cooking frame
/** returns the flame (world metres) */
export function takibi(c: Ctx, x: number, z: number, r: number, lit: boolean, season: string) {
  const X = M(x), Z = M(z), B = loc(c.w, X, Z, r);
  // the pit: ash, a square ring of big stones with the corners left open
  B(-6, -1, -6, 6, -1, 6, 0x3a3230);
  for (const [a, b] of [[-8, -3], [-8, 3], [8, -3], [8, 3], [-3, -8], [3, -8], [-3, 8], [3, 8]]) B(a - 2, -1, b - 2, a + 2, 1, b + 2, (a + b) & 2 ? VC.stoneD : VC.stone);
  B(-5, 0, -1, 5, 1, 1, VC.bark); B(-1, 2, -5, 1, 3, 5, VC.bark); B(-5, 0, -1, -5, 1, 1, VC.logEnd); B(5, 0, -1, 5, 1, 1, VC.logEnd);
  if (lit) { B(-3, 0, -3, 3, 0, 3, VC.ember, 1); B(-2, 4, -2, 2, 5, 2, 0xff8a30, 1); B(-1, 6, -1, 1, 7, 1, 0xffc060, 1); }
  // the cooking frame: two posts, a crossbar, a rope to a lidded iron pot over the fire
  for (const a of [-11, 11]) { B(a, -1, 0, a + (a < 0 ? -1 : 1), 17, 1, VC.post); }
  B(-12, 18, 0, 12, 19, 1, VC.woodD); B(0, 14, 0, 0, 17, 0, VC.rope);
  B(-3, 8, -3, 3, 12, 3, VC.iron); B(-4, 12, -4, 4, 12, 4, VC.ironL); B(-2, 13, -2, 2, 13, 2, VC.woodD);
  // log seats on two sides, a straw mat on the third
  for (const b of [-15, 15]) { B(-8, 0, b - 2, 8, 3, b + 2, VC.bark); B(-8, 1, b - 1, -8, 2, b + 1, VC.logEnd); B(8, 1, b - 1, 8, 2, b + 1, VC.logEnd); }
  B(14, -1, -7, 19, -1, 7, VC.straw); B(14, -1, -7, 19, -1, -7, VC.strawD); B(14, -1, 7, 19, -1, 7, VC.strawD);
  void season;
  return locM(X, Z, r, 0, 5, 0);
}

// ------------------------------------------------------------------ 木栅门 palisade gate
const stakes = (B: Bx, a0: number, a1: number, b: number, h0: number, step = 4) => {
  for (let a = a0, k = 0; a + 2 <= a1; a += step, k++) { const h = h0 + (k & 1 ? -3 : 0); B(a, -1, b - 1, a + 2, h, b + 1, k & 1 ? VC.woodD : VC.wood); B(a + 1, h + 1, b, a + 1, h + 3, b, VC.woodL); }
};
export function sakumon(c: Ctx, x: number, z: number, r: number, half = 25, g = 9, skip: Array<[number, number]> = []) {
  const B = loc(c.w, M(x), M(z), r);
  const run = (a0: number, a1: number) => { const cut = [a0, ...skip.flatMap(([u, v]) => (u > a0 && v < a1 ? [u, v] : [])), a1]; for (let i = 0; i + 1 < cut.length; i += 2) { stakes(B, cut[i], cut[i + 1], 0, 28); for (const y of [7, 20]) B(cut[i], y, 2, cut[i + 1], y, 2, VC.rope); } };
  run(-half, -g - 4); run(g + 3, half);
  // the gate: two square posts, a projecting lintel, a small two-tier thatch on top, the leaves swung open toward the front
  for (const a of [-g - 3, g]) B(a, -1, -2, a + 3, 36, 1, VC.post);
  B(-g - 7, 33, -2, g + 7, 35, 1, VC.woodD);
  thatch(B, -g - 9, g + 9, -6, 5, 37, [[0, 4], [4, 4]], 2, { vent: false });
  for (const s of [-1, 1]) { const a = s < 0 ? -g : g - 1; B(a, 0, 2, a, 26, 12, VC.wood); B(a, 6, 2, a, 6, 12, VC.woodD); B(a, 20, 2, a, 20, 12, VC.woodD); }
  B(-g, -1, -2, g - 1, -1, 1, VC.stone);
}

// ------------------------------------------------------------------ 伪装岩门 a boulder with a hidden door, and a trapdoor in the ground
/** returns the glow point of the crack (world metres) */
export function kakure(c: Ctx, x: number, z: number, r: number, moss: number, lit: boolean) {
  const X = M(x), Z = M(z), B = loc(c.w, X, Z, r);
  B(-14, -1, -11, 14, 9, 10, VC.stoneD); B(-11, 10, -9, 12, 16, 7, VC.stone); B(-7, 17, -6, 7, 20, 3, VC.stoneL); B(-6, 21, -5, 6, 21, 2, moss);
  B(-13, 10, -10, -12, 10, 6, moss);
  // the door: a recessed stone leaf, a lintel stone, and a thin warm gap down its right edge
  B(-4, 0, 10, 4, 7, 10, null); B(-4, 0, 9, 4, 7, 9, VC.stone); B(-5, 8, 10, 5, 9, 11, VC.stoneL); B(-2, 3, 10, -1, 4, 10, VC.stoneD);
  B(5, 0, 9, 5, 7, 10, lit ? VC.paperG : VC.dark, lit ? 1 : 0);
  B(-12, -1, 11, -8, 1, 14, VC.stoneD); B(9, -1, 11, 13, 0, 14, VC.stone);
  // the trapdoor: a board lid in a dark frame, one edge lifted a cell with light under it, an iron ring
  B(-8, -1, 15, 2, -1, 21, VC.dark); B(-7, 0, 16, 1, 0, 20, VC.wood); B(-7, 0, 18, 1, 0, 18, VC.woodD); B(-7, 1, 16, 1, 1, 16, VC.wood);
  B(-7, 0, 15, 1, 0, 15, lit ? VC.paperG : VC.dark, lit ? 1 : 0); B(-3, 1, 19, -2, 1, 19, VC.iron);
  return locM(X, Z, r, 6, 6, 12);
}

// ------------------------------------------------------------------ 米俵 rice bales
const bale = (B: Bx, a0: number, a1: number, y: number, b: number) => {
  B(a0, y, b - 3, a1, y + 7, b + 3, VC.straw); B(a0, y + 1, b - 4, a1, y + 6, b + 4, VC.straw);
  for (const a of [a0 + 2, (a0 + a1) >> 1, a1 - 2]) { B(a, y, b - 3, a, y + 7, b + 3, VC.rope); B(a, y + 1, b - 4, a, y + 6, b + 4, VC.rope); }
  for (const a of [a0, a1]) { B(a, y + 1, b - 3, a, y + 6, b + 3, VC.strawD); B(a, y + 3, b - 1, a, y + 4, b + 1, VC.rope); }
};
export function tawara(c: Ctx, x: number, z: number, r: number) {
  const B = loc(c.w, M(x), M(z), r);
  for (const b of [-9, 0, 9]) bale(B, -7, 6, -1, b);
  for (const b of [-5, 4]) bale(B, -6, 5, 7, b);
  B(9, -1, -6, 15, 4, 0, VC.wood); B(10, 4, -5, 14, 4, -1, VC.strawD); B(9, 2, -6, 15, 2, 0, VC.woodD);
  B(9, -1, 4, 14, 3, 9, 0xa08a62); B(10, 4, 5, 13, 5, 8, 0xa08a62); B(11, 6, 6, 12, 6, 7, VC.rope);
}

// ------------------------------------------------------------------ 跳桩 jumping posts on a sand patch
export function tobi(c: Ctx, x: number, z: number, r: number) {
  const B = loc(c.w, M(x), M(z), r), H = [[6, 9, 7], [11, 14, 12], [16, 19, 17]];
  for (let a = -18; a <= 18; a++) for (let b = -18; b <= 18; b++) B(a, -1, b, a, -1, b, Math.max(Math.abs(a), Math.abs(b)) > 16 ? VC.kerb : VC.mudL);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const a = -12 + j * 12, b = 12 - i * 12, h = H[i][j];
    B(a - 2, -1, b - 1, a + 2, h - 1, b + 1, VC.wood); B(a - 1, -1, b - 2, a + 1, h - 1, b + 2, VC.wood); B(a - 1, h, b - 1, a + 1, h, b + 1, VC.logEnd);
    B(a - 2, 2, b - 1, a + 2, 2, b + 1, VC.woodD);
  }
}

// ------------------------------------------------------------------ 信鸽舍 pigeon loft on a post
export function hato(c: Ctx, x: number, z: number, r: number) {
  const B = loc(c.w, M(x), M(z), r), Y = 38;
  B(-4, -1, -4, 4, 1, 4, VC.stoneD); B(-1, 2, -1, 1, Y, 1, VC.post);
  B(-4, Y - 6, 0, 4, Y - 5, 0, VC.woodD); B(-1, Y - 6, -4, 1, Y - 5, 4, VC.woodD);
  B(-8, Y + 1, -6, 8, Y + 12, 6, VC.wood); B(-9, Y, -7, 9, Y, 7, VC.woodD);
  for (const a of [-5, 0, 5]) B(a - 1, Y + 4, 6, a + 1, Y + 7, 6, VC.dark);
  B(-8, Y + 3, 7, 8, Y + 3, 9, VC.woodL);
  thatch(B, -11, 11, -9, 9, Y + 13, [[0, 4], [5, 4]], 1, { vent: false });
  for (const a of [-5, 6]) { B(a - 1, Y + 4, 8, a + 1, Y + 5, 9, 0xd8d8d0); B(a, Y + 6, 9, a, Y + 6, 9, 0x8a8a92); }
  for (const a of [-3, 3]) B(a, -1, 2, a, Y - 1, 2, VC.wood);
  for (let y = 4; y < Y; y += 6) B(-2, y, 2, 2, y, 2, VC.woodL);
}

// ------------------------------------------------------------------ seasonal pieces
/** 稻架 (autumn): posts and three poles with rice sheaves hung over them in bundles */
export function hasa(c: Ctx, x: number, z: number, r: number, half = 26) {
  const B = loc(c.w, M(x), M(z), r);
  for (const a of [-half, -10, 10, half - 1]) B(a, -1, 0, a + 1, 30, 1, VC.post);
  for (const [k, y] of [[0, 9], [1, 18], [2, 27]] as const) {
    B(-half - 1, y, 0, half + 1, y, 1, VC.strawD);
    for (let a = -half + 2; a + 8 <= half - 1; a += 10) { if (a <= -10 && a + 8 >= -10 || a <= 10 && a + 8 >= 10) continue; B(a, y - 6, -1, a + 8, y + 1, 2, k & 1 ? VC.straw : 0xb89a54); B(a, y - 6, -1, a + 8, y - 6, 2, 0x8a7440); }
  }
}
/** 鲤鱼旗 (spring): a tall pole on a stone block, a wheel and ball at the top, a three-band streamer and three carp flying toward local −z */
export function koinobori(c: Ctx, x: number, z: number, r: number) {
  // built streaming toward local −z, then turned so the carp fly sideways across the view (local +x)
  const L = loc(c.w, M(x), M(z), r), T = 88, B: Bx = (x0, y0, z0, x1, y1, z1, col, g) => L(-z0, y0, x0, -z1, y1, x1, col, g);
  B(-4, -1, -4, 4, 3, 4, VC.stone); B(-1, 4, -1, 1, T, 1, VC.woodL);
  B(-4, T + 1, 0, 4, T + 1, 0, VC.white); B(0, T + 1, -4, 0, T + 1, 4, VC.white); B(-1, T + 2, -1, 1, T + 3, 1, 0xd8b048);
  const band = [VC.indigoL, VC.white, VC.red];
  band.forEach((col, i) => B(0, T - 2 - i * 2, -24, 0, T - 1 - i * 2, -2, col));
  const carp = (y: number, len: number, hgt: number, body: number, belly: number) => {
    const z0 = -2, z1 = -2 - len;
    B(-1, y, z1 + 4, 1, y + hgt - 1, z0, body); B(-1, y, z0, 1, y + hgt - 1, z0, VC.white);
    B(-1, y, z1 + 4, 1, y + 1, z0 - 4, belly);
    for (let zz = z0 - 7; zz > z1 + 6; zz -= 6) B(-1, y + 2, zz, 1, y + hgt - 1, zz, belly);
    B(-1, y + hgt - 3, z0 - 3, 1, y + hgt - 2, z0 - 2, VC.white); B(-2, y + hgt - 3, z0 - 3, 2, y + hgt - 3, z0 - 3, VC.black);
    B(-1, y + hgt - 2, z1, 1, y + hgt - 1, z1 + 3, body); B(-1, y, z1, 1, y + 1, z1 + 3, body);
  };
  carp(T - 18, 26, 8, VC.black, 0x5a5a62); carp(T - 30, 20, 7, VC.red, 0xe0904a); carp(T - 40, 15, 6, VC.indigoL, 0x8aa4d8);
}
/** 雪人 (winter): two stacked snow masses, charcoal eyes, a red bucket hat, twig arms */
export function yukidaruma(c: Ctx, x: number, z: number, r: number) {
  const B = loc(c.w, M(x), M(z), r), S = 0xe8eef6, D = 0xc8d0dc;
  B(-6, -1, -4, 6, 8, 4, S); B(-4, -1, -6, 4, 8, 6, S); B(-4, 9, -4, 4, 9, 4, D);
  B(-4, 10, -3, 4, 15, 3, S); B(-3, 10, -4, 3, 15, 4, S);
  B(-2, 13, 4, -2, 13, 4, VC.black); B(2, 13, 4, 2, 13, 4, VC.black); B(-1, 11, 4, 1, 11, 4, VC.black);
  B(-3, 16, -3, 3, 19, 3, VC.red); B(-4, 16, -4, 4, 16, 4, 0x82261e);
  for (const s of [-1, 1]) { B(s * 7, 6, 0, s * 11, 6, 0, VC.bark); B(s * 11, 7, 0, s * 11, 9, 0, VC.bark); }
}
