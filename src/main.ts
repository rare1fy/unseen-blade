import { withLoadingBlade } from './present/scenes/loadingBlade';
// 不见刀 boot: platform → renderer + post (the 3D-pixel look) → the action game (present/act/show.ts).
import { initPlatform, G } from './platform/index';
import { CRAZYGAMES, initCrazyGames, finishLoading, reportGameplay } from './platform/crazygames';
import { readFlags } from './debug/flags';
import { dh } from './debug/dh';
import { createGfx } from './present/engine/gfx';
import { initParticles } from './present/engine/particles';
import { initPrims } from './present/engine/prims';
import { FX } from './present/engine/clock';
import { gpuMeasure } from './present/engine/gpuTime';
import { scene as worldScene } from './present/engine/world';
import { OPT } from './present/engine/perfOpts';
import { batchStats } from './present/engine/rigidBatch';
import { initQuality, setQuality, QUALITY, type Choice } from './present/look/quality';
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
const flags = readFlags(k => CRAZYGAMES ? null : platform.query(k));
const canvas = platform.createCanvas();
// the 3D-pixel render style (look/pixel.ts): #px1 / #px2 / #px3 or ?px=1|2|3; P toggles, [ ] pixel size
if (!CRAZYGAMES) readPixelFlag(typeof location !== 'undefined' ? location.hash.slice(1) : '', k => platform.query(k));
initQuality(platform);   // (11-18 微信帧率: the quality tier, before the renderer sizes its targets)
const gfx = createGfx(platform, canvas, { preserve: !!TEST.preserve });
if (!CRAZYGAMES) installPixelKeys();
initParticles('soft'); initPrims();
let frames = 0;

dh.add({
  info: () => ({ build: __BUILD__, dev: __DEV__, platform: platform.name, flags }),
  stats: () => ({ calls: gfx.stats.calls, tris: gfx.stats.tris, ms: Math.round(gfx.stats.ms * 10) / 10, logic: Math.round(gfx.stats.logic * 100) / 100, render: Math.round(gfx.stats.render * 100) / 100, px: PX.on ? PX.size : 0 }),
  gfx: () => gfx,
  /** 11-18 微信帧率: GPU ms / draw calls / triangles per render stage, averaged over n frames (a promise) */
  perf: (n = 120) => gpuMeasure(n),
  worldScene: () => worldScene,
  /** 11-18 微信帧率: turn single optimisations off / on to measure them: __dh.opt({ shadowTiles: false }) */
  opt: (o: Partial<typeof OPT> = {}) => Object.assign(OPT, o),
  batchStats,
  /** 11-18 微信帧率: the quality tier — __dh.quality('mid') / 'auto'; no argument: the state */
  quality: (c?: Choice) => { if (c) setQuality(c); return { ...QUALITY }; },
  /** the pixel render style: __dh.px(true, 2) / __dh.px(false) */
  px: (on = true, size?: number) => setPixel(on, size),
  /** live tuning of the pixel look: __dh.pxLook.ink = 0.6 … (see look/pixel.ts PX) */
  pxLook: PX, pxU: PXU,
  frames: () => frames,
  speed: (s: number) => { FX.speed = s; },
});
dh.install();

(CRAZYGAMES ? Promise.all([initCrazyGames(), fontsReady]) : fontsReady).then(async () => {
  // 2x pixels by default on every device (act-14 用户在手机上：「我要2x」, which overrides the old 「手机上 1x」); the choice made in
  // the tuning panel is remembered on the device; the URL (px1 / px2 / px3, ?px=) and the [ ] / P keys still choose
  { const href = typeof location !== 'undefined' ? location.href : '';
    let saved: string | null = null; try { saved = localStorage.getItem('ub.px'); } catch { /* private mode */ }
    if (CRAZYGAMES || !/[#&?]px/.test(href)) { if (saved === 'off') setPixel(false); else setPixel(true, saved && /^[123]$/.test(saved) ? +saved : 2); } }
  try {
    let A: ActShow;
    const start = () => {
      A = new ActShow(platform, true); G.__act = A;
      return A.startWithAudio();
    };
    gfx.start(() => {}, () => {
      if (!A) return;
      A.L.renderText(gfx.renderer); A.ov.render(gfx.renderer); frames++;
      if (CRAZYGAMES) {
        if (frames === 1) finishLoading();
        reportGameplay(A.phase === 'fight' && !A.pause.on && !A.cards.on && !A.dialogue.on && !A.timeline.on);
      }
    });
    if (__WX__) await withLoadingBlade(start); else await start();
    dh.ready();
  } catch (e) { platform.log('[act] ' + (((e as Error) && (e as Error).stack) || e)); dh.fail(e); }
});
