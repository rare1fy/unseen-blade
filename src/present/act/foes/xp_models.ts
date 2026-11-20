// 第三关 · 下邳寒沼（11-18）的敌人模型：吕布军残部和封鸩手下的死士。3.5 厘米细格子，写法照 hj_models.ts（公用小件在 fine_kit.ts）。
// 和前两关一眼分开：黄巾是头顶一大块黄、黄土色短褐；洛阳兵是铁灰札甲 + 暗红；下邳是黑 / 灰蓝 / 素白、湿、冷——死士一身黑、毒针手灰蓝袍
// 戴一顶平顶宽檐笠（俯视镜头下就是一块大方盘）、寒毒术士素白长袍高冠、水鬼赤膊青白皮披着湿头发、狱卒魁梧背着木枷甩一条长铁链、
// 降卒褪色的旧号衣裹着草帘。吕布军只在缨、绳上留一点暗红。每种的样子交代它怎么打：死士两把短匕、毒针手一根长吹筒、术士杖头一个冰白
// 药葫芦、水鬼三股叉、狱卒链头一颗方铁锤、封鸩指间三根银针和一把小弯刀。
// 骨骼名字、父子关系照 hj_models 的人形（skel()），通用的待机 / 跑 / 挨打 / 吼直接能播；专用动作在 xp_poses.ts（POSE_AFTER）。
// 新加的骨骼：狱卒的链子分五节（chain1..chain5，挂在 weapon 下：待机时拖在地上、抡起来时甩直）；封鸩的三根银针各一节（needle1..3，挂在
// weapon 下，姿势里扇开——一根根是直的，扇开靠转骨骼，不走斜线台阶）、腰上的药葫芦（gourd，挂 hips）和饮毒时手里那只（gourdH，挂
// handR，平时藏着）、二阶段的霜（frost 挂 chest：肩胸一层冰壳；frostAL / frostAR 挂上臂、frostFL / frostFR 挂袖子，姿势里跟着 frost
// 一起藏 / 露。冰壳都比身体外扩一格，不和身体同格）。
import { type Col } from '../../look/voxkit';
import { type V } from '../../bestiary/kit';
import { fine, B, cbox, cbox2, plate, SIDES, MX, skel, face, hair, def, HAIR, MOUTH } from './fine_kit';

// ------------------------------------------------------------------ palette (每种材料 2～3 档；冷色)
const BLK = 0x1e2026, BLK_D = 0x131418, BLK_L = 0x30343c;
const SLATE = 0x4e5e70, SLATE_D = 0x37434f, SLATE_L = 0x6c7e92;
const SILV = 0xc4ccd8, SILV_D = 0x8a94a4;
const ICE = 0x9ad8f8, ICE_L = 0xdff2fc;
const FROST = 0xe6f2f8, FROST_D = 0xb6d4e6;
const STEEL = 0xd8e2ea, STEEL_D = 0x8a96a4, IRON = 0x464b54, IRON_L = 0x666c78, IRON_D = 0x2e3238;
/** cold skin: the living foes are pale with cold; the 水鬼 and 封鸩 have their own (青白) */
const CSK = 0xbc9884, CSK_D = 0x8e6e5e;
const RUST = 0x7a2c28, RUST_D = 0x561e1c;

// ------------------------------------------------------------------ shared pieces
/** soft cloth shoes (a dark sole row, the shoe, the toe a row lower) and wrapped shins (a darker band under the knee, the shoe's top
 *  row); the shin a cell in from the thigh's outer side (the knee bend turns it about x: their faces must not share a plane) */
function softLegs(v: V, o: { x0: number; x1: number; z0: number; z1: number; knee: number; hip: number; trou: Col; shoe: Col; shoeD: Col; wrap: Col; wrapD: Col; toe: number }) {
  const mid = Math.floor((4 + o.knee - 2) / 2);
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, o.x0, o.x1), [sa, sb] = MX(s, o.x0, o.x1 - 1), f = 'foot' + L, zs = o.z1 - 1;
    B(v, f, a, 0, o.z0, b, 0, o.toe, o.shoeD).box(a, 1, o.z0, b, 1, o.toe, o.shoe).box(sa, 2, o.z0, sb, 3, o.toe - 1, o.shoe);
    B(v, 'shin' + L, sa, 4, o.z0, sb, o.knee - 1, zs, o.wrap).box(sa, 4, o.z0, sb, 4, zs, o.shoe).box(sa, o.knee - 2, o.z0, sb, o.knee - 2, zs, o.wrapD);
    if (o.knee >= 10) v.box(sa, mid, o.z0, sb, mid, zs, o.wrapD);
    B(v, 'leg' + L, a, o.knee, o.z0, b, o.hip - 1, o.z1, o.trou);
  }
}
/** a fist round a grip: the hand box with the grip's two columns × two rows cut through it (the weapon's cells fill the hole) */
function fist(v: V, part: string, x0: number, x1: number, gx0: number, gx1: number, y0: number, y1: number, gy: number, c: Col, cD: Col, outer: number) {
  B(v, part, x0, y0, -1, x1, y1, 2, c).box(outer, y0, -1, outer, y1 - 1, 2, cD).box(gx0, gy, -1, gx1, gy + 1, 2, null);
}
/** an octagonal block round the z axis (x0..x1 × y0..y1, its four long edges cut): gourds, hammer heads */
function oct(v: V, part: string, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: Col, g = 0) {
  v.part(part);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (!((x === x0 || x === x1) && (y === y0 || y === y1))) v.box(x, y, z0, x, y, z1, c, g);
}

// ------------------------------------------------------------------ 覆面影刃（死士）: thin, all in black, a black cloth over the face, two short knives
function assassin(elite: boolean): V {
  const v = fine(), TRIM = elite ? SILV : BLK_L, SASH = elite ? SILV_D : SLATE_D, BAND = elite ? SLATE : BLK_L, g = elite ? 1 : 0;
  skel(v, { hip: 20, spine: 24, chest: 30, neck: 37, head: 39, jaw: [42, 3], hat: 51, cape: [35, -5], sh: [10, 36, 0], fore: 29, hand: 22,
    weapon: [-10, 19, 1], offhand: [10, 19, 1], leg: 4, knee: 10 });
  softLegs(v, { x0: 2, x1: 5, z0: -2, z1: 2, knee: 10, hip: 20, trou: BLK, shoe: BLK_D, shoeD: 0x0c0d10, wrap: BLK_L, wrapD: BLK, toe: 4 });
  // the short jacket's skirt on the thighs (gently flared A-line hem)
  for (const [L, s] of SIDES) { const [a, b] = MX(s, 0, 7), [fa, fb] = MX(s, 0, 8); B(v, 'leg' + L, a, 16, -4, b, 19, 3, BLK); B(v, 'leg' + L, fa, 14, -4, fb, 15, 3, BLK).box(fa, 14, -4, fb, 14, 3, TRIM); }
  // hips, cinched waist & sloped agile shoulders
  cbox2(v, 'hips', -7, 20, -4, 6, 21, 3, BLK, 2); cbox2(v, 'hips', -8, 22, -5, 7, 23, 4, SASH, 2); B(v, 'hips', -6, 21, 5, -4, 23, 5, SASH);
  cbox2(v, 'spine', -6, 24, -4, 5, 29, 3, BLK, 2); cbox2(v, 'chest', -8, 30, -4, 7, 35, 3, BLK, 2); cbox2(v, 'chest', -6, 36, -3, 5, 36, 2, BLK_L, 2);
  // 交领: the crossed edge one cell proud down to the sash, a ring round the neck on the shoulders
  B(v, 'chest', 1, 30, 4, 2, 36, 4, TRIM).box(-3, 36, -3, 2, 36, 2, TRIM); B(v, 'spine', 1, 24, 4, 2, 29, 4, TRIM);
  B(v, 'neck', -2, 37, -2, 1, 38, 1, BLK).box(-2, 37, -2, 1, 37, 1, BLK_D);
  // arms: sloped narrow agile sleeves; ELITE gets dark-iron shoulder guards + jagged shadow half-cape!
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 8, 11), [fa, fb] = MX(s, 8, 10), ox = s > 0 ? 11 : -12;
    B(v, 'arm' + L, a, 29, -2, b, 35, 1, BLK).box(a, 35, -2, b, 35, 1, BLK_L).box(ox, 35, -2, ox, 35, 1, null);
    if (elite) {
      const [pa, pb] = MX(s, 8, 13);
      B(v, 'arm' + L, pa, 32, -3, pb, 36, 2, IRON).box(pa, 36, -3, pb, 36, 2, SILV).box(pa, 32, -3, pb, 32, 2, ICE, 1);
    }
    B(v, 'fore' + L, fa, 22, -1, fb, 28, 1, BLK).box(fa, 22, -1, fb, 24, 1, elite ? SILV_D : SLATE_D);
  }
  if (elite) {
    B(v, 'cape', -8, 16, -6, 7, 35, -5, BLK_D).box(-8, 16, -6, 7, 17, -5, SLATE_L);
    B(v, 'cape', -5, 16, -6, -3, 18, -5, null).box(2, 16, -6, 4, 18, -5, null);
  }
  fist(v, 'handL', 8, 10, 9, 10, 17, 21, 18, BLK_D, 0x0c0d10, 10);
  fist(v, 'handR', -11, -9, -11, -10, 17, 21, 18, BLK_D, 0x0c0d10, -11);
  // the knives (elite: longer frost-glow curved daggers!)
  for (const [part, s] of [['weapon', -1], ['offhand', 1]] as const) {
    const [ga, gb] = MX(s, 9, 10), bx = s > 0 ? 10 : -11, dl = elite ? 16 : 13;
    B(v, part, ga, 18, -2, gb, 19, 2, BLK_L).box(ga, 18, -3, gb, 19, -3, STEEL_D).box(ga, 17, 3, gb, 20, 3, elite ? SILV : STEEL_D);
    v.box(bx, 18, 4, bx, 18, dl, elite ? ICE_L : STEEL, g).box(bx, 18, dl - 1, bx, 18, dl, 0xeef4f8, g).box(bx, 19, 4, bx, 19, dl - 2, STEEL_D);
  }
  // sleek rounded-bevel masked head; ELITE gets horned dark-iron brow diadem + long glowing cyan tails!
  cbox2(v, 'head', -6, 41, -6, 5, 50, 5, BLK, 2);
  cbox2(v, 'head', -5, 39, -5, 4, 40, 5, BLK, 2);
  cbox2(v, 'head', -4, 51, -4, 3, 51, 3, BLK_L, 2);
  B(v, 'head', -4, 45, 5, 3, 46, 5, CSK_D).sym(2, 46, 5, elite ? ICE_L : 0xe4eef4, g);
  B(v, 'head', -1, 42, 6, 0, 44, 6, BLK);
  v.paint(q => (q.y === 48 && q.c === BLK ? BAND : null), 'head');
  if (elite) {
    B(v, 'head', -5, 48, 6, 4, 49, 6, SILV).box(-5, 50, 6, -4, 52, 6, ICE, 1).box(3, 50, 6, 4, 52, 6, ICE, 1).box(-1, 49, 6, 0, 51, 6, SILV);
  }
  B(v, 'head', -1, 52, -2, 0, 53, -1, BLK);
  B(v, 'head', -2, 43, -7, 1, 45, -7, BAND).box(-3, elite ? 28 : 34, -7, -2, 42, -7, elite ? ICE : BLK_L, g).box(1, elite ? 30 : 36, -7, 2, 42, -7, elite ? ICE : BLK_L, g);
  return v;
}

