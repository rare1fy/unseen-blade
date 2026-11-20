// act-114 三国名将细体素模型（3.5cm 格子，严格对齐 fine_kit.ts / r45_models.ts 骨架与风格铁律）：
//   1. 赵云（gen_zhaoyun）：白袍银甲、蓝绸束腰、银盔红缨、龙胆亮银枪
//   2. 吕布（gen_lubu）：紫金冠双长雉鸡翎、黑金吞兽甲、赤红战袍、方天画戟
//   3. 夏侯惇（gen_xiahoudun）：玄黑铁甲、暗红披风、左眼染血黑眼罩、厚背环首重刀
//   4. 陆逊（gen_luxun）：白玉冠、青白儒衫镶银边、吴钩长剑
import { type V } from '../../bestiary/kit';
import { fine, skel, B, cbox2, SIDES, MX, def, SKIN, SKIN_D, HAIR, EYE, MOUTH, GOLD, GOLD_D } from './fine_kit';

const SK = {
  hip: 22, spine: 24, chest: 30, neck: 38, head: 40, jaw: [41, 4] as [number, number], hat: 53, cape: [36, -6] as [number, number],
  sh: [11, 36, 0] as [number, number, number], fore: 28, hand: 21, weapon: [-11, 18, 2] as [number, number, number], offhand: [11, 18, 2] as [number, number, number], leg: 5, knee: 12,
};

function makeBase(v: V, o: {
  boot: number; bootL: number; trou: number; tunic: number; tunicD: number;
  armor: number; armorL: number; armorD: number; trim: number; sash: number;
  skin?: number; sleeve?: number; robe?: boolean;
}) {
  skel(v, SK);
  const sk = o.skin ?? SKIN;
  // Legs: booted warriors (shin inset 1 cell from thigh outer face so knees never z-fight)
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 2, 7), [sa, sb] = MX(s, 3, 6);
    B(v, 'foot' + L, a, 0, -3, b, 1, 5, o.boot);
    B(v, 'foot' + L, sa, 2, -2, sb, 3, 4, o.bootL);
    B(v, 'shin' + L, sa, 4, -2, sb, 11, 2, o.boot);
    B(v, 'shin' + L, sa, 9, -2, sb, 10, 2, o.bootL);
    B(v, 'leg' + L, a, 12, -3, b, 21, 3, o.trou);
  }
  // Hips / Waist + Sash
  cbox2(v, 'hips', -8, 20, -6, 7, 23, 5, o.sash, 2);
  B(v, 'hips', -2, 20, 5, 1, 23, 6, o.trim);
  if (o.robe) {
    // Articulated 2-tier scholar-general hem (boots stay neatly under hem during low-amplitude stride)
    v.bone('robe1', 'hips', 0, 20, 0).bone('robe2', 'robe1', 0, 12, 0);
    cbox2(v, 'robe1', -9, 13, -6, 8, 19, 6, o.tunic, 2);
    cbox2(v, 'robe1', -9, 13, -6, 8, 13, 6, o.tunicD, 2);
    cbox2(v, 'robe2', -10, 4, -7, 9, 12, 7, o.tunic, 2);
    cbox2(v, 'robe2', -10, 4, -7, 9, 5, 7, o.trim, 2);
  } else {
    // Armored lamellar tassets on left/right thighs (never clip legs)
    for (const [L, s] of SIDES) {
      const [a, b] = MX(s, 1, 8);
      B(v, 'leg' + L, a, 15, -4, b, 20, 4, o.armor);
      B(v, 'leg' + L, a, 15, -4, b, 15, 4, o.trim);
      B(v, 'leg' + L, a, 18, -4, b, 18, 4, o.armorD);
    }
  }
  // Spine & Chest armor
  cbox2(v, 'spine', -8, 24, -5, 7, 29, 5, o.armor, 2);
  cbox2(v, 'chest', -9, 30, -6, 8, 37, 6, o.armor, 2);
  B(v, 'chest', -7, 36, -4, 6, 37, 4, o.armorL);
  B(v, 'chest', -3, 30, 5, 2, 36, 6, o.tunic);
  B(v, 'chest', -2, 31, 6, 1, 35, 6, o.trim);
  // Neck
  B(v, 'neck', -2, 38, -2, 1, 39, 1, sk);
  // Arms & hands (forearm inset by 1 cell from upper arm outer edge)
  for (const [L, s] of SIDES) {
    const [ua, ub] = MX(s, 9, 14), [fa, fb] = MX(s, 10, 13);
    // Shoulder pauldron
    B(v, 'arm' + L, ua, 31, -3, ub, 37, 3, o.armorL);
    B(v, 'arm' + L, ua, 31, -3, ub, 31, 3, o.trim);
    B(v, 'arm' + L, ua, 34, -3, ub, 34, 3, o.armorD);
    B(v, 'arm' + L, fa, 28, -2, fb, 30, 2, o.sleeve ?? o.tunic);
    // Forearm & bracer
    B(v, 'fore' + L, fa, 21, -2, fb, 27, 2, o.armor);
    B(v, 'fore' + L, fa, 21, -2, fb, 22, 2, o.trim);
    // Hand
    B(v, 'hand' + L, fa, 17, -1, fb, 20, 2, sk);
  }
  // Head base
  cbox2(v, 'head', -6, 40, -6, 5, 51, 5, sk, 2);
  v.paint(q => (q.y >= 44 && (q.z <= -3 || ((q.x <= -5 || q.x >= 4) && q.z <= 1)) && q.c === sk ? HAIR : null), 'head');
}

