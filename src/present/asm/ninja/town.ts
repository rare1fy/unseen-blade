// 忍之章 · 城下町（town 代理）：夜里的城下町街道，战斗在街心。两侧是成排的町屋立面（facade 插槽），街尾是火之见橹 / 木户 / 桥收口。
// 构图：通用「街巷」+ 自定义「辻」（十字路口，横街把两排立面切开）+「河岸」（一侧是水道、船和对岸的仓、柳，另一侧町屋）。
// 地面：夯土街面（大块两色）+ 两侧石砌明沟 + 檐下石板（town_ground.ts）。主色：深木、红殻格子、白壁、靛蓝暖帘、暖橙灯。
// 立面共 6 种（格子町屋 / 暖帘商铺 / 酒屋 / 土藏与平屋 / 旅笼 / 长屋），宽窄、一层二层、屋顶材质各不相同，一条街不会重复。
import type { Ctx } from '../../scenes/stage';
import { M } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import type { Group, Layout, Locale, Place, Slot } from '../types';
import { TW, NOREN, BOARD, frameX, sub, fb, machiya, eaveLantern, kanban, standSign, cask, dozo, chochin, andon, type Bay } from './town_kit';
import { yatai, chaya, furin, yakiimo, ido, kosatsu, nobori, hokora, mizuoke, yanagi, bucket, plates } from './town_props';
import { LANDMARKS } from './town_land';
import { floor, far, dress } from './town_ground';

const lampLight = (c: Ctx, p: Place, at: [number, number, number] | null, k = 1, d = 4.5) => { if (at && p.lamp > 0.3) c.light(at, 0xffa050, 2.4 * p.lamp * k, d); };
const pick = <T>(p: Place, k: number, a: T[]) => a[Math.floor(p.rnd(k) * a.length) % a.length];
/** water under (x, z): the floor cell taken out and the canal bed below */
const wet = (c: Ctx, x: number, z: number) => !c.w.has(M(x), -1, M(z)) && c.w.has(M(x), -2, M(z));
/** a group that must stand on dry ground: throw (→ the slot tries the next candidate) when any corner of its foot is over water */
const dry = (c: Ctx, p: Place, w: number, d: number) => { for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) if (wet(c, p.x + a * w * 0.45, p.z + b * d * 0.45)) throw new Error('over water'); };
const toStreet = (p: Place) => (p.s > 0 ? -1 : 1) as 1 | -1;
/** the street-side stalls belong to the near row (in a far frontage they would leave a gap in the row of houses) */
const nearRow = (c: Ctx, p: Place, w: number, d: number) => { if (p.z < 1) throw new Error('near row only'); dry(c, p, w, d); };

