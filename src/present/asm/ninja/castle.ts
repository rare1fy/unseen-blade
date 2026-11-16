// 忍之章 · 城郭（castle 代理）：天守和城墙一带。灰白石垣（3～4 段大台阶）、白壁黑板的天守与橹、金鯱、枡形门、多闻橹，
// 军务道具（篝火、枪架、旗指物、拒马、阵幕、具足、番所、太鼓橹、马厩）和松、樱。和山寺分开：山寺是木构朱红 + 苔绿，城郭是石垣白壁黑板。
// 地面：战斗区是中间调的夯土（大块深浅），两翼是灰米色砂砾，只有通向地标的路铺大块花岗岩板，路边一圈暗色排水石。
// 写法照 temple.ts：每个组声明 foot / h / kinds / size，build 里以 p.x / p.z 为中心、p.s 为朝向（+1 = 在战斗区右边，开口朝 −x）。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, PLAY, hash, field, inPlay } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { oak, pine } from '../../scenes/flora';
import { ground } from '../../scenes/dress';
import { blackPine, roof } from '../../kyoto/temple_kit';
import { MOSS_BY, SAKURA } from '../season';
import type { Group, Layout, Locale, Place, Rect } from '../types';
import { CC, fr, ishigaki, storey, retile, hei, nsq, shell } from './castle_kit';
import { LANDMARKS, crownRoof, skirt } from './castle_keep';
import { MILITARY, WALLS } from './castle_props';

// ------------------------------------------------------------------ small pieces built here
/** a straw rice bale lying along x: a notched 6×6 cross-section, darker end caps with a light ring, two rope bands */
function tawara(w: Ctx['w'], X: number, Y: number, Z: number, L = 10) {
  w.box(X, Y, Z - 2, X + L - 1, Y + 5, Z + 3, CC.straw).box(X, Y + 1, Z - 3, X + L - 1, Y + 4, Z + 4, CC.straw);
  for (const e of [X, X + L - 1]) w.box(e, Y, Z - 2, e, Y + 5, Z + 3, CC.strawD).box(e, Y + 1, Z - 1, e, Y + 4, Z + 2, CC.strawL);
  for (const b of [X + 2, X + L - 3]) w.box(b, Y, Z - 3, b, Y + 5, Z + 4, CC.rope);
  w.box(X + 1, Y + 5, Z - 2, X + L - 2, Y + 5, Z + 3, CC.strawL);
}
/** a wooden bucket (notched round), two hoops, filled with water */
function oke(w: Ctx['w'], X: number, Y: number, Z: number) {
  nsq(w, X, Z, 2, Y, Y + 4, CC.woodL); w.box(X - 2, Y + 1, Z - 1, X + 2, Y + 1, Z + 1, CC.woodD).box(X - 1, Y + 1, Z - 2, X + 1, Y + 1, Z + 2, CC.woodD);
  w.box(X - 1, Y + 4, Z - 1, X + 1, Y + 4, Z + 1, 0x3e5866);
}

