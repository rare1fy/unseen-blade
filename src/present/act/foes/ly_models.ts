// 洛阳余烬 · 西凉兵。3.5 厘米格。暗朱衣、横札、皮靴是军籍，大块兵器轮廓才是俯视下的兵种标记。
import type { V } from '../../bestiary/kit';
import type { ModelDef } from '../../bestiary/models';
import { B, MX, SIDES, SKIN, SKIN_D, HAIR, GOLD, GOLD_D, cbox, cbox2, def, face, fine, hair, plate, skel } from './fine_kit';

const IRON = 0x555e63, BLACK = 0x343c41, EDGE = 0xdce4ee, STEEL_M = 0x9aa6b4;
const RED = 0x8a302b, RED_D = 0x55231e, RED_L = 0xb64e3c;
const LEATHER = 0x40302a, SOLE = 0x241b1a, HIDE = 0x74533e;
const BRONZE = 0x588179, BRONZE_D = 0x344e49, BRONZE_L = 0x89a38e;
const ASH = 0x8b8470, ASH_D = 0x534e44, CLAY = 0xa25635, CLAY_D = 0x663822, CLAY_L = 0xca8053;

type Body = 'foot' | 'mounted' | 'boss' | 'rags' | 'ragsB';

function soldier(body: Body, elite = false, sleeves = RED) {
  const v = fine(), boss = body === 'boss', mounted = body === 'mounted';
  const rag = body === 'rags' || body === 'ragsB', z = mounted ? 17 : 0;
  const hip = (boss ? 26 : 23) + z, waist = hip + 4, chest = hip + 8;
  const shoulder = hip + (boss ? 16 : 13), elbow = shoulder - (boss ? 10 : mounted ? 7 : 8), hand = elbow - (boss ? 9 : mounted ? 6 : 7);
  const sx = boss ? 14 : rag ? 9 : 11, spread = mounted ? 14 : boss ? 6 : 5, armZ = mounted ? 6 : 0;
  const width = boss ? 10 : rag ? 5 : 8, depth = boss ? 8 : rag ? 5 : 6, knee = (boss ? 13 : 11) + z;
  const neck = shoulder + 2, skull = neck + 2, crown = skull + (boss ? 12 : rag ? 10 : 11), cap = elite ? GOLD : STEEL_M;
  const inside = boss ? SKIN_D : rag ? ASH_D : RED_D;
  skel(v, { hip, spine: waist, chest, neck, head: skull, jaw: [skull + 2, 3], hat: crown, cape: [shoulder, -depth],
    sh: [sx, shoulder, armZ], fore: elbow, hand, weapon: [-sx, hand - 1, armZ], offhand: [sx, hand - 1, armZ], leg: spread, knee });

  // 髋和上身能与马分开。腿在鞍两侧，足关节第二次定义是为了抬到镫的位置。
  const waistPart = mounted ? 'saddleSeat' : 'hips';
  if (mounted) {
    v.bone(waistPart, 'hips', 0, hip, 0).bone('spine', waistPart, 0, waist, 0);
    for (const [L, s] of SIDES) {
      v.bone('leg' + L, waistPart, s * spread, hip, 0).bone('foot' + L, 'shin' + L, s * spread, 4 + z, 0);
    }
  }

  cbox2(v, waistPart, -width, hip, -depth, width - 1, waist - 1, depth - 1, inside, 2);
  cbox2(v, waistPart, -width, hip + 1, -depth - 1, width - 1, hip + 2, depth, LEATHER, 2);
  B(v, waistPart, -2, hip + 1, depth + 1, 1, hip + 2, depth + 1, elite || boss ? GOLD : BRONZE_L);
  // Sculpted V-taper waist & deep 3D solid torso (full front-to-back imperial thickness!)
  cbox2(v, 'spine', -width + 1, waist, -depth, width - 2, chest - 1, depth - 1, boss ? SKIN : sleeves, 2);
  cbox2(v, 'chest', -width - 1, chest, -depth, width, neck - 2, depth - 1, boss ? SKIN : sleeves, 2);
  cbox2(v, 'chest', -width + 1, neck - 1, -depth + 1, width - 2, neck - 1, depth - 2, boss ? 0xdca880 : sleeves === RED ? RED_L : sleeves, 2);
  B(v, 'neck', -3, neck, -3, 2, skull - 1, 2, SKIN); B(v, 'neck', -3, neck, -3, 2, neck, 2, SKIN_D);
  // Full-depth 3D sculpted head (matching Region 1/4/5 solid depth — never flat from the side!)
  const hw = boss ? 8 : rag ? 6 : 7, hd = boss ? 8 : rag ? 6 : 7;
  cbox2(v, 'head', -hw, skull + 2, -hd, hw - 1, crown - 1, hd - 1, SKIN, 2);
  cbox2(v, 'head', -hw + 1, skull, -hd + 1, hw - 2, skull + 1, hd - 1, SKIN, 2);
  hair(v, { y: skull + 1, back: -hd + 3, side: hw - 1, front: 2 });
  face(v, { F: hd - 1, eyes: [2, 3], eyeY: skull + 5, brows: [1, Math.min(4, hw - 2)], browY: skull + 7,
    nose: [-1, 0], noseY: [skull + 3, skull + 5], mouth: [-2, 1, skull + 2] });
  if (boss || body === 'ragsB') {
    B(v, 'jaw', -4, skull - 1, hd, 3, skull + 1, hd, HAIR);
    B(v, 'head', -4, skull + 3, hd, 3, skull + 3, hd, HAIR);
  }
  if (boss) {
    B(v, 'jaw', -5, skull, hd, 4, skull + 2, hd, HAIR).box(-3, skull - 3, hd, 2, skull - 2, hd, HAIR).box(-2, skull - 4, hd, 1, skull - 4, hd, 0x120c0a);
    B(v, 'head', -hw, skull + 2, hd - 2, -hw, skull + 5, hd - 1, HAIR);
    B(v, 'head', hw - 1, skull + 2, hd - 2, hw - 1, skull + 5, hd - 1, HAIR);
  }

  for (const [L, s] of SIDES) {
    const [arm0, arm1] = MX(s, sx - 2, sx + (boss ? 4 : 3)), [fore0, fore1] = MX(s, sx - 1, sx + 2);
    const [fist0, fist1] = s > 0 ? [sx - 2, sx + 1] : [-sx - 2, -sx + 1], ox = s > 0 ? arm1 : arm0;
    const ad = boss ? 4 : rag ? 3 : 4;
    B(v, 'arm' + L, arm0, elbow, armZ - ad, arm1, shoulder - 1, armZ + ad - 1, boss || (rag && s > 0) ? SKIN : sleeves);
    B(v, 'arm' + L, ox, shoulder - 1, armZ - ad, ox, shoulder - 1, armZ + ad - 1, null); // sloped shoulder cap!
    B(v, 'fore' + L, fore0, hand + 1, armZ - 3, fore1, elbow - 1, armZ + 2, SKIN_D);
    if (!rag) B(v, 'fore' + L, fore0, hand + 2, armZ - 3, fore1, elbow - 2, armZ + 2, LEATHER);
    B(v, 'hand' + L, fist0, hand - 3, armZ - 2, fist1, hand, armZ + 1, SKIN);
    // 握心是通孔。两只手都能接长兵器，柄随手转时不会把掌心盖掉。
    const grip = s * sx;
    B(v, 'hand' + L, grip - 1, hand - 2, armZ - 2, grip, hand - 1, armZ + 1, null);

    const [a, b] = MX(s, spread - 3, spread + (boss ? 4 : rag ? 1 : 3)), [ia, ib] = MX(s, spread - 2, spread + 2);
    const ld = rag ? 3 : 4;
    B(v, 'leg' + L, a, knee, -ld, b, hip - 1, ld, rag ? (s > 0 ? ASH : ASH_D) : RED_D);
    B(v, 'shin' + L, ia, z + 4, -ld + 1, ib, knee - 1, ld - 1, rag ? HIDE : LEATHER);
    B(v, 'shin' + L, ia, knee - 2, -ld + 1, ib, knee - 1, ld, rag ? ASH_D : HIDE);
    B(v, 'foot' + L, ia, z, -ld, ib, z, 6, SOLE);
    B(v, 'foot' + L, ia, z + 1, -ld + 1, ib, z + 3, 6, rag ? HIDE : LEATHER);
  }

  if (rag) {
    // 两人各穿几件凑成的衣服。宽窄不同的布幅和露出的胳膊在远处也看得见。
    B(v, 'chest', -width - 1, chest, depth, 0, neck - 2, depth, body === 'ragsB' ? ASH : BRONZE_D);
    B(v, 'legL', 2, hip - 9, 4, 7, hip - 1, 4, body === 'ragsB' ? RED_D : ASH_D);
    if (body === 'ragsB') {
      cbox2(v, 'hat', -7, crown, -7, 6, crown + 1, 6, ASH_D, 2);
      cbox2(v, 'hat', -5, crown + 2, -5, 4, crown + 3, 4, ASH, 2);
      B(v, 'hat', -7, skull + 4, -5, -7, crown - 1, -1, ASH_D);
    } else {
      cbox2(v, 'head', -6, crown, -6, 5, crown + 1, 5, HAIR, 2);
      B(v, 'hat', -4, crown + 2, -3, 0, crown + 4, 0, HAIR);
      B(v, 'hat', 6, skull + 4, -5, 7, crown, -1, RED_D);
    }
    return v;
  }

  const armor = boss ? 'armorChest' : 'chest', skirt = boss ? 'armorSkirt' : 'hips';
  if (boss) {
    v.bone(armor, 'chest', 0, neck - 1, 0).bone(skirt, 'hips', 0, hip + 2, 0);
  }
  // Full-depth 3D iron 兜鍪 helmet; ELITES get unmistakable winged gilded officer war-helm + flowing crimson horsehair plume!
  cbox2(v, 'hat', -hw - 1, crown - 1, -hd - 1, hw, crown + 2, hd, IRON, 2);
  cbox2(v, 'hat', -hw, crown + 3, -hd, hw - 1, crown + 3, hd - 1, BLACK, 2);
  cbox2(v, 'hat', -hw + 1, crown + 4, -hd + 1, hw - 2, crown + 4, hd - 2, elite || boss ? GOLD : STEEL_M, 2);
  B(v, 'hat', -hw + 1, crown - 1, hd + 1, hw - 2, crown - 1, hd + 1, cap);
  B(v, 'hat', -hw, skull + 1, -hd - 2, hw - 1, crown - 1, -hd - 1, BLACK);
  for (const [, s] of SIDES) {
    const [a, b] = MX(s, hw, hw + 1);
    B(v, 'hat', a, skull + 2, -hd, b, crown - 1, 2, IRON);
    B(v, 'hat', a, skull + 2, -hd, b, skull + 2, 2, cap);
  }
  B(v, 'hat', -2, crown + 5, -3, 1, crown + (boss ? 11 : elite ? 10 : 7), 0, boss || elite ? RED_L : RED);
  if (elite || boss) {
    // Officer winged gold crest + soaring crimson horsehair cascade visible immediately from top-down camera!
    cbox2(v, 'hat', -hw + 2, crown + 5, -hd + 2, hw - 3, crown + 5, hd - 3, GOLD_D, 1);
    B(v, 'hat', -2, crown + 1, hd + 1, 1, crown + 6, hd + 1, GOLD);
    for (const [, s] of SIDES) {
      const [wa, wb] = MX(s, hw + 1, hw + 3);
      B(v, 'hat', wa, crown + 2, -1, wb, crown + 4, 2, GOLD).box(s > 0 ? wb : wa, crown + 5, -1, s > 0 ? wb : wa, crown + 6, 1, 0xf6dc7a);
    }
    B(v, 'hat', -3, crown + 7, -hd - 2, 2, crown + (boss ? 11 : 10), -2, RED_L);
    B(v, 'hat', -3, crown + 2, -hd - 4, 2, crown + 7, -hd - 2, RED).box(-2, crown - 2, -hd - 5, 1, crown + 3, -hd - 3, RED_D);
  }

  // Thick 360-degree layered lamellar cuirass (front, back, AND sides wrapped solidly!)
  for (let y = chest; y + 2 < neck; y += 3) {
    B(v, armor, -width, y, depth, width - 1, y + 2, depth, BLACK);
    B(v, armor, -width, y + 1, depth + 1, width - 1, y + 2, depth + 1, IRON);
    B(v, armor, -width, y, -depth - 1, width - 1, y + 2, -depth - 1, BLACK);
    B(v, armor, -width, y + 1, -depth - 2, width - 1, y + 2, -depth - 2, IRON);
    // Solid side lamellar flank plates so side profile looks thick & armored!
    for (const [, s] of SIDES) {
      const [sa, sb] = MX(s, width, width);
      B(v, armor, sa, y + 1, -depth, sb, y + 2, depth - 1, IRON);
      B(v, armor, sa, y, -depth, sb, y, depth - 1, BLACK);
    }
  }
  B(v, armor, -width, neck - 2, depth + 2, width - 1, neck - 2, depth + 2, elite || boss ? GOLD : STEEL_M);
  if (boss || elite) {
    // Bold bronze/gold chest mirror (护心镜) — full warlord plate on boss, sleek gilded officer disc on elites!
    const mr = boss ? 4 : 3;
    plate(v, armor, -mr - 1, chest + 1, mr, chest + (boss ? 8 : 6), depth + 2, BRONZE_D);
    plate(v, armor, -mr, chest + 2, mr - 1, chest + (boss ? 7 : 5), depth + 3, GOLD_D);
    B(v, armor, -1, chest + (boss ? 4 : 3), depth + 3, 0, chest + (boss ? 5 : 4), depth + 3, GOLD);
    if (boss) B(v, armor, -1, chest + 5, depth + 4, 0, chest + 5, depth + 4, 0xf8e298);
  }
  // Deep sloped layered lamellar pauldrons (ELITES get 3-tier flared gilded officer wings!)
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, sx - 1, sx + (elite || boss ? 6 : 4)), ox = s > 0 ? b : a;
    const part = boss ? 'armorSh' + L : 'sh' + L;
    if (boss) v.bone(part, 'sh' + L, s * sx, shoulder, armZ);
    B(v, part, a, shoulder, armZ - 5, b, shoulder + 1, armZ + 4, BLACK);
    B(v, part, a, shoulder + 1, armZ - 4, b, shoulder + 2, armZ + 3, elite ? GOLD_D : IRON);
    B(v, part, ox, shoulder + 2, armZ - 5, ox, shoulder + 2, armZ + 4, null);
    B(v, part, a, shoulder - 4, armZ + 4, b, shoulder - 1, armZ + 5, IRON);
    B(v, part, a, shoulder - 4, armZ - 5, b, shoulder - 1, armZ - 4, IRON);
    B(v, part, a, shoulder - 2, armZ + 5, b, shoulder - 2, armZ + 5, elite ? GOLD : boss ? GOLD_D : STEEL_M);
    if (elite) {
      // Raised gold-trimmed shoulder ridge & extra flared lower lames for instant elite silhouette!
      B(v, part, a, shoulder + 3, armZ - 3, s > 0 ? b - 2 : a + 2, shoulder + 3, armZ + 2, GOLD);
      B(v, part, ox, shoulder - 5, armZ - 4, ox, shoulder - 1, armZ + 4, GOLD_D);
    }
  }
  if (!mounted) {
    // 360-degree wrap-around heavy lamellar war-skirt (front, sides, AND back — full solid thickness!)
    const low = hip - (boss ? 10 : elite ? 9 : 7);
    for (const [, s] of SIDES) {
      const [a, b] = MX(s, 1, boss ? width : width - 1);
      const [sa, sb] = MX(s, width, width + 1);
      B(v, skirt, a, low, depth, b, hip, depth, BLACK);
      B(v, skirt, a, low + 1, depth + 1, b, hip - 1, depth + 1, IRON);
      B(v, skirt, a, low, depth + 1, b, low, depth + 1, elite || boss ? GOLD : RED);
      // Side & rear lamellar skirt plates!
      B(v, skirt, sa, low + 1, -depth + 1, sb, hip - 1, depth - 1, IRON);
      B(v, skirt, sa, low, -depth + 1, sb, low, depth - 1, elite || boss ? GOLD_D : RED_D);
    }
    B(v, skirt, -width + 1, low + 1, -depth - 1, width - 2, hip - 1, -depth - 1, IRON);
    B(v, skirt, -width + 1, low, -depth - 1, width - 2, low, -depth - 1, elite || boss ? GOLD_D : RED_D);
    // Cloak: regular troops get a crisp crimson war-cape; ELITES & BOSS get a sweeping wide gold-hemmed commander cloak!
    const cLow = hip - (boss ? 10 : elite ? 11 : 6), cw = elite || boss ? width + 2 : width;
    B(v, 'cape', -cw, cLow, -depth - 4, cw - 1, shoulder - 1, -depth - 4, elite ? BLACK : RED_D);
    B(v, 'cape', -cw + 2, cLow, -depth - 5, cw - 3, shoulder - 2, -depth - 5, elite ? RED_L : RED);
    if (elite || boss) B(v, 'cape', -cw, cLow, -depth - 5, cw - 1, cLow + 1, -depth - 4, GOLD);
  } else if (elite) {
    // Mounted elite commander gets a dramatic billowing crimson-and-gold cavalry cloak!
    B(v, 'cape', -width - 1, hip - 6, -depth - 4, width, shoulder - 1, -depth - 4, RED_D);
    B(v, 'cape', -width + 1, hip - 6, -depth - 5, width - 2, shoulder - 2, -depth - 5, RED_L);
    B(v, 'cape', -width - 1, hip - 6, -depth - 5, width, hip - 5, -depth - 4, GOLD);
  }
  return v;
}

