// The cut button: a tap is decided at the release (held < TUNE.holdToCharge), a hold is not a tap (it is the 居合 stance) — act-12.
// The ground warnings: who stands inside a 劈 / 扑 / 砸 / 箭 shape (the 见切 check and the hits use it).
import { describe, it, expect } from 'vitest';
import { createMinigamePlatform, type PxPointer } from 'pxui/platform/index.js';
import { Input } from '../src/present/act/input';
import { TUNE } from '../src/present/act/tune';
import { inside, HOT } from '../src/present/act/tele';
import { slashArc } from '../src/present/act/slashArc';
import { damageFoe, canStrike, isRangedFoe, updateFoe, elitePoise, EDEFS, POISE_BREAK_DUR, type Foe, type FoeWorld } from '../src/present/act/enemy';
import { archCounts, archTier, applyBoon, newPerks } from '../src/present/act/boons';
import { GRADE } from '../src/present/look/post';
import { buildHatFine } from '../src/present/act/heroineFine';
import { audio } from '../src/audio/audio';
import { cueLog } from '../src/audio/cues';
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
  it('slashArc uses blade-tip-glued world-axis-aligned 3D voxel cubes (no solid outline / smoothstep / derivatives)', () => {
    const src = SRC['src/present/act/slashArc.ts'].replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\bdFd[xy]\b|\bfwidth\b|\btexelFetch\b|\bsmoothstep\b/);
    expect(src).toContain('transparent: true');
    expect(src).toContain('depthWrite: false');
    slashArc.bladeStep(V3(0, 0.9, 0.2), V3(0.8, 0.9, 0.8), V3(0, 0.9, 0.2), V3(-0.8, 0.9, 0.8), 'k1');
    slashArc.bladeStep(V3(0, 0.9, 0.2), V3(0, 0.9, 1.0), V3(0, 0.9, 0.4), V3(0, 0.9, 1.6), 'k4');
    slashArc.swing({ kind: 'k1', from: V3(0, 0, 0), yaw: 0, range: 2, half: 1.0, counter: true });
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

describe('combat wave 2: poise break & staggered cadence (act-113)', () => {
  const fakeActor = () => ({ hit: () => {}, hurt: () => {}, play: () => {}, tint: () => {}, chest: () => V3(0, 1, 0), head: () => V3(0, 1.7, 0) }) as unknown as Foe['a'];
  const fakeFoe = (over: Partial<Foe>): Foe => ({
    kind: 'hj_brute', d: { model: 'hj_brute', hp: 120, r: 0.7, speed: 2, mass: 2.6, poise: 34, gold: 8, name: '黄巾力士', role: 'brute' },
    a: fakeActor(), hp: 120, maxHp: 120, pos: V3(0, 0, 0), vel: V3(), yaw: 0, st: 'windup', t: 0.2, dur: 0.9, tele: null, teleYaw: 0, telePos: V3(), shape: null, dmg: 12,
    cd: 0, poise: 34, brokenT: 0, poiseIdleT: 0, attacking: true, hitHero: false, lunge: null, strafe: 1, move: '', lastDmg: 0, uid: 1,
    bleed: 0, bleedT: 0, bleedTick: 0, bleedDrop: 0, sunderT: 0, wob: { x: 0, z: 0, vx: 0, vz: 0 }, elite: false, role: 'brute', atk: 'slam', combo: 0, extra: [], inv: 0, phase: 1, summonT: 3, thunderCd: 3, auraT: 0, mem: {},
    ...over,
  });

  it('depleting poise triggers guard-break vulnerability window and interrupts attack', () => {
    const brute = fakeFoe({});
    damageFoe(brute, 10, V3(0, 0, -2), { poiseDmg: 18, quiet: true });
    expect(brute.poise).toBe(16);
    expect(brute.brokenT).toBe(0);
    expect(brute.st).toBe('windup');
    damageFoe(brute, 10, V3(0, 0, -2), { poiseDmg: 20, quiet: true });
    expect(brute.poise).toBe(0);
    expect(brute.brokenT).toBeCloseTo(POISE_BREAK_DUR, 5);
    expect(brute.st).toBe('stagger');
    expect(brute.attacking).toBe(false);
  });

  it('ranged and melee foes have independent attacker budgets so an aiming archer does not freeze melee', () => {
    const archer = fakeFoe({ kind: 'hj_archer', role: 'archer', attacking: true, d: { model: 'hj_archer', hp: 28, r: 0.44, speed: 2.6, mass: 0.9, poise: 0, gold: 3, name: '黄巾弓手', role: 'archer' } });
    const blade = fakeFoe({ kind: 'hj_blade', role: 'blade', attacking: false, st: 'move', cd: 0, d: { model: 'hj_blade', hp: 40, r: 0.44, speed: 2.8, mass: 1, poise: 0, gold: 3, name: '黄巾刀手', role: 'blade' } });
    const archer2 = fakeFoe({ kind: 'hj_archer', role: 'archer', attacking: false, st: 'move', cd: 0, d: archer.d });
    const w = { heroAlive: true, foes: [archer, blade, archer2] } as unknown as FoeWorld;
    expect(isRangedFoe(archer)).toBe(true);
    expect(isRangedFoe(blade)).toBe(false);
    // archer is occupying the ranged slot -> melee blade can STILL strike, while a second archer waits
    expect(canStrike(blade, w, { calm: true, slots: 1 })).toBe(true);
    expect(canStrike(archer2, w, { calm: true, slots: 1 })).toBe(false);
  });

  it('boss phase 2 transitions cleanly at half HP and chains sweep into a low thunder-slam with recovery window (act-114)', () => {
    const boss = fakeFoe({
      kind: 'hj_boss', role: 'boss', hp: 200, maxHp: 420, poise: 0, brokenT: 1.4, phase: 1, st: 'move', attacking: false,
      d: { model: 'hj_boss', hp: 420, r: 0.85, speed: 2.0, mass: 3.6, poise: 64, gold: 40, name: '黄巾渠帅', role: 'boss', boss: true },
      a: { pos: V3(), yaw: 0, act: null, hit: () => {}, play: () => {}, setRunning: () => {}, roar: () => {}, tint: () => {}, chest: () => V3(0, 1, 0), weapon: () => V3(0, 1, 0), head: () => V3(0, 2, 0), die: () => {} } as unknown as Foe['a'],
    });
    const w = {
      heroPos: V3(0, 0, -2), heroR: 0.38, heroAlive: true, heroY: 0, heroDodge: false,
      foes: [boss], arrows: [], clamp: () => {}, hurtHero: () => {}, dodged: () => {},
    } as unknown as FoeWorld;
    const before = cueLog.length;
    updateFoe(boss, w, 0.05);
    expect(boss.phase).toBe(2);
    expect(boss.st).toBe('roar');
    expect(boss.brokenT).toBe(0);
    expect(boss.poise).toBe(64);
    expect(cueLog.slice(before).some(c => c.name === 'thunder')).toBe(true);

    // Phase 2 close-range sweep sets combo = 1 and chains into a jumpable thunder slam
    boss.st = 'move'; boss.inv = 0; boss.cd = 0; boss.thunderCd = 9; boss.t = 0; boss.dur = 1;
    updateFoe(boss, w, 0.05);
    expect(boss.st).toBe('windup');
    expect(boss.atk).toBe('sweep');
    expect(boss.combo).toBe(1);
    // Finish sweep strike -> chains directly into low thunder slam
    boss.st = 'strike'; boss.t = 0.2; boss.dur = 0.18;
    updateFoe(boss, w, 0.02);
    expect(boss.st).toBe('windup');
    expect(boss.atk).toBe('slam');
    expect(boss.lowAtk).toBe(true);
    expect(boss.combo).toBe(0);
    // Finish slam -> enters readable 0.95s punish recovery
    boss.st = 'strike'; boss.t = 0.2; boss.dur = 0.18;
    updateFoe(boss, w, 0.02);
    expect(boss.st).toBe('recover');
    expect(boss.dur).toBeCloseTo(0.95, 2);
  });

  it('combat & build overhaul invariants (act-118): universal elite poise, unified 0.26s parry beat, 4 build archetypes', () => {
    expect(HOT).toBeCloseTo(0.26, 2);
    expect(TUNE.maxAttackers).toBeGreaterThanOrEqual(2);
    expect(elitePoise(EDEFS.hj_blade, 'hj_blade')).toBeGreaterThanOrEqual(28);
    expect(elitePoise(EDEFS.hj_archer, 'hj_archer')).toBeGreaterThanOrEqual(20);
    expect(elitePoise(EDEFS.hj_brute, 'hj_brute')).toBeGreaterThan(EDEFS.hj_brute.poise);

    const p = newPerks();
    applyBoon(p, 'bleed', 0);
    expect(archTier(p, 'blood')).toBe(0);
    applyBoon(p, 'behead', 1);
    expect(archCounts(p).blood).toBe(2);
    expect(archTier(p, 'blood')).toBe(2);
    applyBoon(p, 'drink', 2);
    expect(archTier(p, 'blood')).toBe(3);
  });

  it('onboarding & QTE readability invariants (act-125): generous QTE windows for ult, clash, and chain parry', () => {
    expect(TUNE.qteTime).toBeGreaterThanOrEqual(1.4);
    expect(TUNE.clashTime).toBeGreaterThanOrEqual(2.5);
    expect(TUNE.chainWin).toBeGreaterThanOrEqual(0.18);
    expect(TUNE.clashPush).toBeGreaterThanOrEqual(0.14);
  });

  it('console polish invariants (act-126): conical hat default with full under-hat hair crown, shader bloodVig, and zombie-voice audio recovery', () => {
    expect(SRC['src/present/act/ironUi.ts']).toContain("HP_FACE = { id: 'fine_hat' }");
    expect(SRC['src/present/act/show.ts']).toContain("DEFAULT_HERO = 'fine_hat'");
    expect(GRADE.bloodVig).toBe(0);
    // Conical hat model must have full sculpted white hair dome at y=53..57 on bone 'head' so removing hat while healing has no cut-off top
    const v = buildHatFine();
    expect(v.get(0, 53, 0)?.part).toBe('head');
    expect(v.get(0, 54, 0)?.part).toBe('head');
    expect(v.get(0, 55, 0)?.part).toBe('head');
    expect(v.get(0, 56, 0)?.part).toBe('head');
    expect(v.get(0, 57, 0)?.part).toBe('head');
    expect(v.get(0, 60, 0)?.part).toBe('hat');
    // Audio recover() must prune expired zombie voices whose onended was dropped during OS suspension
    const eng = audio as unknown as {
      ctx: { state: string; currentTime: number; resume: () => Promise<void> } | null;
      live: Array<{ src: unknown; pri: number; t: number; endAt: number }>;
      duck: { gain: { cancelScheduledValues: () => void; setValueAtTime: () => void } };
      hush: { gain: { cancelScheduledValues: () => void; setValueAtTime: () => void } };
      musicHush: { gain: { cancelScheduledValues: () => void; setValueAtTime: () => void } };
      music: { gain: { cancelScheduledValues: () => void; setValueAtTime: () => void } };
    };
    const prevCtx = eng.ctx;
    const noopGain = { gain: { cancelScheduledValues: () => {}, setValueAtTime: () => {} } };
    eng.ctx = { state: 'running', currentTime: 100, resume: async () => {} };
    eng.duck = noopGain; eng.hush = noopGain; eng.musicHush = noopGain; eng.music = noopGain;
    eng.live.push({ src: {}, pri: 3, t: 10, endAt: 11 }, { src: {}, pri: 3, t: 99, endAt: 105 });
    audio.recover();
    expect(eng.live.length).toBe(1);
    expect(eng.live[0].endAt).toBe(105);
    eng.live.length = 0;
    eng.ctx = prevCtx;
  });

  it('act-127 invariants: prologue boss never vanishes, Chinese terminology (识破), opening bandit pronoun (他) + 2nd sentry, prologue checkpoints', () => {
    expect(SRC['src/present/act/show.ts']).toContain("popPix('识破'");
    expect(SRC['src/present/act/show.ts']).not.toContain("popPix('见切'");
    expect(SRC['src/present/act/show.ts']).toContain('revealFoe(boss)');
    expect(SRC['src/present/act/show.ts']).toContain("profile().proStage = 'boss'");
    expect(SRC['src/present/act/show.ts']).toContain("profile().proStage = 'wake'");
    expect(SRC['src/present/act/show.ts']).toContain("profile().proStage = 'done'");
    expect(SRC['src/present/act/show.ts']).toContain('resumePrologueBoss');
    expect(SRC['src/present/act/scripts.ts']).toContain('摸他怀里！肯定藏着干粮！');
    expect(SRC['src/present/act/scripts.ts']).not.toContain('摸她怀里！肯定藏着干粮！');
    expect(SRC['src/present/act/scripts.ts']).toContain("L('sentry2'");
    expect(SRC['src/present/act/dialogue.ts']).toContain('resolvePortrait');
    expect(SRC['src/present/act/dialogue.ts']).toContain('sentry2:');
    expect(SRC['src/present/act/title.ts']).toContain("h.id === 'fine_hat'");
  });

  it('act-128 invariants: modal dim, scroll unroll + 3D reroll plaque, hideout outer corridor + GateGlow, rich weather/time variety, 3D merchant + voice, hurt_breath loop', async () => {
    const { UI_LOOK, uiSceneUniforms, updateUiSceneUniforms } = await import('../src/present/look/uiLook');
    const u = uiSceneUniforms();
    UI_LOOK.modalDim = 1;
    updateUiSceneUniforms(u, true);
    expect(u.uUiModalDim.value).toBe(1);
    UI_LOOK.modalDim = 0;
    updateUiSceneUniforms(u, true);
    expect(u.uUiModalDim.value).toBe(0);

    // Bamboo scroll unroll & 3D iron reroll plaque invariants
    expect(SRC['src/present/act/cardBoard.ts']).toContain('scrollAnim = { body, topRoller, botRoller, halfH }');
    expect(SRC['src/present/act/cardBoard.ts']).toContain('export function rerollPlaque()');
    expect(SRC['src/present/act/cards3d.ts']).toContain('sa.topRoller.rotation.x');
    expect(SRC['src/present/act/cards3d.ts']).toContain('rerollPlaque()');
    expect(SRC['src/present/act/show.ts']).toContain('UI_LOOK.modalDim');
    expect(SRC['src/present/act/show.ts']).toContain('new GateGlow(');
    expect(SRC['src/present/act/show.ts']).toContain("sayMerchant('greet')");
    expect(SRC['src/present/act/show.ts']).toContain("sayMerchant('buy')");
    expect(SRC['src/present/act/prologue.ts']).toContain('setHurtBreath(true)');
    expect(SRC['src/present/act/prologue.ts']).toContain('setHurtBreath(false)');

    const { HIDEOUT } = await import('../src/present/act/hideout');
    expect(HIDEOUT.exit.z).toBeGreaterThanOrEqual(9.0);
    expect(HIDEOUT.floor.z1).toBeGreaterThanOrEqual(10.0);

    const { TIMES, WEATHER_OF, pickSpec } = await import('../src/present/asm/pick');
    const { moodFor, weatherAmbient, lampFor } = await import('../src/present/asm/sky');
    expect(TIMES.length).toBeGreaterThanOrEqual(6);
    expect(WEATHER_OF.autumn).toContain('storm');
    expect(WEATHER_OF.autumn).toContain('embers');
    for (const tm of TIMES) {
      expect(moodFor(tm, 'autumn', 'storm').sky).toBe(true);
      expect(lampFor(tm, 'storm')).toBeGreaterThan(0);
    }
    expect(weatherAmbient('storm', 'autumn', 'overcast', true).some(a => a.kind === 'storm')).toBe(true);
    expect(weatherAmbient('embers', 'autumn', 'sunset', true).some(a => a.kind === 'embers')).toBe(true);

    // Check pickSpec consecutive variety
    const { HANMO_LOCALES } = await import('../src/present/asm/hanmo');
    const { LAYOUTS } = await import('../src/present/asm/layouts');
    const recent: ReturnType<typeof pickSpec>[] = [];
    for (let i = 0; i < 6; i++) {
      const sp = pickSpec(100 + i * 37, HANMO_LOCALES, LAYOUTS, recent, { season: 'autumn' });
      if (recent.length) expect(sp.time).not.toBe(recent[recent.length - 1].time);
      recent.push(sp);
    }
    expect(new Set(recent.map(s => s.time)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(recent.map(s => s.weather)).size).toBeGreaterThanOrEqual(3);

    // 3D traveling merchant actor builds & updates cleanly without NaN
    const { HIDEOUT_MERCHANT } = await import('../src/present/act/hideout_people');
    const { BattleActor } = await import('../src/present/bestiary/battle');
    const merchant = new BattleActor(HIDEOUT_MERCHANT);
    merchant.update(0.5);
    expect(merchant.height).toBeGreaterThan(1.5);
    merchant.dispose();
    expect(SRC['src/present/act/stations.ts']).toContain('new BattleActor(HIDEOUT_MERCHANT)');
    expect(SRC['src/present/act/stations.ts']).toContain('track.position.set');

    // All new Breeze TTS 2 voice clips exist and are bundled via voice.ts
    const { hasVoiceAsset } = await import('../src/audio/voice');
    for (const rel of [
      'jiangjin/pro_wake_2.mp3',
      'jiangjin/hurt_breath.mp3',
      'merchant/greet_0.mp3',
      'merchant/greet_1.mp3',
      'merchant/buy_0.mp3',
      'merchant/buy_1.mp3',
    ]) {
      expect(hasVoiceAsset(rel), rel).toBe(true);
    }
  });
});
