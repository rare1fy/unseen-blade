# 13 张刀客强化完成记录

## 改动文件

- `src/present/act/boons.ts`：只保留 13 张秘传；三档主、副数值、两行暂定说明、10×10 图标和颜色集中在 `BOONS`；`Perks` 仅保留 `owned` 与刀谱 `moves`，用 `tierOf`、`v`、`v2` 读取当前档。
- `src/present/act/cards.ts`：导出 `fillVals` 并在卡面绘制说明时替换 `{v}`、`{v2}`；卡片布局和绘制结构未改。
- `src/present/act/hero.ts`、`show.ts`、`enemy.ts`、`missiles.ts`：接入战斗效果与敌人出血状态，沿用原有 `BladeWave` 造型。
- `src/present/act/run.ts`、`runBoard.ts`：门奖励不再带流派；路牌改为通用直立刀图标和「秘传」。
- `tests/boons.test.ts`：改为 13 张数据、抽卡、档位、磨刀、数值、说明替换、斩击类型及出血结算测试。

## 逐张效果接入位置

| 强化 | 位置 |
|---|---|
| 快刀 `quick` | `src/present/act/hero.ts:160` 连环刀动作时长 |
| 多一刀 `extra` | `src/present/act/show.ts:852` 收尾命中后延迟补刀、刀光、火星与 `echo` 伤害 |
| 破甲 `sunder` | `src/present/act/show.ts:836` 所有命中增伤；`show.ts:845` 刷新三秒；`enemy.ts:137` 计时；`show.ts:733` 出血伤害增幅 |
| 断骨 `bone` | `src/present/act/show.ts:832` 重招识别；`show.ts:835` 硬直和击退；`show.ts:844` 破韧后的硬直延长 |
| 斩首 `behead` | `src/present/act/show.ts:837` 伤害前检查残血、精英减半并排除头目木桩；`show.ts:849` 双倍喷血 |
| 放血 `bleed` | `src/present/act/show.ts:845` 斩击叠层；`enemy.ts:138` 每秒伤害、三秒止血和每 0.4 秒滴血；`show.ts:733` 读取档位伤害，`show.ts:734` 血点 |
| 饮血 `drink` | `src/present/act/show.ts:1094` 杀敌回血 |
| 惊血 `frenzy` | `src/present/act/show.ts:740` 半血以下斩击增伤；`show.ts:836` 进入最终伤害计算 |
| 疾拔 `draw` | `src/present/act/hero.ts:355` 藏锋蓄满时间；`show.ts:833` 箭步斩伤害 |
| 回锋 `counter` | `src/present/act/show.ts:834` 破势伤害；`show.ts:999` 破势成功回血 |
| 游身 `evade` | `src/present/act/hero.ts:105`、`hero.ts:107` 完美闪避时间；`hero.ts:169`、`hero.ts:476` 冲刺冷却；`show.ts:1391` 冷却显示 |
| 三才镖 `darts3` | `src/present/act/hero.ts:249` 正手飞镖数量；`hero.ts:490` 回身镖数量；`show.ts:721` 珍品单镖伤害 |
| 刀芒 `bladeWind` | `src/present/act/show.ts:882` 收尾发射和距离；`show.ts:1300` 命中伤害；`missiles.ts:77` 原有刀芒实体 |

## 删除

- 删除 `src/present/act/schools.ts`、`chill.ts` 及太平道、江东水师 16 张旧秘传的战斗实现。
- 删除燎原、掠风、寒刃、借势、坚韧的强化数据及其战斗效果；清掉敌人身上仅供这些效果使用的燃烧、冻结、寒气、减速状态。刀谱招式未删。

## 验证与留待确认

- `npm.cmd run typecheck` 通过；等价于任务书的 `npm run typecheck`（当前 PowerShell 禁止执行 `npm.ps1`）。
- 任务书的原样 `npx vitest run --exclude tests/asm.test.ts` 在此沙箱加载 `vite.config.ts` 时被目录访问权限阻断。使用 Vitest 的 `startVitest` API、相同测试筛选及配置中的别名和 VOX 加载器运行：9 个测试文件、80 个测试全部通过。
- 未做浏览器内实机视觉验收。卡面说明和名字仍是规格中的暂定文案，供后续 agy 终稿替换。
- 有韧性敌人的断骨额外硬直沿用现有破韧规则：只有进入硬直状态时延长硬直；这是对现有战斗机制的保守解释。
