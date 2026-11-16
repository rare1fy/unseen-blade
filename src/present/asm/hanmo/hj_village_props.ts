// 残村的道具（黄巾残村 · village 代理）：石磨与磨棚、辘轳井、牛车、粮囷、土地庙、土灶、余烬堆、黄巾旗与戟架、柴垛、鸡舍篱笆、石槽、
// 打谷场的碌碡、晾架、田垄与桔槔、门楼。都在本地框里搭（front = 本地 +z），坐标用格，原点是组的锚点。
import { M } from '../../scenes/props';
import type { Ctx } from '../../scenes/stage';
import { loc, locM, type Bx, type P3 } from '../../scenes/k_village';
import type { SeasonId } from '../types';
import { HV, disc, jar, roof, earth, cartWheel, strawStack } from './hj_village_kit';

const ring = (B: Bx, a: number, c: number, b: number, e: number, y: number, col: number) => { B(a, y, c, b, y, c, col); B(a, y, e, b, y, e, col); B(a, y, c, a, y, e, col); B(b, y, c, b, y, e, col); };
const BARK = 0x5a4632, LOG_END = 0xa48a5e, LOG_SEAM = 0x7a6444, TWIG = 0x6a5a40, GRAIN = 0xb8964c, GRAIN_L = 0xcaa858;

// ------------------------------------------------------------------ 石磨 the stone mill (and its shed)
/** a round stone-faced pedestal with a light rim, the nether and runner stones with a dark seam, the feed eye, the turning bar out to +x,
 *  a grain sack and a sieve beside it; shed = four posts and a low two-tier thatch over it */
export function mill(c: Ctx, x: number, z: number, r: number, shed: boolean) {
  const B = loc(c.w, M(x), M(z), r);
  disc(B, 0, 0, 12, -1, 4, HV.stoneD); disc(B, 0, 0, 12, 5, 5, HV.stoneL); disc(B, 0, 0, 10, 5, 5, HV.stone);
  B(-2, 2, 12, 2, 5, 14, HV.stoneD); B(-1, 5, 13, 1, 5, 14, HV.stone);
  disc(B, 0, 0, 8, 6, 8, HV.stone); disc(B, 0, 0, 8, 9, 9, HV.stoneD); disc(B, 0, 0, 8, 10, 13, HV.stoneL); disc(B, 0, 0, 6, 13, 13, HV.stone);
  B(-1, 13, -1, 1, 13, 1, HV.dark);
  B(7, 11, -1, 9, 12, 1, HV.woodD); B(10, 11, -1, 22, 12, 0, HV.wood);
  // a grain sack tied at the neck and a round sieve lying flat
  B(-17, 0, 3, -12, 6, 8, HV.hemp); B(-16, 7, 4, -13, 7, 7, HV.hempD); B(-15, 8, 5, -14, 9, 6, HV.rope);
  disc(B, -15, -6, 4, 0, 1, HV.woodL); disc(B, -15, -6, 3, 1, 1, HV.strawD);
  if (!shed) return;
  for (const a of [-16, 15]) for (const b of [-14, 13]) B(a, 0, b, a + 1, 30, b + 1, HV.post);
  ring(B, -16, -14, 16, 14, 31, HV.woodD); ring(B, -16, -14, 16, 14, 32, HV.woodD);
  roof(B, -20, 20, -19, 19, 33, 'thatch', { tiers: 2 });
}

// ------------------------------------------------------------------ 井 the well with a windlass
/** a stone apron, a square kerb of slabs (joints at thirds), dark water two cells down; the windlass (辘轳): two posts on stone feet, the
 *  drum on its iron axle, a crank, a rope and a bucket; a small two-tier tile roof on the posts; a stone trough and a bucket beside it */
