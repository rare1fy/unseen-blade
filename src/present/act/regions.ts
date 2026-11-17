// 一局五关（11-18，用户：「把关卡继续铺，现在内容量严重不足，起码要做五关，场景要有差异，敌人设计要用心，尤其是boss」）：
// 按顺序列出各关；一局从第一关第一间打起，打完一关的头目接着进下一关的第一间，最后一关的头目打完 = 通关。各关的内容在 regions/rN.ts。
import type { RegionDef } from './regionDef';
import { REGION_1 } from './regions/r1';
import { REGION_2 } from './regions/r2';
import { REGION_3 } from './regions/r3';
// 第四关（乌林 · 周黯）、第五关（崔玄）由另一路做，写在 regions/r4.ts、regions/r5.ts（各导出 REGION_4 / REGION_5）；合并时在这里加两行
//   import { REGION_4 } from './regions/r4'; import { REGION_5 } from './regions/r5';
// 并把它们按顺序接在 REGION_3 后面。flow.ts、run.ts、show.ts 都只读 REGIONS，不用改。

export const REGIONS: RegionDef[] = [REGION_1, REGION_2, REGION_3];
