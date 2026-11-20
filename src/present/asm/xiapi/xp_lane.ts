// 第三关 · 下邳寒沼 · 浮栈巷（xp_lane）：泡在冬水里的一条街巷。战斗区是泡水的青石板街（中间一条长条石铺的街心），
// 地上几片浅积水（水鬼在里面潜），积水边搭着木栈道（拐个直角包住水的一角）；沙袋墙外两边是半淹的屋（下半截泡水、水线发黑、
// 黑瓦顶上一层霜雪、檐下冰凌），屋前一条湿石岸，再往外全是水，栈道、渔网架、枯柳、漂着的箱子和门板；后方隔一条水巷是地标：
// 一座宽台阶的拱桥，或一座半塌的水榭。远处两排泡水的屋，雾里一段城墙和城楼。
// 冷、灰蓝、湿：白灰墙、黑瓦、青石、灰木、暗青灰的水；火光只有零星的火盆。部件在 xp_kit.ts，共用的积水 / 地面 / 小件在 xp_common.ts。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, PLAY, SX, SZ } from '../../scenes/props';
import type { Group, Landmark, Layout, Locale, Place, Rect } from '../types';
import { XP, frame, up, faceOf, orient, wp, capCol, fireLight, floodedHouse, blackRoof, plasterWall, lattice, icicles, markWater, boardsZ, crate, brazier, deadWillow, sunkBoat } from './xp_kit';
import { poolsOf, specSeedOf, xpFloor, carveMarks, slabs, deck, inR, commonGroups, commonFiller, xpDress, farHouse, farWall, farTower } from './xp_common';
import { xiapiInfill, xiapiEdgeDress, xiapiDistantBackdrop } from './xp_infill';

/** this place's pools (its own pattern for a seed: salt 1) */
const pools = (seed: number) => poolsOf(seed, 1);
/** the boardwalks round the pools: one along the pool's camera side and one along its side toward the middle (an L round its corner) */
function decksOf(ps: Rect[]): Array<Rect & { alongX: boolean }> {
  const out: Array<Rect & { alongX: boolean }> = [];
  for (const q of ps) {
    out.push({ x0: q.x0 - 0.35, x1: q.x1 + 0.35, z0: q.z1, z1: q.z1 + 0.7, alongX: true });
    if ((q.x0 + q.x1) / 2 < 0) out.push({ x0: q.x1, x1: q.x1 + 0.7, z0: q.z0 - 0.35, z1: q.z1 + 0.7, alongX: false });
    else out.push({ x0: q.x0 - 0.7, x1: q.x0, z0: q.z0 - 0.35, z1: q.z1 + 0.7, alongX: false });
  }
  return out;
}

