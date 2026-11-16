// fx5: skill-specific effects used by the skill table (present/v2/skillStage.ts): slashes, bolts, projectiles, the 铁壁 wall,
// ice shell / spikes, stun stars, meteors, magic circles, afterimages, armour shards. Particles go through the shared pools
// (engine/particles), solid pieces through fx/blocks.ts; everything is fire-and-forget or returns a small handle / promise.
import * as THREE from 'three';
import { V3, C, R, TAU, WHITE } from '../engine/world';
import { PADD, PALPHA, TILE } from '../engine/particles';
import { ringFx, decalFx, lightPulse, addDebris } from '../engine/prims';
import { after, animP, ease, shake } from '../engine/clock';
import { addBlock, release, fling, type Blk } from './blocks';
import { fxGlow, fxSparks, fxSmoke, fxEmbers, fxFlare, trailSeg } from './fx';

type Col = THREE.ColorRepresentation;
const UP = V3(0, 1, 0);
/** a unit vector perpendicular to d in the ground plane (the actor's side) */
export const sideOf = (d: THREE.Vector3) => V3(d.z, 0, -d.x).normalize();
const flat = (d: THREE.Vector3) => { const v = V3(d.x, 0, d.z); return v.lengthSq() < 1e-6 ? V3(0, 0, -1) : v.normalize(); };

// ---------------------------------------------------------------- slashes
/** a crescent of streaks swept along an arc around c: horizontal (sweep) or in the vertical plane through fwd (chop) */
export function fxSlashArc(c: THREE.Vector3, fwd: THREE.Vector3, col: Col, o: { r?: number; span?: number; n?: number; life?: number; size?: number; vertical?: boolean; dir?: 1 | -1; dur?: number; bright?: number } = {}) {
  const f = flat(fwd), s = sideOf(f), r = o.r ?? 1.1, span = o.span ?? 2.2, n = o.n ?? 22, cc = C(col), dur = o.dur ?? 0.08, dir = o.dir ?? 1;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), a = dir * (-span / 2 + span * u);
    const radial = o.vertical ? f.clone().multiplyScalar(Math.sin(a)).addScaledVector(UP, Math.cos(a)) : f.clone().multiplyScalar(Math.cos(a)).addScaledVector(s, Math.sin(a));
    const tan = o.vertical ? f.clone().multiplyScalar(Math.cos(a)).addScaledVector(UP, -Math.sin(a)) : f.clone().multiplyScalar(-Math.sin(a)).addScaledVector(s, Math.cos(a));
    tan.multiplyScalar(dir);
    const p = c.clone().addScaledVector(radial, r), edge = 0.35 + 0.65 * Math.sin(u * Math.PI);
    after(u * dur, () => {
      PADD.emit({ p, v: tan.clone().multiplyScalar(9), s0: (o.size ?? 0.13) * edge, s1: 0.02, life: (o.life ?? 0.26) * (0.7 + 0.3 * u), c0: WHITE, c1: cc, bright: o.bright ?? 2.8, tile: TILE.streak, stretch: 0.05, drag: 9, fadeIn: 0 });
      if (i % 3 === 0) PADD.emit({ p: p.clone().addScaledVector(radial, -0.08), v: tan.clone().multiplyScalar(4), s0: 0.34 * edge, s1: 0.1, life: 0.22, c0: cc, bright: 1.4, tile: TILE.glow, drag: 8, fadeIn: 0 });
    });
  }
}
/** a straight slash stroke from a to b (chop mark, the 处决 cross) */
export function fxSlashLine(a: THREE.Vector3, b: THREE.Vector3, col: Col, o: { n?: number; size?: number; life?: number; dur?: number; bright?: number } = {}) {
  const n = o.n ?? 16, d = b.clone().sub(a), dn = d.clone().normalize(), cc = C(col), dur = o.dur ?? 0.06;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), p = a.clone().addScaledVector(d, u), edge = 0.4 + 0.6 * Math.sin(u * Math.PI);
    after(u * dur, () => {
      PADD.emit({ p, v: dn.clone().multiplyScalar(7), s0: (o.size ?? 0.12) * edge, s1: 0.02, life: o.life ?? 0.3, c0: WHITE, c1: cc, bright: o.bright ?? 3, tile: TILE.streak, stretch: 0.06, drag: 10, fadeIn: 0 });
      if (i % 2 === 0) PADD.emit({ p, v: V3(), s0: 0.26 * edge, s1: 0.06, life: 0.2, c0: cc, bright: 1.5, tile: TILE.glow, fadeIn: 0 });
    });
  }
}

