// 北道第三关 · 铁甲军寨（军阀屯兵与寒山坞百辟刀流向之源）
import type { RegionDef } from '../regionDef';
import type { RoomType } from '../run';
import './northFoes';

type Rnd = () => number;
const pick = <T>(a: T[], r: Rnd) => a[Math.floor(r() * a.length) % a.length];

export function wavesN3(type: RoomType, depth: number, r: Rnd): string[][] {
  if (type === 'boss') return BOSS_WAVES_N3.map(w => [...w]);
  if (type === 'elite') {
    const head = pick(['wl_shield', 'ly_shield', 'cx_guard'], r) + '*';
    return [
      [head, 'wl_xbow', 'ly_torch', 'wl_chain'],
      [depth >= 2 ? 'cx_guard*' : 'wl_shield', 'ly_xbow', 'wl_oil', 'wl_spear'],
    ];
  }
  if (type !== 'fight') return [];
  if (depth === 0) return [
    ['wl_shield', 'wl_xbow', 'wl_spear', 'wl_spear'],
    ['ly_shield', 'ly_torch', 'wl_chain', 'wl_xbow'],
  ];
  if (depth >= 3) return [
    ['wl_shield', 'wl_chain', 'wl_xbow', 'wl_spear'],
    ['cx_guard', 'ly_torch', 'wl_oil'],
    ['wl_shield*', 'cx_guard', 'wl_xbow', 'ly_torch', 'wl_chain'],
  ];
  return [
    ['wl_shield', 'ly_torch', 'wl_xbow', 'wl_spear'],
    ['cx_guard', 'wl_chain', 'wl_oil', 'wl_xbow'],
  ];
}

const BOSS_WAVES_N3 = [
  ['wl_shield', 'wl_xbow', 'ly_torch', 'wl_chain'],
  ['nr3_boss', 'wl_shield', 'wl_xbow'],
];

export const NORTH_3: RegionDef = {
  id: 'n3_camp',
  name: '铁甲军寨',
  tag: '旌旗遮日，寒刃铸兵',
  locales: ['ly_street', 'ly_ruins'],
  bossLocale: 'ly_mint',
  rooms: 5,
  waves: wavesN3,
  bossWaves: BOSS_WAVES_N3,
  boss: 'nr3_boss',
  spec: { season: 'autumn', time: 'night' },
  music: { fight: 'bgm_elite', boss: 'bgm_boss' },
};
