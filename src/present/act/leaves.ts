// 落叶（act-19，用户：「场景里我希望有更多不同的天气效果和光影效果，飘飘落叶啊什么的，最好这些落叶也会跟战斗有所交互，当然是
// 在性能允许的情况下」「导航…像哈迪斯和对马岛之魂一样由一个融入场景的特效导航」）：
// 地上铺着一层落叶、空中不时飘下几片；挥刀经过的叶子被斩成两半旋开，冲刺带起一串，爆炸 / 倒地把周围的掀飞；
// 清场后的「引路风」：一阵风从主角脚下卷起叶子、贴地吹向每个出口，一缕金色尘光沿路流进门洞。
// 一个 InstancedMesh 画全部叶子（上限 MAX），一个画尘光；每片叶子是一块薄薄的体素片（横平竖直，不旋成斜线：只绕竖轴转、翻面时整片翻）。
import * as THREE from 'three';
import { scene } from '../engine/world';
import { PLAY } from '../scenes/props';

const MAX = 220, MOTES = 64;
const PAL: Record<string, number[]> = {
  autumn: [0xc89a3a, 0xb8782a, 0x9a6a2a, 0xd8b04a, 0x8a5a24],
  spring: [0xe8b0b8, 0xf0c8c8, 0x8ab04a, 0xd898a8],
  summer: [0x6a9a3a, 0x5a8a34, 0x7aa848, 0x4e7a2e],
  winter: [],
};
const L = { px: 0, py: 1, pz: 2, vx: 3, vy: 4, vz: 5, yaw: 6, spin: 7, flip: 8, s: 9, age: 10, life: 11, air: 12, ph: 13 } as const, N = 14;

