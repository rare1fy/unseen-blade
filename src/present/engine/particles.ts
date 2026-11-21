import { effectLimit } from '../look/quality';
import { dirtyRange } from './uploads';
import { OPT } from './perfOpts';
// GPU-light particles: one instanced quad mesh per pool, simulated on the CPU (port of the prototype kit's ParticlePool).
// Two pools like the kit: PADD (additive: glows, sparks, embers, flares) and PALPHA (alpha: smoke, dust, mist).
// The tile sheet is look-dependent: 'pixel' = chunky stepped shapes (pixel looks), 'soft' = smooth falloffs (painterly / clean looks).
import * as THREE from 'three';
import { scene, canvasTex, WHITE, TAU } from './world';
import { lerp, ease } from './clock';
import { PXU } from '../look/pixel';

export const TILE = { glow: 0, spark: 1, smoke: 2, ring: 3, flare: 4, pixel: 5, streak: 6, disc: 7 } as const;
export type TileName = keyof typeof TILE;

function paintTiles(g: CanvasRenderingContext2D, style: 'pixel' | 'soft') {
  const cheb = (x: number, y: number) => Math.max(Math.abs(x), Math.abs(y)), man = (x: number, y: number) => Math.abs(x) + Math.abs(y);
  const blobs = [[-2, -1, 4], [3, 1, 3], [0, 3, 3], [-3, 3, 2.5], [2, -3, 2.5]];
  const shapes: Array<(x: number, y: number) => number> = style === 'pixel' ? [
    (x, y) => { const d = cheb(x, y), m = man(x, y); return d < 2.5 ? 1 : m < 6.5 && d < 4.5 ? 0.55 : m < 9.5 && d < 6.5 ? 0.22 : 0; },
    (x, y) => { const d = cheb(x, y); return d < 1.5 ? 1 : d < 3.5 && man(x, y) < 4.5 ? 0.5 : 0; },
    (x, y) => { let a = 0; for (const [bx, by, r] of blobs) if (cheb(x - bx, y - by) < r) a = Math.max(a, cheb(x - bx, y - by) < r - 1.5 ? 0.42 : 0.24); return a; },
    (x, y) => { const d = cheb(x, y); return d > 4.5 && d < 6.5 ? 1 : d > 3.5 && d < 7.5 ? 0.4 : 0; },
    (x, y) => { const ax = Math.abs(x), ay = Math.abs(y); return (ax < 1 && ay < 7.5) || (ay < 1 && ax < 7.5) ? 1 : ax < 2 && ay < 2 ? 1 : (ax < 2 && ay < 4) || (ay < 2 && ax < 4) ? 0.5 : 0; },
    (x, y) => (cheb(x, y) < 5 ? 1 : 0),
    (x, y) => (Math.abs(y) < 1.5 && x > -7.5 ? (x > 4 ? 1 : x > 0 ? 0.7 : x > -4 ? 0.4 : 0.2) : 0),
    (x, y) => (cheb(x, y) < 7 && man(x, y) < 12 ? 1 : 0),
  ] : [
    (x, y) => { const r = Math.hypot(x, y) / 8; return Math.max(0, 1 - r) ** 2.2; },
    (x, y) => { const r = Math.hypot(x, y) / 3.5; return Math.max(0, 1 - r) ** 1.5; },
    (x, y) => { let a = 0; for (const [bx, by, r] of blobs) a = Math.max(a, Math.max(0, 1 - Math.hypot(x - bx, y - by) / (r + 1)) * 0.5); return a; },
    (x, y) => { const r = Math.hypot(x, y); return Math.max(0, 1 - Math.abs(r - 6) / 1.6); },
    (x, y) => { const ax = Math.abs(x), ay = Math.abs(y); return Math.max(Math.max(0, 1 - ay / 1.2) * Math.max(0, 1 - ax / 8), Math.max(0, 1 - ax / 1.2) * Math.max(0, 1 - ay / 8), Math.max(0, 1 - Math.hypot(x, y) / 3)); },
    (x, y) => (Math.hypot(x, y) < 5 ? 1 : 0),
    (x, y) => (Math.abs(y) < 1.6 ? Math.max(0, (x + 8) / 16) * (1 - Math.abs(y) / 1.6) : 0),
    (x, y) => Math.max(0, Math.min(1, (7.2 - Math.hypot(x, y)) * 1.5)),
  ];
  const cell = style === 'pixel' ? 4 : 1, n = 64 / cell;
  shapes.forEach((fn, tile) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const a = fn((x + 0.5) * (16 / n) - 8, (y + 0.5) * (16 / n) - 8); if (a <= 0.002) continue;
      g.fillStyle = `rgba(255,255,255,${Math.min(1, a)})`; g.fillRect(tile * 64 + x * cell, y * cell, cell, cell);
    }
  });
}

