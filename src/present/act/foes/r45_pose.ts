// 第四关、第五关敌人的动作（wp/regB）：每个模型自己的 POSE_HOOKS（待机、跑、挨打、吼，和各自的出招姿势）。
// 骨骼照黄巾兵（r45_models.ts）：+z 朝前，+x 是它自己的左手边；arm x < 0 = 手臂往前抬；fore x > 0 = 肘往里弯。
// 出招的姿势按 enemy.ts startAttack 给的 Action（名字 attack / cast，data.atk = 哪一招，k = 0..1，at = 打击帧的位置）：
//   起手（k < at）往后蓄、慢；打击帧前后两三帧打出去；之后慢收。和黄巾兵一样，预警长满的那一帧就是打击帧。
import { rot, mov, curve, snap, type Action, type Bone } from '../../actors/rig';
import { POSE_HOOKS, type PoseFn } from '../../bestiary/poseHooks';
import type * as THREE from 'three';

type Bones = Record<string, Bone>;
/** the bob of the idle (breath) and the run cycle the bestiary walks with (BattleActor sets running / runK) */
function base(b: Bones, t: number, self: unknown, o: { hunch?: number; armed?: 'r' | 'two' | 'bow' | 'none'; still?: boolean } = {}) {
  const s = self as { runK?: number; running?: boolean; dead?: boolean }, br = Math.sin(t * 2.2);
  const run = s.running ? 1 : 0;
  mov(b.hips, 0, br * 0.015, 0);
  rot(b.spine, 0.06 + (o.hunch ?? 0) + br * 0.02, Math.sin(t * 0.6) * 0.04, 0); rot(b.chest, br * 0.02, 0, 0);
  rot(b.neck, -0.04 - (o.hunch ?? 0) * 1.1, Math.sin(t * 0.5) * 0.1, 0);
  // arms: the empty left hangs loose (a little bend at the elbow), the right holds its weapon forward
  rot(b.armL, 0.05 + br * 0.03, 0, 0.1); rot(b.foreL, -0.25, 0, 0);
  if (o.armed === 'r') { rot(b.armR, -0.35, 0, -0.08); rot(b.foreR, -1.2, 0, 0); rot(b.weapon, -0.4, 0, 0); }
  else if (o.armed === 'two') { rot(b.armR, -0.55, 0, -0.1); rot(b.foreR, -1.0, 0, 0); rot(b.armL, -0.55, 0, 0.1); rot(b.foreL, -1.0, 0, 0); rot(b.weapon, -0.2, 0, 0); }
  else { rot(b.armR, 0.05 + br * 0.03, 0, -0.1); rot(b.foreR, -0.25, 0, 0); }
  if (run && !o.still) {
    const ph = Math.sin(t * 11);
    mov(b.hips, 0, Math.abs(ph) * 0.04, 0); rot(b.spine, 0.2, 0, 0); rot(b.legL, ph * 0.8, 0, 0); rot(b.legR, -ph * 0.8, 0, 0);
    rot(b.shinL, Math.max(0, -ph) * 0.9, 0, 0); rot(b.shinR, Math.max(0, ph) * 0.9, 0, 0);
    if (o.armed !== 'two') rot(b.armL, -ph * 0.6, 0, 0);
  }
}
/** the shared non-attack actions: hurt (a stagger back), roar (chest up, arms out), cast without data (a short gesture) */
function shared(b: Bones, a: Action | null, off: THREE.Vector3): boolean {
  if (!a) return true;
  const k = a.k;
  if (a.name === 'hurt') {
    const p = Math.min(1.6, (a.data.power as number) || 1), s = snap(k, [[0, 0], [0.12, 1], [1, 0]]) * p;
    off.z = -0.3 * s; rot(b.spine, -0.4 * s, 0, 0.1 * s); rot(b.neck, -0.3 * s, 0, 0); rot(b.chest, -0.2 * s, 0, 0); rot(b.armL, -0.4 * s, 0, 0.5 * s); rot(b.armR, -0.3 * s, 0, -0.4 * s);
    return true;
  }
  if (a.name === 'roar') {
    const s = curve(k, [[0, 0], [0.3, 1], [0.8, 1], [1, 0]]), sh = Math.sin(k * 60) * 0.03 * s;
    rot(b.spine, -0.35 * s, sh, 0); rot(b.neck, -0.4 * s, 0, 0); rot(b.jaw, 0.6 * s, 0, 0); rot(b.armL, -1.4 * s, 0, 0.9 * s); rot(b.armR, -1.2 * s, 0, -0.9 * s); off.y += 0.12 * s;
    return true;
  }
  return false;
}
/** a deeper stance without sliding the feet (both knees bend, the hips drop) */
const bend = (b: Bones, d: number) => { rot(b.legL, -d, 0, 0); rot(b.shinL, 2 * d, 0, 0); rot(b.footL, -d, 0, 0); rot(b.legR, -d * 0.8, 0, 0); rot(b.shinR, 1.6 * d, 0, 0); rot(b.footR, -d * 0.8, 0, 0); };
/** the lunge forward on the blow: the left foot out, the right leg pushed straight */
const lungeLegs = (b: Bones, s: number) => { rot(b.legL, -0.55 * s, 0, 0); rot(b.shinL, 0.35 * s, 0, 0); rot(b.legR, 0.4 * s, 0, 0); };
/** windup / strike / settle curves round the impact frame `at` */
function beats(a: Action) { const k = a.k, at = a.at; return { load: curve(k, [[0, 0], [at * 0.85, 1], [at, 0.15], [1, 0]]), hit: snap(k, [[0, 0], [at * 0.9, 0], [at + 0.04, 1], [Math.min(0.98, at + 0.28), 1], [1, 0]]), k, at }; }

