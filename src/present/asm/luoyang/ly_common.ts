// 第二关 · 洛阳余烬：三个地点共用的小件道具组、填空件、地面贴花和撒灰撒火星。每个地点用自己的 id 前缀各拿一份
// （stats 里分开统计，三个地点的近排矮件都从这里出，保证同一关的近景是一套东西）。大件和地标各在自己的文件里，三处要彼此不同。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, hash, inPlay, field, SX, SZ } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { addCardKind } from '../../scenes/cards';
import { ground } from '../../scenes/dress';
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

// ------------------------------------------------------------------ the ground's cards: ash drifts and scorch marks (flat, square-cut)
addCardKind('lyash', { kind: 'decal', w: 32, h: 32 }, g => {
  const r = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  r(4, 11, 22, 10, '#8e8880'); r(9, 6, 13, 20, '#8e8880'); r(20, 14, 9, 10, '#8e8880');
  r(10, 12, 10, 8, '#a09a92'); r(14, 9, 5, 4, '#a09a92');
});
addCardKind('lyscorch', { kind: 'decal', w: 32, h: 32 }, g => {
  const r = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  r(3, 12, 26, 9, '#2e2926'); r(7, 7, 16, 18, '#2e2926'); r(18, 5, 8, 8, '#2e2926'); r(5, 20, 9, 7, '#2e2926');
  r(9, 12, 12, 8, '#221e1c'); r(12, 9, 6, 4, '#221e1c');
});

/** pave helper: x, z (m) of a cell */
export const cm = (X: number) => (X + 0.5) * 0.07;
/** loose bricks lying in the ash: whole 4-cell bricks on a 4-cell grid, one in ~50 (never single cells) */
export const looseBrick = (X: number, Z: number, sd: number) => { const gx = Math.floor(X / 4), gz = Math.floor(Z / 4); return hash(gx, gz, 77 + sd) < 0.018 ? (hash(gx, gz, 91) < 0.5 ? LY.brick : LY.brickD) : null; };

/** a paving: units n × m cells (x × z) with a one-cell joint on their far edges (joint null = no joints: packed earth in whole
 *  blocks), colours picked per whole unit; bond = every other row shifted half a unit (running bond); gone = share of units fallen
 *  to ash (whole units) */
export interface Paving { n: number; m?: number; joint: number | null; tones: number[]; bond?: boolean; gone?: number; goneCol?: number }
const paveAt = (X: number, Z: number, P: Paving, salt: number) => {
  const m = P.m ?? P.n, row = Math.floor(Z / m), lz = Z - row * m, sx = X + (P.bond && (row & 1) ? Math.floor(P.n / 2) : 0), col = Math.floor(sx / P.n), lx = sx - col * P.n;
  if (P.joint != null && (lx === P.n - 1 || lz === m - 1)) return P.joint;
  const h = hash(col, row, salt);
  if (P.gone && h < P.gone) return P.goneCol ?? LY.ash;
  return P.tones[Math.floor(hash(col, row, salt + 5) * P.tones.length) % P.tones.length];
};
/**
 * The ground of a 洛阳 place over the whole 2x stage: the battle floor and a strip round it in `court` paving (burnt square brick,
 * flagstones…), the layout's walkways in `path` paving with a stone kerb, a stone edge round the court, and outside ash and scorched
 * earth in big blocks (3-cell blocks, field-thresholded: no speckle) with a few whole loose bricks.
 */
