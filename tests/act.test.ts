// The cut button: a tap is decided at the release (held < TUNE.holdToCharge), a hold is not a tap (it is the 居合 stance) — act-12.
// The ground warnings: who stands inside a 劈 / 扑 / 砸 / 箭 shape (the 见切 check and the hits use it).
import { describe, it, expect } from 'vitest';
import { createMinigamePlatform, type PxPointer } from 'pxui/platform/index.js';
import { Input } from '../src/present/act/input';
import { TUNE } from '../src/present/act/tune';
import { inside } from '../src/present/act/tele';
import { slashArc } from '../src/present/act/slashArc';
import { V3 } from '../src/present/engine/world';

/** every source file's text, keyed 'src/…' (vite's glob: no node types needed) */
const SRC = Object.fromEntries(Object.entries(import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>).map(([k, v]) => [k.slice(3), v]));   // '../src/…' → 'src/…'
/** a relative import resolved: 'src/a/b.ts' + '../c/d' → 'src/a/c/d' */
const join = (from: string, spec: string) => { const parts = from.split('/').slice(0, -1); for (const s of spec.split('/')) { if (s === '..') parts.pop(); else if (s !== '.') parts.push(s); } return parts.join('/'); };

const run = (inp: Input, s: number, dt = 1 / 60) => { const out: Array<{ pressed: boolean; released: boolean; last: number }> = []; for (let t = 0; t < s; t += dt) { inp.frame(dt); const b = inp.b.attack; out.push({ pressed: b.pressed, released: b.released, last: b.last }); } return out; };

describe('the cut button', () => {
  it('a short press is released with its length (a tap)', () => {
    const inp = new Input(); inp.hold('attack', 0.08);
    const f = run(inp, 0.3), rel = f.find(x => x.released)!;
    expect(f.filter(x => x.pressed).length).toBe(1);
    expect(rel.last).toBeLessThan(TUNE.holdToCharge);
    expect(rel.last).toBeGreaterThan(0.05);
  });
  it('a long press is released held past the stance threshold (no tap)', () => {
    const inp = new Input(); inp.hold('attack', 0.6);
    const rel = run(inp, 1).find(x => x.released)!;
    expect(rel.last).toBeGreaterThanOrEqual(TUNE.holdToCharge);
  });
});

describe('ground warnings', () => {
  it('a cone in front catches what is in front, not behind', () => {
    const cone = { k: 'cone', r: 2.5, half: 0.6 } as const;
    expect(inside(cone, 0, 0, 0, 0, 2, 0.3)).toBe(true);
    expect(inside(cone, 0, 0, 0, 0, -2, 0.3)).toBe(false);
    expect(inside(cone, 0, 0, 0, 0, 3.2, 0.3)).toBe(false);
  });
  it('a lunge strip and a slam circle', () => {
    expect(inside({ k: 'rect', len: 4, w: 1 }, 0, 0, Math.PI / 2, 3, 0.2, 0.3)).toBe(true);
    expect(inside({ k: 'rect', len: 4, w: 1 }, 0, 0, Math.PI / 2, 3, 1.5, 0.3)).toBe(false);
    expect(inside({ k: 'circle', r: 1.5, ahead: 1 }, 0, 0, 0, 0, 2.2, 0.3)).toBe(true);
  });
});

