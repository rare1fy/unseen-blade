// 手柄（act-30 之后，用户：「帮我把手柄的按键映射和手柄支持做了吧」；设计见 docs/DESIGN.md「手柄、改键、暂停菜单」）：
//   键位表（键盘 + 手柄，能逐键改、撞键对调、记在本机）、正在用哪个手柄、手柄型号（Xbox / PlayStation / Switch）和按钮叫法、
//   像素画的按钮图形、手柄震动、菜单用的方向 / 确认 / 返回（按住方向会连跳）。
// 手柄按钮编号用浏览器的「标准排布」：0 下、1 右、2 左、3 上、4 LB、5 RB、6 LT、7 RT、8 Select、9 Start、10 / 11 摇杆按下、12～15 十字键、16 Home。
import * as THREE from 'three';
import type { BtnName } from './input';
import { clock } from '../engine/clock';

export type PadFamily = 'xbox' | 'ps' | 'ns';
export type Device = 'key' | 'touch' | 'pad';
export const ACTIONS: BtnName[] = ['attack', 'dash', 'jump', 'special'];
/** what each action is called on screen (the words under the buttons, act-28) */
export const ACTION_WORD: Record<BtnName, string> = { attack: '攻击', dash: '闪避', jump: '跳跃', special: '远程' };

// ---------------------------------------------------------------- the bindings
export interface Binds { key: Record<BtnName, string[]>; pad: Record<BtnName, number[]> }
/** the first of each list is the one shown and the one a rebind replaces; the rest are spares (Shift / RB / RT for the dash, E for darts) */
export const DEFAULT_BINDS: Binds = {
  key: { attack: ['j'], dash: ['k', 'shift'], jump: [' '], special: ['l', 'e'] },
  pad: { attack: [2], dash: [1, 5, 7], jump: [0], special: [3] },
};
const copy = (b: Binds): Binds => ({ key: { ...mapVals(b.key, v => v.slice()) }, pad: { ...mapVals(b.pad, v => v.slice()) } });
function mapVals<T, U>(o: Record<BtnName, T>, f: (v: T) => U): Record<BtnName, U> { const r = {} as Record<BtnName, U>; for (const k of ACTIONS) r[k] = f(o[k]); return r; }
export const BIND: Binds = copy(DEFAULT_BINDS);
const STORE = 'ub.bind';
/** keys that walk, pause or belong to the debug tools — never bound to an action */
export const KEY_RESERVED = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'escape', '`', 'tab', 'u', 'p', '[', ']',
  'control', 'alt', 'meta', 'os', 'capslock', 'contextmenu', 'dead', 'unidentified', 'process', ...Array.from({ length: 12 }, (_, i) => `f${i + 1}`)]);
/** Select / Start, the d-pad, Home */
export const PAD_RESERVED = new Set([8, 9, 12, 13, 14, 15, 16]);
export function loadBinds() {
  try {
    const s = globalThis.localStorage?.getItem(STORE); if (!s) return;
    const o = JSON.parse(s) as Partial<Binds>;
    for (const a of ACTIONS) {
      const k = o.key?.[a], p = o.pad?.[a];
      if (Array.isArray(k) && k.length && k.every(x => typeof x === 'string' && !KEY_RESERVED.has(x))) BIND.key[a] = k.slice();
      if (Array.isArray(p) && p.length && p.every(x => Number.isInteger(x) && x >= 0 && x < 18 && !PAD_RESERVED.has(x))) BIND.pad[a] = p.slice();
    }
  } catch { /* storage blocked or a bad record: the defaults stand */ }
}
function saveBinds() { try { globalThis.localStorage?.setItem(STORE, JSON.stringify(BIND)); } catch { /* storage blocked */ } }
export function resetBinds() { const d = copy(DEFAULT_BINDS); for (const a of ACTIONS) { BIND.key[a] = d.key[a]; BIND.pad[a] = d.pad[a]; } saveBinds(); }
/** put `code` on `act`: whoever had it as its main key takes act's old one (a swap), a spare just gives it up */
export function rebind(kind: 'key' | 'pad', act: BtnName, code: string | number): 'ok' | 'same' | 'reserved' {
  if (kind === 'key' ? KEY_RESERVED.has(code as string) : PAD_RESERVED.has(code as number)) return 'reserved';
  const T = BIND[kind] as Record<BtnName, Array<string | number>>, old = T[act][0];
  if (old === code) return 'same';
  for (const o of ACTIONS) {
    if (o === act) continue;
    const i = T[o].indexOf(code); if (i < 0) continue;
    if (i === 0) T[o] = [old, ...T[o].slice(1).filter(c => c !== old)];
    else T[o] = T[o].filter(c => c !== code);
  }
  T[act] = [code, ...T[act].slice(1).filter(c => c !== code && c !== old)];
  saveBinds(); return 'ok';
}
if (typeof window !== 'undefined') loadBinds();

