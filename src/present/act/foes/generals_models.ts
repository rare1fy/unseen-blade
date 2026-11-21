// act-114 / 精修升级：三国四大名将主角级 3.5cm 细体素模型（严格对照官方立绘 + 形态优先雕塑标准）：
//   1. 赵云（gen_zhaoyun）：对照 zhaoyun.png — 银盔云纹眉庇护颊 + 两节动态赤红长缨、银鳞鱼鳞甲、素白战袍披肩、深蓝交领战带、云纹银肩甲、龙胆亮银枪（带动态红枪缨）
//   2. 吕布（gen_lubu）：对照 lubu.png — 紫金三叉束发冠 + 双条三节动态红金雉鸡翎、猩红金边高立领战氅 + 双肩金圆扣、黑金吞兽胸甲、龙鳞黑金肩甲、赤红战袍、方天画戟
//   3. 夏侯惇（gen_xiahoudun）：对照 xiahoudun.png — 高丸子黑发髻 + 朱红双飘带、浓密络腮黑胡、左眼染血黑皮眼罩斜带、玄黑层叠札甲 + 朱红甲绳结、厚背大环首重刀
//   4. 陆逊（gen_luxun）：对照 luxun.png — 中分两缕极细垂鬓、白玉青翠云冠 + 素白双冠带、青绿素白交领银云纹儒袍、深棕银云护腕、青玉佩、两节可动长袍、青冥云纹吴钩长剑
import { type V } from '../../bestiary/kit';
import { fine, skel, B, cbox2, SIDES, MX, def, HAIR, EYE, MOUTH } from './fine_kit';

// ------------------------------------------------------------------ Shared tailored warrior/scholar parts
function makeSkel(v: V, shX: number, wx: number) {
  skel(v, {
    hip: 22, spine: 24, chest: 30, neck: 38, head: 40, jaw: [41, 4], hat: 53, cape: [36, -6],
    sh: [shX, 36, 0], fore: 28, hand: 21, weapon: [-wx, 18, 2], offhand: [wx, 18, 2], leg: 5, knee: 12,
  });
}

function warriorLegs(v: V, o: { boot: number; bootL: number; bootD: number; trou: number; armor: number; armorD: number; trim: number; sash: number }) {
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 2, 7), [sa, sb] = MX(s, 3, 6), [ta, tb] = MX(s, 1, 8);
    // Heavy sculpted war-boots with raised sole & shin greaves (inset 1 cell at knee so knees never z-fight)
    B(v, 'foot' + L, a, 0, -3, b, 0, 5, o.bootD);
    B(v, 'foot' + L, a, 1, -3, b, 1, 5, o.boot);
    B(v, 'foot' + L, sa, 2, -2, sb, 3, 4, o.bootL);
    B(v, 'shin' + L, sa, 4, -2, sb, 11, 2, o.boot);
    B(v, 'shin' + L, sa, 6, 2, sb, 10, 2, o.armor);
    B(v, 'shin' + L, sa, 10, -2, sb, 11, 2, o.trim);
    B(v, 'leg' + L, a, 12, -3, b, 21, 3, o.trou);
    // Layered lamellar thigh tassets with crisp trim hem
    B(v, 'leg' + L, ta, 15, -4, tb, 21, 4, o.armor);
    B(v, 'leg' + L, ta, 18, -4, tb, 18, 4, o.armorD);
    B(v, 'leg' + L, ta, 15, -4, tb, 15, 4, o.trim);
  }
}

function addCape(v: V, w: number, col: number, colD: number, colL: number, trim: number, len = 26) {
  v.bone('clA1', 'cape', 0, 36, -6.5).bone('clA2', 'clA1', 0, 22, -7.5);
  B(v, 'clA1', -w, 22, -7, w - 1, 36, -6, col);
  B(v, 'clA1', -w, 34, -7, w - 1, 36, -6, colL);
  B(v, 'clA1', -w, 22, -7, -w, 36, -6, trim);
  B(v, 'clA1', w - 1, 22, -7, w - 1, 36, -6, trim);
  // Subtle vertical drapery shadows (clean straight columns, zero diagonal noise)
  B(v, 'clA1', -Math.floor(w * 0.5), 22, -7, -Math.floor(w * 0.5), 33, -7, colD);
  B(v, 'clA1', Math.floor(w * 0.5) - 1, 22, -7, Math.floor(w * 0.5) - 1, 33, -7, colD);
  const y0 = Math.max(4, 36 - len);
  B(v, 'clA2', -w - 1, y0, -8, w, 21, -7, col);
  B(v, 'clA2', -w - 1, y0, -8, w, y0 + 1, -7, colD);
  B(v, 'clA2', -w - 1, y0 + 2, -8, w, y0 + 2, -7, trim);
  B(v, 'clA2', -w - 1, y0, -8, -w - 1, 21, -7, trim);
  B(v, 'clA2', w, y0, -8, w, 21, -7, trim);
}

