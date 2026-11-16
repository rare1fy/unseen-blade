// 三国乱世 · 蒙眼刀客，第二批（11-16 用户看完 act-02：「带斗笠那个还不错，但是我想再多看几种造型，更酷、更潇洒的」「主角也有点太胖了，
// 做一个女性版出来」——女主角也是瞎子，只借《蓝眼武士》主角那种冷、狠、利落、孤身的气质，不做蓝眼，不照搬造型）。
// 身材整体改瘦改长：肩宽 12 格（原来 16）、腿 2 格宽 11 格长、头 6×7×6；女主角肩再窄 2 格、躯干短 1 格。同一套关节名，动作照用。
// 用户补充：「衣服不要那么长，还是要干练一点的，头上保留长飘带」→ 下摆都在膝盖以上，披风只到大腿，每人头上两条长飘带。
//   男：斗笠（用户说不错的那个，瘦版）、披风（到大腿的黑披风、暗红里子、立领、银冠发髻）、白发（白色高马尾、袒右臂、红蒙眼）、
//       帷帽（黑漆宽檐帽，帽檐下一圈黑纱，正面留缝露出白蒙眼）。
//   女：马尾（高马尾、窄袖劲装、红腰封、长靴）、短发（齐耳短发、男装、短斗篷、背后搭着兜帽、白蒙眼长尾）。
// 只用横平竖直的大块，2～3 档颜色，不撒随机点、不走斜线台阶（CLAUDE.md 美术铁律）。
import { newChar, biped, rbox, type V, type Anchors, type Biped } from '../bestiary/kit';
import { ROSTER, type ModelDef } from '../bestiary/models';
import type { Col } from '../look/voxkit';
import { blindfold, ringSword, leftHand, sash, face } from './blind';

// 11-16 用户看完 act-03：「现在的肩膀都好怂起来」——没有脖子，头直接坐在胸口上，肩线和下巴平齐。加两格脖子，躯干短一格。
const MALE = { legH: 11, legW: 2, legD: 2, legGap: 1, hipH: 2, torsoH: 6, torsoW: 6, chestW: 8, torsoD: 4, headW: 6, headH: 7, headD: 6, neckH: 2, armW: 2, upper: 4, fore: 4, hand: 2 } as const;
// MALE: hip 11, spine 13..15, chest 16..18 (x −4..3, z −2..1, front z 1), neck 19..20, head 21..27 (x −3..2, z −3..2, face z 2),
//       arms x 4..5 / −6..−5 (z −1..0, upper arm 15..18), thighs 6..10, shins 2..5, legs x 1..2 / −3..−2
const FEMALE = { ...MALE, torsoH: 5 } as const;
// FEMALE: hip 11, spine 13..14, chest 15..17 (x −4..3), neck 18..19, head 20..26 (upper arm 14..17)
// act-05 反馈「肩膀和手臂的衔接还是有点问题……可以再近一点点」：body() 把手臂往里收一格（arms x 3..4 / −5..−4）

/** the biped, then the shoulders: the arms moved one cell in so each overlaps the chest's outer column (no gap opens under the
 *  shoulder when the arm swings out; act-05: 「肩膀和手臂的衔接……可以再近一点点」), the chest's top row filled out to its edges (the
 *  kit rounds it in on every side, which left square arm tops standing above the shoulder line — 「肩膀都好怂起来」) and laid over the
 *  arm's inner top cell like a shoulder; a 2 × 2 neck between the chest and the head */
