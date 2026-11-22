// 11-19 (用户：「开场雪地剧情走路像在走滑步，动作也不自然」): her walk by the distance she covers. The old walk swung the thighs on a
// sine at a fixed rate, whatever her speed, and the swing's shape had the forward leg lowest — the foot that should have been on the
// snow slid along with her (measured ~0.8 m/s in the prologue's walk-in, ~0.5 m/s in a slow walk in play). Here, below a run, the two
// legs are placed by a step planner like the foes' (foes/foe_motion.ts FoeGait): the phase advances by the ground she covers (one stride
// cycle = a fixed multiple of her hip height), the planted foot stays put on the ground and level, the swinging one lifts and reaches
// ahead; the hips ride on the planted leg; the arms swing against the legs. A run (≥ ~55 % of top speed) hands back to the old
// sprint pose — it reads right at that speed — over a short blend. Anything else she is doing (an action, the air, a crouch, 藏锋, a
// braking step) leaves the legs as the pose made them.
import * as THREE from 'three';
import type { Bone } from '../actors/rig';

type Bones = Record<string, Bone>;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (x: number) => { const u = clamp(x); return u * u * (3 - 2 * u); };
const wrap = (x: number) => x - Math.floor(x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _e = new THREE.Euler(), _toe = new THREE.Quaternion();

/** a foot through one stride cycle u (0..1): on the ground for the first `duty`, then lifted and carried ahead. travel = how far
 *  ahead of the hip (m); roll = heel-strike / toe-off ankle pitch (rad, + = toes down) */
function foot(u: number, duty: number, stride: number, lift: number) {
  const sw = clamp((u - duty) / (1 - duty)), adv = smooth(sw);
  const clearance = lift * Math.sin(Math.PI * sw) ** 2;
  // Subtle natural ankle roll in swing: toes press down on push-off (sw ~0.15), lift gently before heel-strike (sw ~0.85)
  const rawPitch = u <= duty ? 0 : 0.34 * Math.sin(Math.PI * 2 * sw) * Math.sin(Math.PI * sw);
  const room = clearance / 0.22;
  return { down: u <= duty, travel: stride * (duty / 2 - u + adv), lift: clearance, sw, pitch: clamp(rawPitch, -room, room) };
}

/** two-bone IK of one leg onto an ankle spot (hip-local coordinates: x across, y up, z forward), the foot turned level with the ground
 *  (pitch = toes down), weight w (0 = leave the pose as it is) */
function aim(b: Bones, s: 'L' | 'R', x: number, y: number, z: number, pitch: number, w: number) {
  const leg = b['leg' + s], shin = b['shin' + s], ft = b['foot' + s], hips = b.hips; if (!leg || !shin || !ft || !hips) return;
  _qi.copy(hips.quaternion).invert();
  _t.set(x, y, z).sub(hips.position).applyQuaternion(_qi).sub(leg.position);
  const T = Math.abs(shin.rest?.p.y ?? shin.position.y), S = Math.abs(ft.rest?.p.y ?? ft.position.y);
  const L = Math.min(T + S - 1e-4, _t.length());
  const knee = Math.acos(clamp((L * L - T * T - S * S) / (2 * T * S), -1, 1));
  const roll = Math.atan2(_t.x, -_t.y);
  const sw = Math.atan2(-_t.z, Math.hypot(_t.x, _t.y)) - Math.atan2(S * Math.sin(knee), T + S * Math.cos(knee));
  leg.quaternion.slerp(_q.setFromEuler(_e.set(sw, 0, roll, 'ZXY')), w);
  shin.quaternion.slerp(_q.setFromEuler(_e.set(knee, 0, 0)), w);
  _toe.copy(hips.quaternion).multiply(leg.quaternion).multiply(shin.quaternion).invert().multiply(_q.setFromEuler(_e.set(pitch, 0, 0)));
  ft.quaternion.slerp(_toe, w);
}

/** per actor: the stride phase, where she was a frame ago, the smoothed speed, the walk's weight */
interface Gait { ph: number; x: number; z: number; sp: number; w: number; t: number }
const GAIT = new WeakMap<object, Gait>();

/** after the pose: re-place the legs for a walk. pos = where she is (the actor's home), yaw her facing, t her clock, run = 0..1 of top
 *  speed she is moving at (the controller's / the cutscene's), allow = 0..1 how far the walk may take over (0 in an action, the air…),
 *  treadmill = optional virtual forward speed (m/s) used by the ?anim treadmill preview where pos stays fixed */
export function stepWalk(self: object, b: Bones, pos: THREE.Vector3, yaw: number, t: number, run: number, allow: number, treadmill = 0, sprintPhase?: number): { w: number; ph: number } {
  let g = GAIT.get(self);
  if (!g) { g = { ph: 0, x: pos.x, z: pos.z, sp: 0, w: 0, t }; GAIT.set(self, g); }
  const dt = Math.max(0, Math.min(0.1, t - g.t)); g.t = t;
  const dx = pos.x - g.x, dz = pos.z - g.z; g.x = pos.x; g.z = pos.z;
  const rawD = Math.hypot(dx, dz), d = treadmill > 0 ? treadmill * dt : rawD;
  const v = dt > 0 ? d / dt : 0;
  if (v > 12) { g.sp = 0; g.w = 0; return { w: 0, ph: g.ph }; }   // (a teleport is not a step)
  // the forward part of the motion only (a side-step or a back-step still steps, just by its length)
  g.sp += ((dt > 0 ? v : g.sp) - g.sp) * (1 - Math.exp(-dt / 0.08));
  const hips = b.hips, shin = b.shinL, ft = b.footL; if (!hips?.rest || !shin || !ft) return { w: 0, ph: g.ph };
  const stand = hips.rest.p.y, T = Math.abs(shin.rest?.p.y ?? 0.35), S = Math.abs(ft.rest?.p.y ?? 0.28), LEG = T + S;
  // Only engage slow-walk IK during genuine slow walking (≤ ~2.4 m/s & run < 0.52), NEVER during sprint ramp-up!
  const walkSpeedOk = 1 - smooth((Math.max(g.sp, v) - 2.2) / 0.7);
  const want = allow * smooth(g.sp / 0.14) * walkSpeedOk * (1 - smooth((run - 0.48) / 0.14));
  g.w += (want - g.w) * (1 - Math.exp(-dt / (want < g.w ? 0.035 : 0.07)));
  if (g.w < 0.01) {
    g.w = 0;
    if (sprintPhase != null) g.ph = wrap((sprintPhase - Math.PI / 2) / (Math.PI * 2));
    return { w: 0, ph: g.ph };
  }
  // one stride cycle (two steps) in metres: poised natural stride (cap step-rate so walk IK can never frantic-stomp)
  const q = clamp(g.sp / 2.2), stride = stand * mix(1.05, 1.38, q);
  const maxStep = dt * 2.4;
  g.ph = wrap(g.ph + Math.min(d / stride, maxStep));
  const duty = mix(0.58, 0.54, q), lift = stand * mix(0.065, 0.105, q);
  const fL = foot(g.ph, duty, stride, lift), fR = foot(wrap(g.ph + 0.5), duty, stride, lift);
  // where the movement points relative to her facing (she can walk a little sideways in a cutscene)
  const hd = treadmill > 0 ? 0 : (rawD > 1e-5 ? Math.atan2(dx, dz) - yaw : 0), fw = Math.cos(hd), ac = Math.sin(hd);
  // the hips: poised upright height carried cleanly over the planted leg (subtle natural 3–4cm vertical rhythm, never squatting)
  let hy = stand;
  for (const [s, f] of [['L', fL], ['R', fR]] as const) {
    if (!f.down && (fL.down || fR.down)) continue;
    const lr = b['leg' + s]?.rest?.p; if (!lr) continue;
    hy = Math.min(hy, stand - LEG + Math.sqrt(Math.max(0, (LEG * 0.992) ** 2 - f.travel * f.travel)) + f.lift);
  }
  hips.position.x = mix(hips.position.x, hips.rest.p.x, g.w);
  hips.position.y = mix(hips.position.y, hy, g.w);
  hips.position.z = mix(hips.position.z, hips.rest.p.z, g.w);
  // True anatomical pelvic-thoracic counter-rotation:
  // At ph=0 (tw=+1), left leg (+X) is FORWARD -> left hip rotates forward (hips.y < 0), right shoulder rotates forward (spine.y > 0)
  const tw = Math.cos(g.ph * Math.PI * 2);
  if (b.hips) { b.hips.rotation.x = mix(b.hips.rotation.x, 0.0, g.w); b.hips.rotation.z = mix(b.hips.rotation.z, 0.022 * tw, g.w); }
  for (const [s, f] of [['L', fL], ['R', fR]] as const) {
    const lr = b['leg' + s]?.rest?.p; if (!lr) continue;
    aim(b, s, lr.x + ac * f.travel, stand - LEG + lr.y + f.lift, fw * f.travel, f.pitch, g.w);
  }
  const k = g.w * clamp(g.sp / 1.0);
  if (b.hips) b.hips.rotation.y = mix(b.hips.rotation.y, -0.048 * tw, g.w);
  if (b.spine) {
    b.spine.rotation.x = mix(b.spine.rotation.x, 0.03 + 0.03 * q, g.w);
    b.spine.rotation.y = mix(b.spine.rotation.y, 0.085 * tw, g.w);
    b.spine.rotation.z = mix(b.spine.rotation.z, -0.022 * tw, g.w);
  }
  if (b.chest) b.chest.rotation.x = mix(b.chest.rotation.x, 0.0, g.w);
  if (b.neck) { b.neck.rotation.x = mix(b.neck.rotation.x, -0.03, g.w); b.neck.rotation.y = mix(b.neck.rotation.y, -0.038 * tw, g.w); }
  // the arms: relaxed upright natural swing opposite each leg (left arm hangs gracefully at side, never hunched over stomach)
  if (b.armL) { b.armL.rotation.x = mix(b.armL.rotation.x, (b.armL.rest?.r.x ?? 0) + 0.30 * tw, k); b.armL.rotation.z = mix(b.armL.rotation.z, 0.14, g.w); }
  if (b.armR) { b.armR.rotation.x = mix(b.armR.rotation.x, (b.armR.rest?.r.x ?? 0) + 0.16 - 0.15 * tw, k); b.armR.rotation.z = mix(b.armR.rotation.z, -0.18, g.w); }
  if (b.foreL) b.foreL.rotation.x = mix(b.foreL.rotation.x, (b.foreL.rest?.r.x ?? 0) - 0.24 - 0.10 * Math.max(0, -tw), k);
  if (b.foreR) b.foreR.rotation.x = mix(b.foreR.rotation.x, (b.foreR.rest?.r.x ?? 0) - 0.18 - 0.06 * Math.max(0, tw), k);
  return { w: g.w, ph: g.ph };
}
/** forget her stride (a new actor in the same place, a teleport) */
export function resetWalk(self: object) { GAIT.delete(self); }
