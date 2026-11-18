// 屋子形状的体素（11-18 屋子形态）：照 ShapePlan 砌外墙（沿着能走的地的轮廓，前方镜头这边不围）、挖水塘 / 河 / 深沟、搭桥、
// 给被墙围住的实地封顶。墙用各地点原来的那套（残村夯土墙、麦田编篱、破庙砖墙，asm/arena.ts 的 wallPiece），所以和方院的墙一个样子。
// 铁律照旧：横平竖直，坑边和桥都是成块的；水是深色水面 + 两层台阶的岸，深沟是黑底 + 两层往里收的土壁——一眼看出「掉下去就完了」。
import * as THREE from 'three';
import { CELL } from '../bestiary/kit';
import { M, GRID } from '../scenes/props';
import type { Ctx } from '../scenes/stage';
import type { Rect } from './types';
import { FloorGrid, FLOOR, OUT, PIT, type PitKind, type ShapePlan } from './roomShape';
import { wallPiece, gateFrame, WALL, type ArenaPlan, type WallStyle } from './arena';

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
interface Run { along: 'x' | 'z'; line: number; a0: number; a1: number; out: 1 | -1; e0: boolean; e1: boolean }
/** the floor's outline as wall runs: every floor / not-floor border, except the front (+z) border of the box (the camera side) and the
 *  pits' edges (a pit is not walled: you see the water / the drop) */
