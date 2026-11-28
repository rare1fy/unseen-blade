import type { Rect } from '../asm/types';
import { GRID } from '../scenes/props';
import { FLOOR, type FloorGrid } from '../asm/roomShape';
import type { Push, Solid, Solids } from './solids';

export interface DoorLane {
  lane: Rect;
  dir: [number, number];
}

export interface ClampOpts {
  play: Rect;
  pad: { x: number; z0: number; z1: number };
  doors: readonly DoorLane[];
  grid: FloorGrid | null;
  overPit: boolean;
  /** World foot height (pos.y + airY) used for vaulting low obstacles and jumping onto PLAT_H platforms. */
  footY?: number;
  /** Ground base elevation where the actor was standing (used when holdHigh keeps ranged foes on platforms). */
  fromY?: number;
  /** Keep a non-staggered walking foe from casually stepping off a high platform cliff. */
  holdHigh?: boolean;
  solids: Solids;
  wallSolid: Solid;
}

/**
 * Intersect a doorway's nominal span [lo, hi] with the contiguous FLOOR cells
 * right inside the room edge so a wide exit lane never opens into an adjacent
 * solid (#) wall or water/ditch (~) pit on drawn maps.
 */
function openSpan(
  grid: FloorGrid | null,
  along: 'x' | 'z',
  insideCoord: number,
  lo: number,
  hi: number,
  minWidth: number,
): { w0: number; w1: number; wallLo: boolean; wallHi: boolean } {
  if (!grid) return { w0: lo, w1: hi, wallLo: false, wallHi: false };
  const mid = (lo + hi) * 0.5;
  const fixedIdx = along === 'x' ? grid.iz(insideCoord) : grid.ix(insideCoord);
  const midIdx = along === 'x' ? grid.ix(mid) : grid.iz(mid);
  const isFloor = (idx: number) =>
    along === 'x' ? grid.kind(idx, fixedIdx) === FLOOR : grid.kind(fixedIdx, idx) === FLOOR;
  if (!isFloor(midIdx)) return { w0: lo, w1: hi, wallLo: false, wallHi: false };

  const origin = along === 'x' ? grid.x0 : grid.z0;
  let i0 = midIdx;
  while (origin + i0 * GRID > lo + 1e-4 && isFloor(i0 - 1)) i0--;
  let i1 = midIdx;
  while (origin + (i1 + 1) * GRID < hi - 1e-4 && isFloor(i1 + 1)) i1++;

  const w0 = Math.max(lo, origin + i0 * GRID);
  const w1 = Math.min(hi, origin + (i1 + 1) * GRID);
  if (w1 - w0 < minWidth) return { w0: lo, w1: hi, wallLo: false, wallHi: false };

  // If the cell just outside the trimmed span is non-FLOOR (wall/pit), that boundary
  // continues inward as a real wall rather than an open doorway corner.
  const wallLo = !isFloor(i0 - 1) && w0 > lo + 1e-3;
  const wallHi = !isFloor(i1 + 1) && w1 < hi - 1e-3;
  return { w0, w1, wallLo, wallHi };
}

function pushFromCorner(p: { x: number; z: number }, r: number, cx: number, cz: number) {
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r || d2 < 1e-12) return;
  const d = Math.sqrt(d2);
  p.x = cx + (dx / d) * r;
  p.z = cz + (dz / d) * r;
}

/**
 * Clamp a body circle (p, r) to the union of the room floor (FloorGrid or PLAY box)
 * and any currently open exit corridors, then resolve against active solids.
 *
 * Unlike the legacy lane clamp:
 * - Exit corridors are strictly two-way: walking out and turning back NEVER hits a one-way wall.
 * - Corridors only engage at/past the actual doorway threshold (never creating a 1 m invisible box inside the room).
 * - Drawn-room exit lanes are clipped against adjacent `#`/`~` cells so you never clip into walls/pits.
 */