export function well(c: Ctx, x: number, z: number, r: number) {
  const B = loc(c.w, M(x), M(z), r);
  B(-11, -1, -11, 11, -1, 11, HV.stoneD);
  B(-8, 0, -8, 8, 6, 8, HV.stone); B(-8, 7, -8, 8, 7, 8, HV.stoneL); B(-5, 2, -5, 5, 7, 5, null); B(-5, 1, -5, 5, 1, 5, HV.water);
  for (const k of [-3, 3]) { B(k, 0, 8, k, 6, 8, HV.stoneD); B(k, 0, -8, k, 6, -8, HV.stoneD); B(8, 0, k, 8, 6, k, HV.stoneD); B(-8, 0, k, -8, 6, k, HV.stoneD); }
  for (const s of [-1, 1]) { B(s * 11 - 2, 0, -2, s * 11 + 1, 1, 1, HV.stoneD); B(s * 11 - 1, 2, -1, s * 11, 27, 0, HV.post); }
  B(-8, 19, -2, 8, 22, 1, HV.wood); for (const a of [-8, 8]) B(a, 19, -2, a, 22, 1, HV.woodD); B(-9, 20, -1, 9, 21, 0, HV.iron);
  B(12, 20, -1, 13, 21, 0, HV.iron); B(13, 15, -1, 13, 19, -1, HV.iron); B(13, 15, -3, 13, 15, -2, HV.woodL);
  B(0, 12, 0, 0, 18, 0, HV.rope); B(-2, 8, -2, 2, 11, 2, HV.wood); B(-2, 9, -2, 2, 9, 2, HV.iron);
  B(-12, 28, -2, 12, 28, 1, HV.woodD);
  roof(B, -14, 14, -8, 8, 29, 'tile', { tiers: 2, th: 3 });
  // the trough on the −x side and a wooden bucket in front
  B(-20, 0, -5, -13, 4, 5, HV.stone); B(-19, 2, -4, -14, 4, 4, null); B(-19, 2, -4, -14, 2, 4, HV.water); B(-20, 4, -5, -13, 4, -5, HV.stoneL);
  B(10, 0, 9, 13, 3, 12, HV.wood); B(10, 2, 9, 13, 2, 12, HV.iron); B(11, 3, 10, 12, 3, 11, HV.water);
}

// ------------------------------------------------------------------ 牛车 the ox cart (always side-on to the camera: wheels face-on)
/** the bed on its axle between two big solid wheels, low side boards, the shafts out toward d (±1 along x) propped on two stakes, a load
 *  of sacks and a jar; broken = the far wheel gone, its end of the axle propped on a stack of stones, the wheel's planks on the ground */
export function oxCart(c: Ctx, x: number, z: number, d: 1 | -1, broken: boolean, load: number) {
  const B = loc(c.w, M(x), M(z), 0), R = 10, X = (a: number) => a * d;
  const Bd = (a0: number, y0: number, z0: number, a1: number, y1: number, z1: number, col: number | null) => B(X(a0), y0, z0, X(a1), y1, z1, col);
  cartWheel(B, 0, R, 11, R, 1);
  if (!broken) cartWheel(B, 0, R, -11, R, 1);
  else { B(-5, 0, -14, 5, 7, -9, HV.stoneD); B(-4, 8, -13, 4, 9, -9, HV.stone); B(-12, 0, -18, -4, 0, -15, HV.woodD); B(4, 0, -17, 10, 0, -15, HV.wood); }
  Bd(-1, 9, -10, 1, 10, 10, HV.woodD);
  Bd(-15, 11, -8, 13, 12, 8, HV.woodL); for (let a = -12; a <= 12; a += 5) Bd(a, 12, -8, a, 12, 8, HV.wood);
  Bd(-15, 13, -8, 13, 15, -8, HV.wood); Bd(-15, 13, 8, 13, 15, 8, HV.wood); Bd(-15, 13, -8, -15, 15, 8, HV.woodD);
  for (const b of [-5, 4]) { Bd(14, 11, b, 28, 12, b + 1, HV.wood); Bd(25, 0, b, 26, 10, b + 1, HV.woodD); }
  Bd(27, 13, -6, 28, 13, 6, HV.woodD);
  // the load: sacks on the bed, a jar, or (load < 0.33) nothing but straw
  if (load < 0.33) { Bd(-12, 13, -6, 10, 13, 6, HV.strawD); return; }
  Bd(-13, 13, -6, -6, 19, 0, HV.hemp); Bd(-12, 20, -5, -7, 20, -1, HV.hempD);
  Bd(-5, 13, -6, 2, 18, 0, HV.hempD); Bd(-4, 19, -5, 1, 19, -1, HV.hemp);
  if (load > 0.66) { Bd(-12, 13, 1, -4, 17, 6, HV.hemp); Bd(-11, 18, 2, -5, 18, 5, HV.hempD); }
}
/** the jar on the cart bed (a separate call so it sits on the boards) */
export function cartJar(c: Ctx, x: number, z: number, d: 1 | -1, grey: boolean) {
  const B0 = loc(c.w, M(x) + 7 * d, M(z) + 3, 0), B: Bx = (x0, y0, z0, x1, y1, z1, col, g) => B0(x0, y0 + 13, z0, x1, y1 + 13, z1, col, g);
  jar(B, 0, 0, 0, grey);
}