// ------------------------------------------------------------------ facades (machiya): each fills a whole frontage, 5.4 × 4.4 m
const FOOT = { w: 5.4, d: 4.4 };
const FAC: Group[] = [
  { id: 'koshiya', name: '格子町屋', tags: ['building', 'machiya'], foot: FOOT, h: 5.2, kinds: ['facade'], size: 'L', max: 2, build(c, p) {
    const f = frameX(c.w, p, FOOT), bays = pick<Bay[]>(p, 1, [['koshi', 'door', 'koshi'], ['koshi', 'koshi', 'door'], ['door', 'koshi', 'koshi', 'koshi']]);
    const r = machiya(c, f, { two: true, bays, upper: pick(p, 2, ['mushiko', 'mushiko', 'koshi'] as const), udatsu: p.rnd(3) < 0.5 ? 1 : 0, lattice: p.rnd(4) < 0.65 ? TW.bengara : TW.woodD, lamp: p.lamp });
    lampLight(c, p, eaveLantern(f, r.vs[1], r.ey, 0xd8a85c, TW.red), 0.8);
  } },
  { id: 'tana', name: '暖帘商铺', tags: ['building', 'machiya', 'shop'], foot: FOOT, h: 5.2, kinds: ['facade'], size: 'L', build(c, p) {
    const f = frameX(c.w, p, FOOT), nc = pick(p, 1, NOREN), k = Math.floor(p.rnd(3) * 4);
    const r = machiya(c, f, { two: true, bays: p.rnd(2) < 0.5 ? ['shop', 'shop', 'koshi'] : ['koshi', 'shop', 'shop'], upper: 'koshi', noren: nc, udatsu: 2, lamp: p.lamp, kind: k });
    lampLight(c, p, r.lamps[0], 1.0, 5);
    // a hanging sign board out over the street near the camera end (its face toward the camera) and a lit standing sign
    kanban(f, f.F - 12, r.ey - 2, 1, 8, TW.woodL, nc, k + 1);
    standSign(f, 4, 5, p.lamp > 0.3, nc);
  } },
  { id: 'sakaya', name: '酒屋', tags: ['building', 'machiya', 'sake'], foot: FOOT, h: 5.2, kinds: ['facade'], size: 'L', build(c, p) {
    const f = frameX(c.w, p, FOOT), d = toStreet(p);
    const r = machiya(c, f, { two: true, bays: ['koshi', 'shop', 'wall'], lattice: TW.woodD, upper: 'mushiko', noren: 0x3a2c22, udatsu: 2, lamp: p.lamp, kind: 1 });
    lampLight(c, p, r.lamps[0], 1.0, 5);
    // the sugidama (a cedar ball, here two tiers of cedar block) hanging from the eave over the shop's left post
    const w = c.w, [X, Z] = [f.I + f.s * 4, f.A0 + r.vs[1]];
    w.box(X, r.ey - 3, Z, X, r.ey - 1, Z, TW.rope);
    w.box(X - 4, r.ey - 12, Z - 4, X + 4, r.ey - 4, Z + 4, TW.cedar).box(X - 3, r.ey - 13, Z - 3, X + 3, r.ey - 3, Z + 3, TW.cedarL);
    // casks stacked in front of the plain bay at the near end: three standing, two on top, labels to the street
    const v0 = r.vs[2] + 4, cx = f.I + f.s * 4;
    for (let i = 0; i < 3; i++) cask(w, cx, f.A0 + v0 + i * 7, 0, d, [TW.red, TW.indigo, TW.red][i]);
    for (let i = 0; i < 2; i++) cask(w, cx, f.A0 + v0 + 3 + i * 7, 9, d, [TW.indigo, TW.red][i]);
  } },
  { id: 'kura', name: '土藏与平屋', tags: ['building', 'kura'], foot: FOOT, h: 5.2, kinds: ['facade'], size: 'L', build(c, p) {
    // a white storehouse with its gable to the street beside a one-storey board-roofed house with river stones on the roof
    const f = frameX(c.w, p, FOOT), F = f.F, cut = 30, far = p.rnd(1) < 0.5;
    const fd = far ? sub(f, 0, cut) : sub(f, F - cut, F), fh = far ? sub(f, cut + 5, F) : sub(f, 0, F - cut - 5);
    dozo(fd, 12, f.D, 48, pick(p, 2, [TW.namako, TW.indigoD, TW.redD]), p.lamp > 0.3);
    const r = machiya(c, fh, { two: false, G: 32, bays: pick<Bay[]>(p, 3, [['sudare', 'door'], ['door', 'sudare']]), roof: BOARD, stones: true, lattice: TW.woodD, lamp: p.lamp });
    lampLight(c, p, eaveLantern(fh, fh.F >> 1, r.ey, 0xd8a85c), 0.8);
  } },
  { id: 'hatago', name: '旅笼', tags: ['building', 'machiya', 'inn'], foot: FOOT, h: 5.2, kinds: ['facade'], size: 'L', build(c, p) {
    // the inn: a railed balcony of lit shoji upstairs, an open entry with indigo noren, two big inn lanterns at the entry posts
    const f = frameX(c.w, p, FOOT), k = Math.floor(p.rnd(2) * 4), entryFirst = p.rnd(1) < 0.5;
    const r = machiya(c, f, { two: true, bays: entryFirst ? ['shop', 'koshi', 'koshi'] : ['koshi', 'koshi', 'shop'], upper: 'balcony', noren: TW.indigo, udatsu: 0, lamp: p.lamp, kind: k });
    const e = entryFirst ? 0 : 2, a = eaveLantern(f, r.vs[e] + 2, r.ey, 0xe8c070, TW.red, 10); eaveLantern(f, r.vs[e + 1] - 2, r.ey, 0xe8c070, TW.red, 10);
    lampLight(c, p, a, 1.2, 5.5);
    standSign(f, 4, entryFirst ? r.vs[1] + 4 : r.vs[2] - 9, p.lamp > 0.3, TW.indigo);
  } },
  { id: 'nagaya', name: '长屋', tags: ['building', 'nagaya'], foot: FOOT, h: 3.6, kinds: ['facade'], size: 'L', build(c, p) {
    // a one-storey row house of narrow units: alternating doors and blinded windows under one long board roof held by stones,
    // potted plants on the step, a wash tub by one door
    const f = frameX(c.w, p, FOOT), w = c.w;
    const r = machiya(c, f, { two: false, G: 32, bays: ['door', 'sudare', 'door', 'sudare'], roof: BOARD, stones: true, lattice: TW.woodD, lamp: p.lamp });
    for (const i of [0, 2]) {
      const v = r.vs[i] + 3; fb(f, 3, -1, v, 5, 3, v + 4, TW.woodL);
      fb(f, 4, 4, v + 1, 4, 6, v + 3, TW.brown); fb(f, 4, 7, v, 4, 9, v + 4, p.season === 'winter' ? 0x4a5a48 : TW.green);
    }
    const [bx, bz] = [f.I + f.s * 4, f.A0 + r.vs[2] - 5]; bucket(w, bx, bz, 0, TW.woodL);
    lampLight(c, p, eaveLantern(f, r.vs[2], r.ey, 0xd8a85c), 0.7);
  } },
];