// ------------------------------------------------------------------ 寒针幽卒: a grey-blue robe, a flat wide-brimmed 笠, a long blowpipe, a needle pouch
function needler(elite: boolean): V {
  const v = fine(), R = 0x56687a, R_D = 0x3e4e5e, TRIM = elite ? SILV : R_D, HAT = 0x5e5a4c, HAT_D = 0x46433a, HAT_L = 0x767262, g = elite ? 1 : 0;
  skel(v, { hip: 20, spine: 24, chest: 30, neck: 38, head: 40, jaw: [44, 3], hat: 50, cape: [36, -6], sh: [12, 38, 1], fore: 30, hand: 22,
    weapon: [-12, 19, 1], offhand: [12, 19, 1], leg: 4, knee: 10 });
  softLegs(v, { x0: 2, x1: 5, z0: -2, z1: 2, knee: 10, hip: 20, trou: SLATE_D, shoe: BLK, shoeD: BLK_D, wrap: 0x5a5e62, wrapD: 0x44484c, toe: 4 });
  // the long robe's skirt on the thighs down to the shin (gently flared A-line hem)
  for (const [L, s] of SIDES) { const [a, b] = MX(s, 0, 8), [fa, fb] = MX(s, 0, 9); B(v, 'leg' + L, a, 12, -5, b, 19, 4, R); B(v, 'leg' + L, fa, 8, -5, fb, 11, 4, R).box(fa, 8, -5, fb, 8, 4, TRIM); }
  cbox2(v, 'hips', -8, 20, -5, 7, 21, 4, R, 2); cbox2(v, 'hips', -9, 22, -6, 8, 23, 5, BLK, 2); B(v, 'hips', 2, 21, 6, 4, 23, 6, BLK);
  // the needle pouch on the belt in front of the left thigh: leather, a darker flap, three needles standing out of it (elite: glowing)
  B(v, 'hips', 4, 15, 6, 7, 20, 7, 0x4a3e34).box(4, 20, 6, 7, 20, 7, 0x32281f).box(5, 21, 7, 5, 22, 7, elite ? ICE : STEEL, g).box(6, 21, 7, 6, 23, 7, elite ? ICE : STEEL, g);
  cbox2(v, 'spine', -7, 24, -5, 6, 29, 4, R, 2); cbox2(v, 'chest', -10, 30, -5, 9, 36, 4, R, 2); cbox2(v, 'chest', -8, 37, -4, 7, 37, 3, SLATE_L, 2);
  // 交领: the dark collar round the neck, the pale inner collar at the throat, the edge down the front to the belt
  B(v, 'chest', -4, 37, -4, 3, 37, 3, TRIM).box(-4, 36, 3, 1, 37, 4, 0xc8ccc8).box(2, 30, 4, 3, 37, 4, TRIM).box(2, 37, 3, 3, 37, 4, TRIM);
  B(v, 'spine', 2, 24, 4, 3, 29, 4, TRIM);
  B(v, 'neck', -2, 38, -2, 1, 39, 1, CSK).box(-2, 38, -2, 1, 38, 1, CSK_D);
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 9, 14), [fa, fb] = MX(s, 10, 13), ox = s > 0 ? 14 : -15;
    B(v, 'arm' + L, a, 30, -2, b, 37, 3, R).box(a, 37, -2, b, 37, 3, SLATE_L).box(a, 30, -2, b, 30, 3, R_D).box(ox, 37, -2, ox, 37, 3, null);
    B(v, 'fore' + L, fa, 22, -2, fb, 29, 2, R).box(fa, 22, -2, fb, 23, 2, TRIM);
  }
  B(v, 'handL', 11, 17, -1, 13, 21, 2, CSK).box(13, 17, -1, 13, 20, 2, CSK_D);
  fist(v, 'handR', -14, -12, -13, -12, 17, 21, 18, CSK, CSK_D, -14);
  // sculpted rounded-bevel head + tapered chin
  cbox2(v, 'head', -7, 42, -7, 6, 52, 6, CSK, 2);
  cbox2(v, 'head', -6, 40, -6, 5, 41, 6, CSK, 2);
  hair(v, { y: 44, back: -4, side: 5, front: 2, skin: CSK });
  face(v, { F: 6, eyes: [2, 3], eyeY: 44, brows: [2, 4], browY: 46, nose: [-1, 0], noseY: [42, 43], mouth: [-2, 1, 41], noseC: CSK_D });
  // sleek octagonal wide-brimmed flat 笠; ELITE gets wider black-lacquer double-tier silver ghost hat + hanging frost pendants + dark shoulder cloak!
  const hr = elite ? 14 : 12;
  cbox2(v, 'hat', -hr, 50, -hr, hr - 1, 50, hr - 1, elite ? BLK : HAT, 4);
  v.paint(q => (q.part === 'hat' && q.y === 50 && (!v.get(q.x + 1, 50, q.z) || !v.get(q.x - 1, 50, q.z) || !v.get(q.x, 50, q.z + 1) || !v.get(q.x, 50, q.z - 1)) ? (elite ? SILV : HAT_D) : null));
  cbox2(v, 'hat', -9, 51, -9, 8, 51, 8, elite ? BLK_L : HAT, 3); cbox2(v, 'hat', -8, 52, -8, 7, 53, 7, elite ? BLK : HAT, 2); cbox2(v, 'hat', -8, 52, -8, 7, 52, 7, elite ? SILV : HAT_D, 2); cbox2(v, 'hat', -6, 54, -6, 5, 54, 5, elite ? SILV : HAT_L, 2);
  if (elite) {
    B(v, 'hat', -2, 55, -2, 1, 57, 1, ICE, 1);
    for (const [px, pz] of [[-11, 5], [10, 5], [-11, -6], [10, -6]] as const) B(v, 'hat', px, 47, pz, px, 49, pz, ICE_L, 1);
    B(v, 'cape', -10, 16, -7, 9, 36, -6, BLK).box(-10, 16, -7, 9, 17, -6, SILV);
  }
  // the blowpipe through the fist: weathered bamboo 2 × 2 × 31, raised nodes, a dark mouthpiece behind the fist, a lacquered muzzle;
  // a short dark-red cord tied near the mouthpiece (吕布军's one touch of red)
  const BM = 0x7e8462, NODE = elite ? SILV : 0x5e6448;
  B(v, 'weapon', -13, 18, -6, -12, 19, 24, BM).box(-13, 18, -6, -12, 19, -5, 0x3a3a34).box(-13, 18, 23, -12, 19, 24, BLK);
  for (const z of [7, 15]) v.box(-14, 17, z, -11, 20, z, NODE);
  B(v, 'weapon', -13, 14, -3, -13, 17, -3, RUST).box(-13, 14, -3, -13, 14, -3, RUST_D);
  return v;
}