// ------------------------------------------------------------------ 粮囷 the round granary
/** a raised stone base, a plastered round body with a damp foot band and two straw-rope bands, a small door high up in a board frame with
 *  a ladder standing up to it, a three-tier round thatch (each tier steps in further than it rises) and a mud knob; two sacks at its foot */
export function granary(c: Ctx, x: number, z: number, r: number) {
  const B = loc(c.w, M(x), M(z), r);
  disc(B, 0, 0, 12, -1, 2, HV.stoneD); disc(B, 0, 0, 12, 3, 3, HV.stone);
  disc(B, 0, 0, 10, 4, 27, HV.earthL); disc(B, 0, 0, 10, 4, 5, HV.earthD);
  for (const y of [12, 20]) disc(B, 0, 0, 10, y, y, HV.rope);
  B(-3, 15, 10, 3, 23, 10, HV.dark); B(-4, 14, 11, 4, 14, 11, HV.woodD); B(-4, 24, 11, 4, 24, 11, HV.woodD); B(-4, 15, 11, -4, 23, 11, HV.woodD); B(4, 15, 11, 4, 23, 11, HV.woodD);
  B(-1, 15, 10, 1, 19, 10, HV.wood);
  for (const a of [-3, 3]) B(a, 0, 13, a, 16, 13, HV.wood);
  for (let y = 3; y <= 15; y += 4) B(-2, y, 13, 2, y, 13, HV.woodL);
  B(-3, 16, 12, 3, 16, 12, HV.woodD);
  disc(B, 0, 0, 14, 28, 31, HV.th); disc(B, 0, 0, 14, 28, 28, HV.thD); disc(B, 0, 0, 14, 31, 31, HV.thL);
  disc(B, 0, 0, 9, 32, 35, HV.th); disc(B, 0, 0, 9, 35, 35, HV.thL);
  disc(B, 0, 0, 5, 36, 38, HV.th); disc(B, 0, 0, 5, 38, 38, HV.thL);
  disc(B, 0, 0, 2, 39, 41, HV.earthD);
  B(9, 0, 6, 14, 5, 11, HV.hemp); B(10, 6, 7, 13, 6, 10, HV.hempD); B(-15, 0, 4, -10, 4, 9, HV.hempD); B(-14, 5, 5, -11, 5, 8, HV.hemp);
}

// ------------------------------------------------------------------ 土地庙 the earth-god shrine
/** a brick plinth, a little brick house with a dark niche and the seated earth god in it, a two-tier tile roof, a bronze incense burner
 *  with sticks and two offering bowls on the ledge in front. Returns the candle point (world metres). */
