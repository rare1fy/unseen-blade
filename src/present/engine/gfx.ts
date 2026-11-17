// Renderer + frame loop: real dt (capped) → game clock (hitstop / slowmo / speed) → updaters → dice → particles / prims →
// camera rig (base + offset + trauma shake) → 3D render → UI render (pxui shares the WebGL context).
import * as THREE from 'three';
import { scene, camera, view, runUpdaters, runLateUpdaters, V3, GL, padLights } from './world';
import { tick, FX, clock } from './clock';
import { updateParticles } from './particles';
import { updatePrims } from './prims';
import { updateDice } from '../dice/die3d';
import type { Platform } from '../../platform/index';
import { Post } from '../look/post';
import { PX, onPixelChange } from '../look/pixel';

/** The camera rig: directors write base / look / fov / roll / shift; the loop adds shake and renders. */
export const CAM = { base: V3(0, 12, 12), look: V3(0, 0, 0), fov: 30, off: V3(), shift: 0, shakeAmt: 0.22 };

export interface Gfx { renderer: THREE.WebGLRenderer; post: Post; start(onFrame: (dt: number, rdt: number) => void, afterRender: () => void): void; stats: { calls: number; tris: number; ms: number; logic: number; render: number } }

export function createGfx(platform: Platform, canvas: any, o: { preserve?: boolean; fixedDt?: number | null } = {}): Gfx {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!o.preserve });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  GL.renderer = renderer;
  const post = new Post(renderer);
  const fit = () => {
    const s = platform.canvasSize(); view.w = s.w; view.h = s.h; view.dpr = Math.min(platform.dpr(), PX.on ? 3 : 2);   // the pixel look at native resolution (a 3× phone upscaled 2→3 by the browser blurred the pixels)
    renderer.setPixelRatio(view.dpr); renderer.setSize(s.w, s.h, false); post.setSize(s.w, s.h, view.dpr);
  };
  fit(); platform.onResize(fit);
  // the pixel look (look/pixel.ts): the post pipeline swaps to the low-res art buffer; the canvas and the HUD keep full resolution
  const px = () => { fit(); post.setPixel(PX.on ? PX.size : 0); }; px(); onPixelChange(px);
  /** ms: the real frame interval; logic / render: CPU time spent in the game update and in issuing the render (smoothed) */
  const stats = { calls: 0, tris: 0, ms: 16, logic: 0, render: 0 };
  const shk = V3();
  let last = platform.now();
  return {
    renderer, stats, post,
    start(onFrame, afterRender) {
      const frame = () => {
        platform.raf(frame);
        const now = platform.now(), real = Math.min(0.05, Math.max(0, (now - last) / 1000)); stats.ms += ((now - last) - stats.ms) * 0.05; last = now;
        const rdt = o.fixedDt != null ? o.fixedDt : real;
        const t0 = platform.now(), dt = tick(rdt);
        runUpdaters(dt, rdt);
        onFrame(dt, rdt);
        updateDice(dt, rdt);
        runLateUpdaters(dt, rdt);
        updateParticles(dt); updatePrims(dt);
        const s = FX.trauma * FX.trauma * CAM.shakeAmt, T = clock.time;
        shk.set(Math.sin(T * 61.3) * s, Math.sin(T * 67.9 + 0.4) * s, Math.sin(T * 53.1 + 1.1) * s * 0.5);
        camera.fov = CAM.fov; camera.aspect = view.w / Math.max(1, view.h);
        camera.position.copy(CAM.base).add(CAM.off).add(shk); camera.lookAt(CAM.look);
        if (CAM.shift) camera.setViewOffset(view.w, view.h, 0, CAM.shift, view.w, view.h); else camera.clearViewOffset();
        camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
        const t1 = platform.now();
        renderer.info.reset(); padLights();
        post.render(scene, camera, clock.rtime);
        const t2 = platform.now(); stats.logic += ((t1 - t0) - stats.logic) * 0.05; stats.render += ((t2 - t1) - stats.render) * 0.05;
        stats.calls = renderer.info.render.calls; stats.tris = renderer.info.render.triangles;
        afterRender();
      };
      platform.raf(frame);
    },
  };
}