export class Leaves {
  private mesh: THREE.InstancedMesh; private motes: THREE.InstancedMesh; private d = new Float32Array(MAX * N); private live = 0;
  private md = new Float32Array(MOTES * 8); private mLive = 0; private cols: number[]; private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private fallT = 0; private wind = new THREE.Vector2(0.35, 0.1); private tmpC = new THREE.Color();
  on: boolean;
  constructor(season: string, o: { rest?: number; fall?: number; wind?: number } = {}) {
    this.cols = PAL[season] ?? PAL.autumn; this.on = this.cols.length > 0;
    const g = new THREE.BoxGeometry(0.15, 0.018, 0.09);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.motes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }), MOTES);
    this.motes.count = 0; this.motes.frustumCulled = false; this.motes.renderOrder = 5;
    scene.add(this.mesh, this.motes);
    this.fallRate = o.fall ?? 1.2; this.wind.multiplyScalar(o.wind ?? 1);
    if (this.on) for (let i = 0; i < (o.rest ?? 90); i++) this.add(PLAY.x0 + Math.random() * (PLAY.x1 - PLAY.x0), 0, PLAY.z0 + Math.random() * (PLAY.z1 - PLAY.z0), 0, 0, 0, false);
  }
  private fallRate: number;
  /** a leaf at (x, y, z) moving (vx, vy, vz); air = falling / flying, else lying on the ground. Returns its slot or −1 */
  private add(x: number, y: number, z: number, vx: number, vy: number, vz: number, air: boolean, s = 1) {
    if (!this.on) return -1;
    let i = this.live;
    if (i >= MAX) { // full: reuse the oldest leaf lying on the ground
      let best = -1, age = -1; for (let k = 0; k < MAX; k++) if (!this.d[k * N + L.air] && this.d[k * N + L.age] > age) { age = this.d[k * N + L.age]; best = k; }
      if (best < 0) return -1; i = best;
    } else this.live++;
    const o = i * N, d = this.d;
    d[o + L.px] = x; d[o + L.py] = air ? y : 0.012; d[o + L.pz] = z; d[o + L.vx] = vx; d[o + L.vy] = vy; d[o + L.vz] = vz;
    d[o + L.yaw] = Math.random() * 4; d[o + L.spin] = air ? (Math.random() - 0.5) * 9 : 0; d[o + L.flip] = 0; d[o + L.s] = s * (0.8 + Math.random() * 0.45);
    d[o + L.age] = 0; d[o + L.life] = 30 + Math.random() * 30; d[o + L.air] = air ? 1 : 0; d[o + L.ph] = Math.random() * 6.3;
    this.tmpC.setHex(this.cols[Math.floor(Math.random() * this.cols.length)]); this.mesh.setColorAt(i, this.tmpC); this.mesh.instanceColor!.needsUpdate = true;
    return i;
  }
  /** the leaves lying near (x, z) within r: lifted and thrown along (dx, dz) at speed sp (a dash, a footfall, a body hitting the ground) */
  kick(x: number, z: number, r: number, dx: number, dz: number, sp: number, up = 2.4) {
    const d = this.d;
    for (let i = 0; i < this.live; i++) { const o = i * N; if (d[o + L.air]) continue; const ex = d[o + L.px] - x, ez = d[o + L.pz] - z; if (ex * ex + ez * ez > r * r) continue;
      d[o + L.air] = 1; d[o + L.py] = 0.05; d[o + L.vx] = dx * sp * (0.6 + Math.random() * 0.6) + (Math.random() - 0.5) * 1.2; d[o + L.vz] = dz * sp * (0.6 + Math.random() * 0.6) + (Math.random() - 0.5) * 1.2; d[o + L.vy] = up * (0.5 + Math.random() * 0.7); d[o + L.spin] = (Math.random() - 0.5) * 14; }
  }
  /** a blast: every leaf within r flies away from (x, z) (air or ground), faster near the middle */
  blast(x: number, z: number, r: number, sp: number) {
    const d = this.d;
    for (let i = 0; i < this.live; i++) { const o = i * N, ex = d[o + L.px] - x, ez = d[o + L.pz] - z, l = Math.hypot(ex, ez); if (l > r) continue; const k = 1 - l / r, nx = l > 1e-3 ? ex / l : Math.random() - 0.5, nz = l > 1e-3 ? ez / l : Math.random() - 0.5;
      d[o + L.air] = 1; d[o + L.py] = Math.max(0.05, d[o + L.py]); d[o + L.vx] += nx * sp * (0.4 + k); d[o + L.vz] += nz * sp * (0.4 + k); d[o + L.vy] += 2 + 4 * k * Math.random(); d[o + L.spin] = (Math.random() - 0.5) * 18; }
    // a blast also throws a few fresh leaves up from the ground
    for (let n = 0; n < 6; n++) { const a = Math.random() * 6.3; this.add(x + Math.cos(a) * 0.4, 0.1, z + Math.sin(a) * 0.4, Math.cos(a) * sp * 0.6, 3 + Math.random() * 3, Math.sin(a) * sp * 0.6, true); }
  }
  /** the blade's arc (from, facing yaw, range, half angle, at hip height): leaves in it are cut in two, the halves spin apart */
  cutArc(fx: number, fz: number, yaw: number, range: number, half: number) {
    const d = this.d, ux = Math.sin(yaw), uz = Math.cos(yaw), n0 = this.live;
    for (let i = 0; i < n0; i++) {
      const o = i * N, ex = d[o + L.px] - fx, ez = d[o + L.pz] - fz, l = Math.hypot(ex, ez); if (l > range + 0.2 || l < 0.2) continue;
      if (Math.abs(Math.atan2(ex * uz - ez * ux, ex * ux + ez * uz)) > half + 0.15) continue;
      if (!d[o + L.air] && Math.random() < 0.55) { this.kick(d[o + L.px], d[o + L.pz], 0.05, ex / l, ez / l, 2.2, 2.6); continue; }
      if (d[o + L.s] < 0.6) continue;   // already a half
      // the cut: this leaf becomes one half, a second half flies the other way across the blade's line
      const s = d[o + L.s] * 0.62, px = d[o + L.px], py = Math.max(0.3, d[o + L.py]), pz = d[o + L.pz], tx = -ez / l, tz = ex / l;
      d[o + L.s] = s; d[o + L.air] = 1; d[o + L.py] = py; d[o + L.vx] = tx * 2.4 + ex / l * 1.2; d[o + L.vz] = tz * 2.4 + ez / l * 1.2; d[o + L.vy] = 1.6; d[o + L.spin] = 16;
      this.add(px, py, pz, -tx * 2.4 + ex / l * 1.2, 1.8, -tz * 2.4 + ez / l * 1.2, true, s / 1.0);
    }
  }
  /** the guiding wind: a gust from (x, z) toward (tx, tz) — leaves roll and fly low toward it, a thread of gold motes runs along */
  gust(x: number, z: number, tx: number, tz: number) {
    const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, sp = Math.min(7.5, 2.6 + l * 0.35);
    for (let n = 0; n < 9; n++) { const a = (Math.random() - 0.5) * 1.6, ox = -uz * a, oz = ux * a; this.add(x + ox + ux * 0.5, 0.05 + Math.random() * 0.3, z + oz + uz * 0.5, ux * sp * (0.8 + Math.random() * 0.4), 0.8 + Math.random() * 1.2, uz * sp * (0.8 + Math.random() * 0.4), true); }
    this.kick(x + ux * 1.2, z + uz * 1.2, 2.2, ux, uz, sp * 0.8, 1.2);
    // gold motes: born round the hero, drifting along the way with a slow sway, fading on the far end
    for (let n = 0; n < 10 && this.mLive < MOTES; n++) { const o = this.mLive++ * 8, md = this.md, a = (Math.random() - 0.5) * 1.2;
      md[o] = x - uz * a + (Math.random() - 0.5) * 0.4; md[o + 1] = 0.4 + Math.random() * 0.9; md[o + 2] = z + ux * a + (Math.random() - 0.5) * 0.4;
      md[o + 3] = ux * (2.6 + Math.random() * 1.6); md[o + 4] = uz * (2.6 + Math.random() * 1.6); md[o + 5] = 0; md[o + 6] = l / 3.2 + Math.random() * 0.6; md[o + 7] = Math.random() * 6.3; }
  }
  update(dt: number, camX: number, camZ: number) {
    if (!this.on) { this.mesh.count = 0; this.motes.count = 0; return; }
    // a few leaves drift down round the view
    this.fallT -= dt * this.fallRate; while (this.fallT < 0) { this.fallT += 1; this.add(camX + (Math.random() - 0.5) * 22, 5 + Math.random() * 2.5, camZ - 4 + (Math.random() - 0.5) * 16, this.wind.x, -0.6, this.wind.y, true); }
    const d = this.d;
    for (let i = 0; i < this.live; i++) {
      const o = i * N; d[o + L.age] += dt;
      if (d[o + L.air]) {
        // air: drag toward the breeze, a slow fall with a sway, spin settling
        const k = Math.min(1, dt * 1.6); d[o + L.vx] += (this.wind.x - d[o + L.vx]) * k; d[o + L.vz] += (this.wind.y - d[o + L.vz]) * k;
        d[o + L.vy] = Math.max(-1.1, d[o + L.vy] - 6 * dt); const sw = Math.sin(d[o + L.age] * 3.1 + d[o + L.ph]) * 0.6;
        d[o + L.px] += (d[o + L.vx] + sw) * dt; d[o + L.py] += d[o + L.vy] * dt; d[o + L.pz] += (d[o + L.vz] + sw * 0.4) * dt;
        d[o + L.yaw] += d[o + L.spin] * dt; d[o + L.spin] *= Math.exp(-dt * 0.8); d[o + L.flip] += d[o + L.spin] * dt * 0.6;
        if (d[o + L.py] <= 0.012) { d[o + L.py] = 0.012; d[o + L.air] = 0; d[o + L.flip] = 0; d[o + L.age] = 0; }
      } else if (d[o + L.age] > d[o + L.life]) { // an old leaf on the ground goes: swap the last one in
        const last = --this.live; if (i !== last) { d.copyWithin(o, last * N, last * N + N); const c = new THREE.Color(); this.mesh.getColorAt(last, c); this.mesh.setColorAt(i, c); this.mesh.instanceColor!.needsUpdate = true; i--; } continue;
      }
      // out of the stage: gone
      if (d[o + L.px] < PLAY.x0 - 14 || d[o + L.px] > PLAY.x1 + 14 || d[o + L.pz] < PLAY.z0 - 14 || d[o + L.pz] > PLAY.z1 + 8) d[o + L.age] = d[o + L.life] + 1, d[o + L.air] = 0;
      // flat on the ground; in the air it turns about the vertical and flips over whole (a half turn, not a slant)
      const flip = d[o + L.air] ? (Math.floor(d[o + L.flip] / 1.5708) & 1) * Math.PI : 0;
      this.e.set(flip, d[o + L.yaw], 0); this.q.setFromEuler(this.e); const s = d[o + L.s];
      this.m4.compose(new THREE.Vector3(d[o + L.px], d[o + L.py], d[o + L.pz]), this.q, new THREE.Vector3(s, 1, s)); this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.count = this.live; this.mesh.instanceMatrix.needsUpdate = true;
    const md = this.md;
    for (let i = 0; i < this.mLive; i++) {
      const o = i * 8; md[o + 5] += dt; if (md[o + 5] > md[o + 6]) { const last = --this.mLive; if (i !== last) { md.copyWithin(o, last * 8, last * 8 + 8); i--; } continue; }
      md[o] += md[o + 3] * dt; md[o + 2] += md[o + 4] * dt; md[o + 1] += Math.sin(md[o + 5] * 4 + md[o + 7]) * 0.3 * dt;
      const k = Math.min(1, md[o + 5] / 0.25) * Math.min(1, (md[o + 6] - md[o + 5]) / 0.5), s = 0.6 + 0.6 * k;
      this.m4.makeScale(s, s, s).setPosition(md[o], md[o + 1], md[o + 2]); this.motes.setMatrixAt(i, this.m4);
    }
    this.motes.count = this.mLive; this.motes.instanceMatrix.needsUpdate = true;
  }
  dispose() { scene.remove(this.mesh, this.motes); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.motes.geometry.dispose(); (this.motes.material as THREE.Material).dispose(); }
}
