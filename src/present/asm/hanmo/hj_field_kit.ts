// 黄巾残村 · 麦田（hj_field 代理）的道具库：调色板、麦地（成行的麦垄：块体 + 麦穗面片）、茅草顶（两三层大台阶）、夯土墙（夯层线）、
// 麦个子 / 麦垛、黄巾旗、陶瓮、筐、车轮，以及「水渠记号」（组在沙盒里删不掉地面格子：先在 y = −1 涂记号色，far() 统一挖开放水）。
// 铁律：横平竖直的大块体，斜面只用两三层宽台阶；花纹都是结构（夯层、板缝、麦垄、捆绳），没有逐格随机色。
import type { Ctx } from '../../scenes/stage';
import { M, type W } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { loc, locM, type Bx, type P3 } from '../../scenes/k_village';
import { addCardKind, stamp } from '../../scenes/cards';
import { plot, tone, type Mass } from '../../scenes/flora';
import type { Place, SeasonId } from '../types';
export { smoke } from '../ninja/village_kit';

/** 汉末北方乡野：麦秸金、夯土黄褐、旧木、灰陶、青灰石；黄巾的黄只做点缀 */
export const HC = {
  // thatch and straw
  th: 0xa8884c, thD: 0x6a5430, thM: 0x8c703e, thL: 0xc4a464, ridge: 0x4a3a26, ridgeL: 0x5e4a30,
  straw: 0xccb06a, strawD: 0xa08850, strawL: 0xdcc48a, rope: 0x8a7650, chaff: 0xb8a070,
  // timber
  wood: 0x6e5238, woodD: 0x4a3622, woodL: 0x8e6e4c, post: 0x3e2c1e, plank: 0x7e6044, char: 0x2a2220, charL: 0x3c322c,
  // earth
  ram: 0xa88c62, ramD: 0x8c7250, ramL: 0xbca07a, mud: 0x9a7e58, mudD: 0x7e6646,
  earth: 0x7a6646, earthD: 0x66543a, earthL: 0x8c7854, soil: 0x5c4830, soilD: 0x4a3a26, soilL: 0x6a5438,
  track: 0x8e7a56, trackD: 0x6c5a40, yard: 0x86704e, yardL: 0x947e5a,
  // stone, pottery, metal, cloth
  stone: 0x8a857a, stoneD: 0x6a665e, stoneL: 0xa29e92, pot: 0x8a5e40, potD: 0x6a4630, grey: 0x6e6a64, greyD: 0x56524e, greyL: 0x86827a,
  iron: 0x3a383e, ironL: 0x5a5862, bronze: 0x5e7a5a, bronzeD: 0x445a42,
  hemp: 0xc4b494, hempD: 0xa0906e, black: 0x26221e, dark: 0x1e1814, white: 0xe0d8c4,
  yellow: 0xd8a820, yellowD: 0xa87c18, yellowL: 0xe8c040, red: 0x9a3a26,
  // fire
  ember: 0xe0702a, emberL: 0xffb060, ash: 0x4a4440, ashL: 0x6a625a,
  // water (the ditch bed and the plane)
  bed: 0x1c2a28, bedL: 0x2a3c36, water: 0x3e6a64, waterL: 0x7aa49a,
  // green stuff
  leaf: 0x4e6e30, leafL: 0x6a8a3e, leafD: 0x3a5226,
};
/** the colour a group paints on the floor (y = −1) where far() should cut a water ditch (never shows: far() replaces it) */
export const WATER_MARK = 0x0a0b0c;

