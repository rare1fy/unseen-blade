// 北道第二关 · 毒雾药坞（残垣药田、活人试药炼丹死士、杜五寻踪线索 #2 与真正诀别高潮）
import type { RegionDef } from '../regionDef';
import type { RoomType } from '../run';
import './northFoes';

type Rnd = () => number;
const pick = <T>(a: T[], r: Rnd) => a[Math.floor(r() * a.length) % a.length];
const FAR = ['xp_needle', 'xp_frost'], NEAR = ['xp_assassin', 'xp_chain', 'xp_diver'];

export function wavesN2(type: RoomType, depth: number, r: Rnd): string[][] {
  if (type === 'boss') return BOSS_WAVES_N2.map(w => [...w]);
  if (type === 'elite') {
    const head = pick(['xp_assassin', 'xp_chain', 'xp_frost'], r) + '*';
    return [
      [head, pick(FAR, r), pick(NEAR, r), 'xp_conscript'],
      [depth >= 2 ? pick(FAR, r) + '*' : 'xp_chain', 'xp_assassin', 'xp_diver', pick(FAR, r)],
    ];
  }
  if (type !== 'fight') return [];
  if (depth === 0) return [
    ['xp_chain', 'xp_needle', 'xp_conscript', 'xp_conscript'],
    ['xp_assassin', 'xp_frost', 'xp_diver', 'xp_conscript'],
  ];
  if (depth >= 3) return [
    ['xp_chain', 'xp_diver', pick(FAR, r), 'xp_conscript'],
    ['xp_assassin', 'xp_needle', 'xp_frost'],
    [pick(['xp_chain', 'xp_assassin'], r) + '*', 'xp_diver', 'xp_frost', 'xp_needle', 'xp_conscript'],
  ];
  return [
    [pick(NEAR, r), 'xp_chain', pick(FAR, r), 'xp_conscript'],
    ['xp_assassin', 'xp_diver', 'xp_frost', 'xp_needle', 'xp_conscript'],
  ];
}

const BOSS_WAVES_N2 = [
  ['xp_chain', 'xp_needle', 'xp_frost', 'xp_assassin'],
  ['nr2_boss', 'xp_assassin', 'xp_frost'],
];

export const NORTH_2: RegionDef = {
  id: 'n2_valley',
  name: '毒雾药坞',
  tag: '残垣药田，百草成毒',
  locales: ['xp_lane', 'xp_wall'],
  bossLocale: 'xp_gate',
  rooms: 5,
  waves: wavesN2,
  bossWaves: BOSS_WAVES_N2,
  boss: 'nr2_boss',
  spec: { season: 'winter', weather: 'mist' },
  music: { fight: 'bgm_battle', boss: 'bgm_boss' },
};
