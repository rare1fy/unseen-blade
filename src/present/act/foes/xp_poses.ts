// 第三关 · 下邳兵的专用动作（11-18）：写进 POSE_AFTER（在通用姿势之后每帧叠加，bestiary/poseHooks.ts）。
// 只处理 xp_ai.ts 叫的那几个动作名，别的动作照通用的播（挨打、吼、跑）；每个模型还有一层「常驻」的小改动（链锤拖地、银针扇开、
// 霜壳跟着 frost 藏 / 露、水鬼弓着背）。冲击点（imp）落在 AI 给的那一刻：动作的 k = imp 时刀 / 针 / 叉正好打到。
// 骨骼约定（同 bactor.ts）：arm / fore 绕 x 负 = 往前抬；右臂绕 z 负 = 往外（右）张开、左臂绕 z 正 = 往外张开；兵器骨骼的 +z 是兵器朝向。
// put() 直接定下关节的转角（盖掉通用姿势那一层，姿势干净）；rot() 是叠加；aim() 把兵器摆成在模型自己的坐标里朝某个方向（不管手臂怎么摆，
// 吹筒都是平的、杖都是直的、链子都往下垂）；toward() / aimToward() 从现在的样子按 w 过渡过去（动作开头结尾不跳）。
import * as THREE from 'three';
import { rot, mov, curve, snap, type Action, type Bone } from '../../actors/rig';
import { POSE_AFTER, type PoseFn } from '../../bestiary/poseHooks';

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
const running = (self: unknown) => !!(self as { running?: boolean }).running;
/** register one layer for a model and its elite */
const reg = (id: string, fn: PoseFn, elite = true) => { POSE_AFTER[id] = fn; if (elite) POSE_AFTER[id + '_e'] = fn; };

// ================================================================== 覆面影刃（死士）
/** the knives in a reverse grip, blades down along the body's sides */
function knivesDown(b: Bones) { aim(b, 'weapon', PI / 2 + 0.3, 0); aim(b, 'offhand', PI / 2 + 0.3, 0); }
reg('xp_assassin', (b, t, a, off, self) => {
  const n = a?.name, k = a?.k ?? 0;
  if (n === 'stalk') {
    // low on bent knees, the back bowed, the head up; arms down and back, the knives reversed along the thighs; a cat's short quiet steps
    bend(b, 0.6); rot(b.spine, 0.42, 0, 0); rot(b.chest, 0.1, 0, 0); put(b.neck, -0.45, 0, 0);
    put(b.armR, 0.3, 0, -0.18); put(b.foreR, -0.6); put(b.armL, 0.3, 0, 0.18); put(b.foreL, -0.6);
    if (running(self)) {
      const ph = Math.sin(t * 10);
      rot(b.legL, -0.35 * ph, 0, 0); rot(b.legR, 0.35 * ph, 0, 0); rot(b.shinL, 0.45 * Math.max(0, ph), 0, 0); rot(b.shinR, 0.45 * Math.max(0, -ph), 0, 0);
      mov(b.hips, 0, 0.012 * Math.abs(ph), 0); rot(b.armR, 0.12 * ph, 0, 0); rot(b.armL, -0.12 * ph, 0, 0);
    }
    knivesDown(b);
    return;
  }
  if (n === 'backstab' || n === 'backstab2') {
    const D = (a!.data.dist as number | undefined) ?? 0.6, two = n === 'backstab2';
    // coiled low (out of the stalk), then up off the legs at the blow, both knives driven in crossing; two = right then left
    const coil = curve(k, [[0, 1], [0.42, 1.2], [0.56, 0], [1, 0]]);
    const r = two ? snap(k, [[0, 0], [0.36, 0], [0.45, 1], [0.54, 0.25], [0.85, 0.25], [1, 0]]) : snap(k, [[0, 0], [0.5, 0], [0.6, 1], [0.84, 1], [1, 0]]);
    const l = snap(k, [[0, 0], [0.5, 0], [0.6, 1], [0.84, 1], [1, 0]]), thr = Math.max(r, l);
    off.z += snap(k, [[0, 0], [0.45, -0.06], [0.6, D], [0.84, D], [1, 0]]);
    bend(b, 0.6 * coil + 0.1 * thr); rot(b.spine, 0.42 * coil + 0.28 * thr, 0.25 * (r - l), 0); put(b.neck, -0.45 * coil - 0.2 * thr, 0, 0);
    rot(b.legL, -0.45 * thr, 0, 0); rot(b.shinL, 0.25 * thr, 0, 0); rot(b.legR, 0.35 * thr, 0, 0);
    put(b.armR, lerp(0.3 * coil, -1.45, r), 0, lerp(-0.18 * coil, 0.4, r)); put(b.foreR, lerp(-0.6 * coil, -0.1, r));
    put(b.armL, lerp(0.3 * coil, -1.45, l), 0, lerp(0.18 * coil, -0.4, l)); put(b.foreL, lerp(-0.6 * coil, -0.1, l));
    knivesDown(b); aimToward(b, 'weapon', 0.08, 0.3, r); aimToward(b, 'offhand', 0.08, -0.3, l);
    return;
  }
});

