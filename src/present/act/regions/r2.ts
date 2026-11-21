// 第二关 · 洛阳余烬（11-18）：董卓焚城西迁后的废都，飞熊军在废墟里熔铜铸钱。两处战斗地点（铜驼道 ly_road、焦梁坊 ly_ward），
// 头目间铸钱场 ly_mint，头目飞熊校尉 · 阎虎（ly_boss）。敌人和打法见 docs/DESIGN.md「第二关、第三关的敌人和头目」；
// 关名、副标题、屋子说明 agy（gemini-3.8-flash-high）写、我挑。'kind*' = 那一种的精英。
import type { RegionDef } from '../regionDef';
import type { RoomType } from '../run';

type Rnd = () => number;
const pick = <T>(a: T[], r: Rnd) => a[Math.floor(r() * a.length) % a.length];
/** the ranks that stand back and shoot / throw, and the ones that close in */
const BACK = ['ly_xbow', 'ly_torch'], FRONT = ['ly_halberd', 'ly_shield'];

/** the waves of a room of region two (depth = room index in the region, 0 = its first room) */
export function waves2(type: RoomType, depth: number, r: Rnd): string[][] {
  if (type === 'boss') return BOSS_WAVES_2.map(w => [...w]);
  if (type === 'elite') {
    const head = pick(['ly_halberd', 'ly_shield', 'ly_rider', 'ly_xbow', 'ly_torch'], r) + '*';
    return [
      [head, pick(BACK, r), pick(FRONT, r), 'ly_looter'],
      [depth >= 2 ? pick(FRONT, r) + '*' : 'ly_shield', 'ly_rider', pick(BACK, r), 'ly_halberd'],
    ];
  }
  if (type !== 'fight') return [];
  // act-122: structured combined-arms pairings (shield/halberd anchor + ranged crossfire + cavalry) instead of 3x looter clumps
  if (depth === 0) return [
    ['ly_halberd', 'ly_xbow', 'ly_looter', 'ly_looter'],
    ['ly_shield', 'ly_halberd', 'ly_torch', 'ly_looter'],
  ];
  if (depth === 1) return [
    ['ly_shield', 'ly_xbow', 'ly_torch', 'ly_looter'],
    ['ly_rider', 'ly_halberd', 'ly_xbow', 'ly_looter'],
  ];
  const w1 = [pick(FRONT, r), pick(FRONT, r), pick(BACK, r), 'ly_rider', 'ly_looter'];
  const w2 = [depth >= 3 ? pick(['ly_halberd', 'ly_shield', 'ly_rider'], r) + '*' : pick(FRONT, r), pick(BACK, r), 'ly_rider', pick(['ly_torch', 'ly_xbow'], r), 'ly_looter'];
  if (depth >= 5) {
    const w3 = [pick(['ly_shield', 'ly_halberd'], r) + '*', 'ly_rider', 'ly_xbow', 'ly_torch'];
    return [w1, w2, w3];
  }
  return [w1, w2];
}
/** 铸钱场: his guard first (a wall of shields, the crossbows & torch behind), then 阎虎 with two looters */
const BOSS_WAVES_2 = [['ly_shield', 'ly_halberd', 'ly_xbow', 'ly_torch', 'ly_looter'], ['ly_boss', 'ly_looter', 'ly_looter']];

export const REGION_2: RegionDef = {
  id: 'r2_luoyang', name: '洛阳余烬', tag: '焦柱生烟，烈火铸钱',
  locales: ['ly_road', 'ly_ward'], bossLocale: 'ly_mint', rooms: 7,
  waves: waves2, bossWaves: BOSS_WAVES_2, boss: 'ly_boss',
  // a burned city: dusk and night, the fires the light; no snow
  spec: { season: 'autumn' },
  music: { fight: 'bgm_battle', boss: 'bgm_boss' },
};
