// 第二关 · 洛阳余烬 · 铸钱场（ly_mint，头目间）（11-18）：宫前空场改的熔铜场，飞熊校尉阎虎在这里熔铜人铜驼铸小钱。
// 正后方一座高炉（地标，三选一的样子都是它：大炉 + 两侧铜人 / 钱范 / 铜驼残件）：砖砌炉身三级收分、铁箍、炉顶加料台和木架，
// 炉口在正面低处发铁水的橙光，一条石槽把铁水引到场地边上；两侧风箱棚。场里两翼是钱范架、铜锭垛、炉渣堆、炭堆、化铜炉、
// 铁水槽、半熔铜人、钱箱。地面是宫前方石板（被火熏黑、有铜水溅过的整块），场外是炉渣和炭灰地。
// 头目阎虎在场地后部正中（z ≈ −9.2）出场，正好站在高炉炉口前；高炉从镜头里看是全场最高最亮的东西。
import type { Ctx, Mood } from '../../scenes/stage';
import { M, SX, SZ } from '../../scenes/props';
import type { Landmark, Layout, Locale, Place } from '../types';
import { LY, frame, up, wp, fireLight, smoke, blastFurnace, copperMan, qianfan, coinHeap, ingots, camel, camelDown, heap, palaceWall, charPost, rubble, charTree, cashStrings, fireBasin } from './ly_kit';
import { commonGroups, commonFiller, lyFloor, lyDress } from './ly_common';
import { MINT_GROUPS } from './ly_mint_props';

/** the boss room's own light (a burning city at night, so the moonlit blue of the generic night is wrong here): a smoke-brown sky
 *  with the city's fire low on the horizon, a dim warm fill, the "moon" a weak ember-orange key from the furnace side; the furnace,
 *  the channel and the basins are the brightest things in the frame. Same shape as 寒山坞's HS_MOOD. */
const MINT_MOOD: Mood = {
  sky: true, bg: 0x141110, fog: 0x241e1c, fogD: 0.02, hemiSky: 0x7a7672, hemiGround: 0x262220, hemiI: 1.4, moon: 0xd8b49a, moonI: 1.5, key: 0xb0a090, keyI: 0.35,
  earth: [0x34302c, 0x36322e, 0x322e2a], mist: 0x5a5250, mistA: 0.07,
  skyTop: 0x0c0a0a, skyMid: 0x221a18, skyHor: 0x7a3a22, skyDisc: [0.2, 0.04, -1], skyDiscCol: [0.8, 0.4, 0.22], moonPos: [6, 13, -10],
  exposure: 1.35, bloomT: 1.05, glowK: 1.7,
};

/** the furnace and what goes with it: its lights (the mouth, the throat, the channel) and smoke */
function furnace(c: Ctx, p: Place, B: ReturnType<typeof frame>, runTo: number) {
  const f = blastFurnace(B, 0, 0, true, runTo), at = (q: [number, number, number]) => wp(p, 0, q[0], q[1], q[2]);
  // the furnace burns whatever the hour (it is the region's main light): stronger than the room's other fires
  c.light(at([f.mouth[0], f.mouth[1], f.mouth[2] + 6]), 0xff7a2a, 3.6 * Math.max(p.lamp, 0.9), 9);
  c.light(at([f.run[0], f.run[1] + 4, f.run[2]]), 0xff8a3a, 2.2 * Math.max(p.lamp, 0.8), 5);
  if (p.lamp > 0.4) c.light(at([f.top[0], f.top[1] + 4, f.top[2]]), 0xff9040, 2.4 * p.lamp, 7);
  const t = at(f.top); smoke(c, [t[0], t[1] + 0.5, t[2]], { rate: 3.2, col: 0x3e3a37 }); smoke(c, [t[0] + 0.4, t[1] + 0.4, t[2] - 0.3], { rate: 2.0, col: 0x4e4a46 });
  c.flame(at([0, 98, -4]), 0xff8a38, 0.22);
}
function basin(c: Ctx, p: Place, B: ReturnType<typeof frame>, x: number, z: number, h = 10) {
  const f = fireBasin(B, x, z, true, h); fireLight(c, p, wp(p, 0, f[0], f[1] + 3, f[2]), 0.9, 5);
}

