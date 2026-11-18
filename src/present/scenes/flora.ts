// Vegetation on the block grid: dark pines with drooping skirts, twisted haunted dead trees, old broadleaf oaks, bushes, stumps,
// logs, mushrooms, and the layered wall of woods that frames most outdoor stages. House rules as in props.ts: axis-aligned masses,
// tapering by a few wide tiers (never a diagonal stair-step), no random speckle; two or three tones per mass (lit cap, body, dark
// hem). Where a tree meets the ground (flare, roots) it is written into the voxel world; trunks, limbs and leaf masses are recorded
// as block prisms in this world's plot and built by buildFlora() (called from dress()) into one mesh with the same bevelled block
// material — a few dozen faces per tree instead of thousands of cells — plus cut-out leaf skins and drip fringes over every leaf
// mass (the leaf-block read of MCD's woods) and the moss / vines that hang from limbs and crowns.
import * as THREE from 'three';
import { type Ctx } from './stage';
import { M, hash, AREA, PLAY, type W } from './props';
import { BARK, BARK_D, PINE, PINE_T, MOSS_D } from './common';
import { voxToon } from '../look/voxkit';
import { CELL } from '../bestiary/kit';

// ------------------------------------------------------------------ the plot: what trees leave for buildFlora() on each voxel world
export type LeafStyle = 'leaf' | 'needle';
/**
 * A block prism (cells, inclusive bounds) with its four corners cut by cx × cz blocks (0 = a plain box): the plan of a plus.
 * Colours: top face, sides (shading darker toward the foot), the dark band of `band` blocks along the foot, and the underside.
 */
export interface Mass {
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; cx: number; cz: number;
  top: number; side: number; low: number; band: number;
  /** cut-out leaf skin over its faces, and a drip fringe under its edges */
  skin?: LeafStyle; drip?: boolean;
}
/** a card to hang (moss under a limb, a vine from a crown): metres; ry = which way the card faces */
export interface HangMark { kind: string; x: number; y: number; z: number; ry: number; s: number; tint?: number }
export interface RingOpt {
  /** areas (metres) where the ring plants nothing */
  keep?: Array<{ x0: number; z0: number; x1: number; z1: number }>;
  /** foliage tone override for the whole ring (e.g. a sicker green) */
  leaf?: number;
}
interface Plot { masses: Mass[]; built: number; hangs: HangMark[]; hung: number; rings: Array<{ seed: number; dense: number; o: RingOpt }>; planted: boolean }
const PLOTS = new WeakMap<W, Plot>();
export function plot(w: W): Plot { let p = PLOTS.get(w); if (!p) PLOTS.set(w, (p = { masses: [], built: 0, hangs: [], hung: 0, rings: [], planted: false })); return p; }

/** scale a colour's brightness */
export const tone = (c: number, k: number) => {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};
type MassOpt = Partial<Pick<Mass, 'cx' | 'cz' | 'top' | 'low' | 'band' | 'skin' | 'drip'>>;
/** record a prism; bounds in any order */
function mass(w: W, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, side: number, o: MassOpt = {}) {
  const m: Mass = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), cx: o.cx ?? 0, cz: o.cz ?? 0, top: o.top ?? tone(side, 1.12), side, low: o.low ?? tone(side, 0.7), band: o.band ?? 0, skin: o.skin, drip: o.drip };
  plot(w).masses.push(m); return m;
}
/** a plus-shaped leaf mass: centre, half-reach of the arms (ax, az) and half-width of an arm (k) */
function plus(w: W, cx: number, cz: number, ax: number, az: number, k: number, y0: number, y1: number, side: number, o: MassOpt = {}) {
  return mass(w, cx - ax, y0, cz - az, cx + ax, y1, cz + az, side, { cx: Math.max(0, ax - k), cz: Math.max(0, az - k), ...o });
}
/** a bark run between two cells (inclusive), `r` blocks either side of the line, h blocks tall from y */
function limb(w: W, x0: number, z0: number, x1: number, z1: number, y: number, h: number, r: number, bark: number) {
  return mass(w, Math.min(x0, x1) - r, y, Math.min(z0, z1) - r, Math.max(x0, x1) + r, y + h, Math.max(z0, z1) + r, bark, { top: tone(bark, 1.08), low: tone(bark, 0.78) });
}
const DIR4: Array<[number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];
/** the four directions in a seeded order */
const dirs = (s: number) => { const d = DIR4.slice(), r = Math.floor(hash(s, 91) * 4), flip = hash(s, 92) < 0.5; const o = d.slice(r).concat(d.slice(0, r)); return flip ? [o[0], o[3], o[2], o[1]] : o; };

/** where a trunk meets the ground (voxel world, so it shades into the floor): two or three wide tiers, then roots that run out over
 *  the ground, turn at a right angle and sink in */
function flare(w: W, X: number, Z: number, tr: number, bark: number, dark: number, s: number, tiers: number, nRoots: number, mossTop = MOSS_D) {
  w.box(X - tr - 4, -2, Z - tr - 1, X + tr + 4, 1, Z + tr + 1, dark).box(X - tr - 1, -2, Z - tr - 4, X + tr + 1, 1, Z + tr + 4, dark);
  w.box(X - tr - 2, -2, Z - tr - 2, X + tr + 2, 4, Z + tr + 2, bark);
  if (tiers > 2) w.box(X - tr - 1, 5, Z - tr - 1, X + tr + 1, 8, Z + tr + 1, bark);
  const D = dirs(s);
  for (let i = 0; i < nRoots; i++) {
    const [dx, dz] = D[i % 4], lat = i >= 4 ? (hash(s, i, 3) < 0.5 ? -tr : tr) : Math.round((hash(s, i, 4) - 0.5) * tr), L = tr + 6 + Math.floor(hash(s, i, 5) * 6), L1 = Math.round(L * 0.65);
    const [px, pz] = [-dz, dx], turn = hash(s, i, 6) < 0.5 ? -1 : 1, rw = tr >= 3 ? 1 : 0;
    const ox = X + px * lat, oz = Z + pz * lat, ex = ox + dx * L1, ez = oz + dz * L1;
    w.box(Math.min(ox, ex) - (dz ? rw : 0), -1, Math.min(oz, ez) - (dx ? rw : 0), Math.max(ox, ex) + (dz ? rw : 0), 1, Math.max(oz, ez) + (dx ? rw : 0), dark);
    if (hash(s, i, 7) < 0.4) w.box(Math.min(ox, ex) - (dz ? rw : 0), 1, Math.min(oz, ez) - (dx ? rw : 0), Math.max(ox, ex) + (dz ? rw : 0), 1, Math.max(oz, ez) + (dx ? rw : 0), mossTop);
    const tx = ex + px * turn * 4, tz = ez + pz * turn * 4;
    w.box(Math.min(ex, tx), -1, Math.min(ez, tz), Math.max(ex, tx), 0, Math.max(ez, tz), dark);
    const fx = tx + dx * (L - L1), fz = tz + dz * (L - L1);
    w.box(Math.min(tx, fx), -1, Math.min(tz, fz), Math.max(tx, fx), -1 + (L - L1 > 3 ? 1 : 0), Math.max(tz, fz), dark);
  }
}
/** a trunk: a bark prism from the flare up, with darker vertical furrows on its faces (structure, not speckle) */
function trunk(w: W, X: number, Z: number, tr: number, y0: number, y1: number, bark: number, dark: number) {
  mass(w, X - tr, y0, Z - tr, X + tr, y1, Z + tr, bark, { top: tone(bark, 1.08), low: tone(bark, 0.74) });
  if (tr >= 3) {
    // two furrows per face, one block deep in colour (a thin darker prism standing proud by a hair would z-fight, so they sit on
    // the face as their own half-block-thick plates)
    const f = (x0: number, z0: number, x1: number, z1: number, a: number, b: number) => mass(w, x0, a, z0, x1, b, z1, dark, { top: dark, low: tone(dark, 0.8) });
    const a = y0 + 2, b = Math.round(y0 + (y1 - y0) * 0.7);
    f(X - 1, Z + tr + 1, X - 1, Z + tr + 1, a, b); f(X + 2, Z + tr + 1, X + 2, Z + tr + 1, a + 4, b - 6);
    f(X + tr + 1, Z - 2, X + tr + 1, Z - 2, a + 2, b - 3); f(X - tr - 1, Z + 1, X - tr - 1, Z + 1, a, b - 8);
  }
}

