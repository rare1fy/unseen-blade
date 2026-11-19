import * as THREE from 'three';
import { modelDef } from '../bestiary/models';
import { modelTemplateSteps } from '../bestiary/modelTemplate';
import { OPT, CAPS } from '../engine/perfOpts';
import { GL, scene, camera, padLights, restoreLights } from '../engine/world';
import { syncBatches } from '../engine/rigidBatch';
import { UI3D } from '../look/pixel';
import { EDEFS } from './enemy';
import { Tele } from './tele';
import { blood } from './blood';

const effects = new THREE.Scene(), materials = new WeakSet<THREE.Material>();
const uiVariants = new THREE.Scene();
const variantKeys = new Set<string>();
let target: THREE.WebGLRenderTarget | undefined;
export function* prepareFightModels(waves: string[][]) {
  if (!OPT.fightWarmup || !GL.renderer) return;
  const keys = new Set(waves.flat());
  for (const k of keys) {
    const d = EDEFS[k.replace(/\*$/, '')]; if (!d) continue;
    const ids = k.endsWith('*') && d.elite ? [d.elite] : [d.model, ...(d.alt ?? [])];
    for (const id of ids) {
      yield;
      const template = yield* modelTemplateSteps(modelDef(id));
      template.root.traverse(o => {
        if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || materials.has(o.material)) return;
        materials.add(o.material);
        // Only the attribute layout is used by compile(); keep the probes off the render list.
        effects.add(new THREE.Mesh(o.geometry, o.material));
        if (CAPS.boneTex) effects.add(new THREE.SkinnedMesh(o.geometry, o.material));
      });
    }
  }
}
export function* prepareFight() {
  const renderer = GL.renderer;
  if (!OPT.fightWarmup || !renderer) return;
  if (!target) {
    target = new THREE.WebGLRenderTarget(1, 1);
    // Keep a reference to each transient program. Disposing the last telegraph or number
    // between swings would otherwise evict it, even after the room had compiled it once.
    effects.add(new Tele({ k: 'circle', ahead: 0, r: 1 }, { low: true }).g);
    const sprite = new THREE.SpriteMaterial({ map: new THREE.Texture(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    effects.add(new THREE.Sprite(sprite));
    const plane = new THREE.PlaneGeometry();
    effects.add(new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: sprite.map, transparent: true, depthTest: false, depthWrite: false })));
    blood.prepare();
  }
  const passes: [THREE.Scene, THREE.Camera, THREE.Scene][] = [[scene, camera, scene], [effects, camera, scene]];
  const ui = UI3D.layer;
  if (ui) {
    ui.scene.traverse(o => {
      const mesh = o as THREE.Mesh, src = mesh.material as THREE.Material;
      if (!mesh.isMesh || !src || Array.isArray(src) || mesh.name === 'rigidBatch') return;
      // Slot icons can become transparent independently, and cards replace the last owner of a program.
      const key = [src.type, src.vertexColors, src.side, src.customProgramCacheKey(), !!(src as THREE.MeshBasicMaterial).map, src.toneMapped].join('|');
      if (variantKeys.has(key)) return;
      variantKeys.add(key);
      for (const transparent of [false, true]) {
        const mat = src.clone(); mat.transparent = transparent; mat.onBeforeCompile = src.onBeforeCompile; mat.customProgramCacheKey = src.customProgramCacheKey.bind(src);
        uiVariants.add(new THREE.Mesh(mesh.geometry, mat));
      }
    });
    passes.push([ui.scene, ui.camera, ui.scene], [uiVariants, ui.camera, ui.scene]);
  }
  syncBatches();
  const compiled = new Set<THREE.Material>();
  for (const [objects, view, lights] of passes) {
    if (OPT.slicedRoom) yield;
    const prev = renderer.getRenderTarget();
    // The loading blade renders between passes with the live target and lights.
    padLights();
    try {
      renderer.setRenderTarget(target);
      for (const m of renderer.compile(objects, view, lights)) compiled.add(m);
    } finally { renderer.setRenderTarget(prev); restoreLights(); }
  }
  // r162 links lazily on the first uniform lookup; probes sharing a program only need to resolve it once.
  const linked = new Set<{ getUniforms(): unknown }>();
  let until = performance.now() + 3;
  for (const m of compiled) {
    const programs = renderer.properties.get(m).programs as Map<string, { getUniforms(): unknown }> | undefined;
    if (!programs) continue;
    for (const program of programs.values()) {
      if (linked.has(program)) continue;
      linked.add(program); program.getUniforms();
      if (OPT.slicedRoom && performance.now() >= until) { yield; until = performance.now() + 3; }
    }
  }
}
