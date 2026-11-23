// 细格子的白发女（act-21，用户：「我感觉这版的角色方块好像太大了，有点精细度不够……再近一步你建模个白发女给我看看」）。
// 格子 3.5 厘米（原来 7 厘米的一半），人约 58 格高。骨骼名字和关节位置和 7 厘米的白发（slim_white）一模一样（坐标 × 2），
// 所以动作代码（ninjaAct.ts heroHook）不用改，所有招式照播。外形照用户在 MagicaVoxel 里改的白发女：平脸不做鼻子、红蒙眼布加宽到鼻梁、
// 白发高马尾红发绳、右边米白内衫袖（外袍褪下右肩）、蓝袍、黑腰带、绑腿、环首刀。女性身段：腰比胸和胯都窄一点。
// 美术铁律照旧：横平竖直的大块，2～3 档颜色，不撒随机点，不走斜线台阶（唯一的小台阶在刀尖和下巴，各一级）。
import { VoxChar, type Col } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import type { ModelDef } from '../bestiary/models';

const C = {
  HAIR: 0xe8e8ee, HAIR_L: 0xf6f6fc, HAIR_D: 0xbcbcc8, RED: 0xc23a30, RED_D: 0x8a2420,
  ROBE: 0x34405a, ROBE_L: 0x4c5c80, ROBE_D: 0x222b3e, INNER: 0xdfd8ca, WRAP: 0xdad2c2, WRAP_D: 0xb0a696,
  SASH: 0x1a1a22, SASH_L: 0x343442, SKIN: 0xe0b896, SKIN_D: 0xc09674, TROU: 0x1e2230, BOOT: 0x18181e, BOOT_L: 0x30303c,
  EDGE: 0xf2f6fc, STEEL: 0x949eae, IRON: 0x4a4e58,
} as const;

/** v.box for one part */
const B = (v: VoxChar, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null) => v.part(part).box(x0, y0, z0, x1, y1, z1, c);
/** chamfered box (r cells cut on the 4 vertical corners — clean rounded planes, zero bumpy stair-steps) */
function CBox(v: VoxChar, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, r = 1) {
  v.part(part);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const ex = Math.min(x - x0, x1 - x), ez = Math.min(z - z0, z1 - z);
    if (ex + ez < r) continue;
    for (let y = y0; y <= y1; y++) v.set(x, y, z, c);
  }
  return v;
}

