// 地面预警（敌人出招前在地上亮出攻击范围）：扇形（劈砍）、长条（扑咬 / 冲撞）、圆（砸地）、细线（弓箭瞄准）。
// 一层淡色底面 = 范围，一圈亮边；范围里是「声纹」（act-17，GAME_PLAN 第 1、6 节：主角是瞎子，预警就是他听见的出招）——一道道硬边的
// 波纹从出招处往外推，越接近出手越亮，前沿（还剩多久）以内更亮。出手那一下整块亮一下再淡掉。颜色是暗红橙，透明度克制
// （CLAUDE.md：高亮要克制），不压暗画面。
import * as THREE from 'three';
import { scene } from '../engine/world';

export type TeleShape = { k: 'cone'; r: number; half: number } | { k: 'rect'; len: number; w: number } | { k: 'circle'; r: number; ahead: number } | { k: 'line'; len: number };
const COL = 0xff4a26, EDGE = 0xff9a60;
const mat = (o: number, c = COL) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });

/** the sound-wave fill: hard-edged ripple bands running out from where the blow starts (cone apex / circle centre / the strip's
 *  start); brighter as the wind-up fills (uP) and inside its front; uFlash = the strike */
const RIPPLE_VS = 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RIPPLE_FS = `uniform vec3 uCol; uniform float uP, uT, uFade, uFlash, uKind, uR, uAhead, uLen; varying vec3 vP;
void main() {
  float d = uKind < 0.5 ? length(vP.xz) / uR : uKind < 1.5 ? length(vP.xz - vec2(0.0, uAhead)) / uR : vP.z / uLen;
  float band = step(0.66, fract(d * 4.0 - uT * 1.7));
  float front = step(d, uP);
  // act-20 (user: 「预警识别度很低」): firmer bands, the front brighter, a last-moment lift
  float a = band * (0.22 + 0.48 * uP) * (0.55 + 0.45 * front) + front * 0.1 + step(0.75, uP) * 0.08 + uFlash * 0.6;
  gl_FragColor = vec4(uCol, a * uFade);
}`;
function rippleMat(s: TeleShape) {
  const kind = s.k === 'cone' ? 0 : s.k === 'circle' ? 1 : 2;
  return new THREE.ShaderMaterial({ vertexShader: RIPPLE_VS, fragmentShader: RIPPLE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
    uniforms: { uCol: { value: new THREE.Color(COL) }, uP: { value: 0 }, uT: { value: 0 }, uFade: { value: 1 }, uFlash: { value: 0 }, uKind: { value: kind },
      uR: { value: s.k === 'cone' || s.k === 'circle' ? s.r : 1 }, uAhead: { value: s.k === 'circle' ? s.ahead : 0 }, uLen: { value: s.k === 'rect' || s.k === 'line' ? s.len : 1 } } });
}
function geo(s: TeleShape): THREE.BufferGeometry {
  if (s.k === 'cone') { const g = new THREE.CircleGeometry(s.r, 28, Math.PI / 2 - s.half, s.half * 2); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI); return g; }
  if (s.k === 'circle') { const g = new THREE.CircleGeometry(s.r, 40); g.rotateX(-Math.PI / 2); g.translate(0, 0, s.ahead); return g; }
  const w = s.k === 'rect' ? s.w : 0.14, len = s.len, g = new THREE.PlaneGeometry(w, len); g.rotateX(-Math.PI / 2); g.translate(0, 0, len / 2); return g;
}
/** act-20: the outline as a flat ribbon of real width (a 1-px line broke up under the pixel look) */
function ribbon(pts: THREE.Vector3[], w: number): THREE.BufferGeometry {
  const P: number[] = [], I: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
    P.push(pts[i].x + nx, 0.002, pts[i].z + nz, pts[i].x - nx, 0.002, pts[i].z - nz);
    if (i > 0) { const k = i * 2; I.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); return g;
}
function edgeGeo(s: TeleShape): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  if (s.k === 'cone') { pts.push(new THREE.Vector3(0, 0, 0)); for (let i = 0; i <= 24; i++) { const a = -s.half + (i / 24) * s.half * 2; pts.push(new THREE.Vector3(Math.sin(a) * s.r, 0, Math.cos(a) * s.r)); } pts.push(new THREE.Vector3(0, 0, 0)); }
  else if (s.k === 'circle') for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(a) * s.r, 0, s.ahead + Math.cos(a) * s.r)); }
  else { const w = (s.k === 'rect' ? s.w : 0.14) / 2, l = s.len; pts.push(new THREE.Vector3(-w, 0, 0), new THREE.Vector3(w, 0, 0), new THREE.Vector3(w, 0, l), new THREE.Vector3(-w, 0, l), new THREE.Vector3(-w, 0, 0)); }
  return ribbon(pts, s.k === 'line' ? 0.05 : 0.09);
}

