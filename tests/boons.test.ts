import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { BOONS, TIER_NAMES, applyBoon, boonTag, drawBoons, newPerks, upgradeBoon } from '../src/present/act/boons';
import { addChill } from '../src/present/act/chill';
import FONT from '../ui/font.js';

// Only rendering/audio are stubbed: school logic, damage and enemy movement run normally.
vi.mock('../src/present/fx/fx', () => ({ trailSeg: vi.fn(), fxRing: vi.fn(), fxSparks: vi.fn(), fxSmoke: vi.fn() }));
vi.mock('../src/present/fx/skillFx', () => ({ fxAfterimage: vi.fn() }));
vi.mock('../src/present/fx/blocks', () => ({ addBlock: vi.fn((p, o) => ({ p: p.clone(), age: 0, life: o.life, ...o })) }));
vi.mock('../src/present/bestiary/battle', () => ({ BattleActor: class {} }));
vi.mock('../src/present/ronin/models', () => ({}));
vi.mock('../src/audio/cues', () => ({ cue: vi.fn() }));
import { damageFoe, updateFoe, type Foe, type FoeWorld } from '../src/present/act/enemy';
import { Schools } from '../src/present/act/schools';
import { addBlock } from '../src/present/fx/blocks';
import { trailSeg } from '../src/present/fx/fx';

describe('boon data and tiers', () => {
  it.each(['tp', 'jd', 'sr', 'any'] as const)('draws distinct choices from %s', pool => {
    const draws = drawBoons(pool, 3, () => 0.4, newPerks());
    expect(draws).toHaveLength(3);
    expect(new Set(draws.map(x => x.boon.id)).size).toBe(3);
    expect(draws.every(x => pool === 'any' || x.boon.school === pool)).toBe(true);
  });
  it('exhausts unowned choices before falling back, without duplicates or stale run ownership', () => {
    const p = newPerks(), pool = BOONS.filter(b => b.school === 'tp');
    pool.slice(0, 7).forEach(b => applyBoon(p, b.id));
    const draws = drawBoons('tp', 30, () => 0, p);
    expect(draws).toHaveLength(8); expect(draws[0].boon.id).toBe(pool[7].id);
    expect(new Set(draws.map(x => x.boon.id)).size).toBe(8);
    expect(drawBoons('tp', 1, () => 0, newPerks())[0].boon.id).toBe(pool[0].id);
    expect(drawBoons('any', 0, Math.random, p)).toEqual([]);
  });
  it.each([[0.69, 0], [0.7, 1], [0.949, 1], [0.95, 2], [0.999, 2]])('roll %s gives tier %s', (roll, tier) => {
    expect(drawBoons('jd', 1, () => roll, newPerks())[0].tier).toBe(tier);
  });
  it('supports custom tier weights', () => {
    expect(drawBoons('any', 3, () => 0.5, newPerks(), [0, 0, 1]).every(x => x.tier === 2)).toBe(true);
    expect(drawBoons('any', 1, () => 0.5, newPerks(), [0, 0, 0])[0].tier).toBe(0);
  });
  it('records ordinary ownership too, upgrades twice and never downgrades on fallback picks', () => {
    const p = newPerks(); applyBoon(p, 'tp_bolt');
    expect(p.owned.tp_bolt).toBe(0);
    expect(upgradeBoon(p, 'tp_bolt')).toBe(true); expect(p.owned.tp_bolt).toBe(1);
    expect(upgradeBoon(p, 'tp_bolt')).toBe(true); expect(p.owned.tp_bolt).toBe(2);
    expect(upgradeBoon(p, 'tp_bolt')).toBe(false); expect(upgradeBoon(p, 'jd_chill')).toBe(false);
    applyBoon(p, 'tp_bolt', 0); expect(p.owned.tp_bolt).toBe(2);
    applyBoon(p, 'jd_chill', 1); expect(p.owned.jd_chill).toBe(1);
    applyBoon(p, 'unknown', 2); expect(p.owned.unknown).toBeUndefined();
  });
  it('preserves all eight legacy effects; sharpening is not another hp pickup', () => {
    const p = newPerks(); BOONS.filter(b => b.school === 'sr').forEach(b => applyBoon(p, b.id, 1));
    expect(p).toMatchObject({ burn: true, dashCut: 10, darts3: true, killHeal: 4, relFreeze: true, dashEdge: true, bladeWind: true, hpUp: 25 });
    expect(Object.keys(p.owned)).toHaveLength(8);
    upgradeBoon(p, 'hpUp'); expect(p.hpUp).toBe(25);
  });
  it('keeps short editable copy and every displayed character in the existing font atlas', () => {
    expect(BOONS).toHaveLength(24); expect(new Set(BOONS.map(b => b.id)).size).toBe(24);
    for (const school of ['tp', 'jd', 'sr']) expect(BOONS.filter(b => b.school === school)).toHaveLength(8);
    const chars = new Set((FONT as { chars: string }).chars);
    for (const b of BOONS) {
      expect(b.desc).toHaveLength(2);
      for (const line of b.desc) { expect([...line].length).toBeLessThanOrEqual(11); expect(line).not.toMatch(/[+×=%]/); }
      for (const c of b.name + b.desc.join('') + boonTag(b, 2)) expect(chars.has(c), `missing ${c}`).toBe(true);
    }
    expect(TIER_NAMES).toEqual(['普通', '精良', '传说']);
    expect(boonTag(BOONS[0], 0)).toBe('普通'); expect(boonTag(BOONS[8], 1)).toBe('太平道 · 精良');
  });
});

