// 开场「雨夜听雨」（docs/DESIGN.md 第十九轮 6；用户 11-17：「我要一个很有意境的开场」，选了「雨夜听雨」）：
// 夜雨里的残村土路，村口大槐的门楼在后面；路边一盏斜挂的灯笼是唯一的暖光，别的都是冷的蓝灰。主角蒙着眼独立雨中，刀在鞘里、
// 手按刀柄，蒙眼布带被风吹着；每滴落在他身边的雨都在地上泛起一圈淡蓝的声纹（他「听」得见雨）。镜头低、近，慢慢推进。
// 「不见刀」在雨里慢慢浮现，下面一行小字「点一下，开始」缓缓呼吸，不放按钮。
// 点屏幕 / 按任意键 → 一道闪电照亮全场 → 主角拔刀一斩，一道月牙刀光从刀上飞起、越飞越宽，到标题那一行化作横贯画面的一线 →
// 时间停住，雨悬在半空，标题上下两半顺着刀口错开 → 斩开的画面上下滑开，露出练武场（不黑屏；拿不到画面时退回竹子擦屏）。
// 只在进游戏的第一次放（打完一局回练武场不放）。网址带 ?skip / #skip 跳过，?run 直接开一局；无头浏览器（tools/cap.mjs 这类测试
// 脚本，它们等着 phase === 'yard'）默认跳过，?opening / #opening 强制放；__dh.opening() 再放一次（截图用）。
// 性能：雨是一条线段网格（一次绘制），声纹是一个实例化网格（最多 40 圈，一次绘制），灯笼几块体素加一盏点光；没有新的后期通道。
import * as THREE from 'three';
import { V3, R, onUpdate, canvasTex, camera } from '../engine/world';
import { clock, hitstop, shake } from '../engine/clock';
import { shot } from '../director';
import { applyMood, skyMaterial, type Mood, type Stage } from '../scenes/stage';
import { GRADE } from '../look/post';
import { voxModel } from '../ui3d/vox';
import { CELL } from '../bestiary/kit';
import { Action, rot, type Bone } from '../actors/rig';
import type { BattleActor } from '../bestiary/battle';
import { POSE_HOOKS, type PoseFn } from '../bestiary/poseHooks';
import { fxSparks } from '../fx/fx';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import type { Overlay } from '../v2/overlay';
import { cue } from '../../audio/cues';
import { wipeTransit } from '../scenes/transWipe';
import type { Spec } from '../asm/types';
import { PALPHA } from '../engine/particles';
import { dh } from '../../debug/dh';

// ------------------------------------------------------------------ the place (when it plays: openingFlag.ts)
/** the rain road: the 残村 behind its 村口大槐 gate. Built at 'day' on purpose — then no fire, ember, door or window in the village is
 *  lit (the lantern stays the only warm light); the night itself comes from RAIN_NIGHT below */
export const OPENING_SPEC: Partial<Spec> & { locale: string } = { locale: 'hj_village', layout: 'axis', mirror: false, landmark: 'huaishu', season: 'summer', time: 'day', weather: 'rain', seed: 7 };

// ------------------------------------------------------------------ the night
/** cold blue-grey rain night: dark in colour, not by a mask; the fog swallows the far village, the horizon a shade lighter (rain haze) */
export const RAIN_NIGHT: Mood = {
  sky: true, bg: 0x070a10, fog: 0x121926, fogD: 0.048, hemiSky: 0x44567a, hemiGround: 0x0c0e14, hemiI: 1.25, moon: 0x8094c4, moonI: 1.05, key: 0x52607e, keyI: 0.25,
  earth: [0x161c1c, 0x181e1e, 0x141a1a], mist: 0x2e3a50, mistA: 0.13, skyTop: 0x05070d, skyMid: 0x0d121e, skyHor: 0x283246, skyDisc: [-0.35, 0.5, -1], skyDiscCol: [0.16, 0.18, 0.22],
  moonPos: [-5, 13, -12], exposure: 1.4, bloomT: 1.7, glowK: 1.4,
};
/** a rain night has no stars: the shared sky shader adds them on top of its gradient, so the gradient (and the moon glow) is scaled
 *  up and the whole dome tinted down by the same factor — the stars sink to nothing (the next stage's mood puts the tint back) */
export function mood(m: Mood, to?: Mood, k = 0) {
  applyMood(m, to, k);
  const u = skyMaterial().uniforms, K = 0.004;
  for (const n of ['uTop', 'uMid', 'uHor', 'uMoonCol']) (u[n].value as THREE.Color).multiplyScalar(1 / K);
  (u.uTint.value as THREE.Color).setScalar(K);
}
/** the same night lit by the lightning: everything washed white-blue for a beat */
export const FLASH: Mood = {
  ...RAIN_NIGHT, bg: 0x48567a, fog: 0x283246, fogD: 0.036, hemiSky: 0xa8bcec, hemiGround: 0x2a3040, hemiI: 2.4, moon: 0xeef4ff, moonI: 8, key: 0x8ea4d0, keyI: 0.9,
  mist: 0x5a6a8c, mistA: 0.16, skyTop: 0x4a5a86, skyMid: 0x8a9cc8, skyHor: 0xc4d2f0,
};

