import { bladeWorking, drawLoadingBlade, setLoadingWarmup } from '../scenes/loadingBlade';
import { drawBoot, bootBusy } from '../scenes/bootScreen';
// Renderer + frame loop: real dt (capped) → game clock (hitstop / slowmo / speed) → updaters → dice → particles / prims →
// camera rig (base + offset + trauma shake) → 3D render → UI render (pxui shares the WebGL context).
import * as THREE from 'three';
import { scene, camera, view, runUpdaters, runLateUpdaters, runRealUpdaters, V3, GL, padLights, restoreLights, lightFocus } from './world';
import { tick, FX, clock, PAUSE } from './clock';
import { updateParticles } from './particles';
import { updatePrims } from './prims';
import { updateDice } from '../dice/die3d';
import type { Platform } from '../../platform/index';
import { Post } from '../look/post';
import { PX, onPixelChange } from '../look/pixel';
import { frameTimer } from './frameMeter';
import { gpuMeasuring, gpuTimeInit, gpuMark, gpuFrameEnd, gpuCount } from './gpuTime';
import { updateStageTiles, installShadowTiles } from './shadowTiles';
import { syncBatches } from './rigidBatch';
import { OPT, CAPS } from './perfOpts';
import { tierNow, onQualityChange, qualityFrame, QUALITY } from '../look/quality';

/** The camera rig: directors write base / look / fov / roll / shift; the loop adds shake and renders. */
export const CAM = { base: V3(0, 12, 12), look: lightFocus, fov: 30, off: V3(), shift: 0, shakeAmt: 0.22,
  /** 11-18 打击感: a push of the whole view (position and aim together, m) and a push-in (share of the distance to the aim) — set every
   *  frame by the game's springs, applied after the director's blend so they are not smoothed away */
  kick: V3(), zoom: 0 };

export interface Gfx { renderer: THREE.WebGLRenderer; post: Post; start(onFrame: (dt: number, rdt: number) => void, afterRender: () => void): void; stats: { calls: number; tris: number; ms: number; logic: number; render: number } }

