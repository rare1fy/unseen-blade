// One hero of the 京都篇 showcase: its model (ModelDef, built with bestiary/kit.ts on the shared 7 cm block) plus optional FX hooks.
// Poses: register POSE_HOOKS[def.id] (bestiary/poseHooks.ts) in the hero's own file to own idle + attack / cast / hurt / roar.
import type { ModelDef } from '../bestiary/models';
import type { BActor } from '../bestiary/bactor';

export interface KyotoHero {
  def: ModelDef;
  /** called at the attack's impact frame (Action.impact): draw the blow / muzzle flash / projectile and the hit on `to`.
   *  from.weapon() is the weapon tip (ModelDef.tip cells along the weapon joint's +z). Call to.hurt(power) yourself. */
  strike?(from: BActor, to: BActor): void;
  /** called when the skill (cast action) starts: its charge, release and any FX; `to` = the nearest other hero, if any */
  skill?(self: BActor, to: BActor | null): void;
}
