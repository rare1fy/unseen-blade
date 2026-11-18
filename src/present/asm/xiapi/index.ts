// 第三关 · 下邳寒沼（11-18）的地点：浮栈巷 xp_lane（积水的街巷）、湿马道 xp_wall（城墙下的马道）、白门楼 xp_gate（头目间）。
// 每个地点一个文件（可带 <id>_*.ts 子文件）；这里只登记。设计见 docs/DESIGN.md「第二关、第三关的敌人和头目」。
// 风格：横平竖直的大块体，不许斜线阶梯和逐格随机碎点。冷、灰蓝、湿：泡水的青石板、一片片浅积水、木栈道、沙袋墙、白灰墙黑瓦；
// 固定冬天，雾 / 雪 / 阴，火光很少（零星火盆）。和第二关的焦黑火红正相反。
import type { Locale } from '../types';
import './arena_sandbag';
import { xpLane } from './xp_lane';
import { xpWall } from './xp_wall';
import { xpGate } from './xp_gate';

export const XIAPI_LOCALES: Locale[] = [xpLane, xpWall, xpGate];
