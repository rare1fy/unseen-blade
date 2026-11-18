// 第四关 · 锁江 · 乌林辕门（wl_camp，wp/regB）：江岸上的曹军大营。和浮栈完全不一样：脚下是泥地和夯土，一条条木板道穿过营地；
// 两翼是成排的军帐（灰白麻布、红边，军官帐顶插小旗）、刁斗、拒马、篝火、兵器架、粮车；后方是辕门（两根大柱、横梁、望楼）或
// 江边的造船台；远处是营栅和江上的船影。夜里篝火是一团团暖光。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, PLAY, hash, field, SX, SZ } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { ground } from '../../scenes/dress';
import type { Group, Landmark, Layout, Locale, Place, Rect } from '../types';
import { WL, WL_MOOD, frame, faceOf, orient, deck, flagpole, tent, fireBasket, lantern, chainCoil, hull, smoke, wp } from './wl_kit';

const lit = (p: Place) => p.lamp > 0.3;
const fireLight = (c: Ctx, p: Place, at: [number, number, number], k = 1, d = 5.5) => { if (lit(p)) c.light(at, 0xff8a3a, 2.4 * p.lamp * k, d); };

/** 拒马: a log on trestles with sharpened stakes through it, sticking out both ways (axis-aligned: the top-down camera reads the spikes) */
function cheval(B: ReturnType<typeof frame>, x0: number, x1: number, z: number) {
  for (const x of [x0 + 1, x1 - 2]) B(x, 0, z - 1, x + 1, 6, z + 1, WL.woodD);
  B(x0, 7, z - 1, x1, 8, z + 1, WL.woodD);
  for (let x = x0 + 3; x < x1 - 3; x += 6) { B(x, 7, z - 7, x + 1, 8, z + 7, WL.wood); B(x, 7, z - 8, x + 1, 7, z - 8, WL.woodL); B(x, 7, z + 8, x + 1, 7, z + 8, WL.woodL); }
}
/** 刁斗 on a post: the night watch's bronze pot, a ladder of rungs (on the post's face) */
function watchPost(B: ReturnType<typeof frame>, x: number, z: number, H: number) {
  B(x - 1, 0, z - 1, x + 1, H, z + 1, WL.woodD); for (let y = 4; y < H - 4; y += 4) B(x + 2, y, z, x + 3, y, z, WL.wood);
  B(x + 3, 0, z, x + 3, H - 4, z, WL.woodD);
  B(x - 4, H + 1, z - 4, x + 4, H + 4, z + 4, 0x6a6a50); B(x - 3, H + 5, z - 3, x + 3, H + 5, z + 3, 0x8a8a68); B(x - 5, H + 2, z, x - 5, H + 3, z, 0x6a6a50);
}

