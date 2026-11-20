// 第四关 · 锁江（乌林曹军水寨）和第五关 · 许都雪（崔府深宅）的敌人模型（wp/regB）。3.5 厘米细格子，骨骼和关节位置照黄巾刀手
// （hj_models.ts 的 soldier：骨骼名字、父子关系一样），所以通用的待机、跑、挨打、倒地都能直接用；出招的姿势在 r45_pose.ts。
// 汉末装束：曹军水卒红帻短褐赤腿、亲卫兜鍪札甲长楯、弩士兜鍪皮甲；崔府僮奴灰巾褐衣、门客白深衣小冠汉剑、死士皂衣裹头、刀卫武冠
// 札甲环首刀、击筑客素袍抱筑。头顶是俯视镜头下最先读到的一块：每种的头顶颜色和形状都不一样（红帻 / 铁盔红缨 / 黑巾 / 白衣小冠……）。
// 铁律同 hj_models：横平竖直的大块，2～3 档颜色，不撒随机点、不走斜线台阶；兵器一格薄；精英版（_e）金边、金饰，enemy.ts 再放大 15%。
import { VoxChar, type Col } from '../../look/voxkit';
import { CELL, type V } from '../../bestiary/kit';
import { ROSTER, type ModelDef } from '../../bestiary/models';

const SKIN = 0xcc9670, SKIN_D = 0x9c6c4c, HAIR = 0x201814, EYE = 0x140e0a, MOUTH = 0x4a2a1c, LINEN = 0x9a917e, LINEN_D = 0x76705e, INNER = 0xe6dfcc;
const STRAW = 0xc4a05a, STRAW_D = 0x9a7a3e, GOLD = 0xe2b040, GOLD_D = 0xb08424;
const IRON = 0x4a4f5a, IRON_L = 0x6e7480, IRON_D = 0x30343c, STEEL = 0xd8dee8, STEEL_D = 0x8a92a0, WOOD = 0x6e4a2a, WOOD_D = 0x4a3020, WOOD_L = 0x8a6440;
/** 曹军: dark Han red, black, iron */
const RED = 0x8a2a22, RED_D = 0x621c18, RED_L = 0xa83a2c, BLACK = 0x221e20, BLACK_L = 0x34302e, NAVY = 0x34405a, NAVY_D = 0x232c40;
/** 崔府: white silk, ink black, grey servants' cloth, crimson */
const SILK = 0xdcd8cc, SILK_D = 0xb2aea2, INK = 0x1c1a20, INK_L = 0x302c34, GREY = 0x6e6a62, GREY_D = 0x54504a, CRIM = 0x6e2024, CRIM_D = 0x4c1618, JADE = 0x8ac0a8;

const fine = () => new VoxChar(CELL / 2);
const B = (v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null, g = 0) => v.part(part).box(x0, y0, z0, x1, y1, z1, c, g);
/** a box with its four vertical edges cut away (a one-cell chamfer down each corner column) */
function cbox(v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, g = 0) {
  v.part(part);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (!((x === x0 || x === x1) && (z === z0 || z === z1))) for (let y = y0; y <= y1; y++) v.set(x, y, z, c, g);
  return v;
}
const SIDES = [['L', 1], ['R', -1]] as const;
/** a left-side x range, mirrored for the right side (cell x ↔ −1 − x) */
const MX = (s: number, a: number, b: number): [number, number] => (s > 0 ? [a, b] : [-1 - b, -1 - a]);

// ------------------------------------------------------------------ the skeleton: hj_models' soldier, joint for joint
function skel(v: V) {
  v.bone('hips', 'root', 0, 20, 0).bone('spine', 'hips', 0, 24, 0).bone('chest', 'spine', 0, 30, 0)
    .bone('neck', 'chest', 0, 38, 0).bone('head', 'neck', 0, 40, 0).bone('jaw', 'head', 0, 44, 4).bone('hat', 'head', 0, 54, 0).bone('cape', 'chest', 0, 36, -6);
  for (const [L, s] of SIDES) {
    v.bone('sh' + L, 'chest', s * 13, 38, 1).bone('arm' + L, 'sh' + L, s * 13, 38, 1).bone('fore' + L, 'arm' + L, s * 13, 30, 1).bone('hand' + L, 'fore' + L, s * 13, 22, 1)
      .bone('leg' + L, 'hips', s * 5, 20, 0).bone('shin' + L, 'leg' + L, s * 5, 10, 0).bone('foot' + L, 'shin' + L, s * 5, 4, 0);
  }
  v.bone('weapon', 'handR', -13, 19, 1).bone('offhand', 'handL', 13, 20, 1);
}

