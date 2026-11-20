import { batchActor } from '../engine/rigidBatch';
import type { ContactBatch } from '../engine/contactBatch';
import { OPT } from '../engine/perfOpts';
// 可破坏物件的表现（act-19，用户：「希望场景中有各种可破坏的场景物件，也可以对敌人造成伤害那种」）：
// 陶罐 / 木箱 / 草垛 / 火油坛 / 立柱的体素模型、挨打晃一下、碎裂飞碎块、火油坛引线冒火星 → 爆炸、地上烧一片火、立柱顺刀势倒下。
// 规则全在 breakLogic.ts（纯逻辑，有测试）；这里只把它的事件变成画面，并维护碰撞（solids.ts）。
import * as THREE from 'three';
import type { Strike } from './puzzles';
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import { V3 } from '../engine/world';
import { fxChips, fxSmoke, fxSparks, fxEmbers, fxGlow, fxRing, fxImpact } from '../fx/fx';
import { addBlock } from '../fx/blocks';
import { shake } from '../engine/clock';
import { cue } from '../../audio/cues';
import { BreakLogic, BTUNE, type BEvent, type BProp, type BTarget, type BDamage, type BSrc } from './breakLogic';
import type { Solids, Solid } from './solids';
import { coverVox, type ArenaPlan, type PropKind, type Cover, type CoverKind } from '../asm/arena';

