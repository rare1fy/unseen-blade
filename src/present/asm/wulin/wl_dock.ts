// 第四关 · 锁江 · 横江浮栈（wl_dock，wp/regB）：乌林水寨的栈桥和浮台。战斗区是一大片木栈板（钉在桩上，板缝一道道），四周是黑水；
// 两翼靠着锁在一起的斗舰船舷（黑漆船身三层板、红舷、女墙、船楼、桅杆），远处江面上连环船一排排、桅杆林立，有的已经着火；
// 栈板上是缆桩、成盘的铁索、油桶（可破坏物件照 arena.ts）。夜里只有灯笼、火盆和远处火船是亮的，江面反一点火光。
// 地标三选一：大斗舰（正后方横着一艘）/ 水门（两座望楼夹一道水门、铁索横江）/ 火船（后方一艘烧着的蒙冲）。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, PLAY, hash, SX, SZ } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { ground } from '../../scenes/dress';
import type { Group, Landmark, Layout, Locale, Place, Rect } from '../types';
import { WL, WL_MOOD, river, WATER_MARK, frame, faceOf, orient, deck, pile, flagpole, tent, fireBasket, lantern, chainCoil, chainRun, hull, smoke, wp } from './wl_kit';

const lit = (p: Place) => p.lamp > 0.3;
const lampLight = (c: Ctx, p: Place, at: [number, number, number], k = 1, d = 5) => { if (lit(p)) c.light(at, 0xff9a48, 2.2 * p.lamp * k, d); };
const fireLight = (c: Ctx, at: [number, number, number], k = 1, d = 7) => c.light(at, 0xff7a2a, 2.6 * k, d);

// ------------------------------------------------------------------ landmarks (back centre)
const LANDMARKS: Landmark[] = [
  { id: 'wl_doujian', name: '大斗舰', foot: { w: 14, d: 5.2 }, tags: ['ship', 'tall'], build(c, p) {
    // a great warship moored broadside across the back, its deckhouse two storeys, two masts, 曹 flags; a gangplank down to the deck
    const q = hull(c, p.x, p.z - 0.6, 0, { L: 190, tall: 24 });
    const B = frame(c.w, p.x, p.z, 0);
    B(-8, 0, 16, 8, 0, 30, WL.plank); for (let z = 18; z < 30; z += 3) B(-8, 0, z, 8, 0, z, WL.deckJ);
    flagpole(frame(c.w, p.x - 4.2, p.z - 0.6, 0), 0, 0, 70, { len: 26, wd: 14 }); flagpole(frame(c.w, p.x + 4.8, p.z - 0.6, 0), 0, 0, 62, { len: 22, wd: 12 });
    for (const s of [-1, 1]) { const f = lantern(B, s * 30, 18, 34, lit(p)); lampLight(c, p, wp(p.x, p.z, 0, f[0], f[1], f[2]), 0.9, 5); }
    void q;
  } },
  { id: 'wl_shuimen', name: '水门', foot: { w: 13, d: 5.0 }, tags: ['gate', 'tall'], build(c, p) {
    // the water gate: two timber watchtowers on stone footings either side of a channel, the great chain stretched between them over
    // the water, a portcullis of logs half raised; fire baskets on the tower tops
    const B = frame(c.w, p.x, p.z, 0);
    for (const s of [-1, 1]) {
      const X = s * 58;
      B(X - 18, -1, -24, X + 18, 6, 12, 0x5a5650); B(X - 18, 6, -24, X + 18, 6, 12, 0x6e6a64);
      for (const a of [X - 15, X + 12]) for (const b of [-21, 8]) B(a, 7, b, a + 3, 64, b + 3, WL.woodD);
      for (let y = 18; y < 62; y += 14) { B(X - 15, y, -21, X + 15, y + 1, -18, WL.wood); B(X - 15, y, 8, X + 15, y + 1, 11, WL.wood); B(X - 15, y, -21, X - 12, y + 1, 11, WL.wood); B(X + 12, y, -21, X + 15, y + 1, 11, WL.wood); }
      B(X - 17, 64, -23, X + 17, 66, 13, WL.woodD); B(X - 19, 67, -25, X + 19, 68, 15, 0x3a3c42); B(X - 14, 69, -20, X + 14, 70, 10, 0x4c4e55);
      const f = fireBasket(B, X, -5, 72, lit(p)); if (lit(p)) fireLight(c, wp(p.x, p.z, 0, f[0], f[1], f[2]), 0.8, 7);
    }
    // the channel between them (water), the chain across it hung from the towers' rails, the log portcullis on a beam between them
    for (let x = -40; x <= 40; x++) for (let z = -30; z <= 10; z++) c.w.set(M(p.x) + x, -1, M(p.z) + z, WATER_MARK);
    chainRun(B, -45, 45, -6, 19); chainRun(B, -45, 45, 4, 33);
    B(-45, 44, -10, 45, 47, -6, WL.woodD); for (let x = -36; x <= 36; x += 6) B(x, 26, -9, x + 2, 43, -7, WL.tar);
  } },
  { id: 'wl_huochuan', name: '火船', foot: { w: 13, d: 5.2 }, tags: ['ship', 'fire', 'light'], build(c, p) {
    // a 蒙冲 rammed against the boom at the back and burning: its deckhouse a skeleton of charred posts, flames along its deck, smoke
    const q = hull(c, p.x, p.z - 0.6, 0, { L: 170, burning: true, tall: 18 });
    for (const l of q.lights) fireLight(c, l, 1.1, 9);
    smoke(c, [p.x - 1, 3.4, p.z - 0.6], { rate: 3.2, col: 0x3a3430 }); smoke(c, [p.x + 3, 3.0, p.z - 0.4], { rate: 2.4, col: 0x4a4440 });
    // the boom it rammed: the chain run out to a mooring post at each end, sagging low over the water between
    const B = frame(c.w, p.x, p.z, 0);
    for (const x of [-92, 90]) { B(x, -3, 18, x + 2, 8, 22, WL.tar); B(x - 1, 6, 17, x + 3, 7, 23, WL.iron); }
    chainRun(B, -90, -60, 20, 5); chainRun(B, 60, 90, 20, 5);
  } },
];

