import { instanceMatrix, instanceColor, finishInstances } from "./uploads";
// Pooled effect primitives (port of the prototype kit's VFX 2/3): shockwave rings, ground decals, light pulses, physical debris.
import * as THREE from 'three';
import { scene, camera, canvasTex, V3, C, R, TAU, WHITE } from './world';
import { lerp, ease } from './clock';

// ---- rings (shockwaves): additive bands, optionally camera-facing
const RING_VS = `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FS = `uniform vec3 uCol; uniform float uA, uW, uIn, uStep; varying vec2 vUv;
  void main(){ float r = length(vUv); float band = (r > 1.0 - uW && r < 1.0) ? ((r > 1.0 - uW * 0.7 && r < 1.0 - uW * 0.25) ? 1.0 : 0.45) : 0.0;
    float fill = r < 1.0 ? mix((1.0 - r), floor((1.0 - r) * 3.0) / 3.0, uStep) * uIn : 0.0;
    float a = (band + fill) * mix(uA, floor(uA * 4.0 + 0.5) / 4.0, uStep); if (a < 0.003) discard; gl_FragColor = vec4(uCol * a, a); }`;
export interface RingOpts { color?: THREE.ColorRepresentation; radius?: number; life?: number; width?: number; fill?: number; normal?: THREE.Vector3; bright?: number; r0?: number; billboard?: boolean }
interface Ring { m: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; life: number; busy: boolean; o: RingOpts; r0: number; r1: number }
const rings: Ring[] = [];
/** 1 = stepped (pixel looks), 0 = smooth. */
export const PRIM_STYLE = { step: 1 };
function initRings() {
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: C(0xffffff) }, uA: { value: 0 }, uW: { value: 0.3 }, uIn: { value: 0 }, uStep: { value: PRIM_STYLE.step } }, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); m.visible = false; m.renderOrder = 18; m.frustumCulled = false; scene.add(m);
    rings.push({ m, mat, t: 0, life: 0, busy: false, o: {}, r0: 0.1, r1: 2 });
  }
}
export function ringFx(pos: THREE.Vector3, o: RingOpts = {}) {
  const r = rings.find(x => !x.busy) || rings[0]; if (!r) return; r.busy = true; r.t = 0; r.life = o.life ?? 0.45; r.o = o;
  r.m.position.copy(pos); r.m.quaternion.setFromUnitVectors(V3(0, 0, 1), o.normal || V3(0, 1, 0));
  if (o.billboard) r.m.quaternion.copy(camera.quaternion);
  (r.mat.uniforms.uCol.value as THREE.Color).set(o.color ?? 0xffffff).multiplyScalar(o.bright ?? 2);
  r.mat.uniforms.uW.value = o.width ?? 0.28; r.mat.uniforms.uIn.value = o.fill ?? 0.15; r.mat.uniforms.uStep.value = PRIM_STYLE.step; r.m.visible = true;
  r.r0 = o.r0 ?? 0.1; r.r1 = o.radius ?? 2;
}

// ---- ground decals (scorch / blood): a stepped blot that fades
interface Decal { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; life: number; busy: boolean; a: number }
const decals: Decal[] = [];
function initDecals() {
  const tex = canvasTex(16, 16, g => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) + ((((x * 73 + y * 151) * 2654435761) >>> 0) % 1000 / 1000 - 0.5) * 2.2; const a = d < 3.5 ? 1 : d < 5.5 ? 0.6 : d < 7 ? 0.25 : 0; if (a) { g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(x, y, 1, 1); } } }, { nearest: true });
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 5; scene.add(m);
    decals.push({ m, mat, t: 0, life: 0, busy: false, a: 0 });
  }
}
export function decalFx(pos: THREE.Vector3, o: { life?: number; alpha?: number; color?: THREE.ColorRepresentation; additive?: boolean; radius?: number; y?: number } = {}) {
  const d = decals.find(x => !x.busy) || decals[0]; if (!d) return; d.busy = true; d.t = 0; d.life = o.life ?? 2.5; d.a = o.alpha ?? 0.55; d.mat.color.set(o.color ?? 0x000000);
  d.mat.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
  d.m.position.set(pos.x, (o.y ?? pos.y) + 0.012, pos.z); d.m.scale.setScalar(o.radius ?? 1.5); d.m.rotation.z = R(0, TAU); d.m.visible = true;
}

// ---- light pulses: a few pooled point lights spells and hits flash the scene with
interface Pulse { l: THREE.PointLight; t: number; life: number; busy: boolean; peak: number }
const pulses: Pulse[] = [];
function initPulses() { for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffffff, 0, 9, 2); scene.add(l); pulses.push({ l, t: 0, life: 0, busy: false, peak: 0 }); } }
export function lightPulse(pos: THREE.Vector3, color: THREE.ColorRepresentation, intensity = 30, life = 0.35, dist = 9) {
  if (!pulses.length) return;
  const p = pulses.find(x => !x.busy) || pulses.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
  p.busy = true; p.t = 0; p.life = life; p.peak = intensity; p.l.color.set(color); p.l.distance = dist; p.l.position.copy(pos);
}

// ---- debris: instanced lit cubes with gravity, bounce, spin, shrink-out (chips, shatter deaths)
const MAXD = 900;
let debrisMesh: THREE.InstancedMesh;
interface Deb { p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; w: THREE.Vector3; s: number; col: THREE.Color; age: number; life: number; glow: number }
const debris: Deb[] = [];
export const floor = { at: (_x: number, _z: number) => 0 };
function initDebris() {
  debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 }), MAXD);
  debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); debrisMesh.setColorAt(0, WHITE); debrisMesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  debrisMesh.count = 0; debrisMesh.frustumCulled = false; debrisMesh.castShadow = true; scene.add(debrisMesh);
}
export function addDebris(pos: THREE.Vector3, vel: THREE.Vector3, size: number, color: THREE.ColorRepresentation, life = R(1.2, 2.0), spin = 1, glow = 0) {
  if (debris.length >= MAXD) debris.shift();
  const d: Deb = { p: pos.clone(), v: vel.clone(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(R(0, 3), R(0, 3), R(0, 3))), w: V3(R(-1, 1), R(-1, 1), R(-1, 1)).normalize().multiplyScalar(R(4, 12) * spin), s: size, col: C(color), age: 0, life, glow };
  debris.push(d); return d;
}
const _m4 = new THREE.Matrix4(), _p = V3(), _q = new THREE.Quaternion(), _s = V3(), _c = new THREE.Color();
export const debrisHooks = { bounce: (_v: number) => {} };
function updateDebris(dt: number) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.age += dt;
    if (d.age >= d.life || d.p.y < -20) { debris.splice(i, 1); continue; }
    d.v.y -= 22 * dt; d.v.multiplyScalar(Math.exp(-0.4 * dt)); d.p.addScaledVector(d.v, dt);
    const f = floor.at(d.p.x, d.p.z) + d.s / 2;
    if (d.p.y < f && d.p.y > f - 1.2) { d.p.y = f; if (d.v.y < 0) { if (d.v.y < -5 && Math.random() < 0.3) debrisHooks.bounce(Math.min(1, -d.v.y / 14)); d.v.y *= -0.3; d.v.x *= 0.65; d.v.z *= 0.65; d.w.multiplyScalar(0.55); } }
    const a = d.w.length(); if (a > 1e-4) { _p.copy(d.w).divideScalar(a); _q.setFromAxisAngle(_p, a * dt); d.q.premultiply(_q); }
  }
  for (let i = 0; i < debris.length; i++) {
    const d = debris[i], k = d.age > d.life - 0.35 ? Math.max(0.001, (d.life - d.age) / 0.35) : 1;
    _s.setScalar(d.s * k); _m4.compose(d.p, d.q, _s); instanceMatrix(debrisMesh, i, _m4);
    _c.copy(d.col); if (d.glow > 0) { const g = d.glow * Math.max(0, 1 - d.age * 2.5); _c.r += g; _c.g += g * 0.8; _c.b += g * 0.5; }
    instanceColor(debrisMesh, i, _c);
  }
  debrisMesh.count = debris.length; finishInstances(debrisMesh);
}

export function initPrims() { initRings(); initDecals(); initPulses(); initDebris(); }
export function updatePrims(dt: number) {
  for (const r of rings) {
    if (!r.busy) continue; r.t += dt; const k = r.t / r.life;
    if (k >= 1) { r.busy = false; r.m.visible = false; continue; }
    r.m.scale.setScalar(lerp(r.r0, r.r1, ease.outCubic(k))); r.mat.uniforms.uA.value = (1 - k) * (1 - k);
    if (r.o.billboard) r.m.quaternion.copy(camera.quaternion);
  }
  for (const d of decals) { if (!d.busy) continue; d.t += dt; const k = d.t / d.life; if (k >= 1) { d.busy = false; d.m.visible = false; continue; } d.mat.opacity = d.a * Math.min(1, k * 12) * (1 - Math.max(0, (k - 0.6) / 0.4)); }
  for (const p of pulses) { if (!p.busy) { p.l.intensity = 0; continue; } p.t += dt; const k = p.t / p.life; if (k >= 1) { p.busy = false; p.l.intensity = 0; continue; } p.l.intensity = p.peak * (k < 0.12 ? k / 0.12 : Math.pow(1 - (k - 0.12) / 0.88, 2)); }
  updateDebris(dt);
}