// ------------------------------------------------------------------ models (cells of 7 cm; origin = the foot's centre)
const COL = {
  clay: 0x9a5a3a, clayD: 0x74402a, clayL: 0xb47450, wood: 0x7e6044, woodD: 0x4a3622, woodL: 0x9a7a58,
  straw: 0xccb06a, strawD: 0xa08850, strawL: 0xe0c886, rope: 0x6a5434, oil: 0xa04a2c, oilD: 0x6e3020, oilL: 0xbc6440, seal: 0x2a2220, cloth: 0xb8302a,
  post: 0x5a4430, postD: 0x3e2e20, postL: 0x7a5e44, stone: 0x7a7670, stoneL: 0x9a968e,
};
type W = VoxWorld;
/** a notched square ring (round-reading without stair-steps): half size h, y0..y1 */
const nsq = (w: W, h: number, y0: number, y1: number, c: number) => { w.box(-h + 1, y0, -h, h - 1, y1, h, c); w.box(-h, y0, -h + 1, h, y1, h - 1, c); };
// act-20 more breakables: a fence length (along x, 1.6 m), a weapon rack, a 黄巾 banner on its pole, a basket, a grain sack, a lantern post
const MORE = { yellow: 0xd8b030, yellowD: 0xa8841c, red: 0xa8302a, iron: 0x6a6e78, ironL: 0x9aa0aa, glow: 0xffc070, sack: 0xc8b48a, sackD: 0x9a8662, wicker: 0xa07a44, wickerD: 0x7a5a30 };
const BUILD = {
  palaceColumn: (w: W) => {
    w.box(-7, 0, -7, 6, 2, 6, COL.stone);
    w.box(-6, 3, -6, 5, 5, 5, COL.stoneL);
    w.box(-4, 6, -4, 4, 39, 4, 0x963c2a);
    w.box(-4, 6, -4, -4, 39, 4, 0x6a2c22);
    w.box(-5, 39, -5, 5, 42, 5, 0x773020);
    w.box(-8, 43, -3, 8, 45, 3, 0x543328);
    w.box(-3, 46, -7, 3, 48, 7, 0x392c28);
  },
  palaceStump: (w: W) => {
    w.box(-7, 0, -7, 6, 2, 6, COL.stone);
    w.box(-6, 3, -6, 5, 5, 5, COL.stoneL);
    w.box(-4, 6, -4, 4, 9, 4, 0x963c2a);
    w.box(-4, 10, -4, 1, 11, 3, 0x9c7653);
  },
  fence: w => { for (let x = -11; x <= 11; x += 5) w.box(x, 0, -1, x + 1, 13, 0, COL.postD); w.box(-12, 4, -1, 12, 5, 0, COL.wood); w.box(-12, 10, -1, 12, 11, 0, COL.wood); w.box(-12, 11, -1, 12, 11, 0, COL.woodL); },
  rack: w => { w.box(-7, 0, -1, -6, 18, 0, COL.postD); w.box(6, 0, -1, 7, 18, 0, COL.postD); w.box(-7, 16, -1, 7, 17, 0, COL.wood); w.box(-7, 5, -1, 7, 6, 0, COL.wood);
    for (const x of [-4, 0, 4]) { w.box(x, 1, 1, x, 20, 1, COL.post); w.box(x - 1, 21, 1, x + 1, 24, 1, MORE.iron); w.box(x, 25, 1, x, 26, 1, MORE.ironL); } },
  banner: w => {
    w.box(-3, 0, -3, 2, 2, 2, COL.stone); w.box(-2, 3, -2, 1, 3, 1, COL.stoneL);
    w.box(-1, 0, -1, 0, 36, 0, COL.postD); w.box(1, 35, -1, 10, 35, 0, COL.postD);
    w.box(1, 14, 0, 9, 34, 0, MORE.yellow); w.box(1, 32, 0, 9, 34, 0, MORE.yellowD);
    w.box(5, 16, 0, 5, 31, 0, MORE.yellowD); w.box(7, 14, 0, 9, 17, 0, null);
    w.box(3, 22, 0, 6, 27, 0, MORE.red);
  },
  basket: w => { nsq(w, 4, 0, 6, MORE.wicker); for (let y = 1; y <= 6; y += 2) nsq(w, 4, y, y, MORE.wickerD); nsq(w, 3, 7, 7, MORE.sack); w.box(-1, 8, -1, 0, 8, 0, MORE.sackD); },
  sack: w => { nsq(w, 4, 0, 5, MORE.sack); nsq(w, 3, 6, 8, MORE.sack); w.box(-1, 9, -1, 0, 10, 0, MORE.sackD); w.box(-4, 3, -4, 4, 3, 4, MORE.sackD); },
  lamp: w => { w.box(-1, 0, -1, 0, 28, 0, COL.postD); w.box(-1, 27, -1, 6, 28, 0, COL.postD); w.box(4, 18, -2, 7, 25, 1, MORE.red); w.box(5, 19, -1, 6, 24, 0, MORE.glow); w.box(4, 25, -2, 7, 26, 1, COL.postD); w.box(4, 17, -2, 7, 17, 1, COL.postD); w.box(-2, 0, -2, 1, 1, 1, COL.stone); },
  pot: w => {
    // paired earthenware jar + smaller jug tucked tight inside the same footprint
    nsq(w, 3, 0, 1, COL.clayD); nsq(w, 4, 2, 7, COL.clay); w.box(-4, 5, -4, 4, 5, 4, COL.clayD); nsq(w, 3, 8, 8, COL.clay); nsq(w, 2, 9, 10, COL.clayD); nsq(w, 3, 11, 11, COL.clayL);
    w.box(3, 0, 2, 6, 5, 5, COL.clayD); w.box(3, 1, 2, 6, 4, 5, COL.clayL); w.box(4, 6, 3, 5, 6, 4, COL.woodD);
  },
  crate: w => {
    w.box(-5, 0, -5, 5, 9, 5, COL.wood);
    for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) { w.box(x, 0, z, x, 9, z, COL.woodD); w.box(x, 0, z, x, 1, z, MORE.iron); w.box(x, 8, z, x, 9, z, MORE.iron); }
    w.box(-5, 9, -5, 5, 9, 5, COL.woodL); w.box(-5, 0, -5, 5, 0, 5, COL.woodD); w.box(-5, 4, -5, 5, 5, 5, COL.woodD);
    w.box(-3, 10, -3, 3, 10, 3, COL.wood);
  },
  hay: w => {
    // paired upright bound golden wheat sheaves (aligned with 04-combat-ui.png)
    for (const [ox, h] of [[-4, 12], [4, 10]] as const) {
      w.box(ox - 3, 0, -4, ox + 3, h, 4, COL.straw);
      w.box(ox - 3, 0, -4, ox + 3, 1, 4, COL.strawD);
      w.box(ox - 3, h, -4, ox + 3, h, 4, COL.strawL);
      w.box(ox - 2, h + 1, -3, ox + 2, h + 1, 3, COL.strawL);
      w.box(ox - 3, 4, -4, ox + 3, 4, 4, COL.rope);
      w.box(ox - 3, h - 3, -4, ox + 3, h - 3, 4, COL.rope);
    }
  },
  oil: w => { nsq(w, 4, 0, 1, COL.oilD); nsq(w, 5, 2, 9, COL.oil); w.box(-5, 3, -5, 5, 3, 5, COL.oilD); nsq(w, 4, 10, 10, COL.oilL); nsq(w, 3, 11, 12, COL.oil); nsq(w, 3, 13, 13, COL.cloth); nsq(w, 3, 14, 15, COL.seal); w.box(3, 9, -1, 4, 13, 0, COL.cloth); w.box(-1, 16, -1, 0, 17, 0, COL.seal); },
  pillar: w => { w.box(-4, 0, -4, 4, 2, 4, COL.stone); w.box(-4, 2, -4, 4, 2, 4, COL.stoneL); w.box(-2, 3, -2, 2, 40, 2, COL.post); w.box(-2, 3, -2, -2, 40, 2, COL.postD); w.box(2, 3, -2, 2, 40, -2, COL.postL);
    w.box(-3, 18, -3, 3, 19, 3, COL.rope); w.box(-8, 35, -1, 8, 37, 1, COL.postD); w.box(-3, 41, -3, 3, 42, 3, COL.postD); w.box(6, 30, -1, 7, 34, 0, COL.rope); w.box(5, 26, -2, 8, 29, 1, COL.clay); },
  stump: w => { w.box(-4, 0, -4, 4, 2, 4, COL.stone); w.box(-4, 2, -4, 4, 2, 4, COL.stoneL); w.box(-2, 3, -2, 2, 7, 2, COL.post); w.box(-2, 8, -2, 0, 9, 2, COL.postL); w.box(1, 8, -2, 2, 8, 0, COL.postL); },
} satisfies Record<PropKind | 'stump' | 'palaceColumn' | 'palaceStump', (w: W) => void>;
const GEO = new Map<string, THREE.Mesh[]>();
function model(kind: keyof typeof BUILD, rot: 0 | 1 = 0) {
  if (rot) { const g = model(kind, 0); g.rotation.y = Math.PI / 2; const o = new THREE.Group(); o.add(g); return o; }
  if (!GEO.has(kind)) { const w = new VoxWorld(CELL); BUILD[kind](w); const ms = w.build({ rim: 0.3, edge: 0.16 }); for (const m of ms) m.geometry.translate(-CELL / 2 * 0, 0, 0); GEO.set(kind, ms); }
  const g = new THREE.Group(); for (const m of GEO.get(kind)!) { const c = new THREE.Mesh(m.geometry, m.material); c.updateMatrix(); c.matrixAutoUpdate = !OPT.staticMatrices; c.castShadow = m.castShadow; c.receiveShadow = true; g.add(c); } return g;
}
const COVER_GEO = new Map<string, THREE.Mesh[]>();
function coverModel(kind: CoverKind, rot: 0 | 1, rubble: boolean) {
  const key = kind + rot + (rubble ? 'r' : '');
  if (!COVER_GEO.has(key)) { const w = new VoxWorld(CELL); coverVox(w, kind, rot, rubble); COVER_GEO.set(key, w.build({ rim: 0.3, edge: 0.16 })); }
  const g = new THREE.Group(); for (const m of COVER_GEO.get(key)!) { const c = new THREE.Mesh(m.geometry, m.material); c.updateMatrix(); c.matrixAutoUpdate = !OPT.staticMatrices; c.castShadow = m.castShadow; c.receiveShadow = true; g.add(c); } return g;
}
/** shard colours per kind */
const SHARDS: Record<string, number[]> = { pot: [COL.clay, COL.clayD, COL.clayL], crate: [COL.wood, COL.woodD, COL.woodL], hay: [COL.straw, COL.strawD, COL.strawL], oil: [COL.oil, COL.oilD, COL.seal], pillar: [COL.post, COL.postD, COL.postL],
  fence: [COL.wood, COL.woodD, COL.postD], rack: [COL.wood, COL.postD, 0x6a6e78], banner: [0xd8b030, 0xa8841c, 0xa8302a], basket: [0xa07a44, 0x7a5a30, 0xc8b48a], sack: [0xc8b48a, 0x9a8662, 0xe0d0a0], lamp: [0xa8302a, 0xffc070, COL.postD],
  cover: [COL.stone, COL.stoneL, COL.woodD] };

