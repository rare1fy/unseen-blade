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
import { gpuMark } from '../engine/gpuTime';
import { bloomMips, bloom8bit, halfFloatOk } from './bloomMips';
import { QUALITY, lowTargets, mobileTargets, tierNow } from './quality';
import { CRAFT, CRAFTU, PX_POLISH, syncCraftUniforms } from './craft';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BLIT_VS = `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FS = (pixel: boolean) => `
precision highp float;
${pixel ? '#define PIXEL' : ''}
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tBloom; uniform vec2 uRes; uniform float uNear, uFar, uBloomCap;
uniform vec3 uFog; uniform float uBands; uniform float uInk, uInkT, uInkStep, uExposure, uSat, uVig, uBloodVig, uFlash, uSplit, uImpact, uTime, uDesat, uCurve, uCraft, uPxPolish, uCraftDof, uCinemaInk; uniform vec3 uFlashCol, uLift, uGain, uInkCol;
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
  bool hd2d = uCraft > 1.5 && uCraft < 2.5;
  // subtle diorama tilt-shift DOF in 1x craft modes (radius scaled by uRes.y / 720 for resolution independence)
  if (!hd2d && uCraft > 0.5 && uCraftDof > 0.01) {
    float dofBand = smoothstep(0.24, 0.52, abs(vUv.y - 0.48)) * uCraftDof;
    if (dofBand > 0.01) {
      vec2 br = px * (2.6 * max(uRes.y / 720.0, 0.5) * dofBand);
      vec3 acc = col * 0.2;
      acc += texture2D(tColor, vUv + vec2( br.x,  0.0)).rgb * 0.1;
      acc += texture2D(tColor, vUv + vec2(-br.x,  0.0)).rgb * 0.1;
      acc += texture2D(tColor, vUv + vec2( 0.0,  br.y)).rgb * 0.1;
      acc += texture2D(tColor, vUv + vec2( 0.0, -br.y)).rgb * 0.1;
      acc += texture2D(tColor, vUv + vec2( br.x,  br.y) * 0.72).rgb * 0.1;
      acc += texture2D(tColor, vUv + vec2(-br.x,  br.y) * 0.72).rgb * 0.1;
      acc += texture2D(tColor, vUv + vec2( br.x, -br.y) * 0.72).rgb * 0.1;
      acc += texture2D(tColor, vUv + vec2(-br.x, -br.y) * 0.72).rgb * 0.1;
      col = mix(col, acc, dofBand * 0.88);
    }
  }
#ifdef PIXEL
  // in HD-2D mode, smooth HDR bloom is composited at native screen resolution in BLIT_FS (Octopath Traveler style)
  if (!hd2d) {
    vec4 bt = texture2D(tBloom, vUv);   // UnrealBloom blends rgb × alpha (alpha = strength × mip weights), same here
    vec3 bl = min(bt.rgb * bt.a, vec3(uBloomCap)); float bm = max(bl.r, max(bl.g, bl.b));
    if (uBands > 0.5) {
      float bq = floor(bm * uBands / uBloomCap + 0.5) / uBands * uBloomCap;   // rounded, so the halo keeps its energy
      bq = max(bq, min(bm, 0.5 * uBloomCap / uBands));                         // the faint outer haze stays smooth
      col += bl * bq / max(bm, 1e-4);
    } else col += bl;   // 1× art pixels: a smooth halo (stepped bands read as rings at full resolution)
  }
#endif
  float d0 = lin(texture2D(tDepth, vUv).r);
  vec2 st = px * uInkStep;
  float dl = lin(texture2D(tDepth, vUv - vec2(st.x,0.0)).r), dr = lin(texture2D(tDepth, vUv + vec2(st.x,0.0)).r);
  float du = lin(texture2D(tDepth, vUv + vec2(0.0,st.y)).r), dd = lin(texture2D(tDepth, vUv - vec2(0.0,st.y)).r);
