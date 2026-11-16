// 选职业专用的英雄动作（SELECT_SHOW_BRIEF 第 3 条，用户：「三个角色镜头和动作表现也都一摸一样感觉很单调」）。只在选职业时用：
// BattleActor.show = true 时，pose() 交给这里，战斗里的动作一行没动。底子是战斗架势（heroPose.poseHero，传一个空动作，只留架势
// 和呼吸，不要战斗待机里偶发的掂斧 / 翻刀），上面叠两层：
// · 各职业的待机：狂战把斧子扛在肩上、粗重地喘（2.4 秒一口，吸气耸肩、呼气沉下去）；魔导法杖立在身侧、杖头的光悬在上面
//   （光是 classShow 挂的），空手掌心朝上慢慢画圈；刺客压低身子，右手的匕首一阵一阵地转。
// · 选人动作（classShow 按时序播）：sEnter 亮相、sSig 招牌动作、sFin 确认时的收尾招式。每个都是 蓄力 → 接触（impact）→ 余韵。
//   狂战：从天而降砸在台上 / 举斧过顶砸地 / 斧子高举怒吼；魔导：从光柱里显形 / 举杖、脚下起法阵 / 法杖朝天一顶；
//   刺客：从烟里蹲着冒出来 / 消失再交叉双匕首出现 / 原地一旋、双匕首向两侧展开。
// 骨骼方向同 battle.ts：+z 前、+x 是人物的左；手臂 x < 0 往前抬；手腕仰角 0 = 武器平指前方，π/2 = 竖直朝上；偏航 > 0 = 往人物左边。
import * as THREE from 'three';
import { Action, rot, mov, curve, snap, type Bone } from '../actors/rig';
import { poseHero, type GripHero } from './heroPose';

export const SHOW_MOVES = new Set(['sEnter', 'sSig', 'sFin']);
/** a dummy action for poseHero: the battle stance and breathing without its idle beats (calm = 0) */
const BASE = new Action('show', 1e9, 1);

export interface ShowBody { hid: string; bones: Record<string, Bone>; t: number; act: Action | null; off: THREE.Vector3; root: THREE.Object3D; /** debug: hold the move at this k */ showK?: number | null }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const _pq = new THREE.Quaternion(), _tq = new THREE.Quaternion(), _te = new THREE.Euler();
/** the weapon's direction through the wrist (same constraint as heroPose / battle: the fist never leaves the grip) */
function wrist(b: Record<string, Bone>, side: 'R' | 'L', elevation: number, yaw = 0, roll = 0) {
  const hand = b[`hand${side}`]; if (!hand) return;
  _pq.identity();
  for (let p = hand.parent; p && p !== b.root; p = p.parent) _pq.premultiply(p.quaternion);
  _tq.setFromEuler(_te.set(-elevation, yaw, roll, 'YXZ'));
  hand.quaternion.copy(_pq.invert().multiply(_tq));
}
/** knees bent without sliding the feet (both legs, hips drop ≈ 0.3 m per rad) */
function bend(b: Record<string, Bone>, d: number) {
  rot(b.legL, -d, 0, 0); rot(b.shinL, 2 * d, 0, 0); rot(b.footL, -d, 0, 0); rot(b.legR, -d * 0.8, 0, 0); rot(b.shinR, 1.6 * d, 0, 0); rot(b.footR, -d * 0.8, 0, 0); mov(b.hips, 0, -0.3 * d, 0);
}
/** a breath shape: quick inhale, slow exhale (0..1) */
const breath = (t: number, period: number) => { const u = ((t / period) % 1 + 1) % 1; return u < 0.35 ? Math.sin((u / 0.35) * Math.PI / 2) : Math.cos(((u - 0.35) / 0.65) * Math.PI / 2); };

