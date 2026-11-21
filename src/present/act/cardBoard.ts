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
import { icon } from '../v2/overlay';
import { bodyText, bodyW } from '../ui3d/bodyFont';
import { t } from './i18n';
import { makeCanvas } from '../../platform/index';
import { drawMiniIcon } from './uiPlate';

export type CardStyle = 'boon' | 'manual' | 'forge' | 'medic' | 'meal' | 'mirror' | 'keepsake';
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
};
const PANEL: Record<CardStyle, [number, number]> = {
  boon: [LACQ, LACQ_L], manual: [0x3b2d1a, 0x544024], meal: [0x2c2216, 0x3a2c1c],
  forge: [0x221d1b, 0x302724], medic: [0x15221c, 0x1f3128], mirror: [0x1b1628, 0x2a223e],
  keepsake: [0x18151f, 0x272234],
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

/** act-128: 3D wrought-iron & bronze-riveted plaque button for 「换一批」 (matching title plaques & iron cards) */
export function rerollPlaque() {
  const M: Metal = { d: 0x2c2216, m: 0x7a5628, l: 0xe6b868, glow: 0xffd27a };
  const H = 0.175, fr = 0.022;
  const p: Parameters<typeof mergeBoxes>[0] = [], b: Parameters<typeof mergeBoxes>[0] = [];
  p.push({ w: 1.0, h: H, d: 0.048, x: 0, y: 0, z: 0, c: IRON_D });
  p.push({ w: 1.0 - 2 * fr, h: H - 2 * fr, d: 0.056, x: 0, y: 0, z: 0.002, c: 0x1b1614 });
  p.push({ w: 1.0 - 2 * fr, h: 0.011, d: 0.058, x: 0, y: H / 2 - fr - 0.006, z: 0.003, c: 0x2f251e });
  // beveled bronze-iron frame with warm lit top ridge
  b.push({ w: 1.0, h: fr, d: 0.066, x: 0, y: H / 2 - fr / 2, z: 0.004, c: M.m });
  b.push({ w: 0.99, h: 0.008, d: 0.070, x: 0, y: H / 2 - 0.004, z: 0.005, c: M.l });
  b.push({ w: 1.0, h: fr, d: 0.066, x: 0, y: -H / 2 + fr / 2, z: 0.004, c: M.d });
  for (const sx of [-1, 1]) {
    b.push({ w: fr, h: H, d: 0.068, x: sx * (0.5 - fr / 2), y: 0, z: 0.004, c: sx < 0 ? M.m : M.d });
    // stepped end lugs
    b.push({ w: 0.022, h: H * 0.52, d: 0.076, x: sx * 0.508, y: 0, z: 0.006, c: M.m });
    b.push({ w: 0.014, h: H * 0.28, d: 0.082, x: sx * 0.518, y: 0, z: 0.008, c: M.l });
  }
  // four corner bronze rivets
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    b.push({ w: 0.018, h: 0.018, d: 0.022, x: sx * (0.5 - fr * 0.65), y: sy * (H / 2 - fr * 0.65), z: 0.036, c: sy > 0 ? M.l : RIVET });
  }
  const mesh = new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: M.glow, emissiveIntensity: 0.08 }));
  const panel = new THREE.Mesh(mergeBoxes(p), new THREE.MeshLambertMaterial({ vertexColors: true })); panel.renderOrder = 32; mesh.add(panel);
  mesh.renderOrder = 32;
  return { mesh, metal: M, ratio: H };
}

