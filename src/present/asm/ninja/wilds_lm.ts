// 竹山的地标（wilds 代理）：瀑布、磐座（注连绳巨石）、山道石阶。都面朝 +z（战斗区），锚点在中心。
// 走道约束：地标前沿中间 ±1.4 m 内，高于地面的格子只到锚点前 1.4 m；其他地方只到锚点前 2.1 m（offset 构图的横向参道在那里）。
import type { Ctx } from '../../scenes/stage';
import { M } from '../../scenes/props';
import { lift } from '../../scenes/k_forest';
import type { Landmark, Place } from '../types';
import { WC, boxOf, crag, rope, ropeRing, kiTorii, hokora, cedar, foxfire, brookCells } from './wilds_kit';

const night = (p: Place) => p.lamp > 0.3;

export const LANDMARKS: Landmark[] = [
  { id: 'taki', name: '瀑布', foot: { w: 9.6, d: 5.6 }, tags: ['water', 'rock'], build(c, p) {
    // a three-tier rock cliff; the stream runs over the top tier, down its face, across the first tier and falls into a pool between
    // two buttresses; a sacred rope hangs across the fall
    const w = c.w, U = M(p.x), V = M(p.z), B = boxOf(w);
    B(U - 64, -1, V - 40, U + 64, 51, V - 14, WC.rock); B(U - 64, 52, V - 40, U + 64, 52, V - 14, WC.rockL);
    B(U - 60, 53, V - 24, U - 12, 53, V - 16, WC.moss); B(U + 12, 53, V - 24, U + 60, 53, V - 16, WC.moss);
    B(U - 50, 53, V - 40, U + 46, 76, V - 26, WC.rock); B(U - 50, 77, V - 40, U + 46, 77, V - 26, WC.rockL); B(U - 46, 78, V - 38, U - 12, 78, V - 30, WC.moss);
    B(U - 28, 78, V - 40, U + 30, 92, V - 33, WC.rockD); B(U - 28, 93, V - 40, U + 30, 93, V - 33, WC.rockL);
    // the dark lower band of the cliff (wet rock), a seam either side of the fall
    B(U - 64, -1, V - 15, U + 64, 6, V - 14, WC.rockD);
    B(U - 14, 8, V - 15, U - 13, 50, V - 15, WC.rockD); B(U + 13, 12, V - 15, U + 14, 50, V - 15, WC.rockD);
    // the water: a sheet on the upper face, the channel over tier one, the fall, the foam at its foot
    B(U - 6, 53, V - 25, U + 6, 76, V - 25, WC.water); B(U - 7, 52, V - 25, U + 7, 53, V - 14, WC.water);
    B(U - 7, 0, V - 13, U + 7, 53, V - 12, WC.water);
    B(U - 4, 2, V - 11, U - 3, 51, V - 11, WC.waterL); B(U + 2, 6, V - 11, U + 3, 49, V - 11, WC.waterL); B(U - 2, 54, V - 24, U - 1, 75, V - 24, WC.waterL);
    B(U - 11, 0, V - 12, U + 11, 2, V - 6, WC.foam); B(U - 8, 3, V - 11, U + 8, 4, V - 8, WC.foam);
    // the buttresses that hold the pool
    crag(B, U - 44, V - 6, [[20, 8, 18, 0, 0], [13, 6, 10, -3, -1]], WC.moss);
    crag(B, U + 42, V - 4, [[22, 10, 24, 0, 0], [15, 7, 12, 2, -2], [8, 4, 8, 4, -3]], WC.moss);
    // the pool and its rim of low stones (cells at y 0..1 only in front: the walkway ends here)
    brookCells(c, U - 22, V - 11, U + 18, V + 12);
    for (const [u0, u1, v0, v1] of [[-24, -14, 13, 17], [-10, -2, 14, 18], [3, 12, 13, 17], [14, 20, 10, 15]]) B(U + u0, -1, V + v0, U + u1, 0, V + v1, WC.rock), B(U + u0 + 1, 1, V + v0 + 1, U + u1 - 1, 1, V + v1 - 1, WC.rockL);
    crag(B, U - 12, V + 2, [[5, 4, 4, 0, 0]], undefined); crag(B, U + 9, V - 2, [[4, 3, 3, 0, 0]]);
    // the rope across the fall, tied into the rock either side
    rope(B, U - 16, U + 16, 44, V - 11, { tassel: 4 }); B(U - 16, 44, V - 13, U - 15, 45, V - 12, WC.rope); B(U + 15, 44, V - 13, U + 16, 45, V - 12, WC.rope);
    c.ambient({ kind: 'dust', color: 0xeaf6f8, rate: 3.5, area: { x0: p.x - 1.6, z0: p.z - 1.0, x1: p.x + 1.4, z1: p.z + 0.8 }, y: [0.1, 1.6] });
    if (night(p)) c.light([p.x, 1.2, p.z + 0.2], 0xb8d0e8, 2.2 * p.lamp, 5);
  } },
  { id: 'iwakura', name: '磐座', foot: { w: 9.6, d: 5.2 }, tags: ['rock', 'shrine'], build(c, p) {
    // a great stacked boulder bound with a straw rope and its smaller partner joined to it by a second rope; a plain wooden torii in
    // front, an offering slab, a little shrine at the partner's foot, two cedars behind, fox fire round the rock at night
    const w = c.w, U = M(p.x), V = M(p.z), B = boxOf(w);
    const big = crag(B, U + 10, V - 14, [[36, 22, 28, 0, 0], [30, 19, 24, -2, -2], [22, 15, 18, 2, -3], [13, 9, 10, 0, -4]], WC.moss);
    crag(B, U - 52, V - 10, [[16, 14, 20, 0, 0], [11, 10, 14, 1, -1]], WC.moss);
    ropeRing(B, big.boxes[1], 40); ropeRing(B, big.boxes[0], 20);
    rope(B, U - 40, U - 24, 22, V + 3, { tassel: 4, thick: 2 });
    cedar(w, p.x - 2.0, p.z - 2.2, 10 + p.rnd(1) * 1.5, p.seed + 1); cedar(w, p.x + 3.7, p.z - 2.0, 9 + p.rnd(2) * 1.5, p.seed + 2);
    kiTorii(w, p.x + 0.7, p.z + 1.15, 2.6, 2.0, 'z+');
    B(U + 2, -1, V + 9, U + 18, 1, V + 13, WC.rockT); B(U + 6, 2, V + 10, U + 7, 3, V + 11, WC.paper); B(U + 12, 2, V + 10, U + 13, 3, V + 11, WC.paper);
    const cnd = hokora(w, p.x - 3.65, p.z + 1.0, 'z+');
    if (night(p)) c.light([cnd[0], cnd[1] + 0.1, cnd[2] + 0.4], 0xffa050, 2.2 * p.lamp, 4);
    foxfire(c, p, [[p.x - 1.5, 2.0, p.z + 0.9], [p.x + 3.2, 3.1, p.z + 0.4], [p.x + 0.5, 4.6, p.z - 0.2]], 1.2);
  } },
  { id: 'sando', name: '山道石阶', foot: { w: 9.6, d: 4.4 }, tags: ['rock', 'stairs', 'shrine'], build(c, p) {
    // a rock terrace across the back with three big stone steps cut into it, an old wooden torii on the landing and a shrine behind it,
    // framed by two higher rock blocks with cedars rising out of them
    const w = c.w, U = M(p.x), V = M(p.z), B = boxOf(w), up = lift(w, 20);
    B(U - 66, -1, V - 46, U + 66, 18, V - 4, WC.rock); B(U - 66, 19, V - 46, U + 66, 19, V - 4, WC.rockL);
    B(U - 66, -1, V - 5, U + 66, 5, V - 4, WC.rockD);
    for (const [u0, u1, h] of [[-62, -40, 11], [-34, -20, 7], [22, 34, 9], [40, 60, 14]]) B(U + u0, -1, V - 3, U + u1, h, V - 1, WC.rock), B(U + u0, h + 1, V - 3, U + u1, h + 1, V - 1, WC.rockL);
    B(U - 60, 20, V - 16, U - 14, 20, V - 6, WC.moss); B(U + 14, 20, V - 18, U + 62, 20, V - 6, WC.moss);
    // the stair: a notch in the terrace filled with three steps (moss on their left thirds), the lowest standing proud of the face
    B(U - 12, 0, V - 16, U + 12, 19, V - 4, null);
    [[-4, 1, 4], [-10, -5, 9], [-16, -11, 14]].forEach(([v0, v1, t]) => { B(U - 12, -1, V + v0, U + 12, t - 1, V + v1, WC.rockD); B(U - 12, t, V + v0, U + 12, t, V + v1, WC.rockT); B(U - 12, t, V + v0, U - 6, t, V + v1, WC.mossL); });
    B(U - 13, -1, V - 16, U - 13, 19, V + 1, WC.rockD); B(U + 13, -1, V - 16, U + 13, 19, V + 1, WC.rockD);
    // the higher blocks either side, cedars out of them
    B(U - 66, 20, V - 46, U - 18, 40, V - 24, WC.rock); B(U - 66, 41, V - 46, U - 18, 41, V - 24, WC.rockL); B(U - 60, 42, V - 36, U - 24, 42, V - 28, WC.moss);
    B(U + 18, 20, V - 46, U + 66, 44, V - 22, WC.rock); B(U + 18, 45, V - 46, U + 66, 45, V - 22, WC.rockL); B(U + 24, 46, V - 36, U + 60, 46, V - 26, WC.moss);
    cedar(w, p.x - 3.0, p.z - 2.3, 10.5 + p.rnd(1) * 1.5, p.seed + 3); cedar(w, p.x + 3.0, p.z - 2.2, 11 + p.rnd(2) * 1.5, p.seed + 4);
    kiTorii(up, p.x, p.z - 1.45, 2.4, 1.6, 'z+');
    const cnd = hokora(up, p.x, p.z - 2.5, 'z+');
    rope(B, U - 18, U - 14, 30, V - 24); rope(B, U + 14, U + 18, 32, V - 22);
    if (night(p)) c.light([cnd[0], cnd[1] + 1.5, cnd[2] + 0.4], 0xffa050, 2.4 * p.lamp, 5);
    foxfire(c, p, [[p.x - 0.6, 2.4, p.z - 1.0], [p.x + 0.7, 2.2, p.z - 1.2]], 0.8);
  } },
];