// ------------------------------------------------------------------ the rain: one line-segment mesh, straight down (no slanted stair-steps)
const COLD = new THREE.Color(0x8496b8), WARM = new THREE.Color(0xffb06a);
export class Rain {
  readonly lines: THREE.LineSegments; private n: number; private p: Float32Array; private v: Float32Array; private len: Float32Array;
  private pos: THREE.BufferAttribute; private col: THREE.BufferAttribute; private mat: THREE.LineBasicMaterial;
  constructor(n: number, private box: { x0: number; x1: number; z0: number; z1: number }, private warm: THREE.Vector3) {
    this.n = n; this.p = new Float32Array(n * 3); this.v = new Float32Array(n); this.len = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 6), 3); this.pos.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', this.pos);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 6), 3); this.col.setUsage(THREE.DynamicDrawUsage); g.setAttribute('color', this.col);
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false, fog: true });
    this.lines = new THREE.LineSegments(g, this.mat); this.lines.frustumCulled = false; this.lines.renderOrder = 6;
    for (let i = 0; i < n; i++) this.spawn(i, R(0, 7));
  }
  private spawn(i: number, y: number) {
    const b = this.box; this.p[i * 3] = R(b.x0, b.x1); this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = R(b.z0, b.z1);
    this.v[i] = R(10, 12.5); this.len[i] = R(0.32, 0.55);
  }
  /** fall; land(x, z) for each drop that reached the ground. flash 0..1 brightens every streak */
  update(dt: number, flash: number, land: (x: number, z: number) => void) {
    const P = this.p, A = this.pos.array as Float32Array, C = this.col.array as Float32Array, w = this.warm, c = new THREE.Color();
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3; P[i3 + 1] -= this.v[i] * dt;
      if (P[i3 + 1] <= 0) { land(P[i3], P[i3 + 2]); this.spawn(i, R(4.5, 7.5)); }
      const x = P[i3], y = P[i3 + 1], z = P[i3 + 2], L = this.len[i];
      A[i * 6] = x; A[i * 6 + 1] = y; A[i * 6 + 2] = z; A[i * 6 + 3] = x; A[i * 6 + 4] = y + L; A[i * 6 + 5] = z;
      // a drop inside the lantern's glow is lit warm
      const d = Math.hypot(x - w.x, y - w.y, z - w.z), k = Math.max(0, 1 - d / 2.4);
      c.copy(COLD).lerp(WARM, k * 0.85).multiplyScalar((0.75 + 0.9 * k) * (1 + 2.2 * flash));
      C[i * 6] = c.r; C[i * 6 + 1] = c.g; C[i * 6 + 2] = c.b; C[i * 6 + 3] = c.r * 0.3; C[i * 6 + 4] = c.g * 0.3; C[i * 6 + 5] = c.b * 0.3;
    }
    this.pos.needsUpdate = true; this.col.needsUpdate = true;
  }
  dispose() { this.lines.parent?.remove(this.lines); this.lines.geometry.dispose(); this.mat.dispose(); }
}

// ------------------------------------------------------------------ the rain heard: a pool of faint sound-wave rings on the ground
// (the look of tele.ts's ripple: hard-edged bands running outward — here three thin rings, pale blue, small and faint). Flat on the
// ground they vanish into slivers under this low camera, so each ring is tipped toward the lens (a sound in the air, not a puddle),
// its bottom kept on the ground as it grows.
const RIP_MAX = 40, RIP_LIFE = 1.1;
const RIP_VS = `attribute vec4 aRip; uniform float uTime; uniform vec2 uHero; varying vec2 vUv; varying float vK, vR, vNear;
void main(){ float age = uTime - aRip.z; vK = age / ${RIP_LIFE.toFixed(2)}; vR = aRip.w; vUv = position.xz; vNear = 1.0 - smoothstep(0.8, 4.5, distance(aRip.xy, uHero));
  vec3 c = vec3(aRip.x, 0.0, aRip.y), h = cameraPosition - c; h.y = 0.0; h = normalize(h);
  vec3 right = vec3(h.z, 0.0, -h.x), n = normalize(vec3(0.0, 1.0, 0.0) + h * 0.45), fwd = cross(right, n);
  c.y = 0.41 * aRip.w * (0.12 + 0.88 * clamp(vK, 0.0, 1.0)) + 0.015;
  vec3 p = c + right * position.x * aRip.w + fwd * position.z * aRip.w;
  if (vK < 0.0 || vK > 1.0) p = vec3(0.0, -80.0, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`;
const RIP_FS = `uniform vec3 uCol; uniform float uA, uFlash; varying vec2 vUv; varying float vK, vR, vNear;
void main(){
  // three hard-edged wave fronts running out, the outer one brightest
  float d = length(vUv), w = 0.018 / vR;
  float f1 = 0.12 + 0.88 * vK, f2 = 0.72 * vK - 0.04, f3 = 0.46 * vK - 0.08;
  float a = step(abs(d - f1), w) + 0.55 * step(abs(d - f2), w) * step(0.16, f2) + 0.28 * step(abs(d - f3), w) * step(0.16, f3);
  a *= pow(max(1.0 - vK, 0.0), 1.5) * uA * (0.3 + 0.7 * vNear); if (a < 0.004) discard;
  gl_FragColor = vec4(uCol * (1.0 + 1.5 * uFlash) * a, a); }`;