// ------------------------------------------------------------------ the body
interface Man {
  coat: Col; coatD: Col; trim: Col; trou: Col; sash: Col; sashD: Col;
  /** the coat's skirt: 'short' over the thighs, 'knee' a robe to the knee (on the thighs, so a stride opens it), 'long' a robe to the
   *  ankles (one rigid piece on the hips, the feet peeping out under it) */
  skirt: 'short' | 'knee' | 'long';
  legs: 'wrap' | 'bare' | 'boot';
  /** 'sleeve' a jacket sleeve and bare forearm, 'bare' bare arms, 'wide' a robe's wide sleeves */
  arms: 'sleeve' | 'bare' | 'wide';
  /** 札甲 over the coat: rows of plates on the chest, waist and the skirt's top */ armour?: boolean;
  /** a leather vest (no sleeves) over the coat */ vest?: Col;
  skin?: Col; elite: boolean;
}
function body(v: V, o: Man) {
  const sk = o.skin ?? SKIN, TRIM = o.elite ? GOLD : o.trim;
  // legs and feet
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 2, 7), [sa, sb] = MX(s, 3, 6), f = 'foot' + L;
    if (o.legs === 'boot') { B(v, f, a, 0, -2, b, 0, 5, 0x161212).box(a, 1, -2, b, 3, 4, 0x2a2020).box(sa, 2, 3, sb, 2, 4, 0x3e3030); B(v, 'shin' + L, sa, 4, -2, sb, 9, 2, 0x2a2020).box(sa, 8, -2, sb, 9, 2, 0x3e3030); }
    else {
      B(v, f, a, 0, -2, b, 0, 5, STRAW_D).box(a, 1, -2, b, 1, 5, STRAW).box(sa, 2, -2, sb, 3, 4, sk).box(sa, 2, 2, sb, 3, 2, STRAW_D);
      if (o.legs === 'wrap') { B(v, f, sa, 2, -2, sb, 3, 0, LINEN); B(v, 'shin' + L, sa, 4, -2, sb, 9, 2, LINEN).box(sa, 9, -2, sb, 9, 2, LINEN_D).box(sa, 6, -2, sb, 6, 2, LINEN_D); }
      else B(v, 'shin' + L, sa, 4, -2, sb, 9, 2, sk);
    }
    B(v, 'leg' + L, a, 10, -2, b, 19, 3, o.trou);
    if (o.legs === 'bare') B(v, 'leg' + L, a, 10, -2, b, 11, 3, shade(o.trou, 0.8));   // the trousers rolled up above the knee
  }
  if (o.skirt === 'short') for (const [L, s] of SIDES) { const [a, b] = MX(s, 0, 8), [fa, fb] = MX(s, 0, 9); B(v, 'leg' + L, a, 16, -5, b, 19, 5, o.coat); B(v, 'leg' + L, fa, 14, -5, fb, 15, 5, o.coat).box(fa, 14, -5, fb, 14, 5, TRIM); }
  if (o.skirt === 'knee') for (const [L, s] of SIDES) { const [a, b] = MX(s, 0, 9), [fa, fb] = MX(s, 0, 10); B(v, 'leg' + L, a, 13, -6, b, 19, 6, o.coat); B(v, 'leg' + L, fa, 9, -6, fb, 12, 6, o.coat).box(fa, 9, -6, fb, 9, 6, TRIM); }
  if (o.skirt === 'long') {
    // articulated 2-bone, 3-tier A-line flared octagonal robe (robe1 mid-skirt -> robe2 wide hem)
    v.bone('robe1', 'hips', 0, 20, 0).bone('robe2', 'robe1', 0, 10, 0);
    cbox2(v, 'robe2', -12, 1, -10, 11, 5, 9, o.coat, 3); cbox2(v, 'robe2', -12, 1, -10, 11, 2, 9, TRIM, 3); cbox2(v, 'robe2', -12, 5, -10, 11, 5, 9, o.coatD, 3);
    cbox2(v, 'robe2', -10, 6, -8, 9, 9, 7, o.coat, 2); cbox2(v, 'robe2', -10, 9, -8, 9, 9, 7, o.coatD, 2);
    cbox2(v, 'robe1', -9, 10, -7, 8, 19, 6, o.coat, 2);
    // Boots at z=-2..5 stay neatly tucked under the articulated hem without floating toe-slivers
  }
  // hips, cinched V-taper waist & sloped shoulders; 交领
  cbox2(v, 'hips', -8, 20, -6, 7, 21, 5, o.coat, 2); cbox2(v, 'hips', -9, 22, -7, 8, 23, 6, o.sash, 2);
  B(v, 'hips', 3, 21, 7, 5, 23, 7, o.sash).box(4, 16, 6, 5, 20, 6, o.sash).box(4, 16, 6, 5, 16, 6, o.sashD);
  cbox2(v, 'spine', -7, 24, -6, 6, 29, 5, o.coat, 2); cbox2(v, 'chest', -10, 30, -6, 9, 36, 5, o.coat, 2); cbox2(v, 'chest', -8, 37, -5, 7, 37, 4, shade(o.coat, 1.12), 2);
  B(v, 'neck', -2, 38, -2, 1, 39, 1, sk); B(v, 'neck', -2, 38, -2, 1, 38, 1, SKIN_D);
  B(v, 'chest', -4, 37, -4, 3, 37, 3, TRIM);
  B(v, 'chest', -4, 36, 4, 1, 37, 5, INNER).box(2, 30, 5, 3, 37, 5, TRIM).box(2, 37, 4, 3, 37, 5, TRIM); B(v, 'spine', 2, 24, 5, 3, 29, 5, TRIM);
  if (o.armour) {
    const P = o.elite ? 0x5a5a64 : IRON, PL = o.elite ? GOLD : IRON_L;
    cbox2(v, 'chest', -11, 30, -7, 10, 36, 6, P, 2); cbox2(v, 'chest', -9, 37, -6, 8, 37, 5, P, 2); cbox2(v, 'spine', -8, 24, -7, 7, 29, 6, P, 2);
    for (const p of ['chest', 'spine']) v.paint(q => ((q.y - 24) % 4 === 0 && q.c === P ? PL : null), p);
    B(v, 'chest', -3, 37, 6, 2, 37, 6, o.coat).box(-4, 36, 6, 3, 36, 6, o.coat);
    for (const [L, s] of SIDES) { const [a, b] = MX(s, 0, 8); B(v, 'leg' + L, a, 15, -6, b, 19, 6, P).box(a, 15, -6, b, 15, 6, PL).box(a, 17, -6, b, 17, 6, PL); }
  }
  if (o.vest) { cbox2(v, 'chest', -11, 30, -7, 10, 36, 6, o.vest, 2); cbox2(v, 'chest', -9, 37, -6, 8, 37, 5, o.vest, 2); cbox2(v, 'spine', -8, 24, -7, 7, 29, 6, o.vest, 2); B(v, 'chest', -3, 30, 6, 2, 37, 6, o.coat); B(v, 'spine', -3, 24, 6, 2, 29, 6, o.coat); }
  // arms: sloped natural shoulder lines + true bell-flared wide sleeves when o.arms === 'wide'
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 10, 15), [fa, fb] = MX(s, 11, 14), [wa, wb] = MX(s, 9, 17), ox = s > 0 ? 15 : -16;
    if (o.arms === 'bare') { B(v, 'arm' + L, a, 30, -2, b, 37, 3, sk).box(a, 37, -2, b, 37, 3, shade(sk, 1.07)).box(ox, 37, -2, ox, 37, 3, null); B(v, 'fore' + L, fa, 22, -2, fb, 29, 2, sk).box(fa, 22, -2, fb, 23, 2, LINEN); }
    else if (o.arms === 'wide') {
      B(v, 'arm' + L, a, 30, -2, b, 37, 3, o.coat).box(a, 37, -2, b, 37, 3, shade(o.coat, 1.12)).box(ox, 37, -2, ox, 37, 3, null);
      cbox2(v, 'fore' + L, a, 27, -3, b, 29, 4, o.coat, 1);
      cbox2(v, 'fore' + L, wa, 21, -5, wb, 26, 5, o.coat, 2);
      cbox2(v, 'fore' + L, wa, 21, -5, wb, 22, 5, TRIM, 2);
    }
    else { B(v, 'arm' + L, a, 30, -2, b, 37, 3, o.coat).box(a, 37, -2, b, 37, 3, shade(o.coat, 1.12)).box(a, 30, -2, b, 30, 3, o.coatD).box(ox, 37, -2, ox, 37, 3, null); B(v, 'fore' + L, fa, 22, -2, fb, 29, 2, sk).box(fa, 22, -2, fb, 23, 2, LINEN); }
    if (o.armour) {
      const [pa, pb] = MX(s, 10, 16), pox = s > 0 ? 16 : -17;
      B(v, 'arm' + L, pa, 33, -3, pb, 37, 4, o.elite ? 0x5a5a64 : IRON).box(pa, 37, -3, pb, 37, 4, o.elite ? GOLD : IRON_L).box(pa, 33, -3, pb, 33, 4, o.elite ? GOLD : IRON_L).box(pox, 37, -3, pox, 37, 4, null);
      if (o.elite) {
        // Elite armored commander: raised 3-tier gilded wing pauldrons!
        const [ea, eb] = MX(s, 11, 17);
        B(v, 'arm' + L, ea, 38, -2, eb, 39, 3, GOLD).box(pox, 32, -4, pox + (s > 0 ? 1 : -1), 36, 4, 0x3e424c).box(pox, 32, -4, pox + (s > 0 ? 1 : -1), 32, 4, GOLD);
      }
    } else if (o.elite) {
      // Non-armored elites: bold sculpted shoulder mantle / iron-gold shoulder guards so silhouette jumps out immediately!
      const [pa, pb] = MX(s, 10, 16), pox = s > 0 ? 16 : -17;
      const sc = o.arms === 'wide' ? o.coat : IRON;
      B(v, 'arm' + L, pa, 34, -3, pb, 38, 4, sc).box(pa, 38, -3, pb, 38, 4, GOLD).box(pa, 34, -3, pb, 34, 4, GOLD_D).box(pox, 38, -3, pox, 38, 4, null);
    }
  }
  if (o.elite) {
    // Sweeping articulated officer / master cape (`cape` bone — swings dynamically in combat!)
    const cc = o.coat === INK ? INK : o.coat === RED || o.coat === CRIM ? RED_D : o.coatD;
    const cl = o.coat === INK ? INK_L : o.coat === RED || o.coat === CRIM ? RED_L : o.coat;
    B(v, 'cape', -10, 12, -8, 9, 36, -7, cc).box(-8, 14, -9, 7, 34, -9, cl).box(-10, 12, -9, 9, 14, -7, GOLD);
  }
  // the fists (small; the right one open for its grip, the left closed)
  B(v, 'handL', 12, 17, -1, 14, 21, 2, sk).box(14, 17, -1, 14, 20, 2, SKIN_D);
  B(v, 'handR', -15, 17, -1, -13, 21, 2, sk).box(-15, 17, -1, -15, 20, 2, SKIN_D).box(-14, 18, -1, -13, 19, 2, null);
}
function shade(c: number, k: number) { return (Math.min(255, Math.round(((c >> 16) & 255) * k)) << 16) | (Math.min(255, Math.round(((c >> 8) & 255) * k)) << 8) | Math.min(255, Math.round((c & 255) * k)); }

