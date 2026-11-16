// 京都古寺的道具库（temple 代理）：瓦顶（深出檐、翘角两段台阶）、鸟居、石灯笼、提灯、黑松、竹、竹篱、筑地塀、狐像、手水钵、香炉。
// 铁律同 props.ts：只用横平竖直的大块体，斜坡和曲线一律换成 2～4 段宽台阶；花纹是结构（框、带、缝），不是随机色点。
// 摆放用米（M 换算），尺寸用格（CELL = 7 厘米），地面顶 y = 0（地面格在 y = −1）。
import { M, hash, type W } from '../scenes/props';
import { CELL } from '../bestiary/kit';
import type { Ctx } from '../scenes/stage';
import { tone, SKIN_K } from '../scenes/flora';

export type P3 = [number, number, number];
/** 格子中心（米） */
export const at = (X: number, Y: number, Z: number): P3 => [(X + 0.5) * CELL, (Y + 0.5) * CELL, (Z + 0.5) * CELL];

/** 古寺调色：每种材料三档（本体 / 暗缝 / 亮边） */
export const TC = {
  verm: 0xb8392a, vermD: 0x82261e, vermL: 0xd25536, endW: 0xe6dcc2, gold: 0xc89a48, goldD: 0x8a6a30,
  wood: 0x4c3428, woodD: 0x2e201a, woodL: 0x6c4c38, black: 0x24201f,
  plaster: 0xdcd4c2, plasterD: 0xbcb3a2, ochre: 0xc49a5c, ochreD: 0xa07a44,
  tile: 0x3c404c, tileD: 0x24262e, tileL: 0x525866, ridge: 0x2e3038, ridgeL: 0x464a56,
  stone: 0x8e887e, stoneD: 0x6e685f, stoneL: 0xa8a296, mortar: 0x544e46,
  slab: [0x84857c, 0x7c7d74, 0x8c8d83], joint: 0x45463f, kerb: 0x626359,
  sand: 0xbcb8ac, sandD: 0x99958a, gravel: 0x60625a, gravelB: 0x65675e, gravelL: 0x6f7167,
  moss: 0x3e5432, mossD: 0x30442a, mossL: 0x4e6840, earth: 0x403830,
  bronze: 0x4c4232, verdi: 0x4a7466, verdiL: 0x689486, verdiD: 0x34564c,
  bamboo: 0x5c8a40, bambooD: 0x3e6630, bambooL: 0x86b058, bambooY: 0xa89a5a, bambooYD: 0x7e7240,
  pine: 0x284632, pineD: 0x1c3024, pineL: 0x3e6446, bark: 0x4a3a34, barkD: 0x2e2422,
  /** glow tones: lamp windows at a warm mid (no bloom), a one-cell bright core that blooms a little */
  lampMid: 0xb06c34, lampCore: 0xffb868, red: 0xa83422, redCore: 0xf08a48, fox: 0xd8d2c4, bib: 0xc83a2a,
};

// ------------------------------------------------------------------ the heavy tiled roof
export interface RoofOpt {
  /** plates from the eave up: [inset from the plate below (cells), height (cells)]; the first inset is ignored */
  plates: Array<[number, number]>;
  /** how many of the lowest plates are hip (step in on all sides); the rest step in along z only (gable ends face ±x) */
  hip: number;
  /** corner lift of the eave plate: [first step length, second step length, tip jut] in cells */
  up?: [number, number, number];
  ridgeH?: number;
  /** colour of the gable triangles (the ±x ends of the gable plates); undefined = tile */
  gable?: number;
  /** a gold ornament hanging at the top of each gable */
  gegyo?: boolean;
  /** the ridge runs along z instead of x (gable ends face ±z) */
  alongZ?: boolean;
}
/**
 * A heavy Japanese roof over [x0..x1]×[z0..z1] (cells) from y: a few wide plates, each plate's eave row dark, its top row light, so
 * a slope reads as a few heavy courses of tile rather than a staircase. The eave plate turns up at its four corners in two clear
 * steps (+2, +4 cells) with a jutting tip; upper plates may be gable plates (irimoya). A thick ridge with raised ends on top.
 * Returns the y above the ridge.
 */
