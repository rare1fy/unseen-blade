// 竹山的道具组（wilds 代理）。约定：u = 朝外（远离战斗区，世界 x 方向 × p.s），z 照旧；高的放外侧，矮的放内侧。
import type { Ctx } from '../../scenes/stage';
import { M } from '../../scenes/props';
import { oak, snag, stump } from '../../scenes/flora';
import { TC } from '../../kyoto/temple_kit';
import { MAPLE_BY, SAKURA } from '../season';
import type { Group, Place } from '../types';
import { WC, boxOf, crag, rope, ropeRing, kiTorii, hokora, cedar, grove, brookCells, foxfire, frontOf, frame } from './wilds_kit';

type Tier = [number, number, number, number, number];
const sg = (p: Place) => (p.s || 1) as 1 | -1;
/** world x of a local offset u (metres, + = away from the battle floor) */
const ux = (p: Place, u: number) => p.x + sg(p) * u;
/** how far to pull a group in (metres, ≤ 0) so its outer edge (ext m beyond the anchor) stays on the stage */
const pull = (p: Place, ext: number) => Math.min(0, 12.2 - Math.abs(p.x) - ext);
/** a stacked rock at local (u, z) metres; tier offsets du are local too (mirrored here) */
const rockAt = (c: Ctx, p: Place, u: number, z: number, tiers: Tier[], moss?: number) =>
  crag(boxOf(c.w), M(ux(p, u)), M(z), tiers.map(([a, b, h, du, dv]) => [a, b, h, du * sg(p), dv] as Tier), moss);
const FERN: Record<string, number> = { spring: 0xa8c090, summer: 0x94b080, autumn: 0xc0aa70, winter: 0x98a294 };
const card = (c: Ctx, p: Place, kind: string, u: number, z: number, s: number, tint?: number) => c.cards.add(kind, ux(p, u), z, { y: 0, s, tint: tint ?? FERN[p.season] });
const ferns = (c: Ctx, p: Place, pts: Array<[number, number]>, s = 0.6) => pts.forEach(([u, z], i) => card(c, p, 'fern', u, p.z + z, s + p.rnd(200 + i) * 0.2));
const reeds = (c: Ctx, p: Place, pts: Array<[number, number]>) => pts.forEach(([u, z], i) => card(c, p, 'reeds', u, p.z + z, 0.5 + p.rnd(220 + i) * 0.2, 0xb8c498));
/** cut bamboo stumps: 2×2 culms, a node ring, a pale cut top */
function takeStump(c: Ctx, X: number, Z: number, h: number) {
  c.w.box(X, -1, Z, X + 1, h - 1, Z + 1, TC.bamboo).box(X, 2, Z, X + 1, 2, Z + 1, TC.bambooD).box(X, h, Z, X + 1, h, Z + 1, TC.bambooL);
}
/** a cut bamboo pole lying along z (cells), node bands every 10 */
function takeLying(c: Ctx, X: number, Y: number, Z0: number, Z1: number) {
  c.w.box(X, Y, Z0, X + 1, Y + 1, Z1, TC.bambooY);
  for (let z = Z0 + 4; z < Z1; z += 10) c.w.box(X, Y, z, X + 1, Y + 1, z, TC.bambooYD);
}
const night = (p: Place) => p.lamp > 0.3;

