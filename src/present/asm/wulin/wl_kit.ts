// 第四关 · 锁江（乌林曹军水寨，建安十三年冬）的部件库（wp/regB）。7 厘米一格，铁律同 hanmo：横平竖直的大块，斜面一律几层宽台阶，
// 花纹只画结构（板缝、钉排、铁箍、布边），没有逐格随机色。主色：黑水、焦油黑木、曹军暗红、营帐灰白麻布、铁灰；火光是唯一的暖亮色。
// 所有部件在本地框里搭（k_village.loc：本地 x 横向，本地 z 朝正面，r = 转几个 90°）。
import * as THREE from 'three';
import type { Ctx, Mood } from '../../scenes/stage';
import { M, type W } from '../../scenes/props';
import { loc, locM, type Bx, type P3 } from '../../scenes/k_village';
import { smoke } from '../hanmo/hj_temple_kit';
export { smoke };

/** 乌林's own light (Locale.mood, applied when the place is put up): a cold river night — deep blue-black sky and water, a low cold fill
 *  and a weak moon for the shadows; the warm light comes from the fires on the water and the lanterns (point lights), and a red-brown
 *  glow along the horizon where the fleet burns. (The season is 'spring' only so the snow pass stays off the decks.) */
export const WL_MOOD: Mood = {
  sky: true, bg: 0x0c0e16, fog: 0x1c1a20, fogD: 0.02, hemiSky: 0x5a6488, hemiGround: 0x3a2a20, hemiI: 1.65, moon: 0x9aa8d0, moonI: 2.3, key: 0xffa060, keyI: 0.5,
  earth: [0x101820, 0x121a22, 0x0e161e], mist: 0x5a3a30, mistA: 0.07, skyTop: 0x06080e, skyMid: 0x1a1420, skyHor: 0x6a2e1e, skyDisc: [0.2, 0.08, -1], skyDiscCol: [0.9, 0.42, 0.22],
  exposure: 1.6, bloomT: 1.05, glowK: 1.8, moonPos: [-7, 14, -8],
};

/** the water mark: floor cells painted this colour at y = −1 are carved into a water channel by carveWater (as 麦田's ditches) */
export const WATER_MARK = 0x0a1a2a;
export const WL = {
  water: 0x14202c, waterL: 0x2a3a48, bed: 0x16141a,
  deck: 0x5a4432, deckD: 0x46342a, deckL: 0x6e5440, deckJ: 0x2e221a, plank: 0x624a36,
  /** the floating stage's old planks: weathered grey-brown, silvered by the river (the dock reads grey, the camp brown, the tower honey) */
  old: 0x6a6258, oldD: 0x544e46, oldL: 0x7c7468, oldJ: 0x34302c,
  /** the tower ship's top deck: new planks, oiled honey-red */
  oil: 0x8a5a36, oilD: 0x74482a, oilL: 0x9c6a40, oilJ: 0x3e2618,
  tar: 0x2a2220, tarL: 0x3e322a, wood: 0x6e5238, woodD: 0x4a3622, woodL: 0x8e6e4c,
  red: 0x8a2a22, redD: 0x621c18, redL: 0xa83a2c, black: 0x221e20,
  canvas: 0xb4ae9c, canvasD: 0x948e7e, canvasL: 0xc8c2b0, rope: 0x9a8058, ropeD: 0x7a6440,
  iron: 0x4a4f5a, ironD: 0x30343c, ironL: 0x6e7480,
  earth: 0x8a7a5e, earthD: 0x766a50, earthL: 0x9a8a6c, mud: 0x5a4c3a, reed: 0x8a8a5a, reedD: 0x6a6a44,
  fire: 0xff8a30, fireL: 0xffc060, ember: 0xd85a20, char: 0x2a2220, charL: 0x3e3430, ash: 0x5a524a,
  lamp: 0xffb050, paper: 0xe8dcc0, white: 0xe8e0d0,
};
export const frame = (w: W, x: number, z: number, r = 0) => loc(w, M(x), M(z), r);
/** 同一片甲板的木色连成片。只留整条板缝和交错的搭接。 */
export function deckBoard(across: number, along: number, length: number, body: number, joint: number) {
  const board = Math.floor(across / 7);
  return across - board * 7 === 6 || (along + board * Math.floor(length / 2)) % length === 0 ? joint : body;
}
/** the river: a matte dark sheet (the stage's own water is glossy — under the night camera the moon's highlight on it read as a white
 *  blob); the fires and lanterns still light it warm, which is the reflection we want */
