// 忍之章 · 竹山（wilds 代理）：山里的竹林与溪谷，荒野。没有铺好的参道和庭园：落叶土的踩踏小径（或一串踏石）、苔地、
// 湿岩、溪水、竹墙、杉树。地标三选一：瀑布 / 磐座（注连绳巨石）/ 山道石阶。道具组在 wilds_groups.ts，地标在 wilds_lm.ts，小件在 wilds_kit.ts。
import type { Ctx } from '../../scenes/stage';
import { M, hash, AREA, PLAY } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { MOSS_BY } from '../season';
import { tone } from '../../scenes/flora';
import type { Locale, Place, Rect, Layout, SeasonId } from '../types';
import { LANDMARKS } from './wilds_lm';
import { GROUPS, FILLER } from './wilds_groups';
import { WC, cedar, grove, crag, boxOf } from './wilds_kit';
import { ground } from '../../scenes/dress';

// ------------------------------------------------------------------ ground
/** the forest floor palette by season: [base, patch, patch light, track, track edge] */
const FLOOR: Record<SeasonId, [number, number, number, number, number]> = {
  spring: [0x3c5430, 0x4a6436, 0x587440, 0x5a4c38, 0x4a3e2e],
  summer: [0x34502c, 0x426030, 0x4e6e38, 0x54483a, 0x443a2e],
  autumn: [0x4a4a30, 0x5c5434, 0x6e603a, 0x5e4c34, 0x4a3c2a],
  winter: [0x6a7270, 0x7a827e, 0x8a928c, 0x5e5850, 0x4e4a44],
};
function floor(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, P = FLOOR[f.p.season], paths = f.layout.path, sd = f.p.seed, r = (k: number) => hash(sd, k, 71);
  const near = (q: Rect, x: number, z: number, m: number) => x > q.x0 - m && x < q.x1 + m && z > q.z0 - m && z < q.z1 + m;
  const X0 = M(AREA.x0 - 6), X1 = M(AREA.x1 + 6), Z0 = M(AREA.z0 - 8), Z1 = M(AREA.z1 + 4);
  const fill = (x0: number, z0: number, x1: number, z1: number, col: number) => { for (let X = Math.max(X0, M(x0)); X <= Math.min(X1, M(x1)); X++) for (let Z = Math.max(Z0, M(z0)); Z <= Math.min(Z1, M(z1)); Z++) w.set(X, -1, Z, col); };
  // 1) the moss: one base tone with big rectangular patches of two close tones (snapped to 0.28 m, never single cells)
  fill(AREA.x0 - 6, AREA.z0 - 8, AREA.x1 + 6, AREA.z1 + 4, P[0]);
  const snap = (v: number) => Math.round(v / 0.28) * 0.28;
  for (let i = 0; i < 46; i++) {
    const x = AREA.x0 - 4 + r(i) * (AREA.x1 - AREA.x0 + 8), z = AREA.z0 - 6 + r(100 + i) * (AREA.z1 - AREA.z0 + 9), hw = 0.5 + r(200 + i) * 1.3, hd = 0.4 + r(300 + i) * 0.9;
    fill(snap(x - hw), snap(z - hd), snap(x + hw), snap(z + hd), r(400 + i) < 0.7 ? P[1] : P[2]);
  }
  // 2) the clearing (battle floor): mostly moss, crossed by a worn earth trail that bends twice at right angles (front → middle →
  //    back, joining the layout's path at both ends). The trail is laid in big blocks of three earth tones (no edge lines), the moss
  //    bites into its sides in wide rectangular tongues, and a trodden lobe opens beside each bend.
  const E0 = P[3], E1 = tone(P[3], 1.1), E2 = tone(P[3], 0.88);
  const entry = (front: boolean) => { const q = paths.filter(t => front ? t.z1 > PLAY.z1 : t.z0 < PLAY.z0).sort((u, v) => (front ? v.z1 - u.z1 : u.z0 - v.z0))[0]; return q ? (q.x0 + q.x1) / 2 : 0; };
  const xF = entry(true), xB = entry(false), xM = Math.max(-2.4, Math.min(2.4, (r(700) - 0.5) * 4.8));
  const wF = snap(2.6 + r(701) * 0.6), wM = snap(3.2 + r(702) * 0.6), wB = snap(2.6 + r(703) * 0.6);
  const zb1 = snap(1.2 + r(704) * 1.6), zb2 = snap(-3.6 + r(705) * 1.4);
  const trail: Rect[] = [
    { x0: xF - wF / 2, x1: xF + wF / 2, z0: zb1 - wF / 2, z1: PLAY.z1 + 0.7 },
    { x0: Math.min(xF, xM) - wF / 2, x1: Math.max(xF, xM) + wF / 2, z0: zb1 - wF / 2, z1: zb1 + wF / 2 },
    { x0: xM - wM / 2, x1: xM + wM / 2, z0: zb2 - wB / 2, z1: zb1 + wF / 2 },
    { x0: Math.min(xM, xB) - wB / 2, x1: Math.max(xM, xB) + wB / 2, z0: zb2 - wB / 2, z1: zb2 + wB / 2 },
    { x0: xB - wB / 2, x1: xB + wB / 2, z0: PLAY.z0 - 0.7, z1: zb2 + wB / 2 },
  ];
  // lobes: a trodden patch on the outer side of each bend, and one where the enemy line stands
  const sideOf = (a: number, b: number) => (b >= a ? -1 : 1);
  trail.push({ x0: xF + sideOf(xF, xM) * (wF / 2) - 0.9, x1: xF + sideOf(xF, xM) * (wF / 2) + 0.9, z0: zb1 - 0.8, z1: zb1 + 1.0 });
  trail.push({ x0: xM + sideOf(xM, xB) * (wM / 2) - 1.0, x1: xM + sideOf(xM, xB) * (wM / 2) + 1.0, z0: zb2 - 0.9, z1: zb2 + 0.9 });
  trail.push({ x0: -3.0 + r(706) * 1.2, x1: 1.6 + r(707) * 1.4, z0: -3.2, z1: -1.4 });
  trail.forEach((q, i) => {
    // each piece in blocks of 1.1–1.7 m along its long side, tones by hash (never two dark blocks in a row)
    const along = q.z1 - q.z0 >= q.x1 - q.x0, L = along ? q.z1 - q.z0 : q.x1 - q.x0; let t = 0, k = 0, prev = 0;
    while (t < L - 0.01) {
      const len = Math.min(L - t, snap(1.1 + r(720 + i * 9 + k) * 0.6)), h = r(760 + i * 9 + k), tn = h < 0.5 ? 0 : h < 0.8 || prev === 2 ? 1 : 2;
      const col = tn === 0 ? E0 : tn === 1 ? E1 : E2; prev = tn;
      if (along) fill(q.x0, q.z0 + t, q.x1, q.z0 + t + len, col); else fill(q.x0 + t, q.z0, q.x0 + t + len, q.z1, col);
      t += len; k++;
    }
  });
  // moss tongues biting into the trail's long sides
  for (let i = 0; i < 10; i++) {
    const q = trail[[0, 2, 4, 2, 0, 2, 4, 1, 3, 2][i]], along = q.z1 - q.z0 >= q.x1 - q.x0, side = r(800 + i) < 0.5 ? -1 : 1;
    const d = snap(0.4 + r(810 + i) * 0.5), len = snap(0.9 + r(820 + i) * 1.1), t = r(830 + i);
    const col = r(840 + i) < 0.6 ? P[0] : P[1];
    if (along) { const z = q.z0 + t * (q.z1 - q.z0), x = side < 0 ? q.x0 : q.x1; fill(side < 0 ? x - 0.3 : x - d, z - len / 2, side < 0 ? x + d : x + 0.3, z + len / 2, col); }
    else { const x = q.x0 + t * (q.x1 - q.x0), z = side < 0 ? q.z0 : q.z1; fill(x - len / 2, side < 0 ? z - 0.3 : z - d, x + len / 2, side < 0 ? z + d : z + 0.3, col); }
  }
  // 3) the track: a line of big stepping stones along the path, or a worn earth band with a darker edge (by seed)
  const stones = f.p.rnd(5) < 0.5;
  for (const q of paths) {
    if (stones) {
      const along = q.z1 - q.z0 >= q.x1 - q.x0, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2, L = along ? q.z1 - q.z0 : q.x1 - q.x0, n = Math.max(1, Math.floor(L / 0.95));
      for (let i = 0; i < n; i++) {
        const t = (along ? q.z0 : q.x0) + (i + 0.5) * L / n, o = ((i & 1) ? 0.18 : -0.18) * (r(600 + i) < 0.5 ? 1 : -1), hw = 0.34 + r(610 + i) * 0.1, hd = 0.24 + r(620 + i) * 0.06;
        const [x, z] = along ? [cx + o, t] : [t, cz + o], [a, b] = along ? [hw, hd] : [hd, hw];
        if (Math.abs(x) < 5.4 && z > PLAY.z0 && z < PLAY.z1) continue;   // the clearing itself is open ground
        fill(snap(x - a) - 0.07, snap(z - b) - 0.07, snap(x + a) + 0.07, snap(z + b) + 0.07, WC.rockD); fill(snap(x - a), snap(z - b), snap(x + a), snap(z + b), WC.rockL);
      }
    } else {
      // the worn band: the same earth blocks as the trail, no edge tone (an outline reads as a court marking)
      const along = q.z1 - q.z0 >= q.x1 - q.x0, L = along ? q.z1 - q.z0 : q.x1 - q.x0; let t = 0, k = 0;
      while (t < L - 0.01) { const len = Math.min(L - t, snap(1.1 + r(900 + k) * 0.6)), col = r(940 + k) < 0.6 ? E0 : E1; if (along) fill(q.x0, q.z0 + t, q.x1, q.z0 + t + len, col); else fill(q.x0 + t, q.z0, q.x0 + t + len, q.z1, col); t += len; k++; }
    }
  }
  void near;
}

