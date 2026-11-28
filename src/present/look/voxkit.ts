import { WorldGrid } from './worldGrid';
import { finishBuild } from '../engine/buildSteps';
// Chunky voxel characters, authored as one statue in absolute cell coordinates (y up from the ground, front = +z, x centred so
// symmetric pieces mirror across x = 0). Every cell belongs to a part; every part hangs on a bone of a simple joint rig, so the actor
// animates by rotating bones (procedural poses in the actor classes). Meshing: exposed faces only (faces between two parts are kept,
// they separate when the joints move), per-corner ambient occlusion from the whole statue, and a per-cell UV that the shader uses to
// draw a soft bevel highlight on every block edge — the blocks stay readable as blocks even at a distance.
import * as THREE from 'three';
import { toon } from './toon';
import { PXU } from './pixel';
import { CRAFTU } from './craft';
import type { Bone } from '../actors/rig';
import { shadowTiles, shadowTileSteps, TILE_M } from '../engine/shadowTiles';
import { cheapVoxelUniform } from './quality';
import { mergeActorFaces } from './greedyActor';
import { OPT, CAPS } from '../engine/perfOpts';

export type Col = number;
interface Cell { c: Col; g: number; part: string }
const key = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
const DIRS: Array<[number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// tangent axes per face direction (t1 × t2 = +axis)
const TAN: Array<[[number, number, number], [number, number, number]]> = [[[0, 1, 0], [0, 0, 1]], [[0, 1, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0]], [[0, 0, 1], [1, 0, 0]], [[1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 1, 0]]];
const AO = [0.52, 0.7, 0.86, 1];
/** act-34: the cells' occupancy as a bitset over their bounding box, padded by one cell on every side (null when the box would be
 *  absurdly large — then the caller falls back to the Map) */
function occupancy(cells: Map<number, unknown>) {
  if (cells.size < 4096) return null;   // small statues: the Map is fast enough and the box costs more than it saves
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const k of cells.keys()) {
    const z = (k % 1024) - 512, y = (Math.floor(k / 1024) % 1024) - 512, x = Math.floor(k / (1024 * 1024)) - 512;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const nx = x1 - x0 + 3, ny = y1 - y0 + 3, nz = z1 - z0 + 3, n = nx * ny * nz;
  if (n > 400e6) return null;
  const b = new Uint32Array(Math.ceil(n / 32));
  const at = (x: number, y: number, z: number) => ((x - x0 + 1) * ny + (y - y0 + 1)) * nz + (z - z0 + 1);
  for (const k of cells.keys()) {
    const z = (k % 1024) - 512, y = (Math.floor(k / 1024) % 1024) - 512, x = Math.floor(k / (1024 * 1024)) - 512, i = at(x, y, z);
    b[i >>> 5] |= 1 << (i & 31);
  }
  const occ = (x: number, y: number, z: number) => {
    const X = x - x0 + 1, Y = y - y0 + 1, Z = z - z0 + 1; if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) return false;
    const i = (X * ny + Y) * nz + Z; return ((b[i >>> 5] >>> (i & 31)) & 1) === 1;
  };
  return { b, ny, nz, at, occ };
}

/**
 * the block material: toon + bevel highlight on block edges (attribute aVox).
 * Pixel look (look/pixel.ts, shared uniform uPx): flat per-face tones (top bright, bottom dark, sides in between) and, on faces at least
 * 6 art pixels across, a crisp 1-art-pixel bevel: light on the open edges that face up-left on screen, a darker line on those facing
 * down-right. Smaller faces (character cells) keep their flat colour so nothing turns into speckle.
 */
const matCache = new Map<string, THREE.MeshToonMaterial>();
/** 11-18 (the walls stand taller than a person now): scenery between the camera and her (or a foe near her) opens in a pixel
 *  dither round the line of sight, so a wall in front never hides who is fighting behind it. Up to four targets: xyz = the point
 *  to keep in sight (the chest), w = the hole's radius at that depth (0 = unused). The floor and anything lower than 0.45 m are
 *  never cut, nor anything behind the target. act/show.ts sets them every frame (seeThrough) */
