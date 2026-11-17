// 寒山坞开场（熹平六年腊月的雪夜）的人和车：十一岁的文皎（child_wenjiao）、两种举火把的凶徒（killer_cloak 斗篷甲士、killer_big
// 高一头宽一圈、背铜环杖的——七年前的褚雷，还没裹黄巾）、杜五的驴板车（cart）。
// 人都是 3.5 厘米细格子（VoxChar(CELL / 2)，照 heroineFine.ts）；文皎的骨骼名字和父子关系和细白发女一样（hips…head、shL/armL/foreL/
// handL、legL/shinL/footL、weapon/offhand、hrA*、bfA*/bfB*、blade、cape、jaw、hat），比例是孩子的：约 0.75 的身高、头大、手脚短。
// 女孩平脸不出鼻子（用户规矩）；不蒙眼、不带刀。车是道具，7 厘米场景格（VoxChar(CELL)），两个轮子各是一根骨头，走多远转多少。
// 美术铁律：横平竖直的大块，2～3 档颜色，不撒随机点，不走斜线台阶（轮子是两块矩形叠成的八角，只在角上切一步）。
// 动作（POSE_HOOKS，各管各的）：
//   文皎：站（呼吸、看一看）/ 走 / 蹲缩（抱膝、头埋下、发抖）/ 探头 / 被拖（右手腕被人往上往前拽、身子往后坠）——childPose(a) 设目标值，自己缓过去；
//   凶徒：站 / 走（killerPose(a).walk = 每秒米数，步子和走速对上）/ 回头看 / 低头看 / 右手往前下伸——左手的火把一直竖直举着，火苗跳；
//   车：轮子按走过的路转。
// 火把的光不在模型里：torchTip(a) 给火苗的世界坐标，torchLight(a) 挂一盏跟着火苗跳的暖光（演出自己管开关）。
// 调试 / 截图：__dh.hsCast({ ids, at, gap, yaw, pose, light })，__dh.hsTris()。
import * as THREE from 'three';
import { CELL, rbox } from '../bestiary/kit';
import { ROSTER, type ModelDef } from '../bestiary/models';
import { POSE_HOOKS, type PoseFn } from '../bestiary/poseHooks';
import { rot, mov, type Bone } from '../actors/rig';
import { VoxChar, type Col } from '../look/voxkit';
import { BattleActor } from '../bestiary/battle';
import { V3, scene, onUpdate } from '../engine/world';
import { dh } from '../../debug/dh';

type V = VoxChar;
type Bones = Record<string, Bone>;
const fine = () => new VoxChar(CELL / 2);
const B = (v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null, g = 0) => v.part(part).box(x0, y0, z0, x1, y1, z1, c, g);
/** a box with its four vertical edges cut one cell (and its top ring when top): a softer mass */
const R = (v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, top = false) => { v.part(part); rbox(v, x0, y0, z0, x1, y1, z1, c, 1, top); };
/** a box on the left limb (part + 'L') and its mirror (cell x ↔ −1 − x) on the right (part + 'R') */
const LR = (v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null, g = 0) => {
  B(v, part + 'L', x0, y0, z0, x1, y1, z1, c, g); B(v, part + 'R', -1 - x1, y0, z0, -1 - x0, y1, z1, c, g);
};
/** a box and its mirror, both in one part */
const S = (v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null) => { B(v, part, x0, y0, z0, x1, y1, z1, c); B(v, part, -1 - x1, y0, z0, -1 - x0, y1, z1, c); };
/** move every cell of the parts `from` into part `into` */
function fuse(v: V, into: string, ...from: string[]) { for (const c of v.cells.values()) if (from.includes(c.part)) c.part = into; }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (cur: number, tgt: number, k: number) => cur + (tgt - cur) * Math.min(1, k);

// ================================================================== 文皎（十一岁）
// 黑发两个小丫髻（暗红头绳，绳尾两小截垂在耳后）、齐刘海；本色粗布交领短褐到大腿、本色布裤、腰里一根布带；黑布鞋白千层底。
// 脸是平的（不出鼻子），眼睛两格高，小嘴一格淡色。
const CH = {
  SKIN: 0xe6bea0, SKIN_D: 0xc89c7e, HAIR: 0x1c1a20, HAIR_D: 0x2c2a32, EYE: 0x1a1216, MOUTH: 0xb06e60,
  JK: 0xc6b694, JK_D: 0xa69676, JK_L: 0xd8cbac, TROU: 0x988a70, TROU_D: 0x7e725c, SASH: 0x8a7e66, SASH_D: 0x6c6250,
  SHOE: 0x2c2828, SOLE: 0xd8d0c0, CORD: 0x9a3a30, CORD_D: 0x76281f,
};
function buildChild(): V {
  const v = fine(), C = CH;
  // ---- the joints: the fine heroine's names and parents, a child's spacing
  v.bone('hips', 'root', 0, 16, 0).bone('spine', 'hips', 0, 19, 0).bone('chest', 'spine', 0, 23, 0)
    .bone('neck', 'chest', 0, 28, 0).bone('head', 'neck', 0, 30, 0).bone('jaw', 'head', 0, 33, 2).bone('hat', 'head', 0, 42, 0)
    .bone('cape', 'chest', 0, 27, -3);
  for (const [s, L] of [[1, 'L'], [-1, 'R']] as const) {
    v.bone('sh' + L, 'chest', s * 7, 28, 0).bone('arm' + L, 'sh' + L, s * 7, 28, 0).bone('fore' + L, 'arm' + L, s * 7, 22, 0).bone('hand' + L, 'fore' + L, s * 7, 17, 0);
    v.bone('leg' + L, 'hips', s * 2.5, 16, 0).bone('shin' + L, 'leg' + L, s * 2.5, 9, 0).bone('foot' + L, 'shin' + L, s * 2.5, 3, 0);
  }
  v.bone('weapon', 'handR', -7, 15, 1).bone('offhand', 'handL', 7, 15, 0).bone('blade', 'weapon', -7, 15, 5);
  v.bone('hrA1', 'head', 0, 40, -7).bone('hrA2', 'hrA1', 0, 34, -7).bone('hrA3', 'hrA2', 0, 28, -7);
  v.bone('bfA1', 'head', 7.5, 43, -1.5).bone('bfA2', 'bfA1', 7.5, 38, -1.5).bone('bfA3', 'bfA2', 7.5, 35, -1.5)
    .bone('bfB1', 'head', -7.5, 43, -1.5).bone('bfB2', 'bfB1', -7.5, 38, -1.5);
  // ---- cloth shoes (black uppers on a white layered sole, the toe a row lower), the trouser leg over the ankle, loose trousers
  LR(v, 'foot', 1, 0, -2, 3, 0, 3, C.SOLE); LR(v, 'foot', 1, 1, -2, 3, 1, 3, C.SHOE); LR(v, 'foot', 1, 2, -2, 3, 2, 1, C.SHOE);
  LR(v, 'shin', 1, 3, -2, 3, 8, 1, C.TROU); LR(v, 'shin', 1, 3, -2, 3, 3, 1, C.TROU_D);
  LR(v, 'leg', 0, 9, -3, 4, 15, 2, C.TROU);
  // the jacket's skirt over each thigh to mid-thigh (each thigh carries its half, so a stride opens it), its hem a shade darker
  LR(v, 'leg', 0, 12, -4, 4, 15, 3, C.JK); LR(v, 'leg', 0, 12, -4, 4, 12, 3, C.JK_D);
  // ---- hips, waist with the cloth sash (one cell proud) and its knot at the front, the chest with a soft shoulder line
  R(v, 'hips', -5, 16, -4, 4, 18, 3, C.JK);
  R(v, 'spine', -5, 19, -3, 4, 22, 2, C.JK); B(v, 'spine', -6, 19, -4, 5, 20, 3, C.SASH);
  for (const [x, z] of [[-6, -4], [5, -4], [-6, 3], [5, 3]]) B(v, 'spine', x, 19, z, x, 20, z, null);
  B(v, 'spine', 1, 18, 4, 2, 21, 4, C.SASH_D); B(v, 'hips', 1, 16, 4, 1, 17, 4, C.SASH_D);
  R(v, 'chest', -5, 23, -3, 4, 27, 2, C.JK); B(v, 'chest', -4, 28, -2, 3, 28, 1, C.JK);
  // 交领: the light inner collar at the throat, the outer edge straight down the front to the sash
  B(v, 'chest', -2, 26, 3, 1, 27, 3, C.JK_L); B(v, 'chest', 2, 23, 3, 2, 27, 3, C.JK_D); B(v, 'spine', 2, 21, 3, 2, 22, 3, C.JK_D);
  B(v, 'neck', -2, 28, -2, 1, 29, 1, C.SKIN);
  // ---- arms: the sleeve on the upper arm, the narrower forearm sleeve (a cell clear of the upper arm both sides: the elbow turns about
  // x and coplanar faces would flicker) with a darker cuff, small hands
  LR(v, 'arm', 5, 22, -2, 8, 27, 1, C.JK); LR(v, 'arm', 5, 22, -2, 8, 22, 1, C.JK_D);
  LR(v, 'fore', 6, 17, -1, 7, 21, 0, C.JK); LR(v, 'fore', 6, 17, -1, 7, 17, 0, C.JK_D);
  LR(v, 'hand', 6, 13, -1, 7, 16, 0, C.SKIN); LR(v, 'hand', 6, 13, -1, 7, 13, 0, C.SKIN_D);
  // ---- the head: 12 × 12 × 12, corner columns cut, the chin a step narrower; flat face; black hair with a straight fringe
  R(v, 'head', -6, 30, -6, 5, 41, 5, C.SKIN);
  B(v, 'head', -6, 30, -6, 5, 30, 5, null); B(v, 'head', -5, 30, -5, 4, 30, 4, C.SKIN);
  v.paint(q => (q.part === 'head' && q.c === C.SKIN && (q.y >= 38 || q.z <= -3 || ((q.x <= -6 || q.x >= 5) && q.y >= 33)) ? C.HAIR : null));
  B(v, 'head', -4, 34, 5, -3, 35, 5, C.EYE); B(v, 'head', 2, 34, 5, 3, 35, 5, C.EYE);
  B(v, 'head', -1, 32, 5, 0, 32, 5, C.MOUTH);
  // the hair shell: crown, back (two darker parting lines), sides over the ears down to the jaw, the fringe one cell proud over the brow
  B(v, 'head', -5, 42, -5, 4, 42, 4, C.HAIR);
  B(v, 'head', -5, 32, -7, 4, 41, -7, C.HAIR); B(v, 'head', -2, 32, -7, -2, 41, -7, C.HAIR_D); B(v, 'head', 1, 32, -7, 1, 41, -7, C.HAIR_D);
  B(v, 'head', -7, 33, -5, -7, 41, 3, C.HAIR); B(v, 'head', 6, 33, -5, 6, 41, 3, C.HAIR);
  B(v, 'head', -5, 38, 6, 4, 41, 6, C.HAIR);
  // two small buns high on either side of the crown, a dark red cord round each foot, the cords' ends hanging behind the ears
  for (const [x0, x1] of [[2, 6], [-7, -3]] as const) {
    R(v, 'head', x0, 43, -3, x1, 47, 1, C.HAIR, true); B(v, 'head', x0, 46, -1, x1, 46, -1, C.HAIR_D);
    B(v, 'head', x0, 42, -3, x1, 42, 1, C.HAIR); B(v, 'head', x0, 43, -3, x1, 43, 1, C.CORD);
  }
  B(v, 'bfA1', 7, 39, -2, 7, 42, -2, C.CORD); B(v, 'bfA1', 7, 39, -2, 7, 39, -2, C.CORD_D);
  B(v, 'bfB1', -8, 39, -2, -8, 42, -2, C.CORD); B(v, 'bfB1', -8, 39, -2, -8, 39, -2, C.CORD_D);
  fuse(v, 'chest', 'neck'); fuse(v, 'foreL', 'handL'); fuse(v, 'foreR', 'handR');
  return v;
}

