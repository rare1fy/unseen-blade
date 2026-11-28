/**
 * Production Japanese Cel-Shaded Smooth-Normal Voxel Actor Pipeline & 2× Animated Face Engine.
 *
 * Approved look (act-196):
 * - 0% corner vertex deformation (preserves crisp, authentic 3.5 cm voxel silhouette)
 * - 100% smooth averaged vertex normals + 100% Japanese 2.5-step hue-shifted cel shading
 *   (warm peach skin shadow, cool periwinkle hair/cloth shadow, soft anime rim light, zero tile jitter)
 * - Compatible with Three.js RigidBatch SkinnedMesh skinning (1 opaque draw call per actor!) & per-actor uEmissive hit flash
 * - Conformal 2× pixel-art animated faces for ALL humanoids (heroine skins, hideout NPCs, prologue, 4 generals, 5 bosses, 45+ soldiers):
 *   natural blinking, live dialogue lip-sync, battle rage/grit, hurt wince, plus slimmed Liu Bai jaw & sculpted beards/eyepatch!
 */
import * as THREE from 'three';
import { glowMat, type VoxChar } from './voxkit';
import { OCC_ORDER } from './occlude';
import type { Bone } from '../actors/rig';
import { makeCanvas } from '../../platform/index';

export type FaceExpr = 'idle' | 'talk' | 'battle' | 'hurt' | 'soft';

export interface FaceAnimHandle {
  update: (t: number, expr: FaceExpr) => void;
  dispose: () => void;
}

export type FaceFactory = (bones: Record<string, Bone>) => FaceAnimHandle | null;

/** Shared live-game lighting uniform (synced to warm daylight/lantern key direction). */
export const ACTOR_CEL_LIGHT = { value: new THREE.Vector3(0.45, 0.72, 0.52).normalize() };

/** Active dialogue speaker state written by dialogue.ts so 3D faces lip-sync live during cutscenes & hideout talks. */
export const ACTIVE_TALK = { who: '', typing: false };

const SPEAKER_MATCH: Record<string, RegExp> = {
  jiangjin: /^fine_(white|hat|snow|obsidian|crimson)$/,
  duwu: /^npc_duwu$/,
  sunao: /^npc_sunao$/,
  fengtiebi: /^npc_fengtiebi$/,
  luzhao: /^npc_luzhao$/,
  huanyue: /^npc_huanyue$/,
  chulei: /^(hj_boss|killer_big)$/,
  yanhu: /^ly_boss$/,
  fengzhen: /^xp_boss$/,
  zhouan: /^wl_boss$/,
  cuixuan: /^cx_boss$/,
  zhaoyun: /^gen_zhaoyun$/,
  lubu: /^gen_lubu$/,
  xiahoudun: /^gen_xiahoudun$/,
  luxun: /^gen_luxun$/,
};

export function matchesActiveSpeaker(modelId: string, speakerWho: string): boolean {
  if (!speakerWho) return false;
  const re = SPEAKER_MATCH[speakerWho];
  return re ? re.test(modelId) : false;
}

// ------------------------------------------------------------------ Color & Spec Types
type EyeStyle =
  | 'bright' | 'innocent' | 'noble'
  | 'grim' | 'cold' | 'sinister' | 'shrewd' | 'sunao' | 'masked';

type BrowStyle = 'friendly' | 'stern' | 'sword' | 'fierce' | 'delicate' | 'thick' | 'soft' | 'sinister';
type MouthStyle = 'none' | 'stoic' | 'smile' | 'stern' | 'smirk' | 'fierce' | 'dainty' | 'small';
type Beard2xStyle = 'none' | 'full_silver' | 'full_dark' | 'trim_dark' | 'thin_sinister' | 'long_grey' | 'five_strand' | 'stubble';

type PxFn = (x: number, y: number, col: string, w?: number, h?: number) => void;

export interface CharFaceSpec {
  x0: number; x1: number; y0: number; y1: number; zFace: number;
  skin: number;
  skinShade: number;
  clearNose?: [number, number, number, number];
  clearFrontZ?: [number, number, number, number];
  clearSkinY: [number, number];
  blindfolded?: boolean;
  sleekEyepatch?: boolean;
  maskedLower?: boolean;
  beard2x?: Beard2xStyle;
  beardCol?: string;
  beardColLight?: string;
  browY: number;
  eyeY: number;
  noseY: number;
  mouthY: number;
  eyeStyle: EyeStyle;
  browStyle: BrowStyle;
  mouthStyle: MouthStyle;
  browCol: string;
  irisCol: string;
  irisBounce?: string;
  lipCol: string;
  blushCol?: string;
  topShadowCol?: string;
  extraDetail?: (px: PxFn, w: number, h: number, expr: FaceExpr) => void;
}

function isWarmSkin(hex: number): boolean {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const isYellowCloth = r > 180 && g > 150 && b < 95 && (g - b) > 70;
  if (isYellowCloth) return false;
  return r >= 145 && g >= 92 && b >= 62 && (r - g) >= 14 && (g - b) >= 8 && (r - b) >= 24 && (r - b) < 130;
}

function isPaleOrFrostSkin(hex: number): boolean {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return r >= 110 && g >= 120 && b >= 110 && r <= 235 && g <= 240 && b <= 235 && Math.abs(r - g) <= 28 && Math.abs(g - b) <= 28 && (b - r) < 24;
}

/** Normalize live-game ModelDef.id (e.g. 'fine_white', 'npc_duwu', 'gen_zhaoyun') to canonical spec key. */
function canonicalId(modelId: string): string {
  if (/^fine_(white|hat|snow|obsidian|crimson)$/.test(modelId)) return 'heroine';
  if (modelId === 'npc_duwu') return 'duwu';
  if (modelId === 'npc_sunao') return 'sunao';
  if (modelId === 'npc_fengtiebi') return 'fengtiebi';
  if (modelId === 'npc_luzhao') return 'luzhao';
  if (modelId === 'npc_huanyue') return 'huanyue';
  if (modelId === 'npc_merchant') return 'merchant';
  if (modelId.startsWith('child_wenjiao')) return 'child';
  if (modelId === 'wen_father') return 'father';
  if (modelId === 'gen_zhaoyun') return 'zhaoyun';
  if (modelId === 'gen_lubu') return 'lubu';
  if (modelId === 'gen_xiahoudun') return 'xiahoudun';
  if (modelId === 'gen_luxun') return 'luxun';
  return modelId;
}

