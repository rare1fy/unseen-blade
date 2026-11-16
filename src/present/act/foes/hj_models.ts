// 黄巾残村（地域一）的敌人模型：黄巾刀手、黄巾力士、符水道士、流民（两种）、黄巾弓手、猎犬、黄巾渠帅，各有精英版（_e：金边、发光的黄巾尾，
// enemy.ts 再放大 15%）。汉末装束：黄巾裹头（头顶一块大黄方，俯视镜头下一眼认出是黄巾）、交领短褐、绑腿、草鞋；不用和服、武士刀。
// 只用横平竖直的大块，2～3 档颜色，不撒随机点、不走斜线台阶（CLAUDE.md 美术铁律）。注册进 bestiary ROSTER，enemy.ts import 本模块。
import { newChar, biped, rbox, type V, type Anchors, type Biped } from '../../bestiary/kit';
import { heroGrip, ROSTER, type ModelDef } from '../../bestiary/models';
import type { Col } from '../../look/voxkit';
import { ringSword } from '../blind';

const Y = 0xe0b434, Y_D = 0xa8821c, GLOW = 0xffd84a, GOLD = 0xe2b040;
const SKIN = 0xcc9670, SKIN_D = 0x9c6c4c, HAIR = 0x201814, EYE = 0x140e0a, LINEN = 0x9a917e, LINEN_D = 0x76705e, STRAW = 0xc4a05a, INNER = 0xe6dfcc;

