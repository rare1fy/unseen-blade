// Post pipeline: scene → HDR target (+ depth) → bloom (added in place) → final pass to screen:
// depth-edge ink outlines, colour grade, vignette, impact flash / chromatic split, ACES tone map, sRGB.
// Pixel look (look/pixel.ts): the HDR target is the low-res art buffer (CSS px / PX.size), the final pass writes a low-res LDR
// target with 1-art-pixel silhouette outlines, and a last pass blows it up to the screen with nearest sampling.
// At 1 CSS px per art pixel (the default since R5, "高清体素") and in the standard look the HDR target is multisampled (MSAA ×4 when the
// GPU can), and the bloom stays smooth. The UI-layer 3D scene is always drawn at native resolution on top (look/uiPass.ts).
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { PX, PXU, UI3D, pxLightsBegin, pxLightsEnd, liftOverlays, drawOverlays } from './pixel';
import { UiPass } from './uiPass';
import { UI_SCENE_GLSL, uiSceneUniforms, updateUiSceneUniforms } from './uiLook';
import { PADD } from '../engine/particles';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FS = (pixel: boolean) => `
precision highp float;
${pixel ? '#define PIXEL' : ''}
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tBloom; uniform vec2 uRes; uniform float uNear, uFar, uBloomCap;
uniform vec3 uFog; uniform float uBands; uniform float uInk, uInkT, uExposure, uSat, uVig, uFlash, uSplit, uTime, uDesat, uCurve; uniform vec3 uFlashCol, uLift, uGain, uInkCol;
varying vec2 vUv;
${UI_SCENE_GLSL}
float lin(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 px = 1.0 / uRes;
  // chromatic split on big impacts (radial)
  vec2 dir = (vUv - 0.5) * uSplit * 0.012;
#ifdef PIXEL
  dir = floor(dir * uRes + 0.5) * px;   // whole art pixels
#endif
  vec3 col = vec3(texture2D(tColor, vUv + dir).r, texture2D(tColor, vUv).g, texture2D(tColor, vUv - dir).b);
#ifdef PIXEL
  // the bloom arrives separately: capped (big bursts never white the screen out) and stepped into bands (pixel halos)
  vec4 bt = texture2D(tBloom, vUv);   // UnrealBloom blends rgb × alpha (alpha = strength × mip weights), same here
  vec3 bl = min(bt.rgb * bt.a, vec3(uBloomCap)); float bm = max(bl.r, max(bl.g, bl.b));
  if (uBands > 0.5) {
    float bq = floor(bm * uBands / uBloomCap + 0.5) / uBands * uBloomCap;   // rounded, so the halo keeps its energy
    bq = max(bq, min(bm, 0.5 * uBloomCap / uBands));                         // the faint outer haze stays smooth
    col += bl * bq / max(bm, 1e-4);
  } else col += bl;   // 1× art pixels: a smooth halo (stepped bands read as rings at full resolution)
#endif
  float d0 = lin(texture2D(tDepth, vUv).r);
  float dl = lin(texture2D(tDepth, vUv - vec2(px.x,0.0)).r), dr = lin(texture2D(tDepth, vUv + vec2(px.x,0.0)).r);
  float du = lin(texture2D(tDepth, vUv + vec2(0.0,px.y)).r), dd = lin(texture2D(tDepth, vUv - vec2(0.0,px.y)).r);
#ifdef PIXEL
  // 1-art-pixel silhouette outline, drawn just outside the nearer surface (like an inverted hull): this pixel is ink when a
  // 4-neighbour is clearly nearer AND that nearer surface is at least 3 art px thick in that direction, so solid bodies get a
  // contour while grass blades, fence bars and twigs (1-2 px) stay clean instead of turning into black speckle. Fog and
  // distance thin the line the way they thin the body it belongs to.
  float ink = 0.0, dn = d0;
  for (int i = 0; i < 4; i++) {
    vec2 o = i == 0 ? vec2(-px.x, 0.0) : i == 1 ? vec2(px.x, 0.0) : i == 2 ? vec2(0.0, px.y) : vec2(0.0, -px.y);
    float d1 = i == 0 ? dl : i == 1 ? dr : i == 2 ? du : dd;
    if ((d0 - d1) / max(d1, 0.001) < uInkT) continue;
    float d2 = lin(texture2D(tDepth, vUv + 2.0 * o).r), d3 = lin(texture2D(tDepth, vUv + 3.0 * o).r);
    if (abs(d2 - d1) < d1 * 0.06 && abs(d3 - d1) < d1 * 0.1) { ink = 1.0; dn = min(dn, d1); }
  }
  float fogK = uFog.x > 0.0 ? 1.0 - exp(-uFog.x * uFog.x * dn * dn) : uFog.z > uFog.y ? smoothstep(uFog.y, uFog.z, dn) : 0.0;
  ink *= uInk * (1.0 - smoothstep(34.0, 64.0, dn)) * (1.0 - 0.85 * fogK);   // applied after the grade: a fixed near-black
#else
  // ink outlines from linear depth discontinuities (relative, so far things get thin lines and near things bold ones)
  float edge = max(max(abs(dl - d0), abs(dr - d0)), max(abs(du - d0), abs(dd - d0))) / max(d0, 0.001);
  float ink = smoothstep(0.03, 0.09, edge) * uInk * (1.0 - smoothstep(30.0, 60.0, d0));
  col = mix(col, uInkCol * (0.6 + 0.4 * col), ink);
#endif
  // grade
  col *= uExposure;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat * (1.0 - uDesat));
  col = aces(col);
  col = col * uGain + uLift * (1.0 - col);
  col = mix(col, col * col * (3.0 - 2.0 * col), uCurve);
#ifdef PIXEL
  col = mix(col, uInkCol * 0.25, ink);
#endif
  // vignette
  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y * 0.75;
  col *= 1.0 - uVig * smoothstep(0.25, 0.85, length(q));
  // flash
  col = mix(col, uFlashCol, uFlash);
  col = toSRGB(clamp(col, 0.0, 1.0));
  col = separateUiBackground(col, vUv);
  col += (hash(vUv * uRes + uTime) - 0.5) / 255.0;   // dither against banding
  gl_FragColor = vec4(col, 1.0);
}`;
// the art buffer → screen: whole device pixels per art pixel, centred (the < 1 art px remainder is cropped evenly)
const BLIT_FS = `precision highp float; uniform sampler2D tLo; uniform vec2 uLoRes, uOff; uniform float uK;
void main(){ vec2 p = floor((gl_FragCoord.xy - uOff) / uK); gl_FragColor = texture2D(tLo, (clamp(p, vec2(0.0), uLoRes - 1.0) + 0.5) / uLoRes); }`;