/** wheat / millet by season: body (stalk side), low (dark foot band), core (under the ear skin), ear (the skin tint) */
export interface CropPal { body: number; low: number; core: number; ear: number; side: number }
export const CROP: Record<SeasonId, CropPal[]> = {
  // summer: the wheat harvest — ripe gold, a greener plot here and there
  summer: [{ body: 0xa48c40, low: 0x5e5428, core: 0x7a6a30, ear: 0xd8be62, side: 0xc8ac58 }, { body: 0x8c8c3e, low: 0x4e5424, core: 0x66702e, ear: 0xb8bc5e, side: 0xa8ac54 }],
  // autumn: millet (粟) — deeper orange-gold heads
  autumn: [{ body: 0xa47e38, low: 0x5c4424, core: 0x7a5a2a, ear: 0xd8a240, side: 0xc89a48 }, { body: 0x9a7a3a, low: 0x564226, core: 0x70562a, ear: 0xc8984a, side: 0xb8904a }],
  spring: [{ body: 0x6a8a3a, low: 0x3e5226, core: 0x4e6a2e, ear: 0x8ab050, side: 0x7e9e48 }, { body: 0x6a8a3a, low: 0x3e5226, core: 0x4e6a2e, ear: 0x8ab050, side: 0x7e9e48 }],
  winter: [{ body: 0x8a7a58, low: 0x5a4e3a, core: 0x6a5c44, ear: 0xa89a78, side: 0x9a8c6a }, { body: 0x8a7a58, low: 0x5a4e3a, core: 0x6a5c44, ear: 0xa89a78, side: 0x9a8c6a }],
};
/** cut stubble on the floor: [base, row] — low contrast, the battle floor has to stay calm */
export const STUBBLE: Record<SeasonId, [number, number, number]> = {
  summer: [0xa08a56, 0x958050, 0xaa9662], autumn: [0x968458, 0x8a7a50, 0xa08e62], spring: [0x7a7a4a, 0x707044, 0x868656], winter: [0x8a8070, 0x7e7464, 0x968c7c],
};
/** grass on the ridges and verges: [body, dark, light] */
export const GRASS: Record<SeasonId, [number, number, number]> = {
  summer: [0x6a7a38, 0x586a30, 0x7c8a44], autumn: [0x8a7e46, 0x766c3c, 0x9a8e52], spring: [0x5e7e3a, 0x4e6c32, 0x6e8e44], winter: [0x8a8a80, 0x76766c, 0x9a9a90],
};
/** tufts of grass / weeds (card tints) */
export const TUFT: Record<SeasonId, number[]> = { summer: [0xa8b480, 0x98a870, 0xb4bc88], autumn: [0xc8b884, 0xb8a874, 0xd0c090], spring: [0x9cb088, 0x8ca078], winter: [0xa8aca0, 0x98a098] };
/** leaves of the field trees (elm / locust): [body, top] */
export const ELM: Record<SeasonId, Array<[number, number]>> = {
  summer: [[0x3e6a2c, 0x5a8a3c], [0x46702e, 0x628e40]], autumn: [[0x9a8a2a, 0xc8b040], [0x8e7a26, 0xbc9c38]], spring: [[0x5e8a3a, 0x86b452]], winter: [[0x4a3e34, 0x5e4e40]],
};
export const cropOf = (s: SeasonId, k: number) => CROP[s][k & 1];

// ------------------------------------------------------------------ frames
/** the local frame of a piece at world (x, z) metres, front turned by r quarter turns (0 = +z toward the camera, 1 = +x, 3 = −x) */
export const frame = (w: W, x: number, z: number, r = 0) => loc(w, M(x), M(z), r);
/** a wing group faces the battle floor (s = +1 → its front looks toward −x) */
export const faceOf = (s: number) => (s > 0 ? 3 : s < 0 ? 1 : 0);
/** back-row pieces face the camera, everything else faces the battle floor */
export const orient = (p: Place) => (p.z < -8.6 ? 0 : faceOf(p.s));
export const ring = (B: Bx, a: number, c: number, b: number, e: number, y: number, col: number) => { B(a, y, c, b, y, c, col); B(a, y, e, b, y, e, col); B(a, y, c, a, y, e, col); B(b, y, c, b, y, e, col); };
/** a plus-section pole (a round timber) from y0 to y1 */
export const pole = (B: Bx, x: number, z: number, y0: number, y1: number, col: number) => { B(x - 1, y0, z, x + 1, y1, z, col); B(x, y0, z - 1, x, y1, z + 1, col); };
/** a round-ish body: two crossed boxes (an octagon in plan, corners cut by k cells) */
export const octo = (B: Bx, x: number, z: number, r: number, k: number, y0: number, y1: number, col: number) => { B(x - r, y0, z - r + k, x + r, y1, z + r - k, col); B(x - r + k, y0, z - r, x + r - k, y1, z + r, col); };
export const lit = (p: Place) => p.lamp > 0.3;
export { loc, locM, type Bx, type P3 };

