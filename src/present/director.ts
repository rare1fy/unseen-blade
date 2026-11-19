// Camera director: named shots (functions, so they can track moving actors), blended with frame-rate independent damping in REAL time
// (hitstop / slow motion never freeze the camera), plus orbit shots for kills and victory. Writes the CAM rig the frame loop renders.
import * as THREE from 'three';
import { V3, view, onLateUpdate } from './engine/world';
import { CAM } from './engine/gfx';
import { PX, setPixel } from './look/pixel';

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

/** 11-19 (用户：「镜头拉近了以后像素感的描边也跟着变细了」→ 对比图后「这个处理方式可行」): while a cutscene or a conversation
 *  holds the camera, the art pixel grows with how much nearer the shot is than the battle camera, so a voxel (and its 1-art-pixel
 *  outline) keeps about the same size on screen. Whole multiples only, picked on a cut and held through the shot's move (no pop
 *  mid-dolly), capped at 2× the player's size (the nearest a shot should come is half the battle distance); back to the player's
 *  size when the scene ends. show.ts sets on / ref (the battle camera's distance and fov). */
export const CINE_PX = { on: false, ref: { d: 20.1, fov: 45 }, max: 2, cap: 3 };   // (act-94 用户：「拉得最近最多3x我感觉就差不多了，不然完全是糊的」→ cap = 3x at most)
let cineBase = 0, lastT = V3(), lastOk = false;
const sizeK = (s: Shot) => {
  const r = CINE_PX.ref, d = Math.max(0.5, s.base.distanceTo(s.look));
  // on-screen size of one voxel ∝ 1 / (d · tan(fov/2)); relative to the battle camera (the same 0.86 landscape factor on both)
  return (r.d * Math.tan(r.fov * Math.PI / 360)) / (d * Math.tan(s.fov * Math.PI / 360));
};
function cinePixel(cut: boolean, s: Shot) {
  if (!CINE_PX.on) { lastOk = false; if (cineBase) { const b = cineBase; cineBase = 0; if (PX.on && PX.size !== b) setPixel(true, b); } return; }
  if (!PX.on) return;
  if (!cineBase) { cineBase = PX.size; cut = true; }
  // a new framing: a cut, or the shot's target jumping (a conversation swapping its camera) — never a dolly's steady glide
  const jumped = lastOk && s.base.distanceTo(lastT) > 0.6; lastT.copy(s.base); lastOk = true;
  if (!cut && !jumped) return;
  // a moving shot is judged by both ends (geometric mean), so neither end is far off
  const e = target(1e4), k = Math.sqrt(sizeK(s) * sizeK(e));
  const n = Math.max(cineBase, Math.min(cineBase * CINE_PX.max, Math.max(cineBase, CINE_PX.cap), Math.round(cineBase * k)));
  if (n !== PX.size) setPixel(true, n);
}

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
  const cut = cutNext;
  if (cutNext) { cur.base.copy(s.base); cur.look.copy(s.look); cur.fov = fov; cutNext = false; }
  const k = 1 - Math.exp(-speed * rdt);
  cur.base.lerp(s.base, k); cur.look.lerp(s.look, k); cur.fov += (fov - cur.fov) * k;
  pose.base.copy(cur.base); pose.look.copy(cur.look); pose.fov = cur.fov;
  cinePixel(cut, s);
  CAMHOOK.fn?.(pose, rdt);
  CAM.base.copy(pose.base); CAM.look.copy(pose.look); CAM.fov = pose.fov;
});
