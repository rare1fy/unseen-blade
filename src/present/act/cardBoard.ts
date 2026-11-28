// act-36 (用户：「三选一的强化怎么还是以前那种low low的ui」): the pick cards as iron things in the UI layer, the same make as the
// title's plaques and the skill buttons — a framed board of merged blocks (an iron back, a metal frame with a lit upper lip, a lacquer
// panel, bronze rivets), a recessed socket on the left with a thick voxel badge floating over it (dicehero3d's models3d, like the
// buttons' pictures), and on the lacquer the name cut in the pixel font with its tier tag and two lines of description. The tier is the
// frame's metal, not a coloured sticker: 凡品 iron, 珍品 bronze (corner brackets), 绝品 gold (corner brackets and a crest). Every block
// is axis-aligned (no stair-step diagonals).
import * as THREE from 'three';
import { mergeBoxes, IRON_D, IRON, LACQ, LACQ_L } from './title';
import { customIcon3D, type Model3D } from '../ui3d/models3d';
import { Mask, pillow, box } from '../ui3d/models3dArt';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import { bodyText, bodyW } from '../ui3d/bodyFont';
import { t } from './i18n';
import { makeCanvas } from '../../platform/index';
import { drawMiniIcon, drawCostChip, richLine } from './uiPlate';
import { buildHeroBladeMesh, type WeaponId } from './weapons';
import { SKIN } from './skin';
export { richLine };

export type CardStyle = 'boon' | 'manual' | 'forge' | 'medic' | 'meal' | 'mirror' | 'keepsake' | 'weapon' | 'shop' | 'workRow' | 'arcana' | 'lantern';
/** the board's height in units of its width */
export const CARD_H = 0.24;
interface Metal { d: number; m: number; l: number; glow: number }
const METAL: Metal[] = [
  { d: 0x1c1e24, m: 0x3c4049, l: 0x6c727e, glow: 0xb0c0d8 },   // iron
  { d: 0x553714, m: 0x96662c, l: 0xd29a4a, glow: 0xffb060 },   // bronze
  { d: 0x6e5014, m: 0xc0902a, l: 0xffd86a, glow: 0xffd060 },   // gold
];
const LOCKED_METAL: Metal = { d: 0x15171c, m: 0x2c303a, l: 0x484e5c, glow: 0x70788a };
/** the other kinds of card: bamboo-scroll for 刀谱 (distinct from forged iron 秘传), iron+ember for smith, jade for healer, obsidian-violet for 碑铭潜能 */
const STYLE_METAL: Record<Exclude<CardStyle, 'boon'>, Metal> = {
  manual: { d: 0x6a4b1f, m: 0xb88a42, l: 0xf4d68c, glow: 0xffe49a },
  meal: { d: 0x3a2814, m: 0x6e5030, l: 0xb08850, glow: 0xffd890 },
  forge: { d: 0x32241a, m: 0x7c542c, l: 0xd4964c, glow: 0xffa44a },
  medic: { d: 0x1e3a2c, m: 0x3e7a5a, l: 0x86c8a0, glow: 0x9af0c0 },
  mirror: { d: 0x2e2444, m: 0x685496, l: 0xc4b0f0, glow: 0xd8c4ff },
  keepsake: { d: 0x30261c, m: 0x785d36, l: 0xd8b060, glow: 0xffe28a },
  weapon: { d: 0x3a2518, m: 0x845830, l: 0xe6b45a, glow: 0xffd878 },
  shop: { d: 0x422a18, m: 0x865a34, l: 0xdca45c, glow: 0xffd27a },
  workRow: { d: 0x2e2218, m: 0x76502c, l: 0xd4964c, glow: 0xffae52 },
  arcana: { d: 0x1e3c2e, m: 0x468864, l: 0x98f2ba, glow: 0xa4ffd0 },
  lantern: { d: 0x4a2c14, m: 0xb67a2e, l: 0xffda78, glow: 0xffca60 },
};
const PANEL: Record<CardStyle, [number, number]> = {
  boon: [LACQ, LACQ_L], manual: [0x3b2d1a, 0x544024], meal: [0x2c2216, 0x3a2c1c],
  forge: [0x221d1b, 0x302724], medic: [0x15221c, 0x1f3128], mirror: [0x1b1628, 0x2a223e],
  keepsake: [0x18151f, 0x272234], weapon: [0x1b1412, 0x2a1f1c], shop: [0x362417, 0x4a3320],
  workRow: [0x201a18, 0x2e2521], arcana: [0x111f1a, 0x1c322a], lantern: [0x1b1410, 0x2c1f16],
};
const RIVET = 0xb07a3a, RIVET_D = 0x6a4622;
export const TIER_TXT = ['#d8d2c6', '#f0b870', '#ffe08a'];
const NAME_TXT = ['#efe6d2', '#ffd8a0', '#fff0c0'];

// the layout in board units (width 1, height CARD_H, front toward +z)
/** 11-18 (用户：「强化卡片也难以辨认都是干嘛的」): the skill cards are taller — the icon on the left, the name, the presses and the effect on
 *  the right (three rows); the hideout's lists keep the short board */
export const SKILL_H = 0.3;
/** act-118: vertical bamboo-scroll layout for 刀谱 (3 side-by-side upright scrolls vs 3 stacked horizontal iron 秘传 plaques!) */
export function scrollLayout(H: number) {
  const SOCK = Math.min(0.42, H * 0.28);
  const SY = H / 2 - 0.11 - SOCK / 2;
  const DIV = SY - SOCK / 2 - 0.03;
  const y0 = -H / 2 + 0.095, y1 = DIV - 0.015;
  return { H, SOCK, SX: 0, SY, DIV, shape: 'scroll' as const, vertical: true as const, FACE: { x0: -0.43, x1: 0.43, y0, y1, h: y1 - y0, cy: (y0 + y1) / 2 }, SOCKET: { x: 0, y: SY, size: SOCK } };
}
/** act-118: 2×2 carved stone stele layout for 复仇碑 · 碑铭潜能 (tall stepped Han stone crown + wide granite pedestal base!) */
export function steleLayout(H: number) {
  const SOCK = Math.min(0.24, H * 0.46), SX = -0.5 + 0.06 + SOCK / 2, DIV = SX + SOCK / 2 + 0.025;
  const y0 = -H / 2 + 0.078, y1 = H / 2 - 0.042;
  return { H, SOCK, SX, SY: (y0 + y1) / 2, DIV, shape: 'stele' as const, vertical: false as const, FACE: { x0: DIV + 0.018, x1: 0.5 - 0.048, y0, y1, h: y1 - y0, cy: (y0 + y1) / 2 }, SOCKET: { x: SX, y: (y0 + y1) / 2, size: SOCK } };
}
export function boardLayout(H: number) {
  const SOCK = Math.min(H - 0.072, 0.28), SX = -0.5 + FR + 0.018 + SOCK / 2, DIV = SX + SOCK / 2 + 0.02;
  return { H, SOCK, SX, SY: 0, DIV, shape: 'plaque' as const, vertical: false as const, FACE: { x0: DIV + 0.016, x1: 0.5 - FR - 0.014, y0: -(H - 2 * FR - 0.014) / 2, y1: (H - 2 * FR - 0.014) / 2, h: H - 2 * FR - 0.014, cy: 0 }, SOCKET: { x: SX, y: 0, size: SOCK } };
}
/** act-136: compact 4×2 Keepsake showcase tray layout — prominent top medallion socket + clean bottom nameplate & stars */
export function keepsakeLayout(H: number) {
  const SOCK = Math.min(0.56, H * 0.54);
  const SY = H / 2 - 0.055 - SOCK / 2;
  const DIV = SY - SOCK / 2 - 0.022;
  const y0 = -H / 2 + 0.036, y1 = DIV - 0.012;
  return { H, SOCK, SX: 0, SY, DIV, shape: 'keepsake' as const, vertical: true as const, FACE: { x0: -0.45, x1: 0.45, y0, y1, h: Math.max(0.18, y1 - y0), cy: (y0 + y1) / 2 }, SOCKET: { x: 0, y: SY, size: SOCK } };
}
/** act-149: upright lacquered blade-rack stand layout (文家刀廊) — large upper 3D blade showcase + clean bottom nameplate & 3 forge diamonds */
export function weaponLayout(H: number) {
  const SOCK = Math.min(0.76, H * 0.54);
  const SY = H / 2 - 0.08 - SOCK / 2;
  const DIV = SY - SOCK / 2 - 0.028;
  const y0 = -H / 2 + 0.072, y1 = DIV - 0.016;
  return { H, SOCK, SX: 0, SY, DIV, shape: 'weapon' as const, vertical: true as const, FACE: { x0: -0.44, x1: 0.44, y0, y1, h: Math.max(0.24, y1 - y0), cy: (y0 + y1) / 2 }, SOCKET: { x: 0, y: SY, size: SOCK } };
}
/** act-149: tall hanging wooden merchant tag layout (行商货摊) — crimson silk cord + bronze ring + upper 3D ware + big name/effect/coin bar */
export function shopLayout(H: number) {
  const SOCK = Math.min(0.54, H * 0.36);
  const SY = H / 2 - 0.145 - SOCK / 2;
  const DIV = SY - SOCK / 2 - 0.028;
  const y0 = -H / 2 + 0.048, y1 = DIV - 0.014;
  return { H, SOCK, SX: 0, SY, DIV, shape: 'shop' as const, vertical: true as const, FACE: { x0: -0.43, x1: 0.43, y0, y1, h: Math.max(0.32, y1 - y0), cy: (y0 + y1) / 2 }, SOCKET: { x: 0, y: SY, size: SOCK } };
}
/** act-149: compact left-column workbench row layout (锻坊 / 药棚) — small left icon socket + wide crisp 2-row title/pips/cost strip */
export function workRowLayout(H: number) {
  const fr = 0.022;
  const SOCK = Math.min(H - 0.06, 0.22), SX = -0.5 + fr + 0.02 + SOCK / 2, DIV = SX + SOCK / 2 + 0.018;
  return { H, SOCK, SX, SY: 0, DIV, shape: 'workRow' as const, vertical: false as const, FACE: { x0: DIV + 0.014, x1: 0.5 - fr - 0.014, y0: -(H - 2 * fr - 0.012) / 2, y1: (H - 2 * fr - 0.012) / 2, h: H - 2 * fr - 0.012, cy: 0 }, SOCKET: { x: SX, y: 0, size: SOCK } };
}
/** act-149: Hades 2-style 3×3 悟性冥想牌 (Arcana card) — full-card face for top-left Grasp badge + bottom name, center 3D emblem floating over jade recess */
export function arcanaLayout(H: number) {
  const SOCK = Math.min(0.46, H * 0.40);
  const SY = H * 0.09;
  const DIV = SY - SOCK / 2 - 0.02;
  return { H, SOCK, SX: 0, SY, DIV, shape: 'arcana' as const, vertical: true as const, FACE: { x0: -0.45, x1: 0.45, y0: -H / 2 + 0.04, y1: H / 2 - 0.04, h: H - 0.08, cy: 0 }, SOCKET: { x: 0, y: SY, size: SOCK } };
}
/** act-185: Hanging Han-style paper-lantern showcase plaque (古窑长明灯) — bronze roof eaves + big 3D display bay + minimal bottom nameplate */
export function lanternLayout(H: number) {
  const SOCK = Math.min(0.68, H * 0.50);
  const SY = H / 2 - 0.14 - SOCK / 2;
  const DIV = SY - SOCK / 2 - 0.026;
  const y0 = -H / 2 + 0.075, y1 = DIV - 0.014;
  return { H, SOCK, SX: 0, SY, DIV, shape: 'lantern' as const, vertical: true as const, FACE: { x0: -0.42, x1: 0.42, y0, y1, h: Math.max(0.22, y1 - y0), cy: (y0 + y1) / 2 }, SOCKET: { x: 0, y: SY, size: SOCK } };
}
const FR = 0.024;
const H = CARD_H, SOCK = H - 0.072, SX = -0.5 + FR + 0.018 + SOCK / 2, DIV = SX + SOCK / 2 + 0.02;
/** the face (text) area on the lacquer: left edge, right edge, height */
export const FACE = { x0: DIV + 0.016, x1: 0.5 - FR - 0.012, h: H - 2 * FR - 0.014 };

