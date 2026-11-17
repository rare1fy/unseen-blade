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
import './present/act/hideout';   // the hideout (据点): its scene, its five people, __dh.hideout()
import { VIBE } from './platform/index';
import { fontsReady } from './present/ui3d/bodyFont';
import './audio/audio';
import { installVoxEdits } from './present/bestiary/voxEdit';
// the models the user edited in MagicaVoxel (vox/<model id>.vox) replace the code-built ones, part by part
const VOX_EDITED = installVoxEdits();
dh.add({ voxEdited: () => VOX_EDITED });

const TEST: { fixedTime?: number; preserve?: boolean } = G.__PXUI_TEST || {};
// the haptics switch in the tuning panel is remembered on the device
try { if (localStorage.getItem('ub.vibe') === '0') VIBE.on = false; } catch { /* private mode */ }
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
  stats: () => ({ calls: gfx.stats.calls, tris: gfx.stats.tris, ms: Math.round(gfx.stats.ms * 10) / 10, logic: Math.round(gfx.stats.logic * 100) / 100, render: Math.round(gfx.stats.render * 100) / 100, px: PX.on ? PX.size : 0 }),
  gfx: () => gfx,
  /** the pixel render style: __dh.px(true, 2) / __dh.px(false) */
  px: (on = true, size?: number) => setPixel(on, size),
  /** live tuning of the pixel look: __dh.pxLook.ink = 0.6 … (see look/pixel.ts PX) */
  pxLook: PX, pxU: PXU,
  frames: () => frames,
  speed: (s: number) => { FX.speed = s; },
});
dh.install();

fontsReady.then(() => {
  // 2x pixels by default on every device (act-14 用户在手机上：「我要2x」, which overrides the old 「手机上 1x」); the choice made in
  // the tuning panel is remembered on the device; the URL (px1 / px2 / px3, ?px=) and the [ ] / P keys still choose
  { const href = typeof location !== 'undefined' ? location.href : '';
    let saved: string | null = null; try { saved = localStorage.getItem('ub.px'); } catch { /* private mode */ }
    if (!/[#&?]px/.test(href)) { if (saved === 'off') setPixel(false); else setPixel(true, saved && /^[123]$/.test(saved) ? +saved : 2); } }
  try {
    const A = new ActShow(platform); G.__act = A;
    gfx.start(() => {}, () => { A.L.renderText(gfx.renderer); A.ov.render(gfx.renderer); frames++; });
    dh.ready();
  } catch (e) { platform.log('[act] ' + (((e as Error) && (e as Error).stack) || e)); dh.fail(e); }
});