const LANDMARKS: Landmark[] = [
  { id: 'wl_yuanmen', name: '辕门', foot: { w: 13, d: 5.4 }, tags: ['gate', 'tall', 'light'], build(c, p) {
    // the camp's gate: two great posts on stone, a double beam across with the 曹 banner hung under it, a watch platform on each post,
    // the stockade running off both sides; fire baskets each side of the way through
    const B = frame(c.w, p.x, p.z, 0);
    for (const s of [-1, 1]) {
      const X = s * 22;
      B(X - 5, -1, -5, X + 5, 3, 5, 0x5a5650); B(X - 3, 4, -3, X + 3, 78, 3, WL.woodD); B(X - 4, 76, -4, X + 4, 78, 4, WL.ironD);
      B(X - 9, 52, -8, X + 9, 53, 8, WL.wood); for (let a = -8; a <= 8; a += 4) B(X + a, 54, -8, X + a, 60, -8, WL.woodD); B(X - 9, 60, -8, X + 9, 60, 8, WL.woodD);
      for (let a = 30; a <= 92; a += 3) { const t = 36 + ((a / 3) % 2 ? 2 : 0); B(s * a, -1, -2, s * a + s, t, 2, ((a / 3) % 3) ? 0x6a5038 : 0x54402c); B(s * a, t + 1, -1, s * a + s, t + 2, 1, 0x84684a); }
      const f = fireBasket(B, X + s * -10, 12, 14, lit(p)); fireLight(c, p, wp(p.x, p.z, 0, f[0], f[1], f[2]), 1.0, 6);
    }
    B(-26, 70, -3, 26, 73, 3, WL.wood); B(-26, 66, -2, 26, 67, 2, WL.woodD);
    B(-12, 40, 3, 12, 65, 3, WL.red); B(-12, 40, 3, 12, 41, 3, WL.black); B(-6, 46, 4, 6, 60, 4, WL.white); B(-3, 49, 5, 3, 57, 5, WL.black);
    smoke(c, [p.x - 1.6, 1.6, p.z + 0.8], { rate: 1.2, col: 0x5a5450 });
  } },
  { id: 'wl_dock_slip', name: '造船台', foot: { w: 13, d: 5.6 }, tags: ['ship', 'tall'], build(c, p) {
    // a slipway: a half-built hull on its stocks (the ribs bare at one end), scaffolds of poles, timber stacked, the river behind
    const B = frame(c.w, p.x, p.z, 0);
    for (let x = -80; x <= 80; x += 14) { B(x - 2, -1, -14, x + 2, 6, 14, WL.woodD); }
    hull(c, p.x - 1.4, p.z - 0.2, 0, { L: 120, mast: false, tall: 10 });
    for (let x = 40; x <= 72; x += 8) { B(x, 0, -16, x + 1, 30, -15, WL.wood); B(x, 0, 15, x + 1, 30, 16, WL.wood); B(x, 30, -16, x + 1, 31, 16, WL.wood); }
    for (const x of [-86, 80]) for (let y = 0; y < 50; y += 12) { B(x, y, -18, x + 2, y + 1, 18, WL.woodL); B(x, 0, -18, x + 1, 52, -17, WL.woodD); B(x, 0, 17, x + 1, 52, 18, WL.woodD); }
    for (let i = 0; i < 4; i++) B(-70 + i * 3, i * 4, 24, -40 - i * 3, i * 4 + 3, 32, i % 2 ? WL.woodL : WL.wood);
    chainCoil(B, 30, 26, 0, 7);
  } },
  { id: 'wl_tents', name: '中军帐', foot: { w: 12, d: 5.0 }, tags: ['camp', 'light'], build(c, p) {
    // the headquarters tent: a big tent on a plank floor, a canopy in front on poles, standards either side, braziers
    const B = frame(c.w, p.x, p.z, 0);
    deck(B, -60, 60, -30, 26, -1, { along: 'x' });
    const T = frame(c.w, p.x, p.z - 0.6, 0); tent(T, 40, 18, 40, { officer: true, lit: lit(p) });
    for (const x of [-30, 30]) B(x - 1, 0, 22, x + 1, 30, 24, WL.woodD); B(-32, 30, 4, 32, 31, 25, WL.red); B(-32, 31, 6, 32, 31, 23, WL.redD);
    for (const s of [-1, 1]) { flagpole(frame(c.w, p.x + s * 4.4, p.z + 0.6, 0), 0, 0, 66, { len: 24 }); const f = fireBasket(B, s * 46, 20, 12, lit(p)); fireLight(c, p, wp(p.x, p.z, 0, f[0], f[1], f[2]), 1.0, 6); }
  } },
];