// ---------------------------------------------------------------- the pad in use
export const PAD = {
  /** the gamepad index in use (the last one touched), -1 = none */
  idx: -1,
  family: 'xbox' as PadFamily,
  /** the last thing the player used (the button words, the hints and the rumble follow it) */
  device: 'touch' as Device,
};
export function familyOf(id: string): PadFamily {
  const s = id.toLowerCase();
  if (/xbox|045e|xinput/.test(s)) return 'xbox';   // ("Xbox Wireless Controller" — the PS4 pad is plain "Wireless Controller")
  if (/054c|playstation|dualsense|dualshock|wireless controller/.test(s)) return 'ps';
  if (/057e|nintendo|pro controller|joy-con|joycon/.test(s)) return 'ns';
  return 'xbox';
}
const pads = (): Gamepad[] => Array.from((globalThis.navigator as Navigator | undefined)?.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected);
/** any input on this pad this frame (a button down, a stick pushed past its dead zone) */
const busy = (p: Gamepad) => p.buttons.some(b => b.pressed) || Math.hypot(p.axes[0] ?? 0, p.axes[1] ?? 0) > 0.35 || Math.hypot(p.axes[2] ?? 0, p.axes[3] ?? 0) > 0.35;
let pickedAt = -1;
/** the pad in use: the one with input most recently; the first connected one until someone presses something */
export function activePad(): Gamepad | null {
  const all = pads(); if (!all.length) { PAD.idx = -1; return null; }
  if (pickedAt !== clock.frame) {
    pickedAt = clock.frame;
    const cur = all.find(p => p.index === PAD.idx);
    if (!cur || !busy(cur)) { const b = all.find(busy); if (b) PAD.idx = b.index; else if (!cur) PAD.idx = all[0].index; }
  }
  const p = all.find(q => q.index === PAD.idx) ?? null;
  if (p) PAD.family = familyOf(p.id);
  return p;
}