/** act-118 / act-128: 3D voxel vertical bamboo scroll (刀谱) — animated top & bottom sandalwood rollers with bronze caps, real vertical bamboo slats, crimson silk cords */
export function scrollBoard(Hh: number) {
  const M = STYLE_METAL.manual, lay = scrollLayout(Hh), H = lay.H, SOCK = lay.SOCK, SY = lay.SY, DIV = lay.DIV;
  const p: Parameters<typeof mergeBoxes>[0] = [], b: Parameters<typeof mergeBoxes>[0] = [], rBoxes: Parameters<typeof mergeBoxes>[0] = [];
  // backing spine + 9 individual 3D vertical bamboo slats across the full width
  p.push({ w: 0.96, h: H - 0.08, d: 0.04, x: 0, y: 0, z: -0.004, c: 0x3a2a14 });
  const slats = 9, sw = 0.94 / slats;
  const slatCols = [0xd4b97c, 0xc7aa6c, 0xdcc388];
  for (let i = 0; i < slats; i++) {
    const sx = -0.47 + (i + 0.5) * sw;
    p.push({ w: sw - 0.012, h: H - 0.10, d: 0.052, x: sx, y: 0, z: 0.002, c: slatCols[i % 3] });
  }
  // dark ink-lacquered reading parchment cleanly inset over the lower slats for crisp legibility
  p.push({ w: 0.88, h: lay.FACE.h + 0.025, d: 0.058, x: 0, y: lay.FACE.cy, z: 0.005, c: 0x241a10 });
  // crimson silk binding cords across top & bottom
  for (const cy of [H / 2 - 0.088, DIV + 0.008, -H / 2 + 0.082]) {
    b.push({ w: 0.96, h: 0.016, d: 0.068, x: 0, y: cy, z: 0.006, c: 0xb63228 });
  }
  // protruding heavy sandalwood scroll roller + turned bronze endcaps (built around local y = 0 so each roller spins cleanly while unfurling!)
  rBoxes.push({ w: 1.06, h: 0.066, d: 0.088, x: 0, y: 0, z: 0.01, c: 0x56391c });
  rBoxes.push({ w: 1.04, h: 0.018, d: 0.092, x: 0, y: 0.022, z: 0.01, c: 0x8a5e32 });
  for (const sx of [-1, 1]) {
    rBoxes.push({ w: 0.058, h: 0.082, d: 0.098, x: sx * 0.545, y: 0, z: 0.01, c: M.m });
    rBoxes.push({ w: 0.024, h: 0.09, d: 0.104, x: sx * 0.576, y: 0, z: 0.01, c: M.l });
  }
  // top-center square medallion socket framing the 3D skill icon
  const r = 0.016, sd = 0.072;
  b.push({ w: SOCK + 2 * r, h: r, d: sd, x: 0, y: SY + SOCK / 2 + r / 2, z: 0.008, c: M.l }, { w: SOCK + 2 * r, h: r, d: sd, x: 0, y: SY - SOCK / 2 - r / 2, z: 0.008, c: M.d });
  b.push({ w: r, h: SOCK, d: sd, x: -SOCK / 2 - r / 2, y: SY, z: 0.008, c: M.m }, { w: r, h: SOCK, d: sd, x: SOCK / 2 + r / 2, y: SY, z: 0.008, c: M.d });
  p.push({ w: SOCK, h: SOCK, d: 0.03, x: 0, y: SY, z: 0.022, c: 0x16110c });

  const frameMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: M.glow, emissiveIntensity: 0 });
  const panelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), frameMat);
  const body = new THREE.Group();
  const bodyFrame = new THREE.Mesh(mergeBoxes(b), frameMat); bodyFrame.renderOrder = 30; body.add(bodyFrame);
  const panel = new THREE.Mesh(mergeBoxes(p), panelMat); panel.renderOrder = 30; body.add(panel);
  mesh.add(body);
  const halfH = H / 2 - 0.032;
  const topRoller = new THREE.Mesh(mergeBoxes(rBoxes), frameMat); topRoller.position.y = halfH; topRoller.renderOrder = 31;
  const botRoller = new THREE.Mesh(mergeBoxes(rBoxes), frameMat); botRoller.position.y = -halfH; botRoller.renderOrder = 31;
  mesh.add(topRoller, botRoller);
  mesh.userData.scrollAnim = { body, topRoller, botRoller, halfH };
  return { mesh, metal: M };
}

/** act-118 / act-149: 3D voxel carved stone stele (复仇碑 · 碑铭潜能) — 3-tier Han stone arch crown, distinct Yang (warm golden sandstone) vs Yin (obsidian violet) granite */
export function steleBoard(Hh: number, accentHex?: number, yin = false) {
  const lay = steleLayout(Hh), H = lay.H, SOCK = lay.SOCK, SX = lay.SX, SY = lay.SY, DIV = lay.DIV;
  const ST_D = yin ? 0x262038 : 0x423628;
  const ST_M = yin ? 0x4a3e6c : 0x725e44;
  const ST_L = yin ? 0x7e6cb0 : 0xa88c64;
  const ST_FACE = yin ? 0x161224 : 0x201a12;
  const jewel = accentHex ?? (yin ? 0xc29eff : 0xffd268);
  const M: Metal = { d: ST_D, m: ST_M, l: ST_L, glow: jewel };
  const p: Parameters<typeof mergeBoxes>[0] = [], b: Parameters<typeof mergeBoxes>[0] = [];
  // carved sandstone (Yang) or obsidian-violet (Yin) slab + recessed dark chiseled inscription face
  p.push({ w: 0.96, h: H - 0.04, d: 0.068, x: 0, y: 0.01, z: 0, c: ST_D });
  p.push({ w: 0.88, h: H - 0.11, d: 0.072, x: 0, y: SY, z: 0.004, c: ST_FACE });
  // chiseled stone pillar columns on left & right edges + top lintel
  for (const sx of [-1, 1]) {
    b.push({ w: 0.046, h: H - 0.03, d: 0.082, x: sx * 0.468, y: 0.01, z: 0.006, c: sx < 0 ? ST_M : ST_D });
    b.push({ w: 0.014, h: H - 0.05, d: 0.086, x: sx * 0.486, y: 0.01, z: 0.007, c: ST_L });
  }
  b.push({ w: 0.98, h: 0.036, d: 0.086, x: 0, y: H / 2 - 0.012, z: 0.008, c: ST_M });
  b.push({ w: 0.96, h: 0.012, d: 0.09, x: 0, y: H / 2 + 0.004, z: 0.009, c: ST_L });
  // iconic 3-tier Han stone stele arch crown (碑额) rising tall above the slab + glowing Yang/Yin jewel
  b.push({ w: 0.66, h: 0.034, d: 0.084, x: 0, y: H / 2 + 0.022, z: 0.006, c: ST_M });
  b.push({ w: 0.44, h: 0.030, d: 0.088, x: 0, y: H / 2 + 0.052, z: 0.007, c: ST_L });
  b.push({ w: 0.22, h: 0.024, d: 0.092, x: 0, y: H / 2 + 0.078, z: 0.008, c: ST_M });
  b.push({ w: 0.08, h: 0.046, d: 0.10, x: 0, y: H / 2 + 0.042, z: 0.012, c: jewel });
  // wide stepped granite pedestal base (碑座) anchoring the stele firmly at the bottom
  b.push({ w: 1.02, h: 0.038, d: 0.096, x: 0, y: -H / 2 + 0.032, z: 0.01, c: ST_M });
  b.push({ w: 1.08, h: 0.034, d: 0.108, x: 0, y: -H / 2 - 0.002, z: 0.012, c: ST_D });
  b.push({ w: 1.02, h: 0.010, d: 0.10, x: 0, y: -H / 2 + 0.049, z: 0.011, c: ST_L });
  // carved stone socket on left with Yang/Yin accent bar
  const r = 0.014, sd = 0.08;
  b.push({ w: SOCK + 2 * r, h: r, d: sd, x: SX, y: SY + SOCK / 2 + r / 2, z: 0.008, c: ST_L }, { w: SOCK + 2 * r, h: r, d: sd, x: SX, y: SY - SOCK / 2 - r / 2, z: 0.008, c: ST_D });
  b.push({ w: r, h: SOCK, d: sd, x: SX - SOCK / 2 - r / 2, y: SY, z: 0.008, c: ST_M }, { w: r, h: SOCK, d: sd, x: SX + SOCK / 2 + r / 2, y: SY, z: 0.008, c: ST_D });
  p.push({ w: SOCK, h: SOCK, d: 0.03, x: SX, y: SY, z: 0.018, c: yin ? 0x0e0b1a : 0x16110b });
  b.push({ w: 0.016, h: H * 0.64, d: 0.084, x: DIV, y: SY, z: 0.01, c: jewel });
  const mesh = new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: jewel, emissiveIntensity: 0 }));
  const panel = new THREE.Mesh(mergeBoxes(p), new THREE.MeshLambertMaterial({ vertexColors: true })); panel.renderOrder = 30; mesh.add(panel);
  return { mesh, metal: M };
}

