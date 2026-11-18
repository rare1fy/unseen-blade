// 焦梁坊的道具组（11-18）：烧光的里坊。塌屋（半截墙 + 焦梁 + 一角残顶）、屋架、坊墙段、焦树、井、灶台残屋、粮缸、晾架、余火、
// 门板、坍墙。大件全是民居（夯土墙、焦木屋架），和铜驼道的宫城（宫墙、阙、铜驼）、铸钱场的作坊（炉、范、铜）拉开。
// 写法照破庙：foot 是世界 x × z（米，未镜像）；翼位的长条组用 faceOf 把正面转向战斗区，所以长边沿世界 z。
import type { Group } from '../types';
import { LY, frame, faceOf, orient, wp, fireLight, smoke, rubble, emberHeap, frameBay, earthWall, hanRoof, beamDown, charTree } from './ly_kit';

/** a house wall stub: rammed earth with layer lines, a soot band under its broken top (the plaster gone), along local x */
const stub = (B: ReturnType<typeof frame>, x0: number, x1: number, z0: number, z1: number, h: number) => {
  B(x0, -1, z0, x1, h, z1, LY.earth); B(x0, -1, z0, x1, 1, z1, LY.earthD);
  for (let y = 7; y < h - 2; y += 6) { B(x0, y, z0, x1, y, z0, LY.earthD); B(x0, y, z1, x1, y, z1, LY.earthD); }
  B(x0, Math.max(2, h - 3), z0, x1, h, z0, LY.charL); B(x0, Math.max(2, h - 3), z1, x1, h, z1, LY.charL); B(x0, h, z0, x1, h, z1, LY.char);
};

