import * as THREE from 'three';
import { curve, type Action, type Bone } from '../../actors/rig';
import { POSE_AFTER, type PoseFn } from '../../bestiary/poseHooks';

type Point = [number, number, number];
interface Key {
  hip: Point;
  turn: number;
  lean: number;
  right: Point;
  left: Point; // free arm: shoulder pitch, outward roll and forward elbow flex, in degrees
  yaw: number;
  pitch: number;
  grip?: number;
}
interface AttackPose {
  load: Key;
  impact: Key;
  follow: Key;
  feet: [number, number, number]; // stance width, left foot forward, right foot forward, in metres
  step?: number;
  entry?: Key;
}

const cut: AttackPose = {
  feet: [0.25, 0.10, -0.21], step: 0.24,
  load: { hip: [-0.10, -0.135, -0.13], turn: -42, lean: 5, right: [-0.64, 1.05, -0.29], left: [-24, 15, 33], yaw: -123, pitch: -14 },
  impact: { hip: [0.045, -0.16, 0.19], turn: 22, lean: 15, right: [-0.26, 1.09, 0.56], left: [24, 27, 27], yaw: -7, pitch: 5 },
  follow: { hip: [0.13, -0.145, 0.22], turn: 57, lean: 13, right: [0.12, 1.01, 0.52], left: [34, 18, 40], yaw: 89, pitch: 20 },
};
const motions: Record<string, AttackPose> = {
  hjCut: cut,
  hjBackhand: {
    entry: cut.follow, feet: [cut.feet[0], cut.feet[1] + cut.step!, cut.feet[2]],
    load: { hip: [0.12, -0.17, 0.14], turn: 56, lean: 9, right: [0.09, 1.11, 0.46], left: [23, 19, 45], yaw: 111, pitch: 20 },
    impact: { hip: [-0.07, -0.19, 0.15], turn: 4, lean: 17, right: [-0.32, 1.10, 0.52], left: [8, 25, 25], yaw: 7, pitch: -8 },
    follow: { hip: [-0.12, -0.13, 0.13], turn: -37, lean: 8, right: [-0.64, 1.19, 0.19], left: [-7, 22, 26], yaw: -89, pitch: -25 },
  },
  hjReap: {
    feet: [0.31, 0.13, -0.24], step: 0.25,
    load: { hip: [-0.13, -0.24, -0.14], turn: -43, lean: 23, right: [-0.66, 0.63, -0.18], left: [-13, 21, 40], yaw: -131, pitch: 14 },
    impact: { hip: [0.05, -0.27, 0.20], turn: 27, lean: 34, right: [-0.24, 0.59, 0.56], left: [24, 33, 24], yaw: -7, pitch: 8 },
    follow: { hip: [0.14, -0.21, 0.21], turn: 59, lean: 22, right: [0.15, 0.70, 0.58], left: [42, 21, 38], yaw: 109, pitch: 6 },
  },
  hjLob: {
    feet: [0.24, 0.12, -0.21], step: 0.21,
    load: { hip: [-0.09, -0.16, -0.15], turn: -32, lean: -17, right: [-0.53, 1.69, -0.38], left: [-38, 14, 43], yaw: -9, pitch: -95 },
    impact: { hip: [0.035, -0.14, 0.18], turn: 18, lean: 19, right: [-0.31, 1.64, 0.59], left: [14, 22, 28], yaw: 5, pitch: -31 },
    follow: { hip: [0.09, -0.20, 0.24], turn: 38, lean: 34, right: [-0.05, 0.93, 0.68], left: [29, 17, 39], yaw: 7, pitch: 36 },
  },
  hjSweep: {
    feet: [0.39, 0.14, -0.30], step: 0.28,
    load: { hip: [-0.15, -0.22, -0.11], turn: -45, lean: 7, right: [-0.60, 1.21, 0.14], left: [-53, 13, 40], yaw: -116, pitch: -9, grip: 1 },
    impact: { hip: [0.065, -0.25, 0.20], turn: 26, lean: 16, right: [0.04, 1.19, 0.70], left: [-38, 16, 30], yaw: -8, pitch: 0, grip: 1 },
    follow: { hip: [0.18, -0.22, 0.25], turn: 62, lean: 14, right: [0.29, 1.14, 0.63], left: [33, 30, 38], yaw: 101, pitch: 12 },
  },
  hjThrust: {
    feet: [0.32, 0.21, -0.28], step: 0.19,
    load: { hip: [-0.09, -0.24, -0.19], turn: -22, lean: 18, right: [-0.64, 0.98, -0.28], left: [-24, 17, 44], yaw: 6, pitch: 4 },
    impact: { hip: [0.04, -0.22, 0.25], turn: 28, lean: 34, right: [-0.35, 1.17, 0.97], left: [34, 24, 23], yaw: 0, pitch: -2 },
    follow: { hip: [0.09, -0.16, 0.29], turn: 24, lean: 21, right: [-0.40, 1.13, 0.80], left: [20, 19, 38], yaw: 0, pitch: 8 },
  },
  hjThunder: {
    feet: [0.37, 0.05, -0.08],
    load: { hip: [-0.05, -0.22, -0.06], turn: -17, lean: -16, right: [-0.83, 1.69, 0.07], left: [-14, 23, 49], yaw: -38, pitch: -47 },
    impact: { hip: [0, -0.025, 0.01], turn: 0, lean: -8, right: [-0.77, 2.24, 0.16], left: [8, 24, 37], yaw: 0, pitch: -89 },
    follow: { hip: [0, -0.08, 0.04], turn: 0, lean: -2, right: [-0.77, 2.10, 0.2], left: [5, 17, 32], yaw: 4, pitch: -78 },
  },
};