/** 文皎's pose targets (0..1 each; walk is m/s): the hook eases to them, so a cutscene can just set them */
export interface ChildPose { walk: number; crouch: number; peek: number; tremble: number; dragged: number; look: number; kneel: number; sob: number; bow: number }
const CHILD = new WeakMap<object, { tgt: ChildPose; cur: ChildPose; ph: number; t: number }>();
const childState = (a: object) => { let s = CHILD.get(a); if (!s) { const z = { walk: 0, crouch: 0, peek: 0, tremble: 0, dragged: 0, look: 0, kneel: 0, sob: 0, bow: 0 }; s = { tgt: { ...z }, cur: { ...z }, ph: 0, t: -1 }; CHILD.set(a, s); } return s; };
/** set any of 文皎's pose targets on her actor: childPose(a).crouch = 1 (huddled under the bellows), .peek = 1 (head up, looking out), … */
export const childPose = (a: object): ChildPose => childState(a).tgt;
/** snap her straight to the targets (no easing: a cut) */
export const childSnap = (a: object) => { const s = childState(a); Object.assign(s.cur, s.tgt); };

POSE_HOOKS.child_wenjiao = (b: Bones, t: number, _a, _off, self) => {
  const st = childState(self as object), dt = st.t < 0 ? 0 : Math.max(0, Math.min(0.1, t - st.t)); st.t = t;
  const c = st.cur, g = st.tgt;
  for (const k of Object.keys(c) as Array<keyof ChildPose>) c[k] = ease(c[k], g[k], dt * (k === 'walk' ? 6 : 4));
  const w = clamp01(c.walk / 0.9), cr = c.crouch, pk = c.peek * cr, dr = c.dragged, tr = Math.max(c.tremble, cr * 0.6);
  st.ph += dt * Math.PI * c.walk / 0.42;
  const br = Math.sin(t * 2.6), s = Math.sin(st.ph), co = Math.cos(st.ph), up = 1 - Math.max(cr, dr);
  // ---- standing: the breath, a small look about, arms hanging easy with soft elbows
  mov(b.hips, 0, br * 0.004 * up - 0.012 * w * Math.abs(s), 0);
  rot(b.spine, (0.03 + br * 0.012) * up + 0.05 * w, Math.sin(t * 0.5) * 0.04 * up, 0);
  rot(b.head, Math.sin(t * 0.9) * 0.03 * up, (Math.sin(t * 0.33) * 0.18 * (1 - w) + c.look) * up, 0);
  rot(b.armL, 0.05 * up + 0.32 * s * w, 0, 0.1 * up); rot(b.foreL, -0.3 * up - 0.25 * w, 0, 0);
  rot(b.armR, 0.05 * up - 0.32 * s * w, 0, -0.1 * up); rot(b.foreR, -0.3 * up - 0.25 * w, 0, 0);
  // ---- walking: a short quick stride, the trailing knee lifting through the swing
  rot(b.legL, -0.5 * s * w, 0, 0); rot(b.shinL, (0.1 + 0.8 * Math.max(0, co)) * w, 0, 0); rot(b.footL, -0.2 * Math.max(0, co) * w, 0, 0);
  rot(b.legR, 0.5 * s * w, 0, 0); rot(b.shinR, (0.1 + 0.8 * Math.max(0, -co)) * w, 0, 0); rot(b.footR, -0.2 * Math.max(0, -co) * w, 0, 0);
  // ---- huddled (under the bellows): squatting on her heels, knees to the chest, arms round the shins, head down on the knees
  if (cr > 0.001) {
    mov(b.hips, 0, -0.385 * cr, -0.03 * cr);
    rot(b.legL, -2.0 * cr, 0, 0.1 * cr); rot(b.shinL, 2.6 * cr, 0, 0); rot(b.footL, -0.6 * cr, 0, 0);
    rot(b.legR, -2.0 * cr, 0, -0.1 * cr); rot(b.shinR, 2.6 * cr, 0, 0); rot(b.footR, -0.6 * cr, 0, 0);
    // (peeking only lifts the face: the back stays bent, so the head stays under the bellows)
    rot(b.spine, (0.55 - 0.08 * pk) * cr, 0, 0); rot(b.chest, 0.28 * cr, 0, 0);
    rot(b.neck, (0.25 - 0.3 * pk) * cr, 0, 0); rot(b.head, (0.3 - 0.85 * pk) * cr, 0.12 * Math.sin(t * 0.7) * pk, 0);
    rot(b.armL, -0.95 * cr, 0, -0.22 * cr); rot(b.foreL, -1.25 * cr, -0.5 * cr, 0);
    rot(b.armR, -0.95 * cr, 0, 0.22 * cr); rot(b.foreR, -1.25 * cr, 0.5 * cr, 0);
  }
  // ---- dragged by the right wrist (pulled up and forward): leaning back against it, heels digging, head down, the left hand
  // clawing at the hand that holds her
  if (dr > 0.001) {
    const j = Math.sin(t * 9) * 0.06 + Math.sin(t * 13.7) * 0.04;
    mov(b.hips, 0, -0.08 * dr, -0.05 * dr);
    rot(b.armR, -2.55 * dr, 0, 0.12 * dr); rot(b.foreR, -0.15 * dr, 0, 0);
    rot(b.armL, -2.1 * dr, 0, -0.35 * dr); rot(b.foreL, -0.9 * dr, 0, 0);
    rot(b.spine, -0.32 * dr, j * dr, 0.05 * dr); rot(b.chest, -0.08 * dr, 0, 0);
    rot(b.neck, 0.2 * dr, 0, 0); rot(b.head, 0.35 * dr, -0.3 * dr, 0);
    rot(b.legL, -0.75 * dr, 0, 0.06 * dr); rot(b.shinL, 0.55 * dr, 0, 0); rot(b.footL, 0.25 * dr, 0, 0);
    rot(b.legR, 0.35 * dr, 0, -0.06 * dr); rot(b.shinR, 0.85 * dr, 0, 0);
  }
  // ---- trembling (fear; on whenever she is huddled): small and fast, the shoulders and head
  if (tr > 0.001) { rot(b.chest, Math.sin(t * 31) * 0.014 * tr, 0, Math.sin(t * 27) * 0.012 * tr); rot(b.head, Math.sin(t * 23) * 0.01 * tr, 0, 0); }
  // ---- act-37 the cold open (用户的分镜：伏在爹的尸体前哭 → 正面掩面哭): kneeling in the snow (on both knees, thighs a little forward,
  // the shins back flat, sitting back toward the heels); bowed over him (the back bent, hands down on his chest); sobbing with both
  // hands over the face (elbows in front of the chest, the head down into the hands, the shoulders heaving)
  const kn = c.kneel, bw = c.bow, sb = c.sob, heave = (0.5 + 0.5 * Math.sin(t * 6.2)) * Math.max(bw, sb);
  if (kn > 0.001) {
    mov(b.hips, 0, -0.3 * kn, -0.05 * kn);
    rot(b.legL, -0.35 * kn, 0, 0.05 * kn); rot(b.shinL, 1.78 * kn, 0, 0); rot(b.footL, 1.6 * kn, 0, 0);
    rot(b.legR, -0.35 * kn, 0, -0.05 * kn); rot(b.shinR, 1.78 * kn, 0, 0); rot(b.footR, 1.6 * kn, 0, 0);
  }
  if (bw > 0.001) {
    rot(b.spine, (0.62 + 0.05 * heave) * bw, 0, 0); rot(b.chest, (0.22 - 0.06 * heave) * bw, 0, 0); rot(b.neck, 0.15 * bw, 0, 0); rot(b.head, 0.35 * bw, 0, 0);
    rot(b.armL, -0.95 * bw, 0, -0.12 * bw); rot(b.foreL, -0.35 * bw, 0, 0);
    rot(b.armR, -0.95 * bw, 0, 0.12 * bw); rot(b.foreR, -0.35 * bw, 0, 0);
  }
  if (sb > 0.001) {
    // (the upper arms raised forward and swung in toward the middle, the forearms up and a little forward: the palms over the eyes)
    rot(b.spine, (0.12 + 0.05 * heave) * sb + 0.62 * bw * (1 - sb), 0, 0); rot(b.chest, (0.04 - 0.05 * heave) * sb, Math.sin(t * 3.1) * 0.03 * sb, 0);
    rot(b.neck, 0.1 * sb, 0, 0); rot(b.head, (0.2 + 0.04 * Math.sin(t * 6.2)) * sb, 0, 0);
    rot(b.armL, -1.4 * sb, -0.72 * sb, 0); rot(b.foreL, -1.3 * sb, 0, 0);
    rot(b.armR, -1.4 * sb, 0.72 * sb, 0); rot(b.foreR, -1.3 * sb, 0, 0);
    mov(b.chest, 0, 0.008 * heave * sb, 0);
  }
  // the cord ends swing a little
  rot(b.bfA1, 0.06 + Math.sin(t * 1.9) * 0.08, 0, 0.05 + Math.sin(t * 1.3) * 0.05); rot(b.bfB1, 0.06 + Math.sin(t * 2.1 + 1) * 0.08, 0, -0.05 - Math.sin(t * 1.4) * 0.05);
};
export const CHILD_WENJIAO: ModelDef = { id: 'child_wenjiao', name: '文皎', group: '普通', role: '十一岁', line: '', kind: 'biped', attack: 'swing', tip: 8, build: buildChild };