export const WARD_GROUPS: Group[] = [
  // ---- L
  { id: 'ly_w_house', name: '塌屋', tags: ['building', 'ruin', 'burnt'], foot: { w: 3.6, d: 3.6 }, h: 3.3, kinds: ['wing', 'back', 'corner'], size: 'L', weight: 1.5, build(c, p) {
    // a house burnt down to the back and side walls at different heights, the front gone; four charred posts, two tie beams, the
    // ridge beam fallen across; one corner of the roof still on (a slab of tiles), the rest of the tiles in a heap inside; embers
    const r = orient(p), B = frame(c.w, p.x, p.z, r), lit = p.time !== 'day' || p.rnd(1) < 0.6;
    stub(B, -24, 24, -20, -17, 30); stub(B, -24, -21, -16, 14, 22); stub(B, 21, 24, -16, 2, 12);
    B(-20, -1, -16, 20, -1, 14, LY.ashD);
    frameBay(B, [[-18, -14, 36], [18, -14, 34], [-18, 12, 30], [18, 12, 14]], [[-18, -14, 18, -14, 33], [-18, -14, -18, 12, 31]]);
    // the beam under the roof corner that is left: on the back-left post's top and the back wall's (so nothing hangs in the air)
    B(-22, 35, -15, -4, 36, -13, LY.charL); B(-22, 31, -19, -20, 34, -15, LY.char);
    hanRoof(B, -28, -2, -24, -2, 37, [[0, 2], [4, 2]], 1, { cut1: true, ridge: false });
    rubble(B, 6, 0, 12, 9, 3, { beam: true });
    beamDown(B, -14, 16, 16);
    const e = emberHeap(B, -8, 2, lit), q = wp(p, r, e[0], e[1], e[2]);
    if (lit) fireLight(c, p, q, 0.9, 5);
    smoke(c, [q[0], q[1] + 0.2, q[2]], { rate: 1.6, col: 0x57524d });
  } },
  { id: 'ly_w_frame', name: '屋架', tags: ['building', 'ruin', 'burnt', 'tall'], foot: { w: 2.8, d: 4.4 }, h: 4.0, kinds: ['wing', 'corner', 'back'], size: 'L', build(c, p) {
    // a two-bay timber frame with nothing left on it: six charred posts on stone feet, beams along and across at two heights, one
    // post snapped and its beam hanging down to the ground; a low earth wall along the back
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    frameBay(B, [[-28, -12, 52], [0, -12, 52], [28, -12, 30], [-28, 12, 46], [0, 12, 46], [28, 12, 18]],
      [[-28, -12, 0, -12, 51], [-28, 12, 0, 12, 45], [-28, -12, -28, 12, 44], [0, -12, 0, 12, 44], [-28, -12, 28, -12, 26], [-28, 12, 28, 12, 22]]);
    B(26, 0, 12, 30, 17, 14, LY.charL);
    stub(B, -30, 30, -18, -16, 12);
    rubble(B, 14, 2, 10, 7, 2, { beam: true });
  } },
  { id: 'ly_w_lou', name: '残楼', tags: ['building', 'ruin', 'tall', 'burnt'], foot: { w: 3.4, d: 3.4 }, h: 5.2, kinds: ['corner', 'back'], size: 'L', max: 1, build(c, p) {
    // a two-storey house: the ground storey's earth walls, the upper storey's timber frame burnt to posts and a floor slab, half the
    // floor fallen in; a stair of three wide steps up its side
    const r = orient(p), B = frame(c.w, p.x, p.z, r);
    stub(B, -22, 22, -22, -19, 34); stub(B, -22, -19, -18, 18, 34); stub(B, 19, 22, -18, 18, 26); stub(B, -22, -6, 19, 22, 34); stub(B, 6, 22, 19, 22, 20);
    B(-22, 35, -22, 2, 36, 22, LY.charL); B(-22, 37, -22, 2, 37, 22, LY.char);
    // the upper storey's posts stand on the floor slab or the back wall's top (their feet charred), two beams left across the top
    for (const [x, z, h] of [[-20, -20, 70], [0, -20, 64], [-20, 20, 70], [20, -20, 50]] as const) { const y0 = x > 2 ? 35 : 38; B(x - 1, y0, z - 1, x + 1, h, z + 1, LY.char); B(x - 1, y0, z - 1, x + 1, y0 + 2, z + 1, LY.charD); }
    B(-22, 66, -22, 0, 67, -18, LY.charL); B(-22, 66, -18, -18, 67, 22, LY.charL);
    rubble(B, 8, 2, 12, 12, 3, { beam: true });
    for (let i = 0; i < 3; i++) B(24, -1, -12 + i * 8, 30, 8 + i * 9, -6 + i * 8, LY.earthD);
  } },
  // ---- M
  { id: 'ly_w_wall', name: '坊墙段', tags: ['wall', 'ruin'], foot: { w: 1.4, d: 4.2 }, h: 3.2, kinds: ['wing', 'corner', 'back'], size: 'M', weight: 1.3, build(c, p) {
    // a stretch of the ward's rammed-earth wall, a breach knocked in it, its tiled coping on the whole stretches; a charred door
    // leaf leant on it
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    earthWall(B, -29, 29, -3, 3, 38, [[-6, 8, 12], [16, 29, 26]]);
    B(-24, -1, 4, -14, 26, 5, LY.wood); for (let y = 6; y <= 22; y += 8) B(-24, y, 5, -14, y + 1, 5, LY.woodD); B(-24, 18, 4, -14, 26, 5, LY.char);
    rubble(B, 1, 9, 9, 4, 2);
  } },
  { id: 'ly_w_tree', name: '焦树', tags: ['tree', 'dead', 'tall'], foot: { w: 2.0, d: 2.0 }, h: 7.0, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, weight: 1.2, build(c, p) {
    charTree(c, p.x, p.z, 5.0 + p.rnd(1) * 1.6, p.seed, 0.4);
  } },
  { id: 'ly_w_well', name: '井', tags: ['stone', 'water'], foot: { w: 2.2, d: 2.2 }, h: 2.4, kinds: ['wing', 'back'], size: 'M', build(c, p) {
    // a square stone well curb with a dark water face, its windlass frame burnt (one post standing, the crossbar down), a bucket and
    // a trough beside it
    const B = frame(c.w, p.x, p.z, orient(p));
    B(-9, -1, -9, 9, 8, 9, LY.stone); B(-9, 9, -9, 9, 9, 9, LY.stoneL); B(-6, 0, -6, 6, 9, 6, null); B(-6, -1, -6, 6, 5, 6, 0x262c30);
    B(-9, -1, -9, 9, 1, 9, LY.stoneD);
    B(-12, -1, -1, -10, 32, 1, LY.char); B(-12, 30, -1, -2, 32, 1, LY.charL);
    B(10, -1, -2, 22, 1, 0, LY.char);
    B(12, -1, 6, 17, 5, 11, LY.wood); B(12, 5, 6, 17, 5, 11, LY.woodD); B(13, 2, 6, 16, 2, 11, LY.iron);
    B(-16, -1, 10, 4, 4, 16, LY.stoneD); B(-14, 2, 12, 2, 4, 14, 0x262c30);
  } },
  { id: 'ly_w_stove', name: '灶台', tags: ['fire', 'light', 'burnt'], foot: { w: 2.4, d: 2.4 }, h: 2.2, kinds: ['wing', 'back'], size: 'M', build(c, p) {
    // the kitchen of a house that burnt round it: a brick stove with two fire holes (one still glowing), its flue standing, a corner
    // of wall, a broken pot on the hob, jars by it
    const r = orient(p), B = frame(c.w, p.x, p.z, r), lit = p.time !== 'day' || p.rnd(1) < 0.5;
    stub(B, -16, 16, -16, -14, 20); stub(B, -16, -14, -13, 10, 14);
    B(-12, -1, -12, 8, 9, 0, LY.brick); B(-12, 10, -12, 8, 10, 0, LY.brickL); for (const y of [3, 7]) B(-12, y, 0, 8, y, 0, LY.brickD);
    for (const x of [-7, 3]) B(x - 2, 1, 0, x + 2, 5, 0, x < 0 && lit ? LY.ember : LY.charD, x < 0 && lit ? 1 : 0);
    B(4, 11, -12, 8, 32, -8, LY.brick); for (let y = 14; y < 32; y += 4) B(4, y, -8, 8, y, -8, LY.brickD); B(4, 30, -12, 8, 32, -8, LY.char);
    B(-9, 11, -8, -4, 14, -3, LY.iron); B(-8, 15, -7, -5, 15, -4, LY.ironL);
    for (const [x, z] of [[11, 4], [13, 11]] as const) { B(x - 3, -1, z - 3, x + 3, 6, z + 3, LY.clay); B(x - 2, 7, z - 2, x + 2, 7, z + 2, LY.clayD); }
    if (lit) { const q = wp(p, r, -7, 3, 1); fireLight(c, p, q, 0.8, 4); smoke(c, wp(p, r, 6, 33, -10), { rate: 1.2, col: 0x5a5652 }); }
  } },
  { id: 'ly_w_rack', name: '晾架', tags: ['wood', 'cloth'], foot: { w: 1.2, d: 3.0 }, h: 2.4, kinds: ['wing'], size: 'M', build(c, p) {
    // a drying frame half burnt: two posts, a pole, scorched cloths still hanging from the unburnt end
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    for (const a of [-18, 18]) { B(a - 2, -1, -2, a + 2, 1, 2, LY.stoneD); B(a - 1, 2, -1, a + 1, 32, 1, a > 0 ? LY.char : LY.wood); }
    B(-20, 33, -1, 8, 34, 1, LY.wood); B(9, 33, -1, 12, 33, 1, LY.char);
    B(-16, 18, 0, -9, 32, 0, 0x8a7a62); B(-16, 18, 0, -9, 19, 0, 0x6e6250); B(-6, 24, 0, 2, 32, 0, 0x6a5a48); B(-6, 24, 0, -4, 26, 0, LY.charL);
    B(4, -1, -4, 14, 0, 4, 0x6e6250); B(6, 0, -3, 12, 0, 3, LY.charL);
  } },
  // ---- S
  { id: 'ly_w_jars', name: '粮缸', tags: ['store', 'low'], foot: { w: 2.0, d: 2.0 }, h: 1.0, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    const B = frame(c.w, p.x, p.z, orient(p));
    const jar = (x: number, z: number, h: number, whole: boolean) => {
      B(x - 5, -1, z - 3, x + 5, h, z + 3, LY.clay); B(x - 3, -1, z - 5, x + 3, h, z + 5, LY.clay); B(x - 5, h - 3, z - 3, x + 5, h - 3, z + 3, LY.clayD); B(x - 3, h - 3, z - 5, x + 3, h - 3, z + 5, LY.clayD);
      B(x - 5, -1, z - 3, x + 5, 2, z + 3, LY.charL); B(x - 3, -1, z - 5, x + 3, 2, z + 5, LY.charL);
      if (whole) B(x - 3, h + 1, z - 3, x + 3, h + 1, z + 3, LY.clayL); else B(x - 2, h, z - 2, x + 2, h, z + 2, LY.char);
    };
    jar(-6, -5, 12, true); jar(6, -6, 9, false); B(-4, -1, 5, 8, 2, 10, LY.clayD); B(-2, 3, 6, 4, 3, 9, LY.clay);
  } },
  { id: 'ly_w_door', name: '门板', tags: ['wood', 'low'], foot: { w: 2.0, d: 1.6 }, h: 0.4, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a pair of door leaves flat on the ground, one charred through at its edge, the iron bands across
    const B = frame(c.w, p.x, p.z, orient(p));
    B(-13, -1, -9, -1, 0, 9, LY.wood); B(0, -1, -8, 12, 0, 8, LY.woodD); B(8, -1, -8, 12, 0, 8, LY.char);
    for (const z of [-5, 4]) { B(-13, 1, z, -1, 1, z, LY.iron); B(0, 1, z, 9, 1, z, LY.iron); }
    B(-7, 1, -1, -5, 2, 1, LY.ironL);
  } },
  { id: 'ly_w_corner', name: '坍墙角', tags: ['ruin', 'wall'], foot: { w: 2.2, d: 2.2 }, h: 1.5, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // the corner of a house wall knocked down to waist height, two charred beam ends sticking out of it, its earth slumped in front
    const B = frame(c.w, p.x, p.z, orient(p));
    stub(B, -14, 14, -14, -11, 18); stub(B, -14, -11, -10, 12, 14);
    B(-10, 12, -8, 6, 13, -6, LY.char); B(-8, 10, -10, -6, 11, 8, LY.charL);
    B(-6, -1, -6, 12, 2, 10, LY.earthD); B(-3, 3, -3, 9, 4, 6, LY.earth);
  } },
];
