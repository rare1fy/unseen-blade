# Codex 任务：13 张刀客强化替换旧秘传（不见刀，act-36）

工作区：本目录（分支 `cx/boons12`，基于 main 的 act-35）。不要提交（沙箱写不了 .git），改完留在工作区，我来审、提交、合并。全程中文注释可以，代码风格照现有文件（长行、紧凑）。

## 要做的

1. **读 `docs/boons12.md`**：13 张强化的 id、暂定名字、三档数值。名字和说明文字先照表里的暂定写（我会用 agy 写的终稿替换，你把每张的 `name` 和两行 `desc` 放在 `src/present/act/boons.ts` 的 BOONS 数组里，方便我改）。说明里数值用 `{v}` 占位，`vals: [凡, 珍, 绝]`；卡面文字替换 `{v}` 的地方在 `src/present/act/cards.ts`（找现在怎么画 desc，加一个 `fillVals(desc, boon, tier)`：把 `{v}` 换成该档数值，百分数带 `%`，秒带「秒」，按表里的单位；导出它供别处用）。
2. **`src/present/act/boons.ts`**：BOONS 只留这 13 张；`School` 类型和 `SCHOOL_NAMES` 只留 `'sr'`（或干脆去掉 school 概念，但 cards.ts / run.ts / runBoard.ts / show.ts 里所有用到的地方都要跟着改，typecheck 必须过）；`Perks` 改成能表达 13 张的效果（建议：保留 `owned: Record<id, tier>`，效果处用一个 `tierOf(p, id)` 读档位，`v(p, id)` 读当前档数值，不再用一堆布尔字段；`moves` 刀谱字段不动）；`applyBoon` / `upgradeBoon` / `drawBoons` 跟着改（drawBoons 的 pool 参数可以只剩 'any'）；`returnCard` 里用到的 glyph 换成新列表里存在的。每张给一个 10×10 的 `glyph`（'#' 主色、'o' 点缀、'.' 空；横平竖直、不要斜线阶梯——用户最讨厌斜向锯齿，刀用竖直或水平的造型）和 `col`（偏刀、铁、血的颜色：钢灰、暗红、铜、骨白，别用雷黄冰蓝）。
3. **效果接进战斗**（`src/present/act/show.ts` 的 `hitFoe`、`dmgMul`、杀敌处、完美闪避处、破势处；`src/present/act/hero.ts` 的出刀速度、藏锋蓄力时间、冲刺冷却、完美闪避判定；飞镖在 show.ts / missiles.ts）：按 `docs/boons12.md` 的表逐张实现。命中类型 `o.kind`：连环刀 'k1'…'k5'，箭步斩 'rel'，劈山 'plunge'，挑云 'launch'，破势 'parry'，飞镖 'dart'，其它（'school'、'wall'、'prop'…）不算斩击。精英判断看敌人现有的 elite 标记，头目 `isBoss(f)`，木人桩 `f.kind === 'dummy'`。
   - 放血：敌人身上加 `bleed`（层数）和 `bleedT`（距上次被斩的时间），在敌人更新处每秒结算；滴血用 `blood.ts` 已有的接口（找 `blood.` 的用法）。
   - 多一刀：k5 命中后 `after(0.12, …)` 对同一批活着的敌人补伤害，补一道刀光（用现有的斩击特效函数，找 fxImpact / 刀光拖尾的用法，别新造特效系统），伤害走 hitFoe 但 kind 用一个新值 'echo'（不再触发多一刀，算斩击）。
   - 斩首：先算伤害前判定，满足就把伤害设为敌人剩余血量 + 1，血喷量翻倍（blood.spray 的数量参数）。
4. **拿掉旧的**：太平道 / 江东水师 16 张的效果代码（`src/present/act/schools.ts`、`chill.ts`）——如果删掉后 show.ts 还有引用就一起清掉；燎原、掠风、寒刃、借势、坚韧的效果代码一起删；**刀芒保留**（`BladeWave` 不删，按表加档位）。冻结（frozen）如果只被这些用到也删；被别的（比如敌人自身机制）用到就留着。
5. **一局的规划和路牌**：`src/present/act/run.ts` 里门的奖励「某派秘传」改成不分派的「秘传」；`src/present/act/runBoard.ts` 的流派记号（雷 / 寒 / 散）换成一个通用的刀形小图标（用 runBoard 里已有的 icon(…) 画，10×10 横平竖直），说明行写「秘传」。
6. **测试**：`tests/boons.test.ts` 按新列表重写（抽卡不重复、档位 0–2、磨刀升档、每张效果的数值读对、fillVals 替换正确）；`npm run typecheck` 和 `npx vitest run --exclude tests/asm.test.ts` 必须全过。
7. 最后在 `docs/codex_boons12_done.md` 里写：改了哪些文件、每张效果接在哪里（文件:行）、删了什么、有什么没做到或拿不准的。

## 不要做的

- 不要改卡片的样子（cards.ts 的绘制我另做 3D 卡），只加 `fillVals` 和把 school 相关的引用改对。
- 不要动 `vox/`、`src/assets/`、`docs/对白/`、CLAUDE.md。
- 不要加新的依赖。
