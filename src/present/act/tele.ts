// 地面预警（敌人出招前在地上亮出攻击范围）：扇形（劈砍）、长条（扑咬 / 冲撞）、圆（砸地）、细线（弓箭瞄准）。
// 一层淡色底面 = 范围，一圈亮边；范围里是「声纹」（act-17，GAME_PLAN 第 1、6 节：主角是瞎子，预警就是他听见的出招）——一道道硬边的
// 波纹从出招处往外推，越接近出手越亮，前沿（还剩多久）以内更亮。出手那一下整块亮一下再淡掉。颜色是暗红橙，透明度克制
// （CLAUDE.md：高亮要克制），不压暗画面。
// act-23（用户：「敌人的攻击提示还是看不太出来敌人的攻击节奏，对比不强烈」）：改成三拍——起手只有暗底和暗边；蓄力时从出招处往外
// 「灌」，灌到的地方亮、没灌到的很暗，灌的最前沿一道亮带扫过去（扫到头 = 打下来）；最后 0.15 秒整块变成发白的暖光、边线变白、
// 微微一胀；打下来那一下白闪、0.18 秒消失。
import * as THREE from 'three';
import { scene } from '../engine/world';

export type TeleShape = { k: 'cone'; r: number; half: number } | { k: 'rect'; len: number; w: number } | { k: 'circle'; r: number; ahead: number } | { k: 'line'; len: number }
  // 11-18 (第三关 链锤狱卒 / 封鸩 寒毒爆): a ring round the attacker — r0..r1, the hole inside is safe; it fills from the inner edge outward
  | { k: 'ring'; r0: number; r1: number };
const COL = 0xff4a26, EDGE = 0xff9a60, EDGE_C = new THREE.Color(EDGE), WHITE = new THREE.Color(0xffffff);
/** the last beat before the blow, seconds — aligned with 见切 (0.25s) & 冲刺无敌 (0.24s) for consistent muscle memory */
export const HOT = 0.26;
const mat = (o: number, c = COL) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });

/** the sound-wave fill: hard-edged ripple bands running out from where the blow starts (cone apex / circle centre / the strip's
 *  start); brighter as the wind-up fills (uP) and inside its front; uFlash = the strike */
