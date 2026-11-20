// 第四关 · 锁江 · 督造高阁（wl_tower，wp/regB）：头目间。中央五层大楼船的顶层甲板：脚下是一大片整齐的甲板（比浮栈的旧板子新、
// 颜色深、钉排齐），甲板两侧船舷上架着床弩、竖着拍竿；后方是三层的督造阁（朱柱、直棂窗、一层层退台的瓦檐，阁里亮灯，案上摊着锻谱），
// 阁两侧是桅杆和帆；船舷外面的江上全是锁在一起的连环船，远处有几艘在烧。周黯放火后（r45_hook burn）甲板四周起火。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, PLAY, SX, SZ } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import type { Group, Landmark, Layout, Locale, Place, Rect } from '../types';
import { WL, WL_MOOD, river, WATER_MARK, frame, deckBoard, faceOf, flagpole, fireBasket, lantern, chainCoil, chainRun, hull, smoke, wp } from './wl_kit';
import { wulinInfill, wulinEdgeDress, wulinDistantBackdrop } from './wl_infill';

const lit = (p: Place) => p.lamp > 0.3;
const lampLight = (c: Ctx, p: Place, at: [number, number, number], k = 1, d = 5) => { if (lit(p)) c.light(at, 0xffa050, 2.2 * p.lamp * k, d); };

/** 床弩: a great crossbow on a swivel post — the stock along local z, the double bow across, the windlass at the back, a bolt laid in */
function ballista(B: ReturnType<typeof frame>) {
  B(-4, 0, -4, 4, 2, 4, WL.ironD); B(-2, 3, -2, 2, 12, 2, WL.woodD);
  B(-2, 13, -18, 2, 15, 16, WL.wood); B(-1, 16, -16, 1, 16, 18, WL.woodL);
  for (const z of [10, 14]) { B(-22, 15, z, 22, 16, z + 1, WL.woodD); B(-23, 15, z - 2, -21, 16, z, WL.woodD); B(21, 15, z - 2, 23, 16, z, WL.woodD); }
  B(-21, 16, 9, 21, 16, 9, 0xd8d0b8); B(-1, 17, -14, 1, 17, 22, 0x6a5038); B(-2, 17, 23, 2, 18, 26, WL.ironL);
  B(-6, 12, -20, 6, 15, -18, WL.iron); for (const s of [-1, 1]) B(s * 7, 10, -20, s * 7, 17, -18, WL.woodD);
}
/** 拍竿: a tall boom on a pivot frame by the rail, its stone weight up, the arm standing — it swings down onto the deck in the fight */
function boomFrame(B: ReturnType<typeof frame>) {
  for (const s of [-1, 1]) B(s * 6, 0, -3, s * 6 + s, 30, 3, WL.woodD);
  B(-7, 28, -3, 7, 30, 3, WL.iron); B(-2, 30, -2, 2, 86, 2, WL.wood); B(-6, 80, -6, 6, 92, 6, 0x6e6a64); B(-6, 92, -6, 6, 92, 6, 0x8a867e);
  for (let y = 40; y < 80; y += 10) B(-3, y, -3, 3, y, 3, WL.ironD);
}

const LANDMARKS: Landmark[] = [
  { id: 'wl_duzao', name: '督造阁', foot: { w: 15, d: 6.6 }, tags: ['building', 'tall', 'light'], build(c, p) {
    // three storeys on the stern: a raised platform with steps, red columns, 直棂 windows lit from inside, three stepped roofs; the
    // supervisor's desk with the open 锻谱 in the doorway; masts and furled sails either side, 曹 standards on the corners
    const B = frame(c.w, p.x, p.z, 0), L = lit(p);
    B(-96, -1, -40, 96, 8, 30, WL.tar); B(-96, 8, -40, 96, 8, 30, WL.deckD); for (let x = -92; x <= 92; x += 8) B(x, 1, 30, x + 1, 7, 30, WL.ironD);
    B(-20, -1, 31, 20, 2, 38, WL.deckD); B(-20, 3, 31, 20, 5, 34, WL.deckD);
    let y = 9;
    for (const [hw, hd, H, i] of [[70, 28, 30, 0], [54, 22, 24, 1], [38, 16, 20, 2]] as const) {
      B(-hw, y, -hd - 6, hw, y + H, hd - 6, WL.wood); for (let yy = y + 5; yy < y + H; yy += 6) B(-hw, yy, hd - 6, hw, yy, hd - 6, WL.woodD);
      for (let x = -hw + 2; x <= hw - 2; x += Math.round(hw / 3)) B(x, y, hd - 5, x + 2, y + H, hd - 3, WL.red);
      for (let x = -hw + 10; x < hw - 10; x += 16) { B(x, y + 8, hd - 5, x + 8, y + H - 6, hd - 5, L ? 0xd89a50 : 0x1a1414, L ? 1 : 0); for (let u = x + 1; u < x + 8; u += 2) B(u, y + 8, hd - 4, u, y + H - 6, hd - 4, WL.woodD); }
      if (i === 0) { B(-10, y, hd - 6, 10, y + 22, hd - 6, L ? 0xc88a40 : 0x1a1414, L ? 1 : 0); B(-8, y, hd - 2, 8, y + 6, hd + 4, WL.woodD); B(-6, y + 7, hd - 1, 6, y + 7, hd + 3, WL.paper); B(-1, y + 7, hd - 1, 1, y + 7, hd + 3, WL.woodD); }
      y += H;
      B(-hw - 8, y + 1, -hd - 14, hw + 8, y + 3, hd + 2, 0x3a3c42); B(-hw - 4, y + 4, -hd - 10, hw + 4, y + 5, hd - 2, 0x4c4e55); B(-hw - 8, y + 1, hd + 2, hw + 8, y + 1, hd + 2, 0x26282c);
      y += 6;
    }
    B(-30, y, -12, 30, y + 3, -4, 0x3a3c42); B(-34, y, -13, -28, y + 7, -3, 0x3a3c42); B(28, y, -13, 34, y + 7, -3, 0x3a3c42);
    for (const s of [-1, 1]) { flagpole(frame(c.w, p.x + s * 6.4, p.z + 1.4, 0), 0, 0, 74, { len: 28, wd: 14 }); const f = lantern(B, s * 74, 26, 40, L); lampLight(c, p, wp(p.x, p.z, 0, f[0], f[1], f[2]), 1.0, 6); }
    if (L) { lampLight(c, p, wp(p.x, p.z, 0, 0, 30, 24), 1.3, 8); lampLight(c, p, wp(p.x, p.z, 0, 0, 70, 12), 0.8, 7); }
  } },
];