/** act-149: 3D voxel upright lacquered blade-rack stand (文家刀廊) — dark walnut/iron legs, bronze crossbar, recessed blade niche, crimson seal bar */
export function weaponBoard(Hh: number, tier: number, locked = false, accentHex?: number) {
  const lay = weaponLayout(Hh), H = lay.H, SOCK = lay.SOCK, SY = lay.SY, DIV = lay.DIV;
  const M = locked ? LOCKED_METAL : tier >= 2 ? METAL[2] : STYLE_METAL.weapon;
  const woodD = locked ? 0x1c1e24 : 0x382216;
  const woodM = locked ? 0x2b2f38 : 0x563524;
  const woodL = locked ? 0x424754 : 0x7c4e32;
  const p: Parameters<typeof mergeBoxes>[0] = [], b: Parameters<typeof mergeBoxes>[0] = [];
  // dark lacquer upright display slab
  p.push({ w: 0.94, h: H - 0.08, d: 0.056, x: 0, y: 0.02, z: 0, c: locked ? 0x14151b : 0x1b1412 });
  // deep recessed upper blade showcase niche
  p.push({ w: 0.84, h: SOCK + 0.02, d: 0.042, x: 0, y: SY, z: 0.014, c: locked ? 0x0b0c10 : 0x100c0b });
  // lacquered wooden side pillars with bronze caps
  for (const sx of [-1, 1]) {
    b.push({ w: 0.048, h: H - 0.02, d: 0.078, x: sx * 0.47, y: 0.0, z: 0.008, c: sx < 0 ? woodM : woodD });
    b.push({ w: 0.016, h: H - 0.04, d: 0.082, x: sx * 0.486, y: 0.0, z: 0.009, c: woodL });
    // notched rack feet at bottom
    b.push({ w: 0.11, h: 0.052, d: 0.104, x: sx * 0.39, y: -H / 2 + 0.014, z: 0.012, c: woodD });
    b.push({ w: 0.08, h: 0.016, d: 0.108, x: sx * 0.39, y: -H / 2 + 0.044, z: 0.014, c: M.m });
  }
  // top lintel beam with bronze crest bar (extra protruding gilded finials when equipped)
  b.push({ w: 1.04, h: 0.052, d: 0.088, x: 0, y: H / 2 - 0.018, z: 0.01, c: woodM });
  b.push({ w: 1.02, h: 0.016, d: 0.092, x: 0, y: H / 2 + 0.012, z: 0.011, c: M.l });
  if (!locked && tier >= 2) {
    b.push({ w: 0.28, h: 0.028, d: 0.094, x: 0, y: H / 2 + 0.028, z: 0.012, c: M.l });
    b.push({ w: 0.05, h: 0.028, d: 0.10, x: 0, y: H / 2 + 0.028, z: 0.015, c: 0xc23228 });
  }
  // bottom cross-rail
  b.push({ w: 0.96, h: 0.036, d: 0.086, x: 0, y: -H / 2 + 0.044, z: 0.01, c: M.d });
  // blade accent divider bar
  b.push({ w: 0.86, h: 0.018, d: 0.078, x: 0, y: DIV, z: 0.01, c: locked ? 0x363a44 : (accentHex ?? M.l) });
  // corner bronze rivets
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    b.push({ w: 0.024, h: 0.024, d: 0.026, x: sx * 0.445, y: sy * (H / 2 - 0.05), z: 0.048, c: locked ? 0x4a4e5a : (tier >= 2 ? M.l : RIVET) });
  }
  const mesh = new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: M.glow, emissiveIntensity: 0 }));
  const panel = new THREE.Mesh(mergeBoxes(p), new THREE.MeshLambertMaterial({ vertexColors: true })); panel.renderOrder = 30; mesh.add(panel);
  return { mesh, metal: M };
}

/** act-149: 3D voxel hanging wooden merchant tag (行商货摊) — crimson silk cord + bronze eyelet + weathered cedar plaque + recessed gold coin tray */
export function shopBoard(Hh: number, locked = false, accentHex?: number) {
  const lay = shopLayout(Hh), H = lay.H, SOCK = lay.SOCK, SY = lay.SY, DIV = lay.DIV;
  const M = locked ? LOCKED_METAL : STYLE_METAL.shop;
  const cedarD = locked ? 0x222024 : 0x3c2717;
  const cedarM = locked ? 0x2e2c32 : 0x5a3b22;
  const cedarL = locked ? 0x44424a : 0x7c5432;
  const p: Parameters<typeof mergeBoxes>[0] = [], b: Parameters<typeof mergeBoxes>[0] = [];
  // main cedar wood tag body with warm vertical wood grain planks
  p.push({ w: 0.94, h: H - 0.08, d: 0.054, x: 0, y: -0.02, z: 0, c: cedarD });
  for (let i = 0; i < 5; i++) {
    const px = -0.36 + i * 0.18;
    p.push({ w: 0.168, h: H - 0.12, d: 0.06, x: px, y: -0.02, z: 0.002, c: i % 2 === 0 ? cedarM : cedarD });
  }
  // dark-ink recessed lower reading board for crisp text contrast
  p.push({ w: 0.86, h: lay.FACE.h + 0.02, d: 0.066, x: 0, y: lay.FACE.cy, z: 0.006, c: locked ? 0x131318 : 0x1c140e });
  // recessed top ware showcase socket
  const r = 0.016, sd = 0.074;
  b.push({ w: SOCK + 2 * r, h: r, d: sd, x: 0, y: SY + SOCK / 2 + r / 2, z: 0.008, c: M.l }, { w: SOCK + 2 * r, h: r, d: sd, x: 0, y: SY - SOCK / 2 - r / 2, z: 0.008, c: M.d });
  b.push({ w: r, h: SOCK, d: sd, x: -SOCK / 2 - r / 2, y: SY, z: 0.008, c: M.m }, { w: r, h: SOCK, d: sd, x: SOCK / 2 + r / 2, y: SY, z: 0.008, c: M.d });
  p.push({ w: SOCK, h: SOCK, d: 0.03, x: 0, y: SY, z: 0.02, c: 0x120d0a });
  // notched merchant hanger crown + bronze eyelet ring + crimson silk cord stub!
  b.push({ w: 0.98, h: 0.036, d: 0.072, x: 0, y: H / 2 - 0.068, z: 0.006, c: cedarL });
  b.push({ w: 0.42, h: 0.056, d: 0.074, x: 0, y: H / 2 - 0.024, z: 0.007, c: cedarM });
  b.push({ w: 0.12, h: 0.044, d: 0.088, x: 0, y: H / 2 - 0.024, z: 0.01, c: M.l });
  p.push({ w: 0.052, h: 0.026, d: 0.092, x: 0, y: H / 2 - 0.024, z: 0.012, c: 0x120c08 });
  // crimson hanging silk cord + tassel knot above eyelet
  b.push({ w: 0.032, h: 0.10, d: 0.044, x: 0, y: H / 2 + 0.042, z: 0.008, c: locked ? 0x5c3636 : 0xb82e24 });
  b.push({ w: 0.064, h: 0.026, d: 0.056, x: 0, y: H / 2 + 0.006, z: 0.012, c: locked ? 0x6c4242 : 0xd63e30 });
  // wooden side trim + bottom weighted bronze ferrule
  for (const sx of [-1, 1]) {
    b.push({ w: 0.034, h: H - 0.08, d: 0.072, x: sx * 0.472, y: -0.02, z: 0.006, c: sx < 0 ? cedarL : cedarD });
  }
  b.push({ w: 0.98, h: 0.034, d: 0.076, x: 0, y: -H / 2 + 0.016, z: 0.008, c: M.m });
  b.push({ w: 0.86, h: 0.014, d: 0.074, x: 0, y: DIV, z: 0.009, c: locked ? 0x3c3a42 : (accentHex ?? M.l) });
  const mesh = new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: M.glow, emissiveIntensity: 0 }));
  const panel = new THREE.Mesh(mergeBoxes(p), new THREE.MeshLambertMaterial({ vertexColors: true })); panel.renderOrder = 30; mesh.add(panel);
  return { mesh, metal: M };
}

/** act-149: 3D voxel compact left-column workbench strip (锻坊 / 药棚) — slim iron/jade list bar */
export function workRowBoard(Hh: number, theme: 'forge' | 'medic', tier: number, locked = false) {
  const lay = workRowLayout(Hh), H = lay.H, SOCK = lay.SOCK, SX = lay.SX, DIV = lay.DIV;
  const fr = 0.022;
  const M = locked ? LOCKED_METAL : tier >= 2 ? METAL[2] : STYLE_METAL[theme];
  const [pc, pl] = locked ? [0x15141a, 0x201e28] : PANEL[theme];
  const p: Parameters<typeof mergeBoxes>[0] = [], b: Parameters<typeof mergeBoxes>[0] = [];
  p.push({ w: 1, h: H, d: 0.044, x: 0, y: 0, z: 0, c: IRON_D });
  p.push({ w: 1 - 2 * fr, h: H - 2 * fr, d: 0.05, x: 0, y: 0, z: 0.002, c: pc });
  p.push({ w: 1 - 2 * fr, h: 0.01, d: 0.052, x: 0, y: H / 2 - fr - 0.005, z: 0.003, c: pl });
  b.push({ w: 1, h: fr, d: 0.058, x: 0, y: H / 2 - fr / 2, z: 0.004, c: M.m });
  b.push({ w: 0.99, h: 0.007, d: 0.06, x: 0, y: H / 2 - 0.0035, z: 0.005, c: M.l });
  b.push({ w: 1, h: fr, d: 0.058, x: 0, y: -H / 2 + fr / 2, z: 0.004, c: M.d });
  for (const s of [-1, 1]) b.push({ w: fr, h: H, d: 0.06, x: s * (0.5 - fr / 2), y: 0, z: 0.004, c: s < 0 ? M.m : M.d });
  // left recessed icon socket
  const r = 0.012, sd = 0.064;
  b.push({ w: SOCK + 2 * r, h: r, d: sd, x: SX, y: SOCK / 2 + r / 2, z: 0.006, c: M.l }, { w: SOCK + 2 * r, h: r, d: sd, x: SX, y: -SOCK / 2 - r / 2, z: 0.006, c: M.d });
  b.push({ w: r, h: SOCK, d: sd, x: SX - SOCK / 2 - r / 2, y: 0, z: 0.006, c: M.m }, { w: r, h: SOCK, d: sd, x: SX + SOCK / 2 + r / 2, y: 0, z: 0.006, c: M.d });
  p.push({ w: SOCK, h: SOCK, d: 0.026, x: SX, y: 0, z: 0.014, c: 0x0d0b0e });
  b.push({ w: 0.01, h: H - 2 * fr, d: 0.056, x: DIV, y: 0, z: 0.004, c: M.d });
  const mesh = new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: M.glow, emissiveIntensity: 0 }));
  const panel = new THREE.Mesh(mergeBoxes(p), new THREE.MeshLambertMaterial({ vertexColors: true })); panel.renderOrder = 30; mesh.add(panel);
  return { mesh, metal: M };
}

/** act-149: wrap a real 3.5cm fine-voxel Wen-family blade (`buildHeroBladeMesh`) with handle + ring-pommel as a diagonal gallery Model3D */
export function weaponUiModel(id: WeaponId, locked = false): Model3D {
  const root = new THREE.Group() as Model3D;
  const pivot = new THREE.Group();
  const blade = buildHeroBladeMesh(id);
  // Add crisp dark-wrapped handle + bronze ring-pommel behind the guard (z < -1) so the standalone display blade reads as a full sword
  const hiltMat = new THREE.MeshLambertMaterial({ color: locked ? 0x262830 : 0x3b2618 });
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.068, 0.20), hiltMat);
  grip.position.set(-0.02, -0.04, -0.13);
  const pommelMat = new THREE.MeshLambertMaterial({ color: locked ? 0x3c404c : 0xd4a048 });
  const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.095, 0.085), pommelMat);
  pommel.position.set(-0.02, -0.04, -0.255);
  blade.add(grip, pommel);
  const mats: THREE.MeshLambertMaterial[] = [];
  const origColors: number[] = [];
  blade.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshLambertMaterial;
    const mat = src.clone();
    if (locked) {
      mat.color.setHex(0x3a3e48);
      mat.emissive.setHex(0x161820);
      mat.emissiveIntensity = 0.25;
    }
    m.material = mat;
    mats.push(mat);
    origColors.push(mat.color.getHex());
  });
  hiltMat.dispose(); pommelMat.dispose();
  // Orient blade along +X so its broad flat side faces +Z (the camera) cleanly
  const holder = new THREE.Group();
  const bb = new THREE.Box3().setFromObject(blade);
  const center = new THREE.Vector3(), sz = new THREE.Vector3();
  bb.getCenter(center);
  bb.getSize(sz);
  const maxDim = Math.max(0.01, sz.x, sz.y, sz.z);
  const norm = 1.24 / maxDim;
  blade.position.set(-center.x * norm, -center.y * norm, -center.z * norm);
  blade.scale.setScalar(norm);
  holder.add(blade);
  holder.rotation.y = Math.PI / 2;
  // Heroic 40° museum-stand diagonal tilt (bottom-left hilt → top-right tip)
  pivot.add(holder);
  pivot.rotation.set(0.14, 0, Math.PI * 0.22);
  root.add(pivot);
  root.size = [sz.z * norm, sz.y * norm, sz.x * norm];
  root.setGlow = (k: number) => {
    for (const mat of mats) {
      if (locked) { mat.emissive.setHex(0x282c38); mat.emissiveIntensity = Math.max(0, (k - 0.6) * 0.35); }
      else { mat.emissive.setHex(0xffe0a0); mat.emissiveIntensity = Math.max(0, (k - 1) * 0.42); }
    }
    return root;
  };
  root.setDim = (k: number) => {
    const f = Math.max(0.28, 1 - k * 0.65);
    mats.forEach((mat, i) => mat.color.setHex(origColors[i]).multiplyScalar(f));
    return root;
  };
  root.setOpacity = (a: number) => {
    for (const mat of mats) { mat.transparent = a < 0.999; mat.opacity = a; mat.depthWrite = a >= 0.999; }
    return root;
  };
  root.idle = (t: number, bob = 0.025, sway = 0.35) => {
    pivot.position.y = Math.sin(t * 2.1) * bob;
    // Gentle museum showcase sway keeping the broad gleaming blade side always facing the viewer
    pivot.rotation.y = Math.sin(t * (1.2 + sway * 0.5)) * 0.42;
  };
  root.dispose = () => {
    root.parent?.remove(root);
    grip.geometry.dispose();
    pommel.geometry.dispose();
    for (const mat of mats) mat.dispose();
  };
  return root;
}

