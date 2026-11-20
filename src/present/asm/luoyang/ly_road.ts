// 第二关 · 洛阳余烬 · 铜驼道（ly_road）（11-18）：董卓焚城后的宫门御道。正中一条长条石板御道直通后方，两边是烧黑的方砖场；
// 两翼宫墙一截截断开、焦柱、铜驼、石兽、残碑、华表、钟架。地标三选一：塌了一半的宫阙门楼（御道穿过门洞）/ 一对铜驼（隔着御道
// 相对）/ 断阙台（一座阙还立着、一座塌成半截）。远景：外宫墙（几处豁口）、墙后烧剩的殿台骨架、两侧焦树、几柱烟。
// 主色：焦砖灰、烧黑的木、剥落的暗朱、铜绿；火是暖色的点。和黄巾残村（黄土、茅草）一眼分开。
import { burntInfill } from './ly_infill';
import type { Ctx } from '../../scenes/stage';
import { M, SX, SZ } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import type { Landmark, Layout, Locale, Place } from '../types';
import { LY, frame, up, wp, fireLight, smoke, shell, hanRoof, palaceWall, charPost, rubble, emberHeap, fireBasin, camel, lyQue, earthWall, beamDown, charTree } from './ly_kit';
import { commonGroups, commonFiller, lyFloor, lyDress, lyFlankRuins } from './ly_common';
import { ROAD_GROUPS } from './ly_road_props';

/** a lit basin at local (x, z) of a landmark built with frame(p.x, p.z, 0), its light and (sometimes) smoke */
function basin(c: Ctx, p: Place, B: ReturnType<typeof frame>, x: number, z: number, h = 10) {
  const lit = p.time !== 'day' || p.rnd(x + 7) < 0.6, f = fireBasin(B, x, z, lit, h);
  if (lit) fireLight(c, p, wp(p, 0, f[0], f[1] + 3, f[2]), 1, 6);
}