export function shrine(c: Ctx, x: number, z: number, r: number, lit: boolean): P3 {
  const X = M(x), Z = M(z), B = loc(c.w, X, Z, r);
  B(-9, -1, -7, 9, 0, 7, HV.brickD); B(-9, 1, -7, 9, 1, 7, HV.brick);
  B(-7, 2, -5, 7, 13, 3, HV.brick); B(-7, 2, -5, 7, 2, 3, HV.brickD);
  for (const y of [6, 10]) { B(-7, y, 3, 7, y, 3, HV.brickD); B(-7, y, -5, -7, y, 3, HV.brickD); B(7, y, -5, 7, y, 3, HV.brickD); }
  B(-4, 4, 1, 4, 11, 3, null); B(-4, 4, 0, 4, 11, 0, HV.dark); B(-5, 3, 3, 5, 3, 4, HV.stoneL); B(-5, 12, 3, 5, 12, 4, HV.stoneL);
  B(-2, 4, 1, 2, 6, 2, HV.greyL); B(-1, 7, 1, 1, 9, 1, HV.greyL); B(-1, 7, 2, 1, 7, 2, HV.grey);
  roof(B, -9, 9, -7, 5, 14, 'tile', { tiers: 2, th: 2 });
  // the ledge: the burner on four short legs with ash and three sticks, two bowls
  for (const [a, b] of [[-2, 4], [2, 4], [-2, 6], [2, 6]]) B(a, 2, b, a, 2, b, HV.bronze);
  B(-2, 3, 4, 2, 5, 6, HV.bronze); B(-1, 5, 5, 1, 5, 5, HV.ashL); B(-3, 5, 5, -3, 6, 5, HV.bronzeL); B(3, 5, 5, 3, 6, 5, HV.bronzeL);
  for (const a of [-1, 0, 1]) { B(a, 6, 5, a, 8, 5, HV.redD); if (lit) B(a, 9, 5, a, 9, 5, HV.emberL, 1); }
  for (const a of [-6, 6]) { B(a - 1, 2, 4, a + 1, 2, 6, HV.clay); B(a, 3, 5, a, 3, 5, GRAIN); }
  if (lit) B(3, 4, 1, 3, 5, 1, HV.emberL, 1);
  return locM(X, Z, r, 2, 6, 2);
}

// ------------------------------------------------------------------ 土灶 the outdoor earth stove
/** a rammed-earth block with a light top, the fire mouth at the front (glowing when lit) with a stone lintel and ash in front, the iron
 *  cauldron (釜) sunk in the top under a wooden lid, a short chimney at the back, a stack of firewood and a water jar beside it.
 *  Returns the fire point and the chimney top (world metres). */
export function stove(c: Ctx, x: number, z: number, r: number, lit: boolean) {
  const X = M(x), Z = M(z), B = loc(c.w, X, Z, r);
  earth(B, -10, 0, -7, 10, 9, 6); B(-10, 9, -7, 10, 9, 6, HV.earthL);
  B(-4, 1, 4, 4, 5, 6, null); B(-4, 1, 3, 4, 5, 3, lit ? HV.ember : HV.dark, lit ? 1 : 0); if (lit) B(-2, 1, 4, 2, 2, 4, HV.emberL, 1);
  B(-5, 6, 6, 5, 6, 7, HV.stone); B(-4, -1, 7, 4, -1, 10, HV.ash);
  disc(B, -2, -1, 5, 10, 11, HV.iron); disc(B, -2, -1, 5, 11, 11, HV.ironL); disc(B, -2, -1, 4, 12, 12, HV.woodL); B(-3, 13, -1, -1, 13, -1, HV.woodD);
  B(5, 10, -7, 8, 18, -4, HV.earthD); B(4, 19, -8, 9, 19, -3, HV.brickD); B(6, 19, -6, 7, 19, -5, HV.dark);
  for (const [b, y] of [[-5, 0], [-1, 0], [3, 0], [-3, 3], [1, 3]] as const) { B(12, y, b, 18, y + 2, b + 2, BARK); B(12, y, b, 12, y + 2, b + 2, LOG_END); B(18, y, b, 18, y + 2, b + 2, LOG_END); }
  jar(B, -15, 1, 1, false, { lid: true });
  return { fire: locM(X, Z, r, 0, 3, 6), smoke: locM(X, Z, r, 6, 21, -5) };
}

// ------------------------------------------------------------------ 余烬 a smouldering heap of charred timber
/** an ash bed, charred beams in two layers (along x below, along z above), embers glowing between them (dull red when not lit), a
 *  scorched post stub, a hank of burnt thatch. Returns the glow point. */
export function emberHeap(c: Ctx, x: number, z: number, r: number, lit: boolean): P3 {
  const X = M(x), Z = M(z), B = loc(c.w, X, Z, r);
  B(-14, -1, -10, 14, -1, 10, HV.ash); B(-11, 0, -7, 11, 0, 7, HV.ashL);
  B(-3, 1, -3, 3, 1, 2, lit ? HV.ember : 0x6a2a1e, lit ? 1 : 0); B(5, 1, -2, 8, 1, 0, lit ? HV.ember : 0x6a2a1e, lit ? 1 : 0);
  B(-12, 1, -6, 12, 3, -4, HV.char); B(-10, 1, 2, 11, 3, 4, HV.charD);
  B(-7, 4, -9, -5, 6, 8, HV.charL); B(4, 4, -8, 6, 5, 9, HV.char);
  if (lit) { B(-1, 2, -1, 1, 2, 0, HV.emberL, 1); B(5, 6, 2, 5, 6, 3, HV.ember, 1); }
  B(9, 0, -9, 11, 9, -7, HV.char); B(9, 10, -9, 10, 11, -8, HV.charD);
  B(-14, 1, 5, -9, 2, 9, HV.thD);
  return locM(X, Z, r, 0, 3, 0);
}