// ---------------------------------------------------------------- names
const NAMES: Record<PadFamily, string[]> = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', '↑', '↓', '←', '→', 'Home'],
  ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS'],
  ns: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'LS', 'RS', '↑', '↓', '←', '→', 'Home'],
};
export const padName = (i: number, f: PadFamily = PAD.family) => NAMES[f][i] ?? `#${i}`;
const KEY_NAMES: Record<string, string> = { ' ': '空格', shift: 'Shift', enter: '回车', backspace: '退格', delete: 'Del', insert: 'Ins', home: 'Home', end: 'End', pageup: 'PgUp', pagedown: 'PgDn' };
export const keyName = (k: string) => KEY_NAMES[k] ?? (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
/** the main key / button of an action, as text */
export const actKey = (a: BtnName) => keyName(BIND.key[a][0]);
export const actPad = (a: BtnName) => padName(BIND.pad[a][0]);
/** the start-screen / pause key for the device in use */
export const pauseName = () => PAD.family === 'ps' ? 'Options' : PAD.family === 'ns' ? '+' : 'Menu';

// ---------------------------------------------------------------- the button picture (pixel art, axis-aligned)
// a face button is a dark iron cap with clipped corners and a lit top row; the letter / symbol on it is the family's own
// (Xbox: coloured letters; PlayStation: the four coloured symbols; Switch: white letters). Shoulders and triggers are a wider cap.
const F5: Record<string, string[]> = {   // 5 × 5 letters for the face buttons
  A: ['.###.', '#...#', '#####', '#...#', '#...#'],
  B: ['####.', '#...#', '####.', '#...#', '####.'],
  X: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
};
const F3: Record<string, string[]> = {   // 3 × 5 for the shoulders / sticks
  L: ['#..', '#..', '#..', '#..', '###'], R: ['##.', '#.#', '##.', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'], S: ['.##', '#..', '.#.', '..#', '##.'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'],
  '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'],
};
const PS_SHAPE: Record<number, string[]> = {   // 5 × 5
  0: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  1: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  2: ['#####', '#...#', '#...#', '#...#', '#####'],
  3: ['..#..', '.#.#.', '.#.#.', '#...#', '#####'],
};
const XBOX_COL = ['#7ccc52', '#ec5a50', '#4c9cf0', '#f4c838'], PS_COL = ['#8cb2f4', '#f0707a', '#ec98d2', '#5cd4ac'];
/** the button pictures are GLYPH_H art pixels tall (face buttons square, shoulders / triggers wider) */
export const GLYPH_H = 9;
export interface GlyphArt { w: number; h: number; px: Array<[number, number, string]> }
/** the button as a little grid of coloured pixels (w × h art pixels) */
export function glyphArt(i: number, f: PadFamily = PAD.family): GlyphArt {
  const face = i <= 3, w = face ? 9 : 13, h = GLYPH_H, px: Array<[number, number, string]> = [];
  const cap = '#221d24', rim = '#5a5058', lit = '#3c3440';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = Math.min(x, w - 1 - x), cy = Math.min(y, h - 1 - y);
    if (cx + cy < 2) continue;                                   // clipped corners (a one-pixel bevel)
    const edge = cx === 0 || cy === 0 || cx + cy === 2;
    px.push([x, y, edge ? rim : y === 1 ? lit : cap]);
  }
  const put = (rows: string[], ox: number, oy: number, c: string) => rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') px.push([ox + x, oy + y, c]); }));
  if (face && f === 'ps') put(PS_SHAPE[i], 2, 2, PS_COL[i]);
  else if (face) put(F5[NAMES[f][i]] ?? F5.A, 2, 2, f === 'xbox' ? XBOX_COL[i] : '#f2ece0');
  else {
    const t = NAMES[f][i] === '−' ? '-' : NAMES[f][i];
    const chars = [...t].slice(0, 3).filter(c => F3[c]), tw = chars.length * 4 - 1;
    chars.forEach((c, k) => put(F3[c], Math.floor((w - tw) / 2) + k * 4, 2, '#f2ece0'));
  }
  return { w, h, px };
}
/** paint a button at (x, y) (top-left), s device px per art pixel */
export function paintGlyph(g: CanvasRenderingContext2D, i: number, x: number, y: number, s: number, f: PadFamily = PAD.family) {
  const a = glyphArt(i, f);
  for (const [px, py, c] of a.px) { g.fillStyle = c; g.fillRect(x + px * s, y + py * s, s, s); }
  return { w: a.w * s, h: a.h * s };
}
const texCache = new Map<string, THREE.CanvasTexture>();
/** a texture of the button (nearest-filtered pixels), cached per family / button */
export function glyphTex(i: number, f: PadFamily = PAD.family): THREE.CanvasTexture | null {
  const k = `${f}|${i}`; let t = texCache.get(k); if (t) return t;
  if (typeof document === 'undefined') return null;
  const a = glyphArt(i, f), c = document.createElement('canvas'); c.width = a.w; c.height = a.h;
  const g = c.getContext('2d')!; for (const [px, py, col] of a.px) { g.fillStyle = col; g.fillRect(px, py, 1, 1); }
  t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(k, t); return t;
}

