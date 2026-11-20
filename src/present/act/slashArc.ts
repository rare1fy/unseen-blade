// 体素硬边刀弧面片（act-109 战斗手感打磨第一波）：
// 替换原来由圆形发光粒子串（trailSeg）拼出的挥刀轨迹，改用程序化 3D 锐利刀弧面片池：
//   - 外径严格对齐每招实际攻击范围，玩家靠刀光就能直读攻击距离；
//   - 着色器纯 WebGL1（无 dFdx/dFdy），硬边双色阶刀锋 + 尾部切片收细，贴合 2x 像素体素美学、高亮克制；
//   - 按游戏时间 dt 推进：命中顿帧期间刀弧定格在最锐利的一帧，顿帧结束瞬间利落收细消散；
//   - 池化复用几何体与材质，每帧 0 GC，空闲时 0 draw call。
import * as THREE from 'three';
import { scene, onUpdate, V3 } from '../engine/world';

const VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Crescent slash shader:
//   vUv.x = 0 -> 1 along sweep direction (tail -> tip)
//   vUv.y = 0 -> 1 from inner edge -> outer blade rim
const ARC_FS = `
precision highp float;
uniform vec3 uEdgeCol;
uniform vec3 uBodyCol;
uniform vec3 uTailCol;
uniform float uHead;
uniform float uTail;
uniform float uAlpha;
uniform float uStreak;
varying vec2 vUv;

void main() {
  float span = max(0.001, uHead - uTail);
  if (vUv.x > uHead || vUv.x < uTail) discard;
  float lu = clamp((vUv.x - uTail) / span, 0.0, 1.0);
  // Sculpted crescent profile: thick near the leading edge, razor-tapered at tip and tail
  float tip = smoothstep(1.0, 0.86, lu);
  float tail = pow(lu, 0.55);
  float profile = clamp(tail * (0.25 + 0.75 * tip), 0.0, 1.0);
  float innerCut = 1.0 - profile * 0.94;
  if (vUv.y < innerCut) discard;

  float band = (vUv.y - innerCut) / max(0.001, 1.0 - innerCut);
  // Crisp stepped pixel-friendly bands (no muddy radial fog)
  float rim = step(0.76, band);
  float mid = step(0.36, band);
  // Subtle directional steel-grain cutout near the trailing inner edge
  float notch = step(0.52, fract(vUv.y * 6.0 + vUv.x * 2.5));
  float innerMask = mix(1.0 - uStreak * 0.35 * notch, 1.0, mid);
  if (innerMask < 0.35) discard;

  vec3 col = mix(uTailCol, uBodyCol, mid);
  col = mix(col, uEdgeCol, rim);
  // Hot flash at the very leading edge of the blade
  float lead = smoothstep(0.72, 1.0, lu) * rim;
  col += uEdgeCol * lead * 0.35;

  float a = mix(0.55, 0.92, mid);
  a = mix(a, 1.0, rim);
  a *= uAlpha * smoothstep(0.0, 0.14, lu);
  if (a < 0.02) discard;
  gl_FragColor = vec4(col, a);
}`;

// Tapered linear cleave / thrust lance shader (k4 thrust, rel 一闪, dcut 穿风斩, swoop 掠地):
//   vUv.x = 0 -> 1 along travel direction
//   vUv.y = 0 -> 1 across width (0.5 = razor center)
const LINE_FS = `
precision highp float;
uniform vec3 uEdgeCol;
uniform vec3 uBodyCol;
uniform vec3 uTailCol;
uniform float uHead;
uniform float uTail;
uniform float uAlpha;
uniform float uLance;
varying vec2 vUv;

void main() {
  if (vUv.x > uHead || vUv.x < uTail) discard;
  float span = max(0.001, uHead - uTail);
  float lu = clamp((vUv.x - uTail) / span, 0.0, 1.0);
  float d = abs(vUv.y - 0.5) * 2.0;

  // Lance (k4): needle point forward, wider near base; Cleave (rel/dcut): razor ribbon along path
  float halfW = uLance > 0.5
    ? (1.0 - lu * 0.85) * smoothstep(0.0, 0.18, lu)
    : smoothstep(0.0, 0.12, lu) * smoothstep(1.0, 0.82, lu);
  halfW *= mix(0.35, 1.0, uAlpha);
  if (d > halfW) discard;

  float k = 1.0 - d / max(0.001, halfW);
  float core = step(0.58, k);
  float mid = step(0.22, k);
  vec3 col = mix(uTailCol, uBodyCol, mid);
  col = mix(col, uEdgeCol, core);
  float a = mix(0.5, 0.92, mid);
  a = mix(a, 1.0, core) * uAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(col, a);
}`;