const NATURE: Group[] = [
  { id: 'matsu', name: '城松', tags: ['tree', 'pine'], foot: { w: 2.8, d: 2.4 }, h: 5.8, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, weight: 1.3, build(c, p) {
    // a cloud-pruned black pine leaning away from the floor, in a square kerb of dressed stone with gravel inside
    // out in a corner (|x| > 10) it leans back in toward the floor so its pads stay on the stage
    const w = c.w, X = M(p.x), Z = M(p.z), s = ((Math.abs(p.x) > 10 ? -1 : 1) * (p.s || 1)) as 1 | -1;
    w.box(X - 15, -1, Z - 13, X + 15, 1, Z + 13, CC.st[1]).box(X - 13, -1, Z - 11, X + 13, 1, Z + 11, null).box(X - 13, -1, Z - 11, X + 13, -1, Z + 11, CC.gravelD);
    w.box(X - 15, 1, Z - 13, X + 15, 1, Z - 13, CC.stC).box(X - 15, 1, Z + 13, X + 15, 1, Z + 13, CC.stC);
    blackPine(c, p.x + 0.15 * s, p.z, 4.6 + p.rnd(7) * 1.0, s, 3 + p.seed, { reach: 0.75 });
  } },
  { id: 'sakura', name: '城樱', tags: ['tree', 'sakura'], foot: { w: 2.4, d: 2.4 }, h: 7.0, kinds: ['wing', 'back', 'corner'], size: 'M', seasons: ['spring'], max: 2, weight: 2.2, build(c, p) {
    const col = SAKURA[Math.floor(p.rnd(1) * SAKURA.length) % SAKURA.length];
    const X = M(p.x), Z = M(p.z); c.w.box(X - 9, -1, Z - 9, X + 9, 0, Z + 9, CC.st[2]).box(X - 7, 0, Z - 7, X + 7, 0, Z + 7, CC.earthD);
    oak(c.w, p.x, p.z, 5.2 + p.rnd(2) * 1.4, { seed: p.seed, bark: 0x3a2a2c, dark: 0x241a1c, leaf: col[0], leafTop: col[1], low: 0.42, width: 1.1, vines: 0 });
  } },
];
const SUPPLY: Group[] = [
  { id: 'hyoro', name: '兵粮', tags: ['supply', 'low'], foot: { w: 2.4, d: 1.8 }, h: 1.35, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
    // rice bales stacked 3-2-1 on a pallet of boards, two sake casks with straw jackets beside them, a hand cart's shafts on the ground
    const w = c.w, X = M(p.x), Z = M(p.z), F = fr(w, X, p.s);
    F.box(-16, -1, Z - 9, 6, 0, Z + 9, CC.woodD);
    const bx = F.x(-15), L = 10, step = (n: number) => p.s < 0 ? bx - n - L + 1 : bx + n;
    for (let i = 0; i < 3; i++) tawara(w, step(0), 1, Z - 6 + i * 6, L);
    tawara(w, step(L + 1), 1, Z - 3, L); tawara(w, step(L + 1), 1, Z + 3, L);
    tawara(w, step(0), 7, Z - 3, L); tawara(w, step(0), 7, Z + 3, L); tawara(w, step(L + 1), 7, Z, L);
    tawara(w, step(0), 13, Z, L);
    for (const [a, z] of [[13, Z - 5], [13, Z + 6]] as const) {
      const cx = F.x(a); nsq(w, cx, z, 4, -1, 11, CC.strawD); w.box(cx - 4, 3, z - 3, cx + 4, 3, z + 3, CC.rope).box(cx - 3, 3, z - 4, cx + 3, 3, z + 4, CC.rope);
      nsq(w, cx, z, 3, 12, 12, CC.wood); w.box(cx - 1, 6, z + 4, cx + 1, 9, z + 4, CC.board);
    }
  } },
  { id: 'ido', name: '井户', tags: ['water', 'stone'], foot: { w: 2.0, d: 2.0 }, h: 2.6, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a square stone well curb with a plank lid on half of it, two posts with a beam and a pulley, a bucket on a rope, buckets by it
    const w = c.w, X = M(p.x), Z = M(p.z);
    shell(w, X - 9, -1, Z - 9, X + 9, 10, Z + 9, CC.st[0], 3); w.box(X - 9, 10, Z - 9, X + 9, 10, Z + 9, CC.stC).box(X - 6, 0, Z - 6, X + 6, 10, Z + 6, null);
    c.water((X - 6) * CELL, (Z - 6) * CELL, (X + 7) * CELL, (Z + 7) * CELL, 0x3e5866);
    w.box(X - 6, 0, Z - 6, X + 6, 0, Z + 6, 0x2a3a40);
    w.box(X - 9, 11, Z - 9, X + 9, 11, Z - 1, CC.wood).box(X - 9, 11, Z - 5, X + 9, 11, Z - 5, CC.woodD);
    for (const a of [-11, 10]) w.box(X + a, -1, Z - 1, X + a + 1, 34, Z, CC.woodD);
    w.box(X - 12, 33, Z - 1, X + 12, 35, Z, CC.wood).box(X - 1, 30, Z - 1, X + 1, 32, Z + 1, CC.iron);
    w.box(X, 18, Z + 1, X, 29, Z + 1, CC.rope); oke(w, X, 13, Z + 1);
    oke(w, X + 13, -1, Z + 10); oke(w, X + 8, -1, Z + 12);
  } },
  { id: 'dozo', name: '土藏', tags: ['building'], foot: { w: 3.2, d: 3.4 }, h: 4.5, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    // a fire-proof storehouse: stone footing, black tiled wainscot with a white square grid (namako), thick white plaster, the heavy
    // door on the floor side under a small tiled hood, a black crest, a gable roof with its ridge along z
    const w = c.w, X = M(p.x), Z = M(p.z), F = fr(w, X, p.s), HX = 17, HZ = 19;
    w.box(X - HX - 1, -1, Z - HZ - 1, X + HX + 1, 2, Z + HZ + 1, CC.st[1]).box(X - HX - 1, 2, Z - HZ - 1, X + HX + 1, 2, Z + HZ + 1, CC.stC);
    shell(w, X - HX, 3, Z - HZ, X + HX, 44, Z + HZ, CC.wall);
    const nam = (x: number, y: number, z: number, u: number) => w.set(x, y, z, (y - 3) % 5 === 4 || u % 5 === 2 ? CC.wall : CC.board);
    for (let y = 3; y <= 16; y++) { for (let x = X - HX; x <= X + HX; x++) { nam(x, y, Z + HZ, x); nam(x, y, Z - HZ, x); } for (let z = Z - HZ; z <= Z + HZ; z++) { nam(X + HX, y, z, z); nam(X - HX, y, z, z); } }
    w.box(X - HX, 17, Z - HZ, X + HX, 17, Z + HZ, CC.wallD).box(X - HX, 43, Z - HZ, X + HX, 44, Z + HZ, CC.wallD);
    // the door on the floor side
    F.box(-HX - 1, 3, Z - 7, -HX, 30, Z + 7, CC.board).box(-HX - 1, 3, Z - 1, -HX - 1, 30, Z, CC.boardD).box(-HX - 2, 15, Z - 5, -HX - 2, 16, Z - 3, CC.ironL).box(-HX - 2, 15, Z + 3, -HX - 2, 16, Z + 5, CC.ironL);
    F.box(-HX - 1, 31, Z - 9, -HX, 33, Z + 9, CC.wallD);
    F.box(-HX - 5, 34, Z - 11, -HX, 35, Z + 11, CC.tileD).box(-HX - 4, 36, Z - 10, -HX, 36, Z + 10, CC.tile);
    // the crest high on the gable end toward the camera
    for (const [du, dv] of [[-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0], [0, -3], [0, -2], [0, -1], [0, 1], [0, 2], [0, 3], [-2, -2], [2, 2], [-2, 2], [2, -2]]) w.set(X + du, 36 + dv, Z + HZ + 1, CC.board);
    roof(w, X - HX - 5, X + HX + 5, Z - HZ - 4, Z + HZ + 4, 45, { plates: [[0, 3], [5, 3], [5, 3], [5, 3]], hip: 1, up: [6, 3, 2], ridgeH: 4, gable: CC.wall, alongZ: true });
    retile(w, X - HX - 9, 45, Z - HZ - 8, X + HX + 9, 70, Z + HZ + 8);
  } },
];

