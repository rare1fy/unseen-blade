// 三国乱世 · 蒙眼刀客（11-16 用户：「谢苗《目中无人》那个蒙眼大侠的感觉更合适我，背景放在三国乱世」）。四个原创造型给用户挑：
//   斗笠：灰青短褐、黑蒙眼布、宽檐斗笠、草鞋绑腿，左胯横挂刀鞘。最「江湖」。
//   披发：素白长衫、黑发披肩、两缕鬓发垂到胸前，朱红蒙眼布两条长尾。最「孤冷」。
//   残甲：汉末札甲（一排排甲片、红褐甲绳）、披膊、甲裙、撕裂的暗红战袍、包头巾、短须，白布条缠眼。最「沙场」。
//   蓑衣：蓑衣披肩（三层草）、发髻扎红绳、络腮短须、灰布蒙眼，背上竖着一个布包的刀鞘。最「行脚」。
// 共同点：身体比例和影忍一样（28 格高，同一套关节，同一套动作），右手环首刀（直刃单刃、柄尾一个方环、小护手），左手空着（立掌）。
// 蒙眼布是眼睛那一圈凸出一格的两行布带，脑后打结，两条布尾各是一串关节（bfA 三节、bfB 两节，ninjaAct.ts 的 tails() 让它们飘）。
// 只用横平竖直的大块，2～3 档颜色，不撒随机点、不走斜线台阶（CLAUDE.md 美术铁律）。
import { newChar, biped, rbox, type V, type Anchors } from '../bestiary/kit';
import { heroGrip, ROSTER, type ModelDef } from '../bestiary/models';
import type { Col } from '../look/voxkit';

const BODY = { legH: 10, legW: 3, legD: 3, legGap: 1, hipH: 2, torsoH: 7, torsoW: 8, chestW: 10, torsoD: 6, headW: 8, headH: 8, headD: 8, armW: 3, upper: 4, fore: 4, hand: 2 } as const;
// with BODY: hipY 10, torso 12..18 (spine 12..14, chest 15..18), shoulder 19, head 19..26 (x −4..3, z −4..3, face z 3), arms x 5..7 / −8..−6

/** the blindfold: two rows round the head at the eyes (one cell proud), a knot at the back, two tails on joint chains */
export function blindfold(v: V, A: Anchors, c: Col, cd: Col, tails: { a: number[]; b: number[]; knot?: boolean }) {
  const y0 = A.headY0 + 3, y1 = y0 + 1, zf = A.faceZ + 1, zb = A.headZ - A.headD / 2 - 1, xl = -A.headW / 2 - 1, xr = A.headW / 2;
  v.part('head').box(xl + 1, y0, zf, xr - 1, y1, zf, c).box(xl + 1, y0, zb, xr - 1, y1, zb, c).box(xl, y0, zb + 1, xl, y1, zf - 1, c).box(xr, y0, zb + 1, xr, y1, zf - 1, c);
  // the band's lower edge a shade darker in front so it reads as cloth over the eyes, not a stripe of paint
  v.box(xl + 1, y0, zf, xr - 1, y0, zf, cd);
  // knot at the back
  if (tails.knot !== false) v.box(-1, y0 - 1, zb - 1, 0, y1 + 1, zb - 1, c);
  // tails: chain a (x 0..1) and chain b (x −2..−1), hanging from under the knot; the last segment's tip row darker
  const chain = (name: string, x0: number, lens: number[]) => {
    let y = y0 - 1, parent = 'head';
    lens.forEach((L, i) => {
      const bn = `${name}${i + 1}`; v.bone(bn, parent, x0 + 1, y + 0.5, zb - 1.5); v.part(bn).box(x0, y - L + 1, zb - 2, x0 + 1, y, zb - 2, c);
      if (i === lens.length - 1) v.box(x0, y - L + 1, zb - 2, x0 + 1, y - L + 1, zb - 2, cd);
      parent = bn; y -= L;
    });
  };
  chain('bfA', 0, tails.a); chain('bfB', -3, tails.b);
}