export const SEE_HOLES = { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] };
export function voxToon(o: { rim?: number; self?: number; edge?: number; actor?: boolean; hole?: boolean } = {}) {
  const hole = !!o.hole;
  const k = `${o.rim ?? 0.6}|${o.self ?? 0.05}|${o.edge ?? 0.2}|${!!o.actor}${hole ? '|hole' : ''}`;
  if (matCache.has(k)) return matCache.get(k)!;
  // a private copy: the cached toon material is shared, and this one gets an extra shader stage
  const src = toon(0xffffff, { vertexColors: true, rim: o.rim ?? 0.6, self: o.self ?? 0.05 }), m = src.clone(), edge = o.edge ?? 0.2;
  m.onBeforeCompile = (sh, r) => {
    src.onBeforeCompile(sh, r);
    // three's toon material clone drops the extensions bag. The lighting and HUD variants reuse this shader.
    if (CAPS.derivatives) sh.extensionDerivatives = true;
    sh.uniforms.uCheapVoxel = cheapVoxelUniform; sh.uniforms.uPx = PXU.uPx; sh.uniforms.uPxEdge = PXU.uPxEdge; sh.uniforms.uCraftGrain = CRAFTU.uCraftGrain; sh.uniforms.uCraftTime = CRAFTU.uCraftTime;
    if (hole) sh.uniforms.uHole = SEE_HOLES;
    sh.vertexShader = (hole ? '#define VOX_HOLE\n' : '') + 'attribute vec2 aVox; attribute vec2 aSize; attribute vec4 aOpen; varying vec2 vVox; varying vec2 vSize; varying vec4 vOpen; varying vec3 vWN; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
 vVox = aVox; vSize = aSize; vOpen = aOpen; vWN = normalize(mat3(modelMatrix) * objectNormal);
 { vec4 hp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
   hp = instanceMatrix * hp;
#endif
   vWP = (modelMatrix * hp).xyz; }`);
    // the see-through: the hole's core is open, its rim a 4x4 ordered dither in the art pixels; the radius is scaled with depth,
    // so the hole is the same size on screen
    const holeFn = hole ? `uniform vec4 uHole[4];
float voxB2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float voxB4(vec2 a) { return voxB2(0.5 * a) * 0.25 + voxB2(a); }
void voxHole() {
  if (vWP.y < 0.45) return;
  float th = voxB4(gl_FragCoord.xy);
  for (int i = 0; i < 4; i++) {
    vec4 h = uHole[i]; if (h.w <= 0.0) continue;
    vec3 d = h.xyz - cameraPosition; float L = length(d); d /= L;
    vec3 p = vWP - cameraPosition; float t = dot(p, d);
    if (t <= 0.0 || t > L - 0.55) continue;
    float r = length(p - d * t) * L / t;
    float k = 1.0 - smoothstep(h.w * 0.72, h.w, r);
    if (k > th) discard;
  }
}
` : '';
    // (11-18 微信小游戏: the 1-art-pixel bevel lines need dFdx / dFdy — without them (the devtools' WebGL1) the faces keep their tones)
    sh.fragmentShader = (CAPS.derivatives ? '#define VOX_DERIV\n' : '') + 'varying vec2 vVox; varying vec2 vSize; varying vec4 vOpen; varying vec3 vWN; varying vec3 vWP; uniform float uPx, uPxEdge, uCheapVoxel, uCraftGrain, uCraftTime;\n' + holeFn + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>${hole ? '\n      voxHole();' : ''}
      { float d = 1.0; if (vOpen.x > 0.5) d = min(d, vVox.x); if (vOpen.y > 0.5) d = min(d, vSize.x - vVox.x); if (vOpen.z > 0.5) d = min(d, vVox.y); if (vOpen.w > 0.5) d = min(d, vSize.y - vVox.y);
        float bev = 1.0 + ${edge.toFixed(3)} * (1.0 - smoothstep(0.03, 0.1, d));
        if (uCraft > 0.5) {
          vec3 wn = normalize(vWN);
          if (uCraft < 1.5) {
            // A · 国风版画: bold graphic face contrast + crisp hand-inked bright convex edge + clean wash grounding
            float tone = wn.y > 0.6 ? 1.05 : wn.y < -0.6 ? 0.66 : wn.x > 0.6 ? 0.87 : wn.x < -0.6 ? 0.94 : wn.z > 0.6 ? 1.0 : 0.80;
            float chamf = (1.0 - smoothstep(0.03, ${o.actor ? '0.18' : '0.15'}, d)) * ${o.actor ? '0.18' : '0.22'} * (wn.y > -0.2 ? 1.0 : 0.25);
            bev = tone * (1.0 + chamf);
            ${o.actor ? '' : `
            float gK = uCraftGrain;
            if (abs(wn.y) < 0.5) {
              float baseWash = mix(0.78, 1.0, smoothstep(0.0, 0.72, max(vWP.y, 0.0)));
              bev *= mix(1.0, baseWash, gK);
            } else {
              // quiet stylized ink-wash tonal sweep on large ground planes (no realistic noise)
              float wash = sin(vWP.x * 0.36 + vWP.z * 0.24) * cos(vWP.z * 0.34 - vWP.x * 0.22);
              float stepWash = smoothstep(-0.35, 0.45, wash) * 0.08 - 0.04;
              bev *= mix(1.0, 1.0 + stepWash, gK);
            }`}
          } else if (uCraft < 2.5) {
            // B · HD-2D 像素: matches 2x pixel grid + crisp 1-art-pixel bevel + cloud-dapple atmospheric light
            float tone = wn.y > 0.6 ? 1.04 : wn.y < -0.6 ? 0.66 : wn.x > 0.6 ? 0.89 : wn.x < -0.6 ? 0.93 : wn.z > 0.6 ? 1.0 : 0.83;
            float hl = 0.0, dk = 0.0;
#ifdef VOX_DERIV
            if (uCheapVoxel < 0.5) {
            vec2 gx = dFdx(vVox), gy = dFdy(vVox), fw = max(abs(gx) + abs(gy), vec2(1e-4));
            vec2 cellSize = ${o.actor ? 'vec2(1.)' : 'vSize'}; float span = min(cellSize.x / fw.x, cellSize.y / fw.y);
            if (span > 5.0) {
              vec2 ux = normalize(vec2(gx.x, gy.x) + 1e-6), uy = normalize(vec2(gx.y, gy.y) + 1e-6), L = vec2(-0.5, 0.866);
              float e0 = vOpen.x > 0.5 ? vVox.x / fw.x : 1e4, e1 = vOpen.y > 0.5 ? (vSize.x - vVox.x) / fw.x : 1e4;
              float e2 = vOpen.z > 0.5 ? vVox.y / fw.y : 1e4, e3 = vOpen.w > 0.5 ? (vSize.y - vVox.y) / fw.y : 1e4;
              float s0 = dot(-ux, L), s1 = dot(ux, L), s2 = dot(-uy, L), s3 = dot(uy, L);
              if (e0 < 1.0) { hl = max(hl, step(0.2, s0)); dk = max(dk, step(s0, -0.2)); }
              if (e1 < 1.0) { hl = max(hl, step(0.2, s1)); dk = max(dk, step(s1, -0.2)); }
              if (e2 < 1.0) { hl = max(hl, step(0.2, s2)); dk = max(dk, step(s2, -0.2)); }
              if (e3 < 1.0) { hl = max(hl, step(0.2, s3)); dk = max(dk, step(s3, -0.2)); }
            } }
#endif
            bev = tone * (1.0 + 0.28 * hl) * (1.0 - 0.18 * dk * (1.0 - hl));
            ${o.actor ? '' : `
            float gK = uCraftGrain;
            if (abs(wn.y) < 0.5) {
              float baseAO = mix(0.76, 1.0, smoothstep(0.0, 0.80, max(vWP.y, 0.0)));
              bev *= mix(1.0, baseAO, gK);
            } else {
              float drift = sin((vWP.x + uCraftTime * 0.28) * 0.22 + vWP.z * 0.16) * cos((vWP.z - uCraftTime * 0.18) * 0.20 - vWP.x * 0.14);
              float cloudLight = smoothstep(-0.55, 0.65, drift) * 0.14 - 0.08;
              bev *= mix(1.0, 1.0 + cloudLight, gK);
              diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0 + cloudLight * 0.45, 1.0 + cloudLight * 0.1, 1.0 - cloudLight * 0.55), gK);
            }`}
          } else {
            // C · 精致微缩: pristine noiseless artisan lacquer blocks + luminous precision-milled chamfer edge (The Touryst / Tunic)
            float tone = wn.y > 0.6 ? 1.05 : wn.y < -0.6 ? 0.78 : wn.x > 0.6 ? 0.94 : wn.x < -0.6 ? 0.96 : wn.z > 0.6 ? 1.0 : 0.90;
            float chamf = (1.0 - smoothstep(0.0, ${o.actor ? '0.26' : '0.22'}, d)) * ${o.actor ? '0.20' : '0.25'} * (wn.y > -0.2 ? 1.0 : 0.45);
            bev = tone * (1.0 + chamf);
            ${o.actor ? '' : `
            if (abs(wn.y) < 0.5) {
              bev *= mix(0.88, 1.0, smoothstep(0.0, 0.48, max(vWP.y, 0.0)));
            }`}
          }
        } else if (uPx > 0.5) {
          vec3 wn = normalize(vWN);
          float tone = wn.y > 0.6 ? 1.06 : wn.y < -0.6 ? 0.68 : wn.x > 0.6 ? 0.90 : wn.x < -0.6 ? 0.93 : wn.z > 0.6 ? 1.0 : 0.84;
          ${o.actor ? `
          // WebGL1-safe precision micro-chamfer catchlight on 3.5cm character voxels (replaces invisible span>6 bevel on small cells)
          float chamf = (1.0 - smoothstep(0.0, 0.20, d)) * 0.12 * (wn.y > -0.2 ? 1.0 : 0.35);
          bev = tone * (1.0 + chamf);` : `
          float hl = 0.0, dk = 0.0;
