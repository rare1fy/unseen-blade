import type { ContactBatch } from '../engine/contactBatch';
// 定死的屋子里会动的东西（11-18，docs/LEVEL_DESIGN.md「小解谜」；用户：「甚至可以加点小解密元素」，六种都做、少数开路多数可选）。
// 都围着「她看不见，靠听」：每个机关自己往外渗淡淡的声纹（地上一圈圈），砍上去有它自己的声音。
//   门 D：分区的门，这一块打完开（两扇门板往里转开、扬尘）；机关门 G：铜铃 / 压板开
//   空心墙 ?：她走近时墙缝里渗声纹；砍一下空响，砍三下塌开，后面是暗室
//   木栅 X：火油坛在旁边炸开就烧掉
//   吊桥 - + 绳桩 r：桥吊在半空（立着），砍断绳桩桥砸下来，接上对岸
//   铜铃 b ×3：这一块清了以后三只铃按顺序各响一声（各出一圈声纹）；照同样的顺序砍铃，机关门开；砍错三只一起乱响，重来
//   赏 $：走过去拿（一间屋一次）
// 格子图（asm/roomShape.ts FloorGrid）跟着变：门开 / 墙塌 / 木栅烧掉 / 桥落下 → 那几格变成能走的地。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import { V3 } from '../engine/world';
import { PALPHA, TILE } from '../engine/particles';
import { fxSmoke, fxRing, fxChips, fxEmbers, fxFlare } from '../fx/fx';
import { shake, after } from '../engine/clock';
import { cue } from '../../audio/cues';
import { M } from '../scenes/props';
import { FloorGrid, FLOOR, OUT, type ShapePlan } from '../asm/roomShape';
import { wallPiece, WALL, type WallStyle } from '../asm/arena';
import { barricade } from './gates';
import { LiquidCopper } from '../asm/luoyang/molten';
import type { Rect } from '../asm/types';

/** a blow of the hero's, in the shapes act/breakables.ts takes */
export type Strike = { k: 'arc'; x: number; z: number; yaw: number; range: number; half: number } | { k: 'circle'; x: number; z: number; r: number }
  | { k: 'seg'; ax: number; az: number; bx: number; bz: number; r: number };
/** does the blow reach a thing of radius rad at (x, z)? */
function reaches(s: Strike, x: number, z: number, rad: number) {
  if (s.k === 'circle') return Math.hypot(x - s.x, z - s.z) <= s.r + rad;
  if (s.k === 'seg') { const abx = s.bx - s.ax, abz = s.bz - s.az, L2 = Math.max(1e-4, abx * abx + abz * abz), t = Math.max(0, Math.min(1, ((x - s.ax) * abx + (z - s.az) * abz) / L2)); return Math.hypot(x - (s.ax + abx * t), z - (s.az + abz * t)) <= s.r + rad; }
  const dx = x - s.x, dz = z - s.z, l = Math.hypot(dx, dz); if (l > s.range + rad) return false;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw); return l < rad + 0.4 || Math.abs(Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz)) <= s.half;
}
/** the point of a rect nearest to (x, z) */
const nearest = (r: Rect, x: number, z: number): [number, number] => [Math.max(r.x0, Math.min(r.x1, x)), Math.max(r.z0, Math.min(r.z1, z))];
const strikeAt = (s: Strike): [number, number] => s.k === 'seg' ? [s.bx, s.bz] : [s.x, s.z];

const COL = { wood: 0x6e5238, woodD: 0x4a3622, woodL: 0x8e6e4c, red: 0x8e3b2c, redD: 0x6a2b21, redL: 0xa44c36, iron: 0x4a4f5a, ironL: 0x6e7480, tile: 0x56585e, tileD: 0x3a3c42,
  bronze: 0x8a6a34, bronzeD: 0x5e4a26, bronzeL: 0xb08a48, rope: 0x9a8058, ropeD: 0x7a6440, stone: 0x86827a, stoneD: 0x67635c, gold: 0xe8c060, goldD: 0xa88430, cloth: 0x7a2a22 };
const HINT = 0xbfe0ff, GOOD = 0xffd27a;
// 11-19 (用户：「可交互的场景解密物件要有特效提示噢」): every piece she can use shows it all the time, not only when she is close —
// a square ring on the ground round it (横平竖直, no round glow), cool white / pale cyan (the exits' gold is another thing), breathing
// slowly; as she comes near it brightens and the breath quickens; when she is close enough to use it (a blow reaches it, a plate under
// her) it lights up once. One mesh per piece, flat on the floor, no new pass
const CUE_GEO = (() => { const g = new THREE.BufferGeometry(), o = 1, i = 0.8;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-o, 0, -o, o, 0, -o, o, 0, o, -o, 0, o, -i, 0, -i, i, 0, -i, i, 0, i, -i, 0, i]), 3));
  g.setIndex([0, 5, 1, 0, 4, 5, 1, 6, 2, 1, 5, 6, 2, 7, 3, 2, 6, 7, 3, 4, 0, 3, 7, 4]); return g; })();
/** the cue's colour: a clear cyan that holds on sunlit sand and on night snow alike (HINT's pale blue washed out by day) */
const CUE_COL = 0x62d4ff;
interface Cue { m: THREE.Mesh; wave: THREE.Mesh; x: number; z: number; hx: number; hz: number; reach: number; k: number; ready: boolean; flash: number; ph: number; on: () => boolean }
const BUBBLE = new THREE.Color(0xb8d8e0);
// (shadows as VoxWorld.build sets them: a big build hands its shadow to invisible tiles — act-55 微信帧率)
const mesh = (vw: VoxWorld) => { const g = new THREE.Group(); for (const m of vw.build({ rim: 0.3, edge: 0.16, ground: false })) g.add(m); return g; };

