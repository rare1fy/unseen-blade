// 城下町的街头道具（town 代理）：屋台、茶店、井户、高札、幟、路傍祠、天水桶、风铃摊、烤红薯摊、柳。
// 都以组锚点 (X, Z)（格）为中心搭，d = 朝街的方向（−p.s，沿 x）；正对镜头的面（+z）放招牌、纹章、灯。
// 铁律：大块体、2～3 层台阶；不做斜线、不做随机色点。
import { M, type W } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import type { Ctx } from '../../scenes/stage';
import { plot, tone, type Mass } from '../../scenes/flora';
import type { SeasonId } from '../types';
import { TW, chochin } from './town_kit';

/** a hip roof of flat plates over cells [x0..x1]×[z0..z1] from y: each plate insets on all sides, its eave row dark, its top lit */
export function plates(w: W, x0: number, x1: number, z0: number, z1: number, y: number, pl: Array<[number, number]>, body = TW.tile, dark = TW.tileD, lit = TW.tileL) {
  let a = x0, b = x1, c = z0, d = z1, yy = y;
  pl.forEach(([ins, th], i) => {
    if (i) { a += ins; b -= ins; c += ins; d -= ins; }
    if (a > b || c > d) return;
    w.box(a, yy, c, b, yy + th - 1, d, body).box(a, yy, c, b, yy, d, dark);
    if (th > 1 && b - a > 2 && d - c > 2) w.box(a + 1, yy + th - 1, c + 1, b - 1, yy + th - 1, d - 1, lit);
    yy += th;
  });
  return yy;
}
/** a gable roof with its ridge along x over cells [x0..x1]×[z0..z1]: plates step in along z only, the ±x ends show a white gable */
export function gableX(w: W, x0: number, x1: number, z0: number, z1: number, y: number, pl: Array<[number, number]>, body = TW.tile, dark = TW.tileD, lit = TW.tileL, gable = TW.plaster) {
  let c = z0, d = z1, yy = y;
  pl.forEach(([ins, th], i) => {
    if (i) { c += ins; d -= ins; }
    if (c > d) return;
    w.box(x0, yy, c, x1, yy + th - 1, d, body).box(x0, yy, c, x1, yy, c, dark).box(x0, yy, d, x1, yy, d, dark).box(x0, yy + th - 1, c, x1, yy + th - 1, d, lit);
    if (i && th > 1) for (const x of [x0, x1]) w.box(x, yy, c + 1, x, yy + th - 2, d - 1, gable);
    yy += th;
  });
  const m = (c + d) >> 1;
  w.box(x0 - 1, yy, m - 2, x1 + 1, yy + 1, m + 2, TW.ridge).box(x0 - 2, yy, m - 3, x0 + 1, yy + 3, m + 3, TW.ridge).box(x1 - 1, yy, m - 3, x1 + 2, yy + 3, m + 3, TW.ridge);
  return yy + 4;
}
/** a low wooden bench (shōgi) along z, its top in red felt or plain boards */
export function bench(w: W, X: number, Z0: number, Z1: number, felt?: number) {
  for (const z of [Z0 + 1, Z1 - 2]) w.box(X - 3, -1, z, X + 3, 4, z + 1, TW.woodD);
  w.box(X - 4, 5, Z0, X + 4, 6, Z1, TW.woodL);
  if (felt != null) w.box(X - 4, 7, Z0 + 1, X + 4, 7, Z1 - 1, felt).box(X - 4, 5, Z0 + 1, X - 4, 6, Z1 - 1, felt);
}
/** a wooden bucket (cells) */
export function bucket(w: W, X: number, Z: number, y0: number, c = TW.wood) {
  w.box(X - 2, y0, Z - 2, X + 2, y0 + 4, Z + 2, c).box(X - 2, y0 + 1, Z - 2, X + 2, y0 + 1, Z + 2, TW.iron).box(X - 1, y0 + 4, Z - 1, X + 1, y0 + 4, Z + 1, TW.gutter);
}

