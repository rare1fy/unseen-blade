// 黄巾残村（地域一）的敌人模型：黄巾刀手、黄巾力士、符水道士、流民（两种）、黄巾弓手、猎犬、黄巾渠帅，各有精英版（_e：金边、发光的黄巾尾，
// enemy.ts 再放大 15%）。汉末装束：黄巾裹头（头顶一块大黄方，俯视镜头下一眼认出是黄巾）、交领短褐、绑腿、草鞋；不用和服、武士刀。
// act-22（用户：「都换成细格子吧，3.5这个的表现力好很多」）：全部按 3.5 厘米细格子重建（VoxChar(CELL / 2)，照 heroineFine.ts 的做法）。
// 骨骼名字、父子关系和关节位置（米）和 7 厘米版一模一样（格子坐标 × 2），所以动作代码一行不改；部件也一一对应（一个部件一次绘制）。
// 细格子用来交代身份：黄巾的结和两条尾、腰带结、绑腿系绳、草鞋襻、札甲一道道横带、渠帅的戟和护心镜、胡子、道士的水葫芦、弓手的箭囊带；
// 小臂、手、小腿比单纯 × 2 细（手要小），而且小臂 / 小腿的外侧面不和上臂 / 大腿共面（弯肘屈膝绕 x 轴转，共面会闪面）；刀身 / 弓臂 /
// 布尾一格薄。只用横平竖直的大块，2～3 档颜色，不撒随机点、不走斜线台阶（唯一的单格倒角在刀尖、下巴、各个方块的竖棱）。男人鼻子凸出一格。
// 注册进 bestiary ROSTER，enemy.ts import 本模块。
import { VoxChar, type Col } from '../../look/voxkit';
import { CELL, type V } from '../../bestiary/kit';
import { ROSTER, type ModelDef } from '../../bestiary/models';

const Y = 0xe4b230, Y_L = 0xf7d86c, Y_D = 0x9c6c16, GLOW = 0xffd84a, GLOW_D = 0xf0b030, GOLD = 0xe4b440, GOLD_D = 0xa67a1e;
const SKIN = 0xd2966e, SKIN_D = 0x9e6848, HAIR = 0x221814, EYE = 0x140e0a, MOUTH = 0x4e2a1c, LINEN = 0xb8ae96, LINEN_D = 0x7a6e5a;
const STRAW = 0xd2ad64, STRAW_D = 0x927034, INNER = 0xebe2ce;

/** one fine cell = 3.5 cm (half a scene cell: a scene block is exactly 2 × 2 × 2 of these) */
const fine = () => new VoxChar(CELL / 2);
const B = (v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null, g = 0) => v.part(part).box(x0, y0, z0, x1, y1, z1, c, g);
/** a box with its four vertical edges cut away (a one-cell chamfer down each corner column) */
function cbox(v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, g = 0) {
  v.part(part);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (!((x === x0 || x === x1) && (z === z0 || z === z1))) for (let y = y0; y <= y1; y++) v.set(x, y, z, c, g);
  return v;
}
/** a flat plate in the x-y plane at depth z, its four corner cells cut (a one-cell chamfer) */
function plate(v: V, part: string, x0: number, y0: number, x1: number, y1: number, z: number, c: Col) {
  v.part(part);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (!((x === x0 || x === x1) && (y === y0 || y === y1))) v.set(x, y, z, c);
  return v;
}
const SIDES = [['L', 1], ['R', -1]] as const;
/** a left-side x range, mirrored for the right side (cell x ↔ −1 − x) */
const MX = (s: number, a: number, b: number): [number, number] => (s > 0 ? [a, b] : [-1 - b, -1 - a]);
// ------------------------------------------------------------------ the biped skeleton (the 7 cm joints × 2, in fine cells)
interface Skel {
  hip: number; spine: number; chest: number; neck: number; head: number; jaw: [number, number]; hat: number; cape: [number, number];
  sh: [number, number, number]; fore: number; hand: number; weapon: [number, number, number]; offhand: [number, number, number]; leg: number; knee: number;
}
function skel(v: V, k: Skel) {
  const [sx, sy, sz] = k.sh;
  v.bone('hips', 'root', 0, k.hip, 0).bone('spine', 'hips', 0, k.spine, 0).bone('chest', 'spine', 0, k.chest, 0)
    .bone('neck', 'chest', 0, k.neck, 0).bone('head', 'neck', 0, k.head, 0).bone('jaw', 'head', 0, k.jaw[0], k.jaw[1]).bone('hat', 'head', 0, k.hat, 0)
    .bone('cape', 'chest', 0, k.cape[0], k.cape[1]);
  for (const [L, s] of SIDES) {
    v.bone('sh' + L, 'chest', s * sx, sy, sz).bone('arm' + L, 'sh' + L, s * sx, sy, sz).bone('fore' + L, 'arm' + L, s * sx, k.fore, sz).bone('hand' + L, 'fore' + L, s * sx, k.hand, sz)
      .bone('leg' + L, 'hips', s * k.leg, k.hip, 0).bone('shin' + L, 'leg' + L, s * k.leg, k.knee, 0).bone('foot' + L, 'shin' + L, s * k.leg, 4, 0);
  }
  v.bone('weapon', 'handR', ...k.weapon).bone('offhand', 'handL', ...k.offhand);
}

// ------------------------------------------------------------------ shared pieces
/** legs in straw sandals: a two-row sole running past the toes, the bare foot on it (the heel inside the leg wrap), a straw strap over
 *  the instep; the shin slimmer than the thigh, wrapped in linen with darker ties (or bare). The shin keeps one cell clear of the thigh's
 *  outer side (both sides when the leg is wide enough): a knee bend turns it about x, and faces sharing a plane would z-fight */
function sandalLegs(v: V, o: { x0: number; x1: number; z0: number; z1: number; knee: number; hip: number; trou: Col; wrap: boolean; toe: number; skin?: Col }) {
  const sk = o.skin ?? SKIN, zs = o.z1 - 1;
  for (const [L, s] of SIDES) {
    const wide = o.x1 - o.x0 >= 5, [a, b] = MX(s, o.x0, o.x1), [sa, sb] = MX(s, o.x0 + (wide ? 1 : 0), o.x1 - 1), f = 'foot' + L;
    B(v, f, a, 0, o.z0, b, 0, o.toe, STRAW_D); B(v, f, a, 1, o.z0, b, 1, o.toe, STRAW);
    B(v, f, sa, 2, o.z0, sb, 3, o.toe - 1, sk);
    if (o.wrap) B(v, f, sa, 2, o.z0, sb, 3, o.z0 + 2, LINEN);
    B(v, f, sa, 2, zs, sb, 3, zs, STRAW_D);
    B(v, 'shin' + L, sa, 4, o.z0, sb, o.knee - 1, zs, o.wrap ? LINEN : sk);
    if (o.wrap) B(v, 'shin' + L, sa, o.knee - 1, o.z0, sb, o.knee - 1, zs, LINEN_D).box(sa, 6, o.z0, sb, 6, zs, LINEN_D);
    B(v, 'leg' + L, a, o.knee, o.z0, b, o.hip - 1, o.z1, o.trou);
  }
}
/** a man's face on the front plane z = F: 2-row eyes, a frown (the brow on the eyes, its outer half a row thicker), a nose one cell
 *  proud, a mouth (rows given absolute) */
function face(v: V, o: { F: number; eyes: [number, number]; eyeY: number; brows: [number, number]; browY: number; nose: [number, number]; noseY: [number, number]; mouth?: [number, number, number]; noseC?: Col }) {
  const bm = Math.ceil((o.brows[0] + o.brows[1]) / 2);
  v.part('head').symBox(o.eyes[0], o.eyeY, o.F, o.eyes[1], o.eyeY + 1, o.F, EYE).symBox(o.brows[0], o.browY, o.F, o.brows[1], o.browY, o.F, HAIR)
    .symBox(bm, o.browY + 1, o.F, o.brows[1], o.browY + 1, o.F, HAIR)
    .box(o.nose[0], o.noseY[0], o.F + 1, o.nose[1], o.noseY[1], o.F + 1, o.noseC ?? SKIN_D);
  if (o.mouth) v.box(o.mouth[0], o.mouth[2], o.F, o.mouth[1], o.mouth[2], o.F, MOUTH);
}
/** hair at the back and the sides of the head, above row y (the face plane and the brow stay skin) */
function hair(v: V, o: { y: number; back: number; side: number; front: number; c?: Col; skin?: Col }) {
  v.paint(q => (q.y >= o.y && (q.z <= o.back || ((q.x <= -o.side - 1 || q.x >= o.side) && q.z <= o.front)) && q.c === (o.skin ?? SKIN) ? (o.c ?? HAIR) : null), 'head');
}
/**
 * 黄巾: a band of yellow cloth one cell proud all round the head (its lower row darker), the flat cap over the crown (its top row one cell
 * in — the big yellow square the top-down camera reads), a knot at the back, two tails on joints hanging from under the knot a cell
 * behind the hair, one cell thin (elite: glowing). Head footprint x0..x1 × z0..z1, band rows yb..yt; the tail joints sit where the 7 cm ones did (x ∓2, z0 − 5).
 */
