// 忍之章 · 忍里（village 代理）：藏在山谷里的忍者村。茅草顶民家和仓、木栅栏、水车水渠、晒架、木人桩和训练场、瞭望台、柴堆、井、菜畦、
// 炊烟篝火、伪装的暗门。主色：茅草金褐、旧木、泥土、水绿（和山寺的灰石板 + 朱红 + 苔绿分开）。
// 写法照 temple.ts：每个组声明 foot（米，未镜像，世界 x × z）、h、kinds、size；build 以 p.x / p.z 为中心，p.s 指向（+1 = 在战斗区右边）。
// 翼位的组把正面转向战斗区（faceOf），所以长条组的占地在翼位是沿 z 的；方形的组在后排转向镜头。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, field } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { pine, oak } from '../../scenes/flora';
import { logPile } from '../../scenes/k_forest';
import { templeDress } from '../../kyoto/temple_dress';
import { LEAF_BY, MAPLE_BY } from '../season';
import type { Group, Landmark, Layout, Locale, Place, Rect, SeasonId, Slot } from '../types';
import { VC, frame, faceOf, minka, mokujin, makiwara, mato, kui, smoke, thatch } from './village_kit';
import { kura, yagura, suiro, beds, kakashi, takibi, sakumon, kakure, tawara, tobi, hato, hasa, koinobori, yukidaruma, wheel, channel, spill } from './village_props';

const lampLight = (c: Ctx, p: Place, at: [number, number, number], k = 1, d = 4.5) => { if (p.lamp > 0.3) c.light(at, 0xffa050, 2.4 * p.lamp * k, d); };
/** square pieces at the back rows face the camera, everything else faces the battle floor */
const orient = (p: Place) => (p.z < -8.6 ? 0 : faceOf(p.s));
/** field grass by season (the temple's moss is darker and bluer; this is open meadow) */
export const GRASS_BY: Record<SeasonId, [number, number, number]> = {
  spring: [0x5e7e3a, 0x4e6c32, 0x6e8e44], summer: [0x4a6e2e, 0x3e5e28, 0x5a7e36], autumn: [0x7a7038, 0x665e30, 0x8a7e44], winter: [0x8a9298, 0x747c84, 0xa0a8ae],
};