// ================================================================== 寒针幽卒
reg('xp_needle', (b, t, a) => {
  const n = a?.name, k = a?.k ?? 0;
  if (n === 'blow') {
    // the pipe up to the mouth by k 0.3 and held level forward; a breath drawn in (lean back, the chest fills), blown out at the needle
    const up = curve(k, [[0, 0], [0.3, 1], [0.92, 1], [1, 0]]);
    const draw = curve(k, [[0, 0], [0.4, 0], [0.8, 1], [0.86, 0], [1, 0]]), puff = snap(k, [[0, 0], [0.82, 0], [0.86, 1], [1, 0]]);
    put(b.armR, lerp(-0.4, -1.35, up), 0, 0.75 * up); put(b.foreR, lerp(-1.4, -0.9, up));
    put(b.armL, -1.1 * up, 0, -0.45 * up); put(b.foreL, -1.1 * up);
    rot(b.spine, -0.08 * draw + 0.12 * puff, 0, 0); put(b.neck, 0.08 * up, 0, 0);
    const s = 1 + 0.07 * draw; b.chest?.scale.set(s, 1, s);
    aimToward(b, 'weapon', 0, 0, up);
    return;
  }
  if (n === 'flee') {
    // hunched, small quick steps, the head turned back over the left shoulder to watch her, the pipe tucked against the chest
    const ph = Math.sin(t * 15);
    bend(b, 0.25); rot(b.spine, 0.35, 0, 0); rot(b.neck, -0.1, 0.9, 0); rot(b.head, 0, 0.35, 0);
    rot(b.legL, -0.4 * ph, 0, 0); rot(b.legR, 0.4 * ph, 0, 0); rot(b.shinL, 0.5 * Math.max(0, ph), 0, 0); rot(b.shinR, 0.5 * Math.max(0, -ph), 0, 0);
    put(b.armR, -0.35, 0, 0.3); put(b.foreR, -1.4); put(b.armL, -0.3, 0, -0.3); put(b.foreL, -1.3);
    aim(b, 'weapon', -1.25, 0); void k;
    return;
  }
});

// ================================================================== 凝霜毒吏 (and 封鸩's sow)
/** the staff / the right hand raised high, the left hand sowing forward and down, the body over it (impact 0.7) */
function sow(b: Bones, k: number, staff: boolean) {
  const lift = curve(k, [[0, 0], [0.3, 1], [0.86, 1], [1, 0]]);
  const back = curve(k, [[0, 0], [0.45, 1], [0.63, 0], [1, 0]]), cast = snap(k, [[0, 0], [0.62, 0], [0.7, 1], [0.86, 1], [1, 0]]);
  put(b.armR, lerp(-0.4, -2.55, lift), 0, -0.12 * lift); put(b.foreR, lerp(-1.4, -0.25, lift));
  if (staff) aimToward(b, 'weapon', -PI / 2 + 0.12, 0, lift);
  put(b.armL, 0.7 * back - 1.15 * cast, 0, 0.25 * back - 0.1 * cast); put(b.foreL, -1.2 * back - 0.25 * cast);
  rot(b.spine, -0.1 * back + 0.38 * cast, 0.15 * back - 0.1 * cast, 0); rot(b.neck, -0.18 * cast, 0, 0);
  toward(b.handL, -0.5 * cast, 0, 0, 1);
}
reg('xp_frost', (b, _t, a) => { if (a?.name === 'sow') sow(b, a.k, true); });