// ------------------------------------------------------------------ landmarks (back centre; the 御道 runs into them)
const LANDMARKS: Landmark[] = [
  { id: 'ly_quemen', name: '宫阙门楼', foot: { w: 10.8, d: 5.8 }, tags: ['gate', 'tall', 'palace'], build(c, p) {
    // a brick-faced gate platform the 御道 runs through (the gate passage dark, one door leaf burnt away); on top the timber gate
    // hall, its left half still under its roof, the right half fallen in: snapped posts, a heap of tile and beams, embers smoking
    const B = frame(c.w, p.x, p.z, 0), U = up(B, 31), lit = p.time !== 'day' || p.rnd(1) < 0.7;
    shell(B, -72, -1, -28, 72, 30, 16, LY.brick, LY.brickL);
    B(-13, 0, -28, 13, 24, 16, null);
    for (const s of [-1, 1]) { const a = s * 14, b = s * 15; B(Math.min(a, b), 0, -26, Math.max(a, b), 29, 14, LY.charL); }
    for (const [a, b] of [[-72, -14], [14, 72]] as const) {
      B(a, -1, 16, b, 2, 16, LY.stoneD);
      for (let y = 6; y <= 22; y += 4) B(a, y, 16, b, y, 16, LY.brickD);
      B(a, 24, 16, b, 27, 16, LY.charL); B(a, 28, 16, b, 29, 16, LY.char);
      B(a, 30, 15, b, 30, 16, LY.char);
    }
    B(-15, 25, 16, 15, 26, 16, LY.char);
    B(-13, 0, -24, -1, 22, -24, LY.char); B(-13, 0, -24, -13, 22, -24, LY.charD); B(1, 0, -20, 13, 1, -10, LY.charL);
    // the standing half: posts front and back, the back wall (earth, red plaster low down), beams and the roof cut off at x = 0
    for (const x of [-62, -40, -18]) { charPost(U, x, 8, 31, { charAt: 6 }); charPost(U, x, -20, 31, { charAt: 6 }); }
    U(-64, 3, -23, -4, 27, -21, LY.earth); U(-64, 3, -20, -4, 12, -20, LY.red); U(-64, 3, -20, -4, 4, -20, LY.redD); U(-64, 22, -20, -4, 27, -20, LY.charL);
    U(-66, 32, 6, -2, 34, 10, LY.char); U(-66, 32, -22, -2, 34, -18, LY.char); U(-66, 33, 10, -2, 33, 10, LY.charL);
    hanRoof(U, -78, 0, -30, 18, 35, [[0, 3], [6, 3], [6, 3]], 1, { cut1: true });
    // the fallen half
    charPost(U, 18, 8, 16, { broken: true }); charPost(U, 40, -20, 24, { broken: true }); charPost(U, 62, 8, 10, { broken: true });
    U(4, 0, -2, 30, 1, 12, LY.tile); for (let x = 6; x <= 28; x += 4) U(x, 1, -2, x, 1, 12, LY.tileL); U(4, 0, 12, 30, 0, 12, LY.tileD);
    rubble(U, 46, -6, 16, 9, 3, { beam: true }); beamDown(U, 8, 40, -16);
    const e = emberHeap(U, 58, 4, lit), q = wp(p, 0, e[0], e[1] + 31, e[2]);
    if (lit) fireLight(c, p, q, 1.2, 7);
    smoke(c, [q[0], q[1] + 0.3, q[2]], { rate: 2.2, col: 0x55504b });
    rubble(B, 46, 22, 14, 5, 2);
    for (const s of [-1, 1]) basin(c, p, B, s * 26, 24);
  } },
  { id: 'ly_tuopair', name: '铜驼', foot: { w: 10.0, d: 5.4 }, tags: ['bronze', 'camel', 'palace'], build(c, p) {
    // the pair of bronze camels that gave 铜驼街 its name, on tall stone pedestals facing each other across the 御道; behind them the
    // palace wall with the road's gap in it, charred posts where its gate stood; one camel has lost its head to the looters
    const B = frame(c.w, p.x, p.z, 0);
    palaceWall(B, -70, -17, -30, -24, 44, { drops: [[-70, -54, 28]], seed: p.seed });
    palaceWall(B, 17, 70, -30, -24, 44, { drops: [[52, 70, 30]], seed: p.seed + 3 });
    charPost(B, -13, -27, 44, { charAt: 12 }); charPost(B, 13, -27, 28, { broken: true });
    for (const s of [-1, 1] as const) {
      const C = frame(c.w, p.x + s * 36 * CELL, p.z, s < 0 ? 1 : 3);
      C(-11, -1, -22, 11, 9, 16, LY.stoneD); C(-10, 10, -21, 10, 10, 15, LY.stone); C(-11, 4, -22, 11, 4, 16, LY.stoneDD);
      camel(up(C, 11), 0, -2, { broken: s > 0 });
      basin(c, p, B, s * 36, 22);
    }
    rubble(B, 54, 12, 9, 4, 2); rubble(B, -52, -16, 8, 4, 1);
    const q = wp(p, 0, 60, 30, -27); smoke(c, q, { rate: 1.6, col: 0x5a5652 });
  } },
  { id: 'ly_quetai', name: '断阙台', foot: { w: 10.4, d: 5.2 }, tags: ['que', 'tall', 'palace'], build(c, p) {
    // the two 阙 the 御道 passes between, each on its own rammed-earth terrace; the left still stands (its top storey burnt to
    // posts), the right is knocked down to a stump, its brick spilled over its terrace; earth wall stubs run out from both
    const B = frame(c.w, p.x, p.z, 0), lit = p.time !== 'day' || p.rnd(1) < 0.6;
    for (const s of [-1, 1] as const) {
      const a = s < 0 ? -61 : 17, b = s < 0 ? -17 : 61;
      B(a, -1, -14, b, 9, 24, LY.brickD); B(a, -1, -14, b, 1, 24, LY.stoneD); for (let y = 5; y <= 9; y += 4) B(a, y, 24, b, y, 24, LY.char);
      B(a, 9, -14, b, 9, 24, LY.brick); B(a, 8, 24, b, 8, 24, LY.charL);
      lyQue(up(B, 10), s * 36, s, { broken: s > 0 });
      earthWall(B, s < 0 ? -76 : 62, s < 0 ? -62 : 76, -6, 2, 30, s > 0 ? [[68, 76, 16]] : []);
      basin(c, p, B, s * 14, 32, 8);
    }
    beamDown(B, 24, 48, 30);
    const q = wp(p, 0, 36, 40, 0); if (lit) fireLight(c, p, q, 0.8, 5); smoke(c, q, { rate: 1.8, col: 0x55504b });
  } },
];

