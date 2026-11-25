// The UI-layer 3D scene (look/pixel.ts UI3D) at the screen's native resolution, in every render mode (UX_V3 §6: "UI 不走像素低清").
// The UI scene renders into its own full-resolution target (MSAA when the GPU can, HDR, transparent background), gets a light bloom of
// its own (lamp / glow materials with values > 1 shine: gold rims, cyan rings, crystal icons), a scaled warm-black contour and a soft
// offset shadow over the world (premultiplied alpha). Floating text (UiText) is still drawn after this.
import { QUALITY, mobileTargets } from './quality';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Ui3DLayer } from './pixel';
import { UI_LOOK } from './uiLook';
import { bloomMips, bloom8bit } from './bloomMips';
import { OPT } from '../engine/perfOpts';
import { CRAFTU } from './craft';
export { UI_LOOK } from './uiLook';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FS = `precision highp float;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tBloom; uniform vec2 uRes; uniform float uExposure, uInk, uInkW, uBloom; uniform vec3 uInkCol; varying vec2 vUv;
uniform vec2 uShadowOffset; uniform float uShadowBlur, uShadowStrength, uSeparate, uFastUi;
// 超出屏幕的 alpha 为零，避免边缘 clamp 把裁切的 UI 拉成长条阴影。
float coverage(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return clamp(texture2D(tColor, uv).a, 0.0, 1.0);
}
float shadowMask() {
  vec2 p = vUv - uShadowOffset / uRes, d = uShadowBlur / uRes;
  if (uFastUi > 1.5) return coverage(p);
  if (uFastUi > 0.5) {
    float a = coverage(p) * 4.0;
    a += (coverage(p + d) + coverage(p - d)
        + coverage(p + vec2(d.x, -d.y)) + coverage(p + vec2(-d.x, d.y))) * 1.5;
    return a / 10.0;
  }
  float a = coverage(p) * 4.0;
  a += (coverage(p + vec2(d.x, 0.0)) + coverage(p - vec2(d.x, 0.0))
      + coverage(p + vec2(0.0, d.y)) + coverage(p - vec2(0.0, d.y))) * 2.0;
  a += coverage(p + d) + coverage(p - d)
     + coverage(p + vec2(d.x, -d.y)) + coverage(p + vec2(-d.x, d.y));
  return a / 16.0;
}
vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec4 c = texture2D(tColor, vUv); float a = c.a;
  // the target holds premultiplied colour over a clear background (opaque models a = 1, glass a < 1, additive sparks a ≈ 0):
  // tone map the straight colour, then premultiply again
  vec3 col = a > 0.02 ? toSRGB(aces(c.rgb / a * uExposure)) * a : toSRGB(aces(c.rgb * uExposure));
  // contour: a pixel just outside a solid UI model (depth written by solid parts only, so sparks get no ring)
  float ink = 0.0;
  if (uInk > 0.0 && uInkW > 0.0 && texture2D(tDepth, vUv).r >= 0.99999) {
    vec2 px = uInkW / uRes; float cov = 0.0;
    cov = max(cov, step(texture2D(tDepth, vUv + vec2(px.x, 0.0)).r, 0.99999)); cov = max(cov, step(texture2D(tDepth, vUv - vec2(px.x, 0.0)).r, 0.99999));
    cov = max(cov, step(texture2D(tDepth, vUv + vec2(0.0, px.y)).r, 0.99999)); cov = max(cov, step(texture2D(tDepth, vUv - vec2(0.0, px.y)).r, 0.99999));
    if (uSeparate > 0.5 && uFastUi < 0.5) {
      vec2 dg = px * 0.70710678;
      cov = max(cov, step(texture2D(tDepth, vUv + dg).r, 0.99999)); cov = max(cov, step(texture2D(tDepth, vUv - dg).r, 0.99999));
      cov = max(cov, step(texture2D(tDepth, vUv + vec2(dg.x, -dg.y)).r, 0.99999)); cov = max(cov, step(texture2D(tDepth, vUv + vec2(-dg.x, dg.y)).r, 0.99999));
    }
    ink = cov * uInk;
  }
  if (uSeparate > 0.5) {
    // 描边放在 UI 后面，半透明边缘也保留原有前景颜色。
    col += uInkCol * ink * (1.0 - a); a += ink * (1.0 - a);
  } else { col = col * (1.0 - ink) + uInkCol * ink; a = max(a, ink); }
  // the UI's own glow spills over the world (added light, no coverage; skipped when bloom is off)
  vec3 bl = vec3(0.0);
  if (uBloom > 0.001) {
    vec4 bt = texture2D(tBloom, vUv);
    bl = toSRGB(clamp(bt.rgb * bt.a * uBloom, 0.0, 1.0));
  }
  // 预乘合成：背景系数 = (1 - UI alpha) × (1 - 投影)，前景不透明像素直接跳过投影采样。
  float shade = (uShadowStrength > 0.0 && a < 0.99) ? shadowMask() * uShadowStrength : 0.0;
  gl_FragColor = vec4(col + bl, a + (1.0 - a) * shade);
}`;

