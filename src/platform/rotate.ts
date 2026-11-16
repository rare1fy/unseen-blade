// Landscape on a portrait phone (browser only). The game is landscape-first, but a phone browser with rotation locked, or an
// in-app browser (WeChat etc.) that never rotates, keeps the page portrait. Then the canvas is turned 90° clockwise with CSS,
// so the game's top edge is at the screen's right edge: turn the phone counter-clockwise and it reads as landscape.
// Game code only sees the rotated platform: canvasSize() is landscape, pointer coordinates and the safe area are turned to match.
// ?rot=0 turns it off, ?rot=1 forces it (desktop testing).
import type { PxPlatform, PxPointer } from 'pxui/platform/index.js';

let turned: () => boolean = () => false;
/** true while the canvas is turned 90° (game coordinates are landscape, the screen is portrait) */
export const screenTurned = () => turned();
/** screen-space insets (CSS env safe-area) → game-space insets, for code that reads env() itself */
export function turnInsets(s: { l: number; r: number; t: number; b: number }) { return turned() ? { l: s.t, t: s.r, r: s.b, b: s.l } : s; }

export function landscapeOnPortrait(p: PxPlatform): void {
  if (p.name !== 'browser' || typeof window === 'undefined') return;
  const W = window, q = p.query('rot');
  if (q === '0') return;
  // the 京都篇 showcase page (present/kyoto) is laid out for any orientation and its DOM controls are not turned: no canvas turn there
  const entry = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ENTRY;
  if (entry === 'kyoto' || /(^|[#&])kyoto(?=[&]|$)/.test(W.location?.hash ?? '')) return;
  const touch = () => (W.navigator?.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in W;
  const rotated = () => (q === '1' || touch()) && W.innerHeight > W.innerWidth;
  turned = rotated;

  const style = () => {
    const c = p.canvas as HTMLCanvasElement | null; if (!c) return;
    const iw = W.innerWidth, ih = W.innerHeight;
    if (rotated()) {   // a landscape box (ih × iw) whose top-left corner sits at the screen's top-right, turned 90° clockwise
      Object.assign(c.style, { left: iw + 'px', top: '0px', width: ih + 'px', height: iw + 'px', transformOrigin: '0 0', transform: 'rotate(90deg)' });
    } else Object.assign(c.style, { left: '0px', top: '0px', width: '100vw', height: '100vh', transformOrigin: '', transform: '' });
  };

  const createCanvas = p.createCanvas.bind(p);
  p.createCanvas = () => { const c = createCanvas(); style(); W.addEventListener('resize', style); return c; };

  const canvasSize = p.canvasSize.bind(p);
  p.canvasSize = () => (rotated() ? { w: W.innerHeight, h: W.innerWidth } : canvasSize());

  // screen (X, Y) → game (x, y) for the clockwise turn: x = Y, y = innerWidth − X
  const onPointer = p.onPointer.bind(p);
  p.onPointer = fn => onPointer((ev: PxPointer) => {
    if (!rotated()) return fn(ev);
    const e = ev.raw as PointerEvent | undefined, X = e ? e.clientX : ev.x, Y = e ? e.clientY : ev.y;
    return fn({ ...ev, x: Y, y: W.innerWidth - X });
  });

  // game left = screen top, game top = screen right, game right = screen bottom, game bottom = screen left
  const safeArea = p.safeArea.bind(p);
  p.safeArea = () => { const s = safeArea(); return rotated() ? { left: s.top, top: s.right, right: s.bottom, bottom: s.left } : s; };
}
