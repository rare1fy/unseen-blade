// 古寺的面片与氛围（temple 代理）：不用 dress() 的林地预设（枯草、荆棘、落叶堆不像有人打理的寺院），改成自己的：
// 苔地上的短草、石头和竹篱脚下的蕨、苔藓贴花、红枫树下和本堂基坛角落里成堆的落叶贴花（战斗区内不放）。
// 一种面片 = 一个 draw call，所以种类压到最少。
import type { Ctx } from '../scenes/stage';
import { addCardKind } from '../scenes/cards';
import { buildFlora } from '../scenes/flora';
import { ground } from '../scenes/dress';
import { M, hash, AREA, PLAY, inPlay } from '../scenes/props';
import { TC } from './temple_kit';

// ------------------------------------------------------------------ card kinds painted here
/** a drift of fallen maple leaves (32×32 decal): one solid pile in big blocks of three reds and an orange (it reads as a mass of colour,
 *  not as dots), its with two whole leaves lying apart from it */
addCardKind('momiji', { kind: 'decal', w: 32, h: 32 }, g => {
  const r = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const D = '#7a2216', M = '#a8301e', L = '#c8482a', O = '#d8702e';
  // the pile: nested wide rectangles (an irregular octagon), dark on the lower right, lit blocks on the upper left
  r(6, 8, 20, 16, M); r(3, 11, 26, 10, M); r(9, 5, 13, 22, M);
  r(9, 21, 17, 4, D); r(24, 12, 4, 9, D); r(12, 25, 9, 2, D);
  r(8, 9, 7, 4, L); r(16, 7, 5, 3, L); r(5, 13, 4, 4, L); r(18, 14, 6, 3, O); r(11, 16, 4, 3, O);
  // two whole leaves lying apart from the pile
  const LEAF = ['..1..', '11111', '.111.', '..2..'];
  for (const [ox, oy, c] of [[0, 3, L], [26, 25, O]] as const) LEAF.forEach((row, y) => { for (let x = 0; x < 5; x++) { if (row[x] === '.') continue; g.fillStyle = row[x] === '2' ? D : c; g.fillRect(ox + x, oy + y, 1, 1); } });
});
// ------------------------------------------------------------------ planting
type Rect = { x0: number; z0: number; x1: number; z1: number };
const MOSS = new Set<number>([TC.moss, TC.mossD, TC.mossL]);

