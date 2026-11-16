// Bestiary modelling kit. Every model in the game uses ONE block size (CELL) so they read as one world; bigger creatures simply have
// more cells. Builders lay down the common anatomy (biped, robed caster, quadruped, spider) as parts on joints and return anchors
// (cell coordinates of the face plane, hands, head top …) that the model functions decorate. Conventions: x centred (mirror with
// sym*), y up from the ground, front = +z; held weapons are built along +z from the fist (the idle pose stands them upright).
import { VoxChar, type Col } from '../look/voxkit';

/** one block = 7 cm: a human-sized figure is ~28 blocks tall (about 2 m) */
export const CELL = 0.07;

export const P = {
  DARK: 0x161018, INK: 0x241a28, WHITE: 0xfff6e8, GOLD: 0xffc640, GOLD_D: 0xc88a24, SILVER: 0xc8d0dc,
  IRON: 0x8e909e, IRON_D: 0x5a5c6a, IRON_DD: 0x3a3c48, EDGE: 0xe8ecf4,
  LEATH: 0x7a4a2a, LEATH_D: 0x4a2c18, WOOD: 0x8a5a32, WOOD_D: 0x5e3a20, BONE: 0xeee2c4, BONE_D: 0xc4b48e, BONE_DD: 0x9a8a6a,
  BARK: 0x6a4a32, BARK_D: 0x46301e, BARK_L: 0x8a6646, MOSS: 0x5a8a3a, MOSS_D: 0x3a6a2a, MOSS_L: 0x8ab84a, STONE: 0x8a8c96, STONE_D: 0x5e606c, STONE_L: 0xb0b2bc,
  SOUL: 0x5affa0, POISON: 0x9aff3a, CURSE: 0xc060ff, BLOOD: 0xc8141e, EMBER: 0xffa030, MOON: 0xd8f0ff, FROST: 0x8ae0ff,
};

export type V = VoxChar;
export const newChar = () => new VoxChar(CELL);

/** a box with its vertical edges (and optionally top edges) chamfered by r cells — rounder, less brick-like masses */
export function rbox(v: V, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null, r = 1, top = true, g = 0) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    const ex = Math.min(x - x0, x1 - x), ez = Math.min(z - z0, z1 - z), ey = y1 - y;
    if (ex + ez < r) continue;
    if (top && ey < r && (ex < r - ey || ez < r - ey)) continue;
    v.set(x, y, z, c, g);
  }
  return v;
}
/** mirrored rbox */
export function srbox(v: V, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null, r = 1, top = true, g = 0) {
  rbox(v, x0, y0, z0, x1, y1, z1, c, r, top, g); rbox(v, -1 - x1, y0, z0, -1 - x0, y1, z1, c, r, top, g); return v;
}
/** a tapered column (cross-section shrinking linearly from r0 to r1) — trunks, tails, horns */
export function taper(v: V, cx: number, y0: number, cz: number, h: number, r0: number, r1: number, c: Col, o: { dx?: number; dz?: number; g?: number } = {}) {
  for (let i = 0; i < h; i++) {
    const t = h > 1 ? i / (h - 1) : 0, r = r0 + (r1 - r0) * t, ox = (o.dx ?? 0) * t, oz = (o.dz ?? 0) * t;
    for (let x = Math.floor(cx + ox - r); x <= Math.ceil(cx + ox + r); x++) for (let z = Math.floor(cz + oz - r); z <= Math.ceil(cz + oz + r); z++) {
      const dx = x + 0.5 - (cx + ox), dz = z + 0.5 - (cz + oz); if (dx * dx + dz * dz <= r * r + 0.25) v.set(x, y0 + i, z, c, o.g ?? 0);
    }
  }
  return v;
}
/** speckle existing cells of one colour with another (moss, spots, bark grain) */
export function speckle(v: V, from: Col, to: Col, chance: number, seed = 1, part?: string, pred?: (c: { x: number; y: number; z: number }) => boolean) {
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  v.paint(c => (c.c === from && (!pred || pred(c)) && rnd() < chance ? to : null), part);
  return v;
}

