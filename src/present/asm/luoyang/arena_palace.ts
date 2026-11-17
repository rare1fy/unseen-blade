// 第二关 · 洛阳的场地矮墙风格 'palace'（11-18）：烧裂的宫墙——夯土墙芯外包一层青砖、砖面上一道道烧黑的横带，墙头一条残破的
// 灰瓦檐；门柱是烧焦的朱柱。掩体：倒伏的铜驼、铜钟架、焦木堆、石兽座。体素 7 厘米一格，横平竖直、不撒碎点。
// 由 asm/luoyang/index.ts import，把自己登记进 asm/arena.ts 的 ARENA_STYLES；三个洛阳地点用它。
import { ARENA_STYLES, LOCALE_STYLE, type ArenaStyle } from '../arena';

/** 洛阳的调色：焦砖、灰、铜绿、焦木、暗朱 */
export const LYC = {
  brick: 0x5e5854, brickD: 0x46413e, brickL: 0x76706a, char: 0x26211e, charL: 0x3a332e, ash: 0x6e6862,
  earth: 0x8a7458, earthD: 0x6e5c46, tile: 0x45474c, tileD: 0x2e3034, tileL: 0x5c5e64,
  red: 0x6a2c22, redD: 0x4a1e18, redL: 0x84402e,
  bronze: 0x4e6a58, bronzeD: 0x34483c, bronzeL: 0x6e8a72, copper: 0x9a5a34, copperL: 0xc07a44,
  stone: 0x7a7670, stoneD: 0x5e5a56, stoneL: 0x949088, ember: 0xd8602a,
};
const C = LYC;

const palace: ArenaStyle = {
  wall(bx, segs, b0, b1, H) {
    for (const [p0, p1, h] of segs) {
      bx(p0, 0, b0, p1, h, b1, C.brick); bx(p0, 0, b0, p1, 1, b1, C.brickD);
      // brick courses every 4 rows, the joints staggered by half a brick (one dark cell line each, no speckle)
      for (let y = 4; y < h; y += 4) bx(p0, y, b0, p1, y, b1, C.brickD);
      // fire marks: a band of char across the upper wall (whole rows, from the top down), deeper where the stretch broke
      bx(p0, Math.max(2, h - 5), b0, p1, h - 3, b1, C.charL); bx(p0, Math.max(2, h - 3), b0, p1, h - 1, b1, C.char);
      if (h === H) { bx(p0, h + 1, b0 - 1, p1, h + 1, b1 + 1, C.tileD); bx(p0, h + 2, b0, p1, h + 2, b1, C.tile); bx(p0, h + 3, b0 + 2, p1, h + 3, b1 - 2, C.tileL); }
      else { bx(p0, h, b0, p1, h, b1, C.ash); }
    }
  },
  post: [C.red, C.char, C.redL],
  covers: ['camel', 'bellrack', 'charpile', 'beast'],
  size: { camel: [1.1, 0.5], bellrack: [1.0, 0.45], charpile: [0.85, 0.7], beast: [0.6, 0.6] },
  cover: {
    camel: bx => {   // 铜驼 fallen on its side: the long body, the hump, the neck and head along the ground, legs out (bronze, verdigris on top)
      bx(-12, 0, -5, 6, 8, 5, C.bronze); bx(-12, 9, -4, 6, 9, 4, C.bronzeL); bx(-6, 9, -3, 2, 13, 3, C.bronze); bx(-6, 14, -2, 2, 14, 2, C.bronzeL);
      bx(7, 0, -3, 12, 6, 3, C.bronzeD); bx(13, 0, -3, 16, 9, 3, C.bronze); bx(13, 10, -2, 16, 10, 2, C.bronzeL);
      for (const x of [-10, -4, 0, 4]) bx(x, 0, 6, x + 2, 2, 12, C.bronzeD);
      bx(-14, 0, -6, 8, 0, 6, C.stoneD);
    },
    bellrack: bx => {   // a toppled bell frame: two posts on the ground, the beam, one bronze bell lying under it
      bx(-14, 0, -5, -12, 2, 5, C.char); bx(12, 0, -5, 14, 2, 5, C.char); bx(-14, 3, -1, 14, 5, 1, C.charL);
      bx(-6, 0, -4, 4, 7, 4, C.bronze); bx(-6, 8, -3, 4, 8, 3, C.bronzeL); bx(5, 0, -3, 7, 6, 3, C.bronzeD);
    },
    charpile: bx => {   // a stack of charred beams, three layers crossing (flat blocks), embers in the gaps
      bx(-12, 0, -8, 12, 2, -5, C.char); bx(-12, 0, 5, 12, 2, 8, C.char); bx(-10, 3, -9, -7, 5, 9, C.charL); bx(7, 3, -9, 10, 5, 9, C.charL);
      bx(-11, 6, -3, 11, 8, 0, C.char); bx(-2, 3, -3, 2, 5, 3, C.ember);
    },
    beast: bx => {   // a stone beast on its plinth (a 辟邪 crouching), the plinth cracked in one wide step
      bx(-8, 0, -8, 8, 4, 8, C.stoneD); bx(-8, 5, -8, 8, 5, 8, C.stone);
      bx(-5, 6, -6, 5, 14, 4, C.stone); bx(-4, 15, -2, 4, 19, 6, C.stone); bx(-3, 20, 0, 3, 21, 5, C.stoneL); bx(-5, 6, 5, 5, 9, 7, C.stoneD);
      bx(-8, 0, 4, -4, 5, 8, C.char);
    },
  },
  rubble: [C.brick, C.char, C.ash],
  smalls: ['pot', 'crate', 'pot', 'sack', 'basket'], banners: false,
};
ARENA_STYLES.palace = palace;
for (const id of ['ly_road', 'ly_ward', 'ly_mint']) LOCALE_STYLE[id] = 'palace';
