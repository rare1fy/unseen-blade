// 纯世界轴对齐 3D 体素立方体刀光（act-112 重构）：
//   - 由 ninjaAct.ts 每帧实测真实刀身网格（刀根 root + 刀尖 tip）驱动，外沿亮白体素块严丝合缝贴着真刀尖走；
//   - 所有刀光块（挥砍 + 连刺 + 一闪 / 穿风斩 / 掠地）均为世界 X/Y/Z 轴对齐的 7cm 级 3D 立方体，吸附到世界体素格并按格去重；
//   - transparent: true + depthWrite: false（保留 depthTest: true 正常前后遮挡），无黑色实体描边、分层半透发光（刀尖 0.88 / 刀身 0.46 / 尾块 0.28）；
//   - 消散按 3 档离散缩块降透（1.0 -> 0.72 -> 0.44 -> 0），尾屑按体素节拍步进微漂；
//   - 全局单 RingBuffer Mesh（1 draw call，纯 WebGL1，无 InstancedMesh / dFdx，顿帧自动定格，零 GC）。
import * as THREE from 'three';
import { scene, onUpdate, V3 } from '../engine/world';

const VOX_VS = `
attribute vec3 aOffset;
attribute float aShade;
attribute vec4 aColor;
attribute vec4 aTiming;
attribute vec3 aVel;

uniform float uNow;

varying vec4 vCol;

void main() {
  float age = uNow - aTiming.x;
  float life = max(0.001, aTiming.y);
  float k = age / life;
  if (age < -0.001 || k >= 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec4(0.0);
    return;
  }

  // Discrete 3-step voxel scale & opacity decay (crisp voxel feel, zero smooth melting)
  float s = k < 0.42 ? 1.0 : k < 0.72 ? 0.72 : 0.44;
  float ak = k < 0.42 ? 1.0 : k < 0.72 ? 0.62 : 0.28;
  // Stepped voxel drift for trailing sparks
  float stepK = floor(k * 4.0) * 0.25;
  vec3 p = position + aVel * (aTiming.w * stepK);

  vCol = vec4(aColor.rgb * aShade, aColor.a * ak);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p + aOffset * s, 1.0);
}`;

