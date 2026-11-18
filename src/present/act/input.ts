// 输入：键盘、手柄、触屏合成一份（每帧 frame() 一次）。移动是屏幕方向（x 右、y 上），由 show 换成世界方向。
// 键盘：WASD / 方向键 移动，J 斩（点按砍，按住入鞘），空格 跳，K / Shift 冲刺，L / E 飞镖。
// 手柄：左摇杆 / 十字键移动，X 斩，A 跳，B / RB / RT 冲刺，Y 飞镖，按住飞镖时右摇杆瞄。
// 斩 / 冲 / 跳 / 镖的键盘键和手柄键都按 pad.ts 的键位表（能在暂停菜单「键位」里改）；走路键不能改。
// 触屏：左下一块区域里按下才出摇杆（act-08 用户：「移动的摇杆不要满屏幕都可以响应和拖着跑」）——默认按下的位置就是摇杆中心，
// 之后底座不动，手指拖出半径只是推满；TUNE.stickFixed = 1 时摇杆固定在左下，只有按在它附近才响应（hud.ts 判定）。
// 右下四个石钮由 hud.ts 判定后调 press / release。多指同时有效。
import { BIND, PAD, activePad, type Device } from './pad';

/** held = seconds the button has been down; last = how long the press that just ended (released this frame) was held */
export interface Btn { down: boolean; pressed: boolean; released: boolean; held: number; last: number }
const btn = (): Btn => ({ down: false, pressed: false, released: false, held: 0, last: 0 });
export type BtnName = 'attack' | 'dash' | 'special' | 'jump';
const NAMES: BtnName[] = ['attack', 'dash', 'special', 'jump'];
const flags = () => ({ attack: false, dash: false, special: false, jump: false });
/** a stick past its dead zone, re-scaled so the push grows from 0 at the edge of the dead zone to 1 at full tilt */
export function deadzone(x: number, y: number, dz = 0.2): { x: number; y: number } {
  const d = Math.hypot(x, y); if (d <= dz) return { x: 0, y: 0 };
  const m = Math.min(1, (d - dz) / (1 - dz)); return { x: x / d * m, y: y / d * m };
}

