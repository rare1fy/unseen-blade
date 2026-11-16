// Dice identity (v5 02s_dicesig.js — locked design): each representative die is distinct at a glance through ONE identity point —
// silhouette parts, material, numeral style, idle effect and its own trigger effect. Ordinary dice stay clean.
// v5 shipped bloodthirst (spikes), ironwall (rivets), fury (pebble + embers); titanfist, whirlwind and execute are new here, built
// with the same recipe.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { V3, C, R, TAU, WHITE } from '../engine/world';
import { PADD, PALPHA, TILE } from '../engine/particles';
import { decalFx } from '../engine/prims';
import { after, shake, clock } from '../engine/clock';
import { fxRing, fxSmoke, fxSparks, fxEmbers, fxGlow, fxShield, fxFlare, trailSeg } from '../fx/fx';
import { FACE_N, FACE_U, FACE_V } from './faces';

export const DIE = 0.8;
export type DieFxKind = 'land' | 'idle' | 'trig';

// ---- extras: shared geometry + material per kind, attached as children of the die
const EXTRA: Record<string, { geo: THREE.BufferGeometry; mat: THREE.Material }> = {};
function clean(g: THREE.BufferGeometry) { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; }
export function extra(kind: string) {
  if (EXTRA[kind]) return EXTRA[kind];
  const h = DIE / 2, parts: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, p: THREE.Vector3, q?: THREE.Quaternion) => { if (q) g.applyQuaternion(q); g.translate(p.x, p.y, p.z); parts.push(g); };
  let mat: THREE.Material;
  if (kind === 'spikes') {   // w_bloodthirst
    mat = new THREE.MeshStandardMaterial({ color: 0xeee0c4, roughness: 0.45 });
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) { const d = V3(x, y, z).normalize(); put(new THREE.ConeGeometry(0.06, 0.15, 6), d.clone().multiplyScalar(h * 1.5), new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d)); }
  } else if (kind === 'rivets') {   // w_ironwall
    mat = new THREE.MeshStandardMaterial({ color: 0x5a626e, metalness: 0.9, roughness: 0.3 });
    for (let f = 0; f < 6; f++) for (const a of [-1, 1]) for (const b of [-1, 1]) put(new THREE.SphereGeometry(0.038, 8, 6), FACE_N[f].clone().multiplyScalar(h).addScaledVector(FACE_U[f], a * h * 0.74).addScaledVector(FACE_V[f], b * h * 0.74));
  } else if (kind === 'caps') {   // w_titanfist: heavy forged corner blocks
    mat = new THREE.MeshStandardMaterial({ color: 0x8a8070, metalness: 0.9, roughness: 0.35, emissive: 0x2a1600 });
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) put(new THREE.BoxGeometry(0.2, 0.2, 0.2), V3(x * h * 0.9, y * h * 0.9, z * h * 0.9));
  } else if (kind === 'blades') {   // w_whirlwind: four swept blades around the equator, like a pinwheel
    mat = new THREE.MeshStandardMaterial({ color: 0xd8e8e0, metalness: 0.8, roughness: 0.22, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, g = new THREE.BoxGeometry(0.34, 0.025, 0.12); g.translate(0.17, 0, 0); g.rotateZ(0.18); const q = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), a); put(g, V3(Math.cos(a) * h * 1.02, 0, -Math.sin(a) * h * 1.02).add(V3(-Math.sin(a) * h * 0.55, 0, -Math.cos(a) * h * 0.55)), q); }
  } else if (kind === 'edges') {   // w_execute: blood-red blade slabs along the four vertical edges
    mat = new THREE.MeshStandardMaterial({ color: 0x8a1416, metalness: 0.75, roughness: 0.25, emissive: 0x3a0000 });
    for (const x of [-1, 1]) for (const z of [-1, 1]) { const g = new THREE.BoxGeometry(0.05, DIE * 0.9, 0.05); g.rotateY(Math.PI / 4); put(g, V3(x * h * 1.03, 0, z * h * 1.03)); }
  } else throw new Error('extra ' + kind);
  EXTRA[kind] = { geo: mergeGeometries(parts.map(clean))!, mat };
  return EXTRA[kind];
}

