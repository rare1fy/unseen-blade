/** The role of an obstacle on the battle floor. */
export type SolidKind = 'wall' | 'cover' | 'prop';

/** An axis-aligned box or circle on the x/z floor, with an optional vertical top height maxY (m). */
export interface Solid {
  id: number; kind: SolidKind; shape: 'box' | 'circle'; x: number; z: number; hx: number; hz: number; r: number;
  /** Obstacles lower than this world foot height can be jumped/vaulted cleanly over (default 99 = full height). */
  maxY?: number;
  /** Floor base elevation where this obstacle stands (0 = ground, PLAT_H = elevated platform). */
  baseY?: number;
  /** A broken prop no longer blocks or receives collisions. */
  on: boolean;
  /** A body knocked into this obstacle takes a slam. */
  slam: boolean;
  /** Owner data, such as the breakable prop behind this obstacle. */
  tag?: unknown;
}

/** The deepest displacement made by a solid in one resolution pass. */
export interface Push { s: Solid; nx: number; nz: number; depth: number }

function overlap(s: Solid, x: number, z: number, r: number, footY = 0): Push | null {
  if (!s.on || footY > (s.baseY ?? 0) + (s.maxY ?? 99) - 0.06) return null;
  const dx = x - s.x, dz = z - s.z;
  if (s.shape === 'circle') {
    const distance = Math.hypot(dx, dz), depth = s.r + r - distance;
    if (depth <= 1e-9) return null;
    return { s, nx: distance ? dx / distance : 1, nz: distance ? dz / distance : 0, depth };
  }
  if (Math.abs(dx) <= s.hx && Math.abs(dz) <= s.hz) {
    const faces = [s.hx + dx, s.hx - dx, s.hz + dz, s.hz - dz];
    const nearest = Math.min(...faces), face = faces.indexOf(nearest);
    if (nearest + r <= 1e-9) return null;
    return { s, nx: face === 0 ? -1 : face === 1 ? 1 : 0,
      nz: face === 2 ? -1 : face === 3 ? 1 : 0, depth: nearest + r };
  }
  const cx = Math.max(-s.hx, Math.min(s.hx, dx));
  const cz = Math.max(-s.hz, Math.min(s.hz, dz));
  const ox = dx - cx, oz = dz - cz, distance = Math.hypot(ox, oz), depth = r - distance;
  if (depth <= 1e-9) return null;
  return { s, nx: ox / distance, nz: oz / distance, depth };
}

/** Active obstacles used for body placement and projectile sweeps. */
export class Solids {
  list: Solid[] = [];
  private nextId = 1;

  /** Add an obstacle, assigning its id and equivalent bounding size. */
  add(o: { kind: SolidKind; shape: 'box' | 'circle'; x: number; z: number; hx?: number; hz?: number; r?: number; maxY?: number; baseY?: number; slam?: boolean; tag?: unknown }): Solid {
    const r = o.shape === 'circle' ? (o.r ?? 0) : Math.max(o.hx ?? 0, o.hz ?? 0);
    const s: Solid = { id: this.nextId++, kind: o.kind, shape: o.shape, x: o.x, z: o.z,
      hx: o.shape === 'circle' ? r : (o.hx ?? 0), hz: o.shape === 'circle' ? r : (o.hz ?? 0),
      r, maxY: o.maxY ?? 99, baseY: o.baseY ?? 0, on: true, slam: o.slam ?? false, tag: o.tag };
    this.list.push(s);
    return s;
  }

  /** Remove every obstacle and restart id assignment. */
  clear(): void { this.list = []; this.nextId = 1; }

  /** Move a body circle out of active solids (respecting vertical clearance footY), with up to three settling passes. */
  pushOut(p: { x: number; z: number }, r: number, footY = 0): Push | null {
    let last: Push | null = null;
    const worstDepth = () => this.list.reduce((worst, s) => Math.max(worst, overlap(s, p.x, p.z, r, footY)?.depth ?? 0), 0);
    let bestX = p.x, bestZ = p.z, bestDepth = worstDepth();
    for (let pass = 0; pass < 3; pass++) {
      let deepest: Push | null = null;
      for (const s of this.list) {
        const push = overlap(s, p.x, p.z, r, footY);
        if (!push) continue;
        p.x += push.nx * push.depth;
        p.z += push.nz * push.depth;
        if (!deepest || push.depth > deepest.depth) deepest = push;
      }
      if (!deepest) break;
      last = deepest;
      const depth = worstDepth();
      if (depth < bestDepth - 1e-9) { bestX = p.x; bestZ = p.z; bestDepth = depth; }
    }
    p.x = bestX; p.z = bestZ;
    return last;
  }

  /** Check whether a padded body circle avoids every active solid at height footY. */
  free(x: number, z: number, r: number, pad = 0, footY = 0): boolean {
    return !this.list.some(s => overlap(s, x, z, r + pad, footY));
  }

  /** Find the first solid hit by a moving circle in samples no farther than 0.1 m apart. */
  sweep(ax: number, az: number, bx: number, bz: number, r: number, footY = 0): { s: Solid; t: number } | null {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const s of this.list) if (overlap(s, x, z, r, footY)) return { s, t };
    }
    return null;
  }
}

/** The speed and effects of a wall slam. */
export const SLAM = { minSpeed: 3.5, dmg: 8, stun: 0.5, cooldown: 0.4 };

/** Return the inward speed of a body striking an outward-facing surface. */
export function slamSpeed(vx: number, vz: number, nx: number, nz: number): number {
  return Math.max(0, -(vx * nx + vz * nz));
}
