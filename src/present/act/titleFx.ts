// Atmospheric shader-driven title presentation for the start screen (title.ts):
// 1. Per-glyph forged-steel bitmap title (长坂点宋 16, crisp nearest-neighbor atlas, directional bevel + scene firelight rim + subtle waist shear)
// 2. Acoustic sound-ripple rings behind the title (zero dark fill, echoes blind acoustic perception)
// 3. Pixel-crisp ring-pommel blade underline + crimson silk ribbon (echoes 环首刀 & blindfold ribbon)
// 4. Sweeping blade-draw slash arc (active only during reveal / periodic glint / confirm cut)
// 5. Wind-coupled foreground weather motes & burst sparks (strictly synced with scene gust & blade strikes)
//
// WebGL1 / WeChat Mini-Game safe: GLSL ES 1.00 only, no dFdx/dFdy, no InstancedMesh, no FloatType textures, no DOM.
import * as THREE from 'three';
import { canvasTex } from '../engine/world';
import type { Overlay } from '../v2/overlay';
import { drawPix, pixW, PIX_H } from '../v2/pix';

type RGB = [number, number, number];
type MoteKind = 'snowFire' | 'rain' | 'chaff' | 'mist' | 'embers';

interface TitleTheme {
  top: RGB;
  bot: RGB;
  bevel: RGB;
  rim: RGB;
  rimStrength: number;
  outline: RGB;
  accent: RGB;
  steel: RGB;
  ripple: RGB;
  moteKind: MoteKind;
}

const THEMES: Record<string, TitleTheme> = {
  snow: {
    top: [0.97, 0.98, 1.00],
    bot: [0.76, 0.82, 0.91],
    bevel: [1.00, 1.00, 1.00],
    rim: [1.00, 0.50, 0.22],
    rimStrength: 0.56,
    outline: [0.04, 0.05, 0.08],
    accent: [0.86, 0.20, 0.17],
    steel: [0.90, 0.94, 1.00],
    ripple: [0.78, 0.86, 0.98],
    moteKind: 'snowFire',
  },
  rain: {
    top: [0.94, 0.97, 1.00],
    bot: [0.66, 0.76, 0.88],
    bevel: [0.96, 0.99, 1.00],
    rim: [1.00, 0.66, 0.34],
    rimStrength: 0.48,
    outline: [0.03, 0.05, 0.09],
    accent: [0.82, 0.22, 0.19],
    steel: [0.78, 0.90, 1.00],
    ripple: [0.66, 0.84, 1.00],
    moteKind: 'rain',
  },
  wheat: {
    top: [1.00, 0.96, 0.88],
    bot: [0.82, 0.70, 0.56],
    bevel: [1.00, 0.98, 0.90],
    rim: [1.00, 0.60, 0.22],
    rimStrength: 0.52,
    outline: [0.09, 0.05, 0.04],
    accent: [0.84, 0.22, 0.15],
    steel: [1.00, 0.90, 0.68],
    ripple: [1.00, 0.84, 0.58],
    moteKind: 'chaff',
  },
  dawn: {
    top: [0.97, 0.98, 1.00],
    bot: [0.74, 0.79, 0.87],
    bevel: [1.00, 0.99, 0.98],
    rim: [0.94, 0.68, 0.52],
    rimStrength: 0.42,
    outline: [0.06, 0.07, 0.10],
    accent: [0.80, 0.22, 0.20],
    steel: [0.90, 0.94, 1.00],
    ripple: [0.82, 0.88, 0.96],
    moteKind: 'mist',
  },
  embers: {
    top: [0.97, 0.93, 0.90],
    bot: [0.74, 0.64, 0.62],
    bevel: [1.00, 0.95, 0.90],
    rim: [1.00, 0.42, 0.16],
    rimStrength: 0.64,
    outline: [0.08, 0.04, 0.04],
    accent: [0.90, 0.24, 0.16],
    steel: [1.00, 0.76, 0.52],
    ripple: [0.96, 0.62, 0.44],
    moteKind: 'embers',
  },
};

export interface TitleFxEnv {
  gust: number;
  fireGlow: number;
  flash: number;
  menuFade: number;
  beat: string;
  beatT: number;
  pointerX: number;
  pointerY: number;
}

export interface TitleBox {
  cx: number;
  cy: number;
  x: number;
  y: number;
  w: number;
  h: number;
  bladeBottom: number;
}

// ============================================================================
// Shaders (strict GLSL ES 1.00)
// ============================================================================

const GLYPH_VS = `
attribute vec2 aLocal;
attribute vec4 aMetrics;
attribute vec2 aUvBounds;
uniform float uTime, uEnter, uFlash;
uniform vec2 uPointer;
varying vec2 vUv, vLocal, vUvBounds;
varying float vRawP, vTitleX, vIsLast;

void main() {
  float idx = aMetrics.x;
  float cnt = max(1.0, aMetrics.y);
  float tStart = cnt <= 4.5
    ? 0.55 + idx * 0.22 + (idx >= cnt - 1.5 ? 0.06 : 0.0)
    : 0.52 + (idx / max(1.0, cnt - 1.0)) * 0.52;
  float rawP = clamp((uEnter - tStart) / 0.42, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - rawP, 3.0);

  vec3 pos = position;
  pos.x -= (1.0 - e) * 4.0;
  pos.y -= (1.0 - e) * 7.0;
  pos.y += sin(uTime * 1.45 + idx * 1.15) * 1.25 * e;
  pos.x += sin(uTime * 95.0 + idx * 7.0) * uFlash * 1.4;
  pos.xy += uPointer * vec2(3.0, -2.0);

  vUv = uv;
  vLocal = aLocal;
  vUvBounds = aUvBounds;
  vRawP = rawP;
  vTitleX = aMetrics.z;
  vIsLast = aMetrics.w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const GLYPH_FS = `
precision highp float;
uniform sampler2D tAtlas;
uniform float uTime, uGlint, uGlintAmp, uCutPhase, uSceneGlow, uFlash, uMenuFade;
uniform float uInvAtlasW, uHalfTexelX, uFontStepY, uDpr;
uniform vec3 uTopCol, uBotCol, uBevelCol, uRimCol, uOutlineCol, uAccentCol, uSteelCol;
uniform float uRimStrength;
varying vec2 vUv, vLocal, vUvBounds;
varying float vRawP, vTitleX, vIsLast;

