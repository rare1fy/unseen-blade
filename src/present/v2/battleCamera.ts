// Battle staging (R6S, user 2026-11-13 evening: the horizontal line-up and a visible dice dais looked odd — 「站位还是按以前那种」,
// 「场景里不要丢个一个骰子的台面」). Back to the classic line-up: the hero front-left, the enemies across from him up the path.
// What stays from R6S:
//   - the camera keeps its classic angle, and only pulls back (same pitch, higher and farther) when a big enemy or its plate would
//     leave the frame (「遇到大型敌人的时候，镜头得要再高一些，确保可以显示完整敌人」);
//   - dice land in fixed, invisible sockets on the ground in a screen band right of the hero and below the enemies, so they never
//     sit on a character (diceField.ts). The sockets are placed from screen space after each framing.
import * as THREE from 'three';
import type { BattleActor } from '../bestiary/battle';

// user 2026-11-13: 「继续调调站位，你看看这版的站位」 (show-01: fishman vs lich) — the hero a little left of the centre line, seen from
// behind, facing the enemy straight up the path; the camera close enough that the hero is big; the dice right-front of him
export const HERO_POS = new THREE.Vector3(-1.6, 0, 3.0);
/** the classic lanes up the path (no distance rule any more: enemies stand at their lane from the start) */
const LANES: Array<[number, number]> = [[0, -1.9], [-2.3, -2.5], [2.3, -2.5], [-4.0, -2.0], [4.0, -2.0]];
const BOSS_AT: [number, number] = [0, -3.6];
export function foePosition(lane: number, boss: boolean, _withBoss = false) {
  if (boss) return new THREE.Vector3(BOSS_AT[0], 0, BOSS_AT[1]);
  const p = LANES[Math.max(0, lane) % LANES.length];
  return new THREE.Vector3(p[0], 0, p[1]);
}
/** where an entering enemy starts its walk: further up the path */
export function entranceFrom(to: THREE.Vector3) { return new THREE.Vector3(to.x, 0, to.z - 4.2); }

/** reference-px budget for the plate above an enemy (intent + HP bar + status row) */
const PLATE_PX = 92;
export interface FramingSubject { box: THREE.Box3; hero?: boolean; platePx?: number; plateW?: number }
export function actorSubject(a: BattleActor, home: THREE.Vector3, hero = false): FramingSubject {
  const w = Math.max(0.8, a.width) / 2, top = a.top + (hero ? 0.85 : 0.3);
  const box = new THREE.Box3(new THREE.Vector3(home.x - w, Math.min(0, home.y), home.z - w), new THREE.Vector3(home.x + w, home.y + top, home.z + w));
  // big enemies (bosses) also have the boss bar at the top of the screen, and their own plate sits lower on the body: budget less
  return hero ? { box, hero } : { box, platePx: a.top > 2.8 ? 36 : PLATE_PX };
}

/** dice sockets: screen band (fractions of H / W) and the die's on-screen size (reference px at 1280×720; ≥ 72 required) */
export const BANDS = { diceY: 0.655, diceX: 0.6, top: 0.09 };
export const DIE_PX = 64;
/** the classic battle camera (R5): eye / look / fov as the director takes them. Tunable live: __dh.show2() → CAMERA_TUNE + layout()
 *  user 11-14: 「镜头我觉得默认要再上拉仰起来一点，看到更多战场和场景信息」 — the eye higher and farther, the look further up the path */
// user 11-14, tuned in game (调参): 俯角 30.4° 距离 0.81 看点 Z −4.1 Y −0.6 视野 41 (was 39° / 0.62 / −2.4 / 42; then 35.4° / 0.74 / −2.8)
const BACK_LEN = Math.hypot(12.8, 18.0), backAt = (deg: number): [number, number, number] => [0.3, BACK_LEN * Math.sin(deg * Math.PI / 180), BACK_LEN * Math.cos(deg * Math.PI / 180)];
export const CAMERA_TUNE = { lookY: -0.6, lookZ: -4.1, back: backAt(30.4), dist: 0.81, fov: 41 };
const LOOK0 = new THREE.Vector3(), EYE0 = new THREE.Vector3();
let FOV0 = 42;
function readTune() {
  const T = CAMERA_TUNE; LOOK0.set(0, T.lookY, T.lookZ); EYE0.copy(LOOK0).add(new THREE.Vector3(...T.back).multiplyScalar(T.dist)); FOV0 = T.fov;
}
readTune();
(globalThis as unknown as { __camTune?: typeof CAMERA_TUNE }).__camTune = CAMERA_TUNE;   // debug: tune, then __dh.show2().layout()