// ------------------------------------------------------------------ trees
/**
 * A dark pine: a thick trunk on a stepped root flare, and a cone of stacked tiers. Each tier steps in three times (wide hem with a
 * dark band, a middle step, a lit crown step) and the next tier overhangs the one below, so the silhouette is a sawtooth of
 * boughs — wide steps, never a sloping stair. Tiers sit a little off-centre and alternate their long axis.
 */
export function pine(w: W, x: number, z: number, h: number, trunkC: number, leaf: number, leafTop: number, o: { seed?: number; tiers?: number; slim?: number; base?: number } = {}) {
  const X = M(x), Z = M(z), H = M(h), s = o.seed ?? Math.floor(hash(X, Z, 41) * 9973), hem = tone(leaf, 0.6), big = h >= 7.5, sl = o.slim ?? 1;
  const tr = big ? 3 : 2;
  flare(w, X, Z, tr, trunkC, tone(trunkC, 0.72), s, big ? 3 : 2, big ? 4 : 3);
  const y0 = Math.round(H * (o.base ?? 0.16)), yTop = Math.round(H * 0.92);
  trunk(w, X, Z, tr, 2, y0 + 6, trunkC, tone(trunkC, 0.7));
  const n = o.tiers ?? (h >= 8 ? 5 : h >= 5.5 ? 4 : 3), Ht = (yTop - y0) / (1 + 0.72 * (n - 1)), R0 = H * 0.19 * sl, mid = tone(leaf, 1.12);
  let cx = X, cz = Z;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0, r = Math.max(4, Math.round(R0 * (1 - 0.6 * t))), b = Math.round(y0 + i * 0.72 * Ht);
    if (i > 0) { cx = X + Math.round((hash(s, i, 1) - 0.5) * 3); cz = Z + Math.round((hash(s, i, 2) - 0.5) * 3); }
    const long = (i + s) % 2 === 0, e1 = b + Math.round(Ht * 0.4), e2 = b + Math.round(Ht * 0.7), e3 = b + Math.round(Ht) - 1;
    const step = (rr: number, y0s: number, y1s: number, c: number, o2: MassOpt) => { const ax = rr + (long ? 1 : 0), az = rr + (long ? 0 : 1); plus(w, cx, cz, ax, az, Math.max(1, Math.round(rr * 0.6)), y0s, y1s, c, { skin: 'needle', ...o2 }); };
    step(r, b, e1, leaf, { top: mid, low: hem, band: 2 });
    step(Math.max(3, Math.round(r * 0.68)), e1 + 1, e2, tone(leaf, 1.04), { top: tone(leafTop, 0.95), low: leaf });
    step(Math.max(2, Math.round(r * 0.4)), e2 + 1, e3, leafTop, { top: tone(leafTop, 1.12), low: leaf });
  }
  // the spire
  mass(w, cx - 1, yTop, cz - 1, cx + 1, yTop + 6, cz + 1, leafTop, { top: tone(leafTop, 1.2), skin: 'needle' });
  mass(w, cx, yTop + 7, cz, cx, yTop + 10, cz, leafTop, { top: tone(leafTop, 1.2) });
}

/**
 * A twisted, haunted dead tree (the Duskwood kind): a stepped root flare, a bare trunk that climbs in three straight runs joined by
 * two sideways knees (right-angle kinks, never a slope), a dark hollow facing the camera, and four or five limbs bent at right
 * angles — out, up, across, then a twig that rises or hooks down like a claw — with side twigs and one limb snapped off short.
 * Dead vines (or moss) hang from some limbs; a crow sometimes sits on one.
 */
