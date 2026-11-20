// 第三关 · 下邳寒沼 · 白门楼（xp_gate，头目间）：吕布最后被缢死的地方。正后方是城门楼——白灰墩台正中一个黑门洞（门洞里和门前
// 是浅水），墩台上三层白墙黑瓦的楼一层比一层收，最下一层的挑檐梁上垂着几根缢绳；两边接着高大的城墙。战斗区是一大片泡水的
// 方石广场（中间一条长条石铺的御道直通门洞），场边一圈积水（水鬼在里面）；沙袋墙外是一圈护城的水，再外面是石铺的城下空地：
// 门房、绞架、囚笼、石狮、告示碑、枯柳。头目封鸩在后部正中（z ≈ −9.2）出场，城门楼在他身后。部件在 xp_kit.ts。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, PLAY, SZ, STAGE_BIG, hash } from '../../scenes/props';
import type { Group, Landmark, Layout, Locale, Place, Rect } from '../types';
import { XP, frame, up, faceOf, orient, wp, capCol, fireLight, floodedHouse, blackRoof, plasterWall, lattice, icicles, markWater, cityWall, crate, brazier, deadWillow, noose, stoneHeap } from './xp_kit';
import { specSeedOf, xpFloor, carveMarks, slabs, deck, inR, commonGroups, commonFiller, xpDress, farHouse, farWall } from './xp_common';
import { xiapiInfill, xiapiEdgeDress, xiapiDistantBackdrop } from './xp_infill';

// ------------------------------------------------------------------ the pools: a ring along the floor's sides (left / right, middle and front)
/** 3–4 pools along the edges of the court (the 水鬼 come up from them), never on the way in, the boss's mark or the back strip */
function pools(seed: number): Rect[] {
  const r = (k: number) => hash(seed * 53 + 29, k, 6113), G = 0.7, k = STAGE_BIG.on ? 1 : 0.5, snap = (v: number) => Math.round(v * k / 0.35) * 0.35;
  const cand: Rect[] = [
    { x0: -9.8, x1: -5.6, z0: -6.3, z1: -2.1 }, { x0: 5.6, x1: 9.8, z0: -6.3, z1: -2.1 },
    { x0: -9.8, x1: -5.6, z0: 2.1, z1: 6.3 }, { x0: 5.6, x1: 9.8, z0: 2.1, z1: 6.3 },
  ];
  const drop = r(1) < 0.5 ? Math.floor(r(2) * 4) : -1, out: Rect[] = [];
  cand.forEach((q, i) => {
    if (i === drop) return;
    const dz = Math.round((r(10 + i) - 0.5) * 2) * G, dw = Math.floor(r(20 + i) * 3) * G, inner = q.x0 < 0 ? 0 : 1;
    out.push({ x0: inner ? q.x0 : q.x0 + (r(30 + i) < 0.5 ? 0 : G), x1: inner ? q.x1 - (r(30 + i) < 0.5 ? 0 : G) : q.x1, z0: q.z0 + dz, z1: q.z1 + dz - dw });
  });
  return out.map(q => ({ x0: +snap(q.x0).toFixed(2), x1: +snap(q.x1).toFixed(2), z0: +snap(q.z0).toFixed(2), z1: +snap(q.z1).toFixed(2) }));
}
/** the city wall's front face (m) either side of the gate tower: behind the corner slots */
const WALL_Z = () => SZ(-12.4) - 3.0;

