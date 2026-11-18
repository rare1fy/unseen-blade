import * as THREE from 'three';
import { toon } from '../look/toon';

export type WipeLook = 'bamboo' | 'pillar';
export function wipeCover(look: WipeLook) {
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