// ================================================================== 1. 赵云（常山赵子龙 · 白袍银甲龙胆枪）
function buildZhaoYun(): V {
  const v = fine();
  const WH = 0xf2f5fa, WH_D = 0xc6d0de, WH_L = 0xffffff;
  const SIL = 0xcfd8e6, SIL_L = 0xf0f6ff, SIL_D = 0x7e8da4;
  const NV = 0x1e2c4e, NV_L = 0x304474, RED = 0xc42428, RED_L = 0xe83c3e, RED_D = 0x821418;
  const SK = 0xe4aa7c, SK_D = 0xb87e54, BT = 0x222632, BT_D = 0x14161e;
  makeSkel(v, 11, 11);

  warriorLegs(v, { boot: BT, bootL: SIL, bootD: BT_D, trou: WH_D, armor: SIL, armorD: SIL_D, trim: NV, sash: NV });
  // Snow-white battle skirt panels + ornate navy & silver dragon-belt + hanging front tabard
  cbox2(v, 'hips', -8, 20, -6, 7, 23, 5, NV, 2);
  B(v, 'hips', -8, 22, -6, 7, 22, 5, NV_L);
  B(v, 'hips', -2, 20, 5, 1, 23, 6, SIL_L); B(v, 'hips', -1, 21, 6, 0, 22, 6, NV);
  // Crisp snow-white front war apron trimmed in deep navy & silver
  B(v, 'hips', -3, 12, 5, 2, 19, 5, WH);
  B(v, 'hips', -3, 12, 5, 2, 13, 5, NV); B(v, 'hips', -3, 14, 5, 2, 14, 5, SIL_L);

  // Silver fish-scale lamellar cuirass under snow-white outer battle mantle & deep navy crossed battle sash (zhaoyun.png!)
  cbox2(v, 'spine', -8, 24, -5, 7, 29, 5, SIL, 2);
  B(v, 'spine', -7, 25, 5, 6, 25, 5, SIL_D); B(v, 'spine', -7, 27, 5, 6, 27, 5, SIL_D);
  cbox2(v, 'chest', -9, 30, -6, 8, 37, 6, SIL, 2);
  // Horizontal silver lamellar scale rows across center chest
  B(v, 'chest', -4, 31, 6, 3, 31, 6, SIL_D); B(v, 'chest', -4, 33, 6, 3, 33, 6, SIL_D);
  // Snow-white outer battle mantle draping cleanly down both chest flanks & upper shoulders
  B(v, 'chest', -9, 30, -5, -5, 37, 6, WH); B(v, 'chest', 4, 30, -5, 8, 37, 6, WH);
  B(v, 'chest', -8, 37, -5, -5, 38, 4, WH_L); B(v, 'chest', 4, 37, -5, 7, 38, 4, WH_L);
  // Crisp snow-white inner V-collar & deep navy crossed sash (zhaoyun.png!)
  B(v, 'chest', -2, 35, 5, 1, 37, 6, WH_L); B(v, 'chest', -1, 37, 5, 0, 37, 6, SK);
  B(v, 'chest', -5, 35, 6, -3, 37, 6, NV); B(v, 'chest', 2, 35, 6, 4, 37, 6, NV);
  B(v, 'chest', -3, 33, 6, -1, 35, 6, NV); B(v, 'chest', 0, 33, 6, 2, 35, 6, NV);
  B(v, 'chest', -1, 30, 6, 1, 33, 6, NV); B(v, 'spine', -2, 24, 5, 0, 29, 5, NV);
  B(v, 'neck', -2, 38, -2, 1, 40, 2, SK).box(-2, 38, -2, 1, 38, 2, SK_D);

  // Sloped white mantle shoulder caps + cloud-embossed silver pauldrons + sleek white sleeves & silver vambraces
  for (const [L, s] of SIDES) {
    const [ua, ub] = MX(s, 9, 14), [fa, fb] = MX(s, 10, 13), ox = s > 0 ? 14 : -15;
    B(v, 'arm' + L, ua, 31, -3, ub, 36, 3, SIL);
    B(v, 'arm' + L, ua, 36, -3, ub, 37, 3, WH); B(v, 'arm' + L, ox, 37, -3, ox, 37, 3, null);
    B(v, 'arm' + L, ua, 33, -3, ub, 34, 3, SIL_L); B(v, 'arm' + L, ua, 31, -3, ub, 31, 3, NV);
    B(v, 'arm' + L, fa, 28, -2, fb, 30, 2, WH);
    B(v, 'fore' + L, fa, 21, -2, fb, 27, 2, SIL); B(v, 'fore' + L, fa, 24, -2, fb, 25, 2, SIL_L);
    B(v, 'fore' + L, fa, 21, -2, fb, 22, 2, NV);
    B(v, 'hand' + L, fa, 17, -1, fb, 20, 2, SK).box(s > 0 ? fb : fa, 17, -1, s > 0 ? fb : fa, 19, 2, SK_D);
  }

  // Sculpted dashing young general face (zhaoyun.png!)
  cbox2(v, 'head', -6, 42, -6, 5, 51, 5, SK, 2);
  cbox2(v, 'head', -4, 40, -5, 3, 41, 5, SK, 1);
  v.paint(q => (q.y >= 44 && (q.z <= -3 || ((q.x <= -5 || q.x >= 4) && q.z <= 1)) && q.c === SK ? HAIR : null), 'head');
  v.part('head')
    .symBox(1, 45, 5, 3, 45, 5, WH_L).symBox(2, 45, 5, 3, 45, 5, EYE)
    .symBox(1, 47, 5, 4, 47, 5, HAIR)
    .box(-1, 43, 6, 0, 44, 6, SK).box(-1, 43, 6, 0, 43, 6, SK_D)
    .box(-1, 41, 5, 0, 41, 5, MOUTH);

  // Sculpted Silver Phoenix-Brow War Helmet (银盔云纹眉庇 + 护颊) on `hat`
  cbox2(v, 'hat', -7, 48, -7, 6, 54, 6, SIL, 2);
  cbox2(v, 'hat', -6, 55, -6, 5, 56, 5, SIL_L, 2);
  cbox2(v, 'hat', -4, 57, -4, 3, 57, 3, SIL_L, 1);
  // Central raised silver helm ridge + ornate cloud-scroll brow guard + bright silver gem
  B(v, 'hat', -1, 51, -5, 0, 58, 6, SIL_L);
  B(v, 'hat', -6, 48, 6, 5, 50, 6, SIL_D); B(v, 'hat', -5, 49, 6, 4, 50, 6, SIL_L); B(v, 'hat', -1, 49, 7, 0, 51, 7, WH_L);
  // Sleek flared silver cheek/ear guards & nape skirt framing his jaw
  B(v, 'hat', -7, 42, -2, -6, 48, 3, SIL); B(v, 'hat', -7, 42, 2, -6, 47, 3, SIL_L);
  B(v, 'hat', 5, 42, -2, 6, 48, 3, SIL); B(v, 'hat', 5, 42, 2, 6, 47, 3, SIL_L);
  B(v, 'hat', -5, 43, -7, 4, 48, -6, SIL_D);
  // Silver finial socket + prominent arching 2-segment ARTICULATED crimson horsehair plume (zpA1 -> zpA2, visible from front like zhaoyun.png!)
  B(v, 'hat', -2, 58, -2, 1, 59, 1, SIL_L);
  v.bone('zpA1', 'hat', 0, 59.5, -2).bone('zpA2', 'zpA1', 0, 52, -8.5);
  B(v, 'zpA1', -2, 59, -5, 1, 63, 0, RED_L);
  B(v, 'zpA1', -2, 52, -9, 1, 60, -5, RED);
  B(v, 'zpA1', -1, 56, -8, 0, 62, -3, RED_L);
  B(v, 'zpA2', -2, 42, -10, 1, 52, -7, RED);
  B(v, 'zpA2', -1, 38, -10, 0, 45, -8, RED_D);

  // Flowing snow-white & silver-trimmed battle cloak
  addCape(v, 9, WH, WH_D, WH_L, SIL_L, 28);

  // 龙胆亮银枪 (Dragon-Gall Silver Spear: crisp 3-tone forged cold steel, zero bloom washout + articulated crimson tassel `spT1`!)
  const wx = -11, wy = 18;
  B(v, 'weapon', wx, wy, -25, wx, wy + 1, 34, SIL);
  B(v, 'weapon', wx, wy, -27, wx, wy + 1, -25, SIL_L);
  B(v, 'weapon', wx, wy, -6, wx, wy + 1, 6, NV);
  B(v, 'weapon', wx - 1, wy, 33, wx + 1, wy + 1, 36, SIL_L);
  B(v, 'weapon', wx, wy, 34, wx, wy + 1, 35, RED_L);
  v.bone('spT1', 'weapon', wx + 0.5, wy, 34.5);
  B(v, 'spT1', wx, wy - 5, 33, wx, wy - 1, 35, RED);
  B(v, 'spT1', wx, wy - 7, 34, wx, wy - 5, 35, RED_D);
  // Crisp 3-tone forged silver diamond spearhead (zero bloom!)
  B(v, 'weapon', wx - 1, wy, 37, wx + 1, wy + 1, 44, SIL);
  B(v, 'weapon', wx, wy, 37, wx, wy + 1, 47, SIL_D);
  B(v, 'weapon', wx - 1, wy, 38, wx - 1, wy, 44, WH_L); B(v, 'weapon', wx + 1, wy, 38, wx + 1, wy, 44, WH_L);
  B(v, 'weapon', wx, wy, 45, wx, wy + 1, 52, WH_L);
  return v;
}