// ------------------------------------------------------------------ biped
export interface Biped {
  legH?: number; legW?: number; legD?: number; legGap?: number; hipH?: number; torsoH?: number; torsoW?: number; torsoD?: number; chestW?: number;
  headW?: number; headH?: number; headD?: number; headZ?: number; neckH?: number; armW?: number; upper?: number; fore?: number; hand?: number;
  skin: Col; legs?: Col; boots?: Col; hips?: Col; torso?: Col; chest?: Col; belt?: Col | null; sleeve?: Col; fore_?: Col; hands?: Col; head?: Col;
  /** a skirt / robe from the hips to the ground instead of visible legs (feet still peek out) */
  robe?: { c: Col; flare?: number; trim?: Col; hem?: Col };
  /** round the head and torso masses */
  round?: number;
}
export interface Anchors {
  hipY: number; torsoY0: number; torsoY1: number; headY0: number; headY1: number; faceZ: number; headW: number; headD: number; headZ: number;
  torsoW: number; torsoD: number; chestW: number; armX: number; shoulderY: number; handY: number; legX: number; legH: number;
  /** the cell the right-hand weapon haft passes through (built along +z from here) */
  wR: [number, number, number]; wL: [number, number, number];
}
export function biped(v: V, o: Biped): Anchors {
  const legH = o.legH ?? 8, legW = o.legW ?? 3, legD = o.legD ?? 4, gap = o.legGap ?? 1, hipH = o.hipH ?? 2, torsoH = o.torsoH ?? 6, torsoW = o.torsoW ?? 10, torsoD = o.torsoD ?? 6;
  const chestW = o.chestW ?? torsoW, headW = o.headW ?? 8, headH = o.headH ?? 8, headD = o.headD ?? 8, headZ = o.headZ ?? 0, neckH = o.neckH ?? 0;
  const armW = o.armW ?? 3, upper = o.upper ?? 3, fore = o.fore ?? 3, hand = o.hand ?? 2, rnd = o.round ?? 1;
  const hipY = legH, torsoY0 = legH + hipH, torsoY1 = torsoY0 + torsoH - 1, headY0 = torsoY1 + 1 + neckH, headY1 = headY0 + headH - 1;
  const legX = gap + legW / 2, armX = chestW / 2 + armW / 2, shoulderY = torsoY1 + 1, handY = shoulderY - upper - fore - hand;
  const hz = torsoD / 2, faceZ = headZ + headD / 2 - 1, knee = Math.max(2, Math.round(legH / 2));
  const za = (armW % 2 ? 0.5 : 0);
  // joints
  v.bone('hips', 'root', 0, hipY, 0).bone('spine', 'hips', 0, torsoY0, 0).bone('chest', 'spine', 0, torsoY0 + Math.floor(torsoH / 2), 0)
    .bone('neck', 'chest', 0, torsoY1 + 1, 0).bone('head', 'neck', 0, headY0, headZ * 0.5).bone('jaw', 'head', 0, headY0 + 2, faceZ - 1).bone('hat', 'head', 0, headY1 + 1, headZ)
    .bone('cape', 'chest', 0, torsoY1, -hz)
    .bone('shL', 'chest', armX, shoulderY, za).bone('armL', 'shL', armX, shoulderY, za).bone('foreL', 'armL', armX, shoulderY - upper, za).bone('handL', 'foreL', armX, shoulderY - upper - fore, za)
    .bone('shR', 'chest', -armX, shoulderY, za).bone('armR', 'shR', -armX, shoulderY, za).bone('foreR', 'armR', -armX, shoulderY - upper, za).bone('handR', 'foreR', -armX, shoulderY - upper - fore, za)
    .bone('weapon', 'handR', -armX, handY + hand / 2, za).bone('offhand', 'handL', armX, handY + hand / 2, za)
    .bone('legL', 'hips', legX, hipY, 0).bone('shinL', 'legL', legX, knee, 0).bone('footL', 'shinL', legX, 2, 0)
    .bone('legR', 'hips', -legX, hipY, 0).bone('shinR', 'legR', -legX, knee, 0).bone('footR', 'shinR', -legX, 2, 0);
  const lz0 = -Math.floor(legD / 2), lz1 = lz0 + legD - 1;
  // legs (or a robe skirt)
  if (o.robe) {
    const fl = o.robe.flare ?? 2;
    v.part('hips');
    // two clean tiers (a wide hem, then straight) instead of a stepped flare
    const top = hipY + hipH, low = Math.max(3, Math.round(top * 0.4));
    for (let y = 0; y < top; y++) {
      const wide = y < low, w = torsoW / 2 + (wide ? fl : 0), d = torsoD / 2 + (wide ? Math.ceil(fl * 0.6) : 0);
      rbox(v, -w, y, -d, w - 1, y, d - 1, y <= 1 ? (o.robe.hem ?? o.robe.c) : y === low - 1 && o.robe.trim ? o.robe.trim : o.robe.c, 1, false);
    }
    v.part('footL').box(gap, 0, lz1 + 1, gap + legW - 1, 0, lz1 + 2, o.boots ?? P.LEATH_D);
    v.part('footR').box(-gap - legW, 0, lz1 + 1, -gap - 1, 0, lz1 + 2, o.boots ?? P.LEATH_D);
  } else {
    for (const sx of [1, -1]) {
      const x0 = sx > 0 ? gap : -gap - legW, x1 = x0 + legW - 1, L = sx > 0 ? 'L' : 'R';
      v.part('leg' + L).box(x0, knee, lz0, x1, hipY - 1, lz1, o.legs ?? o.skin);
      v.part('shin' + L).box(x0, 2, lz0, x1, knee - 1, lz1, o.legs ?? o.skin);
      v.part('foot' + L).box(x0, 0, lz0, x1, 1, lz1 + 1, o.boots ?? o.legs ?? o.skin);
    }
    v.part('hips').box(-torsoW / 2, hipY, -hz, torsoW / 2 - 1, hipY + hipH - 1, hz - 1, o.hips ?? o.legs ?? o.skin);
  }
  if (o.belt !== null && o.belt != null) v.part('hips').box(-torsoW / 2, hipY + hipH - 1, -hz, torsoW / 2 - 1, hipY + hipH - 1, hz - 1, o.belt);
  // torso: lower half on the spine, upper half (and the widened chest) on the chest
  const mid = torsoY0 + Math.floor(torsoH / 2);
  v.part('spine'); rbox(v, -torsoW / 2, torsoY0, -hz, torsoW / 2 - 1, mid - 1, hz - 1, o.torso ?? o.skin, rnd > 0 ? 1 : 0, false);
  v.part('chest'); rbox(v, -chestW / 2, mid, -hz, chestW / 2 - 1, torsoY1, hz - 1, o.chest ?? o.torso ?? o.skin, rnd > 0 ? 1 : 0, true);
  // arms
  for (const sx of [1, -1]) {
    const x0 = sx > 0 ? chestW / 2 : -chestW / 2 - armW, x1 = x0 + armW - 1, L = sx > 0 ? 'L' : 'R', z0 = -Math.floor(armW / 2), z1 = z0 + armW - 1;
    v.part('arm' + L).box(x0, shoulderY - upper, z0, x1, shoulderY - 1, z1, o.sleeve ?? o.skin);
    v.part('fore' + L).box(x0, shoulderY - upper - fore, z0, x1, shoulderY - upper - 1, z1, o.fore_ ?? o.sleeve ?? o.skin);
    v.part('hand' + L).box(x0, handY, z0, x1, handY + hand - 1, z1, o.hands ?? o.skin);
  }
  // head
  v.part('head'); rbox(v, -headW / 2, headY0, headZ - headD / 2, headW / 2 - 1, headY1, headZ + headD / 2 - 1, o.head ?? o.skin, rnd, true);
  const wx = -Math.round(armX) - (armW % 2 ? 0 : 0), hy = handY + Math.floor(hand / 2) - (hand % 2 ? 0 : 1);
  return { hipY, torsoY0, torsoY1, headY0, headY1, faceZ, headW, headD, headZ, torsoW, torsoD, chestW, armX, shoulderY, handY, legX, legH,
    wR: [wx, hy, 0], wL: [-wx - 1, hy, 0] };
}
/** one octagonal ring row of half-width w, half-depth d */
export function rowOct(v: V, w: number, d: number, y: number, c: Col, g = 0) {
  for (let x = -w; x < w; x++) for (let z = -d; z < d; z++) if (Math.abs(x + 0.5) + Math.abs(z + 0.5) <= w + d - Math.max(1.5, Math.min(w, d) * 0.6)) v.set(x, y, z, c, g);
}