// ================================================================== 沉江恶鬼（水鬼）
reg('xp_diver', (b, _t, a, off) => {
  const n = a?.name, k = a?.k ?? 0;
  // always: hunched from the water, the head pushed forward
  rot(b.spine, 0.18, 0, 0); rot(b.neck, -0.12, 0, 0);
  if (n === 'rise') {
    // from far down (under the surface: only the head and the raised 叉 above it), a burst up through it at the blow, the 叉 driven straight
    // up over the head; a little off the ground at the top. (The crouch stays upright — a deeper fold tipped him over.)
    off.y += snap(k, [[0, -1.0], [0.6, -0.85], [0.75, 0.3], [0.88, 0.12], [1, 0]]);
    const low = curve(k, [[0, 1], [0.6, 1], [0.74, 0], [1, 0]]), up = snap(k, [[0, 0], [0.6, 0], [0.75, 1], [0.9, 1], [1, 0]]);
    bend(b, 0.7 * low); rot(b.spine, 0.2 * low - 0.3 * up, 0, 0); rot(b.neck, -0.2 * low - 0.25 * up, 0, 0);
    rot(b.footL, 0.35 * up, 0, 0); rot(b.footR, 0.35 * up, 0, 0);
    put(b.armR, -2.2 * low - 3.0 * up, 0, 0.25 * up); put(b.foreR, -0.4 * low - 0.15 * up);
    put(b.armL, -1.0 * low - 2.8 * up, 0, -0.3 * up); put(b.foreL, -1.3 * low - 0.25 * up);
    aim(b, 'weapon', -PI / 2 + 0.2, 0); aimToward(b, 'weapon', -PI / 2 + 0.04, 0, up);
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
    const spin = curve(k, [[0, 0], [0.06, 0], [0.93, 1], [1, 1]]), out = curve(k, [[0, 0], [0.16, 1], [0.86, 1], [1, 0]]);
    b.hips.rotation.y += spin * PI * 2 * turns;
    put(b.armR, lerp(0.1, -0.15, out), 0, lerp(-0.1, -1.5, out)); put(b.foreR, lerp(-0.35, 0, out));
    put(b.armL, -0.3 * out, 0, 0.7 * out); put(b.foreL, -0.8 * out);
    rot(b.spine, 0.06 * out, 0, 0); bend(b, 0.22 * out);
    dragChain(b);
    toward(b.weapon, PI / 2, 0, 0, out); for (const c of CHAINS) toward(b[c], 0.03, 0, 0, out);
    return;
  }
  if (n === 'slamChain') {
    // the hammer swung up over the head (the chain flopping back), then brought down in front onto the ground at the blow
    const up = curve(k, [[0, 0], [0.4, 1], [0.49, 1], [0.56, 0], [1, 0]]), dn = snap(k, [[0, 0], [0.49, 0], [0.56, 1], [0.82, 1], [1, 0]]);
    const w = Math.max(up, dn), g = up + dn > 1e-4 ? up / (up + dn) : 0;
    put(b.armR, lerp(0.1, -2.9, up) + (-1.0 - 0.1) * dn, 0, -0.1 * (1 - w) - 0.15 * up); put(b.foreR, lerp(-0.35, -0.2, w));
    put(b.armL, -2.0 * up - 0.8 * dn, 0, 0.2 * up); put(b.foreL, -0.6 * up - 0.3 * dn);
    rot(b.spine, -0.28 * up + 0.5 * dn, 0, 0); rot(b.neck, 0.2 * up - 0.3 * dn, 0, 0); bend(b, 0.3 * dn);
    rot(b.legL, -0.35 * dn, 0, 0); rot(b.legR, 0.3 * dn, 0, 0);
    dragChain(b);
    toward(b.weapon, PI / 2 + 0.9 * g, 0, 0, w); for (const c of CHAINS) toward(b[c], 0.1 * g, 0, 0, w);
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
  const drink = n === 'drink';
  if (b.gourdH) b.gourdH.visible = drink; if (b.gourd) b.gourd.visible = !drink;
  for (const p of ['needle1', 'needle2', 'needle3']) if (b[p]) b[p].visible = !drink;
  rot(b.needle1, 0, 0.32, 0); rot(b.needle3, 0, -0.32, 0);
  rot(b.spine, 0.08, 0, 0); rot(b.neck, -0.06, 0, 0);
  if (n === 'needleFan') {
    // the right hand drawn across to the left shoulder (the body turned to the left), then flung out to the right-front at the blow
    const wind = curve(k, [[0, 0], [0.6, 1], [0.72, 1], [0.8, 0], [1, 0]]), fl = snap(k, [[0, 0], [0.72, 0], [0.8, 1], [0.92, 1], [1, 0]]);
    rot(b.spine, 0, 0.35 * wind - 0.3 * fl, 0); rot(b.chest, 0, 0.25 * wind - 0.2 * fl, 0);
    put(b.armR, -1.35 * wind - 1.45 * fl, 0, 0.95 * wind - 0.75 * fl); put(b.foreR, -1.7 * wind - 0.1 * fl);
    aimToward(b, 'weapon', 0.05, -0.35, fl);
    put(b.armL, 0.25 * wind - 0.3 * fl, 0, 0.3 * fl); put(b.foreL, -0.4 * wind - 0.3 * fl);
    rot(b.legL, -0.25 * fl, 0, 0); rot(b.legR, 0.2 * fl, 0, 0);
    return;
  }
  if (n === 'sow') { sow(b, k, false); return; }
  if (n === 'snip') {
    // the knife hand back and up (the body turned right), one fast cut across in front at the blow, leaning in after it
    const wind = curve(k, [[0, 0], [0.45, 1], [0.52, 1], [0.6, 0], [1, 0]]), cut = snap(k, [[0, 0], [0.52, 0], [0.6, 1], [0.82, 1], [1, 0]]);
    rot(b.spine, 0.3 * cut, -0.4 * wind + 0.35 * cut, 0); rot(b.chest, 0, -0.2 * wind + 0.2 * cut, 0);
    put(b.armL, -1.9 * wind - 1.3 * cut, 0, 0.7 * wind - 0.6 * cut); put(b.foreL, -0.6 * wind - 0.15 * cut);
    off.z += snap(k, [[0, 0], [0.5, -0.05], [0.6, 0.35], [0.85, 0.35], [1, 0]]);
    rot(b.legL, -0.4 * cut, 0, 0); rot(b.shinL, 0.25 * cut, 0, 0); rot(b.legR, 0.3 * cut, 0, 0); bend(b, 0.15 * cut);
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
    const gth = curve(k, [[0, 0], [0.2, 1], [0.8, 1], [0.86, 0], [1, 0]]), shrink = curve(k, [[0, 0], [0.8, 1], [0.86, 0], [1, 0]]);
    const open = snap(k, [[0, 0], [0.8, 0], [0.87, 1], [0.93, 1], [1, 0]]);
    bend(b, 0.45 * shrink); rot(b.spine, 0.3 * shrink - 0.3 * open, 0, 0); rot(b.neck, 0.2 * shrink - 0.5 * open, 0, 0); off.y += 0.12 * open;
    put(b.armL, -1.15 * gth - 0.35 * open, 0, -0.55 * gth + 1.4 * open); put(b.foreL, -1.25 * gth - 0.1 * open);
    put(b.armR, -1.15 * gth - 0.35 * open, 0, 0.55 * gth - 1.4 * open); put(b.foreR, -1.25 * gth - 0.1 * open);
    if (open < 0.1 && gth > 0.5) { const sh = Math.sin(t * 50) * 0.02 * shrink; rot(b.chest, 0, sh, sh); }
    return;
  }
}, false);