#ifdef PIXEL
  // resolution-normalized silhouette outline (tracks nearest-surface UV for colored/tinted deep-ink outlines in classic 2x polish)
  float ink = 0.0, dn = d0;
  vec2 nearUv = vUv;
  for (int i = 0; i < 4; i++) {
    vec2 o = i == 0 ? vec2(-st.x, 0.0) : i == 1 ? vec2(st.x, 0.0) : i == 2 ? vec2(0.0, st.y) : vec2(0.0, -st.y);
    float d1 = i == 0 ? dl : i == 1 ? dr : i == 2 ? du : dd;
    if ((d0 - d1) / max(d1, 0.001) < uInkT) continue;
    float d2 = lin(texture2D(tDepth, vUv + 2.0 * o).r), d3 = lin(texture2D(tDepth, vUv + 3.0 * o).r);
    if (abs(d2 - d1) < d1 * 0.06 && abs(d3 - d1) < d1 * 0.1) {
      ink = 1.0;
      if (d1 < dn) { dn = d1; nearUv = vUv + o; }
    }
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
  if (uCraft > 0.5) {
    float lm = dot(col, vec3(0.299, 0.587, 0.114));
    if (uCraft < 1.5) {
      // A · 国风版画: warm parchment highlight, deep ink-indigo shadow, resolution-normalized Xuan-paper tooth
      col *= mix(vec3(0.93, 0.97, 1.07), vec3(1.05, 1.02, 0.95), smoothstep(0.12, 0.76, lm));
      vec2 pp = gl_FragCoord.xy * (720.0 / max(uRes.y, 1.0));
      float paper = sin(pp.x * 1.7 + sin(pp.y * 0.42) * 1.1) * cos(pp.y * 1.9);
      col *= 1.0 + paper * 0.017 * (1.0 - smoothstep(0.55, 0.95, lm));
    } else if (uCraft < 2.5) {
      // B · HD-2D 像素: Octopath-style rich indigo shadows + golden lantern highlights
      col *= mix(vec3(0.94, 0.98, 1.08), vec3(1.05, 1.01, 0.95), smoothstep(0.15, 0.78, lm));
    } else {
      // C · 精致微缩: crisp, airy, clean miniature color grade
      col *= mix(vec3(0.97, 1.00, 1.05), vec3(1.03, 1.02, 0.98), smoothstep(0.18, 0.80, lm));
    }
  }
#ifdef PIXEL
  vec3 inkFinal = uInkCol * 0.25;
  if (uCraft < 0.5 && uPxPolish > 0.5 && ink > 0.001) {
    // Eastward / Celeste style tinted deep-ink pixel outline: harmonizes with each surface's hue instead of harsh dead black
    vec3 nb = aces(texture2D(tColor, nearUv).rgb * uExposure);
    inkFinal = mix(uInkCol * 0.22, nb * vec3(0.24, 0.26, 0.36), 0.72);
  }
  col = mix(col, inkFinal, ink);
#endif
  // 2-frame graphic woodblock impact frame on 破势 / 拼刀胜出 / 一闪 highlights
  if (uImpact > 0.01) {
    float il = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 imp = mix(vec3(0.05, 0.04, 0.09), vec3(1.0, 0.96, 0.86), step(0.38, il));
    col = mix(col, imp, uImpact * 0.76);
  }
  // act-139 A3: 剑戟片水墨滤镜 (Kurosawa / woodblock monochrome preserving vivid blood red & golden parry/lantern cues)
  if (uCinemaInk > 0.01) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float hiLum = smoothstep(0.06, 0.88, lum);
    vec3 sumi = mix(vec3(0.06, 0.07, 0.09), vec3(0.95, 0.92, 0.86), hiLum);
    float redKeep = smoothstep(0.16, 0.34, col.r - max(col.g, col.b)) * smoothstep(0.18, 0.42, col.r);
    float goldKeep = smoothstep(0.18, 0.36, min(col.r, col.g * 1.1) - col.b) * smoothstep(0.34, 0.68, col.r);
    float keep = clamp(max(redKeep * 1.15, goldKeep * 0.92), 0.0, 1.0);
    vec3 vivid = mix(sumi, col * vec3(1.08, 1.02, 0.96), keep);
    col = mix(col, vivid, uCinemaInk);
  }
  // vignette + cinema-grade organic radial crimson low-HP pulse (in HD-2D, smooth native pass runs in BLIT_FS)
  if (!hd2d) {
    vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y * 0.75;
    float rq = length(q);
    col *= 1.0 - uVig * smoothstep(0.25, 0.85, rq);
    if (uBloodVig > 0.001) {
      vec2 eb = abs(vUv - 0.5) * 2.0;
      float ed = max(length(eb * vec2(0.86, 1.0)), max(eb.x, eb.y) * 0.94);
      float bv = smoothstep(0.42, 1.04, ed) * uBloodVig;
      float rim = smoothstep(0.74, 1.02, ed) * uBloodVig;
      col = mix(col, col * vec3(0.66, 0.14, 0.12) + vec3(0.28, 0.009, 0.007), clamp(bv * 0.82, 0.0, 0.78));
      col += vec3(0.26, 0.008, 0.006) * clamp(rim * 0.65, 0.0, 0.44);
    }
  }
  // flash
  col = mix(col, uFlashCol, uFlash);
  col = toSRGB(clamp(col, 0.0, 1.0));
  // occluded character silhouette outline (hero/ally: warm ivory-gold, foe: vermilion; zero cost on unoccluded pixels)
  float occA = texture2D(tColor, vUv).a;
  if (occA < 0.88) {
    vec2 os = px * max(1.0, floor(uRes.y / 420.0 + 0.5));
    float aL = texture2D(tColor, vUv - vec2(os.x, 0.0)).a;
    float aR = texture2D(tColor, vUv + vec2(os.x, 0.0)).a;
    float aU = texture2D(tColor, vUv + vec2(0.0, os.y)).a;
    float aD = texture2D(tColor, vUv - vec2(0.0, os.y)).a;
    float maxN = max(max(aL, aR), max(aU, aD));
    float minN = min(min(aL, aR), min(aU, aD));
    bool isHero = min(occA, minN) < 0.36;
    bool isEdge = maxN >= 0.88 || (isHero && maxN > 0.44) || (!isHero && minN < 0.36);
    vec3 occCol = isHero ? vec3(1.0, 0.90, 0.62) : vec3(1.0, 0.40, 0.32);
    vec3 occFill = isHero ? vec3(0.10, 0.12, 0.20) : vec3(0.28, 0.06, 0.06);
    float fade = 1.0 - uFlash * 0.7;
    col = isEdge ? mix(col, occCol, 0.92 * fade) : mix(col, occFill, 0.22 * fade);
  }
  if (!hd2d) {
    col = separateUiBackground(col, vUv);
    col += (hash(vUv * uRes + uTime) - 0.5) / 255.0;   // dither against banding
  }
  gl_FragColor = vec4(col, 1.0);
}`;
// the art buffer → screen: whole device pixels per art pixel, centred (the < 1 art px remainder is cropped evenly).
// In HD-2D mode (uHd2d > 0.5): razor-sharp 2x pixel world in the central combat band + native-resolution 12-tap optical bokeh
// tilt-shift + native-resolution velvety HDR bloom + native smooth vignette (Octopath Traveler pipeline).
const BLIT_FS = `precision highp float;
uniform sampler2D tLo; uniform sampler2D tBloom;
uniform vec2 uLoRes, uOff, uScreenRes; uniform float uK, uHd2d, uCraftDof, uDofFast, uBloomCap, uVig, uBloodVig, uTime;
${UI_SCENE_GLSL}
float hash2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 p = floor((gl_FragCoord.xy - uOff) / uK);
  vec2 uvSnap = (clamp(p, vec2(0.0), uLoRes - 1.0) + 0.5) / uLoRes;
  vec3 col = texture2D(tLo, uvSnap).rgb;
  if (uHd2d > 0.5) {
    vec2 uvCont = clamp((gl_FragCoord.xy - uOff) / (uK * uLoRes), vec2(0.0), vec2(1.0));
    // 1. native-resolution silky optical tilt-shift bokeh (middle combat zone stays 100% razor-sharp 2x pixels;
    //    radius normalized to 720p; mid tier uses lightweight 4-tap bokeh for WeChat mobile GPU safety)
    float dofBand = smoothstep(0.25, 0.54, abs(uvCont.y - 0.48)) * uCraftDof;
    if (dofBand > 0.01) {
      float scale = max(uScreenRes.y / 720.0, 0.5);
      vec2 br = (1.0 / max(uScreenRes, vec2(1.0))) * (5.2 * scale * dofBand);
      vec3 acc;
      if (uDofFast > 0.5) {
        acc = texture2D(tLo, uvCont).rgb * 0.24;
        acc += texture2D(tLo, clamp(uvCont + vec2( br.x,  br.y) * 0.72, vec2(0.0), vec2(1.0))).rgb * 0.19;
        acc += texture2D(tLo, clamp(uvCont + vec2(-br.x,  br.y) * 0.72, vec2(0.0), vec2(1.0))).rgb * 0.19;
        acc += texture2D(tLo, clamp(uvCont + vec2( br.x, -br.y) * 0.72, vec2(0.0), vec2(1.0))).rgb * 0.19;
        acc += texture2D(tLo, clamp(uvCont + vec2(-br.x, -br.y) * 0.72, vec2(0.0), vec2(1.0))).rgb * 0.19;
      } else {
        acc = texture2D(tLo, uvCont).rgb * 0.16;
        acc += texture2D(tLo, clamp(uvCont + vec2( br.x,  br.y) * 0.46, vec2(0.0), vec2(1.0))).rgb * 0.08;
        acc += texture2D(tLo, clamp(uvCont + vec2(-br.x,  br.y) * 0.46, vec2(0.0), vec2(1.0))).rgb * 0.08;
        acc += texture2D(tLo, clamp(uvCont + vec2( br.x, -br.y) * 0.46, vec2(0.0), vec2(1.0))).rgb * 0.08;
        acc += texture2D(tLo, clamp(uvCont + vec2(-br.x, -br.y) * 0.46, vec2(0.0), vec2(1.0))).rgb * 0.08;
        acc += texture2D(tLo, clamp(uvCont + vec2( br.x,  0.0), vec2(0.0), vec2(1.0))).rgb * 0.065;
        acc += texture2D(tLo, clamp(uvCont + vec2(-br.x,  0.0), vec2(0.0), vec2(1.0))).rgb * 0.065;
        acc += texture2D(tLo, clamp(uvCont + vec2( 0.0,  br.y), vec2(0.0), vec2(1.0))).rgb * 0.065;
        acc += texture2D(tLo, clamp(uvCont + vec2( 0.0, -br.y), vec2(0.0), vec2(1.0))).rgb * 0.065;
        acc += texture2D(tLo, clamp(uvCont + vec2( br.x,  br.y) * 0.72, vec2(0.0), vec2(1.0))).rgb * 0.065;
        acc += texture2D(tLo, clamp(uvCont + vec2(-br.x,  br.y) * 0.72, vec2(0.0), vec2(1.0))).rgb * 0.065;
        acc += texture2D(tLo, clamp(uvCont + vec2( br.x, -br.y) * 0.72, vec2(0.0), vec2(1.0))).rgb * 0.065;
        acc += texture2D(tLo, clamp(uvCont + vec2(-br.x, -br.y) * 0.72, vec2(0.0), vec2(1.0))).rgb * 0.065;
      }
      col = mix(col, acc, smoothstep(0.0, 0.65, dofBand) * 0.90);
    }
    // 2. native-resolution velvety HDR bloom floating smoothly over crisp 2x pixels
    if (uBloomCap > 0.001) {
      vec4 bt = texture2D(tBloom, uvCont);
      vec3 bl = min(bt.rgb * bt.a, vec3(uBloomCap));
      vec3 glowSRGB = pow(max(bl, vec3(0.0)), vec3(1.0 / 2.2));
      col = clamp(col + glowSRGB * (1.0 - col * 0.48) * 0.80, 0.0, 1.0);
    }
    // 3. native-resolution smooth cinematic vignette + low-HP radial crimson pulse + UI background separation + fine native dither
    vec2 q = uvCont - 0.5; q.x *= uScreenRes.x / max(uScreenRes.y, 1.0) * 0.75;
    float rq = length(q);
    col *= 1.0 - uVig * smoothstep(0.28, 0.88, rq);
    if (uBloodVig > 0.001) {
      vec2 eb = abs(uvCont - 0.5) * 2.0;
      float ed = max(length(eb * vec2(0.86, 1.0)), max(eb.x, eb.y) * 0.94);
      float bv = smoothstep(0.42, 1.04, ed) * uBloodVig;
      float rim = smoothstep(0.74, 1.02, ed) * uBloodVig;
      col = mix(col, col * vec3(0.76, 0.20, 0.18) + vec3(0.44, 0.032, 0.028), clamp(bv * 0.80, 0.0, 0.78));
      col += vec3(0.46, 0.035, 0.025) * clamp(rim * 0.64, 0.0, 0.46);
    }
    col = separateUiBackground(col, uvCont);
    col += (hash2(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export const GRADE = {
  ink: 0.85, exposure: 1.05, sat: 1.12, vig: 0.55, bloodVig: 0, desat: 0, cinemaInk: 0,
  lift: new THREE.Color(0.02, 0.015, 0.05), gain: new THREE.Color(1.0, 0.98, 1.02), inkCol: new THREE.Color(0.05, 0.03, 0.08),
  flash: 0, flashCol: new THREE.Color(1, 1, 1), split: 0, impact: 0,
  bloomStrength: 0.85, bloomRadius: 0.55, bloomThreshold: 1.05,   // 2026-11-13: only real glows bloom, not white cloth
};

const uniforms = () => ({
  ...uiSceneUniforms(),
  tColor: { value: null as THREE.Texture | null }, tDepth: { value: null as THREE.Texture | null }, tBloom: { value: null as THREE.Texture | null }, uBloomCap: { value: 0.7 }, uBands: { value: 6 }, uRes: { value: new THREE.Vector2(4, 4) }, uNear: { value: 0.1 }, uFar: { value: 400 },
  uInk: { value: 1 }, uInkT: { value: 0.05 }, uInkStep: { value: 1 }, uFog: { value: new THREE.Vector3() }, uExposure: { value: 1 }, uSat: { value: 1 }, uVig: { value: 0.5 }, uBloodVig: { value: 0 }, uFlash: { value: 0 }, uSplit: { value: 0 }, uImpact: { value: 0 }, uTime: { value: 0 }, uDesat: { value: 0 }, uCurve: { value: 0 }, uCraft: CRAFTU.uCraft, uPxPolish: CRAFTU.uPxPolish, uCraftDof: CRAFTU.uCraftDof, uCinemaInk: { value: 0 },
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
  /** half-float targets drawable (else 8-bit, look/bloomMips.ts halfFloatOk) */
  readonly hdr: boolean;
  /** the UI-layer 3D scene at native resolution (look/uiPass.ts) */
  ui: UiPass;
  private size = { w: 4, h: 4, dpr: 1 };
  constructor(private renderer: THREE.WebGLRenderer) {
    const cap = renderer.capabilities, ext = renderer.extensions;
    // 11-18 微信帧率: a GPU that can't draw into half floats gets 8-bit targets (no HDR bloom) instead of a black/flickering screen
    this.hdr = halfFloatOk(renderer);
    this.msaa = cap.isWebGL2 && this.hdr && ext.has('EXT_color_buffer_float') ? Math.min(4, cap.maxSamples || 0) : 0;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, depthTexture: new THREE.DepthTexture(4, 4), samples: 0 });
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), GRADE.bloomStrength, GRADE.bloomRadius, GRADE.bloomThreshold);
    if (!this.hdr) bloom8bit(this.bloom);
    // Preserve rt alpha (occluded character silhouette mask) when standard-mode bloom blends onto this.rt
    const bCopy = (this.bloom as unknown as { materialCopy?: THREE.Material }).materialCopy;
    if (bCopy) {
      bCopy.blending = THREE.CustomBlending;
      bCopy.blendEquation = THREE.AddEquation; bCopy.blendSrc = THREE.SrcAlphaFactor; bCopy.blendDst = THREE.OneFactor;
      bCopy.blendEquationAlpha = THREE.AddEquation; bCopy.blendSrcAlpha = THREE.ZeroFactor; bCopy.blendDstAlpha = THREE.OneFactor;
    }
    const mk = (pixel: boolean) => {
      const u = uniforms(); u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture;
      return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS(pixel), depthTest: false, depthWrite: false, uniforms: u });
    };
    this.matStd = this.mat = mk(false); this.matPx = mk(true);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); this.quad.frustumCulled = false; this.qs.add(this.quad);
    this.lo = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
    this.blit = new THREE.ShaderMaterial({ vertexShader: BLIT_VS, fragmentShader: BLIT_FS, depthTest: false, depthWrite: false,
      uniforms: { ...uiSceneUniforms(), tLo: { value: this.lo.texture }, tBloom: { value: this.rt.texture as THREE.Texture | null }, uLoRes: { value: new THREE.Vector2(4, 4) }, uOff: { value: new THREE.Vector2() }, uScreenRes: { value: new THREE.Vector2(4, 4) }, uK: { value: 2 }, uHd2d: { value: 0 }, uCraftDof: CRAFTU.uCraftDof, uDofFast: { value: 0 }, uBloomCap: { value: 0 }, uVig: { value: 0.4 }, uBloodVig: { value: 0 }, uTime: { value: 0 } } });
    const bq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blit); bq.frustumCulled = false; this.bs.add(bq);
    this.ui = new UiPass(renderer, this.msaa, this.hdr);
  }
  setSize(w: number, h: number, dpr: number) {
    this.size = { w, h, dpr };
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    // MSAA on the HDR target only where art pixels are screen pixels (1×, standard); chunky art pixels stay hard-edged
    // (high-DPI screens alias less and pay more per sample: ×2 there)
    // (11-18 微信帧率: the 中 / 低 tiers draw the world without MSAA)
    const T = tierNow(), msx = dpr >= 1.75 ? Math.min(2, this.msaa) : this.msaa, ms = this.pixel <= 1 && T.worldMsaa ? msx : 0;
    if (this.rt.samples !== ms) { this.rt.samples = ms; this.rt.dispose(); }
    if (this.pixel > 0) {
      // art buffer: PX.size CSS px per art pixel (device px per art px = size × dpr), a little larger than the screen, centred
      // device px per art pixel. A plain screen (dpr < 1.5): whole multiples of the CSS pixel, as always. A high-density screen
      // (phones, 2× laptops): sized from the screen's height so the picture has PX_ROWS / size rows whatever the screen — the
      // same pixel feel as a desktop window (act-17 用户：「手机上看2x像素又太糊了，可以让我在电脑端和手机端看起来像素感一致吗」;
      // a phone is only ~390 CSS px tall, so 2 CSS px a pixel left it with ~195 rows)
      const pixel = lowTargets() && QUALITY.choice === 'auto' && QUALITY.reducedWorld ? this.pixel + 1 : this.pixel;
      const k = dpr < 1.5 ? ((CRAFT.on || PX_POLISH.on) && pixel >= 2 ? Math.max(1, Math.round(H * pixel / PX_ROWS)) : pixel * dpr) : Math.max(1, H * pixel / PX_ROWS), Wa = Math.max(1, Math.ceil(W / k)), Ha = Math.max(1, Math.ceil(H / k));
      this.rt.setSize(Wa, Ha); this.lo.setSize(Wa, Ha); this.bloom.setSize(mobileTargets() || !this.hdr ? 32 : Wa, mobileTargets() || !this.hdr ? 32 : Ha);
      (this.matPx.uniforms.uRes.value as THREE.Vector2).set(Wa, Ha);
      const bu = this.blit.uniforms; (bu.uLoRes.value as THREE.Vector2).set(Wa, Ha); bu.uK.value = k; (bu.uOff.value as THREE.Vector2).set((W - Wa * k) / 2, (H - Ha * k) / 2); (bu.uScreenRes.value as THREE.Vector2).set(W, H);
      PXU.uArtH.value = Ha;
    } else {
      this.rt.setSize(W, H); this.bloom.setSize(Math.round(W / 2), Math.round(H / 2));
      PXU.uArtH.value = H;
    }
    (this.matStd.uniforms.uRes.value as THREE.Vector2).set(W, H);
    // the UI layer at no more than the tier's device px per CSS px (高 3 = native on any phone; 中 2; 低 1.5), drawn back over the
    // full-resolution frame with linear filtering
    const uiDpr = !mobileTargets() && QUALITY.tier !== 'high' ? (QUALITY.tier === 'low' ? 1.5 : 2) : T.uiDpr;
    const uk = Math.min(1, uiDpr / Math.max(1, dpr));
    this.ui.setSize(Math.max(1, Math.round(W * uk)), Math.max(1, Math.round(H * uk)), mobileTargets() ? 0 : msx);
  }
  /** switch the pixel look (0 = standard, else CSS px per art pixel) */
  setPixel(n: number) { if (n === this.pixel) return; this.pixel = n; this.setSize(this.size.w, this.size.h, this.size.dpr); }
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number) {
    syncCraftUniforms(time);
    const r = this.renderer, pix = this.pixel > 0, m = pix ? this.matPx : this.matStd, u = m.uniforms;
    updateUiSceneUniforms(u, !!UI3D.layer?.on);
    // busy screens (many additive particles) pull the bloom back in the pixel look (the reference's FXB)
    const busy = pix ? Math.min(1, Math.max(0, ((PADD?.n ?? 0) - 450) / 900)) : 0;
    gpuMark('world'); r.setRenderTarget(this.rt);
    if (r.getClearAlpha() !== 1) r.setClearAlpha(1);
    r.clear();
    if (pix) { pxLightsBegin(scene); liftOverlays(scene); }
    r.render(scene, camera);
    if (pix) pxLightsEnd();
    this.bloom.strength = GRADE.bloomStrength * (1 - PX.busyDim * busy); this.bloom.radius = GRADE.bloomRadius; this.bloom.threshold = CRAFT.on ? Math.max(GRADE.bloomThreshold, 1.16) : PX_POLISH.on ? Math.max(GRADE.bloomThreshold, 1.12) : GRADE.bloomThreshold;
    // pixel look: the bloom is not blended in place; the final pass reads the composite, caps it and (at ≥ 2× art pixels) steps it into bands
    // (11-18 微信帧率: the pixel look stops at the mips — its blend back over the frame had opacity 0)
    gpuMark('bloom');
    // 11-19：半分辨率泛光仍需十二次绘制；发光物本色保留在世界色缓冲中。
    const cMode = CRAFT.mode, isHd2d = pix && cMode === 'hd2d';
    const wantFilter = isHd2d ? THREE.LinearFilter : THREE.NearestFilter;
    if (this.lo.texture.magFilter !== wantFilter) { this.lo.texture.minFilter = this.lo.texture.magFilter = wantFilter; this.lo.texture.needsUpdate = true; }
    const cBloomCap = cMode === 'hd2d' ? 1.25 : cMode === 'diorama' ? 1.15 : cMode === 'ink' ? 1.05 : PX.bloomCap;
    const skipBloom = mobileTargets() || !this.hdr;
    if (skipBloom) { u.tBloom.value = this.rt.texture; u.uBloomCap.value = 0; u.uBands.value = 0; }
    else if (pix) { u.tBloom.value = bloomMips(this.bloom, r, this.rt); u.uBloomCap.value = cBloomCap; u.uBands.value = !CRAFT.on && this.pixel >= 2 ? PX.bands : 0; }
    else { (this.bloom as unknown as { copyUniforms: Record<string, THREE.IUniform> }).copyUniforms.opacity.value = 1; this.bloom.render(r, null as unknown as THREE.WebGLRenderTarget, this.rt, 0, false); }
    const fog = scene.fog as (THREE.Fog & THREE.FogExp2) | null;   // x: exp2 density, y/z: linear near / far
    (u.uFog.value as THREE.Vector3).set(fog && (fog as THREE.FogExp2).isFogExp2 ? fog.density : 0, fog && (fog as THREE.Fog).isFog ? fog.near : 0, fog && (fog as THREE.Fog).isFog ? fog.far : 0);
    // resolution-normalized outline thickness (matches UiPass's H / 720 scaling so small windows, 1080p, 2K & 4K look identical)
    const artH = (u.uRes.value as THREE.Vector2).y;
    const refH = this.pixel >= 2 ? 450 : 720;
    const resScale = artH / refH;
    const normRes = CRAFT.on || PX_POLISH.on;
    const inkStep = normRes ? Math.max(1, resScale) : 1;
    const inkSmallFade = normRes ? Math.min(1, Math.max(0.65, resScale)) : 1;
    const cInk = (cMode === 'ink' ? 0.68 * CRAFT.ink : cMode === 'hd2d' ? 0.50 * CRAFT.ink : cMode === 'diorama' ? 0.08 * CRAFT.ink : (pix ? (this.pixel >= 2 ? PX.ink : PX.ink1) : GRADE.ink)) * inkSmallFade;
    const cInkT = cMode === 'ink' ? 0.045 : cMode === 'diorama' ? 0.08 : PX.inkT;
    const cExp = cMode === 'ink' ? 0.96 : cMode === 'hd2d' ? 0.96 : cMode === 'diorama' ? 1.00 : (pix ? (this.pixel >= 2 ? PX.exposure : PX.exposure1) : 1);
    const cSat = cMode === 'ink' ? 1.10 : cMode === 'hd2d' ? 1.14 : cMode === 'diorama' ? 1.16 : (pix ? PX.sat : 1);
    const cVig = cMode === 'ink' ? 0.92 : cMode === 'hd2d' ? 0.92 : cMode === 'diorama' ? 0.72 : (pix ? PX.vig : 1);
    const cCur = cMode === 'ink' ? 0.16 : cMode === 'hd2d' ? 0.18 : cMode === 'diorama' ? 0.13 : (pix ? PX.curve : 0);
    u.uNear.value = camera.near; u.uFar.value = camera.far; u.uInk.value = cInk; u.uInkT.value = cInkT; u.uInkStep.value = inkStep;
    u.uExposure.value = GRADE.exposure * cExp; u.uSat.value = GRADE.sat * cSat; u.uVig.value = GRADE.vig * cVig; u.uBloodVig.value = GRADE.bloodVig; u.uCurve.value = cCur;
    u.uFlash.value = GRADE.flash; u.uSplit.value = GRADE.split; u.uImpact.value = GRADE.impact; u.uTime.value = time % 100; u.uDesat.value = GRADE.desat; u.uCinemaInk.value = GRADE.cinemaInk;
    (u.uFlashCol.value as THREE.Color).copy(GRADE.flashCol); (u.uLift.value as THREE.Color).copy(GRADE.lift); (u.uGain.value as THREE.Color).copy(GRADE.gain); (u.uInkCol.value as THREE.Color).copy(GRADE.inkCol);
    const bu = this.blit.uniforms;
    bu.uHd2d.value = isHd2d ? 1 : 0;
    if (isHd2d) {
      updateUiSceneUniforms(bu, !!UI3D.layer?.on);
      bu.tBloom.value = u.tBloom.value;
      bu.uBloomCap.value = skipBloom ? 0 : cBloomCap;
      bu.uDofFast.value = QUALITY.tier === 'mid' ? 1 : 0;
      bu.uVig.value = GRADE.vig * cVig;
      bu.uBloodVig.value = GRADE.bloodVig;
      bu.uTime.value = time % 100;
    }
    this.quad.material = m; gpuMark('final');
    if (!pix) { r.setRenderTarget(null); r.render(this.qs, this.cam); }
    else {
      r.setRenderTarget(this.lo); r.render(this.qs, this.cam);
      r.setRenderTarget(null); r.render(this.bs, this.cam);
      drawOverlays(r, scene, camera);
    }
    // the UI-layer 3D scene: always at native resolution, over the finished world frame
    const L = UI3D.layer; if (L && L.on) { gpuMark('ui'); this.ui.render(L); }
  }
}