/** the palette a look dresses the shared body in */
type Pal = { [K in keyof typeof C]: number };
/** the joints: slim_white's × 2 (both looks share them; a look without a ponytail leaves the hrA bones empty) */
function skeleton(v: VoxChar, ribbons: 'tie' | 'knot') {
  v.bone('hips', 'root', 0, 22, 0).bone('spine', 'hips', 0, 26, 0).bone('chest', 'spine', 0, 32, 0)
    .bone('neck', 'chest', 0, 38, 0).bone('head', 'neck', 0, 42, 0).bone('jaw', 'head', 0, 46, 2).bone('hat', 'head', 0, 56, 0)
    .bone('cape', 'chest', 0, 36, -4)
    .bone('shL', 'chest', 8, 38, 0).bone('armL', 'shL', 8, 38, 0).bone('foreL', 'armL', 8, 30, 0).bone('handL', 'foreL', 8, 22, 0)
    .bone('shR', 'chest', -8, 38, 0).bone('armR', 'shR', -8, 38, 0).bone('foreR', 'armR', -8, 30, 0).bone('handR', 'foreR', -8, 22, 0)
    .bone('weapon', 'handR', -7, 19, 1).bone('offhand', 'handL', 8, 20, 0)
    .bone('legL', 'hips', 4, 22, 0).bone('shinL', 'legL', 4, 12, 0).bone('footL', 'shinL', 4, 4, 0)
    .bone('legR', 'hips', -4, 22, 0).bone('shinR', 'legR', -4, 12, 0).bone('footR', 'shinR', -4, 4, 0)
    .bone('hrA1', 'head', 0, ribbons === 'tie' ? 55.5 : 49, -9.5).bone('hrA2', 'hrA1', 0, 46, -11).bone('hrA3', 'hrA2', 0, 35, -11)
    .bone('blade', 'weapon', -7, 19, 6)
    .bone('swTassel', 'weapon', -7.5, 17, -5.5)
    .bone('sashT', 'hips', 2.5, 25, 4)
    .bone('hipSlv1', 'hips', -5, 25, -5.5).bone('hipSlv2', 'hipSlv1', -5, 21, -5.5).bone('hipSlv3', 'hipSlv2', -5, 17, -5.5)
    .bone('hairL', 'head', 6.5, 50, 4.5).bone('hairR', 'head', -7.5, 50, 4.5);
  // the two long ribbons: from the hair tie's bow either side of the ponytail (白发), or flanking the under-brim ponytail (斗笠)
  if (ribbons === 'tie') v.bone('bfA1', 'head', 4, 54, -10.5).bone('bfA2', 'bfA1', 4, 44, -10.5).bone('bfA3', 'bfA2', 4, 33, -10.5)
    .bone('bfB1', 'head', -4, 54, -10.5).bone('bfB2', 'bfB1', -4, 45, -10.5);
  else v.bone('bfA1', 'head', 3.5, 48, -10.5).bone('bfA2', 'bfA1', 3.5, 35, -10.5).bone('bfA3', 'bfA2', 3.5, 23, -10.5)
    .bone('bfB1', 'head', -4.5, 48, -10.5).bone('bfB2', 'bfB1', -4.5, 35, -10.5);
}
/** legs (left x 2..5, right mirrored x −6..−3): boot with a sole one cell longer at the toe, shin, thigh, the robe's skirt panel */
function legs(v: VoxChar, P: Pal, o: { sole?: number; shinTop?: number } = {}) {
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R', X = (a: number, b: number): [number, number] => (s > 0 ? [a, b] : [-1 - b, -1 - a]);
    const [x0, x1] = X(2, 5);
    B(v, 'foot' + L, x0, 0, -2, x1, 0, 5, P.BOOT); B(v, 'foot' + L, x0, 1, -2, x1, 1, 5, P.BOOT_L); B(v, 'foot' + L, x0, 2, -2, x1, 3, 3, P.BOOT); B(v, 'foot' + L, x0, 2, 4, x1, 2, 4, P.BOOT); B(v, 'foot' + L, x0, 3, -2, x1, 3, 3, P.BOOT_L);
    if (o.sole != null) B(v, 'foot' + L, x0, 0, -2, x1, 0, 5, o.sole);
    const [s0, s1] = X(3, 5);
    B(v, 'shin' + L, x0, 4, -2, x1, 5, 1, P.BOOT); B(v, 'shin' + L, x0, 5, -2, x1, 5, 1, P.BOOT_L); B(v, 'shin' + L, s0, 6, -2, s1, 6, 0, P.TROU);
    B(v, 'shin' + L, s0, 7, -2, s1, 11, 0, P.WRAP); B(v, 'shin' + L, s0, 7, -2, s1, 7, 0, P.WRAP_D); B(v, 'shin' + L, s0, o.shinTop ?? 10, -2, s1, o.shinTop ?? 10, 0, P.WRAP_D);
    B(v, 'leg' + L, x0, 12, -2, x1, 21, 1, P.TROU);
    // (one column narrower than the hips, act-23: at rest the hand hung inside it, and the hand kept the shared cells — the robe showed
    // a notch whenever the arm moved)
    const [f0, f1] = X(0, 5), [fi] = X(0, 0);
    B(v, 'leg' + L, f0, 15, -3, f1, 21, 2, P.ROBE); B(v, 'leg' + L, f0, 15, -3, f1, 15, 2, P.ROBE_D); B(v, 'leg' + L, fi, 16, 2, fi, 21, 2, P.ROBE_L);
  }
}
/** hips, the narrow waist with the wide sash, the 14-wide chest with its soft shoulder line, the crossed collar, the neck */
function torso(v: VoxChar, P: Pal) {
  B(v, 'hips', -6, 22, -4, 5, 25, 3, P.ROBE);
  B(v, 'spine', -5, 26, -4, 4, 31, 3, P.ROBE); B(v, 'spine', -5, 26, -4, 4, 29, 3, P.SASH); B(v, 'spine', -5, 29, -4, 4, 29, 3, P.SASH_L); B(v, 'spine', -5, 26, -4, 4, 26, 3, P.ROBE_D);
  B(v, 'chest', -7, 32, -4, 6, 36, 3, P.ROBE); B(v, 'chest', -6, 37, -3, 5, 37, 2, P.ROBE_L);
  B(v, 'chest', -5, 35, -4, 4, 36, -4, P.ROBE_L);
  B(v, 'chest', -2, 35, 3, 1, 37, 3, P.INNER); B(v, 'chest', -2, 37, 2, 1, 37, 2, P.INNER);
  // 1-cell proud front crossed lapel fold for crisp chest silhouette
  B(v, 'chest', 2, 32, 3, 2, 36, 4, P.ROBE_L); B(v, 'spine', 2, 30, 3, 2, 31, 4, P.ROBE_L);
  B(v, 'neck', -2, 38, -2, 1, 41, 1, P.SKIN); B(v, 'neck', -2, 38, -2, 1, 38, 1, P.SKIN_D);
}
/** the left arm (a sleeve, a wider cuff, the small open guard hand) and the right upper arm / sword hand; forearms by the look */
function arms(v: VoxChar, P: Pal, o: { armR: number; foreL: number; cuffL: number }) {
  B(v, 'armL', 6, 30, -2, 9, 36, 1, P.ROBE); B(v, 'armL', 6, 36, -2, 9, 36, 1, P.ROBE_L);
  B(v, 'foreL', 6, 24, -2, 8, 29, 0, o.foreL); B(v, 'foreL', 6, 22, -2, 9, 23, 1, o.cuffL);
  B(v, 'handL', 6, 17, -2, 8, 21, 0, P.SKIN); B(v, 'handL', 8, 18, -2, 8, 20, 0, P.SKIN_D); B(v, 'handL', 6, 19, 1, 6, 20, 1, P.SKIN);
  B(v, 'armR', -10, 30, -2, -7, 36, 1, o.armR);
  B(v, 'handR', -9, 16, -2, -7, 21, 1, P.SKIN); B(v, 'handR', -9, 17, -2, -9, 20, 1, P.SKIN_D);
}
/** 環首刀 (refined to match fine_white.vox): sleek 1-voxel forged dark-iron ring pommel + wrapped grip, 1-voxel 3-tone crimson tassel,
 *  sculpted 3×5 beveled iron tsuba guard, and 3-tone cold forged steel blade tapering to a sharp chisel point */
