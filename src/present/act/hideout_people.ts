// 据点五人（docs/STORY.md §6，外貌卡 7–11）：杜五、鬼针孙媪、冯铁臂、卢昭、桓越，和杜五的灰驴。
// act-22 起用细格子：一格 3.5 厘米（场景格的一半，场景一格 = 人 2×2×2 格），人约 54～59 格高。骨骼名字、父子关系和关节位置都是
// 7 厘米版的 × 2（米数一样），所以待机动作（POSE_HOOKS）照旧；部件也和原来一一对应（一个部件一个网格、一次 draw call）。
// 细格子的用法照细白发女（heroineFine.ts）：小臂、手、小腿比 × 2 再细一格，手小；刀、针、飘带、布尾一格薄；脸干净，女性平脸不出鼻子、
// 鼻下不压阴影，男性鼻子凸一格。多出来的精度只给认人的细节：杜五的发束、汗巾和缺两指的左手；孙媪的低髻、白翳左眼、银针和药葫芦；
// 冯铁臂右腕断口上绑着套筒焊死的方锤、围裙、伤疤；卢昭的黑氅、绯红深衣、步摇（克制）；桓越的四尺汉剑、暗红抹额、血斑、削平的散发。
// 待机（POSE_HOOKS）：杜五坐不住（搓手、挠头、东张西望、换脚、点脚尖）；孙媪不动，只微微晃，隔一阵举针看；冯铁臂一锤一锤慢慢
// 打（锤落迸火星）；卢昭端着看竹简，隔一阵抬眼；桓越坐在石阶最下一级（座高 0.35 米），拄着插在地上的剑，隔一阵举葫芦喝一口。
// 美术铁律：横平竖直的大块，2～3 档颜色，不撒随机点，不走斜线台阶（只在角上、下巴、尖上切一格）。
import * as THREE from 'three';
import { CELL, rbox } from '../bestiary/kit';
import { ROSTER, type ModelDef } from '../bestiary/models';
import { POSE_HOOKS } from '../bestiary/poseHooks';
import { rot, mov, type Bone } from '../actors/rig';
import { VoxChar, type Col } from '../look/voxkit';
import { fxSparks } from '../fx/fx';

// ------------------------------------------------------------------ shared bits
type V = VoxChar;
/** a fine figure: cells half a scene cell (3.5 cm), so a scene block is exactly 2×2×2 of them */
const fine = () => new VoxChar(CELL / 2);
/** a box in one part */
const B = (v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null) => v.part(part).box(x0, y0, z0, x1, y1, z1, c);
/** a box with its four vertical edges cut one cell in (and its top ring too, when top): a softer mass */
const R = (v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, top = false) => { v.part(part); rbox(v, x0, y0, z0, x1, y1, z1, c, 1, top); };
/** a box with vertical corners chamfered by r cells (clean rounded sculptural form, zero stair-steps) */
function C2(v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, r = 2) {
  v.part(part);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const ex = Math.min(x - x0, x1 - x), ez = Math.min(z - z0, z1 - z);
    if (ex + ez < r) continue;
    for (let y = y0; y <= y1; y++) v.set(x, y, z, c);
  }
}
/** a box on the left limb (part + 'L') and its mirror (cell x ↔ −1 − x) on the right (part + 'R') */
const LR = (v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null) => {
  B(v, part + 'L', x0, y0, z0, x1, y1, z1, c); B(v, part + 'R', -1 - x1, y0, z0, -1 - x0, y1, z1, c);
};
/** a box and its mirror, both in one part */
const S = (v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null) => {
  B(v, part, x0, y0, z0, x1, y1, z1, c); B(v, part, -1 - x1, y0, z0, -1 - x0, y1, z1, c);
};
/** a band one cell proud round the column x0..x1 × z0..z1, rows y0..y1, its outer corners cut and the column's own (chamfered) corners
 *  filled: a belt, a headband, a ridge round a sleeve */
function ring(v: V, part: string, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, c: Col) {
  v.part(part);
  for (let y = y0; y <= y1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) for (let z = z0 - 1; z <= z1 + 1; z++) {
    const ox = x < x0 || x > x1, oz = z < z0 || z > z1;
    if (ox && oz) continue;
    if (ox || oz || ((x === x0 || x === x1) && (z === z0 || z === z1))) v.set(x, y, z, c);
  }
}
/** a slab facing ±z with its four corners cut k cells square: a round thing seen face on (the wok) */
function slab(v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, k: number) {
  B(v, part, x0, y0, z0, x1, y1, z1, c);
  for (const [xa, xb] of [[x0, x0 + k - 1], [x1 - k + 1, x1]]) for (const [ya, yb] of [[y0, y0 + k - 1], [y1 - k + 1, y1]]) B(v, part, xa, ya, z0, xb, yb, z1, null);
}
/** the cast's biped joints in fine cells: each one the 7 cm model's × 2 (so the poses move the same metres). back: the torso's depth */
interface Rig { hip: number; spine: number; chest: number; neck: number; head: number; hat: number; ax: number; az?: number; sh: number; elbow: number; wrist: number; grip: number; lx: number; knee: number; back: number }
function rig(v: V, r: Rig) {
  const az = r.az ?? 0;
  v.bone('hips', 'root', 0, r.hip, 0).bone('spine', 'hips', 0, r.spine, 0).bone('chest', 'spine', 0, r.chest, 0)
    .bone('neck', 'chest', 0, r.neck, 0).bone('head', 'neck', 0, r.head, 0).bone('jaw', 'head', 0, r.head + 4, 2).bone('hat', 'head', 0, r.hat, 0)
    .bone('cape', 'chest', 0, r.neck - 2, -r.back);
  for (const [s, L] of [[1, 'L'], [-1, 'R']] as const) {
    const x = s * r.ax;
    v.bone('sh' + L, 'chest', x, r.sh, az).bone('arm' + L, 'sh' + L, x, r.sh, az).bone('fore' + L, 'arm' + L, x, r.elbow, az).bone('hand' + L, 'fore' + L, x, r.wrist, az);
  }
  v.bone('weapon', 'handR', -r.ax, r.grip, az).bone('offhand', 'handL', r.ax, r.grip, az);
  for (const [s, L] of [[1, 'L'], [-1, 'R']] as const) v.bone('leg' + L, 'hips', s * r.lx, r.hip, 0).bone('shin' + L, 'leg' + L, s * r.lx, r.knee, 0).bone('foot' + L, 'shin' + L, s * r.lx, 4, 0);
}
/** move every cell of the parts `from` into part `into` (a part that never moves on its own needn't be its own mesh) */
function fuse(v: V, into: string, ...from: string[]) { for (const c of v.cells.values()) if (from.includes(c.part)) c.part = into; }
/** the usual merge for a figure that stands still: neck into chest, jaw / hat into head, the hands into the forearms */
function fuseStill(v: V) { fuse(v, 'chest', 'spine', 'neck'); fuse(v, 'head', 'jaw', 'hat'); fuse(v, 'foreL', 'handL', 'offhand'); fuse(v, 'foreR', 'handR'); }
/** the slim cast's hands: small (3 wide, 4 tall, 3 deep), a thumb forward on the inner side, the outer side a shade darker */
function hands(v: V, y0: number, skin: Col, shade: Col) {
  LR(v, 'hand', 6, y0, -2, 8, y0 + 3, 0, skin); LR(v, 'hand', 8, y0, -2, 8, y0 + 2, 0, shade); LR(v, 'hand', 6, y0 + 2, 1, 6, y0 + 3, 1, skin);
}

// motion helpers
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ss = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** a window over a cycle position x: rises over [a, a + e], holds, falls over [b − e, b] */
const win = (x: number, a: number, b: number, e = 0.4) => ss(a, a + e, x) * (1 - ss(b - e, b, x));