// ------------------------------------------------------------------ the region-four foes
/** 执矛水卒: the spear held level; the thrust — pulled back to the hip, the whole body driven forward along the haft */
const spearPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, self, { armed: 'two' }); if (shared(b, a, off)) return;
  const { load, hit } = beats(a!);
  rot(b.armR, 0.5 * load - 0.9 * hit, 0, 0); rot(b.foreR, -0.6 * load + 0.9 * hit, 0, 0); rot(b.armL, 0.2 * load - 1.0 * hit, 0, 0); rot(b.foreL, -0.5 * load + 0.7 * hit, 0, 0);
  rot(b.spine, -0.1 * load + 0.35 * hit, 0.25 * load - 0.2 * hit, 0); bend(b, 0.15 * load); lungeLegs(b, hit); off.z = -0.15 * load + 0.7 * hit;
};
/** 拽索手: the chain whirled overhead (the right arm up, circling) — the low sweep: down and round (the body turning a full half),
 *  the throw: the arm whipped forward and down */
const chainPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, self, { armed: 'none', hunch: 0.05 }); if (shared(b, a, off)) return;
  const { load, hit, k } = beats(a!), pull = a!.data.atk === 'pull', spin = Math.sin(t * 16);
  if (pull) {
    rot(b.armR, -2.6 * load - 1.2 * hit, spin * 0.3 * load, 0.2 * load); rot(b.foreR, 0.3 * load, 0, 0);
    rot(b.spine, -0.2 * load + 0.4 * hit, 0.4 * load - 0.3 * hit, 0); lungeLegs(b, hit); off.z = 0.3 * hit;
  } else {
    const turn = curve(k, [[0, 0], [a!.at * 0.9, -0.6], [a!.at + 0.12, 1.2], [1, 0]]);
    b.hips.rotation.y += turn; rot(b.armR, -1.4 * load - 0.2 * hit, 0, -1.2 * hit); rot(b.foreR, 0.2, 0, 0);
    bend(b, 0.3 * load + 0.45 * hit); rot(b.spine, 0.3 * hit, 0, 0);
  }
};
/** 掷火卒: the jar drawn back low behind the right hip, then lobbed up and over */
const oilPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, self, { armed: 'r', hunch: 0.08 }); if (shared(b, a, off)) return;
  const { load, hit } = beats(a!);
  rot(b.armR, 0.9 * load - 2.6 * hit, 0, -0.2 * load); rot(b.foreR, 0.3 * load - 0.4 * hit, 0, 0);
  rot(b.spine, 0.15 * load - 0.2 * hit, -0.4 * load + 0.3 * hit, 0); rot(b.armL, -0.6 * load - 0.8 * hit, 0, 0.3); bend(b, 0.25 * load); off.y += 0.05 * hit;
};
/** 楼船弩士: the crossbow raised to the cheek (both hands), held; on the shot a kick back; spanning: kneeling, the foot in the stirrup */
const xbowPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, self, { armed: 'two' }); if (shared(b, a, off)) return;
  const { k, at } = beats(a!), aim = curve(k, [[0, 0], [0.25, 1], [at + 0.05, 1], [1, 0]]), kick = snap(k, [[0, 0], [at, 0], [at + 0.05, 1], [at + 0.25, 0], [1, 0]]);
  if (a!.name === 'cast') { const kn = curve(k, [[0, 0], [0.5, 1], [1, 0]]); bend(b, 0.6 * kn); rot(b.spine, 0.5 * kn, 0, 0); rot(b.armR, -0.4 * kn, 0, 0); rot(b.armL, -0.4 * kn, 0, 0); off.y -= 0.25 * kn; return; }
  rot(b.armR, -1.25 * aim, 0, 0.15 * aim); rot(b.foreR, 0.2 * aim, 0, 0); rot(b.armL, -1.35 * aim, 0, -0.25 * aim); rot(b.foreL, 0.25 * aim, 0, 0);
  rot(b.weapon, 0.6 * aim, 0, 0); rot(b.spine, -0.05 * aim - 0.15 * kick, 0, 0); rot(b.neck, 0.1 * aim, 0, 0); off.z = -0.12 * kick;
};
/** 没水鬼: low and crouched, the hook hand back; the cut: a quick cross-body slash */
const diverPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, self, { armed: 'r', hunch: 0.25 }); bend(b, 0.25); if (shared(b, a, off)) return;
  const { load, hit } = beats(a!);
  rot(b.armR, -1.4 * load - 0.6 * hit, 0, -0.8 * load + 1.1 * hit); rot(b.foreR, 0.6 * load, 0, 0);
  rot(b.spine, 0.1 * hit, -0.5 * load + 0.6 * hit, 0); lungeLegs(b, hit * 0.6); off.z = 0.4 * hit;
};
/** 执楯刀士: the shield up on the left (the arm across in front), the blade low; the rush: head down behind the shield; the cut: over it */
const shieldPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, self, { armed: 'r' }); rot(b.armL, -0.9, 0.3, -0.3); rot(b.foreL, -0.9, 0, 0); if (shared(b, a, off)) return;
  const { load, hit } = beats(a!), rush = a!.data.atk === 'lunge';
  if (rush) { rot(b.spine, 0.4 * load + 0.3 * hit, 0, 0); rot(b.neck, -0.3 * load, 0, 0); rot(b.armL, -0.3 * hit, 0, 0); bend(b, 0.3 * load); lungeLegs(b, hit); }
  else { rot(b.armR, -2.3 * load + 1.2 * hit, 0, 0.2 * load); rot(b.foreR, 0.6 * load + 0.6 * hit, 0, 0); rot(b.spine, -0.15 * load + 0.3 * hit, 0.2 * load, 0); lungeLegs(b, hit * 0.7); off.z = 0.35 * hit; }
};
/** 周黯: an old man's stoop, the hands in the wide sleeves; the signal flag raised (cast), the sleeve-bow pointed (attack) */
const zhouPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, self, { armed: 'r', hunch: 0.12 }); rot(b.armL, -0.4, 0, 0.1); rot(b.foreL, -0.9, 0, 0);
  if (shared(b, a, off)) return;
  const k = a!.k;
  if (a!.name === 'cast' || a!.data.atk == null) { const s = curve(k, [[0, 0], [0.3, 1], [0.8, 1], [1, 0]]); rot(b.armL, -1.8 * s, 0, 0.2 * s); rot(b.foreL, 0.3 * s, 0, 0); rot(b.spine, -0.1 * s, 0, 0); return; }
  const { load, hit } = beats(a!);
  if (a!.data.atk === 'lob') { rot(b.armR, 0.6 * load - 2.2 * hit, 0, 0); return; }
  rot(b.armR, -1.4 * Math.max(load, hit), 0, 0.1); rot(b.foreR, 0.1, 0, 0); rot(b.spine, -0.1 * hit, 0, 0); off.z = -0.2 * hit;
};