/** the chest's top row filled out to the shoulders (a flat shoulder line), a short neck */
function shoulders(v: V, A: Anchors, c: Col, neck = 2) {
  const cw = A.chestW, hz = A.torsoD / 2, T1 = A.torsoY1; v.part('chest');
  for (let x = -cw / 2; x <= cw / 2 - 1; x++) for (let z = -hz; z <= hz - 1; z++) if (Math.min(x + cw / 2, cw / 2 - 1 - x) + Math.min(z + hz, hz - 1 - z) >= 1) v.set(x, T1, z, c);
  if (A.headY0 > T1 + 1) v.part('neck').box(-neck / 2, T1 + 1, -1, neck / 2 - 1, A.headY0 - 1, 0, SKIN);
}
/** 交领: a pale inner collar across the throat and the outer edge as one straight strip down the front */
function collar(v: V, A: Anchors, inner: Col, edge: Col) {
  const zf = A.torsoD / 2 - 1, T1 = A.torsoY1, T0 = A.torsoY0;
  for (const p of ['chest', 'spine']) v.paint(c => (c.z === zf && c.y === T1 && c.x >= -2 && c.x <= 1 ? inner : c.z === zf && c.x === 1 && c.y >= T0 && c.y < T1 ? edge : null), p);
}
/** the short jacket's skirt on the thighs (each thigh carries its half, so a stride opens it) */
function skirt(v: V, A: Anchors, rows: number, c: Col, hem: Col) {
  const y0 = A.hipY - rows;
  v.part('legL').box(0, y0, -2, 4, A.hipY - 1, 2, c).box(0, y0, -2, 4, y0, 2, hem);
  v.part('legR').box(-5, y0, -2, -1, A.hipY - 1, 2, c).box(-5, y0, -2, -1, y0, 2, hem);
}
/** wrapped shins (a darker binding at the top) and straw sandals */
function legsHan(v: V, A: Anchors, wrap: Col | null) {
  const knee = Math.max(2, Math.round(A.legH / 2));
  for (const s of ['L', 'R']) {
    if (wrap != null) v.paint(c => (c.y === knee - 1 ? LINEN_D : wrap), 'shin' + s);
    v.paint(c => (c.y === 0 ? STRAW : c.y === 1 && c.z >= 1 ? SKIN : null), 'foot' + s);
  }
}
/** eyes, brows, nose, mouth on the face plane; hair at the back and sides */
function face(v: V, A: Anchors, o: { beard?: Col; wide?: boolean } = {}) {
  const H0 = A.headY0, F = A.faceZ, e = o.wide ? 2 : 1;
  v.paint(c => ((c.z <= A.headZ - A.headD / 2 + 1 || (Math.abs(c.x + 0.5) >= A.headW / 2 - 0.5 && c.z < F - 1)) && c.y >= H0 + 2 ? HAIR : null), 'head');
  v.part('head').symBox(1, H0 + 2, F, e, H0 + 2, F, EYE).symBox(1, H0 + 3, F, e + 1, H0 + 3, F, HAIR)
    .box(-1, H0 + 1, F + 1, 0, H0 + 1, F + 1, SKIN_D).box(-1, H0, F, 0, H0, F, 0x4a2a1c);
  if (o.beard) v.part('jaw').box(-A.headW / 2 + 1, H0 - 2, F, A.headW / 2 - 2, H0, F + 1, o.beard).box(-1, H0, F + 1, 0, H0, F + 1, 0x4a2a1c);
}
/** 黄巾: the top rows of the head wrapped one cell proud all round, a flat cap, a knot at the back, two tails on joints (elite: glowing) */
function turban(v: V, A: Anchors, tails: [number[], number[]], glow = false, rows = 2) {
  const x0 = -A.headW / 2 - 1, x1 = A.headW / 2, z0 = A.headZ - A.headD / 2 - 1, z1 = A.faceZ + 1, yb = A.headY1 - rows + 1, g = glow ? 1 : 0;
  v.part('head');
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = yb; y <= A.headY1 + 1; y++) {
    const ex = Math.min(x - x0, x1 - x), ez = Math.min(z - z0, z1 - z);
    if (ex + ez < 1) continue;
    if (y === A.headY1 + 1 && (ex < 1 || ez < 1)) continue;
    v.set(x, y, z, y === yb ? Y_D : Y);
  }
  v.box(-1, A.headY1 - 1, z0 - 1, 0, A.headY1, z0 - 1, Y_D);
  const chain = (name: string, xa: number, lens: number[]) => {
    let y = A.headY1 - 2, parent = 'head';
    lens.forEach((L, i) => {
      const bn = `${name}${i + 1}`; v.bone(bn, parent, xa + 1, y + 1, z0 - 1.5);
      v.part(bn).box(xa, y - L + 1, z0 - 2, xa + 1, y, z0 - 2, glow ? GLOW : Y, g);
      if (i === lens.length - 1) v.box(xa, y - L + 1, z0 - 2, xa + 1, y - L + 1, z0 - 2, glow ? GLOW : Y_D, g);
      parent = bn; y -= L;
    });
  };
  chain('scA', -2, tails[0]); chain('scB', 0, tails[1]);
}

const MAN: Partial<Biped> = { legH: 10, legW: 3, legD: 3, legGap: 1, hipH: 2, torsoH: 7, torsoW: 8, chestW: 10, torsoD: 6, neckH: 1, headW: 8, headH: 7, headD: 8, armW: 3, upper: 4, fore: 4, hand: 2 };
const TAILS = (elite: boolean): [number[], number[]] => (elite ? [[4, 4, 3], [4, 4]] : [[3, 3], [3, 2]]);