// ------------------------------------------------------------------ L
const L: Group[] = [
  { id: 'chikurin', name: '竹林', tags: ['bamboo', 'tall'], foot: { w: 2.6, d: 4.2 }, h: 8.6, kinds: ['wing', 'corner'], size: 'L', max: 2, weight: 1.6, build(c, p) {
    const k = pull(p, 1.3);
    const s = sg(p);
    grove(c, Math.min(ux(p, -0.6 + k), ux(p, 1.1 + k)), p.z - 1.9, Math.max(ux(p, -0.6 + k), ux(p, 1.1 + k)), p.z + 1.9, 13, p.seed);
    for (const [u, z, h] of [[-0.95, 1.1, 6], [-0.8, 1.4, 4], [-1.05, -0.9, 8], [-0.9, 0.2, 5]] as const) takeStump(c, M(ux(p, u + k)), M(p.z + z), h);
    takeLying(c, M(ux(p, -1.1 + k)) - (s < 0 ? 1 : 0), 0, M(p.z - 1.4), M(p.z + 0.6));
  } },
  { id: 'sawa', name: '沢と小滝', tags: ['water', 'brook', 'rock'], foot: { w: 3.0, d: 4.4 }, h: 1.3, kinds: ['wing'], size: 'L', weight: 2.2, excludes: ['brook'], build(c, p) {
    // a rill along z between two banks of rocks: it spills over a two-step rock at the upstream end and runs under a slab at the other
    const w = c.w, B = boxOf(w), a = M(ux(p, -0.4)), b = M(ux(p, 0.5));
    brookCells(c, Math.min(a, b), M(p.z - 2.0), Math.max(a, b), M(p.z + 1.7), false);
    const up = rockAt(c, p, 0.05, p.z - 2.0, [[10, 6, 10, 0, 0], [7, 4, 7, 0, -1]], WC.moss), X = M(ux(p, 0.05)), Z = M(p.z - 2.0);
    void up;
    B(X - 2, 10, Z + 4, X + 2, 15, Z + 4, WC.water); B(X - 2, 9, Z + 4, X + 2, 9, Z + 6, WC.water); B(X - 3, 0, Z + 7, X + 3, 9, Z + 7, WC.water);
    B(X - 1, 1, Z + 8, X - 1, 8, Z + 8, WC.waterL); B(X - 4, 0, Z + 8, X + 4, 0, Z + 10, WC.foam);
    rockAt(c, p, 0.05, p.z + 1.9, [[9, 4, 4, 0, 0]]);
    rockAt(c, p, 1.05, p.z - 0.5, [[6, 10, 10, 0, 0], [4, 6, 6, 1, 1]], WC.moss); rockAt(c, p, 1.0, p.z + 1.0, [[5, 5, 5, 0, 0]], WC.moss);
    rockAt(c, p, -0.85, p.z - 0.9, [[6, 5, 5, 0, 0]], WC.moss); rockAt(c, p, -0.8, p.z + 0.9, [[4, 4, 3, 0, 0]]);
    for (const z of [p.z - 0.3, p.z + 0.6]) { const U = M(ux(p, 0.05)), Zs = M(z); B(U - 2, -1, Zs - 2, U + 2, 0, Zs + 2, WC.rockT); }
    ferns(c, p, [[1.4, -1.3], [1.4, 0.4], [-1.2, -0.3], [-1.1, 1.4], [0.6, 1.6]]); reeds(c, p, [[-0.45, -1.1], [0.55, 0.2], [-0.45, 1.2], [0.55, -1.3]]);
  } },
  { id: 'hashi', name: '溪桥', tags: ['water', 'brook', 'bridge'], foot: { w: 3.2, d: 4.4 }, h: 1.6, kinds: ['wing'], size: 'L', excludes: ['brook'], build(c, p) {
    // a wider stream along z with a crossing: two logs side by side, or a granite slab on two piers (by seed)
    const w = c.w, B = boxOf(w), a = M(ux(p, -0.5)), b = M(ux(p, 0.8));
    brookCells(c, Math.min(a, b), M(p.z - 2.0), Math.max(a, b), M(p.z + 2.0), false);
    rockAt(c, p, 0.15, p.z - 2.0, [[12, 6, 12, 0, 0], [8, 4, 8, 1, -1]], WC.moss); rockAt(c, p, 0.15, p.z + 2.0, [[11, 4, 4, 0, 0]]);
    rockAt(c, p, 1.35, p.z - 1.0, [[5, 7, 8, 0, 0]], WC.moss); rockAt(c, p, -0.95, p.z + 1.2, [[5, 5, 5, 0, 0]]); rockAt(c, p, -0.95, p.z - 1.1, [[4, 4, 4, 0, 0]]);
    const Ua = M(ux(p, -0.9)), Ub = M(ux(p, 1.15)), Zb = M(p.z + 0.3);
    const kind = p.rnd(1);
    if (kind < 0.34) {
      // plank bridge: three boards on two cross-beams, each beam on a pair of stakes driven into the bed, a single rope rail
      for (const ua of [-0.75, 1.0]) { const U = M(ux(p, ua)); for (const dz of [-5, 4]) B(U, -2, Zb + dz, U + 1, 3, Zb + dz + 1, WC.logD); B(U - 1, 4, Zb - 6, U + 2, 5, Zb + 6, WC.logD); }
      for (const [dz, col] of [[-5, WC.woodL], [-1, WC.wood], [3, WC.woodL]] as const) B(Ua, 6, Zb + dz, Ub, 6, Zb + dz + 2, col);
      const Ue = M(ux(p, -0.95)), Uf = M(ux(p, 1.2));
      for (const U of [Ue, Uf]) B(U, -1, Zb + 6, U, 13, Zb + 6, WC.logD);
      B(Math.min(Ue, Uf), 12, Zb + 6, Math.max(Ue, Uf), 12, Zb + 6, WC.rope);
    } else if (kind < 0.67) {
      for (const [ua, za] of [[-0.9, 0], [1.15, 0]] as const) { const U = M(ux(p, ua)); B(U - 3, -1, Zb - 6, U + 3, 1, Zb + 6, WC.rock); B(U - 3, 2, Zb - 6, U + 3, 2, Zb + 6, WC.rockL); void za; }
      for (const dz of [-4, 1]) { B(Ua, 3, Zb + dz, Ub, 6, Zb + dz + 3, WC.log); B(Ua, 7, Zb + dz + 1, Ub, 7, Zb + dz + 2, dz < 0 ? WC.moss : WC.logD); B(Ua, 4, Zb + dz + 1, Ua, 5, Zb + dz + 2, WC.logEnd); B(Ub, 4, Zb + dz + 1, Ub, 5, Zb + dz + 2, WC.logEnd); }
    } else {
      for (const ua of [-0.75, 1.0]) { const U = M(ux(p, ua)); B(U - 3, -1, Zb - 5, U + 3, 3, Zb + 5, WC.rockD); }
      B(Ua, 4, Zb - 5, Ub, 5, Zb + 5, WC.rockT); B(Ua, 4, Zb - 5, Ub, 4, Zb - 5, WC.rock); B(Ua, 4, Zb + 5, Ub, 4, Zb + 5, WC.rock);
    }
    ferns(c, p, [[1.5, 0.3], [1.5, 1.4], [-1.25, -0.2], [-1.2, 0.8]]); reeds(c, p, [[-0.55, -1.4], [0.85, -0.4], [-0.55, 1.5], [0.85, 1.2]]);
  } },
  { id: 'iwaba', name: '岩场', tags: ['rock'], foot: { w: 3.4, d: 3.4 }, h: 2.8, kinds: ['wing', 'corner', 'back'], size: 'L', weight: 1.2, build(c, p) {
    const k = pull(p, 1.9);
    rockAt(c, p, 0.5 + k, p.z - 0.3, [[18, 16, 14, 0, 0], [14, 12, 12, 2, -1], [9, 8, 10, 3, -2]], WC.moss);
    rockAt(c, p, -0.8 + k, p.z + 1.0, [[9, 8, 8, 0, 0], [6, 5, 6, -1, 0]], WC.moss); rockAt(c, p, -0.6 + k, p.z - 1.2, [[7, 6, 5, 0, 0]]);
    ferns(c, p, ([[-1.5, 0.2], [-0.2, 1.4], [1.6, 1.0], [-1.4, -0.9], [0.2, -1.5]] as Array<[number, number]>).map(([u, z]) => [u + k, z] as [number, number]), 0.65);
  } },
  { id: 'sugimura', name: '杉木立', tags: ['tree', 'cedar', 'tall'], foot: { w: 3.6, d: 3.4 }, h: 12, kinds: ['wing', 'back'], size: 'L', build(c, p) {
    cedar(c.w, ux(p, 0.8), p.z - 0.8, 10 + p.rnd(1) * 2, p.seed + 1); cedar(c.w, ux(p, -0.6), p.z + 0.9, 7.6 + p.rnd(2) * 1.6, p.seed + 2);
    rockAt(c, p, -1.0, p.z - 0.9, [[6, 5, 6, 0, 0]], WC.moss);
    ferns(c, p, [[-1.4, -0.2], [0.3, 1.5], [1.5, 0.4], [0.0, -1.4]], 0.6);
  } },
];