// ------------------------------------------------------------------ landmarks (back centre)
const LANDMARKS: Landmark[] = [
  { id: 'shoya', name: '庄屋', foot: { w: 13.0, d: 6.4 }, tags: ['building'], build(c, p) {
    // the headman's farmhouse: five bays (wall, shoji, doorway into the doma, shoji, wall), a deep veranda, a heavy six-tier thatch,
    // a stone-kerbed hearth smoke, a rain barrel and a stack of bales by the door
    const lit = p.lamp > 0.3;
    const q = minka(c, p.x, p.z - 0.4, 0, { hw: 70, hd: 32, H: 36, ev: 10, tiers: [[0, 7], [11, 6], [10, 6], [9, 6], [8, 6], [7, 6]], hip: 3, bays: 'wsdsw', lit, noren: VC.indigo });
    if (lit) c.light(q.door, 0xff9a48, 3.6 * p.lamp, 7);
    smoke(c, q.smoke, { rate: 2.4 });
    tawara(c, p.x - 5.6, p.z + 2.2, 0);
    const B = frame(c.w, p.x + 5.7, p.z + 2.2); B(-4, -1, -4, 4, 9, 4, VC.wood); B(-4, 3, -4, 4, 3, 4, VC.iron); B(-4, 8, -4, 4, 8, 4, VC.iron); B(-3, 10, -3, 3, 10, 3, VC.water);
  } },
  { id: 'satomon', name: '里门', foot: { w: 10.4, d: 4.2 }, tags: ['gate', 'tall'], build(c, p) {
    // the village gate in its palisade: two watchtowers flank a roofed gate whose leaves stand open; the stakes run off to both sides
    const g = 18, tx = 3.0;
    sakumon(c, p.x, p.z, 0, 72, g, [[-M(tx) - 16, -M(tx) + 16], [M(tx) - 16, M(tx) + 16]]);
    for (const s of [-1, 1]) { const lp = yagura(c, p.x + s * tx, p.z - 0.2, 0); lampLight(c, p, lp, 1.2, 6); }
    const B = frame(c.w, p.x, p.z);
    for (const s of [-1, 1]) { B(s * (g + 8) - 3, -1, 6, s * (g + 8) + 3, 1, 12, VC.stoneD); B(s * (g + 8) - 1, 2, 8, s * (g + 8) + 1, 22, 10, VC.post); B(s * (g + 8) - 2, 23, 7, s * (g + 8) + 2, 27, 11, VC.paperG, 1); B(s * (g + 8) - 3, 28, 6, s * (g + 8) + 3, 29, 12, VC.woodD); }
  } },
  { id: 'suisha', name: '水车小屋', foot: { w: 10.6, d: 6.4 }, tags: ['water', 'building', 'wheel-big'], build(c, p) {
    // the mill: a long low house, its big wheel turning in the race in front of it (a plank bridge where the path crosses). On the
    // 川端 layout the floor already has a race across the back: the wheel stands in that one instead of a second channel.
    const lit = p.lamp > 0.3, hx = p.x - 1.6, R = 30;
    const q = minka(c, hx, p.z - 0.9, 0, { hw: 46, hd: 24, H: 30, ev: 8, tiers: [[0, 6], [9, 6], [8, 6], [7, 6], [6, 6]], hip: 2, bays: 'sdsw', lit, veranda: false, noren: VC.kaki });
    if (lit) c.light(q.door, 0xff9a48, 3.0 * p.lamp, 6);
    smoke(c, q.smoke, { rate: 1.8 });
    const X = M(p.x), wx = M(hx) + 46 + 6 + R, raceZ = M(RACE.z0 + 0.45), hasRace = !c.w.has(wx, -1, raceZ) && c.w.has(wx, -2, raceZ);
    const az = hasRace ? raceZ : M(p.z) + 34;
    if (!hasRace) {
      channel(c, X, az, 0, -74, 74, -5, 4);
      const B = frame(c.w, p.x, (az + 0.5) * CELL);
      B(-18, 0, -8, 18, 1, 7, VC.woodL); for (const a of [-18, 18]) B(a, 2, -8, a, 4, 7, VC.woodD); for (const b of [-8, 7]) B(-18, 2, b, 18, 2, b, VC.woodD);
    }
    // the wheel: two stone piers in the race carry the axle; the wheel (its own mesh) turns in the gap between them, flat to the view
    for (const dz of [-6, 6]) { const zz = az + dz; c.w.box(wx - 2, -2, zz - 1, wx + 2, 20, zz + 1, VC.stoneD); c.w.box(wx - 3, 21, zz - 2, wx + 3, 22, zz + 2, VC.stone); }
    c.w.box(wx - 1, 23, az - 8, wx + 1, 25, az + 8, VC.iron);
    wheel(c, [(wx + 0.5) * CELL, 24.5 * CELL, (az + 0.5) * CELL], 'z', R, 3);
    spill(c.w, wx - 3, 24 + R + 3, 24 + R + 1, az - 4, false);
    c.w.box(wx - 4, -1, az - 3, wx + 4, -1, az + 3, 0x9ad0c8);
    // the head race: a flume on trestles bringing water over the top of the wheel from the hillside behind
    const fy = 24 + R + 4, zb = az - 34;
    for (const zz of [zb + 4, zb + 18]) { for (const dx of [-5, 5]) c.w.box(wx - 4 + dx, -1, zz, wx - 4 + dx, fy - 1, zz, VC.post); c.w.box(wx - 9, fy - 6, zz, wx + 1, fy - 5, zz, VC.woodD); }
    c.w.box(wx - 9, fy, zb, wx + 1, fy, az - 4, VC.woodD).box(wx - 9, fy + 1, zb, wx - 9, fy + 3, az - 4, VC.wood).box(wx + 1, fy + 1, zb, wx + 1, fy + 3, az - 4, VC.wood);
    c.w.box(wx - 8, fy + 1, zb, wx, fy + 2, az - 4, 0x5a9a96).box(wx - 6, fy + 2, zb, wx - 2, fy + 2, az - 4, 0x8ac0b8);

  } },
];