// ------------------------------------------------------------------ 黄巾刀手 / 黄巾弓手
function soldier(elite: boolean, bow: boolean): V {
  const v = newChar(), JK = bow ? 0x5c6838 : 0x7a5636, JK_D = bow ? 0x404a24 : 0x543a22, TROU = bow ? 0x4a3a2a : 0x2e3444, SASH = elite ? GOLD : 0x3a2a20;
  const A = biped(v, { skin: SKIN, legs: TROU, boots: STRAW, hips: JK, torso: JK, chest: JK, belt: SASH, sleeve: JK, fore_: SKIN, hands: SKIN, head: SKIN, ...MAN });
  shoulders(v, A, JK); collar(v, A, INNER, elite ? GOLD : JK_D); skirt(v, A, 3, JK, elite ? GOLD : JK_D); legsHan(v, A, LINEN);
  face(v, A, { beard: bow ? undefined : 0x2a1c14 });
  turban(v, A, TAILS(elite), elite);
  if (bow) {
    heroGrip(v, A.wL, 'L', SKIN, SKIN_D);
    const [bx, by] = A.wL, WD = elite ? 0x8a5a2a : 0x6a4a2a;
    v.part('offhand').box(bx, by, -2, bx, by, 2, 0x3a2a1a).box(bx, by - 1, -7, bx, by - 1, -3, WD).box(bx, by - 1, 3, bx, by - 1, 7, WD).box(bx, by, -11, bx, by, -8, WD).box(bx, by, 8, bx, by, 11, WD)
      .box(bx, by + 1, -10, bx, by + 1, 10, 0xd8d0b8);
    v.part('spine').box(1, A.torsoY0, -5, 3, A.torsoY1 + 2, -4, 0x5a3a24).box(1, A.torsoY1 + 3, -5, 3, A.torsoY1 + 4, -5, 0xe0d8c8);
  } else ringSword(v, A, { len: 12, edge: 0xe8ecf2, spine: 0x8a92a0, grip: 0x2a1e18, ring: elite ? GOLD : 0x9a7a3a, guard: 0x5a4a3a, tassel: elite ? 0xc8302a : undefined, glove: SKIN, knuckle: SKIN_D });
  return v;
}

// ------------------------------------------------------------------ 流民 (two looks: a hoe / a bamboo spear)
function mob(look: 0 | 1): V {
  const v = newChar(), SH = look ? 0x8a6a48 : 0xb4a282, SH_D = look ? 0x664c32 : 0x8e7e60, TROU = 0x6a5c48;
  const A = biped(v, { skin: SKIN, legs: TROU, boots: STRAW, hips: SH, torso: SH, chest: SH, belt: 0x9a8058, sleeve: SH, fore_: SKIN, hands: SKIN, head: SKIN,
    legH: 8, legW: 2, legD: 2, legGap: 1, hipH: 2, torsoH: 6, torsoW: 8, chestW: 8, torsoD: 4, neckH: 1, headW: 6, headH: 6, headD: 6, armW: 2, upper: 4, fore: 3, hand: 2 });
  shoulders(v, A, SH);
  // a long ragged shirt over the thighs: one whole cell torn out of each hem
  v.part('legL').box(0, 5, -2, 3, 7, 1, SH).box(0, 5, -2, 3, 5, 1, SH_D).set(2, 5, 1, null);
  v.part('legR').box(-4, 5, -2, -1, 7, 1, SH).box(-4, 5, -2, -1, 5, 1, SH_D).set(-3, 5, 1, null);
  for (const s of ['L', 'R']) v.paint(c => (c.y >= 2 ? SKIN : null), 'shin' + s);
  legsHan(v, A, null);
  face(v, A);
  // dark hair with a small topknot, a strip of yellow cloth tied round the brow (no full wrap: dragooned peasants)
  v.part('head').box(-3, A.headY1, -3, 2, A.headY1, 2, HAIR).box(-1, A.headY1 + 1, -1, 0, A.headY1 + 2, 0, HAIR);
  for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) if ((x === -4 || x === 3 || z === -4 || z === 3) && !((x === -4 || x === 3) && (z === -4 || z === 3))) v.set(x, A.headY1 - 2, z, Y);
  v.box(-1, A.headY1 - 4, -5, 0, A.headY1 - 2, -5, Y);
  heroGrip(v, A.wR, 'R', SKIN, SKIN_D);
  const [x, y, z] = A.wR;
  if (look === 0) v.part('weapon').box(x, y, z - 5, x, y, z + 13, 0x7a5a36).box(x - 1, y - 3, z + 13, x + 1, y - 1, z + 14, 0x6a6c74).box(x - 1, y - 3, z + 13, x + 1, y - 3, z + 13, 0xb8bcc4);
  else v.part('weapon').box(x, y, z - 6, x, y, z + 16, 0x7a9a4a).set(x, y, z + 5, 0x5a7a34).set(x, y, z + 11, 0x5a7a34).box(x, y, z + 17, x, y, z + 18, 0xd8d0a0);
  return v;
}

