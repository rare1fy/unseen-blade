import * as THREE from 'three';
import { finishBuild } from '../engine/buildSteps';
import { OPT } from '../engine/perfOpts';
import { QUALITY } from '../look/quality';
import { CRAFTU } from '../look/craft';

// Orthographic depth of permanent scenery in the room light's direction. The ground can be
// one giant greedy quad, so sampling a small field keeps silhouettes inside that quad.
export interface TerrainLight {
  size: number; left: number; back: number; step: number; bottom: number; height: number;
  dx: number; dz: number; depth: Uint8Array;
}
export function bakeTerrainLight(meshes: THREE.Mesh[], sun: number[] = [-6, 14, -10]): TerrainLight | null {
  return finishBuild(bakeTerrainLightSteps(meshes, sun));
}
export function* bakeTerrainLightSteps(meshes: THREE.Mesh[], sun: number[] = [-6, 14, -10]): Generator<void, TerrainLight | null> {
  if (!meshes.length || sun[1] <= 0) return null;
  const dx = sun[0] / sun[1], dz = sun[2] / sun[1];
  let left = Infinity, right = -Infinity, back = Infinity, front = -Infinity, bottom = Infinity, top = -Infinity;
  for (const m of meshes) {
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      if ((i & 8191) === 0) yield;
      const y = p.getY(i), x = p.getX(i) - dx * y, z = p.getZ(i) - dz * y;
      left = Math.min(left, x); right = Math.max(right, x); back = Math.min(back, z); front = Math.max(front, z);
      bottom = Math.min(bottom, y); top = Math.max(top, y);
    }
  }
  if (!Number.isFinite(left)) return null;
  const size = 256, step = Math.max(right - left, front - back, 1) / (size - 2), height = Math.max(1, top - bottom);
  left -= step; back -= step;
  const depth = new Uint8Array(size * size);
  for (const m of meshes) {
    const g = m.geometry, p = g.getAttribute('position'), idx = g.index!;
    for (let i = 0; i < idx.count; i += 3) {
      if ((i & 2047) === 0) yield;
      const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
      const ay = p.getY(a), by = p.getY(b), cy = p.getY(c);
      const ax = (p.getX(a) - dx * ay - left) / step, az = (p.getZ(a) - dz * ay - back) / step;
      const bx = (p.getX(b) - dx * by - left) / step, bz = (p.getZ(b) - dz * by - back) / step;
      const cx = (p.getX(c) - dx * cy - left) / step, cz = (p.getZ(c) - dz * cy - back) / step;
      const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (Math.abs(area) < 1e-8) continue;
      const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5)), x1 = Math.min(size - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
      const z0 = Math.max(0, Math.ceil(Math.min(az, bz, cz) - 0.5)), z1 = Math.min(size - 1, Math.floor(Math.max(az, bz, cz) - 0.5));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const u = ((x + 0.5 - ax) * (cz - az) - (z + 0.5 - az) * (cx - ax)) / area;
        const v = ((bx - ax) * (z + 0.5 - az) - (bz - az) * (x + 0.5 - ax)) / area;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const pixel = z * size + x, y = ay + u * (by - ay) + v * (cy - ay);
        depth[pixel] = Math.max(depth[pixel], 1 + Math.round(254 * (y - bottom) / height));
      }
    }
  }
  return { size, left, back, step, bottom, height, dx, dz, depth };
}

export function stageLighting(surfaces: THREE.Mesh[], earth: THREE.Mesh, field: TerrainLight | null) {
  if (!field) return { sync() {}, dispose() {} };
  // RGBA8 is sampleable even on the stripped WebGL1 simulator. Only one byte per texel goes in the package.
  const rgba = new Uint8Array(field.depth.length * 4);
  for (let i = 0; i < field.depth.length; i++) rgba[i * 4] = field.depth[i];
  const tex = new THREE.DataTexture(rgba, field.size, field.size);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
  const materials = new Map<THREE.Material, THREE.Material>();
  const objects = [...surfaces, earth].map(mesh => {
    const original = mesh.material as THREE.Material;
    let baked = materials.get(original);
    if (!baked) {
      baked = original.clone(); materials.set(original, baked);
      baked.onBeforeCompile = (s, r) => {
        original.onBeforeCompile(s, r);
        s.uniforms.terrainDepth = { value: tex };
        s.uniforms.terrainBounds = { value: new THREE.Vector4(field.left, field.back, field.step * field.size, field.bottom) };
        s.uniforms.terrainSun = { value: new THREE.Vector3(field.dx, field.dz, field.height) };
        s.uniforms.uTerrainCraft = CRAFTU.uCraft;
        s.uniforms.uTerrainPolish = CRAFTU.uPxPolish;
        s.vertexShader = 'varying vec3 vTerrainP;\n' + s.vertexShader.replace('#include <project_vertex>',
          '#include <project_vertex>\n vTerrainP = (modelMatrix * vec4(transformed, 1.)).xyz;');
        s.fragmentShader = 'varying vec3 vTerrainP; uniform sampler2D terrainDepth; uniform vec4 terrainBounds; uniform vec3 terrainSun; uniform float uTerrainCraft, uTerrainPolish;\n' +
          s.fragmentShader.replace('#include <opaque_fragment>', `vec2 lightUV = (vTerrainP.xz - vTerrainP.y * terrainSun.xy - terrainBounds.xy) / terrainBounds.z;
          float h = texture2D(terrainDepth, lightUV).r * 255.;
          if (h > 0.5 && all(greaterThanEqual(lightUV, vec2(0.))) && all(lessThanEqual(lightUV, vec2(1.)))) {
            float above = terrainBounds.w + (h - 1.) * terrainSun.z / 254. - vTerrainP.y;
            float sh = smoothstep(0.12, 0.30, above);
            if (uTerrainCraft > 0.5) outgoingLight *= mix(vec3(1.0), vec3(0.56, 0.64, 0.80), 0.74 * sh);
            else if (uTerrainPolish > 0.5) {
              float psh = smoothstep(0.14, 0.24, above);
              outgoingLight *= mix(vec3(1.0), vec3(0.58, 0.65, 0.80), 0.72 * psh);
            } else outgoingLight *= 1. - 0.38 * sh;
          }
          #include <opaque_fragment>`);
      };
      baked.customProgramCacheKey = () => original.customProgramCacheKey() + '|terrain-depth';
    }
    return { mesh, original, baked, casts: mesh.castShadow };
  });
  let enabled: boolean | undefined;
  return {
    sync() {
      const on = OPT.bakedShadows && QUALITY.tier !== 'high';
      if (enabled === on) return;
      enabled = on;
      for (const { mesh, original, baked, casts } of objects) {
        mesh.material = on ? baked : original; mesh.userData.usingBaked = on; mesh.castShadow = !on && casts;
      }
    },
    dispose() { tex.dispose(); for (const m of materials.values()) m.dispose(); },
  };
}
