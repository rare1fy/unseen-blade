// 黄巾残村 · 破庙（temple 代理）：一座汉代祠庙，被太平道占作法坛；也是本地域头目「黄巾渠帅」的战场。
// 中庭是方石板铺的庭院（战斗区，碎了几块露出夯土），甬道直通后方。地标三选一：双阙、残殿（半边瓦顶塌了，殿里设坛）、大鼎祭坛。
// 主色：风化灰石、暗朱漆、焦木、夯土黄褐、汉瓦灰；黄巾黄是唯一的强调色。写法照 ninja/temple.ts 与 village.ts。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, field, hash, inPlay, SX, SZ } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { pine, deadTree } from '../../scenes/flora';
import { addCardKind } from '../../scenes/cards';
import { ground } from '../../scenes/dress';
import { locM } from '../../scenes/k_village';
import type { Landmark, Layout, Locale, Place, Rect, SeasonId } from '../types';
import { HC, frame, up, column, bracket, hanRoof, beamDown, columnDown, tileHeap, bixie, banner, bannerPole, fuRope, fireBowl, que, jiazi, ding, shell, smoke } from './hj_temple_kit';
import { GROUPS, FILLER } from './hj_temple_props';

const lampLight = (c: Ctx, p: Place, at: [number, number, number], k = 1, d = 5) => { if (p.lamp > 0.3) c.light(at, 0xff9a48, 2.4 * p.lamp * k, d); };
const wp = (p: Place, lx: number, y: number, lz: number) => locM(M(p.x), M(p.z), 0, lx, y, lz);
/** withered grass by season: [body, dark, light] */
const DRY_BY: Record<SeasonId, [number, number, number]> = {
  spring: [0x6e7a48, 0x5e6a3e, 0x7e8a54], summer: [0x5e7040, 0x4e6036, 0x6e8048], autumn: [0x8a7c4c, 0x7a6c42, 0x9a8c5a], winter: [0x8a8478, 0x7a7468, 0x9a9488],
};

