// The UI-layer 3D scene: its own scene, lights and perspective camera, drawn over the world through the same pixel art buffer
// (look/post.ts renderUi3D). Everything here is placed in CSS px (top-left origin) on the z = 0 plane; `upp` converts px to scene
// units. The perspective is real, so models away from the centre show their sides (the "透视立体感" of the stone buttons).
// Also the hand-over between the UI layer and the world: a UI model at screen px (x, y) of size S px ↔ a world pose on the main
// camera's ray through that pixel at distance d, scaled so it covers the same S px (uiToWorld / worldToUi).
import * as THREE from 'three';
import { camera, view, V3 } from '../engine/world';
import { setUi3DLayer, type Ui3DLayer } from '../look/pixel';
import { UiText } from './pixfont';

// user 11-14: 「UI的透视感还是不够，特别是血瓶的」 — the UI camera was 24° at 40 units (nearly orthographic: a turned button only
// squashed, the edges never converged). Same px scale on the z = 0 plane, but a nearer, wider lens: setLens(camZ) keeps
// 2·camZ·tan(fov/2) constant, so layouts do not move while depth and the turn toward the centre read as real perspective.
const VIEW_H = 2 * 40 * Math.tan((24 * Math.PI) / 360);
const fovFor = (z: number) => 2 * Math.atan(VIEW_H / (2 * z)) * 180 / Math.PI;

export class UiLayer implements Ui3DLayer {
  scene = new THREE.Scene();
  camZ = 40; camera = new THREE.PerspectiveCamera(24, 1, 1, 200);
  on = true;
  text = new UiText();
  w = 1; h = 1; dpr = 1;
  /** scene units per CSS px on the z = 0 plane */
  upp = 0.01;
  key: THREE.DirectionalLight; fill: THREE.DirectionalLight; hemi: THREE.HemisphereLight;
  constructor() {
    this.camera.position.set(0, 0, this.camZ);
    this.hemi = new THREE.HemisphereLight(0xd8d0ff, 0x30202a, 1.5); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffe2b8, 2.6); this.key.position.set(-6, 10, 14); this.scene.add(this.key);
    this.fill = new THREE.DirectionalLight(0x7aa0ff, 0.9); this.fill.position.set(8, -4, 6); this.scene.add(this.fill);
    setUi3DLayer(this); this.setLens(27);
    // fx4: every widget turns a little toward the screen centre for the frame it is drawn (restored after), so the sides show
    this.scene.onBeforeRender = () => this.tiltOn();
    this.scene.onAfterRender = () => this.tiltOff();
  }
  /** max turn toward the screen centre (rad) and the idle sway; tilt = 0 turns it off */
  // user 11-13: 「两边的UI没有稍微往里面斜一点」; 11-14: 「透视感还是不够」 — a turn equal to the view ray just faces the lens (flat): turn
  // well past it (HUD groups at |nx| ≈ 0.6–0.85 → 38–54°, ≈ 20° past the ray at camZ 24) so the sides and the converging edges show
  tilt = 1.0; sway = 0.07;   // user 11-14 (调参): 转角 1.00, 摆动 0.070, 镜距 27
  private tilted: THREE.Object3D[] = []; private tq = new THREE.Quaternion(); private te = new THREE.Euler();
  /** the extra screen-space turn for a widget at CSS px (x, y) (also used by the UI → world hand-over) */
  tiltAt(x: number, y: number, ph = 0, out = new THREE.Quaternion()) {
    const nx = Math.max(-1, Math.min(1, (x - this.w / 2) / (this.w / 2))), ny = Math.max(-1, Math.min(1, (y - this.h / 2) / (this.h / 2))), t = performance.now() / 1000;
    // left → yaw right (+y), bottom → pitch up (−x) plus a constant slight upward look; a slow sway on both
    this.te.set(-ny * this.tilt * 0.75 - 0.06 + Math.sin(t * 0.9 + ph) * this.sway, -nx * this.tilt + Math.sin(t * 0.7 + ph * 1.3) * this.sway, 0);
    return out.setFromEuler(this.te);
  }
  private tiltOn() {
    this.tilted.length = 0; if (!this.tilt) return;
    for (const o of this.scene.children) {
      if (!(o as THREE.Group).isGroup || !o.visible || o.renderOrder >= 30 || o.userData.noTilt) continue;
      const p = this.toPx(o.position), ph = (o.id * 0.618) % 6.28;
      const q = this.tiltAt(p.x, p.y, ph, (o.userData.uiTilt as THREE.Quaternion) || (o.userData.uiTilt = new THREE.Quaternion()));
      o.userData.uiBase = (o.userData.uiBase as THREE.Quaternion || new THREE.Quaternion()).copy(o.quaternion);
      o.quaternion.premultiply(q); o.updateMatrixWorld(true); this.tilted.push(o);
    }
  }
  private tiltOff() { for (const o of this.tilted) { o.quaternion.copy(o.userData.uiBase as THREE.Quaternion); o.updateMatrixWorld(true); } this.tilted.length = 0; }
  /** the orientation a top-level UI group is drawn with (its own rotation plus the screen tilt) */
  shownQuat(o: THREE.Object3D, out = new THREE.Quaternion()) {
    if (!this.tilt || o.userData.noTilt) return out.copy(o.quaternion);
    const p = this.toPx(o.position); return this.tiltAt(p.x, p.y, (o.id * 0.618) % 6.28, out).multiply(o.quaternion);
  }
  resize(w: number, h: number, dpr: number) {
    this.w = w; this.h = h; this.dpr = dpr; this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
    this.upp = VIEW_H / Math.max(1, h);
    this.text.resize(w, h, dpr);
  }
  /** CSS px → scene point at depth z (z toward the camera; the point projects back onto the same px) */
  at(x: number, y: number, z = 0, out = V3()) {
    const k = (this.camZ - z) / this.camZ;
    return out.set((x - this.w / 2) * this.upp * k, (this.h / 2 - y) * this.upp * k, z);
  }
  /** scene point → CSS px */
  toPx(p: THREE.Vector3) { const v = p.clone().project(this.camera); return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, z: v.z }; }
  /** px size at depth z → scene units */
  px(n: number, z = 0) { return n * this.upp * (this.camZ - z) / this.camZ; }
  /** the lens: camera distance (smaller = stronger perspective); the z = 0 plane keeps its px scale */
  setLens(camZ: number) { this.camZ = camZ; this.camera.position.z = camZ; this.camera.fov = fovFor(camZ); this.camera.updateProjectionMatrix(); }
  /** draw the full-resolution text (call after the 3D frame) */
  renderText(r: THREE.WebGLRenderer) { if (this.on) this.text.render(r); }
  dispose() { setUi3DLayer(null); }
}