// ------------------------------------------------------------------ the near street-side pieces (≤ 2.4 m: they stand between the camera and the far facades)
const NEAR: Group[] = [
  { id: 'yatai', name: '荞麦屋台', tags: ['stall', 'light'], foot: { w: 2.4, d: 2.4 }, h: 2.3, kinds: ['facade'], size: 'M', build(c, p) {
    nearRow(c, p, 2.4, 2.4); lampLight(c, p, yatai(c, M(p.x), M(p.z), toStreet(p), pick(p, 1, NOREN), p.lamp > 0.3), 0.9);
  } },
  { id: 'chaya', name: '茶店', tags: ['stall', 'light'], foot: { w: 2.6, d: 2.4 }, h: 2.35, kinds: ['facade'], size: 'M', build(c, p) {
    nearRow(c, p, 2.6, 2.4); lampLight(c, p, chaya(c, M(p.x), M(p.z), toStreet(p), p.lamp > 0.3), 0.7, 3.5);
  } },
  { id: 'ido', name: '井户', tags: ['water', 'well'], foot: { w: 2.2, d: 1.4 }, h: 2.2, kinds: ['facade', 'back'], size: 'S', build(c, p) {
    dry(c, p, 2.2, 1.4); ido(c, M(p.x) - toStreet(p) * 4, M(p.z), toStreet(p));
  } },
  { id: 'taru', name: '酒樽堆', tags: ['sake', 'low', 'light'], foot: { w: 2.0, d: 3.0 }, h: 1.4, kinds: ['facade'], size: 'S', excludes: ['sake'], build(c, p) {
    nearRow(c, p, 2.0, 3.0);
    const w = c.w, X = M(p.x), Z = M(p.z), d = toStreet(p), labs = [TW.red, TW.indigo, TW.red, 0x3a4a3a];
    w.box(X - 12, -1, Z - 19, X + 12, -1, Z + 19, TW.stoneD);
    for (let i = 0; i < 4; i++) cask(w, X + 4 * d, Z - 14 + i * 8, 0, d, labs[i]);
    for (let i = 0; i < 3; i++) cask(w, X + 4 * d, Z - 10 + i * 8, 9, d, labs[(i + 1) % 4]);
    cask(w, X - 5 * d, Z - 6, 0, d, TW.indigo); cask(w, X - 5 * d, Z + 2, 0, d, TW.red);
    lampLight(c, p, andon(w, X + 6 * d, Z + 15, p.lamp > 0.3), 0.7, 3.5);
  } },
  { id: 'furin', name: '风铃摊', tags: ['stall', 'summer'], foot: { w: 1.8, d: 1.8 }, h: 2.2, kinds: ['facade', 'back'], size: 'S', seasons: ['summer'], weight: 4, build(c, p) {
    dry(c, p, 1.8, 1.8); furin(c, M(p.x), M(p.z), toStreet(p));
  } },
  { id: 'yakiimo', name: '烤红薯摊', tags: ['stall', 'winter', 'light'], foot: { w: 1.6, d: 1.8 }, h: 2.35, kinds: ['facade', 'back'], size: 'S', seasons: ['winter'], weight: 4, build(c, p) {
    dry(c, p, 1.6, 1.8); lampLight(c, p, yakiimo(c, M(p.x), M(p.z), toStreet(p), p.lamp > 0.3), 0.8, 4);
  } },
];