// ------------------------------------------------------------------ 黄巾 the Yellow Turbans' banners and weapons
/** a standing banner at local (a, b): a stone heap at the foot, the pole, a crossbar, the yellow cloth hanging from it (a dark band at the
 *  head, one fold line, a torn lower corner), facing local +z */
export function banner(B: Bx, a: number, b: number, H: number, wd: number, len: number) {
  B(a - 3, -1, b - 3, a + 4, 1, b + 4, HV.stoneD); B(a - 2, 2, b - 2, a + 3, 2, b + 3, HV.stone);
  B(a, 0, b, a + 1, H, b + 1, HV.post); B(a - 1, H - 2, b + 2, a + wd + 2, H - 1, b + 2, HV.woodD);
  const x0 = a + 2, x1 = a + wd, y1 = H - 3, y0 = y1 - len + 1;
  B(x0, y0, b + 2, x1, y1, b + 2, HV.yellow); B(x0, y1 - 2, b + 2, x1, y1, b + 2, HV.yellowD);
  B(Math.round((x0 + x1) / 2), y0, b + 2, Math.round((x0 + x1) / 2), y1 - 3, b + 2, HV.yellowD);
  B(x1 - 3, y0, b + 2, x1, y0 + 4, b + 2, null);
}
/** a fallen banner: the pole lying along x on the ground, the cloth spread flat beside it with two fold lines */
export function bannerDown(B: Bx, a0: number, a1: number, b: number, wd: number) {
  B(a0, 0, b, a1, 1, b + 1, HV.post);
  B(a0 + 2, 0, b + 2, a0 + 2 + wd, 0, b + 12, HV.yellow); for (const k of [5, 9]) B(a0 + 2, 0, b + k, a0 + 2 + wd, 0, b + k, HV.yellowD);
  B(a0 + wd - 2, 0, b + 9, a0 + 2 + wd, 0, b + 12, null);
}
/** 兵器架：two posts, two rails, three 戟 standing in it (shaft, spear point, the side blade 戈 sticking out square, a red tuft) */
export function jiRack(B: Bx, a: number, b: number, n = 3) {
  for (const u of [a - 9, a + 9]) B(u, 0, b, u + 1, 18, b + 1, HV.post);
  B(a - 10, 8, b, a + 11, 9, b + 1, HV.woodD); B(a - 10, 16, b, a + 11, 17, b + 1, HV.woodD);
  for (let i = 0; i < n; i++) {
    const u = a - 5 + i * 5;
    B(u, 0, b + 2, u, 30, b + 2, HV.woodD); B(u, 31, b + 2, u, 35, b + 2, HV.ironL); B(u + 1, 29, b + 2, u + 3, 29, b + 2, HV.ironL); B(u, 27, b + 2, u, 28, b + 2, HV.red);
  }
}
/** yellow headbands dropped on the ground: short flat strips with a knot */
export function headbands(B: Bx, pts: Array<[number, number, boolean]>) {
  for (const [a, b, alongX] of pts) { if (alongX) B(a - 3, 0, b, a + 3, 0, b, HV.yellow); else B(a, 0, b - 3, a, 0, b + 3, HV.yellow); B(a, 0, b, a, 1, b, HV.yellowD); }
}

// ------------------------------------------------------------------ 柴垛 firewood
/** split logs stacked between four stakes: the end faces show the log ends in a grid (dark seams), the long face has bark courses, brush
 *  bundles tied with rope on top, a chopping block with an axe beside it */
