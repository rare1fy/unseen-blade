// 第二关 · 洛阳余烬 · 焦梁坊（ly_ward）（11-18）：一座烧光的里坊。战斗区是坊里的十字街口（灰黄的夯土地上一块块残砖），一条碎砖
// 坊巷直通后方；两翼塌屋只剩半截墙和焦梁、屋架、坊墙段、焦树、井、灶台，余火冒烟。地标二选一：只剩骨架的楼（三层焦柱、
// 一层楼板还在）/ 坊门（夯土门墩、烧剩的门楼梁架、门板倒在地上）。远景：坊墙、墙外一排塌屋的焦梁和半截墙、焦树、烟。
// 和铜驼道（宫墙、石板御道、铜驼）不同：这里是民居的夯土和焦木，地面是夯土和碎砖，矮、密、乱。
import { burntInfill } from './ly_infill';
import type { Ctx } from '../../scenes/stage';
import { M, SX, SZ } from '../../scenes/props';
import type { Landmark, Layout, Locale, Place } from '../types';
import { LY, frame, up, wp, fireLight, smoke, rubble, emberHeap, fireBasin, frameBay, earthWall, hanRoof, beamDown, charTree, shell } from './ly_kit';
import { commonGroups, commonFiller, lyFloor, lyDress, lyFlankRuins } from './ly_common';
import { WARD_GROUPS } from './ly_ward_props';

function basin(c: Ctx, p: Place, B: ReturnType<typeof frame>, x: number, z: number, h = 10) {
  const lit = p.time !== 'day' || p.rnd(x + 7) < 0.6, f = fireBasin(B, x, z, lit, h);
  if (lit) fireLight(c, p, wp(p, 0, f[0], f[1] + 3, f[2]), 1, 6);
}

// ------------------------------------------------------------------ landmarks
const LANDMARKS: Landmark[] = [
  { id: 'ly_gulou', name: '骨架楼', foot: { w: 9.6, d: 5.6 }, tags: ['building', 'tall', 'burnt'], build(c, p) {
    // a three-storey timber building burnt to its bones: a stone-faced earth base, a grid of charred posts, the first floor slab still
    // on (half of it), beams at each storey, the top storey's posts snapped at different heights; the back wall of the ground storey
    // still has its plaster low down; heaps of tile and beams at its feet, embers in the middle
    const B = frame(c.w, p.x, p.z, 0), lit = p.time !== 'day' || p.rnd(1) < 0.7, U = up(B, 6);
    shell(B, -64, -1, -34, 64, 5, 22, LY.stoneD, LY.brickD);
    for (let x = -60; x <= 60; x += 10) B(x, 5, -34, x, 5, 22, LY.char);
    B(-62, 6, -32, 62, 34, -29, LY.earth); B(-62, 6, -28, 62, 14, -28, LY.red); B(-62, 6, -28, 62, 7, -28, LY.redD); B(-62, 26, -28, 62, 34, -28, LY.charL);
    for (let y = 18; y < 34; y += 6) B(-62, y, -28, 62, y, -28, LY.earthD);
    const xs = [-56, -28, 0, 28, 56], zs = [-24, -2, 18];
    const top = (i: number, j: number) => [96, 84, 102, 66, 90][i] - (j === 2 ? 14 : 0);
    const posts: Array<[number, number, number]> = [];
    xs.forEach((x, i) => zs.forEach((z, j) => posts.push([x, z, top(i, j)])));
    frameBay(U, posts, []);
    for (const y of [32, 62]) { for (const z of zs) U(-57, y, z - 1, 57, y + 1, z + 1, LY.charL); for (const x of xs) U(x - 1, y, -25, x + 1, y + 1, 19, LY.charL); }
    U(-58, 34, -26, 6, 35, 20, LY.char); for (let x = -54; x <= 4; x += 6) U(x, 35, -26, x, 35, 20, LY.charD);
    hanRoof(U, -66, -22, -32, 2, 97, [[0, 2], [4, 2]], 1, { cut1: true, ridge: false });
    rubble(B, 34, 26, 14, 6, 3, { beam: true }); rubble(B, -40, 28, 10, 4, 2); beamDown(B, -14, 20, 30);
    const e = emberHeap(U, 14, -6, lit), q = wp(p, 0, e[0], e[1] + 6, e[2]);
    if (lit) fireLight(c, p, q, 1.2, 7);
    smoke(c, [q[0], q[1] + 0.3, q[2]], { rate: 2.4, col: 0x55504b });
  } },
  { id: 'ly_fangmen', name: '坊门', foot: { w: 10.4, d: 5.0 }, tags: ['gate', 'wall'], build(c, p) {
    // the ward's gate: two rammed-earth piers with the ward wall running off both ways, the gate-house timber burnt to posts and a
    // lintel with half its little roof, one door leaf lying flat on the road, the name board fallen and split beside it
    const B = frame(c.w, p.x, p.z, 0);
    earthWall(B, -72, -22, -18, -12, 40, [[-72, -56, 24]]); earthWall(B, 22, 72, -18, -12, 40, [[48, 64, 16]]);
    for (const s of [-1, 1]) {
      const a = s < 0 ? -22 : 12, b = s < 0 ? -12 : 22;
      B(a, -1, -22, b, 46, -8, LY.earth); B(a, -1, -22, b, 2, -8, LY.earthD); for (let y = 8; y < 44; y += 6) B(a, y, -8, b, y, -8, LY.earthD);
      B(a, 40, -22, b, 46, -8, LY.charL); B(a - 1, 47, -23, b + 1, 47, -7, LY.tileD); B(a, 48, -22, b, 48, -8, LY.tile);
      B(s * 13, -1, -6, s * 13 + (s < 0 ? -2 : 2), 54, -4, LY.char);
    }
    B(-15, 55, -7, 15, 57, -3, LY.char); B(-15, 56, -3, 15, 56, -3, LY.charL);
    hanRoof(B, -20, 4, -11, 2, 58, [[0, 2], [3, 2]], 1, { cut1: true, ridge: false });
    B(-10, -1, 2, 2, 0, 20, LY.wood); for (const z of [6, 15]) B(-10, 1, z, 2, 1, z, LY.iron); B(-10, -1, 16, 2, 0, 20, LY.char);
    B(6, -1, 8, 22, 1, 12, LY.woodD); B(6, 2, 9, 13, 2, 11, LY.coinD); B(15, 2, 9, 21, 2, 11, LY.coinD);
    rubble(B, -40, 4, 10, 5, 2, { beam: true }); rubble(B, 44, 8, 8, 4, 2);
    for (const s of [-1, 1]) basin(c, p, B, s * 30, 4);
  } },
];