interface Vis { p: BProp; g: THREE.Group; tilt: THREE.Group; solid: Solid; wob: { x: number; z: number; vx: number; vz: number }; fall: number; fuseT: number; cover?: Cover; drop?: number; model?: 'palaceColumn' }
interface FireVis { id: number; x: number; z: number; r: number; t: number; disc: THREE.Mesh; emit: number }

export class Breakables {
  private readonly fallAxis = new THREE.Vector3();
  logic = new BreakLogic(); root = new THREE.Group(); private vis = new Map<number, Vis>(); private fires: FireVis[] = [];
  constructor(parent: THREE.Object3D, private solids: Solids) { parent.add(this.root); }
  /** the room's props (from asm/arena.ts arenaPlan) */
  *buildSteps(list: ArenaPlan['props'], covers: Cover[] = [], detached = false) {
    this.clear();
    for (const it of list) {
      yield;
      const p = this.logic.add(it.kind, it.x, it.z), tilt = new THREE.Group(), g = new THREE.Group(), long = it.kind === 'fence' || it.kind === 'rack';
      tilt.add(model(it.model ?? it.kind, long ? (it.rot ?? 0) : 0)); g.add(tilt); g.position.set(p.x, 0, p.z); if (!long) g.rotation.y = ((p.id * 2654435761) % 4) * (Math.PI / 2); this.root.add(g);
      // a fence / rack is a thin box along its length; the rest are round
      const solid = long ? this.solids.add({ kind: 'prop', shape: 'box', x: p.x, z: p.z, hx: it.rot ? 0.2 : (it.kind === 'fence' ? 0.85 : 0.5), hz: it.rot ? (it.kind === 'fence' ? 0.85 : 0.5) : 0.2, slam: true, tag: p })
        : this.solids.add({ kind: 'prop', shape: 'circle', x: p.x, z: p.z, r: p.r * 0.85, slam: it.kind === 'pillar', tag: p });
      this.vis.set(p.id, { p, g, tilt, solid, model: it.model, wob: { x: 0, z: 0, vx: 0, vz: 0 }, fall: -1, fuseT: 0 });
    }
    // act-20: the cover pieces break too — a solid box that crumbles to a lower heap after enough blows
    for (const cv of covers) {
      yield;
      const p = this.logic.add('cover', cv.x, cv.z, Math.max(cv.hx, cv.hz)), tilt = new THREE.Group(), g = new THREE.Group();
      tilt.add(coverModel(cv.kind, cv.rot, false)); g.add(tilt); g.position.set(cv.x, 0, cv.z); this.root.add(g);
      const solid = this.solids.add({ kind: 'cover', shape: 'box', x: cv.x, z: cv.z, hx: cv.hx, hz: cv.hz, slam: true, tag: p });
      this.vis.set(p.id, { p, g, tilt, solid, wob: { x: 0, z: 0, vx: 0, vz: 0 }, fall: -1, fuseT: 0, cover: cv });
    }
    this.root.userData.propBatch = true;
    if (!detached) batchActor(this.root);
  }
  contacts(batch: ContactBatch) {
    for (const v of this.vis.values()) {
      if (!v.g.parent || !v.g.visible) continue;
      const s = v.solid, x = v.g.position.x, z = v.g.position.z;
      if (v.fall >= 0 && v.p.fallDir) {
        const reach = Math.sqrt(Math.max(0, 1 - v.tilt.quaternion.w ** 2)) * 2 * v.tilt.quaternion.w * BTUNE.toppleLen / 2;
        batch.add(x + v.p.fallDir[0] * reach, z + v.p.fallDir[1] * reach,
          s.r + Math.abs(v.p.fallDir[0] * reach), s.r + Math.abs(v.p.fallDir[1] * reach));
      } else batch.add(x, z, (s.hx || s.r) * 1.15, (s.hz || s.r) * 1.15);
    }
  }
  clear() {
    for (const v of this.vis.values()) this.root.remove(v.g); this.vis.clear();
    for (const f of this.fires) { this.root.remove(f.disc); (f.disc.material as THREE.Material).dispose(); } this.fires = [];
    this.logic.clear();
  }
  dispose() { this.clear(); this.root.parent?.remove(this.root); }
  /** a blow on every live prop the hero's arc touches (range, half angle about yaw); returns the events and prop damage */
  /** 11-18 定死的屋子: the room's puzzle pieces hear the hero's blows too (act/puzzles.ts — rope posts, hollow walls, bells) */
  onStrike: ((s: Strike) => void) | null = null;
  hitArc(from: THREE.Vector3, yaw: number, range: number, half: number, o: { src: BSrc; heavy?: boolean }, targets: BTarget[]) {
    if (o.src === 'hero') this.onStrike?.({ k: 'arc', x: from.x, z: from.z, yaw, range, half });
    const fx = Math.sin(yaw), fz = Math.cos(yaw), out = { events: [] as BEvent[], damage: [] as BDamage[] };
    for (const p of this.logic.near(from.x, from.z, range)) {
      if (p.state !== 'idle') continue;
      const dx = p.x - from.x, dz = p.z - from.z, l = Math.hypot(dx, dz), ang = Math.abs(Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz));
      if (l > p.r + 0.4 && ang > half) continue;
      this.merge(out, this.logic.hit(p, { src: o.src, heavy: o.heavy, dir: [fx, fz] }, targets));
    }
    return out;
  }
  /** a blow on every live prop inside a circle (a plunge, a dart, a body slammed into it) */
  hitCircle(x: number, z: number, r: number, o: { src: BSrc; heavy?: boolean; dir: [number, number] }, targets: BTarget[]) {
    if (o.src === 'hero') this.onStrike?.({ k: 'circle', x, z, r });
    const out = { events: [] as BEvent[], damage: [] as BDamage[] };
    for (const p of this.logic.near(x, z, r)) if (p.state === 'idle') this.merge(out, this.logic.hit(p, o, targets));
    return out;
  }
  /** a blow on every live prop along a segment (the lunge, 穿风斩) */
  hitSeg(a: THREE.Vector3, b: THREE.Vector3, r: number, o: { src: BSrc; heavy?: boolean }, targets: BTarget[]) {
    if (o.src === 'hero') this.onStrike?.({ k: 'seg', ax: a.x, az: a.z, bx: b.x, bz: b.z, r });
    const out = { events: [] as BEvent[], damage: [] as BDamage[] }, abx = b.x - a.x, abz = b.z - a.z, L2 = Math.max(1e-4, abx * abx + abz * abz), L = Math.sqrt(L2);
    for (const p of this.logic.props) {
      if (p.state !== 'idle') continue;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / L2)), qx = a.x + abx * t, qz = a.z + abz * t;
      if (Math.hypot(p.x - qx, p.z - qz) <= r + p.r) this.merge(out, this.logic.hit(p, { src: o.src, heavy: o.heavy, dir: [abx / L, abz / L] }, targets));
    }
    return out;
  }
  private merge(a: { events: BEvent[]; damage: BDamage[] }, b: { events: BEvent[]; damage: BDamage[] }) { a.events.push(...b.events); a.damage.push(...b.damage); }

  /** advance the logic and the pictures; returns what the game must apply (damage to foes / hero, drops) */
  update(dt: number, targets: BTarget[]) {
    const res = this.logic.update(dt, targets);
    for (const v of this.vis.values()) {
      // the wobble: a stiff damped spring
      const o = v.wob; o.vx += (-180 * o.x - 10 * o.vx) * dt; o.vz += (-180 * o.z - 10 * o.vz) * dt; o.x += o.vx * dt; o.z += o.vz * dt;
      if (v.fall < 0) { v.tilt.rotation.x = o.x; v.tilt.rotation.z = o.z; }
      // a lit jar: sparks spit from the seal, it shivers, its glow quickens
      if (v.p.state === 'fuse') {
        v.fuseT += dt; const top = V3(v.p.x, 1.15, v.p.z);
        if (Math.random() < dt * 40) fxSparks(top, 0xffb040, 2, 2.4, { life: 0.3 } as never);
        if (Math.random() < dt * 8) fxSmoke(top, 0x3a3634, 1, { s: 0.16, up: 1.2, life: 0.6 });
        v.tilt.rotation.z = Math.sin(v.fuseT * 60) * 0.04; fxGlow(top, 0xff7a20, 0.5 + 0.3 * Math.sin(v.fuseT * 30), 0.06, 2);
      }
      // a falling pillar: rotates about its foot toward its fall direction, slow then fast, with a bounce
      if (v.fall >= 0 && v.p.fallDir) {
        v.fall += dt; const k = Math.min(1, v.fall / 0.55), a = (Math.PI / 2) * (k * k) - (k >= 1 ? Math.sin(Math.min(1, (v.fall - 0.55) / 0.2) * Math.PI) * 0.06 : 0);
        v.tilt.rotation.set(0, 0, 0); v.g.rotation.set(0, 0, 0);
        this.fallAxis.set(v.p.fallDir[1], 0, -v.p.fallDir[0]); v.tilt.quaternion.setFromAxisAngle(this.fallAxis, a);
        if (v.fall >= 0.55 && v.fall - dt < 0.55) {
          const [dx, dz] = v.p.fallDir; for (let s = 0.6; s <= BTUNE.toppleLen; s += 0.7) fxSmoke(V3(v.p.x + dx * s, 0.2, v.p.z + dz * s), 0x8a7a6a, 2, { r: 0.4, spd: 1.6, up: 0.4, s: 0.4, life: 0.7 });
          shake(v.drop != null ? 0.08 : 0.28); cue(v.drop != null ? 'land' : 'wallSlam', v.drop != null ? 0.5 : 1.0);
        }
        if (v.drop != null && v.fall > v.drop) { this.root.remove(v.g); v.fall = -2; v.drop = undefined; continue; }
        if (v.fall > 2.4) { this.root.remove(v.g); const st = model(v.model === 'palaceColumn' ? 'palaceStump' : 'stump'); st.position.set(v.p.x, 0, v.p.z); this.root.add(st); v.g = st; v.tilt = new THREE.Group(); v.fall = -2; }
      }
    }
    for (const f of [...this.fires]) {
      f.t -= dt; f.emit -= dt;
      const m = f.disc.material as THREE.MeshBasicMaterial; m.opacity = Math.min(1, f.t / 0.6) * (0.32 + 0.08 * Math.sin(f.t * 23));
      if (f.emit <= 0 && f.t > 0.3) { f.emit = 0.05; const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * f.r * 0.85, p = V3(f.x + Math.cos(a) * d, 0.08, f.z + Math.sin(a) * d); fxEmbers(p, 0xff8a2a, 2, { r: 0.12, up: 1.8, life: 0.7 }); if (Math.random() < 0.35) fxGlow(p.setY(0.3), 0xff6a1a, 0.7, 0.25, 2.2); }
    }
    this.present(res.events);
    return res;
  }
  /** turn the logic's events into pictures and sounds (also called for the events a blow returned) */
  present(evs: BEvent[]) {
    for (const e of evs) {
      if (e.k === 'hit') { const v = this.vis.get(e.p.id); if (v) { const k = e.p.kind === 'cover' ? 1.2 : 5; v.wob.vx += e.dir[1] * k; v.wob.vz -= e.dir[0] * k; } fxChips(V3(e.p.x, 0.6, e.p.z), SHARDS[e.p.kind], 4, { dir: V3(e.dir[0], 0.3, e.dir[1]), speed: 3 }); cue(e.p.kind === 'hay' ? 'hayBurst' : 'crateBreak', 0.4); }
      else if (e.k === 'break' && e.p.kind === 'cover') {
        // a cover piece crumbles: the heap replaces it, a burst of blocks and dust, it still stands in the way (smaller)
        const v = this.vis.get(e.p.id); if (!v || !v.cover) continue;
        this.root.remove(v.g); const g = new THREE.Group(), t = new THREE.Group(); t.add(coverModel(v.cover.kind, v.cover.rot, true)); g.add(t); g.position.copy(v.g.position); this.root.add(g); v.g = g; v.tilt = t;
        v.solid.hx *= BTUNE.rubbleK; v.solid.hz *= BTUNE.rubbleK; v.solid.r *= BTUNE.rubbleK;
        const at = V3(e.p.x, 0.6, e.p.z);
        for (let i = 0; i < 16; i++) { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 3; addBlock(at.clone().add(V3(Math.cos(a) * 0.3, Math.random() * 0.6, Math.sin(a) * 0.3)), { size: 0.08 + Math.random() * 0.1, v: V3(Math.cos(a) * sp + e.dir[0] * 2, 2 + Math.random() * 3.5, Math.sin(a) * sp + e.dir[1] * 2), col: SHARDS.cover[i % 3], glow: false, debris: true, grav: 14, floor: 0.03, spin: 6, life: 1.8, shrink: 0.5 }); }
        fxSmoke(at, 0x8a7a6a, 10, { r: 0.8, spd: 1.8, up: 0.8, s: 0.5, life: 0.9, alpha: 0.5 }); shake(0.3); cue('pillarFall', 0.7); cue('wallSlam', 0.8);
      }
      else if (e.k === 'break' && (e.p.kind === 'banner' || e.p.kind === 'lamp' || e.p.kind === 'fence' || e.p.kind === 'rack')) {
        // tall / long things fall over the way they were hit, then go
        const v = this.vis.get(e.p.id); if (!v) continue; v.solid.on = false; e.p.fallDir = e.dir; v.fall = 0; v.drop = 1.6;
        fxChips(V3(e.p.x, 0.8, e.p.z), SHARDS[e.p.kind], 8, { dir: V3(e.dir[0], 0.3, e.dir[1]), speed: 3 }); cue(e.p.kind === 'banner' ? 'swish' : 'crateBreak', 0.8);
      }
      else if (e.k === 'break') {
        const v = this.vis.get(e.p.id); if (v) { this.root.remove(v.g); v.solid.on = false; }
        const at = V3(e.p.x, 0.4, e.p.z), cols = SHARDS[e.p.kind];
        for (let i = 0; i < (e.p.kind === 'hay' ? 6 : 10); i++) { const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2.5; addBlock(at.clone().add(V3(Math.cos(a) * 0.15, Math.random() * 0.4, Math.sin(a) * 0.15)), { size: 0.06 + Math.random() * 0.07, v: V3(Math.cos(a) * s + e.dir[0] * 2, 2 + Math.random() * 3, Math.sin(a) * s + e.dir[1] * 2), col: cols[i % cols.length], glow: false, debris: true, grav: 14, floor: 0.03, spin: 8, life: 1.4 + Math.random() * 0.6, shrink: 0.4 }); }
        if (e.p.kind === 'hay') { fxSmoke(at, 0xd8c890, 6, { r: 0.5, spd: 1.4, up: 0.8, s: 0.35, life: 0.8, alpha: 0.4 }); fxChips(at, cols, 12, { speed: 3, up: 3, size: 0.05 }); }
        else fxSmoke(at, 0x7a6a5a, 3, { r: 0.3, spd: 1.2, up: 0.5, s: 0.3, life: 0.5 });
        cue(e.p.kind === 'pot' ? 'potBreak' : e.p.kind === 'crate' ? 'crateBreak' : 'hayBurst', 0.8);
      }
      else if (e.k === 'fuse') { const v = this.vis.get(e.p.id); if (v) v.fuseT = 0; cue('fuse', 0.8); }
      else if (e.k === 'boom') {
        const v = this.vis.get(e.p.id); if (v) { this.root.remove(v.g); v.solid.on = false; }
        const at = V3(e.x, 0.6, e.z);
        fxImpact(at, 0xff7a2a, 2.6, { chips: SHARDS.oil, stop: false });
        fxRing(V3(e.x, 0.05, e.z), 0xffb060, e.r, { life: 0.45, width: 0.4, bright: 2.2 } as never);
        fxSmoke(at, 0x2e2a28, 10, { r: 1.0, spd: 2.6, up: 1.6, s: 0.6, life: 1.2, alpha: 0.5 });
        fxEmbers(at, 0xff9a3a, 18, { r: 1.2, up: 3, life: 1.2 }); shake(0.45); cue('boom', 1); cue('fire', 0.8);
      }
      else if (e.k === 'fire') {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(e.f.r, 8, Math.PI / 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        disc.position.set(e.f.x, 0.04, e.f.z); disc.renderOrder = 2; this.root.add(disc);
        this.fires.push({ id: e.f.id, x: e.f.x, z: e.f.z, r: e.f.r, t: e.f.t, disc, emit: 0 });
      }
      else if (e.k === 'fireEnd') { const i = this.fires.findIndex(f => f.id === e.f.id); if (i >= 0) { const f = this.fires[i]; this.root.remove(f.disc); (f.disc.material as THREE.Material).dispose(); f.disc.geometry.dispose(); this.fires.splice(i, 1); } }
      else if (e.k === 'topple') { const v = this.vis.get(e.p.id); if (v) { v.fall = 0; v.solid.r = BTUNE.stumpR; } cue('pillarFall', 1); }
    }
  }
  /** 11-18: a patch of fire set on the floor by a foe (the 纵火兵's jar, 阎虎's molten iron): the same fire as a burst jar's — it burns
   *  her, the foes and lights the oil jars it touches. Returns the logic's fire (its id ends it early) */
  ignite(x: number, z: number, r: number, t: number) {
    const f = this.logic.ignite(x, z, r, t); this.present([{ k: 'fire', f }]); return f;
  }
  /** a lit jar or a burning patch near a point (the bot keeps away from them) */
  danger(x: number, z: number, r: number) { return this.logic.props.some(p => p.state === 'fuse' && Math.hypot(p.x - x, p.z - z) < BTUNE.boomR + r) || this.logic.fires.some(f => Math.hypot(f.x - x, f.z - z) < f.r + r); }
}
