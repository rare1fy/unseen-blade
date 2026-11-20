// 轻盈 3D 体素刀光（act-111 重调：体素风格一致 + 轻盈刀光感，非高清矢量也非沉重实体）：
//   - 用轻薄的 3D 离散体素长方体/立方体块拼出刀弧与直线光棱柱（按 3.5cm/7cm 体素格量化，无 smoothstep 平滑曲线）；
//   - transparent: true + depthWrite: false（保留 depthTest: true 正常前后遮挡），彻底去掉黑色实体轮廓描边；
//   - 分层离散透光：外刃刀锋亮实带克制自发光（0.88）、中层主色半透（0.48，可隐约透见地面与人物）、内尾轻透（0.26）；
//   - 消散按格阶梯缩块并同步阶梯降透（1.0 -> 0.64 -> 0.30 -> 0），沿刀势崩出少量 3.5~7cm 发光小体素方块；
//   - 轻招精简纤利、重劈 / 反击 / 一闪 / 见红层次饱满；单槽位单 Mesh、纯 WebGL1、零 GC。
import * as THREE from 'three';
import { scene, onUpdate, V3 } from '../engine/world';

const BOX_VS = `
attribute vec3 aOffset;
attribute float aShade;
attribute vec4 aMeta;
attribute vec3 aFly;

uniform vec3 uEdgeCol;
uniform vec3 uBodyCol;
uniform vec3 uTailCol;
uniform float uHead;
uniform float uTail;
uniform float uFade;

varying vec4 vCol;

void main() {
  float u = aMeta.x;
  float tier = aMeta.y;
  float delay = aMeta.z;
  float flyDist = aMeta.w;

  float s = 0.0;
  float ak = 0.0;
  vec3 center = position;

  if (tier > 2.5) {
    // Detached 3.5-7cm luminous voxel spark cubes stepping down crisply
    float born = step(u - 0.10, uHead);
    float life = clamp(1.0 - (uFade * 1.18 + delay), 0.0, 1.0);
    s = born * (life > 0.62 ? 1.0 : life > 0.30 ? 0.68 : life > 0.06 ? 0.42 : 0.0);
    ak = life > 0.62 ? 1.0 : life > 0.30 ? 0.65 : 0.34;
    float moveK = clamp(uFade * 1.35 + max(0.0, uHead - u) * 0.25, 0.0, 1.0);
    center += aFly * (flyDist * moveK);
  } else {
    // Main voxel light blocks: inner wake peels first, outer razor lingers last
    float tierOff = tier * 0.15;
    float cut = uTail + tierOff + delay;
    if (u <= uHead && u >= cut) {
      float rem = clamp((u - cut) / 0.24, 0.0, 1.0);
      s = rem > 0.58 ? 1.0 : rem > 0.26 ? 0.72 : 0.46;
      ak = rem > 0.58 ? 1.0 : rem > 0.26 ? 0.64 : 0.30;
      if (uFade > 0.84 && tier > 0.5) s = 0.0;
    }
  }

  if (s <= 0.001) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec4(0.0);
    return;
  }

  vec3 baseCol = tier < 0.5 ? uEdgeCol : tier < 1.5 ? uBodyCol : tier < 2.5 ? uTailCol : mix(uBodyCol, uEdgeCol, 0.72);
  float baseA = tier < 0.5 ? 0.88 : tier < 1.5 ? 0.48 : tier < 2.5 ? 0.26 : 0.78;
  float hot = step(uHead - 0.22, u) * step(tier, 0.5);
  vec3 rgb = (baseCol + uEdgeCol * hot * 0.16) * aShade;
  vCol = vec4(rgb, baseA * ak);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(center + aOffset * s, 1.0);
}`;

const BOX_FS = `
precision highp float;
varying vec4 vCol;
void main() {
  if (vCol.a < 0.04) discard;
  gl_FragColor = vCol;
}`;