/** the pose of a hero during class select (BattleActor.pose calls this while actor.show is on) */
export function poseShow(a: ShowBody) {
  const id = a.hid as GripHero, b = a.bones, t = a.t, act = a.act && SHOW_MOVES.has(a.act.name) ? a.act : null, k = a.showK ?? act?.k ?? 0, n = act?.name ?? '';
  a.off.set(0, 0, 0); a.root.scale.setScalar(1);
  poseHero(id, b, t, BASE, a.off);
  // the move's weight: the idle layer fades out under a move and back in after it
  const mw = !act ? 0 : n === 'sEnter' ? curve(k, [[0, 1], [0.75, 1], [1, 0]]) : curve(k, [[0, 0], [0.12, 1], [0.82, 1], [1, 0]]), iw = 1 - mw;
  const W = { r: 0, ry: 0, l: Math.PI / 4, ly: 0.16 };   // the idle wrists
  if (id === 'warrior') {
    // 扛斧：right arm up, elbow folded back, the haft on the shoulder (head up behind it); heavy breathing: shoulders up on the inhale
    const br = breath(t, 2.4);
    rot(b.armR, (-1.05 - 0.08 * br) * iw, 0, (-0.25) * iw); rot(b.foreR, (-0.75) * iw, 0, 0);
    rot(b.armL, (0.05 * br) * iw, 0, (0.18 + 0.05 * br) * iw); rot(b.handL, 0.3 * iw, 0, 0);
    rot(b.spine, (0.05 + 0.07 * br) * iw, 0, 0); rot(b.chest, (-0.06 * br) * iw, 0, 0); rot(b.neck, (-0.1 + 0.08 * br) * iw, 0, 0);
    mov(b.hips, 0, (-0.02 + 0.025 * br) * iw, 0);
    W.r = 2.35 + 0.05 * br; W.ry = -0.35;
  } else if (id === 'mage') {
    // the staff stands upright at his side (its light hangs over the head, classShow); the free hand palm up, circling slowly
    const c = t * Math.PI * 2 / 3.2;
    rot(b.armR, (-0.15) * iw, 0, (-0.12) * iw); rot(b.foreR, (0.35) * iw, 0, 0);
    rot(b.armL, (-0.55 + 0.08 * Math.sin(c)) * iw, 0.1 * Math.cos(c) * iw, (0.2 + 0.06 * Math.cos(c)) * iw); rot(b.foreL, (-0.5) * iw, 0, 0);
    rot(b.neck, (-0.05 + 0.03 * Math.sin(t * 0.7)) * iw, 0.08 * Math.sin(t * 0.45) * iw, 0);
    W.r = 1.58;
  } else {
    // 压低身子转匕首: a deep crouch, weight swaying, the right dagger spinning in bursts (0.55 s of spin every 1.7 s), head scanning
    const sway = Math.sin(t * Math.PI * 2 / 1.9), u = ((t % 1.7) + 1.7) % 1.7, spin = u < 0.55 ? (u / 0.55) : 1;
    bend(b, 0.32 * iw); rot(b.spine, 0.22 * iw, 0.08 * sway * iw, 0); rot(b.neck, -0.2 * iw, 0.18 * Math.sin(t * 0.6) * iw, 0);
    mov(b.hips, 0.05 * sway * iw, 0, 0);
    rot(b.armR, (-0.55) * iw, 0, (-0.2) * iw); rot(b.armL, (-0.3) * iw, 0, (0.25) * iw);
    W.r = 0.45 + 0.1 * Math.sin(t * 2); W.ry = -0.2 + Math.PI * 2 * (Math.floor(t / 1.7) + spin * spin * (3 - 2 * spin)); W.l = 0.6; W.ly = 0.3;
  }
  let R = { el: W.r, yaw: W.ry }, L = { el: W.l, yaw: W.ly };
  if (act && id === 'warrior') ({ R, L } = warrior(a, n, k, mw, R, L));
  else if (act && id === 'mage') ({ R, L } = mage(a, n, k, mw, R, L));
  else if (act && id === 'rogue') ({ R, L } = rogue(a, n, k, mw, R, L));
  wrist(b, 'R', R.el, R.yaw);
  if (id === 'rogue') wrist(b, 'L', L.el, L.yaw);
  if (id === 'mage') wrist(b, 'L', -Math.PI + 0.15, 0, 0.1);
}
type Wr = { el: number; yaw: number };

