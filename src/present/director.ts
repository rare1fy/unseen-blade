// Camera director: named shots (functions, so they can track moving actors), blended with frame-rate independent damping in REAL time
// (hitstop / slow motion never freeze the camera), plus orbit shots for kills and victory. Writes the CAM rig the frame loop renders.
import * as THREE from 'three';
import { V3, view, onLateUpdate } from './engine/world';
import { CAM } from './engine/gfx';

export interface Shot { base: THREE.Vector3; look: THREE.Vector3; fov: number }
type ShotFn = (t: number) => Shot;
const cur = { base: V3(0, 22, 24), look: V3(0, 0, -2), fov: 34 };
let target: ShotFn = () => ({ base: cur.base.clone(), look: cur.look.clone(), fov: cur.fov });
let speed = 3, shotT = 0, cutNext = false;
export const DIRECTOR = { name: 'none', aspectK: 1 };
/** scene transitions (scenes/transition.ts) bend the camera after the shot blend: the hook gets the blended pose (base, look, fov
 *  already corrected for the aspect) and may rewrite it in place; null = the shot as blended */
export const CAMHOOK: { fn: ((pose: { base: THREE.Vector3; look: THREE.Vector3; fov: number }, rdt: number) => void) | null } = { fn: null };
const shotSeen: Array<(name: string) => void> = [];
/** listen to every shot change (a transition starts its fog with the map's dive, which it does not own) */
export const onShot = (f: (name: string) => void) => { shotSeen.push(f); };
const pose = { base: V3(), look: V3(), fov: 30 };

/** Switch to a shot. speed = blend rate (higher = faster); cut = jump without blending. */
export function shot(name: string, fn: ShotFn, o: { speed?: number; cut?: boolean } = {}) {
  DIRECTOR.name = name; target = fn; speed = o.speed ?? 3; shotT = 0; cutNext = !!o.cut;
  for (const f of shotSeen) f(name);
}
/** where the blended camera will be t real seconds from now if the current shot holds still (transitions place their clouds there) */
export function shotAhead(t: number) {
  const s = target(shotT), k = cutNext ? 1 : 1 - Math.exp(-speed * t);
  return { base: cur.base.clone().lerp(s.base, k), look: cur.look.clone().lerp(s.look, k) };
}
export const staticShot = (base: THREE.Vector3, look: THREE.Vector3, fov: number): ShotFn => () => ({ base, look, fov });
/** Orbit a point: radius, height, angular speed (rad/s), starting angle. */
export const orbitShot = (center: () => THREE.Vector3, r: number, h: number, w: number, a0: number, fov: number, lookUp = 1): ShotFn => t => {
  const c = center(), a = a0 + w * t; return { base: V3(c.x + Math.sin(a) * r, c.y + h, c.z + Math.cos(a) * r), look: c.clone().add(V3(0, lookUp, 0)), fov };
};

onLateUpdate((_dt, rdt) => {
  shotT += rdt;
  const s = target(shotT);
  // portrait phones need a wider vertical view than desktop for the same composition
  const portrait = view.w / Math.max(1, view.h) < 0.8;
  const fov = s.fov * (portrait ? 1 : 0.86);
  if (cutNext) { cur.base.copy(s.base); cur.look.copy(s.look); cur.fov = fov; cutNext = false; }
  const k = 1 - Math.exp(-speed * rdt);
  cur.base.lerp(s.base, k); cur.look.lerp(s.look, k); cur.fov += (fov - cur.fov) * k;
  pose.base.copy(cur.base); pose.look.copy(cur.look); pose.fov = cur.fov;
  CAMHOOK.fn?.(pose, rdt);
  CAM.base.copy(pose.base); CAM.look.copy(pose.look); CAM.fov = pose.fov;
});