const NAMED_SPECS: Record<string, CharFaceSpec> = {
  heroine: {
    x0: -4, x1: 4, y0: 41, y1: 46, zFace: 6,
    skin: 0xf4d2b8, skinShade: 0xe4b496,
    clearSkinY: [41, 45],
    blindfolded: true,
    browY: 0, eyeY: 0, noseY: 2, mouthY: 4,
    eyeStyle: 'noble', browStyle: 'delicate', mouthStyle: 'stoic',
    browCol: '#4a4a56', irisCol: '#241a20', lipCol: '#9b5856',
    topShadowCol: 'rgba(156, 58, 56, 0.28)',
  },
  duwu: {
    x0: -4, x1: 4, y0: 41, y1: 50, zFace: 6,
    skin: 0xf0be90, skinShade: 0xd89d6e,
    clearNose: [-1, 0, 44, 44],
    clearSkinY: [42, 49],
    browY: 3, eyeY: 6, noseY: 10, mouthY: 13,
    eyeStyle: 'bright', browStyle: 'friendly', mouthStyle: 'smile',
    browCol: '#3d281f', irisCol: '#2c1b15', irisBounce: '#7e4d2e', lipCol: '#96503c',
    blushCol: 'rgba(232, 114, 90, 0.30)',
    topShadowCol: 'rgba(155, 100, 68, 0.28)',
  },
  sunao: {
    x0: -4, x1: 4, y0: 39, y1: 48, zFace: 6,
    skin: 0xe5b790, skinShade: 0xc89570,
    clearSkinY: [39, 47],
    browY: 4, eyeY: 7, noseY: 11, mouthY: 14,
    eyeStyle: 'sunao', browStyle: 'stern', mouthStyle: 'stern',
    browCol: '#695e66', irisCol: '#1b1113', lipCol: '#80473f',
    topShadowCol: 'rgba(130, 88, 70, 0.24)',
    extraDetail: (px) => {
      px(7, 5, 'rgba(148, 96, 72, 0.50)', 1, 2);
      px(1, 11, 'rgba(164, 104, 78, 0.34)', 2, 2);
      px(13, 11, 'rgba(164, 104, 78, 0.34)', 2, 2);
    },
  },
  fengtiebi: {
    x0: -4, x1: 4, y0: 44, y1: 55, zFace: 6,
    skin: 0xe2a576, skinShade: 0xbd8054,
    clearNose: [-1, 0, 47, 49],
    clearFrontZ: [-5, 4, 52, 52],
    clearSkinY: [44, 54],
    beard2x: 'full_silver',
    beardCol: '#968f8a',
    beardColLight: '#bfb8b2',
    browY: 4, eyeY: 7, noseY: 11, mouthY: 15,
    eyeStyle: 'grim', browStyle: 'thick', mouthStyle: 'stern',
    browCol: '#241a18', irisCol: '#171110', lipCol: '#7b4538',
    topShadowCol: 'rgba(116, 82, 62, 0.25)',
    extraDetail: (px) => {
      px(11, 10, 'rgba(154, 72, 52, 0.80)', 1, 1);
      px(12, 11, 'rgba(154, 72, 52, 0.88)', 1, 1);
      px(13, 12, 'rgba(154, 72, 52, 0.72)', 1, 1);
      px(12, 10, 'rgba(246, 206, 178, 0.38)', 1, 1);
    },
  },
  luzhao: {
    x0: -4, x1: 4, y0: 41, y1: 50, zFace: 6,
    skin: 0xf6dac4, skinShade: 0xdcb49c,
    clearSkinY: [41, 49],
    browY: 4, eyeY: 7, noseY: 11, mouthY: 14,
    eyeStyle: 'noble', browStyle: 'delicate', mouthStyle: 'dainty',
    browCol: '#2c1c28', irisCol: '#241622', irisBounce: '#5b3854', lipCol: '#a4444e',
    blushCol: 'rgba(232, 132, 134, 0.16)',
    topShadowCol: 'rgba(92, 58, 76, 0.18)',
    extraDetail: (px) => { px(3, 11, '#8c2834', 1, 1); },
  },
  huanyue: {
    x0: -4, x1: 4, y0: 43, y1: 51, zFace: 6,
    skin: 0xf2caa4, skinShade: 0xd4a47e,
    clearNose: [-1, 0, 45, 46],
    clearSkinY: [43, 50],
    browY: 2, eyeY: 5, noseY: 9, mouthY: 12,
    eyeStyle: 'bright', browStyle: 'sword', mouthStyle: 'smirk',
    browCol: '#1f1820', irisCol: '#22151a', irisBounce: '#6e3438', lipCol: '#965448',
    topShadowCol: 'rgba(62, 46, 54, 0.30)',
  },
  merchant: {
    x0: -4, x1: 4, y0: 42, y1: 50, zFace: 6,
    skin: 0xecb98c, skinShade: 0xd0986a,
    clearNose: [-1, 0, 44, 44],
    clearSkinY: [42, 49],
    browY: 3, eyeY: 6, noseY: 10, mouthY: 13,
    eyeStyle: 'shrewd', browStyle: 'friendly', mouthStyle: 'smile',
    browCol: '#4a362a', irisCol: '#2a1c16', lipCol: '#9a5440',
    blushCol: 'rgba(228, 122, 92, 0.22)',
    topShadowCol: 'rgba(130, 92, 62, 0.34)',
  },
  child: {
    x0: -4, x1: 4, y0: 31, y1: 38, zFace: 6,
    skin: 0xf4d2b6, skinShade: 0xdcb092,
    clearSkinY: [31, 37],
    browY: 1, eyeY: 4, noseY: 8, mouthY: 11,
    eyeStyle: 'innocent', browStyle: 'soft', mouthStyle: 'small',
    browCol: '#26222c', irisCol: '#1c1824', irisBounce: '#4c4660', lipCol: '#b06c64',
    blushCol: 'rgba(238, 134, 126, 0.22)',
    topShadowCol: 'rgba(64, 54, 68, 0.24)',
  },
  father: {
    x0: -3, x1: 3, y0: 42, y1: 50, zFace: 5,
    skin: 0xd8a57e, skinShade: 0xb4805c,
    clearNose: [-1, 0, 46, 47],
    clearFrontZ: [-4, 3, 42, 48],
    clearSkinY: [42, 49],
    beard2x: 'trim_dark',
    beardCol: '#262020',
    beardColLight: '#403838',
    browY: 2, eyeY: 5, noseY: 8, mouthY: 11,
    eyeStyle: 'grim', browStyle: 'soft', mouthStyle: 'stoic',
    browCol: '#1e1a20', irisCol: '#181214', lipCol: '#804c3e',
    topShadowCol: 'rgba(72, 54, 44, 0.24)',
  },
  zhaoyun: {
    x0: -4, x1: 4, y0: 40, y1: 48, zFace: 6,
    skin: 0xf0c29a, skinShade: 0xd29c74,
    clearNose: [-1, 0, 43, 44],
    clearSkinY: [40, 47],
    browY: 2, eyeY: 5, noseY: 9, mouthY: 12,
    eyeStyle: 'bright', browStyle: 'sword', mouthStyle: 'stoic',
    browCol: '#222430', irisCol: '#1e2234', irisBounce: '#4d648c', lipCol: '#9e5c52',
    topShadowCol: 'rgba(64, 74, 96, 0.34)',
  },
  lubu: {
    x0: -4, x1: 4, y0: 40, y1: 49, zFace: 6,
    skin: 0xe6b084, skinShade: 0xc2885e,
    clearNose: [-1, 0, 43, 44],
    clearSkinY: [40, 48],
    browY: 3, eyeY: 6, noseY: 10, mouthY: 13,
    eyeStyle: 'grim', browStyle: 'fierce', mouthStyle: 'fierce',
    browCol: '#161218', irisCol: '#181010', lipCol: '#7e423a',
    topShadowCol: 'rgba(66, 36, 36, 0.26)',
    extraDetail: (px) => {
      px(7, 4, 'rgba(130, 74, 52, 0.55)', 2, 1);
      px(2, 10, 'rgba(148, 86, 62, 0.32)', 2, 1);
      px(12, 10, 'rgba(148, 86, 62, 0.32)', 2, 1);
    },
  },
  xiahoudun: {
    x0: -4, x1: 4, y0: 41, y1: 50, zFace: 6,
    skin: 0xe0a476, skinShade: 0xb97e56,
    clearNose: [-1, 0, 44, 45],
    clearFrontZ: [-5, 4, 41, 49],
    clearSkinY: [41, 49],
    sleekEyepatch: true,
    beard2x: 'full_dark',
    beardCol: '#1d1616',
    beardColLight: '#362c2c',
    browY: 4, eyeY: 7, noseY: 10, mouthY: 14,
    eyeStyle: 'grim', browStyle: 'fierce', mouthStyle: 'stern',
    browCol: '#1a1416', irisCol: '#161010', lipCol: '#683832',
    topShadowCol: 'rgba(54, 34, 30, 0.22)',
  },
  luxun: {
    x0: -3, x1: 3, y0: 41, y1: 49, zFace: 6,
    skin: 0xf4ccb0, skinShade: 0xd8a888,
    clearNose: [-1, 0, 43, 44],
    clearSkinY: [41, 48],
    browY: 3, eyeY: 6, noseY: 10, mouthY: 13,
    eyeStyle: 'noble', browStyle: 'sword', mouthStyle: 'smirk',
    browCol: '#222028', irisCol: '#1c2628', irisBounce: '#4c8076', lipCol: '#a25c54',
    topShadowCol: 'rgba(54, 72, 68, 0.20)',
  },
  hj_boss: {
    x0: -6, x1: 6, y0: 49, y1: 60, zFace: 8,
    skin: 0xdfa678, skinShade: 0xb97e54,
    clearNose: [-1, 0, 51, 53],
    clearSkinY: [49, 59],
    beard2x: 'full_dark',
    beardCol: '#1e1512',
    beardColLight: '#3a2b24',
    browY: 6, eyeY: 10, noseY: 14, mouthY: 18,
    eyeStyle: 'grim', browStyle: 'fierce', mouthStyle: 'fierce',
    browCol: '#1c1410', irisCol: '#16100e', lipCol: '#743e34',
    topShadowCol: 'rgba(116, 84, 34, 0.34)',
  },
  ly_boss: {
    x0: -6, x1: 6, y0: 47, y1: 57, zFace: 8,
    skin: 0xdda276, skinShade: 0xb77a52,
    clearNose: [-1, 0, 49, 51],
    clearFrontZ: [-4, 3, 49, 49],
    clearSkinY: [47, 56],
    beard2x: 'full_dark',
    beardCol: '#1c1514',
    beardColLight: '#382c2a',
    browY: 4, eyeY: 8, noseY: 12, mouthY: 16,
    eyeStyle: 'grim', browStyle: 'fierce', mouthStyle: 'fierce',
    browCol: '#181212', irisCol: '#161010', lipCol: '#703a32',
    topShadowCol: 'rgba(56, 48, 52, 0.36)',
    extraDetail: (px) => { px(6, 3, 'rgba(154, 64, 50, 0.85)', 1, 5); },
  },
  xp_boss: {
    x0: -4, x1: 4, y0: 42, y1: 52, zFace: 6,
    skin: 0xdbe3dc, skinShade: 0xb6c4ba,
    clearNose: [-1, 0, 45, 47],
    clearSkinY: [43, 51],
    beard2x: 'thin_sinister',
    beardCol: '#1a1820',
    beardColLight: '#363240',
    browY: 4, eyeY: 7, noseY: 11, mouthY: 16,
    eyeStyle: 'sinister', browStyle: 'sinister', mouthStyle: 'smirk',
    browCol: '#18161e', irisCol: '#161c22', lipCol: '#6e444c',
    topShadowCol: 'rgba(56, 66, 76, 0.28)',
    extraDetail: (px) => {
      px(2, 10, 'rgba(90, 100, 108, 0.48)', 4, 1);
      px(10, 10, 'rgba(90, 100, 108, 0.48)', 4, 1);
      px(1, 12, 'rgba(104, 114, 112, 0.38)', 2, 2);
      px(13, 12, 'rgba(104, 114, 112, 0.38)', 2, 2);
    },
  },
  wl_boss: {
    x0: -6, x1: 6, y0: 41, y1: 49, zFace: 8,
    skin: 0xd9a684, skinShade: 0xb48060,
    clearNose: [-1, 0, 43, 44],
    clearSkinY: [41, 48],
    beard2x: 'long_grey',
    beardCol: '#7e7a74',
    beardColLight: '#a6a098',
    browY: 3, eyeY: 6, noseY: 10, mouthY: 13,
    eyeStyle: 'cold', browStyle: 'stern', mouthStyle: 'stern',
    browCol: '#7c7872', irisCol: '#1c1818', lipCol: '#7c4840',
    topShadowCol: 'rgba(64, 54, 48, 0.30)',
    extraDetail: (px) => {
      px(11, 4, 'rgba(130, 88, 66, 0.50)', 2, 2);
      px(4, 9, 'rgba(130, 88, 66, 0.38)', 3, 1);
      px(17, 9, 'rgba(130, 88, 66, 0.38)', 3, 1);
    },
  },
  cx_boss: {
    x0: -5, x1: 5, y0: 42, y1: 51, zFace: 7,
    skin: 0xe8cdb6, skinShade: 0xc5a58c,
    clearNose: [-1, 0, 44, 45],
    clearSkinY: [42, 50],
    beard2x: 'five_strand',
    beardCol: '#1d1a20',
    beardColLight: '#36323c',
    browY: 4, eyeY: 7, noseY: 11, mouthY: 15,
    eyeStyle: 'cold', browStyle: 'sword', mouthStyle: 'stoic',
    browCol: '#1e1a22', irisCol: '#17151e', lipCol: '#804842',
    topShadowCol: 'rgba(54, 52, 64, 0.26)',
  },
};

