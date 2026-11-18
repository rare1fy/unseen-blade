// 第五关 · 许都雪 · 覆雪前庭（cx_court）和穿堂曲廊（cx_gallery）（wp/regB）：崔府深宅里的两处院子，雪夜。
//   覆雪前庭：前院，青砖地落满雪（战斗区踩出一片，两翼积雪厚）；两翼是厢房的回廊、老梅、铜灯、石缸；后方是正堂（台基、朱柱、格子门亮灯）
//             或二门（门楼、影壁）。最「规整」的一处：对称、方正、冷。
//   穿堂曲廊：一片结了冰的池子在后方（冰面一块块、薄雪），回廊绕着它；两翼是竹林、假山石、小亭；地上是石板小径。最「幽深」的一处。
// 墙、门、掩体、可破坏物件照 arena.ts（白粉墙黑瓦、影壁 / 假山石 / 石缸）。没有黄巾旗。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, PLAY, hash, field, SX, SZ } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { ground } from '../../scenes/dress';
import type { Group, Landmark, Layout, Locale, Place, Rect } from '../types';
import { CX, frame, faceOf, orient, wp, brickFloor, roofK, column, bronzeLamp, plum, bamboo, gallery, gardenWall, hall, up } from './cx_kit';

const lit = (p: Place) => p.lamp > 0.3;
const lampLight = (c: Ctx, p: Place, at: [number, number, number], k = 1, d = 5) => c.light(at, 0xffb060, 2.0 * Math.max(0.8, p.lamp) * k, d);

// ------------------------------------------------------------------ shared groups (both courts)
const SHARED: Group[] = [
  { id: 'cx_plum', name: '老梅', tags: ['tree'], foot: { w: 2.4, d: 2.4 }, h: 3.4, kinds: ['wing', 'corner', 'back'], size: 'M', weight: 1.5, max: 3, build(c, p) {
    const B = frame(c.w, p.x, p.z, 0); B(-6, -1, -6, 6, 1, 6, CX.stoneD); B(-5, 1, -5, 5, 1, 5, CX.snow); plum(B, 0, 0, 44 + Math.floor(p.rnd(1) * 8), p.seed);
  } },
  { id: 'cx_lamps', name: '铜灯', tags: ['light'], foot: { w: 2.8, d: 1.2 }, h: 1.8, kinds: ['wing', 'back'], size: 'S', weight: 1.4, build(c, p) {
    // two lamps side by side along world x (a pair either side of the way through the wing)
    const B = frame(c.w, p.x, p.z, 0);
    for (const x of [-14, 14]) { const f = bronzeLamp(B, x, 0, 20, true); lampLight(c, p, wp(p.x, p.z, 0, f[0], f[1], f[2]), 0.8, 5); }
  } },
  { id: 'cx_jar', name: '石缸', tags: ['stone'], foot: { w: 1.6, d: 1.6 }, h: 1.0, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    const B = frame(c.w, p.x, p.z, 0); B(-8, 0, -8, 8, 12, 8, CX.stone); B(-8, 12, -8, 8, 12, 8, CX.stoneL); B(-6, 8, -6, 6, 12, 6, CX.ice); B(-4, 12, -4, 4, 12, 4, CX.iceL); B(-8, 6, -8, 8, 6, 8, CX.stoneD);
  } },
];
const FILLER: Group[] = [
  { id: 'cx_step', name: '踏石', tags: ['small'], foot: { w: 1.0, d: 0.8 }, h: 0.2, kinds: ['wing'], size: 'S', max: 6, build(c, p) { const B = frame(c.w, p.x, p.z, 0); B(-6, 0, -4, 6, 1, 4, CX.stoneD); B(-5, 1, -3, 5, 1, 3, CX.snow); } },
  { id: 'cx_stool', name: '石墩', tags: ['small'], foot: { w: 0.8, d: 0.8 }, h: 0.6, kinds: ['wing'], size: 'S', max: 4, build(c, p) { const B = frame(c.w, p.x, p.z, 0); B(-4, 0, -3, 4, 7, 3, CX.stone); B(-3, 0, -4, 3, 7, 4, CX.stone); B(-3, 8, -3, 3, 8, 3, CX.snow); } },
];