export function roof(w: W, x0: number, x1: number, z0: number, z1: number, y: number, o: RoofOpt): number {
  const [u1, u2, tip] = o.up ?? [16, 7, 3], az = !!o.alongZ;
  let ix = 0, iz = 0, ya = y;
  const set = (x: number, yy: number, z: number, c: number) => w.set(x, yy, z, c);
  for (let i = 0; i < o.plates.length; i++) {
    const th = o.plates[i][1];
    if (i > 0) { const d = o.plates[i][0]; if (i < o.hip) { ix += d; iz += d; } else if (az) ix += d; else iz += d; }
    const a = x0 + ix, b = x1 - ix, c = z0 + iz, e = z1 - iz; if (a > b || c > e) break;
    const band = i === 0 ? (o.plates[1]?.[0] ?? 4) : 0, gableP = i >= o.hip;
    for (let x = a; x <= b; x++) for (let z = c; z <= e; z++) {
      const dx = Math.min(x - a, b - x), dz = Math.min(z - c, e - z);
      let lift = 0;
      if (band) {
        const f = (t: number) => (t < u2 ? 4 : t < u1 ? 2 : 0);
        if (dz < band) lift = Math.max(lift, f(dx)); if (dx < band) lift = Math.max(lift, f(dz));
      }
      const edge = dx === 0 || dz === 0, gEnd = gableP && (az ? dz === 0 : dx === 0);
      for (let k = 0; k < th; k++) {
        const yy = ya + lift + k, bottom = k === 0, topRow = k === th - 1;
        let col = topRow ? TC.tileL : TC.tile;
        if (bottom && (edge || band)) col = TC.tileD;
        if (gEnd && o.gable != null && !bottom) col = topRow ? TC.woodD : o.gable;
        set(x, yy, z, col);
      }
      // the eave plate is solid under its lifted rim, so the inside never shows a hole
      if (lift) for (let k = 0; k < lift; k++) if (dx >= 2 && dz >= 2) set(x, ya + k, z, TC.tileD);
    }
    if (i === 0) {
      // the corner tips: the third step — a short thick block jutting past each corner, two cells above the corner run
      const tl = Math.max(3, u2 - 3);
      for (const [sx, sz] of [[a, c], [b, c], [a, e], [b, e]]) {
        const xa = sx === a ? a - tip : b - tl + 1, xb = sx === a ? a + tl - 1 : b + tip, za = sz === c ? c - tip : e - tl + 1, zb = sz === c ? c + tl - 1 : e + tip;
        for (let x = xa; x <= xb; x++) for (let z = za; z <= zb; z++) for (let k = 0; k < th; k++) set(x, ya + 6 + k, z, k === 0 ? TC.tileD : k === th - 1 ? TC.tileL : TC.tile);
      }
    }
    ya += th;
  }
  // the ridge with raised ends (onigawara)
  const rh = o.ridgeH ?? 5, a = x0 + ix, b = x1 - ix, c = z0 + iz, e = z1 - iz;
  if (rh <= 0) return ya;
  if (!az) {
    const cz = (c + e) >> 1, hw = Math.min(3, (e - c) >> 1);
    w.box(a - 1, ya, cz - hw, b + 1, ya + rh - 2, cz + hw, TC.ridge).box(a - 1, ya + rh - 1, cz - hw + 1, b + 1, ya + rh - 1, cz + hw - 1, TC.ridgeL);
    for (const ex of [a - 1, b + 1]) { const s = ex < 0 || ex === a - 1 ? -1 : 1; w.box(ex - (s < 0 ? 3 : 0), ya, cz - hw - 1, ex + (s > 0 ? 3 : 0), ya + rh + 2, cz + hw + 1, TC.ridge).box(ex - (s < 0 ? 3 : 0), ya + rh + 3, cz - hw, ex + (s > 0 ? 3 : 0), ya + rh + 3, cz + hw, TC.ridgeL); }
    if (o.gegyo) for (const gx of [a - 1, b + 1]) w.box(gx, ya - 6, cz - 2, gx, ya - 2, cz + 2, TC.gold).box(gx, ya - 8, cz - 1, gx, ya - 7, cz + 1, TC.goldD);
  } else {
    const cx = (a + b) >> 1, hw = Math.min(3, (b - a) >> 1);
    w.box(cx - hw, ya, c - 1, cx + hw, ya + rh - 2, e + 1, TC.ridge).box(cx - hw + 1, ya + rh - 1, c - 1, cx + hw - 1, ya + rh - 1, e + 1, TC.ridgeL);
    for (const ez of [c - 1, e + 1]) { const s = ez === c - 1 ? -1 : 1; w.box(cx - hw - 1, ya, ez - (s < 0 ? 3 : 0), cx + hw + 1, ya + rh + 2, ez + (s > 0 ? 3 : 0), TC.ridge); }
    if (o.gegyo) for (const gz of [c - 1, e + 1]) w.box(cx - 2, ya - 6, gz, cx + 2, ya - 2, gz, TC.gold).box(cx - 1, ya - 8, gz, cx + 1, ya - 7, gz, TC.goldD);
  }
  return ya + rh + 3;
}