// ------------------------------------------------------------------ landmarks (back centre, across a water lane)
const LANDMARKS: Landmark[] = [
  { id: 'xl_bridge', name: '拱桥', foot: { w: 13.6, d: 6.0 }, tags: ['bridge', 'stone'], build(c, p) {
    // a stone bridge across the water lane behind the street, its length along x: five wide steps up each side (1 m landings, 0.5 m
    // rises — never a slope), the arch under it in three stepped tiers with a light ring of arch stones on its face, parapets with
    // posts at every step, frost / snow on every landing and rail; icicles under the arch; a quay of wet stone in front of it
    const B = frame(c.w, p.x, p.z, 0), cap = capCol(p);
    markWater(B, -112, -48, 112, 18, 0);
    B(-112, -1, 19, 112, -1, 46, XP.stoneD);
    B(-112, -1, 20, 112, -1, 27, XP.slabW);
    B(-112, -1, 19, 112, -1, 19, XP.stoneDD);
    const steps: Array<[number, number]> = [[92, 10], [78, 17], [64, 24], [50, 31], [36, 36]];   // [half length, top]
    const hw = (y: number) => { for (const [a, t] of steps) if (y <= t) return a; return 0; };
    let y0 = 0;
    for (const [a, t] of steps) {
      B(-a, y0, -18, a, t, 18, XP.stone);
      B(-a, t + 1, -14, a, t + 1, 14, cap);   // the landing's frost (the next step covers its middle)
      y0 = t + 1;
    }
    // courses on the front and back faces (structure lines along each step's own width), joints staggered
    for (let y = 4; y <= 36; y += 5) for (const z of [-18, 18]) B(-hw(y), y, z, hw(y), y, z, XP.stoneD);
    for (let y = 0, k = 0; y <= 36; y += 5, k++) for (let x = -hw(y) + (k % 2 ? 5 : 0); x <= hw(y); x += 10) B(x, y, 18, x, Math.min(36, y + 3), 18, XP.stoneD);
    // the arch: a light ring of arch stones round the opening on the front, then the opening itself (three stepped tiers)
    const arch: Array<[number, number, number]> = [[40, 0, 14], [30, 15, 21], [18, 22, 26]];
    for (const [a, b, t] of arch) B(-a - 2, b, 18, a + 2, t + 2, 18, XP.stoneL);
    for (const [a, b, t] of arch) B(-a, b, -18, a, t, 18, null);
    icicles(B, -17, 17, 18, 26, 3); icicles(B, -29, -19, 18, 21, 3); icicles(B, 19, 29, 18, 21, 3);
    // the parapets: on every step a rail band 4 rows high along both edges, a post at every step's edge, frost on the rail tops
    let inner = 0;
    for (let i = steps.length - 1; i >= 0; i--) {
      const [a, t] = steps[i];
      for (const z0 of [15, -18]) {
        const z1 = z0 + 3;
        if (i === steps.length - 1) B(-a, t + 1, z0, a, t + 4, z1, XP.stoneD);
        else { B(-a, t + 1, z0, -inner - 1, t + 4, z1, XP.stoneD); B(inner + 1, t + 1, z0, a, t + 4, z1, XP.stoneD); }
        for (const s of [-1, 1]) { B(s * a - 1, t + 1, z0, s * a + 1, t + 6, z1, XP.stone); B(s * a - 1, t + 7, z0, s * a + 1, t + 7, z1, cap); }
        if (i === steps.length - 1) B(-a + 2, t + 5, z0, a - 2, t + 5, z1, cap);
        else { B(-a + 2, t + 5, z0, -inner - 2, t + 5, z1, cap); B(inner + 2, t + 5, z0, a - 2, t + 5, z1, cap); }
      }
      inner = a;
    }
    // a skiff sunk half under the arch, a willow and a fire on the quay
    sunkBoat(B, 0, -2, 34, 6);
    deadWillow(c, p.x - 6.2, p.z + 2.4, 5.2, p.seed);
    const lit = p.time !== 'day', f = brazier(B, 78, 32, lit, 8);
    if (lit) fireLight(c, p, wp(p, 0, f[0], f[1] + 3, f[2]), 1, 6);
  } },
  { id: 'xl_pavilion', name: '水榭', foot: { w: 7.6, d: 4.2 }, tags: ['building', 'pavilion'], build(c, p) {
    // a water pavilion of the drowned garden on a stone platform standing in the flood: dark posts, a plaster back wall with a lattice
    // window, a railing of balusters along the front, a black three-tier roof whose right third has fallen in (the broken posts, the
    // roof's slabs lying on the platform), steps down into the water in front; frost / snow on the roof and the fallen slabs
    const B = frame(c.w, p.x, p.z, 0), cap = capCol(p);
    markWater(B, -54, -30, 54, 30, 0);
    B(-50, 0, -26, 50, 5, 22, XP.stone); B(-50, 0, -26, 50, 1, 22, XP.stoneD);
    for (let x = -46; x <= 46; x += 12) B(x, 2, 22, x, 5, 22, XP.stoneD);
    B(-50, 6, -26, 50, 6, 22, XP.slabC);
    B(-12, 0, 23, 12, 3, 26, XP.stone); B(-12, 0, 27, 12, 1, 30, XP.stoneD); B(-12, 4, 23, 12, 4, 26, cap);
    // the back wall (plaster between the back posts) with a lattice window, the posts
    plasterWall(B, -46, 46, -24, -23, 7, 38, { bay: 0 }); lattice(B, -10, 10, -23, 16, 28);
    for (const x of [-46, -16, 16]) for (const z of [-24, 18]) B(x - 1, 7, z - 1, x + 1, 40, z + 1, XP.woodD);
    B(45, 7, 17, 47, 20, 19, XP.woodD); B(45, 21, 17, 46, 23, 19, XP.woodD);   // the broken corner post (a step at its top)
    B(45, 7, -25, 47, 26, -23, XP.woodD);
    // the railing along the front (balusters every 3), up to the broken post
    B(-44, 11, 18, 44, 12, 18, XP.wood); for (let x = -44; x <= 44; x += 3) B(x, 7, 18, x, 10, 18, XP.woodL); B(-44, 13, 18, 44, 13, 18, cap);
    // the beams and the roof, cut off over the right third
    B(-48, 41, -26, 20, 42, 20, XP.wood);
    blackRoof(B, -58, 22, -34, 28, 43, [[0, 2], [5, 2], [5, 2]], cap, { cut1: true });
    icicles(B, -56, 20, 28, 42, 3);
    // the fallen roof: two slabs of black tile lying on the platform's right end, a beam across them
    B(24, 7, -18, 48, 9, 14, XP.tile); for (let x = 26; x <= 46; x += 4) B(x, 9, -18, x, 9, 14, XP.tileL); B(24, 10, -18, 48, 10, 14, cap);
    B(30, 11, -10, 44, 12, 6, XP.tile); B(30, 13, -10, 44, 13, 6, cap);
    B(18, 13, -2, 50, 14, 0, XP.woodD);
    // a fire on the platform (its legs on the platform's top, y 7)
    const lit = p.time !== 'day', f = brazier(up(B, 7), -32, 4, lit, 6);
    if (lit) fireLight(c, p, wp(p, 0, f[0], f[1] + 7 + 3, f[2]), 0.9, 5.5);
  } },
];

