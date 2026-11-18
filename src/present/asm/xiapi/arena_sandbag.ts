// 第三关 · 下邳的场地矮墙风格 'sandbag'（11-18）：水淹的城里临时垒起的沙袋墙——一层层麻袋（每层错开半袋，袋缝是整列暗色），
// 下面两层泡过水颜色深，最上面压一根木杆；门柱是泡黑的木桩。掩体：系船石桩、半沉的船、沙袋堆、木筏。体素 7 厘米一格。
// 由 asm/xiapi/index.ts import，把自己登记进 asm/arena.ts 的 ARENA_STYLES；三个下邳地点用它。
import { ARENA_STYLES, LOCALE_STYLE, type ArenaStyle } from '../arena';

/** 下邳的调色：湿麻袋、泡黑的木、青石、暗青灰的水 */
// (11-18 场景帮手：和三个地点的调色 xp_kit.ts XP 对齐——麻袋压成冷灰褐，原来的暖黄褐在灰蓝场景里像一圈土砖墙)
export const XPC = {
  sack: 0x7a756a, sackD: 0x5e5a53, sackW: 0x4a4844, sackL: 0x8e897e,
  wood: 0x4e4739, woodD: 0x332f29, woodL: 0x665e4f,
  stone: 0x6e7478, stoneD: 0x53595d, stoneL: 0x899094, water: 0x24343c, frost: 0x9aa6ae,
};
const C = XPC;

const sandbag: ArenaStyle = {
  wall(bx, segs, b0, b1) {
    for (const [p0, p1, h] of segs) {
      bx(p0, 0, b0, p1, h - 2, b1, C.sack);
      // the courses: one bag = 3 rows tall, 8 cells long; the seams a dark column, staggered by half a bag each course
      for (let y = 0, k = 0; y < h - 2; y += 3, k++) {
        bx(p0, y, b0, p1, y, b1, k < 2 ? C.sackW : C.sackD);
        for (let a = p0 + (k % 2 ? 4 : 0); a <= p1; a += 8) { bx(a, y + 1, b0, a, Math.min(h - 3, y + 2), b0, C.sackD); bx(a, y + 1, b1, a, Math.min(h - 3, y + 2), b1, C.sackD); }
      }
      // the pole on top, a layer of frost along it (the wall knows no weather: frost reads in snow too)
      bx(p0, h - 1, b0 + 1, p1, h - 1, b1 - 1, C.woodD); bx(p0, h, b0 + 2, p1, h, b1 - 2, C.frost);
    }
  },
  post: [C.wood, C.woodD, C.woodL],
  covers: ['bollard', 'boat', 'bags', 'raft'],
  size: { bollard: [0.45, 0.45], boat: [1.2, 0.55], bags: [0.85, 0.6], raft: [1.0, 0.7] },
  cover: {
    bollard: bx => {   // a mooring stone: a squat post with a collar, a rope round it
      bx(-5, 0, -5, 5, 3, 5, C.stoneD); bx(-4, 4, -4, 4, 16, 4, C.stone); bx(-5, 12, -5, 5, 13, 5, C.stoneL); bx(-3, 17, -3, 3, 17, 3, C.stoneL);
      bx(-5, 8, -5, 5, 9, 5, C.woodL);
    },
    boat: bx => {   // a half-sunk boat: the hull's two sides and the stern above the water line, a thwart, the bow down in the mud
      bx(-16, 0, -7, 14, 1, 7, C.water); bx(-14, 0, -7, 14, 7, -6, C.wood); bx(-14, 0, 6, 14, 7, 7, C.wood); bx(10, 0, -6, 14, 9, 6, C.woodD);
      bx(-14, 7, -7, 14, 7, -6, C.woodL); bx(-14, 7, 6, 14, 7, 7, C.woodL); bx(-2, 4, -6, 1, 5, 6, C.woodD); bx(-16, 0, -5, -14, 3, 5, C.woodD);
    },
    bags: bx => {   // a heap of sandbags: two courses of three, one on top, the lowest wet
      for (const [x, z] of [[-10, -4], [-3, -4], [4, -4], [-10, 3], [-3, 3], [4, 3]] as const) { bx(x, 0, z - 3, x + 6, 3, z + 3, C.sackW); bx(x, 4, z - 3, x + 6, 6, z + 3, C.sack); }
      bx(-6, 7, -3, 4, 9, 3, C.sackL);
    },
    raft: bx => {   // a raft of lashed logs washed up, two logs on top across
      for (let z = -9; z <= 7; z += 4) { bx(-13, 0, z, 13, 2, z + 2, z % 8 ? C.wood : C.woodD); }
      bx(-9, 3, -9, -7, 4, 9, C.woodD); bx(7, 3, -9, 9, 4, 9, C.woodD); bx(-14, 0, -10, 14, 0, 10, C.water);
    },
  },
  rubble: [C.sack, C.sackW, C.sackL],
  smalls: ['crate', 'pot', 'sack', 'basket', 'crate'], banners: false,
};
ARENA_STYLES.sandbag = sandbag;
for (const id of ['xp_lane', 'xp_wall', 'xp_gate']) LOCALE_STYLE[id] = 'sandbag';
