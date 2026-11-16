// The UI-layer 3D scene (look/pixel.ts UI3D) at the screen's native resolution, in every render mode (UX_V3 §6: "UI 不走像素低清").
// The UI scene renders into its own full-resolution target (MSAA when the GPU can, HDR, transparent background), gets a light bloom of
// its own (lamp / glow materials with values > 1 shine: gold rims, cyan rings, crystal icons), a scaled warm-black contour and a soft
// offset shadow over the world (premultiplied alpha). Floating text (UiText) is still drawn after this.
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Ui3DLayer } from './pixel';
import { UI_LOOK } from './uiLook';
export { UI_LOOK } from './uiLook';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FS = `precision highp float;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tBloom; uniform vec2 uRes; uniform float uExposure, uInk, uInkW, uBloom; uniform vec3 uInkCol; varying vec2 vUv;
uniform vec2 uShadowOffset; uniform float uShadowBlur, uShadowStrength, uSeparate;
// 超出屏幕的 alpha 为零，避免边缘 clamp 把裁切的 UI 拉成长条阴影。
float coverage(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return clamp(texture2D(tColor, uv).a, 0.0, 1.0);
}
float shadowMask() {
  vec2 p = vUv - uShadowOffset / uRes, d = uShadowBlur / uRes;
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
    if (uSeparate > 0.5) {
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
  // the UI's own glow spills over the world (added light, no coverage)
  vec4 bt = texture2D(tBloom, vUv); vec3 bl = toSRGB(clamp(bt.rgb * bt.a * uBloom, 0.0, 1.0));
  // 预乘合成：背景系数 = (1 - UI alpha) × (1 - 投影)，前景 RGB 完全不乘投影。
  float shade = uShadowStrength > 0.0 ? shadowMask() * uShadowStrength : 0.0;
  gl_FragColor = vec4(col + bl, a + (1.0 - a) * shade);
}`;

export class UiPass {
  rt: THREE.WebGLRenderTarget; bloom: UnrealBloomPass; mat: THREE.ShaderMaterial; qs = new THREE.Scene(); cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private cc = new THREE.Color(); private W = 4; private H = 4;
  constructor(private renderer: THREE.WebGLRenderer, msaa: number) {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(4, 4), samples: msaa });
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(128, 128), 1, UI_LOOK.bloomRadius, UI_LOOK.bloomThreshold);
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      uniforms: { tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture }, tBloom: { value: null as THREE.Texture | null }, uRes: { value: new THREE.Vector2(4, 4) },
        uExposure: { value: 1 }, uInk: { value: 0 }, uInkW: { value: 1 }, uBloom: { value: 1 }, uInkCol: { value: new THREE.Color(0.03, 0.02, 0.05) },
        uShadowOffset: { value: new THREE.Vector2() }, uShadowBlur: { value: 0 }, uShadowStrength: { value: 0 }, uSeparate: { value: 1 } } });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); q.frustumCulled = false; this.qs.add(q);
  }
  setSize(W: number, H: number, samples = this.rt.samples) {
    if (this.rt.samples !== samples) { this.rt.samples = samples; this.rt.dispose(); }
    this.W = W; this.H = H; this.rt.setSize(W, H); this.bloom.setSize(Math.max(1, Math.round(W / 2)), Math.max(1, Math.round(H / 2)));
    (this.mat.uniforms.uRes.value as THREE.Vector2).set(W, H);
  }
  /** draw the UI layer over whatever is on screen now */
  render(L: Ui3DLayer) {
    const r = this.renderer, u = this.mat.uniforms, ca = r.getClearAlpha(); r.getClearColor(this.cc);
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear(); r.render(L.scene, L.camera); r.setClearColor(this.cc, ca);
    const bOn = UI_LOOK.bloom > 0;
    if (bOn) {
      this.bloom.strength = 1; this.bloom.radius = UI_LOOK.bloomRadius; this.bloom.threshold = UI_LOOK.bloomThreshold;
      // the bloom is not blended back into the UI target: the composite reads the blurred mips and adds them over the world
      const cu = (this.bloom as unknown as { copyUniforms: Record<string, THREE.IUniform> }).copyUniforms; cu.opacity.value = 0;
      this.bloom.render(r, null as unknown as THREE.WebGLRenderTarget, this.rt, 0, false);
      u.tBloom.value = (this.bloom as unknown as { renderTargetsHorizontal: THREE.WebGLRenderTarget[] }).renderTargetsHorizontal[0].texture;
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
    const ac = r.autoClear; r.autoClear = false; r.setRenderTarget(null); r.render(this.qs, this.cam); r.autoClear = ac;
  }
}
