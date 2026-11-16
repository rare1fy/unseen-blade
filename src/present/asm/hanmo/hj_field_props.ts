// 麦田的道具组（hj_field 代理）：打谷场、麦秸垛、水渠闸桥、瓜棚、桔槔井、坟丘、断墙、榆树、黄巾旗、残旗、麦个子、稻草人、农具、
// 烧剩的麦垛、流民野灶，加几样小件。本地框 front = +z；翼位的组转向战斗区（faceOf），后排转向镜头（orient）。
import { M } from '../../scenes/props';
import { oak } from '../../scenes/flora';
import type { Group } from '../types';
import { HC, ELM, WATER_MARK, cropOf, frame, faceOf, orient, octo, thatch, rammed, rick, sheaf, sheafLying, stook, jar, basket, sack, headband, pole, lit, smoke, locM } from './hj_field_kit';

const fireLight = (c: Parameters<Group['build']>[0], at: [number, number, number], k: number) => c.light(at, 0xff8a3a, k, 5);

export const GROUPS: Group[] = [
  // ---- L
  { id: 'dachang', name: '打谷场', tags: ['yard', 'low'], foot: { w: 3.2, d: 4.4 }, h: 1.3, kinds: ['wing'], size: 'L', weight: 1.3, build(c, p) {
    // the threshing yard: a rolled pad, a stepped heap of grain with a wooden shovel in it, flails, a winnowing basket, sacks
    const B = frame(c.w, p.x, p.z, faceOf(p.s)), pal = cropOf(p.season, 0);
    B(-30, -1, -21, 30, -1, 21, HC.yardL); B(-30, -1, -21, 30, -1, -21, HC.earthD); B(-30, -1, 21, 30, -1, 21, HC.earthD);
    B(-18, -1, -8, -2, 2, 6, pal.ear); B(-15, 3, -6, -5, 5, 4, pal.ear); B(-12, 6, -3, -8, 7, 1, pal.side);
    B(-4, 0, -2, -4, 15, -2, HC.woodL); B(-6, 0, -4, -2, 4, -3, HC.plank);
    B(6, 0, 8, 26, 0, 8, HC.woodL); B(24, 0, 4, 25, 1, 12, HC.wood); B(6, 0, 14, 22, 0, 14, HC.woodL);
    B(8, -1, -14, 16, 1, -6, HC.strawL); B(8, 2, -14, 16, 2, -14, HC.strawD);
    sack(B, 20, -12); sack(B, 25, -10, HC.hempD); sack(B, 22, -4, HC.hemp, true);
    for (let a = -28; a <= -20; a += 4) sheafLying(B, a, a + 1, 12, -1, pal);
    basket(B, 18, 16, 3, 3, pal.ear);
  } },
  { id: 'maiduo', name: '麦秸垛', tags: ['stack', 'tall'], foot: { w: 3.6, d: 3.4 }, h: 3.0, kinds: ['corner', 'back', 'wing'], size: 'L', weight: 1.2, build(c, p) {
    // two straw ricks with mud-plastered tops, a pitchfork stuck in the big one, loose straw at their feet
    const B = frame(c.w, p.x, p.z, orient(p));
    rick(B, -8, 0, 16, 10, 40); rick(B, 17, 3, 8, 7, 26);
    B(-26, -1, 12, 26, -1, 16, HC.chaff);
    pole(B, 3, 11, -1, 22, HC.woodL); B(1, 23, 11, 5, 23, 11, HC.woodD); B(1, 24, 11, 1, 26, 11, HC.woodD); B(5, 24, 11, 5, 26, 11, HC.woodD);
  } },
  { id: 'qudao', name: '水渠闸桥', tags: ['water', 'low'], foot: { w: 2.4, d: 4.6 }, h: 1.1, kinds: ['wing'], size: 'L', build(c, p) {
    // an irrigation ditch along the slot: earth banks, a board sluice gate between two posts, a plank bridge, a bucket on the bank
    const B = frame(c.w, p.x, p.z, faceOf(p.s));
    B(-32, -1, -5, 32, -1, 5, WATER_MARK);
    for (const b of [-7, 6]) { B(-32, -1, b, 32, 0, b + 1, HC.earthD); }
    for (const b of [-8, 8]) B(-20, -1, b - 1, -19, 14, b, HC.post);
    B(-20, -1, -6, -20, 6, 6, HC.plank); B(-21, 15, -9, -18, 15, 9, HC.woodD);
    B(6, 1, -10, 14, 1, 10, HC.plank); for (const a of [6, 14]) B(a, 0, -10, a, 0, 10, HC.woodD);
    jar(B, 22, 12, 3, HC.wood, -1);
  } },
  // ---- M
  { id: 'guapeng', name: '瓜棚', tags: ['tall', 'light'], foot: { w: 2.6, d: 2.6 }, h: 3.9, kinds: ['back', 'corner', 'wing'], size: 'M', build(c, p) {
    // the field watch-shed on stilts: four posts, a board platform with a rail, a two-slab thatch, a ladder, melons below
    const B = frame(c.w, p.x, p.z, orient(p));
    for (const a of [-12, 12]) for (const b of [-12, 12]) B(a - 1, -1, b - 1, a + 1, 40, b + 1, HC.post);
    B(-14, 22, -14, 14, 23, 14, HC.plank); for (const u of [-14, 14]) { B(u, 24, -14, u, 28, 14, HC.wood); B(-14, 28, u, 14, 28, u, HC.woodL); }
    B(-14, 24, -14, 14, 24, -14, HC.woodD);
    thatch(B, -19, 19, -19, 19, 41, [[0, 4], [5, 4]]);
    for (const a of [-4, 4]) B(a, -1, 16, a, 22, 16, HC.wood); for (let y = 3; y <= 21; y += 5) B(-3, y, 16, 3, y, 16, HC.woodL);
    const melon = p.season === 'summer' ? HC.leaf : HC.strawD;
    B(-18, -1, -20, -6, 1, -15, melon); B(6, -1, -20, 18, 1, -16, melon); if (p.season === 'summer') { B(-14, 0, -18, -11, 2, -16, 0x8aa040); B(10, 0, -19, 13, 2, -17, 0x8aa040); }
    if (lit(p)) { B(10, 32, 13, 12, 36, 15, 0xe0a050, 1); const q = locM(M(p.x), M(p.z), orient(p), 11, 34, 14); c.light(q, 0xffa050, 1.8 * p.lamp, 5); }
  } },
  { id: 'jiegao', name: '桔槔井', tags: ['water', 'well'], foot: { w: 2.8, d: 2.8 }, h: 2.6, kinds: ['wing', 'back'], size: 'M', build(c, p) {
    // a well with a timber curb laid like the character 井, and a well-sweep: a forked post, the lever beam level at rest, a stone
    // counterweight on its short end, the rope and bucket over the well
    const B = frame(c.w, p.x, p.z, orient(p));
    B(-7, -1, -7, 7, 4, 7, HC.greyD); B(-5, 2, -5, 5, 4, 5, null); B(-5, 1, -5, 5, 1, 5, HC.bed);
    for (const b of [-7, 6]) B(-10, 5, b, 10, 6, b + 1, HC.wood); for (const a of [-7, 6]) B(a, 7, -10, a + 1, 8, 10, HC.woodD);
    B(-17, -1, -2, -15, 30, 2, HC.post); B(-17, 31, -2, -15, 33, -2, HC.post); B(-17, 31, 2, -15, 33, 2, HC.post);
    B(-34, 31, 0, 6, 32, 0, HC.woodL);
    B(-34, 25, -2, -30, 30, 2, HC.stoneD); B(-32, 30, 0, -32, 30, 0, HC.rope);
    B(5, 12, 0, 5, 30, 0, HC.rope); B(3, 9, -2, 7, 12, 2, HC.wood); B(3, 11, -2, 7, 11, 2, HC.iron);
    B(9, -1, 9, 18, 3, 14, HC.stone); B(10, 2, 10, 17, 3, 13, HC.water);
    jar(B, -10, 12, 3, HC.pot);
  } },
  { id: 'fenqiu', name: '坟丘', tags: ['grave', 'low'], foot: { w: 3.0, d: 2.2 }, h: 1.7, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    // a truncated-pyramid mound (覆斗) in three wide steps, grass on its treads, a small stele with a stepped head, an offering bowl
    const B = frame(c.w, p.x, p.z, 0), g = p.season === 'summer' ? 0x6a7a38 : 0x8a7e46;
    B(-19, -1, -12, 19, 5, 10, HC.earth); B(-19, 6, -12, 19, 6, 10, g);
    B(-14, 7, -9, 14, 11, 6, HC.earth); B(-14, 12, -9, 14, 12, 6, g);
    B(-9, 13, -6, 9, 16, 2, HC.earthL); B(-9, 17, -6, 9, 17, 2, g);
    B(-5, -1, 12, 5, 1, 15, HC.stoneD); B(-4, 2, 13, 4, 17, 14, HC.stone); B(-3, 18, 13, 3, 19, 14, HC.stoneL); B(-1, 20, 13, 1, 20, 14, HC.stoneL);
    B(-7, -1, 15, -5, 0, 15, HC.greyL); jar(B, 8, 13, 2, HC.grey);
  } },
  { id: 'duanqiang', name: '断墙', tags: ['wall'], foot: { w: 3.4, d: 1.2 }, h: 2.2, kinds: ['back', 'corner'], size: 'M', build(c, p) {
    // a broken stretch of rammed-earth wall: course lines, a broken top in three wide steps, a thatch coping left on the tall end,
    // fallen blocks at its foot; the rebels' 甲子 chalked on it now and then
    const B = frame(c.w, p.x, p.z, 0);
    rammed(B, -23, -1, -4, -8, 29, 4); rammed(B, -7, -1, -4, 4, 19, 4); rammed(B, 5, -1, -4, 12, 7, 4); rammed(B, 13, -1, -4, 23, 24, 4);
    B(-25, 30, -6, -6, 31, 6, HC.th); B(-25, 30, -6, -6, 30, 6, HC.thD); B(-23, 32, -4, -8, 32, 4, HC.thL);
    B(4, -1, 6, 10, 3, 11, HC.ram); B(-4, -1, 7, 1, 2, 10, HC.ramD);
    if (p.rnd(1) < 0.5) { const W = HC.white;
      // 甲
      B(-20, 14, 5, -16, 14, 5, W); B(-20, 10, 5, -20, 14, 5, W); B(-16, 10, 5, -16, 14, 5, W); B(-20, 12, 5, -16, 12, 5, W); B(-20, 10, 5, -16, 10, 5, W); B(-18, 5, 5, -18, 14, 5, W);
      // 子
      B(-14, 14, 5, -10, 14, 5, W); B(-11, 12, 5, -11, 13, 5, W); B(-15, 10, 5, -9, 10, 5, W); B(-12, 5, 5, -12, 11, 5, W); B(-13, 5, 5, -12, 5, 5, W);
    }
  } },
  { id: 'yushu', name: '榆树', tags: ['tree'], foot: { w: 2.0, d: 2.0 }, h: 7.2, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, build(c, p) {
    const pal = ELM[p.season], col = pal[Math.floor(p.rnd(1) * pal.length) % pal.length];
    oak(c.w, p.x, p.z, 5.4 + p.rnd(2) * 1.4, { seed: p.seed, bark: 0x4a3a2c, dark: 0x30241c, leaf: col[0], leafTop: col[1], low: 0.4, width: 1.05, vines: 0 });
  } },
  // ---- S
  { id: 'huangjin', name: '黄巾旗', tags: ['banner', 'tall'], foot: { w: 1.6, d: 1.6 }, h: 3.4, kinds: ['wing', 'back', 'corner'], size: 'S', build(c, p) {
    // a Yellow Turban banner left standing in a cairn: a pole, a crossarm, the yellow cloth hanging straight with a torn foot; two
    // spears stuck in the ground beside it
    const B = frame(c.w, p.x, p.z, 0);
    B(-5, -1, -4, 5, 2, 4, HC.stoneD); B(-3, 3, -3, 3, 4, 3, HC.stone);
    B(-1, -1, -1, 0, 46, 0, HC.woodD); B(-1, 45, -1, 15, 46, 0, HC.wood);
    B(2, 20, 0, 14, 44, 0, HC.yellow); B(2, 44, 0, 14, 44, 0, HC.yellowD); B(2, 20, 0, 2, 44, 0, HC.yellowD);
    B(9, 20, 0, 14, 24, 0, null); B(12, 25, 0, 14, 27, 0, null);
    for (const [a, b, h] of [[-9, 4, 30], [8, -5, 26]] as const) { B(a, -1, b, a, h, b, HC.wood); B(a, h + 1, b, a, h + 4, b, HC.iron); B(a - 1, h - 1, b, a + 1, h, b, HC.red); }
    headband(B, -6, 9);
  } },
  { id: 'canqi', name: '残旗', tags: ['banner', 'low'], foot: { w: 2.6, d: 2.0 }, h: 0.5, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a banner thrown down: the snapped pole lying, the yellow cloth spread on the stubble in two folds, a broken spear, a sandal
    const B = frame(c.w, p.x, p.z, orient(p));
    B(-16, -1, -2, 14, 0, -1, HC.woodD); B(14, -1, -3, 16, 1, 0, HC.woodL);
    B(-12, -1, 0, 4, -1, 12, HC.yellow); B(-12, 0, 0, -4, 0, 12, HC.yellowD); B(-4, 0, 0, 4, 0, 6, HC.yellow);
    B(4, -1, 6, 15, -1, 6, HC.wood); B(15, -1, 5, 17, 0, 7, HC.iron);
    B(-18, -1, 8, -15, 0, 12, HC.strawD);
  } },
  { id: 'maikun', name: '麦个子', tags: ['sheaf', 'low'], foot: { w: 2.4, d: 2.2 }, h: 1.15, kinds: ['wing', 'back'], size: 'S', max: 2, weight: 1.4, build(c, p) {
    // two stooks and a row of sheaves laid out to dry on the stubble
    const B = frame(c.w, p.x, p.z, 0), pal = cropOf(p.season, Math.floor(p.rnd(1) * 2));
    stook(B, -9, -6, pal); stook(B, 9, -4, pal);
    for (const a of [-14, -6, 2, 10]) sheafLying(B, a, a + 1, 9, -1, pal);
    for (const a of [-14, -6, 2, 10]) B(a, -1, 7, a + 1, 2, 11, pal.ear);
  } },
  { id: 'caoren', name: '稻草人', tags: ['scarecrow'], foot: { w: 1.6, d: 1.4 }, h: 1.9, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a scarecrow in a hemp robe with a straw hat (three flat tiers) — someone tied a yellow band round its head
    const B = frame(c.w, p.x, p.z, 0);
    B(0, -1, 0, 0, 23, 0, HC.post); B(-9, 17, 0, 9, 17, 0, HC.woodD);
    B(-5, 8, -3, 5, 16, 3, HC.hemp); B(-5, 12, -3, 5, 12, 3, HC.black); B(-9, 14, -2, -6, 17, 2, HC.hempD); B(6, 14, -2, 9, 17, 2, HC.hempD);
    B(-2, 18, -2, 2, 22, 2, HC.straw); B(-2, 21, -2, 2, 21, 2, HC.yellow);
    B(-6, 23, -6, 6, 23, 6, HC.straw); B(-4, 24, -4, 4, 24, 4, HC.strawD); B(-2, 25, -2, 2, 25, 2, HC.straw);
    B(-8, -1, 6, 8, -1, 9, HC.chaff);
  } },
  { id: 'nongju', name: '农具', tags: ['tools', 'low'], foot: { w: 2.0, d: 1.8 }, h: 1.55, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a rack of hung tools (a rake, a two-pronged 耒, a spade, sickles on the bar), baskets and a water jar at its foot
    const B = frame(c.w, p.x, p.z, orient(p));
    for (const a of [-12, 12]) B(a, -1, -6, a + 1, 20, -5, HC.post); B(-13, 21, -6, 14, 21, -4, HC.woodD);
    B(-8, 4, -4, -8, 20, -4, HC.woodL); B(-11, 4, -4, -5, 5, -4, HC.wood); for (let a = -11; a <= -5; a += 2) B(a, 2, -4, a, 3, -4, HC.wood);
    B(-1, 2, -4, -1, 20, -4, HC.wood); B(-2, 2, -4, -2, 4, -4, HC.iron); B(0, 2, -4, 0, 4, -4, HC.iron);
    B(5, 6, -4, 5, 20, -4, HC.woodL); B(3, 2, -4, 7, 6, -4, HC.iron);
    for (const a of [9, 11]) B(a, 16, -4, a, 20, -4, HC.iron);
    basket(B, -7, 6, 4, 4); basket(B, 3, 7, 3, 3, cropOf(p.season, 0).ear); jar(B, 11, 5, 3, HC.pot);
  } },
  { id: 'shaoduo', name: '烧垛', tags: ['fire', 'light', 'low'], foot: { w: 2.2, d: 2.2 }, h: 1.2, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a straw stack burnt down to a charred stump: a ring of unburnt straw at its foot, embers glowing in its top, ash round it, smoke
    const B = frame(c.w, p.x, p.z, 0);
    B(-15, -1, -15, 15, -1, 15, HC.ash); B(-12, -1, -12, 12, 3, 12, HC.straw); B(-12, 0, -12, 12, 0, 12, HC.strawD);
    B(-10, 4, -10, 10, 11, 10, HC.char); B(-6, 12, -6, 6, 15, 6, HC.charL);
    B(-4, 16, -3, 1, 16, 2, HC.ember, 1); B(3, 12, 4, 7, 12, 7, HC.ember, 1); B(-9, 9, 9, -6, 10, 10, HC.ember, 1);
    B(12, -1, 4, 17, 1, 8, HC.char); B(-17, -1, -5, -13, 0, -2, HC.charL);
    smoke(c, [p.x, 1.2, p.z], { rate: 2, col: 0x8a847a });
    fireLight(c, [p.x, 1.2, p.z], 2.2 * Math.max(p.lamp, 0.4));
  } },
  { id: 'yezao', name: '野灶', tags: ['fire', 'light', 'low'], foot: { w: 2.2, d: 2.0 }, h: 1.0, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a refugee's hearth: three stones under a pottery pot, the fire, a bundle, a straw mat and a gourd
    const B = frame(c.w, p.x, p.z, orient(p)), fire = p.time !== 'day' || p.rnd(1) < 0.5;
    B(-6, -1, -6, 6, -1, 6, HC.ash);
    for (const [a, b] of [[-5, -3], [5, -3], [0, 5]]) B(a - 2, -1, b - 2, a + 2, 4, b + 2, HC.stoneD);
    octo(B, 0, 0, 5, 2, 5, 10, HC.potD); B(-3, 11, -3, 3, 11, 3, HC.dark);
    if (fire) { B(-2, 0, -2, 2, 1, 2, HC.ember, 1); B(-1, 2, -1, 1, 3, 1, HC.emberL, 1); }
    B(10, -1, -10, 26, -1, 4, HC.straw); B(10, -1, -10, 26, -1, -10, HC.strawD);
    B(14, 0, -6, 21, 4, 0, HC.hemp); B(16, 5, -4, 19, 5, -2, HC.rope);
    B(-14, -1, 6, -11, 3, 9, HC.strawL); B(-13, 4, 7, -12, 6, 8, HC.strawL);
    if (fire) { const q = locM(M(p.x), M(p.z), orient(p), 0, 4, 0); fireLight(c, q, 2.4 * Math.max(p.lamp, 0.5)); smoke(c, [q[0], q[1] + 0.6, q[2]], { rate: 1.6, col: 0x9a948a }); }
  } },
];
export const FILLER: Group[] = [
  { id: 'f_kun', name: '麦捆', tags: ['low'], foot: { w: 1.0, d: 0.8 }, h: 0.4, kinds: ['wing'], size: 'S', max: 3, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    const B = frame(c.w, p.x, p.z), pal = cropOf(p.season, 0); sheafLying(B, -6, 6, -2, -1, pal); sheafLying(B, 6, -6, 3, -1, pal);
  } },
  { id: 'f_weng', name: '陶瓮', tags: ['low'], foot: { w: 0.8, d: 0.8 }, h: 0.6, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    jar(frame(c.w, p.x, p.z), 0, 0, 4, p.rnd(1) < 0.5 ? HC.grey : HC.pot);
  } },
  { id: 'f_sheaf', name: '麦个子', tags: ['low'], foot: { w: 0.6, d: 0.6 }, h: 1.0, kinds: ['wing'], size: 'S', max: 3, build(c, p) {
    if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground');
    const B = frame(c.w, p.x, p.z), pal = cropOf(p.season, 0); sheaf(B, -2, 0, -1, pal, 13); sheaf(B, 2, 1, -1, pal, 12);
  } },
];