export class Ripples {
  readonly mesh: THREE.Mesh; private at: THREE.InstancedBufferAttribute; private t0 = new Float32Array(RIP_MAX).fill(-99); readonly mat: THREE.ShaderMaterial;
  /** o (title.ts): where the listener stands (rings fade away from there) and the rings' size range (m) */
  constructor(private o: { at?: THREE.Vector3; r?: [number, number] } = {}) {
    const quad = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position);
    this.at = new THREE.InstancedBufferAttribute(new Float32Array(RIP_MAX * 4).fill(-99), 4); this.at.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aRip', this.at); g.instanceCount = RIP_MAX;
    this.mat = new THREE.ShaderMaterial({ vertexShader: RIP_VS, fragmentShader: RIP_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, 
      uniforms: { uTime: { value: 0 }, uHero: { value: new THREE.Vector2((o.at ?? HERO_AT).x, (o.at ?? HERO_AT).z) }, uCol: { value: new THREE.Color(0x78acff) }, uA: { value: 0.75 }, uFlash: { value: 0 } } });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
  }
  /** a ring where a drop landed, if a slot is free (never more than RIP_MAX alive) and the steady rate allows (rings refilled the
   *  moment they expire would come in synchronised waves) */
  spawn(x: number, z: number) {
    if (this.budget < 1) return false;
    const now = clock.time; let i = -1;
    for (let j = 0; j < RIP_MAX; j++) if (now - this.t0[j] > RIP_LIFE) { i = j; break; }
    if (i < 0) return false;
    this.budget -= 1; this.t0[i] = now; const a = this.at.array as Float32Array; a[i * 4] = x; a[i * 4 + 1] = z; a[i * 4 + 2] = now; a[i * 4 + 3] = R(...(this.o.r ?? [0.32, 0.56])); this.at.needsUpdate = true;
    return true;
  }
  private budget = 0;
  update(dt: number, flash: number) { this.budget = Math.min(3, this.budget + dt * RIP_MAX / RIP_LIFE * 1.05); this.mat.uniforms.uTime.value = clock.time; this.mat.uniforms.uFlash.value = flash; }
  live() { let n = 0; for (const t of this.t0) if (clock.time - t <= RIP_LIFE) n++; return n; }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// ------------------------------------------------------------------ the blade light: a thin crescent (the 刀芒 of missiles.ts, drawn facing the lens)
// The battle's crescent lies flat at waist height; seen from this low camera it would be a line edge-on, so this one stands in the
// view plane, flattened into a wide horizontal arc, bulging the way it flies (up, toward the title). White core, a narrow pale-blue
// rim, brightness held at 1 so the bloom does not turn it into fog; a few ghosts peel off behind it and fade fast.
function arcGeo(R: number, A: number, thick: number, n = 28) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) { const a = -A + (2 * A * i) / n; i ? s.lineTo(R * Math.sin(a), R * Math.cos(a) - R) : s.moveTo(R * Math.sin(a), R * Math.cos(a) - R); }
  for (let i = n - 1; i > 0; i--) { const a = -A + (2 * A * i) / n; s.lineTo(R * Math.sin(a), R * Math.cos(a) - R - thick * Math.cos((a / A) * Math.PI / 2)); }
  return new THREE.ShapeGeometry(s);
}
const ARC_CORE = arcGeo(1.0, 1.15, 0.07), ARC_RIM = arcGeo(1.04, 1.18, 0.16);
const arcMat = (c: number, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
class BladeArc {
  g = new THREE.Group(); private core = new THREE.Mesh(ARC_CORE, arcMat(0xf2f8ff, 1)); private rim = new THREE.Mesh(ARC_RIM, arcMat(0x8cb8ff, 0.28));
  private ghosts: Array<{ m: THREE.Mesh; t: number }> = []; private gt = 0;
  constructor(private root: THREE.Object3D) { this.rim.position.y = 0.02; this.g.add(this.rim, this.core); this.core.renderOrder = this.rim.renderOrder = 8; root.add(this.g); }
  /** at p, facing the lens, w metres across, flattened to a slash */
  set(p: THREE.Vector3, w: number, dt: number, a = 1) {
    this.g.position.copy(p); this.g.quaternion.copy(camera.quaternion); this.g.scale.set(w / 2, w / 2 * 0.32, 1);
    (this.core.material as THREE.MeshBasicMaterial).opacity = a; (this.rim.material as THREE.MeshBasicMaterial).opacity = 0.28 * a;
    this.gt -= dt;
    if (this.gt <= 0) { this.gt = 0.028; const m = new THREE.Mesh(ARC_CORE, arcMat(0xb8d4ff, 0.35 * a)); m.position.copy(this.g.position); m.quaternion.copy(this.g.quaternion); m.scale.copy(this.g.scale); m.renderOrder = 7; this.root.add(m); this.ghosts.push({ m, t: 0 }); }
    for (const gh of this.ghosts) { gh.t += dt; (gh.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.35 * a * (1 - gh.t / 0.1)); gh.m.scale.y *= 0.9; }
    for (let i = this.ghosts.length - 1; i >= 0; i--) if (this.ghosts[i].t >= 0.1) { const gh = this.ghosts[i]; gh.m.parent?.remove(gh.m); (gh.m.material as THREE.Material).dispose(); this.ghosts.splice(i, 1); }
  }
  kill() {
    this.g.parent?.remove(this.g); (this.core.material as THREE.Material).dispose(); (this.rim.material as THREE.Material).dispose();
    for (const gh of this.ghosts) { gh.m.parent?.remove(gh.m); (gh.m.material as THREE.Material).dispose(); } this.ghosts = [];
  }
}

// ------------------------------------------------------------------ the lantern: a post with an arm over the road, the lantern hanging askew
const LAMP_I = 5.2;
let HALO_TEX: THREE.Texture | null = null;
export function lanternPost() {
  const WOOD = 0x2a2522, WOOD_D = 0x1a1716, IRON = 0x24262c;
  const post = voxModel(CELL, set => {
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, c); };
    box(-2, 0, -2, 1, 1, 1, WOOD_D);             // a stone-dark foot block
    box(-1, 2, -1, 0, 37, 0, WOOD);              // the post
    box(-1, 36, -1, 11, 37, 0, WOOD);            // the arm over the road
    box(-1, 33, -1, 0, 35, 0, WOOD_D);           // a collar under the arm
    box(10, 35, -1, 10, 35, 0, IRON);            // the hook
  }, { centre: [0, 0, 0] });
  // the lantern: a cord, a dark cap, an eight-sided paper body (corners cut square), two ribs, a bottom cap, a red tassel
  const PAPER = 0xc27444, PAPER_L = 0xd2864e, RIB = 0x7e4a30, CAP = 0x241a16, TASSEL = 0x5e2420;
  const lamp = voxModel(CELL, set => {
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, g = 0) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, c, g); };
    box(0, -3, 0, 0, -1, 0, CAP);                                   // the cord
    box(-1, -4, -1, 1, -4, 1, CAP);                                 // the top cap
    for (let y = -9; y <= -5; y++) for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      if (Math.abs(x) === 2 && Math.abs(z) === 2) continue;        // the corners cut: an octagon of square steps
      set(x, y, z, y === -7 ? RIB : y === -6 ? PAPER_L : PAPER, 1);
    }
    box(-1, -10, -1, 1, -10, 1, CAP);                               // the bottom cap
    box(0, -12, 0, 0, -11, 0, TASSEL);                              // the tassel
  }, { centre: [0.5, 0, 0.5], glow: 1.0 });
  const g = new THREE.Group(), swing = new THREE.Group();
  g.add(post); swing.position.set(10.5 * CELL, 35 * CELL, 0); swing.add(lamp); g.add(swing);
  const light = new THREE.PointLight(0xff9248, LAMP_I, 7.5, 1.5); light.position.set(0, -7 * CELL, 0); swing.add(light);
  // a faint warm halo round the paper in the wet air (additive, kept low: the bloom is held back during the opening)
  HALO_TEX ??= canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO_TEX, color: 0xff9a50, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.setScalar(1.5); halo.position.copy(light.position); halo.renderOrder = 6; swing.add(halo);
  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return { g, swing, light };
}