/** a simple roof whose plates step in on all sides with a small square cap on top (pagoda storeys, lantern hoods) */
export function hipCap(w: W, x0: number, x1: number, z0: number, z1: number, y: number, plates: Array<[number, number]>, up: [number, number, number] = [10, 5, 2]) {
  return roof(w, x0, x1, z0, z1, y, { plates, hip: plates.length, up, ridgeH: 3 });
}

// ------------------------------------------------------------------ gates and lights
/** a vermilion torii facing +z: two thick posts on black sleeves, the nuki tie beam poking through, a centre strut with a plaque, the
 *  vermilion shimaki and the black kasagi lintel whose ends lift one clear step. h, span in metres (post centres). */
export function torii(w: W, x: number, z: number, h: number, span: number, o: { post?: number } = {}) {
  const X = M(x), Z = M(z), H = M(h), S = Math.round(M(span) / 2), p = o.post ?? 2;
  for (const sx of [-S, S]) {
    w.box(X + sx - p, -1, Z - p, X + sx + p - 1, H, Z + p - 1, TC.verm);
    w.box(X + sx - p - 1, -1, Z - p - 1, X + sx + p, 3, Z + p, TC.black);
  }
  const ny = Math.round(H * 0.72);
  w.box(X - S - p - 4, ny, Z - 1, X + S + p + 3, ny + 2, Z, TC.verm);
  w.box(X - 2, ny + 3, Z - 1, X + 1, H, Z, TC.verm).box(X - 3, ny + 4, Z, X + 2, H - 2, Z, TC.black).box(X - 2, ny + 5, Z + 1, X + 1, H - 3, Z + 1, TC.gold);
  w.box(X - S - p - 5, H + 1, Z - p, X + S + p + 4, H + 2, Z + p - 1, TC.verm);
  const L = S + p + 6;
  w.box(X - L + 4, H + 3, Z - p - 1, X + L - 5, H + 4, Z + p, TC.black);
  w.box(X - L - 1, H + 4, Z - p - 1, X - L + 4, H + 5, Z + p, TC.black).box(X + L - 5, H + 4, Z - p - 1, X + L, H + 5, Z + p, TC.black);
}

/** a Kasuga stone lantern: wide base, shaft with a ring, platform, the fire box glowing through windows on all four sides, a wide
 *  hood whose corners lift one step, and a jewel finial. s scales the height. Returns the flame position (metres). */