const ARM_L = ['armL', 'foreL', 'handL'], ARM_R = ['armR', 'foreR', 'handR'];
const body = (v: V, o: Biped): Anchors => {
  const A = biped(v, o), cw = A.chestW, hz = A.torsoD / 2, T1 = A.torsoY1, c = o.chest ?? o.torso ?? o.skin;
  for (const n of ['shL', 'armL', 'foreL', 'handL', 'offhand']) { const b = v.bonesAbs.get(n); if (b) b.p.x -= 1; }
  for (const n of ['shR', 'armR', 'foreR', 'handR', 'weapon']) { const b = v.bonesAbs.get(n); if (b) b.p.x += 1; }
  const moved: Array<{ x: number; y: number; z: number; c: Col; g: number; part: string }> = [];
  for (const [k, cell] of v.cells) { const d = ARM_L.includes(cell.part) ? -1 : ARM_R.includes(cell.part) ? 1 : 0; if (d) { moved.push({ ...cell, x: cell.x + d }); v.cells.delete(k); } }
  for (const m of moved) { v.part(m.part); v.set(m.x, m.y, m.z, m.c, m.g); }
  v.part('chest');
  for (let x = -cw / 2; x <= cw / 2 - 1; x++) for (let z = -hz; z <= hz - 1; z++) if (Math.min(x + cw / 2, cw / 2 - 1 - x) + Math.min(z + hz, hz - 1 - z) >= 1) v.set(x, T1, z, c);
  v.part('neck').box(-1, T1 + 1, -1, 0, A.headY0 - 1, 0, o.skin);
  return { ...A, wR: [A.wR[0] + 1, A.wR[1], A.wR[2]], wL: [A.wL[0] - 1, A.wL[1], A.wL[2]] };
};
/** the crossed collar on the slim torso's front (light inner collar, the outer robe's edge as a straight strip) */
function collar(v: V, A: Anchors, inner: Col, edge: Col) {
  const zf = A.torsoD / 2 - 1, T1 = A.torsoY1, T0 = A.torsoY0;
  v.paint(c => (c.z === zf && c.y === T1 && c.x >= -2 && c.x <= 1 ? inner : c.z === zf && c.y === T1 - 1 && c.x >= -1 && c.x <= 0 ? inner : c.z === zf && c.x === 1 && c.y >= T0 + 2 && c.y < T1 - 1 ? edge : null), 'chest');
  v.paint(c => (c.z === zf && c.x === 1 && c.y >= T0 + 2 ? edge : null), 'spine');
}
/** coat flaps on the thighs (each thigh carries its half, so a stride opens them), from the hips down to y0 */
function flaps(v: V, y0: number, c: Col, hem: Col, top = 10) {
  v.part('legL').box(0, y0, -2, 3, top, 1, c).box(0, y0, -2, 3, y0, 1, hem);
  v.part('legR').box(-4, y0, -2, -1, top, 1, c).box(-4, y0, -2, -1, y0, 1, hem);
}
/** a scabbard hung flat at the left hip, sticking out behind */
function hipScabbard(v: V, A: Anchors, x: number, c: Col, fit: Col) {
  const y = A.hipY + 1; v.part('hips').box(x, y, -9, x, y + 1, 0, c).box(x, y, 0, x, y + 1, 0, fit).box(x, y, -9, x, y + 1, -9, fit);
}
/** shoulder caps on the upper arms (they move with the arm and sit level with the shoulder line, not above it): the arm's top row
 *  widened into a slab, and an outer drop */
function shoulderCaps(v: V, A: Anchors, c: Col, edge: Col) {
  const T = A.shoulderY - 1, x0 = A.chestW / 2 - 1, x1 = x0 + 2;
  v.part('armL').box(x0, T, -2, x1, T, 1, c).box(x1, T - 2, -2, x1, T - 1, 1, c).box(x1, T - 2, -2, x1, T - 2, 1, edge);
  v.part('armR').box(-x1 - 1, T, -2, -x0 - 1, T, 1, c).box(-x1 - 1, T - 2, -2, -x1 - 1, T - 1, 1, c).box(-x1 - 1, T - 2, -2, -x1 - 1, T - 2, 1, edge);
}
/** a chain of joints down the back from (x, y, z) (cells), each segment a slab; returns nothing — the cells are on the chain */
function chain(v: V, prefix: string, parent: string, x0: number, x1: number, y: number, z: number, lens: number[], c: Col, tip: Col, depth = 1) {
  let yy = y, par = parent;
  lens.forEach((L, i) => {
    const bn = `${prefix}${i + 1}`; v.bone(bn, par, (x0 + x1 + 1) / 2, yy + 0.5, z + 0.5);
    v.part(bn).box(x0, yy - L + 1, z - depth + 1, x1, yy, z, c);
    if (i === lens.length - 1) v.box(x0, yy - L + 1, z - depth + 1, x1, yy - L + 1, z, tip);
    par = bn; yy -= L;
  });
}

