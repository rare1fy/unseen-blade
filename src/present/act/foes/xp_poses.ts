// 第三关 · 下邳兵的专用动作（11-18）：写进 POSE_AFTER（在通用姿势之后每帧叠加，bestiary/poseHooks.ts）。
// 只处理 xp_ai.ts 叫的那几个动作名，别的动作照通用的播（挨打、吼、跑）；每个模型还有一层「常驻」的小改动（链锤拖地、银针扇开、
// 霜壳跟着 frost 藏 / 露、水鬼弓着背）。冲击点（imp）落在 AI 给的那一刻：动作的 k = imp 时刀 / 针 / 叉正好打到。
// 骨骼约定（同 bactor.ts）：arm / fore 绕 x 负 = 往前抬；右臂绕 z 负 = 往外（右）张开、左臂绕 z 正 = 往外张开；兵器骨骼的 +z 是兵器朝向。
// put() 直接定下关节的转角（盖掉通用姿势那一层，姿势干净）；rot() 是叠加；aim() 把兵器摆成在模型自己的坐标里朝某个方向（不管手臂怎么摆，
// 吹筒都是平的、杖都是直的、链子都往下垂）；toward() / aimToward() 从现在的样子按 w 过渡过去（动作开头结尾不跳）。
import * as THREE from 'three';
import { rot, mov, curve, snap, type Action, type Bone } from '../../actors/rig';
import { POSE_AFTER, type PoseFn } from '../../bestiary/poseHooks';
import type { BattleActor } from '../../bestiary/battle';
import { attackBeats, attackBody } from './foe_motion';
import { engagement, grip, shortThrust, stance, support, weaponArc } from './weapon_pose';

type Bones = Record<string, Bone>;
const PI = Math.PI;
const _q = new THREE.Quaternion(), _t = new THREE.Quaternion(), _e = new THREE.Euler(), _a = new THREE.Quaternion(), _s = new THREE.Quaternion(), _e2 = new THREE.Euler();

/** set a joint's rotation outright (rest rotations are all zero in these rigs) */
const put = (bn: Bone | undefined, x = 0, y = 0, z = 0) => { if (bn) bn.rotation.set(x, y, z); };
/** point a joint's +z in the model's own frame: x = pitch (π/2 straight down, −π/2 straight up), y = heading (> 0 toward the model's left) */
function aim(b: Bones, name: string, x: number, y = 0) {
  const bn = b[name]; if (!bn) return;
  _q.identity(); for (let p = bn.parent; p && p !== b.root; p = p.parent) _q.premultiply(p.quaternion);
  _t.setFromEuler(_e.set(x, y, 0, 'YXZ')); bn.quaternion.copy(_q.invert().multiply(_t));
}
/** from the joint's rotation now toward a local rotation, by w (0..1) */
function toward(bn: Bone | undefined, x: number, y: number, z: number, w: number) { if (!bn || w <= 0) return; _a.setFromEuler(_e2.set(x, y, z)); bn.quaternion.slerp(_a, Math.min(1, w)); }
/** from the joint's rotation now toward aim(x, y), by w */
function aimToward(b: Bones, name: string, x: number, y: number, w: number) {
  const bn = b[name]; if (!bn || w <= 0) return;
  _s.copy(bn.quaternion); aim(b, name, x, y); _a.copy(bn.quaternion); bn.quaternion.copy(_s).slerp(_a, Math.min(1, w));
}
/** knees bent by d without the feet sliding: thigh forward d, shin back 2d, foot flat; the hips drop by what the legs lose in height */
function bend(b: Bones, d: number) {
  if (d <= 0) return;
  const H = b.hips?.rest?.p.y ?? 0.7;
  rot(b.legL, -d, 0, 0); rot(b.shinL, 2 * d, 0, 0); rot(b.footL, -d, 0, 0); rot(b.legR, -d, 0, 0); rot(b.shinR, 2 * d, 0, 0); rot(b.footR, -d, 0, 0);
  mov(b.hips, 0, -H * (1 - Math.cos(d)), 0);
}
const lerp = (x: number, y: number, k: number) => x + (y - x) * k;
/** register one layer for a model and its elite */
const reg = (id: string, fn: PoseFn, elite = true) => { POSE_AFTER[id] = fn; if (elite) POSE_AFTER[id + '_e'] = fn; };

