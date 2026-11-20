import { Box3, Euler, Mesh, Quaternion, Vector3 } from 'three';
import { curve, mov, rot, type Action, type Bone } from '../../actors/rig';
import type { BattleActor } from '../../bestiary/battle';
import { attackBeats, attackBody, limitAnatomicalWrist } from './foe_motion';
import { MOTION_TUNE } from '../motionTune';

export { limitAnatomicalWrist };

type Bones = Record<string, Bone>;
type Side = 'L' | 'R';
const down = new Vector3(0, -1, 0), delta = new Vector3(), pole = new Vector3(), joint = new Vector3();
const target = new Vector3(), offset = new Vector3(), point = new Vector3();
const parentQ = new Quaternion(), localQ = new Quaternion(), facing = new Quaternion(), angles = new Euler();
const identity = new Quaternion();
const _chestLocal = new Vector3(), _chestBoxes = new WeakMap<Bone, Box3 | null>();

function getChestKeepOut(chest: Bone | undefined): Box3 | null {
  if (!chest) return null;
  if (_chestBoxes.has(chest)) return _chestBoxes.get(chest)!;
  const box = new Box3();
  let has = false;
  for (const ch of chest.children) {
    if (ch instanceof Mesh && ch.geometry) {
      ch.geometry.computeBoundingBox();
      if (ch.geometry.boundingBox && !ch.geometry.boundingBox.isEmpty()) {
        const b = ch.geometry.boundingBox.clone();
        b.min.add(ch.position); b.max.add(ch.position);
        box.union(b); has = true;
      }
    }
  }
  const res = has ? box : null;
  _chestBoxes.set(chest, res);
  return res;
}

/** Keep a wrist/hand IK target cleanly outside the finalized enemy's actual voxel chest box (in b.root-local frame)
 *  so heavy armor breastplates NEVER swallow hands, without detaching support hands from weapon shafts. */
export function clearTorso(b: Bones, side: Side, rootPoint: Vector3, weight = 1) {
  if (weight <= 0.01 || !b.chest || !b.root) return;
  const box = getChestKeepOut(b.chest);
  if (!box) return;
  b.root.updateMatrixWorld(true);
  b.chest.worldToLocal(b.root.localToWorld(_chestLocal.copy(rootPoint)));
  const padX = 0.028, padZ = 0.016, padBack = 0.018;
  const minX = box.min.x - padX, maxX = box.max.x + padX;
  const minY = box.min.y - 0.02, maxY = box.max.y + 0.015;
  const minZ = box.min.z - padBack, maxZ = box.max.z + padZ;
  if (_chestLocal.y < minY || _chestLocal.y > maxY) return;
  if (_chestLocal.x > minX && _chestLocal.x < maxX && _chestLocal.z > minZ && _chestLocal.z < maxZ) {
    const dFront = maxZ - _chestLocal.z;
    const dSide = side === 'L' ? (maxX - _chestLocal.x) : (_chestLocal.x - minX);
    const midZ = (box.min.z + box.max.z) * 0.5;
    if (dSide <= dFront * 1.6 && _chestLocal.z < box.max.z - 0.01) {
      _chestLocal.x += (side === 'L' ? dSide : -dSide) * weight;
    } else if (_chestLocal.z >= midZ - 0.03 || dFront <= dSide) {
      _chestLocal.z += dFront * weight;
    } else {
      _chestLocal.x += (side === 'L' ? dSide : -dSide) * weight;
    }
    b.root.worldToLocal(b.chest.localToWorld(rootPoint.copy(_chestLocal)));
  }
}

function modelRotation(b: Bones, bone: Bone, out: Quaternion) {
  out.copy(bone.quaternion);
  for (let p = bone.parent; p && p !== b.root; p = p.parent) out.premultiply(p.quaternion);
  return out;
}

