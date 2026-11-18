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
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import { V3 } from '../engine/world';
import { fxSmoke, fxRing, fxChips, fxEmbers, fxFlare } from '../fx/fx';
import { shake, after } from '../engine/clock';
import { cue } from '../../audio/cues';
import { M } from '../scenes/props';
import { FloorGrid, FLOOR, type ShapePlan } from '../asm/roomShape';
import { wallPiece, WALL, type WallStyle } from '../asm/arena';
import { barricade } from './gates';
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
export type PieceEvent = { k: 'reward'; i: number; x: number; z: number } | { k: 'opened'; kind: PieceKind; rect: Rect } | { k: 'bridge'; rect: Rect };

export class RoomPieces {
  root = new THREE.Group();
  pieces: Piece[] = []; drops: Drop[] = []; bells: Bell[] = []; rewards: Reward[] = [];
  /** the floor's zones with everything shut, as at the start (a door's cells are −1) */
  readonly zone0: Int16Array;
  private order: number[] = []; private got = 0; private seqT = -1; private seqDone = false; private bellsCalm = 0; private replayT = 0;
  private t = 0; private events: PieceEvent[] = [];
  constructor(parent: THREE.Object3D, readonly sp: ShapePlan, readonly grid: FloorGrid, style: WallStyle, seed: number) {
    parent.add(this.root);
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
    for (const m of fx.marks) if (m.kind === 'reward') this.rewards.push(this.reward(m.x, m.z));
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
        if (red) lv.box(s > 0 ? -2 : 1, 15, -2, s > 0 ? -1 : 2, 18, -2, COL.bronze);
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
    for (const s of [-1, 1]) { fr.box(s * 7 - 1, 0, -1, s * 7, 30, 0, COL.woodD); fr.box(s * 7 - 2, 0, -2, s * 7 + 1, 2, 1, COL.stoneD); }
    fr.box(-9, 31, -1, 8, 32, 0, COL.wood); fr.box(-10, 33, -2, 9, 33, 1, COL.tileD);
    const g = mesh(fr); g.position.set(x, 0, z);
    const bv = new VoxWorld(CELL); bv.box(-3, -12, -3, 2, -4, 2, COL.bronze); bv.box(-4, -13, -4, 3, -12, 3, COL.bronzeD); bv.box(-2, -4, -2, 1, -2, 1, COL.bronzeL); bv.box(-1, -1, -1, 0, 0, 0, COL.rope);
    for (let i = 0; i <= note; i++) bv.box(-3 + i * 2, -9, 3, -3 + i * 2, -8, 3, COL.bronzeL);   // one to three studs: which note it is
    const bell = mesh(bv); bell.position.y = 30 * CELL; g.add(bell); this.root.add(g);
    return { x, z, g, bell, note, swing: 0 };
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
    if (b === want) { this.got++; if (this.got >= this.order.length) { for (const p of this.pieces) if (p.kind === 'gate') this.openPiece(p); } }
    else { this.got = 0; this.replayT = 1.6; after(0.38, () => { cue('bellWrong', 1); for (const q of this.bells) { q.swing = 1.4; fxRing(V3(q.x, 0.06, q.z), 0xff9a7a, 2.0, { life: 0.5 }); } }); }
  }
  /** play the order: each bell in turn rings and rings out its sound */
  private playOrder() { this.seqT = 0; this.got = 0; }

  /** the doors between zone a and zone b (or out of zone a) — the stage flow opens them */
  doorsOf(zone: number) { return this.pieces.filter(p => p.kind === 'door' && !p.open && p.t < 0 && p.sides.includes(zone)); }
  /** the zone (as at the start) of (x, z); −1 off the floor or in a doorway */
  zoneAt(x: number, z: number) { const g = this.grid, i = g.ix(x), j = g.iz(z); return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : this.zone0[j * g.nx + i]; }
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
      ...this.rewards.map(r => ({ kind: 'reward', open: r.taken, at: [r.x, r.z] }))];
  }
  /** solve one (debug / the bot): i into list() */
  solve(i: number) {
    const all = this.list(), it = all[i]; if (!it || it.open) return;
    const np = this.pieces.length, nd = this.drops.length;
    if (i < np) this.openPiece(this.pieces[i]); else if (i < np + nd) this.cut(this.drops[i - np]);
    else if (it.kind === 'bells') { this.seqDone = true; this.got = this.order.length; for (const p of this.pieces) if (p.kind === 'gate') this.openPiece(p); }
  }

  /** each frame: the animations, the hints round the hero, the bells' order once their part of the floor is calm, the rewards
   *  picked up. calm = no foe alive in the room */
  update(dt: number, hero: THREE.Vector3, calm: boolean): PieceEvent[] {
    this.t += dt; const ev = this.events; this.events = [];
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
  dispose() { this.root.parent?.remove(this.root); }
}