/** 各兵器按握心落格，全长沿 +z。实体只挂一个骨骼，收招换姿势也不会把杆拆开。 */
function prop(v: V, part = 'weapon') {
  const { x, y, z } = v.bonesAbs.get(part)!.p;
  return (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, glow = 0) =>
    B(v, part, x + x0, y + y0, z + z0, x + x1, y + y1, z + z1, c, glow);
}

function halberd(elite: boolean) {
  const v = soldier('foot', elite), box = prop(v);
  // 九尺木柲和钩枝。横钩在游戏镜头下给直线戳刺一个清楚的起点。
  box(-1, -1, -33, 0, 0, 74, HIDE);
  box(-1, -1, -34, 0, 0, -30, BLACK);
  box(-1, -1, 56, 0, 0, 77, BLACK);
  box(-2, 0, 65, 1, 0, 78, EDGE);
  box(-1, 0, 79, 0, 0, 82, EDGE);
  box(-10, 0, 63, -2, 0, 69, IRON);
  box(-12, 0, 65, -10, 0, 69, EDGE);
  box(-12, 0, 68, -9, 0, 74, EDGE);
  box(-2, -1, 53, 1, 1, 55, elite ? GOLD : BRONZE);
  if (elite) {
    // Double-crescent 方天画戟 twin ear-blade + grand crimson banner tassel!
    box(1, 0, 63, 9, 0, 69, IRON);
    box(9, 0, 65, 11, 0, 69, EDGE);
    box(8, 0, 68, 11, 0, 74, EDGE);
    box(-1, -1, 56, 0, 0, 77, GOLD_D);
    box(1, 0, 44, 9, 0, 52, RED_L);
    box(2, 0, 41, 7, 0, 44, RED);
  }
  return v;
}