// ------------------------------------------------------------------ 覆雪前庭
const COURT_LM: Landmark[] = [
  { id: 'cx_hall', name: '正堂', foot: { w: 14, d: 6.0 }, tags: ['building', 'tall', 'light'], build(c, p) {
    hall(c, p.x, p.z - 0.4, 0, { hw: 82, hd: 26, H: 40, lit: true });
    const B = frame(c.w, p.x, p.z, 0);
    for (const s of [-1, 1]) { const f = bronzeLamp(B, s * 30, 36, 22, true); lampLight(c, p, wp(p.x, p.z, 0, f[0], f[1], f[2]), 1.0, 6); }
    lampLight(c, p, wp(p.x, p.z, 0, 0, 16, 20), 1.2, 7);
  } },
  { id: 'cx_ermen', name: '二门', foot: { w: 13, d: 5.2 }, tags: ['gate', 'tall'], build(c, p) {
    // the inner gate: a gatehouse with red doors shut, a stepped roof, the garden wall running off both sides; a spirit wall in front
    const B = frame(c.w, p.x, p.z, 0);
    B(-26, -1, -14, 26, 3, 10, CX.stoneD); B(-24, 4, -12, 24, 44, 8, CX.plaster); B(-24, 4, -12, 24, 5, 8, CX.plasterD);
    B(-12, 4, 8, 12, 36, 9, CX.red); B(-1, 4, 9, 0, 36, 9, CX.redD); for (const y of [12, 20, 28]) for (let x = -10; x <= 9; x += 4) B(x, y, 10, x, y, 10, CX.bronzeL);
    roofK(B, -32, 32, -20, 16, 45, 3);
    for (const s of [-1, 1]) gardenWall(B, s > 0 ? 26 : -96, s > 0 ? 96 : -26, -2, 34);
    for (const s of [-1, 1]) { const f = bronzeLamp(B, s * 20, 22, 20, true); lampLight(c, p, wp(p.x, p.z, 0, f[0], f[1], f[2]), 0.9, 5); }
  } },
];
const COURT_GROUPS: Group[] = [
  ...SHARED,
  { id: 'cx_wing', name: '厢房', tags: ['building'], foot: { w: 3.6, d: 5.6 }, h: 4.0, kinds: ['wing', 'corner'], size: 'L', weight: 1.6, max: 2, build(c, p) {
    // a side hall along the wing, its front to the court: the terrace, columns, lattice doors (some lit), the roof
    const r = faceOf(p.s || 1); hall(c, p.x, p.z, r, { hw: 36, hd: 18, H: 30, lit: p.rnd(1) < 0.6, tiers: 2 });
  } },
  { id: 'cx_corridor', name: '回廊', tags: ['building', 'light'], foot: { w: 2.2, d: 5.6 }, h: 3.4, kinds: ['wing'], size: 'L', weight: 1.2, build(c, p) {
    const r = faceOf(p.s || 1), B = frame(c.w, p.x, p.z, r);
    const lamps = gallery(B, -38, 38, -12, 12, 30, true);
    for (const l of lamps) lampLight(c, p, wp(p.x, p.z, r, l[0], l[1], l[2]), 0.6, 4);
  } },
];
function courtFloor(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, sd = f.p.seed % 5, paths = f.layout.path;
  const near = (r: Rect, x: number, z: number, m: number) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL;
    // the paved court everywhere (the snow pass whitens what is not walked on); the path a band of long slabs
    const onPath = paths.some(r => near(r, x, z, 0));
    w.set(X, -1, Z, onPath ? (((Z % 8) + 8) % 8 === 7 ? CX.joint : CX.stoneD) : brickFloor(X, Z, sd, hash));
  }
}
function courtFar(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, r = f.p.rnd, B = frame(w, 0, 0, 0);
  // the outer walls of the compound and the roofs of the halls beyond, black against the snowy night; bare trees over the walls
  gardenWall(B, M(SX(-17)), M(SX(17)), M(SZ(-18.6)), 44);
  for (let i = 0; i < 5; i++) { const x = SX(-14 + i * 7), z = SZ(-22) - (i % 2) * 1.4; const R = frame(w, x, z, 0); R(-30, -1, -16, 30, 34, 10, CX.plaster); roofK(R, -36, 36, -22, 16, 35, 3); }
  for (let i = 0; i < 4; i++) { const s = i % 2 ? 1 : -1; plum(frame(w, s * (AREA.x1 + 2.2), SZ(-12 + i * 5), 0), 0, 0, 52, 30 + i); }
  void r;
}
function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  c.ambient({ kind: 'dust', color: 0xc8d0dc, rate: 0.6 });
  void f;
}
export const cxCourt: Locale = {
  id: 'cx_court', name: '覆雪前庭', theme: 'cui',
  layouts: ['axis', 'pair', 'garden'],
  landmarks: COURT_LM, groups: COURT_GROUPS, filler: FILLER,
  seasons: ['winter'], times: ['night'], weathers: ['snow', 'clear'],
  floor: courtFloor, far: courtFar, dress,
};