// ------------------------------------------------------------------ the head: Form-First rounded bevel skull, tapered jawline & sculpted headgear
function head(v: V, o: { beard?: 'full' | 'long' | 'goatee' | 'stubble'; skin?: Col; old?: boolean }) {
  const sk = o.skin ?? SKIN, BD = o.old ? 0x9a948a : 0x2a1c14;
  cbox2(v, 'head', -8, 42, -8, 7, 53, 7, sk, 2);
  cbox2(v, 'head', -7, 40, -7, 6, 41, 7, sk, 2);
  // hair at the back and the sides (grey for the old men)
  v.paint(q => (q.y >= 44 && (q.z <= -5 || ((q.x <= -6 || q.x >= 5) && q.z <= 3)) && q.c === sk ? (o.old ? 0x8a867e : HAIR) : null), 'head');
  // the face: two-row eyes, a frown, a nose one cell proud
  v.part('head').symBox(2, 44, 7, 3, 45, 7, EYE).symBox(2, 46, 7, 5, 46, 7, o.old ? 0x8a867e : HAIR).symBox(4, 47, 7, 5, 47, 7, o.old ? 0x8a867e : HAIR).box(-1, 43, 8, 0, 44, 8, SKIN_D);
  if (o.beard === 'full') { v.paint(q => (q.y <= 44 && q.y >= 40 && (q.x <= -6 || q.x >= 5) && q.z >= 0 ? BD : null), 'head'); B(v, 'jaw', -6, 38, 6, 5, 42, 8, BD).box(-4, 36, 6, 3, 37, 8, BD).box(-3, 35, 6, 2, 35, 8, shade(BD, 0.8)).box(-2, 41, 8, 1, 41, 8, MOUTH); }
  else if (o.beard === 'long') { B(v, 'jaw', -4, 42, 6, 3, 42, 7, BD).box(-6, 40, 7, -5, 42, 7, BD).box(4, 40, 7, 5, 42, 7, BD).box(-2, 32, 7, 1, 41, 8, BD).box(-1, 29, 7, 0, 31, 8, BD).box(-1, 41, 8, 0, 41, 8, MOUTH); }
  else if (o.beard === 'goatee') { B(v, 'jaw', -4, 42, 6, 3, 42, 6, BD).box(-2, 36, 6, 1, 41, 7, BD).box(-1, 41, 7, 0, 41, 7, MOUTH); }
  else if (o.beard === 'stubble') { B(v, 'jaw', -6, 40, 7, 5, 42, 7, 0x6a5444).box(-2, 41, 7, 1, 41, 7, MOUTH); }
  else B(v, 'head', -2, 41, 7, 1, 41, 7, MOUTH);
}
type Hat = (v: V, elite: boolean) => void;
/** 帻: rounded beveled cloth cap; elite gets armored gilded brow crest & soaring crimson plume */
const ze = (c: Col, cd: Col): Hat => (v, el) => {
  cbox2(v, 'head', -9, 49, -9, 8, 52, 8, c, 2); cbox2(v, 'head', -9, 49, -9, 8, 49, 8, el ? GOLD : cd, 2);
  cbox2(v, 'head', -7, 53, -8, 6, 54, 6, c, 2); cbox2(v, 'head', -7, 54, -8, 6, 54, 6, shade(c, 1.14), 2); cbox2(v, 'head', -5, 55, -8, 4, 56, 0, cd, 2);
  if (el) {
    B(v, 'head', -2, 50, 9, 1, 55, 9, GOLD).box(-1, 56, -4, 0, 62, 1, RED_L).box(-1, 59, -7, 0, 62, -4, RED);
  }
};
/** 兜鍪: rounded beveled iron helmet; elite gets winged gilded officer crest & tall cascading crimson horsehair plume */
const helm = (plume: boolean): Hat => (v, el) => {
  const P = el ? 0x5a5a64 : IRON, PL = el ? GOLD : IRON_L;
  cbox2(v, 'head', -9, 49, -9, 8, 53, 8, P, 2); cbox2(v, 'head', -9, 49, -9, 8, 49, 8, PL, 2);
  for (const x of [-9, 8]) B(v, 'head', x, 42, -2, x, 48, 5, P).box(x, 48, -2, x, 48, 5, PL);
  B(v, 'head', -8, 42, -9, 7, 48, -9, P);
  cbox2(v, 'head', -7, 54, -7, 6, 55, 6, P, 2); cbox2(v, 'head', -6, 55, -6, 5, 55, 5, el ? 0xf4d268 : 0x828894, 2);
  cbox2(v, 'head', -4, 56, -4, 3, 56, 3, PL, 1); B(v, 'head', -1, 57, -1, 0, 58, 0, IRON_D);
  B(v, 'head', -2, 59, -2, 1, 60, 1, RED); B(v, 'head', -1, 54, -10, 0, 57, -10, RED);
  if (plume || el) B(v, 'head', -1, 59, -4, 0, 66, -1, RED_L).box(-1, 63, -6, 0, 66, -4, RED_L).box(-1, 66, -5, 0, 66, -2, 0xc44838);
  if (el) {
    // Winged gilded officer crest & cascading crimson plume mounted on `hat` (moves rigidly with head, keeps head Box3 clean!)
    B(v, 'hat', -2, 50, 9, 1, 56, 9, GOLD);
    for (const [, s] of SIDES) { const [wa, wb] = MX(s, 8, 10); B(v, 'hat', wa, 52, -1, wb, 55, 2, GOLD).box(s > 0 ? wb : wa, 56, -1, s > 0 ? wb : wa, 58, 1, 0xf6dc7a); }
    B(v, 'hat', -2, 60, -10, 1, 67, -5, RED_L).box(-2, 53, -11, 1, 61, -9, RED);
  }
};
/** soft rounded head cloth (巾); elite upgrades to a tall scholar's black-and-gold court cap */
const jin = (c: Col, cd: Col): Hat => (v, el) => {
  cbox2(v, 'head', -9, 48, -9, 8, 53, 6, c, 2); cbox2(v, 'head', -9, 48, -9, 8, 48, 6, el ? GOLD : cd, 2);
  cbox2(v, 'head', -7, 54, -8, 6, 55, 4, c, 2); cbox2(v, 'head', -7, 55, -8, 6, 55, 4, shade(c, 1.14), 2);
  B(v, 'head', -2, 46, -10, 1, 52, -10, cd).box(-3, 40, -10, -2, 45, -10, el ? GOLD : c).box(1, 41, -10, 2, 45, -10, el ? GOLD : c);
  if (el) {
    cbox2(v, 'head', -5, 56, -5, 4, 61, 4, INK, 1); B(v, 'head', -5, 61, -5, 4, 61, 4, GOLD).box(-9, 58, 0, 8, 58, 0, JADE);
  }
};
/** bare head: topknot tied with beveled band; elite gets gilded iron war-diadem & twin brow crests */
const knot = (band: Col): Hat => (v, el) => {
  cbox2(v, 'head', -8, 52, -8, 7, 53, 7, HAIR, 2);
  cbox2(v, 'head', -9, 49, -9, 8, 50, 8, band, 3);
  cbox2(v, 'head', -8, 49, -8, 7, 50, 7, SKIN, 2);
  v.paint(q => (q.y >= 49 && q.y <= 50 && (q.z <= -5 || ((q.x <= -6 || q.x >= 5) && q.z <= 3)) && q.c === SKIN ? HAIR : null), 'head');
  B(v, 'head', -2, 54, -3, 1, 54, 0, band).box(-2, 55, -3, 1, 58, 0, HAIR).box(-1, 59, -2, 0, 59, -1, HAIR);
  if (el) {
    B(v, 'head', -3, 49, 9, 2, 53, 9, GOLD).box(-6, 51, 8, -5, 55, 8, GOLD).box(4, 51, 8, 5, 55, 8, GOLD);
    B(v, 'head', -3, 55, -4, 2, 59, 1, GOLD_D).box(-3, 59, -4, 2, 59, 1, GOLD);
  }
};
/** 进贤冠: rounded beveled official cap + sleek stepped 展筩 + jade pin */
const jinxian = (pin: Col): Hat => v => {
  cbox2(v, 'head', -9, 49, -9, 8, 52, 8, INK, 2); cbox2(v, 'head', -9, 49, -9, 8, 49, 8, INK_L, 2);
  B(v, 'head', -4, 53, -6, 3, 54, 7, INK).box(-4, 55, -2, 3, 57, 7, INK).box(-4, 58, 2, 3, 61, 7, INK).box(-4, 62, 4, 3, 62, 7, 0x44404a);
  B(v, 'head', -11, 55, 0, 10, 55, 0, pin);
};
/** a box with vertical corners chamfered by r cells (clean rounded sculptural form, zero bumpy stair-steps) */
function cbox2(v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, r = 2, g = 0) {
  v.part(part);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const ex = Math.min(x - x0, x1 - x), ez = Math.min(z - z0, z1 - z);
    if (ex + ez < r) continue;
    for (let y = y0; y <= y1; y++) v.set(x, y, z, c, g);
  }
  return v;
}
/** 梁冠 (崔玄): sleek Han court crown — muted antique-gold rim, 3 sculpted vertical beams, white-jade top beam, jade hairpin & nape ties */
const liangguan: Hat = v => {
  const I_D = 0x101118, I_M = 0x1b1c26, I_L = 0x383e52, G = 0xb88e38, WJ = 0xf4f8f0, CJ = 0x7abaa0, CJ_D = 0x467866;
  cbox2(v, 'head', -8, 49, -8, 7, 52, 7, I_M, 2); B(v, 'head', -6, 49, 7, 5, 49, 7, G);
  cbox2(v, 'head', -8, 52, -8, 7, 52, 7, I_L, 2);
  // Sleek tapered 3-beam court crown frame (restrained, aristocratic — no loud yellow stripe!)
  B(v, 'head', -3, 53, -7, 2, 63, 6, I_D);
  for (const x of [-3, 2]) B(v, 'head', x, 53, -7, x, 63, 6, I_M).box(x, 54, 6, x, 63, 6, I_L).box(x, 54, -7, x, 63, -7, I_L);
  B(v, 'head', -1, 53, -7, 0, 63, 6, I_L).box(-1, 55, 6, 0, 62, 6, G);
  // Two-tier white-jade & celadon top beam (rounded ends)
  B(v, 'head', -3, 64, -7, 2, 64, 6, CJ).box(-3, 64, -7, 2, 64, -7, CJ_D);
  B(v, 'head', -3, 65, -7, 2, 65, 6, WJ).box(-2, 66, -5, 1, 66, 4, WJ);
  // White-jade hairpin & ink silk nape ribbons
  B(v, 'head', -10, 56, -1, 9, 56, 0, WJ).box(-10, 56, -1, -10, 56, 0, G).box(9, 56, -1, 9, 56, 0, G);
  B(v, 'head', -3, 43, -9, -2, 49, -9, I_M).box(1, 43, -9, 2, 49, -9, I_M);
};
/** 武冠 (the guards): rounded beveled black cap; elite gets soaring gilded pheasant-plume imperial guard crown! */
const wuguan: Hat = (v, el) => {
  cbox2(v, 'head', -9, 49, -9, 8, 53, 8, INK, 2); cbox2(v, 'head', -9, 49, -9, 8, 49, 8, el ? GOLD : CRIM, 2);
  cbox2(v, 'head', -6, 54, -6, 5, el ? 60 : 58, 5, INK, 2); cbox2(v, 'head', -6, el ? 60 : 58, -6, 5, el ? 60 : 58, 5, el ? GOLD : 0x44404a, 2);
  B(v, 'head', -4, 44, -10, -3, 52, -10, INK).box(2, 44, -10, 3, 52, -10, INK);
  if (el) {
    // Twin soaring pheasant tail plumes sweeping up & back from the gilded martial crown!
    B(v, 'head', -2, 54, 6, 1, 60, 6, GOLD);
    for (const [, s] of SIDES) {
      const [px, px2] = MX(s, 5, 6);
      B(v, 'head', px, 58, -2, px2, 65, 0, RED_L).box(px, 64, -5, px2, 67, -2, GOLD);
    }
  }
};
/** the shades: no mask (a masked man in black reads as a Japanese ninja — not this game): a black 帻 low over the brow, the face bare
 *  and gaunt, and a short black cape over the shoulders (on the cape joint, so it swings) */
