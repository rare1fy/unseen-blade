// 忍者「影忍」— 原创体素忍者（agent "ninja"）。人类，藏青紧身忍装、覆面头巾只露一条眼缝、额前钢护额，脖子上一圈朱红围巾，
// 两条长长的围巾尾在身后飘（各自一串关节，见 ninja_pose.ts）；右手直刃忍刀（方镡），左手反握苦无（环首），背后右肩露出黑鞘。
// 和「影锋刺客」（紫皮、尖耳、银发马尾、绿腰带、双匕首正握）一眼分开：人类肤色只露眼、没有耳朵和头发、朱红是唯一的强调色、
// 一长一短两件兵器、背鞘。比例：28 格高（约 2 米），和 rogueM 同一档。
import { newChar, biped, rbox, type V } from '../bestiary/kit';
import { heroGrip } from '../bestiary/models';
import type { KyotoHero } from './types';
import { ninjaStrike, ninjaSkill } from './ninja_fx';
import './ninja_pose';

/** palette: 藏青 (indigo navy) cloth in three values, grey-blue wraps, steel, one vermilion accent */
export const NJ = {
  GI: 0x2b3147, GI_D: 0x1e2232, GI_L: 0x3e4664, HOOD: 0x252a3c, BAND: 0x15161c, MASK: 0x353c56,
  SCARF: 0xe0432b, SCARF_D: 0xa22c1e,
  WRAP: 0x707890, WRAP_D: 0x454b60, STEEL: 0xaab2c4, STEEL_D: 0x5c6276, BLADE: 0xeef4fa,
  SKIN: 0xe0b08a, SKIN_D: 0xa87a5c, WHITE: 0xf4f0e8, PUPIL: 0x18120e, BLACK: 0x17181f, TSUKA: 0x22232c, BRASS: 0xc89a3a,
};