// ------------------------------------------------------------------ far ring: a bamboo wall on the open side(s), cedars, rock outcrops
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, r = f.p.rnd, sd = f.p.seed, lm = f.layout.landmark;
  // which side gets the dense bamboo wall (the other gets cedars): by seed; both get a back row
  const bambooSide = r(301) < 0.5 ? -1 : 1;
  for (const s of [-1, 1] as const) {
    if (s === bambooSide) grove(c, s < 0 ? -15.4 : 13.4, -13.5, s < 0 ? -13.4 : 15.4, 6.5, 30, sd + 40, [6.6, 9.0]);
    else for (let i = 0; i < 7; i++) cedar(w, s * (14.2 + (i % 2) * 1.6), -12.5 + i * 2.9, 9 + r(310 + i) * 3, sd + 50 + i);
  }
  // back: cedars behind the landmark, a bamboo stand in each gap
  for (let i = 0; i < 9; i++) {
    const x = -15 + i * 3.7 + (i % 2) * 0.8, z = -19.5 - (i % 2) * 1.6;
    if (lm && Math.abs(x - lm.x) < lm.w / 2 - 0.5 && r(330 + i) < 0.3) continue;
    if ((i + sd) % 3 === 1) grove(c, x - 1.0, z - 1.0, x + 1.0, z + 1.0, 8, sd + 60 + i, [7.5, 10]); else cedar(w, x, z, 10 + r(320 + i) * 3, sd + 70 + i);
  }
  // two mossy outcrops at the back corners
  const B = boxOf(w);
  crag(B, M(-13.5), M(-16), [[34, 22, 26, 0, 0], [26, 16, 22, 2, -2], [16, 10, 14, 4, -3]], WC.moss);
  crag(B, M(13.8), M(-16.5), [[30, 20, 22, 0, 0], [22, 14, 18, -2, -2]], WC.moss);
}