// Pixel look (look/pixel.ts, shared uPx): every quad is at least uPxMin art pixels wide so sparks never vanish between art pixels,
// alpha falls in stepped bands (stepped halos), and glows / sparks / flares get a square full-bright core.
const VS = `attribute vec3 aPos; attribute vec3 aVel; attribute vec4 aCol; attribute vec4 aMisc; uniform float uPx, uArtH, uPxMin; varying vec2 vUv; varying vec4 vCol; varying float vTile;
  void main(){ vec4 mv = modelViewMatrix * vec4(aPos, 1.0); float size = aMisc.x, rot = aMisc.y, st = aMisc.w; vec2 ax, ay;
    if (uPx > 0.5) size = max(size, uPxMin * 2.0 * max(-mv.z, 0.01) / (projectionMatrix[1][1] * uArtH));
    if (st > 0.0) { vec2 d = (modelViewMatrix * vec4(aVel, 0.0)).xy; float L = length(d); d = L > 1e-4 ? d / L : vec2(1.0, 0.0); ax = d * size * (1.0 + L * st); ay = vec2(-d.y, d.x) * size; }
    else { float c = cos(rot), s = sin(rot); ax = vec2(c, s) * size; ay = vec2(-s, c) * size; }
    mv.xy += ax * position.x + ay * position.y; gl_Position = projectionMatrix * mv; vUv = uv; vCol = aCol; vTile = aMisc.z; }`;
const FS = `uniform sampler2D uTex; uniform float uPx; varying vec2 vUv; varying vec4 vCol; varying float vTile;
  void main(){ vec4 t = texture2D(uTex, vec2((vUv.x + vTile) / 8.0, vUv.y)); float a0 = t.a; vec3 c = vCol.rgb * t.rgb;
    if (uPx > 0.5) {
      vec2 q = abs(vUv - 0.5) * 2.0; float m = max(q.x, q.y);
      float core = (vTile < 1.5 || abs(vTile - 4.0) < 0.5) ? step(m, 0.3) : 0.0;
      a0 = a0 > 0.8 ? 1.0 : max(floor(a0 * 4.0 + 0.5) / 4.0, min(a0, 0.125));   // rounded bands; the faint tail stays soft so haze keeps its energy
      a0 = max(a0, core); c *= 1.0 + 0.6 * core;
    }
    float a = a0 * vCol.a; if (a < 0.002) discard; gl_FragColor = vec4(c, a); }`;

export interface Emit {
  p: THREE.Vector3; v?: THREE.Vector3; c0?: THREE.Color; c1?: THREE.Color; bright?: number; bright1?: number;
  s0?: number; s1?: number; life?: number; grav?: number; drag?: number; alpha?: number; rot?: number; spin?: number;
  tile?: number; stretch?: number; fadeIn?: number;
}
const ZERO = new THREE.Vector3();

