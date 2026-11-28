import { describe, expect, it } from 'vitest';
import { BTUNE, BreakLogic, type BTarget } from '../src/present/act/breakLogic';

const foe = (id: string, x: number, z: number, r = 0.2): BTarget => ({ id, x, z, r, hero: false });
const hero = (x: number, z: number): BTarget => ({ id: 'hero', x, z, r: 0.2, hero: true });
const blow = { src: 'hero' as const, dir: [1, 0] as [number, number] };

describe('breakable props', () => {
  it('breaks a pot in one blow and hay in two, and excludes gone props from near', () => {
    const logic = new BreakLogic(() => 0.9);
    const pot = logic.add('pot', 0, 0), hay = logic.add('hay', 2, 0);
    expect([pot.id, hay.id]).toEqual([1, 2]);
    expect(logic.near(0, 0, 0)).toEqual([pot]);
    expect(logic.hit(pot, blow).events).toEqual([{ k: 'break', p: pot, dir: [1, 0], drop: null }]);
    expect(pot.state).toBe('gone');
    expect(logic.near(0, 0, 1)).toEqual([]);
    expect(logic.hit(hay, blow).events).toEqual([{ k: 'hit', p: hay, dir: [1, 0] }]);
    expect(hay.hp).toBe(1);
    expect(logic.hit(hay, blow).events[0].k).toBe('break');
    expect(hay.state).toBe('gone');
    expect(logic.hit(hay, blow).events).toEqual([]);
  });

  it('uses the injected draws for coin odds, coin counts, and hay healing', () => {
    const rolls = [0.2, 0.5, 0.8, 0.1];
    const logic = new BreakLogic(() => rolls.shift()!);
    const pot = logic.add('pot', 0, 0), empty = logic.add('pot', 2, 0), hay = logic.add('hay', 4, 0);
    expect(logic.hit(pot, blow).events[0]).toMatchObject({ k: 'break', drop: { kind: 'coins', n: 4 } });
    expect(logic.hit(empty, blow).events[0]).toMatchObject({ k: 'break', drop: null });
    expect(logic.hit(hay, { src: 'fire', dir: [0, 0] }).events[0]).toMatchObject({ k: 'break', dir: [0, -1], drop: { kind: 'heal', n: 5 } });
  });

  it('lights oil, then damages only targets in its blast radius', () => {
    const logic = new BreakLogic();
    const oil = logic.add('oil', 0, 0);
    const targets = [foe('inside', 2.6, 0), hero(0, 1), foe('outside', 3, 0)];
    expect(logic.hit(oil, blow).events).toEqual([{ k: 'fuse', p: oil }]);
    expect(oil.fuse).toBe(BTUNE.fuse);
    expect(logic.hit(oil, blow).events).toEqual([]);
    expect(logic.update(0.5, targets)).toEqual({ events: [], damage: [] });
    const result = logic.update(0.6, targets);
    expect(result.events.map(e => e.k)).toEqual(['boom', 'fire']);
    expect(result.damage).toMatchObject([
      { target: targets[0], dmg: 30, fromX: 0, fromZ: 0, knock: 2, down: 0, cause: 'boom' },
      { target: targets[1], dmg: 12, fromX: 0, fromZ: 0, knock: 2, down: 0, cause: 'boom' },
    ]);
    expect(oil.state).toBe('gone');
    expect(logic.near(0, 0, 0)).toEqual([]);
  });

  it('blasts ordinary props and lights nearby oil for a later update', () => {
    const logic = new BreakLogic(() => 0.9);
    const first = logic.add('oil', 0, 0), pot = logic.add('pot', 1, 0), hay = logic.add('hay', -1, 0);
    const second = logic.add('oil', 2, 0);
    logic.hit(first, blow);
    const result = logic.update(1, []);
    expect(result.events.map(e => e.k)).toEqual(['boom', 'break', 'break', 'fuse', 'fire']);
    expect(pot.state).toBe('gone');
    expect(hay.state).toBe('gone');
    expect(second.state).toBe('fuse');
    expect(second.fuse).toBe(BTUNE.chainFuse);
    expect(logic.update(0.2, []).events).toEqual([]);
    expect(logic.update(0.05, []).events.map(e => e.k)).toContain('boom');
    expect(second.state).toBe('gone');
    expect(logic.update(0.1, []).events.some(e => e.k === 'boom')).toBe(false);
  });

  it('ticks fire at fixed intervals, then ends it after three seconds', () => {
    const logic = new BreakLogic();
    const oil = logic.add('oil', 0, 0), target = foe('burning', 1, 0), outside = hero(3, 0);
    logic.hit(oil, blow);
    logic.update(1, []);
    expect(logic.update(0.49, [target, outside]).damage).toEqual([]);
    expect(logic.update(0.01, [target, outside]).damage).toMatchObject([{ target, dmg: 3, knock: 0, down: 0, cause: 'fire' }]);
    expect(logic.update(1, [target, outside]).damage).toHaveLength(2);
    const end = logic.update(1.5, [target, outside]);
    expect(end.damage).toHaveLength(3);
    expect(end.events.map(e => e.k)).toEqual(['fireEnd']);
    expect(logic.fires).toEqual([]);
    expect(logic.update(1, [target]).damage).toEqual([]);
  });

  it('lights an idle oil jar within a fire patch', () => {
    const logic = new BreakLogic();
    const first = logic.add('oil', 0, 0);
    logic.hit(first, blow);
    logic.update(1, []);
    const second = logic.add('oil', 1.5, 0);
    const result = logic.update(0.1, []);
    expect(result.events).toEqual([{ k: 'fuse', p: second }]);
    expect(second.fuse).toBe(BTUNE.fuse);
  });

  it('topples a pillar on the third light hit and only hurts targets in its strip', () => {
    const logic = new BreakLogic();
    const pillar = logic.add('pillar', 0, 0);
    const targets = [foe('strip', 3, 0.65), hero(2, 0), foe('outside', 3, 1.2), foe('behind', -1, 0)];
    expect(logic.hit(pillar, { src: 'hero', dir: [4, 0] }).events[0].k).toBe('hit');
    expect(logic.hit(pillar, blow).events[0].k).toBe('hit');
    const result = logic.hit(pillar, { src: 'hero', dir: [3, 0] }, targets);
    expect(result.events[0]).toMatchObject({ k: 'topple', p: pillar, dir: [1, 0], ax: 0, az: 0, bx: 4, bz: 0, w: 1.2 });
    expect(result.damage).toMatchObject([
      { target: targets[0], dmg: 40, down: 1.2, cause: 'topple' },
      { target: targets[1], dmg: 10, down: 0, cause: 'topple' },
    ]);
    expect(pillar).toMatchObject({ state: 'fallen', hp: 0, fallDir: [1, 0] });
    expect(logic.hit(pillar, blow)).toEqual({ events: [], damage: [] });
    expect(logic.near(0.35, 0, 0.1)).toEqual([pillar]);
    expect(logic.near(0.45, 0, 0.1)).toEqual([]);
  });

  it('counts heavy and blast blows as two on a pillar; fire has no effect', () => {
    const logic = new BreakLogic();
    const pillar = logic.add('pillar', 0, 0), blasted = logic.add('pillar', 10, 0);
    expect(logic.hit(pillar, { src: 'fire', dir: [1, 0] }).events).toEqual([]);
    expect(pillar.hp).toBe(3);
    expect(logic.hit(pillar, { ...blow, heavy: true }).events[0].k).toBe('hit');
    expect(pillar.hp).toBe(1);
    expect(logic.hit(pillar, blow).events[0].k).toBe('topple');
    expect(logic.hit(blasted, { src: 'blast', dir: [0, 1] }).events[0].k).toBe('hit');
    expect(blasted.hp).toBe(1);
  });

  it('lights an oil jar and breaks a crate in the topple strip', () => {
    const logic = new BreakLogic();
    const pillar = logic.add('pillar', 0, 0), oil = logic.add('oil', 2, 0.4), crate = logic.add('crate', 3, 0);
    logic.hit(pillar, { ...blow, heavy: true });
    const result = logic.hit(pillar, blow);
    expect(result.events.map(e => e.k)).toEqual(['topple', 'fuse', 'break']);
    expect(oil.state).toBe('fuse');
    expect(oil.fuse).toBe(BTUNE.chainFuse);
    expect(crate.state).toBe('gone');
  });

  it('bowls an oil jar across the lane on a heavy/kick blow and detonates on barricade impact', () => {
    const logic = new BreakLogic();
    const oil = logic.add('oil', 6, 0);
    expect(logic.hit(oil, { src: 'hero', heavy: true, slide: true, dir: [-1, 0] }).events).toEqual([{ k: 'fuse', p: oil }]);
    expect(oil.vx).toBeLessThan(-9);
    // Slide westward until striking a barricade at x = 1.5
    let boomed = false;
    for (let i = 0; i < 20 && !boomed; i++) {
      const r = logic.update(0.05, [], (nx) => nx <= 1.5);
      if (r.events.some(e => e.k === 'boom')) boomed = true;
    }
    expect(boomed).toBe(true);
    expect(oil.x).toBeLessThanOrEqual(2.2);
    expect(oil.state).toBe('gone');

    // Remote dart hit ignites in place without sliding
    const farOil = logic.add('oil', -4, 0);
    logic.hit(farOil, { src: 'dart', dir: [-1, 0] });
    expect(farOil.state).toBe('fuse');
    expect(farOil.vx ?? 0).toBe(0);
    expect(farOil.fuse).toBeLessThanOrEqual(0.45);
  });
});