/** act-118: 3D voxel carved stone stele (复仇碑 · 碑铭潜能) — 3-tier Han stone arch crown, weathered blue-grey granite body, wide stepped pedestal base & Yang(gold)/Yin(violet) jewel */
export function steleBoard(Hh: number, accentHex?: number) {
  const lay = steleLayout(Hh), H = lay.H, SOCK = lay.SOCK, SX = lay.SX, SY = lay.SY, DIV = lay.DIV;
  const ST_D = 0x323946, ST_M = 0x545e70, ST_L = 0x7e8a9e, ST_FACE = 0x1a1f2a;
  const jewel = accentHex ?? 0xffd268;
  const M: Metal = { d: ST_D, m: ST_M, l: ST_L, glow: jewel };
  const p: Parameters<typeof mergeBoxes>[0] = [], b: Parameters<typeof mergeBoxes>[0] = [];
  // weathered blue-grey granite main slab + recessed dark chiseled inscription face
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
  b.push({ w: 0.07, h: 0.042, d: 0.098, x: 0, y: H / 2 + 0.042, z: 0.012, c: jewel });
  // wide stepped granite pedestal base (碑座) anchoring the stele firmly at the bottom
  b.push({ w: 1.02, h: 0.038, d: 0.096, x: 0, y: -H / 2 + 0.032, z: 0.01, c: ST_M });
  b.push({ w: 1.08, h: 0.034, d: 0.108, x: 0, y: -H / 2 - 0.002, z: 0.012, c: ST_D });
  b.push({ w: 1.02, h: 0.010, d: 0.10, x: 0, y: -H / 2 + 0.049, z: 0.011, c: ST_L });
  // carved stone socket on left with Yang/Yin accent bar
  const r = 0.014, sd = 0.08;
  b.push({ w: SOCK + 2 * r, h: r, d: sd, x: SX, y: SY + SOCK / 2 + r / 2, z: 0.008, c: ST_L }, { w: SOCK + 2 * r, h: r, d: sd, x: SX, y: SY - SOCK / 2 - r / 2, z: 0.008, c: ST_D });
  b.push({ w: r, h: SOCK, d: sd, x: SX - SOCK / 2 - r / 2, y: SY, z: 0.008, c: ST_M }, { w: r, h: SOCK, d: sd, x: SX + SOCK / 2 + r / 2, y: SY, z: 0.008, c: ST_D });
  p.push({ w: SOCK, h: SOCK, d: 0.03, x: SX, y: SY, z: 0.018, c: 0x10131c });
  b.push({ w: 0.014, h: H * 0.62, d: 0.084, x: DIV, y: SY, z: 0.01, c: jewel });
  const mesh = new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: jewel, emissiveIntensity: 0 }));
  const panel = new THREE.Mesh(mergeBoxes(p), new THREE.MeshLambertMaterial({ vertexColors: true })); panel.renderOrder = 30; mesh.add(panel);
  return { mesh, metal: M };
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