// ------------------------------------------------------------------ the title: pixel text painted once, shown as two halves
const TITLE = '不见刀', INK = '#e6ecf2', LINE = '#0a0d15';
/** act-19: browsers stay silent until the first tap, so the first tap only wakes the sound (the rain and the opening music come
 *  up) and the second one draws the blade; if the sound is already on (a replay) one tap draws */
const HINT0 = '点一下，开始', HINT1 = '点一下，拔刀';
/** the title's own painting: the face over a thin dark outline (a quarter of a font pixel, four directions, no diagonals) */
export function paintTitle(g: CanvasRenderingContext2D, text: string, x: number, y: number, s: number, track: number, col: string, line: string, o: number) {
  let cx = x;
  for (const ch of text) {
    for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) drawPix(g, ch, cx + dx, y + dy, { scale: s, color: line, outline: null });
    drawPix(g, ch, cx, y, { scale: s, color: col, outline: null });
    cx += pixW(ch) * s + track * s;
  }
}
/** a quad in the overlay (CSS px, y down) showing [v0, v1] of a texture (v from the bottom) */
export function quad(tex: THREE.Texture, v0: number, v1: number, order: number) {
  const geo = new THREE.PlaneGeometry(1, 1), uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? v1 : v0);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  m.renderOrder = order; return m;
}
export const place = (m: THREE.Object3D, x: number, y: number, w: number, h: number) => { m.position.set(x + w / 2, -(y + h / 2), 0); m.scale.set(w, h, 1); };

// ------------------------------------------------------------------ the play
export interface OpeningHost {
  /** the hero's actor (the act built it with the room; the opening poses it by hand while the act idles) */
  actor: BattleActor;
  stage: Stage;
  ov: Overlay;
  /** build the yard (called under the frozen, cut picture) */
  enter(): void;
  /** the sound is already unlocked (then one tap draws) */
  soundOn?: () => boolean;
}
let running: Opening | null = null;
/** start the opening over the rain road the act has just built; resolves when the yard is fully revealed */
export function playOpening(host: OpeningHost) { running?.stop(); running = new Opening(host); return running.done; }
/** a pad button on the opening = a tap (show.ts padScreens) */
export function openingPadTap() { running?.padTap(); }
/** the title screen (title.ts) takes over: an opening still on goes without its cut */
export function stopOpening() { running?.stop(); }

/** captures: a fixed camera over the opening (__dh.opCam([x,y,z],[lx,ly,lz],fov) / __dh.opCam(null)) */
const OP_CAM: { base: THREE.Vector3 | null; look: THREE.Vector3; fov: number } = { base: null, look: V3(), fov: 30 };
/** QA: __dh.opNoGrab(true) pretends the frame grab came back empty (the wipe fallback) */
const OP_QA = { noGrab: false };
dh.add({ opCam: (b: number[] | null, l?: number[], fov = 30) => { OP_CAM.base = b ? V3(b[0], b[1], b[2]) : null; if (l) OP_CAM.look.set(l[0], l[1], l[2]); OP_CAM.fov = fov; },
  opNoGrab: (on = true) => { OP_QA.noGrab = on; },
  /** QA: where the opening is (null when none is on) */
  opInfo: () => running && { beat: running.beat, t: +running.t.toFixed(2), ripples: running.ripplesLive() } });

type Beat = 'rain' | 'flash' | 'draw' | 'fly' | 'cut' | 'split' | 'done';
const HERO_YAW = -0.5, HERO_AT = V3(0.15, 0, 3.0), LAMP_AT = V3(-2.55, 0, 2.3);
/** the draw-cut: its length (s) and the moment the blade crosses (share of it) */
const DRAW_T = 0.4, DRAW_IMP = 0.42;