function addCloak(v: V, col: number, colD: number, colL: number, len = 24) {
  v.bone('clA1', 'cape', 0, 35, -6).bone('clA2', 'clA1', 0, 22, -7);
  B(v, 'clA1', -8, 22, -7, 7, 35, -6, col);
  B(v, 'clA1', -8, 33, -7, 7, 35, -6, colL);
  B(v, 'clA1', -8, 22, -7, -8, 35, -6, colD);
  B(v, 'clA1', 7, 22, -7, 7, 35, -6, colD);
  const y0 = Math.max(4, 35 - len);
  B(v, 'clA2', -9, y0, -8, 8, 21, -7, col);
  B(v, 'clA2', -9, y0, -8, 8, y0 + 1, -7, colD);
}

// ================================================================== 1. 赵云（常山赵子龙）
function buildZhaoYun(): V {
  const v = fine();
  const WH = 0xf0f4f8, WH_D = 0xc6d0dc, SIL = 0xd4dce8, SIL_L = 0xf4f8ff, SIL_D = 0x8a98ac;
  const NV = 0x223254, RED = 0xb8262a, RED_L = 0xd8383c, SK = 0xdba882;
  makeBase(v, {
    boot: 0x242834, bootL: SIL_D, trou: WH_D, tunic: WH, tunicD: WH_D,
    armor: SIL, armorL: SIL_L, armorD: SIL_D, trim: NV, sash: NV, skin: SK, sleeve: WH,
  });
  // Clean white cross-collar tunic visible over chest & crisp navy sash
  B(v, 'chest', -5, 30, 5, 4, 36, 6, WH);
  B(v, 'chest', -4, 30, 6, -2, 36, 6, NV);
  B(v, 'chest', 1, 31, 6, 3, 36, 6, NV);
  // Crisp resolute young face
  v.part('head').symBox(2, 44, 5, 3, 45, 5, EYE).symBox(2, 46, 5, 4, 46, 5, HAIR)
    .box(-1, 43, 6, 0, 44, 6, SKIN_D).box(-1, 41, 5, 0, 41, 5, MOUTH);
  // Silver Han helmet with ear-guards + flowing crimson plume
  cbox2(v, 'hat', -7, 48, -7, 6, 56, 6, SIL, 2);
  B(v, 'hat', -6, 55, -5, 5, 57, 4, SIL_L);
  B(v, 'hat', -4, 49, 6, 3, 52, 6, SIL_L); // brow ornament
  B(v, 'hat', -7, 44, -3, -6, 48, 2, SIL); B(v, 'hat', 5, 44, -3, 6, 48, 2, SIL);
  // Crimson horsehair plume sweeping back
  B(v, 'hat', -2, 57, -2, 1, 61, 1, RED);
  B(v, 'hat', -2, 55, -7, 1, 60, -3, RED_L);
  B(v, 'hat', -2, 47, -9, 1, 55, -6, RED);
  addCloak(v, WH, WH_D, SIL_L, 26);
  // 龙胆亮银枪 (Dragon Gall Silver Spear, along local +z of weapon bone)
  const wx = -11, wy = 18;
  B(v, 'weapon', wx, wy, -22, wx, wy + 1, 34, SIL);
  B(v, 'weapon', wx, wy, 32, wx, wy + 1, 35, RED_L); // red spear tassel collar
  B(v, 'weapon', wx, wy - 4, 33, wx, wy - 1, 34, RED);
  // Bright steel spearhead
  B(v, 'weapon', wx - 1, wy, 36, wx + 1, wy + 1, 43, SIL_L, 0.35);
  B(v, 'weapon', wx, wy, 44, wx, wy + 1, 49, SIL_L, 0.5);
  return v;
}

