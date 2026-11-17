// 黄巾残村两处地点（残村、麦田）的「实地」（11-18 屋子形态）：形状里被墙围住、人走不进去的那几块上面建什么。
// 残村：一座烧了半边的院子（院里一间农舍、一堆余烬、柴垛、陶瓮），朝场地的一面是院墙（shapeBuild 已砌）；
// 麦田：一块没割的麦地（成行的麦垄），田边一圈田埂；回廊中间那块大的，田中间立一座瓜棚。
// 规矩：朝房间后方的那一侧（玩家从镜头看过去，在场地后面的那条边）不放高的东西——高的会挡住后面的场地。实地离镜头近的那半边才放屋子。
import type { Ctx } from '../../scenes/stage';
import { M } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import type { Place, Rect, SeasonId } from '../types';
import { HV, house, jar, strawStack, frame } from './hj_village_kit';
import { emberHeap, woodpile, banner } from './hj_village_props';
import { HC, cropOf, wheatBed, frame as fframe, thatch } from './hj_field_kit';

const LOESS = [HV.loess, HV.loessD, HV.loessL];
const night = (p: Place) => p.lamp > 0.3;

/** the burnt compound on a walled-off part of the village floor */
export function villageInfill(c: Ctx, f: { rect: Rect; p: Place; back: boolean; front: boolean }) {
  const { rect: q, p } = f, w = c.w, X0 = M(q.x0), X1 = M(q.x1) - 1, Z0 = M(q.z0), Z1 = M(q.z1) - 1;
  // the yard: trodden loess in big patches, a dark ash scar
  for (let X = X0; X <= X1; X++) for (let Z = Z0; Z <= Z1; Z++) w.set(X, -1, Z, LOESS[((X >> 4) + (Z >> 4) * 3 + 99) % 3 === 0 ? 1 : 0]);
  const W = q.x1 - q.x0, D = q.z1 - q.z0, cx = (q.x0 + q.x1) / 2;
  // the house stands in the half nearer the camera when the back edge borders the floor (it would hide the floor behind it), else in
  // the middle; it faces the camera
  const hz = f.back ? q.z1 - Math.min(D * 0.38, 3.6) : (q.z0 + q.z1) / 2, hw = Math.max(14, Math.min(26, Math.round((W - 2.6) / CELL / 2))), hd = Math.max(10, Math.min(15, Math.round((D * 0.45) / CELL / 2)));
  if (W > 4.2 && D > 3.6) {
    const burnt = p.rnd(1) < 0.65 ? (p.rnd(2) < 0.5 ? 1 : 2) : 0, lit = night(p) && burnt === 1;
    const out = house(c, cx, hz, 0, { hw, hd, H: 26, burnt: burnt as 0 | 1 | 2, lit, wins: [-Math.round(hw * 0.55), Math.round(hw * 0.55)] });
    if (out.ember && lit) c.light(out.ember, 0xff8a3a, 2.0 * p.lamp, 4);
  }
  // round the house: an ember heap, a woodpile, jars, a straw stack — each only where the yard has room for it
  const B = frame(w, q.x0, q.z0), wc = Math.round(W / CELL), dc = Math.round(D / CELL);
  const hzC = Math.round((hz - q.z0) / CELL), hxC0 = Math.round((cx - q.x0) / CELL) - hw - 4, hxC1 = Math.round((cx - q.x0) / CELL) + hw + 4;
  const freeX = (a: number) => a < hxC0 || a > hxC1;
  if (freeX(10) && dc > 22) { jar(B, 8, Math.min(dc - 9, hzC + 4), 1, p.rnd(3) < 0.5, { broken: p.rnd(4) < 0.4 }); jar(B, 15, Math.min(dc - 8, hzC + 8), 0, true); }
  if (freeX(wc - 12) && dc > 30) strawStack(B, wc - 12, Math.max(10, hzC - 8), 8, 22);
  if (dc > 26 && wc > 30) emberHeap(c, q.x0 + Math.min(W - 1.4, 1.6 + p.rnd(5) * (W - 3)), q.z0 + Math.max(1.2, Math.min(D - 1.2, D * 0.18)), 0, night(p));
  if (wc > 46 && dc > 30) woodpile(c, q.x1 - 1.6, q.z0 + Math.min(D - 1.5, D * 0.75), 0);
  if (p.rnd(6) < 0.6 && wc > 24) banner(B, wc - 6, 4, 40, 9, 18);
}

