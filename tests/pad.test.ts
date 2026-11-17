// 手柄（act-30 之后）：改键对调、死区重映射、手柄型号、键位表的读档。
import { describe, it, expect, beforeEach } from 'vitest';
import { BIND, DEFAULT_BINDS, rebind, resetBinds, familyOf, padName, keyName, glyphArt, loadBinds } from '../src/present/act/pad';
import { deadzone, Input } from '../src/present/act/input';

describe('rebind', () => {
  beforeEach(() => resetBinds());
  it('puts a free key on an action and drops the old one', () => {
    expect(rebind('key', 'attack', 'h')).toBe('ok');
    expect(BIND.key.attack[0]).toBe('h');
    expect(BIND.key.attack).not.toContain('j');
  });
  it('swaps when the key is another action\'s main key', () => {
    expect(rebind('pad', 'attack', 0)).toBe('ok');   // A was jump's
    expect(BIND.pad.attack[0]).toBe(0);
    expect(BIND.pad.jump[0]).toBe(2);                // jump takes X
  });
  it('a spare key is given up, the owner keeps its main key and other spares', () => {
    expect(rebind('pad', 'special', 5)).toBe('ok');  // RB was a spare of the dash
    expect(BIND.pad.special[0]).toBe(5);
    expect(BIND.pad.dash).toEqual([1, 7]);
  });
  it('keeps the action\'s own spares', () => {
    rebind('key', 'dash', 'o');
    expect(BIND.key.dash).toEqual(['o', 'shift']);
  });
  it('refuses walking / pause keys and the d-pad / Start', () => {
    for (const k of ['w', 'arrowleft', 'escape']) expect(rebind('key', 'jump', k)).toBe('reserved');
    for (const b of [9, 12, 15]) expect(rebind('pad', 'jump', b)).toBe('reserved');
    expect(BIND.key.jump).toEqual(DEFAULT_BINDS.key.jump); expect(BIND.pad.jump).toEqual(DEFAULT_BINDS.pad.jump);
  });
  it('the same key again changes nothing', () => { expect(rebind('key', 'attack', 'j')).toBe('same'); });
  it('every key stays on at most one action after a run of rebinds', () => {
    const keys = ['j', 'k', 'l', ' ', 'e', 'shift', 'h', 'q'], acts = ['attack', 'dash', 'jump', 'special'] as const;
    for (let i = 0; i < 40; i++) rebind('key', acts[(i * 7) % 4], keys[(i * 5) % keys.length]);
    const all = acts.flatMap(a => BIND.key[a]);
    expect(new Set(all).size).toBe(all.length);
    for (const a of acts) expect(BIND.key[a].length).toBeGreaterThan(0);
  });
  it('a stored table with a reserved key is ignored', () => {
    const store = new Map<string, string>(); const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    store.set('ub.bind', JSON.stringify({ key: { attack: ['w'], dash: ['o'] }, pad: { jump: [9], special: [6] } }));
    loadBinds();
    expect(BIND.key.attack).toEqual(['j']); expect(BIND.key.dash).toEqual(['o']); expect(BIND.pad.jump).toEqual([0]); expect(BIND.pad.special).toEqual([6]);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});

describe('sticks', () => {
  it('nothing inside the dead zone, 0 → 1 outside it', () => {
    expect(deadzone(0.15, 0)).toEqual({ x: 0, y: 0 });
    expect(deadzone(0.21, 0).x).toBeLessThan(0.02);
    expect(deadzone(0.6, 0).x).toBeCloseTo(0.5, 5);
    expect(deadzone(1, 0).x).toBeCloseTo(1, 5);
    const d = deadzone(0.8, 0.8); expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 5);
  });
  it('after latch() a held button only counts once let go', () => {
    const inp = new Input();
    inp.hold('jump', 1); inp.frame(0.016); expect(inp.b.jump.pressed).toBe(true);
    inp.latch(); inp.unhold('jump');
    inp.hold('jump', 1); inp.frame(0.016);   // scripted holds bypass the latch (captures drive the hero through it)
    expect(inp.b.jump.down).toBe(true);
  });
});

describe('pad makers', () => {
  it('tells PlayStation, Switch and the rest apart', () => {
    expect(familyOf('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('ps');
    expect(familyOf('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('ps');
    expect(familyOf('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('ns');
    expect(familyOf('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe('xbox');
    expect(familyOf('8BitDo something')).toBe('xbox');
  });
  it('names the buttons by position in each family', () => {
    expect([0, 1, 2, 3].map(i => padName(i, 'xbox'))).toEqual(['A', 'B', 'X', 'Y']);
    expect([0, 1, 2, 3].map(i => padName(i, 'ps'))).toEqual(['✕', '○', '□', '△']);
    expect([0, 1, 2, 3].map(i => padName(i, 'ns'))).toEqual(['B', 'A', 'Y', 'X']);
    expect(padName(7, 'ns')).toBe('ZR'); expect(keyName(' ')).toBe('空格'); expect(keyName('j')).toBe('J');
  });
  it('every bindable button has a picture that stays inside its grid', () => {
    for (const f of ['xbox', 'ps', 'ns'] as const) for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 10, 11]) {
      const a = glyphArt(i, f); expect(a.px.length).toBeGreaterThan(40);
      for (const [x, y] of a.px) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(a.w); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(a.h); }
    }
  });
});