export function deadTree(w: W, x: number, z: number, h: number, bark: number, dark: number, o: { seed?: number; leaves?: number; leavesTop?: number; moss?: boolean | number; hang?: 'deadvine' | 'moss'; crow?: number } = {}) {
  const X = M(x), Z = M(z), T = M(h), s = o.seed ?? 1, tr = h >= 5.5 ? 3 : 2, p = plot(w);
  flare(w, X, Z, tr, bark, dark, s, 3, h >= 5.5 ? 5 : 4);
  const D = dirs(s + 7), [kx, kz] = D[0], k1 = Math.round(T * 0.26), ur = Math.max(2, tr - 1), k2 = Math.round(T * 0.48), k3 = Math.round(T * 0.7);
  // the lower trunk is blocks (it carries the hollow), the rest is prisms
  w.box(X - tr, 0, Z - tr, X + tr, k1 + tr + 1, Z + tr, bark);
  if (tr >= 3) { const hy = Math.round(T * 0.08) + 2; w.box(X - 2, hy - 1, Z + tr - 2, X + 2, hy + 6, Z + tr - 1, 0x120c10).box(X - 1, hy, Z + tr - 1, X + 1, hy + 4, Z + tr, null).box(X - 2, hy + 6, Z + tr, X + 2, hy + 6, Z + tr, dark); }
  // two knees: the middle run steps off one way, the top run steps off the other
  const mx0 = X + kx * (tr - ur + 1), mz0 = Z + kz * (tr - ur + 1);
  trunk(w, mx0, mz0, ur, k1, k2, bark, dark);
  limb(w, X, Z, mx0, mz0, k1 + tr + 2, 1, ur, dark);
  const [qx, qz] = D[1], vr = Math.max(1, ur - 1), ux = mx0 + qx * (ur - vr + 2), uz = mz0 + qz * (ur - vr + 2);
  trunk(w, ux, uz, vr, k2 - 2, k3, bark, dark);
  limb(w, mx0, mz0, ux, uz, k2 - 3, 1, vr, dark);
  const hk = o.hang ?? 'deadvine', hangK = o.moss === false ? 0 : typeof o.moss === 'number' ? o.moss : 0.55;
  // the leader keeps climbing, narrowing, and forks at the top into two claws
  const lr = Math.max(0, vr - 1);
  limb(w, ux, uz, ux, uz, k3, T - k3 - 5, lr, bark);
  for (const [fx, fz, fl, up] of [[D[2][0], D[2][1], 7, 1], [D[0][0], D[0][1], 5, -1]] as const) {
    const ex = ux + fx * fl, ez = uz + fz * fl;
    limb(w, ux, uz, ex, ez, T - 7, 1, 0, bark);
    if (up > 0) limb(w, ex, ez, ex, ez, T - 6, 8, 0, dark); else { limb(w, ex, ez, ex, ez, T - 5, 4, 0, dark); limb(w, ex, ez, ex + fx * 3, ez + fz * 3, T - 1, 0, 0, dark); limb(w, ex + fx * 3, ez + fz * 3, ex + fx * 3, ez + fz * 3, T - 3, 2, 0, dark); }
  }
  // limbs: out, up, across, then a twig that rises or hooks down; the third one is snapped off short
  const tips: Array<[number, number, number]> = [], perches: Array<[number, number, number, number, number]> = [];
  const nL = h >= 5.5 ? 5 : 4;
  for (let i = 0; i < nL; i++) {
    const [dx, dz] = D[i % 4], low = i < 2, ox = low ? mx0 : ux, oz = low ? mz0 : uz, r0 = low ? ur : vr;
    const yb = Math.round(T * (0.34 + i * 0.075)), L1 = Math.round(T * (0.14 + hash(s, i, 7) * 0.12)) + r0, V1 = Math.round(T * (0.07 + hash(s, i, 8) * 0.1));
    const lw = tr >= 3 && low ? 1 : 0, ex = ox + dx * L1, ez = oz + dz * L1;
    if (i === 2) {   // a snapped limb: a thick stub with a ragged end of two lengths
      const sx = ox + dx * Math.round(L1 * 0.45), sz = oz + dz * Math.round(L1 * 0.45);
      limb(w, ox, oz, sx, sz, yb, 2, 1, bark); limb(w, sx, sz, sx + dx * 2, sz + dz * 2, yb + 1, 1, 0, dark);
      continue;
    }
    limb(w, ox, oz, ex, ez, yb, 1 + lw, lw, bark);
    limb(w, ex, ez, ex, ez, yb, V1, lw, bark);
    const [px, pz] = hash(s, i, 9) < 0.5 ? [-dz, dx] : [dz, -dx], L2 = 6 + Math.floor(hash(s, i, 10) * 7), yt = yb + V1, bx = ex + px * L2, bz = ez + pz * L2, fx = bx + dx * 4, fz = bz + dz * 4;
    limb(w, ex, ez, bx, bz, yt - 1, 1, 0, bark);
    limb(w, bx, bz, fx, fz, yt, 0, 0, dark);
    if (hash(s, i, 11) < 0.5) limb(w, fx, fz, fx, fz, yt + 1, 4 + Math.floor(hash(s, i, 12) * 5), 0, dark);
    else { limb(w, fx, fz, fx, fz, yt - 5, 4, 0, dark); limb(w, fx, fz, fx + dx * 2, fz + dz * 2, yt - 5, 0, 0, dark); }
    // side twigs off the first run: one rising, one reaching out and up
    const mx = ox + dx * Math.round(L1 * 0.55), mz = oz + dz * Math.round(L1 * 0.55), q2x = mx - px * 5, q2z = mz - pz * 5;
    limb(w, mx, mz, mx, mz, yb + 2 + lw, 4 + Math.floor(hash(s, i, 13) * 5), 0, dark);
    if (hash(s, i, 16) < 0.7) { limb(w, mx, mz, q2x, q2z, yb + 1, 0, 0, dark); limb(w, q2x, q2z, q2x, q2z, yb + 2, 4, 0, dark); }
    tips.push([fx, yt, fz]);
    perches.push([(ex + bx) / 2, yt, (ez + bz) / 2, dx, dz]);
    if (hash(s, i, 14) < hangK) p.hangs.push({ kind: hk, x: (ox + dx * L1 * 0.75 + 0.5) * CELL, y: yb * CELL, z: (oz + dz * L1 * 0.75 + 0.5) * CELL, ry: dx ? 0 : Math.PI / 2, s: (hk === 'moss' ? 0.34 : 0.3) + hash(s, i, 15) * 0.24, tint: hk === 'moss' ? 0x9aa890 : 0xc8c0b8 });
  }
  // a crow on the across-run of one limb
  if (perches.length && hash(s, 61) < (o.crow ?? 0.3)) { const [cx, cy, cz] = perches[Math.floor(hash(s, 62) * perches.length)]; crowAt(p, (cx + 0.5) * CELL, (cy + 1) * CELL, (cz + 0.5) * CELL, s); }
  if (o.leaves != null) for (const [tx, ty, tz] of tips) {
    plus(w, tx, tz, 4, 4, 3, ty, ty + 4, o.leaves, { top: o.leavesTop ?? tone(o.leaves, 1.2), band: 1, skin: 'leaf', drip: true });
  }
}
/** a crow card standing on (x, y, z) (metres), facing left or right of the camera, a little turned */
function crowAt(p: Plot, x: number, y: number, z: number, s: number, sc = 0.95) {
  p.hangs.push({ kind: 'crow', x, y: y + 4 * CELL * sc, z, ry: (hash(s, 63) < 0.5 ? 0 : Math.PI) + (hash(s, 64) - 0.5) * 0.6, s: sc });
}
/** perch a crow somewhere (metres; y = what it stands on). Scenes may use it on gravestones, roof ridges, fences. */
export function crow(w: W, x: number, y: number, z: number, seed = 1) { crowAt(plot(w), x, y, z, seed); }

/**
 * A snag: a dead trunk broken off at some height — a stepped flare, a trunk with a ragged top of three columns of different
 * heights (a jagged break in wide steps), a stub limb or two, and often a crow on the break.
 */
