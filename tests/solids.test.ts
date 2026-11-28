import { describe, expect, it } from 'vitest';
import { SLAM, Solids, slamSpeed } from '../src/present/act/solids';

describe('floor solids', () => {
  it('assigns ids, sizes, and defaults', () => {
    const solids = new Solids();
    const circle = solids.add({ kind: 'prop', shape: 'circle', x: 0, z: 0, r: 0.7, tag: 'jar' });
    const box = solids.add({ kind: 'wall', shape: 'box', x: 2, z: 0, hx: 0.3, hz: 0.6, slam: true });
    expect(circle).toMatchObject({ id: 1, hx: 0.7, hz: 0.7, r: 0.7, on: true, slam: false, tag: 'jar' });
    expect(box).toMatchObject({ id: 2, r: 0.6, slam: true });
    solids.clear();
    expect(solids.list).toEqual([]);
    expect(solids.add({ kind: 'cover', shape: 'circle', x: 0, z: 0, r: 1 }).id).toBe(1);
  });

  it('pushes circles apart with a unit outward normal', () => {
    const solids = new Solids();
    const s = solids.add({ kind: 'prop', shape: 'circle', x: 0, z: 0, r: 1 });
    const p = { x: 1.5, z: 0 };
    expect(solids.pushOut(p, 1)).toMatchObject({ s, nx: 1, nz: 0, depth: 0.5 });
    expect(p).toEqual({ x: 2, z: 0 });
    const coincident = { x: 0, z: 0 };
    solids.pushOut(coincident, 0.5);
    expect(Math.hypot(coincident.x, coincident.z)).toBeCloseTo(1.5);
  });

  it.each([
    [{ x: 1.25, z: 0 }, { x: 1.5, z: 0 }, [1, 0]],
    [{ x: -1.25, z: 0 }, { x: -1.5, z: 0 }, [-1, 0]],
    [{ x: 0, z: 1.25 }, { x: 0, z: 1.5 }, [0, 1]],
    [{ x: 0, z: -1.25 }, { x: 0, z: -1.5 }, [0, -1]],
  ])('pushes a circle away from each box side', (start, end, normal) => {
    const solids = new Solids();
    solids.add({ kind: 'wall', shape: 'box', x: 0, z: 0, hx: 1, hz: 1 });
    const p = { ...start };
    const push = solids.pushOut(p, 0.5);
    expect(p).toEqual(end);
    expect([push?.nx, push?.nz]).toEqual(normal);
    expect(Math.hypot(push!.nx, push!.nz)).toBeCloseTo(1);
  });

  it('leaves the nearest box face when the centre is inside', () => {
    const solids = new Solids();
    solids.add({ kind: 'cover', shape: 'box', x: 0, z: 0, hx: 2, hz: 1 });
    const p = { x: 0.3, z: 0.6 };
    const push = solids.pushOut(p, 0.2);
    expect(push).toMatchObject({ nx: 0, nz: 1 });
    expect(push!.depth).toBeCloseTo(0.6);
    expect(p.z).toBeCloseTo(1.2);
    expect(solids.free(p.x, p.z, 0.2)).toBe(true);
  });

  it('settles a body wedged between boxes without invalid coordinates', () => {
    const solids = new Solids();
    solids.add({ kind: 'wall', shape: 'box', x: -1, z: 0, hx: 0.95, hz: 1 });
    solids.add({ kind: 'wall', shape: 'box', x: 1, z: 0, hx: 0.95, hz: 1 });
    const p = { x: 0, z: 0 };
    const push = solids.pushOut(p, 0.3);
    expect(push).not.toBeNull();
    expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);
  });

  it('ignores disabled solids for placement, pushing, and sweeps', () => {
    const solids = new Solids();
    const s = solids.add({ kind: 'prop', shape: 'circle', x: 0, z: 0, r: 1 });
    s.on = false;
    const p = { x: 0, z: 0 };
    expect(solids.pushOut(p, 0.5)).toBeNull();
    expect(p).toEqual({ x: 0, z: 0 });
    expect(solids.free(0, 0, 0.5)).toBe(true);
    expect(solids.sweep(-2, 0, 2, 0, 0.1)).toBeNull();
  });

  it('uses placement padding', () => {
    const solids = new Solids();
    solids.add({ kind: 'prop', shape: 'circle', x: 0, z: 0, r: 1 });
    expect(solids.free(1.7, 0, 0.5)).toBe(true);
    expect(solids.free(1.7, 0, 0.5, 0.3)).toBe(false);
  });

  it('sweeps to the first obstacle and misses an empty path', () => {
    const solids = new Solids();
    const far = solids.add({ kind: 'wall', shape: 'box', x: 4, z: 0, hx: 0.3, hz: 0.3 });
    const near = solids.add({ kind: 'prop', shape: 'circle', x: 2, z: 0, r: 0.3 });
    const hit = solids.sweep(0, 0, 5, 0, 0.1);
    expect(hit?.s).toBe(near);
    expect(hit!.t).toBeGreaterThan(0.3);
    expect(hit!.t).toBeLessThan(0.4);
    expect(hit?.s).not.toBe(far);
    expect(solids.sweep(0, 2, 5, 2, 0.1)).toBeNull();
  });

  it('reads only speed into the surface for slams', () => {
    expect(SLAM).toEqual({ minSpeed: 3.5, dmg: 8, stun: 0.5, cooldown: 0.4 });
    expect(slamSpeed(-4, 0, 1, 0)).toBe(4);
    expect(slamSpeed(4, 0, 1, 0)).toBe(0);
    expect(slamSpeed(0, 3, 1, 0)).toBe(0);
    expect(slamSpeed(2, -3, 0, 1)).toBe(3);
  });

  it('vaults cleanly over low obstacles when airborne while tall walls still block', () => {
    const solids = new Solids();
    solids.add({ kind: 'prop', shape: 'box', x: 0, z: 0, hx: 0.5, hz: 0.5, maxY: 0.72, baseY: 0 });
    solids.add({ kind: 'wall', shape: 'box', x: 3, z: 0, hx: 0.5, hz: 0.5, maxY: 3.1, baseY: 0 });
    solids.add({ kind: 'prop', shape: 'circle', x: 0, z: 3, r: 0.5, maxY: 0.72, baseY: 1.12 });

    // Grounded (footY = 0) collides with low crate
    const gPos = { x: 0.6, z: 0 };
    expect(solids.pushOut(gPos, 0.38, 0)).not.toBeNull();
    expect(solids.free(0, 0, 0.38, 0, 0)).toBe(false);
    expect(solids.sweep(-1.5, 0, 1.5, 0, 0.3, 0)).not.toBeNull();

    // Jumping (footY = 0.82) vaults right over low crate, but still hits tall wall at x=3
    const airPos = { x: 0.2, z: 0 };
    expect(solids.pushOut(airPos, 0.38, 0.82)).toBeNull();
    expect(solids.free(0, 0, 0.38, 0, 0.82)).toBe(true);
    expect(solids.sweep(-1.5, 0, 1.5, 0, 0.3, 0.82)).toBeNull();
    expect(solids.sweep(1.5, 0, 4.5, 0, 0.3, 0.82)).not.toBeNull();

    // Platform prop at baseY = 1.12 blocks at platform footY = 1.12, vaults when jumping from platform (footY = 1.92)
    expect(solids.free(0, 3, 0.38, 0, 1.12)).toBe(false);
    expect(solids.free(0, 3, 0.38, 0, 1.92)).toBe(true);
  });

  it('supports jumping onto steppable small platforms/crates and auto-stepping low curbs', () => {
    const solids = new Solids();
    solids.add({ kind: 'cover', shape: 'box', x: 0, z: 0, hx: 0.55, hz: 0.55, maxY: 0.76, baseY: 0, steppable: true });
    solids.add({ kind: 'prop', shape: 'box', x: 3, z: 0, hx: 0.8, hz: 0.5, maxY: 0.28, baseY: 0, steppable: true });

    // Walking on ground (footY = 0, stepUp = 0.38) blocks against 0.76m plinth side, but steps smoothly onto 0.28m low curb!
    expect(solids.free(0, 0, 0.38, 0, 0, 0.38)).toBe(false);
    expect(solids.topAt(0, 0, 0.16, 0.38)).toBeNull();
    expect(solids.free(3, 0, 0.38, 0, 0, 0.38)).toBe(true);
    expect(solids.topAt(3, 0, 0.16, 0.38)).toBeCloseTo(0.28);

    // Jumping onto 0.76m plinth (curY >= 0.76) stands solidly atop it without pushOut ejecting the hero!
    expect(solids.topAt(0.1, -0.1, 0.16, 0.95)).toBeCloseTo(0.76);
    const atop = { x: 0.1, z: -0.1 };
    expect(solids.pushOut(atop, 0.38, 0.76, 0.38)).toBeNull();
    expect(atop).toEqual({ x: 0.1, z: -0.1 });
  });
});