/** act-136: 3D voxel keepsake showcase tray (4×2 grid) — gold frame when equipped, bronze when unlocked, muted dark iron when locked */
export function keepsakeBoard(Hh: number, tier: number, locked = false, accentHex?: number) {
  const lay = keepsakeLayout(Hh), H = lay.H, SOCK = lay.SOCK, SY = lay.SY, DIV = lay.DIV;
  const M = locked ? LOCKED_METAL : tier >= 2 ? METAL[2] : STYLE_METAL.keepsake;
  const [pc, pl] = locked ? [0x141319, 0x1e1d26] : PANEL.keepsake;
  const fr = 0.03;
  const p: Parameters<typeof mergeBoxes>[0] = [], b: Parameters<typeof mergeBoxes>[0] = [];
  p.push({ w: 1, h: H, d: 0.052, x: 0, y: 0, z: 0, c: IRON_D });
  p.push({ w: 1 - 2 * fr, h: H - 2 * fr, d: 0.058, x: 0, y: 0, z: 0.002, c: pc });
  p.push({ w: 1 - 2 * fr, h: 0.016, d: 0.06, x: 0, y: H / 2 - fr - 0.008, z: 0.003, c: pl });
  // frame rails
  b.push({ w: 1, h: fr, d: 0.068, x: 0, y: H / 2 - fr / 2, z: 0.004, c: M.m });
  b.push({ w: 0.99, h: 0.01, d: 0.072, x: 0, y: H / 2 - 0.005, z: 0.005, c: M.l });
  b.push({ w: 1, h: fr, d: 0.068, x: 0, y: -H / 2 + fr / 2, z: 0.004, c: M.d });
  for (const s of [-1, 1]) b.push({ w: fr, h: H, d: 0.07, x: s * (0.5 - fr / 2), y: 0, z: 0.004, c: s < 0 ? M.m : M.d });
  // recessed top icon socket
  const r = 0.018, sd = 0.074;
  b.push({ w: SOCK + 2 * r, h: r, d: sd, x: 0, y: SY + SOCK / 2 + r / 2, z: 0.006, c: M.l }, { w: SOCK + 2 * r, h: r, d: sd, x: 0, y: SY - SOCK / 2 - r / 2, z: 0.006, c: M.d });
  b.push({ w: r, h: SOCK, d: sd, x: -SOCK / 2 - r / 2, y: SY, z: 0.006, c: M.m }, { w: r, h: SOCK, d: sd, x: SOCK / 2 + r / 2, y: SY, z: 0.006, c: M.d });
  p.push({ w: SOCK, h: SOCK, d: 0.03, x: 0, y: SY, z: 0.018, c: locked ? 0x0c0b10 : 0x110e17 });
  // divider strip tinted with keepsake color when unlocked
  b.push({ w: 0.88, h: 0.014, d: 0.068, x: 0, y: DIV, z: 0.006, c: locked ? 0x2c2e38 : (accentHex ?? M.l) });
  // corner rivets (plus gold brackets when equipped)
  const rv = 0.022, rz = 0.042;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    b.push({ w: rv, h: rv, d: 0.022, x: sx * (0.5 - fr / 2), y: sy * (H / 2 - fr / 2), z: rz, c: locked ? 0x464a56 : (tier >= 2 ? M.l : RIVET) });
    if (!locked && tier >= 2) {
      const cx = sx * (0.5 - 0.004), cy = sy * (H / 2 - 0.004), L = 0.11, T = 0.018;
      b.push({ w: L, h: T, d: 0.078, x: cx - sx * L / 2, y: cy, z: 0.006, c: M.l }, { w: T, h: L, d: 0.078, x: cx, y: cy - sy * L / 2, z: 0.006, c: M.l });
    }
  }
  const mesh = new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: M.glow, emissiveIntensity: 0 }));
  const panel = new THREE.Mesh(mergeBoxes(p), new THREE.MeshLambertMaterial({ vertexColors: true })); panel.renderOrder = 30; mesh.add(panel);
  return { mesh, metal: M };
}

/** act-149 / act-176: 3D voxel Hades-2-style jade meditation talisman card (孙婆婆 · 悟性牌阵) — clear 3-tier contrast:
 *  Active = warm gold frame + glowing emerald face; Unlocked-Off = cool dark slate-iron (zero green collision!); Locked = deep charcoal stone. */
export function arcanaBoard(Hh: number, active: boolean, unlocked: boolean, awakening = false, accentHex?: number) {
  const lay = arcanaLayout(Hh), H = lay.H;
  const M: Metal = !unlocked
    ? LOCKED_METAL
    : active
      ? (awakening ? { d: 0x7a5414, m: 0xd8a432, l: 0xffea88, glow: 0xffe470 } : { d: 0x5c4218, m: 0xc29238, l: 0xffe280, glow: 0xffe078 })
      : { d: 0x202630, m: 0x3c4856, l: 0x627284, glow: 0x90a4b8 };
  const pc = !unlocked ? 0x111218 : active ? (awakening ? 0x2c200e : 0x133828) : 0x141820;
  const pl = !unlocked ? 0x1c1e26 : active ? (awakening ? 0x463418 : 0x245c42) : 0x222934;
  const fr = 0.036;
  const p: Parameters<typeof mergeBoxes>[0] = [], b: Parameters<typeof mergeBoxes>[0] = [];
  p.push({ w: 1, h: H, d: 0.05, x: 0, y: 0, z: 0, c: IRON_D });
  p.push({ w: 1 - 2 * fr, h: H - 2 * fr, d: 0.056, x: 0, y: 0, z: 0.002, c: pc });
  p.push({ w: 1 - 2 * fr, h: 0.018, d: 0.058, x: 0, y: H / 2 - fr - 0.009, z: 0.003, c: pl });
  // outer frame rails (warm gold when Active, cool slate when Inactive, dark iron when Locked)
  b.push({ w: 1, h: fr, d: 0.068, x: 0, y: H / 2 - fr / 2, z: 0.004, c: M.m });
  b.push({ w: 0.99, h: 0.011, d: 0.072, x: 0, y: H / 2 - 0.0055, z: 0.005, c: M.l });
  b.push({ w: 1, h: fr, d: 0.068, x: 0, y: -H / 2 + fr / 2, z: 0.004, c: M.d });
  for (const s of [-1, 1]) b.push({ w: fr, h: H, d: 0.07, x: s * (0.5 - fr / 2), y: 0, z: 0.004, c: s < 0 ? M.m : M.d });
  // Active seal: warm gold corner studs + glowing top-center jade/gold jewel (leaving corners free for universal white Focus cursor!)
  if (active) {
    b.push({ w: 0.30, h: 0.026, d: 0.082, x: 0, y: H / 2 + 0.012, z: 0.008, c: M.l });
    b.push({ w: 0.085, h: 0.042, d: 0.094, x: 0, y: H / 2 + 0.018, z: 0.014, c: awakening ? 0xfff088 : (accentHex ?? 0x70f8b4) });
    // inner bright emerald-gold lit trim bar along bottom edge
    b.push({ w: 0.72, h: 0.016, d: 0.076, x: 0, y: -H / 2 + fr + 0.008, z: 0.008, c: awakening ? 0xffe478 : 0x72f4b0 });
  } else if (awakening) {
    b.push({ w: 0.20, h: 0.02, d: 0.078, x: 0, y: H / 2 + 0.01, z: 0.007, c: 0x6c5e3a });
  }
  const mesh = new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: M.glow, emissiveIntensity: active ? 0.16 : 0 }));
  const panel = new THREE.Mesh(mergeBoxes(p), new THREE.MeshLambertMaterial({ vertexColors: true })); panel.renderOrder = 30; mesh.add(panel);
  return { mesh, metal: M };
}

/** act-185: 3D voxel Han hanging lantern showcase card (古窑长明灯) — tiered bronze roof eaves, hanging loop, warm candle bay, crimson bottom tassel. */
export function lanternBoard(Hh: number, active: boolean, unlocked: boolean, accentHex?: number) {
  const lay = lanternLayout(Hh), H = lay.H, SOCK = lay.SOCK, SY = lay.SY, DIV = lay.DIV;
  const M: Metal = !unlocked
    ? LOCKED_METAL
    : active
      ? { d: 0x744614, m: 0xd89834, l: 0xffe88c, glow: 0xffd868 }
      : { d: 0x3a2a1e, m: 0x7c5a38, l: 0xd2a462, glow: 0xffc668 };
  const pc = !unlocked ? 0x111015 : active ? 0x281a10 : 0x181416;
  const bayBg = !unlocked ? 0x0a090e : active ? 0x1d1208 : 0x100e14;
  const p: Parameters<typeof mergeBoxes>[0] = [], b: Parameters<typeof mergeBoxes>[0] = [];
  p.push({ w: 0.88, h: H - 0.14, d: 0.048, x: 0, y: -0.01, z: 0, c: pc });
  for (const sx of [-1, 1]) {
    b.push({ w: 0.032, h: H - 0.14, d: 0.068, x: sx * 0.44, y: -0.01, z: 0.005, c: sx < 0 ? M.m : M.d });
  }
  b.push({ w: 1.02, h: 0.038, d: 0.088, x: 0, y: H / 2 - 0.072, z: 0.008, c: M.m });
  b.push({ w: 1.00, h: 0.012, d: 0.092, x: 0, y: H / 2 - 0.052, z: 0.01, c: M.l });
  b.push({ w: 0.72, h: 0.036, d: 0.082, x: 0, y: H / 2 - 0.036, z: 0.007, c: M.d });
  b.push({ w: 0.22, h: 0.036, d: 0.072, x: 0, y: H / 2 - 0.004, z: 0.007, c: M.l });
  b.push({ w: 0.055, h: 0.055, d: 0.052, x: 0, y: H / 2 + 0.032, z: 0.006, c: M.m });
  b.push({ w: 0.96, h: 0.036, d: 0.084, x: 0, y: -H / 2 + 0.058, z: 0.008, c: M.d });
  b.push({ w: 0.66, h: 0.026, d: 0.076, x: 0, y: -H / 2 + 0.03, z: 0.006, c: M.m });
  b.push({ w: 0.044, h: 0.07, d: 0.044, x: 0, y: -H / 2 - 0.018, z: 0.008, c: !unlocked ? 0x463236 : active ? 0xe04234 : 0x982a24 });
  const r = 0.015, sd = 0.072;
  b.push({ w: SOCK + 2 * r, h: r, d: sd, x: 0, y: SY + SOCK / 2 + r / 2, z: 0.008, c: M.l }, { w: SOCK + 2 * r, h: r, d: sd, x: 0, y: SY - SOCK / 2 - r / 2, z: 0.008, c: M.d });
  b.push({ w: r, h: SOCK, d: sd, x: -SOCK / 2 - r / 2, y: SY, z: 0.008, c: M.m }, { w: r, h: SOCK, d: sd, x: SOCK / 2 + r / 2, y: SY, z: 0.008, c: M.d });
  p.push({ w: SOCK, h: SOCK, d: 0.028, x: 0, y: SY, z: 0.02, c: bayBg });
  b.push({ w: 0.78, h: 0.014, d: 0.072, x: 0, y: DIV, z: 0.008, c: !unlocked ? 0x2c2e38 : (accentHex ?? M.l) });
  const mesh = new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: M.glow, emissiveIntensity: active ? 0.14 : 0 }));
  const panel = new THREE.Mesh(mergeBoxes(p), new THREE.MeshLambertMaterial({ vertexColors: true })); panel.renderOrder = 30; mesh.add(panel);
  return { mesh, metal: M };
}