const hood: Hat = (v, el) => {
  ze(INK, INK_L)(v, el);
  B(v, 'head', -8, 47, 7, 7, 47, 7, INK);   // the 帻's band down to the brows
  B(v, 'cape', -11, 22, -9, 10, 36, -7, INK).box(-11, 22, -9, 10, 22, -7, el ? GOLD : INK_L).box(-11, 36, -7, 10, 37, 4, INK).box(-3, 36, 5, 2, 37, 6, el ? GOLD : CRIM);
};

// ------------------------------------------------------------------ weapons (on 'weapon' = the right fist, 'offhand' = the left)
/** 矛: a long haft through the fist, an iron socket, a leaf head one cell thin, a red tassel under the socket */
function spear(v: V, el: boolean) {
  B(v, 'weapon', -14, 18, -18, -13, 19, 36, WOOD).box(-15, 17, -19, -12, 20, -19, IRON_D);
  B(v, 'weapon', -15, 17, 37, -12, 20, 39, IRON).box(-15, 14, 36, -12, 16, 38, el ? GOLD : RED).box(-15, 13, 36, -12, 13, 38, el ? GOLD_D : RED_D);
  B(v, 'weapon', -14, 16, 40, -14, 21, 44, STEEL).box(-14, 17, 45, -14, 20, 47, STEEL).box(-14, 18, 48, -14, 19, 50, STEEL).box(-14, 18, 40, -14, 19, 49, STEEL_D);
}
/** 铁索: a short iron grip; the chain hanging from the fist (links two tones), an iron hook-weight at its end; a coil over the left
 *  shoulder (the chest's part) */