// ------------------------------------------------------------------ 斗笠（瘦版）
function buildHat(): V {
  const v = newChar();
  const C = { ROBE: 0x3c4654, ROBE_L: 0x5a6678, ROBE_D: 0x272e38, INNER: 0xe8e2d4, SASH: 0x1e1a1c, RED: 0xb8302a, LINEN: 0x9c9486, LINEN_D: 0x6e685e, TROU: 0x23252c,
    STRAW: 0xc9a457, STRAW_D: 0x8e6e34, STRAW_L: 0xe2c078, BAND: 0xeee8da, BAND_D: 0xb8b0a0, SKIN: 0xd9a883, SKIN_D: 0xa4765a, HAIR: 0x1e1c22,
    EDGE: 0xeef3f8, STEEL: 0x9aa2b0, BRONZE: 0xb8893a, LEATH: 0x5a3c28, LACQ: 0x1e1a1c };
  const A = body(v, { skin: C.SKIN, legs: C.TROU, boots: C.LEATH, hips: C.ROBE, torso: C.ROBE, chest: C.ROBE, belt: null, sleeve: C.ROBE, fore_: C.LINEN, hands: C.SKIN, head: C.SKIN, ...MALE });
  const H0 = A.headY0;
  collar(v, A, C.INNER, C.ROBE_L); sash(v, A, C.SASH);
  v.part('hips').box(1, A.hipY - 2, 2, 1, A.hipY + 1, 2, C.RED).box(2, A.hipY, 2, 2, A.hipY + 1, 2, C.RED);
  flaps(v, 7, C.ROBE, C.ROBE_D);
  v.paint(c => (c.y <= 13 ? C.LEATH : null), 'foreL'); v.paint(c => (c.y <= 13 ? C.LEATH : null), 'foreR');
  for (const s of ['shinL', 'shinR']) v.paint(c => (c.y === 5 ? C.LINEN_D : C.LINEN), s);
  for (const s of ['footL', 'footR']) v.paint(c => (c.y === 0 ? C.STRAW_D : null), s);
  v.paint(c => (c.y >= H0 + 5 || (c.z <= -2 && c.y >= H0 + 1) ? C.HAIR : null), 'head');
  face(v, A, C.SKIN, C.SKIN_D);
  blindfold(v, A, C.BAND, C.BAND_D, { a: [6, 6, 5], b: [6, 5] });
  v.part('hat');
  const BR = H0 + 5;
  rbox(v, -9, BR, -9, 8, BR, 8, C.STRAW, 4, false);
  v.paint(c => (c.y === BR && (!v.get(c.x + 1, c.y, c.z) || !v.get(c.x - 1, c.y, c.z) || !v.get(c.x, c.y, c.z + 1) || !v.get(c.x, c.y, c.z - 1)) ? C.STRAW_D : null), 'hat');
  rbox(v, -5, BR + 1, -5, 4, BR + 1, 4, C.STRAW, 2, false);
  rbox(v, -3, BR + 2, -3, 2, BR + 2, 2, C.STRAW_L, 1, false);
  v.box(-2, BR + 3, -2, 1, BR + 3, 1, C.STRAW_L).box(-1, BR + 4, -1, 0, BR + 4, 0, C.STRAW_D);
  ringSword(v, A, { len: 15, edge: C.EDGE, spine: C.STEEL, grip: C.LEATH, ring: C.BRONZE, guard: C.BRONZE, tassel: C.RED, glove: C.SKIN, knuckle: C.SKIN_D });
  leftHand(v, A, C.SKIN, C.SKIN_D);
  hipScabbard(v, A, 3, C.LACQ, C.BRONZE);
  return v;
}

