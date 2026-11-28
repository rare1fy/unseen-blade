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
import { FloorGrid, FLOOR, PIT, OUT, PLAT_H, type ShapePlan } from '../src/present/asm/roomShape';
import { ROOM_MAPS, MAP_BY_ID, mapShape, mapStage, MAP_CELL, drawnExits, pickMap } from '../src/present/asm/roomMaps';
import { REGIONS } from '../src/present/act/regions';
import { RoomPieces } from '../src/present/act/puzzles';
import { BreakLogic } from '../src/present/act/breakLogic';
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
/** the cells reachable from (x, z) over the floor (4-neighbour walk) */
function reach(g: FloorGrid, x: number, z: number) {
  const seen = new Set<number>(), st = [[g.ix(x), g.iz(z)]];
  while (st.length) { const [i, j] = st.pop()!, k = j * g.nx + i; if (seen.has(k) || g.kind(i, j) !== FLOOR) continue; seen.add(k); st.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]); }
  return seen;
}
/** cells reachable by walking OR leaping across narrow <= 2.9m (<= 6 subcell) pits/stepping-stones */
function jumpReach(g: FloorGrid, x: number, z: number) {
  const seen = new Set<number>(), st = [[g.ix(x), g.iz(z)]];
  while (st.length) {
    const [i, j] = st.pop()!, k = j * g.nx + i;
    if (seen.has(k) || g.kind(i, j) !== FLOOR) continue;
    seen.add(k);
    st.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      for (let s = 2; s <= 6; s++) {
        const ni = i + di * s, nj = j + dj * s, nk = g.kind(ni, nj);
        if (nk === OUT) break;
        if (nk === FLOOR) { st.push([ni, nj]); break; }
      }
    }
  }
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
      for (const r of m.rows) for (const ch of r) expect('#.~=-wDG?XSEBCo0jt!brWP$^/:').toContain(ch);
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
      const sp = mapShape(m), fx = sp.fixed!, open = new FloorGrid(allOpen(sp));
      const walkFrom = reach(open, sp.enter[0], sp.enter[1]);
      const jumpFrom = jumpReach(open, sp.enter[0], sp.enter[1]);
      // every floor cell (including stepping-stone piers & jumpable canal banks) is reachable by walk + jump
      let lost = 0; for (let k = 0; k < open.c.length; k++) if (open.c[k] === FLOOR && !jumpFrom.has(k)) lost++;
      expect(lost).toBe(0);
      // all main exits MUST be reachable on foot without jumping; rewards & puzzle marks reachable by walk/jump
      for (const e of fx.exits) { const x = e.side === 'back' ? e.x : e.x + (e.side === 'left' ? 0.5 : -0.5), z = e.side === 'back' ? e.z + 0.5 : e.z; expect(walkFrom.has(cellOf(open, x, z)), `exit ${e.side} ${e.x},${e.z}`).toBe(true); }
      for (const q of fx.marks) { const ok = [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]].some(([dx, dz]) => jumpFrom.has(cellOf(open, q.x + dx, q.z + dz))); expect(ok, `${q.kind} ${q.x},${q.z}`).toBe(true); }
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
      const sp = mapShape(m), g = new FloorGrid(allOpen(sp));
      const inStone = (x: number, z: number) => !!sp.stones?.some(q => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);
      // every non-stepping-stone floor cell sits in some 3 × 3 block of floor (no 1- or 2-cell slivers)
      const thin: string[] = [];
      for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
        if (g.kind(i, j) !== FLOOR || inStone(g.cx(i), g.cz(j))) continue;
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
    expect(pickMap(REGIONS[2], 'boss', [], 1)?.id).toBe('baimen');
    expect(pickMap(REGIONS[2], 'calm', [], 1)?.id).toBe('yard_3');
    expect(pickMap(REGIONS[3], 'fight', [], 1)).not.toBeNull();
    expect(pickMap(REGIONS[3], 'boss', [], 1)?.id).toBe('wl_flagship');
    expect(pickMap(REGIONS[3], 'calm', [], 1)?.id).toBe('yard_4');
    expect(pickMap(REGIONS[4], 'fight', [], 1)).not.toBeNull();
    expect(pickMap(REGIONS[4], 'boss', [], 1)?.id).toBe('cx_hall');
    expect(pickMap(REGIONS[4], 'calm', [], 1)?.id).toBe('yard_5');
  });
  it('requires ALL linked twin plates (via fallen pillar pin + elevated terrace step), grants 3s grace, and clears both faces on closure', () => {
    const p = piecesFor('palace_road');
    const highPlate = p.plates.find(q => q.baseY > 0.5)!;
    const lowPlate = p.plates.find(q => q.baseY <= 0.5)!;
    expect(highPlate).toBeDefined();
    expect(lowPlate).toBeDefined();
    const g = lowPlate.gate;
    expect(highPlate.gate).toBe(g);
    const hero = new THREE.Vector3(lowPlate.x, 0, lowPlate.z), foe = { pos: new THREE.Vector3(highPlate.x + 5, 0, highPlate.z), r: 0.6 };
    const mid = g.g.position, atGate = () => p.grid.at(mid.x, mid.z);
    expect(atGate()).toBe(OUT);

    // Stepping on ONLY one of the two linked plates must NOT open the gate!
    p.update(0.1, hero, false, { foes: [foe], heroHeight: 0 });
    expect(atGate()).toBe(OUT);

    // Pin the lower plate permanently with a fallen pillar segment, then jump onto the elevated platform plate!
    const pillars: Array<[number, number, number, number]> = [[lowPlate.x, lowPlate.z + 2.5, lowPlate.x, lowPlate.z - 1.2]];
    hero.set(highPlate.x, PLAT_H, highPlate.z);
    p.update(0.1, hero, false, { foes: [foe], heroHeight: 0, pillars });
    expect(atGate()).toBe(FLOOR);

    // Step off highPlate: 3.0s grace keeps gate open at 2.95s, then closes cleanly at 3.02s and pushes bodies clear!
    hero.set(mid.x - 0.2, 0, mid.z); foe.pos.set(mid.x + 0.2, 0, mid.z);
    p.update(2.95, hero, false, { foes: [foe], heroHeight: 0, pillars }); expect(atGate()).toBe(FLOOR);
    p.update(0.08, hero, false, { foes: [foe], heroHeight: 0, pillars }); expect(atGate()).toBe(OUT);
    expect(hero.x).toBeLessThan(g.rect.x0); expect(foe.pos.x).toBeGreaterThan(g.rect.x1);
    expect(p.grid.clear(hero.x, hero.z, 0.4)).toBe(true); expect(p.grid.clear(foe.pos.x, foe.pos.z, foe.r)).toBe(true);
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
        const orderedBells = ((p as unknown as { order: number[] }).order).map(idx => p.bells[idx]);
        for (const b of orderedBells) {
          p.strike({ k: 'arc', x: b.x, z: b.z + 1, yaw: Math.PI, range: 1.4, half: 0.5 });
        }
      } else if (id === 'fallen_hall') {
        expect(p.isRewardHidden(prize)).toBe(true);
        expect(prize.beam.visible).toBe(false);
        expect(prize.xrayBeam.visible).toBe(false);
        const wall = p.pieces.find(q => q.kind === 'hollow')!;
        for (let i = 0; i < 3; i++) p.strike({ k: 'arc', x: wall.g.position.x, z: wall.rect.z1 + 0.6, yaw: Math.PI, range: 1.4, half: 0.5 });
      } else {
        const jarSpec = p.sp.fixed!.props.find(q => q.kind === 'oil')!;
        const barr = p.pieces.find(q => q.kind === 'barricade')!;
        expect(p.grid.zoneAt(jarSpec.x, jarSpec.z)).toBe(p.grid.zoneAt(sx, sz));
        // Jar sits > 4.5m back from barricade: bowling-kick it westward across the avenue into X!
        expect(Math.hypot(jarSpec.x - barr.g.position.x, jarSpec.z - barr.g.position.z)).toBeGreaterThan(4.5);
        const logic = new BreakLogic();
        const oil = logic.add('oil', jarSpec.x, jarSpec.z);
        logic.hit(oil, { src: 'hero', heavy: true, slide: true, dir: [-1, 0] });
        for (let step = 0; step < 25; step++) {
          const res = logic.update(0.04, [], (nx, nz) => p.grid.at(nx, nz) === OUT);
          for (const ev of res.events) if (ev.k === 'boom') p.boom(ev.x, ev.z, ev.r);
        }
      }
      p.update(1.21, hero, true); expect(reachable()).toBe(true);
      expect(prize.beam.visible).toBe(true);
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
  it('provides at least 8 distinct fight rooms per region and upgrades micro-puzzle feedback', () => {
    for (const r of REGIONS) {
      const fights = ROOM_MAPS.filter(m => m.kind === 'fight' && r.locales.includes(m.locale));
      expect(fights.length, r.id).toBeGreaterThanOrEqual(8);
    }
    // Verify cx_garden sluice wheel 4-pip gauge & center lotus reward reachability
    const g = piecesFor('cx_garden'), [sx, sz] = g.sp.enter, hero = new THREE.Vector3(sx, 0, sz);
    const [wheel] = g.wheels, [prize] = g.rewards;
    expect(wheel.pips).toHaveLength(4);
    expect(g.grid.reach(sx, sz).has(cellOf(g.grid, prize.x, prize.z))).toBe(false);
    hero.set(wheel.x - 0.8, 0, wheel.z);
    for (let i = 0; i < 4; i++) {
      g.strike({ k: 'arc', x: hero.x, z: hero.z, yaw: Math.PI / 2, range: 1.4, half: 0.6 });
      g.update(0.2, hero, true);
    }
    g.update(1.6, hero, true);
    expect(g.grid.reach(sx, sz).has(cellOf(g.grid, prize.x, prize.z))).toBe(true);
    expect(prize.beam.visible).toBe(true);
    expect(prize.gem.visible).toBe(true);
    g.dispose();
    // Verify per-visit random treasure roll varies spawn presence, couples puzzle mechanisms to rewards, and rolls both gold and mythic tiers
    const m = MAP_BY_ID.hj_granary; mapStage(m);
    const sp = mapShape(m);
    let empties = 0, golds = 0, mythics = 0, zeroRew = 0;
    for (let roll = 1; roll <= 40; roll++) {
      const rp = new RoomPieces(new THREE.Group(), sp, new FloorGrid(sp), 'wattle', m.seed, false, roll * 7919);
      if (rp.rewards.length < 2) empties++;
      // Whenever a secret alcove has no reward, its puzzle mechanisms must NOT spawn!
      const puzBarriers = rp.pieces.filter(p => p.kind !== 'door').length;
      expect(puzBarriers).toBe(rp.rewards.length);
      if (rp.rewards.length === 0) {
        zeroRew++;
        expect(rp.plates.length).toBe(0);
        expect(rp.bells.length).toBe(0);
      }
      for (const r of rp.rewards) {
        const hidden = rp.isRewardHidden(r);
        expect(r.beam.visible && r.xrayBeam.visible && r.gem.visible).toBe(!hidden);
        if (r.tier === 'mythic') mythics++; else golds++;
      }
      rp.dispose();
    }
    expect(empties).toBeGreaterThan(0);
    expect(zeroRew).toBeGreaterThan(0);
    expect(golds).toBeGreaterThan(0);
    expect(mythics).toBeGreaterThan(0);
  });

  it('places drawbridge rope posts on far islands requiring ranged dart cut, and eliminates redundant bypass bridges', () => {
    for (const id of ['hj_mill', 'islands', 'ly_bridge', 'xp_dockyard', 'wl_chains', 'wl_ring', 'cx_pavilion']) {
      const p = piecesFor(id), [sx, sz] = p.sp.enter, hero = new THREE.Vector3(sx, 0, sz);
      const [drop] = p.drops;
      const prize = p.rewards.slice().sort((a, b) => Math.hypot(a.x - drop.post[0], a.z - drop.post[1]) - Math.hypot(b.x - drop.post[0], b.z - drop.post[1]))[0];
      expect(drop, `${id} dropBridge`).toBeDefined();
      // Rope post MUST NOT be walkable from S before the drawbridge drops!
      const initialWalk = p.grid.reach(sx, sz);
      expect(initialWalk.has(cellOf(p.grid, drop.post[0], drop.post[1])), `${id} rope post must sit on far bank`).toBe(false);
      expect(initialWalk.has(cellOf(p.grid, prize.x, prize.z)), `${id} island prize sealed`).toBe(false);

      // Firing a dart across the canal slices the far-shore rope post and drops the drawbridge!
      const shotA = new THREE.Vector3(drop.post[0] - 4, drop.postY + 0.9, drop.post[1] - 4);
      const shotB = new THREE.Vector3(drop.post[0] + 1, drop.postY + 0.9, drop.post[1] + 1);
      expect(p.hitByDart(shotA, shotB)).toBe(true);
      p.update(0.55, hero, true);
      expect(p.grid.reach(sx, sz).has(cellOf(p.grid, prize.x, prize.z)), `${id} bridge walkable after dart cut`).toBe(true);
      p.dispose();
    }

    // hj_mill: northern sluice treasure island has NO redundant permanent bridge bypassing the flooded causeway!
    const mill = piecesFor('hj_mill'), [msx, msz] = mill.sp.enter;
    const [mw] = mill.wheels;
    const sluicePrize = mill.rewards.slice().sort((a, b) => Math.hypot(a.x - mw.x, a.z - mw.z) - Math.hypot(b.x - mw.x, b.z - mw.z))[0];
    expect(mill.grid.reach(msx, msz).has(cellOf(mill.grid, sluicePrize.x, sluicePrize.z))).toBe(false);
    for (let i = 0; i < 4; i++) {
      mill.hitByDart(new THREE.Vector3(mw.x - 2, mw.baseY + 0.9, mw.z), new THREE.Vector3(mw.x + 1, mw.baseY + 0.9, mw.z));
      mill.update(0.2, new THREE.Vector3(msx, 0, msz), true);
    }
    mill.update(1.6, new THREE.Vector3(msx, 0, msz), true);
    expect(mill.grid.reach(msx, msz).has(cellOf(mill.grid, sluicePrize.x, sluicePrize.z))).toBe(true);
    mill.dispose();
  });
});