// ------------------------------------------------------------------ groups
const GROUPS: Group[] = [
  ...commonGroups('xl'),
  { id: 'xl_house', name: '半淹的屋', tags: ['building', 'house'], foot: { w: 3.4, d: 3.4 }, h: 3.0, kinds: ['wing', 'back', 'corner', 'facade'], size: 'L', weight: 1.6, max: 2, build(c, p) {
    const r = orient(p), B = frame(c.w, p.x, p.z, r);
    floodedHouse(B, capCol(p), { hw: 21, hd: 13, H: 30, wl: 9 + Math.floor(p.rnd(2) * 4), cut: p.rnd(1) < 0.35, door: p.rnd(3) < 0.5 ? -8 : 8 });
    B(-16, 0, 15, -6, 0, 19, XP.plank); B(-16, 0, 17, -6, 0, 17, XP.plankD);   // a door leaf adrift in front of it
  } },
  { id: 'xl_shop', name: '水淹铺子', tags: ['building', 'shop'], foot: { w: 3.4, d: 3.4 }, h: 3.0, kinds: ['wing', 'back', 'corner', 'facade'], size: 'L', build(c, p) {
    const r = orient(p), B = frame(c.w, p.x, p.z, r), H = 30;
    floodedHouse(B, capCol(p), { hw: 21, hd: 13, H, wl: 10, shop: true });
    B(-8, H - 10, 24, 8, H - 6, 24, XP.woodD); B(-7, H - 9, 24, 7, H - 7, 24, XP.plasterD);   // the shop board under the awning (no writing)
    crate(B, -15, 17, 3); crate(B, -15, 17, 2, 7); crate(B, 14, 18, 3);
  } },
  { id: 'xl_ruin', name: '塌屋', tags: ['building', 'ruin'], foot: { w: 3.2, d: 3.2 }, h: 2.4, kinds: ['wing', 'back', 'corner', 'facade'], size: 'L', build(c, p) {
    // two plaster walls left standing (an L), stained to the flood mark; the back wall broken down in two wide steps on its right;
    // the roof fallen in and lying in the water as slabs of black tile, a beam across them
    const r = orient(p), B = frame(c.w, p.x, p.z, r), cap = capCol(p);
    markWater(B, -24, -18, 24, 20, 2);
    B(-21, 0, -16, 21, 1, -13, XP.stoneD); B(-21, 0, -16, -18, 1, 14, XP.stoneD);
    plasterWall(B, -20, 20, -15, -14, 2, 30, { bay: 10, wl: 10 }); plasterWall(B, -20, -19, -13, 13, 2, 24, { wl: 10 });
    B(8, 22, -15, 20, 30, -14, null); B(14, 14, -15, 20, 21, -14, null);
    B(-20, 31, -15, 7, 31, -14, cap); B(8, 22, -15, 13, 22, -14, cap); B(14, 14, -15, 20, 14, -14, cap); B(-20, 25, -13, -19, 25, 13, cap);
    lattice(B, -12, -4, -14, 14, 22);
    B(-16, 0, -10, 12, 2, 8, XP.tile); for (let x = -14; x <= 10; x += 4) B(x, 2, -10, x, 2, 8, XP.tileL);
    B(-10, 3, -6, 6, 4, 4, XP.tile); B(-10, 5, -6, 6, 5, 4, cap);
    B(-18, 3, -2, 16, 4, 0, XP.woodD);
  } },
  { id: 'xl_walk', name: '木栈道', tags: ['boardwalk', 'water'], foot: { w: 1.4, d: 3.6 }, h: 1.2, kinds: ['wing', 'facade'], size: 'M', weight: 1.3, build(c, p) {
    // a boardwalk on posts over the flood, along the battle floor: two bearers, boards across, a rail on the far side, a ladder down
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)), cap = capCol(p);
    markWater(B, -27, -11, 27, 11, 0);
    for (let x = -24; x <= 24; x += 8) for (const z of [-6, 5]) B(x, 0, z, x + 1, 3, z + 1, XP.woodD);
    B(-25, 4, -6, 25, 4, -5, XP.woodD); B(-25, 4, 5, 25, 4, 6, XP.woodD);
    boardsZ(B, -25, 25, -7, 7, 5);
    for (let x = -24; x <= 24; x += 8) B(x, 6, -7, x, 13, -7, XP.wood);
    B(-24, 13, -7, 24, 14, -7, XP.woodL); B(-24, 15, -7, 24, 15, -7, cap);
    B(26, 0, -3, 26, 5, -3, XP.wood); B(26, 0, 2, 26, 5, 2, XP.wood); for (let y = 1; y <= 4; y += 2) B(26, y, -2, 26, y, 1, XP.woodL);
  } },
  { id: 'xl_willow', name: '枯柳', tags: ['tree', 'tall'], foot: { w: 2.0, d: 2.0 }, h: 6.4, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, weight: 1.2, build(c, p) {
    const B = frame(c.w, p.x, p.z, 0);
    markWater(B, -14, -14, 14, 14, 0);
    B(-10, 0, -10, 10, 1, 10, XP.stoneD); B(-9, 2, -9, 9, 2, 9, capCol(p));
    deadWillow(c, p.x, p.z, 4.6 + p.rnd(1) * 0.8, p.seed);
  } },
  { id: 'xl_nets', name: '渔网架', tags: ['nets', 'water'], foot: { w: 1.2, d: 3.4 }, h: 2.4, kinds: ['wing', 'facade'], size: 'M', build(c, p) {
    // three posts in the water with a pole across, two nets hung to dry (a knotted lattice, rope lines every 3 cells; the hem weighted
    // a darker row), crates under them
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)), cap = capCol(p);
    markWater(B, -26, -8, 26, 8, 0);
    for (const x of [-21, 0, 21]) { B(x - 2, 0, -2, x + 2, 1, 2, XP.stoneD); B(x - 1, 2, -1, x + 1, 30, 1, XP.woodD); }
    B(-23, 31, -1, 23, 32, 1, XP.wood); B(-23, 33, -1, 23, 33, 1, cap);
    for (const [a, b, bot] of [[-19, -2, 10], [2, 19, 14]] as const) {
      for (let y = bot; y <= 30; y += 3) B(a - 1, y, 0, b + 1, y, 0, XP.rope);
      for (let x = a; x <= b; x += 3) B(x, bot, 0, x, 30, 0, XP.rope);
      B(a - 1, bot, 0, b + 1, bot, 0, XP.ropeD);
    }
    crate(B, -12, 4, 3); crate(B, 10, -4, 2);
  } },
  { id: 'xl_shrine', name: '水边小祠', tags: ['stone', 'shrine'], foot: { w: 1.4, d: 1.4 }, h: 1.6, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a small stone shrine on its footing, a dark niche with a stone figure in it, a black two-tier roof, a bronze pot in front
    const B = frame(c.w, p.x, p.z, orient(p)), cap = capCol(p);
    B(-9, 0, -9, 9, 3, 9, XP.stoneD); B(-8, 4, -8, 8, 4, 8, XP.stone);
    B(-6, 5, -6, 6, 13, 4, XP.stone); B(-4, 6, 4, 4, 11, 4, XP.dark); B(-2, 6, 4, 2, 8, 4, XP.stoneL);
    blackRoof(B, -9, 9, -9, 7, 14, [[0, 2], [3, 2]], cap);
    B(-2, 5, 6, 2, 7, 8, XP.bronze); B(-1, 8, 7, 1, 8, 7, XP.bronzeD);
  } },
];
const FILLER: Group[] = commonFiller('xl');