// ------------------------------------------------------------------ back row (beside the landmark, facing the camera)
const BACK: Group[] = [
  { id: 'kosatsu', name: '高札', tags: ['sign'], foot: { w: 2.2, d: 1.2 }, h: 3.3, kinds: ['back'], size: 'S', build(c, p) { dry(c, p, 2.2, 1.2); kosatsu(c, M(p.x), M(p.z)); } },
  { id: 'nobori', name: '幟', tags: ['banner'], foot: { w: 2.2, d: 0.8 }, h: 3.8, kinds: ['back'], size: 'S', build(c, p) {
    dry(c, p, 2.2, 0.8);
    const cols = [pick(p, 1, [TW.indigo, TW.red, TW.white]), pick(p, 2, [TW.white, TW.indigoL, TW.brown]), pick(p, 3, [TW.red, TW.indigo, 0x3a5a3a])];
    nobori(c, M(p.x), M(p.z), cols, [Math.floor(p.rnd(4) * 3), Math.floor(p.rnd(5) * 3), Math.floor(p.rnd(6) * 3)]);
  } },
  { id: 'hokora', name: '路傍祠', tags: ['shrine', 'low'], foot: { w: 2.4, d: 1.2 }, h: 1.5, kinds: ['back'], size: 'S', build(c, p) { dry(c, p, 2.4, 1.2); hokora(c, M(p.x), M(p.z)); } },
  { id: 'mizuoke', name: '天水桶', tags: ['fire', 'low'], foot: { w: 2.0, d: 1.2 }, h: 1.8, kinds: ['back', 'facade'], size: 'S', build(c, p) {
    dry(c, p, 2.0, 1.2);
    const X = M(p.x), Z = M(p.z); mizuoke(c, X - 6, Z); bucket(c.w, X + 6, Z + 3, 0, TW.red); bucket(c.w, X + 11, Z - 2, 0, TW.red);
  } },
  { id: 'yanagi', name: '柳', tags: ['tree'], foot: { w: 1.0, d: 1.0 }, h: 4.8, kinds: ['back', 'corner'], size: 'S', max: 2, weight: 1.2, build(c, p) {
    dry(c, p, 1.0, 1.0);
    // in a back row it leans away from the street (the crown must not hang over it); on the far bank it leans over the water
    const lean: [number, number] = p.s === 0 || Math.abs(p.x) < 7 ? [0, -1] : [toStreet(p), 0];
    yanagi(c, p.x, p.z, 5.0 + p.rnd(1) * 0.6, p.season, p.seed, lean, 14);
  } },
];