// ================================================================== 2. 吕布（温侯战神 · 紫金冠吞兽甲双雉鸡翎方天画戟）
function buildLuBu(): V {
  const v = fine();
  const BK = 0x22202a, BK_L = 0x3c3848, BK_D = 0x141218;
  const GD = 0xdba432, GD_L = 0xf8ce5c, GD_D = 0x8e6418;
  const CR = 0xb41c20, CR_L = 0xdc2e34, CR_D = 0x6e1014;
  const SK = 0xe0a272, SK_D = 0xb2764c, STEEL = 0xe8eff8, STEEL_D = 0x9aa6b8;
  makeSkel(v, 12, 12);

  warriorLegs(v, { boot: BK_D, bootL: GD, bootD: 0x0c0a10, trou: BK, armor: BK, armorD: BK_D, trim: GD, sash: CR });
  // Broad crimson & gold war-belt + golden beast-buckle + grand hanging crimson-gold battle tabard
  cbox2(v, 'hips', -9, 20, -6, 8, 23, 6, CR, 2);
  B(v, 'hips', -9, 20, -6, 8, 20, 6, GD); B(v, 'hips', -9, 23, -6, 8, 23, 6, GD_L);
  B(v, 'hips', -3, 20, 6, 2, 23, 7, GD_L); B(v, 'hips', -1, 21, 7, 0, 22, 7, CR_L);
  B(v, 'hips', -3, 10, 6, 2, 19, 6, CR); B(v, 'hips', -3, 10, 6, 2, 11, 6, GD_L); B(v, 'hips', -1, 13, 6, 0, 17, 6, GD);

  // Towering broad obsidian-gold Taotie Beast-Head Cuirass (黑金吞兽甲) + high upturned royal crimson-gold collar (lubu.png!)
  cbox2(v, 'spine', -9, 24, -6, 8, 29, 5, BK, 2);
  B(v, 'spine', -7, 25, 5, 6, 25, 5, GD_D); B(v, 'spine', -7, 27, 5, 6, 27, 5, GD_D);
  cbox2(v, 'chest', -10, 30, -6, 9, 37, 6, BK, 2);
  // Sculpted Gold Taotie Beast-Head relief across center chest (crisp obsidian eyes/recesses + golden brows & fangs!)
  B(v, 'chest', -5, 30, 6, 4, 36, 7, BK_D);
  B(v, 'chest', -5, 35, 7, 4, 35, 7, GD_L);
  B(v, 'chest', -4, 34, 7, -3, 34, 7, GD); B(v, 'chest', 2, 34, 7, 3, 34, 7, GD);
  B(v, 'chest', -3, 33, 7, -2, 33, 7, BK_D); B(v, 'chest', 1, 33, 7, 2, 33, 7, BK_D); // recessed beast eyes!
  B(v, 'chest', -1, 32, 7, 0, 34, 7, GD_L); // beast nose bridge
  B(v, 'chest', -4, 31, 7, 3, 31, 7, GD); B(v, 'chest', -3, 30, 7, -2, 30, 7, GD_L); B(v, 'chest', 1, 30, 7, 2, 30, 7, GD_L); // twin fangs!
  // Royal Crimson & Gold draped war-mantle yoke + TWO ICONIC CIRCULAR GOLDEN SHOULDER CLASP MEDALLIONS (lubu.png!)
  B(v, 'chest', -10, 36, -6, 9, 38, 6, CR);
  B(v, 'chest', -9, 38, -5, 8, 38, 5, CR_L);
  B(v, 'chest', -8, 35, 6, -6, 37, 7, GD_L); B(v, 'chest', -7, 36, 7, -7, 36, 7, GD_D);
  B(v, 'chest', 5, 35, 6, 7, 37, 7, GD_L); B(v, 'chest', 6, 36, 7, 6, 36, 7, GD_D);
  // High upturned royal crimson & gold standing collar framing his neck & jaw
  B(v, 'chest', -7, 38, -6, 6, 43, -5, CR); B(v, 'chest', -7, 43, -6, 6, 43, -5, GD_L);
  B(v, 'chest', -8, 38, -5, -7, 42, 0, CR); B(v, 'chest', -8, 42, -5, -7, 42, 0, GD_L);
  B(v, 'chest', 6, 38, -5, 7, 42, 0, CR); B(v, 'chest', 6, 42, -5, 7, 42, 0, GD_L);
  B(v, 'neck', -2, 38, -2, 1, 40, 2, SK).box(-2, 38, -2, 1, 38, 2, SK_D);

  // Massive Obsidian & Gold Dragon-Scale Pauldrons + crimson mantle folds + armored vambraces
  for (const [L, s] of SIDES) {
    const [ua, ub] = MX(s, 10, 16), [fa, fb] = MX(s, 11, 14), ox = s > 0 ? 16 : -17;
    B(v, 'arm' + L, ua, 31, -4, ub, 37, 4, BK);
    B(v, 'arm' + L, ua, 37, -4, ub, 38, 4, CR_L); B(v, 'arm' + L, ox, 38, -4, ox, 38, 4, null);
    B(v, 'arm' + L, ua, 36, -4, ub, 36, 4, GD_L); B(v, 'arm' + L, ua, 33, -4, ub, 33, 4, GD);
    B(v, 'arm' + L, ua, 31, -4, ub, 31, 4, GD_L);
    B(v, 'arm' + L, fa, 28, -2, fb, 30, 2, BK_L);
    B(v, 'fore' + L, fa, 21, -2, fb, 27, 2, BK); B(v, 'fore' + L, fa, 24, -2, fb, 25, 2, GD);
    B(v, 'fore' + L, fa, 21, -2, fb, 22, 2, GD_L);
    B(v, 'hand' + L, fa, 17, -1, fb, 20, 2, SK).box(s > 0 ? fb : fa, 17, -1, s > 0 ? fb : fa, 19, 2, SK_D);
  }

  // Fierce arrogant God-of-War face + windswept spiked black hair (lubu.png!)
  cbox2(v, 'head', -6, 42, -6, 5, 52, 5, SK, 2);
  cbox2(v, 'head', -5, 40, -5, 4, 41, 5, SK, 1);
  v.paint(q => (q.y >= 49 || (q.y >= 44 && (q.z <= -3 || ((q.x <= -5 || q.x >= 4) && q.z <= 2))) ? HAIR : null), 'head');
  // Windswept fierce hair tufts around crown & temples
  B(v, 'head', -7, 47, -5, -6, 51, 2, HAIR); B(v, 'head', 5, 47, -5, 6, 51, 2, HAIR);
  B(v, 'head', -5, 50, 5, -3, 51, 5, HAIR); B(v, 'head', 2, 50, 5, 4, 51, 5, HAIR); B(v, 'head', -1, 51, 5, 0, 52, 5, HAIR);
  v.part('head')
    .symBox(1, 45, 5, 3, 45, 5, 0xf8f8f8).symBox(2, 45, 5, 3, 45, 5, EYE)
    .symBox(1, 47, 5, 4, 48, 5, HAIR)
    .box(-1, 43, 6, 0, 44, 6, SK).box(-1, 43, 6, 0, 43, 6, SK_D)
    .box(-2, 41, 5, 1, 41, 5, MOUTH);

  // Ornate 3-Pronged Purple-Gold Hair Crown (束发紫金冠) with ruby gem on `hat`
  cbox2(v, 'hat', -5, 52, -5, 4, 55, 4, GD, 2);
  B(v, 'hat', -4, 53, 4, 3, 54, 5, GD_L);
  B(v, 'hat', -1, 53, 5, 0, 55, 5, CR_L); // crimson ruby brow gem
  // Three tall sculpted golden crown prongs (lubu.png!)
  B(v, 'hat', -1, 56, 2, 0, 62, 3, GD_L);
  B(v, 'hat', -4, 56, 1, -3, 60, 2, GD); B(v, 'hat', 2, 56, 1, 3, 60, 2, GD);
  B(v, 'hat', -7, 54, -1, 6, 54, 0, GD_L); // long gold crown pin

  // TWO MONUMENTAL GRACEFULLY ARCHING 3-SEGMENT PHEASANT TAIL PLUMES (雉鸡翎 — clean banded blocks, ZERO jagged 1-cell stairs!)
  v.bone('plL1', 'hat', 2.5, 58, -1).bone('plL2', 'plL1', 5, 65, -7).bone('plL3', 'plL2', 6, 61, -15);
  v.bone('plR1', 'hat', -3.5, 58, -1).bone('plR2', 'plR1', -6, 65, -7).bone('plR3', 'plR2', -7, 61, -15);
  for (const [s, L] of [[1, 'L'], [-1, 'R']] as const) {
    const px = (n: number) => (s > 0 ? n : -1 - n);
    // Segment 1: rises smoothly upward & back from golden crown socket
    B(v, 'pl' + L + '1', px(2), 57, -3, px(3), 60, -1, CR_L);
    B(v, 'pl' + L + '1', px(3), 60, -5, px(4), 63, -3, GD_L);
    B(v, 'pl' + L + '1', px(4), 63, -7, px(5), 65, -5, CR_L);
    // Segment 2: crests & sweeps dramatically backward
    B(v, 'pl' + L + '2', px(4), 64, -10, px(5), 66, -7, GD_L);
    B(v, 'pl' + L + '2', px(5), 63, -13, px(6), 65, -10, CR_L);
    B(v, 'pl' + L + '2', px(5), 60, -16, px(6), 63, -13, GD_L);
    // Segment 3: graceful cascading crimson-and-gold tail tip
    B(v, 'pl' + L + '3', px(5), 55, -18, px(6), 60, -16, CR);
    B(v, 'pl' + L + '3', px(5), 50, -19, px(6), 55, -18, GD_L);
    B(v, 'pl' + L + '3', px(5), 45, -20, px(5), 50, -19, CR_D);
  }

  // Grand sweeping royal crimson & gold-bordered battle cape
  addCape(v, 10, CR, CR_D, CR_L, GD_L, 30);

  // 方天画戟 (Sky-Piercer Halberd: gilded dragon socket + monumental twin crescent blades + central pike + articulated tassel!)
  const wx = -12, wy = 18;
  B(v, 'weapon', wx, wy, -28, wx, wy + 1, 36, 0x3e1a14);
  B(v, 'weapon', wx, wy, -30, wx, wy + 1, -28, GD_L);
  for (const rz of [-14, -2, 12, 24]) B(v, 'weapon', wx, wy, rz, wx, wy + 1, rz + 1, GD);
  // Ornate gilded dragon-collar socket
  B(v, 'weapon', wx - 1, wy - 1, 32, wx + 1, wy + 2, 38, GD);
  B(v, 'weapon', wx - 1, wy, 34, wx + 1, wy + 1, 37, GD_L);
  // Articulated crimson halberd tassel
  v.bone('spT1', 'weapon', wx + 0.5, wy - 1, 34.5);
  B(v, 'spT1', wx, wy - 6, 33, wx, wy - 2, 35, CR_L);
  B(v, 'spT1', wx, wy - 9, 34, wx, wy - 6, 35, CR_D);
  // Soaring central diamond spear pike (crisp 3-tone forged cold steel, zero bloom washout!)
  B(v, 'weapon', wx - 1, wy, 39, wx + 1, wy + 1, 46, STEEL_D);
  B(v, 'weapon', wx, wy, 39, wx, wy + 1, 54, STEEL);
  B(v, 'weapon', wx, wy, 48, wx, wy, 54, 0xf6faff);
  // Monumental Twin Swept Moon-Crescent Side Blades (crisp steel core + razor white outer edge, zero bloom!)
  B(v, 'weapon', wx, wy + 2, 34, wx, wy + 6, 43, 0x525a6a);
  B(v, 'weapon', wx, wy + 6, 35, wx, wy + 8, 42, STEEL_D);
  B(v, 'weapon', wx, wy + 9, 37, wx, wy + 10, 40, 0xf4f8ff);
  B(v, 'weapon', wx, wy - 5, 34, wx, wy - 1, 43, 0x525a6a);
  B(v, 'weapon', wx, wy - 7, 35, wx, wy - 5, 42, STEEL_D);
  B(v, 'weapon', wx, wy - 9, 37, wx, wy - 8, 40, 0xf4f8ff);
  return v;
}