function saber(v: V, length: number, trim: number) {
  const box = prop(v);
  box(-1, -1, -6, 0, 0, 4, LEATHER);
  box(-2, -1, -9, 1, 0, -7, trim);
  box(-2, -1, 4, 0, 0, 5, trim);
  box(-1, 0, 6, 2, 0, length - 2, IRON);
  box(2, 0, 6, 2, 0, length, EDGE);
  box(0, 0, length - 1, 1, 0, length, EDGE);
}

function shield(elite: boolean) {
  const v = soldier('foot', elite), p = 'offhand', box = prop(v, p), { x, y, z } = v.bonesAbs.get(p)!.p;
  const rim = elite ? GOLD_D : EDGE;
  box(-1, -1, -2, 0, 0, 8, HIDE);
  // 宽过肩、从膝到眉。中筋和包边在远处能把整块盾面从甲片里分出来。
  box(-15, -17, 8, 14, 17, 9, LEATHER);
  plate(v, p, x - 16, y - 18, x + 15, y + 18, z + 10, rim);
  plate(v, p, x - 14, y - 16, x + 13, y + 16, z + 11, elite ? BRONZE_D : IRON);
  box(-2, -15, 12, 1, 15, 12, BLACK);
  box(-5, -4, 12, 4, 4, 13, rim);
  box(-3, -2, 14, 2, 2, 14, elite ? GOLD : EDGE);
  for (const row of [-12, 12]) {
    box(-12, row, 12, -10, row + 2, 12, rim);
    box(9, row, 12, 11, row + 2, 12, rim);
  }
  if (elite) {
    // Spiked-crown gilded heavy siege tower shield!
    box(-13, 17, 10, 12, 19, 11, GOLD);
    for (const sx2 of [-12, -5, 2, 9]) box(sx2, 20, 10, sx2 + 2, 23, 11, EDGE);
    box(-8, 16, 12, 7, 18, 12, RED_L);
    box(-6, -5, 13, 5, 5, 14, GOLD);
  }
  saber(v, elite ? 24 : 21, rim);
  return v;
}