const VOX_FS = `
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
  hdr?: number;
}

const PAL: Record<string, SlashPalette> = {
  light:   { edge: 0xf4f9ff, body: 0x8eb8e8, tail: 0x4c709e, hdr: 1.18 },
  spin:    { edge: 0xf0fbff, body: 0x76c4e6, tail: 0x386e92, hdr: 1.18 },
  stab:    { edge: 0xf7fcff, body: 0x9ed4f8, tail: 0x4c7eb0, hdr: 1.20 },
  heavy:   { edge: 0xfff3d4, body: 0xf56638, tail: 0xa2281c, hdr: 1.25 },
  counter: { edge: 0xfffae4, body: 0xf7c246, tail: 0xb86618, hdr: 1.26 },
  iai:     { edge: 0xfffdf2, body: 0xfad66c, tail: 0xb07020, hdr: 1.28 },
  dcut:    { edge: 0xf0fdff, body: 0x60c8f4, tail: 0x2c6898, hdr: 1.20 },
  launch:  { edge: 0xf2fbff, body: 0x7ad4f8, tail: 0x366a98, hdr: 1.20 },
  air:     { edge: 0xfff0f6, body: 0xf27ea6, tail: 0x923056, hdr: 1.20 },
  swoop:   { edge: 0xf0fff3, body: 0x6cd898, tail: 0x2d704c, hdr: 1.20 },
};

const MOVE_PAL: Record<string, keyof typeof PAL> = {
  k1: 'light', k2: 'light', k3: 'spin', k4: 'stab', k5: 'heavy', chase: 'heavy',
  rel: 'iai', acut: 'air', acutF: 'heavy', swoop: 'swoop', plunge: 'heavy', launch: 'launch',
};

// World-axis-aligned unit cube 6 faces (CCW outward winding) + subtle luminous facet shading
const FACES: Array<{ v: Array<[number, number, number]>; shade: number }> = [
  { v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]], shade: 1.05 }, // +Y top
  { v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]], shade: 0.84 }, // -Y bottom
  { v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], shade: 0.98 }, // +Z
  { v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]], shade: 0.88 }, // -Z
  { v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]], shade: 0.95 }, // +X
  { v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]], shade: 0.89 }, // -X
];

const MAX_CUBES = 320;
const GRID = 0.09; // ~9cm chunky voxel light grid (~3x3 art px at gameplay camera so voxel cubes read unmistakably)
const _col = new THREE.Color();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _dir = new THREE.Vector3();

function cellKey(gx: number, gy: number, gz: number): number {
  return ((gx + 2048) & 4095) * 262144 + ((gy + 128) & 255) * 1024 + ((gz + 512) & 1023);
}

class SlashSystem {
  private mesh: THREE.Mesh | null = null;
  private geo: THREE.BufferGeometry | null = null;
  private mat: THREE.ShaderMaterial | null = null;
  private pos!: Float32Array;
  private off!: Float32Array;
  private shade!: Float32Array;
  private col!: Float32Array;
  private timing!: Float32Array;
  private vel!: Float32Array;
  private tierBuf = new Uint8Array(MAX_CUBES);
  private bornBuf = new Float32Array(MAX_CUBES);

  private cursor = 0;
  private used = 0;
  private dirty = false;
  private now = 0;
  private activeUntil = 0;

  // Per-grid-cell dedup timestamp so translucent cubes never stack on the exact same 7cm voxel cell
  private cellStamp = new Map<number, number>();
  private stepCount = 0;

  // Live style override from show.ts (counter gold / bleed crimson) + live blade tip cache
  private styleCounterUntil = 0;
  private styleBleedUntil = 0;
  private stylePal: keyof typeof PAL | null = null;
  private stylePalUntil = 0;
  private lastTip = new THREE.Vector3();
  private lastTipAt = -99;

  private ensure() {
    if (this.mesh) {
      if (!this.mesh.parent) scene.add(this.mesh);
      return;
    }
    const verts = MAX_CUBES * 24;
    this.pos = new Float32Array(verts * 3);
    this.off = new Float32Array(verts * 3);
    this.shade = new Float32Array(verts);
    this.col = new Float32Array(verts * 4);
    this.timing = new Float32Array(verts * 4);
    this.vel = new Float32Array(verts * 3);
    // Mark all initial cubes expired
    for (let i = 0; i < verts; i++) this.timing[i * 4 + 0] = -99;

    const idx = new Uint16Array(MAX_CUBES * 36);
    for (let b = 0; b < MAX_CUBES; b++) {
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
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(this.off, 3));
    geo.setAttribute('aShade', new THREE.BufferAttribute(this.shade, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('aTiming', new THREE.BufferAttribute(this.timing, 4));
    geo.setAttribute('aVel', new THREE.BufferAttribute(this.vel, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VOX_VS,
      fragmentShader: VOX_FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
      uniforms: { uNow: { value: 0 } },
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 6;
    scene.add(mesh);

    this.geo = geo;
    this.mat = mat;
    this.mesh = mesh;
  }

  /** Write one world-axis-aligned 3D voxel cube into the ring buffer. */
  private emitCube(
    x: number, y: number, z: number,
    size: number,
    hex: number, hdr: number, alpha: number,
    life: number, tier: number,
    vx = 0, vy = 0, vz = 0, driftDist = 0,
    snap = true,
  ) {
    this.ensure();
    let cx = x, cy = y, cz = z;
    if (snap) {
      const gx = Math.round(x / GRID);
      const gy = Math.round(y / GRID);
      const gz = Math.round(z / GRID);
      const key = cellKey(gx, gy, gz);
      const prev = this.cellStamp.get(key);
      // Prevent stacking translucent cubes on the exact same 7cm voxel cell within 0.055s
      if (prev !== undefined && this.now - prev < 0.055) return;
      this.cellStamp.set(key, this.now);
      if (this.cellStamp.size > 420) this.cellStamp.clear();
      cx = gx * GRID;
      cy = gy * GRID;
      cz = gz * GRID;
    }

    const slot = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_CUBES;
    if (this.used < MAX_CUBES) this.used++;

    this.tierBuf[slot] = tier;
    this.bornBuf[slot] = this.now;

    _col.setHex(hex).multiplyScalar(hdr);
    const r = _col.r, g = _col.g, b = _col.b;
    let vIdx = slot * 24;
    for (let f = 0; f < 6; f++) {
      const face = FACES[f];
      for (let k = 0; k < 4; k++) {
        const cv = face.v[k];
        const p3 = vIdx * 3;
        const p4 = vIdx * 4;
        this.pos[p3 + 0] = cx;
        this.pos[p3 + 1] = cy;
        this.pos[p3 + 2] = cz;
        this.off[p3 + 0] = cv[0] * size;
        this.off[p3 + 1] = cv[1] * size;
        this.off[p3 + 2] = cv[2] * size;
        this.shade[vIdx] = face.shade;
        this.col[p4 + 0] = r;
        this.col[p4 + 1] = g;
        this.col[p4 + 2] = b;
        this.col[p4 + 3] = alpha;
        this.timing[p4 + 0] = this.now;
        this.timing[p4 + 1] = life;
        this.timing[p4 + 2] = tier;
        this.timing[p4 + 3] = driftDist;
        this.vel[p3 + 0] = vx;
        this.vel[p3 + 1] = vy;
        this.vel[p3 + 2] = vz;
        vIdx++;
      }
    }

    this.dirty = true;
    const end = this.now + life + 0.02;
    if (end > this.activeUntil) this.activeUntil = end;
    if (this.mesh) this.mesh.visible = true;
  }

  /** Retroactively tint recently stamped cubes (e.g. when counter gold / bleed triggers on impact). */
  private retintRecent(windowSec: number, pal: SlashPalette, bleed: boolean) {
    if (!this.geo) return;
    const hdr = pal.hdr ?? 1.18;
    const minT = this.now - windowSec;
    let changed = false;
    for (let slot = 0; slot < this.used; slot++) {
      if (this.bornBuf[slot] < minT) continue;
      const tier = this.tierBuf[slot];
      const hex = tier === 0 ? pal.edge : tier === 1 ? pal.body : tier === 2 ? (bleed ? 0xa61e22 : pal.tail) : pal.edge;
      const scale = tier === 0 || tier === 3 ? hdr : 1.0;
      _col.setHex(hex).multiplyScalar(scale);
      const baseV = slot * 24;
      for (let i = 0; i < 24; i++) {
        const p4 = (baseV + i) * 4;
        this.col[p4 + 0] = _col.r;
        this.col[p4 + 1] = _col.g;
        this.col[p4 + 2] = _col.b;
      }
      changed = true;
    }
    if (changed) (this.geo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * Real-time blade-attached 3D voxel light trail driven directly by the model's real blade root & tip.
   * Called per frame from ninjaAct.ts during active swing windows so the slash stays 100% glued to the blade tip.
   */
  bladeStep(prevRoot: THREE.Vector3, prevTip: THREE.Vector3, root: THREE.Vector3, tip: THREE.Vector3, moveKind: string) {
    const dist = prevTip.distanceTo(tip);
    if (dist < 0.015) return;

    this.lastTip.copy(tip);
    this.lastTipAt = this.now;

    const counter = this.now <= this.styleCounterUntil;
    const bleed = this.now <= this.styleBleedUntil && !counter;
    const palKey: keyof typeof PAL = counter
      ? 'counter'
      : (this.now <= this.stylePalUntil && this.stylePal)
        ? this.stylePal
        : (MOVE_PAL[moveKind] ?? 'light');
    const pal = PAL[palKey] ?? PAL.light;
    const hdr = pal.hdr ?? 1.18;
    const heavy = palKey === 'heavy' || palKey === 'counter' || palKey === 'iai';
    const isThrust = moveKind === 'k4';

    // Keep blade length consistent during curved arc sub-stepping so fast 30fps swings stay cleanly rounded
    const bladeLen = Math.max(0.45, root.distanceTo(tip));
    const steps = Math.max(1, Math.min(14, Math.ceil(dist / 0.065)));

    // Direction of tip motion for tiny trailing voxel sparks
    _dir.copy(tip).sub(prevTip);
    const dl = _dir.length() || 1;
    _dir.multiplyScalar(1 / dl);

    const edgeSz = heavy ? 0.115 : 0.096;
    const midSz = heavy ? 0.105 : 0.092;
    const wakeSz = 0.078;
    const edgeLife = heavy ? 0.17 : 0.125;
    const midLife = heavy ? 0.14 : 0.10;
    const wakeLife = heavy ? 0.11 : 0.078;

    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      _a.lerpVectors(prevRoot, root, f); // interpolated hilt/root
      _b.lerpVectors(prevTip, tip, f);   // interpolated chord tip
      if (!isThrust) {
        // Re-project chord tip onto the real blade length around root so arcs never flatten across frames
        _c.copy(_b).sub(_a);
        const cl = _c.length();
        if (cl > 0.05) _b.copy(_a).addScaledVector(_c, bladeLen / cl);
      }

      // Blade unit direction (root -> tip)
      _d.copy(_b).sub(_a);
      const bl = _d.length() || 1;
      _d.multiplyScalar(1 / bl);

      this.stepCount++;

      // Tier 0: luminous white razor voxel cube glued flush to the blade tip!
      this.emitCube(_b.x + _d.x * 0.02, _b.y + _d.y * 0.02, _b.z + _d.z * 0.02, edgeSz, pal.edge, hdr, 0.88, edgeLife, 0);

      // Tier 1: translucent colored voxel cube along the outer-mid blade (70% of blade length)
      _c.lerpVectors(_a, _b, 0.70);
      this.emitCube(_c.x, _c.y, _c.z, midSz, pal.body, 1.0, 0.48, midLife, 1);

      // On heavy moves or every 2nd step, add a second inner-blade voxel cube (46% of blade length)
      if (heavy || this.stepCount % 2 === 0) {
        _c.lerpVectors(_a, _b, 0.46);
        this.emitCube(_c.x, _c.y, _c.z, wakeSz, bleed ? 0xa61e22 : (heavy ? pal.body : pal.tail), 1.0, heavy ? 0.36 : 0.28, wakeLife, 2);
      }

      // Sparse tiny glowing voxel spark cubes drifting slightly off the blade tip
      if (this.stepCount % (heavy ? 3 : 5) === 0) {
        const up = ((this.stepCount * 7) % 5 - 2) * 0.22;
        this.emitCube(
          _b.x, _b.y, _b.z,
          0.062, pal.edge, hdr, 0.84,
          heavy ? 0.19 : 0.145, 3,
          _dir.x * 0.7 + _d.x * 0.4, up + 0.25, _dir.z * 0.7 + _d.z * 0.4,
          heavy ? 0.38 : 0.26, false,
        );
      }
    }

    // For k4 thrust: shoot a short razor-sharp needle of 4 chunky voxel cubes directly ahead of the real blade tip!
    if (isThrust && dist > 0.06) {
      _d.copy(tip).sub(root);
      const bl = _d.length() || 1;
      _d.multiplyScalar(1 / bl);
      for (let k = 1; k <= 4; k++) {
        const d = k * 0.10;
        const sz = k <= 2 ? 0.095 : 0.072;
        this.emitCube(
          tip.x + _d.x * d, tip.y + _d.y * d, tip.z + _d.z * d,
          sz, k <= 2 ? pal.edge : pal.body, k <= 2 ? hdr : 1.0, k <= 2 ? 0.88 : 0.52,
          0.115, k <= 2 ? 0 : 1,
        );
      }
    }
  }

  /**
   * Spawn a straight beam of world-axis-aligned 3D luminous voxel cubes along a -> b
   * (used for long-range dash/teleport cleaves: rel 一闪, dcut 穿风斩, swoop 掠地).
   */
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
    const dx = o.b.x - o.a.x, dz = o.b.z - o.a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const pal = PAL[o.palette ?? 'iai'] ?? PAL.iai;
    const hdr = pal.hdr ?? 1.24;
    const y = (o.y ?? 0.92) + o.a.y;
    const life = Math.max(0.12, (o.fade ?? 0.22) * 0.78);
    const fx = dx / len, fz = dz / len;
    const sx = -fz, sz = fx; // lateral perpendicular
    const steps = Math.max(6, Math.min(36, Math.ceil(len / 0.095)));

    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const px = o.a.x + dx * u;
      const pz = o.a.z + dz * u;
      // Central razor spine of chunky 9cm world-axis-aligned luminous voxel cubes
      const coreSz = u > 0.08 && u < 0.92 ? 0.105 : 0.078;
      this.emitCube(px, y, pz, coreSz, pal.edge, hdr, 0.90, life, 0);

      // Staggered translucent flanking voxel cubes (kinetic voxel silhouette, never dotted or solid-brick)
      if (u > 0.10 && u < 0.90 && i % 2 === 0) {
        const side = (i % 4 === 0) ? 1 : -1;
        const off = 0.095 + (i % 3 === 0 ? 0.055 : 0);
        this.emitCube(px + sx * side * off, y - 0.02, pz + sz * side * off, 0.092, pal.body, 1.0, 0.48, life * 0.84, 1);
      }

      // Sparse tiny glowing voxel sparks drifting sideways off the cleave
      if (i > 1 && i < steps - 1 && i % 6 === 0) {
        const side = (i % 12 === 0) ? 1 : -1;
        this.emitCube(
          px + sx * side * 0.09, y, pz + sz * side * 0.09,
          0.064, pal.edge, hdr, 0.84, life * 1.05, 3,
          sx * side * 0.85, 0.25, sz * side * 0.85, 0.36, false,
        );
      }
    }
  }

  /**
   * Called by show.ts on impact frame: applies move style modifiers (counter gold / bleed crimson / launch cyan)
   * to the live blade-attached voxel trail and pops a crisp impact burst right at the live blade tip.
   */
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
    const counter = !!o.counter;
    const bleed = !!o.bleed && !counter;
    if (counter) this.styleCounterUntil = this.now + 0.16;
    if (bleed) this.styleBleedUntil = this.now + 0.16;
    if (o.kind === 'launch') { this.stylePal = 'launch'; this.stylePalUntil = this.now + 0.16; }

    const palKey: keyof typeof PAL = counter ? 'counter' : (MOVE_PAL[o.kind] ?? 'light');
    const pal = PAL[palKey] ?? PAL.light;
    if (counter || bleed || o.kind === 'launch') {
      this.retintRecent(0.09, pal, bleed);
    }

    // Pop 4 crisp tiny voxel hit-sparks right at the real live blade tip (never a disconnected floating ring)
    if (this.now - this.lastTipAt < 0.09) {
      const hdr = pal.hdr ?? 1.2;
      const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
      const sx = fz, sz = -fx;
      for (let i = 0; i < 4; i++) {
        const s = (i % 2 === 0 ? 1 : -1) * (0.4 + 0.3 * (i >> 1));
        this.emitCube(
          this.lastTip.x, this.lastTip.y, this.lastTip.z,
          o.kind === 'k5' || counter ? 0.064 : 0.048,
          pal.edge, hdr, 0.86, 0.15, 3,
          fx * 0.7 + sx * s, 0.35 + (i % 3) * 0.2, fz * 0.7 + sz * s,
          o.kind === 'k5' || counter ? 0.42 : 0.28, false,
        );
      }
    }
  }

  /**
   * act-116 高速拼刀 (Rapid Clash): emit a crisp diagonal slash of world-axis-aligned 3D luminous voxel cubes
   * right across the weapon contact point so rapid blade exchanges weave a kinetic voxel clash web.
   */
  clashCross(at: THREE.Vector3, side: THREE.Vector3, angle: number, palette: keyof typeof PAL = 'iai', life = 0.11, halfLen = 0.72) {
    const pal = PAL[palette] ?? PAL.iai;
    const hdr = pal.hdr ?? 1.24;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const dx = side.x * ca, dy = sa, dz = side.z * ca;
    const steps = 11;
    for (let i = 0; i <= steps; i++) {
      const u = (i / steps) * 2 - 1;
      const px = at.x + dx * u * halfLen;
      const py = at.y + dy * u * halfLen;
      const pz = at.z + dz * u * halfLen;
      const sz = Math.abs(u) < 0.7 ? 0.088 : 0.064;
      this.emitCube(px, py, pz, sz, pal.edge, hdr, 0.9, life, 0, 0, 0, 0, 0, false);
      if (i % 2 === 0 && Math.abs(u) < 0.75) {
        const s = (i % 4 === 0) ? 1 : -1;
        this.emitCube(px, py + s * 0.065, pz, 0.072, pal.body, 1.0, 0.48, life * 0.85, 1, 0, 0, 0, 0, false);
      }
    }
    this.activeUntil = Math.max(this.activeUntil, this.now + life + 0.05);
    this.dirty = true;
    if (this.mesh) this.mesh.visible = true;
  }

  /** Clear all active voxel slash cubes on room change / reset. */
  clear() {
    this.used = 0;
    this.cursor = 0;
    this.activeUntil = 0;
    this.cellStamp.clear();
    if (this.geo) this.geo.setDrawRange(0, 0);
    if (this.mesh) this.mesh.visible = false;
  }

  update(dt: number) {
    if (this.dirty && this.geo) {
      this.geo.setDrawRange(0, this.used * 36);
      (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.getAttribute('aOffset') as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.getAttribute('aShade') as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.getAttribute('aTiming') as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.getAttribute('aVel') as THREE.BufferAttribute).needsUpdate = true;
      this.dirty = false;
    }
    if (dt <= 0) return;
    this.now += dt;
    if (this.mat) this.mat.uniforms.uNow.value = this.now;
    if (this.mesh && this.mesh.visible && this.now > this.activeUntil) {
      this.mesh.visible = false;
    }
  }
}

export const slashArc = new SlashSystem();
onUpdate(dt => slashArc.update(dt));