// ================================================================== 3. 夏侯惇（独眼猛将 · 盲夏侯 · 玄黑札甲环首重刀）
function buildXiahouDun(): V {
  const v = fine();
  const IR = 0x262832, IR_L = 0x484c5c, IR_D = 0x161820;
  const CR = 0x8e1e24, CR_L = 0xb82c32, CR_D = 0x561216;
  const GD = 0xc4943e, SK = 0xd69666, SK_D = 0xa66c44, STEEL = 0xe2eaf2, STEEL_D = 0x626a78;
  makeSkel(v, 12, 12);

  warriorLegs(v, { boot: IR_D, bootL: IR_L, bootD: 0x0e0f14, trou: IR, armor: IR, armorD: IR_D, trim: CR_L, sash: CR });
  cbox2(v, 'hips', -9, 20, -6, 8, 23, 5, CR_D, 2);
  B(v, 'hips', -9, 22, -6, 8, 22, 5, CR_L);
  B(v, 'hips', -2, 20, 5, 1, 23, 6, GD);
  B(v, 'hips', -3, 12, 5, 2, 19, 5, IR); B(v, 'hips', -3, 12, 5, 2, 13, 5, CR_L);

  // Heavy multi-row Obsidian Lamellar Cuirass laced with bold crimson cords & vertical knots (xiahoudun.png!)
  cbox2(v, 'spine', -9, 24, -5, 8, 29, 5, IR, 2);
  cbox2(v, 'chest', -10, 30, -6, 9, 37, 6, IR, 2);
  // Deep crimson inner crossed collar framing his thick neck
  B(v, 'chest', -4, 36, 5, 3, 38, 6, CR_L); B(v, 'chest', -2, 37, 5, 1, 38, 6, SK);
  // Horizontal crimson lamellar lacing cords + vertical leather shoulder ties & steel rivets (xiahoudun.png!)
  B(v, 'chest', -9, 32, 6, 8, 32, 6, CR_L); B(v, 'chest', -9, 35, 6, 8, 35, 6, CR_L);
  for (const x of [-6, 5]) B(v, 'chest', x, 31, 6, x + 1, 37, 6, CR_L);
  for (const x of [-4, -1, 2]) B(v, 'chest', x, 33, 6, x, 33, 6, IR_L);
  B(v, 'neck', -3, 38, -2, 2, 40, 2, SK).box(-3, 38, -2, 2, 38, 2, SK_D);

  // Heavy Layered Multi-Tier Obsidian Shoulder Plates laced with crimson cords (xiahoudun.png!)
  for (const [L, s] of SIDES) {
    const [ua, ub] = MX(s, 10, 16), [fa, fb] = MX(s, 11, 14), ox = s > 0 ? 16 : -17;
    B(v, 'arm' + L, ua, 31, -4, ub, 37, 4, IR);
    B(v, 'arm' + L, ua, 37, -4, ub, 38, 4, IR_L); B(v, 'arm' + L, ox, 38, -4, ox, 38, 4, null);
    B(v, 'arm' + L, ua, 35, -4, ub, 35, 4, CR_L); B(v, 'arm' + L, ua, 32, -4, ub, 32, 4, CR_L);
    B(v, 'arm' + L, fa, 28, -2, fb, 30, 2, CR_D);
    B(v, 'fore' + L, fa, 21, -2, fb, 27, 2, IR); B(v, 'fore' + L, fa, 24, -2, fb, 24, 2, IR_L);
    B(v, 'fore' + L, fa, 21, -2, fb, 22, 2, CR_L);
    B(v, 'hand' + L, fa, 17, -1, fb, 20, 2, SK).box(s > 0 ? fb : fa, 17, -1, s > 0 ? fb : fa, 19, 2, SK_D);
  }

  // Battle-scarred rugged veteran face, full black beard & ICONIC BLOOD-STAINED BLACK EYEPATCH (xiahoudun.png!)
  cbox2(v, 'head', -6, 42, -6, 5, 52, 5, SK, 2);
  cbox2(v, 'head', -5, 40, -5, 4, 41, 5, SK, 1);
  v.paint(q => (q.y >= 50 || (q.y >= 44 && (q.z <= -3 || ((q.x <= -5 || q.x >= 4) && q.z <= 1))) ? HAIR : null), 'head');
  // Rugged full black moustache & jaw beard framing mouth
  B(v, 'head', -5, 40, 2, 4, 42, 6, HAIR); B(v, 'head', -3, 39, 4, 2, 40, 6, HAIR);
  B(v, 'head', -3, 43, 6, 2, 43, 6, HAIR); B(v, 'head', -2, 42, 6, 1, 42, 6, SK); B(v, 'head', -1, 41, 6, 0, 41, 6, HAIR);
  // Fierce uncovered right eye (-x) + heavy brow + rugged nose
  B(v, 'head', -4, 45, 5, -2, 45, 5, 0xf0eee8); B(v, 'head', -3, 45, 5, -2, 45, 5, EYE);
  B(v, 'head', -4, 47, 5, -1, 47, 5, HAIR);
  B(v, 'head', -1, 44, 6, 0, 45, 6, SK).box(-1, 44, 6, 0, 44, 6, SK_D);
  // Iconic black leather eyepatch over character's LEFT eye (+x) + subtle dark-crimson scar + diagonal head strap
  B(v, 'head', 1, 44, 6, 4, 47, 6, 0x16141a);
  B(v, 'head', 3, 44, 6, 3, 44, 6, CR);         // subtle dark-crimson battle slash on lower corner
  B(v, 'head', -5, 48, 5, 1, 49, 6, 0x16141a); // diagonal strap over right forehead
  B(v, 'head', 4, 45, -3, 5, 47, 5, 0x16141a); // side strap wrapping around left temple

  // Compact rounded high topknot bun bound with crimson cloth + 2-segment ARTICULATED fluttering crimson tails (hbA1 -> hbA2)
  cbox2(v, 'hat', -3, 52, -4, 2, 53, 1, CR_L, 1);
  cbox2(v, 'hat', -3, 54, -4, 2, 56, 1, HAIR, 1);
  v.bone('hbA1', 'hat', 0, 53, -4.5).bone('hbA2', 'hbA1', 0, 46, -7.5);
  B(v, 'hbA1', -2, 46, -7, -1, 54, -5, CR_L); B(v, 'hbA1', 1, 47, -7, 2, 54, -5, CR);
  B(v, 'hbA2', -2, 39, -9, -1, 46, -7, CR); B(v, 'hbA2', 1, 41, -9, 2, 46, -7, CR_D);

  // Broad dark-charcoal & blood-crimson battle cloak
  addCape(v, 10, 0x201d24, IR_D, IR_L, CR_L, 28);

  // 厚背大环首重刀 (Heavy Backed Han Ring-Pommel War Cleaver: crisp 3-tone cold forged steel, zero bloom!)
  const wx = -12, wy = 18;
  B(v, 'weapon', wx, wy - 2, -10, wx, wy + 3, -5, STEEL);
  B(v, 'weapon', wx, wy - 1, -9, wx, wy + 2, -6, null);
  B(v, 'weapon', wx, wy, -5, wx, wy + 1, 3, CR);
  B(v, 'weapon', wx - 1, wy - 1, 4, wx + 1, wy + 2, 5, GD);
  B(v, 'weapon', wx, wy + 2, 6, wx, wy + 4, 35, 0x464c5a);
  B(v, 'weapon', wx, wy, 6, wx, wy + 1, 37, 0xbecad8);
  B(v, 'weapon', wx, wy - 1, 6, wx, wy - 1, 38, 0xf4f8ff);
  B(v, 'weapon', wx, wy, 37, wx, wy + 2, 39, 0xf4f8ff);
  return v;
}

