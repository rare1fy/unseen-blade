// Visual style presets ("画面风格"):
//   off     (0): Classic 2x toon-pixel look
//   ink     (1): Ink Print (国风版画) — 1x sharp graphic ink outlines (matches 3D iron UI), crisp 2-step cel + warm terminator rim, sliced anime specular, resolution-normalized Xuan-paper tooth
//   hd2d    (2): HD-2D — 2x crisp voxel pixel world + native-resolution silky HDR bloom, optical tilt-shift bokeh (tier-scaled), deep indigo shadows, warm lantern pools & drifting cloud dapple
//   diorama (3): Diorama (精致微缩) — 1x pristine noiseless artisan lacquer blocks, crisp micro-chamfers, airy sky/ground bounce GI, satin clearcoat & diorama tilt-shift
// Controlled purely via shared uniforms (zero shader recompilation on switch) and WebGL1-safe.
import * as THREE from 'three';
import type { Platform } from '../../platform/index';
import { msg } from '../act/i18n';
import { setPixel } from './pixel';
import { QUALITY } from './quality';

export type CraftMode = 'off' | 'ink' | 'hd2d' | 'diorama';
export const CRAFT_ORDER: CraftMode[] = ['off', 'ink', 'hd2d', 'diorama'];
const MODE_ID: Record<CraftMode, number> = { off: 0, ink: 1, hd2d: 2, diorama: 3 };
const STYLE_NAME: Record<CraftMode, string> = {
  off: '经典',
  ink: '国风版画',
  hd2d: 'HD-2D',
  diorama: '精致微缩',
};

export const PX_POLISH = {
  /** Classic 2x pixel-voxel craft upgrades (hue-shifted 4-step cel, tinted 1px ink, wall-base grounding, pixel water, figure-ground calm, anti-bloom cap) */
  on: true,
};

export const CRAFT = {
  mode: 'off' as CraftMode,
  get on() { return this.mode !== 'off'; },
  /** live-tunable multipliers */
  dof: 1.0,
  ink: 1.0,
  grain: 1.0,
  spec: 1.0,
};

/** Shared shader uniforms updated live without recompiling materials */
export const CRAFTU = {
  /** 0 = off, 1 = ink, 2 = hd2d, 3 = diorama */
  uCraft: { value: 0 },
  /** 1 = classic 2x pixel polish active (when uCraft == 0) */
  uPxPolish: { value: 1 },
  uCraftDof: { value: 0 },
  uCraftGrain: { value: 1 },
  uCraftSpec: { value: 1 },
  uCraftTime: { value: 0 },
};

export function setPxPolish(on: boolean): boolean {
  PX_POLISH.on = !!on;
  CRAFTU.uPxPolish.value = PX_POLISH.on ? 1 : 0;
  return PX_POLISH.on;
}

let P: Platform | null = null;

function parseMode(v: CraftMode | boolean | number | string): CraftMode {
  if (v === false || v === 0 || v === '0' || v === 'off' || v === 'false') return 'off';
  if (v === true || v === 1 || v === '1' || v === 'a' || v === 'A' || v === 'ink') return 'ink';
  if (v === 2 || v === '2' || v === 'b' || v === 'B' || v === 'hd2d') return 'hd2d';
  if (v === 3 || v === '3' || v === 'c' || v === 'C' || v === 'diorama') return 'diorama';
  return 'off';
}

export function setCraft(target: CraftMode | boolean | number | string, keepPixel = false, persist = true): CraftMode {
  const next = parseMode(target);
  CRAFT.mode = next;
  CRAFTU.uCraft.value = MODE_ID[next];
  if (!keepPixel) {
    // always lock each preset to its canonical pixel size so earlier pixel settings never contaminate the chosen look
    if (next === 'off' || next === 'hd2d') setPixel(true, 2);
    else setPixel(true, 1);
  }
  if (persist) {
    try { P?.storage?.set('ub.craft', next); } catch { /* storage blocked */ }
  }
  return next;
}

export function cycleCraft(): CraftMode {
  const idx = CRAFT_ORDER.indexOf(CRAFT.mode);
  return setCraft(CRAFT_ORDER[(idx + 1) % CRAFT_ORDER.length]);
}

export function syncCraftUniforms(time: number) {
  const m = MODE_ID[CRAFT.mode];
  CRAFTU.uCraft.value = m;
  CRAFTU.uPxPolish.value = PX_POLISH.on ? 1 : 0;
  // low quality tier disables tilt-shift DOF automatically for WeChat mobile GPU safety
  const dofTier = QUALITY.tier === 'low' ? 0 : 1;
  CRAFTU.uCraftDof.value = (m === 2 ? 0.62 : m === 3 ? 0.84 : 0) * CRAFT.dof * dofTier;
  CRAFTU.uCraftGrain.value = CRAFT.grain;
  CRAFTU.uCraftSpec.value = CRAFT.spec;
  CRAFTU.uCraftTime.value = time;
}

export function readCraftFlag(query: (k: string) => string | null): CraftMode | null {
  const q = query('craft');
  if (q == null) return null;
  return parseMode(q);
}

