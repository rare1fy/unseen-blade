// 第三关 · 下邳寒沼（11-18）：曹操水淹下邳，冬天、寒雾。两处战斗地点（浮栈巷 xp_lane、湿马道 xp_wall），头目间白门楼 xp_gate，
// 头目截指鬼医 · 封鸩（xp_boss）。敌人和打法见 docs/DESIGN.md「第二关、第三关的敌人和头目」；关名、副标题 agy 写、我挑。
import type { RegionDef } from '../regionDef';
import type { RoomType } from '../run';

type Rnd = () => number;
const pick = <T>(a: T[], r: Rnd) => a[Math.floor(r() * a.length) % a.length];
/** the ones that hold you off from afar (needles, frost), and the ones that come at you */
const FAR = ['xp_needle', 'xp_frost'], NEAR = ['xp_assassin', 'xp_chain', 'xp_diver'];

/** the waves of a room of region three (depth = room index in the region) */
export function waves3(type: RoomType, depth: number, r: Rnd): string[][] {
  if (type === 'boss') return BOSS_WAVES_3.map(w => [...w]);
  if (type === 'elite') {
    const head = pick(['xp_assassin', 'xp_chain', 'xp_diver', 'xp_needle', 'xp_frost'], r) + '*';
    return [
      [head, pick(FAR, r), pick(NEAR, r), 'xp_conscript'],
      [depth >= 2 ? pick(FAR, r) + '*' : 'xp_chain', 'xp_assassin', pick(['xp_chain', 'xp_diver'], r), pick(FAR, r)],
    ];
  }
  if (type !== 'fight') return [];
  // act-122: ambush + frost/needle control pairings instead of 3x conscript blobs
  if (depth === 0) return [
    ['xp_diver', 'xp_needle', 'xp_conscript', 'xp_conscript'],
    ['xp_assassin', 'xp_frost', 'xp_diver', 'xp_conscript'],
  ];
  if (depth === 1) return [
    ['xp_chain', 'xp_needle', 'xp_conscript', 'xp_conscript'],
    ['xp_assassin', 'xp_diver', 'xp_frost', 'xp_needle'],
  ];
  const w1 = [pick(NEAR, r), 'xp_chain', pick(FAR, r), 'xp_conscript', 'xp_conscript'];
  const w2 = [depth >= 3 ? pick(['xp_assassin', 'xp_chain', 'xp_diver'], r) + '*' : pick(NEAR, r), pick(NEAR, r), pick(FAR, r), pick(FAR, r), 'xp_conscript'];
  return [w1, w2];
}
/** 白门楼: the jailers and the needles first, then 封鸩 with an assassin & conscript */
const BOSS_WAVES_3 = [['xp_chain', 'xp_needle', 'xp_frost', 'xp_diver', 'xp_conscript'], ['xp_boss', 'xp_assassin', 'xp_conscript']];

export const REGION_3: RegionDef = {
  id: 'r3_xiapi', name: '下邳寒沼', tag: '泗水灌城，冬雾浸骨',
  locales: ['xp_lane', 'xp_wall'], bossLocale: 'xp_gate', rooms: 5,
  waves: waves3, bossWaves: BOSS_WAVES_3, boss: 'xp_boss',
  // always winter; the weather from the places' own list (mist / snow / clear)
  spec: { season: 'winter' },
  music: { fight: 'bgm_battle', boss: 'bgm_boss' },
};