// ------------------------------------------------------------------ cards: the wheat skins and a standing tuft
// Painted pale and tinted with the crop colour. One texel = one 7 cm block. Ears are whole 2 × 3 heads with a lit top texel, stalks are
// whole vertical lines: tidy rows, never a scatter of single texels.
const EARP = { '1': '#f4ecd4', '2': '#dcd0b0', '3': '#bcae8c', '4': '#9c8e6e' };
/** the top of a wheat bed seen from above: heads in rows two texels apart, every other row offset by half a step */
addCardKind('maitop', { kind: 'panel', w: 16, h: 16, tile: true }, g => {
  const head = ['12', '22', '23', '33'];
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) stamp(g, k * 4 + (r & 1) * 2, r * 4, head, EARP);
});
/** the side of a wheat bed: ears standing above the top edge (rows 0–4), stalks below in pairs with dark gaps (holes show the body) */
addCardKind('maiside', { kind: 'panel', w: 16, h: 16, tile: true, sway: 0.015 }, g => {
  const tall = ['.1.', '122', '223', '233', '.3.'], short = ['12', '22', '23', '33'];
  for (let k = 0; k < 4; k++) { stamp(g, k * 4, k & 1 ? 1 : 0, tall, EARP); stamp(g, k * 4 + 2, k & 1 ? 0 : 2, short, EARP); }
  for (let x = 0; x < 16; x++) { const col = x % 4 === 3 ? null : x % 4 === 1 ? EARP['3'] : EARP['4']; if (!col) continue; g.fillStyle = col; g.fillRect(x, 5, 1, 11); }
  g.fillStyle = EARP['3']; g.fillRect(0, 9, 16, 1);
});
/** a standing tuft of ripe wheat (crossed quads): five stalks with heads, two leaves */
addCardKind('maituft', { kind: 'cross', w: 12, h: 16, sway: 0.05 }, g => {
  const st = '#8c7c50', lf = '#a8964e';
  for (const [x, h] of [[1, 11], [3, 14], [5, 12], [8, 15], [10, 12]] as const) {
    g.fillStyle = st; g.fillRect(x, 16 - h, 1, h);
    g.fillStyle = '#e4cc7a'; g.fillRect(x, 16 - h - 1, 2, 1); g.fillStyle = '#c8ae5e'; g.fillRect(x, 16 - h, 2, 3); g.fillStyle = '#a8904a'; g.fillRect(x + 1, 16 - h + 2, 1, 1);
  }
  g.fillStyle = lf; g.fillRect(4, 10, 3, 1); g.fillRect(9, 8, 2, 1); g.fillRect(0, 12, 2, 1);
});

// ------------------------------------------------------------------ wheat beds
/**
 * A bed of standing wheat over cells [X0..X1] × [Z0..Z1], H cells tall: a block prism (flora mass: dark foot band, side shading up to the
 * stalk colour, a darker core on top) with the ear skin laid over its top and the ear-and-stalk skin over the faces listed in `faces`
 * ('+z' = toward the camera, '-x' / '+x' = sides). The skins are cards, so a bed costs a few quads whatever its size.
 */
