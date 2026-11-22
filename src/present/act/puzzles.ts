import { finishBuild } from '../engine/buildSteps';
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
import { setPropOcc } from '../look/occlude';
import { CELL } from '../bestiary/kit';
import { V3 } from '../engine/world';
import { PALPHA, TILE } from '../engine/particles';
import { fxSmoke, fxRing, fxChips, fxEmbers, fxFlare } from '../fx/fx';
import { shake, after } from '../engine/clock';
import { cue } from '../../audio/cues';
import { M } from '../scenes/props';
import { FloorGrid, FLOOR, OUT, type ShapePlan } from '../asm/roomShape';
import { wallPiece, WALL, wallHOf, type WallStyle } from '../asm/arena';
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
const BOMB_COL = 0xff9a3c;
const PLATE_COL = 0x72e6c8;
const MYTHIC_COL = 0xff6e30;
/** flat glowing diamond used for causal sound-wave pulses racing from trigger → target */
const PULSE_GEO = (() => {
  const g = new THREE.BufferGeometry(), s = 0.24;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -s, s, 0, 0, 0, 0, s, -s, 0, 0]), 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
})();
const PIP_GEO = new THREE.BoxGeometry(0.16, 0.16, 0.16);
/** Tapered crossed-plane helper: wider glowing base smoothly narrowing to a razor-slender tip (zero blunt bar!) */
function taperedCross(bw: number, tw: number) {
  const mk = (rotY: number) => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array([-bw, 0, 0, bw, 0, 0, tw, 1, 0, -tw, 1, 0]);
    const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    if (rotY) g.rotateY(rotY);
    return g;
  };
  const a = mk(0), b = mk(Math.PI / 2);
  const g = mergeGeometries([a, b]); a.dispose(); b.dispose();
  return g;
}
/** Inner razor-slender tapered loot needle (0.24m wide at chest lid → 0.028m needle-fine tip!) */
const BEAM_GEO = taperedCross(0.12, 0.014);
/** Soft short base-bloom skirt hugging only the lower 45% around the chest lid */
const BEAM_HALO_GEO = taperedCross(0.34, 0.04);
/** Procedural DataTexture: crisp white-hot core + rich tinted rim + smooth vertical fade to alpha=0 (reads cleanly in both daylight & night!) */
const BEAM_TEX = (() => {
  const W = 32, H = 128, data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1); // 0 = bottom, 1 = top
    const vIn = Math.min(1, v / 0.06);
    // Hold luminous visibility cleanly through lower half, then feather smoothly to 0 before the tip
    const vOut = Math.pow(Math.max(0, 1 - v), 1.65);
    const vFade = vIn * vOut;
    for (let x = 0; x < W; x++) {
      const hx = Math.abs(x / (W - 1) - 0.5) * 2; // 0 = center filament, 1 = edge
      const core = Math.pow(Math.max(0, 1 - hx * 1.45), 1.6);
      const rim = Math.pow(Math.max(0, 1 - hx), 2.0) * 0.72;
      const a = Math.min(1, (core * 0.95 + rim) * vFade);
      const idx = (y * W + x) * 4;
      // White-hot center blends into rich saturated material tint at edges so it pops against bright daytime walls too
      data[idx] = 255;
      data[idx + 1] = Math.round(215 + 40 * core);
      data[idx + 2] = Math.round(145 + 110 * core);
      data[idx + 3] = Math.round(a * 255);
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
})();
/** delicate miniature spinning treasure star-glint inside the slender beam core */
const GEM_GEO = new THREE.OctahedronGeometry(0.10, 0);
export type RewardTier = 'gold' | 'mythic';
interface Cue { m: THREE.Mesh; wave: THREE.Mesh; x: number; z: number; hx: number; hz: number; reach: number; k: number; ready: boolean; flash: number; ph: number; on: () => boolean }
interface Trail { meshes: THREE.Mesh[]; x0: number; z0: number; x1: number; z1: number; t: number; dur: number }
const BUBBLE = new THREE.Color(0xb8d8e0);
// (shadows as VoxWorld.build sets them: a big build hands its shadow to invisible tiles — act-55 微信帧率)
const mesh = (vw: VoxWorld) => { const g = new THREE.Group(); for (const m of vw.build({ rim: 0.3, edge: 0.16, ground: false })) g.add(m); return g; };

