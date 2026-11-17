// 秘传和几招本事的立体图标（11-18，用户：「强化卡片也难以辨认都是干嘛的，icon造型和描述都很抽象」）。
// 照 icons3d.ts 的厚体素徽章做法（dicehero3d models3d：外轮廓、往里收一圈鼓出来、发光核心），每张按「它挂的那颗键 + 会出什么」画，
// 一眼读得出来：快刀 = 刀 + 三道风线；叠刃 = 两把刀错开；裂甲 = 甲片裂成两半；断骨 = 骨头断开；枭首 = 见底的血条被一刀劈开；
// 见红 = 刀下三滴血；饮血 = 铜爵盛血；搏命 = 半暗的心被刀贯穿；出鞘 = 刀柄离鞘口、露一截亮刃；乘虚 = 刀架断敌刃 + 一颗绿心；
// 游身 = 靴子带一道残影；撒星 = 三枚柳叶镖；刀芒 = 刀尖上一弯月牙。全部横平竖直的大块，没有斜线阶梯、没有碎点。
// 卡面、暂停菜单的「已得」「招式」页和演示用同一套：skillIcon3D(id)。
import { customIcon3D, type Model3D } from '../ui3d/models3d';
import { Mask, extrude, pillow, box, type Set3 } from '../ui3d/models3dArt';
import { btnIcon3D } from './icons3d';
import { hintIconFor, isHintKey } from './ironUi';

const C = {
  st0: 0x2e3440, st1: 0x5c6674, st2: 0x9aa6b6, stE: 0xdce8f4, edgeG: 0xbfe8ff,
  br0: 0x6a4214, br1: 0xb07a2e, br2: 0xe0aa48, brG: 0xffd27a,
  red0: 0x5a0a10, red1: 0xa01c20, red2: 0xd03028, redG: 0xff4a3a,
  lea0: 0x3a2618, lea1: 0x5e3e26, lea2: 0x8a6038,
  ir0: 0x24272e, ir1: 0x4a505c, ir2: 0x7a8290,
  bone0: 0x9a8e78, bone1: 0xd8ccb4, bone2: 0xf2ead8,
  lac0: 0x1e1012, lac1: 0x3e1c18,
  jade0: 0x1e5a40, jade1: 0x3ea878, jadeG: 0x8af0b8,
  wind: 0xcfeeff, ghost0: 0x3a5a7a, ghost1: 0x6a9ac8, ghostG: 0x9ad8ff,
  moonG: 0xe8fff2, moon1: 0x9adcc0,
};

/** a 环首刀 point up: the blade (bright edge left, steel, dark spine) from y0 for L cells centred on cx, the lit edge line in front,
 *  a bronze guard under it, the red grip, the bronze ring pommel at the foot */
function sabre(set: Set3, cx: number, y0: number, L: number, o: { grip?: boolean; edge?: number } = {}) {
  box(set, cx - 1, y0, -1, cx - 1, y0 + L - 1, 0, C.stE); box(set, cx, y0, -1, cx, y0 + L - 1, 0, C.st1); box(set, cx + 1, y0, -1, cx + 1, y0 + L - 2, 0, C.st0);
  box(set, cx - 1, y0 + L, -1, cx, y0 + L, 0, C.st2); box(set, cx - 1, y0 + L + 1, -1, cx - 1, y0 + L + 1, 0, C.stE);
  box(set, cx - 1, y0 + 1, 1, cx - 1, y0 + L - 1, 1, o.edge ?? C.edgeG, 1);
  if (o.grip === false) return;
  box(set, cx - 3, y0 - 2, -2, cx + 3, y0 - 1, 1, C.br1); box(set, cx - 2, y0 - 1, 2, cx + 2, y0 - 1, 2, C.br2);
  box(set, cx - 1, y0 - 7, -1, cx, y0 - 3, 0, C.red1); for (let y = y0 - 7; y <= y0 - 3; y += 2) box(set, cx - 1, y, 1, cx, y, 1, C.red0);
  const ring = new Mask().rect(cx - 2, y0 - 11, cx + 1, y0 - 8).cut(cx - 1, y0 - 10, cx, y0 - 9);
  extrude(set, ring, -1, 0, C.br1); for (const [x, y] of ring.cells()) if (y === y0 - 8) set(x, y, 1, C.br2);
}
/** a blocky heart (broad tiers, no stair of single cells), centred near (0, 0) */
const heartMask = (s = 1, ox = 0, oy = 0) => s === 1
  ? new Mask().rect(ox - 7, oy + 1, ox - 1, oy + 5).rect(ox, oy + 1, ox + 6, oy + 5).rect(ox - 6, oy + 6, ox - 2, oy + 7).rect(ox + 1, oy + 6, ox + 5, oy + 7).rect(ox - 6, oy - 2, ox + 5, oy).rect(ox - 4, oy - 5, ox + 3, oy - 3).rect(ox - 2, oy - 7, ox + 1, oy - 6)
  : new Mask().rect(ox - 3, oy, ox - 1, oy + 2).rect(ox, oy, ox + 2, oy + 2).rect(ox - 2, oy - 2, ox + 1, oy - 1).rect(ox - 1, oy - 3, ox, oy - 3);