/** 环首刀: a ring pommel behind the fist (a square ring with a hole), wrapped grip, a small guard, a straight single-edged blade
 *  (edge row + spine row; `wide` adds a third row for a heavy blade), a tassel under the ring. Returns the tip (cells along +z). */
export function ringSword(v: V, A: Anchors, o: { len: number; wide?: boolean; edge: Col; spine: Col; grip: Col; ring: Col; guard: Col; tassel?: Col; glove: Col; knuckle: Col }) {
  const [x, y, z] = A.wR;
  v.part('weapon')
    .box(x, y - 1, z - 4, x, y + 1, z - 2, o.ring).set(x, y, z - 3, null)                  // the ring
    .box(x, y, z - 1, x, y, z + 1, o.grip)                                                  // grip through the fist
    .box(x, y - 1, z + 2, x, y + 2, z + 2, o.guard);                                        // small guard
  // act-19: the blade is its own part (bone 'blade'), so it can be hidden while the sword is sheathed (藏锋 / 归鞘)
  v.bone('blade', 'weapon', x + 0.5, y + 0.5, z + 3).part('blade')
    .box(x, y, z + 3, x, y, z + 2 + o.len, o.edge)                                          // edge row
    .box(x, y + 1, z + 3, x, y + 1, z + 1 + o.len, o.spine);                                // spine row (stops one short: the tip)
  if (o.wide) v.box(x, y + 2, z + 3, x, y + 2, z + o.len - 1, o.spine);
  if (o.tassel) v.box(x, y - 3, z - 3, x, y - 2, z - 3, o.tassel);
  slimGrip(v, A.wR, o.glove, o.knuckle);
  return o.len + 3;
}

/** the left fist: an open guard hand (no weapon). act-19 (user: 「角色的手有点太大了」): 2×2×2, no wider than the forearm (was 3×3×3) */
export function leftHand(v: V, A: Anchors, skin: Col, dark: Col) {
  const [x, y, z] = A.wL; v.part('handL').box(x - 1, y - 1, z - 1, x, y, z, skin).box(x, y - 1, z, x, y, z, dark);
}
/** the sword hand, slimmer than the bestiary's 3×3×3 fist (act-19): two wide, two deep, the grip running through it; the outer
 *  column is the knuckles */
function slimGrip(v: V, at: [number, number, number], glove: Col, knuckle: Col) {
  const [x, y, z] = at; v.bone('weapon', 'handR', x + 0.5, y + 0.5, z + 0.5);
  for (const [key, cell] of v.cells) if (cell.part === 'handR') v.cells.delete(key);
  v.part('handR');
  for (let yy = y - 1; yy <= y + 1; yy++) for (let zz = z - 1; zz <= z; zz++) { v.set(x - 1, yy, zz, knuckle); if (yy !== y) v.set(x, yy, zz, glove); }
}

/** the robe's crossed collar (交领右衽), as straight masses: a light inner collar across the throat (two rows, the lower one
 *  narrower) and the outer robe's edge as a straight strip down to the sash */
