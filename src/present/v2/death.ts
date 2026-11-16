// fx4: enemy deaths. Two forms, picked at random weighted by how hard the killing blow was (damage ÷ max HP, overkill included):
//   击倒 knock-down — the frozen hurt pose topples backward (away from the hit; four-legged bodies roll onto their side), rests,
//                     then sinks slowly into the ground until gone;
//   击碎 shatter   — the model is cut into 3..10 chunks (more voxels → more chunks): its parts (head, torso, limbs…) merged or cut
//                     along voxel planes, each chunk bursts out with a moderate kick and spin, bounces once or twice, then sinks away.
// Bosses do the same, slower. Reads the model only through the actor's meshes (no bestiary changes).
import * as THREE from 'three';
import { scene, onUpdate, V3, R } from '../engine/world';
import { fxSmoke } from '../fx/fx';
import type { BattleActor } from '../bestiary/battle';

export type DeathKind = 'knock' | 'shatter';
export interface DeathOpts {
  /** where the blow came from (world); the body falls / the chunks fly away from it */
  from?: THREE.Vector3;
  /** damage of the killing blow ÷ max HP (overkill included). Bigger → shatter more likely */
  ratio?: number;
  boss?: boolean;
  /** force a form (debug / captures) */
  kind?: DeathKind;
}

/** P(shatter) by blow strength: a finishing tap is almost always a knock-down, an overkill blow almost always shatters */
export function shatterChance(ratio: number) { return Math.min(0.92, Math.max(0.08, (ratio - 0.35) / 0.9)); }
export function pickDeath(ratio: number): DeathKind { return Math.random() < shatterChance(ratio) ? 'shatter' : 'knock'; }

interface Sub { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; glow: boolean }
interface Piece { subs: Sub[]; tris: number; c: THREE.Vector3; box: THREE.Box3 }
interface Chunk { g: THREE.Group; v: THREE.Vector3; ax: THREE.Vector3; w: number; low: number; bounces: number; rest: boolean; sink: number; size: number }
interface Run { kind: DeathKind; t: number; slow: number; floor: number; done: () => void; a: BattleActor;
  // knock
  pivot?: THREE.Group; yaw?: number; side?: boolean; dir?: THREE.Vector3; ang?: number; sunk?: number; dust?: boolean; depth?: number;
  // shatter
  chunks?: Chunk[]; geos?: THREE.BufferGeometry[] }
const runs: Run[] = [];
/** last killing-blow damage per enemy uid (the hit event comes before the death event) */
export const lastHit = new Map<number, number>();
/** what the last death picked (captures / logs) */
export const DEATH = { last: '' as string, force: null as DeathKind | null };

onUpdate(dt => { for (let i = runs.length - 1; i >= 0; i--) if (!step(runs[i], dt)) { finish(runs[i]); runs.splice(i, 1); } });

/** play a death on a battle actor; resolves when the body is out of sight. The actor's root is left hidden (dispose it as usual). */
export function playDeath(a: BattleActor, o: DeathOpts = {}): Promise<DeathKind> {
  const kind = DEATH.force ?? o.kind ?? pickDeath(o.ratio ?? 0.3); DEATH.last = kind;
  a.dead = true; a.root.updateMatrixWorld(true);
  return new Promise(res => {
    const from = o.from ?? a.home.clone().add(V3(0, 0, 5)), dir = a.home.clone().sub(from).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); dir.normalize();
    const r: Run = { kind, t: 0, slow: o.boss ? 0.62 : 1, floor: a.home.y, a, done: () => res(kind) };
    if (kind === 'knock') startKnock(r, dir); else startShatter(r, dir, !!o.boss);
    runs.push(r);
  });
}