// ------------------------------------------------------------------ 黄巾力士: huge, bare-chested under an open vest, a great iron-banded club
function brute(elite: boolean): V {
  const v = newChar(), VEST = 0x3e2e22, TROU = 0x6a3424, SK = 0xb87a52, SKD = 0x8a5638, BAND = elite ? GOLD : 0x4a4c56, WOOD = 0x6e4a2a;
  const A = biped(v, { skin: SK, legs: TROU, boots: STRAW, hips: TROU, torso: VEST, chest: VEST, belt: Y, sleeve: SK, fore_: SK, hands: SKD, head: SK,
    legH: 9, legW: 5, legD: 5, legGap: 1, hipH: 3, torsoH: 9, torsoW: 14, chestW: 16, torsoD: 8, neckH: 1, headW: 8, headH: 8, headD: 8, armW: 5, upper: 5, fore: 5, hand: 3 });
  shoulders(v, A, VEST, 4);
  const zf = A.torsoD / 2 - 1;
  // the vest open down the front over a bare chest (one darker row under the pecs); a yellow sash two rows deep
  v.paint(c => (c.z === zf && c.x >= -3 && c.x <= 2 ? (c.y === A.torsoY1 - 3 ? SKD : SK) : null), 'chest');
  v.paint(c => (c.y <= A.torsoY0 + 1 ? Y : c.z === zf && c.x >= -2 && c.x <= 1 ? SK : null), 'spine');
  for (const f of ['foreL', 'foreR']) v.paint(c => (c.y <= A.handY + 4 && c.y >= A.handY + 3 ? (elite ? GOLD : LINEN) : null), f);
  legsHan(v, A, LINEN);
  face(v, A, { beard: 0x2a1a12, wide: true });
  turban(v, A, TAILS(elite), elite);
  // the club: a one-cell haft through the fist, a 5 × 5 head, two iron bands one cell proud, a stud in the middle of each face, an iron cap
  const [x, y, z] = A.wR;
  v.part('weapon').box(x, y, z - 3, x, y, z + 5, 0x4a3420).box(x - 2, y - 2, z + 6, x + 2, y + 2, z + 15, WOOD)
    .box(x - 3, y - 3, z + 8, x + 3, y + 3, z + 8, BAND).box(x - 3, y - 3, z + 13, x + 3, y + 3, z + 13, BAND).box(x - 1, y - 1, z + 16, x + 1, y + 1, z + 16, BAND)
    .set(x - 3, y, z + 11, BAND).set(x + 3, y, z + 11, BAND).set(x, y - 3, z + 11, BAND).set(x, y + 3, z + 11, BAND);
  return v;
}

