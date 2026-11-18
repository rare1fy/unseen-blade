// Per-model pose hooks: a model file can own its whole pose (idle + actions) instead of the generic poses in bactor.ts.
// Kept in its own module so model files can register without importing bactor.ts (no import cycle).
import type * as THREE from 'three';
import type { Action, Bone } from '../actors/rig';

/** b = the model's joints (already reset to rest), t = the actor's clock (s), a = the action playing (or null), off = the actor's
 *  local offset (x right, y up, z forward; lunges / hops), self = the actor (BActor) for anything else */
export type PoseFn = (b: Record<string, Bone>, t: number, a: Action | null, off: THREE.Vector3, self: unknown) => void;
export const POSE_HOOKS: Record<string, PoseFn> = {};
/** 11-18 (一局五关): a model's own layer ON TOP of the generic pose (by model id, elites registered separately): runs after the base idle /
 *  run / hurt / the generic actions every frame, adds to them (rot / mov are additive), and plays the model's own named actions
 *  (a.name not known to the base: 'thrust', 'charge', …). The foes of the later regions use it (act/foes/region_acts.ts). */
export const POSE_AFTER: Record<string, PoseFn> = {};