// the foe models live in other modules that register themselves into the bestiary ROSTER on import; the slim entry once forgot
// one of those imports and every room threw "no model jp_bandit" (the models need a 2D canvas, so this checks the imports statically)
describe('models', () => {
  it('every foe model is defined in a module the game imports', () => {
    const read = (f: string) => SRC[f];
    const enemy = read('src/present/act/enemy.ts'), ids = [...enemy.matchAll(/model: '([a-z_]+)'/g)].map(m => m[1]);
    const files = Object.keys(SRC);
    // some module imports `f` (relative specifiers resolved against the importing file)
    // (comments and type-only imports don't run the module, so they don't count)
    const code = (g: string) => read(g).replace(/^\s*\/\/.*$/gm, '').replace(/^import type .*$/gm, '');
    const imported = (f: string) => files.some(g => g !== f && [...code(g).matchAll(/(?:from |import )'(\.[^']+)'/g)].some(m => join(g, m[1]) + '.ts' === f));
    expect(ids.length).toBeGreaterThanOrEqual(5);
    for (const id of ids) {
      const home = files.find(f => { const s = read(f); return s.includes(`id: '${id}'`) && s.includes('ROSTER'); });   // the module that registers it
      expect(home, id).toBeTruthy();
      expect(imported(home!), `${id} (${home}) is imported somewhere`).toBe(true);
    }
  });
});

describe('touch pointers (negative iOS identifiers)', () => {
  it('Input tracks stick drags with negative pointer IDs and clears on release', () => {
    for (const pid of [-1428193215, -1]) {
      const inp = new Input();
      inp.stick.r = 70;
      inp.stickDown(pid, 100, 300);
      inp.stickMove(pid, 160, 300);
      inp.frame(1 / 60);
      expect(Math.hypot(inp.move.x, inp.move.y)).toBeGreaterThan(0.3);
      expect(inp.move.x).toBeGreaterThan(0.8);
      inp.releaseAll(pid);
      inp.frame(1 / 60);
      expect(inp.stick.id).toBeNull();
      expect(inp.move).toEqual({ x: 0, y: 0 });
    }
  });

  it('Input keeps buttons held and dart aim dragging with negative pointer IDs', () => {
    for (const pid of [-1428193215, -1]) {
      const inp = new Input();
      inp.press('attack', pid);
      for (let i = 0; i < 16; i++) inp.frame(1 / 60);
      expect(inp.b.attack.down).toBe(true);
      expect(inp.b.attack.held).toBeGreaterThan(0.2);
      inp.releaseAll(pid);
      inp.frame(1 / 60);
      expect(inp.b.attack.down).toBe(false);
      expect(inp.b.attack.released).toBe(true);

      inp.press('special', pid);
      inp.aimBegin(pid, 700, 100, 700, 100);
      expect(inp.aimMove(pid, 740, 100)).toBe(true);
      const aim = inp.aimScreen();
      expect(aim).not.toBeNull();
      expect(aim!.x).toBeCloseTo(1, 5);
      expect(aim!.y).toBeCloseTo(0, 5);
      inp.releaseAll(pid);
    }
  });

  it('createMinigamePlatform normalizes negative identifiers and isolates multi-touch fingers', () => {
    const handlers: Record<string, Array<(e: any) => void>> = { start: [], move: [], end: [], cancel: [] };
    const api = {
      getSystemInfoSync: () => ({ windowWidth: 844, windowHeight: 390, pixelRatio: 2 }),
      onTouchStart: (fn: (e: any) => void) => handlers.start.push(fn),
      onTouchMove: (fn: (e: any) => void) => handlers.move.push(fn),
      onTouchEnd: (fn: (e: any) => void) => handlers.end.push(fn),
      onTouchCancel: (fn: (e: any) => void) => handlers.cancel.push(fn),
    };
    const emit = (kind: keyof typeof handlers, e: any) => { for (const fn of handlers[kind]) fn(e); };
    const p = createMinigamePlatform(api, 'wx');
    const seen: PxPointer[] = [];
    p.onPointer(ev => { seen.push(ev); });

    const stickRaw = -1428193215;
    const btnRaw = -1;
    emit('start', { changedTouches: [{ identifier: stickRaw, clientX: 110, clientY: 300 }], touches: [{ identifier: stickRaw, clientX: 110, clientY: 300 }] });
    emit('start', {
      changedTouches: [{ identifier: btnRaw, clientX: 720, clientY: 280 }],
      touches: [{ identifier: stickRaw, clientX: 110, clientY: 300 }, { identifier: btnRaw, clientX: 720, clientY: 280 }],
    });
    // Empty changedTouches on move should fall back to touches
    emit('move', {
      changedTouches: [],
      touches: [{ identifier: stickRaw, clientX: 180, clientY: 300 }, { identifier: btnRaw, clientX: 720, clientY: 280 }],
    });
    emit('end', { changedTouches: [{ identifier: btnRaw, clientX: 720, clientY: 280 }], touches: [{ identifier: stickRaw, clientX: 180, clientY: 300 }] });
    emit('end', { changedTouches: [{ identifier: stickRaw, clientX: 180, clientY: 300 }], touches: [] });

    expect(seen.length).toBe(6);
    for (const ev of seen) {
      expect(Number.isInteger(ev.id)).toBe(true);
      expect(ev.id).toBeGreaterThanOrEqual(0);
    }
    const stickDown = seen[0], btnDown = seen[1], stickMove = seen[2], btnMove = seen[3], btnUp = seen[4], stickUp = seen[5];
    expect(stickDown.id).not.toBe(btnDown.id);
    expect(stickMove.id).toBe(stickDown.id);
    expect(stickMove.x).toBe(180);
    expect(btnMove.id).toBe(btnDown.id);
    expect(btnUp.id).toBe(btnDown.id);
    expect(stickUp.id).toBe(stickDown.id);
  });
});

describe('combat feel polish (act-109)', () => {
  it('show.ts combat fxImpact calls disable duplicate hitstop/shake so feel() owns BEAT contrast', () => {
    const show = SRC['src/present/act/show.ts'];
    const calls = [...show.matchAll(/fxImpact\([^\n]+/g)].map(m => m[0]);
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const c of calls) {
      expect(c).toContain('stop: false');
      expect(c).toContain('shake: false');
    }
  });
  it('slashArc uses opaque 3D voxel blocks, pure WebGL1 (no derivatives/smoothstep), and updates cleanly', () => {
    const src = SRC['src/present/act/slashArc.ts'].replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\bdFd[xy]\b|\bfwidth\b|\btexelFetch\b|\bsmoothstep\b/);
    expect(src).toContain('transparent: false');
    expect(src).toContain('depthWrite: true');
    slashArc.swing({ kind: 'k1', from: V3(0, 0, 0), yaw: 0, range: 2, half: 1.0 });
    slashArc.swing({ kind: 'k3', from: V3(0, 0, 0), yaw: 0, range: 2.4, half: Math.PI });
    slashArc.swing({ kind: 'k4', from: V3(0, 0, 0), yaw: 0, range: 2.5, half: 0.3, n: 2 });
    slashArc.swing({ kind: 'k5', from: V3(0, 0, 0), yaw: 0, range: 2.3, half: 1.2 });
    slashArc.line({ a: V3(0, 0, 0), b: V3(0, 0, 5), width: 0.9, palette: 'iai' });
    slashArc.update(0.05);
    slashArc.update(0.5);
    slashArc.clear();
  });
  it('Input.frame(dt, true) freezes hold timer during hitstop so taps are not misread as 藏锋', () => {
    const inp = new Input();
    inp.press('attack', 1);
    inp.frame(0.05, false);
    expect(inp.b.attack.held).toBeCloseTo(0.05, 5);
    // during 0.4s of hitstop, held timer stays frozen below holdToCharge
    for (let i = 0; i < 24; i++) inp.frame(1 / 60, true);
    expect(inp.b.attack.held).toBeCloseTo(0.05, 5);
    inp.releaseAll(1);
    inp.frame(1 / 60, false);
    expect(inp.b.attack.released).toBe(true);
    expect(inp.b.attack.last).toBeLessThan(TUNE.holdToCharge);
  });
});
