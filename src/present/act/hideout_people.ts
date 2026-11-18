// 据点五人（docs/STORY.md §6，外貌卡 7–11）：杜五、鬼针孙媪、冯铁臂、卢昭、桓越，和杜五的灰驴。
// act-22 起用细格子：一格 3.5 厘米（场景格的一半，场景一格 = 人 2×2×2 格），人约 54～59 格高。骨骼名字、父子关系和关节位置都是
// 7 厘米版的 × 2（米数一样），所以待机动作（POSE_HOOKS）照旧；部件也和原来一一对应（一个部件一个网格、一次 draw call）。
// 细格子的用法照细白发女（heroineFine.ts）：小臂、手、小腿比 × 2 再细一格，手小；刀、针、飘带、布尾一格薄；脸干净，女性平脸不出鼻子、
// 鼻下不压阴影，男性鼻子凸一格。多出来的精度只给认人的细节：杜五的锅、汗巾和缺两指的左手；孙媪的白翳左眼、银针、药葫芦和皮囊；
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
// 二十二岁，圆短脸带雀斑，枯黄乱发用灰布巾包头，下巴青黑胡茬；补丁土黄麻布短褐，肩搭油腻灰白汗巾，挽裤腿、草鞋；背一口黑铁炒锅，
// 腰插剁骨菜刀，右胯挂一盘捆尸麻绳；左手缺两指（无名指、小指：手背后那一列的指头没了）。
function buildDuwu(): V {
  const v = fine();
  const C = { SKIN: 0xd4a27a, SKIN_D: 0xa87650, FRECK: 0xb47a52, JK: 0xa8884e, JK_D: 0x7c6236, JK_L: 0xc0a068, PATCH: 0x6a6252, PATCH2: 0x8a5e3e,
    TROU: 0x5a5042, TROU_L: 0x7a6e58, STRAW: 0xc4a05a, STRAW_D: 0x8e7038, WRAP: 0x8a867e, WRAP_D: 0x66625c, HAIR: 0xc09a52, STUB: 0x6a5c4e, MOUTH: 0x5a3426,
    TOWEL: 0xd6d0c2, TOWEL_D: 0xaaa496, WOK: 0x2a2a2e, WOK_L: 0x4e4e56, ROPE: 0x9a8458, ROPE_D: 0x6e5c3a, BLADE: 0xaab0b8, EDGE: 0xd8dce2, HAFT: 0x5a3c26, EYE: 0x1c1410 };
  rig(v, { hip: 20, spine: 24, chest: 30, neck: 36, head: 40, hat: 54, ax: 8, sh: 36, elbow: 28, wrist: 20, grip: 18, lx: 4, knee: 10, back: 4 });
  // ---------------------------------------------------------------- legs: trousers rolled to the knee (a lighter cuff), bare shins, straw sandals
  LR(v, 'leg', 2, 10, -2, 5, 19, 1, C.TROU);
  LR(v, 'shin', 2, 8, -2, 5, 9, 1, C.TROU_L); LR(v, 'shin', 3, 4, -2, 5, 7, 0, C.SKIN);
  LR(v, 'foot', 2, 0, -2, 5, 0, 4, C.STRAW_D); LR(v, 'foot', 2, 1, -2, 5, 1, 4, C.SKIN); LR(v, 'foot', 2, 2, -2, 5, 2, 2, C.SKIN); LR(v, 'foot', 3, 3, -2, 5, 3, 0, C.SKIN);
  LR(v, 'foot', 2, 1, -2, 5, 2, -2, C.STRAW); LR(v, 'foot', 2, 1, 0, 5, 2, 0, C.STRAW);                    // heel cup and the strap over the instep
  // ---------------------------------------------------------------- the short jacket: skirt to mid-thigh (each thigh carries its half), a rope belt
  R(v, 'hips', -6, 20, -4, 5, 23, 3, C.JK);
  R(v, 'legL', 0, 14, -4, 5, 19, 3, C.JK); R(v, 'legR', -6, 14, -4, -1, 19, 3, C.JK); for (const L of ['legL', 'legR']) v.paint(c => (c.y === 14 ? C.JK_D : null), L);
  B(v, 'legR', -6, 16, 3, -4, 18, 3, C.PATCH2);                                                      // a patch on the right flap
  R(v, 'spine', -6, 24, -4, 5, 29, 3, C.JK); v.paint(c => (c.y <= 25 ? C.ROPE : null), 'spine');
  B(v, 'spine', -4, 24, 4, -3, 25, 4, C.ROPE_D); B(v, 'hips', -4, 20, 4, -4, 23, 4, C.ROPE); B(v, 'hips', -3, 21, 4, -3, 23, 4, C.ROPE);   // the knot, two ends
  R(v, 'chest', -7, 30, -4, 6, 35, 3, C.JK, true);
  B(v, 'neck', -2, 36, -2, 1, 39, 1, C.SKIN);
  // the crossed collar: the light inner collar at the throat, the outer edge straight down the front
  B(v, 'chest', -2, 33, 3, 1, 35, 3, C.JK_L); B(v, 'chest', -2, 35, 2, 1, 35, 2, C.JK_L);
  B(v, 'chest', 2, 30, 3, 2, 34, 3, C.JK_D); B(v, 'spine', 2, 26, 3, 2, 29, 3, C.JK_D);
  // the rope that holds the wok, round the chest under the arms
  B(v, 'chest', -6, 31, 4, 5, 31, 4, C.ROPE);
  // ---------------------------------------------------------------- arms: sleeves rolled to the elbow (a light cuff), bare forearms, small hands
  LR(v, 'arm', 6, 28, -2, 9, 35, 1, C.JK); B(v, 'armR', -10, 30, -1, -10, 32, 0, C.PATCH);
  LR(v, 'fore', 6, 26, -2, 9, 27, 1, C.JK_L); LR(v, 'fore', 6, 20, -2, 8, 25, 0, C.SKIN);
  hands(v, 16, C.SKIN, C.SKIN_D);
  B(v, 'handL', 6, 16, -2, 8, 17, -2, null);                                                         // the ring and little fingers gone
  // ---------------------------------------------------------------- the greasy towel over the left shoulder, hanging down the front
  B(v, 'chest', 2, 36, -3, 6, 36, 2, C.TOWEL); B(v, 'chest', 3, 27, 4, 5, 36, 4, C.TOWEL); B(v, 'chest', 3, 36, 3, 5, 36, 3, C.TOWEL);
  B(v, 'chest', 3, 27, 4, 5, 27, 4, C.TOWEL_D);
  // ---------------------------------------------------------------- the black wok on his back: the rim, the deeper middle, the flat base (its
  // round bottom outward), two ear handles; it sits from the hips to the shoulders
  slab(v, 'chest', -8, 20, -6, 7, 37, -5, C.WOK, 2);
  slab(v, 'chest', -6, 23, -8, 5, 34, -7, C.WOK, 2);
  slab(v, 'chest', -3, 26, -9, 2, 31, -9, C.WOK_L, 1);
  B(v, 'chest', -10, 27, -6, -9, 29, -5, C.WOK_L); B(v, 'chest', 8, 27, -6, 9, 29, -5, C.WOK_L);
  // ---------------------------------------------------------------- the rope coil at the back of the right hip (a ring seen from the side, clear
  // of the hanging arm), the cleaver tucked into the belt in front, its blade flat on the skirt
  B(v, 'hips', -8, 13, -10, -7, 20, -3, C.ROPE); B(v, 'hips', -8, 15, -8, -7, 18, -5, null);
  for (const y of [13, 20]) for (const z of [-10, -3]) B(v, 'hips', -8, y, z, -7, y, z, null);
  B(v, 'hips', -8, 13, -9, -7, 13, -4, C.ROPE_D); B(v, 'hips', -7, 21, -4, -7, 22, -4, C.ROPE_D);
  B(v, 'hips', 0, 15, 4, 3, 20, 4, C.BLADE); B(v, 'hips', 0, 15, 4, 3, 15, 4, C.EDGE); B(v, 'hips', 1, 21, 4, 2, 23, 4, C.HAFT); B(v, 'spine', 1, 24, 4, 2, 26, 4, C.HAFT);
  // ---------------------------------------------------------------- the head: a round short face, the grey cloth wrap (one cell proud, a knot and
  // two ends at the back), dry yellow hair poking out at the temples and under the wrap, stubble round the jaw, freckles
  R(v, 'head', -6, 40, -6, 5, 53, 5, C.SKIN);
  B(v, 'head', -6, 40, -6, 5, 40, 5, null); B(v, 'head', -5, 40, -5, 4, 40, 4, C.SKIN);
  v.paint(c => (c.z <= -3 && c.y >= 42 ? C.HAIR : null), 'head');
  R(v, 'head', -7, 50, -7, 6, 55, 6, C.WRAP, true); B(v, 'head', -6, 50, -7, 5, 50, 6, C.WRAP_D); B(v, 'head', -7, 50, -6, 6, 50, 5, C.WRAP_D);
  B(v, 'head', -1, 53, 6, 5, 53, 6, C.WRAP_D);                                                       // a fold across the front, tied in a hurry
  B(v, 'head', -2, 47, -7, 1, 49, -7, C.WRAP_D); B(v, 'head', -4, 41, -7, -3, 49, -7, C.WRAP); B(v, 'head', 2, 43, -7, 3, 49, -7, C.WRAP);
  B(v, 'head', -7, 46, 0, -7, 49, 2, C.HAIR); B(v, 'head', 6, 46, 0, 6, 49, 2, C.HAIR);
  B(v, 'head', -5, 49, 5, -2, 49, 5, C.HAIR); B(v, 'head', 1, 49, 5, 4, 49, 5, C.HAIR); B(v, 'head', -5, 48, 5, -4, 48, 5, C.HAIR); B(v, 'head', 3, 48, 5, 4, 48, 5, C.HAIR);
  v.paint(c => (c.z >= -2 && (c.y === 40 || (c.y <= 43 && (c.x === -6 || c.x === 5))) ? C.STUB : null), 'head');
  B(v, 'head', -4, 45, 5, -4, 46, 5, C.EYE); B(v, 'head', 3, 45, 5, 3, 46, 5, C.EYE);
  B(v, 'head', -5, 43, 5, -4, 43, 5, C.FRECK); B(v, 'head', 3, 43, 5, 4, 43, 5, C.FRECK);
  B(v, 'head', -1, 43, 6, 0, 44, 6, C.SKIN); B(v, 'head', -1, 43, 6, 0, 43, 6, C.SKIN_D);
  B(v, 'head', -1, 41, 5, 0, 41, 5, C.MOUTH);
  fuseStill(v);
  // (act-44 用户：「下蹲一条腿直着，走路脚板都脱离脚踝了」: the shins and feet were merged into the thighs when he only stood — he walks
  //  and squats now, so each keeps its own part and bends at the knee and the ankle)
  return v;
}