// ================================================================== 杜五（赶车伙夫）
// 照立绘 duwu.png 重构：二十二岁，圆润微暖的脸，斜八字眉、亮眼、下巴正中一小撮深棕胡茬、露耳；层叠灰褐布包头巾，头顶露出束起的深棕发髻，
// 左耳后垂布结与双带；暖土橙补丁交领短褐配深棕宽领缘与米白内领、左肩厚叠米白汗巾；背后编织棕竹背篓（口内嵌黑铁炒锅），腰插剁骨菜刀、
// 右胯挂麻绳；左手缺两指；双腿保留分节骨骼（走路/蹲下自然弯折）。
function buildDuwu(): V {
  const v = fine();
  const C = {
    SKIN: 0xe69f66, SKIN_D: 0xbf7a48, JK: 0xa8642e, JK_D: 0x703e1d, JK_L: 0xc27a3e, LAPEL: 0x7e4624,
    PATCH: 0x864728, PATCH_D: 0x5c2e18, TROU: 0x5c5042, TROU_L: 0x7a6c5a, STRAW: 0xc8a45c, STRAW_D: 0x8e7038,
    WRAP: 0x9b8a7e, WRAP_D: 0x6f5f55, WRAP_L: 0xb8a89a, HAIR: 0x3b2a22, HAIR_L: 0x5c4234, STUB: 0x4b382e, MOUTH: 0x7a422e,
    LINEN: 0xede2cf, TOWEL: 0xebe2d2, TOWEL_D: 0xbdb09c, BASKET: 0x9e6334, BASKET_D: 0x6b3e1c, BASKET_L: 0xc28046,
    WOK: 0x2a2a30, WOK_L: 0x4e4e58, ROPE: 0xa48050, ROPE_D: 0x725232, BLADE: 0xaeb4bc, HAFT: 0x5c3e26, EYE: 0x241816,
  };
  rig(v, { hip: 20, spine: 24, chest: 30, neck: 36, head: 40, hat: 54, ax: 8, sh: 36, elbow: 28, wrist: 20, grip: 18, lx: 4, knee: 10, back: 4 });
  // ---------------------------------------------------------------- legs: rolled trousers, bare shins, straw sandals (separate bones for walk/squat)
  LR(v, 'leg', 2, 10, -2, 5, 19, 1, C.TROU);
  LR(v, 'shin', 2, 8, -2, 5, 9, 1, C.TROU_L); LR(v, 'shin', 3, 4, -2, 5, 7, 0, C.SKIN);
  LR(v, 'foot', 2, 0, -2, 5, 0, 4, C.STRAW_D); LR(v, 'foot', 2, 1, -2, 5, 1, 4, C.SKIN); LR(v, 'foot', 2, 2, -2, 5, 2, 2, C.SKIN); LR(v, 'foot', 3, 3, -2, 5, 3, 0, C.SKIN);
  LR(v, 'foot', 2, 1, -2, 5, 2, -2, C.STRAW); LR(v, 'foot', 2, 1, 0, 5, 2, 0, C.STRAW);
  // ---------------------------------------------------------------- warm amber-ochre patched short jacket + deep-brown crossed lapel + cream inner collar
  C2(v, 'hips', -6, 20, -4, 5, 23, 3, C.JK, 2);
  R(v, 'legL', 0, 14, -4, 5, 19, 3, C.JK); R(v, 'legR', -6, 14, -4, -1, 19, 3, C.JK);
  for (const L of ['legL', 'legR']) v.paint(c => (c.y === 14 ? C.JK_D : null), L);
  B(v, 'legR', -6, 16, 3, -4, 18, 3, C.PATCH);
  C2(v, 'spine', -6, 24, -4, 5, 29, 3, C.JK, 2); v.paint(c => (c.y <= 25 ? C.ROPE : null), 'spine');
  B(v, 'spine', -4, 24, 4, -3, 25, 4, C.ROPE_D); B(v, 'hips', -4, 20, 4, -4, 23, 4, C.ROPE); B(v, 'hips', -3, 21, 4, -3, 23, 4, C.ROPE);
  C2(v, 'chest', -7, 30, -4, 6, 35, 3, C.JK, 2); C2(v, 'chest', -5, 36, -3, 4, 36, 2, C.JK_L, 2);
  B(v, 'neck', -2, 36, -2, 1, 39, 1, C.SKIN); B(v, 'neck', -2, 36, -2, 1, 36, 1, C.SKIN_D);
  // Crisp pale-cream inner collar & rich brown crossed lapel matching duwu.png
  B(v, 'chest', -2, 34, 3, 1, 36, 3, C.LINEN); B(v, 'chest', -2, 36, 2, 1, 36, 2, C.LINEN);
  B(v, 'chest', -3, 32, 3, -2, 35, 3, C.LAPEL); B(v, 'chest', 1, 30, 3, 3, 35, 3, C.LAPEL);
  B(v, 'spine', -1, 26, 3, 1, 29, 3, C.LAPEL); B(v, 'chest', -1, 30, 3, 0, 33, 3, C.LAPEL);
  // Crisp square shoulder patch on right shoulder (portrait)
  B(v, 'chest', -7, 33, 0, -5, 35, 3, C.PATCH); B(v, 'chest', -7, 33, 3, -5, 33, 3, C.PATCH_D);
  // ---------------------------------------------------------------- arms: sloped rolled sleeves with crisp patches, bare forearms, 3-fingered left hand
  LR(v, 'arm', 6, 28, -2, 9, 35, 1, C.JK); LR(v, 'arm', 6, 35, -2, 9, 35, 1, C.JK_L); LR(v, 'arm', 9, 35, -2, 9, 35, 1, null);
  B(v, 'armR', -10, 31, -1, -10, 33, 1, C.PATCH); B(v, 'armL', 7, 29, 1, 9, 31, 1, C.PATCH); B(v, 'armL', 7, 29, 1, 9, 29, 1, C.PATCH_D);
  LR(v, 'fore', 6, 26, -2, 9, 27, 1, C.JK_L); LR(v, 'fore', 6, 20, -2, 8, 25, 0, C.SKIN);
  hands(v, 16, C.SKIN, C.SKIN_D);
  B(v, 'handL', 6, 16, -2, 8, 17, -2, null);
  // Prominent thick folded off-white sweat towel draped over left shoulder (duwu.png signature!)
  C2(v, 'chest', 2, 35, -5, 6, 37, 4, C.TOWEL, 1);
  B(v, 'chest', 2, 26, 4, 6, 36, 4, C.TOWEL); B(v, 'chest', 5, 27, 4, 6, 35, 4, C.TOWEL_D);
  B(v, 'chest', 2, 26, 4, 6, 26, 4, C.TOWEL_D); B(v, 'chest', 2, 31, -5, 6, 35, -5, C.TOWEL_D);
  // ---------------------------------------------------------------- woven brown wicker back-basket (duwu.png!) with black iron wok nested on its back
  C2(v, 'chest', -7, 22, -10, 7, 36, -5, C.BASKET, 2);
  // Horizontal woven reed bands & thick woven top rim visible behind his left shoulder
  for (const y of [24, 28, 32]) B(v, 'chest', -7, y, -10, 7, y, -5, C.BASKET_D);
  C2(v, 'chest', -8, 35, -11, 8, 37, -5, C.BASKET_L, 2);
  B(v, 'chest', -6, 36, -9, 6, 37, -6, C.BASKET_D);
  // Black iron wok strapped snugly across the back face of the wicker basket
  slab(v, 'chest', -6, 23, -12, 5, 34, -11, C.WOK, 2); slab(v, 'chest', -3, 26, -13, 2, 31, -13, C.WOK_L, 1);
  // Rope coil at right hip & cleaver tucked into the belt in front
  B(v, 'hips', -8, 13, -10, -7, 20, -3, C.ROPE); B(v, 'hips', -8, 15, -8, -7, 18, -5, null);
  for (const y of [13, 20]) for (const z of [-10, -3]) B(v, 'hips', -8, y, z, -7, y, z, null);
  B(v, 'hips', -8, 13, -9, -7, 13, -4, C.ROPE_D);
  B(v, 'hips', 0, 15, 4, 3, 20, 4, C.BLADE); B(v, 'hips', 0, 15, 4, 3, 15, 4, 0xeef2f8); B(v, 'hips', 1, 21, 4, 2, 23, 4, C.HAFT); B(v, 'spine', 1, 24, 4, 2, 26, 4, C.HAFT);
  // ---------------------------------------------------------------- head: warm youthful round face, layered taupe headwrap, neat dark-brown topknot bun & left-ear tails
  C2(v, 'head', -6, 42, -5, 5, 52, 5, C.SKIN, 2);
  C2(v, 'head', -4, 40, -4, 3, 41, 4, C.SKIN, 1);
  v.paint(({ y, z }) => z <= -3 && y >= 43 ? C.HAIR : undefined, 'head');
  S(v, 'head', 5, 43, -1, 6, 47, 1, C.SKIN); S(v, 'head', 6, 44, 0, 6, 46, 0, C.SKIN_D);
  S(v, 'head', 4, 46, 2, 5, 49, 4, C.HAIR);
  // Layered warm grey-taupe cloth headwrap (clean horizontal folds)
  C2(v, 'head', -7, 50, -6, 6, 53, 6, C.WRAP, 2);
  C2(v, 'head', -6, 54, -6, 5, 55, 5, C.WRAP_L, 2);
  B(v, 'head', -5, 51, 6, 4, 51, 6, C.WRAP_D); B(v, 'head', -5, 53, 6, 4, 53, 6, C.WRAP_L);
  // Topknot bun peeking out the top, bound with a cloth ring
  C2(v, 'head', -3, 56, -4, 2, 56, 1, C.WRAP_D, 1);
  C2(v, 'head', -3, 57, -4, 2, 60, 1, C.HAIR, 1);
  B(v, 'head', -1, 59, 0, 1, 60, 1, C.HAIR_L);
  // Cloth knot + twin hanging tails behind his left ear (duwu.png!)
  C2(v, 'head', 5, 48, -6, 7, 51, -3, C.WRAP, 1);
  B(v, 'head', 6, 42, -6, 7, 48, -5, C.WRAP_D); B(v, 'head', 7, 44, -4, 8, 48, -3, C.WRAP);
  // Worried/kind tilted brows, bright dark eyes, 1-cell nose, warm smile & tiny chin goatee tuft
  B(v, 'head', -4, 47, 5, -3, 47, 5, C.HAIR); B(v, 'head', -2, 48, 5, -1, 48, 5, C.HAIR);
  B(v, 'head', 1, 48, 5, 2, 48, 5, C.HAIR); B(v, 'head', 3, 47, 5, 4, 47, 5, C.HAIR);
  S(v, 'head', 1, 45, 5, 4, 46, 5, C.LINEN); S(v, 'head', 2, 45, 5, 3, 46, 5, C.EYE);
  B(v, 'head', -1, 44, 6, 0, 44, 6, C.SKIN); B(v, 'head', -1, 43, 5, 0, 43, 5, C.SKIN_D);
  B(v, 'head', -2, 42, 5, 1, 42, 5, C.MOUTH);
  B(v, 'head', -1, 40, 4, 0, 40, 4, C.STUB);
  fuseStill(v);
  return v;
}

