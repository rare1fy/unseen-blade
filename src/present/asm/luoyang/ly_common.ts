// 第二关 · 洛阳余烬：三个地点共用的小件道具组、填空件、铺地、空中灰尘和火星。每个地点用自己的 id 前缀各拿一份
// （stats 里分开统计，三个地点的近排矮件都从这里出，保证同一关的近景是一套东西）。大件和地标各在自己的文件里，三处要彼此不同。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, PLAY, hash, SX, SZ } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { addCardKind } from '../../scenes/cards';
import { ground } from '../../scenes/dress';
import { plot, tone } from '../../scenes/flora';
import type { Group, Layout, Place, Rect } from '../types';
import { LY, frame, faceOf, orient, wp, fireLight, smoke, rubble, emberHeap, fireBasin, charPost, palaceWall, hanRoof, earthWall, charTree, up, heap } from './ly_kit';

// Luoyang street-edge micro-cards (broken Han roof tiles & ash-charred stone chips, 16×16 crisp pixel canvases)
addCardKind('lytile', { kind: 'decal', w: 16, h: 16 }, g => {
  const r = (x: number, y: number, w2: number, h2: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w2, h2); };
  for (const [x, y, w2, h2] of [[1, 2, 6, 3], [9, 3, 5, 3], [3, 9, 6, 4], [11, 10, 4, 3]] as const) {
    r(x, y, w2, h2, '#4a4746'); r(x, y, w2, 1, '#787470'); r(x, y + h2 - 1, w2, 1, '#262322');
  }
  r(6, 6, 4, 2, '#7d3424');
});
addCardKind('lyash', { kind: 'decal', w: 16, h: 16 }, g => {
  const r = (x: number, y: number, w2: number, h2: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w2, h2); };
  r(2, 3, 7, 2, '#2a2422'); r(3, 3, 5, 1, '#4c423c');
  r(8, 9, 6, 2, '#241f1d'); r(2, 11, 4, 3, '#6c665f'); r(2, 11, 4, 1, '#989188');
  r(11, 4, 3, 2, '#9e4422');
});

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

/** 后排余火上方保留火星和灰尘，并在墙根/宫道沿边铺碎汉瓦、焦炭碎石与低矮残砖，消除空旷白模感同时保持中央战斗区干净。 */
export function lyDress(c: Ctx, f: { layout?: Layout; p: Place; clear?: Rect[] }, o: { embers?: number; ashCol?: number; emberArea?: Rect } = {}) {
  const night = f.p.time === 'dusk' || f.p.time === 'night';
  const ea = o.emberArea ?? { x0: AREA.x0, z0: AREA.z0 - 6, x1: AREA.x1, z1: AREA.z0 + 6 };
  const w = c.w, sd = f.p.seed;
  const nearWall = (x: number, z: number) => {
    const X = M(x), Z = M(z);
    if (w.has(X, 1, Z) || w.has(X, 6, Z) || !w.has(X, -1, Z)) return false;
    return w.has(X + 9, 6, Z) || w.has(X - 9, 6, Z) || w.has(X, 6, Z + 9) || w.has(X, 6, Z - 9);
  };
  const hitsPath = (x: number, z: number) => (f.layout?.path ?? []).some(q => x > q.x0 - 0.45 && x < q.x1 + 0.45 && z > q.z0 - 0.45 && z < q.z1 + 0.45);
  // street-edge broken tiles, ash splinters & sparse hardy dry tufts hugging palace wall footings inside PLAY
  for (const [kind, count, sMin, sMax, salt] of [
    ['lytile', 90, 0.78, 1.25, 19],
    ['lyash', 72, 0.78, 1.20, 31],
  ] as const) {
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 24) {
      tries++;
      const x = PLAY.x0 + 0.35 + hash(tries, sd + salt, 11) * (PLAY.x1 - PLAY.x0 - 0.7);
      const z = PLAY.z0 + 0.35 + hash(tries, sd + salt, 17) * (PLAY.z1 - PLAY.z0 - 0.7);
      if (!nearWall(x, z)) continue;
      const y = ground(c, x, z); if (y == null || y > 0.08) continue;
      c.cards.add(kind, x, z, { y: y + 0.012, s: sMin + hash(tries, sd, salt + 7) * (sMax - sMin), tint: 0xffffff });
      placed++;
    }
  }
  // low 3D wall-root broken bricks, charred beam stubs & cracked stone plinth fragments (zero path/door obstruction)
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 280 && pts.length < 22; i++) {
    const x = PLAY.x0 + 0.6 + hash(i, sd, 71) * (PLAY.x1 - PLAY.x0 - 1.2);
    const z = PLAY.z0 + 0.6 + hash(i, sd, 79) * (PLAY.z1 - PLAY.z0 - 1.2);
    const X = M(x), Z = M(z);
    if (w.has(X, 1, Z) || !w.has(X, -1, Z) || hitsPath(x, z)) continue;
    if (pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.0)) continue;
    const touchN = w.has(X, 6, Z - 5) && !w.has(X, 1, Z + 12) && !w.has(X - 5, 1, Z) && !w.has(X + 5, 1, Z);
    const touchW = w.has(X - 5, 6, Z) && !w.has(X + 12, 1, Z) && !w.has(X, 1, Z - 5) && !w.has(X, 1, Z + 5);
    const touchE = w.has(X + 5, 6, Z) && !w.has(X - 12, 1, Z) && !w.has(X, 1, Z - 5) && !w.has(X, 1, Z + 5);
    if (!touchN && !touchW && !touchE) continue;
    if (pts.length % 3 === 0) {
      // fallen broken grey brick & red-lacquer plaster debris
      w.box(X - 3, 0, Z - 2, X + 2, 2, Z + 1, LY.brickD);
      w.box(X - 2, 3, Z - 1, X + 1, 3, Z, LY.brick);
      w.box(X + 2, 0, Z - 1, X + 5, 1, Z + 1, LY.redD);
    } else if (pts.length % 3 === 1) {
      // snapped charred timber rafter end tucked at wall base
      w.box(X - 5, 0, Z - 1, X + 4, 1, Z + 1, LY.char);
      w.box(X - 4, 2, Z - 1, X + 2, 2, Z, LY.charL);
    } else {
      // cracked stone pedestal corner block
      w.box(X - 2, 0, Z - 2, X + 2, 3, Z + 2, LY.stoneD);
      w.box(X - 2, 4, Z - 2, X + 1, 4, Z + 1, LY.stone);
    }
    pts.push([x, z]);
  }
  c.ambient({ kind: 'embers', color: 0xff8a3a, rate: (o.embers ?? 1.6) * (night ? 1 : 0.35), area: ea });
  c.ambient({ kind: 'embers', color: 0xffa050, rate: night ? 0.5 : 0.15 });
  c.ambient({ kind: 'dust', color: o.ashCol ?? 0x9a948c, rate: 2.2 });
}

