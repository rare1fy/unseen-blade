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
import { makeCanvas } from '../../platform/index';

export type CardStyle = 'boon' | 'manual' | 'forge' | 'medic' | 'meal';
/** the board's height in units of its width */
export const CARD_H = 0.24;
interface Metal { d: number; m: number; l: number; glow: number }
const METAL: Metal[] = [
  { d: 0x1c1e24, m: 0x3c4049, l: 0x6c727e, glow: 0xb0c0d8 },   // iron
  { d: 0x553714, m: 0x96662c, l: 0xd29a4a, glow: 0xffb060 },   // bronze
  { d: 0x6e5014, m: 0xc0902a, l: 0xffd86a, glow: 0xffd060 },   // gold
];
/** the other kinds of card: bamboo-and-wood for 刀谱 and meals, iron and ember for the smith, jade for the healer */
const STYLE_METAL: Record<Exclude<CardStyle, 'boon'>, Metal> = {
  manual: { d: 0x3a2814, m: 0x6e5030, l: 0xb08850, glow: 0xffd890 },
  meal: { d: 0x3a2814, m: 0x6e5030, l: 0xb08850, glow: 0xffd890 },
  forge: { d: 0x1c1e24, m: 0x3c4049, l: 0x6c727e, glow: 0xff9040 },
  medic: { d: 0x1e3a2c, m: 0x3e7a5a, l: 0x86c8a0, glow: 0x9af0c0 },
};
const PANEL: Record<CardStyle, [number, number]> = { boon: [LACQ, LACQ_L], manual: [0x2c2216, 0x3a2c1c], meal: [0x2c2216, 0x3a2c1c], forge: [0x221e1e, 0x2e2828], medic: [0x16221c, 0x1e2e26] };
const RIVET = 0xb07a3a, RIVET_D = 0x6a4622;
export const TIER_TXT = ['#d8d2c6', '#f0b870', '#ffe08a'];
const NAME_TXT = ['#efe6d2', '#ffd8a0', '#fff0c0'];

// the layout in board units (width 1, height CARD_H, front toward +z)
/** 11-18 (用户：「强化卡片也难以辨认都是干嘛的」): the skill cards are taller — the icon on the left, the name, the presses and the effect on
 *  the right (three rows); the hideout's lists keep the short board */
export const SKILL_H = 0.3;
export function boardLayout(H: number) {
  const SOCK = H - 0.072, SX = -0.5 + FR + 0.018 + SOCK / 2, DIV = SX + SOCK / 2 + 0.02;
  return { H, SOCK, SX, DIV, FACE: { x0: DIV + 0.016, x1: 0.5 - FR - 0.012, h: H - 2 * FR - 0.014 }, SOCKET: { x: SX, y: 0, size: SOCK } };
}
const FR = 0.024;
const H = CARD_H, SOCK = H - 0.072, SX = -0.5 + FR + 0.018 + SOCK / 2, DIV = SX + SOCK / 2 + 0.02;
/** the face (text) area on the lacquer: left edge, right edge, height */
export const FACE = { x0: DIV + 0.016, x1: 0.5 - FR - 0.012, h: H - 2 * FR - 0.014 };

/** the board itself: one merged mesh (vertex colours), its emissive used for the focus glow; Hh = the board's height (CARD_H / SKILL_H) */
export function cardBoard(style: CardStyle, tier: number, Hh = CARD_H, skill = false) {
  const M = style === 'boon' ? METAL[Math.max(0, Math.min(2, tier))] : STYLE_METAL[style], [pc, pl] = PANEL[style];
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
/** one line in the body font: the key words lit behind their icons, the numbers white; returns its width (draw = false only measures);
 *  keys = false: no key words (the small numbers line stays plain) */
export function richLine(g: CanvasRenderingContext2D | null, line: string, x: number, y: number, px: number, base: string, numCol = '#ffffff', keys = true) {
  let i = 0, cx = x, plain = '';
  const flush = () => { if (!plain) return; if (g) bodyText(g, plain, cx, y, px, base, 'left'); cx += bodyW(plain, px); plain = ''; };
  while (i < line.length) {
    const rest = line.slice(i), k = keys ? KEYS.find(([w]) => rest.startsWith(w)) : undefined;
    if (k) {
      flush(); const c = Math.max(1, Math.round(px / 9)), iw = 7 * c;
      if (g) icon(g, MINI[k[1]], cx + 1, y + Math.round((px - iw) / 2) + 1, c, { main: k[2], acc: '#ffffff' }); cx += iw + Math.round(px * 0.18);
      if (g) bodyText(g, k[0], cx, y, px, k[2], 'left'); cx += bodyW(k[0], px); i += k[0].length; continue;
    }
    const n = rest.match(NUM);
    if (n && (i === 0 || !/[一二三四五六七八九十]/.test(line[i - 1]))) { flush(); if (g) bodyText(g, n[1], cx, y, px, numCol, 'left'); cx += bodyW(n[1], px); i += n[1].length; continue; }
    plain += line[i]; i++;
  }
  flush();
  return cx - x;
}
export interface FaceSpec { name: string; tag: string; desc: string[]; tier: number; style: CardStyle }
/** paint the face for an on-screen size of w × h CSS px (the text area), at the screen's device pixels */
export function paintFace(f: FaceSpec, w: number, h: number, dpr: number) {
  const W = Math.max(8, Math.round(w * dpr)), Hh = Math.max(8, Math.round(h * dpr)), c = makeCanvas(W, Hh), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  // the name: the pixel font, a whole number of device px a font pixel, about a third of the face's height
  const S = Math.max(1, Math.floor(Hh * 0.3 / PIX_H)), nameCol = f.style === 'boon' ? NAME_TXT[f.tier] ?? NAME_TXT[0] : '#f4e6c8';
  drawPix(g, f.name, Math.round(2 * dpr), Math.round(Hh * 0.05), { scale: S, color: nameCol, outline: '#0a0708', align: 'left' });
  // the tier tag after it: small pixel letters in a recessed slot of the tier's metal colour
  if (f.tag) {
    const s2 = Math.max(1, Math.round(S / 2)), tw = pixW(f.tag) * s2, tx = Math.round(2 * dpr + pixW(f.name) * S + 10 * dpr), ty = Math.round(Hh * 0.05 + (PIX_H * S - PIX_H * s2) / 2);
    const tc = f.style === 'boon' ? TIER_TXT[f.tier] ?? TIER_TXT[0] : '#e0c890', pad = Math.max(2, s2 * 3);
    g.fillStyle = tc; g.fillRect(tx - pad, ty - pad, tw + pad * 2, PIX_H * s2 + pad * 2);
    g.fillStyle = '#0d0a0b'; g.fillRect(tx - pad + s2, ty - pad + s2, tw + pad * 2 - 2 * s2, PIX_H * s2 + pad * 2 - 2 * s2);
    drawPix(g, f.tag, tx, ty, { scale: s2, color: tc, outline: null, align: 'left' });
  }
  // two lines of description (the HD body font, key words lit behind their icons, numbers white)
  const px = Math.round(Hh * 0.2), y0 = Math.round(Hh * 0.05 + PIX_H * S + Hh * 0.08);
  f.desc.slice(0, 2).forEach((l, i) => richLine(g, l, Math.round(2 * dpr), y0 + i * Math.round(px * 1.32), px, '#e6ddd0'));
  const t = new THREE.CanvasTexture(c as HTMLCanvasElement); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