// ------------------------------------------------------------------ 凝霜毒吏: a plain white robe to the ground, a black belt, a tall cap, a staff topped with a gourd
function frostOfficer(elite: boolean): V {
  const v = fine(), R = 0xc8ccc8, R_D = 0x9ea6a8, R_L = 0xdcdedb, HEM = elite ? SILV_D : SLATE_D, COLLAR = elite ? SILV : BLK, MASK = 0xe2e4e0, MASK_D = 0xb4b8b6;
  skel(v, { hip: 20, spine: 24, chest: 30, neck: 38, head: 40, jaw: [44, 2], hat: 54, cape: [36, -6], sh: [11, 38, 1], fore: 30, hand: 22,
    weapon: [-11, 19, 1], offhand: [11, 19, 1], leg: 4, knee: 10 });
  v.bone('robe1', 'hips', 0, 21, 0).bone('robe2', 'robe1', 0, 14, 0).bone('robe3', 'robe2', 0, 6, 0);
  // Graceful articulated 3-tier A-line flared frost-white robe (robe1 -> robe2 -> robe3)
  cbox2(v, 'robe3', -12, 0, -10, 11, 5, 9, R, 3); cbox2(v, 'robe3', -12, 0, -10, 11, 1, 9, HEM, 3); cbox2(v, 'robe3', -12, 5, -10, 11, 5, 9, R_D, 3);
  cbox2(v, 'robe2', -10, 6, -8, 9, 13, 7, R, 2); cbox2(v, 'robe2', -10, 6, -8, 9, 6, 7, R_D, 2);
  cbox2(v, 'robe1', -8, 14, -6, 7, 20, 5, R, 2); cbox2(v, 'hips', -8, 21, -6, 7, 21, 5, R, 2); cbox2(v, 'hips', -9, 22, -7, 8, 23, 6, BLK, 2);
  for (const [L, s] of SIDES) { const [a, b] = MX(s, 2, 5); B(v, 'foot' + L, a, 0, 2, b, 0, 8, SLATE_D).box(a, 1, 2, b, 2, 8, BLK); }
  cbox2(v, 'spine', -7, 24, -6, 6, 29, 5, R, 2); cbox2(v, 'chest', -8, 30, -6, 7, 36, 5, R, 2); cbox2(v, 'chest', -6, 37, -5, 5, 37, 4, R_L, 2);
  B(v, 'neck', -2, 38, -2, 1, 39, 1, CSK).box(-2, 38, -2, 1, 38, 1, CSK_D);
  // the black collar band round the neck and down the front, a slate inner collar at the throat
  B(v, 'chest', -4, 37, -4, 3, 37, 3, COLLAR).box(-4, 36, 4, 1, 37, 5, SLATE).box(2, 30, 5, 4, 37, 5, COLLAR).box(2, 37, 4, 4, 37, 5, COLLAR);
  B(v, 'spine', 2, 24, 5, 4, 29, 5, COLLAR); B(v, 'hips', 2, 21, 5, 4, 21, 5, COLLAR); B(v, 'robe1', 2, 14, 5, 4, 20, 5, COLLAR);
  // a row of three small sealed jars on the belt at the right hip (the poisons), their lids darker
  for (const z of [-3, 0, 3]) B(v, 'hips', -11, 18, z, -10, 21, z + 1, 0x8a9aa4).box(-11, 22, z, -10, 22, z + 1, SLATE_D);
  // sloped shoulders + TRUE bell-flared wide sleeves with frosted cuffs
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 8, 13), [wa, wb] = MX(s, 8, 15), [ra, rb] = MX(s, 7, 16), ox = s > 0 ? 13 : -14;
    B(v, 'arm' + L, a, 30, -2, b, 37, 3, R).box(a, 37, -2, b, 37, 3, R_L).box(ox, 37, -2, ox, 37, 3, null);
    cbox2(v, 'fore' + L, a, 27, -3, b, 29, 4, R, 1);
    cbox2(v, 'fore' + L, wa, 22, -4, wb, 26, 5, R, 2);
    B(v, 'fore' + L, wa, 24, -4, wb, 24, 5, R_L);
    cbox2(v, 'fore' + L, ra, 22, -5, rb, 23, 6, FROST, 2); cbox2(v, 'fore' + L, ra, 23, -5, rb, 23, 6, ICE_L, 2);
    for (let x = ra + 2; x <= rb - 2; x += 2) v.box(x, 21, 6, x, 21, 6, FROST_D).box(x, 21, -5, x, 21, -5, FROST_D);
  }
  fist(v, 'handR', -13, -11, -12, -11, 17, 21, 18, CSK, CSK_D, -13);
  B(v, 'handL', 10, 17, -1, 12, 21, 2, CSK).box(12, 17, -1, 12, 20, 2, CSK_D);
  // lean sculpted scholar head (cbox2 + tapered chin) + protective cloth mask
  cbox2(v, 'head', -6, 42, -6, 5, 53, 5, CSK, 2);
  cbox2(v, 'head', -5, 40, -5, 4, 41, 5, CSK, 2);
  hair(v, { y: 44, back: -3, side: 4, front: 1, skin: CSK });
  face(v, { F: 5, eyes: [2, 3], eyeY: 45, brows: [2, 4], browY: 47, nose: [-1, 0], noseY: [43, 44], noseC: CSK_D });
  v.paint(q => (q.y <= 43 && q.z >= 1 ? MASK : null), 'head').paint(q => (q.y === 43 && (q.x <= -6 || q.x >= 5) ? MASK_D : null), 'head');
  // hair on the crown, the topknot, sleek tall black official cap; ELITE gets towering winged frost-crystal crown + frosted mantle!
  cbox2(v, 'head', -6, 52, -6, 5, 53, 5, HAIR, 2);
  cbox2(v, 'head', -3, 54, -3, 2, elite ? 63 : 60, 3, BLK, 1); cbox2(v, 'head', -3, elite ? 64 : 61, -3, 2, elite ? 64 : 61, 3, elite ? ICE_L : BLK_L, 1, elite ? 1 : 0);
  B(v, 'head', -6, 57, 0, 5, 57, 0, elite ? ICE : SILV_D, elite ? 1 : 0);
  if (elite) {
    // Winged frost-crystal crown spires + icy flowing back mantle (`cape`)!
    B(v, 'head', -6, 58, 0, -4, 63, 1, ICE, 1).box(3, 58, 0, 5, 63, 1, ICE, 1).box(-1, 65, -1, 0, 67, 0, ICE_L, 1);
    B(v, 'cape', -10, 12, -8, 9, 36, -7, SLATE_D).box(-10, 12, -8, 9, 14, -7, ICE_L, 1).box(-10, 34, -8, 9, 36, -7, FROST);
  }
  // the staff: a dark haft through the fist, an iron butt; the gourd on its head (a cord ring, a big lower bulb, a waist, the upper bulb,
  // the stopper glowing cold blue — elite: a glowing band round the bulb too)
  const WD = 0x5a4a3c, GD = 0xdcecf4, GD_D = 0xa8c8dc;
  B(v, 'weapon', -12, 18, -14, -11, 19, 29, WD).box(-12, 18, -15, -11, 19, -15, SLATE_D).box(-13, 17, 29, -10, 20, 30, 0x3e3226);
  oct(v, 'weapon', -14, 16, -9, 21, 31, 36, GD); oct(v, 'weapon', -14, 16, -9, 21, 31, 31, GD_D);
  if (elite) oct(v, 'weapon', -14, 16, -9, 21, 34, 34, ICE, 1);
  v.box(-12, 18, 37, -11, 19, 37, GD_D); oct(v, 'weapon', -13, 17, -10, 20, 38, 40, GD); v.box(-12, 18, 41, -11, 19, 42, ICE, 1);
  return v;
}