/** a box with its four vertical edges chamfered by r cells (clean designer-toy rounded planes, zero bumpy stair-steps) */
function cbox2(v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, r = 2, g = 0) {
  v.part(part);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const ex = Math.min(x - x0, x1 - x), ez = Math.min(z - z0, z1 - z);
    if (ex + ez < r) continue;
    for (let y = y0; y <= y1; y++) v.set(x, y, z, c, g);
  }
  return v;
}
function turban(v: V, o: { x0: number; x1: number; z0: number; z1: number; yb: number; yt: number; tails: [number[], number[]]; glow: boolean }) {
  const { x0, x1, z0, z1, yb, yt } = o;
  cbox2(v, 'head', x0 - 1, yb, z0 - 1, x1 + 1, yt, z1 + 1, Y, 2);
  cbox2(v, 'head', x0 - 1, yb, z0 - 1, x1 + 1, yb, z1 + 1, Y_D, 2);
  cbox2(v, 'head', x0 - 1, yt, z0 - 1, x1 + 1, yt, z1 + 1, Y_L, 2);
  // Subtle front cloth fold tuck across the brow
  B(v, 'head', -3, yb + 1, z1 + 1, 2, yt - 1, z1 + 1, Y_L).box(-3, yb + 1, z1 + 1, 2, yb + 1, z1 + 1, Y_D);
  cbox2(v, 'head', x0, yt + 1, z0, x1, yt + 1, z1, Y, 2); B(v, 'head', x0 + 2, yt + 1, -1, x1 - 2, yt + 1, 0, Y_D);
  cbox2(v, 'head', x0 + 1, yt + 2, z0 + 1, x1 - 1, yt + 2, z1 - 1, Y_L, 2);
  if (o.glow) {
    // Elite headband brow ornament + gold top diadem ring (unmistakable top-down elite crown!)
    B(v, 'head', -2, yb, z1 + 2, 1, yt, z1 + 2, GOLD).box(-1, yb + 1, z1 + 2, 0, yt - 1, z1 + 2, GLOW, 1);
    cbox2(v, 'head', x0 + 2, yt + 3, z0 + 2, x1 - 2, yt + 3, z1 - 2, GOLD, 1);
  }
  // the knot: a layered block one cell proud of the band at the back
  B(v, 'head', -2, yb - 1, z0 - 2, 1, yt, z0 - 2, Y).box(-2, yt, z0 - 2, 1, yt, z0 - 2, Y_L).box(-2, yb + 1, z0 - 2, 1, yb + 1, z0 - 2, Y_D).box(-2, yb - 1, z0 - 1, 1, yb - 1, z0 - 1, Y_D);
  const zt = z0 - 1, g = o.glow ? 1 : 0, body = o.glow ? GLOW : Y, tip = o.glow ? GLOW_D : Y_D;
  const chain = (name: string, bx: number, xa: number, xb: number, lens: number[]) => {
    let y = yb, parent = 'head';
    lens.forEach((L, i) => {
      const bn = `${name}${i + 1}`, lo = y - L, hi = i === 0 ? yb - 2 : y - 1;
      v.bone(bn, parent, bx, y, z0 - 5);
      B(v, bn, xa, lo, zt, xb, hi, zt, body, g);
      if (!o.glow) B(v, bn, xa, lo + 1, zt, xa, hi, zt, Y_L, 0);
      if (i === lens.length - 1) B(v, bn, xa, lo, zt, xb, lo, zt, tip, g);
      parent = bn; y -= L;
    });
  };
  chain('scA', -2, -4, -2, o.tails[0]); chain('scB', 2, 1, 3, o.tails[1]);
}
/** the tails' lengths in fine cells (the 7 cm ones × 2): elites have longer, glowing ones */
const TAILS = (elite: boolean): [number[], number[]] => (elite ? [[8, 8, 6], [8, 8]] : [[6, 6], [6, 4]]);

