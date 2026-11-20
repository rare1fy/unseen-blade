// 11-18 (用户：「场景要有差异」): 前庭走中轴，石坪两边留雪，人在空地上就能认出对面的影壁。
import type { Ctx } from '../../scenes/stage';
import { M, PLAY, SX, SZ } from '../../scenes/props';
import type { ArenaPlan } from '../arena';
import type { Locale, Layout, Place } from '../types';
import { CX, bamboo, frame, gardenWall, paintFloor, roofK, wp } from './cx_kit';
import { cuiInfill, cuiEdgeDress, cuiDistantBackdrop, manorRoof, lushPlumTree, taihuRock, manorWindow, eaveLantern } from './cx_infill';

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

function courtFar(c: Ctx, f: { layout: Layout; p: Place; arena?: ArenaPlan }) {
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
    // Lush gnarled blossoming crimson winter plum trees & Taihu rockeries framing the stone lantern avenue!
    for (const [idx, z] of [SZ(-9.6), SZ(-2.4)].entries()) {
      const pb = frame(c.w, x + side * 2.2, z);
      lushPlumTree(pb, 0, 0, 0, idx === 0 ? 48 : 42, 19 + side + idx * 7);
      if (idx === 0) taihuRock(pb, -side * 12, 0, 14, 0.9);
    }
  }

  // 序章 / 方形前庭（非拼图房时，!f.layout.drawn）：彻底摆脱空荡白盒！
  // 在影壁正北筑起三层重檐暖烛崔府正殿，东西两翼筑起二层对称朱柱厢房 + 翠竹雪景，给开场见崔玄一场电影级豪门雪夜大景！
  if (!f.layout.drawn) {
    // 1) North 3-Storey Grand Cui Manor Main Hall (三层重檐崔府正殿, rising majestically behind the jade spirit screen!)
    const hz0 = PLAY.z0 - 8.4, hz1 = PLAY.z0 - 2.6;
    const Mh = frame(c.w, 0, hz1);
    const hw = 104, hd = M(hz1 - hz0), H1 = 42;
    Mh(-hw - 4, -1, -hd - 4, hw + 4, -1, 4, CX.snow);
    Mh(-hw, 0, -hd, hw, 5, 0, CX.brickD);
    Mh(-hw, 6, -hd, hw, 6, 0, CX.stone);
    Mh(-hw, 7, -hd, hw, H1, 0, CX.plaster);
    Mh(-hw, 7, -hd, hw, 9, 0, CX.plasterD);
    for (let x = -hw; x <= hw; x += 26) Mh(x, 7, -2, x + 2, H1, 0, CX.red);
    Mh(-hw, H1 - 2, -2, hw, H1, 0, CX.woodD);
    for (const wx of [-74, -42, 0, 42, 74]) manorWindow(Mh, wx, 15, 28, 0);
    for (const lx of [-86, -24, 24, 86]) eaveLantern(Mh, lx, H1 - 8, 2);
    c.light([0, 2.4, hz1 + 1.2], 0xffb878, 2.6, 9);
    const r1 = manorRoof(Mh, -hw - 6, hw + 6, -hd - 5, 6, H1 + 1, 2, 4);
    // 2nd storey recessed hall (二层重檐正楼)
    const hw2 = 72, y2 = r1 - 2, H2 = 24;
    Mh(-hw2, y2, -hd + 8, hw2, y2 + H2, -6, CX.plaster);
    for (let x = -hw2; x <= hw2; x += 24) Mh(x, y2, -8, x + 2, y2 + H2, -6, CX.red);
    Mh(-hw2 - 3, y2 + 1, -5, hw2 + 3, y2 + 5, -3, CX.red);
    for (const wx of [-44, 0, 44]) manorWindow(Mh, wx, y2 + 7, y2 + 17, -6);
    const r2 = manorRoof(Mh, -hw2 - 6, hw2 + 6, -hd + 3, 0, y2 + H2 + 1, 2, 4);
    // 3rd storey crowning belvedere (三层飞阁, soaring to ~7.2m!)
    const hw3 = 30;
    Mh(-hw3, r2 - 2, -hd + 16, hw3, r2 + 16, -14, CX.plaster);
    for (const ax of [-hw3, hw3 - 2]) Mh(ax, r2 - 2, -16, ax + 2, r2 + 17, -14, CX.red);
    manorWindow(Mh, 0, r2 + 3, r2 + 12, -14);
    manorRoof(Mh, -hw3 - 8, hw3 + 8, -hd + 10, -8, r2 + 17, 2, 4);
    // Lush winter bamboo groves framing the left & right shoulders of the spirit screen
    bamboo(frame(c.w, -7.8, PLAY.z0 - 1.2), -14, 14, 0, 56, 71);
    bamboo(frame(c.w,  7.8, PLAY.z0 - 1.2), -14, 14, 0, 56, 83);

    // 2) East & West 2-Storey Aristocratic Side Wings (东西两翼二层暖烛重檐厢房, strictly outside stone lanterns!)
    for (const side of [-1, 1] as const) {
      const openSide = f.arena?.gates.some(g => g.open && g.along === 'z' && g.out[0] === side);
      const wingZs = openSide ? [PLAY.z0 + 3.2] : [PLAY.z0 + 3.2, PLAY.z1 - 4.4];
      for (const wz of wingZs) {
        const wx = side < 0 ? PLAY.x0 - 5.2 : PLAY.x1 + 5.2;
        const Wb = frame(c.w, wx, wz);
        const wHalf = 36, dHalf = 42, WH = 38;
        Wb(-wHalf - 3, -1, -dHalf - 3, wHalf + 3, -1, dHalf + 3, CX.snow);
        Wb(-wHalf, 0, -dHalf, wHalf, 5, dHalf, CX.brickD);
        Wb(-wHalf, 6, -dHalf, wHalf, WH, dHalf, CX.plaster);
        // crimson columns & glowing windows on the courtyard-facing inner wall!
        const inX = side < 0 ? wHalf : -wHalf;
        for (let z = -dHalf + 4; z <= dHalf - 6; z += 22) Wb(inX - (side < 0 ? 2 : 0), 6, z, inX + (side < 0 ? 0 : 2), WH, z + 2, CX.red);
        for (const gz of [-18, 16]) {
          Wb(inX - (side < 0 ? 2 : 0), 15, gz - 6, inX + (side < 0 ? 0 : 2), 26, gz + 6, 0xe2b068, 1);
        }
        const wr1 = manorRoof(Wb, -wHalf - 5, wHalf + 5, -dHalf - 5, dHalf + 5, WH + 1, 2, 4);
        // 2nd-storey wing clerestory
        Wb(-wHalf + 10, wr1 - 2, -dHalf + 12, wHalf - 10, wr1 + 16, dHalf - 12, CX.plaster);
        manorRoof(Wb, -wHalf + 4, wHalf - 4, -dHalf + 6, dHalf - 6, wr1 + 17, 2, 4);
      }
    }
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
  cuiDistantBackdrop(c, f);
}

export const cxCourt: Locale = {
  id: 'cx_court', name: '覆雪前庭', theme: 'cui',
  layouts: ['axis', 'pair', 'garden'], landmarks: [], groups: [],
  seasons: ['winter'], times: ['night'], weathers: ['snow', 'clear'], noSnow: true,
  floor: courtFloor, far: courtFar, dress: (c, f) => cuiEdgeDress(c, f), infill: cuiInfill('court'),
};