// ------------------------------------------------------------------ ground: the street of soaked slabs, the pools, the boardwalks, the bank, the flood
function floor(c: Ctx, f: { layout: Layout; p: Place }) {
  const ps = pools(specSeedOf(f.p)), dk = decksOf(ps), band = 0.75, bank = 1.4;
  const BK = { x0: PLAY.x0 - band - bank, x1: PLAY.x1 + band + bank, z0: PLAY.z0 - band - bank, z1: PLAY.z1 + 2 };
  xpFloor(c, f, ps, (X, Z, x, z, zone, path) => {
    if (zone === 'play') {
      const d = dk.find(r => inR(r, x, z));
      if (d) return deck(X, Z, d.alongX);
      // 水边是一整条深色湿石。高一点的路脊露出同色条石。
      if (path && path.x1 - path.x0 < 4 && path.z1 - path.z0 > path.x1 - path.x0) return slabs(X, Z, 14, 24, XP.slabB, 0x4b545a);
      const wet = ps.some(r => inR(r, x, z, 1.3));
      return slabs(X, Z, 24, 18, wet ? XP.slabW : XP.slab, wet ? XP.joint : 0x434a4f);
    }
    if (zone === 'path' && path) {
      // outside the floor a narrow way is a boardwalk over the flood (a dark beam along each side); a wide one stays a stone street
      const alongZ = path.z1 - path.z0 >= path.x1 - path.x0, wide = (alongZ ? path.x1 - path.x0 : path.z1 - path.z0) >= 4;
      if (wide) return slabs(X, Z, 24, 18, XP.slabC, 0x40474b);
      const e = alongZ ? Math.min(X - M(path.x0), M(path.x1) - 1 - X) : Math.min(Z - M(path.z0), M(path.z1) - 1 - Z);
      return e <= 0 ? XP.woodD : deck(X, Z, !alongZ);
    }
    // the wet stone bank outside the walls (long kerb blocks), then the flood
    if (inR(BK, x, z)) return slabs(X, Z, 26, 12, XP.slabW, XP.stoneDD);
    return null;
  }, { keep: (x, z) => dk.some(r => inR(r, x, z)) });
}

