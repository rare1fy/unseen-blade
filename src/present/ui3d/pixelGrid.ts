// R6 高清像素规范（UX_V3 §6b）：UI 美术画在统一的「美术像素」格子上。1280×720 参考下 1 美术像素 = 3 参考像素；运行时
// u = 取整(3 × 屏幕高(设备像素) / 720) 个设备像素，保证每个美术像素边缘落在整数屏幕像素上。所有 UI 美术（按钮石面、槽、灯、胶囊、
// 图标、字）都按 u 的整数倍画：只走横平竖直或正 45°（1:1 台阶），2～4 档平涂明暗，1u 描边、1u 高光、1～2u 倒角，发光是阶梯圈。
// 这里还有 UI 层颜色换算：UI 层整体过 ACES + sRGB（look/uiPass.ts），uiCol() 反解出线性值，使屏幕上看到的正好是设计的十六进制色。
import * as THREE from 'three';

export const GRID = {
  /** 设备像素 / 美术像素（整数） */
  u: 3,
  dpr: 1,
  /** CSS 像素 / 美术像素（= u / dpr） */
  uc: 3,
  /** CSS 像素 / 参考像素，美术尺寸用（= uc / 3；布局位置仍用 hud 的 k） */
  ka: 1,
  /** 屏幕（CSS）高 */
  h: 720,
};

/** 按屏幕高（CSS 像素，已扣安全区）和 dpr 定 u */
export function setGrid(hCss: number, dpr: number) {
  const u = Math.max(1, Math.round((3 * hCss * dpr) / 720));
  GRID.u = u; GRID.dpr = dpr; GRID.uc = u / dpr; GRID.ka = GRID.uc / 3; GRID.h = hCss;
  return GRID;
}
/** n 个美术像素 → CSS 像素 */
export const ap = (n: number) => n * GRID.uc;
/** 参考像素 → 美术像素（取整） */
export const cellsOf = (ref: number) => Math.max(1, Math.round(ref / 3));
/** CSS 像素对齐到设备像素 */
export const snapPx = (x: number) => Math.round(x * GRID.dpr) / GRID.dpr;
/** CSS 像素对齐到美术格（以 origin 为格点） */
export const snapCell = (x: number, origin = 0) => origin + Math.round((x - origin) / GRID.uc) * GRID.uc;

// ---------------------------------------------------------------- colours
const hexRGB = (h: number) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** ACES 拟合曲线的反函数（look/uiPass.ts 用的那条） */
function acesInv(y: number) {
  y = Math.min(0.985, Math.max(0, y)); if (y <= 0) return 0;
  const A = 2.43 * y - 2.51, B = 0.59 * y - 0.03, C = 0.14 * y, d = B * B - 4 * A * C;
  return (-B - Math.sqrt(Math.max(0, d))) / (2 * A);
}
/** UI 泛光阈值（UI_LOOK.bloomThreshold 1.4）以下留一点余量：不发光的颜色亮度封顶 */
const NO_BLOOM = 1.25;
/** 设计色（sRGB 十六进制）→ UI 层材质的线性颜色；glow > 1 = 乘上去进泛光 */
export function uiCol(hex: number, glow = 1, out = new THREE.Color()) {
  const [r, g, b] = hexRGB(hex).map(c => acesInv(toLin(c)));
  let k = 1; const lum = r * 0.299 + g * 0.587 + b * 0.114;
  if (glow <= 1 && lum > NO_BLOOM) k = NO_BLOOM / lum;
  return out.setRGB(r * k * glow, g * k * glow, b * k * glow);
}
/** 两个十六进制色按 t 混合（sRGB 空间，像素画调色用） */
export function mixHex(a: number, b: number, t: number) {
  const A = hexRGB(a), B = hexRGB(b), ch = (i: number) => Math.round((A[i] + (B[i] - A[i]) * t) * 255);
  return (ch(0) << 16) | (ch(1) << 8) | ch(2);
}
export const cssHex = (h: number) => '#' + h.toString(16).padStart(6, '0');
/** 一组平涂色阶：[高光, 本色, 暗一档, 暗两档, 暗三档]（侧面 = 本色往暗走两档） */
export function ramp(base: number, o: { hi?: number; dark?: number } = {}) {
  const dk = o.dark ?? 0x0a0612;
  return [o.hi ?? mixHex(base, 0xffffff, 0.35), base, mixHex(base, dk, 0.28), mixHex(base, dk, 0.5), mixHex(base, dk, 0.7)];
}

