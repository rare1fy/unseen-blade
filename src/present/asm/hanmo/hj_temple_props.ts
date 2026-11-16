// 破庙的道具组（temple 代理）：残廊、碑林、残配殿、单阙、黄幡、夯土残墙（白土「甲子」）、战鼓兵栏、古柏、枯树、老槐、野桃（春），
// 近排矮件：石辟邪、香炉、符水坛、粮缸、断柱、瓦砾、火盆、断碑。写法照 ninja/village.ts：foot 是世界 x × z（米，未镜像），
// 翼位的长条组把正面转向战斗区（faceOf），所以占地沿 z；方形组在后排转向镜头（orient）。
import type { Ctx } from '../../scenes/stage';
import { M } from '../../scenes/props';
import { pine, oak, deadTree } from '../../scenes/flora';
import { locM } from '../../scenes/k_village';
import { LEAF_BY, SAKURA } from '../season';
import type { Group, Place } from '../types';
import { HC, frame, faceOf, orient, up, column, bracket, hanRoof, beamDown, columnDown, tileHeap, stele, bixie, banner, bannerPole, fuRope, fireBowl, que, jiazi, smoke } from './hj_temple_kit';

const lampLight = (c: Ctx, p: Place, at: [number, number, number], k = 1, d = 4.5) => { if (p.lamp > 0.3) c.light(at, 0xff9a48, 2.4 * p.lamp * k, d); };
/** the world point of a local cell of a piece placed with frame(p.x, p.z, r) */
const wp = (p: Place, r: number, lx: number, y: number, lz: number) => locM(M(p.x), M(p.z), r, lx, y, lz);
const layers = (B: ReturnType<typeof frame>, x0: number, x1: number, z: number, y0: number, y1: number) => { for (let y = y0 + 5; y < y1; y += 6) B(x0, y, z, x1, y, z, HC.earthD); };

