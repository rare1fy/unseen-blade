// 第五关 · 许都雪（wp/regB）：终局。许都崔府深宅的雪夜，名单背后下令灭门的崔玄（洛阳崔氏家主、司空府长史）。agy 写关名、台词。
// 打法和招式表见 docs/DESIGN.md「第四关、第五关的敌人和头目」。最难的一关：每波人最多、精英最多、头目三阶段。
import type { RegionDef } from '../regionDef';
import type { RoomType } from '../run';
import '../foes/r45_ai';

const pick = <T>(a: T[], r: () => number) => a[Math.floor(r() * a.length) % a.length];
const MID = ['cx_sword', 'cx_shade', 'cx_guard', 'cx_zhu'];

export const REGION_5: RegionDef = {
  id: 'r5_cui', name: '许都雪', tag: '深宅落子，听刀鸣',
  locales: ['cx_court', 'cx_gallery'], bossLocale: 'cx_vault', rooms: 5,
  waves(type: RoomType, depth: number, r: () => number): string[][] {
    if (type === 'elite') {
      const head = pick(['cx_sword', 'cx_shade', 'cx_guard', 'cx_zhu'], r) + '*';
      return [
        [head, 'cx_zhu', 'cx_sword', 'cx_club', 'cx_club'],
        [depth >= 2 ? 'cx_guard*' : 'cx_guard', pick(MID, r), 'cx_shade', 'cx_sword'],
      ];
    }
    if (type !== 'fight') return [];
    // act-122: elite manor duels (guard/sword riposte + zither interference + shade ambushes) instead of 4x club swarms
    if (depth === 0) return [
      ['cx_sword', 'cx_zhu', 'cx_club', 'cx_club'],
      ['cx_guard', 'cx_shade', 'cx_sword', 'cx_club', 'cx_club'],
    ];
    if (depth === 1) return [
      ['cx_guard', 'cx_zhu', 'cx_sword', 'cx_club', 'cx_club'],
      ['cx_shade', 'cx_guard', 'cx_sword', 'cx_zhu', 'cx_club'],
    ];
    const w1 = ['cx_guard', 'cx_sword', pick(MID, r), 'cx_club', 'cx_club'];
    const w2 = [pick(MID, r) + '*', 'cx_zhu', 'cx_guard', 'cx_shade', ...(depth >= 3 ? ['cx_sword*'] : ['cx_sword'])];
    return [w1, w2];
  },
  // his household first (the guard, swordsmen and zither player), then 崔玄 alone (he calls the rest himself)
  bossWaves: [['cx_guard', 'cx_sword', 'cx_sword', 'cx_zhu', 'cx_club'], ['cx_boss']],
  boss: 'cx_boss',
  // the snowy night (act-36's light: deep indigo, cold moon, the bronze lamps the only warmth)
  spec: { season: 'winter', time: 'night', weather: 'snow' },
  music: { fight: 'bgm_elite', boss: 'bgm_boss' },
};