/** the board itself: one merged mesh (vertex colours), its emissive used for the focus glow; Hh = the board's height (CARD_H / SKILL_H) */
export function cardBoard(style: CardStyle, tier: number, Hh = CARD_H, skill = false, accentHex?: number, locked = false) {
  if (style === 'manual') return scrollBoard(Hh);
  if (style === 'mirror') return steleBoard(Hh, accentHex);
  if (style === 'keepsake') return keepsakeBoard(Hh, tier, locked, accentHex);
  const M = locked ? LOCKED_METAL : (style === 'boon' ? METAL[Math.max(0, Math.min(2, tier))] : tier >= 2 ? METAL[2] : STYLE_METAL[style]);
  const [pc, pl] = locked ? [0x15141a, 0x201e28] : PANEL[style];
  const { H, SOCK, SX, DIV } = boardLayout(Hh);
  // (two meshes: the panel never glows — only the metal warms in focus; act-36 first try tinted the whole lacquer orange)
  const p: Parameters<typeof mergeBoxes>[0] = [], b: Parameters<typeof mergeBoxes>[0] = [];
  p.push({ w: 1, h: H, d: 0.05, x: 0, y: 0, z: 0, c: IRON_D });                                                // the iron back
  p.push({ w: 1 - 2 * FR, h: H - 2 * FR, d: 0.056, x: 0, y: 0, z: 0.002, c: pc });                            // the lacquer panel
  p.push({ w: 1 - 2 * FR, h: 0.012, d: 0.058, x: 0, y: H / 2 - FR - 0.006, z: 0.002, c: pl });                 // its lit top band
  // the frame: top (with a lit lip) and bottom bars, the two ends
  b.push({ w: 1, h: FR, d: 0.064, x: 0, y: H / 2 - FR / 2, z: 0.004, c: M.m }, { w: 1 - 0.01, h: 0.007, d: 0.066, x: 0, y: H / 2 - 0.0035, z: 0.004, c: M.l });
  b.push({ w: 1, h: FR, d: 0.064, x: 0, y: -H / 2 + FR / 2, z: 0.004, c: M.d });
  for (const s of [-1, 1]) b.push({ w: FR, h: H, d: 0.066, x: s * (0.5 - FR / 2), y: 0, z: 0.004, c: s < 0 ? M.m : M.d });
  // The skill picture sits over a dark insert. Its front clears the lacquer but stays below the narrow iron walls.
  const r = skill ? 0.01 : 0.016, sd = 0.07, dark = skill ? IRON_D : M.d;
  b.push({ w: SOCK + 2 * r, h: r, d: sd, x: SX, y: SOCK / 2 + r / 2, z: 0.006, c: skill ? IRON : M.l }, { w: SOCK + 2 * r, h: r, d: sd, x: SX, y: -SOCK / 2 - r / 2, z: 0.006, c: dark });
  b.push({ w: r, h: SOCK, d: sd, x: SX - SOCK / 2 - r / 2, y: 0, z: 0.006, c: skill ? 0x26282e : M.m }, { w: r, h: SOCK, d: sd, x: SX + SOCK / 2 + r / 2, y: 0, z: 0.006, c: dark });
  p.push({ w: SOCK, h: SOCK, d: 0.03, x: SX, y: 0, z: skill ? 0.019 : -0.006, c: skill ? 0x111217 : 0x0b090a });
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
  // rivets: the four corners of the frame, then along the top and bottom bars
  const rv = 0.016, rz = 0.04;
  for (const [x, y] of [[-0.5 + FR / 2, H / 2 - FR / 2], [0.5 - FR / 2, H / 2 - FR / 2], [-0.5 + FR / 2, -H / 2 + FR / 2], [0.5 - FR / 2, -H / 2 + FR / 2]]) b.push({ w: rv, h: rv, d: 0.02, x, y, z: rz, c: RIVET });
  for (let x = DIV + 0.1; x < 0.5 - 0.06; x += 0.13) for (const y of [H / 2 - FR / 2, -H / 2 + FR / 2]) b.push({ w: rv * 0.8, h: rv * 0.8, d: 0.018, x, y, z: rz, c: y > 0 ? RIVET : RIVET_D });
  // the tier: corner brackets from 珍品, a crest on top for 绝品
  if (style === 'boon' && tier >= 1) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const cx = sx * (0.5 - 0.004), cy = sy * (H / 2 - 0.004), L = 0.06, T = 0.012;
    b.push({ w: L, h: T, d: 0.072, x: cx - sx * L / 2, y: cy, z: 0.006, c: M.l }, { w: T, h: L * 0.7, d: 0.072, x: cx, y: cy - sy * L * 0.35, z: 0.006, c: M.l });
  }
  if (style === 'boon' && tier >= 2) {
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
/** the little icons in front of key words (7 × 7, axis-aligned) */
const MINI: Record<string, string[]> = {
  blade: ['...#...', '...#...', '...#...', '...#...', '.#####.', '...#...', '..###..'],
  blood: ['...#...', '..###..', '..###..', '.#####.', '.#####.', '..###..', '.......'],
  bone: ['.#...#.', '..###..', '...#...', '...#...', '...#...', '..###..', '.#...#.'],
  dart: ['...#...', '..###..', '...#...', '...#...', '..###..', '..#.#..', '..###..'],
  dash: ['.......', '....#..', '######.', '#######', '######.', '....#..', '.......'],
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...', '.......'],
  draw: ['#######', '...#...', '...#...', '...#...', '...#...', '..###..', '...#...'],
  // 11-18 (技能说明配图标): 气 = the cut button's lamp, 杀气 = the copper ingot, up = thrown up, stun = knocked senseless, moon = the light
  qi: ['.......', '.#####.', '.#ooo#.', '.#ooo#.', '.#ooo#.', '.#####.', '.......'],
  ingot: ['.......', '.......', '.#####.', '#######', '#######', '.......', '.......'],
  up: ['...#...', '..###..', '.#####.', '...#...', '...#...', '...#...', '.......'],
  stun: ['.#...#.', '###.###', '.#...#.', '.......', '...#...', '..###..', '...#...'],
  moon: ['.......', '#.....#', '##...##', '.#####.', '..###..', '.......', '.......'],
};
const KEYS: Array<[string, string, string]> = ([
  ['收尾一刀', 'blade', '#ffd27a'], ['连环刀', 'blade', '#ffd27a'], ['箭步斩', 'blade', '#ffd27a'], ['破势', 'blade', '#ffd27a'], ['劈山', 'blade', '#ffd27a'], ['挑云', 'blade', '#ffd27a'],
  ['斩击', 'blade', '#ffd27a'], ['斩杀', 'blade', '#ff9a6a'], ['刀光', 'moon', '#e8fff2'], ['刀芒', 'moon', '#e8fff2'], ['月牙刀光', 'moon', '#e8fff2'], ['刀痕', 'blade', '#ffd27a'],
  ['重斩', 'blade', '#ffd27a'], ['连爆八刀', 'blade', '#ffd27a'], ['回锋斩', 'blade', '#ffd27a'], ['穿风斩', 'blade', '#9ad8ff'],
  ['出血', 'blood', '#ff6a5a'], ['放血', 'blood', '#ff6a5a'], ['流血', 'blood', '#ff6a5a'], ['破甲', 'bone', '#e0d0b8'], ['硬直', 'bone', '#e0d0b8'], ['断骨', 'bone', '#e0d0b8'], ['破绽', 'bone', '#e0d0b8'],
  ['藏锋', 'draw', '#ffd27a'], ['柳叶镖', 'dart', '#e8eef4'], ['飞镖', 'dart', '#e8eef4'], ['完美闪避', 'dash', '#9ad8ff'], ['冲刺', 'dash', '#9ad8ff'],
  ['回血', 'heart', '#8aff9a'], ['回一口血', 'heart', '#8aff9a'], ['生命', 'heart', '#8aff9a'], ['杀气', 'ingot', '#ffaa5a'], ['一格气', 'qi', '#d6f4ec'],
  ['挑上半空', 'up', '#ffe08a'], ['踹飞', 'dash', '#ffc890'], ['震开', 'dash', '#ffc890'], ['打得更远', 'dash', '#ffc890'], ['发蒙', 'stun', '#f0e0a0'], ['身形一顿', 'stun', '#f0e0a0'],
] as Array<[string, string, string]>).sort((a, b) => b[0].length - a[0].length);
const NUM = /^([+\-−]?[0-9]+(?:\.[0-9]+)?(?:%|秒|点|枚|倍|层)?|[一二三四五六七八九十百半两]+(?:秒|点|成|枚|倍|层))/;
/** one line in the body font: the key words lit (optionally behind their icons), the numbers white; returns its width (draw = false only measures);
 *  keys = false: no key words (the small numbers line stays plain); showIcons = false: color highlight only (clean for meta/shop cards) */
export function richLine(g: CanvasRenderingContext2D | null, line: string, x: number, y: number, px: number, base: string, numCol = '#ffffff', keys = true, showIcons = true) {
  line = t(line);
  let i = 0, cx = x, plain = '';
  const flush = () => { if (!plain) return; if (g) bodyText(g, plain, cx, y, px, base, 'left'); cx += bodyW(plain, px); plain = ''; };
  while (i < line.length) {
    const rest = line.slice(i), k = keys ? KEYS.find(([w]) => rest.startsWith(w)) : undefined;
    if (k) {
      flush();
      if (showIcons) {
        const c = Math.max(1, Math.round(px / 10)), iw = 7 * c;
        if (g) icon(g, MINI[k[1]], cx + 1, y + Math.round((px * 0.94 - iw) / 2), c, { main: k[2], acc: '#ffffff' });
        cx += iw + Math.round(px * 0.16);
      }
      if (g) bodyText(g, k[0], cx, y, px, k[2], 'left'); cx += bodyW(k[0], px); i += k[0].length; continue;
    }
    const n = rest.match(NUM);
    if (n && (i === 0 || !/[一二三四五六七八九十]/.test(line[i - 1]))) { flush(); if (g) bodyText(g, n[1], cx, y, px, numCol, 'left'); cx += bodyW(n[1], px); i += n[1].length; continue; }
    plain += line[i]; i++;
  }
  flush();
  return cx - x;
}
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