// ------------------------------------------------------------------ 符水道士: a yellow Taoist robe with a broad black collar, a peach-wood sword, talismans
function taoist(elite: boolean): V {
  const v = newChar(), ROBE = 0xc89a38, BLACK = 0x1e1a1c, PEACH = 0xc0705a, PEACH_D = 0x9a5040, PAPER = 0xf2d466, INK = 0xc02818, TRIM = elite ? GOLD : BLACK;
  const A = biped(v, { skin: SKIN, boots: BLACK, torso: ROBE, chest: ROBE, belt: BLACK, sleeve: ROBE, fore_: ROBE, hands: SKIN, head: SKIN, robe: { c: ROBE, flare: 2, trim: ROBE, hem: TRIM },
    legH: 10, legW: 2, legD: 2, legGap: 1, hipH: 2, torsoH: 7, torsoW: 8, chestW: 8, torsoD: 6, neckH: 1, headW: 6, headH: 7, headD: 6, armW: 3, upper: 4, fore: 4, hand: 2 });
  shoulders(v, A, ROBE);
  const zf = A.torsoD / 2 - 1;
  // the broad black collar: two columns down the front's right side, across the top (a pale inner collar in the middle)
  for (const p of ['chest', 'spine', 'hips']) v.paint(c => (c.z === zf && c.y === A.torsoY1 ? (c.x >= -1 && c.x <= 0 ? INNER : TRIM) : c.z === zf && (c.x === 1 || c.x === 2) && c.y >= 5 ? TRIM : null), p);
  // wide sleeves at the forearms with a dark cuff
  for (const [f, x0] of [['foreL', 4], ['foreR', -8]] as Array<[string, number]>) v.part(f).box(x0, A.handY + 2, -2, x0 + 3, A.handY + 5, 2, ROBE).box(x0, A.handY + 2, -2, x0 + 3, A.handY + 2, 2, TRIM);
  // two talismans hanging from the sash, one cell proud of the robe
  for (const x of [-3, -1]) v.part('hips').box(x, A.hipY - 4, zf + 1, x, A.hipY - 1, zf + 1, PAPER, elite ? 1 : 0).set(x, A.hipY - 2, zf + 1, INK);
  face(v, A);
  v.part('jaw').box(-1, A.headY0 - 3, A.faceZ, 0, A.headY0 - 1, A.faceZ, HAIR).box(-2, A.headY0 + 1, A.faceZ + 1, 1, A.headY0 + 1, A.faceZ + 1, HAIR);
  turban(v, A, TAILS(elite), elite);
  // a black crown on a topknot, a gold pin through it: the tallest head in the band
  v.part('head').box(-1, A.headY1 + 2, -1, 0, A.headY1 + 4, 0, BLACK).box(-2, A.headY1 + 3, 0, 1, A.headY1 + 3, 0, GOLD);
  // the peach-wood sword (wood blade, a red tassel at the pommel) and a talisman held up in the left fist
  const [x, y, z] = A.wR;
  v.part('weapon').box(x, y, z - 2, x, y, z + 1, 0x3a2418).box(x, y - 1, z + 2, x, y + 1, z + 2, PEACH_D).box(x, y, z + 3, x, y, z + 13, PEACH).box(x, y + 1, z + 3, x, y + 1, z + 12, PEACH_D)
    .box(x, y - 2, z - 3, x, y - 1, z - 3, 0xc8302a);
  heroGrip(v, A.wR, 'R', SKIN, SKIN_D);
  heroGrip(v, A.wL, 'L', SKIN, SKIN_D);
  const [lx, ly] = A.wL;
  v.part('offhand').box(lx, ly - 1, 2, lx, ly + 2, 2, PAPER, elite ? 1 : 0).set(lx, ly + 1, 2, INK);
  return v;
}

// ------------------------------------------------------------------ 猎犬: a lean hound with a yellow cloth tied at the throat
function hound(elite: boolean): V {
  const v = newChar(), F = 0x5a4c3e, FL = 0x9a8a70, FD = 0x2a2018, CL = elite ? GLOW : Y, g = elite ? 1 : 0;
  v.bone('hips', 'root', 0, 9, -5).bone('chest', 'hips', 0, 9, 2).bone('neck', 'chest', 0, 12, 6).bone('head', 'neck', 0, 13, 8).bone('jaw', 'head', 0, 12, 12)
    .bone('legFL', 'chest', 2, 8, 4).bone('legFR', 'chest', -2, 8, 4).bone('legBL', 'hips', 2, 8, -7).bone('legBR', 'hips', -2, 8, -7).bone('tail', 'hips', 0, 11, -11).bone('tail2', 'tail', 0, 13, -12);
  v.part('hips'); rbox(v, -2, 7, -11, 1, 11, -2, F, 1);
  v.part('chest'); rbox(v, -3, 7, -2, 2, 12, 6, F, 1); v.box(-1, 7, 3, 0, 9, 6, FL);
  v.part('neck'); rbox(v, -2, 11, 5, 1, 14, 8, F, 1);
  v.box(-3, 12, 4, 2, 13, 9, CL, g).box(-1, 9, 9, 0, 11, 9, CL, g);
  if (elite) v.box(-3, 12, 9, -3, 13, 9, GOLD).box(2, 12, 9, 2, 13, 9, GOLD);
  v.part('head'); rbox(v, -2, 12, 7, 1, 16, 12, F, 1);
  v.box(-1, 12, 13, 0, 14, 16, FL).box(-1, 14, 16, 0, 14, 16, FD).symBox(1, 17, 8, 1, 19, 9, F).sym(1, 19, 9, FD).sym(1, 15, 12, 0xd8a040).box(-1, 12, 16, 0, 12, 16, 0xe8e0d0);
  v.part('jaw').box(-1, 11, 12, 0, 11, 16, FL);
  for (const [n, x, z] of [['legFL', 1, 3], ['legFR', -2, 3], ['legBL', 1, -8], ['legBR', -2, -8]] as Array<[string, number, number]>) v.part(n).box(x, 1, z - 1, x, 8, z, F).box(x, 0, z - 1, x, 0, z + 1, FD);
  v.part('tail').box(-1, 10, -13, 0, 13, -11, F);
  v.part('tail2').box(-1, 14, -12, 0, 15, -8, FL);
  return v;
}

