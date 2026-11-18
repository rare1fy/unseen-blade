import { Euler, Quaternion, Vector3 } from 'three';
import { curve, mov, rot, type Action, type Bone } from '../../actors/rig';
import { attackBeats, attackBody } from './foe_motion';

type Bones = Record<string, Bone>;
type Side = 'L' | 'R';
const down = new Vector3(0, -1, 0), delta = new Vector3(), pole = new Vector3(), joint = new Vector3();
const target = new Vector3(), offset = new Vector3(), point = new Vector3();
const parentQ = new Quaternion(), localQ = new Quaternion(), facing = new Quaternion(), angles = new Euler();
const identity = new Quaternion();

function modelRotation(b: Bones, bone: Bone, out: Quaternion) {
  out.copy(bone.quaternion);
  for (let p = bone.parent; p && p !== b.root; p = p.parent) out.premultiply(p.quaternion);
  return out;
}

/** Solve a two-link limb in its parent's frame, keeping both segment lengths. */
function reach(b: Bones, upper: Bone, lower: Bone, end: Bone, goal: Vector3, weight: number) {
  upper.parent!.worldToLocal(b.root.localToWorld(target.copy(goal)));
  delta.copy(target).sub(upper.position);
  const a = lower.position.length(), c = end.position.length();
  const d = Math.min(a + c - 0.0001, Math.max(Math.abs(a - c) + 0.0001, delta.length()));
  delta.normalize();
  pole.addScaledVector(delta, -pole.dot(delta)).normalize();
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
  pitch: number, yaw: number, weight: number, roll = 0) {
  const arm = b['arm' + side], fore = b['fore' + side], hand = b['hand' + side];
  const prop = side === 'R' ? b.weapon : b.offhand;
  facing.setFromEuler(angles.set(pitch, yaw, roll, 'YXZ'));
  // Blend from the posed wrist on entry and back into the ready stance on recovery.
  modelRotation(b, prop, parentQ).slerp(facing, weight);
  prop.quaternion.slerp(identity, weight);
  facing.copy(parentQ).multiply(localQ.copy(prop.quaternion).invert());
  point.set(x, y, z).sub(offset.copy(prop.position).applyQuaternion(facing));
  pole.set(side === 'R' ? -1 : 1, -0.6, 1.1);
  reach(b, arm, fore, hand, point, weight);
  hand.quaternion.copy(modelRotation(b, fore, parentQ).invert()).multiply(facing);
}

/** Place the other fist at a particular point on the already posed shaft / stock. */
export function support(b: Bones, along: number, pitch: number, yaw: number, weight: number, across = 0, roll = 0) {
  b.root.worldToLocal(b.weapon.localToWorld(point.set(across, 0, along)));
  grip(b, 'L', point.x, point.y, point.z, pitch, yaw, weight, roll);
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

export function gripAt(b: Bones, side: Side, key: GripKey, weight = 1) {
  grip(b, side, key[0], key[1], key[2], key[3], key[4], weight, key[5]);
}

/** The weapon passes through the hit key at Action.at, keeps moving past the
 * target, then blends back to guard. The arm follows the grip for all three. */
export function weaponArc(b: Bones, a: Action, beats: AttackBeats, side: Side,
  load: GripKey, impact: GripKey, follow: GripKey, weight = engagement(a)) {
  const struck = a.t >= a.dur * a.at;
  const from = struck ? impact : load, to = struck ? follow : impact;
  const u = struck ? followThrough(a) : beats.hit;
  const mix = (x: number, y: number) => x + (y - x) * u;
  const pitch = mix(from[3], to[3]), yaw = mix(from[4], to[4]), roll = mix(from[5] ?? 0, to[5] ?? 0);
  grip(b, side, mix(from[0], to[0]), mix(from[1], to[1]), mix(from[2], to[2]), pitch, yaw, weight, roll);
  return { pitch, yaw, roll };
}

/** The short rushes share one straight line. The step and hips bring the
 * shoulder forward so the hand can draw back without losing extension. */
export function shortThrust(b: Bones, a: Action, height: number, twoHanded = false) {
  const motion = attackBeats(a), w = engagement(a);
  const { load, hit, hip, chest } = motion;
  const drive = Math.min(1, hit);
  attackBody(b, motion, 'melee', 0.55);
  mov(b.hips, 0, -0.07 * hip, -0.05 * load + 0.18 * hip);
  rot(b.spine, 0.19 * chest, twoHanded ? -0.64 * w : -0.23 * load + 0.28 * chest, 0);
  rot(b.neck, -0.11 * chest, twoHanded ? 0.43 * w : 0, 0);
  stance(b, w, 0.24 * hip);
  grip(b, 'R', -0.29 + (twoHanded ? 0.23 : 0.18) * drive, height, -0.11 + 0.81 * drive, 0, 0, w);
  if (twoHanded) support(b, 0.25 - 0.10 * drive, 0, 0, w);
  else grip(b, 'L', 0.37 + 0.10 * drive, height + 0.07 * load, 0.11 - 0.28 * drive, -0.38, 0, w);
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