function buildAutoSoldierSpec(vc: VoxChar, id: string): CharFaceSpec | null {
  const isFrost = id.startsWith('xp_');
  const matchSkin = (hex: number) => (isFrost ? (isWarmSkin(hex) || isPaleOrFrostSkin(hex)) : isWarmSkin(hex));

  const countByZ = new Map<number, number>();
  for (const c of vc.cells.values()) {
    if (c.part !== 'head' || !matchSkin(c.c)) continue;
    const f = vc.get(c.x, c.y, c.z + 1);
    if (f && f.part === 'head') continue;
    countByZ.set(c.z, (countByZ.get(c.z) ?? 0) + 1);
  }
  let zSkin = -999;
  let bestCount = 0;
  for (const [z, n] of countByZ) {
    if (n > bestCount || (n === bestCount && z > zSkin)) { bestCount = n; zSkin = z; }
  }
  if (zSkin === -999 || bestCount < 2) return null;

  let xMin = 999, xMax = -999, yMin = 999, yMax = -999;
  let skinCount = 0, rSum = 0, gSum = 0, bSum = 0;
  for (const c of vc.cells.values()) {
    if (c.part !== 'head' || c.z !== zSkin || !matchSkin(c.c)) continue;
    const front = vc.get(c.x, c.y, zSkin + 1);
    if (front && front.part === 'head' && !matchSkin(front.c)) continue;
    if (c.x < xMin) xMin = c.x;
    if (c.x > xMax) xMax = c.x;
    if (c.y < yMin) yMin = c.y;
    if (c.y > yMax) yMax = c.y;
    rSum += (c.c >> 16) & 255; gSum += (c.c >> 8) & 255; bSum += c.c & 255;
    skinCount++;
  }
  if (!skinCount) return null;
  for (let y = yMin; y <= yMax; y++) {
    let covered = 0;
    for (let x = -2; x <= 1; x++) if (vc.get(x, y, zSkin + 1)?.part === 'head') covered++;
    if (covered >= 3 && y >= yMin + 3) { yMax = y - 1; break; }
  }

  const halfW = Math.max(3, Math.min(6, Math.max(-xMin, xMax + 1)));
  const x0 = -halfW, x1 = halfW;

  let eyMin = yMin, eyMax = yMax;
  for (const c of vc.cells.values()) {
    if (c.part !== 'head' || c.z !== zSkin || c.x < x0 || c.x >= x1) continue;
    if (vc.get(c.x, c.y, zSkin + 1)?.part === 'head') continue;
    if (c.y >= yMin - 1 && c.y <= yMax) {
      if (c.y < eyMin && c.y >= yMin - 1) eyMin = c.y;
      if (c.y > eyMax) eyMax = c.y;
    }
  }
  const y0 = eyMin, y1 = eyMax + 1, spanY = y1 - y0, ch = spanY * 2;
  const isMasked =
    id === 'killer_cloak' || id === 'xp_assassin' || id === 'xp_assassin_e' ||
    id === 'xp_needle' || id === 'xp_needle_e' || id === 'wl_oil' || id === 'wl_oil_e' ||
    spanY <= 3;

  let hasJawBeard = false;
  for (const c of vc.cells.values()) { if (c.part === 'jaw' && c.z >= zSkin) { hasJawBeard = true; break; } }

  const ar = Math.min(242, Math.round((rSum / skinCount) * 1.07));
  const ag = Math.min(220, Math.round((gSum / skinCount) * 1.06));
  const ab = Math.min(200, Math.round((bSum / skinCount) * 1.05));
  const skin = (ar << 16) | (ag << 8) | ab;
  const skinShade = (Math.round(ar * 0.83) << 16) | (Math.round(ag * 0.80) << 8) | Math.round(ab * 0.78);

  const isOccult = id.startsWith('hj_taoist') || id.startsWith('xp_frost') || id.startsWith('xp_diver') || id.startsWith('wl_diver');
  const isCold = id.startsWith('cx_sword') || id.startsWith('cx_shade') || id.startsWith('cx_zhu');
  const isElderly = id.startsWith('cx_zhu') || id.startsWith('hj_taoist');
  const isRough = id.startsWith('hj_brute') || id.startsWith('hj_blade') || id.startsWith('ly_') || id === 'killer_big' || id.startsWith('xp_chain') || id.startsWith('wl_shield') || id.startsWith('cx_guard');

  const eyeStyle: EyeStyle = isMasked ? 'masked' : (isOccult ? 'sinister' : (isCold ? 'cold' : 'grim'));
  const browStyle: BrowStyle = isOccult ? 'sinister' : (isRough ? 'fierce' : (isCold ? 'sword' : 'stern'));
  const mouthStyle: MouthStyle = isMasked ? 'none' : (isRough ? 'fierce' : 'stern');

  const browY = isMasked ? Math.max(0, Math.floor(ch * 0.14)) : Math.max(1, Math.floor(ch * 0.20));
  const eyeY = isMasked ? Math.min(ch - 3, browY + 2) : Math.min(ch - 6, browY + 3);
  const noseY = Math.min(ch - 4, eyeY + 4);
  const mouthY = Math.min(ch - 2, noseY + 3);

  const beard2x: Beard2xStyle =
    isMasked ? 'none' :
    hasJawBeard ? (isElderly ? 'long_grey' : 'full_dark') :
    (isRough && !id.startsWith('hj_mob') && !id.startsWith('cx_club') ? 'stubble' : 'none');

  return {
    x0, x1, y0, y1, zFace: zSkin + 1,
    skin, skinShade,
    clearNose: [-1, 0, y0 + 1, Math.min(y1 - 2, y0 + 4)],
    clearSkinY: [y0, y1 - 1],
    maskedLower: isMasked,
    beard2x,
    beardCol: isElderly ? '#7c7874' : '#221a16',
    beardColLight: isElderly ? '#a6a09a' : '#3c302a',
    browY, eyeY, noseY, mouthY,
    eyeStyle, browStyle, mouthStyle,
    browCol: isElderly ? '#7a7672' : '#1b1514',
    irisCol: isOccult ? '#182226' : '#151010',
    lipCol: '#78443a',
    topShadowCol: 'rgba(42, 30, 28, 0.34)',
  };
}