// ------------------------------------------------------------------ faces
export interface Eyes { y: number; w?: number; h?: number; gap?: number; style?: 'white' | 'glow' | 'dot'; pupil?: Col; white?: Col; glow?: Col; brow?: Col; angry?: boolean; lid?: Col }
/** eyes on the face plane: y = row offset from the head bottom */
export function eyes(v: V, A: Anchors, e: Eyes) {
  const w = e.w ?? 2, h = e.h ?? 2, g = e.gap ?? 2, y0 = A.headY0 + e.y, z = A.faceZ, x0 = g / 2, x1 = x0 + w - 1;
  v.part('head');
  if (e.style === 'glow') v.symBox(x0, y0, z, x1, y0 + h - 1, z, e.glow ?? P.SOUL, 1);
  else if (e.style === 'dot') v.symBox(x0, y0, z, x1, y0 + h - 1, z, e.pupil ?? P.DARK);
  else { v.symBox(x0, y0, z, x1, y0 + h - 1, z, e.white ?? P.WHITE); v.symBox(x0, y0, z, x0, y0 + Math.max(0, h - 2), z, e.pupil ?? P.DARK); }
  if (e.lid) v.symBox(x0, y0 + h - 1, z, x1, y0 + h - 1, z, e.lid);
  if (e.brow) { v.symBox(x0 - (e.angry ? 0 : 0), y0 + h, z, x1 + 1, y0 + h, z, e.brow); if (e.angry) v.sym(x0, y0 + h - 1, z, e.brow); }
}
export function mouth(v: V, A: Anchors, y: number, w: number, c: Col = P.DARK, o: { teeth?: Col; fangs?: Col; part?: string; z?: number } = {}) {
  const yy = A.headY0 + y, z = o.z ?? A.faceZ;
  v.part(o.part ?? 'head').box(-w / 2, yy, z, w / 2 - 1, yy, z, c);
  if (o.teeth) for (let x = -w / 2; x < w / 2; x += 2) v.set(x, yy, z, o.teeth);
  if (o.fangs) { v.sym(w / 2 - 1, yy - 1, z, o.fangs); v.sym(w / 2 - 1, yy, z, o.fangs); }
}