function collar(v: V, A: Anchors, inner: Col, edge: Col) {
  const T1 = A.torsoY1, T0 = A.torsoY0;
  v.paint(c => (c.z === 2 && c.y === T1 && c.x >= -2 && c.x <= 1 ? inner : c.z === 2 && c.y === T1 - 1 && c.x >= -1 && c.x <= 0 ? inner : c.z === 2 && c.x === 1 && c.y >= T0 + 2 && c.y <= T1 - 1 ? edge : null), 'chest');
  v.paint(c => (c.z === 2 && c.x === 1 && c.y >= T0 + 2 ? edge : null), 'spine');
}
/** a wide sash: the two lowest torso rows */
export function sash(v: V, A: Anchors, c: Col) { v.paint(cell => (cell.y <= A.torsoY0 + 1 ? c : null), 'spine'); }
/** a split skirt / coat on the thighs (each thigh carries its half, so a running stride opens it): from the hips down to y0 */
function skirt(v: V, y0: number, c: Col, hem: Col) {
  v.part('legL').box(0, y0, -2, 4, 9, 2, c).box(0, y0, -2, 4, y0, 2, hem);
  v.part('legR').box(-5, y0, -2, -1, 9, 2, c).box(-5, y0, -2, -1, y0, 2, hem);
}
/** a scabbard hung flat at the left hip, sticking out behind (on the hips joint) */
function hipScabbard(v: V, A: Anchors, c: Col, fit: Col) {
  const y = A.hipY + 1; v.part('hips').box(5, y, -9, 5, y + 1, 1, c).box(5, y, 1, 5, y + 1, 1, fit).box(5, y, -9, 5, y + 1, -9, fit).box(4, y, -1, 4, y, 0, fit);
}
/** a face under the blindfold: a nose one cell proud, a mouth line */
export function face(v: V, A: Anchors, skin: Col, dark: Col) {
  const H0 = A.headY0, F = A.faceZ;
  v.part('head').box(-1, H0 + 1, F + 1, 0, H0 + 2, F + 1, skin).box(-1, H0 + 1, F + 1, 0, H0 + 1, F + 1, dark);
  v.paint(c => (c.z === F && c.y === H0 && c.x >= -1 && c.x <= 0 ? dark : null), 'head');
}

// ------------------------------------------------------------------ 斗笠
function buildHat(): V {
  const v = newChar();
  const C = { ROBE: 0x4a5664, ROBE_L: 0x66748a, ROBE_D: 0x323a46, INNER: 0xe8e2d4, SASH: 0x2a2224, SASH_L: 0x4a3a32, LINEN: 0x9c9486, LINEN_D: 0x6e685e, TROU: 0x2c2e36,
    STRAW: 0xc9a457, STRAW_D: 0x8e6e34, STRAW_L: 0xe2c078, BAND: 0xe8e1d2, BAND_D: 0xb4ac9c, SKIN: 0xd9a883, SKIN_D: 0xa4765a, HAIR: 0x1e1c22,
    EDGE: 0xeef3f8, STEEL: 0x9aa2b0, BRONZE: 0xb8893a, RED: 0xc8352a, LEATH: 0x5a3c28, LACQ: 0x1e1a1c };
  const A = biped(v, { skin: C.SKIN, legs: C.TROU, boots: C.LEATH, hips: C.ROBE, torso: C.ROBE, chest: C.ROBE, belt: null, sleeve: C.ROBE, fore_: C.LINEN, hands: C.SKIN, head: C.SKIN, ...BODY });
  const H0 = A.headY0;
  collar(v, A, C.INNER, C.ROBE_L); sash(v, A, C.SASH);
  v.part('spine').box(2, A.torsoY0, 3, 3, A.torsoY0 + 1, 3, C.SASH_L);
  v.part('hips').box(2, A.hipY - 1, 3, 2, A.hipY + 1, 3, C.SASH_L).box(3, A.hipY, 3, 3, A.hipY + 1, 3, C.SASH);
  skirt(v, 5, C.ROBE, C.ROBE_D);
  // forearm: linen wraps under a leather bracer; a dark cuff at the sleeve end
  v.paint(c => (c.y <= 12 ? C.LEATH : null), 'foreL'); v.paint(c => (c.y <= 12 ? C.LEATH : null), 'foreR');
  v.paint(c => (c.y === 15 ? C.ROBE_D : null), 'armL'); v.paint(c => (c.y === 15 ? C.ROBE_D : null), 'armR');
  // shins: linen leg wraps with a dark tie row; straw sandal soles
  for (const s of ['shinL', 'shinR']) v.paint(c => (c.y === 4 ? C.LINEN_D : C.LINEN), s);
  for (const s of ['footL', 'footR']) v.paint(c => (c.y === 0 ? C.STRAW_D : null), s);
  // head: hair at the back and top (mostly under the hat)
  v.paint(c => (c.y >= H0 + 5 || (c.z <= -3 && c.y >= H0 + 1) ? C.HAIR : null), 'head');
  face(v, A, C.SKIN, C.SKIN_D);
  blindfold(v, A, C.BAND, C.BAND_D, { a: [5, 5, 4], b: [5, 4] });
  // the hat: a wide brim just above the blindfold (chamfered corners, a dark rim), then a low crown in three tiers and a knob
  v.part('hat');
  const BR = H0 + 5;
  rbox(v, -10, BR, -10, 9, BR, 9, C.STRAW, 4, false);
  v.paint(c => (c.y === BR && (!v.get(c.x + 1, c.y, c.z) || !v.get(c.x - 1, c.y, c.z) || !v.get(c.x, c.y, c.z + 1) || !v.get(c.x, c.y, c.z - 1)) ? C.STRAW_D : null), 'hat');
  rbox(v, -6, BR + 1, -6, 5, BR + 1, 5, C.STRAW, 2, false);
  rbox(v, -4, BR + 2, -4, 3, BR + 2, 3, C.STRAW_L, 1, false);
  v.box(-2, BR + 3, -2, 1, BR + 3, 1, C.STRAW_L).box(-1, BR + 4, -1, 0, BR + 4, 0, C.STRAW_D);
  const tip = ringSword(v, A, { len: 14, edge: C.EDGE, spine: C.STEEL, grip: C.LEATH, ring: C.BRONZE, guard: C.BRONZE, tassel: C.RED, glove: C.SKIN, knuckle: C.SKIN_D });
  leftHand(v, A, C.SKIN, C.SKIN_D);
  hipScabbard(v, A, C.LACQ, C.BRONZE);
  void tip; return v;
}