export function woodpile(c: Ctx, x: number, z: number, r: number) {
  const B = loc(c.w, M(x), M(z), r);
  B(-12, 0, -5, 12, 11, 4, BARK); for (const y of [3, 7]) B(-12, y, -5, 12, y, 4, 0x46362a);
  for (const a of [-12, 12]) { B(a, 0, -5, a, 11, 4, LOG_END); for (const y of [3, 7]) B(a, y, -5, a, y, 4, LOG_SEAM); for (const b of [-2, 1]) B(a, 0, b, a, 11, b, LOG_SEAM); }
  for (const a of [-14, 13]) for (const b of [-6, 5]) B(a, 0, b, a, 14, b, HV.post);
  B(-11, 12, -3, 11, 14, 2, TWIG); for (const a of [-7, 0, 7]) B(a, 12, -4, a, 14, 3, HV.rope);
  B(16, 0, -2, 20, 4, 2, BARK); B(16, 4, -2, 20, 4, 2, LOG_END); B(17, 5, -1, 18, 5, 0, HV.iron); B(19, 5, 0, 22, 5, 0, HV.woodL);
}

// ------------------------------------------------------------------ 鸡舍 a coop in a wattle fence
const wattle = (B: Bx, a0: number, a1: number, b: number, h: number) => {
  for (let a = a0; a <= a1; a++) B(a, 0, b, a, h, b, ((a + 40) >> 1) & 1 ? HV.woodL : HV.wood);
  B(a0, Math.round(h / 2), b + 1, a1, Math.round(h / 2), b + 1, HV.woodD);
  for (let a = a0; a <= a1; a += 8) B(a, 0, b - 1, a, h + 2, b + 1, HV.post);
};
const wattleZ = (B: Bx, b0: number, b1: number, a: number, h: number) => {
  for (let b = b0; b <= b1; b++) B(a, 0, b, a, h, b, ((b + 40) >> 1) & 1 ? HV.woodL : HV.wood);
  for (let b = b0; b <= b1; b += 8) B(a - 1, 0, b, a + 1, h + 2, b, HV.post);
};
export function coop(c: Ctx, x: number, z: number, r: number) {
  const B = loc(c.w, M(x), M(z), r);
  for (let a = -9; a <= 9; a++) B(a, 0, -6, a, 10, 6, ((a + 40) >> 1) & 1 ? HV.woodL : HV.wood);
  B(-9, 0, -6, 9, 0, 6, HV.woodD); B(-2, 0, 6, 2, 4, 6, HV.dark); B(4, 6, 6, 7, 7, 6, HV.dark);
  roof(B, -11, 11, -8, 8, 11, 'thatch', { tiers: 2, th: 3 });
  wattle(B, -13, 13, 17, 7); wattleZ(B, 7, 16, -13, 7); wattleZ(B, 7, 16, 13, 7);
  B(-6, 0, 11, 2, 2, 13, HV.wood); B(-5, 2, 12, 1, 2, 12, GRAIN);
}
/** a short straight run of wattle fence (for fields, yards) */
export { wattle, wattleZ };

// ------------------------------------------------------------------ 石槽 a stone trough, a hitching post and hay
export function trough(c: Ctx, x: number, z: number, r: number, water: boolean) {
  const B = loc(c.w, M(x), M(z), r);
  B(-12, 0, -4, 12, 6, 4, HV.stone); B(-10, 3, -2, 10, 6, 2, null); B(-10, 3, -2, 10, 3, 2, water ? HV.water : HV.strawD); B(-12, 6, -4, 12, 6, -4, HV.stoneL);
  B(-12, 0, -4, -12, 6, 4, HV.stoneD); B(12, 0, -4, 12, 6, 4, HV.stoneD);
  B(15, 0, -1, 16, 16, 0, HV.post); B(14, 12, -1, 14, 13, 0, HV.iron); B(15, 17, -1, 16, 17, 0, HV.woodL);
  B(-16, 0, 6, -5, 4, 12, HV.straw); B(-14, 5, 7, -7, 6, 11, HV.strawL); B(-16, 0, 6, -5, 0, 12, HV.strawD);
}