function chain(v: V, el: boolean) {
  B(v, 'weapon', -15, 18, -3, -12, 19, 4, IRON_D);
  let parent = 'weapon';
  for (let i = 0; i < 4; i++) {
    const part = 'link' + i, z = 4 + i * 13;
    v.bone(part, parent, -13.5, 19, z);
    for (let j = 0; j < 3; j++) {
      const start = z + j * 4;
      if ((i + j) % 2) B(v, part, -14, 17, start, -13, 20, start + 4, IRON_L).box(-14, 18, start + 1, -13, 19, start + 3, null);
      else B(v, part, -15, 18, start, -12, 19, start + 4, IRON).box(-14, 18, start + 1, -13, 19, start + 3, null);
    }
    parent = part;
  }
  B(v, parent, -16, 16, 54, -11, 21, 59, IRON_D).box(-15, 17, 55, -12, 20, 58, el ? GOLD : IRON_L)
    .box(-16, 19, 59, -15, 22, 63, IRON_D).box(-16, 22, 56, -15, 23, 58, STEEL);
  // the coil: a band of links round the left shoulder, one hanging down across the chest
  for (let z = -7; z <= 6; z++) B(v, 'chest', 6, 37, z, 9, 38, z, (z & 1) ? IRON : IRON_L);
  for (let y = 26; y <= 36; y++) B(v, 'chest', -9, y, 6, -8, y, 6, (y & 1) ? IRON : IRON_L);
}
/** 火油罐: a clay jar in the fist (a cloth wick glowing at its mouth); four more on a carrying frame on the back */
function heldOilJar(v: V, part: string, el: boolean) {
  B(v, part, -17, 13, -2, -11, 20, 4, 0x8a4a2c).box(-17, 13, -2, -11, 13, 4, 0x6a3420)
    .box(-16, 21, -1, -12, 22, 3, 0x8a4a2c).box(-15, 23, 0, -13, 24, 2, 0x2a2220).box(-15, 25, 0, -14, 26, 1, 0xff9a40, 1);
  B(v, part, -17, 16, -2, -11, 16, 4, el ? GOLD : 0x6a3420);
}
function jar(v: V, el: boolean) {
  heldOilJar(v, 'weapon', el);
  // the back frame: two uprights, two rails, four jars sitting in it
  B(v, 'chest', -9, 24, -9, -8, 40, -9, WOOD_D).box(7, 24, -9, 8, 40, -9, WOOD_D).box(-9, 30, -10, 8, 31, -10, WOOD).box(-9, 38, -10, 8, 39, -10, WOOD);
  for (const [x, y] of [[-7, 31], [1, 31], [-7, 39], [1, 39]] as const) B(v, 'chest', x, y, -14, x + 5, y + 5, -10, 0x8a4a2c).box(x + 1, y + 6, -13, x + 4, y + 6, -11, 0x2a2220);
}
/** 弩: a stock along the forearm, the bow across its front (one cell thin), the string back to the nut, a bolt laid in it */
function xbow(v: V, el: boolean) {
  B(v, 'weapon', -14, 18, -6, -13, 20, 16, WOOD).box(-14, 16, -4, -13, 17, 0, WOOD_D).box(-15, 18, 2, -12, 21, 4, el ? GOLD : IRON);
  B(v, 'weapon', -26, 20, 16, -1, 20, 17, WOOD_D).box(-26, 20, 14, -25, 20, 16, WOOD_D).box(-2, 20, 14, -1, 20, 16, WOOD_D);
  v.bone('stringA', 'weapon', -25, 20.5, 13.5).bone('stringB', 'weapon', -1, 20.5, 13.5);
  B(v, 'stringA', -25, 20, 13, -14, 20, 13, 0xd8d0b8); B(v, 'stringB', -13, 20, 13, -2, 20, 13, 0xd8d0b8);
  v.bone('bolt', 'weapon', -13, 21, 3);
  B(v, 'bolt', -14, 21, 3, -13, 21, 19, 0x8a6a44).box(-14, 21, 20, -13, 21, 21, STEEL);
}
/** 钩刀: a short haft, a straight blade with a hook turned up at its end */
function hook(v: V, el: boolean) {
  B(v, 'weapon', -14, 18, -3, -13, 19, 4, 0x2a1e18).box(-15, 17, 5, -12, 20, 5, el ? GOLD : IRON);
  B(v, 'weapon', -14, 17, 6, -14, 19, 15, STEEL).box(-14, 13, 13, -14, 16, 15, STEEL)
    .box(-14, 19, 6, -14, 19, 13, STEEL_D).box(-14, 17, 6, -14, 17, 13, 0xe8ecf2);
}
/** 环首刀: the ring pommel behind the fist, a small guard, the blade one cell thin (bright edge, darker back); bright = the 文家刀 —
 *  the 寒山 forge's pale wave line down the flat */
function ringBlade(v: V, part: string, el: boolean, len = 29, bright = false) {
  const RING = el ? GOLD : bright ? 0xc8ccd4 : 0x9a7a3a;
  B(v, part, -14, 18, -3, -13, 19, 3, 0x2a1e18).box(-14, 17, -8, -13, 20, -4, RING).box(-14, 18, -7, -13, 19, -5, null);
  B(v, part, -14, 16, 4, -13, 21, 4, bright ? 0x6a6e78 : 0x5a4a3a);
  B(v, part, -14, 17, 5, -14, 18, len, bright ? 0xf2f6fc : 0xe8ecf2).box(-14, 19, 5, -14, 19, len - 2, bright ? 0x9aa4b4 : 0x8a92a0);
  if (bright) for (let z = 7; z < len - 3; z += 4) B(v, part, -15, 18, z, -15, 18, z + 1, 0xc8d4e4);
}
/** 长楯: a tall plank shield held in front of the left side — dark red face, black border, an iron boss, a white 曹 mark's two bars */
function shield(v: V, el: boolean) {
  const F = el ? 0x9a2a22 : RED, E = el ? GOLD : BLACK;
  B(v, 'offhand', 4, 4, 5, 21, 37, 6, F).box(4, 4, 5, 21, 5, 6, E).box(4, 36, 5, 21, 37, 6, E).box(4, 4, 5, 5, 37, 6, E).box(20, 4, 5, 21, 37, 6, E);
  B(v, 'offhand', 10, 18, 7, 15, 23, 7, el ? GOLD : IRON).box(8, 29, 7, 17, 30, 7, 0xd8d0c0).box(8, 11, 7, 17, 12, 7, 0xd8d0c0);
  B(v, 'offhand', 11, 17, 3, 14, 21, 4, WOOD_D);
}
/** 汉剑: a long straight double-edged sword — a grip wrapped in cord, a bronze guard, the blade with its ridge, a tassel */
function sword(v: V, el: boolean) {
  B(v, 'weapon', -14, 18, -4, -13, 19, 2, 0x2a2228).box(-14, 17, -5, -13, 20, -5, el ? GOLD : 0x8a7a4a).box(-14, 11, -6, -13, 16, -6, el ? GOLD : 0x2a5a4a);
  B(v, 'weapon', -16, 17, 3, -11, 20, 3, el ? GOLD : 0x8a7a4a);
  B(v, 'weapon', -14, 17, 4, -14, 20, 31, STEEL).box(-14, 18, 4, -14, 19, 31, STEEL_D).box(-14, 18, 32, -14, 19, 33, STEEL);
}
/** 短刀: the same +Z grip axis as the other blades, with its edge on -Y. */
function dagger(v: V, el: boolean) {
  B(v, 'weapon', -14, 18, -2, -13, 20, 3, 0x1a1418).box(-15, 16, 4, -12, 21, 4, el ? GOLD : IRON);
  B(v, 'weapon', -14, 16, 5, -14, 19, 16, 0x9aa2ae).box(-14, 16, 5, -14, 16, 16, STEEL)
    .box(-14, 17, 17, -14, 18, 18, STEEL);
}
/** 杖 (the servants): a long wooden staff, iron ferrules at both ends */
function staff(v: V, el: boolean) {
  B(v, 'weapon', -14, 18, -14, -13, 19, 26, WOOD_L).box(-15, 17, -15, -12, 20, -14, el ? GOLD : IRON).box(-15, 17, 26, -12, 20, 28, el ? GOLD : IRON);
}
/** 筑 in the left arm (a long narrow box, the strings a pale line on top, a neck at one end) and a bamboo striker in the right */
function zhu(v: V, el: boolean) {
  B(v, 'offhand', 11, 17, -12, 15, 20, 22, 0x6a4a30).box(11, 21, -10, 15, 21, 20, 0x8a6440).box(13, 22, -10, 13, 22, 20, 0xe8e0c8).box(12, 17, 23, 14, 22, 26, 0x4a3020);
  if (el) B(v, 'offhand', 11, 17, -12, 15, 17, 22, GOLD);
  B(v, 'weapon', -14, 18, 0, -14, 19, 14, 0x9aa04a).box(-14, 18, 15, -14, 20, 16, 0x7a8034);
}
/** 令旗 (周黯's signal flag, the left fist): a pole standing up out of the fist, a square flag off its top, black edged */
function flag(v: V) {
  B(v, 'offhand', 13, 4, 1, 13, 52, 1, WOOD_D).box(12, 53, 0, 14, 54, 2, GOLD);
  B(v, 'offhand', 14, 38, 1, 26, 51, 1, RED).box(14, 38, 1, 26, 38, 1, BLACK).box(14, 51, 1, 26, 51, 1, BLACK).box(26, 38, 1, 26, 51, 1, BLACK).box(18, 42, 1, 22, 47, 1, 0xe8dcc0);
}
/** 袖弩 (周黯's hand crossbow, the right fist): a short stock, a small bow across */
function sleeveBow(v: V) {
  v.bone('sleeveBow', 'weapon', -13, 19, 1).bone('sleeveBolt', 'sleeveBow', -13, 21, 2);
  v.bone('oilJar', 'weapon', -13, 19, 1);
  B(v, 'sleeveBow', -14, 18, -1, -13, 20, 8, 0x3a2a20).box(-20, 20, 8, -7, 20, 9, IRON).box(-19, 20, 7, -8, 20, 7, 0xd8d0b8);
  B(v, 'sleeveBolt', -14, 21, 2, -13, 21, 11, STEEL_D);
  heldOilJar(v, 'oilJar', true);
}
/** 便面 (崔玄's fan, the right fist): ivory silk square fan with lacquered frame, gold corner studs & ink-bamboo motif; plus hidden 文家刀 */
function fanAndBlade(v: V) {
  v.bone('fan', 'weapon', -13, 19, 1);
  B(v, 'fan', -14, 14, 0, -14, 22, 1, 0x362418).box(-14, 14, 0, -14, 15, 1, 0xd8a840);
  B(v, 'fan', -19, 23, 0, -8, 34, 0, 0xf4f0e4)
    .box(-19, 23, 0, -8, 23, 0, 0x1b1c26).box(-19, 34, 0, -8, 34, 0, 0x1b1c26)
    .box(-19, 23, 0, -19, 34, 0, 0x1b1c26).box(-8, 23, 0, -8, 34, 0, 0x1b1c26)
    .box(-14, 23, 0, -13, 34, 0, 0x7c5434).box(-14, 23, 0, -13, 24, 0, 0xd8a840);
  // Gold corner studs + crisp vertical ink-bamboo brushwork motif on the silk fan
  for (const [x, y] of [[-19, 23], [-8, 23], [-19, 34], [-8, 34]] as const) B(v, 'fan', x, y, 0, x, y, 0, 0xd8a840);
  B(v, 'fan', -17, 25, 0, -17, 32, 0, 0x364a46).box(-18, 29, 0, -16, 29, 0, 0x5a7870).box(-11, 26, 0, -11, 31, 0, 0x465e58).box(-10, 30, 0, -9, 30, 0, 0x5a7870);
  v.bone('blade', 'weapon', -13, 19, 1); ringBlade(v, 'blade', false, 34, true);
}