export function wheatBed(c: Ctx, X0: number, Z0: number, X1: number, Z1: number, H: number, pal: CropPal, faces: Array<'+z' | '-z' | '+x' | '-x'>, y0 = 0) {
  const m: Mass = { x0: X0, x1: X1, y0, y1: y0 + H - 1, z0: Z0, z1: Z1, cx: 0, cz: 0, top: pal.core, side: pal.body, low: pal.low, band: 2 };
  plot(c.w).masses.push(m);
  const C = CELL, T = 16, off = 0.5, xa = X0, xd = X1 + 1, za = Z0, zd = Z1 + 1, top = y0 + H;
  { const lx = xd - xa + 2 * off, lz = zd - za + 2 * off, x0 = xa - off, z1 = zd + off;
    c.cards.add('maitop', (xa + xd) / 2 * C, (za + zd) / 2 * C, { y: (top + off) * C, rx: -Math.PI / 2, ry: 0, sx: lx / T, sy: lz / T, uv: [lx / T, lz / T, x0 / T, -z1 / T], tint: pal.ear }); }
  // the side skin: from the foot band to three cells above the top (the ears stand over the edge)
  const hy = H + 3 - 2, yc = y0 + 2 + hy / 2;
  for (const f of faces) {
    const alongX = f === '+z' || f === '-z', nrm = f[0] === '+' ? 1 : -1, a = alongX ? xa : za, b = alongX ? xd : zd, len = b - a, mid = (a + b) / 2;
    const fp = alongX ? (nrm > 0 ? zd : za) + nrm * 0.35 : (nrm > 0 ? xd : xa) + nrm * 0.35;
    const px = alongX ? mid : fp, pz = alongX ? fp : mid, ry = alongX ? (nrm > 0 ? 0 : Math.PI) : (nrm > 0 ? Math.PI / 2 : -Math.PI / 2);
    const u0 = alongX ? (nrm > 0 ? a : -b) : (nrm > 0 ? -b : a);
    c.cards.add('maiside', px * C, pz * C, { y: yc * C, ry, sx: len / T, sy: hy / T, uv: [len / T, hy / T, u0 / T, 1 - hy / T], tint: pal.side });
  }
  return m;
}

// ------------------------------------------------------------------ roofs and walls
/**
 * A hipped thatch over local [x0..x1] × [z0..z1] from y: tiers as [inset, height], every tier stepping in on all four sides (big flat
 * slabs, never a one-cell stair). Each tier: a dark cut edge at its foot, a lit row along its top edge. A dark ridge roll on top with
 * two binding bands. Returns the top y.
 */
export function thatch(B: Bx, x0: number, x1: number, z0: number, z1: number, y: number, tiers: Array<[number, number]>, o: { ridge?: boolean } = {}) {
  let ix = 0, ya = y;
  for (let i = 0; i < tiers.length; i++) {
    const [d, th] = tiers[i]; ix += d;
    const a = x0 + ix, b = x1 - ix, c = z0 + ix, e = z1 - ix; if (a + 2 > b || c + 2 > e) break;
    B(a, ya, c, b, ya + th - 1, e, HC.th);
    ring(B, a, c, b, e, ya, i === 0 ? HC.thD : HC.thM);
    ring(B, a, c, b, e, ya + th - 1, HC.thL);
    ya += th;
  }
  const a = x0 + ix, b = x1 - ix, cz = Math.round((z0 + z1) / 2);
  if (o.ridge !== false && b - a > 8) {
    B(a + 1, ya, cz - 2, b - 1, ya + 1, cz + 2, HC.ridge); B(a + 1, ya + 2, cz - 1, b - 1, ya + 2, cz + 1, HC.ridgeL);
    for (const u of [a + 4, b - 5]) B(u, ya, cz - 3, u + 1, ya + 2, cz + 3, HC.rope);
  }
  return ya + 3;
}
/** rammed earth (夯土): a solid box with a darker course line every 5 cells on its four faces, a lighter top */
export function rammed(B: Bx, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col = HC.ram, line = HC.ramD) {
  B(x0, y0, z0, x1, y1, z1, col);
  for (let y = y0 + 4; y < y1; y += 5) ring(B, x0, z0, x1, z1, y, line);
  B(x0, y1, z0, x1, y1, z1, HC.ramL);
}