// ------------------------------------------------------------------ 沉江恶鬼（水鬼）: bare to the waist, skin soaked blue-white, wet hair down to the shoulders, weed round the waist, a 三股叉
const DSK = 0x92a8a2, DSK_D = 0x6a807a, DSK_L = 0xb0c2bc, WEED = 0x3c5a3a, WEED_D = 0x283e28, WET = 0x283034, WET_D = 0x1c2226, WHAIR = 0x161c20;
function diver(elite: boolean): V {
  const v = fine(), g = elite ? 1 : 0;
  skel(v, { hip: 20, spine: 24, chest: 30, neck: 38, head: 40, jaw: [44, 4], hat: 54, cape: [36, -6], sh: [13, 38, 1], fore: 30, hand: 22,
    weapon: [-13, 19, 1], offhand: [13, 20, 1], leg: 5, knee: 10 });
  // bare feet and shins (the shin a cell in from the thigh on both sides), wet trousers torn off above the knee: a darker water line at
  // the hem, a strip torn out of each front hem (in a different place each side)
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 2, 7), [sa, sb] = MX(s, 3, 6), f = 'foot' + L;
    B(v, f, sa, 0, -2, sb, 0, 5, DSK_D).box(sa, 1, -2, sb, 3, 4, DSK).box(sa, 1, 5, sb, 1, 5, DSK);
    B(v, 'shin' + L, sa, 4, -2, sb, 9, 2, DSK).box(sa, 9, -2, sb, 9, 2, DSK_D);
    B(v, 'leg' + L, a, 10, -2, b, 19, 3, WET).box(a, 10, -2, b, 12, 3, WET_D);
    // weed strands hanging down the front and the outer side of the thigh, one cell proud (on the thigh: a stride carries them)
    const fx = s > 0 ? [3, 6] : [-4, -7], ox = s > 0 ? 8 : -9;
    for (const x of fx) v.box(x, 13, 4, x, 19, 4, WEED).box(x, 13, 4, x, 13, 4, WEED_D);
    v.box(ox, 12, 0, ox, 19, 0, WEED).box(ox, 12, 0, ox, 12, 0, WEED_D);
  }
  B(v, 'legL', 4, 10, 3, 5, 11, 3, null); B(v, 'legR', -4, 10, 3, -3, 12, 3, null);
  // hips; the weed wound round the waist (two rows one cell proud, darker turns), strands down the back
  cbox(v, 'hips', -8, 20, -6, 7, 21, 5, WET); cbox(v, 'hips', -9, 22, -7, 8, 23, 6, WEED); B(v, 'hips', -9, 23, -7, 8, 23, 6, WEED_D);
  for (const x of [-6, -2, 2, 5]) B(v, 'hips', x, 17, -7, x, 21, -7, WEED).box(x, 17, -7, x, 17, -7, WEED_D);
  // lean sculpted bare torso (V-taper waist + sloped shoulders)
  cbox2(v, 'spine', -7, 24, -6, 6, 29, 5, DSK, 2); cbox2(v, 'chest', -10, 30, -6, 9, 36, 5, DSK, 2); cbox2(v, 'chest', -8, 37, -5, 7, 37, 4, DSK_L, 2);
  B(v, 'chest', -7, 33, 5, 6, 33, 5, DSK_D).box(-1, 30, 5, 0, 32, 5, DSK_D);
  for (const y of [30, 32]) B(v, 'chest', -9, y, 4, -8, y, 4, DSK_D).box(7, y, 4, 8, y, 4, DSK_D);
  B(v, 'spine', -1, 25, 5, 0, 29, 5, DSK_D);
  B(v, 'neck', -2, 38, -2, 1, 39, 1, DSK).box(-2, 38, -2, 1, 38, 1, DSK_D);
  // bare arms with sloped shoulder caps
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 10, 15), [fa, fb] = MX(s, 11, 14), ox = s > 0 ? 15 : -16;
    B(v, 'arm' + L, a, 30, -2, b, 37, 3, DSK).box(a, 37, -2, b, 37, 3, DSK_L).box(ox, 37, -2, ox, 37, 3, null);
    B(v, 'fore' + L, fa, 22, -2, fb, 29, 2, DSK);
  }
  B(v, 'foreR', -16, 22, -3, -11, 23, 3, WEED).box(-16, 23, -3, -11, 23, 3, WEED_D);
  // a clawed left hand (three fingers hanging under the palm, darker nails); the right fist round the haft
  B(v, 'handL', 12, 18, -1, 14, 21, 2, DSK).box(12, 16, 2, 12, 17, 2, DSK_D).box(13, 16, 2, 13, 17, 2, DSK_D).box(14, 16, 2, 14, 17, 2, DSK_D);
  fist(v, 'handR', -15, -13, -14, -13, 17, 21, 18, DSK, DSK_D, -15);
  // sculpted rounded-bevel drowned head + seamless flowing wet hair curtain (no clunky front sticks!)
  cbox2(v, 'head', -8, 42, -8, 7, 53, 7, DSK, 2);
  cbox2(v, 'head', -7, 40, -7, 6, 41, 7, DSK, 2);
  hair(v, { y: 43, back: -5, side: 6, front: 2, c: WHAIR, skin: DSK });
  face(v, { F: 7, eyes: [2, 3], eyeY: 46, brows: [2, 5], browY: 48, nose: [-1, 0], noseY: [44, 45], noseC: DSK_D });
  if (elite) v.part('head').symBox(2, 46, 7, 3, 47, 7, ICE_L, 1);
  B(v, 'head', -2, 41, 7, 1, 42, 7, 0x1a1414);
  cbox2(v, 'head', -8, 52, -8, 7, 53, 7, WHAIR, 2); cbox2(v, 'head', -6, 54, -6, 5, 54, 5, WHAIR, 2);
  B(v, 'head', -7, 38, -9, 6, 52, -9, WHAIR).box(-7, 38, -9, 6, 38, -9, 0x232c30);
  for (const x of [-9, 8]) B(v, 'head', x, 40, -5, x, 51, 3, WHAIR).box(x, 40, -5, x, 40, 3, 0x232c30);
  if (elite) {
    // Elite 寒渊水煞: jagged frost-bone horns on brow + sunken iron shoulder chains & ragged sea-weed shroud!
    B(v, 'head', -7, 53, 4, -5, 57, 6, ICE, 1).box(-8, 57, 5, -7, 60, 6, ICE_L, 1);
    B(v, 'head', 4, 53, 4, 6, 57, 6, ICE, 1).box(6, 57, 5, 7, 60, 6, ICE_L, 1);
    B(v, 'cape', -9, 14, -8, 8, 36, -7, WEED_D).box(-9, 14, -8, 8, 16, -7, ICE, 1);
    for (const [L, s] of SIDES) { const [pa, pb] = MX(s, 11, 16); B(v, 'arm' + L, pa, 34, -3, pb, 38, 4, IRON).box(pa, 38, -3, pb, 38, 4, ICE, 1); }
  }
  // the 三股叉: a dark wet haft through the fist, an iron butt, weed bound round the socket; the iron crossbar flat (one cell thick), three
  // flat prongs on it (the middle one longer), each side prong with a barb turned out at its tip (elite: silver, a glowing ring)
  const HT = 0x3c3a34, FI = elite ? SILV : IRON, FI_L = elite ? 0xeef4f8 : IRON_L;
  B(v, 'weapon', -14, 18, -12, -13, 19, 34, HT).box(-14, 18, -13, -13, 19, -13, IRON_D);
  B(v, 'weapon', -15, 17, 30, -12, 20, 33, WEED).box(-15, 17, 33, -12, 20, 33, WEED_D);
  if (elite) v.box(-15, 17, 34, -12, 20, 34, ICE, 1);
  B(v, 'weapon', -14, 18, 35, -13, 19, 36, FI).box(-19, 18, 37, -8, 19, 38, FI);
  for (const [x0, x1, z1] of [[-19, -18, 45], [-14, -13, 48], [-9, -8, 45]]) v.box(x0, 18, 39, x1, 18, z1, FI).box(x0, 19, 39, x1, 19, 40, FI).box(x0, 18, z1, x1, 18, z1, FI_L);
  v.box(-20, 18, 43, -20, 18, 45, FI).box(-7, 18, 43, -7, 18, 45, FI);
  void g;
  return v;
}

