import { describe, expect, it } from 'vitest';
import { pickSpec, WEATHER_OF } from '../src/present/asm/pick';
import { weatherAmbient } from '../src/present/asm/sky';
import { HANMO_LOCALES } from '../src/present/asm/hanmo';
import { LUOYANG_LOCALES } from '../src/present/asm/luoyang';
import { WULIN_LOCALES } from '../src/present/asm/wulin';
import { LAYOUTS } from '../src/present/asm/layouts';

const SRC = Object.fromEntries(
  Object.entries(
    import.meta.glob(['../src/present/scenes/cards.ts', '../src/present/scenes/stage.ts', '../src/present/act/show.ts', '../src/audio/audio.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>,
  ).map(([k, v]) => [k.slice(3), v]),
);

describe('act-153 weather visibility, variety, and audio', () => {
  it('allows rain, storm, and snow in Ch1 (autumn), rain/storm in Ch2 (no snow) and Ch4', () => {
    expect(WEATHER_OF.autumn).toContain('rain');
    expect(WEATHER_OF.autumn).toContain('storm');
    expect(WEATHER_OF.autumn).toContain('snow');

    const ch1: ReturnType<typeof pickSpec>[] = [];
    for (let i = 0; i < 18; i++) ch1.push(pickSpec(500 + i * 29, HANMO_LOCALES, LAYOUTS, ch1, { season: 'autumn' }));
    const ch1W = new Set(ch1.map(s => s.weather));
    expect(ch1W.has('rain') || ch1W.has('storm')).toBe(true);
    expect(ch1W.has('snow')).toBe(true);

    const ch2: ReturnType<typeof pickSpec>[] = [];
    const ch2Locs = LUOYANG_LOCALES.filter(l => l.id !== 'ly_mint');
    for (let i = 0; i < 18; i++) ch2.push(pickSpec(700 + i * 31, ch2Locs, LAYOUTS, ch2, { season: 'autumn' }));
    const ch2W = new Set(ch2.map(s => s.weather));
    expect(ch2W.has('rain') || ch2W.has('storm')).toBe(true);
    expect(ch2W.has('snow')).toBe(false);

    const ch4: ReturnType<typeof pickSpec>[] = [];
    const ch4Locs = WULIN_LOCALES.filter(l => l.id !== 'wl_tower');
    for (let i = 0; i < 16; i++) ch4.push(pickSpec(900 + i * 23, ch4Locs, LAYOUTS, ch4, { season: 'spring' }));
    const ch4W = new Set(ch4.map(s => s.weather));
    expect(ch4W.has('rain') || ch4W.has('storm')).toBe(true);
  });

  it('produces full-arena high-visibility rain, storm, and daytime/nighttime snow ambient configs', () => {
    const rain = weatherAmbient('rain', 'autumn', 'dusk', true).find(a => a.kind === 'rain');
    expect(rain).toBeTruthy();
    expect(rain!.rate).toBeGreaterThanOrEqual(140);
    expect(rain!.area!.z1).toBeGreaterThanOrEqual(14);

    const storm = weatherAmbient('storm', 'autumn', 'night', true).find(a => a.kind === 'storm');
    expect(storm).toBeTruthy();
    expect(storm!.rate).toBeGreaterThanOrEqual(200);

    const snowDay = weatherAmbient('snow', 'winter', 'day', true).filter(a => a.kind === 'snow');
    expect(snowDay.length).toBeGreaterThanOrEqual(2);
    expect(snowDay[0].rate).toBeGreaterThanOrEqual(60);
  });

  it('uses solid pixel rain streaks with ground splashes, camera follow, rotating hideout moods, and pure-PCM rain audio', () => {
    const cards = SRC['src/present/scenes/cards.ts'];
    expect(cards).toContain('weatherBox');
    expect(cards).toContain('prewarmAmbient');
    expect(cards).toMatch(/TILE\.pixel,\s*stretch:\s*1\.\d+/);
    expect(cards).toContain('TILE.ring');

    const stage = SRC['src/present/scenes/stage.ts'];
    expect(stage).toContain('PALPHA?.clear()');
    expect(stage).toContain('prewarmAmbient(amb)');

    const show = SRC['src/present/act/show.ts'];
    expect(show).toContain('HIDEOUT_ATMOS');
    expect(show).toContain("weather: 'rain'");
    expect(show).toContain("weather: 'snow'");
    expect(show).toContain('setWeatherSound(');

    const audio = SRC['src/audio/audio.ts'];
    expect(audio).toContain('setWeatherSound(');
    expect(audio).toContain('makeRainBuffer(');
  });
});
