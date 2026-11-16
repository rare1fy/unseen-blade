// 浪人篇 models (docs/ronin/DESIGN.md §6.4, §7), on the shared 7 cm block (a man ≈ 28 blocks). Big axis-aligned masses, few tiers,
// no speckle (CLAUDE.md 美术铁律). Registered into the bestiary ROSTER, so BattleActor('ronin_sutemi') etc. just work.
//   浪人: one body, three weapon setups. Each poses as the class rig whose mechanics the stance runs (ModelDef.as), so every battle move
//         of that class (hew / stab / chant …) plays: 捨身 → the warrior's two-hand cuts, 二刀 → the rogue's twin blades, 居合 → the
//         mage's charge-and-release (its own sheathed stance comes later).
//   山贼 (two looks by seed), 山贼头目, 山犬.
import { newChar, biped, rbox, eyes, mouth, axe, P, type V, type Anchors } from '../bestiary/kit';
import { heroGrip, ROSTER, type ModelDef } from '../bestiary/models';

// ------------------------------------------------------------------ 浪人
export const RN = {
  TEAL: 0x2c4446, TEAL_D: 0x1e3032, TEAL_L: 0x3c5658, GREY: 0x6a6c6c, SASH: 0x5a3a22, HAKAMA: 0x4a4c50, HAKAMA_D: 0x36383c,
  SKIN: 0xdca880, SKIN_D: 0xae7c5a, HAIR: 0x1c181a, HAIR_G: 0x8a8886, BROW: 0x161214, STUBBLE: 0x5a4436, SCAR: 0x5e3028, WHITE: 0xf0ece0, PUPIL: 0x1a120c,
  HEMP: 0xc8b890, HEMP_D: 0xa89a74, BLOOD: 0x7a2a22, STRAW: 0xc4a466, STRAW_D: 0xa0844e, STRAW_L: 0xd6b878, WRAP: 0x3a302a, SANDAL: 0x8a7048, TAG: 0x2a2018,
  TSUKA: 0x24222a, TSUBA: 0x2e2c30, BLADE: 0xeef2f8, STEEL: 0x98a2b4, SAYA: 0x1c1a20, BRASS: 0xb08a40, BRASS_L: 0xd8b060, CORD: 0xc23a2a,
};
type Stance = 'sutemi' | 'nito' | 'iai';

/** the katana in the right fist: a long two-hand grip back toward the body, a dark square guard, a 15-cell blade (edge row under a
 *  steel spine row, the spine one step short of the tip — one clean step, no staircase) */
function katana(v: V, at: [number, number, number], part: string, blade = 15) {
  const [x, y, z] = at, C = RN;
  v.part(part).box(x, y, z - 6, x, y, z + 1, C.TSUKA).set(x, y, z - 7, C.BRASS)
    .box(x - 1, y - 1, z + 2, x + 1, y + 1, z + 2, C.TSUBA).set(x, y, z + 2, C.BRASS);
  // the blade on its own joint (居合 hides it while the sword is in the scabbard: iaiPose.ts)
  v.bone(part === 'weapon' ? 'blade' : 'blade2', part, x + 0.5, y + 0.5, z + 3.5);
  v.part(part === 'weapon' ? 'blade' : 'blade2').box(x, y, z + 3, x, y, z + 2 + blade, C.BLADE).box(x, y + 1, z + 3, x, y + 1, z + 1 + blade, C.STEEL);
}
/** the short blade (脇差) in the left fist */
function wakizashi(v: V, at: [number, number, number]) {
  const [x, y, z] = at, C = RN;
  v.part('offhand').box(x, y, z - 3, x, y, z + 1, C.TSUKA).box(x - 1, y - 1, z + 2, x + 1, y + 1, z + 2, C.TSUBA)
    .box(x, y, z + 3, x, y, z + 11, C.BLADE).box(x, y + 1, z + 3, x, y + 1, z + 10, C.STEEL);
}

/** 久世阵 (STORY.md 三): an iron-grey / dark-teal haori, the left sleeve torn off at the elbow over a bandaged forearm, a burnt-brown
 *  sash, leggings and straw sandals; a gunshot groove from the left cheek to the ear, early grey at the temples, hair tied back; two
 *  brass sword guards on a cord on the chest, half a burnt wooden tag at the waist; a bamboo hat with one corner of the brim cut away */