// ---------------------------------------------------------------- lightning
/** a jagged bolt from a to b: glow ribbon + hot core + a side branch + a light pulse at the end */
export function fxBolt(a: THREE.Vector3, b: THREE.Vector3, col: Col, o: { jag?: number; seg?: number; width?: number; life?: number; branch?: boolean } = {}) {
  const seg = o.seg ?? 8, jag = o.jag ?? 0.32, w = o.width ?? 0.14, life = o.life ?? 0.24, d = b.clone().sub(a), L = d.length();
  const s1 = sideOf(d.lengthSq() > 1e-6 ? d : V3(1, 0, 0)), s2 = d.clone().cross(s1).normalize();
  const pts = [a.clone()];
  for (let i = 1; i < seg; i++) { const u = i / seg, env = Math.sin(u * Math.PI), j = jag * Math.min(1.6, L / 3); pts.push(a.clone().addScaledVector(d, u).addScaledVector(s1, R(-1, 1) * j * env).addScaledVector(s2, R(-1, 1) * j * env * 0.6)); }
  pts.push(b.clone());
  for (let i = 1; i < pts.length; i++) { trailSeg(pts[i - 1], pts[i], col, w, { life, bright: 2.6, spark: 0.4 }); trailSeg(pts[i - 1], pts[i], 0xffffff, w * 0.4, { life: life * 0.7, core: WHITE, bright: 3.2, spark: 0 }); }
  if (o.branch !== false && pts.length > 4) { const k = 2 + Math.floor(Math.random() * (pts.length - 4)), p0 = pts[k], p1 = p0.clone().addScaledVector(d.clone().normalize(), L * 0.15).addScaledVector(s1, R(-0.8, 0.8)).add(V3(0, R(-0.4, 0.3), 0)); trailSeg(p0, p1, col, w * 0.6, { life: life * 0.8, bright: 2.2 }); }
  lightPulse(b.clone().add(V3(0, 0.3, 0.6)), col, 1.3, 0.16, 5);
  fxFlare(b, col, 1.0, 0.18);
}

// ---------------------------------------------------------------- energy
/** motes pulled in from a sphere of radius r into p (charge-up) */
export function fxGather(p: THREE.Vector3, col: Col, o: { r?: number; n?: number; life?: number; size?: number } = {}) {
  const r = o.r ?? 1.6, n = o.n ?? 18, life = o.life ?? 0.5, cc = C(col);
  for (let i = 0; i < n; i++) {
    const d = V3(R(-1, 1), R(-0.4, 1), R(-1, 1)).normalize(), at = p.clone().addScaledVector(d, r * R(0.7, 1.1)), lf = life * R(0.75, 1);
    PADD.emit({ p: at, v: d.multiplyScalar(-(r / lf) * 1.05), s0: o.size ?? R(0.06, 0.1), s1: 0.03, life: lf, c0: cc, c1: WHITE, bright: 2.6, tile: TILE.spark, stretch: 0.05, fadeIn: 0.15 });
  }
}
/** a ground magic circle: two stepped rings + rune blocks circling the rim for `life` seconds */
export function fxCircle(p: THREE.Vector3, col: Col, r = 1.4, life = 0.9, o: { runes?: number; spin?: number } = {}) {
  const g = V3(p.x, 0.05, p.z);
  ringFx(g, { color: col, radius: r, r0: r * 0.95, life, width: 0.12, fill: 0.06, bright: 1.3 });
  ringFx(g, { color: col, radius: r * 0.62, r0: r * 0.6, life: life * 0.95, width: 0.1, fill: 0, bright: 1.4 });
  const n = o.runes ?? 8;
  for (let i = 0; i < n; i++) addBlock(V3(g.x, 0.08, g.z), { orbit: { r: r * 0.8, w: (o.spin ?? 1.6) * (i % 2 ? 1 : 1), a: (i / n) * TAU }, size: [0.12, 0.05, 0.12], col, bright: 1.8, life, grow: 0.15, shrink: 0.25 });
  lightPulse(V3(g.x, 0.6, g.z), col, 0.8, life, 5);
}
/** a ground shockwave: ring + decal + dust (+ a billboard ring when big) */
export function fxShock(p: THREE.Vector3, col: Col, r = 2.2, o: { decal?: boolean; dust?: boolean; life?: number } = {}) {
  const g = V3(p.x, 0.05, p.z);
  ringFx(g, { color: col, radius: r, r0: 0.3, life: o.life ?? 0.45, width: 0.22, fill: 0.08, bright: 2 });
  ringFx(g, { color: 0xffffff, radius: r * 0.6, r0: 0.2, life: (o.life ?? 0.45) * 0.7, width: 0.16, fill: 0, bright: 1.4 });
  if (o.decal !== false) decalFx(g, { radius: r * 0.5, alpha: 0.4, life: 2.4 });
  if (o.dust !== false) for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; fxSmoke(V3(g.x + Math.cos(a) * 0.5, 0.1, g.z + Math.sin(a) * 0.5), 0x5a5862, 1, { spd: 0.2, up: 0.3, s: 0.32, alpha: 0.32, life: 0.9 }); PALPHA.emit({ p: V3(g.x, 0.12, g.z), v: V3(Math.cos(a) * 5, 0.4, Math.sin(a) * 5), s0: 0.3, s1: 0.6, life: 0.45, c0: C(0x6a6670), alpha: 0.35, tile: TILE.smoke, drag: 5 }); }
}

