// 11-18 (用户：「场景要有差异」): 前庭走中轴，石坪两边留雪，人在空地上就能认出对面的影壁。
import type { Ctx } from '../../scenes/stage';
import { M, PLAY, SX, SZ } from '../../scenes/props';
import type { ArenaPlan } from '../arena';
import type { Locale, Layout } from '../types';
import { CX, frame, gardenWall, paintFloor, plum, roofK, wp } from './cx_kit';

function courtFloor(c: Ctx, f: { layout: Layout }) {
  const h0 = M(PLAY.x0 + 1.65), h1 = M(PLAY.x1 - 1.65);
  paintFloor(c, (X, Z, x, z) => {
    const path = f.layout.path.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
    const swept = X >= h0 && X <= h1 && z >= PLAY.z0 && z <= PLAY.z1 + 1.4;
    const border = X < h0 + 10 || X > h1 - 10;
    const row = Math.floor(Z / 18), sx = X + (row & 1) * 15;
    const joint = Z % 18 === 0 || sx % 30 === 0;
    return path || swept ? joint ? 0x737986 : border ? 0x88919e : 0x939aa4
      : x > PLAY.x0 && x < PLAY.x1 ? 0xb3becc : CX.snow;
  });
}

function courtFar(c: Ctx, f: { arena?: ArenaPlan }) {
  // 影壁落在正面墙线上。中门是本间出口时，给中门和它的道路完整让开。
  const exit = f.arena?.gates.find(g => g.id === 'back' && g.open);
  const screenX = exit ? (exit.x > 0 ? -4.7 : 4.7) : 0;
  const B = frame(c.w, screenX, PLAY.z0 - 0.39);
  B(-46, 0, -5, 46, 4, 5, CX.stoneD);
  B(-42, 5, -4, 42, 30, 4, CX.plaster);
  B(-38, 8, 5, 38, 27, 5, CX.plasterD);
  B(-20, 11, 6, 20, 24, 6, 0xa6acae);
  B(-7, 13, 7, 7, 22, 7, CX.jade);
  B(-4, 15, 8, 4, 20, 8, CX.plasterD);
  roofK(B, -48, 48, -8, 8, 31);
  B(-44, 38, -2, 44, 38, 2, CX.snow);
  c.light([screenX, 1.8, PLAY.z0 + 1.6], 0xc1cce4, 2.4, 4);

  // 场边外的两列石灯顺着中轴排。侧门的通道原样留下。
  for (const side of [-1, 1]) {
    const x = side < 0 ? PLAY.x0 - 0.97 : PLAY.x1 + 0.97;
    for (const z of [-10.9, -6.35, -2.5, 1.35]) {
      if (f.arena?.gates.some(g => g.open && g.along === 'z' && g.out[0] === side && Math.abs(z - g.z) < g.w / 2 + 0.7)) continue;
      const L = frame(c.w, x, z);
      L(-6, 0, -6, 6, 2, 6, CX.stoneD);
      L(-3, 3, -3, 3, 15, 3, CX.stone);
      L(-5, 16, -5, 5, 18, 5, CX.stoneD);
      L(-3, 19, -3, 3, 23, 3, 0xe7b778, 1);
      for (const a of [-4, 4]) for (const b of [-4, 4]) L(a, 19, b, a, 23, b, CX.stoneD);
      L(-6, 24, -6, 6, 25, 6, CX.stone);
      L(-4, 26, -4, 4, 26, 4, CX.snow);
      c.light(wp(x, z, 0, -3 * side, 21, 5), 0xffbb83, 3, 5.4);
    }
    for (const z of [SZ(-10), SZ(-1.8)]) plum(frame(c.w, x + side * 2.4, z), 0, 0, 42, 19 + side);
  }

  // 门楼比室内的檐高，镜头越过门楼时仍能从底下看见人。
  const z = PLAY.z1 + 1.1, G = frame(c.w, 0, z);
  for (const x of [-48, 48]) {
    G(x - 9, 0, -10, x + 9, 4, 10, CX.stoneD);
    G(x - 6, 5, -6, x + 6, 71, 6, CX.redD);
    G(x - 5, 5, -7, x + 5, 71, -7, CX.red);
  }
  G(-57, 72, -7, 57, 75, 7, CX.woodD);
  roofK(G, -66, 66, -10, 10, 76, 3);
  G(-63, 87, -2, 63, 87, 2, CX.snow);

  const far = frame(c.w, 0, 0);
  gardenWall(far, M(SX(-17)), M(SX(17)), M(SZ(-16)), 36);
}

export const cxCourt: Locale = {
  id: 'cx_court', name: '覆雪前庭', theme: 'cui',
  layouts: ['axis', 'pair', 'garden'], landmarks: [], groups: [],
  seasons: ['winter'], times: ['night'], weathers: ['snow', 'clear'], noSnow: true,
  floor: courtFloor, far: courtFar,
};
