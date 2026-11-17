// 据点五人（docs/STORY.md §6，外貌卡 7–11）：杜五、鬼针孙媪、冯铁臂、卢昭、桓越。身材照主角的瘦长版（blind2.ts 的 body：手臂往里收
// 一格叠住胸口外沿、胸口顶补齐、两格脖子），冯铁臂高一头宽一圈，孙媪矮、驼背。俯视镜头下靠剪影和色块认人：杜五背上一口黑锅、
// 灰布包头；孙媪银白道髻、紫褐长衣、腰上一串药葫芦；冯铁臂赤膊、黑皮围裙、右小臂一截铁套筒焊着方锤；卢昭黑氅里露绯红深衣、
// 手里摊着竹简；桓越月白劲装、暗红抹额、左肩一片亮银肩甲、四尺汉剑。
// 待机（POSE_HOOKS）：杜五坐不住（搓手、挠头、东张西望、换脚、点脚尖）；孙媪不动，只微微晃，隔一阵举针看；冯铁臂一锤一锤慢慢
// 打（锤落迸火星）；卢昭端着看竹简，隔一阵抬眼；桓越坐在石阶最下一级（座高 0.35 米），拄着插在地上的剑，隔一阵举葫芦喝一口。
// 只用横平竖直的大块，2～3 档颜色，不撒随机点（CLAUDE.md 美术铁律）。不动的部件并进父骨骼——每个部件是一个网格、一次 draw call。
import * as THREE from 'three';
import { newChar, biped, CELL, type V, type Anchors, type Biped } from '../bestiary/kit';
import { ROSTER, type ModelDef } from '../bestiary/models';
import { POSE_HOOKS } from '../bestiary/poseHooks';
import { rot, mov, type Bone } from '../actors/rig';
import type { Col } from '../look/voxkit';
import { fxSparks } from '../fx/fx';

// ------------------------------------------------------------------ shared bits
const MALE = { legH: 11, legW: 2, legD: 2, legGap: 1, hipH: 2, torsoH: 6, torsoW: 6, chestW: 8, torsoD: 4, headW: 6, headH: 7, headD: 6, neckH: 2, armW: 2, upper: 4, fore: 4, hand: 2 } as const;
const ARM_L = ['armL', 'foreL', 'handL'], ARM_R = ['armR', 'foreR', 'handR'];
/** the slim body of the cast (blind2.ts): arms one cell in over the chest's outer column, the chest's top row filled out to the
 *  shoulders, a neck between chest and head (neck = its width in cells) */
function slimBody(v: V, o: Biped, neck = 2): Anchors {
  const A = biped(v, o), cw = A.chestW, hz = A.torsoD / 2, T1 = A.torsoY1, c = o.chest ?? o.torso ?? o.skin;
  for (const n of ['shL', 'armL', 'foreL', 'handL', 'offhand']) { const b = v.bonesAbs.get(n); if (b) b.p.x -= 1; }
  for (const n of ['shR', 'armR', 'foreR', 'handR', 'weapon']) { const b = v.bonesAbs.get(n); if (b) b.p.x += 1; }
  const moved: Array<{ x: number; y: number; z: number; c: Col; g: number; part: string }> = [];
  for (const [k, cell] of v.cells) { const d = ARM_L.includes(cell.part) ? -1 : ARM_R.includes(cell.part) ? 1 : 0; if (d) { moved.push({ ...cell, x: cell.x + d }); v.cells.delete(k); } }
  for (const m of moved) { v.part(m.part); v.set(m.x, m.y, m.z, m.c, m.g); }
  v.part('chest');
  for (let x = -cw / 2; x <= cw / 2 - 1; x++) for (let z = -hz; z <= hz - 1; z++) if (Math.min(x + cw / 2, cw / 2 - 1 - x) + Math.min(z + hz, hz - 1 - z) >= 1) v.set(x, T1, z, c);
  if (A.headY0 > T1 + 1) v.part('neck').box(-neck / 2, T1 + 1, -neck / 2, neck / 2 - 1, A.headY0 - 1, neck / 2 - 1, o.skin);
  return { ...A, wR: [A.wR[0] + 1, A.wR[1], A.wR[2]], wL: [A.wL[0] - 1, A.wL[1], A.wL[2]] };
}
/** 交领: a pale inner collar across the throat, the outer robe's edge as one straight strip down the front (x = 1 column) */
function collar(v: V, A: Anchors, inner: Col, edge: Col) {
  const zf = A.torsoD / 2 - 1, T1 = A.torsoY1, T0 = A.torsoY0;
  v.paint(c => (c.z === zf && c.y === T1 && c.x >= -2 && c.x <= 1 ? inner : c.z === zf && c.y === T1 - 1 && c.x >= -1 && c.x <= 0 ? inner : c.z === zf && c.x === 1 && c.y >= T0 + 2 && c.y < T1 - 1 ? edge : null), 'chest');
  v.paint(c => (c.z === zf && c.x === 1 && c.y >= T0 + 2 ? edge : null), 'spine');
}
/** coat flaps on the thighs (each thigh carries its half) from the hips down to y0 */
function flaps(v: V, A: Anchors, y0: number, c: Col, hem: Col) {
  const top = A.hipY - 1;
  v.part('legL').box(0, y0, -2, 3, top, 1, c).box(0, y0, -2, 3, y0, 1, hem);
  v.part('legR').box(-4, y0, -2, -1, top, 1, c).box(-4, y0, -2, -1, y0, 1, hem);
}
/** a face: two eyes (one row), a nose one cell proud, a mouth on the bottom row; L / R given separately so an eye can differ */
function face(v: V, A: Anchors, o: { eyeR: Col; eyeL?: Col; nose: Col; mouth: Col; skin: Col; flat?: boolean }) {
  const H0 = A.headY0, F = A.faceZ;
  v.part('head').set(-2, H0 + 3, F, o.eyeR).set(1, H0 + 3, F, o.eyeL ?? o.eyeR).box(-1, H0, F, 0, H0, F, o.mouth);
  // a woman's face stays flat (act-21, user: 「女性的鼻子都不要突出」); a man's nose stands one cell proud
  if (!o.flat) v.box(-1, H0 + 1, F + 1, 0, H0 + 2, F + 1, o.skin).box(-1, H0 + 1, F + 1, 0, H0 + 1, F + 1, o.nose);
}
/** move every cell of the parts `from` into part `into` (a part that never moves on its own needn't be its own mesh) */
function fuse(v: V, into: string, ...from: string[]) { for (const c of v.cells.values()) if (from.includes(c.part)) c.part = into; }
/** the usual merge for a figure that stands still: neck into chest, jaw / hat into head, the hands into the forearms */
function fuseStill(v: V) { fuse(v, 'chest', 'spine', 'neck'); fuse(v, 'head', 'jaw', 'hat'); fuse(v, 'foreL', 'handL', 'offhand'); fuse(v, 'foreR', 'handR'); }