export const GRADE = {
  ink: 0.85, exposure: 1.05, sat: 1.12, vig: 0.55, desat: 0,
  lift: new THREE.Color(0.02, 0.015, 0.05), gain: new THREE.Color(1.0, 0.98, 1.02), inkCol: new THREE.Color(0.05, 0.03, 0.08),
  flash: 0, flashCol: new THREE.Color(1, 1, 1), split: 0,
  bloomStrength: 0.85, bloomRadius: 0.55, bloomThreshold: 1.05,   // 2026-11-13: only real glows bloom, not white cloth
};

const uniforms = () => ({
  ...uiSceneUniforms(),
  tColor: { value: null as THREE.Texture | null }, tDepth: { value: null as THREE.Texture | null }, tBloom: { value: null as THREE.Texture | null }, uBloomCap: { value: 0.7 }, uBands: { value: 6 }, uRes: { value: new THREE.Vector2(4, 4) }, uNear: { value: 0.1 }, uFar: { value: 400 },
  uInk: { value: 1 }, uInkT: { value: 0.05 }, uFog: { value: new THREE.Vector3() }, uExposure: { value: 1 }, uSat: { value: 1 }, uVig: { value: 0.5 }, uFlash: { value: 0 }, uSplit: { value: 0 }, uTime: { value: 0 }, uDesat: { value: 0 }, uCurve: { value: 0 },
  uFlashCol: { value: new THREE.Color() }, uLift: { value: new THREE.Color() }, uGain: { value: new THREE.Color(1, 1, 1) }, uInkCol: { value: new THREE.Color() },
});