export interface SlashPalette {
  edge: number;
  body: number;
  tail: number;
  /** restrained HDR boost on the razor outer rim (1.05..1.35) */
  hdr?: number;
}

const PAL: Record<string, SlashPalette> = {
  light:   { edge: 0xf4f9ff, body: 0x9ec0ec, tail: 0x486898, hdr: 1.18 },
  spin:    { edge: 0xf0fbff, body: 0x8cc8e8, tail: 0x3b6c8c, hdr: 1.2 },
  stab:    { edge: 0xffffff, body: 0xb8e0ff, tail: 0x5084b8, hdr: 1.25 },
  heavy:   { edge: 0xfff4d6, body: 0xff6b3d, tail: 0x982018, hdr: 1.32 },
  counter: { edge: 0xffffff, body: 0xffcf54, tail: 0xc96e14, hdr: 1.35 },
  iai:     { edge: 0xffffff, body: 0xffe08a, tail: 0xc88a28, hdr: 1.38 },
  dcut:    { edge: 0xf4fdff, body: 0x62ccff, tail: 0x246296, hdr: 1.26 },
  launch:  { edge: 0xf6fcff, body: 0x88dcff, tail: 0x306a9c, hdr: 1.24 },
  air:     { edge: 0xfff2f7, body: 0xff8ab4, tail: 0x9a3058, hdr: 1.24 },
  swoop:   { edge: 0xf4fff2, body: 0x76e09e, tail: 0x28704a, hdr: 1.24 },
};

function makeArcGeo(segs: number): THREE.BufferGeometry {
  const pos = new Float32Array((segs + 1) * 2 * 3);
  const uv = new Float32Array((segs + 1) * 2 * 2);
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    uv[i * 4 + 0] = u; uv[i * 4 + 1] = 0;
    uv[i * 4 + 2] = u; uv[i * 4 + 3] = 1;
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function writeArcVerts(g: THREE.BufferGeometry, segs: number, a0: number, a1: number, rIn: number, rOut: number) {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const a = a0 + (a1 - a0) * u;
    const s = Math.sin(a), c = Math.cos(a);
    p.setXYZ(i * 2 + 0, s * rIn, 0, c * rIn);
    p.setXYZ(i * 2 + 1, s * rOut, 0, c * rOut);
  }
  p.needsUpdate = true;
}

function makeLineGeo(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // Unit quad: x in [-0.5, 0.5] (width), z in [0, 1] (length forward)
  const pos = new Float32Array([
    -0.5, 0, 0,   0.5, 0, 0,
    -0.5, 0, 1,   0.5, 0, 1,
  ]);
  const uv = new Float32Array([
    0, 0,   0, 1,
    1, 0,   1, 1,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 1, 3, 2]);
  return g;
}

interface ArcSlot {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
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
  mat: THREE.ShaderMaterial;
  active: boolean;
  t: number;
  sweepDur: number;
  fadeDur: number;
}

const ARC_SEGS = 28;
const ARC_POOL = 6;
const LINE_POOL = 5;

function setCol(u: THREE.Color, hex: number, scale = 1) {
  u.setHex(hex).multiplyScalar(scale);
}

class SlashSystem {
  private arcs: ArcSlot[] = [];
  private lines: LineSlot[] = [];
  private arcCursor = 0;
  private lineCursor = 0;