// ------------------------------------------------------------------ straw: sheaves, stooks, stacks
/** a standing sheaf (麦个子): a 4 × 4 bundle of stalks, a rope band, the ear head a little wider and lighter */
export function sheaf(B: Bx, a: number, b: number, y: number, pal: CropPal, h = 12) {
  B(a - 1, y, b - 1, a + 2, y + h - 4, b + 2, HC.strawD);
  B(a - 1, y + 4, b - 1, a + 2, y + 4, b + 2, HC.rope);
  B(a - 2, y + h - 3, b - 2, a + 3, y + h - 1, b + 3, pal.ear); B(a - 1, y + h, b - 1, a + 2, y + h, b + 2, tone(pal.ear, 1.1));
}
/** a sheaf lying along local x from a0 to a1 (the ear end at a1), centred on b */
export function sheafLying(B: Bx, a0: number, a1: number, b: number, y: number, pal: CropPal) {
  const e = a1 > a0 ? 1 : -1, ea = a1 - e * 4;
  B(a0, y, b - 1, ea, y + 2, b + 2, HC.strawD); B(ea + e, y, b - 2, a1, y + 3, b + 3, pal.ear);
  const mid = Math.round((a0 + ea) / 2); B(mid, y, b - 1, mid, y + 2, b + 2, HC.rope);
}
/** a stook (麦垛子): sheaves stood together in a 2 × 3 block with a cap sheaf laid across the top */
export function stook(B: Bx, a: number, b: number, pal: CropPal) {
  for (const da of [-4, 0, 4]) for (const db of [-3, 1]) sheaf(B, a + da, b + db, -1, pal, 13);
  B(a - 7, 13, b - 1, a + 8, 15, b + 2, HC.straw); B(a - 7, 13, b - 1, a - 5, 15, b + 2, pal.ear); B(a + 6, 13, b - 1, a + 8, 15, b + 2, pal.ear);
}
/**
 * A straw rick (麦秸垛): a long loaf of straw in three wide tiers, its top plastered with mud against the rain (the North China way),
 * rope bands round the lowest tier. Local [−hx..hx] × [−hz..hz], H tall.
 */
export function rick(B: Bx, ox: number, oz: number, hx: number, hz: number, H: number) {
  const h1 = Math.round(H * 0.55), h2 = Math.round(H * 0.3), h3 = H - h1 - h2;
  B(ox - hx, -1, oz - hz, ox + hx, h1 - 1, oz + hz, HC.straw);
  B(ox - hx, -1, oz - hz, ox + hx, 0, oz + hz, HC.strawD);
  for (const u of [ox - hx + 4, ox, ox + hx - 4]) { B(u, 1, oz - hz, u, h1 - 2, oz - hz, HC.rope); B(u, 1, oz + hz, u, h1 - 2, oz + hz, HC.rope); }
  ring(B, ox - hx, oz - hz, ox + hx, oz + hz, h1 - 1, HC.strawL);
  B(ox - hx + 3, h1, oz - hz + 3, ox + hx - 3, h1 + h2 - 1, oz + hz - 3, HC.straw);
  ring(B, ox - hx + 3, oz - hz + 3, ox + hx - 3, oz + hz - 3, h1, HC.strawD);
  B(ox - hx + 6, h1 + h2, oz - hz + 6, ox + hx - 6, h1 + h2 + h3 - 1, oz + hz - 6, HC.mud);
  ring(B, ox - hx + 6, oz - hz + 6, ox + hx - 6, oz + hz - 6, h1 + h2, HC.mudD);
  return h1 + h2 + h3;
}