export function river(c: Ctx, x0: number, z0: number, x1: number, z1: number, y = -0.06) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshLambertMaterial({ color: WL.water, emissive: new THREE.Color(0x0a1018) }));
  m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; m.renderOrder = 1; c.add(m);
}
export const faceOf = (s: number) => (s > 0 ? 3 : s < 0 ? 1 : 0);
export const orient = (p: { z: number; s: number }) => (p.z < -8.6 ? 0 : faceOf(p.s));
export const wp = (x: number, z: number, r: number, lx: number, y: number, lz: number): P3 => locM(M(x), M(z), r, lx, y, lz);

/** a plank deck over local [x0..x1] × [z0..z1] at height y (top), planks running along z, a dark seam every 5 cells and a row of iron
 *  nail heads along each joist (every 12 cells across) */
export function deck(B: Bx, x0: number, x1: number, z0: number, z1: number, y: number, o: { along?: 'x' | 'z'; th?: number } = {}) {
  const th = o.th ?? 1, along = o.along ?? 'z';
  B(x0, y - th + 1, z0, x1, y, z1, WL.deck);
  if (along === 'z') { for (let x = x0 + 4; x <= x1; x += 5) B(x, y, z0, x, y, z1, WL.deckJ); for (let z = z0 + 6; z <= z1; z += 12) B(x0, y, z, x1, y, z, WL.deckD); }
  else { for (let z = z0 + 4; z <= z1; z += 5) B(x0, y, z, x1, y, z, WL.deckJ); for (let x = x0 + 6; x <= x1; x += 12) B(x, y, z0, x, y, z1, WL.deckD); }
}
/** a pile under a deck: a square tarred post from the water bed up, an iron band near its head */
export function pile(B: Bx, x: number, z: number, y1: number, y0 = -3) { B(x - 1, y0, z - 1, x + 1, y1, z + 1, WL.tar); B(x - 1, y1 - 3, z - 1, x + 1, y1 - 3, z + 1, WL.ironD); }
/** 曹 flag on a pole: a tall square pole on a stone-weighted foot, a red banner off its top with a black border and a white panel */
export function flagpole(B: Bx, x: number, z: number, H: number, o: { len?: number; wd?: number; burnt?: boolean } = {}) {
  const len = o.len ?? 24, wd = o.wd ?? 12;
  B(x - 3, 0, z - 3, x + 3, 2, z + 3, 0x5a5650); B(x - 1, 0, z - 1, x + 1, H, z + 1, WL.woodD); B(x - 2, H + 1, z - 2, x + 2, H + 1, z + 2, WL.ironL);
  if (o.burnt) { B(x + 2, H - len + 8, z, x + wd - 4, H - 2, z, WL.char); return; }
  B(x + 2, H - len, z, x + wd + 1, H - 1, z, WL.red); B(x + 2, H - len, z, x + wd + 1, H - len, z, WL.black); B(x + wd + 1, H - len, z, x + wd + 1, H - 1, z, WL.black);
  B(x + 4, H - Math.round(len * 0.7), z, x + wd - 2, H - Math.round(len * 0.3), z, WL.white); B(x + 6, H - Math.round(len * 0.6), z, x + wd - 4, H - Math.round(len * 0.4), z, WL.black);
}
/** a camp tent (军帐): a canvas ridge tent — two walls stepping in to a ridge in three tiers, guy-ropes out to stakes, a dark doorway,
 *  a red band along the eave (an officer's: a pennant on the ridge pole) */