// the near wing rows (in front of the camera's line): low pieces only (≤ 1.6 m)
const LOW: Group[] = [
  { id: 'yagura_cart', name: '箭车', tags: ['supply', 'weapon', 'low'], foot: { w: 1.6, d: 2.6 }, h: 1.5, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a two-wheeled hand cart along z loaded with arrow bundles in a box, its shafts on the ground toward the floor; wheels as notched
    // squares with a hub (no round stair-steps), a straw mat thrown over half the load
    const w = c.w, X = M(p.x), Z = M(p.z), F = fr(w, X, p.s);
    for (const a of [-5, 5]) { F.box(a, 0, Z - 3, a, 12, Z + 3, CC.woodD).box(a, 2, Z - 5, a, 10, Z + 5, CC.woodD); F.box(a, 5, Z - 1, a, 7, Z + 1, CC.iron); F.box(a, 1, Z - 4, a, 11, Z + 4, null); F.box(a, 2, Z - 3, a, 10, Z + 3, null); F.box(a, 6, Z - 3, a, 6, Z + 3, CC.wood).box(a, 2, Z, a, 10, Z, CC.wood); }
    F.box(-4, 7, Z - 12, 4, 8, Z + 10, CC.wood).box(-4, 9, Z - 12, -4, 14, Z + 10, CC.woodD).box(4, 9, Z - 12, 4, 14, Z + 10, CC.woodD).box(-4, 9, Z - 12, 4, 14, Z - 12, CC.woodD).box(-4, 9, Z + 10, 4, 14, Z + 10, CC.woodD);
    for (let z = Z - 10; z <= Z + 8; z += 4) F.box(-3, 9, z, 3, 17, z + 2, CC.pale).box(-3, 18, z, 3, 19, z + 2, CC.cloth).box(-3, 13, z, 3, 13, z + 2, CC.rope);
    F.box(-3, 20, Z - 1, 3, 20, Z + 8, CC.strawD).box(-3, 14, Z + 9, 3, 19, Z + 9, CC.strawD);
    F.box(-2, 0, Z + 11, -1, 7, Z + 20, CC.woodD).box(1, 0, Z + 11, 2, 7, Z + 20, CC.woodD).box(-2, 0, Z + 16, 2, 1, Z + 20, CC.woodD);
    F.box(-3, -1, Z - 14, 3, 6, Z - 13, CC.woodD);
    // arrow quivers leaning nowhere: three stood upright on the ground beside the cart
    for (const dz of [-6, 0, 6]) F.box(9, -1, Z + dz - 1, 11, 12, Z + dz + 1, CC.board).box(9, 13, Z + dz - 1, 11, 16, Z + dz + 1, CC.pale).box(9, 17, Z + dz - 1, 11, 17, Z + dz + 1, CC.cloth);
  } },
  { id: 'donou', name: '土囊垒', tags: ['barricade', 'low'], foot: { w: 2.6, d: 1.4 }, h: 1.0, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
    // a breastwork of straw-wrapped earth sacks in three courses (running bond), the top course a step back, a wooden shield board (tate)
    // propped behind it with a black crest stripe
    const w = c.w, X = M(p.x), Z = M(p.z), L = 18;
    for (let r = 0; r < 3; r++) {
      const y = r * 4, off = r & 1 ? 4 : 0, d0 = r === 2 ? -1 : -4, d1 = r === 2 ? 2 : 4;
      for (let x = X - L + off; x <= X + L - 6; x += 8) {
        const e = Math.min(x + 7, X + L);
        w.box(x, y - 1, Z + d0, e, y + 2, Z + d1, r & 1 ? CC.strawD : CC.straw).box(x, y + 3, Z + d0 + 1, e - 1, y + 3, Z + d1 - 1, r & 1 ? CC.straw : CC.strawL).box(e, y - 1, Z + d0, e, y + 2, Z + d1, CC.rope);
      }
    }
    for (const dx of [-11, 0, 11]) { const x = X + dx; w.box(x - 4, -1, Z - 9, x + 4, 13, Z - 8, CC.wood).box(x - 4, 9, Z - 9, x + 4, 10, Z - 9, CC.board).box(x - 1, -1, Z - 7, x + 1, 9, Z - 5, CC.woodD); }
  } },
  { id: 'ishigaki_stub', name: '崩石垣', tags: ['stone', 'low'], foot: { w: 2.6, d: 2.2 }, h: 1.4, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // the stub of an inner wall: a two-tier stone block whose floor-side end has lost its top tier, two fallen squared stones lying in
    // front, grass at its foot (dress); a stone lantern-less marker post on it
    const w = c.w, X = M(p.x), Z = M(p.z), F = fr(w, X, p.s);
    const a = F.x(-10), b = F.x(18);
    ishigaki(w, Math.min(a, b), Z - 14, Math.max(a, b), Z + 14, -1, [{ h: 8, inset: 0 }, { h: 7, inset: 3 }], { seed: p.seed + 2 });
    const k = F.x(-7), kk = F.x(4);
    w.box(Math.min(k, kk), 8, Z - 11, Math.max(k, kk), 14, Z + 11, null);
    F.box(-7, 7, Z - 11, 4, 7, Z + 11, CC.stTop);
    F.box(-17, -1, Z - 3, -12, 3, Z + 4, CC.st[2]).box(-17, 3, Z - 3, -12, 3, Z + 4, CC.stC);
    F.box(-15, -1, Z + 8, -11, 2, Z + 14, CC.st[0]).box(-15, 2, Z + 8, -11, 2, Z + 14, CC.stC);
    F.box(5, 8, Z - 11, 5, 13, Z + 11, CC.st[1]).box(5, 13, Z - 11, 5, 13, Z + 11, CC.stTop);
    F.box(10, 14, Z - 2, 13, 18, Z + 1, CC.st[1]).box(10, 19, Z - 2, 13, 19, Z + 1, CC.stC);
  } },
];
const FILLER: Group[] = [
  { id: 'f_tawara', name: '米俵', tags: ['supply'], foot: { w: 1.2, d: 1.0 }, h: 0.9, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
    const X = M(p.x), Z = M(p.z); tawara(c.w, X - 7, -1, Z - 3, 14); tawara(c.w, X - 7, -1, Z + 4, 14); tawara(c.w, X - 6, 5, Z, 12);
  } },
  { id: 'f_oke', name: '消防桶', tags: ['supply'], foot: { w: 1.0, d: 0.8 }, h: 0.9, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
    const w = c.w, X = M(p.x), Z = M(p.z);
    w.box(X - 8, -1, Z - 3, X + 8, 1, Z + 3, CC.woodD); for (const dx of [-5, 0, 5]) oke(w, X + dx, 2, Z); oke(w, X - 2, 7, Z); oke(w, X + 3, 7, Z);
  } },
  { id: 'f_ishi', name: '投石', tags: ['stone'], foot: { w: 1.0, d: 1.0 }, h: 0.6, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
    const w = c.w, X = M(p.x), Z = M(p.z);
    w.box(X - 6, -1, Z - 5, X + 1, 3, Z + 1, CC.st[0]).box(X + 1, -1, Z - 2, X + 6, 2, Z + 5, CC.st[2]).box(X - 3, 4, Z - 3, X + 3, 7, Z + 2, CC.st[1]).box(X - 3, 7, Z - 3, X + 3, 7, Z + 2, CC.stC);
  } },
];