// ------------------------------------------------------------------ ground: burnt square brick, the 御道's long slabs, ash beyond
function floor(c: Ctx, f: { layout: Layout }) {
  lyFloor(c, f, {
    court: { n: 26, m: 16, joint: 0x4d4846, body: 0x57524e },
    path: { n: 30, m: 17, joint: 0x65625d, body: 0x77736d },
    patches: [
      { rect: { x0: SX(-6.9), x1: SX(-2.9), z0: SZ(-7.3), z1: SZ(-2.1) }, surface: 0x4c4744 },
      { rect: { x0: SX(3.6), x1: SX(7.1), z0: SZ(1.7), z1: SZ(5.2) }, surface: 0x4c4744 },
    ],
    outer: [0x4e4a46, 0x5a5550, 0x3c3835],
  });
}
// ------------------------------------------------------------------ the far ring: the outer palace wall, burnt halls behind it, dead trees, smoke
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, r = f.p.rnd, B = frame(w, 0, 0, 0);
  const Z0 = M(SZ(-18.6)), X0 = M(SX(-17)), X1 = M(SX(17));
  palaceWall(B, X0, X1, Z0, Z0 + 8, 50, { drops: [[M(SX(-6.4)), M(SX(-4.6)), 16], [M(SX(4.4 + r(1) * 2)), M(SX(6.2 + r(1) * 2)), 22], [M(SX(-14)), M(SX(-12.2)), 30]], seed: f.p.seed });
  // the halls behind it: an earth terrace each, rows of charred columns, a strip of roof left on one or two bays
  for (let i = 0; i < 3; i++) {
    const cx = M(SX(-10.5 + i * 10.5 + (r(10 + i) - 0.5) * 2)), cz = M(SZ(-21.6)) - Math.floor(r(20 + i) * 20), U = up(B, 10);
    shell(B, cx - 64, -1, cz - 22, cx + 64, 9, cz + 22, LY.earth, LY.earthL);
    for (let x = cx - 56, k = 0; x <= cx + 56; x += 16, k++) {
      const h = r(30 + i * 9 + k) < 0.3 ? 14 + Math.floor(r(40 + k) * 12) : 46;
      charPost(U, x, cz + 14, h, { broken: h < 46, charAt: 8 }); charPost(U, x, cz - 14, h < 46 ? 46 : 40, { charAt: 8 });
    }
    const a = cx - 60 + Math.floor(r(50 + i) * 3) * 16;
    U(a, 47, cz - 16, a + 36, 48, cz + 16, LY.char);
    hanRoof(U, a - 6, a + 42, cz - 22, cz + 22, 49, [[0, 3], [6, 3]], 1, { cut0: r(60 + i) < 0.5, cut1: true });
  }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) charTree(c, s * (SX(16.2) + (i % 2) * 1.4), SZ(-14 + i * 4.2), 5.6 + r(70 + i + (s > 0 ? 9 : 0)) * 2, 300 + i + (s > 0 ? 20 : 0), 0.2);
  smoke(c, [SX(-9 + r(2) * 4), 3.2, SZ(-21.5)], { rate: 1.6, col: 0x4e4a46 });
  smoke(c, [SX(6 + r(3) * 5), 3.2, SZ(-22)], { rate: 1.3, col: 0x5a5650 });
  if (r(4) < 0.6) smoke(c, [SX(-15), 2.4, SZ(-8)], { rate: 1.0, col: 0x55504b });
  lyFlankRuins(c, f, 'road');
}

export const lyRoad: Locale = {
  infill: burntInfill('road'),
  id: 'ly_road', name: '铜驼道', theme: 'luoyang',
  layouts: ['axis', 'pair', 'offset'],
  seasons: ['autumn', 'summer'], times: ['sunset', 'dusk', 'night', 'overcast', 'dawn'], weathers: ['embers', 'mist', 'rain', 'storm', 'clear'], noLeaves: true,
  landmarks: LANDMARKS, groups: [...ROAD_GROUPS, ...commonGroups('ly_r')], filler: commonFiller('ly_r'),
  floor, far, dress: (c, f) => lyDress(c, f, { embers: 1.6 }),
};
