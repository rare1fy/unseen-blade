// Game time: one place that owns the frame clock and the "feel" levers every staged beat uses — hitstop (time nearly frozen on
// impact, measured in REAL time so it always lasts as long as asked), slow motion, screen-shake trauma, and a global speed for
// replays / fast-forward. Port of the prototype kit's FX / anim / after / wait (kit_dh6.js), typed and engine-independent.

export const FX = {
  /** 0..1, decays at TRAUMA_DECAY per real second; camera offset ∝ trauma². */
  trauma: 0,
  /** Real seconds of hitstop left; while > 0 game time runs at HITSTOP_SCALE. */
  hitstop: 0,
  /** Real seconds of slow motion left, at slowmoScale. */
  slowmo: 0,
  slowmoScale: 1,
  /** Current game-time multiplier (derived each frame). */
  timeScale: 1,
  /** Global speed (bot fast-forward, debug, the battle-speed setting). */
  speed: 1,
  /** screen-shake multiplier (settings: off / weak / normal) */
  shakeScale: 1,
  /** 11-19 the tutorial's freeze: a ceiling on timeScale that the tutorial eases toward ~0 and holds there until the right key is
   *  pressed (unlike hitstop it never runs out by itself); 1 = off */
  hold: 1,
};
/** the pause menu: while on, the frame loop hands every game updater a zero step (the world stands still); real-time UI keeps going */
export const PAUSE = { on: false, /** the pause / settings menu is up (paused, or over the start screen): the screens under it ignore input */ menu: false,
  /** 11-19: paused, but effects (particles, blocks) run on real time — the 已得 page's ghost demonstration plays in the stopped world */ fx: false,
  /** this frame's real step (for the effects that run while paused) */ rdt: 0 };
export const HITSTOP_SCALE = 0.04;
export const TRAUMA_DECAY = 2.2;

export const shake = (a: number) => { FX.trauma = Math.min(1, FX.trauma + a * FX.shakeScale); };
export const hitstop = (s: number) => { FX.hitstop = Math.max(FX.hitstop, s); };
export const slowmo = (s: number, scale = 0.35) => { FX.slowmo = Math.max(FX.slowmo, s); FX.slowmoScale = scale; };

// ---- game-time tasks
interface Anim { t: number; life: number; fn: (k: number) => void; done?: () => void; dead: boolean; real: boolean }
const anims: Anim[] = [];
const timers: Array<{ t: number; fn: () => void; real: boolean }> = [];

/** Run fn(k) with k going 0 → 1 over `life` game seconds, then done(). Returns a handle (set .dead = true to cancel). */
export function anim(life: number, fn: (k: number) => void, done?: () => void, o: { real?: boolean } = {}): Anim {
  const a: Anim = { t: 0, life: Math.max(1e-6, life), fn, done, dead: false, real: !!o.real }; anims.push(a); return a;
}
/** Promise form of anim(). */
export const animP = (life: number, fn: (k: number) => void, o: { real?: boolean } = {}) => new Promise<void>(res => anim(life, fn, res, o));
export function after(t: number, fn: () => void, o: { real?: boolean } = {}) { timers.push({ t, fn, real: !!o.real }); }
/** Wait `s` game seconds (stretches under hitstop / slow motion; scales with FX.speed). */
export const wait = (s: number) => new Promise<void>(r => after(s, r));
/** Wait `s` real seconds (UI beats that must not stretch). */
export const waitReal = (s: number) => new Promise<void>(r => after(s, r, { real: true }));

export const clock = { time: 0, rtime: 0, dt: 0, rdt: 0, frame: 0 };

/** Advance one frame. rdt = real seconds since last frame (already capped by the caller). Returns game dt. */
export function tick(rdt: number): number {
  if (FX.hitstop > 0) { FX.hitstop -= rdt; FX.timeScale = HITSTOP_SCALE; }
  else if (FX.slowmo > 0) { FX.slowmo -= rdt; FX.timeScale = FX.slowmoScale; }
  else FX.timeScale = 1;
  if (FX.hold < 1) FX.timeScale = Math.min(FX.timeScale, FX.hold);
  const dt = rdt * FX.timeScale * FX.speed, rd = rdt * FX.speed;
  clock.time += dt; clock.rtime += rd; clock.dt = dt; clock.rdt = rd; clock.frame++;
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i]; if (a.dead) { anims.splice(i, 1); continue; }
    a.t += a.real ? rd : dt; const k = Math.min(1, a.t / a.life); a.fn(k);
    if (k >= 1) { anims.splice(i, 1); a.done?.(); }
  }
  for (let i = timers.length - 1; i >= 0; i--) {
    const tm = timers[i]; tm.t -= tm.real ? rd : dt;
    if (tm.t <= 0) { timers.splice(i, 1); tm.fn(); }
  }
  FX.trauma = Math.max(0, FX.trauma - rdt * TRAUMA_DECAY);
  return dt;
}

/** Number of pending tasks (QA: the stage is idle when this reaches 0). */
export const pending = () => anims.length + timers.length;

// ---- easing
export const ease = {
  outBack: (k: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  outCubic: (k: number) => 1 - Math.pow(1 - k, 3),
  inCubic: (k: number) => k * k * k,
  inOut: (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  outElastic: (k: number) => (k === 0 || k === 1 ? k : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  outQuart: (k: number) => 1 - Math.pow(1 - k, 4),
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