// ------------------------------------------------------------------ 枷铁狱吏: a big man in a leather apron, iron bracers, a 木枷 on his back, a long chain with a square iron hammer
const LEA = 0x4a3a2e, LEA_D = 0x33281f, LEA_L = 0x63503e, PLANK = 0x6e5638, PLANK_D = 0x50402a;
function jailer(elite: boolean): V {
  const v = fine(), TUN = 0x3a424c, TUN_D = 0x2a3038, TROU = 0x343a40, BOOT = 0x262422, BOOT_L = 0x3a3632, BR = elite ? SILV : IRON, BR_L = elite ? 0xeef2f6 : IRON_L, BD = 0x2a2420;
  skel(v, { hip: 18, spine: 24, chest: 32, neck: 42, head: 44, jaw: [48, 4], hat: 60, cape: [40, -8], sh: [21, 42, 1], fore: 32, hand: 22,
    weapon: [-21, 19, 1], offhand: [21, 19, 1], leg: 7, knee: 10 });
  // boots (a lighter cuff, the shin a cell in on both sides), dark trousers
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 2, 11), [sa, sb] = MX(s, 3, 10), f = 'foot' + L;
    B(v, f, a, 0, -4, b, 0, 7, 0x161412).box(a, 1, -4, b, 1, 6, BOOT).box(sa, 2, -4, sb, 3, 6, BOOT);
    B(v, 'shin' + L, sa, 4, -4, sb, 9, 4, BOOT).box(sa, 8, -4, sb, 9, 4, BOOT_L);
    B(v, 'leg' + L, a, 10, -4, b, 17, 5, TROU);
    // the apron's lower half on each thigh (a stride opens it), its hem darker
    const [pa, pb] = MX(s, 1, 10); B(v, 'leg' + L, pa, 8, 6, pb, 17, 6, LEA).box(pa, 8, 6, pb, 8, 6, LEA_D);
  }
  // hips; a black belt one cell proud with an iron ring at the front; the apron's top on the hips
  cbox(v, 'hips', -14, 18, -8, 13, 21, 7, TROU); cbox(v, 'hips', -15, 22, -9, 14, 23, 8, BLK); B(v, 'hips', -2, 21, 9, 1, 24, 9, BR).box(-1, 22, 9, 0, 23, 9, null);
  B(v, 'hips', -11, 18, 8, 10, 21, 8, LEA);
  // V-taper waist + sloped hulking shoulders in sleeveless tunic & leather apron
  cbox2(v, 'spine', -13, 24, -8, 12, 31, 7, TUN, 2); cbox2(v, 'chest', -16, 32, -8, 15, 40, 7, TUN, 2); cbox2(v, 'chest', -13, 41, -7, 12, 41, 6, 0x4c5662, 2);
  B(v, 'chest', -16, 32, -8, 15, 32, 7, TUN_D);
  B(v, 'spine', -9, 24, 8, 8, 31, 8, LEA); B(v, 'chest', -8, 32, 8, 7, 37, 8, LEA).box(-8, 37, 8, 7, 37, 8, LEA_L);
  for (const x of [-8, 6]) B(v, 'chest', x, 38, 8, x + 1, 40, 8, LEA_D).box(x, 41, -7, x + 1, 41, 6, LEA_D);
  B(v, 'neck', -4, 42, -3, 3, 43, 2, CSK).box(-4, 42, -3, 3, 42, 2, CSK_D);
  // sloped bare muscular shoulders + iron bracers; ELITE gets massive spiked executioner iron pauldrons + hooded iron war-helm!
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 16, 25), [fa, fb] = MX(s, 17, 24), ox = s > 0 ? 25 : -26;
    B(v, 'arm' + L, a, 32, -4, b, 41, 5, CSK).box(a, 41, -4, b, 41, 5, 0x4c5662);
    B(v, 'arm' + L, ox, 40, -4, ox, 41, 5, null).box(s > 0 ? 24 : -25, 41, -4, s > 0 ? 24 : -25, 41, 5, null);
    if (elite) {
      const [pa, pb] = MX(s, 16, 27), spx = s > 0 ? 25 : -26;
      B(v, 'arm' + L, pa, 35, -6, pb, 42, 6, IRON_D).box(pa, 35, -6, pb, 35, 6, SILV).box(pa, 42, -5, pb, 42, 5, IRON_L);
      B(v, 'arm' + L, spx, 43, -1, spx + (s > 0 ? 1 : -1), 46, 1, ICE, 1);
    }
    B(v, 'fore' + L, fa, 26, -4, fb, 31, 4, CSK).box(a, 22, -5, b, 25, 5, BR).box(a, 25, -5, b, 25, 5, BR_L);
  }
  B(v, 'handL', 18, 16, -2, 24, 21, 4, CSK_D).box(24, 16, -2, 24, 20, 4, 0x6e5444);
  B(v, 'handR', -25, 16, -2, -19, 21, 4, CSK_D).box(-25, 16, -2, -25, 20, 4, 0x6e5444).box(-22, 18, -2, -21, 19, 4, null);
  // sculpted rounded-bevel shaven brute skull + clean crown dome & short tapered beard
  cbox2(v, 'head', -8, 46, -8, 7, 58, 7, CSK, 2);
  cbox2(v, 'head', -7, 44, -7, 6, 45, 7, CSK, 2);
  cbox2(v, 'head', -6, 59, -6, 5, 59, 5, CSK, 2);
  v.paint(q => (q.y >= 49 && q.y <= 51 && (q.z <= -5 || q.x <= -6 || q.x >= 5) && q.c === CSK ? 0x5a4a42 : null), 'head');
  face(v, { F: 7, eyes: [2, 3], eyeY: 50, brows: [2, 6], browY: 52, nose: [-2, 1], noseY: [47, 48], noseC: CSK_D });
  v.paint(q => (q.y <= 49 && q.y >= 44 && (q.x <= -6 || q.x >= 5) && q.z >= 0 ? BD : null), 'head');
  B(v, 'jaw', -6, 42, 6, 5, 45, 8, BD).box(-4, 41, 7, 3, 41, 8, BD).box(-2, 45, 8, 1, 45, 8, MOUTH).box(-5, 46, 8, 4, 46, 8, BD);
  if (elite) {
    // Elite 典狱刑官: iron executioner helm with crest & cheek plates!
    cbox2(v, 'head', -9, 53, -9, 8, 59, 8, IRON_D, 2); cbox2(v, 'head', -7, 60, -7, 6, 61, 6, IRON, 2);
    B(v, 'head', -9, 53, 8, 8, 53, 8, SILV).box(-2, 54, 9, 1, 63, 9, SILV).box(-1, 62, -4, 0, 64, 8, ICE, 1);
    for (const x of [-9, 8]) B(v, 'head', x, 46, -3, x, 52, 5, IRON_D).box(x, 46, -3, x, 46, 5, SILV);
  }
  // the 木枷 slung on his back, a cell clear of it: two planks (a dark seam down the middle), a dark rim, two iron bands, the neck hole
  // and the two wrist holes cut through; from above it is the big wooden board over his shoulders
  B(v, 'chest', -14, 28, -10, 13, 47, -9, PLANK);
  B(v, 'chest', -14, 28, -10, 13, 28, -9, PLANK_D).box(-14, 47, -10, 13, 47, -9, PLANK_D).box(-14, 28, -10, -14, 47, -9, PLANK_D).box(13, 28, -10, 13, 47, -9, PLANK_D);
  B(v, 'chest', -1, 29, -10, 0, 46, -10, PLANK_D);
  for (const y of [32, 43]) B(v, 'chest', -14, y, -11, 13, y, -11, BR);
  B(v, 'chest', -3, 37, -10, 2, 40, -9, null).box(-11, 38, -10, -8, 39, -9, null).box(7, 38, -10, 10, 39, -9, null);
  // the chain: an iron ring through the fist, then five joints of links (each link an open ring, the next one turned a quarter: from
  // above and from the side it reads link by link); the square hammer on the last joint — chamfered, two bands one cell proud, a stud on
  // each face (elite: silver bands, a glowing cold core in the studs)
  B(v, 'weapon', -22, 18, -2, -21, 19, 3, IRON_D);
  let flip = 0;
  for (let i = 0; i < 5; i++) {
    const bn = `chain${i + 1}`, z0 = 4 + i * 10;
    v.bone(bn, i === 0 ? 'weapon' : `chain${i}`, -21, 19, z0);
    for (let j = 0; j < 3; j++, flip ^= 1) {
      const z = z0 + j * 3, c = flip ? IRON : IRON_L;
      if (flip) B(v, bn, -22, 17, z, -21, 20, z + 3, c).box(-22, 18, z + 1, -21, 19, z + 2, null);
      else B(v, bn, -23, 18, z, -20, 19, z + 3, c).box(-22, 18, z + 1, -21, 19, z + 2, null);
    }
  }
  const HM = IRON, HM_D = IRON_D, BAND = elite ? SILV : IRON_L;
  B(v, 'chain5', -22, 18, 54, -21, 19, 54, HM_D);
  oct(v, 'chain5', -25, 15, -18, 22, 55, 62, HM); oct(v, 'chain5', -25, 15, -18, 22, 55, 55, HM_D);
  for (const z of [57, 60]) oct(v, 'chain5', -26, 14, -17, 23, z, z, BAND);
  const gs = elite ? 1 : 0, sc = elite ? ICE : IRON_D;
  B(v, 'chain5', -22, 23, 58, -21, 23, 59, sc, gs).box(-22, 14, 58, -21, 14, 59, sc, gs).box(-26, 18, 58, -26, 19, 59, sc, gs).box(-17, 18, 58, -17, 19, 59, sc, gs).box(-22, 18, 63, -21, 19, 63, sc, gs);
  return v;
}

