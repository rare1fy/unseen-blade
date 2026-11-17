// 季节：调色板（树冠、地面苔草、樱花）按季节取色，冬天再做一遍「积雪」：每一根露天的格子柱，最上面那个格子如果是水平面朝上，
// 就在上面盖一层雪（屋顶、灯笼帽、石头顶、树冠顶），地面除走道外也染白。雪只加在柱子顶上，所以不会出现悬空和噪点。
import { CELL } from '../bestiary/kit';
import { plot, tone } from '../scenes/flora';
import type { Ctx } from '../scenes/stage';
import type { Rect, SeasonId } from './types';

export const SNOW = 0xc8d0dc, SNOW_D = 0xaeb6c4;
/** trodden snow on walkways: the path's own colour pulled most of the way to snow, so the path still reads but is not a bare patch */
const trodden = (c: number) => { const f = (sh: number) => Math.round(((c >> sh) & 255) * 0.35 + ((0x9ea6b2 >> sh) & 255) * 0.65); return (f(16) << 16) | (f(8) << 8) | f(0); };
/** foliage colours by season: [body, top] — the generic broadleaf (maple-type trees use MAPLE_BY) */
export const LEAF_BY: Record<SeasonId, [number, number]> = { spring: [0x4e7a3a, 0x7aa856], summer: [0x2e5a2a, 0x4a7a3a], autumn: [0x8a5a24, 0xc0842e], winter: [0x3a4a3a, 0x56645a] };
export const MAPLE_BY: Record<SeasonId, Array<[number, number]>> = {
  spring: [[0x6a9a3e, 0x9cc85a], [0x5e8a36, 0x8ab84e]],
  summer: [[0x3a6a2c, 0x5a8a3c], [0x30602a, 0x4e7e36]],
  autumn: [[0xa82a1e, 0xe0502c], [0xb8401e, 0xe8782c], [0x962a20, 0xd0482a], [0xc06a1e, 0xe8a030]],
  winter: [[0x4a3a34, 0x5e4a40]],
};
export const SAKURA: Array<[number, number]> = [[0xe8a0b4, 0xfcd0dc], [0xf0b4c4, 0xffe0e8], [0xd88ca4, 0xf4bccc]];
export const MOSS_BY: Record<SeasonId, [number, number, number]> = { spring: [0x46603a, 0x384e30, 0x58744a], summer: [0x3e5a30, 0x30482a, 0x4e6c3e], autumn: [0x544c32, 0x423c2a, 0x665a3c], winter: [0x8a9298, 0x747c84, 0xa0a8ae] };

export function snowPass(c: Ctx, keep: Rect[]) {
  const w = c.w, top = new Map<number, number>();
  for (const k of w.cells.keys()) { const x = Math.floor(k / (1024 * 1024)) - 512, y = (Math.floor(k / 1024) % 1024) - 512, z = (k % 1024) - 512, ck = (x + 512) * 1024 + (z + 512); if ((top.get(ck) ?? -99) < y) top.set(ck, y); }
  const inKeep = (x: number, z: number) => keep.some(r => (x + 0.5) * CELL > r.x0 && (x + 0.5) * CELL < r.x1 && (z + 0.5) * CELL > r.z0 && (z + 0.5) * CELL < r.z1);
  for (const [ck, y] of top) {
    const x = Math.floor(ck / 1024) - 512, z = (ck % 1024) - 512, cell = w.get(x, y, z); if (!cell || cell.g > 0) continue;
    // (11-18 屋子形态: a pit's bed — water, a gully — has its top below the floor: left as it is, the snow would fill it in)
    if (y < -1) continue;
    if (y === -1) { if (inKeep(x, z)) { w.set(x, -1, z, trodden(cell.c)); continue; } { const f = Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.05) + Math.sin((x - z) * 0.025) * 0.7; w.set(x, -1, z, f > 0.55 ? SNOW_D : SNOW); } continue; }
    w.set(x, y + 1, z, SNOW);
  }
  // tree crowns are flora prisms, not cells: whiten their tops
  for (const m of plot(w).masses) if (m.y1 > 12) m.top = SNOW;
  void tone;
}