function crossbow(elite: boolean) {
  const v = soldier('foot', elite), box = prop(v), { x, y, z } = v.bonesAbs.get('weapon')!.p;
  box(-1, -1, -8, 0, 0, 27, HIDE);
  box(-2, 1, 4, 1, 2, 30, HIDE);
  box(-3, 1, 14, 2, 3, 17, elite ? GOLD_D : BRONZE);
  box(-21, 1, 26, 20, 2, 28, elite ? IRON : LEATHER);
  if (elite) box(-24, 1, 28, 23, 2, 30, BLACK).box(-24, 2, 28, 23, 2, 29, GOLD_D);
  for (const [a, b] of [[-22, -17], [16, 21]]) box(a, 1, 23, b, 2, 25, HIDE);
  box(-21, 2, 22, 20, 2, 22, ASH);
  box(-3, 0, 31, 2, 1, 34, BLACK);
  box(-6, 0, 35, 5, 1, 36, BLACK);
  box(-6, 0, 31, -4, 1, 34, BLACK);
  box(3, 0, 31, 5, 1, 34, BLACK);
  v.bone('bolt', 'weapon', x, y + 5, z + 14);
  const bolt = prop(v, 'bolt');
  for (const row of elite ? [-3, 0, 3] : [0]) {
    bolt(row, 0, -6, row, 0, 14, ASH);
    bolt(row - 1, 0, 15, row + 1, 0, 18, EDGE);
    bolt(row - 1, 0, -8, row + 1, 0, -7, RED_L);
  }
  B(v, 'chest', 4, 30, -11, 10, 43, -10, BLACK);
  B(v, 'chest', 4, 44, -12, 10, 46, -10, elite ? GOLD_D : HIDE);
  return v;
}

