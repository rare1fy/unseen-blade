// 11-18 (一局五关): the registry the later regions' foes plug into — their EDEFS entries and their AI (one RoleAI per role), each region in
// its own files (act/foes/ly_*.ts, xp_*.ts …) so the regions can be built side by side without all of them editing enemy.ts.
// Only type imports from enemy.ts here (erased at build): enemy.ts reads this module at run time, the regions' files import both.
import type * as THREE from 'three';
import type { Foe, FoeWorld } from '../enemy';

/** what a role decides while free to move: where it wants to go (world, m/s before the role's speed), how fast (× its speed), whether
 *  it keeps facing the hero while moving; or 'busy' = it started an attack / did its own thing this frame (no movement) */
export type Steer = { want: THREE.Vector3; sp?: number; aim?: boolean } | 'busy';
export interface ThinkCtx {
  dt: number; dist: number; dir: THREE.Vector3; yawTo: number;
  /** may it start an attack now (cool-down done, the attacker cap and the calm between blows allow it) */
  can: boolean;
  /** the side step direction (perpendicular to dir, this foe's strafe sign) */
  side: THREE.Vector3;
  /** turn toward a yaw (k = how fast) */
  face(y: number, k?: number): void;
}
/**
 * A foe role's behaviour. Every hook is optional except think: the defaults in enemy.ts do the rest (the generic wind-up tracking,
 * the strike over the warning shape, the lunge along a locked lane, the recover).
 */
export interface RoleAI {
  /** free movement and the decision to attack (call startAttack / start your own state, and return 'busy') */
  think(f: Foe, w: FoeWorld, k: ThinkCtx): Steer;
  /** every frame before anything else (phases, timers, buffs; the boss's half-HP turn) */
  tick?(f: Foe, w: FoeWorld, dt: number): void;
  /** every frame of the wind-up (aim tracking: set f.teleYaw / f.telePos; return true = done, skip the default tracking) */
  windup?(f: Foe, w: FoeWorld, dt: number, p: number, yawTo: number): boolean | void;
  /** the moment the wind-up ends: true = handled here (else the default strike: lunge / area / arrows by role) */
  strike?(f: Foe, w: FoeWorld): boolean;
  /** every frame of the strike state (after the default lunge contact check) */
  striking?(f: Foe, w: FoeWorld, dt: number): void;
  /** how long it recovers after this attack (s) */
  recover?(f: Foe): number | undefined;
  /** the attack the wind-up is for can be jumped over */
  low?(f: Foe, shape: import('../tele').TeleShape): boolean;
  /** an incoming hit (before HP): return the damage to take (0 = blocked: a glance, sparks, no blood; < 0 = not touched at all — under the
   *  water, in the mist), or undefined = as is.
   *  kind = the hero's blow ('k1'…'k5', 'rel' 箭步斩 / 一闪, 'parry' 破势's reflect, 'plunge' 劈山, 'dart', 'arrow' a batted arrow, 'school' a wall
   *  slam / blast / fire …) */
  guard?(f: Foe, dmg: number, from: THREE.Vector3, kind: string): number | undefined;
  /** the attack was broken off from outside (破势 caught it, 一闪 pinned it) */
  interrupted?(f: Foe, w: FoeWorld | null): void;
  /** the clamp moved it (a wall / cover / prop in the way) by (dx, dz) */
  bumped?(f: Foe, w: FoeWorld, dx: number, dz: number): void;
}
export const ROLE_AI: Record<string, RoleAI> = {};
