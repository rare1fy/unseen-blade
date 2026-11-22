// 纯 3D 体素像素天气系统（act-157）：
//   - 严格世界轴对齐 3D 体素棱柱/立方体，零平滑斜刺、零圆形软点、零抗锯齿糊边；
//   - 雨天：竖直硬边体素雨柱 + 落地空心像素方框水花（3 档离散跳扩）+ 弹跳 3D 像素水方块；
//   - 暴雨：二阶像素阶梯斜雨（两段严格正交错位体素条，还原纯正像素斜雨锯齿感）+ 疾风方框水花与飞溅水块；
//   - 雪天：三档纯 3D 体素方雪块 + 像素「十」字雪花（两根正交体素条十字拼合），亮昼叠冰蓝深层对比；
//   - 单 Mesh 单 Draw Call（Uint16 索引，纯 WebGL1，无 InstancedMesh / dFdx / CanvasTexture），受画质档 effectLimit 自动约束。
import * as THREE from 'three';
import { scene } from '../engine/world';
import { dirtyRange } from '../engine/uploads';
import { effectLimit } from '../look/quality';
import { PALPHA } from '../engine/particles';

const MAX_BOXES = 1100;
const VERTS_PER_BOX = 24;
const INDICES_PER_BOX = 36;

// World-axis-aligned unit cube 6 faces (CCW outward) with crisp flat voxel facet shading
const FACES: ReadonlyArray<{ v: ReadonlyArray<readonly [number, number, number]>; shade: number }> = [
  { v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]], shade: 1.08 },   // +Y top
  { v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]], shade: 0.78 }, // -Y bottom
  { v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], shade: 0.98 },   // +Z front
  { v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]], shade: 0.84 }, // -Z back
  { v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]], shade: 0.94 },   // +X right
  { v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]], shade: 0.88 }, // -X left
];

const VS = `
attribute vec4 aCol;
varying vec4 vCol;
void main() {
  vCol = aCol;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FS = `