// ================================================================== 覆面影刃（死士）
/** the knives in a reverse grip, blades down along the body's sides */
function knivesDown(b: Bones) { aim(b, 'weapon', PI / 2 + 0.3, 0); aim(b, 'offhand', PI / 2 + 0.3, 0); }
reg('xp_assassin', (b, _t, a, off) => {
  const n = a?.name, k = a?.k ?? 0;
  if (n === 'stalk') {
    // low on bent knees, the back bowed, the head up; arms down and back, the knives reversed along the thighs; a cat's short quiet steps
    rot(b.spine, 0.42, 0, 0); rot(b.chest, 0.1, 0, 0); put(b.neck, -0.45, 0, 0);
    put(b.armR, 0.3, 0, -0.18); put(b.foreR, -0.6); put(b.armL, 0.3, 0, 0.18); put(b.foreL, -0.6);
    knivesDown(b);
    return;
  }
  if (n === 'backstab' || n === 'backstab2') {
    const D = (a!.data.dist as number | undefined) ?? 0.6, two = n === 'backstab2';
    // The elite leads with the right blade; the left blade still lands at a.at.
    const motion = attackBeats(a!);
    attackBody(b, motion);
    const coil = 0.55 * (1 - curve(k, [[0, 0], [a!.at, 1]])) + 0.65 * motion.load;
    const r = Math.min(1, two ? attackBeats(a!, false, a!.at * 0.73).hit : motion.hit);
    const l = two ? Math.min(1, motion.hit) : 0, thr = motion.hip, w = engagement(a!);
    mov(b.hips, 0, -0.14 * coil - 0.12 * thr, -0.07 * motion.load + D * 0.44 * thr);
    rot(b.spine, 0.27 * coil + 0.40 * thr, 0.38 * (r - l), 0); put(b.neck, -0.22 * coil - 0.23 * thr);
    stance(b, w, 0.27 * thr, 0, two ? 'L' : 'R');
    // Both daggers point down the same line. The right retracts as the elite's left passes it.
    const right = r * (1 - 0.89 * l);
    grip(b, 'R', -0.36 + 0.15 * right, 0.88 + 0.14 * right, -0.14 + 0.92 * right, 0.04, 0, w);
    grip(b, 'L', 0.37 - 0.16 * l, 0.89 + 0.13 * l, -0.19 + 1.0 * l, two ? 0.03 : 0.9, 0, w);
    return;
  }
});

// ================================================================== 寒针幽卒
reg('xp_needle', (b, _t, a) => {
  const n = a?.name, k = a?.k ?? 0;
  if (n === 'blow') {
    // the pipe up to the mouth by k 0.3 and held level forward; a breath drawn in (lean back, the chest fills), blown out at the needle
    const motion = attackBeats(a!);
    attackBody(b, motion, 'ranged', 0.65);
    const up = curve(k, [[0, 0], [a!.at * 0.44, 1], [a!.at, 1], [1, 0]]);
    const draw = motion.load * up, puff = motion.hit;
    rot(b.spine, -0.08 * draw + 0.12 * puff, 0.66 * up, 0); put(b.neck, 0.06 * up, -0.66 * up, 0);
    const s = 1 + 0.07 * draw; b.chest?.scale.set(s, 1, s);
    // The back of the pipe is just behind the holding fist. Bring it to the
    // posed mouth so leaning in to blow does not detach it from his lips.
    b.root.worldToLocal(b.head.localToWorld(pipeMouth.set(0, 0.0525, 0.255)));
    grip(b, 'R', pipeMouth.x, pipeMouth.y, pipeMouth.z + 0.235, 0, 0, up);
    grip(b, 'L', 0.39, 1.16, 0.20, -0.35, 0, up);
    return;
  }
  if (n === 'flee') {
    // hunched, small quick steps, the head turned back over the left shoulder to watch her, the pipe tucked against the chest
    rot(b.spine, 0.35, 0, 0); rot(b.neck, -0.1, 0.9, 0); rot(b.head, 0, 0.35, 0);
    put(b.armR, -0.35, 0, 0.3); put(b.foreR, -1.4); put(b.armL, -0.3, 0, -0.3); put(b.foreL, -1.3);
    aim(b, 'weapon', -1.25, 0); void k;
    return;
  }
});
const pipeMouth = new THREE.Vector3();