// ------------------------------------------------------------------ M
const fruitTree = (c: Ctx, p: Place, pal: Array<[number, number]>) => {
  const col = pal[Math.floor(p.rnd(1) * pal.length) % pal.length];
  oak(c.w, ux(p, 0.2), p.z, 5 + p.rnd(2) * 1.4, { seed: p.seed, bark: 0x3e2a26, dark: 0x281a18, leaf: col[0], leafTop: col[1], low: 0.42, width: 1.0, vines: 0 });
  rockAt(c, p, -0.75, p.z + 0.6, [[5, 4, 5, 0, 0]], WC.moss);
};
const Mg: Group[] = [
  { id: 'takeyabu', name: '竹薮', tags: ['bamboo', 'tall'], foot: { w: 2.4, d: 2.0 }, h: 7.6, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, weight: 1.2, build(c, p) {
    grove(c, Math.min(ux(p, -0.5), ux(p, 0.9)), p.z - 0.8, Math.max(ux(p, -0.5), ux(p, 0.9)), p.z + 0.8, 7, p.seed, [5.4, 7.0]);
    takeStump(c, M(ux(p, -0.9)), M(p.z + 0.5), 6); takeStump(c, M(ux(p, -0.8)), M(p.z - 0.4), 4);
  } },
  { id: 'sugi', name: '杉', tags: ['tree', 'cedar'], foot: { w: 2.4, d: 2.2 }, h: 11.5, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, weight: 1.2, build(c, p) {
    const w = c.w, X = M(p.x), Z = M(p.z), B = boxOf(w);
    cedar(w, p.x, p.z, 9 + p.rnd(1) * 2.5, p.seed + 5);
    if (p.rnd(2) < 0.5) {
      // a sacred cedar: four squat stone posts round it with a straw rope strung between their tops, streamers on the front run
      const R = 14, RZ = 13, H = 10;
      for (const [dx, dz] of [[-R, -RZ], [R, -RZ], [-R, RZ], [R, RZ]]) { B(X + dx - 1, -1, Z + dz - 1, X + dx + 1, H, Z + dz + 1, WC.rock); B(X + dx - 1, H + 1, Z + dz - 1, X + dx + 1, H + 1, Z + dz + 1, WC.rockL); }
      rope(B, X - R + 2, X + R - 2, H - 1, Z + RZ, { thick: 1, tassel: 2 }); B(X - R + 2, H - 1, Z - RZ, X + R - 2, H - 1, Z - RZ, WC.rope);
      B(X - R, H - 1, Z - RZ + 2, X - R, H - 1, Z + RZ - 2, WC.rope); B(X + R, H - 1, Z - RZ + 2, X + R, H - 1, Z + RZ - 2, WC.rope);
    } else { rockAt(c, p, -0.8, p.z + 0.6, [[5, 5, 6, 0, 0]], WC.moss); ferns(c, p, [[-1.0, -0.4], [0.6, 0.9]]); }
  } },
  { id: 'hokora', name: '山中小祠', tags: ['shrine', 'light'], foot: { w: 2.4, d: 2.2 }, h: 1.85, kinds: ['wing', 'back'], size: 'M', build(c, p) {
    const f = frontOf(p.s), w = c.w;
    const cnd = hokora(w, ux(p, 0.35), p.z, f);
    kiTorii(w, ux(p, -0.75), p.z, 1.5, 0.9, f);
    rockAt(c, p, 0.4, p.z + 0.95, [[3, 3, 3, 0, 0]]); rockAt(c, p, 0.9, p.z - 0.8, [[4, 3, 4, 0, 0]], WC.moss);
    if (night(p)) c.light([cnd[0] - sg(p) * 0.4, cnd[1] + 0.1, cnd[2]], 0xffa050, 2.2 * p.lamp, 4);
    foxfire(c, p, [[ux(p, -0.2), 1.1, p.z + 0.7], [ux(p, 0.9), 1.7, p.z - 0.4]], 0.7);
    ferns(c, p, [[1.1, 0.6], [-0.2, -0.9]]);
  } },
  { id: 'iwakura_s', name: '注连石', tags: ['rock', 'shrine', 'light'], foot: { w: 2.6, d: 2.2 }, h: 2.2, kinds: ['wing', 'back'], size: 'M', build(c, p) {
    const B = boxOf(c.w), r = rockAt(c, p, 0.1, p.z - 0.1, [[13, 10, 12, 0, 0], [10, 8, 10, 1, -1], [6, 5, 7, 0, -1]], WC.moss);
    ropeRing(B, r.boxes[1], 17);
    const U = M(ux(p, -0.1)), Zs = M(p.z + 0.9); B(U - 4, -1, Zs - 2, U + 4, 0, Zs + 2, WC.rockT); B(U - 1, 1, Zs - 1, U, 2, Zs, WC.paper);
    rockAt(c, p, -1.0, p.z + 0.7, [[3, 3, 3, 0, 0]]);
    foxfire(c, p, [[ux(p, -0.9), 1.3, p.z + 0.3], [ux(p, 0.8), 2.5, p.z + 0.5]], 0.8);
    ferns(c, p, [[1.1, 0.7], [-1.0, -0.6]]);
  } },
  { id: 'ishidan', name: '石段', tags: ['stairs', 'rock'], foot: { w: 3.0, d: 2.2 }, h: 1.9, kinds: ['wing', 'back'], size: 'M', build(c, p) {
    // an earth bank faced with rock, three stone steps climbing it away from the floor, a stone marker on top
    const w = c.w, B = boxOf(w), s = sg(p), Z = M(p.z), u = (m: number) => M(ux(p, m));
    B(u(0.2), -1, Z - 14, u(1.4), 13, Z + 14, WC.earth); B(u(0.2), 14, Z - 14, u(1.4), 14, Z + 14, WC.moss);
    B(u(0.2), -1, Z - 14, u(0.2), 6, Z + 14, WC.rock); B(u(0.2), -1, Z - 14, u(1.4), 4, Z - 14, WC.rockD); B(u(0.2), -1, Z + 14, u(1.4), 4, Z + 14, WC.rockD);
    [[-1.35, -0.85, 4], [-0.85, -0.35, 8], [-0.35, 0.2, 12]].forEach(([a, b, t]) => { B(u(a), -1, Z - 6, u(b), t - 1, Z + 6, WC.rockD); B(u(a), t, Z - 6, u(b), t, Z + 6, WC.rockT); });
    B(u(0.2), 14, Z - 6, u(0.5), 14, Z + 6, WC.rockT);
    const P = u(0.95); B(P - 3, 15, Z - 3, P + 3, 25, Z + 3, WC.rock); B(P - 2, 26, Z - 2, P + 2, 26, Z + 2, WC.rockL); B(P - 3 * s, 18, Z - 2, P - 3 * s, 23, Z + 1, WC.rockD);
    ferns(c, p, [[-0.6, 0.9], [-0.9, -0.85], [1.55, 0.6]]);
  } },
  { id: 'kareki', name: '枯杉', tags: ['tree', 'dead'], foot: { w: 2.2, d: 2.2 }, h: 6.5, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    snag(c.w, ux(p, 0.2), p.z, 4.6 + p.rnd(1) * 1.6, WC.bark, WC.barkD, { seed: p.seed });
    rockAt(c, p, -0.75, p.z + 0.65, [[4, 4, 4, 0, 0]], WC.moss);
    card(c, p, 'fungus', -0.3, p.z + 0.4, 0.5, 0xffffff); ferns(c, p, [[-0.7, -0.6], [0.9, 0.8]]);
  } },
  { id: 'momiji', name: '山红叶', tags: ['tree', 'maple'], foot: { w: 2.2, d: 2.2 }, h: 7, kinds: ['wing', 'back', 'corner'], size: 'M', seasons: ['autumn'], weight: 1.6, build(c, p) { fruitTree(c, p, MAPLE_BY.autumn); } },
  { id: 'yamazakura', name: '山樱', tags: ['tree', 'sakura'], foot: { w: 2.2, d: 2.2 }, h: 7, kinds: ['wing', 'back', 'corner'], size: 'M', seasons: ['spring'], weight: 1.6, build(c, p) { fruitTree(c, p, SAKURA); } },
];