// ------------------------------------------------------------------ the landmark: 白门楼
const LANDMARKS: Landmark[] = [
  { id: 'xg_baimen', name: '白门楼', foot: { w: 15.0, d: 6.8 }, tags: ['gate', 'tower', 'tall'], build(c, p) {
    const B = frame(c.w, p.x, p.z, 0), cap = capCol(p), BH = 62;
    // the gate base (墩台): a stone plinth, brick to the flood mark (stained dark under a black line), white plaster above with a dark
    // course every 12 rows, a crenellated parapet on top
    B(-98, 0, -44, 98, 3, 38, XP.stoneD); B(-98, 4, -44, 98, 4, 38, XP.stone);
    B(-96, 5, -44, 96, 16, 36, XP.brickW); for (let y = 8; y <= 16; y += 4) B(-96, y, 36, 96, y, 36, XP.brickD); B(-96, 17, 36, 96, 17, 36, XP.line);
    B(-96, 18, -44, 96, BH, 36, XP.plaster); for (let y = 30; y < BH; y += 12) B(-96, y, 36, 96, y, 36, XP.plasterD);
    for (const x of [-96, 96]) B(x, 18, -44, x, BH, 36, XP.plasterD);
    B(-97, BH + 1, -44, 97, BH + 1, 37, XP.stoneD); B(-96, BH + 2, -44, 96, BH + 2, 30, cap);
    B(-96, BH + 2, 31, 96, BH + 4, 36, XP.plaster);
    for (let x = -96; x + 5 <= 96; x += 10) { B(x, BH + 5, 31, x + 5, BH + 9, 36, XP.plaster); B(x, BH + 10, 31, x + 5, BH + 10, 36, cap); }
    // the gate passage: a square opening stepped at its top in three wide tiers, a stone frame round it, dark inside, water on its floor
    const arch: Array<[number, number]> = [[20, 30], [15, 35], [9, 39]];
    for (const [a, t] of arch) B(-a - 3, 0, 36, a + 3, t + 3, 36, XP.stoneL);
    for (const [a, t] of arch) B(-a, 0, -44, a, t, 37, null);
    B(-20, 0, -44, 20, 39, -42, XP.dark);
    // the passage's floor is flood water (the moat in front of the base comes from the floor; the plank bridge of the way in runs up to it)
    markWater(B, -20, -41, 20, 37, 0);
    // icicles under each tier's lintel, on the base's face
    icicles(B, -20, -16, 36, 30, 2); icicles(B, 16, 20, 36, 30, 2); icicles(B, -15, -10, 36, 35, 2); icicles(B, 10, 15, 36, 35, 2); icicles(B, -9, 9, 36, 39, 3);
    // the first storey: plaster between dark posts, lattice windows, a gallery along the front with a rail; its roof's eave beam
    // juts out over the base's face and the nooses hang from it
    const U1 = up(B, BH + 3);
    plasterWall(U1, -74, 74, 22, 23, 0, 30, { bay: 12 }); plasterWall(U1, -74, 74, -34, -33, 0, 30, { bay: 12 });
    plasterWall(U1, -74, -73, -33, 22, 0, 30, { bay: 11 }); plasterWall(U1, 73, 74, -33, 22, 0, 30, { bay: 11 });
    for (const x of [-48, -16, 16, 48]) lattice(U1, x - 7, x + 7, 24, 11, 22);
    B(-74, BH + 3, 24, 74, BH + 3, 30, XP.plankD);
    for (const x of [-74, -37, 0, 37, 74]) B(x - 1, BH + 3, 29, x + 1, BH + 31, 30, XP.woodD);
    B(-74, BH + 10, 30, 74, BH + 10, 30, XP.woodL); for (let x = -72; x <= 72; x += 3) B(x, BH + 4, 30, x, BH + 9, 30, XP.wood);
    B(-84, BH + 32, 29, 84, BH + 33, 40, XP.woodD);   // the eave beam, out over the face of the base
    blackRoof(U1, -86, 86, -44, 42, 31, [[0, 2], [6, 2]], cap, { ridge: false }); icicles(U1, -84, 84, 42, 30, 3);
    // the nooses: three ropes (one sometimes cut, a short end), the loops a little above head height over the gate's face
    const cut = Math.floor(p.rnd(3) * 3);
    [-34, -12, 26].forEach((x, i) => noose(B, x, 39, BH + 31, i === cut ? 8 : 34 + (i % 2) * 6));
    // the second and third storeys, each stepped in, each with its black roof
    const U2 = up(B, BH + 3 + 35);
    plasterWall(U2, -54, 54, 14, 15, 0, 24, { bay: 12 }); plasterWall(U2, -54, 54, -26, -25, 0, 24, { bay: 12 });
    plasterWall(U2, -54, -53, -25, 14, 0, 24, { bay: 13 }); plasterWall(U2, 53, 54, -25, 14, 0, 24, { bay: 13 });
    for (const x of [-26, 0, 26]) lattice(U2, x - 6, x + 6, 16, 8, 18);
    blackRoof(U2, -66, 66, -36, 28, 25, [[0, 2], [6, 2]], cap, { ridge: false }); icicles(U2, -64, 64, 28, 24, 3);
    const U3 = up(B, BH + 3 + 35 + 29);
    plasterWall(U3, -36, 36, 6, 7, 0, 20, { bay: 12 }); plasterWall(U3, -36, 36, -20, -19, 0, 20, { bay: 12 });
    plasterWall(U3, -36, -35, -19, 6, 0, 20, {}); plasterWall(U3, 35, 36, -19, 6, 0, 20, {});
    lattice(U3, -8, 8, 8, 6, 15);
    blackRoof(U3, -48, 48, -30, 18, 21, [[0, 2], [6, 2], [6, 2]], cap); icicles(U3, -46, 46, 18, 20, 3);
    // a dark banner pole at each end of the parapet (the banners hang still from the pole, torn in wide steps); fires on the base's
    // top at its front corners (the square below is water and stone: the tower carries the room's only warm light)
    for (const s of [-1, 1]) {
      const a = Math.min(s * 90, s * 78), b = Math.max(s * 90, s * 78), a2 = Math.min(s * 90, s * 84), b2 = Math.max(s * 90, s * 84);
      B(s * 90 - 1, BH + 3, 32, s * 90 + 1, BH + 50, 34, XP.woodD);
      B(a, BH + 30, 35, b, BH + 48, 35, XP.redD); B(a, BH + 48, 35, b, BH + 48, 35, XP.red); B(a2, BH + 26, 35, b2, BH + 29, 35, XP.redD);
    }
    const lit = p.time !== 'day' || p.rnd(1) < 0.5;
    for (const s of [-1, 1]) { const f = brazier(up(B, BH + 3), s * 84, 12, lit, 6); if (lit) fireLight(c, p, wp(p, 0, f[0], f[1] + BH + 6, f[2]), 1.1, 7); }
  } },
];

