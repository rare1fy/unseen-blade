// Cel-shaded materials: MeshToon with a 4-step ramp, a cool moonlight rim, optional emissive. Ink lines come from the post pass.
import * as THREE from 'three';
import { CAPS } from '../engine/perfOpts';

let ramp: THREE.DataTexture | null = null;
export function toonRamp() {
  if (ramp) return ramp;
  const steps = [0.32, 0.52, 0.78, 1.0], n = 64, data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { const t = i / (n - 1), s = t < 0.22 ? steps[0] : t < 0.45 ? steps[1] : t < 0.75 ? steps[2] : steps[3], v = Math.round(s * 255); data.set([v, v, v, 255], i * 4); }
  ramp = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat); ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  return ramp;
}

export const RIM = { color: new THREE.Color(0x9ab8ff), strength: 0.55, power: 2.6 };
const rimUniforms = { uRimColor: { value: RIM.color }, uRimStrength: { value: RIM.strength }, uRimPow: { value: RIM.power } };
export function setRim(color: THREE.ColorRepresentation, strength: number) { RIM.color.set(color); rimUniforms.uRimStrength.value = strength; }

export interface ToonOpts { emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; map?: THREE.Texture | null; vertexColors?: boolean; rim?: number; transparent?: boolean; opacity?: number; side?: THREE.Side; flat?: boolean; /** albedo-proportional self light: lifts dark colours without washing their hue (characters) */ self?: number }
const cache = new Map<string, THREE.MeshToonMaterial>();

/** A shared toon material (cached by its parameters so meshes batch onto the same program). */
export function toon(color: THREE.ColorRepresentation, o: ToonOpts = {}): THREE.MeshToonMaterial {
  const key = !o.map && !o.transparent ? `${new THREE.Color(color).getHexString()}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.vertexColors ? 1 : 0}|${o.rim ?? ''}|${o.side ?? ''}|${o.flat ? 1 : 0}|${o.self ?? 0}` : '';
  if (key && cache.has(key)) return cache.get(key)!;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1, map: o.map ?? null, vertexColors: !!o.vertexColors, transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide });
  // (11-18 微信小游戏: flat shading needs dFdx / dFdy — where there are none (the devtools' WebGL1) the mesh normals are used; read at compile time)
  if (o.flat) { let want = true; Object.defineProperty(m, 'flatShading', { get: () => want && CAPS.derivatives, set: v => { want = !!v; }, configurable: true }); }
  const rimK = o.rim ?? 1, selfK = o.self ?? 0;
  m.onBeforeCompile = sh => {
    sh.uniforms.uRimColor = rimUniforms.uRimColor; sh.uniforms.uRimStrength = rimUniforms.uRimStrength; sh.uniforms.uRimPow = rimUniforms.uRimPow; sh.uniforms.uRimK = { value: rimK }; sh.uniforms.uSelf = { value: selfK };
    sh.fragmentShader = 'uniform vec3 uRimColor; uniform float uRimStrength, uRimPow, uRimK, uSelf;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
      `{ float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPow); outgoingLight += uRimColor * smoothstep(0.35, 0.6, rim) * uRimStrength * uRimK * (0.5 + 0.5 * diffuseColor.rgb) + diffuseColor.rgb * uSelf; }
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'toonrim' + rimK + '|' + selfK;
  if (key) cache.set(key, m);
  return m;
}

/** Unlit glowing material (soul fire, eyes, runes) — values above 1 feed the bloom. */
export function glow(color: THREE.ColorRepresentation, intensity = 2.5, o: { transparent?: boolean; opacity?: number; additive?: boolean } = {}) {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({ color: c, transparent: !!o.transparent || !!o.additive, opacity: o.opacity ?? 1, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.additive, toneMapped: false });
}
