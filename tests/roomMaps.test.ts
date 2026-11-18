// 定死的屋子（11-18，asm/roomMaps.ts）的检查，每张图都要满足——
//   图是方的（每行一样宽）、只用图例里的字、出口在外沿上、起点在地上；
//   门全开、机关全解开以后，每一格地、每个出口、每份赏、每个机关都能从起点走到；
//   门关着的时候，起点那一块没有出口（分段的屋子）、每一块都放得下一波敌人（离入口 5 米外至少 40 格地）；
//   人要走的地方至少 3 格宽（1.5 米）；建两次一模一样（掩体、可破坏物、出口）。
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PLAY, GRID, M } from '../src/present/scenes/props';
import { CELL } from '../src/present/bestiary/kit';
import { TUNE } from '../src/present/act/tune';
import { VoxWorld } from '../src/present/look/voxkit';
import type { Ctx } from '../src/present/scenes/stage';
import { LUOYANG_LOCALES } from '../src/present/asm/luoyang';
import { FloorGrid, FLOOR, PIT, OUT, type ShapePlan } from '../src/present/asm/roomShape';
import { ROOM_MAPS, MAP_BY_ID, mapShape, mapStage, MAP_CELL, drawnExits, pickMap } from '../src/present/asm/roomMaps';
import { REGIONS } from '../src/present/act/regions';
import { RoomPieces } from '../src/present/act/puzzles';
import { fxRing, fxEmbers } from '../src/present/fx/fx';
import '../src/present/asm/luoyang/arena_palace';
import { arenaPlan, coverVox } from '../src/present/asm/arena';
import { LAYOUTS } from '../src/present/asm/layouts';
import { rndOf, stageLayout } from '../src/present/asm/assemble';
import { withExits, exitInfo, type ExitId } from '../src/present/asm/exits';

// Only the audio and globally pooled visual effects require booting the game.
vi.mock('../src/audio/cues', () => ({ cue: vi.fn() }));
vi.mock('../src/present/fx/fx', () => ({ fxSmoke: vi.fn(), fxRing: vi.fn(), fxChips: vi.fn(), fxEmbers: vi.fn(), fxFlare: vi.fn() }));
vi.mock('../src/present/engine/particles', () => ({ PALPHA: { emit: vi.fn() }, TILE: { ring: 3 } }));

const piecesFor = (id: string) => {
  const m = MAP_BY_ID[id]; mapStage(m);
  const sp = mapShape(m);
  return new RoomPieces(new THREE.Group(), sp, new FloorGrid(sp), m.locale.startsWith('ly_') ? 'palace' : 'wattle', m.seed);
};

/** the plan with every door, wall and barricade open and every sunk piece down */
const allOpen = (sp: ShapePlan): ShapePlan => ({ ...sp, pits: sp.pits.filter(p => !sp.fixed!.sunk.some(s => s.x0 <= p.x0 && s.x1 >= p.x1 && s.z0 <= p.z0 && s.z1 >= p.z1)), bridges: [...sp.bridges, ...sp.fixed!.sunk], fixed: { ...sp.fixed!, closed: [] } });
/** the cells reachable from (x, z) over the floor (4-neighbour) */
function reach(g: FloorGrid, x: number, z: number) {
  const seen = new Set<number>(), st = [[g.ix(x), g.iz(z)]];
  while (st.length) { const [i, j] = st.pop()!, k = j * g.nx + i; if (seen.has(k) || g.kind(i, j) !== FLOOR) continue; seen.add(k); st.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]); }
  return seen;
}
const cellOf = (g: FloorGrid, x: number, z: number) => g.iz(z) * g.nx + g.ix(x);

