import { afterEach, describe, expect, it, vi } from 'vitest';
import { bank, buy, canBuy, level, META, nextCost, runMods, runReward } from '../src/present/act/meta';
import { fresh } from '../src/present/act/profile';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('hideout upgrades', () => {
  it('lists the forge and medic upgrades in order with short descriptions', () => {
    expect(META.map(x => x.id)).toEqual(['blade', 'darts', 'manual', 'vigor', 'breath', 'intent', 'ear']);
    expect(META.every(x => x.desc.every(line => [...line].length <= 12))).toBe(true);
  });

  it('deducts the matching currency and increases each purchased level', () => {
    const p = fresh(); p.iron = 60; p.herb = 15;
    expect(level(p, 'blade')).toBe(0);
    expect(nextCost(p, 'blade')).toBe(20);
    expect(canBuy(p, 'blade')).toBe(true);
    expect(buy(p, 'blade')).toBe(true);
    expect(p.iron).toBe(40);
    expect(level(p, 'blade')).toBe(1);
    expect(nextCost(p, 'blade')).toBe(40);
    expect(buy(p, 'blade')).toBe(true);
    expect(p.iron).toBe(0);
    expect(buy(p, 'vigor')).toBe(true);
    expect(p.herb).toBe(0);
    expect(level(p, 'vigor')).toBe(1);
    expect(p.perks).toEqual({ blade: 2, vigor: 1 });
  });

  it('refuses overspending, maxed upgrades, and unknown ids without mutating the profile', () => {
    const p = fresh(); p.iron = 19; p.herb = 100;
    expect(canBuy(p, 'blade')).toBe(false);
    expect(buy(p, 'blade')).toBe(false);
    expect(nextCost(p, 'missing')).toBeNull();
    expect(buy(p, 'missing')).toBe(false);
    expect(p.iron).toBe(19);
    expect(p.herb).toBe(100);
    expect(p.perks).toEqual({});

    p.iron = 80;
    expect(buy(p, 'manual')).toBe(true);
    expect(nextCost(p, 'manual')).toBeNull();
    expect(canBuy(p, 'manual')).toBe(false);
    expect(buy(p, 'manual')).toBe(false);
    expect(p.iron).toBe(0);
    expect(p.perks).toEqual({ manual: 1 });
  });

  it('turns a mixed set of purchases into run modifiers', () => {
    const p = fresh();
    expect(runMods(p)).toEqual({ dmgMul: 1, dartBonus: 0, hpBonus: 0, deathDefy: 0, startIntent: 0, windupMul: 1, startManual: false });
    p.perks = { blade: 2, darts: 1, manual: 1, vigor: 3, breath: 1, intent: 1, ear: 2 };
    expect(runMods(p)).toEqual({ dmgMul: 1.2, dartBonus: 1, hpBonus: 45, deathDefy: 1, startIntent: 1, windupMul: 1.2, startManual: true });
  });
});

describe('run rewards', () => {
  it('calculates death and win rewards and banks both with the correct counters', () => {
    const p = fresh(); p.iron = 5; p.herb = 7;
    const death = { rooms: 4, elites: 2, boss: false, won: false, kills: 19 };
    const win = { rooms: 6, elites: 1, boss: true, won: true, kills: 20 };
    expect(runReward(death)).toEqual({ iron: 10, herb: 9 });
    expect(bank(p, death)).toEqual({ iron: 10, herb: 9 });
    expect(p).toMatchObject({ iron: 15, herb: 16, runs: 1, wins: 0, deaths: 1 });
    expect(runReward(win)).toEqual({ iron: 34, herb: 29 });
    expect(bank(p, win)).toEqual({ iron: 34, herb: 29 });
    expect(p).toMatchObject({ iron: 49, herb: 45, runs: 2, wins: 1, deaths: 1 });
  });
});

it('loads legacy scraps as iron and keeps the other saved progress', async () => {
  const old = { v: 1, runs: 3, wins: 1, deaths: 2, scraps: 42, perks: { blade: 1 }, seen: { intro: 1 }, bonds: { medic: 2 }, at: 123 };
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'ub.profile' ? JSON.stringify(old) : null });
  vi.resetModules();
  const { profile } = await import('../src/present/act/profile');
  const p = profile();
  expect(p).toMatchObject({ iron: 42, herb: 0, runs: 3, wins: 1, deaths: 2, perks: { blade: 1 }, seen: { intro: 1 }, bonds: { medic: 2 }, at: 123 });
  expect('scraps' in p).toBe(false);
});
