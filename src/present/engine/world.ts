// The shared 3D world: one scene, the main camera, the renderer, and the per-frame update hooks. Created once at boot (gfx.ts);
// presentation modules import these handles instead of passing them around.
import * as THREE from 'three';
import { makeCanvas } from '../../platform/index';

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 400);
export const view = { w: 1, h: 1, dpr: 1 };
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const C = (c: THREE.ColorRepresentation) => new THREE.Color(c);
export const WHITE = new THREE.Color(1, 1, 1);
export const TAU = Math.PI * 2;
export const R = (a: number, b: number) => a + Math.random() * (b - a);   // presentation-only randomness (never in rules)
export const RI = (a: number, b: number) => Math.floor(R(a, b + 1));
/** the renderer, once gfx.ts has made it (act-34: transitions precompile the new scene's shaders behind the cover) */
export const GL: { renderer: THREE.WebGLRenderer | null } = { renderer: null };
/** act-34: three.js builds every lit shader for the exact number of point lights in view, so a new place with a different count
 *  (a lantern more, a campfire less) recompiled every lit material in its first frame — 19 programs, 1.9 s on the title's cut. The
 *  scene now always holds the same number: zero-intensity filler lights make up the difference every frame (counted before render).
 *  More than PAD_N real lights still works, it only costs a recompile. */
const PAD_N = 18, pads: THREE.PointLight[] = [];
export function padLights() {
  let n = 0; scene.traverseVisible(o => { if ((o as THREE.PointLight).isPointLight && !o.userData.pad) n++; });
  const want = Math.max(0, PAD_N - n);
  while (pads.length < want) { const l = new THREE.PointLight(0x000000, 0, 0.01, 2); l.userData.pad = true; l.position.set(0, -400, 0); scene.add(l); pads.push(l); }
  for (let i = 0; i < pads.length; i++) pads[i].visible = i < want;
}
/** compile every material the scene now holds, so the first frames after a scene swap do not stall on shader compiles */
export function precompile() { padLights(); try { GL.renderer?.compile(scene, camera); } catch (e) { console.warn('[precompile]', e); } }
/** upload a group's meshes to the GPU ahead of its first real frame (act-34): it joins the scene for one render into a tiny
 *  target with culling off, then leaves again (the scene's own picture is untouched; its shadow map is redrawn next frame anyway) */
export function warm(root: THREE.Object3D) {
  const r = GL.renderer; if (!r || root.parent) return;
  const rt = new THREE.WebGLRenderTarget(4, 4), culled: Array<[THREE.Object3D, boolean]> = [];
  root.traverse(o => { culled.push([o, o.frustumCulled]); o.frustumCulled = false; });
  scene.add(root); padLights();
  const prev = r.getRenderTarget();
  try { r.setRenderTarget(rt); r.render(scene, camera); } catch (e) { console.warn('[warm]', e); }
  r.setRenderTarget(prev); scene.remove(root);
  for (const [o, f] of culled) o.frustumCulled = f;
  rt.dispose();
}
/** resolve after n real frames */
export const frames = (n: number) => new Promise<void>(res => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });

type Hook = (dt: number, rdt: number) => void;
const updaters: Hook[] = [], lateUpdaters: Hook[] = [];
export const onUpdate = (fn: Hook) => { updaters.push(fn); };
export const onLateUpdate = (fn: Hook) => { lateUpdaters.push(fn); };
export function runUpdaters(dt: number, rdt: number) { for (const f of updaters) f(dt, rdt); }
export function runLateUpdaters(dt: number, rdt: number) { for (const f of lateUpdaters) f(dt, rdt); }
/** real-time UI (the pause menu): called every frame with the real step, paused or not */
const realUpdaters: Array<(rdt: number) => void> = [];
export const onRealUpdate = (fn: (rdt: number) => void) => { realUpdaters.push(fn); };
export function runRealUpdaters(rdt: number) { for (const f of realUpdaters) f(rdt); }

/** A texture painted with a 2D canvas (procedural: dice faces, particle tiles, decals). */
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, cv: any) => void, o: { nearest?: boolean } = {}) {
  const cv = makeCanvas(w, h), g = cv.getContext('2d') as CanvasRenderingContext2D;
  draw(g, cv);
  const t = new THREE.CanvasTexture(cv as HTMLCanvasElement);
  if (o.nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.canvas = cv;
  return t;
}
