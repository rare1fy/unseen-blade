// 第二关 · 洛阳余烬（11-18）的地点：铜驼道 ly_road（烧塌的宫门御道）、焦梁坊 ly_ward（烧光的里坊）、铸钱场 ly_mint（头目间，宫前空场
// 改的熔铜场）。每个地点一个文件（可带 <id>_*.ts 子文件）；这里只登记。设计见 docs/DESIGN.md「第二关、第三关的敌人和头目」。
// 风格：横平竖直的大块体，不许斜线阶梯和逐格随机碎点。材质和黄巾残村拉开：烧黑的方砖和灰烬、烧裂的宫墙（朱漆剥落露夯土）、
// 焦黑木、铜绿、铁水的橙；火光是主光源；空中飘灰和火星，不飘叶子。
import type { Locale } from '../types';
import './arena_palace';
import { lyRoad } from './ly_road';
import { lyWard } from './ly_ward';
import { lyMint } from './ly_mint';

export const LUOYANG_LOCALES: Locale[] = [lyRoad, lyWard, lyMint];