export function stoneLantern(w: W, x: number, z: number, s = 1, lit = true): P3 {
  const X = M(x), Z = M(z), k = (n: number) => Math.round(n * s);
  let y = -1;
  w.box(X - 5, y, Z - 5, X + 5, y + k(2), Z + 5, TC.stoneD); y += k(2) + 1;
  w.box(X - 4, y, Z - 4, X + 4, y + 1, Z + 4, TC.stone); y += 2;
  const sh = k(10); w.box(X - 2, y, Z - 2, X + 2, y + sh, Z + 2, TC.stone).box(X - 3, y + (sh >> 1), Z - 3, X + 3, y + (sh >> 1) + 1, Z + 3, TC.stoneL); y += sh + 1;
  w.box(X - 5, y, Z - 5, X + 5, y + 1, Z + 5, TC.stoneL).box(X - 4, y + 2, Z - 4, X + 4, y + 2, Z + 4, TC.stone); y += 3;
  const fy = y, fh = k(6);
  w.box(X - 3, y, Z - 3, X + 3, y + fh, Z + 3, TC.stone);
  const g = lit ? TC.lampMid : 0x1e1c24, gg = lit ? 1 : 0;
  w.box(X - 1, y + 1, Z - 3, X + 1, y + fh - 1, Z + 3, g, gg).box(X - 3, y + 1, Z - 1, X + 3, y + fh - 1, Z + 1, g, gg);
  if (lit) w.box(X, y + 2, Z - 3, X, y + fh - 2, Z + 3, TC.lampCore, 1).box(X - 3, y + 2, Z, X + 3, y + fh - 2, Z, TC.lampCore, 1);
  y += fh + 1;
  w.box(X - 7, y, Z - 7, X + 7, y + 1, Z + 7, TC.stoneL).box(X - 7, y, Z - 7, X + 7, y, Z + 7, TC.stoneD);
  for (const [a, b] of [[-7, -7], [4, -7], [-7, 4], [4, 4]]) w.box(X + a, y + 1, Z + b, X + a + 3, y + 2, Z + b + 3, TC.stoneL);
  w.box(X - 5, y + 2, Z - 5, X + 5, y + 3, Z + 5, TC.stone).box(X - 3, y + 4, Z - 3, X + 3, y + 5, Z + 3, TC.stoneL);
  w.box(X - 1, y + 6, Z - 1, X + 1, y + 8, Z + 1, TC.stone).set(X, y + 9, Z, TC.stoneL);
  return [x, (fy + fh / 2 + 0.5) * CELL, z];
}

/** a paper lantern (chochin) hanging with its top cap at Y: black caps, a glowing body with its corners cut (a plus in plan) */
export function chochin(w: W, X: number, Y: number, Z: number, col: number = TC.red, h = 7) {
  w.box(X, Y + 1, Z, X, Y + 3, Z, TC.black);
  for (let y = Y + 4; y < Y + 16 && !w.has(X, y, Z); y++) if ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].some(k => w.has(X, y + k, Z) && y + k < Y + 16)) w.set(X, y, Z, TC.black); else break;
  w.box(X - 2, Y, Z - 2, X + 2, Y, Z + 2, TC.black);
  w.box(X - 3, Y - h, Z - 2, X + 3, Y - 1, Z + 2, col, 1).box(X - 2, Y - h, Z - 3, X + 2, Y - 1, Z + 3, col, 1);
  w.box(X - 1, Y - h + 1, Z - 3, X + 1, Y - 2, Z + 3, TC.redCore, 1).box(X - 3, Y - h + 1, Z - 1, X + 3, Y - 2, Z + 1, TC.redCore, 1);
  w.box(X - 3, Y - (h >> 1) - 1, Z - 2, X + 3, Y - (h >> 1) - 1, Z + 2, TC.black).box(X - 2, Y - (h >> 1) - 1, Z - 3, X + 2, Y - (h >> 1) - 1, Z + 3, TC.black);
  w.box(X - 2, Y - h - 1, Z - 2, X + 2, Y - h - 1, Z + 2, TC.black);
  return at(X, Y - (h >> 1), Z);
}