// ================================================================== 凝霜毒吏
/** The doctor's throwing hand tips the mouth of his medicine gourd outward. */
function sowGourd(b: Bones, a: Action) {
  const motion = attackBeats(a, true);
  attackBody(b, motion, 'cast');
  const { load, hit } = motion, w = engagement(a);
  rot(b.spine, -0.14 * load + 0.31 * hit, -0.29 * load + 0.21 * hit, 0);
  weaponArc(b, a, motion, 'R',
    [-0.47, 1.52, -0.05, -1.02, -0.74], [-0.24, 1.24, 0.57, 0.27, 0],
    [-0.16, 1.01, 0.47, 0.54, 0.48], w);
  grip(b, 'L', 0.43, 1.03, -0.12, 1.26, 0, w);
}
reg('xp_frost', (b, _t, a) => {
  if (a?.name !== 'sow') return;
  const motion = attackBeats(a), w = engagement(a);
  attackBody(b, motion, 'cast', 0.65);
  rot(b.spine, -0.12 * motion.load + 0.28 * motion.chest, 0.24 * motion.chest, 0);
  rot(b.neck, -0.16 * motion.chest, 0, 0);
  // Keep the luminous stopper just off the floor during the beat after the plant.
  const plant = a.k < a.at ? motion.hit : 1;
  grip(b, 'R', -0.46, 1.46 - 0.37 * plant, 0.12 + 0.29 * plant, -0.85 + 1.63 * plant, 0.05, w);
  rot(b.armL, -0.47 * motion.load + 0.32 * motion.late, 0, 0.37 * w);
  rot(b.foreL, -0.53 * w, 0, 0);
});

// ================================================================== 沉江恶鬼（水鬼）
reg('xp_diver', (b, _t, a, off, self) => {
  const n = a?.name, k = a?.k ?? 0;
  // always: hunched from the water, the head pushed forward
  rot(b.spine, 0.18, 0, 0); rot(b.neck, -0.12, 0, 0);
  if (n === 'attack' && a?.data.atk === 'poke') {
    shortThrust(self as BattleActor, a, 1.10, true);
    return;
  }
  if (n === 'rise') {
    // from far down (under the surface: only the head and the raised 叉 above it), a burst up through it at the blow, the 叉 driven straight
    // up over the head; a little off the ground at the top. (The crouch stays upright — a deeper fold tipped him over.)
    const motion = attackBeats(a!, true);
    attackBody(b, motion, 'cast', 0.6);
    const low = curve(k, [[0, 1], [a!.at * 0.75, 1], [a!.at, 0], [1, 0]]), up = motion.hit;
    off.y += -low * (1 + 0.08 * motion.dip) + 0.3 * up;
    bend(b, 0.7 * low); rot(b.spine, 0.2 * low - 0.3 * up, 0, 0); rot(b.neck, -0.2 * low - 0.25 * up, 0, 0);
    rot(b.footL, 0.35 * up, 0, 0); rot(b.footR, 0.35 * up, 0, 0);
    const pitch = -1.16 - 0.40 * up;
    const w = curve(k, [[0, 1], [a!.at, 1], [1, 0]]);
    grip(b, 'R', -0.32, 1.11 + 0.59 * up, 0.36 + 0.10 * up, pitch, 0, w);
    support(b, -0.31, pitch, 0, w);
    return;
  }
  if (n === 'sink') {
    // a crouch with the 叉 pulled in to the chest (held upright), then down under (0 → −1.4 m)
    off.y += curve(k, [[0, 0], [0.18, 0.06], [1, -1.4]]);
    const low = curve(k, [[0, 0], [0.3, 1], [1, 1]]);
    bend(b, 0.7 * low); rot(b.spine, 0.2 * low, 0, 0);
    put(b.armR, -0.9 * low, 0, 0.35 * low); put(b.foreR, lerp(-1.4, -1.6, low)); put(b.armL, -0.8 * low, 0, -0.35 * low); put(b.foreL, -1.5 * low);
    aimToward(b, 'weapon', -PI / 2 + 0.1, 0, low);
    return;
  }
});
reg('xp_conscript', (_b, _t, a, _off, self) => {
  if (a?.name === 'attack' && a.data.atk === 'poke') shortThrust(self as BattleActor, a, 0.97);
}, false);
POSE_AFTER.xp_conscript_b = POSE_AFTER.xp_conscript;

