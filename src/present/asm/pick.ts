// 选「下一张」场景：在地点 × 构图 × 镜像 × 地标 × 季节 × 时段 × 天气里挑一组，并且离最近几张越远越好（防雷同）。
// 一章之内同一地点可以出现多次，但同一 (地点, 构图, 地标) 不重复，相邻两张的时段不同。
import type { Layout, Locale, SeasonId, Spec, TimeId, WeatherId } from './types';
import { hash } from '../scenes/props';

const SEASONS: SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];
export const TIMES: TimeId[] = ['dawn', 'day', 'overcast', 'sunset', 'dusk', 'night'];
/** which weathers make sense in a season */
export const WEATHER_OF: Record<SeasonId, WeatherId[]> = {
  spring: ['clear', 'petals', 'rain', 'storm', 'mist'],
  summer: ['clear', 'rain', 'storm', 'mist', 'embers'],
  autumn: ['clear', 'rain', 'storm', 'mist', 'embers'],
  winter: ['clear', 'snow', 'mist', 'storm'],
};

/** how alike two specs are (0 = nothing shared). Locale and layout weigh most: they are the big composition. */
export function sameness(a: Spec, b: Spec) {
  return (a.locale === b.locale ? 3 : 0) + (a.layout === b.layout ? 3 : 0) + (a.layout === b.layout && a.mirror === b.mirror ? 1 : 0) + (a.landmark === b.landmark && a.landmark ? 2 : 0)
    + (a.time === b.time ? 2.5 : 0) + (a.season === b.season ? 1 : 0) + (a.weather === b.weather ? 1.8 : 0);
}

export function pickSpec(seed: number, locales: Locale[], layouts: Record<string, Layout>, recent: Spec[] = [], o: { season?: SeasonId; locale?: string } = {}): Spec {
  const r = (k: number) => hash(seed * 7919 + 17, k, 4231);
  let best: Spec | null = null, bestScore = Infinity;
  for (let t = 0; t < 64; t++) {
    const loc = o.locale ? locales.find(l => l.id === o.locale)! : locales[Math.floor(r(t * 11 + 1) * locales.length) % locales.length];
    const lays = [...loc.layouts, ...(loc.extraLayouts ?? []).map(l => l.id)].filter(id => layouts[id] || loc.extraLayouts?.some(l => l.id === id));
    const layout = lays[Math.floor(r(t * 11 + 2) * lays.length) % lays.length];
    const L = layouts[layout] ?? loc.extraLayouts!.find(l => l.id === layout)!;
    const seasons = loc.seasons ?? SEASONS, season = o.season ?? seasons[Math.floor(r(t * 11 + 3) * seasons.length) % seasons.length];
    const times = loc.times ?? TIMES, time = times[Math.floor(r(t * 11 + 4) * times.length) % times.length];
    const rawWs = loc.weathers ? loc.weathers.filter(w => WEATHER_OF[season].includes(w)) : WEATHER_OF[season];
    const ws = rawWs.length ? rawWs : WEATHER_OF[season];
    const nonClear = ws.filter(w => w !== 'clear');
    // act-128: rich atmospheric weather (~74% active weather vs 26% clear) so consecutive rooms feel dramatically varied
    const weather = !nonClear.length || (ws.includes('clear') && r(t * 11 + 5) < 0.26)
      ? 'clear'
      : nonClear[Math.floor(r(t * 11 + 6) * nonClear.length) % nonClear.length];
    const lms = L.landmark ? loc.landmarks.filter(l => l.foot.w <= L.landmark!.w + 0.01 && l.foot.d <= L.landmark!.d + 0.01) : [];
    const landmark = lms.length ? lms[Math.floor(r(t * 11 + 7) * lms.length) % lms.length].id : null;
    const spec: Spec = { locale: loc.id, layout, mirror: r(t * 11 + 8) < 0.5, landmark, season, time, weather, seed: seed * 31 + t };
    // the score: how alike it is to the recent ones (the newest weighs most), with strong variety on time-of-day & weather
    let score = 0;
    recent.forEach((p, i) => {
      const age = recent.length - 1 - i, w = 1 / (1 + age * 0.5);
      score += sameness(spec, p) * w;
      if (p.locale === spec.locale && p.layout === spec.layout && p.landmark === spec.landmark) score += 50;
      if (p.locale === spec.locale) { if (age < 2) score += 12; if (p.season === spec.season) score += 6; if (p.time === spec.time) score += 6; if (p.landmark === spec.landmark && spec.landmark) score += 8; }
    });
    if (recent.length && recent[recent.length - 1].time === spec.time) score += 10;
    if (recent.length && recent[recent.length - 1].weather === spec.weather) score += 7;
    if (recent.length && recent[recent.length - 1].season === spec.season) score += 2;
    const last4 = recent.slice(-4);
    score += 3 * last4.filter(p => p.season === spec.season).length
      + 3.5 * last4.filter(p => p.time === spec.time).length
      + 2.5 * last4.filter(p => p.weather === spec.weather).length;
    if (spec.season === 'winter' && spec.time === 'day') score += 3 * recent.filter(p => p.season === 'winter' && p.time === 'day').length;
    if (score < bestScore) { bestScore = score; best = spec; }
  }
  return best!;
}