/** the art rows at pixel size 1 on a high-density screen (2× ≈ 450 rows, 3× ≈ 300): a 1080p desktop window's look */
export const PX_ROWS = 900;
export class Post {
  rt: THREE.WebGLRenderTarget; bloom: UnrealBloomPass; mat: THREE.ShaderMaterial; quad: THREE.Mesh; cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); qs = new THREE.Scene();
  /** pixel look: the final pass of the standard look and of the pixel look, the low-res LDR target and the upscale */
  matStd: THREE.ShaderMaterial; matPx: THREE.ShaderMaterial; lo: THREE.WebGLRenderTarget; blit: THREE.ShaderMaterial; bs = new THREE.Scene();
  /** art pixel size in CSS px (0 = standard look) */
  pixel = 0;
  /** MSAA samples the GPU allows on the HDR targets (0 = none: no WebGL2 / no float colour buffers) */
  readonly msaa: number;
  /** the UI-layer 3D scene at native resolution (look/uiPass.ts) */
  ui: UiPass;
  private size = { w: 4, h: 4, dpr: 1 };
  constructor(private renderer: THREE.WebGLRenderer) {
    const cap = renderer.capabilities, ext = renderer.extensions;
    this.msaa = cap.isWebGL2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')) ? Math.min(4, cap.maxSamples || 0) : 0;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(4, 4), samples: 0 });
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), GRADE.bloomStrength, GRADE.bloomRadius, GRADE.bloomThreshold);
    const mk = (pixel: boolean) => {
      const u = uniforms(); u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture;
      return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS(pixel), depthTest: false, depthWrite: false, uniforms: u });
    };
    this.matStd = this.mat = mk(false); this.matPx = mk(true);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); this.quad.frustumCulled = false; this.qs.add(this.quad);
    this.lo = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
    this.blit = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: BLIT_FS, depthTest: false, depthWrite: false,
      uniforms: { tLo: { value: this.lo.texture }, uLoRes: { value: new THREE.Vector2(4, 4) }, uOff: { value: new THREE.Vector2() }, uK: { value: 2 } } });
    const bq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blit); bq.frustumCulled = false; this.bs.add(bq);
    this.ui = new UiPass(renderer, this.msaa);
  }
  setSize(w: number, h: number, dpr: number) {
    this.size = { w, h, dpr };
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    // MSAA on the HDR target only where art pixels are screen pixels (1×, standard); chunky art pixels stay hard-edged
    // (high-DPI screens alias less and pay more per sample: ×2 there)
    const msx = dpr >= 1.75 ? Math.min(2, this.msaa) : this.msaa, ms = this.pixel <= 1 ? msx : 0;
    if (this.rt.samples !== ms) { this.rt.samples = ms; this.rt.dispose(); }
    if (this.pixel > 0) {
      // art buffer: PX.size CSS px per art pixel (device px per art px = size × dpr), a little larger than the screen, centred
      // device px per art pixel. A plain screen (dpr < 1.5): whole multiples of the CSS pixel, as always. A high-density screen
      // (phones, 2× laptops): sized from the screen's height so the picture has PX_ROWS / size rows whatever the screen — the
      // same pixel feel as a desktop window (act-17 用户：「手机上看2x像素又太糊了，可以让我在电脑端和手机端看起来像素感一致吗」;
      // a phone is only ~390 CSS px tall, so 2 CSS px a pixel left it with ~195 rows)
      const k = dpr < 1.5 ? this.pixel * dpr : Math.max(1, H * this.pixel / PX_ROWS), Wa = Math.max(1, Math.ceil(W / k)), Ha = Math.max(1, Math.ceil(H / k));
      this.rt.setSize(Wa, Ha); this.lo.setSize(Wa, Ha); this.bloom.setSize(Wa, Ha);
      (this.matPx.uniforms.uRes.value as THREE.Vector2).set(Wa, Ha);
      const bu = this.blit.uniforms; (bu.uLoRes.value as THREE.Vector2).set(Wa, Ha); bu.uK.value = k; (bu.uOff.value as THREE.Vector2).set((W - Wa * k) / 2, (H - Ha * k) / 2);
      PXU.uArtH.value = Ha;
    } else {
      this.rt.setSize(W, H); this.bloom.setSize(Math.round(W / 2), Math.round(H / 2));
      PXU.uArtH.value = H;
    }
    (this.matStd.uniforms.uRes.value as THREE.Vector2).set(W, H);
    this.ui.setSize(W, H, msx);
  }
  /** switch the pixel look (0 = standard, else CSS px per art pixel) */
  setPixel(n: number) { if (n === this.pixel) return; this.pixel = n; this.setSize(this.size.w, this.size.h, this.size.dpr); }
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number) {
    const r = this.renderer, pix = this.pixel > 0, m = pix ? this.matPx : this.matStd, u = m.uniforms;
    updateUiSceneUniforms(u, !!UI3D.layer?.on);
    // busy screens (many additive particles) pull the bloom back in the pixel look (the reference's FXB)
    const busy = pix ? Math.min(1, Math.max(0, ((PADD?.n ?? 0) - 450) / 900)) : 0;
    r.setRenderTarget(this.rt); r.clear();
    if (pix) { pxLightsBegin(scene); liftOverlays(scene); }
    r.render(scene, camera);
    if (pix) pxLightsEnd();
    this.bloom.strength = GRADE.bloomStrength * (1 - PX.busyDim * busy); this.bloom.radius = GRADE.bloomRadius; this.bloom.threshold = GRADE.bloomThreshold;
    // pixel look: the bloom is not blended in place; the final pass reads the composite, caps it and (at ≥ 2× art pixels) steps it into bands
    (this.bloom as unknown as { copyUniforms: Record<string, THREE.IUniform> }).copyUniforms.opacity.value = pix ? 0 : 1;
    this.bloom.render(r, null as unknown as THREE.WebGLRenderTarget, this.rt, 0, false);
    if (pix) { u.tBloom.value = (this.bloom as unknown as { renderTargetsHorizontal: THREE.WebGLRenderTarget[] }).renderTargetsHorizontal[0].texture; u.uBloomCap.value = PX.bloomCap; u.uBands.value = this.pixel >= 2 ? PX.bands : 0; }
    const fog = scene.fog as (THREE.Fog & THREE.FogExp2) | null;   // x: exp2 density, y/z: linear near / far
    (u.uFog.value as THREE.Vector3).set(fog && (fog as THREE.FogExp2).isFogExp2 ? fog.density : 0, fog && (fog as THREE.Fog).isFog ? fog.near : 0, fog && (fog as THREE.Fog).isFog ? fog.far : 0);
    u.uNear.value = camera.near; u.uFar.value = camera.far; u.uInk.value = pix ? (this.pixel >= 2 ? PX.ink : PX.ink1) : GRADE.ink; u.uInkT.value = PX.inkT;
    u.uExposure.value = GRADE.exposure * (pix ? (this.pixel >= 2 ? PX.exposure : PX.exposure1) : 1); u.uSat.value = GRADE.sat * (pix ? PX.sat : 1); u.uVig.value = GRADE.vig * (pix ? PX.vig : 1); u.uCurve.value = pix ? PX.curve : 0;
    u.uFlash.value = GRADE.flash; u.uSplit.value = GRADE.split; u.uTime.value = time % 100; u.uDesat.value = GRADE.desat;
    (u.uFlashCol.value as THREE.Color).copy(GRADE.flashCol); (u.uLift.value as THREE.Color).copy(GRADE.lift); (u.uGain.value as THREE.Color).copy(GRADE.gain); (u.uInkCol.value as THREE.Color).copy(GRADE.inkCol);
    this.quad.material = m;
    if (!pix) { r.setRenderTarget(null); r.render(this.qs, this.cam); }
    else {
      r.setRenderTarget(this.lo); r.render(this.qs, this.cam);
      r.setRenderTarget(null); r.render(this.bs, this.cam);
      drawOverlays(r, scene, camera);
    }
    // the UI-layer 3D scene: always at native resolution, over the finished world frame
    const L = UI3D.layer; if (L && L.on) this.ui.render(L);
  }
}