// ------------------------------------------------------------------ 大氅
function buildCloak(): V {
  const v = newChar();
  const C = { CLOAK: 0x1c1c24, CLOAK_L: 0x30303c, LINING: 0x8a1e22, ROBE: 0x3e404c, ROBE_L: 0x5a5c6a, INNER: 0xd8d2c4, SASH: 0x6a1a1e, TROU: 0x1a1a20, BOOT: 0x121216,
    SKIN: 0xdcb090, SKIN_D: 0xa87e62, HAIR: 0x141418, BAND: 0x16151a, BAND_D: 0x08080a, SILVER: 0xc8ccd6, EDGE: 0xeef3f8, STEEL: 0x8e96a4 };
  const A = body(v, { skin: C.SKIN, legs: C.TROU, boots: C.BOOT, hips: C.ROBE, torso: C.ROBE, chest: C.ROBE, belt: null, sleeve: C.ROBE, fore_: C.ROBE, hands: C.SKIN, head: C.SKIN, ...MALE });
  const H0 = A.headY0, T1 = A.torsoY1;
  collar(v, A, C.INNER, C.ROBE_L); sash(v, A, C.SASH);
  flaps(v, 7, C.ROBE, C.CLOAK);
  for (const s of ['shinL', 'shinR']) v.paint(() => C.BOOT, s);
  // the stand collar of the cloak round the back and sides of the neck
  v.part('chest').box(-3, T1 + 1, -2, 2, T1 + 2, -2, C.CLOAK).box(-3, T1 + 1, -1, -3, T1 + 2, 0, C.CLOAK).box(2, T1 + 1, -1, 2, T1 + 2, 0, C.CLOAK).box(-3, T1 + 2, -2, 2, T1 + 2, -2, C.CLOAK_L);
  shoulderCaps(v, A, C.CLOAK, C.LINING);
  // the cape: two joints down the back to the thigh, black outside, dark red inside, the front edges red
  chain(v, 'clA', 'chest', -5, 4, T1 - 1, -3, [7, 4], C.LINING, C.LINING, 1);
  v.part('clA1').box(-5, T1 - 7, -4, 4, T1 - 1, -4, C.CLOAK).box(-6, T1 - 7, -4, -6, T1 - 1, -1, C.CLOAK).box(5, T1 - 7, -4, 5, T1 - 1, -1, C.CLOAK)
    .box(-6, T1 - 7, 0, -6, T1 - 1, 0, C.LINING).box(5, T1 - 7, 0, 5, T1 - 1, 0, C.LINING);
  v.part('clA2').box(-5, T1 - 11, -4, 4, T1 - 8, -4, C.CLOAK).box(-6, T1 - 11, -4, -6, T1 - 8, -1, C.CLOAK).box(5, T1 - 11, -4, 5, T1 - 8, -1, C.CLOAK)
    .box(-6, T1 - 11, -4, 5, T1 - 11, -4, C.CLOAK_L).box(-6, T1 - 11, 0, -6, T1 - 8, 0, C.LINING).box(5, T1 - 11, 0, 5, T1 - 8, 0, C.LINING);
  // head: hair, a topknot with a small silver crown and pin
  v.paint(c => (c.y >= H0 + 5 || (c.z <= -2 && c.y >= H0 + 1) || ((c.x === -3 || c.x === 2) && c.y >= H0 + 3) ? C.HAIR : null), 'head');
  v.part('hat').box(-1, H0 + 7, -2, 0, H0 + 8, 0, C.HAIR).box(-1, H0 + 9, -2, 0, H0 + 9, -1, C.SILVER).box(-2, H0 + 8, -1, 1, H0 + 8, -1, C.SILVER);
  face(v, A, C.SKIN, C.SKIN_D);
  blindfold(v, A, C.BAND, C.BAND_D, { a: [6, 6, 5], b: [6, 5] });
  ringSword(v, A, { len: 16, edge: C.EDGE, spine: C.STEEL, grip: C.CLOAK, ring: C.SILVER, guard: C.SILVER, glove: C.SKIN, knuckle: C.SKIN_D });
  leftHand(v, A, C.SKIN, C.SKIN_D);
  return v;
}

