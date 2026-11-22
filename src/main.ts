import { withLoadingBlade } from './present/scenes/loadingBlade';
import { bootShow, bootDone, bootDemo } from './present/scenes/bootScreen';
import { frames as waitFrames, precompile as precompileAll } from './present/engine/world';
// 不见刀 boot: platform → renderer + post (the 3D-pixel look) → the action game (present/act/show.ts).
import { initPlatform, G } from './platform/index';
import { CRAZYGAMES, initCrazyGames, finishLoading, reportGameplay } from './platform/crazygames';
import { readFlags } from './debug/flags';
import { dh } from './debug/dh';
import { createGfx } from './present/engine/gfx';
import { initParticles } from './present/engine/particles';
import { initPrims } from './present/engine/prims';
import { FX } from './present/engine/clock';
import { paintMeter } from './present/engine/frameMeter';
import { gpuMeasure } from './present/engine/gpuTime';
import { scene as worldScene } from './present/engine/world';
import { OPT } from './present/engine/perfOpts';
import { batchStats } from './present/engine/rigidBatch';
import { initQuality, setQuality, refreshQuality, QUALITY, type Choice } from './present/look/quality';
import { PX, PXU, readPixelFlag, installPixelKeys, setPixel } from './present/look/pixel';
import { CRAFT, PX_POLISH, initCraft, setCraft, setPxPolish, readCraftFlag, type CraftMode } from './present/look/craft';
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
const flags = readFlags(k => __DEBUG_UI__ ? platform.query(k) : null);
const canvas = platform.createCanvas();
// the 3D-pixel render style (look/pixel.ts): #px1 / #px2 / #px3 or ?px=1|2|3; P toggles, [ ] pixel size
if (__DEBUG_UI__) readPixelFlag(typeof location !== 'undefined' ? location.hash.slice(1) : '', k => platform.query(k));
initQuality(platform);   // (11-18 微信帧率: the quality tier, before the renderer sizes its targets)
const gfx = createGfx(platform, canvas, { preserve: !!TEST.preserve });
if (__DEBUG_UI__) installPixelKeys();
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
  opt: (o: Partial<typeof OPT> = {}) => { Object.assign(OPT, o); if (Object.keys(o).length) refreshQuality(); return OPT; },
  batchStats,
  /** 11-18 微信帧率: the quality tier — __dh.quality('mid') / 'auto'; no argument: the state */
  quality: (c?: Choice) => { if (c) setQuality(c); return { ...QUALITY }; },
  /** the pixel render style: __dh.px(true, 2) / __dh.px(false) */
  px: (on = true, size?: number) => setPixel(on, size),
  /** stylized voxel look presets: __dh.craft('ink' | 'hd2d' | 'diorama' | 'off') */
  craft: (mode: CraftMode | boolean | number | string = 'ink', keepPixel = false) => setCraft(mode, keepPixel),
  craftLook: CRAFT,
  /** classic 2x pixel craft polish toggle for A/B comparison: __dh.pxPolish(true / false) */
  pxPolish: (on = true) => setPxPolish(on),
  pxPolishState: PX_POLISH,
  /** the first-load screen, brought back for a look */
  bootDemo,
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
    // (11-18: the WeChat / CrazyGames packages have no pixel switch — always 2x, whatever a test build left on the device)
    let saved: string | null = null; try { if (__DEBUG_UI__) saved = localStorage.getItem('ub.px'); } catch { /* private mode */ }
    if (!__DEBUG_UI__ || !/[#&?]px/.test(href)) { if (saved === 'off') setPixel(false); else setPixel(true, saved && /^[123]$/.test(saved) ? +saved : 2); }
    if (__DEBUG_UI__) initCraft(platform, readCraftFlag(k => platform.query(k))); }
  try {
    let A: ActShow;
    const start = () => {
      A = new ActShow(platform, true); G.__act = A;
      return A.startWithAudio();
    };
    gfx.start(() => {}, () => {
      if (!A) return;
      paintMeter(A.L, gfx.stats, platform.now());
      A.renderMiniWorld(gfx.renderer);
      A.L.renderText(gfx.renderer); A.ov.render(gfx.renderer); frames++;
      if (CRAZYGAMES) {
        if (frames === 1) finishLoading();
        reportGameplay(A.phase === 'fight' && !A.pause.on && !A.cards.on && !A.dialogue.on && !A.timeline.on);
      }
    });
    // (11-19 用户：「首次进入游戏的加载画面我不希望是用竹子那个，做一个简单的黑色加载画面……等场景完全准备完了再渐变出来」: the first load is
    //  the plain black screen with the turning blade on every platform; it fades only after the title is built, its shaders compiled
    //  and a few of its frames drawn behind the black)
    bootShow();
    try { await start(); precompileAll(); await waitFrames(6); } finally { bootDone(); }
    void withLoadingBlade;
    dh.ready();
  } catch (e) { const err = e as Error | null; console.error('[act]', err && err.stack ? String(err) + '\n' + err.stack : err); dh.fail(e); }
});
