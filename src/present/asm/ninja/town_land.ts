// 城下町的地标（town 代理）：火之见橹（高耸的木望楼）、木户（街门 + 番屋）、桥与常夜灯（横穿街尾的水道、三段拱桥、石灯、柳）。
// 三个剪影完全不同：竖的塔、横的门、低平的桥 + 一根高灯。都在街尾（构图的地标位），朝 +z（镜头）。
import type { Ctx } from '../../scenes/stage';
import { M } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import type { Landmark, Place } from '../types';
import { TW, chochin } from './town_kit';
import { plates, gableX, bucket, yanagi } from './town_props';

const lampLight = (c: Ctx, p: Place, at: [number, number, number], k = 1, d = 5) => { if (p.lamp > 0.3) c.light(at, 0xffa050, 2.4 * p.lamp * k, d); };

/** a canal across x (cells: z from Za to Zb), the whole width of the stage: the floor taken out, a dark bed, light coping on both
 *  banks; inside |x − X| ≤ lip the coping stands one block proud */
export function canalX(c: Ctx, X: number, Za: number, Zb: number, lip: number) {
  const w = c.w;
  w.box(X - 260, -1, Za, X + 260, -1, Zb, null).box(X - 260, -2, Za, X + 260, -2, Zb, 0x14222c, 1);
  w.box(X - 260, -1, Za - 1, X + 260, -1, Za - 1, TW.stoneL).box(X - 260, -1, Zb + 1, X + 260, -1, Zb + 1, TW.stoneL);
  w.box(X - 260, -1, Za - 2, X + 260, -1, Za - 2, TW.stoneD).box(X - 260, -1, Zb + 2, X + 260, -1, Zb + 2, TW.stoneD);
  w.box(X - lip, 0, Za - 2, X + lip, 0, Za - 1, TW.stoneL).box(X - lip, 0, Zb + 1, X + lip, 0, Zb + 2, TW.stoneL);
  c.water((X - 260) * CELL, Za * CELL, (X + 261) * CELL, (Zb + 1) * CELL, 0x2c4a5c);
}
/** 常夜灯：a tall stone night lantern — three wide base tiers, a tall shaft, a platform, a wooden fire box glowing on four sides, a
 *  wide roof in two steps and a jewel finial. Returns the flame (metres). */
export function joyato(c: Ctx, X: number, Z: number) {
  const w = c.w;
  w.box(X - 8, -1, Z - 8, X + 8, 2, Z + 8, TW.stoneD).box(X - 6, 3, Z - 6, X + 6, 5, Z + 6, TW.stone).box(X - 4, 6, Z - 4, X + 4, 8, Z + 4, TW.stoneL);
  w.box(X - 2, 9, Z - 2, X + 2, 32, Z + 2, TW.stone).box(X - 3, 18, Z - 3, X + 3, 19, Z + 3, TW.stoneD);
  w.box(X - 5, 33, Z - 5, X + 5, 35, Z + 5, TW.stoneL);
  w.box(X - 4, 36, Z - 4, X + 4, 47, Z + 4, TW.glowMid, 1).box(X - 4, 39, Z - 1, X + 4, 44, Z + 1, TW.glowCore, 1).box(X - 1, 39, Z - 4, X + 1, 44, Z + 4, TW.glowCore, 1);
  for (const [a, b] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) w.box(X + a, 36, Z + b, X + a + 1, 47, Z + b + 1, TW.woodD);
  w.box(X - 4, 36, Z - 4, X + 4, 36, Z + 4, TW.woodD).box(X - 4, 41, Z - 4, X + 4, 41, Z + 4, TW.woodD);
  w.box(X - 8, 48, Z - 8, X + 8, 49, Z + 8, TW.stoneD).box(X - 8, 50, Z - 8, X + 8, 50, Z + 8, TW.stoneL).box(X - 5, 51, Z - 5, X + 5, 53, Z + 5, TW.stone);
  w.box(X - 2, 54, Z - 2, X + 2, 56, Z + 2, TW.stoneL).box(X - 1, 57, Z - 1, X + 1, 58, Z + 1, TW.stone);
  return [(X + 0.5) * CELL, 2.9, (Z + 0.5) * CELL] as [number, number, number];
}

