// Comparison switches read from the URL (browser) or launch query (mini-games): every presentation upgrade sits behind one,
// so the user can flip between old and new in the same build (CLAUDE.md rule 3). Add new switches to FLAG_DEFS only.

export const FLAG_DEFS = {
  /** Art direction pack. */
  look: { values: ['A', 'B', 'C'], def: 'A' },
  /** Camera: the new director, or v6 r2's fixed battle rig for comparison. */
  cam: { values: ['director', 'v6'], def: 'director' },
  /** Debug overlay (fps, draw calls). */
  debug: { values: ['0', '1'], def: '0' },
  /** What to show: the battle, or a character turntable (actors) */
  view: { values: ['battle', 'actors'], def: 'battle' },
} as const;

export type FlagName = keyof typeof FLAG_DEFS;
export type Flags = { [K in FlagName]: (typeof FLAG_DEFS)[K]['values'][number] } & { seed: number | null };

/** Parse flags with a lookup function (platform.query). Unknown values fall back to the default. */
export function readFlags(query: (k: string) => string | null): Flags {
  const out: Record<string, unknown> = {};
  for (const [k, d] of Object.entries(FLAG_DEFS)) {
    const v = query(k);
    out[k] = v != null && (d.values as readonly string[]).includes(v) ? v : d.def;
  }
  const s = query('seed');
  out.seed = s != null && /^\d+$/.test(s) ? Number(s) : null;
  return out as Flags;
}
