import { describe, it, expect } from 'vitest';
import { clampWithDoors, type DoorLane } from '../src/present/act/doorClamp';
import { Solids, type Solid } from '../src/present/act/solids';
import { HIDEOUT, hideoutScene, hideoutSolids } from '../src/present/act/hideout';
import { VoxWorld } from '../src/present/look/voxkit';
import { CELL } from '../src/present/bestiary/kit';
import { ROOM_MAPS, mapStage, mapShape, drawnExits } from '../src/present/asm/roomMaps';
import { FloorGrid, FLOOR } from '../src/present/asm/roomShape';
import { exitInfo } from '../src/present/asm/exits';
import { PLAY } from '../src/present/scenes/props';

const WALL_SOLID: Solid = { id: 0, kind: 'wall', shape: 'box', x: 0, z: 0, hx: 0, hz: 0, r: 0, on: true, slam: true };
const HERO_R = 0.38;

function walkStepByStep(
  start: { x: number; z: number },
  target: { x: number; z: number },
  stepLen: number,
  clampFn: (p: { x: number; z: number }) => void,
) {
  const p = { x: start.x, z: start.z };
  const total = Math.hypot(target.x - start.x, target.z - start.z);
  const steps = Math.max(1, Math.ceil(total / stepLen));
  const dx = (target.x - start.x) / steps;
  const dz = (target.z - start.z) / steps;
  for (let i = 0; i < steps; i++) {
    p.x += dx;
    p.z += dz;
    clampFn(p);
  }
  return p;
}

