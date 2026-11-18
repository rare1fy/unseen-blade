// 第四关 · 锁江（wp/regB）：建安十三年冬，乌林曹军水寨，名单最后一人周黯。关名、副标题、地点、敌人名、头目横幅和台词 agy 写。
// 打法和招式表见 docs/DESIGN.md「第四关、第五关的敌人和头目」。难度在第三关之上：每波人更多、精英从第二间起就有、头目两阶段。
import type { RegionDef } from '../regionDef';
import type { RoomType } from '../run';
import '../foes/r45_ai';

const pick = <T>(a: T[], r: () => number) => a[Math.floor(r() * a.length) % a.length];
/** the ranged / tricky ones a wave mixes in (the spearmen are the crowd) */
const MID = ['wl_chain', 'wl_oil', 'wl_xbow', 'wl_diver'];

export const REGION_4: RegionDef = {
  id: 'r4_wulin', name: '锁江', tag: '铁索连环，一江火',
  locales: ['wl_dock', 'wl_camp'], bossLocale: 'wl_tower', rooms: 5,
  waves(type: RoomType, depth: number, r: () => number): string[][] {
    if (type === 'elite') {
      const head = pick(['wl_chain', 'wl_shield', 'wl_xbow', 'wl_diver'], r) + '*';
      return [[head, 'wl_spear', 'wl_spear', 'wl_spear', pick(MID, r)], ['wl_shield', pick(MID, r), pick(MID, r), 'wl_spear', 'wl_spear', ...(depth >= 3 ? [pick(MID, r) + '*'] : [])]];
    }
    if (type !== 'fight') return [];
    if (depth === 0) return [['wl_spear', 'wl_spear', 'wl_spear', 'wl_chain'], ['wl_spear', 'wl_spear', 'wl_oil', 'wl_xbow', 'wl_chain']];
    const w1 = ['wl_spear', 'wl_spear', 'wl_spear', pick(MID, r), pick(MID, r), ...(depth >= 2 ? ['wl_shield'] : [])];
    const w2 = ['wl_spear', 'wl_spear', 'wl_xbow', 'wl_xbow', pick(MID, r), pick(['wl_shield', 'wl_diver'], r), ...(depth >= 2 ? [pick(MID, r) + '*'] : []), ...(depth >= 3 ? ['wl_shield'] : [])];
    return [w1, w2];
  },
  // the deck's guard first, then 周黯 with his crew (he calls his shield-bearers in himself)
  bossWaves: [['wl_spear', 'wl_spear', 'wl_spear', 'wl_xbow', 'wl_chain', 'wl_oil'], ['wl_boss', 'wl_spear', 'wl_spear']],
  boss: 'wl_boss',
  // a night on the river: the fires on the water are the light. (The season only tints the light here: 'spring' because 'winter'
  // snows on the decks — the snow is region five's — and 'autumn' drops maple leaves, which read Japanese.)
  spec: { season: 'spring', time: 'night', weather: 'clear' },
  music: { fight: 'bgm_battle', boss: 'bgm_boss' },
};