// ------------------------------------------------------------------ 冻骨溃兵 (two looks): 吕布军's old coat faded to grey-brown, huddled in a straw cape / a torn blanket
function conscript(look: 0 | 1): V {
  const v = fine(), TUN = 0x6a5650, TUN_D = 0x4e3e3a, TROU = 0x4a4642, TROU_D = 0x383430;
  skel(v, { hip: 16, spine: 20, chest: 26, neck: 32, head: 34, jaw: [38, 2], hat: 46, cape: [30, -4], sh: [10, 32, 0], fore: 24, hand: 18,
    weapon: [-9, 15, 1], offhand: [10, 16, 0], leg: 4, knee: 8 });
  softLegs(v, { x0: 2, x1: 5, z0: -2, z1: 1, knee: 8, hip: 16, trou: TROU, shoe: 0x3a3028, shoeD: 0x2a221c, wrap: 0x6a645a, wrapD: 0x524c44, toe: 3 });
  // the coat's skirt on the thighs (a strip torn from each hem), a rope belt, the coat on waist and chest; the old red left only in the
  // collar and a patch (吕布军)
  B(v, 'legL', 0, 10, -4, 7, 15, 3, TUN).box(0, 10, -4, 7, 10, 3, TUN_D).box(4, 10, 3, 6, 11, 3, null);
  B(v, 'legR', -8, 10, -4, -1, 15, 3, TUN).box(-8, 10, -4, -1, 10, 3, TUN_D).box(-4, 10, 3, -2, 12, 3, null);
  cbox2(v, 'hips', -8, 16, -4, 7, 19, 3, TUN, 2); cbox2(v, 'hips', -8, 18, -4, 7, 18, 3, 0x7a6a50, 2);
  cbox2(v, 'spine', -7, 20, -4, 6, 25, 3, TUN, 2); cbox2(v, 'chest', -8, 26, -4, 7, 30, 3, TUN, 2); cbox2(v, 'chest', -6, 31, -3, 5, 31, 2, 0x7e6860, 2);
  B(v, 'chest', -4, 31, -3, 3, 31, 2, RUST).box(-3, 29, 4, 3, 31, 4, RUST).box(-2, 30, 4, 1, 31, 4, RUST_D);
  B(v, 'neck', -2, 32, -2, 1, 33, 1, CSK).box(-2, 32, -2, 1, 32, 1, CSK_D);
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 8, 11), [fa, fb] = MX(s, 8, 10), ox = s > 0 ? 11 : -12;
    B(v, 'arm' + L, a, 24, -2, b, 31, 1, TUN).box(a, 24, -2, b, 24, 1, TUN_D).box(ox, 31, -2, ox, 31, 1, null);
    B(v, 'fore' + L, fa, 18, -1, fb, 23, 1, TUN).box(fa, 18, -1, fb, 18, 1, TUN_D);
  }
  B(v, 'handL', 8, 14, -1, 10, 17, 1, CSK).box(10, 14, -1, 10, 16, 1, CSK_D);
  B(v, 'handR', -11, 13, -1, -8, 17, 2, CSK).box(-11, 13, -1, -11, 16, 2, CSK_D).box(-10, 14, -1, -9, 15, 2, null);
  cbox2(v, 'head', -6, 36, -6, 5, 45, 5, CSK, 2);
  cbox2(v, 'head', -5, 34, -5, 4, 35, 5, CSK, 2);
  face(v, { F: 5, eyes: [2, 3], eyeY: 38, brows: [2, 4], browY: 40, nose: [-1, 0], noseY: [36, 37], mouth: [-2, 1, 35], noseC: CSK_D });
  if (look === 0) {
    // a straw cape down the back (two tiers, the lower wider, a dark line at the foot of every tier of straw), tied at the throat
    const ST = 0x8a8264, ST_D = 0x6a6450;
    B(v, 'chest', -8, 22, -5, 7, 31, -5, ST); B(v, 'spine', -8, 20, -5, 7, 25, -5, ST);
    B(v, 'spine', -9, 16, -6, 8, 21, -6, ST);
    v.paint(q => (q.z <= -5 && (q.y === 16 || q.y === 22 || q.y === 26) ? ST_D : null), 'spine').paint(q => (q.z === -5 && (q.y === 26 || q.y === 29) ? ST_D : null), 'chest');
    B(v, 'chest', -2, 31, 4, 1, 31, 4, ST_D);
    // a faded red 幘 on the crown: a band a cell proud, the flat top, the knot behind; hair under it at the back and sides
    hair(v, { y: 38, back: -3, side: 4, front: 1, skin: CSK });
    for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) if ((x === -7 || x === 6 || z === -7 || z === 6) && !((x === -7 || x === 6) && (z === -7 || z === 6))) v.box(x, 42, z, x, 43, z, RUST_D);
    cbox(v, 'head', -6, 44, -6, 5, 46, 5, RUST); cbox(v, 'head', -4, 47, -4, 3, 47, 3, RUST_D);
    B(v, 'head', -2, 41, -8, 1, 44, -8, RUST_D);
    // 断矛: the haft snapped off behind the fist (a pale broken end), the socket and the spearhead
    B(v, 'weapon', -10, 14, -4, -9, 15, 19, 0x5a4636).box(-10, 14, -4, -9, 15, -4, 0xa08a66);
    B(v, 'weapon', -11, 13, 20, -8, 16, 21, IRON_D).box(-10, 14, 22, -9, 15, 28, STEEL_D).box(-10, 15, 22, -9, 15, 28, STEEL).box(-10, 14, 29, -9, 15, 30, STEEL);
  } else {
    // a torn grey-blue blanket round the shoulders and down the back (its hem cut in two even steps), a scarf over the mouth and chin
    const BL = 0x5a6670, BL_D = 0x434d56;
    B(v, 'chest', -8, 24, -5, 7, 31, -5, BL); B(v, 'spine', -8, 18, -5, 7, 25, -5, BL);
    B(v, 'spine', -8, 18, -5, -5, 19, -5, null).box(3, 18, -5, 7, 20, -5, null).box(-8, 20, -5, 7, 20, -5, BL_D);
    B(v, 'chest', -8, 31, -5, 7, 31, -5, BL_D);
    hair(v, { y: 37, back: -3, side: 4, front: 1, skin: CSK });
    cbox(v, 'head', -6, 44, -6, 5, 45, 5, HAIR); B(v, 'head', -2, 46, -2, 1, 47, 1, HAIR).box(-1, 48, -1, 0, 48, 0, BL_D);
    // the scarf: a ring round the neck and chin one cell proud of the face, its end down the chest
    v.paint(q => (q.y <= 36 && q.z >= 3 ? BL : null), 'head');
    B(v, 'head', -6, 34, 6, 5, 35, 6, BL_D); B(v, 'chest', 2, 26, 4, 3, 30, 4, BL).box(2, 26, 4, 3, 26, 4, BL_D);
    // 卷刃刀: a short dark grip, the ring pommel behind the fist, the blade whose last cells are bent down a row, two notches out of the edge
    B(v, 'weapon', -10, 14, -3, -9, 15, 3, 0x2a221c).box(-10, 13, -7, -9, 16, -4, 0x6a5a3a).box(-10, 14, -6, -9, 15, -5, null);
    B(v, 'weapon', -10, 12, 4, -9, 17, 4, 0x4a3e32).box(-10, 13, 5, -10, 15, 17, STEEL_D).box(-10, 13, 5, -10, 13, 17, STEEL);
    v.box(-10, 12, 18, -10, 14, 21, STEEL_D).box(-10, 12, 18, -10, 12, 21, STEEL).box(-10, 13, 9, -10, 13, 9, null).box(-10, 13, 14, -10, 13, 14, null);
  }
  return v;
}