// ================================================================== 2. 吕布（温侯 · 方天画戟）
function buildLuBu(): V {
  const v = fine();
  const BK = 0x26242c, BK_L = 0x423e4c, BK_D = 0x16141a;
  const GD = 0xd4a038, GD_L = 0xf2c65a, GD_D = 0x8e661e;
  const CR = 0xa81e22, CR_L = 0xcf2e32, CR_D = 0x6e1216, SK = 0xd69f76;
  makeBase(v, {
    boot: BK_D, bootL: GD, trou: BK, tunic: CR, tunicD: CR_D,
    armor: BK, armorL: BK_L, armorD: BK_D, trim: GD, sash: CR, skin: SK, sleeve: BK_L,
  });
  // Gold beast-head chest boss & shoulder trim
  B(v, 'chest', -3, 30, 6, 2, 35, 7, GD);
  B(v, 'chest', -2, 32, 7, 1, 34, 7, GD_L);
  B(v, 'chest', -9, 36, -5, 8, 37, 5, CR);
  // Fierce arrogant face
  v.part('head').symBox(2, 44, 5, 3, 45, 5, EYE).symBox(1, 46, 5, 4, 47, 5, HAIR)
    .box(-1, 43, 6, 0, 44, 6, SKIN_D).box(-2, 41, 5, 1, 41, 5, MOUTH);
  // Iconic Gold Three-Pronged Hair Crown (紫金冠)
  B(v, 'hat', -4, 51, -4, 3, 56, 3, GD);
  B(v, 'hat', -3, 55, -2, 2, 59, 2, GD_L);
  B(v, 'hat', -6, 53, 0, 5, 54, 1, GD_L); // gold hairpin
  // Articulated twin long Pheasant Tail Feathers (雉鸡翎)
  v.bone('plL1', 'hat', 2, 58, 0).bone('plL2', 'plL1', 5, 65, -8);
  v.bone('plR1', 'hat', -3, 58, 0).bone('plR2', 'plR1', -6, 65, -8);
  for (const [s, L] of [[1, 'L'], [-1, 'R']] as const) {
    const x1 = s > 0 ? 2 : -3, x2 = s > 0 ? 5 : -6;
    for (let i = 0; i < 8; i++) B(v, 'pl' + L + '1', x1 + Math.round(s * i * 0.4), 58 + i, -i, x1 + Math.round(s * i * 0.4), 59 + i, -i, i % 2 ? CR_L : GD_L);
    for (let i = 0; i < 10; i++) B(v, 'pl' + L + '2', x2 + Math.round(s * i * 0.3), 65 - i, -8 - i, x2 + Math.round(s * i * 0.3), 66 - i, -8 - i, i % 2 ? GD_L : CR);
  }
  addCloak(v, CR, CR_D, CR_L, 28);
  // 方天画戟 (Sky Piercer Halberd: long gilded pole + twin crescent blades + central spearhead)
  const wx = -11, wy = 18;
  B(v, 'weapon', wx, wy, -24, wx, wy + 1, 36, 0x4e261a);
  B(v, 'weapon', wx, wy, 30, wx, wy + 1, 37, GD);
  B(v, 'weapon', wx, wy - 4, 32, wx, wy - 1, 34, CR_L);
  // Central piercing spear point
  B(v, 'weapon', wx, wy, 38, wx, wy + 1, 51, 0xe8edf4, 0.45);
  // Twin moon-crescent side blades (stepped big horizontal/vertical voxel slabs)
  B(v, 'weapon', wx, wy + 2, 34, wx, wy + 6, 42, 0xd4dce8, 0.3);
  B(v, 'weapon', wx, wy + 7, 36, wx, wy + 8, 40, 0xf2f6ff, 0.4);
  B(v, 'weapon', wx, wy - 5, 34, wx, wy - 1, 42, 0xd4dce8, 0.3);
  B(v, 'weapon', wx, wy - 7, 36, wx, wy - 6, 40, 0xf2f6ff, 0.4);
  return v;
}

