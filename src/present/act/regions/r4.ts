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
  locales: ['wl_dock', 'wl_camp'], bossLocale: 'wl_tower', rooms: 7,
  waves(type: RoomType, depth: number, r: () => number): string[][] {
    if (type === 'elite') {
      const head = pick(['wl_chain', 'wl_shield', 'wl_xbow', 'wl_diver'], r) + '*';
      return [
        [head, 'wl_shield', pick(MID, r), 'wl_spear', 'wl_spear'],
        [depth >= 2 ? pick(MID, r) + '*' : 'wl_shield', pick(MID, r), 'wl_xbow', 'wl_oil', 'wl_spear'],
      ];
    }
    if (type !== 'fight') return [];
    // act-122: deck-warfare tactical pairings (shield anchor + chain/oil/xbow/diver specialists) instead of 3x spearman clumps
    if (depth === 0) return [
      ['wl_shield', 'wl_chain', 'wl_spear', 'wl_spear'],
      ['wl_oil', 'wl_xbow', 'wl_chain', 'wl_diver', 'wl_spear'],
    ];
    if (depth === 1) return [
      ['wl_shield', 'wl_xbow', 'wl_oil', 'wl_spear', 'wl_spear'],
      ['wl_diver', 'wl_chain', 'wl_xbow', 'wl_shield', 'wl_spear'],
    ];
    const w1 = ['wl_shield', pick(MID, r), pick(MID, r), 'wl_spear', 'wl_spear'];
    const w2 = [pick(MID, r) + '*', 'wl_shield', 'wl_xbow', pick(['wl_oil', 'wl_diver', 'wl_chain'], r), ...(depth >= 3 ? ['wl_xbow'] : ['wl_spear'])];
    if (depth >= 5) {
      const w3 = ['wl_shield*', pick(MID, r), 'wl_xbow', 'wl_oil'];
      return [w1, w2, w3];
    }
    return [w1, w2];
  },
  // the deck's guard first, then 周黯 with his crew (he calls his shield-bearers in himself)
  bossWaves: [['wl_shield', 'wl_xbow', 'wl_chain', 'wl_oil', 'wl_spear'], ['wl_boss', 'wl_spear', 'wl_spear']],
  boss: 'wl_boss',
  // a night on the river: the fires on the water are the light. (The season only tints the light here: 'spring' because 'winter'
  // snows on the decks — the snow is region five's — and 'autumn' drops maple leaves, which read Japanese.)
  spec: { season: 'spring', time: 'night', weather: 'clear' },
  music: { fight: 'bgm_battle', boss: 'bgm_boss' },
};