// ------------------------------------------------------------------ a layout of its own: the inner bailey (honmaru)
// the keep pulled to one back side with the stair turning to it, a big back slot on the other side for a second tower or a storehouse,
// big wing slots for the stable and the long wall
const S = (id: string, kind: 'wing' | 'back' | 'corner', size: 'S' | 'M' | 'L', x: number, z: number, w: number, d: number, maxH?: number) =>
  ({ id, kind, size, x, z, w, d, s: (x > 0.5 ? 1 : x < -0.5 ? -1 : 0) as -1 | 0 | 1, ...(maxH ? { maxH } : {}) });
export const HONMARU: Layout = { id: 'honmaru', name: '本丸', landmark: { x: 3.4, z: -11.6, w: 13.4, d: 7.2 },
  path: [{ x0: -1.0, z0: -7.0, x1: 1.0, z1: 8.4 }, { x0: -1.0, z0: -8.8, x1: 4.6, z1: -7.0 }],
  slots: [
    S('L1', 'wing', 'L', -8.6, -5.4, 4.6, 5.4), S('L2', 'wing', 'M', -8.2, 0.6, 3.6, 3.6), S('L3', 'wing', 'S', -7.6, 4.0, 2.8, 2.6, 1.6),
    S('R1', 'wing', 'M', 8.8, -5.2, 3.6, 3.4), S('R2', 'wing', 'L', 8.8, 0.0, 4.6, 5.0), S('R3', 'wing', 'S', 7.6, 4.0, 2.8, 2.6, 1.6),
    S('BL', 'back', 'L', -6.6, -11.0, 5.6, 3.6), S('CL', 'corner', 'M', -11.2, -12.0, 3.6, 4.0), S('CR', 'corner', 'M', 11.3, -9.0, 3.6, 3.6),
  ] };