void main() {
  if (vRawP <= 0.001 || uMenuFade <= 0.01) discard;

  float cutV = 0.48 + (vTitleX - 0.5) * 0.08;
  float side = vLocal.y >= cutV ? 1.0 : -1.0;

  // Restrained micro-shiver during reveal & blade glint only (never tears letters on confirm cut)
  float enterShear = (1.0 - smoothstep(0.0, 0.50, vRawP)) * 1.6 * smoothstep(0.0, 0.10, vRawP);
  float glintShear = exp(-pow((vTitleX - uGlint) * 9.0, 2.0)) * uGlintAmp * 1.1;
  float shearPx = (enterShear + glintShear) * uDpr;

  vec2 suv = vUv;
  suv.x = clamp(vUv.x - shearPx * side * uInvAtlasW, vUvBounds.x + uHalfTexelX, vUvBounds.y - uHalfTexelX);

  vec4 m = texture2D(tAtlas, suv);
  float face = step(0.5, m.r);
  float outline = step(0.7, m.g) * (1.0 - face);
  float chisel = step(0.2, m.g) * (1.0 - step(0.7, m.g)) * (1.0 - face);
  if (face + outline + chisel < 0.5) discard;

  float wipe = smoothstep(0.0, 0.24, vRawP * 1.35 - vLocal.x * 0.30);
  if (wipe <= 0.01) discard;

  float upR = texture2D(tAtlas, suv + vec2(0.0, uFontStepY)).r;
  float dnR = texture2D(tAtlas, suv - vec2(0.0, uFontStepY)).r;
  float topBevel = face * (1.0 - upR);
  float botRim = face * (1.0 - dnR);

  // Forged steel gradient + subtle quench sheen
  vec3 steel = mix(uBotCol, uTopCol, smoothstep(0.05, 0.92, vLocal.y));
  float quench = 0.97 + 0.04 * (0.5 + 0.5 * sin(vLocal.x * 10.0 + vLocal.y * 6.5 - uTime * 0.35));
  steel *= quench;

  // Crisp top moonlight bevel
  steel += uBevelCol * topBevel * 0.22;

  // Subtle scene firelight / lantern bounce concentrated on underside stroke edges
  float lower = botRim * 0.52 + (1.0 - smoothstep(0.0, 0.24, vLocal.y)) * 0.14;
  steel = mix(steel, uRimCol, clamp(lower * uRimStrength * uSceneGlow, 0.0, 0.38));

  // Diagonal traveling blade glint
  float diag = vTitleX * 1.15 - (vLocal.y - 0.5) * 0.18;
  float gCore = exp(-pow((diag - uGlint) * 18.0, 2.0));
  float gHalo = exp(-pow((diag - uGlint) * 5.2, 2.0));
  steel += uSteelCol * (gCore * 0.92 + gHalo * 0.22) * uGlintAmp;

  // Confirm blade-draw steel surge
  steel += uSteelCol * uCutPhase * 0.45;

  // Entrance steel forge flash + brief cinnabar spark along the final stroke
  float enterFlash = exp(-pow((vRawP - 0.32) * 5.0, 2.0));
  steel += uSteelCol * enterFlash * 0.70;
  float lastKiss = vIsLast * exp(-pow((vRawP - 0.42) * 4.5, 2.0)) * (1.0 - smoothstep(0.0, 0.45, vLocal.y));
  steel = mix(steel, uAccentCol * 1.35, lastKiss * 0.48);

  // Thin crisp waist gleam when micro-shearing
  float cutLine = smoothstep(0.35, 1.2, abs(shearPx)) * (1.0 - smoothstep(0.0, 0.045, abs(vLocal.y - cutV)));
  steel += uSteelCol * cutLine * 0.45;

  // Lightning surge
  steel += vec3(0.42, 0.52, 0.70) * uFlash;

  vec3 col = steel * face + uOutlineCol * (outline + chisel);
  float a = face * 0.99 + outline * 0.96 + chisel * 0.46;
  gl_FragColor = vec4(col, a * wipe * uMenuFade);
}
`;

const RIPPLE_VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RIPPLE_FS = `
precision highp float;
uniform vec2 uSizePx;
uniform vec3 uCol;
uniform float uRingA, uRingB, uAmpA, uAmpB, uConfirmPull, uMenuFade;
varying vec2 vUv;

float waveSet(float d, float prog, float pxStep) {
  if (prog < 0.0 || prog > 1.0) return 0.0;
  float r = 0.08 + prog * 0.80 - uConfirmPull * 0.14;
  float w = max(pxStep * 1.6, 0.011);
  float f1 = smoothstep(w, 0.0, abs(d - r));
  float f2 = smoothstep(w, 0.0, abs(d - (r - 0.12))) * step(0.16, r) * 0.52;
  float f3 = smoothstep(w, 0.0, abs(d - (r - 0.24))) * step(0.28, r) * 0.24;
  float life = sin(prog * 3.14159265) * (1.0 - prog * 0.55);
  return (f1 + f2 + f3) * life;
}

void main() {
  if (uMenuFade <= 0.01) discard;
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(vec2(p.x / 0.86, p.y / 0.78));
  float edge = smoothstep(0.96, 0.70, d);
  if (edge <= 0.001) discard;

  float pxStep = 2.0 / max(80.0, min(uSizePx.x, uSizePx.y));
  float dq = floor(d / pxStep + 0.5) * pxStep;

  float a = waveSet(dq, uRingA, pxStep) * uAmpA + waveSet(dq, uRingB, pxStep) * uAmpB;
  a *= edge * uMenuFade;
  if (a <= 0.004) discard;
  gl_FragColor = vec4(uCol, clamp(a, 0.0, 0.26));
}
`;

const BLADE_VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BLADE_FS = `
precision highp float;
uniform vec2 uPx;
uniform float uTime, uDpr, uReveal, uGlint, uGlintAmp, uCutPhase, uSceneGlow, uMenuFade;
uniform vec3 uSteelCol, uAccentCol, uRimCol, uOutlineCol;
varying vec2 vUv;

