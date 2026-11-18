// 第四关、第五关敌人的动作（wp/regB）：每个模型自己的 POSE_HOOKS（待机、跑、挨打、吼，和各自的出招姿势）。
// 骨骼照黄巾兵（r45_models.ts）：+z 朝前，+x 是它自己的左手边；arm x < 0 = 手臂往前抬；fore x > 0 = 肘往里弯。
// 出招的姿势按 enemy.ts startAttack 给的 Action（名字 attack / cast，data.atk = 哪一招，k = 0..1，at = 打击帧的位置）：
//   起手（k < at）往后蓄、慢；打击帧前后两三帧打出去；之后慢收。和黄巾兵一样，预警长满的那一帧就是打击帧。
import { Vector3 } from 'three';
import { rot, mov, curve, snap, resetPose, type Action, type Bone } from '../../actors/rig';
import { POSE_HOOKS, type PoseFn } from '../../bestiary/poseHooks';
import type * as THREE from 'three';
import { attackBeats, attackBody } from './foe_motion';
import { drawString, engagement, followThrough, grip, stance, support, weaponArc, type GripKey } from './weapon_pose';
import type { BattleActor } from '../../bestiary/battle';

type Bones = Record<string, Bone>;
/** The ready stance. BattleActor adds the same gait as for the other regions. */
function base(b: Bones, t: number, o: { hunch?: number; armed?: 'r' | 'two' | 'bow' | 'none' } = {}) {
  const br = Math.sin(t * 2.2);
  mov(b.hips, 0, br * 0.015, 0);
  rot(b.spine, 0.06 + (o.hunch ?? 0) + br * 0.02, Math.sin(t * 0.6) * 0.04, 0); rot(b.chest, br * 0.02, 0, 0);
  rot(b.neck, -0.04 - (o.hunch ?? 0) * 1.1, Math.sin(t * 0.5) * 0.1, 0);
  // arms: the empty left hangs loose (a little bend at the elbow), the right holds its weapon forward
  rot(b.armL, 0.05 + br * 0.03, 0, 0.1); rot(b.foreL, -0.25, 0, 0);
  if (o.armed === 'r') { rot(b.armR, -0.35, 0, -0.08); rot(b.foreR, -1.2, 0, 0); rot(b.weapon, -0.4, 0, 0); }
  else if (o.armed === 'two') { rot(b.armR, -0.55, 0, -0.1); rot(b.foreR, -1.0, 0, 0); rot(b.armL, -0.55, 0, 0.1); rot(b.foreL, -1.0, 0, 0); rot(b.weapon, -0.2, 0, 0); }
  else { rot(b.armR, 0.05 + br * 0.03, 0, -0.1); rot(b.foreR, -0.25, 0, 0); }
}
/** BattleActor supplies hurt and death over this ready stance. */
function shared(b: Bones, a: Action | null, off: THREE.Vector3): boolean {
  if (!a) return true;
  const k = a.k;
  if (a.name === 'roar') {
    const s = curve(k, [[0, 0], [0.3, 1], [0.8, 1], [1, 0]]), sh = Math.sin(k * 60) * 0.03 * s;
    rot(b.spine, -0.35 * s, sh, 0); rot(b.neck, -0.4 * s, 0, 0); rot(b.jaw, 0.6 * s, 0, 0); rot(b.armL, -1.4 * s, 0, 0.9 * s); rot(b.armR, -1.2 * s, 0, -0.9 * s); off.y += 0.12 * s;
    return true;
  }
  return a.name !== 'attack' && a.name !== 'cast';
}
/** a deeper stance without sliding the feet (both knees bend, the hips drop) */
const bend = (b: Bones, d: number) => { rot(b.legL, -d, 0, 0); rot(b.shinL, 2 * d, 0, 0); rot(b.footL, -d, 0, 0); rot(b.legR, -d * 0.8, 0, 0); rot(b.shinR, 1.6 * d, 0, 0); rot(b.footR, -d * 0.8, 0, 0); };
/** the lunge forward on the blow: the left foot out, the right leg pushed straight */
const lungeLegs = (b: Bones, s: number) => { rot(b.legL, -0.55 * s, 0, 0); rot(b.shinL, 0.35 * s, 0, 0); rot(b.legR, 0.4 * s, 0, 0); };
/** windup / strike / settle curves round the impact frame `at` */
function beats(b: Bones, a: Action, style: 'melee' | 'ranged' | 'cast' = 'melee', heavy = false) {
  const motion = attackBeats(a, heavy);
  attackBody(b, motion, style);
  return motion;
}
const PI = Math.PI;
const swordChop: readonly [GripKey, GripKey, GripKey] = [
  [-0.53, 1.61, 0.04, -2.04, -0.28, 0.25], [-0.21, 1.12, 0.62, 0.23, 0.04, 0.42],
  [0.18, 0.77, 0.58, 0.71, 0.78, 0.48],
];
const hookCut: readonly [GripKey, GripKey, GripKey] = [
  [-0.54, 1.46, -0.08, -1.91, -0.60, 0.31], [-0.17, 0.98, 0.70, 0.15, 0.04, 0.62],
  [0.15, 0.68, 0.56, 0.52, 1.12, 0.74],
];
const jarThrow: readonly [GripKey, GripKey, GripKey] = [
  [-0.45, 1.57, -0.33, -1.48, -0.36], [-0.19, 1.50, 0.63, -0.61, 0],
  [-0.04, 0.91, 0.66, -0.89, 0.20],
];