// ---------------------------------------------------------------- rumble
/** the platform's vibrate() asks here first: true = handled (the player is on a pad: the pad rumbles or, without a motor, nothing does) */
export function padRumble(level: 'light' | 'medium' | 'heavy'): boolean {
  if (PAD.device !== 'pad') return false;
  const act = (activePad() as unknown as { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } } | null)?.vibrationActuator;
  if (!act?.playEffect) return true;
  const [ms, strong, weak] = level === 'heavy' ? [190, 0.9, 0.8] : level === 'medium' ? [110, 0.45, 0.6] : [60, 0.1, 0.4];
  try { void act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {}); } catch { /* best-effort */ }
  return true;
}

// ---------------------------------------------------------------- menus: direction / confirm / back edges, held directions repeat
export interface Nav { up: boolean; down: boolean; left: boolean; right: boolean; ok: boolean; back: boolean; start: boolean; x: boolean; any: boolean;
  /** the B button held (the cutscene skip) */ backHeld: boolean; }
const NONE: Nav = { up: false, down: false, left: false, right: false, ok: false, back: false, start: false, x: false, any: false, backHeld: false };
class PadNav {
  private prev: boolean[] = []; private dirPrev = { up: false, down: false, left: false, right: false }; private rep = 0; private at = -1; private last: Nav = NONE;
  /** this frame's edges (polled once a frame, whoever asks first) */
  poll(rdt: number): Nav {
    if (this.at === clock.frame) return this.last; this.at = clock.frame;
    const p = activePad(); if (!p) { this.prev = []; this.last = NONE; return NONE; }
    const b = p.buttons.map(x => !!x.pressed), ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
    const edge = (i: number) => !!b[i] && !this.prev[i];
    const dir = { up: !!b[12] || ay < -0.55, down: !!b[13] || ay > 0.55, left: !!b[14] || ax < -0.55, right: !!b[15] || ax > 0.55 };
    const held = (Object.keys(dir) as Array<keyof typeof dir>).find(k => dir[k] && this.dirPrev[k]);
    this.rep -= rdt; let fire: keyof typeof dir | null = null;
    for (const k of Object.keys(dir) as Array<keyof typeof dir>) if (dir[k] && !this.dirPrev[k]) { fire = k; this.rep = 0.38; }
    if (!fire && held && this.rep <= 0) { fire = held; this.rep = 0.12; }
    const n: Nav = { up: fire === 'up', down: fire === 'down', left: fire === 'left', right: fire === 'right', ok: edge(0), back: edge(1), start: edge(9), x: edge(2),
      any: b.some((v, i) => v && !this.prev[i]), backHeld: !!b[1] };
    if (n.any || fire) PAD.device = 'pad';
    this.prev = b; this.dirPrev = dir; this.last = n; return n;
  }
  /** forget the edges: what is held now counts as already held (a menu opening under a held button) */
  sync() {
    const p = activePad(), b = p ? p.buttons.map(x => !!x.pressed) : [], ax = p?.axes[0] ?? 0, ay = p?.axes[1] ?? 0;
    this.prev = b; this.dirPrev = { up: !!b[12] || ay < -0.55, down: !!b[13] || ay > 0.55, left: !!b[14] || ax < -0.55, right: !!b[15] || ax > 0.55 };
    this.rep = 0.38; this.at = clock.frame; this.last = NONE;
  }
  /** buttons newly pressed this frame (the rebind listens for any) */
  pressed(): number[] { const p = activePad(); if (!p) return []; return p.buttons.map((x, i) => (x.pressed && !this.prevSnap[i] ? i : -1)).filter(i => i >= 0); }
  private prevSnap: boolean[] = [];
  /** snapshot for pressed(): call after reading it */
  snap() { const p = activePad(); this.prevSnap = p ? p.buttons.map(x => !!x.pressed) : []; }
}
export const padNav = new PadNav();
