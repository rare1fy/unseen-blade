import * as THREE from 'three';
import { toon } from '../look/toon';

// (11-19 用户：「战斗的转场也用竹子那一套，卷轴那个看不出来，删掉」: bamboo only — the timber post is gone)
export type WipeLook = 'bamboo';
export function wipeCover(look: WipeLook = 'bamboo') {
  const g = new THREE.Group(); void look;
  {
    // overlapping stalks at three depths, big tone blocks, a pale node band every ~0.9 m (whole bands, no speckle)
    const greens = [0x2e4a2a, 0x3a5a30, 0x264024, 0x46683a];
    for (let i = 0; i < 9; i++) {
      const w = 0.26 + (i % 3) * 0.04, x = -1.2 + i * 0.3, z = -(i % 3) * 0.12, col = greens[i % greens.length];
      const st = new THREE.Mesh(new THREE.BoxGeometry(w, 8, w), toon(col)); st.position.set(x, 0, z); g.add(st);
      for (let y = -3.4 + (i % 2) * 0.4; y < 4; y += 0.9) { const n = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.06, w + 0.03), toon(0x6a8a50)); n.position.set(x, y, z); g.add(n); }
    }
  }
  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.renderOrder = 5; m.frustumCulled = false; } });
  return g;
}