const GROUPS: Group[] = [
  { id: 'wl_tentrow', name: '营帐', tags: ['camp'], foot: { w: 3.4, d: 5.4 }, h: 2.6, kinds: ['wing', 'corner'], size: 'L', weight: 1.6, max: 3, build(c, p) {
    // two or three tents in a row along the wing, a lane between them and the battle floor
    const r = faceOf(p.s || 1), n = p.rnd(1) < 0.5 ? 2 : 3;
    for (let i = 0; i < n; i++) { const zz = (i - (n - 1) / 2) * (n === 3 ? 1.75 : 2.4); const T = frame(c.w, p.x + (r === 1 || r === 3 ? 0 : zz), p.z + (r === 1 || r === 3 ? zz : 0), r); tent(T, 12, 10, 22, { officer: i === 1 && p.rnd(2) < 0.5, lit: lit(p) && p.rnd(3 + i) < 0.4 }); }
  } },
  { id: 'wl_campfire', name: '篝火', tags: ['fire', 'light', 'camp'], foot: { w: 2.6, d: 2.6 }, h: 1.6, kinds: ['wing', 'back', 'corner'], size: 'M', weight: 1.3, build(c, p) {
    // a camp fire in a ring of stones, a pot hung on a tripod over it, logs to sit on
    const B = frame(c.w, p.x, p.z, orient(p));
    for (const [a, b] of [[-6, 0], [6, 0], [0, -6], [0, 6], [-4, -4], [4, 4], [-4, 4], [4, -4]] as const) B(a - 1, 0, b - 1, a + 1, 1, b + 1, 0x5a5650);
    const on = lit(p) || p.rnd(1) < 0.4;
    if (on) { B(-3, 0, -3, 3, 0, 3, WL.ember, 1); B(-2, 1, -2, 2, 3, 2, WL.fire, 1); B(-1, 4, -1, 1, 5, 1, WL.fireL, 1); } else B(-3, 0, -3, 3, 0, 3, WL.ash);
    // a pot hung over it from a crossbar on two uprights
    for (const a of [-8, 8]) B(a, 0, 0, a, 18, 0, WL.woodD); B(-8, 19, 0, 8, 19, 0, WL.woodD); B(0, 15, 0, 0, 18, 0, WL.ironD); B(-3, 10, -3, 3, 14, 3, WL.ironD);
    B(-16, 0, -2, -12, 2, 10, WL.wood); B(12, 0, -10, 16, 2, 2, WL.wood);
    if (on) { c.light(wp(p.x, p.z, orient(p), 0, 6, 0), 0xff8a3a, 2.6 * Math.max(0.6, p.lamp), 6); smoke(c, wp(p.x, p.z, orient(p), 0, 20, 0), { rate: 1.6 }); }
  } },
  { id: 'wl_cheval', name: '拒马', tags: ['low'], foot: { w: 1.2, d: 3.6 }, h: 0.7, kinds: ['wing'], size: 'M', build(c, p) {
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)); cheval(B, -24, 24, 0);
  } },
  { id: 'wl_watch', name: '刁斗', tags: ['tall', 'light'], foot: { w: 1.4, d: 1.4 }, h: 3.6, kinds: ['wing', 'back', 'corner'], size: 'S', build(c, p) {
    const B = frame(c.w, p.x, p.z, 0); watchPost(B, 0, 0, 44); const f = lantern(B, 0, 0, 30, lit(p)); fireLight(c, p, wp(p.x, p.z, 0, f[0], f[1], f[2]), 0.6, 4);
  } },
  { id: 'wl_grain', name: '粮车', tags: ['stores'], foot: { w: 2.8, d: 2.8 }, h: 1.7, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    // a two-wheeled grain cart with sacks, the shafts down on a block
    const B = frame(c.w, p.x, p.z, orient(p));
    B(-18, 8, -9, 14, 10, 9, WL.wood); for (const s of [-1, 1]) { B(-6, 0, s * 11, 6, 13, s * 11 + s, WL.woodD); B(-2, 4, s * 12, 2, 9, s * 12, WL.wood); }
    for (let i = 0; i < 4; i++) { const x = -15 + i * 7; B(x, 11, -7, x + 5, 18, 7, 0xa89470); B(x + 1, 19, -2, x + 4, 19, 2, 0x86744f); }
    B(14, 0, -6, 20, 2, -5, WL.woodD); B(14, 0, 5, 20, 2, 6, WL.woodD); B(14, 3, -6, 15, 8, 6, WL.woodD);
  } },
  { id: 'wl_flags2', name: '旗杆', tags: ['tall', 'cloth'], foot: { w: 2.6, d: 1.0 }, h: 5.4, kinds: ['wing', 'back', 'corner'], size: 'M', weight: 1.0, build(c, p) {
    // two poles side by side along world x, their banners hanging off toward +x
    const B = frame(c.w, p.x, p.z, 0); flagpole(B, -16, 0, 70, { len: 26 }); flagpole(B, 4, 0, 60, { len: 22 });
  } },
];
const FILLER: Group[] = [
  { id: 'wl_stake', name: '木桩', tags: ['small'], foot: { w: 0.6, d: 0.6 }, h: 1.0, kinds: ['wing'], size: 'S', max: 6, build(c, p) { const B = frame(c.w, p.x, p.z, 0); B(-1, 0, -1, 1, 12, 1, WL.woodD); B(-2, 0, -2, 2, 1, 2, WL.mud); } },
  { id: 'wl_sack', name: '粮袋', tags: ['small'], foot: { w: 1.0, d: 1.0 }, h: 0.5, kinds: ['wing'], size: 'S', max: 4, build(c, p) { const B = frame(c.w, p.x, p.z, 0); B(-5, 0, -3, 5, 5, 3, 0xa89470); B(-4, 6, -2, 4, 6, 2, 0x86744f); B(-3, 0, 4, 3, 4, 8, 0xa89470); } },
];

