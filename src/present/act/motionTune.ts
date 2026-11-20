/** Live runtime multipliers for animation review & tuning (?anim studio panel).
 *  Every default is 1.0 so production & unit tests match the calibrated baseline identically. */
export interface MotionTune {
  waveLead: number;
  shudder: number;
  overshoot: number;
  gazeLock: number;
  idleBreath: number;
  sprintBurst: number;
  ribbonSpring: number;
  hurtWhip: number;
  arcOut: number;
}

export const MOTION_TUNE_DEFAULTS: Readonly<MotionTune> = {
  waveLead: 1,
  shudder: 1,
  overshoot: 1,
  gazeLock: 1,
  idleBreath: 1,
  sprintBurst: 1,
  ribbonSpring: 1,
  hurtWhip: 1,
  arcOut: 1,
};

export const MOTION_TUNE: MotionTune = { ...MOTION_TUNE_DEFAULTS };

export function resetMotionTune(): void {
  Object.assign(MOTION_TUNE, MOTION_TUNE_DEFAULTS);
}