/** standing wheat (or millet) on a walled-off part of the field: rows with a furrow between, a ridge round the plot; a watch-shed on a
 *  big one */
export function fieldInfill(c: Ctx, f: { rect: Rect; p: Place; back: boolean; front: boolean }) {
  const { rect: q, p } = f, w = c.w, se = p.season as SeasonId, X0 = M(q.x0), X1 = M(q.x1) - 1, Z0 = M(q.z0), Z1 = M(q.z1) - 1;
  // soil under it all, a grass ridge one cell wide round the plot
  for (let X = X0; X <= X1; X++) for (let Z = Z0; Z <= Z1; Z++) w.set(X, -1, Z, X === X0 || X === X1 || Z === Z0 || Z === Z1 ? 0x6a7a38 : HC.soilD);
  const pal = cropOf(se, p.rnd(1) < 0.4 ? 1 : 0), rowsZ = p.rnd(2) < 0.6, T = 6, H = (se === 'autumn' ? 14 : 13);
  // a big plot gets a watch-shed in the middle of its camera-side half, rows left round it
  const W = q.x1 - q.x0, D = q.z1 - q.z0, shed = W > 6 && D > 6 ? { x: M((q.x0 + q.x1) / 2), z: M(f.back ? q.z1 - D * 0.3 : (q.z0 + q.z1) / 2) } : null;
  const inShed = (X: number, Z: number) => !!shed && Math.abs(X - shed.x) < 24 && Math.abs(Z - shed.z) < 24;
  if (rowsZ) {
    for (let X = X0 + 2; X + T - 2 <= X1 - 1; X += T) {
      let z = Z0 + 2;
      while (z <= Z1 - 2) { if (inShed(X + 2, z)) { z++; continue; } let e = z; while (e + 1 <= Z1 - 2 && !inShed(X + 2, e + 1)) e++; if (e - z > 4) wheatBed(c, X, z, X + T - 2, e, H, pal, ['+z', X + T > X1 - 2 ? '+x' : '-x']); z = e + 1; }
    }
  } else {
    for (let Z = Z0 + 2; Z + T - 2 <= Z1 - 1; Z += T) {
      let x = X0 + 2;
      while (x <= X1 - 2) { if (inShed(x, Z + 2)) { x++; continue; } let e = x; while (e + 1 <= X1 - 2 && !inShed(e + 1, Z + 2)) e++; if (e - x > 4) wheatBed(c, x, Z, e, Z + T - 2, H, pal, ['+z']); x = e + 1; }
    }
  }
  if (shed) {
    // the field watch-shed on stilts (as the 瓜棚 group): four posts, a board deck, a two-slab thatch, a ladder
    const B = fframe(w, shed.x * CELL, shed.z * CELL);
    for (const a of [-12, 12]) for (const b of [-12, 12]) B(a - 1, -1, b - 1, a + 1, 40, b + 1, HC.post);
    B(-14, 22, -14, 14, 23, 14, HC.plank); for (const u of [-14, 14]) { B(u, 24, -14, u, 28, 14, HC.wood); B(-14, 28, u, 14, 28, u, HC.woodL); }
    thatch(B, -19, 19, -19, 19, 41, [[0, 4], [5, 4]]);
    for (const a of [-4, 4]) B(a, -1, 16, a, 22, 16, HC.wood); for (let y = 3; y <= 21; y += 5) B(-3, y, 16, 3, y, 16, HC.woodL);
    if (night(p)) { B(10, 32, 13, 12, 36, 15, 0xe0a050, 1); c.light([shed.x * CELL + 0.77, 2.4, shed.z * CELL + 1.0], 0xffa050, 1.6 * p.lamp, 5); }
  }
}