// ================================================================== 枷铁狱吏
/** the chain off the fist: straight down for the first joint, then trailing on the ground behind him to the right (the hammer resting on
 *  its face). Set in the model's own frame, so it hangs and drags the same however the arm swings */
function dragChain(b: Bones) {
  aim(b, 'weapon', PI / 2, 0);
  aim(b, 'chain2', 0.2, -2.3); aim(b, 'chain3', 0, -2.6); aim(b, 'chain4', 0, -2.85); aim(b, 'chain5', 0, -3.0);
}
const CHAINS = ['chain1', 'chain2', 'chain3', 'chain4', 'chain5'];
reg('xp_chain', (b, t, a) => {
  const n = a?.name, k = a?.k ?? 0;
  if (n === 'whirl') {
    // the whole body turned round `turns` times (slow out of the start, at full speed through the blow at 0.6), the right arm straight out
    // to the side and the chain flung straight along it: from above one big ring; then the arm drops and the chain falls back
    const turns = (a!.data.turns as number | undefined) ?? 2;
    const motion = attackBeats(a!, true);
    attackBody(b, motion, 'melee', 0.7);
    const spin = curve(k, [[0, 0], [a!.at * 0.19, 0], [a!.at + (1 - a!.at) * 0.78, 1], [1, 1]]);
    const out = 0.76 * curve(k, [[0, 0], [a!.at * 0.45, 1], [a!.at, 1], [1, 0]]) + 0.24 * motion.hit;
    const turn = spin * PI * 2 * turns, yaw = turn - PI / 2;
    b.hips.rotation.y += turn;
    rot(b.spine, 0.06 * out, 0, 0); bend(b, 0.22 * out);
    dragChain(b);
    grip(b, 'R', Math.sin(yaw) * 1.13, 1.31, Math.cos(yaw) * 1.13, 0.08, yaw, out);
    grip(b, 'L', -Math.sin(yaw) * 0.65, 1.34, -Math.cos(yaw) * 0.65, 0.18, turn, out);
    for (const c of CHAINS) toward(b[c], 0.0, -0.04, 0, out);
    return;
  }
  if (n === 'slamChain') {
    // the hammer swung up over the head (the chain flopping back), then brought down in front onto the ground at the blow
    const motion = attackBeats(a!, true);
    attackBody(b, motion);
    const { load: up, hit: dn, hip: brace } = motion, w = engagement(a!);
    rot(b.spine, -0.28 * up + 0.5 * dn, 0, 0); rot(b.neck, 0.2 * up - 0.3 * dn, 0, 0); bend(b, 0.3 * dn);
    rot(b.legL, -0.35 * brace, 0, 0); rot(b.legR, 0.3 * brace, 0, 0);
    dragChain(b);
    weaponArc(b, a!, motion, 'R',
      [-0.70, 1.97, 0.04, -2.02, -0.28], [-0.35, 1.19, 0.63, 0.55, 0.09],
      [-0.30, 1.04, 0.62, 0.44, 0.08], w);
    grip(b, 'L', 0.60, 1.35 + 0.27 * up, 0.16 - 0.18 * dn, -0.20, 0, w);
    for (const c of CHAINS) toward(b[c], 0.08 * up, 0, 0, w);
    return;
  }
  // idle / walking / reeling: the arm hanging, the chain dragged behind him
  put(b.armR, 0.1, 0, -0.1); put(b.foreR, -0.35);
  if (n === 'dizzy') {
    // reeling from the swing: the body lolls round, the head rolls, the knees loose, the chain trailing
    const s = curve(k, [[0, 0], [0.15, 1], [0.8, 1], [1, 0]]), w1 = Math.sin(t * 7), w2 = Math.sin(t * 4.6 + 1);
    bend(b, 0.2 * s); rot(b.spine, 0.2 * s, 0.15 * w2 * s, 0.22 * w1 * s); rot(b.neck, 0.2 * s, 0.25 * w2 * s, -0.3 * w1 * s);
    put(b.armL, 0.15 * s, 0, 0.25 * s); put(b.foreL, -0.2 * s); rot(b.armR, 0, 0, -0.1 * w1 * s);
  }
  dragChain(b);
});

