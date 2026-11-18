// 技能钮的立体图标（act-29，用户：「你要去对齐一下我dicehero3D那版的UI品质，特别是3D icon的品质」）。照 dicehero3d 的
// models3d 做法：厚体素徽章（4～6 格厚），外轮廓一层、往里收一圈再前后各凸一格（鼓起来），核心是发光格；卡通着色带轮廓光和
// 描边；冷却时 setDim 变暗、待发 / 可接招时 setGlow 发亮。全部横平竖直的大块，没有斜线阶梯、没有碎点。
// 四颗钮：环首刀（攻击）、靴子带风痕（闪避）、上箭头（跳跃）、柳叶镖（远程）；据点里的「交谈」气泡；招式联动的小模型由
// 提示用的像素图放大两倍后「鼓起来」生成（每招自己的颜色，发光核心）。
import { customIcon3D, type Model3D } from '../ui3d/models3d';
import { itemModel } from './itemModels';
import { Mask, extrude, pillow, box, type Set3 } from '../ui3d/models3dArt';

const C = {
  st0: 0x2e3440, st1: 0x5c6674, st2: 0x9aa6b6, stE: 0xdce8f4, edgeG: 0xbfe8ff,
  br0: 0x6a4214, br1: 0xb07a2e, br2: 0xe0aa48, brG: 0xffd27a,
  red0: 0x5a0a10, red1: 0xa01c20, red2: 0xd03028,
  lea0: 0x3a2618, lea1: 0x5e3e26, lea2: 0x8a6038,
  wind: 0xcfeeff,
};

