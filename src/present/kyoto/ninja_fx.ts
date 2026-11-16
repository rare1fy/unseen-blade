// 忍者的出招和技能特效。
// strike（attack 的 k = 0.5）：一道朱红斜斩（左上到右下：一根发光的方条刀光，加上细碎的流光），命中爆点、顿帧、震屏；
//   0.09 秒后苦无补刺一下（小火花、第二次受击）。
// skill「烟遁 · 影分身」（随 cast 动作开始）：结印蓄力（朱红气点向手心聚拢）→ 烟遁（一圈大块方形烟团从脚下炸开）→
//   两个靛青色的影分身从烟里冲出，从两侧交叉斩向目标（真身留在原地继续结印）→ 分身化成方形烟团散掉。
//   分身是真身体素网格的克隆（共用几何体），用同一个姿势函数驱动，所以它们打的就是忍者自己的连斩。
import * as THREE from 'three';
import { scene, onUpdate, V3, R, TAU } from '../engine/world';
import { after, shake, hitstop } from '../engine/clock';
import { Action, resetPose, type Bone } from '../actors/rig';
import { POSE_HOOKS } from '../bestiary/poseHooks';
import type { BActor } from '../bestiary/bactor';
import { fxImpact, fxSparks, fxFlare, fxGlow, fxSmoke } from '../fx/fx';
import { fxSlashLine, fxGather } from '../fx/skillFx';
import { addBlock } from '../fx/blocks';
import { ringFx, lightPulse } from '../engine/prims';
import { cue } from '../../audio/cues';

const VERM = 0xff5a3a, VERM_L = 0xffb59a, INDIGO = 0x5a68c8;
const Z = V3(0, 0, 1);

/** a glowing straight bar of light from a to b (the crisp voxel 刀光) */
function bar(a: THREE.Vector3, b: THREE.Vector3, col: number, w: number, life: number, bright = 1.6) {
  const d = b.clone().sub(a), L = d.length(), blk = addBlock(a.clone().add(b).multiplyScalar(0.5), { size: [w, w, L], col, bright, life, grow: 0.04, shrink: life * 0.8 });
  blk.q.setFromUnitVectors(Z, d.normalize());
  return blk;
}
/** small square dust blocks kicked up at a foot (dash start / landing) */
export function dustBlocks(p: THREE.Vector3, n = 6, dir?: THREE.Vector3) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R(-0.3, 0.3), v = V3(Math.cos(a) * R(0.6, 1.4), R(0.4, 1.0), Math.sin(a) * R(0.6, 1.4));
    if (dir) v.addScaledVector(dir, R(1, 2));
    addBlock(V3(p.x + Math.cos(a) * 0.1, 0.06, p.z + Math.sin(a) * 0.1), { size: R(0.07, 0.12), v, col: i % 2 ? 0x9a948a : 0x7a766e, glow: false, life: R(0.35, 0.6), shrink: 0.3, drag: 3, grav: 2, floor: 0 });
  }
}
/** a burst of big square smoke puffs (烟遁): pale grey-indigo cubes that pop out of the ground, billow out and up, and shrink away.
 *  Each puff is two blocks (a pale lit cube + a faint additive halo a size larger) so it reads as a soft puff, not a stone. */
function smokeBurst(p: THREE.Vector3, r: number, n: number, o: { up?: number; life?: number; size?: number; yaw?: number } = {}) {
  const cols = [0xc4c8d8, 0xa8aec4, 0xdadde8, 0x9096b0];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R(-0.25, 0.25), s = (o.size ?? 0.34) * R(0.75, 1.3), h = R(0.1, 1.3), life = (o.life ?? 0.8) * R(0.8, 1.2), delay = R(0, 0.05);
    const at = V3(p.x + Math.cos(a) * r * 0.25, p.y + h, p.z + Math.sin(a) * r * 0.25);
    const v = V3(Math.cos(a) * r * R(1.6, 3.0), R(0.5, 1.4) * (o.up ?? 1), Math.sin(a) * r * R(1.6, 3.0));
    addBlock(at, { size: s, v, col: cols[i % cols.length], glow: false, life, shrink: life * 0.75, grow: 0.07, drag: 4, grav: -0.8, delay, rot: o.yaw ?? 0 });
    if (i % 2 === 0) addBlock(at.clone(), { size: s * 1.35, v: v.clone(), col: 0x6a7090, bright: 0.25, life: life * 0.7, shrink: life * 0.6, grow: 0.05, drag: 4, grav: -0.8, delay, rot: o.yaw ?? 0 });
  }
  fxSmoke(V3(p.x, p.y + 0.4, p.z), 0x9aa0b8, 4, { r: r * 0.5, s: 0.5, alpha: 0.25, up: 1, life: 0.9 });
}

