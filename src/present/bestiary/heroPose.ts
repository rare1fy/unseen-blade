// 三职业共用握持约束，待机与动作都在同一架势上叠加。+z 是人物前方和武器长轴。
import * as THREE from 'three';
import { type Bone, type Action, rot, mov, curve, snap } from '../actors/rig';

export type GripHero = 'warrior' | 'rogue' | 'mage';
export const isGripHero = (id: string): id is GripHero => id === 'warrior' || id === 'rogue' || id === 'mage';

const parentQ = new THREE.Quaternion(), targetQ = new THREE.Quaternion(), targetEuler = new THREE.Euler();
/** 用手腕实现武器方向，武器节点始终不动，拳头与柄不会在呼吸、挥砍时分离。 */
export function wrist(b: Record<string, Bone>, side: 'R' | 'L', elevation: number, yaw = 0, roll = 0) {
  const hand = b[`hand${side}`];
  parentQ.identity();
  for (let p = hand.parent; p && p !== b.root; p = p.parent) parentQ.premultiply(p.quaternion);
  targetQ.setFromEuler(targetEuler.set(-elevation, yaw, roll, 'YXZ'));
  hand.quaternion.copy(parentQ.invert().multiply(targetQ));
}

/** 一次性小动作的进度：每 period 秒在 phase 处发生一次、持续 dur 秒；不在发生时返回 −1 */
export function beat(t: number, period: number, dur: number, phase = 0) { const u = ((t - phase) % period + period) % period; return u < dur ? u / dur : -1; }
/** 0→1→0 的平滑鼓包 */
export const bump = (k: number) => (k < 0 ? 0 : Math.sin(k * Math.PI) ** 2);
/** 屈膝不滑脚：大腿前摆 a、小腿回折 2a、脚掌回 a，髋部按腿长下沉（两段腿各约 0.28 m） */
export function crouch(b: Record<string, Bone>, side: 'L' | 'R', a: number, splay: number) {
  rot(b[`leg${side}`], -a, 0, splay); rot(b[`shin${side}`], 2 * a, 0, 0); rot(b[`foot${side}`], -a, 0, -splay);
  return 0.28 * 2 * (1 - Math.cos(a)) + 0.56 * (1 - Math.cos(splay));
}

/**
 * 备战待机：架势 + 呼吸 + 换重心 + 偶发的握紧武器。返回给手腕的附加角度（武器方向最显眼，主要靠它让动作被看见）。
 * 有动作在播（a 非空）时由调用方传 calm = 0：只保留架势，偶发动作停掉，免得和攻击、受击叠在一起。
 */