// ------------------------------------------------------------------ 黄巾刀手 / 黄巾弓手
function soldier(elite: boolean, bow: boolean): V {
  const v = fine(), JK = bow ? 0x5c6838 : 0x7e5436, JK_D = bow ? 0x404a24 : 0x4c2e1c, JK_L = bow ? 0x728048 : 0xa4744e;
  const TROU = bow ? 0x4a3a2a : 0x2a3448, LEA = 0x3e322a, LEA_L = 0x5a483c, LEA_D = 0x281f1a;
  const BRZ = elite ? GOLD : 0xc8983c, BRZ_L = 0xf2d274, BRZ_D = 0x7e5c20;
  const SASH = elite ? GOLD : 0x36261e, SASH_L = elite ? BRZ_L : 0x523c2e, SASH_D = elite ? GOLD_D : 0x221712, TRIM = elite ? GOLD : JK_D;
  skel(v, { hip: 20, spine: 24, chest: 30, neck: 38, head: 40, jaw: [44, 4], hat: 54, cape: [36, -6], sh: [13, 38, 1], fore: 30, hand: 22,
    weapon: bow ? [-13, 20, 1] : [-13, 19, 1], offhand: bow ? [13, 19, 1] : [13, 20, 1], leg: 5, knee: 10 });
  sandalLegs(v, { x0: 2, x1: 7, z0: -2, z1: 3, knee: 10, hip: 20, trou: TROU, wrap: true, toe: 5 });
  // the short jacket's skirt on the thighs: flared A-line hem (!bow) + clean layered side hip guard
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 0, 8), [fa, fb] = MX(s, 0, 9), [oa, ob] = MX(s, 7, 8), [pa, pb] = MX(s, 4, 5);
    B(v, 'leg' + L, a, 16, -5, b, 19, 5, JK);
    B(v, 'leg' + L, bow ? a : fa, 14, -5, bow ? b : fb, 15, 5, JK).box(bow ? a : fa, 14, -5, bow ? b : fb, 14, 5, TRIM);
    if (!bow) {
      B(v, 'leg' + L, pa, 16, 5, pb, 19, 5, JK_L);
      B(v, 'leg' + L, oa, 15, -3, ob, 19, 3, LEA).box(oa, 19, -3, ob, 19, 3, LEA_L).box(oa, 15, -3, ob, 15, 3, LEA_D);
    }
  }
  // hips & cinched waist (V-taper silhouette!): leather sash with restrained single bronze clasp & simple dark hip pouch
  cbox(v, 'hips', -8, 20, -6, 7, 21, 5, JK); cbox2(v, 'hips', -9, 22, -7, 8, 23, 6, SASH, 2);
  cbox2(v, 'hips', -9, 23, -7, 8, 23, 6, SASH_L, 2);
  if (!bow) {
    B(v, 'hips', -2, 22, 7, 1, 23, 7, BRZ).box(-1, 23, 7, 0, 23, 7, BRZ_L);
    B(v, 'hips', -10, 16, -2, -9, 20, 2, LEA).box(-10, 20, -2, -9, 20, 2, LEA_L).box(-10, 16, -2, -9, 16, 2, LEA_D);
  }
  B(v, 'hips', 3, 21, 7, 5, 23, 7, SASH).box(3, 21, 6, 5, 21, 6, SASH_D).box(4, 16, 6, 5, 20, 6, SASH).box(4, 17, 6, 4, 20, 6, SASH_L).box(4, 16, 6, 5, 16, 6, SASH_D);
  // V-taper waist (slimmed spine) & sculpted broad chest with sloped shoulder contour (flush at z <= 5 for Box3 safety!)
  cbox2(v, 'spine', -7, 24, -5, 6, 29, 5, JK, 2);
  cbox2(v, 'chest', -10, 30, -6, 9, 36, 5, JK, 2);
  cbox2(v, 'chest', -8, 37, -5, 7, 37, 4, JK_L, 2);
  B(v, 'neck', -2, 38, -2, 1, 39, 1, SKIN); B(v, 'neck', -2, 38, -2, 1, 38, 1, SKIN_D);
  // 交领: dark collar band round the neck on the shoulders, pale inner collar at the throat, outer lapel down to the sash
  B(v, 'chest', -4, 37, -4, 3, 37, 3, TRIM);
  B(v, 'chest', -4, 36, 4, 1, 37, 5, INNER).box(2, 30, 5, 3, 37, 5, TRIM).box(2, 37, 4, 3, 37, 5, TRIM); B(v, 'spine', 2, 24, 5, 3, 29, 5, TRIM);
  if (!bow) {
    // Clean, bold charcoal-leather sleeveless vest (裲裆) — zero noisy studs or busy yellow stripes!
    B(v, 'chest', -8, 30, 5, -5, 36, 5, LEA).box(-8, 36, 5, -5, 36, 5, LEA_L).box(-8, 30, 5, -5, 30, 5, LEA_D);
    B(v, 'chest', 4, 30, 5, 7, 36, 5, LEA).box(4, 36, 5, 7, 36, 5, LEA_L).box(4, 30, 5, 7, 30, 5, LEA_D);
    B(v, 'chest', -7, 37, -4, -5, 37, 4, LEA_L).box(4, 37, -4, 6, 37, 4, LEA_L);
    B(v, 'chest', -8, 31, -6, 7, 35, -6, LEA).box(-8, 35, -6, 7, 35, -6, LEA_L).box(-8, 31, -6, 7, 31, -6, LEA_D);
    B(v, 'chest', -8, 32, 5, 7, 33, 5, LEA_D);
    B(v, 'spine', -6, 24, 5, -5, 29, 5, LEA).box(4, 24, 5, 5, 29, 5, LEA).box(-6, 25, -5, 5, 28, -5, LEA_D);
  }
  // arms: naturally sloped muscular shoulders (chamfered outer top edge!) + clean folded sleeve & wrapped forearm
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 10, 15), [fa, fb] = MX(s, 11, 14), [sa, sb] = MX(s, 12, 14), outerX = s > 0 ? 15 : -16;
    B(v, 'arm' + L, a, 30, -2, b, 37, 3, JK).box(a, 37, -2, b, 37, 3, JK_L).box(a, 30, -2, b, 30, 3, JK_D);
    B(v, 'arm' + L, outerX, 37, -2, outerX, 37, 3, null);                      // sloped natural shoulder line!
    B(v, 'arm' + L, outerX, 36, -2, outerX, 36, -2, null).box(outerX, 36, 3, outerX, 36, 3, null);
    if (!bow) {
      B(v, 'arm' + L, sa, 34, -2, sb, 37, 3, LEA).box(sa, 37, -2, sb, 37, 3, LEA_L).box(outerX, 34, -1, outerX, 36, 2, LEA);
      if (elite) {
        // Elite 黄巾百夫长: heavy layered iron-and-gold pauldrons flaring outward over both shoulders!
        const [pa, pb] = MX(s, 11, 17);
        B(v, 'arm' + L, pa, 33, -4, pb, 37, 4, 0x3e4450).box(pa, 38, -3, s > 0 ? 16 : -17, 38, 3, 0x5c6474)
          .box(pa, 33, -4, pb, 33, 4, GOLD).box(pa, 36, -4, pb, 36, 4, GOLD_D);
      }
    } else if (elite && s < 0) {
      // Elite 黄巾神射: asymmetric right iron-leather archer shoulder guard!
      B(v, 'armR', -17, 34, -3, -11, 38, 4, 0x4a3828).box(-17, 34, -3, -11, 34, 4, GOLD).box(-16, 38, -2, -11, 38, 3, 0x6c543c);
    }
    B(v, 'fore' + L, fa, 22, -2, fb, 29, 2, SKIN).box(fa, 22, -2, fb, 25, 2, LINEN).box(fa, 22, -2, fb, 22, 2, LINEN_D).box(fa, 24, -2, fb, 24, 2, LINEN_D);
    if (!bow) B(v, 'fore' + L, fa, 25, -2, fb, 25, 2, elite ? 0x3e4450 : LEA);
  }
  if (elite) {
    // Sweeping articulated officer cape (`cape` bone — swings dynamically in combat!)
    if (!bow) {
      B(v, 'cape', -10, 14, -8, 9, 36, -7, 0x6e241e).box(-8, 15, -9, 7, 34, -9, 0x8e3026).box(-10, 14, -9, 9, 15, -7, GOLD);
    } else {
      // Elite archer half-mantle & twin eagle feathers on turban!
      B(v, 'cape', -10, 20, -8, 1, 36, -7, 0x3a4424).box(-10, 20, -8, 1, 21, -7, GOLD);
      B(v, 'head', 6, 53, -1, 7, 62, 0, 0xf2eee4).box(6, 59, -1, 7, 62, 0, GOLD).box(8, 55, -2, 8, 60, -1, 0xe8e0cc);
    }
  }
  // sculpted rounded-bevel head (2-cell vertical corner chamfers -> breaks the flat brick head!) + tapered jaw
  cbox2(v, 'head', -8, 42, -8, 7, 53, 7, SKIN, 2);
  cbox2(v, 'head', -7, 40, -7, 6, 41, 7, SKIN, 2);
  hair(v, { y: 44, back: -5, side: 6, front: 3 });
  face(v, { F: 7, eyes: [2, 3], eyeY: 44, brows: [2, 5], browY: 46, nose: [-1, 0], noseY: [43, 44], mouth: bow ? [-2, 1, 41] : undefined });
  if (!bow) {
    v.part('head').symBox(3, 43, 7, 4, 43, 7, 0xdfa67e);
    // sculpted tapered two-tone full beard (chamfered sides, bold tapered chin silhouette)
    const BD = 0x261a14, BD_L = 0x3a281e, BD_D = 0x160e0a;
    v.paint(q => (q.y <= 44 && q.y >= 40 && (q.x <= -6 || q.x >= 5) && q.z >= 0 ? BD : null), 'head');
    B(v, 'jaw', -6, 38, 6, 5, 42, 8, BD).box(-5, 42, 7, 4, 42, 8, BD_L)
      .box(-4, 36, 6, 3, 37, 8, BD).box(-3, 35, 6, 2, 35, 8, BD_D)
      .box(-6, 38, 8, -6, 38, 8, null).box(5, 38, 8, 5, 38, 8, null).box(-2, 41, 8, 1, 41, 8, MOUTH);
  }
  turban(v, { x0: -8, x1: 7, z0: -8, z1: 7, yb: 50, yt: 53, tails: TAILS(elite), glow: elite });
  if (bow) {
    // the left fist round the bow's grip (no taller or wider than the wrist); the bow one cell thin: leather grip, staves, recurved tips, string
    const WD = elite ? 0x8a5a2a : 0x6a4a2a, WD_L = elite ? 0xa8743c : 0x84603a, GR = 0x3a2a1a, STR = 0xd8d0b8;
    B(v, 'handL', 12, 17, -1, 14, 21, 2, SKIN).box(14, 17, -1, 14, 20, 2, SKIN_D).box(13, 17, -1, 13, 20, 2, null);
    B(v, 'offhand', 13, 17, -3, 13, 20, 4, GR).box(13, 18, -22, 13, 18, -4, WD).box(13, 18, 5, 13, 18, 23, WD)
      .box(13, 18, -10, 13, 19, -4, WD).box(13, 18, 5, 13, 19, 11, WD).box(13, 19, -22, 13, 22, -21, WD_L).box(13, 19, 22, 13, 22, 23, WD_L);
    v.bone('stringA', 'offhand', 13.5, 23.5, -22).bone('stringB', 'offhand', 13.5, 23.5, 24);
    B(v, 'stringA', 13, 23, -22, 13, 23, 0, STR); B(v, 'stringB', 13, 23, 1, 13, 23, 23, STR);
    // the right hand: a small loose fist
    B(v, 'handR', -15, 17, -1, -13, 21, 2, SKIN).box(-15, 17, -1, -15, 20, 2, SKIN_D);
    // the quiver on the back: a leather tube with darker rims, two bundles of fletching; its strap straight over the left shoulder
    const QV = 0x5a3a24, QV_D = 0x3e2616, FL = 0xe0d8c8;
    B(v, 'chest', 5, 30, 6, 6, 37, 6, QV_D).box(5, 38, -6, 6, 38, 6, QV_D); B(v, 'spine', 5, 24, 6, 6, 29, 6, QV_D);
    B(v, 'spine', 2, 24, -10, 6, 41, -7, QV).box(2, 24, -10, 6, 24, -7, QV_D).box(2, 40, -10, 6, 41, -7, QV_D)
      .box(2, 42, -9, 3, 45, -8, FL).box(5, 42, -9, 6, 44, -8, FL);
  } else {
    // the left hand: open, small, hanging relaxed under the wrist
    B(v, 'handL', 12, 17, -1, 14, 21, 2, SKIN).box(14, 17, -1, 14, 19, 2, SKIN_D);
    // 環首刀: sculpted antique-bronze ring pommel, two-tone leather grip, bronze-rimmed guard, 3-tone forged blade
    B(v, 'handR', -15, 17, -1, -13, 21, 2, SKIN).box(-15, 17, -1, -15, 20, 2, SKIN_D).box(-14, 18, -1, -13, 19, 2, null);
    B(v, 'weapon', -14, 18, -3, -13, 19, 3, 0x261a14).box(-14, 18, -1, -13, 19, -1, 0x483424).box(-14, 18, 2, -13, 19, 2, 0x483424);
    B(v, 'weapon', -14, 17, -8, -13, 20, -4, BRZ).box(-14, 20, -8, -13, 20, -4, BRZ_L).box(-14, 17, -8, -13, 17, -4, BRZ_D).box(-14, 18, -7, -13, 19, -5, null);
    B(v, 'weapon', -14, 16, 4, -13, 21, 4, LEA_L).box(-14, 21, 4, -13, 21, 4, BRZ_L).box(-14, 16, 4, -13, 16, 4, BRZ_D);
    if (elite) B(v, 'weapon', -14, 10, -8, -13, 16, -6, 0xd4382c).box(-14, 15, -8, -13, 16, -6, 0xee5440).box(-14, 10, -8, -13, 11, -6, GOLD);
    // the blade (its own joint, so it can be hidden while sheathed): 3-tone forged cold steel; elite gets wider heavy great-sabre!
    v.bone('blade', 'weapon', -13, 19, 6);
    const bl = elite ? 32 : 29;
    B(v, 'blade', -14, 17, 5, -14, 19, 5, BRZ).box(-14, 17, 6, -14, 17, bl, 0xf6faff).box(-14, 18, 6, -14, 18, bl, 0xc2ccd8).box(-14, 18, bl - 2, -14, 18, bl, 0xf6faff).box(-14, 19, 6, -14, 19, bl - 2, 0x545e6e);
    if (elite) B(v, 'blade', -14, 20, 6, -14, 20, bl - 5, GOLD_D).box(-14, 20, bl - 6, -14, 20, bl - 4, GOLD);
  }
  return v;
}