export class Input {
  move = { x: 0, y: 0 };
  /** the right stick (screen direction, x right, y up), zero inside its dead zone — darts aim with it while held */
  rstick = { x: 0, y: 0 };
  b: Record<BtnName, Btn> = { attack: btn(), dash: btn(), special: btn(), jump: btn() };
  /** the touch stick: origin and current point (CSS px), the pointer that owns it */
  stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0, r: 70 };
  private keys = new Set<string>(); private raw = flags();
  private touchBtn: Record<BtnName, number> = { attack: -1, dash: -1, special: -1, jump: -1 }; private pad = flags();
  /** after the pause menu: a button still held from the menu counts only once it has been let go */
  private latched = flags(); private latchMove = false;
  get lastDevice(): Device { return PAD.device; }
  set lastDevice(d: Device) { PAD.device = d; }
  /** scripted input (captures / tests): buttons held for a while, a stick push for a while */
  private virt: Record<BtnName, number> = { attack: 0, dash: 0, special: 0, jump: 0 }; private vm = { x: 0, y: 0, t: 0 };
  hold(n: BtnName, s: number) { this.virt[n] = Math.max(this.virt[n], s); }
  unhold(n: BtnName) { this.virt[n] = 0; }
  push(x: number, y: number, s: number) { this.vm = { x, y, t: s }; }
  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', e => { if (e.repeat) return; this.keys.add(e.key.toLowerCase()); this.lastDevice = 'key'; if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault(); });
    window.addEventListener('keyup', e => { this.keys.delete(e.key.toLowerCase()); });
    window.addEventListener('blur', () => this.keys.clear());
  }
  /** the HUD hands its button presses here */
  press(n: BtnName, id: number) { this.touchBtn[n] = id; this.lastDevice = 'touch'; }
  release(n: BtnName, id: number) { if (this.touchBtn[n] === id) this.touchBtn[n] = -1; }
  releaseAll(id: number) { for (const n of Object.keys(this.touchBtn) as BtnName[]) this.release(n, id); if (this.stick.id === id) this.stick.id = -1; if (this.aimDrag.id === id) this.aimDrag.id = -1; }
  stickDown(id: number, x: number, y: number) { this.stick.id = id; this.stick.ox = x; this.stick.oy = y; this.stick.x = x; this.stick.y = y; this.lastDevice = 'touch'; }
  stickMove(id: number, x: number, y: number) { if (this.stick.id === id) { this.stick.x = x; this.stick.y = y; } }
  /** act-27 (user: 「按住可以通过技能按钮指定方向」): the finger that pressed the dart button, dragged off it, aims the throw */
  aimDrag = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  aimBegin(id: number, ox: number, oy: number, x: number, y: number) { this.aimDrag = { id, ox, oy, x, y }; }
  aimMove(id: number, x: number, y: number) { if (this.aimDrag.id === id) { this.aimDrag.x = x; this.aimDrag.y = y; return true; } return false; }
  /** the drag as a screen direction (x right, y up), or null while the finger is still on the button */
  aimScreen(): { x: number; y: number } | null {
    const a = this.aimDrag; if (a.id < 0 || this.touchBtn.special !== a.id) return null;
    const dx = a.x - a.ox, dy = a.y - a.oy, d = Math.hypot(dx, dy); return d < 16 ? null : { x: dx / d, y: -dy / d };
  }
  /** everything held now is ignored until it is let go (the pause menu closing on a held button), and the buttons start up */
  latch(move = true) {
    for (const n of NAMES) { this.latched[n] = true; const b = this.b[n]; b.down = b.pressed = b.released = false; b.held = 0; }
    if (move) { this.latchMove = true; this.move.x = this.move.y = 0; }
  }
  frame(dt: number) {
    const k = this.keys, has = (ks: string[]) => ks.some(x => k.has(x));
    let mx = (has(['d', 'arrowright']) ? 1 : 0) - (has(['a', 'arrowleft']) ? 1 : 0), my = (has(['w', 'arrowup']) ? 1 : 0) - (has(['s', 'arrowdown']) ? 1 : 0);
    // the touch stick: full speed from 55% of its radius, a small dead zone
    if (this.stick.id >= 0) {
      const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy, d = Math.hypot(dx, dy), r = this.stick.r;
      const m = d < r * 0.12 ? 0 : Math.min(1, d / (r * 0.55));
      if (d > 0) { mx = dx / d * m; my = -dy / d * m; }
    }
    // the pad in use: left stick (dead zone, then 0 → 1) or the d-pad (eight ways), the buttons by the binding table
    const gp = activePad(); this.rstick.x = this.rstick.y = 0;
    if (gp) {
      const bt = (i: number) => !!gp.buttons[i]?.pressed;
      const s = deadzone(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
      if (s.x || s.y) { mx = s.x; my = -s.y; this.lastDevice = 'pad'; }
      const dx = (bt(15) ? 1 : 0) - (bt(14) ? 1 : 0), dy = (bt(12) ? 1 : 0) - (bt(13) ? 1 : 0);
      if (dx || dy) { mx = dx; my = dy; this.lastDevice = 'pad'; }
      const r = deadzone(gp.axes[2] ?? 0, gp.axes[3] ?? 0, 0.3); this.rstick.x = r.x; this.rstick.y = -r.y;
      for (const n of NAMES) this.pad[n] = BIND.pad[n].some(bt);
      if (NAMES.some(n => this.pad[n])) this.lastDevice = 'pad';
    } else for (const n of NAMES) this.pad[n] = false;
    if (this.vm.t > 0) { this.vm.t -= dt; mx = this.vm.x; my = this.vm.y; }
    const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
    if (this.latchMove) { if (Math.hypot(mx, my) < 0.1) this.latchMove = false; else mx = my = 0; }
    this.move.x = mx; this.move.y = my;
    for (const n of NAMES) this.raw[n] = has(BIND.key[n]) || this.touchBtn[n] >= 0 || this.pad[n];
    for (const n of NAMES) {
      if (this.latched[n]) { if (!this.raw[n]) this.latched[n] = false; else this.raw[n] = false; }
      if (this.virt[n] > 0) { this.virt[n] -= dt; this.raw[n] = true; }
      const b = this.b[n], d = this.raw[n];
      const was = b.held; b.pressed = d && !b.down; b.released = !d && b.down; b.down = d; b.held = d ? b.held + dt : 0; if (b.released) b.last = was;
    }
  }
}