// ================================================================== 鬼针孙媪（暴室医婆）
// 照立绘 sunao.png 重构：六十二岁，瘦削高颧窄颌，女性平脸不出鼻子；严厉皱眉、右眼锐黑、左眼惨白盲翳、嘴角下撇；银白发丝后梳饱满低髻、
// 横插暖色骨簪；深暗枣红交领长衣配暖褐领缘，两节可动喇叭裙摆，腰悬药葫芦皮囊，右指银针、左执刮骨小刀。
function buildSunao(): V {
  const v = fine();
  const C = {
    SKIN: 0xd99b6c, SKIN_D: 0xad744c, WRINKLE: 0xba7d54, ROBE: 0x452228, ROBE_D: 0x2c151a, ROBE_L: 0x733c44, JACKET: 0x582c32, BINDING: 0x9b6644,
    HAIR: 0xc2b6bc, HAIR_D: 0x8d8088, HAIR_L: 0xe0d6d8, BONE: 0xdfa97a, BONE_D: 0xa6744e, BELT: 0x4a3020, BELT_L: 0x6a4a30,
    GOURD: 0xba7e36, GOURD_D: 0x855322, CORD: 0x742624, EYE: 0x281818, EYE_W: 0xebd4c0, BLIND: 0xe6dcd0, MOUTH: 0x6e4036,
    NEEDLE: 0xeef2f8, KNIFE: 0xa0a6b0, SHOE: 0x2a2224,
  };
  rig(v, { hip: 18, spine: 22, chest: 28, neck: 34, head: 36, hat: 50, ax: 8, sh: 34, elbow: 26, wrist: 18, grip: 16, lx: 4, knee: 10, back: 4 });
  v.bone('robe1', 'hips', 0, 19, 0).bone('robe2', 'robe1', 0, 10, 0);
  // ---------------------------------------------------------------- articulated 2-tier A-line flared plum-burgundy skirt (robe1 -> robe2)
  C2(v, 'robe2', -8, 0, -6, 7, 1, 5, C.ROBE_D, 2); C2(v, 'robe2', -8, 2, -6, 7, 5, 5, C.ROBE, 2); C2(v, 'robe2', -7, 6, -5, 6, 9, 4, C.ROBE, 2);
  C2(v, 'robe1', -6, 10, -5, 5, 19, 4, C.JACKET, 2); C2(v, 'robe1', -6, 10, -5, 5, 10, 4, C.ROBE_D, 2);
  C2(v, 'hips', -6, 20, -5, 5, 21, 4, C.JACKET, 2);
  B(v, 'robe1', -3, 11, 4, -2, 19, 4, C.ROBE_L); B(v, 'hips', -3, 20, 4, -2, 21, 4, C.ROBE_L);
  S(v, 'robe2', 2, 0, 5, 4, 1, 5, C.SHOE);
  C2(v, 'spine', -5, 22, -4, 4, 27, 3, C.JACKET, 1);
  C2(v, 'spine', -6, 22, -4, 5, 23, 4, C.BELT, 1);
  C2(v, 'chest', -7, 28, -4, 6, 33, 3, C.JACKET, 2); C2(v, 'chest', -5, 34, -3, 4, 34, 2, C.ROBE_L, 2);
  B(v, 'neck', -2, 34, -2, 1, 36, 2, C.SKIN); B(v, 'neck', -2, 34, -2, 1, 34, 2, C.SKIN_D);
  // Clean warm russet-brown crossed V-lapel trim over deep plum-burgundy robe (sunao.png!)
  B(v, 'chest', -1, 33, 3, 0, 34, 3, C.SKIN);
  B(v, 'chest', -3, 32, 3, -2, 34, 3, C.BINDING); B(v, 'chest', 1, 32, 3, 2, 34, 3, C.BINDING);
  B(v, 'chest', -2, 30, 3, -1, 31, 3, C.BINDING); B(v, 'chest', 0, 28, 3, 1, 31, 3, C.BINDING);
  B(v, 'spine', 1, 24, 3, 2, 27, 3, C.BINDING); B(v, 'chest', -3, 29, 3, -2, 29, 3, C.ROBE_D);
  // ---------------------------------------------------------------- leather pouch & medicine gourds on red cords
  B(v, 'hips', -8, 12, -6, -7, 19, -3, C.BELT_L); B(v, 'hips', -8, 18, -6, -7, 19, -3, C.BELT); B(v, 'hips', -7, 20, -4, -7, 21, -4, C.BELT);
  const gourd = (x: number, w: number, y: number, small: boolean) => {
    const x1 = x + w - 1, m0 = x + (w > 2 ? 1 : 0), m1 = x1 - (w > 2 ? 1 : 0);
    B(v, 'hips', x, y, 5, x1, y + (small ? 2 : 3), small ? 6 : 7, C.GOURD); B(v, 'hips', x, y, 5, x1, y, small ? 6 : 7, C.GOURD_D);
    B(v, 'hips', m0, y + (small ? 2 : 3), small ? 6 : 7, m1, y + (small ? 2 : 3), small ? 6 : 7, 0xd4964c);
    const t = y + (small ? 3 : 4);
    B(v, 'hips', m0, t, 5, m1, t, 6, C.GOURD_D); if (!small) B(v, 'hips', m0, t + 1, 5, m1, t + 2, 6, C.GOURD);
    B(v, 'hips', m0, t + (small ? 1 : 3), 5, m0, 23, 5, C.CORD);
  };
  gourd(-6, 4, 15, false); gourd(-1, 2, 17, true); gourd(3, 4, 14, false);
  // ---------------------------------------------------------------- sloped narrow sleeves, small bony hands, silver needles & bone knife
  LR(v, 'arm', 6, 26, -2, 9, 33, 1, C.JACKET); LR(v, 'arm', 6, 33, -2, 9, 33, 1, C.ROBE_L); LR(v, 'arm', 9, 33, -2, 9, 33, 1, null);
  LR(v, 'fore', 6, 18, -2, 8, 25, 0, C.JACKET); LR(v, 'fore', 6, 18, -2, 8, 18, 0, C.ROBE_D);
  hands(v, 14, C.SKIN, C.SKIN_D);
  B(v, 'weapon', -8, 14, 1, -8, 14, 4, C.NEEDLE); B(v, 'weapon', -8, 16, 1, -8, 16, 6, C.NEEDLE);
  B(v, 'offhand', 7, 15, 1, 7, 16, 1, C.BELT); B(v, 'offhand', 7, 15, 2, 7, 16, 5, C.KNIFE); B(v, 'offhand', 7, 16, 5, 7, 16, 5, null);
  // ---------------------------------------------------------------- strictly flat female face (ZERO nose!), mature sculpted cheekbones, swept silver hair & low bun + bone pin
  C2(v, 'head', -5, 39, -5, 4, 49, 5, C.SKIN, 2);
  C2(v, 'head', -4, 37, -4, 3, 38, 4, C.SKIN, 1);
  S(v, 'head', 5, 41, -1, 6, 44, 1, C.SKIN); S(v, 'head', 6, 42, 0, 6, 43, 0, C.SKIN_D);
  // Swept silver-white streaked hair (smooth rounded crown + clean silver highlight bands)
  C2(v, 'head', -6, 46, -6, 5, 50, 4, C.HAIR, 2);
  C2(v, 'head', -5, 51, -6, 4, 52, 3, C.HAIR_L, 2);
  B(v, 'head', -6, 45, -5, -5, 49, 4, C.HAIR); B(v, 'head', 4, 45, -5, 5, 49, 4, C.HAIR);
  B(v, 'head', -4, 48, 5, 3, 49, 5, C.HAIR); B(v, 'head', -2, 49, 5, 1, 49, 5, C.HAIR_L);
  S(v, 'head', 5, 48, -4, 5, 48, 2, C.HAIR_L); S(v, 'head', 5, 46, -5, 5, 46, -1, C.HAIR_D);
  // Full round low nape bun + horizontal warm bone hairpin extending cleanly past the bun
  C2(v, 'head', -5, 40, -6, 4, 45, -3, C.HAIR_D, 2);
  C2(v, 'head', -4, 39, -9, 3, 45, -5, C.HAIR, 2);
  B(v, 'head', -3, 44, -8, 2, 44, -6, C.HAIR_L); B(v, 'head', -3, 40, -9, 2, 40, -8, C.HAIR_D);
  B(v, 'head', -7, 42, -7, 7, 42, -7, C.BONE); B(v, 'head', -7, 42, -7, -6, 42, -7, C.BONE_D);
  // Stern angled brows, dark right eye, milky-white blind left eye, subtle frown (ZERO nose!)
  B(v, 'head', -4, 45, 5, -2, 45, 5, C.HAIR_D); B(v, 'head', 1, 45, 5, 3, 45, 5, C.HAIR_D);
  B(v, 'head', -4, 43, 5, -2, 43, 5, C.EYE_W); B(v, 'head', -3, 43, 5, -3, 43, 5, C.EYE);
  B(v, 'head', 1, 43, 5, 3, 43, 5, C.BLIND);
  S(v, 'head', 3, 41, 5, 4, 41, 5, C.WRINKLE);
  B(v, 'head', -2, 39, 5, 1, 39, 5, C.MOUTH);
  fuseStill(v); fuse(v, 'foreR', 'weapon');
  return v;
}

