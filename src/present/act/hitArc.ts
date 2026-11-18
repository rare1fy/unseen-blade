// 挨打从哪来（act-17，GAME_PLAN 第 6 节）：主角挨打时，脚下亮一段红色弧，正对着打他的人（或箭来的方向），跟着主角走，0.7 秒淡掉。
// 不加暗色遮罩；几下连着挨打就几段弧同时亮。
import * as THREE from 'three';
import { scene } from '../engine/world';

interface Arc { m: THREE.Group; t: number; mats: THREE.MeshBasicMaterial[] }
const LIFE = 0.7, SPAN = 1.25;
export class HitArcs {
  private list: Arc[] = [];
  /** a blow from world point `from` onto a hero standing at `at` */
  show(at: THREE.Vector3, from: THREE.Vector3) {
    const dx = from.x - at.x, dz = from.z - at.z; if (dx * dx + dz * dz < 1e-6) return;
    // RingGeometry lies in xy; after rotateX(−π/2) the angle θ points along (cos θ, 0, −sin θ)
    const th = Math.atan2(-dz, dx);
    // a thick red band with a white-hot inner rim (red alone drowned in the red attack warnings)
    const m = new THREE.Group(), mats: THREE.MeshBasicMaterial[] = [];
    for (const [r0, r1, c] of [[0.7, 1.02, 0xff2a1a], [0.66, 0.74, 0xfff0e0]] as Array<[number, number, number]>) {
      const mt = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }); mats.push(mt);
      const r = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 24, 1, th - SPAN / 2, SPAN).rotateX(-Math.PI / 2), mt); r.renderOrder = 5; m.add(r);
    }
    scene.add(m); this.list.push({ m, t: 0, mats });
  }
  /** all gone at once (a cutscene starts: the world stops updating, an arc would hang there) */
  clear() { for (const a of this.list) { scene.remove(a.m); a.m.traverse(o => (o as THREE.Mesh).geometry?.dispose()); for (const mt of a.mats) mt.dispose(); } this.list.length = 0; }
  update(dt: number, at: THREE.Vector3) {
    for (const a of this.list) {
      a.t += dt; const k = a.t / LIFE;
      a.m.position.set(at.x, 0.09, at.z); a.m.scale.setScalar(1 + 0.2 * k);
      for (const mt of a.mats) mt.opacity = 0.9 * (1 - k) ** 1.5;
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].t >= LIFE) { const a = this.list[i]; scene.remove(a.m); a.m.traverse(o => (o as THREE.Mesh).geometry?.dispose()); for (const mt of a.mats) mt.dispose(); this.list.splice(i, 1); }
  }
}
