// 天光和天气：时段 × 季节 × 天气 → Mood（天空渐变、太阳/月亮方向、雾、半球光、主光）+ 灯笼强度 + 天气粒子。
// 和主题无关，所有地点共用。时段决定大格调，季节微调天光和地面远景色，天气加雾和粒子。
import type { Mood } from '../scenes/stage';
import type { Ambient } from '../scenes/cards';
import type { SeasonId, TimeId, WeatherId } from './types';

const BASE: Record<TimeId, Mood> = {
  dusk: { sky: true, bg: 0x1a1c30, fog: 0x2a3044, fogD: 0.017, hemiSky: 0x8ca0b0, hemiGround: 0x2c2c24, hemiI: 1.75, moon: 0xbcd6ee, moonI: 2.5, key: 0xffe2b4, keyI: 0.8,
    earth: [0x2c3826, 0x2d3927, 0x2b3725], mist: 0x8a909c, mistA: 0.07, skyTop: 0x141a3e, skyMid: 0x3e3468, skyHor: 0xc8704e, skyDisc: [0.5, 0.05, -1], skyDiscCol: [0.85, 0.48, 0.3], moonPos: [-8, 15, -9] },
  night: { sky: true, bg: 0x0a0c1a, fog: 0x161c30, fogD: 0.02, hemiSky: 0x5c6c98, hemiGround: 0x1a1a20, hemiI: 1.75, moon: 0xa8bcff, moonI: 2.9, key: 0xc8c8e8, keyI: 0.55,
    earth: [0x1e2a1e, 0x202c20, 0x1c281c], mist: 0x5a648c, mistA: 0.09, skyTop: 0x060818, skyMid: 0x1a1e40, skyHor: 0x3a3c66, skyDisc: [-0.3, 0.45, -1], skyDiscCol: [1.2, 1.18, 1.3], moonPos: [-6, 14, -10] },
  dawn: { sky: true, bg: 0x7a8494, fog: 0x8c96a2, fogD: 0.019, hemiSky: 0xb4c0cc, hemiGround: 0x3e4038, hemiI: 1.6, moon: 0xfff0dc, moonI: 2.2, key: 0xffe8cc, keyI: 0.7,
    earth: [0x3a4632, 0x3c4834, 0x384430], mist: 0xc0c8d0, mistA: 0.09, skyTop: 0x7a8ca8, skyMid: 0xa8b4c4, skyHor: 0xe0d8cc, skyDisc: [0.6, 0.18, -1], skyDiscCol: [1.1, 1.0, 0.85], moonPos: [9, 13, -8] },
  day: { sky: true, bg: 0x6a8cb4, fog: 0x8aa4c0, fogD: 0.011, hemiSky: 0xc8dcf0, hemiGround: 0x4a4636, hemiI: 1.55, moon: 0xfff2dc, moonI: 3.0, key: 0xfff0d8, keyI: 0.6,
    earth: [0x48583a, 0x4a5a3c, 0x465638], mist: 0xd0dce8, mistA: 0.04, skyTop: 0x3a68a8, skyMid: 0x7aa0cc, skyHor: 0xd8e4ec, skyDisc: [0.45, 0.6, -1], skyDiscCol: [1.4, 1.35, 1.2], moonPos: [8, 16, -6] },
};
const mix = (a: number, b: number, k: number) => {
  const f = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (f(16) << 16) | (f(8) << 8) | f(0);
};
export function moodFor(t: TimeId, s: SeasonId, w: WeatherId): Mood {
  const m: Mood = { ...BASE[t], earth: [...BASE[t].earth], exposure: ({ dusk: 1.55, night: 1.6, dawn: 1.3, day: 1.2 } as const)[t], bloomT: ({ dusk: 1.05, night: 1.05, dawn: 1.35, day: 1.6 } as const)[t], glowK: ({ dusk: 1.6, night: 1.8, dawn: 1.3, day: 1.1 } as const)[t] };
  // seasons: spring a little pink in the horizon, summer greener ground and a warmer key, autumn amber, winter pale and blue
  if (s === 'spring') { m.skyHor = mix(m.skyHor!, 0xe8a0b0, 0.25); m.hemiSky = mix(m.hemiSky, 0xe0c0d0, 0.12); }
  if (s === 'summer') { m.earth = m.earth.map(e => mix(e, 0x3e5a2e, 0.4)); m.key = mix(m.key, 0xffe0a0, 0.3); }
  if (s === 'autumn') { m.skyHor = mix(m.skyHor!, 0xd08040, 0.25); m.earth = m.earth.map(e => mix(e, 0x4a3a28, 0.35)); }
  if (s === 'winter') { m.exposure = m.exposure! * (t === 'day' ? 0.8 : t === 'dawn' ? 0.84 : 0.94); m.bloomT = Math.max(m.bloomT!, t === 'day' || t === 'dawn' ? 2.2 : 1.3); m.hemiI *= 0.8; m.moonI *= 0.85; m.earth = m.earth.map(e => mix(e, 0xb8c0cc, 0.75)); m.hemiSky = mix(m.hemiSky, 0xc8d4e8, 0.3); m.hemiGround = mix(m.hemiGround, 0x8890a0, 0.5); m.fog = mix(m.fog, 0x9aa4b8, 0.3); }
  // weather: rain darkens and fogs, snow brightens the ground bounce, mist thickens the haze
  if (w === 'rain') { m.fogD *= 1.5; m.fog = mix(m.fog, 0x3a404c, 0.4); m.moonI *= 0.75; m.mistA = (m.mistA ?? 0.08) + 0.04; m.skyTop = mix(m.skyTop!, 0x2a2e38, 0.6); m.skyMid = mix(m.skyMid!, 0x3a3e48, 0.6); m.skyHor = mix(m.skyHor!, 0x50525a, 0.6); m.skyDiscCol = [0.4, 0.4, 0.42]; }
  if (w === 'snow') { m.fogD *= 1.3; m.fog = mix(m.fog, 0xa0a8b8, 0.4); m.hemiGround = mix(m.hemiGround, 0xa0a8b8, 0.5); m.skyDiscCol = [0.7, 0.72, 0.78]; }
  if (w === 'mist') { m.fogD *= 1.6; m.mistA = (m.mistA ?? 0.08) + 0.06; }
  return m;
}
/** point-light strength for the time (lamps barely matter at noon) */
export function lampFor(t: TimeId, w: WeatherId) { return ({ dusk: 1, night: 1.35, dawn: 0.45, day: 0.25 }[t]) * (w === 'rain' ? 1.1 : 1); }
export function weatherAmbient(w: WeatherId, s: SeasonId, t: TimeId): Ambient[] {
  const A = { x0: -12, z0: -12, x1: 12, z1: 6 }, out: Ambient[] = [];
  if (w === 'rain') out.push({ kind: 'rain', color: 0xb8c4d4, rate: 90, area: A });
  if (w === 'snow') out.push({ kind: 'snow', color: 0xf0f4ff, rate: 22, area: A });
  if (w === 'petals') out.push({ kind: 'petals', color: 0xf4b8c8, rate: 6, area: A }, { kind: 'petals', color: 0xfcdce4, rate: 3, area: A });
  if (s === 'autumn' && w !== 'rain' && w !== 'snow') out.push({ kind: 'leaves', color: 0xd8482a, rate: 2.2, area: A }, { kind: 'leaves', color: 0xe8902e, rate: 0.8, area: A });
  if (t === 'night' && s === 'summer' && w === 'clear') out.push({ kind: 'fireflies', color: 0xc8ff8a, rate: 1.4, area: { x0: -11, z0: -11, x1: 11, z1: -1 } });
  if (t === 'dusk' || t === 'night') out.push({ kind: 'fireflies', color: 0xffc070, rate: 0.4, area: { x0: -10, z0: -11, x1: 10, z1: -6 } });
  if (w !== 'rain' && w !== 'snow') out.push({ kind: 'dust', color: 0xe8d8c8, rate: 1.5 });
  return out;
}