// ------------------------------------------------------------------ 流民 (two looks: a hoe / a bamboo spear)
function mob(look: 0 | 1): V {
  const v = fine(), SH = look ? 0x8a6a48 : 0xb4a282, SH_D = look ? 0x664c32 : 0x8e7e60, TROU = 0x6a5c48, TROU_D = 0x544838, ROPE = 0x9a8058;
  skel(v, { hip: 16, spine: 20, chest: 26, neck: 32, head: 34, jaw: [38, 2], hat: 46, cape: [30, -4], sh: [10, 32, 0], fore: 24, hand: 18,
    weapon: [-9, 15, 1], offhand: [10, 16, 0], leg: 4, knee: 8 });
  // bare shins and feet in sandals, the trousers rolled up into a cuff below the knee
  sandalLegs(v, { x0: 2, x1: 5, z0: -2, z1: 1, knee: 8, hip: 16, trou: TROU, wrap: false, toe: 3 });
  for (const [L, s] of SIDES) { const [a, b] = MX(s, 1, 6); B(v, 'leg' + L, a, 8, -3, b, 9, 2, TROU_D); }
  // a long ragged shirt over the thighs, its hem darker, a whole piece torn out of each front hem (in a different place each side)
  B(v, 'legL', 0, 10, -4, 7, 15, 3, SH).box(0, 10, -4, 7, 10, 3, SH_D).box(4, 10, 3, 5, 11, 3, null);
  B(v, 'legR', -8, 10, -4, -1, 15, 3, SH).box(-8, 10, -4, -1, 10, 3, SH_D).box(-5, 10, 3, -3, 12, 3, null);
  // hips with a rope belt and its knot; slightly cinched waist, sloped shoulders on ragged shirt
  cbox2(v, 'hips', -8, 16, -4, 7, 19, 3, SH, 2); cbox2(v, 'hips', -8, 18, -4, 7, 18, 3, ROPE, 2); B(v, 'hips', 2, 15, 4, 3, 18, 4, ROPE);
  cbox2(v, 'spine', -7, 20, -4, 6, 25, 3, SH, 2); cbox2(v, 'chest', -8, 26, -4, 7, 30, 3, SH, 2); cbox2(v, 'chest', -6, 31, -3, 5, 31, 2, look ? 0xa07e58 : 0xc8b696, 2);
  B(v, 'chest', -4, 31, 2, 3, 31, 3, SH_D).box(-2, 30, 3, 1, 31, 3, SH_D);
  if (look === 0) B(v, 'chest', 2, 26, 4, 5, 29, 4, SH_D); else B(v, 'spine', -6, 21, -5, -2, 24, -5, SH_D);
  B(v, 'neck', -2, 32, -2, 1, 33, 1, SKIN); B(v, 'neck', -2, 32, -2, 1, 32, 1, SKIN_D);
  // arms: sloped shirt sleeve, bare forearm one cell slimmer, small hand
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 8, 11), [fa, fb] = MX(s, 8, 10), ox = s > 0 ? 11 : -12;
    B(v, 'arm' + L, a, 24, -2, b, 31, 1, SH).box(a, 24, -2, b, 24, 1, SH_D).box(ox, 31, -2, ox, 31, 1, null);
    B(v, 'fore' + L, fa, 18, -1, fb, 23, 1, SKIN);
  }
  B(v, 'handL', 8, 14, -1, 10, 17, 1, SKIN).box(10, 14, -1, 10, 16, 1, SKIN_D);
  B(v, 'handR', -11, 13, -1, -8, 17, 2, SKIN).box(-11, 13, -1, -11, 16, 2, SKIN_D).box(-10, 14, -1, -9, 15, 2, null);
  // sculpted rounded-bevel head with tapered jaw, smooth crown & tied topknot
  cbox2(v, 'head', -6, 36, -6, 5, 45, 5, SKIN, 2);
  cbox2(v, 'head', -5, 34, -5, 4, 35, 5, SKIN, 2);
  hair(v, { y: 38, back: -3, side: 4, front: 1 });
  face(v, { F: 5, eyes: [2, 3], eyeY: 38, brows: [2, 4], browY: 40, nose: [-1, 0], noseY: [36, 37], mouth: [-2, 1, 35] });
  cbox2(v, 'head', -6, 44, -6, 5, 45, 5, HAIR, 2); cbox2(v, 'head', -4, 46, -4, 3, 46, 3, HAIR, 1);
  B(v, 'head', -2, 46, -2, 1, 46, 1, LINEN_D).box(-2, 47, -2, 1, 48, 1, HAIR).box(-1, 49, -1, 0, 49, 0, HAIR);
  // yellow peasant brow band following the exact beveled contour + knot and two short ends at the back
  cbox2(v, 'head', -7, 41, -7, 6, 42, 6, Y, 3);
  cbox2(v, 'head', -6, 41, -6, 5, 42, 5, SKIN, 2);
  hair(v, { y: 41, back: -3, side: 4, front: 1 });
  B(v, 'head', -2, 40, -8, 1, 43, -8, Y_D).box(-3, 35, -8, -2, 39, -8, Y).box(1, 36, -8, 2, 39, -8, Y);
  // the weapon through the fist: a hoe (3-tone forged iron blade) / a bamboo spear (raised nodes, cut point)
  const x0 = -10, x1 = -9, y0 = 14, y1 = 15;
  if (look === 0) {
    const IR = 0x565a64;
    B(v, 'weapon', x0, y0, -10, x1, y1, 27, 0x7a5a36).box(x0 - 1, y0 - 1, 26, x1 + 1, y1 + 1, 29, 0x383c44)
      .box(-12, 6, 29, -7, 12, 29, IR).box(-12, 7, 29, -7, 8, 29, 0xb8c2ce).box(-12, 6, 29, -7, 6, 29, 0xeef4fa);
  } else {
    const BM = 0x7a9a4a, BM_D = 0x5a7a34;
    B(v, 'weapon', x0, y0, -12, x1, y1, 33, BM);
    for (const z of [-2, 10, 22]) v.box(x0 - 1, y0 - 1, z, x1 + 1, y1 + 1, z, BM_D);
    v.box(x0, y0, 34, x1, y1, 35, 0xd8d0a0).box(x0, y0, 36, x1, y0, 37, 0xece4b8);
  }
  return v;
}