const ART: Record<string, (set: Set3) => void> = {
  // 环首刀 point up: a straight single-edged blade (bright edge left, steel, dark spine right) with a lit edge line in front, a bronze
  // guard, the grip bound in red with dark turns, the bronze ring pommel at the foot
  sabre: set => {
    box(set, -1, 0, -1, 2, 15, 0, C.st1); box(set, -2, 1, -1, -2, 14, 0, C.stE); box(set, 3, 0, -1, 3, 15, 0, C.st0);
    box(set, -1, 16, -1, 1, 17, 0, C.st2); box(set, -1, 18, -1, 0, 19, 0, C.stE); box(set, -1, 20, -1, -1, 20, 0, C.stE);
    box(set, -2, 2, 1, -2, 15, 1, C.edgeG, 1); box(set, -1, 16, 1, -1, 18, 1, C.edgeG, 1);
    box(set, 0, 3, 1, 2, 13, 1, C.st2);
    box(set, -4, -3, -2, 4, -1, 1, C.br1); box(set, -3, -2, 2, 3, -2, 2, C.br2); box(set, -4, -3, -2, -4, -1, 1, C.br0);
    box(set, -1, -11, -1, 1, -4, 0, C.red1); for (let y = -10; y <= -4; y += 2) box(set, -2, y, -1, 2, y, 1, C.red0);
    box(set, -1, -11, 1, 0, -5, 1, C.red2);
    const ring = new Mask().rect(-3, -18, 2, -12).cut(-1, -16, 0, -14).cut(-3, -18, -3, -18).cut(2, -18, 2, -18).cut(-3, -12, -3, -12).cut(2, -12, 2, -12);
    extrude(set, ring, -1, 0, C.br1); for (const [x, y] of ring.cells()) if (y >= -13) set(x, y, 1, C.br2);
    box(set, -1, -22, -1, 0, -19, 0, C.red1); box(set, -2, -24, -1, 1, -23, 0, C.red0);
  },
  // a boot stepping forward (to the right), bronze-trimmed, three pale wind streaks behind it
  dash: set => {
    const m = new Mask().rect(-3, -1, 2, 7).rect(-4, -6, 6, -1).rect(7, -6, 8, -3).cut(6, -1, 6, -1).cut(8, -3, 8, -3);
    pillow(set, m, -2, 1, C.lea0, C.lea1, 0, C.lea2, 0);
    box(set, -4, 7, -3, 3, 9, 2, C.br1); box(set, -3, 9, 3, 2, 9, 3, C.br2);
    box(set, -4, -7, -2, 8, -7, 1, C.st0); box(set, 5, -5, 2, 8, -4, 2, C.br1); box(set, -4, -6, 2, -3, -2, 2, C.br1);
    box(set, -13, -4, 0, -7, -4, 0, C.wind, 1); box(set, -15, -1, 0, -7, -1, 0, C.wind, 1); box(set, -12, 2, 0, -7, 2, 0, C.wind, 1);
    box(set, -10, 5, 0, -7, 5, 0, C.wind, 1);
  },
  // an up arrow (three broad tiers, not a stair of single cells) over a glowing ground line
  jump: set => {
    const m = new Mask().rect(-3, -6, 2, 1).rect(-8, 2, 7, 4).rect(-6, 5, 5, 7).rect(-4, 8, 3, 10).rect(-2, 11, 1, 12);
    pillow(set, m, -2, 1, C.br0, C.br1, 0, C.brG, 1);
    box(set, -9, -10, -1, 8, -9, 0, C.st1); box(set, -8, -10, 1, 7, -10, 1, C.edgeG, 1);
    box(set, -6, -8, 0, -5, -8, 0, C.wind, 1); box(set, 4, -8, 0, 5, -8, 0, C.wind, 1);
  },
  // 柳叶镖 point up: a willow-leaf blade (steel, bright edges, a lit core), the bronze ring, a red tassel
  dart: set => {
    const leaf = new Mask().rect(-1, 0, 0, 1).rect(-2, 2, 1, 4).rect(-3, 5, 2, 10).rect(-2, 11, 1, 13).rect(-1, 14, 0, 16);
    pillow(set, leaf, -1, 0, C.st1, C.st2, 0, C.edgeG, 1);
    for (const [x, y] of leaf.cells()) if (!leaf.has(x - 1, y)) set(x, y, 1, C.stE);
    const ring = new Mask().rect(-2, -5, 1, -1).cut(-1, -4, 0, -2);
    extrude(set, ring, -1, 0, C.br1); for (const [x, y] of ring.cells()) if (y === -1) set(x, y, 1, C.br2);
    box(set, -2, -12, -1, 1, -6, 0, C.red1); box(set, -1, -11, 1, 0, -7, 1, C.red2); box(set, -3, -14, -1, 2, -13, 0, C.red0);
  },
  // 11-19 返回 (用户：「设置的返回按钮设计有问题」): an arrow turning back — a broad bronze bar along the top and down the right, the
  //  head pointing left at the top (big flat tiers, no stair of single cells), a lit edge along its top
  back: set => {
    const m = new Mask().rect(-3, 3, 7, 6).rect(4, -6, 7, 2).rect(-2, -7, 7, -5)
      .rect(-6, 2, -4, 7).rect(-8, 3, -7, 6).rect(-9, 4, -9, 5);
    pillow(set, m, -2, 1, C.br0, C.br1, 0, C.brG, 1);
    box(set, -3, 6, 2, 6, 6, 2, C.br2); box(set, -6, 7, 2, -4, 7, 2, C.br2);
  },
  // 交谈: a white speech bubble (act-34, 用户：「对白气泡用白色，不要黄色，黄色看不懂」), three dark dots, the tail at its lower left
  talk: set => {
    const m = new Mask().rect(-8, -2, 7, 6).rect(-7, -3, 6, 7).cut(-8, 6, -8, 6).cut(7, 6, 7, 6).cut(-8, -2, -8, -2).cut(7, -2, 7, -2).rect(-6, -6, -4, -4).rect(-7, -7, -6, -6);
    pillow(set, m, -1, 1, 0x8c9198, 0xdde1e6, 0, 0xffffff, 0);
    for (const x of [-5, -1, 3]) box(set, x, 1, 3, x + 1, 2, 3, 0x22242a);
  },
};

/** the four buttons' pictures and the hideout's talk bubble, as thick voxel badges (dim / glow through Model3D) */
export function btnIcon3D(key: 'attack' | 'dash' | 'jump' | 'special' | 'talk' | 'back'): Model3D {
  // act-41 (用户：「所有道具我要求都是真实的模型，不要用立体简笔画糊弄我」): the buttons carry the real things — the ring-pommel sabre,
  // the willow-leaf dart, the cloth boot (itemModels.ts); the talk bubble stays a sign. (act-50 用户：「跳跃的图标还是用之前的吧，现在这个
  // 草鞋看起来很抽象」: the jump is the act-31 up-arrow badge again, not the straw sandal)
  const real = key === 'attack' ? itemModel('sabre') : key === 'special' ? itemModel('dart') : key === 'dash' ? itemModel('boot') : null;
  if (real) return real;
  const art = key === 'attack' ? 'sabre' : key === 'special' ? 'dart' : key;
  return customIcon3D('ub:' + art, ART[art]);
}