export class ParticlePool {
  n = 0; readonly mesh: THREE.Mesh; private geo: THREE.InstancedBufferGeometry; readonly mat: THREE.ShaderMaterial;
  private aPos: THREE.InstancedBufferAttribute; private aVel: THREE.InstancedBufferAttribute; private aCol: THREE.InstancedBufferAttribute; private aMisc: THREE.InstancedBufferAttribute;
  private p: Float32Array; private v: Float32Array; private c0: Float32Array; private c1: Float32Array; private s: Float32Array; private lf: Float32Array; private m: Float32Array;
  constructor(readonly max: number, additive: boolean, order: number, tex: THREE.Texture) {
    const quad = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv);
    const A = (k: string, s: number) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * s), s); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); return a; };
    this.aPos = A('aPos', 3); this.aVel = A('aVel', 3); this.aCol = A('aCol', 4); this.aMisc = A('aMisc', 4); g.instanceCount = 0; this.geo = g;
    this.mat = new THREE.ShaderMaterial({ uniforms: { uTex: { value: tex }, uPx: PXU.uPx, uArtH: PXU.uArtH, uPxMin: PXU.uPxMin }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = order; scene.add(this.mesh);
    const F = (k: number) => new Float32Array(max * k);
    this.p = F(3); this.v = F(3); this.c0 = F(3); this.c1 = F(3); this.s = F(2); this.lf = F(2); this.m = F(8);
  }
  private changed = false;
  emit(o: Emit): number {
    if (this.n >= effectLimit(this.max)) return -1;
    this.changed = true;
    const i = this.n++, i3 = i * 3, i2 = i * 2, i8 = i * 8, p = o.p, v = o.v || ZERO, c0 = o.c0 || WHITE, c1 = o.c1 || c0;
    this.p[i3] = p.x; this.p[i3 + 1] = p.y; this.p[i3 + 2] = p.z; this.v[i3] = v.x; this.v[i3 + 1] = v.y; this.v[i3 + 2] = v.z;
    const b0 = o.bright ?? 1, b1 = o.bright1 ?? b0;
    this.c0[i3] = c0.r * b0; this.c0[i3 + 1] = c0.g * b0; this.c0[i3 + 2] = c0.b * b0; this.c1[i3] = c1.r * b1; this.c1[i3 + 1] = c1.g * b1; this.c1[i3 + 2] = c1.b * b1;
    this.s[i2] = o.s0 ?? 0.2; this.s[i2 + 1] = o.s1 ?? this.s[i2]; this.lf[i2] = 0; this.lf[i2 + 1] = o.life ?? 0.6;
    this.m[i8] = o.grav ?? 0; this.m[i8 + 1] = o.drag ?? 0; this.m[i8 + 2] = o.alpha ?? 1; this.m[i8 + 3] = o.rot ?? Math.random() * TAU; this.m[i8 + 4] = o.spin ?? 0;
    this.m[i8 + 5] = o.tile ?? 0; this.m[i8 + 6] = o.stretch ?? 0; this.m[i8 + 7] = o.fadeIn ?? 0.08;
    return i;
  }
  update(dt: number) {
    this.n = Math.min(this.n, effectLimit(this.max));
    if (!dt && !this.changed && OPT.dirtyUploads) return;
    this.changed = false;
    const P = this.p, Vv = this.v, ap = this.aPos.array as Float32Array, av = this.aVel.array as Float32Array, ac = this.aCol.array as Float32Array, am = this.aMisc.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const i2 = i * 2; this.lf[i2] += dt;
      if (this.lf[i2] >= this.lf[i2 + 1]) { this.kill(i); i--; continue; }
      const i3 = i * 3, i4 = i * 4, i8 = i * 8, k = this.lf[i2] / this.lf[i2 + 1], dr = Math.exp(-this.m[i8 + 1] * dt);
      Vv[i3] *= dr; Vv[i3 + 1] = Vv[i3 + 1] * dr - this.m[i8] * dt; Vv[i3 + 2] *= dr;
      P[i3] += Vv[i3] * dt; P[i3 + 1] += Vv[i3 + 1] * dt; P[i3 + 2] += Vv[i3 + 2] * dt;
      this.m[i8 + 3] += this.m[i8 + 4] * dt;
      ap[i3] = P[i3]; ap[i3 + 1] = P[i3 + 1]; ap[i3 + 2] = P[i3 + 2]; av[i3] = Vv[i3]; av[i3 + 1] = Vv[i3 + 1]; av[i3 + 2] = Vv[i3 + 2];
      const fi = this.m[i8 + 7], a = (k < fi ? k / fi : 1 - Math.pow((k - fi) / (1 - fi), 1.6)) * this.m[i8 + 2];
      ac[i4] = lerp(this.c0[i3], this.c1[i3], k); ac[i4 + 1] = lerp(this.c0[i3 + 1], this.c1[i3 + 1], k); ac[i4 + 2] = lerp(this.c0[i3 + 2], this.c1[i3 + 2], k); ac[i4 + 3] = a;
      am[i4] = lerp(this.s[i2], this.s[i2 + 1], ease.outCubic(k)); am[i4 + 1] = this.m[i8 + 3]; am[i4 + 2] = this.m[i8 + 5]; am[i4 + 3] = this.m[i8 + 6];
    }
    this.geo.instanceCount = this.n;
    dirtyRange(this.aPos, 0, this.n * 3); dirtyRange(this.aVel, 0, this.n * 3);
    dirtyRange(this.aCol, 0, this.n * 4); dirtyRange(this.aMisc, 0, this.n * 4);
  }
  clear() { this.n = 0; this.geo.instanceCount = 0; }
  private kill(i: number) {
    const j = --this.n; if (i === j) return;
    const cp = (arr: Float32Array, s: number) => { for (let k = 0; k < s; k++) arr[i * s + k] = arr[j * s + k]; };
    cp(this.p, 3); cp(this.v, 3); cp(this.c0, 3); cp(this.c1, 3); cp(this.s, 2); cp(this.lf, 2); cp(this.m, 8);
  }
}

export let PADD: ParticlePool, PALPHA: ParticlePool;
let tex: THREE.Texture | null = null;
/** Create (or restyle) the two pools. Called by the look pack. */
export function initParticles(style: 'pixel' | 'soft') {
  const t = canvasTex(512, 64, g => paintTiles(g, style), { nearest: style === 'pixel' });
  if (!tex) { PADD = new ParticlePool(3200, true, 20, t); PALPHA = new ParticlePool(1600, false, 19, t); }
  else { PADD.mat.uniforms.uTex.value = t; PALPHA.mat.uniforms.uTex.value = t; tex.dispose(); }
  tex = t;
}
export function updateParticles(dt: number) { PADD?.update(dt); PALPHA?.update(dt); }