// ------------------------------------------------------------------ ground: trodden earth with broken brick, the lane of brick halves, ash beyond
function floor(c: Ctx, f: Parameters<Locale['floor']>[1]) {
  const hall = f.arena?.shape;
  if (hall?.fixed?.id === 'fallen_hall') {
    const slabs = { n: 32, m: 22, joint: 0x47413a, body: 0x827b6e };
    lyFloor(c, f, { court: slabs, path: slabs, kerb: slabs.joint,
      patches: [{ rect: hall.box, surface: slabs }], outer: [LY.ashD, LY.earthD, LY.charL] });
    return;
  }
  // 坊街中央是踩实的土。残砖留在房基旁和坊巷里，焦痕从两翼倒梁下接进路边。
  const brick = { n: 18, m: 8, joint: 0x49413a, body: 0x60554b };
  lyFloor(c, f, {
    court: 0x66594b, path: brick,
    outer: [0x4a4440, 0x5a5048, 0x38332f], kerb: LY.earthD,
    patches: [
      { rect: { x0: SX(-7.2), x1: SX(-2.5), z0: SZ(-6.6), z1: SZ(-3.1) }, surface: 0x4d443d },
      { rect: { x0: SX(2.9), x1: SX(7.2), z0: SZ(0.9), z1: SZ(4.3) }, surface: 0x554a40 },
      { rect: { x0: SX(2.5), x1: SX(6.4), z0: SZ(-6.8), z1: SZ(-3.5) }, surface: brick },
      { rect: { x0: SX(-5.8), x1: SX(-2.7), z0: SZ(2.1), z1: SZ(5.3) }, surface: brick },
    ],
  });
}
// ------------------------------------------------------------------ the far ring: the ward wall, a row of burnt houses beyond, dead trees, smoke
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, r = f.p.rnd, B = frame(w, 0, 0, 0);
  const Z0 = M(SZ(-18.4)), X0 = M(SX(-17)), X1 = M(SX(17));
  earthWall(B, X0, X1, Z0, Z0 + 6, 40, [[M(SX(-7)), M(SX(-5)), 12], [M(SX(3 + r(1) * 3)), M(SX(5 + r(1) * 3)), 18], [M(SX(12)), M(SX(14)), 24]]);
  for (let i = 0; i < 7; i++) {
    const cx = M(SX(-15 + i * 5 + (r(10 + i) - 0.5) * 1.4)), cz = M(SZ(-21)) - Math.floor(r(20 + i) * 24), h = 18 + Math.floor(r(30 + i) * 22), H = h + 14 + Math.floor(r(40 + i) * 14);
    B(cx - 26, -1, cz - 16, cx + 26, h, cz - 13, LY.earth); B(cx - 26, h - 3, cz - 16, cx + 26, h, cz - 13, LY.charL);
    B(cx - 26, -1, cz - 12, cx - 23, Math.round(h * 0.7), cz + 14, LY.earthD);
    frameBay(B, [[cx - 20, cz - 8, H], [cx + 20, cz - 8, H - 10], [cx - 20, cz + 10, H - 6]], [[cx - 20, cz - 8, cx + 20, cz - 8, H - 11]]);
    if (r(50 + i) < 0.4) hanRoof(B, cx - 28, cx + 4, cz - 20, cz + 2, H + 1, [[0, 2], [4, 2]], 1, { cut1: true, ridge: false });
  }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) charTree(c, s * (SX(16.2) + (i % 2) * 1.4), SZ(-14 + i * 4.2), 5 + r(70 + i + (s > 0 ? 9 : 0)) * 2, 400 + i + (s > 0 ? 20 : 0), 0.3);
  for (let i = 0; i < 3; i++) smoke(c, [SX(-12 + i * 11 + r(5 + i) * 3), 2.6, SZ(-21 - r(8 + i) * 2)], { rate: 1.2 + r(11 + i), col: 0x54504c });
  lyFlankRuins(c, f, 'ward');
}

export const lyWard: Locale = {
  infill: burntInfill('ward'),
  id: 'ly_ward', name: '焦梁坊', theme: 'luoyang',
  layouts: ['axis', 'offset', 'garden', 'pair'],
  seasons: ['autumn', 'summer'], times: ['night', 'dusk', 'dawn'], weathers: ['clear', 'mist', 'rain'], noLeaves: true,
  landmarks: LANDMARKS, groups: [...WARD_GROUPS, ...commonGroups('ly_w')], filler: commonFiller('ly_w'),
  floor, far, dress: (c, f) => lyDress(c, f, { embers: 2.2 }),
};