export const LANDMARKS: Landmark[] = [
  { id: 'yagura', name: '火之见橹', foot: { w: 7.6, d: 4.2 }, tags: ['tall'], build(c, p) {
    // a timber fire-watch tower: four posts on a stone podium with level tie beams, a ladder up the front, a railed lookout under a
    // hip roof with the alarm bell; a fenced yard at its foot with buckets stacked 3-2-1 and a rack of fire hooks
    const w = c.w, X = M(p.x), Z = M(p.z - 0.6), H = M(7.6), A = 13;
    w.box(X - A - 4, -1, Z - A - 4, X + A + 4, 1, Z + A + 4, TW.stoneD).box(X - A - 3, 2, Z - A - 3, X + A + 3, 2, Z + A + 3, TW.stone);
    for (const a of [-A, A]) for (const b of [-A, A]) w.box(X + a - 2, 3, Z + b - 2, X + a + 1, H, Z + b + 1, TW.wood);
    for (let y = 24; y < H - 10; y += 26) {
      w.box(X - A - 2, y, Z - A - 2, X + A + 1, y + 2, Z - A + 1, TW.woodD).box(X - A - 2, y, Z + A - 2, X + A + 1, y + 2, Z + A + 1, TW.woodD);
      w.box(X - A - 2, y, Z - A - 2, X - A + 1, y + 2, Z + A + 1, TW.woodD).box(X + A - 2, y, Z - A - 2, X + A + 1, y + 2, Z + A + 1, TW.woodD);
    }
    w.box(X - 4, 3, Z + A + 2, X - 3, H - 10, Z + A + 2, TW.woodL).box(X + 3, 3, Z + A + 2, X + 4, H - 10, Z + A + 2, TW.woodL);
    for (let y = 8; y < H - 10; y += 6) w.box(X - 2, y, Z + A + 2, X + 2, y, Z + A + 2, TW.woodL);
    const L = H - 10;
    w.box(X - A - 5, L, Z - A - 5, X + A + 5, L + 2, Z + A + 5, TW.woodD).box(X - A - 5, L + 2, Z - A - 5, X + A + 5, L + 2, Z + A + 5, TW.woodL);
    for (const [a, b] of [[-A - 5, -A - 5], [A + 4, -A - 5], [-A - 5, A + 4], [A + 4, A + 4]]) w.box(X + a, L + 3, Z + b, X + a + 1, L + 9, Z + b + 1, TW.wood);
    w.box(X - A - 5, L + 9, Z - A - 5, X + A + 5, L + 10, Z - A - 4, TW.wood).box(X - A - 5, L + 9, Z + A + 4, X + A + 5, L + 10, Z + A + 5, TW.wood);
    w.box(X - A - 5, L + 9, Z - A - 5, X - A - 4, L + 10, Z + A + 5, TW.wood).box(X + A + 4, L + 9, Z - A - 5, X + A + 5, L + 10, Z + A + 5, TW.wood);
    w.box(X - A - 5, L + 4, Z + A + 5, X + A + 5, L + 8, Z + A + 5, TW.red).box(X - A - 5, L + 6, Z + A + 5, X + A + 5, L + 6, Z + A + 5, TW.white);   // a red-and-white cloth on the front rail
    for (const a of [-A, A]) for (const b of [-A, A]) w.box(X + a - 1, L + 3, Z + b - 1, X + a, L + 22, Z + b, TW.wood);
    const R = L + 23;
    plates(w, X - A - 9, X + A + 9, Z - A - 9, Z + A + 9, R, [[0, 3], [5, 3], [5, 3], [4, 2]]);
    w.box(X - 3, R + 11, Z - 3, X + 3, R + 12, Z + 3, TW.ridge).box(X - 1, R + 13, Z - 1, X + 1, R + 15, Z + 1, TW.gold);
    w.box(X - A, R - 2, Z - 1, X + A, R - 1, Z, TW.woodD).box(X, R - 5, Z, X, R - 3, Z, TW.rope);
    w.box(X - 3, R - 14, Z - 3, X + 3, R - 6, Z + 3, 0x4a5a4a).box(X - 4, R - 15, Z - 4, X + 4, R - 15, Z + 4, 0x3a4a3a).box(X - 2, R - 9, Z + 4, X + 2, R - 8, Z + 4, TW.gold);
    // the yard
    const FX = M(3.6), FZ0 = Z - M(1.6), FZ1 = Z + M(1.8);
    for (const sx of [-1, 1]) w.box(X + sx * FX, -1, FZ0, X + sx * FX + sx, 12, FZ1, TW.board).box(X + sx * FX - 1, 13, FZ0, X + sx * FX + 1, 13, FZ1, TW.boardD);
    w.box(X - FX, -1, FZ0, X + FX, 12, FZ0 + 1, TW.board).box(X - FX, 13, FZ0 - 1, X + FX, 13, FZ0 + 2, TW.boardD);
    const bx = X + M(2.3), bz = Z + M(1.0);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) { const x = bx - (2 - row) * 3 + i * 6, y = row * 6; w.box(x - 2, y, bz - 2, x + 2, y + 5, bz + 2, TW.red).box(x - 2, y + 4, bz - 2, x + 2, y + 4, bz + 2, TW.woodD).box(x - 1, y + 5, bz - 1, x + 1, y + 5, bz + 1, TW.woodD); }
    w.box(bx - 8, -1, bz - 3, bx + 8, -1, bz + 3, TW.stoneD);
    const hx = X - M(2.6);
    w.box(hx - 1, -1, Z + M(1.2), hx, 26, Z + M(1.2) + 1, TW.woodD).box(hx - 1, -1, Z - M(0.6), hx, 26, Z - M(0.6) + 1, TW.woodD).box(hx - 1, 24, Z - M(0.6), hx, 25, Z + M(1.2) + 1, TW.woodD);
    for (let k = 0; k < 3; k++) { const z = Z - M(0.3) + k * 8; w.box(hx + 1, 2, z, hx + 1, 25, z, TW.bamboo).box(hx + 1, 2, z - 1, hx + 1, 4, z + 1, TW.iron); }
    const lp = chochin(w, X + FX + 2, 22, FZ1, 7, 0xd8a85c, TW.red);
    w.box(X + FX + 1, 13, FZ1, X + FX + 1, 26, FZ1, TW.woodD).box(X + FX + 1, 26, FZ1, X + FX + 2, 26, FZ1, TW.woodD);
    lampLight(c, p, lp, 1.2, 6);
  } },
  { id: 'kido', name: '木户', foot: { w: 8.0, d: 4.2 }, tags: ['gate'], build(c, p) {
    // the town gate across the street: two heavy posts, a tie beam and a capped lintel with a small board roof, a crest plaque, the two
    // plank leaves swung open toward the street, a bamboo-slat palisade (yarai) to one side and the gate-keeper's hut to the other
    const w = c.w, X = M(p.x), Z = M(p.z), s = p.rnd(1) < 0.5 ? 1 : -1, P = 22, H = 48;
    for (const sx of [-P, P]) { w.box(X + sx - 4, -1, Z - 4, X + sx + 3, 2, Z + 3, TW.stoneD); w.box(X + sx - 3, 3, Z - 3, X + sx + 2, H, Z + 2, TW.wood); w.box(X + sx - 3, 3, Z + 3, X + sx + 2, 6, Z + 3, TW.iron); }
    w.box(X - P - 6, 36, Z - 2, X + P + 5, 38, Z + 1, TW.woodD);
    w.box(X - P - 9, H + 1, Z - 4, X + P + 8, H + 3, Z + 3, TW.woodD);
    plates(w, X - P - 12, X + P + 11, Z - 8, Z + 7, H + 4, [[0, 2], [3, 2], [4, 2]], TW.board, TW.boardD, TW.boardL);
    w.box(X - P - 12, H + 10, Z - 1, X + P + 11, H + 11, Z, TW.boardD);
    w.box(X - 9, 37, Z + 2, X + 8, 48, Z + 2, TW.woodD).box(X - 8, 40, Z + 3, X + 7, 46, Z + 3, TW.woodL).box(X - 2, 41, Z + 4, X + 1, 45, Z + 4, TW.woodD).box(X - 4, 42, Z + 4, X + 3, 44, Z + 4, TW.woodD);
    // the leaves, open flat toward +z against the inside of the posts: planks with iron bands
    for (const sx of [-1, 1]) {
      const x = X + sx * (P - 4);
      w.box(x, 2, Z + 3, x + sx, 35, Z + 19, TW.wood);
      for (let z = Z + 6; z <= Z + 18; z += 4) w.box(x - sx, 2, z, x - sx, 35, z, TW.woodD);
      for (const y of [8, 28]) w.box(x - sx, y, Z + 3, x - sx, y + 1, Z + 19, TW.iron);
    }
    // the hanging lanterns on brackets out from the lintel
    const lamps: Array<[number, number, number]> = [];
    for (const sx of [-P, P]) { w.box(X + sx, H - 1, Z + 2, X + sx, H - 1, Z + 7, TW.woodD); lamps.push(chochin(w, X + sx, H - 5, Z + 7, 9, 0xe0b060, TW.red)); }
    lampLight(c, p, [p.x, 2.6, p.z + 0.7], 1.4, 7);
    // the palisade on side −s: posts every 10 cells, two rails, bamboo slats every 3
    const a = X - s * (P + 4), b = X - s * 56;
    for (let x = Math.min(a, b); x <= Math.max(a, b); x += 3) w.box(x, -1, Z, x, 30, Z, (x / 3) & 1 ? TW.bamboo : TW.bambooD);
    for (let x = Math.min(a, b); x <= Math.max(a, b); x += 10) w.box(x - 1, -1, Z - 1, x, 33, Z + 1, TW.woodD);
    for (const y of [10, 24]) w.box(Math.min(a, b), y, Z + 1, Math.max(a, b), y + 1, Z + 1, TW.woodD);
    // the keeper's hut on side s: board wainscot, plaster, a lit lattice window facing the street, a small gable roof, a lantern,
    // a rack of capture poles (sasumata: a pole with a square fork) and a fire tub with buckets
    const h0 = X + s * (P + 6), h1 = X + s * 54, hx0 = Math.min(h0, h1), hx1 = Math.max(h0, h1), hz0 = Z - 22, hz1 = Z + 6;
    w.box(hx0, -1, hz0, hx1, 0, hz1, TW.stoneD).box(hx0 + 1, 1, hz0 + 1, hx1 - 1, 30, hz1 - 1, TW.plaster).box(hx0 + 1, 1, hz1 - 1, hx1 - 1, 12, hz1 - 1, TW.board);
    for (const x of [hx0 + 1, hx1 - 1]) w.box(x, 1, hz1 - 1, x, 30, hz1 - 1, TW.woodD);
    const wx0 = hx0 + 7, wx1 = hx1 - 7;
    w.box(wx0, 14, hz1, wx1, 26, hz1, TW.woodD).box(wx0 + 1, 15, hz1 - 1, wx1 - 1, 25, hz1 - 1, TW.glowMid, p.lamp > 0.3 ? 1 : 0);
    for (let x = wx0 + 3; x < wx1; x += 3) w.box(x, 15, hz1, x, 25, hz1, TW.woodD);
    gableX(w, hx0 - 4, hx1 + 4, hz0 - 4, hz1 + 4, 31, [[0, 3], [5, 3], [5, 3]], TW.board, TW.boardD, TW.boardL);
    const kx = s > 0 ? hx0 + 4 : hx1 - 4;
    for (let k = 0; k < 3; k++) { const x = kx + s * k * 5, z = hz1 + 3; w.box(x, -1, z, x, 38, z, TW.woodD).box(x - 2, 39, z, x + 2, 39, z, TW.iron).box(x - 2, 40, z, x - 2, 42, z, TW.iron).box(x + 2, 40, z, x + 2, 42, z, TW.iron); }
    w.box(kx - 2, 30, hz1 + 3, kx + s * 12 + 2 * s, 31, hz1 + 3, TW.woodD);
    const tx = s > 0 ? hx1 - 10 : hx0 + 10, tz = hz1 + 8;
    w.box(tx - 6, -1, tz - 4, tx + 6, 9, tz + 4, TW.wood).box(tx - 6, 3, tz - 4, tx + 6, 3, tz + 4, TW.iron).box(tx - 6, 10, tz - 4, tx + 6, 10, tz + 4, TW.woodD);
    for (const dx of [-3, 3]) bucket(w, tx + dx, tz, 11, TW.red);
    const hl = chochin(w, s > 0 ? hx0 + 14 : hx1 - 14, 27, hz1 + 3, 6, 0xe0b060);
    w.box(s > 0 ? hx0 + 14 : hx1 - 14, 31, hz1 + 1, s > 0 ? hx0 + 14 : hx1 - 14, 31, hz1 + 3, TW.woodD);
    lampLight(c, p, hl, 0.8, 4); void lamps;
  } },
  { id: 'hashi', name: '桥与常夜灯', foot: { w: 8.0, d: 4.4 }, tags: ['water', 'bridge'], build(c, p) {
    // a canal across the end of the street, a wooden bridge over it in three flat steps with railings and capped posts, a tall stone
    // night lantern on the near bank, a willow leaning over the water on the other side, a small boat moored under it
    const w = c.w, X = M(p.x), Z = M(p.z), s = p.rnd(1) < 0.5 ? 1 : -1, Za = Z - 22, Zb = Z + 4;
    canalX(c, X, Za, Zb, 56);
    const BW = 17, sec: Array<[number, number, number]> = [[Za - 7, Za - 1, 2], [Za, Za + 6, 5], [Za + 7, Zb - 7, 8], [Zb - 6, Zb, 5], [Zb + 1, Zb + 8, 2]];
    for (const [z0, z1, top] of sec) {
      const onLand = z0 < Za || z0 > Zb;
      w.box(X - BW, onLand ? -1 : top - 2, z0, X + BW, top, z1, TW.wood).box(X - BW, top, z0, X + BW, top, z1, TW.woodL);
      for (let x = X - BW + 3; x < X + BW; x += 6) w.box(x, top, z0, x, top, z1, TW.wood);
      for (const sx of [-BW, BW]) { w.box(X + sx, top + 1, z0, X + sx, top + 1, z1, TW.woodD); w.box(X + sx, top + 8, z0, X + sx, top + 9, z1, TW.woodD); }
    }
    // piers into the canal under the step joints, a beam under each step
    for (const z of [Za + 1, Za + 6, Zb - 6, Zb - 1]) for (const sx of [-BW + 2, 0, BW - 2]) w.box(X + sx - 1, -2, z, X + sx, 6, z + 1, TW.woodD);
    // capped railing posts at every step change (the caps are two tiers of bronze-green)
    for (const z of [Za - 7, Za, Za + 7, Zb - 6, Zb + 1, Zb + 8]) {
      const top = z < Za || z > Zb + 0 ? 2 : z === Za || z === Zb - 6 ? 5 : 8;
      for (const sx of [-BW, BW]) w.box(X + sx - 1, top + 1, z - 1, X + sx + 1, top + 12, z + 1, TW.woodD).box(X + sx - 1, top + 13, z - 1, X + sx + 1, top + 14, z + 1, 0x4a7466).set(X + sx, top + 15, z, 0x689486);
    }
    // the night lantern on the near bank, side s; the willow on the other side, leaning over the water
    const jx = X + s * 40, jz = Zb + 13, flame = joyato(c, jx, jz); lampLight(c, p, flame, 1.5, 7);
    yanagi(c, (X - s * 38 + 0.5) * CELL, (Zb + 12 + 0.5) * CELL, 5.4, p.season, p.seed, [0, -1], 14);
    // the boat: a long flat hull with a lighter gunwale, a straw mat shelter and a pole, moored by the willow
    const bx0 = X - s * 22, bx1 = X - s * 52, ba = Math.min(bx0, bx1), bb = Math.max(bx0, bx1), bz0 = Za + 4, bz1 = Za + 14;
    w.box(ba + 2, 0, bz0, bb - 2, 1, bz1, TW.woodD).box(ba, 2, bz0, bb, 3, bz1, TW.wood).box(ba, 4, bz0, bb, 4, bz0, TW.woodL).box(ba, 4, bz1, bb, 4, bz1, TW.woodL);
    w.box(ba, 4, bz0, ba, 5, bz1, TW.woodL).box(bb, 4, bz0, bb, 5, bz1, TW.woodL).box(ba + 1, 2, bz0 + 1, bb - 1, 3, bz1 - 1, TW.woodD);
    const ma = ba + 8, mb = bb - 10;
    w.box(ma, 4, bz0 + 1, ma + 1, 11, bz1 - 1, TW.bambooD).box(mb - 1, 4, bz0 + 1, mb, 11, bz1 - 1, TW.bambooD).box(ma, 12, bz0, mb, 13, bz1, TW.straw).box(ma, 12, bz0, mb, 12, bz0, TW.strawD).box(ma, 12, bz1, mb, 12, bz1, TW.strawD);
    const px = s > 0 ? ba + 2 : bb - 2; w.box(px, -2, bz1 + 2, px, 34, bz1 + 2, TW.bamboo);
  } },
];