// ================================================================== 凶徒（两种）
// 深色带兜帽的行路斗篷罩在札甲外：兜帽遮住大半张脸（帽檐下一道黑影，斗篷甲士还蒙着脸巾，只露一条眼缝；大个子露出一大把黑胡子），
// 斗篷是披肩 + 背后一幅长片到小腿（各有各的骨头：走起来往后飘），胸前敞开露出铁札甲、皮带、铜扣，下摆是深红褐的战袍片和高筒皮靴。
// 右手环首刀（刀尖朝前下），左手火把（缠油布的头，两层火苗是发光格，单独一根骨头好跳）。
// 大个子（七年前的褚雷）：高一头、宽一圈，腿上是札甲裙，背上竖一根铜环杖（杖头一个方环，两边各挂两只小铜环），胸前一道皮带。
const K = {
  CLOAK: 0x2a2624, CLOAK_D: 0x1c1a19, CLOAK_L: 0x3a3532, IRON: 0x42454e, IRON_L: 0x5e626c, IRON_D: 0x2c2e34,
  ROBE: 0x4a2622, ROBE_D: 0x341a17, TROU: 0x26262c, BOOT: 0x2a221e, BOOT_L: 0x3c322c, SOLE: 0x161212,
  GLOVE: 0x3a2c24, GLOVE_D: 0x2a2018, BELT: 0x3a2a20, BRONZE: 0xa8823c, BRONZE_L: 0xd8b060,
  SKIN: 0x9a6c4c, SKIN_D: 0x7a5238, SHADOW: 0x141012, MASK: 0x2e2a2c, BEARD: 0x261a14, EYE: 0x0e0a08,
  WOOD: 0x5a3c26, WOOD_D: 0x3e2818, PITCH: 0x2a2018, FLAME: 0xff7a28, FLAME_Y: 0xffc458,
  STEEL: 0x8a92a0, EDGE: 0xe0e4ea, RING: 0x6e6046, GRIP: 0x2a1e18,
};
interface KDims { foot: number; knee: number; hip: number; spine: number; chest: number; neck: number; head: number; cw: number; hw: number; lx: number; lw: number; ax: number; aw: number; elbow: number; wrist: number; hand0: number; d: number }
const KD_CLOAK: KDims = { foot: 4, knee: 12, hip: 22, spine: 26, chest: 32, neck: 40, head: 42, cw: 10, hw: 9, lx: 4, lw: 3, ax: 12.5, aw: 2, elbow: 32, wrist: 25, hand0: 21, d: 5 };
const KD_BIG: KDims = { foot: 5, knee: 14, hip: 26, spine: 30, chest: 38, neck: 48, head: 50, cw: 13, hw: 11, lx: 5.5, lw: 3.5, ax: 16, aw: 3, elbow: 38, wrist: 30, hand0: 25, d: 6 };
function buildKiller(big: boolean): V {
  const v = fine(), k = big ? KD_BIG : KD_CLOAK, C = K;
  // ---- the joints (the shared biped names), a flame joint at the torch's head
  v.bone('hips', 'root', 0, k.hip, 0).bone('spine', 'hips', 0, k.spine, 0).bone('chest', 'spine', 0, k.chest, 0)
    .bone('neck', 'chest', 0, k.neck, 0).bone('head', 'neck', 0, k.head, 0).bone('jaw', 'head', 0, k.head + 4, 4).bone('hat', 'head', 0, k.head + 14, 0)
    .bone('cape', 'chest', 0, k.neck - 1, -k.d - 1);
  for (const [s, L] of [[1, 'L'], [-1, 'R']] as const) {
    v.bone('sh' + L, 'chest', s * k.ax, k.neck, 0).bone('arm' + L, 'sh' + L, s * k.ax, k.neck, 0).bone('fore' + L, 'arm' + L, s * k.ax, k.elbow, 0).bone('hand' + L, 'fore' + L, s * k.ax, k.wrist, 0);
    v.bone('leg' + L, 'hips', s * k.lx, k.hip, 0).bone('shin' + L, 'leg' + L, s * k.lx, k.knee, 0).bone('foot' + L, 'shin' + L, s * k.lx, k.foot, 0);
  }
  const gy = k.hand0 + 1.5;   // the fists' grip line
  v.bone('weapon', 'handR', -k.ax, gy, 0).bone('offhand', 'handL', k.ax, gy, 0).bone('blade', 'weapon', -k.ax, gy, 5).bone('flame', 'offhand', k.ax, gy, 19);
  // the x range of a limb box on the left side, centred on the joint, w cells either side of it
  const LX = (c: number, w: number): [number, number] => [Math.round(c - w), Math.round(c + w) - 1];
  // ---- high boots (a dark sole, a lighter cuff under the knee), trousers, the war-robe's skirt over each thigh (iron tassets for the big one)
  { const [a, b] = LX(k.lx, k.lw + 0.5), [sa, sb] = LX(k.lx, k.lw - 0.5);
    LR(v, 'foot', a, 0, -3, b, 0, 5, C.SOLE); LR(v, 'foot', a, 1, -3, b, k.foot - 1, 4, C.BOOT); LR(v, 'foot', a, k.foot - 1, 3, b, k.foot - 1, 4, null);
    LR(v, 'shin', sa, k.foot, -2, sb, k.knee - 1, 2, C.BOOT); LR(v, 'shin', sa, k.knee - 2, -2, sb, k.knee - 1, 2, C.BOOT_L);
    LR(v, 'leg', a, k.knee, -3, b, k.hip - 1, 3, C.TROU);
    const [fa, fb] = LX(k.lx, k.lw + 1.5), top = k.hip - 1, low = k.knee + 1;
    LR(v, 'leg', fa, low, -4, fb, top, 4, C.CLOAK); LR(v, 'leg', fa, low, -4, fb, low + 1, 4, big ? C.IRON : C.ROBE);
    if (big) LR(v, 'leg', fa, low, -4, fb, low, 4, C.IRON_L); else LR(v, 'leg', fa, low, -4, fb, low, 4, C.ROBE_D);
    LR(v, 'leg', fa, low + 2, 4, fb, low + 2, 4, C.CLOAK_D);
  }
  // ---- hips (armour skirt top) with the belt one cell proud and its bronze buckle; the lamellar coat in rows on waist and chest
  const hw = k.hw, cw = k.cw, d = k.d;
  R(v, 'hips', -hw, k.hip, -d, hw - 1, k.spine - 1, d - 1, C.IRON);
  R(v, 'hips', -hw - 1, k.spine - 2, -d - 1, hw, k.spine - 1, d, C.BELT); B(v, 'hips', -2, k.spine - 3, d + 1, 1, k.spine, d + 1, C.BRONZE);
  R(v, 'spine', -hw, k.spine, -d, hw - 1, k.chest - 1, d - 1, C.IRON); R(v, 'chest', -cw, k.chest, -d, cw - 1, k.neck - 1, d - 1, C.IRON, true);
  for (const p of ['spine', 'chest']) v.paint(q => (q.part === p && q.c === C.IRON && (q.y - k.spine) % 3 === 2 ? C.IRON_L : null));
  // ---- the cloak: the mantle round the shoulders (one cell out, open down the middle of the front), the long back panel on the cape joint
  { const y0 = k.neck - 6;
    // the cloak's two front panels from the shoulders down to the belt (one cell proud), open down the middle over the armour; its
    // sides are the body's own outer columns, so nothing overlaps an arm (the arms' caps carry the cloak out over the shoulders)
    for (const [p, ya, yb] of [['chest', k.chest, k.neck - 1], ['spine', k.spine, k.chest - 1]] as const) {
      const wx = p === 'chest' ? cw : hw;
      B(v, p, -wx, ya, d, -3, yb, d, C.CLOAK); B(v, p, 2, ya, d, wx - 1, yb, d, C.CLOAK);
      B(v, p, -3, ya, d, -3, yb, d, C.CLOAK_L); B(v, p, 2, ya, d, 2, yb, d, C.CLOAK_L);
      B(v, p, -wx, ya, -d - 1, wx - 1, yb, -d - 1, C.CLOAK);
      v.paint(q => (q.part === p && (q.x === -wx || q.x === wx - 1) ? C.CLOAK : null));
    }
    B(v, 'chest', -cw, k.neck, -d - 1, cw - 1, k.neck, d, C.CLOAK);
    B(v, 'chest', -cw, y0, -d - 1, cw - 1, y0, -d - 1, C.CLOAK_D);
    const cz = -d - 2, bot = big ? 9 : 8;
    B(v, 'cape', -cw - 1, bot, cz, cw, y0 - 1, cz, C.CLOAK); B(v, 'cape', -cw - 1, bot, cz, cw, bot + 1, cz, C.CLOAK_D);
    for (const x of [-Math.round(cw * 0.45), Math.round(cw * 0.45) - 1]) B(v, 'cape', x, bot + 2, cz, x, y0 - 1, cz, C.CLOAK_D);
  }
  // ---- arms: the mantle's cap over each upper arm (one cell proud), the sleeve of the robe under it, leather bracers, gloved fists
  { const [a, b] = LX(k.ax, k.aw + 0.5), [fa, fb] = LX(k.ax, k.aw - 0.5), hand = k.wrist - k.hand0;
    LR(v, 'arm', a, k.elbow, -2, b, k.neck - 1, 2, C.ROBE); LR(v, 'arm', a, k.neck - 6, -3, b + 1, k.neck - 1, 3, C.CLOAK); LR(v, 'arm', a, k.neck - 6, -3, b + 1, k.neck - 6, 3, C.CLOAK_D);
    LR(v, 'fore', fa, k.wrist, -2, fb, k.elbow - 1, 1, C.GLOVE_D); LR(v, 'fore', fa, k.elbow - 2, -2, fb, k.elbow - 1, 1, C.ROBE);
    LR(v, 'hand', fa, k.hand0, -2, fb, k.hand0 + hand - 1, 1, C.GLOVE);
  }
  // ---- the head under the hood: a rounded hood block one cell bigger than the head all round, the face sunk into its opening, a peak
  // over the brow; in the opening a band of shadow under the peak, the eyes in a slit of skin, a dark cloth over the mouth (or the beard)
  { const h0 = k.head, F = 4;
    R(v, 'head', -7, h0 - 1, -7, 6, h0 + 13, 6, C.CLOAK, true);
    B(v, 'head', -4, h0, F + 1, 3, h0 + 10, 6, null);
    B(v, 'head', -4, h0 + 7, F, 3, h0 + 10, F, C.SHADOW);
    B(v, 'head', -4, h0, F, 3, h0 + 6, F, C.SKIN); B(v, 'head', -3, h0 + 5, F, -2, h0 + 5, F, C.EYE); B(v, 'head', 1, h0 + 5, F, 2, h0 + 5, F, C.EYE);
    if (!big) B(v, 'head', -4, h0, F + 1, 3, h0 + 4, F + 1, C.MASK);
    else {
      B(v, 'head', -3, h0 + 6, F, -2, h0 + 6, F, C.BEARD); B(v, 'head', 1, h0 + 6, F, 2, h0 + 6, F, C.BEARD);   // heavy brows
      B(v, 'head', -1, h0 + 3, F + 1, 0, h0 + 4, F + 1, C.SKIN_D);                                           // the nose, one cell proud
      B(v, 'head', -4, h0, F + 1, 3, h0 + 2, F + 1, C.BEARD); B(v, 'head', -3, h0 + 2, F + 1, 2, h0 + 2, F + 1, C.BEARD);
      B(v, 'jaw', -4, h0 - 4, F + 1, 3, h0 - 1, F + 2, C.BEARD); B(v, 'jaw', -2, h0 - 7, F + 1, 1, h0 - 5, F + 2, C.BEARD);
    }
    B(v, 'head', -5, h0 + 11, 7, 4, h0 + 11, 7, C.CLOAK_D); v.paint(q => (q.part === 'head' && q.y === h0 - 1 && q.c === C.CLOAK ? C.CLOAK_D : null));
    B(v, 'head', -1, h0 + 2, -8, 0, h0 + 11, -8, C.CLOAK_D);   // the hood's back seam
  }
  // ---- 環首刀 in the right fist along its forward axis: grip through the fist, the ring pommel behind, a guard, the blade one cell thick
  { const x0 = Math.round(-k.ax) - 1, x1 = x0 + 1, y = Math.round(gy) - 1;
    B(v, 'handR', x0, y, -2, x1, y + 1, 1, null);
    B(v, 'weapon', x0, y, -3, x1, y + 1, 3, C.GRIP);
    B(v, 'weapon', x0, y - 1, -8, x1, y + 2, -4, C.RING); B(v, 'weapon', x0, y, -7, x1, y + 1, -5, null);
    B(v, 'weapon', x0 - 1, y - 1, 4, x1 + 1, y + 2, 4, C.RING);
    const L = big ? 30 : 26;
    B(v, 'blade', x0, y - 1, 5, x0, y, 4 + L, C.EDGE); B(v, 'blade', x0, y + 1, 5, x0, y + 1, 2 + L, C.STEEL);
  }
  // ---- the torch in the left fist along its forward axis (the hook stands it up): the stick, the pitch-cloth head with a binding,
  // two tiers of flame (glowing cells) on their own joint
  { const x0 = Math.round(k.ax) - 1, x1 = x0 + 1, y = Math.round(gy) - 1;
    B(v, 'handL', x0, y, -2, x1, y + 1, 1, null);
    B(v, 'offhand', x0, y, -5, x1, y + 1, 14, C.WOOD); B(v, 'offhand', x0, y, -5, x1, y + 1, -5, C.WOOD_D);
    B(v, 'offhand', x0 - 1, y - 1, 15, x1 + 1, y + 2, 18, C.PITCH); B(v, 'offhand', x0 - 1, y - 1, 16, x1 + 1, y + 2, 16, C.WOOD_D);
    B(v, 'flame', x0 - 1, y - 1, 19, x1 + 1, y + 2, 21, C.FLAME, 1); B(v, 'flame', x0, y, 22, x1, y + 1, 25, C.FLAME_Y, 1); B(v, 'flame', x0, y, 26, x0, y, 26, C.FLAME_Y, 1);
  }
  // ---- 褚雷's ringed staff upright on his back (on the chest joint, behind the cloak's back panel), a strap across his chest
  if (big) {
    const z = -d - 4, top = 92, xs = 3;
    B(v, 'chest', xs, 18, z, xs + 1, top - 8, z, 0x3a2418); B(v, 'chest', xs, 18, z, xs + 1, 20, z, C.IRON_D);
    // the head: a square loop of bronze round the shaft's end, two small rings hanging on each side of it
    B(v, 'chest', xs - 3, top - 8, z, xs + 4, top, z, C.BRONZE); B(v, 'chest', xs - 2, top - 7, z, xs + 3, top - 1, z, null); B(v, 'chest', xs, top - 7, z, xs + 1, top - 3, z, C.BRONZE_L);
    for (const x of [xs - 6, xs + 5]) for (const y of [top - 9, top - 5]) { B(v, 'chest', x, y, z, x + 2, y + 2, z, C.BRONZE_L); B(v, 'chest', x + 1, y + 1, z, x + 1, y + 1, z, null); }
    B(v, 'chest', -cw, k.neck - 9, d, cw - 1, k.neck - 8, d, C.BELT); B(v, 'chest', -cw, k.neck - 9, -d - 1, cw - 1, k.neck - 8, -d - 1, C.BELT);
    B(v, 'chest', xs - 1, k.neck - 10, z + 1, xs + 2, k.neck - 7, -d - 2, C.BELT);
  }
  fuse(v, 'chest', 'neck'); fuse(v, 'foreL', 'handL'); fuse(v, 'foreR', 'handR');
  return v;
}