// ------------------------------------------------------------------ landmarks: the furnace, with what the yard has piled by it
const LANDMARKS: Landmark[] = [
  { id: 'ly_gaolu', name: '高炉', foot: { w: 14.8, d: 6.6 }, tags: ['furnace', 'tall', 'light'], build(c, p) {
    // the furnace with the palace's bronze waiting to go in: a giant on its back on the left, his head already run to copper; a
    // camel cut in pieces on the right; behind both, the burnt palace wall the yard was made in front of
    const B = frame(c.w, p.x, p.z, 0);
    furnace(c, p, B, 46);
    palaceWall(B, -104, -56, -44, -38, 46, { drops: [[-104, -88, 30]], seed: p.seed }); palaceWall(B, 56, 104, -44, -38, 46, { drops: [[86, 104, 26]], seed: p.seed + 2 });
    const m = copperMan(B, -68, 26, true); fireLight(c, p, wp(p, 0, m[0], m[1] + 2, m[2]), 0.7, 4);
    camelDown(B, 70, 2, { cut: true }); ingots(B, 66, 30, 3); coinHeap(B, 86, 28, 7, 3);
  } },
  { id: 'ly_fanlu', name: '范炉', foot: { w: 14.8, d: 6.6 }, tags: ['furnace', 'tall', 'light'], build(c, p) {
    // the furnace with the mint's work laid out: rows of coin moulds on trestles on both sides, ingot stacks, cash heaped and strung
    const B = frame(c.w, p.x, p.z, 0);
    furnace(c, p, B, 46);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const zz = -14 + k * 22, x0 = s < 0 ? -100 : 60, x1 = s < 0 ? -60 : 100;
        for (const a of [x0, (x0 + x1) / 2, x1]) { B(a - 1, -1, zz - 6, a + 1, 9, zz - 5, LY.wood); B(a - 1, -1, zz + 5, a + 1, 9, zz + 6, LY.wood); }
        B(x0 - 2, 10, zz - 7, x1 + 2, 11, zz + 7, LY.woodD);
        for (let a = x0 + 4; a <= x1 - 4; a += 12) qianfan(B, a, zz, 12, { bronze: (a + k) % 3 === 0 });
      }
      ingots(B, s * 66, 32, 3); coinHeap(B, s * 86, 32, 6, 3); cashStrings(B, s < 0 ? -100 : 72, s < 0 ? -78 : 94, 40, 2);
    }
  } },
  { id: 'ly_zhalu', name: '渣炉', foot: { w: 14.8, d: 6.6 }, tags: ['furnace', 'tall', 'light'], build(c, p) {
    // the furnace in the middle of its waste: slag heaps and charcoal piles either side, a smaller furnace still burning, the burnt
    // palace gate posts behind
    const B = frame(c.w, p.x, p.z, 0);
    furnace(c, p, B, 46);
    heap(B, -78, -8, 22, 16, 4, LY.slag, 0x4e4644); heap(B, 80, -10, 20, 14, 4, LY.charD, LY.char);
    heap(B, -62, 28, 10, 6, 2, LY.slag, 0x4e4644); heap(B, 70, 28, 12, 6, 2, LY.charD, LY.char);
    for (const s of [-1, 1]) { charPost(B, s * 60, -36, 50, { charAt: 14 }); charPost(B, s * 100, -36, 30, { broken: true }); }
    basin(c, p, B, -96, 30); basin(c, p, B, 96, 30);
  } },
  { id: 'ly_tuolu', name: '驼炉', foot: { w: 14.8, d: 6.6 }, tags: ['furnace', 'tall', 'light'], build(c, p) {
    // the furnace with the camels of 铜驼街 dragged here to be melted: one still on its plinth waiting, one on its side already cut
    // up, its hacked-off pieces and the cash cast from the first in heaps by the channel
    const B = frame(c.w, p.x, p.z, 0);
    furnace(c, p, B, 46);
    camel(B, -78, 6, { broken: true }); B(-90, -1, -18, -66, -1, 28, LY.ashD);
    camelDown(B, 62, 0, { cut: true });
    ingots(B, -40, 38, 3); coinHeap(B, 34, 36, 7, 3); cashStrings(B, 48, 70, 30, 3);
    for (const s of [-1, 1]) charPost(B, s * 100, -30, 36, { broken: s > 0, charAt: 10 });
  } },
];