// ---------------------------------------------------------------- 铁壁: the armour wall that condenses in front of the hero
export interface Hold { release(fade?: number): void; blocks: Blk[] }
/** a wall of steel-blue plates rising row by row at `at` (ground point), facing along fwd; held until release() */
export function fxShieldWall(at: THREE.Vector3, fwd: THREE.Vector3, o: { w?: number; h?: number; col?: Col; cols?: number; rows?: number; hold?: number } = {}): Hold {
  const f = flat(fwd), s = sideOf(f), cols = o.cols ?? 5, rows = o.rows ?? 4, W = o.w ?? 1.7, H = o.h ?? 1.5, cw = W / cols, rh = H / rows, col = C(o.col ?? 0x8ac8ff);
  const yaw = Math.atan2(f.x, f.z), blocks: Blk[] = [];
  // rim = lit steel plates (solid), inside = panes of blue light (additive, kept dim so the bloom does not swallow the hero)
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const edge = i === 0 || i === cols - 1 || j === rows - 1, x = (i - (cols - 1) / 2) * cw, y = 0.12 + (j + 0.5) * rh;
    const p = at.clone().addScaledVector(s, x).add(V3(0, y, 0)), delay = j * 0.05 + Math.abs(i - (cols - 1) / 2) * 0.02;
    if (edge) blocks.push(addBlock(p, { size: [cw * 0.94, rh * 0.9, 0.14], col: o.col ? C(o.col).lerp(C(0x8a96a8), 0.55) : 0x8aa2c0, bright: 1, glow: false, hold: true, delay, grow: 0.16, rot: yaw }));
    else blocks.push(addBlock(p, { size: [cw * 0.9, rh * 0.86, 0.08], col, bright: 0.34, hold: true, delay, grow: 0.16, rot: yaw }));
  }
  // the rim plates catch the light: a sheen that climbs the wall
  for (let j = 0; j < rows; j++) after(0.08 + j * 0.05, () => PADD.emit({ p: at.clone().add(V3(0, 0.12 + (j + 0.5) * rh, 0)).addScaledVector(f, 0.08), v: V3(0, 1.2, 0), s0: W * 0.32, s1: W * 0.2, life: 0.22, c0: WHITE, c1: col, bright: 0.6, tile: TILE.glow, fadeIn: 0 }));
  lightPulse(at.clone().add(V3(0, 1, 0)).addScaledVector(f, -0.4), col, 2, 0.5, 5);
  const h = { blocks, release(fade = 0.3) { blocks.forEach((b, i) => after(i * 0.012, () => { release(b, fade); PADD.emit({ p: b.p.clone(), v: V3(R(-0.3, 0.3), R(0.6, 1.4), R(-0.3, 0.3)), s0: 0.1, s1: 0.02, life: 0.5, c0: WHITE, c1: col, bright: 2, tile: TILE.spark, fadeIn: 0 }); })); } };
  if (o.hold) after(o.hold, () => h.release());
  return h;
}
/** a bright plate flash at a point (perfect block 「叮」, a hit stopped by armour) */
export function fxPlateFlash(p: THREE.Vector3, fwd: THREE.Vector3, col: Col = 0xbfe8ff) {
  const f = flat(fwd), yaw = Math.atan2(f.x, f.z);
  addBlock(p, { size: [1.1, 1.1, 0.08], col, bright: 1.6, life: 0.3, grow: 0.05, shrink: 0.25, rot: yaw });
  fxFlare(p, col, 1.6, 0.25); fxSparks(p, col, 14, 5, { hot: true, dir: f, life: 0.35 });
}

