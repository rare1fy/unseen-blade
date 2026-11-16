// R6 骰面：六个面都写方正像素数字（UX_V3 §6b；用户：「怎么点数和数字都同时存在啊」→ 只留数字一种写法）。
// 一面 = T×T 个美术像素（战场骰 T = 24，1 texel = 1 美术像素，nearest 采样不平滑）。平涂 4 档：边缘 1 格高光（骰子的倒角几何
// 采样的正是这一圈，倒角跟着变亮）、本体、刻痕投影、墨色数字。数字用 ui3d/pixDigits 的 5×7 粗体（笔画 2 格），T = 24 时每个字格
// 占 2×2 texel（高 14 / 24，超过面高一半），右下错 1 格刻痕投影。
// 特殊骰（怒火 / 泰坦 / 星辰 / 暗影残骰 / 金骰）：身体色 + 2 圈阶梯发光边框（亮→本色，自发光逐圈减弱），浅色数字（金骰深色），
// 数值面右上角 5×5 小效果图标。emissive 画布（eg）与反照率同坐标：普通骰本体灰（die3d.ts 用它把选中 / 留场 / 凝出的光色染进
// 骰身，数字保持黑），特殊骰只有边框、数字和图标发光。
// HUD 小骰子（重投按钮旁绕转、无牌型时的缩影）用同一个函数画：paintNumeralFace(pen.g, 设备像素 x, y, 格数, 点数, { px: GRID.u })，
// 或 numeralFaceTexture() 拿一张现成的贴图。
import type * as THREE from 'three';
import { canvasTex } from '../engine/world';
import { DIGITS, DIGIT_H, digitsW, eachDigitCell } from '../ui3d/pixDigits';
import { SPECIALS, type SpecialId } from '../ui3d/suitData';

/** 战场骰每面的美术像素数 */
export const NUM_T = 24;

export interface NumFacePal {
  /** 边缘高光圈（由外向内，1 圈 = 1 格）、本体、刻痕投影、数字墨色 */
  rings: string[]; body: string; shade: string; ink: string;
  /** emissive：边框各圈、本体、数字（'#000' = 不发光） */
  eRings: string[]; eBody: string; eInk: string;
  /** 角标图标色（特殊骰） */
  mark: string; eMark: string;
}

export interface NumFaceOpts {
  /** GROWTH_V5 §4: the carved suit on this face (null = none) */
  carve?: 'fire' | 'ice' | 'gold' | null;
  /** 每个面格（texel / 美术像素）占几个设备像素，默认 1（贴图）；HUD 上传 GRID.u */
  px?: number;
  /** 特殊骰：身体色 + 阶梯发光框 + 浅色数字 */
  special?: SpecialId | null;
  /** 同坐标的 emissive 画布（3D 骰子用）；HUD 平面图不用传 */
  eg?: CanvasRenderingContext2D | null;
  /** 画特殊骰的小效果图标（数值面右上角） */
  mark?: boolean;
  /** dim = 灰掉（不可用 / 虚影缩略图） */
  tone?: 'normal' | 'dim';
  /** 单项覆盖调色 */
  pal?: Partial<NumFacePal>;
  /** 数字字格倍数（默认按 T 自动：24 → 2，12～22 → 1，34 → 3） */
  scale?: number;
}

const hex = (h: string) => parseInt(h.slice(1), 16);
export function mixCss(a: string, b: string, k: number) {
  const pa = hex(a), pb = hex(b), ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}
const lum = (h: string) => { const p = hex(h); return (((p >> 16) & 255) * 0.3 + ((p >> 8) & 255) * 0.59 + (p & 255) * 0.11) / 255; };

/** 5×5 角标图标：怒火 = 火苗，星辰 = 四芒星，暗影残骰 = 骷髅；泰坦、金骰不带 */
const MARK: Partial<Record<SpecialId, string[]>> = {
  fury: ['.#...', '.##.#', '.####', '#####', '.###.'],
  starry: ['..#..', '..#..', '#####', '..#..', '..#..'],
  shadowres: ['.###.', '#####', '#.#.#', '#####', '.#.#.'],
};