// ------------------------------------------------------------------ garden pieces
/** a garden rock: a wide base tier and a narrower, offset top tier (two tones), optional moss cap */
export function rock(w: W, x: number, z: number, sx: number, sz: number, h: number, col = TC.stoneD, top = TC.stone, moss?: number) {
  const X = M(x), Z = M(z), h1 = Math.max(1, Math.round(h * 0.55)), ox = hash(X, Z, 3) < 0.5 ? 1 : -1;
  w.box(X - sx, -1, Z - sz, X + sx, h1, Z + sz, col).box(X - sx + 2 + ox, h1 + 1, Z - sz + 1, X + sx - 2 + ox, h, Z + sz - 2, top);
  if (moss != null) w.box(X - sx + 3 + ox, h + 1, Z - sz + 2, X + sx - 3 + ox, h + 1, Z + sz - 3, moss);
}
/** a trimmed azalea mound (karikomi): a wide low box and a smaller cap, both with corners cut */
export function karikomi(w: W, x: number, z: number, rx: number, rz: number, h: number, leaf: number, top: number) {
  const X = M(x), Z = M(z);
  w.box(X - rx, -1, Z - rz + 2, X + rx, h - 3, Z + rz - 2, leaf).box(X - rx + 2, -1, Z - rz, X + rx - 2, h - 3, Z + rz, leaf);
  w.box(X - rx + 3, h - 2, Z - rz + 3, X + rx - 3, h, Z + rz - 3, top);
  return { body: [X - rx, 0, Z - rz + 2, X + rx, h - 3, Z + rz - 2] as [number, number, number, number, number, number], cap: [X - rx + 3, h - 2, Z - rz + 3, X + rx - 3, h, Z + rz - 3] as [number, number, number, number, number, number] };
}
/** a seated stone fox (inari guardian) facing +z on a pedestal, with a red bib */
export function fox(w: W, x: number, z: number, flip = false) {
  const X = M(x), Z = M(z), f = flip ? -1 : 1;
  w.box(X - 5, -1, Z - 5, X + 5, 3, Z + 5, TC.stoneD).box(X - 4, 4, Z - 4, X + 4, 5, Z + 4, TC.stoneL);
  const y = 6;
  w.box(X - 3, y, Z - 3, X + 3, y + 4, Z + 2, TC.fox).box(X - 2, y + 5, Z - 2, X + 2, y + 9, Z + 2, TC.fox);
  w.box(X - 3, y + 6, Z + 1, X + 3, y + 8, Z + 3, TC.bib).box(X - 2, y + 10, Z - 2, X + 2, y + 13, Z + 2, TC.fox).box(X - 1, y + 10, Z + 3, X + 1, y + 12, Z + 4, TC.fox);
  w.box(X - 2, y + 14, Z - 1, X - 1, y + 16, Z, TC.fox).box(X + 1, y + 14, Z - 1, X + 2, y + 16, Z, TC.fox);
  w.set(X - 1, y + 12, Z + 3, TC.vermD).set(X + 1, y + 12, Z + 3, TC.vermD);
  w.box(X + 3 * f, y, Z - 5, X + 4 * f, y + 7, Z - 4, TC.fox).box(X + 3 * f, y + 8, Z - 5, X + 5 * f, y + 10, Z - 3, TC.fox);
}

/** a bamboo pole: green (now and then a yellowed one), a darker node ring every ~1 m; the leaves are the grove's shared canopy */
export function bamboo(w: W, x: number, z: number, h: number, seed: number) {
  const X = M(x), Z = M(z), H = M(h), yel = hash(seed, 2) < 0.18, c = yel ? TC.bambooY : TC.bamboo, n = yel ? TC.bambooYD : TC.bambooD;
  const r = hash(seed, 1) < 0.4 ? 1 : 0;
  w.box(X, -1, Z, X + r, H, Z + r, c);
  for (let y = 10 + Math.floor(hash(seed, 3) * 6); y < H; y += 14) w.box(X, y, Z, X + r, y, Z + r, n);
}
/** a bamboo fence (kenninji-gaki) along z at x: tall split-bamboo boards in two tones standing side by side, three dark horizontal
 *  bars, a post every ~1.8 m and a cap. h in metres. */
export function bambooFence(w: W, x: number, z0: number, z1: number, h: number) {
  const X = M(x), Za = M(Math.min(z0, z1)), Zb = M(Math.max(z0, z1)), H = M(h);
  for (let z = Za; z <= Zb; z++) w.box(X, -1, z, X + 1, H - 2, z, Math.floor((z - Za) / 3) & 1 ? TC.bambooY : TC.bambooYD);
  for (const y of [Math.round(H * 0.2), Math.round(H * 0.5), Math.round(H * 0.8)]) w.box(X - 1, y, Za, X + 2, y + 1, Zb, TC.bambooD);
  for (let z = Za; z <= Zb; z += 26) w.box(X - 1, -1, z - 1, X + 2, H, z + 1, TC.woodD);
  w.box(X - 2, H - 1, Za, X + 3, H, Zb, TC.bambooD);
}
/** an earthen temple wall (tsuiji-bei) along z at x: stone footing, ochre plaster with five white lines (the mark of a temple of
 *  rank), a dark wood band and a small tiled cap. h in metres. */