function sword(v: VoxChar, P: Pal, _ring?: number, _grip?: number, _gripL?: number) {
  const IR_D = 0x2a2e38, IR = 0x464c5a, IR_L = 0x6c7486, GR_D = 0x181922, GR_L = 0x2c2f3f;
  const BL_E = 0xf4f8ff, BL_M = 0xbecad8, BL_S = 0x525c6e;
  B(v, 'handR', -8, 18, -2, -7, 19, 1, null);
  // 1-voxel wrapped hilt (z=-3..3) with alternating grip bands at z=-1, +1
  B(v, 'weapon', -8, 18, -3, -8, 19, 3, GR_D);
  B(v, 'weapon', -8, 18, -1, -8, 19, -1, GR_L);
  B(v, 'weapon', -8, 18, 1, -8, 19, 1, GR_L);
  // 1-voxel 3-tone ring pommel (z=-7..-4)
  B(v, 'weapon', -8, 17, -7, -8, 17, -4, IR_D);
  B(v, 'weapon', -8, 20, -7, -8, 20, -4, IR_L);
  B(v, 'weapon', -8, 18, -7, -8, 19, -7, IR);
  B(v, 'weapon', -8, 18, -4, -8, 19, -4, IR);
  // collar behind guard (z=4)
  B(v, 'weapon', -8, 17, 4, -8, 17, 4, IR_D);
  B(v, 'weapon', -8, 18, 4, -8, 19, 4, IR);
  B(v, 'weapon', -8, 20, 4, -8, 20, 4, IR_L);
  // sleek 1-voxel 3-tone crimson tassel
  B(v, 'swTassel', -8, 12, -6, -8, 12, -5, P.RED_D);
  B(v, 'swTassel', -8, 13, -6, -8, 14, -5, P.RED);
  B(v, 'swTassel', -8, 15, -6, -8, 16, -5, 0xde4a3a);
  // 3-wide × 5-tall beveled dark-iron tsuba guard (z=5)
  B(v, 'blade', -9, 16, 5, -7, 16, 5, IR_D);
  B(v, 'blade', -9, 17, 5, -7, 19, 5, IR);
  B(v, 'blade', -9, 20, 5, -7, 20, 5, IR_L);
  // 3-tone cold forged steel blade tapering to a sharp chisel point (z=6..35)
  B(v, 'blade', -8, 17, 6, -8, 17, 32, BL_E);
  B(v, 'blade', -8, 18, 6, -8, 18, 32, BL_M);
  B(v, 'blade', -8, 19, 6, -8, 19, 32, BL_S);
  B(v, 'blade', -8, 18, 33, -8, 19, 34, BL_E);
  B(v, 'blade', -8, 19, 35, -8, 19, 35, BL_E);
  void _ring; void _grip; void _gripL;
}
/** Sculpted Form-First head shared across all fine heroine outfits (matches vox/fine_white.vox):
 *  rounded jawline (y=41..45), 3-tone beveled crimson blindfold (y=46..49), parted white bangs, rounded hair crown, slender side locks */
