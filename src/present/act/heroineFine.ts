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

/** the palette a look dresses the shared body in */
type Pal = { [K in keyof typeof C]: number };
/** the joints: slim_white's × 2 (both looks share them; a look without a ponytail leaves the hrA bones empty) */
function skeleton(v: VoxChar) {
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
}
/** legs (left x 2..5, right mirrored x −6..−3): boot with a sole one cell longer at the toe, shin, thigh, the robe's skirt panel */
function legs(v: VoxChar, P: Pal, o: { sole?: number; shinTop?: number } = {}) {
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R', X = (a: number, b: number): [number, number] => (s > 0 ? [a, b] : [-1 - b, -1 - a]);
    const [x0, x1] = X(2, 5);
    B(v, 'foot' + L, x0, 0, -2, x1, 1, 5, P.BOOT); B(v, 'foot' + L, x0, 2, -2, x1, 3, 3, P.BOOT); B(v, 'foot' + L, x0, 3, -2, x1, 3, 3, P.BOOT_L);
    if (o.sole != null) B(v, 'foot' + L, x0, 0, -2, x1, 0, 5, o.sole);
    const [s0, s1] = X(3, 5);
    B(v, 'shin' + L, x0, 4, -2, x1, 5, 1, P.BOOT); B(v, 'shin' + L, s0, 6, -2, s1, 6, 0, P.TROU);
    B(v, 'shin' + L, s0, 7, -2, s1, 11, 0, P.WRAP); B(v, 'shin' + L, s0, o.shinTop ?? 9, -2, s1, o.shinTop ?? 9, 0, P.WRAP_D);
    B(v, 'leg' + L, x0, 12, -2, x1, 21, 1, P.TROU);
    const [f0, f1] = X(0, 6); B(v, 'leg' + L, f0, 15, -3, f1, 21, 2, P.ROBE); B(v, 'leg' + L, f0, 15, -3, f1, 15, 2, P.ROBE_D);
  }
}
/** hips, the narrow waist with the wide sash, the 14-wide chest with its soft shoulder line, the crossed collar, the neck */
function torso(v: VoxChar, P: Pal) {
  B(v, 'hips', -6, 22, -4, 5, 25, 3, P.ROBE);
  B(v, 'spine', -5, 26, -4, 4, 31, 3, P.ROBE); B(v, 'spine', -5, 26, -4, 4, 29, 3, P.SASH); B(v, 'spine', -5, 29, -4, 4, 29, 3, P.SASH_L);
  B(v, 'chest', -7, 32, -4, 6, 36, 3, P.ROBE); B(v, 'chest', -6, 37, -3, 5, 37, 2, P.ROBE);
  B(v, 'chest', -2, 35, 3, 1, 37, 3, P.INNER); B(v, 'chest', -2, 37, 2, 1, 37, 2, P.INNER);
  B(v, 'chest', 2, 32, 3, 2, 36, 3, P.ROBE_L); B(v, 'spine', 2, 30, 3, 2, 31, 3, P.ROBE_L);
  B(v, 'neck', -2, 38, -2, 1, 41, 1, P.SKIN);
}
/** the left arm (a sleeve, a wider cuff, the small open guard hand) and the right upper arm / sword hand; forearms by the look */
function arms(v: VoxChar, P: Pal, o: { armR: number; foreL: number; cuffL: number }) {
  B(v, 'armL', 6, 30, -2, 9, 36, 1, P.ROBE);
  B(v, 'foreL', 6, 24, -2, 8, 29, 0, o.foreL); B(v, 'foreL', 6, 22, -2, 9, 23, 1, o.cuffL);
  B(v, 'handL', 6, 17, -2, 8, 21, 0, P.SKIN); B(v, 'handL', 8, 18, -2, 8, 20, 0, P.SKIN_D); B(v, 'handL', 6, 19, 1, 6, 20, 1, P.SKIN);
  B(v, 'armR', -10, 30, -2, -7, 36, 1, o.armR);
  B(v, 'handR', -9, 16, -2, -7, 21, 1, P.SKIN); B(v, 'handR', -9, 17, -2, -9, 20, 1, P.SKIN_D);
}
/** 環首刀: grip through the fist, the ring pommel (a square outline one cell thick), a tassel under it, a small guard, the blade one
 *  cell thick (two edge rows, the spine above, a chisel tip) */