// ------------------------------------------------------------------ stalls
/** 屋台：a soba stall — counter, four posts, a board roof, short noren along its street edge, a lantern, a bench in front. */
export function yatai(c: Ctx, X: number, Z: number, d: 1 | -1, noren: number, lit: boolean) {
  const w = c.w, cx = X - d * 5;
  w.box(cx - 4, -1, Z - 12, cx + 4, 10, Z + 12, TW.wood).box(cx - 5, 11, Z - 13, cx + 5, 12, Z + 13, TW.woodL);
  w.box(cx + d * 4, 1, Z - 11, cx + d * 4, 9, Z + 11, noren);                    // the skirt cloth on the street side
  for (const z of [Z - 12, Z + 11]) for (const x of [cx - 4, cx + 3]) w.box(x, 13, z, x + 1, 27, z + 1, TW.woodD);
  plates(w, cx - 8, cx + 8, Z - 15, Z + 15, 28, [[0, 2], [4, 2]], TW.board, TW.boardD, TW.boardL);
  for (let z = Z - 14; z <= Z + 10; z += 6) w.box(cx + d * 8, 20, z, cx + d * 8, 27, z + 4, noren);
  w.box(cx + d * 9, 22, Z - 2, cx + d * 9, 25, Z + 2, TW.white);
  // the pot and bowls on the counter, steam-dark lid
  w.box(cx - 3, 13, Z - 9, cx + 1, 17, Z - 5, TW.iron).box(cx - 2, 18, Z - 8, cx, 18, Z - 6, TW.woodD);
  for (const z of [Z + 2, Z + 6]) w.box(cx - 1, 13, z, cx + 1, 14, z + 2, TW.white);
  const lp = chochin(w, cx + d * 7, 24, Z + 13, 6, 0xd8a85c, TW.red);
  bench(w, X + d * 9, Z - 9, Z + 9);
  return lit ? lp : null;
}
/** 茶店：a tea stall — a red-felt bench under a big square parasol, a kettle stand with glowing coals, a folding screen behind */
export function chaya(c: Ctx, X: number, Z: number, d: 1 | -1, lit: boolean) {
  const w = c.w, px = X - d * 6;
  bench(w, X + d * 9, Z - 12, Z + 12, 0xb8302a);
  // the parasol: a pole and a canopy in two clear tiers (wide flat plate, small cap), its rim dark
  w.box(px - 1, -1, Z - 1, px, 27, Z, TW.woodD);
  w.box(px - 15, 28, Z - 15, px + 14, 29, Z + 14, 0xb83a2c).box(px - 15, 28, Z - 15, px + 14, 28, Z + 14, 0x8a2a20);
  w.box(px - 6, 30, Z - 6, px + 5, 31, Z + 5, 0xc84a34).box(px - 2, 32, Z - 2, px + 1, 32, Z + 1, TW.woodD);
  // the kettle stand: a dark box with a coal window toward the street, a kettle on top
  const kx = X - d * 14, kz = Z - 10;
  w.box(kx - 3, -1, kz - 3, kx + 3, 8, kz + 3, TW.woodD).box(kx + d * 3, 2, kz - 1, kx + d * 3, 5, kz + 1, lit ? 0xe0702c : TW.redD, lit ? 1 : 0);
  w.box(kx - 2, 9, kz - 2, kx + 2, 12, kz + 2, TW.iron).box(kx, 13, kz, kx, 13, kz, TW.iron);
  // a two-leaf screen behind the bench, a menu board on it
  w.box(X - d * 15, -1, Z + 2, X - d * 14, 18, Z + 13, TW.plaster).box(X - d * 15, -1, Z + 7, X - d * 14, 18, Z + 7, TW.woodD).box(X - d * 15, 18, Z + 2, X - d * 14, 18, Z + 13, TW.woodD);
  w.box(X - d * 13, 9, Z + 4, X - d * 13, 15, Z + 11, TW.woodL).box(X - d * 13, 11, Z + 6, X - d * 13, 13, Z + 9, TW.woodD);
  // tea cups and a tray on the bench
  w.box(X + d * 8, 8, Z - 4, X + d * 10, 8, Z + 2, TW.woodD).set(X + d * 9, 9, Z - 3, TW.white).set(X + d * 9, 9, Z + 1, TW.white);
  return lit ? ([(kx + 0.5) * CELL, 0.4, (kz + 0.5) * CELL] as [number, number, number]) : null;
}
/** 風鈴売り (summer): a vendor's frame hung with glass wind chimes and paper strips, his box below */
export function furin(c: Ctx, X: number, Z: number, d: 1 | -1) {
  const w = c.w, fx = X - d * 2;
  for (const z of [Z - 12, Z + 11]) w.box(fx - 1, -1, z, fx, 30, z + 1, TW.woodD);
  w.box(fx - 1, 29, Z - 12, fx, 30, Z + 12, TW.woodD).box(fx - 1, 19, Z - 12, fx, 19, Z + 12, TW.woodD);
  const glass = [0x8cc8d4, 0xd8e8ec, 0xe0a0b0, 0x9cd0a8], strip = [TW.red, 0xd8c050, TW.indigoL, 0x5a9a4a];
  for (let i = 0; i < 5; i++) {
    const z = Z - 10 + i * 5, gc = glass[i % 4];
    w.box(fx, 26, z, fx, 28, z, TW.white).box(fx - 1, 23, z - 1, fx + 1, 25, z + 1, gc).box(fx, 19 + (i % 2), z, fx, 22, z, strip[i % 4]);
    if (i % 2 === 0) w.box(fx, 16, z + 2, fx, 18, z + 2, TW.white).box(fx - 1, 13, z + 1, fx + 1, 15, z + 3, glass[(i + 1) % 4]).box(fx, 9, z + 2, fx, 12, z + 2, strip[(i + 2) % 4]);
  }
  // the vendor's carrying box with two drawers, and a shoulder pole laid on it
  w.box(X + d * 8 - 4, -1, Z - 7, X + d * 8 + 4, 8, Z + 7, TW.wood).box(X + d * 8 + d * 4, 2, Z - 6, X + d * 8 + d * 4, 4, Z + 6, TW.woodD).box(X + d * 8 + d * 4, 6, Z - 6, X + d * 8 + d * 4, 7, Z + 6, TW.woodD);
  w.box(X + d * 8, 9, Z - 11, X + d * 8, 9, Z + 11, TW.bamboo);
}
/** 焼き芋 (winter): a sweet-potato stand — a stone oven with a glowing fire mouth and a chimney on a board stand, a lantern pole */
export function yakiimo(c: Ctx, X: number, Z: number, d: 1 | -1, lit: boolean) {
  const w = c.w;
  for (const z of [Z - 10, Z + 9]) for (const x of [X - 7, X + 6]) w.box(x, -1, z, x + 1, 7, z + 1, TW.woodD);
  w.box(X - 8, 8, Z - 11, X + 8, 9, Z + 11, TW.woodL);
  w.box(X - 6, 10, Z - 8, X + 6, 20, Z + 4, TW.stone).box(X - 7, 21, Z - 9, X + 7, 22, Z + 5, TW.stoneL);
  const fire = lit ? 0xf07a30 : TW.redD, g = lit ? 1 : 0;
  w.box(X + d * 6, 12, Z - 5, X + d * 6, 17, Z + 1, TW.iron).box(X + d * 6, 13, Z - 4, X + d * 6, 16, Z, fire, g);
  w.box(X - 3, 12, Z + 4, X + 3, 17, Z + 4, TW.iron).box(X - 2, 13, Z + 4, X + 2, 16, Z + 4, fire, g);
  w.box(X - 2, 23, Z - 6, X + 1, 31, Z - 3, TW.iron).box(X - 3, 32, Z - 7, X + 2, 32, Z - 2, TW.iron);
  // a straw sack of potatoes and the lantern pole
  w.box(X - d * 4 - 3, 10, Z + 6, X - d * 4 + 3, 15, Z + 10, TW.straw).box(X - d * 4 - 3, 13, Z + 6, X - d * 4 + 3, 13, Z + 10, TW.rope);
  w.box(X + d * 7, 10, Z + 9, X + d * 7, 30, Z + 9, TW.woodD).box(X + d * 7, 30, Z + 9, X + d * 7, 30, Z + 12, TW.woodD);
  const lp = chochin(w, X + d * 7, 26, Z + 12, 7, 0xe8c070, TW.red);
  return lit ? lp : null;
}