const GROUPS: Group[] = [
  { id: 'wl_ballista', name: '床弩', tags: ['weapon'], foot: { w: 3.2, d: 3.2 }, h: 1.8, kinds: ['wing', 'back'], size: 'M', weight: 1.5, max: 2, build(c, p) {
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)); ballista(B);
    for (let i = 0; i < 3; i++) B(10, i * 2, -16 + i * 3, 14, i * 2 + 1, 16 - i * 3, WL.woodL);
  } },
  { id: 'wl_boom', name: '拍竿', tags: ['tall', 'weapon'], foot: { w: 1.6, d: 1.6 }, h: 6.6, kinds: ['wing', 'corner'], size: 'M', max: 2, build(c, p) { boomFrame(frame(c.w, p.x, p.z, faceOf(p.s || 1))); } },
  { id: 'wl_mast', name: '桅帆', tags: ['tall', 'cloth'], foot: { w: 2.2, d: 2.2 }, h: 7.0, kinds: ['wing', 'corner', 'back'], size: 'M', build(c, p) {
    // a mast stepped in an iron-banded box, the yard across, the matting sail furled in bands; the halyard straight down the mast
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    B(-6, 0, -6, 6, 6, 6, WL.wood); B(-6, 3, -6, 6, 3, 6, WL.ironD); B(-2, 7, -2, 2, 96, 2, WL.woodD);
    B(-2, 86, -26, 2, 88, 26, WL.woodD); for (let y = 66; y < 86; y += 5) B(-3, y, -24, 3, y + 3, 24, y % 10 ? WL.canvas : WL.canvasD);
    B(3, 7, 0, 3, 65, 0, WL.rope);
  } },
  { id: 'wl_store2', name: '铁索盘', tags: ['stores'], foot: { w: 2.6, d: 2.6 }, h: 1.0, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    const B = frame(c.w, p.x, p.z, 0); chainCoil(B, -8, -6, 0, 9); chainCoil(B, 10, 8, 0, 7); B(-16, 0, 10, -4, 6, 18, WL.wood); B(-16, 6, 10, -4, 6, 18, WL.woodL);
  } },
  { id: 'wl_brazier', name: '火盆', tags: ['fire', 'light'], foot: { w: 1.2, d: 1.2 }, h: 1.3, kinds: ['wing', 'back'], size: 'S', weight: 1.4, build(c, p) {
    const B = frame(c.w, p.x, p.z, 0), on = lit(p) || p.rnd(1) < 0.5, f = fireBasket(B, 0, 0, 12, on); if (on) c.light(wp(p.x, p.z, 0, f[0], f[1] + 2, f[2]), 0xff8a3a, 2.4 * Math.max(0.7, p.lamp), 5);
  } },
];
const FILLER: Group[] = [
  { id: 'wl_bolts', name: '弩箭', tags: ['small'], foot: { w: 1.2, d: 0.8 }, h: 0.4, kinds: ['wing'], size: 'S', max: 5, build(c, p) { const B = frame(c.w, p.x, p.z, 0); for (let i = 0; i < 3; i++) B(-8, i, -3 + i * 2, 8, i, -2 + i * 2, 0x6a5038); B(-9, 0, -4, -8, 2, 3, WL.iron); } },
];