// ================================================================== 头目 · 封鸩
const FROST_PARTS = ['frostAL', 'frostAR', 'frostFL', 'frostFR'];
reg('xp_boss', (b, t, a, off) => {
  const n = a?.name, k = a?.k ?? 0;
  // always: the frost on his arms shown with the shell on his chest (xp_ai.ts shows / hides `frost` only); the needles fanned between the
  // fingers; the gourd in hand only while he drinks (the one at his hip hidden then, and the needles put away)
  const fv = b.frost ? b.frost.visible : false; for (const p of FROST_PARTS) if (b[p]) b[p].visible = fv;
  const drink = n === 'drink', gourdInHand = drink || n === 'sow';
  if (b.gourdH) b.gourdH.visible = gourdInHand; if (b.gourd) b.gourd.visible = !gourdInHand;
  for (const p of ['needle1', 'needle2', 'needle3']) if (b[p]) b[p].visible = !gourdInHand && (n !== 'needleFan' || k < a!.at);
  rot(b.needle1, 0, 0.32, 0); rot(b.needle3, 0, -0.32, 0);
  rot(b.spine, 0.08, 0, 0); rot(b.neck, -0.06, 0, 0);
  if (n === 'needleFan') {
    // the right hand drawn across to the left shoulder (the body turned to the left), then flung out to the right-front at the blow
    const motion = attackBeats(a!, true);
    attackBody(b, motion, 'ranged');
    const { load: wind, hit: fl, late } = motion;
    rot(b.spine, 0, 0.35 * wind - 0.3 * fl, 0); rot(b.chest, 0, 0.25 * wind - 0.2 * fl, 0);
    weaponArc(b, a!, motion, 'R',
      [0.20, 1.49, 0.37, -0.28, 1.51], [-0.22, 1.31, 0.61, 0, 0], [-0.62, 1.19, 0.36, 0.20, -1.2]);
    put(b.armL, 0.25 * wind - 0.3 * late, 0, 0.3 * late); put(b.foreL, -0.4 * wind - 0.3 * late);
    rot(b.legL, -0.25 * fl, 0, 0); rot(b.legR, 0.2 * fl, 0, 0);
    return;
  }
  if (n === 'sow') { sowGourd(b, a!); return; }
  if (n === 'snip') {
    // the knife hand back and up (the body turned right), one fast cut across in front at the blow, leaning in after it
    const motion = attackBeats(a!, true);
    attackBody(b, motion);
    const { load: wind, hit: cut, hip: step, late } = motion;
    rot(b.spine, 0.3 * cut, -0.4 * wind + 0.35 * cut, 0); rot(b.chest, 0, -0.2 * wind + 0.2 * cut, 0);
    // The short bright edge is on local -Y. Roll it toward the right so the
    // edge leads the left-handed sweep across his chest.
    weaponArc(b, a!, motion, 'L',
      [0.52, 1.42, -0.04, -0.76, 1.75, -PI / 2], [0.03, 1.25, 0.58, 0.08, 0, -PI / 2],
      [-0.31, 1.11, 0.43, 0.34, -1.08, -PI / 2]);
    off.z += -0.05 * wind + 0.35 * step;
    rot(b.armR, 0.32 * late, 0, -0.25 * late);
    rot(b.legL, -0.4 * step, 0, 0); rot(b.shinL, 0.25 * step, 0, 0); rot(b.legR, 0.3 * step, 0, 0); bend(b, 0.15 * step);
    return;
  }
  if (drink) {
    // the head thrown back, the gourd up to the lips and tipped (its mouth back at his own mouth, its bottom up), two gulps; the left
    // hand pressed to his chest
    const s = curve(k, [[0, 0], [0.18, 1], [0.84, 1], [1, 0]]), gulp = Math.max(0, Math.sin((k - 0.25) * PI * 5)) * (k > 0.25 && k < 0.8 ? 1 : 0);
    rot(b.spine, -0.15 * s, 0, 0); put(b.neck, -0.55 * s - 0.08 * gulp, 0, 0); rot(b.head, -0.25 * s, 0, 0);
    put(b.armR, -1.75 * s, 0, 0.55 * s); put(b.foreR, -1.45 * s);
    aimToward(b, 'gourdH', 0.55, PI, s);
    put(b.armL, -0.75 * s, 0, -0.55 * s); put(b.foreL, -1.65 * s);
    return;
  }
  if (n === 'vanish') {
    // the sleeves opened wide, the body sinking into itself (into the mist)
    const op = curve(k, [[0, 0], [0.4, 1], [1, 1]]), dn = curve(k, [[0, 0], [0.25, 0], [1, 1]]);
    put(b.armL, -0.4 * op, 0, 1.25 * op); put(b.foreL, -0.3 * op); put(b.armR, -0.4 * op, 0, -1.25 * op); put(b.foreR, -0.3 * op);
    bend(b, 0.6 * dn); rot(b.spine, 0.35 * dn, 0, 0); off.y -= 0.25 * dn;
    return;
  }
  if (n === 'appear') {
    // out of a crouch, standing up, the sleeves opened and then gathered in with a snap
    const up = curve(k, [[0, 0], [0.6, 1], [1, 1]]), cl = snap(k, [[0, 0], [0.62, 0], [0.75, 1], [1, 1]]), op = 1 - cl;
    bend(b, 0.6 * (1 - up)); rot(b.spine, 0.35 * (1 - up), 0, 0); off.y -= 0.25 * (1 - up);
    put(b.armL, -0.4 * op, 0, 1.25 * op); put(b.foreL, -0.3 * op); put(b.armR, -0.4 * op, 0, -1.25 * op); put(b.foreR, -0.3 * op);
    return;
  }
  if (n === 'burst') {
    // the hands brought together at the chest and the body drawn in over 0 → 0.8 (slowly lower), flung wide open with the head back at the
    // blow (0.8 → 0.9), then gathered back
    const motion = attackBeats(a!, true);
    attackBody(b, motion, 'cast');
    const { load: gth, hit: open } = motion;
    const shrink = gth * (0.52 + 0.48 * k);
    bend(b, 0.45 * shrink); rot(b.spine, 0.3 * shrink - 0.3 * open, 0, 0); rot(b.neck, 0.2 * shrink - 0.5 * open, 0, 0); off.y += 0.12 * open;
    put(b.armL, -1.15 * gth - 0.35 * open, 0, -0.55 * gth + 1.4 * open); put(b.foreL, -1.25 * gth - 0.1 * open);
    put(b.armR, -1.15 * gth - 0.35 * open, 0, 0.55 * gth - 1.4 * open); put(b.foreR, -1.25 * gth - 0.1 * open);
    if (open < 0.1 && gth > 0.5) { const sh = Math.sin(t * 50) * 0.02 * shrink; rot(b.chest, 0, sh, sh); }
    return;
  }
}, false);