export interface CameraFit { eye: THREE.Vector3; look: THREE.Vector3; fov: number; pitch: number; distance: number; fits: boolean;
  /** the dice sockets: centre on the ground and scale (1 = a 0.8 m die) */
  field: { c: THREE.Vector3; s: number } }
export interface FitOpts { W: number; H: number; k: number; shift?: number; portrait?: boolean; leftPx?: number; rightPx?: number }

const _cam = new THREE.PerspectiveCamera(), _p = new THREE.Vector3();
function setCam(eye: THREE.Vector3, look: THREE.Vector3, o: FitOpts) {
  _cam.fov = FOV0 * (o.portrait ? 1 : 0.86); _cam.aspect = o.W / o.H; _cam.near = 0.1; _cam.far = 200;
  _cam.position.copy(eye); _cam.up.set(0, 1, 0); _cam.lookAt(look); _cam.updateProjectionMatrix(); _cam.updateMatrixWorld();
}
/** screen y (px from the top) of a world point under the temp camera */
function screenY(p: THREE.Vector3, o: FitOpts) { _p.copy(p).project(_cam); return (1 - _p.y) / 2 * o.H - (o.shift ?? 0); }   // the director lifts the image by shift px

export function fitBattle(subjects: FramingSubject[], o: FitOpts): CameraFit {
  readTune();
  const back = EYE0.clone().sub(LOOK0), topPx = o.H * BANDS.top;
  let m = 1, eye = EYE0.clone(), fits = false;
  for (; m <= 1.4; m += 0.03) {
    eye = LOOK0.clone().addScaledVector(back, m); setCam(eye, LOOK0, o);
    fits = subjects.every(s => {
      const plate = (s.platePx ?? 0) * o.k, b = s.box;
      for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) if (screenY(_p.set(x, b.max.y, z), o) - plate < topPx) return false;
      return true;
    });
    if (fits) break;
  }
  const pitch = Math.atan2(eye.y - LOOK0.y, Math.hypot(eye.x - LOOK0.x, eye.z - LOOK0.z)) * 180 / Math.PI;
  return { eye, look: LOOK0.clone(), fov: FOV0, pitch, distance: eye.distanceTo(LOOK0), fits, field: placeField(eye, LOOK0, o, subjects) };
}

/** user 2026-11-13: 「骰子就落在以前那个位置吧先，玩家和敌人之间」 — the sockets sit on the path halfway between the hero and the
 *  front-most enemy (x = the path centre); the scale makes a die DIE_PX reference px on screen at that depth */
function placeField(eye: THREE.Vector3, look: THREE.Vector3, o: FitOpts, subjects: FramingSubject[]) {
  setCam(eye, look, o);
  const hero = subjects.find(s => s.hero), foes = subjects.filter(s => !s.hero);
  const heroZ = hero ? (hero.box.min.z + hero.box.max.z) / 2 : 2.6;
  const foeZ = foes.length ? Math.max(...foes.map(f => f.box.max.z)) : -2.0;
  const heroX = hero ? (hero.box.min.x + hero.box.max.x) / 2 : -1.6;
  const c = new THREE.Vector3(0, 0, heroZ - (heroZ - foeZ) * 0.45);   // right-front of the hero, between him and the enemies (show-01)
  const fwd = look.clone().sub(eye).normalize(), vf = _cam.fov * Math.PI / 180, focal = (o.H / 2) / Math.tan(vf / 2);
  let s = 1;
  // the row starts just right of the hero whatever its scale (half width = 2.6 · GAP/1.15 · s, see diceField.ts)
  for (let i = 0; i < 3; i++) { c.x = heroX + 1.15 + 2.55 * s; const dep = c.clone().setY(0.4 * s).sub(eye).dot(fwd); s = DIE_PX * o.k * dep / (0.8 * focal); }
  c.x = heroX + 1.15 + 2.55 * s;   // R7A: +0.25 so a 5th–6th mage die clears the staff
  return { c, s };
}