function slimHeroineLowerFace(vc: VoxChar): void {
  const toDelete: Array<[number, number, number]> = [];
  for (const c of vc.cells.values()) {
    if (c.part !== 'head' || !isWarmSkin(c.c) || c.y >= 46) continue;
    if (c.y >= 43 && c.y <= 45) {
      if (c.x <= -6 || c.x >= 5) toDelete.push([c.x, c.y, c.z]);
      else if (c.y === 43 && (c.x <= -5 || c.x >= 4) && c.z >= 4) toDelete.push([c.x, c.y, c.z]);
    }
    if (c.y === 42) {
      if (c.x <= -5 || c.x >= 4) toDelete.push([c.x, c.y, c.z]);
      else if ((c.x === -4 || c.x === 3) && c.z >= 4) toDelete.push([c.x, c.y, c.z]);
    }
    if (c.y === 41) {
      if (c.x <= -4 || c.x >= 3) toDelete.push([c.x, c.y, c.z]);
      else if ((c.x === -3 || c.x === 2) && c.z >= 4) toDelete.push([c.x, c.y, c.z]);
    }
  }
  vc.part('head');
  for (const [x, y, z] of toDelete) vc.set(x, y, z, null);
  const hairL = vc.bonesAbs.get('hairL');
  const hairR = vc.bonesAbs.get('hairR');
  if (hairL) hairL.p.x -= 0.75;
  if (hairR) hairR.p.x += 0.75;
}

function refineBeardAndEyepatch(vc: VoxChar, cid: string, spec: CharFaceSpec): void {
  if (cid === 'fengtiebi') {
    vc.part('head');
    for (let x = -5; x <= 4; x++) for (let y = 41; y <= 46; y++) vc.set(x, y, 6, null);
    const BD = 0x9c9590, BD_D = 0x76706c;
    for (let x = -4; x <= 3; x++) for (let z = 3; z <= 5; z++) vc.set(x, 43, z, BD);
    for (let x = -3; x <= 2; x++) for (let z = 3; z <= 5; z++) vc.set(x, 42, z, BD);
    for (let x = -2; x <= 1; x++) for (let z = 4; z <= 5; z++) vc.set(x, 41, z, BD_D);
    for (let x = -4; x <= 3; x++) for (let y = 44; y <= 46; y++) { const c = vc.get(x, y, 5); if (c && c.part === 'head') c.c = spec.skin; }
    return;
  }
  if (cid === 'xiahoudun') {
    vc.part('head');
    for (let x = -5; x <= 4; x++) for (let y = 40; y <= 49; y++) vc.set(x, y, 6, null);
    for (let x = -4; x <= 3; x++) for (let y = 41; y <= 49; y++) { const c = vc.get(x, y, 5); if (c && c.part === 'head') c.c = spec.skin; }
    const BD = 0x1d1616, BD_D = 0x120e0e;
    for (let x = -4; x <= 3; x++) for (let z = 2; z <= 5; z++) vc.set(x, 40, z, BD);
    for (let x = -3; x <= 2; x++) for (let z = 3; z <= 5; z++) vc.set(x, 39, z, BD_D);
    vc.box(4, 45, -3, 5, 47, 5, null);
    vc.box(4, 46, -3, 5, 46, 4, 0x18151c);
    return;
  }
  if (cid === 'xp_boss') {
    vc.part('jaw');
    for (let x = -3; x <= 2; x++) vc.set(x, 44, 6, null);
    vc.set(-1, 42, 6, null).set(0, 42, 6, null);
    vc.set(-1, 41, 5, 0x1a1820).set(0, 41, 5, 0x1a1820);
    return;
  }
  if (cid === 'father') {
    vc.part('head');
    for (let x = -4; x <= 3; x++) for (let y = 42; y <= 48; y++) vc.set(x, y, 5, null);
    for (let x = -3; x <= 2; x++) for (let z = 2; z <= 4; z++) vc.set(x, 42, z, 0x221c1c);
    return;
  }
  if (cid === 'hj_boss') { vc.part('jaw'); for (let x = -5; x <= 4; x++) { vc.set(x, 50, 8, null); vc.set(x, 49, 8, null); } return; }
  if (cid === 'ly_boss') { vc.part('jaw'); for (let x = -5; x <= 4; x++) vc.set(x, 48, 8, null); return; }
  if (cid === 'wl_boss') { vc.part('jaw'); for (let x = -5; x <= 4; x++) vc.set(x, 42, 8, null); return; }
  if (cid === 'cx_boss') {
    vc.part('jaw');
    for (let x = -4; x <= 3; x++) { vc.set(x, 42, 6, null); vc.set(x, 42, 7, null); }
    vc.set(-1, 41, 7, null).set(0, 41, 7, null);
    return;
  }
  if (spec.beard2x && spec.beard2x !== 'none') {
    const zF = spec.zFace;
    const toRemove: Array<[number, number, number]> = [];
    for (const c of vc.cells.values()) {
      if (c.part === 'jaw' && c.z === zF && c.y >= spec.y0 + 1 && c.x >= spec.x0 && c.x < spec.x1) toRemove.push([c.x, c.y, c.z]);
    }
    if (toRemove.length) { vc.part('jaw'); for (const [x, y, z] of toRemove) vc.set(x, y, z, null); }
  }
}

export function prepareActorFaceModel(vc: VoxChar, modelId: string): CharFaceSpec | null {
  const cid = canonicalId(modelId);
  const spec = NAMED_SPECS[cid] ?? buildAutoSoldierSpec(vc, cid);
  if (!spec) return null;
  const isNamed = cid in NAMED_SPECS;

  if (cid === 'heroine') slimHeroineLowerFace(vc);
  refineBeardAndEyepatch(vc, cid, spec);

  vc.part('head');
  if (spec.clearNose) {
    const [nx0, nx1, ny0, ny1] = spec.clearNose;
    for (let x = nx0; x <= nx1; x++) for (let y = ny0; y <= ny1; y++) {
      const c = vc.get(x, y, spec.zFace);
      if (!c || c.part !== 'head') continue;
      const r = (c.c >> 16) & 255, g = (c.c >> 8) & 255, b = c.c & 255;
      const looksLikeNose = isNamed || isWarmSkin(c.c) || isPaleOrFrostSkin(c.c) || (!spec.maskedLower && r > 105 && g > 65 && (r - g) < 62 && r >= g && g >= b);
      if (looksLikeNose) vc.set(x, y, spec.zFace, null);
    }
  }
  if (spec.clearFrontZ) {
    const [fx0, fx1, fy0, fy1] = spec.clearFrontZ;
    for (let x = fx0; x <= fx1; x++) for (let y = fy0; y <= fy1; y++) vc.set(x, y, spec.zFace, null);
  }

  const headY = vc.bonesAbs.get('head')?.p.y ?? spec.y0;
  const isFrost = cid.startsWith('xp_');
  vc.paint((c) => {
    if (c.part !== 'head' && c.part !== 'neck') return null;
    const match = isFrost ? (isWarmSkin(c.c) || isPaleOrFrostSkin(c.c)) : isWarmSkin(c.c);
    if (!match) return null;
    if (c.part === 'neck') return c.y <= headY - 2 ? spec.skinShade : spec.skin;
    return c.y <= headY + 1 ? spec.skinShade : spec.skin;
  });

  const zSkin = spec.zFace - 1;
  const [cy0, cy1] = spec.clearSkinY;
  if (cid === 'zhaoyun') {
    for (const bx of [-5, 4]) { const c = vc.get(bx, 47, zSkin); if (c && c.part === 'head') c.c = spec.skin; }
  }
  for (let x = spec.x0; x < spec.x1; x++) {
    for (let y = cy0; y <= cy1; y++) {
      const cell = vc.get(x, y, zSkin);
      if (!cell || cell.part !== 'head') continue;
      if (cid === 'luxun' && y >= 47 && (x === -4 || x === 2)) continue;
      if (cid === 'luzhao' && (x <= -5 || x >= 4)) continue;
      if (cid === 'xp_boss' && y >= 51 && (x === -1 || x === 0)) continue;
      if (vc.get(x, y, spec.zFace)?.part === 'head') continue;
      if (spec.maskedLower && !isWarmSkin(cell.c) && !isPaleOrFrostSkin(cell.c)) {
        const r = (cell.c >> 16) & 255, g = (cell.c >> 8) & 255, b = cell.c & 255;
        if (!(r < 40 && g < 35 && b < 35 && y >= cy1 - 1)) continue;
      }
      cell.c = spec.skin;
    }
  }
  return spec;
}