const sp = () => V3(R(-0.3, 0.3), R(-0.1, 0.35), R(-0.3, 0.3));
export interface Sig { extras?: string[]; spin?: string; fx: (k: DieFxKind, p: THREE.Vector3) => void }

export const SIG: Record<string, Sig> = {
  standard: { fx: (k, p) => { if (k === 'idle') return; fxRing(V3(p.x, 0.04, p.z), 0xf4ead4, k === 'trig' ? 1.0 : 0.6, { life: 0.4, width: 0.2, fill: 0.1, bright: 1 }); fxSmoke(V3(p.x, 0.05, p.z), 0xd8ccb0, 3, { s: 0.2, alpha: 0.3, up: 0.3 }); } },
  w_bloodthirst: { extras: ['spikes'], fx: (k, p) => {
    const n = k === 'trig' ? 26 : k === 'land' ? 8 : 2;
    for (let i = 0; i < n; i++) PADD.emit({ p: p.clone().add(k === 'idle' ? V3(R(-0.3, 0.3), -0.35, R(-0.3, 0.3)) : sp()), v: k === 'idle' ? V3(0, -0.4, 0) : V3(R(-2, 2), R(1, 3.5), R(-2, 2)), s0: R(0.05, 0.1), s1: 0.02, life: R(0.4, 0.8), c0: C(0xff3a2a), c1: C(0x5a0808), bright: 1.6, tile: TILE.glow, grav: 7, drag: 0.6 });
    if (k === 'trig') { fxRing(V3(p.x, 0.05, p.z), 0xc81a1a, 1.4, { life: 0.5, width: 0.2, fill: 0.2, bright: 1.6 }); decalFx(V3(p.x, 0, p.z), { radius: 0.8, alpha: 0.5, life: 2 }); } } },
  w_ironwall: { extras: ['rivets'], fx: (k, p) => {
    if (k === 'idle') { if (Math.random() < 0.3) PADD.emit({ p: p.clone().add(V3(R(-0.4, 0.4), R(0.2, 0.45), R(-0.4, 0.4))), s0: 0.1, s1: 0, life: 0.35, c0: WHITE, bright: 1.3, tile: TILE.flare, spin: 4 }); return; }
    fxShield(V3(p.x, 0, p.z), k === 'trig' ? 1.0 : 0.6); if (k === 'trig') fxSparks(p, 0xbfe0ff, 16, 3, { life: 0.4, grav: 4 }); } },
  w_fury: { fx: (k, p) => { fxEmbers(p.clone().add(V3(0, 0.2, 0)), 0xff6a1a, k === 'trig' ? 26 : k === 'land' ? 8 : 2, { r: 0.35 }); if (k === 'trig') { fxGlow(p, 0xff6a1a, 1.8, 0.4, 2.4); fxRing(V3(p.x, 0.05, p.z), 0xff6a1a, 1.5, { life: 0.5, width: 0.2, bright: 2.4 }); } } },
  w_titanfist: { extras: ['caps'], fx: (k, p) => {
    if (k === 'idle') { if (Math.random() < 0.5) PADD.emit({ p: p.clone().add(V3(R(-0.3, 0.3), 0.45, R(-0.3, 0.3))), v: V3(0, 0.6, 0), s0: 0.08, s1: 0.01, life: 0.6, c0: C(0xffe0a0), c1: C(0xff8a20), bright: 2.2, tile: TILE.glow }); return; }
    const big = k === 'trig'; fxRing(V3(p.x, 0.04, p.z), 0xffb040, big ? 2.2 : 1.1, { life: 0.45, width: 0.3, fill: 0.25, bright: 2 }); fxSmoke(V3(p.x, 0.05, p.z), 0x6a6050, big ? 8 : 4, { s: 0.35, alpha: 0.45, up: 0.4, r: 0.6 });
    if (big) { fxFlare(p, 0xffc860, 2.2, 0.3); fxSparks(p, 0xffc860, 22, 5, { life: 0.5, grav: 7 }); shake(0.12); decalFx(V3(p.x, 0, p.z), { radius: 1.4, alpha: 0.5, life: 2.5 }); } } },
  w_whirlwind: { extras: ['blades'], spin: 'blades', fx: (k, p) => {
    const n = k === 'trig' ? 30 : k === 'land' ? 10 : 3, r = k === 'trig' ? 1.3 : 0.7, t = clock.rtime * 6;
    for (let i = 0; i < n; i++) { const a = t + (i / n) * TAU; PADD.emit({ p: p.clone().add(V3(Math.cos(a) * r, R(-0.1, 0.4), Math.sin(a) * r)), v: V3(-Math.sin(a) * r * 4, R(0, 0.6), Math.cos(a) * r * 4), s0: 0.06, s1: 0.01, life: R(0.25, 0.45), c0: WHITE, c1: C(0x9ae8c8), bright: 2, tile: TILE.streak, stretch: 0.12 }); }
    if (k === 'trig') { fxRing(V3(p.x, 0.05, p.z), 0x9ae8c8, 2.0, { life: 0.5, width: 0.12, bright: 2 }); fxSmoke(V3(p.x, 0.05, p.z), 0xa8c8b8, 6, { s: 0.3, alpha: 0.3, spd: 1.6, up: 0.2 }); } } },
  w_execute: { extras: ['edges'], fx: (k, p) => {
    if (k === 'idle') { if (Math.random() < 0.35) PALPHA.emit({ p: p.clone().add(V3(R(-0.3, 0.3), -0.3, R(-0.3, 0.3))), v: V3(0, -0.3, 0), s0: 0.06, s1: 0.03, life: 0.7, c0: C(0x8a0a0a), alpha: 0.8, tile: TILE.pixel, grav: 2 }); return; }
    if (k === 'trig') { const a = p.clone().add(V3(-1.1, 1.0, 0.3)), b = p.clone().add(V3(1.1, -0.2, -0.3)); for (let i = 0; i < 6; i++) after(i * 0.016, () => trailSeg(a.clone().lerp(b, i / 6), a.clone().lerp(b, (i + 1) / 6), 0xff2a2a, 0.14, { life: 0.35, bright: 2.6 })); fxRing(p, 0xff2a2a, 1.4, { billboard: true, life: 0.4, width: 0.12, bright: 2.4 }); }
    else fxSparks(p, 0xff3a3a, 6, 2, { life: 0.35, grav: 5 }); } },
};
/** Ordinary dice (no identity) fall back to the standard die's effect. */
export const sigOf = (defId: string): Sig => SIG[defId] || SIG.standard;

/** Rarity trim (v5): metal corner caps — uncommon bronze, rare silver, legendary gold. Identity dice with their own corner parts skip it. */
let trimGeo: THREE.BufferGeometry | null = null;
export const TRIM_MAT: Record<string, THREE.Material> = {
  uncommon: new THREE.MeshStandardMaterial({ color: 0xc8884a, metalness: 0.8, roughness: 0.3 }),
  rare: new THREE.MeshStandardMaterial({ color: 0xe0e8f2, metalness: 0.85, roughness: 0.2 }),
  legendary: new THREE.MeshStandardMaterial({ color: 0xf6c84a, metalness: 0.85, roughness: 0.2, emissive: 0x3a2400 }),
};
export function trimGeometry() {
  if (trimGeo) return trimGeo;
  const parts: THREE.BufferGeometry[] = [], h = DIE / 2 - 0.066;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) { const b = new THREE.BoxGeometry(0.15, 0.15, 0.15); b.translate(x * h, y * h, z * h); parts.push(clean(b)); }
  trimGeo = mergeGeometries(parts)!; return trimGeo;
}
