// 铸钱场的道具组（11-18）：飞熊军在宫前空场上熔铜铸小钱。钱范架、铜锭垛、炉渣堆、炭堆、小熔炉、铁水槽、坩埚、半熔铜人、
// 钱箱、风箱。大件全是作坊的东西（炉、范、铜、炭），和铜驼道（宫城）、焦梁坊（民居）拉开；火和铁水是这里最亮的颜色。
// 写法照破庙：foot 是世界 x × z（米，未镜像）；翼位的长条组用 faceOf 把正面转向战斗区，所以长边沿世界 z。
import type { Group } from '../types';
import { LY, frame, faceOf, orient, wp, fireLight, smoke, qianfan, coinHeap, cashStrings, ingots, copperMan, heap, frameBay } from './ly_kit';

/** a small brick furnace (化铜炉) facing local +z: a square brick body stepping in twice, a glowing mouth low on the front, a flue on
 *  top; lit = the mouth glows. Returns the mouth point (local). Extent ±10 × ±10, top 34. */
export function smallFurnace(B: ReturnType<typeof frame>, x: number, z: number, lit: boolean) {
  B(x - 10, -1, z - 10, x + 10, 14, z + 10, LY.brick); B(x - 10, -1, z - 10, x + 10, 1, z + 10, LY.brickD);
  for (const y of [5, 10]) { B(x - 10, y, z + 10, x + 10, y, z + 10, LY.brickD); B(x + 10, y, z - 10, x + 10, y, z + 10, LY.brickD); B(x - 10, y, z - 10, x - 10, y, z + 10, LY.brickD); }
  B(x - 8, 15, z - 8, x + 8, 22, z + 8, LY.brick); B(x - 8, 20, z - 8, x + 8, 22, z + 8, LY.charL);
  B(x - 4, 23, z - 4, x + 4, 34, z + 4, LY.brickD); B(x - 4, 32, z - 4, x + 4, 34, z + 4, LY.char); B(x - 2, 33, z - 2, x + 2, 34, z + 2, LY.charD);
  B(x - 4, 2, z + 10, x + 4, 8, z + 10, lit ? LY.molten : LY.charD, lit ? 1 : 0); if (lit) B(x - 2, 3, z + 10, x + 2, 6, z + 10, LY.moltenL, 1);
  B(x - 5, 9, z + 10, x + 5, 9, z + 11, LY.iron);
  return [x, 5, z + 12] as [number, number, number];
}