// ------------------------------------------------------------------ 2× Animated Face Painter
function paintFaceFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spec: CharFaceSpec,
  expr: FaceExpr,
  blink: number,
  talkStep: number,
): void {
  ctx.clearRect(0, 0, w, h);
  const px: PxFn = (x, y, col, rw = 1, rh = 1) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(rw), Math.round(rh));
  };
  const mid = Math.floor(w / 2);

  if (spec.topShadowCol) {
    px(1, 0, spec.topShadowCol, w - 2, 1);
    px(2, 1, spec.topShadowCol.replace(/[\d.]+\)$/, (m) => `${(parseFloat(m) * 0.45).toFixed(2)})`), w - 4, 1);
  }

  if (spec.blindfolded) {
    px(mid - 1, spec.noseY, 'rgba(196, 138, 114, 0.28)', 2, 1);
    if (expr === 'soft') {
      px(mid - 5, 2, 'rgba(232, 134, 128, 0.22)', 2, 1);
      px(mid + 3, 2, 'rgba(232, 134, 128, 0.22)', 2, 1);
    } else if (expr === 'battle') {
      px(1, 1, 'rgba(140, 44, 46, 0.24)', w - 2, 1);
    }
    const my = spec.mouthY;
    if (expr === 'idle') {
      px(mid - 1, my, 'rgba(154, 82, 82, 0.84)', 2, 1);
      px(mid - 2, my, 'rgba(154, 82, 82, 0.36)', 1, 1);
      px(mid + 1, my, 'rgba(154, 82, 82, 0.36)', 1, 1);
      px(mid - 1, my + 1, 'rgba(184, 126, 116, 0.22)', 2, 1);
    } else if (expr === 'talk') {
      if (talkStep === 0) {
        px(mid - 1, my, 'rgba(154, 82, 82, 0.84)', 2, 1);
        px(mid - 2, my, 'rgba(154, 82, 82, 0.36)', 1, 1);
        px(mid + 1, my, 'rgba(154, 82, 82, 0.36)', 1, 1);
      } else if (talkStep === 1) {
        px(mid - 2, my, 'rgba(148, 76, 74, 0.55)', 4, 1);
        px(mid - 1, my, 'rgba(92, 42, 46, 0.88)', 2, 1);
        px(mid - 1, my + 1, 'rgba(176, 108, 102, 0.52)', 2, 1);
      } else if (talkStep === 2) {
        px(mid - 2, my, 'rgba(142, 68, 68, 0.65)', 4, 1);
        px(mid - 1, my, 'rgba(78, 34, 38, 0.92)', 2, 2);
        px(mid - 1, my + 2, 'rgba(176, 110, 104, 0.40)', 2, 1);
      } else {
        px(mid - 1, my, 'rgba(84, 38, 42, 0.90)', 2, 2);
        px(mid - 2, my, 'rgba(156, 84, 82, 0.45)', 1, 1);
        px(mid + 1, my, 'rgba(156, 84, 82, 0.45)', 1, 1);
      }
    } else if (expr === 'battle') {
      px(mid - 2, my, 'rgba(136, 62, 62, 0.85)', 4, 1);
      if (talkStep % 2 === 1) {
        px(mid - 1, my, 'rgba(246, 238, 232, 0.88)', 2, 1);
        px(mid - 2, my + 1, 'rgba(128, 56, 58, 0.78)', 4, 1);
      } else {
        px(mid - 3, my + 1, 'rgba(148, 78, 76, 0.40)', 1, 1);
        px(mid + 2, my + 1, 'rgba(148, 78, 76, 0.40)', 1, 1);
      }
    } else if (expr === 'hurt') {
      px(mid - 2, my, 'rgba(132, 58, 60, 0.88)', 4, 1);
      px(mid - 1, my, 'rgba(242, 232, 226, 0.86)', 2, 1);
      px(mid - 2, my + 1, 'rgba(92, 38, 42, 0.84)', 4, 1);
    } else {
      px(mid - 1, my, 'rgba(166, 86, 84, 0.82)', 2, 1);
      px(mid - 2, my - 1, 'rgba(166, 86, 84, 0.48)', 1, 1);
      px(mid + 1, my - 1, 'rgba(166, 86, 84, 0.48)', 1, 1);
      px(mid - 1, my + 1, 'rgba(210, 134, 126, 0.30)', 2, 1);
    }
    return;
  }

  const wide = w >= 20;
  const eyeW = wide ? 5 : (w <= 12 ? 3 : 4);
  const eyeGap = wide ? 3 : (w <= 12 ? 1 : 2);
  const leftX = mid - eyeGap - eyeW;
  const rightX = mid + eyeGap;
  const by = spec.browY, ey = spec.eyeY;

  const drawBrow = (bx: number, isRightViewer: boolean) => {
    const bc = spec.browCol;
    const thick = spec.browStyle === 'thick' || spec.browStyle === 'fierce' ? 2 : 1;
    const innerX = isRightViewer ? bx : bx + eyeW - 1;
    const outerX = isRightViewer ? bx + eyeW - 1 : bx;
    const dir = isRightViewer ? 1 : -1;
    let innerDy = 0, outerDy = 0;
    if (expr === 'battle') { innerDy = 1; outerDy = -1; }
    else if (expr === 'hurt') { innerDy = -1; outerDy = 1; }
    else if (expr === 'soft') { innerDy = -1; outerDy = 0; }
    else {
      if (spec.browStyle === 'friendly') { innerDy = -1; outerDy = 1; }
      else if (spec.browStyle === 'stern' || spec.browStyle === 'fierce' || spec.browStyle === 'sinister') { innerDy = 1; outerDy = -1; }
      else if (spec.browStyle === 'sword') { innerDy = 0; outerDy = -1; }
    }
    const talkLift = expr === 'talk' && talkStep === 2 ? -1 : 0;
    px(innerX, by + innerDy + talkLift, bc, 1, thick);
    for (let i = 1; i < eyeW - 1; i++) {
      const t = i / (eyeW - 1);
      px(innerX + dir * i, by + Math.round(innerDy + (outerDy - innerDy) * t) + talkLift, bc, 1, thick);
    }
    px(outerX, by + outerDy + talkLift, bc, 1, 1);
  };

  drawBrow(leftX, false);
  if (!spec.sleekEyepatch) drawBrow(rightX, true);

  const drawEye = (ex: number, isRightViewer: boolean) => {
    const isBlindLeft = spec.eyeStyle === 'sunao' && isRightViewer;
    const isGrimTier =
      spec.eyeStyle === 'grim' || spec.eyeStyle === 'cold' ||
      spec.eyeStyle === 'sinister' || spec.eyeStyle === 'masked' || spec.eyeStyle === 'shrewd';

    if (expr === 'hurt') {
      const c = '#261816';
      if (!isRightViewer) {
        px(ex, ey, c, 2, 1); px(ex + 2, ey + 1, c, Math.max(1, eyeW - 2), 1); px(ex, ey + 2, c, 2, 1);
      } else {
        px(ex + eyeW - 2, ey, c, 2, 1); px(ex, ey + 1, c, Math.max(1, eyeW - 2), 1); px(ex + eyeW - 2, ey + 2, c, 2, 1);
      }
      return;
    }

    if (blink === 2 || (expr === 'soft' && (spec.eyeStyle === 'bright' || spec.eyeStyle === 'shrewd' || spec.eyeStyle === 'innocent'))) {
      const lash = isBlindLeft ? '#5c4e52' : '#221614';
      if (expr === 'soft') {
        px(ex + 1, ey + 1, lash, Math.max(2, eyeW - 2), 1); px(ex, ey + 2, lash, 1, 1); px(ex + eyeW - 1, ey + 2, lash, 1, 1);
      } else {
        px(ex, ey + 1, lash, eyeW, 1);
      }
      return;
    }

    if (blink === 1) {
      px(ex, ey + 1, isBlindLeft ? '#58484c' : '#221614', eyeW, 1);
      px(ex + 1, ey + 2, isBlindLeft ? '#cdd4da' : spec.irisCol, Math.max(1, eyeW - 2), 1);
      return;
    }

    if (isGrimTier) {
      const yTop = ey;
      px(ex, yTop, 'rgba(34, 18, 16, 0.36)', eyeW, 1);
      px(ex, yTop + 1, '#1b1212', eyeW, 1);
      if (spec.eyeStyle === 'shrewd') {
        px(ex, yTop + 2, '#c8beb2', eyeW, 1);
        px(ex + Math.floor(eyeW / 2) - 1, yTop + 2, spec.irisCol, 2, 1);
        return;
      }
      const eyeH = (spec.eyeStyle === 'masked' || spec.eyeStyle === 'cold' || spec.eyeStyle === 'sinister' || expr === 'battle') ? 1 : (wide ? 2 : 1);
      const sclera = spec.eyeStyle === 'sinister' ? '#c2cac8' : (spec.eyeStyle === 'cold' ? '#c8ccd0' : '#cabdb0');
      px(ex, yTop + 2, sclera, eyeW, eyeH);
      const irisW = eyeW >= 5 ? 3 : 2;
      const irisX = ex + Math.floor((eyeW - irisW) / 2);
      px(irisX, yTop + 2, spec.irisCol, irisW, eyeH);
      px(ex, yTop + 2 + eyeH, 'rgba(116, 72, 54, 0.36)', eyeW, 1);
      return;
    }

    const lash = isBlindLeft ? '#5a4a4e' : '#221514';
    const narrow = expr === 'battle' || spec.eyeStyle === 'noble' || spec.eyeStyle === 'sunao';
    const eyeH = spec.eyeStyle === 'innocent' ? 3 : (narrow ? 2 : 3);
    const yTop = narrow ? ey + 1 : ey;
    px(ex, yTop, lash, eyeW, 1);
    if (expr === 'battle') px(isRightViewer ? ex : ex + eyeW - 1, yTop + 1, lash, 1, 1);
    px(ex, yTop + 1, isBlindLeft ? '#ece7e0' : '#faf2e6', eyeW, eyeH);
    const irisW = eyeW >= 5 ? 3 : 2;
    const irisX = ex + Math.floor((eyeW - irisW) / 2);
    if (isBlindLeft) {
      px(irisX, yTop + 1, '#cfd7de', irisW, eyeH);
      px(irisX, yTop + 1, '#f4f6f8', 1, 1);
    } else {
      px(irisX, yTop + 1, spec.irisCol, irisW, eyeH);
      if (spec.irisBounce && eyeH >= 2) px(irisX, yTop + eyeH, spec.irisBounce, irisW, 1);
      if (spec.eyeStyle === 'sunao') px(irisX, yTop + 1, '#ddd4cc', 1, 1);
      else {
        px(irisX, yTop + 1, '#ffffff', 1, 1);
        if (spec.eyeStyle === 'innocent' && irisW >= 2 && eyeH >= 3) px(irisX + irisW - 1, yTop + eyeH - 1, 'rgba(255,255,255,0.75)', 1, 1);
      }
    }
    px(ex, yTop + 1 + eyeH, 'rgba(156, 100, 78, 0.32)', eyeW, 1);
  };

  drawEye(leftX, false);
  if (!spec.sleekEyepatch) drawEye(rightX, true);

  if (spec.sleekEyepatch) {
    for (let x = 0; x <= 10; x++) {
      const sy = Math.round(1 + (x / 10) * 5);
      px(x, sy, '#19161d', 1, 1);
      px(x, sy + 1, 'rgba(60, 44, 42, 0.32)', 1, 1);
    }
    px(10, 6, '#2e2a34', 4, 1);
    px(9, 7, '#151319', 6, 3);
    px(10, 10, '#151319', 4, 1);
    px(15, 7, '#19161d', 1, 2);
    px(11, 7, '#34303c', 2, 1);
    px(12, 11, '#8c2228', 1, 1);
    px(13, 12, 'rgba(140, 34, 40, 0.65)', 1, 1);
    px(6, 6, 'rgba(128, 74, 54, 0.52)', 1, 2);
  }

  if (spec.maskedLower) return;

  px(mid, spec.noseY, 'rgba(255, 238, 220, 0.34)', 1, 1);
  px(mid - 1, spec.noseY + 1, 'rgba(156, 100, 74, 0.46)', 2, 1);

  if (spec.blushCol) {
    px(Math.max(1, leftX - 1), spec.noseY, spec.blushCol, 3, 2);
    px(Math.min(w - 4, rightX + eyeW - 2), spec.noseY, spec.blushCol, 3, 2);
  }

  spec.extraDetail?.(px, w, h, expr);

  const my = spec.mouthY;
  if (spec.beard2x && spec.beard2x !== 'none') {
    const bc = spec.beardCol ?? '#201816', bl = spec.beardColLight ?? '#3c3230';
    if (spec.beard2x === 'full_silver' || spec.beard2x === 'full_dark') {
      const sw = wide ? 3 : 2;
      px(0, my - 2, bc, sw, h - (my - 2));
      px(w - sw, my - 2, bc, sw, h - (my - 2));
      px(sw, my, bc, 1, h - my);
      px(w - sw - 1, my, bc, 1, h - my);
      px(1, my + 2, bc, w - 2, Math.max(1, h - (my + 2)));
      px(mid - 2, my + 2, bl, 4, 1);
      const mw = wide ? 6 : 4;
      px(mid - mw, my - 1, bc, mw * 2, 1);
      px(mid - mw + 1, my - 2, bl, (mw - 1) * 2, 1);
      px(mid - mw - 1, my, bc, 2, 2);
      px(mid + mw - 1, my, bc, 2, 2);
    } else if (spec.beard2x === 'trim_dark') {
      px(0, my, bc, 2, h - my);
      px(w - 2, my, bc, 2, h - my);
      px(1, my + 2, bc, w - 2, Math.max(1, h - (my + 2)));
      px(mid - 3, my - 1, bc, 6, 1);
      px(mid - 2, my - 1, bl, 4, 1);
    } else if (spec.beard2x === 'thin_sinister') {
      px(mid - 3, my - 2, bc, 2, 1); px(mid + 1, my - 2, bc, 2, 1);
      px(mid - 5, my - 1, bc, 2, 1); px(mid + 3, my - 1, bc, 2, 1);
      px(mid - 6, my - 2, bl, 1, 1); px(mid + 5, my - 2, bl, 1, 1);
    } else if (spec.beard2x === 'long_grey' || spec.beard2x === 'five_strand') {
      const mw = wide ? 5 : 4;
      px(mid - mw, my - 1, bc, mw * 2, 1);
      px(mid - mw + 1, my - 1, bl, (mw - 1) * 2, 1);
      px(mid - mw - 1, my, bc, 2, h - my);
      px(mid + mw - 1, my, bc, 2, h - my);
      px(mid - 2, my + 2, bc, 4, Math.max(1, h - (my + 2)));
    } else if (spec.beard2x === 'stubble') {
      px(1, my + 1, 'rgba(54, 38, 30, 0.30)', w - 2, Math.max(1, h - (my + 1)));
      px(mid - 3, my - 1, 'rgba(54, 38, 30, 0.24)', 6, 1);
    }
  }

  if (spec.mouthStyle !== 'none') {
    const lc = spec.lipCol;
    if (expr === 'talk') {
      if (talkStep === 0) px(mid - 2, my, lc, 4, 1);
      else if (talkStep === 1) { px(mid - 2, my, lc, 4, 1); px(mid - 1, my, '#4e2224', 2, 1); px(mid - 1, my + 1, lc, 2, 1); }
      else if (talkStep === 2) { px(mid - 2, my, lc, 4, 1); px(mid - 1, my, '#441c20', 2, 2); }
      else { px(mid - 1, my, '#4a2024', 2, 2); px(mid - 2, my, lc, 1, 1); px(mid + 1, my, lc, 1, 1); }
    } else if (expr === 'battle') {
      px(mid - 2, my, '#461e22', 4, 2); px(mid - 2, my, '#ece2d8', 4, 1);
      px(mid - 3, my + 1, lc, 1, 1); px(mid + 2, my + 1, lc, 1, 1);
    } else if (expr === 'hurt') {
      px(mid - 2, my, lc, 4, 1); px(mid - 1, my + 1, '#522224', 2, 1);
      px(mid - 3, my + 1, lc, 1, 1); px(mid + 2, my + 1, lc, 1, 1);
    } else if (expr === 'soft') {
      px(mid - 2, my + 1, lc, 4, 1); px(mid - 3, my, lc, 1, 1); px(mid + 2, my, lc, 1, 1);
    } else {
      if (spec.mouthStyle === 'smile') { px(mid - 2, my + 1, lc, 4, 1); px(mid - 3, my, lc, 1, 1); px(mid + 2, my, lc, 1, 1); }
      else if (spec.mouthStyle === 'stern' || spec.mouthStyle === 'fierce') { px(mid - 2, my, lc, 4, 1); px(mid - 3, my + 1, lc, 1, 1); px(mid + 2, my + 1, lc, 1, 1); }
      else if (spec.mouthStyle === 'smirk') { px(mid - 2, my + 1, lc, 3, 1); px(mid + 1, my, lc, 2, 1); }
      else if (spec.mouthStyle === 'dainty' || spec.mouthStyle === 'small') {
        px(mid - 1, my, lc, 2, 1); px(mid - 2, my, 'rgba(176, 86, 90, 0.35)', 1, 1); px(mid + 1, my, 'rgba(176, 86, 90, 0.35)', 1, 1);
      } else px(mid - 2, my, lc, 4, 1);
    }
  }
}