// ------------------------------------------------------------------ 白发
function buildWhite(): V {
  const v = newChar();
  const C = { HAIR: 0xe8e8ee, HAIR_D: 0xb4b4c0, ROBE: 0x34405a, ROBE_L: 0x4a587a, ROBE_D: 0x222b3e, INNER: 0xd8d2c4, SASH: 0x1a1a22, RED: 0xc23a30, RED_D: 0x8a2420,
    SKIN: 0xe0b896, SKIN_D: 0xae8668, WRAP: 0xd8d0c0, TROU: 0x1e2230, BOOT: 0x18181e, EDGE: 0xeef3f8, STEEL: 0x9aa2b0, IRON: 0x4a4e58 };
  const A = body(v, { skin: C.SKIN, legs: C.TROU, boots: C.BOOT, hips: C.ROBE, torso: C.ROBE, chest: C.ROBE, belt: null, sleeve: C.ROBE, fore_: C.ROBE, hands: C.SKIN, head: C.SKIN, ...MALE });
  const H0 = A.headY0, T1 = A.torsoY1;
  collar(v, A, C.INNER, C.ROBE_L); sash(v, A, C.SASH);
  flaps(v, 7, C.ROBE, C.ROBE_D);
  for (const s of ['shinL', 'shinR']) v.paint(c => (c.y >= 4 ? C.WRAP : null), s);
  // the right sleeve off (袒右臂): bare right shoulder and arm with white wraps on the forearm, the empty sleeve tied at the waist
  v.paint(c => (c.x <= -3 && c.y >= T1 - 1 ? C.SKIN : null), 'chest');
  v.paint(() => C.SKIN, 'armR'); v.paint(c => (c.y <= 13 || c.y === 15 ? C.WRAP : C.SKIN), 'foreR');
  v.part('hips').box(-4, A.hipY - 4, -1, -4, A.hipY + 1, 0, C.ROBE).box(-4, A.hipY - 4, -1, -4, A.hipY - 4, 0, C.ROBE_D);
  // white hair: top, back, long locks beside the face; a high ponytail (three joints) tied with red
  v.paint(c => (c.y >= H0 + 5 || (c.z <= -2 && c.y >= H0 + 1) || ((c.x === -3 || c.x === 2) && c.y >= H0 + 2) ? C.HAIR : null), 'head');
  v.part('head').box(-4, H0 - 1, 0, -4, H0 + 5, 1, C.HAIR).box(3, H0 - 1, 0, 3, H0 + 5, 1, C.HAIR);
  v.part('hat').box(-1, H0 + 7, -3, 0, H0 + 7, -2, C.RED);
  chain(v, 'hrA', 'head', -1, 0, H0 + 7, -4, [6, 5, 5], C.HAIR, C.HAIR_D, 1);
  face(v, A, C.SKIN, C.SKIN_D);
  blindfold(v, A, C.RED, C.RED_D, { a: [6, 6, 5], b: [6, 5] });
  ringSword(v, A, { len: 16, edge: C.EDGE, spine: C.STEEL, grip: C.SASH, ring: C.IRON, guard: C.IRON, tassel: C.RED, glove: C.SKIN, knuckle: C.SKIN_D });
  leftHand(v, A, C.SKIN, C.SKIN_D);
  return v;
}

// ------------------------------------------------------------------ 帷帽
function buildVeil(): V {
  const v = newChar();
  const C = { HAT: 0x2a2826, HAT_L: 0x46423c, VEIL: 0x30303a, ROBE: 0x2e4a44, ROBE_L: 0x44665e, ROBE_D: 0x1d302c, INNER: 0xd8d2c4, SASH: 0x6a5030, SASH_D: 0x4a3620,
    SKIN: 0xd9a883, SKIN_D: 0xa4765a, HAIR: 0x1e1c22, BAND: 0xeee8da, BAND_D: 0xb8b0a0, TROU: 0x22262a, BOOT: 0x1a1a1e, EDGE: 0xeef3f8, STEEL: 0x9aa2b0, BRONZE: 0xb8893a, LACQ: 0x1e1a1c };
  const A = body(v, { skin: C.SKIN, legs: C.TROU, boots: C.BOOT, hips: C.ROBE, torso: C.ROBE, chest: C.ROBE, belt: null, sleeve: C.ROBE, fore_: C.ROBE, hands: C.SKIN, head: C.SKIN, ...MALE });
  const H0 = A.headY0;
  collar(v, A, C.INNER, C.ROBE_L); sash(v, A, C.SASH);
  v.part('spine').box(-1, A.torsoY0, 2, 0, A.torsoY0 + 1, 2, C.SASH_D);
  flaps(v, 7, C.ROBE, C.ROBE_D);
  v.paint(c => (c.y <= 13 ? C.SASH : null), 'foreL'); v.paint(c => (c.y <= 13 ? C.SASH : null), 'foreR');
  for (const s of ['shinL', 'shinR']) v.paint(() => C.BOOT, s);
  v.paint(c => (c.y >= H0 + 5 || (c.z <= -2 && c.y >= H0 + 1) ? C.HAIR : null), 'head');
  face(v, A, C.SKIN, C.SKIN_D);
  blindfold(v, A, C.BAND, C.BAND_D, { a: [6, 6, 4], b: [6, 5] });
  // the hat: a flat black brim, a round-cornered crown with a lighter band; a dark veil hanging from under the brim all round,
  // four rows deep, open in front so the white blindfold shows through the gap
  v.part('hat');
  const BR = H0 + 5;
  rbox(v, -7, BR, -7, 6, BR, 6, C.HAT, 3, false);
  rbox(v, -3, BR + 1, -3, 2, BR + 3, 2, C.HAT, 1, true); v.box(-3, BR + 1, -3, 2, BR + 1, 2, C.HAT_L);
  const y0 = BR - 4, y1 = BR - 1;
  v.box(-4, y0, -6, 3, y1, -6, C.VEIL).box(-6, y0, -4, -6, y1, 3, C.VEIL).box(5, y0, -4, 5, y1, 3, C.VEIL)
    .box(-4, y0, 5, -3, y1, 5, C.VEIL).box(2, y0, 5, 3, y1, 5, C.VEIL)
    .box(-5, y0, -5, -5, y1, -5, C.VEIL).box(4, y0, -5, 4, y1, -5, C.VEIL).box(-5, y0, 4, -5, y1, 4, C.VEIL).box(4, y0, 4, 4, y1, 4, C.VEIL);
  ringSword(v, A, { len: 15, edge: C.EDGE, spine: C.STEEL, grip: C.SASH_D, ring: C.BRONZE, guard: C.BRONZE, glove: C.SKIN, knuckle: C.SKIN_D });
  leftHand(v, A, C.SKIN, C.SKIN_D);
  hipScabbard(v, A, 3, C.LACQ, C.BRONZE);
  return v;
}