// ---------------------------------------------------------------- knock-down
function startKnock(r: Run, dir: THREE.Vector3) {
  const a = r.a, p = new THREE.Group();
  p.position.copy(a.root.position); p.quaternion.copy(a.root.quaternion); scene.add(p);
  p.add(a.body); a.root.visible = false;   // the pose freezes (Actor.update skips hidden roots)
  r.pivot = p; r.yaw = a.root.rotation.y; r.dir = dir; r.side = a.def.kind === 'quad' || a.def.kind === 'spider'; r.ang = 0; r.sunk = 0; r.dust = false;
  r.depth = Math.max(0.6, Math.min(3, a.height * 0.5 + 0.4));
}
// ---------------------------------------------------------------- shatter
function startShatter(r: Run, dir: THREE.Vector3, boss: boolean) {
  const a = r.a, subsAll: Array<{ sub: Sub; part: string }> = [];
  a.root.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh || !m.visible || !m.geometry?.attributes?.position) return;
    const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); if (!g.index) { const n = g.attributes.position.count, ix: number[] = []; for (let i = 0; i < n; i++) ix.push(i); g.setIndex(ix); }
    subsAll.push({ sub: { geo: g, mat: m.material, glow: /_glow$/.test(m.name) }, part: m.name.replace(/_glow$/, '') || String(m.id) });
  });
  a.root.visible = false;
  r.geos = subsAll.map(s => s.sub.geo);
  // one piece per part (its glow cells ride with it)
  const byPart = new Map<string, Sub[]>(); for (const s of subsAll) { if (!byPart.has(s.part)) byPart.set(s.part, []); byPart.get(s.part)!.push(s.sub); }
  let pieces: Piece[] = [...byPart.values()].map(mkPiece).filter(p => p.tris > 0);
  const total = pieces.reduce((s, p) => s + p.tris, 0);
  // 3..10 chunks by the model's size (≈ voxel count), ±1 at random
  const base = 3 + 7 * Math.min(1, Math.max(0, Math.log2(Math.max(1, total) / 1500) / 3));
  const N = Math.max(3, Math.min(10, Math.round(base + R(-1, 1))));
  // merge crumbs and the smallest parts into their nearest neighbour until N remain
  const merge = () => { pieces.sort((x, y) => x.tris - y.tris); const s = pieces.shift()!; let bi = 0, bd = 1e9; pieces.forEach((p, i) => { const d = p.c.distanceToSquared(s.c); if (d < bd) { bd = d; bi = i; } }); pieces[bi] = mkPiece(pieces[bi].subs.concat(s.subs)); };
  while (pieces.length > 1 && pieces.some(p => p.tris < total * 0.03)) merge();
  while (pieces.length > N) merge();
  // too few: cut the biggest piece across its longest side, on a voxel plane
  for (let guard = 0; pieces.length < N && guard < 20; guard++) {
    pieces.sort((x, y) => y.tris - x.tris); const big = pieces[0], two = split(big); if (!two) break;
    pieces.splice(0, 1, ...two);
  }
  const ctr = new THREE.Vector3(); pieces.forEach(p => ctr.addScaledVector(p.c, p.tris / Math.max(1, total)));
  const k = boss ? 0.8 : 1;
  r.chunks = pieces.map(p => {
    const g = new THREE.Group(); g.position.copy(p.c); scene.add(g);
    for (const s of p.subs) { const m = new THREE.Mesh(s.geo, s.mat); m.position.copy(p.c).negate(); m.castShadow = !s.glow; g.add(m); }
    const out = p.c.clone().sub(ctr).setY(0); if (out.lengthSq() < 1e-4) out.set(R(-1, 1), 0, R(-1, 1)); out.normalize();
    const v = out.multiplyScalar(R(1.0, 2.0) * k).addScaledVector(r.dir ?? dir, R(0.7, 1.5) * k); v.y = R(1.6, 3.0) * k;
    const sz = p.box.getSize(V3()), size = Math.max(sz.x, sz.y, sz.z);
    return { g, v, ax: V3(R(-1, 1), R(-1, 1), R(-1, 1)).normalize(), w: R(3, 7) * k, low: Math.min(sz.x, sz.y, sz.z) * 0.5 + 0.02, bounces: 0, rest: false, sink: 0, size };
  });
  fxSmoke(ctr, 0x4a4450, 6, { alpha: 0.45, r: 0.4 });
}
function mkPiece(subs: Sub[]): Piece {
  const box = new THREE.Box3(), c = V3(); let tris = 0;
  for (const s of subs) { const ix = s.geo.index!, ps = s.geo.attributes.position; tris += ix.count / 3; for (let i = 0; i < ix.count; i++) { const j = ix.getX(i); const x = ps.getX(j), y = ps.getY(j), z = ps.getZ(j); box.expandByPoint(V3(x, y, z)); c.x += x; c.y += y; c.z += z; } }
  const n = subs.reduce((s, x) => s + x.geo.index!.count, 0); if (n) c.multiplyScalar(1 / n);
  return { subs, tris, c, box };
}
/** cut a piece in two by its triangles' centres along the longest bbox axis (voxel quads stay whole: both halves share the centre) */
function split(p: Piece): [Piece, Piece] | null {
  const sz = p.box.getSize(V3()), ax = sz.x >= sz.y && sz.x >= sz.z ? 'x' : sz.y >= sz.z ? 'y' : 'z';
  const cs: number[] = [];
  for (const s of p.subs) { const ix = s.geo.index!, ps = s.geo.attributes.position; for (let t = 0; t < ix.count; t += 3) cs.push(cen(ps, ix, t, ax)); }
  cs.sort((a, b) => a - b); const cut = cs[Math.floor(cs.length / 2)] ?? 0;
  const A: Sub[] = [], B: Sub[] = [];
  for (const s of p.subs) {
    const ix = s.geo.index!, ps = s.geo.attributes.position, ia: number[] = [], ib: number[] = [];
    for (let t = 0; t < ix.count; t += 3) (cen(ps, ix, t, ax) < cut ? ia : ib).push(ix.getX(t), ix.getX(t + 1), ix.getX(t + 2));
    const mk = (arr: number[]) => { const g = new THREE.BufferGeometry(); for (const [k, v] of Object.entries(s.geo.attributes)) g.setAttribute(k, v); g.setIndex(arr); return { geo: g, mat: s.mat, glow: s.glow }; };
    if (ia.length) A.push(mk(ia)); if (ib.length) B.push(mk(ib));
  }
  if (!A.length || !B.length) return null;
  return [mkPiece(A), mkPiece(B)];
}
function cen(ps: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, ix: THREE.BufferAttribute, t: number, ax: 'x' | 'y' | 'z') {
  const f = ax === 'x' ? 'getX' : ax === 'y' ? 'getY' : 'getZ';
  return (ps[f](ix.getX(t)) + ps[f](ix.getX(t + 1)) + ps[f](ix.getX(t + 2))) / 3;
}

