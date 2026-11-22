// 超轻量纯 3D 体素像素天气系统（act-175 性能重构）：
//   - InstancedBufferGeometry 单 Mesh 单 Draw Call（与 particles.ts 同款 WebGL1 安全实例化路径）：
//     静态 5 面体素单位盒（剔除镜头永不可见的 -Y 底面，省 17% 三角面）只上传一次，
//     每帧仅更新每实例 10 float（aCenter 3 + aSize 3 + aCol 4 = 40 B），较旧版 CPU 展开 24 顶点（672 B/盒）
//     CPU 写入与 WebGL 缓冲上传带宽双双降低 16.8 倍（-94%）；
//   - 全量预分配 TypedArray SoA 对象池 + 位运算拆色，每帧零堆分配、零 GC 抖动；
//   - 严格世界轴对齐 3D 体素雨柱、二阶像素阶梯斜暴雨、落地空心像素方框水花（□）、弹跳小水块及细体素方雪/十字雪（+）；
//   - 按画质档 QUALITY.tier / effectLimit 自动收紧实例上限与溅射粒子数，切菜单或隐藏时零开销跳过。
import * as THREE from 'three';
import { scene } from '../engine/world';
import { dirtyRange } from '../engine/uploads';
import { effectLimit, QUALITY } from '../look/quality';
import { PALPHA } from '../engine/particles';

const MAX_ITEMS = 480;
const MAX_BOXES = 640;
const INV255 = 1 / 255;

// Particle kind enum (stored in Uint8Array, zero string comparisons in hot loop)
const K_RAIN = 1;
const K_STORM = 2;
const K_SNOW_CUBE = 3;
const K_SNOW_CROSS = 4;
const K_SPLASH = 5;
const K_DROP = 6;

// Static 5-face world-axis-aligned unit voxel box (omits -Y bottom face, invisible from overhead camera)
const FACES: ReadonlyArray<{ v: ReadonlyArray<readonly [number, number, number]>; shade: number }> = [
  { v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]], shade: 1.08 },   // +Y top
  { v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], shade: 0.98 },   // +Z front
  { v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]], shade: 0.84 }, // -Z back
  { v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]], shade: 0.94 },   // +X right
  { v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]], shade: 0.88 }, // -X left
];

const VS = `
attribute float aShade;
attribute vec3 aCenter;
attribute vec3 aSize;
attribute vec4 aCol;
varying vec4 vCol;
void main() {
  vCol = vec4(aCol.rgb * aShade, aCol.a);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(aCenter + position * aSize, 1.0);
}`;

const FS = `
precision highp float;
varying vec4 vCol;
void main() {
  if (vCol.a < 0.04) discard;
  gl_FragColor = vCol;
}`;

const R = (a: number, b: number) => a + Math.random() * (b - a);

class VoxelWeatherPool {
  private mesh: THREE.Mesh | null = null;
  private geo: THREE.InstancedBufferGeometry | null = null;
  private aCenter: THREE.InstancedBufferAttribute | null = null;
  private aSize: THREE.InstancedBufferAttribute | null = null;
  private aCol: THREE.InstancedBufferAttribute | null = null;
  private centerArr = new Float32Array(MAX_BOXES * 3);
  private sizeArr = new Float32Array(MAX_BOXES * 3);
  private colArr = new Float32Array(MAX_BOXES * 4);

  // Zero-allocation SoA particle storage
  private n = 0;
  private kind = new Uint8Array(MAX_ITEMS);
  private x = new Float32Array(MAX_ITEMS);
  private y = new Float32Array(MAX_ITEMS);
  private z = new Float32Array(MAX_ITEMS);
  private vx = new Float32Array(MAX_ITEMS);
  private vy = new Float32Array(MAX_ITEMS);
  private vz = new Float32Array(MAX_ITEMS);
  private sx = new Float32Array(MAX_ITEMS);
  private sy = new Float32Array(MAX_ITEMS);
  private cr = new Float32Array(MAX_ITEMS);
  private cg = new Float32Array(MAX_ITEMS);
  private cb = new Float32Array(MAX_ITEMS);
  private ca = new Float32Array(MAX_ITEMS);
  private age = new Float32Array(MAX_ITEMS);
  private life = new Float32Array(MAX_ITEMS);
  private phase = new Float32Array(MAX_ITEMS);

  private boxCount = 0;
  private time = 0;