// ------------------------------------------------------------------ 披发
function buildHair(): V {
  const v = newChar();
  const C = { ROBE: 0xdcd6c8, ROBE_S: 0xb8b1a2, ROBE_D: 0x8c8576, INNER: 0x24222c, SASH: 0x1c1a20, HAIR: 0x1b1a20, HAIR_L: 0x2c2a33, RED: 0xc2342c, RED_D: 0x8a1f1a,
    SKIN: 0xe2bb98, SKIN_D: 0xb08868, TROU: 0x26242e, BOOT: 0x1c1a20, EDGE: 0xeef3f8, STEEL: 0x9aa2b0, IRON: 0x5a5e6a, LACQ: 0x1c1a20, SILV: 0xc8ccd6 };
  const A = biped(v, { skin: C.SKIN, legs: C.TROU, boots: C.BOOT, hips: C.ROBE, torso: C.ROBE, chest: C.ROBE, belt: null, sleeve: C.ROBE, fore_: C.ROBE, hands: C.SKIN, head: C.SKIN, ...BODY });
  const H0 = A.headY0;
  collar(v, A, C.INNER, C.ROBE_S); sash(v, A, C.SASH);
  // the long coat: split panels on the thighs down below the knee
  skirt(v, 3, C.ROBE, C.ROBE_D);
  // wide sleeves: the forearm one cell deeper front and back, a hanging flap behind the wrist, a shaded cuff
  for (const [f, x0] of [['foreL', 5], ['foreR', -8]] as Array<[string, number]>) v.part(f).box(x0, 11, -2, x0 + 2, 14, 2, C.ROBE).box(x0, 11, -2, x0 + 2, 11, 2, C.ROBE_S).box(x0, 9, -2, x0 + 2, 10, -2, C.ROBE_S);
  // hair: top, sides and back of the head; a fringe above the blindfold; two locks hanging in front of the shoulders
  v.paint(c => (c.y >= H0 + 5 || (c.z <= -2 && c.y >= H0 + 1) || ((c.x === -4 || c.x === 3) && c.y >= H0 + 2) ? C.HAIR : null), 'head');
  v.part('head').box(-5, H0 - 2, 0, -5, H0 + 5, 1, C.HAIR).box(4, H0 - 2, 0, 4, H0 + 5, 1, C.HAIR);
  // the long hair down the back: two joints so it swings (on the same chain logic as the blindfold tails)
  v.bone('hrA1', 'head', -0.5, H0 + 3, -4).bone('hrA2', 'hrA1', -0.5, H0 - 4, -4.5);
  v.part('hrA1').box(-4, H0 - 3, -5, 3, H0 + 3, -4, C.HAIR);
  v.part('hrA2').box(-3, H0 - 9, -5, 2, H0 - 4, -5, C.HAIR).box(-3, H0 - 9, -5, 2, H0 - 9, -5, C.HAIR_L);
  face(v, A, C.SKIN, C.SKIN_D);
  blindfold(v, A, C.RED, C.RED_D, { a: [6, 6, 5], b: [6, 5, 4] });
  ringSword(v, A, { len: 16, edge: C.EDGE, spine: C.STEEL, grip: C.INNER, ring: C.IRON, guard: C.IRON, tassel: C.RED, glove: C.SKIN, knuckle: C.SKIN_D });
  leftHand(v, A, C.SKIN, C.SKIN_D);
  hipScabbard(v, A, C.LACQ, C.SILV);
  return v;
}

