// 11-18 (第三关): a foe seen only faintly or not at all — the 死士 sliding in unseen, the 水鬼 under the water, 封鸩 gone into his mist.
// The actor's meshes get their own see-through copies of their materials (once; the toon materials are per-actor already, the others
// shared), the originals go back at k = 1. mem.hidden = it is (nearly) gone: show.ts leaves out its bar over the head and its contact
// shadow, and the hero's blade can't find it (its RoleAI guard returns −1 while hidden).
import * as THREE from 'three';
import type { Foe } from '../enemy';

interface Faded { mesh: THREE.Mesh; orig: THREE.Material | THREE.Material[]; see: THREE.Material[] }
const FADED = new WeakMap<object, Faded[]>();

/** how visible the foe is: 1 = as normal (the original materials), 0 = gone; hidden below 0.25 */
export function fade(f: Foe, k: number) {
  k = Math.max(0, Math.min(1, k)); f.mem.fadeK = k; f.mem.hidden = k < 0.25;
  let list = FADED.get(f.a);
  if (k >= 0.999) { if (list) { for (const x of list) x.mesh.material = x.orig; } f.a.root.visible = true; return; }
  if (!list) {
    list = [];
    f.a.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const orig = m.material, arr = Array.isArray(orig) ? orig : [orig]; list!.push({ mesh: m, orig, see: arr.map(x => { const c = x.clone(); c.transparent = true; return c; }) }); });
    FADED.set(f.a, list);
  }
  for (const x of list) { x.mesh.material = x.see.length === 1 ? x.see[0] : x.see; for (const c of x.see) { c.opacity = k; c.depthWrite = k > 0.9; } x.mesh.castShadow = k > 0.6; }
  // fully gone: nothing drawn at all (and a little cheaper)
  f.a.root.visible = k > 0.01 || f.st === 'windup';
}
/** back to normal (its death must be seen): show.ts calls this before the death plays */
export function unfade(f: Foe) { if (f.mem.fadeK != null && f.mem.fadeK < 1) fade(f, 1); f.mem.hidden = false; f.a.root.visible = true; }
/** ease the visibility toward a target (s = how fast, 1/s) */
export function fadeTo(f: Foe, want: number, dt: number, s = 6) {
  const k = f.mem.fadeK ?? 1; if (Math.abs(k - want) < 0.005) { if (k !== want) fade(f, want); return; }
  fade(f, k + (want - k) * Math.min(1, dt * s));
}