function ronin(stance: Stance): V {
  const v = newChar(), C = RN;
  const A = biped(v, { skin: C.SKIN, legs: C.HAKAMA, boots: C.SANDAL, hips: C.HAKAMA, torso: C.TEAL, chest: C.TEAL, belt: C.SASH, sleeve: C.TEAL, fore_: C.TEAL, hands: C.WRAP,
    legH: 9, legW: 4, legD: 4, legGap: 1, hipH: 2, torsoH: 8, torsoW: 10, chestW: 10, torsoD: 6, headW: 8, headH: 8, headD: 8, armW: 3, upper: 5, fore: 6, hand: 2 });
  const H0 = A.headY0, H1 = A.headY1, F = A.faceZ, T0 = A.torsoY0, T1 = A.torsoY1, HY = A.hipY, S = A.shoulderY;
  // ---- the haori's skirt over the hakama (open down the front), the sash two rows deep, the burnt tag tucked at the right hip
  v.part('hips').box(-6, HY - 4, -4, 5, HY + 1, 3, C.TEAL).box(-1, HY - 4, 3, 0, HY + 1, 3, C.HAKAMA).box(-6, HY - 4, -4, 5, HY - 4, 3, C.TEAL_D)
    .box(-5, HY + 1, -3, 4, HY + 2, 2, C.SASH).box(-5, HY - 2, 3, -5, HY + 1, 3, C.TAG);
  for (const s2 of ['shinL', 'shinR']) v.part(s2).box(s2 === 'shinL' ? 1 : -5, 2, -2, s2 === 'shinL' ? 4 : -2, 4, 1, C.WRAP);
  // ---- the chest: the grey under-kimono as two straight collar strips, the haori's dark lapels beside them
  v.part('chest').box(-2, T1 - 3, 2, -2, T1, 2, C.GREY).box(1, T1 - 3, 2, 1, T1, 2, C.GREY).box(-3, T1 - 3, 2, -3, T1, 2, C.TEAL_D).box(2, T1 - 3, 2, 2, T1, 2, C.TEAL_D)
    .box(-1, T0 + 1, 2, -1, T1 - 4, 2, C.TEAL_D).box(-3, T1, -3, 2, T1, -3, C.GREY);
  // two brass sword guards on a dark cord (straight runs down from the collar), one cell proud of the chest
  v.part('chest').box(-3, T1 - 5, 3, -3, T1 - 4, 3, C.WRAP).box(2, T1 - 6, 3, 2, T1 - 4, 3, C.WRAP)
    .box(-4, T1 - 7, 3, -3, T1 - 6, 3, C.BRASS).box(1, T1 - 8, 3, 2, T1 - 7, 3, C.BRASS).set(-4, T1 - 6, 3, C.BRASS_L).set(1, T1 - 7, 3, C.BRASS_L);
  // ---- arms: the right sleeve whole (its cuff one step out below the elbow); the LEFT sleeve torn off at the elbow — bare forearm
  //      wrapped in hemp with one dark blood band
  v.part('foreR').box(-9, S - 8, -2, -6, S - 6, 1, C.TEAL).box(-9, S - 8, -2, -6, S - 8, 1, C.TEAL_D);
  for (const [k, cell] of v.cells) if (cell.part === 'foreL') v.cells.delete(k);
  v.part('foreL').box(5, A.handY + 2, -1, 7, S - 6, 1, C.HEMP).box(5, A.handY + 4, -1, 7, A.handY + 4, 1, C.BLOOD).box(5, S - 6, -1, 7, S - 6, 1, C.HEMP_D);
  v.part('armL').box(5, S - 5, -1, 7, S - 5, 1, C.TEAL_D);
  // ---- face: dark eyes under heavy brows, a nose shade, stubble in whole rows, the mouth a dark line; the gunshot groove runs from
  //      the left cheek straight back to the ear (one row, then along the side)
  eyes(v, A, { y: 3, w: 1, h: 1, gap: 2, style: 'white', white: C.WHITE, pupil: C.PUPIL });
  v.part('head').symBox(1, H0 + 4, F, 3, H0 + 4, F, C.BROW).box(-1, H0 + 2, F + 1, 0, H0 + 3, F + 1, C.SKIN_D)
    .box(-3, H0, F, 2, H0, F, C.STUBBLE).box(-3, H0 + 1, F, -3, H0 + 1, F, C.STUBBLE)
    .set(3, H0 + 2, F, C.SCAR).box(3, H0 + 2, F - 3, 3, H0 + 2, F - 1, C.SCAR);
  mouth(v, A, 1, 2, C.STUBBLE);
  // ---- hair: dark over the back and sides, early grey at both temples, tied back with hemp into a short tail
  v.part('head').box(-4, H0 + 3, -4, 3, H1, -3, C.HAIR).box(-4, H0 + 4, -2, -4, H1, 0, C.HAIR).box(3, H0 + 4, -2, 3, H1, 0, C.HAIR).box(-4, H1, -4, 3, H1, 2, C.HAIR)
    .box(-4, H0 + 4, 0, -4, H0 + 5, 1, C.HAIR_G).box(3, H0 + 4, 0, 3, H0 + 5, 1, C.HAIR_G)
    .box(-1, H1 - 2, -5, 0, H1 - 2, -5, C.HEMP).box(-1, H1 - 4, -6, 0, H1 - 1, -6, C.HAIR);
  // ---- the bamboo hat: three flat tiers (brim 12 wide, a band 8, a crown 4) above the brow; one corner of the brim cut away
  v.part('hat').box(-6, H1 + 1, -6, 5, H1 + 1, 5, C.STRAW).box(-6, H1 + 1, 5, 5, H1 + 1, 5, C.STRAW_D).box(-4, H1 + 2, -4, 3, H1 + 2, 3, C.STRAW_L)
    .box(-4, H1 + 2, 3, 3, H1 + 2, 3, C.STRAW_D).box(-2, H1 + 3, -2, 1, H1 + 3, 1, C.STRAW);
  for (let x = 3; x <= 5; x++) for (let z = 3; z <= 5; z++) if (x + z >= 7) v.set(x, H1 + 1, z, null);
  // ---- swords
  heroGrip(v, A.wR, 'R', C.WRAP, C.SKIN_D);
  heroGrip(v, A.wL, 'L', C.HEMP, C.HEMP_D);
  katana(v, A.wR, 'weapon', stance === 'nito' ? 13 : 15);
  if (stance === 'nito') wakizashi(v, A.wL);
  // the scabbard at the left hip on its own joint (pivot = the mouth): black, the red cord; 居合: a bright brass mouth (鲤口)
  v.bone('saya', 'hips', 8, HY + 1, 4);
  v.part('saya').box(7, HY, -12, 8, HY + 1, 3, C.SAYA).box(7, HY, 3, 8, HY + 1, 3, stance === 'iai' ? C.BRASS_L : C.BRASS).box(7, HY - 1, 1, 8, HY - 1, 1, C.CORD).box(8, HY - 3, 1, 8, HY - 2, 1, C.CORD);
  if (stance === 'nito') v.part('saya').box(6, HY - 1, -7, 6, HY, 2, C.SAYA);
  return v;
}