/** a drop of blood, point up, its foot at (x, y) */
function drop(set: Set3, x: number, y: number, big = false) {
  const m = big ? new Mask().rect(x - 2, y, x + 1, y + 3).rect(x - 1, y + 4, x, y + 5).rect(x - 1, y - 1, x, y - 1) : new Mask().rect(x - 1, y, x, y + 2).rect(x - 1, y + 3, x - 1, y + 3);
  pillow(set, m, -1, 0, C.red0, C.red2, 0, big ? C.redG : undefined, 1);
}
/** a boot stepping right (the dash button's), its sole at y0 */
function boot(set: Set3, x0: number, y0: number, c0 = C.lea0, c1 = C.lea1, c2 = C.lea2, g = 0) {
  const m = new Mask().rect(x0 + 1, y0 + 5, x0 + 6, y0 + 13).rect(x0, y0, x0 + 10, y0 + 5).rect(x0 + 11, y0, x0 + 12, y0 + 3).cut(x0 + 10, y0 + 5, x0 + 10, y0 + 5).cut(x0 + 12, y0 + 3, x0 + 12, y0 + 3);
  pillow(set, m, -2, 1, c0, c1, g, c2, g);
}
/** a 柳叶镖 point up (the dart button's), its ring at y0 */
function dart(set: Set3, x: number, y0: number, s = 1) {
  const leaf = s === 1 ? new Mask().rect(x - 1, y0 + 4, x, y0 + 5).rect(x - 2, y0 + 6, x + 1, y0 + 8).rect(x - 3, y0 + 9, x + 2, y0 + 13).rect(x - 2, y0 + 14, x + 1, y0 + 16).rect(x - 1, y0 + 17, x, y0 + 18)
    : new Mask().rect(x - 1, y0 + 4, x, y0 + 5).rect(x - 2, y0 + 6, x + 1, y0 + 10).rect(x - 1, y0 + 11, x, y0 + 13);
  pillow(set, leaf, -1, 0, C.st1, C.st2, 0, C.edgeG, 1);
  for (const [cx, cy] of leaf.cells()) if (!leaf.has(cx - 1, cy)) set(cx, cy, 1, C.stE);
  const ring = new Mask().rect(x - 2, y0, x + 1, y0 + 3).cut(x - 1, y0 + 1, x, y0 + 2);
  extrude(set, ring, -1, 0, C.br1); for (const [cx, cy] of ring.cells()) if (cy === y0 + 3) set(cx, cy, 1, C.br2);
  box(set, x - 1, y0 - 5, -1, x, y0 - 1, 0, C.red1); box(set, x - 2, y0 - 7, -1, x + 1, y0 - 6, 0, C.red0);
}
/** the enemy's blade lying across (dull, red-brown), broken at its middle: the two pieces either side of a gap at x = gx */
function brokenBlade(set: Set3, gx: number, y: number, len = 8) {
  box(set, gx + 2, y, -1, gx + 2 + len, y + 1, 0, 0x6a4a44); box(set, gx + 2, y + 2, -1, gx + 1 + len, y + 2, 0, 0x9a7a70);
  box(set, gx - 2 - len, y - 2, -1, gx - 2, y - 1, 0, 0x6a4a44); box(set, gx - 1 - len, y, -1, gx - 2, y, 0, 0x9a7a70);
}
/** a white-gold spark: a plus of glowing cells */
function spark(set: Set3, x: number, y: number, z = 2, c = 0xfff4d0) { box(set, x - 1, y - 3, z, x, y + 2, z, c, 1); box(set, x - 3, y - 1, z, x + 2, y, z, c, 1); }