export function snag(w: W, x: number, z: number, h: number, bark: number, dark: number, o: { seed?: number; crow?: number } = {}) {
  const X = M(x), Z = M(z), T = M(h), s = o.seed ?? 1, tr = h >= 3 ? 3 : 2, p = plot(w);
  flare(w, X, Z, tr, bark, dark, s, 3, 4);
  trunk(w, X, Z, tr, 2, T - 6, bark, dark);
  // the break: three columns of the trunk carried on to different heights, the heart dark
  const D = dirs(s + 3), [ax, az] = D[0], [bx, bz] = D[1];
  mass(w, X - tr, T - 5, Z - tr, X + tr, T - 4, Z + tr, dark, { top: tone(dark, 0.7) });
  limb(w, X + ax * (tr - 1), Z + az * (tr - 1), X + ax * (tr - 1), Z + az * (tr - 1), T - 5, 9, 1, bark);
  limb(w, X + bx * (tr - 1), Z + bz * (tr - 1), X + bx * (tr - 1), Z + bz * (tr - 1), T - 5, 4, 1, bark);
  limb(w, X - ax * (tr - 1), Z - az * (tr - 1), X - ax * (tr - 1), Z - az * (tr - 1), T - 5, 2, 1, bark);
  // a stub limb
  const [cx, cz] = D[2], yb = Math.round(T * 0.55);
  limb(w, X, Z, X + cx * (tr + 5), Z + cz * (tr + 5), yb, 2, 1, bark); limb(w, X + cx * (tr + 5), Z + cz * (tr + 5), X + cx * (tr + 5), Z + cz * (tr + 5), yb + 2, 4, 0, dark);
  if (hash(s, 71) < (o.crow ?? 0.45)) crowAt(p, (X + ax * (tr - 1) + 0.5) * CELL, (T + 5) * CELL, (Z + az * (tr - 1) + 0.5) * CELL, s);
}

/** the haunted dead trees of the woods: grey, moonlit bark (the scene's own dead trees pass their own colours) */
export const DEAD = { bark: 0x4c484e, dark: 0x302c32 };
export const OAK = { bark: 0x3a3432, dark: 0x262224, leaf: 0x2c3830, leafTop: 0x46544a };
/**
 * An old broadleaf oak: a massive trunk on a three-tier root flare with long roots, thick limbs bent at right angles, and a crown of
 * five to seven leaf clumps of different sizes on three levels — one on top, a ring around it, small ones low on the limbs — each a
 * plus-shaped mass with a lit cap, a dark band underneath and a drip fringe. Vines and moss hang from the crown. reach (metres)
 * shifts the crown off the trunk through a right-angle elbow.
 */
export function oak(w: W, x: number, z: number, h: number, o: { seed?: number; bark?: number; dark?: number; leaf?: number; leafTop?: number; low?: number; reach?: [number, number]; vines?: number; width?: number } = {}) {
  const X = M(x), Z = M(z), T = M(h), s = o.seed ?? Math.floor(hash(X, Z, 43) * 9973), p = plot(w);
  const bark = o.bark ?? OAK.bark, dark = o.dark ?? OAK.dark, leaf = o.leaf ?? OAK.leaf, top = o.leafTop ?? OAK.leafTop, hem = tone(leaf, 0.6);
  const tr = h >= 7 ? 4 : 3, yc = Math.round(T * (o.low ?? 0.44)), cx = X + M(o.reach?.[0] ?? 0), cz = Z + M(o.reach?.[1] ?? 0);
  flare(w, X, Z, tr, bark, dark, s, 3, 5);
  trunk(w, X, Z, tr, 2, yc, bark, dark);
  if (cx !== X || cz !== Z) {
    // the trunk leans through a right-angle elbow: out along x, then along z, at the crown's foot
    const lw = tr - 1;
    limb(w, X, Z, cx, Z, yc - 2 * lw, 2 * lw, lw, bark); limb(w, cx, Z, cx, cz, yc - 2 * lw, 2 * lw, lw, bark);
    trunk(w, cx, cz, lw, yc - 2 * lw, yc + 6, bark, dark);
  }
  const W0 = o.width ?? 1, CH = T - yc, R = Math.round(T * 0.12 * W0), vk = o.vines ?? 0.6;
  // clumps: [centre x, centre z, half-size, y0, y1]
  const cl: Array<[number, number, number, number, number]> = [];
  cl.push([cx + Math.round((hash(s, 1) - 0.5) * 4), cz + Math.round((hash(s, 2) - 0.5) * 4), Math.round(R * 1.0), yc + Math.round(CH * 0.64), T - 3]);
  const D = dirs(s), nMid = h >= 6 ? 4 : 3;
  for (let i = 0; i < nMid; i++) {
    const [dx, dz] = D[i], off = Math.round(R * (1.15 + hash(s, i, 3) * 0.3)), side = Math.round((hash(s, i, 4) - 0.5) * R * 0.8);
    const r = Math.round(R * (0.8 + hash(s, i, 2) * 0.35)), y0 = yc + Math.round(CH * ([0.22, 0.4, 0.3, 0.46][i] + hash(s, i, 6) * 0.06));
    cl.push([cx + dx * off + (dz ? side : 0), cz + dz * off + (dx ? side : 0), r, y0, y0 + Math.round(r * 1.05)]);
  }
  for (let i = 0; i < (h >= 6 ? 2 : 1); i++) {
    const [dx, dz] = D[(i * 2 + 1) % 4], off = Math.round(R * 1.9), r = Math.round(R * 0.62), y0 = yc + Math.round(CH * 0.08);
    cl.push([cx + dx * off, cz + dz * off, r, y0, y0 + Math.round(r * 1.2)]);
    // the limb that carries it: out from the trunk under the crown, then up into the clump
    const lw = Math.max(1, tr - 2), ly = yc - 6, ex = cx + dx * (off - 1), ez = cz + dz * (off - 1);
    limb(w, cx, cz, ex, ez, ly, 2 * lw, lw, bark); limb(w, ex, ez, ex, ez, ly, y0 - ly + 2, lw, bark);
  }
  // the core under the crown: limbs up into the ring of clumps
  for (let i = 0; i < nMid; i++) { const [dx, dz] = D[i], e = Math.round(R * 0.8); limb(w, cx, cz, cx + dx * e, cz + dz * e, yc - 3, 3, tr - 2, bark); }
  cl.forEach(([ccx, ccz, r, y0, y1], i) => {
    const ax = r + (hash(s, i, 8) < 0.5 ? 2 : 0), az = r + (hash(s, i, 9) < 0.5 ? 2 : 0), k = Math.round(r * 0.56), ins = Math.max(2, Math.round(r * 0.22));
    // a cushion: an inset underside, the body with its dark band and drip fringe, an inset lit cap
    plus(w, ccx, ccz, Math.max(3, ax - ins), Math.max(3, az - ins), Math.max(2, k - ins), y0 - 3, y0 - 1, hem, { top: hem, low: tone(hem, 0.8), skin: 'leaf' });
    plus(w, ccx, ccz, ax, az, k, y0, y1, leaf, { top: tone(top, 0.95), low: hem, band: 2, skin: 'leaf', drip: true });
    plus(w, ccx, ccz, Math.max(3, ax - ins), Math.max(3, az - ins), Math.max(2, k - ins), y1 + 1, y1 + 3, top, { top: tone(top, 1.12), low: leaf, skin: 'leaf' });
    // vines and moss from the clump's lower edge
    for (const [dx, dz] of DIR4) {
      if (hash(s, i, dx * 5 + dz + 31) > vk * 0.5) continue;
      const u = Math.round((hash(s, i, dx * 7 + dz + 33) - 0.5) * 1.6 * k), hx = dx ? ccx + dx * (ax + 1) : ccx + u, hz = dz ? ccz + dz * (az + 1) : ccz + u;
      p.hangs.push({ kind: 'moss', x: (hx + 0.5) * CELL, y: (y0 + 1) * CELL, z: (hz + 0.5) * CELL, ry: dz > 0 ? 0 : dz < 0 ? Math.PI : dx > 0 ? Math.PI / 2 : -Math.PI / 2, s: 0.4 + hash(s, i, dx + 37) * 0.35, tint: 0xb8c0b0 });
    }
  });
}