// ------------------------------------------------------------------ landmarks (back centre)
const LANDMARKS: Landmark[] = [
  { id: 'hj_shuangque', name: '双阙', foot: { w: 10.6, d: 5.0 }, tags: ['gate', 'tall'], build(c, p) {
    // two Han gate towers either side of the way in, a stub of rammed-earth wall running out from each; the left cap is broken
    const B = frame(c.w, p.x, p.z, 0), lit = p.time !== 'day';
    que(B, -37, -1, { broken: true }); que(B, 37, 1, {});
    banner(B, -43, -31, 8, 44, 30, { fu: true });
    jiazi(B, 37, 44, 7, 2, true);
    for (const m of [-1, 1]) {
      const X = (a: number) => m * a;
      B(Math.min(X(63), X(75)), -1, -4, Math.max(X(63), X(75)), 28, 4, HC.earth);
      for (let y = 5; y < 28; y += 6) B(Math.min(X(63), X(75)), y, 4, Math.max(X(63), X(75)), y, 4, HC.earthD);
      const f = fireBowl(B, m * 26, 18, lit, 6);
      if (lit) lampLight(c, p, wp(p, f[0], f[1] + 4, f[2]), 1.1, 6);
    }
    tileHeap(B, 56, 14, 7, 4, 2);
  } },
  { id: 'hj_canhall', name: '残殿', foot: { w: 13.4, d: 6.4 }, tags: ['building', 'altar'], build(c, p) {
    // a rammed-earth platform with a stone face, the front row of red columns (three still carry a beam and half a roof, the rest
    // snapped), the back wall with a dark doorway and long yellow banners, an altar with a burning bronze vessel in the open middle bay
    const B = frame(c.w, p.x, p.z, 0), U = up(B, 8), lit = p.time !== 'day' || p.rnd(1) < 0.6;
    shell(B, -90, -1, -40, 90, 7, 28, HC.stone, HC.slab);
    for (let x = -88; x <= 88; x += 8) B(x, 7, -40, x, 7, 28, HC.joint);
    B(-90, 7, 25, 90, 7, 28, HC.stoneL); B(-90, -1, 28, 90, 0, 28, HC.stoneD);
    for (let x = -84; x <= 84; x += 12) B(x, 1, 28, x, 6, 28, HC.joint);
    B(-16, -1, 29, 16, 2, 37, HC.stone); B(-16, 3, 29, 16, 5, 33, HC.stone);
    // back and side walls (rammed earth, layer lines)
    B(-88, 8, -38, -21, 72, -34, HC.earth); B(-20, 8, -38, 20, 60, -34, HC.earth); B(21, 8, -38, 50, 38, -34, HC.earth); B(51, 8, -38, 88, 24, -34, HC.earth);
    for (let y = 13; y < 72; y += 6) B(-88, y, -34, 88, y, -34, HC.earthD);
    B(-88, 8, -33, -84, 72, 10, HC.earth); B(84, 8, -33, 88, 18, -10, HC.earth);
    B(-14, 8, -37, 14, 40, -34, HC.char); B(-16, 8, -33, -15, 42, -33, HC.woodD); B(15, 8, -33, 16, 42, -33, HC.woodD); B(-16, 41, -33, 16, 43, -33, HC.woodD);
    banner(B, -10, 10, -33, 59, 15, { fu: true }); banner(B, -27, -21, -33, 56, 40, {}); banner(B, 21, 27, -33, 56, 40, {});
    jiazi(B, 36, 34, -34, 2);
    // columns: the left three whole with brackets, a beam and half a roof; the right ones snapped
    for (const x of [-78, -47, -16]) { column(U, x, 18, 54); bracket(U, x, 18, 55); }
    column(U, -78, -14, 54); column(U, -47, -14, 54);
    column(U, 16, 18, 30, { broken: true }); column(U, 47, 18, 14, { broken: true, char: true }); column(U, 78, 18, 40, { broken: true });
    B(-86, 70, 15, -10, 72, 21, HC.woodD); B(-86, 71, 21, -10, 71, 21, HC.redD); B(-12, 70, 15, -10, 72, 21, HC.char);
    hanRoof(B, -98, -22, -48, 32, 73, [[0, 3], [8, 3], [8, 3]], 1, { cut1: true });
    tileHeap(U, 60, -6, 20, 12, 3); beamDown(U, 24, 56, -24); columnDown(U, 52, 86, 9);
    // the altar in the open middle bay
    B(-18, 8, -28, 18, 12, -6, HC.stoneD); B(-16, 13, -26, 16, 13, -8, HC.yel); B(-16, 8, -5, 16, 13, -5, HC.yel);
    B(0, 9, -5, 0, 12, -5, HC.ink); B(-3, 11, -5, 3, 11, -5, HC.ink);
    const d = ding(B, 0, -17, 14, { lit });
    for (const s of [-1, 1]) { const f = fireBowl(B, s * 28, 39, lit, 6); if (lit) lampLight(c, p, wp(p, f[0], f[1] + 4, f[2]), 0.9, 5); }
    if (lit) { const q = wp(p, d.fire[0], d.fire[1], d.fire[2]); c.flame([q[0], q[1] + 0.15, q[2]], 0xff8a38, 0.13); lampLight(c, p, [q[0], q[1] + 0.6, q[2] + 0.8], 1.6, 8); smoke(c, [q[0], q[1] + 0.8, q[2]], { rate: 2.4, col: 0x6a645c }); }
  } },
  { id: 'hj_dingtan', name: '鼎坛', foot: { w: 10.0, d: 5.6 }, tags: ['altar', 'tall'], build(c, p) {
    // a two-tier altar terrace, the upper one draped in yellow; a great bronze 鼎 burning on it, banner poles at the back corners
    // with a rope of talismans between them, two stone beasts by the steps and fire bowls on the lower corners
    const B = frame(c.w, p.x, p.z, 0), lit = p.time !== 'day' || p.rnd(1) < 0.7;
    shell(B, -64, -1, -34, 64, 4, 28, HC.stone, HC.slab);
    for (let x = -60; x <= 60; x += 10) B(x, 4, -34, x, 4, 28, HC.joint);
    B(-64, -1, 28, 64, 0, 28, HC.stoneD);
    B(-14, -1, 29, 14, 1, 36, HC.stone); B(-14, 2, 29, 14, 3, 32, HC.stone);
    shell(B, -40, 5, -30, 40, 10, 14, HC.earth, HC.earthL);
    B(-40, 11, 12, -11, 11, 15, HC.yel); B(11, 11, 12, 40, 11, 15, HC.yel);
    for (const [a0, a1] of [[-40, -11], [11, 40]] as const) { B(a0, 7, 15, a1, 10, 15, HC.yel); for (let a = a0 + 2; a + 4 <= a1; a += 10) B(a, 5, 15, a + 4, 6, 15, HC.yelD); B(a0, 10, 15, a1, 10, 15, HC.ink); }
    B(-10, 5, 15, 10, 7, 20, HC.stone);
    const d = ding(up(B, 0), 0, -8, 11, { lit, big: true });
    for (const s of [-1, 1]) bannerPole(up(B, 11), s * 34, -26, 66, { fu: s > 0, len: 36 });
    fuRope(up(B, 11), -34, 34, -25, 58);
    bixie(up(B, 5), -24, 14, {}); bixie(up(B, 5), 24, 14, { headless: true });
    for (const s of [-1, 1]) { const f = fireBowl(up(B, 5), s * 50, 16, lit, 6); if (lit) lampLight(c, p, wp(p, f[0], f[1] + 9, f[2]), 0.9, 5); }
    if (lit) { const q = wp(p, d.fire[0], d.fire[1], d.fire[2]); c.flame([q[0], q[1] + 0.2, q[2]], 0xff8a38, 0.16); lampLight(c, p, [q[0], q[1] + 0.8, q[2] + 1.0], 1.8, 9); smoke(c, [q[0], q[1] + 1.0, q[2]], { rate: 3, col: 0x5e5852 }); }
  } },
];