function sculptedHead(v: VoxChar, P: Pal, o: { knotY?: number; crownTip?: boolean; underBrimTail?: boolean } = {}) {
  const redL = P.RED === C.RED || P.RED === HAT.RED ? RED_L : P.RED;
  // Short slender feminine neck (y=38..40)
  B(v, 'neck', -2, 41, -2, 1, 41, 1, null);
  CBox(v, 'head', -4, 41, -3, 3, 41, 4, P.SKIN, 1);
  CBox(v, 'head', -5, 42, -4, 4, 42, 5, P.SKIN, 2);
  CBox(v, 'head', -6, 43, -5, 5, 45, 5, P.SKIN, 2);
  for (const y of [43, 44, 45]) CBox(v, 'head', -6, y, -6, 5, y, -3, P.HAIR, 2);
  B(v, 'head', -4, 42, -5, 3, 42, -4, P.HAIR_D);
  CBox(v, 'head', -6, 46, -6, 5, 51, 5, P.SKIN, 2);
  CBox(v, 'head', -6, 46, -6, 5, 51, -3, P.HAIR, 2);
  // 3D beveled wrap-around blindfold (y=46..49) + back knot
  v.part('head');
  for (const y of [46, 47, 48, 49]) {
    for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) {
      const ex = Math.min(x - (-7), 6 - x), ez = Math.min(z - (-7), 6 - z);
      if (ex + ez < 3) continue;
      const inX = Math.min(x - (-6), 5 - x), inZ = Math.min(z - (-6), 5 - z);
      if (x >= -6 && x <= 5 && z >= -6 && z <= 5 && (inX + inZ >= 2)) continue;
      v.set(x, y, z, y === 49 && z >= 2 ? redL : y === 46 ? P.RED_D : P.RED);
    }
  }
  const ky = o.knotY ?? 46;
  B(v, 'head', -2, ky, -8, 1, ky + 4, -8, P.RED); B(v, 'head', -2, ky + 4, -8, 1, ky + 4, -8, redL);
  // Full rounded hair crown (y=50..56, + optional y=57 peak)
  CBox(v, 'head', -7, 50, -7, 6, 52, 6, P.HAIR, 3);
  CBox(v, 'head', -6, 53, -6, 5, 53, 5, P.HAIR, 2);
  CBox(v, 'head', -5, 54, -5, 4, 55, 4, P.HAIR, 2);
  CBox(v, 'head', -4, 56, -4, 3, 56, 3, P.HAIR_L, 2);
  if (o.crownTip) B(v, 'head', -2, 57, -2, 1, 57, 1, P.HAIR_L);
  B(v, 'head', -5, 44, -7, 4, 52, -7, P.HAIR); B(v, 'head', -2, 44, -7, -2, 52, -7, P.HAIR_D); B(v, 'head', 1, 44, -7, 1, 52, -7, P.HAIR_D);
  B(v, 'head', -2, 53, 5, 1, 53, 5, P.HAIR_L);
  B(v, 'head', -2, 50, 6, 1, 50, 6, null);
  for (const s of [-1, 1] as const) {
    const rx = (n: number) => (s > 0 ? n : -1 - n);
    const ox = s > 0 ? 6 : -7, hp = s > 0 ? 'hairL' : 'hairR';
    v.part('head').set(rx(3), 50, 6, P.HAIR_L).set(rx(3), 49, 6, P.HAIR).set(rx(4), 49, 5, P.HAIR).set(rx(4), 48, 5, P.HAIR);
    B(v, 'head', ox, 50, 4, ox, 51, 4, P.HAIR);
    B(v, hp, ox, 40, 4, ox, 49, 4, P.HAIR);
    B(v, hp, ox, 38, 4, ox, 39, 4, P.HAIR_D);
  }
  if (o.underBrimTail) {
    CBox(v, 'head', -3, 40, -9, 2, 45, -7, P.HAIR, 1); B(v, 'head', -2, 40, -9, 1, 41, -9, P.HAIR_D); B(v, 'head', -2, 45, -8, 1, 45, -7, P.RED);
  }
}
/** the blindfold's two tails (three and two joints), behind the head */
function tails(v: VoxChar, band: number, bandD: number, at: 'tie' | 'knot') {
  if (at === 'tie') {
    // either side of the ponytail, level with its back half, straight down from the bow
    B(v, 'bfA1', 3, 44, -11, 4, 54, -11, band); B(v, 'bfA2', 3, 33, -11, 4, 43, -11, band); B(v, 'bfA3', 3, 22, -11, 4, 32, -11, band); B(v, 'bfA3', 3, 22, -11, 4, 22, -11, bandD);
    B(v, 'bfB1', -5, 45, -11, -4, 54, -11, band); B(v, 'bfB2', -5, 35, -11, -4, 44, -11, band); B(v, 'bfB2', -5, 35, -11, -4, 35, -11, bandD);
  } else {
    // flat against the back of the knot
    B(v, 'bfA1', 0, 36, -9, 1, 46, -9, band); B(v, 'bfA2', 0, 24, -9, 1, 35, -9, band); B(v, 'bfA3', 0, 13, -9, 1, 23, -9, band); B(v, 'bfA3', 0, 13, -9, 1, 13, -9, bandD);
    B(v, 'bfB1', -3, 36, -9, -2, 46, -9, band); B(v, 'bfB2', -3, 26, -9, -2, 35, -9, band); B(v, 'bfB2', -3, 26, -9, -2, 26, -9, bandD);
  }
}