function warrior(a: ShowBody, n: string, k: number, mw: number, R: Wr, L: Wr) {
  const b = a.bones;
  if (n === 'sEnter') {
    // dropped from the sky with the axe held overhead; the landing (impact 0.45) folds him deep, the axe slams down, he rises
    const fall = curve(k, [[0, 1], [0.45, 0]]), land = snap(k, [[0, 0], [0.44, 0], [0.5, 1], [0.7, 0.8], [1, 0]]);
    a.off.y += 7 * fall * fall; bend(b, 0.65 * land);
    const up = curve(k, [[0, 1], [0.42, 1], [0.48, 0], [1, 0]]), dn = snap(k, [[0, 0], [0.44, 0], [0.5, 1], [0.75, 1], [1, 0]]);
    rot(b.armR, -2.5 * up - 0.8 * dn, 0, -0.18 * up); rot(b.foreR, 0.95 * up + 0.45 * dn, 0, 0);
    rot(b.armL, -2.3 * up - 0.8 * dn, 0, 0.2 * up); rot(b.foreL, 1.0 * up + 0.55 * dn, 0, 0);
    rot(b.spine, -0.2 * up + 0.5 * dn, 0, 0); rot(b.neck, 0.1 * up - 0.3 * dn, 0, 0);
    const sq = snap(k, [[0, 0], [0.44, 0], [0.48, 1], [0.62, 0]]); a.root.scale.set(1 + 0.12 * sq, 1 - 0.16 * sq, 1 + 0.12 * sq);
    return { R: { el: lerp(lerp(R.el, 2.25, up), -0.6, dn), yaw: lerp(R.yaw, -0.12, Math.max(up, dn)) }, L };
  }
  if (n === 'sSig') {
    // 举斧过顶 → 砸地 (impact 0.42) → 压在斧上喘一口 → 斧子扛回肩上
    const up = curve(k, [[0, 0], [0.3, 1], [0.37, 1], [0.42, 0], [1, 0]]), dn = snap(k, [[0, 0], [0.37, 0], [0.43, 1], [0.72, 1], [0.92, 0], [1, 0]]);
    const hold = k > 0.3 && k < 0.37 ? Math.sin(k * 300) * 0.03 : 0;
    rot(b.armR, -2.5 * up - 0.8 * dn, 0, -0.18 * up); rot(b.foreR, 0.95 * up + 0.45 * dn, 0, 0);
    rot(b.armL, -2.3 * up - 0.8 * dn, 0, 0.2 * up); rot(b.foreL, 1.0 * up + 0.55 * dn, 0, 0);
    rot(b.spine, -0.25 * up + 0.6 * dn + hold, 0, 0); rot(b.chest, -0.08 * up + 0.12 * dn, 0, 0); rot(b.neck, 0.14 * up - 0.34 * dn, 0, 0);
    bend(b, 0.2 * up + 0.5 * dn); a.off.y += 0.12 * curve(k, [[0, 0], [0.3, 1], [0.4, 0], [1, 0]]);
    return { R: { el: lerp(lerp(R.el, 2.3, up), -0.68, dn) + hold, yaw: lerp(R.yaw, -0.12, Math.max(up, dn)) }, L };
  }
  // sFin: the axe thrust straight up in both hands, a roar (impact 0.5 = the roar), held
  const s = curve(k, [[0, 0], [0.4, 1], [1, 1]]), roar = snap(k, [[0, 0], [0.45, 0], [0.52, 1], [1, 1]]);
  rot(b.armR, -2.9 * s, 0, -0.15 * s); rot(b.foreR, 0.9 * s, 0, 0); rot(b.armL, -2.7 * s, 0, 0.3 * s); rot(b.foreL, 0.8 * s, 0, 0);
  rot(b.spine, -0.18 * roar, 0, 0); rot(b.neck, -0.35 * roar, 0, 0); rot(b.jaw, 0.6 * roar, 0, 0); bend(b, 0.3 * roar);
  void mw; return { R: { el: lerp(R.el, Math.PI / 2 + 0.15, s), yaw: lerp(R.yaw, 0, s) }, L };
}

