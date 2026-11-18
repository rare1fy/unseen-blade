// 第四关、第五关敌人的动作（wp/regB）：每个模型自己的 POSE_HOOKS（待机、跑、挨打、吼，和各自的出招姿势）。
// 骨骼照黄巾兵（r45_models.ts）：+z 朝前，+x 是它自己的左手边；arm x < 0 = 手臂往前抬；fore x > 0 = 肘往里弯。
// 出招的姿势按 enemy.ts startAttack 给的 Action（名字 attack / cast，data.atk = 哪一招，k = 0..1，at = 打击帧的位置）：
//   起手（k < at）往后蓄、慢；打击帧前后两三帧打出去；之后慢收。和黄巾兵一样，预警长满的那一帧就是打击帧。
import { Vector3 } from 'three';
import { rot, mov, curve, snap, resetPose, type Action, type Bone } from '../../actors/rig';
import { POSE_HOOKS, type PoseFn } from '../../bestiary/poseHooks';
import type * as THREE from 'three';
import { attackBeats, attackBody } from './foe_motion';
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

// ------------------------------------------------------------------ the region-four foes
/** 执矛水卒: the spear held level; the thrust — pulled back to the hip, the whole body driven forward along the haft */
const spearPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'two' }); if (shared(b, a, off)) return;
  const { load, hit, hip } = beats(b, a!);
  rot(b.armR, 0.5 * load - 0.9 * hit, 0, 0); rot(b.foreR, -0.6 * load + 0.9 * hit, 0, 0); rot(b.armL, 0.2 * load - 1.0 * hit, 0, 0); rot(b.foreL, -0.5 * load + 0.7 * hit, 0, 0);
  rot(b.spine, -0.1 * load + 0.35 * hit, 0.25 * load - 0.2 * hit, 0); bend(b, 0.15 * load); lungeLegs(b, hip); off.z = -0.15 * load + 0.7 * hip;
};
/** 拽索手: the chain whirled overhead (the right arm up, circling) — the low sweep: down and round (the body turning a full half),
 *  the throw: the arm whipped forward and down */
const chainPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'none', hunch: 0.05 }); if (shared(b, a, off)) return;
  const { load, hit, hip, late } = beats(b, a!, 'melee', true), pull = a!.data.atk === 'pull', spin = Math.sin(t * 16);
  if (pull) {
    rot(b.armR, -2.6 * load - 1.2 * hit, spin * 0.3 * load, 0.2 * load); rot(b.foreR, 0.3 * load, 0, 0);
    rot(b.spine, -0.2 * load + 0.4 * hit, 0.4 * load - 0.3 * hit, 0); lungeLegs(b, hip); off.z = 0.3 * hip;
  } else {
    const turn = -0.6 * load + 1.2 * hip;
    b.hips.rotation.y += turn; rot(b.armR, -1.4 * load - 0.2 * hit, 0, -1.2 * hit); rot(b.foreR, 0.2, 0, 0);
    bend(b, 0.3 * load + 0.45 * hit); rot(b.spine, 0.3 * hit, 0, 0);
  }
  rot(b.armL, 0.32 * late, 0, 0.35 * late);
};
/** 掷火卒: the jar drawn back low behind the right hip, then lobbed up and over */
const oilPose: PoseFn = (b, t, a, off, self) => {
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
  const { load, hit, late } = beats(b, a!);
  rot(b.armR, 0.9 * load - 2.6 * hit, 0, -0.2 * load); rot(b.foreR, 0.3 * load - 0.4 * hit, 0, 0);
  rot(b.spine, 0.15 * load - 0.2 * hit, -0.4 * load + 0.3 * hit, 0); rot(b.armL, -0.6 * load + 0.44 * late, 0, 0.3 * late); bend(b, 0.25 * load); off.y += 0.05 * hit;
};
/** 楼船弩士: the crossbow raised to the cheek (both hands), held; on the shot a kick back; spanning: kneeling, the foot in the stirrup */
const xbowPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'two' }); if (shared(b, a, off)) return;
  const { k, at } = a!;
  if (a!.name === 'cast') { const kn = curve(k, [[0, 0], [0.5, 1], [1, 0]]); bend(b, 0.6 * kn); rot(b.spine, 0.5 * kn, 0, 0); rot(b.armR, -0.4 * kn, 0, 0); rot(b.armL, -0.4 * kn, 0, 0); off.y -= 0.25 * kn; return; }
  const { kick } = beats(b, a!, 'ranged');
  const aim = curve(k, [[0, 0], [at * 0.56, 1], [at, 1], [1, 0]]);
  const settle = 0.018 * Math.sin(t * 6) * aim * Math.max(0, 1 - k / Math.max(0.001, at));
  rot(b.armR, -1.25 * aim, 0, 0.15 * aim); rot(b.foreR, 0.2 * aim, 0, 0); rot(b.armL, -1.35 * aim, 0, -0.25 * aim); rot(b.foreL, 0.25 * aim, 0, 0);
  rot(b.weapon, 0.6 * aim - 0.09 * kick + settle, 0, 0); rot(b.spine, -0.05 * aim - 0.15 * kick, 0, 0); rot(b.neck, 0.1 * aim, 0, 0); off.z = -0.12 * kick;
};
/** 没水鬼: low and crouched, the hook hand back; the cut: a quick cross-body slash */
const diverPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'r', hunch: 0.25 }); bend(b, 0.25); if (shared(b, a, off)) return;
  const { load, hit, hip, late } = beats(b, a!);
  rot(b.armR, -1.4 * load - 0.6 * hit, 0, -0.8 * load + 1.1 * hit); rot(b.foreR, 0.6 * load, 0, 0);
  rot(b.spine, 0.1 * hit, -0.5 * load + 0.6 * hit, 0); lungeLegs(b, hip * 0.6); off.z = 0.4 * hip;
  rot(b.armL, 0.26 * late, 0, 0.28 * late);
};
/** keep what the left hand holds (a shield, the 筑) square to the body whatever the arm does: the offhand joint turned back by the arm's
 *  and the forearm's pitch (they are the only rotations about x above it) */
const levelOffhand = (b: Bones) => { if (b.offhand && b.armL && b.foreL) b.offhand.rotation.x -= (b.armL.rotation.x - (b.armL.rest?.r.x ?? 0)) + (b.foreL.rotation.x - (b.foreL.rest?.r.x ?? 0)); };
/** 执楯刀士: the shield up on the left (the forearm level in front, the plank upright before it), the blade low; the rush: head down
 *  behind the shield; the cut: over it */
const shieldPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'r' }); rot(b.armL, -0.45, 0, -0.12); rot(b.foreL, -1.0, 0, 0);
  if (!shared(b, a, off)) {
    const { load, hit, hip } = beats(b, a!), rush = a!.data.atk === 'lunge';
    if (rush) { rot(b.spine, 0.4 * load + 0.3 * hit, 0, 0); rot(b.neck, -0.3 * load, 0, 0); rot(b.armL, -0.2 * hit, 0, 0); bend(b, 0.3 * load); lungeLegs(b, hip); }
    else { rot(b.armR, -2.3 * load + 1.2 * hit, 0, 0.2 * load); rot(b.foreR, 0.6 * load + 0.6 * hit, 0, 0); rot(b.spine, -0.15 * load + 0.3 * hit, 0.2 * load, 0); lungeLegs(b, hip * 0.7); off.z = 0.35 * hip; }
  }
  levelOffhand(b);
};
/** 周黯: an old man's stoop, the hands in the wide sleeves; the signal flag raised (cast), the sleeve-bow pointed (attack) */
const zhouPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'r', hunch: 0.12 }); rot(b.armL, -0.4, 0, 0.1); rot(b.foreL, -0.9, 0, 0);
  if (shared(b, a, off)) return;
  if (a!.name === 'cast') {
    const { load, hit } = beats(b, a!, 'cast', true);
    rot(b.armL, -0.9 * load - 1.8 * hit, 0, 0.35 * hit); rot(b.foreL, -0.25 * load + 0.3 * hit, 0, 0);
    rot(b.spine, -0.10 * load + 0.13 * hit, 0, 0); return;
  }
  const { load, hit } = beats(b, a!, 'ranged', true);
  if (a!.data.atk === 'lob') { rot(b.armR, 0.6 * load - 2.2 * hit, 0, 0); return; }
  rot(b.armR, -1.4 * Math.max(load, hit), 0, 0.1); rot(b.foreR, 0.1, 0, 0); rot(b.spine, -0.1 * hit, 0, 0); off.z = -0.2 * hit;
};

