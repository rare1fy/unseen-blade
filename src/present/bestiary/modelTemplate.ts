import * as THREE from 'three';
import type { ModelDef } from './models';
import type { Bone } from '../actors/rig';
import { templateGeometry } from '../engine/rigidBatch';
import { finishBuild } from '../engine/buildSteps';
import { VoxChar } from '../look/voxkit';
import { OPT } from '../engine/perfOpts';
import { prepareActorFaceModel, buildSmoothCelRig, type FaceFactory } from '../look/actorFace';

function build(def: ModelDef) { return finishBuild(buildSteps(def)); }
function* buildSteps(def: ModelDef) {
  const v = def.build(), lv = v as typeof v & { u?: number; p?: number; k?: number; extent?: { top: number; width: number } };
  const cx = lv.u ?? lv.k ?? v.s, cy = lv.p ?? lv.k ?? v.s;
  const options = { glow: def.glow ?? 1.35, jitter: 0, self: (def.self ?? 0.06) + 0.1, rim: 1.1, edge: 0.13 };
  // Some roster models supply their own rig builder. They keep their pivots and unit conversion.
  // Fine 3.5 cm humanoids (heroine, NPCs, generals, bosses, soldiers) use the 100% smooth-normal cel pipeline + 2× animated faces.
  const isFineHumanoid = def.kind === 'biped' && v.s < 0.05 && v.build === VoxChar.prototype.build && v.bonesAbs.has('head');
  const rig: { bones: Record<string, Bone>; meshes: THREE.Mesh[]; root: Bone; faceFactory?: FaceFactory } = isFineHumanoid
    ? buildSmoothCelRig(v, prepareActorFaceModel(v, def.id), { glow: options.glow })
    : (OPT.slicedRoom && v.build === VoxChar.prototype.build ? yield* v.buildSteps(options) : v.build(options));
  let top = lv.extent?.top ?? 0, width = lv.extent?.width ?? 0;
  if (top <= 0) for (const c of v.cells.values()) {
    top = Math.max(top, (c.y + 1) * cy); width = Math.max(width, (Math.abs(c.x + 0.5) + 0.5) * 2 * cx);
  }
  const sc = def.scale ?? 1;
  if (sc !== 1) rig.root.scale.setScalar(sc);
  return { ...rig, cx, cy, top: top * sc, width: width * sc };
}

type Rig = ReturnType<typeof build>;
const cache = new WeakMap<ModelDef, { builder: ModelDef['build']; glow?: number; self?: number; greedy: boolean; rig: Rig }>();
// voxEdit installs a new builder when an edited .vox is loaded. Code-only comparison models have separate definitions.
export function modelTemplate(def: ModelDef) { return finishBuild(modelTemplateSteps(def)); }
export function* modelTemplateSteps(def: ModelDef) {
  const prev = cache.get(def);
  if (prev && prev.builder === def.build && prev.glow === def.glow && prev.self === def.self && prev.greedy === OPT.greedyActors) return prev.rig;
  const rig = yield* buildSteps(def);
  rig.root.traverse(o => { if (o instanceof THREE.Mesh) templateGeometry.add(o.geometry); });
  cache.set(def, { builder: def.build, glow: def.glow, self: def.self, greedy: OPT.greedyActors, rig });
  return rig;
}
export function actorModel(def: ModelDef): Rig {
  if (!OPT.fightWarmup) return build(def);
  const t = modelTemplate(def), root = t.root.clone(true), copy = new Map<THREE.Object3D, THREE.Object3D>();
  const pair = (a: THREE.Object3D, b: THREE.Object3D) => {
    copy.set(a,b);
    for (let i = 0; i < a.children.length; i++) pair(a.children[i], b.children[i]);
  };
  pair(t.root, root);
  const bones: Record<string, Bone> = {};
  for (const [name, original] of Object.entries(t.bones)) {
    const b = bones[name] = copy.get(original)! as Bone;
    if (original.rest) b.rest = { p: original.rest.p.clone(), r: original.rest.r.clone(), s: original.rest.s.clone() };
  }
  return { ...t, root, bones, meshes: t.meshes.map(m => copy.get(m)! as THREE.Mesh) };
}