function cuttingStep(b: Bones, a: Action, hunch = 0, travel = 0.16, arcTurn = 0.30) {
  const motion = beats(b, a, 'melee', true), { load, hip, chest } = motion, w = engagement(a);
  const turn = -arcTurn * load + arcTurn * chest;
  mov(b.hips, 0, -0.055 * hip - hunch * w, travel * hip - 0.07 * load);
  rot(b.spine, -0.14 * load + 0.29 * chest, turn, 0);
  rot(b.neck, -0.16 * chest, -0.48 * turn, 0);
  stance(b, w, (0.1 + travel) * hip);
  return motion;
}

function balance(b: Bones, a: Action, motion: ReturnType<typeof beats>) {
  grip(b, 'L', 0.42 + 0.12 * motion.chest, 1.03 + 0.19 * motion.load,
    0.07 - 0.30 * motion.chest, -0.36, 0, engagement(a));
}

// ------------------------------------------------------------------ the region-four foes
const shoulder = new Vector3();
/** The front foot takes the weight before the point arrives. The shield and the
 * supporting spear hand have their own paths through the same forward step. */
function thrust(b: Bones, a: Action, style: 'spear' | 'sword' | 'shield') {
  const { load, hit, hip, chest } = beats(b, a);
  const long = a.data.atk === 'lunge', w = engagement(a);
  const drive = Math.min(1, hip), extend = Math.min(1, hit);
  const stride = curve(a.t, [[a.dur * a.at - 0.21, 0], [a.dur * a.at - 0.02, 1]]);
  const travel = (long ? 0.46 : 0.31) * stride * w;
  // (the shield-man stays upright behind his shield: leaning as deep as the swordsman's lunge put his back over it and hid it from
  //  both cameras)
  const shield = style === 'shield', lean = shield ? 0.24 : long ? 0.64 : 0.32;
  mov(b.hips, 0, -(long ? (shield ? 0.10 : 0.15) : 0.075) * drive, (long ? 0.22 : 0.11) * drive - 0.06 * load);
  const twist = style === 'spear' ? -0.95 * w : -0.38 * load + 0.32 * chest;
  rot(b.spine, -0.08 * load + lean * chest, twist, 0);
  rot(b.neck, -0.24 * chest, -0.66 * twist, 0);
  stance(b, w, travel, 0.09 * Math.sin(Math.PI * stride) * w);
  if (style === 'spear') {
    const yaw = 0.13 * (1 - extend);
    grip(b, 'R', -0.32 + 0.27 * extend, 1.15, -0.07 + 0.65 * extend, 0, yaw, w);
    support(b, 0.39 - 0.14 * extend, 0, yaw, w);
  } else {
    // the blade level from the start of the load, drawn back beside the shield's edge, then driven past it
    const pitch = shield ? -0.10 * (1 - extend) : -0.07 * (1 - extend);
    b.root.worldToLocal(b.armR.getWorldPosition(shoulder));
    const reach = b.foreR.position.length() + b.handR.position.length();
    grip(b, 'R', shield ? -0.40 : -0.32, 1.15 - 0.07 * drive,
      0.01 + (shoulder.z + reach) * extend, pitch, 0, w);
    if (shield) grip(b, 'L', 0.20, 1.10 - 0.06 * drive, 0.47 + 0.13 * drive, 0, 0, w);
    else {
      rot(b.armL, 0.70 * chest, 0, 0.32 * chest);
      rot(b.foreL, -0.27 * load + 0.44 * chest, 0, 0);
    }
  }
}

const spearPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'two' }); if (shared(b, a, off)) return;
  if (a!.name === 'attack' && a!.data.atk === 'poke') { thrust(b, a!, 'spear'); return; }
  const { load, hit, hip } = beats(b, a!);
  rot(b.armR, 0.5 * load - 0.9 * hit, 0, 0); rot(b.foreR, -0.6 * load + 0.9 * hit, 0, 0); rot(b.armL, 0.2 * load - 1.0 * hit, 0, 0); rot(b.foreL, -0.5 * load + 0.7 * hit, 0, 0);
  rot(b.spine, -0.1 * load + 0.35 * hit, 0.25 * load - 0.2 * hit, 0); bend(b, 0.15 * load); lungeLegs(b, hip); off.z = -0.15 * load + 0.7 * hip;
};
const chainPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'none', hunch: 0.05 });
  const held = shared(b, a, off);
  grip(b, 'R', -0.43, 0.84, 0.17, 1.85, 0.06, 1);
  let taut = 0;
  if (!held && a?.name === 'attack') {
    const pull = a.data.atk === 'pull', high = a.data.atk === 'cut';
    const motion = cuttingStep(b, a, high || pull ? 0.02 : 0.14, pull ? 0.21 : 0.12, 0.46);
    const w = engagement(a), { load, hit } = motion;
    if (pull) {
      // The extra reach uses the existing strike trail. The visible links
      // straighten from the fist and hook first, then bend as he hauls back.
      weaponArc(b, a, motion, 'R',
        [-0.54, 1.50, -0.18, -1.56, -0.65], [-0.17, 1.06, 0.65, 0, 0.08], [-0.52, 0.90, 0.21, 0.18, -0.13], w);
    } else if (high) weaponArc(b, a, motion, 'R', ...swordChop, w);
    else {
      weaponArc(b, a, motion, 'R',
        [-0.60, 0.86, -0.20, 0.11, -1.87], [-0.20, 0.86, 0.55, 0.06, -0.10], [0.24, 0.76, 0.42, 0.13, 1.39], w);
    }
    balance(b, a, motion);
    taut = Math.min(1, (0.56 * load + hit) * w);
  }
  // Drop the links in a loose coil beside the boot while the arm idles.
  for (let i = 0; i < 4; i++) b['link' + i].rotation.set((1 - taut) * (i === 0 ? 0.50 : 0.59), 0, 0);
};
/** 掷火卒: the jar drawn back low behind the right hip, then lobbed up and over */
const oilPose: PoseFn = (b, t, a, off, self) => {
  b.weapon.visible = true;
  base(b, t, { armed: 'r', hunch: 0.08 }); if (shared(b, a, off)) return;
  if (a!.name === 'attack') {
    // OilJar derives its flight time and deflectable trajectory from weapon().
    // Keep the original hand anchor for that calculation while posing the visible throw below.
    const actor = self as BattleActor, { k, at } = a!;
    const load = curve(k, [[0, 0], [at * 0.85, 1], [at, 0.15], [1, 0]]);
    const hit = snap(k, [[0, 0], [at * 0.9, 0], [at + 0.04, 1], [Math.min(0.98, at + 0.28), 1], [1, 0]]);
    rot(b.armR, 0.9 * load - 2.6 * hit, 0, -0.2 * load);
    rot(b.foreR, 0.3 * load - 0.4 * hit, 0, 0);
    rot(b.spine, 0.15 * load - 0.2 * hit + 0.2 * actor.lowHp, -0.4 * load + 0.3 * hit, 0);
    mov(b.hips, 0, -0.05 * actor.lowHp, 0);
    const tip = b.handR.localToWorld(new Vector3(0, -2 * actor.cy, actor.cx));
    actor.preserveProjectileOrigin(actor.body.worldToLocal(tip), 0.05 * hit);
    resetPose(b);
    base(b, t, { armed: 'r', hunch: 0.08 });
  }
  const motion = cuttingStep(b, a!);
  weaponArc(b, a!, motion, 'R', ...jarThrow);
  balance(b, a!, motion);
  b.weapon.visible = a!.t < a!.dur * a!.at || a!.k > 0.92;
};
/** 楼船弩士: the crossbow raised to the cheek (both hands), held; on the shot a kick back; spanning: kneeling, the foot in the stirrup */
const stringCenter = new Vector3();
const xbowPose: PoseFn = (b, t, a, off) => {
  base(b, t, { armed: 'two' });
  stringCenter.copy(b.stringA.position).lerp(b.stringB.position, 0.5);
  if (shared(b, a, off)) {
    if (b.bolt.visible) stringCenter.z -= 0.35;
    drawString(b, stringCenter, 'x'); return;
  }
  const { k, at } = a!;
  if (a!.name === 'cast') {
    // r45_ai plays this 0.3 s action at the end of span. The left hand braces
    // the fore-end while the right slides along the stock with the string.
    const kneel = curve(k, [[0, 0], [at * 0.36, 1], [at * 0.78, 1], [1, 0]]);
    const pull = curve(k, [[at * 0.36, 0], [at * 0.81, 1]]);
    mov(b.hips, 0.05 * kneel, -0.41 * kneel, -0.09 * kneel);
    rot(b.spine, 1.04 * kneel, 0.22 * kneel, -0.12 * kneel); rot(b.neck, -0.98 * kneel, -0.2 * kneel, 0);
    mov(b.shL, -0.13 * kneel, 0.05 * kneel, 0.12 * kneel);
    stance(b, kneel, 0.36 * kneel, 0.04 * Math.sin(Math.PI * kneel), 'R');
    stringCenter.z -= 0.35 * pull;
    b.weapon.position.addScaledVector(stringCenter, -kneel);
    const pitch = -0.6 + 2.55 * kneel;
    grip(b, 'R', 0.035, 0.63, 0.74, pitch, 0.58, kneel);
    support(b, 0.22, pitch, 0.58, kneel);
    b.bolt.visible = k >= at;
  } else {
    const { kick } = beats(b, a!, 'ranged'), w = engagement(a!);
    const shot = a!.t >= a!.dur * at ? 1 : 0;
    const recoil = shot * (1 - curve(a!.t, [[a!.dur * at + 0.025, 0], [a!.dur * at + 0.14, 1]]));
    rot(b.spine, -0.08 * kick, -1.25 * w, 0); rot(b.neck, -0.12 * recoil, 0.98 * w, 0);
    stance(b, w);
    b.root.worldToLocal(b.armR.getWorldPosition(shoulder));
    grip(b, 'R', shoulder.x - 0.09, 1.295, shoulder.z + 0.35 - 0.085 * recoil, -0.06 * recoil, 0, w);
    support(b, 0.32, 0, 0, w);
    b.bolt.visible = !shot;
    stringCenter.z -= 0.35 * (1 - shot);
  }
  drawString(b, stringCenter, 'x');
};
/** 没水鬼: low and crouched, the hook hand back; the cut: a quick cross-body slash */
const diverPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'r', hunch: 0.25 }); bend(b, 0.25); if (shared(b, a, off)) return;
  // The water ambush uses the same falling hook as the close cut, from a crouch.
  const motion = cuttingStep(b, a!, 0.07);
  weaponArc(b, a!, motion, 'R', ...hookCut);
  balance(b, a!, motion);
};
/** keep what the left hand holds (a shield, the 筑) square to the body whatever the arm does: the offhand joint turned back by the arm's
 *  and the forearm's pitch (they are the only rotations about x above it) */
