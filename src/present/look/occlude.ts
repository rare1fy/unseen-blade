// Occluded-character silhouette outline mask:
// Characters draw their normal opaque body at renderOrder = 9 (after walls / roofs / trees / props at renderOrder <= 2).
// Just before that (renderOrder 7 for foes, 8 for hero / allies / NPCs), a companion GreaterDepth pass writes ONLY the
// alpha channel of post.rt (RGB untouched via CustomBlending): 0.0 for hero/ally/NPC, 0.50 for foes (unoccluded world = 1.0).
// post.ts detects the silhouette boundary in screen space (zero extra render targets, zero self-occlusion, WebGL1 + WebGL2 safe).
import * as THREE from 'three';
import { OPT, CAPS } from '../engine/perfOpts';

export type OccKind = 0 | 1 | 2;
export const OCC_ORDER = { foe: 7, hero: 8, body: 9 } as const;

const OCC_VS = `
#include <skinning_pars_vertex>
varying float vWorldY;
void main() {
  #include <begin_vertex>
  #include <skinbase_vertex>
  #include <skinning_vertex>
  vWorldY = (modelMatrix * vec4(transformed, 1.0)).y;
  #include <project_vertex>
  // Slight depth bias suppresses grazing z-fights with nearby floor slabs while keeping real wall/pillar/tree occlusion crisp
  gl_Position.z += 0.0004 * gl_Position.w;
}
`;

const OCC_FS = `
precision mediump float;
uniform float uOcc;
varying float vWorldY;
void main() {
  // Never outline ground-contact soles/hems dipping slightly into floor geometry
  if (vWorldY < 0.24) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, uOcc);
}
`;

const cache = new Map<string, THREE.ShaderMaterial>();

export function occMaterial(kind: 1 | 2, skinned: boolean): THREE.ShaderMaterial {
  const key = `${kind}|${skinned ? 1 : 0}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      vertexShader: OCC_VS,
      fragmentShader: OCC_FS,
      uniforms: { uOcc: { value: kind === 1 ? 0.0 : 0.55 } },
      transparent: false,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.ZeroFactor,
      fog: false,
      toneMapped: false,
    });
    cache.set(key, m);
  }
  return m;
}

const unbatchedClones = new WeakMap<THREE.Object3D, THREE.Mesh[]>();

/** Tag an actor root for occluded-silhouette outlining (0 = off, 1 = hero/ally/NPC, 2 = foe). */
export function setActorOcc(root: THREE.Object3D, kind: OccKind) {
  const prev = (root.userData.occ as OccKind | undefined) ?? 0;
  root.userData.occ = kind;
  // Batched actors (RigidBatch) read root.userData.occ each frame in RigidBatch.sync().
  // Fallback for WebGL1 without float vertex textures or when OPT.batch is disabled:
  if (CAPS.boneTex && OPT.batch) {
    const old = unbatchedClones.get(root);
    if (old) { for (const c of old) c.visible = false; }
    return;
  }
  let list = unbatchedClones.get(root);
  if (!list && kind !== 0) {
    const k = kind;
    list = [];
    root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || m.userData.isOcc) return;
      const mat = m.material as THREE.Material;
      if (!mat || Array.isArray(mat) || mat.transparent) return;
      const c = new THREE.Mesh(m.geometry, occMaterial(k, false));
      c.userData.noBatch = true; c.userData.isOcc = true; c.userData.noTilt = true;
      c.castShadow = false; c.receiveShadow = false; c.frustumCulled = false;
      c.renderOrder = k === 1 ? OCC_ORDER.hero : OCC_ORDER.foe;
      m.add(c);
      list!.push(c);
    });
    unbatchedClones.set(root, list);
  }
  if (list && (prev !== kind || kind !== 0)) {
    const mat = kind !== 0 ? occMaterial(kind, false) : null;
    const order = kind === 1 ? OCC_ORDER.hero : OCC_ORDER.foe;
    for (const c of list) {
      if (mat && c.material !== mat) c.material = mat;
      c.renderOrder = order;
      const p = c.parent as THREE.Mesh | null;
      const pMat = p?.material as THREE.Material | undefined;
      c.visible = kind !== 0 && !!p?.visible && !!pMat && !pMat.transparent;
    }
  }
}
