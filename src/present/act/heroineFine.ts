// 细格子的白发女（act-21，用户：「我感觉这版的角色方块好像太大了，有点精细度不够……再近一步你建模个白发女给我看看」）。
// 格子 3.5 厘米（原来 7 厘米的一半），人约 58 格高。骨骼名字和关节位置和 7 厘米的白发（slim_white）一模一样（坐标 × 2），
// 所以动作代码（ninjaAct.ts heroHook）不用改，所有招式照播。外形照用户在 MagicaVoxel 里改的白发女：平脸不做鼻子、红蒙眼布加宽到鼻梁、
// 白发高马尾红发绳、右边米白内衫袖（外袍褪下右肩）、蓝袍、黑腰带、绑腿、环首刀。女性身段：腰比胸和胯都窄一点。
// 美术铁律照旧：横平竖直的大块，2～3 档颜色，不撒随机点，不走斜线台阶（唯一的小台阶在刀尖和下巴，各一级）。
import { VoxChar, type Col } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import type { ModelDef } from '../bestiary/models';

const C = {
  HAIR: 0xe8e8ee, HAIR_D: 0xbcbcc8, RED: 0xc23a30, RED_D: 0x8a2420,
  ROBE: 0x34405a, ROBE_L: 0x4a587a, ROBE_D: 0x222b3e, INNER: 0xd8d2c4, WRAP: 0xd8d0c0, WRAP_D: 0xb4ab9c,
  SASH: 0x1a1a22, SASH_L: 0x30303c, SKIN: 0xe0b896, SKIN_D: 0xc39a78, TROU: 0x1e2230, BOOT: 0x18181e, BOOT_L: 0x2c2c36,
  EDGE: 0xeef3f8, STEEL: 0x9aa2b0, IRON: 0x4a4e58,
} as const;

/** v.box for one part */
const B = (v: VoxChar, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null) => v.part(part).box(x0, y0, z0, x1, y1, z1, c);

