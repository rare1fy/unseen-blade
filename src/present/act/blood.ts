import { instanceMatrix, instanceColor, finishInstances } from "../engine/uploads";
// 血（act-23，用户：「给战斗加点血浆，砍上去要溅血才有感觉」）：砍中时从伤口顺着刀路喷一串体素血块，落地变成贴地的方块血点，
// 几秒后缩掉；斩杀时身下洇开一摊。血块是小立方体、血点是贴地的正方形（不转角度：横平竖直，和体素场景一致），颜色是压暗的红，
// 不发光、不饱和到荧光。全场血块和血点各一个实例化网格、各有上限（最老的先让位），一帧两次绘制。
import * as THREE from 'three';
import { scene, V3, R } from '../engine/world';
import { floor } from '../engine/prims';
import { PALPHA, TILE } from '../engine/particles';

const MAXD = 360, MAXS = 280;
const DROP = [0x8a1010, 0xa81814, 0xc4221a].map(c => new THREE.Color(c));
const STAIN = [0x6a0c0c, 0x7c100e, 0x8c1612].map(c => new THREE.Color(c));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
type Drop = { p: THREE.Vector3; v: THREE.Vector3; s: number; c: THREE.Color };
type Stain = { x: number; y: number; z: number; s: number; grow: number; age: number; life: number; c: THREE.Color };
const _white = new THREE.Color(1, 1, 1);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

class Blood {
  private drops: Drop[] = []; private stains: Stain[] = [];
  private dm: THREE.InstancedMesh | null = null; private sm: THREE.InstancedMesh | null = null;
  /** 11-18 屋子形态: where a drop leaves no stain (over the water / a gully: it would float at floor height); set per room */
  skip: ((x: number, z: number) => boolean) | null = null;
  prepare() {
    this.init();
    for (const m of [this.dm!, this.sm!]) if (!m.instanceColor) m.setColorAt(0, _white);
  }
  private init() {
    if (this.dm) return;
    this.dm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXD);
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    this.sm = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), MAXS);
    for (const m of [this.dm, this.sm]) { m.count = 0; m.frustumCulled = false; m.renderOrder = 2; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
    this.sm.renderOrder = 1;
  }
  /** a spurt from a wound at p, thrown along dir (the blade's way, horizontal); n blocks, power scales the speed */
  spray(p: THREE.Vector3, dir: THREE.Vector3, n: number, power = 1) {
    this.init();
    const side = V3(-dir.z, 0, dir.x);
    for (let i = 0; i < n; i++) {
      if (this.drops.length >= MAXD) this.drops.shift();
      const v = dir.clone().multiplyScalar(R(1.4, 4.2) * power).addScaledVector(side, R(-1.3, 1.3) * power).add(V3(0, R(0.6, 3.0) * Math.sqrt(power), 0));
      this.drops.push({ p: p.clone().add(V3(R(-0.08, 0.08), R(-0.1, 0.1), R(-0.08, 0.08))), v, s: R(0.045, 0.095) * (i < 4 ? 1.5 : 1), c: pick(DROP) });
    }
    // a little dark mist where it opens (alpha particles, short)
    for (let i = 0; i < Math.min(4, 1 + (n >> 3)); i++) PALPHA?.emit({ p: p.clone().addScaledVector(dir, 0.15), v: dir.clone().multiplyScalar(R(0.6, 1.6)).add(V3(R(-0.3, 0.3), R(0, 0.5), R(-0.3, 0.3))),
      s0: R(0.1, 0.16), s1: R(0.28, 0.42), life: R(0.25, 0.4), c0: DROP[1].clone(), c1: STAIN[0].clone(), alpha: 0.5, tile: TILE.smoke, drag: 3, fadeIn: 0 });
  }
  /** a pool spreading under a body (x, z), up to size metres across, over ~1.2 s; it lasts `life` s */
  pool(x: number, z: number, size: number, life = 10) {
    this.init();
    for (let i = 0; i < 5; i++) this.stain(x + R(-0.35, 0.35) * size, z + R(-0.35, 0.35) * size, size * R(0.35, 0.6), 1.2 + R(0, 0.6), life);
  }
  /** 11-18 (序章倒地): blood running off a wound — n drops let go at p with next to no speed, falling straight down */
  drip(p: THREE.Vector3, n = 1) {
    this.init();
    for (let i = 0; i < n; i++) {
      if (this.drops.length >= MAXD) this.drops.shift();
      this.drops.push({ p: p.clone().add(V3(R(-0.04, 0.04), R(-0.03, 0.03), R(-0.04, 0.04))), v: V3(R(-0.12, 0.12), R(-0.5, 0), R(-0.12, 0.12)), s: R(0.03, 0.055), c: pick(DROP) });
    }
  }
  private stain(x: number, z: number, s: number, grow = 0.08, life = R(6, 9)) {
    if (this.skip?.(x, z)) return;
    if (this.stains.length >= MAXS) this.stains.shift();
    this.stains.push({ x: Math.round(x / 0.035) * 0.035, y: floor.at(x, z), z: Math.round(z / 0.035) * 0.035, s, grow, age: 0, life, c: pick(STAIN) });
  }
  clear() { this.drops.length = 0; this.stains.length = 0; if (this.dm) { this.dm.count = 0; this.sm!.count = 0; } }
  update(dt: number) {
    if (!this.dm || !this.sm) return;
    const drops = this.drops.length - MAXD, stains = this.stains.length - MAXS;
    if (drops > 0) this.drops.splice(0, drops);
    if (stains > 0) this.stains.splice(0, stains);
    let n = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]; d.v.y -= 16 * dt; d.v.multiplyScalar(Math.exp(-0.6 * dt)); d.p.addScaledVector(d.v, dt);
      const g = floor.at(d.p.x, d.p.z);
      if (d.p.y <= g + d.s * 0.5) { this.stain(d.p.x, d.p.z, d.s * R(2.0, 3.8)); this.drops.splice(i, 1); continue; }
    }
    for (const d of this.drops) { _m.compose(d.p, _q.identity(), _s.setScalar(d.s)); instanceMatrix(this.dm, n, _m); instanceColor(this.dm, n, d.c); n++; }
    this.dm.count = n; finishInstances(this.dm);
    n = 0;
    for (let i = this.stains.length - 1; i >= 0; i--) { const s = this.stains[i]; s.age += dt; if (s.age >= s.life) this.stains.splice(i, 1); }
    for (let i = 0; i < this.stains.length; i++) {
      const s = this.stains[i], k = Math.min(1, s.age / s.grow) * Math.min(1, (s.life - s.age) / 1.2), w = s.s * k;
      _m.compose(_p.set(s.x, s.y + 0.012 + i * 0.00004, s.z), _q.identity(), _s.set(w, 1, w)); instanceMatrix(this.sm, n, _m); instanceColor(this.sm, n, s.c); n++;
    }
    this.sm.count = n; finishInstances(this.sm);
  }
}
export const blood = new Blood();