// ================================================================== 白发 (the default look)
export function buildWhiteFine(palOverride?: Partial<Pal>): VoxChar {
  const v = new VoxChar(CELL / 2), P = { ...C, ...palOverride } as unknown as Pal;
  skeleton(v, 'tie'); legs(v, P); torso(v, P);
  // the empty right sleeve tied at the waist, hanging behind the right hip (3-segment articulated cloth chain hipSlv1 -> hipSlv2 -> hipSlv3)
  B(v, 'hipSlv1', -6, 21, -6, -4, 25, -5, P.ROBE);
  B(v, 'hipSlv2', -6, 17, -6, -4, 20, -5, P.ROBE);
  B(v, 'hipSlv3', -6, 13, -6, -4, 16, -5, P.ROBE); B(v, 'hipSlv3', -6, 13, -6, -4, 14, -5, P.ROBE_D);   // (a column in from the sword's tassel)
  B(v, 'sashT', 1, 20, 4, 3, 25, 4, P.SASH); B(v, 'sashT', 2, 18, 4, 3, 19, 4, P.SASH_L);
  // the robe slipped off the right shoulder: the cream inner garment on the shoulder, a darker fold where the robe ends
  B(v, 'chest', -7, 34, -4, -5, 36, 3, P.INNER); B(v, 'chest', -6, 37, -3, -5, 37, 2, P.INNER); B(v, 'chest', -4, 32, 3, -4, 37, 3, P.ROBE_D);
  arms(v, P, { armR: P.INNER, foreL: P.ROBE, cuffL: P.ROBE_D });
  // the right forearm in wraps (two tie lines) under the end of the cream sleeve
  B(v, 'foreR', -9, 22, -2, -7, 29, 0, P.WRAP); B(v, 'foreR', -9, 24, -2, -7, 24, 0, P.WRAP_D); B(v, 'foreR', -9, 27, -2, -7, 27, 0, P.WRAP_D);
  B(v, 'foreR', -10, 28, -2, -7, 29, 1, P.INNER);
  sword(v, P, P.IRON, P.SASH, P.SASH_L);
  // Sculpted Form-First head (matches vox/fine_white.vox)
  sculptedHead(v, P, { knotY: 48 });
  // the high ponytail (three joints), the red cord wound round its root, a bow behind with the two long ribbons
  B(v, 'hrA1', -3, 46, -11, 2, 58, -10, P.HAIR); B(v, 'hrA1', -3, 46, -11, -3, 58, -10, P.HAIR_D);
  B(v, 'hrA2', -2, 35, -11, 1, 45, -10, P.HAIR); B(v, 'hrA2', -2, 35, -11, -2, 45, -10, P.HAIR_D);
  B(v, 'hrA3', -1, 25, -11, 0, 34, -10, P.HAIR); B(v, 'hrA3', -1, 25, -11, 0, 26, -10, P.HAIR_D);
  B(v, 'hat', -3, 55, -12, 2, 57, -6, P.RED); B(v, 'hat', -3, 55, -12, 2, 55, -6, P.RED_D);
  B(v, 'hat', -5, 55, -11, -4, 57, -11, P.RED); B(v, 'hat', 3, 55, -11, 4, 57, -11, P.RED);
  tails(v, P.RED, P.RED_D, 'tie');
  return v;
}