/** pale bars across the shape for the attacks a jump clears (one shared image, a texture per telegraph for its own repeat) */
let STRIPE: HTMLCanvasElement | null = null;
function stripeTex(rep: number) {
  if (!STRIPE) { STRIPE = document.createElement('canvas'); STRIPE.width = 4; STRIPE.height = 8; const g = STRIPE.getContext('2d')!; g.fillStyle = '#ffffff'; g.fillRect(0, 0, 4, 3); }
  const t = new THREE.CanvasTexture(STRIPE); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.repeat.set(1, rep); return t;
}

export class Tele {
  g = new THREE.Group(); private area: THREE.Mesh; private fill: THREE.Mesh; private edge: THREE.Mesh; private shade: THREE.Mesh; private flashT = -1; private dead = false;
  private bars: THREE.Mesh | null = null;
  constructor(public s: TeleShape, o: { low?: boolean } = {}) {
    // a dark red under-layer first (contrast on the pale loess floors), then the tint, the sound-wave fill and a solid rim
    this.shade = new THREE.Mesh(geo(s), mat(s.k === 'line' ? 0.3 : 0.24, 0x3a0a06));
    this.area = new THREE.Mesh(geo(s), mat(s.k === 'line' ? 0.3 : 0.2)); this.fill = new THREE.Mesh(geo(s), rippleMat(s));
    this.edge = new THREE.Mesh(edgeGeo(s), new THREE.MeshBasicMaterial({ color: EDGE, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }));
    for (const o2 of [this.shade, this.area, this.fill, this.edge]) { o2.renderOrder = 3; this.g.add(o2); }
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
    const k = Math.max(0.001, Math.min(1, p));
    (this.fill.material as THREE.ShaderMaterial).uniforms.uP.value = k;
    (this.edge.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.45 * k;
  }
  /** the blow lands: the whole shape flashes, then fades and is removed */
  flash() { this.flashT = 0; const u = (this.fill.material as THREE.ShaderMaterial).uniforms; u.uP.value = 1; u.uFlash.value = 1; }
  update(dt: number) {
    if (this.bars && !this.dead) { const mp = (this.bars.material as THREE.MeshBasicMaterial).map!; mp.offset.y -= dt * 1.6; }
    if (!this.dead) (this.fill.material as THREE.ShaderMaterial).uniforms.uT.value += dt;
    if (this.flashT < 0 || this.dead) return;
    this.flashT += dt; const k = this.flashT / 0.28;
    (this.fill.material as THREE.ShaderMaterial).uniforms.uFade.value = 1 - k; (this.area.material as THREE.MeshBasicMaterial).opacity = 0.2 * (1 - k);
    (this.shade.material as THREE.MeshBasicMaterial).opacity = 0.24 * (1 - k); (this.edge.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    if (this.bars) (this.bars.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - k);
    if (k >= 1) this.dispose();
  }
  get done() { return this.dead; }
  dispose() {
    if (this.dead) return; this.dead = true; this.g.parent?.remove(this.g);
    for (const o of [this.area, this.fill, this.shade]) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
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
