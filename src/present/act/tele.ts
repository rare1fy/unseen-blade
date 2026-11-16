// 地面预警（敌人出招前在地上亮出攻击范围）：扇形（劈砍）、长条（扑咬 / 冲撞）、圆（砸地）、细线（弓箭瞄准）。
// 一层淡色底面 = 范围，一层随蓄力长满的填充 = 还剩多久，一圈亮边。出手那一下整块亮一下再淡掉。颜色是暗红橙，透明度克制
// （CLAUDE.md：高亮要克制），不压暗画面。
import * as THREE from 'three';
import { scene } from '../engine/world';

export type TeleShape = { k: 'cone'; r: number; half: number } | { k: 'rect'; len: number; w: number } | { k: 'circle'; r: number; ahead: number } | { k: 'line'; len: number };
const COL = 0xff4a26, EDGE = 0xff9a60;
const mat = (o: number, c = COL) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });

function geo(s: TeleShape): THREE.BufferGeometry {
  if (s.k === 'cone') { const g = new THREE.CircleGeometry(s.r, 28, Math.PI / 2 - s.half, s.half * 2); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI); return g; }
  if (s.k === 'circle') { const g = new THREE.CircleGeometry(s.r, 40); g.rotateX(-Math.PI / 2); g.translate(0, 0, s.ahead); return g; }
  const w = s.k === 'rect' ? s.w : 0.14, len = s.len, g = new THREE.PlaneGeometry(w, len); g.rotateX(-Math.PI / 2); g.translate(0, 0, len / 2); return g;
}
function edgeGeo(s: TeleShape): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  if (s.k === 'cone') { pts.push(new THREE.Vector3(0, 0, 0)); for (let i = 0; i <= 24; i++) { const a = -s.half + (i / 24) * s.half * 2; pts.push(new THREE.Vector3(Math.sin(a) * s.r, 0, Math.cos(a) * s.r)); } pts.push(new THREE.Vector3(0, 0, 0)); }
  else if (s.k === 'circle') for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(a) * s.r, 0, s.ahead + Math.cos(a) * s.r)); }
  else { const w = (s.k === 'rect' ? s.w : 0.14) / 2, l = s.len; pts.push(new THREE.Vector3(-w, 0, 0), new THREE.Vector3(w, 0, 0), new THREE.Vector3(w, 0, l), new THREE.Vector3(-w, 0, l), new THREE.Vector3(-w, 0, 0)); }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/** pale bars across the shape for the attacks a jump clears (one shared image, a texture per telegraph for its own repeat) */
let STRIPE: HTMLCanvasElement | null = null;
function stripeTex(rep: number) {
  if (!STRIPE) { STRIPE = document.createElement('canvas'); STRIPE.width = 4; STRIPE.height = 8; const g = STRIPE.getContext('2d')!; g.fillStyle = '#ffffff'; g.fillRect(0, 0, 4, 3); }
  const t = new THREE.CanvasTexture(STRIPE); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.repeat.set(1, rep); return t;
}

export class Tele {
  g = new THREE.Group(); private area: THREE.Mesh; private fill: THREE.Mesh; private edge: THREE.Line; private flashT = -1; private dead = false;
  private bars: THREE.Mesh | null = null;
  constructor(public s: TeleShape, o: { low?: boolean } = {}) {
    this.area = new THREE.Mesh(geo(s), mat(s.k === 'line' ? 0.18 : 0.13)); this.fill = new THREE.Mesh(geo(s), mat(0.3)); this.fill.scale.setScalar(0.001);
    this.edge = new THREE.Line(edgeGeo(s), new THREE.LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0.55, depthWrite: false }));
    for (const o2 of [this.area, this.fill, this.edge]) { o2.renderOrder = 3; this.g.add(o2); }
    // a jumpable attack: pale bars across it, drifting along it (read as "over this")
    if (o.low && typeof document !== 'undefined') {
      const len = s.k === 'rect' ? s.len : s.k === 'circle' ? s.r * 2 : 2, m = new THREE.MeshBasicMaterial({ color: 0xfff0d0, map: stripeTex(len / 0.55), transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide });
      this.bars = new THREE.Mesh(geo(s), m); this.bars.renderOrder = 4; this.g.add(this.bars);
    }
    this.g.position.y = 0.05; scene.add(this.g);
  }
  /** at (x, z) facing yaw; progress 0..1 grows the fill (cone / circle: outward; rect / line: along) */
  set(x: number, z: number, yaw: number, p: number) {
    this.g.position.x = x; this.g.position.z = z; this.g.rotation.y = yaw;
    const k = Math.max(0.001, Math.min(1, p)), s = this.s;
    if (s.k === 'rect' || s.k === 'line') this.fill.scale.set(1, 1, k);
    else if (s.k === 'circle') { this.fill.scale.set(k, 1, k); this.fill.position.z = s.ahead * (1 - k); }
    else this.fill.scale.set(k, 1, k);
    (this.edge.material as THREE.LineBasicMaterial).opacity = 0.35 + 0.4 * k;
  }
  /** the blow lands: the whole shape flashes, then fades and is removed */
  flash() { this.flashT = 0; this.fill.scale.setScalar(1); if (this.s.k === 'circle') this.fill.position.z = 0; }
  update(dt: number) {
    if (this.bars && !this.dead) { const mp = (this.bars.material as THREE.MeshBasicMaterial).map!; mp.offset.y -= dt * 1.6; }
    if (this.flashT < 0 || this.dead) return;
    this.flashT += dt; const k = this.flashT / 0.28;
    (this.fill.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k); (this.area.material as THREE.MeshBasicMaterial).opacity = 0.13 * (1 - k);
    (this.edge.material as THREE.LineBasicMaterial).opacity = 0.8 * (1 - k);
    if (this.bars) (this.bars.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - k);
    if (k >= 1) this.dispose();
  }
  get done() { return this.dead; }
  dispose() {
    if (this.dead) return; this.dead = true; this.g.parent?.remove(this.g);
    for (const o of [this.area, this.fill]) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    if (this.bars) { this.bars.geometry.dispose(); const bm = this.bars.material as THREE.MeshBasicMaterial; bm.map?.dispose(); bm.dispose(); }
    this.edge.geometry.dispose(); (this.edge.material as THREE.Material).dispose();
  }
}

/** is world point (px, pz) inside the shape placed at (x, z, yaw)? (rad = the target's radius) */
export function inside(s: TeleShape, x: number, z: number, yaw: number, px: number, pz: number, rad = 0.35): boolean {
  const dx = px - x, dz = pz - z, fx = Math.sin(yaw), fz = Math.cos(yaw), along = dx * fx + dz * fz, side = dx * fz - dz * fx;
  if (s.k === 'cone') { const d = Math.hypot(dx, dz); if (d > s.r + rad) return false; if (d < rad + 0.2) return true; return Math.abs(Math.atan2(side, along)) <= s.half + Math.asin(Math.min(1, rad / Math.max(d, 1e-3))); }
  if (s.k === 'circle') return Math.hypot(along - s.ahead, side) <= s.r + rad;
  const w = (s.k === 'rect' ? s.w : 0.14) / 2;
  return along >= -rad && along <= s.len + rad && Math.abs(side) <= w + rad;
}