// ------------------------------------------------------------------ 残甲
function buildArmour(): V {
  const v = newChar();
  const C = { PLATE: 0x6a707e, PLATE_L: 0x8a91a0, PLATE_D: 0x454a56, LACE: 0x3e2a24, CLOTH: 0x7a2a26, CLOTH_D: 0x521b18, TROU: 0x3a2e28, BOOT: 0x231d1c,
    WRAP: 0x5e2622, WRAP_L: 0x76332c, BAND: 0x18161a, BAND_D: 0x0a090c, SKIN: 0xc99070, SKIN_D: 0x96664e, BEARD: 0x2a2420, LEATH: 0x5a3a26, BRONZE: 0xb08440,
    EDGE: 0xe2e8ee, STEEL: 0x7c8492, IRON: 0x4a4e58 };
  const A = biped(v, { skin: C.SKIN, legs: C.TROU, boots: C.BOOT, hips: C.CLOTH, torso: C.PLATE, chest: C.PLATE, belt: null, sleeve: C.CLOTH, fore_: C.LEATH, hands: C.SKIN, head: C.SKIN, ...BODY });
  const H0 = A.headY0, T0 = A.torsoY0, T1 = A.torsoY1, S = A.shoulderY;
  // lamellar: three bands of plates, a lacing row between bands, the top band lighter (catches the light), a leather belt with a bronze buckle
  const lam = (c: { y: number }) => (c.y === T0 ? C.LEATH : c.y === T0 + 2 || c.y === T0 + 5 ? C.LACE : c.y >= T1 - 1 ? C.PLATE_L : null);
  v.paint(lam, 'spine'); v.paint(lam, 'chest');
  v.part('spine').box(-1, T0, 3, 0, T0, 3, C.BRONZE);
  // shoulder guards (披膊): two rows of plates over each upper arm, a dark lower edge
  v.part('shL').box(5, S - 2, -2, 8, S, 2, C.PLATE).box(5, S - 2, -2, 8, S - 2, 2, C.PLATE_D).box(5, S - 1, -2, 8, S - 1, 2, C.LACE);
  v.part('shR').box(-9, S - 2, -2, -6, S, 2, C.PLATE).box(-9, S - 2, -2, -6, S - 2, 2, C.PLATE_D).box(-9, S - 1, -2, -6, S - 1, 2, C.LACE);
  // the armoured skirt on the thighs, the oxblood robe hem under it
  v.part('legL').box(0, 6, -2, 4, 9, 2, C.PLATE).box(0, 7, -2, 4, 7, 2, C.LACE).box(0, 6, -2, 4, 6, 2, C.PLATE_D).box(0, 5, -2, 4, 5, 2, C.CLOTH);
  v.part('legR').box(-5, 6, -2, -1, 9, 2, C.PLATE).box(-5, 7, -2, -1, 7, 2, C.LACE).box(-5, 6, -2, -1, 6, 2, C.PLATE_D).box(-5, 5, -2, -1, 5, 2, C.CLOTH);
  for (const s of ['shinL', 'shinR']) v.paint(c => (c.y >= 3 ? C.LEATH : null), s);
  // the war cape from the shoulders to the knees, torn hem in big steps, bronze clasps at the shoulders
  v.part('cape').box(-5, 6, -4, 4, T1, -4, C.CLOTH).box(-5, T1 - 1, -4, 4, T1, -4, C.CLOTH_D);
  const torn = [0, 0, 2, 2, 1, 1, 3, 3, 0, 0];
  for (let i = 0; i < 10; i++) for (let y = 6; y < 6 + torn[i]; y++) v.set(-5 + i, y, -4, null);
  v.part('chest').box(-4, T1, -4, -4, T1, -4, C.BRONZE).box(3, T1, -4, 3, T1, -4, C.BRONZE);
  // head: a dark headwrap (幘) with a raised back, a short beard and moustache, the bandage over the eyes
  v.paint(c => (c.y >= H0 + 5 || (c.z <= -3 && c.y >= H0 + 2) ? C.WRAP : (c.y <= H0 && c.z >= 1) || (c.y <= H0 + 2 && (c.x <= -4 || c.x >= 3) && c.z >= 1) ? C.BEARD : null), 'head');
  v.part('hat'); rbox(v, -5, H0 + 5, -5, 4, H0 + 7, 4, C.WRAP, 1, true); v.box(-3, H0 + 8, -5, 2, H0 + 8, -2, C.WRAP_L);
  face(v, A, C.SKIN, C.SKIN_D);
  v.part('head').box(-2, H0, A.faceZ + 1, 1, H0, A.faceZ + 1, C.BEARD).box(-1, H0 - 2, A.faceZ, 0, H0 - 1, A.faceZ + 1, C.BEARD);
  blindfold(v, A, C.BAND, C.BAND_D, { a: [4, 4], b: [4, 3] });
  ringSword(v, A, { len: 14, wide: true, edge: C.EDGE, spine: C.STEEL, grip: C.LEATH, ring: C.IRON, guard: C.IRON, glove: C.SKIN, knuckle: C.SKIN_D });
  leftHand(v, A, C.SKIN, C.SKIN_D);
  return v;
}