// ------------------------------------------------------------------ ground
function floor(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, dry = DRY_BY[f.p.season], paths = f.layout.path, court = f.layout.court, sd = f.p.seed % 7;
  const near = (r: Rect, x: number, z: number, m: number) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  // the paved court round the battle floor (act-19: through SX / SZ, so it grows with the 2x stage)
  const CX0 = SX(-7.2), CX1 = SX(7.2), CZ0 = SZ(-9.6), CZ1 = SZ(7.0);
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL; let col: number;
    const onPath = paths.some(r => near(r, x, z, 0)), kerb = !onPath && paths.some(r => near(r, x, z, 0.14));
    const inCourt = (court && near(court, x, z, 0)) || (x > CX0 && x < CX1 && z > CZ0 && z < CZ1);
    const edge = !inCourt && x > CX0 - 0.22 && x < CX1 + 0.22 && z > CZ0 - 0.22 && z < CZ1 + 0.22;
    if (onPath) {
      // the way in: long slabs in running bond, three close greys by whole slab
      const r = Math.floor(Z / 10), lz = ((Z % 10) + 10) % 10, sx = X + (r & 1 ? 7 : 0), l = ((sx % 14) + 14) % 14;
      col = lz === 9 || l === 13 ? HC.joint : [HC.stoneL, HC.slabB, HC.stone][Math.floor(hash(Math.floor(sx / 14), r, 7) * 3)];
    } else if (kerb) col = HC.kerb;
    else if (inCourt) {
      // the court: square slabs 0.7 m with a joint; a few slabs gone to packed earth (whole slabs, never single cells)
      const gx = Math.floor(X / 10), gz = Math.floor(Z / 10), lx = ((X % 10) + 10) % 10, lz = ((Z % 10) + 10) % 10, h = hash(gx, gz, 31 + sd);
      col = lx === 9 || lz === 9 ? HC.joint : h < 0.06 ? HC.groundD : [HC.slab, HC.slabB, HC.slabC][Math.floor(hash(gx, gz, 17) * 3)];
    } else if (edge) col = ((Math.floor(X / 6) + Math.floor(Z / 6)) & 1) ? HC.stoneD : HC.kerb;
    else { const n = field(Math.floor(X / 3) / 4, Math.floor(Z / 3) / 4, sd + 2); col = n > 0.95 ? HC.groundD : n > 0.2 ? dry[0] : n > -0.5 ? HC.ground : dry[1]; }
    w.set(X, -1, Z, col);
  }
}
// ------------------------------------------------------------------ the far ring: the compound wall (breached), cypress and dead trees, smoke
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, r = f.p.rnd, B = frame(w, 0, 0, 0);
  const Z0 = M(SZ(-18.4)), Z1 = M(SZ(-17.8)), X0 = M(SX(-17)), X1 = M(SX(17)), gaps: Array<[number, number]> = [[M(SX(-6.2)), M(SX(-4.0))], [M(SX(4.6 + r(1) * 2)), M(SX(6.6 + r(1) * 2))]];
  for (let X = X0; X <= X1; X += 1) {
    const g = gaps.find(([a, b]) => X >= a && X <= b);
    const h = g ? 10 : 40;
    B(X, -1, Z0, X, h, Z1, HC.earthD);
    if (!g) { for (let y = 6; y < h; y += 6) B(X, y, Z1, X, y, Z1, 0x7a6648); B(X, h + 1, Z0 - 3, X, h + 2, Z1 + 3, HC.tile); B(X, h + 3, Z0 - 1, X, h + 4, Z1 + 1, HC.tileD); }
  }
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i < 8; i++) pts.push([SX(-15 + i * 4.2 + (i % 2) * 0.8), SZ(-20.5 - (i % 2) * 1.4), 7 + r(320 + i) * 3]);
  for (let i = 0; i < 5; i++) pts.push([SX(16 + (i % 2) * 1.6), SZ(-15 + i * 3.4), 6 + r(300 + i) * 2.5]);
  for (let i = 0; i < 5; i++) pts.push([SX(-16 - (i % 2) * 1.6), SZ(-15 + i * 3.4), 6 + r(340 + i) * 2.5]);
  pts.forEach(([x, z, h], i) => { if ((i + f.p.seed) % 3 === 1) deadTree(w, x, z, h * 0.75, 0x4e4640, 0x2e2a26, { seed: 70 + i, crow: 0.2, moss: 0 }); else pine(w, x, z, h, 0x4a3a30, 0x2c3e36, 0x3e5448, { seed: 90 + i, slim: 0.72 }); });
  smoke(c, [SX(-9 + r(2) * 4), 2.5, SZ(-24)], { rate: 1.4, col: 0x4e4a46 });
  if (r(3) < 0.6) smoke(c, [SX(8 + r(4) * 4), 2.5, SZ(-25)], { rate: 1.1, col: 0x5a5650 });
}
// ------------------------------------------------------------------ dressing: dry grass, cracked slabs, dropped talismans
addCardKind('hjfu', { kind: 'decal', w: 32, h: 32 }, g => {
  const r = (x: number, y: number, ww: number, hh: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  const Y = '#d8b444', D = '#a8862a', I = '#9a2a1e';
  r(4, 3, 6, 11, Y); r(4, 13, 6, 1, D); r(6, 5, 2, 7, I); r(5, 6, 4, 1, I);
  r(17, 9, 11, 6, Y); r(17, 14, 11, 1, D); r(19, 11, 7, 2, I);
  r(9, 20, 6, 10, Y); r(9, 29, 6, 1, D); r(11, 22, 2, 6, I);
});
function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  const sd = f.p.seed, dry = DRY_BY[f.p.season], drySet = new Set<number>([...dry, HC.ground, HC.groundD]);
  const clear = (x: number, z: number) => f.clear.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const floorAt = (x: number, z: number) => c.w.get(M(x), -1, M(z))?.c;
  const tints = [0xc0b48c, 0xb0a47c, 0xa89c74];
  let n = 0, t = 0;
  while (n < 240 && t < 6000) {
    t++; const cx = AREA.x0 - 3 + hash(t, sd, 11) * (AREA.x1 - AREA.x0 + 6), cz = AREA.z0 - 4 + hash(t, sd, 12) * (AREA.z1 - AREA.z0 + 4);
    if (inPlay(cx, cz) || clear(cx, cz) || !drySet.has(floorAt(cx, cz) ?? 0)) continue;
    for (let k = 0; k < 5 && n < 240; k++) {
      const x = cx + (hash(t, k, sd + 3) - 0.5) * 1.1, z = cz + (hash(t, k, sd + 4) - 0.5) * 1.1, y = ground(c, x, z);
      if (y == null || y > 0.08 || inPlay(x, z) || clear(x, z)) continue;
      c.cards.add('grass', x, z, { y, s: 0.3 + hash(t, k, 9) * 0.22, tint: tints[Math.floor(hash(t, k, 6) * 3)] }); n++;
    }
  }
  const deco = (kind: string, count: number, s: [number, number], inside: boolean, salt: number) => {
    let k = 0, q = 0;
    while (k < count && q < 600) { q++; const x = SX(-7) + hash(q, sd, salt) * (SX(7) - SX(-7)), z = SZ(-9.2) + hash(q, sd, salt + 1) * (SZ(6.6) - SZ(-9.2)); if (!inside && inPlay(x, z)) continue; const y = ground(c, x, z); if (y == null || y > 0.05) continue;
      c.cards.add(kind, x, z, { y: y + 0.004 + k * 0.0004, s: s[0] + hash(q, 3, salt) * (s[1] - s[0]), ry: Math.floor(hash(q, 4, salt) * 4) * Math.PI / 2, tint: kind === 'crack' ? 0xc8c4bc : 0xffffff }); k++; }
  };
  // (act-17 review: the dark crack decals read as diagonal scribbles on the court — the user's most hated 「梯」/ speckle — so none;
  // a few dropped talismans only off the battle floor)
  deco('hjfu', 4, [0.5, 0.7], false, 60);
  if (f.p.time === 'dusk' || f.p.time === 'night') c.ambient({ kind: 'embers', color: 0xff8a3a, rate: 1.0, area: { x0: -8, z0: -13, x1: 8, z1: -8 } });
  c.ambient({ kind: 'dust', color: 0xb8b0a4, rate: 1.0 });
}
export const hj_temple: Locale = {
  id: 'hj_temple', name: '破庙', theme: 'hanmo',
  layouts: ['axis', 'offset', 'pair', 'garden'],
  landmarks: LANDMARKS, groups: GROUPS, filler: FILLER,
  floor, far, dress,
};