const levelOffhand = (b: Bones) => { if (b.offhand && b.armL && b.foreL) b.offhand.rotation.x -= (b.armL.rotation.x - (b.armL.rest?.r.x ?? 0)) + (b.foreL.rotation.x - (b.foreL.rest?.r.x ?? 0)); };
/** 执楯刀士: the shield up on the left (the forearm level in front, the plank upright before it), the blade low; the rush: head down
 *  behind the shield; the cut: over it */
const shieldPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'r' }); rot(b.armL, -0.45, 0, -0.12); rot(b.foreL, -1.0, 0, 0);
  if (a?.name === 'attack' && a.data.atk === 'lunge') {
    levelOffhand(b); thrust(b, a, 'shield'); return;
  }
  if (!shared(b, a, off)) {
    const motion = cuttingStep(b, a!), w = engagement(a!);
    levelOffhand(b);
    grip(b, 'L', 0.39, 1.07, 0.39, -0.10, 0.48, w);
    weaponArc(b, a!, motion, 'R', ...swordChop, w);
    return;
  }
  levelOffhand(b);
};
/** 周默 signals with the flag and fights with the sleeve bow or oil jar. */
const zhouPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'r', hunch: 0.12 }); rot(b.armL, -0.4, 0, 0.1); rot(b.foreL, -0.9, 0, 0);
  const lob = a?.data.atk === 'lob', shoot = a?.name === 'attack' && a.data.atk === 'shoot';
  b.sleeveBow.visible = !lob;
  b.sleeveBolt.visible = !shoot || a.k < a.at;
  b.oilJar.visible = !!lob && a.k < a.at;
  if (lob) {
    const actor = self as BattleActor;
    rot(b.spine, 0.2 * actor.lowHp, 0, 0);
    mov(b.hips, 0, -0.05 * actor.lowHp, 0);
    const origin = b.handR.localToWorld(new Vector3(0, -2 * actor.cy, actor.cx));
    actor.preserveProjectileOrigin(actor.body.worldToLocal(origin), 0);
    rot(b.spine, -0.2 * actor.lowHp, 0, 0);
    mov(b.hips, 0, 0.05 * actor.lowHp, 0);
    const motion = cuttingStep(b, a);
    weaponArc(b, a, motion, 'R', ...jarThrow);
    grip(b, 'L', 0.43, 1.04, 0.21, 0.07, 0.38, engagement(a));
    return;
  }
  if (shared(b, a, off)) return;
  if (a!.name === 'cast') {
    const motion = beats(b, a!, 'cast', true), { load, hit } = motion;
    rot(b.spine, -0.10 * load + 0.13 * hit, 0, 0);
    weaponArc(b, a!, motion, 'L',
      [0.35, 1.33, 0.22, -0.09, 0.1], [0.44, 1.63, 0.24, 0.16, 0.52],
      [0.49, 1.28, 0.42, 0.22, 1.05]);
    return;
  }
  const { load, hit, kick } = beats(b, a!, 'ranged', true), w = engagement(a!);
  rot(b.spine, -0.05 * load - 0.17 * kick, -0.46 * w, 0);
  grip(b, 'R', -0.12, 1.20, 0.36 + 0.27 * hit - 0.20 * kick, -0.17 * kick, 0, w);
  grip(b, 'L', 0.39, 0.97, -0.08, 0.10, 0.24, w);
};

