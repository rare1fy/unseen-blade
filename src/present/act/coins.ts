// Copper coins (铜钱, act-17): a slain foe throws out a few square-holed coins that bounce on the ground, then after a moment fly
// to the hero and are counted. Each coin is a flat copper block with a dark square hole (axis-aligned, no speckle).
import * as THREE from 'three';
import { V3, scene } from '../engine/world';
import { toon } from '../look/toon';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fxSparks } from '../fx/fx';

const R = (a: number, b: number) => a + Math.random() * (b - a);
// the coin: a ring of four bars round a square hole (one geometry)
const COIN_GEO = (() => {
  const s = 0.2, t = 0.04, h = 0.07, bar = (w: number, d: number, x: number, z: number) => new THREE.BoxGeometry(w, t, d).translate(x, 0, z);
  return mergeGeometries([bar(s, (s - h) / 2, 0, -(s + h) / 4), bar(s, (s - h) / 2, 0, (s + h) / 4), bar((s - h) / 2, h, -(s + h) / 4, 0), bar((s - h) / 2, h, (s + h) / 4, 0)])!;
})();
const COIN_MAT = toon(0xd09040);

interface Coin { m: THREE.Mesh; p: THREE.Vector3; v: THREE.Vector3; t: number; value: number }
export class Coins {
  private list: Coin[] = [];
  /** n coins worth `value` each burst from p */
  drop(p: THREE.Vector3, n: number, value = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(COIN_GEO, COIN_MAT); m.castShadow = true; scene.add(m);
      const a = Math.random() * Math.PI * 2, sp = R(1.2, 2.6);
      this.list.push({ m, p: p.clone().setY(0.6), v: V3(Math.cos(a) * sp, R(3, 5), Math.sin(a) * sp), t: -i * 0.03, value });
    }
  }
  /** fly / bounce / home in; returns the coins collected this frame */
  update(dt: number, hero: THREE.Vector3): number {
    let got = 0;
    for (const c of this.list) {
      c.t += dt; if (c.t < 0) { c.m.visible = false; continue; } c.m.visible = true;
      if (c.t < 0.55) {
        c.v.y -= 18 * dt; c.p.addScaledVector(c.v, dt);
        if (c.p.y < 0.06) { c.p.y = 0.06; c.v.y = Math.abs(c.v.y) * 0.4; c.v.x *= 0.6; c.v.z *= 0.6; }
        c.m.rotation.y += dt * 9;
      } else {
        // home in on the hero's chest, faster and faster
        const tgt = hero.clone().setY(1.0), d = tgt.sub(c.p), l = d.length(), sp = 6 + (c.t - 0.55) * 30;
        if (l < 0.35) { got += c.value; c.m.parent?.remove(c.m); c.t = 99; continue; }
        c.p.addScaledVector(d.multiplyScalar(1 / l), Math.min(l, sp * dt)); c.m.rotation.y += dt * 14;
      }
      c.m.position.copy(c.p);
    }
    this.list = this.list.filter(c => c.t < 99);
    if (got) fxSparks(hero.clone().setY(1.0), 0xffd070, Math.min(10, 3 + got), 2);
    return got;
  }
  clear() { for (const c of this.list) c.m.parent?.remove(c.m); this.list = []; }
}