/** Solve a two-link limb in its parent's frame, keeping both segment lengths and preventing shoulder-crunch collapse. */
function reach(b: Bones, upper: Bone, lower: Bone, end: Bone, goal: Vector3, weight: number, isArm = false, tight = false) {
  b.root.updateMatrixWorld(true);
  upper.parent!.worldToLocal(b.root.localToWorld(target.copy(goal)));
  delta.copy(target).sub(upper.position);
  const a = lower.position.length(), c = end.position.length();
  // Natural max ~140 deg elbow flexion (-1.54) — prevents 180-deg shoulder-crunch collapse while keeping 2H spear/hammer shafts exact!
  const minD = isArm ? Math.sqrt(Math.max(1e-6, a * a + c * c - (tight ? 1.58 : 1.54) * a * c)) : Math.abs(a - c) + 0.0001;
  const d = Math.min(a + c - 0.0001, Math.max(minD, delta.length()));
  delta.normalize();
  pole.addScaledVector(delta, -pole.dot(delta));
  if (pole.lengthSq() < 1e-6) pole.set(0, -1, isArm ? -0.5 : 0.5).addScaledVector(delta, -delta.y * -1);
  pole.normalize();
  const along = (a * a - c * c + d * d) / (2 * d);
  joint.copy(delta).multiplyScalar(along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
  localQ.setFromUnitVectors(down, target.copy(joint).normalize());
  upper.quaternion.slerp(localQ, weight);
  delta.multiplyScalar(d).sub(joint).applyQuaternion(localQ.invert()).normalize();
  lower.quaternion.slerp(localQ.setFromUnitVectors(down, delta), weight);
}

/** Aim the palm and its prop together. Coordinates are metres in the facing frame.
 * The grip joint's actual offset from the wrist differs between these voxel rigs. */
export function grip(b: Bones, side: Side, x: number, y: number, z: number,
  pitch: number, yaw: number, weight: number, roll = 0, keepOnShaft = false) {
  const arm = b['arm' + side], fore = b['fore' + side], hand = b['hand' + side];
  const prop = side === 'R' ? b.weapon : b.offhand;
  // If an earlier grip/hold call in this frame shifted prop.position via wrist limiting, restore rest offset first
  if (prop?.userData?._wShifted && prop.rest) {
    prop.position.copy(prop.rest.p);
    prop.userData._wShifted = false;
  }
  facing.setFromEuler(angles.set(pitch, yaw, roll, 'YXZ'));
  // Blend from the posed wrist on entry and back into the ready stance on recovery.
  modelRotation(b, prop, parentQ).slerp(facing, weight);
  prop.quaternion.slerp(identity, weight);
  facing.copy(parentQ).multiply(localQ.copy(prop.quaternion).invert());
  point.set(x, y, z).sub(offset.copy(prop.position).applyQuaternion(facing));
  // Keep hand clear of thickened chest/cuirass (skip on shaft-locked support hands so 2H grips stay exact on the haft)
  if (!keepOnShaft) clearTorso(b, side, point, weight);
  // Automatic scapular protraction for broad-chested / short-armed voxel rigs:
  // when a hand reaches forward or across the chest midline, slide the shoulder forward (+Z) so arms clear thick pecs naturally!
  const sh = b['sh' + side];
  if (sh?.rest && b.chest && weight > 0.05 && sh.position.distanceToSquared(sh.rest.p) < 1e-6) {
    b.root.updateMatrixWorld(true);
    b.chest.worldToLocal(b.root.localToWorld(_chestLocal.copy(point)));
    const fwdNeed = Math.max(0, Math.min(1, (_chestLocal.z - 0.14) / 0.42));
    const crossNeed = side === 'R'
      ? Math.max(0, Math.min(1, (_chestLocal.x + 0.22) / 0.45))
      : Math.max(0, Math.min(1, (0.22 - _chestLocal.x) / 0.45));
    const proZ = (0.065 * fwdNeed + 0.055 * crossNeed) * weight;
    if (proZ > 0.004) mov(sh, 0, 0, proZ);
  }
  // Anatomical elbow pole: outward (±X), downward (-Y), and naturally BACKWARD (-Z) — NEVER flamingo-forward!
  // When a hand reaches far across the chest midline (e.g., brute two-hand grip), elbow arcs cleanly around the ribcage.
  const cross = side === 'R' ? Math.max(0, point.x + 0.28) : Math.max(0, 0.28 - point.x);
  pole.set((side === 'R' ? -1.45 : 1.45) * (1 + cross * 1.9), -0.55, -0.26 + Math.min(0.68, cross * 1.55));
  reach(b, arm, fore, hand, point, weight, true, keepOnShaft);
  hand.quaternion.copy(modelRotation(b, fore, parentQ).invert()).multiply(facing);
  limitAnatomicalWrist(hand, prop, 0.96);
}

/** Place the other fist at a particular point on the already posed shaft / stock. */
export function support(b: Bones, along: number, pitch: number, yaw: number, weight: number, across = 0, roll = 0) {
  // Refresh the right arm & weapon world transforms from this frame so the support hand never lags a frame behind
  b.root.updateMatrixWorld(true);
  b.root.worldToLocal(b.weapon.localToWorld(point.set(across, 0, along)));
  grip(b, 'L', point.x, point.y, point.z, pitch, yaw, weight, roll, true);
}

/** Plant both soles, with the lead foot lifting as it travels into the step. */
export function stance(b: Bones, weight: number, step = 0, lift = 0, lead: Side = 'L') {
  for (const side of ['L', 'R'] as const) {
    const thigh = b['leg' + side], shin = b['shin' + side], foot = b['foot' + side];
    point.set(thigh.position.x + (side === 'L' ? 0.045 : -0.045) * weight, 0.14 + (side === lead ? lift : 0),
      (side === lead ? 0.05 + step : -0.07) * weight);
    pole.set(side === 'L' ? 0.12 : -0.12, 0, 1);
    reach(b, thigh, shin, foot, point, 1);
    foot.quaternion.copy(modelRotation(b, shin, parentQ).invert());
  }
}

/** The weapon keeps its follow-through for a beat before it blends back to idle. */
export function engagement(a: Action) {
  return curve(a.k, [[0, 0], [a.at * 0.52, 1], [a.at + (1 - a.at) * 0.36, 1], [1, 0]]);
}

export function followThrough(a: Action) {
  const impact = a.dur * a.at;
  return curve(a.t, [[impact, 0], [impact + Math.min(0.12, (a.dur - impact) * 0.32), 1]]);
}

/** Fist position and weapon orientation in the actor's facing frame. The
 * weapon's edge follows its roll around the haft, independently of its pitch. */
export type GripKey = readonly [x: number, y: number, z: number, pitch: number, yaw: number, roll?: number];
type AttackBeats = ReturnType<typeof attackBeats>;

/** The weapon passes through the hit key at Action.at, keeps moving past the
 * target, then blends back to guard. The arm follows the grip for all three.
 * Optional arcOut bows sweeping swings outward (+z) during the strike arc. */
export function weaponArc(b: Bones, a: Action, beats: AttackBeats, side: Side,
  load: GripKey, impact: GripKey, follow: GripKey, weight = engagement(a), arcOut = 0) {
  const struck = a.t >= a.dur * a.at;
  const from = struck ? impact : load, to = struck ? follow : impact;
  const u = struck ? followThrough(a) : beats.hit;
  const mix = (x: number, y: number) => x + (y - x) * u;
  const bow = !struck && arcOut > 0 ? Math.sin(Math.PI * Math.min(1, Math.max(0, u))) * arcOut * MOTION_TUNE.arcOut : 0;
  const sh = struck ? beats.shudder * 0.032 : 0;
  const pitch = mix(from[3], to[3]) + sh;
  const yaw = mix(from[4], to[4]) + sh * 0.6;
  const roll = mix(from[5] ?? 0, to[5] ?? 0);
  grip(b, side, mix(from[0], to[0]), mix(from[1], to[1]), mix(from[2], to[2]) + bow, pitch, yaw, weight, roll);
  return { pitch, yaw, roll };
}

/** The short rushes share one straight line. The step and hips bring the
 * shoulder forward so the hand can draw back without losing extension.
 * Adapts height & width to each rig's actual shoulder geometry (e.g. shorter hj_mob vs taller xp_conscript)
 * so the weapon arm never jams into the cheek and the off-hand stays in an athletic guard instead of flailing behind. */
export function shortThrust(actor: BattleActor, a: Action, height: number, twoHanded = false) {
  const b = actor.bones;
  const motion = attackBeats(a), w = engagement(a);
  const { load, hit, hip, chest } = motion;
  const drive = Math.min(1, hit);
  const shY = b.armR?.rest ? (b.hips.rest!.p.y + b.spine.rest!.p.y + b.chest.rest!.p.y + b.shR.rest!.p.y) : 1.30;
  const shX = Math.abs(b.shR?.rest?.p.x ?? 0.42);
  // Keep thrust at natural rib/waist level (well below the cheek/shoulder even on short 1.3m mob rigs!)
  const thrustY = Math.min(height, shY - 0.22);
  const reach = twoHanded ? 0.44 : 0.48, lane = twoHanded ? 1.8 : 1.6;
  const tip = (reach + (actor.def.tip ?? 0) * actor.cx) * actor.root.scale.z;
  attackBody(b, motion, 'melee', 0.55);
  // Replace the generic attack's visual lunge. It pushed the entire shaft
  // past the short lane before the fist had finished extending.
  actor.off.z = -0.07 * load + Math.min(0, lane - 0.11 - tip) * w;
  mov(b.hips, 0, -0.06 * hip, -0.05 * load + 0.16 * hip);
  rot(b.spine, 0.16 * chest, twoHanded ? -0.60 * w : -0.26 * load + 0.30 * chest, 0);
  rot(b.neck, -0.10 * chest, twoHanded ? 0.42 * w : 0.18 * load - 0.22 * chest, 0);
  stance(b, w, 0.22 * hip);
  const yaw = 0.08 * drive;
  // Draw cleanly outside the right flank (never buried inside shoulder/cheek), then punch straight down the lane
  const rx = -(shX + 0.06) + (twoHanded ? 0.16 : 0.14) * drive;
  const rz = 0.02 * (1 - drive) + reach * drive;
  grip(b, 'R', rx, thrustY, rz, 0, yaw, w);
  if (twoHanded) support(b, 0.25 - 0.10 * drive, 0, yaw, w);
  // Athletic off-hand counter-balance: leads forward-low on windup, pulls cleanly beside left hip on thrust (NEVER chicken-wing behind!)
  else grip(b, 'L', shX + 0.05, thrustY - 0.04 + 0.05 * load, 0.22 * (1 - drive) + 0.02 * drive, -0.35, 0.18 * (1 - drive), w);
}

/** Each half is a single straight strip from a fixed limb tip to the moving nock. */
export function drawString(b: Bones, nock: Vector3, axis: 'x' | 'z') {
  for (const name of ['stringA', 'stringB']) {
    const strip = b[name], end = b[name === 'stringA' ? 'stringB' : 'stringA'];
    delta.copy(nock).sub(strip.position);
    target.copy(end.position).sub(strip.position);
    const half = target.length() / 2;
    strip.scale[axis] = delta.length() / half;
    strip.quaternion.setFromUnitVectors(target.normalize(), delta.normalize());
  }
}