// ------------------------------------------------------------------ S (≤ 1.6 m: the near rows and the small back slot)
const Sg: Group[] = [
  { id: 'taoreki', name: '倒木', tags: ['log', 'low'], foot: { w: 2.4, d: 1.2 }, h: 0.85, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
    // a fallen trunk lying toward the floor: square section, a moss back, a cut end with rings, a broken end in two steps, shelf fungi
    const w = c.w, B = boxOf(w), s = sg(p), X = M(p.x), Z = M(p.z), a = X - 15 * s, b = X + 15 * s;
    B(a, -1, Z - 4, b, 6, Z + 3, WC.log); B(X - 10 * s, 7, Z - 3, X + 8 * s, 7, Z + 2, WC.moss);
    B(a, 0, Z - 3, a, 5, Z + 2, WC.logEnd); B(a, 2, Z - 1, a, 3, Z, WC.logRing);
    B(b, 3, Z - 4, X + 12 * s, 6, Z + 3, null); B(b, 0, Z - 4, b, 2, Z + 3, WC.logD);
    B(X + 4 * s, 7, Z - 1, X + 5 * s, 11, Z, WC.logD);
    B(X - 4 * s, 3, Z + 4, X - 2 * s, 3, Z + 5, 0xc8a868); B(X + 3 * s, 2, Z + 4, X + 6 * s, 2, Z + 5, 0xb89858);
    card(c, p, 'fungus', -0.6, p.z + 0.45, 0.45, 0xffffff); ferns(c, p, [[0.9, -0.55], [-1.0, -0.5]], 0.5);
  } },
  { id: 'kokeishi', name: '苔石', tags: ['rock', 'low'], foot: { w: 2.2, d: 1.8 }, h: 0.95, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
    const w = c.w, X = M(p.x), Z = M(p.z);
    w.box(X - 15, -1, Z - 11, X + 15, -1, Z + 11, WC.moss).box(X - 10, -1, Z - 7, X + 12, -1, Z + 8, WC.mossL);
    rockAt(c, p, 0.2, p.z - 0.2, [[9, 7, 7, 0, 0], [6, 5, 4, 1, 0]], WC.mossL); rockAt(c, p, -0.7, p.z + 0.5, [[5, 5, 4, 0, 0]], WC.moss); rockAt(c, p, 0.75, p.z + 0.6, [[4, 3, 3, 0, 0]]);
    ferns(c, p, [[-0.9, -0.5], [0.9, -0.6], [0.0, 0.8]], 0.5);
  } },
  { id: 'kirikabu', name: '竹的切口', tags: ['bamboo', 'low'], foot: { w: 2.0, d: 1.6 }, h: 0.65, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a woodcutter's leavings: cut culms in two rows, a bundle of poles tied with straw rope
    for (const [u, z, h] of [[-0.75, -0.4, 8], [-0.5, 0.1, 5], [-0.8, 0.45, 6], [-0.25, -0.5, 4], [-0.2, 0.55, 7]] as const) takeStump(c, M(ux(p, u)), M(p.z + z), h);
    const X = M(ux(p, 0.45)), Z0 = M(p.z - 0.7), Z1 = M(p.z + 0.7), B = boxOf(c.w);
    for (const [dx, y] of [[-2, 0], [0, 0], [2, 0], [-1, 2], [1, 2]]) takeLying(c, X + dx, y, Z0, Z1);
    for (const zz of [Z0 + 4, Z1 - 4]) B(X - 3, 0, zz, X + 4, 4, zz, WC.rope);
  } },
  { id: 'tobiishi', name: '飞石小溪', tags: ['water', 'rill', 'low'], foot: { w: 2.4, d: 1.8 }, h: 0.25, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a rill a hand deep running out of the wood and under a flat stone; three stepping stones cross it
    const B = boxOf(c.w), a = M(ux(p, -0.95)), b = M(ux(p, 1.15)), Z = M(p.z);
    brookCells(c, Math.min(a, b), Z - 3, Math.max(a, b), Z + 3, true);
    rockAt(c, p, -1.05, p.z, [[3, 6, 2, 0, 0]]); rockAt(c, p, 1.1, p.z, [[3, 7, 3, 0, 0]], WC.moss);
    for (const [u, dz] of [[-0.15, -9], [-0.1, 0], [0.0, 9]] as const) { const U = M(ux(p, u)); B(U - 3, -1, Z + dz - 2, U + 3, 0, Z + dz + 2, WC.rockT); }
    reeds(c, p, [[0.6, -0.35], [-0.6, 0.35], [0.35, 0.35]]); ferns(c, p, [[1.0, 0.6], [-0.8, -0.6]], 0.5);
  } },
  { id: 'dosojin', name: '道祖神', tags: ['stone', 'shrine', 'low'], foot: { w: 1.6, d: 1.4 }, h: 1.2, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    const B = boxOf(c.w), X = M(p.x), Z = M(p.z);
    B(X - 7, -1, Z - 6, X + 7, 1, Z + 6, WC.rockD); B(X - 6, 2, Z - 5, X + 6, 2, Z + 5, WC.rockL);
    B(X - 4, 3, Z - 2, X + 4, 13, Z + 2, WC.rock); B(X - 3, 14, Z - 2, X + 3, 15, Z + 2, WC.rock); B(X - 2, 16, Z - 1, X + 2, 16, Z + 1, WC.rockL);
    B(X - 3, 6, Z + 3, X + 3, 12, Z + 3, WC.rockD); B(X - 2, 7, Z + 3, X - 1, 11, Z + 3, WC.rockT); B(X + 1, 7, Z + 3, X + 2, 11, Z + 3, WC.rockT);
    B(X - 5, 12, Z - 3, X + 5, 12, Z + 3, WC.rope); B(X + 2, 9, Z + 3, X + 3, 11, Z + 3, WC.paper);
    B(X - 1, 2, Z + 4, X + 1, 3, Z + 5, TC.vermD);
    const sx = M(ux(p, 0.55)); B(sx - 3, -1, Z - 2, sx + 3, 1, Z + 2, WC.rock); B(sx - 2, 2, Z - 1, sx + 2, 3, Z + 1, WC.rockL); B(sx - 1, 4, Z - 1, sx + 1, 5, Z, WC.rock);
    ferns(c, p, [[-0.6, -0.45], [0.5, 0.5]], 0.45);
  } },
  { id: 'kitsunebi', name: '狐火', tags: ['shrine', 'light', 'low'], foot: { w: 1.8, d: 1.6 }, h: 0.7, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a cairn of three flat stones and fox fire hovering over it in a ring
    const B = boxOf(c.w), X = M(p.x), Z = M(p.z);
    B(X - 7, -1, Z - 6, X + 7, 2, Z + 6, WC.rockD); B(X - 5, 3, Z - 4, X + 5, 5, Z + 4, WC.rock); B(X - 3, 6, Z - 3, X + 3, 8, Z + 2, WC.rockL); B(X - 1, 9, Z - 1, X + 1, 9, Z + 1, WC.rockT);
    rockAt(c, p, 0.65, p.z + 0.45, [[3, 3, 2, 0, 0]]); rockAt(c, p, -0.6, p.z - 0.5, [[3, 2, 2, 0, 0]], WC.moss);
    foxfire(c, p, [[p.x, 1.25, p.z], [p.x - 0.45, 0.95, p.z + 0.3], [p.x + 0.45, 1.05, p.z - 0.25], [p.x + 0.1, 0.85, p.z + 0.5]], 1.1);
    ferns(c, p, [[-0.7, 0.5], [0.7, -0.5]], 0.45);
  } },
  { id: 'shida', name: '蕨岩', tags: ['rock', 'fern', 'low'], foot: { w: 2.4, d: 1.6 }, h: 0.75, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    rockAt(c, p, 0.2, p.z - 0.1, [[16, 6, 5, 0, 0], [11, 4, 3, -2, 0]], WC.moss);
    stump(c.w, ux(p, -0.8), p.z + 0.3, 4, 8, WC.bark, WC.logEnd);
    ferns(c, p, [[-0.3, 0.55], [0.4, 0.6], [1.0, 0.5], [-1.0, -0.4], [0.9, -0.6], [-0.2, -0.6], [-0.6, 0.6]], 0.55);
  } },
];