// ================================================================== 3. 夏侯惇（独眼猛将 · 盲夏侯）
function buildXiahouDun(): V {
  const v = fine();
  const IR = 0x2a2c34, IR_L = 0x4a4e5c, IR_D = 0x181920;
  const CR = 0x7e2024, CR_L = 0xa22c30, GD = 0xb88c3a, SK = 0xcf9468;
  makeBase(v, {
    boot: IR_D, bootL: IR_L, trou: IR, tunic: CR, tunicD: 0x4e1418,
    armor: IR, armorL: IR_L, armorD: IR_D, trim: CR, sash: CR, skin: SK, sleeve: IR_D,
  });
  // Crimson armor cords across lamellar chest
  B(v, 'chest', -8, 32, 6, 7, 32, 6, CR_L);
  B(v, 'chest', -8, 35, 6, 7, 35, 6, CR_L);
  B(v, 'chest', -5, 36, 6, -3, 37, 6, GD);
  B(v, 'chest', 2, 36, 6, 4, 37, 6, GD);
  // Rugged bearded face + ICONIC LEFT-EYE BLACK EYEPATCH STRAP WITH CRIMSON STAIN
  // Note: model's +x is character's LEFT side! So character's LEFT eye is at x = +2..+3
  v.part('head')
    .box(-3, 44, 5, -2, 45, 5, EYE)            // fierce uncovered right eye
    .box(-4, 46, 5, -1, 46, 5, HAIR)           // heavy right brow
    .box(-1, 43, 6, 0, 44, 6, SKIN_D)          // nose
    .box(-3, 40, 5, 2, 42, 6, HAIR)            // short thick beard & jaw
    .box(-4, 41, 4, -4, 44, 5, HAIR).box(3, 41, 4, 3, 44, 5, HAIR);
  // Black cloth eyepatch over character's LEFT eye (+x) + diagonal strap + crimson stain underneath
  B(v, 'head', 1, 43, 6, 4, 46, 6, 0x161418);
  B(v, 'head', -5, 47, 5, 1, 48, 6, 0x161418);
  B(v, 'head', 4, 43, 2, 5, 45, 5, 0x161418);
  B(v, 'head', 2, 42, 6, 3, 42, 6, CR_L);      // dark crimson stain under the patch
  // Topknot bound with crimson cloth
  B(v, 'hat', -3, 52, -3, 2, 57, 2, HAIR);
  B(v, 'hat', -3, 52, -3, 2, 53, 2, CR_L);
  addCloak(v, 0x222026, IR_D, IR_L, 26);
  // Heavy wide-backed Han ring-pommel sabre (厚背环首重刀)
  const wx = -11, wy = 18;
  B(v, 'weapon', wx, wy, -5, wx, wy + 1, 3, 0x5c3622);
  B(v, 'weapon', wx, wy - 1, -7, wx, wy + 2, -5, GD); // heavy bronze ring pommel
  B(v, 'weapon', wx - 1, wy - 1, 4, wx + 1, wy + 2, 5, GD); // guard
  B(v, 'weapon', wx, wy, 6, wx, wy + 3, 33, 0x565c68);       // dark heavy spine
  B(v, 'weapon', wx, wy - 1, 6, wx, wy, 35, 0xd8e2ec, 0.3);  // bright razor edge
  return v;
}

