// 11-18 (用户：「木地板、靠墙一排排刀架……梁柱、烛火」): 崔玄在阁里打，架上刀的轮廓靠墙面的暖光照出来。
import type { Ctx } from '../../scenes/stage';
import { M, PLAY } from '../../scenes/props';
import { moodFor } from '../sky';
import type { Locale } from '../types';
import { CX, bladeRack, column, frame, paintFloor, planks, roofK, wp } from './cx_kit';

const TIMBER = 0x543b2e;
const PANEL = 0x634638;
const BASEBOARD = 0x362720;

function floor(c: Ctx) {
  paintFloor(c, (X, Z, x, z) => {
    if (x < PLAY.x0 - 0.5 || x > PLAY.x1 + 0.5 || z < PLAY.z0 - 0.5 || z > PLAY.z1 + 1.8) return 0x38353a;
    const aisle = Math.abs(x) <= 3.1;
    return planks(X, Z, aisle ? 0x84573e : 0x69503c, aisle ? 0x6b4534 : 0x56402f);
  });
}

function far(c: Ctx) {
  const B = frame(c.w, 0, 0), roof = frame(c.cut, 0, 0);
  const left = M(PLAY.x0), right = M(PLAY.x1), back = M(PLAY.z0), front = M(PLAY.z1);
  // 三面木墙就是阁本身。后墙分成几间，正中给崔玄的来路留空。
  B(left - 6, 0, back - 6, right + 6, 46, back - 2, TIMBER);
  B(left - 7, 0, back - 6, left - 1, 31, front, TIMBER);
  B(right, 0, back - 6, right + 6, 31, front, TIMBER);
  for (const x of [left, right]) {
    const outerX = x + (x < 0 ? -6 : 6);
    B(x, 31, back - 6, outerX, 33, front, BASEBOARD);
    roof(x, 34, back - 6, outerX, 50, front, TIMBER);
  }
  B(left - 7, 0, back - 2, right + 6, 3, back, BASEBOARD);
  B(left - 7, 38, back - 2, right + 6, 45, back, BASEBOARD);
  B(-31, 2, back - 1, 31, 36, back + 1, BASEBOARD);
  B(-26, 3, back + 2, 26, 35, back + 2, 0x493124);
  for (const x of [-28, 28]) B(x - 2, 3, back + 2, x + 2, 38, back + 3, CX.redD);
  B(-32, 35, back + 2, 32, 39, back + 4, CX.redD);

  for (const side of [-1, 1]) {
    const a = side < 0 ? left : 41, b = side < 0 ? -41 : right;
    B(a + 4, 4, back - 1, b - 4, 34, back, PANEL);
    bladeRack(B, a + 7, b - 7, back + 1, 3, 9, 4 + side);
    const edge = side < 0 ? PLAY.x0 - 0.22 : PLAY.x1 + 0.16;
    const rot = side < 0 ? 1 : 3;
    for (const z of [-8.75, -4.15, 0.45, 5.05]) {
      const S = frame(c.w, edge, z, rot);
      S(-29, 3, 0, 29, 30, 1, PANEL);
      bladeRack(S, -27, 27, 2, 1, 7, M(z));
    }
    for (const z of [-11.65, -6.45, -1.85, 2.75, 7.35]) {
      const x = side < 0 ? left - 3 : right + 3;
      column(B, x, M(z), 35);
      B(x - 4, 38, M(z) - 7, x + 4, 43, M(z) + 7, BASEBOARD);
    }
    // 烛台在墙线外，烛光离地近，落在脚下和刀架下半段。
    for (const z of [-10.7, -5.9, 0.35]) {
      const x = side < 0 ? PLAY.x0 - 0.29 : PLAY.x1 + 0.29;
      const C = frame(c.w, x, z);
      C(-3, 0, -3, 3, 1, 3, CX.bronzeD);
      C(-1, 2, -1, 1, 11, 1, CX.bronzeD);
      C(-4, 12, -3, 4, 12, 3, CX.bronze);
      for (const a of [-2, 2]) {
        C(a - 1, 13, 0, a, 16, 1, 0xcfba91);
        C(a - 1, 17, 0, a, 18, 1, 0xf5ab58, 1);
      }
      c.light(wp(x, z, 0, -side * 13, 21, 0), 0xffb276, 3.8, 7.5);
    }
  }

  // 摄影机上方的梁和瓦随挡檐层收起。背墙横梁留在画面里作为阁的上缘。
  for (const z of [-8.75, -4.15, 0.45, 5.05]) roof(left - 7, 43, M(z) - 3, right + 6, 49, M(z) + 3, BASEBOARD);
  roofK(roof, left - 12, right + 12, back - 10, back + 18, 50);
  roofK(roof, left - 12, left + 16, back + 19, front + 8, 50, 1);
  roofK(roof, right - 16, right + 12, back + 19, front + 8, 50, 1);
  c.cutEaves(3.5);
}

const night = moodFor('night', 'winter', 'clear');
export const cxVault: Locale = {
  id: 'cx_vault', name: '藏刀阁', theme: 'cui',
  layouts: ['axis', 'garden'], landmarks: [], groups: [],
  seasons: ['winter'], times: ['night'], weathers: ['clear'], noSnow: true,
  mood: { ...night, sky: false, bg: 0x29201e, fog: 0x33241e, fogD: 0.016, earth: [0x39302d, 0x3a302d, 0x382f2c],
    mistA: 0, hemiSky: 0xa9907c, hemiGround: 0x68504b, hemiI: 1.15,
    moon: 0xe8c8a8, moonI: 0.7, key: 0xffba8b, keyI: 0.4, exposure: 1.24, bloomT: 1.2 },
  floor, far,
};
