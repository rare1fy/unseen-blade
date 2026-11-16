import type { VoxWorld } from '../look/voxkit';
// 仅战斗实例调用：青色环境光退让给 HUD，近景及右侧操作带不保留发光装饰。
export function quietBattleGlow(w: VoxWorld) {
  for (const [key, cell] of w.cells) {
    if (!cell.g) continue;
    const r=(cell.c>>>16)&255,g=(cell.c>>>8)&255,b=cell.c&255;
    if (g<r*1.2 || b<r*1.2) continue;
    const z=((key%1024)-512)*w.s, x=(Math.floor(key/1048576)-512)*w.s;
    if(z>-0.5 || (x>4 && z>-5)) { cell.g=0; cell.c=0x294b49; }
    else cell.c=b>g ? 0x7582bb : 0x429b7e;
  }
}