// ================================================================== 鬼针孙媪（暴室医婆）
// 六十二岁，消瘦的菱形脸刻满皱纹，银白长发挽成插骨簪的道髻；深紫褐斜襟窄袖粗布衣（长衣过膝，下面露裙），腰系挂满小药葫芦的皮囊；
// 右手夹着两根银针、左手一把刮骨小刀；左眼浑浊惨白、右眼精光；嘴角下撇。女性平脸，不出鼻子。
function buildSunao(): V {
  const v = fine();
  const C = { SKIN: 0xd8b498, SKIN_D: 0xa88468, ROBE: 0x553a4a, ROBE_D: 0x3c2834, ROBE_L: 0x6e5262, JACKET: 0x604656, INNER: 0xc8bca8,
    HAIR: 0xdcdce2, HAIR_D: 0xa8a8b2, BONE: 0xc8a868, BONE_D: 0x9a7e48, BELT: 0x4a3020, BELT_L: 0x6a4a30, GOURD: 0xc8963e, GOURD_D: 0x946426, CORD: 0x8a2a20,
    EYE: 0x16100e, BLIND: 0xe6e2da, MOUTH: 0x6a3a30, NEEDLE: 0xeef2f8, KNIFE: 0x9aa0aa, SHOE: 0x2a2224 };
  rig(v, { hip: 18, spine: 22, chest: 28, neck: 34, head: 36, hat: 50, ax: 8, sh: 34, elbow: 26, wrist: 18, grip: 16, lx: 4, knee: 10, back: 4 });
  // ---------------------------------------------------------------- the skirt to the ground (a wide hem tier, a dark hem), the long jacket over it
  // to the knee (a dark hem, the lapel's edge down the front), dark shoe tips under the hem
  R(v, 'hips', -7, 0, -5, 6, 1, 4, C.ROBE_D); R(v, 'hips', -7, 2, -5, 6, 5, 4, C.ROBE); R(v, 'hips', -6, 6, -4, 5, 9, 3, C.ROBE);
  R(v, 'hips', -6, 10, -5, 5, 21, 4, C.JACKET); R(v, 'hips', -6, 10, -5, 5, 10, 4, C.ROBE_D);
  B(v, 'hips', 2, 11, 4, 2, 21, 4, C.ROBE_L);
  S(v, 'hips', 2, 0, 5, 4, 1, 5, C.SHOE);
  R(v, 'spine', -6, 22, -4, 5, 27, 3, C.JACKET); B(v, 'spine', -6, 22, -4, 5, 23, 4, C.BELT);
  for (const k of [...v.cells.keys()]) { const c = v.cells.get(k)!; if (c.part === 'spine' && c.y <= 23 && (c.x === -6 || c.x === 5) && (c.z === -4 || c.z === 4)) v.cells.delete(k); }
  R(v, 'chest', -7, 28, -4, 6, 33, 3, C.JACKET, true);
  B(v, 'neck', -2, 34, -2, 1, 35, 1, C.SKIN);
  B(v, 'chest', -2, 31, 3, 1, 33, 3, C.INNER); B(v, 'chest', -2, 33, 2, 1, 33, 2, C.INNER);
  B(v, 'chest', 2, 28, 3, 2, 32, 3, C.ROBE_L); B(v, 'spine', 2, 24, 3, 2, 27, 3, C.ROBE_L);
  // ---------------------------------------------------------------- the belt's leather pouch at the back of her right hip, the gourds on red cords in front
  B(v, 'hips', -8, 12, -6, -7, 19, -3, C.BELT_L); B(v, 'hips', -8, 18, -6, -7, 19, -3, C.BELT); B(v, 'hips', -7, 20, -4, -7, 21, -4, C.BELT);
  const gourd = (x: number, w: number, y: number, small: boolean) => {
    const x1 = x + w - 1, m0 = x + (w > 2 ? 1 : 0), m1 = x1 - (w > 2 ? 1 : 0);
    B(v, 'hips', x, y, 5, x1, y + (small ? 2 : 3), small ? 6 : 7, C.GOURD); B(v, 'hips', x, y, 5, x1, y, small ? 6 : 7, C.GOURD_D);
    const t = y + (small ? 3 : 4);
    B(v, 'hips', m0, t, 5, m1, t, 6, C.GOURD_D); if (!small) B(v, 'hips', m0, t + 1, 5, m1, t + 2, 6, C.GOURD);
    B(v, 'hips', m0, t + (small ? 1 : 3), 5, m0, 23, 5, C.CORD);
  };
  gourd(-6, 4, 15, false); gourd(-1, 2, 17, true); gourd(3, 4, 14, false);
  // ---------------------------------------------------------------- narrow sleeves (a dark edge at the wrist), small bony hands
  LR(v, 'arm', 6, 26, -2, 9, 33, 1, C.JACKET);
  LR(v, 'fore', 6, 18, -2, 8, 25, 0, C.JACKET); LR(v, 'fore', 6, 18, -2, 8, 18, 0, C.ROBE_D);
  hands(v, 14, C.SKIN, C.SKIN_D);
  // two silver needles forward from the right fist, one cell thin with a gap between; the small scraping knife in the left
  B(v, 'weapon', -8, 14, 1, -8, 14, 4, C.NEEDLE); B(v, 'weapon', -8, 16, 1, -8, 16, 6, C.NEEDLE);
  B(v, 'offhand', 7, 15, 1, 7, 16, 1, C.BELT); B(v, 'offhand', 7, 15, 2, 7, 16, 5, C.KNIFE); B(v, 'offhand', 7, 16, 5, 7, 16, 5, null);
  // ---------------------------------------------------------------- the head: a gaunt diamond face (narrow chin, wide cheekbones, the forehead
  // framed by the hair), silver hair drawn back into a bun on the crown with a dark tie and a bone pin through it
  R(v, 'head', -6, 36, -6, 5, 49, 5, C.SKIN, true);
  B(v, 'head', -6, 36, -6, -5, 37, 5, null); B(v, 'head', 4, 36, -6, 5, 37, 5, null);
  v.paint(c => (c.y >= 46 || (c.z <= -3 && c.y >= 38) || ((c.x <= -5 || c.x >= 4) && c.y >= 42) ? C.HAIR : null), 'head');
  B(v, 'head', -3, 50, -5, 2, 51, 0, C.HAIR); B(v, 'head', -2, 52, -4, 1, 52, -1, C.HAIR_D); B(v, 'head', -2, 53, -4, 1, 55, -1, C.HAIR);
  B(v, 'head', -5, 54, -3, 4, 54, -3, C.BONE); B(v, 'head', -5, 54, -3, -5, 54, -3, C.BONE_D);
  // the sharp right eye (her right, −x) under a stern brow, the dead white left eye, the frown, the lines from the cheekbones to the mouth
  B(v, 'head', -4, 42, 5, -3, 42, 5, C.EYE); B(v, 'head', -4, 44, 5, -3, 44, 5, C.SKIN_D);
  B(v, 'head', 2, 42, 5, 3, 43, 5, C.BLIND); B(v, 'head', 2, 44, 5, 3, 44, 5, C.SKIN_D); B(v, 'head', 2, 41, 5, 3, 41, 5, C.SKIN_D);
  B(v, 'head', -2, 38, 5, 1, 38, 5, C.MOUTH); B(v, 'head', -3, 37, 5, -3, 37, 5, C.MOUTH); B(v, 'head', 2, 37, 5, 2, 37, 5, C.MOUTH);
  B(v, 'head', -4, 39, 5, -4, 40, 5, C.SKIN_D); B(v, 'head', 3, 39, 5, 3, 40, 5, C.SKIN_D);
  fuseStill(v); fuse(v, 'foreR', 'weapon');
  return v;
}