// ------------------------------------------------------------------ ground: mud and packed earth, plank walkways, a trodden square
// (主会话 11-18: the floor was two browns random per 7-cell square — the 逐格随机碎点 the user banned. Now every change of colour or
// material is a big planned shape: the trodden square in one earth tone with a darker band of wheel ruts round it, two or three large
// puddles of wet mud (rectangles, the seed picks where), straw mats laid in front of each wing (where the tents stand), a scorched
// patch round each camp fire's place, the plank walkways in one board tone with straight seams; the ground beyond in one dark tone.)
/** the floor's planned patches (m), from the seed: puddles, mats, burns */
function campPatches(seed: number) {
  const r = (k: number) => hash(seed, k, 731), out: Array<{ r: Rect; col: number; seam?: number }> = [];
  const P = PLAY, W = P.x1 - P.x0, D = P.z1 - P.z0;
  // two or three wet-mud puddles, each a big rectangle with a smaller one overlapping it (an L / T outline, never a speckle)
  const n = 2 + (r(1) < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const cx = P.x0 + W * (0.2 + 0.6 * r(10 + i)), cz = P.z0 + D * (0.18 + 0.5 * r(20 + i)), hw = 1.2 + r(30 + i) * 1.4, hd = 0.8 + r(40 + i) * 0.9;
    out.push({ r: { x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd }, col: WL.mud });
    const s = r(50 + i) < 0.5 ? -1 : 1; out.push({ r: { x0: cx + s * hw * 0.3 - 0.7, x1: cx + s * hw * 0.3 + 0.7, z0: cz + hd - 0.2, z1: cz + hd + 1.0 }, col: WL.mud });
  }
  // straw mats in front of both wings (one long mat each side, plain straw, its edge a darker binding) — 主会话 11-18: the old mats
  // had a seam every 20 cells and read as stripes
  for (const s of [-1, 1]) { const x0 = s < 0 ? P.x0 + 0.3 : P.x1 - 2.1, x1 = x0 + 1.8; out.push({ r: { x0, x1, z0: P.z0 + D * 0.2, z1: P.z0 + D * 0.62 }, col: 0x8a7a4e, seam: 0x6a5c3a }); }
  // two scorched patches (old fires), a square of char with a ring of ash
  for (let i = 0; i < 2; i++) { const cx = P.x0 + W * (0.25 + 0.5 * r(60 + i)), cz = P.z0 + D * (0.55 + 0.25 * r(70 + i)); out.push({ r: { x0: cx - 1.0, x1: cx + 1.0, z0: cz - 1.0, z1: cz + 1.0 }, col: WL.ash }, { r: { x0: cx - 0.6, x1: cx + 0.6, z0: cz - 0.6, z1: cz + 0.6 }, col: WL.char }); }
  return out;
}
function floor(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, paths = f.layout.path, patches = campPatches(f.p.seed);
  const near = (r: Rect, x: number, z: number, m: number) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL; let col: number;
    const path = paths.find(r => near(r, x, z, 0));
    if (path) {
      // the plank walkways: one board tone, boards across the way, a dark seam every 5 cells, the two edge boards darker (the stringers)
      const ax = path.z1 - path.z0 > path.x1 - path.x0, k = ax ? Z : X, edge = ax ? (x < path.x0 + 0.2 || x > path.x1 - 0.2) : (z < path.z0 + 0.2 || z > path.z1 - 0.2);
      col = edge ? WL.deckD : ((k % 5) + 5) % 5 === 4 ? WL.deckJ : WL.plank;
    } else if (near(PLAY, x, z, 1.2)) {
      const p = patches.find(q => near(q.r, x, z, 0));
      if (p) col = p.seam != null && !near(p.r, x, z, -0.12) ? p.seam : p.col;   // (a mat's binding: its one-cell edge)
      else if (!near(PLAY, x, z, 0.4)) col = WL.earthD;   // the band of ruts round the square
      else col = WL.earth;
    } else col = 0x4e4a3e;   // beyond the square: one dark, packed tone (the tents and the stockade stand on it)
    w.set(X, -1, Z, col);
  }
}
// ------------------------------------------------------------------ the far ring: the stockade round the camp, tents beyond, the river's ships
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, r = f.p.rnd, B = frame(w, 0, 0, 0);
  const Z0 = M(SZ(-18.4)), X0 = M(SX(-17)), X1 = M(SX(17));
  for (let X = X0; X <= X1; X += 3) { const t = 34 + ((X / 3) % 2 ? 2 : 0); B(X, -1, Z0, X + 1, t, Z0 + 2, ((X / 3) % 3) ? 0x6a5038 : 0x54402c); B(X, t + 1, Z0 + 1, X + 1, t + 2, Z0 + 1, 0x84684a); }
  for (let i = 0; i < 6; i++) { const x = SX(-14 + i * 5.6), z = SZ(-21) - r(10 + i) * 1.6; tent(frame(w, x, z, 0), 14, 10, 24, { officer: i % 3 === 0, lit: lit(f.p) && r(20 + i) < 0.5 }); }
  for (let i = 0; i < 3; i++) hull(c, SX(-12 + i * 12), SZ(-26) - (i % 2) * 2, 0, { L: 120, burning: r(40 + i) < 0.35, tall: 14 });
  smoke(c, [SX(-6 + r(1) * 12), 2.4, SZ(-24)], { rate: 1.4, col: 0x4e4a46 });
}
function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  const sd = f.p.seed, clear = (x: number, z: number) => f.clear.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  let n = 0, t = 0;
  while (n < 140 && t < 4000) {
    t++; const x = AREA.x0 - 3 + hash(t, sd, 41) * (AREA.x1 - AREA.x0 + 6), z = AREA.z0 - 3 + hash(t, sd, 42) * (AREA.z1 - AREA.z0 + 3);
    if (x > PLAY.x0 - 1 && x < PLAY.x1 + 1 && z > PLAY.z0 - 1 && z < PLAY.z1 + 1) continue; if (clear(x, z)) continue;
    const y = ground(c, x, z); if (y == null || y > 0.06) continue;
    c.cards.add('grass', x, z, { y, s: 0.28 + hash(t, 2, sd) * 0.2, tint: 0x8a8470 }); n++;
  }
  c.ambient({ kind: 'embers', color: 0xff8a3a, rate: 0.9, area: { x0: -14, z0: -18, x1: 14, z1: -8 } });
  c.ambient({ kind: 'dust', color: 0x9a9080, rate: 1.0 });
}

export const wlCamp: Locale = {
  id: 'wl_camp', name: '乌林辕门', theme: 'wulin',
  layouts: ['axis', 'offset', 'garden', 'street'],
  landmarks: LANDMARKS, groups: GROUPS, filler: FILLER,
  seasons: ['spring'], times: ['night'], weathers: ['clear', 'mist'], mood: WL_MOOD,
  floor, far, dress,
};