export function outline(g: FloorGrid): Run[] {
  const runs: Run[] = [], fl = (i: number, j: number) => g.kind(i, j) === FLOOR || g.kind(i, j) === PIT, frontJ = g.iz(g.sp.box.z1 - 0.01);
  // rows: a border between cell (i, j) and (i, j ± 1)
  for (let j = 0; j < g.nz; j++) for (const out of [-1, 1] as const) {
    let s = -1;
    for (let i = 0; i <= g.nx; i++) {
      const edge = i < g.nx && fl(i, j) && g.kind(i, j + out) === OUT && !(out > 0 && j >= frontJ);
      if (edge && s < 0) s = i;
      if (!edge && s >= 0) { runs.push({ along: 'x', line: out < 0 ? j : j + 1, a0: s, a1: i - 1, out, e0: !fl(s - 1, j), e1: !fl(i, j) }); s = -1; }
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
  const g = new FloorGrid(sp.fixed ? { ...sp, fixed: { ...sp.fixed, closed: [] } } : sp, 4), T = M(WALL.thick), H = M(WALL.h) - 1;
  const cX = (i: number) => M(g.x0) + i * S, cZ = (j: number) => M(g.z0) + j * S;
  const r = (k: number) => { let h = (seed * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // gates cut their gap in the run they sit on (the run's line, and only where the gap overlaps the run)
  const gaps = (run: Run) => {
    const line = run.along === 'x' ? cZ(run.line) : cX(run.line), lo = (run.along === 'x' ? cX(run.a0) : cZ(run.a0)) - T, hi = (run.along === 'x' ? cX(run.a1 + 1) : cZ(run.a1 + 1)) + T;
    return plan.gates.filter(q => q.along === run.along && Math.abs((run.along === 'x' ? M(q.z) : M(q.x)) - line) <= T + 1)
      .map(q => run.along === 'x' ? [M(q.x - q.w / 2), M(q.x + q.w / 2)] : [M(q.z - q.w / 2), M(q.z + q.w / 2)]).filter(([a, b]) => b > lo + 2 && a < hi - 2);
  };
  let salt = 10;
  // the knee-high runs first: where one meets a full-height wall at a corner, the full one is built over it
  const runs = outline(g).map(run => ({ run, low: run.along === 'x' && run.out > 0 })).sort((a, b) => Number(b.low) - Number(a.low));
  for (const { run, low } of runs) {
    // the wall stands just outside the floor: its inner face on the border line, T cells thick outward
    const L = run.along === 'x' ? cZ(run.line) : cX(run.line), b0 = run.out < 0 ? L - T : L, b1 = b0 + T - 1;
    const a0 = (run.along === 'x' ? cX(run.a0) : cZ(run.a0)) - (run.e0 ? T : 0), a1 = (run.along === 'x' ? cX(run.a1 + 1) : cZ(run.a1 + 1)) - 1 + (run.e1 ? T : 0);
    // a wall on the camera side of the floor (the back of a walled-off block, seen across the floor) is knee-high: a full one would
    // hide 1.7 m of the floor behind it from the battle camera (≈ 35° down)
    const h = low ? LOW : H;
    const cuts = [a0, ...gaps(run).flat().sort((p, q) => p - q), a1];
    for (let i = 0; i < cuts.length; i += 2) {
      const s0 = cuts[i] + (i ? 1 : 0), s1 = cuts[i + 1] - (i + 1 < cuts.length - 1 ? 1 : 0); if (s1 - s0 < 2) continue;
      wallPiece(box, plan.style, run.along, s0, s1, b0, b1, h, r, salt++);
    }
  }
  // (the gates sit on the walls' line: a shaped room's walls stand right on the floor's edge, no gap)
  for (const q of plan.gates) gateFrame(box, plan.style, q, T, 0);
  for (const p of sp.pits) pit(c, box, p, p.kind);
  for (const q of sp.bridges) { const k = sp.pits.find(p => p.x0 <= q.x0 && p.x1 >= q.x1 && p.z0 <= q.z0 && p.z1 >= q.z1)?.kind; bridge(box, q, k === 'ditch' || k === 'molten' ? 'ditch' : 'water', plan.style); }
}

/** a pit: the ground cells taken out, a bed below; water: a stone kerb round the edge going down to a dark plane 0.2 m below the floor;
 *  a gully (深沟): two earth ledges stepping in and down, black at the bottom 0.8 m down */
function pit(c: Ctx, box: B, p: Rect, kind: PitKind) {
  const X0 = M(p.x0), X1 = M(p.x1) - 1, Z0 = M(p.z0), Z1 = M(p.z1) - 1;
  const rim = (y0: number, y1: number, k: number, col: number) => { for (const [a0, b0, a1, b1] of [[X0 + k, Z0 + k, X1 - k, Z0 + k], [X0 + k, Z1 - k, X1 - k, Z1 - k], [X0 + k, Z0 + k, X0 + k, Z1 - k], [X1 - k, Z0 + k, X1 - k, Z1 - k]]) box(a0, y0, b0, a1, y1, b1, col); };
  box(X0, -1, Z0, X1, -1, Z1, null);
  // (the flat ground beyond the stage lies at −2 cells over everything: cut it open over the pit)
  c.earthHole?.(p.x0, p.z0, p.x1, p.z1);
  if (kind === 'flood') {
    // Recess the bed so the water at −0.2 m is visible. The sluice's stone deck comes level with the banks as it drains.
    box(X0, -9, Z0, X1, -9, Z1, PAL.stoneD);
    rim(-8, -2, 0, PAL.stoneW);
  } else if (kind === 'molten') {
    // A near-black skin at the crucible's rim, two broad rafts of cooling copper and a bright seam between them.
    rim(-7, -1, 0, 0x392b28); rim(-7, -3, 1, 0x602d20);
    c.w.box(X0 + 2, -7, Z0 + 2, X1 - 2, -7, Z1 - 2, 0xe05019, 1);
    const mx = Math.floor((X0 + X1) / 2), mz = Math.floor((Z0 + Z1) / 2);
    box(X0 + 2, -6, Z0 + 2, mx - 3, -6, Z0 + 5, 0x6c3227);
    box(mx + 5, -6, Z1 - 7, X1 - 2, -6, Z1 - 2, 0x713728);
    c.w.box(mx - 5, -7, mz, mx + 9, -7, mz + 2, 0xff9b37, 1);
    c.ambient({ kind: 'embers', color: 0xff882b, area: p, y: [-0.4, -0.1], rate: 3.5 });
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
function bridge(box: B, q: Rect, kind: 'water' | 'ditch', st: WallStyle) {
  const X0 = M(q.x0), X1 = M(q.x1) - 1, Z0 = M(q.z0) - 1, Z1 = M(q.z1);
  const alongZ = q.z1 - q.z0 >= q.x1 - q.x0;
  if (kind === 'water' && st !== 'brick') {
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

/** the walled-off parts and the pits as rects a locale's dressing keeps clear (no grass cards in the water, none over a wall top) */
export function shapeClear(sp: ShapePlan): Rect[] { return [...sp.pits, ...sp.bridges]; }
/** where on the stage the walled-off blocks are (the locale's infill builds there) */
export const blocks = (sp: ShapePlan) => sp.solid;
void OUT;