// ------------------------------------------------------------------ 穿堂曲廊
const GALLERY_LM: Landmark[] = [
  { id: 'cx_pond', name: '冰池', foot: { w: 15, d: 6.6 }, tags: ['water', 'light'], build(c, p) {
    // the frozen pond behind the floor: a stone kerb round it, the ice in big plates (two greys, a dusting of snow on some), a covered
    // gallery along its far side, a little pavilion at one corner, rocks at the other
    const B = frame(c.w, p.x, p.z, 0);
    B(-100, -1, -42, 100, 1, 30, CX.stoneD); B(-98, 1, -40, 98, 1, 28, CX.stone);
    for (let x = -94; x <= 94; x += 12) for (let z = -36; z <= 24; z += 12) { const hh = hash(x, z, p.seed); B(x, 1, z, x + 10, 1, z + 10, hh < 0.4 ? CX.iceL : hh < 0.8 ? CX.ice : CX.iceD); if (hh < 0.25) B(x + 2, 2, z + 2, x + 7, 2, z + 6, CX.snow); }
    const lamps = gallery(up(B, 2), -96, 96, -54, -40, 32, true); for (const l of lamps) lampLight(c, p, wp(p.x, p.z, 0, l[0], l[1] + 2, l[2]), 0.7, 5);
    // the pavilion (亭): four red columns, a square stepped roof
    const s = p.rnd(1) < 0.5 ? -1 : 1, P = (a: number) => s * a;
    for (const [a, b] of [[60, -30], [84, -30], [60, -6], [84, -6]] as const) column(up(B, 2), P(a), b, 30);
    B(Math.min(P(56), P(88)), 34, -34, Math.max(P(56), P(88)), 35, -2, CX.wood); roofK(B, Math.min(P(52), P(92)), Math.max(P(52), P(92)), -38, 2, 36, 3);
    const f = bronzeLamp(up(B, 2), P(72), -18, 16, true); lampLight(c, p, wp(p.x, p.z, 0, f[0], f[1] + 2, f[2]), 1.0, 6);
    for (const [a, b, h] of [[-80, -20, 22], [-70, -12, 14], [-88, -8, 30]] as const) { B(P(-a) - 6, 1, b - 5, P(-a) + 6, h, b + 5, CX.stoneD); B(P(-a) - 6, h, b - 5, P(-a) + 6, h, b + 5, CX.snow); }
  } },
  { id: 'cx_shuixie', name: '水榭', foot: { w: 13, d: 6.0 }, tags: ['building', 'water', 'light'], build(c, p) {
    // a waterside hall built out over the frozen pond on stone piers, its lattice doors lit, a zig-zag bridge to it (square turns)
    const B = frame(c.w, p.x, p.z, 0);
    for (let x = -90; x <= 90; x += 12) for (let z = -40; z <= 24; z += 12) { const hh = hash(x, z, p.seed + 3); B(x, -1, z, x + 10, 0, z + 10, hh < 0.5 ? CX.ice : CX.iceL); }
    for (const x of [-40, -14, 14, 40]) for (const z of [-30, -6]) B(x - 3, -1, z - 3, x + 3, 6, z + 3, CX.stoneD);
    hall(c, p.x, p.z - 1.3, 0, { hw: 46, hd: 16, H: 30, lit: true, tiers: 2 });
    for (const [x0, x1, z0, z1] of [[-6, 6, 8, 18], [-22, 6, 18, 26], [-22, -10, 26, 36]] as const) { B(x0, 1, z0, x1, 2, z1, CX.wood); B(x0, 3, z0, x1, 3, z0, CX.red); B(x0, 3, z1, x1, 3, z1, CX.red); }
    lampLight(c, p, wp(p.x, p.z, 0, 0, 16, -4), 1.2, 7);
  } },
];
const GALLERY_GROUPS: Group[] = [
  ...SHARED,
  { id: 'cx_bamboo', name: '竹丛', tags: ['tree'], foot: { w: 2.6, d: 4.0 }, h: 5.0, kinds: ['wing', 'corner', 'back'], size: 'L', weight: 1.6, max: 3, build(c, p) {
    const r = faceOf(p.s || 1), B = frame(c.w, p.x, p.z, r); B(-18, -1, -12, 18, 0, 12, CX.stoneD); bamboo(B, -16, 16, -6, 64, p.seed); bamboo(B, -14, 14, 4, 56, p.seed + 3);
  } },
  { id: 'cx_rocks', name: '假山', tags: ['stone', 'tall'], foot: { w: 3.0, d: 3.0 }, h: 2.8, kinds: ['wing', 'corner', 'back'], size: 'M', weight: 1.3, build(c, p) {
    const B = frame(c.w, p.x, p.z, orient(p));
    B(-18, 0, -14, 4, 12, 10, CX.stone); B(-18, 12, -14, 4, 12, 10, CX.snow); B(2, 0, -10, 18, 8, 12, CX.stoneD); B(2, 8, -10, 18, 8, 12, CX.snow);
    B(-12, 13, -8, 0, 30, 4, CX.stone); B(-12, 30, -8, 0, 30, 4, CX.snow); B(-9, 31, -5, -3, 38, 1, CX.stoneD); B(-9, 38, -5, -3, 38, 1, CX.snow);
  } },
  { id: 'cx_ting', name: '小亭', tags: ['building', 'light'], foot: { w: 3.4, d: 3.4 }, h: 3.8, kinds: ['corner', 'wing', 'back'], size: 'L', build(c, p) {
    const B = frame(c.w, p.x, p.z, 0);
    B(-22, -1, -22, 22, 2, 22, CX.stoneD); B(-22, 2, -22, 22, 2, 22, CX.stone);
    for (const [a, b] of [[-18, -18], [18, -18], [-18, 18], [18, 18]] as const) column(up(B, 2), a, b, 30);
    B(-22, 35, -22, 22, 36, 22, CX.wood); roofK(B, -28, 28, -28, 28, 37, 3);
    const f = bronzeLamp(up(B, 2), 0, 0, 14, true); lampLight(c, p, wp(p.x, p.z, 0, f[0], f[1] + 2, f[2]), 0.9, 5);
  } },
];
function galleryFloor(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, sd = f.p.seed % 7, paths = f.layout.path;
  const near = (r: Rect, x: number, z: number, m: number) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL; let col: number;
    if (paths.some(r => near(r, x, z, 0))) col = ((X + Z) % 9 === 0) ? CX.joint : CX.stoneD;          // the stone path (a band of slabs)
    else if (near(PLAY, x, z, 0.6)) { const gx = Math.floor(X / 9), gz = Math.floor(Z / 9), lx = ((X % 9) + 9) % 9, lz = ((Z % 9) + 9) % 9; col = lx === 8 || lz === 8 ? CX.joint : hash(gx, gz, 3 + sd) < 0.5 ? CX.stone : CX.stoneD; }
    else { const n = field(Math.floor(X / 3) / 4, Math.floor(Z / 3) / 4, sd + 5); col = n > 0.5 ? 0x3a3e3a : 0x4a4e48; }
    w.set(X, -1, Z, col);
  }
}
function galleryFar(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, B = frame(w, 0, 0, 0);
  gardenWall(B, M(SX(-17)), M(SX(17)), M(SZ(-19)), 40);
  for (let i = 0; i < 6; i++) { const s = i % 2 ? 1 : -1; bamboo(frame(w, s * (AREA.x1 + 2.4), SZ(-14 + i * 4), 0), -12, 12, 0, 70, 40 + i); }
  for (let i = 0; i < 4; i++) { const R = frame(w, SX(-12 + i * 8), SZ(-23), 0); R(-26, -1, -12, 26, 30, 8, CX.plaster); roofK(R, -32, 32, -18, 14, 31, 3); }
  void f;
}
export const cxGallery: Locale = {
  id: 'cx_gallery', name: '穿堂曲廊', theme: 'cui',
  layouts: ['axis', 'offset', 'ridge'],
  landmarks: GALLERY_LM, groups: GALLERY_GROUPS, filler: FILLER,
  seasons: ['winter'], times: ['night'], weathers: ['snow', 'mist'],
  floor: galleryFloor, far: galleryFar, dress,
};
void ground; void column;