/** a torch-bearer's pose targets: walk = m/s (0 stands), look = head yaw (rad, + = his left), down = 0..1 looking at the floor,
 *  reach = 0..1 the right arm out forward and down (to take hold of something), torch = 1 held up (0 = lowered to the side) */
export interface KillerPose { walk: number; look: number; down: number; reach: number; torch: number; swing: number; laugh: number; kick: number }
const KILL = new WeakMap<object, { tgt: KillerPose; cur: KillerPose; ph: number; t: number }>();
const killState = (a: object) => { let s = KILL.get(a); if (!s) { const z = { walk: 0, look: 0, down: 0, reach: 0, torch: 1, swing: 0, laugh: 0, kick: 0 }; s = { tgt: { ...z }, cur: { ...z }, ph: Math.random() * 6, t: -1 }; KILL.set(a, s); } return s; };
export const killerPose = (a: object): KillerPose => killState(a).tgt;
export const killerSnap = (a: object) => { const s = killState(a); Object.assign(s.cur, s.tgt); };
const killerHook = (big: boolean): PoseFn => (b: Bones, t, _a, _off, self) => {
  const st = killState(self as object), dt = st.t < 0 ? 0 : Math.max(0, Math.min(0.1, t - st.t)); st.t = t;
  const c = st.cur, g = st.tgt;
  for (const k of Object.keys(c) as Array<keyof KillerPose>) c[k] = ease(c[k], g[k], dt * (k === 'walk' ? 5 : k === 'swing' ? 16 : k === 'kick' ? 14 : 3.5));
  const stride = big ? 0.86 : 0.76, w = clamp01(c.walk / 0.8), rc = c.reach, tu = c.torch;
  st.ph += dt * Math.PI * c.walk / stride;
  const s = Math.sin(st.ph), co = Math.cos(st.ph), br = Math.sin(t * 1.5);
  // ---- legs: a soldier's heavy walk (the swinging knee lifts, the foot stays near level); standing, feet a little apart
  // (act-37: past a walk it is a run — a longer stride, the knee lifted high, the body leaning into it)
  const rk = clamp01((c.walk - 2.2) / 2), A = 0.5 * w + 0.32 * rk;
  const kL = (0.08 + (0.85 + 0.6 * rk) * Math.max(0, co)) * w, kR = (0.08 + (0.85 + 0.6 * rk) * Math.max(0, -co)) * w;
  rot(b.legL, -A * s, 0, 0.05 * (1 - w)); rot(b.shinL, kL, 0, 0); rot(b.footL, -0.45 * (-A * s + kL) + 0.1 * w, 0, 0);
  rot(b.legR, A * s, 0, -0.05 * (1 - w)); rot(b.shinR, kR, 0, 0); rot(b.footR, -0.45 * (A * s + kR) + 0.1 * w, 0, 0);
  mov(b.hips, 0, -0.03 * w * Math.abs(s) + br * 0.006 * (1 - w), 0); rot(b.hips, 0, -0.06 * s * w, 0);
  // ---- body: a little forward into the walk, the shoulders countering the hips; the breath when still; leaning in to reach / look down
  const sx = 0.05 + 0.06 * w + 0.26 * rk + br * 0.01 * (1 - w) + 0.1 * c.down + 0.35 * rc - 0.18 * c.laugh - 0.2 * c.kick, cx = 0.02 + 0.08 * rc;
  rot(b.spine, sx, 0.05 * s * w, 0); rot(b.chest, cx, 0.03 * s * w, 0);
  rot(b.neck, 0.25 * c.down - 0.1 * rc, c.look * 0.4, 0); rot(b.head, 0.35 * c.down - 0.05 * w, c.look * 0.6 + Math.sin(t * 0.4) * 0.06 * (1 - w), 0);
  // ---- the torch arm: upper arm forward, forearm up, the torch stood upright whatever the body does; a slight sway with the stride
  const aL = -0.5 * tu + 0.06 * (1 - tu) + 0.03 * s * w, fL = -1.45 * tu - 0.3 * (1 - tu);
  rot(b.armL, aL, 0, 0.06); rot(b.foreL, fL, 0, 0);
  rot(b.offhand, (-Math.PI / 2 - (sx + cx + aL + fL)) * tu + 0.2 * (1 - tu), 0, -0.06);
  // ---- the sabre arm: hanging with a soft elbow, swinging against the left leg; the blade pointed forward and down
  const aR = 0.05 - 0.24 * s * w - 1.15 * rc, fR = -0.38 + 0.2 * rc;
  rot(b.armR, aR, 0, -0.1 + 0.05 * rc); rot(b.foreR, fR, 0, 0);
  rot(b.weapon, 1.05 - (sx + cx + aR + fR) * (1 - rc) + 0.4 * rc, 0, 0);
  // ---- act-37 the cold open's flashbacks: the chop (swing 1 = the sabre raised over the head, 2 = brought down and through), the laugh
  // (head thrown back, the jaw dropped, the chest shaking, the sabre arm flung out), the kick (the right leg driven out straight)
  const sw = c.swing;
  if (sw > 0.001) {
    const k = clamp01(sw), ph = clamp01(sw - 1), mix = (a: number, b2: number) => a + (b2 - a) * ph;
    const ax = mix(-2.6, -0.45), fx = mix(-0.5, -0.1);
    rot(b.armR, aR * (1 - k) + ax * k, 0, -0.1); rot(b.foreR, fR * (1 - k) + fx * k, 0, 0); rot(b.weapon, mix(0.62, 1.0) * k + (1.05 - (sx + cx + aR + fR)) * (1 - k), 0, 0);
    rot(b.spine, sx + 0.25 * ph * k - 0.1 * (1 - ph) * k, 0, 0);
  }
  const la = c.laugh;
  if (la > 0.001) {
    const shake = Math.sin(t * 15) * 0.035 * la;
    // (his face is in the hood's shadow: the laugh has to read in the body — the head and chest thrown back, the arms flung wide,
    //  the torch high, the shoulders shaking)
    rot(b.neck, -0.35 * la, 0, 0); rot(b.head, -0.45 * la + shake, 0, 0); rot(b.chest, cx - 0.12 * la + shake, 0, 0);
    if (b.jaw) rot(b.jaw, 0.3 * la, 0, 0);
    rot(b.armR, -0.35 * la, 0, -1.15 * la); rot(b.foreR, -0.25, 0, 0); rot(b.weapon, 0.6, 0, 0);
    rot(b.armL, -0.6 * la - 1.2 * la * tu, 0, 0.9 * la); rot(b.foreL, -0.6 * la, 0, 0);
    mov(b.hips, 0, Math.abs(Math.sin(t * 15)) * 0.012 * la, 0);
  }
  const kk = c.kick;
  if (kk > 0.001) { rot(b.legR, -1.35 * kk, 0, -0.05); rot(b.shinR, 0.2 * kk, 0, 0); rot(b.footR, -0.3 * kk, 0, 0); rot(b.legL, 0.15 * kk, 0, 0.05); rot(b.shinL, 0.15 * kk, 0, 0); }
  // ---- the cloak's back panel lifts back off the legs as he walks
  rot(b.cape, 0.05 + 0.16 * w + 0.05 * Math.abs(co) * w + Math.sin(t * 1.1) * 0.02, 0, Math.sin(t * 0.8) * 0.02);
  // ---- the flame: flickers in length and width
  if (b.flame) b.flame.scale.set(1 + Math.sin(t * 17 + st.ph) * 0.1, 1 + Math.sin(t * 21) * 0.1, 1 + Math.sin(t * 13) * 0.16 + Math.sin(t * 31) * 0.08);
};
POSE_HOOKS.killer_cloak = killerHook(false);
POSE_HOOKS.killer_big = killerHook(true);
export const KILLER_CLOAK: ModelDef = { id: 'killer_cloak', name: '斗篷凶徒', group: '普通', role: '凶徒', line: '', kind: 'biped', attack: 'swing', tip: 30, build: () => buildKiller(false) };
export const KILLER_BIG: ModelDef = { id: 'killer_big', name: '褚雷（七年前）', group: '普通', role: '凶徒', line: '', kind: 'biped', attack: 'swing', tip: 34, build: () => buildKiller(true) };