/** a bush: a low plus-shaped leaf mass with a lit cap and a smaller lump off one side (r = half-width in metres) */
export function bush(w: W, x: number, z: number, r = 0.6, o: { seed?: number; leaf?: number; leafTop?: number; h?: number; style?: LeafStyle } = {}) {
  const X = M(x), Z = M(z), R = Math.max(3, M(r)), Hh = Math.max(5, M(o.h ?? r * 1.25)), s = o.seed ?? Math.floor(hash(X, Z, 47) * 9973);
  const leaf = o.leaf ?? OAK.leaf, top = o.leafTop ?? OAK.leafTop, st = o.style ?? 'leaf', k = Math.round(R * 0.62);
  plus(w, X, Z, R, R - (hash(s, 1) < 0.5 ? 1 : 0), k, 0, Math.round(Hh * 0.7), leaf, { top: tone(top, 0.95), low: tone(leaf, 0.6), band: 1, skin: st });
  plus(w, X, Z, R - 2, R - 2, Math.max(1, k - 2), Math.round(Hh * 0.7) + 1, Hh, top, { top: tone(top, 1.12), low: leaf, skin: st });
  const [dx, dz] = DIR4[Math.floor(hash(s, 2) * 4)], r2 = Math.max(2, Math.round(R * 0.6)), lx = X + dx * Math.round(R * 0.95), lz = Z + dz * Math.round(R * 0.95);
  plus(w, lx, lz, r2, r2, Math.max(1, Math.round(r2 * 0.6)), 0, Math.round(Hh * 0.5), leaf, { top: top, low: tone(leaf, 0.6), band: 1, skin: st });
}

export function stump(w: W, x: number, z: number, r: number, h: number, bark: number, top: number) {
  const X = M(x), Z = M(z);
  // a flared foot, the cut top with a lighter rim and a dark heart
  w.box(X - r - 1, -2, Z - r + 1, X + r + 1, 1, Z + r - 1, tone(bark, 0.8)).box(X - r + 1, -2, Z - r - 1, X + r - 1, 1, Z + r + 1, tone(bark, 0.8));
  w.box(X - r, -2, Z - r, X + r, h - 1, Z + r, bark).box(X - r + 1, h - 1, Z - r + 1, X + r - 1, h - 1, Z + r - 1, top);
  if (r >= 3) w.box(X - 1, h - 1, Z - 1, X + 1, h - 1, Z + 1, tone(top, 0.72));
}

export function log(w: W, x: number, z: number, len: number, alongX: boolean, bark: number, end: number) {
  const X = M(x), Z = M(z), L = M(len) >> 1, ring = tone(end, 0.75);
  if (alongX) { w.box(X - L, 0, Z - 3, X + L, 5, Z + 3, bark).box(X - L, 1, Z - 2, X - L, 4, Z + 2, end).box(X + L, 1, Z - 2, X + L, 4, Z + 2, end).box(X - L, 2, Z - 1, X - L, 3, Z, ring).box(X + L, 2, Z - 1, X + L, 3, Z, ring); }
  else { w.box(X - 3, 0, Z - L, X + 3, 5, Z + L, bark).box(X - 2, 1, Z - L, X + 2, 4, Z - L, end).box(X - 2, 1, Z + L, X + 2, 4, Z + L, end).box(X - 1, 2, Z - L, X, 3, Z - L, ring).box(X - 1, 2, Z + L, X, 3, Z + L, ring); }
}

export function mushroom(w: W, x: number, z: number, s: number, stem: number, cap: number, glow = 0) {
  const X = M(x), Z = M(z), H = s * 2;
  w.box(X - (s >> 1), 0, Z - (s >> 1), X + (s >> 1), H, Z + (s >> 1), stem).box(X - s, H + 1, Z - s, X + s, H + 2, Z + s, cap, glow).box(X - s + 1, H + 3, Z - s + 1, X + s - 1, H + 3, Z + s - 1, cap, glow);
}

