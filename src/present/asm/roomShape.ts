// 屋子的形状（11-18，用户：「现在的单一战斗场景也比较雷同和单一，都是个方形，我希望像哈迪斯一样，场景再大些，形态多样一些」；问后定第三批
// 「场景形态」带「打出界」）。一间屋 = 一个外框（PLAY，按形状把旧场地拉大，最大约 30 × 40 米）里：哪些是能走的地（地面、桥），哪些是
// 不能走的实地（被院墙围住的废屋、麦地，由地点的 infill 建），哪些是出界坑（水塘、河、深沟：主角走不进去，敌人被打进去就掉下去死）。
// 形状是纯数据（按种子确定）：拼场景时照它砌墙、挖坑、搭桥（asm/shapeBuild.ts），战斗时照它建格子图（FloorGrid：挡人、寻路、判掉坑）。
//
// 新地点怎么接（docs/DESIGN.md「屋子形态」一节有全文）：Locale 填 shapes（这个地点战斗房用哪几种形状）、pit（过桥 / 临水两种形状挖水还是挖沟）、
// infill（实地上建什么）。不填就一直是方院（square），和原来一样。
import { PLAY, GRID, SZ, hash } from '../scenes/props';
import type { Layout, Rect } from './types';

export type ShapeId = 'square' | 'ell' | 'cloister' | 'neck' | 'bridge' | 'pond' | 'map';
/** water / a gully; 'flood' = water over a sunken causeway (a sluice drains it — LEVEL_DESIGN 开闸) */
export type PitKind = 'water' | 'ditch' | 'flood';
/** 形状的叫法（日志 / 调试用，玩家看不到） */
export const SHAPE_CN: Record<ShapeId, string> = { square: '方院', ell: '曲尺', cloister: '回廊', neck: '窄巷', bridge: '过桥', pond: '临水', map: '定制' };
/** how much each shape stretches the old 10.6 × 12 m floor (setStage(true, k)): the floor's box is then PLAY */
export const SHAPE_K: Record<ShapeId, { x: number; z: number }> = {
  square: { x: 2, z: 2 },      // 21 × 24 m (act-19's 2x stage)
  ell: { x: 2.5, z: 2.6 },     // 26.5 × 31
  cloister: { x: 2.4, z: 2.4 }, // 25.4 × 29
  neck: { x: 2.4, z: 2.9 },    // 25.4 × 35
  bridge: { x: 2.4, z: 2.8 },  // 25.4 × 34
  pond: { x: 2.4, z: 2.5 },    // 25.4 × 30
  map: { x: 3, z: 3 },         // (a drawn room sets its own: asm/roomMaps.ts)
};

/** one room's shape: rects in metres, every edge on the floor grid (GRID = 0.49 m = 7 scene cells = a wall's thickness) */
export interface ShapePlan {
  id: ShapeId; k: { x: number; z: number };
  /** the floor's bounding box (PLAY when the plan was made) */
  box: Rect;
  /** parts of the box that are not floor: walled off, built over by the locale's infill */
  solid: Rect[];
  /** out of bounds: a body knocked in falls (the hero is held at the edge, the boss too) */
  pits: Array<Rect & { kind: PitKind }>;
  /** walkable spans across the pits */
  bridges: Rect[];
  /** where the hero walks in (m) */
  enter: [number, number];
  /** a drawn room (docs/LEVEL_DESIGN.md, asm/roomMaps.ts): every piece fixed by the map */
  fixed?: FixedPlan;
}
/** what a drawn room's map puts where (m; rects on the floor grid). The live grid starts with `closed` shut (OUT) and the drop-bridges
 *  and flooded paths as pits; the walls are built as if all of it were open (the doors, the hollow walls and the barricades are moving
 *  pieces of their own — act/puzzles.ts) */
export interface FixedPlan {
  id: string;
  /** shut at the start, open later: a zone door (D) / a puzzle's door (G) / a hollow wall (?) / a barricade (X) */
  closed: Array<Rect & { kind: 'door' | 'gate' | 'hollow' | 'barricade' }>;
  /** pits at the start that become floor: a drop-bridge (-) / a flooded causeway (w) */
  sunk: Array<Rect & { kind: 'drop' | 'flood' }>;
  /** the ways out on the box's edge (E): which side, the centre of the gap on the edge line */
  exits: Array<{ side: 'left' | 'right' | 'back'; x: number; z: number }>;
  covers: Array<{ x: number; z: number; big: boolean }>;
  props: Array<{ kind: 'small' | 'pillar' | 'oil'; x: number; z: number }>;
  /** the puzzle pieces standing on the floor (bell, rope post, sluice wheel, plate, reward) */
  marks: Array<{ kind: 'bell' | 'rope' | 'wheel' | 'plate' | 'reward'; x: number; z: number }>;
  /** where the boss stands when it comes in */
  boss?: [number, number];
  /** how many pieces of the floor are fought in turn (1 = all at once): S's piece first, then on through its doors */
  stages: number;
}