// ---------------------------------------------------------------- ice
/** a voxel ice shell round an actor (host-attached, held until shatter()) */
export function fxIceShell(host: THREE.Object3D, w: number, h: number): Hold & { shatter(): void } {
  const blocks: Blk[] = [], col = C(0x9ae8ff), cols = Math.max(3, Math.round(w / 0.32)), rows = Math.max(3, Math.round(h / 0.4)), cw = w / cols, rh = h / rows;
  for (let j = 0; j < rows; j++) for (let side = 0; side < 4; side++) for (let i = 0; i < cols; i++) {
    if ((i + j + side) % 2 && j < rows - 1) continue;   // a checker of panes: the body shows through, the shell still reads as a box
    const t = (i - (cols - 1) / 2) * cw, half = w / 2, lp = side === 0 ? V3(t, 0, half) : side === 1 ? V3(t, 0, -half) : side === 2 ? V3(half, 0, t) : V3(-half, 0, t);
    lp.y = (j + 0.5) * rh;
    const sz: [number, number, number] = side < 2 ? [cw * 0.92, rh * 0.9, 0.09] : [0.09, rh * 0.9, cw * 0.92];
    blocks.push(addBlock(V3(), { host, lp, size: sz, col: j === rows - 1 ? WHITE.clone().lerp(col, 0.5) : col, bright: 0.2 + 0.1 * (j / rows), hold: true, delay: j * 0.04, grow: 0.12 }));   // dim: the body shows through, no white blob
  }
  // a cap and a few solid chunks of ice at the feet
  blocks.push(addBlock(V3(), { host, lp: V3(0, h + 0.04, 0), size: [w * 0.8, 0.08, w * 0.8], col: WHITE.clone().lerp(col, 0.5), bright: 0.3, hold: true, delay: rows * 0.04, grow: 0.12 }));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; blocks.push(addBlock(V3(), { host, lp: V3(Math.cos(a) * w * 0.55, 0.12, Math.sin(a) * w * 0.55), size: [0.22, 0.24, 0.22], col: 0xb8e8f8, bright: 1, glow: false, hold: true, grow: 0.1 })); }
  let done = false;
  return {
    blocks,
    release(fade = 0.3) { if (done) return; done = true; for (const b of blocks) release(b, fade); },
    shatter() {
      if (done) return; done = true;
      const c = host.localToWorld(V3(0, h * 0.5, 0));
      for (const b of blocks) { const at = host.localToWorld(b.lp.clone()); fling(b, at.sub(c).normalize().multiplyScalar(R(2.5, 5)).add(V3(0, R(2, 4), 0)), { grav: 16, life: R(0.6, 1.0), spin: 10 }); }
      fxSparks(c, 0xc8f4ff, 22, 5, { hot: true, life: 0.5 }); fxGlow(c, 0x9ae8ff, 1.8, 0.3, 2);
    },
  };
}
/** ice spikes erupting from the ground round p */
export function fxIceSpikes(p: THREE.Vector3, r = 0.8, n = 6, o: { h?: number; delay?: number } = {}) {
  const hh = o.h ?? 1.0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R(-0.3, 0.3), rr = r * R(0.55, 1), h = hh * R(0.6, 1.2), at = V3(p.x + Math.cos(a) * rr, h / 2, p.z + Math.sin(a) * rr);
    addBlock(at, { size: [0.2, h, 0.2], col: i % 2 ? 0xbff0ff : 0x7ad8ff, bright: 1, glow: false, rise: true, grow: 0.12, life: 1.1, shrink: 0.35, delay: (o.delay ?? 0) + i * 0.02 });
    addBlock(at.clone(), { size: [0.26, h * 1.04, 0.26], col: 0x7ad8ff, bright: 0.5, rise: true, grow: 0.12, life: 0.9, shrink: 0.3, delay: (o.delay ?? 0) + i * 0.02 });
  }
  after(o.delay ?? 0, () => { fxSparks(V3(p.x, 0.3, p.z), 0xc8f4ff, 16, 4, { life: 0.45 }); fxSmoke(V3(p.x, 0.1, p.z), 0xc8e8f0, 4, { alpha: 0.3, s: 0.35, up: 0.6 }); });
}
/** ground frost: a pale ring creeping out from p */
export function fxFrost(p: THREE.Vector3, r: number, life = 0.6) {
  const g = V3(p.x, 0.05, p.z);
  ringFx(g, { color: 0x9ae8ff, radius: r, r0: 0.4, life, width: 0.3, fill: 0.25, bright: 1.6 });
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; PADD.emit({ p: V3(g.x, 0.15, g.z), v: V3(Math.cos(a) * r / life, 0.3, Math.sin(a) * r / life), s0: 0.12, s1: 0.04, life: life * 0.9, c0: WHITE, c1: C(0x7ad8ff), bright: 2.4, tile: TILE.flare, spin: R(-3, 3), fadeIn: 0 }); }
}