// ------------------------------------------------------------------ the region-five foes
/** 持杖僮奴: the staff in both hands across the body; the whack: raised overhead, brought down */
const clubPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, self, { armed: 'two' }); if (shared(b, a, off)) return;
  const { load, hit } = beats(a!);
  rot(b.armR, -2.5 * load + 1.3 * hit, 0, 0); rot(b.foreR, 0.5 * load + 0.4 * hit, 0, 0); rot(b.armL, -2.4 * load + 1.3 * hit, 0, 0); rot(b.foreL, 0.5 * load + 0.4 * hit, 0, 0);
  rot(b.weapon, 0.3 * load + 0.9 * hit, 0, 0); rot(b.spine, -0.25 * load + 0.4 * hit, 0, 0); lungeLegs(b, hit * 0.6); off.z = 0.3 * hit;
};
/** 门下剑客: the sword upright in front of the face (the guard: the 中平 of the Han sword), the left hand in the sword mudra behind;
 *  the thrust: the arm straight out, the body after it */
const swordPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, self, { armed: 'r' }); rot(b.armR, -0.7, 0, 0.25); rot(b.foreR, -0.6, 0, 0); rot(b.weapon, -0.8, 0, 0); rot(b.armL, 0.4, 0, 0.4); rot(b.foreL, -1.1, 0, 0);
  if (shared(b, a, off)) return;
  const { load, hit } = beats(a!);
  rot(b.armR, 0.5 * load - 0.9 * hit, 0, -0.25 * hit); rot(b.foreR, -0.5 * load + 1.1 * hit, 0, 0); rot(b.weapon, 0.8 * hit, 0, 0);
  rot(b.spine, -0.05 * load + 0.25 * hit, 0.3 * load - 0.25 * hit, 0); bend(b, 0.15 * load); lungeLegs(b, hit); off.z = -0.1 * load + 0.55 * hit;
};
/** 匿影死士: crouched low, the dagger reversed along the forearm; the cut: a rising backhand */
const shadePose: PoseFn = (b, t, a, off, self) => {
  base(b, t, self, { armed: 'r', hunch: 0.3 }); bend(b, 0.3); rot(b.armR, 0.2, 0, -0.3); if (shared(b, a, off)) return;
  const { load, hit } = beats(a!);
  rot(b.armR, 0.6 * load - 1.6 * hit, 0, -0.6 * load + 0.9 * hit); rot(b.foreR, 0.4 * load, 0, 0); rot(b.spine, 0.1 * load - 0.2 * hit, -0.5 * load + 0.7 * hit, 0); off.z = 0.5 * hit;
};
/** 百辟刀卫 and 崔玄 with the blade: the drawing cut — the blade low at the left hip, then torn across to the right at waist height */
const drawCut = (b: Bones, a: Action, off: THREE.Vector3) => {
  const { load, hit } = beats(a);
  rot(b.armR, -0.9 * load - 1.1 * hit, 0, 0.9 * load - 1.2 * hit); rot(b.foreR, 0.9 * load + 0.2 * hit, 0, 0); rot(b.weapon, 0.6 * load, 0.5 * load - 0.8 * hit, 0);
  rot(b.armL, -0.6 * load, 0, 0.3 * load); rot(b.foreL, -0.8 * load, 0, 0);
  rot(b.spine, 0.15 * load + 0.2 * hit, 0.45 * load - 0.55 * hit, 0); bend(b, 0.3 * load + 0.2 * hit); lungeLegs(b, hit); off.z = 0.5 * hit;
};
const guardPose: PoseFn = (b, t, a, off, self) => { base(b, t, self, { armed: 'r' }); if (shared(b, a, off)) return; drawCut(b, a!, off); };
/** 击筑客: the 筑 held across the left arm, the striker in the right; a stroke (cast): the arm raised, the striker brought down */
const zhuPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, self, { armed: 'none', hunch: 0.06 }); rot(b.armL, -0.9, 0, -0.2); rot(b.foreL, -1.2, 0, 0); rot(b.armR, -0.7, 0, 0.3); rot(b.foreR, -0.8, 0, 0);
  if (shared(b, a, off)) return;
  const s = snap(a!.k, [[0, 0], [0.3, -1], [0.45, 1], [0.7, 0.4], [1, 0]]); rot(b.armR, -0.6 * Math.max(0, -s) + 0.5 * Math.max(0, s), 0, 0); rot(b.spine, 0.1 * Math.max(0, s), 0, 0);
};
/** 崔玄: upright, unhurried, the fan held loose at the chest, the left hand behind his back; the fan stroke a flick across; with the
 *  blade the drawing cut; the lunge a long straight 一字 thrust */