export function buildWhiteFine(): VoxChar {
  const v = new VoxChar(CELL / 2);
  // ---------------------------------------------------------------- the skeleton: slim_white's joints × 2
  v.bone('hips', 'root', 0, 22, 0).bone('spine', 'hips', 0, 26, 0).bone('chest', 'spine', 0, 32, 0)
    .bone('neck', 'chest', 0, 38, 0).bone('head', 'neck', 0, 42, 0).bone('jaw', 'head', 0, 46, 2).bone('hat', 'head', 0, 56, 0)
    .bone('cape', 'chest', 0, 36, -4)
    .bone('shL', 'chest', 8, 38, 0).bone('armL', 'shL', 8, 38, 0).bone('foreL', 'armL', 8, 30, 0).bone('handL', 'foreL', 8, 22, 0)
    .bone('shR', 'chest', -8, 38, 0).bone('armR', 'shR', -8, 38, 0).bone('foreR', 'armR', -8, 30, 0).bone('handR', 'foreR', -8, 22, 0)
    .bone('weapon', 'handR', -7, 19, 1).bone('offhand', 'handL', 8, 20, 0)
    .bone('legL', 'hips', 4, 22, 0).bone('shinL', 'legL', 4, 12, 0).bone('footL', 'shinL', 4, 4, 0)
    .bone('legR', 'hips', -4, 22, 0).bone('shinR', 'legR', -4, 12, 0).bone('footR', 'shinR', -4, 4, 0)
    .bone('hrA1', 'head', 0, 57, -7).bone('hrA2', 'hrA1', 0, 45, -7).bone('hrA3', 'hrA2', 0, 35, -7)
    .bone('bfA1', 'head', 2, 47, -11).bone('bfA2', 'bfA1', 2, 35, -11).bone('bfA3', 'bfA2', 2, 23, -11)
    .bone('bfB1', 'head', -4, 47, -11).bone('bfB2', 'bfB1', -4, 35, -11)
    .bone('blade', 'weapon', -7, 19, 6);

  // ---------------------------------------------------------------- legs (left x 2..5, right mirrored x −6..−3)
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R', X = (a: number, b: number): [number, number] => (s > 0 ? [a, b] : [-1 - b, -1 - a]);
    const [x0, x1] = X(2, 5);
    // boot: a sole running one cell longer at the toe (the user lengthened the shoes), the instep two rows lower in front
    B(v, 'foot' + L, x0, 0, -2, x1, 1, 5, C.BOOT); B(v, 'foot' + L, x0, 2, -2, x1, 3, 3, C.BOOT); B(v, 'foot' + L, x0, 3, -2, x1, 3, 3, C.BOOT_L);
    // shin: boot shaft, a band of trouser, the cream leg wraps with one tie line
    const [s0, s1] = X(3, 5);
    B(v, 'shin' + L, x0, 4, -2, x1, 5, 1, C.BOOT); B(v, 'shin' + L, s0, 6, -2, s1, 6, 0, C.TROU);
    B(v, 'shin' + L, s0, 7, -2, s1, 11, 0, C.WRAP); B(v, 'shin' + L, s0, 9, -2, s1, 9, 0, C.WRAP_D);
    // thigh in the dark trousers, and the robe's skirt panel over it (each thigh carries its half, a stride opens them)
    B(v, 'leg' + L, x0, 12, -2, x1, 21, 1, C.TROU);
    const [f0, f1] = X(0, 6); B(v, 'leg' + L, f0, 15, -3, f1, 21, 2, C.ROBE); B(v, 'leg' + L, f0, 15, -3, f1, 15, 2, C.ROBE_D);
  }
  // ---------------------------------------------------------------- hips, waist, chest
  B(v, 'hips', -6, 22, -4, 5, 25, 3, C.ROBE);
  // the empty right sleeve, tied at the waist, hanging behind the right hip (clear of the swinging arm)
  B(v, 'hips', -7, 13, -6, -5, 25, -5, C.ROBE); B(v, 'hips', -7, 13, -6, -5, 14, -5, C.ROBE_D);
  // the sash's knot and two short tails in front of the left thigh
  B(v, 'hips', 1, 20, 4, 3, 25, 4, C.SASH); B(v, 'hips', 2, 18, 4, 3, 19, 4, C.SASH_L);
  // waist: narrower than chest and hips; the wide black sash, the robe above it
  B(v, 'spine', -5, 26, -4, 4, 31, 3, C.ROBE); B(v, 'spine', -5, 26, -4, 4, 29, 3, C.SASH); B(v, 'spine', -5, 29, -4, 4, 29, 3, C.SASH_L);
  // chest 14 wide; its top row in one cell all round (a soft shoulder line, no square arm tops above it)
  B(v, 'chest', -7, 32, -4, 6, 36, 3, C.ROBE); B(v, 'chest', -6, 37, -3, 5, 37, 2, C.ROBE);
  // the crossed collar as straight masses: the cream inner collar at the throat, the outer robe's edge straight down to the sash
  B(v, 'chest', -2, 35, 3, 1, 37, 3, C.INNER); B(v, 'chest', -2, 37, 2, 1, 37, 2, C.INNER);
  B(v, 'chest', 2, 32, 3, 2, 36, 3, C.ROBE_L); B(v, 'spine', 2, 30, 3, 2, 31, 3, C.ROBE_L);
  // the robe slipped off the right shoulder: the cream inner garment on the shoulder, a darker fold where the robe ends
  B(v, 'chest', -7, 34, -4, -5, 36, 3, C.INNER); B(v, 'chest', -6, 37, -3, -5, 37, 2, C.INNER); B(v, 'chest', -4, 32, 3, -4, 37, 3, C.ROBE_D);
  B(v, 'neck', -2, 38, -2, 1, 41, 1, C.SKIN);
  // ---------------------------------------------------------------- arms (shoulders one cell below the chest's top: the user lowered them)
  // left: the dark robe sleeve, a darker cuff, an open guard hand
  B(v, 'armL', 6, 30, -2, 9, 36, 1, C.ROBE);
  B(v, 'foreL', 6, 24, -2, 8, 29, 0, C.ROBE); B(v, 'foreL', 6, 22, -2, 9, 23, 1, C.ROBE_D);
  B(v, 'handL', 6, 17, -2, 8, 21, 0, C.SKIN); B(v, 'handL', 8, 18, -2, 8, 20, 0, C.SKIN_D); B(v, 'handL', 6, 19, 1, 6, 20, 1, C.SKIN);
  // right: the cream inner sleeve, the forearm in wraps (two tie lines), the sword hand closed round the grip
  B(v, 'armR', -10, 30, -2, -7, 36, 1, C.INNER);
  B(v, 'foreR', -9, 22, -2, -7, 29, 0, C.WRAP); B(v, 'foreR', -9, 24, -2, -7, 24, 0, C.WRAP_D); B(v, 'foreR', -9, 27, -2, -7, 27, 0, C.WRAP_D);
  B(v, 'foreR', -10, 28, -2, -7, 29, 1, C.INNER);
  B(v, 'handR', -9, 16, -2, -7, 21, 1, C.SKIN); B(v, 'handR', -9, 17, -2, -9, 20, 1, C.SKIN_D);
  // ---------------------------------------------------------------- the sword (環首刀): grip through the fist, ring pommel, small guard, blade
  B(v, 'handR', -8, 18, -2, -7, 19, 1, null);
  B(v, 'weapon', -8, 18, -3, -7, 19, 3, C.SASH); B(v, 'weapon', -8, 18, -1, -7, 19, -1, C.SASH_L);
  // the ring: a square outline one cell thick, behind the fist; a red tassel hanging under it
  B(v, 'weapon', -8, 17, -7, -7, 20, -4, C.IRON); B(v, 'weapon', -8, 18, -6, -7, 19, -5, null);
  B(v, 'weapon', -8, 12, -6, -7, 16, -5, C.RED); B(v, 'weapon', -8, 12, -6, -7, 12, -5, C.RED_D);
  B(v, 'weapon', -8, 17, 4, -7, 20, 4, C.IRON);
  // the blade: one cell thick, two edge rows and the spine above, a chisel tip (one step)
  B(v, 'blade', -8, 17, 6, -8, 18, 37, C.EDGE); B(v, 'blade', -8, 19, 6, -8, 19, 35, C.STEEL); B(v, 'blade', -8, 17, 5, -7, 19, 5, C.IRON);
  // ---------------------------------------------------------------- the head (12 wide, 14 tall), flat face, a soft jaw
  B(v, 'head', -6, 42, -6, 5, 55, 5, C.SKIN);
  for (const [x, z] of [[-6, -6], [5, -6], [-6, 5], [5, 5]]) B(v, 'head', x, 42, z, x, 55, z, null);
  B(v, 'head', -6, 42, -6, 5, 42, 5, null); B(v, 'head', -4, 42, -4, 3, 42, 4, C.SKIN);     // the chin narrower (one step)
  // the blindfold: red, one cell proud all round, widened down over the bridge of the nose with a darker lower edge (the user's edit)
  B(v, 'head', -6, 46, 6, 5, 51, 6, C.RED); B(v, 'head', -6, 46, 6, 5, 46, 6, C.RED_D);
  B(v, 'head', -6, 47, -7, 5, 51, -7, C.RED); B(v, 'head', -7, 47, -5, -7, 51, 4, C.RED); B(v, 'head', 6, 47, -5, 6, 51, 4, C.RED);
  B(v, 'head', -2, 47, -8, 1, 52, -8, C.RED);                                                 // the knot at the back
  // the hair: the scalp white above the band and at the back; a shell one cell out over crown, back and sides; a straight fringe
  v.paint(c => (c.part === 'head' && c.c === C.SKIN && (c.y >= 52 || (c.z <= -4 && c.y >= 44)) ? C.HAIR : null));
  B(v, 'head', -5, 56, -5, 4, 56, 4, C.HAIR); B(v, 'head', -3, 57, -3, 2, 57, 2, C.HAIR);
  B(v, 'head', -5, 44, -7, 4, 55, -7, C.HAIR); B(v, 'head', -2, 44, -7, -2, 55, -7, C.HAIR_D); B(v, 'head', 1, 44, -7, 1, 55, -7, C.HAIR_D); B(v, 'head', -6, 47, -7, 5, 51, -7, C.RED);
  B(v, 'head', -7, 52, -5, -7, 55, 4, C.HAIR); B(v, 'head', 6, 52, -5, 6, 55, 4, C.HAIR);
  B(v, 'head', -5, 52, 6, 4, 55, 6, C.HAIR); B(v, 'head', -3, 52, 6, -3, 53, 6, C.HAIR_D); B(v, 'head', 2, 52, 6, 2, 53, 6, C.HAIR_D);
  // long locks framing the face below the band, down past the jaw (outer strand longer than the inner, straight vertical ends)
  for (const s of [1, -1]) { const xo = s > 0 ? 7 : -8, xi = s > 0 ? 6 : -7;
    B(v, 'head', xo, 37, 0, xo, 47, 4, C.HAIR); B(v, 'head', xi, 40, 1, xi, 47, 4, C.HAIR); B(v, 'head', xo, 37, 0, xo, 38, 4, C.HAIR_D); }
  // ---------------------------------------------------------------- the high ponytail (three joints) tied with red
  B(v, 'hat', -2, 55, -9, 1, 58, -6, C.RED); B(v, 'hat', -2, 55, -9, 1, 55, -6, C.RED_D);
  B(v, 'hrA1', -3, 46, -11, 2, 58, -10, C.HAIR); B(v, 'hrA1', -3, 46, -11, -3, 58, -10, C.HAIR_D);
  B(v, 'hrA2', -2, 35, -11, 1, 45, -10, C.HAIR); B(v, 'hrA2', -2, 35, -11, -2, 45, -10, C.HAIR_D);
  B(v, 'hrA3', -1, 25, -11, 0, 34, -10, C.HAIR); B(v, 'hrA3', -1, 25, -11, 0, 26, -10, C.HAIR_D);
  // ---------------------------------------------------------------- the blindfold's two red tails, behind the ponytail
  B(v, 'bfA1', 1, 36, -12, 2, 46, -12, C.RED); B(v, 'bfA2', 1, 24, -12, 2, 35, -12, C.RED); B(v, 'bfA3', 1, 13, -12, 2, 23, -12, C.RED); B(v, 'bfA3', 1, 13, -12, 2, 13, -12, C.RED_D);
  B(v, 'bfB1', -5, 36, -12, -4, 46, -12, C.RED); B(v, 'bfB2', -5, 26, -12, -4, 35, -12, C.RED); B(v, 'bfB2', -5, 26, -12, -4, 26, -12, C.RED_D);
  return v;
}

/** the fine white-haired heroine: same joints as slim_white, so every move plays; tip = the blade's length in her cells */
export const FINE_WHITE: ModelDef = { id: 'fine_white', name: '白发·细', group: '职业', role: '蒙眼女刀客', line: '', kind: 'biped', attack: 'dual', tip: 38, build: buildWhiteFine };