function jar(v: V, part: string, x: number, y: number, z: number) {
  cbox(v, part, x - 3, y, z - 3, x + 2, y + 5, z + 2, CLAY);
  B(v, part, x - 2, y + 6, z - 2, x + 1, y + 7, z + 1, CLAY_D);
  B(v, part, x - 2, y + 8, z - 2, x + 1, y + 8, z + 1, CLAY_L);
  B(v, part, x - 2, y + 1, z + 3, x + 1, y + 2, z + 3, CLAY_D);
}

function torch(elite: boolean) {
  const v = soldier('foot', elite, RED_L), p = 'weapon', { x, y, z } = v.bonesAbs.get(p)!.p;
  jar(v, p, x, y - 5, z + 11);
  prop(v)(-1, -1, -1, 0, 0, 8, CLAY_D);
  v.bone('wick', p, x, y + 4, z + 11);
  const fire = prop(v, 'wick');
  fire(-2, 0, -2, 1, 1, 1, 0xb34422, 1);
  fire(-1, 2, -1, 1, 4, 1, 0xf38c33, 1);
  fire(-1, 2, 0, 0, 3, 0, 0xffce65, 1);
  // 罐口朝上，沿腰带绕到后腰。精英多带两罐，正面仍看得到它们。
  v.bone('jarBelt', 'hips', 0, 23, 0);
  for (const [a, b] of [[-11, -5], [-5, -13], [3, -13], [11, -5], ...(elite ? [[-3, 10], [4, 10]] : [])]) {
    jar(v, 'jarBelt', a, 15, b);
  }
  v.part('jarBelt').symBox(7, 21, -6, 9, 22, -5, LEATHER);
  return v;
}