/** the board itself: one merged mesh (vertex colours), its emissive used for the focus glow; Hh = the board's height (CARD_H / SKILL_H) */
export function cardBoard(style: CardStyle, tier: number, Hh = CARD_H, skill = false, accentHex?: number, locked = false, extra?: { yin?: boolean; theme?: 'forge' | 'medic'; active?: boolean; awakening?: boolean; upgrade?: boolean }) {
  if (style === 'manual') return scrollBoard(Hh);
  if (style === 'mirror') return steleBoard(Hh, accentHex, !!extra?.yin);
  if (style === 'keepsake') return keepsakeBoard(Hh, tier, locked, accentHex);
  if (style === 'weapon') return weaponBoard(Hh, tier, locked, accentHex);
  if (style === 'shop') return shopBoard(Hh, locked, accentHex);
  if (style === 'workRow') return workRowBoard(Hh, extra?.theme ?? 'forge', tier, locked);
  if (style === 'arcana') return arcanaBoard(Hh, !!extra?.active, !locked, !!extra?.awakening, accentHex);
  if (style === 'lantern') return lanternBoard(Hh, !!extra?.active, !locked, accentHex);
  const skin = SKIN.id;
  const baseM = locked ? LOCKED_METAL : (style === 'boon' ? METAL[Math.max(0, Math.min(2, tier))] : tier >= 2 ? METAL[2] : STYLE_METAL[style]);
  const M: Metal = locked ? LOCKED_METAL
    : skin === 'lacquer'
      ? (tier >= 2 ? { d: 0x5c1814, m: 0xd0982a, l: 0xffe27a, glow: 0xffd268 } : tier === 1 ? { d: 0x5a1a16, m: 0xb87e28, l: 0xf4cc68, glow: 0xffb858 } : { d: 0x481210, m: 0x9e7026, l: 0xe2b658, glow: 0xf0be5c })
      : skin === 'bamboo'
        ? (tier >= 2 ? { d: 0x5a3e1c, m: 0xc8a44c, l: 0xfbe296, glow: 0xffe490 } : tier === 1 ? { d: 0x563c20, m: 0xb49250, l: 0xebd088, glow: 0xf0cf78 } : { d: 0x4e361c, m: 0x9e8048, l: 0xd8bc78, glow: 0xdcc07a })
        : baseM;
  const [pc, pl] = locked
    ? [0x15141a, 0x201e28]
    : skin === 'lacquer'
      ? [0x1c0d10, 0x441618]
      : skin === 'bamboo'
        ? [0x342614, 0x543e22]
        : PANEL[style];
  const backCol = skin === 'lacquer' ? 0x12090b : skin === 'bamboo' ? 0x3a2814 : IRON_D;
  const rivetCol = skin === 'lacquer' ? 0xd2342a : skin === 'bamboo' ? 0xb42a22 : RIVET;
  const rivetDark = skin === 'lacquer' ? 0x7c1c16 : skin === 'bamboo' ? 0x6e1a14 : RIVET_D;
  const { H, SOCK, SX, DIV } = boardLayout(Hh);
  // (two meshes: the panel never glows — only the metal warms in focus; act-36 first try tinted the whole lacquer orange)
  const p: Parameters<typeof mergeBoxes>[0] = [], b: Parameters<typeof mergeBoxes>[0] = [];
  p.push({ w: 1, h: H, d: 0.05, x: 0, y: 0, z: 0, c: backCol });                                                // the back
  p.push({ w: 1 - 2 * FR, h: H - 2 * FR, d: 0.056, x: 0, y: 0, z: 0.002, c: pc });                            // the panel
  p.push({ w: 1 - 2 * FR, h: 0.012, d: 0.058, x: 0, y: H / 2 - FR - 0.006, z: 0.002, c: pl });                 // its lit top band
  if (skin === 'lacquer' && !locked) {
    p.push({ w: 1 - 2 * FR - 0.012, h: 0.006, d: 0.059, x: 0, y: -H / 2 + FR + 0.008, z: 0.003, c: 0x8e221c });
  } else if (skin === 'bamboo' && !locked) {
    for (let sx = -0.44; sx <= 0.44; sx += 0.11) {
      p.push({ w: 0.085, h: 0.01, d: 0.059, x: sx, y: -H / 2 + FR + 0.008, z: 0.003, c: 0x5c4424 });
    }
  }
  // the frame: top (with a lit lip) and bottom bars, the two ends
  b.push({ w: 1, h: FR, d: 0.064, x: 0, y: H / 2 - FR / 2, z: 0.004, c: M.m }, { w: 1 - 0.01, h: 0.007, d: 0.066, x: 0, y: H / 2 - 0.0035, z: 0.004, c: M.l });
  b.push({ w: 1, h: FR, d: 0.064, x: 0, y: -H / 2 + FR / 2, z: 0.004, c: M.d });
  for (const s of [-1, 1]) b.push({ w: FR, h: H, d: 0.066, x: s * (0.5 - FR / 2), y: 0, z: 0.004, c: s < 0 ? M.m : M.d });
  // The skill picture sits over a dark insert. Its front clears the lacquer but stays below the narrow iron walls.
  const r = skill ? 0.01 : 0.016, sd = 0.07, dark = skill ? backCol : M.d;
  b.push({ w: SOCK + 2 * r, h: r, d: sd, x: SX, y: SOCK / 2 + r / 2, z: 0.006, c: skill ? (skin === 'iron' ? IRON : M.m) : M.l }, { w: SOCK + 2 * r, h: r, d: sd, x: SX, y: -SOCK / 2 - r / 2, z: 0.006, c: dark });
  b.push({ w: r, h: SOCK, d: sd, x: SX - SOCK / 2 - r / 2, y: 0, z: 0.006, c: skill ? (skin === 'iron' ? 0x26282e : M.d) : M.m }, { w: r, h: SOCK, d: sd, x: SX + SOCK / 2 + r / 2, y: 0, z: 0.006, c: dark });
  p.push({ w: SOCK, h: SOCK, d: 0.03, x: SX, y: 0, z: skill ? 0.019 : -0.006, c: skill ? (skin === 'lacquer' ? 0x300e0e : 0x111217) : 0x0b090a });
  b.push({ w: 0.01, h: H - 2 * FR, d: 0.06, x: DIV, y: 0, z: 0.003, c: M.d });
  // act-118: 秘传 iron plaques wear stepped armor lugs + a glowing archetype-colored voxel inlay strip on the divider so they read as forged talisman armor
  if (style === 'boon') {
    for (const sx of [-1, 1]) {
      b.push({ w: 0.022, h: H * 0.42, d: 0.078, x: sx * 0.506, y: 0, z: 0.006, c: M.m });
      b.push({ w: 0.014, h: H * 0.24, d: 0.084, x: sx * 0.514, y: 0, z: 0.008, c: M.l });
    }
    if (accentHex != null) {
      b.push({ w: 0.014, h: H * 0.68, d: 0.076, x: DIV, y: 0, z: 0.008, c: accentHex });
      b.push({ w: 0.022, h: 0.022, d: 0.082, x: -0.506, y: 0, z: 0.01, c: accentHex });
    }
  }
  // rivets / corner seals: the four corners of the frame, then along the top and bottom bars
  const rv = 0.016, rz = 0.04;
  for (const [x, y] of [[-0.5 + FR / 2, H / 2 - FR / 2], [0.5 - FR / 2, H / 2 - FR / 2], [-0.5 + FR / 2, -H / 2 + FR / 2], [0.5 - FR / 2, -H / 2 + FR / 2]]) b.push({ w: rv, h: rv, d: 0.02, x, y, z: rz, c: rivetCol });
  for (let x = DIV + 0.1; x < 0.5 - 0.06; x += 0.13) for (const y of [H / 2 - FR / 2, -H / 2 + FR / 2]) b.push({ w: rv * 0.8, h: rv * 0.8, d: 0.018, x, y, z: rz, c: y > 0 ? rivetCol : rivetDark });
  // the tier: corner brackets from 珍品, a crest on top for 绝品
  if (style === 'boon' && tier >= 1) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const cx = sx * (0.5 - 0.004), cy = sy * (H / 2 - 0.004), L = 0.06, T = 0.012;
    b.push({ w: L, h: T, d: 0.072, x: cx - sx * L / 2, y: cy, z: 0.006, c: M.l }, { w: T, h: L * 0.7, d: 0.072, x: cx, y: cy - sy * L * 0.35, z: 0.006, c: M.l });
  }
  if (style === 'boon' && extra?.upgrade) {
    // Distinct jade-gold upward chevron crest on top of the plaque so stat-upgrade cards read immediately at a glance
    b.push({ w: 0.22, h: 0.016, d: 0.072, x: 0, y: H / 2 + 0.008, z: 0.006, c: 0x58c888 });
    b.push({ w: 0.14, h: 0.014, d: 0.076, x: 0, y: H / 2 + 0.022, z: 0.007, c: 0x86f6b8 });
    b.push({ w: 0.06, h: 0.014, d: 0.08, x: 0, y: H / 2 + 0.036, z: 0.008, c: 0xffe478 });
  }
  if (style === 'boon' && tier >= 2 && !extra?.upgrade) {
    b.push({ w: 0.16, h: 0.018, d: 0.06, x: 0.04, y: H / 2 + 0.009, z: 0.002, c: M.m }, { w: 0.1, h: 0.012, d: 0.062, x: 0.04, y: H / 2 + 0.024, z: 0.002, c: M.l });
    b.push({ w: 0.018, h: 0.018, d: 0.07, x: 0.04, y: H / 2 + 0.024, z: 0.006, c: 0xb8302a });
  }
  const mesh = new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: M.glow, emissiveIntensity: 0 }));
  const panel = new THREE.Mesh(mergeBoxes(p), new THREE.MeshLambertMaterial({ vertexColors: true })); panel.renderOrder = 30; mesh.add(panel);
  return { mesh, metal: M };
}
/** where the badge floats (board units) */
export const SOCKET = { x: SX, y: 0, size: SOCK };