#ifdef VOX_DERIV
          if (uCheapVoxel < 0.5) {
          vec2 gx = dFdx(vVox), gy = dFdy(vVox), fw = max(abs(gx) + abs(gy), vec2(1e-4));
          vec2 cellSize = vSize; float span = min(cellSize.x / fw.x, cellSize.y / fw.y);
          float minSpan = uPxPolish > 0.5 ? 7.5 : 6.0;
          if (span > minSpan && max(fw.x, fw.y) < 0.35) {
            float edgeFade = uPxPolish > 0.5 ? smoothstep(7.5, 13.0, span) : 1.0;
            vec2 ux = normalize(vec2(gx.x, gy.x) + 1e-6), uy = normalize(vec2(gx.y, gy.y) + 1e-6), L = vec2(-0.5, 0.866);
            float e0 = vOpen.x > 0.5 ? vVox.x / fw.x : 1e4, e1 = vOpen.y > 0.5 ? (vSize.x - vVox.x) / fw.x : 1e4;
            float e2 = vOpen.z > 0.5 ? vVox.y / fw.y : 1e4, e3 = vOpen.w > 0.5 ? (vSize.y - vVox.y) / fw.y : 1e4;
            float s0 = dot(-ux, L), s1 = dot(ux, L), s2 = dot(-uy, L), s3 = dot(uy, L);
            if (e0 < 1.0) { hl = max(hl, step(0.2, s0) * edgeFade); dk = max(dk, step(s0, -0.2) * edgeFade); }
            if (e1 < 1.0) { hl = max(hl, step(0.2, s1) * edgeFade); dk = max(dk, step(s1, -0.2) * edgeFade); }
            if (e2 < 1.0) { hl = max(hl, step(0.2, s2) * edgeFade); dk = max(dk, step(s2, -0.2) * edgeFade); }
            if (e3 < 1.0) { hl = max(hl, step(0.2, s3) * edgeFade); dk = max(dk, step(s3, -0.2) * edgeFade); }
          } }
#endif
          float edgeHi = uPxPolish > 0.5 ? uPxEdge * 0.58 : uPxEdge;
          float edgeLo = uPxPolish > 0.5 ? 0.14 : 0.20;
          bev = tone * (1.0 + edgeHi * hl) * (1.0 - edgeLo * dk * (1.0 - hl));
          if (uPxPolish > 0.5) {
            // 1. Hard-stepped 2-row voxel wall-base grounding (pure 7cm pixel steps, zero smooth gradient)
            if (abs(wn.y) < 0.5 && vWP.y >= -0.02 && vWP.y < 0.23) {
              if (vWP.y < 0.08) { bev *= 0.80; diffuseColor.rgb *= vec3(0.95, 0.97, 1.05); }
              else bev *= 0.91;
            }
            // 2. Figure-ground separation: gently calm giant flat battle floors (-10% sat, -4% val) + quiet 4-cell stepped tone patch
            if (wn.y > 0.7 && vWP.y > -0.06 && vWP.y < 0.08) {
              float gl = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
              diffuseColor.rgb = mix(vec3(gl), diffuseColor.rgb, 0.90) * 0.96;
              vec2 b4 = floor(vWP.xz / 0.28) * 0.28;
              float sw = sin(b4.x * 0.42 + b4.y * 0.29) * cos(b4.y * 0.38 - b4.x * 0.24);
              bev *= sw > 0.32 ? 1.035 : sw < -0.32 ? 0.965 : 1.0;
            }
          }`}
        }
        diffuseColor.rgb *= bev; }`);
  };
  m.customProgramCacheKey = () => src.customProgramCacheKey() + '|vox' + edge + (o.actor ? '|unit' : '') + '|px' + (CAPS.derivatives ? '' : '|noderiv') + (hole ? '|hole' : '');
  // (11-18 微信小游戏: the bevel uses dFdx / dFdy — built into WebGL2, an extension WebGL1 has to switch on: the WeChat devtools'
  // simulator is WebGL1, and without this every block material failed to compile there)
  (m as unknown as { extensions: Record<string, boolean> }).extensions = { derivatives: true };
  matCache.set(k, m); return m;
}
const glowMats = new Map<number, THREE.MeshBasicMaterial>();
export const glowMat = (k: number) => { if (!glowMats.has(k)) glowMats.set(k, new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), vertexColors: true, toneMapped: false })); return glowMats.get(k)!; };

const DOWN_JOINTS = new Set([
  'foreL', 'foreR', 'handL', 'handR', 'shinL', 'shinR', 'footL', 'footR', 'legL', 'legR',
  'legFL', 'legFR', 'legBL', 'legBR', 'horseLegFL', 'horseLegFR', 'horseLegBL', 'horseLegBR',
  'horseShinFL', 'horseShinFR', 'horseShinBL', 'horseShinBR',
  'hrA2', 'hrA3', 'bfA2', 'bfA3', 'bfB2', 'bfB3', 'hipSlv2', 'hipSlv3', 'clA2', 'robe2',
  'plL2', 'plL3', 'plR2', 'plR3', 'zpA2', 'hbA2', 'crA2',
]);
const UP_JOINTS = new Set(['spine', 'chest', 'neck', 'head']);
const SIDE_JOINTS = new Set(['armL', 'armR']);