// ------------------------------------------------------------------ 马尾（女）
function buildPony(): V {
  const v = newChar();
  const C = { SUIT: 0x2a2e44, SUIT_L: 0x3e4462, SUIT_D: 0x1b1e2e, RED: 0xc0302a, RED_D: 0x86201c, HAIR: 0x141218, HAIR_L: 0x26222c, SKIN: 0xe8c4a4, SKIN_D: 0xb8907a,
    BAND: 0x18161c, BAND_D: 0x08080a, LEATH: 0x5a3a26, BOOT: 0x18181e, EDGE: 0xeef3f8, STEEL: 0x9aa2b0, IRON: 0x4a4e58, LACQ: 0x1c1a20 };
  const A = body(v, { skin: C.SKIN, legs: C.SUIT_D, boots: C.BOOT, hips: C.SUIT, torso: C.SUIT, chest: C.SUIT, belt: null, sleeve: C.SUIT, fore_: C.LEATH, hands: C.SKIN, head: C.SKIN, ...FEMALE });
  const H0 = A.headY0;
  collar(v, A, C.RED, C.SUIT_L);
  // a wide red waist sash, its two ends hanging at the left hip
  v.paint(c => (c.y <= A.torsoY0 + 1 ? C.RED : null), 'spine');
  v.part('hips').box(2, A.hipY - 4, 2, 2, A.hipY + 1, 2, C.RED).box(1, A.hipY - 2, 2, 1, A.hipY + 1, 2, C.RED_D);
  // hips one cell wider each side, short coat flaps to the knee, tall boots
  v.part('hips').box(-4, A.hipY, -2, 3, A.hipY + 1, 1, C.SUIT);
  flaps(v, 8, C.SUIT, C.SUIT_D);
  for (const s of ['shinL', 'shinR']) v.paint(() => C.BOOT, s);
  // hair: top, back, side bangs framing the face; a high ponytail (three joints) from a red tie at the crown
  v.paint(c => (c.y >= H0 + 5 || (c.z <= -2 && c.y >= H0 + 1) || ((c.x === -3 || c.x === 2) && c.y >= H0 + 2) ? C.HAIR : null), 'head');
  v.part('head').box(-4, H0, 1, -4, H0 + 5, 2, C.HAIR).box(3, H0, 1, 3, H0 + 5, 2, C.HAIR);
  v.part('hat').box(-1, H0 + 6, -4, 0, H0 + 7, -4, C.RED);
  chain(v, 'hrA', 'head', -1, 0, H0 + 7, -5, [6, 6, 6], C.HAIR, C.HAIR_L, 1);
  face(v, A, C.SKIN, C.SKIN_D);
  blindfold(v, A, C.BAND, C.BAND_D, { a: [], b: [], knot: false });
  // two long red ribbons from the hair tie (the head's long streamers), hanging behind the ponytail
  chain(v, 'bfA', 'head', 0, 0, H0 + 6, -6, [6, 6, 5], C.RED, C.RED_D, 1);
  chain(v, 'bfB', 'head', -1, -1, H0 + 6, -6, [6, 5], C.RED, C.RED_D, 1);
  v.part('hat').box(-1, H0 + 6, -5, 0, H0 + 7, -5, C.RED);
  ringSword(v, A, { len: 16, edge: C.EDGE, spine: C.STEEL, grip: C.SUIT_D, ring: C.IRON, guard: C.IRON, tassel: C.RED, glove: C.SKIN, knuckle: C.SKIN_D });
  leftHand(v, A, C.SKIN, C.SKIN_D);
  hipScabbard(v, A, 4, C.LACQ, C.RED);
  return v;
}