const sn = (v: number) => Math.round(v / GRID) * GRID;
const R = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0: sn(Math.min(x0, x1)), x1: sn(Math.max(x0, x1)), z0: sn(Math.min(z0, z1)), z1: sn(Math.max(z0, z1)) });
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** the layout's main road through the floor (x of its middle), if one runs across the floor's middle: a lane / a bridge lines up with it */
function roadX(l: Layout | undefined, zMid: number) {
  const p = l?.path.find(q => q.x1 - q.x0 < 4 && q.z0 < zMid && q.z1 > zMid);
  return p ? (p.x0 + p.x1) / 2 : null;
}

/** the shape on the stage set for it — call setStage(true, SHAPE_K[id]) first */
export function makeShape(id: ShapeId, seed: number, o: { layout?: Layout; pit?: PitKind } = {}): ShapePlan {
  const b: Rect = { x0: PLAY.x0, x1: PLAY.x1, z0: PLAY.z0, z1: PLAY.z1 }, W = b.x1 - b.x0, D = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2;
  const r = (k: number) => hash(seed * 13 + 5, k, 7331), s = r(1) < 0.5 ? -1 : 1;
  // every shape keeps a full-width band along the back: the enemies' line, the boss's mark, both side roads (SZ(−4.6) ± 1.1) and the
  // back road all stay on plain floor, so the exits (asm/exits.ts) work unchanged
  const back = sn(SZ(-4.6) + 2.4);
  const out: ShapePlan = { id, k: { ...SHAPE_K[id] }, box: b, solid: [], pits: [], bridges: [], enter: [sn(cx), sn(b.z1 - 2.5)] };
  switch (id) {
    case 'ell': {
      // 曲尺: a front corner walled off (a burnt compound / a standing field) — the floor turns round it
      const cw = sn(W * (0.44 + r(2) * 0.08)), cd = sn(Math.min(D * (0.4 + r(3) * 0.08), b.z1 - back - 7));
      const cut = s > 0 ? R(b.x1 - cw, b.z1 - cd, b.x1, b.z1) : R(b.x0, b.z1 - cd, b.x0 + cw, b.z1);
      out.solid.push(cut);
      out.enter = [sn(s > 0 ? (b.x0 + cut.x0) / 2 : (cut.x1 + b.x1) / 2), sn(b.z1 - 2.5)];
      break;
    }
    case 'cloister': {
      // 回廊: a block in the middle (a ruined house in its yard wall / a fenced field) — fought round
      const bw = sn(W * (0.36 + r(2) * 0.06)), bx = sn(cx + (r(3) - 0.5) * 3);
      out.solid.push(R(bx - bw / 2, back + GRID * 2, bx + bw / 2, b.z1 - 6.37));
      break;
    }
    case 'neck': {
      // 窄巷: an open court at the front, one at the back, a lane 5.4 m wide between (a street between houses / a path through the wheat)
      const lw = GRID * 11, lim = W / 2 - lw / 2 - 3.2;
      const lx = sn(clampN(roadX(o.layout, (b.z0 + b.z1) / 2) ?? cx + (r(2) - 0.5) * 2 * lim, cx - lim, cx + lim));
      const f0 = sn(b.z1 - 9.3), k1 = sn(back + 1.5), L0 = sn(lx - lw / 2), L1 = L0 + lw;
      out.solid.push(R(b.x0, k1, L0, f0), R(L1, k1, b.x1, f0));
      out.enter = [sn(cx + (lx - cx) * 0.5), sn(b.z1 - 2.5)];
      break;
    }
    case 'bridge': {
      // 过桥: a river / a gully right across, the floor on both sides, one bridge (sometimes a second, narrower one)
      const kind = o.pit ?? 'water', rw = kind === 'water' ? GRID * 7 : GRID * 6;
      const rz1 = sn(b.z1 - 11.27), rz0 = sn(rz1 - rw);
      out.pits.push({ ...R(b.x0, rz0, b.x1, rz1), kind });
      const bw = GRID * 6, lim = W / 2 - bw / 2 - 2.5;
      const bx = sn(clampN(roadX(o.layout, (rz0 + rz1) / 2) ?? cx + (r(2) - 0.5) * W * 0.4, cx - lim, cx + lim));
      out.bridges.push(R(bx - bw / 2, rz0, bx + bw / 2, rz1));
      if (r(3) < 0.5) {
        const side = bx > cx ? -1 : 1, b2 = sn(clampN(bx + side * W * 0.34, cx - lim, cx + lim)), w2 = GRID * 4;
        if (Math.abs(b2 - bx) > 6) out.bridges.push(R(b2 - w2 / 2, rz0, b2 + w2 / 2, rz1));
      }
      out.enter = [sn(bx), sn(b.z1 - 2.5)];
      break;
    }
    case 'pond': {
      const kind = o.pit ?? 'water';
      if (kind === 'water') {
        // 临水: a village pond on one side, a strip of floor behind it (they can be knocked in from either bank)
        const pw = sn(6.4 + r(2) * 1.5), pd = sn(6.9 + r(3) * 1.5), px = s > 0 ? b.x1 - 3.92 - pw : b.x0 + 3.92;
        const lo = back + 2.5, hi = Math.max(lo, b.z1 - 7 - pd), pz = sn(lo + r(4) * (hi - lo));
        out.pits.push({ ...R(px, pz, px + pw, pz + pd), kind });
      } else {
        // a gully cutting in from one side wall across half the floor, the way round it at the other side
        const gl = sn(W * (0.5 + r(2) * 0.1)), gw = GRID * 5, gz = sn((back + 1.5 + b.z1 - 6.5) / 2 + (r(4) - 0.5) * 3);
        out.pits.push({ ...R(s > 0 ? b.x1 - gl : b.x0, gz, s > 0 ? b.x1 : b.x0 + gl, gz + gw), kind });
      }
      out.enter = [sn(cx - s * W * 0.18), sn(b.z1 - 2.5)];
      break;
    }
  }
  return out;
}