function mage(a: ShowBody, n: string, k: number, mw: number, R: Wr, L: Wr) {
  const b = a.bones;
  if (n === 'sEnter') {
    // out of a pillar of light: he grows up out of a sliver (0 → 0.45), stands floating a little, settles onto the plinth (impact 0.45)
    const g = curve(k, [[0, 0], [0.45, 1]]), fl = curve(k, [[0, 0.5], [0.45, 0.35], [0.8, 0]]);
    a.root.scale.set(lerp(0.15, 1, g), lerp(0.02, 1, g), lerp(0.15, 1, g)); a.off.y += fl;
    const s = curve(k, [[0, 1], [0.6, 1], [1, 0]]);
    rot(b.armR, -1.1 * s, 0, -0.12 * s); rot(b.foreR, 0.6 * s, 0, 0); rot(b.armL, -1.4 * s, 0, 0.5 * s); rot(b.spine, -0.12 * s, 0, 0);
    return { R: { el: lerp(R.el, 1.62, s), yaw: R.yaw }, L };
  }
  if (n === 'sSig') {
    // 举杖 (impact 0.3, the circle bursts), rising onto the toes and hovering, the free hand thrown up; held; lowered
    const s = curve(k, [[0, 0], [0.26, 1], [0.84, 1], [1, 0]]), th = snap(k, [[0, 0], [0.24, 0], [0.32, 1], [0.84, 1], [1, 0]]);
    a.off.y += (0.18 + 0.03 * Math.sin(a.t * 6)) * s;
    rot(b.spine, -0.16 * s, 0, 0); rot(b.neck, -0.22 * s, 0, 0);
    rot(b.armR, -1.35 * s - 0.6 * th, 0, -0.12 * s); rot(b.foreR, 0.7 * s + 0.3 * th, 0, 0);
    rot(b.armL, -1.2 * s - 0.9 * th, 0, 0.55 * s); rot(b.foreL, 0.4 * s, 0, 0);
    void mw; return { R: { el: lerp(R.el, 1.62, s), yaw: R.yaw }, L };
  }
  // sFin: the staff driven straight up overhead in one thrust (impact 0.45), hovering higher, both arms up
  const s = curve(k, [[0, 0], [0.38, 1], [1, 1]]), th = snap(k, [[0, 0], [0.4, 0], [0.47, 1], [1, 1]]);
  a.off.y += 0.12 * s + 0.22 * th;
  rot(b.spine, -0.2 * s, 0, 0); rot(b.neck, -0.3 * s, 0, 0);
  rot(b.armR, -2.3 * s - 0.5 * th, 0, -0.1 * s); rot(b.foreR, 0.6 * s, 0, 0); rot(b.armL, -2.2 * s, 0, 0.4 * s); rot(b.foreL, 0.5 * s, 0, 0);
  return { R: { el: lerp(R.el, 1.62, s), yaw: R.yaw }, L };
}

function rogue(a: ShowBody, n: string, k: number, mw: number, R: Wr, L: Wr) {
  const b = a.bones;
  // the cross: both daggers crossed in front of the face (an X), elbows out, crouched
  const cross = (s: number) => {
    rot(b.armR, -1.25 * s, 0, 0.45 * s); rot(b.foreR, -0.4 * s, 0, 0); rot(b.armL, -1.25 * s, 0, -0.45 * s); rot(b.foreL, -0.4 * s, 0, 0);
    return { R: { el: lerp(R.el, 0.85, s), yaw: lerp(R.yaw % (Math.PI * 2), 0.95, s) }, L: { el: lerp(L.el, 0.85, s), yaw: lerp(L.yaw, -0.95, s) } };
  };
  if (n === 'sEnter') {
    // out of the smoke: nothing until 0.3, then there, crouched low behind crossed blades; rises at 0.7
    const on = k < 0.3 ? 0.001 : 1, low = curve(k, [[0, 1], [0.7, 1], [1, 0]]);
    a.root.scale.setScalar(on); bend(b, 0.25 * low); rot(b.spine, 0.2 * low, 0, 0);
    return cross(low);
  }
  if (n === 'sSig') {
    // 消失 (0.1 → 0.16, in a smoke puff) → 交叉双匕首出现 (impact 0.42: dashing in from the side) → held → back to the idle crouch
    const gone = k > 0.14 && k < 0.4 ? 0.001 : 1, coil = curve(k, [[0, 0], [0.12, 1], [0.15, 0]]), c = curve(k, [[0, 0], [0.4, 1], [0.82, 1], [1, 0]]);
    a.root.scale.setScalar(gone); bend(b, 0.35 * coil + 0.3 * c);
    a.off.x += snap(k, [[0, 0], [0.4, 1.4], [0.47, 0], [1, 0]]) * (k >= 0.4 ? 1 : 0);   // in from his left (the far side from the camera)
    rot(b.spine, 0.25 * c, 0, 0); rot(b.neck, -0.25 * c, 0, 0);
    void mw; return cross(c);
  }
  // sFin: one spin on the spot, the blades flung out to both sides (impact 0.55), held low
  const sp = curve(k, [[0, 0], [0.5, 1]]), out = snap(k, [[0, 0], [0.48, 0], [0.56, 1], [1, 1]]);
  b.hips.rotation.y += sp * Math.PI * 2; bend(b, 0.15 + 0.3 * out);
  rot(b.armR, -0.6 * out, 0, -1.1 * out); rot(b.armL, -0.6 * out, 0, 1.1 * out); rot(b.spine, 0.2 * out, 0, 0);
  return { R: { el: lerp(R.el % (Math.PI * 2), 0.2, out), yaw: lerp(R.yaw % (Math.PI * 2), -0.9, out) }, L: { el: lerp(L.el, 0.2, out), yaw: lerp(L.yaw, 0.9, out) } };
}