function readyIdle(id: GripHero, b: Record<string, Bone>, t: number, calm = 1) {
  const out = { right: 0, rightYaw: 0, left: 0 };
  if (id === 'warrior') {
    // 矮人狂战：两脚分开压低重心，左肩冲前；粗重的呼吸（2.6 秒一口）带着胸背和斧头一起起伏；重心左右慢慢换；
    // 每 5 秒掂一下斧头（往上一提再落回，髋部跟着一沉）。
    const br = Math.sin(t * Math.PI * 2 / 2.6), sway = Math.sin(t * Math.PI * 2 / 3.6), heft = bump(beat(t, 5.0, 0.7, 1.2)) * calm;
    const a = 0.26 + 0.05 * br + 0.06 * heft;
    const drop = Math.max(crouch(b, 'L', a + 0.06, 0.14), crouch(b, 'R', a - 0.04, -0.14));
    mov(b.hips, sway * 0.06, -drop, 0); rot(b.hips, 0, 0.16, -sway * 0.05);
    rot(b.spine, 0.10 + 0.06 * br, -0.12, sway * 0.04); rot(b.chest, 0.05 * br, -0.04, 0);
    rot(b.neck, -0.10 - 0.04 * br + 0.10 * heft, 0, -sway * 0.03);
    rot(b.armR, -0.06 * br - 0.25 * heft, 0, 0); rot(b.armL, 0.05 * br, 0, 0.06 * br); rot(b.handL, 0.35, 0, 0);
    out.right = 0.08 * br + 0.35 * heft; out.rightYaw = -0.05 * sway;
  } else if (id === 'rogue') {
    // 暗夜精灵刺客：脚掌着地轻轻弹（0.8 秒一下），重心左右换得快，双匕首交替微动；每 3.4 秒右手翻一下匕首（转一圈）。
    const bob = Math.sin(t * Math.PI * 2 / 0.8), sway = Math.sin(t * Math.PI * 2 / 1.7), twirl = beat(t, 3.4, 0.5, 0.8);
    const tw = twirl < 0 || !calm ? 0 : twirl;
    mov(b.hips, sway * 0.07, -0.03 * (0.5 + 0.5 * bob), 0); rot(b.hips, 0, -0.1, -sway * 0.06);
    rot(b.spine, 0.04 * bob, 0.06 * sway, sway * 0.05); rot(b.neck, -0.03 * bob, -0.06 * sway, 0);
    rot(b.legL, -0.05 * bob, 0, 0); rot(b.shinL, 0.1 * bob, 0, 0); rot(b.legR, -0.05 * bob, 0, 0); rot(b.shinR, 0.1 * bob, 0, 0);
    rot(b.armR, -0.06 * bob, 0, 0); rot(b.armL, 0.06 * bob, 0, 0);
    out.right = 0.1 * sway; out.left = -0.1 * sway; out.rightYaw = tw * Math.PI * 2;
  } else {
    // 星界魔导：两脚前后错开站定，法杖斜指前方，左手在胸前慢慢画圈聚气；呼吸平稳（3.2 秒）；每 4.4 秒法杖往前一点。
    const br = Math.sin(t * Math.PI * 2 / 3.2), c = t * Math.PI * 2 / 2.4, point = bump(beat(t, 4.4, 0.8, 2.0)) * calm;
    const drop = Math.max(crouch(b, 'L', 0.2, 0.08), crouch(b, 'R', 0.06, -0.08));
    mov(b.hips, Math.sin(c * 0.5) * 0.03, -drop - 0.012 * br, 0); rot(b.hips, 0, 0.1, 0);
    rot(b.spine, 0.05 + 0.04 * br + 0.06 * point, -0.08, 0); rot(b.neck, -0.04 - 0.03 * br, 0, 0);
    rot(b.armL, -0.12 + Math.sin(c) * 0.12, Math.cos(c) * 0.1, 0.06 + Math.cos(c) * 0.08);
    rot(b.armR, -0.25 * point, 0, 0);
    out.right = -0.12 * point + 0.04 * br;
  }
  return out;
}