function sword(v: VoxChar, P: Pal, ring: number, grip: number, gripL: number) {
  B(v, 'handR', -8, 18, -2, -7, 19, 1, null);
  B(v, 'weapon', -8, 18, -3, -7, 19, 3, grip); B(v, 'weapon', -8, 18, -1, -7, 19, -1, gripL);
  B(v, 'weapon', -8, 17, -7, -7, 20, -4, ring); B(v, 'weapon', -8, 18, -6, -7, 19, -5, null);
  B(v, 'weapon', -8, 12, -6, -7, 16, -5, P.RED); B(v, 'weapon', -8, 12, -6, -7, 12, -5, P.RED_D);
  B(v, 'weapon', -8, 17, 4, -7, 20, 4, ring);
  B(v, 'blade', -8, 17, 6, -8, 18, 37, P.EDGE); B(v, 'blade', -8, 19, 6, -8, 19, 35, P.STEEL); B(v, 'blade', -8, 17, 5, -7, 19, 5, ring);
}
/** the head (12 wide, 14 tall, a flat face, the chin one step narrower) and the blindfold band one cell proud all round, its knot behind */
function skull(v: VoxChar, P: Pal, band: number, bandD: number, wide: boolean) {
  B(v, 'head', -6, 42, -6, 5, 55, 5, P.SKIN);
  for (const [x, z] of [[-6, -6], [5, -6], [-6, 5], [5, 5]]) B(v, 'head', x, 42, z, x, 55, z, null);
  B(v, 'head', -6, 42, -6, 5, 42, 5, null); B(v, 'head', -4, 42, -4, 3, 42, 4, P.SKIN);
  const y0 = wide ? 46 : 48;
  B(v, 'head', -6, y0, 6, 5, 51, 6, band); B(v, 'head', -6, y0, 6, 5, y0, 6, bandD);
  B(v, 'head', -6, 47, -7, 5, 51, -7, band); B(v, 'head', -7, 47, -5, -7, 51, 4, band); B(v, 'head', 6, 47, -5, 6, 51, 4, band);
  B(v, 'head', -2, 47, -8, 1, 52, -8, band);
}
/** the blindfold's two tails (three and two joints), behind the head */
function tails(v: VoxChar, band: number, bandD: number) {
  B(v, 'bfA1', 1, 36, -12, 2, 46, -12, band); B(v, 'bfA2', 1, 24, -12, 2, 35, -12, band); B(v, 'bfA3', 1, 13, -12, 2, 23, -12, band); B(v, 'bfA3', 1, 13, -12, 2, 13, -12, bandD);
  B(v, 'bfB1', -5, 36, -12, -4, 46, -12, band); B(v, 'bfB2', -5, 26, -12, -4, 35, -12, band); B(v, 'bfB2', -5, 26, -12, -4, 26, -12, bandD);
}