interface SealBox { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; c: number; part: string; axis: 'x' | 'y' }

/**
 * Automatic recessed joint-core plugs (build-time only; never mutates `cells` so .vox round-trips stay exact).
 * Every plug sits strictly inside voxels already occupied by the parent bone and is inset by 11% on cross-section axes,
 * making it invisible at rest (zero z-fighting, zero silhouette bloat) while smoothly sealing gaps when joints bend 45°–135°.
 */
function computeJointSeals(
  cells: Map<number, Cell & { x: number; y: number; z: number }>,
  bonesAbs: Map<string, { parent: string | null; p: THREE.Vector3 }>,
  s: number,
): Map<string, SealBox[]> {
  const out = new Map<string, SealBox[]>();
  if (bonesAbs.size < 4 || s > 0.085) return out;
  const byPart = new Map<string, Array<Cell & { x: number; y: number; z: number }>>();
  for (const c of cells.values()) {
    let arr = byPart.get(c.part);
    if (!arr) byPart.set(c.part, (arr = []));
    arr.push(c);
  }
  const depth = s < 0.05 ? 2 : 1;
  const parentWithCells = (name: string): string | null => {
    let cur = bonesAbs.get(name)?.parent ?? null;
    while (cur && cur !== 'root') {
      if (byPart.has(cur)) return cur;
      cur = bonesAbs.get(cur)?.parent ?? null;
    }
    return null;
  };
  const modeColor = (list: Array<{ c: number }>) => {
    const counts = new Map<number, number>();
    let best = list[0].c, bestN = 0;
    for (const item of list) {
      const n = (counts.get(item.c) ?? 0) + 1;
      counts.set(item.c, n);
      if (n > bestN) { bestN = n; best = item.c; }
    }
    return best;
  };
  const push = (box: SealBox) => {
    let arr = out.get(box.part);
    if (!arr) out.set(box.part, (arr = []));
    arr.push(box);
  };

  for (const [part, list] of byPart) {
    if (!list.length) continue;
    const isDown = DOWN_JOINTS.has(part), isUp = UP_JOINTS.has(part), isSide = SIDE_JOINTS.has(part);
    if (!isDown && !isUp && !isSide) continue;
    const par = parentWithCells(part);
    if (!par) continue;
    const bp = bonesAbs.get(part)!.p;

    if (isDown) {
      // Boundary layer of `part` nearest the joint pivot along Y
      let yEdge = -1e9;
      for (const c of list) {
        if (Math.abs(c.x + 0.5 - bp.x) > 5.5 || Math.abs(c.z + 0.5 - bp.z) > 5.5) continue;
        if (c.y > yEdge) yEdge = c.y;
      }
      if (!Number.isFinite(yEdge) || Math.abs(yEdge + 1 - bp.y) > 3.5) continue;
      const rim = list.filter(c => c.y === yEdge && Math.abs(c.x + 0.5 - bp.x) <= 5.5 && Math.abs(c.z + 0.5 - bp.z) <= 5.5);
      if (!rim.length) continue;
      const valid = rim.filter(c => cells.get(key(c.x, yEdge + 1, c.z))?.part === par);
      if (!valid.length) continue;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const c of valid) { if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (c.z < z0) z0 = c.z; if (c.z > z1) z1 = c.z; }
      let maxD = 1;
      if (depth >= 2) {
        let ok2 = true;
        for (let x = x0; x <= x1 && ok2; x++) for (let z = z0; z <= z1 && ok2; z++) {
          if (cells.get(key(x, yEdge + 2, z))?.part !== par) ok2 = false;
        }
        if (ok2) maxD = 2;
      }
      push({ x0, y0: yEdge + 1, z0, x1, y1: yEdge + maxD, z1, c: modeColor(valid), part, axis: 'y' });
    } else if (isUp) {
      // Ball-and-socket column on the lower parent extending UP into `part` (keeps `chest` and `head` Box3 untouched!)
      let yEdge = 1e9;
      for (const c of list) {
        if (Math.abs(c.x + 0.5 - bp.x) > 5.5 || Math.abs(c.z + 0.5 - bp.z) > 5.5) continue;
        if (c.y < yEdge) yEdge = c.y;
      }
      if (!Number.isFinite(yEdge) || Math.abs(yEdge - bp.y) > 3.5) continue;
      const rim = list.filter(c => c.y === yEdge && Math.abs(c.x + 0.5 - bp.x) <= 5.5 && Math.abs(c.z + 0.5 - bp.z) <= 5.5);
      if (!rim.length) continue;
      const valid = rim.filter(c => cells.get(key(c.x, yEdge - 1, c.z))?.part === par);
      if (!valid.length) continue;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const c of valid) { if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (c.z < z0) z0 = c.z; if (c.z > z1) z1 = c.z; }
      let maxD = 1;
      if (depth >= 2 && part !== 'neck') {
        let ok2 = true;
        for (let x = x0; x <= x1 && ok2; x++) for (let z = z0; z <= z1 && ok2; z++) {
          if (cells.get(key(x, yEdge + 1, z))?.part !== part) ok2 = false;
        }
        if (ok2) maxD = 2;
      }
      const parRim = valid.map(c => cells.get(key(c.x, yEdge - 1, c.z))!);
      const sealCol = part === 'neck' ? modeColor(valid) : modeColor(parRim);
      push({ x0, y0: yEdge, z0, x1, y1: yEdge + maxD - 1, z1, c: sealCol, part: par, axis: 'y' });
    } else if (isSide) {
      // Shoulder socket plug extending inward from armL (-x) / armR (+x) into chest
      const inward = part === 'armL' ? -1 : 1;
      let yMax = -1e9;
      for (const c of list) if (c.y > yMax) yMax = c.y;
      const upper = list.filter(c => c.y >= Math.floor(bp.y) - 4 && c.y <= yMax - 1 && Math.abs(c.z + 0.5 - bp.z) <= 4.5);
      if (!upper.length) continue;
      let xInner = inward < 0 ? 1e9 : -1e9;
      for (const c of upper) if (inward < 0 ? c.x < xInner : c.x > xInner) xInner = c.x;
      const rim = upper.filter(c => c.x === xInner && cells.get(key(xInner + inward, c.y, c.z))?.part === par);
      if (!rim.length) continue;
      let y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const c of rim) { if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y; if (c.z < z0) z0 = c.z; if (c.z > z1) z1 = c.z; }
      let maxD = 1;
      if (depth >= 2) {
        let ok2 = true;
        for (let y = y0; y <= y1 && ok2; y++) for (let z = z0; z <= z1 && ok2; z++) {
          if (cells.get(key(xInner + inward * 2, y, z))?.part !== par) ok2 = false;
        }
        if (ok2) maxD = 2;
      }
      const xA = inward < 0 ? xInner - maxD : xInner + 1;
      const xB = inward < 0 ? xInner - 1 : xInner + maxD;
      push({ x0: xA, y0, z0, x1: xB, y1, z1, c: modeColor(rim), part, axis: 'x' });
    }
  }
  return out;
}