// ---------------------------------------------------------------- UI ↔ world hand-over
/** The world pose that covers screen px (x, y) with an object of `sizePx` whose model size is `modelSize` (world units at scale 1). */
export function uiToWorld(x: number, y: number, sizePx: number, modelSize: number, dist = 6) {
  const ndc = V3((x / view.w) * 2 - 1, -(y / view.h) * 2 + 1, 0.5).unproject(camera), dir = ndc.sub(camera.position).normalize();
  const pos = camera.position.clone().addScaledVector(dir, dist);
  // distance along the view axis (perspective size depends on depth, not on the ray length)
  const fwd = V3(0, 0, -1).applyQuaternion(camera.quaternion), depth = dist * dir.dot(fwd);
  const worldPerPx = (2 * depth * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, view.h);
  return { pos, scale: (sizePx * worldPerPx) / modelSize };
}
/** World point → CSS px of the main view (z > 1 = behind the camera). */
export function worldToUi(p: THREE.Vector3) { const v = p.clone().project(camera); return { x: (v.x + 1) / 2 * view.w, y: (1 - v.y) / 2 * view.h, z: v.z }; }
/** The world point under screen px (x, y) on the horizontal plane y = h (null if the ray misses it), and world units per px there. */
export function uiRayPlane(x: number, y: number, h: number) {
  const ndc = V3((x / view.w) * 2 - 1, -(y / view.h) * 2 + 1, 0.5).unproject(camera), dir = ndc.sub(camera.position).normalize();
  if (Math.abs(dir.y) < 1e-4) return null;
  const t = (h - camera.position.y) / dir.y; if (t <= 0) return null;
  const pos = camera.position.clone().addScaledVector(dir, t);
  return { pos, worldPerPx: worldPerPxAt(pos) };
}
/** World size of `sizePx` at world point p (for scaling a world object to cover a UI px size). */
export function worldPerPxAt(p: THREE.Vector3) {
  const fwd = V3(0, 0, -1).applyQuaternion(camera.quaternion), depth = p.clone().sub(camera.position).dot(fwd);
  return (2 * Math.max(0.01, depth) * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, view.h);
}
/** UI-layer orientation → the world orientation that looks the same on screen (the UI camera has identity rotation). */
export function uiQuatToWorld(q: THREE.Quaternion) { return camera.quaternion.clone().multiply(q); }
export function worldQuatToUi(q: THREE.Quaternion) { return camera.quaternion.clone().invert().multiply(q); }
