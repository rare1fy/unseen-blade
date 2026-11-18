// 第二关 · 洛阳余烬：三个地点共用的小件道具组、填空件、铺地、空中灰尘和火星。每个地点用自己的 id 前缀各拿一份
// （stats 里分开统计，三个地点的近排矮件都从这里出，保证同一关的近景是一套东西）。大件和地标各在自己的文件里，三处要彼此不同。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, SX, SZ } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import type { Group, Layout, Place, Rect } from '../types';
import { LY, frame, faceOf, orient, wp, fireLight, smoke, rubble, emberHeap, fireBasin, charPost } from './ly_kit';

/** the near-row pieces every 洛阳 place has (≤ 0.9 m where they may stand in front of the camera line) */
export function commonGroups(pre: string): Group[] {
  return [
    { id: `${pre}_brazier`, name: '火盆', tags: ['fire', 'light'], foot: { w: 1.2, d: 1.2 }, h: 1.4, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
      const B = frame(c.w, p.x, p.z, 0), lit = p.time !== 'day' || p.rnd(1) < 0.5, f = fireBasin(B, 0, 0, lit, 8);
      B(-8, -1, -8, 8, -1, 8, LY.ashD); B(6, 0, 4, 9, 2, 8, LY.charL);
      if (lit) fireLight(c, p, wp(p, 0, f[0], f[1] + 3, f[2]), 1, 5.5);
    } },
    { id: `${pre}_rubble`, name: '砖瓦堆', tags: ['ruin', 'low'], foot: { w: 2.2, d: 2.2 }, h: 0.8, kinds: ['wing', 'back'], size: 'S', weight: 1.3, build(c, p) {
      const B = frame(c.w, p.x, p.z, orient(p)); rubble(B, 0, 0, 13, 10, 3, { beam: p.rnd(1) < 0.6 });
    } },
    { id: `${pre}_embers`, name: '余火', tags: ['fire', 'light', 'low'], foot: { w: 2.0, d: 2.0 }, h: 0.6, kinds: ['wing', 'back'], size: 'S', build(c, p) {
      const r = orient(p), B = frame(c.w, p.x, p.z, r), lit = p.time !== 'day' || p.rnd(1) < 0.7, f = emberHeap(B, 0, 0, lit), q = wp(p, r, f[0], f[1], f[2]);
      if (lit) fireLight(c, p, q, 0.8, 4);
      smoke(c, [q[0], q[1] + 0.2, q[2]], { rate: 1.5, col: 0x5a5652 });
    } },
    { id: `${pre}_fallenpost`, name: '倒柱', tags: ['ruin', 'low'], foot: { w: 1.4, d: 2.8 }, h: 0.4, kinds: ['wing', 'back'], size: 'S', build(c, p) {
      // a column fallen along the floor's edge: charred on its upper half, the red still on the foot end; its base stone left standing
      const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
      B(-18, -1, -2, 18, 1, 2, LY.char); B(-18, 2, -1, 18, 2, 1, LY.char); B(-18, -1, -2, -6, 1, 2, LY.redD); B(-18, 2, -1, -6, 2, 1, LY.red);
      B(-19, 0, -1, -19, 1, 1, LY.charL); B(19, 0, -1, 19, 1, 1, LY.charL);
      B(-24, -1, 3, -18, 1, 9, LY.stoneD); B(-23, 2, 4, -19, 2, 8, LY.stone);
      rubble(B, 10, 6, 6, 3, 2);
    } },
  ];
}
/** small pieces filling the leftover room on the wings (whole blocks, nothing scattered by the cell) */
export function commonFiller(pre: string): Group[] {
  const grounded = (c: Ctx, p: Place) => { if (!c.w.has(M(p.x), -1, M(p.z))) throw new Error('no ground'); };
  return [
    { id: `${pre}_f_brick`, name: '碎砖', tags: ['low'], foot: { w: 1.0, d: 0.9 }, h: 0.3, kinds: ['wing'], size: 'S', max: 3, build(c, p) {
      grounded(c, p); const B = frame(c.w, p.x, p.z); B(-6, -1, -3, 1, 1, 2, LY.brick); B(-6, 1, -3, 1, 1, 2, LY.brickL); B(2, -1, -2, 6, 0, 3, LY.brickD); B(-3, 2, -2, 0, 3, 1, LY.brickD);
    } },
    { id: `${pre}_f_tile`, name: '碎瓦', tags: ['low'], foot: { w: 1.0, d: 0.9 }, h: 0.3, kinds: ['wing'], size: 'S', max: 3, build(c, p) {
      grounded(c, p); rubble(frame(c.w, p.x, p.z), 0, 0, 6, 5, 2);
    } },
    { id: `${pre}_f_beam`, name: '焦梁', tags: ['low'], foot: { w: 1.4, d: 0.6 }, h: 0.2, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
      grounded(c, p); const B = frame(c.w, p.x, p.z); B(-9, -1, -2, 9, 1, 1, LY.char); B(-9, 0, -1, -9, 0, 0, LY.charL); B(9, 0, -1, 9, 0, 0, LY.charL);
    } },
    { id: `${pre}_f_stub`, name: '焦桩', tags: ['low'], foot: { w: 0.8, d: 0.8 }, h: 0.6, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
      grounded(c, p); charPost(frame(c.w, p.x, p.z), 0, 0, 6, { broken: true, charAt: 3 });
    } },
  ];
}

