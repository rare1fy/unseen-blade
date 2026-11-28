// 屋子形状的体素（11-18 屋子形态）：照 ShapePlan 砌外墙（沿着能走的地的轮廓，前方镜头这边不围）、挖水塘 / 河 / 深沟、搭桥、
// 给被墙围住的实地封顶。墙用各地点原来的那套（残村夯土墙、麦田编篱、破庙砖墙，asm/arena.ts 的 wallPiece），所以和方院的墙一个样子。
// 铁律照旧：横平竖直，坑边和桥都是成块的；水是深色水面 + 两层台阶的岸，深沟是黑底 + 两层往里收的土壁——一眼看出「掉下去就完了」。
import * as THREE from 'three';
import { CELL } from '../bestiary/kit';
import { M, GRID } from '../scenes/props';
import type { Ctx } from '../scenes/stage';
import type { Rect } from './types';
import { FloorGrid, FLOOR, OUT, PIT, PLAT_H, type PitKind, type RampRect, type ShapePlan } from './roomShape';
import { wallPiece, gateFrame, southGateFrame, WALL, SOUTH_WALL_H, wallHOf, type ArenaPlan, type WallStyle } from './arena';
import { castPit } from './luoyang/molten';
import { LY, palaceWall, frame } from './luoyang/ly_kit';

/** cells per floor-grid step */
const S = Math.round(GRID / CELL);
/** the knee-high wall (cells) on the camera side of the floor: the back of a walled-off block, seen across the floor */
const LOW = 8;
type B = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null) => void;
const PAL = {
  water: 0x1c3240, waterE: 0x060c10, waterL: 0x4a6a7a, bed: 0x14181a, bank: 0x6e5c42, bankD: 0x54462f, bankL: 0x86704e, stone: 0x86827a, stoneD: 0x67635c, stoneL: 0xa09a90, stoneW: 0x4e4b46,
  pitD: 0x0e0c0a, pit1: 0x4a3c2a, pit2: 0x2a2219, pitE: 0x5a4a34, wood: 0x6e5238, woodD: 0x4a3622, woodL: 0x8e6e4c, post: 0x3e2c1e,
};

/** a wall run along the floor's outline: along axis, the border line (cells of the floor grid), the floor cells it runs along (a0..a1),
 *  which side the wall stands on (out), and whether each end turns a corner round the outside of the floor (grows by the wall's thickness
 *  there so the corner closes; an end where the floor wraps round the wall's end stays flush — it would poke into the floor) */
interface Run { along: 'x' | 'z'; line: number; a0: number; a1: number; out: 1 | -1; e0: boolean; e1: boolean; front?: boolean }
/** the floor's outline as wall runs: every floor / not-floor border, INCLUDING the camera-side (+z) front border on FLOOR cells
 *  (act-189: real physical chest-high south walls replace the old invisible airwall; PIT water/ditch cells along +z stay open) */
export function outline(g: FloorGrid): Run[] {
  const runs: Run[] = [], fl = (i: number, j: number) => g.kind(i, j) === FLOOR || g.kind(i, j) === PIT, frontJ = g.iz(g.sp.box.z1 - 0.01);
  // rows: a border between cell (i, j) and (i, j ± 1)
  for (let j = 0; j < g.nz; j++) for (const out of [-1, 1] as const) {
    const isFront = out > 0 && j >= frontJ;
    let s = -1;
    for (let i = 0; i <= g.nx; i++) {
      const cellOk = isFront ? g.kind(i, j) === FLOOR : fl(i, j);
      const edge = i < g.nx && cellOk && g.kind(i, j + out) === OUT;
      if (edge && s < 0) s = i;
      if (!edge && s >= 0) {
        const endOk = (idx: number) => isFront ? g.kind(idx, j) !== FLOOR : !fl(idx, j);
        runs.push({ along: 'x', line: out < 0 ? j : j + 1, a0: s, a1: i - 1, out, e0: endOk(s - 1), e1: endOk(i), ...(isFront ? { front: true } : {}) });
        s = -1;
      }
    }
  }
  for (let i = 0; i < g.nx; i++) for (const out of [-1, 1] as const) {
    let s = -1;
    for (let j = 0; j <= g.nz; j++) {
      const edge = j < g.nz && fl(i, j) && g.kind(i + out, j) === OUT;
      if (edge && s < 0) s = j;
      if (!edge && s >= 0) { runs.push({ along: 'z', line: out < 0 ? i : i + 1, a0: s, a1: j - 1, out, e0: !fl(i, s - 1), e1: !fl(i, j) }); s = -1; }
    }
  }
  return runs;
}