// ------------------------------------------------------------------ the riverside (河岸): boats on the canal, a storehouse on the far bank
/** a flat river boat along z (cells): hull in two tiers with a lighter gunwale, the bow raised in two steps toward +z */
function hull(c: Ctx, X: number, Z: number, L: number, Wd: number) {
  const w = c.w;
  w.box(X - Wd + 1, 0, Z - L + 2, X + Wd - 1, 1, Z + L - 3, TW.woodD);
  w.box(X - Wd, 2, Z - L, X + Wd, 3, Z + L, TW.wood).box(X - Wd + 1, 2, Z - L + 1, X + Wd - 1, 3, Z + L - 1, TW.woodD);
  w.box(X - Wd, 4, Z - L, X - Wd, 4, Z + L, TW.woodL).box(X + Wd, 4, Z - L, X + Wd, 4, Z + L, TW.woodL).box(X - Wd, 4, Z - L, X + Wd, 4, Z - L, TW.woodL);
  w.box(X - Wd, 4, Z + L - 4, X + Wd, 5, Z + L, TW.wood).box(X - Wd + 1, 6, Z + L - 2, X + Wd - 1, 7, Z + L, TW.woodL);
}
const WATER: Group[] = [
  { id: 'kobune', name: '小舟', tags: ['boat'], foot: { w: 1.2, d: 3.0 }, h: 1.2, kinds: ['wing'], size: 'S', max: 2, build(c, p) {
    if (!wet(c, p.x, p.z) || !wet(c, p.x, p.z - 1.3) || !wet(c, p.x, p.z + 1.3)) throw new Error('needs water');
    const w = c.w, X = M(p.x), Z = M(p.z), L = 20, Wd = 7, cargo = p.rnd(1) < 0.5;
    hull(c, X, Z, L, Wd);
    if (cargo) {
      // rice bales in a 3-2 stack and a cask, a straw mat over the stern
      for (let i = 0; i < 3; i++) w.box(X - 5, 4, Z - 12 + i * 7, X + 5, 8, Z - 7 + i * 7, TW.straw).box(X - 5, 6, Z - 12 + i * 7, X + 5, 6, Z - 7 + i * 7, TW.rope);
      for (let i = 0; i < 2; i++) w.box(X - 5, 9, Z - 9 + i * 7, X + 5, 12, Z - 4 + i * 7, TW.straw).box(X - 5, 11, Z - 9 + i * 7, X + 5, 11, Z - 4 + i * 7, TW.rope);
      cask(w, X, Z + 11, 4, 1, TW.red);
    } else {
      // a straw-mat shelter on two hoops amidships, the pole laid along the gunwale, a sedge hat on the seat
      w.box(X - Wd, 4, Z - 6, X - Wd, 12, Z - 5, TW.bambooD).box(X + Wd, 4, Z - 6, X + Wd, 12, Z - 5, TW.bambooD).box(X - Wd, 4, Z + 3, X - Wd, 12, Z + 4, TW.bambooD).box(X + Wd, 4, Z + 3, X + Wd, 12, Z + 4, TW.bambooD);
      w.box(X - Wd, 13, Z - 7, X + Wd, 14, Z + 5, TW.straw).box(X - Wd, 13, Z - 7, X + Wd, 13, Z - 7, TW.strawD).box(X - Wd, 13, Z + 5, X + Wd, 13, Z + 5, TW.strawD);
      w.box(X + Wd - 1, 5, Z - L + 1, X + Wd - 1, 5, Z + L - 6, TW.bamboo);
      w.box(X - 3, 4, Z + 9, X + 3, 4, Z + 13, TW.straw).box(X - 1, 5, Z + 10, X + 1, 6, Z + 12, TW.strawD);
    }
  } },
  { id: 'yakatabune', name: '屋形船', tags: ['boat', 'light'], foot: { w: 1.6, d: 4.0 }, h: 2.2, kinds: ['wing'], size: 'M', build(c, p) {
    if (!wet(c, p.x, p.z) || !wet(c, p.x, p.z - 1.8) || !wet(c, p.x, p.z + 1.8)) throw new Error('needs water');
    // a roofed pleasure boat: four posts, lit shoji on both sides, a low board roof in two plates, red lanterns at the roof corners
    const w = c.w, X = M(p.x), Z = M(p.z), L = 27, Wd = 10, lit = p.lamp > 0.3;
    hull(c, X, Z, L, Wd);
    const z0 = Z - 16, z1 = Z + 12;
    for (const x of [X - Wd + 1, X + Wd - 1]) for (const z of [z0, z1]) w.box(x, 4, z, x, 22, z, TW.woodD);
    for (const x of [X - Wd + 1, X + Wd - 1]) { w.box(x, 9, z0 + 1, x, 20, z1 - 1, lit ? TW.glowMid : TW.paper, lit ? 1 : 0); for (let z = z0 + 4; z < z1; z += 5) w.box(x, 9, z, x, 20, z, TW.woodD); w.box(x, 4, z0, x, 8, z1, TW.wood); }
    w.box(X - Wd + 2, 9, z1, X + Wd - 2, 20, z1, lit ? TW.glowMid : TW.paper, lit ? 1 : 0).box(X - 1, 9, z1, X, 20, z1, TW.woodD);
    plates(w, X - Wd - 2, X + Wd + 2, z0 - 3, z1 + 3, 23, [[0, 2], [4, 2]], TW.board, TW.boardD, TW.boardL);
    const a = chochin(w, X - Wd - 1, 18, z1 + 2, 6, 0xd84a30); chochin(w, X + Wd + 1, 18, z1 + 2, 6, 0xd84a30);
    w.box(X - Wd - 1, 22, z1 + 2, X - Wd - 1, 22, z1 + 2, TW.woodD).box(X + Wd + 1, 22, z1 + 2, X + Wd + 1, 22, z1 + 2, TW.woodD);
    lampLight(c, p, [(X + 0.5) * CELL, 1.0, (z1 + 2) * CELL], 1.1, 5); void a;
  } },
  { id: 'kawagura', name: '河岸藏', tags: ['building', 'kura'], foot: { w: 2.6, d: 3.6 }, h: 4.6, kinds: ['corner'], size: 'M', build(c, p) {
    dry(c, p, 2.6, 3.6);
    // a storehouse on the far bank, its door toward the canal and the street; a stone step down to the water
    const f = frameX(c.w, p, { w: 2.6, d: 3.6 });
    dozo(f, 8, f.D + 2, 42, pick(p, 1, [TW.namako, TW.indigoD]), p.lamp > 0.3);
  } },
];
const FILLER: Group[] = [
  { id: 'f_oke', name: '桶', tags: ['low'], foot: { w: 0.8, d: 0.8 }, h: 0.6, kinds: ['facade'], size: 'S', max: 2, build(c, p) { dry(c, p, 0.8, 0.8); const X = M(p.x), Z = M(p.z); bucket(c.w, X, Z, 0); bucket(c.w, X + 5, Z + 2, 0, TW.woodL); } },
  { id: 'f_andon', name: '行灯', tags: ['light'], foot: { w: 0.6, d: 0.6 }, h: 1.3, kinds: ['facade'], size: 'S', max: 1, build(c, p) { dry(c, p, 0.6, 0.6); lampLight(c, p, andon(c.w, M(p.x), M(p.z), p.lamp > 0.3), 0.6, 3); } },
];