describe('Airwall elimination & two-way exit corridors', () => {
  it('hideout south departure road is 100% two-way (walk out through gate & back into yard with zero one-way trap)', () => {
    const solids = new Solids();
    for (const so of hideoutSolids({ rackBuilt: true, forgeBuilt: true, gardenBuilt: true })) {
      solids.add({ kind: 'prop', ...so });
    }
    const play = { ...HIDEOUT.floor };
    const doors: DoorLane[] = [{
      dir: [0, 1],
      lane: { x0: HIDEOUT.exit.x0, x1: HIDEOUT.exit.x1, z0: play.z1 - 0.8, z1: play.z1 + 3.0 },
    }];
    const clamp = (p: { x: number; z: number }) =>
      clampWithDoors(p, HERO_R, { play, pad: { x: 0, z0: 0, z1: 0 }, doors, grid: null, overPit: false, solids, wallSolid: WALL_SOLID });

    // Walk south from center courtyard through the front gate (z=10.6) all the way past the departure piers (z=16.8)
    const out = walkStepByStep({ x: 0.4, z: 2.0 }, { x: 0.4, z: 16.8 }, 0.15, clamp);
    expect(out.z).toBeGreaterThan(16.5);
    expect(out.x).toBeCloseTo(0.4, 2);

    // Now turn around and walk all the way BACK NORTH into the courtyard (previously trapped permanently at z=10.58!)
    const back = walkStepByStep(out, { x: 0.4, z: 2.0 }, 0.15, clamp);
    expect(back.z).toBeLessThan(2.2);
    expect(back.x).toBeCloseTo(0.4, 2);
  });

  it('hideout east footbridge to bamboo garden is two-way and clear', () => {
    const solids = new Solids();
    for (const so of hideoutSolids({ rackBuilt: false, forgeBuilt: false, gardenBuilt: false })) {
      solids.add({ kind: 'prop', ...so });
    }
    const play = { ...HIDEOUT.floor };
    const clamp = (p: { x: number; z: number }) =>
      clampWithDoors(p, HERO_R, { play, pad: { x: 0, z0: 0, z1: 0 }, doors: [], grid: null, overPit: false, solids, wallSolid: WALL_SOLID });

    const east = walkStepByStep({ x: 11.5, z: -0.4 }, { x: 20.0, z: -0.4 }, 0.15, clamp);
    expect(east.x).toBeGreaterThan(19.8);
    const west = walkStepByStep(east, { x: 11.5, z: -0.4 }, 0.15, clamp);
    expect(west.x).toBeLessThan(11.7);
  });

  it('unbuilt hideout progressive zones leave zero invisible solids on empty ground', () => {
    const unbuilt = new Solids();
    for (const so of hideoutSolids({ rackBuilt: false, forgeBuilt: false, gardenBuilt: false })) {
      unbuilt.add({ kind: 'prop', ...so });
    }
    expect(unbuilt.free(HIDEOUT.weaponRack.x, HIDEOUT.weaponRack.z, HERO_R)).toBe(true);
    expect(unbuilt.free(HIDEOUT.keepsakeBox.x, HIDEOUT.keepsakeBox.z, HERO_R)).toBe(true);
    for (const gp of HIDEOUT.gardenPlots) {
      expect(unbuilt.free(gp.x, gp.z, HERO_R)).toBe(true);
    }
    // Former phantom solid spot in SE courtyard (4.4..5.6, 9.0..9.9) must also be completely free
    expect(unbuilt.free(5.0, 9.45, HERO_R)).toBe(true);
  });

  it('every hideout static solid matches real visible voxels or dynamic structures (zero phantom airwalls)', () => {
    const w = new VoxWorld(CELL);
    hideoutScene({ time: 'dusk', weather: 'clear' }).build({
      w,
      cards: { add() {} },
      light() {},
      ambient() {},
      shaft() {},
      water() {},
      add() {},
    } as never);

    const hasSolidVox = new Set<string>();
    const hasFloor = new Set<string>();
    for (const [k] of w.cells) {
      const X = Math.floor(k / (1024 * 1024)) - 512;
      const Y = (Math.floor(k / 1024) % 1024) - 512;
      const Z = (k % 1024) - 512;
      const key = `${X},${Z}`;
      if (Y === -1) hasFloor.add(key);
      if (Y >= 0) hasSolidVox.add(key);
    }

    const dynamicCenters = [
      HIDEOUT.weaponRack,
      HIDEOUT.stele,
      HIDEOUT.keepsakeBox,
      { x: 10.8, z: 8.6 }, // donkey
      ...HIDEOUT.gardenPlots,
    ];

    for (const s of hideoutSolids({ rackBuilt: true, forgeBuilt: true, gardenBuilt: true })) {
      if (dynamicCenters.some(d => Math.hypot(d.x - s.x, d.z - s.z) < 0.8)) continue;
      const hx = s.shape === 'box' ? s.hx : s.r;
      const hz = s.shape === 'box' ? s.hz : s.r;
      let occ = 0;
      for (let X = Math.floor((s.x - hx) / CELL); X <= Math.ceil((s.x + hx) / CELL); X++) {
        for (let Z = Math.floor((s.z - hz) / CELL); Z <= Math.ceil((s.z + hz) / CELL); Z++) {
          const key = `${X},${Z}`;
          if (hasSolidVox.has(key) || !hasFloor.has(key)) occ++;
        }
      }
      expect(occ, `Phantom hideout solid at (${s.x}, ${s.z})`).toBeGreaterThan(0);
    }
  });

  it('combat room open doors (back / left / right) have zero 1m-inward airwalls and support two-way walk out & back', () => {
    const play = { x0: -10, x1: 10, z0: -10, z1: 10 };
    const solids = new Solids();
    const doors: DoorLane[] = [
      { dir: [0, -1], lane: { x0: -1.4, x1: 1.4, z0: -16, z1: -10 } },
      { dir: [-1, 0], lane: { x0: -16, x1: -10, z0: -5.4, z1: -2.6 } },
      { dir: [1, 0], lane: { x0: 10, x1: 16, z0: -5.4, z1: -2.6 } },
    ];
    const clamp = (p: { x: number; z: number }) =>
      clampWithDoors(p, HERO_R, { play, pad: { x: 0.02, z0: 0.02, z1: 0.1 }, doors, grid: null, overPit: false, solids, wallSolid: WALL_SOLID });

    // Walking sideways 0.55m inside the north wall right across the open back door must NOT snag on invisible vertical walls!
    const acrossBack = walkStepByStep({ x: -4.0, z: -9.45 }, { x: 4.0, z: -9.45 }, 0.12, clamp);
    expect(acrossBack.x).toBeGreaterThan(3.8);

    // Walking north/south 0.55m inside the left wall right across the open left door must NOT snag on invisible horizontal walls!
    const acrossLeft = walkStepByStep({ x: -9.45, z: -7.5 }, { x: -9.45, z: -0.5 }, 0.12, clamp);
    expect(acrossLeft.z).toBeGreaterThan(-0.7);

    // Two-way walk OUT and BACK IN through back, left, and right exits
    const outBack = walkStepByStep({ x: 0, z: -7.0 }, { x: 0, z: -12.5 }, 0.15, clamp);
    expect(outBack.z).toBeLessThan(-12.2);
    const inBack = walkStepByStep(outBack, { x: 0, z: -7.0 }, 0.15, clamp);
    expect(inBack.z).toBeGreaterThan(-7.2);

    const outLeft = walkStepByStep({ x: -7.0, z: -4.0 }, { x: -12.5, z: -4.0 }, 0.15, clamp);
    expect(outLeft.x).toBeLessThan(-12.2);
    const inLeft = walkStepByStep(outLeft, { x: -7.0, z: -4.0 }, 0.15, clamp);
    expect(inLeft.x).toBeGreaterThan(-7.2);

    const outRight = walkStepByStep({ x: 7.0, z: -4.0 }, { x: 12.5, z: -4.0 }, 0.15, clamp);
    expect(outRight.x).toBeGreaterThan(12.2);
    const inRight = walkStepByStep(outRight, { x: 7.0, z: -4.0 }, 0.15, clamp);
    expect(inRight.x).toBeLessThan(7.2);
  });

  it('every drawn ROOM_MAP exit supports smooth two-way walk out and back without clipping into adjacent walls/pits', () => {
    const solids = new Solids();
    for (const m of ROOM_MAPS) {
      mapStage(m);
      const sp = mapShape(m);
      const grid = new FloorGrid(sp);
      const fx = sp.fixed!;
      for (const e of fx.exits) {
        const fakeLayout: any = { path: [], slots: [], drawn: { [e.side]: e } };
        const ex = exitInfo(fakeLayout, e.side);
        const play = { ...PLAY };
        const clamp = (p: { x: number; z: number }) =>
          clampWithDoors(p, HERO_R, { play, pad: { x: 0.02, z0: 0.02, z1: 0.1 }, doors: [ex], grid, overPit: false, solids, wallSolid: WALL_SOLID });

        const inside = {
          x: e.side === 'left' ? PLAY.x0 + 1.1 : e.side === 'right' ? PLAY.x1 - 1.1 : e.x,
          z: e.side === 'back' ? PLAY.z0 + 1.1 : e.z,
        };
        if (grid.at(inside.x, inside.z) !== FLOOR) continue;

        const outside = {
          x: inside.x + ex.dir[0] * 3.0,
          z: inside.z + ex.dir[1] * 3.0,
        };
        const out = walkStepByStep(inside, outside, 0.15, clamp);
        const distOut = (out.x - inside.x) * ex.dir[0] + (out.z - inside.z) * ex.dir[1];
        expect(distOut, `${m.id} ${e.side} walk out`).toBeGreaterThan(2.5);

        const back = walkStepByStep(out, inside, 0.15, clamp);
        expect(Math.hypot(back.x - inside.x, back.z - inside.z), `${m.id} ${e.side} walk back`).toBeLessThan(0.25);
      }
    }
  });
});