/** 普通骰 / 特殊骰 / 灰掉 的调色板（4 档平涂） */
export function numFacePal(o: Pick<NumFaceOpts, 'special' | 'tone' | 'pal'> = {}): NumFacePal {
  const sp = o.special ? SPECIALS[o.special] : null;
  let P: NumFacePal;
  if (!sp) {
    const body = '#ebe5d6';
    P = { rings: ['#fffaf0'], body, shade: mixCss(body, '#5e5444', 0.45), ink: '#161a28', eRings: ['#5c5c5c'], eBody: '#5c5c5c', eInk: '#000000', mark: '#000000', eMark: '#000000' };
  } else {
    const body = mixCss(sp.body, '#000000', 0.05), light = lum(body) > 0.4;
    P = {
      rings: [mixCss(sp.glow, '#ffffff', 0.35), sp.glow], body,
      shade: light ? mixCss(body, '#3a2008', 0.5) : mixCss(body, '#000000', 0.6),
      ink: light ? '#2e1a08' : '#fff4e0',
      eRings: [mixCss(sp.glow, '#000000', 0.4), mixCss(sp.glow, '#000000', 0.66)], eBody: '#000000',
      eInk: light ? '#000000' : mixCss(sp.glow, '#000000', 0.62),
      mark: mixCss(sp.glow, '#ffffff', 0.2), eMark: sp.glow,
    };
  }
  if (o.tone === 'dim') {
    // toward a slightly cool grey of the same lightness, squeezed toward the middle (less contrast = reads as "not available")
    const grey = (c: string, k = 0.75) => { const l = Math.round(lum(c) * 150 + 45), v = (n: number) => Math.min(255, n).toString(16).padStart(2, '0'); return mixCss(c, '#' + v(l) + v(l) + v(l + 10), k); };
    P = { ...P, rings: P.rings.map(c => grey(c)), body: grey(P.body), shade: grey(P.shade), ink: grey(P.ink, 0.5), mark: grey(P.mark), eRings: P.rings.map(() => '#000000'), eInk: '#000000', eMark: '#000000' };
  }
  return { ...P, ...(o.pal || {}) };
}

/** 数字字格倍数：在边框内留出 ≥ 1 格空隙，且高度（7 格 + 1 格投影）不超出 */
export function numScale(T: number, txt = '6', frame = 2) {
  const room = T - 2 * frame - 2;
  return Math.max(1, Math.min(Math.floor((room - 1) / DIGIT_H), Math.floor((room - 1) / Math.max(1, digitsW(txt)))));
}

/**
 * 画一个数字骰面：g 上 (x, y)（设备像素）起 T×T 格，每格 px 个设备像素。value 可以是 1～6 或任意 pixDigits 能写的短串。
 * 外圈 1 格高光（特殊骰 2 圈阶梯发光），本体平涂，居中一个粗体方正数字 + 右下 1 格刻痕投影；特殊骰的数值面右上角加小图标。
 */
