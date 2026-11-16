// 忍之章 · 山寺（地点范例，主窗口写）：复用京都古寺的道具（kyoto/temple_kit、temple_hall），按拼装规范重新包装成地标和道具组。
// 其他地点照这个文件的写法：每个组声明占地（foot，米，未镜像，锚点在中心）、能进哪类插槽（kinds）、尺寸档（size）、标签（tags），
// build 里以 p.x / p.z 为中心、p.s 为朝向（+1 = 在战斗区右边，组的「开口面」朝 −x，也就是朝向战斗区）搭建。
// 拼装器会把组建在临时层里量实际格子再检查，所以 foot 写小了、摆出界了、撞了，都会被拒绝，不会进画面。
import type { Ctx } from '../../scenes/stage';
import { M, hash, AREA } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { oak, pine } from '../../scenes/flora';
import { masonry } from '../../scenes/k_forest';
import { TC, stoneLantern, rock, karikomi, fox, bamboo, bambooFence, tsuiji, blackPine, skinBox, chochin, torii, roof } from '../../kyoto/temple_kit';
import { hondo, shoro, chozuya, pagoda, toriiTunnel } from '../../kyoto/temple_hall';
import { templeDress } from '../../kyoto/temple_dress';
import { MAPLE_BY, MOSS_BY, SAKURA } from '../season';
import type { Group, Landmark, Locale, Place, Rect } from '../types';

const tree = (c: Ctx, p: Place, x: number, z: number, h: number, k: number) => {
  const pal = p.season === 'spring' && p.rnd(40 + k) < 0.5 ? SAKURA : MAPLE_BY[p.season], col = pal[Math.floor(p.rnd(41 + k) * pal.length) % pal.length];
  oak(c.w, x, z, h, { seed: p.seed + k, bark: 0x3e2a26, dark: 0x281a18, leaf: col[0], leafTop: col[1], low: 0.4, width: 1.05, vines: 0 });
};
const lampLight = (c: Ctx, p: Place, at: [number, number, number], k = 1) => { if (p.lamp > 0.3) c.light(at, 0xffa050, 2.4 * p.lamp * k, 4.5); };

// ------------------------------------------------------------------ landmarks (back centre)
const LANDMARKS: Landmark[] = [
  { id: 'hondo', name: '本堂', foot: { w: 15.0, d: 6.8 }, tags: ['building'], build(c, p) {
    const H = hondo(c, p.x, p.z + 2.6);
    if (p.lamp > 0.3) { c.light([H.big[0], H.big[1], H.big[2] + 0.6], 0xff7a40, 5 * p.lamp, 9); c.light([H.inner[0], H.inner[1], H.inner[2]], 0xffc070, 4 * p.lamp, 6); }
    for (const s of [-1, 1]) { stoneLantern(c.w, p.x + s * 2.65, p.z + 3.7, 1.15); lampLight(c, p, [p.x + s * 2.65, 0.55, p.z + 4.6]); }
  } },
  { id: 'pagoda', name: '五重塔', foot: { w: 7.8, d: 5.4 }, tags: ['tall'], build(c, p) {
    pagoda(c.w, p.x, p.z);
    for (const s of [-1, 1]) { stoneLantern(c.w, p.x + s * 3.4, p.z + 2.6, 1.0); lampLight(c, p, [p.x + s * 3.4, 0.55, p.z + 3.4], 0.9); }
  } },
  { id: 'gate', name: '山门', foot: { w: 9.0, d: 4.0 }, tags: ['gate', 'building'], build(c, p) {
    // a two-storey gate: stone base, eight vermilion columns, an upper storey with a balcony rail, a heavy hip roof
    const w = c.w, X = M(p.x), Z = M(p.z), HW = M(4.0), HD = M(1.6);
    masonry(w, X - HW, -1, Z - HD, X + HW, 3, Z + HD, TC.stone, TC.mortar, { ch: 2, cl: 12, cap: TC.stoneL });
    const xs = [-3.4, -1.2, 1.2, 3.4].map(v => X + M(v));
    for (const x of xs) for (const z of [Z - HD + 4, Z + HD - 4]) w.box(x - 2, 4, z - 2, x + 1, 44, z + 1, TC.verm);
    w.box(X - HW + 2, 30, Z - HD + 2, X + HW - 2, 33, Z + HD - 2, TC.woodD);
    w.box(X - HW + 4, 34, Z - HD + 4, X + HW - 4, 52, Z + HD - 4, TC.plaster);
    for (const x of xs) w.box(x - 1, 34, Z + HD - 4, x, 52, Z + HD - 4, TC.verm);
    w.box(X - HW + 2, 36, Z + HD - 2, X + HW - 2, 37, Z + HD - 2, TC.vermD).box(X - HW + 2, 34, Z + HD - 2, X + HW - 2, 34, Z + HD - 2, TC.vermD);
    roof(w, X - HW - 12, X + HW + 12, Z - HD - 10, Z + HD + 12, 53, { plates: [[0, 4], [8, 4], [7, 4], [7, 5], [6, 5]], hip: 2, up: [20, 9, 3], ridgeH: 5, gable: TC.plaster, gegyo: true });
    const lp = chochin(w, X, 28, Z + HD - 1, TC.red, 10); if (p.lamp > 0.3) c.light([lp[0], lp[1], lp[2] + 0.6], 0xff7a40, 4 * p.lamp, 7);
  } },
];

