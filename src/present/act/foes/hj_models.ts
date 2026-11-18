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

const Y = 0xe0b434, Y_D = 0xa8821c, GLOW = 0xffd84a, GLOW_D = 0xf0b030, GOLD = 0xe2b040, GOLD_D = 0xb08424;
const SKIN = 0xcc9670, SKIN_D = 0x9c6c4c, HAIR = 0x201814, EYE = 0x140e0a, MOUTH = 0x4a2a1c, LINEN = 0x9a917e, LINEN_D = 0x76705e;
const STRAW = 0xc4a05a, STRAW_D = 0x9a7a3e, INNER = 0xe6dfcc;

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
function turban(v: V, o: { x0: number; x1: number; z0: number; z1: number; yb: number; yt: number; tails: [number[], number[]]; glow: boolean }) {
  const { x0, x1, z0, z1, yb, yt } = o;
  cbox(v, 'head', x0 - 1, yb, z0 - 1, x1 + 1, yt, z1 + 1, Y); B(v, 'head', x0 - 1, yb, z0 - 1, x1 + 1, yb, z1 + 1, Y_D);
  for (const [x, z] of [[x0 - 1, z0 - 1], [x1 + 1, z0 - 1], [x0 - 1, z1 + 1], [x1 + 1, z1 + 1]]) v.box(x, yb, z, x, yt, z, null);
  cbox(v, 'head', x0, yt + 1, z0, x1, yt + 1, z1, Y); cbox(v, 'head', x0 + 1, yt + 2, z0 + 1, x1 - 1, yt + 2, z1 - 1, Y);
  // the knot: a block one cell proud of the band at the back, a darker tuck across it
  B(v, 'head', -2, yb - 1, z0 - 2, 1, yt, z0 - 2, Y).box(-2, yb + 1, z0 - 2, 1, yb + 1, z0 - 2, Y_D).box(-2, yb - 1, z0 - 1, 1, yb - 1, z0 - 1, Y);
  const zt = z0 - 1, g = o.glow ? 1 : 0, body = o.glow ? GLOW : Y, tip = o.glow ? GLOW_D : Y_D;
  const chain = (name: string, bx: number, xa: number, xb: number, lens: number[]) => {
    let y = yb, parent = 'head';
    lens.forEach((L, i) => {
      const bn = `${name}${i + 1}`, lo = y - L, hi = i === 0 ? yb - 2 : y - 1;
      v.bone(bn, parent, bx, y, z0 - 5);
      B(v, bn, xa, lo, zt, xb, hi, zt, body, g);
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
  const v = fine(), JK = bow ? 0x5c6838 : 0x7a5636, JK_D = bow ? 0x404a24 : 0x543a22, TROU = bow ? 0x4a3a2a : 0x2e3444;
  const SASH = elite ? GOLD : 0x3a2a20, SASH_D = elite ? GOLD_D : 0x261a12, TRIM = elite ? GOLD : JK_D;
  skel(v, { hip: 20, spine: 24, chest: 30, neck: 38, head: 40, jaw: [44, 4], hat: 54, cape: [36, -6], sh: [13, 38, 1], fore: 30, hand: 22,
    weapon: bow ? [-13, 20, 1] : [-13, 19, 1], offhand: bow ? [13, 19, 1] : [13, 20, 1], leg: 5, knee: 10 });
  sandalLegs(v, { x0: 2, x1: 7, z0: -2, z1: 3, knee: 10, hip: 20, trou: TROU, wrap: true, toe: 5 });
  // the short jacket's skirt on the thighs (each thigh carries its half, so a stride opens it), its hem one row darker
  for (const [L, s] of SIDES) { const [a, b] = MX(s, 0, 8); B(v, 'leg' + L, a, 14, -5, b, 19, 5, JK).box(a, 14, -5, b, 14, 5, TRIM); }
  // hips and the sash (two rows, one cell proud of the waist), its knot and two short tails hanging in front of the left thigh
  cbox(v, 'hips', -8, 20, -6, 7, 21, 5, JK); cbox(v, 'hips', -9, 22, -7, 8, 23, 6, SASH);
  B(v, 'hips', 3, 21, 7, 5, 23, 7, SASH).box(3, 21, 6, 5, 21, 6, SASH).box(4, 16, 6, 5, 20, 6, SASH).box(4, 16, 6, 5, 16, 6, SASH_D);
  // waist and chest (the chest's top row runs flat out to the shoulders), a short neck
  cbox(v, 'spine', -8, 24, -6, 7, 29, 5, JK); cbox(v, 'chest', -10, 30, -6, 9, 37, 5, JK);
  B(v, 'neck', -2, 38, -2, 1, 39, 1, SKIN);
  // 交领: a dark collar band round the neck on the shoulders, the pale inner collar at the throat, the outer edge straight down to the sash
  B(v, 'chest', -4, 37, -4, 3, 37, 3, TRIM);
  B(v, 'chest', -4, 36, 4, 1, 37, 5, INNER).box(2, 30, 5, 3, 37, 5, TRIM).box(2, 37, 4, 3, 37, 5, TRIM); B(v, 'spine', 2, 24, 5, 3, 29, 5, TRIM);
  // arms: the jacket sleeve with a darker hem; bare forearms with a linen wrap at the wrist, a cell in from the sleeve on both sides (the
  // elbow turns about x: no face of the forearm may share a plane with the sleeve's)
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 10, 15), [fa, fb] = MX(s, 11, 14);
    B(v, 'arm' + L, a, 30, -2, b, 37, 3, JK).box(a, 30, -2, b, 30, 3, JK_D);
    B(v, 'fore' + L, fa, 22, -2, fb, 29, 2, SKIN).box(fa, 22, -2, fb, 23, 2, LINEN);
  }
  // the head (16 × 14 × 16), corner columns cut; hair at the back and sides; the face
  cbox(v, 'head', -8, 40, -8, 7, 53, 7, SKIN);
  hair(v, { y: 44, back: -5, side: 6, front: 3 });
  face(v, { F: 7, eyes: [2, 3], eyeY: 44, brows: [2, 5], browY: 46, nose: [-1, 0], noseY: [43, 44], mouth: bow ? [-2, 1, 41] : undefined });
  if (!bow) {
    // a full black beard: from the sideburns round the jaw, hanging below the chin in two tiers; a moustache over the mouth
    const BD = 0x2a1c14;
    v.paint(q => (q.y <= 44 && q.y >= 40 && (q.x <= -7 || q.x >= 6) && q.z >= 0 ? BD : null), 'head');
    B(v, 'jaw', -7, 38, 6, 6, 42, 8, BD).box(-5, 35, 6, 4, 37, 8, BD).box(-2, 41, 8, 1, 41, 8, MOUTH);
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
    // 環首刀: the right fist round the grip, the ring pommel (a square outline one cell thick) behind it, a small guard, the blade
    B(v, 'handR', -15, 17, -1, -13, 21, 2, SKIN).box(-15, 17, -1, -15, 20, 2, SKIN_D).box(-14, 18, -1, -13, 19, 2, null);
    const RING = elite ? GOLD : 0x9a7a3a;
    B(v, 'weapon', -14, 18, -3, -13, 19, 3, 0x2a1e18).box(-14, 18, -1, -13, 19, -1, 0x3a2a20);
    B(v, 'weapon', -14, 17, -8, -13, 20, -4, RING).box(-14, 18, -7, -13, 19, -5, null);
    B(v, 'weapon', -14, 16, 4, -13, 21, 4, 0x5a4a3a);
    if (elite) B(v, 'weapon', -14, 12, -7, -13, 16, -6, 0xc8302a).box(-14, 12, -7, -13, 12, -6, 0x8a1e1a);
    // the blade (its own joint, so it can be hidden while sheathed): one cell thick, two edge rows and the back, a chisel tip
    v.bone('blade', 'weapon', -13, 19, 6);
    B(v, 'blade', -14, 17, 5, -14, 19, 5, 0x5a4a3a).box(-14, 17, 6, -14, 18, 29, 0xe8ecf2).box(-14, 19, 6, -14, 19, 27, 0x8a92a0);
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
  // hips with a rope belt and its knot; waist, chest, a patch sewn on the shirt
  cbox(v, 'hips', -8, 16, -4, 7, 19, 3, SH); cbox(v, 'hips', -8, 18, -4, 7, 18, 3, ROPE); B(v, 'hips', 2, 15, 4, 3, 18, 4, ROPE);
  cbox(v, 'spine', -8, 20, -4, 7, 25, 3, SH); cbox(v, 'chest', -8, 26, -4, 7, 31, 3, SH);
  B(v, 'chest', -4, 31, 2, 3, 31, 3, SH_D).box(-2, 30, 3, 1, 31, 3, SH_D);
  if (look === 0) B(v, 'chest', 2, 26, 4, 5, 29, 4, SH_D); else B(v, 'spine', -6, 21, -5, -2, 24, -5, SH_D);
  B(v, 'neck', -2, 32, -2, 1, 33, 1, SKIN);
  // arms: the shirt sleeve, a bare forearm one cell slimmer (on the outer side), a small hand
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 8, 11), [fa, fb] = MX(s, 8, 10);
    B(v, 'arm' + L, a, 24, -2, b, 31, 1, SH).box(a, 24, -2, b, 24, 1, SH_D);
    B(v, 'fore' + L, fa, 18, -1, fb, 23, 1, SKIN);
  }
  B(v, 'handL', 8, 14, -1, 10, 17, 1, SKIN).box(10, 14, -1, 10, 16, 1, SKIN_D);
  B(v, 'handR', -11, 13, -1, -8, 17, 2, SKIN).box(-11, 13, -1, -11, 16, 2, SKIN_D).box(-10, 14, -1, -9, 15, 2, null);
  // the head (12 × 12 × 12): the face, dark hair at back, sides and crown, a topknot tied with a strip of cloth
  cbox(v, 'head', -6, 34, -6, 5, 45, 5, SKIN);
  hair(v, { y: 38, back: -3, side: 4, front: 1 });
  face(v, { F: 5, eyes: [2, 3], eyeY: 38, brows: [2, 4], browY: 40, nose: [-1, 0], noseY: [36, 37], mouth: [-2, 1, 35] });
  cbox(v, 'head', -6, 44, -6, 5, 45, 5, HAIR); B(v, 'head', -2, 46, -2, 1, 46, 1, LINEN_D).box(-2, 47, -2, 1, 48, 1, HAIR).box(-1, 49, -1, 0, 49, 0, HAIR);
  // a strip of yellow cloth tied round the brow (no full wrap: dragooned peasants), the knot and two short ends at the back
  for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) if ((x === -7 || x === 6 || z === -7 || z === 6) && !((x === -7 || x === 6) && (z === -7 || z === 6))) v.box(x, 41, z, x, 42, z, Y);
  B(v, 'head', -2, 40, -8, 1, 43, -8, Y_D).box(-3, 35, -8, -2, 39, -8, Y).box(1, 36, -8, 2, 39, -8, Y);
  // the weapon through the fist: a hoe (iron socket and a one-cell-thin plate with a bright edge) / a bamboo spear (raised nodes, a cut point)
  const x0 = -10, x1 = -9, y0 = 14, y1 = 15;
  if (look === 0) {
    const IR = 0x6a6c74;
    B(v, 'weapon', x0, y0, -10, x1, y1, 27, 0x7a5a36).box(x0 - 1, y0 - 1, 26, x1 + 1, y1 + 1, 29, IR)
      .box(-12, 6, 29, -7, 12, 29, IR).box(-12, 6, 29, -7, 7, 29, 0xb8bcc4);
  } else {
    const BM = 0x7a9a4a, BM_D = 0x5a7a34;
    B(v, 'weapon', x0, y0, -12, x1, y1, 33, BM);
    for (const z of [-2, 10, 22]) v.box(x0 - 1, y0 - 1, z, x1 + 1, y1 + 1, z, BM_D);
    v.box(x0, y0, 34, x1, y1, 35, 0xd8d0a0).box(x0, y0, 36, x1, y0, 37, 0xd8d0a0);
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
  // waist and chest in the dark leather vest, open down the front over the bare belly and chest (a shadow under the pecs); a lighter
  // edge down each side of the opening
  cbox(v, 'spine', -14, 24, -8, 13, 31, 7, VEST); cbox(v, 'spine', -14, 24, -8, 13, 27, 7, Y);
  B(v, 'spine', -4, 28, 7, 3, 31, 7, SK); B(v, 'spine', -6, 28, 7, -5, 31, 7, VEST_L).box(4, 28, 7, 5, 31, 7, VEST_L);
  cbox(v, 'chest', -16, 32, -8, 15, 41, 7, VEST);
  B(v, 'chest', -6, 32, 7, 5, 41, 7, SK).box(-6, 35, 7, 5, 35, 7, SKD).box(-6, 41, 4, 5, 41, 7, SK);
  B(v, 'chest', -8, 32, 7, -7, 41, 7, VEST_L).box(6, 32, 7, 7, 41, 7, VEST_L);
  B(v, 'neck', -4, 42, -3, 3, 43, 2, SK);
  // bare arms; forearms a cell in from the upper arm on both sides, a wide wrap at each wrist (elite: gold); fists smaller than the 7 cm ones
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 16, 25), [fa, fb] = MX(s, 17, 24);
    B(v, 'arm' + L, a, 32, -4, b, 41, 5, SK);
    B(v, 'fore' + L, fa, 26, -4, fb, 31, 4, SK).box(a, 22, -4, b, 25, 5, WRAP).box(a, 25, -4, b, 25, 5, elite ? GOLD_D : LINEN_D);
  }
  B(v, 'handL', 18, 16, -2, 24, 21, 4, SKD).box(24, 16, -2, 24, 20, 4, 0x6e4228);
  B(v, 'handR', -25, 16, -2, -19, 21, 4, SKD).box(-25, 16, -2, -25, 20, 4, 0x6e4228).box(-22, 18, -2, -21, 19, 4, null);
  // the head (16 × 16 × 16): a wide face, heavy brows, a broad nose, a thick black beard and moustache
  cbox(v, 'head', -8, 44, -8, 7, 59, 7, SK);
  hair(v, { y: 50, back: -5, side: 6, front: 3, skin: SK });
  v.paint(q => (q.y <= 50 && q.y >= 44 && (q.x <= -7 || q.x >= 6) && q.z >= 0 ? BD : null), 'head');
  face(v, { F: 7, eyes: [2, 4], eyeY: 49, brows: [2, 6], browY: 51, nose: [-2, 1], noseY: [47, 48], noseC: SKD });
  B(v, 'jaw', -7, 42, 6, 6, 45, 8, BD).box(-5, 38, 8, 4, 41, 9, BD).box(-5, 46, 8, 4, 46, 8, BD).box(-2, 45, 8, 1, 45, 8, MOUTH);
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
  v.box(-22, 23, 20, -21, 23, 21, BAND).box(-22, 14, 20, -21, 14, 21, BAND).box(-26, 18, 20, -26, 19, 21, BAND).box(-17, 18, 20, -17, 19, 21, BAND);
  return v;
}