type PieceKind = 'door' | 'gate' | 'hollow' | 'barricade';
interface Piece {
  kind: PieceKind; rect: Rect; open: boolean;
  /** the way through runs along z (the piece spans x) or along x */
  run: 'x' | 'z';
  /** the floor's pieces on either end of the way through (zone labels at the start) */
  sides: [number, number];
  g: THREE.Group; t: number; hits: number; hintT: number;
  /** a door's two leaves (pivots at the posts) */ leaves?: THREE.Group[];
  /** the heap a hollow wall falls to */ rubble?: THREE.Group;
}
interface Drop { rect: Rect; post: [number, number]; pivot: THREE.Group; rope: THREE.Mesh; axis: 'x' | 'z'; sign: number; t: number; down: boolean; hintT: number }
interface Bell { x: number; z: number; g: THREE.Group; bell: THREE.Group; note: number; swing: number }
interface Reward { x: number; z: number; g: THREE.Group; taken: boolean; t: number }
interface Plate { x: number; z: number; slab: THREE.Group; gate: Piece; down: boolean; grace: number; hint: number }
interface Causeway { rect: Rect; water: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>; deck: THREE.Group }
interface Wheel { x: number; z: number; rim: THREE.Mesh; paths: Causeway[]; blows: number[]; drain: number; bubbles: number; hint: number }
type Body = { pos: THREE.Vector3; r: number };
interface PuzzleFrame { foes?: readonly Body[]; heroRadius?: number; heroHeight?: number; waitZone?: number }
export type PieceEvent = { k: 'reward'; i: number; x: number; z: number } | { k: 'opened'; kind: PieceKind; rect: Rect } | { k: 'bridge'; rect: Rect };

export class RoomPieces {
  root = new THREE.Group();
  pieces: Piece[] = []; drops: Drop[] = []; bells: Bell[] = []; rewards: Reward[] = [];
  plates: Plate[] = []; wheels: Wheel[] = [];
  private plateGates: Piece[] = [];
  private copper: LiquidCopper[] = [];
  /** the floor's zones with everything shut, as at the start (a door's cells are −1) */
  readonly zone0: Int16Array;
  private order: number[] = []; private got = 0; private seqT = -1; private seqDone = false; private bellsCalm = 0; private replayT = 0;
  private t = 0; private events: PieceEvent[] = [];
  private cues: Cue[] = [];
  /** a cue round a piece: centre (x, z), half-size (hx, hz) of the square, how near counts as "can use it now", whether it still waits */
  private addCue(x: number, z: number, hx: number, hz: number, reach: number, on: () => boolean, col = CUE_COL) {
    // (a plain blend, not additive: on a sunlit floor an additive pale ring all but vanished)
    const mk = () => { const q = new THREE.Mesh(CUE_GEO, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); q.position.set(x, 0.035, z); q.scale.set(hx, 1, hz); q.renderOrder = 3; this.root.add(q); return q; };
    const m = mk(), wave = mk(); wave.position.y = 0.03;
    this.cues.push({ m, wave, x, z, hx, hz, reach, k: 0, ready: false, flash: 0, ph: this.cues.length * 1.7, on });
  }
  private updateCues(dt: number, hero: THREE.Vector3) {
    for (const c of this.cues) {
      const live = c.on(); c.m.visible = c.wave.visible = live || c.k > 0.02; if (!c.m.visible) continue;
      const dx = Math.max(0, Math.abs(hero.x - c.x) - c.hx), dz = Math.max(0, Math.abs(hero.z - c.z) - c.hz), d = Math.hypot(dx, dz);
      const near = live ? Math.max(0, Math.min(1, 1 - (d - c.reach) / 7)) : 0, ready = live && d <= c.reach;
      if (ready && !c.ready) c.flash = 1; c.ready = ready; c.flash = Math.max(0, c.flash - dt * 2.2);
      c.k += ((live ? 1 : 0) - c.k) * Math.min(1, dt * 4);
      const rate = 0.9 + 1.6 * near, br = 0.5 + 0.5 * Math.sin(this.t * Math.PI * rate + c.ph);
      const a = c.k * Math.min(0.95, 0.38 + 0.3 * near + 0.15 * br + 0.45 * c.flash);
      (c.m.material as THREE.MeshBasicMaterial).opacity = a;
      const grow = 1 + 0.05 * br * near + 0.25 * c.flash; c.m.scale.set(c.hx * grow + 0.25, 1, c.hz * grow + 0.25);
      // the wave: a second square running out from it and fading, like a sound ring — slow far off, quicker close
      const u = (this.t * (0.45 + 0.55 * near) + c.ph * 0.1) % 1, sp = 0.25 + 0.9 * u;
      (c.wave.material as THREE.MeshBasicMaterial).opacity = c.k * (1 - u) * (0.35 + 0.3 * near);
      c.wave.scale.set(c.hx + sp, 1, c.hz + sp);
    }
  }
  private waiting = 0; private stageHint = 20;
  constructor(parent: THREE.Object3D, readonly sp: ShapePlan, readonly grid: FloorGrid, style: WallStyle, seed: number) {
    parent.add(this.root);
    for (const p of sp.pits) if (p.kind === 'molten') {
      const liquid = new LiquidCopper(p, sp.bridges, seed);
      this.root.add(liquid.mesh);
      this.copper.push(liquid);
    }
    const fx = sp.fixed!; this.zone0 = grid.zones().slice();
    const zoneAt = (x: number, z: number) => { const i = grid.ix(x), j = grid.iz(z); return i < 0 || j < 0 || i >= grid.nx || j >= grid.nz ? -1 : this.zone0[j * grid.nx + i]; };
    const size = new Map<number, number>(); for (const v of this.zone0) if (v >= 0) size.set(v, (size.get(v) ?? 0) + 1);
    for (const q of fx.closed) {
      const cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
      const zA = zoneAt(cx, q.z0 - 0.25), zB = zoneAt(cx, q.z1 + 0.25), xA = zoneAt(q.x0 - 0.25, cz), xB = zoneAt(q.x1 + 0.25, cz);
      const run: 'x' | 'z' = zA >= 0 && zB >= 0 ? 'z' : 'x', sides: [number, number] = run === 'z' ? [zA, zB] : [xA, xB];
      // (a wall / a barricade stands flush with the bigger side's wall line, so from there it reads as the wall going on)
      const big = (size.get(sides[1]) ?? 0) > (size.get(sides[0]) ?? 0) ? 1 : 0;
      const p: Piece = { kind: q.kind, rect: { x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1 }, open: false, run, sides, g: new THREE.Group(), t: -1, hits: 0, hintT: 1 + (this.pieces.length * 0.7) };
      this.build(p, style, big, seed);
      this.pieces.push(p); this.root.add(p.g);
    }
    // the drop-bridges: each hangs from the bank by the nearest rope post
    for (const s of fx.sunk) if (s.kind === 'drop') {
      const ropes = fx.marks.filter(m => m.kind === 'rope'); if (!ropes.length) continue;
      const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, post = ropes.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
      this.drops.push(this.dropBridge(s, [post.x, post.z]));
    }
    // the bells, in the order they ring (from the room's seed), each its own note by its place in the order
    const bm = fx.marks.filter(m => m.kind === 'bell');
    this.order = bm.map((_, i) => i).sort((a, b) => ((a * 7 + seed) % 5) - ((b * 7 + seed) % 5) || a - b);
    bm.forEach((m, i) => this.bells.push(this.bell(m.x, m.z, this.order.indexOf(i))));
    const gates = this.pieces.filter(p => p.kind === 'gate');
    for (const m of fx.marks) {
      if (m.kind === 'wheel') this.wheels.push(this.wheel(m.x, m.z));
      if (m.kind !== 'plate') continue;
      const local = gates.filter(g => g.sides.includes(zoneAt(m.x, m.z)));
      const distance = (g: Piece) => g.g.position.distanceToSquared(V3(m.x, 0, m.z));
      const gate = (local.length ? local : gates).slice().sort((a, b) => distance(a) - distance(b))[0];
      if (!gate) throw new Error('Unpaired plate in ' + fx.id);
      const stone = new VoxWorld(CELL);
      stone.box(-10, 0, -10, 9, 0, 9, COL.tileD);
      stone.box(-9, 0, -9, 8, 0, 8, COL.stone);
      const slab = mesh(stone); slab.position.set(m.x, 0, m.z); this.root.add(slab);
      this.plates.push({ x: m.x, z: m.z, slab, gate, down: false, grace: 0, hint: 2.5 });
      if (!this.plateGates.includes(gate)) this.plateGates.push(gate);
    }
    for (const s of fx.sunk) if (s.kind === 'flood') {
      const x = (s.x0 + s.x1) / 2, z = (s.z0 + s.z1) / 2;
      const w = this.wheels.slice().sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
      if (!w) throw new Error('Flooded causeway without a wheel in ' + fx.id);
      w.paths.push(this.causeway(s));
    }
    for (const m of fx.marks) if (m.kind === 'reward') this.rewards.push(this.reward(m.x, m.z));
    // the cues (see addCue): the hollow walls and barricades, the rope posts, the bells, the plates, the wheels, the rewards
    for (const q of this.pieces) if (q.kind === 'hollow' || q.kind === 'barricade') {
      const cx = (q.rect.x0 + q.rect.x1) / 2, cz = (q.rect.z0 + q.rect.z1) / 2, hx = (q.rect.x1 - q.rect.x0) / 2 + 0.15, hz = (q.rect.z1 - q.rect.z0) / 2 + 0.15;
      this.addCue(cx, cz, hx, hz, q.kind === 'hollow' ? 1.4 : 2.4, () => !q.open && q.t < 0, q.kind === 'barricade' ? 0xffc890 : HINT);
    }
    for (const d of this.drops) this.addCue(d.post[0], d.post[1], 0.45, 0.45, 1.4, () => !d.down && d.t < 0);
    for (const b of this.bells) this.addCue(b.x, b.z, 0.5, 0.5, 1.5, () => this.got < this.order.length);
    for (const pl of this.plates) this.addCue(pl.x, pl.z, 0.75, 0.75, 0.05, () => !pl.down && pl.grace <= 0);
    for (const w of this.wheels) this.addCue(w.x, w.z, 0.55, 0.55, 1.5, () => w.drain < 0);
    for (const r of this.rewards) this.addCue(r.x, r.z, 0.45, 0.45, 0.6, () => !r.taken, GOOD);
  }