// ------------------------------------------------------------------ ground
const state = { lm: '' };
for (const l of LANDMARKS) { const b = l.build; l.build = (c, p) => { state.lm = l.id; b(c, p); }; }

function floor(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, paths = f.layout.path, moss = MOSS_BY[f.p.season], sd = f.p.seed % 7;
  state.lm = '';
  const near = (r: Rect, x: number, z: number, m: number) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL; let col: number;
    const onPath = paths.some(r => near(r, x, z, 0)), kerb = !onPath && paths.some(r => near(r, x, z, 0.21));
    const court = Math.abs(x) < 7.2 && z > -9.0 && z < 7.4, edge = !court && Math.abs(x) < 7.4 && z > -9.2 && z < 7.6;
    if (onPath) {
      // big dressed granite slabs: 16 × 12 cells, running bond, a dark joint
      const r = Math.floor(Z / 12), sx = X + (r & 1 ? 8 : 0), l = ((sx % 16) + 16) % 16, lz = ((Z % 12) + 12) % 12;
      col = lz === 11 || l === 15 ? CC.granJ : CC.gran[(((Math.floor(sx / 16) + r * 2) % 3) + 3) % 3];
    } else if (kerb) col = CC.gutter;
    else if (edge) col = CC.gutter;
    else if (court) {
      // packed earth in big soft blobs (two close tones), never a checker
      const fz = field(Math.floor(X / 10), Math.floor(Z / 10), 3 + sd);
      col = fz > 0.55 ? CC.earthD : fz < -0.75 ? CC.earthL : CC.earth;
    } else {
      // the wings: grey-beige gravel raked in wide bands along z, with grass taking the outer edges in big patches
      const g = field(Math.floor(X / 9), Math.floor(Z / 9), 11 + sd), outer = Math.abs(x) > 10.8 || z < -13.6;
      if (outer && g > 0.15) col = g > 0.75 ? moss[2] : moss[0];
      else col = (Math.floor(X / 6) & 1) ? CC.gravel : CC.gravelD;
    }
    w.set(X, -1, Z, col);
  }
}