// ------------------------------------------------------------------ 短发（女）
function buildCrop(): V {
  const v = newChar();
  const C = { CAPE: 0x4e2a28, CAPE_D: 0x341c1a, CAPE_L: 0x683a36, ROBE: 0x8a8478, ROBE_L: 0xa49e90, ROBE_D: 0x5e5a50, INNER: 0x2a2826, SASH: 0x2a2826, HAIR: 0x201c1e,
    SKIN: 0xe2bea0, SKIN_D: 0xb08c72, BAND: 0xeee8da, BAND_D: 0xb8b0a0, LEATH: 0x5a3c28, BOOT: 0x2a2220, EDGE: 0xeef3f8, STEEL: 0x9aa2b0, IRON: 0x4a4e58 };
  const A = body(v, { skin: C.SKIN, legs: C.ROBE_D, boots: C.BOOT, hips: C.ROBE, torso: C.ROBE, chest: C.ROBE, belt: null, sleeve: C.ROBE, fore_: C.LEATH, hands: C.SKIN, head: C.SKIN, ...FEMALE });
  const H0 = A.headY0, T1 = A.torsoY1;
  collar(v, A, C.INNER, C.ROBE_L); sash(v, A, C.SASH);
  flaps(v, 7, C.ROBE, C.ROBE_D);
  for (const s of ['shinL', 'shinR']) v.paint(c => (c.y >= 4 ? C.LEATH : null), s);
  // cropped hair to the jaw (a man's cut): top, back down to the neck, sides down to the jaw, a straight fringe
  v.paint(c => (c.y >= H0 + 5 || (c.z <= -2 && c.y >= H0) || ((c.x === -3 || c.x === 2) && c.y >= H0 + 1) ? C.HAIR : null), 'head');
  // the short cape: shoulder caps, the hood bunched behind the neck, a back panel to the waist on the cloak chain
  shoulderCaps(v, A, C.CAPE, C.CAPE_D);
  v.part('chest').box(-3, T1 + 1, -3, 2, T1 + 2, -2, C.CAPE).box(-3, T1 + 2, -3, 2, T1 + 2, -3, C.CAPE_L);
  chain(v, 'clA', 'chest', -4, 3, T1, -3, [7], C.CAPE, C.CAPE_D, 1);
  v.part('clA1').box(-4, T1 - 6, -3, -3, T1 - 6, -3, null).box(2, T1 - 6, -3, 3, T1 - 6, -3, null);
  face(v, A, C.SKIN, C.SKIN_D);
  blindfold(v, A, C.BAND, C.BAND_D, { a: [6, 6, 5], b: [6, 5] });
  ringSword(v, A, { len: 15, edge: C.EDGE, spine: C.STEEL, grip: C.LEATH, ring: C.IRON, guard: C.IRON, glove: C.SKIN, knuckle: C.SKIN_D });
  leftHand(v, A, C.SKIN, C.SKIN_D);
  return v;
}

const def = (id: string, name: string, role: string, build: () => V, tip: number): ModelDef => ({ id, name, group: '职业', role, line: '', kind: 'biped', attack: 'dual', tip, build });
export const SLIM: ModelDef[] = [
  def('slim_hat', '斗笠', '蒙眼刀客', buildHat, 18),
  def('slim_cloak', '披风', '蒙眼刀客', buildCloak, 19),
  def('slim_white', '白发', '蒙眼刀客', buildWhite, 19),
  def('slim_veil', '帷帽', '蒙眼刀客', buildVeil, 18),
  def('slim_pony', '马尾', '蒙眼女刀客', buildPony, 19),
  def('slim_crop', '短发', '蒙眼女刀客', buildCrop, 18),
];
for (const d of SLIM) if (!ROSTER.some(r => r.id === d.id)) ROSTER.push(d);