/** Emit one slightly-inset recessed joint-core box into an actor part's geometry arrays (after greedy merge). */
function appendSealBox(arr: number[][], box: SealBox, bp: THREE.Vector3, s: number, col: THREE.Color) {
  const [P, N, C, U, I, E, S] = arr;
  const inX = box.axis === 'y' ? 0.11 : 0.05;
  const inY = box.axis === 'x' ? 0.11 : 0.05;
  const inZ = 0.11;
  const x0 = (box.x0 + inX - bp.x) * s, x1 = (box.x1 + 1 - inX - bp.x) * s;
  const y0 = (box.y0 + inY - bp.y) * s, y1 = (box.y1 + 1 - inY - bp.y) * s;
  const z0 = (box.z0 + inZ - bp.z) * s, z1 = (box.z1 + 1 - inZ - bp.z) * s;
  if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
  col.set(box.c);
  const f = 0.84;
  const r = col.r * f, g = col.g * f, b = col.b * f;
  const faces: Array<[number[], Array<[number, number, number]>]> = [
    [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
    [[-1, 0, 0], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]]],
    [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
    [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
  ];
  for (const [n, verts] of faces) {
    const base = P.length / 3;
    for (let k = 0; k < 4; k++) {
      P.push(verts[k][0], verts[k][1], verts[k][2]);
      N.push(n[0], n[1], n[2]);
      C.push(r, g, b);
      U.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0);
      E.push(0, 0, 0, 0);
      S.push(1, 1);
    }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

export class VoxChar {
  cells = new Map<number, Cell & { x: number; y: number; z: number }>();
  bonesAbs = new Map<string, { parent: string | null; p: THREE.Vector3 }>();
  private cur = 'root';
  constructor(readonly s: number) { this.bonesAbs.set('root', { parent: null, p: new THREE.Vector3() }); }

  /** a joint at absolute cell-corner coordinates */
  bone(name: string, parent: string, x: number, y: number, z: number) { this.bonesAbs.set(name, { parent, p: new THREE.Vector3(x, y, z) }); return this; }
  /** subsequent cells belong to this bone's part */
  part(bone: string) { if (!this.bonesAbs.has(bone)) throw new Error('no bone ' + bone); this.cur = bone; return this; }

  set(x: number, y: number, z: number, c: Col | null, g = 0) { const k = key(x, y, z); if (c == null) this.cells.delete(k); else this.cells.set(k, { x, y, z, c, g, part: this.cur }); return this; }
  get(x: number, y: number, z: number) { return this.cells.get(key(x, y, z)); }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null, g = 0) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, c, g);
    return this;
  }
  /** mirrored across x = 0 (cell x ↔ −1 − x) */
  symBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null, g = 0) { this.box(x0, y0, z0, x1, y1, z1, c, g); return this.box(-1 - x0, y0, z0, -1 - x1, y1, z1, c, g); }
  sym(x: number, y: number, z: number, c: Col | null, g = 0) { this.set(x, y, z, c, g); return this.set(-1 - x, y, z, c, g); }
  ell(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: Col, g = 0) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz; if (dx * dx + dy * dy + dz * dz <= 1) this.set(x, y, z, c, g);
    }
    return this;
  }
  /** recolour existing cells: fn returns a colour (or null to keep) */
  paint(fn: (c: Cell & { x: number; y: number; z: number }) => Col | null | undefined, onlyPart?: string) {
    for (const v of this.cells.values()) { if (onlyPart && v.part !== onlyPart) continue; const r = fn(v); if (r != null) v.c = r; }
    return this;
  }
  /** a straight run of cells between two cell centres (staffs, straps) */
  line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, g = 0) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 1);
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), Math.round(z0 + ((z1 - z0) * i) / n), c, g);
    return this;
  }

  /**
   * Build the rig: returns bones (Object3D, positioned relative to their parents, rest pose recorded) and the meshes per part.
   * jitter: per-cell brightness grain; glow: brightness multiplier for glowing cells (they feed the bloom).
   */
  build(o: { jitter?: number; glow?: number; rim?: number; self?: number; edge?: number } = {}) { return finishBuild(this.buildSteps(o)); }
  *buildSteps(o: { jitter?: number; glow?: number; rim?: number; self?: number; edge?: number } = {}) {
    const s = this.s, bones: Record<string, Bone> = {}, meshes: THREE.Mesh[] = [];
    for (const [name, b] of this.bonesAbs) {
      const o3 = new THREE.Object3D() as Bone; o3.name = name; bones[name] = o3;
      const par = b.parent ? this.bonesAbs.get(b.parent)!.p : new THREE.Vector3();
      o3.position.copy(b.p).sub(par).multiplyScalar(s);
    }
    for (const [name, b] of this.bonesAbs) if (b.parent) bones[b.parent].add(bones[name]);
    const occ = (x: number, y: number, z: number) => this.cells.has(key(x, y, z));
    const jit = o.jitter ?? 0.05, col = new THREE.Color();
    const byPart = new Map<string, { solid: number[][]; glow: number[][] }>();
    const seals = computeJointSeals(this.cells, this.bonesAbs, s);
    const hash = (x: number, y: number, z: number) => { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    let visited = 0;
    for (const v of this.cells.values()) {
      if ((++visited & 255) === 0) yield;
      if (!byPart.has(v.part)) byPart.set(v.part, { solid: [[], [], [], [], [], [], []], glow: [[], [], [], [], [], [], []] });
      const tgt = v.g > 0 ? byPart.get(v.part)!.glow : byPart.get(v.part)!.solid, [P, N, C, U, I, E, S] = tgt;
      col.set(v.c); const sh = v.g > 0 ? 1 : 1 + (hash(v.x, v.y, v.z) - 0.5) * 2 * jit;
      const bp = this.bonesAbs.get(v.part)!.p;
      for (let d = 0; d < 6; d++) {
        const [dx, dy, dz] = DIRS[d], nb = this.cells.get(key(v.x + dx, v.y + dy, v.z + dz));
        if (nb && nb.part === v.part && (nb.g > 0) === (v.g > 0)) continue;
        const [t1, t2] = TAN[d], base = P.length / 3, pos = dx + dy + dz > 0;
        const cx = v.x + 0.5 + dx * 0.5, cy = v.y + 0.5 + dy * 0.5, cz = v.z + 0.5 + dz * 0.5;
        const aos: number[] = [];
        // 2-ring overhang & cavity AO across the whole statue (ignore removable 'hat' part when shading 'head' so taking the hat off leaves bright, clean hair)
        const occA = (x: number, y: number, z: number) => {
          const c = this.cells.get(key(x, y, z));
          return !!c && !(v.part === 'head' && c.part === 'hat');
        };
        let sky = 1;
        if (v.g === 0) {
          const ox0 = v.x + dx, oy0 = v.y + dy, oz0 = v.z + dz;
          let ov = 0;
          if (occA(ox0, oy0 + 1, oz0)) ov += 1.0;
          if (occA(ox0, oy0 + 2, oz0)) ov += 0.75;
          if (occA(ox0 + dx, oy0 + 1, oz0 + dz)) ov += 0.65;
          if (occA(ox0 + dx, oy0 + 2, oz0 + dz)) ov += 0.45;
          sky = (dy > 0 ? 1.03 : dy < 0 ? 0.88 : 0.99) * (1 - Math.min(0.18, ov * 0.055));
        }
        // an edge of this face is "open" (gets the bevel) only where the block sticks out (convex edge)
        const open = (tx: number, ty: number, tz: number) => (occA(v.x + tx, v.y + ty, v.z + tz) ? 0 : 1);
        const eo = [open(-t1[0], -t1[1], -t1[2]), open(t1[0], t1[1], t1[2]), open(-t2[0], -t2[1], -t2[2]), open(t2[0], t2[1], t2[2])];
        for (const [s1, s2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          P.push((cx + (t1[0] * s1 + t2[0] * s2) * 0.5 - bp.x) * s, (cy + (t1[1] * s1 + t2[1] * s2) * 0.5 - bp.y) * s, (cz + (t1[2] * s1 + t2[2] * s2) * 0.5 - bp.z) * s);
          N.push(dx, dy, dz); U.push(s1 > 0 ? 1 : 0, s2 > 0 ? 1 : 0); E.push(...eo); S.push(1, 1);
          // corner AO from the three cells in front of the face around this corner
          const ox = v.x + dx, oy = v.y + dy, oz = v.z + dz;
          const a1 = occA(ox + t1[0] * s1, oy + t1[1] * s1, oz + t1[2] * s1) ? 1 : 0, a2 = occA(ox + t2[0] * s2, oy + t2[1] * s2, oz + t2[2] * s2) ? 1 : 0;
          const a3 = occA(ox + t1[0] * s1 + t2[0] * s2, oy + t1[1] * s1 + t2[1] * s2, oz + t1[2] * s1 + t2[2] * s2) ? 1 : 0;
          const ao = v.g > 0 ? 3 : a1 && a2 ? 0 : 3 - (a1 + a2 + a3); aos.push(ao);
          const f = AO[ao] * sh * sky; C.push(Math.min(1, col.r * f), Math.min(1, col.g * f), Math.min(1, col.b * f));
        }
        // flip the quad diagonal so AO interpolates without the anisotropy seam
        const flip = aos[0] + aos[2] < aos[1] + aos[3];
        const q = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
        if (pos) I.push(...q.map(i => base + i)); else I.push(base + q[0], base + q[2], base + q[1], base + q[3], base + q[5], base + q[4]);
      }
    }
    const solidMat = voxToon({ actor: true, rim: o.rim, self: o.self, edge: o.edge });
    for (const [part, { solid, glow }] of byPart) {
      yield;
      const bp = this.bonesAbs.get(part)!.p;
      const partSeals = seals.get(part);
      for (const [arr, isGlow] of [[solid, false], [glow, true]] as const) {
        const merged = OPT.greedyActors && !jit ? mergeActorFaces(arr, s) : arr;
        if (!isGlow && partSeals) for (const sb of partSeals) appendSealBox(merged, sb, bp, s, col);
        const [P, N, C, U, I, E, S] = merged; if (!I.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aVox', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('aOpen', new THREE.Float32BufferAttribute(E, 4)); g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 2)); g.setIndex(I);
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, isGlow ? glowMat(o.glow ?? 2.6) : solidMat); m.castShadow = !isGlow; m.receiveShadow = false; m.name = part + (isGlow ? '_glow' : '');
        bones[part].add(m); if (!isGlow) meshes.push(m);
      }
    }
    for (const b of Object.values(bones)) b.rest = { p: b.position.clone(), r: b.rotation.clone(), s: b.scale.clone() };
    return { bones, meshes, root: bones.root };
  }
}

// ================================================================== static voxel world (the arena)
/**
 * Cells for scenery. build() merges coplanar faces of one colour that have no ambient occlusion into rectangles (greedy), so large
 * floors and walls cost a handful of quads; faces next to other blocks keep per-cell AO. Every face gets the same bevel as the
 * characters (edges that stick out), measured in cells so a merged slab is bevelled only along its border.
 */
type WorldMeshOptions = { glow?: number; rim?: number; self?: number; edge?: number; chunk?: number; tile?: number; ground?: boolean; cullNorth?: boolean };
export class VoxWorld {
  readonly cells: Map<number, { c: number; g: number }> | WorldGrid;
  constructor(readonly s: number, terrain = false) { this.cells = terrain ? new WorldGrid() : new Map(); }
  set(x: number, y: number, z: number, c: number | null, g = 0) { const k = key(x, y, z); if (c == null) this.cells.delete(k); else this.cells.set(k, { c, g }); return this; }
  has(x: number, y: number, z: number) { return this.cells.has(key(x, y, z)); }
  get(x: number, y: number, z: number) { return this.cells.get(key(x, y, z)); }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null, g = 0) {
    if (this.cells instanceof WorldGrid && [x0,y0,z0,x1,y1,z1].every(Number.isInteger)
      && Math.min(y0,y1,z0,z1) >= -512 && Math.max(y0,y1,z0,z1) < 512) {
      this.cells.box(Math.min(x0,x1), Math.min(y0,y1), Math.min(z0,z1), Math.max(x0,x1), Math.max(y0,y1), Math.max(z0,z1), c, g);
      return this;
    }
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, c, g);
    return this;
  }
  /** chunk (cells, > 0): no merged rectangle crosses a chunk border in x or z, and every vertex carries its chunk's centre (world xz)
   *  as aChunk — the voxel-wave transition (scenes/transVox.ts) moves each 1 m column as one rigid block */
  build(o: WorldMeshOptions = {}) { return finishBuild(this.buildSteps(o)); }
  *buildSteps(o: WorldMeshOptions = {}): Generator<void, THREE.Mesh[]> {
    // act-34 (用户：「现在转场的时候有点卡」): a big place (the snowy village, 2.2 M cells) spent 2.7 s here asking the cell Map about
    // every neighbour. The occupancy now sits in a bitset over the cells' bounding box (padded by one cell, so every neighbour test of
    // a face, its AO corners and its edges stays inside it) and the face loop walks neighbours by index steps.
    const s = this.s, CH = o.chunk ?? 0, bits = this.cells instanceof WorldGrid ? this.cells.occupancy() : occupancy(this.cells);
    // (a whole place, not a prop that may topple or fly: those keep every face)
    const GROUND = o.ground ?? this.cells.size > 200000;
    const CULL_NORTH = !!o.cullNorth;
    const occ = bits ? bits.occ : (x: number, y: number, z: number) => this.cells.has(key(x, y, z));
    const chk = (x: number, z: number) => (CH ? Math.floor(x / CH) * 4096 + Math.floor(z / CH) : 0);
    const out = { solid: [[], [], [], [], [], [], [], []] as number[][], glow: [[], [], [], [], [], [], [], []] as number[][] };
    const col = new THREE.Color();
    // slices for merging: (dir, plane) → (u,v) → colour key
    const slices = new Map<number, Map<number, number>>();
    const uvKey = (u: number, v: number) => (u + 512) * 1024 + (v + 512);
    const quad = (tgt: number[][], corners: number[][], n: number[], c: THREE.Color, ao: number[], size: [number, number], open: number[], pos: boolean, cell: [number, number] = [0, 0]) => {
      const [P, N, C, U, I, E, S, K] = tgt, base = P.length / 3;
      const kx = CH ? (Math.floor(cell[0] / CH) + 0.5) * CH * s : 0, kz = CH ? (Math.floor(cell[1] / CH) + 0.5) * CH * s : 0;
      corners.forEach((p, i) => { P.push(p[0] * s, p[1] * s, p[2] * s); N.push(n[0], n[1], n[2]); const f = AO[ao[i]]; C.push(c.r * f, c.g * f, c.b * f); if (CH) K.push(kx, kz);
        U.push(i === 1 || i === 2 ? size[0] : 0, i === 2 || i === 3 ? size[1] : 0); E.push(...open); S.push(size[0], size[1]); });
      const flip = ao[0] + ao[2] < ao[1] + ao[3], q = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
      if (pos) I.push(...q.map(i => base + i)); else I.push(base + q[0], base + q[2], base + q[1], base + q[3], base + q[5], base + q[4]);
    };
    const B = bits?.b, SX = bits ? bits.ny * bits.nz : 0, SY = bits ? bits.nz : 0;
    const DD = DIRS.map(([a, b, c]) => a * SX + b * SY + c), TD = TAN.map(([p, q]) => [p[0] * SX + p[1] * SY + p[2], q[0] * SX + q[1] * SY + q[2]]);
    const SG: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const aos = [0, 0, 0, 0];
    const visible = this.cells instanceof WorldGrid && bits ? this.cells.entries(bits) : this.cells;
    let visited = 0;
    for (const [k, v] of visible) {
      if ((++visited & 2047) === 0) yield;
      const z = (k % 1024) - 512, y = (Math.floor(k / 1024) % 1024) - 512, x = Math.floor(k / (1024 * 1024)) - 512;
      const ci = bits ? bits.at(x, y, z) : 0;
      for (let d = 0; d < 6; d++) {
        if (d === 3 && y <= 0 && GROUND) continue;   // 11-18 微信帧率: in a whole place, the underside of what lies on (or under) the ground is never seen, nor needed for a shadow
        if (d === 5 && CULL_NORTH) continue;         // top-down combat rooms: north-facing (-z) backs are never seen by the south camera nor drawn by the shadow pass
        const [dx, dy, dz] = DIRS[d], [t1, t2] = TAN[d], ox = x + dx, oy = y + dy, oz = z + dz;
        if (B) {
          const oi = ci + DD[d]; if ((B[oi >>> 5] >>> (oi & 31)) & 1) continue;
          const T1 = TD[d][0], T2 = TD[d][1];
          for (let q = 0; q < 4; q++) {
            const s1 = SG[q][0], s2 = SG[q][1], i1 = oi + T1 * s1, i2 = oi + T2 * s2, i3 = i1 + T2 * s2;
            const a1 = (B[i1 >>> 5] >>> (i1 & 31)) & 1, a2 = (B[i2 >>> 5] >>> (i2 & 31)) & 1, a3 = (B[i3 >>> 5] >>> (i3 & 31)) & 1;
            aos[q] = v.g > 0 ? 3 : a1 && a2 ? 0 : 3 - (a1 + a2 + a3);
          }
        } else {
          if (occ(ox, oy, oz)) continue;
          for (let q = 0; q < 4; q++) {
            const s1 = SG[q][0], s2 = SG[q][1];
            const a1 = occ(ox + t1[0] * s1, oy + t1[1] * s1, oz + t1[2] * s1) ? 1 : 0, a2 = occ(ox + t2[0] * s2, oy + t2[1] * s2, oz + t2[2] * s2) ? 1 : 0;
            const a3 = occ(ox + t1[0] * s1 + t2[0] * s2, oy + t1[1] * s1 + t2[1] * s2, oz + t1[2] * s1 + t2[2] * s2) ? 1 : 0;
            aos[q] = v.g > 0 ? 3 : a1 && a2 ? 0 : 3 - (a1 + a2 + a3);
          }
        }
        const a = dx ? x : dy ? y : z, u = dx ? y : dy ? z : x, w = dx ? z : dy ? x : y;
        const canW = aos[0] === aos[3] && aos[1] === aos[2];
        const canU = aos[0] === aos[1] && aos[3] === aos[2];
        if (v.g === 0 && (canW || canU)) {
          const sk = d * 2048 + a + 1024; let sl = slices.get(sk); if (!sl) slices.set(sk, (sl = new Map()));
          const aoMask = aos[0] | (aos[1] << 2) | (aos[2] << 4) | (aos[3] << 6);
          sl.set(uvKey(u, w), v.c * 256 + aoMask); continue;
        }
        const cx = x + 0.5 + dx * 0.5, cy = y + 0.5 + dy * 0.5, cz = z + 0.5 + dz * 0.5;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s1, s2]) => [cx + (t1[0] * s1 + t2[0] * s2) * 0.5, cy + (t1[1] * s1 + t2[1] * s2) * 0.5, cz + (t1[2] * s1 + t2[2] * s2) * 0.5]);
        const open = [occ(x - t1[0], y - t1[1], z - t1[2]) ? 0 : 1, occ(x + t1[0], y + t1[1], z + t1[2]) ? 0 : 1, occ(x - t2[0], y - t2[1], z - t2[2]) ? 0 : 1, occ(x + t2[0], y + t2[1], z + t2[2]) ? 0 : 1];
        col.set(v.c); quad(v.g > 0 ? out.glow : out.solid, corners, [dx, dy, dz], col, aos.slice(), [1, 1], open, dx + dy + dz > 0, [x, z]);
      }
    }
    // greedy rectangles / constant-AO strips per slice (exact bilinear AO preservation)
    for (const [sk, sl] of slices) {
      const d = Math.floor(sk / 2048), a = (sk % 2048) - 1024, [dx, dy, dz] = DIRS[d], pos = dx + dy + dz > 0, plane = pos ? a + 1 : a;
      const keys = [...sl.keys()].sort((p, q) => p - q), done = new Set<number>();
      const cellAt = (u: number, w: number) => (dx ? [a, u, w] : dy ? [w, a, u] : [u, w, a]) as [number, number, number];
      for (const k0 of keys) {
        if ((++visited & 1023) === 0) yield;
        if (done.has(k0)) continue;
        const ck = sl.get(k0)!, u0 = Math.floor(k0 / 1024) - 512, w0 = (k0 % 1024) - 512;
        const aoMask = ck & 255, colHex = Math.floor(ck / 256);
        const a0 = aoMask & 3, a1 = (aoMask >> 2) & 3, a2 = (aoMask >> 4) & 3, a3 = (aoMask >> 6) & 3;
        const canW = a0 === a3 && a1 === a2, canU = a0 === a1 && a3 === a2;
        const c0 = cellAt(u0, w0), ch0 = chk(c0[0], c0[2]), same = (u: number, w: number) => { if (!CH) return true; const c = cellAt(u, w); return chk(c[0], c[2]) === ch0; };
        let w1 = w0;
        if (canW) while (sl.get(uvKey(u0, w1 + 1)) === ck && !done.has(uvKey(u0, w1 + 1)) && same(u0, w1 + 1)) w1++;
        let u1 = u0;
        if (canU) grow: for (;;) { for (let ww = w0; ww <= w1; ww++) { const kk = uvKey(u1 + 1, ww); if (sl.get(kk) !== ck || done.has(kk) || !same(u1 + 1, ww)) break grow; } u1++; }
        for (let uu = u0; uu <= u1; uu++) for (let ww = w0; ww <= w1; ww++) done.add(uvKey(uu, ww));
        // an edge of the rectangle is bevelled where the surface does not continue in-plane beyond it
        const t1 = TAN[d][0], t2 = TAN[d][1];
        const edgeOpen = (cells: Array<[number, number, number]>, t: number[], sgn: number) => cells.every(([cx, cy, cz]) => !occ(cx + t[0] * sgn, cy + t[1] * sgn, cz + t[2] * sgn)) ? 1 : 0;
        const colU = (uu: number) => { const r: Array<[number, number, number]> = []; for (let ww = w0; ww <= w1; ww++) r.push(cellAt(uu, ww)); return r; };
        const rowW = (ww: number) => { const r: Array<[number, number, number]> = []; for (let uu = u0; uu <= u1; uu++) r.push(cellAt(uu, ww)); return r; };
        const open = [edgeOpen(colU(u0), t1, -1), edgeOpen(colU(u1), t1, 1), edgeOpen(rowW(w0), t2, -1), edgeOpen(rowW(w1), t2, 1)];
        const corners = [[u0, w0], [u1 + 1, w0], [u1 + 1, w1 + 1], [u0, w1 + 1]].map(([uu, ww]) => (dx ? [plane, uu, ww] : dy ? [ww, plane, uu] : [uu, ww, plane]));
        col.set(colHex); quad(out.solid, corners, [dx, dy, dz], col, [a0, a1, a2, a3], [u1 - u0 + 1, w1 - w0 + 1], open, pos, [c0[0], c0[2]]);
      }
    }
    const meshes: THREE.Mesh[] = [];
    let transferred = false;
    try {
      yield;
      for (const [arr, isGlow] of [[out.solid, false], [out.glow, true]] as const) {
        const [P, N, C, U, I, E, S, K] = arr; if (!I.length) continue;
        const g = new THREE.BufferGeometry();
        const attrs: [string, number[], number][] = [['position', P, 3], ['normal', N, 3], ['color', C, 3],
          ['aVox', U, 2], ['aOpen', E, 4], ['aSize', S, 2]];
        if (CH) attrs.push(['aChunk', K, 2]);
        for (const [name, values, width] of attrs) {
          g.setAttribute(name, new THREE.Float32BufferAttribute(values, width));
          if (OPT.slicedRoom) yield;
        }
        g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1)); g.computeBoundingSphere();
        const m = new THREE.Mesh(g, isGlow ? glowMat(o.glow ?? 2.4) : voxToon({ rim: o.rim ?? 0.35, self: o.self ?? 0.03, edge: o.edge ?? 0.16, hole: true }));
        m.castShadow = !isGlow; m.receiveShadow = true; meshes.push(m);
        // 11-18 微信帧率: a big place draws its shadow from 12 m position-only tiles instead (engine/shadowTiles.ts)
        if (!isGlow) { const tiles = OPT.slicedRoom ? yield* shadowTileSteps(m, o.tile ?? TILE_M) : shadowTiles(m, o.tile ?? TILE_M); if (tiles.length) { m.castShadow = false; m.userData.shadowTiled = true; meshes.push(...tiles); } }
      }
      transferred = true;
      return meshes;
    } finally {
      if (!transferred) for (const m of meshes) m.geometry.dispose();
    }
  }
}