// ---------------------------------------------------------------- stun
/** three gold voxel stars circling above an actor's head while it is stunned */
export function fxStunStars(host: THREE.Object3D, y: number, r: number): Hold {
  const blocks: Blk[] = [];
  for (let i = 0; i < 3; i++) {
    const lp = V3(0, y, 0), a = (i / 3) * TAU, o = { r, w: 4.2, a, bob: 0.05 };
    // dim on purpose: at full bloom three stars read as three lamps
    blocks.push(addBlock(V3(), { host, lp, orbit: o, size: [0.13, 0.13, 0.05], col: 0xffc840, bright: 0.75, hold: true, grow: 0.15 }));
    blocks.push(addBlock(V3(), { host, lp, orbit: o, size: [0.05, 0.26, 0.05], col: 0xffe8a0, bright: 0.55, hold: true, grow: 0.15 }));
    blocks.push(addBlock(V3(), { host, lp, orbit: o, size: [0.26, 0.05, 0.05], col: 0xffe8a0, bright: 0.55, hold: true, grow: 0.15 }));
  }
  return { blocks, release(fade = 0.25) { for (const b of blocks) release(b, fade); } };
}

// ---------------------------------------------------------------- projectiles
/** a projectile from a to b; resolves on arrival. kind: knife (voxel blade + violet trail), missile (arcane, wobbling), shard (ice) */
export async function fxProjectile(a: THREE.Vector3, b: THREE.Vector3, kind: 'knife' | 'missile' | 'shard', o: { dur?: number; col?: Col; arc?: number } = {}) {
  const dur = o.dur ?? (kind === 'knife' ? 0.16 : kind === 'shard' ? 0.2 : 0.3), col = C(o.col ?? (kind === 'knife' ? 0xb070ff : kind === 'shard' ? 0x9ae8ff : 0xc080ff));
  const d = b.clone().sub(a), dn = d.clone().normalize(), s = sideOf(d), yaw = Math.atan2(dn.x, dn.z), pitch = -Math.asin(Math.max(-1, Math.min(1, dn.y)));
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  const parts: Blk[] = [];
  if (kind === 'knife') { parts.push(addBlock(a, { size: [0.05, 0.03, 0.34], col: 0xe8e8f4, bright: 1.1, glow: false, hold: true, grow: 0.02 }), addBlock(a, { size: [0.08, 0.05, 0.1], col: 0x3a2a4a, glow: false, hold: true, grow: 0.02 })); }
  else if (kind === 'shard') { parts.push(addBlock(a, { size: [0.12, 0.12, 0.56], col: 0xd8f6ff, bright: 1, glow: false, hold: true, grow: 0.04 }), addBlock(a, { size: [0.18, 0.18, 0.62], col: 0x7ad8ff, bright: 0.8, hold: true, grow: 0.04 })); }
  else parts.push(addBlock(a, { size: 0.2, col, bright: 1.8, hold: true, grow: 0.05, spin: 9 }));
  for (const p of parts) p.q.copy(q);
  let last = a.clone();
  await animP(dur, k => {
    const e = kind === 'missile' ? ease.inOut(k) : k, p = a.clone().addScaledVector(d, e);
    if (o.arc) p.y += Math.sin(k * Math.PI) * o.arc;
    if (kind === 'missile') p.addScaledVector(s, Math.sin(k * Math.PI * 3) * 0.25 * (1 - k));
    for (const b2 of parts) b2.p.copy(kind === 'knife' && b2 === parts[1] ? p.clone().addScaledVector(dn, -0.2) : p);
    trailSeg(last, p, col, kind === 'missile' ? 0.22 : 0.12, { life: kind === 'knife' ? 0.18 : 0.26, bright: 2.4, spark: kind === 'missile' ? 0.6 : 0.3 });
    last = p;
  });
  for (const p of parts) release(p, 0.05);
}
/** a voxel meteor from the sky onto `to`; resolves at the crash (the crash burst is drawn here, the hit numbers come after) */
export async function fxMeteor(to: THREE.Vector3, o: { size?: number; dur?: number; from?: THREE.Vector3; delay?: number } = {}) {
  // the default entry point sits just inside the top of the battle camera's frame (behind and right of the target), so the whole fall is seen
  const S = o.size ?? 0.7, dur = o.dur ?? 0.6, from = o.from ?? V3(to.x + 2.6, 5.6, to.z - 2.8);
  if (o.delay) await animP(o.delay, () => {});
  // the sky above the target reddens first (telegraph): a glow at the entry point and a target ring on the ground
  fxGlow(from, 0xff7a30, 3 * S, 0.5, 2); ringFx(V3(to.x, 0.05, to.z), { color: 0xff6a20, radius: 1.2 * S + 0.6, r0: 0.4, life: dur + 0.1, width: 0.16, fill: 0.2, bright: 1.6 });
  const rock: Blk[] = [], offs: THREE.Vector3[] = [];
  const cells: Array<[number, number, number, number]> = [[0, 0, 0, 1], [0.55, 0.2, 0, 0.7], [-0.45, -0.25, 0.2, 0.75], [0, 0.5, -0.4, 0.65], [0.2, -0.45, -0.35, 0.6]];
  for (const [x, y, z, s] of cells) { offs.push(V3(x, y, z).multiplyScalar(S * 0.62)); rock.push(addBlock(from, { size: S * s, col: 0x3a2018, bright: 1, glow: false, hold: true, grow: 0.1, spin: 4 })); }
  const core = addBlock(from, { size: S * 1.3, col: 0xff6a20, bright: 1.6, hold: true, grow: 0.1, spin: 6 });
  let last = from.clone(); const d = to.clone().sub(from);
  await animP(dur, k => {
    const e = ease.inCubic(k) * 0.7 + k * 0.3, p = from.clone().addScaledVector(d, e);
    rock.forEach((b, i) => b.p.copy(p).add(offs[i])); core.p.copy(p);
    trailSeg(last, p, 0xff7a30, 0.5 * S, { life: 0.4, bright: 2.6, spark: 0.8 });
    if (Math.random() < 0.6) PALPHA.emit({ p: p.clone(), v: V3(R(-0.4, 0.4), R(0.2, 0.8), R(-0.4, 0.4)), s0: 0.4 * S, s1: 1.1 * S, life: 0.8, c0: C(0x302020), alpha: 0.5, tile: TILE.smoke, drag: 1.2 });
    last = p;
  });
  // crash: rock bursts into debris, fire, shock ring, scorch
  for (const b of rock) fling(b, V3(R(-1, 1), 0, R(-1, 1)).normalize().multiplyScalar(R(3, 6)).add(V3(0, R(3, 6), 0)), { grav: 18, life: R(0.8, 1.3), spin: 10 });
  release(core, 0.1);
  const g = V3(to.x, 0.1, to.z);
  fxFlare(to, 0xffb060, 2.6 * S + 0.8, 0.3); fxGlow(to, 0xff6a20, 3.2 * S, 0.4, 3);
  for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU; PADD.emit({ p: g.clone(), v: V3(Math.cos(a) * R(3, 6), R(0.5, 2.5), Math.sin(a) * R(3, 6)), s0: R(0.22, 0.4) * (0.6 + S), s1: 0.04, life: R(0.35, 0.6), c0: C(0xffe080), c1: C(0xff3010), bright: 2.6, tile: TILE.glow, drag: 3, fadeIn: 0 }); }
  fxShock(g, 0xff7a30, 1.8 + 2 * S); decalFx(g, { radius: 1.4 + S, alpha: 0.6, life: 3.5 });
  fxEmbers(to, 0xff7a30, 16, { r: 0.8 }); fxSmoke(g, 0x302624, 8, { r: 0.6, s: 0.6, alpha: 0.5, up: 1.2 });
  for (let i = 0; i < 8; i++) addDebris(g.clone().add(V3(R(-0.3, 0.3), 0.2, R(-0.3, 0.3))), V3(R(-4, 4), R(4, 8), R(-4, 4)), R(0.1, 0.2), i % 2 ? 0x4a3020 : 0xff7a30, R(1, 1.6), 1, i % 2 ? 0 : 1.2);
  lightPulse(V3(to.x, 0.8, to.z + 0.8), 0xff7a30, 3, 0.45, 9);
  shake(0.25 + 0.3 * S);
}