  private ensureMesh() {
    if (this.mesh) return;
    const faceN = FACES.length;
    const basePos = new Float32Array(faceN * 4 * 3);
    const baseShade = new Float32Array(faceN * 4);
    const idx = new Uint16Array(faceN * 6);
    for (let f = 0; f < faceN; f++) {
      const face = FACES[f];
      const v0 = f * 4;
      for (let v = 0; v < 4; v++) {
        const pt = face.v[v];
        const vi = (v0 + v) * 3;
        basePos[vi] = pt[0];
        basePos[vi + 1] = pt[1];
        basePos[vi + 2] = pt[2];
        baseShade[v0 + v] = face.shade;
      }
      const ii = f * 6;
      idx[ii] = v0;
      idx[ii + 1] = v0 + 1;
      idx[ii + 2] = v0 + 2;
      idx[ii + 3] = v0;
      idx[ii + 4] = v0 + 2;
      idx[ii + 5] = v0 + 3;
    }

    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(basePos, 3));
    g.setAttribute('aShade', new THREE.BufferAttribute(baseShade, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));

    const ac = new THREE.InstancedBufferAttribute(this.centerArr, 3);
    ac.setUsage(THREE.DynamicDrawUsage);
    const as = new THREE.InstancedBufferAttribute(this.sizeArr, 3);
    as.setUsage(THREE.DynamicDrawUsage);
    const al = new THREE.InstancedBufferAttribute(this.colArr, 4);
    al.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aCenter', ac);
    g.setAttribute('aSize', as);
    g.setAttribute('aCol', al);
    g.instanceCount = 0;

