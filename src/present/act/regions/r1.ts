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
    return [[head, 'hj_sickle', 'hj_mob', 'hj_mob'], ['hj_blade', pick(['hj_archer', 'hj_taoist', 'hj_jar'], r), 'hj_hound', ...(depth >= 3 ? ['hj_brute'] : [])]];
  }
  if (type !== 'fight') return [];
  if (depth === 0) return [['hj_blade', 'hj_sickle', 'hj_mob', 'hj_mob'], ['hj_blade', 'hj_jar', 'hj_hound', 'hj_mob', 'hj_mob']];
  const w1 = ['hj_blade', 'hj_sickle', 'hj_mob', 'hj_mob', 'hj_mob', ...(depth >= 2 ? [pick(['hj_archer', 'hj_taoist', 'hj_jar'], r)] : [])];
  const w2 = ['hj_blade', pick(['hj_brute', 'hj_hound'], r), pick(['hj_archer', 'hj_taoist', 'hj_jar'], r), 'hj_mob', 'hj_mob', ...(depth >= 3 ? [pick(['hj_brute', 'hj_taoist', 'hj_hound'], r)] : [])];
  return [w1, w2];
}
const BOSS_WAVES_1 = [['hj_sickle', 'hj_jar', 'hj_mob', 'hj_mob', 'hj_mob'], ['hj_boss', 'hj_mob', 'hj_mob']];

export const REGION_1: RegionDef = {
  id: 'r1_huangjin', name: '黄巾残村',
  locales: ['hj_village', 'hj_field'], bossLocale: 'hj_temple', rooms: 5,
  waves: (type, depth, r) => waves1(type, depth, r),
  bossWaves: BOSS_WAVES_1, boss: 'hj_boss',
  music: { fight: 'bgm_battle', boss: 'bgm_boss' },
};