// motion helpers
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ss = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** a window over a cycle position x: rises over [a, a + e], holds, falls over [b − e, b] */
const win = (x: number, a: number, b: number, e = 0.4) => ss(a, a + e, x) * (1 - ss(b - e, b, x));

// ================================================================== 杜五（赶车伙夫）
// 二十二岁，圆短脸带雀斑，枯黄乱发用灰布巾包头，下巴青黑胡茬；补丁土黄麻布短褐，肩搭油腻灰白汗巾，挽裤腿、草鞋；背一口黑铁炒锅，
// 腰插剁骨菜刀，右胯挂一盘捆尸麻绳；左手缺两指。
function buildDuwu(): V {
  const v = newChar();
  const C = { SKIN: 0xd4a27a, SKIN_D: 0xa87650, FRECK: 0xb47a52, JK: 0xa8884e, JK_D: 0x7c6236, JK_L: 0xc0a068, PATCH: 0x6a6252, PATCH2: 0x8a5e3e,
    TROU: 0x5a5042, TROU_L: 0x7a6e58, STRAW: 0xc4a05a, STRAW_D: 0x8e7038, WRAP: 0x8a867e, WRAP_D: 0x66625c, HAIR: 0xc09a52, STUB: 0x6a5c4e, MOUTH: 0x5a3426,
    TOWEL: 0xd6d0c2, TOWEL_D: 0xaaa496, WOK: 0x2a2a2e, WOK_L: 0x4e4e56, ROPE: 0x9a8458, ROPE_D: 0x6e5c3a, BLADE: 0xaab0b8, HAFT: 0x5a3c26, EYE: 0x1c1410 };
  const A = slimBody(v, { skin: C.SKIN, legs: C.TROU, boots: C.STRAW, hips: C.JK, torso: C.JK, chest: C.JK, belt: null, sleeve: C.JK, fore_: C.SKIN, hands: C.SKIN, head: C.SKIN, ...MALE, legH: 10 });
  const H0 = A.headY0, T0 = A.torsoY0, T1 = A.torsoY1, F = A.faceZ;
  // the jacket: crossed collar, a rope belt, the short skirt to mid-thigh, sleeves rolled to the elbow (a light cuff), two patches
  collar(v, A, C.JK_L, C.JK_D);
  v.paint(c => (c.y <= T0 ? C.ROPE : null), 'spine');
  flaps(v, A, A.hipY - 3, C.JK, C.JK_D);
  for (const f of ['foreL', 'foreR']) v.paint(c => (c.y === A.shoulderY - 5 ? C.JK_L : null), f);
  v.part('chest').box(1, T1 - 3, 2, 2, T1 - 2, 2, C.PATCH);
  v.part('legR').box(-4, A.hipY - 2, 2, -3, A.hipY - 1, 2, C.PATCH2);
  v.part('armR').box(-6, A.shoulderY - 3, -1, -6, A.shoulderY - 2, 0, C.PATCH);
  // trousers rolled to the knee: a fat cuff, bare shins, straw sandals with a bare instep
  for (const s of ['L', 'R']) {
    v.paint(c => (c.y === 4 ? C.TROU_L : C.SKIN), 'shin' + s);
    v.paint(c => (c.y === 0 ? C.STRAW_D : c.z >= 0 ? C.SKIN : C.STRAW), 'foot' + s);
  }
  // the greasy towel over the left shoulder, hanging down the front and the back
  v.part('chest').box(1, T1, -2, 3, T1 + 1, 1, C.TOWEL).box(1, T1 - 4, 2, 2, T1, 2, C.TOWEL).box(1, T1 - 3, -3, 2, T1, -3, C.TOWEL)
    .box(1, T1 - 4, 2, 2, T1 - 4, 2, C.TOWEL_D).box(1, T1 - 3, -3, 2, T1 - 3, -3, C.TOWEL_D);
  // the black iron wok on his back (its round bottom outward: an outer ring, a deeper middle, the flat base) and its loop handle
  v.part('chest').box(-4, T0 - 1, -3, 3, T1, -3, C.WOK).box(-3, T0 - 2, -3, 2, T1 + 1, -3, C.WOK)
    .box(-3, T0, -4, 2, T1 - 1, -4, C.WOK).box(-1, T0 + 2, -5, 0, T1 - 3, -5, C.WOK_L)
    .box(-4, T1 + 1, -3, -4, T1 + 2, -3, C.WOK_L).box(3, T1 + 1, -3, 3, T1 + 2, -3, C.WOK_L);
  // the rope coil on the right hip, the cleaver tucked in at the left
  v.part('hips').box(-4, A.hipY - 2, -1, -4, A.hipY + 1, 2, C.ROPE).box(-4, A.hipY - 1, 0, -4, A.hipY, 1, null).box(-4, A.hipY - 2, -1, -4, A.hipY - 2, 2, C.ROPE_D);
  v.part('hips').box(3, A.hipY - 2, -1, 3, A.hipY, 1, C.BLADE).box(3, A.hipY - 2, -1, 3, A.hipY - 2, 1, 0xd8dce2).box(3, A.hipY + 1, 0, 3, A.hipY + 2, 0, C.HAFT);
  // the left hand short of two fingers: its outer front column gone
  v.part('handL').set(4, A.handY, 0, null);
  // head: the grey cloth wrap over the top and back (one cell proud, a knot and two ends at the back), dry yellow hair poking out at
  // the temples, stubble round the jaw, freckles under the eyes
  v.part('head');
  for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) for (let y = H0 + 5; y <= H0 + 7; y++) {
    const ex = Math.min(x + 4, 3 - x), ez = Math.min(z + 4, 3 - z);
    if (ex + ez < 1 || (y === H0 + 7 && (ex < 1 || ez < 1))) continue;
    v.set(x, y, z, y === H0 + 5 ? C.WRAP_D : C.WRAP);
  }
  v.box(-1, H0 + 3, -4, 0, H0 + 5, -4, C.WRAP_D).box(-2, H0 + 1, -4, -2, H0 + 3, -4, C.WRAP).box(1, H0 + 2, -4, 1, H0 + 3, -4, C.WRAP);
  v.paint(c => (c.z <= -2 && c.y >= H0 + 1 && c.y <= H0 + 4 ? C.HAIR : null), 'head');
  v.box(-4, H0 + 3, 0, -4, H0 + 4, 1, C.HAIR).box(3, H0 + 3, 0, 3, H0 + 4, 1, C.HAIR).box(-3, H0 + 4, F, -2, H0 + 4, F, C.HAIR).box(1, H0 + 4, F, 2, H0 + 4, F, C.HAIR);
  v.paint(c => (c.y === H0 && (c.z >= -1) ? C.STUB : c.y === H0 + 1 && (c.x === -3 || c.x === 2) && c.z >= -1 ? C.STUB : null), 'head');
  face(v, A, { eyeR: C.EYE, nose: C.SKIN_D, mouth: C.MOUTH, skin: C.SKIN });
  v.part('head').set(-2, H0 + 2, F, C.FRECK).set(1, H0 + 2, F, C.FRECK);
  fuseStill(v);
  fuse(v, 'legL', 'shinL', 'footL'); fuse(v, 'legR', 'shinR');
  return v;
}