// ------------------------------------------------------------------ 头目 · 截指鬼医 · 封鸩: towering Ghost-Physician Sovereign in frost-white & obsidian ceremonial robes, upturned high collar, sweeping frost-hemmed cloak, winged frost-crystal 进贤冠, 3-needle frost fan & hooked surgeon's blade
const FSK = 0xa8b6ae, FSK_D = 0x768880, FBD = 0x1c1c20;
/** an octagonal block round the y axis (x0..x1 × z0..z1, its four vertical edges cut), rows y0..y1: a gourd hanging */
const octY = (v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, g = 0) => cbox(v, part, x0, y0, z0, x1, y1, z1, c, g);
function boss(): V {
  const v = fine(), R = 0xd8dee2, R_D = 0xa8b4be, R_DD = 0x7e8c98, BAG = 0x36343a, JADE_D = 0x2a3c3c;
  skel(v, { hip: 22, spine: 26, chest: 32, neck: 40, head: 42, jaw: [45, 4], hat: 54, cape: [38, -6], sh: [10, 40, 0], fore: 31, hand: 22,
    weapon: [-11, 19, 2], offhand: [11, 19, 1], leg: 4, knee: 11 });
  // Grand 3-tier A-line flared frost-white & obsidian ceremonial robe (wider sovereign hem, crisp dark outer panels & silver trim)
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 0, 7), [ma, mb] = MX(s, 0, 8), [wa, wb] = MX(s, 0, 9), [ia, ib] = MX(s, 1, 7), p = 'leg' + L;
    const [oa1, ob1] = MX(s, 6, 7), [oa2, ob2] = MX(s, 7, 8), [oa3, ob3] = MX(s, 8, 9);
    B(v, p, a, 16, -5, b, 21, 4, R).box(oa1, 16, -5, ob1, 21, 4, BLK);
    B(v, p, ma, 11, -5, mb, 15, 5, R).box(oa2, 11, -5, ob2, 15, 5, BLK).box(ma, 15, -5, mb, 15, 5, R_D);
    B(v, p, wa, 6, -6, wb, 10, 5, R).box(oa3, 6, -6, ob3, 10, 5, BLK).box(wa, 6, -6, wb, 7, 5, BLK).box(wa, 8, -6, wb, 8, 5, SILV).box(oa3, 8, -6, ob3, 8, 5, ICE);
    B(v, p, ia, 5, -4, ib, 5, 3, R_DD);
  }
  softLegs(v, { x0: 2, x1: 5, z0: -2, z1: 2, knee: 11, hip: 22, trou: R_D, shoe: BLK, shoeD: BLK_D, wrap: 0xc2ccd4, wrapD: 0x92a0ac, toe: 5 });
  // Hips, ornate obsidian-silver sovereign belt, frost-jade vials & ceremonial front tabard (蔽膝)
  cbox2(v, 'hips', -7, 22, -5, 6, 25, 4, R, 2);
  cbox2(v, 'hips', -8, 24, -6, 7, 26, 5, BLK, 2);
  B(v, 'hips', -2, 24, 5, 1, 26, 5, SILV).box(-1, 25, 5, 0, 25, 5, ICE);
  // Crisp non-blooming frost-poison vials tucked along the belt
  for (const x of [-6, -4, 3, 5]) B(v, 'hips', x, 22, 5, x, 25, 5, BAG).box(x, 22, 6, x, 24, 6, ICE).box(x, 25, 6, x, 25, 6, SILV_D);
  // Ceremonial obsidian front tabard with silver border & frost-blue sigil
  B(v, 'hips', -2, 12, 6, 1, 23, 6, BLK).box(-2, 12, 6, 1, 12, 6, SILV).box(-1, 15, 6, 0, 18, 6, SLATE_L);
  // Broad imposing aristocratic torso, wide obsidian crossed collar (matching portrait) & dark outer mantle drape
  cbox2(v, 'spine', -7, 26, -5, 6, 31, 4, R, 2);
  cbox2(v, 'chest', -8, 32, -5, 7, 39, 4, R, 2);
  cbox2(v, 'chest', -6, 40, -4, 5, 40, 3, 0xe8eef2, 2);
  // Wide obsidian crossed lapel + silver inner trim + venomous-jade outer shoulder panels
  B(v, 'chest', -4, 39, -3, 3, 40, 3, BLK);
  B(v, 'chest', -3, 36, 4, 2, 39, 4, BLK).box(-2, 38, 4, 1, 39, 4, JADE_D).box(1, 32, 4, 3, 39, 4, BLK).box(0, 32, 4, 0, 39, 4, SILV);
  B(v, 'spine', 1, 26, 4, 3, 31, 4, BLK).box(0, 26, 4, 0, 31, 4, SILV);
  B(v, 'chest', -8, 33, -4, -6, 39, 3, BLK).box(5, 33, -4, 7, 39, 3, BLK).box(-8, 39, -4, -6, 39, 3, SILV_D).box(5, 39, -4, 7, 39, 3, SILV_D);
  // High upturned obsidian-and-silver standing sovereign collar framing his pale head
  B(v, 'chest', -7, 40, -6, 6, 45, -5, BLK).box(-7, 45, -6, 6, 45, -5, SILV).box(-5, 43, -5, 4, 44, -5, JADE_D);
  B(v, 'chest', -8, 40, -5, -7, 44, -2, BLK).box(-8, 44, -5, -7, 44, -2, SILV);
  B(v, 'chest', 6, 40, -5, 7, 44, -2, BLK).box(6, 44, -5, 7, 44, -2, SILV);
  B(v, 'neck', -2, 40, -2, 1, 41, 2, FSK).box(-2, 40, -2, 1, 40, 2, FSK_D);
  // Sweeping full-length obsidian & frost-hemmed sovereign cloak on cape bone
  B(v, 'cape', -10, 32, -7, 9, 39, -6, BLK).box(-10, 39, -7, 9, 39, -6, SILV);
  B(v, 'cape', -11, 18, -7, 10, 31, -6, BLK).box(-11, 18, -7, -11, 31, -6, SILV_D).box(10, 18, -7, 10, 31, -6, SILV_D);
  B(v, 'cape', -6, 18, -7, -5, 31, -7, BLK_D).box(4, 18, -7, 5, 31, -7, BLK_D);
  B(v, 'cape', -12, 6, -8, 11, 17, -6, BLK).box(-12, 6, -8, 11, 7, -6, BLK_D).box(-12, 8, -8, 11, 8, -6, ICE);
  B(v, 'cape', -12, 9, -8, -12, 17, -6, SILV_D).box(11, 9, -8, 11, 17, -6, SILV_D);
  // Broad obsidian-silver mantle pauldrons + dramatic bell-flared ceremonial silk sleeves
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 8, 11), [pa, pb] = MX(s, 7, 13), [wa, wb] = MX(s, 7, 14), ox = s > 0 ? 13 : -14;
    B(v, 'arm' + L, a, 31, -2, b, 39, 2, R);
    // Broad sculpted sovereign shoulder mantle (obsidian + silver ridge + icy-jade accent)
    B(v, 'arm' + L, pa, 35, -4, pb, 40, 3, BLK).box(pa, 40, -4, pb, 40, 3, SILV).box(ox, 40, -4, ox, 40, 3, null);
    B(v, 'arm' + L, pa, 35, -4, pb, 35, 3, JADE_D).box(ox, 37, -1, ox, 38, 0, ICE);
    cbox2(v, 'fore' + L, a, 28, -2, b, 30, 3, R, 1);
    cbox2(v, 'fore' + L, wa, 22, -4, wb, 27, 4, R, 2);
    cbox2(v, 'fore' + L, wa, 22, -4, wb, 24, 4, BLK, 2);
    B(v, 'fore' + L, wa + 1, 24, -4, wb - 1, 24, 4, SILV);
    B(v, 'fore' + L, wa + 1, 27, -4, wb - 1, 27, 4, R_D);
  }
  fist(v, 'handL', 9, 12, 10, 11, 18, 21, 19, FSK, FSK_D, 12);
  B(v, 'handR', -13, 18, -1, -10, 21, 2, FSK).box(-13, 18, -1, -13, 20, 2, FSK_D);
  // 寒霜银针: three longer gleaming frost-silver needles fanned between the fingers of the right hand
  for (let i = 0; i < 3; i++) {
    const x = -12 + i, bn = `needle${i + 1}`;
    v.bone(bn, 'weapon', x + 0.5, 19.5, 3);
    B(v, bn, x, 19, 3, x, 19, 13, STEEL).box(x, 19, 11, x, 19, 13, ICE_L);
  }
  // 截指弯刀: ornate obsidian-silver grip & longer hooked crescent surgeon's blade in the left fist
  B(v, 'offhand', 10, 19, -3, 11, 20, 2, BLK_L).box(10, 19, -4, 11, 20, -4, SILV);
  B(v, 'offhand', 10, 18, 3, 11, 21, 3, SILV).box(10, 19, 4, 10, 19, 11, STEEL).box(10, 20, 4, 10, 20, 11, STEEL_D);
  v.part('offhand').box(10, 16, 11, 10, 19, 12, ICE_L).box(10, 17, 10, 10, 18, 10, STEEL);
  // Sculpted gaunt aristocratic skull (faithful to fengzhen.png: pale sunken cheeks, widow's peak, sharp slanted eyes, sly thin moustache & pointed goatee)
  cbox2(v, 'head', -6, 44, -5, 5, 54, 5, FSK, 2);
  cbox2(v, 'head', -4, 42, -4, 3, 43, 5, FSK, 1);
  hair(v, { y: 47, back: -3, side: 4, front: 1, skin: FSK });
  // Widow's peak slick black hairline
  B(v, 'head', -1, 51, 5, 0, 52, 5, FBD).box(-5, 52, 5, 4, 53, 5, FBD);
  face(v, { F: 5, eyes: [1, 3], eyeY: 48, brows: [1, 4], browY: 50, nose: [-1, 0], noseY: [45, 47], noseC: FSK_D, browC: FBD });
  v.part('head').symBox(1, 47, 5, 3, 47, 5, FSK_D).symBox(4, 44, 5, 4, 46, 5, FSK_D).box(-1, 43, 5, 0, 43, 5, MOUTH);
  // Sly thin dark moustache + neat sharp pointed dark goatee (山羊胡)
  B(v, 'jaw', -3, 44, 6, -1, 44, 6, FBD).box(0, 44, 6, 2, 44, 6, FBD);
  B(v, 'jaw', -1, 39, 6, 0, 42, 6, FBD).box(-1, 38, 6, 0, 38, 6, FBD);
  // Towering Sovereign Physician Crown (进贤玄霜冠) mounted on `hat` bone (moves rigidly with head, preserves head Box3)
  cbox2(v, 'hat', -7, 52, -6, 6, 54, 6, BLK, 2);
  B(v, 'hat', -5, 53, 6, 4, 53, 6, SILV).box(-1, 53, 6, 0, 55, 6, ICE);
  cbox2(v, 'hat', -5, 55, -5, 4, 57, 4, BLK, 2);
  B(v, 'hat', -4, 58, -3, 3, 63, 3, BLK).box(-4, 63, -3, 3, 63, 3, SILV);
  // 3 sovereign silver ridges on crown front
  for (const rx of [-3, 0, 2]) B(v, 'hat', rx, 58, 3, rx, 62, 3, SILV);
  // Twin swept silver-ice wing crests flanking the crown
  B(v, 'hat', -8, 57, -2, -5, 62, 0, BLK).box(-8, 62, -2, -5, 63, 0, SILV).box(-8, 59, -1, -8, 62, -1, ICE);
  B(v, 'hat', 4, 57, -2, 7, 62, 0, BLK).box(4, 62, -2, 7, 63, 0, SILV).box(7, 59, -1, 7, 62, -1, ICE);
  // Long gleaming silver hairpin piercing the crown
  B(v, 'hat', -10, 57, -2, 9, 57, -2, SILV).box(-10, 57, -2, -10, 57, -2, ICE).box(9, 57, -2, 9, 57, -2, ICE);
  // Larger glowing cold-poison crystal gourd hanging at the left hip behind the hand (ONLY emissive glow element!)
  v.bone('gourd', 'hips', 9.5, 24, -5.5);
  octY(v, 'gourd', 8, 14, -8, 11, 18, -4, ICE, 1); B(v, 'gourd', 9, 19, -7, 10, 19, -5, SILV_D); octY(v, 'gourd', 8, 20, -8, 11, 22, -4, ICE, 1);
  B(v, 'gourd', 9, 23, -6, 10, 23, -5, BLK).box(8, 24, -5, 9, 24, -5, BLK).box(7, 25, -5, 8, 25, -5, BLK);
  // Drinking frost-crystal gourd in the right hand (shown during drink / sow)
  v.bone('gourdH', 'handR', -11.5, 19.5, 3);
  oct(v, 'gourdH', -13, 17, -10, 20, 3, 7, ICE, 1); B(v, 'gourdH', -12, 18, 8, -11, 19, 8, SILV_D); B(v, 'gourdH', -12, 18, 9, -11, 19, 10, ICE, 1);
  B(v, 'gourdH', -12, 18, 11, -11, 19, 11, BLK);
  // 二阶段的霜 (sculpted icy-blue crystal rim shell 1 cell proud — frames the obsidian shoulders & cuffs without blanking out his dark sovereign armor!)
  v.bone('frost', 'chest', 0, 41, 0);
  v.part('frost');
  for (let x = -7; x <= 6; x += 2) v.set(x, 34, 5, ICE).set(x, 35, 5, FROST_D).set(x, 34, -6, ICE);
  v.box(-6, 36, 5, 5, 36, 5, FROST_D).box(-6, 41, 3, -4, 41, 4, ICE).box(3, 41, 3, 5, 41, 4, ICE);
  for (const [L, s] of SIDES) {
    const A = 'frostA' + L, F = 'frostF' + L, [a, b] = MX(s, 9, 14), ox = s > 0 ? 14 : -15, [ca, cb] = MX(s, 7, 14), cx = s > 0 ? 14 : -15;
    v.bone(A, 'arm' + L, s * 10, 40, 0).bone(F, 'fore' + L, s * 10, 31, 0);
    // Crisp jagged frost crystal crests on the outer shoulder pauldrons & icicles under the bell cuffs
    B(v, A, a, 41, -2, b, 41, 1, ICE).box(ox, 36, -2, ox, 40, 1, FROST_D).box(ox, 35, -1, ox, 35, 0, ICE);
    B(v, F, ca, 22, 5, cb, 22, 5, ICE).box(ca, 22, -5, cb, 22, -5, ICE).box(cx, 22, -4, cx, 22, 4, FROST_D);
    for (let x = ca; x <= cb; x += 2) v.set(x, 21, 5, FROST_D).set(x, 21, -5, FROST_D);
    for (let z = -3; z <= 3; z += 2) v.set(cx, 21, z, ICE);
  }
  return v;
}