// ------------------------------------------------------------------ 100% Smooth-Normal + 100% Japanese Cel-Shading Material (RigidBatch SkinnedMesh Ready!)
let sharedActorCelMat: THREE.ShaderMaterial | null = null;

export function createActorCelMaterial(): THREE.ShaderMaterial {
  const uEmissive = { value: new THREE.Color(0, 0, 0) };
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uLightDir: ACTOR_CEL_LIGHT,
      uEmissive,
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      attribute vec3 aSmoothN;
      attribute float aSkin;
      attribute float aAo;
      varying vec3 vColor;
      varying vec3 vWorldN;
      varying vec3 vViewDir;
      varying float vSkin;
      varying float vAo;
      void main() {
        vColor = color;
        vSkin = aSkin;
        vAo = aAo;
        vec3 objectNormal = aSmoothN;
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        vec3 transformed = position;
        #include <skinning_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vWorldN = normalize(mat3(modelMatrix) * objectNormal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightDir;
      uniform vec3 uEmissive;
      varying vec3 vColor;
      varying vec3 vWorldN;
      varying vec3 vViewDir;
      varying float vSkin;
      varying float vAo;
      void main() {
        vec3 N = normalize(vWorldN);
        vec3 V = normalize(vViewDir);
        vec3 L = normalize(uLightDir);
        float ndl = dot(N, L);
        float wrap = ndl * 0.5 + 0.5;
        float band1 = smoothstep(0.36, 0.52, wrap);
        float band2 = smoothstep(0.68, 0.84, wrap);
        float lit = mix(0.64, 0.90, band1) + 0.14 * band2;
        float shadowK = 1.0 - band1;
        vec3 skinShadow = vec3(0.92, 0.68, 0.66);
        vec3 coolShadow = vec3(0.76, 0.80, 0.96);
        vec3 hueShift = mix(vec3(1.0), mix(coolShadow, skinShadow, vSkin), shadowK * 0.52);
        float aoFactor = mix(vAo, mix(1.0, vAo, 0.22), vSkin);
        float skyBounce = (N.y * 0.5 + 0.5) * 0.08;
        float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
        float rimMask = smoothstep(0.38, 0.72, fres) * smoothstep(-0.2, 0.55, ndl + 0.35);
        vec3 rimCol = mix(vec3(0.86, 0.92, 1.0), vec3(1.0, 0.93, 0.86), vSkin);
        vec3 base = vColor * hueShift * (lit * aoFactor + skyBounce);
        base += vColor * (0.07 * vSkin);
        base += rimCol * (rimMask * (0.18 + 0.08 * (1.0 - vSkin)));
        base += uEmissive;
        gl_FragColor = vec4(base, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    vertexColors: true,
  });
  mat.userData.uEmissive = uEmissive;
  return mat;
}

function baseActorCelMat(): THREE.ShaderMaterial {
  if (!sharedActorCelMat) sharedActorCelMat = createActorCelMaterial();
  return sharedActorCelMat;
}

const DIRS: Array<[number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACE_VERTS: number[][][] = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const TAN_UV: Array<[[number, number, number], [number, number, number]]> = [
  [[0, 1, 0], [0, 0, 1]], [[0, 1, 0], [0, 0, -1]], [[1, 0, 0], [0, 0, -1]],
  [[1, 0, 0], [0, 0, 1]], [[1, 0, 0], [0, 1, 0]], [[-1, 0, 0], [0, 1, 0]],
];
const CORNER_S: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const AO_VALS = [1.0, 0.88, 0.76, 0.64];
const vKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
const cellKey = (x: number, y: number, z: number) => ((x + 256) * 512 + (y + 256)) * 512 + (z + 256);

/**
 * Build a live-game humanoid rig with 0% corner deformation, 100% smooth averaged vertex normals,
 * 100% Japanese cel shading (1 shared RigidBatch-ready material + glowMat for emissive cells),
 * plus a reusable `faceFactory` that attaches a lightweight per-instance animated 2× face decal!
 */
export function buildSmoothCelRig(
  vc: VoxChar,
  faceSpec: CharFaceSpec | null,
  o: { glow?: number } = {},
) {
  const s = vc.s;
  const bones: Record<string, Bone> = {};
  for (const [name, b] of vc.bonesAbs) {
    const o3 = new THREE.Object3D() as Bone;
    o3.name = name;
    const par = b.parent ? vc.bonesAbs.get(b.parent)!.p : new THREE.Vector3();
    o3.position.copy(b.p).sub(par).multiplyScalar(s);
    bones[name] = o3;
  }
  for (const [name, b] of vc.bonesAbs) if (b.parent) bones[b.parent].add(bones[name]);

  const allOcc = new Set<number>();
  const byPart = new Map<string, Array<{ x: number; y: number; z: number; c: number; g: number }>>();
  for (const c of vc.cells.values()) {
    allOcc.add(cellKey(c.x, c.y, c.z));
    let arr = byPart.get(c.part);
    if (!arr) { arr = []; byPart.set(c.part, arr); }
    arr.push({ x: c.x, y: c.y, z: c.z, c: c.c, g: c.g });
  }
  const occ = (x: number, y: number, z: number) => allOcc.has(cellKey(x, y, z));

  const tmpCol = new THREE.Color();
  const meshes: THREE.Mesh[] = [];
  const matSolid = baseActorCelMat();
  const matGlow = glowMat(o.glow ?? 1.35);
  let headSmoothNorms: Map<string, [number, number, number]> | null = null;

  for (const [part, list] of byPart) {
    const bp = vc.bonesAbs.get(part)!.p;
    const partOcc = new Set<number>();
    for (const c of list) partOcc.add(cellKey(c.x, c.y, c.z));
    const hasInPart = (x: number, y: number, z: number) => partOcc.has(cellKey(x, y, z));

    interface Quad {
      verts: Array<[number, number, number]>;
      n: [number, number, number];
      col: [number, number, number];
      skin: number;
      aos: number[];
      glow: boolean;
    }
    const quads: Quad[] = [];
    const normSum = new Map<string, [number, number, number]>();

    for (const c of list) {
      tmpCol.setHex(c.c);
      const col: [number, number, number] = [tmpCol.r, tmpCol.g, tmpCol.b];
      const skin = (isWarmSkin(c.c) || isPaleOrFrostSkin(c.c)) ? 1.0 : 0.0;
      const isGlow = c.g > 0;
      for (let d = 0; d < 6; d++) {
        const [dx, dy, dz] = DIRS[d];
        if (hasInPart(c.x + dx, c.y + dy, c.z + dz)) continue;
        const fv = FACE_VERTS[d];
        const [tu, tv] = TAN_UV[d];
        const verts: Array<[number, number, number]> = [];
        const aos: number[] = [];
        for (let i = 0; i < 4; i++) {
          const vx = c.x + fv[i][0], vy = c.y + fv[i][1], vz = c.z + fv[i][2];
          verts.push([vx, vy, vz]);
          const k = vKey(vx, vy, vz);
          let acc = normSum.get(k);
          if (!acc) { acc = [0, 0, 0]; normSum.set(k, acc); }
          acc[0] += dx; acc[1] += dy; acc[2] += dz;
          const [su, sv] = CORNER_S[i];
          const nx = c.x + dx, ny = c.y + dy, nz = c.z + dz;
          const s1 = occ(nx + tu[0] * su, ny + tu[1] * su, nz + tu[2] * su) ? 1 : 0;
          const s2 = occ(nx + tv[0] * sv, ny + tv[1] * sv, nz + tv[2] * sv) ? 1 : 0;
          const cr = s1 && s2 ? 1 : (occ(nx + tu[0] * su + tv[0] * sv, ny + tu[1] * su + tv[1] * sv, nz + tu[2] * su + tv[2] * sv) ? 1 : 0);
          aos.push(AO_VALS[s1 + s2 + cr]);
        }
        quads.push({ verts, n: [dx, dy, dz], col, skin, aos, glow: isGlow });
      }
    }
    if (!quads.length) continue;

    for (const acc of normSum.values()) {
      const len = Math.hypot(acc[0], acc[1], acc[2]) || 1;
      acc[0] /= len; acc[1] /= len; acc[2] /= len;
    }
    if (part === 'head') headSmoothNorms = normSum;

    // Pack solid & glow quads separately (glow uses glowMat just like VoxChar.build!)
    const P: number[] = [], N: number[] = [], C: number[] = [], SN: number[] = [], SK: number[] = [], AO: number[] = [], I: number[] = [];
    const GP: number[] = [], GN: number[] = [], GC: number[] = [], GI: number[] = [];
    for (const q of quads) {
      if (q.glow) {
        const base = GP.length / 3;
        for (let i = 0; i < 4; i++) {
          const [vx, vy, vz] = q.verts[i];
          GP.push((vx - bp.x) * s, (vy - bp.y) * s, (vz - bp.z) * s);
          GN.push(q.n[0], q.n[1], q.n[2]);
          GC.push(q.col[0], q.col[1], q.col[2]);
        }
        GI.push(base, base + 1, base + 2, base, base + 2, base + 3);
      } else {
        const base = P.length / 3;
        for (let i = 0; i < 4; i++) {
          const [vx, vy, vz] = q.verts[i];
          const sn = normSum.get(vKey(vx, vy, vz))!;
          P.push((vx - bp.x) * s, (vy - bp.y) * s, (vz - bp.z) * s);
          N.push(q.n[0], q.n[1], q.n[2]);
          SN.push(sn[0], sn[1], sn[2]);
          C.push(q.col[0], q.col[1], q.col[2]);
          SK.push(q.skin);
          AO.push(q.aos[i]);
        }
        I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }

    if (I.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      geo.setAttribute('aSmoothN', new THREE.Float32BufferAttribute(SN, 3));
      geo.setAttribute('aSkin', new THREE.Float32BufferAttribute(SK, 1));
      geo.setAttribute('aAo', new THREE.Float32BufferAttribute(AO, 1));
      geo.setIndex(I);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, matSolid);
      mesh.castShadow = true;
      mesh.name = part;
      bones[part].add(mesh);
      meshes.push(mesh);
    }
    if (GI.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(GP, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(GN, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(GC, 3));
      geo.setIndex(GI);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, matGlow);
      mesh.name = part + '_glow';
      bones[part].add(mesh);
      meshes.push(mesh);
    }
  }

  for (const b of Object.values(bones)) b.rest = { p: b.position.clone(), r: b.rotation.clone(), s: b.scale.clone() };

  // Pre-build reusable conformal face geometry once on the template; each spawned actor gets its own animated 16×18 canvas!
  let faceFactory: FaceFactory | undefined;
  const headAbs = vc.bonesAbs.get('head');
  if (faceSpec && headAbs && headSmoothNorms) {
    const spanX = faceSpec.x1 - faceSpec.x0;
    const spanY = faceSpec.y1 - faceSpec.y0;
    const FP: number[] = [], FSN: number[] = [], FUV: number[] = [], FI: number[] = [];
    const corners: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let x = faceSpec.x0; x < faceSpec.x1; x++) {
      for (let y = faceSpec.y0; y < faceSpec.y1; y++) {
        const cell = vc.get(x, y, faceSpec.zFace - 1);
        if (!cell || cell.part !== 'head') continue;
        if (vc.get(x, y, faceSpec.zFace)?.part === 'head') continue;
        const base = FP.length / 3;
        for (const [ox, oy] of corners) {
          const vx = x + ox, vy = y + oy, vz = faceSpec.zFace;
          const sn = headSmoothNorms.get(vKey(vx, vy, vz));
          FP.push((vx - headAbs.p.x) * s, (vy - headAbs.p.y) * s, (vz - headAbs.p.z) * s);
          FSN.push(sn ? sn[0] : 0, sn ? sn[1] : 0, sn ? sn[2] : 1);
          FUV.push((vx - faceSpec.x0) / spanX, (vy - faceSpec.y0) / spanY);
        }
        FI.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    if (FI.length) {
      const sharedGeo = new THREE.BufferGeometry();
      sharedGeo.setAttribute('position', new THREE.Float32BufferAttribute(FP, 3));
      sharedGeo.setAttribute('aSmoothN', new THREE.Float32BufferAttribute(FSN, 3));
      sharedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(FUV, 2));
      sharedGeo.setIndex(FI);
      const cw = spanX * 2, ch = spanY * 2;
      const specRef = faceSpec;

      faceFactory = (actorBones: Record<string, Bone>): FaceAnimHandle | null => {
        const hb = actorBones.head;
        if (!hb) return null;
        let cv: HTMLCanvasElement;
        let ctx: CanvasRenderingContext2D | null;
        try {
          cv = makeCanvas(cw, ch) as HTMLCanvasElement;
          cv.width = cw; cv.height = ch;
          ctx = cv.getContext('2d');
        } catch {
          return null; // Headless Node Vitest without DOM canvas
        }
        if (!ctx) return null;
        const tex = new THREE.CanvasTexture(cv);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;

        const mat = new THREE.ShaderMaterial({
          uniforms: {
            uMap: { value: tex },
            uLightDir: ACTOR_CEL_LIGHT,
          },
          vertexShader: /* glsl */ `
            attribute vec3 aSmoothN;
            varying vec2 vUv;
            varying vec3 vWorldN;
            void main() {
              vUv = uv;
              vec3 nLocal = normalize(aSmoothN);
              vec3 pos = position + nLocal * 0.0024;
              vec4 wp = modelMatrix * vec4(pos, 1.0);
              vWorldN = normalize(mat3(modelMatrix) * nLocal);
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `,
          fragmentShader: /* glsl */ `
            uniform sampler2D uMap;
            uniform vec3 uLightDir;
            varying vec2 vUv;
            varying vec3 vWorldN;
            void main() {
              vec4 texel = texture2D(uMap, vUv);
              if (texel.a < 0.04) discard;
              vec3 N = normalize(vWorldN);
              vec3 L = normalize(uLightDir);
              float wrap = dot(N, L) * 0.5 + 0.5;
              float band1 = smoothstep(0.36, 0.52, wrap);
              float band2 = smoothstep(0.68, 0.84, wrap);
              float lit = mix(0.64, 0.90, band1) + 0.14 * band2;
              float shadowK = 1.0 - band1;
              vec3 hueShift = mix(vec3(1.0), vec3(0.92, 0.68, 0.66), shadowK * 0.45);
              gl_FragColor = vec4(texel.rgb * hueShift * (lit + 0.06), texel.a);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }
          `,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });

        const mesh = new THREE.Mesh(sharedGeo, mat);
        mesh.name = 'face2x';
        mesh.userData.noBatch = true;
        mesh.renderOrder = OCC_ORDER.body + 1;
        hb.add(mesh);

        const blinkOffset = Math.random() * 3.0;
        const TALK_SEQ = [1, 2, 1, 3, 2, 0, 1, 2, 0, 1, 3, 1];
        let lastKey = '';

        const update = (t: number, expr: FaceExpr) => {
          let blink = 0;
          if (expr === 'idle' || expr === 'talk') {
            const cyc = (t + blinkOffset) % 3.6;
            if (cyc > 3.44 && cyc < 3.48) blink = 1;
            else if (cyc >= 3.48 && cyc < 3.55) blink = 2;
            else if (cyc >= 3.55 && cyc < 3.59) blink = 1;
          }
          const talkStep = expr === 'talk'
            ? TALK_SEQ[Math.floor(t * 7.5) % TALK_SEQ.length]
            : (expr === 'battle' ? (Math.floor(t * 1.4) % 2) : 0);
          const key = `${expr}|${blink}|${talkStep}`;
          if (key === lastKey) return;
          lastKey = key;
          paintFaceFrame(ctx!, cw, ch, specRef, expr, blink, talkStep);
          tex.needsUpdate = true;
        };
        update(0, 'idle');

        return {
          update,
          dispose: () => {
            hb.remove(mesh);
            tex.dispose();
            mat.dispose();
          },
        };
      };
    }
  }

  return { bones, meshes, root: bones.root, faceFactory };
}
