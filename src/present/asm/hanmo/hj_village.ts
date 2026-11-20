// 地域一 · 残村（黄巾残村，village 代理）：黄巾军过后的华北农村。夯土墙、灰褐茅草的悬山农舍（有的烧掉半边，只剩黑椽）、院墙门楼、
// 石磨、辘轳井、牛车、粮囷、土地庙、土灶、余烬堆、柴垛、陶瓮、晾架、打谷场、田垄与桔槔、桑树和烧焦的榆树；黄巾旗、戟架、丢在地上的黄头巾只做点缀。
// 地标三选一：村口大槐（寨墙、门楼、大槐树、石碑）/ 祠堂（台基、朱柱、三间、灰瓦，一头烧塌）/ 坞堡望楼（高夯土坞壁、烧掉顶层的望楼）。
// 主色：黄土、夯土赭黄、灰褐茅草、灰瓦、焦黑木；黄巾黄只在旗和头巾上。写法照忍里：foot（米，未镜像），h、kinds、size；build 以 p.x / p.z 为锚点。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, PLAY, hash, SX, SZ, STAGE_BIG } from '../../scenes/props';
import { oak, deadTree, plot, tone } from '../../scenes/flora';
import { ground } from '../../scenes/dress';
import { LEAF_BY } from '../season';
import type { ArenaPlan } from '../arena';
import type { Group, Landmark, Layout, Locale, Place, Rect, SeasonId } from '../types';
import { HV, frame, faceOf, orient, house, yardWall, yardWallZ, roof, earth, jar, strawStack, disc, smoke, stain } from './hj_village_kit';
import { mill, well, oxCart, cartJar, granary, shrine, stove, emberHeap, banner, bannerDown, jiRack, headbands, woodpile, trough, roller, grainHeap, winnow, fork, rack, rows, sweep, gate, wattle } from './hj_village_props';
import { villageInfill } from './hj_infill';
import { cropOf, wheatBed } from './hj_field_kit';

const night = (p: Place) => p.lamp > 0.3;
const fireLight = (c: Ctx, p: Place, at: [number, number, number], k = 1, d = 4.5) => { if (night(p)) c.light(at, 0xff8a3a, 2.4 * p.lamp * k, d); };
const GRASS: Record<SeasonId, [number, number, number]> = {
  spring: [0x6a7a40, 0x5c6c38, 0x7a8a4c], summer: [0x5a6e36, 0x4c602e, 0x6a7e40], autumn: [0x86784a, 0x72663e, 0x968858], winter: [0x7c7464, 0x6c6658, 0x8a8272],
};

// ------------------------------------------------------------------ landmarks
const LANDMARKS: Landmark[] = [
  { id: 'huaishu', name: '村口大槐', foot: { w: 10, d: 5.6 }, tags: ['gate', 'tree'], build(c, p) {
    // the village wall across the back with a roofed gate in it (one leaf fallen), the great locust tree on its stone ring, a stele
    const B = frame(c.w, p.x, p.z), t = p.rnd(1) < 0.5 ? -1 : 1;
    yardWall(B, -70, -15, -26, 32, { drops: [[-70, -56, 10]] }); yardWall(B, 15, 70, -26, 32, { drops: [[52, 70, 12]] });
    for (const s of [-1, 1]) earth(B, s > 0 ? 11 : -18, 0, -31, s > 0 ? 18 : -11, 38, -21);
    gate(B, 0, -26, 10, 36, 'down');
    banner(B, 6, -20, 34, 8, 16);
    const tx = t * -42;
    B(tx - 12, -1, -16, tx + 12, 2, 6, HV.stoneD); B(tx - 11, 2, -15, tx + 11, 2, 5, HV.earthD);
    oak(c.w, p.x + tx * 0.07, p.z - 0.35, 8.2 + p.rnd(2) * 0.8, { seed: p.seed, bark: 0x4a3c30, dark: 0x30261e, leaf: LEAF_BY[p.season][0], leafTop: LEAF_BY[p.season][1], low: 0.36, width: 1.3, vines: 0 });
    const sx = Math.round(-tx * 0.55); B(sx - 4, 0, -14, sx + 4, 3, -9, HV.stoneD); B(sx - 3, 4, -13, sx + 3, 24, -10, HV.stone); B(sx - 2, 8, -10, sx + 2, 20, -10, HV.stoneD);
    B(sx - 4, 25, -14, sx + 4, 26, -9, HV.stoneL); B(sx - 3, 27, -13, sx + 3, 27, -10, HV.stone);
    headbands(B, [[-4, -8, true], [12, -4, false]]);
  } },
  { id: 'citang', name: '祠堂', foot: { w: 9, d: 5.0 }, tags: ['building', 'hall'], build(c, p) {
    // a stone-kerbed terrace, three bays behind four red columns, doors in the middle bay, barred windows in the side bays, a three-tier
    // tile roof; the −x end of the roof burnt in, one column charred; a bronze ding in front, a yellow banner on the right column
    const X = M(p.x), Z = M(p.z), B = frame(c.w, p.x, p.z), lit = night(p);
    B(-58, -1, -32, 58, 4, 10, HV.earthD); B(-58, 5, -32, 58, 5, 10, HV.stoneL); B(-58, 0, 10, 58, 4, 10, HV.stone);
    B(-14, 0, 11, 14, 2, 15, HV.stone);
    earth(B, -46, 6, -28, 46, 34, -24); earth(B, -46, 6, -28, -43, 34, -8); earth(B, 43, 6, -28, 46, 34, -8);
    B(-46, 6, -11, 46, 34, -8, HV.earthL); B(-12, 6, -10, 12, 30, -8, null); B(-12, 6, -12, 12, 30, -12, lit ? HV.glow : HV.dark, lit ? 1 : 0);
    for (const s of [-1, 1]) { B(s * 29 - 9, 14, -8, s * 29 + 9, 26, -8, HV.dark); for (let u = s * 29 - 8; u <= s * 29 + 8; u += 2) B(u, 14, -7, u, 26, -7, HV.woodL); }
    for (const a of [-45, -15, 14, 44]) B(a, 6, -5, a + 2, 35, -3, a === -45 ? HV.char : HV.red);
    B(-48, 33, -6, 48, 36, -2, HV.woodD); B(-48, 34, -6, 48, 34, -2, HV.redD);
    const top = roof(B, -56, 56, -34, 4, 37, 'tile', { tiers: 3 });
    B(-57, 37, -35, -30, top + 2, 5, null);
    stain(c.w, X, Z, 0, -29, 37, -35, -28, top, 5, HV.charL);
    for (let a = -47; a <= -32; a += 7) B(a, 35, -28, a + 1, 36, -2, HV.char);
     B(-58, 6, 2, -40, 7, 6, HV.char);
    B(14, 0, 18, 20, 0, 18, HV.wood);
    // the ding on the terrace: four legs, body, two ears, ash
    for (const [a, b] of [[-5, -1], [4, -1], [-5, 4], [4, 4]]) B(a, 6, b, a + 1, 7, b + 1, HV.bronze);
    B(-5, 8, -1, 5, 13, 5, HV.bronze); B(-4, 13, 0, 4, 13, 4, HV.ashL); B(-5, 14, 1, -4, 16, 3, HV.bronzeL); B(4, 14, 1, 5, 16, 3, HV.bronzeL);
    banner(B, 18, -6, 34, 7, 16);
    if (lit) c.light([p.x, 1.4, p.z - 0.8], 0xffa050, 2.2 * p.lamp, 5);
  } },
  { id: 'wanglou', name: '坞堡望楼', foot: { w: 10, d: 5.0 }, tags: ['tall', 'tower'], build(c, p) {
    // the manor's high rammed-earth wall with a parapet and a burnt gate; the watchtower astride the wall on one side: an earth base, a
    // timber storey with a balcony and a barred window under a tile waist-eave, the top storey burnt to charred posts
    const X = M(p.x), Z = M(p.z), B = frame(c.w, p.x, p.z), s = p.rnd(1) < 0.5 ? 1 : -1, T = (a: number) => a * s;
    const Bs = (a0: number, y0: number, z0: number, a1: number, y1: number, z1: number, col: number | null, g = 0) => B(T(a0), y0, z0, T(a1), y1, z1, col, g);
    Bs(-70, -1, -30, 70, 0, -22, HV.stoneD);
    earth(B, -70, 1, -30, 70, 30, -23);
    for (let a = -70; a <= 64; a += 10) Bs(a, 31, -24, a + 5, 34, -23, HV.earth);
    Bs(-10, 1, -30, 10, 26, -23, null); Bs(-11, 0, -31, 11, 26, -31, HV.dark); Bs(-12, 27, -24, 12, 28, -22, HV.char);
    Bs(-9, 0, -20, 1, 0, -10, HV.char); Bs(-9, 0, -16, 1, 0, -16, HV.charD);
    Bs(-60, 22, -30, -40, 34, -23, null); Bs(-62, 0, -21, -40, 6, -14, HV.earthD); Bs(-58, 7, -20, -46, 9, -16, HV.earthS);
    Bs(36, -1, -36, 64, 0, -14, HV.stoneD); earth(B, T(38), 1, -34, T(62), 30, -16);
    for (const a of [38, 59]) for (const b of [-34, -19]) Bs(a, 31, b, a + 3, 52, b + 3, HV.post);
    Bs(40, 31, -32, 60, 50, -18, HV.wood); for (let y = 35; y < 50; y += 5) Bs(40, y, -18, 60, y, -18, HV.woodD);
    Bs(45, 38, -17, 55, 46, -17, HV.dark); for (let u = 46; u <= 54; u += 2) Bs(u, 38, -16, u, 46, -16, HV.woodL);
    Bs(35, 31, -37, 65, 32, -13, HV.woodD); for (let u = 35; u <= 65; u += 5) Bs(u, 33, -13, u, 36, -13, HV.post); Bs(35, 37, -13, 65, 37, -13, HV.woodD);
    Bs(33, 53, -39, 67, 55, -11, HV.tile); Bs(33, 55, -39, 67, 55, -11, HV.tileL); Bs(33, 53, -11, 67, 53, -11, HV.tileD);
    Bs(39, 56, -33, 61, 56, -17, HV.char);
    for (const [a, b, h] of [[39, -33, 66], [58, -33, 61], [39, -20, 59], [58, -20, 64]] as const) Bs(a, 57, b, a + 2, h, b + 2, HV.char);
    Bs(39, 60, -33, 58, 61, -32, HV.charD);
    banner(B, T(-16) - (s < 0 ? 1 : 0), -22, 52, 7, 14);
    if (night(p)) { Bs(45, 57, -28, 52, 57, -24, HV.ember, 1); c.light([p.x + s * 3.4, 4.2, p.z - 1.8], 0xff7a30, 2.0 * p.lamp, 5); }
    smoke(c, [p.x + s * 3.4, 4.4, p.z - 1.8], { rate: 1.6, col: 0x6e6862 });
    void X; void Z;
  } },
];