/** Restore the player's saved visual style (all platforms: web, WeChat Mini-Game, CrazyGames) or apply ?craft= in debug builds. */
export function initCraft(platform: Platform, urlOverride: CraftMode | null = null) {
  P = platform;
  if (urlOverride != null) {
    setCraft(urlOverride, false, false);
    return;
  }
  let saved: string | null = null;
  try { saved = platform.storage?.get('ub.craft') ?? null; } catch { /* storage blocked */ }
  if (saved && saved !== '0' && saved !== 'off') setCraft(saved, false, false);
}

export const craftLabel = () => msg`画面风格：${STYLE_NAME[CRAFT.mode]}`;

/** Attach animated procedural ripples + Fresnel sky sheen + 45° camera wave glints (and hard-edged voxel-grid pixel water in classic 2x polish). WebGL1-safe. */
export function attachCraftWater(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCraft = CRAFTU.uCraft;
    sh.uniforms.uPxPolish = CRAFTU.uPxPolish;
    sh.uniforms.uCraftTime = CRAFTU.uCraftTime;
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWPos; uniform float uCraft, uPxPolish, uCraftTime;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `{
      if (uCraft > 0.5) {
        float t = uCraftTime;
        float w1 = sin(vWPos.x * 2.4 + t * 1.35 + cos(vWPos.z * 1.9 - t * 0.85) * 1.1);
        float w2 = cos(vWPos.z * 3.2 - t * 1.10 + sin(vWPos.x * 2.1 + t * 0.75) * 0.95);
        float w3 = sin((vWPos.x * 1.4 - vWPos.z * 1.9) * 3.1 + t * 1.75);
        float ripple = (w1 * 0.5 + w2 * 0.35 + w3 * 0.25);
        vec3 wn = normalize(vec3((w1 + w3 * 0.6) * 0.14, 1.0, (w2 - w3 * 0.6) * 0.14));
        vec3 vDir = normalize(cameraPosition - vWPos);
        float fres = pow(1.0 - clamp(dot(wn, vDir), 0.0, 1.0), 1.85);
        vec3 lDir = normalize(vec3(-0.22, 0.84, 0.44));
        vec3 hDir = normalize(lDir + vDir);
        float spec = pow(max(dot(wn, hDir), 0.0), 46.0) * 0.62 + pow(max(dot(wn, hDir), 0.0), 14.0) * 0.12;
        float crest = smoothstep(0.62, 0.96, ripple) * 0.13;
        vec3 deepCol = diffuseColor.rgb * (0.44 + 0.18 * (ripple * 0.5 + 0.5));
        vec3 skyRefl = vec3(0.18, 0.28, 0.42);
        vec3 wCol = mix(deepCol, skyRefl, clamp(fres * 0.56 + crest * 0.35, 0.0, 0.66)) + vec3(0.64, 0.76, 0.90) * (spec + crest * 0.28);
        vec3 over = max(wCol - vec3(0.84), vec3(0.0));
        outgoingLight = min(wCol, vec3(0.84)) + over / (vec3(1.0) + over * 5.0);
        diffuseColor.a = mix(0.84, 0.96, fres);
      } else if (uPxPolish > 0.5) {
        // Classic 2x hard-edged pixel-art water: 7cm voxel-grid horizontal ripple dashes (1 voxel tall, 3-6 wide, 4fps drift) + quiet depth swell
        vec2 cell = floor(vWPos.xz / 0.07);
        float qt = floor(uCraftTime * 4.0) / 4.0;
        // Broad horizontal depth bands (quiet, low-contrast, no egg-carton spots)
        float swell = sin(cell.y * 0.22 - qt * 0.85 + sin(cell.x * 0.055 + qt * 0.32) * 1.35);
        vec3 baseW = outgoingLight * (swell < -0.35 ? 0.86 : swell > 0.55 ? 1.08 : 1.0);
        // Staggered 1-voxel-tall horizontal ripple dashes on sparse rows (never vertically adjacent blobs)
        float row = cell.y;
        float rHash = fract(sin(row * 78.233) * 43758.5453);
        float rowOn = step(0.68, rHash) * (1.0 - step(0.68, fract(sin((row - 1.0) * 78.233) * 43758.5453)));
        float drift = floor(uCraftTime * 4.0) * (rHash > 0.84 ? 1.0 : -1.0);
        float rx = cell.x + floor(rHash * 29.0) + drift;
        float seg = floor(rx / 14.0);
        float lx = mod(rx, 14.0);
        float sHash = fract(sin(dot(vec2(seg, row), vec2(127.1, 311.7))) * 43758.5453);
        float dLen = 3.0 + floor(fract(sHash * 19.7) * 4.0);
        float dash = rowOn * step(0.56, sHash) * step(2.0, lx) * step(lx, 2.0 + dLen);
        // Sparse 2-voxel moon/sky sparkle inside active dashes (3fps twinkle)
        float st = floor(uCraftTime * 3.0);
        float tw = fract(sin(dot(vec2(seg + st * 0.41, row), vec2(269.5, 183.3))) * 43758.5453);
        float glint = dash * step(0.84, tw) * step(3.0, lx) * step(lx, 4.9);
        vec3 wCol = baseW * (1.0 + dash * 0.16) + vec3(0.032, 0.055, 0.082) * dash + vec3(0.14, 0.20, 0.28) * glint;
        vec3 over = max(wCol - vec3(0.82), vec3(0.0));
        outgoingLight = min(wCol, vec3(0.82)) + over / (vec3(1.0) + over * 5.0);
      }
    }
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'craftwater3';
  return mat;
}