// ================================================================== 白发 (the default look)
export function buildWhiteFine(): VoxChar {
  const v = new VoxChar(CELL / 2), P = C as unknown as Pal;
  skeleton(v); legs(v, P); torso(v, P);
  // the empty right sleeve tied at the waist, hanging behind the right hip (clear of the swinging arm); the sash's knot and short tails
  B(v, 'hips', -7, 13, -6, -5, 25, -5, P.ROBE); B(v, 'hips', -7, 13, -6, -5, 14, -5, P.ROBE_D);
  B(v, 'hips', 1, 20, 4, 3, 25, 4, P.SASH); B(v, 'hips', 2, 18, 4, 3, 19, 4, P.SASH_L);
  // the robe slipped off the right shoulder: the cream inner garment on the shoulder, a darker fold where the robe ends
  B(v, 'chest', -7, 34, -4, -5, 36, 3, P.INNER); B(v, 'chest', -6, 37, -3, -5, 37, 2, P.INNER); B(v, 'chest', -4, 32, 3, -4, 37, 3, P.ROBE_D);
  arms(v, P, { armR: P.INNER, foreL: P.ROBE, cuffL: P.ROBE_D });
  // the right forearm in wraps (two tie lines) under the end of the cream sleeve
  B(v, 'foreR', -9, 22, -2, -7, 29, 0, P.WRAP); B(v, 'foreR', -9, 24, -2, -7, 24, 0, P.WRAP_D); B(v, 'foreR', -9, 27, -2, -7, 27, 0, P.WRAP_D);
  B(v, 'foreR', -10, 28, -2, -7, 29, 1, P.INNER);
  sword(v, P, P.IRON, P.SASH, P.SASH_L);
  // the red blindfold widened down over the bridge of the nose (the user's edit)
  skull(v, P, P.RED, P.RED_D, true);
  // the hair: the scalp white above the band and at the back; a shell one cell out over crown, back and sides; a straight fringe
  v.paint(c => (c.part === 'head' && c.c === P.SKIN && (c.y >= 52 || (c.z <= -4 && c.y >= 44)) ? P.HAIR : null));
  B(v, 'head', -5, 56, -5, 4, 56, 4, P.HAIR); B(v, 'head', -3, 57, -3, 2, 57, 2, P.HAIR);
  B(v, 'head', -5, 44, -7, 4, 55, -7, P.HAIR); B(v, 'head', -2, 44, -7, -2, 55, -7, P.HAIR_D); B(v, 'head', 1, 44, -7, 1, 55, -7, P.HAIR_D); B(v, 'head', -6, 47, -7, 5, 51, -7, P.RED);
  B(v, 'head', -7, 52, -5, -7, 55, 4, P.HAIR); B(v, 'head', 6, 52, -5, 6, 55, 4, P.HAIR);
  B(v, 'head', -5, 52, 6, 4, 55, 6, P.HAIR); B(v, 'head', -3, 52, 6, -3, 53, 6, P.HAIR_D); B(v, 'head', 2, 52, 6, 2, 53, 6, P.HAIR_D);
  // long locks framing the face below the band, down past the jaw (outer strand longer than the inner, straight vertical ends)
  for (const s of [1, -1]) { const xo = s > 0 ? 7 : -8, xi = s > 0 ? 6 : -7;
    B(v, 'head', xo, 37, 0, xo, 47, 4, P.HAIR); B(v, 'head', xi, 40, 1, xi, 47, 4, P.HAIR); B(v, 'head', xo, 37, 0, xo, 38, 4, P.HAIR_D); }
  // the high ponytail (three joints) tied with red
  B(v, 'hat', -2, 55, -9, 1, 58, -6, P.RED); B(v, 'hat', -2, 55, -9, 1, 55, -6, P.RED_D);
  B(v, 'hrA1', -3, 46, -11, 2, 58, -10, P.HAIR); B(v, 'hrA1', -3, 46, -11, -3, 58, -10, P.HAIR_D);
  B(v, 'hrA2', -2, 35, -11, 1, 45, -10, P.HAIR); B(v, 'hrA2', -2, 35, -11, -2, 45, -10, P.HAIR_D);
  B(v, 'hrA3', -1, 25, -11, 0, 34, -10, P.HAIR); B(v, 'hrA3', -1, 25, -11, 0, 26, -10, P.HAIR_D);
  tails(v, P.RED, P.RED_D);
  return v;
}

// ================================================================== 斗笠 (the other look in 设置)
// the 7 cm 斗笠's dress at 3.5 cm: slate robe, linen forearms with leather bracers, linen leg wraps, straw-soled sandals, a red cord at the
// sash, a black-lacquer scabbard at the left hip, black hair under the hat, the white blindfold and its tails; the straw hat as big flat
// tiers (a rounded square of three steps for the brim, never a stepped diagonal edge), its outer rim a shade darker
const HAT = { ...C, ROBE: 0x3c4654, ROBE_L: 0x5a6678, ROBE_D: 0x272e38, INNER: 0xe8e2d4, SASH: 0x1e1a1c, SASH_L: 0x34303a, WRAP: 0x9c9486, WRAP_D: 0x6e685e,
  SKIN: 0xd9a883, SKIN_D: 0xb48a6a, HAIR: 0x1e1c22, HAIR_D: 0x2e2c34, TROU: 0x23252c, BOOT: 0x5a3c28, BOOT_L: 0x6e4c34, RED: 0xb8302a, RED_D: 0x7a1e1a };