// ------------------------------------------------------------------ groups
const G: Group[] = [
  // ---- L
  { id: 'canwu', name: '残屋', tags: ['building', 'burnt'], foot: { w: 3.6, d: 3.6 }, h: 3.1, kinds: ['wing', 'back', 'corner'], size: 'L', weight: 1.4, build(c, p) {
    const r = orient(p), b = p.rnd(1) < 0.6 ? 1 : 2, q = house(c, p.x, p.z, r, { hw: 24, hd: 15, H: 28, burnt: b, lit: night(p), cut: -2 + Math.round(p.rnd(2) * 8), wins: [-14, 14] });
    const B = frame(c.w, p.x, p.z, r);
    B(-22, 0, 19, -12, 3, 24, HV.earthD); B(-20, 4, 20, -14, 5, 23, HV.soot); B(-8, 0, 21, 12, 1, 22, HV.char);
    headbands(B, [[16, 21, true]]);
    if (q.ember) { fireLight(c, p, q.ember, 0.8, 4); smoke(c, q.ember, { rate: 1.4, col: 0x6e6862 }); }
  } },
  { id: 'xiaoyuan', name: '小院', tags: ['building', 'house'], foot: { w: 3.8, d: 3.8 }, h: 3.0, kinds: ['wing', 'back', 'corner'], size: 'L', build(c, p) {
    const r = orient(p), lit = night(p) && p.rnd(1) < 0.6, q = house(c, p.x, p.z - (r === 0 ? 0.8 : 0), r, { hw: 20, hd: 13, H: 26, lit, door: 0, wins: [-12, 12] });
    if (lit) c.light(q.door, 0xff9a48, 1.8 * p.lamp, 4);
    if (lit || p.rnd(2) < 0.3) smoke(c, q.smoke, { rate: 1.4 });
    const B = frame(c.w, p.x, p.z - (r === 0 ? 0.8 : 0), r);
    yardWall(B, -24, -6, 37, 16); yardWall(B, 7, 24, 37, 16, { drops: [[16, 24, 6]] }); yardWallZ(B, 16, 35, -23, 16); yardWallZ(B, 16, 35, 23, 16);
    jar(B, -16, 22, 1, true); jar(B, -16, 30, 0, false); B(12, 0, 20, 20, 2, 24, HV.wood);
  } },
  { id: 'dagu', name: '打谷场', tags: ['field', 'low'], foot: { w: 3.8, d: 3.8 }, h: 1.8, kinds: ['wing', 'corner'], size: 'L', build(c, p) {
    const B = frame(c.w, p.x, p.z, faceOf(p.s));
    B(-26, -1, -26, 26, -1, 26, HV.track); for (const k of [-26, 26]) { B(-26, -1, k, 26, -1, k, HV.loessD); B(k, -1, -26, k, -1, 26, HV.loessD); }
    roller(B, -4, 6);
    strawStack(B, -15, -15, 9, 24); strawStack(B, 15, -17, 7, 18);
    winnow(B, 14, 12); grainHeap(B, 15, 0, 6); fork(B, -22, -8, 18);
    for (let i = 0; i < 6; i++) c.cards.add('straw', p.x + (p.rnd(10 + i) - 0.5) * 3, p.z + (p.rnd(20 + i) - 0.5) * 3, { y: 0.004, s: 0.9 });
  } },
  { id: 'tian', name: '田垄', tags: ['field', 'low'], foot: { w: 4.0, d: 4.2 }, h: 1.7, kinds: ['wing', 'corner'], size: 'L', build(c, p) {
    const B = frame(c.w, p.x, p.z, faceOf(p.s));
    rows(B, -22, 24, -28, 28, p.season);
    wattle(B, -24, 24, -30, 7);
    sweep(B, -27, -2);
  } },
  { id: 'zhengfang', name: '正房', tags: ['building', 'house'], foot: { w: 5.8, d: 3.0 }, h: 3.4, kinds: ['back'], size: 'L', build(c, p) {
    const lit = night(p) && p.rnd(1) < 0.5, q = house(c, p.x - 0.4, p.z, 0, { hw: 30, hd: 13, H: 28, tiers: 3, roof: p.rnd(2) < 0.5 ? 'tile' : 'thatch', lit, wins: [-18, 18] });
    if (lit) c.light(q.door, 0xff9a48, 1.8 * p.lamp, 4);
    const B = frame(c.w, p.x - 0.4, p.z);
    for (const b of [-10, 10]) B(43, 0, b, 44, 22, b + 1, HV.post);
    roof(B, 32, 47, -14, 14, 23, 'thatch', { tiers: 1 });
    oxCart(c, p.x + 2.7, p.z + 0.3, -1, true, 0.1);
  } },
  // ---- M
  { id: 'shimo', name: '石磨', tags: ['stone'], foot: { w: 2.8, d: 2.8 }, h: 2.9, kinds: ['wing', 'corner'], size: 'M', build(c, p) { mill(c, p.x, p.z, orient(p), p.rnd(1) < 0.6); } },
  { id: 'jing', name: '辘轳井', tags: ['water', 'well'], foot: { w: 2.4, d: 2.0 }, h: 2.6, kinds: ['wing', 'back'], size: 'M', build(c, p) { well(c, p.x, p.z, orient(p)); } },
  { id: 'niuche', name: '牛车', tags: ['cart'], foot: { w: 3.2, d: 2.0 }, h: 1.5, kinds: ['wing', 'back'], size: 'M', build(c, p) {
    const d: 1 | -1 = p.s > 0 ? -1 : 1, load = p.rnd(1), x = p.x - d * 0.45;
    oxCart(c, x, p.z, d, p.rnd(2) < 0.35, load); if (load > 0.33) cartJar(c, x, p.z, d, load > 0.5);
  } },
  { id: 'liangqun', name: '粮囷', tags: ['store', 'tall'], foot: { w: 2.2, d: 2.2 }, h: 3.0, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) { granary(c, p.x, p.z, orient(p)); } },
  { id: 'sangshu', name: '桑树', tags: ['tree'], foot: { w: 2.2, d: 2.2 }, h: 6.8, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, build(c, p) {
    const L = LEAF_BY[p.season];
    oak(c.w, p.x, p.z, 5.4 + p.rnd(1) * 1.2, { seed: p.seed, bark: 0x4e3e30, dark: 0x30261e, leaf: L[0], leafTop: L[1], low: 0.42, width: 1.1, vines: 0 });
    const B = frame(c.w, p.x - 0.7 * (p.s || 1), p.z + 0.7); disc(B, 0, 0, 3, 0, 3, HV.straw); disc(B, 0, 0, 2, 3, 3, HV.strawD);
  } },
  { id: 'jiaoshu', name: '焦树', tags: ['tree', 'dead'], foot: { w: 2.2, d: 2.2 }, h: 6.0, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    const B = frame(c.w, p.x, p.z); B(-14, -1, -14, 14, -1, 14, HV.ash); B(-9, -1, -9, 9, -1, 9, 0x4a4440);
    deadTree(c.w, p.x, p.z, 4.8 + p.rnd(1) * 1.2, HV.char, HV.charD, { seed: p.seed, crow: 0.7, moss: false });
  } },
  { id: 'yuanmen', name: '院门', tags: ['wall', 'gate'], foot: { w: 3.2, d: 1.6 }, h: 2.6, kinds: ['back', 'corner'], size: 'M', build(c, p) {
    const B = frame(c.w, p.x, p.z);
    yardWall(B, -22, -9, 0, 24); yardWall(B, 9, 22, 0, 24, { drops: [[15, 22, 9]] });
    gate(B, 0, 0, 8, 28, p.rnd(1) < 0.5 ? 'open' : 'down');
    jar(B, -16, 7, 1, true, { broken: p.rnd(2) < 0.5 });
  } },
  { id: 'huangjin', name: '黄巾旗', tags: ['yellow', 'tall'], foot: { w: 3.0, d: 2.0 }, h: 3.2, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    const B = frame(c.w, p.x, p.z);
    banner(B, -18, -8, 44, 10, 22);
    jiRack(B, 10, -8, p.rnd(1) < 0.5 ? 2 : 3);
    bannerDown(B, -10, 12, 2, 12);
    headbands(B, [[-16, 8, true], [18, 6, false], [4, -2, true]]);
  } },
  { id: 'liangjia', name: '晾架', tags: ['cloth'], foot: { w: 1.6, d: 3.6 }, h: 2.1, kinds: ['wing'], size: 'M', build(c, p) { rack(c, p.x, p.z, faceOf(p.s), Math.floor(p.rnd(1) * 5)); } },
  { id: 'caoduo', name: '草垛', tags: ['straw'], foot: { w: 3.2, d: 3.2 }, h: 2.2, kinds: ['wing', 'corner'], size: 'M', build(c, p) {
    const B = frame(c.w, p.x, p.z, orient(p));
    strawStack(B, -10, -8, 11, 30); strawStack(B, 12, -9, 9, 24); strawStack(B, 1, 12, 7, 18);
    for (const a of [-16, -10]) B(a, 0, 4, a, 1, 18, HV.wood); for (let b = 6; b <= 16; b += 4) B(-16, 0, b, -10, 0, b, HV.woodL);
  } },
  // ---- S (the near rows take only ≤ 1.6 m)
  { id: 'chai', name: '柴垛', tags: ['wood', 'low'], foot: { w: 2.6, d: 2.6 }, h: 1.05, kinds: ['wing', 'back'], size: 'S', build(c, p) { woodpile(c, p.x - 0.2 * (p.s || 1), p.z, orient(p)); } },
  { id: 'taoweng', name: '陶瓮', tags: ['jar', 'low'], foot: { w: 2.2, d: 1.6 }, h: 1.0, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    const B = frame(c.w, p.x, p.z, orient(p));
    jar(B, -8, -3, 1, true); jar(B, 4, -4, 1, false, { lid: true }); jar(B, -1, 6, 0, true); jar(B, 11, 5, 0, false, { broken: true });
    B(-14, 0, 5, -11, 0, 8, HV.woodL);
  } },
  { id: 'tuzao', name: '土灶', tags: ['fire', 'light', 'low'], foot: { w: 2.6, d: 2.6 }, h: 1.45, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    const lit = p.time !== 'day' && p.rnd(1) < 0.7, q = stove(c, p.x, p.z, orient(p), lit);
    if (lit) { fireLight(c, p, q.fire, 0.8, 4); smoke(c, q.smoke, { rate: 1.6 }); }
  } },
  { id: 'yujin', name: '余烬', tags: ['fire', 'light', 'low'], foot: { w: 2.0, d: 2.0 }, h: 0.85, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    const lit = night(p), g = emberHeap(c, p.x, p.z, orient(p), lit);
    if (lit) fireLight(c, p, g, 0.7, 3.5);
    smoke(c, [g[0], g[1] + 0.3, g[2]], { rate: 1.2, col: 0x6e6862 });
  } },
  { id: 'tudimiao', name: '土地庙', tags: ['shrine', 'light', 'low'], foot: { w: 1.6, d: 1.4 }, h: 1.6, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    const lit = night(p), q = shrine(c, p.x, p.z, orient(p), lit); if (lit) c.light(q, 0xffa050, 1.6 * p.lamp, 3);
  } },
  { id: 'shicao', name: '石槽', tags: ['stone', 'low'], foot: { w: 2.4, d: 1.6 }, h: 1.25, kinds: ['wing', 'back'], size: 'S', build(c, p) { trough(c, p.x, p.z, orient(p), p.rnd(1) < 0.5); } },
];
const FILLER: Group[] = [
  { id: 'f_guan', name: '罐', tags: ['low'], foot: { w: 0.8, d: 0.8 }, h: 0.6, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    jar(frame(c.w, p.x, p.z), 0, 0, 0, p.rnd(1) < 0.5, { broken: p.rnd(2) < 0.3 });
  } },
  { id: 'f_kun', name: '草捆', tags: ['low'], foot: { w: 1.0, d: 0.8 }, h: 0.6, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    const B = frame(c.w, p.x, p.z); B(-6, 0, -4, 6, 6, 4, HV.straw); for (const a of [-3, 3]) B(a, 0, -4, a, 6, 4, HV.rope); B(-6, 6, -3, 6, 6, 3, HV.strawL);
  } },
  { id: 'f_shi', name: '石', tags: ['rock'], foot: { w: 1.0, d: 0.9 }, h: 0.5, kinds: ['wing'], size: 'S', max: 3, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    const B = frame(c.w, p.x, p.z); B(-6, 0, -4, 6, 3, 4, HV.stoneD); B(-4, 4, -3, 4, 5, 2, HV.stone);
  } },
  { id: 'f_jin', name: '黄巾', tags: ['yellow'], foot: { w: 1.0, d: 0.8 }, h: 0.2, kinds: ['wing'], size: 'S', max: 1, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    const B = frame(c.w, p.x, p.z); headbands(B, [[-2, -2, true]]); B(-7, 0, 3, 6, 0, 3, HV.woodD); B(7, 0, 2, 9, 0, 4, HV.ironL);
  } },
];