// ------------------------------------------------------------------ 黄巾力士: huge, bare-chested under an open vest, a great iron-banded club
function brute(elite: boolean): V {
  const v = fine(), VEST = 0x3e2e22, VEST_L = 0x5a4430, TROU = 0x6a3424, SK = 0xb87a52, SKD = 0x8a5638, BAND = elite ? GOLD : 0x4a4c56, WOOD = 0x6e4a2a, WOOD_D = 0x54381e;
  const WRAP = elite ? GOLD : LINEN, BD = 0x2a1a12;
  skel(v, { hip: 18, spine: 24, chest: 32, neck: 42, head: 44, jaw: [48, 4], hat: 60, cape: [40, -8], sh: [21, 42, 1], fore: 32, hand: 22,
    weapon: [-21, 19, 1], offhand: [21, 19, 1], leg: 7, knee: 10 });
  sandalLegs(v, { x0: 2, x1: 11, z0: -4, z1: 5, knee: 10, hip: 18, trou: TROU, wrap: true, toe: 7, skin: SK });
  // hips in the trousers; the broad yellow sash (six rows over hips and waist), its knot and two hanging ends at the left
  cbox(v, 'hips', -14, 18, -8, 13, 23, 7, TROU); cbox(v, 'hips', -14, 22, -8, 13, 23, 7, Y);
  B(v, 'hips', 4, 20, 8, 8, 25, 8, Y_D).box(5, 11, 8, 6, 19, 8, Y).box(5, 11, 8, 6, 11, 8, Y_D);
  // waist (sculpted V-taper) and broad chest with sloped muscular shoulders in dark open leather vest
  cbox2(v, 'spine', -13, 24, -8, 12, 31, 7, VEST, 2); cbox2(v, 'spine', -13, 24, -8, 12, 27, 7, Y, 2);
  B(v, 'spine', -4, 28, 7, 3, 31, 7, SK); B(v, 'spine', -6, 28, 7, -5, 31, 7, VEST_L).box(4, 28, 7, 5, 31, 7, VEST_L);
  cbox2(v, 'chest', -16, 32, -8, 15, 40, 7, VEST, 2); cbox2(v, 'chest', -13, 41, -7, 12, 41, 6, VEST_L, 2);
  B(v, 'chest', -6, 32, 7, 5, 41, 7, SK).box(-6, 35, 7, 5, 35, 7, SKD).box(-6, 41, 4, 5, 41, 7, 0xcf8e64);
  B(v, 'chest', -8, 32, 7, -7, 41, 8, VEST_L).box(6, 32, 7, 7, 41, 8, VEST_L);
  B(v, 'neck', -4, 42, -3, 3, 43, 2, SK); B(v, 'neck', -4, 42, -3, 3, 42, 2, SKD);
  // sloped muscular bare shoulders & arms; ELITE gets massive spiked black-iron shoulder pauldrons & crimson war-cape!
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 16, 25), [fa, fb] = MX(s, 17, 24), ox = s > 0 ? 25 : -26;
    B(v, 'arm' + L, a, 32, -4, b, 41, 5, SK).box(a, 41, -4, b, 41, 5, 0xcf8e64);
    B(v, 'arm' + L, ox, 40, -4, ox, 41, 5, null).box(s > 0 ? 24 : -25, 41, -4, s > 0 ? 24 : -25, 41, 5, null);
    if (elite) {
      const [pa, pb] = MX(s, 16, 27), spx = s > 0 ? 25 : -26;
      B(v, 'arm' + L, pa, 35, -6, pb, 42, 6, 0x363a44).box(pa, 35, -6, pb, 35, 6, GOLD).box(pa, 42, -5, pb, 42, 5, 0x565c6c);
      B(v, 'arm' + L, spx, 43, -1, spx + (s > 0 ? 1 : -1), 46, 1, GOLD);
    }
    B(v, 'fore' + L, fa, 26, -4, fb, 31, 4, SK).box(a, 22, -4, b, 25, 5, WRAP).box(a, 25, -4, b, 25, 5, elite ? GOLD_D : LINEN_D);
  }
  if (elite) {
    B(v, 'cape', -14, 14, -10, 13, 40, -9, 0x6a221c).box(-14, 14, -10, 13, 15, -9, GOLD);
    B(v, 'cape', -10, 14, -10, -7, 17, -10, null).box(5, 14, -10, 8, 16, -10, null);
  }
  B(v, 'handL', 18, 16, -2, 24, 21, 4, SKD).box(24, 16, -2, 24, 20, 4, 0x6e4228);
  B(v, 'handR', -25, 16, -2, -19, 21, 4, SKD).box(-25, 16, -2, -25, 20, 4, 0x6e4228).box(-22, 18, -2, -21, 19, 4, null);
  // sculpted rounded-bevel brute head + fierce tapered beard (keeps y>=44 head Box3 exact!)
  cbox2(v, 'head', -8, 46, -8, 7, 59, 7, SK, 2);
  cbox2(v, 'head', -7, 44, -7, 6, 45, 7, SK, 2);
  hair(v, { y: 50, back: -5, side: 6, front: 3, skin: SK });
  v.paint(q => (q.y <= 50 && q.y >= 44 && (q.x <= -6 || q.x >= 5) && q.z >= 0 ? BD : null), 'head');
  face(v, { F: 7, eyes: [2, 4], eyeY: 49, brows: [2, 6], browY: 51, nose: [-2, 1], noseY: [47, 48], noseC: SKD });
  B(v, 'jaw', -6, 42, 6, 5, 45, 8, BD).box(-5, 39, 7, 4, 41, 9, BD).box(-3, 37, 7, 2, 38, 8, 0x18100c).box(-5, 46, 8, 4, 46, 8, BD).box(-2, 45, 8, 1, 45, 8, MOUTH);
  turban(v, { x0: -8, x1: 7, z0: -8, z1: 7, yb: 56, yt: 59, tails: TAILS(elite), glow: elite });
  // the club: a haft through the fist with an iron butt cap; a chamfered wooden head, two iron bands one cell proud, a stud in the
  // middle of each face, an iron cap
  B(v, 'weapon', -22, 18, -6, -21, 19, 11, 0x4a3420).box(-23, 17, -7, -20, 20, -7, BAND);
  const oct = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: Col) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (!((x === x0 || x === x1) && (y === y0 || y === y1))) v.box(x, y, z0, x, y, z1, c);
  };
  v.part('weapon'); oct(-25, 15, -18, 22, 12, 31, WOOD); oct(-25, 15, -18, 22, 12, 12, WOOD_D);
  for (const z of [15, 26]) oct(-26, 14, -17, 23, z, z + 1, BAND);
  v.box(-23, 17, 32, -20, 20, 33, BAND);
  v.box(-22, 23, 20, -21, 23, 21, GOLD_D).box(-22, 14, 20, -21, 14, 21, GOLD_D).box(-26, 18, 20, -26, 19, 21, GOLD_D).box(-17, 18, 20, -17, 19, 21, GOLD_D);
  if (elite) {
    // Elite heavy gilded war-mace: dense iron-gold stud rings & gilded crown cap (keeps y=14..23 slam floor exact!)
    for (const z of [13, 18, 23, 29]) {
      v.box(-22, 23, z, -21, 23, z, GOLD).box(-22, 14, z, -21, 14, z, GOLD)
        .box(-26, 18, z, -26, 19, z, GOLD).box(-17, 18, z, -17, 19, z, GOLD);
    }
    oct(-25, 15, -18, 22, 31, 31, GOLD);
    v.box(-23, 17, 32, -20, 20, 33, GOLD).box(-22, 18, 33, -21, 19, 33, GLOW, 1);
  }
  return v;
}