void main() {
  if (uMenuFade <= 0.01 || uReveal <= 0.001) discard;
  float W = uPx.x;
  float H = uPx.y;
  vec2 pix = floor(vUv * uPx);
  float x = pix.x;
  float y = pix.y;
  float u = max(3.0, floor(uDpr * 2.5));
  float px = max(1.0, floor(uDpr));
  float midY = floor(H * 0.62);

  // Reveal sweep left to right
  float revX = uReveal * W;
  if (x > revX + u * 2.0) discard;
  float drawHead = smoothstep(u * 4.0, 0.0, abs(x - revX)) * step(uReveal, 0.995);

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  // 1. Ring-pommel at left end (clear hollow bronze square ring + dark border)
  float rx0 = u * 1.5, rx1 = u * 5.5;
  float ry0 = midY - u * 2.0, ry1 = midY + u * 2.0;
  float inRim = step(rx0 - px, x) * step(x, rx1 + px - 0.5) * step(ry0 - px, y) * step(y, ry1 + px - 0.5);
  float inOuter = step(rx0, x) * step(x, rx1 - 0.5) * step(ry0, y) * step(y, ry1 - 0.5);
  float inHole = step(rx0 + u, x) * step(x, rx1 - u - 0.5) * step(ry0 + u, y) * step(y, ry1 - u - 0.5);
  float ring = inOuter * (1.0 - inHole);
  if (inRim > 0.5 && inHole < 0.5 && ring < 0.5) {
    col = uOutlineCol;
    alpha = 0.85;
  }
  if (ring > 0.5) {
    float topB = step(ry1 - u, y);
    col = mix(vec3(0.50, 0.32, 0.16), vec3(0.88, 0.66, 0.34), 0.35 + 0.65 * topB);
    alpha = 0.98;
  }

  // 2. Wrapped grip + iron guard
  float grip = step(u * 5.5, x) * step(x, u * 9.0 - 0.5) * step(midY - u * 0.6, y) * step(y, midY + u * 0.6);
  if (grip > 0.5) { col = vec3(0.28, 0.19, 0.16); alpha = 0.96; }
  float guard = step(u * 9.0, x) * step(x, u * 10.2) * step(midY - u * 1.6, y) * step(y, midY + u * 1.6);
  if (guard > 0.5) { col = mix(vec3(0.20, 0.22, 0.26), vec3(0.50, 0.54, 0.62), step(midY, y)); alpha = 0.98; }

  // 3. Tapered straight Han blade (with subtle dark backing for bright skies)
  float bx0 = u * 10.2, bx1 = W - u * 2.5;
  float tipLen = u * 10.0;
  float tipK = clamp((bx1 - x) / tipLen, 0.0, 1.0);
  float thick = mix(0.45 * u, 1.25 * u, tipK);
  float bBg = step(bx0, x) * step(x, bx1 + px) * step(midY - thick * 0.45 - px, y) * step(y, midY + thick * 0.75 + px);
  float blade = step(bx0, x) * step(x, bx1) * step(midY - thick * 0.45, y) * step(y, midY + thick * 0.75);
  if (bBg > 0.5 && blade < 0.5) { col = uOutlineCol; alpha = 0.75; }
  if (blade > 0.5) {
    float normX = (x - bx0) / max(1.0, bx1 - bx0);
    float ridge = step(midY + thick * 0.12, y);
    vec3 bCol = mix(uSteelCol * 0.72, mix(uSteelCol, vec3(1.0), 0.42), ridge);
    bCol = mix(bCol, uRimCol, 0.18 * uSceneGlow * (1.0 - ridge));
    float glint = exp(-pow((normX - uGlint) * 11.0, 2.0)) * uGlintAmp;
    bCol += vec3(1.0) * (glint * 0.95 + uCutPhase * 0.85);
    col = bCol;
    alpha = 0.98;
  }

  // 4. Crimson silk thread / slash trace beneath the blade
  float tx0 = u * 8.5, tx1 = W - u * 1.5;
  float tNorm = clamp((x - tx0) / max(1.0, tx1 - tx0), 0.0, 1.0);
  float ty = midY - u * 2.6;
  float tHalf = u * 0.75 * (1.0 - 0.62 * tNorm);
  float thread = step(tx0, x) * step(x, tx1) * step(ty - tHalf, y) * step(y, ty + tHalf);
  if (thread > 0.5 && alpha < 0.5) {
    float breath = 0.74 + 0.22 * sin(uTime * 2.1 - tNorm * 2.5);
    float fadeTail = smoothstep(0.0, 0.10, tNorm) * (1.0 - smoothstep(0.84, 1.0, tNorm));
    col = uAccentCol * (1.05 + uCutPhase * 0.9);
    alpha = clamp((breath + uCutPhase * 0.35) * fadeTail, 0.0, 0.96);
  }

  // 5. Drawing tip glint
  if (drawHead > 0.05 && abs(y - midY) < u * 2.0) {
    col = mix(col, vec3(1.0), drawHead);
    alpha = max(alpha, drawHead * 0.92);
  }

  if (alpha <= 0.01) discard;
  gl_FragColor = vec4(col, alpha * uMenuFade);
}
`;

const SLASH_VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SLASH_FS = `
precision highp float;
uniform float uPos, uAmp, uAspect, uMenuFade;
uniform vec3 uCol;
varying vec2 vUv;

void main() {
  if (uAmp <= 0.01 || uMenuFade <= 0.01) discard;
  float curve = 0.5 + (vUv.x - 0.5) * 0.08 / max(0.3, uAspect) + 0.018 * sin((vUv.x - 0.5) * 3.14159265);
  float dy = abs(vUv.y - curve);

  float tail = smoothstep(uPos - 0.42, uPos, vUv.x) * smoothstep(uPos + 0.08, uPos - 0.02, vUv.x);
  float edgeFade = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float taper = tail * edgeFade;

  float core = smoothstep(0.016 * max(0.25, taper), 0.0, dy) * taper;
  float halo = smoothstep(0.068 * max(0.25, taper), 0.0, dy) * taper * 0.45;
  float intensity = (core * 1.15 + halo) * uAmp * uMenuFade;
  if (intensity <= 0.005) discard;

  vec3 col = mix(uCol, vec3(1.0), clamp(core * 1.4, 0.0, 1.0));
  gl_FragColor = vec4(col * intensity, clamp(intensity, 0.0, 1.0));
}
`;

const MOTE_VS = `
attribute float aSize;
attribute vec4 aCol;
uniform float uDpr;
varying vec4 vCol;
void main() {
  vCol = aCol;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uDpr, 1.5, 9.0);
}
`;

const MOTE_FS = `
precision highp float;
uniform float uMenuFade;
varying vec4 vCol;
void main() {
  float a = vCol.a * uMenuFade;
  if (a <= 0.005) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}