// ================================================================== 斗笠 (the other look in 设置)
// the 7 cm 斗笠's dress at 3.5 cm: slate robe, linen forearms with leather bracers, linen leg wraps, straw-soled sandals, a red cord at the
// sash, a black-lacquer scabbard at the left hip, black hair under the hat, the white blindfold and its tails; the straw hat as big flat
// tiers (a rounded square of three steps for the brim, never a stepped diagonal edge), its outer rim a shade darker
const HAT = { ...C, ROBE: 0x364254, ROBE_L: 0x52647c, ROBE_D: 0x222a36, INNER: 0xebe4d4, SASH: 0x1b191e, SASH_L: 0x32303c, WRAP: 0xa49b8a, WRAP_D: 0x6e665a,
  SKIN: 0xe4bca0, SKIN_D: 0xbe9274, HAIR: 0xeeeef6, HAIR_L: 0xfafaff, HAIR_D: 0xbac0d6, TROU: 0x202430, BOOT: 0x543826, BOOT_L: 0x6e4c36, RED: 0xc43028, RED_D: 0x7e1c20 };
const STRAW = 0xcfa85a, STRAW_D = 0x8e6b30, STRAW_DD = 0x63481e, STRAW_L = 0xe8c87e, RED_L = 0xde4a3a, LEATH = 0x523624, LACQ = 0x1a181e, BRONZE = 0xb8893a, BRONZE_L = 0xe2ba64;
export function buildHatFine(opts?: { pal?: Partial<Pal>; straw?: [number, number, number, number]; crown?: number }): VoxChar {
  const v = new VoxChar(CELL / 2), P = { ...HAT, ...(opts?.pal ?? {}) } as unknown as Pal;
  const sMain = opts?.straw?.[0] ?? STRAW;
  const sDark = opts?.straw?.[1] ?? STRAW_D;
  const sDeep = opts?.straw?.[2] ?? STRAW_DD;
  const sLite = opts?.straw?.[3] ?? STRAW_L;
  const sCrown = opts?.crown ?? 0x3e3228;
  skeleton(v, 'knot'); legs(v, P, { sole: sDark, shinTop: 11 }); torso(v, P);
  // Form-First body upgrades matching 白发: sloped shoulders, A-line flared skirt hem, sleek 3-row neck, restrained martial finish
  B(v, 'chest', -7, 37, -4, -7, 37, 3, null); B(v, 'chest', 6, 37, -4, 6, 37, 3, null);
  B(v, 'chest', -6, 37, -4, -6, 37, -4, null); B(v, 'chest', 5, 37, -4, 5, 37, -4, null);
  B(v, 'chest', -6, 37, 3, -6, 37, 3, null); B(v, 'chest', 5, 37, 3, 5, 37, 3, null);
  B(v, 'legL', 6, 15, -2, 6, 17, 1, P.ROBE); B(v, 'legL', 6, 15, -2, 6, 15, 1, P.ROBE_D);
  B(v, 'legR', -7, 15, -2, -7, 17, 1, P.ROBE); B(v, 'legR', -7, 15, -2, -7, 15, 1, P.ROBE_D);
  // Short slender feminine neck (y=38..40, matching 白发)
  B(v, 'neck', -2, 41, -2, 1, 41, 1, null);
  // the red cord hanging from the sash (on sashT), and the black-lacquer scabbard at the left hip, lying back along it with bronze fittings
  B(v, 'sashT', 2, 18, 4, 2, 25, 4, P.RED); B(v, 'sashT', 3, 22, 4, 3, 25, 4, P.RED);
  B(v, 'hips', 6, 23, -18, 7, 24, 1, LACQ); B(v, 'hips', 6, 23, 1, 7, 24, 1, BRONZE); B(v, 'hips', 6, 24, 1, 7, 24, 1, BRONZE_L);
  B(v, 'hips', 6, 23, -8, 7, 24, -7, BRONZE); B(v, 'hips', 6, 23, -18, 7, 24, -18, BRONZE);
  arms(v, P, { armR: P.ROBE, foreL: P.WRAP, cuffL: P.WRAP });
  // Sloped outer shoulder caps on both arms
  B(v, 'armL', 9, 36, -2, 9, 36, 1, null); B(v, 'armR', -10, 36, -2, -10, 36, 1, null);
  B(v, 'armR', -10, 35, -2, -7, 35, 1, P.ROBE_L); B(v, 'armR', -9, 36, -2, -7, 36, 1, P.ROBE_L);
  // linen forearms with layered leather bracers at the wrists
  B(v, 'foreR', -9, 22, -2, -7, 29, 0, P.WRAP); B(v, 'foreR', -9, 27, -2, -7, 27, 0, P.WRAP_D);
  B(v, 'foreR', -9, 22, -2, -7, 25, 0, LEATH); B(v, 'foreR', -9, 24, -2, -7, 24, 0, 0x362216); B(v, 'foreR', -9, 25, -2, -7, 25, 0, 0x6c4a32);
  B(v, 'foreL', 6, 22, -2, 9, 23, 1, null); B(v, 'foreL', 6, 27, -2, 8, 27, 0, P.WRAP_D);
  B(v, 'foreL', 6, 22, -2, 8, 25, 0, LEATH); B(v, 'foreL', 6, 24, -2, 8, 24, 0, 0x362216); B(v, 'foreL', 6, 25, -2, 8, 25, 0, 0x6c4a32);
  sword(v, P, BRONZE, LEATH, 0x4a3020);
  // Sculpted Form-First head shared with 白发 (with full y=50..57 rounded crown under conical hat)
  sculptedHead(v, P, { knotY: 46, crownTip: true, underBrimTail: true });
  tails(v, P.RED, P.RED_D, 'knot');
  // the 斗笠: hollow conical shell built strictly outside the full white hair dome (y=50..60, never overwrites 'head' hair cells!),
  // so hiding bones.hat while healing in the kiln reveals a complete, sculpted white-haired head with zero gap or flat cut!
  const hatBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) => {
    v.part('hat');
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (!v.get(x, y, z)) v.set(x, y, z, c);
    }
  };
  const brim = (y0: number, y1: number, c: number) => { hatBox(-18, y0, -12, 17, y1, 11, c); hatBox(-15, y0, -15, 14, y1, 14, c); hatBox(-12, y0, -18, 11, y1, 17, c); };
  hatBox(-14, 51, -10, 13, 51, 9, sDeep); hatBox(-10, 51, -14, 9, 51, 13, sDeep);
  brim(52, 53, sMain);
  v.paint(c => (c.part === 'hat' && c.y === 52 && (!v.get(c.x + 1, 52, c.z) || !v.get(c.x - 1, 52, c.z) || !v.get(c.x, 52, c.z + 1) || !v.get(c.x, 52, c.z - 1)) ? sDark : null));
  hatBox(-11, 54, -8, 10, 55, 7, sMain); hatBox(-8, 54, -11, 7, 55, 10, sMain);
  v.paint(c => (c.part === 'hat' && c.y === 54 && c.x >= -11 && c.x <= 10 && c.z >= -8 && c.z <= 7 ? sDark : null));
  hatBox(-8, 56, -7, 7, 57, 6, sLite); hatBox(-7, 56, -8, 6, 57, 7, sLite);
  hatBox(-5, 58, -5, 4, 59, 4, sLite); hatBox(-3, 60, -3, 2, 60, 2, sLite); hatBox(-1, 61, -1, 0, 61, 0, sCrown);
  return v;
}