/** 11-18 (用户：「不许逐格随机碎点」): 砖缝只交代石板铺法，烧焦和积灰按街面位置落成片。 */
interface Paving { n: number; m: number; joint: number; body: number }
type Surface = Paving | number;
const paveAt = (X: number, Z: number, surface: Surface) => {
  if (typeof surface === 'number') return surface;
  const { n, m, joint, body } = surface;
  const sx = X + (Math.floor(Z / m) & 1) * Math.floor(n / 2);
  return Z % m === 0 || sx % n === 0 ? joint : body;
};

export function lyFloor(c: Ctx, f: { layout: Layout }, o: {
  court: Surface; path: Paving; outer: [number, number, number]; kerb?: number;
  patches?: Array<{ rect: Rect; surface: Surface }>;
}) {
  const { path, court } = f.layout, kerbC = o.kerb ?? LY.stoneD;
  const near = (r: Rect, x: number, z: number, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
  const apron = { x0: SX(-7.0), x1: SX(7.2), z0: SZ(-9.4), z1: SZ(7.0) };
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL;
    const inCourt = (court && near(court, x, z)) || near(apron, x, z);
    const patch = o.patches?.find(p => near(p.rect, x, z));
    let col: number;
    if (path.some(r => near(r, x, z))) col = paveAt(X, Z, o.path);
    else if (path.some(r => near(r, x, z, 0.14)) || (!inCourt && near(apron, x, z, 0.21))) col = kerbC;
    else if (patch) col = paveAt(X, Z, patch.surface);
    else if (inCourt) col = paveAt(X, Z, o.court);
    else col = z < apron.z0 ? o.outer[2] : x < apron.x0 - 2.1 || x > apron.x1 + 2.1 ? o.outer[1] : o.outer[0];
    c.w.set(X, -1, Z, col);
  }
}

/** 后排余火上方保留火星和灰尘，地上的焦痕由各处的铺地标出。 */
export function lyDress(c: Ctx, f: { p: Place }, o: { embers?: number; ashCol?: number; emberArea?: Rect } = {}) {
  const night = f.p.time === 'dusk' || f.p.time === 'night';
  const ea = o.emberArea ?? { x0: AREA.x0, z0: AREA.z0 - 6, x1: AREA.x1, z1: AREA.z0 + 6 };
  c.ambient({ kind: 'embers', color: 0xff8a3a, rate: (o.embers ?? 1.6) * (night ? 1 : 0.35), area: ea });
  c.ambient({ kind: 'embers', color: 0xffa050, rate: night ? 0.5 : 0.15 });
  c.ambient({ kind: 'dust', color: o.ashCol ?? 0x9a948c, rate: 2.2 });
}
