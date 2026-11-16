// 城下町的地面、远景和面片（town 代理）。
// 地面：街面是夯土，按 1 × 1.4 m 的大块铺三种土色，中间两条车辙；街两边各一条石砌明沟（深色带 + 亮边）；檐下是石板。
// 「辻」的横街一样铺土，明沟在路口断开。「河岸」那一侧挖一条水道（底发暗光，两岸石砌收边，近岸有下水石阶），对岸是土地。
// 远景：两侧町屋背后再排一列屋顶，街尾远处一座天守剪影（城下町的「城」），不进战斗区、不挡镜头。
import type { Ctx } from '../../scenes/stage';
import { M, hash, AREA, inPlay } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { ground } from '../../scenes/dress';
import { buildFlora } from '../../scenes/flora';
import type { Layout, Place, Rect } from '../types';
import { TW, TILE, BOARD, gableRoof, type Fr } from './town_kit';
import { plates } from './town_props';

/** the canal of the riverside layout: x range (m) on side s */
export const CANAL = { a: 6.6, b: 9.6 };
const canalSide = (l: Layout) => (l.id.startsWith('kashi') ? (l.id.endsWith('~') ? -1 : 1) : 0);

export function floor(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, paths = f.layout.path, cs = canalSide(f.layout), wx0 = cs * CANAL.a, wx1 = cs * CANAL.b;
  const inR = (r: Rect, x: number, z: number, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  const main = paths[0], cross = paths[1];
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL; let col: number;
    // the canal (riverside): no floor, a dim bed, coping on both banks, a quay strip on the street side
    if (cs && x * cs > CANAL.a && x * cs < CANAL.b) { w.set(X, -1, Z, null).set(X, -2, Z, 0x14222c, 1); continue; }
    if (cs && x * cs >= CANAL.a - 0.15 && x * cs <= CANAL.a) { w.set(X, -1, Z, TW.stoneL).set(X, 0, Z, TW.stoneL); continue; }
    if (cs && x * cs >= CANAL.b && x * cs < CANAL.b + 0.15) { w.set(X, -1, Z, TW.stoneL).set(X, 0, Z, TW.stoneL); continue; }
    const onPath = paths.some(r => inR(r, x, z));
    if (onPath) {
      // a stone gutter along the long sides of the street (broken at the crossing), packed earth in big blocks, two wheel ruts
      const deep = paths.some(r => inR(r, x, z, -0.4));
      const sideGutter = (inR(main, x, z) && (x < main.x0 + 0.4 || x > main.x1 - 0.4)) || (!!cross && inR(cross, x, z) && (z < cross.z0 + 0.4 || z > cross.z1 - 0.4));
      if (sideGutter && !deep && !(cross && inR(cross, x, z) && inR(main, x, z))) col = x < main.x0 + 0.08 || x > main.x1 - 0.08 || (cross && (z < cross.z0 + 0.08 || z > cross.z1 - 0.08)) ? TW.gutterL : TW.gutter;
      else {
        const bz = Math.floor(Z / 20), bx = Math.floor(X / 14), k = hash(bx, bz, 11);
        col = TW.earth[k < 0.45 ? 0 : k < 0.8 ? 1 : 2];
        if (inR(main, x, z, -0.4) && Math.abs(x - 0.1) > 1.5 && Math.abs(x - 0.1) < 1.92 && !(cross && inR(cross, x, z))) col = TW.earthD;
      }
    } else if (paths.some(r => inR(r, x, z, 0.55))) col = TW.kerb;
    else if (cs && x * cs > CANAL.b) col = ((Math.floor(X / 12) + Math.floor(Z / 12)) & 1) ? 0x4a4a3a : 0x52503e;
    else { const r = Math.floor(Z / 9), sx = X + (r & 1 ? 5 : 0), l = ((sx % 11) + 11) % 11, lz = ((Z % 9) + 9) % 9; col = lz === 8 || l === 10 ? TW.joint : TW.flag[Math.floor(hash(Math.floor(sx / 11), r, 5) * 3)]; }
    w.set(X, -1, Z, col);
  }
  if (cs) {
    // stone steps (gangi) down to the water on the street-side bank every few metres, and the water itself
    for (const z of [-7.0, -1.6, 3.4]) {
      const Z = M(z), X = M(cs * CANAL.a);
      for (let k = 0; k < 3; k++) w.box(X + cs * k * 3, -2 + (2 - k) - 2, Z - 7, X + cs * (k * 3 + 2), -1 - k, Z + 7, k ? TW.stone : TW.stoneL);
    }
    c.water(Math.min(wx0, wx1), (M(AREA.z0 - 8)) * CELL, Math.max(wx0, wx1), (M(AREA.z1 + 4) + 1) * CELL, 0x2c4a5c);
  }
}