/** walls, gates, the pits, the bridges and the tops of the walled-off parts into the scene's cells (the shape's floor = ground) */
export function buildShape(c: Ctx, sp: ShapePlan, plan: ArenaPlan, seed: number) {
  const box: B = (x0, y0, z0, x1, y1, z1, col) => { c.w.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), col); };
  // (a drawn room's doors, hollow walls and barricades are moving pieces (act/puzzles.ts): the walls are built round them as if open)
  const g = new FloorGrid(sp.fixed ? { ...sp, fixed: { ...sp.fixed, closed: [] } } : sp, 4), T = M(WALL.thick), H = M(wallHOf(plan.style)) - 1, Hfront = M(SOUTH_WALL_H) - 1;
  const cX = (i: number) => M(g.x0) + i * S, cZ = (j: number) => M(g.z0) + j * S;
  const r = (k: number) => { let h = (seed * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // gates cut their gap in the run they sit on (the run's line, and only where the gap overlaps the run)
  const gaps = (run: Run) => {
    const line = run.along === 'x' ? cZ(run.line) : cX(run.line), lo = (run.along === 'x' ? cX(run.a0) : cZ(run.a0)) - T, hi = (run.along === 'x' ? cX(run.a1 + 1) : cZ(run.a1 + 1)) + T;
    return plan.gates.filter(q => q.along === run.along && Math.abs((run.along === 'x' ? M(q.z) : M(q.x)) - line) <= T + 1)
      .map(q => run.along === 'x' ? [M(q.x - q.w / 2), M(q.x + q.w / 2)] : [M(q.z - q.w / 2), M(q.z + q.w / 2)]).filter(([a, b]) => b > lo + 2 && a < hi - 2);
  };
  let salt = 10;
  let placedSouthGate = false;
  const entX = sp.enter[0], entGateW = 2.6, entHalf = Math.round(M(entGateW) / 2);
  // Build front (camera-side) chest-high runs first so full-height side walls cleanly lock over their corners
  const runs = outline(g).map(run => ({ run, low: !!run.front || (run.along === 'x' && run.out > 0) })).sort((a, b) => Number(b.low) - Number(a.low));
  for (const { run, low } of runs) {
    if (run.front && plan.openFront) continue;
    // the wall stands just outside the floor: its inner face on the border line, T cells thick outward
    const L = run.along === 'x' ? cZ(run.line) : cX(run.line), b0 = run.out < 0 ? L - T : L, b1 = b0 + T - 1;
    const a0 = (run.along === 'x' ? cX(run.a0) : cZ(run.a0)) - (run.e0 ? T : 0), a1 = (run.along === 'x' ? cX(run.a1 + 1) : cZ(run.a1 + 1)) - 1 + (run.e1 ? T : 0);
    // act-189: camera-side outer south border stands chest-high (Hfront = 1.19 m) to physically block the player without hiding combat;
    // interior & north/east/west walls stand at full height (H = 2.45 m, or low-by-nature styles).
    // Raise any wall run bordering an elevated platform (^, +1.12 m = 16 cells) so perimeter walls/rails stay chest-to-head high above the deck!
    let touchesHigh = false;
    for (let idx = run.a0; idx <= run.a1; idx++) {
      const ci = run.along === 'x' ? idx : (run.out < 0 ? run.line : run.line - 1);
      const cj = run.along === 'x' ? (run.out < 0 ? run.line : run.line - 1) : idx;
      if (g.elevAt(ci, cj) === 2) { touchesHigh = true; break; }
    }
    const h = (run.front ? Hfront : H) + (touchesHigh ? M(PLAT_H) : 0); void low; void LOW;
    const runGaps = gaps(run);
    let southGateX: number | null = null;
    if (run.front && !placedSouthGate && a1 - a0 >= entHalf * 2 + 10) {
      const wantC = M(entX);
      if (wantC >= a0 + 4 && wantC <= a1 - 4) {
        const clampedC = Math.max(a0 + entHalf + 5, Math.min(a1 - entHalf - 5, wantC));
        if (clampedC - entHalf > a0 + 3 && clampedC + entHalf < a1 - 3) {
          runGaps.push([clampedC - entHalf, clampedC + entHalf]);
          southGateX = clampedC * CELL;
          placedSouthGate = true;
        }
      }
    }
    const cuts = [a0, ...runGaps.flat().sort((p, q) => p - q), a1];
    for (let i = 0; i < cuts.length; i += 2) {
      const s0 = cuts[i] + (i ? 1 : 0), s1 = cuts[i + 1] - (i + 1 < cuts.length - 1 ? 1 : 0); if (s1 - s0 < 2) continue;
      if (run.front) {
        // Ensure solid foundation cells at y = -1 under south wall segments so coastal/flooded rooms never float
        for (let X = s0; X <= s1; X++) for (let Z = b0; Z <= b1; Z++) if (!c.w.has(X, -1, Z)) c.w.set(X, -1, Z, PAL.stoneD);
      }
      if (sp.fixed?.id === 'fallen_hall' && run.along === 'x' && run.out < 0 && Math.abs(L - M(sp.box.z0)) <= 1) {
        const brokenEnd = Math.floor((s0 + s1) / 2);
        palaceWall(frame(c.w, 0, 0), s0, s1, b0, b1, 46,
          { drops: [[s0, brokenEnd, 24]], seed, plaster: 0.95 });
      } else wallPiece(box, plan.style, run.along, s0, s1, b0, b1, h, r, salt++);
    }
    if (southGateX != null) {
      southGateFrame(box, plan.style, southGateX, b0, b1, entGateW);
    }
  }
  // (the gates sit on the walls' line: a shaped room's walls stand right on the floor's edge, no gap)
  for (const q of plan.gates) gateFrame(box, plan.style, q, T, 0);
  // The two sides of the near collapse and its sluice form one opening in the underlying earth plane.
  const flood = sp.fixed?.id === 'fallen_hall' ? sp.pits.find(p => p.kind === 'flood') : undefined;
  const opening = flood && sp.pits.filter(p => p.x0 === flood.x0 && p.x1 === flood.x1 && p.z1 >= flood.z0 && p.z0 <= flood.z1);
  if (opening && flood) c.earthHole?.(flood.x0, Math.min(...opening.map(p => p.z0)), flood.x1, Math.max(...opening.map(p => p.z1)));
  for (const p of sp.pits) {
    if (!opening?.includes(p)) c.earthHole?.(p.x0, p.z0, p.x1, p.z1);
    if (sp.fixed?.id === 'fallen_hall' && p.kind === 'ditch') collapsedFloor(c, box, p, flood);
    else pit(c, box, p, p.kind, sp.box);
  }
  for (const q of sp.bridges) {
    const k = sp.pits.find(p => p.x0 <= q.x0 && p.x1 >= q.x1 && p.z0 <= q.z0 && p.z1 >= q.z1)?.kind;
    bridge(box, q, k === 'molten' || k === 'ditch' ? k : 'water', plan.style);
  }
  for (const q of sp.stones ?? []) {
    const k = sp.pits.find(p => p.x0 <= q.x0 + 0.1 && p.x1 >= q.x1 - 0.1 && p.z0 <= q.z0 + 0.1 && p.z1 >= q.z1 - 0.1)?.kind;
    steppingStone(box, q, k === 'molten' || k === 'ditch' ? k : 'water', plan.style);
  }
  for (const q of sp.platforms ?? []) platform(box, q, sp, plan.style);
  for (const q of sp.ramps ?? []) ramp(box, q, plan.style);
}

function collapsedFloor(c: Ctx, box: B, p: Rect, channel?: Rect) {
  const x0 = M(p.x0), z0 = M(p.z0), x1 = M(p.x1) - 1, z1 = M(p.z1) - 1;
  const w = x1 - x0 + 1, d = z1 - z0 + 1, mid = Math.floor(w / 2);
  const slab = frame(c.w, p.x0, p.z0);
  const againstFar = channel && p.z0 === channel.z1, againstNear = channel && p.z1 === channel.z0;
  box(x0, -1, z0, x1, -1, z1, null);
  slab(0, -34, 0, w - 1, -34, d - 1, 0x100b08);
  for (const x of [0, w - 3]) slab(x, -33, 0, x + 2, -2, d - 1, 0x34271f);
  if (!againstFar) {
    slab(0, -33, 0, w - 1, -3, 1, 0x32251e);
    slab(2, -8, 0, mid - 7, 2, 11, 0x847969);
    slab(mid + 7, -13, 0, w - 9, -4, 7, 0x554b41);
    slab(w - 19, -19, 4, w - 7, -10, 15, 0x493c33);
  }
  if (!againstNear) {
    slab(0, -33, d - 2, w - 1, -3, d - 1, 0x292019);
    slab(mid + 6, -11, d - 10, w - 8, 1, d - 1, 0x6e6355);
    slab(0, -17, d - 15, 14, -3, d - 1, 0x594d40);
  }
  // Broken masonry at the bottom, well below the wheel's moving deck.
  slab(3, -33, 3, mid - 4, -29, Math.min(d - 4, 13), 0x281e17);
  if (againstFar) {
    // A snapped roof timber projects into the near collapse from its stone abutment.
    // Its broken end stops at the channel's bank, below the moving deck.
    const x = Math.floor(w * 0.35);
    slab(x, -6, 0, x + 6, -2, d - 1, LY.char);
    slab(x + 1, -1, 1, x + 6, -1, d - 1, 0x684b32);
    slab(x, -5, d - 8, x + 6, 0, d - 6, LY.iron);
  } else if (!againstNear) {
    const z = Math.floor(d * 0.60);
    slab(0, -10, z - 4, w - 1, -4, z + 3, LY.char);
    slab(1, -3, z - 3, w - 2, -3, z + 2, 0x684b32);
    slab(w - 16, -10, z - 4, w - 13, -3, z + 3, LY.iron);
  }
  c.ambient({ kind: 'dust', color: 0xa68b70, rate: 1.1, area: p, y: [-0.8, 0.45] });
}

/** a pit: the ground cells taken out, a bed below; water: a stone kerb round the edge going down to a dark plane 0.2 m below the floor;
 *  a gully (深沟): two earth ledges stepping in and down, black at the bottom 0.8 m down */
function pit(c: Ctx, box: B, p: Rect, kind: PitKind, room: Rect) {
  const X0 = M(p.x0), X1 = M(p.x1) - 1, Z0 = M(p.z0), Z1 = M(p.z1) - 1;
  const rim = (y0: number, y1: number, k: number, col: number) => { for (const [a0, b0, a1, b1] of [[X0 + k, Z0 + k, X1 - k, Z0 + k], [X0 + k, Z1 - k, X1 - k, Z1 - k], [X0 + k, Z0 + k, X0 + k, Z1 - k], [X1 - k, Z0 + k, X1 - k, Z1 - k]]) box(a0, y0, b0, a1, y1, b1, col); };
  box(X0, -1, Z0, X1, -1, Z1, null);
  if (kind === 'flood') {
    // Recess the bed so the water at −0.2 m is visible. The sluice's stone deck comes level with the banks as it drains.
    box(X0, -9, Z0, X1, -9, Z1, PAL.stoneD);
    rim(-8, -2, 0, PAL.stoneW);
  } else if (kind === 'molten') {
    castPit(c, p, room);
  } else if (kind === 'water') {
    // a dressed-stone kerb two cells wide at floor level (light outer course, a darker inner one), the stone wall going down inside it to
    // the water 0.56 m below the floor (the camera sees the far side's wall above the water: the drop), a near-black bed under the water
    box(X0, -13, Z0, X1, -13, Z1, PAL.bed);
    rim(-12, -2, 0, PAL.stoneW); rim(-12, -2, 1, PAL.stoneW);
    rim(-1, -1, 0, PAL.stoneL); rim(-1, -1, 1, PAL.stone);
    for (let y = -4; y >= -7; y -= 3) rim(y, y, 0, PAL.stoneD);   // the courses of the wall
    // the water: a matte dark surface (the shared c.water is glossy — the moon put a white blot the size of a man on it)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.x1 - p.x0 - 2 * CELL, p.z1 - p.z0 - 2 * CELL), new THREE.MeshLambertMaterial({ color: PAL.water, emissive: PAL.waterE, transparent: true, opacity: 0.9 }));
    m.rotation.x = -Math.PI / 2; m.position.set((p.x0 + p.x1) / 2, -0.56, (p.z0 + p.z1) / 2); m.renderOrder = 2; m.receiveShadow = true; c.add(m);
    // a pale line where the water meets the far wall (it catches the sky), the cells just at the surface
    box(X0 + 2, -8, Z0 + 2, X1 - 2, -8, Z0 + 2, PAL.waterL);
  } else {
    // 深沟 (1.4 m down): the lip, a first ledge four cells wide 0.2 m down, a second four more in 0.6 m down, a black floor; every ring
    // goes down to the floor of the gully, so no gap opens under a ledge. Dark earth that goes near-black going down (the far wall,
    // which the camera sees face-on, read as a wall standing up when it was the floor's own colour): a dark trench, not a ledge
    const BOT = -20;
    rim(-1, -1, 0, PAL.bankL);
    for (let k = 0; k < 4; k++) rim(BOT, -3, k, k === 3 ? PAL.pitE : PAL.pit1);
    for (let k = 4; k < 8; k++) rim(BOT, -9, k, PAL.pit2);
    for (let k = 8; k < 10; k++) rim(BOT, -15, k, PAL.pitD);
    box(X0 + 10, BOT, Z0 + 10, X1 - 10, BOT + 1, Z1 - 10, PAL.pitD);
  }
}

/** a bridge across a pit: a plank deck on two beams (a rail each side, posts at the ends) for the water; a stone slab bridge with a kerb
 *  for a gully; the planks run across the way */
function bridge(box: B, q: Rect, kind: 'water' | 'ditch' | 'molten', st: WallStyle) {
  const X0 = M(q.x0), X1 = M(q.x1) - 1, Z0 = M(q.z0) - 1, Z1 = M(q.z1);
  const alongZ = q.z1 - q.z0 >= q.x1 - q.x0;
  if (kind === 'molten') {
    box(X0, -6, Z0, X1, -2, Z1, 0x944a2c);
    box(X0, -2, Z0, X1, 0, Z1, LY.stoneDD);
    for (let z = Z0; z <= Z1; z += 30)
      box(X0 + 2, 0, z, X1 - 2, 0, Math.min(z + 28, Z1), LY.stone);
    for (const x of [X0, X1 - 1]) {
      box(x, 1, Z0, x + 1, 3, Z1, LY.slag);
      for (let z = Z0 + 5; z < Z1 - 2; z += 44) {
        box(x, 4, z, x + 1, 8, z + 2, LY.iron);
        box(x, 9, z, x + 1, 9, z + 2, LY.copper);
      }
    }
  } else if (kind === 'water' && st !== 'brick') {
    box(X0, -2, Z0, X1, -1, Z1, PAL.woodD);
    box(X0, 0, Z0, X1, 0, Z1, PAL.wood);
    // (the board seams run along the way: seams across it, seen from the battle camera, read as a stair)
    if (alongZ) for (let x = X0 + 4; x < X1 - 1; x += 5) box(x, 0, Z0, x, 0, Z1, PAL.woodD);
    else for (let z = Z0 + 4; z < Z1 - 1; z += 5) box(X0, 0, z, X1, 0, z, PAL.woodD);
    for (const x of alongZ ? [X0, X1] : []) { box(x, 1, Z0, x, 1, Z1, PAL.woodL); for (const z of [Z0, Z1]) box(x, 0, z, x, 8, z, PAL.post); box(x, 7, Z0, x, 7, Z1, PAL.woodL); }
    // the piles under it, at a third and two thirds
    if (alongZ) for (const z of [Math.round(Z0 + (Z1 - Z0) / 3), Math.round(Z0 + (Z1 - Z0) * 2 / 3)]) for (const x of [X0 + 1, X1 - 1]) box(x, -6, z, x, -3, z, PAL.post);
  } else {
    // a slab bridge: two long slabs side by side (the joint runs along the way — joints across it read as steps from the camera), a
    // raised kerb each side with a post at each end, the span's face going down into the gully
    box(X0, -6, Z0, X1, -1, Z1, PAL.stoneD);
    box(X0, 0, Z0, X1, 0, Z1, PAL.stone);
    const mid = Math.round((X0 + X1) / 2);
    if (alongZ) box(mid, 0, Z0, mid, 0, Z1, PAL.stoneD);
    for (const x of alongZ ? [X0, X1] : []) { box(x, 1, Z0, x, 2, Z1, PAL.stoneL); for (const z of [Z0, Z1]) box(x, 1, z, x, 5, z, PAL.stoneL); }
  }
}

/** Stepping-stone pier (跳石墩) rising cleanly from water/gully/molten pit up to y = 0: notched ashlar masonry or timber pile cap */
function steppingStone(box: B, q: Rect, kind: 'water' | 'ditch' | 'molten', st: WallStyle) {
  const cx = Math.round(M((q.x0 + q.x1) / 2)), cz = Math.round(M((q.z0 + q.z1) / 2));
  const h = 10; // 20 × 20 cells = 1.40 m × 1.40 m square pier surrounded by visible water/gully moat
  const bot = kind === 'ditch' ? -20 : -13;
  const timber = kind === 'water' && (st === 'rail' || st === 'stockade');
  if (kind === 'molten') {
    box(cx - h + 1, -10, cz - h, cx + h - 1, -3, cz + h, 0x944a2c);
    box(cx - h, -10, cz - h + 1, cx + h, -3, cz + h - 1, 0x944a2c);
    box(cx - h + 1, -2, cz - h, cx + h - 1, 0, cz + h, LY.stoneDD);
    box(cx - h, -2, cz - h + 1, cx + h, 0, cz + h - 1, LY.stoneDD);
    box(cx - h + 2, 0, cz - h + 2, cx + h - 2, 0, cz + h - 2, LY.stone);
  } else if (timber) {
    for (const dx of [-h + 2, h - 3]) for (const dz of [-h + 2, h - 3]) box(cx + dx, bot, cz + dz, cx + dx + 1, -2, cz + dz + 1, PAL.post);
    box(cx - h, -2, cz - h, cx + h - 1, -1, cz + h - 1, PAL.woodD);
    box(cx - h, 0, cz - h, cx + h - 1, 0, cz + h - 1, PAL.wood);
    for (let x = cx - h + 3; x < cx + h - 2; x += 4) box(x, 0, cz - h, x, 0, cz + h - 1, PAL.woodD);
    box(cx - h, 0, cz - h, cx + h - 1, 0, cz - h, PAL.woodL);
    box(cx - h, 0, cz + h - 1, cx + h - 1, 0, cz + h - 1, PAL.woodL);
  } else {
    box(cx - h + 1, bot, cz - h, cx + h - 1, -2, cz + h, PAL.stoneW);
    box(cx - h, bot, cz - h + 1, cx + h, -2, cz + h - 1, PAL.stoneW);
    if (kind === 'water') {
      box(cx - h, -8, cz - h + 1, cx + h, -8, cz + h - 1, PAL.waterL);
    }
    box(cx - h + 1, -1, cz - h, cx + h - 1, 0, cz + h, PAL.stoneD);
    box(cx - h, -1, cz - h + 1, cx + h, 0, cz + h - 1, PAL.stoneD);
    box(cx - h + 2, 0, cz - h + 2, cx + h - 2, 0, cz + h - 2, PAL.stone);
    box(cx - h + 2, 0, cz - h + 2, cx + h - 2, 0, cz - h + 2, PAL.stoneL);
    box(cx - 1, 0, cz - h + 3, cx, 0, cz + h - 3, PAL.stoneD);
  }
}

/** Elevated 3D voxel terrace / battlement (^, height = PLAT_H = 1.12 m = 16 cells: y = 0..15) */
function platform(box: B, q: Rect, sp: ShapePlan, st: WallStyle) {
  const X0 = M(q.x0), X1 = M(q.x1) - 1, Z0 = M(q.z0), Z1 = M(q.z1) - 1;
  const HP = M(PLAT_H) - 1; // 15 -> top deck surface at (15 + 1) * 0.07 = 1.12 m
  const timber = st === 'rail' || st === 'stockade' || st === 'wattle';
  const warm = st === 'earth' || st === 'wattle';
  const pal = st === 'palace'
    ? { base: LY.stoneDD, wall: LY.stoneD, mid: LY.stone, top: 0xb2aa9e, line: LY.stoneDD, post: LY.char }
    : timber
      ? { base: PAL.stoneD, wall: PAL.woodD, mid: PAL.wood, top: PAL.woodL, line: PAL.woodD, post: PAL.post }
      : warm
        ? { base: PAL.bankD, wall: PAL.bank, mid: PAL.stone, top: PAL.stoneL, line: PAL.stoneD, post: PAL.post }
        : { base: PAL.stoneW, wall: PAL.stoneD, mid: PAL.stone, top: PAL.stoneL, line: PAL.stoneD, post: PAL.stoneW };

  // Extend foundation piers down into adjacent pits so canal-side terraces never float above water
  const touchesPit = sp.pits.some(p => p.x0 < q.x1 + 0.15 && p.x1 > q.x0 - 0.15 && p.z0 < q.z1 + 0.15 && p.z1 > q.z0 - 0.15);
  box(X0, touchesPit ? -13 : -1, Z0, X1, 2, Z1, pal.base);
  // Main structural body (recessed 1 cell under the overhanging coping rim on free edges)
  box(X0 + 1, 3, Z0 + 1, X1 - 1, HP - 2, Z1 - 1, pal.wall);
  box(X0, 3, Z0, X1, 4, Z1, pal.base);
  // Crisp vertical pilaster / timber-crib ribs every 14 cells (~0.98 m) so cliff faces read clearly as climbable/jumpable architecture
  for (let x = X0 + 2; x <= X1 - 3; x += 14) {
    box(x, 3, Z0, x + 1, HP - 2, Z0 + 1, pal.post);
    box(x, 3, Z1 - 1, x + 1, HP - 2, Z1, pal.post);
  }
  for (let z = Z0 + 2; z <= Z1 - 3; z += 14) {
    box(X0, 3, z, X0 + 1, HP - 2, z + 1, pal.post);
    box(X1 - 1, 3, z, X1, HP - 2, z + 1, pal.post);
  }
  // Overhanging coping rim & paved deck surface (y = HP-1..HP)
  box(X0, HP - 1, Z0, X1, HP, Z1, pal.top);
  box(X0 + 2, HP, Z0 + 2, X1 - 2, HP, Z1 - 2, pal.mid);
  if (timber) {
    for (let x = X0 + 4; x < X1 - 2; x += 5) box(x, HP, Z0 + 2, x, HP, Z1 - 2, pal.line);
  } else {
    for (let x = X0 + 14; x < X1 - 4; x += 14) box(x, HP, Z0 + 2, x, HP, Z1 - 2, pal.line);
    for (let z = Z0 + 14; z < Z1 - 4; z += 14) box(X0 + 2, HP, z, X1 - 2, HP, z, pal.line);
  }
  // Subtle ankle-high corner stone/timber bollard caps (2 cells = 14 cm) where corners do not meet a ramp
  const nearRamp = (wx: number, wz: number) => !!sp.ramps?.some(r => wx > r.x0 - 0.35 && wx < r.x1 + 0.35 && wz > r.z0 - 0.35 && wz < r.z1 + 0.35);
  for (const [cx, wx] of [[X0, q.x0], [X1 - 2, q.x1]] as const) {
    for (const [cz, wz] of [[Z0, q.z0], [Z1 - 2, q.z1]] as const) {
      if (!nearRamp(wx, wz)) {
        box(cx, HP + 1, cz, cx + 2, HP + 2, cz + 2, pal.post);
        box(cx, HP + 2, cz, cx + 2, HP + 2, cz + 2, pal.top);
      }
    }
  }
}

/** Four broad architectural steps (/, 4 treads × 4 cells high = 16 cells = 1.12 m) linking ground cleanly to an elevated platform */
function ramp(box: B, q: RampRect, st: WallStyle) {
  const X0 = M(q.x0), X1 = M(q.x1) - 1, Z0 = M(q.z0), Z1 = M(q.z1) - 1;
  const HP = M(PLAT_H) - 1;
  const timber = st === 'rail' || st === 'stockade' || st === 'wattle';
  const body = timber ? PAL.woodD : st === 'palace' ? LY.stoneD : PAL.stoneD;
  const tread = timber ? PAL.wood : st === 'palace' ? LY.stone : PAL.stone;
  const nose = timber ? PAL.woodL : st === 'palace' ? 0xb2aa9e : PAL.stoneL;
  box(X0, -1, Z0, X1, -1, Z1, body);
  const alongZ = q.dir === 'n' || q.dir === 's';
  const span = alongZ ? (Z1 - Z0 + 1) : (X1 - X0 + 1);
  const steps = 4;
  for (let s = 0; s < steps; s++) {
    const topY = Math.round(((s + 1) / steps) * (HP + 1)) - 1;
    const u0 = Math.floor((s / steps) * span), u1 = Math.floor(((s + 1) / steps) * span) - 1;
    if (alongZ) {
      const a0 = q.dir === 's' ? Z0 + u0 : Z1 - u1;
      const a1 = q.dir === 's' ? Z0 + u1 : Z1 - u0;
      const lip = q.dir === 's' ? a0 : a1;
      box(X0, 0, a0, X1, Math.max(0, topY - 1), a1, body);
      box(X0 + 2, topY, a0, X1 - 2, topY, a1, tread);
      box(X0 + 2, topY, lip, X1 - 2, topY, lip, nose);
      // Low stepped side cheek-blocks framing the stairs
      box(X0, 0, a0, X0 + 1, Math.min(HP + 1, topY + 2), a1, nose);
      box(X1 - 1, 0, a0, X1, Math.min(HP + 1, topY + 2), a1, nose);
    } else {
      const a0 = q.dir === 'e' ? X0 + u0 : X1 - u1;
      const a1 = q.dir === 'e' ? X0 + u1 : X1 - u0;
      const lip = q.dir === 'e' ? a0 : a1;
      box(a0, 0, Z0, a1, Math.max(0, topY - 1), Z1, body);
      box(a0, topY, Z0 + 2, a1, topY, Z1 - 2, tread);
      box(lip, topY, Z0 + 2, lip, topY, Z1 - 2, nose);
      box(a0, 0, Z0, a1, Math.min(HP + 1, topY + 2), Z0 + 1, nose);
      box(a0, 0, Z1 - 1, a1, Math.min(HP + 1, topY + 2), Z1, nose);
    }
  }
}

/** the walled-off parts, pits, bridges, stepping stones, platforms and ramps as rects a locale's ground dressing keeps clear */
export function shapeClear(sp: ShapePlan): Rect[] {
  return [...sp.pits, ...sp.bridges, ...(sp.stones ?? []), ...(sp.platforms ?? []), ...(sp.ramps ?? [])];
}
/** where on the stage the walled-off blocks are (the locale's infill builds there) */
export const blocks = (sp: ShapePlan) => sp.solid;
void OUT;