function looter(other: boolean) {
  const v = soldier(other ? 'ragsB' : 'rags', false, other ? BRONZE_D : ASH);
  const box = prop(v);
  box(-1, -1, -8, 0, 0, 24, HIDE);
  if (other) {
    box(-2, -1, 17, 1, 0, 29, BLACK);
    box(-2, 0, 23, 1, 0, 29, EDGE);
    B(v, 'cape', -10, 28, -13, -2, 40, -6, BRONZE_D);
    B(v, 'cape', -1, 29, -12, 0, 39, -7, BRONZE);
    B(v, 'cape', -9, 30, -14, -3, 38, -14, BRONZE_L);
  } else {
    box(-2, -1, 18, 2, 0, 23, SOLE);
    box(0, -1, 24, 2, 0, 27, HIDE);
    cbox(v, 'cape', 1, 28, -14, 11, 38, -5, ASH_D);
    B(v, 'cape', 4, 29, -15, 8, 37, -15, ASH);
    B(v, 'cape', 2, 39, -11, 9, 41, -8, HIDE);
  }
  // 一条绳过肩连到劫来的东西，衣上只留一条粗线。
  B(v, 'chest', other ? -6 : 3, 31, 4, other ? -4 : 5, 36, 4, LEATHER);
  return v;
}