describe('pure chill rule', () => {
  it.each([[0, 4, 1.2], [1, 3, 1.5], [2, 3, 2]])('tier %s freezes at %s stacks for %s seconds', (tier, threshold, seconds) => {
    let state = { chill: 0, frozen: 0 };
    for (let i = 1; i < threshold; i++) { state = addChill(state, 1, tier); expect(state).toEqual({ chill: i, frozen: 0 }); }
    expect(addChill(state, 1, tier)).toEqual({ chill: 0, frozen: seconds });
  });
  it('works without 霜刃, does not mutate input, resets overflow, and preserves a longer freeze', () => {
    const state = { chill: 3, frozen: 3 };
    expect(addChill(state, 2)).toEqual({ chill: 0, frozen: 3 });
    expect(state).toEqual({ chill: 3, frozen: 3 });
    expect(addChill({ chill: 0, frozen: 0 }, 4)).toEqual({ chill: 0, frozen: 1.2 });
  });
});

let uid = 0;
const v = (x = 0, z = 0) => new Vector3(x, 0, z);
function foe(x = 0, z = 0): Foe {
  const pos = v(x, z);
  return {
    uid: ++uid, kind: 'bandit', pos, vel: v(), hp: 100, maxHp: 100, st: 'move', t: 0, dur: 0, yaw: 0, cd: 10,
    d: { model: '', name: '', hp: 100, r: 0.4, speed: 2, mass: 1, poise: 0, gold: 0 },
    frozen: 0, chill: 0, slowT: 0, slowK: 0, burn: 0, burnT: 0, lastDmg: 0,
    tele: null, telePos: v(), teleYaw: 0, shape: null, dmg: 10, poise: 0, attacking: false, hitHero: false, lunge: null, strafe: 1, move: '',
    wob: { x: 0, z: 0, vx: 0, vz: 0 },
    a: { root: new Object3D(), chest: () => pos.clone().setY(1), tint: vi.fn(), hurt: vi.fn(), hit: vi.fn(), play: vi.fn(), setRunning: vi.fn() } as unknown as Foe['a'],
  };
}
function arena(foes: Foe[], boons: Array<[string, number]> = [], random = 0) {
  const perks = newPerks(), hero = v(); let intent = 0;
  boons.forEach(([id, tier]) => applyBoon(perks, id, tier));
  const hits: Array<{ f: Foe; dmg: number; kind: string }> = [];
  const s = new Schools({ perks: () => perks, foes: () => foes, heroPos: () => hero, intent: () => intent, heroTint: vi.fn(),
    hitFoe: (f, dmg, from, opts) => {
      const frozen = f.frozen > 0, d = Math.round(dmg * s.damageMul(f)); hits.push({ f, dmg: d, kind: opts.kind });
      const died = damageFoe(f, d, from, { knock: opts.knock, stagger: opts.stagger });
      s.onHit(f, frozen); if (died) s.onKill(f); s.onCutHit(f, from, opts.kind);
    },
  }, () => random);
  return { s, perks, hits, hero, intent: (n: number) => { intent = n; } };
}