export function tsuiji(w: W, x: number, z0: number, z1: number, h: number) {
  const X = M(x), Za = M(Math.min(z0, z1)), Zb = M(Math.max(z0, z1)), H = M(h);
  // the footing as wide as the wall (no ledge: a ledge would break every face along the wall into per-cell AO quads)
  w.box(X - 3, -1, Za, X + 3, 4, Zb, TC.stoneD).box(X - 3, 5, Za, X + 3, H, Zb, TC.ochre);
  for (let i = 0; i < 5; i++) { const y = H - 6 - i * 4; w.box(X - 3, y, Za, X - 3, y, Zb, TC.plaster).box(X + 3, y, Za, X + 3, y, Zb, TC.plaster); }
  w.box(X - 3, H + 1, Za, X + 3, H + 2, Zb, TC.woodD);
  // timber posts every ~2.4 m, standing proud of both faces, and a stone cap on each footing segment between them
  for (let z = Za + 4; z <= Zb - 2; z += 34) w.box(X - 4, 0, z, X + 4, H + 2, z + 2, TC.woodD).box(X - 4, -1, z - 1, X + 4, 1, z + 3, TC.stoneD);
  w.box(X - 7, H + 3, Za - 1, X + 7, H + 4, Zb + 1, TC.tile).box(X - 7, H + 3, Za - 1, X - 7, H + 3, Zb + 1, TC.tileD).box(X + 7, H + 3, Za - 1, X + 7, H + 3, Zb + 1, TC.tileD);
  w.box(X - 4, H + 5, Za - 1, X + 4, H + 6, Zb + 1, TC.tileL).box(X - 1, H + 7, Za - 1, X + 1, H + 8, Zb + 1, TC.ridge);
}

// ------------------------------------------------------------------ leaf skins on blocks built here (same cut-out tiles as flora.ts)
/** cut-out leaf skins over the top and the four sides of a leaf box (cells, inclusive), plus a drip fringe under the sides */
export function skinBox(c: Ctx, b: [number, number, number, number, number, number], body: number, kind: 'leafskin' | 'needleskin' = 'needleskin', drip = true) {
  const [X0, Y0, Z0, X1, Y1, Z1] = b, C = CELL, T = 16, off = 0.5, xa = X0, xd = X1 + 1, za = Z0, zd = Z1 + 1, y0 = Y0, y1 = Y1 + 1;
  { const x0 = xa - off, x1 = xd + off, z0 = za - off, z1 = zd + off, lx = x1 - x0, lz = z1 - z0;
    c.cards.add(kind, (x0 + lx / 2) * C, (z0 + lz / 2) * C, { y: (y1 + off) * C, rx: -Math.PI / 2, ry: 0, sx: lx / T, sy: lz / T, uv: [lx / T, lz / T, x0 / T, -z1 / T], tint: tone(body, SKIN_K.top) }); }
  const face = (alongX: boolean, f: number, a: number, bb: number, nrm: number) => {
    const len = bb - a + 1, hy = y1 - y0 + off, mid = (a + bb) / 2;
    const px = alongX ? mid : f + nrm * off, pz = alongX ? f + nrm * off : mid, ry = alongX ? (nrm > 0 ? 0 : Math.PI) : (nrm > 0 ? Math.PI / 2 : -Math.PI / 2);
    const u0 = alongX ? (nrm > 0 ? a - 0.5 : -(bb + 0.5)) : (nrm > 0 ? -(bb + 0.5) : a - 0.5);
    c.cards.add(kind, px * C, pz * C, { y: (y0 + hy / 2) * C, ry, sx: len / T, sy: hy / T, uv: [len / T, hy / T, u0 / T, y0 / T], tint: tone(body, SKIN_K.side) });
    if (drip) c.cards.add('leafdrip', px * C, pz * C, { y: (y0 + 1) * C, ry, sx: len / T, sy: 0.5, uv: [len / T, 0.5, u0 / T, kind === 'needleskin' ? 0 : 0.5], tint: tone(body, 0.8 * SKIN_K.drip) });
  };
  face(true, za, xa, xd, -1); face(true, zd, xa, xd, 1); face(false, xa, za, zd, -1); face(false, xd, za, zd, 1);
}

