// Per-model pose hooks: a model file can own its whole pose (idle + actions) instead of the generic poses in bactor.ts.
// Kept in its own module so model files can register without importing bactor.ts (no import cycle).
import type * as THREE from 'three';
import type { Action, Bone } from '../actors/rig';

/** b = the model's joints (already reset to rest), t = the actor's clock (s), a = the action playing (or null), off = the actor's
 *  local offset (x right, y up, z forward; lunges / hops), self = the actor (BActor) for anything else */
export type PoseFn = (b: Record<string, Bone>, t: number, a: Action | null, off: THREE.Vector3, self: unknown) => void;
export const POSE_HOOKS: Record<string, PoseFn> = {};
