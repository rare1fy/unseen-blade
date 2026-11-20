// Cel-shaded materials: MeshToon with a 4-step ramp, a cool moonlight rim, optional emissive. Ink lines come from the post pass.
// High-craft mode (look/craft.ts, uniform uCraft): smooth sculpted half-Lambert + cool shadow tint + material-aware Blinn-Phong specular.
import * as THREE from 'three';
import { CAPS } from '../engine/perfOpts';
import { CRAFTU } from './craft';

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
    sh.uniforms.uCraft = CRAFTU.uCraft; sh.uniforms.uCraftSpec = CRAFTU.uCraftSpec;
    sh.fragmentShader = 'uniform vec3 uRimColor; uniform float uRimStrength, uRimPow, uRimK, uSelf, uCraft, uCraftSpec;\n' + sh.fragmentShader
      .replace('#include <lights_toon_pars_fragment>', `varying vec3 vViewPosition;
struct ToonMaterial { vec3 diffuseColor; };
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 toonIrr = getGradientIrradiance( geometryNormal, directLight.direction );
  if (uCraft > 0.5) {
    float ndl = dot( geometryNormal, directLight.direction );
    vec3 dc = material.diffuseColor;
    float cMax = max( dc.r, max( dc.g, dc.b ) );
    float cMin = min( dc.r, min( dc.g, dc.b ) );
    float sat = (cMax - cMin) / max( cMax, 0.001 );
    // mid-tone cool steel/iron only (exclude pure white hair/cloth/snow where cMax > 0.70)
    float isSteel = step( sat, 0.18 ) * smoothstep( 0.22, 0.36, cMax ) * (1.0 - smoothstep( 0.64, 0.74, cMax ));
    float isBronze = smoothstep( 0.22, 0.36, sat ) * step( sat, 0.68 ) * smoothstep( 0.32, 0.50, cMax ) * (1.0 - smoothstep( 0.70, 0.82, cMax )) * step( dc.g * 1.08, dc.r ) * step( dc.b * 1.25, dc.g );
    vec3 halfDir = normalize( directLight.direction + geometryViewDir );
    float ndh = max( dot( geometryNormal, halfDir ), 0.0 );
    if (uCraft < 1.5) {
      // A · 国风版画: crisp graphic 2-step cel + deep indigo shadow + saturated warm terminator band + sliced anime specular
      float cel = smoothstep( 0.06, 0.17, ndl );
      vec3 celIrr = mix( vec3(0.22, 0.26, 0.42), vec3(1.06, 1.03, 0.98), cel );
      float term = exp( -pow( (ndl - 0.115) * 7.5, 2.0 ) );
      celIrr += vec3(0.26, 0.11, 0.03) * term * smoothstep( 0.08, 0.45, cMax );
      float slice = smoothstep( 0.85, 0.90, ndh ) * step( 0.05, ndl );
      float specAmt = (0.04 + 0.55 * isSteel + 0.36 * isBronze) * uCraftSpec;
      vec3 specCol = mix( vec3(1.0, 0.98, 0.94), mix( vec3(1.0, 0.86, 0.54), vec3(0.96, 1.0, 1.08), isSteel ), max( isSteel, isBronze ) );
      reflectedLight.directDiffuse += celIrr * directLight.color * BRDF_Lambert( dc ) + specCol * slice * specAmt * directLight.color;
    } else if (uCraft < 2.5) {
      // B · HD-2D 像素: rich Octopath-style dramatic lighting inside the 2x pixel grid
      float wrap = smoothstep( -0.14, 0.84, ndl );
      vec3 hdIrr = mix( vec3(0.18, 0.22, 0.36), vec3(1.08, 1.03, 0.95), wrap );
      float litMask = smoothstep( -0.02, 0.24, ndl );
      float specPow = mix( 22.0, mix( 32.0, 50.0, isSteel ), max( isSteel, isBronze ) );
      float specAmt = (0.05 + 0.60 * isSteel + 0.38 * isBronze) * uCraftSpec;
      vec3 specCol = mix( vec3(0.95, 0.96, 1.0), mix( vec3(1.0, 0.86, 0.56), vec3(0.96, 0.99, 1.08), isSteel ), max( isSteel, isBronze ) );
      reflectedLight.directDiffuse += hdIrr * directLight.color * BRDF_Lambert( dc ) + specCol * pow( ndh, specPow ) * specAmt * litMask * directLight.color;
    } else {
      // C · 精致微缩: The Touryst / Tunic airy translucent sky shadows + satin lacquer clearcoat sheen
      float wrap = smoothstep( -0.28, 0.82, ndl );
      vec3 dioIrr = mix( vec3(0.32, 0.39, 0.54), vec3(1.06, 1.03, 0.98), wrap );
      float litMask = smoothstep( -0.06, 0.22, ndl );
      float specPow = mix( 28.0, mix( 36.0, 56.0, isSteel ), max( isSteel, isBronze ) );
      float specAmt = (0.14 + 0.48 * isSteel + 0.32 * isBronze) * uCraftSpec;
      vec3 specCol = mix( vec3(1.0, 0.99, 0.96), mix( vec3(1.0, 0.88, 0.62), vec3(0.98, 1.0, 1.06), isSteel ), max( isSteel, isBronze ) );
      reflectedLight.directDiffuse += dioIrr * directLight.color * BRDF_Lambert( dc ) + specCol * pow( ndh, specPow ) * specAmt * litMask * directLight.color;
    }
  } else {
    vec3 dc = material.diffuseColor;
    vec3 diff = toonIrr * directLight.color * BRDF_Lambert( dc );
    // Subtle metallic specular glint for characters' steel blades & bronze/gold fittings (WebGL1-safe, uSelf > 0.04 = actors only)
    if (uSelf > 0.04) {
      float ndl = dot( geometryNormal, directLight.direction );
      float cMax = max( dc.r, max( dc.g, dc.b ) );
      float cMin = min( dc.r, min( dc.g, dc.b ) );
      float sat = (cMax - cMin) / max( cMax, 0.001 );
      float isSteel = step( sat, 0.18 ) * smoothstep( 0.42, 0.72, cMax );
      float isBronze = smoothstep( 0.28, 0.42, sat ) * step( sat, 0.76 ) * smoothstep( 0.46, 0.68, cMax ) * step( dc.g * 1.06, dc.r ) * step( dc.b * 1.30, dc.g );
      float mMask = max( isSteel, isBronze );
      if (mMask > 0.01 && ndl > 0.02) {
        vec3 halfDir = normalize( directLight.direction + geometryViewDir );
        float ndh = max( dot( geometryNormal, halfDir ), 0.0 );
        float specPow = mix( 26.0, 44.0, isSteel );
        float specAmt = 0.34 * isSteel + 0.24 * isBronze;
        vec3 specCol = mix( vec3(1.0, 0.88, 0.58), vec3(0.95, 0.98, 1.06), isSteel );
        diff += specCol * pow( ndh, specPow ) * specAmt * smoothstep( 0.02, 0.24, ndl ) * directLight.color;
      }
    }
    reflectedLight.directDiffuse += diff;
  }
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 ind = irradiance;
  if (uCraft > 2.5) {
    // C · 精致微缩: warm tabletop bounce light lifting upward/side undersides
    ind *= mix( vec3(1.08, 0.99, 0.88), vec3(0.95, 1.0, 1.10), clamp( geometryNormal.y * 0.5 + 0.5, 0.0, 1.0 ) );
  }
  reflectedLight.indirectDiffuse += ind * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon`)
      .replace('#include <opaque_fragment>',
      `{ float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPow);
        float rimBand = uCraft > 0.5 ? (uCraft < 1.5 ? smoothstep(0.42, 0.54, rim) * 1.05 : smoothstep(0.18, 0.84, rim) * 0.78) : smoothstep(0.35, 0.6, rim);
        outgoingLight += uRimColor * rimBand * uRimStrength * uRimK * (0.5 + 0.5 * diffuseColor.rgb) + diffuseColor.rgb * uSelf;
        // non-emissive craft surfaces soft-compress strictly under the bloom threshold (asymptote 1.02 < 1.15),
        // so white hair, snow, cloth and sunlit stone NEVER glow like lightbulbs; only true glow/emissive objects bloom
        if (uCraft > 0.5 && dot(totalEmissiveRadiance, vec3(1.0)) < 0.05) {
          vec3 over = max(outgoingLight - vec3(0.82), vec3(0.0));
          outgoingLight = min(outgoingLight, vec3(0.82)) + over / (vec3(1.0) + over * 5.0);
        } }
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'toonrimc' + rimK + '|' + selfK;
  if (key) cache.set(key, m);
  return m;
}

/** Unlit glowing material (soul fire, eyes, runes) — values above 1 feed the bloom. */
export function glow(color: THREE.ColorRepresentation, intensity = 2.5, o: { transparent?: boolean; opacity?: number; additive?: boolean } = {}) {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({ color: c, transparent: !!o.transparent || !!o.additive, opacity: o.opacity ?? 1, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.additive, toneMapped: false });
}