// ------------------------------------------------------------------ 打谷场 the threshing ground
/** 碌碡：a stone roller lying along local x (a plus-shaped section reads round), iron pins at its ends in a wooden frame, a pull pole */
export function roller(B: Bx, a: number, b: number) {
  B(a - 8, 1, b - 4, a + 8, 7, b + 4, HV.stone); B(a - 8, 0, b - 3, a + 8, 8, b + 3, HV.stone);
  B(a - 8, 0, b - 3, a - 8, 8, b + 3, HV.stoneD); B(a + 8, 0, b - 3, a + 8, 8, b + 3, HV.stoneD); B(a - 8, 1, b - 4, a - 8, 7, b + 4, HV.stoneD); B(a + 8, 1, b - 4, a + 8, 7, b + 4, HV.stoneD);
  for (const k of [-4, 0, 4]) B(a + k, 8, b - 3, a + k, 8, b + 3, HV.stoneL);
  B(a - 10, 3, b - 1, a + 10, 4, b, HV.iron);
  for (const s of [-1, 1]) B(a - 11, 3, b + s * 6, a + 11, 4, b + s * 6, HV.wood);
  B(a - 11, 3, b - 6, a - 11, 4, b + 6, HV.wood); B(a + 11, 3, b - 6, a + 11, 4, b + 6, HV.wood);
  B(a + 12, 3, b, a + 24, 4, b, HV.woodL);
}
/** a heap of threshed grain (round, two tiers) */
export function grainHeap(B: Bx, a: number, b: number, rr: number) { disc(B, a, b, rr, 0, 1, GRAIN); disc(B, a, b, Math.max(1, Math.round(rr * 0.55)), 2, 3, GRAIN_L); }
/** 簸箕 a winnowing basket lying flat: a shallow tray with a raised back and sides */
export function winnow(B: Bx, a: number, b: number) {
  B(a - 4, 0, b - 3, a + 4, 0, b + 3, HV.strawD); B(a - 4, 1, b - 3, a + 4, 2, b - 3, HV.straw); B(a - 4, 1, b - 3, a - 4, 1, b + 3, HV.straw); B(a + 4, 1, b - 3, a + 4, 1, b + 3, HV.straw);
  B(a - 2, 1, b, a + 2, 1, b + 2, GRAIN);
}
/** a wooden fork (木杈) lying flat along x: the handle, a crosspiece, three tines */
export function fork(B: Bx, a0: number, a1: number, b: number) {
  B(a0, 0, b, a1, 0, b, HV.woodL); B(a1, 0, b - 2, a1, 0, b + 2, HV.woodL);
  for (const k of [-2, 0, 2]) B(a1 + 1, 0, b + k, a1 + 4, 0, b + k, HV.woodL);
}
export { strawStack };

// ------------------------------------------------------------------ 晾架 the drying rack
/** two posts with a bar, cloths draped over it (front panel long, back panel short) in hemp, indigo, ochre; a basket and a mortar */
export function rack(c: Ctx, x: number, z: number, r: number, seed: number) {
  const B = loc(c.w, M(x), M(z), r);
  for (const a of [-23, 22]) { B(a, 0, -1, a + 1, 28, 0, HV.post); B(a - 1, -1, -2, a + 2, 0, 1, HV.stoneD); }
  B(-25, 28, -1, 25, 28, 0, HV.woodD);
  const cols = [HV.hemp, HV.indigo, HV.ochre, HV.hempD, HV.indigoL];
  [[-21, -12, 14], [-10, -2, 18], [0, 8, 12], [10, 20, 16]].forEach(([a0, a1, len], i) => {
    const col = cols[(i + seed) % cols.length];
    B(a0, 29, -1, a1, 29, 0, col); B(a0, 29 - len, 1, a1, 29, 1, col); B(a0, 29 - Math.round(len / 2), -2, a1, 29, -2, col);
    B(a0, 29 - len, 1, a1, 29 - len, 1, col === HV.indigo || col === HV.indigoL ? 0x262e40 : HV.hempD);
  });
  // a stool with a round basket on it, a stone mortar and pestle
  for (const a of [-14, -8]) for (const b of [6, 10]) B(a, 0, b, a, 4, b, HV.woodD); B(-15, 5, 5, -7, 5, 11, HV.woodL);
  disc(B, -11, 8, 4, 6, 7, HV.straw); disc(B, -11, 8, 3, 7, 7, HV.strawD);
  disc(B, 10, 8, 3, 0, 4, HV.stoneD); B(9, 4, 7, 11, 4, 9, HV.dark); B(10, 5, 8, 10, 9, 8, HV.woodL);
}