export function poseHero(id: GripHero, b: Record<string, Bone>, t: number, a: Action | null, off: THREE.Vector3) {
  const br = Math.sin(t * 2.2), rogue = id === 'rogue', mage = id === 'mage';
  let right = mage ? 1.62 : Math.PI / 4, rightYaw = mage ? -0.04 : -0.12;
  let left = Math.PI / 4, leftYaw = 0.16;
  // 备战待机（用户 11-13：「现在就呆站着」）：压低重心的弓步、身体侧对来敌，呼吸带动肩背起伏，重心在两脚间慢慢换，
  // 偶尔一次握紧 / 掂一下武器。动作要在 3× 像素下一眼看得出：胸背起伏约 4°、重心起伏约 3 cm、换重心左右 ±4 cm。
  const ready = readyIdle(id, b, t, a ? 0 : 1);
  right += ready.right; rightYaw += ready.rightYaw; left += ready.left;
  mov(b.hips, 0, (rogue ? -0.045 : 0) + br * 0.008, 0);
  rot(b.spine, rogue ? 0.18 + br * 0.012 : 0.025 + br * 0.012, 0, 0);
  rot(b.neck, rogue ? -0.16 : -0.025, Math.sin(t * 0.5) * 0.025, 0);
  rot(b.cape, 0.08 + br * 0.035, 0, Math.sin(t * 1.2) * 0.025);
  if (rogue) {
    // 微屈膝、前压，双肘分开，前后错开半掌，匕首露在身体两侧。
    rot(b.legL, -0.26, 0, 0.08); rot(b.shinL, 0.48, 0, 0); rot(b.footL, -0.22, 0, 0);
    rot(b.legR, -0.38, 0, -0.08); rot(b.shinR, 0.56, 0, 0); rot(b.footR, -0.18, 0, 0);
    rot(b.armR, -0.35 + br * 0.018, 0, -0.16); rot(b.foreR, -1.05, 0, 0);
    rot(b.armL, -0.20 - br * 0.018, 0, 0.22); rot(b.foreL, -1.12, 0, 0);
  } else if (mage) {
    rot(b.armR, -0.40 + br * 0.012, 0, -0.20); rot(b.foreR, -1.25, 0, 0);
    rot(b.armL, -0.35 - br * 0.02, 0, 0.18); rot(b.foreL, -0.85, 0, 0);
  } else {
    rot(b.armR, -0.22 + br * 0.02, 0, -0.22); rot(b.foreR, -1.10, 0, 0);
    rot(b.armL, -0.40 - br * 0.02, 0, 0.16); rot(b.foreL, -1.10, 0, 0); rot(b.handL, 0.25, 0, 0);
  }

  if (a) {
    const k = a.k, n = a.name;
    if (n === 'hurt') {
      const s = snap(k, [[0, 0], [0.12, 1], [1, 0]]) * Math.min(1.6, (a.data.power as number) || 1);
      off.z = -0.35 * s; rot(b.spine, -0.28 * s, 0, 0.08 * s); rot(b.neck, -0.16 * s, 0, 0);
      right += 0.12 * s; left += 0.12 * s;
    } else if (n === 'attack' && rogue) {
      const r = snap(k, [[0, 0], [0.2, 1], [0.4, 0], [1, 0]]), l = snap(k, [[0, 0], [0.4, 0], [0.6, 1], [0.8, 0], [1, 0]]);
      off.z = curve(k, [[0, 0], [0.2, (a.data.dist as number) ?? 0.6], [0.6, (a.data.dist as number) ?? 0.8], [1, 0]]);
      rot(b.spine, 0.12 * (r + l), 0.16 * (r - l), 0);
      rot(b.armR, -0.95 * r, 0, -0.08 * r); rot(b.foreR, 0.65 * r, 0, 0);
      rot(b.armL, -1.10 * l, 0, 0.08 * l); rot(b.foreL, 0.75 * l, 0, 0);
      right -= 0.72 * r; left -= 0.72 * l;
    } else if (n === 'attack' && !mage) {
      const wind = curve(k, [[0, 0], [0.3, 1], [0.44, 1], [0.54, 0], [1, 0]]), hit = snap(k, [[0, 0], [0.44, 0], [0.54, 1], [0.74, 1], [1, 0]]);
      off.z = curve(k, [[0, 0], [0.3, -0.15], [0.52, (a.data.dist as number) ?? 0.7], [0.74, (a.data.dist as number) ?? 0.7], [1, 0]]);
      rot(b.spine, -0.15 * wind + 0.18 * hit, 0.12 * wind, 0);
      rot(b.armR, -0.80 * wind - 0.45 * hit, 0, -0.12 * wind); rot(b.foreR, 0.80 * wind + 0.65 * hit, 0, 0);
      rot(b.armL, -0.35 * wind, 0, 0.12 * hit);
      right += 0.65 * wind - 0.55 * hit; rightYaw -= 0.08 * wind;
    } else if (n === 'cast' || n === 'attack' || n === 'summon' || n === 'shield') {
      const up = curve(k, [[0, 0], [0.4, 1], [0.6, 0.75], [1, 0]]), push = snap(k, [[0, 0], [0.55, 0], [0.65, 1], [1, 0]]);
      rot(b.armL, -0.60 * up - 0.25 * push, 0, 0.12 * up); rot(b.foreL, 0.35 * push, 0, 0);
      rot(b.armR, -0.20 * up - 0.15 * push, 0, -0.08 * up); rot(b.foreR, 0.20 * up + 0.15 * push, 0, 0);
      rot(b.spine, -0.06 * up + 0.06 * push, 0, 0);
      right += 0.05 * up - 0.18 * push; left -= 0.30 * push;
    } else if (n === 'spin') {
      const out = curve(k, [[0, 0], [0.18, 1], [0.82, 1], [1, 0]]), turn = curve(k, [[0, 0], [0.22, 0], [0.78, 1], [1, 1]]);
      b.hips.rotation.y += turn * Math.PI * 4;
      off.z = curve(k, [[0, 0], [0.25, -0.1], [0.6, (a.data.dist as number) || 0], [0.8, (a.data.dist as number) || 0], [1, 0]]);
      rot(b.armR, 0.12 * out, 0, -1.05 * out); rot(b.foreR, 0.70 * out, 0, 0);
      rot(b.armL, 0.12 * out, 0, 0.85 * out); rot(b.foreL, 0.60 * out, 0, 0);
      // 长柄向外扫，绝不横穿胸口；方向跟随髋部的两圈旋转。
      right += ((mage ? 1.62 : 0.12) - right) * out; rightYaw += -1.20 * out + turn * Math.PI * 4;
      left += (0.16 - left) * out; leftYaw += 1.15 * out + turn * Math.PI * 4;
      mov(b.hips, 0, -0.04 * out, 0);
    } else if (n === 'block') {
      const s = curve(k, [[0, 0], [0.2, 1], [0.7, 1], [1, 0]]);
      rot(b.armR, (mage ? -0.12 : -0.40) * s, 0, -0.10 * s); rot(b.foreR, (mage ? 0.12 : -0.10) * s, 0, 0);
      rot(b.armL, -0.35 * s, 0, 0.10 * s); rot(b.foreL, -0.12 * s, 0, 0);
      right += ((mage ? 1.62 : 1.25) - right) * s; left += (1.15 - left) * s; mov(b.hips, 0, -0.035 * s, 0);
    } else if (n === 'bleed') {
      const s = curve(k, [[0, 0], [0.3, 1], [0.65, 1], [1, 0]]);
      // 空手压胸、持械手留在身外，避免斧刃或匕首切进躯干。
      rot(b.armL, -0.25 * s, 0, -0.25 * s); rot(b.foreL, -0.15 * s, 0, 0);
      rot(b.armR, 0.08 * s, 0, -0.22 * s); rightYaw -= (mage ? 0.05 : 0.25) * s; leftYaw += 0.15 * s;
      rot(b.spine, 0.10 * s, 0, 0);
    } else if (n === 'toss') {
      const s = snap(k, [[0, 0], [0.35, -1], [0.5, 1], [1, 0]]);
      rot(b.armL, -0.60 * Math.max(0, s) + 0.25 * Math.max(0, -s), 0, 0);
      rot(b.foreL, 0.35 * Math.max(0, s), 0, 0); left += 0.20 * s;
    } else if (n === 'roar' || n === 'cheer') {
      const s = curve(k, [[0, 0], [0.25, 1], [0.70, 1], [1, 0]]);
      rot(b.armR, (mage ? -0.15 : -0.65) * s, 0, -0.25 * s); rot(b.foreR, (mage ? 0.15 : 0.65) * s, 0, 0);
      rot(b.armL, -1.10 * s, 0, 0.30 * s); right += ((mage ? 1.62 : 1.45) - right) * s; left += 0.50 * s;
      rot(b.spine, -0.08 * s, 0, 0);
      if (n === 'cheer') off.y += Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k) * 0.18;
    } else if (n === 'fall' || n === 'collapse') {
      const s = curve(k, [[0, 0], [0.6, 1], [1, 1]]);
      rot(b.hips, -1.35 * s, 0, 0.20 * s); mov(b.hips, 0, -0.25 * s, -0.3 * s);
      rot(b.armR, 0, 0, -0.65 * s); rot(b.armL, 0, 0, 0.65 * s);
      right += 0.35 * s; left += 0.35 * s;
    }
  }
  wrist(b, 'R', right, rightYaw);
  if (rogue) wrist(b, 'L', left, leftYaw);
  if (mage) wrist(b, 'L', -Math.PI + 0.15, 0, 0.10); // 指尖朝上，掌心朝前。
  if (rogue) hang(b, t, a);
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
/**
 * 女版刺客的马尾和腰间飘带（各自一个关节；男版没有这两个关节，这里什么也不做）：抵消大部分上级关节的前后、左右倾斜，
 * 让它们始终往下垂；待机时随脚步晚半拍晃，出刀时往后甩。马尾紧贴兜帽后面，相对头部只许往后摆，不会插进兜帽。
 */