// ------------------------------------------------------------------ groups: the ground under the city wall
const GROUPS: Group[] = [
  ...commonGroups('xg'),
  { id: 'xg_gatehouse', name: '门房', tags: ['building', 'house'], foot: { w: 3.4, d: 3.4 }, h: 3.0, kinds: ['wing', 'back', 'corner'], size: 'L', weight: 1.4, build(c, p) {
    const r = orient(p), B = frame(c.w, p.x, p.z, r);
    floodedHouse(B, capCol(p), { hw: 21, hd: 13, H: 30, wl: 8, door: 0 });
    crate(B, -16, 18, 3); crate(B, 15, 17, 3); crate(B, 15, 17, 2, 7);
  } },
  { id: 'xg_gallows', name: '绞架', tags: ['gallows', 'tall'], foot: { w: 1.4, d: 3.2 }, h: 3.4, kinds: ['wing', 'back', 'corner'], size: 'M', weight: 1.3, build(c, p) {
    // two posts on stone feet, a beam across with two braces stepped under it, two nooses, a low platform of boards and a step
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)), cap = capCol(p);
    B(-22, 0, -8, 22, 5, 8, XP.wood); B(-22, 0, -8, 22, 1, 8, XP.woodD); for (let x = -20; x <= 20; x += 4) B(x, 5, -8, x, 5, 8, XP.plankD); B(-22, 6, -8, 22, 6, 8, cap);
    B(-8, 0, 9, 8, 2, 12, XP.wood); B(-8, 3, 9, 8, 3, 12, cap);
    for (const x of [-19, 17]) { B(x, 6, -2, x + 2, 46, 0, XP.woodD); B(x - 1, 6, -3, x + 3, 7, 1, XP.woodD); }
    B(-22, 47, -2, 22, 49, 0, XP.wood); B(-22, 50, -2, 22, 50, 0, cap);
    for (const x of [-16, 13]) B(x, 43, -2, x + 3, 46, 0, XP.wood);
    noose(B, -6, -1, 46, 18); noose(B, 7, -1, 46, 22);
  } },
  { id: 'xg_cage', name: '囚笼', tags: ['cage', 'cart'], foot: { w: 1.6, d: 2.6 }, h: 1.8, kinds: ['wing', 'back'], size: 'M', build(c, p) {
    // a prisoner's cage on a cart: a plank bed on two square wheels, upright bars every 3 cells, a board roof with frost, shafts down
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)), cap = capCol(p);
    for (const s of [-1, 1]) { B(-6, 0, s * 10, 6, 11, s * 10 + s, XP.woodD); B(-4, 2, s * 10, 4, 9, s * 10 + s, XP.wood); B(-1, 5, s * 10 + s, 1, 6, s * 10 + s, XP.ironL); }
    B(-16, 8, -9, 16, 10, 9, XP.wood);
    for (let x = -15; x <= 15; x += 3) { B(x, 11, -9, x, 24, -9, XP.woodD); B(x, 11, 9, x, 24, 9, XP.woodD); }
    for (let z = -6; z <= 6; z += 3) { B(-15, 11, z, -15, 24, z, XP.woodD); B(15, 11, z, 15, 24, z, XP.woodD); }
    B(-16, 25, -9, 16, 26, 9, XP.plank); B(-16, 27, -9, 16, 27, 9, cap);
    B(17, 0, -5, 30, 2, -4, XP.woodD); B(17, 0, 4, 30, 2, 5, XP.woodD);
  } },
  { id: 'xg_lion', name: '石狮', tags: ['stone', 'beast', 'low'], foot: { w: 1.4, d: 1.4 }, h: 1.4, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a stone lion on its plinth, sitting: haunches, a raised chest, a square head with a mane block, a ball under one forepaw
    const B = frame(c.w, p.x, p.z, orient(p)), cap = capCol(p);
    B(-8, 0, -8, 8, 4, 8, XP.stoneD); B(-7, 5, -7, 7, 5, 7, XP.stone);
    B(-5, 6, -6, 5, 12, 2, XP.stone); B(-4, 6, 2, 4, 15, 6, XP.stone);
    B(-5, 16, -1, 5, 21, 6, XP.stoneL); B(-4, 17, 7, 4, 20, 7, XP.stone); B(-2, 18, 8, 2, 19, 8, XP.stoneDD);
    B(-5, 6, 6, -3, 10, 8, XP.stoneD); B(3, 6, 6, 5, 7, 8, XP.stoneD); B(2, 8, 5, 6, 11, 9, XP.stone);
    B(-5, 22, -1, 5, 22, 6, cap); B(-7, 6, -7, -6, 6, -6, cap);
  } },
  { id: 'xg_notice', name: '告示碑', tags: ['stone', 'stele', 'low'], foot: { w: 1.4, d: 1.0 }, h: 1.6, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a notice board of the city on two posts with a little black roof, the paper on it gone dark with the wet (whole sheets)
    const B = frame(c.w, p.x, p.z, orient(p)), cap = capCol(p);
    for (const x of [-9, 8]) { B(x - 1, 0, -2, x + 2, 1, 1, XP.stoneD); B(x, 2, -1, x + 1, 19, 0, XP.woodD); }
    B(-9, 8, 0, 9, 18, 0, XP.wood); B(-7, 10, 1, -2, 16, 1, XP.plasterD); B(0, 11, 1, 6, 17, 1, XP.damp);
    blackRoof(B, -12, 12, -3, 3, 20, [[0, 1], [2, 1]], cap, { ridge: false });
  } },
  { id: 'xg_willow', name: '枯柳', tags: ['tree', 'tall'], foot: { w: 2.0, d: 2.0 }, h: 6.4, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, build(c, p) {
    const B = frame(c.w, p.x, p.z, 0); markWater(B, -14, -14, 14, 14, 0);
    B(-10, 0, -10, 10, 1, 10, XP.stoneD); B(-9, 2, -9, 9, 2, 9, capCol(p));
    deadWillow(c, p.x, p.z, 4.8 + p.rnd(1) * 0.8, p.seed);
  } },
  { id: 'xg_rubble', name: '残墙石堆', tags: ['stone', 'ruin', 'low'], foot: { w: 2.2, d: 1.8 }, h: 0.8, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    const B = frame(c.w, p.x, p.z, orient(p)), cap = capCol(p);
    stoneHeap(B, -4, 0, 12, 9); B(-13, 10, -6, -1, 10, 6, cap);
    B(8, 0, -6, 15, 5, 6, XP.brick); B(8, 6, -6, 15, 6, 6, cap); for (let y = 2; y <= 4; y += 2) B(8, y, 6, 15, y, 6, XP.brickD);
  } },
];
const FILLER: Group[] = commonFiller('xg');

