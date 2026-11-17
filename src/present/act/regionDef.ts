// 关卡（地域）的定义（11-18，用户：「把关卡继续铺，现在内容量严重不足，起码要做五关，场景要有差异，敌人设计要用心，尤其是boss」）。
// 一局 = 五关依次打下去，每关几间屋 + 一个头目；一关一个文件（regions/r2.ts …）导出一个 RegionDef，regions.ts 按顺序收进 REGIONS。
// 第一关 = 现在的黄巾残村（褚雷 / 渠帅）。这个文件只放类型，各关的内容在自己的文件里，便于几路并行做、最后合并不冲突。
import type { RoomType } from './run';
import type { Spec } from '../asm/types';

export interface RegionDef {
  /** 'r1_huangjin' / 'r2_luoyang' / 'r3_xiapi' / 'r4_wulin' / 'r5_cui' */
  id: string;
  /** 关名（玩家看得到，agy 写） */
  name: string;
  /** 横幅副标题（agy 写，可空） */
  tag?: string;
  /** 战斗 / 死士房用的地点（src/present/asm 注册的 locale id，一关至少两处、互相有差异） */
  locales: string[];
  /** 头目房的地点 */
  bossLocale: string;
  /** 这一关的屋子数（不含头目房） */
  rooms: number;
  /** 某类屋子第 depth 间（0 起）的波次：每波一组敌人 kind（'kind*' = 精英） */
  waves(type: RoomType, depth: number, r: () => number): string[][];
  /** 头目房的波次（头目所在那一波放最后） */
  bossWaves: string[][];
  /** 头目的 kind（EDEFS 里 boss: true 的那个） */
  boss: string;
  /** 天气 / 时段等的默认取值（拼场景时传给 pickSpec） */
  spec?: Partial<Spec>;
  /** 背景音乐（用现有曲目，不加新曲：bgm_battle / bgm_elite / bgm_boss / bgm_lostfight …） */
  music?: { fight: string; boss: string };
}