const RAD = Math.PI / 180;
const xyz = (p: Point) => new THREE.Vector3(...p);
const positionIn = (frame: THREE.Object3D, bone: Bone) => frame.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
const rotationIn = (frame: THREE.Object3D, bone: Bone) => frame.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
function orient(frame: THREE.Object3D, bone: Bone, rotation: THREE.Quaternion) {
  bone.quaternion.copy(bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert())
    .multiply(frame.getWorldQuaternion(new THREE.Quaternion())).multiply(rotation);
}

function aimJoint(frame: THREE.Object3D, joint: Bone, child: Bone, at: THREE.Vector3) {
  const target = joint.parent!.worldToLocal(frame.localToWorld(at.clone())).sub(joint.position);
  joint.quaternion.setFromUnitVectors(child.position.clone().normalize(), target.normalize());
}

/** Solve the elbow or knee in its bend plane. The limb's bone lengths never change. */
function reach(frame: THREE.Object3D, upper: Bone, lower: Bone, end: Bone, at: THREE.Vector3, bend: THREE.Vector3, hinge = false) {
  const start = positionIn(frame, upper), dir = at.clone().sub(start);
  const a = lower.position.length(), b = end.position.length();
  const minimum = hinge ? Math.sqrt(a * a + b * b - a * b) : Math.abs(a - b) + 0.001;
  const d = THREE.MathUtils.clamp(dir.length(), minimum, a + b - 0.001);
  dir.normalize();
  bend.addScaledVector(dir, -bend.dot(dir)).normalize();
  const along = (d * d + a * a - b * b) / (2 * d);
  const joint = start.clone().addScaledVector(dir, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
  if (hinge) {
    // Roll the upper arm with its bend plane and let the elbow flex about its one local axis.
    const x = dir.clone().cross(bend).normalize(), y = start.clone().sub(joint).normalize();
    orient(frame, upper, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y))));
    lower.rotation.set(-Math.acos(THREE.MathUtils.clamp((d * d - a * a - b * b) / (2 * a * b), -1, 1)), 0, 0);
    return;
  }
  aimJoint(frame, upper, lower, joint);
  aimJoint(frame, lower, end, start.addScaledVector(dir, d));
}

/** Hips drive first. The weapon accelerates into the strike and brakes into the follow-through. */
function sample(a: Action, move: AttackPose, body = false) {
  const wind = a.at * a.dur, tail = a.dur - wind, time = a.t - wind;
  const drive = Math.min(body ? 0.18 : 0.105, wind * (body ? 0.40 : 0.34));
  const brake = Math.min(body ? 0.15 : 0.12, tail * 0.48);
  if (time < -drive) return { from: move.entry, to: move.load, mix: curve(a.t, [[0, 0], [wind * 0.55, 1]]) };
  if (time < 0) return { from: move.load, to: move.impact, mix: (1 + time / drive) ** (body ? 1.25 : 1.85) };
  if (time < brake) return { from: move.impact, to: move.follow, mix: 1 - (1 - time / brake) ** 2 };
  const settle = Math.min(tail * 0.78, a.name === 'hjThrust' ? 0.40 : brake + 0.085);
  return { from: move.follow, to: undefined, mix: curve(time, [[Math.max(brake, settle), 0], [tail, 1]]) };
}