export function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, cs = canalSide(f.layout), sd = f.p.seed;
  // a row of roofs behind each facade row (plain blocks: plaster, a wood wainscot, a gable roof of tile or boards)
  const cross = f.layout.path[1], wetAt = (X: number, Z: number) => !w.has(X, -1, Z) && w.has(X, -2, Z);
  for (const s of [-1, 1] as const) for (let i = 0; i < 6; i++) {
    const z0 = -15.5 + i * 3.7;
    if (cross && z0 < cross.z1 + 0.3 && z0 + 3.3 > cross.z0 - 0.3) continue;   // the side street of the crossing runs out between them
    const x = s * (s === cs ? 14.6 : 13.4) + s * (i % 2) * 0.5, Hh = M(3.2 + ((i + sd) % 3) * 0.7);
    const X0 = M(x - 1.7), X1 = M(x + 1.7), Z0 = M(z0), Z1 = M(z0 + 3.3);
    if ([Z0, (Z0 + Z1) >> 1, Z1].some(Z => wetAt((X0 + X1) >> 1, Z))) continue;   // a canal (the bridge's) runs here
    w.box(X0, -1, Z0, X1, Hh, Z1, TW.plaster).box(X0, -1, Z0, X1, 14, Z1, TW.wood).box(X0, 15, Z0, X1, 15, Z1, TW.woodD);
    const fr: Fr = { w, ax: 'x', s: 1, I: X0 - 3, A0: Z0 - 1, F: Z1 - Z0 + 2, D: X1 - X0 + 6 };
    gableRoof(fr, 0, X1 - X0 + 6, 0, Z1 - Z0 + 2, Hh + 1, [[0, 3], [7, 3], [7, 3]], (i + sd) % 2 ? TILE : BOARD, { end: { col: TW.plaster, at: 2 } });
  }
  // across the far end, behind the landmark: a low line of roofs, and far off a castle keep above the town
  for (let i = 0; i < 7; i++) {
    const x0 = -13 + i * 3.8, Z0 = M(-19.5 - (i % 2) * 0.8), Hh = M(3.4 + ((i * 3 + sd) % 3) * 0.6), X0 = M(x0), X1 = M(x0 + 3.4);
    w.box(X0, -1, Z0, X1, Hh, Z0 + 40, TW.plaster).box(X0, -1, Z0 + 40, X1, 14, Z0 + 40, TW.wood);
    const fr: Fr = { w, ax: 'z', s: -1, I: Z0 + 43, A0: X0 - 1, F: X1 - X0 + 2, D: 46 };
    gableRoof(fr, 0, 46, 0, X1 - X0 + 2, Hh + 1, [[0, 3], [8, 3], [8, 3]], i % 2 ? TILE : BOARD);
  }
  const kx = M((hash(sd, 3, 1) < 0.5 ? -1 : 1) * (5 + hash(sd, 4, 1) * 4)), kz = M(-30);
  w.box(kx - 40, -1, kz - 30, kx + 40, 40, kz + 30, TW.stoneD).box(kx - 38, 41, kz - 28, kx + 38, 42, kz + 28, TW.stone);   // the stone base
  let y = 43, hw = 30, hd = 22;
  for (let t = 0; t < 4; t++) {
    const H = t === 3 ? 18 : 24;
    w.box(kx - hw, y, kz - hd, kx + hw, y + H, kz + hd, TW.plaster).box(kx - hw, y, kz + hd, kx + hw, y + 5, kz + hd, TW.woodD);
    for (let x = kx - hw + 5; x < kx + hw - 3; x += 8) w.box(x, y + H - 9, kz + hd, x + 2, y + H - 5, kz + hd, TW.woodD);
    y = plates(w, kx - hw - 6, kx + hw + 6, kz - hd - 6, kz + hd + 6, y + H + 1, [[0, 3], [5, 3]], TILE.body, TILE.dark, TILE.lit);
    hw -= 6; hd -= 4;
  }
  w.box(kx - 6, y, kz - 3, kx + 6, y + 3, kz + 3, TW.ridge).box(kx - 8, y + 2, kz - 2, kx - 6, y + 6, kz + 2, TW.gold).box(kx + 6, y + 2, kz - 2, kx + 8, y + 6, kz + 2, TW.gold);
  if (f.p.lamp > 0.3) for (const dx of [-14, 0, 14]) w.box(kx + dx - 2, 52, kz + 22, kx + dx + 2, 57, kz + 22, TW.glowMid, 1);
}