  // ------------------------------------------------------------ the models
  private build(p: Piece, style: WallStyle, big: number, seed: number) {
    const r = p.rect, w = p.run === 'z' ? r.x1 - r.x0 : r.z1 - r.z0, d = p.run === 'z' ? r.z1 - r.z0 : r.x1 - r.x0, half = Math.round(w / CELL / 2);
    // the piece's own frame: across the way along local x, the way along local z (+z = the 'big' side when it stands at an edge)
    p.g.position.set((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2); p.g.rotation.y = p.run === 'z' ? 0 : Math.PI / 2;
    const edge = (big ? 1 : -1) * (d / 2 - WALL.thick / 2);   // the local z of the bigger side's wall line (local +z = sides[1]'s side)
    if (p.kind === 'door' || p.kind === 'gate') {
      // two posts on stone plinths, a lintel and a little tiled eave; two plank leaves (a puzzle's gate: red lacquer, a bronze lock)
      const red = p.kind === 'gate', post = red ? COL.red : COL.woodD, leaf = red ? COL.red : COL.wood, leafD = red ? COL.redD : COL.woodD;
      const fr = new VoxWorld(CELL), PH = 33;
      for (const s of [-1, 1]) { const a = s * (half + 1); fr.box(a - 2, 0, -3, a + 1, 3, 2, COL.stoneD); fr.box(a - 1, 4, -2, a, PH, 1, post); }
      fr.box(-half - 5, PH + 1, -2, half + 4, PH + 3, 1, COL.woodD); fr.box(-half - 7, PH + 4, -5, half + 6, PH + 5, 4, COL.tileD); fr.box(-half - 5, PH + 6, -3, half + 4, PH + 7, 2, COL.tile);
      p.g.add(mesh(fr));
      p.leaves = [-1, 1].map(s => {
        const lv = new VoxWorld(CELL), n = half - 1;
        // built from the hinge (x = 0) toward the middle (x = −s·n)
        for (let x = 0; x < n; x++) { const a = -s * x - (s > 0 ? 1 : 0); lv.box(a, 1, -1, a, PH - 3, 0, x % 4 === 3 ? leafD : leaf); }
        const lo = Math.min(0, -s * n), hi = Math.max(-1, -s * n);
        for (const y of [7, 20]) lv.box(lo, y, -2, hi, y + 1, -2, leafD);
        if (red) {
          const latch = -s * (n - 3);
          lv.box(latch - 1, 14, -3, latch + 1, 19, 1, COL.bronze);
        }
        const piv = new THREE.Group(); piv.position.set(s * (half - 0.5) * CELL, 0, 0); piv.add(mesh(lv)); p.g.add(piv); return piv;
      });
    } else if (p.kind === 'hollow') {
      // the wall going on across the gap, flush with the bigger side's line — the same wall as the room's (the trick is to hear it)
      const vw = new VoxWorld(CELL), T = M(WALL.thick), H = M(WALL.h) - 1, rr = (k: number) => ((Math.sin((seed + k) * 12.9898) * 43758.5453) % 1 + 1) % 1;
      wallPiece((x0, y0, z0, x1, y1, z1, c) => vw.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), c), style, 'x', -half - 1, half, -Math.floor(T / 2), T - Math.floor(T / 2) - 1, H, rr, 3);
      const wall = mesh(vw); wall.position.z = edge; p.g.add(wall);
      const rb = new VoxWorld(CELL); rb.box(-half + 1, 0, -4, -2, 3, 3, COL.stoneD); rb.box(1, 0, -3, half - 2, 2, 4, COL.stone); rb.box(-4, 3, -2, 3, 5, 2, COL.stoneD);
      p.rubble = mesh(rb); p.rubble.position.z = edge; p.rubble.visible = false; p.g.add(p.rubble);
    } else {
      const bar = barricade(w - 0.3); bar.position.z = edge; p.g.add(bar);
    }
  }
  private dropBridge(s: Rect, post: [number, number]): Drop {
    // which end it hangs from: the end nearer its rope post; it stands up from there and falls across the water
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, alongZ = s.z1 - s.z0 >= s.x1 - s.x0;
    const axis: 'x' | 'z' = alongZ ? 'z' : 'x', sign = alongZ ? (post[1] < cz ? -1 : 1) : (post[0] < cx ? -1 : 1);
    const L = alongZ ? s.z1 - s.z0 : s.x1 - s.x0, Wd = alongZ ? s.x1 - s.x0 : s.z1 - s.z0, n = Math.round(L / CELL), hw = Math.round(Wd / CELL / 2);
    // the deck in a frame with the hinge at the origin and the span along −z (rotating about x lifts it)
    const vw = new VoxWorld(CELL);
    vw.box(-hw, -2, -n, hw - 1, -1, -1, COL.woodD); vw.box(-hw, 0, -n, hw - 1, 0, -1, COL.wood);
    for (let z = -n + 3; z < -1; z += 5) vw.box(-hw, 0, z, hw - 1, 0, z, COL.woodD);
    for (const x of [-hw, hw - 1]) { vw.box(x, 1, -n, x, 1, -1, COL.woodL); vw.box(x, 0, -n, x, 7, -n, COL.woodD); }
    const deck = mesh(vw), pivot = new THREE.Group(); pivot.add(deck);
    const hx = alongZ ? cx : (sign < 0 ? s.x0 : s.x1), hz = alongZ ? (sign < 0 ? s.z0 : s.z1) : cz;
    pivot.position.set(hx, 0, hz);
    // local −z must point across the water: from the hinge toward the far end
    pivot.rotation.order = 'YXZ'; pivot.rotation.y = alongZ ? (sign < 0 ? Math.PI : 0) : (sign < 0 ? -Math.PI / 2 : Math.PI / 2);
    pivot.rotation.x = 1.3;   // standing up
    this.root.add(pivot);
    // the rope post: a squat timber post, rope wound round it; the rope from its top to the deck's far end
    const pv = new VoxWorld(CELL); pv.box(-2, 0, -2, 1, 22, 1, COL.woodD); pv.box(-3, 0, -3, 2, 2, 2, COL.stoneD); for (const y of [8, 11, 14]) pv.box(-3, y, -3, 2, y + 1, 2, COL.rope); pv.box(-1, 23, -1, 0, 24, 0, COL.ropeD);
    const pm = mesh(pv); pm.position.set(post[0], 0, post[1]); this.root.add(pm);
    const rope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1), new THREE.MeshLambertMaterial({ color: COL.rope })); this.root.add(rope);
    const d: Drop = { rect: s, post, pivot, rope, axis, sign, t: -1, down: false, hintT: 2 };
    this.ropeTo(d); return d;
  }
  /** the rope from the post's top to the raised deck's far end */
  private ropeTo(d: Drop) {
    d.pivot.updateMatrixWorld(true);
    const n = Math.round((d.axis === 'z' ? d.rect.z1 - d.rect.z0 : d.rect.x1 - d.rect.x0) / CELL), tip = V3(0, 0.1, -n * CELL).applyMatrix4(d.pivot.matrixWorld), top = V3(d.post[0], 1.62, d.post[1]);
    d.rope.position.copy(tip).add(top).multiplyScalar(0.5); d.rope.scale.set(1, 1, tip.distanceTo(top)); d.rope.lookAt(top);
  }
  private bell(x: number, z: number, note: number): Bell {
    // a bell frame: two posts, a beam, the bronze bell hanging under it (it swings when rung)
    const fr = new VoxWorld(CELL);
    const tree = this.sp.fixed?.bellTrees;
    if (tree) {
      // Keep the bell (and its hit and sound origins) on the mark. Grow the tree behind it.
      fr.box(-12, 0, -21, -7, 41, -16, COL.woodD);
      fr.box(-10, 26, -18, -6, 30, -7, COL.wood);
      fr.box(-8, 27, -10, 1, 30, -6, COL.wood);
      fr.box(-2, 28, -8, 1, 30, 1, COL.wood);
      fr.box(-15, 37, -27, 1, 45, -12, 0x68632e);
      fr.box(-10, 44, -26, 5, 49, -16, 0x898044);
      fr.box(1, 34, -24, 12, 40, -10, 0x79763a);
    } else {
      for (const s of [-1, 1]) { fr.box(s * 7 - 1, 0, -1, s * 7, 30, 0, COL.woodD); fr.box(s * 7 - 2, 0, -2, s * 7 + 1, 2, 1, COL.stoneD); }
      fr.box(-9, 31, -1, 8, 32, 0, COL.wood); fr.box(-10, 33, -2, 9, 33, 1, COL.tileD);
    }
    const g = mesh(fr); g.position.set(x, 0, z);
    const bv = new VoxWorld(CELL);
    if (tree) {
      bv.box(-1, -3, -1, 0, 0, 0, 0xbf3024);
      bv.box(-2, -5, -2, 1, -4, 1, 0xf0c060);
      bv.box(-3, -9, -3, 2, -6, 2, 0xc8902a);
      bv.box(-4, -11, -4, 3, -10, 3, 0x8a5a1a);
      bv.box(-4, -10, -4, 3, -10, 3, 0xf0c060);
      bv.box(-1, -12, -1, 0, -11, 0, 0xc8902a);
    } else {
      bv.box(-3, -12, -3, 2, -4, 2, COL.bronze); bv.box(-4, -13, -4, 3, -12, 3, COL.bronzeD); bv.box(-2, -4, -2, 1, -2, 1, COL.bronzeL); bv.box(-1, -1, -1, 0, 0, 0, COL.rope);
    }
    for (let i = 0; i <= note; i++) bv.box(-3 + i * 2, -9, 3, -3 + i * 2, -8, 3, tree ? 0xf0c060 : COL.bronzeL);
    const bell = mesh(bv); bell.position.y = (tree ? 29 : 30) * CELL; g.add(bell); this.root.add(g);
    return { x, z, g, bell, note, swing: 0 };
  }
  private wheel(x: number, z: number): Wheel {
    const timber = new VoxWorld(CELL);
    for (const a of [-8, 5]) {
      timber.box(a - 1, 0, -6, a + 3, 2, 4, COL.stoneD);
      timber.box(a, 3, -4, a + 2, 20, -1, COL.woodD);
    }
    timber.box(-9, 16, -5, 9, 20, -1, COL.wood);
    timber.box(-2, 15, -5, 2, 19, 5, COL.iron);
    const frame = mesh(timber); frame.position.set(x, 0, z); this.root.add(frame);
    const parts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.62, 0.085, 4, 12)];
    for (let i = 0; i < 4; i++) parts.push(new THREE.BoxGeometry(1.16, 0.065, 0.08).rotateZ(i * Math.PI / 4));
    parts.push(new THREE.BoxGeometry(0.18, 0.18, 0.22), new THREE.BoxGeometry(0.12, 0.12, 0.22).translate(0.55, 0, 0.12));
    const rim = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: COL.bronzeL }));
    for (const p of parts) p.dispose();
    rim.position.set(x, 1.22, z + 0.33); rim.castShadow = true; this.root.add(rim);
    return { x, z, rim, paths: [], blows: [], drain: -1, bubbles: 2, hint: 1 };
  }
  private causeway(rect: Rect): Causeway {
    const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({
      color: 0x385668, emissive: 0x0b202c, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    water.rotation.x = -Math.PI / 2; water.position.set(rect.x0 + w / 2, -0.2, rect.z0 + d / 2);
    water.renderOrder = 2; this.root.add(water);
    const stone = new VoxWorld(CELL), W = M(w), D = M(d);
    stone.box(0, -2, 0, W - 1, -1, D - 1, COL.stoneD);
    for (let x = 1; x < W - 1; x += 12) stone.box(x, -1, 1, Math.min(W - 2, x + 10), -1, D - 2, COL.stone);
    const deck = mesh(stone); deck.position.set(rect.x0, -0.42, rect.z0); this.root.add(deck);
    return { rect, water, deck };
  }
  private reward(x: number, z: number): Reward {
    // a cloth bundle tied with red cord on a flat stone, a coin string beside it
    const vw = new VoxWorld(CELL); vw.box(-5, 0, -4, 4, 2, 3, COL.stoneD); vw.box(-4, 3, -3, 3, 8, 2, COL.cloth); vw.box(-1, 9, -1, 0, 10, 0, COL.cloth); vw.box(-4, 6, -1, 3, 6, 0, COL.red);
    for (let i = 0; i < 4; i++) vw.box(5, 0 + i, -2 + i, 6, 0 + i, -1 + i, COL.gold);
    const g = mesh(vw); g.position.set(x, 0, z); this.root.add(g);
    return { x, z, g, taken: false, t: 0 };
  }

  // ------------------------------------------------------------ what the game does to them
  /** a blow of the hero's: rope posts, hollow walls, bells */
  strike(s: Strike) {
    const [sx, sz] = strikeAt(s);
    for (const w of this.wheels) if (w.drain < 0 && reaches(s, w.x, w.z, 0.55)) {
      w.blows = w.blows.filter(t => this.t - t <= 3);
      w.blows.push(this.t); w.rim.rotation.z += Math.PI / 8;
      cue('clack', 0.65); fxRing(V3(w.x, 0.07, w.z), HINT, 1 + w.blows.length * 0.25);
      if (w.blows.length >= 4) this.drain(w);
    }
    for (const d of this.drops) if (!d.down && d.t < 0 && reaches(s, d.post[0], d.post[1], 0.45)) this.cut(d);
    for (const p of this.pieces) if (p.kind === 'hollow' && !p.open && p.t < 0) {
      const [nx, nz] = nearest(p.rect, sx, sz); if (!reaches(s, nx, nz, 0.35)) continue;
      p.hits++; p.hintT = 0.3;
      const at = V3(nx, 0.7, nz); fxChips(at, [COL.stone, COL.stoneD], 6, { speed: 2 }); fxRing(V3(nx, 0.06, nz), HINT, 1.6 + p.hits * 0.4, { life: 0.6 });
      cue('hollow', 0.7 + p.hits * 0.1); p.g.position.x += (Math.random() - 0.5) * 0.04;
      if (p.hits >= 3) this.openPiece(p);
    }
    for (const b of this.bells) if (reaches(s, b.x, b.z, 0.5)) this.ring(b);
  }
  /** an explosion (an oil jar): a barricade within its reach burns */
  boom(x: number, z: number, r: number) {
    for (const p of this.pieces) if (p.kind === 'barricade' && !p.open && p.t < 0) { const [nx, nz] = nearest(p.rect, x, z); if (Math.hypot(nx - x, nz - z) <= r + 0.4) this.openPiece(p); }
  }
  /** open a piece: a door swings, a wall caves in, a barricade burns — its cells become floor */
  openPiece(p: Piece) {
    if (p.open || p.t >= 0) return;
    p.t = 0;
    const c = V3((p.rect.x0 + p.rect.x1) / 2, 0.3, (p.rect.z0 + p.rect.z1) / 2);
    if (p.kind === 'door' || p.kind === 'gate') { cue('doorOpen', 1); fxRing(c.clone().setY(0.06), GOOD, 3.2, { life: 0.9 }); }
    else if (p.kind === 'hollow') { cue('wallBreak', 1); shake(0.25); fxSmoke(c, 0x9a8a72, 14, { r: 1.2, spd: 1.4, up: 0.8, s: 0.5, life: 0.9 }); fxChips(c.clone().setY(0.8), [COL.stone, COL.stoneD], 18, { speed: 4 }); }
    else { cue('fire', 1); fxEmbers(c, 0xff8a3a, 16, { r: 1.2, up: 1.6, life: 1.2 }); fxFlare(c.clone().setY(0.8), 0xff8a3a, 2.2, 0.5); }
  }
  private cut(d: Drop) {
    d.t = 0; d.rope.visible = false; cue('ropeSnap', 1); fxChips(V3(d.post[0], 1.5, d.post[1]), [COL.rope, COL.ropeD], 8, { speed: 3 });
  }
  private ring(b: Bell) {
    b.swing = 1; cue('bell', 1, b.note); fxRing(V3(b.x, 0.06, b.z), GOOD, 2.6, { life: 0.9 });
    if (!this.seqDone || this.got >= this.order.length) return;
    const want = this.bells[this.order[this.got]];
    if (b === want) { this.got++; if (this.got >= this.order.length) this.openBellGates(); }
    else { this.got = 0; this.replayT = 1.6; after(0.38, () => { cue('bellWrong', 1); for (const q of this.bells) { q.swing = 1.4; fxRing(V3(q.x, 0.06, q.z), 0xff9a7a, 2.0, { life: 0.5 }); } }); }
  }
  /** play the order: each bell in turn rings and rings out its sound */
  private playOrder() { this.seqT = 0; this.got = 0; }
  private openBellGates() {
    for (const p of this.pieces) if (p.kind === 'gate' && !this.plateGates.includes(p)) this.openPiece(p);
  }
  private drain(w: Wheel) {
    w.drain = 0; w.bubbles = 0; cue('doorOpen', 0.7); cue('splash', 0.65);
  }
  private updateWheel(w: Wheel, hero: THREE.Vector3, dt: number) {
    if (w.drain >= 1.5) return;
    w.hint -= dt; w.bubbles -= dt;
    if (w.drain < 0 && w.hint <= 0 && Math.hypot(hero.x - w.x, hero.z - w.z) < 7) {
      w.hint = 2.5; cue('doorOpen', 0.23);
      fxRing(V3(w.x, 0.08, w.z), HINT, 1.3, { life: 0.9, width: 0.06 });
    }
    if (w.drain >= 0) {
      w.drain = Math.min(1.5, w.drain + dt);
      w.rim.rotation.z = Math.PI / 2 + Math.PI * w.drain;
    }
    for (const { water, deck, rect } of w.paths) {
      const k = Math.max(0, w.drain / 1.5);
      water.position.y = -0.2 - 0.32 * k; water.material.opacity = 0.9 * (1 - k);
      deck.position.y = -0.42 * (1 - k);
      if (w.bubbles <= 0) {
        for (const a of [-0.22, 0, 0.22]) PALPHA.emit({
          p: V3(water.position.x + a, water.position.y + 0.02, water.position.z + a * 0.5),
          v: V3(0, 0.45 + a, 0), tile: TILE.ring, c0: BUBBLE, s0: 0.08, s1: 0.17, life: 0.85,
        });
      }
      if (k === 1) { water.visible = false; this.grid.set(rect, FLOOR); }
    }
    if (w.bubbles <= 0) w.bubbles = w.drain < 0 ? 2 : 0.24;
  }
  private updatePlates(dt: number, hero: Body, height: number, foes: readonly Body[]) {
    for (const p of this.plates) {
      const on = (v: THREE.Vector3) => Math.abs(v.x - p.x) <= 10 * CELL && Math.abs(v.z - p.z) <= 10 * CELL;
      const she = height <= CELL && on(hero.pos), down = she || foes.some(f => f.pos.y <= CELL && on(f.pos));
      p.grace = she ? 5 : Math.max(0, p.grace - dt);
      if (down && !p.down) {
        cue('plate', 1);
        fxRing(V3(p.x, 0.09, p.z), GOOD, Math.hypot(p.x - p.gate.g.position.x, p.z - p.gate.g.position.z), { life: 0.8, width: 0.06, fill: 0 });
      }
      p.down = down; p.slab.position.y = down ? -CELL * 0.85 : 0;
      p.hint -= dt;
      if (!down && p.hint <= 0 && Math.hypot(hero.pos.x - p.x, hero.pos.z - p.z) < 7) {
        p.hint = 2.5; fxRing(V3(p.x, 0.09, p.z), HINT, 1.2, { life: 1, width: 0.06, bright: 0.7, fill: 0 });
      }
    }
    for (const g of this.plateGates) {
      if (this.plates.some(p => p.gate === g && (p.down || p.grace > 0))) {
        if (!g.open && g.t < 0) { this.openPiece(g); this.grid.set(g.rect, FLOOR); g.hintT = 0.6; }
        g.hintT -= dt;
        if (g.hintT <= 0) {
          g.hintT = 1.25; cue('clack', 0.45); fxRing(g.g.position.clone().setY(0.08), GOOD, 1.25, { width: 0.07, life: 0.5 });
        }
        if (g.open) g.leaves?.forEach((lv, i) => { lv.rotation.y = (i ? -1 : 1) * (1.75 + (g.hintT > 1.05 ? Math.sin(this.t * 67) * 0.035 : 0)); });
      } else if (g.open || g.t >= 0) {
        g.open = false; g.t = -1; this.grid.set(g.rect, OUT);
        g.leaves?.forEach(lv => { lv.rotation.y = 0; }); cue('plate', 0.7);
        this.pushOutside(g, hero);
        for (const f of foes) this.pushOutside(g, f);
      }
    }
  }
  private pushOutside(g: Piece, body: Body) {
    const { pos, r } = body, q = g.rect, [x, z] = nearest(q, pos.x, pos.z);
    if (Math.hypot(x - pos.x, z - pos.z) > r) return;
    const axis = g.run, lo = axis === 'x' ? q.x0 : q.z0, hi = axis === 'x' ? q.x1 : q.z1;
    pos[axis] = pos[axis] - lo < hi - pos[axis] ? lo - r - 0.01 : hi + r + 0.01;
    this.grid.clamp(pos, r);
  }

  /** the doors between zone a and zone b (or out of zone a) — the stage flow opens them */
  contacts(batch: ContactBatch) {
    for (const p of this.pieces) {
      if (p.open && !p.rubble?.visible && !p.leaves) continue;
      const r = p.rect, rx = (r.x1 - r.x0) / 2, rz = (r.z1 - r.z0) / 2;
      if (p.leaves && p.open) {
        // The swung leaves lie beside the posts. Keep the doorway clear.
        for (const leaf of p.leaves) {
          const v = leaf.getWorldPosition(this.contactPos);
          batch.add(v.x, v.z, p.run === 'z' ? 0.35 : rx, p.run === 'z' ? rz : 0.35);
        }
      } else batch.add(p.g.position.x, p.g.position.z, rx, rz);
    }
    for (const d of this.drops) {
      const r = d.rect, rx = (r.x1-r.x0)/2, rz = (r.z1-r.z0)/2, k = Math.cos(d.pivot.rotation.x);
      batch.add(d.pivot.position.x + ((r.x0+rx)-d.pivot.position.x)*k, d.pivot.position.z + ((r.z0+rz)-d.pivot.position.z)*k,
        d.axis === 'x' ? rx*k : rx, d.axis === 'z' ? rz*k : rz, -0.08);
    }
  }
  private contactPos = V3();
  doorsOf(zone: number) { return this.pieces.filter(p => p.kind === 'door' && !p.open && p.t < 0 && p.sides.includes(zone)); }
  /** the zone (as at the start) of (x, z); −1 off the floor or in a doorway */
  zoneAt(x: number, z: number) { const g = this.grid, i = g.ix(x), j = g.iz(z); return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : this.zone0[j * g.nx + i]; }
  /** A failed spawn roll can land in a sealed reward room even though it is on floor. Stay in the wave's original zone. */
  spawnInZone(zone: number, x: number, z: number): [number, number] {
    const g = this.grid;
    let best = this.sp.enter, distance = Infinity;
    for (let k = 0; k < this.zone0.length; k++) {
      if (this.zone0[k] !== zone) continue;
      const i = k % g.nx, j = Math.floor(k / g.nx), px = g.cx(i), pz = g.cz(j);
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < distance && g.walk(i, j) && g.clear(px, pz, 0.7)) { best = [px, pz]; distance = d; }
    }
    return best;
  }
  /** the bounds of a zone (as at the start) */
  zoneBox(zone: number): Rect {
    const g = this.grid; let i0 = 1e9, i1 = -1, j0 = 1e9, j1 = -1;
    for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) if (this.zone0[j * g.nx + i] === zone) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
    return i1 < 0 ? { x0: 0, x1: 0, z0: 0, z1: 0 } : { x0: g.cx(i0) - 0.245, x1: g.cx(i1) + 0.245, z0: g.cz(j0) - 0.245, z1: g.cz(j1) + 0.245 };
  }
  /** what is left to solve (the debug list) */
  list() {
    return [...this.pieces.map(p => ({ kind: p.kind, open: p.open || p.t >= 0, hits: p.hits, at: [(p.rect.x0 + p.rect.x1) / 2, (p.rect.z0 + p.rect.z1) / 2] })),
      ...this.drops.map(d => ({ kind: 'drop', open: d.down || d.t >= 0, at: d.post })), ...(this.bells.length ? [{ kind: 'bells', open: this.got >= this.order.length, got: this.got, order: this.order }] : []),
      ...this.plates.map(p => ({ kind: 'plate', open: p.down || p.grace > 0, down: p.down, seconds: p.grace, gate: this.pieces.indexOf(p.gate), at: [p.x, p.z] })),
      ...this.wheels.map(w => ({ kind: 'wheel', open: w.drain >= 0, hits: w.blows.filter(t => this.t - t <= 3).length, drained: w.drain === 1.5, at: [w.x, w.z] })),
      ...this.rewards.map(r => ({ kind: 'reward', open: r.taken, at: [r.x, r.z] }))];
  }
  /** solve one (debug / the bot): i into list() */
  solve(i: number) {
    const all = this.list(), it = all[i]; if (!it || it.open) return;
    const np = this.pieces.length, nd = this.drops.length;
    const firstPlate = np + nd + Number(this.bells.length > 0);
    if (i < np) {
      const plate = this.plates.find(p => p.gate === this.pieces[i]);
      if (plate) plate.grace = 5; else this.openPiece(this.pieces[i]);
    } else if (i < np + nd) this.cut(this.drops[i - np]);
    else if (it.kind === 'bells') { this.seqDone = true; this.got = this.order.length; this.openBellGates(); }
    else if (it.kind === 'plate') this.plates[i - firstPlate].grace = 5;
    else if (it.kind === 'wheel') this.drain(this.wheels[i - firstPlate - this.plates.length]);
  }

  /** each frame: the animations, the hints round the hero, the bells' order once their part of the floor is calm, the rewards
   *  picked up. calm = no foe alive in the room */
  update(dt: number, hero: THREE.Vector3, calm: boolean, { foes = [], heroRadius = 0.4, heroHeight = hero.y, waitZone = -1 }: PuzzleFrame = {}): PieceEvent[] {
    this.t += dt; const ev = this.events; this.events = [];
    for (const liquid of this.copper) liquid.update(this.t, dt);
    if (this.plates.length) this.updatePlates(dt, { pos: hero, r: heroRadius }, heroHeight, foes);
    for (const w of this.wheels) this.updateWheel(w, hero, dt);
    this.updateCues(dt, hero);
    if (calm && waitZone >= 0) {
      this.waiting += dt;
      if (this.waiting >= this.stageHint) {
        this.stageHint += 2;
        for (const g of this.pieces) if (g.kind === 'door' && g.open && g.sides.includes(waitZone))
          fxRing(g.g.position.clone().setY(0.09), GOOD, 3.6, { bright: 2.8, width: 0.12, life: 1.2 });
      }
    } else { this.waiting = 0; this.stageHint = 20; }
    for (const p of this.pieces) {
      if (p.t >= 0 && !p.open) {
        p.t += dt; const k = Math.min(1, p.t / (p.kind === 'barricade' ? 1.2 : 0.8));
        if (p.leaves) { const e = 1 - (1 - k) ** 3; p.leaves.forEach((lv, i) => { lv.rotation.y = (i ? -1 : 1) * e * 1.75; }); }
        if (p.kind === 'hollow' && p.t > 0.12) { p.g.children[0].visible = false; if (p.rubble) p.rubble.visible = true; }
        if (p.kind === 'barricade') { const bar = p.g.children[0]; bar.scale.y = Math.max(0.05, 1 - k); if (p.t % 0.25 < dt) fxEmbers(bar.getWorldPosition(V3()).setY(0.5), 0xff7a2a, 4, { r: 0.9, up: 1.2, life: 0.8 }); if (k >= 1) bar.visible = false; }
        if (k >= 1 || (p.kind === 'hollow' && p.t > 0.15)) { p.open = true; this.grid.set(p.rect, FLOOR); ev.push({ k: 'opened', kind: p.kind, rect: p.rect }); }
      }
      // the hints: a hollow wall breathes rings when she is near; a barricade (wind behind it) too
      if (!p.open && p.t < 0 && (p.kind === 'hollow' || p.kind === 'barricade')) {
        const [nx, nz] = nearest(p.rect, hero.x, hero.z), d = Math.hypot(nx - hero.x, nz - hero.z);
        p.hintT -= dt; if (d < 6.5 && p.hintT <= 0) { p.hintT = p.kind === 'hollow' ? 1.8 : 2.4; fxRing(V3(nx, 0.05, nz), HINT, 1.2, { life: 1.1, width: 0.05 }); }
      }
    }
    for (const d of this.drops) {
      if (d.t >= 0 && !d.down) {
        d.t += dt; const k = Math.min(1, d.t / 0.42);
        d.pivot.rotation.x = 1.3 * (1 - k * k);
        if (k >= 1) {
          d.down = true; d.pivot.rotation.x = 0; this.grid.set(d.rect, FLOOR); cue('bridgeDrop', 1); shake(0.35);
          const c = V3((d.rect.x0 + d.rect.x1) / 2, 0.2, (d.rect.z0 + d.rect.z1) / 2); fxSmoke(c, 0x8a8a94, 12, { r: 1.4, spd: 1.2, up: 0.5, s: 0.45, life: 0.8 });
          ev.push({ k: 'bridge', rect: d.rect });
        }
      } else if (!d.down) {
        // the rope hums: a ring at the post now and then when she is near
        d.hintT -= dt; if (d.hintT <= 0 && Math.hypot(d.post[0] - hero.x, d.post[1] - hero.z) < 8) { d.hintT = 2.2; fxRing(V3(d.post[0], 0.05, d.post[1]), HINT, 1.1, { life: 1.0, width: 0.05 }); }
      }
    }
    // the bells: once the room is calm and she is on their part of the floor, they ring their order (again after a wrong try)
    if (this.bells.length) {
      const bz = this.zoneAt(this.bells[0].x, this.bells[0].z), here = this.zoneAt(hero.x, hero.z) === bz || this.bells.some(b => Math.hypot(b.x - hero.x, b.z - hero.z) < 5);
      this.bellsCalm = calm && here ? this.bellsCalm + dt : 0;
      if (!this.seqDone && this.seqT < 0 && this.bellsCalm > 0.8) this.playOrder();
      if (this.seqDone && this.got === 0 && this.replayT > 0) { this.replayT -= dt; if (this.replayT <= 0) this.playOrder(); }
      if (this.seqT >= 0) {
        const was = this.seqT; this.seqT += dt;
        for (let i = 0; i < this.order.length; i++) { const at = 0.2 + i * 0.95; if (was < at && this.seqT >= at) { const b = this.bells[this.order[i]]; b.swing = 1; cue('bell', 0.9, b.note); fxRing(V3(b.x, 0.06, b.z), GOOD, 3.0, { life: 1.2 }); } }
        if (this.seqT > 0.2 + this.order.length * 0.95) { this.seqT = -1; this.seqDone = true; }
      }
      for (const b of this.bells) { b.swing = Math.max(0, b.swing - dt * 0.9); b.bell.rotation.x = Math.sin(this.t * 9) * 0.35 * b.swing; }
    }
    this.rewards.forEach((r, i) => {
      if (r.taken) return;
      r.t -= dt; if (r.t <= 0) { r.t = 3; fxRing(V3(r.x, 0.05, r.z), GOOD, 1.0, { life: 1.0, width: 0.05 }); }
      if (Math.hypot(r.x - hero.x, r.z - hero.z) < 0.9) { r.taken = true; r.g.visible = false; fxFlare(V3(r.x, 0.6, r.z), GOOD, 1.8, 0.5); cue('coin', 1); ev.push({ k: 'reward', i, x: r.x, z: r.z }); }
    });
    return ev;
  }
  dispose() {
    const geometry = new Set<THREE.BufferGeometry>();
    this.root.traverse(obj => { if (obj instanceof THREE.Mesh) geometry.add(obj.geometry); });
    for (const g of geometry) g.dispose();
    for (const liquid of this.copper) liquid.mesh.material.dispose();
    for (const w of this.wheels) {
      (w.rim.material as THREE.Material).dispose();
      for (const { water } of w.paths) water.material.dispose();
    }
    for (const d of this.drops) (d.rope.material as THREE.Material).dispose();
    this.root.parent?.remove(this.root);
  }
}