// ------------------------------------------------------------------ groups (the wings: hulls along the deck's sides, tents on rafts, stores)
const GROUPS: Group[] = [
  { id: 'wl_sidehull', name: '靠船', tags: ['ship', 'tall'], foot: { w: 3.0, d: 5.6 }, h: 4.6, kinds: ['wing', 'corner'], size: 'L', weight: 1.6, max: 2, build(c, p) {
    // a moored warship along the wing, its side to the battle floor (rotated a quarter), sometimes burning
    const burning = p.rnd(1) < 0.3, r = p.s > 0 ? 1 : 3;
    const q = hull(c, p.x, p.z, r, { L: 74, burning, mast: p.rnd(2) < 0.7, tall: 14 });
    for (const l of q.lights) fireLight(c, l, 0.9, 7);
    if (burning) smoke(c, [p.x, 2.6, p.z], { rate: 2.4, col: 0x3a3430 });
  } },
  { id: 'wl_raft', name: '浮台营帐', tags: ['camp', 'light'], foot: { w: 3.4, d: 3.6 }, h: 2.8, kinds: ['wing', 'back', 'corner'], size: 'L', build(c, p) {
    // a raft of logs on the water with an officer's tent on it, a fire basket, a rack of spears
    const r = orient(p), B = frame(c.w, p.x, p.z, r);
    for (let x = -22; x <= 22; x += 4) { B(x, -1, -24, x + 3, 0, 24, x % 8 ? WL.tar : WL.tarL); }
    B(-23, 0, -24, 23, 0, -23, WL.ironD); B(-23, 0, 23, 23, 0, 24, WL.ironD);
    const T = frame(c.w, p.x, p.z - 0.2, r); tent(T, 15, 12, 22, { officer: p.rnd(1) < 0.5, lit: lit(p) });
    const f = fireBasket(B, 16, 18, 10, lit(p)); if (lit(p)) fireLight(c, wp(p.x, p.z, r, f[0], f[1], f[2]), 0.8, 5);
    for (const a of [-19, -16, -13]) { B(a, 1, 18, a, 26, 18, WL.woodL); B(a, 27, 18, a, 30, 18, WL.ironL); }
  } },
  { id: 'wl_stores', name: '军资', tags: ['stores'], foot: { w: 3.0, d: 2.8 }, h: 1.8, kinds: ['wing', 'back', 'corner'], size: 'M', weight: 1.2, build(c, p) {
    // stacked crates of bolts and arrows under a canvas, two coils of chain, sacks of grain
    const r = orient(p), B = frame(c.w, p.x, p.z, r);
    deck(B, -20, 20, -18, 18, -1, { along: 'x' });
    for (const [a, b, h] of [[-14, -8, 10], [-2, -8, 14], [10, -8, 8]] as const) { B(a - 5, 0, b - 5, a + 5, h, b + 5, WL.wood); B(a - 5, h, b - 5, a + 5, h, b + 5, WL.woodL); B(a - 5, 0, b - 5, a + 5, 0, b + 5, WL.woodD); B(a - 5, Math.round(h / 2), b - 5, a + 5, Math.round(h / 2), b + 5, WL.ironD); }
    B(-18, 15, -13, 14, 16, -3, WL.canvasD);
    chainCoil(B, -10, 10, 0, 6); chainCoil(B, 9, 9, 0, 5);
  } },
  { id: 'wl_flags', name: '旗杆', tags: ['tall', 'cloth'], foot: { w: 1.6, d: 3.4 }, h: 5.4, kinds: ['wing', 'back', 'corner'], size: 'M', weight: 1.3, build(c, p) {
    // (laid out along local x: a wing group turns a quarter, so its long side runs along the floor's edge)
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    flagpole(B, -14, 0, 72 + Math.floor(p.rnd(1) * 8), { len: 26 }); flagpole(B, 14, 0, 64, { len: 22, burnt: p.rnd(2) < 0.3 });
  } },
  { id: 'wl_lamps', name: '灯桩', tags: ['light'], foot: { w: 1.2, d: 2.8 }, h: 2.6, kinds: ['wing', 'back'], size: 'S', weight: 1.0, build(c, p) {
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    for (const x of [-14, 10]) { const f = lantern(B, x, 0, 34, lit(p)); lampLight(c, p, wp(p.x, p.z, faceOf(p.s || 1), f[0], f[1], f[2]), 0.7, 4); }
  } },
];
const FILLER: Group[] = [
  { id: 'wl_post', name: '缆桩', tags: ['small'], foot: { w: 0.8, d: 0.8 }, h: 1.2, kinds: ['wing'], size: 'S', max: 6, build(c, p) {
    const B = frame(c.w, p.x, p.z, 0); B(-3, 0, -3, 3, 1, 3, WL.ironD); B(-2, 2, -2, 2, 14, 2, WL.tar); B(-3, 12, -3, 3, 13, 3, WL.iron);
  } },
  { id: 'wl_coil', name: '铁索盘', tags: ['small'], foot: { w: 1.2, d: 1.2 }, h: 0.4, kinds: ['wing'], size: 'S', max: 4, build(c, p) { chainCoil(frame(c.w, p.x, p.z, 0), 0, 0, 0, 7); } },
];