export const GROUPS: Group[] = [
  // ---- big (L)
  { id: 'hj_colonnade', name: '残廊', tags: ['building', 'ruin'], foot: { w: 2.8, d: 4.6 }, h: 4.7, kinds: ['wing', 'corner', 'back'], size: 'L', weight: 1.3, build(c, p) {
    const r = faceOf(p.s || 1), B = frame(c.w, p.x, p.z, r), U = up(B, 4);
    B(-31, -1, -16, 31, 3, 12, HC.stone); B(-31, 3, -16, 31, 3, 12, HC.earthL); B(-31, 3, 10, 31, 3, 12, HC.stoneL); B(-31, -1, 12, 31, 0, 12, HC.stoneD);
    B(-31, 4, -15, -12, 36, -12, HC.earth); B(-11, 4, -15, 8, 26, -12, HC.earth); B(9, 4, -15, 31, 14, -12, HC.earth); layers(B, -31, 31, -12, 4, 36);
    column(U, -22, 6, 46); column(U, 0, 6, 46); column(U, 22, 6, 16, { broken: true });
    bracket(U, -22, 6, 47); bracket(U, 0, 6, 47);
    B(-30, 58, 3, 8, 60, 9, HC.woodD); B(-30, 59, 9, 8, 59, 9, HC.redD);
    hanRoof(B, -38, 12, -6, 15, 61, [[0, 3], [6, 3]], 1, { cut1: true, ridge: false });
    banner(B, -18, -4, 10, 58, 28, { fu: true, rod: false });
    beamDown(U, 6, 28, -5); tileHeap(U, 20, -7, 8, 4, 2);
  } },
  { id: 'hj_steles', name: '碑林', tags: ['stone', 'stele'], foot: { w: 2.6, d: 4.2 }, h: 2.7, kinds: ['wing'], size: 'L', weight: 1.2, build(c, p) {
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    stele(B, -16, -2, 'whole', { fu: true }); stele(B, 16, -2, 'broken');
    B(-30, -1, 13, -4, 1, 24, HC.stone); B(-27, 2, 15, -7, 2, 22, HC.stoneD); B(-34, -1, 15, -31, 0, 22, HC.stoneL);
  } },
  { id: 'hj_sidehall', name: '残配殿', tags: ['building', 'ruin', 'light'], foot: { w: 4.0, d: 4.0 }, h: 4.4, kinds: ['corner', 'wing', 'back'], size: 'L', build(c, p) {
    const r = orient(p), B = frame(c.w, p.x, p.z, r), U = up(B, 3);
    B(-28, -1, -26, 28, 2, 24, HC.stone); B(-28, 2, -26, 28, 2, 24, HC.earthL); B(-28, -1, 24, 28, 0, 24, HC.stoneD);
    B(-26, 3, -24, 0, 38, -21, HC.earth); B(1, 3, -24, 26, 22, -21, HC.earth); layers(B, -26, 26, -21, 3, 38);
    B(-26, 3, -20, -23, 38, 8, HC.earth); B(-26, 3, 9, -23, 24, 16, HC.earth); B(23, 3, -20, 26, 16, 0, HC.earth);
    column(U, -14, 14, 35); column(U, 14, 14, 14, { broken: true, char: true });
    hanRoof(B, -32, 0, -30, 20, 39, [[0, 3], [6, 3]], 1, { cut1: true });
    banner(B, -8, 8, -20, 32, 22, { fu: true });
    tileHeap(U, 12, -6, 10, 8, 3); beamDown(U, 2, 22, 8);
    const lit = p.time !== 'day', f = fireBowl(U, -14, -8, lit, 5);
    if (lit) lampLight(c, p, wp(p, r, f[0], f[1] + 3 + 3, f[2]), 0.9, 5);
  } },
  { id: 'hj_camp', name: '黄巾营', tags: ['camp', 'fire', 'light', 'cloth'], foot: { w: 3.2, d: 4.4 }, h: 2.6, kinds: ['wing'], size: 'L', build(c, p) {
    const r = faceOf(p.s || 1), B = frame(c.w, p.x, p.z, r), CAN = 0xb09050;
    for (const a of [-27, 27]) for (const b of [-16, 8]) B(a - 1, -1, b - 1, a + 1, 34, b + 1, HC.woodD);
    B(-30, 35, -18, 30, 35, 10, CAN); B(-20, 34, -12, 20, 34, 4, CAN);
    for (let a = -30; a <= 22; a += 8) B(a, 31, 10, a + 4, 34, 10, HC.yelD);
    B(-24, -1, -14, 24, -1, 4, HC.sackD);
    for (const [a, b] of [[12, -12], [20, -12], [16, -4]] as const) { B(a - 3, -1, b - 3, a + 3, 5, b + 3, HC.sack); B(a - 1, 6, b - 1, a + 1, 7, b + 1, HC.sackD); }
    for (const a of [-22, -18, -14]) { B(a, -1, -15, a, 28, -15, HC.woodL); B(a, 29, -15, a, 32, -15, HC.ironL); B(a - 1, 26, -15, a + 1, 27, -15, HC.yel); }
    B(-25, 14, -16, -11, 14, -16, HC.woodD);
    // the cookfire in front: a ring of stones, a pot on a crossbar
    for (const [a, b] of [[-6, 18], [6, 18], [0, 12], [0, 24]] as const) B(a - 2, -1, b - 2, a + 2, 1, b + 2, HC.stoneD);
    const lit = p.time !== 'day' || p.rnd(1) < 0.5;
    if (lit) { B(-3, 0, 15, 3, 0, 21, HC.ember, 1); B(-1, 1, 17, 1, 3, 19, HC.flame, 1); } else B(-3, 0, 15, 3, 0, 21, HC.ash);
    for (const a of [-9, 9]) B(a, -1, 18, a, 16, 18, HC.woodD); B(-9, 17, 18, 9, 17, 18, HC.wood);
    B(-3, 7, 15, 3, 11, 21, HC.iron); B(-4, 12, 14, 4, 12, 22, HC.ironL); B(0, 13, 18, 0, 16, 18, HC.woodD);
    if (lit) { const f = wp(p, r, 0, 4, 18); lampLight(c, p, f, 1.1, 5); smoke(c, [f[0], f[1] + 1.0, f[2]], { rate: 2 }); }
  } },
  { id: 'hj_que', name: '单阙', tags: ['tall', 'que', 'light'], foot: { w: 3.6, d: 2.2 }, h: 4.8, kinds: ['back'], size: 'L', max: 2, weight: 3, build(c, p) {
    const B = frame(c.w, p.x, p.z, 0), m = (p.x >= 0 ? 1 : -1) as 1 | -1;
    que(B, 0, m, { broken: p.rnd(1) < 0.4, panel: true });
    banner(B, -6, 6, 8, 44, 30, { fu: true });
    const lit = p.time !== 'day', f = fireBowl(B, -m * 22, 4, lit, 6);
    if (lit) lampLight(c, p, wp(p, 0, f[0], f[1] + 4, f[2]), 1, 5);
  } },
  // ---- middle (M)
  { id: 'hj_banners', name: '黄巾幡', tags: ['tall', 'cloth'], foot: { w: 1.4, d: 3.4 }, h: 5.2, kinds: ['wing', 'corner', 'back'], size: 'M', weight: 1.4, build(c, p) {
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    bannerPole(B, -16, 0, 60 + Math.floor(p.rnd(1) * 10)); bannerPole(B, 0, 0, 70, { fu: true, len: 40 }); bannerPole(B, 16, 0, 54);
  } },
  { id: 'hj_wall', name: '夯土残墙', tags: ['wall', 'ruin'], foot: { w: 3.6, d: 1.4 }, h: 3.3, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    const B = frame(c.w, p.x, p.z, 0);
    B(-25, -1, -5, 25, 1, 5, HC.stoneD);
    B(-24, 2, -4, -9, 40, 4, HC.earth); B(-8, 2, -4, 7, 28, 4, HC.earth); B(8, 2, -4, 24, 36, 4, HC.earth);
    for (let y = 7; y <= 40; y += 6) { B(-24, y, 4, -9, y, 4, HC.earthD); if (y <= 28) B(-8, y, 4, 7, y, 4, HC.earthD); if (y <= 36) B(8, y, 4, 24, y, 4, HC.earthD); }
    hanRoof(B, -27, -8, -7, 7, 41, [[0, 2], [3, 2]], 0, { cut1: true, ridge: false });
    jiazi(B, 0, 25, 4, 2);
    B(-6, -1, 6, 6, 2, 11, HC.earthD); B(-3, 3, 7, 3, 4, 10, HC.earth);
    B(12, 37, -4, 19, 37, 5, HC.yel); B(12, 22, 5, 19, 37, 5, HC.yel); B(12, 22, 5, 14, 24, 5, null);
  } },
  { id: 'hj_drum', name: '战鼓兵栏', tags: ['camp', 'drum'], foot: { w: 3.2, d: 3.2 }, h: 2.6, kinds: ['wing', 'back'], size: 'M', build(c, p) {
    const B = frame(c.w, p.x, p.z, orient(p)), dx = -10;
    B(dx - 12, -1, -6, dx + 12, 2, 6, HC.woodD); B(dx - 6, 3, -4, dx + 6, 8, 4, HC.wood);
    B(dx - 9, 11, -5, dx + 9, 25, 5, HC.red); B(dx - 7, 9, -5, dx + 7, 27, 5, HC.red);
    for (const z of [-6, 6]) { B(dx - 7, 11, z, dx + 7, 25, z, HC.hide); B(dx - 5, 9, z, dx + 5, 27, z, HC.hide); }
    B(dx - 2, 16, 6, dx + 2, 20, 6, HC.ink);
    B(dx - 9, 18, -5, dx + 9, 18, 5, HC.redD);
    for (const a of [8, 21]) B(a, -1, -1, a + 1, 26, 0, HC.woodD);
    for (const y of [10, 22]) B(8, y, 1, 21, y, 1, HC.wood);
    for (const a of [10, 13, 16, 19]) { B(a, 0, 2, a, 30, 2, HC.woodL); B(a, 31, 2, a, 35, 2, HC.ironL); B(a - 1, 28, 2, a + 1, 29, 3, HC.yel); }
    B(17, 33, 2, 19, 33, 2, HC.ironL);
  } },
  { id: 'hj_streamers', name: '符纸绳', tags: ['cloth', 'fu'], foot: { w: 1.0, d: 3.6 }, h: 2.6, kinds: ['wing'], size: 'M', build(c, p) {
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    for (const a of [-24, 24]) { B(a - 3, -1, -3, a + 3, 1, 3, HC.stoneD); B(a - 1, 2, -1, a + 1, 34, 1, HC.woodD); }
    fuRope(B, -23, 23, 0, 32); fuRope(B, -23, 23, 0, 21);
    B(-4, -1, -4, 4, 6, 4, HC.clay); B(-3, 7, -3, 3, 7, 3, HC.clayL); B(-2, 7, -2, 2, 7, 2, HC.water);
  } },
  { id: 'hj_cypress', name: '古柏', tags: ['tree', 'tall'], foot: { w: 2.0, d: 2.0 }, h: 8.0, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, weight: 1.3, build(c, p) {
    pine(c.w, p.x, p.z, 6.4 + p.rnd(1) * 1.4, 0x4a3a30, 0x2c3e36, 0x3e5448, { seed: p.seed, slim: 0.72 });
    const B = frame(c.w, p.x, p.z, 0);
    B(-11, -1, -11, 11, 0, -10, HC.stoneD); B(-11, -1, 10, 11, 0, 11, HC.stoneD); B(-11, -1, -11, -10, 0, 11, HC.stoneD); B(10, -1, -11, 11, 0, 11, HC.stoneD);
    // a 黄巾 tied to a stake in front of the old tree
    if (p.rnd(2) < 0.6) { B(8, -1, 8, 9, 16, 9, HC.woodD); B(7, 12, 10, 10, 16, 10, HC.yel); B(8, 6, 10, 9, 11, 10, HC.yel); }
  } },
  { id: 'hj_deadtree', name: '枯树', tags: ['tree', 'dead'], foot: { w: 2.0, d: 2.0 }, h: 7.0, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, build(c, p) {
    deadTree(c.w, p.x, p.z, 5.2 + p.rnd(1) * 1.2, 0x4e4640, 0x2e2a26, { seed: p.seed, crow: 0.5, moss: 0.3, hang: 'deadvine' });
  } },
  { id: 'hj_huai', name: '老槐', tags: ['tree'], foot: { w: 2.2, d: 2.2 }, h: 7.2, kinds: ['wing', 'back', 'corner'], size: 'M', seasons: ['summer', 'autumn', 'winter'], build(c, p) {
    const col = LEAF_BY[p.season];
    oak(c.w, p.x, p.z, 5.2 + p.rnd(1) * 1.4, { seed: p.seed, bark: 0x4a3c30, dark: 0x30261e, leaf: col[0], leafTop: col[1], low: 0.42, width: 1.15, vines: 0 });
  } },
  { id: 'hj_peach', name: '野桃', tags: ['tree', 'spring'], foot: { w: 2.2, d: 2.2 }, h: 6.8, kinds: ['wing', 'back', 'corner'], size: 'M', seasons: ['spring'], weight: 2, build(c, p) {
    const col = SAKURA[Math.floor(p.rnd(1) * SAKURA.length) % SAKURA.length];
    oak(c.w, p.x, p.z, 4.8 + p.rnd(2) * 1.2, { seed: p.seed, bark: 0x3e2e28, dark: 0x281c18, leaf: col[0], leafTop: col[1], low: 0.42, width: 1.1, vines: 0 });
  } },
  // ---- small (S): the near rows take only the low ones (≤ 1.6 m)
  { id: 'hj_bixie', name: '石辟邪', tags: ['stone', 'beast'], foot: { w: 2.0, d: 2.0 }, h: 1.6, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
    bixie(frame(c.w, p.x, p.z, orient(p)), 0, 0, { headless: p.rnd(1) < 0.4 });
  } },
  { id: 'hj_censer', name: '香炉', tags: ['bronze', 'light'], foot: { w: 1.6, d: 1.6 }, h: 1.6, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    const r = orient(p), B = frame(c.w, p.x, p.z, r);
    B(-9, -1, -9, 9, 4, 9, HC.stoneD); B(-8, 5, -8, 8, 5, 8, HC.stone);
    for (const a of [-6, 5]) for (const b of [-6, 5]) B(a, 6, b, a + 1, 9, b + 1, HC.bronzeD);
    B(-7, 10, -7, 7, 17, 7, HC.bronze); B(-7, 14, -7, 7, 15, 7, HC.bronzeD); B(-8, 18, -8, 8, 18, 8, HC.bronzeL); B(-6, 16, -6, 6, 18, 6, null);
    B(-6, 16, -6, 6, 16, 6, HC.ember, 1);
    for (const a of [-8, 8]) B(a, 19, -2, a, 22, 2, HC.bronzeL);
    for (const a of [-2, 0, 2]) { B(a, 17, 0, a, 20, 0, HC.bambooD); B(a, 21, 0, a, 21, 0, HC.flame, 1); }
    const f = wp(p, r, 0, 18, 0); smoke(c, [f[0], f[1] + 0.3, f[2]], { rate: 1.2, col: 0xb8b0a4 }); lampLight(c, p, f, 0.6, 3.5);
  } },
  { id: 'hj_altar', name: '符水坛', tags: ['altar', 'fu'], foot: { w: 2.2, d: 2.2 }, h: 1.6, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    const B = frame(c.w, p.x, p.z, orient(p));
    for (const a of [-11, 11]) for (const b of [-5, 5]) B(a, -1, b, a, 8, b, HC.woodD);
    B(-12, 9, -6, 12, 9, 6, HC.woodL); B(-10, 10, -6, 10, 10, 6, HC.yel); B(-10, 3, 7, 10, 10, 7, HC.yel);
    B(0, 4, 7, 0, 9, 7, HC.ink); B(-3, 8, 7, 3, 8, 7, HC.ink); B(-2, 5, 7, 2, 5, 7, HC.ink);
    for (const a of [-7, 0, 7]) { B(a - 2, 11, -2, a + 2, 12, 2, HC.clayL); B(a - 1, 12, -1, a + 1, 12, 1, HC.waterG, 1); }
    B(9, 11, -5, 11, 12, -3, HC.yelL);
    B(14, -1, -2, 18, 1, 2, HC.stoneD); B(16, 2, 0, 16, 21, 0, HC.bamboo); for (const y of [5, 9, 13, 17]) B(16, y, 0, 16, y, 0, HC.bambooD); B(15, 21, -1, 17, 22, 1, HC.yel);
    B(-8, -1, 9, 8, -1, 13, HC.sackD);
  } },
  { id: 'hj_jars', name: '粮缸', tags: ['store', 'low'], foot: { w: 2.2, d: 2.2 }, h: 1.1, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    const B = frame(c.w, p.x, p.z, orient(p));
    const jar = (x: number, z: number, h: number, whole: boolean) => {
      B(x - 5, -1, z - 3, x + 5, h, z + 3, HC.clay); B(x - 3, -1, z - 5, x + 3, h, z + 5, HC.clay); B(x - 5, h - 3, z - 3, x + 5, h - 3, z + 3, HC.clayD); B(x - 3, h - 3, z - 5, x + 3, h - 3, z + 5, HC.clayD);
      if (whole) { B(x - 3, h + 1, z - 3, x + 3, h + 1, z + 3, HC.clayL); B(x - 2, h + 1, z - 2, x + 2, h + 1, z + 2, HC.grain); } else B(x - 2, h, z - 2, x + 2, h, z + 2, HC.clayD);
    };
    jar(-7, -6, 13, true); jar(6, -7, 11, true); jar(-1, 7, 6, false);
    B(-3, -1, 13, 7, -1, 16, HC.grain); B(9, -1, 6, 13, 1, 9, HC.clayL);
    B(9, -1, 2, 15, 4, 8, HC.sack); B(10, 5, 3, 14, 6, 7, HC.sackD);
  } },
  { id: 'hj_stumps', name: '断柱', tags: ['ruin', 'low'], foot: { w: 2.4, d: 2.4 }, h: 1.5, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    const B = frame(c.w, p.x, p.z, orient(p));
    column(B, -9, -5, 15, { broken: true }); column(B, 8, -6, 9, { broken: true, char: true }); columnDown(B, -12, 14, 8);
  } },
  { id: 'hj_rubble', name: '瓦砾焦梁', tags: ['ruin', 'low'], foot: { w: 2.2, d: 2.2 }, h: 0.9, kinds: ['wing', 'back'], size: 'S', weight: 1.2, build(c, p) {
    const B = frame(c.w, p.x, p.z, orient(p));
    tileHeap(B, -2, 0, 13, 9, 3); B(-15, 9, 1, 11, 10, 3, HC.char);
    if (p.time !== 'day') B(-5, 6, -2, -1, 6, 1, HC.ember, 1);
  } },
  { id: 'hj_firebowl', name: '火盆', tags: ['fire', 'light', 'low'], foot: { w: 1.2, d: 1.2 }, h: 1.3, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
    const B = frame(c.w, p.x, p.z, 0), lit = p.time !== 'day' || p.rnd(1) < 0.3, f = fireBowl(B, 0, 0, lit, 7);
    if (lit) lampLight(c, p, wp(p, 0, f[0], f[1] + 4, f[2]), 1, 5);
  } },
  { id: 'hj_fallenstele', name: '断碑', tags: ['stone', 'stele', 'low'], foot: { w: 1.4, d: 2.6 }, h: 0.5, kinds: ['wing'], size: 'S', build(c, p) {
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    B(-17, -1, -6, -2, 2, 6, HC.stone); B(-14, 3, -4, -4, 3, 4, HC.stoneD); B(1, -1, -5, 14, 1, 7, HC.stone); B(3, 2, -3, 12, 2, 5, HC.stoneD); B(15, -1, -3, 18, 1, 5, HC.stoneL);
    B(-11, 4, -1, -8, 4, 2, HC.yel);
  } },
];