export function createGfx(platform: Platform, canvas: any, o: { preserve?: boolean; fixedDt?: number | null } = {}): Gfx {
  // (11-18 微信帧率: no MSAA on the canvas itself — the world and the UI layer are drawn in their own targets and only copied onto it)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!o.preserve });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  GL.renderer = renderer; installShadowTiles(renderer); gpuTimeInit(renderer);
  { const cap = renderer.capabilities, ext = renderer.extensions;
    CAPS.gl2 = cap.isWebGL2; CAPS.instancing = cap.isWebGL2 || ext.has('ANGLE_instanced_arrays'); CAPS.boneTex = cap.floatVertexTextures; CAPS.derivatives = cap.isWebGL2 || ext.has('OES_standard_derivatives');
    // no instancing (the devtools simulator): every draw goes through renderBufferDirect (the view, the shadow pass, warm-ups) — an
    // instanced mesh / geometry is skipped there, whenever it was made, instead of failing (and logging) every frame
    if (!CAPS.instancing) { const rbd = renderer.renderBufferDirect.bind(renderer);
      renderer.renderBufferDirect = (cam, sc, geo, mat, obj, grp) => { if ((obj as THREE.InstancedMesh).isInstancedMesh || (geo as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return; rbd(cam, sc, geo, mat, obj, grp); }; }
    // no derivatives: three's physical (MeshStandardMaterial) shader estimates a geometry roughness from dFdx / dFdy of the normal —
    // without them it doesn't compile (water planes, glass, debris); a flat 0 there instead (it only softens specular on curved faces)
    if (!CAPS.derivatives) THREE.ShaderChunk.lights_physical_fragment = THREE.ShaderChunk.lights_physical_fragment.replace(/vec3 dxy = max\( abs\( dFdx\( nonPerturbedNormal \) \), abs\( dFdy\( nonPerturbedNormal \) \) \);\s*float geometryRoughness = [^;]*;/, 'float geometryRoughness = 0.0;');
    if (!CAPS.instancing || !CAPS.boneTex || !CAPS.derivatives) console.warn('[gfx] WebGL1 without ' + [!CAPS.instancing && 'instancing (particles, blood, leaves, debris are not drawn)', !CAPS.boneTex && 'float vertex textures (no part batching)', !CAPS.derivatives && 'derivatives (no block bevel lines, no flat shading)'].filter(Boolean).join(', ') + ' — the WeChat devtools simulator; phones have them'); }
  const timer = frameTimer(renderer);
  const post = new Post(renderer);
  setLoadingWarmup(async () => {
    // Match the target and light counts of the actual world pass. Restore
    // the screen before awaiting the GPU so the blade can keep rendering.
    padLights(); syncBatches();
    const previous = renderer.getRenderTarget();
    let ready: Promise<unknown> | undefined;
    try {
      renderer.setRenderTarget(post.rt);
      if (renderer.extensions.has('KHR_parallel_shader_compile')) ready = renderer.compileAsync(scene, camera);
      else renderer.compile(scene, camera);
    } finally { renderer.setRenderTarget(previous); restoreLights(); }
    if (ready) await ready;
  });
  const fit = () => {
    const s = platform.canvasSize(); view.w = s.w; view.h = s.h; view.dpr = Math.min(platform.dpr(), PX.on ? 3 : 2);   // the pixel look at native resolution (a 3× phone upscaled 2→3 by the browser blurred the pixels)
    renderer.setPixelRatio(view.dpr); renderer.setSize(s.w, s.h, false); post.setSize(s.w, s.h, view.dpr);
  };
  fit(); platform.onResize(fit);
  // the pixel look (look/pixel.ts): the post pipeline swaps to the low-res art buffer; the canvas and the HUD keep full resolution
  const px = () => { fit(); post.setPixel(PX.on ? PX.size : 0); }; px(); onPixelChange(px);
  onQualityChange(() => { fit(); post.setSize(view.w, view.h, view.dpr); });
  /** ms: the real frame interval; logic / render: CPU time spent in the game update and in issuing the render (smoothed) */
  const stats = { calls: 0, tris: 0, ms: 16, logic: 0, render: 0 };
  const shk = V3(), lk = V3();
  let last = platform.now(), drawnAt = -1e9;
  return {
    renderer, stats, post,
    start(onFrame, afterRender) {
      const frame = () => {
        platform.raf(frame);
        // 11-19 (用户：「手机发烫比较严重」): at most the tier's frame rate — on a 90 / 120 Hz screen the extra vsyncs are skipped (a
        // small slack so a 60 Hz screen's own beat, a hair early, still draws every one)
        { const now = platform.now(), gap = 1000 / tierNow().fps; if (now - drawnAt < gap - 2.5) return; drawnAt = now - Math.min(gap, Math.max(0, now - drawnAt - gap)); }
        if (bladeWorking()) {
          last = platform.now();
          drawLoadingBlade(renderer, view.w / Math.max(1, view.h));
          return;
        }
        const now = platform.now(), real = Math.min(0.05, Math.max(0, (now - last) / 1000)); const interval = now - last; stats.ms += ((now - last) - stats.ms) * 0.05; qualityFrame(now - last); last = now;
        const rdt0 = o.fixedDt != null ? o.fixedDt : real, rdt = PAUSE.on ? 0 : rdt0;   // paused: the world gets a zero step
        const t0 = platform.now(), dt = tick(rdt); PAUSE.rdt = rdt0;
        const fxDt = PAUSE.on && PAUSE.fx ? rdt0 : dt;
        runRealUpdaters(rdt0);
        runUpdaters(dt, rdt);
        onFrame(dt, rdt);
        updateDice(dt, rdt);
        runLateUpdaters(dt, rdt);
        updateParticles(fxDt); updatePrims(fxDt);
        // (11-18: the rumble runs on real time — on game time it stood still through every hit-stop, a frozen offset instead of a shake)
        // (act-43 反馈：「屏震还要再大点」: trauma^1.5 × 0.3 — the old trauma² × 0.22 left every small shake invisible)
        const s = Math.pow(FX.trauma, 1.5) * 0.3, T = clock.rtime;
        shk.set(Math.sin(T * 61.3) * s, Math.sin(T * 67.9 + 0.4) * s, Math.sin(T * 53.1 + 1.1) * s * 0.5);
        camera.fov = CAM.fov; camera.aspect = view.w / Math.max(1, view.h);
        camera.position.copy(CAM.base).sub(CAM.look).multiplyScalar(1 - CAM.zoom).add(CAM.look).add(CAM.off).add(CAM.kick).add(shk);
        camera.lookAt(lk.copy(CAM.look).add(CAM.kick));
        if (CAM.shift) camera.setViewOffset(view.w, view.h, 0, CAM.shift, view.w, view.h); else camera.clearViewOffset();
        camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
        const t1 = platform.now();
        timer.begin(gpuMeasuring()); renderer.info.reset(); updateStageTiles(camera); padLights(); syncBatches(); shadowTier(renderer, scene);
        try { post.render(scene, camera, clock.rtime); } finally { restoreLights(); }
        const beforeText = renderer.info.render.calls;
        gpuMark('text'); afterRender();
        const uiCalls = post.ui.calls + renderer.info.render.calls - beforeText;
        drawLoadingBlade(renderer, view.w / Math.max(1, view.h)); if (bootBusy()) drawBoot(renderer, view.w, view.h, platform.now()); gpuFrameEnd(); gpuCount();
        const t2 = platform.now(); stats.logic += ((t1 - t0) - stats.logic) * 0.05; stats.render += ((t2 - t1) - stats.render) * 0.05;
        stats.calls = renderer.info.render.calls; stats.tris = renderer.info.render.triangles;
        timer.end(interval, t2 - t0, stats.calls, stats.tris, uiCalls);
      };
      platform.raf(frame);
    },
  };
}

/** 11-18 微信帧率: the tier's shadow map size on every shadow-casting light (a phone's 高 stays at 1024, as before), redrawn every
 *  frame or (低) every other frame */
let shadowFrame = 0;
function shadowTier(r: THREE.WebGLRenderer, sc: THREE.Scene) {
  r.shadowMap.enabled = !(OPT.bakedShadows && QUALITY.tier === 'low');
  if (!r.shadowMap.enabled) return;
  const T = tierNow(), size = QUALITY.tier === 'high' && QUALITY.phone ? 1024 : T.shadowMap;
  for (const o of sc.children) {
    const l = o as THREE.DirectionalLight; if (!l.isDirectionalLight || !l.castShadow) continue;
    if (l.shadow.mapSize.x !== size) { l.shadow.mapSize.set(size, size); l.shadow.map?.dispose(); (l.shadow as unknown as { map: THREE.WebGLRenderTarget | null }).map = null; }
  }
  shadowFrame++; r.shadowMap.autoUpdate = T.shadowEvery <= 1;
  if (!r.shadowMap.autoUpdate) r.shadowMap.needsUpdate = shadowFrame % T.shadowEvery === 0;
}
