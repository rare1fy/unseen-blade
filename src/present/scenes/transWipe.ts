// 实物前景擦（浪人篇 DESIGN §3.4，用户选的换场景方式）：一丛竹子（或一根木柱）从镜头前横着扫过去，挡满画面的那一刻换场景，
// 新场景在它后面露出来。挡住画面的是有光照的实物（不是黑屏、不是遮罩）。物件跟着镜头走（放在镜头坐标系里，离镜头 1 米上下），
// 所以换场景前后它是同一样东西连续扫过去。
import * as THREE from 'three';
import { camera, scene, V3, frames, precompile } from '../engine/world';
import { animP } from '../engine/clock';
import { toon } from '../look/toon';
import { cue } from '../../audio/cues';

export type WipeLook = 'bamboo' | 'pillar';
export const WIPE = { look: 'bamboo' as WipeLook };

function occluder(look: WipeLook) {
  const g = new THREE.Group();
  if (look === 'bamboo') {
    // overlapping stalks at three depths, big tone blocks, a pale node band every ~0.9 m (whole bands, no speckle)
    const greens = [0x2e4a2a, 0x3a5a30, 0x264024, 0x46683a];
    for (let i = 0; i < 9; i++) {
      const w = 0.26 + (i % 3) * 0.04, x = -1.2 + i * 0.3, z = -(i % 3) * 0.12, col = greens[i % greens.length];
      const st = new THREE.Mesh(new THREE.BoxGeometry(w, 8, w), toon(col)); st.position.set(x, 0, z); g.add(st);
      for (let y = -3.4 + (i % 2) * 0.4; y < 4; y += 0.9) { const n = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.06, w + 0.03), toon(0x6a8a50)); n.position.set(x, y, z); g.add(n); }
    }
  } else {
    // a big dark timber post with an iron band and a vermilion face strip
    const post = new THREE.Mesh(new THREE.BoxGeometry(2.6, 8, 0.6), toon(0x3a2a1e)); g.add(post);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 0.62), toon(0x7a2a1e)); strip.position.x = 0.7; g.add(strip);
    for (const y of [-1.4, 1.2]) { const band = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.18, 0.66), toon(0x2a2a30)); band.position.y = y; g.add(band); }
  }
  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.renderOrder = 5; m.frustumCulled = false; } });
  return g;
}

/** sweep the occluder across the lens; swap() runs while it covers the whole view */
export async function wipeTransit(swap: () => void) {
  const g = occluder(WIPE.look); scene.add(g);
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
  try { swap(); } catch (e) { console.error('[wipe] swap failed', e); }
  precompile();
  await frames(3);
  await animP(0.45, k => place(-2.6 * k * k * (1.4 - 0.4 * k)), { real: true });   // out, gathering speed
  scene.remove(g); g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
}
