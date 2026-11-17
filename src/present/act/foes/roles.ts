// 11-18 (一局五关): the registry the later regions' foes plug into — their EDEFS entries and their AI (one RoleAI per role), each region in
// its own files (act/foes/ly_*.ts, xp_*.ts …) so the regions can be built side by side without all of them editing enemy.ts.
// No imports from enemy.ts here (enemy.ts reads this module; the regions' files import both): no import cycle at load time.
import type * as THREE from 'three';

/** the subset of enemy.ts's types a RoleAI sees (kept structural so this file needs no import from enemy.ts) */
export interface AIFoe { [k: string]: unknown }

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
  think(f: any, w: any, k: ThinkCtx): Steer;
  /** every frame before anything else (phases, timers, buffs; the boss's half-HP turn) */
  tick?(f: any, w: any, dt: number): void;
  /** every frame of the wind-up (aim tracking: set f.teleYaw / f.telePos; return true = done, skip the default tracking) */
  windup?(f: any, w: any, dt: number, p: number, yawTo: number): boolean | void;
  /** the moment the wind-up ends: true = handled here (else the default strike: lunge / area / arrows by role) */
  strike?(f: any, w: any): boolean;
  /** every frame of the strike state (after the default lunge contact check) */
  striking?(f: any, w: any, dt: number): void;
  /** how long it recovers after this attack (s) */
  recover?(f: any): number | undefined;
  /** the attack the wind-up is for can be jumped over */
  low?(f: any, shape: unknown): boolean;
  /** an incoming hit (before HP): return the damage to take (0 + glance = blocked: sparks, no blood), or undefined = as is.
   *  kind = the hero's blow ('k1'…'k5', 'rel' 箭步斩 / 一闪, 'parry' 破势's reflect, 'plunge' 劈山, 'dart', 'arrow' a batted arrow, 'school' a wall
   *  slam / blast / fire …) */
  guard?(f: any, dmg: number, from: THREE.Vector3, kind: string): number | undefined;
  /** the attack was broken off from outside (破势 caught it, 一闪 pinned it) */
  interrupted?(f: any, w: any | null): void;
  /** the clamp moved it (a wall / cover / prop in the way) by (dx, dz) */
  bumped?(f: any, w: any, dx: number, dz: number): void;
}
export const ROLE_AI: Record<string, RoleAI> = {};