// ================================================================== 4. 陆逊（江东儒将 · 白衣书生）
function buildLuXun(): V {
  const v = fine();
  const WH = 0xf0f4f2, WH_D = 0xc8d2d0, TL = 0x3b787e, TL_L = 0x569aa0, TL_D = 0x265258;
  const SIL = 0xd0dce0, JD = 0xa8e0c8, SK = 0xe2b48e;
  makeBase(v, {
    boot: 0x262c30, bootL: TL_D, trou: 0x2c3438, tunic: WH, tunicD: WH_D,
    armor: TL, armorL: TL_L, armorD: TL_D, trim: SIL, sash: TL_D, skin: SK, sleeve: WH, robe: true,
  });
  // Clean scholar-general crossed lapel in crisp white & celadon-teal
  B(v, 'chest', -5, 30, 5, 4, 36, 6, WH);
  B(v, 'chest', -4, 30, 6, -2, 36, 6, TL);
  B(v, 'chest', 1, 31, 6, 3, 36, 6, TL);
  B(v, 'chest', -1, 30, 6, 0, 35, 6, SIL);
  // Calm composed young strategist face
  v.part('head').symBox(2, 44, 5, 3, 45, 5, EYE).symBox(2, 46, 5, 4, 46, 5, HAIR)
    .box(-1, 43, 6, 0, 44, 6, SKIN_D).box(-1, 41, 5, 0, 41, 5, MOUTH);
  // White-jade hair crown (玉冠) with jade bead & pin
  B(v, 'hat', -3, 51, -3, 2, 57, 2, WH);
  B(v, 'hat', -2, 53, 3, 1, 55, 3, JD);
  B(v, 'hat', -6, 53, 0, 5, 54, 1, SIL);
  addCloak(v, TL, TL_D, TL_L, 22);
  // 吴钩长剑 (slender bright Wu Jian sword)
  const wx = -11, wy = 18;
  B(v, 'weapon', wx, wy, -5, wx, wy + 1, 3, TL_D);
  B(v, 'weapon', wx - 1, wy - 1, 4, wx + 1, wy + 2, 5, SIL);
  B(v, 'weapon', wx, wy, 4, wx, wy + 1, 5, JD);
  B(v, 'weapon', wx, wy, 6, wx, wy + 1, 34, 0xe8f4f8, 0.38);
  return v;
}

export const GENERAL_DEFS = [
  def({ id: 'gen_zhaoyun', name: '赵云', group: '首领', role: '常山赵子龙', line: '', kind: 'biped', attack: 'swing', tip: 48, scale: 1.04, build: buildZhaoYun }),
  def({ id: 'gen_lubu', name: '吕布', group: '首领', role: '温侯', line: '', kind: 'biped', attack: 'swing', tip: 50, scale: 1.15, build: buildLuBu }),
  def({ id: 'gen_xiahoudun', name: '夏侯惇', group: '首领', role: '独眼猛将', line: '', kind: 'biped', attack: 'swing', tip: 35, scale: 1.08, build: buildXiahouDun }),
  def({ id: 'gen_luxun', name: '陆逊', group: '首领', role: '江东儒将', line: '', kind: 'biped', attack: 'swing', tip: 34, scale: 1.02, build: buildLuXun }),
];