// ------------------------------------------------------------------ groups
const G: Group[] = [
  // ---- big (L)
  { id: 'keiko', name: '训练场', tags: ['training', 'training-big'], foot: { w: 3.0, d: 4.4 }, h: 1.9, kinds: ['wing'], size: 'L', weight: 1.4, build(c, p) {
    // a packed-sand yard edged with stakes: two wooden dummies, a straw post and a kunai target facing the floor, a row of jumping posts
    const B = frame(c.w, p.x, p.z, faceOf(p.s));
    for (let a = -30; a <= 30; a++) for (let b = -20; b <= 20; b++) B(a, -1, b, a, -1, b, (Math.abs(a) > 28 || Math.abs(b) > 18) ? VC.kerb : ((a + 40) >> 3) & 1 ? VC.mudL : VC.mud);
    mokujin(B, -20, -6); mokujin(B, -4, -6); makiwara(B, 12, -6);
    mato(B, 21, -15);
    for (const [a, h] of [[-24, 6], [-16, 9], [-8, 7], [0, 10]] as const) kui(B, a, 12, h);
    // a rack of practice staves at the back corner
    B(22, -1, 6, 23, 16, 7, VC.post); B(22, 17, 6, 23, 17, 16, VC.woodD); B(22, -1, 15, 23, 16, 16, VC.post); B(22, 6, 6, 23, 6, 16, VC.woodD);
    for (const b of [8, 11, 14]) B(21, 0, b, 21, 22, b, VC.woodL);
  } },
  { id: 'hatake', name: '菜畦', tags: ['field', 'low'], foot: { w: 3.6, d: 4.2 }, h: 1.85, kinds: ['wing', 'corner'], size: 'L', build(c, p) {
    // raised vegetable ridges in a board edge, a scarecrow in the middle, a bucket and a hoe by the corner
    const B = frame(c.w, p.x, p.z, faceOf(p.s));
    beds(c, B, -28, 28, -24, 22, p.season);
    kakashi(B, 4, -2);
    B(-30, -1, 25, -26, 4, 29, VC.wood); B(-30, 2, 25, -26, 2, 29, VC.iron); B(-22, 0, 27, -12, 0, 27, VC.woodL); B(-12, 0, 26, -10, 1, 28, VC.iron);
  } },
  { id: 'suiro', name: '水渠水车', tags: ['water', 'wheel'], foot: { w: 4.4, d: 2.0 }, h: 2.4, kinds: ['wing'], size: 'L', excludes: ['wheel-big'], build(c, p) {
    // always faces the camera, so the wheel turns flat to the view
    suiro(c, p.x, p.z, 0, 30);
  } },
  // ---- middle (M)
  { id: 'koya', name: '小屋', tags: ['building', 'house'], foot: { w: 3.4, d: 3.2 }, h: 4.4, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, weight: 1.3, build(c, p) {
    const q = minka(c, p.x, p.z, orient(p), { hw: 18, hd: 16, H: 28, ev: 6, tiers: [[0, 6], [8, 6], [7, 6], [6, 6]], hip: 2, bays: 'sd', lit: p.lamp > 0.3, veranda: false, noren: p.rnd(1) < 0.5 ? VC.indigo : VC.kaki });
    if (p.lamp > 0.3) c.light(q.door, 0xff9a48, 2.2 * p.lamp, 4.5);
    if (p.rnd(2) < 0.6) smoke(c, q.smoke, { rate: 1.6 });
  } },
  { id: 'kura', name: '土仓', tags: ['building', 'store'], foot: { w: 2.8, d: 2.8 }, h: 4.3, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    kura(c, p.x, p.z, orient(p));
    const B = frame(c.w, p.x, p.z, orient(p)); B(17, -1, 4, 21, 6, 8, VC.wood); B(17, 3, 4, 21, 3, 8, VC.iron);
  } },
  { id: 'yagura', name: '瞭望台', tags: ['tall', 'light'], foot: { w: 2.2, d: 2.4 }, h: 6.3, kinds: ['back', 'corner'], size: 'M', build(c, p) {
    const lp = yagura(c, p.x, p.z, orient(p)); lampLight(c, p, lp, 1.1, 6);
  } },
  { id: 'hoshi', name: '晒架', tags: ['cloth'], foot: { w: 1.4, d: 3.6 }, h: 2.1, kinds: ['wing'], size: 'M', build(c, p) {
    // a long bamboo drying rack: three posts, two bars, indigo and persimmon cloths hanging, a bundle of herbs at one end, a basket below
    const B = frame(c.w, p.x, p.z, faceOf(p.s));
    for (const a of [-24, 0, 24]) B(a - 1, -1, -1, a, 28, 0, VC.post);
    B(-26, 29, -1, 26, 29, 0, VC.strawD); B(-26, 22, -1, 26, 22, 0, VC.strawD);
    const cols = [VC.indigo, VC.white, VC.kaki, VC.indigoL];
    [[-22, -13, 12], [-11, -3, 15], [2, 10, 11], [12, 21, 14]].forEach(([a, b, d], i) => B(a, 29 - d, 1, b, 28, 1, cols[(i + Math.floor(p.rnd(3) * 4)) % 4]));
    for (let k = 0; k < 3; k++) B(-22 + k * 3, 14, -1, -21 + k * 3, 21, -1, k & 1 ? VC.leafL : VC.leaf);
    B(4, -1, 5, 12, 3, 11, VC.straw); B(5, 4, 6, 11, 4, 10, VC.strawD); B(6, 4, 7, 10, 4, 9, VC.kaki);
  } },
  { id: 'takibi', name: '篝火', tags: ['fire', 'light', 'low'], foot: { w: 2.4, d: 2.6 }, h: 1.45, kinds: ['wing', 'back'], size: 'S', weight: 1.2, build(c, p) {
    const lit = p.time !== 'day' || p.rnd(1) < 0.4, f = takibi(c, p.x, p.z, faceOf(p.s), lit, p.season);
    if (lit) { c.light([f[0], f[1] + 0.3, f[2]], 0xff8a3a, 3.2 * Math.max(p.lamp, 0.5), 6); smoke(c, [f[0], f[1] + 0.9, f[2]], { rate: 3, col: 0x9a948a }); }
  } },
  { id: 'kinoki', name: '柿树', tags: ['tree'], foot: { w: 1.8, d: 1.8 }, h: 7.0, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, build(c, p) {
    // an old persimmon by the houses: a broad low crown (orange in autumn), a picking stool at its foot
    const col = p.season === 'autumn' ? MAPLE_BY.autumn[3] : LEAF_BY[p.season];
    oak(c.w, p.x, p.z, 5.2 + p.rnd(1) * 1.4, { seed: p.seed, bark: 0x4a3a2c, dark: 0x30241c, leaf: col[0], leafTop: col[1], low: 0.38, width: 1.2, vines: 0 });
    const B = frame(c.w, p.x - 0.7 * (p.s || 1), p.z + 0.6); B(-3, -1, -2, 3, 5, 2, VC.woodL); B(-3, 0, -2, 3, 1, 2, VC.woodD);
  } },
  { id: 'hasa', name: '稻架', tags: ['field', 'autumn'], foot: { w: 1.2, d: 4.0 }, h: 2.3, kinds: ['wing', 'corner'], size: 'M', seasons: ['autumn'], weight: 4, build(c, p) {
    hasa(c, p.x, p.z, faceOf(p.s), 26);
  } },
  { id: 'saku', name: '木栅', tags: ['fence'], foot: { w: 3.2, d: 1.4 }, h: 3.7, kinds: ['back'], size: 'M', build(c, p) {
    // a stretch of the village palisade with a small wicket gate and a bucket of water against fire
    sakumon(c, p.x, p.z, 0, 21, 6);
    const B = frame(c.w, p.x, p.z); B(16, -1, 4, 20, 5, 8, VC.wood); B(16, 3, 4, 20, 3, 8, VC.iron); B(17, 5, 5, 19, 5, 7, VC.water);
  } },
  // ---- small (S): the near rows take only the low ones (≤ 1.6 m)
  { id: 'maki', name: '柴堆', tags: ['wood', 'low'], foot: { w: 2.4, d: 2.2 }, h: 1.0, kinds: ['wing', 'back'], size: 'S', max: 1, weight: 0.8, build(c, p) {
    const r = faceOf(p.s), along = r === 0 ? 'x' : 'z';
    logPile(c.w, p.x, p.z, 1.8, 3, along, { d: 4, bark: VC.bark, ring: VC.logEnd, heart: VC.logEndD, post: VC.post });
    const B = frame(c.w, p.x, p.z, r); B(-14, -1, 10, -8, 3, 16, VC.woodD); B(-13, 4, 11, -9, 4, 15, VC.logEnd); B(-11, 5, 13, -11, 9, 13, VC.woodL); B(-13, 9, 12, -9, 10, 14, VC.iron);
  } },
  { id: 'ido', name: '井', tags: ['water', 'stone', 'well'], foot: { w: 2.0, d: 2.0 }, h: 2.4, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a square stone kerb, dark water inside, two posts and a crossbeam with a pulley and a hanging bucket on a rope, a washing tub
    const B = frame(c.w, p.x, p.z, orient(p));
    B(-9, -1, -9, 9, 8, 9, VC.stone); B(-9, 9, -9, 9, 9, 9, VC.stoneL); B(-6, 3, -6, 6, 9, 6, null); B(-6, 2, -6, 6, 2, 6, VC.water);
    B(-12, -1, -1, -10, 30, 1, VC.post); B(10, -1, -1, 12, 30, 1, VC.post); B(-13, 31, -2, 13, 33, 2, VC.woodD);
    B(-2, 27, -1, 1, 30, 1, VC.wood); B(0, 16, 0, 0, 26, 0, VC.rope);
    B(-2, 12, -2, 2, 15, 2, VC.wood); B(-2, 13, -2, 2, 13, 2, VC.iron);
    B(9, 10, 3, 13, 12, 7, VC.woodL);
    B(-7, -1, 11, 3, 3, 17, VC.wood); B(-6, 2, 12, 2, 3, 16, VC.water); B(-7, 1, 11, 3, 1, 17, VC.iron);
  } },
  { id: 'tawara', name: '米俵', tags: ['store', 'low'], foot: { w: 2.2, d: 1.8 }, h: 1.1, kinds: ['wing', 'back'], size: 'S', build(c, p) { tawara(c, p.x, p.z, faceOf(p.s)); } },
  { id: 'yakusou', name: '药草席', tags: ['herb', 'low'], foot: { w: 1.8, d: 3.2 }, h: 0.75, kinds: ['wing'], size: 'S', build(c, p) {
    // straw mats on low trestles with herbs and mushrooms laid out to dry in blocks of colour, a mortar and a stack of baskets
    const B = frame(c.w, p.x, p.z, faceOf(p.s));
    for (const [a0, a1] of [[-15, -1], [2, 16]]) {
      for (const a of [a0 + 1, a1 - 1]) for (const b of [-9, 9]) B(a, -1, b, a, 4, b, VC.post);
      B(a0, 5, -10, a1, 5, 10, VC.straw); B(a0, 5, -10, a1, 5, -10, VC.strawD); B(a0, 5, 10, a1, 5, 10, VC.strawD);
    }
    const herb = [VC.leaf, 0x7a6a3a, 0x6a4a5a, VC.leafL, 0x8a5a2a, 0x5a6a3a];
    for (let i = 0; i < 6; i++) { const a = (i % 3) < 3 ? (i < 3 ? -13 + i * 4 : 4 + (i - 3) * 4) : 0, b = i % 2 ? -6 : 1; B(a, 6, b, a + 2, 6, b + 4, herb[(i + Math.floor(p.rnd(1) * 6)) % 6]); }
    B(-20, -1, -5, -17, 5, -2, 0x5e5a52); B(-20, 6, -5, -17, 6, -2, 0x3e3a34); B(-19, 6, -4, -18, 9, -3, VC.woodL);
    for (let k = 0; k < 3; k++) B(19 - k, k * 3 - 1, 4 - k, 23 - k, k * 3 + 1, 8 - k, k & 1 ? VC.strawD : VC.straw);
  } },
  { id: 'hyoutan', name: '瓢棚', tags: ['fence', 'low'], foot: { w: 1.6, d: 2.7 }, h: 1.5, kinds: ['wing'], size: 'S', build(c, p) {
    // a low woven-wattle fence along the slot, a gourd trellis on four posts behind it with gourds hanging from the bars
    const B = frame(c.w, p.x, p.z, faceOf(p.s));
    for (let a = -18; a <= 18; a++) B(a, -1, 8, a, 9, 8, ((a + 20) >> 1) & 1 ? VC.woodL : VC.wood);
    for (const y of [3, 7]) B(-18, y, 9, 18, y, 9, VC.woodD);
    for (const a of [-18, 0, 18]) B(a, -1, 7, a, 11, 9, VC.post);
    for (const a of [-14, 14]) for (const b of [-8, 4]) B(a, -1, b, a, 19, b, VC.post);
    B(-15, 20, -9, 15, 20, 5, VC.woodD);
    for (let a = -13; a <= 13; a += 4) B(a, 20, -8, a + 1, 20, 4, VC.strawD);
    for (const [a, b, s] of [[-9, -4, 1], [-2, 1, 0], [5, -5, 1], [10, 0, 0]] as const) { B(a, 18, b, a, 19, b, VC.leaf); B(a - 1, 14 - s, b - 1, a + 1, 17, b + 1, 0xc8b464); B(a - 2, 12 - s, b - 2, a + 2, 13 - s, b + 2, 0xc8b464); }
  } },
  { id: 'tobi', name: '跳桩', tags: ['training', 'low'], foot: { w: 2.6, d: 2.6 }, h: 1.45, kinds: ['wing'], size: 'S', excludes: ['training-big'], build(c, p) { tobi(c, p.x, p.z, faceOf(p.s)); } },
  { id: 'kakure', name: '伪装岩门', tags: ['secret', 'rock', 'low', 'light'], foot: { w: 2.2, d: 2.4 }, h: 1.6, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    const g = kakure(c, p.x, p.z, faceOf(p.s), GRASS_BY[p.season][2], p.lamp > 0.3); lampLight(c, p, g, 0.8, 3);
  } },
  { id: 'hato', name: '信鸽舍', tags: ['tall'], foot: { w: 1.4, d: 1.4 }, h: 4.7, kinds: ['back', 'corner', 'wing'], size: 'S', build(c, p) { hato(c, p.x, p.z, orient(p)); } },
  { id: 'koinobori', name: '鲤鱼旗', tags: ['tall', 'spring'], foot: { w: 1.0, d: 1.0 }, h: 6.5, kinds: ['back', 'corner'], size: 'S', seasons: ['spring'], weight: 2, build(c, p) { koinobori(c, p.x, p.z, p.s > 0 ? 2 : 0); } },
  { id: 'yukidaruma', name: '雪人', tags: ['winter', 'low'], foot: { w: 1.6, d: 1.8 }, h: 1.45, kinds: ['wing', 'back'], size: 'S', seasons: ['winter'], weight: 2, build(c, p) {
    yukidaruma(c, p.x, p.z, faceOf(p.s));
    const B = frame(c.w, p.x + 0.7, p.z + 0.2); B(-3, -1, -3, 3, 6, 3, 0xe8eef6); B(-2, 7, -2, 2, 9, 2, 0xe8eef6); B(-1, 8, 3, 1, 8, 3, VC.black);
  } },
];
const FILLER: Group[] = [
  { id: 'f_oke', name: '水桶', tags: ['low'], foot: { w: 0.8, d: 0.8 }, h: 0.6, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    const B = frame(c.w, p.x, p.z); B(-3, -1, -3, 3, 5, 3, VC.wood); B(-3, 2, -3, 3, 2, 3, VC.iron); B(-2, 6, -2, 2, 6, 2, VC.water); B(-3, 6, 0, -3, 7, 0, VC.woodD); B(3, 6, 0, 3, 7, 0, VC.woodD);
  } },
  { id: 'f_kame', name: '水缸', tags: ['low'], foot: { w: 0.9, d: 0.9 }, h: 0.7, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    const B = frame(c.w, p.x, p.z); B(-4, -1, -3, 4, 6, 3, 0x6a4a34); B(-3, -1, -4, 3, 6, 4, 0x6a4a34); B(-3, 7, -3, 3, 8, 3, 0x7e5a40); B(-2, 9, -2, 2, 9, 2, VC.woodD);
  } },
  { id: 'f_ishi', name: '石', tags: ['rock'], foot: { w: 1.0, d: 0.9 }, h: 0.6, kinds: ['wing'], size: 'S', max: 3, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    const B = frame(c.w, p.x, p.z); const k = p.rnd(1) < 0.5 ? 1 : 0; B(-6, -1, -4, 6, 3, 4, VC.stoneD); B(-4 + k, 4, -3, 4 + k, 6, 2, VC.stone); B(-2 + k, 7, -2, 2 + k, 7, 1, GRASS_BY[p.season][2]);
  } },
  { id: 'f_tawara', name: '草捆', tags: ['low'], foot: { w: 1.0, d: 0.8 }, h: 0.6, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    const B = frame(c.w, p.x, p.z); B(-6, -1, -4, 6, 6, 4, VC.straw); for (const a of [-4, 0, 4]) B(a, -1, -4, a, 6, 4, VC.rope); B(-6, 0, -3, -6, 5, 3, VC.strawD); B(6, 0, -3, 6, 5, 3, VC.strawD);
  } },
];

