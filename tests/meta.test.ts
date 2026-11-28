import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ARCANA, arcanaCap, arcanaUsed, bank, buy, buyMirror, canBuy, canBuyMirror,
  ensureArcana, expandArcanaCap, flipMirror, hasAffordable, hasMirrorAffordable,
  isArcanaActive, level, META, MIRROR, mirrorNextCost, mirrorState, nextCost,
  runMods, runReward, toggleArcana, unlockArcana, upgradeArcana,
} from '../src/present/act/meta';
import { fresh } from '../src/present/act/profile';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('hideout upgrades', () => {
  it('lists the forge and medic upgrades in order with short descriptions', () => {
    expect(META.map(x => x.id)).toEqual(['blade', 'darts', 'manual', 'vigor', 'ear', 'intent', 'leech', 'breath']);
    expect(META.every(x => x.desc.every(line => [...line].length <= 14))).toBe(true);
  });

  it('deducts the matching currency and increases each purchased level', () => {
    const p = fresh(); p.iron = 65; p.herb = 10;
    expect(level(p, 'blade')).toBe(0);
    expect(nextCost(p, 'blade')).toBe(20);
    expect(canBuy(p, 'blade')).toBe(true);
    expect(hasAffordable(p, 'forge')).toBe(true);
    expect(buy(p, 'blade')).toBe(true);
    expect(p.iron).toBe(45);
    expect(level(p, 'blade')).toBe(1);
    expect(nextCost(p, 'blade')).toBe(45);
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

    p.iron = 75;
    expect(buy(p, 'manual')).toBe(true);
    expect(nextCost(p, 'manual')).toBeNull();
    expect(canBuy(p, 'manual')).toBe(false);
    expect(buy(p, 'manual')).toBe(false);
    expect(p.iron).toBe(0);
    expect(p.perks).toEqual({ manual: 1 });
  });

  it('retires 碑铭潜能 (act-182): refunds 100% legacy mirror iron/herb on ensureArcana and gives zero mirror bonuses', () => {
    const p = fresh(); p.iron = 5; p.herb = 3;
    // Simulate legacy save that upgraded edge (iron 8+18=26) and step (herb 8)
    p.mirror = { edge: { lv: 2, side: 1 }, step: { lv: 1, side: 0 } };
    expect(hasMirrorAffordable(p)).toBe(false);
    ensureArcana(p);
    // 100% lossless refund of spent iron & herb, mirror cleared
    expect(p.iron).toBe(5 + 8 + 18);
    expect(p.herb).toBe(3 + 8);
    expect(p.mirror).toEqual({});
    // Idempotent: calling ensureArcana again does not double-refund
    ensureArcana(p);
    expect(p.iron).toBe(5 + 8 + 18);
    expect(p.herb).toBe(3 + 8);
    const m = runMods(p);
    expect(m.firstStrikeBonus).toBe(0);
    expect(m.styleBonus).toBe(0);
    expect(m.dashCdMul).toBe(1);
    expect(m.counterBonus).toBe(0);
    expect(m.poiseDmgMul).toBe(1);
  });

  it('turns a mixed set of purchases into run modifiers', () => {
    const p = fresh();
    expect(runMods(p)).toMatchObject({ dmgMul: 1, critBonus: 0, dartBonus: 0, startCoins: 0, hpBonus: 0, deathDefy: 0, startIntent: 0, windupMul: 1, startManual: false, poiseHeal: 0 });
    p.perks = { blade: 2, darts: 1, manual: 1, vigor: 3, breath: 1, intent: 1, leech: 2, ear: 2 };
    // act-161: the medic's old levels fold into the altar once (they used to stay in p.perks and count twice); what fits the 6 grasp switches on,
    // cheapest first: 筋骨 (1) + 听宫 (2) + 杀意 (2) — 养气 and 闭息 wait for her to make room
    expect(runMods(p)).toMatchObject({ dmgMul: 1.10, critBonus: 0.04, dartBonus: 1, startCoins: 0, hpBonus: 36, deathDefy: 0, startIntent: 1, windupMul: 1.12, startManual: true, poiseHeal: 0 });
    expect(p.perks).toEqual({ blade: 2, darts: 1, manual: 1 });
    expect(p.arcana!.rank).toMatchObject({ vigor: 3, breath: 1, intent: 1, leech: 2, ear: 2 });
    expect(runMods(p).hpBonus).toBe(36);   // (again: nothing left to count twice)
    // a save that widened its grasp past the new top of 12 gets that herb back and keeps what fits
    const q = fresh(); q.herb = 0; ensureArcana(q); q.arcana!.cap = 18; ensureArcana(q);
    expect(arcanaCap(q)).toBe(12); expect(q.herb).toBe(44 + 62 + 84);
    expect(hasAffordable(q, 'medic')).toBe(true);   // (the altar's, not the retired list's)
  });

  it('supports Hades-2-style 3×3 药炉悟性牌阵 (Grasp cap, free toggle, 0-grasp center Awakening, refine & expand)', () => {
    const p = fresh(); p.herb = 100;
    expect(ARCANA).toHaveLength(9);
    ensureArcana(p);
    expect(arcanaCap(p)).toBe(6);
    expect(arcanaUsed(p)).toBe(0);
    // Starter cards vigor(1) & ear(2) can toggle free even with 0 herb
    expect(toggleArcana(p, 'vigor')).toBe('on');
    expect(toggleArcana(p, 'ear')).toBe('on');
    expect(arcanaUsed(p)).toBe(3);
    expect(runMods(p).hpBonus).toBe(12);
    expect(runMods(p).windupMul).toBeCloseTo(1.06, 5);
    // Unlock center 0-grasp Awakening card + 3rd card wind(1) -> center auto-awakens!
    expect(unlockArcana(p, 'center')).toBe(true);
    expect(isArcanaActive(p, 'center')).toBe(false);
    expect(unlockArcana(p, 'wind')).toBe(true);
    expect(isArcanaActive(p, 'wind')).toBe(true);
    expect(isArcanaActive(p, 'center')).toBe(true);
    expect(runMods(p).dmgMul).toBeCloseTo(1.05, 5);
    // Refine vigor rank 1 -> 2 and expand Grasp 6 -> 8
    expect(upgradeArcana(p, 'vigor')).toBe(true);
    expect(runMods(p).hpBonus).toBe(24);
    expect(expandArcanaCap(p)).toBe(true);
    expect(arcanaCap(p)).toBe(8);
  });
});

describe('run rewards', () => {
  it('calculates death and win rewards so mid-Act 2 death affords ~1–2 upgrades instead of flooding the whole tree', () => {
    const p = fresh(); p.iron = 0; p.herb = 0;
    const midAct2 = { rooms: 12.8, elites: 5, boss: true, won: false, kills: 100 };
    const rMid = runReward(midAct2);
    expect(rMid.iron).toBe(28);
    expect(rMid.herb).toBe(35);

    const death = { rooms: 4, elites: 2, boss: false, won: false, kills: 19 };
    const win = { rooms: 6, elites: 1, boss: true, won: true, kills: 20 };
    expect(runReward(death)).toEqual({ iron: 9, herb: 8 });
    expect(bank(p, death)).toEqual({ iron: 9, herb: 8 });
    expect(p).toMatchObject({ iron: 9, herb: 8, runs: 1, wins: 0, deaths: 1 });
    expect(runReward(win)).toEqual({ iron: 26, herb: 24 });
    expect(bank(p, win)).toEqual({ iron: 26, herb: 24 });
    expect(p).toMatchObject({ iron: 35, herb: 32, runs: 2, wins: 1, deaths: 1 });
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