`;

// ============================================================================
// TitleFx class
// ============================================================================

const AMBIENT_MOTES = 30;
const SPARK_MOTES = 14;
const TOTAL_MOTES = AMBIENT_MOTES + SPARK_MOTES;

interface AmbientMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
  warm: boolean;
}

interface SparkMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  crimson: boolean;
}

const GLINT_PERIOD = 4.8;

export class TitleFx {
  private theme: TitleTheme;
  private atlas: THREE.CanvasTexture | null = null;
  private titleMesh: THREE.Mesh | null = null;
  private titleMat: THREE.ShaderMaterial;

  private rippleMesh: THREE.Mesh;
  private rippleMat: THREE.ShaderMaterial;

  private bladeMesh: THREE.Mesh;
  private bladeMat: THREE.ShaderMaterial;

  private slashMesh: THREE.Mesh;
  private slashMat: THREE.ShaderMaterial;

  private motePts: THREE.Points;
  private moteMat: THREE.ShaderMaterial;
  private motePos: THREE.BufferAttribute;
  private moteCol: THREE.BufferAttribute;
  private ambient: AmbientMote[] = [];
  private sparks: SparkMote[] = [];
  private moteCursor = 0;

  private box: TitleBox = { cx: 0, cy: 0, x: 0, y: 0, w: 100, h: 40, bladeBottom: 60 };
  private bladeGeo = { x: 0, y: 0, w: 120, h: 20 };
  private textSize = { w: 100, h: 40 };

  // Deterministic animation state
  private enterT = 0;
  private glintTimer = -1;
  private glintKind: 'idle' | 'pulse' | 'cut' = 'idle';
  private glintProg = 0;
  private lastIdleCycle = 0;

  private ringA = -1;
  private ringB = -1;
  private ringAmpA = 0.20;
  private ringAmpB = 0.14;
  private didEntryRipple = false;
  private didEntrySlash = false;
  private didEntrySparks = false;
  private lastFlashRing = -9;

  private cutTriggered = false;
  private cutPhase = 0;
  private visible = true;

  constructor(private ov: Overlay, themeId: string, private uiSide: 'left' | 'right') {
    this.theme = THEMES[themeId] ?? THEMES.snow;

    // 1. Title glyph shader material (geometry built in layout())
    this.titleMat = new THREE.ShaderMaterial({
      vertexShader: GLYPH_VS,
      fragmentShader: GLYPH_FS,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        tAtlas: { value: null },
        uTime: { value: 0 },
        uEnter: { value: 0 },
        uFlash: { value: 0 },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uGlint: { value: -1 },
        uGlintAmp: { value: 0 },
        uCutPhase: { value: 0 },
        uSceneGlow: { value: 1 },
        uMenuFade: { value: 1 },
        uInvAtlasW: { value: 1 },
        uHalfTexelX: { value: 0.001 },
        uFontStepY: { value: 0.05 },
        uDpr: { value: 1 },
        uTopCol: { value: new THREE.Color(...this.theme.top) },
        uBotCol: { value: new THREE.Color(...this.theme.bot) },
        uBevelCol: { value: new THREE.Color(...this.theme.bevel) },
        uRimCol: { value: new THREE.Color(...this.theme.rim) },
        uRimStrength: { value: this.theme.rimStrength },
        uOutlineCol: { value: new THREE.Color(...this.theme.outline) },
        uAccentCol: { value: new THREE.Color(...this.theme.accent) },
        uSteelCol: { value: new THREE.Color(...this.theme.steel) },
      },
    });

    // 2. Acoustic sound-ripple plane
    this.rippleMat = new THREE.ShaderMaterial({
      vertexShader: RIPPLE_VS,
      fragmentShader: RIPPLE_FS,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSizePx: { value: new THREE.Vector2(300, 180) },
        uCol: { value: new THREE.Color(...this.theme.ripple) },
        uRingA: { value: -1 },
        uRingB: { value: -1 },
        uAmpA: { value: 0.20 },
        uAmpB: { value: 0.14 },
        uConfirmPull: { value: 0 },
        uMenuFade: { value: 1 },
      },
    });
    this.rippleMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.rippleMat);
    this.rippleMesh.renderOrder = 87;
    ov.scene.add(this.rippleMesh);

    // 3. Forged ring-pommel blade underline
    this.bladeMat = new THREE.ShaderMaterial({
      vertexShader: BLADE_VS,
      fragmentShader: BLADE_FS,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uPx: { value: new THREE.Vector2(300, 20) },
        uTime: { value: 0 },
        uDpr: { value: 1 },
        uReveal: { value: 0 },
        uGlint: { value: -1 },
        uGlintAmp: { value: 0 },
        uCutPhase: { value: 0 },
        uSceneGlow: { value: 1 },
        uMenuFade: { value: 1 },
        uSteelCol: { value: new THREE.Color(...this.theme.steel) },
        uAccentCol: { value: new THREE.Color(...this.theme.accent) },
        uRimCol: { value: new THREE.Color(...this.theme.rim) },
        uOutlineCol: { value: new THREE.Color(...this.theme.outline) },
      },
    });
    this.bladeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bladeMat);
    this.bladeMesh.renderOrder = 89;
    ov.scene.add(this.bladeMesh);

    // 4. Sweeping unseen-blade slash arc
    this.slashMat = new THREE.ShaderMaterial({
      vertexShader: SLASH_VS,
      fragmentShader: SLASH_FS,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPos: { value: -1 },
        uAmp: { value: 0 },
        uAspect: { value: 3.0 },
        uMenuFade: { value: 1 },
        uCol: { value: new THREE.Color(...this.theme.steel) },
      },
    });
    this.slashMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.slashMat);
    this.slashMesh.renderOrder = 91;
    this.slashMesh.visible = false;
    ov.scene.add(this.slashMesh);

    // 5. Foreground wind-coupled weather motes & burst sparks
    const posArr = new Float32Array(TOTAL_MOTES * 3);
    const colArr = new Float32Array(TOTAL_MOTES * 4);
    const sizeArr = new Float32Array(TOTAL_MOTES);
    const pg = new THREE.BufferGeometry();
    this.motePos = new THREE.BufferAttribute(posArr, 3);
    this.motePos.setUsage(THREE.DynamicDrawUsage);
    this.moteCol = new THREE.BufferAttribute(colArr, 4);
    this.moteCol.setUsage(THREE.DynamicDrawUsage);
    pg.setAttribute('position', this.motePos);
    pg.setAttribute('aCol', this.moteCol);
    pg.setAttribute('aSize', new THREE.BufferAttribute(sizeArr, 1));

    this.moteMat = new THREE.ShaderMaterial({
      vertexShader: MOTE_VS,
      fragmentShader: MOTE_FS,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uDpr: { value: 1 },
        uMenuFade: { value: 1 },
      },
    });
    this.motePts = new THREE.Points(pg, this.moteMat);
    this.motePts.frustumCulled = false;
    this.motePts.renderOrder = 92;
    ov.scene.add(this.motePts);

    this.initMotes(sizeArr);
  }

  private initMotes(sizeArr: Float32Array) {
    // Deterministic PRNG so virtual-time captures remain repeatable
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const kind = this.theme.moteKind;
    for (let i = 0; i < AMBIENT_MOTES; i++) {
      const warm = kind === 'snowFire' ? i >= 20 : kind === 'embers';
      const sz = warm ? 2.0 + rnd() * 1.4 : kind === 'rain' ? 1.8 + rnd() * 0.9 : 2.0 + rnd() * 1.8;
      sizeArr[i] = sz;
      this.ambient.push({
        x: (rnd() - 0.5) * 2.0,
        y: (rnd() - 0.5) * 2.0,
        vx: 0.7 + rnd() * 0.6,
        vy: 0.7 + rnd() * 0.6,
        phase: rnd() * Math.PI * 2,
        size: sz,
        warm,
      });
    }
    for (let i = 0; i < SPARK_MOTES; i++) {
      const sz = 3.0 + rnd() * 2.0;
      sizeArr[AMBIENT_MOTES + i] = sz;
      this.sparks.push({ x: 0, y: 0, vx: 0, vy: 0, age: 99, life: 0.5, size: sz, crimson: i % 4 === 0 });
    }
  }

  /** Build/rebuild the per-glyph atlas and geometry when viewport, dpr, or language changes. */
  layout(label: string, cx: number, cy: number, S: number, track: number, dpr: number, W: number, H: number): TitleBox {
    const chars = [...label];
    const totalW = (pixW(label) + track * Math.max(0, chars.length - 1)) * S;
    const gh = PIX_H * S;
    const o = Math.max(1, Math.round(S * 0.18));
    const drop = Math.max(o, Math.round(S * 0.42));
    const padX = Math.max(S * 2, o + Math.ceil(7 * dpr));
    const padTop = Math.max(S, o + 2);
    const padBot = Math.max(S, Math.max(o, drop) + 2);

    interface GlyphEntry {
      ch: string;
      visX: number;
      gw: number;
      cellX: number;
      cellW: number;
    }
    const entries: GlyphEntry[] = [];
    let cursorX = 0;
    let atlasW = 0;
    for (const ch of chars) {
      const gw = pixW(ch) * S;
      if (ch.trim().length > 0 && gw > 0) {
        const cellW = gw + padX * 2;
        entries.push({ ch, visX: cursorX, gw, cellX: atlasW, cellW });
        atlasW += cellW;
      }
      cursorX += gw + track * S;
    }
    atlasW = Math.max(4, atlasW);
    const atlasH = Math.max(4, gh + padTop + padBot);

    this.atlas?.dispose();
    this.atlas = canvasTex(
      atlasW,
      atlasH,
      g => {
        g.imageSmoothingEnabled = false;
        for (const e of entries) {
          const ox = e.cellX + padX;
          const oy = padTop;
          // 1. Vertical axis chisel shadow (no diagonal stair-steps)
          drawPix(g, e.ch, ox, oy + drop, { scale: S, color: '#007000', outline: null });
          // 2. Crisp 4-way outline
          for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) {
            drawPix(g, e.ch, ox + dx, oy + dy, { scale: S, color: '#00ff00', outline: null });
          }
          // 3. Crisp face mask
          drawPix(g, e.ch, ox, oy, { scale: S, color: '#ff0000', outline: null });
        }
      },
      { nearest: true },
    ) as THREE.CanvasTexture;
    // Crucial: keep raw mask channel values intact without sRGB gamma conversion
    this.atlas.colorSpace = THREE.NoColorSpace;
    this.atlas.needsUpdate = true;

    // Build merged geometry for all visible glyphs in CSS px centered at (0, 0)
    const n = entries.length;
    const pos = new Float32Array(n * 6 * 3);
    const uv = new Float32Array(n * 6 * 2);
    const aLocal = new Float32Array(n * 6 * 2);
    const aMetrics = new Float32Array(n * 6 * 4);
    const aUvBounds = new Float32Array(n * 6 * 2);

    const invW = 1 / atlasW;
    const invK = 1 / dpr;
    const halfW = totalW * 0.5;
    const halfH = gh * 0.5;
    const yT = (halfH + padTop) * invK;
    const yB = -(halfH + padBot) * invK;
    const locT = 1 + padTop / gh;
    const locB = -padBot / gh;

    entries.forEach((e, idx) => {
      const xL = (e.visX - padX - halfW) * invK;
      const xR = (e.visX + e.gw + padX - halfW) * invK;
      const u0 = e.cellX * invW;
      const u1 = (e.cellX + e.cellW) * invW;
      const locL = -padX / e.gw;
      const locR = 1 + padX / e.gw;
      const txL = (e.visX - padX) / Math.max(1, totalW);
      const txR = (e.visX + e.gw + padX) / Math.max(1, totalW);
      const isLast = idx === n - 1 ? 1 : 0;

      // Two triangles (CCW): TL, BL, TR, TR, BL, BR
      const verts: Array<[number, number, number, number, number, number, number]> = [
        [xL, yT, u0, 1, locL, locT, txL],
        [xL, yB, u0, 0, locL, locB, txL],
        [xR, yT, u1, 1, locR, locT, txR],
        [xR, yT, u1, 1, locR, locT, txR],
        [xL, yB, u0, 0, locL, locB, txL],
        [xR, yB, u1, 0, locR, locB, txR],
      ];
      for (let v = 0; v < 6; v++) {
        const vi = idx * 6 + v;
        const [vx, vy, vu, vv, lx, ly, tx] = verts[v];
        pos[vi * 3] = vx;
        pos[vi * 3 + 1] = vy;
        pos[vi * 3 + 2] = 0;
        uv[vi * 2] = vu;
        uv[vi * 2 + 1] = vv;
        aLocal[vi * 2] = lx;
        aLocal[vi * 2 + 1] = ly;
        aMetrics[vi * 4] = idx;
        aMetrics[vi * 4 + 1] = n;
        aMetrics[vi * 4 + 2] = tx;
        aMetrics[vi * 4 + 3] = isLast;
        aUvBounds[vi * 2] = u0;
        aUvBounds[vi * 2 + 1] = u1;
      }
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aLocal', new THREE.BufferAttribute(aLocal, 2));
    geo.setAttribute('aMetrics', new THREE.BufferAttribute(aMetrics, 4));
    geo.setAttribute('aUvBounds', new THREE.BufferAttribute(aUvBounds, 2));

    if (this.titleMesh) {
      this.ov.scene.remove(this.titleMesh);
      this.titleMesh.geometry.dispose();
    }
    this.titleMesh = new THREE.Mesh(geo, this.titleMat);
    this.titleMesh.renderOrder = 90;
    this.titleMesh.position.set(cx, -cy, 0);
    this.titleMesh.visible = this.visible;
    this.ov.scene.add(this.titleMesh);

    const tu = this.titleMat.uniforms;
    tu.tAtlas.value = this.atlas;
    tu.uInvAtlasW.value = invW;
    tu.uHalfTexelX.value = 0.5 * invW;
    tu.uFontStepY.value = S / atlasH;
    tu.uDpr.value = dpr;

    const textW = totalW * invK;
    const textH = gh * invK;
    this.textSize = { w: textW, h: textH };

    // Position backdrop sound ripple
    const ripW = Math.max(textW * 1.75, 280);
    const ripH = Math.max(textH * 2.15, 140);
    this.rippleMesh.position.set(cx, -cy, 0);
    this.rippleMesh.scale.set(ripW, ripH, 1);
    (this.rippleMat.uniforms.uSizePx.value as THREE.Vector2).set(ripW * dpr, ripH * dpr);

    // Position blade underline & crimson silk trace
    const titleBottom = cy + textH * 0.5;
    const bladeGap = Math.round(Math.max(8, H * 0.016));
    const bladeW = Math.round(Math.min(W * 0.40, textW * 1.14));
    const bladeH = Math.max(26, Math.round(H * 0.038));
    const bladeY = titleBottom + bladeGap + bladeH * 0.5;
    this.bladeGeo = { x: cx, y: bladeY, w: bladeW, h: bladeH };
    this.bladeMesh.position.set(cx, -bladeY, 0);
    this.bladeMesh.scale.set(bladeW, bladeH, 1);
    (this.bladeMat.uniforms.uPx.value as THREE.Vector2).set(Math.max(8, Math.round(bladeW * dpr)), Math.max(8, Math.round(bladeH * dpr)));
    this.bladeMat.uniforms.uDpr.value = dpr;

    // Position sweeping slash plane
    const slashW = textW * 1.52;
    const slashH = textH * 1.38;
    this.slashMesh.position.set(cx, -cy, 0);
    this.slashMesh.scale.set(slashW, slashH, 1);
    this.slashMat.uniforms.uAspect.value = slashW / Math.max(1, slashH);

    // Points DPR
    this.moteMat.uniforms.uDpr.value = dpr;

    this.box = {
      cx,
      cy,
      x: Math.round(cx - textW * 0.5),
      y: Math.round(cy - textH * 0.5),
      w: Math.round(textW),
      h: Math.round(textH),
      bladeBottom: Math.round(bladeY + bladeH * 0.5),
    };
    return this.box;
  }

  /** Subtle acoustic + steel response when the player switches menu selection. */
  pulse() {
    this.spawnRing(0.13);
    if (this.glintTimer < 0 || this.glintKind === 'idle') {
      this.startGlint('pulse');
    }
    const bx = this.bladeGeo.x + this.bladeGeo.w * 0.44;
    const by = this.bladeGeo.y;
    for (let i = 0; i < 4; i++) {
      this.spawnSpark(bx - i * 8, by, 70 + i * 24, -18 - i * 16, 0.36, i === 0);
    }
  }

  /** Dramatic blade-draw confirmation when starting / continuing the game. */
  triggerCut() {
    if (this.cutTriggered) return;
    this.cutTriggered = true;
    this.startGlint('cut');
    this.spawnRing(0.22);
    const rightX = this.box.cx + this.textSize.w * 0.42;
    const waistY = this.box.cy;
    for (let i = 0; i < SPARK_MOTES; i++) {
      const k = i / SPARK_MOTES;
      const sx = this.box.cx - this.textSize.w * 0.35 + k * this.textSize.w * 0.85;
      const sy = waistY + (k - 0.5) * -this.textSize.h * 0.08;
      this.spawnSpark(sx, sy, 90 + k * 140, -35 + ((i % 5) - 2) * 28, 0.45 + (i % 3) * 0.12, i % 3 === 0);
    }
    this.spawnSpark(rightX, waistY, 160, -24, 0.55, true);
  }

  setVisible(vis: boolean) {
    this.visible = vis;
    if (this.titleMesh) this.titleMesh.visible = vis;
    this.rippleMesh.visible = vis;
    this.bladeMesh.visible = vis;
    this.slashMesh.visible = vis && this.glintTimer >= 0;
    this.motePts.visible = vis;
  }

  update(rdt: number, t: number, env: TitleFxEnv) {
    if (!this.visible) return;
    this.enterT = t;
    const fade = env.menuFade;
    const show = fade > 0.01;
    if (this.titleMesh) this.titleMesh.visible = show;
    this.rippleMesh.visible = show;
    this.bladeMesh.visible = show;
    this.motePts.visible = show;

    // 1. Acoustic entrance + periodic pre-glint sound wave + lightning ripple
    if (!this.didEntryRipple && t >= 0.18) {
      this.didEntryRipple = true;
      this.spawnRing(0.20);
    }
    if (!this.didEntrySlash && t >= 0.52) {
      this.didEntrySlash = true;
      this.startGlint('cut');
    }
    if (!this.didEntrySparks && t >= 1.12) {
      this.didEntrySparks = true;
      const rx = this.box.cx + this.textSize.w * 0.38;
      const ry = this.box.cy;
      for (let i = 0; i < 6; i++) {
        this.spawnSpark(rx - (i % 3) * 14, ry + ((i % 2) - 0.5) * 8, 55 + i * 20, -25 - i * 14, 0.55, i === 0);
      }
    }

    // Periodic idle cycle every GLINT_PERIOD seconds after entrance
    if (t > 2.2 && !this.cutTriggered) {
      const cyc = Math.floor((t - 2.2) / GLINT_PERIOD);
      const local = (t - 2.2) - cyc * GLINT_PERIOD;
      if (cyc > this.lastIdleCycle && local >= 0.0) {
        this.lastIdleCycle = cyc;
        this.spawnRing(0.12);
      }
      if (local >= 0.35 && local - rdt < 0.35 && this.glintTimer < 0) {
        this.startGlint('idle');
      }
    }

    if (env.flash > 0.45 && t - this.lastFlashRing > 1.0) {
      this.lastFlashRing = t;
      this.spawnRing(0.18);
    }

    // Advance sound ripples
    if (this.ringA >= 0) {
      this.ringA += rdt / 1.35;
      if (this.ringA > 1) this.ringA = -1;
    }
    if (this.ringB >= 0) {
      this.ringB += rdt / 1.35;
      if (this.ringB > 1) this.ringB = -1;
    }

    // Advance blade glint / slash arc
    let glintPos = -1;
    let glintAmp = 0;
    let slashPos = -1;
    let slashAmp = 0;
    if (this.glintTimer >= 0) {
      const dur = this.glintKind === 'cut' ? 0.74 : this.glintKind === 'pulse' ? 0.38 : 0.52;
      this.glintTimer += rdt;
      this.glintProg = Math.min(1, this.glintTimer / dur);
      const eased = 1 - Math.pow(1 - this.glintProg, 2.2);
      glintPos = -0.15 + eased * 1.35;
      slashPos = -0.05 + eased * 1.15;
      const bell = Math.sin(this.glintProg * Math.PI);
      glintAmp = this.glintKind === 'cut' ? bell * 1.15 : this.glintKind === 'pulse' ? bell * 0.72 : bell * 0.56;
      slashAmp = this.glintKind === 'cut' ? bell * 0.95 : this.glintKind === 'pulse' ? bell * 0.32 : bell * 0.42;
      if (this.glintTimer >= dur) this.glintTimer = -1;
    }

    this.slashMesh.visible = show && slashAmp > 0.01;
    this.slashMat.uniforms.uPos.value = slashPos;
    this.slashMat.uniforms.uAmp.value = slashAmp;
    this.slashMat.uniforms.uMenuFade.value = fade;

    // Confirm cut phase (during draw / cut beats)
    if (env.beat === 'draw') {
      this.cutPhase = Math.min(0.65, env.beatT / 0.16 * 0.65);
    } else if (env.beat === 'cut') {
      this.cutPhase = Math.min(1.0, 0.65 + env.beatT / 0.12 * 0.35);
    } else {
      this.cutPhase = Math.max(0, this.cutPhase - rdt * 4);
    }

    // Blade underline unsheathe reveal (0.36s -> 0.94s)
    const revRaw = Math.max(0, Math.min(1, (t - 0.36) / 0.58));
    const reveal = 1 - Math.pow(1 - revRaw, 3);

    // Subtle pointer parallax
    const px = env.pointerX;
    const py = env.pointerY;
    this.rippleMesh.position.set(this.box.cx + px * 1.4, -(this.box.cy - py * 1.0), 0);
    this.bladeMesh.position.set(this.bladeGeo.x + px * 2.1, -(this.bladeGeo.y - py * 1.4), 0);
    this.slashMesh.position.set(this.box.cx + px * 3.0, -(this.box.cy - py * 2.0), 0);

    // Update Title Glyph uniforms
    const tu = this.titleMat.uniforms;
    tu.uTime.value = t;
    tu.uEnter.value = this.enterT;
    tu.uFlash.value = env.flash;
    (tu.uPointer.value as THREE.Vector2).set(px, py);
    tu.uGlint.value = glintPos;
    tu.uGlintAmp.value = glintAmp;
    tu.uCutPhase.value = this.cutPhase;
    tu.uSceneGlow.value = env.fireGlow;
    tu.uMenuFade.value = fade;

    // Update Ripple uniforms
    const ru = this.rippleMat.uniforms;
    ru.uRingA.value = this.ringA;
    ru.uRingB.value = this.ringB;
    ru.uAmpA.value = this.ringAmpA;
    ru.uAmpB.value = this.ringAmpB;
    ru.uConfirmPull.value = env.beat === 'draw' ? Math.min(1, env.beatT / 0.16) : 0;
    ru.uMenuFade.value = fade;

    // Update Blade Underline uniforms
    const bu = this.bladeMat.uniforms;
    bu.uTime.value = t;
    bu.uReveal.value = reveal;
    bu.uGlint.value = glintPos;
    bu.uGlintAmp.value = glintAmp;
    bu.uCutPhase.value = this.cutPhase;
    bu.uSceneGlow.value = env.fireGlow;
    bu.uMenuFade.value = fade;

    // Update foreground weather motes & burst sparks
    this.updateMotes(rdt, t, env);
    this.moteMat.uniforms.uMenuFade.value = fade;
  }

  private spawnRing(amp: number) {
    if (this.ringA < 0) {
      this.ringA = 0;
      this.ringAmpA = amp;
    } else if (this.ringB < 0) {
      this.ringB = 0;
      this.ringAmpB = amp;
    } else if (this.ringA > this.ringB) {
      this.ringA = 0;
      this.ringAmpA = amp;
    } else {
      this.ringB = 0;
      this.ringAmpB = amp;
    }
  }

  private startGlint(kind: 'idle' | 'pulse' | 'cut') {
    this.glintKind = kind;
    this.glintTimer = 0;
    this.glintProg = 0;
  }

  private spawnSpark(x: number, y: number, vx: number, vy: number, life: number, crimson: boolean) {
    const idx = this.moteCursor % SPARK_MOTES;
    this.moteCursor++;
    const s = this.sparks[idx];
    s.x = x;
    s.y = y;
    s.vx = vx;
    s.vy = vy;
    s.age = 0;
    s.life = life;
    s.crimson = crimson;
  }

  private updateMotes(rdt: number, t: number, env: TitleFxEnv) {
    const pos = this.motePos.array as Float32Array;
    const col = this.moteCol.array as Float32Array;
    const zoneW = Math.max(this.textSize.w * 1.85, 340);
    const zoneH = Math.max(this.textSize.h * 2.45, 200);
    const halfW = zoneW * 0.5;
    const halfH = zoneH * 0.5;
    const cx = this.box.cx;
    const cy = this.box.cy + 14;
    const gust = env.gust;
    const kind = this.theme.moteKind;

    for (let i = 0; i < AMBIENT_MOTES; i++) {
      const m = this.ambient[i];
      if (kind === 'snowFire') {
        if (m.warm) {
          m.x += (0.10 + 0.14 * gust + 0.06 * Math.sin(t * 1.4 + m.phase)) * m.vx * rdt;
          m.y -= (0.24 + 0.06 * Math.sin(t * 1.9 + m.phase)) * m.vy * rdt;
        } else {
          m.x += (0.14 + 0.24 * gust + 0.07 * Math.sin(t * 0.8 + m.phase)) * m.vx * rdt;
          m.y += (0.22 + 0.05 * Math.cos(t * 0.7 + m.phase)) * m.vy * rdt;
        }
      } else if (kind === 'rain') {
        m.x += (0.12 + 0.16 * gust) * m.vx * rdt;
        m.y += (0.72 + 0.15 * m.vy) * rdt;
      } else if (kind === 'chaff') {
        m.x += (0.26 + 0.22 * gust) * m.vx * rdt;
        m.y += 0.07 * Math.sin(t * 1.5 + m.phase) * rdt;
      } else if (kind === 'mist') {
        m.x += (0.09 + 0.10 * gust) * m.vx * rdt;
        m.y += 0.03 * Math.sin(t * 0.9 + m.phase) * rdt;
      } else {
        m.x += (0.10 + 0.15 * gust + 0.07 * Math.sin(t * 1.6 + m.phase)) * m.vx * rdt;
        m.y -= (0.26 + 0.08 * m.vy) * rdt;
      }

      if (m.x > 1.05) m.x = -1.05;
      else if (m.x < -1.05) m.x = 1.05;
      if (m.y > 1.05) m.y = -1.05;
      else if (m.y < -1.05) m.y = 1.05;

      const wx = cx + m.x * halfW;
      const wy = cy + m.y * halfH;
      pos[i * 3] = wx;
      pos[i * 3 + 1] = -wy;
      pos[i * 3 + 2] = 0;

      const edgeX = Math.max(0, 1 - Math.max(0, Math.abs(m.x) - 0.55) / 0.48);
      const edgeY = Math.max(0, 1 - Math.max(0, Math.abs(m.y) - 0.55) / 0.48);
      const fadeIn = Math.min(1, Math.max(0, (t - 0.4) / 1.4));
      const twinkle = m.warm ? 0.55 + 0.45 * Math.sin(t * 7.5 + m.phase * 5) : 0.78 + 0.22 * Math.sin(t * 2.4 + m.phase);
      const baseA = m.warm ? 0.72 * (0.75 + 0.25 * env.fireGlow) : kind === 'rain' ? 0.46 : 0.58;
      const a = edgeX * edgeY * fadeIn * twinkle * baseA;

      if (m.warm) {
        col[i * 4] = 1.0;
        col[i * 4 + 1] = 0.50 + 0.18 * Math.sin(t * 5 + m.phase);
        col[i * 4 + 2] = 0.18;
      } else if (kind === 'chaff') {
        col[i * 4] = 1.0;
        col[i * 4 + 1] = 0.82;
        col[i * 4 + 2] = 0.44;
      } else if (kind === 'rain') {
        col[i * 4] = 0.74 + 0.24 * env.flash;
        col[i * 4 + 1] = 0.86 + 0.14 * env.flash;
        col[i * 4 + 2] = 1.0;
      } else {
        col[i * 4] = 0.90 + 0.10 * env.flash;
        col[i * 4 + 1] = 0.94 + 0.06 * env.flash;
        col[i * 4 + 2] = 1.0;
      }
      col[i * 4 + 3] = a;
    }

    // Burst sparks
    for (let i = 0; i < SPARK_MOTES; i++) {
      const s = this.sparks[i];
      const pi = AMBIENT_MOTES + i;
      if (s.age < s.life) {
        s.age += rdt;
        s.x += s.vx * rdt;
        s.y += s.vy * rdt;
        s.vx *= Math.max(0, 1 - rdt * 3.5);
        s.vy += 65 * rdt;
        const k = Math.max(0, 1 - s.age / s.life);
        pos[pi * 3] = s.x;
        pos[pi * 3 + 1] = -s.y;
        pos[pi * 3 + 2] = 0;
        if (s.crimson) {
          col[pi * 4] = this.theme.accent[0] * 1.15;
          col[pi * 4 + 1] = this.theme.accent[1] * 1.25;
          col[pi * 4 + 2] = this.theme.accent[2] * 1.15;
        } else {
          col[pi * 4] = this.theme.steel[0];
          col[pi * 4 + 1] = this.theme.steel[1];
          col[pi * 4 + 2] = this.theme.steel[2];
        }
        col[pi * 4 + 3] = k * k * 0.95;
      } else {
        pos[pi * 3] = -9999;
        pos[pi * 3 + 1] = 9999;
        pos[pi * 3 + 2] = 0;
        col[pi * 4 + 3] = 0;
      }
    }

    this.motePos.needsUpdate = true;
    this.moteCol.needsUpdate = true;
  }

  dispose() {
    const sc = this.ov.scene;
    if (this.titleMesh) {
      sc.remove(this.titleMesh);
      this.titleMesh.geometry.dispose();
      this.titleMesh = null;
    }
    this.titleMat.dispose();
    this.atlas?.dispose();
    this.atlas = null;

    sc.remove(this.rippleMesh);
    this.rippleMesh.geometry.dispose();
    this.rippleMat.dispose();

    sc.remove(this.bladeMesh);
    this.bladeMesh.geometry.dispose();
    this.bladeMat.dispose();

    sc.remove(this.slashMesh);
    this.slashMesh.geometry.dispose();
    this.slashMat.dispose();

    sc.remove(this.motePts);
    this.motePts.geometry.dispose();
    this.moteMat.dispose();
  }
}
