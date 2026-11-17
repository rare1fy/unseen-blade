// 屋子形态（11-18）的检查：每种形状 × 多个种子 × 两个地点的构图 × 出口组合，都要满足——
//   能走的地连成一片（不会有走不到的角落）；主角进场的点、每个开着的门洞口、头目的站位都在这片地上；
//   出界坑里没有能走的格子，桥把坑两边连起来；可破坏物件和掩体都站在地上（不在水里、桥上、被围起来的实地里）；
//   刷怪点（场地上随机挑、离墙离坑 0.7 米）能找到，而且走得到主角跟前；
//   格子图挡人：从坑边往坑里推的身体被挡在坑沿（主角）、被允许进坑（被打飞的敌人）。
// 不建体素（快），体素拼装的检查在 asm.test.ts。
import { describe, expect, it } from 'vitest';
import { setStage, PLAY, SZ } from '../src/present/scenes/props';
import { makeShape, pickShape, FloorGrid, SHAPE_K, FLOOR, PIT, OUT, type ShapeId } from '../src/present/asm/roomShape';
import { arenaPlan } from '../src/present/asm/arena';
import { LAYOUTS } from '../src/present/asm/layouts';
import { stageLayout, mirrorLayout } from '../src/present/asm/assemble';
import { withExits, exitInfo, type ExitId } from '../src/present/asm/exits';
import { outline } from '../src/present/asm/shapeBuild';

const SHAPES: ShapeId[] = ['ell', 'cloister', 'neck', 'bridge', 'pond'];
const LAYS = ['axis', 'offset', 'pair', 'garden'];
const EXITS: ExitId[][] = [['left', 'right'], ['back'], []];