// ------------------------------------------------------------------ street furniture
/** 井戸：a stone well curb with water, a timber frame with a pulley and a hanging bucket, a lid on half, a wash slab */
export function ido(c: Ctx, X: number, Z: number, d: 1 | -1 = 1) {
  const w = c.w, R = 8;
  w.box(X - R, -1, Z - R, X + R, 9, Z + R, TW.stone).box(X - R + 2, 2, Z - R + 2, X + R - 2, 9, Z + R - 2, null).box(X - R, 10, Z - R, X + R, 10, Z + R, TW.stoneL).box(X - R + 2, 10, Z - R + 2, X + R - 2, 10, Z + R - 2, null);
  w.box(X - R + 2, 1, Z - R + 2, X + R - 2, 1, Z + R - 2, 0x1c2a30);
  c.water((X - R + 2) * CELL, (Z - R + 2) * CELL, (X + R - 1) * CELL, (Z + R - 1) * CELL, 0x2a4a5a);
  w.box(X - R + 2, 10, Z - R + 2, X - 1, 11, Z + R - 2, TW.woodL).box(X - R + 2, 11, Z - 2, X - 1, 11, Z + 2, TW.woodD);
  for (const x of [X - R - 2, X + R + 1]) w.box(x, -1, Z - 1, x + 1, 28, Z, TW.wood);
  w.box(X - R - 3, 29, Z - 1, X + R + 2, 30, Z, TW.woodD).box(X - 1, 25, Z - 1, X, 28, Z, TW.woodL);
  w.box(X + 3, 14, Z, X + 3, 28, Z, TW.rope).box(X + 1, 10, Z - 2, X + 5, 13, Z + 2, TW.wood).box(X + 1, 11, Z - 2, X + 5, 11, Z + 2, TW.iron);
  w.box(X + d * (R + 3), -1, Z - 6, X + d * (R + 10), 1, Z + 6, TW.stoneL);
  bucket(w, X + d * (R + 6), Z + 3, 2);
}
/** 高札：the town notice board facing the camera — a stone sill, two posts, a framed board with columns of writing, a little gable roof */
export function kosatsu(c: Ctx, X: number, Z: number) {
  const w = c.w, H = 15;
  w.box(X - 13, -1, Z - 4, X + 13, 1, Z + 4, TW.stone).box(X - 12, 2, Z - 3, X + 12, 2, Z + 3, TW.stoneL);
  for (const x of [X - 12, X + 11]) w.box(x, 3, Z - 1, x + 1, 34, Z, TW.woodD);
  w.box(X - 11, H, Z, X + 11, 33, Z, TW.woodD).box(X - 10, H + 1, Z + 1, X + 10, 32, Z + 1, 0xd8d0bc);
  for (const x of [X - 10, X - 3, X + 4, X + 10]) w.box(x, H + 1, Z + 1, x, 32, Z + 1, TW.woodD);
  // writing: in each panel two or three columns of dark strokes of different length (vertical script), never single dots
  const cols: Array<[number, number, number]> = [[-8, 30, 19], [-5, 30, 23], [-1, 30, 21], [1, 30, 18], [6, 30, 24], [8, 30, 20]];
  for (const [dx, a, b] of cols) w.box(X + dx, b, Z + 2, X + dx, a, Z + 2, 0x3a3430);
  gableX(w, X - 14, X + 14, Z - 6, Z + 6, 35, [[0, 2], [3, 2], [3, 2]]);
  // a low rail in front
  w.box(X - 13, 6, Z + 6, X + 13, 7, Z + 6, TW.wood); for (const x of [X - 13, X - 1, X + 12]) w.box(x, -1, Z + 6, x + 1, 7, Z + 6, TW.woodD);
}
/** 幟：three tall banners on poles, their cloth facing the camera, each with a crest near the top */
export function nobori(c: Ctx, X: number, Z: number, cols: number[], kinds: number[]) {
  const w = c.w;
  [-9, 0, 9].forEach((dx, i) => {
    const x = X + dx - 3, top = 50 - (i === 1 ? 0 : 4);
    w.box(x - 2, -1, Z - 2, x + 2, 3, Z + 2, TW.stone);
    w.box(x, 4, Z, x + 1, top + 2, Z + 1, TW.bambooD);
    w.box(x + 2, top, Z, x + 9, top, Z, TW.bambooD);
    w.box(x + 2, 16, Z, x + 8, top - 1, Z, cols[i]).box(x + 2, top - 1, Z + 1, x + 8, top - 1, Z + 1, TW.white).box(x + 2, 16, Z + 1, x + 8, 17, Z + 1, TW.white);
    const cc = cols[i] === TW.white ? TW.indigo : TW.white;
    const k = kinds[i] % 3, my = top - 9;
    if (k === 0) w.box(x + 4, my - 3, Z + 1, x + 6, my + 3, Z + 1, cc).box(x + 3, my - 1, Z + 1, x + 7, my + 1, Z + 1, cc);
    else if (k === 1) w.box(x + 3, my - 3, Z + 1, x + 7, my + 3, Z + 1, cc).box(x + 4, my - 2, Z + 1, x + 6, my + 2, Z + 1, cols[i]);
    else w.box(x + 3, my - 2, Z + 1, x + 7, my - 1, Z + 1, cc).box(x + 3, my + 1, Z + 1, x + 7, my + 2, Z + 1, cc);
    w.box(x + 4, 22, Z + 1, x + 6, my - 6, Z + 1, cc === TW.white ? tone(cols[i], 1.35) : tone(cols[i], 0.8));
  });
}
/** 路傍の祠：a stone pedestal, a tiny wooden shrine with a tiled roof and a straw rope, two red-bibbed jizō, an offering cup */
export function hokora(c: Ctx, X: number, Z: number) {
  const w = c.w;
  w.box(X - 9, -1, Z - 7, X + 9, 2, Z + 7, TW.stoneD).box(X - 8, 3, Z - 6, X + 8, 4, Z + 6, TW.stone);
  w.box(X - 5, 5, Z - 4, X + 5, 14, Z + 3, TW.wood).box(X - 3, 6, Z + 4, X + 3, 13, Z + 4, TW.woodD).box(X, 6, Z + 4, X, 13, Z + 4, TW.gold);
  plates(w, X - 8, X + 8, Z - 7, Z + 7, 15, [[0, 2], [3, 2], [3, 1]]);
  w.box(X - 6, 12, Z + 5, X + 6, 12, Z + 5, TW.straw).box(X - 3, 9, Z + 5, X - 3, 11, Z + 5, TW.white).box(X + 3, 9, Z + 5, X + 3, 11, Z + 5, TW.white);
  for (const x of [X - 14, X + 12]) {
    w.box(x - 1, -1, Z - 1, x + 3, 0, Z + 3, TW.stoneD).box(x, 1, Z, x + 2, 6, Z + 2, TW.stone).box(x, 7, Z, x + 2, 9, Z + 2, TW.stoneL).box(x, 5, Z + 3, x + 2, 6, Z + 3, TW.red);
  }
  w.box(X - 1, 5, Z + 5, X + 1, 6, Z + 6, TW.red);
}
/** 天水桶：a big hooped water tub for fires with red buckets stacked 2-1 on its lid and a white board on its front */
export function mizuoke(c: Ctx, X: number, Z: number) {
  const w = c.w;
  w.box(X - 7, -1, Z - 7, X + 7, 0, Z + 7, TW.stoneD);
  w.box(X - 6, 1, Z - 6, X + 6, 13, Z + 6, TW.wood);
  for (const y of [3, 11]) w.box(X - 6, y, Z - 6, X + 6, y, Z + 6, TW.iron);
  w.box(X - 6, 14, Z - 6, X + 6, 14, Z + 6, TW.woodD);
  for (const x of [X - 3, X + 3]) w.box(x - 2, 15, Z - 2, x + 2, 19, Z + 2, TW.red).box(x - 2, 19, Z - 2, x + 2, 19, Z + 2, TW.woodD);
  w.box(X - 2, 20, Z - 2, X + 2, 24, Z + 2, TW.red).box(X - 2, 24, Z - 2, X + 2, 24, Z + 2, TW.woodD);
  w.box(X - 3, 5, Z + 7, X + 3, 9, Z + 7, TW.white).box(X - 2, 6, Z + 7, X + 2, 6, Z + 7, TW.woodD).box(X - 1, 8, Z + 7, X + 1, 8, Z + 7, TW.woodD);
}