/** a far keep silhouette (plain blocks, no coursing), for scenes whose landmark is not the keep */
function farKeep(c: Ctx, x: number, z: number) {
  const w = c.w, X = M(x), Z = M(z);
  w.box(X - 60, -1, Z - 40, X + 60, 14, Z + 30, CC.st[0]).box(X - 54, 15, Z - 34, X + 54, 28, Z + 24, CC.st[1]).box(X - 54, 28, Z - 34, X + 54, 28, Z + 24, CC.stTop);
  w.box(X - 44, 29, Z - 26, X + 44, 40, Z + 16, CC.board).box(X - 44, 41, Z - 26, X + 44, 52, Z + 16, CC.wall).box(X - 44, 51, Z - 26, X + 44, 52, Z + 16, CC.boardD);
  let y = skirt(c, X - 53, X + 53, Z - 35, Z + 25, 52);
  w.box(X - 32, y - 6, Z - 20, X + 32, y + 16, Z + 10, CC.wall).box(X - 32, y + 15, Z - 20, X + 32, y + 16, Z + 10, CC.boardD);
  for (let i = -2; i <= 2; i++) w.box(X + i * 12 - 2, y + 4, Z + 10, X + i * 12 + 2, y + 9, Z + 10, CC.hole);
  y = skirt(c, X - 41, X + 41, Z - 29, Z + 19, y + 17);
  w.box(X - 22, y - 6, Z - 15, X + 22, y + 14, Z + 5, CC.wall).box(X - 22, y + 13, Z - 15, X + 22, y + 14, Z + 5, CC.boardD);
  for (let i = -1; i <= 1; i++) w.box(X + i * 12 - 2, y + 3, Z + 5, X + i * 12 + 2, y + 8, Z + 5, CC.hole);
  crownRoof(c, X - 31, X + 31, Z - 24, Z + 14, y + 15, [[0, 4], [6, 4], [6, 4], [6, 4], [5, 4]], 2, [16, 7, 3]);
}
/** a cheap far wall along a line (cells): a plumb stone base in plain courses, the white wall flush on top of it (black boards below),
 *  one tile slab overhanging a cell each side and a ridge. Flush faces merge into long quads; only the overhang makes a concave line. */
