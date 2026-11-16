// The cut button: a tap is decided at the release (held < TUNE.holdToCharge), a hold is not a tap (it is the 居合 stance) — act-12.
// The ground warnings: who stands inside a 劈 / 扑 / 砸 / 箭 shape (the 见切 check and the hits use it).
import { describe, it, expect } from 'vitest';
import { Input } from '../src/present/act/input';
import { TUNE } from '../src/present/act/tune';
import { inside } from '../src/present/act/tele';

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