// ------------------------------------------------------------------ 符水道士: a yellow Taoist robe with a broad black collar, a peach-wood sword, talismans
function taoist(elite: boolean): V {
  const v = fine(), ROBE = 0xc89a38, ROBE_D = 0xa47a24, BLACK = 0x1e1a1c, PEACH = 0xc0705a, PEACH_D = 0x9a5040, PAPER = 0xf2d466, INK = 0xc02818, TRIM = elite ? GOLD : BLACK;
  skel(v, { hip: 20, spine: 24, chest: 30, neck: 38, head: 40, jaw: [44, 2], hat: 54, cape: [36, -6], sh: [11, 38, 1], fore: 30, hand: 22,
    weapon: [-11, 19, 1], offhand: [11, 19, 1], leg: 4, knee: 10 });
  v.bone('robe1', 'hips', 0, 21, 0).bone('robe2', 'robe1', 0, 14, 0).bone('robe3', 'robe2', 0, 6, 0)
    .bone('gourd', 'hips', 4, 21, -8).bone('pendL', 'hips', -2, 21, 6).bone('pendR', 'hips', -6, 21, 6)
    .bone('swTassel', 'weapon', -11.5, 17, -6);
  // Graceful articulated 3-tier A-line flared yellow Taoist robe (robe1 -> robe2 -> robe3)
  cbox2(v, 'robe3', -12, 0, -10, 11, 5, 9, ROBE, 3); cbox2(v, 'robe3', -12, 0, -10, 11, 2, 9, TRIM, 3); cbox2(v, 'robe3', -12, 3, -10, 11, 3, 9, ROBE_D, 3);
  cbox2(v, 'robe2', -10, 6, -8, 9, 13, 7, ROBE, 2); cbox2(v, 'robe2', -10, 6, -8, 9, 6, 7, ROBE_D, 2);
  cbox2(v, 'robe1', -8, 14, -6, 7, 20, 5, ROBE, 2); cbox2(v, 'hips', -8, 21, -6, 7, 21, 5, ROBE, 2); cbox2(v, 'hips', -9, 22, -7, 8, 23, 6, BLACK, 2);
  for (const [L, s] of SIDES) { const [a, b] = MX(s, 2, 5); B(v, 'foot' + L, a, 0, 2, b, 0, 8, INNER).box(a, 1, 2, b, 2, 8, BLACK).box(a, 1, 8, b, 2, 8, BLACK); }
  cbox2(v, 'spine', -7, 24, -6, 6, 29, 5, ROBE, 2); cbox2(v, 'chest', -8, 30, -6, 7, 36, 5, ROBE, 2); cbox2(v, 'chest', -6, 37, -5, 5, 37, 4, 0xdcb04c, 2);
  B(v, 'neck', -2, 38, -2, 1, 39, 1, SKIN); B(v, 'neck', -2, 38, -2, 1, 38, 1, SKIN_D);
  // the broad black collar: round the neck on the shoulders, the pale inner collar at the throat, the band straight down the front
  B(v, 'chest', -4, 37, -4, 3, 37, 3, TRIM).box(-4, 36, 4, 1, 37, 5, INNER).box(2, 30, 5, 4, 37, 5, TRIM).box(2, 37, 4, 4, 37, 5, TRIM);
  B(v, 'spine', 2, 24, 5, 4, 29, 5, TRIM); B(v, 'hips', 2, 21, 5, 4, 21, 5, TRIM); B(v, 'robe1', 2, 14, 5, 4, 20, 5, TRIM);
  // 符水: a water gourd tied to the sash at the back (articulated on gourd bone), a red stopper
  B(v, 'gourd', 2, 12, -11, 6, 16, -7, 0x9a6a2a).box(3, 17, -10, 5, 17, -8, 0x7a5020).box(3, 18, -10, 5, 20, -8, 0x9a6a2a).box(4, 21, -9, 4, 21, -9, 0xc8302a)
    .box(4, 21, -7, 4, 22, -7, 0xc8302a).box(2, 12, -11, 6, 12, -7, 0x7a5020);
  // two articulated talismans hanging from the sash (pendR / pendL), one cell proud of the robe
  for (const [x, pn] of [[-7, 'pendR'], [-3, 'pendL']] as const) B(v, pn, x, 12, 6, x + 2, 21, 6, PAPER, elite ? 1 : 0).box(x + 1, 13, 6, x + 1, 19, 6, INK);
  // arms: sloped Taoist shoulder + TRUE bell-flared wide sleeve on forearm
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 8, 13), [wa, wb] = MX(s, 8, 16), ox = s > 0 ? 13 : -14;
    B(v, 'arm' + L, a, 30, -2, b, 37, 3, ROBE).box(a, 37, -2, b, 37, 3, 0xdcb04c).box(ox, 37, -2, ox, 37, 3, null);
    cbox2(v, 'fore' + L, a, 27, -3, b, 29, 4, ROBE, 1);
    cbox2(v, 'fore' + L, wa, 22, -4, wb, 26, 5, ROBE, 2);
    cbox2(v, 'fore' + L, wa, 22, -4, wb, 23, 5, TRIM, 2);
  }
  // the fists: the right round the sword's grip, the left pinching a talisman in front of it
  B(v, 'handR', -13, 17, -1, -11, 21, 2, SKIN).box(-13, 17, -1, -13, 20, 2, SKIN_D).box(-12, 18, -1, -11, 19, 2, null);
  B(v, 'handL', 10, 17, -1, 12, 21, 2, SKIN).box(12, 17, -1, 12, 20, 2, SKIN_D);
  B(v, 'offhand', 11, 13, 3, 11, 21, 5, PAPER, elite ? 1 : 0).box(11, 14, 4, 11, 19, 4, INK);
  // lean sculpted scholar head (cbox2 + tapered chin) + moustache and long goatee
  cbox2(v, 'head', -6, 42, -6, 5, 53, 5, SKIN, 2);
  cbox2(v, 'head', -5, 40, -5, 4, 41, 5, SKIN, 2);
  hair(v, { y: 44, back: -3, side: 4, front: 1 });
  face(v, { F: 5, eyes: [2, 3], eyeY: 44, brows: [2, 4], browY: 46, nose: [-1, 0], noseY: [43, 44], mouth: [-1, 0, 41] });
  B(v, 'jaw', -4, 42, 6, 3, 42, 6, HAIR).box(-4, 41, 6, -4, 41, 6, HAIR).box(3, 41, 6, 3, 41, 6, HAIR)
    .box(-2, 39, 4, 1, 40, 6, HAIR).box(-2, 34, 6, 1, 38, 6, HAIR).box(-1, 32, 6, 0, 33, 6, HAIR);
  turban(v, { x0: -6, x1: 5, z0: -6, z1: 5, yb: 50, yt: 53, tails: TAILS(elite), glow: elite });
  // a black crown on the topknot, a gold pin through it; ELITE gets towering gilded lotus Daoist crown + sweeping black-gold crane cloak!
  B(v, 'head', -2, 56, -2, 1, 60, 1, BLACK).box(-2, 61, -2, 1, 61, 1, 0x363238).box(-5, 59, 0, 4, 59, 0, GOLD).box(-5, 59, 0, -5, 59, 0, 0xf6dc7a).box(4, 59, 0, 4, 59, 0, 0xf6dc7a);
  if (elite) {
    cbox2(v, 'head', -4, 56, -4, 3, 62, 3, BLACK, 1);
    B(v, 'head', -4, 57, 3, 3, 57, 3, GOLD).box(-3, 63, -3, 2, 65, 2, GOLD).box(-2, 66, -2, 1, 67, 1, GLOW, 1);
    B(v, 'head', -7, 60, 0, 6, 60, 0, GOLD).box(-7, 60, 0, -7, 60, 0, GLOW, 1).box(6, 60, 0, 6, 60, 0, GLOW, 1);
    B(v, 'cape', -10, 10, -8, 9, 36, -7, BLACK).box(-10, 10, -8, 9, 12, -7, GOLD).box(-10, 34, -8, 9, 36, -7, GOLD_D);
  }
  // the peach-wood sword: a dark grip, a red tassel on swTassel under the pommel, a guard, the wooden blade (elite: gilded glowing ritual sword!)
  B(v, 'weapon', -12, 18, -4, -11, 19, 3, 0x3a2418).box(-12, 17, -5, -11, 20, -5, elite ? GOLD : PEACH_D);
  B(v, 'swTassel', -12, 13, -6, -11, 16, -6, 0xc8302a);
  B(v, 'weapon', -12, 16, 4, -11, 21, 4, elite ? GOLD : PEACH_D);
  B(v, 'weapon', -12, 17, 5, -12, 19, elite ? 28 : 25, elite ? GOLD_D : PEACH).box(-12, 18, 5, -12, 18, elite ? 28 : 25, elite ? GLOW : PEACH_D, elite ? 1 : 0).box(-12, 18, elite ? 29 : 26, -12, 18, elite ? 30 : 27, elite ? GOLD : PEACH);
  return v;
}

// ------------------------------------------------------------------ 猎犬: a lean hound with a yellow cloth tied at the throat
function hound(elite: boolean): V {
  const v = fine(), F = 0x5a4c3e, FD2 = 0x483c30, FL = 0x9a8a70, FD = 0x2a2018, CL = elite ? GLOW : Y, CL_D = elite ? GLOW_D : Y_D, g = elite ? 1 : 0;
  v.bone('hips', 'root', 0, 18, -10).bone('chest', 'hips', 0, 18, 4).bone('neck', 'chest', 0, 24, 12).bone('head', 'neck', 0, 26, 16).bone('jaw', 'head', 0, 24, 24)
    .bone('legFL', 'chest', 4, 16, 8).bone('legFR', 'chest', -4, 16, 8).bone('legBL', 'hips', 4, 16, -14).bone('legBR', 'hips', -4, 16, -14).bone('tail', 'hips', 0, 22, -22).bone('tail2', 'tail', 0, 26, -24);
  // a lean body: the deep chest (its back's long edges chamfered, a pale brisket underneath at the front), a tucked-up loin; a darker
  // saddle along the back
  const back = (part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    cbox(v, part, x0, y0, z0, x1, y1 - 1, z1, F); cbox(v, part, x0 + 1, y1, z0, x1 - 1, y1, z1, F);
    v.paint(q => (q.y >= y1 - 1 ? FD2 : null), part);
  };
  back('chest', -6, 14, -4, 5, 25, 13); B(v, 'chest', -3, 14, 5, 2, 17, 13, FL);
  back('hips', -4, 16, -22, 3, 23, -3); B(v, 'hips', -3, 16, -20, 2, 16, -6, FL);
  // the neck reaching forward to the head, the cloth tied round it (a knot and a short end hanging at the throat; elite: glowing,
  // gold at the ends)
  cbox(v, 'neck', -4, 20, 10, 3, 29, 19, F);
  B(v, 'neck', -5, 22, 9, 4, 25, 20, CL, g).box(-5, 22, 9, 4, 22, 20, CL_D, g).box(-2, 17, 20, 1, 21, 20, CL, g).box(-2, 17, 20, 1, 17, 20, CL_D, g);
  if (elite) {
    // Elite war-hound: spiked iron neck collar & armored saddle plates + blazing golden dorsal mane!
    B(v, 'neck', -5, 23, 20, -5, 24, 20, GOLD).box(4, 23, 20, 4, 24, 20, GOLD);
    B(v, 'chest', -7, 21, -2, 6, 26, 11, 0x343842).box(-7, 21, -2, 6, 21, 11, GOLD);
    B(v, 'chest', -2, 26, -3, 1, 28, 12, GLOW, 1);
    B(v, 'hips', -1, 24, -20, 0, 25, -4, GLOW, 1);
  }
  // the head: skull, a long pale muzzle with a dark nose and a bare tooth row, amber eyes, pricked ears with dark tips; the lower jaw
  back('head', -4, 26, 14, 3, 33, 25);
  B(v, 'head', -2, 25, 26, 1, 29, 33, FL).box(-2, 28, 32, 1, 29, 33, FD).box(-2, 25, 32, 1, 25, 33, 0xe8e0d0).box(-2, 30, 26, 1, 30, 28, F);
  v.part('head').symBox(2, 30, 25, 2, 31, 25, elite ? GLOW : 0xd8a040, elite ? 1 : 0).symBox(2, 34, 16, 3, 39, 18, F).symBox(2, 38, 16, 3, 39, 18, elite ? GOLD : FD);
  B(v, 'jaw', -2, 22, 22, 1, 24, 32, FL).box(-2, 22, 22, 1, 22, 32, F);
  // legs: a muscled upper leg, a thin lower leg, a dark paw a cell wider and longer
  for (const [n, s, z] of [['legFL', 1, 4], ['legFR', -1, 4], ['legBL', 1, -18], ['legBR', -1, -18]] as Array<[string, number, number]>) {
    const [a, b] = MX(s, 2, 4), [la, lb] = MX(s, 2, 3);
    B(v, n, a, 10, z - 1, b, 17, z + 3, F).box(la, 2, z, lb, 9, z + 2, F).box(a, 0, z, b, 1, z + 4, FD);
  }
  // the tail: up from the croup, then curled forward over the back, its tip pale
  B(v, 'tail', -1, 20, -25, 0, 27, -23, F);
  B(v, 'tail2', -1, 28, -25, 0, 30, -16, F).box(-1, 28, -18, 0, 30, -16, FL);
  return v;
}

