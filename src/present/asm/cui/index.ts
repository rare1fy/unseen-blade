// 第五关 · 许都雪（崔府深宅）的地点（wp/regB）：覆雪前庭、穿堂曲廊（战斗）、藏刀阁（头目）。这里登记，并告诉 arena.ts 每个地点的
// 战斗区长什么样（白粉墙黑瓦、影壁 / 假山石 / 石缸；没有黄巾旗，灯多）。
import type { Locale } from '../types';
import { ARENA_LOOK } from '../arena';
import { cxCourt, cxGallery } from './cx_courts';
import { cxVault } from './cx_vault';

ARENA_LOOK.cx_court = { style: 'plaster', covers: ['screen', 'basin', 'rockery'], smalls: ['pot', 'crate', 'basket', 'pot'], banners: 0, lamps: 4, oil: 1, pillars: 1, fences: 1, racks: 2 };
ARENA_LOOK.cx_gallery = { style: 'plaster', covers: ['rockery', 'basin', 'rockery'], smalls: ['pot', 'basket', 'pot'], banners: 0, lamps: 4, oil: 0, pillars: 2, fences: 2, racks: 1 };
ARENA_LOOK.cx_vault = { style: 'plaster', covers: ['basin', 'screen'], smalls: ['pot', 'crate'], banners: 0, lamps: 4, oil: 1, pillars: 2, fences: 0, racks: 3 };

export const CUI_LOCALES: Locale[] = [cxCourt, cxGallery, cxVault];