// ------------------------------------------------------------------ groups
const G: Group[] = [
  { id: 'karesansui', name: '枯山水', tags: ['garden', 'rock'], foot: { w: 4.2, d: 5.6 }, h: 1.0, kinds: ['wing'], size: 'L', weight: 1.2, build(c, p) {
    const w = c.w, X0 = M(p.x - 2.0), X1 = M(p.x + 2.0), Z0 = M(p.z - 2.7), Z1 = M(p.z + 2.7), rx = p.x + p.s * 0.5;
    for (let X = X0; X <= X1; X++) for (let Z = Z0; Z <= Z1; Z++) w.set(X, -1, Z, ((Z % 6) + 6) % 6 >= 4 ? TC.sandD : TC.sand);
    for (let X = X0 - 1; X <= X1 + 1; X++) for (const Z of [Z0 - 1, Z1 + 1]) w.set(X, -1, Z, TC.kerb).set(X, 0, Z, TC.kerb);
    for (let Z = Z0 - 1; Z <= Z1 + 1; Z++) for (const X of [X0 - 1, X1 + 1]) w.set(X, -1, Z, TC.kerb).set(X, 0, Z, TC.kerb);
    rock(w, rx, p.z - 0.6 + p.rnd(1) * 0.6, 8, 6, 12, TC.stoneD, TC.stone, TC.mossL);
    rock(w, rx - p.s * 1.0, p.z + 1.6, 5, 4, 7, TC.stoneD, TC.stone);
    if (p.rnd(2) < 0.6) rock(w, rx + p.s * 0.6, p.z - 1.9, 4, 3, 5, TC.stoneD, TC.stone, TC.mossL);
  } },
  { id: 'shoro', name: '钟楼', tags: ['building', 'tall', 'bell'], foot: { w: 3.0, d: 3.0 }, h: 5.3, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) { shoro(c.w, p.x, p.z); } },
  { id: 'chozuya', name: '手水舍', tags: ['water', 'building', 'light'], foot: { w: 2.8, d: 3.6 }, h: 4.0, kinds: ['wing'], size: 'M', build(c, p) {
    const q = chozuya(c, p.x, p.z); lampLight(c, p, q.lamp, 1.1);
  } },
  { id: 'lanterns', name: '灯笼对', tags: ['light', 'stone'], foot: { w: 2.2, d: 2.4 }, h: 2.5, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
    stoneLantern(c.w, p.x - 0.5 * p.s, p.z - 0.6, 1.0); stoneLantern(c.w, p.x + 0.5 * p.s, p.z + 0.7, 0.8);
    lampLight(c, p, [p.x - 0.3 * p.s, 0.55, p.z + 0.1], 0.9);
    rock(c.w, p.x + 0.8 * p.s, p.z - 0.8, 3, 2, 3, TC.stoneD, TC.stone, p.rnd(3) < 0.5 ? TC.mossL : undefined);
  } },
  { id: 'kitsune', name: '狐像鸟居', tags: ['gate', 'shrine'], foot: { w: 2.6, d: 2.8 }, h: 3.3, kinds: ['wing', 'back'], size: 'M', excludes: ['torii-row'], build(c, p) {
    torii(c.w, p.x, p.z - 0.6, 2.8, 1.7); fox(c.w, p.x - 1.0, p.z + 0.6); fox(c.w, p.x + 1.0, p.z + 0.6, true);
  } },
  { id: 'senbon', name: '千本鸟居', tags: ['gate', 'torii-row', 'shrine'], foot: { w: 2.4, d: 5.6 }, h: 3.5, kinds: ['wing'], size: 'L', excludes: ['shrine'], build(c, p) { toriiTunnel(c.w, p.x, p.z + 2.2, 4, 1.25, 3.1, 1.6); } },
  { id: 'momiji', name: '枫树', tags: ['tree'], foot: { w: 2.0, d: 2.0 }, h: 7.5, kinds: ['wing', 'back', 'corner'], size: 'M', max: 3, weight: 1.4, build(c, p) {
    tree(c, p, p.x, p.z, 5 + p.rnd(4) * 2, 1);
    if (p.rnd(6) < 0.5) stoneLantern(c.w, p.x - 0.7 * p.s, p.z + 0.7, 0.7, false);
  } },
  { id: 'kuromatsu', name: '黑松与石', tags: ['tree', 'rock'], foot: { w: 2.8, d: 2.4 }, h: 6.0, kinds: ['wing', 'back', 'corner'], size: 'M', max: 2, build(c, p) {
    blackPine(c, p.x + 0.2 * p.s, p.z - 0.3, 4.6 + p.rnd(7) * 1.2, (p.s || 1) as 1 | -1, 3 + p.seed, { reach: 0.8 });
    rock(c.w, p.x - 0.7 * p.s, p.z + 0.7, 5, 4, 6, TC.stoneD, TC.stone, TC.mossL);
  } },
  { id: 'chikurin', name: '竹林竹篱', tags: ['bamboo', 'tall'], foot: { w: 2.8, d: 5.6 }, h: 8.8, kinds: ['wing', 'corner'], size: 'L', build(c, p) {
    const w = c.w, s = p.s || 1, fx = p.x - s * 1.2;
    for (let i = 0; i < 12; i++) bamboo(w, p.x + s * (0.1 + p.rnd(10 + i) * 1.1), p.z - 2.6 + i * 0.46, 6.4 + p.rnd(30 + i) * 2.2, p.seed * 31 + i);
    for (let i = 0; i < 4; i++) {
      const X = M(p.x + s * (0.5 + p.rnd(50 + i) * 0.5)), Z = M(p.z - 2.0 + i * 1.4), hx = 7 + Math.floor(p.rnd(60 + i) * 3), hz = 8 + Math.floor(p.rnd(70 + i) * 3), y0 = M(5.4 + p.rnd(80 + i) * 1.2);
      const body: [number, number, number, number, number, number] = [X - hx, y0, Z - hz, X + hx, y0 + 5, Z + hz], cap: [number, number, number, number, number, number] = [X - hx + 3, y0 + 6, Z - hz + 3, X + hx - 3, y0 + 7, Z + hz - 3];
      w.box(...body, 0x2c4c26).box(...cap, 0x3e6432); skinBox(c, body, 0x2c4c26, 'leafskin', true); skinBox(c, cap, 0x3e6432, 'leafskin', false);
    }
    bambooFence(w, fx, p.z - 2.7, p.z + 2.7, 1.6);
  } },
  { id: 'chochin_row', name: '提灯廊', tags: ['light', 'festival'], foot: { w: 1.2, d: 5.6 }, h: 3.0, kinds: ['wing'], size: 'M', build(c, p) {
    const w = c.w, X = M(p.x);
    for (let i = 0; i < 4; i++) chochin(w, X, M(2.6), M(p.z - 2.4 + i * 1.6), TC.red, 6);
    if (p.lamp > 0.3) { c.light([p.x, 1.4, p.z - 1.2], 0xff7040, 2 * p.lamp, 4); c.light([p.x, 1.4, p.z + 1.6], 0xff7040, 2 * p.lamp, 4); }
    w.box(X, M(2.6) + 3, M(p.z - 2.8), X, M(2.6) + 3, M(p.z + 2.6), TC.black);
    w.box(X - 1, -1, M(p.z - 2.9), X, M(2.6) + 4, M(p.z - 2.7), TC.wood).box(X - 1, -1, M(p.z + 2.6), X, M(2.6) + 4, M(p.z + 2.8), TC.wood);
  } },
  { id: 'karikomi', name: '修剪灌木', tags: ['hedge'], foot: { w: 3.0, d: 1.4 }, h: 0.7, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
    const b = karikomi(c.w, p.x, p.z, 12 + Math.floor(p.rnd(90) * 6) - 4, 7, 8, TC.mossD, TC.mossL);
    skinBox(c, b.body, TC.mossD, 'leafskin', false); skinBox(c, b.cap, TC.mossL, 'leafskin', false);
  } },
  { id: 'jizo', name: '地藏列', tags: ['stone', 'shrine'], foot: { w: 2.4, d: 1.4 }, h: 0.95, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a row of small stone jizō with red bibs on a stone ledge, offerings at their feet
    const w = c.w, n = 4, X0 = M(p.x - 1.0), Z = M(p.z);
    w.box(X0 - 2, -1, Z - 4, X0 + 30, 1, Z + 4, TC.stoneD).box(X0 - 2, 2, Z - 4, X0 + 30, 2, Z + 4, TC.stoneL);
    for (let i = 0; i < n; i++) { const X = X0 + 2 + i * 7; w.box(X, 3, Z - 2, X + 3, 9, Z + 1, TC.stone).box(X, 10, Z - 2, X + 3, 12, Z + 1, TC.stoneL).box(X, 7, Z + 1, X + 3, 8, Z + 2, TC.bib).box(X, 6, Z + 2, X + 3, 6, Z + 2, TC.bib); }
  } },
  { id: 'sakura', name: '樱树', tags: ['tree', 'sakura'], foot: { w: 2.4, d: 2.4 }, h: 7.2, kinds: ['wing', 'back', 'corner'], size: 'M', seasons: ['spring'], max: 2, weight: 2, build(c, p) {
    const col = SAKURA[Math.floor(p.rnd(1) * SAKURA.length) % SAKURA.length];
    oak(c.w, p.x, p.z, 5.4 + p.rnd(2) * 1.6, { seed: p.seed, bark: 0x3a2a2c, dark: 0x241a1c, leaf: col[0], leafTop: col[1], low: 0.42, width: 1.15, vines: 0 });
  } },
];
// the near wing rows (in front of the camera's line): only low pieces fit (≤ 1.6 m)
G.push(
  { id: 'koke_ishi', name: '苔石组', tags: ['rock', 'low'], foot: { w: 2.4, d: 2.2 }, h: 0.9, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
    const w = c.w; rock(w, p.x, p.z, 7, 5, 9, TC.stoneD, TC.stone, TC.mossL); rock(w, p.x - 0.8 * p.s, p.z + 0.6, 4, 3, 5, TC.stoneD, TC.stone, TC.mossL); rock(w, p.x + 0.6 * p.s, p.z - 0.7, 3, 3, 4, TC.stoneD, TC.stone);
    { const X = M(p.x), Z = M(p.z); w.box(X - 15, -1, Z - 13, X + 15, -1, Z + 13, MOSS_BY[p.season][1]).box(X - 12, -1, Z - 10, X + 12, -1, Z + 10, MOSS_BY[p.season][0]); }
  } },
  { id: 'tsukubai', name: '蹲踞', tags: ['water', 'stone', 'low'], foot: { w: 1.8, d: 1.6 }, h: 1.0, kinds: ['wing'], size: 'S', excludes: ['water'], build(c, p) {
    // a low stone wash basin with a bamboo spout, stepping stones in front and a small lantern-less rock group behind
    const w = c.w, X = M(p.x), Z = M(p.z);
    w.box(X - 5, -1, Z - 5, X + 5, 5, Z + 5, TC.stone).box(X - 5, 6, Z - 5, X + 5, 6, Z + 5, TC.stoneL).box(X - 3, 3, Z - 3, X + 3, 6, Z + 3, null);
    c.water((X - 3) * CELL, (Z - 3) * CELL, (X + 4) * CELL, (Z + 4) * CELL, 0x4a7a8a);
    const bx = X + 7 * p.s; w.box(Math.min(bx, X + 2 * p.s), 9, Z, Math.max(bx, X + 2 * p.s), 10, Z + 1, TC.bamboo).box(bx, -1, Z, bx + (p.s > 0 ? 1 : -1), 10, Z + 1, TC.bamboo);
    for (const [dx, dz] of [[-9, 6], [-4, 10], [3, 12]]) w.box(X + dx * p.s - 2, -1, Z + dz - 2, X + dx * p.s + 2, 0, Z + dz + 2, TC.stoneL);
    rock(w, p.x + 0.7 * p.s, p.z - 0.6, 4, 3, 6, TC.stoneD, TC.stone, TC.mossL);
  } },
  { id: 'saisen', name: '赛钱箱与绘马', tags: ['shrine', 'low'], foot: { w: 2.2, d: 1.4 }, h: 1.5, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a wooden offering box with a slatted top and a low rack of hanging wooden votive plaques beside it
    const w = c.w, X = M(p.x), Z = M(p.z), a = X - 9 * p.s;
    w.box(a - 6, -1, Z - 4, a + 6, 7, Z + 4, TC.wood).box(a - 6, 8, Z - 4, a + 6, 8, Z + 4, TC.woodL);
    for (let k = -4; k <= 4; k += 2) w.box(a + k, 8, Z - 4, a + k, 8, Z + 4, TC.woodD);
    w.box(a - 6, 4, Z + 4, a + 6, 4, Z + 4, TC.gold);
    const b = X + 6 * p.s; w.box(b - 8, -1, Z, b - 7, 20, Z + 1, TC.woodD).box(b + 7, -1, Z, b + 8, 20, Z + 1, TC.woodD).box(b - 8, 19, Z, b + 8, 20, Z + 1, TC.woodD);
    w.box(b - 8, 19, Z + 2, b + 8, 19, Z + 2, TC.woodD);
    for (let k = -6; k <= 6; k += 3) w.box(b + k, 13, Z + 2, b + k + 1, 17, Z + 2, TC.woodL).set(b + k, 18, Z + 2, TC.bib);
  } },
);
const FILLER: Group[] = [
  { id: 'f_rock', name: '石', tags: ['rock'], foot: { w: 1.0, d: 1.0 }, h: 0.6, kinds: ['wing'], size: 'S', max: 3, build(c, p) { rock(c.w, p.x, p.z, 4 + Math.floor(p.rnd(1) * 3), 3, 4 + Math.floor(p.rnd(2) * 4), TC.stoneD, TC.stone, p.rnd(3) < 0.5 ? TC.mossL : undefined); } },
  { id: 'f_lantern', name: '小灯笼', tags: ['stone'], foot: { w: 0.9, d: 0.9 }, h: 2.1, kinds: ['wing'], size: 'S', max: 2, build(c, p) { stoneLantern(c.w, p.x, p.z, 0.7, false); } },
];