// ================================================================== 4. 陆逊（江东儒将 · 白衣玉冠青冥吴钩长剑）
function buildLuXun(): V {
  const v = fine();
  const WH = 0xf4f6f2, WH_D = 0xcad2cc, WH_L = 0xffffff;
  const CEL = 0x76b29c, CEL_L = 0x98ceb8, CEL_D = 0x487c6c;
  const TL_D = 0x264846, SIL = 0xd6e0e6, SIL_L = 0xf2f8fc, JD = 0x9ee0c4;
  const BR = 0x4a2e28, BR_D = 0x2e1c18, SK = 0xe8b892, SK_D = 0xba8c68;
  makeSkel(v, 10, 10);

  // Graceful scholar boots & articulated 2-tier celadon-and-white A-line scholar battle robe (robe1 -> robe2)
  for (const [L, s] of SIDES) {
    const [a, b] = MX(s, 2, 6), [sa, sb] = MX(s, 3, 5);
    B(v, 'foot' + L, a, 0, -2, b, 1, 5, 0x22282c);
    B(v, 'foot' + L, sa, 2, -2, sb, 3, 4, TL_D);
    B(v, 'shin' + L, sa, 4, -2, sb, 11, 2, 0x2a3236);
    B(v, 'leg' + L, a, 12, -2, b, 21, 2, WH_D);
  }
  v.bone('robe1', 'hips', 0, 20, 0).bone('robe2', 'robe1', 0, 12, 0);
  cbox2(v, 'robe1', -8, 12, -5, 7, 19, 5, CEL, 2);
  B(v, 'robe1', -2, 12, 5, 1, 19, 5, WH);
  cbox2(v, 'robe1', -8, 12, -5, 7, 12, 5, CEL_D, 2);
  cbox2(v, 'robe2', -9, 4, -6, 8, 11, 6, CEL, 2);
  B(v, 'robe2', -2, 5, 6, 1, 11, 6, WH);
  cbox2(v, 'robe2', -9, 4, -6, 8, 5, 6, WH_L, 2);
  cbox2(v, 'robe2', -9, 4, -6, 8, 4, 6, SIL, 2);

  // Slender celadon-and-silver waist sash with hanging jade pendant (玉佩)
  cbox2(v, 'hips', -7, 20, -5, 6, 23, 5, TL_D, 2);
  B(v, 'hips', -7, 22, -5, 6, 22, 5, SIL_L);
  B(v, 'hips', -1, 20, 5, 0, 23, 6, JD); // jade clasp
  B(v, 'hips', 3, 15, 6, 4, 20, 6, JD); B(v, 'hips', 3, 14, 6, 4, 15, 6, WH_L); // hanging jade pendant

  // Layered Celadon-Jade & Snow-White Brocade Scholar-General Robe with silver-cloud shoulder stripes (luxun.png!)
  cbox2(v, 'spine', -7, 24, -5, 6, 29, 5, CEL, 2);
  cbox2(v, 'chest', -8, 30, -5, 7, 37, 5, CEL, 2);
  cbox2(v, 'chest', -7, 37, -4, 6, 38, 4, CEL_L, 2);
  // Crisp snow-white inner crossed V-collar & silver brocade outer collar trim (luxun.png!)
  B(v, 'chest', -3, 33, 5, 2, 37, 5, WH_L); B(v, 'chest', -1, 36, 5, 0, 37, 5, SK);
  B(v, 'chest', -4, 34, 5, -3, 37, 5, SIL); B(v, 'chest', 2, 34, 5, 3, 37, 5, SIL);
  B(v, 'chest', -2, 30, 5, 0, 33, 5, WH); B(v, 'spine', -1, 24, 5, 0, 29, 5, WH);
  // Vertical snow-white & silver-cloud brocade bands running down both chest shoulders (luxun.png!)
  B(v, 'chest', -7, 30, 5, -6, 37, 5, WH_L); B(v, 'chest', 5, 30, 5, 6, 37, 5, WH_L);
  B(v, 'chest', -7, 32, 5, -6, 32, 5, SIL); B(v, 'chest', 5, 32, 5, 6, 32, 5, SIL);
  B(v, 'neck', -2, 38, -2, 1, 40, 2, SK).box(-2, 38, -2, 1, 38, 2, SK_D);

  // Sloped celadon-jade brocade sleeves + dark-mahogany leather bracers trimmed with sculpted silver cloud cuffs (luxun.png!)
  for (const [L, s] of SIDES) {
    const [ua, ub] = MX(s, 8, 13), [fa, fb] = MX(s, 9, 12), ox = s > 0 ? 13 : -14;
    B(v, 'arm' + L, ua, 29, -3, ub, 37, 3, CEL);
    B(v, 'arm' + L, ua, 36, -3, ub, 37, 3, CEL_L); B(v, 'arm' + L, ox, 37, -3, ox, 37, 3, null);
    B(v, 'arm' + L, ua, 31, 2, ub, 35, 3, WH_L); // silver-white cloud brocade stripe on sleeve
    B(v, 'fore' + L, fa, 21, -2, fb, 27, 2, BR);
    B(v, 'fore' + L, fa, 26, -2, fb, 27, 2, SIL_L); // sculpted silver cloud cuff trim (luxun.png!)
    B(v, 'fore' + L, fa, 21, -2, fb, 22, 2, BR_D);
    B(v, 'hand' + L, fa, 17, -1, fb, 20, 2, SK).box(s > 0 ? fb : fa, 17, -1, s > 0 ? fb : fa, 19, 2, SK_D);
  }

  // Refined handsome young Jiangdong strategist face + wispy face-framing black strands (luxun.png!)
  cbox2(v, 'head', -5, 42, -5, 4, 51, 5, SK, 2);
  cbox2(v, 'head', -4, 40, -4, 3, 41, 4, SK, 1);
  v.paint(q => (q.y >= 49 || (q.y >= 44 && (q.z <= -3 || ((q.x <= -4 || q.x >= 3) && q.z <= 1))) ? HAIR : null), 'head');
  // Two ultra-slender 1-cell wispy face-framing strands curving across forehead (luxun.png!)
  B(v, 'head', -4, 47, 5, -4, 49, 5, HAIR); B(v, 'head', 2, 47, 5, 2, 49, 5, HAIR);
  B(v, 'head', -5, 45, 4, -5, 49, 5, HAIR); B(v, 'head', 4, 45, 4, 4, 49, 5, HAIR);
  v.part('head')
    .symBox(2, 45, 5, 2, 46, 5, EYE)
    .symBox(1, 47, 5, 3, 47, 5, HAIR)
    .box(-1, 43, 6, 0, 44, 6, SK).box(-1, 43, 6, 0, 43, 6, SK_D)
    .box(-1, 41, 5, 0, 41, 5, MOUTH);

  // Sculpted White-Jade & Celadon Cloud Crown (白玉青翠云冠) + silver hairpin + 2-segment ARTICULATED ivory silk ribbons (crA1 -> crA2)
  cbox2(v, 'hat', -3, 52, -4, 2, 57, 2, HAIR, 1);
  B(v, 'hat', -4, 52, -3, 3, 54, 3, WH_L);
  B(v, 'hat', -3, 54, 2, 2, 57, 3, WH_L);
  B(v, 'hat', -1, 54, 3, 0, 56, 3, JD); // pale-celadon jade centerpiece plaque (luxun.png!)
  B(v, 'hat', -7, 54, -1, 6, 54, 0, SIL_L); // horizontal silver hairpin
  v.bone('crA1', 'hat', 0, 53, -4.5).bone('crA2', 'crA1', 0, 43, -7);
  B(v, 'crA1', -3, 43, -7, -2, 53, -5, WH_L); B(v, 'crA1', 1, 43, -7, 2, 53, -5, WH_L);
  B(v, 'crA2', -3, 33, -8, -2, 43, -7, WH); B(v, 'crA2', 1, 35, -8, 2, 43, -7, WH_D);

  // Graceful flowing celadon & snow-white strategist half-cloak
  addCape(v, 8, CEL, CEL_D, CEL_L, WH_L, 24);

  // 青冥吴钩长剑 (Ornate Silver Cloud-Guarded Wu Jian Sword: crisp 3-tone forged jade-steel, zero bloom!)
  const wx = -10, wy = 18;
  B(v, 'weapon', wx, wy, -7, wx, wy + 1, -6, SIL_L);
  B(v, 'weapon', wx, wy, -5, wx, wy + 1, 3, BR_D);
  B(v, 'weapon', wx - 2, wy - 1, 4, wx + 2, wy + 2, 5, SIL_L);
  B(v, 'weapon', wx, wy, 4, wx, wy + 1, 5, JD);
  B(v, 'weapon', wx, wy + 1, 6, wx, wy + 1, 35, 0x5c727a);
  B(v, 'weapon', wx, wy, 6, wx, wy, 37, 0xf2fff8);
  B(v, 'weapon', wx, wy, 35, wx, wy + 1, 37, 0xf2fff8);
  return v;
}

export const GENERAL_DEFS = [
  def({ id: 'gen_zhaoyun', name: '赵云', group: '首领', role: '常山赵子龙', line: '', kind: 'biped', attack: 'swing', tip: 52, scale: 1.08, build: buildZhaoYun }),
  def({ id: 'gen_lubu', name: '吕布', group: '首领', role: '温侯', line: '', kind: 'biped', attack: 'swing', tip: 54, scale: 1.22, build: buildLuBu }),
  def({ id: 'gen_xiahoudun', name: '夏侯惇', group: '首领', role: '独眼猛将', line: '', kind: 'biped', attack: 'swing', tip: 38, scale: 1.14, build: buildXiahouDun }),
  def({ id: 'gen_luxun', name: '陆逊', group: '首领', role: '江东儒将', line: '', kind: 'biped', attack: 'swing', tip: 37, scale: 1.05, build: buildLuXun }),
];
