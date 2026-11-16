// The cut button: a tap is decided at the release (held < TUNE.holdToCharge), a hold is not a tap (it is the 居合 stance) — act-12.
// The ground warnings: who stands inside a 劈 / 扑 / 砸 / 箭 shape (the 见切 check and the hits use it).
import { describe, it, expect } from 'vitest';
import { Input } from '../src/present/act/input';
import { TUNE } from '../src/present/act/tune';
import { inside } from '../src/present/act/tele';

/** every source file's text, keyed 'src/…' (vite's glob: no node types needed) */
const SRC = Object.fromEntries(Object.entries(import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>).map(([k, v]) => [k.slice(3), v]));   // '../src/…' → 'src/…'
/** a relative import resolved: 'src/a/b.ts' + '../c/d' → 'src/a/c/d' */
const join = (from: string, spec: string) => { const parts = from.split('/').slice(0, -1); for (const s of spec.split('/')) { if (s === '..') parts.pop(); else if (s !== '.') parts.push(s); } return parts.join('/'); };

const run = (inp: Input, s: number, dt = 1 / 60) => { const out: Array<{ pressed: boolean; released: boolean; last: number }> = []; for (let t = 0; t < s; t += dt) { inp.frame(dt); const b = inp.b.attack; out.push({ pressed: b.pressed, released: b.released, last: b.last }); } return out; };

describe('the cut button', () => {
  it('a short press is released with its length (a tap)', () => {
    const inp = new Input(); inp.hold('attack', 0.08);
    const f = run(inp, 0.3), rel = f.find(x => x.released)!;
    expect(f.filter(x => x.pressed).length).toBe(1);
    expect(rel.last).toBeLessThan(TUNE.holdToCharge);
    expect(rel.last).toBeGreaterThan(0.05);
  });
  it('a long press is released held past the stance threshold (no tap)', () => {
    const inp = new Input(); inp.hold('attack', 0.6);
    const rel = run(inp, 1).find(x => x.released)!;
    expect(rel.last).toBeGreaterThanOrEqual(TUNE.holdToCharge);
  });
});

describe('ground warnings', () => {
  it('a cone in front catches what is in front, not behind', () => {
    const cone = { k: 'cone', r: 2.5, half: 0.6 } as const;
    expect(inside(cone, 0, 0, 0, 0, 2, 0.3)).toBe(true);
    expect(inside(cone, 0, 0, 0, 0, -2, 0.3)).toBe(false);
    expect(inside(cone, 0, 0, 0, 0, 3.2, 0.3)).toBe(false);
  });
  it('a lunge strip and a slam circle', () => {
    expect(inside({ k: 'rect', len: 4, w: 1 }, 0, 0, Math.PI / 2, 3, 0.2, 0.3)).toBe(true);
    expect(inside({ k: 'rect', len: 4, w: 1 }, 0, 0, Math.PI / 2, 3, 1.5, 0.3)).toBe(false);
    expect(inside({ k: 'circle', r: 1.5, ahead: 1 }, 0, 0, 0, 0, 2.2, 0.3)).toBe(true);
  });
});

// the foe models live in other modules that register themselves into the bestiary ROSTER on import; the slim entry once forgot
// one of those imports and every room threw "no model jp_bandit" (the models need a 2D canvas, so this checks the imports statically)
describe('models', () => {
  it('every foe model is defined in a module the game imports', () => {
    const read = (f: string) => SRC[f];
    const enemy = read('src/present/act/enemy.ts'), ids = [...enemy.matchAll(/model: '([a-z_]+)'/g)].map(m => m[1]);
    const files = Object.keys(SRC);
    // some module imports `f` (relative specifiers resolved against the importing file)
    // (comments and type-only imports don't run the module, so they don't count)
    const code = (g: string) => read(g).replace(/^\s*\/\/.*$/gm, '').replace(/^import type .*$/gm, '');
    const imported = (f: string) => files.some(g => g !== f && [...code(g).matchAll(/(?:from |import )'(\.[^']+)'/g)].some(m => join(g, m[1]) + '.ts' === f));
    expect(ids.length).toBeGreaterThanOrEqual(5);
    for (const id of ids) {
      const home = files.find(f => { const s = read(f); return s.includes(`id: '${id}'`) && s.includes('ROSTER'); });   // the module that registers it
      expect(home, id).toBeTruthy();
      expect(imported(home!), `${id} (${home}) is imported somewhere`).toBe(true);
    }
  });
});