// ------------------------------------------------------------------ 山贼
/** a mountain bandit: ragged work clothes, a cloth tied over the head, bare forearms, a 鉈 (a heavy square-ended chopper) */
function bandit(look: 0 | 1, bow = false): V {
  const v = newChar(), SK = 0xc89470, SKD = 0x9a6c4e, TOP = look ? 0x5a5a3a : 0x6a4a32, TOP_D = look ? 0x40402a : 0x4a3222, PANTS = look ? 0x4a3a2c : 0x3e4234,
    CLOTH = look ? 0x8a3a2a : 0x6a7a8a, ROPE = 0xb09868, WRAP = 0x3a302a;
  const A = biped(v, { skin: SK, legs: PANTS, boots: 0x7a6040, hips: PANTS, torso: TOP, chest: TOP, belt: ROPE, sleeve: TOP, fore_: SK, hands: SKD,
    legH: 8, legW: 4, legD: 4, legGap: 1, hipH: 2, torsoH: 8, torsoW: 10, chestW: 11, torsoD: 6, headW: 8, headH: 8, headD: 8, armW: 3, upper: 4, fore: 5, hand: 2 });
  const H0 = A.headY0, H1 = A.headY1, F = A.faceZ, T1 = A.torsoY1;
  // a torn hem (two whole-cell notches) and an open front showing the chest
  v.part('spine').box(-5, A.torsoY0, 3, -4, A.torsoY0, 3, TOP_D).box(2, A.torsoY0, 3, 3, A.torsoY0, 3, TOP_D);
  v.part('chest').box(-1, T1 - 3, 3, 0, T1, 3, SK);
  for (const s of ['shinL', 'shinR']) v.part(s).box(s === 'shinL' ? 1 : -5, 2, -2, s === 'shinL' ? 4 : -2, 3, 1, WRAP);
  // face: a hard squint, a broad nose, a beard shadow
  eyes(v, A, { y: 3, w: 1, h: 1, gap: 2, style: 'dot', pupil: 0x1a120c, brow: 0x2a1c14, angry: true });
  v.part('head').box(-1, H0 + 2, F + 1, 0, H0 + 3, F + 1, SKD).box(-3, H0, F, 2, H0, F, 0x4a3426);
  mouth(v, A, 1, 2, 0x2a1810);
  // 頬被り: a cloth over the crown and down the sides, knotted under the chin; or a plain headband with wild hair (look 1)
  if (look === 0) v.part('hat').box(-5, H1 - 2, -5, 4, H1 + 1, 4, CLOTH).box(-5, H0, -2, -5, H1, 2, CLOTH).box(4, H0, -2, 4, H1, 2, CLOTH).box(-1, H0 - 1, F, 0, H0 - 1, F + 1, CLOTH);
  else v.part('hat').box(-5, H1 - 1, -5, 4, H1 + 1, 4, 0x2a2018).box(-5, H1 - 2, -5, 4, H1 - 2, 4, CLOTH).box(-1, H1 + 2, -2, 0, H1 + 2, 1, 0x2a2018);
  // the 鉈: a short wrapped grip, a wide flat blade with a square end
  const [x, y, z] = A.wR;
  if (bow) {
    // the archer: a longbow in the left fist (limbs in three straight runs, the string on the archer's side), a quiver on the back
    heroGrip(v, A.wL, 'L', SKD, SKD);
    const [bx, by] = A.wL, WD = 0x6a4a2a;
    v.part('offhand').box(bx, by, -2, bx, by, 2, 0x3a2a1a).box(bx, by - 1, -7, bx, by - 1, -3, WD).box(bx, by - 1, 3, bx, by - 1, 7, WD).box(bx, by, -11, bx, by, -8, WD).box(bx, by, 8, bx, by, 11, WD)
      .box(bx, by + 1, -10, bx, by + 1, 10, 0xd8d0b8);
    v.part('spine').box(1, A.torsoY0, -5, 3, A.torsoY1 + 2, -4, 0x5a3a24).box(1, A.torsoY1 + 3, -5, 3, A.torsoY1 + 4, -5, 0xe0d8c8);
    return v;
  }
  heroGrip(v, A.wR, 'R', SKD, SKD);
  v.part('weapon').box(x, y, z - 3, x, y, z + 2, 0x5a4030).box(x, y - 2, z + 3, x, y + 1, z + 10, P.IRON_D).box(x, y - 2, z + 10, x, y + 1, z + 10, P.EDGE).box(x, y - 2, z + 3, x, y - 2, z + 10, P.EDGE);
  return v;
}