const ART: Record<string, (set: Set3) => void> = {
  // 快刀: the blade with three wind lines streaming off its right side
  quick: set => {
    sabre(set, -4, -3, 14);
    for (const [y, l] of [[9, 9], [4, 7], [-1, 9]] as const) { box(set, -1, y, 0, -1 + l, y + 1, 0, C.wind, 1); }
  },
  // 叠刃: two blades side by side, the second one a step higher, its edge gold (the cut that follows)
  extra: set => { sabre(set, -4, -5, 12); sabre(set, 4, -1, 12, { edge: C.brG }); },
  // 裂甲: a lamellar plate split in two, the right half dropped a step, a red wound in the gap
  sunder: set => {
    const L = new Mask().rect(-8, -8, -2, 8), R = new Mask().rect(1, -11, 7, 5);
    for (const m of [L, R]) {
      pillow(set, m, -1, 1, C.ir0, C.ir1, 0, C.ir2, 0);
      const ys = [...m.cells()].map(c => c[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), xs = [...m.cells()].map(c => c[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
      for (let y = y0 + 4; y < y1; y += 5) box(set, x0 + 1, y, 3, x1 - 1, y, 3, C.ir0);
      for (const [x, y] of [[x0 + 1, y1 - 1], [x1 - 1, y1 - 1], [x0 + 1, y0 + 1], [x1 - 1, y0 + 1]]) box(set, x, y, 3, x, y, 3, C.br2);
    }
    box(set, -1, -8, -1, 0, 5, 0, C.red1); box(set, -1, -6, 1, 0, 3, 1, C.redG, 1);
  },
  // 断骨: a bone broken at its middle, the right piece knocked up a step
  bone: set => {
    const piece = (x0: number, x1: number, y: number, knobAt: number) => {
      const m = new Mask().rect(x0, y - 1, x1, y + 1).rect(knobAt - 1, y - 4, knobAt + 1, y - 2).rect(knobAt - 1, y + 2, knobAt + 1, y + 4).rect(knobAt - 2, y - 3, knobAt + 2, y + 3);
      pillow(set, m, -1, 1, C.bone0, C.bone1, 0, C.bone2, 0);
    };
    piece(-9, -2, -2, -10); piece(1, 8, 2, 9);
    box(set, -2, -1, 2, -2, 1, 2, C.bone2); box(set, 1, 3, 2, 1, 3, 2, C.bone2);   // the broken ends' bright faces
  },
  // 枭首: a health bar run almost dry, a blade cutting down through it
  behead: set => {
    box(set, -11, -3, -1, 10, 2, 0, C.ir0); box(set, -10, -2, 1, 9, 1, 1, C.red0); box(set, -10, -2, 2, -7, 1, 2, C.redG, 1);
    box(set, -11, 3, -1, 10, 3, 1, C.ir1);
    sabre(set, 3, -6, 18);
  },
  // 见红: a blade lying across the top, three drops falling under it
  bleed: set => {
    box(set, -10, 8, -1, 7, 9, 0, C.st1); box(set, -10, 7, -1, 6, 7, 0, C.stE); box(set, -10, 7, 1, 6, 7, 1, C.edgeG, 1); box(set, 8, 8, -1, 9, 8, 0, C.st2);
    box(set, -13, 7, -2, -11, 10, 1, C.br1); box(set, -16, 8, -1, -14, 9, 0, C.red1);
    drop(set, -7, -4, true); drop(set, 0, 0, true); drop(set, 6, -6, true);
  },
  // 饮血: a bronze cup full of blood, a drop falling into it
  drink: set => {
    const cup = new Mask().rect(-7, 2, 6, 8).rect(-5, -1, 4, 1).rect(-1, -6, 0, -2).rect(-5, -8, 4, -7);
    pillow(set, cup, -2, 1, C.br0, C.br1, 0, C.br2, 0);
    box(set, -6, 7, 2, 5, 8, 3, C.redG, 1); box(set, -6, 6, 2, 5, 6, 2, C.red1);
    box(set, -8, 8, -2, 7, 8, 2, C.br2);
    box(set, -1, 11, -1, 0, 13, 0, C.red2); box(set, -1, 14, -1, -1, 14, 0, C.red2);
  },
  // 搏命: a heart, its left half gone dark, a blade through it
  frenzy: set => {
    const h = heartMask(); const L = new Mask(), R = new Mask();
    for (const [x, y] of h.cells()) (x < 0 ? L : R).s.add(x + ',' + y);
    pillow(set, L, -1, 1, 0x2a0a0e, 0x4a1418, 0, undefined, 0, false); pillow(set, R, -1, 1, C.red0, C.red2, 0, C.redG, 1, false);
    sabre(set, 0, -6, 15, { grip: false }); box(set, -3, -9, -2, 3, -8, 2, C.br1); box(set, -1, -14, -1, 0, -10, 0, C.red1);
  },
  // 出鞘: the scabbard upright, the hilt lifted off its mouth — a bright strip of blade showing between (the moment it leaves)
  draw: set => {
    box(set, -2, -15, -1, 1, -1, 1, C.lac1); box(set, -2, -15, 2, -2, -1, 2, 0x5a2a22); box(set, -3, -1, -2, 2, 0, 2, C.br1); box(set, -3, -16, -2, 2, -15, 2, C.br0);
    box(set, -1, 1, -1, 0, 4, 0, C.stE); box(set, -1, 1, 1, 0, 4, 1, 0xfff4d0, 1);   // the blade showing
    box(set, -4, 5, -2, 3, 6, 1, C.br1); box(set, -3, 6, 2, 2, 6, 2, C.br2);            // the guard
    box(set, -1, 7, -1, 0, 11, 0, C.red1); for (const y of [7, 9, 11]) box(set, -1, y, 1, 0, y, 1, C.red0);
    const ring = new Mask().rect(-2, 12, 1, 15).cut(-1, 13, 0, 14); extrude(set, ring, -1, 0, C.br1);
    for (const s of [-1, 1]) box(set, s < 0 ? -7 : 4, 2, 0, s < 0 ? -5 : 6, 3, 0, C.brG, 1);   // the glint either side of the mouth
  },
  // 乘虚: the 破势 picture (her blade upright, the enemy's broken across it, a spark) and a small green heart (the blood it gives back)
  counter: set => { ART.parry(set); pillow(set, heartMask(0, 8, -10), -1, 0, C.jade0, C.jade1, 0, C.jadeG, 1); },
  // 游身: the boot, and a pale afterimage of it a step behind
  evade: set => {
    boot(set, -14, -4, C.ghost0, C.ghost1, C.ghostG, 1); boot(set, 1, -6);
    box(set, -18, 6, 0, -15, 6, 0, C.wind, 1); box(set, -19, 2, 0, -15, 2, 0, C.wind, 1);
  },
  // 撒星: three darts, the middle one higher
  darts3: set => { dart(set, 0, -6); dart(set, -7, -10, 0); dart(set, 7, -10, 0); },
  // 刀芒: a short blade, a crescent of light flying off its point (an arch of three broad tiers)
  bladeWind: set => {
    sabre(set, 0, -8, 8);
    const moon = new Mask().rect(-6, 10, 5, 12).rect(-10, 7, -7, 10).rect(6, 7, 9, 10).rect(-12, 3, -10, 7).rect(9, 3, 11, 7);
    extrude(set, moon, -1, 0, C.moon1); for (const [x, y] of moon.cells()) set(x, y, 1, C.moonG, 1);
  },
  // ---- the base moves without a button or link picture of their own
  // 藏锋: the blade home in its scabbard, the hum of it either side
  stance: set => {
    box(set, -2, -15, -1, 1, 3, 1, C.lac1); box(set, -2, -15, 2, -2, 3, 2, 0x5a2a22); box(set, -3, 3, -2, 2, 4, 2, C.br1); box(set, -3, -16, -2, 2, -15, 2, C.br0);
    box(set, -4, 5, -2, 3, 6, 1, C.br1); box(set, -3, 6, 2, 2, 6, 2, C.br2);
    box(set, -1, 7, -1, 0, 11, 0, C.red1); for (const y of [7, 9, 11]) box(set, -1, y, 1, 0, y, 1, C.red0);
    const ring = new Mask().rect(-2, 12, 1, 15).cut(-1, 13, 0, 14); extrude(set, ring, -1, 0, C.br1);
    for (const y of [-8, -2]) { box(set, -7, y, 0, -5, y + 1, 0, C.brG, 1); box(set, 4, y, 0, 6, y + 1, 0, C.brG, 1); }
  },
  // 破势: her blade upright, the enemy's blade broken across it, a white-gold spark where they met
  parry: set => { sabre(set, -1, -5, 16); brokenBlade(set, -1, 3); spark(set, -1, 4); },
  // 不见刀: the blade, eight gold streaks round it (the eight cuts)
  ult: set => {
    sabre(set, 0, -4, 12);
    for (const [x, y, w, h] of [[-1, 13, 2, 3], [-1, -19, 2, 3], [-13, -2, 3, 2], [11, -2, 3, 2], [-10, 8, 2, 2], [9, 8, 2, 2], [-10, -12, 2, 2], [9, -12, 2, 2]] as const) box(set, x, y, 0, x + w - 1, y + h - 1, 1, C.brG, 1);
  },
};
export const SKILL_ART_IDS = Object.keys(ART);

/** a picture by id: 'btn:attack' (a button's own), 'hint:dcut' (a move link's — the one its button turns over to), a boon id or one of
 *  the base moves' (stance / parry / ult); unknown → the sabre */
export function skillIcon3D(id: string): Model3D {
  if (id.startsWith('btn:')) return btnIcon3D(id.slice(4) as 'attack');
  if (id.startsWith('hint:')) { const k = id.slice(5); return isHintKey(k) ? hintIconFor(k) : btnIcon3D('attack'); }
  const k = id.startsWith('sk:') ? id.slice(3) : id;
  return ART[k] ? customIcon3D('skill:' + k, ART[k]) : btnIcon3D('attack');
}