// ------------------------------------------------------------------ layouts of our own: the crossing and the riverside
const S = (id: string, kind: Slot['kind'], size: Slot['size'], x: number, z: number, w: number, d: number, maxH?: number): Slot =>
  ({ id, kind, size, x, z, w, d, s: x > 0.5 ? 1 : x < -0.5 ? -1 : 0, ...(maxH ? { maxH } : {}) });
const LAYOUTS: Layout[] = [
  // 辻：a side street crosses the main one in the middle of the fight; two facades a side, one pair behind the crossing, one in front
  { id: 'tsuji', name: '辻', landmark: { x: 0, z: -12.0, w: 8, d: 4.4 },
    path: [{ x0: -5.4, z0: -10, x1: 5.6, z1: 8.4 }, { x0: -13.5, z0: -4.9, x1: 13.5, z1: -2.5 }],
    slots: [
      S('FL1', 'facade', 'L', -8.6, -7.4, 5.4, 4.6), S('FL2', 'facade', 'L', -8.6, -0.2, 5.4, 4.4), S('FL3', 'facade', 'M', -8.2, 4.1, 4.6, 3.6, 2.4),
      S('FR1', 'facade', 'L', 8.6, -7.4, 5.4, 4.6), S('FR2', 'facade', 'L', 8.6, -0.2, 5.4, 4.4), S('FR3', 'facade', 'M', 8.2, 4.1, 4.6, 3.6, 2.4),
      S('BL', 'back', 'S', -5.6, -10.8, 2.4, 1.6), S('BR', 'back', 'S', 5.6, -10.8, 2.4, 1.6),
    ] },
  // 河岸：the right side is a canal (boats moored in it) with a storehouse and willows on the far bank; the left side is the facade row
  { id: 'kashi', name: '河岸', landmark: { x: 0, z: -12.0, w: 8, d: 4.4 },
    path: [{ x0: -5.4, z0: -10, x1: 5.6, z1: 8.4 }],
    slots: [
      S('FL1', 'facade', 'L', -8.6, -7.6, 5.4, 4.8), S('FL2', 'facade', 'L', -8.6, -2.4, 5.4, 4.8), S('FL3', 'facade', 'M', -8.2, 2.6, 4.6, 4.2, 2.4),
      S('R1', 'wing', 'M', 8.1, -6.4, 2.6, 4.4), S('R2', 'wing', 'M', 8.1, -0.8, 2.6, 4.4), S('R3', 'wing', 'S', 8.1, 3.8, 2.6, 3.2, 1.6),
      S('CR1', 'corner', 'M', 11.6, -7.8, 2.8, 4.0), S('CR2', 'corner', 'M', 11.6, -2.2, 2.8, 4.0),
      S('BL', 'back', 'S', -5.6, -10.8, 2.4, 1.6),
    ] },
];

export const town: Locale = {
  id: 'ninja_town', name: '城下町', theme: 'ninja',
  layouts: ['street'], extraLayouts: LAYOUTS,
  landmarks: LANDMARKS, groups: [...FAC, ...NEAR, ...BACK, ...WATER], filler: FILLER,
  times: ['night', 'dusk', 'night', 'dawn'],
  floor, far, dress,
};