/** the attacker's left (+x of its frame) and the up vector, for slash geometry */
const leftOf = (a: BActor) => a.local(1, 0, 0).sub(a.local(0, 0, 0)).normalize();

/** one diagonal cut across p: a bright bar + streaks + a fainter echo bar */
function cut(p: THREE.Vector3, left: THREE.Vector3, col: number, s = 1, flip = false) {
  const up = V3(0, 1, 0), sx = flip ? -1 : 1;
  const a = p.clone().addScaledVector(up, 0.52 * s).addScaledVector(left, 0.5 * s * sx), b = p.clone().addScaledVector(up, -0.42 * s).addScaledVector(left, -0.5 * s * sx);
  bar(a, b, col, 0.07 * s, 0.22, 2.2);
  bar(a.clone().lerp(b, -0.08), b.clone().lerp(a, -0.08), VERM_L, 0.03 * s, 0.12, 2.4);
  fxSlashLine(a, b, col, { size: 0.13 * s, life: 0.24, n: 14 });
}

export function ninjaStrike(from: BActor, to: BActor) {
  const p = to.chest(), dir = p.clone().sub(from.chest()).setY(0).normalize(), left = leftOf(from);
  cut(p, left, VERM);
  fxImpact(p, 0xff7050, 1.05, { dir, ground: false, chips: [0xff5a3a, 0x2b3147] });
  to.hurt(1); cue('impact', 0.9); cue('whoosh', 0.5);
  // the kunai follow-up jab, one beat later
  after(0.1, () => {
    const q = to.chest().addScaledVector(left, -0.12).add(V3(0, -0.12, 0));
    fxFlare(q, 0xffd0b8, 0.7, 0.12); fxSparks(q, 0xffc0a0, 10, 5, { hot: true, dir, dirK: 1, life: 0.25 });
    to.hurt(0.45); cue('impact', 0.45); hitstop(0.03); shake(0.08);
  });
}

// ---------------------------------------------------------------- shadow clones
interface Clone { g: THREE.Group; bones: Record<string, Bone>; act: Action; t: number; home: THREE.Vector3; yaw: number; mat: THREE.MeshBasicMaterial; age: number; onHit: () => void; last: THREE.Vector3 | null; hit: boolean }
const clones: Clone[] = [];
let hooked = false;
function tickClones(dt: number) {
  for (let i = clones.length - 1; i >= 0; i--) {
    const c = clones[i]; c.age += dt; c.t += dt;
    const live = c.act.step(dt);
    if (!c.hit && c.act.fired) { c.hit = true; c.onHit(); }
    resetPose(c.bones);
    const off = V3(); POSE_HOOKS['ninja']?.(c.bones, c.t, live ? c.act : null, off, null);
    const f = V3(Math.sin(c.yaw), 0, Math.cos(c.yaw)), r = V3(f.z, 0, -f.x);
    c.g.position.copy(c.home).addScaledVector(f, off.z).addScaledVector(r, off.x); c.g.position.y += off.y; c.g.rotation.y = c.yaw;
    // a dark streak behind the clone while it dashes
    const chest = c.g.localToWorld(V3(0, 1.0, 0));
    if (c.last && chest.distanceTo(c.last) > 0.12) { const n = Math.min(6, Math.ceil(chest.distanceTo(c.last) / 0.3)); for (let j = 0; j < n; j++) addBlock(c.last.clone().lerp(chest, j / n).add(V3(R(-0.1, 0.1), R(-0.5, 0.4), R(-0.1, 0.1))), { size: R(0.14, 0.24), col: INDIGO, bright: 0.5, life: 0.28, shrink: 0.25, grow: 0.02 }); }
    c.last = chest;
    c.mat.opacity = Math.min(0.8, c.age / 0.08) * (live ? 1 : 0);
    if (!live) { smokeBurst(c.g.position.clone(), 0.7, 9, { size: 0.3, life: 0.8 }); scene.remove(c.g); c.mat.dispose(); clones.splice(i, 1); }
  }
}
/** a clone of the ninja's voxel meshes (shared geometry), tinted indigo, driven by the ninja's own pose function */
function spawnClone(self: BActor, at: THREE.Vector3, face: THREE.Vector3, dist: number, onHit: () => void) {
  if (!hooked) { hooked = true; onUpdate(tickClones); }
  const body = self.body.clone(true), bones: Record<string, Bone> = {};
  body.scale.set(1, 1, 1); body.position.set(0, 0, 0); body.visible = true;
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x8492ff, transparent: true, opacity: 0 });
  body.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.material = mat; m.castShadow = false; return; }
    const src = self.bones[o.name]; if (src?.rest) { (o as Bone).rest = src.rest; bones[o.name] = o as Bone; }
  });
  const g = new THREE.Group(); g.add(body); scene.add(g);
  const yaw = Math.atan2(face.x - at.x, face.z - at.z);
  clones.push({ g, bones, act: new Action('attack', 0.9, 0.5, { dist }), t: Math.random() * 3, home: at.clone(), yaw, mat, age: 0, onHit, last: null, hit: false });
}