// ------------------------------------------------------------------ 黄巾渠帅: lamellar (札甲) over yellow robes, a bronze chest mirror, long scarf tails, a 戟
function boss(): V {
  const v = fine(), IRON = 0x474c58, IRON_L = 0x6c7280, IRON_D = 0x30343e, YR = 0xd0a02c, YR_D = 0x9a7418, BELT = 0x6a2a1e, BOOT = 0x2a2020, BOOT_L = 0x3e3030;
  const BRONZE = 0xb8893a, BRONZE_L = 0xe8c070, BD = 0x1e1410, TROU = 0x2a2a30;
  skel(v, { hip: 20, spine: 26, chest: 36, neck: 46, head: 48, jaw: [52, 4], hat: 64, cape: [44, -8], sh: [21, 46, 1], fore: 34, hand: 24,
    weapon: [-21, 21, 1], offhand: [21, 21, 1], leg: 7, knee: 10 });
  // high boots (a lighter cuff), dark trousers; the yellow robe's skirt to the knee with lamellar tassets over its upper part
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 2, 11), [sa, sb] = MX(s, 3, 10), [ka, kb] = MX(s, 0, 13);
    B(v, 'foot' + L, a, 0, -4, b, 0, 7, 0x161212).box(a, 1, -4, b, 1, 6, BOOT).box(sa, 2, -4, sb, 3, 6, BOOT);
    B(v, 'shin' + L, sa, 4, -4, sb, 9, 4, BOOT).box(sa, 8, -4, sb, 9, 4, BOOT_L);
    B(v, 'leg' + L, a, 10, -4, b, 19, 5, TROU);
    B(v, 'leg' + L, ka, 10, -6, kb, 19, 7, YR).box(ka, 10, -6, kb, 10, 7, YR_D).box(ka, 14, -6, kb, 19, 7, IRON).box(ka, 14, -6, kb, 14, 7, IRON_L).box(ka, 17, -6, kb, 17, 7, IRON_L);
  }
  // hips in the robe, the dark belt with antique-gold buckle; V-taper lamellar coat with sloped shoulder profile
  cbox2(v, 'hips', -14, 20, -8, 13, 23, 7, YR, 2); cbox2(v, 'hips', -15, 24, -9, 14, 25, 8, BELT, 2); B(v, 'hips', -2, 23, 9, 1, 26, 9, GOLD);
  cbox2(v, 'spine', -13, 26, -8, 12, 35, 7, IRON, 2); cbox2(v, 'chest', -16, 36, -8, 15, 44, 7, IRON, 2); cbox2(v, 'chest', -13, 45, -7, 12, 45, 6, IRON_L, 2);
  for (const p of ['spine', 'chest']) v.paint(q => ((q.y - 26) % 4 === 0 && q.c === IRON ? IRON_L : null), p);
  // the yellow robe at the neck (round it on the shoulders, deeper at the throat), the bronze mirror on the chest
  B(v, 'chest', -6, 45, -5, 5, 45, 4, YR).box(-6, 44, 5, 5, 45, 7, YR).box(-6, 44, 5, 5, 44, 7, YR_D);
  plate(v, 'chest', -4, 31, 3, 38, 8, BRONZE); B(v, 'chest', -2, 33, 8, 1, 36, 8, BRONZE_L).box(-1, 34, 8, 0, 35, 8, 0xf8e298);
  B(v, 'neck', -4, 46, -2, 3, 47, 1, SKIN); B(v, 'neck', -4, 46, -2, 3, 46, 1, SKIN_D);
  // arms: sloped layered lamellar pauldrons (chamfered top outer edge!) + yellow robe sleeve + iron bracers
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 16, 25), [pa, pb] = MX(s, 16, 26), [fa, fb] = MX(s, 17, 24), ox = s > 0 ? 26 : -27;
    B(v, 'arm' + L, a, 34, -4, b, 45, 5, IRON).box(pa, 38, -5, pb, 44, 6, IRON).box(pa, 38, -5, pb, 38, 6, IRON_D).box(pa, 42, -5, pb, 42, 6, IRON_L);
    B(v, 'arm' + L, a, 45, -4, b, 45, 5, IRON_L).box(ox, 43, -5, ox, 45, 6, null).box(s > 0 ? 25 : -26, 45, -5, s > 0 ? 25 : -26, 45, 6, null);
    B(v, 'fore' + L, fa, 28, -4, fb, 33, 4, YR).box(a, 24, -4, b, 27, 5, IRON).box(a, 27, -4, b, 27, 5, IRON_L);
  }
  B(v, 'handL', 18, 18, -2, 24, 23, 4, SKIN_D).box(24, 18, -2, 24, 22, 4, 0x7a5038);
  B(v, 'handR', -25, 18, -2, -19, 23, 4, SKIN_D).box(-25, 18, -2, -25, 22, 4, 0x7a5038).box(-22, 20, -2, -21, 21, 4, null);
  // sculpted rounded-bevel warlord head + bold tapered 3-tier beard
  cbox2(v, 'head', -8, 50, -8, 7, 63, 7, SKIN, 2);
  cbox2(v, 'head', -7, 48, -7, 6, 49, 7, SKIN, 2);
  hair(v, { y: 52, back: -5, side: 6, front: 3 });
  v.paint(q => (q.y <= 53 && q.y >= 48 && (q.x <= -6 || q.x >= 5) && q.z >= 0 ? BD : null), 'head');
  face(v, { F: 7, eyes: [2, 4], eyeY: 53, brows: [2, 6], browY: 55, nose: [-1, 0], noseY: [51, 53] });
  B(v, 'jaw', -6, 46, 6, 5, 49, 8, BD).box(-5, 42, 8, 4, 45, 9, BD).box(-3, 39, 8, 2, 41, 9, BD).box(-2, 38, 8, 1, 38, 8, 0x120c0a);
  B(v, 'jaw', -5, 50, 8, 4, 50, 8, BD).box(-2, 49, 8, 1, 49, 8, MOUTH);
  turban(v, { x0: -8, x1: 7, z0: -8, z1: 7, yb: 60, yt: 63, tails: [[8, 8, 8], [8, 8, 6]], glow: false });
  B(v, 'head', -2, 60, 8, 1, 63, 8, GOLD).box(-1, 61, 8, 0, 62, 8, 0xf4d070);
  // the 戟: a long dark haft with an iron butt, a red tassel, an iron socket, a straight spearhead one cell thin with bright edges, and
  // the 戈 blade out to the side, one cell thin, with an upturned tip
  const ST = 0xc8d0dc, ED = 0xeef2f8;
  B(v, 'weapon', -22, 20, -18, -21, 21, 43, 0x3a2418).box(-23, 19, -19, -20, 22, -19, IRON_D);
  B(v, 'weapon', -23, 18, 34, -20, 23, 37, 0xb82a22).box(-23, 18, 34, -20, 18, 37, 0x8a1e18);
  B(v, 'weapon', -23, 19, 40, -20, 22, 45, IRON);
  B(v, 'weapon', -22, 19, 46, -22, 22, 54, ST).box(-22, 19, 46, -22, 19, 54, ED).box(-22, 22, 46, -22, 22, 54, ED).box(-22, 20, 55, -22, 21, 57, ED);
  B(v, 'weapon', -32, 21, 41, -24, 21, 44, ST).box(-32, 21, 41, -24, 21, 41, ED).box(-32, 21, 45, -31, 21, 47, ED);
  return v;
}