/** the bandit chief: a big man in a bear-fur vest, shaven head with a topknot, a full beard, a long-hafted 鉞 */
function chief(): V {
  const v = newChar(), SK = 0xbc8660, SKD = 0x8e5e42, FUR = 0x4a3426, FUR_L = 0x6a4c36, PANTS = 0x2e2c2a, BEARD = 0x2a1e18, CLOTH = 0x7a2a22;
  const A = biped(v, { skin: SK, legs: PANTS, boots: 0x6a5038, hips: PANTS, torso: SK, chest: SK, belt: CLOTH, sleeve: SK, fore_: SK, hands: SKD,
    legH: 9, legW: 5, legD: 5, legGap: 1, hipH: 2, torsoH: 9, torsoW: 12, chestW: 14, torsoD: 8, headW: 9, headH: 8, headD: 8, armW: 4, upper: 5, fore: 5, hand: 3 });
  const H0 = A.headY0, H1 = A.headY1, F = A.faceZ, T0 = A.torsoY0, T1 = A.torsoY1;
  // the fur vest: open in front over a bare chest, a darker collar band
  v.part('chest').box(-7, T0 + 4, -4, -3, T1, 3, FUR).box(2, T0 + 4, -4, 6, T1, 3, FUR).box(-7, T1, -4, 6, T1, -1, FUR_L).box(-7, T0 + 4, -4, 6, T1, -4, FUR);
  v.part('spine').box(-6, T0, -4, -3, T0 + 3, 3, FUR).box(2, T0, -4, 5, T0 + 3, 3, FUR).box(-6, T0, -4, 5, T0 + 3, -4, FUR);
  for (const s of ['shL', 'shR']) v.part(s).box(s === 'shL' ? 7 : -11, A.shoulderY - 1, -2, s === 'shL' ? 10 : -8, A.shoulderY + 1, 2, FUR_L);
  eyes(v, A, { y: 3, w: 2, h: 1, gap: 2, style: 'dot', pupil: 0x1a100a, brow: BEARD, angry: true });
  v.part('head').box(-1, H0 + 2, F + 1, 0, H0 + 3, F + 1, SKD);
  v.part('jaw').box(-4, H0 - 3, F, 3, H0 + 1, F + 1, BEARD).box(-3, H0 - 5, F, 2, H0 - 4, F + 1, BEARD).box(-2, H0, F + 1, 1, H0, F + 1, 0x5a2a20);
  // shaven pate, a topknot (two tiers), a red cloth band
  v.part('hat').box(-5, H1 - 1, -5, 4, H1 - 1, 4, CLOTH).box(-1, H1 + 1, -3, 0, H1 + 2, 0, BEARD).box(-2, H1 + 3, -2, 1, H1 + 3, -1, BEARD);
  heroGrip(v, A.wR, 'R', SKD, SKD);
  axe(v, A, { len: 22, blade: 8, haft: 0x5a3a24, metal: P.IRON_D, edge: P.EDGE });
  return v;
}

