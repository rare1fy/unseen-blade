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

type Hook = (dt: number, rdt: number) => void;
const updaters: Hook[] = [], lateUpdaters: Hook[] = [];
export const onUpdate = (fn: Hook) => { updaters.push(fn); };
export const onLateUpdate = (fn: Hook) => { lateUpdaters.push(fn); };
export function runUpdaters(dt: number, rdt: number) { for (const f of updaters) f(dt, rdt); }
export function runLateUpdaters(dt: number, rdt: number) { for (const f of lateUpdaters) f(dt, rdt); }

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
