// 一局五关（11-18，用户：「把关卡继续铺，现在内容量严重不足，起码要做五关，场景要有差异，敌人设计要用心，尤其是boss」）：
// 按顺序列出各关；一局从第一关第一间打起，打完一关的头目接着进下一关的第一间，最后一关的头目打完 = 通关。各关的内容在 regions/rN.ts。
import type { RegionDef, RouteId } from './regionDef';
import { REGION_1 } from './regions/r1';
import { REGION_2 } from './regions/r2';
import { REGION_3 } from './regions/r3';
import { REGION_4 } from './regions/r4';   // 第四关 · 锁江（乌林 · 周黯，wp/regB）
import { REGION_5 } from './regions/r5';   // 第五关 · 许都雪（崔府 · 崔玄，wp/regB）
import { NORTH_1 } from './regions/n1';    // 北道一关 · 荒驿官道（厉锋）
import { NORTH_2 } from './regions/n2';    // 北道二关 · 毒雾药坞（殷毒 · 杜五弧光高潮）
import { NORTH_3 } from './regions/n3';    // 北道三关 · 铁甲军寨（铁镇）
import { NORTH_4 } from './regions/n4';    // 北道四关 · 函谷玄台（谢渊 · 幕后执棋）
// flow.ts、run.ts、show.ts 默认读南门讨债旧道 REGIONS，北出官道读 NORTH_REGIONS（经 regionsFor(route) 统一寻址）。

export const REGIONS: RegionDef[] = [REGION_1, REGION_2, REGION_3, REGION_4, REGION_5];
export const NORTH_REGIONS: RegionDef[] = [NORTH_1, NORTH_2, NORTH_3, NORTH_4];
export const regionsFor = (route: RouteId = 'south'): RegionDef[] => (route === 'north' ? NORTH_REGIONS : REGIONS);