/** GROWTH_V5 §4 carved suits: a 6×6 axis-aligned mark (fire = flame, ice = cross, gold = coin), its colour and emissive */
const CARVE_MARK: Record<string, { rows: string[]; c: string; e: string }> = {
  fire: { rows: ['..#...', '.##...', '.###.#', '######', '######', '.####.'], c: '#ff6a2a', e: '#b83a08' },
  ice: { rows: ['..##..', '..##..', '######', '######', '..##..', '..##..'], c: '#7ad8ff', e: '#2a84b0' },
  gold: { rows: ['.####.', '######', '##..##', '##..##', '######', '.####.'], c: '#ffcc40', e: '#a87a10' },
};
export function paintNumeralFace(g: CanvasRenderingContext2D, x: number, y: number, T: number, value: number | string, o: NumFaceOpts = {}) {
  const px = o.px ?? 1, P = numFacePal(o), eg = o.eg || null, txt = String(value);
  const R = (ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, col: string) => { if (w <= 0 || h <= 0) return; ctx.fillStyle = col; ctx.fillRect(x + cx * px, y + cy * px, w * px, h * px); };
  const ring = (ctx: CanvasRenderingContext2D, i: number, col: string) => { const n = T - 2 * i; R(ctx, i, i, n, 1, col); R(ctx, i, T - 1 - i, n, 1, col); R(ctx, i, i + 1, 1, n - 2, col); R(ctx, T - 1 - i, i + 1, 1, n - 2, col); };
  g.imageSmoothingEnabled = false;
  R(g, 0, 0, T, T, P.body); P.rings.forEach((c, i) => ring(g, i, c));
  if (eg) { R(eg, 0, 0, T, T, P.eBody); P.eRings.forEach((c, i) => ring(eg, i, c)); }
  // the numeral: ink cells s×s, the carved shade one texel down-right (only where the ink does not cover it)
  const fr = P.rings.length, s = o.scale ?? numScale(T, txt, Math.max(2, fr)), w = digitsW(txt) * s, h = DIGIT_H * s;
  const x0 = Math.floor((T - w - 1) / 2), y0 = Math.floor((T - h - 1) / 2);
  eachDigitCell(txt, (i, j) => R(g, x0 + i * s + 1, y0 + j * s + 1, s, s, P.shade));
  eachDigitCell(txt, (i, j) => R(g, x0 + i * s, y0 + j * s, s, s, P.ink));
  if (eg) eachDigitCell(txt, (i, j) => R(eg, x0 + i * s, y0 + j * s, s, s, P.eInk));
  // GROWTH_V5 §4: a carved suit, top-left inside the frame (a 1-texel ink plate under it so it reads on the light body)
  const cm = o.carve ? CARVE_MARK[o.carve] : null;
  if (cm && T >= 18) {
    const fr2 = P.rings.length, mx = fr2, my = fr2;
    R(g, mx - 1, my - 1, 8, 8, P.ink); if (eg) R(eg, mx - 1, my - 1, 8, 8, '#000');
    cm.rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') { R(g, mx + i, my + j, 1, 1, cm.c); if (eg) R(eg, mx + i, my + j, 1, 1, cm.e); } });
  }
  // the special die's small effect icon, top-right inside the frame
  const m = o.mark && o.special ? MARK[o.special] : null;
  if (m && T >= 20) {
    const mx = T - fr - m[0].length, my = fr;
    m.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') { R(g, mx + i, my + j, 1, 1, P.mark); if (eg) R(eg, mx + i, my + j, 1, 1, P.eMark); } });
  }
}

/** 是否所有字符都能用方正数字写 */
export const numeralOk = (v: number | string) => [...String(v)].every(ch => ch in DIGITS);

// ---------------------------------------------------------------- ready-made textures (HUD mini dice, thumbnails)
const texCache = new Map<string, THREE.CanvasTexture>();
/** 一张 T×T 的数字骰面贴图（nearest、sRGB、按参数缓存，别 dispose 共享的贴图）。普通 BoxGeometry 小骰：
 *  [3, 4, 2, 5, 1, 6].map(v => new THREE.MeshToonMaterial({ map: numeralFaceTexture(v) })) */
export function numeralFaceTexture(value: number | string, o: Omit<NumFaceOpts, 'eg' | 'px'> & { T?: number } = {}) {
  const T = o.T ?? 16, key = [value, T, o.special || '', o.tone || '', o.mark ? 1 : 0, o.scale || 0, JSON.stringify(o.pal || {})].join('|');
  let t = texCache.get(key);
  if (!t) { t = canvasTex(T, T, g => paintNumeralFace(g, 0, 0, T, value, o), { nearest: true }); texCache.set(key, t); }
  return t;
}
