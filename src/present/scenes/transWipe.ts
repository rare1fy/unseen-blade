import { withLoadingBlade } from './loadingBlade';
// 实物前景擦（浪人篇 DESIGN §3.4，用户选的换场景方式）：一丛竹子（或一根木柱）从镜头前横着扫过去，挡满画面的那一刻换场景，
// 新场景在它后面露出来。挡住画面的是有光照的实物（不是黑屏、不是遮罩）。物件跟着镜头走（放在镜头坐标系里，离镜头 1 米上下），
// 所以换场景前后它是同一样东西连续扫过去。
import * as THREE from 'three';
import { camera, scene, V3, frames, precompile } from '../engine/world';
import { animP } from '../engine/clock';
import { wipeCover, type WipeLook } from './wipeCover';
import { cue } from '../../audio/cues';

export type { WipeLook } from './wipeCover';
export const WIPE = { look: 'bamboo' as WipeLook };

/** sweep the occluder across the lens; swap() runs while it covers the whole view */
export async function wipeTransit(swap: () => void | Promise<void>) {
  if (__WX__) { cue('whoosh', 0.7); await withLoadingBlade(swap, WIPE.look); return; }
  const g = wipeCover(WIPE.look); scene.add(g);
  const place = (x: number) => {
    // camera space: 1.05 m ahead, x across the view (the cluster is ~2.6 m wide; the view there is ~1.6 m)
    const q = camera.quaternion, p = camera.position.clone().add(V3(x, 0, -1.05).applyQuaternion(q));
    g.position.copy(p); g.quaternion.copy(q);
  };
  cue('whoosh', 0.7);
  place(2.6);
  // act-34 (用户：「现在转场的时候有点卡」): the cover used to arrive at full speed and the new place was built in that frame, so the
  // stalks stopped dead mid-sweep (a stall) and the first frames of the new place (shader compiles, mesh uploads) jerked the way out.
  // Now the cover glides in and comes to rest over the view; the swap, the shader compile and three frames of uploads happen while
  // nothing on screen is meant to move; then it leaves, gathering speed.
  await animP(0.4, k => place(2.6 * (1 - k) * (1 - k) * (1 - k)), { real: true });   // in, easing to rest
  try { await swap(); } catch (e) { console.error('[wipe] swap failed', e); }
  precompile();
  await frames(3);
  await animP(0.45, k => place(-2.6 * k * k * (1.4 - 0.4 * k)), { real: true });   // out, gathering speed
  scene.remove(g); g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
}