// ------------------------------------------------------------------ layouts: the three generic ones and the river-side square
const S = (id: string, kind: Slot['kind'], size: Slot['size'], x: number, z: number, w: number, d: number, maxH?: number): Slot =>
  ({ id, kind, size, x, z, w, d, s: x > 0.5 ? 1 : x < -0.5 ? -1 : 0, ...(maxH ? { maxH } : {}) });
/** 川端：a mill race runs across the back of the square (the path crosses it on a slab bridge); the landmark stands beyond the water,
 *  the wings are uneven (a big yard on one side, a house and a well on the other) */
const KAWABATA: Layout = { id: 'kawabata', name: '川端', landmark: { x: 0, z: -12.4, w: 13.4, d: 6.4 },
  path: [{ x0: -1.1, z0: -9.6, x1: 1.1, z1: 8.4 }],
  slots: [
    S('L1', 'wing', 'M', -8.3, -5.8, 3.6, 3.6), S('L2', 'wing', 'L', -8.6, -0.6, 4.6, 4.8), S('L3', 'wing', 'S', -7.6, 3.8, 2.8, 2.8, 1.6),
    S('R1', 'wing', 'L', 8.6, -5.0, 4.6, 4.8), S('R2', 'wing', 'M', 8.2, 0.4, 3.6, 3.4), S('R3', 'wing', 'S', 7.6, 3.8, 2.8, 2.8, 1.6),
    S('BL', 'back', 'M', -9.8, -10.8, 3.2, 2.4), S('BR', 'back', 'S', 9.4, -10.6, 2.4, 2.0),
    S('CL', 'corner', 'L', -11.8, -13.6, 4.6, 3.6), S('CR', 'corner', 'L', 12.0, -13.4, 4.6, 3.6),
  ] };