// ------------------------------------------------------------------ dressing: grass and ferns on the moss, litter on the earth
function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  const w = c.w, sd = f.p.seed, se = f.p.season, P = FLOOR[se];
  const clear = (x: number, z: number) => f.clear.some(r => x > r.x0 - 0.2 && x < r.x1 + 0.2 && z > r.z0 - 0.2 && z < r.z1 + 0.2);
  const inPlayG = (x: number, z: number) => x > PLAY.x0 - 0.4 && x < PLAY.x1 + 0.4 && z > PLAY.z0 - 0.4 && z < PLAY.z1 + 0.4;
  const mossy = new Set([P[0], P[1], P[2], ...MOSS_BY[se]]);
  const at = (x: number, z: number) => w.get(M(x), -1, M(z))?.c;
  const GRASS = se === 'autumn' ? [0xc0b080, 0xb0a070] : se === 'winter' ? [0xa8b0a8, 0x98a098] : [0x9cb088, 0x8ca078, 0xa8b894];
  const FERN = se === 'autumn' ? [0xc0aa70, 0xb09a60] : se === 'winter' ? [0x98a294, 0x8a948a] : [0x94b080, 0xa0bc8c];
  const plant = (kind: string, n: number, s: [number, number], want: (x: number, z: number) => boolean, tints: number[], cl = 6, sp = 0.5) => {
    let placed = 0, tries = 0;
    while (placed < n && tries < n * 30) {
      tries++;
      const cx = AREA.x0 - 1 + hash(tries, sd, kind.length * 13 + 1) * (AREA.x1 - AREA.x0 + 2), cz = AREA.z0 + hash(tries, sd, kind.length * 17 + 2) * (AREA.z1 - AREA.z0);
      if (inPlayG(cx, cz) || clear(cx, cz) || !want(cx, cz)) continue;
      for (let k = 0; k < cl && placed < n; k++) {
        const x = cx + (hash(tries, k, sd + 3) - 0.5) * sp * 2, z = cz + (hash(tries, k, sd + 4) - 0.5) * sp * 2;
        if (inPlayG(x, z) || clear(x, z) || z > 7.2) continue;
        const y = ground(c, x, z); if (y == null || y > 0.08) continue;
        c.cards.add(kind, x, z, { y, s: s[0] + hash(tries, k, 9) * (s[1] - s[0]), tint: tints[Math.floor(hash(tries, k, 6) * tints.length)] }); placed++;
      }
    }
  };
  plant('grass', 320, [0.3, 0.52], (x, z) => mossy.has(at(x, z) ?? 0), GRASS, 8, 0.6);
  plant('fern', 70, [0.5, 0.75], (x, z) => mossy.has(at(x, z) ?? 0) && (Math.abs(x) > 6.2 || z < -7.2), FERN, 3, 0.5);
  plant('tallgrass', 50, [0.45, 0.7], (x, z) => mossy.has(at(x, z) ?? 0) && Math.abs(x) > 6.4 && z < 6, GRASS, 4, 0.4);
  // a soft feathered edge of short grass round the clearing, and leaf litter decals in the clearing (flat)
  for (let i = 0; i < 26; i++) { const t = i / 26, side = i % 2 ? 1 : -1, x = side * (PLAY.x1 + 0.1 + hash(i, sd, 41) * 0.4), z = PLAY.z0 + t * (PLAY.z1 - PLAY.z0); const y = ground(c, x, z); if (y != null && y < 0.05 && !clear(x, z)) c.cards.add('grass', x, z, { y, s: 0.28 + hash(i, 2) * 0.12, tint: GRASS[i % GRASS.length] }); }
  // the air: a mountain haze of pale motes, a few drifting leaves (green bamboo leaves outside autumn), fox-blue motes at night
  c.ambient({ kind: 'dust', color: 0xe0ece4, rate: 1.4 });
  if (se !== 'winter') c.ambient({ kind: 'leaves', color: se === 'autumn' ? 0xd8902e : 0x8aa850, rate: se === 'autumn' ? 1.2 : 0.8, area: { x0: -11, z0: -11, x1: 11, z1: 2 } });
  if (f.p.time === 'night' || f.p.time === 'dusk') c.ambient({ kind: 'fireflies', color: 0x9fe4ff, rate: 0.5, area: { x0: -10, z0: -11, x1: 10, z1: -6 } });
}

export const wilds: Locale = {
  id: 'ninja_wilds', name: '竹山', theme: 'ninja',
  layouts: ['axis', 'offset', 'ridge'],
  landmarks: LANDMARKS, groups: GROUPS, filler: FILLER,
  floor, far, dress,
};