const STRAW = 0xc9a457, STRAW_D = 0x8e6e34, STRAW_L = 0xe2c078, BAND = 0xeee8da, BAND_D = 0xb8b0a0, LEATH = 0x5a3c28, LACQ = 0x1e1a1c, BRONZE = 0xb8893a;
export function buildHatFine(): VoxChar {
  const v = new VoxChar(CELL / 2), P = HAT as unknown as Pal;
  skeleton(v); legs(v, P, { sole: STRAW_D, shinTop: 11 }); torso(v, P);
  // the red cord hanging from the sash, and the black-lacquer scabbard at the left hip, lying back along it with bronze fittings
  B(v, 'hips', 2, 18, 4, 2, 25, 4, P.RED); B(v, 'hips', 3, 22, 4, 3, 25, 4, P.RED);
  B(v, 'hips', 6, 23, -18, 7, 24, 1, LACQ); B(v, 'hips', 6, 23, 1, 7, 24, 1, BRONZE); B(v, 'hips', 6, 23, -18, 7, 24, -18, BRONZE);
  arms(v, P, { armR: P.ROBE, foreL: P.WRAP, cuffL: P.WRAP });
  // linen forearms with leather bracers at the wrists
  B(v, 'foreR', -9, 22, -2, -7, 29, 0, P.WRAP); B(v, 'foreR', -9, 22, -2, -7, 25, 0, LEATH);
  B(v, 'foreL', 6, 22, -2, 9, 23, 1, null); B(v, 'foreL', 6, 22, -2, 8, 25, 0, LEATH);
  sword(v, P, BRONZE, LEATH, 0x4a3020);
  // the white blindfold (one band, its knot and two tails), black hair at the back and under the hat, a low knot at the nape
  skull(v, P, BAND, BAND_D, false);
  v.paint(c => (c.part === 'head' && c.c === P.SKIN && (c.y >= 52 || (c.z <= -4 && c.y >= 44)) ? P.HAIR : null));
  B(v, 'head', -5, 44, -7, 4, 51, -7, P.HAIR); B(v, 'head', -6, 47, -7, 5, 51, -7, BAND); B(v, 'head', -2, 47, -8, 1, 52, -8, BAND);
  B(v, 'head', -2, 41, -9, 1, 46, -7, P.HAIR);
  tails(v, BAND, BAND_D);
  // the hat: the brim (two cells thick, a rounded square of three steps), the crown narrowing in three flat tiers, a small top
  const brim = (y0: number, y1: number, c: number) => { B(v, 'hat', -18, y0, -12, 17, y1, 11, c); B(v, 'hat', -15, y0, -15, 14, y1, 14, c); B(v, 'hat', -12, y0, -18, 11, y1, 17, c); };
  brim(52, 53, STRAW);
  v.paint(c => (c.part === 'hat' && c.y === 52 && (!v.get(c.x + 1, 52, c.z) || !v.get(c.x - 1, 52, c.z) || !v.get(c.x, 52, c.z + 1) || !v.get(c.x, 52, c.z - 1)) ? STRAW_D : null));
  B(v, 'hat', -10, 54, -7, 9, 55, 6, STRAW); B(v, 'hat', -7, 54, -10, 6, 55, 9, STRAW);
  B(v, 'hat', -6, 56, -5, 5, 57, 4, STRAW_L); B(v, 'hat', -5, 56, -6, 4, 57, 5, STRAW_L);
  B(v, 'hat', -3, 58, -3, 2, 59, 2, STRAW_L); B(v, 'hat', -1, 60, -1, 0, 60, 0, STRAW_D);
  return v;
}

/** the fine white-haired heroine: same joints as slim_white, so every move plays; tip = the blade's length in her cells */
export const FINE_WHITE: ModelDef = { id: 'fine_white', name: '白发', group: '职业', role: '蒙眼女刀客', line: '', kind: 'biped', attack: 'dual', tip: 38, build: buildWhiteFine };
/** the 斗笠 look at 3.5 cm (the other choice in 设置) */
export const FINE_HAT: ModelDef = { id: 'fine_hat', name: '斗笠', group: '职业', role: '蒙眼女刀客', line: '', kind: 'biped', attack: 'dual', tip: 38, build: buildHatFine };
