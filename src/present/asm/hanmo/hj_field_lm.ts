// 麦田的地标（hj_field 代理）：粮仓（仓 + 两座囷）、水碓（渠上的水轮 + 碓房）、社树（社坛上的老槐）。都面朝 +z，锚点在中心；
// 正中 ±1.4 m 留门洞 / 平桥，后出口的路能走进去。
import { M } from '../../scenes/props';
import { oak } from '../../scenes/flora';
import type { Landmark } from '../types';
import { HC, ELM, WATER_MARK, frame, octo, thatch, rammed, rick, sack, jar, headband, wheelV, lit, ring } from './hj_field_kit';

export const LANDMARKS: Landmark[] = [
  { id: 'liangcang', name: '粮仓', foot: { w: 9.6, d: 5.6 }, tags: ['building'], build(c, p) {
    // the granary on a stone plinth: plastered walls between timber posts, high barred vents, the door broken open, a three-slab thatch;
    // a round grain bin (囷) either side with its own stepped cap
    const B = frame(c.w, p.x, p.z), hw = 30, hd = 18, H = 34;
    B(-hw - 2, -1, -hd - 2, hw + 2, 3, hd + 2, HC.stoneD); ring(B, -hw - 2, -hd - 2, hw + 2, hd + 2, 3, HC.stone);
    B(-hw, 4, -hd, hw, H, hd, HC.mud); B(-hw + 3, 4, -hd + 3, hw - 3, H - 1, hd - 3, null);
    for (const a of [-hw, -10, 10, hw - 2]) { B(a, 4, hd, a + 2, H, hd + 1, HC.post); B(a, 4, -hd - 1, a + 2, H, -hd, HC.post); }
    ring(B, -hw - 1, -hd - 1, hw + 1, hd + 1, H + 1, HC.woodD);
    for (const a of [-22, 14]) { B(a, 24, hd + 1, a + 7, 29, hd + 1, HC.dark); for (const u of [a + 2, a + 5]) B(u, 24, hd + 2, u, 29, hd + 2, HC.woodL); }
    B(-7, 4, hd - 2, 7, 24, hd + 1, HC.dark); B(-8, 25, hd + 1, 8, 26, hd + 2, HC.woodD);
    B(-7, 4, hd + 2, -1, 22, hd + 2, HC.plank); B(-4, 4, hd + 2, -4, 22, hd + 2, HC.woodD); B(2, -1, hd + 4, 8, 1, hd + 9, HC.plank);
    B(-9, -1, hd + 3, 9, 3, hd + 7, HC.stone);
    thatch(B, -hw - 7, hw + 7, -hd - 7, hd + 7, H + 2, [[0, 6], [8, 6], [8, 5]]);
    for (const s of [-1, 1]) {
      const a = s * 50;
      octo(B, a, 0, 12, 5, -1, 2, HC.stoneD);
      octo(B, a, 0, 11, 4, 3, 26, HC.mud); B(a - 11, 12, -4, a + 11, 12, 4, HC.mudD); B(a - 4, 12, -11, a + 4, 12, 11, HC.mudD);
      octo(B, a, 0, 14, 6, 27, 31, HC.th); octo(B, a, 0, 9, 4, 32, 35, HC.th); octo(B, a, 0, 4, 2, 36, 38, HC.thD);
      B(a - 3, 6, 11, a + 3, 14, 11, HC.woodD);
    }
    sack(B, -14, hd + 10, HC.hemp, true); sack(B, 13, hd + 12); sack(B, 18, hd + 10, HC.hempD); B(10, -1, hd + 14, 22, -1, hd + 17, HC.straw);
    headband(B, -20, hd + 14);
    if (lit(p)) c.light([p.x, 1.2, p.z + 1.7], 0xffa050, 1.6 * p.lamp, 4.5);
  } },
  { id: 'shuidui', name: '水碓', foot: { w: 9.6, d: 5.6 }, tags: ['water', 'building'], build(c, p) {
    // the water-powered trip hammers: a ditch across the front (a flush plank bridge where the path crosses), the wheel standing in it,
    // its axle into the open shed behind, where the hammer beams rest over stone mortars; a straw rick on the other side
    const B = frame(c.w, p.x, p.z), X = M(p.x), Z = M(p.z);
    B(-66, -1, 27, 66, -1, 33, WATER_MARK);
    for (const z0 of [24, 34]) { B(-66, -1, z0, -20, 0, z0 + 1, HC.stoneD); B(20, -1, z0, 66, 0, z0 + 1, HC.stoneD); }
    B(-18, 0, 23, 18, 0, 36, HC.plank); for (let u = -18; u <= 18; u += 6) B(u, 0, 23, u, 0, 36, HC.woodD);
    // the shed: six posts, the thatch, the hammers inside
    const sx = 30;
    for (const a of [sx - 26, sx, sx + 26]) for (const b of [-16, 10]) B(a - 1, -1, b - 1, a + 1, 30, b + 1, HC.post);
    thatch(B, sx - 32, sx + 32, -22, 16, 31, [[0, 5], [7, 5], [6, 4]]);
    B(sx - 26, -1, -16, sx + 26, -1, 10, HC.earthD);
    for (const a of [sx - 14, sx, sx + 14]) {
      B(a - 3, -1, -8, a + 3, 2, -2, HC.stone); B(a - 1, 2, -6, a + 1, 2, -4, HC.dark);
      B(a - 1, 4, -5, a + 1, 13, -5, HC.woodD); B(a - 1, 9, -5, a + 1, 10, 6, HC.wood); B(a - 2, 3, -7, a + 2, 8, -3, HC.stoneD);
    }
    B(sx - 26, 10, 7, sx + 26, 11, 9, HC.wood);
    // the wheel in the ditch (faces the camera), its axle back into the shed on two stone piers
    const wx = X + 34, wz = Z + 30;
    for (const dz of [-5, 5]) c.w.box(wx - 2, -2, wz + dz - 1, wx + 2, 18, wz + dz + 1, HC.stoneD);
    c.w.box(wx - 1, 19, wz - 22, wx + 1, 21, wz + 6, HC.iron);
    wheelV(c.w, wx, 20, wz - 1, 20, 'z', HC.woodD, HC.wood, HC.iron, 3, 3);
    // the other side: a straw rick and sacks of grain waiting
    rick(frame(c.w, p.x - 2.6, p.z - 0.6), 0, 0, 22, 12, 34);
    sack(B, -12, 14); sack(B, -6, 15, HC.hempD); sack(B, -10, 19, HC.hemp, true);
    if (lit(p)) c.light([p.x + 2.1, 1.0, p.z + 0.3], 0xffa050, 1.4 * p.lamp, 4);
  } },
  { id: 'sheshu', name: '社树', foot: { w: 8.4, d: 5.2 }, tags: ['tree', 'shrine'], build(c, p) {
    // the village god's tree: an old locust behind a two-tier rammed-earth altar, the stone 社主 on top, offering jars, a low stake fence;
    // a Yellow Turban banner thrown down across the altar steps
    const B = frame(c.w, p.x, p.z), col = ELM[p.season][0];
    oak(c.w, p.x, p.z - 1.3, 8.6 + p.rnd(1) * 1.2, { seed: p.seed, bark: 0x4a3a2c, dark: 0x30241c, leaf: col[0], leafTop: col[1], low: 0.4, width: 1.3, vines: 0 });
    rammed(B, -30, -1, -2, 30, 4, 30); rammed(B, -20, 5, 4, 20, 9, 24);
    B(-6, -1, 31, 6, 2, 34, HC.ramD);
    B(-3, 10, 12, 3, 22, 16, HC.stone); B(-2, 23, 13, 2, 24, 15, HC.stoneL);
    jar(B, -12, 18, 3, HC.pot, 10); jar(B, 12, 18, 3, HC.grey, 10); B(-6, 10, 19, 6, 11, 21, HC.woodD);
    for (let a = -34; a <= 34; a += 6) { if (Math.abs(a) < 12) continue; B(a, -1, 34, a + 1, 9, 35, HC.post); }
    B(-34, 7, 35, -12, 7, 35, HC.rope); B(12, 7, 35, 34, 7, 35, HC.rope);
    B(8, 5, 26, 24, 5, 32, HC.yellow); B(8, 5, 26, 24, 5, 26, HC.yellowD); B(6, 0, 30, 30, 1, 31, HC.woodD);
    if (lit(p)) { B(0, 12, 20, 0, 12, 20, HC.emberL, 1); c.light([p.x, 1.1, p.z + 1.5], 0xffa050, 1.6 * p.lamp, 4.5); }
  } },
];