// ------------------------------------------------------------------ the region-five foes
/** 持杖僮奴: the staff in both hands across the body; the whack: raised overhead, brought down */
const clubPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'two' }); if (shared(b, a, off)) return;
  const { load, hit, hip } = beats(b, a!, 'melee', true);
  rot(b.armR, -2.5 * load + 1.3 * hit, 0, 0); rot(b.foreR, 0.5 * load + 0.4 * hit, 0, 0); rot(b.armL, -2.4 * load + 1.3 * hit, 0, 0); rot(b.foreL, 0.5 * load + 0.4 * hit, 0, 0);
  rot(b.weapon, 0.3 * load + 0.9 * hit, 0, 0); rot(b.spine, -0.25 * load + 0.4 * hit, 0, 0); lungeLegs(b, hip * 0.6); off.z = 0.3 * hip;
};
/** 门下剑客: the sword upright in front of the face (the guard: the 中平 of the Han sword), the left hand in the sword mudra behind;
 *  the thrust: the arm straight out, the body after it */
const swordPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'r' }); rot(b.armR, -0.7, 0, 0.25); rot(b.foreR, -0.6, 0, 0); rot(b.weapon, -0.8, 0, 0); rot(b.armL, 0.4, 0, 0.4); rot(b.foreL, -1.1, 0, 0);
  if (shared(b, a, off)) return;
  const { load, hit, hip, late } = beats(b, a!);
  rot(b.armR, 0.5 * load - 0.9 * hit, 0, -0.25 * hit); rot(b.foreR, -0.5 * load + 1.1 * hit, 0, 0); rot(b.weapon, 0.8 * hit, 0, 0);
  rot(b.spine, -0.05 * load + 0.25 * hit, 0.3 * load - 0.25 * hit, 0); bend(b, 0.15 * load); lungeLegs(b, hip); off.z = -0.1 * load + 0.55 * hip;
  rot(b.armL, 0.24 * late, 0, 0.20 * late);
};
/** 匿影死士: crouched low, the dagger reversed along the forearm; the cut: a rising backhand */
const shadePose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'r', hunch: 0.3 }); bend(b, 0.3); rot(b.armR, 0.2, 0, -0.3); if (shared(b, a, off)) return;
  const { load, hit, hip, late } = beats(b, a!);
  rot(b.armR, 0.6 * load - 1.6 * hit, 0, -0.6 * load + 0.9 * hit); rot(b.foreR, 0.4 * load, 0, 0); rot(b.spine, 0.1 * load - 0.2 * hit, -0.5 * load + 0.7 * hit, 0); off.z = 0.5 * hip;
  lungeLegs(b, 0.5 * hip); rot(b.armL, 0.38 * late, 0, 0.33 * late);
};
/** 百辟刀卫 and 崔玄 with the blade: the drawing cut — the blade low at the left hip, then torn across to the right at waist height */
const drawCut = (b: Bones, a: Action, off: THREE.Vector3) => {
  const { load, hit, hip, late } = beats(b, a, 'melee', true);
  rot(b.armR, -0.9 * load - 1.1 * hit, 0, 0.9 * load - 1.2 * hit); rot(b.foreR, 0.9 * load + 0.2 * hit, 0, 0); rot(b.weapon, 0.6 * load, 0.5 * load - 0.8 * hit, 0);
  rot(b.armL, -0.6 * load + 0.38 * late, 0, 0.3 * load + 0.26 * late); rot(b.foreL, -0.8 * load, 0, 0);
  rot(b.spine, 0.15 * load + 0.2 * hit, 0.45 * load - 0.55 * hit, 0); bend(b, 0.3 * load + 0.2 * hip); lungeLegs(b, hip); off.z = 0.5 * hip;
};
const guardPose: PoseFn = (b, t, a, off, self) => { base(b, t, { armed: 'r' }); if (shared(b, a, off)) return; drawCut(b, a!, off); };
/** 击筑客: the 筑 held level across the body on the left forearm, the striker in the right; a stroke (cast): the arm raised, the striker
 *  brought down onto the strings */
const zhuPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'none', hunch: 0.06 }); rot(b.armL, -0.5, 0, -0.15); rot(b.foreL, -1.0, 0, 0); rot(b.armR, -0.7, 0, 0.3); rot(b.foreR, -0.8, 0, 0);
  if (!shared(b, a, off)) {
    const { load, hit, chest } = beats(b, a!, 'cast');
    rot(b.armR, -0.6 * load + 0.5 * hit, 0, 0); rot(b.spine, 0.1 * chest, 0, 0);
  }
  levelOffhand(b);
};
/** 崔玄: upright, unhurried, the fan held loose at the chest, the left hand behind his back; the fan stroke a flick across; with the
 *  blade the drawing cut; the lunge a long straight 一字 thrust */
const cuiPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, { armed: 'r', hunch: -0.04 }); rot(b.armR, -0.5, 0, 0.2); rot(b.foreR, -0.9, 0, 0); rot(b.armL, 0.5, 0, 0.25); rot(b.foreL, -1.4, 0, 0);
  if (shared(b, a, off)) return;
  const atk = a!.data.atk;
  if (a!.name === 'cast') {
    const { load, hit, late } = beats(b, a!, 'cast', true);
    rot(b.armR, -0.7 * load - 1.2 * hit, 0, 0.3 * hit); rot(b.foreR, -0.2 * load + 0.5 * hit, 0, 0);
    rot(b.armL, -0.35 * load, 0, 0.42 * late); return;
  }
  if (atk === 'fan') {
    const { load, hit, hip } = beats(b, a!, 'melee', true);
    rot(b.armR, -1.0 * load - 0.3 * hit, 0, 0.9 * load - 1.0 * hit); rot(b.spine, 0, 0.3 * load - 0.3 * hit, 0);
    lungeLegs(b, 0.5 * hip); return;
  }
  if (atk === 'lunge') {
    const { load, hit, hip } = beats(b, a!, 'melee', true);
    rot(b.armR, 0.4 * load - 1.4 * hit, 0, 0); rot(b.foreR, -0.4 * load + 1.2 * hit, 0, 0); rot(b.weapon, 0.6 * hit, 0, 0);
    rot(b.spine, 0.3 * hit, 0, 0); bend(b, 0.25 * load); lungeLegs(b, hip); off.z = 0.8 * hip; return;
  }
  drawCut(b, a!, off);
};

const HOOKS: Record<string, PoseFn> = {
  wl_spear: spearPose, wl_spear_b: spearPose, wl_chain: chainPose, wl_chain_e: chainPose, wl_oil: oilPose, wl_oil_e: oilPose, wl_xbow: xbowPose, wl_xbow_e: xbowPose,
  wl_diver: diverPose, wl_diver_e: diverPose, wl_shield: shieldPose, wl_shield_e: shieldPose, wl_boss: zhouPose,
  cx_club: clubPose, cx_club_b: clubPose, cx_sword: swordPose, cx_sword_e: swordPose, cx_shade: shadePose, cx_shade_e: shadePose,
  cx_guard: guardPose, cx_guard_e: guardPose, cx_zhu: zhuPose, cx_zhu_e: zhuPose, cx_boss: cuiPose,
};
for (const [id, fn] of Object.entries(HOOKS)) POSE_HOOKS[id] = fn;