// ---------------------------------------------------------------- the shared palette (克制的深色 + 只给可操作的东西金色)
export const PAL = {
  ink: 0x0a0710,          // 1u 描边
  stone: ramp(0x3a3646, { hi: 0x58546a }),
  stoneDark: ramp(0x24212e, { hi: 0x363244 }),
  face: ramp(0x2c2838, { hi: 0x3e3a4e }),
  gold: ramp(0xd8a038, { hi: 0xffe08a, dark: 0x2a1404 }),
  goldHot: ramp(0xffb428, { hi: 0xfff0b0, dark: 0x3a1800 }),
  iron: ramp(0x6a6678, { hi: 0x9a96aa }),
  dead: ramp(0x3c3a44, { hi: 0x4c4a56 }),
  pale: ramp(0x8adcf0, { hi: 0xeaffff, dark: 0x06202a }),
  cyan: ramp(0x38c8f0, { hi: 0xb8f4ff, dark: 0x04182a }),
  blood: ramp(0xb82024, { hi: 0xff7a6a, dark: 0x200406 }),
  violet: ramp(0x9a50e0, { hi: 0xd8a8ff, dark: 0x140626 }),
  white: ramp(0xe8f0f8, { hi: 0xffffff }),
};

// ---------------------------------------------------------------- the shared 2D panel style（用户 11-13：「像素风UI面板都做得太丑了，主机游戏，参考一下我的世界地下城」）
// 《我的世界：地下城》的面板做法（只借做法）：近黑的石板底（不透明度高，不靠半透明糊在场景上）、1u 纯黑外线、
// 1u 斜面（左上亮一档、右下暗一档，像一块凿出来的石板）、底下 1u 落影让面板「抬起来」；颜色克制，金色只给可操作 / 聚焦。
// 语义色只走 1u 内沿（accent）：正面 = 金、负面 = 血红、类别标签 = 类别色。标题字用暖白，正文米白，次要信息灰紫。
// 菜单（meta/**）和战斗 HUD 共用这一套：pen.panel(x, y, w, h, PANEL.xxx)。
export interface PanelStyle {
  /** 板面 */ fill: string;
  /** 1u 外线 */ line: string;
  /** 斜面：左上亮边 / 右下暗边（null = 不画） */ edge: string | null; shade: string | null;
  /** 1u 语义内沿（null = 没有） */ accent: string | null;
  /** 板下 1u 落影（null = 不抬起） */ drop: string | null;
  /** 文字：标题 / 正文 / 次要 */ title: string; text: string; sub: string;
}
export const PANEL = {
  /** 普通面板（敌人牌意图、数值胶囊、标签、状态牌的底） */
  normal: { fill: '#1c1a24', line: '#050308', edge: '#34303f', shade: '#121018', accent: null, drop: 'rgba(0,0,0,0.55)', title: '#fff4dc', text: '#ece6f2', sub: '#a89cb8' } as PanelStyle,
  /** 聚焦 / 可操作：金沿 + 暖底（菜单的焦点项、出牌按钮的数值胶囊） */
  focus: { fill: '#2c2418', line: '#050308', edge: '#5a4a2c', shade: '#18120a', accent: '#f0c050', drop: 'rgba(0,0,0,0.55)', title: '#fffaf0', text: '#fff4dc', sub: '#d8c090' } as PanelStyle,
  /** 正面状态（护甲、屏障、狂暴）：金沿 */
  good: { fill: '#24201a', line: '#050308', edge: '#463c2a', shade: '#14100a', accent: '#c89a40', drop: 'rgba(0,0,0,0.5)', title: '#fff0d0', text: '#f0e6d4', sub: '#b8a888' } as PanelStyle,
  /** 危险 / 负面状态 / 攻击意图：血红沿 + 暗红底 */
  danger: { fill: '#24121a', line: '#050308', edge: '#44222a', shade: '#140810', accent: '#b8302a', drop: 'rgba(0,0,0,0.5)', title: '#ffe0d8', text: '#f4dcd8', sub: '#c8948c' } as PanelStyle,
  /** 禁用：灰沿，字暗 */
  disabled: { fill: '#18171e', line: '#050308', edge: '#26242e', shade: '#0e0d12', accent: '#3e3a48', drop: 'rgba(0,0,0,0.4)', title: '#8a8494', text: '#7a7486', sub: '#5e5a68' } as PanelStyle,
  /** 提示框（tips）：比普通深一档，青铜细沿，标题暖金 */
  tip: { fill: '#121016', line: '#050308', edge: '#2a2632', shade: '#08070a', accent: '#8a6a3a', drop: 'rgba(0,0,0,0.6)', title: '#ffd884', text: '#ece6f2', sub: '#a89cb8' } as PanelStyle,
};
/** a panel with a different accent (category tags, intent kinds): same slab, only the 1u inner rim changes */
export const panelWith = (base: PanelStyle, accent: string | null, extra: Partial<PanelStyle> = {}): PanelStyle => ({ ...base, accent, ...extra });
