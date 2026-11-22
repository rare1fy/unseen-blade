import { describe, it, expect, afterEach } from 'vitest';
import { fresh } from '../src/present/act/profile';
import {
  COLLECTORS, GARDEN_SPEED_DAILY_MAX,
  recordAdWatched, isCollectorUnlocked, collectorProgress, nextLanternMilestone,
  gardenSpeedLeft, consumeGardenSpeed, activeUiSkin, activeBladeFx, activeOutfitId,
  activeHideoutMood, activeHideoutDecors, clearRunAdBuffs, ensureAds,
} from '../src/present/act/collectors';
import { ensureGarden, plantSeed, harvestPlot, ripenPlotNow, SEEDS } from '../src/present/act/garden';
import { setAdSimHost, showRewardedAd } from '../src/platform/ads';
import { SLIM } from '../src/present/act/blind2';

afterEach(() => {
  setAdSimHost(null);
});

describe('act-139: 独游典藏激励体系、长明灯添油、收菜翻倍与去重随', () => {
  it('D1 长明灯累计添油在 3/6/10/15/20 盏自动永久解锁全部典藏，且支持单项提前直接观影解锁', () => {
    const p = fresh();
    expect(isCollectorUnlocked(p, 'skin_iron')).toBe(true);
    expect(isCollectorUnlocked(p, 'skin_lacquer')).toBe(false);
    expect(isCollectorUnlocked(p, 'filter_ink')).toBe(false);
    expect(nextLanternMilestone(p)?.at).toBe(3);

    // Direct 2 ads toward skin_bamboo unlocks it early AND adds 2 to lantern total
    recordAdWatched(p, 'skin_bamboo');
    expect(collectorProgress(p, 'skin_bamboo')).toBe(1);
    expect(isCollectorUnlocked(p, 'skin_bamboo')).toBe(false);
    const r2 = recordAdWatched(p, 'skin_bamboo');
    expect(r2.total).toBe(2);
    expect(isCollectorUnlocked(p, 'skin_bamboo')).toBe(true);
    expect(r2.newlyUnlocked.some(x => x.id === 'skin_bamboo')).toBe(true);

    // 3rd ad hits 3-oil milestone -> unlocks skin_lacquer + outfit_white + outfit_snow
    const r3 = recordAdWatched(p);
    expect(r3.total).toBe(3);
    expect(isCollectorUnlocked(p, 'skin_lacquer')).toBe(true);
    expect(isCollectorUnlocked(p, 'outfit_snow')).toBe(true);

    // Reach 20 total oil -> every collector item is permanently unlocked
    for (let i = 0; i < 17; i++) recordAdWatched(p);
    expect(ensureAds(p).total).toBe(20);
    for (const c of COLLECTORS) {
      expect(isCollectorUnlocked(p, c.id)).toBe(true);
    }
    expect(nextLanternMilestone(p)).toBeNull();
  });

  it('A1/A2/A4 典藏行头、刀光、界面皮肤、古窑氛围与装潢受解锁状态保护，单局试用后可清空', () => {
    const p = fresh();
    p.uiSkin = 'lacquer';
    p.bladeFx = 'ink';
    p.wear = 'fine_snow';
    p.hideoutMood = 'snow_night';
    p.hideoutDecors = { eaves_cat: true };

    // Locked by default -> falls back safely
    expect(activeUiSkin(p)).toBe('iron');
    expect(activeBladeFx(p)).toBe('default');
    expect(activeOutfitId(p)).toBe('fine_hat');
    expect(activeHideoutMood(p).id).toBe('default');
    expect(activeHideoutDecors(p).eaves_cat).toBe(false);

    // Single-run trial overrides before permanent unlock
    const a = ensureAds(p);
    a.trialOutfit = 'fine_obsidian';
    a.trialBladeFx = 'ember';
    a.rentWeapon = 'thunder';
    a.mealUpgraded = true;
    a.divineSchool = 'blood';
    expect(activeOutfitId(p)).toBe('fine_obsidian');
    expect(activeBladeFx(p)).toBe('ember');

    // Run end clears single-run ad perks cleanly
    clearRunAdBuffs(p);
    expect(a.trialOutfit).toBeNull();
    expect(a.trialBladeFx).toBeNull();
    expect(a.rentWeapon).toBeNull();
    expect(a.mealUpgraded).toBe(false);
    expect(a.divineSchool).toBeNull();

    // New 3.5cm collector outfits exist on SLIM roster
    expect(SLIM.some(h => h.id === 'fine_snow')).toBe(true);
    expect(SLIM.some(h => h.id === 'fine_obsidian')).toBe(true);
    expect(SLIM.some(h => h.id === 'fine_crimson')).toBe(true);
  });

  it('B2 引溪催熟（每日限3次）与收菜翻倍（双倍资源 + 回赠同种种子）正常工作', () => {
    const p = fresh();
    const t0 = new Date(2026, 10, 22, 12, 0, 0).getTime();
    ensureGarden(p, t0);
    expect(plantSeed(p, 0, 'frostlotus', t0)).toBe(true);

    // Daily speed limit is 3
    expect(gardenSpeedLeft(p, t0)).toBe(GARDEN_SPEED_DAILY_MAX);
    expect(consumeGardenSpeed(p, t0)).toBe(true);
    expect(ripenPlotNow(p, 0, t0)?.id).toBe('frostlotus');
    expect(gardenSpeedLeft(p, t0)).toBe(GARDEN_SPEED_DAILY_MAX - 1);

    // Double harvest grants 2× herb & iron + 1 bonus seed of the same type + elixir buff
    const beforeSeeds = p.garden!.seeds.frostlotus;
    const res = harvestPlot(p, 0, t0, true);
    expect(res).not.toBeNull();
    expect(res!.herb).toBe(SEEDS.frostlotus.herb * 2);
    expect(res!.iron).toBe(SEEDS.frostlotus.iron * 2);
    expect(res!.bonusSeed).toBe('frostlotus');
    expect(res!.buff).toBe('lotus');
    expect(p.garden!.seeds.frostlotus).toBe(beforeSeeds + 1);
  });

  it('统一激励视频层仅在完整观看时返回 watched=true，取消时绝不发奖', async () => {
    setAdSimHost(async () => false);
    const rCancel = await showRewardedAd({ placement: 'garden_double', title: 'test', rewardText: 'x2' });
    expect(rCancel.watched).toBe(false);

    setAdSimHost(async () => true);
    const rOk = await showRewardedAd({ placement: 'garden_double', title: 'test', rewardText: 'x2' });
    expect(rOk.watched).toBe(true);
  });
});