class Opening {
  beat: Beat = 'rain'; t = 0; private bt = 0;
  readonly done: Promise<void>; private resolve!: () => void;
  private rain: Rain; private rip: Ripples; private lamp: ReturnType<typeof lanternPost>; private blob: THREE.Mesh;
  private flashK = 0; private flashT = -1;
  private wave: BladeArc | null = null; private waveFrom = V3(); private waveTo = V3();
  private hookId: string; private baseHook: PoseFn | undefined;
  /** overlay pieces: the title halves, the hint, the cut line, the frozen picture's two slabs */
  private tex: THREE.CanvasTexture | null = null; private top: THREE.Mesh | null = null; private bot: THREE.Mesh | null = null; private hint: THREE.Mesh | null = null; private hintTex: THREE.CanvasTexture | null = null;
  private lay = { x: 0, y: 0, w: 1, h: 1, cut: 0.5, hx: 0, hy: 0, hw: 1, hh: 1, key: '' };
  private line: THREE.Mesh[] = []; private slabs: THREE.Mesh[] = []; private frame: THREE.CanvasTexture | null = null; private grab = false; private grabbed = false;
  private titleA = 0; private shift = 0; private lineK = 0;
  private alive = true; private onDown = (e: Event) => this.tap(e); private onKey = (e: KeyboardEvent) => { if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key !== '`' && !e.repeat) this.tap(e); };
  constructor(private host: OpeningHost) {
    this.soundAtStart = host.soundOn?.() ?? false;   // read now: the page's own unlock listener runs before tap() on the first tap
    this.done = new Promise(r => (this.resolve = r));
    const st = host.stage;
    // the night: the mood replaces the built 'day' one (the lantern is the only warm light)
    mood(RAIN_NIGHT); GRADE.exposure = RAIN_NIGHT.exposure!; GRADE.bloomThreshold = RAIN_NIGHT.bloomT!;
    this.lamp = lanternPost(); this.lamp.g.position.copy(LAMP_AT); st.root.add(this.lamp.g);
    const lampAt = this.lamp.g.position.clone().add(V3(10.5 * CELL, 28 * CELL, 0));
    this.rain = new Rain(440, { x0: -6.5, x1: 6.5, z0: -7, z1: 12.5 }, lampAt); st.root.add(this.rain.lines);
    this.rip = new Ripples(); st.root.add(this.rip.mesh);
    this.blob = contactShadow(); this.blob.position.set(HERO_AT.x, 0.02, HERO_AT.z); st.root.add(this.blob);
    // the hero: on the road, three-quarters to the camera, the blade in its scabbard and the hand on the hilt (the 收刀 pose, held)
    const a = host.actor; a.place(HERO_AT.clone(), HERO_YAW);
    const hold = new Action('noto', 1e6, 2); hold.t = 0.97e6; a.play(hold);
    // the wind in the blindfold's tails: gusts on top of the pose's own flutter (only this actor; the hook is put back at the end)
    this.hookId = a.hid; this.baseHook = POSE_HOOKS[this.hookId];
    const base = this.baseHook;
    if (base) POSE_HOOKS[this.hookId] = (b, t, act, off, self) => { base(b, t, act, off, self); if (self === a) this.pose(b, t); };
    // the stage's own drifting motes (dust, the ambient rain dots) read as speckle against this rain: the alpha pool sits out the opening
    PALPHA.mesh.visible = false;
    shot('opening', t => this.cam(t), { cut: true });
    if (typeof window !== 'undefined') { window.addEventListener('pointerdown', this.onDown); window.addEventListener('keydown', this.onKey); }
    onUpdate((dt, rdt) => { if (this.alive) this.update(dt, rdt); });
    host.ov.after.push(this.after);
  }
  // ---------------------------------------------------------------- the camera: low and close, a slow push-in that never quite stops
  private cam(t: number) {
    if (OP_CAM.base) return { base: OP_CAM.base.clone(), look: OP_CAM.look.clone(), fov: OP_CAM.fov };
    const k = 1 - Math.pow(1 - Math.min(1, t / 9), 3), br = Math.sin(t * 0.21) * 0.08;
    const base = V3(1.3 - 0.75 * k + br, 1.22 - 0.1 * k + br * 0.2, HERO_AT.z + 11.4 - 2.6 * k);
    const look = V3(0.1 * k + br * 0.4, 1.9 - 0.05 * k, HERO_AT.z);
    return { base, look, fov: 34 - 2 * k };
  }
  /** on top of the held 收刀 pose: standing a little taller, the face lifted to the rain and turning now and then to listen (the
   *  hat tips back with it, so the blindfold shows); wind gusts in the blindfold's tails */
  private pose(b: Record<string, Bone>, t: number) {
    const k = this.idleK, ls = Math.sin(t * 0.45) * 0.5 + Math.sin(t * 0.17 + 2) * 0.5;
    if (this.beat === 'rain' || this.beat === 'flash') b.weapon?.scale.setZ(0.6);
    rot(b.chest, -0.08 * k, 0, 0); rot(b.neck, -0.2 * k, 0.12 * ls * k, 0); rot(b.head, -0.14 * k, 0.16 * ls * k, 0.1 * ls * k);
    const gust = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.31 + 1.3);
    for (const [names, ph] of [[['bfA1', 'bfA2', 'bfA3'], 0], [['bfB1', 'bfB2', 'bfB3'], 1.7]] as Array<[string[], number]>) names.forEach((n, i) => {
      if (!b[n]) return; const w = Math.sin(t * 5.2 - i * 1.1 + ph) * (0.06 + 0.1 * gust) * (1 + 0.4 * i);
      rot(b[n], (i === 0 ? 0.28 : 0.08) * gust + w * 0.5, 0, Math.sin(t * 3.1 - i * 0.8 + ph) * 0.06 * (0.5 + gust) + (i === 0 ? 0.12 * gust : 0));
    });
  }
  /** 1 while he stands listening, easing to 0 once the lightning breaks */
  private idleK = 1;
  // ---------------------------------------------------------------- input
  private hintText = HINT0; private armed = false; private soundAtStart = false;
  padTap() { this.tap(null); }
  private tap(e: Event | null) {
    if (this.beat !== 'rain' || this.t < 0.4) return;
    if (e?.type === 'keydown') e.preventDefault();
    // the first tap wakes the sound (show.ts unlocks the audio on the same tap and starts the opening music)
    if (!this.armed && !this.soundAtStart) { this.armed = true; this.hintText = HINT1; this.layoutTitle(); return; }
    this.beat = 'flash'; this.bt = 0; this.flashT = 0; cue('thunder', 1);
    if (this.titleA < 1) this.titleA = Math.max(this.titleA, 0.6);
  }
  // ---------------------------------------------------------------- the frame
  private update(dt: number, rdt: number) {
    this.t += rdt; this.bt += rdt;
    const a = this.host.actor;
    if (this.beat !== 'split' && this.beat !== 'done') {
      // the lightning: a hard white-blue flash, a dip, a second flicker, then it ebbs (real time: hit-stop never stretches it)
      if (this.flashT >= 0) {
        this.flashT += rdt; const f = this.flashT;
        this.flashK = f < 0.04 ? f / 0.04 : f < 0.1 ? 1 - (f - 0.04) / 0.06 * 0.75 : f < 0.15 ? 0.25 + (f - 0.1) / 0.05 * 0.55 : Math.max(0, 0.8 * Math.pow(Math.max(0, 1 - (f - 0.15) / 0.55), 2));
        mood(RAIN_NIGHT, FLASH, this.flashK); GRADE.flash = this.flashK * 0.06; GRADE.flashCol.setRGB(0.82, 0.88, 1);
        if (f < 0.05) a.tint(0xd8e4ff, 0.7);
        if (f > 0.75) { this.flashT = -1; this.flashK = 0; mood(RAIN_NIGHT); GRADE.flash = 0; }
      }
      this.rain.update(dt, this.flashK, (x, z) => { const d = Math.hypot(x - HERO_AT.x, z - HERO_AT.z); if (d < 3.4 || (d < 7 && z > -1 && Math.random() < 0.12)) this.rip.spawn(x, z); });
      this.rip.update(dt, this.flashK);
      // the lantern hangs askew in the wind and sways; its flame breathes
      const s = this.lamp.swing; s.rotation.z = 0.2 + Math.sin(this.t * 0.9) * 0.05 + Math.sin(this.t * 2.3) * 0.015; s.rotation.x = Math.sin(this.t * 0.7 + 1) * 0.04;
      this.lamp.light.intensity = LAMP_I * (1 + Math.sin(this.t * 7.3) * 0.05 + Math.sin(this.t * 17) * 0.03);
      if (this.beat !== 'rain') this.idleK = Math.max(0, this.idleK - rdt * 6);
      a.update(dt);
    }
    // ---- the beats
    if (this.beat === 'flash' && this.bt > 0.2) this.draw();
    if (this.beat === 'draw') {
      // the draw turns him square to the lens and carries him a step in; the light leaves the blade at the impact
      const k = Math.min(1, this.bt / 0.1); a.yaw += (this.yawTo - a.yaw) * k;
      a.home.lerpVectors(HERO_AT, this.drawTo, 1 - Math.pow(1 - Math.min(1, this.bt / 0.16), 3));
      if (this.bt > DRAW_T * DRAW_IMP) this.fly();
    }
    if (this.beat === 'fly' && this.wave) {
      const w = this.wave, k = Math.min(1, this.bt / this.flyT);
      // straight at the lens, rising a touch to meet the title's cut row; real time (the hit-stop of the cut never freezes it)
      const p = V3().lerpVectors(this.waveFrom, this.waveTo, k * k * 0.35 + k * 0.65);
      // it widens as it comes: from a blade's sweep at the hero to the whole width of the view at the end
      w.set(p, 1.4 + (this.arcEnd - 1.4) * k * k, rdt, 1);
      if (k >= 1) this.cut();
    }
    if (this.beat === 'cut') {
      // the line runs across the screen, holds; the title's halves slip along the cut; then the picture is taken and split
      this.lineK = Math.min(1, this.bt / 0.06); this.shift = this.bt < 0.08 ? 0 : Math.min(1, (this.bt - 0.08) / 0.28);
      if (this.bt > 0.5 && !this.grab && !this.frame) this.grab = true;
      if (this.frame) this.split();
    }
    if (this.beat === 'split') this.slide();
    this.layoutTitle();
    this.drawOverlay(rdt);
  }
  private yawTo = 0; private drawTo = V3(); private flyT = 0.3; private arcEnd = 3;
  /** the world point d metres from the lens on the view ray through the screen's centre column at the title's cut row */
  private cutPoint(d: number) {
    const ndc = V3(0, -(this.lay.cut / Math.max(1, this.host.ov.h)) * 2 + 1, 0.5).unproject(camera), cp = camera.position.clone();
    return cp.addScaledVector(ndc.sub(cp).normalize(), d);
  }
  private draw() {
    this.beat = 'draw'; this.bt = 0;
    const a = this.host.actor, cp = camera.position;
    this.yawTo = Math.atan2(cp.x - HERO_AT.x, cp.z - HERO_AT.z);
    this.drawTo.copy(HERO_AT).add(V3(Math.sin(this.yawTo), 0, Math.cos(this.yawTo)).multiplyScalar(0.55));
    a.play(new Action('k1', DRAW_T, DRAW_IMP)); cue('draw', 1); cue('swishHeavy', 0.8); shake(0.12);
  }
  private fly() {
    this.beat = 'fly'; this.bt = 0;
    const a = this.host.actor, from = a.home.clone().add(V3(0, 1.05, 0)).addScaledVector(a.fwd(), 0.6), to = this.cutPoint(2.6);
    this.waveFrom.copy(from); this.waveTo.copy(to);
    this.flyT = Math.max(0.16, from.distanceTo(to) / 22);
    this.wave = new BladeArc(this.host.stage.root); this.arcEnd = 2 * 2.6 * Math.tan(camera.fov * Math.PI / 360) * camera.aspect * 1.15;
    fxSparks(from.clone(), 0xe8f2ff, 10, 4); cue('swish', 0.6);
  }
  private cut() {
    this.beat = 'cut'; this.bt = 0; this.wave?.kill(); this.wave = null;
    hitstop(0.6); shake(0.25); cue('ultSlash', 1);
  }
  /** the picture is in this.frame: put the two slabs over everything, build the yard under them, start the slide */
  private split() {
    this.beat = 'split'; this.bt = 0;
    const ov = this.host.ov, W = ov.w, H = ov.h, c = this.lay.cut, v = 1 - c / H;
    if (!this.grabbed) {
      // no picture to split (see after()): the stage's own wipe carries it into the yard instead — never a black frame
      this.beat = 'done';
      void wipeTransit(() => { for (const m of [this.top, this.bot, this.hint, ...this.line]) if (m) m.visible = false; this.restore(); this.host.enter(); }).then(() => this.finish());
      return;
    }
    const up = quad(this.frame!, v, 1, 95), dn = quad(this.frame!, 0, v, 95);
    place(up, 0, 0, W, c); place(dn, 0, c, W, H - c); ov.scene.add(up, dn); this.slabs = [up, dn];
    // the title and the line now live in the picture
    for (const m of [this.top, this.bot, this.hint, ...this.line]) if (m) m.visible = false;
    this.restore();
    try { this.host.enter(); } catch (e) { console.error('[opening] enter failed', e); }
    cue('swishHeavy', 0.7);
  }
  private slide() {
    const ov = this.host.ov, W = ov.w, H = ov.h, c = this.lay.cut, k = Math.min(1, Math.max(0, (this.bt - 0.1) / 0.75)), e = k * k * (3 - 2 * k) * 0.35 + k * k * k * 0.65;
    const [up, dn] = this.slabs;
    if (up && dn) { place(up, 0, -e * (c + 8), W, c); place(dn, 0, c + e * (H - c + 8), W, H - c); }
    // a thin bright edge rides on each cut face and fades
    const edgeA = Math.max(0, 1 - this.bt / 0.6);
    this.ensureLine(); const [l0, l1] = this.line;
    if (l0 && l1) { l0.visible = l1.visible = edgeA > 0.01; place(l0, 0, c - e * (c + 8) - 2, W, 2); place(l1, 0, c + e * (H - c + 8), W, 2); for (const l of [l0, l1]) (l.material as THREE.MeshBasicMaterial).opacity = edgeA; }
    if (k >= 1) this.finish();
  }
  /** the picture of the frame just drawn (overlay after-hook): taken once, the frame the cut stands still in */
  private after = (r: THREE.WebGLRenderer) => {
    if (!this.grab || this.frame) return;
    this.grab = false;
    try {
      const src = r.domElement as HTMLCanvasElement, ov = this.host.ov, k = Math.min(2, src.width / Math.max(1, ov.w));
      const c = document.createElement('canvas'); c.width = Math.round(ov.w * k); c.height = Math.round(ov.h * k);
      const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(src, 0, 0, c.width, c.height);
      // a browser that hands back an empty drawing buffer would give black slabs: check a few points, else wipe over instead
      let lit = 0; for (let i = 1; i < 5; i++) for (let j = 1; j < 5; j++) { const d = g.getImageData(Math.floor(c.width * i / 5), Math.floor(c.height * j / 5), 1, 1).data; lit = Math.max(lit, d[0], d[1], d[2]); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; this.frame = t;
      this.grabbed = lit > 6 && !OP_QA.noGrab;
    } catch (e) { console.error('[opening] frame grab failed', e); this.frame = blankTex(); this.grabbed = false; }
  };
  // ---------------------------------------------------------------- the overlay: the title, the hint, the cut line
  private layoutTitle() {
    const ov = this.host.ov, W = ov.w, H = ov.h, k = ov.dpr, key = `${W}x${H}@${k}`;
    if (key === this.lay.key) return;
    this.lay.key = key;
    // the title: about a sixth of the screen tall, a whole number of device px per font px (S); three characters with a gap between
    const S = Math.max(3, Math.round(Math.min(H * 0.15, W * 0.28 / 3.6) * k / PIX_H)), track = 3, o = Math.max(1, Math.round(S * 0.18)), pad = 2 * o;
    const cw = (pixW(TITLE) + track * (TITLE.length - 1)) * S + pad * 2, ch = PIX_H * S + pad * 2;
    this.tex?.dispose();
    this.tex = canvasTex(cw, ch, g => { g.imageSmoothingEnabled = false; paintTitle(g, TITLE, pad, pad, S, track, INK, LINE, o); }, { nearest: true });
    const x = Math.round((W - cw / k) / 2), y = Math.round(H * 0.2 - ch / k / 2);
    // the cut runs through the middle row of the characters
    const cutRow = (pad + 6 * S) / k, v = 1 - (pad + 6 * S) / ch;
    for (const m of [this.top, this.bot]) if (m) { this.host.ov.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    this.top = quad(this.tex, v, 1, 90); this.bot = quad(this.tex, 0, v, 90); this.host.ov.scene.add(this.top, this.bot);
    Object.assign(this.lay, { x, y, w: cw / k, h: ch / k, cut: y + cutRow });
    // the hint: small, under the title (about a thirtieth of the screen tall)
    const HS = Math.max(1, Math.round(Math.max(16, Math.min(22, H * 0.034)) * k / PIX_H)), ho = Math.max(1, Math.round(HS * 0.5)), hw = pixW(this.hintText) * HS + ho * 4, hh = PIX_H * HS + ho * 4;
    this.hintTex?.dispose();
    this.hintTex = canvasTex(hw, hh, g => { g.imageSmoothingEnabled = false; paintTitle(g, this.hintText, ho * 2, ho * 2, HS, 0, '#b8c4d4', LINE, ho); }, { nearest: true });
    if (this.hint) { this.host.ov.scene.remove(this.hint); this.hint.geometry.dispose(); (this.hint.material as THREE.Material).dispose(); }
    this.hint = quad(this.hintTex, 0, 1, 90); this.host.ov.scene.add(this.hint);
    Object.assign(this.lay, { hx: Math.round((W - hw / k) / 2), hy: Math.round(y + ch / k + Math.max(14, H * 0.05)), hw: hw / k, hh: hh / k });
  }
  private ensureLine() {
    if (this.line.length) return;
    const mk = (c: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: c, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })); m.renderOrder = 96; this.host.ov.scene.add(m); return m; };
    this.line = [mk(0xf6faff), mk(0xf6faff), mk(0xa8ccff), mk(0x7aa8ff)];
  }
  private drawOverlay(rdt: number) {
    const L = this.lay;
    if (this.beat === 'split' || this.beat === 'done') return;
    // the title fades in slowly once the rain has settled in (from 1.2 s, over 3.5 s), rising a few pixels
    if (this.beat === 'rain') this.titleA = Math.min(1, this.titleA + Math.max(0, this.t > 1.2 ? rdt / 3.5 : 0));
    else this.titleA = Math.min(1, this.titleA + rdt * 4);
    const ta = this.titleA * this.titleA * (3 - 2 * this.titleA), rise = (1 - ta) * 8;
    const cutY = L.cut - L.y, sx = this.shift * this.shift * (3 - 2 * this.shift) * Math.max(10, this.host.ov.w * 0.018);
    if (this.top && this.bot) {
      place(this.top, L.x - sx, L.y + rise - this.shift * 2, L.w, cutY); place(this.bot, L.x + sx, L.y + rise + cutY + this.shift * 2, L.w, L.h - cutY);
      for (const m of [this.top, this.bot]) { const mt = m.material as THREE.MeshBasicMaterial; mt.opacity = ta; mt.color.setScalar(1 + this.flashK * 0.4); }
    }
    // the hint breathes slowly once the title is up; it goes at the tap
    if (this.hint) {
      const up = Math.max(0, Math.min(1, (this.t - 4.2) / 1.2)), br = 0.42 + 0.4 * (0.5 + 0.5 * Math.sin((this.t - 4.2) * Math.PI * 2 / 3.4));
      const mt = this.hint.material as THREE.MeshBasicMaterial; mt.opacity = this.beat === 'rain' ? up * br : Math.max(0, mt.opacity - rdt * 6);
      place(this.hint, L.hx, L.hy, L.hw, L.hh);
    }
    // the cut line: a white core in a pale-blue glow, opening from the middle out to both edges at the title's middle row
    if (this.beat === 'cut') {
      this.ensureLine(); const W = this.host.ov.w, [core, , inner, outer] = this.line, wk = 1 - Math.pow(1 - this.lineK, 3), fade = this.bt < 0.25 ? 1 : Math.max(0.6, 1 - (this.bt - 0.25) * 1.2);
      const lw = W * wk, lx = (W - lw) / 2, th = Math.max(2, Math.round(this.host.ov.h / 240));
      for (const m of [core, inner, outer]) m.visible = true;
      place(core, lx, L.cut - th / 2, lw, th); place(inner, lx, L.cut - th * 2, lw, th * 4); place(outer, lx, L.cut - th * 6, lw, th * 12);
      (core.material as THREE.MeshBasicMaterial).opacity = fade; (inner.material as THREE.MeshBasicMaterial).opacity = 0.42 * fade; (outer.material as THREE.MeshBasicMaterial).opacity = 0.12 * fade;
    }
  }
  // ---------------------------------------------------------------- the end
  /** the act's world is the yard now: give back the pose hook and the grade, keep only the slabs (they finish their slide) */
  private restore() {
    if (this.baseHook) POSE_HOOKS[this.hookId] = this.baseHook;
    GRADE.flash = 0; PALPHA.clear(); PALPHA.mesh.visible = true;
    if (typeof window !== 'undefined') { window.removeEventListener('pointerdown', this.onDown); window.removeEventListener('keydown', this.onKey); }
    this.rain.dispose(); this.rip.dispose(); this.wave?.kill(); this.wave = null;
  }
  private finish() {
    this.beat = 'done'; this.alive = false;
    const ov = this.host.ov;
    for (const m of [this.top, this.bot, this.hint, ...this.line, ...this.slabs]) if (m) { ov.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    this.tex?.dispose(); this.hintTex?.dispose(); this.frame?.dispose();
    const i = ov.after.indexOf(this.after); if (i >= 0) ov.after.splice(i, 1);
    if (running === this) running = null;
    this.resolve();
  }
  ripplesLive() { return this.rip.live(); }
  /** stop without the cut (__dh.opening() while one is still on): everything goes, the act carries on from wherever it is */
  stop() {
    if (!this.alive) return;
    if (this.beat !== 'split') this.restore();
    this.finish();
  }
}

// ------------------------------------------------------------------ helpers
let SHADOW_TEX: THREE.Texture | null = null;
export function contactShadow() {
  SHADOW_TEX ??= canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x05060a, map: SHADOW_TEX, transparent: true, opacity: 0.7, depthWrite: false }));
  m.renderOrder = 2; return m;
}
function blankTex() { const t = new THREE.DataTexture(new Uint8Array([10, 13, 21, 255]), 1, 1); t.needsUpdate = true; return t as unknown as THREE.CanvasTexture; }