/** a fight room's shape: one of the place's own (none = the square), never one of the last two again; the boss / calm rooms stay square */
export function pickShape(list: ShapeId[] | undefined, kind: 'fight' | 'boss' | 'calm', seed: number, recent: ShapeId[]): ShapeId {
  if (!list?.length || kind !== 'fight') return 'square';
  const fresh = list.filter(id => !recent.slice(-2).includes(id)), from = fresh.length ? fresh : list;
  return from[Math.floor(hash(seed * 3 + 1, 17, 911) * from.length) % from.length];
}

// ================================================================== the floor grid
export const OUT = 0, FLOOR = 1, PIT = 2;
export interface GridPush { nx: number; nz: number; depth: number; pit: boolean }
/** the floor as 0.49 m cells: OUT (walls, the walled-off parts, beyond the box), FLOOR (ground and bridges), PIT (water, gullies) */
export class FloorGrid {
  readonly x0: number; readonly z0: number; readonly nx: number; readonly nz: number;
  readonly c: Uint8Array; private wet: Uint8Array;
  constructor(readonly sp: ShapePlan, pad = 4) {
    const b = sp.box, G = GRID;
    this.x0 = b.x0 - pad * G; this.z0 = b.z0 - pad * G;
    this.nx = Math.round((b.x1 - b.x0) / G) + pad * 2; this.nz = Math.round((b.z1 - b.z0) / G) + pad * 2;
    this.c = new Uint8Array(this.nx * this.nz); this.wet = new Uint8Array(this.nx * this.nz);
    const inR = (q: Rect, x: number, z: number) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1;
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const x = this.x0 + (i + 0.5) * G, z = this.z0 + (j + 0.5) * G, k = j * this.nx + i;
      if (!inR(b, x, z)) continue;
      if (sp.fixed?.closed.some(q => inR(q, x, z))) { this.c[k] = OUT; continue; }
      if (sp.bridges.some(q => inR(q, x, z))) { this.c[k] = FLOOR; continue; }
      const p = sp.pits.find(q => inR(q, x, z));
      if (p) { this.c[k] = PIT; this.wet[k] = p.kind === 'ditch' ? 0 : 1; continue; }
      this.c[k] = sp.solid.some(q => inR(q, x, z)) ? OUT : FLOOR;
    }
  }
  /** a drawn room's piece changed (a door opened, a wall broken, a bridge dropped, the water drained): the cells under r become kind;
   *  the ways round found so far are forgotten */
  set(r: Rect, kind: number) {
    const inR = (x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) if (inR(this.cx(i), this.cz(j))) this.c[j * this.nx + i] = kind;
    this.fields.clear(); this.zl = null;
  }
  private zl: Int16Array | null = null;
  /** the floor cut into pieces by what is shut now (4-neighbour): a label per cell (−1 = not floor) — a drawn room's zones */
  zones(): Int16Array {
    if (this.zl) return this.zl;
    const z = new Int16Array(this.nx * this.nz).fill(-1), st: number[] = []; let n = 0;
    for (let k0 = 0; k0 < z.length; k0++) {
      if (this.c[k0] !== FLOOR || z[k0] >= 0) continue;
      z[k0] = n; st.push(k0);
      while (st.length) { const k = st.pop()!, a = k % this.nx, b = (k - a) / this.nx;
        for (const [u, v] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]]) { if (this.kind(u, v) !== FLOOR) continue; const q = v * this.nx + u; if (z[q] < 0) { z[q] = n; st.push(q); } } }
      n++;
    }
    return (this.zl = z);
  }
  /** the zone (piece of floor) (x, z) is in now; −1 off the floor */
  zoneAt(x: number, z: number) { const i = this.ix(x), j = this.iz(z); return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : this.zones()[j * this.nx + i]; }
  ix(x: number) { return Math.floor((x - this.x0) / GRID); }
  iz(z: number) { return Math.floor((z - this.z0) / GRID); }
  kind(i: number, j: number) { return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? OUT : this.c[j * this.nx + i]; }
  at(x: number, z: number) { return this.kind(this.ix(x), this.iz(z)); }
  /** the centre of cell (i, j) */
  cx(i: number) { return this.x0 + (i + 0.5) * GRID; }
  cz(j: number) { return this.z0 + (j + 0.5) * GRID; }
  /** what is under (x, z) if it is a pit */
  pitAt(x: number, z: number): PitKind | null {
    const i = this.ix(x), j = this.iz(z); if (this.kind(i, j) !== PIT) return null;
    return this.wet[j * this.nx + i] ? 'water' : 'ditch';
  }
  /** (x, z) and everything within pad of it is floor */
  clear(x: number, z: number, pad: number) {
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) if (this.at(x + dx * pad, z + dz * pad) !== FLOOR) return false;
    return true;
  }
  /** the nearest cell (i, j) that is open (floor, or a pit too when overPit) to cell (i0, j0), within maxR rings */
  nearestOpen(i0: number, j0: number, overPit: boolean, maxR = 12): [number, number] | null {
    const ok = (i: number, j: number) => { const k = this.kind(i, j); return k === FLOOR || (overPit && k === PIT); };
    if (ok(i0, j0)) return [i0, j0];
    for (let rr = 1; rr <= maxR; rr++) {
      let best: [number, number] | null = null, bd = 1e9;
      for (let j = j0 - rr; j <= j0 + rr; j++) for (let i = i0 - rr; i <= i0 + rr; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== rr || !ok(i, j)) continue;
        const d = (i - i0) ** 2 + (j - j0) ** 2; if (d < bd) { bd = d; best = [i, j]; }
      }
      if (best) return best;
    }
    return null;
  }
  /** the nearest point on the floor to (x, z) (itself when it is on the floor) */
  nearestFloor(x: number, z: number): [number, number] {
    if (this.at(x, z) === FLOOR) return [x, z];
    const n = this.nearestOpen(this.ix(x), this.iz(z), false, 30); return n ? [this.cx(n[0]), this.cz(n[1])] : [x, z];
  }
  /** a body circle held on the floor: the cells that are not floor (and the pits, unless overPit) push it out. p is moved; the
   *  deepest push comes back (its normal points back onto the floor — the wall slam reads it) */
  clamp(p: { x: number; z: number }, r: number, overPit = false): GridPush | null {
    const G = GRID, shut = (k: number) => k === OUT || (k === PIT && !overPit);
    let best: GridPush | null = null;
    // (far outside the floor — a summons placed off the stage, a blink — first into the box, so the nearest open cell is in reach)
    const b = this.sp.box; if (p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1) { p.x = clampN(p.x, b.x0 + r, b.x1 - r); p.z = clampN(p.z, b.z0 + r, b.z1 - r); }
    // the centre itself inside a shut cell (a blink, a spawn, a push from a crowd): onto the nearest open cell
    const i = this.ix(p.x), j = this.iz(p.z), k0 = this.kind(i, j);
    if (shut(k0)) {
      const n = this.nearestOpen(i, j, overPit, 40);
      if (n) {
        const bx0 = this.x0 + n[0] * G, bz0 = this.z0 + n[1] * G, m = Math.min(r, G / 2 - 0.01);
        const qx = clampN(p.x, bx0 + m, bx0 + G - m), qz = clampN(p.z, bz0 + m, bz0 + G - m), dx = qx - p.x, dz = qz - p.z, d = Math.hypot(dx, dz) || 1e-6;
        p.x = qx; p.z = qz; best = { nx: dx / d, nz: dz / d, depth: d, pit: k0 === PIT };
      }
    }
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      const i0 = this.ix(p.x - r), i1 = this.ix(p.x + r), j0 = this.iz(p.z - r), j1 = this.iz(p.z + r);
      for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
        const k = this.kind(ii, jj); if (!shut(k)) continue;
        const bx0 = this.x0 + ii * G, bz0 = this.z0 + jj * G;
        const qx = clampN(p.x, bx0, bx0 + G), qz = clampN(p.z, bz0, bz0 + G), dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r || d2 < 1e-12) continue;
        const d = Math.sqrt(d2), push = r - d; p.x += dx / d * push; p.z += dz / d * push; moved = true;
        if (!best || push > best.depth) best = { nx: dx / d, nz: dz / d, depth: push, pit: k === PIT };
      }
      if (!moved) break;
    }
    return best;
  }
  /** every floor cell (i, j) reachable from (x, z) over the floor (4-neighbour) — the tests check the floor is one piece */
  reach(x: number, z: number): Set<number> {
    const seen = new Set<number>(), st: number[] = []; const i = this.ix(x), j = this.iz(z);
    if (this.kind(i, j) !== FLOOR) return seen;
    seen.add(j * this.nx + i); st.push(j * this.nx + i);
    while (st.length) { const k = st.pop()!, a = k % this.nx, b = (k - a) / this.nx;
      for (const [u, v] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]]) { if (this.kind(u, v) !== FLOOR) continue; const q = v * this.nx + u; if (!seen.has(q)) { seen.add(q); st.push(q); } } }
    return seen;
  }
  /** how many floor cells there are */
  floorCount() { let n = 0; for (const v of this.c) if (v === FLOOR) n++; return n; }
  // ------------------------------------------------------------ the way round (enemies walking to the hero, the bot to a gate)
  private fields = new Map<number, Int16Array>();
  /** cells the way round keeps off (the cover and the bigger props standing on the floor: the clamp pushes bodies off them, the floor
   *  grid itself does not know them); the clamp ignores this */
  private blk: Uint8Array | null = null;
  /** mark rects (m) the way round must go round; call once the room's cover and props stand (forgets the ways found so far) */
  block(rects: Rect[]) {
    const b = this.blk ?? (this.blk = new Uint8Array(this.nx * this.nz));
    for (const q of rects) for (let j = Math.max(0, this.iz(q.z0)); j <= Math.min(this.nz - 1, this.iz(q.z1)); j++) for (let i = Math.max(0, this.ix(q.x0)); i <= Math.min(this.nx - 1, this.ix(q.x1)); i++) b[j * this.nx + i] = 1;
    this.fields.clear();
  }
  /** a cell the way round may use */
  walk(i: number, j: number) { return this.kind(i, j) === FLOOR && !(this.blk && this.blk[j * this.nx + i]); }
  private nearestWalk(i0: number, j0: number, maxR: number): [number, number] | null {
    if (this.walk(i0, j0)) return [i0, j0];
    for (let rr = 1; rr <= maxR; rr++) {
      let best: [number, number] | null = null, bd = 1e9;
      for (let j = j0 - rr; j <= j0 + rr; j++) for (let i = i0 - rr; i <= i0 + rr; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== rr || !this.walk(i, j)) continue;
        const d = (i - i0) ** 2 + (j - j0) ** 2; if (d < bd) { bd = d; best = [i, j]; }
      }
      if (best) return best;
    }
    return null;
  }
  /** steps over the floor (8-neighbour, no corner cutting, round the blocked cells) from every cell to cell (ti, tj); −1 = no way.
   *  The floor never changes during a room, so a target's field is kept (the last few) */
  field(ti: number, tj: number): Int16Array {
    const key = tj * this.nx + ti, hit = this.fields.get(key); if (hit) { this.fields.delete(key); this.fields.set(key, hit); return hit; }
    const d = new Int16Array(this.nx * this.nz).fill(-1), q = new Int32Array(this.nx * this.nz); let h = 0, t = 0;
    if (this.walk(ti, tj)) { d[key] = 0; q[t++] = key; }
    while (h < t) {
      const k = q[h++], a = k % this.nx, b = (k - a) / this.nx, dk = d[k] + 1;
      for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) {
        if (!u && !v) continue; const ia = a + u, jb = b + v;
        if (!this.walk(ia, jb) || (u && v && (!this.walk(a + u, b) || !this.walk(a, b + v)))) continue;
        const n = jb * this.nx + ia; if (d[n] >= 0) continue; d[n] = dk; q[t++] = n;
      }
    }
    this.fields.set(key, d); if (this.fields.size > 4) this.fields.delete(this.fields.keys().next().value!);
    return d;
  }
  /** a ranged foe can see / shoot from a to b: no wall or walled-off part between (water and gullies lie low, they shoot across) */
  sightOpen(ax: number, az: number, bx: number, bz: number) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), n = Math.ceil(L / 0.25);
    for (let i = 1; i < n; i++) { const t = i / n; if (this.at(ax + dx * t, az + dz * t) === OUT) return false; }
    return true;
  }
  /** the straight line a → b is walkable all the way for a body of radius r (sampled every 0.2 m, the middle and both edges; the
   *  blocked cells count as shut) */
  lineOpen(ax: number, az: number, bx: number, bz: number, r: number) {
    const ok = (x: number, z: number) => this.walk(this.ix(x), this.iz(z));
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 1e-3) return ok(ax, az);
    const n = Math.ceil(L / 0.2), px = -dz / L * r, pz = dx / L * r;
    for (let i = 1; i <= n; i++) { const t = i / n, x = ax + dx * t, z = az + dz * t;
      if (!ok(x, z) || !ok(x + px, z + pz) || !ok(x - px, z - pz)) return false; }
    return true;
  }
  /** which way to walk from (x, z) to reach (tx, tz) over the floor: null = straight at it (the line is open, or there is no way
   *  round); else a unit [dx, dz] toward the farthest point of the way round that can be seen from here */
  way(x: number, z: number, tx: number, tz: number, r: number): [number, number] | null {
    if (this.lineOpen(x, z, tx, tz, r)) return null;
    const tc = this.nearestWalk(this.ix(tx), this.iz(tz), 6); if (!tc) return null;
    const d = this.field(tc[0], tc[1]); const c = this.nearestWalk(this.ix(x), this.iz(z), 4); if (!c || d[c[1] * this.nx + c[0]] < 0) return null;
    let aim: [number, number] = [this.cx(c[0]), this.cz(c[1])], cur: [number, number] = c;
    for (let s = 0; s < 8; s++) {
      const k = d[cur[1] * this.nx + cur[0]]; if (k <= 0) break;
      let best: [number, number] | null = null, bd = k;
      for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) { const ia: number = cur[0] + u, jb: number = cur[1] + v; if (ia < 0 || jb < 0 || ia >= this.nx || jb >= this.nz) continue; const dn = d[jb * this.nx + ia]; if (dn >= 0 && dn < bd) { bd = dn; best = [ia, jb]; } }
      if (!best) break; cur = best;
      const px = this.cx(cur[0]), pz = this.cz(cur[1]);
      if (s === 0 || this.lineOpen(x, z, px, pz, r * 0.8)) aim = [px, pz]; else break;
    }
    const ax = aim[0] - x, az = aim[1] - z, l = Math.hypot(ax, az); return l > 1e-3 ? [ax / l, az / l] : null;
  }
  /** steps over the floor from (x, z) to (tx, tz); −1 = no way */
  steps(x: number, z: number, tx: number, tz: number) {
    const tc = this.nearestWalk(this.ix(tx), this.iz(tz), 6), c = this.nearestWalk(this.ix(x), this.iz(z), 6); if (!tc || !c) return -1;
    return this.field(tc[0], tc[1])[c[1] * this.nx + c[0]];
  }
}