// ------------------------------------------------------------------ the kinds
function spearman(look: 0 | 1, el: boolean): V {
  const v = fine(); skel(v);
  body(v, { coat: look ? NAVY : 0x7a5a3a, coatD: look ? NAVY_D : 0x5a402a, trim: BLACK, trou: look ? 0x4a4a52 : 0x5a4a3a, sash: RED_D, sashD: 0x4a1410, skirt: 'short', legs: 'bare', arms: 'sleeve', elite: el });
  head(v, { beard: look ? 'stubble' : 'full' }); (look ? jin(BLACK, BLACK_L) : ze(RED, RED_D))(v, el); spear(v, el); return v;
}
function chainman(el: boolean): V {
  const v = fine(); skel(v);
  body(v, { coat: 0x6a4a34, coatD: 0x4e3626, trim: BLACK, trou: 0x3a3436, sash: RED, sashD: RED_D, skirt: 'short', legs: 'wrap', arms: 'bare', vest: 0x3a2a20, skin: 0xb87a52, elite: el });
  head(v, { beard: 'full', skin: 0xb87a52 }); knot(el ? GOLD : RED)(v, el); chain(v, el); return v;
}
function oilman(el: boolean): V {
  const v = fine(); skel(v);
  body(v, { coat: 0x5a4a3a, coatD: 0x463a2c, trim: RED_D, trou: 0x3a3436, sash: RED, sashD: RED_D, skirt: 'knee', legs: 'wrap', arms: 'sleeve', elite: el });
  head(v, { beard: 'stubble' }); ze(RED, RED_D)(v, el);
  B(v, 'head', -8, 40, 7, 7, 42, 8, 0x8a8478).box(-8, 41, 8, 7, 41, 8, 0x6a665e);   // a grey cloth over the mouth against the fumes (the eyes and brow bare)
  jar(v, el); return v;
}
function xbowman(el: boolean): V {
  const v = fine(); skel(v);
  body(v, { coat: RED, coatD: RED_D, trim: BLACK, trou: 0x2e3444, sash: BLACK, sashD: 0x141012, skirt: 'short', legs: 'wrap', arms: 'sleeve', vest: 0x5a3e28, elite: el });
  head(v, { beard: 'goatee' }); helm(false)(v, el); xbow(v, el);
  // the bolt case on the right hip
  B(v, 'hips', -11, 14, -3, -9, 23, 1, 0x5a3e28).box(-11, 24, -2, -9, 26, 0, 0xe0d8c8); return v;
}
function diver(el: boolean): V {
  const v = fine(), SK = 0x8a6448; skel(v);
  body(v, { coat: 0x1e2228, coatD: 0x14161a, trim: 0x14161a, trou: 0x1e2228, sash: 0x14161a, sashD: 0x0c0c0e, skirt: 'short', legs: 'bare', arms: 'bare', skin: SK, elite: el });
  // bare-chested: the skin over chest and waist, two dark bands of body paint (the elite's in gold), a rope at the waist
  cbox(v, 'chest', -10, 30, -6, 9, 37, 5, SK); cbox(v, 'spine', -8, 24, -6, 7, 29, 5, SK);
  B(v, 'chest', -10, 33, -6, 9, 34, 5, el ? GOLD : 0x2a3a4a); B(v, 'spine', -8, 26, -6, 7, 26, 5, el ? GOLD : 0x2a3a4a);
  head(v, { skin: SK }); knot(el ? GOLD : 0x2a3a4a)(v, el);
  B(v, 'head', -8, 44, 7, 7, 45, 7, null); v.part('head').symBox(2, 44, 7, 3, 45, 7, 0xd8c890);   // pale eyes under the wet brow
  hook(v, el); return v;
}
function shieldman(el: boolean): V {
  const v = fine(); skel(v);
  body(v, { coat: RED, coatD: RED_D, trim: BLACK, trou: 0x2e3444, sash: BLACK, sashD: 0x141012, skirt: 'knee', legs: 'boot', arms: 'sleeve', armour: true, elite: el });
  head(v, { beard: 'full' }); helm(true)(v, el); ringBlade(v, 'weapon', el); shield(v, el); return v;
}
function zhouAn(): V {
  // 周黯: an old, thin official — 进贤冠, a deep indigo robe with gold-edged wide sleeves (鹤氅), a bronze mirror over the heart,
  // grey long beard; the signal flag in the left hand, the sleeve-crossbow in the right; the iron-bound 锻谱 box at his hip
  const v = fine(); skel(v);
  body(v, { coat: 0x2a3050, coatD: 0x1c2038, trim: GOLD_D, trou: 0x1c1c22, sash: 0x5a2a24, sashD: 0x3e1c18, skirt: 'long', legs: 'boot', arms: 'wide', skin: 0xc49070, elite: false });
  B(v, 'chest', -4, 31, 6, 3, 36, 6, 0xb8893a).box(-2, 33, 7, 1, 35, 7, 0xe8c070).box(-1, 34, 7, 0, 34, 7, 0xf8e298);
  B(v, 'hips', 9, 10, -3, 12, 17, 4, 0x4a2a1c).box(9, 13, -3, 12, 13, 4, IRON).box(12, 14, 0, 12, 15, 1, GOLD).box(12, 15, 0, 12, 15, 1, 0xf8e298);
  head(v, { beard: 'long', skin: 0xc49070, old: true }); jinxian(JADE)(v, false); flag(v); sleeveBow(v); return v;
}
function servant(look: 0 | 1, el: boolean): V {
  const v = fine(); skel(v);
  body(v, { coat: look ? 0x7a6a52 : GREY, coatD: look ? 0x5a4e3c : GREY_D, trim: 0x3a3630, trou: 0x4a4640, sash: 0x3a3630, sashD: 0x2a2620, skirt: 'short', legs: 'wrap', arms: 'sleeve', elite: el });
  head(v, { beard: look ? undefined : 'stubble' }); jin(look ? 0x4a4640 : 0x3a3630, 0x2a2620)(v, el); staff(v, el); return v;
}
function swordsman(el: boolean): V {
  const v = fine(); skel(v);
  body(v, { coat: el ? CRIM : SILK, coatD: el ? CRIM_D : SILK_D, trim: el ? GOLD : INK, trou: INK_L, sash: el ? GOLD_D : INK, sashD: 0x0e0c10, skirt: 'knee', legs: 'boot', arms: 'wide', elite: el });
  head(v, { beard: 'goatee' });
  // a small black crown over the topknot; ELITE upgrades to a towering gilded crimson lotus sword-master crown + jade belt pendant!
  cbox2(v, 'head', -8, 52, -8, 7, 53, 7, HAIR, 2);
  B(v, 'head', -3, 54, -3, 2, el ? 62 : 58, 2, el ? CRIM : INK).box(-3, el ? 62 : 58, -3, 2, el ? 62 : 58, 2, el ? GOLD : INK_L).box(-6, 56, 0, 5, 56, 0, el ? GOLD : 0xc8c0a8);
  if (el) {
    B(v, 'head', -4, 54, -4, 3, 55, 3, GOLD).box(-2, 63, -2, 1, 65, 1, GOLD);
    B(v, 'hips', -6, 15, 7, -4, 19, 7, JADE).box(-5, 13, 7, -5, 14, 7, GOLD);
  }
  sword(v, el); return v;
}
function shade_(el: boolean): V {
  const v = fine(); skel(v);
  body(v, { coat: INK, coatD: 0x0e0c10, trim: el ? GOLD : INK_L, trou: INK, sash: INK_L, sashD: INK, skirt: 'short', legs: 'wrap', arms: 'sleeve', elite: el });
  v.paint(q => (q.c === LINEN || q.c === LINEN_D ? INK_L : null));   // the leg wraps and wrist cloths in black too
  head(v, { beard: 'goatee' }); hood(v, el); dagger(v, el); return v;
}
function guard(el: boolean): V {
  const v = fine(); skel(v);
  body(v, { coat: CRIM, coatD: CRIM_D, trim: INK, trou: INK_L, sash: INK, sashD: 0x0e0c10, skirt: 'knee', legs: 'boot', arms: 'sleeve', armour: true, elite: el });
  head(v, { beard: 'full' }); wuguan(v, el);
  // the 文家刀 — bright, the wave line down it — and its black lacquer scabbard on the left hip (the blade is drawn)
  ringBlade(v, 'weapon', el, 31, true);
  B(v, 'hips', 9, 12, -12, 10, 14, 6, INK).box(9, 12, -12, 10, 14, -12, el ? GOLD : 0x8a7a4a).box(9, 12, 6, 10, 14, 6, el ? GOLD : 0x8a7a4a);
  return v;
}
function zhuPlayer(el: boolean): V {
  const v = fine(); skel(v);
  body(v, { coat: 0xa8a49a, coatD: 0x86827a, trim: el ? GOLD : 0x5a5650, trou: 0x5a5650, sash: 0x5a5650, sashD: 0x3e3a36, skirt: 'long', legs: 'boot', arms: 'wide', elite: el });
  head(v, { beard: 'goatee', old: true }); jin(0x5a5650, 0x3e3a36)(v, el); zhu(v, el); return v;
}
function cuiXuan(): V {
  // 崔玄 (形态优先 · 标杆首领版): lean sculpted aristocratic skull & tapered jaw, sleek 3-beam white-jade 梁冠,
  // sloped ink-indigo brocade mantle, true bell-flared wide silk sleeves, graceful 3-tier A-line flared ivory robe, restrained antique gold & jade
  const v = fine(); skel(v);
  const IV = 0xe8e4d8, IV_L = 0xf7f5ee, IV_D = 0xb4bac4;
  const IN = 0x1b1c26, IN_L = 0x34384c, IN_D = 0x101118;
  const G = 0xb88e38, GD = 0x866422;
  const CJ = 0x7abaa0, CJ_D = 0x467866, WJ = 0xf4f8f0, CORD = 0x8a2428;
  const SK = 0xe0b490, SK_D = 0xb68666;
  body(v, { coat: IV, coatD: IV_D, trim: IN, trou: IN_L, sash: IN, sashD: IN_D, skirt: 'long', legs: 'boot', arms: 'wide', skin: SK, elite: false });
  // Clear old hips/robe/foreL/foreR to sculpt true articulated 3-tier A-line bell robe & flared wide sleeves!
  for (const [k, c] of [...v.cells]) if (c.part === 'hips' || c.part === 'robe1' || c.part === 'robe2' || c.part === 'foreL' || c.part === 'foreR' || c.part === 'chest' || c.part === 'spine') v.cells.delete(k);
  v.bone('robe1', 'hips', 0, 21, 0).bone('robe2', 'robe1', 0, 14, 0).bone('robe3', 'robe2', 0, 6, 0)
    .bone('pendL', 'hips', 5, 22, 7).bone('pendR', 'hips', -6, 22, 7);
  // Graceful articulated 3-tier A-line flared moonlight-ivory silk robe (hips waist -> robe1 -> robe2 -> robe3 wide octagonal hem!)
  cbox2(v, 'robe3', -12, 1, -10, 11, 5, 9, IV, 3); cbox2(v, 'robe3', -12, 1, -10, 11, 2, 9, IN, 3); cbox2(v, 'robe3', -12, 3, -10, 11, 3, 9, IV_D, 3);
  cbox2(v, 'robe2', -10, 6, -8, 9, 13, 7, IV, 2); cbox2(v, 'robe2', -10, 6, -8, 9, 6, 7, IV_D, 2);
  cbox2(v, 'robe1', -8, 14, -7, 7, 20, 6, IV, 2); cbox2(v, 'robe1', -8, 14, -7, 7, 14, 6, IV_D, 2);
  cbox2(v, 'hips', -8, 21, -7, 7, 21, 6, IV, 2);
  // Clean vertical silk drapery folds down front & back (matching each articulated tier)
  for (const x of [-6, -2, 1, 5]) { B(v, 'robe3', x, 4, 9, x, 5, 9, IV_D); B(v, 'robe2', x, 7, 7, x, 13, 7, IV_D); B(v, 'robe1', x, 15, 6, x, 20, 6, IV_D); }
  for (const x of [-4, -1, 0, 3]) { B(v, 'robe3', x, 4, 9, x, 5, 9, IV_L); B(v, 'robe2', x, 7, 7, x, 13, 7, IV_L); B(v, 'robe1', x, 15, 6, x, 20, 6, IV_L); }
  for (const x of [-5, 0, 4]) { B(v, 'robe3', x, 4, -10, x, 5, -10, IV_D); B(v, 'robe2', x, 7, -8, x, 13, -8, IV_D); B(v, 'robe1', x, 15, -7, x, 20, -7, IV_D); }
  // Real boots built by body() sit neatly beneath the 3-tier silk hem (no floating front toe-sliver)
  // Clean ink-silk belt with restrained white-jade center clasp & twin articulated celadon-jade pendants (pendL / pendR)
  cbox2(v, 'hips', -9, 22, -7, 8, 23, 6, IN, 2); cbox2(v, 'hips', -9, 23, -7, 8, 23, 6, IN_L, 2);
  B(v, 'hips', -2, 22, 7, 1, 23, 7, G).box(-1, 22, 7, 0, 23, 7, WJ);
  for (const [px, pn] of [[4, 'pendL'], [-7, 'pendR']] as const) {
    B(v, pn, px + 1, 19, 7, px + 1, 21, 7, CORD);
    B(v, pn, px, 15, 7, px + 2, 18, 7, CJ).box(px, 15, 7, px + 2, 15, 7, CJ_D).box(px + 1, 16, 7, px + 1, 17, 7, WJ);
    B(v, pn, px + 1, 11, 7, px + 1, 14, 7, WJ).box(px + 1, 9, 7, px + 1, 10, 7, CORD);
  }
  // Cinched waist (spine) + sloped broad ink-indigo brocade half-coat (chest) — restrained antique-gold border!
  cbox2(v, 'spine', -8, 24, -6, 7, 29, 5, IN, 2); B(v, 'spine', -3, 24, 5, 2, 29, 5, IV_L).box(2, 24, 5, 2, 29, 5, G).box(-1, 24, 5, 0, 29, 5, IV_D);
  cbox2(v, 'chest', -10, 30, -6, 9, 36, 6, IN, 2); cbox2(v, 'chest', -8, 37, -5, 7, 37, 4, IN_L, 2);
  B(v, 'chest', -4, 30, 6, 3, 36, 6, IV_L).box(-3, 36, 5, 2, 37, 5, IV_L).box(2, 30, 6, 3, 36, 6, G).box(2, 30, 6, 2, 36, 6, GD).box(-1, 30, 6, 0, 35, 6, IV_D);
  // Sloped brocade half-sleeves (armL/R) + TRUE bell-flared wide silk sleeves (foreL/R: narrower elbow -> wide flared hanging cuff!)
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 10, 15), outerX = s > 0 ? 15 : -16;
    const [ea, eb] = MX(s, 10, 15), [wa, wb] = MX(s, 9, 17);
    B(v, 'arm' + L, a, 30, -2, b, 37, 3, IN).box(a, 37, -2, b, 37, 3, IN_L).box(a, 30, -2, b, 30, 3, G);
    B(v, 'arm' + L, outerX, 37, -2, outerX, 37, 3, null).box(outerX, 36, -2, outerX, 36, -2, null).box(outerX, 36, 3, outerX, 36, 3, null);
    // Bell-flared wide silk sleeve: upper narrower at elbow (y=27..29), flaring generously downward & backward (y=21..26)!
    cbox2(v, 'fore' + L, ea, 27, -3, eb, 29, 4, IV, 1);
    cbox2(v, 'fore' + L, wa, 21, -5, wb, 26, 5, IV, 2);
    cbox2(v, 'fore' + L, wa, 21, -5, wb, 22, 5, IN, 2);
    B(v, 'fore' + L, wa + 1, 23, 5, wb - 1, 26, 5, IV_L).box(wa + 1, 23, -5, wb - 1, 26, -5, IV_D);
  }
  // Lean sculpted aristocratic scholar skull (narrowed -7..6, 2-cell corner bevels, tapered chin) + five-strand beard
  B(v, 'neck', -2, 38, -2, 1, 39, 1, SK).box(-2, 38, -2, 1, 38, 1, SK_D);
  cbox2(v, 'head', -7, 43, -7, 6, 53, 6, SK, 2);
  cbox2(v, 'head', -6, 41, -6, 5, 42, 6, SK, 2);
  cbox2(v, 'head', -4, 40, -5, 3, 40, 5, SK, 1);
  v.paint(q => (q.y >= 45 && (q.z <= -4 || ((q.x <= -6 || q.x >= 5) && q.z <= 2)) && q.c === SK ? 0x1b181c : null), 'head');
  v.part('head').symBox(2, 45, 6, 3, 46, 6, EYE).symBox(2, 47, 6, 4, 47, 6, 0x1b181c).box(-1, 44, 7, 0, 45, 7, SK_D);
  const B_M = 0x1b181c, B_L = 0x34303a;
  B(v, 'jaw', -4, 42, 5, 3, 42, 6, B_L).box(-5, 35, 6, -4, 41, 6, B_M).box(3, 35, 6, 4, 41, 6, B_M)
    .box(-5, 39, 6, -4, 41, 6, B_L).box(3, 39, 6, 4, 41, 6, B_L)
    .box(-2, 31, 6, 1, 41, 7, B_M).box(-1, 28, 6, 0, 30, 7, B_M).box(-1, 41, 7, 0, 41, 7, MOUTH);
  liangguan(v, false); fanAndBlade(v); return v;
}