    const mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.renderOrder = 19;
    scene.add(m);
    this.geo = g;
    this.aCenter = ac;
    this.aSize = as;
    this.aCol = al;
    this.mesh = m;
  }

  private limitBoxes() {
    return Math.max(120, Math.min(MAX_BOXES, effectLimit(MAX_BOXES)));
  }

  private limitItems() {
    return Math.min(MAX_ITEMS, Math.floor(this.limitBoxes() * 0.72));
  }

  /** Exposed for perf diagnostics / tests */
  stats() {
    return { items: this.n, boxes: this.boxCount, maxBoxes: this.limitBoxes() };
  }

  clear() {
    this.n = 0;
    this.boxCount = 0;
    if (this.geo) this.geo.instanceCount = 0;
  }

  private addItem(
    k: number, px: number, py: number, pz: number,
    vx: number, vy: number, vz: number,
    sx: number, sy: number,
    r: number, g: number, b: number, a: number,
    life: number, ph: number,
  ) {
    const cap = this.limitItems();
    if (this.n >= cap) return;
    const i = this.n++;
    this.kind[i] = k;
    this.x[i] = px; this.y[i] = py; this.z[i] = pz;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.sx[i] = sx; this.sy[i] = sy;
    this.cr[i] = r; this.cg[i] = g; this.cb[i] = b; this.ca[i] = a;
    this.age[i] = 0; this.life[i] = life; this.phase[i] = ph;
  }

  private killItem(i: number) {
    const j = --this.n;
    if (i === j) return;
    this.kind[i] = this.kind[j];
    this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.z[i] = this.z[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.sx[i] = this.sx[j]; this.sy[i] = this.sy[j];
    this.cr[i] = this.cr[j]; this.cg[i] = this.cg[j]; this.cb[i] = this.cb[j]; this.ca[i] = this.ca[j];
    this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.phase[i] = this.phase[j];
  }

  emitRain(px: number, py: number, pz: number, color: number, storm: boolean, prewarm = false) {
    const r = ((color >> 16) & 255) * INV255;
    const g = ((color >> 8) & 255) * INV255;
    const b = (color & 255) * INV255;
    if (storm) {
      this.addItem(
        K_STORM, px, py, pz,
        R(2.4, 3.3), R(-18.5, -15.2), R(0.12, 0.34),
        R(0.038, 0.046), R(0.50, 0.68),
        r, g, b, 0.72,
        prewarm ? R(0.18, 0.46) : R(0.35, 0.65),
        Math.random() * 6.28,
      );
    } else {
      this.addItem(
        K_RAIN, px, py, pz,
        0, R(-15.5, -12.4), 0,
        R(0.034, 0.042), R(0.68, 1.04),
        r, g, b, 0.64,
        prewarm ? R(0.20, 0.52) : R(0.42, 0.78),
        Math.random() * 6.28,
      );
    }
  }

  emitSnow(px: number, py: number, pz: number, color: number, prewarm = false) {
    const r = ((color >> 16) & 255) * INV255;
    const g = ((color >> 8) & 255) * INV255;
    const b = (color & 255) * INV255;
    const roll = Math.random();
    if (roll < 0.16) {
      this.addItem(
        K_SNOW_CROSS, px, py, pz,
        R(0.32, 0.88), R(-1.35, -0.82), R(-0.18, 0.18),
        R(0.084, 0.108), R(0.028, 0.036),
        r, g, b, 0.86,
        prewarm ? R(1.6, 4.2) : R(2.9, 4.8),
        Math.random() * 6.28,
      );
    } else {
      const mid = roll < 0.66;
      const sz = mid ? R(0.048, 0.066) : R(0.032, 0.046);
      this.addItem(
        K_SNOW_CUBE, px, py, pz,
        R(0.38, 1.02), R(-1.55, -0.92), R(-0.20, 0.20),
        sz, sz,
        r, g, b, mid ? 0.84 : 0.76,
        prewarm ? R(1.6, 4.2) : R(2.8, 4.8),
        Math.random() * 6.28,
      );
    }
  }

  emitSplash(px: number, pz: number, color: number, storm: boolean) {
    const r = ((color >> 16) & 255) * INV255;
    const g = ((color >> 8) & 255) * INV255;
    const b = (color & 255) * INV255;
    this.spawnSplash(px, pz, r, g, b, storm);
  }

  private spawnSplash(px: number, pz: number, r: number, g: number, b: number, storm: boolean) {
    this.addItem(
      K_SPLASH, px, 0.032, pz,
      0, 0, 0,
      storm ? 0.25 : 0.21, 0.028,
      r, g, b, storm ? 0.68 : 0.62,
      storm ? 0.22 : 0.26, 0,
    );
    const high = QUALITY.tier === 'high';
    if (Math.random() < (storm ? 0.62 : 0.52)) {
      const side = R(0.45, 0.95);
      const wind = storm ? 0.65 : 0;
      const vz = R(-0.45, 0.45);
      const dsz = storm ? 0.054 : 0.048;
      this.addItem(K_DROP, px, 0.06, pz, side + wind, R(1.35, 2.2), vz, dsz, dsz, r, g, b, 0.84, R(0.18, 0.27), 0);
      if (high) {
        this.addItem(K_DROP, px, 0.06, pz, -side * 0.85 + wind * 0.5, R(1.2, 1.9), -vz, dsz * 0.88, dsz * 0.88, r, g, b, 0.78, R(0.16, 0.24), 0);
      }
    }
  }

  private pushBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, r: number, g: number, b: number, a: number, maxBoxes: number) {
    if (this.boxCount >= maxBoxes) return;
    const idx = this.boxCount++;
    const i3 = idx * 3;
    const i4 = idx * 4;
    this.centerArr[i3] = cx;
    this.centerArr[i3 + 1] = cy;
    this.centerArr[i3 + 2] = cz;
    this.sizeArr[i3] = sx;
    this.sizeArr[i3 + 1] = sy;
    this.sizeArr[i3 + 2] = sz;
    this.colArr[i4] = r;
    this.colArr[i4 + 1] = g;
    this.colArr[i4 + 2] = b;
    this.colArr[i4 + 3] = a;
  }

  update(dt: number) {
    if (this.mesh && PALPHA?.mesh) this.mesh.visible = PALPHA.mesh.visible;
    if (this.mesh && !this.mesh.visible) return;
    if (this.n === 0) {
      if (this.geo && this.boxCount !== 0) {
        this.boxCount = 0;
        this.geo.instanceCount = 0;
      }
      return;
    }
    const stepDt = Math.min(0.05, Math.max(0, dt));
    if (stepDt <= 0 && this.boxCount > 0) return;
    this.time += stepDt;
    this.ensureMesh();
    if (this.mesh && PALPHA?.mesh) this.mesh.visible = PALPHA.mesh.visible;
    const maxBoxes = this.limitBoxes();
    this.boxCount = 0;

    const kind = this.kind, x = this.x, y = this.y, z = this.z;
    const vx = this.vx, vy = this.vy, vz = this.vz;
    const sx = this.sx, sy = this.sy;
    const cr = this.cr, cg = this.cg, cb = this.cb, ca = this.ca;
    const age = this.age, life = this.life, phase = this.phase;
    const t = this.time;
    const splashRainP = QUALITY.tier === 'low' ? 0.18 : 0.26;
    const splashStormP = QUALITY.tier === 'low' ? 0.22 : 0.30;

    // Step simulation (backwards for O(1) swap-remove)
    for (let i = this.n - 1; i >= 0; i--) {
      const a = age[i] + stepDt;
      if (a >= life[i]) {
        this.killItem(i);
        continue;
      }
      age[i] = a;
      const k = kind[i];
      if (k === K_RAIN || k === K_STORM) {
        const nx = x[i] + vx[i] * stepDt;
        const ny = y[i] + vy[i] * stepDt;
        const nz = z[i] + vz[i] * stepDt;
        if (ny <= 0.05) {
          const r = cr[i], g = cg[i], b = cb[i], st = k === K_STORM;
          this.killItem(i);
          if (Math.random() < (st ? splashStormP : splashRainP)) {
            this.spawnSplash(nx, nz, r, g, b, st);
          }
          continue;
        }
        x[i] = nx; y[i] = ny; z[i] = nz;
      } else if (k === K_DROP) {
        const nvy = vy[i] - 13.0 * stepDt;
        const ny = y[i] + nvy * stepDt;
        if (ny <= 0.02) {
          this.killItem(i);
          continue;
        }
        vy[i] = nvy;
        x[i] += vx[i] * stepDt;
        y[i] = ny;
        z[i] += vz[i] * stepDt;
      } else if (k === K_SNOW_CUBE || k === K_SNOW_CROSS) {
        const ny = y[i] + vy[i] * stepDt;
        if (ny <= 0.04) {
          this.killItem(i);
          continue;
        }
        const ph = phase[i];
        x[i] += (vx[i] + Math.sin(t * 1.45 + ph) * 0.28) * stepDt;
        y[i] = ny;
        z[i] += (vz[i] + Math.cos(t * 1.15 + ph) * 0.14) * stepDt;
      }
    }

    // Write ultra-compact per-instance transform & color attributes (10 floats / box)
    for (let i = 0; i < this.n && this.boxCount < maxBoxes; i++) {
      const k = kind[i];
      const u = age[i] / life[i];
      const px = x[i], py = y[i], pz = z[i];
      const w = sx[i], h = sy[i];
      const r = cr[i], g = cg[i], b = cb[i], al = ca[i];

      if (k === K_RAIN) {
        this.pushBox(px, py + h * 0.5, pz, w, h, w, r, g, b, al, maxBoxes);
      } else if (k === K_STORM) {
        this.pushBox(px, py + h * 0.5, pz, w, h, w, r, g, b, al, maxBoxes);
        this.pushBox(px - w * 1.35, py + h * 1.38, pz, w * 0.86, h * 0.90, w * 0.86, r, g, b, al * 0.60, maxBoxes);
      } else if (k === K_SPLASH) {
        const step = u < 0.34 ? 0 : u < 0.68 ? 1 : 2;
        const rad = w * (step === 0 ? 0.38 : step === 1 ? 0.72 : 1.0);
        const ak = al * (step === 0 ? 1.0 : step === 1 ? 0.68 : 0.34);
        const span = rad * 2 + h;
        const bh = h * 0.75;
        const sideLen = Math.max(h, rad * 2 - h);
        this.pushBox(px, py, pz - rad, span, bh, h, r, g, b, ak, maxBoxes);
        this.pushBox(px, py, pz + rad, span, bh, h, r, g, b, ak, maxBoxes);
        this.pushBox(px - rad, py, pz, h, bh, sideLen, r, g, b, ak, maxBoxes);
        this.pushBox(px + rad, py, pz, h, bh, sideLen, r, g, b, ak, maxBoxes);
      } else if (k === K_DROP) {
        const s = u < 0.55 ? w : w * 0.68;
        this.pushBox(px, py, pz, s, s, s, r, g, b, al * (u < 0.55 ? 1 : 0.65), maxBoxes);
      } else if (k === K_SNOW_CUBE) {
        const s = u < 0.82 ? w : u < 0.92 ? w * 0.72 : w * 0.45;
        const ak = al * (u < 0.05 ? 0.7 : u < 0.85 ? 1.0 : 0.55);
        this.pushBox(px, py, pz, s, s, s, r, g, b, ak, maxBoxes);
      } else if (k === K_SNOW_CROSS) {
        const sc = u < 0.82 ? 1.0 : u < 0.92 ? 0.72 : 0.45;
        const ak = al * (u < 0.05 ? 0.7 : u < 0.85 ? 1.0 : 0.55);
        const len = w * sc;
        const th = h * sc;
        this.pushBox(px, py, pz, len, th, th, r, g, b, ak, maxBoxes);
        this.pushBox(px, py, pz, th, len, th, r, g, b, ak, maxBoxes);
      }
    }

    if (this.geo && this.aCenter && this.aSize && this.aCol) {
      this.geo.instanceCount = this.boxCount;
      if (this.boxCount > 0) {
        dirtyRange(this.aCenter, 0, this.boxCount * 3);
        dirtyRange(this.aSize, 0, this.boxCount * 3);
        dirtyRange(this.aCol, 0, this.boxCount * 4);
      }
    }
  }
}

export const VOXEL_WEATHER = new VoxelWeatherPool();
export function clearVoxelWeather() { VOXEL_WEATHER.clear(); }
export function updateVoxelWeather(dt: number) { VOXEL_WEATHER.update(dt); }