export function tent(B: Bx, hw: number, hd: number, H: number, o: { officer?: boolean; lit?: boolean } = {}) {
  const C = WL.canvas, D = WL.canvasD, L = WL.canvasL;
  B(-hw, 0, -hd, hw, Math.round(H * 0.45), hd, C);
  B(-hw + 2, Math.round(H * 0.45) + 1, -hd, hw - 2, Math.round(H * 0.7), hd, C); B(-hw + 5, Math.round(H * 0.7) + 1, -hd, hw - 5, H - 1, hd, L);
  B(-hw, Math.round(H * 0.45), -hd, hw, Math.round(H * 0.45), hd, D); B(-hw + 2, Math.round(H * 0.7), -hd, hw - 2, Math.round(H * 0.7), hd, D);
  B(-2, H, -hd - 1, 2, H + 1, hd + 1, WL.woodD);
  B(-hw, 2, -hd, hw, 3, -hd, WL.red); B(-hw, 2, hd, hw, 3, hd, WL.red);
  B(-4, 0, hd, 4, Math.round(H * 0.55), hd, o.lit ? 0xd88a40 : 0x2a2420, o.lit ? 1 : 0);
  for (const s of [-1, 1]) for (const zz of [-hd + 3, hd - 3]) { B(s * (hw + 6), 0, zz, s * (hw + 6), 2, zz, WL.woodD); B(Math.min(s * hw, s * (hw + 5)), 2, zz, Math.max(s * hw, s * (hw + 5)), 2, zz, WL.rope); }
  if (o.officer) { B(-1, H + 2, -1, 1, H + 14, 1, WL.woodD); B(2, H + 8, 0, 9, H + 13, 0, WL.red); }
}
/** a fire basket (火盆) on an iron tripod: embers and a flame block on top; returns the flame's local point */
export function fireBasket(B: Bx, x: number, z: number, h = 12, lit = true): P3 {
  for (const [a, b] of [[-3, -3], [3, -3], [0, 3]] as const) B(x + a, 0, z + b, x + a, h - 1, z + b, WL.ironD);
  B(x - 4, h, z - 4, x + 4, h + 3, z + 4, WL.iron); B(x - 3, h + 1, z - 3, x + 3, h + 3, z + 3, lit ? WL.ember : WL.ash, lit ? 1 : 0);
  if (lit) B(x - 2, h + 4, z - 2, x + 2, h + 6, z + 2, WL.fire, 1);
  return [x, h + 6, z];
}
/** a hanging lantern on a short arm off a post: red silk body, a glowing middle, dark top and foot */
export function lantern(B: Bx, x: number, z: number, H: number, lit = true) {
  B(x - 1, 0, z - 1, x + 1, H, z + 1, WL.woodD); B(x + 2, H - 1, z, x + 6, H, z, WL.woodD);
  B(x + 4, H - 10, z - 2, x + 8, H - 2, z + 2, WL.red); B(x + 5, H - 9, z - 1, x + 7, H - 3, z + 1, lit ? WL.lamp : WL.redD, lit ? 1 : 0);
  B(x + 4, H - 1, z - 2, x + 8, H - 1, z + 2, WL.black); B(x + 4, H - 11, z - 2, x + 8, H - 11, z + 2, WL.black);
  return [x + 6, H - 6, z] as P3;
}
/** a coil of the great chain lying on a deck: flat square rings in two tones, each ring lying on the one below (the bottom one on y) */
export function chainCoil(B: Bx, x: number, z: number, y: number, R = 7) {
  for (let i = 0; i < 3; i++) { const r = R - i * 2, k = i % 2 ? WL.ironD : WL.iron, k2 = i % 2 ? WL.iron : WL.ironD; B(x - r, y + i, z - r, x + r, y + i, z - r + 2, k); B(x - r, y + i, z + r - 2, x + r, y + i, z + r, k); B(x - r, y + i, z - r, x - r + 2, y + i, z + r, k2); B(x + r - 2, y + i, z - r, x + r, y + i, z + r, k2); }
}
/** the great chain running between two points on a line along local x at height y: square links, alternating flat and on edge */
export function chainRun(B: Bx, x0: number, x1: number, z: number, y: number) {
  for (let x = Math.min(x0, x1), i = 0; x <= Math.max(x0, x1); x += 3, i++) { if (i % 2) B(x, y - 1, z, x + 2, y + 1, z, WL.iron); else B(x, y, z - 1, x + 2, y, z + 1, WL.ironD); }
}
/**
 * a moored warship's hull seen from the deck side (斗舰 / 蒙冲): a long hull along local x — the black tarred sides in three plank strakes
 * stepping out as they rise, a red sheer strake, the deck, a breastwork (女墙) with oar ports, a deckhouse with a stepped roof, a mast with
 * a furled sail; burning: the deckhouse black and broken, flames on it, the sail gone
 */