const RACE = { z0: -8.9, z1: -8.0 };

// ------------------------------------------------------------------ ground
function floor(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, grass = GRASS_BY[f.p.season], paths = f.layout.path, court = f.layout.court, sd = f.p.seed % 7, race = f.layout.id.startsWith('kawabata');
  const near = (r: Rect, x: number, z: number, m: number) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  // The village square is trodden earth in three mid tones. Read from the middle out:
  //   the lane (paths): packed light earth with two wheel ruts as 2-cell dark bands, a 3-cell worn shoulder either side
  //   the square: medium earth, worn lighter in broad 0.5 m-step patches round the lane, darker where it is rarely walked
  //   the drainage edge: a 3-cell gutter (dark) with a 2-cell stone lip (light) where the square meets the grass
  //   beyond: field grass in two tones, a few bare earth patches
  const lane = (x: number, z: number) => paths.find(r => near(r, x, z, 0));
  const q = (v: number, s: number) => Math.round(v / s) * s;
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL; let col: number;
    const r = lane(x, z), shoulder = !r && paths.some(p => near(p, x, z, 0.21));
    const sq = Math.abs(x) < 7.2 && z > -9.4 && z < 7, inCourt = court && near(court, x, z, 0);
    const gutter = !sq && Math.abs(x) < 7.41 && z > -9.61 && z < 7.21, lip = !sq && !gutter && Math.abs(x) < 7.55 && z > -9.75 && z < 7.35;
    if (r) {
      const along = r.z1 - r.z0 >= r.x1 - r.x0, v = along ? X - M((r.x0 + r.x1) / 2) : Z - M((r.z0 + r.z1) / 2), av = Math.abs(v);
      col = av >= 7 && av <= 8 ? VC.pathD : VC.path;
    } else if (shoulder) col = VC.earthL;
    else if (sq || inCourt) {
      // wear: the square-ish distance to the nearest lane, in 0.5 m steps, light near the lane, darker far from it; a few large
      // darker patches (packed wet ground) where the field is high
      const d = Math.min(...paths.map(p => Math.max(p.x0 - x, x - p.x1, p.z0 - z, z - p.z1, 0)));
      const worn = q(d + field(X / 14, Z / 14, sd) * 0.6, 0.5);
      col = worn <= 1.0 ? VC.earthL : worn <= 3.5 ? VC.earth : VC.earthD;
      if (field(Math.floor(X / 6), Math.floor(Z / 6), sd + 4) > 1.05 && worn > 1) col = VC.earthD;
    } else if (gutter) col = 0x55452f;
    else if (lip) col = ((Math.floor(X / 6) + Math.floor(Z / 6)) & 1) ? VC.stone : VC.stoneD;
    else { const n = field(Math.floor(X / 3) / 4, Math.floor(Z / 3) / 4, sd + 2); col = n > 0.95 ? VC.earthD : n > 0.15 ? grass[0] : grass[2]; }
    w.set(X, -1, Z, col);
  }
  if (race) {
    // the mill race across the back: a dark bed, stone kerbs flush with the ground, a slab bridge where the path crosses
    const Z0 = M(RACE.z0), Z1 = M(RACE.z1), XA = M(-13.6), XB = M(13.6), px0 = M(paths[0].x0) - 2, px1 = M(paths[0].x1) + 2;
    for (let X = XA; X <= XB; X++) {
      const br = X >= px0 && X <= px1;
      if (br) { for (let Z = Z0 - 2; Z <= Z1 + 2; Z++) w.set(X, -1, Z, (X === px0 || X === px1) ? VC.stoneD : VC.stoneL); continue; }
      for (let Z = Z0; Z <= Z1; Z++) { w.set(X, -1, Z, null); w.set(X, -2, Z, 0x2a3a34); }
      for (const Z of [Z0 - 2, Z0 - 1, Z1 + 1, Z1 + 2]) w.set(X, -1, Z, ((X >> 3) & 1) ? VC.stoneD : VC.stone);
    }
    c.water(XA * CELL, Z0 * CELL, px0 * CELL, (Z1 + 1) * CELL, VC.water);
    c.water((px1 + 1) * CELL, Z0 * CELL, (XB + 1) * CELL, (Z1 + 1) * CELL, VC.water);
  }
}
// ------------------------------------------------------------------ the far ring: the valley — cedar walls, terraced paddies, roofs
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, r = f.p.rnd, season = f.p.season, lf = LEAF_BY[season];
  // terraced paddies on both flanks: three steps rising away from the stage, each a flat field with an earthen bund
  const top = season === 'autumn' ? [0xb8963e, 0xa08236] : season === 'winter' ? [0x6a5a48, 0x5e5040] : season === 'summer' ? [0x4e8a4a, 0x5e9a52] : [0x5e8e86, 0x6e9e94];
  for (const s of [-1, 1]) for (let t = 0; t < 3; t++) {
    const xa = s > 0 ? 13.8 + t * 2.0 : -15.8 - t * 2.0, xb = xa + 2.0, H = 2 + t * 5, zA = -15, zB = 8;
    const X0 = M(xa), X1 = M(xb) - 1;
    for (let Z = M(zA); Z <= M(zB); Z += 24) {
      const Z1 = Math.min(M(zB), Z + 22);
      w.box(X0, -1, Z, X1, H - 1, Z1, VC.earthD).box(X0, H, Z, X1, H, Z1, top[(Math.floor(Z / 24) + t) & 1]);
      w.box(X0, H, Z, X1, H + 1, Z, VC.earth).box(X0, H, Z1, X1, H + 1, Z1, VC.earth).box(s > 0 ? X0 : X1, H, Z, s > 0 ? X0 : X1, H + 1, Z1, VC.earth);
    }
  }
  // the valley wall: cedars and a few broadleaf trees round the back and the flanks
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i < 6; i++) pts.push([21 + (i % 2) * 1.6, -14 + i * 3.2, 8 + r(300 + i) * 3]);
  for (let i = 0; i < 9; i++) pts.push([-15 + i * 3.6 + (i % 2) * 0.8, -21 - (i % 2) * 1.6, 10 + r(320 + i) * 3]);
  for (let i = 0; i < 6; i++) pts.push([-21 - (i % 2) * 1.6, -14 + i * 3.2, 8 + r(340 + i) * 3]);
  pts.forEach(([x, z, h], i) => { if ((i + f.p.seed) % 4 === 1) oak(w, x, z, h * 0.7, { seed: 80 + i, leaf: lf[0], leafTop: lf[1], low: 0.4, width: 1.05, vines: 0 }); else pine(w, x, z, h, 0x3a2e26, 0x26402c, 0x365a3c, { seed: 90 + i, slim: 0.8 }); });
  // two or three thatched roofs of the rest of the village peeking over the back (walls low, no detail)
  const n = 2 + (r(410) < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 9.5 + (r(420 + i) - 0.5) * 3, z = -18.2 - r(430 + i) * 1.2, B = frame(w, x, z);
    B(-26, -1, -14, 26, 18, 14, VC.mud); B(-26, -1, -14, 26, 7, 14, VC.wood);
    thatch(B, -32, 32, -20, 20, 19, [[0, 6], [8, 6], [7, 6], [6, 6]], 2);
  }
}
// ------------------------------------------------------------------ dressing
function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  templeDress(c, { clear: f.clear, seed: f.p.seed, drifts: [], moss: [...GRASS_BY[f.p.season]], noAmbient: true });
  if (f.p.season !== 'winter') c.ambient({ kind: 'dust', color: 0xe8d8b8, rate: 1.2 });
}
export const village: Locale = {
  id: 'ninja_village', name: '忍里', theme: 'ninja',
  layouts: ['axis', 'offset', 'garden'], extraLayouts: [KAWABATA],
  landmarks: LANDMARKS, groups: G, filler: FILLER,
  floor, far, dress,
};
void kui; void makiwara; void mokujin; void mato;