// ------------------------------------------------------------------ the willow
const WILLOW: Record<SeasonId, [number, number]> = { spring: [0x86b44c, 0xa8d06c], summer: [0x588a38, 0x76a84a], autumn: [0x9a9a46, 0xbcb45a], winter: [0x6e6c4e, 0x8a8664] };
/**
 * 柳：a weeping willow leaning over the street or the water — a trunk with one right-angle knee toward `lean` ([dx, dz], unit), a
 * flat crown in two tiers, and curtains of hanging leaves round its rim in three clear lengths (long on the leaning side), each a
 * leaf mass, with a hanging vine card in front of each curtain. Bare-ish in winter (half the curtains).
 */
export function yanagi(c: Ctx, x: number, z: number, h: number, season: SeasonId, seed: number, lean: [number, number], R = 15) {
  const w = c.w, X = M(x), Z = M(z), T = M(h), bark = 0x4e4234, dark = 0x2e2620, [leaf, top] = WILLOW[season], p = plot(w);
  const [lx, lz] = lean;
  w.box(X - 4, -1, Z - 3, X + 4, 1, Z + 3, dark).box(X - 3, -1, Z - 4, X + 3, 1, Z + 4, dark);
  const y1 = Math.round(T * 0.42), y2 = Math.round(T * 0.74), kx = 6 * lx, kz = 6 * lz;
  w.box(X - 2, 0, Z - 2, X + 2, y1, Z + 2, bark);
  w.box(Math.min(X, X + kx) - 2, y1 - 4, Math.min(Z, Z + kz) - 2, Math.max(X, X + kx) + 2, y1, Math.max(Z, Z + kz) + 2, bark);
  w.box(X + kx - 2, y1, Z + kz - 2, X + kx + 1, y2, Z + kz + 1, bark).box(X + kx - 2, y1 + 6, Z + kz + 2, X + kx - 1, y2 - 6, Z + kz + 2, dark);
  const cx = X + kx + 4 * lx, cz = Z + kz + 4 * lz, add = (m: Partial<Mass> & { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; side: number }) =>
    p.masses.push({ cx: 0, cz: 0, top: tone(m.side, 1.12), low: tone(m.side, 0.65), band: 0, skin: 'leaf', ...m } as Mass);
  add({ x0: cx - R, x1: cx + R, y0: y2, y1: y2 + 6, z0: cz - R, z1: cz + R, cx: 5, cz: 5, side: leaf, top: tone(top, 0.95), band: 1, drip: true });
  add({ x0: cx - R + 6, x1: cx + R - 6, y0: y2 + 7, y1: y2 + 11, z0: cz - R + 6, z1: cz + R - 6, cx: 3, cz: 3, side: top, top: tone(top, 1.12) });
  // curtains: slabs two blocks thick hanging from the crown's rim, in three lengths; the long ones on the leaning side
  const bare = season === 'winter', lens = [Math.round(T * 0.3), Math.round(T * 0.42), Math.round(T * 0.54)];
  let i = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    for (let t = -R + 6; t <= R - 9; t += 7) {
      i++; if (bare && i % 2) continue;
      const open = dx === lx && dz === lz ? 2 : (dx === -lx && dz === -lz) ? 0 : 1, L = lens[(i * 7 + seed) % 3 === 0 ? Math.max(0, open - 1) : open];
      const ex = dx ? cx + dx * (R - 1) : cx + t, ez = dz ? cz + dz * (R - 1) : cz + t;
      const b = dx ? { x0: ex - (dx > 0 ? 1 : 0), x1: ex + (dx > 0 ? 0 : 1), z0: ez, z1: ez + 4 } : { x0: ex, x1: ex + 4, z0: ez - (dz > 0 ? 1 : 0), z1: ez + (dz > 0 ? 0 : 1) };
      add({ ...b, y0: Math.max(12, y2 - L), y1: y2 - 1, side: tone(leaf, 0.92), top: leaf });
      c.cards.add('vine', ((b.x0 + b.x1) / 2 + 0.5 + dx * 1.2) * CELL, ((b.z0 + b.z1) / 2 + 0.5 + dz * 1.2) * CELL, { y: (y2 - 1) * CELL, ry: dz > 0 ? 0 : dz < 0 ? Math.PI : dx > 0 ? Math.PI / 2 : -Math.PI / 2, s: 0.6 + ((i * 13) % 5) * 0.08, tint: bare ? 0xa8a080 : 0xc8e0a0 });
    }
  }
}