/** the deck: the battle floor and its margin out to the wings (the ship is wider than the stage); water beyond */
function deckRect(): Rect { return { x0: PLAY.x0 - 5.6, x1: PLAY.x1 + 5.6, z0: SZ(-14), z1: PLAY.z1 + 2.8 }; }
function floor(c: Ctx) {
  const w = c.w, d = deckRect();
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL;
    if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) { w.set(X, -1, Z, WATER_MARK); continue; }
    // 11-18 (用户：「不许逐格随机碎点」): 框着较暗的船舷，整段新桐油木横铺，通往楼阁的中央带朱漆镶边御道与横向船肋压条。
    const ax = Math.abs(x);
    const body = z < PLAY.z0 + 2.4 || ax > PLAY.x1 - 2.7 ? WL.oilD : ax < 2.2 ? WL.oilL : WL.oil;
    const edge = x < d.x0 + 0.5 || x > d.x1 - 0.5 || z > d.z1 - 0.5;
    const runnerTrim = ax >= 2.2 && ax <= 2.45 && z > PLAY.z0 + 1.5 && z < PLAY.z1 - 1.5;
    const crossRib = ((Z % 48) + 48) % 48 <= 1 && ax < PLAY.x1 - 1.2 && z > PLAY.z0 + 1.2 && z < PLAY.z1 - 1.2;
    w.set(X, -1, Z, edge ? WL.tar : runnerTrim ? WL.redD : crossRib ? WL.tar : deckBoard(Z, X, 52, body, 0x66472e));
  }
  // the hull's sides below the deck edge, down into the water (the ship stands high): three strakes, the red sheer strake at the top
  const B = frame(w, 0, 0, 0), X0 = M(d.x0), X1 = M(d.x1), Z1 = M(d.z1);
  for (let i = 0; i < 4; i++) { const y = -2 - i * 3, col = i === 0 ? WL.red : i % 2 ? WL.tar : WL.tarL; B(X0 - 1 - i, y - 2, M(d.z0), X0 - 1 - i, y, Z1 + i, col); B(X1 + 1 + i, y - 2, M(d.z0), X1 + 1 + i, y, Z1 + i, col); B(X0 - i, y - 2, Z1 + 1 + i, X1 + i, y, Z1 + 1 + i, col); }
}
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const r = f.p.rnd, w = c.w;
  // carve the water (one sheet round the ship)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [k, v] of w.cells) { if (v.c !== WATER_MARK) continue; const y = (Math.floor(k / 1024) % 1024) - 512; if (y !== -1) continue; const X = Math.floor(k / (1024 * 1024)) - 512, Z = (k % 1024) - 512; w.set(X, -1, Z, null); w.set(X, -14, Z, WL.bed, 1); x0 = Math.min(x0, X); x1 = Math.max(x1, X); z0 = Math.min(z0, Z); z1 = Math.max(z1, Z); }
  if (x1 > x0) river(c, x0 * CELL, z0 * CELL, (x1 + 1) * CELL, (z1 + 1) * CELL, -0.5);
  // the chained fleet all round, lower than the tower ship (their decks well below ours), many burning: the river on fire
  const ships: Array<[number, number, number]> = [];
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) ships.push([s * (PLAY.x1 + 8.5), SZ(-12 + i * 5.2), s > 0 ? 1 : 3]);
  for (let i = 0; i < 5; i++) ships.push([SX(-14 + i * 7), SZ(-21) - (i % 2) * 1.8, 0]);
  ships.forEach(([x, z, rr], i) => {
    const burning = r(500 + i) < 0.5, q = hull(c, x, z, rr, { L: rr ? 96 : 120, burning, tall: 12 + Math.floor(r(520 + i) * 6) });
    if (burning) { for (const l of q.lights) c.light([l[0], l[1] - 0.6, l[2]], 0xff7a2a, 2.8, 10); smoke(c, [x, 2.4, z], { rate: 2.4, col: 0x3a3430 }); }
  });
  for (const s of [-1, 1]) chainRun(frame(w, s * (PLAY.x1 + 4.4), 0, 1), M(SZ(-14)), M(SZ(6)), 0, -2);
  wulinDistantBackdrop(c, f, 'tower');
}
function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  wulinEdgeDress(c, f);
  c.ambient({ kind: 'embers', color: 0xff8a3a, rate: 2.4, area: { x0: -18, z0: -22, x1: 18, z1: 8 } });
  c.ambient({ kind: 'dust', color: 0x6a5e56, rate: 0.8 });
  void f;
}

export const wlTower: Locale = {
  id: 'wl_tower', name: '督造高阁', theme: 'wulin',
  layouts: ['axis', 'garden'],
  landmarks: LANDMARKS, groups: GROUPS, filler: FILLER,
  seasons: ['spring'], times: ['night'], weathers: ['clear'], mood: WL_MOOD,
  floor, far, dress, infill: wulinInfill('tower'),
};