export interface SlashPalette {
  edge: number;
  body: number;
  tail: number;
  /** restrained HDR boost on outer razor voxel row so it reads as glowing light (1.14..1.26) */
  hdr?: number;
}

const PAL: Record<string, SlashPalette> = {
  light:   { edge: 0xf2f7ff, body: 0x8eb4de, tail: 0x4c6b94, hdr: 1.15 },
  spin:    { edge: 0xf0faff, body: 0x7ac0e0, tail: 0x3a6a8a, hdr: 1.16 },
  stab:    { edge: 0xf6fcff, body: 0x9cd0f5, tail: 0x4a78a8, hdr: 1.18 },
  heavy:   { edge: 0xfff3d4, body: 0xf26438, tail: 0x9c281c, hdr: 1.24 },
  counter: { edge: 0xfff9e2, body: 0xf5be44, tail: 0xb26218, hdr: 1.25 },
  iai:     { edge: 0xfffcf2, body: 0xf7d26a, tail: 0xa86c20, hdr: 1.28 },
  dcut:    { edge: 0xf0fdff, body: 0x62c4f0, tail: 0x2c6694, hdr: 1.18 },
  launch:  { edge: 0xf2fbff, body: 0x7cd0f5, tail: 0x366894, hdr: 1.18 },
  air:     { edge: 0xfff0f5, body: 0xf07ca4, tail: 0x8e3054, hdr: 1.18 },
  swoop:   { edge: 0xf0fff2, body: 0x6ed496, tail: 0x2d6e4a, hdr: 1.18 },
};

// Unit cube 6 faces (CCW outward winding) + subtle luminous facet contrast (glowing light, no dark clay undersides)
const FACES: Array<{ v: Array<[number, number, number]>; shade: number }> = [
  // +Y top
  { v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]], shade: 1.04 },
  // -Y bottom
  { v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]], shade: 0.84 },
  // +Z outer cutting rim
  { v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], shade: 1.00 },
  // -Z inner rim
  { v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]], shade: 0.88 },
  // +X leading end-cap
  { v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]], shade: 0.94 },
  // -X trailing end-cap
  { v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]], shade: 0.88 },
];

const VOX = 0.035; // 3.5cm character voxel unit (2 * VOX = 7cm world voxel unit)
const qv = (v: number) => Math.max(VOX, Math.round(v / VOX) * VOX);
const hash1 = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

interface BoxPool {
  geo: THREE.BufferGeometry;
  pos: Float32Array;
  off: Float32Array;
  shade: Float32Array;
  meta: Float32Array;
  fly: Float32Array;
  max: number;
  count: number;
}