/** 山犬: a lean mountain dog, tan with a pale chest and muzzle, ears up, tail curled over the back (two straight segments) */
function dog(): V {
  const v = newChar(), F = 0x5e4430, FL = 0x9a8466, FD = 0x2e2018;
  v.bone('hips', 'root', 0, 8, -5).bone('chest', 'hips', 0, 8, 2).bone('neck', 'chest', 0, 11, 6).bone('head', 'neck', 0, 12, 8).bone('jaw', 'head', 0, 11, 12)
    .bone('legFL', 'chest', 3, 7, 4).bone('legFR', 'chest', -3, 7, 4).bone('legBL', 'hips', 3, 7, -7).bone('legBR', 'hips', -3, 7, -7).bone('tail', 'hips', 0, 10, -11).bone('tail2', 'tail', 0, 13, -12);
  v.part('hips'); rbox(v, -3, 6, -11, 2, 11, -2, F, 1);
  v.part('chest'); rbox(v, -4, 6, -2, 3, 12, 6, F, 1); v.box(-2, 6, 3, 1, 9, 6, FL);
  v.part('neck'); rbox(v, -2, 10, 5, 1, 14, 8, F, 1); v.box(-2, 10, 8, 1, 12, 8, FL);
  v.part('head'); rbox(v, -3, 11, 7, 2, 16, 12, F, 1);
  v.box(-2, 11, 13, 1, 13, 15, FL).box(-1, 13, 15, 0, 13, 15, P.DARK).symBox(1, 17, 8, 2, 18, 9, F).sym(1, 17, 9, FD)
    .sym(1, 14, 12, 0xd8a040).sym(2, 15, 12, FD).box(-2, 12, 15, 1, 12, 15, 0xe8e0d0);
  v.part('jaw').box(-2, 10, 12, 1, 10, 15, FL);
  for (const [n, x, z] of [['legFL', 1, 3], ['legFR', -3, 3], ['legBL', 1, -8], ['legBR', -3, -8]] as Array<[string, number, number]>) v.part(n).box(x, 1, z - 1, x + 1, 7, z + 1, F).box(x, 0, z - 1, x + 1, 0, z + 2, FD);
  v.part('tail').box(-1, 10, -13, 0, 13, -11, F);
  v.part('tail2').box(-1, 14, -12, 0, 15, -8, FL);
  return v;
}

/** 阿梶 (STORY.md): a bone-gatherer — a faded brown work kimono tucked up over leggings, a white cloth over the hair, a tall bamboo basket
 *  on her back (woven bands as whole rows), wooden name tags hanging from its rim */
