import { Vector3 } from 'three';
import { curve, mov, rot, type Action, type Bone } from '../../actors/rig';
import { attackBeats, attackBody } from './foe_motion';
import { drawString, engagement, followThrough, grip, stance, support } from './weapon_pose';

type Bones = Record<string, Bone>;
const nock = new Vector3(), slack = new Vector3(), haft = new Vector3();

export function shootBow(b: Bones, a: Action) {
  const beats = attackBeats(a), w = engagement(a), impact = a.dur * a.at;
  attackBody(b, beats, 'ranged', 0.6);
  const draw = curve(a.t, [[0, 0], [impact * 0.29, 0], [impact * 0.84, 1]]);
  const loose = a.t >= impact ? 1 : 0;
  const kick = loose * (1 - curve(a.t, [[impact + 0.025, 0], [impact + 0.14, 1]]));
  const turn = w * (-0.68 - 0.59 * draw);
  rot(b.hips, 0, turn * 0.32, 0); rot(b.spine, -0.04 * w, turn * 0.68, 0);
  rot(b.neck, 0, -turn * 0.78, 0);
  stance(b, w);
  // The stave's long axis is +Z, the string sits behind it on local +Y.
  grip(b, 'L', -0.16 + 0.57 * (1 - w), 1.34 - 0.035 * kick, 0.39 + 0.32 * draw - 0.055 * kick,
    -Math.PI / 2 + 0.09 * kick, 0, w);
  b.root.updateMatrixWorld(true);
  slack.copy(b.stringA.position).lerp(b.stringB.position, 0.5);
  b.root.worldToLocal(b.offhand.localToWorld(nock.copy(slack)));
  grip(b, 'R', nock.x + (-0.39 - nock.x) * draw, nock.y + (1.46 - nock.y) * draw,
    nock.z + (0.13 - nock.z) * draw - 0.105 * loose, -0.18, 0, w);
  b.root.updateMatrixWorld(true);
  b.offhand.worldToLocal(b.weapon.getWorldPosition(nock));
  drawString(b, slack.lerp(nock, w * (1 - loose)), 'z');
}

export function swingHammer(b: Bones, a: Action) {
  const beats = attackBeats(a, true), w = engagement(a);
  const hit = a.k < a.at ? beats.hit : 1, follow = followThrough(a);
  const sweep = a.data.atk === 'sweep';
  attackBody(b, beats, 'melee', 0.6);
  const turn = sweep ? -1.12 * beats.load + 0.16 * beats.chest + 0.94 * follow * w
    : -0.70 * w * (1 - hit);
  rot(b.hips, 0, turn * 0.45, 0);
  const brace = hit * w;
  rot(b.spine, -0.14 * beats.load + (sweep ? 0.2 * beats.chest : 0.10 * beats.chest + 0.75 * hit * brace), turn * 0.55, 0);
  rot(b.neck, -0.32 * beats.chest, -turn * 0.52, 0);
  mov(b.hips, 0, -(sweep ? 0.085 * beats.hip : 0.08 * beats.hip + 0.16 * brace), 0.12 * beats.hip);
  stance(b, w, 0.13 * beats.hip);
  // Both shoulders come forward when the large fists close around the short haft.
  mov(b.shR, 0.14 * w, 0, 0.10 * w); mov(b.shL, -0.15 * w, 0, 0.12 * w);
  // Turn the head of the hammer out over the brow before the fists descend; add impact micro-shudder on ground slam.
  const arc = 1 - (1 - hit) ** 3;
  const sh = beats.shudder * (sweep ? 0.025 : 0.032);
  const pitch = (sweep ? 0.04 : -2.48 + 2.70 * arc) + sh;
  const yaw = (sweep ? -1.83 + 1.87 * hit + 1.40 * follow * w ** 2 : 0.70 - 1.16 * arc - 0.65 * Math.sin(Math.PI * hit)) + (sweep ? sh : 0);
  if (sweep) {
    // Carry the space between the fists around the outside of the turning breastplate.
    b.root.updateMatrixWorld(true);
    b.root.worldToLocal(b.chest.localToWorld(haft.set(0, -0.035, 0.52)));
    haft.x += 0.105 * Math.sin(yaw); haft.z += 0.105 * Math.cos(yaw);
  } else {
    haft.set(-0.25 - 0.20 * (1 - w) + 0.30 * hit * hit, 1.87 - 1.494 * hit, 0.43 + 0.44 * hit);
  }
  grip(b, 'R', haft.x, haft.y, haft.z, pitch, yaw, w);
  support(b, -0.21, pitch, yaw, w);
}