/** most screen rectangles the UI composite is cut into (more top-level UI groups than this: the whole screen) */
const RMAX = 48;
export class UiPass {
  calls = 0;
  rt: THREE.WebGLRenderTarget; bloom: UnrealBloomPass | null = null; mat: THREE.ShaderMaterial; qs = new THREE.Scene(); cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private cc = new THREE.Color(); private W = 4; private H = 4; private hdr: boolean;
  private bloomSize = { w: 128, h: 128 };
  private ensureBloom(): UnrealBloomPass {
    if (this.bloom) return this.bloom;
    const b = new UnrealBloomPass(new THREE.Vector2(this.bloomSize.w, this.bloomSize.h), 1, UI_LOOK.bloomRadius, UI_LOOK.bloomThreshold);
    if (!this.hdr) bloom8bit(b);
    this.bloom = b;
    return b;
  }
  constructor(private renderer: THREE.WebGLRenderer, msaa: number, hdr = true) {
    this.hdr = hdr;
    const rtType = hdr && !mobileTargets() ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: rtType, depthTexture: new THREE.DepthTexture(4, 4), samples: msaa });
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      uniforms: { tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture }, tBloom: { value: null as THREE.Texture | null }, uRes: { value: new THREE.Vector2(4, 4) },
        uExposure: { value: 1 }, uInk: { value: 0 }, uInkW: { value: 1 }, uBloom: { value: 1 }, uInkCol: { value: new THREE.Color(0.03, 0.02, 0.05) },
        uShadowOffset: { value: new THREE.Vector2() }, uShadowBlur: { value: 0 }, uShadowStrength: { value: 0 }, uSeparate: { value: 1 }, uFastUi: { value: 0 } } });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); q.frustumCulled = false; this.qs.add(q);
  }
  setSize(W: number, H: number, samples = this.rt.samples) {
    const wantType = this.hdr && !mobileTargets() ? THREE.HalfFloatType : THREE.UnsignedByteType;
    if (this.rt.samples !== samples || this.rt.texture.type !== wantType) { this.rt.samples = samples; this.rt.texture.type = wantType; this.rt.dispose(); }
    this.W = W; this.H = H; this.rt.setSize(W, H);
    this.bloomSize = { w: mobileTargets() || !this.hdr ? 1 : Math.max(1, Math.round(W / 2)), h: mobileTargets() || !this.hdr ? 1 : Math.max(1, Math.round(H / 2)) };
    this.bloom?.setSize(this.bloomSize.w, this.bloomSize.h);
    (this.mat.uniforms.uRes.value as THREE.Vector2).set(W, H);
  }
  /** draw the UI layer over whatever is on screen now */
  render(L: Ui3DLayer) {
    if (OPT.uiScissor && L.scene.children.every(c => !c.visible)) { this.calls = 0; return; }
    const r = this.renderer, u = this.mat.uniforms, ca = r.getClearAlpha(), before = r.info.render.calls; r.getClearColor(this.cc);
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear();
    // isolate the 3D UI layer completely from world craft/polish shaders (zero impact on buttons, HUD or 3D icons)
    const prevCraft = CRAFTU.uCraft.value, prevPolish = CRAFTU.uPxPolish.value; CRAFTU.uCraft.value = 0; CRAFTU.uPxPolish.value = 0;
    try { r.render(L.scene, L.camera); } finally { CRAFTU.uCraft.value = prevCraft; CRAFTU.uPxPolish.value = prevPolish; }
    r.setClearColor(this.cc, ca);
    const bOn = !mobileTargets() && this.hdr && UI_LOOK.bloom > 0;
    if (bOn) {
      const bloom = this.ensureBloom();
      bloom.strength = 1; bloom.radius = UI_LOOK.bloomRadius; bloom.threshold = UI_LOOK.bloomThreshold;
      // the bloom is not blended back into the UI target: the composite reads the blurred mips and adds them over the world
      // (11-18 微信帧率: so the bloom stops at the mips; the blend it used to end with, at opacity 0, drew the whole screen for nothing)
      u.tBloom.value = bloomMips(bloom, r, this.rt);
    }
    u.uBloom.value = bOn ? UI_LOOK.bloom : 0; if (!bOn) u.tBloom.value = this.rt.texture;
    const p = UI_LOOK, scale = this.H / 720, on = p.enabled;
    u.uExposure.value = p.exposure * (L.exposure ?? 1);
    u.uInk.value = on ? THREE.MathUtils.clamp(p.ink, 0, 1) : 0.55;
    u.uInkW.value = on ? Math.max(0, p.inkW) * scale : (this.W > 2200 ? 2 : 1);
    if (on) (u.uInkCol.value as THREE.Color).copy(p.inkColor);
    else (u.uInkCol.value as THREE.Color).setRGB(0.03, 0.02, 0.05);
    (u.uShadowOffset.value as THREE.Vector2).set(p.shadowX * scale, -p.shadowY * scale);
    u.uShadowBlur.value = Math.max(0, p.shadowBlur) * scale;
    u.uShadowStrength.value = on ? THREE.MathUtils.clamp(p.shadowStrength, 0, 1) : 0;
    u.uSeparate.value = on ? 1 : 0;
    u.uFastUi.value = mobileTargets() ? (QUALITY.tier === 'low' ? 2 : 1) : 0;
    const ac = r.autoClear; r.autoClear = false; r.setRenderTarget(null);
    // 11-18 微信帧率: the composite (≈17 texture reads a pixel) only where the UI is: the screen bounds of each top-level UI group,
    // grown by a margin for its contour, drop shadow and glow, drawn as one mesh of quads; where quads overlap the depth test lets
    // a pixel through once (the blend is not idempotent). The whole screen when the UI covers most of it.
    const n = OPT.uiScissor ? this.rects(L) : -1;
    if (n < 0) r.render(this.qs, this.cam);
    else if (n > 0) { r.clearDepth(); r.render(this.rs, this.cam); }
    this.calls = r.info.render.calls - before; r.autoClear = ac;
  }
  private sz = new THREE.Vector2(); private box = new THREE.Box3(); private v = new THREE.Vector3();
  /** the rectangles' mesh (up to RMAX quads in clip space; the composite's uniforms, depth-tested so overlaps draw once) */
  private rs = new THREE.Scene(); private rg = new THREE.BufferGeometry();
  private rp = new Float32Array(RMAX * 12); private ru = new Float32Array(RMAX * 8);
  private initRects() {
    const idx = new Uint16Array(RMAX * 6); for (let i = 0; i < RMAX; i++) idx.set([0, 1, 2, 0, 2, 3].map(k => k + i * 4), i * 6);
    this.rg.setAttribute('position', new THREE.BufferAttribute(this.rp, 3)); this.rg.setAttribute('uv', new THREE.BufferAttribute(this.ru, 2)); this.rg.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = this.mat.clone(); m.uniforms = this.mat.uniforms; m.depthTest = true; m.depthWrite = true; m.depthFunc = THREE.LessDepth;
    const q = new THREE.Mesh(this.rg, m); q.frustumCulled = false; this.rs.add(q);
  }
  /** fill the rectangles' mesh with what the UI covers now; returns how many (−1 = draw the whole screen) */
  private rects(L: Ui3DLayer): number {
    if (!this.rg.index) this.initRects();
    const r = this.renderer; r.getSize(this.sz); const W = this.sz.x, H = this.sz.y, cam = L.camera;
    // (11-19 用户：「光是个大方块，看起来像个bug」: a lit button's glow spread past its rectangle and was cut off square — the margin
    //  covers the bloom's reach when it is on)
    const m = H * (!mobileTargets() && this.hdr && UI_LOOK.bloom > 0 ? 0.16 : 0.06);
    let n = 0, area = 0;
    for (const top of L.scene.children) {
      if (!top.visible) continue;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, whole = false;
      top.traverseVisible(o => {
        const g = (o as THREE.Mesh).geometry; if (whole || o.name === 'rigidBatch' || !g || !((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite)) return;
        if (!g.boundingBox) g.computeBoundingBox();
        const b = this.box.copy(g.boundingBox!).applyMatrix4(o.matrixWorld);
        for (let i = 0; i < 8; i++) {
          this.v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
          if (!isFinite(this.v.x) || Math.abs(this.v.z) > 1.0001) { whole = true; return; }
          const sx = (this.v.x + 1) / 2 * W, sy = (this.v.y + 1) / 2 * H;
          if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
        }
      });
      if (whole || n >= RMAX) return -1;
      if (x1 < x0) continue;
      x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W, x1 + m); y1 = Math.min(H, y1 + m);
      if (x1 <= x0 || y1 <= y0) continue;
      area += (x1 - x0) * (y1 - y0);
      const X0 = x0 / W * 2 - 1, X1 = x1 / W * 2 - 1, Y0 = y0 / H * 2 - 1, Y1 = y1 / H * 2 - 1;
      this.rp.set([X0, Y0, 0, X1, Y0, 0, X1, Y1, 0, X0, Y1, 0], n * 12);
      this.ru.set([x0 / W, y0 / H, x1 / W, y0 / H, x1 / W, y1 / H, x0 / W, y1 / H], n * 8);
      n++;
    }
    if (area > W * H * 0.8) return -1;
    this.rg.attributes.position.needsUpdate = true; this.rg.attributes.uv.needsUpdate = true; this.rg.setDrawRange(0, n * 6);
    return n;
  }
}