function build(): V {
  const v = newChar(), C = NJ;
  const A = biped(v, { skin: C.SKIN, legs: C.GI, boots: C.BLACK, hips: C.GI, torso: C.GI, chest: C.GI, belt: null, sleeve: C.GI, fore_: C.WRAP, hands: C.BLACK, head: C.HOOD,
    legH: 10, legW: 3, legD: 3, legGap: 1, hipH: 2, torsoH: 7, torsoW: 8, chestW: 10, torsoD: 6, headW: 8, headH: 8, headD: 8, armW: 3, upper: 4, fore: 4, hand: 2 });
  const H0 = A.headY0, F = A.faceZ, T0 = A.torsoY0, T1 = A.torsoY1, S = A.shoulderY;   // 19, 3, 12, 18, 19

  // ---- legs: baggy trousers over the thighs (one cell wider outside, front and back), grey-blue shin wraps under a dark knee tie, tabi
  v.part('legL').box(1, 6, -2, 4, 9, 2, C.GI).box(1, 5, -1, 3, 5, 1, C.WRAP_D);
  v.part('legR').box(-5, 6, -2, -2, 9, 2, C.GI).box(-4, 5, -1, -2, 5, 1, C.WRAP_D);
  v.part('shinL').box(1, 2, -1, 3, 4, 1, C.WRAP); v.part('shinR').box(-4, 2, -1, -2, 4, 1, C.WRAP);
  // ---- hips and obi: the trouser top as wide as the thighs, a black obi, a vermilion knot left of centre with two short ends
  v.part('hips').box(-5, A.hipY, -3, 4, A.hipY + 1, 2, C.GI);
  v.paint(c => (c.y <= T0 + 1 ? C.BAND : null), 'spine');
  v.part('spine').box(1, T0, 3, 2, T0 + 1, 3, C.SCARF);
  v.part('hips').box(1, A.hipY - 1, 3, 1, A.hipY + 1, 3, C.SCARF).box(2, A.hipY, 3, 2, A.hipY + 1, 3, C.SCARF_D);
  // a pouch on the back of the right hip
  v.part('hips').box(-4, A.hipY, -4, -3, A.hipY + 1, -4, C.WRAP_D);
  // ---- chest: the gi's overlap edge, then the scarf: a thick vermilion collar round the neck (dark lower row), up over the chin
  v.part('spine').set(1, T0 + 2, 2, C.GI_L); v.part('chest').box(1, T0 + 3, 2, 1, T1 - 2, 2, C.GI_L);
  // a leather strap straight down the right of the chest (obi to collar) carrying a shuriken; a single lacquered plate on the left shoulder
  v.part('spine').box(-4, T0 + 2, 3, -3, T0 + 2, 3, C.WRAP_D); v.part('chest').box(-4, T0 + 3, 3, -3, T1 - 2, 3, C.WRAP_D);
  v.part('chest').box(-5, T0 + 4, 4, -2, T0 + 4, 4, C.STEEL).box(-4, T0 + 3, 4, -3, T0 + 5, 4, C.STEEL).box(-4, T0 + 4, 4, -3, T0 + 4, 4, C.STEEL_D);
  v.part('shL').box(4, S, -2, 8, S, 2, C.GI_L).box(8, S - 3, -2, 8, S - 1, 2, C.GI_L).box(8, S - 3, -2, 8, S - 3, 2, C.STEEL).box(5, S + 1, -1, 7, S + 1, 1, C.GI_L);
  // the empty scabbard on the back, behind the right shoulder: black lacquer, steel mouth and end cap, a vermilion cord
  v.part('chest').box(-6, T0 - 1, -4, -5, S + 4, -4, C.BLACK).box(-6, S + 4, -4, -5, S + 4, -4, C.STEEL).box(-6, T0 - 1, -4, -5, T0 - 1, -4, C.STEEL_D).box(-6, S + 1, -4, -5, S + 1, -4, C.SCARF);
  v.part('chest'); rbox(v, -5, T1 - 1, -4, 4, T1, 3, C.SCARF, 1, false);
  v.paint(c => (c.y === T1 - 1 && c.c === C.SCARF ? C.SCARF_D : null), 'chest');
  // ---- the two scarf tails: 2 cells wide, hanging from the back of the collar, each a chain of joints (long: 3, short: 2)
  v.part('chest').box(-2, T1 - 2, -5, 1, T1, -5, C.SCARF_D);
  v.bone('scA1', 'chest', 1, T1 - 1, -5.5).bone('scA2', 'scA1', 1, T1 - 7, -5.5).bone('scA3', 'scA2', 1, T1 - 13, -5.5);
  v.part('scA1').box(0, T1 - 7, -6, 2, T1 - 1, -6, C.SCARF);
  v.part('scA2').box(0, T1 - 13, -6, 2, T1 - 8, -6, C.SCARF);
  v.part('scA3').box(0, T1 - 18, -6, 2, T1 - 14, -6, C.SCARF).box(0, T1 - 18, -6, 2, T1 - 18, -6, C.SCARF_D);
  v.bone('scB1', 'chest', -2, T1 - 1, -5.5).bone('scB2', 'scB1', -2, T1 - 7, -5.5);
  v.part('scB1').box(-3, T1 - 7, -6, -2, T1 - 1, -6, C.SCARF);
  v.part('scB2').box(-3, T1 - 12, -6, -2, T1 - 8, -6, C.SCARF).box(-3, T1 - 12, -6, -2, T1 - 12, -6, C.SCARF_D);
  // ---- arms: a dark cuff at the elbow, grey-blue forearm wraps with a steel plate down the outside (tekko); fists get steel knuckles
  const elbow = S - 5;
  for (const [f, x0, out] of [['foreL', 5, 7], ['foreR', -8, -8]] as Array<[string, number, number]>) v.part(f).box(x0, elbow, -1, x0 + 2, elbow, 1, C.GI_D).box(out, elbow - 3, -1, out, elbow - 1, 1, C.STEEL);
  // ---- head: hood; the face front is one cell proud (scarf over the chin, the mask with a nose ridge, the headband with a steel plate),
  // so the two-row eye slit sits recessed in a frame of cloth and reads as a dark slot even from the battle camera
  v.paint(c => (c.y === H0 ? C.SCARF : null), 'head');
  v.part('head').box(-4, H0, F + 1, 3, H0, F + 1, C.SCARF).box(-3, H0 + 1, F + 1, 2, H0 + 3, F + 1, C.MASK).box(-1, H0 + 3, F + 2, 0, H0 + 3, F + 2, C.MASK)
    .box(-4, H0 + 1, F + 1, -4, H0 + 7, F + 1, C.HOOD).box(3, H0 + 1, F + 1, 3, H0 + 7, F + 1, C.HOOD).box(-3, H0 + 7, F + 1, 2, H0 + 7, F + 1, C.HOOD)
    .box(-3, H0 + 4, F, 2, H0 + 5, F, C.SKIN)
    .box(1, H0 + 4, F, 1, H0 + 4, F, C.PUPIL).box(2, H0 + 4, F, 2, H0 + 4, F, C.WHITE).box(-2, H0 + 4, F, -2, H0 + 4, F, C.PUPIL).box(-3, H0 + 4, F, -3, H0 + 4, F, C.WHITE)
    .symBox(1, H0 + 5, F, 2, H0 + 5, F, C.SKIN_D);
  v.paint(c => (c.y === H0 + 6 ? C.BAND : null), 'head');
  v.part('head').box(-2, H0 + 6, F + 2, 1, H0 + 7, F + 2, C.STEEL).box(-1, H0 + 6, F + 2, 0, H0 + 6, F + 2, C.STEEL_D)
    .box(-1, H0 + 5, -5, 0, H0 + 6, -5, C.BAND);
  // ---- weapons. Right: ninjato — steel pommel with a vermilion tassel, long black grip, square tsuba, brass collar, a straight blade
  // (bright edge row + steel spine row) ending in a one-step chisel tip. Left: kunai — ring pommel, wrapped grip, leaf blade.
  const [rx, ry, rz] = A.wR;
  v.part('weapon').box(rx, ry, rz - 4, rx, ry, rz + 1, C.TSUKA).set(rx, ry, rz - 5, C.STEEL_D).set(rx, ry - 1, rz - 5, C.SCARF)
    .box(rx - 1, ry - 1, rz + 2, rx + 1, ry + 1, rz + 2, C.STEEL_D).box(rx, ry, rz + 3, rx, ry + 1, rz + 3, C.BRASS)
    .box(rx, ry, rz + 4, rx, ry, rz + 14, C.BLADE).box(rx, ry + 1, rz + 4, rx, ry + 1, rz + 12, C.STEEL);
  heroGrip(v, A.wR, 'R', C.BLACK, C.STEEL);
  const [lx, ly, lz] = A.wL;
  v.part('offhand').box(lx, ly, lz - 2, lx, ly, lz + 1, C.WRAP_D)
    .box(lx, ly - 1, lz - 5, lx, ly + 1, lz - 3, C.STEEL_D).set(lx, ly, lz - 4, null)
    .box(lx, ly - 1, lz + 2, lx, ly + 1, lz + 3, C.STEEL).box(lx, ly, lz + 4, lx, ly, lz + 6, C.BLADE);
  heroGrip(v, A.wL, 'L', C.BLACK, C.STEEL);
  return v;
}

export const ninja: KyotoHero = {
  def: { id: 'ninja', name: '忍者', group: '职业', role: '影忍 · 人类', line: '烟起之处，刀已归鞘。', kind: 'biped', attack: 'dual', tip: 14, build },
  strike: ninjaStrike,
  skill: ninjaSkill,
};