// ------------------------------------------------------------------ ground: the square's big flagstones, blackened; slag and coal-ash beyond
function floor(c: Ctx, f: { layout: Layout }) {
  // 炉火近处留下连续的灰渣地，炉前的条石在同一排炉口下发暗。
  lyFloor(c, f, {
    court: { n: 28, m: 20, joint: 0x4a413b, body: 0x5b5148 },
    path: { n: 27, m: 15, joint: 0x595048, body: 0x696059 },
    patches: [
      { rect: { x0: SX(-7), x1: SX(-2.8), z0: SZ(-8.2), z1: SZ(-3.6) }, surface: 0x4c3f36 },
      { rect: { x0: SX(3.8), x1: SX(7.4), z0: SZ(-8.3), z1: SZ(-4.5) }, surface: 0x4c3f36 },
      { rect: { x0: SX(3.4), x1: SX(7.2), z0: SZ(0), z1: SZ(3.2) }, surface: 0x655141 },
    ],
    outer: [0x3c3634, 0x463e3a, 0x2e2a28], kerb: LY.stoneDD,
  });
}
// ------------------------------------------------------------------ the far ring: the palace's outer wall, its gate tower gutted, dead trees, smoke
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, r = f.p.rnd, B = frame(w, 0, 0, 0);
  const Z0 = M(SZ(-19.2)), X0 = M(SX(-17)), X1 = M(SX(17));
  palaceWall(B, X0, X1, Z0, Z0 + 8, 54, { drops: [[M(SX(-12)), M(SX(-10)), 24], [M(SX(9)), M(SX(11.4)), 30]], seed: f.p.seed });
  // two gutted gate towers on the wall either side, far back
  for (const s of [-1, 1]) {
    const cx = M(SX(s * 8.5)), U = up(B, 55);
    U(cx - 30, 0, Z0 - 2, cx + 30, 4, Z0 + 10, LY.brickD);
    for (const a of [-26, -8, 8, 26]) charPost(U, cx + a, Z0 + 4, a === 26 * s ? 18 : 38, { broken: a === 26 * s, charAt: 6 });
    U(cx - 28, 39, Z0 + 2, cx + 6 * s, 40, Z0 + 6, LY.char);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) charTree(c, s * (SX(16.4) + (i % 2) * 1.2), SZ(-13 + i * 5), 5.4 + r(70 + i + (s > 0 ? 9 : 0)) * 2, 500 + i + (s > 0 ? 20 : 0), 0.3);
  smoke(c, [SX(-12), 3.6, SZ(-21)], { rate: 1.2, col: 0x4a4644 }); smoke(c, [SX(12 + r(2) * 2), 3.6, SZ(-21.5)], { rate: 1.0, col: 0x55504b });
  rubble(B, M(SX(-14)), M(SZ(-17.6)), 14, 6, 2);
}

export const lyMint: Locale = {
  id: 'ly_mint', name: '铸钱场', theme: 'luoyang',
  // the two layouts with the big centred landmark slot (the furnace needs 14.8 m; 阎虎 enters in front of it on the axis)
  layouts: ['axis', 'garden'],
  // (a boss room is always clear — show.ts; the place's own mood replaces the time / weather light)
  seasons: ['autumn'], times: ['night', 'dusk'], weathers: ['clear'], noLeaves: true, mood: MINT_MOOD,
  landmarks: LANDMARKS, groups: [...MINT_GROUPS, ...commonGroups('ly_m')], filler: commonFiller('ly_m'),
  floor, far,
  // the embers rise thickest round the furnace; a warmer ash
  dress: (c, f) => lyDress(c, f, { embers: 3.0, ashCol: 0x8a8278, emberArea: { x0: SX(-5), z0: SZ(-14), x1: SX(5), z1: SZ(-8) } }),
};
