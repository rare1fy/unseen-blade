// Platform layer: pxui's platform (browser / WeChat / Douyin, picked at runtime) plus the few extras the game needs.
// Game code never touches window/document directly; anything platform-specific goes through here.
import { createPlatform, type PxPlatform } from 'pxui/platform/index.js';
import { landscapeOnPortrait } from './rotate';

/** The global object: GameGlobal in mini-games, globalThis elsewhere (also the worker sandbox). */
export const G: any = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;

/** a real page (browser DOM): the mini-games' adapter fakes a `document` (canvas / image creation only), so `typeof document` can't tell
 *  (11-18 微信小游戏: the DOM tuning panel crashed the boot there) */
export const HAS_DOM = typeof window !== 'undefined' && typeof HTMLElement !== 'undefined' && typeof GameGlobal === 'undefined';

export type VibeLevel = 'light' | 'medium' | 'heavy';

export interface Platform extends PxPlatform {
  /** Short haptic pulse for heavy hits / crits. No-op where unsupported. */
  vibrate(level: VibeLevel): void;
}

/** An offscreen 2D canvas for procedural textures: browser element, mini-game canvas, or OffscreenCanvas (worker sandbox). */
export function makeCanvas(w: number, h: number): any {
  let c: any;
  const mini = typeof tt !== 'undefined' && tt && tt.createCanvas ? tt : typeof wx !== 'undefined' && wx && wx.createCanvas ? wx : null;
  if (mini && G.canvas) c = mini.createCanvas();   // the first mini-game canvas is the screen; later ones are offscreen
  else if (typeof document !== 'undefined' && document.createElement) c = document.createElement('canvas');
  else if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(w, h);
  else throw new Error('no 2D canvas available');
  c.width = w; c.height = h;
  return c;
}

/** haptics switch (settings) */
export const VIBE = { on: true };
/** the game's say before the phone's: a pad in use rumbles instead (act/pad.ts padRumble; true = handled) */
export const RUMBLE: { fn: ((level: VibeLevel) => boolean) | null } = { fn: null };
/** what this device can do: 'api' = navigator.vibrate (Android browsers), 'ios' = no vibrate API but Safari 18's switch haptic,
 *  'none' = neither (the mini-game platforms have their own) */
export function vibeSupport(): 'api' | 'ios' | 'ios-old' | 'none' {
  const nav: any = G.navigator; if (nav && typeof nav.vibrate === 'function') return 'api';
  const ua = String(nav?.userAgent ?? ''), ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1);
  if (!ios || typeof document === 'undefined') return 'none';
  return iosMajor() >= 18 ? 'ios' : 'ios-old';
}
/** the iOS major version from Safari's user agent ("… iPhone OS 17_5 …" / "Version/18.1"), 0 when unknown */
export function iosMajor(): number {
  const ua = String((G.navigator as { userAgent?: string } | undefined)?.userAgent ?? ''), m = /OS (\d+)_/.exec(ua) ?? /Version\/(\d+)/.exec(ua);
  return m ? +m[1] : 0;
}
// iOS has no Vibration API (Safari, and Chrome / WeChat on iOS, which are Safari underneath). Since iOS 18, toggling an
// <input type="checkbox" switch> plays the system's light haptic tick — a hidden one is clicked through its label.
let iosLabel: HTMLLabelElement | null = null;
function iosTick() {
  if (!iosLabel) {
    const l = document.createElement('label'), i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); l.setAttribute('aria-hidden', 'true');
    Object.assign(l.style, { position: 'fixed', left: '-100px', top: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
    l.append(i); document.body.append(l); iosLabel = l;
  }
  iosLabel.click();
}
let lastVibe = 0;
// Safari plays the switch haptic only inside a touch (a user gesture), and the game's blows land between touches: a haptic the frame
// asked for is tried at once and, if the next finger down / up comes within 0.15 s, played again there (act-18)
let iosWant = 0, iosWanted = 0;
function iosFlush() { if (iosWant && performance.now() - iosWanted < 150) { iosTick(); } iosWant = 0; }
if (typeof window !== 'undefined') for (const ev of ['pointerdown', 'pointerup', 'touchend'] as const) window.addEventListener(ev, iosFlush, { capture: true, passive: true });
export function initPlatform(): Platform {
  const p = createPlatform() as Platform;
  landscapeOnPortrait(p);
  const mini = p.name === 'wx' ? wx : p.name === 'tt' ? tt : null;
  p.vibrate = (level: VibeLevel) => {
    if (!VIBE.on) return;
    try {
      if (RUMBLE.fn?.(level)) return;
      if (mini && mini.vibrateShort) { mini.vibrateShort({ type: level }); return; }
      // a burst of hits would blur into one buzz: at least 40 ms apart
      const now = p.now(); if (now - lastVibe < 40) return; lastVibe = now;
      const nav: any = G.navigator;
      // act-15 用户「我浏览器玩没有震动诶」: 10 ms was too short to feel on many Android phones
      if (nav && typeof nav.vibrate === 'function') { nav.vibrate(level === 'heavy' ? 60 : level === 'medium' ? 30 : 15); return; }
      if (vibeSupport() === 'ios') { iosTick(); if (level === 'heavy') setTimeout(iosTick, 70); iosWant = 1; iosWanted = performance.now(); }
    } catch { /* haptics are best-effort */ }
  };
  return p;
}