export const MINT_GROUPS: Group[] = [
  // ---- L
  { id: 'ly_m_racks', name: '钱范架', tags: ['mint', 'wood'], foot: { w: 2.6, d: 4.4 }, h: 1.2, kinds: ['wing', 'back', 'corner'], size: 'L', weight: 1.5, build(c, p) {
    // two long low trestles of drying coin moulds (clay plates in rows), more moulds stacked on the ground at the end, cast strings
    // of cash beside them
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    for (const z of [-9, 8]) {
      for (const a of [-24, 0, 24]) { B(a - 1, -1, z - 6, a + 1, 9, z - 5, LY.wood); B(a - 1, -1, z + 5, a + 1, 9, z + 6, LY.wood); }
      B(-25, 10, z - 7, 25, 11, z + 7, LY.woodD);
      for (let a = -18; a <= 18; a += 12) qianfan(B, a, z, 12, { bronze: a === 6 && z > 0 });
    }
    for (let i = 0; i < 3; i++) qianfan(B, 31, -6, -1 + i * 2);
    cashStrings(B, 28, 36, 6, 2);
  } },
  { id: 'ly_m_shed', name: '熔铜棚', tags: ['mint', 'fire', 'light', 'building'], foot: { w: 3.6, d: 3.6 }, h: 3.8, kinds: ['wing', 'back', 'corner'], size: 'L', build(c, p) {
    // a shed of charred posts with a plank roof over two small furnaces, a crucible on the ground in front, bellows by one
    const r = orient(p), B = frame(c.w, p.x, p.z, r), lit = p.time !== 'day' || p.rnd(1) < 0.7;
    frameBay(B, [[-22, -20, 46], [22, -20, 46], [-22, 16, 40], [22, 16, 40]], [[-22, -20, 22, -20, 45], [-22, 16, 22, 16, 39], [-22, -20, -22, 16, 39], [22, -20, 22, 16, 39]]);
    B(-26, 41, -24, 26, 42, 20, LY.wood); for (let x = -24; x <= 24; x += 6) B(x, 43, -24, x + 1, 43, 20, LY.woodD); B(10, 41, -24, 26, 43, 0, null);
    const a = smallFurnace(B, -11, -8, lit); smallFurnace(B, 11, -8, lit && p.rnd(2) < 0.7);
    B(-6, -1, 10, 6, 5, 18, LY.iron); B(-5, 3, 11, 5, 5, 17, lit ? LY.molten : LY.slag, lit ? 1 : 0); B(-7, 6, 13, 7, 6, 15, LY.ironL);
    B(16, -1, 8, 24, 6, 16, LY.wood); B(16, 7, 9, 24, 7, 15, LY.woodD); B(13, 2, 11, 15, 4, 13, LY.iron);
    if (lit) { const q = wp(p, r, a[0], a[1], a[2]); fireLight(c, p, q, 1.1, 6); smoke(c, wp(p, r, -11, 36, -8), { rate: 1.8, col: 0x4e4a46 }); }
  } },
  { id: 'ly_m_man', name: '半熔铜人', tags: ['bronze', 'mint', 'low', 'light'], foot: { w: 2.2, d: 5.6 }, h: 0.9, kinds: ['wing'], size: 'L', build(c, p) {
    // a bronze giant of the palace (one of the 金人 the looters melt down) on its back along the floor's edge, its head run into a
    // pool of copper; 5.4 m long, so it lies in a long wing slot with its length along z
    const r = faceOf(p.s || 1), B = frame(c.w, p.x, p.z, r), lit = p.time !== 'day' || p.rnd(1) < 0.6, m = copperMan(B, 0, 0, lit);
    if (lit) fireLight(c, p, wp(p, r, m[0], m[1] + 2, m[2]), 0.8, 4);
  } },
  // ---- M
  { id: 'ly_m_ingots', name: '铜锭垛', tags: ['mint', 'copper'], foot: { w: 2.4, d: 3.0 }, h: 1.0, kinds: ['wing', 'back'], size: 'M', build(c, p) {
    // three stacks of copper ingots on pallets, a heap of cast cash, a scale beam on a post
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    for (const [x, z, n] of [[-12, -6, 4], [2, -6, 3], [-6, 9, 2]] as const) { B(x - 7, -1, z - 7, x + 7, 0, z + 7, LY.woodD); ingots(B, x, z, n); }
    coinHeap(B, 14, 8, 7, 3);
    B(15, -1, -10, 17, 12, -8, LY.wood); B(9, 13, -10, 23, 13, -8, LY.iron);
  } },
  { id: 'ly_m_slag', name: '炉渣堆', tags: ['mint', 'slag'], foot: { w: 2.6, d: 2.6 }, h: 0.8, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    const B = frame(c.w, p.x, p.z, orient(p));
    heap(B, -3, 0, 15, 12, 3, LY.slag, 0x4e4644); B(-6, 9, -2, 0, 9, 2, LY.copperD);
    B(11, -1, 4, 17, 3, 12, LY.iron); B(12, 4, 5, 16, 4, 11, LY.slag);
  } },
  { id: 'ly_m_coal', name: '炭堆', tags: ['mint', 'fuel'], foot: { w: 2.4, d: 2.4 }, h: 1.1, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    // charcoal heaped on the ground with baskets of it, a shovel stuck in
    const B = frame(c.w, p.x, p.z, orient(p));
    heap(B, -2, -2, 13, 11, 4, LY.charD, LY.char);
    for (const [x, z] of [[11, 10], [-12, 11]] as const) { B(x - 4, -1, z - 4, x + 4, 5, z + 4, 0x7a6448); B(x - 4, 2, z - 4, x + 4, 2, z + 4, 0x5e4c36); B(x - 3, 5, z - 3, x + 3, 6, z + 3, LY.charD); }
    B(3, 6, 0, 3, 15, 0, LY.wood); B(2, 5, -1, 4, 6, 1, LY.iron);
  } },
  { id: 'ly_m_trough', name: '铁水槽', tags: ['mint', 'molten', 'light', 'low'], foot: { w: 1.4, d: 3.8 }, h: 0.6, kinds: ['wing'], size: 'M', build(c, p) {
    // a stone channel the molten copper runs along into a row of ingot moulds; the copper still glows in it at night
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)), lit = p.time !== 'day' || p.rnd(1) < 0.5;
    B(-26, -1, -4, 26, 4, 4, LY.stoneD); B(-26, 5, -4, 26, 5, 4, LY.stone); B(-24, 3, -2, 24, 5, 2, null);
    B(-24, 3, -2, 24, 3, 2, lit ? LY.molten : LY.copperD, lit ? 1 : 0); if (lit) B(-24, 4, -1, 6, 4, 1, LY.moltenL, 1);
    for (let a = -22; a <= 22; a += 9) { B(a - 3, -1, 6, a + 3, 2, 10, LY.clay); B(a - 2, 2, 7, a + 2, 2, 9, a < 0 && lit ? LY.molten : LY.copper, a < 0 && lit ? 1 : 0); }
    if (lit) fireLight(c, p, wp(p, faceOf(p.s || 1), -8, 5, 0), 0.8, 4.5);
  } },
  { id: 'ly_m_furnace', name: '化铜炉', tags: ['mint', 'fire', 'light'], foot: { w: 2.2, d: 2.2 }, h: 2.5, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, build(c, p) {
    const r = orient(p), B = frame(c.w, p.x, p.z, r), lit = p.time !== 'day' || p.rnd(1) < 0.7, a = smallFurnace(B, 0, -2, lit);
    B(-14, -1, 6, -8, 3, 14, LY.charD); B(9, -1, 8, 14, 4, 13, LY.slag);
    if (lit) { fireLight(c, p, wp(p, r, a[0], a[1], a[2]), 1, 5); smoke(c, wp(p, r, 0, 35, -2), { rate: 1.6, col: 0x4e4a46 }); }
  } },
  // ---- S
  { id: 'ly_m_chest', name: '钱箱', tags: ['mint', 'low', 'loot'], foot: { w: 2.0, d: 1.8 }, h: 0.9, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // two iron-bound cash chests, one burst open and spilling cast coins
    const B = frame(c.w, p.x, p.z, orient(p));
    B(-12, -1, -6, -1, 8, 4, LY.woodD); for (const a of [-10, -3]) B(a, -1, 4, a, 8, 4, LY.iron); B(-12, 9, -6, -1, 9, 4, LY.wood);
    B(2, -1, -5, 12, 6, 4, LY.woodD); B(2, 7, -5, 12, 7, -4, LY.wood); B(3, 4, -3, 11, 6, 3, LY.coinL);
    coinHeap(B, 7, 9, 5, 2); cashStrings(B, -10, -2, 8, 1);
  } },
  { id: 'ly_m_crucible', name: '坩埚', tags: ['mint', 'low'], foot: { w: 1.8, d: 1.8 }, h: 0.8, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // clay crucibles on the ground, one cracked, tongs across them
    const B = frame(c.w, p.x, p.z, orient(p));
    for (const [x, z, h] of [[-6, -4, 9], [5, -5, 7], [-1, 7, 6]] as const) { B(x - 4, -1, z - 3, x + 4, h, z + 3, LY.clay); B(x - 3, -1, z - 4, x + 3, h, z + 4, LY.clay); B(x - 2, h, z - 2, x + 2, h, z + 2, LY.copperD); B(x - 4, -1, z - 3, x + 4, 1, z + 3, LY.charL); }
    B(-10, 10, -4, 8, 10, -4, LY.iron);
  } },
  { id: 'ly_m_bellows', name: '风箱', tags: ['mint', 'wood', 'low'], foot: { w: 2.0, d: 1.4 }, h: 0.9, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a box bellows of planks with its push handle, a clay pipe toward where its furnace stood
    const B = frame(c.w, p.x, p.z, orient(p));
    B(-10, -1, -5, 6, 9, 5, LY.wood); for (const y of [2, 6]) B(-10, y, 5, 6, y, 5, LY.woodD); B(-10, 10, -5, 6, 10, 5, LY.woodD);
    B(-14, 5, -1, -11, 6, 1, LY.wood); B(-15, 3, -1, -15, 8, 1, LY.woodD);
    B(7, 2, -1, 13, 3, 1, LY.clay); B(12, -1, -2, 14, 3, 2, LY.clayD);
  } },
];