// ================================================================== act-139 典藏行头（A1）：雪夜白蓑 / 玄铁短氅 / 朱缨赤客
export function buildSnowFine(): VoxChar {
  return buildHatFine({
    pal: {
      ROBE: 0xdce4ee, ROBE_L: 0xf4f8ff, ROBE_D: 0x9aa8bc,
      INNER: 0x2a3444, SASH: 0x263248, SASH_L: 0x485e7e,
      WRAP: 0xc2ccd8, WRAP_D: 0x8694a8, TROU: 0x222a38,
      BOOT: 0x242834, BOOT_L: 0x3c4456, RED: 0xc82c26, RED_D: 0x821818,
    },
    straw: [0xe6eef6, 0xa8b8cc, 0x76889e, 0xf8fcff],
    crown: 0xb8302a,
  });
}

export function buildObsidianFine(): VoxChar {
  return buildHatFine({
    pal: {
      ROBE: 0x1d1e24, ROBE_L: 0x383b46, ROBE_D: 0x101116,
      INNER: 0x8c6830, SASH: 0x6e4e22, SASH_L: 0xd8a852,
      WRAP: 0x3a3634, WRAP_D: 0x221f1e, TROU: 0x14151a,
      BOOT: 0x161418, BOOT_L: 0x343038, RED: 0xd09a40, RED_D: 0x82581c,
    },
    straw: [0x262830, 0x16171d, 0x0e0f14, 0xc89642],
    crown: 0xe6b860,
  });
}