// ------------------------------------------------------------------ ground: the deck over the water
/** the deck's outline (m): the battle floor and a margin, the gangways out to the wings, the roads */
function deckRects(f: { layout: Layout }): Rect[] {
  const out: Rect[] = [{ x0: PLAY.x0 - 1.4, x1: PLAY.x1 + 1.4, z0: PLAY.z0 - 1.4, z1: PLAY.z1 + 2.4 }];
  for (const q of f.layout.path) out.push({ x0: q.x0 - 0.4, x1: q.x1 + 0.4, z0: q.z0, z1: q.z1 });
  // the long gangways along the wings to the moored ships (two per side), and a broad landing stage at the back
  for (const s of [-1, 1]) for (const z of [SZ(-3.4), SZ(2.4)]) out.push(s < 0 ? { x0: AREA.x0 - 4, x1: PLAY.x0, z0: z - 0.9, z1: z + 0.9 } : { x0: PLAY.x1, x1: AREA.x1 + 4, z0: z - 0.9, z1: z + 0.9 });
  out.push({ x0: SX(-7.6), x1: SX(7.6), z0: SZ(-9.6), z1: PLAY.z0 });
  return out;
}
function floor(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, rects = deckRects(f), sd = f.p.seed;
  const inR = (r: Rect, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL;
    const r = rects.find(q => inR(q, x, z));
    if (!r) { w.set(X, -1, Z, WATER_MARK); continue; }
    // planks along z, 5 cells wide, a dark seam between; the planks' ends staggered (a joint every 24 cells, offset per plank); the
    // floating stage's old planks are river-grey (the camp is brown earth, the tower honey-red — the three read apart at a glance)
    const pk = Math.floor(X / 5), lx = ((X % 5) + 5) % 5, endZ = ((Z + pk * 11) % 24 + 24) % 24;
    let col = lx === 4 ? WL.oldJ : endZ === 0 ? WL.oldD : [WL.old, WL.oldD, WL.oldL][Math.floor(hash(pk, Math.floor((Z + pk * 11) / 24), 5 + sd % 3) * 3)];
    // the deck's edge: a darker beam all round, iron nails every 6 cells
    const edge = !rects.some(q => inR(q, x + CELL, z) && inR(q, x - CELL, z) && inR(q, x, z + CELL) && inR(q, x, z - CELL));
    if (edge) col = (X + Z) % 6 === 0 ? WL.iron : WL.tar;
    w.set(X, -1, Z, col);
  }
  // the piles under the deck's edge (seen where it meets the water): every 1.4 m round the battle floor's margin
  const B = frame(w, 0, 0, 0), m = rects[0];
  for (let x = m.x0; x <= m.x1; x += 1.4) for (const z of [m.z0, m.z1]) pile(B, M(x), M(z), -2, -4);
  for (let z = m.z0; z <= m.z1; z += 1.4) for (const x of [m.x0, m.x1]) pile(B, M(x), M(z), -2, -4);
}
/** carve the water: every WATER_MARK cell at y = −1 becomes a dark bed two below and one water plane per connected sheet */
function carveWater(c: Ctx) {
  const w = c.w, marks = new Set<number>(), ck = (X: number, Z: number) => (X + 4096) * 8192 + (Z + 4096);
  for (const [k, v] of w.cells) { if (v.c !== WATER_MARK) continue; const y = (Math.floor(k / 1024) % 1024) - 512; if (y !== -1) continue; marks.add(ck(Math.floor(k / (1024 * 1024)) - 512, (k % 1024) - 512)); }
  // one big sheet: the bounds of all the marks (the water plane lies under the deck where they overlap; the deck covers it)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const k of marks) { const X = Math.floor(k / 8192) - 4096, Z = (k % 8192) - 4096; x0 = Math.min(x0, X); x1 = Math.max(x1, X); z0 = Math.min(z0, Z); z1 = Math.max(z1, Z); w.set(X, -1, Z, null); w.set(X, -3, Z, WL.bed, 1); }
  if (marks.size) river(c, x0 * CELL, z0 * CELL, (x1 + 1) * CELL, (z1 + 1) * CELL);
}
// ------------------------------------------------------------------ the far ring: the chained fleet on the river, the far shore's camp fires
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const r = f.p.rnd;
  carveWater(c);
  // rows of chained ships beyond the stage, back and both sides; a few burning
  const rows: Array<[number, number, number]> = [];
  for (let i = 0; i < 5; i++) rows.push([SX(-14 + i * 7), SZ(-17.5) - (i % 2) * 1.6, 0]);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) rows.push([s * (AREA.x1 + 5.5), SZ(-10 + i * 6), s > 0 ? 1 : 3]);
  rows.forEach(([x, z, rr], i) => {
    const burning = r(300 + i) < 0.3, q = hull(c, x, z, rr, { L: rr ? 90 : 110, burning, tall: 12 + Math.floor(r(320 + i) * 8) });
    if (burning) { for (const l of q.lights) fireLight(c, l, 1.2, 10); smoke(c, [x, 3, z], { rate: 2.6, col: 0x3a3430 }); }
  });
  // the great chain linking the back row (low over the water between the hulls)
  const B = frame(c.w, 0, SZ(-17.5), 0); chainRun(B, M(SX(-16)), M(SX(16)), 0, 4);
}
// ------------------------------------------------------------------ dressing: reeds at the water's edge on the far banks, embers and smoke
function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  const sd = f.p.seed;
  // reed beds where the stage's water meets the far edge (never on the deck)
  let n = 0, t = 0;
  while (n < 70 && t < 2000) {
    t++; const x = AREA.x0 - 4 + hash(t, sd, 31) * (AREA.x1 - AREA.x0 + 8), z = AREA.z1 + 1 + hash(t, sd, 32) * 2.5;
    const y = ground(c, x, z); if (y != null) continue;
    c.cards.add('reeds', x, z, { y: -0.12, s: 0.5 + hash(t, 3, sd) * 0.3, tint: 0x8a8a5a }); n++;
  }
  c.ambient({ kind: 'embers', color: 0xff8a3a, rate: 1.6, area: { x0: -16, z0: -20, x1: 16, z1: -6 } });
  c.ambient({ kind: 'dust', color: 0x8a8480, rate: 0.6 });
  void f;
}

export const wlDock: Locale = {
  id: 'wl_dock', name: '横江浮栈', theme: 'wulin',
  layouts: ['axis', 'offset', 'pair'],
  landmarks: LANDMARKS, groups: GROUPS, filler: FILLER,
  seasons: ['spring'], times: ['night'], weathers: ['clear', 'mist'], mood: WL_MOOD,
  floor, far, dress,
};
