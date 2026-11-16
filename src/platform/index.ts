// Platform layer: pxui's platform (browser / WeChat / Douyin, picked at runtime) plus the few extras the game needs.
// Game code never touches window/document directly; anything platform-specific goes through here.
import { createPlatform, type PxPlatform } from 'pxui/platform/index.js';
import { landscapeOnPortrait } from './rotate';

/** The global object: GameGlobal in mini-games, globalThis elsewhere (also the worker sandbox). */
export const G: any = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;

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
export function initPlatform(): Platform {
  const p = createPlatform() as Platform;
  landscapeOnPortrait(p);
  const mini = p.name === 'wx' ? wx : p.name === 'tt' ? tt : null;
  p.vibrate = (level: VibeLevel) => {
    if (!VIBE.on) return;
    try {
      if (mini && mini.vibrateShort) { mini.vibrateShort({ type: level }); return; }
      const nav: any = G.navigator;
      if (nav && typeof nav.vibrate === 'function') nav.vibrate(level === 'heavy' ? 40 : level === 'medium' ? 22 : 10);
    } catch { /* haptics are best-effort */ }
  };
  return p;
}