// ------------------------------------------------------------------ building the plot: one mesh of prisms, leaf skins, drips, hangs
type V3a = [number, number, number];
/** is (x, z) (metres) inside a low flora mass (a bush, a trunk)? standing cards keep out of them */
const lowCache = new WeakMap<W, { n: number; low: Mass[] }>();
export function inFlora(w: W, x: number, z: number) {
  const ms = plot(w).masses; let lc = lowCache.get(w);
  if (!lc || lc.n !== ms.length) lowCache.set(w, (lc = { n: ms.length, low: ms.filter(m => m.y0 <= 9) }));
  const X = x / CELL, Z = z / CELL;
  for (const m of lc.low) if (X >= m.x0 - 0.5 && X <= m.x1 + 1.5 && Z >= m.z0 - 0.5 && Z <= m.z1 + 1.5) return true;
  return false;
}
/** turn what the trees recorded since the last call into geometry and cards on this stage */
export function buildFlora(c: Ctx) {
  const p = plot(c.w), list = p.masses.slice(p.built), C = CELL; p.built = p.masses.length;
  for (const h of p.hangs.slice(p.hung)) c.cards.add(h.kind, h.x, h.z, { y: h.y, ry: h.ry, s: h.s, tint: h.tint });
  p.hung = p.hangs.length;
  if (!list.length) return;
  const P: number[] = [], N: number[] = [], Col: number[] = [], U: number[] = [], S: number[] = [], E: number[] = [], I: number[] = [];
  const ca = new THREE.Color(), cb = new THREE.Color();
  /** a quad from corner o along axes u (su blocks) and v (sv blocks); colours at v = 0 and v = sv; open = bevelled edges [u=0, u=su, v=0, v=sv] */
  const quad = (o: V3a, u: V3a, v: V3a, su: number, sv: number, n: V3a, c0: number, c1: number, open: [number, number, number, number]) => {
    const base = P.length / 3; ca.set(c0); cb.set(c1);
    const pts: Array<[number, number, number, number, number, THREE.Color]> = [[0, 0, 0, 0, 0, ca], [su, 0, su, 0, 0, ca], [su, sv, su, sv, 1, cb], [0, sv, 0, sv, 1, cb]];
    for (const [a, b, uu, vv, , col] of pts) { P.push((o[0] + u[0] * a + v[0] * b) * C, (o[1] + u[1] * a + v[1] * b) * C, (o[2] + u[2] * a + v[2] * b) * C); N.push(...n); Col.push(col.r, col.g, col.b); U.push(uu, vv); S.push(su, sv); E.push(...open); }
    // wind so the face points along n
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], ok = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0;
    if (ok) I.push(base, base + 1, base + 2, base, base + 2, base + 3); else I.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  const X: V3a = [1, 0, 0], Y: V3a = [0, 1, 0], Z: V3a = [0, 0, 1];
  /** a vertical face along x (at z = zf, facing nz) or along z (at x = xf, facing nx), from a to b, y0..y1 (boundaries) */
  const side = (m: Mass, alongX: boolean, f: number, a: number, b: number, nrm: number, openA: number, openB: number) => {
    const y0 = m.y0, y1 = m.y1 + 1, n: V3a = alongX ? [0, 0, nrm] : [nrm, 0, 0], ax: V3a = alongX ? X : Z, len = b - a;
    const o = (y: number): V3a => (alongX ? [a, y, f] : [f, y, a]);
    const band = Math.min(m.band, y1 - y0 - 1), yb = y0 + band, h = y1 - yb;
    quad(o(yb), ax, Y, len, h, n, tone(m.side, 0.8), m.side, [openA, openB, band ? 0 : 1, 1]);
    if (band) quad(o(y0), ax, Y, len, band, n, m.low, m.low, [openA, openB, 1, 0]);
    if (m.skin) skinFace(m, alongX, f, a, b, nrm, y0, y1);
  };
  const flat = (m: Mass, x0: number, z0: number, x1: number, z1: number, open: [number, number, number, number]) => {
    // top (u along z, v along x, as the voxel world lays its y faces) and underside
    quad([x0, m.y1 + 1, z0], Z, X, z1 - z0, x1 - x0, [0, 1, 0], m.top, m.top, open);
    quad([x0, m.y0, z0], Z, X, z1 - z0, x1 - x0, [0, -1, 0], tone(m.low, 0.8), tone(m.low, 0.8), open);
  };
  // ---- skins and drips (cards; world-aligned uv so neighbouring faces and masses continue the same pattern)
  const off = 0.5, T = 16;
  const skinFace = (m: Mass, alongX: boolean, f: number, a: number, b: number, nrm: number, y0: number, y1: number) => {
    const kind = m.skin === 'needle' ? 'needleskin' : 'leafskin', len = b - a + 1, hy = y1 - y0 + off, mid = (a + b) / 2;
    const px = alongX ? mid : f + nrm * off, pz = alongX ? f + nrm * off : mid, ry = alongX ? (nrm > 0 ? 0 : Math.PI) : (nrm > 0 ? Math.PI / 2 : -Math.PI / 2);
    // u runs along the face in its own local +x: +x for a +z face, −x for −z, −z for +x, +z for −x
    const u0 = alongX ? (nrm > 0 ? a - 0.5 : -(b + 0.5)) : (nrm > 0 ? -(b + 0.5) : a - 0.5);
    c.cards.add(kind, px * C, pz * C, { y: (y0 + hy / 2) * C, ry, sx: len / T, sy: hy / T, uv: [len / T, hy / T, u0 / T, y0 / T], tint: tone(m.side, SKIN_K.side) });
    if (m.drip) c.cards.add('leafdrip', px * C, pz * C, { y: (y0 + 1) * C, ry, sx: len / T, sy: 0.5, uv: [len / T, 0.5, u0 / T, m.skin === 'needle' ? 0 : 0.5], tint: tone(m.low, SKIN_K.drip) });
  };
  const skinTop = (m: Mass, x0: number, z0: number, x1: number, z1: number) => {
    if (!m.skin) return;
    const kind = m.skin === 'needle' ? 'needleskin' : 'leafskin', lx = x1 - x0, lz = z1 - z0;
    c.cards.add(kind, (x0 + lx / 2) * C, (z0 + lz / 2) * C, { y: (m.y1 + 1 + off) * C, rx: -Math.PI / 2, ry: 0, sx: lx / T, sy: lz / T, uv: [lx / T, lz / T, x0 / T, -z1 / T], tint: tone(m.top, SKIN_K.top) });
  };
  for (const m of list) {
    const xa = m.x0, xd = m.x1 + 1, za = m.z0, zd = m.z1 + 1;
    if (!m.cx || !m.cz || m.cx * 2 >= xd - xa || m.cz * 2 >= zd - za) {
      side(m, true, za, xa, xd, -1, 1, 1); side(m, true, zd, xa, xd, 1, 1, 1); side(m, false, xa, za, zd, -1, 1, 1); side(m, false, xd, za, zd, 1, 1, 1);
      flat(m, xa, za, xd, zd, [1, 1, 1, 1]); skinTop(m, xa - off, za - off, xd + off, zd + off);
      continue;
    }
    const xb = xa + m.cx, xc = xd - m.cx, zb = za + m.cz, zc = zd - m.cz;
    // the twelve faces of the plus outline: convex corners bevelled, concave ones not
    side(m, true, za, xb, xc, -1, 1, 1); side(m, true, zd, xb, xc, 1, 1, 1); side(m, false, xa, zb, zc, -1, 1, 1); side(m, false, xd, zb, zc, 1, 1, 1);
    side(m, false, xc, za, zb, 1, 1, 0); side(m, true, zb, xc, xd, -1, 0, 1);    // NE notch
    side(m, true, zc, xc, xd, 1, 0, 1); side(m, false, xc, zc, zd, 1, 0, 1);     // SE
    side(m, false, xb, zc, zd, -1, 0, 1); side(m, true, zc, xa, xb, 1, 1, 0);    // SW
    side(m, true, zb, xa, xb, -1, 1, 0); side(m, false, xb, za, zb, -1, 1, 0);   // NW
    // top and underside as five rects (centre + four arms) so no seam is bevelled; open = [z0, z1, x0, x1] edges
    flat(m, xb, zb, xc, zc, [0, 0, 0, 0]);
    flat(m, xb, za, xc, zb, [1, 0, 1, 1]); flat(m, xb, zc, xc, zd, [0, 1, 1, 1]); flat(m, xa, zb, xb, zc, [1, 1, 1, 0]); flat(m, xc, zb, xd, zc, [1, 1, 0, 1]);
    skinTop(m, xa - off, zb, xd + off, zc); skinTop(m, xb, za - off, xc, zd + off);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Col, 3));
  g.setAttribute('aVox', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 2)); g.setAttribute('aOpen', new THREE.Float32BufferAttribute(E, 4));
  g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1)); g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, voxToon({ rim: 0.2, self: 0.16, edge: 0.1, hole: true })); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'flora';
  c.add(mesh);
}
/** leaf skin tints relative to their mass colours (the texture is painted pale; the leaves sit a little above their dark core) */
export const SKIN_K = { top: 1.45, side: 1.1, drip: 1.15 };

