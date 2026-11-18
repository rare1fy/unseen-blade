// 铜驼道的道具组（11-18）：宫墙段、焦柱廊、铜驼、倒伏铜驼、石兽、残碑、断阙、华表、铜钟架、驼首、铜灯。
// 大件都是宫城的东西（宫墙、阙、铜驼、华表、钟），和焦梁坊（民居）、铸钱场（熔铜作坊）拉开。
// 写法照破庙：foot 是世界 x × z（米，未镜像）；翼位的长条组用 faceOf 把正面转向战斗区，所以长边沿世界 z。
import type { Group } from '../types';
import { LY, frame, faceOf, orient, up, wp, fireLight, palaceWall, charPost, rubble, camel, camelDown, stele, bixie, hanRoof, beamDown, cashStrings, lyQue } from './ly_kit';

export const ROAD_GROUPS: Group[] = [
  // ---- L
  { id: 'ly_r_wall', name: '宫墙段', tags: ['wall', 'ruin', 'palace'], foot: { w: 2.0, d: 4.4 }, h: 3.3, kinds: ['wing', 'corner', 'back'], size: 'L', weight: 1.4, build(c, p) {
    // two stretches of the burnt palace wall with a breach between (its brick in a heap spilling toward the floor), a charred column
    // still standing in front of each
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)), sd = p.seed;
    palaceWall(B, -30, -6, -3, 3, 42, { drops: [[-30, -22, 26]], seed: sd });
    palaceWall(B, 2, 29, -3, 3, 34, { drops: [[18, 29, 20]], seed: sd + 3 });
    rubble(B, -2, 6, 8, 5, 2, { beam: true });
    charPost(B, -18, 10, 40); charPost(B, 16, 10, 22, { broken: true });
  } },
  { id: 'ly_r_cols', name: '焦柱廊', tags: ['building', 'ruin', 'palace'], foot: { w: 2.6, d: 4.6 }, h: 4.7, kinds: ['wing', 'corner'], size: 'L', build(c, p) {
    // a stone terrace with three columns of a burnt gallery: two still carry a beam and a strip of roof, the third snapped; a beam
    // down on the terrace, the roof's tiles in a heap in front of the broken one
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)), U = up(B, 4);
    B(-32, -1, -14, 32, 3, 12, LY.stone); B(-32, 3, -14, 32, 3, 12, LY.stoneL); B(-32, -1, 12, 32, 1, 12, LY.stoneD);
    for (let x = -28; x <= 28; x += 8) B(x, 3, -14, x, 3, 12, LY.stoneD);
    charPost(U, -24, -6, 50, { charAt: 18 }); charPost(U, 0, -6, 50, { charAt: 12 }); charPost(U, 24, -6, 26, { broken: true });
    U(-26, 51, -7, 2, 53, -5, LY.char); U(-26, 52, -5, 2, 52, -5, LY.charL);
    hanRoof(U, -34, 6, -16, 4, 54, [[0, 2], [4, 2]], 1, { cut1: true, ridge: false });
    beamDown(U, -20, 4, 6); rubble(U, 20, 4, 9, 6, 2);
  } },
  // ---- M
  { id: 'ly_r_camel', name: '铜驼', tags: ['bronze', 'camel', 'tall'], foot: { w: 3.0, d: 1.4 }, h: 3.2, kinds: ['wing', 'corner'], size: 'M', max: 2, weight: 1.5, build(c, p) {
    // a bronze camel on its plinth, as they stood along 铜驼街; turned side-on to the camera (its profile is what reads from above),
    // its head toward the battle floor; sometimes the looters have hacked its head off
    const B = frame(c.w, p.x, p.z, p.s > 0 ? 3 : 1); camel(B, 0, 0, { broken: p.rnd(1) < 0.4 });
    B(-12, -1, -24, 12, -1, 22, LY.ashD);
  } },
  { id: 'ly_r_fallen', name: '倒伏铜驼', tags: ['bronze', 'camel', 'low'], foot: { w: 3.2, d: 2.2 }, h: 0.8, kinds: ['wing', 'back'], size: 'M', build(c, p) {
    const B = frame(c.w, p.x, p.z, 0); camelDown(B, -4, -2, { cut: p.rnd(1) < 0.6 });
    if (p.rnd(2) < 0.6) cashStrings(B, -12, 2, 14, 1);
  } },
  { id: 'ly_r_stele', name: '残碑', tags: ['stone', 'stele'], foot: { w: 1.8, d: 3.2 }, h: 2.8, kinds: ['wing', 'back'], size: 'M', build(c, p) {
    // a whole stele and a broken one side by side, the soot of the fire up their faces
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    stele(B, -14, -2, 'whole', { h: 32 }); stele(B, 14, -2, 'broken');
    // the soot of the fire up the slabs' lower faces (on the face itself, nothing standing proud)
    B(-20, 5, 0, -8, 7, 0, LY.charL); B(8, 5, 0, 20, 7, 0, LY.charL);
    rubble(B, 0, -12, 6, 3, 1);
  } },
  { id: 'ly_r_gatewall', name: '宫门残段', tags: ['wall', 'gate', 'palace'], foot: { w: 4.4, d: 2.2 }, h: 3.9, kinds: ['back', 'corner'], size: 'L', build(c, p) {
    // a stretch of palace wall facing the camera with a side gate in it: charred posts and lintel, half its little roof gone, one
    // door leaf burnt away and the other lying flat in front
    const B = frame(c.w, p.x, p.z, 0), sd = p.seed;
    palaceWall(B, -30, -11, -3, 3, 40, { seed: sd }); palaceWall(B, 11, 30, -3, 3, 40, { drops: [[22, 30, 26]], seed: sd + 5 });
    charPost(B, -9, 0, 40, { charAt: 10 }); charPost(B, 9, 0, 40, { charAt: 10 });
    B(-13, 41, -2, 13, 43, 2, LY.char); B(-13, 42, 2, 13, 42, 2, LY.charL);
    hanRoof(B, -17, 17, -7, 7, 44, [[0, 2], [3, 2]], 1, { cut0: true });
    B(-6, 0, -1, 6, 0, 1, LY.charD);
    B(-6, -1, 6, 6, 0, 18, LY.wood); B(-6, 1, 9, 6, 1, 10, LY.woodD); B(-6, 1, 15, 6, 1, 16, LY.woodD); B(-6, -1, 6, 6, 0, 8, LY.char);
  } },
  { id: 'ly_r_que', name: '断阙', tags: ['tall', 'que', 'palace'], foot: { w: 2.8, d: 2.0 }, h: 4.8, kinds: ['back', 'corner'], size: 'M', max: 2, weight: 2, build(c, p) {
    const B = frame(c.w, p.x, p.z, 0), m = (p.x >= 0 ? 1 : -1) as 1 | -1;
    lyQueAt(B, m, p.rnd(1) < 0.5);
  } },
  { id: 'ly_r_huabiao', name: '华表', tags: ['stone', 'tall'], foot: { w: 1.4, d: 3.4 }, h: 4.4, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    // a stone 华表: a square plinth, a plus-section shaft, a cross board near the top, a dew plate with a crouching beast; its
    // fellow lies broken in two beside it
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)), x = -12;
    B(x - 7, -1, -7, x + 7, 3, 7, LY.stoneD); B(x - 6, 4, -6, x + 6, 4, 6, LY.stone);
    B(x - 3, 5, -2, x + 3, 50, 2, LY.stone); B(x - 2, 5, -3, x + 2, 50, 3, LY.stone); B(x - 3, 5, -2, x + 3, 12, 2, LY.charL); B(x - 2, 5, -3, x + 2, 12, 3, LY.charL);
    B(x - 9, 42, -1, x + 9, 44, 1, LY.stoneL); B(x - 9, 42, -1, x - 9, 44, 1, LY.stoneD); B(x + 9, 42, -1, x + 9, 44, 1, LY.stoneD);
    B(x - 5, 51, -5, x + 5, 52, 5, LY.stoneL); B(x - 3, 53, -3, x + 3, 56, 2, LY.stone); B(x - 2, 57, -2, x + 2, 59, 3, LY.stone); B(x - 1, 58, 3, x + 1, 59, 4, LY.stoneD);
    // the fallen one: the shaft lying along x (charred end), the plinth on its side beyond
    B(-2, -1, 2, 18, 4, 6, LY.stone); B(-2, 4, 3, 18, 4, 5, LY.stoneL); B(-2, -1, 2, 1, 4, 6, LY.char);
    B(20, -1, -3, 27, 4, 5, LY.stoneD); B(21, 5, -2, 26, 5, 4, LY.stone);
  } },
  { id: 'ly_r_bell', name: '铜钟架', tags: ['bronze', 'bell'], foot: { w: 1.6, d: 3.2 }, h: 3.4, kinds: ['wing'], size: 'M', build(c, p) {
    // a 钟虡: two charred posts on stone feet, a beam, one bronze bell still hanging on its hook; the other bell down on the ground,
    // its lip toward the floor
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    for (const a of [-20, 18]) { B(a - 2, -1, -3, a + 4, 2, 3, LY.stoneD); B(a, 3, -1, a + 2, 42, 1, LY.char); B(a, 3, -1, a + 2, 8, 1, LY.redD); }
    B(-23, 43, -2, 23, 46, 2, LY.charL); B(-23, 47, -1, 23, 47, 1, LY.char);
    B(-1, 37, 0, 1, 42, 0, LY.iron);
    B(-6, 20, -4, 6, 36, 4, LY.bronze); B(-4, 20, -6, 4, 36, 6, LY.bronze); B(-5, 34, -3, 5, 36, 3, LY.bronzeL);
    B(-6, 20, -4, 6, 21, 4, LY.bronzeD); B(-4, 20, -6, 4, 21, 6, LY.bronzeD); for (const y of [25, 30]) { B(-6, y, -4, 6, y, 4, LY.bronzeD); B(-4, y, -6, 4, y, 6, LY.bronzeD); }
    // the fallen bell, lying on its side along x
    B(-6, -1, 4, 8, 7, 11, LY.bronze); B(-6, 8, 5, 8, 8, 10, LY.bronzeL); B(9, -1, 3, 10, 8, 12, LY.bronzeD); B(-7, 1, 6, -7, 5, 9, LY.iron);
  } },
  // ---- S
  { id: 'ly_r_beast', name: '石兽', tags: ['stone', 'beast'], foot: { w: 1.6, d: 2.0 }, h: 1.6, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)); bixie(B, 0, 0, { headless: p.rnd(1) < 0.5 });
    B(-8, 4, -11, 8, 4, -6, LY.charL);
  } },
  { id: 'ly_r_head', name: '驼首', tags: ['bronze', 'low', 'loot'], foot: { w: 1.8, d: 1.6 }, h: 0.7, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // what the looters dropped: a bronze camel head hacked off (the cut bright copper), a split plinth block, strings of cash
    const B = frame(c.w, p.x, p.z, orient(p));
    B(-10, -1, -4, -1, 5, 3, LY.bronze); B(-10, 6, -3, -2, 6, 2, LY.bronzeL); B(-1, -1, -4, -1, 5, 3, LY.copperL); B(-14, -1, -2, -11, 3, 1, LY.bronze);
    B(-9, 6, -4, -8, 8, -3, LY.bronzeD); B(-9, 6, 2, -8, 8, 3, LY.bronzeD);
    B(3, -1, -9, 12, 3, -2, LY.stoneD); B(4, 4, -8, 11, 4, -3, LY.stone); B(8, 0, -2, 13, 2, 4, LY.stoneD);
    cashStrings(B, -8, 6, 7, 2);
  } },
  { id: 'ly_r_lamp', name: '铜灯', tags: ['bronze', 'light', 'fire'], foot: { w: 1.2, d: 1.2 }, h: 2.1, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
    // a tall bronze lamp on a stone foot (a palace 灯台), still burning; a basin knocked over beside it
    const B = frame(c.w, p.x, p.z, 0), lit = p.time !== 'day' || p.rnd(1) < 0.5;
    B(-6, -1, -6, 6, 2, 6, LY.stoneD); B(-5, 3, -5, 5, 3, 5, LY.stone);
    B(-2, 4, -2, 2, 6, 2, LY.bronzeD); B(-1, 7, -1, 1, 22, 1, LY.bronze); B(-3, 14, -1, 3, 14, 1, LY.bronzeL);
    B(-4, 23, -4, 4, 24, 4, LY.bronze); B(-4, 25, -4, 4, 25, 4, LY.bronzeL); B(-3, 25, -3, 3, 25, 3, lit ? LY.ember : LY.ash, lit ? 1 : 0);
    if (lit) { B(-1, 26, -1, 1, 27, 1, LY.flame, 1); B(0, 28, 0, 0, 28, 0, LY.flameL, 1); fireLight(c, p, wp(p, 0, 0, 27, 0), 0.9, 5); }
    // the lamp's fellow knocked over: its stem along the ground, the cup by the foot
    B(5, -1, 4, 14, 0, 5, LY.bronze); B(14, -1, 2, 17, 1, 7, LY.bronze); B(14, 2, 3, 17, 2, 6, LY.bronzeL);
  } },
];

function lyQueAt(B: ReturnType<typeof frame>, m: 1 | -1, broken: boolean) { lyQue(B, 0, m, { broken }); }