// ------------------------------------------------------------------ the far ring: rows of flooded houses down both sides and across the back, a city wall in the mist
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  carveMarks(c);
  const r = f.p.rnd, cap = capCol(f.p), X1 = AREA.x1 + 5.2;
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {
    const z = SZ(-17) + i * 5.6 + (r(10 + i + (s > 0 ? 20 : 0)) - 0.5) * 0.8, x = s * (X1 + r(40 + i) * 1.4);
    if (z > SZ(3.5)) break;   // the near side stays open water (nothing tall by the camera)
    farHouse(c, x, z, 24 + Math.floor(r(60 + i) * 6), 30 + Math.floor(r(80 + i) * 6), 26 + Math.floor(r(100 + i) * 10), cap, { cut: r(120 + i) < 0.25 });
  }
  for (let i = 0; i < 7; i++) {
    const x = -20 + i * 6.6 + (r(140 + i) - 0.5) * 1.2; if (r(160 + i) < 0.18) continue;
    farHouse(c, x, SZ(-11.2) - 7.6 - r(180 + i) * 1.2, 30 + Math.floor(r(200 + i) * 8), 22, 28 + Math.floor(r(220 + i) * 10), cap, { cut: r(240 + i) < 0.2 });
  }
  farWall(c, -48, 48, SZ(-11.2) - 13.5, 72, cap);
  farTower(c, -15 + r(260) * 4, SZ(-11.2) - 16, 40, 72, cap); farTower(c, 18 + r(261) * 4, SZ(-11.2) - 16, 34, 72, cap);
  for (let i = 0; i < 4; i++) deadWillow(c, (i % 2 ? 1 : -1) * (AREA.x1 + 3.2 + r(280 + i) * 1.4), SZ(-14) + i * 6.4 + r(290 + i) * 2, 4.6 + r(300 + i) * 1.4, 400 + i);
  xiapiDistantBackdrop(c, f, 'lane');
  void SX;
}

function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  xpDress(c, f);
  xiapiEdgeDress(c, f);
}

export const xpLane: Locale = {
  id: 'xp_lane', name: '浮栈巷', theme: 'xiapi',
  layouts: ['street', 'axis', 'offset', 'pair', 'garden'],
  landmarks: LANDMARKS, groups: GROUPS, filler: FILLER,
  seasons: ['winter'], times: ['overcast', 'dawn', 'dusk', 'night', 'sunset', 'day'], weathers: ['mist', 'snow', 'storm', 'clear'], noSnow: true, noLeaves: true,
  pools, floor, far, dress, infill: xiapiInfill('lane'),
};