// ------------------------------------------------------------------ 蓑衣
function buildStraw(): V {
  const v = newChar();
  const C = { STRAW: 0x857a54, STRAW_D: 0x5e563c, STRAW_L: 0xa09466, ROBE: 0x3b4454, ROBE_D: 0x283040, TROU: 0x2f3440, LINEN: 0x9a9284, LINEN_D: 0x6c665c,
    BAND: 0xa2a4ae, BAND_D: 0x70727c, SKIN: 0xcf9c78, SKIN_D: 0x9a6c52, HAIR: 0x1e1c22, BEARD: 0x2a2622, CORD: 0xb0342a, EDGE: 0xe6ecf2, STEEL: 0x8e96a4, IRON: 0x4c505a };
  const A = biped(v, { skin: C.SKIN, legs: C.TROU, boots: C.STRAW_D, hips: C.ROBE, torso: C.ROBE, chest: C.ROBE, belt: null, sleeve: C.ROBE, fore_: C.LINEN, hands: C.SKIN, head: C.SKIN, ...BODY });
  const H0 = A.headY0, T1 = A.torsoY1;
  collar(v, A, C.LINEN, C.ROBE_D); sash(v, A, C.LINEN_D);
  skirt(v, 5, C.ROBE, C.ROBE_D);
  for (const s of ['shinL', 'shinR']) v.paint(c => (c.y === 4 ? C.LINEN_D : C.LINEN), s);
  // the straw cape: a shoulder tier over the back and the chest sides (front open at the collar), straw caps over the shoulders
  // (top, outside, front and back of the upper arm, on the shoulder joints so the arms swing out beneath), then a long back panel
  // on the cape joint; each tier light on top, dark at the hem
  const S = A.shoulderY;
  v.part('chest').box(-5, T1 - 3, -5, 4, T1, -4, C.STRAW).box(-5, T1 + 1, -5, 4, T1 + 1, -5, C.STRAW_L).box(-5, T1 - 3, -5, 4, T1 - 3, -4, C.STRAW_D)
    .box(-5, T1 - 3, 3, -3, T1, 3, C.STRAW).box(2, T1 - 3, 3, 4, T1, 3, C.STRAW).box(-5, T1, 3, -3, T1, 3, C.STRAW_L).box(2, T1, 3, 4, T1, 3, C.STRAW_L);
  for (const [sh, x0, x1, xo] of [['shL', 5, 8, 8], ['shR', -9, -6, -9]] as Array<[string, number, number, number]>) {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    v.part(sh).box(xa, S, -3, xb, S, 3, C.STRAW_L).box(xo, S - 3, -3, xo, S - 1, 3, C.STRAW).box(xa, S - 3, 2, xb, S - 1, 2, C.STRAW).box(xa, S - 3, -2, xb, S - 1, -2, C.STRAW)
      .box(xa, S - 3, -3, xb, S - 3, 3, C.STRAW_D);
  }
  v.part('cape').box(-6, 7, -6, 5, T1 - 4, -5, C.STRAW).box(-6, T1 - 4, -6, 5, T1 - 4, -5, C.STRAW_L).box(-6, 7, -6, 5, 7, -5, C.STRAW_D)
    .box(-6, 11, -6, 5, 11, -6, C.STRAW_D);
  // head: topknot with a red cord, hair round the back, a full short beard, the grey blindfold
  v.paint(c => (c.y >= H0 + 5 || (c.z <= -3 && c.y >= H0 + 2) || ((c.x === -4 || c.x === 3) && c.y >= H0 + 3) ? C.HAIR : (c.y <= H0 && c.z >= 0) || (c.y <= H0 + 2 && (c.x <= -4 || c.x >= 3) && c.z >= 0) ? C.BEARD : null), 'head');
  v.part('hat').box(-1, H0 + 8, -2, 0, H0 + 10, -1, C.HAIR).box(-1, H0 + 8, 0, 0, H0 + 8, 0, C.CORD);
  face(v, A, C.SKIN, C.SKIN_D);
  v.part('head').box(-2, H0, A.faceZ + 1, 1, H0, A.faceZ + 1, C.BEARD).box(-2, H0 - 3, A.faceZ - 1, 1, H0 - 1, A.faceZ + 1, C.BEARD);
  blindfold(v, A, C.BAND, C.BAND_D, { a: [5, 4], b: [4, 4] });
  // the cloth-wrapped scabbard standing up the back, over the straw cape (red ties)
  v.part('chest').box(-4, 6, -8, -3, H0 + 3, -7, C.LINEN_D).box(-4, 10, -8, -3, 10, -7, C.CORD).box(-4, H0 - 1, -8, -3, H0 - 1, -7, C.CORD).box(-4, H0 + 3, -8, -3, H0 + 3, -7, C.IRON);
  ringSword(v, A, { len: 17, edge: C.EDGE, spine: C.STEEL, grip: C.LINEN, ring: C.IRON, guard: C.IRON, glove: C.SKIN, knuckle: C.SKIN_D });
  leftHand(v, A, C.SKIN, C.SKIN_D);
  return v;
}

const def = (id: string, name: string, build: () => V, tip: number): ModelDef => ({ id, name, group: '职业', role: '蒙眼刀客', line: '', kind: 'biped', attack: 'dual', tip, build });
export const BLIND: ModelDef[] = [
  def('blind_hat', '旧斗笠', buildHat, 17),
  def('blind_hair', '披发', buildHair, 19),
  def('blind_armour', '残甲', buildArmour, 17),
  def('blind_straw', '蓑衣', buildStraw, 20),
];
for (const d of BLIND) if (!ROSTER.some(r => r.id === d.id)) ROSTER.push(d);