// ------------------------------------------------------------------ ground, far ring, dressing
function floor(c: Ctx, f: { layout: { path: Rect[]; court?: Rect }; p: Place }) {
  const w = c.w, moss = MOSS_BY[f.p.season], paths = f.layout.path, court = f.layout.court;
  const near = (r: Rect, x: number, z: number, m: number) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  const banded = f.p.rnd(1) < 0.5;
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL; let col: number;
    const onPath = paths.some(r => near(r, x, z, 0)), kerb = !onPath && paths.some(r => near(r, x, z, 0.14));
    if (onPath) { const r = Math.floor(Z / 10), lz = ((Z % 10) + 10) % 10, sx = X + (r & 1 ? 7 : 0), l = ((sx % 14) + 14) % 14; col = lz === 9 || l === 13 ? TC.joint : TC.slab[Math.floor(hash(Math.floor(sx / 14), r, 7) * 3)]; }
    else if (kerb) col = TC.kerb;
    else if ((court && near(court, x, z, 0)) || (Math.abs(x) < 7.4 && z > -9.6 && z < 7)) col = Math.abs(x) < 7.0 && z > -9.2 ? (banded ? Math.floor(Math.abs(X) / 6) & 1 : (Math.floor(X / 6) + Math.floor(Z / 6)) & 1) ? TC.gravel : TC.gravelB : moss[1];
    else { const n = Math.sin(X * 0.05) * Math.cos(Z * 0.06) + Math.sin((X + Z) * 0.03) * 0.6; col = n > 0.75 ? moss[2] : moss[0]; }
    w.set(X, -1, Z, col);
  }
}
function far(c: Ctx, f: { p: Place }) {
  const w = c.w, r = f.p.rnd, pal = MAPLE_BY[f.p.season], pts: Array<[number, number, number]> = [];
  for (let i = 0; i < 8; i++) pts.push([14 + (i % 2) * 1.8, -13 + i * 2.6, 7 + r(300 + i) * 2.5]);
  for (let i = 0; i < 9; i++) pts.push([-15 + i * 3.6 + (i % 2) * 0.8, -19.5 - (i % 2) * 1.6, 9 + r(320 + i) * 3]);
  for (let i = 0; i < 8; i++) pts.push([-16 - (i % 2) * 1.6, -13 + i * 2.8, 8 + r(340 + i) * 2.5]);
  pts.forEach(([x, z, h], i) => { if ((i + f.p.seed) % 5 === 3) { const cc = pal[i % pal.length]; oak(w, x, z, h * 0.75, { seed: 80 + i, bark: 0x3e2a26, dark: 0x281a18, leaf: cc[0], leafTop: cc[1], low: 0.4, width: 1.05, vines: 0 }); } else pine(w, x, z, h, TC.barkD, TC.pine, TC.pineL, { seed: 90 + i }); });
  if (r(400) < 0.55) tsuiji(w, 12.6, -10, 7, 2.6);
  if (r(401) < 0.4) tsuiji(w, -12.8, -10, 7, 2.6);
}
export const temple: Locale = {
  id: 'ninja_temple', name: '山寺', theme: 'ninja',
  layouts: ['axis', 'offset', 'pair', 'garden'],
  landmarks: LANDMARKS, groups: G, filler: FILLER,
  floor, far,
  dress(c, f) { templeDress(c, { clear: f.clear, seed: f.p.seed, drifts: [], moss: [...MOSS_BY[f.p.season]], noAmbient: true }); },
};
void bambooFence; void karikomi;