// ================================================================== 冯铁臂（独腕老匠）
// 五十岁，魁梧如铁塔；古铜棱角方脸，寸短灰白硬发（平顶），满脸浓密络腮胡；赤膊，烫伤和刀疤纵横；玄黑厚牛皮围裙，粗麻长裤；左手长柄火钳
// （钳着一条烧红的刀坯），右小臂断口套着熟铁套筒、筒头焊死一把方锤，套筒用皮带绑在上臂；脖子上挂半枚残缺的刀环。
/** where his strike lands, in his own frame (metres: x to his left, up, forward): the anvil is built under it (hideout.ts) */
export const FENG_STRIKE = { x: -0.49, y: 0.7, z: 0.665 };
function buildFeng(): V {
  const v = fine();
  const C = { SKIN: 0xa87452, SKIN_D: 0x80583e, SCAR: 0xc89c80, BURN: 0x8a4a36, HAIR: 0xbab6ae, HAIR_D: 0x8a8680, BEARD: 0x66605a, BEARD_L: 0x8a847c, BROW: 0x4e4a46,
    APRON: 0x2a2522, APRON_D: 0x1a1614, APRON_L: 0x46403a, TROU: 0x6a5e4c, TROU_D: 0x4e4538, SHOE: 0x262220, IRON: 0x3c3c44, IRON_L: 0x62626c, IRON_D: 0x26262c,
    HOT: 0xff7a30, HOT_L: 0xffb058, BRONZE: 0xb08a3a, CORD: 0x3a2a20, EYE: 0x140e0c };
  rig(v, { hip: 22, spine: 26, chest: 34, neck: 42, head: 44, hat: 58, ax: 13, az: 1, sh: 42, elbow: 32, wrist: 24, grip: 22, lx: 5, knee: 12, back: 6 });
  // ---------------------------------------------------------------- legs in coarse trousers (a wrapped ankle), heavy shoes
  LR(v, 'leg', 2, 12, -2, 7, 21, 3, C.TROU);
  LR(v, 'shin', 3, 6, -2, 7, 11, 2, C.TROU); LR(v, 'shin', 3, 4, -2, 7, 5, 2, C.TROU_D);
  LR(v, 'foot', 2, 0, -2, 7, 1, 5, C.SHOE); LR(v, 'foot', 2, 2, -2, 7, 3, 3, C.SHOE);
  // ---------------------------------------------------------------- the bare torso: a narrow waist under a chest twice as wide
  R(v, 'hips', -8, 22, -6, 7, 25, 5, C.TROU);
  R(v, 'spine', -8, 26, -6, 7, 33, 5, C.SKIN);
  R(v, 'chest', -12, 34, -6, 11, 41, 5, C.SKIN, true);
  B(v, 'neck', -4, 42, -4, 3, 43, 3, C.SKIN);
  // scars and burns: a long cut down the left flank, a burn on the left shoulder, two old cuts across the back
  B(v, 'chest', 8, 33, 5, 8, 40, 5, C.SCAR); B(v, 'chest', 6, 41, -2, 9, 41, 1, C.BURN);
  B(v, 'chest', -9, 34, -6, -9, 40, -6, C.SCAR); B(v, 'chest', 3, 37, -6, 8, 37, -6, C.SCAR);
  // ---------------------------------------------------------------- the leather apron (one cell thin): the bib, straps over the shoulders and down
  // the back, the body down the belly and hips, the skirt hanging in front of the thighs to the knee; the tie round the waist, knotted at
  // the back; a worn light edge at the bib top and the hem
  B(v, 'chest', -6, 34, 6, 5, 39, 6, C.APRON); B(v, 'chest', -6, 39, 6, 5, 39, 6, C.APRON_L);
  for (const x of [-6, 4]) { B(v, 'chest', x, 40, 6, x + 1, 41, 6, C.APRON); B(v, 'chest', x, 42, -7, x + 1, 42, 6, C.APRON); B(v, 'chest', x, 30, -7, x + 1, 41, -7, C.APRON); }
  B(v, 'spine', -8, 26, 6, 7, 33, 6, C.APRON);
  B(v, 'hips', -8, 22, 6, 7, 25, 6, C.APRON); B(v, 'hips', -8, 10, 4, 7, 21, 6, C.APRON); B(v, 'hips', -8, 10, 6, 7, 10, 6, C.APRON_L);
  B(v, 'spine', -8, 30, -7, 7, 31, -7, C.APRON); B(v, 'spine', -9, 30, -6, -9, 31, 5, C.APRON); B(v, 'spine', 8, 30, -6, 8, 31, 5, C.APRON);
  B(v, 'spine', -2, 29, -8, 1, 32, -8, C.APRON_D); B(v, 'spine', -2, 24, -8, -1, 28, -8, C.APRON_D); B(v, 'spine', 0, 25, -8, 1, 28, -8, C.APRON_D);
  // half of a broken sword ring on its cord, lying on the bib
  B(v, 'chest', -2, 35, 7, 0, 35, 7, C.BRONZE); B(v, 'chest', -2, 36, 7, -2, 36, 7, C.BRONZE); B(v, 'chest', 0, 36, 7, 0, 36, 7, C.BRONZE);
  B(v, 'chest', -2, 37, 7, -2, 39, 7, C.CORD); B(v, 'chest', 0, 37, 7, 0, 39, 7, C.CORD);
  // ---------------------------------------------------------------- arms: big upper arms (scars), the left forearm and fist; the right forearm is a
  // stump in the iron sleeve — two raised bands — with the square hammer welded to its end (a light striking face below), the sleeve
  // strapped on with a leather band round the upper arm and two straps down to it
  LR(v, 'arm', 10, 32, -2, 15, 41, 3, C.SKIN);
  B(v, 'armL', 15, 34, 1, 15, 39, 1, C.SCAR); B(v, 'armR', -16, 37, -2, -16, 37, 3, C.SCAR);
  B(v, 'foreL', 10, 24, -2, 14, 31, 2, C.SKIN);
  B(v, 'handL', 11, 20, -2, 14, 23, 1, C.SKIN); B(v, 'handL', 11, 20, 1, 14, 21, 1, C.SKIN_D);
  B(v, 'foreR', -16, 24, -2, -11, 31, 3, C.IRON);
  ring(v, 'foreR', -16, -11, -2, 3, 25, 25, C.IRON_L); ring(v, 'foreR', -16, -11, -2, 3, 30, 30, C.IRON_L);
  R(v, 'foreR', -18, 17, -4, -9, 22, 5, C.IRON_D);
  B(v, 'foreR', -17, 16, -3, -10, 16, 4, C.IRON_L); B(v, 'foreR', -17, 23, -3, -10, 23, 4, C.IRON);
  B(v, 'armR', -16, 34, 4, -11, 35, 4, C.APRON); B(v, 'armR', -16, 34, -3, -11, 35, -3, C.APRON); B(v, 'armR', -17, 34, -2, -17, 35, 3, C.APRON);
  B(v, 'armR', -14, 32, 4, -13, 33, 4, C.APRON); B(v, 'armR', -14, 32, -3, -13, 33, -3, C.APRON);
  // the tongs from the left fist: two thin handles, a rivet, the jaws closed on the red-hot blank lying across in front of him (it glows;
  // brighter at its far end, where the hammer falls)
  B(v, 'offhand', 12, 20, 2, 12, 20, 19, C.IRON); B(v, 'offhand', 12, 22, 2, 12, 22, 19, C.IRON); B(v, 'offhand', 12, 20, 14, 12, 22, 15, C.IRON_L);
  B(v, 'offhand', 12, 22, 9, 12, 22, 19, C.IRON_L);
  v.part('offhand').box(-14, 21, 18, 12, 21, 19, C.HOT, 1).box(-14, 21, 18, -5, 21, 19, C.HOT_L, 1);
  // ---------------------------------------------------------------- the head: grey bristle cut flat on top (a raised brush), short at the sides
  // and back; heavy brows; the full beard wider than the jaw and hanging below the chin, a lighter moustache under the nose
  R(v, 'head', -6, 44, -6, 5, 57, 5, C.SKIN);
  v.paint(c => (c.y >= 56 ? C.HAIR : (c.z <= -3 && c.y >= 48) || ((c.x === -6 || c.x === 5) && c.y >= 52) ? C.HAIR_D : null), 'head');
  B(v, 'head', -5, 58, -5, 4, 58, 4, C.HAIR);
  v.paint(c => ((c.x <= -5 || c.x >= 4) && c.y <= 49 && c.z >= -2) || (c.y <= 46 && c.z >= 2) ? C.BEARD : null, 'head');
  B(v, 'head', -7, 44, -1, -7, 49, 4, C.BEARD); B(v, 'head', 6, 44, -1, 6, 49, 4, C.BEARD);
  B(v, 'head', -4, 42, 4, 3, 43, 6, C.BEARD); B(v, 'head', -4, 40, 6, 3, 41, 6, C.BEARD); B(v, 'head', -5, 44, 6, 4, 45, 6, C.BEARD);
  B(v, 'head', -4, 46, 6, 3, 46, 6, C.BEARD_L); B(v, 'head', -4, 45, 6, -4, 45, 6, C.BEARD_L); B(v, 'head', 3, 45, 6, 3, 45, 6, C.BEARD_L);
  B(v, 'head', -1, 47, 6, 0, 49, 6, C.SKIN); B(v, 'head', -1, 47, 6, 0, 47, 6, C.SKIN_D);
  B(v, 'head', -4, 50, 5, -4, 51, 5, C.EYE); B(v, 'head', 3, 50, 5, 3, 51, 5, C.EYE);
  B(v, 'head', -5, 52, 6, -2, 52, 6, C.BROW); B(v, 'head', 1, 52, 6, 4, 52, 6, C.BROW);
  fuseStill(v);
  fuse(v, 'hips', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR');
  return v;
}

// ================================================================== 卢昭（世家孤女）
// 二十岁，鹅蛋脸，乌黑长发梳成堕马髻（偏在脑后左下）、斜插素银步摇；外披墨黑带兜帽的夜行鹤氅（前面敞开，两侧垂到地），内露绯红织金交领
// 曲裾深衣；袖中半露象牙柄金错短匕，手里摊开一卷竹简舆图；右眼角下一颗暗红泪痣，颈间一道淡淡的勒痕。女性平脸，不出鼻子。
function buildLuzhao(): V {
  const v = fine();
  const C = { SKIN: 0xf0d4bc, SKIN_D: 0xc8a890, SCAR: 0xe4aea4, ROBE: 0x922a34, ROBE_D: 0x6a1c26, GOLD: 0xc89a48, CLOAK: 0x1e1c24, CLOAK_L: 0x34303e, CLOAK_D: 0x121016,
    HAIR: 0x16141a, HAIR_L: 0x2a2630, SILVER: 0xd8dce6, SILVER_D: 0x9aa0ac, PEARL: 0xf4f0e8, MOLE: 0x7a2026, LIP: 0xa8343a, EYE: 0x16100e,
    BAMBOO: 0xbca878, BAMBOO_D: 0x9a8a60, CORD: 0x5a3a26, IVORY: 0xece2c8 };
  rig(v, { hip: 22, spine: 26, chest: 30, neck: 36, head: 40, hat: 54, ax: 8, sh: 36, elbow: 28, wrist: 20, grip: 18, lx: 4, knee: 12, back: 4 });
  v.bone('clA1', 'chest', 0, 34, -7).bone('clA2', 'clA1', 0, 16, -9);
  // ---------------------------------------------------------------- the 曲裾 robe to the ground: a wide trailing hem tier (dark hem, a gold line),
  // the narrow skirt above with the wrap's dark band and gold edge round the hips
  R(v, 'hips', -9, 0, -5, 8, 2, 4, C.ROBE_D); R(v, 'hips', -9, 3, -5, 8, 9, 4, C.ROBE); R(v, 'hips', -9, 4, -5, 8, 4, 4, C.GOLD);
  R(v, 'hips', -6, 10, -4, 5, 25, 3, C.ROBE); R(v, 'hips', -6, 16, -4, 5, 17, 3, C.ROBE_D); R(v, 'hips', -6, 18, -4, 5, 18, 3, C.GOLD);
  R(v, 'spine', -6, 26, -4, 5, 29, 3, C.ROBE); v.paint(c => (c.y <= 27 ? C.ROBE_D : null), 'spine');
  R(v, 'chest', -7, 30, -4, 6, 35, 3, C.ROBE, true);
  // the gold-edged crossed collar
  B(v, 'chest', -2, 34, 3, 1, 35, 3, C.GOLD); B(v, 'chest', -2, 35, 2, 1, 35, 2, C.GOLD); B(v, 'chest', 2, 30, 3, 2, 33, 3, C.GOLD); B(v, 'spine', 2, 28, 3, 2, 29, 3, C.GOLD);
  B(v, 'neck', -2, 36, -2, 1, 39, 1, C.SKIN); B(v, 'neck', -2, 38, 1, 1, 38, 1, C.SCAR);
  // ---------------------------------------------------------------- the black cloak, open in front: its edges down the sides of the chest, the side
  // panels from under the arms to the floor (their front edges turned in, a lighter line down the opening; clear of the hanging arms and
  // of the moving back), the hood bunched behind the neck, the long back on two joints
  v.paint(c => (c.x <= -6 || c.x >= 5 ? C.CLOAK : null), 'chest');
  S(v, 'hips', -11, 2, -5, -11, 15, 1, C.CLOAK); S(v, 'hips', -11, 16, -4, -11, 25, 1, C.CLOAK); S(v, 'spine', -11, 26, -4, -11, 29, 1, C.CLOAK);
  S(v, 'spine', -10, 26, -4, -7, 29, -3, C.CLOAK); S(v, 'hips', -10, 12, 1, -10, 21, 1, C.CLOAK_L);   // the front edges turned in
  R(v, 'chest', -4, 36, -5, 3, 38, -3, C.CLOAK_L); B(v, 'chest', -3, 36, -5, 2, 36, -3, C.CLOAK);
  B(v, 'clA1', -11, 16, -5, 10, 35, -5, C.CLOAK); S(v, 'clA1', -11, 16, -5, -11, 35, -5, C.CLOAK_L);
  B(v, 'clA2', -11, 2, -6, 10, 15, -6, C.CLOAK); B(v, 'clA2', -11, 2, -6, 10, 2, -6, C.CLOAK_D);
  // ---------------------------------------------------------------- wide black sleeves, the robe's crimson inner sleeve at the wrist, small hands;
  // the ivory hilt of the gold-inlaid dagger peeping out beside the left hand
  LR(v, 'arm', 6, 28, -2, 9, 35, 1, C.CLOAK); LR(v, 'fore', 6, 22, -2, 9, 27, 1, C.CLOAK); LR(v, 'fore', 6, 20, -2, 8, 21, 0, C.ROBE);
  hands(v, 16, C.SKIN, C.SKIN_D);
  B(v, 'foreL', 8, 17, 1, 8, 19, 1, C.IVORY); B(v, 'foreL', 8, 16, 1, 8, 16, 1, C.GOLD); B(v, 'foreL', 8, 20, 1, 8, 20, 1, C.GOLD);
  // ---------------------------------------------------------------- the bamboo map, unrolled flat at the waist: slats along z in two tones, two
  // binding cords across, a roll at each end (in both hands)
  for (let x = -9; x <= 8; x++) B(v, 'chest', x, 22, 4, x, 22, 13, ((x + 9) >> 1) & 1 ? C.BAMBOO_D : C.BAMBOO);
  B(v, 'chest', -9, 22, 7, 8, 22, 7, C.CORD); B(v, 'chest', -9, 22, 12, 8, 22, 12, C.CORD);
  S(v, 'chest', -11, 22, 4, -10, 23, 13, C.BAMBOO_D);
  // ---------------------------------------------------------------- the head: an oval face (the chin one cell in), black hair parted in the middle
  // and framing the face, the 堕马髻 slipping low at the back to her left, a plain silver pin through it with two short drops
  R(v, 'head', -6, 40, -6, 5, 53, 5, C.SKIN, true);
  B(v, 'head', -6, 40, -6, 5, 40, 5, null); B(v, 'head', -5, 40, -5, 4, 40, 4, C.SKIN);
  v.paint(c => (c.y >= 50 || (c.z <= -3 && c.y >= 40) || ((c.x <= -5 || c.x >= 4) && c.y >= 44) ? C.HAIR : null), 'head');
  B(v, 'head', -1, 53, -5, 0, 53, 4, C.HAIR_L);
  R(v, 'head', 1, 43, -10, 7, 48, -7, C.HAIR); B(v, 'head', 2, 48, -9, 6, 48, -8, C.HAIR_L);
  B(v, 'head', 7, 47, -9, 11, 47, -9, C.SILVER);
  B(v, 'head', 11, 44, -9, 11, 46, -9, C.SILVER_D); B(v, 'head', 11, 43, -9, 11, 43, -9, C.PEARL);
  B(v, 'head', 9, 45, -9, 9, 46, -9, C.SILVER_D); B(v, 'head', 9, 44, -9, 9, 44, -9, C.PEARL);
  B(v, 'head', -3, 45, 5, -3, 46, 5, C.EYE); B(v, 'head', 2, 45, 5, 2, 46, 5, C.EYE);
  B(v, 'head', -4, 44, 5, -4, 44, 5, C.MOLE);
  B(v, 'head', -1, 42, 5, 0, 42, 5, C.LIP);
  fuseStill(v);
  fuse(v, 'hips', 'footL', 'footR');
  return v;
}

// ================================================================== 桓越（血衣剑客）
// 二十四岁，剑眉星目的窄长脸，原本高束的黑发被削断一截、披散，发梢齐齐削平，额绑暗红抹额；染着陈旧暗红血斑的月白窄袖劲装，左肩半边
// 亮银轻骑肩甲；四尺青铜夹钢汉剑（青铜剑身、两道钢刃），剑柄垂黑穗；左颊浅疤。坐在石阶上：剑插在脚前地上、右手拄着剑柄，左手一只酒葫芦。
function buildHuanyue(): V {
  const v = fine();
  const C = { SKIN: 0xe0b896, SKIN_D: 0xae8668, SCAR: 0xf2ccb4, WHITE: 0xd4d8e0, WHITE_D: 0xa4aab8, WHITE_L: 0xeceef4, BLOOD: 0x7e2a2a, BLOOD_D: 0x5c1e20,
    BELT: 0x2a2830, BUCKLE: 0xb08a3a, BOOT: 0x1e1e24, BRACER: 0x3a3036, SILVER: 0xc8d0dc, SILVER_D: 0x8a92a0,
    HAIR: 0x141218, BAND: 0x8a1e24, BAND_D: 0x5e1418, EYE: 0x140e0c, MOUTH: 0x6a3a30,
    BRONZE: 0xb08e52, EDGE: 0xe0e4ea, GUARD: 0x8a6a30, GRIP: 0x241c1a, TASSEL: 0x18181c, GOURD: 0xc8963e, GOURD_D: 0x946426, CORD: 0x8a2a20 };
  rig(v, { hip: 22, spine: 26, chest: 32, neck: 38, head: 42, hat: 56, ax: 8, sh: 38, elbow: 30, wrist: 22, grip: 20, lx: 4, knee: 12, back: 4 });
  v.bone('tlA1', 'head', 0, 48, -9);
  // ---------------------------------------------------------------- legs: white trousers, the coat's skirt to mid-thigh, black boots to mid-shin
  LR(v, 'leg', 2, 12, -2, 5, 21, 1, C.WHITE);
  R(v, 'legL', 0, 14, -4, 5, 21, 3, C.WHITE); R(v, 'legR', -6, 14, -4, -1, 21, 3, C.WHITE); for (const L of ['legL', 'legR']) v.paint(c => (c.y === 14 ? C.WHITE_D : null), L);
  LR(v, 'shin', 3, 10, -2, 5, 11, 0, C.WHITE); LR(v, 'shin', 2, 4, -2, 5, 9, 1, C.BOOT);
  LR(v, 'foot', 2, 0, -2, 5, 1, 5, C.BOOT); LR(v, 'foot', 2, 2, -2, 5, 3, 3, C.BOOT);
  // ---------------------------------------------------------------- the fitted coat: a black belt with a bronze buckle, the crossed collar
  R(v, 'hips', -6, 22, -4, 5, 25, 3, C.WHITE);
  R(v, 'spine', -5, 26, -4, 4, 31, 3, C.WHITE); v.paint(c => (c.y <= 28 ? C.BELT : null), 'spine'); B(v, 'spine', -1, 26, 4, 0, 28, 4, C.BUCKLE);
  R(v, 'chest', -7, 32, -4, 6, 37, 3, C.WHITE, true);
  B(v, 'neck', -2, 38, -2, 1, 41, 1, C.SKIN);
  B(v, 'chest', -2, 35, 3, 1, 37, 3, C.WHITE_L); B(v, 'chest', -2, 37, 2, 1, 37, 2, C.WHITE_L);
  B(v, 'chest', 2, 32, 3, 2, 36, 3, C.WHITE_D); B(v, 'spine', 2, 29, 3, 2, 31, 3, C.WHITE_D);
  // ---------------------------------------------------------------- narrow white sleeves, dark leather bracers, small hands
  LR(v, 'arm', 6, 30, -2, 9, 37, 1, C.WHITE);
  LR(v, 'fore', 6, 22, -2, 8, 29, 0, C.WHITE); LR(v, 'fore', 6, 22, -2, 8, 27, 0, C.BRACER); LR(v, 'fore', 6, 25, -2, 8, 25, 0, C.BELT);
  hands(v, 18, C.SKIN, C.SKIN_D);
  // ---------------------------------------------------------------- old blood: the right sleeve, the chest's lower left, the left flap
  B(v, 'armR', -10, 32, -2, -10, 34, 0, C.BLOOD); B(v, 'armR', -10, 32, -2, -10, 32, -1, C.BLOOD_D);
  B(v, 'chest', 3, 32, 3, 5, 33, 3, C.BLOOD); B(v, 'chest', 4, 32, 3, 5, 32, 3, C.BLOOD_D);
  B(v, 'legL', 3, 16, 3, 5, 18, 3, C.BLOOD); B(v, 'legL', 4, 16, 3, 5, 16, 3, C.BLOOD_D);
  // ---------------------------------------------------------------- the bright silver half shoulder guard on the left: a cap over the shoulder and
  // three plates down the outside (dark lines between)
  B(v, 'armL', 5, 38, -3, 10, 38, 2, C.SILVER); B(v, 'armL', 5, 38, -3, 5, 38, 2, C.SILVER_D);
  B(v, 'armL', 10, 30, -3, 10, 37, 2, C.SILVER); B(v, 'armL', 10, 35, -3, 10, 35, 2, C.SILVER_D); B(v, 'armL', 10, 32, -3, 10, 32, 2, C.SILVER_D);
  // ---------------------------------------------------------------- the head: a narrow long face; black hair hanging loose round it, cut off
  // dead straight at the nape; two tufts standing up, a lock fallen over the brow; the dark red headband (one cell proud) knotted at
  // the back, its two tails on their own joint
  R(v, 'head', -6, 42, -6, 5, 55, 5, C.SKIN, true);
  B(v, 'head', -6, 42, -6, 5, 42, 5, null); B(v, 'head', -5, 42, -5, 4, 42, 4, C.SKIN);
  v.paint(c => (c.y >= 52 || (c.z <= -3 && c.y >= 43) || ((c.x <= -5 || c.x >= 4) && c.y >= 46) ? C.HAIR : null), 'head');
  B(v, 'head', -6, 40, -7, 5, 51, -7, C.HAIR);
  B(v, 'head', -7, 44, -6, -7, 51, 3, C.HAIR); B(v, 'head', 6, 46, -6, 6, 51, 3, C.HAIR);
  B(v, 'head', -4, 56, -2, -2, 56, 0, C.HAIR); B(v, 'head', 2, 56, -4, 3, 58, -3, C.HAIR);
  ring(v, 'head', -6, 5, -6, 5, 50, 51, C.BAND);
  B(v, 'head', -2, 48, -8, 1, 51, -8, C.BAND_D);
  B(v, 'head', -5, 48, 6, -4, 53, 6, C.HAIR);
  B(v, 'tlA1', -3, 38, -9, -2, 49, -9, C.BAND); B(v, 'tlA1', 0, 36, -9, 1, 49, -9, C.BAND);
  B(v, 'tlA1', -3, 38, -9, -2, 38, -9, C.BAND_D); B(v, 'tlA1', 0, 36, -9, 1, 36, -9, C.BAND_D);
  // the face: straight brows, dark eyes, the nose one cell proud, a mouth with one corner up, the pale scar on the left cheek
  B(v, 'head', -5, 49, 5, -2, 49, 5, C.HAIR); B(v, 'head', 1, 49, 5, 4, 49, 5, C.HAIR);
  B(v, 'head', -3, 46, 5, -3, 47, 5, C.EYE); B(v, 'head', 2, 46, 5, 2, 47, 5, C.EYE);
  B(v, 'head', -1, 45, 6, 0, 46, 6, C.SKIN); B(v, 'head', -1, 45, 6, 0, 45, 6, C.SKIN_D);
  B(v, 'head', -2, 43, 5, 1, 43, 5, C.MOUTH); B(v, 'head', 2, 44, 5, 2, 44, 5, C.MOUTH);
  B(v, 'head', 4, 43, 5, 4, 45, 5, C.SCAR);
  // ---------------------------------------------------------------- the 四尺 sword along the fist's forward axis: the pommel and black tassel behind,
  // the grip through the fist, a small bronze guard, the bronze blade with a steel edge each side, the point one cell
  B(v, 'weapon', -8, 19, -5, -8, 21, -4, C.BUCKLE); B(v, 'weapon', -8, 20, -3, -8, 20, 3, C.GRIP);
  B(v, 'weapon', -9, 18, 4, -6, 22, 4, C.GUARD);
  B(v, 'weapon', -8, 19, 5, -8, 21, 27, C.BRONZE); B(v, 'weapon', -8, 19, 5, -8, 19, 27, C.EDGE); B(v, 'weapon', -8, 21, 5, -8, 21, 27, C.EDGE);
  B(v, 'weapon', -8, 20, 28, -8, 20, 29, C.EDGE);
  B(v, 'weapon', -10, 20, -5, -9, 20, -5, C.TASSEL); B(v, 'weapon', -10, 20, -4, -10, 20, 1, C.TASSEL);
  // the gourd hanging from the left fist by its neck: a red cord, a small upper bulb, the big bulb below
  B(v, 'offhand', 7, 17, -1, 7, 17, -1, C.CORD);
  B(v, 'offhand', 7, 14, -2, 8, 16, -1, C.GOURD); B(v, 'offhand', 7, 13, -2, 8, 13, -1, C.GOURD_D);
  B(v, 'offhand', 6, 9, -3, 9, 12, 0, C.GOURD); B(v, 'offhand', 6, 9, -3, 9, 9, 0, C.GOURD_D);
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