function makeBoxPool(max: number): BoxPool {
  const verts = max * 24;
  const pos = new Float32Array(verts * 3);
  const off = new Float32Array(verts * 3);
  const shade = new Float32Array(verts);
  const meta = new Float32Array(verts * 4);
  const fly = new Float32Array(verts * 3);
  const idx = new Uint16Array(max * 36);
  for (let b = 0; b < max; b++) {
    for (let f = 0; f < 6; f++) {
      const vb = b * 24 + f * 4;
      const ib = b * 36 + f * 6;
      idx[ib + 0] = vb;
      idx[ib + 1] = vb + 1;
      idx[ib + 2] = vb + 2;
      idx[ib + 3] = vb;
      idx[ib + 4] = vb + 2;
      idx[ib + 5] = vb + 3;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aOffset', new THREE.BufferAttribute(off, 3));
  geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
  geo.setAttribute('aMeta', new THREE.BufferAttribute(meta, 4));
  geo.setAttribute('aFly', new THREE.BufferAttribute(fly, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  return { geo, pos, off, shade, meta, fly, max, count: 0 };
}

function pushBox(
  pool: BoxPool,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
  rotY: number,
  u: number, tier: number, delay: number, flyDist: number,
  fx = 0, fy = 0, fz = 0,
) {
  if (pool.count >= pool.max) return;
  const b = pool.count++;
  const s = Math.sin(rotY), c = Math.cos(rotY);
  let vIdx = b * 24;
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    for (let k = 0; k < 4; k++) {
      const cv = face.v[k];
      const lx = cv[0] * dx, ly = cv[1] * dy, lz = cv[2] * dz;
      const rx = lx * c + lz * s;
      const rz = -lx * s + lz * c;
      const p3 = vIdx * 3;
      const p4 = vIdx * 4;
      pool.pos[p3 + 0] = cx;
      pool.pos[p3 + 1] = cy;
      pool.pos[p3 + 2] = cz;
      pool.off[p3 + 0] = rx;
      pool.off[p3 + 1] = ly;
      pool.off[p3 + 2] = rz;
      pool.shade[vIdx] = face.shade;
      pool.meta[p4 + 0] = u;
      pool.meta[p4 + 1] = tier;
      pool.meta[p4 + 2] = delay;
      pool.meta[p4 + 3] = flyDist;
      pool.fly[p3 + 0] = fx;
      pool.fly[p3 + 1] = fy;
      pool.fly[p3 + 2] = fz;
      vIdx++;
    }
  }
}

function commitPool(pool: BoxPool) {
  pool.geo.setDrawRange(0, pool.count * 36);
  (pool.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  (pool.geo.getAttribute('aOffset') as THREE.BufferAttribute).needsUpdate = true;
  (pool.geo.getAttribute('aShade') as THREE.BufferAttribute).needsUpdate = true;
  (pool.geo.getAttribute('aMeta') as THREE.BufferAttribute).needsUpdate = true;
  (pool.geo.getAttribute('aFly') as THREE.BufferAttribute).needsUpdate = true;
}

function buildVoxelArc(pool: BoxPool, a0: number, a1: number, rIn: number, rOut: number, heavy: boolean, bleed: boolean) {
  pool.count = 0;
  const span = Math.abs(a1 - a0);
  const dir = a1 >= a0 ? 1 : -1;
  const nOuter = Math.max(8, Math.min(18, Math.round(span * 4.8)));
  const band = Math.max(0.24, rOut - rIn);

  // Tier 0: lean luminous outer razor voxel row (aligned strictly to real attack reach rOut)
  for (let i = 0; i < nOuter; i++) {
    const u = (i + 0.5) / nOuter;
    const a = a0 + (a1 - a0) * u;
    const stepArc = (span / nOuter) * rOut;
    const maxW = heavy ? 0.14 : 0.105;
    const rw = qv(u > 0.55 ? Math.min(maxW, band * 0.22) : u > 0.22 ? 0.07 : 0.035);
    const h = qv(heavy ? (u > 0.45 ? 0.07 : 0.035) : (u > 0.5 ? 0.052 : 0.035));
    const len = qv(stepArc * (u > 0.28 ? 0.90 : 0.68));
    const r = rOut - rw * 0.5;
    const delay = (hash1(i * 3 + 1) - 0.5) * 0.06;
    pushBox(pool, Math.sin(a) * r, 0, Math.cos(a) * r, len, h, rw, a, u, 0, delay, 0);
  }

  // Tier 1: translucent mid-body voxel band (slim & airy so ground/foes stay visible through blade light)
  const nMid = Math.max(6, Math.min(14, Math.round(nOuter * 0.78)));
  for (let i = 0; i < nMid; i++) {
    const u = 0.20 + (i + 0.5) / nMid * 0.70;
    const a = a0 + (a1 - a0) * u;
    const outerW = heavy ? (u > 0.55 ? 0.14 : 0.07) : (u > 0.55 ? 0.105 : 0.07);
    const maxMid = heavy ? 0.175 : 0.14;
    const rw = qv(Math.min(band - outerW - 0.035, u > 0.52 ? maxMid : u > 0.28 ? 0.105 : 0.07));
    if (rw < 0.035) continue;
    const r = rOut - outerW - rw * 0.5 + 0.005;
    const stepArc = ((span * 0.70) / nMid) * r;
    const len = qv(stepArc * (u > 0.40 ? 0.84 : 0.64));
    const h = qv(heavy ? 0.052 : 0.035);
    const delay = (hash1(i * 5 + 7) - 0.5) * 0.07;
    pushBox(pool, Math.sin(a) * r, -0.008, Math.cos(a) * r, len, h, rw, a, u, 1, delay, 0);
  }

  // Tier 2: light sparse trailing wake blocks (minimal on light attacks; richer on heavy/bleed)
  const nWake = heavy || bleed ? Math.max(4, Math.min(7, Math.round(nOuter * 0.42))) : 3;
  for (let i = 0; i < nWake; i++) {
    const u = 0.14 + (i + 0.5) / nWake * 0.58;
    const a = a0 + (a1 - a0) * u;
    const r = rOut - qv(Math.min(band * 0.78, (heavy ? 0.35 : 0.26) + (i % 2) * 0.08));
    const stepArc = ((span * 0.58) / nWake) * r;
    const len = qv(Math.min(0.21, stepArc * 0.48));
    const rw = qv(heavy || bleed ? 0.105 : 0.07);
    const delay = (hash1(i * 7 + 13) - 0.5) * 0.08;
    pushBox(pool, Math.sin(a) * r, -0.016, Math.cos(a) * r, len, 0.035, rw, a, u, 2, delay, 0);
  }

  // Tier 3: tiny glowing voxel spark cubes bursting tangentially off the blade tip/rim
  const nSpark = heavy ? 6 : 4;
  for (let i = 0; i < nSpark; i++) {
    const u = 0.30 + (i + 0.5) / nSpark * 0.66;
    const a = a0 + (a1 - a0) * u;
    const r = rOut - (i % 2 === 0 ? 0.02 : 0.12);
    const sz = qv(heavy && i % 2 === 0 ? 0.07 : 0.035);
    const sa = Math.sin(a), ca = Math.cos(a);
    const tx = ca * dir, tz = -sa * dir;
    const fx = tx * 0.80 + sa * 0.50;
    const fy = (hash1(i * 11 + 3) - 0.35) * 0.50;
    const fz = tz * 0.80 + ca * 0.50;
    const fl = Math.hypot(fx, fy, fz) || 1;
    const flyDist = 0.26 + hash1(i * 13 + 5) * (heavy ? 0.42 : 0.26);
    const yOff = (hash1(i * 17 + 2) - 0.5) * 0.10;
    const delay = (hash1(i * 19 + 9) - 0.5) * 0.12;
    pushBox(pool, sa * r, yOff, ca * r, sz, sz, sz, a, u, 3, delay, flyDist, fx / fl, fy / fl, fz / fl);
  }

  commitPool(pool);
}

function buildVoxelLine(pool: BoxPool, len: number, width: number, lance: boolean) {
  pool.count = 0;
  const effW = Math.max(0.22, width * 0.58);
  const nCore = Math.max(5, Math.min(12, Math.round(len / 0.40)));
  const stepZ = len / nCore;
  const coreW = qv(lance ? 0.07 : Math.min(0.105, Math.max(0.07, effW * 0.24)));
  const coreH = qv(lance ? 0.052 : 0.07);

  // Tier 0: sleek luminous voxel core blade line along +Z
  for (let i = 0; i < nCore; i++) {
    const u = (i + 0.5) / nCore;
    const z = u * len;
    const segL = qv(stepZ * (u > 0.22 ? 1.02 : 0.72));
    const w = lance ? qv(u > 0.72 ? 0.035 : coreW) : qv(u > 0.88 || u < 0.14 ? 0.035 : coreW);
    const h = lance ? qv(u > 0.72 ? 0.035 : coreH) : coreH;
    const delay = (hash1(i * 3 + 2) - 0.5) * 0.05;
    pushBox(pool, 0, 0, z, w, h, segL, 0, u, 0, delay, 0);
  }

  // Tier 1: slender asymmetric translucent flanking voxel streaks
  const nSide = Math.max(3, Math.min(6, Math.round(nCore * 0.55)));
  const sideSpan = lance ? 0.58 : 0.76;
  const sideBase = lance ? 0.14 : 0.14;
  for (let i = 0; i < nSide; i++) {
    const uL = sideBase + (i + 0.38) / nSide * sideSpan;
    const uR = Math.min(0.92, sideBase + (i + 0.80) / nSide * sideSpan);
    for (let side = -1; side <= 1; side += 2) {
      const u = side < 0 ? uL : uR;
      const z = u * len;
      const wing = lance ? (1 - u * 0.72) : (u > 0.35 && u < 0.86 ? 1.0 : 0.6);
      const rw = qv(Math.min(0.105, Math.max(0.035, effW * 0.24 * wing)));
      const lenK = lance ? 0.78 : (u > 0.45 ? 0.84 : 0.56);
      const segL = qv(((len * sideSpan) / nSide) * lenK);
      const xOff = coreW * 0.5 + rw * 0.5;
      const delay = (hash1(i * 5 + (side < 0 ? 4 : 11)) - 0.5) * 0.07;
      pushBox(pool, side * xOff, -0.006, z, rw, 0.035, segL, 0, u, 1, delay, 0);
    }
  }

  // Tier 2: sparse outer wake slivers (cleaves only; lance stays ultra-sharp)
  if (!lance) {
    const nWake = Math.min(4, Math.max(2, Math.round(len / 1.1)));
    for (let i = 0; i < nWake; i++) {
      const u = 0.18 + (i + 0.5) / nWake * 0.62;
      const z = u * len;
      const side = i % 2 === 0 ? 1 : -1;
      const xOff = qv(effW * 0.48);
      const segL = qv(Math.min(0.24, stepZ * 0.56));
      const delay = (hash1(i * 7 + 9) - 0.5) * 0.08;
      pushBox(pool, side * xOff, -0.012, z, 0.07, 0.035, segL, 0, u, 2, delay, 0);
    }
  }

  // Tier 3: tiny luminous voxel sparks peeling off the blade path
  const nSpark = lance ? 4 : 5;
  for (let i = 0; i < nSpark; i++) {
    const u = 0.18 + (i + 0.5) / nSpark * 0.72;
    const z = u * len;
    const side = i % 2 === 0 ? 1 : -1;
    const sz = qv(i % 2 === 0 ? 0.07 : 0.035);
    const x0 = side * (coreW * 0.6 + effW * 0.22);
    const fx = side * 0.85;
    const fy = (hash1(i * 11 + 6) - 0.35) * 0.45;
    const fz = lance ? 0.55 : 0.22;
    const fl = Math.hypot(fx, fy, fz) || 1;
    const flyDist = 0.24 + hash1(i * 13 + 7) * 0.34;
    const delay = (hash1(i * 17 + 4) - 0.5) * 0.1;
    pushBox(pool, x0, (hash1(i * 9 + 1) - 0.5) * 0.10, z, sz, sz, sz, 0, u, 3, delay, flyDist, fx / fl, fy / fl, fz / fl);
  }

  commitPool(pool);
}

interface ArcSlot {
  mesh: THREE.Mesh;
  pool: BoxPool;
  mat: THREE.ShaderMaterial;
  active: boolean;
  t: number;
  sweepDur: number;
  holdDur: number;
  fadeDur: number;
  anchor: THREE.Vector3 | null;
  yOff: number;
}

interface LineSlot {
  mesh: THREE.Mesh;
  pool: BoxPool;
  mat: THREE.ShaderMaterial;
  active: boolean;
  t: number;
  sweepDur: number;
  fadeDur: number;
}

const MAX_ARC_BOXES = 50;
const MAX_LINE_BOXES = 36;
const ARC_POOL = 6;
const LINE_POOL = 5;

function setCol(u: THREE.Color, hex: number, scale = 1) {
  u.setHex(hex).multiplyScalar(scale);
}

function makeVoxelMat(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: BOX_VS,
    fragmentShader: BOX_FS,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uEdgeCol: { value: new THREE.Color(0xf2f7ff) },
      uBodyCol: { value: new THREE.Color(0x8eb4de) },
      uTailCol: { value: new THREE.Color(0x4c6b94) },
      uHead: { value: 1 },
      uTail: { value: 0 },
      uFade: { value: 0 },
    },
  });
}

class SlashSystem {
  private arcs: ArcSlot[] = [];
  private lines: LineSlot[] = [];
  private arcCursor = 0;
  private lineCursor = 0;

  private ensureArcs() {
    if (this.arcs.length) return;
    for (let i = 0; i < ARC_POOL; i++) {
      const pool = makeBoxPool(MAX_ARC_BOXES);
      const mat = makeVoxelMat();
      const mesh = new THREE.Mesh(pool.geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      this.arcs.push({ mesh, pool, mat, active: false, t: 0, sweepDur: 0.04, holdDur: 0.02, fadeDur: 0.095, anchor: null, yOff: 0.95 });
    }
  }

  private ensureLines() {
    if (this.lines.length) return;
    for (let i = 0; i < LINE_POOL; i++) {
      const pool = makeBoxPool(MAX_LINE_BOXES);
      const mat = makeVoxelMat();
      const mesh = new THREE.Mesh(pool.geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 7;
      scene.add(mesh);
      this.lines.push({ mesh, pool, mat, active: false, t: 0, sweepDur: 0.03, fadeDur: 0.16 });
    }
  }

  private pickArc(): ArcSlot {
    this.ensureArcs();
    for (const s of this.arcs) if (!s.active) { if (!s.mesh.parent) scene.add(s.mesh); return s; }
    const s = this.arcs[this.arcCursor++ % this.arcs.length];
    if (!s.mesh.parent) scene.add(s.mesh);
    return s;
  }

  private pickLine(): LineSlot {
    this.ensureLines();
    for (const s of this.lines) if (!s.active) { if (!s.mesh.parent) scene.add(s.mesh); return s; }
    const s = this.lines[this.lineCursor++ % this.lines.length];
    if (!s.mesh.parent) scene.add(s.mesh);
    return s;
  }

  /** Spawn a lightweight luminous 3D voxel crescent aligned to the swing's real reach. */
  arc(o: {
    at: THREE.Vector3;
    yaw: number;
    rOut: number;
    rIn?: number;
    a0: number;
    a1: number;
    y?: number;
    tiltX?: number;
    tiltZ?: number;
    palette?: keyof typeof PAL;
    bleed?: boolean;
    sweep?: number;
    hold?: number;
    fade?: number;
    follow?: THREE.Vector3;
  }) {
    const s = this.pickArc();
    const pal = PAL[o.palette ?? 'light'] ?? PAL.light;
    const hdr = pal.hdr ?? 1.16;
    const rOut = Math.max(0.6, o.rOut);
    const rIn = Math.max(0.25, o.rIn ?? rOut * 0.56);
    const heavy = o.palette === 'heavy' || o.palette === 'counter' || o.palette === 'iai';
    buildVoxelArc(s.pool, o.a0, o.a1, rIn, rOut, heavy, !!o.bleed);

    const u = s.mat.uniforms;
    setCol(u.uEdgeCol.value, pal.edge, hdr);
    setCol(u.uBodyCol.value, pal.body, 1.0);
    setCol(u.uTailCol.value, o.bleed ? 0x9c2024 : pal.tail, 1.0);
    // Start at 0.80 on the impact frame so hitstop freezes a full, bold voxel crescent cutting across the target
    u.uHead.value = 0.80;
    u.uTail.value = 0;
    u.uFade.value = 0;

    s.yOff = o.y ?? 0.96;
    s.anchor = o.follow ?? null;
    s.mesh.position.set(o.at.x, o.at.y + s.yOff, o.at.z);
    s.mesh.rotation.order = 'YXZ';
    s.mesh.rotation.set(o.tiltX ?? 0, o.yaw, o.tiltZ ?? 0);
    s.mesh.visible = true;
    s.active = true;
    s.t = 0;
    s.sweepDur = o.sweep ?? 0.04;
    s.holdDur = o.hold ?? 0.02;
    s.fadeDur = o.fade ?? 0.095;
  }

  /** Spawn a lightweight luminous 3D voxel blade beam / thrust lance along a -> b. */
  line(o: {
    a: THREE.Vector3;
    b: THREE.Vector3;
    width: number;
    y?: number;
    palette?: keyof typeof PAL;
    lance?: boolean;
    tiltZ?: number;
    sweep?: number;
    fade?: number;
  }) {
    const s = this.pickLine();
    const dx = o.b.x - o.a.x, dz = o.b.z - o.a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const yaw = Math.atan2(dx, dz);
    const pal = PAL[o.palette ?? 'iai'] ?? PAL.iai;
    const hdr = pal.hdr ?? 1.24;

    buildVoxelLine(s.pool, len, Math.max(0.28, o.width), !!o.lance);

    const u = s.mat.uniforms;
    setCol(u.uEdgeCol.value, pal.edge, hdr);
    setCol(u.uBodyCol.value, pal.body, 1.0);
    setCol(u.uTailCol.value, pal.tail, 1.0);
    u.uHead.value = o.lance ? 0.84 : 1.0;
    u.uTail.value = 0;
    u.uFade.value = 0;

    s.mesh.position.set(o.a.x, (o.y ?? 0.98) + o.a.y, o.a.z);
    s.mesh.rotation.order = 'YXZ';
    s.mesh.rotation.set(0, yaw, o.tiltZ ?? 0);
    s.mesh.visible = true;
    s.active = true;
    s.t = 0;
    s.sweepDur = o.sweep ?? (o.lance ? 0.03 : 0.025);
    s.fadeDur = (o.fade ?? (o.lance ? 0.14 : 0.22)) * 0.72;
  }

  /** Convenience helper for the hero's 5-hit combo and derivatives. */
  swing(o: {
    kind: string;
    from: THREE.Vector3;
    follow?: THREE.Vector3;
    yaw: number;
    range: number;
    half: number;
    n?: number;
    counter?: boolean;
    bleed?: boolean;
    wide?: boolean;
  }) {
    const y0 = o.from.y;
    const at = V3(o.from.x, y0, o.from.z);
    const counter = !!o.counter;
    const bleed = !!o.bleed && !counter;
    const r = o.range * (counter ? 1.08 : 1.0);

    if (o.kind === 'k1') {
      const h = Math.min(1.5, Math.max(1.1, o.half + 0.15));
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * 0.60, a0: -h, a1: h, y: 0.96, tiltZ: -0.14, palette: counter ? 'counter' : 'light', bleed, sweep: 0.04, hold: 0.02, fade: 0.095 });
    } else if (o.kind === 'k2') {
      const h = Math.min(1.55, Math.max(1.15, o.half + 0.15));
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * 0.60, a0: h, a1: -h, y: 1.0, tiltZ: 0.26, palette: counter ? 'counter' : 'light', bleed, sweep: 0.04, hold: 0.02, fade: 0.095 });
    } else if (o.kind === 'k3') {
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * (o.wide ? 0.62 : 0.66), a0: -Math.PI, a1: Math.PI + 0.25, y: 0.92, tiltZ: 0.06, palette: counter ? 'counter' : 'spin', bleed, sweep: 0.075, hold: 0.025, fade: 0.12 });
    } else if (o.kind === 'k4') {
      const second = (o.n ?? 1) > 1;
      const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
      const a = V3(at.x + fx * 0.35, y0, at.z + fz * 0.35);
      const b = V3(at.x + fx * (r + (second ? 0.55 : 0.25)), y0, at.z + fz * (r + (second ? 0.55 : 0.25)));
      this.line({ a, b, width: second ? 0.58 : 0.46, y: 1.0, palette: counter ? 'counter' : 'stab', lance: true, tiltZ: second ? -0.10 : 0.10, sweep: 0.03, fade: second ? 0.16 : 0.13 });
    } else if (o.kind === 'k5') {
      // Dramatic steep diagonal overhead voxel cleave + restrained low follow-through accent
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r * 1.04, rIn: r * 0.50, a0: -1.40, a1: 1.20, y: 1.08, tiltX: 0.18, tiltZ: -1.08, palette: counter ? 'counter' : 'heavy', bleed, sweep: 0.05, hold: 0.045, fade: 0.16 });
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r * 0.96, rIn: r * 0.72, a0: -1.10, a1: 1.10, y: 0.48, tiltZ: -0.08, palette: counter ? 'counter' : 'heavy', bleed, sweep: 0.045, hold: 0.025, fade: 0.11 });
    } else if (o.kind === 'launch') {
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * 0.58, a0: 1.20, a1: -1.30, y: 0.95, tiltX: -0.15, tiltZ: 1.15, palette: 'launch', sweep: 0.045, hold: 0.03, fade: 0.13 });
    } else if (o.kind === 'acut' || o.kind === 'acutF') {
      const last = o.kind === 'acutF';
      const n = o.n ?? 1;
      const tilt = last ? -1.12 : n === 1 ? -0.45 : 0.45;
      const a0 = n === 2 ? 1.30 : -1.30;
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * 0.60, a0, a1: -a0, y: 0.92, tiltZ: tilt, palette: last ? 'heavy' : 'air', sweep: 0.04, hold: 0.02, fade: last ? 0.14 : 0.095 });
    }
  }

  /** Clear all active voxel slashes on room change / reset. */
  clear() {
    for (const s of this.arcs) { s.active = false; s.mesh.visible = false; s.anchor = null; }
    for (const s of this.lines) { s.active = false; s.mesh.visible = false; }
  }

  update(dt: number) {
    if (dt <= 0) return;
    for (const s of this.arcs) {
      if (!s.active) continue;
      s.t += dt;
      if (s.anchor && s.t < s.sweepDur + s.holdDur) {
        s.mesh.position.set(s.anchor.x, s.anchor.y + s.yOff, s.anchor.z);
      }
      const u = s.mat.uniforms;
      const head = Math.min(1, 0.80 + 0.20 * (s.t / Math.max(0.001, s.sweepDur)));
      const tailStart = s.sweepDur + s.holdDur;
      const kFade = Math.max(0, (s.t - tailStart) / Math.max(0.001, s.fadeDur));
      if (kFade >= 1) { s.active = false; s.mesh.visible = false; s.anchor = null; continue; }
      u.uHead.value = head;
      u.uTail.value = kFade * kFade * 1.05;
      u.uFade.value = kFade;
    }
    for (const s of this.lines) {
      if (!s.active) continue;
      s.t += dt;
      const u = s.mat.uniforms;
      const head = Math.min(1, 0.84 + 0.16 * (s.t / Math.max(0.001, s.sweepDur)));
      const kFade = Math.max(0, (s.t - s.sweepDur) / Math.max(0.001, s.fadeDur));
      if (kFade >= 1) { s.active = false; s.mesh.visible = false; continue; }
      u.uHead.value = head;
      u.uTail.value = kFade * kFade * 1.05;
      u.uFade.value = kFade;
    }
  }
}

export const slashArc = new SlashSystem();
onUpdate(dt => slashArc.update(dt));