type PieceKind = 'door' | 'gate' | 'hollow' | 'barricade';
interface Piece {
  kind: PieceKind; rect: Rect; open: boolean;
  /** true once grid.set(rect, FLOOR) has cleared collision (unlocked early while visual swing finishes so open doors never feel like airwalls) */
  passable?: boolean;
  /** the way through runs along z (the piece spans x) or along x */
  run: 'x' | 'z';
  /** the floor's pieces on either end of the way through (zone labels at the start) */
  sides: [number, number];
  g: THREE.Group; t: number; hits: number; hintT: number;
  /** a door's two leaves (pivots at the posts) */ leaves?: THREE.Group[];
  /** the heap a hollow wall falls to */ rubble?: THREE.Group;
  /** luminous crack seam on a hollow wall that widens with each hit */ seam?: THREE.Mesh;
}
interface Drop { rect: Rect; post: [number, number]; pivot: THREE.Group; rope: THREE.Mesh; axis: 'x' | 'z'; sign: number; t: number; down: boolean; passable?: boolean; hintT: number }
interface Bell { x: number; z: number; g: THREE.Group; bell: THREE.Group; note: number; swing: number; halo: THREE.Mesh }
interface Reward { x: number; z: number; g: THREE.Group; beam: THREE.Mesh; xrayBeam: THREE.Mesh; halo: THREE.Mesh; gem: THREE.Mesh; tier: RewardTier; taken: boolean; t: number }
interface Plate { x: number; z: number; slab: THREE.Group; seal: THREE.Mesh; timer: THREE.Mesh; gate: Piece; down: boolean; grace: number; hint: number }
interface Causeway { rect: Rect; water: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>; deck: THREE.Group; passable?: boolean }
interface Wheel { x: number; z: number; rim: THREE.Mesh; pips: THREE.Mesh[]; paths: Causeway[]; blows: number[]; drain: number; bubbles: number; hint: number }
type Body = { pos: THREE.Vector3; r: number };
interface PuzzleFrame { foes?: readonly Body[]; heroRadius?: number; heroHeight?: number; waitZone?: number }
export type PieceEvent = { k: 'reward'; i: number; x: number; z: number; tier: RewardTier } | { k: 'opened'; kind: PieceKind; rect: Rect } | { k: 'bridge'; rect: Rect };

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
  private trails: Trail[] = [];
  private spawnTrail(x0: number, z0: number, x1: number, z1: number, col = GOOD) {
    const meshes: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(PULSE_GEO, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      m.position.set(x0, 0.075, z0); m.renderOrder = 4; this.root.add(m); meshes.push(m);
    }
    const dist = Math.hypot(x1 - x0, z1 - z0);
    this.trails.push({ meshes, x0, z0, x1, z1, t: 0, dur: Math.max(0.35, Math.min(0.75, dist * 0.06)) });
  }
  private updateTrails(dt: number) {
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i]; tr.t += dt;
      if (tr.t >= tr.dur + 0.28) {
        for (const m of tr.meshes) { (m.material as THREE.Material).dispose(); this.root.remove(m); }
        this.trails.splice(i, 1); continue;
      }
      tr.meshes.forEach((m, k) => {
        const u = (tr.t - k * 0.065) / tr.dur;
        m.visible = u >= 0 && u <= 1;
        if (!m.visible) return;
        const e = 1 - (1 - u) * (1 - u);
        m.position.set(tr.x0 + (tr.x1 - tr.x0) * e, 0.075, tr.z0 + (tr.z1 - tr.z0) * e);
        const s = (1.15 - k * 0.16) * (0.7 + 0.5 * Math.sin(u * Math.PI));
        m.scale.set(s, 1, s);
        (m.material as THREE.MeshBasicMaterial).opacity = Math.sin(u * Math.PI) * (0.95 - k * 0.16);
      });
    }
  }
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
  constructor(parent: THREE.Object3D, readonly sp: ShapePlan, readonly grid: FloorGrid, style: WallStyle, seed: number, deferred = false, private treasureRoll?: number) {
    parent.add(this.root);
    this.zone0 = grid.zones().slice();
    if (!deferred) finishBuild(this.buildSteps(style, seed));
  }
  *buildSteps(style: WallStyle, seed: number) {
    const { sp, grid } = this;
    for (const p of sp.pits) if (p.kind === 'molten') {
      yield;
      const liquid = new LiquidCopper(p, sp.bridges, seed);
      this.root.add(liquid.mesh);
      this.copper.push(liquid);
    }
    const fx = sp.fixed!;
    const zoneAt = (x: number, z: number) => { const i = grid.ix(x), j = grid.iz(z); return i < 0 || j < 0 || i >= grid.nx || j >= grid.nz ? -1 : this.zone0[j * grid.nx + i]; };
    const size = new Map<number, number>(); for (const v of this.zone0) if (v >= 0) size.set(v, (size.get(v) ?? 0) + 1);
    const closedSides = (q: Rect): { run: 'x' | 'z'; sides: [number, number] } => {
      const cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
      const zA = zoneAt(cx, q.z0 - 0.25), zB = zoneAt(cx, q.z1 + 0.25), xA = zoneAt(q.x0 - 0.25, cz), xB = zoneAt(q.x1 + 0.25, cz);
      const run: 'x' | 'z' = zA >= 0 && zB >= 0 ? 'z' : 'x';
      return { run, sides: run === 'z' ? [zA, zB] : [xA, xB] };
    };
    const sunkZones = (s: Rect): number[] => {
      const zs = new Set<number>();
      const add = (x: number, z: number) => { const v = zoneAt(x, z); if (v >= 0) zs.add(v); };
      const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      for (const x of [s.x0 + 0.25, cx, s.x1 - 0.25]) { add(x, s.z0 - 0.3); add(x, s.z1 + 0.3); }
      for (const z of [s.z0 + 0.25, cz, s.z1 - 0.25]) { add(s.x0 - 0.3, z); add(s.x1 + 0.3, z); }
      return [...zs];
    };
    // Main progression zones (entry + exits + zones linked by normal progression doors): never treated as empty secret alcoves
    const mainZones = new Set<number>();
    {
      const ez = zoneAt(sp.enter[0], sp.enter[1]); if (ez >= 0) mainZones.add(ez);
      for (const ex of fx.exits) {
        const dx = ex.side === 'left' ? 1 : ex.side === 'right' ? -1 : 0;
        const dz = ex.side === 'back' ? 1 : 0;
        for (const step of [0, 0.4, 0.8, 1.2]) {
          const v = zoneAt(ex.x + dx * step, ex.z + dz * step);
          if (v >= 0) { mainZones.add(v); break; }
        }
      }
      let grew = true;
      while (grew) {
        grew = false;
        for (const q of fx.closed) if (q.kind === 'door') {
          const { sides: [a, b] } = closedSides(q);
          if (a >= 0 && b >= 0 && (mainZones.has(a) !== mainZones.has(b))) {
            mainZones.add(a); mainZones.add(b); grew = true;
          }
        }
      }
    }
    // Roll per-visit treasure spawning & rarity FIRST so puzzle mechanisms strictly couple to live rewards:
    //  - If a secret alcove's reward did NOT spawn, DO NOT spawn its puzzle mechanism (hollow wall / barricade / gate / plates / bells / wheel / drawbridge)!
    //  - Whenever a puzzle mechanism DOES spawn, its reward is 100% present and visibly gleaming through walls!
    const allRewardZones = new Set<number>(), liveRewardZones = new Set<number>();
    let rewardIdx = 0;
    for (const m of fx.marks) if (m.kind === 'reward') {
      const rz = zoneAt(m.x, m.z);
      if (rz >= 0) allRewardZones.add(rz);
      const idx = rewardIdx++;
      if (this.treasureRoll != null) {
        const h = Math.imul((this.treasureRoll ^ (idx * 2246822519)) >>> 0, 2654435761) >>> 0;
        if (h % 100 >= 62) continue;
        const tier: RewardTier = ((h >>> 8) % 100) < 30 ? 'mythic' : 'gold';
        this.rewards.push(this.reward(m.x, m.z, tier));
      } else {
        const tier: RewardTier = (seed + idx) % 3 === 0 ? 'mythic' : 'gold';
        this.rewards.push(this.reward(m.x, m.z, tier));
      }
      if (rz >= 0) liveRewardZones.add(rz);
    }
    const deadSecretZones = new Set<number>();
    for (const z of allRewardZones) if (!liveRewardZones.has(z) && !mainZones.has(z)) deadSecretZones.add(z);

    type GateSlot = { rect: Rect; sides: [number, number]; piece: Piece | null };
    const allGates: GateSlot[] = [];
    for (const q of fx.closed) {
      yield;
      const { run, sides } = closedSides(q);
      const big = (size.get(sides[1]) ?? 0) > (size.get(sides[0]) ?? 0) ? 1 : 0;
      const deadSecret = q.kind !== 'door' && (deadSecretZones.has(sides[0]) || deadSecretZones.has(sides[1]));
      if (deadSecret) {
        // Secret room has no reward on this visit: seal cleanly as normal wall with zero puzzle props or cues
        this.buildPlainWall(q, run, big, style, seed);
        if (q.kind === 'gate') allGates.push({ rect: q, sides, piece: null });
        continue;
      }
      const p: Piece = { kind: q.kind, rect: { x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1 }, open: false, run, sides, g: new THREE.Group(), t: -1, hits: 0, hintT: 1 + (this.pieces.length * 0.7) };
      this.build(p, style, big, seed);
      this.pieces.push(p); this.root.add(p.g);
      if (q.kind === 'gate') allGates.push({ rect: q, sides, piece: p });
    }
    // the drop-bridges: each hangs from the bank by the nearest rope post (skipped if leading only to an empty secret island)
    for (const s of fx.sunk) if (s.kind === 'drop') {
      if (sunkZones(s).some(z => deadSecretZones.has(z))) continue;
      yield;
      const ropes = fx.marks.filter(m => m.kind === 'rope'); if (!ropes.length) continue;
      const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, post = ropes.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
      this.drops.push(this.dropBridge(s, [post.x, post.z]));
    }
    // Pressure plates: pair against all gates first, and skip plates whose paired gate was omitted due to no reward
    for (const m of fx.marks) {
      if (m.kind !== 'plate') continue;
      yield;
      const local = allGates.filter(g => g.sides.includes(zoneAt(m.x, m.z)));
      const distance = (g: GateSlot) => Math.hypot((g.rect.x0 + g.rect.x1) / 2 - m.x, (g.rect.z0 + g.rect.z1) / 2 - m.z);
      const slot = (local.length ? local : allGates).slice().sort((a, b) => distance(a) - distance(b))[0];
      if (!slot) throw new Error('Unpaired plate in ' + fx.id);
      if (!slot.piece) continue;
      const gate = slot.piece;
      const stone = new VoxWorld(CELL);
      stone.box(-11, 0, -11, 10, 0, 10, COL.tileD);
      stone.box(-9, 1, -9, 8, 1, 8, COL.stone);
      stone.box(-7, 1, -7, 6, 1, 6, COL.stoneD);
      stone.box(-6, 1, -6, 5, 1, 5, COL.stone);
      for (const a of [-8, 7]) for (const b of [-8, 7]) stone.box(a, 1, b, a, 1, b, COL.bronze);
      const slab = mesh(stone); slab.position.set(m.x, 0, m.z); this.root.add(slab);
      const seal = new THREE.Mesh(CUE_GEO, new THREE.MeshBasicMaterial({ color: PLATE_COL, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false }));
      seal.position.set(m.x, 0.11, m.z); seal.scale.set(0.42, 1, 0.42); seal.renderOrder = 3; this.root.add(seal);
      const timer = new THREE.Mesh(CUE_GEO, new THREE.MeshBasicMaterial({ color: GOOD, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      timer.position.set(m.x, 0.055, m.z); timer.scale.set(0.95, 1, 0.95); timer.renderOrder = 3; this.root.add(timer);
      this.plates.push({ x: m.x, z: m.z, slab, seal, timer, gate, down: false, grace: 0, hint: 2.5 });
      if (!this.plateGates.includes(gate)) this.plateGates.push(gate);
    }
    // Bronze bells: only spawn when at least one live bell-gate exists (never chime for an empty secret room!)
    const hasBellGate = this.pieces.some(p => p.kind === 'gate' && !this.plateGates.includes(p));
    const bm = hasBellGate ? fx.marks.filter(m => m.kind === 'bell') : [];
    this.order = bm.map((_, i) => i).sort((a, b) => ((a * 7 + seed) % 5) - ((b * 7 + seed) % 5) || a - b);
    for (const [i, m] of bm.entries()) { yield; this.bells.push(this.bell(m.x, m.z, this.order.indexOf(i))); }
    // Sluice wheels & flooded causeways: only spawn wheels that actually drain an active causeway
    const wheelMarks = fx.marks.filter(m => m.kind === 'wheel');
    const floodByWheel = new Map<number, Rect[]>();
    for (const s of fx.sunk) if (s.kind === 'flood') {
      if (sunkZones(s).some(z => deadSecretZones.has(z))) {
        // Keep calm water surface visually intact over the pit, with no puzzle wheel or drainable causeway
        const w = s.x1 - s.x0, d = s.z1 - s.z0;
        const calmW = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: 0x385668, emissive: 0x0b202c, transparent: true, opacity: 0.9, depthWrite: false }));
        calmW.rotation.x = -Math.PI / 2; calmW.position.set(s.x0 + w / 2, -0.2, s.z0 + d / 2); calmW.renderOrder = 2; this.root.add(calmW);
        continue;
      }
      const x = (s.x0 + s.x1) / 2, z = (s.z0 + s.z1) / 2;
      let bi = -1, bd = Infinity;
      wheelMarks.forEach((wm, wi) => { const dist = Math.hypot(wm.x - x, wm.z - z); if (dist < bd) { bd = dist; bi = wi; } });
      if (bi < 0) throw new Error('Flooded causeway without a wheel in ' + fx.id);
      const list = floodByWheel.get(bi) ?? []; list.push(s); floodByWheel.set(bi, list);
    }
    for (const [wi, paths] of floodByWheel) {
      yield;
      const wm = wheelMarks[wi];
      const w = this.wheel(wm.x, wm.z);
      for (const s of paths) w.paths.push(this.causeway(s));
      this.wheels.push(w);
    }
    // Visual oil-trail hint between a barricade and its nearest nearby oil jar (makes bomb→barricade causal link unmistakable!)
    const oils = fx.props.filter(q => q.kind === 'oil');
    for (const q of this.pieces) if (q.kind === 'barricade' && oils.length) {
      const cx = (q.rect.x0 + q.rect.x1) / 2, cz = (q.rect.z0 + q.rect.z1) / 2;
      const near = oils.slice().sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
      const dist = Math.hypot(near.x - cx, near.z - cz);
      if (dist > 0.3 && dist <= 5.2) {
        const steps = Math.max(2, Math.floor(dist / 0.55));
        for (let i = 1; i < steps; i++) {
          const u = i / steps;
          const dot = new THREE.Mesh(PULSE_GEO, new THREE.MeshBasicMaterial({ color: BOMB_COL, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }));
          dot.position.set(near.x + (cx - near.x) * u, 0.032, near.z + (cz - near.z) * u);
          dot.scale.set(0.55, 1, 0.55); dot.renderOrder = 2; this.root.add(dot);
          q.g.userData.oilDots = [...(q.g.userData.oilDots ?? []), dot];
        }
      }
    }
    // Differentiated semantic cues per puzzle verb: chop = cyan, bomb = warm amber, plate = teal-gold, bell = gold, reward = gold
    for (const q of this.pieces) if (q.kind === 'hollow' || q.kind === 'barricade') {
      const cx = (q.rect.x0 + q.rect.x1) / 2, cz = (q.rect.z0 + q.rect.z1) / 2, hx = (q.rect.x1 - q.rect.x0) / 2 + 0.15, hz = (q.rect.z1 - q.rect.z0) / 2 + 0.15;
      this.addCue(cx, cz, hx, hz, q.kind === 'hollow' ? 1.4 : 2.4, () => !q.open && q.t < 0, q.kind === 'barricade' ? BOMB_COL : CUE_COL);
    }
    for (const d of this.drops) this.addCue(d.post[0], d.post[1], 0.48, 0.48, 1.4, () => !d.down && d.t < 0, CUE_COL);
    for (const b of this.bells) this.addCue(b.x, b.z, 0.52, 0.52, 1.5, () => this.got < this.order.length, GOOD);
    for (const pl of this.plates) this.addCue(pl.x, pl.z, 0.78, 0.78, 0.05, () => !pl.down && pl.grace <= 0, PLATE_COL);
    for (const w of this.wheels) this.addCue(w.x, w.z, 0.58, 0.58, 1.5, () => w.drain < 0, CUE_COL);
    for (const r of this.rewards) this.addCue(r.x, r.z, 0.56, 0.56, 0.7, () => !r.taken, r.tier === 'mythic' ? MYTHIC_COL : GOOD);
  }

  // ------------------------------------------------------------ the models
  /** Plain uncracked wall used to cleanly seal an optional secret alcove when its reward did not spawn on this visit. */
  private buildPlainWall(r: Rect, run: 'x' | 'z', big: number, style: WallStyle, seed: number) {
    const w = run === 'z' ? r.x1 - r.x0 : r.z1 - r.z0, d = run === 'z' ? r.z1 - r.z0 : r.x1 - r.x0, half = Math.round(w / CELL / 2);
    const g = new THREE.Group();
    g.position.set((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2);
    g.rotation.y = run === 'z' ? 0 : Math.PI / 2;
    const edge = (big ? 1 : -1) * (d / 2 - WALL.thick / 2);
    const vw = new VoxWorld(CELL), T = M(WALL.thick), H = M(wallHOf(style)) - 1;
    const rr = (k: number) => ((Math.sin((seed + k) * 12.9898) * 43758.5453) % 1 + 1) % 1;
    const zLo = -Math.floor(T / 2), zHi = T - Math.floor(T / 2) - 1;
    wallPiece((x0, y0, z0, x1, y1, z1, c) => vw.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), c), style, 'x', -half - 1, half, zLo, zHi, H, rr, 3);
    const wall = mesh(vw); wall.position.z = edge; g.add(wall);
    this.root.add(g);
  }
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
      // Hollow wall with a carved dark jagged fracture & subtle inner seam glow (so sharp eyes + keen ears both spot it!)
      const vw = new VoxWorld(CELL), T = M(WALL.thick), H = M(wallHOf(style)) - 1, rr = (k: number) => ((Math.sin((seed + k) * 12.9898) * 43758.5453) % 1 + 1) % 1;
      const zLo = -Math.floor(T / 2), zHi = T - Math.floor(T / 2) - 1;
      wallPiece((x0, y0, z0, x1, y1, z1, c) => vw.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), c), style, 'x', -half - 1, half, zLo, zHi, H, rr, 3);
      // Carve a jagged dark fissure on both faces so it reads immediately as cracked masonry
      for (let y = 4; y < H - 3; y++) {
        const cx = ((y >> 2) % 2 === 0 ? -1 : 1) + (y % 5 === 0 ? 1 : 0);
        vw.set(cx, y, zHi, null); vw.set(cx, y, zLo, null);
        if (y % 4 === 0) { vw.set(cx - 1, y, zHi, COL.tileD); vw.set(cx + 1, y, zLo, COL.tileD); }
      }
      const wall = mesh(vw); wall.position.z = edge; p.g.add(wall);
      // Luminous crack seam inside the wall fissure that widens and brightens on Hit 1 & Hit 2
      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, Math.max(0.8, (H - 8) * CELL), Math.max(0.12, (T + 1) * CELL)),
        new THREE.MeshBasicMaterial({ color: CUE_COL, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false })
      );
      seam.position.set(0, (H * 0.48) * CELL, edge); seam.renderOrder = 3;
      p.seam = seam; p.g.add(seam);
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
    // the rope post: stout timber post with braided hemp coil + crimson silk knot marker for instant slash readability!
    const pv = new VoxWorld(CELL);
    pv.box(-2, 0, -2, 1, 23, 1, COL.woodD); pv.box(-3, 0, -3, 2, 2, 2, COL.stoneD);
    for (const y of [8, 11, 14, 17]) pv.box(-3, y, -3, 2, y + 1, 2, COL.rope);
    pv.box(-4, 14, -1, 3, 16, 1, COL.redL); pv.box(-3, 10, 2, -2, 14, 2, COL.red); // crimson silk slash knot!
    pv.box(-1, 24, -1, 0, 25, 0, COL.bronzeL);
    const pm = mesh(pv); pm.position.set(post[0], 0, post[1]); this.root.add(pm);
    const rope = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 1), new THREE.MeshLambertMaterial({ color: 0xb89c6a })); this.root.add(rope);
    const d: Drop = { rect: s, post, pivot, rope, axis, sign, t: -1, down: false, hintT: 2 };
    this.ropeTo(d); return d;
  }
  /** the rope from the post's top to the raised deck's far end */
  private ropeTo(d: Drop) {
    d.pivot.updateMatrixWorld(true);
    const n = Math.round((d.axis === 'z' ? d.rect.z1 - d.rect.z0 : d.rect.x1 - d.rect.x0) / CELL), tip = V3(0, 0.1, -n * CELL).applyMatrix4(d.pivot.matrixWorld), top = V3(d.post[0], 1.66, d.post[1]);
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
    for (let i = 0; i <= note; i++) bv.box(-3 + i * 2, -9, 3, -3 + i * 2, -8, 3, tree ? 0xf0c060 : COL.gold);
    const bell = mesh(bv); bell.position.y = (tree ? 29 : 30) * CELL; g.add(bell); this.root.add(g);
    // Persistent golden floor halo that stays illuminated once this bell is rung correctly in order!
    const halo = new THREE.Mesh(CUE_GEO, new THREE.MeshBasicMaterial({ color: GOOD, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    halo.position.set(x, 0.048, z); halo.scale.set(0.62, 1, 0.62); halo.renderOrder = 3; this.root.add(halo);
    return { x, z, g, bell, note, swing: 0, halo };
  }
  private wheel(x: number, z: number): Wheel {
    const timber = new VoxWorld(CELL);
    for (const a of [-8, 5]) {
      timber.box(a - 1, 0, -6, a + 3, 2, 4, COL.stoneD);
      timber.box(a, 3, -4, a + 2, 22, -1, COL.woodD);
    }
    timber.box(-9, 18, -5, 9, 22, -1, COL.wood);
    timber.box(-2, 15, -5, 2, 19, 5, COL.iron);
    const frame = mesh(timber); frame.position.set(x, 0, z); this.root.add(frame);
    const parts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.62, 0.085, 4, 12)];
    for (let i = 0; i < 4; i++) parts.push(new THREE.BoxGeometry(1.16, 0.065, 0.08).rotateZ(i * Math.PI / 4));
    parts.push(new THREE.BoxGeometry(0.18, 0.18, 0.22), new THREE.BoxGeometry(0.12, 0.12, 0.22).translate(0.55, 0, 0.12));
    const rim = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: COL.bronzeL }));
    for (const p of parts) p.dispose();
    rim.position.set(x, 1.22, z + 0.33); rim.castShadow = true; this.root.add(rim);
    // 4 charge indicator pips across the sluice lintel (light up 1→2→3→4 as player slashes the wheel!)
    const pips: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const pip = new THREE.Mesh(PIP_GEO, new THREE.MeshBasicMaterial({ color: 0x3a464e, toneMapped: false }));
      pip.position.set(x + (i - 1.5) * 0.28, 1.68, z - 0.14);
      this.root.add(pip); pips.push(pip);
    }
    return { x, z, rim, pips, paths: [], blows: [], drain: -1, bubbles: 2, hint: 1 };
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
  private reward(x: number, z: number, tier: RewardTier): Reward {
    const mythic = tier === 'mythic';
    // Unmistakable high-craft Treasure Altar + Coffer:
    //  - gold   (稀世鎏金秘匣): crimson-lacquered bronze-locked coffer + warm gold light beacon (3.6m) + floating golden diamond crest
    //  - mythic (传世赤金大秘藏): imperial full-gold jewel chest + blazing crimson-gold light beacon (4.8m) + radiant spinning ruby-gold crest
    const vw = new VoxWorld(CELL);
    vw.box(-8, 0, -6, 7, 2, 5, COL.stoneD); vw.box(-7, 3, -5, 6, 4, 4, mythic ? COL.goldD : COL.stone);
    vw.box(-6, 5, -4, 5, 11, 3, mythic ? COL.goldD : COL.redD);
    vw.box(-6, 12, -4, 5, 14, 3, mythic ? COL.gold : COL.redL);
    for (const bx of [-6, 5]) vw.box(bx, 5, -4, bx, 14, 3, mythic ? COL.red : COL.goldD);
    vw.box(-6, 11, -4, 5, 11, 3, mythic ? 0xffe484 : COL.gold, 1); // glowing treasure seam!
    vw.box(-1, 9, 4, 0, 12, 4, mythic ? 0xff7a34 : COL.gold, 1);   // radiant front clasp!
    // gleaming coin piles flanking the chest
    for (let i = 0; i < 4; i++) vw.box(7, 0 + i, -1 + (i % 2), 8, 0 + i, 0 + (i % 2), COL.gold, i === 3 ? 1 : 0);
    if (mythic) for (let i = 0; i < 4; i++) vw.box(-9, 0 + i, -1 + (i % 2), -8, 0 + i, 0 + (i % 2), COL.gold, i === 3 ? 1 : 0);
    const g = mesh(vw); g.position.set(x, 0, z); this.root.add(g);
    // act-136: occlusion-proof golden silhouette through foreground houses/walls/roofs so hidden coffers are always spotted
    setPropOcc(g, 1);
    // Slender, tapered, alpha-feathered AAA Loot Beam:
    //  1) Razor-slender inner luminous spire (0.24m base → 0.028m needle tip, NormalBlending so it pops cleanly in bright daylight & night!)
    //  2) Short soft base-bloom aura hugging only the chest lid and vanishing smoothly halfway up
    const beam = new THREE.Mesh(
      BEAM_GEO,
      new THREE.MeshBasicMaterial({
        color: mythic ? 0xff7c2e : 0xffcb48,
        map: BEAM_TEX,
        transparent: true, opacity: mythic ? 0.96 : 0.9,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      }),
    );
    beam.position.set(x, 0.42, z);
    beam.scale.set(mythic ? 1.15 : 0.95, mythic ? 3.5 : 2.75, mythic ? 1.15 : 0.95);
    beam.renderOrder = 4; this.root.add(beam);
    // Through-wall GreaterDepth beacon spire: gleams softly whenever a closed puzzle wall/gate/roof hides the chest
    const xrayBeam = new THREE.Mesh(
      BEAM_GEO,
      new THREE.MeshBasicMaterial({
        color: mythic ? 0xff8a3c : 0xffd664,
        map: BEAM_TEX,
        transparent: true, opacity: mythic ? 0.54 : 0.46,
        side: THREE.DoubleSide, depthTest: true, depthFunc: THREE.GreaterDepth, depthWrite: false, toneMapped: false,
      }),
    );
    xrayBeam.position.set(x, 0.42, z);
    xrayBeam.scale.set(mythic ? 1.15 : 0.95, mythic ? 3.5 : 2.75, mythic ? 1.15 : 0.95);
    xrayBeam.renderOrder = 26; this.root.add(xrayBeam);
    const halo = new THREE.Mesh(
      BEAM_HALO_GEO,
      new THREE.MeshBasicMaterial({
        color: mythic ? MYTHIC_COL : GOOD,
        map: BEAM_TEX,
        transparent: true, opacity: mythic ? 0.52 : 0.42,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      }),
    );
    halo.position.set(x, 0.36, z);
    halo.scale.set(mythic ? 1.15 : 0.95, mythic ? 1.7 : 1.3, mythic ? 1.15 : 0.95);
    halo.renderOrder = 3; this.root.add(halo);
    // Delicate miniature spinning star-glint tucked right inside the slender luminous core
    const gem = new THREE.Mesh(
      GEM_GEO,
      new THREE.MeshBasicMaterial({ color: mythic ? 0xffd288 : 0xfff6c2, transparent: true, opacity: 0.95, toneMapped: false }),
    );
    gem.position.set(x, mythic ? 1.32 : 1.18, z);
    gem.scale.setScalar(mythic ? 1.1 : 0.88);
    gem.renderOrder = 5; this.root.add(gem);
    return { x, z, g, beam, xrayBeam, halo, gem, tier, taken: false, t: 0 };
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
      if (p.seam) {
        p.seam.scale.x = 1 + p.hits * 0.85;
        (p.seam.material as THREE.MeshBasicMaterial).color.setHex(p.hits >= 2 ? GOOD : CUE_COL);
        (p.seam.material as THREE.MeshBasicMaterial).opacity = 0.65 + p.hits * 0.15;
      }
      const at = V3(nx, 0.7, nz); fxChips(at, [COL.stone, COL.stoneD], 6 + p.hits * 3, { speed: 2 + p.hits * 0.6 }); fxRing(V3(nx, 0.06, nz), p.hits >= 2 ? GOOD : HINT, 1.6 + p.hits * 0.4, { life: 0.6 });
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
    if (p.seam) p.seam.visible = false;
    const oilDots = p.g.userData.oilDots as THREE.Mesh[] | undefined;
    if (oilDots) for (const d of oilDots) d.visible = false;
    const c = V3((p.rect.x0 + p.rect.x1) / 2, 0.3, (p.rect.z0 + p.rect.z1) / 2);
    if (p.kind === 'door' || p.kind === 'gate') { cue('doorOpen', 1); fxRing(c.clone().setY(0.06), GOOD, 3.2, { life: 0.9 }); }
    else if (p.kind === 'hollow') { cue('wallBreak', 1); shake(0.25); fxSmoke(c, 0x9a8a72, 14, { r: 1.2, spd: 1.4, up: 0.8, s: 0.5, life: 0.9 }); fxChips(c.clone().setY(0.8), [COL.stone, COL.stoneD], 18, { speed: 4 }); }
    else { cue('fire', 1); fxEmbers(c, 0xff8a3a, 16, { r: 1.2, up: 1.6, life: 1.2 }); fxFlare(c.clone().setY(0.8), 0xff8a3a, 2.2, 0.5); }
  }
  private cut(d: Drop) {
    d.t = 0; d.rope.visible = false; cue('ropeSnap', 1); fxChips(V3(d.post[0], 1.5, d.post[1]), [COL.rope, COL.ropeD], 8, { speed: 3 });
    this.spawnTrail(d.post[0], d.post[1], (d.rect.x0 + d.rect.x1) / 2, (d.rect.z0 + d.rect.z1) / 2, CUE_COL);
  }
  private ring(b: Bell) {
    b.swing = 1; cue('bell', 1, b.note); fxRing(V3(b.x, 0.06, b.z), GOOD, 2.6, { life: 0.9 });
    if (!this.seqDone || this.got >= this.order.length) return;
    const want = this.bells[this.order[this.got]];
    if (b === want) {
      this.got++;
      if (this.got >= this.order.length) {
        for (const p of this.pieces) if (p.kind === 'gate' && !this.plateGates.includes(p)) {
          this.spawnTrail(b.x, b.z, p.g.position.x, p.g.position.z, GOOD);
        }
        this.openBellGates();
      }
    }
    else { this.got = 0; this.replayT = 1.6; after(0.38, () => { cue('bellWrong', 1); for (const q of this.bells) { q.swing = 1.4; fxRing(V3(q.x, 0.06, q.z), 0xff9a7a, 2.0, { life: 0.5 }); } }); }
  }
  /** play the order: each bell in turn rings and rings out its sound */
  private playOrder() { this.seqT = 0; this.got = 0; }
  private openBellGates() {
    for (const p of this.pieces) if (p.kind === 'gate' && !this.plateGates.includes(p)) this.openPiece(p);
  }
  private drain(w: Wheel) {
    w.drain = 0; w.bubbles = 0; cue('doorOpen', 0.7); cue('splash', 0.65);
    for (const { rect } of w.paths) this.spawnTrail(w.x, w.z, (rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2, CUE_COL);
  }
  private updateWheel(w: Wheel, hero: THREE.Vector3, dt: number) {
    // Update the 4 sluice charge pips on the lintel (always crisp visual feedback!)
    const activeBlows = w.drain >= 0 ? 4 : w.blows.filter(t => this.t - t <= 3).length;
    w.pips.forEach((pip, i) => {
      const lit = i < activeBlows;
      (pip.material as THREE.MeshBasicMaterial).color.setHex(w.drain >= 0 ? GOOD : lit ? CUE_COL : 0x364048);
      pip.scale.setScalar(lit ? 1.18 : 0.85);
    });
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
    for (const path of w.paths) {
      const { water, deck, rect } = path;
      const k = Math.max(0, w.drain / 1.5);
      water.position.y = -0.2 - 0.32 * k; water.material.opacity = 0.9 * (1 - k);
      deck.position.y = -0.42 * (1 - k);
      if (w.bubbles <= 0) {
        for (const a of [-0.22, 0, 0.22]) PALPHA.emit({
          p: V3(water.position.x + a, water.position.y + 0.02, water.position.z + a * 0.5),
          v: V3(0, 0.45 + a, 0), tile: TILE.ring, c0: BUBBLE, s0: 0.08, s1: 0.17, life: 0.85,
        });
      }
      if (k === 1) { water.visible = false; if (!path.passable) { path.passable = true; this.grid.set(rect, FLOOR); } }
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
        this.spawnTrail(p.x, p.z, p.gate.g.position.x, p.gate.g.position.z, GOOD);
      }
      p.down = down; p.slab.position.y = down ? -CELL * 0.85 : 0;
      // Glowing rune seal on slab + shrinking golden countdown frame while grace ticks down!
      const sealMat = p.seal.material as THREE.MeshBasicMaterial;
      sealMat.color.setHex(down || p.grace > 0 ? GOOD : PLATE_COL);
      sealMat.opacity = down ? 0.96 : p.grace > 0 ? 0.82 : 0.52 + 0.18 * Math.sin(this.t * 3);
      p.seal.position.y = p.slab.position.y + 0.11;
      const showTimer = !down && p.grace > 0;
      p.timer.visible = showTimer;
      if (showTimer) {
        const frac = Math.max(0.18, p.grace / 5);
        p.timer.scale.set(0.98 * frac, 1, 0.98 * frac);
        const urgent = p.grace < 1.5 ? (0.45 + 0.55 * Math.abs(Math.sin(this.t * 14))) : 0.85;
        (p.timer.material as THREE.MeshBasicMaterial).color.setHex(p.grace < 1.5 ? BOMB_COL : GOOD);
        (p.timer.material as THREE.MeshBasicMaterial).opacity = urgent;
      }
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
        g.open = false; g.passable = false; g.t = -1; this.grid.set(g.rect, OUT);
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
    this.updateTrails(dt);
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
        // Clear collision as soon as the passage looks visually open (doors >85% swung, barricade burned low) so players never hit an invisible wall!
        const readyPass = (p.kind === 'hollow' && p.t > 0.15) || (p.kind === 'barricade' ? k >= 0.65 : k >= 0.45);
        if (readyPass && !p.passable) { p.passable = true; this.grid.set(p.rect, FLOOR); }
        if (k >= 1 || (p.kind === 'hollow' && p.t > 0.15)) { p.open = true; if (!p.passable) { p.passable = true; this.grid.set(p.rect, FLOOR); } ev.push({ k: 'opened', kind: p.kind, rect: p.rect }); }
      }
      // Subtle luminous crack pulse on hollow wall so players spot the fissure even from across the courtyard
      if (!p.open && p.t < 0 && p.seam) {
        const base = 0.34 + p.hits * 0.22;
        (p.seam.material as THREE.MeshBasicMaterial).opacity = Math.min(0.95, base + 0.14 * Math.sin(this.t * (2.6 + p.hits * 2)));
      }
      // the hints: a hollow wall breathes rings when she is near; a barricade (wind behind it) too
      if (!p.open && p.t < 0 && (p.kind === 'hollow' || p.kind === 'barricade')) {
        const [nx, nz] = nearest(p.rect, hero.x, hero.z), d = Math.hypot(nx - hero.x, nz - hero.z);
        p.hintT -= dt; if (d < 6.5 && p.hintT <= 0) { p.hintT = p.kind === 'hollow' ? 1.8 : 2.4; fxRing(V3(nx, 0.05, nz), p.kind === 'barricade' ? BOMB_COL : HINT, 1.2, { life: 1.1, width: 0.05 }); }
      }
    }
    for (const d of this.drops) {
      if (d.t >= 0 && !d.down) {
        d.t += dt; const k = Math.min(1, d.t / 0.42);
        d.pivot.rotation.x = 1.3 * (1 - k * k);
        if (k >= 0.85 && !d.passable) { d.passable = true; this.grid.set(d.rect, FLOOR); }
        if (k >= 1) {
          d.down = true; d.pivot.rotation.x = 0; if (!d.passable) { d.passable = true; this.grid.set(d.rect, FLOOR); } cue('bridgeDrop', 1); shake(0.35);
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
      this.bells.forEach((b, idx) => {
        b.swing = Math.max(0, b.swing - dt * 0.9); b.bell.rotation.x = Math.sin(this.t * 9) * 0.35 * b.swing;
        const posInOrder = this.order.indexOf(idx);
        const solved = posInOrder >= 0 && posInOrder < this.got;
        const haloAlpha = solved ? 0.82 + 0.14 * Math.sin(this.t * 4) : b.swing > 0.1 ? b.swing * 0.85 : 0;
        b.halo.visible = haloAlpha > 0.02;
        if (b.halo.visible) {
          (b.halo.material as THREE.MeshBasicMaterial).opacity = haloAlpha;
          const sc = solved ? 0.68 : 0.62 + b.swing * 0.35;
          b.halo.scale.set(sc, 1, sc);
        }
      });
    }
    this.rewards.forEach((r, i) => {
      if (r.taken) return;
      const mythic = r.tier === 'mythic';
      // Gently breathe the slender tapered light spire & base aura + float the delicate star-glint + slow rising motes
      const pulse = 0.5 + 0.5 * Math.sin(this.t * (mythic ? 3.4 : 2.4) + i * 1.3);
      (r.beam.material as THREE.MeshBasicMaterial).opacity = (mythic ? 0.84 : 0.76) + pulse * 0.14;
      (r.xrayBeam.material as THREE.MeshBasicMaterial).opacity = (mythic ? 0.44 : 0.36) + pulse * 0.14;
      (r.halo.material as THREE.MeshBasicMaterial).opacity = (mythic ? 0.38 : 0.30) + pulse * 0.16;
      r.beam.rotation.y = this.t * (mythic ? 0.5 : 0.32);
      r.xrayBeam.rotation.y = r.beam.rotation.y;
      r.halo.rotation.y = -this.t * (mythic ? 0.35 : 0.22);
      r.gem.position.y = (mythic ? 1.32 : 1.18) + Math.sin(this.t * 3.0 + i) * 0.09;
      r.gem.rotation.y = this.t * (mythic ? 2.4 : 1.6);
      r.t -= dt;
      if (r.t <= 0) {
        r.t = mythic ? 1.6 : 2.2;
        fxRing(V3(r.x, 0.05, r.z), mythic ? MYTHIC_COL : GOOD, mythic ? 1.35 : 1.0, { life: 0.95, width: 0.05 });
        PALPHA.emit({ p: V3(r.x + (Math.random() - 0.5) * 0.24, 0.75, r.z + (Math.random() - 0.5) * 0.24), v: V3(0, 0.65, 0), tile: TILE.ring, c0: new THREE.Color(mythic ? 0xffb25a : 0xffe484), s0: 0.08, s1: 0.02, life: 1.4 });
      }
      if (Math.hypot(r.x - hero.x, r.z - hero.z) < 0.95) {
        r.taken = true; setPropOcc(r.g, 0); r.g.visible = r.beam.visible = r.xrayBeam.visible = r.halo.visible = r.gem.visible = false;
        fxFlare(V3(r.x, 0.7, r.z), mythic ? MYTHIC_COL : GOOD, mythic ? 2.8 : 2.0, 0.65);
        fxEmbers(V3(r.x, 0.6, r.z), mythic ? MYTHIC_COL : GOOD, mythic ? 22 : 12, { r: 1.1, up: 2.2, life: 1.0 });
        fxRing(V3(r.x, 0.08, r.z), mythic ? MYTHIC_COL : GOOD, mythic ? 3.4 : 2.4, { life: 0.85, width: 0.09 });
        cue('coin', 1);
        ev.push({ k: 'reward', i, x: r.x, z: r.z, tier: r.tier });
      }
    });
    return ev;
  }
  dispose() {
    const shared = new Set<THREE.BufferGeometry>([CUE_GEO, PULSE_GEO, PIP_GEO, BEAM_GEO, BEAM_HALO_GEO, GEM_GEO]);
    const geometry = new Set<THREE.BufferGeometry>();
    this.root.traverse(obj => { if (obj instanceof THREE.Mesh && !shared.has(obj.geometry)) geometry.add(obj.geometry); });
    for (const g of geometry) g.dispose();
    for (const liquid of this.copper) liquid.mesh.material.dispose();
    for (const w of this.wheels) {
      (w.rim.material as THREE.Material).dispose();
      for (const pip of w.pips) (pip.material as THREE.Material).dispose();
      for (const { water } of w.paths) water.material.dispose();
    }
    for (const p of this.plates) { (p.seal.material as THREE.Material).dispose(); (p.timer.material as THREE.Material).dispose(); }
    for (const b of this.bells) (b.halo.material as THREE.Material).dispose();
    for (const r of this.rewards) { (r.beam.material as THREE.Material).dispose(); (r.xrayBeam.material as THREE.Material).dispose(); (r.halo.material as THREE.Material).dispose(); (r.gem.material as THREE.Material).dispose(); }
    for (const c of this.cues) { (c.m.material as THREE.Material).dispose(); (c.wave.material as THREE.Material).dispose(); }
    for (const tr of this.trails) for (const m of tr.meshes) (m.material as THREE.Material).dispose();
    for (const q of this.pieces) {
      if (q.seam) (q.seam.material as THREE.Material).dispose();
      const dots = q.g.userData.oilDots as THREE.Mesh[] | undefined;
      if (dots) for (const d of dots) (d.material as THREE.Material).dispose();
    }
    for (const d of this.drops) (d.rope.material as THREE.Material).dispose();
    this.root.parent?.remove(this.root);
  }
}
