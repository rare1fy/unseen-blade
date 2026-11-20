import { afterEach, describe, expect, it, vi } from 'vitest';
import { bank, buy, buyMirror, canBuy, canBuyMirror, flipMirror, hasAffordable, hasMirrorAffordable, level, META, MIRROR, mirrorNextCost, mirrorState, nextCost, runMods, runReward } from '../src/present/act/meta';
import { fresh } from '../src/present/act/profile';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('hideout upgrades', () => {
  it('lists the forge and medic upgrades in order with short descriptions', () => {
    expect(META.map(x => x.id)).toEqual(['blade', 'darts', 'reroll', 'manual', 'vigor', 'ear', 'intent', 'leech', 'breath']);
    expect(META.every(x => x.desc.every(line => [...line].length <= 14))).toBe(true);
  });

  it('deducts the matching currency and increases each purchased level', () => {
    const p = fresh(); p.iron = 32; p.herb = 10;
    expect(level(p, 'blade')).toBe(0);
    expect(nextCost(p, 'blade')).toBe(10);
    expect(canBuy(p, 'blade')).toBe(true);
    expect(hasAffordable(p, 'forge')).toBe(true);
    expect(buy(p, 'blade')).toBe(true);
    expect(p.iron).toBe(22);
    expect(level(p, 'blade')).toBe(1);
    expect(nextCost(p, 'blade')).toBe(22);
    expect(buy(p, 'blade')).toBe(true);
    expect(p.iron).toBe(0);
    expect(buy(p, 'vigor')).toBe(true);
    expect(p.herb).toBe(0);
    expect(level(p, 'vigor')).toBe(1);
    expect(p.perks).toEqual({ blade: 2, vigor: 1 });
  });

  it('refuses overspending, maxed upgrades, and unknown ids without mutating the profile', () => {
    const p = fresh(); p.iron = 9; p.herb = 100;
    expect(canBuy(p, 'blade')).toBe(false);
    expect(buy(p, 'blade')).toBe(false);
    expect(nextCost(p, 'missing')).toBeNull();
    expect(buy(p, 'missing')).toBe(false);
    expect(p.iron).toBe(9);
    expect(p.herb).toBe(100);
    expect(p.perks).toEqual({});

    p.iron = 35;
    expect(buy(p, 'manual')).toBe(true);
    expect(nextCost(p, 'manual')).toBeNull();
    expect(canBuy(p, 'manual')).toBe(false);
    expect(buy(p, 'manual')).toBe(false);
    expect(p.iron).toBe(0);
    expect(p.perks).toEqual({ manual: 1 });
  });

  it('supports Hades-style dual-aspect 碑铭潜能 (upgrade + free Yang/Yin flip)', () => {
    const p = fresh(); p.iron = 26; p.herb = 8;
    expect(MIRROR).toHaveLength(4);
    expect(hasMirrorAffordable(p)).toBe(true);
    expect(mirrorNextCost(p, 'edge')).toBe(8);
    expect(canBuyMirror(p, 'edge')).toBe(true);
    expect(buyMirror(p, 'edge')).toBe(true);
    expect(p.iron).toBe(18);
    expect(mirrorState(p, 'edge')).toEqual({ lv: 1, side: 0 });
    expect(runMods(p).firstStrikeBonus).toBeCloseTo(0.25, 5);
    expect(runMods(p).styleBonus).toBe(0);
    // free flip to Yin side shares the upgraded rank immediately
    expect(flipMirror(p, 'edge')).toBe(1);
    expect(p.iron).toBe(18);
    expect(runMods(p).firstStrikeBonus).toBe(0);
    expect(runMods(p).styleBonus).toBeCloseTo(0.10, 5);
    // upgrade Lv2 while on Yin side
    expect(buyMirror(p, 'edge')).toBe(true);
    expect(p.iron).toBe(0);
    expect(runMods(p).styleBonus).toBeCloseTo(0.18, 5);
  });

  it('turns a mixed set of purchases into run modifiers', () => {
    const p = fresh();
    expect(runMods(p)).toMatchObject({ dmgMul: 1, critBonus: 0, dartBonus: 0, rerolls: 1, hpBonus: 0, deathDefy: 0, startIntent: 0, windupMul: 1, startManual: false, poiseHeal: 0 });
    p.perks = { blade: 2, darts: 1, reroll: 2, manual: 1, vigor: 3, breath: 1, intent: 1, leech: 2, ear: 2 };
    expect(runMods(p)).toMatchObject({ dmgMul: 1.24, critBonus: 0.08, dartBonus: 1, rerolls: 3, hpBonus: 60, deathDefy: 1, startIntent: 1, windupMul: 1.2, startManual: true, poiseHeal: 10 });
  });
});

describe('run rewards', () => {
  it('calculates death and win rewards so even an early failed run affords upgrades', () => {
    const p = fresh(); p.iron = 0; p.herb = 0;
    const earlyFail = { rooms: 1, elites: 0, boss: false, won: false, kills: 9 };
    const r0 = runReward(earlyFail);
    expect(r0.iron).toBeGreaterThanOrEqual(10);
    expect(r0.herb).toBeGreaterThanOrEqual(10);

    const death = { rooms: 4, elites: 2, boss: false, won: false, kills: 19 };
    const win = { rooms: 6, elites: 1, boss: true, won: true, kills: 20 };
    expect(runReward(death)).toEqual({ iron: 42, herb: 38 });
    expect(bank(p, death)).toEqual({ iron: 42, herb: 38 });
    expect(p).toMatchObject({ iron: 42, herb: 38, runs: 1, wins: 0, deaths: 1 });
    expect(runReward(win)).toEqual({ iron: 89, herb: 68 });
    expect(bank(p, win)).toEqual({ iron: 89, herb: 68 });
    expect(p).toMatchObject({ iron: 131, herb: 106, runs: 2, wins: 1, deaths: 1 });
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
