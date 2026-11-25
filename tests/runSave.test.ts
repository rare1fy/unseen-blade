import { beforeEach, describe, expect, it } from 'vitest';
import { clearRunSave, hasRunSave, loadRunSave, RUN_SAVE_KEY, runSaveLabel, saveRunState, type RunSave } from '../src/present/act/runSave';
import { newGame } from '../src/present/act/profile';

const mem = new Map<string, string>();
const mockStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => { mem.clear(); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};

Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, configurable: true, writable: true });

function sampleSave(over: Partial<RunSave> = {}): RunSave {
  return {
    v: 1,
    at: 1700000000000,
    region: 1,
    room: 3,
    locale: 'ly_street',
    plan: { type: 'elite', locale: 'ly_street', reward: { k: 'boon', arch: 'blood' }, waves: [['hj_blade', 'hj_mob']], region: 1 },
    nextRooms: [
      { type: 'shop', locale: 'ly_street', reward: null, waves: [], region: 1 },
      { type: 'fight', locale: 'ly_street', reward: { k: 'coins', n: 55 }, waves: [['hj_mob']], region: 1 },
    ],
    cleared: false,
    shopSpecial: 'satchel',
    spentStations: ['buy_heal'],
    mapId: 'ly_m1',
    roomSeed: 12345,
    hp: 74,
    maxHp: 115,
    qi: 1.5,
    intent: 2,
    intentVal: 2.3,
    coins: 128,
    perks: { moves: { launch: true, chase: true }, owned: { bleed: 1, bladeWind: 0 } },
    kills: 27,
    eliteKills: 2,
    bosses: 1,
    bossKilled: true,
    defy: 1,
    usedRevive: false,
    wine: true,
    ksShield: 1,
    ksRevenge: false,
    divineSchoolRun: 'blood',
    visited: ['fight', 'fight', 'rest', 'elite'],
    maps: ['hj_m1', 'ly_m1'],
    shapes: ['square', 'map'],
    usedPoolBosses: ['hj_boss'],
    genBlessings: [],
    baseFoe: { hp: 30, dmg: 12, aggression: 0.95, calm: 0.5, attackers: 2 },
    mods: {
      dmgMul: 1.1, critBonus: 0.05, dartBonus: 1, startCoins: 20, hpBonus: 15, deathDefy: 1,
      startIntent: 0, windupMul: 1, startManual: false, poiseHeal: 0, firstStrikeBonus: 0,
      styleBonus: 0, dashCdMul: 1, counterBonus: 0, markedDmgBonus: 0, poiseDmgMul: 1,
      rareOddsBonus: 0, interestRate: 0.1,
    },
    startManualDone: true,
    ...over,
  };
}

describe('mid-run checkpoint save (runSave)', () => {
  beforeEach(() => {
    mem.clear();
  });

  it('round-trips a complete mid-run snapshot cleanly', () => {
    expect(hasRunSave()).toBe(false);
    const s = sampleSave({ cleared: true });
    saveRunState(s);
    expect(hasRunSave()).toBe(true);
    const loaded = loadRunSave();
    expect(loaded).not.toBeNull();
    expect(loaded!.region).toBe(1);
    expect(loaded!.room).toBe(3);
    expect(loaded!.cleared).toBe(true);
    expect(loaded!.hp).toBe(74);
    expect(loaded!.maxHp).toBe(115);
    expect(loaded!.coins).toBe(128);
    expect(loaded!.perks.moves).toEqual({ launch: true, chase: true });
    expect(loaded!.perks.owned).toEqual({ bleed: 1, bladeWind: 0 });
    expect(loaded!.nextRooms).toHaveLength(2);
    expect(loaded!.spentStations).toEqual(['buy_heal']);
    expect(loaded!.shopSpecial).toBe('satchel');
    expect(loaded!.mapId).toBe('ly_m1');
    expect(loaded!.roomSeed).toBe(12345);
  });

  it('rejects malformed, outdated, or dead-hero snapshots safely', () => {
    mem.set(RUN_SAVE_KEY, '{not-json');
    expect(loadRunSave()).toBeNull();

    mem.set(RUN_SAVE_KEY, JSON.stringify({ ...sampleSave(), v: 99 }));
    expect(loadRunSave()).toBeNull();

    mem.set(RUN_SAVE_KEY, JSON.stringify({ ...sampleSave(), hp: 0 }));
    expect(loadRunSave()).toBeNull();

    mem.set(RUN_SAVE_KEY, JSON.stringify({ ...sampleSave(), region: 99 }));
    expect(loadRunSave()).toBeNull();
  });

  it('clears mid-run checkpoint on clearRunSave() and newGame()', () => {
    saveRunState(sampleSave());
    expect(hasRunSave()).toBe(true);
    clearRunSave();
    expect(hasRunSave()).toBe(false);

    saveRunState(sampleSave());
    expect(hasRunSave()).toBe(true);
    newGame();
    expect(hasRunSave()).toBe(false);
  });

  it('formats concise room and boss checkpoint labels', () => {
    expect(runSaveLabel(sampleSave({ region: 0, room: 0, plan: { type: 'fight', locale: 'hj_village', reward: null, waves: [] } }))).toContain('第一间');
    expect(runSaveLabel(sampleSave({ region: 1, room: 7, plan: { type: 'boss', locale: 'ly_furnace', reward: null, waves: [] } }))).toContain('首领间');
  });
});