/** the torch flame's world position (the middle of the flame) */
export function torchTip(a: BattleActor) { const f = a.bones.flame; return f ? f.localToWorld(V3(0, 0, 3 * a.cx)) : a.local(0.4, 1.8, 0.3); }
/** a warm light that follows a torch-bearer's flame and flickers; returns a function that removes it */
const TORCHES: Array<{ l: THREE.PointLight; a: BattleActor; i: number; ph: number }> = [];
export function torchLight(a: BattleActor, intensity = 2.2, dist = 6) {
  const l = new THREE.PointLight(0xff9a48, intensity, dist, 1.8); scene.add(l); const e = { l, a, i: intensity, ph: Math.random() * 9 }; TORCHES.push(e);
  return () => { scene.remove(l); const k = TORCHES.indexOf(e); if (k >= 0) TORCHES.splice(k, 1); };
}

// ================================================================== 阿爹（文家铸刀匠，那一夜）
// act-37 (用户的分镜：伏在爹的尸体前哭、闪回「一刀砍死阿爹」): a smith in his forties — black hair in a topknot under a dark cloth band,
// a short black beard; an undyed hemp jacket (crossed collar, sleeves to the elbow), a dark leather apron from the chest to the knee,
// hemp trousers wrapped at the shin, cloth shoes. Same biped joints as the killers (the corpse is laid out with prologue.ts layDead).
const FA = { SKIN: 0xb88a68, SKIN_D: 0x96684c, HAIR: 0x18161c, BAND: 0x3a3632, BEARD: 0x1e1a1a, EYE: 0x120c0a,
  JK: 0xa8987a, JK_D: 0x86785e, JK_L: 0xc0b294, APRON: 0x3a2a20, APRON_D: 0x281c14, APRON_L: 0x54402e, TROU: 0x6e6452, TROU_D: 0x544c3e, WRAP: 0x8e8470, SHOE: 0x2a2624, SOLE: 0x7a7266 };