// ------------------------------------------------------------------ 黄巾渠帅: lamellar (札甲) over yellow robes, a bronze chest disc, long scarf tails, a 戟
function boss(): V {
  const v = newChar(), IRON = 0x474c58, IRON_L = 0x6c7280, YR = 0xd0a02c, YR_D = 0x9a7418, BELT = 0x6a2a1e, BOOT = 0x2a2020, BRONZE = 0xb8893a;
  const A = biped(v, { skin: SKIN, legs: 0x2a2a30, boots: BOOT, hips: YR, torso: IRON, chest: IRON, belt: BELT, sleeve: IRON, fore_: YR, hands: SKIN_D, head: SKIN,
    legH: 10, legW: 5, legD: 5, legGap: 1, hipH: 3, torsoH: 10, torsoW: 14, chestW: 16, torsoD: 8, neckH: 1, headW: 8, headH: 8, headD: 8, armW: 5, upper: 6, fore: 5, hand: 3 });
  shoulders(v, A, IRON, 4);
  const zf = A.torsoD / 2 - 1, T0 = A.torsoY0, T1 = A.torsoY1;
  // lamellar rows: every third row a lighter line; the yellow robe's collar at the neck; a bronze disc on the chest
  for (const p of ['chest', 'spine']) v.paint(c => ((c.y - T0) % 3 === 2 ? IRON_L : null), p);
  v.paint(c => (c.y === T1 && c.x >= -3 && c.x <= 2 && c.z >= zf - 1 ? YR : null), 'chest');
  v.part('chest').box(-2, T1 - 5, zf + 1, 1, T1 - 2, zf + 1, BRONZE).box(-1, T1 - 4, zf + 1, 0, T1 - 3, zf + 1, 0xe8c070);
  // shoulder guards one cell proud round the upper arms; iron bracers; the robe's skirt to the knee with lamellar tassets over it
  v.part('armL').box(8, A.shoulderY - 4, -3, 13, A.shoulderY - 1, 3, IRON).box(8, A.shoulderY - 3, -3, 13, A.shoulderY - 3, 3, IRON_L);
  v.part('armR').box(-14, A.shoulderY - 4, -3, -9, A.shoulderY - 1, 3, IRON).box(-14, A.shoulderY - 3, -3, -9, A.shoulderY - 3, 3, IRON_L);
  for (const f of ['foreL', 'foreR']) v.paint(c => (c.y <= A.handY + 4 ? IRON : null), f);
  v.part('legL').box(0, 5, -3, 6, 9, 3, YR).box(0, 5, -3, 6, 5, 3, YR_D).box(0, 7, -3, 6, 9, 3, IRON).box(0, 8, -3, 6, 8, 3, IRON_L);
  v.part('legR').box(-7, 5, -3, -1, 9, 3, YR).box(-7, 5, -3, -1, 5, 3, YR_D).box(-7, 7, -3, -1, 9, 3, IRON).box(-7, 8, -3, -1, 8, 3, IRON_L);
  v.part('hips').box(-1, A.hipY + 2, zf + 1, 0, A.hipY + 2, zf + 1, GOLD);
  face(v, A, { beard: 0x1e1410, wide: true });
  v.part('jaw').box(-3, A.headY0 - 5, A.faceZ, 2, A.headY0 - 3, A.faceZ + 1, 0x1e1410);
  turban(v, A, [[4, 4, 4], [4, 4, 3]], false);
  v.part('head').box(-1, A.headY1 - 1, A.faceZ + 2, 0, A.headY1, A.faceZ + 2, GOLD);
  // the 戟: a long dark haft, a red tassel, a straight spear head, the 戈 blade out to the side with an upturned tip
  const [x, y, z] = A.wR, ST = 0xc8d0dc, ED = 0xeef2f8;
  v.part('weapon').box(x, y, z - 6, x, y, z + 22, 0x3a2418).box(x - 1, y - 1, z + 18, x + 1, y + 1, z + 19, 0xb82a22)
    .box(x, y, z + 23, x, y + 1, z + 27, ST).box(x, y, z + 28, x, y, z + 28, ED)
    .box(x - 5, y, z + 20, x - 1, y, z + 21, ST).box(x - 5, y, z + 22, x - 5, y, z + 22, ED);
  return v;
}

