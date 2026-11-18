// 第四关 · 锁江（乌林曹军水寨）的地点（wp/regB）：横江浮栈、乌林辕门（战斗）、督造高阁（头目）。这里登记，并告诉 arena.ts 每个地点的
// 战斗区长什么样（墙、掩体、小物件；没有黄巾旗）。
import type { Locale } from '../types';
import { ARENA_LOOK } from '../arena';
import { wlDock } from './wl_dock';
import { wlCamp } from './wl_camp';
import { wlTower } from './wl_tower';

ARENA_LOOK.wl_dock = { style: 'rail', covers: ['bollard', 'chains', 'barrels'], smalls: ['crate', 'oil', 'sack', 'crate'], banners: 0, lamps: 3, oil: 3, pillars: 1, fences: 2, racks: 1 };
ARENA_LOOK.wl_camp = { style: 'stockade', covers: ['barrels', 'chains', 'cart', 'stones'], smalls: ['crate', 'sack', 'hay', 'pot', 'basket'], banners: 0, lamps: 2, fences: 3, racks: 2 };
ARENA_LOOK.wl_tower = { style: 'rail', covers: ['chains', 'barrels'], smalls: ['crate', 'oil', 'crate'], banners: 0, lamps: 2, oil: 4, pillars: 0, fences: 1, racks: 2 };

export const WULIN_LOCALES: Locale[] = [wlDock, wlCamp, wlTower];