/**
 * A cloud-pruned black pine (niwaki): a trunk that climbs in straight runs joined by right-angle knees, leaning one way (dir = ±1 in
 * x), limbs out at right angles, and flat layered needle pads at their ends — a dark underside slab and a green body, skinned with
 * needle cards. The pads are the read: big, flat, horizontal.
 */
export function blackPine(c: Ctx, x: number, z: number, h: number, dir: number, seed: number, o: { reach?: number } = {}) {
  const w = c.w, X = M(x), Z = M(z), H = M(h), R = o.reach ?? 1;
  const bark = TC.bark, dark = TC.barkD;
  w.box(X - 4, -1, Z - 3, X + 4, 1, Z + 3, dark).box(X - 3, -1, Z - 4, X + 3, 1, Z + 4, dark);
  // trunk: up, knee toward dir, up, knee back a little, up
  const y1 = Math.round(H * 0.3), y2 = Math.round(H * 0.6), k1 = Math.round(8 * R) * dir, k2 = -Math.round(3 * R) * dir;
  w.box(X - 2, 0, Z - 2, X + 2, y1, Z + 2, bark);
  w.box(Math.min(X, X + k1) - 2, y1 - 4, Z - 2, Math.max(X, X + k1) + 2, y1, Z + 2, bark);
  w.box(X + k1 - 2, y1, Z - 2, X + k1 + 2, y2, Z + 2, bark);
  w.box(Math.min(X + k1, X + k1 + k2) - 2, y2 - 3, Z - 2, Math.max(X + k1, X + k1 + k2) + 2, y2, Z + 2, bark);
  const TX = X + k1 + k2;
  w.box(TX - 1, y2, Z - 1, TX + 1, H - 6, Z + 1, bark);
  for (const yy of [6, y1 + 6]) w.box(X + (yy > y1 ? k1 : 0) - 2, yy, Z + 3, X + (yy > y1 ? k1 : 0) - 1, yy + 4, Z + 3, dark);
  w.box(TX - 1, y2 + 4, Z + 2, TX, y2 + 8, Z + 2, dark);   // the knot on the upper trunk sits on its own face, whichever way it leans
  // pads: [limb out dx, dz (cells), y, half sizes]
  const P: Array<[number, number, number, number, number, number]> = [
    [TX, Z, H - 5, 9, 7, 3],
    [X + k1 + Math.round(16 * R) * dir, Z + 2, y2 - 2, 12, 8, 3],
    [X + k1 - Math.round(12 * R) * dir, Z - 3, Math.round(H * 0.68), 9, 7, 3],
    [X + Math.round(22 * R) * dir, Z + 4, y1 + 2, 13, 9, 3],
    [X - Math.round(10 * R) * dir, Z - 4, Math.round(H * 0.45), 8, 6, 3],
  ];
  P.forEach(([px, pz, py, hx, hz, th], i) => {
    if (hash(seed, i, 1) < 0.12 && i > 1) return;
    // the limb from the nearest trunk run, out at right angles, then up into the pad
    const fromX = py > y2 ? TX : py > y1 ? X + k1 : X, ly = py - 3;
    w.box(Math.min(fromX, px), ly, Math.min(Z, pz), Math.max(fromX, px), ly + 1, Math.max(Z, pz), bark);
    const b: [number, number, number, number, number, number] = [px - hx, py, pz - hz, px + hx, py + th, pz + hz];
    w.box(px - hx + 2, py - 1, pz - hz + 2, px + hx - 2, py - 1, pz + hz - 2, TC.pineD);
    w.box(b[0], b[1], b[2], b[3], b[4], b[5], TC.pine);
    w.box(px - hx + 3, py + th + 1, pz - hz + 2, px + hx - 3, py + th + 2, pz + hz - 2, TC.pineL);
    skinBox(c, b, TC.pine, 'needleskin');
    skinBox(c, [px - hx + 3, py + th + 1, pz - hz + 2, px + hx - 3, py + th + 2, pz + hz - 2], TC.pineL, 'needleskin', false);
  });
}
