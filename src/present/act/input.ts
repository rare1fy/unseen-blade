// 输入：键盘、手柄、触屏合成一份（每帧 frame() 一次）。移动是屏幕方向（x 右、y 上），由 show 换成世界方向。
// 键盘：WASD / 方向键 移动，J 斩（点按砍，按住入鞘），空格 跳，K / Shift 冲刺，L / E 飞镖。
// 手柄：左摇杆移动，X 斩，A 跳，B / RB 冲刺，Y 飞镖。
// 触屏：左下一块区域里按下才出摇杆（act-08 用户：「移动的摇杆不要满屏幕都可以响应和拖着跑」）——默认按下的位置就是摇杆中心，
// 之后底座不动，手指拖出半径只是推满；TUNE.stickFixed = 1 时摇杆固定在左下，只有按在它附近才响应（hud.ts 判定）。
// 右下四个石钮由 hud.ts 判定后调 press / release。多指同时有效。
/** held = seconds the button has been down; last = how long the press that just ended (released this frame) was held */
export interface Btn { down: boolean; pressed: boolean; released: boolean; held: number; last: number }
const btn = (): Btn => ({ down: false, pressed: false, released: false, held: 0, last: 0 });
export type BtnName = 'attack' | 'dash' | 'special' | 'jump';

export class Input {
  move = { x: 0, y: 0 };
  b: Record<BtnName, Btn> = { attack: btn(), dash: btn(), special: btn(), jump: btn() };
  /** the touch stick: origin and current point (CSS px), the pointer that owns it */
  stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0, r: 70 };
  private keys = new Set<string>(); private raw: Record<BtnName, boolean> = { attack: false, dash: false, special: false, jump: false };
  private touchBtn: Record<BtnName, number> = { attack: -1, dash: -1, special: -1, jump: -1 }; private pad: Record<BtnName, boolean> = { attack: false, dash: false, special: false, jump: false };
  lastDevice: 'key' | 'touch' | 'pad' = 'touch';
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
  releaseAll(id: number) { for (const n of Object.keys(this.touchBtn) as BtnName[]) this.release(n, id); if (this.stick.id === id) this.stick.id = -1; }
  stickDown(id: number, x: number, y: number) { this.stick.id = id; this.stick.ox = x; this.stick.oy = y; this.stick.x = x; this.stick.y = y; this.lastDevice = 'touch'; }
  stickMove(id: number, x: number, y: number) { if (this.stick.id === id) { this.stick.x = x; this.stick.y = y; } }
  frame(dt: number) {
    const k = this.keys, has = (...ks: string[]) => ks.some(x => k.has(x));
    let mx = (has('d', 'arrowright') ? 1 : 0) - (has('a', 'arrowleft') ? 1 : 0), my = (has('w', 'arrowup') ? 1 : 0) - (has('s', 'arrowdown') ? 1 : 0);
    // the touch stick: full speed from 55% of its radius, a small dead zone
    if (this.stick.id >= 0) {
      const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy, d = Math.hypot(dx, dy), r = this.stick.r;
      const m = d < r * 0.12 ? 0 : Math.min(1, d / (r * 0.55));
      if (d > 0) { mx = dx / d * m; my = -dy / d * m; }
    }
    // a gamepad: left stick, X attack, A jump, B / RB dash, Y special
    const gp = Array.from((globalThis.navigator as Navigator | undefined)?.getGamepads?.() ?? []).find(p => p && p.connected);
    if (gp) {
      const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0, d = Math.hypot(ax, ay);
      if (d > 0.2) { mx = ax; my = -ay; this.lastDevice = 'pad'; }
      this.pad = { attack: !!gp.buttons[2]?.pressed, jump: !!gp.buttons[0]?.pressed, dash: !!gp.buttons[1]?.pressed || !!gp.buttons[5]?.pressed, special: !!gp.buttons[3]?.pressed };
      if (this.pad.attack || this.pad.dash || this.pad.special || this.pad.jump) this.lastDevice = 'pad';
    }
    if (this.vm.t > 0) { this.vm.t -= dt; mx = this.vm.x; my = this.vm.y; }
    const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
    this.move.x = mx; this.move.y = my;
    this.raw.attack = has('j') || this.touchBtn.attack >= 0 || this.pad.attack;
    this.raw.dash = has('k', 'shift') || this.touchBtn.dash >= 0 || this.pad.dash;
    this.raw.jump = has(' ') || this.touchBtn.jump >= 0 || this.pad.jump;
    this.raw.special = has('l', 'e') || this.touchBtn.special >= 0 || this.pad.special;
    for (const n of Object.keys(this.b) as BtnName[]) {
      if (this.virt[n] > 0) { this.virt[n] -= dt; this.raw[n] = true; }
      const b = this.b[n], d = this.raw[n];
      const was = b.held; b.pressed = d && !b.down; b.released = !d && b.down; b.down = d; b.held = d ? b.held + dt : 0; if (b.released) b.last = was;
    }
  }
}