const def = (d: ModelDef) => { if (!ROSTER.some(x => x.id === d.id)) ROSTER.push(d); return d; };
export const HJ_DEFS = {
  blade: def({ id: 'hj_blade', name: '黄巾刀手', group: '普通', role: '刀手', line: '', kind: 'biped', attack: 'swing', tip: 15, build: () => soldier(false, false) }),
  blade_e: def({ id: 'hj_blade_e', name: '黄巾刀手', group: '精英', role: '刀手', line: '', kind: 'biped', attack: 'swing', tip: 15, build: () => soldier(true, false) }),
  archer: def({ id: 'hj_archer', name: '黄巾弓手', group: '普通', role: '弓手', line: '', kind: 'biped', attack: 'shoot', bowL: true, build: () => soldier(false, true) }),
  archer_e: def({ id: 'hj_archer_e', name: '黄巾弓手', group: '精英', role: '弓手', line: '', kind: 'biped', attack: 'shoot', bowL: true, build: () => soldier(true, true) }),
  brute: def({ id: 'hj_brute', name: '黄巾力士', group: '普通', role: '力士', line: '', kind: 'biped', attack: 'slam', tip: 16, build: () => brute(false) }),
  brute_e: def({ id: 'hj_brute_e', name: '黄巾力士', group: '精英', role: '力士', line: '', kind: 'biped', attack: 'slam', tip: 16, build: () => brute(true) }),
  taoist: def({ id: 'hj_taoist', name: '符水道士', group: '普通', role: '道士', line: '', kind: 'biped', attack: 'cast', tip: 13, build: () => taoist(false) }),
  taoist_e: def({ id: 'hj_taoist_e', name: '符水道士', group: '精英', role: '道士', line: '', kind: 'biped', attack: 'cast', tip: 13, build: () => taoist(true) }),
  mob: def({ id: 'hj_mob', name: '流民', group: '普通', role: '流民', line: '', kind: 'biped', attack: 'swing', tip: 14, build: () => mob(0) }),
  mob_b: def({ id: 'hj_mob_b', name: '流民', group: '普通', role: '流民', line: '', kind: 'biped', attack: 'swing', tip: 17, build: () => mob(1) }),
  hound: def({ id: 'hj_hound', name: '猎犬', group: '普通', role: '野兽', line: '', kind: 'quad', attack: 'bite', build: () => hound(false) }),
  hound_e: def({ id: 'hj_hound_e', name: '猎犬', group: '精英', role: '野兽', line: '', kind: 'quad', attack: 'bite', build: () => hound(true) }),
  boss: def({ id: 'hj_boss', name: '黄巾渠帅', group: '首领', role: '渠帅', line: '', kind: 'biped', attack: 'swing', tip: 28, build: boss }),
};