function hang(b: Record<string, Bone>, t: number, a: Action | null) {
  const step = t * Math.PI * 2 / 0.8, sway = t * Math.PI * 2 / 1.7;
  let trail = 0;
  if (a?.name === 'attack') trail = curve(a.k, [[0, 0], [0.15, 0.55], [0.4, 0.25], [0.6, 0.45], [1, 0]]);
  else if (a?.name === 'hurt') trail = 0.3 * snap(a.k, [[0, 0], [0.12, 1], [1, 0]]);
  else if (a?.name === 'cheer' || a?.name === 'roar') trail = 0.15 * Math.abs(Math.sin(a.k * Math.PI * 3));
  if (b.pony) {
    let px = 0, pz = 0;
    for (const n of ['hips', 'spine', 'chest', 'neck', 'head']) { const o = b[n]; if (o) { px += o.rotation.x; pz += o.rotation.z; } }
    rot(b.pony, Math.max(0, 0.06 - 0.85 * px + 0.04 * Math.sin(step - 1.2) + trail), 0, clamp(-0.85 * pz, -0.5, 0.5) + 0.07 * Math.sin(sway - 1.0));
  }
  if (b.sash) {
    rot(b.sash, clamp(0.04 - 0.85 * b.hips.rotation.x, -0.5, 0.6) + 0.05 * Math.sin(step - 0.8) + 0.8 * trail, 0, clamp(-0.85 * b.hips.rotation.z, -0.4, 0.4) + 0.06 * Math.sin(sway - 0.7));
  }
}