export function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  buildFlora(c);
  const sd = f.p.seed, clear = (x: number, z: number) => f.clear.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
    /** a wall or a plinth stands within r (body band) */
  const nearWall = (x: number, z: number, r: number) => { for (let a = 0; a < 8; a++) { const ax = x + Math.cos(a * 0.785) * r, az = z + Math.sin(a * 0.785) * r; if (c.w.has(M(ax), 1, M(az)) && c.w.has(M(ax), 5, M(az))) return true; } return false; };
  // weeds in the joints of the flagstones under the eaves, at the feet of walls (never on the street)
  let n = 0;
  for (let t = 0; t < 1400 && n < 70; t++) {
    const x = AREA.x0 + hash(t, sd, 51) * (AREA.x1 - AREA.x0), z = AREA.z0 + hash(t, sd, 52) * (AREA.z1 - AREA.z0 + 2);
    if (inPlay(x, z) || clear(x, z) || !nearWall(x, z, 0.25)) continue;
    const y = ground(c, x, z); if (y == null || y > 0.08) continue;
    c.cards.add(f.p.season === 'winter' ? 'weeds' : hash(t, 3) < 0.7 ? 'grass' : 'weeds', x, z, { y, s: 0.26 + hash(t, 4) * 0.14, tint: f.p.season === 'autumn' ? 0xb0a070 : 0x98a888 }); n++;
  }
  // the street: puddles in the ruts when it rains (they glow faintly with the lamps); no pebble scatter (it reads as speckle)
  // (main window, 11-15: the scalloped puddle decals read as dark-blue blobs with speckled rims in the middle of the fight, so rain
  // now darkens the ruts themselves: long rectangular wet strips painted into the floor cells, see wetRuts(), no decals)
  if (f.p.weather === 'rain') wetRuts(c, f, sd);
  // in the riverside layout: reeds along the far bank of the canal
  const cs = canalSide(f.layout);
  if (cs) for (let i = 0; i < 22; i++) {
    const x = cs * (CANAL.b + 0.25 + hash(i, sd, 71) * 0.4), z = -11 + hash(i, sd, 72) * 16, y = ground(c, x, z);
    if (y != null && y < 0.1) c.cards.add('reeds', x, z, { y, s: 0.45 + hash(i, 73) * 0.3, tint: f.p.season === 'winter' ? 0xa8a088 : 0x9cb080 });
  }
  // air: warm motes drifting up from the lanterns down the street, dust; ashes of a winter fire, a few willow leaves in autumn
  if (f.p.lamp > 0.3) c.ambient({ kind: 'fireflies', color: 0xffb060, rate: 0.5, area: { x0: -6, z0: -11, x1: 6, z1: -5 } });
  if (f.p.season === 'autumn') c.ambient({ kind: 'leaves', color: 0xc0b050, rate: 0.8, area: { x0: -9, z0: -10, x1: 9, z1: 4 } });
}

/** rain: the two wheel ruts and a few low spots hold water. Painted into the floor cells as long rectangles (whole cells, 2–3 tones),
 *  so they read as wet ground in the same big-block language as the street, never as blobs or a speckled rim. */
function wetRuts(c: Ctx, f: { layout: Layout; p: Place }, sd: number) {
  const w = c.w, WET = 0x4a4c56, WET_L = 0x5c6070, WET_D = 0x3e4048;
  for (const side of [-1, 1]) {
    // each rut: 2–3 strips along z, 0.28 m wide, 1.2–2.6 m long, with gaps of dry ground between them
    let z = -9.0 + hash(sd, side, 81) * 1.2;
    while (z < 6.5) {
      const len = 1.2 + hash(sd, Math.round(z * 10), side + 82) * 1.4, x0 = side * 1.52, X0 = M(Math.min(x0, x0 + side * 0.28)), X1 = M(Math.max(x0, x0 + side * 0.28));
      for (let X = X0; X <= X1; X++) for (let Z = M(z); Z <= M(z + len); Z++) { const cur = w.get(X, -1, Z); if (!cur || w.has(X, 0, Z)) continue; w.set(X, -1, Z, X === X0 || X === X1 ? WET_D : Z % 7 === 0 ? WET_L : WET); }
      z += len + 0.8 + hash(sd, Math.round(z * 10), side + 83) * 1.6;
    }
  }
  // one or two wider low spots off the ruts, as plain rectangles
  for (let i = 0; i < 2; i++) {
    const x = (hash(sd, i, 85) - 0.5) * 6, z = -6 + hash(sd, i, 86) * 10, hw = 0.4 + hash(sd, i, 87) * 0.3, hd = 0.3 + hash(sd, i, 88) * 0.25;
    for (let X = M(x - hw); X <= M(x + hw); X++) for (let Z = M(z - hd); Z <= M(z + hd); Z++) { if (!w.get(X, -1, Z) || w.has(X, 0, Z)) continue; const edge = X === M(x - hw) || X === M(x + hw) || Z === M(z - hd) || Z === M(z + hd); w.set(X, -1, Z, edge ? WET_D : WET_L); }
  }
  void f;
}