// ================================================================== 鬼针孙媪（暴室医婆）
// 六十二岁，消瘦的菱形脸刻满皱纹，银白长发挽成插骨簪的道髻；深紫褐斜襟窄袖粗布衣，腰系挂满小药葫芦的皮囊；右手夹着几根银针、左手
// 一把刮骨小刀；左眼浑浊惨白、右眼精光；嘴角下撇。
function buildSunao(): V {
  const v = newChar();
  const C = { SKIN: 0xd8b498, SKIN_D: 0xa88468, ROBE: 0x553a4a, ROBE_D: 0x3c2834, ROBE_L: 0x6e5262, JACKET: 0x604656, INNER: 0xc8bca8,
    HAIR: 0xdcdce2, HAIR_D: 0xa8a8b2, BONE: 0xc8a868, BELT: 0x4a3020, BELT_L: 0x6a4a30, GOURD: 0xc8963e, GOURD_D: 0x946426, CORD: 0x8a2a20,
    EYE: 0x16100e, BLIND: 0xe6e2da, MOUTH: 0x6a3a30, NEEDLE: 0xeef2f8, KNIFE: 0x9aa0aa, SHOE: 0x2a2224 };
  const A = slimBody(v, { skin: C.SKIN, boots: C.SHOE, torso: C.JACKET, chest: C.JACKET, belt: null, sleeve: C.JACKET, fore_: C.JACKET, hands: C.SKIN, head: C.SKIN,
    robe: { c: C.ROBE, flare: 1, trim: C.ROBE_D, hem: C.ROBE_D }, ...MALE, legH: 9, torsoH: 6, neckH: 1 });
  const H0 = A.headY0, T0 = A.torsoY0, F = A.faceZ;
  collar(v, A, C.INNER, C.ROBE_L);
  // the long jacket over the skirt (one cell proud, to the knee) with a dark hem; the belt with its pouch and gourds on cords
  v.part('hips').box(-4, A.hipY - 4, -3, 3, A.hipY + 1, 2, C.JACKET).box(-4, A.hipY - 4, -3, 3, A.hipY - 4, 2, C.ROBE_D).box(1, A.hipY - 3, 3, 1, A.hipY + 1, 3, C.ROBE_L);
  v.paint(c => (c.y === T0 ? C.BELT : null), 'spine');
  v.part('hips').box(-5, A.hipY - 2, -1, -5, A.hipY, 1, C.BELT_L).box(-5, A.hipY - 2, -1, -5, A.hipY - 2, 1, C.BELT);
  for (const [x, big] of [[-3, true], [-1, false], [2, true]] as Array<[number, boolean]>) {
    v.part('hips').set(x, A.hipY + 1, 3, C.CORD).set(x, A.hipY, 3, C.GOURD_D);
    if (big) v.box(x, A.hipY - 3, 3, x + (x < 0 ? -1 : 1), A.hipY - 1, 4, C.GOURD).box(x, A.hipY - 3, 4, x + (x < 0 ? -1 : 1), A.hipY - 3, 4, C.GOURD_D);
    else v.box(x, A.hipY - 2, 3, x, A.hipY - 1, 4, C.GOURD);
  }
  // head: silver hair at the top, back and sides; a bun on the crown tied with a dark band, a bone pin through it
  v.paint(c => (c.y >= H0 + 5 || (c.z <= -2 && c.y >= H0 + 1) || ((c.x === -3 || c.x === 2) && c.y >= H0 + 3 && c.z < F) ? C.HAIR : null), 'head');
  v.part('head').box(-2, H0 + 7, -3, 1, H0 + 7, 0, C.HAIR_D).box(-1, H0 + 8, -2, 0, H0 + 9, -1, C.HAIR)
    .box(-3, H0 + 8, -2, 2, H0 + 8, -2, C.BONE).box(-3, H0 + 8, -2, -3, H0 + 8, -2, 0x9a7e48);
  // the face: a diamond (the jaw's corners cut), the forehead line and the cheek lines, the frown, the sharp right eye, the dead left eye
  v.part('head').set(-3, H0, F, null).set(2, H0, F, null).set(-3, H0, F - 1, null).set(2, H0, F - 1, null);
  face(v, A, { eyeR: C.EYE, eyeL: C.BLIND, nose: C.SKIN_D, mouth: C.MOUTH, skin: C.SKIN, flat: true });
  v.part('head').box(-2, H0 + 4, F, 1, H0 + 4, F, C.SKIN_D).set(-2, H0 + 1, F, C.SKIN_D).set(1, H0 + 1, F, C.SKIN_D).set(-2, H0, F, C.SKIN_D).set(1, H0, F, C.SKIN_D);
  // silver needles in the right fist (two, along the fist's forward axis), the small scraping knife in the left
  const [rx, ry, rz] = A.wR, [lx, ly, lz] = A.wL;
  v.part('weapon').box(rx, ry, rz + 1, rx, ry, rz + 5, C.NEEDLE).box(rx, ry + 1, rz + 1, rx, ry + 1, rz + 4, C.NEEDLE);
  v.part('offhand').box(lx, ly, lz + 1, lx, ly, lz + 1, C.BELT).box(lx, ly, lz + 2, lx, ly + 1, lz + 3, C.KNIFE);
  fuseStill(v); fuse(v, 'foreR', 'weapon');
  fuse(v, 'hips', 'footL', 'footR');
  return v;
}