function rider(elite: boolean) {
  const v = soldier('mounted', elite), coat = elite ? 0x3b3030 : 0x76503d, dark = elite ? 0x241f23 : 0x503329;
  const trim = elite ? GOLD_D : BRONZE;
  v.bone('horse', 'hips', 0, 27, 0).bone('horseNeck', 'horse', 0, 29, 15)
    .bone('horseHead', 'horseNeck', 0, 40, 20).bone('horseTail', 'horse', 0, 29, -18);
  cbox2(v, 'horse', -9, 21, -19, 8, 35, 18, coat, 2);
  B(v, 'horse', -7, 20, -15, 6, 22, 14, dark);
  B(v, 'horse', -9, 35, -10, 8, 36, 8, RED_D);
  B(v, 'horse', -8, 37, -6, 7, 39, 5, HIDE);
  B(v, 'horse', -7, 40, -8, 6, 41, -6, LEATHER);
  for (const [L, s] of SIDES) {
    const [s0, s1] = MX(s, 9, 10);
    B(v, 'horse', s0, 28, -11, s1, 36, 9, RED);
    B(v, 'horse', s0, 28, -11, s1, 29, 9, trim);
    if (elite) {
      // Full heavy iron barding (具装铠) along flanks, chest & rump!
      B(v, 'horse', s0, 23, -18, s1, 35, 18, IRON).box(s0, 23, -18, s1, 24, 18, GOLD).box(s0, 34, -18, s1, 35, 18, GOLD_D);
    }
    for (const end of ['F', 'B']) {
      const front = end === 'F', z = front ? 12 : -13, upper = 'horseLeg' + end + L, lower = 'horseShin' + end + L;
      const [a, b] = MX(s, 4, 7), [c, d] = MX(s, 4, 6);
      v.bone(upper, 'horse', 6 * s, 20, z).bone(lower, upper, 6 * s, 9, z).bone('hoof' + end + L, lower, 6 * s, 3, z);
      B(v, upper, a, 9, z - 3, b, 19, z + 2, coat);
      B(v, lower, c, 3, z - 2, d, 8, z + 1, dark);
      B(v, 'hoof' + end + L, c, 0, z - 2, d, 2, z + 2, SOLE);
    }
  }
  if (elite) B(v, 'horse', -8, 24, 19, 7, 34, 19, IRON).box(-8, 24, 19, 7, 25, 19, GOLD).box(-3, 28, 20, 2, 31, 20, GOLD);
  B(v, 'horseNeck', -5, 26, 18, 4, 38, 22, coat);
  if (elite) B(v, 'horseNeck', -6, 28, 17, 5, 37, 23, IRON).box(-6, 36, 17, 5, 37, 23, GOLD_D);
  B(v, 'horseNeck', -5, 36, 13, 4, 39, 17, dark);
  B(v, 'horseNeck', -3, 37, 11, 2, 43, 17, dark);
  cbox2(v, 'horseHead', -5, 39, 18, 4, 47, 25, coat, 2);
  cbox2(v, 'horseHead', -4, 36, 26, 3, 44, 31, coat, 1);
  if (elite) {
    // Gilded iron warhorse chamfron (马面帘) + forehead spike!
    B(v, 'horseHead', -4, 43, 25, 3, 48, 30, IRON).box(-2, 45, 31, 1, 47, 33, GOLD).box(-1, 48, 26, 0, 52, 28, GOLD);
  }
  B(v, 'horseHead', -4, 36, 32, 3, 40, 34, dark);
  B(v, 'horseHead', -3, 38, 35, -2, 39, 35, SOLE);
  B(v, 'horseHead', 1, 38, 35, 2, 39, 35, SOLE);
  for (const [, s] of SIDES) {
    const [a, b] = MX(s, 3, 4), [e, f] = MX(s, 5, 5);
    B(v, 'horseHead', a, 48, 20, b, 51, 22, dark);
    B(v, 'horseHead', e, 43, 23, f, 44, 24, SOLE);
    B(v, 'horseHead', a, 44, 26, b, 45, 29, trim);
  }
  B(v, 'horseHead', -4, 40, 35, 3, 40, 35, trim);
  B(v, 'horseHead', -2, 45, 26, 1, 46, 28, elite ? GOLD_D : ASH);
  B(v, 'horseTail', -3, 23, -23, 2, 29, -19, dark);
  B(v, 'horseTail', -3, 12, -25, 2, 23, -22, dark);

  const lance = prop(v);
  lance(-1, -1, -24, 0, 0, 51, HIDE);
  lance(-2, 0, 48, 1, 0, 59, EDGE);
  lance(-1, 0, 60, 0, 0, 63, EDGE);
  lance(-2, -1, 44, 1, 1, 46, trim);
  if (elite) lance(1, -3, 35, 7, 0, 43, RED_L);
  return v;
}

