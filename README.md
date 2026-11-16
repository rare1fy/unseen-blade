# 不见刀 · unseen-blade

三国乱世，一个蒙着眼的刀客。俯视角即时动作肉鸽（类《哈迪斯》），一间一间屋子打过去。电脑和手机横屏都能玩，three.js 体素 + 像素风。个人原型项目。

- **操作**：WASD 移动；J 斩——点按出刀（五段连斩），按住入鞘、松手抽刀，敌人的刀落下那一瞬松手 = 见切；空格跳，空中再按二段跳，空中按斩下劈；K / Shift 冲刺（冲刺中躲过攻击 = 完美闪避）；L / E 影分身。手柄、触屏同样支持。杀意攒满三格后，下一次完美闪避或见切会触发「一刀」。
- **运行**：`npm install`，`npm run dev`（http://127.0.0.1:5237）；`npm run build` 出单文件 `dist/index.html`；`npm test` 单测。右上「调」或 ` 键打开调参面板。
- **设计**：`docs/DESIGN.md`（每一轮的改动和原因）、`docs/GAME_PLAN.md`（整体设计草案）。

字体：「长坂点宋 12」（[yzdnn/ChangBanDianSong-12](https://github.com/yzdnn/ChangBanDianSong-12)，SIL OFL 1.1）为主，缺字用缝合像素体（[TakWolf/fusion-pixel-font](https://github.com/TakWolf/fusion-pixel-font)，SIL OFL 1.1），许可见 `fonts/`。