function buildFather(): V {
  const v = fine(), k = KD_CLOAK, C = FA;
  v.bone('hips', 'root', 0, k.hip, 0).bone('spine', 'hips', 0, k.spine, 0).bone('chest', 'spine', 0, k.chest, 0)
    .bone('neck', 'chest', 0, k.neck, 0).bone('head', 'neck', 0, k.head, 0).bone('jaw', 'head', 0, k.head + 4, 4).bone('hat', 'head', 0, k.head + 14, 0)
    .bone('cape', 'chest', 0, k.neck - 1, -k.d - 1);
  for (const [sg, L] of [[1, 'L'], [-1, 'R']] as const) {
    v.bone('sh' + L, 'chest', sg * k.ax, k.neck, 0).bone('arm' + L, 'sh' + L, sg * k.ax, k.neck, 0).bone('fore' + L, 'arm' + L, sg * k.ax, k.elbow, 0).bone('hand' + L, 'fore' + L, sg * k.ax, k.wrist, 0);
    v.bone('leg' + L, 'hips', sg * k.lx, k.hip, 0).bone('shin' + L, 'leg' + L, sg * k.lx, k.knee, 0).bone('foot' + L, 'shin' + L, sg * k.lx, k.foot, 0);
  }
  const gy = k.hand0 + 1.5;
  v.bone('weapon', 'handR', -k.ax, gy, 0).bone('offhand', 'handL', k.ax, gy, 0).bone('blade', 'weapon', -k.ax, gy, 5);
  const LX = (cx: number, w: number): [number, number] => [Math.round(cx - w), Math.round(cx + w) - 1];
  // legs: cloth shoes, wrapped shins, trousers; the jacket's skirt and the apron over the thighs
  { const [a, b] = LX(k.lx, k.lw + 0.5), [sa, sb2] = LX(k.lx, k.lw - 0.5);
    LR(v, 'foot', a, 0, -2, b, 0, 4, C.SOLE); LR(v, 'foot', a, 1, -2, b, k.foot - 1, 3, C.SHOE);
    LR(v, 'shin', sa, k.foot, -2, sb2, k.knee - 1, 2, C.WRAP); LR(v, 'shin', sa, k.foot + 3, -2, sb2, k.foot + 3, 2, C.TROU_D);
    LR(v, 'leg', a, k.knee, -3, b, k.hip - 1, 3, C.TROU);
    LR(v, 'leg', a - 1, k.knee + 4, -4, b + 1, k.hip - 1, 3, C.JK); LR(v, 'leg', a - 1, k.knee + 4, -4, b + 1, k.knee + 4, 3, C.JK_D);
    LR(v, 'leg', a - 1, k.knee + 1, 4, b, k.hip - 1, 4, C.APRON); LR(v, 'leg', a - 1, k.knee + 1, 4, b, k.knee + 1, 4, C.APRON_L);
  }
  const hw = k.hw, cw = k.cw, d = k.d;
  R(v, 'hips', -hw, k.hip, -d, hw - 1, k.spine - 1, d - 1, C.JK);
  R(v, 'spine', -hw, k.spine, -d, hw - 1, k.chest - 1, d - 1, C.JK); B(v, 'spine', -hw - 1, k.spine, -d - 1, hw, k.spine + 1, d, C.JK_D);
  R(v, 'chest', -cw, k.chest, -d, cw - 1, k.neck - 1, d - 1, C.JK, true);
  // the crossed collar (the outer edge from the right shoulder down to the left side), the light inner collar at the throat
  B(v, 'chest', -3, k.neck - 2, d, 2, k.neck - 1, d, C.JK_L); for (let y = k.chest; y < k.neck - 2; y++) B(v, 'chest', 2 - Math.floor((k.neck - 2 - y) / 2), y, d, 2 - Math.floor((k.neck - 2 - y) / 2), y, d, C.JK_D);
  // the leather apron: the bib on the chest, the body over the belly and the hips (one cell proud), straps over the shoulders
  B(v, 'chest', -5, k.chest, d, 4, k.neck - 4, d, C.APRON); B(v, 'chest', -5, k.neck - 4, d, 4, k.neck - 4, d, C.APRON_L);
  B(v, 'spine', -6, k.spine, d, 5, k.chest - 1, d, C.APRON); B(v, 'hips', -6, k.hip, d, 5, k.spine - 1, d, C.APRON);
  for (const x of [-5, 3]) B(v, 'chest', x, k.neck - 3, -d, x + 1, k.neck - 1, d, C.APRON_D);
  B(v, 'neck', -2, k.neck, -2, 1, k.head - 1, 1, C.SKIN);
  // arms: the sleeve to the elbow, bare forearms, the hands
  { const [a, b] = LX(k.ax, k.aw + 0.5), [fa, fb] = LX(k.ax, k.aw - 0.5);
    LR(v, 'arm', a, k.elbow, -2, b, k.neck - 1, 2, C.JK); LR(v, 'arm', a, k.elbow, -2, b, k.elbow, 2, C.JK_D);
    LR(v, 'fore', fa, k.wrist, -1, fb, k.elbow - 1, 1, C.SKIN); LR(v, 'hand', fa, k.hand0, -2, fb, k.wrist - 1, 1, C.SKIN); LR(v, 'hand', fa, k.hand0, -2, fb, k.hand0, 1, C.SKIN_D);
  }
  // the head: a plain square face, eyes, a short beard on the jaw and chin; black hair, a topknot on the crown under a dark band
  { const h0 = k.head;
    R(v, 'head', -5, h0, -5, 4, h0 + 10, 4, C.SKIN);
    v.paint(q => (q.part === 'head' && q.c === C.SKIN && (q.y >= h0 + 8 || q.z <= -3 || ((q.x <= -5 || q.x >= 4) && q.y >= h0 + 5)) ? C.HAIR : null));
    B(v, 'head', -5, h0 + 11, -5, 4, h0 + 11, 4, C.HAIR);
    B(v, 'head', -3, h0 + 6, 5, -2, h0 + 6, 5, C.EYE); B(v, 'head', 1, h0 + 6, 5, 2, h0 + 6, 5, C.EYE);
    B(v, 'head', -4, h0, 5, 3, h0 + 2, 5, C.BEARD); B(v, 'head', -3, h0 + 3, 5, -2, h0 + 3, 5, C.BEARD); B(v, 'head', 1, h0 + 3, 5, 2, h0 + 3, 5, C.BEARD);
    B(v, 'head', -5, h0, -1, -5, h0 + 3, 4, C.BEARD); B(v, 'head', 4, h0, -1, 4, h0 + 3, 4, C.BEARD);
    R(v, 'head', -2, h0 + 12, -3, 1, h0 + 15, 0, C.HAIR, true); B(v, 'head', -3, h0 + 12, -4, 2, h0 + 12, 1, C.BAND);
  }
  fuse(v, 'chest', 'neck'); fuse(v, 'foreL', 'handL'); fuse(v, 'foreR', 'handR');
  return v;
}
/** 阿爹 standing (the flashback): the breath, arms hanging; flinch = 0..1 recoiling from the blow */
const FATHER = new WeakMap<object, { flinch: number; cur: number; t: number }>();
export const fatherPose = (a: object) => { let s = FATHER.get(a); if (!s) { s = { flinch: 0, cur: 0, t: -1 }; FATHER.set(a, s); } return s; };
POSE_HOOKS.wen_father = (b: Bones, t: number, _a, _off, self) => {
  const st = fatherPose(self as object), dt = st.t < 0 ? 0 : Math.max(0, Math.min(0.1, t - st.t)); st.t = t; st.cur = ease(st.cur, st.flinch, dt * 14);
  const f = st.cur, br = Math.sin(t * 1.6);
  rot(b.spine, 0.04 + br * 0.01 - 0.3 * f, 0, 0); rot(b.chest, -0.15 * f, 0.2 * f, 0); rot(b.head, -0.3 * f, 0.2 * f, 0);
  rot(b.armL, 0.05 - 1.2 * f, 0, 0.1 + 0.3 * f); rot(b.foreL, -0.3 - 0.9 * f, 0, 0);
  rot(b.armR, 0.05 - 1.4 * f, 0, -0.1 - 0.2 * f); rot(b.foreR, -0.3 - 1.0 * f, 0, 0);
  rot(b.legL, -0.15 * f, 0, 0.04); rot(b.legR, 0.25 * f, 0, -0.04); rot(b.shinR, 0.2 * f, 0, 0);
};
export const FATHER_DEF: ModelDef = { id: 'wen_father', name: '阿爹', group: '普通', role: '铸刀匠', line: '', kind: 'biped', attack: 'swing', tip: 8, build: buildFather };