beforeEach(() => vi.clearAllMocks());
describe('school combat events', () => {
  it.each([0, 1, 2])('tier %s finisher, iai and dodge use their own radii and damage', tier => {
    const close = foe(1), mid = foe(6), far = foe(9), a = arena([close, mid, far], [['tp_bolt', tier], ['tp_iai', tier], ['tp_orb', tier]]);
    a.s.onFinisher(v()); expect(a.hits.map(h => h.dmg)).toEqual([[14, 20, 28][tier]]);
    a.s.onIai(); expect(a.hits.slice(1).map(h => h.f)).toEqual([close, mid]);
    expect(a.hits.slice(1).every(h => h.dmg === [16, 24, 32][tier])).toBe(true);
    a.s.onPerfectDodge(v()); a.hero.set(20, 0, 20); a.s.update(0.59); expect(a.hits).toHaveLength(3);
    a.s.update(0.01); expect(a.hits[3]).toMatchObject({ f: close, dmg: [12, 18, 26][tier] });
    a.s.update(1); expect(a.hits).toHaveLength(4);
  });
  it.each([[0, 0.25], [1, 0.35], [2, 0.5]])('tier %s chain respects probability %s and never chains secondary hits', (tier, chance) => {
    const source = foe(), other = foe(3), far = foe(8);
    const a = arena([source, other, far], [['tp_chain', tier]], chance - 0.001);
    a.s.onCutHit(source, v(), 'k1'); expect(a.hits).toHaveLength(1); expect(a.hits[0]).toMatchObject({ f: other, dmg: 6, kind: 'school' });
    a.s.onCutHit(source, v(), 'dart'); a.s.onCutHit(source, v(), 'school'); expect(a.hits).toHaveLength(1);
    const miss = arena([source, other], [['tp_chain', tier]], chance); miss.s.onCutHit(source, v(), 'k1'); expect(miss.hits).toHaveLength(0);
  });
  it('雷步 is once per second even when a perfect dodge refreshes dash cooldown', () => {
    const f = foe(1), a = arena([f], [['tp_step', 2]]);
    a.s.onDashEnd(v()); a.s.onDashEnd(v()); a.s.update(0.99); a.s.onDashEnd(v()); expect(a.hits).toHaveLength(1);
    a.s.update(0.01); a.s.onDashEnd(v()); expect(a.hits.map(h => h.dmg)).toEqual([16, 16]);
  });
  it('引雷 is consumed by the next cut only and expires three seconds after the last dart', () => {
    const f = foe(), a = arena([f], [['tp_mark', 1]]);
    a.s.onDartHit(f); a.s.onCutHit(f, v(), 'wind'); expect(a.hits).toHaveLength(0);
    a.s.onCutHit(f, v(), 'rel'); a.s.onCutHit(f, v(), 'k1'); expect(a.hits.map(h => h.dmg)).toEqual([18]);
    a.s.onDartHit(f); a.s.update(2); a.s.onDartHit(f); a.s.update(2); a.s.onCutHit(f, v(), 'dcut'); expect(a.hits).toHaveLength(2);
    a.s.onDartHit(f); a.s.update(3); a.s.onCutHit(f, v(), 'k5'); expect(a.hits).toHaveLength(2);
  });
  it('雷鸣 adds current intent to cuts only and responds immediately to sharpening', () => {
    const f = foe(), a = arena([f], [['tp_intent', 0]]);
    expect(a.s.cutDamage(f, v(), 'k1')).toBe(0); a.intent(3);
    expect(a.s.cutDamage(f, v(), 'k1')).toBe(6); upgradeBoon(a.perks, 'tp_intent'); expect(a.s.cutDamage(f, v(), 'rel')).toBe(9);
    expect(a.s.cutDamage(f, v(), 'dart')).toBe(0); expect(a.s.cutDamage(f, v(), 'school')).toBe(0);
  });
  it('雷甲 requires an explicit melee attacker; 冰甲 protects subsequent hits and expires', () => {
    const f = foe(), a = arena([f], [['tp_armor', 2], ['jd_shell', 1]]);
    expect(a.s.takenMul()).toBe(1); a.s.onHeroHurt(); expect(a.hits).toHaveLength(0); expect(a.s.takenMul()).toBeCloseTo(0.55);
    a.s.onHeroHurt(f); expect(a.hits[0]).toMatchObject({ f, dmg: 22 });
    a.s.update(1.99); expect(a.s.takenMul()).toBeCloseTo(0.55); a.s.update(0.01); expect(a.s.takenMul()).toBe(1);
  });
  it('霜刃 counts cuts and 冰镖 slows for two seconds while adding chill without 霜刃', () => {
    const f = foe(), a = arena([f], [['jd_chill', 1], ['jd_dart', 2]]);
    a.s.onCutHit(f, v(), 'dart'); expect(f.chill).toBe(0);
    a.s.onCutHit(f, v(), 'k1'); a.s.onCutHit(f, v(), 'k2'); a.s.onDartHit(f);
    expect(f.frozen).toBe(1.5); expect(f.chill).toBe(0); expect(f.slowK).toBe(0.6);
    a.s.update(2); expect(f.slowK).toBe(0); expect(f.slowT).toBe(0);
    const g = foe(), b = arena([g], [['jd_dart', 0]]); for (let i = 0; i < 4; i++) b.s.onDartHit(g);
    expect(g.frozen).toBe(1.2); expect(g.slowK).toBe(0.4);
  });
  it('overlapping ice strips slow by half but apply only one chill every 0.8 seconds', () => {
    const on = foe(1, 0.49), off = foe(1, 0.51), a = arena([on, off], [['jd_trail', 0]]);
    a.s.onDashPath(v(), v(2)); a.s.onDashPath(v(), v(2)); a.s.update(0);
    expect(on.chill).toBe(1); expect(on.slowK).toBe(0.5); expect(off.chill).toBe(0);
    a.s.update(0.79); expect(on.chill).toBe(1); a.s.update(0.01); expect(on.chill).toBe(2);
    a.s.update(0.8); a.s.update(0.8); expect(on.frozen).toBe(1.2);
    a.s.update(0.6); expect(on.slowK).toBe(0); expect(on.slowT).toBe(0);
    expect(vi.mocked(addBlock).mock.calls.every(([, o]) => !o?.spin && !o?.rot)).toBe(true);
  });
  it('ice does not prolong the stronger dart slow, and leaving ice removes its slow', () => {
    const f = foe(1), a = arena([f], [['jd_trail', 0], ['jd_dart', 2]]);
    a.s.onDashPath(v(), v(2)); a.s.onDartHit(f); a.s.update(1.9); expect(f.slowK).toBe(0.6);
    a.s.update(0.1); expect(f.slowK).toBe(0.5); f.pos.z = 1; a.s.update(0.01); expect(f.slowK).toBe(0);
  });
  it.each([0, 1, 2])('tier %s 寒潮 and 寒心 use separate ranges and frost values', tier => {
    const near = foe(2), mid = foe(4), far = foe(6), a = arena([near, mid, far], [['jd_iai', tier], ['jd_still', tier]]);
    a.s.onPerfectDodge(v()); expect(near.chill).toBe(tier + 1); expect(mid.chill).toBe(0);
    a.s.onIai(); expect(near.frozen).toBe([1, 1.4, 1.8][tier]); expect(mid.frozen).toBe(near.frozen); expect(far.frozen).toBe(0);
  });
  it.each([0, 1, 2])('tier %s 碎冰 consumes freeze on a surviving hit', tier => {
    const f = foe(), a = arena([f], [['jd_shatter', tier]]); f.frozen = 2;
    expect(a.s.damageMul(f)).toBe(1 + [0.6, 1, 1.5][tier]);
    a.s.onHit(f, true); expect(f.frozen).toBe(0); expect(a.s.damageMul(f)).toBe(1);
  });
  it('a lethal shatter still bursts, and frozen chain deaths are processed once', () => {
    const first = foe(), next = foe(1), survivor = foe(2), far = foe(6);
    const a = arena([first, next, survivor, far], [['jd_shatter', 2], ['jd_burst', 1]]);
    first.st = 'dead'; first.frozen = 2; next.frozen = 1; next.hp = 20;
    a.s.onHit(first, true); a.s.onKill(first); a.s.onKill(first);
    expect(next.st).toBe('dead'); expect(a.hits.filter(h => h.f === next)).toHaveLength(1);
    expect(survivor.hp).toBe(80); expect(survivor.frozen).toBe(1.2); expect(far.hp).toBe(100);
  });
  it('ordinary frozen deaths release their pose, and a lethal cut still spends its lightning mark', () => {
    const f = foe(), a = arena([f], [['tp_mark', 0]]);
    a.s.onDartHit(f); f.st = 'dead'; f.frozen = 1;
    a.s.onKill(f); expect(f.frozen).toBe(0);
    a.s.onCutHit(f, v(), 'k1'); expect(a.hits).toHaveLength(0); // no second damage/death on the corpse
    expect(trailSeg).toHaveBeenCalledTimes(4); // the mark still emits its bolt at the impact
    a.s.onCutHit(f, v(), 'k2'); expect(trailSeg).toHaveBeenCalledTimes(4);
  });
  it('reset removes delayed orbs, marks, strips, shell and cooldowns between rooms/runs', () => {
    const f = foe(1), a = arena([f], [['tp_orb', 0], ['tp_mark', 0], ['jd_trail', 0], ['jd_shell', 0], ['tp_step', 0]]);
    a.s.onPerfectDodge(v()); a.s.onDartHit(f); a.s.onDashPath(v(), v(2)); a.s.onHeroHurt(); a.s.onDashEnd(v());
    a.s.reset(); a.hits.length = 0; a.s.update(1); a.s.onCutHit(f, v(), 'k1');
    expect(a.hits).toHaveLength(0); expect(f.slowK).toBe(0); expect(a.s.takenMul()).toBe(1);
    a.s.onDashEnd(v()); expect(a.hits).toHaveLength(1);
  });
});