export function clampWithDoors(p: { x: number; z: number }, r: number, opts: ClampOpts): Push | null {
  const { play, pad, doors, grid, overPit, solids, wallSolid } = opts;
  const footY = opts.footY ?? 0;

  for (const d of doors) {
    const l = d.lane;
    const [dx, dz] = d.dir;
    const minW = Math.max(2 * r + 0.08, 0.8);

    if (dz < 0) {
      // North exit (back): opens north of edge = l.z1
      const edge = l.z1;
      const outZ = Math.min(l.z0, play.z0) - 6;
      const thresh = edge + r + (grid ? 0 : pad.z0);
      if (p.z < thresh) {
        const { w0, w1, wallLo, wallHi } = openSpan(grid, 'x', edge + GRID * 0.5, l.x0, l.x1, minW);
        if (p.x > w0 && p.x < w1) {
          if (p.z <= edge) {
            p.x = Math.max(w0 + r, Math.min(w1 - r, p.x));
            p.z = Math.max(outZ + r, p.z);
          } else {
            if (wallLo) p.x = Math.max(w0 + r, p.x); else pushFromCorner(p, r, w0, edge);
            if (wallHi) p.x = Math.min(w1 - r, p.x); else pushFromCorner(p, r, w1, edge);
          }
          return solids.pushOut(p, r, footY);
        }
      }
    } else if (dz > 0) {
      // South exit (e.g. hideout departure road): opens south of edge = l.z0
      const edge = l.z0;
      const outZ = l.z1;
      const thresh = edge - r - (grid ? 0 : pad.z1);
      if (p.z > thresh) {
        const { w0, w1, wallLo, wallHi } = openSpan(grid, 'x', edge - GRID * 0.5, l.x0, l.x1, minW);
        if (p.x > w0 && p.x < w1) {
          if (p.z >= edge) {
            p.x = Math.max(w0 + r, Math.min(w1 - r, p.x));
            p.z = Math.min(outZ - r, p.z);
          } else {
            if (wallLo) p.x = Math.max(w0 + r, p.x); else pushFromCorner(p, r, w0, edge);
            if (wallHi) p.x = Math.min(w1 - r, p.x); else pushFromCorner(p, r, w1, edge);
          }
          return solids.pushOut(p, r, footY);
        }
      }
    } else if (dx < 0) {
      // West exit (left): opens west of edge = l.x1
      const edge = l.x1;
      const outX = l.x0;
      const thresh = edge + r + (grid ? 0 : pad.x);
      if (p.x < thresh) {
        const { w0, w1, wallLo, wallHi } = openSpan(grid, 'z', edge + GRID * 0.5, l.z0, l.z1, minW);
        if (p.z > w0 && p.z < w1) {
          if (p.x <= edge) {
            p.z = Math.max(w0 + r, Math.min(w1 - r, p.z));
            p.x = Math.max(outX + r, p.x);
          } else {
            if (wallLo) p.z = Math.max(w0 + r, p.z); else pushFromCorner(p, r, edge, w0);
            if (wallHi) p.z = Math.min(w1 - r, p.z); else pushFromCorner(p, r, edge, w1);
          }
          return solids.pushOut(p, r, footY);
        }
      }
    } else if (dx > 0) {
      // East exit (right): opens east of edge = l.x0
      const edge = l.x0;
      const outX = l.x1;
      const thresh = edge - r - (grid ? 0 : pad.x);
      if (p.x > thresh) {
        const { w0, w1, wallLo, wallHi } = openSpan(grid, 'z', edge - GRID * 0.5, l.z0, l.z1, minW);
        if (p.z > w0 && p.z < w1) {
          if (p.x >= edge) {
            p.z = Math.max(w0 + r, Math.min(w1 - r, p.z));
            p.x = Math.min(outX - r, p.x);
          } else {
            if (wallLo) p.z = Math.max(w0 + r, p.z); else pushFromCorner(p, r, edge, w0);
            if (wallHi) p.z = Math.min(w1 - r, p.z); else pushFromCorner(p, r, edge, w1);
          }
          return solids.pushOut(p, r, footY);
        }
      }
    }
  }

  const ox = p.x;
  const oz = p.z;
  if (grid) {
    const gp = grid.clamp(p, r, overPit, { worldY: footY, fromY: opts.fromY ?? footY, holdHigh: opts.holdHigh });
    const sp = solids.pushOut(p, r, footY);
    return sp ?? (gp && !gp.pit ? { s: wallSolid, nx: gp.nx, nz: gp.nz, depth: gp.depth } : null);
  }

  const x0 = play.x0 + r + pad.x;
  const x1 = play.x1 - r - pad.x;
  const z0 = play.z0 + r + pad.z0;
  const z1 = play.z1 - r - pad.z1;
  p.x = Math.max(x0, Math.min(x1, p.x));
  p.z = Math.max(z0, Math.min(z1, p.z));
  const wx = p.x - ox;
  const wz = p.z - oz;
  const sp = solids.pushOut(p, r, footY);
  return sp ?? (wx || wz ? { s: wallSolid, nx: Math.sign(wx), nz: Math.sign(wz), depth: Math.hypot(wx, wz) } : null);
}