// ------------------------------------------------------------------ ground: the drowned square, the moat ring outside the walls, the stone ground beyond
function floor(c: Ctx, f: { layout: Layout; p: Place }) {
  const ps = pools(specSeedOf(f.p)), moat = 1.6, band = 0.75, dryX = AREA.x1 + 1.0;
  const MO = { x0: PLAY.x0 - band - moat, x1: PLAY.x1 + band + moat, z0: PLAY.z0 - band - moat, z1: PLAY.z1 + 2 };
  xpFloor(c, f, ps, (X, Z, x, z, zone, path) => {
    if (zone === 'play') {
      // 御道用浅色长石，两翼的青砖在积水旁整片压暗。
      if (path && path.x1 - path.x0 < 4) return slabs(X, Z, 17, 25, 0x6a7074, 0x5a6266);
      const wet = ps.some(r => inR(r, x, z, 1.32));
      return slabs(X, Z, 25, 22, wet ? 0x485258 : 0x5a6064, wet ? XP.joint : 0x484f53);
    }
    if (zone === 'path' && path) {
      // over the moat a plank bridge with dark kerb beams, then the stone road
      const e = Math.min(X - M(path.x0), M(path.x1) - 1 - X);
      if (inR(MO, x, z) && path.x1 - path.x0 < 4) return e <= 0 ? XP.woodD : deck(X, Z, true);
      return slabs(X, Z, 17, 25, 0x60666a, 0x4c5559);
    }
    // the moat ring round the walls; beyond it the stone ground under the city wall (big dark slabs); the flood further out
    if (inR(MO, x, z)) return null;
    if (Math.abs(x) > dryX || z > PLAY.z1 + 3.0) return null;
    return slabs(X, Z, 25, 22, 0x4c5256, XP.stoneDD);
  });
}