// ------------------------------------------------------------------ the wall of woods around a stage
/** the woods' own foliage, drained by the endless night: blue-grey spruce, slate pine, olive-grey oaks, and a rare rust-brown one */
export const LEAVES = {
  pine: [[0x283c40, 0x40585e], [0x26363e, 0x3a5058], [0x2e3c38, 0x485852]] as Array<[number, number]>,
  oak: [[0x363e32, 0x545e4a], [0x2c3834, 0x46564e], [0x3a3c30, 0x5a5c46], [0x463e2e, 0x6a5c42]] as Array<[number, number]>,
};
type Kind = 'pine' | 'oak' | 'dead' | 'snag' | 'bush' | 'lean' | 'corner';
interface Spot { x: number; z: number; h: number; kind: Kind; inner: boolean; reach?: [number, number] }

/**
 * Dark woods around the stage, layered like a theatre set. From the battle camera the back edge shows only the lowest few metres of
 * whatever stands there, and the sides are seen in full only behind the middle — so: three staggered rows at the back with low
 * skirts and bushes filling between the trunks, side rows that step down toward the camera, low crowns leaning in over the front
 * of each side, bushes along both edges, and a low crown pressing into each bottom corner of the frame. Trees are planted when
 * dress() runs, so they step around whatever the scene built (props, walls, water); a spot that is taken is skipped. dense < 1 thins
 * the inner rows (villages, ruins); o.keep lists areas to leave empty.
 */
export function woodsRing(c: Ctx, seed: number, dense = 1, o: RingOpt = {}) {
  const p = plot(c.w); p.rings.push({ seed, dense, o });
  if (p.planted) { plantRings(c); buildFlora(c); }
}
/** plant the woods rings queued on this world (dress() calls this first) */
export function plantRings(c: Ctx) {
  const p = plot(c.w), jobs = p.rings.splice(0); p.planted = true;
  for (const j of jobs) plantRing(c.w, j.seed, j.dense, j.o);
}

function ringSpots(seed: number): Spot[] {
  const out: Spot[] = [], J = (i: number, k: number, a: number) => (hash(i, seed, k) - 0.5) * 2 * a;
  const row = (z: number, x0: number, x1: number, step: number, h: [number, number], inner: boolean, base: number, jz = 0.35) => {
    for (let i = 0, x = x0; x <= x1 + 0.01; i++, x += step) out.push({ x: x + J(base + i, 1, step * 0.16), z: z + J(base + i, 2, jz), h: h[0] + hash(base + i, seed, 3) * (h[1] - h[0]), kind: 'pine', inner });
  };
  // the back: three rows, each staggered against the one in front, taller toward the back
  row(-10.9, -9.6, 9.6, 2.4, [6.6, 8.6], true, 0);
  row(-12.9, -11.2, 11.2, 2.8, [8.2, 10.4], false, 20);
  row(-15.3, -12.6, 12.6, 3.6, [10, 12], false, 40, 0.5);
  for (const sd of [-1, 1]) {
    const q = sd > 0 ? 1 : 0;
    // the sides behind the middle, stepping down toward the camera
    [-8.6, -6.0, -3.4, -0.9].forEach((z, i) => { const j = 60 + i * 2 + q; out.push({ x: sd * (9.3 + J(j, 1, 0.3)), z: z + J(j, 2, 0.35), h: 8.2 - i * 0.6 + J(j, 3, 0.5), kind: 'pine', inner: true }); });
    [-10.6, -7.5, -4.4].forEach((z, i) => { const j = 80 + i * 2 + q; out.push({ x: sd * (12 + J(j, 1, 0.4)), z: z + J(j, 2, 0.4), h: 9.6 - i * 0.5 + J(j, 3, 0.5), kind: 'pine', inner: false }); });
    // in front of the middle the side trees stand off-frame: their crowns lean in over the edge
    [1.5, 4.3].forEach((z, i) => { const j = 70 + i * 2 + q; out.push({ x: sd * (9.7 + J(j, 1, 0.2)), z: z + J(j, 2, 0.3), h: 5.6 - i * 0.4 + J(j, 3, 0.3), kind: 'lean', inner: false, reach: [-sd * 1.3, 0] }); });
    // and a low crown presses into each bottom corner of the frame
    out.push({ x: sd * 9.4, z: 7.7 + J(sd + 5, 2, 0.2), h: 5.2 + J(sd + 5, 3, 0.3), kind: 'corner', inner: false, reach: [-sd * 1.5, -0.7] });
    // bushes along both edges and at the back corners: the nearest layer
    for (const [bx, bz] of [[8.2, -7.6], [8.4, -5.0], [8.1, -2.4], [8.3, 0.3], [8.0, 3.0], [7.8, 5.4], [7.4, -9.6], [4.9, -9.8]] as const) out.push({ x: sd * (bx + J(bx * 10 + sd, 1, 0.2)), z: bz + J(bz * 10 + sd, 2, 0.3), h: 0.45 + hash(bx * 10, bz * 10 + sd, seed) * 0.35, kind: 'bush', inner: true });
  }
  // species: dark pines, old oaks between them, a haunted dead tree here and there; never the same twice in a row
  let prev: Kind = 'bush';
  for (let i = 0; i < out.length; i++) {
    const sp = out[i]; if (sp.kind !== 'pine') { prev = sp.kind; continue; }
    // Duskwood: the dead outnumber the living
    const r = hash(i, seed, 7), far = sp.z < -14.5 || Math.abs(sp.x) > 11.5;
    let k: Kind = far ? (r < 0.55 ? 'pine' : r < 0.88 ? 'dead' : 'oak') : r < 0.48 ? 'dead' : r < 0.74 ? 'pine' : r < 0.86 ? 'oak' : 'snag';
    if (k === prev && k !== 'dead') k = 'dead'; else if (k === prev) k = r < 0.5 ? 'pine' : 'snag';
    sp.kind = k; prev = k;
  }
  return out;
}