function foeWorld(foes: Foe[]): FoeWorld {
  return { foes, heroPos: v(0, 10), heroR: 0.38, heroY: 0, heroAlive: true, heroDodge: false, arrows: [],
    hurtHero: vi.fn(), killFoe: vi.fn(), dodged: vi.fn(), arrowHit: vi.fn(), clamp: vi.fn() };
}
describe('enemy status integration', () => {
  it('freezing pauses position, attack clock and cooldown, and expires on dummies too', () => {
    const f = foe(), w = foeWorld([f]); f.st = 'windup'; f.t = 0.4; f.dur = 0.5; f.frozen = 1; f.vel.set(10, 0, 0);
    updateFoe(f, w, 0.5); expect(f.pos.x).toBe(0); expect(f.t).toBe(0.4); expect(f.cd).toBe(10); expect(w.hurtHero).not.toHaveBeenCalled();
    expect(f.frozen).toBe(0.5); f.kind = 'dummy'; updateFoe(f, w, 0.5); expect(f.frozen).toBe(0);
  });
  it('slows movement and lunges without slowing attack clocks', () => {
    const normal = foe(), slow = foe(); normal.vel.set(2, 0, 0); slow.vel.copy(normal.vel);
    normal.st = slow.st = 'strike'; normal.dur = slow.dur = 10; slow.slowT = 2; slow.slowK = 0.6;
    normal.lunge = v(10); slow.lunge = v(10);
    updateFoe(normal, foeWorld([normal]), 0.1); updateFoe(slow, foeWorld([slow]), 0.1);
    expect(slow.pos.x).toBeCloseTo(normal.pos.x * 0.4); expect(slow.t).toBe(normal.t);
  });
  it('a lethal burning tick on ice goes through the kill hook exactly once', () => {
    const f = foe(), w = foeWorld([f]); f.burn = 1; f.burnT = 0; f.hp = 3; f.frozen = 1;
    updateFoe(f, w, 0.1); updateFoe(f, w, 0.1);
    expect(f.st).toBe('dead'); expect(f.frozen).toBe(1); expect(w.killFoe).toHaveBeenCalledTimes(1);
  });
  it('melee hits carry the actual attacker', () => {
    const f = foe(), w = foeWorld([f]); f.st = 'strike'; f.dur = 1; f.lunge = v(10); w.heroPos.copy(f.pos);
    updateFoe(f, w, 0.01); expect(w.hurtHero).toHaveBeenCalledWith(10, expect.any(Vector3), f);
  });
});