// ================================================================== 杜五的驴板车（cart）：7 厘米场景格
// 一辆平板两轮车：木板车床（顺着车身的板缝）、两边矮挡板、前挡板；车床下两根纵梁一直伸到前面成一对车辕（驴站在两根辕中间）；
// 一根轴，两个实心木轮（两块矩形叠成的八角，深色轮缘一圈，两道板缝，铁轴头）；车上一卷草席、两个麻袋、一盘绳。
// 车头朝本地 +z；驴（npc_donkey）的根放在车根前 CART_HITCH 米处、同一朝向。
const CART = { WOOD: 0x6a5038, WOOD_D: 0x48362a, WOOD_L: 0x8a6c4c, IRON: 0x38363a, IRON_L: 0x5a585e, STRAW: 0xc8ac68, STRAW_D: 0xa08a50, HEMP: 0xb4a482, HEMP_D: 0x8e8064, ROPE: 0x86724e };
/** metres ahead of the cart's root where the donkey's root stands (between the shafts) */
export const CART_HITCH = 1.95;
function buildCart(): V {
  const v = new VoxChar(CELL), C = CART;
  v.bone('body', 'root', 0, 6, 0).bone('wheelL', 'body', 9, 6, 1).bone('wheelR', 'body', -10, 6, 1);
  // the bed: planks along the cart (seams every 3 cells), the low side boards, the front board, a tail board
  B(v, 'body', -7, 8, -12, 6, 9, 12, C.WOOD); for (let x = -5; x <= 5; x += 3) B(v, 'body', x, 9, -12, x, 9, 12, C.WOOD_D);
  B(v, 'body', -7, 8, -12, 6, 8, 12, C.WOOD_D);
  S(v, 'body', 6, 10, -12, 6, 11, 12, C.WOOD); S(v, 'body', 6, 11, -12, 6, 11, 12, C.WOOD_L);
  B(v, 'body', -7, 10, 12, 6, 13, 12, C.WOOD); B(v, 'body', -7, 13, 12, 6, 13, 12, C.WOOD_L);
  B(v, 'body', -7, 10, -12, 6, 10, -12, C.WOOD_D);
  // the two long beams under the bed running on forward as the shafts (one cell square), a cross-bar under the front, the axle
  S(v, 'body', 5, 7, -13, 5, 7, 31, C.WOOD_D); B(v, 'body', -6, 7, 12, 5, 7, 13, C.WOOD_D);
  S(v, 'body', 5, 7, 30, 5, 7, 31, C.IRON);
  B(v, 'body', -8, 6, 0, 7, 6, 1, C.IRON);
  // two short legs under the tail so it rests level when unhitched (it stands on them and the wheels)
  S(v, 'body', 5, 0, -12, 5, 6, -11, C.WOOD_D);
  // the load: a rolled straw mat across the front, two sacks and a coil of rope at the back
  B(v, 'body', -5, 10, 7, 4, 12, 10, C.STRAW); B(v, 'body', -5, 12, 7, 4, 12, 10, C.STRAW_D); B(v, 'body', -5, 10, 7, -5, 12, 10, C.STRAW_D); B(v, 'body', 4, 10, 7, 4, 12, 10, C.STRAW_D);
  for (const [x0, z0] of [[-5, -10], [0, -9]] as const) { B(v, 'body', x0, 10, z0, x0 + 4, 14, z0 + 4, C.HEMP); B(v, 'body', x0, 14, z0, x0 + 4, 14, z0 + 4, C.HEMP_D); B(v, 'body', x0 + 1, 15, z0 + 1, x0 + 3, 15, z0 + 3, C.HEMP_D); }
  B(v, 'body', -5, 10, -3, -1, 10, 1, C.ROPE); B(v, 'body', -4, 10, -2, -2, 10, 0, null);
  // the wheels: an octagon of two rects in the y–z plane (12 cells across), a dark rim band, a lighter face, two plank seams, an iron hub
  for (const [part, x0, x1, hub] of [['wheelL', 8, 9, 10], ['wheelR', -10, -9, -11]] as const) {
    B(v, part, x0, 2, -5, x1, 9, 6, C.WOOD_D); B(v, part, x0, 0, -3, x1, 11, 4, C.WOOD_D);
    B(v, part, x0, 2, -3, x1, 9, 4, C.WOOD); B(v, part, x0, 3, -4, x1, 8, 5, C.WOOD); B(v, part, x0, 1, -2, x1, 10, 3, C.WOOD);
    for (const z of [-2, 3]) B(v, part, x0, 1, z, x1, 10, z, C.WOOD_D);
    B(v, part, x0, 5, 0, x1, 6, 1, C.IRON); B(v, part, hub, 5, 0, hub, 6, 1, C.IRON_L);
  }
  return v;
}
const CART_LAST = new WeakMap<object, { x: number; z: number; ang: number }>();
POSE_HOOKS.cart = (b: Bones, _t, _a, _off, self) => {
  const a = self as BattleActor | undefined; if (!a?.home) return;
  let m = CART_LAST.get(a); if (!m) { m = { x: a.home.x, z: a.home.z, ang: 0 }; CART_LAST.set(a, m); }
  const dx = a.home.x - m.x, dz = a.home.z - m.z, along = dx * Math.sin(a.yaw) + dz * Math.cos(a.yaw);
  m.x = a.home.x; m.z = a.home.z; if (Math.abs(along) < 2) m.ang += along / (6 * CELL);
  rot(b.wheelL, m.ang, 0, 0); rot(b.wheelR, m.ang, 0, 0);
};
export const CART_DEF: ModelDef = { id: 'cart', name: '驴板车', group: '普通', role: '', line: '', kind: 'quad', attack: 'bite', build: buildCart };

