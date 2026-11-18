// 第五关 · 许都雪 · 藏刀阁（cx_vault，wp/regB）：头目间，终局。崔府最深处的内院，正中一座两层的阁：一楼敞着，里面一排排刀架，挂的是
// 寒山坞文家那三十柄百辟刀里剩下的（亮钢、刀脊一道淡波纹、刀环下系红绳；有几个空位）；阁前是一片铺得极整齐的方砖地（战斗区），
// 四角一圈高铜灯（第三阶段崔玄吹灭灯，画面暗下去，r45_hook dark）；两翼是双层回廊，后方是阁，阁顶两层黑瓦。雪夜。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, PLAY, hash, SX, SZ } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import type { Group, Landmark, Layout, Locale, Place, Rect } from '../types';
import { CX, frame, faceOf, wp, roofK, column, bronzeLamp, plum, gallery, gardenWall, bladeRack, up } from './cx_kit';

const lampLight = (c: Ctx, p: Place, at: [number, number, number], k = 1, d = 5) => c.light(at, 0xffb060, 2.0 * Math.max(0.8, p.lamp) * k, d);

const LANDMARKS: Landmark[] = [
  { id: 'cx_dao', name: '藏刀阁', foot: { w: 15.4, d: 7.0 }, tags: ['building', 'tall', 'light'], build(c, p) {
    const B = frame(c.w, p.x, p.z, 0);
    // the terrace in three stone steps, the lower storey open at the front: six red columns, the racks of blades inside on dark walls
    for (let i = 0; i < 3; i++) { B(-100 + i * 4, -1 + i * 3, -46 + i * 2, 100 - i * 4, 1 + i * 3, 34 - i * 4, i % 2 ? CX.stone : CX.stoneD); B(-100 + i * 4, 1 + i * 3, 34 - i * 4, 100 - i * 4, 1 + i * 3, 34 - i * 4, CX.stoneL); }
    const U = up(B, 8);   // (the terrace's top is at 7: the storey stands on it)
    U(-90, 0, -40, 90, 40, -34, CX.ink); U(-90, 0, -34, -86, 40, 20, CX.ink); U(86, 0, -34, 90, 40, 20, CX.ink);
    for (const x of [-82, -50, -18, 18, 50, 82]) column(U, x, 20, 40);
    // the racks: three tiers along the back wall, blades hanging; a fourth rack each side wall
    for (const [y, n] of [[2, 22], [16, 20]] as const) bladeRack(U, -78, 78, -33, y, n, y + p.seed);
    for (const s of [-1, 1]) { const R = frame(c.w, p.x + s * (84 * CELL), p.z, s > 0 ? 3 : 1); bladeRack(up(R, 8), s > 0 ? -40 : -24, s > 0 ? 24 : 40, -1, 0, 8, 7 + s); }
    // the first-floor beam and balcony, the upper storey set back with its own lattice front and roof; the main roof in two tiers
    U(-94, 41, -42, 94, 44, 24, CX.wood); U(-94, 45, 22, 94, 48, 24, CX.red); for (let x = -90; x <= 90; x += 6) U(x, 45, 24, x + 1, 50, 24, CX.redD);
    U(-70, 45, -36, 70, 74, 14, CX.plaster); for (let x = -64; x < 64; x += 12) { U(x, 50, 14, x + 9, 70, 14, 0xd89a50, 1); for (let u = x; u <= x + 9; u += 3) U(u, 50, 15, u, 70, 15, CX.woodD); }
    roofK(U, -82, 82, -46, 26, 75, 3);
    roofK(U, -104, 104, -52, 36, 37, 2);
    // the lamps inside lighting the blades from below, a big bronze lamp at each corner of the terrace
    lampLight(c, p, wp(p.x, p.z, 0, -40, 22, -20), 1.0, 6); lampLight(c, p, wp(p.x, p.z, 0, 40, 22, -20), 1.0, 6); lampLight(c, p, wp(p.x, p.z, 0, 0, 70, 10), 0.8, 7);
    for (const s of [-1, 1]) { const f = bronzeLamp(up(B, 2), s * 96, 26, 28, true); lampLight(c, p, wp(p.x, p.z, 0, f[0], f[1] + 2, f[2]), 1.1, 6); }
  } },
];
const GROUPS: Group[] = [
  { id: 'cx_vgallery', name: '双层回廊', tags: ['building', 'tall', 'light'], foot: { w: 2.6, d: 5.6 }, h: 5.2, kinds: ['wing', 'corner'], size: 'L', weight: 1.8, max: 2, build(c, p) {
    const r = faceOf(p.s || 1), B = frame(c.w, p.x, p.z, r);
    const lamps = gallery(B, -38, 38, -14, 14, 30, true); gallery(up(B, 36), -38, 38, -12, 12, 26, true);
    for (const l of lamps) lampLight(c, p, wp(p.x, p.z, r, l[0], l[1], l[2]), 0.6, 4);
  } },
  { id: 'cx_tall_lamps', name: '高铜灯', tags: ['light'], foot: { w: 2.6, d: 1.2 }, h: 2.8, kinds: ['wing', 'back'], size: 'S', weight: 1.6, build(c, p) {
    const B = frame(c.w, p.x, p.z, 0);
    for (const x of [-14, 14]) { const f = bronzeLamp(B, x, 0, 32, true); lampLight(c, p, wp(p.x, p.z, 0, f[0], f[1], f[2]), 0.9, 6); }
  } },
  { id: 'cx_vplum', name: '老梅', tags: ['tree'], foot: { w: 2.4, d: 2.4 }, h: 3.4, kinds: ['corner', 'back'], size: 'M', build(c, p) {
    const B = frame(c.w, p.x, p.z, 0); B(-6, -1, -6, 6, 1, 6, CX.stoneD); plum(B, 0, 0, 50, p.seed + 5);
  } },
  { id: 'cx_weapons', name: '兵器架', tags: ['weapon'], foot: { w: 1.4, d: 3.0 }, h: 2.4, kinds: ['wing'], size: 'S', build(c, p) {
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)); bladeRack(B, -18, 18, 0, 0, 7, p.seed);
  } },
];
const FILLER: Group[] = [
  { id: 'cx_vstep', name: '踏石', tags: ['small'], foot: { w: 1.0, d: 0.8 }, h: 0.2, kinds: ['wing'], size: 'S', max: 6, build(c, p) { const B = frame(c.w, p.x, p.z, 0); B(-6, 0, -4, 6, 1, 4, CX.stoneD); } },
];