function yanhu() {
  const v = soldier('boss'), axe = prop(v);
  // 大钺横截面够宽，侧翼是整块直刃；从杆尾到斧刃都随 weapon 一起藏。
  axe(-1, -1, -20, 0, 0, 66, HIDE);
  axe(-1, -1, -23, 0, 0, -19, BLACK);
  // 11-18 (用户：「这个飞熊校尉的武器方向不对，攻击是用斧背打人的」): the head stood out sideways (along x), so the chop came down on
  // its flat and the sweep led with the back spike. It now stands out along the swing (local −y = the way he faces with the haft
  // upright): the blade's edge leads, the spike trails. `head` takes the old x-across / y-thick numbers and turns them a quarter
  // round the haft.
  const head = (a0: number, b0: number, z0: number, a1: number, b1: number, z1: number, c: number) => axe(b0, a0, z0, b1, a1, z1, c);
  axe(-2, -2, 48, 1, 1, 65, BRONZE_D);
  head(-20, -1, 51, -3, 1, 63, IRON);
  head(-24, -1, 48, -21, 1, 66, EDGE);
  head(-20, 0, 52, -6, 2, 61, BLACK);
  head(-10, 1, 54, -3, 2, 58, BRONZE);
  head(2, -1, 54, 7, 1, 61, IRON);
  head(8, -1, 55, 9, 1, 60, EDGE);
  axe(-2, -2, 45, 1, 1, 47, GOLD_D);
  // 泼地那一招脚边的铁槽。翻过去之后接场地上的现成铁水效果。
  v.bone('trough', 'root', 6, 3, 23);
  const trough = prop(v, 'trough');
  trough(-8, -3, -5, 7, -2, 4, BLACK);
  trough(-8, -1, -5, -7, 0, 4, IRON);
  trough(6, -1, -5, 7, 0, 4, IRON);
  trough(-6, -1, -5, 5, 0, -4, IRON);
  trough(-6, -1, 3, 5, 0, 4, IRON);
  trough(-6, -1, -3, 5, -1, 2, 0xd55a26, 1);
  return v;
}

function pair(id: string, name: string, build: (elite: boolean) => V, tip: number, attack: ModelDef['attack'] = 'swing', scale = 1.12) {
  for (const elite of [false, true]) def({ id: id + (elite ? '_e' : ''), name, group: elite ? '精英' : '普通', role: name, line: '', kind: 'biped', attack, tip, scale, build: () => build(elite) });
}

// 名字沿用 ly_ai 中已经定稿的玩家文案。战斗中精英的 15% 放大仍由 spawnFoe 做。
pair('ly_halberd', '飞熊长戟', halberd, 83, 'swing', 1.12);
pair('ly_rider', '凉州突骑', rider, 64, 'swing', 1.08);
pair('ly_shield', '覆铁重盾', shield, 22, 'swing', 1.12);
pair('ly_xbow', '摧坚强弩', crossbow, 31, 'shoot', 1.12);
pair('ly_torch', '泼油狂卒', torch, 12, 'cast', 1.12);
def({ id: 'ly_looter', name: '搜骨乱卒', group: '普通', role: '搜骨乱卒', line: '', kind: 'biped', attack: 'swing', tip: 28, build: () => looter(false) });
def({ id: 'ly_looter_b', name: '搜骨乱卒', group: '普通', role: '搜骨乱卒', line: '', kind: 'biped', attack: 'swing', tip: 30, build: () => looter(true) });
def({ id: 'ly_boss', name: '飞熊校尉 · 阎虎', group: '首领', role: '飞熊校尉', line: '', kind: 'biped', attack: 'swing', tip: 67, scale: 1.18, build: yanhu });

import './ly_poses';