function kaji(): V {
  const v = newChar(), SK = 0xd8a682, SKD = 0xa87a5a, KIMO = 0x6a4e38, KIMO_D = 0x4a3626, OBI = 0x3a3a46, CLOTH = 0xbab2a2, HAIR = 0x221a18,
    BAM = 0xb89a5a, BAM_D = 0x8a7040, TAG = 0xd8c8a0;
  const A = biped(v, { skin: SK, legs: 0x3e3a36, boots: 0x8a7048, hips: KIMO, torso: KIMO, chest: KIMO, belt: OBI, sleeve: KIMO, fore_: KIMO_D, hands: SK,
    legH: 9, legW: 3, legD: 3, legGap: 1, hipH: 2, torsoH: 7, torsoW: 8, chestW: 8, torsoD: 6, headW: 7, headH: 7, headD: 7, armW: 2, upper: 4, fore: 5, hand: 2 });
  const H0 = A.headY0, H1 = A.headY1, F = A.faceZ, T0 = A.torsoY0, T1 = A.torsoY1, HY = A.hipY;
  v.part('hips').box(-5, HY - 3, -3, 4, HY + 1, 2, KIMO).box(-5, HY - 3, -3, 4, HY - 3, 2, KIMO_D);
  v.part('chest').box(-1, T1 - 2, 3, 0, T1, 3, CLOTH);
  eyes(v, A, { y: 3, w: 1, h: 1, gap: 2, style: 'dot', pupil: 0x1a120c, brow: HAIR });
  v.part('head').box(-1, H0 + 2, F + 1, -1, H0 + 2, F + 1, SKD);
  mouth(v, A, 1, 2, 0x6a3a30);
  // the white cloth over the hair, tied at the back; dark hair showing at the temples
  v.part('hat').box(-4, H1 - 2, -4, 3, H1 + 1, 3, CLOTH).box(-4, H0 + 3, -4, 3, H1 - 3, -3, CLOTH).box(-1, H0 + 1, -5, 0, H0 + 3, -5, CLOTH);
  v.part('head').box(-4, H0 + 3, 0, -4, H0 + 4, 2, HAIR).box(3, H0 + 3, 0, 3, H0 + 4, 2, HAIR);
  // the basket: a tall box on the back in two woven tones, a rim, two tags on cords
  v.part('spine').box(-4, T0 - 2, -9, 3, T1 + 3, -4, BAM);
  for (let y = T0 - 1; y <= T1 + 2; y += 3) v.box(-4, y, -9, 3, y, -4, BAM_D);
  v.box(-5, T1 + 3, -10, 4, T1 + 3, -3, BAM_D).box(-3, T1 + 4, -8, 2, T1 + 5, -5, TAG).box(2, T1 - 1, -3, 2, T1 + 2, -3, 0x5a4a3a).box(2, T1 - 3, -3, 3, T1 - 2, -3, TAG);
  return v;
}

const def = (d: ModelDef) => { if (!ROSTER.some(x => x.id === d.id)) ROSTER.push(d); return d; };
export const RONIN_DEFS: Record<Stance, ModelDef> = {
  sutemi: def({ id: 'ronin_sutemi', as: 'warrior', name: '浪人 · 捨身', group: '职业', role: '浪人', line: '拿血换出手。', kind: 'biped', attack: 'swing', tip: 17, build: () => ronin('sutemi') }),
  nito: def({ id: 'ronin_nito', as: 'rogue', name: '浪人 · 二刀', group: '职业', role: '浪人', line: '一长一短。', kind: 'biped', attack: 'dual', tip: 15, build: () => ronin('nito') }),
  iai: def({ id: 'ronin_iai', as: 'mage', name: '浪人 · 居合', group: '职业', role: '浪人', line: '一刀定胜负。', kind: 'biped', attack: 'cast', tip: 17, build: () => ronin('iai') }),
};
export const JP_DEFS = {
  bandit: def({ id: 'jp_bandit', name: '山贼', group: '普通', role: '打手', line: '', kind: 'biped', attack: 'swing', tip: 10, build: () => bandit(0) }),
  archer: def({ id: 'jp_archer', name: '弓手', group: '普通', role: '弓手', line: '', kind: 'biped', attack: 'shoot', bowL: true, build: () => bandit(0, true) }),
  bandit2: def({ id: 'jp_bandit_b', name: '山贼', group: '普通', role: '打手', line: '', kind: 'biped', attack: 'swing', tip: 10, build: () => bandit(1) }),
  chief: def({ id: 'jp_bandit_chief', name: '山贼头目', group: '精英', role: '头目', line: '', kind: 'biped', attack: 'swing', tip: 22, build: chief }),
  kaji: def({ id: 'npc_kaji', name: '阿梶', group: '普通', role: '寻骨人', line: '', kind: 'biped', attack: 'cast', build: kaji }),
  dog: def({ id: 'jp_dog', name: '山犬', group: '普通', role: '野兽', line: '', kind: 'quad', attack: 'bite', build: dog }),
};
void (null as unknown as Anchors);