function floor(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, sd = f.p.seed % 5;
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL;
    // the court: big square slabs 10 cells, laid on the diagonal-free grid, the joint dark; a border of a darker band round the floor
    const inC = x > PLAY.x0 - 1.4 && x < PLAY.x1 + 1.4 && z > PLAY.z0 - 2 && z < PLAY.z1 + 1.6;
    const band = inC && !(x > PLAY.x0 - 0.7 && x < PLAY.x1 + 0.7 && z > PLAY.z0 - 1.3 && z < PLAY.z1 + 0.9);
    const lx = ((X % 10) + 10) % 10, lz = ((Z % 10) + 10) % 10;
    const col = band ? (((X + Z) & 1) ? CX.inkL : CX.ink) : inC ? (lx === 9 || lz === 9 ? CX.joint : hash(Math.floor(X / 10), Math.floor(Z / 10), 7 + sd) < 0.5 ? CX.brick : CX.brickL) : CX.brickD;
    w.set(X, -1, Z, col);
  }
}
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, B = frame(w, 0, 0, 0);
  gardenWall(B, M(SX(-17)), M(SX(17)), M(SZ(-19.4)), 48);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) plum(frame(w, s * (AREA.x1 + 2.2), SZ(-12 + i * 6), 0), 0, 0, 54, 60 + i);
  void f;
}
function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) { c.ambient({ kind: 'dust', color: 0xc8d0dc, rate: 0.5 }); void f; }

export const cxVault: Locale = {
  id: 'cx_vault', name: '藏刀阁', theme: 'cui',
  layouts: ['axis', 'garden'],
  landmarks: LANDMARKS, groups: GROUPS, filler: FILLER,
  seasons: ['winter'], times: ['night'], weathers: ['snow'],
  floor, far, dress,
};
