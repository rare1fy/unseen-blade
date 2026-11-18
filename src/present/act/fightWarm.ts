import * as THREE from 'three';
import { modelDef } from '../bestiary/models';
import { modelTemplate } from '../bestiary/modelTemplate';
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
export function prepareFight(waves: string[][]) {
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
  const keys = new Set(waves.flat());
  for (const k of keys) {
    const d = EDEFS[k.replace(/\*$/, '')]; if (!d) continue;
    const ids = k.endsWith('*') && d.elite ? [d.elite] : [d.model, ...(d.alt ?? [])];
    for (const id of ids) {
      modelTemplate(modelDef(id)).root.traverse(o => {
        if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || materials.has(o.material)) return;
        materials.add(o.material);
        // Only the attribute layout is used by compile(); keep the probes off the render list.
        effects.add(new THREE.Mesh(o.geometry, o.material));
        if (CAPS.boneTex) effects.add(new THREE.SkinnedMesh(o.geometry, o.material));
      });
    }
  }
  const prev = renderer.getRenderTarget();
  padLights();
  try {
    // Match the linear offscreen world pass, including its fog, shadows and exact light count.
    syncBatches(); renderer.setRenderTarget(target);
    const compiled = [renderer.compile(scene, camera), renderer.compile(effects, camera, scene)];
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
      compiled.push(renderer.compile(ui.scene, ui.camera), renderer.compile(uiVariants, ui.camera, ui.scene));
    }
    // r162 links lazily on the first uniform lookup. Resolve those locations while the room is loading.
    for (const set of compiled) for (const m of set) {
      const programs = renderer.properties.get(m).programs as Map<string, { getUniforms(): unknown }> | undefined;
      if (programs) for (const p of programs.values()) p.getUniforms();
    }
  } finally { renderer.setRenderTarget(prev); restoreLights(); }
}