const pose: PoseFn = (b, t, action) => {
  if (b.jar) b.jar.visible = action?.name !== 'hjLob' || action.k < action.at - 1e-6;
  const move = action && motions[action.name];
  if (!action || !move) return;
  const { from, to, mix } = sample(action, move), frame = b.hips.parent!;
  const body = sample(action, move, true);
  const blend = (x: number, y: number) => THREE.MathUtils.lerp(x, y, mix);
  const bodyBlend = (x: number, y: number) => THREE.MathUtils.lerp(x, y, body.mix);
  const weight = blend(from ? 1 : 0, to ? 1 : 0);
  if (weight === 0) return;

  const idleR = positionIn(frame, b.handR);
  const idleGrip = rotationIn(frame, b.weapon);
  const footL = positionIn(frame, b.footL), footR = positionIn(frame, b.footR);
  const baseFootL = rotationIn(frame, b.footL), baseFootR = rotationIn(frame, b.footR);
  const offset = (key?: Key) => key ? xyz(key.hip) : new THREE.Vector3();
  b.hips.position.add(offset(body.from).lerp(offset(body.to), body.mix));
  const turn = bodyBlend(body.from?.turn ?? 0, body.to?.turn ?? 0) * RAD;
  b.hips.rotation.y += turn * 0.62;
  b.spine.rotation.y += turn * 0.38;
  b.spine.rotation.x += bodyBlend(body.from?.lean ?? 0, body.to?.lean ?? 0) * RAD;
  b.head.rotation.y -= turn * 0.72;
  b.head.rotation.x -= b.spine.rotation.x * 0.42;

  const stance = curve(action.k, [[0, move.entry ? 1 : 0], [action.at * 0.52, 1], [0.79, 1], [1, 0]]);
  const stepHeight = Math.sin(Math.PI * stance) * 0.08;
  const [width, lead, rear] = move.feet;
  const time = action.t - action.at * action.dur;
  const forwardStep = move.step ? curve(time, [[-0.19, 0], [-0.035, 1]]) : 0;
  const rush = action.name === 'hjThrust' ? THREE.MathUtils.clamp(time / 0.40, 0, 1) : 0;
  const feet = ([['L', footL, 1, lead + (move.step ?? 0) * forwardStep, baseFootL], ['R', footR, -1, rear, baseFootR]] as const).map(([side, start, s, z, q]) => {
    const p = start.lerp(new THREE.Vector3(width * s, 0.14, z), stance);
    // The rear foot pushes off, passes the front foot, then plants to catch the lunge.
    const stride = side === 'R' ? curve(rush, [[0, 0], [0.22, 0], [0.72, 1], [1, 0]]) : curve(rush, [[0, 0], [0.20, 1], [0.67, 0], [1, 0]]);
    const stepLift = side === 'L' ? Math.sin(Math.PI * forwardStep) * 0.095 : 0;
    p.y += stepHeight + stepLift + stride * (side === 'R' ? 0.19 : 0.07);
    p.z += stride * (side === 'R' ? 0.43 : 0.15);
    return { p, s, q, thigh: b['leg' + side], shin: b['shin' + side], foot: b['foot' + side] };
  });
  // Sink into a long stance before reaching for the planted foot. Extending the joint chain would lift the sole.
  let drop = 0;
  for (const { p, thigh, shin, foot } of feet) {
    const v = positionIn(frame, thigh).sub(p), reach = shin.position.length() + foot.position.length() - 0.002;
    drop = Math.max(drop, v.y - Math.sqrt(Math.max(0, reach * reach - v.x * v.x - v.z * v.z)));
  }
  b.hips.position.y -= drop * stance;
  for (const { p, s, q, thigh, shin, foot } of feet) {
    reach(frame, thigh, shin, foot, p, new THREE.Vector3(0.1 * s, 0, 1));
    orient(frame, foot, q.slerp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.15 * s), stance));
  }

  const rotation = (key?: Key) => key ? new THREE.Quaternion().setFromEuler(new THREE.Euler(key.pitch * RAD, key.yaw * RAD, 0, 'YXZ')) : idleGrip.clone();
  const grip = rotation(from).slerp(rotation(to), mix);
  const right = (from ? xyz(from.right) : idleR.clone()).lerp(to ? xyz(to.right) : idleR, mix);
  reach(frame, b.armR, b.foreR, b.handR, right, new THREE.Vector3(-1, -0.65, -0.3));
  // Orient the fist and weapon together so the blade never spins independently of the grip.
  orient(frame, b.handR, grip.clone().multiply(b.weapon.quaternion.clone().invert()));
  b.armL.rotation.x = blend(from ? from.left[0] * RAD : b.armL.rotation.x, to ? to.left[0] * RAD : b.armL.rotation.x);
  b.armL.rotation.z = blend(from ? from.left[1] * RAD : b.armL.rotation.z, to ? to.left[1] * RAD : b.armL.rotation.z);
  const elbow = b.foreL.rotation.x;
  b.foreL.rotation.set(blend(from ? -from.left[2] * RAD : elbow, to ? -to.left[2] * RAD : elbow), 0, 0);
  const guide = blend(from?.grip ?? 0, to?.grip ?? 0);
  if (guide > 0) {
    const haft = frame.worldToLocal(b.weapon.localToWorld(new THREE.Vector3(-0.015, 0.015, -0.47)));
    const left = positionIn(frame, b.handL), palm = rotationIn(frame, b.handL);
    left.lerp(haft.add(new THREE.Vector3(-0.018, 0.09, -0.018).applyQuaternion(grip)), guide);
    reach(frame, b.armL, b.foreL, b.handL, left, new THREE.Vector3(0.8, -1, -0.38), true);
    orient(frame, b.handL, palm.slerp(grip, guide));
  }

  const swing = Math.sin(t * 17) * 0.06 * weight;
  for (const name of ['scA1', 'scA2', 'scB1', 'scB2']) {
    if (b[name]) b[name].rotation.x -= (0.25 + Math.abs(turn) * 0.30) * weight + swing;
  }
};

for (const id of ['hj_blade', 'hj_blade_e', 'hj_boss', 'hj_sickle', 'hj_jar']) POSE_AFTER[id] = pose;