export function buildCrimsonFine(): VoxChar {
  return buildWhiteFine({
    ROBE: 0x8e2220, ROBE_L: 0xb83630, ROBE_D: 0x561212,
    INNER: 0x1c1a20, SASH: 0x141318, SASH_L: 0xd29c46,
    WRAP: 0xd8d0c0, WRAP_D: 0x988e7e, TROU: 0x18161e,
    BOOT: 0x16141a, BOOT_L: 0x342c30, RED: 0xe6be68, RED_D: 0x9c7428,
  });
}

/** the fine white-haired heroine: same joints as slim_white, so every move plays; tip = the blade's length in her cells */
export const FINE_WHITE: ModelDef = { id: 'fine_white', name: '白发', group: '职业', role: '蒙眼女刀客', line: '', kind: 'biped', attack: 'dual', tip: 38, build: () => buildWhiteFine() };
/** the 斗笠 look at 3.5 cm (the other choice in 设置) */
export const FINE_HAT: ModelDef = { id: 'fine_hat', name: '斗笠', group: '职业', role: '蒙眼女刀客', line: '', kind: 'biped', attack: 'dual', tip: 38, build: () => buildHatFine() };
export const FINE_SNOW: ModelDef = { id: 'fine_snow', name: '雪夜白蓑', group: '职业', role: '蒙眼女刀客', line: '', kind: 'biped', attack: 'dual', tip: 38, build: buildSnowFine };
export const FINE_OBSIDIAN: ModelDef = { id: 'fine_obsidian', name: '玄铁短氅', group: '职业', role: '蒙眼女刀客', line: '', kind: 'biped', attack: 'dual', tip: 38, build: buildObsidianFine };
export const FINE_CRIMSON: ModelDef = { id: 'fine_crimson', name: '朱缨赤客', group: '职业', role: '蒙眼女刀客', line: '', kind: 'biped', attack: 'dual', tip: 38, build: buildCrimsonFine };