// ------------------------------------------------------------------ ground: warm loess earth, sparse worn buff-sandstone cartwheel tracks (04-combat-ui.png), functional zone earth tones
function floor(c: Ctx, f: { layout: Layout; p: Place; arena?: ArenaPlan }) {
  const w = c.w, sd = f.p.seed, r = (k: number) => hash(sd, k, 61), G3 = GRASS[f.p.season];
  const X0 = M(AREA.x0 - 12), X1 = M(AREA.x1 + 12), Z0 = M(AREA.z0 - 12), Z1 = M(AREA.z1 + 8);
  const fill = (x0: number, z0: number, x1: number, z1: number, col: number) => {
    for (let X = Math.max(X0, M(x0)); X <= Math.min(X1, M(x1)); X++)
      for (let Z = Math.max(Z0, M(z0)); Z <= Math.min(Z1, M(z1)); Z++) w.set(X, -1, Z, col);
  };
  const snap = (v: number) => Math.round(v / 0.35) * 0.35;
  // warm dusty buff-sandstone track slabs harmonizing gently with yellow loess (faithful to 02-environments.png & 04-combat-ui.png — zero cold blue-grey clash!)
  const SLAB = 0xa4957e, SLAB_D = 0x958670, SLAB_L = 0xb0a18a, SLAB_J = 0x857763;
  const slabStripZ = (xc: number, z0: number, z1: number, hw = 4, len = 18, gap = 6, salt = 5) => {
    const Xc = M(xc), a0 = Math.max(Z0, M(z0)), a1 = Math.min(Z1, M(z1)), step = len + gap;
    for (let Z = a0; Z <= a1; Z++) {
      const idx = Math.floor((Z - a0) / step), lz = (Z - a0) - idx * step;
      if (lz >= len) continue;
      for (let dx = -hw; dx <= hw; dx++) {
        const X = Xc + dx; if (X < X0 || X > X1) continue;
        const edge = lz === 0 || lz === len - 1 || dx === -hw || dx === hw;
        const h = hash(idx, salt, sd);
        w.set(X, -1, Z, edge ? SLAB_J : h < 0.3 ? SLAB_D : h < 0.8 ? SLAB : SLAB_L);
      }
    }
  };
  const slabStripX = (zc: number, x0: number, x1: number, hd = 4, len = 18, gap = 6, salt = 11) => {
    const Zc = M(zc), a0 = Math.max(X0, M(x0)), a1 = Math.min(X1, M(x1)), step = len + gap;
    for (let X = a0; X <= a1; X++) {
      const idx = Math.floor((X - a0) / step), lx = (X - a0) - idx * step;
      if (lx >= len) continue;
      for (let dz = -hd; dz <= hd; dz++) {
        const Z = Zc + dz; if (Z < Z0 || Z > Z1) continue;
        const edge = lx === 0 || lx === len - 1 || dz === -hd || dz === hd;
        const h = hash(idx, salt, sd);
        w.set(X, -1, Z, edge ? SLAB_J : h < 0.3 ? SLAB_D : h < 0.8 ? SLAB : SLAB_L);
      }
    }
  };
  const stonePad = (x0: number, z0: number, x1: number, z1: number, sw = 14, sd2 = 12) => {
    const ax0 = Math.max(X0, M(x0)), ax1 = Math.min(X1, M(x1)), az0 = Math.max(Z0, M(z0)), az1 = Math.min(Z1, M(z1));
    for (let X = ax0; X <= ax1; X++) for (let Z = az0; Z <= az1; Z++) {
      const rz = Math.floor((Z + 600) / sd2), u = X + 600 + (rz & 1) * Math.floor(sw / 2);
      const j = (Z + 600) % sd2 === 0 || u % sw === 0 || X === ax0 || X === ax1 || Z === az0 || Z === az1;
      w.set(X, -1, Z, j ? SLAB_J : (hash(Math.floor(u / sw), rz, 19) < 0.35 ? SLAB_D : SLAB));
    }
  };

  // outer dry grass field
  fill(AREA.x0 - 12, AREA.z0 - 12, AREA.x1 + 12, AREA.z1 + 8, G3[0]);
  for (let i = 0; i < 26; i++) {
    const x = AREA.x0 - 6 + r(i) * (AREA.x1 - AREA.x0 + 12), z = AREA.z0 - 8 + r(50 + i) * (AREA.z1 - AREA.z0 + 12);
    const hw = 0.8 + r(100 + i) * 1.6, hd = 0.6 + r(150 + i) * 1.2;
    fill(snap(x - hw), snap(z - hd), snap(x + hw), snap(z + hd), r(200 + i) < 0.6 ? G3[1] : G3[2]);
  }
  // calm packed-loess village ground (warm sandy ochre, broad subtle zones, zero speckle)
  fill(SX(-12.6), SZ(-15.4), SX(12.6), SZ(8.6), HV.loess);
  for (let i = 0; i < (STAGE_BIG.on ? 32 : 16); i++) {
    const x = SX(-12) + r(300 + i) * (SX(12) - SX(-12)), z = SZ(-15) + r(350 + i) * (SZ(8) - SZ(-15));
    const hw = 1.4 + r(400 + i) * 2.4, hd = 1.2 + r(450 + i) * 2.0;
    fill(snap(x - hw), snap(z - hd), snap(x + hw), snap(z + hd), r(500 + i) < 0.52 ? HV.loessD : HV.loessL);
  }
  // grassy verge strips far outside PLAY
  for (let i = 0; i < 10; i++) {
    const s = r(550 + i) < 0.5 ? -1 : 1, x = SX(s * (9.4 + r(560 + i) * 3)), z = SZ(-14 + r(570 + i) * 21);
    const hw = 0.5 + r(580 + i) * 0.9, hd = 0.6 + r(590 + i) * 1.2;
    fill(snap(x - hw), snap(z - hd), snap(x + hw), snap(z + hd), G3[r(600 + i) < 0.5 ? 0 : 2]);
  }
  if (f.layout.court) { const q = f.layout.court; fill(q.x0, q.z0, q.x1, q.z1, HV.loess); }

  // subtle wall-base tamped earth grounding (0.35 m band hugging perimeter walls & every # compound)
  const sp = f.arena?.shape;
  fill(PLAY.x0, PLAY.z0, PLAY.x1, PLAY.z0 + 0.35, HV.loessD);
  fill(PLAY.x0, PLAY.z0, PLAY.x0 + 0.35, PLAY.z1, HV.loessD);
  fill(PLAY.x1 - 0.35, PLAY.z0, PLAY.x1, PLAY.z1, HV.loessD);
  if (sp) {
    for (const rc of sp.solid) fill(rc.x0 - 0.35, rc.z0 - 0.35, rc.x1 + 0.35, rc.z1 + 0.35, HV.loessD);
  }

  // worn packed-earth main roads + sparse warm buff-sandstone cartwheel tracks (matching 02-environments.png & 04-combat-ui.png)
  if (sp?.fixed) {
    const fx = sp.fixed, cx = (PLAY.x0 + PLAY.x1) / 2;
    const exN = fx.exits.find(e => e.side === 'back');
    const axisX = exN ? (exN.x + sp.enter[0]) / 2 : sp.enter[0];
    // main N-S village cart road: packed warm dirt + two sparse worn warm-sandstone wheel tracks
    fill(axisX - 2.6, PLAY.z0 - 5, axisX + 2.6, PLAY.z1 + 3, HV.track);
    slabStripZ(axisX - 1.5, PLAY.z0 + 0.6, PLAY.z1 + 1.2, 4, 18, 7, 7);
    slabStripZ(axisX + 1.5, PLAY.z0 + 0.6, PLAY.z1 + 1.2, 4, 18, 7, 13);
    // E-W lane if side exits exist (kept warm packed earth with one calm single track line so it doesn't turn into a busy grid)
    const sideEs = fx.exits.filter(e => e.side === 'left' || e.side === 'right');
    if (sideEs.length) {
      const axisZ = sideEs.reduce((s, e) => s + e.z, 0) / sideEs.length;
      fill(PLAY.x0 - 5, axisZ - 1.8, PLAY.x1 + 5, axisZ + 1.8, HV.track);
      slabStripX(axisZ, PLAY.x0 - 3, PLAY.x1 + 3, 4, 18, 8, 17);
    } else if (fx.id === 'courtyards') {
      slabStripZ(cx, PLAY.z0 + 0.6, PLAY.z1 + 1.0, 5, 16, 6, 29);
    } else if (fx.stations) {
      stonePad(fx.stations[0] - 3.4, fx.stations[1] - 2.2, fx.stations[0] + 3.4, fx.stations[1] + 0.6, 14, 12);
    }
    // crossroads functional zone ground storytelling: sunny threshing floor in SW, ash & soot scars in SE burned ruin!
    if (fx.id === 'crossroads') {
      fill(PLAY.x0 + 0.35, PLAY.z1 - 5.6, PLAY.x0 + 7.4, PLAY.z1 - 0.2, HV.track);
      fill(PLAY.x1 - 8.4, PLAY.z1 - 7.8, PLAY.x1 - 0.35, PLAY.z1 - 2.2, HV.loessD);
      fill(PLAY.x1 - 6.8, PLAY.z1 - 6.6, PLAY.x1 - 1.6, PLAY.z1 - 3.6, HV.ash);
      fill(PLAY.x1 - 9.2, PLAY.z1 - 6.2, PLAY.x1 - 7.0, PLAY.z1 - 4.4, HV.ash);
    }
    // subtle warm-sandstone thresholds only at main gates and internal doorways
    for (const g of f.arena!.gates) stonePad(g.x - (g.along === 'x' ? 1.5 : 0.8), g.z - (g.along === 'x' ? 0.7 : 1.5), g.x + (g.along === 'x' ? 1.5 : 0.8), g.z + (g.along === 'x' ? 0.9 : 1.5), 12, 10);
    for (const cl of fx.closed) stonePad(cl.x0 - 0.35, cl.z0 - 0.35, cl.x1 + 0.35, cl.z1 + 0.35, 10, 10);
  } else {
    for (const q of f.layout.path) {
      fill(q.x0, q.z0, q.x1, q.z1, HV.track);
      const along = q.z1 - q.z0 >= q.x1 - q.x0;
      if (along) {
        const cx = (q.x0 + q.x1) / 2, span = q.x1 - q.x0;
        if (span > 2.8) { slabStripZ(cx - 1.2, q.z0, q.z1, 4, 18, 7, 31); slabStripZ(cx + 1.2, q.z0, q.z1, 4, 18, 7, 37); }
        else slabStripZ(cx, q.z0, q.z1, 4, 18, 7, 31);
      } else {
        const cz = (q.z0 + q.z1) / 2;
        slabStripX(cz, q.x0, q.x1, 4, 18, 7, 41);
      }
    }
  }
  // two or three ash scars outside the battle floor where something burnt
  for (let i = 0; i < 3; i++) {
    const s = r(700 + i) < 0.5 ? -1 : 1, x = SX(s * (6.4 + r(710 + i) * 4.5)), z = SZ(-12 + r(720 + i) * 14), h = 0.6 + r(730 + i) * 0.6;
    fill(snap(x - h), snap(z - h * 0.8), snap(x + h), snap(z + h * 0.8), HV.ash);
  }
}
// ------------------------------------------------------------------ the far ring: expansive golden wheat sea, towering village locust trees & loess terraces (no repetitive miniature cottages!)
function far(c: Ctx, f: { layout: Layout; p: Place; arena?: ArenaPlan }) {
  const w = c.w, r = f.p.rnd, se = f.p.season;
  const top = se === 'autumn' ? [0xa88a48, 0x98803e] : se === 'winter' ? [0x7a6a52, 0x6e604a] : se === 'summer' ? [0x5a7a38, 0x66843e] : [0x72884a, 0x7e9452];
  // rich golden wheat fields hugging the outer walls wherever no building extends or road passes (matching 02-environments.png & 04-combat-ui.png!)
  const pal = cropOf(se === 'winter' ? 'autumn' : se, 0);
  const gates = f.arena?.gates ?? [];
  const hitsRoad = (x0: number, x1: number, z0: number, z1: number) =>
    f.layout.path.some(q => x0 < q.x1 + 0.9 && x1 > q.x0 - 0.9 && z0 < q.z1 + 0.9 && z1 > q.z0 - 0.9)
    || gates.some(g => Math.abs((x0 + x1) / 2 - g.x) < 2.8 && Math.abs((z0 + z1) / 2 - g.z) < 5.0);
  const clearSpace = (X0: number, Z0: number, X1: number, Z1: number) => {
    for (let X = X0; X <= X1; X += 4) for (let Z = Z0; Z <= Z1; Z += 4) if (w.has(X, 2, Z) || w.has(X, 12, Z) || w.has(X, 26, Z)) return false;
    return true;
  };
  // rear golden wheat fields outside the back wall (between buildings & flanking the north road)
  const rearZ0 = PLAY.z0 - 5.6, rearZ1 = PLAY.z0 - 1.1;
  for (let x = PLAY.x0 - 4.5; x < PLAY.x1 + 3.5; x += 3.6) {
    const x0 = x, x1 = x + 3.1;
    if (hitsRoad(x0, x1, rearZ0, rearZ1)) continue;
    const X0 = M(x0), X1 = M(x1), Z0 = M(rearZ0), Z1 = M(rearZ1);
    if (!clearSpace(X0, Z0, X1, Z1)) continue;
    for (let rx = X0; rx + 4 <= X1; rx += 6) wheatBed(c, rx, Z0, Math.min(X1, rx + 4), Z1, 13, pal, ['+z', '+x']);
  }
  // flank golden wheat fields outside left & right walls (especially opening out SW & West into bright wheat!)
  for (const side of [-1, 1]) {
    const fx0 = side < 0 ? PLAY.x0 - 6.2 : PLAY.x1 + 1.2;
    const fx1 = side < 0 ? PLAY.x0 - 1.2 : PLAY.x1 + 6.2;
    for (let z = PLAY.z0 - 1.0; z < PLAY.z1 + 1.0; z += 4.0) {
      const z0 = z, z1 = z + 3.5;
      if (hitsRoad(fx0, fx1, z0, z1)) continue;
      const X0 = M(fx0), X1 = M(fx1), Z0 = M(z0), Z1 = M(z1);
      if (!clearSpace(X0, Z0, X1, Z1)) continue;
      for (let rx = X0; rx + 4 <= X1; rx += 6) wheatBed(c, rx, Z0, Math.min(X1, rx + 4), Z1, 13, pal, ['+z', side < 0 ? '+x' : '-x']);
    }
  }
  // towering village autumn locust trees outside key corners (gives grand vertical hierarchy instead of toy cottages!)
  const L = LEAF_BY[se];
  for (const [tx, tz, th, sd2] of [
    [PLAY.x0 - 2.6, PLAY.z0 + 11.2, 8.2, 91],
    [PLAY.x1 + 2.8, PLAY.z0 + 8.5, 7.6, 97],
    [(PLAY.x0 + PLAY.x1) / 2 + 3.8, PLAY.z0 - 3.6, 8.6, 103],
  ] as const) {
    if (!hitsRoad(tx - 1.8, tx + 1.8, tz - 1.8, tz + 1.8) && clearSpace(M(tx - 1.4), M(tz - 1.4), M(tx + 1.4), M(tz + 1.4))) {
      oak(w, tx, tz, th, { seed: sd2 + f.p.seed, bark: 0x4a3c30, dark: 0x30261e, leaf: L[0], leafTop: L[1], low: 0.42, width: 1.15, vines: 0 });
    }
  }
  // loess terraces on the far flanks
  for (const s of [-1, 1]) for (let t = 0; t < 3; t++) {
    const xa = s > 0 ? SX(13.6 + t * 2.2) : SX(-15.8 - t * 2.2), H = 4 + t * 7, X0 = M(xa), X1 = M(xa + 2.2) - 1;
    for (let Z = M(SZ(-17)); Z <= M(SZ(8)); Z += 26) { const Z1 = Math.min(M(SZ(8)), Z + 24); w.box(X0, -1, Z, X1, H - 1, Z1, HV.earthD); for (let y = 5; y < H; y += 6) w.box(X0, y, Z, X1, y, Z1, HV.earthS); w.box(X0, H, Z, X1, H, Z1, top[(Math.floor(Z / 26) + t) & 1]); }
  }
  // warm rammed-earth outer village wall across the distant back (thatch/earth coping, NOT blue tile!), gaps knocked in it
  const B = frame(w, 0, SZ(-16.6)), WW = STAGE_BIG.on ? 340 : 190;
  yardWall(B, -WW, WW, 0, 26, { tile: false, drops: [[-120, -96, 12], [40, 62, 16], [140, 166, 10], ...(STAGE_BIG.on ? [[-300, -270, 12], [250, 280, 14]] as Array<[number, number, number]> : [])] });
  // distant roofs & trees beyond the outer wall
  const n = STAGE_BIG.on ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 10.5 + (r(420 + i) - 0.5) * 2, z = SZ(-19.8) - r(430 + i) * 1.4, burnt = r(440 + i) < 0.35;
    house(c, x, z, 0, { hw: 32, hd: 16, H: 32, roof: i % 2 === 0 ? 'tile' : 'thatch', burnt: burnt ? 1 : 0, chimney: !burnt, wins: [] });
    if (burnt) smoke(c, [x, 2.8, z], { rate: 2.0, col: 0x5e5a56 });
  }
  for (let i = 0; i < (STAGE_BIG.on ? 10 : 6); i++) {
    const x = (STAGE_BIG.on ? -25 : -15) + i * 5.4 + r(460 + i) * 1.8, z = SZ(-22.5) - r(470 + i) * 2;
    if (r(480 + i) < 0.25) deadTree(w, x, z, 6.5 + r(490 + i) * 2, HV.char, HV.charD, { seed: 70 + i, crow: 0.3, moss: false });
    else oak(w, x, z, 7.5 + r(490 + i) * 2, { seed: 80 + i, leaf: L[0], leafTop: L[1], low: 0.44, width: 1.0, vines: 0 });
  }

  // Distant atmospheric backdrop (远景氛围衬托): layered yellow-earth loess plateaus, distant watchtower skyline & Mount Song ridges!
  const addMass = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, side: number, topC?: number, lowC?: number) => {
    plot(w).masses.push({
      x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1),
      cx: 0, cz: 0, top: topC ?? tone(side, 1.12), side, low: lowC ?? tone(side, 0.76), band: 5,
    });
  };
  const farZ = Math.min(PLAY.z0 - 12, SZ(-22));
  const hillTop = se === 'autumn' ? 0x9b8852 : se === 'winter' ? 0x867c6e : 0x74854a;
  // Distant 3-storey village watchtower silhouette on the north-east horizon (landmark depth!)
  const wtx = M(PLAY.x1 + 6), wtz = M(farZ - 5);
  let wy = -1;
  for (const [hw, hh] of [[18, 38], [14, 28], [11, 22]] as const) {
    addMass(wtx - hw, wy, wtz - hw, wtx + hw, wy + hh, wtz + hw, 0x7a654a, 0x8c7556, 0x5c4a36);
    addMass(wtx - hw - 7, wy + hh + 1, wtz - hw - 7, wtx + hw + 7, wy + hh + 4, wtz + hw + 7, 0x454346, 0x58565a, 0x2c2a2d);
    wy += hh + 5;
  }
  smoke(c, [PLAY.x0 - 8, 4.5, farZ - 4], { rate: 1.8, col: 0x6a645d });
  // Three receding atmospheric tiers of Mount Song loess hills & distant mountain ridges spanning the full horizon
  for (const [x0, x1, dz0, dz1, h, side, topC] of [
    [-82, -26, -16, -8,  72, 0xa88f64, hillTop],
    [ 20,  82, -16, -7,  84, 0xa48c62, hillTop],
    [-46,  42, -22, -13, 62, 0x9c865e, hillTop],
    [-92, -18, -32, -20, 138, 0x8d7f66, 0x9c8e74],
    [ 10,  94, -34, -21, 154, 0x867a64, 0x968a72],
    [-60,  58, -46, -30, 210, 0x747068, 0x848078],
  ] as const) {
    addMass(M(x0), -1, M(farZ + dz0), M(x1), h, M(farZ + dz1), side, topC, tone(side, 0.78));
  }
}
// ------------------------------------------------------------------ dressing: dry grass on the grass, weeds by the walls, straw, dust and ash
function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  const w = c.w, sd = f.p.seed, se = f.p.season, G3 = new Set(GRASS[se]);
  const clear = (x: number, z: number) => f.clear.some(q => x > q.x0 - 0.2 && x < q.x1 + 0.2 && z > q.z0 - 0.2 && z < q.z1 + 0.2);
  const inPlayG = (x: number, z: number) => x > PLAY.x0 - 0.4 && x < PLAY.x1 + 0.4 && z > PLAY.z0 - 0.4 && z < PLAY.z1 + 0.4;
  const at = (x: number, z: number) => w.get(M(x), -1, M(z))?.c ?? 0;
  const tints = se === 'winter' ? [0xa8a49c, 0x98948c] : se === 'autumn' ? [0xc8b080, 0xb8a070] : [0xa8b488, 0x98a478, 0xb4bc90];
  const plant = (kind: string, n: number, s: [number, number], want: (x: number, z: number) => boolean, cl = 6) => {
    let placed = 0, tries = 0;
    while (placed < n && tries < n * 30) {
      tries++;
      const cx = AREA.x0 - 2 + hash(tries, sd, kind.length * 13 + 1) * (AREA.x1 - AREA.x0 + 4), cz = AREA.z0 - 1 + hash(tries, sd, kind.length * 17 + 2) * (AREA.z1 - AREA.z0);
      if (inPlayG(cx, cz) || clear(cx, cz) || !want(cx, cz)) continue;
      for (let k = 0; k < cl && placed < n; k++) {
        const x = cx + (hash(tries, k, sd + 3) - 0.5), z = cz + (hash(tries, k, sd + 4) - 0.5);
        if (inPlayG(x, z) || clear(x, z) || z > 7.2) continue;
        const y = ground(c, x, z); if (y == null || y > 0.08) continue;
        c.cards.add(kind, x, z, { y, s: s[0] + hash(tries, k, 9) * (s[1] - s[0]), tint: tints[Math.floor(hash(tries, k, 6) * tints.length)] }); placed++;
      }
    }
  };
  plant('grass', 220, [0.3, 0.5], (x, z) => G3.has(at(x, z)), 8);
  plant('weeds', 60, [0.4, 0.6], (x, z) => at(x, z) === HV.loess || at(x, z) === HV.loessD, 3);
  plant('straw', 24, [0.6, 0.9], (x, z) => at(x, z) !== HV.track, 2);

  // --- Street-edge & wall-root micro-detail INSIDE PLAY (bold visible plant cards, roadside pebbles, & lived-in 3D wall-root stones) ---
  const nearWall = (x: number, z: number) => {
    const X = M(x), Z = M(z);
    if (w.has(X, 1, Z) || w.has(X, 6, Z)) return false;
    const hit = (ax: number, az: number) => w.has(ax, 4, az) || w.has(ax, 25, az);
    return hit(X + 10, Z) || hit(X - 10, Z) || hit(X, Z + 10) || hit(X, Z - 10);
  };
  const onTrackEdge = (x: number, z: number) => {
    const c0 = at(x, z);
    if (c0 !== HV.track && c0 !== HV.loess && c0 !== HV.loessD) return false;
    return at(x + 0.65, z) !== c0 || at(x - 0.65, z) !== c0 || at(x, z + 0.65) !== c0 || at(x, z - 0.65) !== c0;
  };
  const grassTints = se === 'winter' ? [0x9e9a90, 0x8a867e] : [0x7e964a, 0x92a458, 0x6f8642];
  const weedTints = se === 'winter' ? [0xa49e90, 0x908a7e] : [0xb4a470, 0xa29662, 0xc4b27c];
  const pebbleTints = [0x827563, 0x6e6353, 0x948672];
  const plantIn = (
    kind: string, n: number, s: [number, number],
    want: (x: number, z: number) => boolean,
    pal: number[], cl = 2, spread = 0.65, yOff = 0.015,
  ) => {
    let placed = 0, tries = 0;
    while (placed < n && tries < n * 32) {
      tries++;
      const cx = PLAY.x0 + 0.3 + hash(tries, sd + 19, kind.length * 29 + 1) * (PLAY.x1 - PLAY.x0 - 0.6);
      const cz = PLAY.z0 + 0.3 + hash(tries, sd + 23, kind.length * 31 + 2) * (PLAY.z1 - PLAY.z0 - 0.6);
      if (!want(cx, cz)) continue;
      for (let k = 0; k < cl && placed < n; k++) {
        const x = cx + (hash(tries, k, sd + 41) - 0.5) * spread;
        const z = cz + (hash(tries, k, sd + 47) - 0.5) * spread;
        if (x < PLAY.x0 + 0.18 || x > PLAY.x1 - 0.18 || z < PLAY.z0 + 0.18 || z > PLAY.z1 - 0.18) continue;
        if (w.has(M(x), 1, M(z)) || w.has(M(x), 6, M(z))) continue;
        const y = ground(c, x, z); if (y == null || y > 0.08) continue;
        c.cards.add(kind, x, z, {
          y: y + yOff,
          s: s[0] + hash(tries, k, 53) * (s[1] - s[0]),
          tint: pal[Math.floor(hash(tries, k, 59) * pal.length)],
        });
        placed++;
      }
    }
  };
  // 1) crisp wall-root & corner plant tufts hugging every building plinth, porch post, yard wall, well & gate corner
  const hitsPath = (x: number, z: number) => f.layout.path.some(q => x > q.x0 + 0.4 && x < q.x1 - 0.4 && z > q.z0 + 0.4 && z < q.z1 - 0.4);
  const wallOrCorner = (x: number, z: number) => nearWall(x, z) && !hitsPath(x, z);
  plantIn('vtuft', 150, [0.68, 1.0], wallOrCorner, [0xffffff, 0xe8e0c4, 0xd8d0a8], 2, 0.80, 0);
  plantIn('vtuft', 52, [0.58, 0.82], onTrackEdge, [0xece4c8, 0xd8d0a8], 1, 0.55, 0);
  // 2) crisp weathered roadside pebbles & fallen autumn leaves along road verges, cart tracks & wall bases
  plantIn('vpebble', 130, [0.90, 1.35], (x, z) => nearWall(x, z) || onTrackEdge(x, z), [0xffffff, 0xeae2d4, 0xd8cebe], 2, 0.90, 0.012);
  plantIn('vleaf', 96, [0.85, 1.25], (x, z) => nearWall(x, z) || onTrackEdge(x, z), [0xffffff, 0xead8be], 2, 0.90, 0.010);
  // 3) lived-in village ground scatter: golden straw near granary/threshing walls & corners
  plantIn('straw', 54, [0.75, 1.15], (x, z) => nearWall(x, z) && at(x, z) !== HV.ash, [0xd4bc78, 0xc2a860], 2, 0.85, 0.012);
  // 4) hanging dry vines on south-facing walls inside PLAY
  let vines = 0;
  for (let i = 0; i < 200 && vines < 22; i++) {
    const x = PLAY.x0 + 1.0 + hash(i, sd, 83) * (PLAY.x1 - PLAY.x0 - 2.0);
    const z = PLAY.z0 + 0.5 + hash(i, sd, 89) * (PLAY.z1 - PLAY.z0 - 2.0);
    const X = M(x), Z = M(z);
    if (w.has(X, 22, Z - 2) && !w.has(X, 22, Z) && !w.has(X, 12, Z)) {
      c.cards.add('deadvine', x, z + 0.05, { y: 1.55 + hash(i, sd, 97) * 0.5, ry: 0, s: 0.85 + hash(i, sd, 101) * 0.35, tint: 0xbda87c });
      vines++;
    }
  }
  // 5) lived-in 3D street-edge micro-props tucked strictly against wall roots (never protruding into combat lanes or doorways!)
  //    cycles between: weathered stone clusters, street-corner stone bollards (拴马石/护墙石墩), wooden hitching posts / village notice boards, and low wooden stools/benches!
  let edgeProps = 0;
  const placedPts: Array<[number, number]> = [];
  for (let i = 0; i < 420 && edgeProps < 34; i++) {
    const x = PLAY.x0 + 0.55 + hash(i, sd, 131) * (PLAY.x1 - PLAY.x0 - 1.1);
    const z = PLAY.z0 + 0.55 + hash(i, sd, 137) * (PLAY.z1 - PLAY.z0 - 1.1);
    const X = M(x), Z = M(z);
    if (w.has(X, 1, Z) || w.has(X, 5, Z) || hitsPath(x, z)) continue;
    if (placedPts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.85)) continue;
    // must hug a solid wall while keeping wide open space in front so doors, alleys, and movement stay 100% clear!
    const touchN = w.has(X, 6, Z - 5) && !w.has(X, 1, Z + 12) && !w.has(X - 5, 1, Z) && !w.has(X + 5, 1, Z);
    const touchW = w.has(X - 5, 6, Z) && !w.has(X + 12, 1, Z) && !w.has(X, 1, Z - 5) && !w.has(X, 1, Z + 5);
    const touchE = w.has(X + 5, 6, Z) && !w.has(X - 12, 1, Z) && !w.has(X, 1, Z - 5) && !w.has(X, 1, Z + 5);
    if (!touchN && !touchW && !touchE) continue;
    const isAsh = at(x, z) === HV.ash;
    const kind = edgeProps % 5;
    if (kind === 0 || kind === 3 || isAsh) {
      // weathered wall-root stone cluster / fallen roof tiles (04-combat-ui.png bottom-left feel)
      w.box(X - 3, 0, Z - 2, X + 2, 2, Z + 1, isAsh ? 0x3e3b3c : 0x8d806c);
      w.box(X - 2, 3, Z - 1, X + 1, 3, Z, isAsh ? 0x524f50 : 0xa89a84);
      w.box(X + 3, 0, Z - 1, X + 5, 1, Z + 1, isAsh ? 0x2e2c2d : 0x766a58);
      // plant a tuft of grass/weeds right beside the stones for organic grounding!
      c.cards.add('vtuft', x + 0.32, z + 0.15, { y: 0, s: 0.52, tint: edgeProps % 2 === 0 ? 0xffffff : 0xe4dcb8 });
    } else if (kind === 1) {
      // civic stone wheel-guard / horse-hitching bollard (拴马石墩)
      w.box(X - 2, 0, Z - 2, X + 2, 1, Z + 2, 0x766a58);
      w.box(X - 1, 2, Z - 1, X + 1, 7, Z + 1, 0x988b76);
      w.box(X - 1, 8, Z - 1, X + 1, 8, Z + 1, 0xb2a48c);
      c.cards.add('vtuft', x - 0.28, z + 0.12, { y: 0, s: 0.46, tint: 0xe6deb8 });
    } else if (kind === 2 && touchN) {
      // lived-in low wooden roadside bench (长条木凳) tucked flush against a north building wall
      w.box(X - 7, 0, Z - 1, X - 6, 3, Z + 1, HV.post);
      w.box(X + 6, 0, Z - 1, X + 7, 3, Z + 1, HV.post);
      w.box(X - 8, 4, Z - 2, X + 8, 4, Z + 2, HV.wood);
      w.box(X - 8, 4, Z + 2, X + 8, 4, Z + 2, HV.woodL);
    } else if (kind === 4 && touchN) {
      // village wooden notice post / roadside marker (村口木牌/告示桩) + grass tuft at its base
      w.box(X - 1, 0, Z - 1, X + 1, 14, Z, HV.post);
      w.box(X - 5, 9, Z + 1, X + 5, 14, Z + 1, HV.wood);
      w.box(X - 4, 10, Z + 1, X + 4, 13, Z + 1, HV.hemp);
      w.box(X - 3, 11, Z + 1, X + 2, 11, Z + 1, HV.char);
      w.box(X - 6, 15, Z - 1, X + 6, 16, Z + 2, HV.woodD);
      c.cards.add('vtuft', x + 0.25, z + 0.14, { y: 0, s: 0.50, tint: 0xffffff });
    } else {
      // small wall-hugging clay jar + wooden bucket pair
      w.box(X - 2, 0, Z - 2, X + 1, 4, Z + 1, HV.clay);
      w.box(X - 1, 5, Z - 1, X, 5, Z, HV.clayL);
      w.box(X + 2, 0, Z - 1, X + 4, 3, Z + 1, HV.woodD);
      w.box(X + 2, 2, Z - 1, X + 4, 2, Z + 1, HV.iron);
    }
    placedPts.push([x, z]);
    edgeProps++;
  }

  c.ambient({ kind: 'dust', color: 0xd8c8a4, rate: 1.4 });
  c.ambient({ kind: 'dust', color: 0x8a8480, rate: 0.7, area: { x0: -11, z0: -14, x1: 11, z1: 2 } });
  if (f.p.time === 'dusk' || f.p.time === 'night') c.ambient({ kind: 'embers', color: 0xff8a3a, rate: 0.5, area: { x0: -11, z0: -16, x1: 11, z1: -8 } });
}

export const hjVillage: Locale = {
  id: 'hj_village', name: '残村', theme: 'hanmo',
  layouts: ['axis', 'offset', 'pair', 'garden'],
  weathers: ['clear', 'rain', 'mist', 'snow'],
  landmarks: LANDMARKS, groups: G, filler: FILLER,
  floor, far, dress,
  // 11-18 屋子形态: a corner of burnt yards (曲尺), a ruined compound to fight round (回廊), a lane between the houses (窄巷), the
  // village stream with its plank bridge (过桥), the village pond (临水)
  shapes: ['ell', 'cloister', 'neck', 'bridge', 'pond'], pits: ['water'], infill: villageInfill,
};
void roof;