/** The same jar sits in the thrower's hand, in his basket, and on the flight path. */
export function clayJar(v: V, part: string, x: number, y: number, z: number) {
  cbox(v, part, x - 4, y - 3, z - 4, x + 3, y + 2, z + 3, 0x9e5335);
  cbox(v, part, x - 3, y - 4, z - 3, x + 2, y - 4, z + 2, 0x603a2d);
  cbox(v, part, x - 3, y + 3, z - 3, x + 2, y + 3, z + 2, 0xb87950);
  B(v, part, x - 2, y + 4, z - 2, x + 1, y + 4, z + 1, 0x63392c);
  B(v, part, x - 2, y + 5, z - 2, x + 1, y + 5, z + 1, 0xa89972);
}

function farmhand(sickle: boolean): V {
  const v = fine();
  const coat = sickle ? 0x415b54 : 0x774638;
  const cuff = sickle ? 0x2a3d38 : 0x4d302b;
  skel(v, { hip: 20, spine: 24, chest: 30, neck: 38, head: 40, jaw: [44, 4], hat: 54, cape: [36, -6], sh: [12, 38, 0], fore: 30, hand: 22,
    weapon: [-12, 20, 0], offhand: [12, 20, 0], leg: 5, knee: 10 });
  sandalLegs(v, { x0: 2, x1: 7, z0: -3, z1: 3, knee: 10, hip: 20, trou: 0x3c3632, wrap: true, toe: 5 });
  for (const [side, sign] of SIDES) {
    const [x0, x1] = MX(sign, 0, 9), [a, b] = MX(sign, 10, 15), [u, w] = MX(sign, 11, 14), ox = sign > 0 ? 15 : -16;
    B(v, 'leg' + side, x0, 15, -5, x1, 19, 5, coat).box(x0, 15, -5, x1, 15, 5, cuff);
    B(v, 'arm' + side, a, 31, -3, b, 37, 2, coat).box(a, 30, -3, b, 31, 2, cuff).box(ox, 37, -3, ox, 37, 2, null);
    B(v, 'fore' + side, u, 24, -2, w, 29, 1, SKIN).box(u, 22, -2, w, 24, 1, LINEN_D);
    B(v, 'hand' + side, u, 18, -2, w, 21, 1, SKIN_D);
  }
  cbox2(v, 'hips', -9, 20, -6, 8, 23, 5, 0x48382a, 2);
  cbox2(v, 'spine', -7, 24, -5, 6, 29, 4, coat, 2);
  cbox2(v, 'chest', -10, 30, -5, 9, 36, 4, coat, 2); cbox2(v, 'chest', -8, 37, -4, 7, 37, 3, sickle ? 0x56746b : 0x925a48, 2);
  B(v, 'chest', -5, 36, 4, 1, 37, 4, INNER).box(1, 30, 4, 3, 36, 4, cuff);
  B(v, 'neck', -2, 38, -2, 1, 39, 1, SKIN); B(v, 'neck', -2, 38, -2, 1, 38, 1, SKIN_D);
  cbox2(v, 'head', -7, 42, -7, 6, 53, 6, SKIN, 2);
  cbox2(v, 'head', -6, 40, -6, 5, 41, 6, SKIN, 2);
  hair(v, { y: 43, back: -4, side: 5, front: 2 });
  face(v, { F: 6, eyes: [2, 3], eyeY: 44, brows: [2, 5], browY: 46, nose: [-1, 0], noseY: [42, 44], mouth: [-2, 1, 41] });
  turban(v, { x0: -7, x1: 6, z0: -7, z1: 6, yb: 50, yt: 53, tails: sickle ? [[8, 6], [5, 5]] : [[5, 4], [5, 4]], glow: false });

  if (sickle) {
    // A long-handled grain sickle. The broad hook reads from above, with one bevel on its inside edge.
    B(v, 'chest', -10, 33, -5, -5, 37, 5, 0x635445).box(-10, 33, -5, -5, 33, 5, 0x3f382d);
    B(v, 'weapon', -13, 19, -8, -12, 20, 32, 0x593b2a).box(-14, 18, -1, -11, 21, 5, 0x534937);
    B(v, 'weapon', -14, 18, 29, -11, 21, 32, 0x494c4e);
    B(v, 'weapon', -12, 20, 32, 0, 20, 38, 0xbfc5c6)
      .box(1, 20, 29, 4, 20, 37, 0xbfc5c6).box(4, 20, 25, 5, 20, 32, 0xd7dedb)
      .box(-10, 20, 32, 0, 20, 32, 0xe2e6df).box(1, 20, 29, 3, 20, 30, 0xe2e6df);
  } else {
    // A wicker pannier, two spare jars visible above the rim and broad shoulder straps.
    cbox(v, 'chest', -8, 23, -16, 7, 37, -6, 0x6b5032);
    B(v, 'chest', -8, 26, -16, 7, 27, -16, 0xa58955).box(-8, 31, -16, 7, 32, -16, 0xa58955)
      .box(-8, 36, -16, 7, 37, -16, 0xad8e58);
    for (const x of [-7, 4]) B(v, 'chest', x, 30, 5, x + 2, 37, 5, 0xa1865f).box(x, 37, -6, x + 2, 37, 5, 0xa1865f);
    clayJar(v, 'chest', -4, 38, -11); clayJar(v, 'chest', 4, 37, -11);
    v.bone('jar', 'weapon', -12, 20, 6);
    clayJar(v, 'jar', -12, 20, 6);
  }
  return v;
}

const def = (d: ModelDef) => { if (!ROSTER.some(x => x.id === d.id)) ROSTER.push(d); return d; };
/** tip = the weapon's reach along its joint, in the model's own (fine) cells */
export const HJ_DEFS = {
  blade: def({ id: 'hj_blade', name: '黄巾刀手', group: '普通', role: '刀手', line: '', kind: 'biped', attack: 'swing', tip: 30, build: () => soldier(false, false) }),
  blade_e: def({ id: 'hj_blade_e', name: '黄巾刀手', group: '精英', role: '刀手', line: '', kind: 'biped', attack: 'swing', tip: 30, build: () => soldier(true, false) }),
  archer: def({ id: 'hj_archer', name: '黄巾弓手', group: '普通', role: '弓手', line: '', kind: 'biped', attack: 'shoot', bowL: true, build: () => soldier(false, true) }),
  archer_e: def({ id: 'hj_archer_e', name: '黄巾弓手', group: '精英', role: '弓手', line: '', kind: 'biped', attack: 'shoot', bowL: true, build: () => soldier(true, true) }),
  brute: def({ id: 'hj_brute', name: '黄巾力士', group: '普通', role: '力士', line: '', kind: 'biped', attack: 'slam', tip: 32, build: () => brute(false) }),
  brute_e: def({ id: 'hj_brute_e', name: '黄巾力士', group: '精英', role: '力士', line: '', kind: 'biped', attack: 'slam', tip: 32, build: () => brute(true) }),
  taoist: def({ id: 'hj_taoist', name: '符水道士', group: '普通', role: '道士', line: '', kind: 'biped', attack: 'cast', tip: 26, build: () => taoist(false) }),
  taoist_e: def({ id: 'hj_taoist_e', name: '符水道士', group: '精英', role: '道士', line: '', kind: 'biped', attack: 'cast', tip: 26, build: () => taoist(true) }),
  mob: def({ id: 'hj_mob', name: '流民', group: '普通', role: '流民', line: '', kind: 'biped', attack: 'swing', tip: 28, build: () => mob(0) }),
  mob_b: def({ id: 'hj_mob_b', name: '流民', group: '普通', role: '流民', line: '', kind: 'biped', attack: 'swing', tip: 34, build: () => mob(1) }),
  hound: def({ id: 'hj_hound', name: '猎犬', group: '普通', role: '野兽', line: '', kind: 'quad', attack: 'bite', build: () => hound(false) }),
  hound_e: def({ id: 'hj_hound_e', name: '猎犬', group: '精英', role: '野兽', line: '', kind: 'quad', attack: 'bite', build: () => hound(true) }),
  boss: def({ id: 'hj_boss', name: '黄巾渠帅', group: '首领', role: '渠帅', line: '', kind: 'biped', attack: 'swing', tip: 56, scale: 1.08, build: boss }),
  sickle: def({ id: 'hj_sickle', name: '黄巾镰手', group: '普通', role: '镰手', line: '', kind: 'biped', attack: 'swing', tip: 37, build: () => farmhand(true) }),
  jar: def({ id: 'hj_jar', name: '黄巾掷罐手', group: '普通', role: '掷罐手', line: '', kind: 'biped', attack: 'swing', tip: 6, build: () => farmhand(false) }),
};