// ------------------------------------------------------------------ held things (right hand unless noted), built along +z from the fist cell
export function axe(v: V, A: Anchors, o: { len?: number; blade?: number; haft?: Col; metal?: Col; edge?: Col; part?: string; at?: [number, number, number] } = {}) {
  const [x, y, z] = o.at ?? A.wR, len = o.len ?? 18, b = o.blade ?? 6;
  v.part(o.part ?? 'weapon').line(x, y, z - 4, x, y, z + len, o.haft ?? P.WOOD).box(x, y, z - 1, x, y, z + 1, P.LEATH).set(x, y, z - 5, P.GOLD);
  const z0 = z + len - b;
  v.box(x, y - b, z0, x, y + 1, z + len, o.metal ?? P.IRON_D).box(x, y - b, z + len, x, y + 1, z + len, o.edge ?? P.EDGE).box(x, y - b, z0, x, y - b, z + len, o.edge ?? P.EDGE);
  v.box(x - 1, y - 2, z0 + 1, x + 1, y - 1, z0 + 2, o.metal ?? P.IRON).box(x, y + 2, z0 + 2, x, y + 3, z0 + 3, o.metal ?? P.IRON);
}
export function sword(v: V, A: Anchors, o: { len?: number; w?: number; blade?: Col; guard?: Col; grip?: Col; glow?: number; part?: string; at?: [number, number, number]; curve?: number } = {}) {
  const [x, y, z] = o.at ?? A.wR, len = o.len ?? 12, w = o.w ?? 1;
  v.part(o.part ?? 'weapon').box(x, y, z - 2, x, y, z, o.grip ?? P.LEATH_D).box(x - 1, y - 1, z + 1, x + 1, y + 1, z + 1, o.guard ?? P.GOLD_D);
  for (let i = 0; i < len; i++) { const cy = y + Math.round((o.curve ?? 0) * (i / len) * (i / len)); v.box(x, cy - (w > 1 ? 1 : 0), z + 2 + i, x, cy + (w > 2 ? 1 : 0), z + 2 + i, o.blade ?? P.EDGE, o.glow ?? 0); }
}
export function staff(v: V, A: Anchors, o: { len?: number; wood?: Col; part?: string; at?: [number, number, number]; back?: number } = {}) {
  const [x, y, z] = o.at ?? A.wR, len = o.len ?? 20, back = o.back ?? 8;
  v.part(o.part ?? 'weapon').line(x, y, z - back, x, y, z + len, o.wood ?? P.WOOD_D);
  return [x, y, z + len + 1] as [number, number, number];
}