const cuiPose: PoseFn = (b, t, a, off, self) => {
  base(b, t, self, { armed: 'r', hunch: -0.04 }); rot(b.armR, -0.5, 0, 0.2); rot(b.foreR, -0.9, 0, 0); rot(b.armL, 0.5, 0, 0.25); rot(b.foreL, -1.4, 0, 0);
  if (shared(b, a, off)) return;
  const atk = a!.data.atk;
  if (a!.name === 'cast' || atk == null) { const s = curve(a!.k, [[0, 0], [0.3, 1], [0.7, 1], [1, 0]]); rot(b.armR, -1.2 * s, 0, 0.3 * s); rot(b.foreR, 0.5 * s, 0, 0); rot(b.neck, -0.1 * s, 0, 0); return; }
  if (atk === 'fan') { const { load, hit } = beats(a!); rot(b.armR, -1.0 * load - 0.3 * hit, 0, 0.9 * load - 1.0 * hit); rot(b.spine, 0, 0.3 * load - 0.3 * hit, 0); return; }
  if (atk === 'lunge') { const { load, hit } = beats(a!); rot(b.armR, 0.4 * load - 1.4 * hit, 0, 0); rot(b.foreR, -0.4 * load + 1.2 * hit, 0, 0); rot(b.weapon, 0.6 * hit, 0, 0); rot(b.spine, 0.3 * hit, 0, 0); bend(b, 0.25 * load); lungeLegs(b, hit); off.z = 0.8 * hit; return; }
  drawCut(b, a!, off);
};

const HOOKS: Record<string, PoseFn> = {
  wl_spear: spearPose, wl_spear_b: spearPose, wl_chain: chainPose, wl_chain_e: chainPose, wl_oil: oilPose, wl_oil_e: oilPose, wl_xbow: xbowPose, wl_xbow_e: xbowPose,
  wl_diver: diverPose, wl_diver_e: diverPose, wl_shield: shieldPose, wl_shield_e: shieldPose, wl_boss: zhouPose,
  cx_club: clubPose, cx_club_b: clubPose, cx_sword: swordPose, cx_sword_e: swordPose, cx_shade: shadePose, cx_shade_e: shadePose,
  cx_guard: guardPose, cx_guard_e: guardPose, cx_zhu: zhuPose, cx_zhu_e: zhuPose, cx_boss: cuiPose,
};
for (const [id, fn] of Object.entries(HOOKS)) POSE_HOOKS[id] = fn;
