// 北道第一关 · 荒驿官道（第二入口首关：枯苇寒风、官军捉夫营、杜五寻踪线索 #1）
import type { RegionDef } from '../regionDef';
import type { RoomType } from '../run';
import './northFoes';

type Rnd = () => number;
const pick = <T>(a: T[], r: Rnd) => a[Math.floor(r() * a.length) % a.length];

export function wavesN1(type: RoomType, depth: number, r: Rnd): string[][] {
  if (type === 'boss') return BOSS_WAVES_N1.map(w => [...w]);
  if (type === 'elite') {
    const head = pick(['ly_shield', 'hj_brute', 'ly_xbow'], r) + '*';
    return [
      [head, 'hj_archer', 'hj_blade', 'hj_hound'],
      [depth >= 2 ? 'ly_shield*' : 'ly_shield', 'hj_blade', 'ly_xbow', 'hj_mob'],
    ];
  }
  if (type !== 'fight') return [];
  if (depth === 0) return [
    ['hj_blade', 'hj_archer', 'hj_mob', 'hj_mob'],
    ['ly_shield', 'hj_hound', 'hj_archer', 'hj_blade'],
  ];
  if (depth >= 3) return [
    ['ly_shield', 'hj_blade', 'ly_xbow', 'hj_hound'],
    ['hj_blade', 'hj_archer', 'hj_mob'],
    ['ly_shield*', 'hj_brute', 'ly_xbow', 'hj_hound', 'hj_blade'],
  ];
  return [
    ['ly_shield', 'hj_blade', 'hj_archer', 'hj_hound'],
    ['hj_brute', 'ly_xbow', 'hj_blade', 'hj_mob', 'hj_mob'],
  ];
}

const BOSS_WAVES_N1 = [
  ['ly_shield', 'hj_archer', 'hj_hound', 'hj_blade'],
  ['nr1_boss', 'ly_xbow', 'hj_blade'],
];

export const NORTH_1: RegionDef = {
  id: 'n1_post',
  name: '荒驿官道',
  tag: '枯苇寒风，官军捉夫',
  locales: ['hj_field', 'hj_village'],
  bossLocale: 'hj_temple',
  rooms: 5,
  waves: wavesN1,
  bossWaves: BOSS_WAVES_N1,
  boss: 'nr1_boss',
  spec: { season: 'autumn', weather: 'mist', time: 'dusk' },
  music: { fight: 'bgm_battle', boss: 'bgm_boss' },
};
