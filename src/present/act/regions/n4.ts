// 北道第四关 · 函谷玄台（双线幕后终极要塞：监军太尉谢渊坐镇）
import type { RegionDef } from '../regionDef';
import type { RoomType } from '../run';
import './northFoes';

type Rnd = () => number;
const pick = <T>(a: T[], r: Rnd) => a[Math.floor(r() * a.length) % a.length];

export function wavesN4(type: RoomType, depth: number, r: Rnd): string[][] {
  if (type === 'boss') return BOSS_WAVES_N4.map(w => [...w]);
  if (type === 'elite') {
    const head = pick(['cx_guard', 'cx_sword', 'cx_shade'], r) + '*';
    return [
      [head, 'cx_zhu', 'cx_sword', 'cx_club'],
      [depth >= 2 ? 'cx_guard*' : 'cx_sword*', 'cx_shade', 'cx_zhu', 'cx_guard'],
    ];
  }
  if (type !== 'fight') return [];
  if (depth === 0) return [
    ['cx_sword', 'cx_zhu', 'cx_club', 'cx_club'],
    ['cx_guard', 'cx_shade', 'cx_sword', 'cx_zhu'],
  ];
  if (depth >= 3) return [
    ['cx_guard', 'cx_sword', 'cx_zhu', 'cx_shade'],
    ['cx_shade', 'cx_sword', 'cx_zhu'],
    ['cx_guard*', 'cx_shade*', 'cx_sword', 'cx_zhu', 'cx_club'],
  ];
  return [
    ['cx_guard', 'cx_sword', 'cx_zhu', 'cx_club'],
    ['cx_shade', 'cx_guard', 'cx_sword', 'cx_zhu'],
  ];
}

const BOSS_WAVES_N4 = [
  ['cx_guard', 'cx_sword', 'cx_shade', 'cx_zhu'],
  ['nr4_boss', 'cx_guard', 'cx_zhu'],
];

export const NORTH_4: RegionDef = {
  id: 'n4_pass',
  name: '函谷玄台',
  tag: '雄关雪压，棋局终破',
  locales: ['cx_court', 'cx_gallery'],
  bossLocale: 'cx_vault',
  rooms: 5,
  waves: wavesN4,
  bossWaves: BOSS_WAVES_N4,
  boss: 'nr4_boss',
  spec: { season: 'winter', weather: 'snow', time: 'night' },
  music: { fight: 'bgm_elite', boss: 'bgm_boss' },
};
