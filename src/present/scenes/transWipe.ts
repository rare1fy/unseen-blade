// 统一转场（PC / 网页 / 微信全平台一致）：统一走 3D 甩刀扎竹帘转场（loadingBlade.ts）。
// 九根立体竹子从上砸落、环首刀自左下透视飞入扎进前排竹竿并震出竹屑与物理红穗摆动，后台完成切场与着色器预热后拔刀甩出、竹帘分批倒开。
import { bladeBusy, withLoadingBlade } from './loadingBlade';
import type { WipeLook } from './wipeCover';

export type { WipeLook } from './wipeCover';
export const WIPE = { look: 'bamboo' as WipeLook };

/** Unified 3D flying-blade + bamboo curtain transition across PC, web, and WeChat mini-game. */
export async function wipeTransit(swap: () => void | Promise<void>) {
  if (bladeBusy()) {
    try { await swap(); } catch (e) { console.error('[wipe] swap failed', e); }
    return;
  }
  await withLoadingBlade(async () => {
    try { await swap(); } catch (e) { console.error('[wipe] swap failed', e); }
  }, WIPE.look);
}