/** a cluster of leaves / foliage blobs (ellipsoids with a lighter top) */
export function foliage(v: V, cx: number, cy: number, cz: number, r: number, c: Col, light: Col, o: { g?: number; squash?: number } = {}) {
  v.ell(cx, cy, cz, r, r * (o.squash ?? 0.8), r, c, o.g ?? 0);
  v.paint(cc => (Math.hypot(cc.x + 0.5 - cx, cc.z + 0.5 - cz) < r * 0.85 && cc.y + 0.5 > cy + r * (o.squash ?? 0.8) * 0.45 && cc.c === c ? light : null));
}

/** stacked square tiers, each narrower than the last: hats, roofs, obelisks — a few big steps instead of a staircase */
export function tiers(v: V, cx: number, y0: number, cz: number, halves: number[], h: number, c: Col | ((i: number) => Col), o: { dz?: number; dx?: number; g?: number } = {}) {
  let y = y0;
  halves.forEach((r, i) => { const col = typeof c === 'function' ? c(i) : c, ox = Math.round((o.dx ?? 0) * i), oz = Math.round((o.dz ?? 0) * i); v.box(cx - r + ox, y, cz - r + oz, cx + r - 1 + ox, y + h - 1, cz + r - 1 + oz, col, o.g ?? 0); y += h; });
  return y;
}
/** a tidy cube cluster (foliage, moss, mushroom caps): a chamfered block with a lighter top */
export function bush(v: V, x0: number, y0: number, z0: number, w: number, h: number, d: number, c: Col, top: Col) {
  rbox(v, x0, y0, z0, x0 + w - 1, y0 + h - 1, z0 + d - 1, c, 1, true);
  rbox(v, x0 + 1, y0 + h - 1, z0 + 1, x0 + w - 2, y0 + h - 1, z0 + d - 2, top, 0, false);
}
