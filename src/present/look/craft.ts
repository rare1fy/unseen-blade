// Stylized high-craft voxel rendering presets ("画风实验"):
//   off     (0): original 2x toon-pixel look
//   ink     (1): A · 国风版画 — 1x sharp graphic ink outlines (matches 3D iron UI), crisp 2-step cel + warm terminator rim, sliced anime specular, subtle paper tooth
//   hd2d    (2): B · HD-2D像素 — keeps 2x pixel grid (matches voxel precision) + next-gen smooth HDR bloom, deep indigo shadows, warm lantern pools, cloud dapple & subtle tilt-shift
//   diorama (3): C · 精致微缩 — 1x pristine noiseless artisan lacquer blocks, crisp micro-chamfers, airy sky/ground bounce GI, satin clearcoat & diorama tilt-shift (The Touryst / Tunic)
// Controlled purely via shared uniforms (zero shader recompilation on switch) and WebGL1-safe.
import * as THREE from 'three';
import { PX, setPixel } from './pixel';

export type CraftMode = 'off' | 'ink' | 'hd2d' | 'diorama';
export const CRAFT_ORDER: CraftMode[] = ['off', 'ink', 'hd2d', 'diorama'];
const MODE_ID: Record<CraftMode, number> = { off: 0, ink: 1, hd2d: 2, diorama: 3 };
const MODE_NAME: Record<CraftMode, string> = {
  off: '关（原版 2x）',
  ink: 'A · 国风版画（1x 墨线赛璐璐）',
  hd2d: 'B · HD-2D 像素（2x 光影氛围）',
  diorama: 'C · 精致微缩（1x 漆器手办）',
};
const MODE_SHORT: Record<CraftMode, string> = {
  off: '画风：原版',
  ink: '画风：国风版画',
  hd2d: '画风：HD-2D',
  diorama: '画风：精致微缩',
};

export const CRAFT = {
  mode: 'off' as CraftMode,
  get on() { return this.mode !== 'off'; },
  prevPx: { on: true, size: 2 },
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
  uCraftDof: { value: 0 },
  uCraftGrain: { value: 1 },
  uCraftSpec: { value: 1 },
  uCraftTime: { value: 0 },
};

function parseMode(v: CraftMode | boolean | number | string): CraftMode {
  if (v === false || v === 0 || v === '0' || v === 'off' || v === 'false') return 'off';
  if (v === true || v === 1 || v === '1' || v === 'a' || v === 'A' || v === 'ink') return 'ink';
  if (v === 2 || v === '2' || v === 'b' || v === 'B' || v === 'hd2d') return 'hd2d';
  if (v === 3 || v === '3' || v === 'c' || v === 'C' || v === 'diorama') return 'diorama';
  return 'off';
}

export function setCraft(target: CraftMode | boolean | number | string, keepPixel = false): CraftMode {
  const next = parseMode(target);
  const prev = CRAFT.mode;
  if (prev === 'off' && next !== 'off') CRAFT.prevPx = { on: PX.on, size: PX.size };
  CRAFT.mode = next;
  CRAFTU.uCraft.value = MODE_ID[next];
  if (!keepPixel) {
    if (next === 'off') setPixel(CRAFT.prevPx.on, CRAFT.prevPx.size);
    else if (next === 'hd2d') setPixel(true, 2);
    else setPixel(true, 1);
  }
  try { if (typeof localStorage !== 'undefined') localStorage.setItem('ub.craft', next); } catch { /* private mode */ }
  return next;
}

export function cycleCraft(): CraftMode {
  const idx = CRAFT_ORDER.indexOf(CRAFT.mode);
  return setCraft(CRAFT_ORDER[(idx + 1) % CRAFT_ORDER.length]);
}

export function syncCraftUniforms(time: number) {
  const m = MODE_ID[CRAFT.mode];
  CRAFTU.uCraft.value = m;
  CRAFTU.uCraftDof.value = (m === 2 ? 0.62 : m === 3 ? 0.84 : 0) * CRAFT.dof;
  CRAFTU.uCraftGrain.value = CRAFT.grain;
  CRAFTU.uCraftSpec.value = CRAFT.spec;
  CRAFTU.uCraftTime.value = time;
}

export function readCraftFlag(query: (k: string) => string | null): CraftMode | null {
  const q = query('craft');
  if (q == null) return null;
  return parseMode(q);
}

export const craftLabel = () => `画风实验：${MODE_NAME[CRAFT.mode]}（点这里换）`;
export const craftShort = () => MODE_SHORT[CRAFT.mode];

/** Attach animated procedural ripples + Fresnel sky sheen + 45° camera wave glints to any water material (WebGL1-safe). */
export function attachCraftWater(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCraft = CRAFTU.uCraft;
    sh.uniforms.uCraftTime = CRAFTU.uCraftTime;
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWPos; uniform float uCraft, uCraftTime;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `{
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
        // keep water specular strictly below bloom threshold so pools shimmer without neon white-out
        vec3 over = max(wCol - vec3(0.84), vec3(0.0));
        outgoingLight = min(wCol, vec3(0.84)) + over / (vec3(1.0) + over * 5.0);
        diffuseColor.a = mix(0.84, 0.96, fres);
      }
    }
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'craftwater2';
  return mat;
}