// ================================================================== 冯铁臂（独腕老匠）
// 五十岁，魁梧如铁塔；古铜棱角方脸，寸短灰白硬发，满脸浓密络腮胡；赤膊，烫伤和刀疤纵横；玄黑厚牛皮围裙，粗麻长裤；左手长柄火钳
// （钳着一条烧红的刀坯），右小臂套着熟铁套筒、筒头焊死一把方锤；脖子上挂半枚残缺的刀环。
const BIG = { legH: 11, legW: 3, legD: 3, legGap: 1, hipH: 2, torsoH: 8, torsoW: 8, chestW: 12, torsoD: 6, headW: 6, headH: 7, headD: 6, neckH: 1, armW: 3, upper: 5, fore: 4, hand: 2 } as const;
/** where his strike lands, in his own frame (metres: x to his left, up, forward): the anvil is built under it (hideout.ts) */
export const FENG_STRIKE = { x: -7 * CELL, y: 0.7, z: 9.5 * CELL };
function buildFeng(): V {
  const v = newChar();
  const C = { SKIN: 0xa87452, SKIN_D: 0x80583e, SCAR: 0xc89c80, BURN: 0x8a4a36, HAIR: 0xbab6ae, HAIR_D: 0x8a8680, BEARD: 0x66605a, BEARD_L: 0x8a847c, BROW: 0x4e4a46,
    APRON: 0x2a2522, APRON_D: 0x1a1614, APRON_L: 0x46403a, TROU: 0x6a5e4c, TROU_D: 0x4e4538, SHOE: 0x262220, IRON: 0x3c3c44, IRON_L: 0x62626c, IRON_D: 0x26262c,
    HOT: 0xff7a30, HOT_L: 0xffb058, BRONZE: 0xb08a3a, CORD: 0x3a2a20, EYE: 0x140e0c };
  const A = slimBody(v, { skin: C.SKIN, legs: C.TROU, boots: C.SHOE, hips: C.TROU, torso: C.SKIN, chest: C.SKIN, belt: null, sleeve: C.SKIN, fore_: C.SKIN, hands: C.SKIN, head: C.SKIN, ...BIG }, 4);
  const H0 = A.headY0, T0 = A.torsoY0, T1 = A.torsoY1, F = A.faceZ, zf = A.torsoD / 2;   // zf: one cell proud of the front
  // the leather apron: a bib on the chest, the body down the belly and hips, the skirt in front of the thighs to the knee; straps over
  // the shoulders, the tie at the back; a light worn edge at the bib top and the hem
  v.part('chest').box(-3, T1 - 3, zf, 2, T1 - 1, zf, C.APRON).box(-3, T1 - 1, zf, 2, T1 - 1, zf, C.APRON_L)
    .box(-3, T1, -zf, -3, T1, zf - 1, C.APRON).box(2, T1, -zf, 2, T1, zf - 1, C.APRON);
  v.part('spine').box(-4, T0, zf, 3, T1 - 4, zf, C.APRON).box(-4, T0, -zf, 3, T0, -zf, C.APRON).box(-1, T0 - 1, -zf - 1, 0, T0, -zf - 1, C.APRON_D);
  v.part('hips').box(-4, A.hipY, zf, 3, A.hipY + 1, zf, C.APRON);
  v.part('legL').box(0, 5, 2, 4, A.hipY - 1, 2, C.APRON).box(0, 5, 2, 4, 5, 2, C.APRON_L);
  v.part('legR').box(-5, 5, 2, -1, A.hipY - 1, 2, C.APRON).box(-5, 5, 2, -1, 5, 2, C.APRON_L);
  for (const s of ['shinL', 'shinR']) v.paint(c => (c.y === 2 ? C.TROU_D : null), s);
  // scars and burns on the bare skin: a long cut down the left flank, one across the right upper arm, a burn on the left shoulder and
  // on the right forearm's stump
  v.part('chest').box(4, T1 - 3, zf - 1, 4, T1 - 1, zf - 1, C.SCAR).box(3, T1, -1, 4, T1, 0, C.BURN);
  v.part('armR').box(-9, A.shoulderY - 3, -1, -9, A.shoulderY - 3, 1, C.SCAR);
  v.part('armL').box(7, A.shoulderY - 4, 0, 7, A.shoulderY - 2, 0, C.SCAR);
  // the broken sword ring on a cord, lying on the bib
  v.part('chest').box(-2, T1, zf, -2, T1, zf, C.CORD).box(1, T1, zf, 1, T1, zf, C.CORD).box(-1, T1 - 2, zf + 1, -1, T1 - 1, zf + 1, C.BRONZE).set(0, T1 - 1, zf + 1, C.BRONZE);
  // the right forearm: an iron sleeve (two lighter bands) and, where the hand was, the square hammer welded on (a light striking face)
  for (const [k, c] of v.cells) if (c.part === 'handR') v.cells.delete(k);
  v.paint(c => (c.y === A.handY + 2 || c.y === A.handY + 5 ? C.IRON_L : C.IRON), 'foreR');
  const hx = A.wR[0], hy = A.handY;
  v.part('foreR').box(hx - 2, hy - 2, -2, hx + 2, hy + 1, 2, C.IRON_D).box(hx - 2, hy - 2, -2, hx + 2, hy - 2, 2, C.IRON_L).box(hx - 2, hy + 1, -2, hx + 2, hy + 1, 2, C.IRON);
  // the left hand: the long tongs straight forward from the fist, a red-hot blade blank in their jaws lying across to his right
  const [lx, ly, lz] = A.wL;
  v.part('offhand').box(lx, ly, lz + 1, lx, ly, lz + 9, C.IRON).box(lx, ly + 1, lz + 1, lx, ly + 1, lz + 3, C.IRON).box(lx, ly + 1, lz + 4, lx, ly + 1, lz + 9, C.IRON_L);
  v.part('offhand').box(lx - 13, ly, lz + 9, lx - 1, ly, lz + 9, C.HOT, 1).box(lx - 13, ly, lz + 9, lx - 9, ly, lz + 9, C.HOT_L, 1);
  // the head: grey bristle on top and back, heavy brows, the full beard (wider than the jaw, hanging onto the neck), a moustache
  v.paint(c => (c.y >= H0 + 6 || (c.z <= -2 && c.y >= H0 + 2) ? (c.y === H0 + 6 && c.z > -2 ? C.HAIR : C.HAIR_D) : null), 'head');
  face(v, A, { eyeR: C.EYE, nose: C.SKIN_D, mouth: C.BEARD, skin: C.SKIN });
  v.part('head').box(-3, H0 + 4, F, -2, H0 + 4, F, C.BROW).box(1, H0 + 4, F, 2, H0 + 4, F, C.BROW)
    .box(-3, H0, -1, 2, H0, F, C.BEARD).box(-3, H0 + 1, -1, -3, H0 + 3, F, C.BEARD).box(2, H0 + 1, -1, 2, H0 + 3, F, C.BEARD)
    .box(-2, H0 + 1, F, -2, H0 + 1, F, C.BEARD).box(1, H0 + 1, F, 1, H0 + 1, F, C.BEARD)
    .box(-4, H0, 0, -4, H0 + 2, F, C.BEARD).box(3, H0, 0, 3, H0 + 2, F, C.BEARD)
    .box(-2, H0 - 2, F, 1, H0 - 1, F + 1, C.BEARD).box(-2, H0, F + 1, 1, H0, F + 1, C.BEARD_L).box(-2, H0 + 1, F + 1, -2, H0 + 1, F + 1, C.BEARD_L).box(1, H0 + 1, F + 1, 1, H0 + 1, F + 1, C.BEARD_L);
  fuseStill(v);
  fuse(v, 'hips', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR');
  return v;
}

// ================================================================== 卢昭（世家孤女）
// 二十岁，肤若凝脂的鹅蛋脸，乌黑长发梳成堕马髻、斜插素银步摇；外披墨黑带兜帽的夜行鹤氅，内露绯红织金交领曲裾深衣；袖中半露象牙柄
// 金错短匕，手里摊开一卷竹简舆图；右眼角下一颗暗红泪痣，颈间一道淡淡的勒痕。
function buildLuzhao(): V {
  const v = newChar();
  const C = { SKIN: 0xf0d4bc, SKIN_D: 0xc8a890, SCAR: 0xe4aea4, ROBE: 0x922a34, ROBE_D: 0x6a1c26, GOLD: 0xc89a48, CLOAK: 0x1e1c24, CLOAK_L: 0x34303e, CLOAK_D: 0x121016,
    HAIR: 0x16141a, HAIR_L: 0x2a2630, SILVER: 0xd8dce6, SILVER_D: 0x9aa0ac, PEARL: 0xf4f0e8, MOLE: 0x7a2026, LIP: 0xa8343a, EYE: 0x16100e,
    BAMBOO: 0xbca878, BAMBOO_D: 0x9a8a60, CORD: 0x5a3a26, IVORY: 0xece2c8, SHOE: 0x2a1a1e };
  const A = slimBody(v, { skin: C.SKIN, boots: C.SHOE, torso: C.ROBE, chest: C.ROBE, belt: null, sleeve: C.CLOAK, fore_: C.CLOAK, hands: C.SKIN, head: C.SKIN,
    robe: { c: C.ROBE, flare: 2, trim: C.ROBE, hem: C.ROBE_D }, ...MALE, torsoH: 5 });
  const H0 = A.headY0, T0 = A.torsoY0, T1 = A.torsoY1, F = A.faceZ;
  // the robe: a gold-edged crossed collar, the 曲裾's wrap as a gold band round the hips, a gold line over the dark hem
  collar(v, A, C.GOLD, C.GOLD);
  v.paint(c => (c.y === T0 ? C.ROBE_D : null), 'spine');
  v.paint(c => (c.y === A.hipY - 2 ? C.GOLD : c.y === A.hipY - 3 ? C.ROBE_D : c.y === 2 ? C.GOLD : null), 'hips');
  // the cloak: black sleeves (crimson cuffs of the robe showing), the front edges open down the sides of the chest, side panels to the
  // floor, the hood bunched behind the neck, and the long back on two joints
  for (const f of ['foreL', 'foreR']) v.paint(c => (c.y === A.handY + 2 ? C.ROBE : null), f);
  v.part('chest').box(-4, T0 + 2, -2, -4, T1, 1, C.CLOAK).box(3, T0 + 2, -2, 3, T1, 1, C.CLOAK).box(-4, T1, -2, 3, T1, -2, C.CLOAK);
  v.part('spine').box(-4, T0, -2, -4, T0 + 1, 1, C.CLOAK).box(3, T0, -2, 3, T0 + 1, 1, C.CLOAK);
  v.part('hips').box(-6, 1, -4, -5, A.hipY + 1, 1, C.CLOAK).box(4, 1, -4, 5, A.hipY + 1, 1, C.CLOAK).box(-6, 1, 1, -6, A.hipY + 1, 1, C.CLOAK_L).box(5, 1, 1, 5, A.hipY + 1, 1, C.CLOAK_L);
  v.part('chest').box(-3, T1 + 1, -4, 2, T1 + 2, -3, C.CLOAK_L).box(-3, T1 + 1, -4, 2, T1 + 1, -4, C.CLOAK);
  v.bone('clA1', 'chest', 0, T1, -3.5).bone('clA2', 'clA1', 0, 8, -4.5);
  v.part('clA1').box(-5, 8, -4, 4, T1, -3, C.CLOAK).box(-5, 8, -4, -5, T1, -3, C.CLOAK_L).box(4, 8, -4, 4, T1, -3, C.CLOAK_L);
  v.part('clA2').box(-5, 1, -5, 4, 7, -4, C.CLOAK).box(-5, 1, -5, 4, 1, -4, C.CLOAK_D);
  // the ivory-and-gold dagger hilt peeping from the left cuff
  v.part('foreL').set(4, A.handY + 2, 1, C.IVORY).set(4, A.handY + 3, 1, C.GOLD);
  // head: black hair at the top, back and sides; the 堕马髻 slipping low at the back to her left; the silver hairpin with two drops
  v.paint(c => (c.y >= H0 + 5 || (c.z <= -2 && c.y >= H0 + 1) || ((c.x === -3 || c.x === 2) && c.y >= H0 + 2 && c.z < F) ? C.HAIR : null), 'head');
  v.part('head').box(-1, H0 + 6, -3, 0, H0 + 6, 2, C.HAIR_L)
    .box(0, H0 + 1, -6, 3, H0 + 4, -3, C.HAIR).box(0, H0 + 4, -6, 3, H0 + 4, -3, C.HAIR_L)
    .box(3, H0 + 4, -5, 5, H0 + 4, -5, C.SILVER).set(5, H0 + 3, -5, C.SILVER_D).set(5, H0 + 2, -5, C.PEARL).set(4, H0 + 3, -5, C.SILVER_D);
  face(v, A, { eyeR: C.EYE, nose: C.SKIN_D, mouth: C.LIP, skin: C.SKIN, flat: true });
  v.part('head').set(-2, H0 + 2, F, C.MOLE);
  v.part('neck').box(-1, T1 + 2, 0, 0, T1 + 2, 0, C.SCAR);
  // the bamboo map, unrolled flat in both hands at the waist: slats along z (two tones), two binding cords across, a roll at each end
  const sy = A.handY + 3, s0 = 2, s1 = 7;
  v.part('chest');
  for (let x = -6; x <= 5; x++) v.box(x, sy, s0, x, sy, s1, ((x + 6) >> 1) & 1 ? C.BAMBOO_D : C.BAMBOO);
  v.box(-6, sy, s0 + 1, 5, sy, s0 + 1, C.CORD).box(-6, sy, s1 - 1, 5, sy, s1 - 1, C.CORD)
    .box(-8, sy, s0, -7, sy + 1, s1, C.BAMBOO_D).box(6, sy, s0, 7, sy + 1, s1, C.BAMBOO_D);
  fuseStill(v);
  fuse(v, 'hips', 'footL', 'footR');
  return v;
}

// ================================================================== 桓越（血衣剑客）
// 二十四岁，剑眉星目的窄长脸，原本高束的黑发被削断一截、披散凌乱，额绑暗红抹额；染着陈旧暗红血斑的月白窄袖劲装，左肩半边亮银轻骑
// 肩甲；四尺青铜夹钢汉剑，剑柄垂黑穗；左颊浅疤。坐在石阶上：剑插在脚前地上、右手拄着剑柄，左手一只酒葫芦。
function buildHuanyue(): V {
  const v = newChar();
  const C = { SKIN: 0xe0b896, SKIN_D: 0xae8668, SCAR: 0xf2ccb4, WHITE: 0xd4d8e0, WHITE_D: 0xa4aab8, WHITE_L: 0xeceef4, BLOOD: 0x7e2a2a, BLOOD_D: 0x5c1e20,
    BELT: 0x2a2830, BUCKLE: 0xb08a3a, BOOT: 0x1e1e24, BRACER: 0x3a3036, SILVER: 0xc8d0dc, SILVER_D: 0x8a92a0, SILVER_L: 0xeaf0f6,
    HAIR: 0x141218, HAIR_L: 0x2a2630, BAND: 0x8a1e24, BAND_D: 0x5e1418, EYE: 0x140e0c, MOUTH: 0x6a3a30,
    BRONZE: 0xb08e52, EDGE: 0xe0e4ea, GUARD: 0x8a6a30, GRIP: 0x241c1a, TASSEL: 0x18181c, GOURD: 0xc8963e, GOURD_D: 0x946426, CORD: 0x8a2a20, PLUG: 0x6a4a2a };
  const A = slimBody(v, { skin: C.SKIN, legs: C.WHITE, boots: C.BOOT, hips: C.WHITE, torso: C.WHITE, chest: C.WHITE, belt: null, sleeve: C.WHITE, fore_: C.WHITE, hands: C.SKIN, head: C.SKIN, ...MALE });
  const H0 = A.headY0, T0 = A.torsoY0, T1 = A.torsoY1, F = A.faceZ;
  collar(v, A, C.WHITE_L, C.WHITE_D);
  v.paint(c => (c.y <= T0 + 1 ? C.BELT : null), 'spine'); v.part('spine').box(-1, T0, 2, 0, T0 + 1, 2, C.BUCKLE);
  flaps(v, A, 7, C.WHITE, C.WHITE_D);
  for (const f of ['foreL', 'foreR']) v.paint(c => (c.y <= A.handY + 4 ? C.BRACER : null), f);
  for (const s of ['shinL', 'shinR']) v.paint(c => (c.y <= 4 ? C.BOOT : null), s);
  // old blood: the right sleeve, the chest's lower left, the left flap
  v.part('armR').box(-6, A.shoulderY - 3, -1, -6, A.shoulderY - 2, 0, C.BLOOD).set(-6, A.shoulderY - 3, 0, C.BLOOD_D);
  v.part('chest').box(1, T1 - 2, 2, 2, T1 - 2, 2, C.BLOOD);
  v.part('legL').box(2, 8, 2, 3, 9, 2, C.BLOOD).set(3, 8, 2, C.BLOOD_D);
  // the bright silver half shoulder guard on the left: a cap over the shoulder and three overlapping plates down the outside
  v.part('armL').box(2, A.shoulderY - 1, -2, 5, A.shoulderY - 1, 1, C.SILVER).box(5, A.shoulderY - 4, -2, 5, A.shoulderY - 2, 1, C.SILVER)
    .box(5, A.shoulderY - 3, -2, 5, A.shoulderY - 3, 1, C.SILVER_D).box(5, A.shoulderY - 4, -2, 5, A.shoulderY - 4, 1, C.SILVER_L).box(2, A.shoulderY - 1, -2, 2, A.shoulderY - 1, 1, C.SILVER_D);
  // the hair: black, cut off short and loose — down to the cheek at the sides, the back hacked straight in uneven blocks, two tufts
  // standing up, a lock across the brow; the dark red headband round the brow (one cell proud) with two tails at the back
  v.paint(c => (c.y >= H0 + 5 || ((c.x === -3 || c.x === 2) && c.y >= H0 + 2 && c.z < F) ? C.HAIR : c.z <= -2 && c.y >= H0 + ((c.x + 4) >> 1 & 1 ? 1 : 2) ? C.HAIR : null), 'head');
  v.part('head').box(-2, H0 + 7, -1, -1, H0 + 7, 0, C.HAIR).box(1, H0 + 7, -2, 1, H0 + 8, -2, C.HAIR)
    .box(-4, H0 + 1, -2, -4, H0 + 3, 0, C.HAIR).box(3, H0 + 2, -2, 3, H0 + 3, 0, C.HAIR);
  v.paint(c => (c.y === H0 + 4 ? C.BAND : null), 'head');
  v.part('head').box(-4, H0 + 4, -2, -4, H0 + 4, 0, C.BAND).box(3, H0 + 4, -2, 3, H0 + 4, 0, C.BAND).box(-1, H0 + 3, -4, 0, H0 + 4, -4, C.BAND_D);
  v.bone('tlA1', 'head', 0, H0 + 3, -4.5);
  v.part('tlA1').box(-1, H0 - 1, -5, -1, H0 + 2, -5, C.BAND).box(0, H0 - 2, -5, 0, H0 + 2, -5, C.BAND).set(0, H0 - 2, -5, C.BAND_D).set(-1, H0 - 1, -5, C.BAND_D);
  face(v, A, { eyeR: C.EYE, nose: C.SKIN_D, mouth: C.MOUTH, skin: C.SKIN });
  v.part('head').set(1, H0, F, C.SKIN_D).box(1, H0 + 1, F, 1, H0 + 2, F, C.SCAR).box(-3, H0 + 5, F, -2, H0 + 5, F, C.HAIR_L);
  // the sword along the fist's forward axis: the pommel and black tassel behind, the cord grip through the fist, a small bronze guard,
  // the bronze blade with its steel edge row (the point one row)
  const [x, y, z] = A.wR;
  v.part('weapon').set(x, y, z - 2, C.BUCKLE).box(x, y, z - 1, x, y, z + 1, C.GRIP).box(x - 1, y - 1, z + 2, x + 1, y + 1, z + 2, C.GUARD)
    .box(x, y, z + 3, x, y, z + 14, C.BRONZE).box(x, y + 1, z + 3, x, y + 1, z + 13, C.EDGE).set(x, y, z + 14, C.EDGE)
    .box(x + 1, y, z - 2, x + 1, y, z + 1, C.TASSEL).set(x + 1, y - 1, z + 1, C.TASSEL);
  // the gourd hanging from the left fist by its neck: a plug on top, a red cord, a bulb below
  const [gx, gy, gz] = A.wL;
  v.part('offhand').set(gx, gy + 1, gz, C.PLUG).set(gx, gy - 1, gz, C.GOURD_D).set(gx, gy - 1, gz + 1, C.CORD)
    .box(gx - 1, gy - 4, gz - 1, gx + 1, gy - 2, gz + 1, C.GOURD).box(gx - 1, gy - 4, gz - 1, gx + 1, gy - 4, gz + 1, C.GOURD_D);
  fuseStill(v); fuse(v, 'foreL', 'offhand'); fuse(v, 'shinL', 'footL'); fuse(v, 'shinR', 'footR');
  return v;
}

// ================================================================== poses
type B = Record<string, Bone>;
/** 杜五: never still — rubs his hands, scratches under the head cloth, looks this way and that, shifts from foot to foot, taps a toe */
POSE_HOOKS.npc_duwu = (b: B, t: number) => {
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
};
/** 孙媪: still — a slight sway and the breath, a stoop; now and then the needles come up close to the good eye */
POSE_HOOKS.npc_sunao = (b: B, t: number) => {
  const c = t % 10, br = Math.sin(t * 1.6), look = win(c, 6.0, 8.6, 0.6);
  rot(b.hips, 0, 0, Math.sin(t * 0.7) * 0.02);
  rot(b.spine, 0.22 + br * 0.012, Math.sin(t * 0.45) * 0.05, Math.sin(t * 0.7) * -0.015); rot(b.chest, 0.06, 0, 0);
  rot(b.neck, -0.18, 0, 0); rot(b.head, -0.06 + 0.22 * look, Math.sin(t * 0.3) * 0.15 * (1 - look) + 0.15 * look, 0.05 * look);
  rot(b.armR, -0.3 - 0.35 * look, 0, -0.08); rot(b.foreR, -1.25 - 0.55 * look, 0.2, 0); rot(b.weapon, 0.2 - 0.6 * look, 0, 0);
  rot(b.armL, -0.08, 0, 0.1); rot(b.foreL, -0.75, -0.2, 0); rot(b.offhand, 0.4, 0, 0);
};
/** 冯铁臂: one slow blow every 2.4 s — lift high, a beat at the top, down hard on the blank (sparks), rest on it; the tongs steady */
const FENG_LAST = new WeakMap<object, number>();
POSE_HOOKS.npc_fengtiebi = (b: B, t: number, _a, _off, self) => {
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
POSE_HOOKS.npc_luzhao = (b: B, t: number) => {
  const c = t % 11, br = Math.sin(t * 1.4), up = win(c, 6.5, 9.5, 0.8);
  rot(b.spine, 0.03 + br * 0.008, 0, 0); rot(b.chest, br * 0.01, 0, 0);
  rot(b.neck, 0.12 * (1 - up), 0, 0); rot(b.head, 0.22 * (1 - up) - 0.04 * up, 0.38 * up * (Math.sin(t * 0.21) > 0 ? 1 : -1), 0.03 * up);
  rot(b.armL, -0.22, 0, 0.16); rot(b.foreL, -1.18, 0, 0); rot(b.armR, -0.22, 0, -0.16); rot(b.foreR, -1.18, 0, 0);
  rot(b.clA1, 0.06 + Math.sin(t * 1.1) * 0.03, 0, Math.sin(t * 0.8) * 0.02); rot(b.clA2, 0.03 + Math.sin(t * 1.1 - 0.7) * 0.03, 0, 0);
};
/** 桓越: sits on the bottom step (hips 0.35 m down, thighs out, shins down), the sword stuck in the ground before his right foot and
 *  his right hand on its hilt; the gourd on his left knee, up to his mouth every few seconds; the headband tails stir */
POSE_HOOKS.npc_huanyue = (b: B, t: number) => {
  const c = t % 8, br = Math.sin(t * 1.5), drink = win(c, 5.0, 7.0, 0.45);
  mov(b.hips, 0, -5 * CELL, 0);
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
// a grey donkey, pale belly and muzzle, a dark stripe along the back and a dark mane, long ears with dark tips, dark hooves, a tufted
// tail. The legs are part of the body (it stands); the neck, head and tail move: it dips to the hay now and then, flicks its tail.
function buildDonkey(): V {
  const v = newChar(), G = 0x6e6a66, GL = 0xb4b0a8, GD = 0x4a4744, M_ = 0x34302e, HOOF = 0x2a2624, EYE = 0x161210;
  v.bone('hips', 'root', 0, 10, -2).bone('chest', 'hips', 0, 10, 2).bone('neck', 'chest', 0, 13, 6).bone('head', 'neck', 0, 17, 9).bone('tail', 'hips', 0, 13, -10);
  v.part('hips').box(-3, 8, -10, 2, 13, -1, G).box(-3, 8, -10, 2, 8, -1, GL).box(-1, 14, -9, 0, 14, -1, M_);
  for (const [x, z] of [[1, -9], [-3, -9]]) v.box(x, 1, z, x + 1, 7, z + 1, G).box(x, 0, z, x + 1, 0, z + 1, HOOF).box(x, 1, z, x + 1, 1, z + 1, GL);
  v.part('chest').box(-3, 8, 0, 2, 13, 6, G).box(-3, 8, 0, 2, 8, 6, GL).box(-1, 14, 0, 0, 14, 5, M_);
  for (const [x, z] of [[1, 3], [-3, 3]]) v.box(x, 1, z, x + 1, 7, z + 1, G).box(x, 0, z, x + 1, 0, z + 1, HOOF).box(x, 1, z, x + 1, 1, z + 1, GL);
  v.part('neck').box(-2, 12, 5, 1, 17, 9, G).box(-1, 15, 5, 0, 18, 7, M_).box(-2, 12, 9, 1, 13, 9, GL);
  v.part('head').box(-2, 15, 8, 1, 19, 12, G).box(-2, 15, 13, 1, 17, 15, GL).box(-2, 15, 15, 1, 15, 15, GD).box(-1, 17, 15, 0, 17, 15, GD)
    .set(-2, 18, 11, EYE).set(1, 18, 11, EYE).box(-2, 20, 9, -2, 23, 9, G).box(1, 20, 9, 1, 23, 9, G).set(-2, 23, 9, M_).set(1, 23, 9, M_).box(-1, 20, 8, 0, 20, 9, M_);
  v.part('tail').box(-1, 8, -11, 0, 13, -11, G).box(-1, 5, -11, 0, 7, -11, M_);
  return v;
}
POSE_HOOKS.npc_donkey = (b: B, t: number) => {
  const c = t % 13, graze = win(c, 7, 11, 0.9), br = Math.sin(t * 1.3);
  rot(b.chest, br * 0.01, 0, 0); rot(b.neck, 0.08 + 0.75 * graze + Math.sin(t * 0.9) * 0.04 * (1 - graze), 0.1 * Math.sin(t * 0.4), 0);
  rot(b.head, 0.1 + 0.35 * graze + Math.max(0, Math.sin(t * 6)) * 0.08 * graze, 0, 0);
  rot(b.tail, 0.15, Math.sin(t * 2.2) * 0.25 + Math.max(0, Math.sin(t * 0.7) - 0.85) * 3 * Math.sin(t * 14), 0);
};
export const HIDEOUT_DONKEY: ModelDef = { id: 'npc_donkey', name: '灰驴', group: '普通', role: '', line: '', kind: 'quad', attack: 'bite', build: buildDonkey };
if (!ROSTER.some(r => r.id === HIDEOUT_DONKEY.id)) ROSTER.push(HIDEOUT_DONKEY);

// ================================================================== registry
const def = (id: string, name: string, role: string, build: () => V): ModelDef => ({ id, name, group: '普通', role, line: '', kind: 'biped', attack: 'swing', build });
/** the five, keyed like HIDEOUT.people (hideout.ts) */
export const HIDEOUT_PEOPLE: Record<'duwu' | 'sunao' | 'fengtiebi' | 'luzhao' | 'huanyue', ModelDef> = {
  duwu: def('npc_duwu', '杜五', '帮手', buildDuwu),
  sunao: def('npc_sunao', '鬼针孙媪', '医者', buildSunao),
  fengtiebi: def('npc_fengtiebi', '冯铁臂', '铁匠', buildFeng),
  luzhao: def('npc_luzhao', '卢昭', '情报', buildLuzhao),
  huanyue: def('npc_huanyue', '桓越', '宿敌', buildHuanyue),
};
for (const d of Object.values(HIDEOUT_PEOPLE)) if (!ROSTER.some(r => r.id === d.id)) ROSTER.push(d);