export function lyFloor(c: Ctx, f: { layout: Layout; p: Place }, o: { court: Paving; path: Paving; outer: [number, number, number, number]; kerb?: number; over?: (x: number, z: number) => Paving | number | null }) {
  const w = c.w, paths = f.layout.path, court = f.layout.court, sd = f.p.seed % 7, kerbC = o.kerb ?? LY.stoneD;
  const near = (r: Rect, x: number, z: number, mg: number) => x > r.x0 - mg && x < r.x1 + mg && z > r.z0 - mg && z < r.z1 + mg;
  const CX0 = SX(-7.0), CX1 = SX(7.2), CZ0 = SZ(-9.4), CZ1 = SZ(7.0);
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL; let col: number;
    const onPath = paths.some(r => near(r, x, z, 0)), ov = onPath ? null : o.over?.(x, z) ?? null, kerb = !onPath && ov == null && paths.some(r => near(r, x, z, 0.14));
    const inCourt = (court && near(court, x, z, 0)) || (x > CX0 && x < CX1 && z > CZ0 && z < CZ1);
    const edge = !inCourt && x > CX0 - 0.21 && x < CX1 + 0.21 && z > CZ0 - 0.21 && z < CZ1 + 0.21;
    if (onPath) col = paveAt(X, Z, o.path, 13 + sd);
    else if (ov != null) col = typeof ov === 'number' ? ov : paveAt(X, Z, ov, ov === o.path ? 13 + sd : 47 + sd);
    else if (kerb || edge) col = kerbC;
    else if (inCourt) col = paveAt(X, Z, o.court, 31 + sd);
    else {
      const n = field(Math.floor(X / 3) / 4, Math.floor(Z / 3) / 4, sd + 2);
      col = looseBrick(X, Z, sd) ?? (n > 0.9 ? o.outer[3] : n > 0.15 ? o.outer[0] : n > -0.55 ? o.outer[1] : o.outer[2]);
    }
    w.set(X, -1, Z, col);
  }
}

/**
 * The common dressing: ash drifts and scorch marks (off the walkways; the scorch also on the battle floor, it is flat), embers rising
 * over the back where the fires are, ash drifting everywhere. o.embers = rate at dusk / night (a third of it by day).
 */
export function lyDress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }, o: { ash?: number; scorch?: number; playScorch?: number; embers?: number; ashCol?: number; emberArea?: Rect } = {}) {
  const sd = f.p.seed, night = f.p.time === 'dusk' || f.p.time === 'night';
  const clear = (x: number, z: number) => f.clear.some(r => x > r.x0 - 0.3 && x < r.x1 + 0.3 && z > r.z0 - 0.3 && z < r.z1 + 0.3);
  const deco = (kind: string, n: number, s: [number, number], inside: boolean, salt: number, tints: number[]) => {
    let k = 0, q = 0;
    while (k < n && q < n * 40) {
      q++; const x = AREA.x0 - 2 + hash(q, sd, salt) * (AREA.x1 - AREA.x0 + 4), z = AREA.z0 - 3 + hash(q, sd, salt + 1) * (AREA.z1 - AREA.z0 + 2);
      if (inPlay(x, z) !== inside || clear(x, z)) continue;
      const y = ground(c, x, z); if (y == null || y > 0.05) continue;
      c.cards.add(kind, x, z, { y: y + 0.004 + k * 0.0003, s: s[0] + hash(q, 3, salt) * (s[1] - s[0]), ry: Math.floor(hash(q, 4, salt) * 4) * Math.PI / 2, tint: tints[Math.floor(hash(q, 5, salt) * tints.length)] }); k++;
    }
  };
  deco('lyash', o.ash ?? 26, [0.5, 1.0], false, 40, [0xffffff, 0xe8e4de, 0xd8d2ca]);
  deco('lyscorch', o.scorch ?? 14, [0.5, 0.9], false, 50, [0xffffff, 0xe0dcd8]);
  deco('lyscorch', o.playScorch ?? 6, [0.6, 1.1], true, 60, [0xffffff]);
  const ea = o.emberArea ?? { x0: AREA.x0, z0: AREA.z0 - 6, x1: AREA.x1, z1: AREA.z0 + 6 };
  c.ambient({ kind: 'embers', color: 0xff8a3a, rate: (o.embers ?? 1.6) * (night ? 1 : 0.35), area: ea });
  c.ambient({ kind: 'embers', color: 0xffa050, rate: night ? 0.5 : 0.15 });
  c.ambient({ kind: 'dust', color: o.ashCol ?? 0x9a948c, rate: 2.2 });
}
