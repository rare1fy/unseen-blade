// Pure chill rule: usable by combat and tests without loading three.js or a renderer.
import { BOONS, boonTier } from './boons';

export interface ChillState { chill: number; frozen: number }
export const CHILL_THRESHOLDS = [4, 3, 3] as const;
const DURATIONS = BOONS.find(b => b.id === 'jd_chill')!.vals!;

/** Other frost boons work on their own, using ordinary chill until 霜刃 is acquired. */
export function addChill(state: ChillState, stacks: number, tier = 0): ChillState {
  const t = boonTier(tier), chill = state.chill + Math.max(0, Math.floor(stacks));
  return chill >= CHILL_THRESHOLDS[t]
    ? { chill: 0, frozen: Math.max(state.frozen, DURATIONS[t]) }
    : { chill, frozen: state.frozen };
}