const RIPPLE_VS = 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RIPPLE_FS = `uniform vec3 uCol; uniform float uP, uT, uFade, uFlash, uHot, uKind, uR, uAhead, uLen; varying vec3 vP;
void main() {
  float d = uKind < 0.5 ? length(vP.xz) / uR : uKind < 1.5 ? length(vP.xz - vec2(0.0, uAhead)) / uR : uKind < 2.5 ? vP.z / uLen : (length(vP.xz) - uAhead) / (uR - uAhead);
  // act-23: only what the wind-up has reached is lit; the rest of the shape stays dark (the contrast is the timing)
  float filled = step(d, uP);
  float band = step(0.7, fract(d * 4.0 - uT * 1.7));
  // the sweeping front: a bright band just inside the fill's edge; when it reaches the rim, the blow lands
  float rim = filled * step(uP - 0.08, d) * step(0.02, uP);
  float a = filled * (0.14 + 0.26 * uP + 0.07 * band) + rim * 0.6;
  vec3 c = mix(uCol, vec3(1.0, 0.72, 0.42), rim);
  // the last beat: the whole shape goes a hot pale gold, strong
  c = mix(c, vec3(1.0, 0.93, 0.74), uHot); a = mix(a, 0.6, uHot);
  // the blow: white
  c = mix(c, vec3(1.0), uFlash); a = max(a, uFlash * 0.72);
  gl_FragColor = vec4(c, a * uFade);
}`;
function rippleMat(s: TeleShape) {
  const kind = s.k === 'cone' ? 0 : s.k === 'circle' ? 1 : s.k === 'ring' ? 3 : 2;
  return new THREE.ShaderMaterial({ vertexShader: RIPPLE_VS, fragmentShader: RIPPLE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
    uniforms: { uCol: { value: new THREE.Color(COL) }, uP: { value: 0 }, uT: { value: 0 }, uFade: { value: 1 }, uFlash: { value: 0 }, uHot: { value: 0 }, uKind: { value: kind },
      uR: { value: s.k === 'cone' || s.k === 'circle' ? s.r : s.k === 'ring' ? s.r1 : 1 }, uAhead: { value: s.k === 'circle' ? s.ahead : s.k === 'ring' ? s.r0 : 0 }, uLen: { value: s.k === 'rect' || s.k === 'line' ? s.len : 1 } } });
}
function geo(s: TeleShape): THREE.BufferGeometry {
  if (s.k === 'cone') { const g = new THREE.CircleGeometry(s.r, 28, Math.PI / 2 - s.half, s.half * 2); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI); return g; }
  if (s.k === 'circle') { const g = new THREE.CircleGeometry(s.r, 40); g.rotateX(-Math.PI / 2); g.translate(0, 0, s.ahead); return g; }
  if (s.k === 'ring') { const g = new THREE.RingGeometry(s.r0, s.r1, 48, 1); g.rotateX(-Math.PI / 2); return g; }
  const w = s.k === 'rect' ? s.w : 0.14, len = s.len, g = new THREE.PlaneGeometry(w, len); g.rotateX(-Math.PI / 2); g.translate(0, 0, len / 2); return g;
}
/** two ribbons in one geometry (the ring's two rims) */
function mergeRibbons(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const P: number[] = [], I: number[] = []; let base = 0;
  for (const g of gs) { const p = g.getAttribute('position'), ix = g.getIndex()!; for (let i = 0; i < p.count; i++) P.push(p.getX(i), p.getY(i), p.getZ(i)); for (let i = 0; i < ix.count; i++) I.push(ix.getX(i) + base); base += p.count; g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); return g;
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
  else if (s.k === 'ring') {
    // both rims: the outer one, then the inner one (the safe hole reads as its own bright line)
    const o: THREE.Vector3[] = [], q: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; o.push(new THREE.Vector3(Math.sin(a) * s.r1, 0, Math.cos(a) * s.r1)); q.push(new THREE.Vector3(Math.sin(a) * s.r0, 0, Math.cos(a) * s.r0)); }
    return mergeRibbons([ribbon(o, 0.09), ribbon(q, 0.09)]);
  }
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
    // (act-23: the tint under the fill much fainter, so the part not reached yet reads dark)
    this.shade = new THREE.Mesh(geo(s), mat(s.k === 'line' ? 0.3 : 0.28, 0x3a0a06));
    this.area = new THREE.Mesh(geo(s), mat(s.k === 'line' ? 0.22 : 0.07)); this.fill = new THREE.Mesh(geo(s), rippleMat(s));
    this.edge = new THREE.Mesh(edgeGeo(s), new THREE.MeshBasicMaterial({ color: EDGE, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }));
    for (const o2 of [this.shade, this.area, this.fill, this.edge]) { o2.renderOrder = 3; this.g.add(o2); }
    // a jumpable attack: pale bars across it, drifting along it (read as "over this")
    if (o.low && typeof document !== 'undefined') {
      const len = s.k === 'rect' ? s.len : s.k === 'circle' ? s.r * 2 : s.k === 'ring' ? s.r1 * 2 : 2, m = new THREE.MeshBasicMaterial({ color: 0xfff0d0, map: stripeTex(len / 0.55), transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide });
      this.bars = new THREE.Mesh(geo(s), m); this.bars.renderOrder = 4; this.g.add(this.bars);
    }
    this.g.position.y = 0.05; scene.add(this.g);
  }
  /** how hot the last beat is (0..1) */
  hot = 0;
  /** at (x, z) facing yaw; progress 0..1 grows the fill (cone / circle: outward; rect / line: along); left = seconds to the blow
   *  (the last HOT seconds go hot; without it, the last 14 % of the progress) */
  set(x: number, z: number, yaw: number, p: number, left?: number) {
    this.g.position.x = x; this.g.position.z = z; this.g.rotation.y = yaw;
    const k = Math.max(0.001, Math.min(1, p));
    const hot = left != null ? Math.max(0, Math.min(1, 1 - left / HOT)) : Math.max(0, Math.min(1, (k - 0.86) / 0.14));
    this.hot = hot;
    const u = (this.fill.material as THREE.ShaderMaterial).uniforms; u.uP.value = k; u.uHot.value = hot;
    const em = this.edge.material as THREE.MeshBasicMaterial;
    em.opacity = 0.4 + 0.4 * k + 0.2 * hot; em.color.copy(EDGE_C).lerp(WHITE, hot);
    // a small swell on the last beat (the shape breathes in)
    const sw = 1 + 0.045 * hot; this.g.scale.set(sw, 1, sw);
  }
  /** the blow lands: the whole shape flashes white, then fades fast and is removed */
  flash() { this.flashT = 0; const u = (this.fill.material as THREE.ShaderMaterial).uniforms; u.uP.value = 1; u.uFlash.value = 1; u.uHot.value = 1; this.g.scale.set(1.06, 1, 1.06); }
  update(dt: number) {
    if (this.bars && !this.dead) { const mp = (this.bars.material as THREE.MeshBasicMaterial).map!; mp.offset.y -= dt * 1.6; }
    if (!this.dead) (this.fill.material as THREE.ShaderMaterial).uniforms.uT.value += dt;
    if (this.flashT < 0 || this.dead) return;
    this.flashT += dt; const k = this.flashT / 0.18;
    (this.fill.material as THREE.ShaderMaterial).uniforms.uFade.value = 1 - k; (this.area.material as THREE.MeshBasicMaterial).opacity = 0.07 * (1 - k);
    (this.shade.material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - k); (this.edge.material as THREE.MeshBasicMaterial).opacity = 1 - k;
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
  if (s.k === 'ring') { const d = Math.hypot(dx, dz); return d <= s.r1 + rad && d >= s.r0 - rad * 0.5; }   // (the hole: only well inside it is safe)
  const w = (s.k === 'rect' ? s.w : 0.14) / 2;
  return along >= -rad && along <= s.len + rad && Math.abs(side) <= w + rad;
}