// ================================================================== 冯铁臂（独腕老匠）
// 照立绘 fengtiebi.png 重构：五十岁，魁梧如铁塔；灰白头发后梳成高丸子发髻、深棕布带缠扎并垂双带于脑后；浓黑粗眉、左颊斜疤、满口修整灰白络腮胡；
// 穿土褐粗麻短袖交领工衣（领口露米白中衣、双袖卷起系米白布圈与深棕绳结），外罩深棕厚牛皮铁匠围裙（宽皮肩带+方形金属扣）；
// 保留右小臂熟铁套筒焊死方锤与左手火钳夹红热刀坯，保证 FENG_STRIKE 砸砧火星完全一致。
/** where his strike lands, in his own frame (metres: x to his left, up, forward): the anvil is built under it (hideout.ts) */
export const FENG_STRIKE = { x: -0.49, y: 0.7, z: 0.665 };
function buildFeng(): V {
  const v = fine();
  const C = {
    SKIN: 0xd9925c, SKIN_D: 0xad6e40, SCAR: 0x9e5e3c,
    HAIR: 0xa89f9a, HAIR_L: 0xc8c0ba, HAIR_D: 0x78706c,
    BEARD: 0x9e9792, BEARD_L: 0xc4bdb8, BEARD_D: 0x6f6864, BROW: 0x241a18, TIE: 0x543624, TIE_D: 0x382216,
    TUNIC: 0xb08358, TUNIC_D: 0x825c3a, TUNIC_L: 0xc99c70, LINEN: 0xdfcdb2, LINEN_D: 0xb59f80,
    APRON: 0x452d28, APRON_D: 0x2c1b18, APRON_L: 0x5e4038, CLASP: 0x8a6446, CLASP_D: 0x261816,
    TROU: 0x5c4c3c, TROU_D: 0x403428, SHOE: 0x26201c, IRON: 0x42444c, IRON_L: 0x6c707c, IRON_D: 0x282a30,
    HOT: 0xff7a30, HOT_L: 0xffb058, EYE: 0x1a1210,
  };
  rig(v, { hip: 22, spine: 26, chest: 34, neck: 42, head: 44, hat: 58, ax: 13, az: 1, sh: 42, elbow: 32, wrist: 24, grip: 22, lx: 5, knee: 12, back: 6 });
  // ---------------------------------------------------------------- coarse hemp trousers & heavy smith boots
  LR(v, 'leg', 2, 12, -2, 7, 21, 3, C.TROU);
  LR(v, 'shin', 3, 6, -2, 7, 11, 2, C.TROU); LR(v, 'shin', 3, 4, -2, 7, 5, 2, C.TROU_D);
  LR(v, 'foot', 2, 0, -2, 7, 1, 5, C.SHOE); LR(v, 'foot', 2, 2, -2, 7, 3, 3, C.SHOE);
  // ---------------------------------------------------------------- warm tan coarse-hemp short-sleeved Han work tunic + crisp pale inner collar (fengtiebi.png!)
  C2(v, 'hips', -8, 22, -6, 7, 25, 5, C.TROU, 2);
  C2(v, 'spine', -8, 26, -6, 7, 33, 5, C.TUNIC, 2);
  C2(v, 'chest', -12, 34, -6, 11, 41, 5, C.TUNIC, 2);
  C2(v, 'chest', -10, 42, -5, 9, 42, 4, C.TUNIC_L, 2);
  B(v, 'neck', -4, 42, -4, 3, 43, 3, C.SKIN); B(v, 'neck', -4, 42, -4, 3, 42, 3, C.SKIN_D);
  // Pale-cream crossed inner collar at his throat
  B(v, 'chest', -4, 39, 5, 3, 41, 5, C.LINEN); B(v, 'chest', -3, 40, 5, 2, 41, 5, C.SKIN);
  B(v, 'chest', -4, 41, 4, 3, 41, 4, C.LINEN); B(v, 'chest', -2, 38, 5, 1, 39, 5, C.LINEN);
  B(v, 'chest', -1, 39, 5, 0, 39, 5, C.LINEN_D);
  // ---------------------------------------------------------------- deep dark-chocolate leather blacksmith apron with wide straps & square clasps (fengtiebi.png!)
  B(v, 'chest', -7, 34, 6, 6, 38, 6, C.APRON); B(v, 'chest', -7, 38, 6, 6, 38, 6, C.APRON_L);
  for (const x of [-7, 5]) {
    B(v, 'chest', x, 39, 6, x + 1, 42, 6, C.APRON);
    B(v, 'chest', x, 43, -7, x + 1, 43, 6, C.APRON);
    B(v, 'chest', x, 30, -7, x + 1, 42, -7, C.APRON);
    // Square metal/leather clasp at each bib corner
    B(v, 'chest', x, 37, 7, x + 1, 38, 7, C.CLASP); B(v, 'chest', x, 37, 7, x, 37, 7, C.CLASP_D);
  }
  B(v, 'spine', -8, 26, 6, 7, 33, 6, C.APRON);
  B(v, 'hips', -8, 22, 6, 7, 25, 6, C.APRON); B(v, 'hips', -8, 10, 4, 7, 21, 6, C.APRON); B(v, 'hips', -8, 10, 6, 7, 10, 6, C.APRON_L);
  B(v, 'spine', -8, 30, -7, 7, 31, -7, C.APRON); B(v, 'spine', -9, 30, -6, -9, 31, 5, C.APRON); B(v, 'spine', 8, 30, -6, 8, 31, 5, C.APRON);
  B(v, 'spine', -2, 29, -8, 1, 32, -8, C.APRON_D); B(v, 'spine', -2, 24, -8, -1, 28, -8, C.APRON_D); B(v, 'spine', 0, 25, -8, 1, 28, -8, C.APRON_D);
  // ---------------------------------------------------------------- hulking arms: tan short sleeves with pale rolled cuffs & brown ties; iron hammer prosthetic on right!
  LR(v, 'arm', 10, 34, -2, 15, 41, 3, C.TUNIC); LR(v, 'arm', 10, 41, -2, 15, 41, 3, C.TUNIC_L); LR(v, 'arm', 15, 41, -2, 15, 41, 3, null);
  // Rolled pale-cream cuff bands with dark-brown knots on both upper arms (fengtiebi.png!)
  LR(v, 'arm', 10, 32, -2, 15, 33, 3, C.LINEN); LR(v, 'arm', 15, 32, 0, 16, 33, 1, C.TIE); LR(v, 'arm', 15, 30, 0, 16, 31, 1, C.TIE_D);
  // Left bare muscular forearm + hand holding blacksmith tongs
  B(v, 'foreL', 10, 24, -2, 14, 31, 2, C.SKIN);
  B(v, 'handL', 11, 20, -2, 14, 23, 1, C.SKIN); B(v, 'handL', 11, 20, 1, 14, 21, 1, C.SKIN_D);
  // Right iron prosthetic sleeve + welded square forging hammer (exact strike coords preserved!)
  B(v, 'foreR', -16, 24, -2, -11, 31, 3, C.IRON);
  ring(v, 'foreR', -16, -11, -2, 3, 25, 25, C.IRON_L); ring(v, 'foreR', -16, -11, -2, 3, 30, 30, 0x7c808e);
  R(v, 'foreR', -18, 17, -4, -9, 22, 5, C.IRON_D);
  B(v, 'foreR', -17, 16, -3, -10, 16, 4, 0x828694); B(v, 'foreR', -17, 23, -3, -10, 23, 4, C.IRON_L);
  B(v, 'armR', -16, 34, 4, -11, 35, 4, C.APRON); B(v, 'armR', -16, 34, -3, -11, 35, -3, C.APRON); B(v, 'armR', -17, 34, -2, -17, 35, 3, C.APRON);
  // Tongs holding glowing red-hot blade blank (exact coords for FENG_STRIKE!)
  B(v, 'offhand', 12, 20, 2, 12, 20, 19, C.IRON); B(v, 'offhand', 12, 22, 2, 12, 22, 19, C.IRON); B(v, 'offhand', 12, 20, 14, 12, 22, 15, C.IRON_L);
  B(v, 'offhand', 12, 22, 9, 12, 22, 19, C.IRON_L);
  v.part('offhand').box(-14, 21, 18, 12, 21, 19, C.HOT, 1).box(-14, 21, 18, -5, 21, 19, C.HOT_L, 1);
  // ---------------------------------------------------------------- head: silver-grey swept hair + high tied topknot bun with brown hanging tails, bold dark brows, left cheek scar & full silver-grey beard!
  C2(v, 'head', -6, 46, -6, 5, 57, 5, C.SKIN, 2);
  C2(v, 'head', -5, 44, -5, 4, 45, 5, C.SKIN, 2);
  S(v, 'head', 5, 48, -1, 6, 51, 1, C.SKIN); S(v, 'head', 6, 49, 0, 6, 50, 0, C.SKIN_D);
  // Swept-back silver-grey hair & prominent high rounded topknot bun bound with dark-brown cloth + two hanging back tails (fengtiebi.png!)
  v.paint(c => (c.y >= 55 ? C.HAIR : (c.z <= -3 && c.y >= 47) || ((c.x <= -5 || c.x >= 4) && c.y >= 51) ? C.HAIR_D : null), 'head');
  C2(v, 'head', -5, 58, -5, 4, 58, 4, C.HAIR_L, 2);
  C2(v, 'head', -3, 59, -4, 2, 60, 1, C.TIE, 1);
  C2(v, 'head', -3, 61, -4, 2, 63, 1, C.HAIR, 1); B(v, 'head', -2, 63, -3, 1, 63, 0, C.HAIR_L);
  // Two dark-brown hanging cloth tails fluttering down the back of his head
  B(v, 'head', -2, 51, -7, -1, 58, -6, C.TIE); B(v, 'head', 0, 49, -7, 1, 58, -6, C.TIE_D);
  // Neat full silver-grey moustache & sculpted full beard
  v.paint(c => ((c.x <= -5 || c.x >= 4) && c.y <= 48 && c.z >= -1) || (c.y <= 46 && c.z >= 2) ? C.BEARD : null, 'head');
  B(v, 'head', -5, 44, 6, 4, 46, 6, C.BEARD); B(v, 'head', -4, 46, 6, 3, 46, 6, C.BEARD_L);
  B(v, 'head', -4, 42, 4, 3, 43, 6, C.BEARD); B(v, 'head', -3, 41, 5, 2, 41, 6, C.BEARD_D);
  // Craftsman nose, steady dark eyes, bold dark eyebrows & subtle diagonal scar on left cheek
  B(v, 'head', -1, 47, 6, 0, 49, 6, C.SKIN); B(v, 'head', -1, 47, 6, 0, 47, 6, C.SKIN_D);
  B(v, 'head', -4, 50, 5, -3, 51, 5, C.EYE); B(v, 'head', 2, 50, 5, 3, 51, 5, C.EYE);
  B(v, 'head', -5, 52, 6, -2, 52, 6, C.BROW); B(v, 'head', 1, 52, 6, 4, 52, 6, C.BROW);
  B(v, 'head', 3, 48, 5, 3, 48, 5, 0xc27c50); B(v, 'head', 4, 47, 5, 4, 47, 5, 0xc27c50);
  fuseStill(v);
  fuse(v, 'hips', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR');
  return v;
}

// ================================================================== 卢昭（世家孤女）
// 照立绘 luzhao.png 重构：二十岁，清丽鹅蛋脸（女性平脸不出鼻子），右眼下暗红泪痣、精致小口；墨紫黑发中分带两侧极细1格垂鬓，后梳高云髻/堕马髻，
// 髻上斜插素金发簪，耳垂缀细长淡色耳坠；墨紫黑披氅裹双肩并在左胸以古金圆环扣住，内露深酒红交领曲裾深衣配素净米白内领；手展竹简舆图。
function buildLuzhao(): V {
  const v = fine();
  const C = {
    SKIN: 0xf4d6be, SKIN_D: 0xd0ae94, SCAR: 0xe4aea4,
    ROBE: 0x6b1e30, ROBE_D: 0x481220, ROBE_L: 0x8c2c42, LINEN: 0xf0e0c6, LINEN_D: 0xcab698,
    GOLD: 0xd8a66e, GOLD_D: 0x8c5e38, CLOAK: 0x2e1a28, CLOAK_L: 0x4a2c40, CLOAK_D: 0x1c1018,
    HAIR: 0x2a1826, HAIR_L: 0x462a3e, HAIR_D: 0x180e16, PIN: 0xe6be94, PIN_L: 0xf6dcc0,
    MOLE: 0x8a2832, LIP: 0x9e3842, EYE: 0x261820, BAMBOO: 0xc8a874, BAMBOO_D: 0x987a4e, CORD: 0x5c3824, IVORY: 0xf0e6d0,
  };
  rig(v, { hip: 22, spine: 26, chest: 30, neck: 36, head: 40, hat: 54, ax: 8, sh: 36, elbow: 28, wrist: 20, grip: 18, lx: 4, knee: 12, back: 4 });
  v.bone('clA1', 'chest', 0, 34, -7).bone('clA2', 'clA1', 0, 16, -9)
    .bone('robe1', 'hips', 0, 22, 0).bone('robe2', 'robe1', 0, 10, 0);
  // ---------------------------------------------------------------- articulated 2-tier A-line flared deep wine-crimson 曲裾 robe
  C2(v, 'robe2', -10, 0, -6, 9, 2, 5, C.ROBE_D, 3); C2(v, 'robe2', -10, 3, -6, 9, 5, 5, C.ROBE, 3); C2(v, 'robe2', -10, 4, -6, 9, 4, 5, C.GOLD_D, 3);
  C2(v, 'robe2', -8, 6, -5, 7, 9, 4, C.ROBE, 2);
  C2(v, 'robe1', -6, 10, -4, 5, 21, 3, C.ROBE, 2); C2(v, 'robe1', -6, 16, -4, 5, 17, 3, C.ROBE_D, 2); C2(v, 'robe1', -6, 18, -4, 5, 18, 3, C.GOLD_D, 2);
  C2(v, 'hips', -6, 22, -4, 5, 25, 3, C.ROBE, 2);
  C2(v, 'spine', -5, 26, -4, 4, 29, 3, C.ROBE, 1); v.paint(c => (c.y <= 27 ? C.ROBE_D : null), 'spine');
  C2(v, 'chest', -7, 30, -4, 6, 35, 3, C.ROBE, 2); C2(v, 'chest', -5, 36, -3, 4, 36, 2, C.CLOAK_L, 2);
  // Crisp clean cream-ivory crossed inner collar at throat (luzhao.png! Replaces harsh bright yellow bar)
  B(v, 'chest', -3, 34, 3, 2, 35, 3, C.LINEN); B(v, 'chest', -2, 35, 3, 1, 35, 3, C.SKIN);
  B(v, 'chest', -2, 33, 3, 1, 34, 3, C.LINEN); B(v, 'chest', 1, 31, 3, 2, 33, 3, C.LINEN); B(v, 'chest', 0, 32, 3, 0, 33, 3, C.LINEN_D);
  B(v, 'neck', -2, 36, -2, 1, 39, 1, C.SKIN); B(v, 'neck', -2, 36, -2, 1, 36, 1, C.SKIN_D); B(v, 'neck', -2, 38, 1, 1, 38, 1, C.SCAR);
  // ---------------------------------------------------------------- deep plum-black draped cloak clasped across the upper chest with antique-gold circular ring brooch (luzhao.png!)
  v.paint(c => ((c.x <= -5 || c.x >= 4) && c.y >= 32) || c.y >= 35 ? (c.y === 35 ? C.CLOAK_L : C.CLOAK) : null, 'chest');
  // Draped cloak fold crossing front chest to left-front circular ring brooch
  B(v, 'chest', -7, 29, 4, 3, 31, 4, C.CLOAK); B(v, 'chest', -7, 31, 4, 2, 31, 4, C.CLOAK_L);
  B(v, 'chest', 2, 29, 4, 4, 31, 4, C.GOLD); B(v, 'chest', 3, 30, 4, 3, 30, 4, C.CLOAK_D);
  S(v, 'hips', -11, 2, -5, -11, 15, 1, C.CLOAK); S(v, 'hips', -11, 16, -4, -11, 25, 1, C.CLOAK); S(v, 'spine', -11, 26, -4, -11, 29, 1, C.CLOAK);
  S(v, 'spine', -10, 26, -4, -7, 29, -3, C.CLOAK); S(v, 'hips', -10, 12, 1, -10, 21, 1, C.CLOAK_L);
  C2(v, 'chest', -5, 36, -5, 4, 38, -3, C.CLOAK_L, 1); B(v, 'chest', -4, 36, -5, 3, 36, -3, C.CLOAK);
  B(v, 'clA1', -11, 16, -5, 10, 35, -5, C.CLOAK); S(v, 'clA1', -11, 16, -5, -11, 35, -5, C.CLOAK_L);
  B(v, 'clA2', -11, 2, -6, 10, 15, -6, C.CLOAK); B(v, 'clA2', -11, 2, -6, 10, 2, -6, C.CLOAK_D);
  // ---------------------------------------------------------------- sloped wide plum-black sleeves, wine-crimson inner cuff, small hands & bamboo map
  LR(v, 'arm', 6, 28, -2, 9, 35, 1, C.CLOAK); LR(v, 'arm', 6, 35, -2, 9, 35, 1, C.CLOAK_L); LR(v, 'arm', 9, 35, -2, 9, 35, 1, null);
  LR(v, 'fore', 6, 22, -2, 9, 27, 1, C.CLOAK); LR(v, 'fore', 6, 20, -2, 8, 21, 0, C.ROBE);
  hands(v, 16, C.SKIN, C.SKIN_D);
  B(v, 'foreL', 8, 17, 1, 8, 19, 1, C.IVORY); B(v, 'foreL', 8, 16, 1, 8, 16, 1, C.GOLD); B(v, 'foreL', 8, 20, 1, 8, 20, 1, C.GOLD_D);
  for (let x = -9; x <= 8; x++) B(v, 'chest', x, 22, 4, x, 22, 13, ((x + 9) >> 1) & 1 ? C.BAMBOO_D : C.BAMBOO);
  B(v, 'chest', -9, 22, 7, 8, 22, 7, C.CORD); B(v, 'chest', -9, 22, 12, 8, 22, 12, C.CORD);
  S(v, 'chest', -11, 22, 4, -10, 23, 13, C.BAMBOO_D);
  // ---------------------------------------------------------------- strictly flat oval porcelain female head (ZERO nose!), plum-black parted hair, ultra-slender 1-cell wispy side strands, sweeping high-back chignon + pale-gold hairpin + drop earrings!
  C2(v, 'head', -6, 42, -6, 5, 52, 5, C.SKIN, 2);
  C2(v, 'head', -5, 41, -5, 4, 41, 5, C.SKIN, 2);
  C2(v, 'head', -4, 40, -4, 3, 40, 4, C.SKIN, 1);
  // Plum-black sculpted crown & center-parted hairline
  C2(v, 'head', -5, 53, -5, 4, 53, 4, C.HAIR, 2);
  v.paint(c => (c.y >= 50 || (c.z <= -3 && c.y >= 41) || ((c.x <= -5 || c.x >= 4) && c.y >= 44) ? C.HAIR : null), 'head');
  B(v, 'head', -3, 50, 5, 2, 50, 5, C.SKIN); B(v, 'head', -1, 50, 5, 0, 50, 5, C.HAIR);
  B(v, 'head', -4, 52, 5, -2, 52, 5, C.HAIR_L); B(v, 'head', 1, 52, 5, 3, 52, 5, C.HAIR_L);
  // Two ultra-slender 1-cell-thin face-framing strands curving past her cheeks (luzhao.png!)
  B(v, 'head', -5, 40, 5, -5, 49, 5, C.HAIR); B(v, 'head', 4, 40, 5, 4, 49, 5, C.HAIR);
  // Delicate pale-ivory drop earrings below each ear
  B(v, 'head', -6, 41, 0, -6, 43, 0, C.PIN_L); B(v, 'head', 5, 41, 0, 5, 43, 0, C.PIN_L);
  // High-back sweeping double-tier chignon (云髻/堕马髻) + pale-gold hairpin angled out at upper back (luzhao.png!)
  C2(v, 'head', -4, 46, -9, 4, 52, -6, C.HAIR, 2); B(v, 'head', -2, 52, -8, 2, 52, -7, C.HAIR_L);
  C2(v, 'head', -3, 53, -8, 3, 56, -5, C.HAIR, 1); B(v, 'head', -1, 55, -7, 1, 56, -6, C.HAIR_L);
  B(v, 'head', 3, 53, -8, 9, 53, -8, C.PIN); B(v, 'head', 8, 53, -8, 9, 54, -8, C.PIN_L);
  // Refined flat female face: delicate thin brows, graceful vertical dark eyes, right-cheek tear mole, dainty small mouth (ZERO nose!)
  B(v, 'head', -3, 48, 5, -2, 48, 5, C.HAIR_L); B(v, 'head', 1, 48, 5, 2, 48, 5, C.HAIR_L);
  B(v, 'head', -3, 45, 5, -3, 46, 5, C.EYE); B(v, 'head', 2, 45, 5, 2, 46, 5, C.EYE);
  B(v, 'head', -4, 44, 5, -4, 44, 5, C.MOLE);
  B(v, 'head', -1, 42, 5, 0, 42, 5, C.LIP);
  fuseStill(v);
  fuse(v, 'hips', 'footL', 'footR');
  return v;
}

// ================================================================== 桓越（红衣剑客）
// 照立绘 huanyue.png 重构：二十四岁，剑眉朗目俊朗青年；乌黑长发高束丸子发髻、墨黑布抹额缠额束发并在脑后垂双黑带（tlA1）；
// 穿深绯红交领汉风劲装（米白内领、暗革斜挎剑带配青铜方扣、左肩后探出黑柄铜格汉剑鞘与剑柄），黑革护腕长靴；
// 仍保留石阶坐姿中右手所拄汉剑（weapon）与左手酒葫芦（offhand），待机喝一口动作完全贴合。
function buildHuanyue(): V {
  const v = fine();
  const C = {
    SKIN: 0xf0c69e, SKIN_D: 0xc29672,
    ROBE: 0x9c1e24, ROBE_D: 0x681218, ROBE_L: 0xba2c32, LINEN: 0xede0c4, LINEN_D: 0xc2b092,
    TROU: 0x2c2428, STRAP: 0x442a2c, STRAP_D: 0x2c1a1c, BELT: 0x382426, BUCKLE: 0xb8864c, BUCKLE_L: 0xd8a866,
    BOOT: 0x1e1b20, BRACER: 0x36282a,
    HAIR: 0x1e181e, HAIR_L: 0x382e36, BAND: 0x342a32, BAND_L: 0x4e404a, BAND_D: 0x221b20,
    EYE: 0x1e1416, MOUTH: 0x7c4a3c,
    BRONZE: 0xb8864c, EDGE: 0xe2e6ee, GUARD: 0x9c6e38, GRIP: 0x2a2024, TASSEL: 0x1a161c, GOURD: 0xc8963e, GOURD_D: 0x946426, CORD: 0x8a2a20,
  };
  rig(v, { hip: 22, spine: 26, chest: 32, neck: 38, head: 42, hat: 56, ax: 8, sh: 38, elbow: 30, wrist: 22, grip: 20, lx: 4, knee: 12, back: 4 });
  v.bone('tlA1', 'head', 0, 49, -8);
  // ---------------------------------------------------------------- dark martial trousers, crimson coat hem & black boots
  LR(v, 'leg', 2, 12, -2, 5, 21, 1, C.TROU);
  R(v, 'legL', 0, 14, -4, 5, 21, 3, C.ROBE); R(v, 'legR', -6, 14, -4, -1, 21, 3, C.ROBE);
  for (const L of ['legL', 'legR']) v.paint(c => (c.y === 14 ? C.ROBE_D : null), L);
  LR(v, 'shin', 3, 10, -2, 5, 11, 0, C.TROU); LR(v, 'shin', 2, 4, -2, 5, 9, 1, C.BOOT); LR(v, 'shin', 2, 9, -2, 5, 9, 1, 0x36323a);
  LR(v, 'foot', 2, 0, -2, 5, 1, 5, C.BOOT); LR(v, 'foot', 2, 2, -2, 5, 3, 3, C.BOOT);
  // ---------------------------------------------------------------- rich crimson-red Han martial robe + pale cream inner collar + leather baldric strap & bronze buckle (huanyue.png!)
  C2(v, 'hips', -6, 22, -4, 5, 25, 3, C.ROBE, 2);
  C2(v, 'spine', -5, 26, -4, 4, 31, 3, C.ROBE, 1); v.paint(c => (c.y <= 28 ? C.BELT : null), 'spine');
  B(v, 'spine', -1, 26, 4, 0, 28, 4, C.BUCKLE);
  C2(v, 'chest', -7, 32, -4, 6, 37, 3, C.ROBE, 2); C2(v, 'chest', -5, 38, -3, 4, 38, 2, C.ROBE_L, 2);
  B(v, 'neck', -2, 38, -2, 1, 41, 1, C.SKIN); B(v, 'neck', -2, 38, -2, 1, 38, 1, C.SKIN_D);
  // Crisp pale-cream crossed inner collar & shaded crimson outer lapel
  B(v, 'chest', -2, 35, 3, 1, 38, 3, C.LINEN); B(v, 'chest', -2, 38, 2, 1, 38, 2, C.LINEN);
  B(v, 'chest', -1, 37, 3, 0, 38, 3, C.SKIN); B(v, 'chest', 1, 34, 3, 2, 37, 3, C.LINEN_D);
  B(v, 'chest', -3, 32, 3, -2, 37, 3, C.ROBE_D); B(v, 'chest', 2, 32, 3, 2, 36, 3, C.ROBE_D);
  // Diagonal dark-brown leather baldric strap with antique-bronze rectangular buckle across chest (huanyue.png!)
  B(v, 'chest', 4, 36, 4, 5, 38, 4, C.STRAP); B(v, 'chest', 2, 34, 4, 4, 36, 4, C.STRAP);
  B(v, 'chest', 0, 32, 4, 2, 34, 4, C.STRAP); B(v, 'spine', -2, 29, 4, 0, 31, 4, C.STRAP);
  B(v, 'chest', 2, 34, 4, 4, 36, 4, C.BUCKLE); B(v, 'chest', 3, 35, 4, 3, 35, 4, C.STRAP_D);
  // Back Han sword scabbard & bronze-guarded hilt rising behind his left shoulder (huanyue.png!)
  B(v, 'chest', 2, 32, -5, 4, 39, -5, C.STRAP_D);
  B(v, 'chest', 4, 38, -6, 6, 40, -5, C.STRAP_D);
  B(v, 'chest', 3, 40, -6, 7, 41, -5, C.GUARD);
  B(v, 'chest', 5, 42, -6, 6, 46, -5, C.GRIP);
  B(v, 'chest', 5, 47, -6, 6, 48, -5, C.BUCKLE_L);
  // ---------------------------------------------------------------- sloped crimson sleeves, dark leather bracers, small hands
  LR(v, 'arm', 6, 30, -2, 9, 37, 1, C.ROBE); LR(v, 'arm', 6, 37, -2, 9, 37, 1, C.ROBE_L); LR(v, 'arm', 9, 37, -2, 9, 37, 1, null);
  LR(v, 'fore', 6, 22, -2, 8, 29, 0, C.ROBE); LR(v, 'fore', 6, 22, -2, 8, 27, 0, C.BRACER); LR(v, 'fore', 6, 25, -2, 8, 25, 0, C.BELT);
  hands(v, 18, C.SKIN, C.SKIN_D);
  // ---------------------------------------------------------------- handsome young swordsman head: high tied black topknot bun, charcoal-ink headband & dark hanging tails (huanyue.png!)
  C2(v, 'head', -6, 44, -6, 5, 54, 5, C.SKIN, 2);
  C2(v, 'head', -5, 43, -5, 4, 43, 5, C.SKIN, 2);
  C2(v, 'head', -4, 42, -4, 3, 42, 4, C.SKIN, 1);
  S(v, 'head', 5, 46, -1, 6, 49, 1, C.SKIN); S(v, 'head', 6, 47, 0, 6, 48, 0, C.SKIN_D);
  // Black swept hair + high sculpted topknot bun bound with charcoal-ink cloth
  C2(v, 'head', -5, 55, -5, 4, 55, 4, C.HAIR, 2);
  v.paint(c => (c.y >= 52 || (c.z <= -3 && c.y >= 44) || ((c.x <= -5 || c.x >= 4) && c.y >= 47) ? C.HAIR : null), 'head');
  ring(v, 'head', -6, 5, -6, 5, 51, 52, C.BAND);
  B(v, 'head', -5, 52, 6, 4, 52, 6, C.BAND_L);
  // High topknot bun wrapped with charcoal cloth band
  C2(v, 'head', -3, 56, -4, 2, 57, 1, C.BAND, 1);
  C2(v, 'head', -3, 58, -4, 2, 60, 1, C.HAIR, 1); B(v, 'head', -1, 60, -2, 1, 60, 0, C.HAIR_L);
  // Back headband knot + twin dark charcoal hanging tails on tlA1
  B(v, 'head', -2, 49, -7, 1, 52, -7, C.BAND_D);
  B(v, 'tlA1', -2, 40, -8, -1, 50, -8, C.BAND); B(v, 'tlA1', 0, 38, -8, 1, 50, -8, C.BAND_D);
  // Sharp confident black sword-brows, focused heroic eyes, crisp 1-cell nose & composed half-smile
  B(v, 'head', -4, 49, 5, -2, 49, 5, C.HAIR); B(v, 'head', 1, 49, 5, 3, 49, 5, C.HAIR);
  B(v, 'head', -3, 46, 5, -3, 47, 5, C.EYE); B(v, 'head', 2, 46, 5, 2, 47, 5, C.EYE);
  B(v, 'head', -1, 45, 6, 0, 46, 6, C.SKIN); B(v, 'head', -1, 45, 6, 0, 45, 6, C.SKIN_D);
  B(v, 'head', -2, 43, 5, 1, 43, 5, C.MOUTH);
  // ---------------------------------------------------------------- grounded 四尺 Han sword in right hand + wine gourd in left hand
  B(v, 'weapon', -8, 19, -5, -8, 21, -4, C.BUCKLE); B(v, 'weapon', -8, 20, -3, -8, 20, 3, C.GRIP);
  B(v, 'weapon', -9, 18, 4, -6, 22, 4, C.GUARD);
  B(v, 'weapon', -8, 19, 5, -8, 21, 27, C.BRONZE); B(v, 'weapon', -8, 19, 5, -8, 19, 27, 0xf2f6fc); B(v, 'weapon', -8, 21, 5, -8, 21, 27, C.EDGE);
  B(v, 'weapon', -8, 20, 28, -8, 20, 29, 0xf2f6fc);
  B(v, 'weapon', -10, 20, -5, -9, 20, -5, C.TASSEL); B(v, 'weapon', -10, 20, -4, -10, 20, 1, C.TASSEL);
  B(v, 'offhand', 7, 17, -1, 7, 17, -1, C.CORD);
  B(v, 'offhand', 7, 14, -2, 8, 16, -1, C.GOURD); B(v, 'offhand', 7, 13, -2, 8, 13, -1, C.GOURD_D);
  B(v, 'offhand', 6, 9, -3, 9, 12, 0, C.GOURD); B(v, 'offhand', 7, 12, -2, 8, 12, 0, 0xe2b254); B(v, 'offhand', 6, 9, -3, 9, 9, 0, C.GOURD_D);
  fuseStill(v); fuse(v, 'foreL', 'offhand'); fuse(v, 'shinL', 'footL'); fuse(v, 'shinR', 'footR');
  return v;
}

// ================================================================== poses (bone angles and metres only: the same on the 7 cm and the fine figures)
type Bones = Record<string, Bone>;
/** act-30 (用户：「人物的动画、穿模那些问题必须好好解决一下」): a walk for any of the people while a cutscene walks them (it sets
 *  walkPh on the actor; the idle hook runs first, this replaces the legs, arms and the bob). Returns true while walking */
function walkOver(b: Bones, self: unknown, stoop = 0) {
  const ph = (self as { walkPh?: number } | undefined)?.walkPh; if (ph == null) return false;
  const s = Math.sin(ph), c = Math.cos(ph), k = 0.48;
  restOf(b, WALK_BONES, 1);   // (the idle's hand-rubbing, toe taps and weight shifts would ride on the stride)
  // (act-44 用户：「走路脚板都脱离脚踝了」) the thighs swing opposite; a knee bends while its leg swings forward (cos > 0 for the left),
  // straight when it plants; the foot turns at the ankle only, most of the way back to level; the hips ride on the longer leg so the
  // planted foot stays on the ground (lowest when the legs are spread, highest as they pass)
  const tL = -s * k, tR = s * k, kL = Math.max(0, c) * 0.75, kR = Math.max(0, -c) * 0.75;
  rot(b.legL, tL, 0, 0); rot(b.legR, tR, 0, 0);
  if (b.shinL) rot(b.shinL, kL, 0, 0); if (b.shinR) rot(b.shinR, kR, 0, 0);
  if (b.footL) rot(b.footL, -0.75 * (tL + kL), 0, 0); if (b.footR) rot(b.footR, -0.75 * (tR + kR), 0, 0);
  const [T, S] = legLen(b), reach = Math.max(T * Math.cos(tL) + S * Math.cos(tL + kL), T * Math.cos(tR) + S * Math.cos(tR + kR));
  mov(b.hips, 0, -(T + S - reach), 0); rot(b.hips, 0, s * 0.08, 0);
  if (b.spine) rot(b.spine, 0.08 + stoop, -s * 0.06, 0);
  if (b.armL) rot(b.armL, s * 0.45, 0, 0.1); if (b.armR) rot(b.armR, -s * 0.45, 0, -0.1);
  if (b.foreL) rot(b.foreL, -0.35, 0, 0); if (b.foreR) rot(b.foreR, -0.35, 0, 0);
  if (b.head) rot(b.head, 0, 0, 0);
  return true;
}
const WALK_BONES = ['hips', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR'];
/** these bones eased back toward their rest pose (w = 1 all the way), before a cutscene pose goes on top of the idle */
function restOf(b: Bones, names: string[], w: number) {
  for (const n of names) { const x = b[n] as (Bone & { rest?: { p: THREE.Vector3; r: THREE.Euler } }) | undefined; if (!x?.rest) continue;
    x.position.lerp(x.rest.p, w); x.rotation.set(x.rotation.x + (x.rest.r.x - x.rotation.x) * w, x.rotation.y + (x.rest.r.y - x.rotation.y) * w, x.rotation.z + (x.rest.r.z - x.rotation.z) * w); }
}
/** the thigh and shin lengths (hip → knee → ankle, from the rest offsets of the shin and foot bones) */
function legLen(b: Bones): [number, number] { return [Math.abs(b.shinL?.position.y ?? 0.35) || 0.35, Math.abs(b.footL?.position.y ?? 0.21) || 0.21]; }
/** act-30: a crouch over something on the ground (a cutscene sets crouch 0..1 on the actor) */
function crouchOver(b: Bones, self: unknown) {
  const k = (self as { kneel?: number } | undefined)?.kneel; if (typeof k !== 'number' || !k) return;
  restOf(b, WALK_BONES, Math.min(1, k * 2.5));   // (his hands leave off rubbing / scratching early on the way down)
  // (act-44 用户：「下蹲一条腿直着」) a real squat on his heels: both knees bent, the right heel a little behind the left; the hips go
  // down by exactly what the bent legs give up (the soles stay on the ground the whole way down), the soles turned back flat
  const tL = -1.7 * k, sL = 2.2 * k, tR = -1.55 * k, sR = 2.44 * k;
  rot(b.legL, tL, 0, 0.12 * k); rot(b.legR, tR, 0, -0.12 * k); if (b.shinL) rot(b.shinL, sL, 0, 0); if (b.shinR) rot(b.shinR, sR, 0, 0);
  if (b.footL) rot(b.footL, -(tL + sL), 0, 0); if (b.footR) rot(b.footR, -(tR + sR), 0, 0);
  const [T, S] = legLen(b), reach = Math.max(T * Math.cos(tL) + S * Math.cos(tL + sL), T * Math.cos(tR) + S * Math.cos(tR + sR));
  mov(b.hips, 0, -(T + S - reach), -0.05 * k); if (b.spine) rot(b.spine, 0.5 * k, 0, 0); if (b.head) rot(b.head, 0.2 * k, 0, 0);
  if (b.armL) rot(b.armL, -0.9 * k, 0, 0.15); if (b.armR) rot(b.armR, -0.9 * k, 0, -0.15); if (b.foreL) rot(b.foreL, -0.5 * k, 0, 0); if (b.foreR) rot(b.foreR, -0.5 * k, 0, 0);
}
/** 杜五: never still — rubs his hands, scratches under the head cloth, looks this way and that, shifts from foot to foot, taps a toe */
POSE_HOOKS.npc_duwu = (b: Bones, t: number, _a: unknown, _o: unknown, self: unknown) => {
  const c = t % 9, br = Math.sin(t * 2.6), rub = win(c, 0.2, 3.8, 0.5), scr = win(c, 4.1, 6.1, 0.35), idle = 1 - Math.max(rub, scr);
  // weight: a quick shift to one foot, held, then the other (eased so it reads as a shuffle, not a sway)
  const w = Math.tanh(Math.sin(t * 1.3) * 3), tap = idle * Math.max(0, Math.sin(t * 9)) * win(c, 6.6, 8.8, 0.3);
  mov(b.hips, 0.035 * w, -0.012 + br * 0.006, 0); rot(b.hips, 0, 0, -0.05 * w);
  rot(b.legL, 0, 0, 0.05 * w); rot(b.legR, 0, 0, 0.05 * w); rot(b.footR, -0.35 * tap, 0, 0);
  rot(b.spine, 0.1 + br * 0.015, 0.08 * Math.sin(t * 0.7), 0.04 * w); rot(b.chest, 0.04, 0, 0);
  // the head: looks about, a quick glance over the shoulder now and then, nods along while rubbing
  const glance = win(c, 6.4, 7.6, 0.15) * (Math.sin(t * 0.37) > 0 ? 1 : -1);
  rot(b.head, -0.05 + rub * 0.06 * Math.sin(t * 7), 0.4 * Math.sin(t * 0.9) * (1 - rub) + 0.75 * glance, 0.06 * Math.sin(t * 1.3));
  // rubbing the hands in front of the belly
  const rr = Math.sin(t * 11) * 0.12 * rub;
  rot(b.armL, -0.35 * rub + 0.05 * idle, 0, 0.12 - 0.2 * rub); rot(b.foreL, -1.25 * rub - 0.25 * idle + rr, 0.5 * rub, 0);
  rot(b.armR, -0.35 * rub - 2.4 * scr + 0.05 * idle, 0, -0.12 + 0.2 * rub - 0.35 * scr); rot(b.foreR, -1.25 * rub - 1.6 * scr - 0.25 * idle - rr + Math.sin(t * 14) * 0.18 * scr, -0.5 * rub, 0);
  rot(b.neck, 0.1 * scr, 0, -0.1 * scr);
  if (!walkOver(b, self)) crouchOver(b, self);   // act-30: cutscenes
};
/** 孙媪: still — a slight sway and the breath, a stoop; now and then the needles come up close to the good eye */
POSE_HOOKS.npc_sunao = (b: Bones, t: number) => {
  const c = t % 10, br = Math.sin(t * 1.6), look = win(c, 6.0, 8.6, 0.6);
  rot(b.hips, 0, 0, Math.sin(t * 0.7) * 0.02);
  rot(b.spine, 0.22 + br * 0.012, Math.sin(t * 0.45) * 0.05, Math.sin(t * 0.7) * -0.015); rot(b.chest, 0.06, 0, 0);
  rot(b.neck, -0.18, 0, 0); rot(b.head, -0.06 + 0.22 * look, Math.sin(t * 0.3) * 0.15 * (1 - look) + 0.15 * look, 0.05 * look);
  rot(b.armR, -0.3 - 0.35 * look, 0, -0.08); rot(b.foreR, -1.25 - 0.55 * look, 0.2, 0); rot(b.weapon, 0.2 - 0.6 * look, 0, 0);
  rot(b.armL, -0.08, 0, 0.1); rot(b.foreL, -0.75, -0.2, 0); rot(b.offhand, 0.4, 0, 0);
};
/** 冯铁臂: one slow blow every 2.4 s — lift high, a beat at the top, down hard on the blank (sparks), rest on it; the tongs steady */
const FENG_LAST = new WeakMap<object, number>();
POSE_HOOKS.npc_fengtiebi = (b: Bones, t: number, _a, _off, self) => {
  const P = 2.4, k = (t % P) / P, br = Math.sin(t * 1.8);
  const lift = ss(0.1, 0.52, k) * (1 - ss(0.66, 0.76, k)), hit = win(k, 0.74, 0.9, 0.04);
  const strike = -0.78, top = -2.75;
  rot(b.armR, strike + (top - strike) * lift, 0, -0.08 - 0.12 * lift); rot(b.foreR, -0.15 - 1.1 * lift, 0, 0);
  rot(b.spine, 0.1 + 0.08 * hit - 0.06 * lift + br * 0.01, -0.12 * lift, 0); rot(b.chest, 0.04 + 0.04 * hit, -0.08 * lift, 0);
  mov(b.hips, 0, -0.03 * hit, 0); rot(b.head, 0.18 + 0.06 * hit - 0.1 * lift, 0.1 * lift, 0); rot(b.neck, 0.05, 0, 0);
  rot(b.armL, -0.1, 0, 0.04); rot(b.foreL, -0.2, 0, 0); rot(b.offhand, 0.3 + 0.06 * Math.sin(t * P), 0, 0);
  // sparks off the blank as the hammer lands (once per blow)
  const act = self as { local?(x: number, y: number, z: number): THREE.Vector3; root?: THREE.Object3D } | undefined, prev = FENG_LAST.get(self as object) ?? k;
  FENG_LAST.set(self as object, k);
  if (act?.local && act.root?.parent && prev < 0.76 && k >= 0.76) fxSparks(act.local(FENG_STRIKE.x, FENG_STRIKE.y + 0.08, FENG_STRIKE.z), 0xffb050, 9, 3.4, { life: 0.4, size: 0.06, grav: 9, spread: 0.08 });
};
/** 卢昭: composed — reads the bamboo map, breathes, the cloak stirs; every few seconds she looks up and out, then back down */
POSE_HOOKS.npc_luzhao = (b: Bones, t: number) => {
  const c = t % 11, br = Math.sin(t * 1.4), up = win(c, 6.5, 9.5, 0.8);
  rot(b.spine, 0.03 + br * 0.008, 0, 0); rot(b.chest, br * 0.01, 0, 0);
  rot(b.neck, 0.12 * (1 - up), 0, 0); rot(b.head, 0.22 * (1 - up) - 0.04 * up, 0.38 * up * (Math.sin(t * 0.21) > 0 ? 1 : -1), 0.03 * up);
  rot(b.armL, -0.22, 0, 0.16); rot(b.foreL, -1.18, 0, 0); rot(b.armR, -0.22, 0, -0.16); rot(b.foreR, -1.18, 0, 0);
  rot(b.clA1, 0.06 + Math.sin(t * 1.1) * 0.03, 0, Math.sin(t * 0.8) * 0.02); rot(b.clA2, 0.03 + Math.sin(t * 1.1 - 0.7) * 0.03, 0, 0);
};
/** 桓越: sits on the bottom step (hips 0.35 m down, thighs out, shins down), the sword stuck in the ground before his right foot and
 *  his right hand on its hilt; the gourd on his left knee, up to his mouth every few seconds; the headband tails stir */
POSE_HOOKS.npc_huanyue = (b: Bones, t: number) => {
  const c = t % 8, br = Math.sin(t * 1.5), drink = win(c, 5.0, 7.0, 0.45);
  mov(b.hips, 0, -0.35, 0);
  rot(b.legL, -1.5, 0, 0.16); rot(b.shinL, 1.38, 0, -0.1); rot(b.legR, -1.42, 0, -0.08); rot(b.shinR, 1.5, 0, 0.06);
  const sp = -0.1 + br * 0.01, ch = 0.06;
  rot(b.spine, sp, 0, 0); rot(b.chest, ch, 0, 0);
  rot(b.neck, -0.05, 0, 0); rot(b.head, -0.1 - 0.3 * drink, 0.25 * Math.sin(t * 0.33) * (1 - drink), 0.05);
  const aR = -0.55, fR = -1.55;
  rot(b.armR, aR, 0, -0.18); rot(b.foreR, fR, 0, 0); rot(b.weapon, Math.PI / 2 - (sp + ch + aR + fR), 0, 0);
  rot(b.armL, -0.55 - 0.75 * drink, 0, 0.1 + 0.2 * drink); rot(b.foreL, -0.75 - 1.5 * drink, 0, 0); rot(b.offhand, 0.5 * (1 - drink), 0, 0);
  rot(b.tlA1, 0.25 + Math.sin(t * 2.3) * 0.12, 0, Math.sin(t * 1.7) * 0.15);
};

// ================================================================== 杜五's grey donkey (灰驴): scene dressing that moves (hideout.ts builds it)
// a grey donkey: pale belly, muzzle and inner ears, the dark stripe along the back crossed over the shoulders, a short upright dark mane,
// long ears with dark tips, slim legs with pale fetlocks over dark hooves, a thin tail with a dark tuft. The legs are part of the body (it
// stands); the neck, head and tail move: it dips to the hay now and then, flicks its tail.
function buildDonkey(): V {
  const v = fine(), G = 0x6e6a66, GL = 0xb4b0a8, GD = 0x4a4744, M_ = 0x34302e, HOOF = 0x2a2624, EYE = 0x161210;
  v.bone('hips', 'root', 0, 20, -4).bone('chest', 'hips', 0, 20, 4).bone('neck', 'chest', 0, 26, 12).bone('head', 'neck', 0, 34, 18).bone('tail', 'hips', 0, 26, -20);
  // act-30: each leg its own joint at the top (the cutscenes walk it; standing it never moves them)
  v.bone('legBL', 'hips', 3.5, 16, -16.5).bone('legBR', 'hips', -3.5, 16, -16.5).bone('legFL', 'chest', 3.5, 16, 7.5).bone('legFR', 'chest', -3.5, 16, 7.5);
  // the barrel in two halves (rump on the hips, the front on the chest), its long edges cut one cell, the belly pale, the stripe on top
  const barrel = (part: string, z0: number, z1: number) => {
    B(v, part, -6, 16, z0, 5, 27, z1, G);
    for (const x of [-6, 5]) for (const y of [16, 27]) B(v, part, x, y, z0, x, y, z1, null);
    v.paint(c => (c.y <= 17 ? GL : null), part);
  };
  barrel('hips', -20, -1); for (const x of [-6, 5]) B(v, 'hips', x, 16, -20, x, 27, -20, null);
  // the neck first: where it sinks into the front barrel the barrel keeps its cells (no notch when the neck dips to the hay)
  B(v, 'neck', -4, 24, 10, 3, 35, 19, G); B(v, 'neck', -4, 24, 18, 3, 27, 19, GL);
  barrel('chest', 0, 13);
  B(v, 'hips', -1, 28, -18, 0, 28, -1, M_); B(v, 'chest', -1, 28, 0, 0, 28, 9, M_);
  v.paint(c => (c.z >= 6 && c.z <= 7 && c.y >= 22 && (c.y >= 27 || c.x <= -6 || c.x >= 5) ? M_ : null), 'chest');
  // four slim legs: a pale fetlock band over a dark hoof
  for (const [end, z0] of [['B', -18], ['F', 6]] as const) for (const x0 of [2, -5]) {
    const part = 'leg' + end + (x0 > 0 ? 'L' : 'R');
    B(v, part, x0, 4, z0, x0 + 2, 15, z0 + 2, G); B(v, part, x0, 2, z0, x0 + 2, 3, z0 + 2, GL); B(v, part, x0, 0, z0, x0 + 2, 1, z0 + 2, HOOF);
  }
  // the neck: a short upright mane along its back and top, the throat pale
  B(v, 'neck', -1, 30, 10, 0, 37, 15, M_);
  // the head: the long face, the pale muzzle a step lower in front (a mouth line, two nostrils), side eyes, long ears (pale inside, dark
  // tips), a dark forelock between them
  B(v, 'head', -4, 30, 16, 3, 39, 25, G); B(v, 'head', -4, 30, 26, 3, 35, 31, GL);
  B(v, 'head', -4, 30, 31, 3, 30, 31, GD); B(v, 'head', -3, 34, 31, -3, 34, 31, GD); B(v, 'head', 2, 34, 31, 2, 34, 31, GD);
  B(v, 'head', -4, 36, 22, -4, 37, 22, EYE); B(v, 'head', 3, 36, 22, 3, 37, 22, EYE);
  for (const x of [-4, 2]) { B(v, 'head', x, 40, 18, x + 1, 47, 19, G); B(v, 'head', x, 41, 19, x + 1, 45, 19, GL); B(v, 'head', x, 46, 18, x + 1, 47, 19, M_); }
  B(v, 'head', -2, 40, 16, 1, 41, 17, M_);
  B(v, 'tail', -1, 16, -21, 0, 27, -21, G); B(v, 'tail', -2, 10, -22, 1, 15, -21, M_);
  return v;
}
POSE_HOOKS.npc_donkey = (b: Bones, t: number, _a: unknown, _o: unknown, self: unknown) => {
  // act-30: walking (a cutscene sets walkPh): diagonal pairs swing together, the head nods with the step, no grazing
  const ph = (self as { walkPh?: number } | undefined)?.walkPh;
  if (ph != null) {
    const s = Math.sin(ph), k = 0.42; rot(b.legFL, s * k, 0, 0); rot(b.legBR, s * k, 0, 0); rot(b.legFR, -s * k, 0, 0); rot(b.legBL, -s * k, 0, 0);
    rot(b.neck, 0.15 + Math.sin(ph * 2) * 0.05, 0, 0); rot(b.head, 0.1, 0, 0); rot(b.tail, 0.15, Math.sin(ph) * 0.2, 0); mov(b.hips, 0, Math.abs(Math.cos(ph)) * 0.012, 0);
    return;
  }
  for (const n of ['legFL', 'legFR', 'legBL', 'legBR']) if (b[n]) rot(b[n], 0, 0, 0);
  const c = t % 13, graze = win(c, 7, 11, 0.9), br = Math.sin(t * 1.3);
  rot(b.chest, br * 0.01, 0, 0); rot(b.neck, 0.08 + 0.75 * graze + Math.sin(t * 0.9) * 0.04 * (1 - graze), 0.1 * Math.sin(t * 0.4), 0);
  rot(b.head, 0.1 + 0.35 * graze + Math.max(0, Math.sin(t * 6)) * 0.08 * graze, 0, 0);
  rot(b.tail, 0.15, Math.sin(t * 2.2) * 0.25 + Math.max(0, Math.sin(t * 0.7) - 0.85) * 3 * Math.sin(t * 14), 0);
};
export const HIDEOUT_DONKEY: ModelDef = { id: 'npc_donkey', name: '灰驴', group: '普通', role: '', line: '', kind: 'quad', attack: 'bite', build: buildDonkey };
if (!ROSTER.some(r => r.id === HIDEOUT_DONKEY.id)) ROSTER.push(HIDEOUT_DONKEY);

// ================================================================== registry
// tip: the generic weapon point in cells (BActor.weapon), 16 fine = the 8 coarse cells it was (0.56 m)
const def = (id: string, name: string, role: string, build: () => V): ModelDef => ({ id, name, group: '普通', role, line: '', kind: 'biped', attack: 'swing', tip: 16, build });
/** the five, keyed like HIDEOUT.people (hideout.ts) */
export const HIDEOUT_PEOPLE: Record<'duwu' | 'sunao' | 'fengtiebi' | 'luzhao' | 'huanyue', ModelDef> = {
  duwu: def('npc_duwu', '杜五', '帮手', buildDuwu),
  sunao: def('npc_sunao', '孙婆婆', '医者', buildSunao),
  fengtiebi: def('npc_fengtiebi', '冯铁臂', '铁匠', buildFeng),
  luzhao: def('npc_luzhao', '卢昭', '情报', buildLuzhao),
  huanyue: def('npc_huanyue', '韩越', '宿敌', buildHuanyue),
};
for (const d of Object.values(HIDEOUT_PEOPLE)) if (!ROSTER.some(r => r.id === d.id)) ROSTER.push(d);