/** act-37 (the cold open's last shot): the same girl after the night in the snow — her hair gone white (the swap happens under the
 *  drifting snow, so it reads as turning) */
const childHair = (id: string, name: string, hair: number, hairD: number): ModelDef => {
  const d: ModelDef = { ...CHILD_WENJIAO, id, name, build: () => {
    const h = CH.HAIR, hd = CH.HAIR_D; CH.HAIR = hair; CH.HAIR_D = hairD;
    try { return buildChild(); } finally { CH.HAIR = h; CH.HAIR_D = hd; }
  } };
  POSE_HOOKS[id] = (...args: Parameters<PoseFn>) => POSE_HOOKS.child_wenjiao(...args);
  return d;
};
export const CHILD_WHITE = childHair('child_wenjiao_white', '文皎（白头）', 0xe6eaf0, 0xc4c8d2);
/** act-37 (用户：「几次闪回后头发完全变白」): the steps between black and white, one per flashback */
export const CHILD_GREYS = [childHair('child_wenjiao_g1', '文皎（灰一）', 0x4a4852, 0x5c5a64), childHair('child_wenjiao_g2', '文皎（灰二）', 0x8a8892, 0x9c9aa4), childHair('child_wenjiao_g3', '文皎（灰三）', 0xbcbcc6, 0xa4a4ae)];
for (const d of [CHILD_WENJIAO, CHILD_WHITE, ...CHILD_GREYS, KILLER_CLOAK, KILLER_BIG, FATHER_DEF, CART_DEF]) if (!ROSTER.some(r => r.id === d.id)) ROSTER.push(d);
export const HANSHAN_PEOPLE = { child: CHILD_WENJIAO, cloak: KILLER_CLOAK, big: KILLER_BIG, cart: CART_DEF };

// ================================================================== captures / tuning: a few of them stood in the scene
const CAST: BattleActor[] = [];
onUpdate(dt => {
  for (const a of CAST) a.update(dt);
  const t = performance.now() / 1000;
  for (const e of TORCHES) { if (!e.a.root.parent) continue; e.l.position.copy(torchTip(e.a)); e.l.intensity = e.i * (1 + Math.sin(t * 9 + e.ph) * 0.12 + Math.sin(t * 23 + e.ph) * 0.07); }
});
/** triangles of one actor's meshes */
const trisOf = (a: BattleActor) => a.meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
dh.add({
  /** stand some of the 寒山坞 cast in the scene: ids along x from `at` (gap m), all facing yaw; pose = targets for every one of them
   *  (childPose / killerPose keys), poses = one per actor; light = a torch light on each torch-bearer; place = per-actor [x, y, z, yaw]
   *  instead of the row; keep = add to the ones already standing */
  hsCast: (o: { ids?: string[]; at?: number[]; gap?: number; yaw?: number; pose?: Record<string, number>; poses?: Array<Record<string, number>>; light?: boolean; place?: number[][]; keep?: boolean } = {}) => {
    if (!o.keep) { for (const a of CAST) a.dispose(); CAST.length = 0; for (const e of [...TORCHES]) { scene.remove(e.l); } TORCHES.length = 0; }
    const ids = o.ids ?? ['child_wenjiao', 'killer_cloak', 'killer_big', 'cart'], at = o.at ?? [0, 0, 0], gap = o.gap ?? 1.4;
    const out: Record<string, number> = {};
    ids.forEach((id, i) => {
      const def = ROSTER.find(d => d.id === id); if (!def) return;
      const a = new BattleActor(def), p = o.place?.[i];
      a.place(p ? V3(p[0], p[1], p[2]) : V3(at[0] + (i - (ids.length - 1) / 2) * gap, at[1], at[2]), p?.[3] ?? o.yaw ?? 0);
      const pz = o.poses?.[i] ?? o.pose;
      if (pz) { if (id === 'child_wenjiao') { Object.assign(childPose(a), pz); childSnap(a); } else if (id.startsWith('killer_')) { Object.assign(killerPose(a), pz); killerSnap(a); } }
      if (o.light && id.startsWith('killer_')) torchLight(a);
      a.update(0.016); CAST.push(a); out[id] = Math.round(trisOf(a));
    });
    return out;
  },
  /** triangle counts of the new models (built once, not kept) */
  hsTris: () => { const out: Record<string, number> = {}; for (const d of [CHILD_WENJIAO, KILLER_CLOAK, KILLER_BIG, CART_DEF]) { const a = new BattleActor(d); out[d.id] = Math.round(trisOf(a)); a.dispose(); } return out; },
  /** the actors hsCast stood up (for timeline tests in the console) */
  hsActors: () => CAST,
});
