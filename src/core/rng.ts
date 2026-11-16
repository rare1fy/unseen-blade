// Seeded RNG (mulberry32). The rules layer never calls Math.random: every battle is reproducible from its seed,
// which is what makes the bot, the regression tests and "jump to battle state" in __dh deterministic.

export interface Rng {
  /** float in [0, 1) */
  next(): number;
  /** integer in [lo, hi] */
  int(lo: number, hi: number): number;
  pick<T>(a: readonly T[]): T;
  shuffle<T>(a: readonly T[]): T[];
  /** current internal state, to snapshot / restore a battle */
  state(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r: Rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    shuffle: arr => { const o = arr.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; },
    state: () => a >>> 0,
  };
  return r;
}