export function templeDress(c: Ctx, o: { clear: Rect[]; seed?: number; drifts?: Array<[number, number, number, number]>; moss?: number[]; noAmbient?: boolean; noPlay?: boolean }) {
  buildFlora(c);
  const w = c.w, sd = o.seed ?? 7;
  const clear = (x: number, z: number) => o.clear.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const floorAt = (x: number, z: number) => w.get(M(x), -1, M(z))?.c;
  /** something 0.1–0.6 m tall stands within r metres (a rock, a lantern base, a hedge, a fence) */
  const near = (x: number, z: number, r: number) => { for (let a = 0; a < 8; a++) { const ax = x + Math.cos(a * 0.785) * r, az = z + Math.sin(a * 0.785) * r; if (w.has(M(ax), 2, M(az)) || w.has(M(ax), 6, M(az))) return true; } return false; };
  const plant = (kind: string, n: number, s: [number, number], want: (x: number, z: number) => boolean, op: { tints?: number[]; cluster?: number; spread?: number; colony?: boolean; area?: Rect } = {}) => {
    const ar = op.area ?? AREA, cl = op.cluster ?? 5, sp = op.spread ?? 0.5; let placed = 0, tries = 0;
    while (placed < n && tries < n * 40) {
      tries++;
      const cx = ar.x0 + hash(tries, sd, kind.length * 13 + 1) * (ar.x1 - ar.x0), cz = ar.z0 + hash(tries, sd, kind.length * 17 + 2) * (ar.z1 - ar.z0);
      if (inPlay(cx, cz) || clear(cx, cz) || !want(cx, cz)) continue;
      const t0 = op.tints?.[Math.floor(hash(tries, sd, 5) * op.tints.length)];
      for (let k = 0; k < cl && placed < n; k++) {
        const x = cx + (hash(tries, k, sd + 3) - 0.5) * sp * 2, z = cz + (hash(tries, k, sd + 4) - 0.5) * sp * 2;
        if (inPlay(x, z) || clear(x, z)) continue;
        const y = ground(c, x, z); if (y == null || y > 0.08) continue;
        c.cards.add(kind, x, z, { y, s: s[0] + hash(tries, k, 9) * (s[1] - s[0]), tint: op.colony ? t0 : op.tints?.[Math.floor(hash(tries, k, 6) * op.tints.length)] }); placed++;
      }
    }
  };
  const mossSet = o.moss ? new Set([...MOSS, ...o.moss]) : MOSS, onMoss = (x: number, z: number) => mossSet.has(floorAt(x, z) ?? 0);
  plant('grass', 300, [0.3, 0.5], onMoss, { tints: [0x9cac8c, 0x8c9c80, 0xa8b498], cluster: 7, spread: 0.6 });
  plant('grass', 90, [0.32, 0.5], (x, z) => near(x, z, 0.5), { tints: [0x98a888, 0xa4b094], cluster: 4, spread: 0.3 });
  plant('fern', 40, [0.5, 0.72], (x, z) => near(x, z, 0.6) && (x < -6 || x > 6.5 || z < -8), { tints: [0x8c9c80, 0x9cac8c], cluster: 3, spread: 0.45 });
  // flat decals: moss on the gravel edges and at lantern feet; maple leaves everywhere, sparse and small inside the battle floor
  let n = 0, t = 0;
  while (n < 22 && t < 900) { t++; const x = AREA.x0 + hash(t, sd, 31) * (AREA.x1 - AREA.x0), z = AREA.z0 + hash(t, sd, 32) * (AREA.z1 - AREA.z0); if (inPlay(x, z) || clear(x, z) || !near(x, z, 0.7)) continue; const y = ground(c, x, z); if (y == null || y > 0.05) continue; c.cards.add('mossdecal', x, z, { y, s: 0.6 + hash(t, 3) * 0.4, ry: Math.floor(hash(t, 4) * 4) * Math.PI / 2, tint: 0xd0dcc0 }); n++; }
  // maple leaves lie in a few drifts under the maples and in the corners by the hall's podium — whole piles, never a scatter
  const drifts: Array<[number, number, number, number]> = o.drifts ?? [[7.0, -6.4, 1.1, 1.3], [8.2, -7.6, 0.9, 1.0], [6.4, -8.0, 0.8, 0.8], [-6.2, 3.9, 0.9, 1.1], [-7.2, 4.9, 0.7, 0.8], [-2.6, -12.4, 0.9, 1.1], [-5.6, -8.4, 0.5, 0.8], [5.8, -8.5, 0.6, 0.7], [9.6, -0.6, 0.5, 0.7]];
  drifts.forEach(([x, z, s, sz], i) => { const y = ground(c, x, z); if (y == null || y > 0.05) return; c.cards.add('momiji', x, z, { y: y + 0.004 + i * 0.0005, s: s * 1.6, sx: sz, ry: Math.floor(hash(i, 6) * 4) * Math.PI / 2 }); });
  // atmosphere: maple leaves drifting down, a few warm motes near the lanterns, pale dust in the air
  if (o.noAmbient) return;
  c.ambient({ kind: 'leaves', color: 0xd8482a, rate: 2.6, area: { x0: -9, z0: -10, x1: 9, z1: 4 } });
  c.ambient({ kind: 'leaves', color: 0xe8902e, rate: 0.9, area: { x0: -9, z0: -10, x1: 9, z1: 4 } });
  c.ambient({ kind: 'fireflies', color: 0xffc070, rate: 0.6, area: { x0: -9, z0: -10, x1: 9, z1: -6 } });
  c.ambient({ kind: 'dust', color: 0xe8d8c8, rate: 2 });
}