precision highp float;
varying vec4 vCol;
void main() {
  if (vCol.a < 0.04) discard;
  gl_FragColor = vCol;
}`;

const R = (a: number, b: number) => a + Math.random() * (b - a);

type ParticleKind = 'rain' | 'storm' | 'snowCube' | 'snowCross' | 'splash' | 'drop';

interface WeatherItem {
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  sx: number;
  sy: number;
  r: number;
  g: number;
  b: number;
  a: number;
  age: number;
  life: number;
  phase: number;
}

class VoxelWeatherPool {
  private mesh: THREE.Mesh | null = null;
  private geo: THREE.BufferGeometry | null = null;
  private posAttr: THREE.BufferAttribute | null = null;
  private colAttr: THREE.BufferAttribute | null = null;
  private posArr = new Float32Array(MAX_BOXES * VERTS_PER_BOX * 3);
  private colArr = new Float32Array(MAX_BOXES * VERTS_PER_BOX * 4);
  private items: WeatherItem[] = [];
  private boxCount = 0;
  private time = 0;

  private ensureMesh() {
    if (this.mesh) return;
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(this.posArr, 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.BufferAttribute(this.colArr, 4);
    col.setUsage(THREE.DynamicDrawUsage);
    const idx = new Uint16Array(MAX_BOXES * INDICES_PER_BOX);
    for (let b = 0; b < MAX_BOXES; b++) {
      const v0 = b * VERTS_PER_BOX;
      const i0 = b * INDICES_PER_BOX;
      for (let f = 0; f < 6; f++) {
        const fv = v0 + f * 4;
        const fi = i0 + f * 6;
        idx[fi] = fv;
        idx[fi + 1] = fv + 1;
        idx[fi + 2] = fv + 2;
        idx[fi + 3] = fv;
        idx[fi + 4] = fv + 2;
        idx[fi + 5] = fv + 3;
      }
    }
    g.setAttribute('position', pos);
    g.setAttribute('aCol', col);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
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
    this.posAttr = pos;
    this.colAttr = col;
    this.mesh = m;
  }

  private limitBoxes() {
    return Math.max(120, Math.min(MAX_BOXES, effectLimit(MAX_BOXES)));
  }

  private limitItems() {
    return Math.floor(this.limitBoxes() * 0.72);
  }

  clear() {
    this.items.length = 0;
    this.boxCount = 0;
    if (this.geo) this.geo.setDrawRange(0, 0);
  }

  emitRain(x: number, y: number, z: number, color: number, storm: boolean, prewarm = false) {
    if (this.items.length >= this.limitItems()) return;
    const c = new THREE.Color(color);
    if (storm) {
      this.items.push({
        kind: 'storm',
        x, y, z,
        vx: R(2.4, 3.3),
        vy: R(-18.5, -15.2),
        vz: R(0.12, 0.34),
        sx: R(0.038, 0.046),
        sy: R(0.50, 0.68),
        r: c.r, g: c.g, b: c.b,
        a: 0.72,
        age: 0,
        life: prewarm ? R(0.18, 0.46) : R(0.35, 0.65),
        phase: Math.random() * 6.28,
      });
    } else {
      this.items.push({
        kind: 'rain',
        x, y, z,
        vx: 0,
        vy: R(-15.5, -12.4),
        vz: 0,
        sx: R(0.034, 0.042),
        sy: R(0.68, 1.04),
        r: c.r, g: c.g, b: c.b,
        a: 0.64,
        age: 0,
        life: prewarm ? R(0.20, 0.52) : R(0.42, 0.78),
        phase: Math.random() * 6.28,
      });
    }
  }

  emitSnow(x: number, y: number, z: number, color: number, prewarm = false) {
    if (this.items.length >= this.limitItems()) return;
    const c = new THREE.Color(color);
    const roll = Math.random();
    if (roll < 0.25) {
      // Crisp 3D pixel '+' cross snowflake (2 orthogonal voxel bars)
      this.items.push({
        kind: 'snowCross',
        x, y, z,
        vx: R(0.32, 0.88),
        vy: R(-1.35, -0.82),
        vz: R(-0.18, 0.18),
        sx: R(0.155, 0.195),
        sy: R(0.052, 0.064),
        r: c.r, g: c.g, b: c.b,
        a: 0.95,
        age: 0,
        life: prewarm ? R(1.6, 4.2) : R(2.9, 4.8),
        phase: Math.random() * 6.28,
      });
    } else {
      // Chunky 3D voxel snow cube (two depth tiers)
      const mid = roll < 0.72;
      const sz = mid ? R(0.092, 0.126) : R(0.060, 0.080);
      this.items.push({
        kind: 'snowCube',
        x, y, z,
        vx: R(0.38, 1.02),
        vy: R(-1.55, -0.92),
        vz: R(-0.20, 0.20),
        sx: sz,
        sy: sz,
        r: c.r, g: c.g, b: c.b,
        a: mid ? 0.92 : 0.84,
        age: 0,
        life: prewarm ? R(1.6, 4.2) : R(2.8, 4.8),
        phase: Math.random() * 6.28,
      });
    }
  }

  emitSplash(x: number, z: number, color: number, storm: boolean) {
    const c = new THREE.Color(color);
    this.spawnSplash(x, z, c.r, c.g, c.b, storm);
  }

  private spawnSplash(x: number, z: number, r: number, g: number, b: number, storm: boolean) {
    const cap = this.limitItems();
    if (this.items.length < cap) {
      // Hollow square pixel splash ring on the ground (3 discrete stepped frames)
      this.items.push({
        kind: 'splash',
        x, y: 0.032, z,
        vx: 0, vy: 0, vz: 0,
        sx: storm ? 0.25 : 0.21,
        sy: 0.028,
        r, g, b,
        a: storm ? 0.68 : 0.62,
        age: 0,
        life: storm ? 0.22 : 0.26,
        phase: 0,
      });
    }
    if (Math.random() < (storm ? 0.72 : 0.62) && this.items.length + 2 <= cap) {
      const side = R(0.45, 0.95);
      const wind = storm ? 0.65 : 0;
      const vz = R(-0.45, 0.45);
      this.items.push({
        kind: 'drop',
        x, y: 0.06, z,
        vx: side + wind, vy: R(1.35, 2.25), vz,
        sx: storm ? 0.056 : 0.050,
        sy: storm ? 0.056 : 0.050,
        r, g, b,
        a: 0.86,
        age: 0,
        life: R(0.18, 0.28),
        phase: 0,
      });
      this.items.push({
        kind: 'drop',
        x, y: 0.06, z,
        vx: -side * 0.85 + wind * 0.5, vy: R(1.2, 1.95), vz: -vz,
        sx: storm ? 0.050 : 0.044,
        sy: storm ? 0.050 : 0.044,
        r, g, b,
        a: 0.80,
        age: 0,
        life: R(0.16, 0.25),
        phase: 0,
      });
    }
  }

  private pushBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, r: number, g: number, b: number, a: number, maxBoxes: number) {
    if (this.boxCount >= maxBoxes) return;
    const base = this.boxCount++;
    const P = this.posArr;
    const C = this.colArr;
    let pi = base * VERTS_PER_BOX * 3;
    let ci = base * VERTS_PER_BOX * 4;
    for (let f = 0; f < 6; f++) {
      const face = FACES[f];
      const sh = face.shade;
      const fr = r * sh;
      const fg = g * sh;
      const fb = b * sh;
      for (let v = 0; v < 4; v++) {
        const pt = face.v[v];
        P[pi++] = cx + pt[0] * sx;
        P[pi++] = cy + pt[1] * sy;
        P[pi++] = cz + pt[2] * sz;
        C[ci++] = fr;
        C[ci++] = fg;
        C[ci++] = fb;
        C[ci++] = a;
      }
    }
  }

  update(dt: number) {
    const stepDt = Math.min(0.05, Math.max(0, dt));
    this.time += stepDt;
    if (!this.items.length) {
      if (this.geo && this.boxCount !== 0) {
        this.boxCount = 0;
        this.geo.setDrawRange(0, 0);
      }
      return;
    }
    this.ensureMesh();
    if (this.mesh && PALPHA?.mesh) this.mesh.visible = PALPHA.mesh.visible;
    const maxBoxes = this.limitBoxes();
    this.boxCount = 0;

    // Step simulation (iterate backwards for O(1) swap-remove)
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += stepDt;
      if (it.age >= it.life) {
        this.items[i] = this.items[this.items.length - 1];
        this.items.pop();
        continue;
      }
      if (it.kind === 'rain' || it.kind === 'storm') {
        it.x += it.vx * stepDt;
        it.y += it.vy * stepDt;
        it.z += it.vz * stepDt;
        if (it.y <= 0.05) {
          const sx = it.x, sz = it.z, r = it.r, g = it.g, b = it.b, st = it.kind === 'storm';
          this.items[i] = this.items[this.items.length - 1];
          this.items.pop();
          if (Math.random() < (st ? 0.40 : 0.34)) {
            this.spawnSplash(sx, sz, r, g, b, st);
          }
          continue;
        }
      } else if (it.kind === 'drop') {
        it.vy -= 13.0 * stepDt;
        it.x += it.vx * stepDt;
        it.y += it.vy * stepDt;
        it.z += it.vz * stepDt;
        if (it.y <= 0.02) {
          this.items[i] = this.items[this.items.length - 1];
          this.items.pop();
          continue;
        }
      } else if (it.kind === 'snowCube' || it.kind === 'snowCross') {
        const sway = Math.sin(this.time * 1.45 + it.phase) * 0.28;
        it.x += (it.vx + sway) * stepDt;
        it.y += it.vy * stepDt;
        it.z += (it.vz + Math.cos(this.time * 1.15 + it.phase) * 0.14) * stepDt;
        if (it.y <= 0.04) {
          this.items[i] = this.items[this.items.length - 1];
          this.items.pop();
          continue;
        }
      }
    }

    // Emit crisp world-axis-aligned 3D voxel geometry
    for (let i = 0; i < this.items.length && this.boxCount < maxBoxes; i++) {
      const it = this.items[i];
      const k = it.age / it.life;
      if (it.kind === 'rain') {
        this.pushBox(it.x, it.y + it.sy * 0.5, it.z, it.sx, it.sy, it.sx, it.r, it.g, it.b, it.a, maxBoxes);
      } else if (it.kind === 'storm') {
        // 2-step stair-stepped pixel-art diagonal rain (two strictly orthogonal voxel pillars!)
        this.pushBox(it.x, it.y + it.sy * 0.5, it.z, it.sx, it.sy, it.sx, it.r, it.g, it.b, it.a, maxBoxes);
        this.pushBox(it.x - it.sx * 1.35, it.y + it.sy * 1.38, it.z, it.sx * 0.86, it.sy * 0.90, it.sx * 0.86, it.r, it.g, it.b, it.a * 0.60, maxBoxes);
      } else if (it.kind === 'splash') {
        // Hollow square pixel splash stepping through 3 discrete pixel frames
        const step = k < 0.34 ? 0 : k < 0.68 ? 1 : 2;
        const rad = it.sx * (step === 0 ? 0.38 : step === 1 ? 0.72 : 1.0);
        const ak = it.a * (step === 0 ? 1.0 : step === 1 ? 0.68 : 0.34);
        const th = it.sy;
        const span = rad * 2 + th;
        this.pushBox(it.x, it.y, it.z - rad, span, th * 0.75, th, it.r, it.g, it.b, ak, maxBoxes);
        this.pushBox(it.x, it.y, it.z + rad, span, th * 0.75, th, it.r, it.g, it.b, ak, maxBoxes);
        this.pushBox(it.x - rad, it.y, it.z, th, th * 0.75, Math.max(th, rad * 2 - th), it.r, it.g, it.b, ak, maxBoxes);
        this.pushBox(it.x + rad, it.y, it.z, th, th * 0.75, Math.max(th, rad * 2 - th), it.r, it.g, it.b, ak, maxBoxes);
      } else if (it.kind === 'drop') {
        const s = k < 0.55 ? it.sx : it.sx * 0.68;
        this.pushBox(it.x, it.y, it.z, s, s, s, it.r, it.g, it.b, it.a * (k < 0.55 ? 1 : 0.65), maxBoxes);
      } else if (it.kind === 'snowCube') {
        const s = k < 0.82 ? it.sx : k < 0.92 ? it.sx * 0.72 : it.sx * 0.45;
        const ak = it.a * (k < 0.05 ? 0.7 : k < 0.85 ? 1.0 : 0.55);
        this.pushBox(it.x, it.y, it.z, s, s, s, it.r, it.g, it.b, ak, maxBoxes);
      } else if (it.kind === 'snowCross') {
        const sc = k < 0.82 ? 1.0 : k < 0.92 ? 0.72 : 0.45;
        const ak = it.a * (k < 0.05 ? 0.7 : k < 0.85 ? 1.0 : 0.55);
        const len = it.sx * sc;
        const th = it.sy * sc;
        // Horizontal + vertical intersecting 3D voxel bars -> crisp '+' pixel snowflake
        this.pushBox(it.x, it.y, it.z, len, th, th, it.r, it.g, it.b, ak, maxBoxes);
        this.pushBox(it.x, it.y, it.z, th, len, th, it.r, it.g, it.b, ak, maxBoxes);
      }
    }

    if (this.geo && this.posAttr && this.colAttr) {
      this.geo.setDrawRange(0, this.boxCount * INDICES_PER_BOX);
      if (this.boxCount > 0) {
        dirtyRange(this.posAttr, 0, this.boxCount * VERTS_PER_BOX * 3);
        dirtyRange(this.colAttr, 0, this.boxCount * VERTS_PER_BOX * 4);
      }
    }
  }
}

export const VOXEL_WEATHER = new VoxelWeatherPool();
export function clearVoxelWeather() { VOXEL_WEATHER.clear(); }
export function updateVoxelWeather(dt: number) { VOXEL_WEATHER.update(dt); }