export const FILLER: Group[] = [
  { id: 'f_tiles', name: '碎瓦', tags: ['low'], foot: { w: 1.0, d: 0.9 }, h: 0.4, kinds: ['wing'], size: 'S', max: 3, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    tileHeap(frame(c.w, p.x, p.z), 0, 0, 6, 5, 2);
  } },
  { id: 'f_jar', name: '破缸', tags: ['low'], foot: { w: 0.9, d: 0.9 }, h: 0.6, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    const B = frame(c.w, p.x, p.z); B(-4, -1, -3, 4, 6, 3, HC.clay); B(-3, -1, -4, 3, 6, 4, HC.clay); B(-2, 6, -2, 2, 6, 2, HC.clayD);
  } },
  { id: 'f_stone', name: '残石', tags: ['low'], foot: { w: 1.0, d: 0.9 }, h: 0.5, kinds: ['wing'], size: 'S', max: 3, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    const B = frame(c.w, p.x, p.z); B(-6, -1, -4, 6, 3, 4, HC.stoneD); B(-4, 4, -3, 3, 6, 2, HC.stone);
  } },
  { id: 'f_beam', name: '焦梁', tags: ['low'], foot: { w: 1.4, d: 0.6 }, h: 0.2, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    beamDown(frame(c.w, p.x, p.z), -9, 9, 0, 0);
  } },
];