export function ninjaSkill(self: BActor, to: BActor | null) {
  const f = self.fwd(), side = V3(f.z, 0, -f.x), feet = self.local(0, 0, 0);
  const aim = to ? to.home.clone() : self.local(0, 0, 3.2);
  const seal = () => self.local(0, 1.25, 0.32);
  // 1) seal: vermilion motes drawn into the hands, a dim ring under the feet
  fxGather(seal(), VERM, { r: 0.9, n: 16, life: 0.32, size: 0.07 });
  ringFx(V3(feet.x, 0.05, feet.z), { color: INDIGO, radius: 1.1, r0: 0.6, life: 0.5, width: 0.1, fill: 0.08, bright: 1.1 });
  after(0.3, () => { fxGlow(seal(), VERM, 0.6, 0.18, 2.2); cue('magic', 0.5); });
  // 2) 烟遁: a ring of big square smoke cubes bursts from the feet
  after(0.36, () => {
    smokeBurst(feet, 1.0, 20, { yaw: self.yaw }); self.body.visible = false; ringFx(V3(feet.x, 0.05, feet.z), { color: 0xa0a8c0, radius: 1.8, r0: 0.3, life: 0.4, width: 0.18, fill: 0.05, bright: 1 });
    lightPulse(V3(feet.x, 0.8, feet.z + 0.6), INDIGO, 1.2, 0.3, 5); shake(0.1); cue('whoosh', 0.9);
  });
  // 4) the ninja reappears where it stood, in a smaller puff (the clones are still dissolving at the target)
  after(1.02, () => { smokeBurst(feet, 0.6, 10, { size: 0.28, life: 0.6, yaw: self.yaw }); self.body.visible = true; cue('whoosh', 0.4); });
  // 3) two shadow clones dash out of the smoke from either flank and cut across the target (the second one harder)
  const flank = (s: number) => feet.clone().addScaledVector(side, 0.95 * s).addScaledVector(f, 0.25);
  const strikeAt = (s: number, power: number, last: boolean) => () => {
    const p = to ? to.chest() : self.local(0, 1.0, 3.0), left = side.clone().multiplyScalar(-s);
    cut(p, left, s > 0 ? VERM : 0xff7a5a, 1.1, s < 0);
    fxImpact(p, 0xff7050, power, { dir: f, ground: last, chips: [0xff5a3a, 0x2b3147] });
    if (to) to.hurt(power * 0.8);
    cue('impact', 0.8); if (last) { cue('crit', 0.6); hitstop(0.08); }
  };
  for (const [s, delay, power, last] of [[1, 0.4, 0.9, false], [-1, 0.52, 1.3, true]] as Array<[number, number, number, boolean]>) {
    after(delay, () => {
      const at = flank(s), dist = Math.max(0.3, at.distanceTo(aim) - 1.05);
      spawnClone(self, at, aim, dist, strikeAt(s, power, last));
      smokeBurst(at, 0.6, 6, { size: 0.28, life: 0.7 });
    });
  }
}
