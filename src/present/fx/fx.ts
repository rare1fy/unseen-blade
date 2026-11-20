// Shared high-level effects (port of v5 02_world.js fx*): glow, sparks, embers, smoke, rings, flares, chips, the main impact,
// trails, status bursts, heal, shield. Colours come from COL so look packs can retint them.
import * as THREE from 'three';
import { V3, C, R, TAU, WHITE } from '../engine/world';
import { PADD, PALPHA, TILE } from '../engine/particles';
import { ringFx, decalFx, lightPulse, addDebris, type RingOpts } from '../engine/prims';
import { shake, hitstop, after, clamp } from '../engine/clock';
import { cue } from '../../audio/cues';

export const COL = {
  fire: C(0xff7a30), ice: C(0x7ad8ff), thunder: C(0xfff07a), poison: C(0x7af06a), holy: C(0xffc850), gold: C(0xffd060),
  red: C(0xff5040), blue: C(0x70b8ff), purple: C(0xc080ff), green: C(0x70f090), white: C(0xffffff), orange: C(0xff9a48),
};
type Col = THREE.ColorRepresentation;
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function fxGlow(p: THREE.Vector3, color: Col, size = 1.2, life = 0.3, bright = 3) { PADD?.emit({ p, c0: C(color), bright, s0: size * 0.4, s1: size, life, tile: TILE.glow, fadeIn: 0.05, rot: 0 }); }
export function fxSparks(p: THREE.Vector3, color: Col, n = 14, speed = 6, o: { dir?: THREE.Vector3; dirK?: number; spread?: number; size?: number; life?: number; hot?: boolean; bright?: number; stretch?: number; grav?: number; drag?: number } = {}) {
  if (!PADD) return;
  const c = C(color);
  for (let i = 0; i < n; i++) {
    const d = V3(R(-1, 1), R(-0.2, 1), R(-1, 1)).normalize(); if (o.dir) d.addScaledVector(o.dir, o.dirK ?? 1.2).normalize();
    PADD.emit({ p: p.clone().addScaledVector(d, R(0, o.spread ?? 0.1)), v: d.multiplyScalar(speed * R(0.35, 1)), s0: o.size ?? R(0.05, 0.09), s1: 0.01, life: (o.life ?? 0.45) * R(0.6, 1.2), c0: o.hot ? WHITE : c, c1: c, bright: o.bright ?? 3, tile: TILE.spark, stretch: o.stretch ?? 0.06, grav: o.grav ?? 8, drag: o.drag ?? 1.2, fadeIn: 0.02 });
  }
}
export function fxEmbers(p: THREE.Vector3, color: Col, n = 10, o: { r?: number; up?: number; life?: number } = {}) {
  if (!PADD) return;
  const c = C(color);
  for (let i = 0; i < n; i++) PADD.emit({ p: p.clone().add(V3(R(-1, 1) * (o.r ?? 0.5), R(0, 0.4), R(-1, 1) * (o.r ?? 0.5))), v: V3(R(-0.5, 0.5), R(0.6, 2.2) * (o.up ?? 1), R(-0.5, 0.5)), s0: R(0.04, 0.08), s1: 0.01, life: R(0.8, 1.8) * (o.life ?? 1), c0: WHITE, c1: c, bright: 2.6, tile: TILE.glow, drag: 0.8, grav: -0.4, fadeIn: 0.1 });
}
export function fxSmoke(p: THREE.Vector3, color: Col = 0x6a7a74, n = 6, o: { r?: number; spd?: number; up?: number; s?: number; life?: number; alpha?: number } = {}) {
  if (!PALPHA) return;
  const c = C(color);
  for (let i = 0; i < n; i++) PALPHA.emit({ p: p.clone().add(V3(R(-1, 1) * (o.r ?? 0.3), R(0, 0.3), R(-1, 1) * (o.r ?? 0.3))), v: V3(R(-1, 1) * (o.spd ?? 0.6), R(0.2, 1) * (o.up ?? 1), R(-1, 1) * (o.spd ?? 0.6)), s0: (o.s ?? 0.5) * R(0.6, 1), s1: (o.s ?? 0.5) * R(1.8, 2.8), life: (o.life ?? 1.4) * R(0.7, 1.2), c0: c, c1: c.clone().multiplyScalar(0.6), alpha: o.alpha ?? 0.45, tile: TILE.smoke, drag: 1.4, grav: -0.15, spin: R(-0.6, 0.6), fadeIn: 0.12 });
}
export function fxRing(p: THREE.Vector3, color: Col, radius = 2, o: RingOpts = {}) { ringFx(p, { color, radius, ...o }); }
export function fxFlare(p: THREE.Vector3, color: Col, size = 1.5, life = 0.35) { PADD?.emit({ p, c0: WHITE, c1: C(color), bright: 3.5, s0: size, s1: size * 0.3, life, tile: TILE.flare, rot: R(-0.3, 0.3), spin: R(-1, 1), fadeIn: 0.02 }); }
export function fxChips(p: THREE.Vector3, cols: Col[], n = 10, o: { dir?: THREE.Vector3; speed?: number; up?: number; size?: number; glow?: number } = {}) {
  for (let i = 0; i < n; i++) {
    const d = V3(R(-1, 1), R(0.2, 1), R(-1, 1)).normalize(); if (o.dir) d.addScaledVector(o.dir, 0.9).normalize();
    addDebris(p.clone().add(V3(R(-0.2, 0.2), R(-0.2, 0.2), R(-0.2, 0.2))), d.multiplyScalar((o.speed ?? 5) * R(0.4, 1.1)).add(V3(0, (o.up ?? 3) * R(0.4, 1), 0)), (o.size ?? 0.12) * R(0.6, 1.2), pick(cols), R(0.9, 1.6), 1, o.glow ?? 0.6);
  }
}
/** The main hit: core flash + hot sparks + billboard shockwave + ground ring + decal + chips + smoke + speed lines + light + camera. */
export function fxImpact(p: THREE.Vector3, color: Col, power = 1, o: { dir?: THREE.Vector3; ground?: boolean; chips?: Col[]; stop?: boolean; shake?: boolean } = {}) {
  const c = C(color), pw = clamp(power, 0.35, 3.2), light = pw < 0.85;
  fxGlow(p, c, Math.min(0.9, 0.36 * pw), 0.1 + 0.04 * pw, light ? 0.45 : 0.6);
  fxFlare(p, c, Math.min(1.8, 0.68 * pw), 0.14 + 0.04 * pw);
  fxSparks(p, c, Math.round((light ? 7 : 12) + 9 * pw), 4.5 + 3 * pw, { hot: true, dir: o.dir, dirK: o.dir ? 1.05 : 0.8, stretch: 0.075, life: 0.32 + 0.14 * pw });
  if (!light) fxRing(p, c, 1.1 + 0.85 * pw, { billboard: true, life: 0.24 + 0.07 * pw, width: 0.18, fill: 0.03, bright: 1.7 });
  if (o.ground !== false) { fxRing(V3(p.x, 0.04, p.z), c, 1.4 + 1.1 * pw, { life: 0.5 + 0.1 * pw, width: 0.18, bright: 1.6 }); decalFx(V3(p.x, 0, p.z), { radius: 1 + 0.6 * pw, alpha: 0.45, life: 2.2 }); }
  if (o.chips) fxChips(p, o.chips, Math.round(6 + 8 * pw), { dir: o.dir, speed: 4 + pw * 2, glow: 0.5 });
  if (!light) fxSmoke(V3(p.x, 0.15, p.z - 0.2), 0x4a504c, Math.round(2 + 2 * pw), { s: 0.28 + 0.08 * pw, alpha: 0.26, r: 0.5, up: 0.6 });
  for (let i = 0; i < Math.round((light ? 4 : 6) + 5 * pw); i++) { const d = V3(R(-1, 1), R(-0.6, 1), R(-0.3, 0.6)).normalize(); if (o.dir) d.addScaledVector(o.dir, 0.6).normalize(); PADD.emit({ p: p.clone().addScaledVector(d, 0.18), v: d.multiplyScalar(R(9, 15) * (0.7 + 0.3 * pw)), s0: 0.055, s1: 0.018, life: R(0.09, 0.16), c0: WHITE, c1: c, bright: 2.0, tile: TILE.streak, stretch: 0.05, drag: 4 }); }
  if (!light) fxEmbers(p, c, Math.round(4 + 4 * pw), { r: 0.35, life: 0.8 });
  if (pw > 1.1) after(0.09, () => fxRing(p, c, 0.9 + 0.7 * pw, { billboard: true, life: 0.3, width: 0.12, fill: 0, bright: 2 }));
  if (!light) lightPulse(V3(p.x, 0.25, p.z + 1.2), c, Math.min(2.2, 0.9 + 0.5 * pw), 0.2 + 0.06 * pw, 4 + pw);
  if (o.shake !== false) shake(0.12 + 0.12 * pw);
  if (o.stop !== false) hitstop(0.035 + 0.035 * pw);
}
/** A continuous ribbon of glow between two points (called every frame by moving objects so trails never look dotted). */
export function trailSeg(a: THREE.Vector3, b: THREE.Vector3, color: Col, size = 0.2, o: { life?: number; core?: THREE.Color; bright?: number; spark?: number } = {}) {
  const L = a.distanceTo(b), n = Math.min(18, Math.max(1, Math.ceil(L / Math.max(0.025, size * 0.4)))), c = C(color);
  for (let i = 1; i <= n; i++) { const p = a.clone().lerp(b, i / n); PADD.emit({ p, v: V3(R(-0.15, 0.15), R(-0.05, 0.2), R(-0.15, 0.15)), s0: size * (0.85 + 0.3 * Math.random()), s1: size * 0.15, life: (o.life ?? 0.3) * R(0.8, 1.15), c0: o.core ?? c.clone().lerp(WHITE, 0.3), c1: c, bright: o.bright ?? 2.2, tile: TILE.glow, fadeIn: 0 }); }
  if (Math.random() < (o.spark ?? 0.5)) { const d = b.clone().sub(a).normalize(); PADD.emit({ p: b.clone(), v: d.multiplyScalar(-R(1, 3)).add(V3(R(-1.5, 1.5), R(-0.5, 1.5), R(-1.5, 1.5))), s0: 0.05, s1: 0.01, life: 0.4, c0: WHITE, c1: c, bright: 3, tile: TILE.spark, grav: 5, stretch: 0.05 }); }
}
export function fxStatus(p: THREE.Vector3, type: string) {
  if (type === 'poison') { for (let i = 0; i < 14; i++) PALPHA.emit({ p: p.clone().add(V3(R(-0.5, 0.5), R(-0.3, 0.5), R(-0.2, 0.4))), v: V3(R(-0.2, 0.2), R(0.6, 1.4), 0), s0: R(0.08, 0.16), s1: R(0.12, 0.2), life: R(0.8, 1.3), c0: C(0x8af070), c1: C(0x3a8a3a), alpha: 0.85, tile: TILE.ring, drag: 0.5 }); fxGlow(p, COL.poison, 1.4, 0.4, 1.6); cue('poison'); }
  else if (type === 'burn') { for (let i = 0; i < 22; i++) PADD.emit({ p: p.clone().add(V3(R(-0.45, 0.45), R(-0.5, 0.2), R(-0.2, 0.3))), v: V3(R(-0.3, 0.3), R(1.2, 2.6), 0), s0: R(0.18, 0.3), s1: 0.03, life: R(0.4, 0.8), c0: C(0xffe080), c1: C(0xff3010), bright: 2.6, tile: TILE.glow, drag: 1, fadeIn: 0.05 }); fxSmoke(p.clone().add(V3(0, 0.6, 0)), 0x302020, 4, { alpha: 0.4 }); cue('burn'); }
  else if (type === 'weak') { for (let i = 0; i < 10; i++) PADD.emit({ p: p.clone().add(V3(R(-0.5, 0.5), R(0.2, 0.8), 0.2)), v: V3(0, R(-1.6, -0.8), 0), s0: 0.12, s1: 0.05, life: 0.7, c0: C(0xc0b0d0), bright: 1.6, tile: TILE.streak, stretch: 0.25 }); fxGlow(p, 0x9a8ab0, 1.2, 0.4, 1.4); }
  else if (type === 'vulnerable') { fxSparks(p, 0xff9a48, 16, 3, { life: 0.5, grav: 2 }); fxRing(p, 0xff9a48, 1.1, { billboard: true, life: 0.4, width: 0.12 }); }
  else if (type === 'freeze') { for (let i = 0; i < 16; i++) PADD.emit({ p: p.clone().add(V3(R(-0.6, 0.6), R(-0.5, 0.6), R(-0.2, 0.4))), v: V3(R(-0.6, 0.6), R(-0.2, 0.6), 0), s0: R(0.1, 0.18), s1: 0.02, life: R(0.6, 1), c0: WHITE, c1: COL.ice, bright: 2.4, tile: TILE.flare, spin: R(-2, 2) }); fxRing(p, COL.ice, 1.4, { billboard: true, life: 0.5 }); }
  else if (type === 'strength') { fxEmbers(p, 0xff7040, 14, { r: 0.4 }); fxGlow(p, 0xff6030, 1.4, 0.4, 2); }
  // fx5: 眩晕 had no burst at all (only the 「晕」 word): gold stars knocked out of the head + a flat ring
  else if (type === 'stun') { const h = p.clone().add(V3(0, 0.7, 0)); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; PADD.emit({ p: h.clone(), v: V3(Math.cos(a) * R(1.4, 2.4), R(0.6, 1.6), Math.sin(a) * R(1.4, 2.4)), s0: 0.16, s1: 0.05, life: R(0.45, 0.7), c0: WHITE, c1: C(0xffe07a), bright: 2.6, tile: TILE.flare, spin: R(-4, 4), drag: 2, grav: 2, fadeIn: 0 }); } fxRing(h, 0xffe07a, 1.0, { billboard: true, life: 0.35, width: 0.12 }); cue('block', 0.5); }
}
export function fxHeal(p: THREE.Vector3) { for (let i = 0; i < 14; i++) PADD.emit({ p: p.clone().add(V3(R(-0.5, 0.5), R(-0.4, 0.3), R(-0.3, 0.3))), v: V3(0, R(0.8, 1.8), 0), s0: R(0.08, 0.14), s1: 0.03, life: R(0.7, 1.1), c0: WHITE, c1: COL.green, bright: 2.4, tile: TILE.flare, fadeIn: 0.15 }); fxGlow(p, COL.green, 1.6, 0.5, 1.6); }
export function fxShield(p: THREE.Vector3, r = 0.9) {
  fxRing(V3(p.x, 0.05, p.z), COL.blue, r * 1.4, { life: 0.6, width: 0.2, fill: 0.3 });
  for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; PADD.emit({ p: V3(p.x + Math.cos(a) * r, 0.1, p.z + Math.sin(a) * r * 0.6), v: V3(0, R(1.2, 2.4), 0), s0: 0.09, s1: 0.02, life: 0.6, c0: WHITE, c1: COL.blue, bright: 2.6, tile: TILE.streak, stretch: 0.2 }); }
  fxGlow(V3(p.x, 0.8, p.z), COL.blue, 1.8, 0.45, 1.8);
}