const def = (d: ModelDef) => { if (!ROSTER.some(x => x.id === d.id)) ROSTER.push(d); return d; };
/** tip = the weapon's reach along its joint, in the model's own (fine) cells. (Written out as literal `id: '…'` entries: tests/act.test.ts
 *  finds each foe's model by that text in the module that touches ROSTER) */
const B2 = { line: '', kind: 'biped', attack: 'swing' } as const;
export const R45_DEFS = [
  def({ ...B2, id: 'wl_spear', name: '执矛水卒', group: '普通', role: '水卒', tip: 48, build: () => spearman(0, false) }),
  def({ ...B2, id: 'wl_spear_b', name: '执矛水卒', group: '普通', role: '水卒', tip: 48, build: () => spearman(1, false) }),
  def({ ...B2, id: 'wl_chain', name: '拽索手', group: '普通', role: '拽索', tip: 4, build: () => chainman(false) }),
  def({ ...B2, id: 'wl_chain_e', name: '拽索手', group: '精英', role: '拽索', tip: 4, build: () => chainman(true) }),
  def({ ...B2, id: 'wl_oil', name: '掷火卒', group: '普通', role: '掷火', tip: 4, build: () => oilman(false) }),
  def({ ...B2, id: 'wl_oil_e', name: '掷火卒', group: '精英', role: '掷火', tip: 4, build: () => oilman(true) }),
  def({ ...B2, id: 'wl_xbow', name: '楼船弩士', group: '普通', role: '弩士', tip: 20, build: () => xbowman(false) }),
  def({ ...B2, id: 'wl_xbow_e', name: '楼船弩士', group: '精英', role: '弩士', tip: 20, build: () => xbowman(true) }),
  def({ ...B2, id: 'wl_diver', name: '没水鬼', group: '普通', role: '水鬼', tip: 14, build: () => diver(false) }),
  def({ ...B2, id: 'wl_diver_e', name: '没水鬼', group: '精英', role: '水鬼', tip: 14, build: () => diver(true) }),
  def({ ...B2, id: 'wl_shield', name: '执楯刀士', group: '普通', role: '亲卫', tip: 29, build: () => shieldman(false) }),
  def({ ...B2, id: 'wl_shield_e', name: '执楯刀士', group: '精英', role: '亲卫', tip: 29, build: () => shieldman(true) }),
  def({ ...B2, id: 'wl_boss', name: '周默', group: '首领', role: '督造少监', tip: 9, scale: 1.20, build: zhouAn }),
  def({ ...B2, id: 'cx_club', name: '持杖僮奴', group: '普通', role: '僮奴', tip: 26, build: () => servant(0, false) }),
  def({ ...B2, id: 'cx_club_b', name: '持杖僮奴', group: '普通', role: '僮奴', tip: 26, build: () => servant(1, false) }),
  def({ ...B2, id: 'cx_sword', name: '门下剑客', group: '普通', role: '门客', tip: 32, build: () => swordsman(false) }),
  def({ ...B2, id: 'cx_sword_e', name: '门下剑客', group: '精英', role: '门客', tip: 32, build: () => swordsman(true) }),
  def({ ...B2, id: 'cx_shade', name: '匿影死士', group: '普通', role: '死士', tip: 17, build: () => shade_(false) }),
  def({ ...B2, id: 'cx_shade_e', name: '匿影死士', group: '精英', role: '死士', tip: 17, build: () => shade_(true) }),
  def({ ...B2, id: 'cx_guard', name: '百辟刀卫', group: '普通', role: '刀卫', tip: 31, build: () => guard(false) }),
  def({ ...B2, id: 'cx_guard_e', name: '百辟刀卫', group: '精英', role: '刀卫', tip: 31, build: () => guard(true) }),
  def({ ...B2, id: 'cx_zhu', name: '击筑客', group: '普通', role: '乐师', tip: 14, build: () => zhuPlayer(false) }),
  def({ ...B2, id: 'cx_zhu_e', name: '击筑客', group: '精英', role: '乐师', tip: 14, build: () => zhuPlayer(true) }),
  def({ ...B2, id: 'cx_boss', name: '崔玄', group: '首领', role: '司空长史', tip: 34, scale: 1.20, build: cuiXuan }),
];
