// 第五关 · 许都雪（崔府深宅）的地点（wp/regB）：覆雪前庭、穿堂曲廊（战斗）、藏刀阁（头目）。这里登记，并告诉 arena.ts 每个地点的
// 战斗区长什么样（白粉墙黑瓦、影壁 / 假山石 / 石缸；没有黄巾旗，灯多）。
import type { Locale } from '../types';
import { ARENA_LOOK } from '../arena';
import { cxCourt } from './cx_courts';
import { cxGallery } from './cx_gallery';
import { cxVault } from './cx_vault';

ARENA_LOOK.cx_court = { style: 'plaster', covers: ['basin', 'rockery'], smalls: ['pot', 'crate', 'basket'], banners: 0, lamps: 0, oil: 1, pillars: 0, fences: 0, racks: 0 };
ARENA_LOOK.cx_gallery = { style: 'rail', covers: ['rockery'], smalls: ['pot', 'basket'], banners: 0, lamps: 0, oil: 0, pillars: 0, fences: 0, racks: 0 };
ARENA_LOOK.cx_vault = { style: 'rail', covers: ['vaultChest'], smalls: ['pot', 'crate'], banners: 0, lamps: 0, oil: 1, pillars: 0, fences: 0, racks: 0 };

export const CUI_LOCALES: Locale[] = [cxCourt, cxGallery, cxVault];
