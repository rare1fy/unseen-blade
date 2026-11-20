// 纯 3D 立体体素块刀光（act-110 重构，严格统一体素/像素风格）：
//   - 用实心 3D 体素长方体与立方体块拼出刀弧与直线光棱柱，带真实 3D 厚度与顶/侧/底面平直明暗；
//   - 外径严格对齐每招实际攻击范围，玩家靠体素刀锋直读判定边；
//   - 不透明实色（transparent: false, depthWrite: true），无平滑曲线与半透明雾感，自动融入场景前后遮挡与 1 像素轮廓描边；
//   - 消散按体素格阶梯缩块剥落（1.0 -> 0.70 -> 0.42 -> 0），并沿刀势崩出 7cm 级 3D 体素小方块；
//   - 按游戏时间 dt 推进，顿帧期间刀块定格在最锐利的一帧；
//   - 单槽位单 Mesh 池化、无 InstancedMesh 依赖、纯 WebGL1（无 dFdx/dFdy），零 GC，全平台一致。
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

varying vec3 vCol;

void main() {
  float u = aMeta.x;
  float tier = aMeta.y;
  float delay = aMeta.z;
  float flyDist = aMeta.w;

  float s = 0.0;
  vec3 center = position;

  if (tier > 2.5) {
    // Detached 7cm 3D voxel spark cubes: spawn behind blade head and step down cleanly
    float born = step(u - 0.10, uHead);
    float life = clamp(1.0 - (uFade * 1.15 + delay), 0.0, 1.0);
    s = born * (life > 0.62 ? 1.0 : life > 0.30 ? 0.66 : life > 0.06 ? 0.38 : 0.0);
    float moveK = clamp(uFade * 1.35 + max(0.0, uHead - u) * 0.25, 0.0, 1.0);
    center += aFly * (flyDist * moveK);
  } else {
    // Main slash voxel blocks: inner wake peels off first, outer razor rim stays last
    float tierOff = tier * 0.14;
    float cut = uTail + tierOff + delay;
    if (u <= uHead && u >= cut) {
      float rem = clamp((u - cut) / 0.24, 0.0, 1.0);
      s = rem > 0.58 ? 1.0 : rem > 0.26 ? 0.72 : 0.44;
      if (uFade > 0.86 && tier > 0.5) s = 0.0;
    }
  }

  if (s <= 0.001) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec3(0.0);
    return;
  }

  vec3 baseCol = tier < 0.5 ? uEdgeCol : tier < 1.5 ? uBodyCol : tier < 2.5 ? uTailCol : mix(uBodyCol, uEdgeCol, 0.62);
  float hot = step(uHead - 0.20, u) * step(tier, 0.5);
  vCol = (baseCol + uEdgeCol * hot * 0.12) * aShade;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(center + aOffset * s, 1.0);
}`;

const BOX_FS = `
precision highp float;
varying vec3 vCol;
void main() {
  gl_FragColor = vec4(vCol, 1.0);
}`;

export interface SlashPalette {
  edge: number;
  body: number;
  tail: number;
  /** restrained HDR boost on outer razor voxel row (1.08..1.26) */
  hdr?: number;
}

const PAL: Record<string, SlashPalette> = {
  light:   { edge: 0xf0f6ff, body: 0x7ea6d6, tail: 0x385074, hdr: 1.12 },
  spin:    { edge: 0xeef9ff, body: 0x6ab2d6, tail: 0x2c5270, hdr: 1.14 },
  stab:    { edge: 0xf6fbff, body: 0x90c6f0, tail: 0x3b6594, hdr: 1.16 },
  heavy:   { edge: 0xfff0cc, body: 0xe8562e, tail: 0x801e16, hdr: 1.22 },
  counter: { edge: 0xfff8dc, body: 0xf0b63a, tail: 0x9a4f14, hdr: 1.24 },
  iai:     { edge: 0xfffaf0, body: 0xf2c95e, tail: 0x8f5718, hdr: 1.26 },
  dcut:    { edge: 0xeefcff, body: 0x54b8e8, tail: 0x20507a, hdr: 1.16 },
  launch:  { edge: 0xf0faff, body: 0x70c6f0, tail: 0x2a5680, hdr: 1.16 },
  air:     { edge: 0xffecf2, body: 0xe86e98, tail: 0x7a2444, hdr: 1.16 },
  swoop:   { edge: 0xeefff0, body: 0x5ec988, tail: 0x225a3c, hdr: 1.16 },
};

// Unit cube 6 faces (CCW outward winding) + flat voxel face shading factors
const FACES: Array<{ v: Array<[number, number, number]>; shade: number }> = [
  // +Y top (sunlit)
  { v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]], shade: 1.06 },
  // -Y bottom (shaded)
  { v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]], shade: 0.62 },
  // +Z outer cutting rim
  { v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], shade: 0.94 },
  // -Z inner rim
  { v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]], shade: 0.74 },
  // +X leading end-cap
  { v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]], shade: 0.86 },
  // -X trailing end-cap
  { v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]], shade: 0.76 },
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

function buildVoxelArc(pool: BoxPool, a0: number, a1: number, rIn: number, rOut: number, heavy: boolean) {
  pool.count = 0;
  const span = Math.abs(a1 - a0);
  const dir = a1 >= a0 ? 1 : -1;
  const nOuter = Math.max(9, Math.min(20, Math.round(span * 5.2)));
  const band = Math.max(0.28, rOut - rIn);
  const hScale = heavy ? 1.25 : 1.0;

  // Tier 0: outer razor voxel slabs (aligned strictly to rOut)
  for (let i = 0; i < nOuter; i++) {
    const u = (i + 0.5) / nOuter;
    const a = a0 + (a1 - a0) * u;
    const stepArc = (span / nOuter) * rOut;
    // Discrete stepped voxel profile (bold head -> sturdy mid -> chunky tail bricks)
    const rw = qv(u > 0.58 ? Math.min(0.21, band * 0.26) : u > 0.18 ? Math.min(0.14, band * 0.20) : 0.105);
    const h = qv((u > 0.52 ? 0.105 : u > 0.18 ? 0.07 : 0.07) * hScale);
    const len = qv(stepArc * (u > 0.26 ? 0.94 : 0.72));
    const r = rOut - rw * 0.5;
    const delay = (hash1(i * 3 + 1) - 0.5) * 0.06;
    pushBox(pool, Math.sin(a) * r, 0, Math.cos(a) * r, len, h, rw, a, u, 0, delay, 0);
  }

  // Tier 1: chunky mid-body voxel bricks (stepped 1 tier down in Y and inward behind the blade rim)
  const nMid = Math.max(7, Math.min(16, Math.round(nOuter * 0.82)));
  for (let i = 0; i < nMid; i++) {
    const u = 0.14 + (i + 0.5) / nMid * 0.78;
    const a = a0 + (a1 - a0) * u;
    const outerW = u > 0.62 ? Math.min(0.21, band * 0.26) : Math.min(0.14, band * 0.20);
    const rw = qv(Math.min(band - outerW - 0.07, u > 0.52 ? 0.28 : u > 0.26 ? 0.21 : 0.14));
    if (rw < 0.07) continue;
    const r = rOut - outerW - rw * 0.5 + 0.015;
    const stepArc = ((span * 0.78) / nMid) * r;
    const len = qv(stepArc * (u > 0.38 ? 0.86 : 0.68));
    const h = qv(0.07 * hScale);
    const delay = (hash1(i * 5 + 7) - 0.5) * 0.07;
    pushBox(pool, Math.sin(a) * r, -0.018, Math.cos(a) * r, len, h, rw, a, u, 1, delay, 0);
  }

  // Tier 2: inner broken-voxel wake chunks (deliberate gaps so it reads as chunky voxel wake, never fog)
  const nWake = Math.max(5, Math.min(10, Math.round(nOuter * 0.5)));
  for (let i = 0; i < nWake; i++) {
    const u = 0.08 + (i + 0.5) / nWake * 0.68;
    const a = a0 + (a1 - a0) * u;
    const r = rIn + qv(band * (0.18 + (i % 2) * 0.16));
    const stepArc = ((span * 0.68) / nWake) * r;
    const len = qv(Math.min(0.28, stepArc * 0.56));
    const rw = qv(i % 2 === 0 ? 0.14 : 0.105);
    const h = qv(0.052 * hScale);
    const delay = (hash1(i * 7 + 13) - 0.5) * 0.08;
    pushBox(pool, Math.sin(a) * r, -0.035, Math.cos(a) * r, len, h, rw, a, u, 2, delay, 0);
  }

  // Tier 3: 7cm detached 3D voxel spark cubes bursting tangentially along outer blade edge
  const nSpark = heavy ? 10 : 7;
  for (let i = 0; i < nSpark; i++) {
    const u = 0.24 + (i + 0.5) / nSpark * 0.72;
    const a = a0 + (a1 - a0) * u;
    const r = rOut - (i % 3 === 0 ? 0.02 : 0.16);
    const sz = qv(heavy && i % 2 === 0 ? 0.105 : 0.07);
    const sa = Math.sin(a), ca = Math.cos(a);
    // Tangent along swing direction + slight outward radial pop + slight Y scatter
    const tx = ca * dir, tz = -sa * dir;
    const fx = tx * 0.78 + sa * 0.55;
    const fy = (hash1(i * 11 + 3) - 0.35) * 0.55;
    const fz = tz * 0.78 + ca * 0.55;
    const fl = Math.hypot(fx, fy, fz) || 1;
    const flyDist = 0.32 + hash1(i * 13 + 5) * (heavy ? 0.52 : 0.34);
    const yOff = (hash1(i * 17 + 2) - 0.5) * 0.14;
    const delay = (hash1(i * 19 + 9) - 0.5) * 0.12;
    pushBox(pool, sa * r, yOff, ca * r, sz, sz, sz, a, u, 3, delay, flyDist, fx / fl, fy / fl, fz / fl);
  }

  commitPool(pool);
}

function buildVoxelLine(pool: BoxPool, len: number, width: number, lance: boolean) {
  pool.count = 0;
  const nCore = Math.max(5, Math.min(12, Math.round(len / 0.38)));
  const stepZ = len / nCore;
  const coreW = qv(Math.max(0.07, width * (lance ? 0.24 : 0.30)));
  const coreH = qv(lance ? 0.105 : 0.12);

  // Tier 0: central 3D square-section voxel spine along +Z
  for (let i = 0; i < nCore; i++) {
    const u = (i + 0.5) / nCore;
    const z = u * len;
    // Unbroken solid voxel blade spine in front 80%, breaking into crisp trailing bricks at tail
    const segL = qv(stepZ * (u > 0.22 ? 1.04 : 0.76));
    // Lance narrows sharply at the needle tip; cleave holds a crisp square spine
    const w = lance ? qv(u > 0.78 ? 0.07 : coreW) : qv(u > 0.88 || u < 0.14 ? Math.max(0.07, coreW * 0.65) : coreW);
    const h = lance ? qv(u > 0.78 ? 0.07 : coreH) : coreH;
    const delay = (hash1(i * 3 + 2) - 0.5) * 0.05;
    pushBox(pool, 0, 0, z, w, h, segL, 0, u, 0, delay, 0);
  }

  // Tier 1: staggered asymmetric flanking 3D voxel ribs (kinetic velocity silhouette, never a symmetric dotted track)
  const nSide = Math.max(4, Math.min(7, Math.round(nCore * 0.62)));
  const sideSpan = lance ? 0.64 : 0.78;
  const sideBase = lance ? 0.12 : 0.14;
  for (let i = 0; i < nSide; i++) {
    const uL = sideBase + (i + 0.42) / nSide * sideSpan;
    const uR = Math.min(0.94, sideBase + (i + 0.82) / nSide * sideSpan);
    for (let side = -1; side <= 1; side += 2) {
      const u = side < 0 ? uL : uR;
      const z = u * len;
      const wing = lance ? (1 - u * 0.70) : (u > 0.35 && u < 0.88 ? 1.0 : 0.62);
      const rw = qv(Math.max(0.07, width * 0.24 * wing));
      const lenK = lance ? 0.84 : (u > 0.45 ? 0.92 : 0.62);
      const segL = qv(((len * sideSpan) / nSide) * lenK);
      const h = qv(0.07);
      const xOff = coreW * 0.5 + rw * 0.5 - 0.01;
      const delay = (hash1(i * 5 + (side < 0 ? 4 : 11)) - 0.5) * 0.07;
      pushBox(pool, side * xOff, -0.015, z, rw, h, segL, 0, u, 1, delay, 0);
    }
  }

  // Tier 2: outer staggered voxel wake blocks (3rd tier width)
  const nWake = Math.min(6, Math.max(3, Math.round(len / 0.75)));
  for (let i = 0; i < nWake; i++) {
    const u = 0.12 + (i + 0.5) / nWake * 0.68;
    const z = u * len;
    const side = i % 2 === 0 ? 1 : -1;
    const xOff = qv(width * (lance ? 0.42 * (1 - u * 0.55) : 0.46));
    const rw = qv(0.07);
    const segL = qv(Math.min(0.28, stepZ * 0.68));
    const delay = (hash1(i * 7 + 9) - 0.5) * 0.08;
    pushBox(pool, side * xOff, -0.03, z, rw, 0.052, segL, 0, u, 2, delay, 0);
  }

  // Tier 3: detached 7cm 3D voxel cubes bursting sideways off the cleave path
  const nSpark = lance ? 6 : 8;
  for (let i = 0; i < nSpark; i++) {
    const u = 0.16 + (i + 0.5) / nSpark * 0.76;
    const z = u * len;
    const side = i % 2 === 0 ? 1 : -1;
    const sz = qv(i % 3 === 0 ? 0.105 : 0.07);
    const x0 = side * (coreW * 0.6 + width * 0.25);
    const fx = side * 0.85;
    const fy = (hash1(i * 11 + 6) - 0.35) * 0.5;
    const fz = lance ? 0.55 : 0.22;
    const fl = Math.hypot(fx, fy, fz) || 1;
    const flyDist = 0.28 + hash1(i * 13 + 7) * 0.42;
    const delay = (hash1(i * 17 + 4) - 0.5) * 0.1;
    pushBox(pool, x0, (hash1(i * 9 + 1) - 0.5) * 0.14, z, sz, sz, sz, 0, u, 3, delay, flyDist, fx / fl, fy / fl, fz / fl);
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

const MAX_ARC_BOXES = 56;
const MAX_LINE_BOXES = 40;
const ARC_POOL = 6;
const LINE_POOL = 5;

function setCol(u: THREE.Color, hex: number, scale = 1) {
  u.setHex(hex).multiplyScalar(scale);
}

function makeVoxelMat(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: BOX_VS,
    fragmentShader: BOX_FS,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uEdgeCol: { value: new THREE.Color(0xf0f6ff) },
      uBodyCol: { value: new THREE.Color(0x7ea6d6) },
      uTailCol: { value: new THREE.Color(0x385074) },
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
      scene.add(mesh);
      this.arcs.push({ mesh, pool, mat, active: false, t: 0, sweepDur: 0.055, holdDur: 0.04, fadeDur: 0.14, anchor: null, yOff: 0.95 });
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
      scene.add(mesh);
      this.lines.push({ mesh, pool, mat, active: false, t: 0, sweepDur: 0.045, fadeDur: 0.22 });
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

  /** Spawn a 3D chunky voxel-block crescent arc aligned to the swing's real reach. */
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
    const hdr = pal.hdr ?? 1.14;
    const rOut = Math.max(0.6, o.rOut);
    const rIn = Math.max(0.25, o.rIn ?? rOut * 0.48);
    const heavy = o.palette === 'heavy' || o.palette === 'counter' || o.palette === 'iai';
    buildVoxelArc(s.pool, o.a0, o.a1, rIn, rOut, heavy);

    const u = s.mat.uniforms;
    setCol(u.uEdgeCol.value, pal.edge, hdr);
    setCol(u.uBodyCol.value, pal.body, 1.0);
    setCol(u.uTailCol.value, o.bleed ? 0x7d1618 : pal.tail, 1.0);
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
    s.sweepDur = o.sweep ?? 0.055;
    s.holdDur = o.hold ?? 0.04;
    s.fadeDur = o.fade ?? 0.14;
  }

  /** Spawn a 3D voxel prism beam / thrust lance along a -> b. */
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
    const hdr = pal.hdr ?? 1.22;

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
    s.sweepDur = o.sweep ?? (o.lance ? 0.045 : 0.03);
    s.fadeDur = o.fade ?? (o.lance ? 0.15 : 0.24);
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
    const r = o.range * (counter ? 1.1 : 1.0);

    if (o.kind === 'k1') {
      const h = Math.min(1.55, Math.max(1.15, o.half + 0.18));
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * 0.46, a0: -h, a1: h, y: 0.96, tiltZ: -0.14, palette: counter ? 'counter' : 'light', bleed, sweep: 0.05, hold: 0.035, fade: 0.13 });
    } else if (o.kind === 'k2') {
      const h = Math.min(1.6, Math.max(1.2, o.half + 0.18));
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * 0.46, a0: h, a1: -h, y: 1.0, tiltZ: 0.26, palette: counter ? 'counter' : 'light', bleed, sweep: 0.05, hold: 0.035, fade: 0.13 });
    } else if (o.kind === 'k3') {
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * (o.wide ? 0.50 : 0.56), a0: -Math.PI, a1: Math.PI + 0.35, y: 0.92, tiltZ: 0.06, palette: counter ? 'counter' : 'spin', bleed, sweep: 0.095, hold: 0.045, fade: 0.17 });
    } else if (o.kind === 'k4') {
      const second = (o.n ?? 1) > 1;
      const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
      const a = V3(at.x + fx * 0.35, y0, at.z + fz * 0.35);
      const b = V3(at.x + fx * (r + (second ? 0.65 : 0.3)), y0, at.z + fz * (r + (second ? 0.65 : 0.3)));
      this.line({ a, b, width: second ? 0.68 : 0.54, y: 1.0, palette: counter ? 'counter' : 'stab', lance: true, tiltZ: second ? -0.12 : 0.12, sweep: 0.035, fade: second ? 0.17 : 0.13 });
    } else if (o.kind === 'k5') {
      // Dramatic steep diagonal overhead voxel cleave + low sweeping voxel arc
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r * 1.06, rIn: r * 0.38, a0: -1.45, a1: 1.25, y: 1.08, tiltX: 0.18, tiltZ: -1.08, palette: counter ? 'counter' : 'heavy', bleed, sweep: 0.06, hold: 0.065, fade: 0.22 });
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r * 0.98, rIn: r * 0.58, a0: -1.2, a1: 1.2, y: 0.48, tiltZ: -0.08, palette: counter ? 'counter' : 'heavy', bleed, sweep: 0.055, hold: 0.05, fade: 0.18 });
    } else if (o.kind === 'launch') {
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * 0.44, a0: 1.25, a1: -1.35, y: 0.95, tiltX: -0.15, tiltZ: 1.15, palette: 'launch', sweep: 0.055, hold: 0.045, fade: 0.18 });
    } else if (o.kind === 'acut' || o.kind === 'acutF') {
      const last = o.kind === 'acutF';
      const n = o.n ?? 1;
      const tilt = last ? -1.12 : n === 1 ? -0.45 : 0.45;
      const a0 = n === 2 ? 1.35 : -1.35;
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * 0.46, a0, a1: -a0, y: 0.92, tiltZ: tilt, palette: last ? 'heavy' : 'air', sweep: 0.045, hold: 0.03, fade: last ? 0.19 : 0.13 });
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