// ------------------------------------------------------------------ small things
/** a pottery jar (瓮): an octagonal body, a narrow shoulder, a dark mouth; grey ware or red-brown */
export function jar(B: Bx, a: number, b: number, s: number, col = HC.grey, y = -1) {
  const r = s, h = Math.round(s * 1.6);
  octo(B, a, b, r, Math.max(1, r >> 1), y, y + h, col);
  octo(B, a, b, r - 1, Math.max(1, (r - 1) >> 1), y + h + 1, y + h + 1, tone(col, 1.1));
  B(a - 1, y + h + 2, b - 1, a + 1, y + h + 2, b + 1, tone(col, 0.85)); B(a, y + h + 2, b, a, y + h + 2, b, HC.dark);
}
/** a round-ish basket (筐) of plaited willow: a body with a lighter rim and a band */
export function basket(B: Bx, a: number, b: number, r: number, h: number, fill?: number) {
  octo(B, a, b, r, 1, -1, h, HC.strawD); ring(B, a - r + 1, b - r + 1, a + r - 1, b + r - 1, h, HC.strawL); B(a - r, 2, b - r + 1, a + r, 2, b + r - 1, HC.rope);
  if (fill != null) B(a - r + 2, h, b - r + 2, a + r - 2, h, b + r - 2, fill);
}
/** a hemp sack, lying or standing */
export function sack(B: Bx, a: number, b: number, col = HC.hemp, lying = false) {
  if (lying) { B(a - 4, -1, b - 2, a + 4, 2, b + 2, col); B(a + 5, 0, b - 1, a + 6, 1, b + 1, HC.rope); B(a - 4, -1, b - 2, a + 4, -1, b + 2, tone(col, 0.85)); return; }
  B(a - 2, -1, b - 2, a + 2, 5, b + 2, col); B(a - 1, 6, b - 1, a + 1, 6, b + 1, tone(col, 0.9)); B(a - 1, 7, b, a + 1, 7, b, HC.rope);
}
/** a yellow headband (黄巾) dropped on the ground: a long strip with a knot */
export function headband(B: Bx, a: number, b: number, along = true) {
  if (along) { B(a - 6, -1, b, a + 4, -1, b + 1, HC.yellow); B(a + 4, 0, b - 1, a + 6, 0, b + 2, HC.yellowD); B(a + 7, -1, b + 1, a + 10, -1, b + 1, HC.yellow); }
  else { B(a, -1, b - 6, a + 1, -1, b + 4, HC.yellow); B(a - 1, 0, b + 4, a + 2, 0, b + 6, HC.yellowD); }
}
/**
 * A wheel standing in a vertical plane: the rim an octagon of three wide rects (never a pixel circle or a stair), spokes in a plus and a
 * cross, a hub. (X, Y, Z) world cells of the hub; axle 'z' = the wheel faces ±z (toward the camera), 'x' = faces ±x. t = thickness.
 */
export function wheelV(w: W, X: number, Y: number, Z: number, r: number, axle: 'x' | 'z', rim: number, spoke: number, hub: number, t = 2, paddles = 0) {
  const q = Math.round(r * 0.42), m = Math.round(r * 0.76), rects: Array<[number, number]> = [[r, q], [m, m], [q, r]];
  const inside = (a: number, b: number, sh: number) => rects.some(([p, s]) => Math.abs(a) <= p - sh && Math.abs(b) <= s - sh);
  const put = (a: number, b: number, k: number, col: number) => { if (axle === 'z') w.set(X + a, Y + b, Z + k, col); else w.set(X + k, Y + b, Z + a, col); };
  const R = r + paddles;
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
    let col: number | null = null;
    if (inside(a, b, 0) && !inside(a, b, 2)) col = rim;
    else if (inside(a, b, 2) && (Math.abs(a) <= 0 || Math.abs(b) <= 0)) col = spoke;
    else if (paddles && !inside(a, b, 0)) {
      const pa = (u: number, len: number) => [-len + 2, 0, len - 2].some(p => Math.abs(u - p) <= 1);
      if ((Math.abs(b) > r && Math.abs(b) <= R && Math.abs(a) <= q && pa(a, q)) || (Math.abs(a) > r && Math.abs(a) <= R && Math.abs(b) <= q && pa(b, q))) col = HC.woodL;
    }
    if (Math.abs(a) <= 1 && Math.abs(b) <= 1) col = hub;
    if (col == null || Y + b < 0) continue;
    for (let k = 0; k < t; k++) put(a, b, k, col);
  }
}
/** world metres of the centre of cell (X, Y, Z) */
export const at = (X: number, Y: number, Z: number): P3 => [(X + 0.5) * CELL, (Y + 0.5) * CELL, (Z + 0.5) * CELL];