describe('drawn rooms', () => {
  it('places every threshing bell below and in front of the crown, clear along the battle-camera ray', () => {
    const room = piecesFor('threshing');
    for (const { g, bell, x, z } of room.bells) {
      g.updateMatrixWorld(true);
      const crown = new THREE.Box3(), v = new THREE.Vector3();
      // Read the upper tree vertices from the built frame, independently of the bell and its cord.
      for (const child of g.children) if (child !== bell && child instanceof THREE.Mesh) {
        const pos = child.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
          if (v.y >= 34 * CELL - 1e-5) crown.expandByPoint(v);
        }
      }
      expect(crown.isEmpty()).toBe(false);
      const bounds = new THREE.Box3().setFromObject(bell);
      const center = bounds.getCenter(new THREE.Vector3());
      const eye = new THREE.Vector3(x, TUNE.camH, z + TUNE.camD);
      expect(bounds.min.z).toBeGreaterThan(crown.max.z);
      expect(bounds.max.y).toBeLessThan(crown.min.y);
      expect(new THREE.Ray(eye, center.clone().sub(eye).normalize()).intersectsBox(crown)).toBe(false);
    }
    room.dispose();
  });

  it('fills at least 60% of each individual Luoyang # cell with above-foundation dressing', () => {
    for (const m of ROOM_MAPS.filter(m => m.locale.startsWith('ly_'))) {
      mapStage(m);
      const sp = mapShape(m), w = new VoxWorld(CELL, true);
      const locale = LUOYANG_LOCALES.find(l => l.id === m.locale)!;
      sp.solid.forEach((rect, i) => {
        const salt = 700 + i;
        locale.infill!({ w } as Ctx, { rect, shape: sp, layout: LAYOUTS.axis,
          back: rect.z0 > sp.box.z0 + 0.1, front: rect.z1 < sp.box.z1 - 0.1,
          p: { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2, s: 0,
            seed: m.seed * 97 + salt, rnd: rndOf(m.seed, 1000 + salt),
            season: 'autumn', time: m.time!, weather: m.weather!, lamp: 1 } });
      });
      const n = M(MAP_CELL);
      m.rows.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch !== '#') return;
        const x = M(sp.box.x0) + i * n, z = M(sp.box.z0) + j * n;
        let covered = 0;
        for (let dx = 0; dx < n; dx++) for (let dz = 0; dz < n; dz++) {
          if (w.has(x + dx, 5, z + dz)) covered++;
        }
        expect(covered / (n * n), `${m.id} # (${i + 1},${j + 1})`).toBeGreaterThanOrEqual(0.6);
      }));
    }
  });
  for (const m of ROOM_MAPS) {
    it(`${m.name} (${m.id}): the map is sound`, () => {
      const W = m.rows[0].length;
      for (const r of m.rows) expect(r.length).toBe(W);
      for (const r of m.rows) for (const ch of r) expect('#.~=-wDG?XSEBCo0jt!brWP$').toContain(ch);
      expect(m.rows.join('').split('S').length - 1).toBe(1);
      mapStage(m);
      expect(PLAY.x1 - PLAY.x0).toBeCloseTo(W * MAP_CELL, 2); expect(PLAY.z1 - PLAY.z0).toBeCloseTo(m.rows.length * MAP_CELL, 2);
      const sp = mapShape(m);
      expect(sp.fixed!.exits.length).toBeGreaterThanOrEqual(m.kind === 'fight' ? 2 : 1);
      if (m.rows.join('').includes('b')) expect(sp.fixed!.marks.filter(q => q.kind === 'bell').length).toBe(3);
      if (sp.fixed!.sunk.some(s => s.kind === 'drop')) expect(sp.fixed!.marks.some(q => q.kind === 'rope')).toBe(true);
    });

    it(`${m.name}: everything is reachable once open, the zones hold a wave`, () => {
      mapStage(m);
      const sp = mapShape(m), fx = sp.fixed!, open = new FloorGrid(allOpen(sp)), from = reach(open, sp.enter[0], sp.enter[1]);
      // every floor cell
      let lost = 0; for (let k = 0; k < open.c.length; k++) if (open.c[k] === FLOOR && !from.has(k)) lost++;
      expect(lost).toBe(0);
      // the exits' mouths, the rewards, the puzzle pieces (a step from them)
      for (const e of fx.exits) { const x = e.side === 'back' ? e.x : e.x + (e.side === 'left' ? 0.5 : -0.5), z = e.side === 'back' ? e.z + 0.5 : e.z; expect(from.has(cellOf(open, x, z)), `exit ${e.side} ${e.x},${e.z}`).toBe(true); }
      for (const q of fx.marks) { const ok = [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]].some(([dx, dz]) => from.has(cellOf(open, q.x + dx, q.z + dz))); expect(ok, `${q.kind} ${q.x},${q.z}`).toBe(true); }
      // shut: S's piece has no exit when there are stages; each stage's piece has room for a wave
      const shut = new FloorGrid(sp), zs = shut.zones(), z0 = shut.zoneAt(sp.enter[0], sp.enter[1]);
      expect(z0).toBeGreaterThanOrEqual(0);
      if (fx.stages > 1) for (const e of fx.exits) { const x = e.side === 'back' ? e.x : e.x + (e.side === 'left' ? 0.5 : -0.5), z = e.side === 'back' ? e.z + 0.5 : e.z; expect(shut.zoneAt(x, z)).not.toBe(z0); }
      const room = new Map<number, number>();
      for (let k = 0; k < zs.length; k++) if (zs[k] >= 0) { const i = k % shut.nx, j = (k - i) / shut.nx; if (Math.hypot(shut.cx(i) - sp.enter[0], shut.cz(j) - sp.enter[1]) > 5 || zs[k] !== z0) room.set(zs[k], (room.get(zs[k]) ?? 0) + 1); }
      expect(room.get(z0) ?? 0).toBeGreaterThanOrEqual(40);
      if (fx.stages > 1) {
        const pieces = piecesFor(m.id), seen = [z0];
        while (seen.length < fx.stages) {
          const next = pieces.doorsOf(seen[seen.length - 1]).map(p => p.sides.find(z => !seen.includes(z))).find(z => z != null);
          expect(next).toBeDefined(); expect(room.get(next!) ?? 0).toBeGreaterThanOrEqual(40);
          seen.push(next!);
        }
        pieces.dispose();
      }
    });

    it(`${m.name}: the ways a body passes are at least 3 cells wide`, () => {
      mapStage(m);
      const g = new FloorGrid(allOpen(mapShape(m)));
      // every floor cell sits in some 3 × 3 block of floor (no 1- or 2-cell slivers)
      const thin: string[] = [];
      for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
        if (g.kind(i, j) !== FLOOR) continue;
        let ok = false;
        for (let a = -2; a <= 0 && !ok; a++) for (let b = -2; b <= 0 && !ok; b++) { let all = true; for (let u = 0; u < 3 && all; u++) for (let v = 0; v < 3 && all; v++) if (g.kind(i + a + u, j + b + v) !== FLOOR) all = false; ok = all; }
        if (!ok) thin.push(`${i},${j}`);
      }
      expect(thin).toEqual([]);
    });

    it(`${m.name}: built twice, the same room; the exits sit on the floor's edge`, () => {
      const ids: ExitId[][] = [['left', 'right'], ['back']];
      for (const ex of ids) {
        const mk = () => { mapStage(m); const sp = mapShape(m), layout = withExits(stageLayout(LAYOUTS.axis), ex, sp.fixed); return { sp, layout, plan: arenaPlan(layout, ex, m.seed, m.locale, m.kind, sp) }; };
        const a = mk(), b = mk();
        expect(JSON.stringify(a.plan.covers)).toBe(JSON.stringify(b.plan.covers));
        expect(JSON.stringify(a.plan.props)).toBe(JSON.stringify(b.plan.props));
        expect(JSON.stringify(a.plan.gates)).toBe(JSON.stringify(b.plan.gates));
        // the open gates are this room's exits, the rest shut; each exit's road starts at the floor's edge
        const g = new FloorGrid(allOpen(a.sp));
        for (const id of ex) {
          const e = a.layout.drawn?.[id]; expect(e, id).toBeTruthy();
          const info = exitInfo(a.layout, id), mouth = info.walk[0];
          expect(g.at(mouth[0], mouth[1]), `${id} mouth`).toBe(FLOOR);
          expect(a.plan.gates.some(q => q.open && q.id === id)).toBe(true);
        }
        expect(a.plan.gates.filter(q => q.open).length).toBe(Math.min(ex.length, a.sp.fixed!.exits.length));
        expect(a.plan.gates.length).toBe(a.sp.fixed!.exits.length);
        // cover and breakables on the floor, never in the water
        for (const c of a.plan.covers) expect(g.at(c.x, c.z)).toBe(FLOOR);
        for (const p of a.plan.props) expect(g.at(p.x, p.z), `${p.kind} ${p.x},${p.z}`).toBe(FLOOR);
        if (m.kind === 'boss') expect(g.clear(...a.sp.fixed!.boss!, 0.9)).toBe(true);
        if (m.kind === 'calm') {
          const [cx, cz] = a.sp.fixed!.stations!;
          for (const dx of [-3.2, 0, 3.2]) {
            for (const dz of [-2.6, -1.4, -0.4]) expect(g.clear(cx + dx, cz + dz, 0.8)).toBe(true);
          }
          for (const p of a.plan.props) expect(p.x < cx - 4.5 || p.x > cx + 5.7 || p.z < cz - 3.5 || p.z > cz + 1.1).toBe(true);
        }
      }
    });
  }

  it('exhausts the regional fight deck every cycle, including around calm visits', () => {
    for (const r of REGIONS.slice(0, 2)) {
      const used: string[] = [], all = ROOM_MAPS.filter(m => m.kind === 'fight' && r.locales.includes(m.locale)).map(m => m.id).sort();
      let previous = '';
      for (let cycle = 0; cycle < 3; cycle++) {
        const draws: string[] = [];
        for (let i = 0; i < all.length; i++) {
          const m = pickMap(r, 'fight', used, i + cycle)!;
          expect(m.id).not.toBe(previous); draws.push(m.id); previous = m.id;
          used.push(m.id, pickMap(r, 'calm', used, 0)!.id);
        }
        expect(draws.sort()).toEqual(all);
      }
    }
    expect(pickMap(REGIONS[0], 'calm', [], 1)?.id).toBe('yard_1');
    expect(pickMap(REGIONS[1], 'calm', [], 1)?.id).toBe('yard_2');
    expect(pickMap(REGIONS[1], 'boss', [], 1)?.id).toBe('mint');
    expect(pickMap(REGIONS[0], 'boss', [], 1)).toBeNull();
    expect(pickMap(REGIONS[3], 'fight', [], 1)).toBeNull();
  });
  it('holds the side gate with a foe, grants the heroine five seconds, and clears both faces on closure', () => {
    const p = piecesFor('palace_road'), [inside, outside] = p.plates, g = outside.gate;
    expect(inside.gate).toBe(g);
    const hero = new THREE.Vector3(outside.x, 0, outside.z), foe = { pos: new THREE.Vector3(outside.x, 1.4, outside.z), r: 0.6 };
    const frame = { foes: [foe] };
    const mid = g.g.position, atGate = () => p.grid.at(mid.x, mid.z);
    expect(atGate()).toBe(OUT);
    p.update(0.1, hero, false, { ...frame, heroHeight: 1.2 }); expect(atGate()).toBe(OUT);
    hero.x -= 2; foe.pos.y = 0;
    p.update(0.1, hero, false, frame); expect(atGate()).toBe(FLOOR);
    p.update(8, hero, false, frame); expect(atGate()).toBe(FLOOR);
    foe.pos.x -= 2; p.update(0.1, hero, false, frame); expect(atGate()).toBe(OUT);
    hero.set(outside.x, 0, outside.z); p.update(0.1, hero, false, frame);
    hero.set(mid.x - 0.2, 0, mid.z); foe.pos.set(mid.x + 0.2, 0, mid.z);
    p.update(4.99, hero, false, frame); expect(atGate()).toBe(FLOOR);
    p.update(0.011, hero, false, frame); expect(atGate()).toBe(OUT);
    expect(hero.x).toBeLessThan(g.rect.x0); expect(foe.pos.x).toBeGreaterThan(g.rect.x1);
    expect(p.grid.clear(hero.x, hero.z, 0.4)).toBe(true); expect(p.grid.clear(foe.pos.x, foe.pos.z, foe.r)).toBe(true);
    hero.set(inside.x, 0, inside.z); p.update(0.1, hero, true); expect(atGate()).toBe(FLOOR);
    p.dispose();
  });
  it('needs four blows within three seconds, then drains the causeway in 1.5 seconds', () => {
    const p = piecesFor('fallen_hall'), [wheel] = p.wheels, hero = new THREE.Vector3(wheel.x - 1, 0, wheel.z);
    const hit = () => p.strike({ k: 'arc', x: hero.x, z: hero.z, yaw: Math.PI / 2, range: 1.2, half: 0.5 });
    hit(); p.update(3.1, hero, true);
    for (let i = 0; i < 3; i++) { hit(); p.update(0.3, hero, true); }
    expect(wheel.drain).toBe(-1); hit(); p.update(1.49, hero, true);
    for (const { water } of wheel.paths) {
      expect(p.grid.at(water.position.x, water.position.z)).toBe(PIT);
      expect(water.position.y).toBeLessThan(-0.2); expect(water.material.opacity).toBeLessThan(0.9);
    }
    p.update(0.011, hero, true);
    for (const { water, rect } of wheel.paths) {
      expect(water.visible).toBe(false);
      for (let x = rect.x0 + 0.245; x < rect.x1; x += 0.49) for (let z = rect.z0 + 0.245; z < rect.z1; z += 0.49) expect(p.grid.at(x, z)).toBe(FLOOR);
    }
    p.dispose();
  });
  it('keeps both stone bridges walkable over the molten pit', () => {
    const m = MAP_BY_ID.mint; mapStage(m);
    const sp = mapShape(m), grid = new FloorGrid(sp), pit = sp.pits[0];
    expect(sp.bridges).toHaveLength(2);
    expect(grid.pitAt(pit.x0 + 0.8, pit.z0 + 0.8)).toBe('molten');
    for (const b of sp.bridges) expect(grid.clear((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0.7)).toBe(true);
  });
  it('animates the copper seams out of phase and bursts bubbles between the bridges', () => {
    const room = piecesFor('mint'), hero = new THREE.Vector3(room.sp.enter[0], 0, room.sp.enter[1]);
    const surface = room.root.getObjectByName('moltenSurface') as THREE.Mesh;
    const colors = surface.geometry.getAttribute('color'), sample = () => Array.from(colors.array);
    vi.mocked(fxRing).mockClear(); vi.mocked(fxEmbers).mockClear();
    room.update(0.1, hero, false);
    const before = sample();
    room.update(0.625, hero, false);
    const changes = sample().map((n, i) => n - before[i]);
    expect(Math.min(...changes)).toBeLessThan(-0.05);
    expect(Math.max(...changes)).toBeGreaterThan(0.05);
    let since = 0.725, bursts = 0;
    for (let i = 0; i < 360; i++) {
      room.update(0.05, hero, false);
      since += 0.05;
      if (vi.mocked(fxRing).mock.calls.length === bursts) continue;
      const [at] = vi.mocked(fxRing).mock.calls[bursts++];
      expect(room.grid.pitAt(at.x, at.z)).toBe('molten');
      expect(at.y).toBeCloseTo(-0.58);
      expect(since).toBeGreaterThanOrEqual(1);
      expect(since).toBeLessThan(2.06);
      since = 0;
    }
    expect(bursts).toBeGreaterThanOrEqual(8);
    expect(fxEmbers).toHaveBeenCalledTimes(bursts);
    room.dispose();
  });
  it('fits the sideways camel inside its solid and leaves a three-cell lane around it', () => {
    const m = MAP_BY_ID.bronze_street; mapStage(m);
    const sp = mapShape(m), grid = new FloorGrid(sp);
    const layout = withExits(stageLayout(LAYOUTS.axis), ['back'], sp.fixed);
    const [cover] = arenaPlan(layout, ['back'], m.seed, m.locale, 'fight', sp).covers;
    expect(cover.kind).toBe('streetCamel');
    const bounds = new THREE.Box3();
    coverVox({ box(x0, y0, z0, x1, y1, z1) {
      bounds.expandByPoint(new THREE.Vector3(x0, y0, z0).multiplyScalar(CELL));
      bounds.expandByPoint(new THREE.Vector3(x1 + 1, y1 + 1, z1 + 1).multiplyScalar(CELL));
    } }, cover.kind, cover.rot);
    expect(bounds.max.x - bounds.min.x).toBeGreaterThanOrEqual(3.5);
    expect(bounds.max.y).toBeCloseTo(1.6, 1);
    expect(Math.max(-bounds.min.x, bounds.max.x)).toBeLessThanOrEqual(cover.hx + 1e-6);
    expect(Math.max(-bounds.min.z, bounds.max.z)).toBeLessThanOrEqual(cover.hz + 1e-6);
    for (let j = 0; j < grid.nz; j++) for (let i = 0; i < grid.nx; i++) {
      if (Math.abs(grid.cx(i) - cover.x) < cover.hx + 3 * GRID && Math.abs(grid.cz(j) - cover.z) < cover.hz + 3 * GRID)
        expect(grid.kind(i, j)).toBe(FLOOR);
    }
  });
  for (const id of ['threshing', 'fallen_hall', 'bronze_street']) {
    it(`${id}: the optional prize is sealed, its real input opens the way, and it pays once`, () => {
      const p = piecesFor(id), [sx, sz] = p.sp.enter, hero = new THREE.Vector3(sx, 0, sz), [prize] = p.rewards;
      const reachable = () => p.grid.reach(sx, sz).has(cellOf(p.grid, prize.x, prize.z));
      expect(reachable()).toBe(false);
      if (id === 'threshing') {
        p.update(1, hero, true); p.update(3.2, hero, true);
        for (const b of p.bells.slice().sort((a, b) => a.note - b.note)) {
          p.strike({ k: 'arc', x: b.x, z: b.z + 1, yaw: Math.PI, range: 1.4, half: 0.5 });
        }
      } else if (id === 'fallen_hall') {
        const wall = p.pieces.find(q => q.kind === 'hollow')!;
        for (let i = 0; i < 3; i++) p.strike({ k: 'arc', x: wall.g.position.x, z: wall.rect.z1 + 0.6, yaw: Math.PI, range: 1.4, half: 0.5 });
      } else {
        const jar = p.sp.fixed!.props.find(q => q.kind === 'oil')!;
        expect(p.grid.zoneAt(jar.x, jar.z)).toBe(p.grid.zoneAt(sx, sz));
        p.boom(jar.x, jar.z, 2);
      }
      p.update(1.21, hero, true); expect(reachable()).toBe(true);
      hero.set(prize.x, 0, prize.z);
      expect(p.update(0.1, hero, true).filter(e => e.k === 'reward')).toHaveLength(1);
      expect(p.update(0.1, hero, true)).toEqual([]);
      p.dispose();
    });
  }
  it('two exits: the pair farthest apart, left one first', () => {
    const m = ROOM_MAPS.find(q => q.id === 'crossroads')!; mapStage(m); const fx = mapShape(m).fixed!;
    const d = drawnExits(fx, ['left', 'right']);
    expect(d.left!.side).toBe('left'); expect(d.right!.side).toBe('right');
    expect(drawnExits(fx, ['back']).back!.side).toBe('back');
  });
});