describe('room shapes', () => {
  for (const id of SHAPES) for (const pit of ['water', 'ditch'] as const) {
    if ((id === 'ell' || id === 'cloister' || id === 'neck') && pit === 'ditch') continue;
    it(`${id} (${pit}): one floor, the ways in and out on it, props on the floor`, () => {
      const bad: string[] = [];
      for (let s = 0; s < 24; s++) {
        const seed = 1000 + s * 37, lay = LAYS[s % LAYS.length], ex = EXITS[s % EXITS.length], mir = s % 2 === 1;
        setStage(true, SHAPE_K[id]);
        const layout = withExits(mir ? mirrorLayout(stageLayout(LAYOUTS[lay])) : stageLayout(LAYOUTS[lay]), ex);
        const sp = makeShape(id, seed, { layout, pit });
        const plan = arenaPlan(layout, ex, seed, 'hj_village', 'fight', sp), g = new FloorGrid(sp);
        const tag = `${id}/${pit} #${seed} ${lay}${mir ? '~' : ''} [${ex.join(',')}]`;
        // the box: at most 30 × 40 m
        if (sp.box.x1 - sp.box.x0 > 30.5 || sp.box.z1 - sp.box.z0 > 40.5) bad.push(`${tag}: box ${(sp.box.x1 - sp.box.x0).toFixed(1)} × ${(sp.box.z1 - sp.box.z0).toFixed(1)}`);
        // one piece of floor from the way in
        const [ex0, ez0] = sp.enter, reach = g.reach(ex0, SZ(5.0));
        if (g.at(ex0, SZ(5.0)) !== FLOOR) bad.push(`${tag}: the way in (${ex0}, ${SZ(5.0)}) is not floor`);
        if (reach.size !== g.floorCount()) bad.push(`${tag}: ${g.floorCount() - reach.size} floor cells cut off`);
        void ez0;
        // the gates' mouths (just inside each gate) and the boss's mark are on that floor
        for (const q of plan.gates) {
          const mx = q.along === 'x' ? q.x : q.x - q.out[0] * 0.6, mz = q.along === 'x' ? q.z + 0.6 : q.z;
          if (!reach.has(g.iz(mz) * g.nx + g.ix(mx))) bad.push(`${tag}: gate ${q.id} @(${q.x.toFixed(1)}, ${q.z.toFixed(1)}) not reached`);
        }
        for (const e of ex) { const w = exitInfo(layout, e).walk[0]; if (!reach.has(g.iz(w[1]) * g.nx + g.ix(w[0]))) bad.push(`${tag}: exit ${e}'s first walk point off the floor`); }
        if (!reach.has(g.iz(SZ(-4.6)) * g.nx + g.ix(0))) bad.push(`${tag}: the boss's mark off the floor`);
        // pits: no floor inside them except the bridges; with a river across (bridge), the bridge joins both banks (reach covered it)
        for (const p of sp.pits) { const i = g.ix((p.x0 + p.x1) / 2), j = g.iz((p.z0 + p.z1) / 2); if (g.kind(i, j) !== PIT && !sp.bridges.some(b => (p.x0 + p.x1) / 2 > b.x0 && (p.x0 + p.x1) / 2 < b.x1)) bad.push(`${tag}: pit middle is ${g.kind(i, j)}`); }
        // cover and props stand on the floor, clear of the pits by their size
        for (const c of plan.covers) if (!g.clear(c.x, c.z, Math.max(c.hx, c.hz) + 0.2)) bad.push(`${tag}: cover ${c.kind} @(${c.x}, ${c.z}) off the floor`);
        for (const p of plan.props) if (g.at(p.x, p.z) !== FLOOR) bad.push(`${tag}: prop ${p.kind} @(${p.x}, ${p.z}) off the floor`);
        // spawn points: 30 random tries find a spot 0.7 m clear that walks to the hero
        let ok = 0; for (let t = 0; t < 30; t++) { const x = PLAY.x0 + 1.5 + ((t * 7919 + seed) % 997) / 997 * (PLAY.x1 - PLAY.x0 - 3), z = PLAY.z0 + 1.5 + ((t * 104729 + seed) % 991) / 991 * (PLAY.z1 - PLAY.z0 - 4); if (g.clear(x, z, 0.7) && g.steps(x, z, ex0, SZ(5.0)) >= 0) ok++; }
        if (ok < 10) bad.push(`${tag}: only ${ok}/30 spawn tries usable`);
        // the walls: some, and every run has length
        const runs = outline(g); if (!runs.length) bad.push(`${tag}: no walls`);
      }
      expect(bad.slice(0, 12)).toEqual([]);
    });
  }
  it('the grid holds the hero at a pit\'s edge and lets a thrown foe in', () => {
    setStage(true, SHAPE_K.pond); const sp = makeShape('pond', 7, { pit: 'water' }), g = new FloorGrid(sp), p = sp.pits[0];
    // a body just off the pit's near (+z) edge, pushed into it
    const hero = { x: (p.x0 + p.x1) / 2, z: p.z1 - 0.2 };
    const push = g.clamp(hero, 0.38, false);
    expect(push?.pit).toBe(true);
    expect(g.at(hero.x, hero.z)).toBe(FLOOR);
    expect(hero.z).toBeGreaterThanOrEqual(p.z1 + 0.37);
    const foe = { x: (p.x0 + p.x1) / 2, z: p.z1 - 0.2 };
    g.clamp(foe, 0.4, true);
    expect(g.pitAt(foe.x, foe.z)).toBe('water');
  });
  it('the way round goes round a walled-off block, not into it', () => {
    setStage(true, SHAPE_K.cloister); const sp = makeShape('cloister', 3), g = new FloorGrid(sp), b = sp.solid[0];
    // in front of the block, the hero behind it
    const fx = (b.x0 + b.x1) / 2, fz = b.z1 + 1.2, hx = fx, hz = b.z0 - 1.2;
    expect(g.lineOpen(fx, fz, hx, hz, 0.4)).toBe(false);
    const w = g.way(fx, fz, hx, hz, 0.4)!; expect(w).not.toBeNull();
    // the first step goes sideways (round a corner), not straight at the block
    expect(Math.abs(w[0])).toBeGreaterThan(0.3);
    // walk it: follow the way for 20 s at 3 m/s, never inside the block, and arrive
    let x = fx, z = fz; for (let i = 0; i < 400 && Math.hypot(x - hx, z - hz) > 0.6; i++) { const d = g.way(x, z, hx, hz, 0.4) ?? (([a, c]) => { const l = Math.hypot(a, c); return [a / l, c / l]; })([hx - x, hz - z]); x += d[0] * 0.15; z += d[1] * 0.15; const q = { x, z }; g.clamp(q, 0.4); x = q.x; z = q.z; expect(g.at(x, z)).not.toBe(OUT); }
    expect(Math.hypot(x - hx, z - hz)).toBeLessThan(0.8);
  });
  it('the way round also goes round a blocked cart on the floor, and still arrives', () => {
    setStage(true, SHAPE_K.cloister); const sp = makeShape('cloister', 3), g = new FloorGrid(sp), b = sp.solid[0];
    // a cart across the corridor beside the block, a man's width of floor left past it
    const lane = { x0: sp.box.x0 + 0.8, x1: b.x0 - 0.2, z0: b.z1 - 3.5, z1: b.z1 - 2.6 };
    g.block([lane]);
    const fx = (b.x0 + b.x1) / 2, fz = b.z1 + 1.2, hx = fx, hz = b.z0 - 1.2;
    let x = fx, z = fz, inCart = 0;
    for (let i = 0; i < 500 && Math.hypot(x - hx, z - hz) > 0.6; i++) { const d = g.way(x, z, hx, hz, 0.4) ?? (([a, c]) => { const l = Math.hypot(a, c); return [a / l, c / l]; })([hx - x, hz - z]); x += d[0] * 0.15; z += d[1] * 0.15; const q = { x, z }; g.clamp(q, 0.4); x = q.x; z = q.z; if (x > lane.x0 && x < lane.x1 && z > lane.z0 && z < lane.z1) inCart++; }
    expect(Math.hypot(x - hx, z - hz)).toBeLessThan(0.8);
    expect(inCart).toBe(0);
  });
  it('a fight room picks among its shapes, never the last two again; boss and calm rooms stay square', () => {
    const list: ShapeId[] = ['ell', 'cloister', 'neck', 'bridge', 'pond'], got: ShapeId[] = [];
    for (let i = 0; i < 12; i++) { const s = pickShape(list, 'fight', 50 + i * 13, got); expect(got.slice(-2)).not.toContain(s); got.push(s); }
    expect(new Set(got).size).toBeGreaterThanOrEqual(4);
    expect(pickShape(list, 'boss', 1, [])).toBe('square'); expect(pickShape(list, 'calm', 1, [])).toBe('square'); expect(pickShape(undefined, 'fight', 1, [])).toBe('square');
  });
});