export function hull(c: Ctx, x: number, z: number, r: number, o: { L: number; burning?: boolean; mast?: boolean; tall?: number }) {
  const B = frame(c.w, x, z, r), hl = Math.round(o.L / 2), b = 16, burn = !!o.burning;
  // the hull: the waterline row in the dark water, three strakes stepping out by one each, the sheer strake red
  for (let i = 0; i < 4; i++) { const y0 = -2 + i * 4, ins = 3 - i, col = i === 3 ? WL.red : i % 2 ? WL.tarL : WL.tar; B(-hl + ins * 3, y0, -b + ins, hl - ins * 3, y0 + 3, b - ins, col); }
  B(-hl, 14, -b, hl, 14, b, WL.redD);
  // bow and stern: stepped up two tiers at each end
  for (const s of [-1, 1]) { B(s > 0 ? hl - 10 : -hl, 15, -b + 2, s > 0 ? hl : -hl + 10, 19, b - 2, WL.tar); B(s > 0 ? hl - 6 : -hl, 20, -b + 4, s > 0 ? hl : -hl + 6, 22, b - 4, WL.tarL); }
  deck(B, -hl + 10, hl - 10, -b + 1, b - 1, 15, { along: 'x' });
  // the breastwork along both sides (standing on the sheer strake), oar ports in it
  for (const sz of [-b, b]) { B(-hl + 10, 15, sz, hl - 10, 22, sz, WL.woodD); for (let xx = -hl + 14; xx < hl - 12; xx += 8) B(xx, 18, sz, xx + 2, 20, sz, 0x141010); B(-hl + 10, 23, sz, hl - 10, 23, sz, WL.wood); }
  // the deckhouse amidships
  const dh = o.tall ?? 16, dx0 = -Math.round(hl * 0.35), dx1 = Math.round(hl * 0.25);
  if (!burn) {
    B(dx0, 16, -b + 4, dx1, 16 + dh, b - 4, WL.wood); for (let y = 20; y < 16 + dh; y += 5) B(dx0, y, -b + 4, dx1, y, b - 4, WL.woodD);
    B(dx0 - 2, 17 + dh, -b + 2, dx1 + 2, 18 + dh, b - 2, 0x3a3c42); B(dx0 + 2, 19 + dh, -b + 5, dx1 - 2, 20 + dh, b - 5, 0x4c4e55);
    for (let xx = dx0 + 4; xx < dx1 - 2; xx += 7) B(xx, 22, b - 4, xx + 3, 26, b - 4, 0x1a1414);
  } else {
    B(dx0, 16, -b + 4, dx0 + 8, 16 + Math.round(dh * 0.7), b - 4, WL.char); B(dx1 - 6, 16, -b + 4, dx1, 16 + Math.round(dh * 0.4), b - 4, WL.char);
    B(dx0 + 9, 16, -b + 6, dx1 - 7, 18, b - 6, WL.ember, 1); B(dx0 + 10, 19, -b + 8, dx1 - 9, 22, b - 8, WL.fire, 1); B(dx0 + 12, 23, -2, dx1 - 12, 27, 2, WL.fireL, 1);
  }
  // the mast and a furled sail
  if (o.mast !== false) {
    const mx = Math.round(hl * 0.45), MH = 16 + dh + 40;
    B(mx - 1, 16, -1, mx + 1, burn ? MH - 22 : MH, 1, burn ? WL.char : WL.woodD);
    if (!burn) { B(mx - 1, MH - 10, -12, mx + 1, MH - 8, 12, WL.woodD); B(mx - 2, MH - 16, -11, mx + 2, MH - 11, 11, WL.canvasD); B(mx, MH - 18, -10, mx, MH - 16, 10, WL.rope); }
  }
  const lights: P3[] = [];
  if (burn) lights.push(locM(M(x), M(z), r, Math.round((dx0 + dx1) / 2), 24, 0));
  return { lights, deckY: 15 };
}