// ------------------------------------------------------------------ 符水道士: a yellow Taoist robe with a broad black collar, a peach-wood sword, talismans
function taoist(elite: boolean): V {
  const v = fine(), ROBE = 0xc89a38, ROBE_D = 0xa47a24, BLACK = 0x1e1a1c, PEACH = 0xc0705a, PEACH_D = 0x9a5040, PAPER = 0xf2d466, INK = 0xc02818, TRIM = elite ? GOLD : BLACK;
  skel(v, { hip: 20, spine: 24, chest: 30, neck: 38, head: 40, jaw: [44, 2], hat: 54, cape: [36, -6], sh: [11, 38, 1], fore: 30, hand: 22,
    weapon: [-11, 19, 1], offhand: [11, 19, 1], leg: 4, knee: 10 });
  // the robe to the ground in two clean tiers (a wide skirt, then straight), a dark hem; the black shoes' upturned toes peek out in front
  cbox(v, 'hips', -12, 0, -10, 11, 9, 9, ROBE); cbox(v, 'hips', -12, 0, -10, 11, 2, 9, TRIM); cbox(v, 'hips', -12, 9, -10, 11, 9, 9, ROBE_D);
  cbox(v, 'hips', -8, 10, -6, 7, 21, 5, ROBE); cbox(v, 'hips', -9, 22, -7, 8, 23, 6, BLACK);
  for (const [L, s] of SIDES) { const [a, b] = MX(s, 2, 5); B(v, 'foot' + L, a, 0, 10, b, 0, 11, INNER).box(a, 1, 10, b, 2, 10, BLACK).box(a, 1, 11, b, 3, 11, BLACK); }
  cbox(v, 'spine', -8, 24, -6, 7, 29, 5, ROBE); cbox(v, 'chest', -8, 30, -6, 7, 37, 5, ROBE);
  B(v, 'neck', -2, 38, -2, 1, 39, 1, SKIN);
  // the broad black collar: round the neck on the shoulders, the pale inner collar at the throat, the band straight down the front
  B(v, 'chest', -4, 37, -4, 3, 37, 3, TRIM).box(-4, 36, 4, 1, 37, 5, INNER).box(2, 30, 5, 5, 37, 5, TRIM).box(2, 37, 4, 5, 37, 5, TRIM);
  B(v, 'spine', 2, 24, 5, 5, 29, 5, TRIM); B(v, 'hips', 2, 10, 5, 5, 21, 5, TRIM);
  // 符水: a water gourd tied to the sash at the back, a red stopper
  B(v, 'hips', 2, 12, -11, 6, 16, -7, 0x9a6a2a).box(3, 17, -10, 5, 17, -8, 0x7a5020).box(3, 18, -10, 5, 20, -8, 0x9a6a2a).box(4, 21, -9, 4, 21, -9, 0xc8302a)
    .box(4, 21, -7, 4, 22, -7, 0xc8302a).box(2, 12, -11, 6, 12, -7, 0x7a5020);
  // two talismans hanging from the sash, one cell proud of the robe, a red stroke down each (elite: the paper glows)
  for (const x of [-7, -3]) B(v, 'hips', x, 12, 6, x + 2, 21, 6, PAPER, elite ? 1 : 0).box(x + 1, 13, 6, x + 1, 19, 6, INK);
  // arms: the robe sleeve, then the wide sleeve over the forearm with a dark cuff
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 8, 13), [wa, wb] = MX(s, 8, 15);
    B(v, 'arm' + L, a, 30, -2, b, 37, 3, ROBE);
    B(v, 'fore' + L, wa, 22, -4, wb, 29, 5, ROBE).box(wa, 22, -4, wb, 23, 5, TRIM);
  }
  // the fists: the right round the sword's grip, the left pinching a talisman in front of it
  B(v, 'handR', -13, 17, -1, -11, 21, 2, SKIN).box(-13, 17, -1, -13, 20, 2, SKIN_D).box(-12, 18, -1, -11, 19, 2, null);
  B(v, 'handL', 10, 17, -1, 12, 21, 2, SKIN).box(12, 17, -1, 12, 20, 2, SKIN_D);
  B(v, 'offhand', 11, 13, 3, 11, 21, 5, PAPER, elite ? 1 : 0).box(11, 14, 4, 11, 19, 4, INK);
  // the head (12 × 14 × 12): hair, the face, a thin moustache and a long goatee
  cbox(v, 'head', -6, 40, -6, 5, 53, 5, SKIN);
  hair(v, { y: 44, back: -3, side: 4, front: 1 });
  face(v, { F: 5, eyes: [2, 3], eyeY: 44, brows: [2, 4], browY: 46, nose: [-1, 0], noseY: [43, 44], mouth: [-1, 0, 41] });
  B(v, 'jaw', -4, 42, 6, 3, 42, 6, HAIR).box(-4, 41, 6, -4, 41, 6, HAIR).box(3, 41, 6, 3, 41, 6, HAIR)
    .box(-2, 39, 4, 1, 40, 6, HAIR).box(-2, 34, 6, 1, 38, 6, HAIR).box(-1, 32, 6, 0, 33, 6, HAIR);
  turban(v, { x0: -6, x1: 5, z0: -6, z1: 5, yb: 50, yt: 53, tails: TAILS(elite), glow: elite });
  // a black crown on the topknot, a gold pin through it: the tallest head in the band
  B(v, 'head', -2, 56, -2, 1, 61, 1, BLACK).box(-5, 59, 0, 4, 59, 0, GOLD);
  // the peach-wood sword: a dark grip, a red tassel under the pommel, a guard, the wooden blade one cell thin with a darker ridge, a point
  B(v, 'weapon', -12, 18, -4, -11, 19, 3, 0x3a2418).box(-12, 17, -5, -11, 20, -5, PEACH_D).box(-12, 13, -6, -11, 16, -6, 0xc8302a);
  B(v, 'weapon', -12, 16, 4, -11, 21, 4, PEACH_D);
  B(v, 'weapon', -12, 17, 5, -12, 19, 25, PEACH).box(-12, 18, 5, -12, 18, 25, PEACH_D).box(-12, 18, 26, -12, 18, 27, PEACH);
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
  if (elite) B(v, 'neck', -5, 23, 20, -5, 24, 20, GOLD).box(4, 23, 20, 4, 24, 20, GOLD);
  // the head: skull, a long pale muzzle with a dark nose and a bare tooth row, amber eyes, pricked ears with dark tips; the lower jaw
  back('head', -4, 26, 14, 3, 33, 25);
  B(v, 'head', -2, 25, 26, 1, 29, 33, FL).box(-2, 28, 32, 1, 29, 33, FD).box(-2, 25, 32, 1, 25, 33, 0xe8e0d0).box(-2, 30, 26, 1, 30, 28, F);
  v.part('head').symBox(2, 30, 25, 2, 31, 25, 0xd8a040).symBox(2, 34, 16, 3, 39, 18, F).symBox(2, 38, 16, 3, 39, 18, FD);
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
  // hips in the robe, the dark belt (one cell proud of the waist) with a gold buckle
  cbox(v, 'hips', -14, 20, -8, 13, 23, 7, YR); cbox(v, 'hips', -15, 24, -9, 14, 25, 8, BELT); B(v, 'hips', -2, 23, 9, 1, 26, 9, GOLD);
  // the lamellar coat: waist and chest in rows of plates, a lighter line at the foot of each row
  cbox(v, 'spine', -14, 26, -8, 13, 35, 7, IRON); cbox(v, 'chest', -16, 36, -8, 15, 45, 7, IRON);
  for (const p of ['spine', 'chest']) v.paint(q => ((q.y - 26) % 4 === 0 ? IRON_L : null), p);
  // the yellow robe at the neck (round it on the shoulders, deeper at the throat), the bronze mirror on the chest
  B(v, 'chest', -6, 45, -5, 5, 45, 4, YR).box(-6, 44, 5, 5, 45, 7, YR).box(-6, 44, 5, 5, 44, 7, YR_D);
  plate(v, 'chest', -4, 31, 3, 38, 8, BRONZE); B(v, 'chest', -2, 33, 8, 1, 36, 8, BRONZE_L);
  B(v, 'neck', -4, 46, -2, 3, 47, 1, SKIN);
  // arms: iron sleeves under shoulder guards one cell proud (two rows of plates), the yellow robe sleeve below, iron bracers; small fists
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 16, 25), [pa, pb] = MX(s, 16, 26), [fa, fb] = MX(s, 17, 24);
    B(v, 'arm' + L, a, 34, -4, b, 45, 5, IRON).box(pa, 38, -5, pb, 45, 6, IRON).box(pa, 38, -5, pb, 38, 6, IRON_D).box(pa, 42, -5, pb, 42, 6, IRON_L);
    B(v, 'fore' + L, fa, 28, -4, fb, 33, 4, YR).box(a, 24, -4, b, 27, 5, IRON).box(a, 27, -4, b, 27, 5, IRON_L);
  }
  B(v, 'handL', 18, 18, -2, 24, 23, 4, SKIN_D).box(24, 18, -2, 24, 22, 4, 0x7a5038);
  B(v, 'handR', -25, 18, -2, -19, 23, 4, SKIN_D).box(-25, 18, -2, -25, 22, 4, 0x7a5038).box(-22, 20, -2, -21, 21, 4, null);
  // the head: a wide face, heavy brows, a strong nose; a long black beard in three tiers down onto the chest
  cbox(v, 'head', -8, 48, -8, 7, 63, 7, SKIN);
  hair(v, { y: 52, back: -5, side: 6, front: 3 });
  v.paint(q => (q.y <= 53 && q.y >= 48 && (q.x <= -7 || q.x >= 6) && q.z >= 0 ? BD : null), 'head');
  face(v, { F: 7, eyes: [2, 4], eyeY: 53, brows: [2, 6], browY: 55, nose: [-1, 0], noseY: [51, 53] });
  B(v, 'jaw', -7, 46, 6, 6, 49, 8, BD).box(-6, 42, 8, 5, 45, 9, BD).box(-3, 39, 8, 2, 41, 9, BD);
  B(v, 'jaw', -5, 50, 8, 4, 50, 8, BD).box(-2, 49, 8, 1, 49, 8, MOUTH);
  turban(v, { x0: -8, x1: 7, z0: -8, z1: 7, yb: 60, yt: 63, tails: [[8, 8, 8], [8, 8, 6]], glow: false });
  B(v, 'head', -2, 60, 9, 1, 63, 9, GOLD).box(-1, 61, 9, 0, 62, 9, 0xf4d070);
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
    const [x0, x1] = MX(sign, 0, 8), [a, b] = MX(sign, 10, 15), [u, w] = MX(sign, 11, 14);
    B(v, 'leg' + side, x0, 16, -5, x1, 19, 5, coat).box(x0, 16, -5, x1, 16, 5, cuff);
    B(v, 'arm' + side, a, 31, -3, b, 37, 2, coat).box(a, 30, -3, b, 31, 2, cuff);
    B(v, 'fore' + side, u, 24, -2, w, 29, 1, SKIN).box(u, 22, -2, w, 24, 1, LINEN_D);
    B(v, 'hand' + side, u, 18, -2, w, 21, 1, SKIN_D);
  }
  cbox(v, 'hips', -9, 20, -6, 8, 23, 5, 0x48382a);
  cbox(v, 'spine', -8, 24, -5, 7, 29, 4, coat);
  cbox(v, 'chest', -10, 30, -5, 9, 37, 4, coat);
  B(v, 'chest', -5, 36, 4, 1, 37, 4, INNER).box(1, 30, 4, 3, 36, 4, cuff);
  B(v, 'neck', -2, 38, -2, 1, 39, 1, SKIN_D);
  cbox(v, 'head', -7, 40, -7, 6, 53, 6, SKIN);
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
  boss: def({ id: 'hj_boss', name: '黄巾渠帅', group: '首领', role: '渠帅', line: '', kind: 'biped', attack: 'swing', tip: 56, build: boss }),
  sickle: def({ id: 'hj_sickle', name: '黄巾镰手', group: '普通', role: '镰手', line: '', kind: 'biped', attack: 'swing', tip: 37, build: () => farmhand(true) }),
  jar: def({ id: 'hj_jar', name: '黄巾掷罐手', group: '普通', role: '掷罐手', line: '', kind: 'biped', attack: 'swing', tip: 6, build: () => farmhand(false) }),
};