/** a card's picture as a thick voxel badge: '#' body in the card's colour, 'o' raised and lit, 'd' sunk dark (axis-aligned) */
export function glyphIcon3D(key: string, rows: string[], col: number): Model3D {
  return customIcon3D('card:' + key, set => {
    const m = new Mask(), Hh = rows.length;
    rows.forEach((row, py) => { for (let px = 0; px < row.length; px++) if (row[px] !== '.') m.rect(px * 2, (Hh - 1 - py) * 2, px * 2 + 1, (Hh - 1 - py) * 2 + 1); });
    const c = (k: number) => { const r = (col >> 16) & 255, g = (col >> 8) & 255, bl = col & 255, f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1)))); return (f(r) << 16) | (f(g) << 8) | f(bl); };
    pillow(set, m, -1, 0, c(0.45), c(1), 1, c(1.4), 1);
    rows.forEach((row, py) => { for (let px = 0; px < row.length; px++) {
      const y = (Hh - 1 - py) * 2;
      if (row[px] === 'o') box(set, px * 2, y, 2, px * 2 + 1, y + 1, 2, c(1.75), 1);
      else if (row[px] === 'd') box(set, px * 2, y, 1, px * 2 + 1, y + 1, 1, c(0.3));
    } });
  });
}

// ---------------------------------------------------------------- the face: name, tier tag, two lines
export interface FaceSpec { name: string; tag: string; desc: string[]; tier: number; style: CardStyle; locked?: boolean; altBadge?: string }
/** paint the face for an on-screen size of w × h CSS px (the text area), at the screen's device pixels */
export function paintFace(f: FaceSpec, w: number, h: number, dpr: number) {
  const W = Math.max(8, Math.round(w * dpr)), Hh = Math.max(8, Math.round(h * dpr)), c = makeCanvas(W, Hh), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  const padX = Math.round(6 * dpr);
  const maxW = W - padX * 2;
  // Auto-fit pixel title scale so name + tag NEVER clip off the right edge!
  let S = Math.max(1, Math.floor((Hh * 0.27) / PIX_H));
  const tagText = f.tag || '';
  const altText = f.altBadge || '';
  const pillW = (txt: string, sc: number) => {
    const pad = Math.max(2, sc * 3);
    return pixW(txt) * sc + pad * 2;
  };
  while (S > 1) {
    const s2 = Math.max(1, Math.round(S * 0.56));
    const need = pixW(f.name) * S + (tagText ? pillW(tagText, s2) + Math.round(10 * dpr) : 0) + (altText ? pillW(altText, s2) + Math.round(8 * dpr) : 0);
    if (need <= maxW) break;
    S--;
  }
  const nameCol = f.locked ? '#a8a29a' : (f.style === 'boon' ? NAME_TXT[f.tier] ?? NAME_TXT[0] : f.tier >= 2 ? '#fff2c4' : '#f4e6c8');
  const topY = Math.round(Hh * 0.08);
  drawPix(g, f.name, padX, topY, { scale: S, color: nameCol, outline: '#0a0708', align: 'left' });
  const s2 = Math.max(1, Math.round(S * 0.56));
  const padP = Math.max(2, s2 * 3);
  const drawPill = (txt: string, rxRight: number, tc: string, bgCol = '#0d0a0b') => {
    const tw = pixW(txt) * s2, pw = tw + padP * 2, ph = PIX_H * s2 + padP * 2;
    const tx = Math.round(rxRight - pw), ty = Math.round(topY + (PIX_H * S - ph) / 2);
    g.fillStyle = tc; g.fillRect(tx, ty, pw, ph);
    g.fillStyle = bgCol; g.fillRect(tx + s2, ty + s2, pw - 2 * s2, ph - 2 * s2);
    drawPix(g, txt, tx + padP, ty + padP, { scale: s2, color: tc, outline: null, align: 'left' });
    return tx;
  };
  // Right-align badges cleanly so they never collide with or overflow past the right edge
  let rightEdge = W - padX;
  if (altText) {
    rightEdge = drawPill(altText, rightEdge, '#d8c4ff', '#1c152c') - Math.round(7 * dpr);
  }
  if (tagText) {
    const tc = f.locked ? '#c4746a' : (f.style === 'boon' ? TIER_TXT[f.tier] ?? TIER_TXT[0] : f.tier >= 2 ? '#ffe08a' : '#e0c890');
    drawPill(tagText, rightEdge, tc);
  }
  // Subtle horizontal divider rule separating header from description
  const divY = Math.round(topY + PIX_H * S + Hh * 0.07);
  g.fillStyle = f.locked ? '#2c2934' : '#3a3242';
  g.fillRect(padX, divY, maxW, Math.max(1, Math.round(dpr)));

  // Two clean lines of description (no noisy misaligned inline 7x7 mini-icons on meta/shop cards)
  const availH = Hh - divY - Math.round(6 * dpr);
  const basePx = Math.max(Math.round(11 * dpr), Math.min(Math.round(Hh * 0.21), Math.round(availH * 0.42)));
  const y0 = divY + Math.round(Math.max(4 * dpr, (availH - basePx * 2.45) * 0.35));
  const showIco = f.style === 'boon' || f.style === 'manual';
  f.desc.slice(0, 2).forEach((l, i) => {
    if (!l) return;
    let p = basePx;
    const baseCol = f.locked
      ? (i === 1 ? '#ff9484' : '#9c9694')
      : (i === 1 && /消耗|点击|免费|可切|佩戴|使用/.test(l) ? '#f0d89e' : '#ebe2d2');
    const numCol = f.locked ? (i === 1 ? '#ffb8ac' : '#c0b8b0') : '#ffffff';
    while (p > Math.round(9.5 * dpr) && richLine(null, l, 0, 0, p, baseCol, numCol, !f.locked, showIco) > maxW) p -= 1;
    richLine(g, l, padX, y0 + i * Math.round(basePx * 1.38), p, baseCol, numCol, !f.locked, showIco);
  });
  const tex = new THREE.CanvasTexture(c as HTMLCanvasElement); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** act-136: paint the bottom nameplate & star row of a 4×2 Keepsake showcase tray */
export function paintKeepsakeFace(
  spec: { name: string; stars: number; unlocked: boolean; equipped: boolean; col: string },
  w: number, h: number, dpr: number,
) {
  const W = Math.max(8, Math.round(w * dpr)), Hh = Math.max(8, Math.round(h * dpr)), c = makeCanvas(W, Hh), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  const maxW = W - Math.round(8 * dpr);
  let S = Math.max(1, Math.floor((Hh * 0.46) / PIX_H));
  while (S > 1 && pixW(spec.name) * S > maxW) S--;
  const col = !spec.unlocked ? '#8c8690' : spec.equipped ? '#fff2b0' : '#f2e8d6';
  const yName = Math.round(Hh * 0.08);
  drawPix(g, spec.name, W / 2, yName, { scale: S, color: col, outline: '#08060c', align: 'center' });
  const row2Y = Math.round(yName + PIX_H * S + (Hh - (yName + PIX_H * S)) * 0.5);
  if (!spec.unlocked) {
    const s2 = Math.max(1, Math.floor((Hh * 0.30) / PIX_H));
    drawPix(g, '未获赠', W / 2, Math.round(row2Y - (PIX_H * s2) / 2), { scale: s2, color: '#8e8490', outline: '#08060c', align: 'center' });
  } else {
    const stSz = Math.max(Math.round(9 * dpr), Math.round(Hh * 0.34));
    const stGap = Math.round(4 * dpr);
    const totalW = 3 * stSz + 2 * stGap;
    let sx = Math.round((W - totalW) / 2 + stSz / 2);
    for (let i = 0; i < 3; i++) {
      drawMiniIcon(g, i < spec.stars ? 'star' : 'starOff', sx, row2Y, stSz);
      sx += stSz + stGap;
    }
  }
  const tex = new THREE.CanvasTexture(c as HTMLCanvasElement); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Crisp axis-aligned pixel diamond (lit or dark socket) for forge/stele levels */
function drawDiamond(g: CanvasRenderingContext2D, cx: number, cy: number, sz: number, fill: string, rim: string, lit = true) {
  const u = Math.max(1, Math.round(sz / 5));
  const x = Math.round(cx), y = Math.round(cy);
  const R = (dx: number, dy: number, w: number, h: number, col: string) => {
    g.fillStyle = col; g.fillRect(x + dx * u, y + dy * u, w * u, h * u);
  };
  R(-2, -1, 5, 3, rim); R(-1, -2, 3, 5, rim);
  R(-1, -1, 3, 3, fill);
  if (lit) R(0, -1, 1, 1, '#fff8dc');
}

/** act-149: upright blade-rack nameplate (文家刀廊) — large name + crimson 佩 seal + 3 forge diamonds */
export function paintWeaponStandFace(
  spec: { name: string; lv: number; unlocked: boolean; equipped: boolean; col: string },
  w: number, h: number, dpr: number,
) {
  const W = Math.max(8, Math.round(w * dpr)), Hh = Math.max(8, Math.round(h * dpr)), c = makeCanvas(W, Hh), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  const maxW = W - Math.round(10 * dpr);
  let S = Math.max(1, Math.floor((Hh * 0.44) / PIX_H));
  const nm = t(spec.name);
  while (S > 1 && pixW(nm) * S > maxW) S--;
  const yName = Math.round(Hh * 0.12);
  const col = !spec.unlocked ? '#8a8690' : spec.equipped ? '#fff2b0' : '#f4ead8';
  drawPix(g, nm, W / 2, yName, { scale: S, color: col, outline: '#08060c', align: 'center' });
  const row2Y = Math.round(yName + PIX_H * S + (Hh - (yName + PIX_H * S)) * 0.54);
  if (!spec.unlocked) {
    const s2 = Math.max(1, Math.floor((Hh * 0.28) / PIX_H));
    const tH2 = PIX_H * s2, icoSz = Math.round(tH2 * 1.02), gap = Math.round(4 * dpr);
    const lbl = t('未夺回');
    const tot = icoSz + gap + pixW(lbl) * s2;
    const x0 = Math.round((W - tot) / 2);
    drawMiniIcon(g, 'lock', x0 + icoSz / 2, row2Y, icoSz);
    drawPix(g, lbl, x0 + icoSz + gap, Math.round(row2Y - tH2 / 2), { scale: s2, color: '#96909c', outline: '#08060c', align: 'left' });
  } else {
    const dSz = Math.max(Math.round(9 * dpr), Math.round(Hh * 0.28));
    const dGap = Math.round(6 * dpr);
    const sealS = Math.max(1, Math.floor((Hh * 0.25) / PIX_H));
    const sealW = spec.equipped ? pixW('已佩') * sealS + Math.round(10 * dpr) : 0;
    const totalW = 3 * dSz + 2 * dGap + (sealW ? sealW + Math.round(8 * dpr) : 0);
    let cx = Math.round((W - totalW) / 2);
    if (spec.equipped) {
      const sh = PIX_H * sealS + Math.round(6 * dpr);
      const sy = Math.round(row2Y - sh / 2);
      g.fillStyle = '#e04838'; g.fillRect(cx, sy, sealW, sh);
      g.fillStyle = '#240b09'; g.fillRect(cx + Math.max(1, Math.round(dpr)), sy + Math.max(1, Math.round(dpr)), sealW - Math.max(2, Math.round(2 * dpr)), sh - Math.max(2, Math.round(2 * dpr)));
      drawPix(g, '已佩', cx + Math.round(5 * dpr), sy + Math.round(3 * dpr), { scale: sealS, color: '#ffd898', outline: null, align: 'left' });
      cx += sealW + Math.round(8 * dpr);
    }
    cx += Math.round(dSz / 2);
    for (let i = 0; i < 3; i++) {
      drawDiamond(g, cx, row2Y, dSz, i < spec.lv ? '#ffd260' : '#3a3438', i < spec.lv ? '#7a4a16' : '#18151a', i < spec.lv);
      cx += dSz + dGap;
    }
  }
  const tex = new THREE.CanvasTexture(c as HTMLCanvasElement); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** act-149: hanging wooden merchant tag face (行商货摊) — huge name + concise benefit + ONE bold recessed coin price bar */
export function paintShopTagFace(
  spec: { name: string; effect: string; price: number; poor: boolean; disabled?: boolean; note?: string },
  w: number, h: number, dpr: number,
) {
  const W = Math.max(8, Math.round(w * dpr)), Hh = Math.max(8, Math.round(h * dpr)), c = makeCanvas(W, Hh), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  const padX = Math.round(10 * dpr), maxW = W - padX * 2;
  const locked = spec.poor || !!spec.disabled;
  // 1. Crisp item name centered at top
  const nm = t(spec.name);
  let S = Math.max(1, Math.floor((Hh * 0.21) / PIX_H));
  while (S > 1 && pixW(nm) * S > maxW) S--;
  const y1 = Math.round(Hh * 0.07);
  drawPix(g, nm, W / 2, y1, { scale: S, color: locked ? '#aaa098' : '#fff2cc', outline: '#0a0708', align: 'center' });
  // 2. Crisp short benefit line(s)
  const eff = t(spec.effect);
  const effY = Math.round(y1 + PIX_H * S + Hh * 0.09);
  const effH = Math.round(Hh * 0.34);
  let px = Math.max(Math.round(11 * dpr), Math.round(Hh * 0.145));
  const split = eff.length > 8 ? (() => {
    const idx = eff.search(/[，·、 ]/);
    if (idx > 1 && idx < eff.length - 1) return [eff.slice(0, idx), eff.slice(idx + 1)];
    const mid = Math.ceil(eff.length / 2);
    return [eff.slice(0, mid), eff.slice(mid)];
  })() : [eff];
  for (const ln of split) {
    while (px > Math.round(10 * dpr) && richLine(null, ln, 0, 0, px, '#f2e8d4', '#fff4b0', true, true) > maxW) px -= 1;
  }
  const lineGap = Math.round(px * 1.28);
  const startY = effY + Math.max(0, Math.round((effH - split.length * lineGap) / 2));
  split.forEach((ln, i) => {
    richLine(g, ln, W / 2, startY + i * lineGap, px, locked ? '#b2a89c' : '#f2e8d4', locked ? '#d4c8b8' : '#fff4b0', true, true, 'center');
  });
  // 3. Recessed gold coin price trough at bottom (ZERO duplicate price text!)
  const barH = Math.round(Hh * 0.27);
  const barY = Hh - barH - Math.round(Hh * 0.04);
  const barX = padX, barW = maxW;
  const bdr = Math.max(1, Math.round(1.5 * dpr));
  g.fillStyle = spec.disabled ? '#54505c' : spec.poor ? '#b84234' : '#c89642';
  g.fillRect(barX, barY, barW, barH);
  g.fillStyle = spec.disabled ? '#18161e' : spec.poor ? '#281312' : '#18120c';
  g.fillRect(barX + bdr, barY + bdr, barW - 2 * bdr, barH - 2 * bdr);
  const pScale = Math.max(1, Math.floor((barH * 0.64) / PIX_H));
  const pH = PIX_H * pScale;
  const midY = Math.round(barY + barH / 2);
  if (spec.disabled && spec.note) {
    let ns = pScale;
    const nt = t(spec.note);
    while (ns > 1 && pixW(nt) * ns > barW - Math.round(10 * dpr)) ns--;
    drawPix(g, nt, W / 2, Math.round(midY - (PIX_H * ns) / 2), { scale: ns, color: '#a8a09c', outline: '#08060c', align: 'center' });
  } else {
    const pTxt = `${spec.price}`;
    const coinSz = Math.round(pH * 0.98);
    const gap = Math.round(5 * dpr);
    const tot = coinSz + gap + pixW(pTxt) * pScale;
    const x0 = Math.round((W - tot) / 2);
    drawMiniIcon(g, 'coin', x0 + coinSz / 2, midY, coinSz);
    drawPix(g, pTxt, x0 + coinSz + gap, Math.round(midY - pH / 2), { scale: pScale, color: spec.poor ? '#ff8474' : '#ffe07a', outline: '#08060c', align: 'left' });
  }
  const tex = new THREE.CanvasTexture(c as HTMLCanvasElement); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** act-149 / act-151: compact left-column workbench strip face (锻坊 / 药棚) — large name + level pips + Hades-2 `[icon] have/need` chip */
export function paintWorkRowFace(
  spec: { name: string; lv: number; maxLv: number; cost: number | null; have?: number; cur: 'iron' | 'herb'; canAfford: boolean; unlocked?: boolean },
  w: number, h: number, dpr: number,
) {
  const W = Math.max(8, Math.round(w * dpr)), Hh = Math.max(8, Math.round(h * dpr)), c = makeCanvas(W, Hh), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  const padX = Math.round(8 * dpr), unlocked = spec.unlocked !== false;
  const isMax = spec.cost == null && unlocked;
  const locked = !unlocked || (!isMax && !spec.canAfford);
  // Top row: Crisp balanced name (left) + level pips (right)
  const nm = t(spec.name);
  let S = Math.max(1, Math.floor((Hh * 0.25) / PIX_H));
  const pipSz = Math.max(Math.round(6 * dpr), Math.round(Hh * 0.14));
  const pipGap = Math.round(3 * dpr);
  const pipsW = spec.maxLv > 0 ? spec.maxLv * pipSz + (spec.maxLv - 1) * pipGap : 0;
  while (S > 1 && pixW(nm) * S + pipsW + Math.round(16 * dpr) > W - padX * 2) S--;
  const topY = Math.round(Hh * 0.16);
  drawPix(g, nm, padX, topY, { scale: S, color: !unlocked ? '#8a8690' : isMax ? '#fff0b0' : locked ? '#cfc6ba' : '#fff4d8', outline: '#08060c', align: 'left' });
  if (spec.maxLv > 0 && unlocked) {
    let px = W - padX - pipSz;
    const py = Math.round(topY + (PIX_H * S - pipSz) / 2);
    for (let i = spec.maxLv - 1; i >= 0; i--) {
      const lit = i < spec.lv;
      g.fillStyle = '#09070c'; g.fillRect(px - 1, py - 1, pipSz + 2, pipSz + 2);
      g.fillStyle = lit ? (spec.cur === 'herb' ? '#7cf0a8' : '#ffd260') : '#38343c';
      g.fillRect(px, py, pipSz, pipSz);
      px -= pipSz + pipGap;
    }
  }
  // Bottom row: Hades-2 icon + have/need chip (ZERO dry text)
  const botY = Math.round(Hh * 0.60);
  const s2 = Math.max(1, Math.floor((Hh * 0.21) / PIX_H));
  const tH2 = PIX_H * s2;
  const botMid = Math.round(botY + tH2 / 2);
  if (!unlocked) {
    const icoSz = Math.round(tH2 * 1.0);
    drawMiniIcon(g, 'lock', padX + icoSz / 2, botMid, icoSz);
    drawPix(g, '未夺回', padX + icoSz + Math.round(4 * dpr), botY, { scale: s2, color: '#948c98', outline: '#08060c', align: 'left' });
  } else if (isMax) {
    const icoSz = Math.round(tH2 * 1.0);
    drawMiniIcon(g, 'star', padX + icoSz / 2, botMid, icoSz);
    drawPix(g, '已臻圆满', padX + icoSz + Math.round(4 * dpr), botY, { scale: s2, color: '#ffe082', outline: '#08060c', align: 'left' });
  } else if (spec.cost != null) {
    drawCostChip(g, spec.cur, spec.cost, spec.have, padX, botMid, s2, dpr);
    if (spec.canAfford) {
      drawPix(g, '可升', W - padX, botY, { scale: s2, color: spec.cur === 'herb' ? '#88f4b0' : '#ffd878', outline: '#08060c', align: 'right' });
    }
  }
  const tex = new THREE.CanvasTexture(c as HTMLCanvasElement); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** act-149 / act-151: clean carved stele face (复仇碑) — inline keyword icons + Hades-2 `[icon] have/need` chip */
export function paintSteleFace(
  spec: {
    name: string; yin: boolean; lv: number; effect: string; cost: number | null; have: number;
    cur: 'iron' | 'herb'; altName: string; altBadge: string;
  },
  w: number, h: number, dpr: number,
) {
  const W = Math.max(8, Math.round(w * dpr)), Hh = Math.max(8, Math.round(h * dpr)), c = makeCanvas(W, Hh), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  const padX = Math.round(7 * dpr), maxW = W - padX * 2;
  const canAfford = spec.cost != null && spec.have >= spec.cost;
  const isMax = spec.cost == null;
  const sideCol = spec.yin ? '#c6a8ff' : '#ffd87a';

  // Row 1: Crisp talent name + 3 diamonds + top-right [Q 切阴/阳] pill
  const nm = t(spec.name);
  let S = Math.max(1, Math.floor((Hh * 0.23) / PIX_H));
  const sPill = Math.max(1, Math.round(S * 0.56));
  const padP = Math.max(2, sPill * 3);
  const altPillW = pixW(spec.altBadge) * sPill + padP * 2;
  const dSz = Math.max(Math.round(8 * dpr), Math.round(Hh * 0.14));
  const dBlockW = 3 * dSz + Math.round(10 * dpr);
  while (S > 1 && pixW(nm) * S + dBlockW + altPillW + Math.round(16 * dpr) > maxW) S--;
  const topY = Math.round(Hh * 0.07);
  drawPix(g, nm, padX, topY, { scale: S, color: spec.yin ? '#ede2ff' : '#fff0c8', outline: '#08060c', align: 'left' });
  // 3 level diamonds directly next to name
  let dx = padX + pixW(nm) * S + Math.round(10 * dpr) + dSz / 2;
  const dCy = Math.round(topY + (PIX_H * S) / 2);
  for (let i = 0; i < 3; i++) {
    drawDiamond(g, dx, dCy, dSz, i < spec.lv ? sideCol : '#3a3444', i < spec.lv ? '#1c1428' : '#120f18', i < spec.lv);
    dx += dSz + Math.round(4 * dpr);
  }
  // Clickable top-right Yang/Yin flip badge
  const pH = PIX_H * sPill + padP * 2;
  const pX = W - padX - altPillW, pY = Math.round(topY + (PIX_H * S - pH) / 2);
  const flipCol = spec.yin ? '#ffd880' : '#c6a8ff';
  g.fillStyle = flipCol; g.fillRect(pX, pY, altPillW, pH);
  g.fillStyle = spec.yin ? '#282012' : '#1e1632'; g.fillRect(pX + sPill, pY + sPill, altPillW - 2 * sPill, pH - 2 * sPill);
  drawPix(g, spec.altBadge, pX + padP, pY + padP, { scale: sPill, color: flipCol, outline: null, align: 'left' });

  // Crisp divider bar
  const divY = Math.round(topY + PIX_H * S + Hh * 0.06);
  g.fillStyle = spec.yin ? '#483a6c' : '#645238';
  g.fillRect(padX, divY, maxW, Math.max(1, Math.round(dpr)));

  // Row 2: Big clear effect + stat line WITH inline pixel icons
  const effY = divY + Math.round(Hh * 0.08);
  let px = Math.max(Math.round(12 * dpr), Math.round(Hh * 0.21));
  while (px > Math.round(10 * dpr) && richLine(null, spec.effect, 0, 0, px, '#f4ecd8', '#fff4b0', true, true) > maxW) px -= 1;
  richLine(g, spec.effect, padX, effY, px, '#f4ecd8', '#fff4b0', true, true);

  // Row 3: Hades-2 `[icon] have/need` chip (left) + subtle alt-side name (right)
  const botY = Math.round(Hh * 0.72);
  const s3 = Math.max(1, Math.floor((Hh * 0.175) / PIX_H));
  const tH3 = PIX_H * s3;
  const botMid = Math.round(botY + tH3 / 2);
  if (isMax) {
    const icoSz = Math.round(tH3 * 1.0);
    drawMiniIcon(g, 'star', padX + icoSz / 2, botMid, icoSz);
    drawPix(g, '已臻满级', padX + icoSz + Math.round(4 * dpr), botY, { scale: s3, color: '#ffe082', outline: '#08060c', align: 'left' });
  } else if (spec.cost != null) {
    const cw = drawCostChip(g, spec.cur, spec.cost, spec.have, padX, botMid, s3, dpr);
    if (canAfford) {
      drawPix(g, '参悟', padX + cw + Math.round(6 * dpr), botY, { scale: s3, color: '#ffe694', outline: '#08060c', align: 'left' });
    }
  }
  const altHint = `${spec.yin ? '阳' : '阴'}：${t(spec.altName)}`;
  const altPx = Math.max(Math.round(10 * dpr), Math.round(Hh * 0.145));
  bodyText(g, altHint, W - padX, Math.round(botY + (tH3 - altPx) / 2), altPx, '#aba2b8', 'right', '#08060c');

  const tex = new THREE.CanvasTexture(c as HTMLCanvasElement); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** act-149 / act-151: paint a 3×3 Hades-2-style jade meditation card face — top-left `[grasp] N` / `[star]`, top-right rank pips, bottom name + `[herb] have/need` */
export function paintArcanaFace(
  spec: {
    short: string; grasp: number; rank: number; active: boolean; unlockCost: number; have?: number; canUnlock: boolean; awakening?: boolean;
  },
  w: number, h: number, dpr: number,
) {
  const W = Math.max(8, Math.round(w * dpr)), Hh = Math.max(8, Math.round(h * dpr)), c = makeCanvas(W, Hh), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  const unlocked = spec.rank > 0;
  const pad = Math.round(4 * dpr);
  // 1. Top-left Grasp cost seal: `[grasp icon] N` (or golden `[star]` for 0-grasp Awakening)
  const gScale = Math.max(1, Math.floor((Hh * 0.13) / PIX_H));
  const gH = PIX_H * gScale;
  const gIco = Math.round(gH * 0.98);
  const gPad = Math.max(2, Math.round(3 * dpr));
  const gTxt = spec.grasp === 0 ? '' : String(spec.grasp);
  const innerW = spec.grasp === 0 ? gIco : gIco + Math.round(2 * dpr) + pixW(gTxt) * gScale;
  const gw = innerW + gPad * 2;
  const gh = gH + gPad * 2;
  const bdr = Math.max(1, Math.round(1.5 * dpr));
  const rimCol = !unlocked ? '#484c58' : spec.active ? (spec.awakening ? '#ffe478' : '#ffd868') : '#566474';
  g.fillStyle = rimCol; g.fillRect(pad, pad, gw, gh);
  g.fillStyle = spec.active ? (spec.awakening ? '#30220c' : '#123826') : '#141820';
  g.fillRect(pad + bdr, pad + bdr, gw - 2 * bdr, gh - 2 * bdr);
  const gMid = Math.round(pad + gh / 2);
  if (spec.grasp === 0) {
    drawMiniIcon(g, spec.active ? 'star' : 'starOff', Math.round(pad + gw / 2), gMid, gIco);
  } else {
    drawMiniIcon(g, 'grasp', Math.round(pad + gPad + gIco / 2), gMid, gIco);
    drawPix(g, gTxt, Math.round(pad + gPad + gIco + Math.round(2 * dpr)), Math.round(gMid - gH / 2), {
      scale: gScale, color: !unlocked ? '#8a909c' : spec.active ? '#fff2b0' : '#c0ccd6', outline: null, align: 'left',
    });
  }

  // 2. Top-right rank diamonds (1..3) when unlocked, or small lock icon when locked
  if (unlocked) {
    const dSz = Math.max(Math.round(6 * dpr), Math.round(Hh * 0.08));
    const dGap = Math.round(2.5 * dpr);
    let dx = W - pad - Math.round(dSz / 2);
    const dy = Math.round(pad + gh / 2);
    for (let i = 2; i >= 0; i--) {
      drawDiamond(g, dx, dy, dSz, i < spec.rank ? (spec.active ? '#ffe074' : '#7a94a8') : '#242a32', '#0a0e0c', i < spec.rank);
      dx -= dSz + dGap;
    }
  } else {
    const lSz = Math.max(Math.round(8 * dpr), Math.round(Hh * 0.11));
    drawMiniIcon(g, 'lock', Math.round(W - pad - lSz / 2), gMid, lSz);
  }

  // 3. Bottom horizontal hairline + clean card name + unmistakable solid Active pill vs quiet Inactive label
  const divY = Math.round(Hh * 0.60);
  g.fillStyle = !unlocked ? '#262a34' : spec.active ? (spec.awakening ? '#e8b848' : '#70e8a4') : '#2e3844';
  g.fillRect(pad, divY, W - pad * 2, Math.max(1, Math.round(dpr)));

  const nm = t(spec.short);
  let S = Math.max(1, Math.floor((Hh * 0.14) / PIX_H));
  while (S > 1 && pixW(nm) * S > W - pad * 2) S--;
  const s2 = Math.max(1, Math.floor((Hh * 0.095) / PIX_H));
  const tH1 = PIX_H * S, tH2 = PIX_H * s2;
  const availBot = Hh - divY - Math.round(3 * dpr);
  const gapY = Math.max(1, Math.round((availBot - tH1 - tH2) * 0.42));
  const yName = Math.round(divY + Math.max(2, gapY));
  const nameCol = !unlocked ? '#7c808c' : spec.active ? '#fff8cc' : '#c6d0d8';
  drawPix(g, nm, W / 2, yName, { scale: S, color: nameCol, outline: '#07090c', align: 'center' });

  const yBot = Math.min(Hh - tH2 - Math.max(2, Math.round(2 * dpr)), Math.round(yName + tH1 + Math.max(2, gapY * 0.8)));
  if (!unlocked) {
    if (spec.unlockCost <= 0) {
      drawPix(g, t('未参悟'), W / 2, yBot, { scale: s2, color: '#8a8078', outline: '#08060c', align: 'center' });
    } else {
      const cw = drawCostChip(null, 'herb', spec.unlockCost, spec.have, 0, 0, s2, dpr);
      drawCostChip(g, 'herb', spec.unlockCost, spec.have, Math.round((W - cw) / 2), Math.round(yBot + tH2 / 2), s2, dpr);
    }
  } else if (spec.active) {
    // Solid unmistakable active pill badge (amber-gold border + luminous green-gold fill)
    const lbl = t(spec.awakening ? '已唤醒' : '已入阵');
    const pw = pixW(lbl) * s2 + Math.round(12 * dpr);
    const ph = tH2 + Math.round(4 * dpr);
    const px0 = Math.round((W - pw) / 2), py0 = Math.round(yBot - Math.round(2 * dpr));
    g.fillStyle = spec.awakening ? '#ffe074' : '#7ef8b4';
    g.fillRect(px0, py0, pw, ph);
    g.fillStyle = spec.awakening ? '#3a280a' : '#123d28';
    g.fillRect(px0 + bdr, py0 + bdr, pw - 2 * bdr, ph - 2 * bdr);
    drawPix(g, lbl, W / 2, yBot, { scale: s2, color: spec.awakening ? '#fff4b0' : '#c4ffe0', outline: null, align: 'center' });
  } else {
    drawPix(g, spec.awakening ? '待唤醒' : '未启', W / 2, yBot, { scale: s2, color: '#6e7c8a', outline: '#07090c', align: 'center' });
  }

  const tex = new THREE.CanvasTexture(c as HTMLCanvasElement); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** act-185: Ultra-clean Ancient Lantern showcase plaque face — ONLY item name + minimal status badge (已用 / 试穿 / dot / 🔥N). Zero prose clutter! */
export function paintLanternFace(
  spec: { name: string; unlocked: boolean; active: boolean; trial?: boolean; lanternAt: number; col: string },
  w: number, h: number, dpr: number,
) {
  const W = Math.max(8, Math.round(w * dpr)), Hh = Math.max(8, Math.round(h * dpr)), c = makeCanvas(W, Hh), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  const maxW = W - Math.round(10 * dpr);
  const nm = t(spec.name);
  let S = Math.max(1, Math.floor((Hh * 0.42) / PIX_H));
  while (S > 1 && pixW(nm) * S > maxW) S--;
  const yName = Math.round(Hh * 0.14);
  const nameCol = !spec.unlocked && !spec.trial ? '#8c848c' : spec.active ? '#fff2b0' : '#f4e8d2';
  drawPix(g, nm, W / 2, yName, { scale: S, color: nameCol, outline: '#08060c', align: 'center' });

  const row2Y = Math.round(yName + PIX_H * S + (Hh - (yName + PIX_H * S)) * 0.54);
  const s2 = Math.max(1, Math.floor((Hh * 0.28) / PIX_H));
  const tH2 = PIX_H * s2;
  const bdr = Math.max(1, Math.round(dpr));

  if (spec.active) {
    const lbl = t(spec.trial ? '试穿' : '已用');
    const pw = pixW(lbl) * s2 + Math.round(12 * dpr);
    const ph = tH2 + Math.round(5 * dpr);
    const px = Math.round((W - pw) / 2), py = Math.round(row2Y - ph / 2);
    g.fillStyle = spec.trial ? '#ffd868' : '#e4523c';
    g.fillRect(px, py, pw, ph);
    g.fillStyle = spec.trial ? '#32220c' : '#2a0d0a';
    g.fillRect(px + bdr, py + bdr, pw - 2 * bdr, ph - 2 * bdr);
    drawPix(g, lbl, W / 2, Math.round(row2Y - tH2 / 2), { scale: s2, color: spec.trial ? '#fff2a8' : '#ffe0a8', outline: null, align: 'center' });
  } else if (spec.unlocked) {
    const dot = Math.max(4, Math.round(6 * dpr));
    g.fillStyle = '#08060c'; g.fillRect(Math.round(W / 2 - dot / 2) - 1, Math.round(row2Y - dot / 2) - 1, dot + 2, dot + 2);
    g.fillStyle = '#78e8a8'; g.fillRect(Math.round(W / 2 - dot / 2), Math.round(row2Y - dot / 2), dot, dot);
  } else {
    const num = String(spec.lanternAt);
    const fSz = Math.round(tH2 * 1.05);
    const gap = Math.round(4 * dpr);
    const tot = fSz + gap + pixW(num) * s2;
    const x0 = Math.round((W - tot) / 2);
    drawMiniIcon(g, 'fire', x0 + fSz / 2, row2Y, fSz);
    drawPix(g, num, x0 + fSz + gap, Math.round(row2Y - tH2 / 2), { scale: s2, color: '#d8b478', outline: '#08060c', align: 'left' });
  }
  const tex = new THREE.CanvasTexture(c as HTMLCanvasElement); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