export const GROUPS: Group[] = [...L, ...Mg, ...Sg];
export const FILLER: Group[] = [
  { id: 'f_rock', name: '石', tags: ['rock'], foot: { w: 1.0, d: 1.0 }, h: 0.6, kinds: ['wing'], size: 'S', max: 3, build(c, p) { rockAt(c, p, 0, p.z, [[4 + Math.floor(p.rnd(1) * 3), 4, 4 + Math.floor(p.rnd(2) * 3), 0, 0]], p.rnd(3) < 0.6 ? WC.moss : undefined); ferns(c, p, [[0.4, 0.3]], 0.45); } },
  { id: 'f_take', name: '竹桩', tags: ['bamboo'], foot: { w: 0.8, d: 0.8 }, h: 0.6, kinds: ['wing'], size: 'S', max: 2, build(c, p) { takeStump(c, M(p.x), M(p.z), 6 + Math.floor(p.rnd(1) * 3)); takeStump(c, M(p.x) + 3, M(p.z) + 2, 4); } },
  { id: 'f_fern', name: '蕨', tags: ['fern'], foot: { w: 0.9, d: 0.9 }, h: 0.3, kinds: ['wing'], size: 'S', max: 3, build(c, p) { rockAt(c, p, 0, p.z, [[3, 3, 3, 0, 0]], WC.moss); ferns(c, p, [[0.3, 0.2], [-0.3, 0.25], [0, -0.3]], 0.55); } },
];
void frame;