/** Populate the East & West outer flanks of Luoyang drawn rooms + monumental distant burning imperial skyline & Mangshan mountain backdrop! */
export function lyFlankRuins(c: Ctx, f: { layout: Layout; p: Place }, style: 'ward' | 'road' | 'mint') {
  const w = c.w, r = f.p.rnd;
  // 1) Distant Burning Imperial Capital Skyline & Mangshan Mountain Ridge (远景焦宫天际线 + 邙山层峦) — runs for ALL Luoyang rooms!
  const addMass = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, side: number, topC?: number, lowC?: number) => {
    plot(w).masses.push({
      x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1),
      cx: 0, cz: 0, top: topC ?? tone(side, 1.12), side, low: lowC ?? tone(side, 0.72), band: 6,
    });
  };
  const farZ = Math.min(PLAY.z0 - 11, SZ(-22));
  const darkBrick = style === 'mint' ? 0x36302e : 0x4b4442;
  const darkRoof = 0x2c2b30;
  const crimsonDim = 0x5c2922;
  // Twin distant Imperial Que Gate-Towers (双阙高台剪影) + monumental 3-storey distant palace roofs
  for (const [cxM, dzM, wM, dM, tiers] of [
    [-26, -8,  14, 9, [[38, darkBrick], [8, darkRoof], [28, crimsonDim], [7, darkRoof], [22, darkBrick], [9, darkRoof]]],
    [  0, -14, 24, 11, [[46, crimsonDim], [9, darkRoof], [36, darkBrick], [9, darkRoof], [26, crimsonDim], [10, darkRoof]]],
    [ 28, -9,  15, 9, [[42, darkBrick], [8, darkRoof], [30, crimsonDim], [8, darkRoof], [20, darkBrick], [8, darkRoof]]],
    [-46, -15, 18, 10, [[52, darkBrick], [9, darkRoof], [32, darkBrick], [9, darkRoof]]],
    [ 48, -14, 18, 10, [[48, crimsonDim], [9, darkRoof], [34, darkBrick], [9, darkRoof]]],
  ] as Array<[number, number, number, number, Array<[number, number]>]>) {
    const cx = M(cxM), cz = M(farZ + dzM);
    let hw = M(wM / 2), hd = M(dM / 2), y = -1;
    for (let ti = 0; ti < tiers.length; ti++) {
      const [hh, col] = tiers[ti];
      const isRoof = ti % 2 === 1;
      const rh = isRoof ? hw + 6 : hw, rd = isRoof ? hd + 5 : hd;
      addMass(cx - rh, y, cz - rd, cx + rh, y + hh, cz + rd, col, isRoof ? 0x3f3e44 : tone(col, 1.08), tone(col, 0.72));
      y += hh + 1;
      if (isRoof) { hw = Math.max(12, Math.round(hw * 0.78)); hd = Math.max(10, Math.round(hd * 0.78)); }
    }
  }
  // Distant Mangshan Mountain Ridge silhouette (邙山暗影远山) wrapping the smoky horizon
  for (const [x0, x1, dz0, dz1, h, col] of [
    [-95, -24, -30, -19, 130, 0x3b3536],
    [ 22,  95, -32, -20, 148, 0x373234],
    [-68,  68, -46, -28, 225, 0x2d292c],
  ] as const) {
    addMass(M(x0), -1, M(farZ + dz0), M(x1), h, M(farZ + dz1), col, tone(col, 1.1), tone(col, 0.72));
  }
  smoke(c, [-26, 7.5, farZ - 8], { rate: 1.5, col: 0x4c4644 });
  smoke(c, [ 28, 7.2, farZ - 9], { rate: 1.4, col: 0x524b47 });

  const drawn = f.layout.drawn;
  if (!drawn) return;
  const B = frame(w, 0, 0, 0);
  const blocksExit = (side: 'left' | 'right', z: number) => {
    const ex = drawn[side];
    return !!ex && Math.abs(z - ex.z) < 4.2;
  };
  const checkEmpty = (X0: number, Z0: number, X1: number, Z1: number) => {
    for (let x = X0; x <= X1; x += 6) for (let z = Z0; z <= Z1; z += 6) {
      if (w.has(x, 8, z) || w.has(x, 20, z)) return false;
    }
    return true;
  };

  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'left' : 'right';
    const edgeX = side < 0 ? PLAY.x0 : PLAY.x1;
    // Two depth rows along Z flanking the whole room length
    const zCount = Math.max(2, Math.round((PLAY.z1 - PLAY.z0) / 8.5));
    for (let i = 0; i < zCount; i++) {
      const zc = PLAY.z0 + 3.2 + i * ((PLAY.z1 - PLAY.z0 - 5.2) / Math.max(1, zCount - 1));
      if (blocksExit(sideName, zc)) continue;
      const xc = edgeX + side * (5.8 + (i % 2) * 1.4);
      const cx = M(xc), cz = M(zc);
      const hw = 34, hd = 26;
      if (!checkEmpty(cx - hw, cz - hd, cx + hw, cz + hd)) continue;

      // Grounded stone & burnt brick terrace
      B(cx - hw - 2, -1, cz - hd - 2, cx + hw + 2, -1, cz + hd + 2, LY.ashD);
      B(cx - hw, 0, cz - hd, cx + hw, 5, cz + hd, style === 'mint' ? LY.brickD : LY.stoneD);
      B(cx - hw, 6, cz - hd, cx + hw, 6, cz + hd, style === 'mint' ? LY.charD : LY.stone);

      const U = up(B, 7);
      if (style === 'mint') {
        // Smelting annex + coal mound + iron-banded chimney silhouette
        U(cx - 24, 0, cz - 18, cx + 24, 40, cz + 14, LY.brickD);
        for (let y = 8; y < 40; y += 9) U(cx - 25, y, cz - 18, cx + 25, y + 1, cz + 14, LY.iron);
        hanRoof(U, cx - 28, cx + 10, cz - 22, cz + 18, 41, [[0, 4], [5, 4]], 1, { cut1: true });
        heap(U, cx + side * 14, cz + 16, 12, 8, 3, LY.slag, LY.charL);
      } else {
        // Towering half-collapsed Han imperial palace / ward ruin wing with peeling vermilion walls & charred columns!
        const H = 46 + (i % 2) * 12;
        palaceWall(U, cx - 28, cx + 28, cz - 18, cz - 14, H - 2, {
          seed: f.p.seed + i * 19 + (side > 0 ? 7 : 0),
          plaster: style === 'road' ? 0.9 : 0.72,
          drops: [[cx + 2, cx + 28, Math.max(14, H - 20)]],
        });
        for (const ox of [-22, 0, 22]) {
          const broken = ox === 22 || (i + (side > 0 ? 1 : 0)) % 2 === 1 && ox === 0;
          charPost(U, cx + ox, cz + 14, broken ? Math.round(H * 0.58) : H, { broken, charAt: 16 });
        }
        if (i % 2 === 0) {
          hanRoof(U, cx - 32, cx + 6, cz - 22, cz + 18, H + 1, [[0, 4], [5, 4], [5, 4]], 1, { cut1: true });
        } else {
          earthWall(U, cx - 26, cx + 24, cz + 12, cz + 16, 22, [[cx - 4, cx + 12, 10]]);
          rubble(U, cx + 4, cz + 2, 16, 10, 3, { beam: true });
        }
        if (r(90 + i + (side > 0 ? 13 : 0)) < 0.55) {
          smoke(c, [xc, 2.2, zc], { rate: 1.1, col: 0x544e4a });
        }
      }
      // Charred courtyard cypress/locust tree tucked outside the wing
      if (i % 2 === 1) {
        charTree(c, xc + side * 3.8, zc + 1.5, 5.2 + r(110 + i) * 1.8, 700 + i * 11 + (side > 0 ? 50 : 0), 0.25);
      }
    }
  }
}