// ------------------------------------------------------------------ the far ring: the city wall either side of the gate, the drowned roofs beyond, willows
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  carveMarks(c);
  const w = c.w, r = f.p.rnd, cap = capCol(f.p), wz = WALL_Z(), half = M(AREA.x1 + 7);
  const B = frame(w, 0, wz, 0);
  // one run the whole width behind the tower, lower than the gate base (the 墩台 and its three storeys stand above the wall line)
  cityWall(B, -half, half, -30, 0, 56, cap, { stain: 22, hollow: true });
  farWall(c, -54, 54, wz - 12, 64, cap, 22);
  for (let i = 0; i < 6; i++) { const x = -27 + i * 10.8 + (r(320 + i) - 0.5) * 2; if (Math.abs(x) < 9) continue; farHouse(c, x, wz - 5.6 - r(330 + i) * 2, 26, 22, 76 + Math.floor(r(340 + i) * 12), cap); }
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const z = SZ(-12) + i * 7 + (r(10 + i + (s > 0 ? 20 : 0)) - 0.5); if (z > SZ(2)) break;
    farHouse(c, s * (AREA.x1 + 6.2 + r(40 + i) * 1.5), z, 22 + Math.floor(r(60 + i) * 6), 28, 24 + Math.floor(r(100 + i) * 8), cap, { cut: r(120 + i) < 0.4 });
  }
  for (let i = 0; i < 4; i++) deadWillow(c, (i % 2 ? 1 : -1) * (AREA.x1 + 3.0 + r(280 + i) * 1.2), SZ(-9) + i * 5.4 + r(290 + i) * 2, 4.4 + r(300 + i) * 1.2, 600 + i);
  xiapiDistantBackdrop(c, f, 'gate');
}

function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  xpDress(c, f, 1.3);
  xiapiEdgeDress(c, f);
}

export const xpGate: Locale = {
  id: 'xp_gate', name: '白门楼', theme: 'xiapi',
  layouts: ['axis', 'garden'],
  landmarks: LANDMARKS, groups: GROUPS, filler: FILLER,
  seasons: ['winter'], weathers: ['mist', 'snow', 'clear'], noSnow: true, noLeaves: true,
  pools, floor, far, dress, infill: xiapiInfill('gate'),
};
void (0 as unknown as Place);