// ------------------------------------------------------------------ the region-five foes
/** 持杖僮奴: the staff in both hands across the body; the whack: raised overhead, brought down */
const clubPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'two' }); if (shared(b, a, off)) return;
  const motion = cuttingStep(b, a!, 0.03, 0.16, 0.18), w = engagement(a!);
  const { pitch, yaw } = weaponArc(b, a!, motion, 'R',
    [-0.34, 1.66, 0.20, -2.01, -0.38], [-0.04, 1.17, 0.60, 0.30, 0],
    [0.02, 0.94, 0.48, 0.84, 0.22], w);
  support(b, -0.31, pitch, yaw, w);
};
/** 门下剑客: the sword upright in front of the face (the guard: the 中平 of the Han sword), the left hand in the sword mudra behind;
 *  the thrust: the arm straight out, the body after it */
const swordPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'r' }); rot(b.armR, -0.7, 0, 0.25); rot(b.foreR, -0.6, 0, 0); rot(b.weapon, -0.8, 0, 0); rot(b.armL, 0.4, 0, 0.4); rot(b.foreL, -1.1, 0, 0);
  if (shared(b, a, off)) return;
  if (a!.name === 'attack' && (a!.data.atk === 'poke' || a!.data.atk === 'lunge')) { thrust(b, a!, 'sword'); return; }
  const { load, hit, hip, late } = beats(b, a!);
  rot(b.armR, 0.5 * load - 0.9 * hit, 0, -0.25 * hit); rot(b.foreR, -0.5 * load + 1.1 * hit, 0, 0); rot(b.weapon, 0.8 * hit, 0, 0);
  rot(b.spine, -0.05 * load + 0.25 * hit, 0.3 * load - 0.25 * hit, 0); bend(b, 0.15 * load); lungeLegs(b, hip); off.z = -0.1 * load + 0.55 * hip;
  rot(b.armL, 0.24 * late, 0, 0.20 * late);
};
/** 匿影死士: crouched low, the dagger reversed along the forearm; the cut: a rising backhand */
const shadePose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'r', hunch: 0.30 }); bend(b, 0.30);
  grip(b, 'R', -0.48, 0.81, 0.08, 1.34, -0.18, 1);
  if (shared(b, a, off)) return;
  const motion = cuttingStep(b, a!, 0.11, 0.24, 0.43);
  weaponArc(b, a!, motion, 'R',
    [-0.54, 0.91, -0.20, 0.31, -1.65, 1.95], [-0.14, 1.00, 0.70, -0.08, 0.06, 1.95],
    [0.22, 1.12, 0.58, -0.46, 1.11, 1.92]);
  balance(b, a!, motion);
};
/** 百辟刀卫 and 崔玄 with the blade: the drawing cut — the blade low at the left hip, then torn across to the right at waist height */
const drawCut = (b: Bones, a: Action, off: THREE.Vector3) => {
  const { load, hit, hip, late } = beats(b, a, 'melee', true);
  rot(b.armR, -0.9 * load - 1.1 * hit, 0, 0.9 * load - 1.2 * hit); rot(b.foreR, 0.9 * load + 0.2 * hit, 0, 0); rot(b.weapon, 0.6 * load, 0.5 * load - 0.8 * hit, 0);
  rot(b.armL, -0.6 * load + 0.38 * late, 0, 0.3 * load + 0.26 * late); rot(b.foreL, -0.8 * load, 0, 0);
  rot(b.spine, 0.15 * load + 0.2 * hit, 0.45 * load - 0.55 * hit, 0); bend(b, 0.3 * load + 0.2 * hip); lungeLegs(b, hip); off.z = 0.5 * hip;
};
const guardPose: PoseFn = (b, t, a, off) => {
  base(b, t, { armed: 'r' }); if (shared(b, a, off)) return;
  if (a!.name !== 'attack' || a!.data.atk !== 'cut') { drawCut(b, a!, off); return; }
  const { hit, hip, chest, load } = beats(b, a!, 'melee', true);
  const w = engagement(a!), cut = a!.k < a!.at ? hit : 1, follow = followThrough(a!);
  const turn = -0.53 * load + 0.40 * chest + 0.36 * follow * w;
  mov(b.hips, 0, -0.08 * hip, 0.11 * hip);
  rot(b.spine, -0.09 * load + 0.27 * chest, turn, 0); rot(b.neck, -0.14 * chest, -0.50 * turn, 0);
  stance(b, w, 0.15 * hip);
  grip(b, 'R', -0.55 + 0.40 * cut * cut + 0.31 * follow, 1.62 - 0.48 * cut - 0.16 * follow,
    0.04 + 0.58 * cut - 0.14 * follow, -1.91 + 1.95 * cut + 0.52 * follow, 0.15 * cut + 0.94 * follow, w);
  rot(b.armL, -0.47 * load + 0.53 * chest, 0, 0.28 * w); rot(b.foreL, -0.61 * w, 0, 0);
};
/** 击筑客: the 筑 held level across the body on the left forearm, the striker in the right; a stroke (cast): the arm raised, the striker
 *  brought down onto the strings */
const zhuPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'none', hunch: 0.06 }); rot(b.armL, -0.5, 0, -0.15); rot(b.foreL, -1.0, 0, 0); rot(b.armR, -0.7, 0, 0.3); rot(b.foreR, -0.8, 0, 0);
  levelOffhand(b);
  if (!shared(b, a, off)) {
    const { load, hit, chest } = beats(b, a!, 'cast');
    const w = engagement(a!);
    rot(b.spine, 0.1 * chest, 0, 0);
    grip(b, 'L', 0.15, 1.02, 0.37, 0, PI / 2, w);
    // Place the end of the striker on the strings at the beat, over the
    // portion of the instrument which crosses the space in front of him.
    grip(b, 'R', -0.25, 1.19 + 0.29 * load, 0.37, -0.52 * load + 0.36 * hit, 1.34, w);
  }
};
/** 崔玄: upright, unhurried, the fan held loose at the chest, the left hand behind his back; the fan stroke a flick across; with the
 *  blade the drawing cut; the lunge a long straight 一字 thrust */
const cuiPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'r', hunch: -0.04 }); rot(b.armR, -0.5, 0, 0.2); rot(b.foreR, -0.9, 0, 0); rot(b.armL, 0.5, 0, 0.25); rot(b.foreL, -1.4, 0, 0);
  if (shared(b, a, off)) return;
  const atk = a!.data.atk;
  if (a!.name === 'cast') {
    const motion = beats(b, a!, 'cast', true), w = engagement(a!);
    const sword = b.blade.visible;
    weaponArc(b, a!, motion, 'R',
      [-0.53, 1.44, 0.15, sword ? -1.83 : 0.10, -0.35],
      [-0.27, 1.54, 0.51, sword ? -1.45 : 0.01, 0],
      [-0.38, 1.38, 0.49, sword ? -0.8 : 0.05, 0.24], w);
    balance(b, a!, motion);
    return;
  }
  if (atk === 'fan') {
    const motion = cuttingStep(b, a!, 0, 0.10, 0.35);
    // The fan extends along its local +Y. Turn that axis outward so the
    // silk, and not the knuckles holding it, lead the sweep.
    weaponArc(b, a!, motion, 'R',
      [-0.52, 1.22, -0.07, 1.20, -1.86, -0.18], [-0.18, 1.19, 0.59, 1.18, 0.02, -0.26],
      [0.22, 1.02, 0.48, 1.08, 1.27, -0.35]);
    balance(b, a!, motion);
    return;
  }
  if (atk === 'lunge') {
    thrust(b, a!, 'sword');
    return;
  }
  const motion = cuttingStep(b, a!, 0.04, 0.27, 0.53);
  weaponArc(b, a!, motion, 'R',
    [-0.53, 1.21, -0.20, -0.17, -1.95, PI / 2], [-0.16, 1.11, 0.67, 0.04, 0, PI / 2],
    [0.26, 0.97, 0.54, 0.16, 1.39, PI / 2]);
  balance(b, a!, motion);
};

const HOOKS: Record<string, PoseFn> = {
  wl_spear: spearPose, wl_spear_b: spearPose, wl_chain: chainPose, wl_chain_e: chainPose, wl_oil: oilPose, wl_oil_e: oilPose, wl_xbow: xbowPose, wl_xbow_e: xbowPose,
  wl_diver: diverPose, wl_diver_e: diverPose, wl_shield: shieldPose, wl_shield_e: shieldPose, wl_boss: zhouPose,
  cx_club: clubPose, cx_club_b: clubPose, cx_sword: swordPose, cx_sword_e: swordPose, cx_shade: shadePose, cx_shade_e: shadePose,
  cx_guard: guardPose, cx_guard_e: guardPose, cx_zhu: zhuPose, cx_zhu_e: zhuPose, cx_boss: cuiPose,
};
for (const [id, fn] of Object.entries(HOOKS)) POSE_HOOKS[id] = fn;