// ---------------------------------------------------------------- shadow
/** a dark violet silhouette left behind (afterimage): a column of shadow puffs the height of the actor */
/** glow = the additive light on each disc (0.8; class select uses less: user 11-14 「刺客残影偏亮」 — it read as strings of bright beads) */
export function fxAfterimage(feet: THREE.Vector3, h: number, col: Col = 0x6a3aa8, o: { life?: number; w?: number; glow?: number } = {}) {
  const n = Math.max(4, Math.round(h / 0.32)), cc = C(col), w = o.w ?? 0.5;
  for (let i = 0; i < n; i++) {
    const y = (i + 0.5) * (h / n);
    PALPHA.emit({ p: V3(feet.x, feet.y + y, feet.z), v: V3(R(-0.1, 0.1), 0.15, R(-0.1, 0.1)), s0: w * (i === n - 1 ? 0.7 : 1), s1: w * 1.3, life: o.life ?? 0.45, c0: C(0x1a0e28), c1: C(0x2a1640), alpha: 0.6, tile: TILE.disc, drag: 2, fadeIn: 0 });
    PADD.emit({ p: V3(feet.x, feet.y + y, feet.z), v: V3(0, 0.2, 0), s0: w * 0.8, s1: w * 1.1, life: (o.life ?? 0.45) * 0.7, c0: cc, bright: o.glow ?? 0.8, tile: TILE.glow, fadeIn: 0 });
  }
}
/** a puff of shadow (vanish / appear) */
export function fxShadowPuff(feet: THREE.Vector3, h = 1.6) {
  fxSmoke(V3(feet.x, feet.y + 0.2, feet.z), 0x2a1838, 7, { r: 0.4, s: 0.5, alpha: 0.6, up: 1.2, life: 0.8 });
  fxSparks(V3(feet.x, feet.y + h * 0.5, feet.z), 0xb070ff, 12, 3, { life: 0.4, grav: -1 });
  ringFx(V3(feet.x, 0.05, feet.z), { color: 0x8a50d8, radius: 0.9, r0: 0.2, life: 0.35, width: 0.2, fill: 0.2, bright: 1.4 });
}

// ---------------------------------------------------------------- armour
/** blue plate shards burst from a hit absorbed by armour; broken = the armour is gone (more shards + a ring) */
export function fxArmorShards(p: THREE.Vector3, dir: THREE.Vector3, n: number, broken: boolean) {
  for (let i = 0; i < n; i++) addDebris(p.clone().add(V3(R(-0.25, 0.25), R(-0.2, 0.3), R(-0.1, 0.2))), V3(R(-1, 1), R(0.4, 1.2), R(-1, 1)).normalize().addScaledVector(dir, 0.8).multiplyScalar(R(3, 6)), R(0.08, 0.16), i % 3 ? 0x6aa8e8 : 0xd8ecff, R(0.6, 1.1), 1.2, 0.9);
  fxSparks(p, 0x9ad0ff, broken ? 18 : 8, 5, { hot: true, dir, life: 0.35 });
  if (broken) { ringFx(p, { color: 0x8ac8ff, radius: 1.3, r0: 0.3, life: 0.35, width: 0.16, fill: 0.05, bright: 2, billboard: true }); fxFlare(p, 0xbfe8ff, 1.4, 0.25); }
}