/** tip = the weapon's reach along its joint's +z in fine cells (BActor.weapon); r in the report (the AI's EDEFS own it) */
export const XP_DEFS = {
  assassin: def({ id: 'xp_assassin', name: '覆面影刃', group: '普通', role: '死士', line: '', kind: 'biped', attack: 'dual', tip: 14, build: () => assassin(false) }),
  assassin_e: def({ id: 'xp_assassin_e', name: '覆面影刃', group: '精英', role: '死士', line: '', kind: 'biped', attack: 'dual', tip: 14, build: () => assassin(true) }),
  needle: def({ id: 'xp_needle', name: '寒针幽卒', group: '普通', role: '毒针手', line: '', kind: 'biped', attack: 'swing', tip: 25, build: () => needler(false) }),
  needle_e: def({ id: 'xp_needle_e', name: '寒针幽卒', group: '精英', role: '毒针手', line: '', kind: 'biped', attack: 'swing', tip: 25, build: () => needler(true) }),
  frost: def({ id: 'xp_frost', name: '凝霜毒吏', group: '普通', role: '寒毒术士', line: '', kind: 'biped', attack: 'cast', tip: 36, build: () => frostOfficer(false) }),
  frost_e: def({ id: 'xp_frost_e', name: '凝霜毒吏', group: '精英', role: '寒毒术士', line: '', kind: 'biped', attack: 'cast', tip: 36, build: () => frostOfficer(true) }),
  diver: def({ id: 'xp_diver', name: '沉江恶鬼', group: '普通', role: '水鬼', line: '', kind: 'biped', attack: 'swing', tip: 48, build: () => diver(false) }),
  diver_e: def({ id: 'xp_diver_e', name: '沉江恶鬼', group: '精英', role: '水鬼', line: '', kind: 'biped', attack: 'swing', tip: 48, build: () => diver(true) }),
  chain: def({ id: 'xp_chain', name: '枷铁狱吏', group: '普通', role: '狱卒', line: '', kind: 'biped', attack: 'slam', tip: 8, build: () => jailer(false) }),
  chain_e: def({ id: 'xp_chain_e', name: '枷铁狱吏', group: '精英', role: '狱卒', line: '', kind: 'biped', attack: 'slam', tip: 8, build: () => jailer(true) }),
  conscript: def({ id: 'xp_conscript', name: '冻骨溃兵', group: '普通', role: '降卒', line: '', kind: 'biped', attack: 'swing', tip: 30, build: () => conscript(0) }),
  conscript_b: def({ id: 'xp_conscript_b', name: '冻骨溃兵', group: '普通', role: '降卒', line: '', kind: 'biped', attack: 'swing', tip: 21, build: () => conscript(1) }),
  boss: def({ id: 'xp_boss', name: '截指鬼医 · 封寒', group: '首领', role: '医官', line: '', kind: 'biped', attack: 'cast', tip: 11, scale: 1.24, build: boss }),
};
void plate;

import './xp_poses';