// ---------------------------------------------------------------- per frame
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function step(r: Run, dt0: number): boolean {
  if (!r.a.root.parent) return false;   // the stage was torn down (actor disposed)
  const dt = Math.min(0.05, dt0) * r.slow; r.t += dt;
  if (r.kind === 'knock') {
    const p = r.pivot!, T = r.t;
    // topple: accelerate to ~84°, a small bounce back, settle
    const fallT = 0.55, tgt = 1.47;
    const ang = T < fallT ? tgt * (T / fallT) ** 2 : tgt - 0.16 * Math.exp(-(T - fallT) * 7) * Math.abs(Math.sin((T - fallT) * 16));
    if (T >= fallT && !r.dust) { r.dust = true; fxSmoke(p.position.clone().addScaledVector(r.dir!, r.a.height * 0.5), 0x5a5048, 7, { r: 0.6, alpha: 0.45, up: 0.4 }); }
    // the axis: backward = the top goes along the blow (away from the hitter); quads / spiders roll onto a side
    const up = V3(0, 1, 0), ax = r.side ? r.dir!.clone() : up.clone().cross(r.dir!).normalize();
    _q.setFromAxisAngle(up, r.yaw!); _q2.setFromAxisAngle(ax, ang);
    p.quaternion.copy(_q2).multiply(_q);
    // hold, then sink until the whole body is under the ground
    const hold = 0.55 + fallT + 0.45;
    if (T > hold) r.sunk = Math.min(r.depth!, (T - hold) * 0.32);
    p.position.copy(r.a.root.position).addScaledVector(r.dir!, Math.min(1, T / fallT) * 0.25); p.position.y = r.a.root.position.y - r.sunk!;
    if (T > hold && Math.random() < dt * 6 && r.sunk! < r.depth! * 0.8) fxSmoke(p.position.clone().addScaledVector(r.dir!, r.a.height * 0.4).setY(r.floor + 0.05), 0x4a4038, 1, { r: 0.5, alpha: 0.3, up: 0.2 });
    return r.sunk! < r.depth!;
  }
  let alive = false;
  for (const c of r.chunks!) {
    if (!c.g.parent) continue;
    if (!c.rest) {
      c.v.y -= 9.8 * dt; c.g.position.addScaledVector(c.v, dt); c.g.quaternion.premultiply(_q.setFromAxisAngle(c.ax, c.w * dt));
      const fl = r.floor + c.low;
      if (c.g.position.y < fl) {
        c.g.position.y = fl;
        if (c.bounces < 2 && Math.abs(c.v.y) > 1.0) { c.v.y = -c.v.y * 0.32; c.v.x *= 0.55; c.v.z *= 0.55; c.w *= 0.5; c.bounces++; if (c.bounces === 1) fxSmoke(c.g.position.clone().setY(r.floor + 0.05), 0x5a5048, 2, { r: 0.2, alpha: 0.35, up: 0.3, s: 0.25 }); }
        else { c.rest = true; c.v.set(0, 0, 0); }
      }
    } else if (r.t > 1.6) {
      c.sink += dt * 0.3; c.g.position.y = r.floor + c.low - c.sink;
    }
    if (c.sink > c.size + c.low + 0.05) { scene.remove(c.g); continue; }
    alive = true;
  }
  return alive && r.t < 12;
}
function finish(r: Run) {
  const a = r.a;
  if (r.pivot) { a.root.add(a.body); scene.remove(r.pivot); }
  if (r.chunks) for (const c of r.chunks) scene.remove(c.g);
  if (r.geos) for (const g of r.geos) g.dispose();
  a.root.visible = false; r.done();
}

/** debug handle for captures: __fx4.playDeath(actor, { kind: 'shatter' }), __fx4.DEATH.force = 'knock' */
(globalThis as unknown as { __fx4?: object }).__fx4 = { playDeath, DEATH, shatterChance };
