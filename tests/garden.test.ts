import { describe, it, expect } from 'vitest';
import { fresh } from '../src/present/act/profile';
import { runMods } from '../src/present/act/meta';
import { HIDEOUT } from '../src/present/act/hideout';
import {
  SEEDS, PLOT_COUNT, ensureGarden, plotStatus, plantSeed, harvestPlot,
  advanceGardenRooms, unlockPlot, canUnlockPlot, rollSeedDrop, ripePlotIndices,
} from '../src/present/act/garden';

describe('act-132: 营地竹溪药圃种田系统与据点路尽头光圈', () => {
  it('据点出发光圈位于南门山道尽头，且外扩东翼药圃拥有 6 块独立药畦', () => {
    expect(HIDEOUT.exit.z).toBeGreaterThanOrEqual(15.5);
    expect(HIDEOUT.floor.z1).toBeGreaterThanOrEqual(16.2);
    expect(HIDEOUT.floor.x1).toBeGreaterThanOrEqual(23.0);
    expect(HIDEOUT.gardenPlots.length).toBe(PLOT_COUNT);
    for (const gp of HIDEOUT.gardenPlots) {
      expect(gp.x).toBeGreaterThan(16.5);
      expect(gp.x).toBeLessThan(HIDEOUT.floor.x1);
    }
  });

  it('双轨成熟：局内清房推进 + 离线真实时间推进，收获得资源与下局丹药增益', () => {
    const p = fresh();
    const t0 = new Date(2026, 10, 21, 10, 0, 0).getTime();
    const { state, dailyGift } = ensureGarden(p, t0);
    expect(dailyGift).toEqual([]); // first init gives starter pack instead of daily gift
    expect(state.unlocked).toBe(2);
    expect(state.seeds.angelica).toBe(2);
    expect(state.seeds.frostlotus).toBe(1);

    // Plant angelica on plot 0 & frostlotus on plot 1
    expect(plantSeed(p, 0, 'angelica', t0)).toBe(true);
    expect(plantSeed(p, 1, 'frostlotus', t0)).toBe(true);
    expect(plotStatus(state.plots[0], t0).stage).toBe(1);

    // Dual-track test A: 1 combat room + 24 mins offline = 1 + 2 = 3 steps -> angelica ripe!
    advanceGardenRooms(p, 1, t0);
    const t24 = t0 + 24 * 60000;
    expect(plotStatus(state.plots[0], t24).done).toBe(true);
    expect(plotStatus(state.plots[1], t24).done).toBe(false);
    expect(ripePlotIndices(p, t24)).toEqual([0]);

    const res0 = harvestPlot(p, 0, t24);
    expect(res0?.herb).toBe(SEEDS.angelica.herb);
    expect(p.herb).toBe(SEEDS.angelica.herb);

    // Dual-track test B: advance 5 more combat rooms -> frostlotus (6 steps) ripens and grants Warming Brew buff
    const ripened = advanceGardenRooms(p, 5, t24);
    expect(ripened.map(s => s.id)).toEqual(['frostlotus']);
    const res1 = harvestPlot(p, 1, t24);
    expect(res1?.buff).toBe('lotus');
    const mods = runMods(p);
    expect(mods.hpBonus).toBe(25);
    expect(mods.rerolls).toBe(2); // base 1 + lotus 1

    // Reclaim plot 2 with harvested herbs
    expect(canUnlockPlot(p, 2)).toBe(true);
    expect(unlockPlot(p, 2)).toBe(true);
    expect(p.garden?.unlocked).toBe(3);

    // Next calendar day return triggers Sun Ao's daily seed gift
    const nextDay = new Date(2026, 10, 22, 9, 0, 0).getTime();
    const { dailyGift: gift2 } = ensureGarden(p, nextDay);
    expect(gift2.length).toBeGreaterThan(0);

    // Boss kill always drops a seed
    expect(rollSeedDrop('boss', () => 0.2)).toBe('xuanzhi');
  });
});