// ------------------------------------------------------------------ 田 field rows and the well-sweep
/** ridged rows along local z with the season's crop on them (spring sprouts, summer green millet, autumn heavy heads, winter stubble),
 *  an earth bund round the plot */
export function rows(B: Bx, a0: number, a1: number, b0: number, b1: number, season: SeasonId) {
  for (let a = a0; a <= a1; a++) { const ridge = (a - a0) % 8 < 5; B(a, -1, b0, a, -1, b1, ridge ? HV.soilL : HV.soil); if (ridge) B(a, 0, b0 + 1, a, 0, b1 - 1, HV.soil); }
  ring(B, a0 - 1, b0 - 1, a1 + 1, b1 + 1, 0, HV.loessD);
  for (let a = a0 + 2; a + 2 <= a1; a += 8) for (let b = b0 + 3; b <= b1 - 3; b += 6) {
    if (season === 'spring') { B(a, 1, b, a + 1, 2, b, 0x7a9a4a); B(a, 2, b - 1, a + 1, 2, b + 1, 0x8aaa56); }
    else if (season === 'summer') { B(a - 1, 1, b - 1, a + 1, 5, b + 1, 0x4e6e30); B(a, 6, b, a, 7, b, 0x6a8a40); }
    else if (season === 'autumn') { B(a, 1, b, a, 5, b, HV.strawD); B(a - 1, 5, b - 1, a + 1, 7, b + 1, GRAIN); B(a, 8, b, a, 8, b, GRAIN_L); }
    else B(a, 1, b, a + 1, 1, b, HV.strawD);
  }
}
/** 桔槔：a post with a cross-head, a long lever pole along z pivoting on it, a stone counterweight lashed to the back end, a bucket on a
 *  rope from the front end over a stone-ringed water hole */
export function sweep(B: Bx, a: number, b: number) {
  B(a - 1, 0, b - 1, a, 22, b, HV.post); B(a - 2, 21, b - 1, a + 1, 22, b, HV.woodD);
  B(a - 1, 23, b - 20, a, 23, b + 18, HV.wood);
  B(a - 2, 17, b - 22, a + 1, 22, b - 18, HV.stone); B(a - 2, 20, b - 22, a + 1, 20, b - 18, HV.rope);
  B(a, 12, b + 17, a, 22, b + 17, HV.rope); B(a - 2, 9, b + 15, a + 2, 11, b + 19, HV.wood);
  B(a - 5, 0, b + 12, a + 5, 2, b + 22, HV.stone); B(a - 3, 1, b + 14, a + 3, 2, b + 20, null); B(a - 3, 0, b + 14, a + 3, 0, b + 20, HV.water);
}

// ------------------------------------------------------------------ 门楼 a gate with a little tile roof (for yard walls)
/** two posts, a lintel, a small two-tier tile roof over them; leaves: 'open' (one leaf standing open against the wall line), 'down' (one
 *  leaf fallen flat in front), the other leaf gone */
export function gate(B: Bx, a: number, b: number, hw: number, h: number, leaves: 'open' | 'down') {
  for (const s of [-1, 1]) B(a + s * hw - (s > 0 ? 0 : 1), 0, b - 1, a + s * hw + (s > 0 ? 1 : 0), h, b + 1, HV.post);
  B(a - hw - 4, h + 1, b - 2, a + hw + 4, h + 2, b + 2, HV.woodD);
  roof(B, a - hw - 6, a + hw + 6, b - 7, b + 7, h + 3, 'tile', { tiers: 2, th: 2 });
  if (leaves === 'open') { B(a - hw, 0, b + 2, a - hw + 1, h - 4, b + Math.round(hw * 0.9), HV.wood); for (const y of [4, h - 8]) B(a - hw, y, b + 2, a - hw, y, b + Math.round(hw * 0.9), HV.woodD); }
  else { B(a - hw + 2, 0, b + 4, a + hw - 6, 0, b + 4 + Math.round(h * 0.6), HV.wood); for (const k of [3, Math.round(h * 0.6) - 3]) B(a - hw + 2, 0, b + 4 + k, a + hw - 6, 0, b + 4 + k, HV.woodD); }
}
