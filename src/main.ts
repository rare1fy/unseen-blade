// 不见刀 boot: platform → renderer + post (the 3D-pixel look) → the action game (present/act/show.ts).
import { initPlatform, G } from './platform/index';
import { readFlags } from './debug/flags';
import { dh } from './debug/dh';
import { createGfx } from './present/engine/gfx';
import { initParticles } from './present/engine/particles';
import { initPrims } from './present/engine/prims';
import { FX } from './present/engine/clock';
import { PX, PXU, readPixelFlag, installPixelKeys, setPixel } from './present/look/pixel';
import { ActShow } from './present/act/show';
import './audio/audio';

const TEST: { fixedTime?: number; preserve?: boolean } = G.__PXUI_TEST || {};
const platform = initPlatform();
const flags = readFlags(k => platform.query(k));
const canvas = platform.createCanvas();
// the 3D-pixel render style (look/pixel.ts): #px1 / #px2 / #px3 or ?px=1|2|3; P toggles, [ ] pixel size
readPixelFlag(typeof location !== 'undefined' ? location.hash.slice(1) : '', k => platform.query(k));
const gfx = createGfx(platform, canvas, { preserve: !!TEST.preserve });
installPixelKeys();
initParticles('soft'); initPrims();
let frames = 0;

dh.add({
  info: () => ({ build: __BUILD__, dev: __DEV__, platform: platform.name, flags }),
  stats: () => ({ calls: gfx.stats.calls, tris: gfx.stats.tris, ms: Math.round(gfx.stats.ms * 10) / 10, px: PX.on ? PX.size : 0 }),
  /** the pixel render style: __dh.px(true, 2) / __dh.px(false) */
  px: (on = true, size?: number) => setPixel(on, size),
  /** live tuning of the pixel look: __dh.pxLook.ink = 0.6 … (see look/pixel.ts PX) */
  pxLook: PX, pxU: PXU,
  frames: () => frames,
  speed: (s: number) => { FX.speed = s; },
});
dh.install();

Promise.resolve().then(() => {
  // 2x pixels by default on a computer (act-05 用户：「我感觉现在这个2x的效果是最好的」); phones stay 1x (「2x还是太不清晰了在手机上」);
  // the URL (px1 / px2 / px3, ?px=) and the [ ] / P keys still choose
  { const href = typeof location !== 'undefined' ? location.href : '', n = globalThis.navigator as Navigator | undefined, sc = globalThis.screen as Screen | undefined;
    // a phone = touch and no fine pointer at all (a touchscreen laptop still has its mouse / trackpad)
    let fine = true; try { fine = globalThis.matchMedia?.('(any-pointer: fine)').matches ?? true; } catch { /* old browsers: treat as a computer */ }
    const phone = !!n && (n.maxTouchPoints ?? 0) > 0 && !fine && !!sc && Math.min(sc.width, sc.height) < 900;
    if (!/[#&?]px/.test(href) && !phone) setPixel(true, 2); }
  try {
    const A = new ActShow(platform); G.__act = A;
    gfx.start(() => {}, () => { A.L.renderText(gfx.renderer); A.ov.render(gfx.renderer); frames++; });
    dh.ready();
  } catch (e) { platform.log('[act] ' + (((e as Error) && (e as Error).stack) || e)); dh.fail(e); }
});