  private ensureArcs() {
    if (this.arcs.length) return;
    for (let i = 0; i < ARC_POOL; i++) {
      const geo = makeArcGeo(ARC_SEGS);
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS,
        fragmentShader: ARC_FS,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        uniforms: {
          uEdgeCol: { value: new THREE.Color(0xffffff) },
          uBodyCol: { value: new THREE.Color(0xa0c8ff) },
          uTailCol: { value: new THREE.Color(0x406090) },
          uHead: { value: 1 },
          uTail: { value: 0 },
          uAlpha: { value: 1 },
          uStreak: { value: 1 },
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      scene.add(mesh);
      this.arcs.push({ mesh, geo, mat, active: false, t: 0, sweepDur: 0.055, holdDur: 0.04, fadeDur: 0.14, anchor: null, yOff: 0.95 });
    }
  }

  private ensureLines() {
    if (this.lines.length) return;
    const sharedGeo = makeLineGeo();
    for (let i = 0; i < LINE_POOL; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS,
        fragmentShader: LINE_FS,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        uniforms: {
          uEdgeCol: { value: new THREE.Color(0xffffff) },
          uBodyCol: { value: new THREE.Color(0xffe08a) },
          uTailCol: { value: new THREE.Color(0xc88a28) },
          uHead: { value: 1 },
          uTail: { value: 0 },
          uAlpha: { value: 1 },
          uLance: { value: 0 },
        },
      });
      const mesh = new THREE.Mesh(sharedGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
      scene.add(mesh);
      this.lines.push({ mesh, mat, active: false, t: 0, sweepDur: 0.045, fadeDur: 0.22 });
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

  /** Spawn a sculpted crescent blade arc aligned to the swing's real reach. */
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
    /** optional live position to follow slightly while sweeping */
    follow?: THREE.Vector3;
  }) {
    const s = this.pickArc();
    const pal = PAL[o.palette ?? 'light'] ?? PAL.light;
    const hdr = pal.hdr ?? 1.2;
    const rOut = Math.max(0.6, o.rOut);
    const rIn = Math.max(0.15, o.rIn ?? rOut * 0.48);
    writeArcVerts(s.geo, ARC_SEGS, o.a0, o.a1, rIn, rOut);

    const u = s.mat.uniforms;
    setCol(u.uEdgeCol.value, pal.edge, hdr);
    setCol(u.uBodyCol.value, pal.body, 1.0);
    setCol(u.uTailCol.value, o.bleed ? 0x8f1a1c : pal.tail, 1.0);
    // Start at 0.78 on the impact frame so hitstop freezes a full, bold crescent cutting through the target
    u.uHead.value = 0.78;
    u.uTail.value = 0;
    u.uAlpha.value = 1;
    u.uStreak.value = o.palette === 'heavy' || o.palette === 'counter' || o.palette === 'iai' ? 1.0 : 0.7;

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

  /** Spawn a razor-sharp linear slash ribbon or thrust lance along a → b. */
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
    const hdr = pal.hdr ?? 1.28;

    const u = s.mat.uniforms;
    setCol(u.uEdgeCol.value, pal.edge, hdr);
    setCol(u.uBodyCol.value, pal.body, 1.0);
    setCol(u.uTailCol.value, pal.tail, 1.0);
    u.uHead.value = o.lance ? 0.84 : 1.0;
    u.uTail.value = 0;
    u.uAlpha.value = 1;
    u.uLance.value = o.lance ? 1 : 0;

    s.mesh.position.set(o.a.x, (o.y ?? 0.98) + o.a.y, o.a.z);
    s.mesh.rotation.order = 'YXZ';
    s.mesh.rotation.set(0, yaw, o.tiltZ ?? 0);
    s.mesh.scale.set(o.width, 1, len);
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
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * 0.44, a0: -h, a1: h, y: 0.96, tiltZ: -0.14, palette: counter ? 'counter' : 'light', bleed, sweep: 0.05, hold: 0.035, fade: 0.13 });
    } else if (o.kind === 'k2') {
      const h = Math.min(1.6, Math.max(1.2, o.half + 0.18));
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * 0.44, a0: h, a1: -h, y: 1.0, tiltZ: 0.26, palette: counter ? 'counter' : 'light', bleed, sweep: 0.05, hold: 0.035, fade: 0.13 });
    } else if (o.kind === 'k3') {
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * (o.wide ? 0.48 : 0.54), a0: -Math.PI, a1: Math.PI + 0.35, y: 0.92, tiltZ: 0.06, palette: counter ? 'counter' : 'spin', bleed, sweep: 0.095, hold: 0.045, fade: 0.17 });
    } else if (o.kind === 'k4') {
      const second = (o.n ?? 1) > 1;
      const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
      const a = V3(at.x + fx * 0.35, y0, at.z + fz * 0.35);
      const b = V3(at.x + fx * (r + (second ? 0.65 : 0.3)), y0, at.z + fz * (r + (second ? 0.65 : 0.3)));
      this.line({ a, b, width: second ? 0.72 : 0.56, y: 1.0, palette: counter ? 'counter' : 'stab', lance: true, tiltZ: second ? -0.12 : 0.12, sweep: 0.035, fade: second ? 0.17 : 0.13 });
    } else if (o.kind === 'k5') {
      // Dramatic steep diagonal overhead cleave + low follow-through arc
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r * 1.06, rIn: r * 0.34, a0: -1.45, a1: 1.25, y: 1.08, tiltX: 0.18, tiltZ: -1.08, palette: counter ? 'counter' : 'heavy', bleed, sweep: 0.06, hold: 0.065, fade: 0.22 });
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r * 0.98, rIn: r * 0.56, a0: -1.2, a1: 1.2, y: 0.48, tiltZ: -0.08, palette: counter ? 'counter' : 'heavy', bleed, sweep: 0.055, hold: 0.05, fade: 0.18 });
    } else if (o.kind === 'launch') {
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * 0.4, a0: 1.25, a1: -1.35, y: 0.95, tiltX: -0.15, tiltZ: 1.15, palette: 'launch', sweep: 0.055, hold: 0.045, fade: 0.18 });
    } else if (o.kind === 'acut' || o.kind === 'acutF') {
      const last = o.kind === 'acutF';
      const n = o.n ?? 1;
      const tilt = last ? -1.12 : n === 1 ? -0.45 : 0.45;
      const a0 = n === 2 ? 1.35 : -1.35;
      this.arc({ at, follow: o.follow, yaw: o.yaw, rOut: r, rIn: r * 0.42, a0, a1: -a0, y: 0.92, tiltZ: tilt, palette: last ? 'heavy' : 'air', sweep: 0.045, hold: 0.03, fade: last ? 0.19 : 0.13 });
    }
  }

  /** Clear all active ribbons on room change / reset. */
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
      const head = Math.min(1, 0.78 + 0.22 * (s.t / Math.max(0.001, s.sweepDur)));
      const tailStart = s.sweepDur + s.holdDur;
      const kFade = Math.max(0, (s.t - tailStart) / Math.max(0.001, s.fadeDur));
      if (kFade >= 1) { s.active = false; s.mesh.visible = false; s.anchor = null; continue; }
      const easeTail = kFade * kFade;
      u.uHead.value = head;
      u.uTail.value = easeTail * 0.92;
      u.uAlpha.value = 1 - kFade * 0.85;
    }
    for (const s of this.lines) {
      if (!s.active) continue;
      s.t += dt;
      const u = s.mat.uniforms;
      const head = Math.min(1, 0.84 + 0.16 * (s.t / Math.max(0.001, s.sweepDur)));
      const kFade = Math.max(0, (s.t - s.sweepDur) / Math.max(0.001, s.fadeDur));
      if (kFade >= 1) { s.active = false; s.mesh.visible = false; continue; }
      u.uHead.value = head;
      u.uTail.value = kFade * kFade * 0.75;
      u.uAlpha.value = 1 - kFade;
    }
  }
}

export const slashArc = new SlashSystem();
onUpdate(dt => slashArc.update(dt));