function farWall(w: Ctx['w'], a0: number, a1: number, c: number, alongX: boolean, hs = 14, hw = 18) {
  const put = (u0: number, ya: number, v0: number, u1: number, yb: number, v1: number, col: number) => alongX ? w.box(u0, ya, c + v0, u1, yb, c + v1, col) : w.box(c + v0, ya, u0, c + v1, yb, u1, col);
  for (let y = -1; y < hs; y += 4) put(a0, y, -3, a1, Math.min(hs - 1, y + 2), 2, CC.st[((y + 1) >> 2) % 3]), put(a0, Math.min(hs - 1, y + 3), -3, a1, Math.min(hs - 1, y + 3), 2, CC.stJ);
  put(a0, hs, -3, a1, hs + 6, 2, CC.board);
  put(a0, hs + 7, -3, a1, hs + hw - 2, 2, CC.wall);
  put(a0, hs + hw - 1, -3, a1, hs + hw - 1, 2, CC.boardD);
  for (let u = a0 + 17; u < a1; u += 34) put(u, hs, -3, u + 1, hs + hw - 1, 2, CC.boardD);
  put(a0 - 1, hs + hw, -4, a1 + 1, hs + hw + 1, 3, CC.tile);
  put(a0 - 1, hs + hw + 2, -1, a1 + 1, hs + hw + 3, 0, CC.ridge);
}
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, r = f.p.rnd;
  // the outer walls along both sides and across the back
  for (const s of [-1, 1]) farWall(w, M(-17.6), M(3.4), M(s * 14.6), false);
  farWall(w, M(-15.6), M(15.6), M(-18.6), true, 16);
  // corner turrets on the far wall corners (one or both)
  for (const s of [-1, 1]) if (r(10 + s) < 0.7) {
    const X = M(s * 14.4), Z = M(-18.4), b = ishigaki(w, X - 22, Z - 22, X + 22, Z + 22, -1, [{ h: 12, inset: 0 }, { h: 10, inset: 3 }, { h: 8, inset: 3 }], { seed: 50 + s, plain: true });
    storey(w, X - 14, Z - 14, X + 14, Z + 14, b.y, 22, { bh: 10, win: 12, winH: 5, ports: true, lit: f.p.lamp > 0.6 });
    crownRoof(c, X - 20, X + 20, Z - 20, Z + 20, b.y + 20, [[0, 4], [5, 4], [5, 4], [5, 4]], 2, [10, 5, 3]);
  }
  // pines behind the walls
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i < 7; i++) pts.push([16.8 + (i % 2) * 1.6, -15 + i * 3.0, 7 + r(300 + i) * 2.5]);
  for (let i = 0; i < 7; i++) pts.push([-16.8 - (i % 2) * 1.6, -15 + i * 3.0, 7 + r(320 + i) * 2.5]);
  for (let i = 0; i < 8; i++) pts.push([-14 + i * 4 + (i % 2) * 0.8, -21.5 - (i % 2) * 1.4, 8 + r(340 + i) * 3]);
  pts.forEach(([x, z, h], i) => pine(w, x, z, h, CC.woodD, 0x24402e, 0x3a5e42, { seed: 90 + i + f.p.seed }));
  if (state.lm !== 'tenshu') farKeep(c, f.layout.landmark ? -Math.sign(f.layout.landmark.x || 1) * 7.5 : 0, -25.5);
}

