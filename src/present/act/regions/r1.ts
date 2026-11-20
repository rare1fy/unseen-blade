// 第一关 · 黄巾残村：两处战斗地点残村 / 麦田，头目间破庙，5 间 + 渠帅。
// 刷什么兵按「第几间」加码（depth = 这一关里的第几间，0 起）；兵种用黄巾的 id（hj_*），'kind*' = 那一种的精英。
import type { RegionDef } from '../regionDef';
import type { RoomType } from '../run';
import '../foes/hj_ai';

type Rnd = () => number;
const pick = <T>(a: T[], r: Rnd) => a[Math.floor(r() * a.length) % a.length];

/** the waves of a room of region one, stronger the deeper in (depth = room index 0..5) */
export function waves1(type: RoomType, depth: number, r: Rnd): string[][] {
  if (type === 'boss') return BOSS_WAVES_1.map(w => [...w]);
  if (type === 'elite') {
    const head = pick(['hj_blade', 'hj_brute', 'hj_taoist', 'hj_archer', 'hj_hound'], r) + '*';
    const support = pick(['hj_archer', 'hj_taoist', 'hj_jar'], r);
    return [
      [head, support, 'hj_sickle', 'hj_mob'],
      ['hj_blade', 'hj_hound', pick(['hj_archer', 'hj_taoist', 'hj_jar'], r), ...(depth >= 2 ? ['hj_brute'] : ['hj_sickle'])],
    ];
  }
  if (type !== 'fight') return [];
  // act-118: structured tactical pairings from room 1 onward (frontline + ranged/flanker pressure instead of pure mob clumps)
  if (depth === 0) return [
    ['hj_blade', 'hj_archer', 'hj_sickle', 'hj_mob'],
    ['hj_blade', 'hj_hound', 'hj_jar', 'hj_mob'],
  ];
  if (depth === 1) return [
    ['hj_blade', 'hj_taoist', 'hj_sickle', 'hj_mob'],
    ['hj_brute', 'hj_archer', 'hj_mob', 'hj_mob'],
  ];
  const w1 = ['hj_blade', pick(['hj_brute', 'hj_hound'], r), pick(['hj_archer', 'hj_taoist'], r), 'hj_sickle', 'hj_mob'];
  const w2 = [depth >= 3 ? pick(['hj_blade', 'hj_hound', 'hj_taoist'], r) + '*' : 'hj_brute', 'hj_blade', pick(['hj_archer', 'hj_taoist', 'hj_jar'], r), 'hj_hound', 'hj_mob'];
  return [w1, w2];
}
const BOSS_WAVES_1 = [['hj_blade', 'hj_taoist', 'hj_sickle', 'hj_mob'], ['hj_boss', 'hj_archer', 'hj_mob']];

export const REGION_1: RegionDef = {
  id: 'r1_huangjin', name: '黄巾残村',
  locales: ['hj_village', 'hj_field'], bossLocale: 'hj_temple', rooms: 5,
  waves: (type, depth, r) => waves1(type, depth, r),
  bossWaves: BOSS_WAVES_1, boss: 'hj_boss',
  music: { fight: 'bgm_battle', boss: 'bgm_boss' },
};