function plantRing(w: W, seed: number, dense: number, o: RingOpt) {
  const keep = o.keep ?? [];
  // a spot is free when nothing the scene built stands in the trunk's footprint or the crown's lower part
  const blocked = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    for (let x = x0; x <= x1; x += 2) for (let z = z0; z <= z1; z += 2) for (let y = y0; y <= y1; y += 3) if (w.has(x, y, z)) return true;
    return false;
  };
  const inArea = (x: number, z: number) => x > AREA.x0 && x < AREA.x1 && z > AREA.z0 && z < AREA.z1;
  const plan: Spot[] = [];
  for (const sp of ringSpots(seed)) {
    if (sp.inner && hash(sp.x * 10, sp.z * 10, seed + 3) > dense) continue;
    if (!sp.inner && dense < 0.45 && hash(sp.x * 10, sp.z * 10, seed + 5) > 0.75) continue;
    if (sp.z < -14.5 && dense < 0.75) continue;
    if (keep.some(r => sp.x > r.x0 - 0.6 && sp.x < r.x1 + 0.6 && sp.z > r.z0 - 0.6 && sp.z < r.z1 + 0.6)) continue;
    if (sp.x > PLAY.x0 - 1 && sp.x < PLAY.x1 + 1 && sp.z > PLAY.z0 - 1 && sp.z < PLAY.z1 + 1.4) continue;
    const X = M(sp.x), Z = M(sp.z);
    if (inArea(sp.x, sp.z) && !w.has(X, -1, Z)) continue;                 // water or a hole
    const foot = sp.kind === 'bush' ? M(sp.h + 0.1) : 9, crownR = sp.kind === 'bush' || sp.kind === 'snag' ? 0 : M(sp.kind === 'pine' ? sp.h * 0.18 : sp.kind === 'dead' ? sp.h * 0.26 : sp.h * 0.3);
    if (blocked(X - foot, 1, Z - foot, X + foot, M(sp.kind === 'bush' ? 0.9 : 2.6), Z + foot)) continue;
    if (crownR) {
      const cx = X + M(sp.reach?.[0] ?? 0), cz = Z + M(sp.reach?.[1] ?? 0), lo = sp.kind === 'corner' || sp.kind === 'lean' ? M(1.8) : M(sp.h * 0.25);
      if (blocked(cx - crownR, lo, cz - crownR, cx + crownR, M(sp.h), cz + crownR)) {
        // try a slimmer, shorter pine in the same spot before giving it up
        if (blocked(X - M(1.0), M(1.2), Z - M(1.0), X + M(1.0), M(sp.h * 0.7), Z + M(1.0))) continue;
        sp.kind = 'pine'; sp.h *= 0.7; sp.reach = undefined;
      }
    }
    if (sp.kind !== 'bush' && keep.some(r => sp.x + 1.4 > r.x0 && sp.x - 1.4 < r.x1 && sp.z + 1.4 > r.z0 && sp.z - 1.4 < r.z1)) continue;
    plan.push(sp);
  }
  const fix = o.leaf;
  /** a palette entry: the common ones, and the last (rare) one only now and then */
  const pick2 = (list: Array<[number, number]>, s: number, rare: boolean): [number, number] => {
    if (fix) return [fix, tone(fix, 1.45)];
    const n = list.length - (rare && hash(s, 6) < 0.3 ? 0 : 1);
    return list[Math.min(list.length - 1, Math.floor(hash(s, 5) * n))];
  };
  const P = plot(w), x0 = M(PLAY.x0 - 0.4), x1 = M(PLAY.x1 + 0.4), z0 = M(PLAY.z0), lo = M(0.5);
  plan.forEach((sp, i) => {
    const s = Math.floor(hash(i, seed, 17) * 9973), back = sp.z < -10, nm = P.masses.length, nh = P.hangs.length;
    plantOne(sp, s, back);
    // nothing of a ring tree may hang over the battle floor or the strip in front of it (only low things are allowed there)
    for (let k = P.masses.length - 1; k >= nm; k--) { const m = P.masses[k]; if (m.y1 >= lo && m.x1 >= x0 && m.x0 <= x1 && m.z1 >= z0) P.masses.splice(k, 1); }
    for (let k = P.hangs.length - 1; k >= nh; k--) { const h = P.hangs[k]; if (h.x > PLAY.x0 - 0.4 && h.x < PLAY.x1 + 0.4 && h.z > PLAY.z0) P.hangs.splice(k, 1); }
  });
  function plantOne(sp: Spot, s: number, back: boolean) {
    if (sp.kind === 'pine') { const [l, t] = pick2(LEAVES.pine, s, false); pine(w, sp.x, sp.z, sp.h, BARK_D, l, t, { seed: s, slim: 0.92 + hash(s, 3) * 0.2, base: back ? 0.12 + hash(s, 4) * 0.06 : 0.18 }); }
    else if (sp.kind === 'oak') { const [l, t] = pick2(LEAVES.oak, s, true); oak(w, sp.x, sp.z, sp.h * 0.92, { seed: s, leaf: l, leafTop: t, low: back ? 0.3 : 0.4, width: 0.95 + hash(s, 4) * 0.2 }); }
    else if (sp.kind === 'dead') deadTree(w, sp.x, sp.z, sp.h * 0.82, DEAD.bark, DEAD.dark, { seed: s, crow: 0.22 });
    else if (sp.kind === 'snag') snag(w, sp.x, sp.z, 2.4 + hash(s, 8) * 2.2, DEAD.bark, DEAD.dark, { seed: s });
    else if (sp.kind === 'lean' || sp.kind === 'corner') { const [l, t] = pick2(LEAVES.oak, s, false); oak(w, sp.x, sp.z, sp.h, { seed: s, leaf: tone(l, 0.85), leafTop: tone(t, 0.85), low: sp.kind === 'corner' ? 0.42 : 0.36, reach: sp.reach, width: 1.1, vines: 0.9 }); }
    else { const [l, t] = pick2(LEAVES.oak, s, false); bush(w, sp.x, sp.z, sp.h, { seed: s, leaf: l, leafTop: t }); }
  }
}