// ------------------------------------------------------------------ dressing: short grass where gravel meets stone, moss at wall feet
function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  const w = c.w, sd = f.p.seed % 97, moss = MOSS_BY[f.p.season];
  const clear = (x: number, z: number) => f.clear.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const grassy = new Set<number>([moss[0], moss[2]]);
  const stoneNear = (x: number, z: number, d: number) => { for (let a = 0; a < 8; a++) { const ax = x + Math.cos(a * 0.785) * d, az = z + Math.sin(a * 0.785) * d; if (w.has(M(ax), 2, M(az))) return true; } return false; };
  const put = (kind: string, n: number, s: [number, number], want: (x: number, z: number) => boolean, tints: number[], cl = 5, sp = 0.4) => {
    let placed = 0;
    for (let t = 0; placed < n && t < n * 30; t++) {
      const cx = AREA.x0 - 3 + hash(t, sd, kind.length * 7 + 1) * (AREA.x1 - AREA.x0 + 6), cz = AREA.z0 - 4 + hash(t, sd, kind.length * 7 + 2) * (AREA.z1 - AREA.z0 + 4);
      if (inPlay(cx, cz) || clear(cx, cz) || !want(cx, cz)) continue;
      for (let k = 0; k < cl && placed < n; k++) {
        const x = cx + (hash(t, k, sd + 3) - 0.5) * sp * 2, z = cz + (hash(t, k, sd + 4) - 0.5) * sp * 2;
        if (inPlay(x, z) || clear(x, z)) continue;
        const y = ground(c, x, z); if (y == null || y > 0.08) continue;
        c.cards.add(kind, x, z, { y, s: s[0] + hash(t, k, 9) * (s[1] - s[0]), tint: tints[Math.floor(hash(t, k, 6) * tints.length)] }); placed++;
      }
    }
  };
  const winter = f.p.season === 'winter', gt = f.p.season === 'autumn' ? [0xb8a878, 0xa89868] : [0x9cac8c, 0x8c9c80, 0xa8b498];
  if (!winter) {
    put('grass', 260, [0.3, 0.5], (x, z) => grassy.has(w.get(M(x), -1, M(z))?.c ?? 0), gt, 7, 0.6);
    put('grass', 120, [0.28, 0.44], (x, z) => stoneNear(x, z, 0.35), gt, 4, 0.25);
    put('weeds', 40, [0.3, 0.45], (x, z) => stoneNear(x, z, 0.4) && Math.abs(x) > 6.5, gt, 3, 0.3);
  }
  // decals: moss at the feet of stone only (nothing on the battle floor: small dark decals there read as speckle)
  let n = 0;
  for (let t = 0; n < 26 && t < 900; t++) {
    const x = AREA.x0 + hash(t, sd, 31) * (AREA.x1 - AREA.x0), z = AREA.z0 + hash(t, sd, 32) * (AREA.z1 - AREA.z0);
    if (inPlay(x, z) || clear(x, z) || !stoneNear(x, z, 0.6)) continue;
    const y = ground(c, x, z); if (y == null || y > 0.05) continue;
    c.cards.add('mossdecal', x, z, { y, s: 0.6 + hash(t, 3) * 0.4, ry: Math.floor(hash(t, 4) * 4) * Math.PI / 2, tint: winter ? 0xc8ccd0 : 0xd0dcc0 }); n++;
  }
  void PLAY;
}

export const castle: Locale = {
  id: 'ninja_castle', name: '城郭', theme: 'ninja',
  layouts: ['axis', 'pair', 'offset'], extraLayouts: [HONMARU],
  landmarks: LANDMARKS, groups: [...MILITARY, ...WALLS, ...NATURE, ...SUPPLY, ...LOW], filler: FILLER,
  floor, far, dress,
};
