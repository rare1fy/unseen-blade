// 手柄（act-30 之后）：改键对调、死区重映射、手柄型号、键位表的读档。
import { describe, it, expect, beforeEach } from 'vitest';
import { BIND, DEFAULT_BINDS, rebind, resetBinds, familyOf, padName, keyName, glyphArt, loadBinds, padNav, PAD, detectInitialDevice, isTouchLayout, isTouchPointer, setUiMode, cycleUiMode, uiModeLabel } from '../src/present/act/pad';
import { clock } from '../src/present/engine/clock';
import { deadzone, Input } from '../src/present/act/input';

describe('rebind', () => {
  beforeEach(() => resetBinds());
  it('puts a free key on an action and drops the old one', () => {
    expect(rebind('key', 'attack', 'h')).toBe('ok');
    expect(BIND.key.attack[0]).toBe('h');
    expect(BIND.key.attack).not.toContain('j');
  });
  it('defaults gamepad face buttons to X attack, A dash, B jump, Y special', () => {
    expect(DEFAULT_BINDS.pad.attack[0]).toBe(2);   // X
    expect(DEFAULT_BINDS.pad.dash[0]).toBe(0);     // A (+ RB spare)
    expect(DEFAULT_BINDS.pad.jump[0]).toBe(1);     // B
    expect(DEFAULT_BINDS.pad.special[0]).toBe(3);  // Y
  });
  it('swaps when the key is another action\'s main key', () => {
    expect(rebind('pad', 'attack', 1)).toBe('ok');   // B was jump's
    expect(BIND.pad.attack[0]).toBe(1);
    expect(BIND.pad.jump[0]).toBe(2);                // jump takes X
  });
  it('a spare key is given up, the owner keeps its main key and other spares', () => {
    expect(rebind('pad', 'special', 5)).toBe('ok');  // RB was a spare of the dash
    expect(BIND.pad.special[0]).toBe(5);
    expect(BIND.pad.dash).toEqual([0]);   // A stays dash main; RT is 不见刀's now
  });
  it('不见刀 has its own keys: I and R2 (RT), which the dash gave up', () => {
    expect(DEFAULT_BINDS.key.ult).toEqual(['i']); expect(DEFAULT_BINDS.pad.ult).toEqual([7]);
    expect(DEFAULT_BINDS.pad.dash).not.toContain(7);
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
    expect(BIND.key.attack).toEqual(['j']); expect(BIND.key.dash).toEqual(['o']); expect(BIND.pad.jump).toEqual([1]); expect(BIND.pad.special).toEqual([6]);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  it('a table saved before 不见刀 had its own button: it gets I / RT, the old dash spare RT is given up, and pre-v2 default A/B migrates', () => {
    const store = new Map<string, string>(); const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    resetBinds();   // (it saves the defaults: the old table goes in after it)
    store.set('ub.bind', JSON.stringify({ key: { attack: ['j'], dash: ['k', 'shift'], jump: [' '], special: ['l', 'e'] }, pad: { attack: [2], dash: [1, 5, 7], jump: [0], special: [3] } }));
    loadBinds();
    expect(BIND.pad.ult).toEqual([7]); expect(BIND.pad.dash).toEqual([0, 5]); expect(BIND.pad.jump).toEqual([1]); expect(BIND.key.ult).toEqual(['i']);
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
  it('every bindable button (plus Start/Menu 9) has a picture that stays inside its grid', () => {
    for (const f of ['xbox', 'ps', 'ns'] as const) for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11]) {
      const a = glyphArt(i, f); expect(a.px.length).toBeGreaterThan(40);
      for (const [x, y] of a.px) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(a.w); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(a.h); }
    }
  });
  it('padNav exposes Y (button 3) edge for card reroll', () => {
    let pressed3 = false;
    const mockPad = { index: 0, connected: true, id: 'Xbox Wireless Controller', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ get pressed() { return i === 3 && pressed3; } })) };
    const origNav = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [mockPad] }, configurable: true });
    try {
      clock.frame++; padNav.sync();
      pressed3 = true; clock.frame++;
      expect(padNav.poll(0.016).y).toBe(true);
      clock.frame++;
      expect(padNav.poll(0.016).y).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: origNav, configurable: true });
    }
  });
});

describe('device-adaptive UI switching', () => {
  beforeEach(() => { setUiMode('auto'); PAD.device = 'key'; });

  it('detectInitialDevice picks pad when a controller is connected, touch on mobile UA, key on desktop', () => {
    const origNav = globalThis.navigator;
    try {
      const mockPad = { index: 0, connected: true, id: 'DualSense Wireless Controller', axes: [0, 0, 0, 0], buttons: [] };
      Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 0, getGamepads: () => [mockPad] }, configurable: true });
      clock.frame++;
      expect(detectInitialDevice()).toBe('pad');
      expect(PAD.family).toBe('ps');

      Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', maxTouchPoints: 5, getGamepads: () => [] }, configurable: true });
      clock.frame++;
      expect(detectInitialDevice()).toBe('touch');

      Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0, getGamepads: () => [] }, configurable: true });
      clock.frame++;
      expect(detectInitialDevice()).toBe('key');
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: origNav, configurable: true });
    }
  });

  it('isTouchLayout follows active device in auto mode and respects manual desktop/touch overrides', () => {
    setUiMode('auto');
    expect(isTouchLayout('key')).toBe(false);
    expect(isTouchLayout('pad')).toBe(false);
    expect(isTouchLayout('touch')).toBe(true);

    expect(cycleUiMode()).toBe('desktop');
    expect(uiModeLabel()).toBe('操作界面：键鼠手柄');
    expect(isTouchLayout('touch')).toBe(false);

    expect(cycleUiMode()).toBe('touch');
    expect(uiModeLabel()).toBe('操作界面：触屏');
    expect(isTouchLayout('key')).toBe(true);
    expect(isTouchLayout('pad')).toBe(true);

    expect(cycleUiMode()).toBe('auto');
    expect(uiModeLabel()).toBe('操作界面：自动');
  });

  it('isTouchPointer distinguishes touch/pen from desktop mouse clicks', () => {
    expect(isTouchPointer({ raw: { pointerType: 'touch' } })).toBe(true);
    expect(isTouchPointer({ raw: { pointerType: 'pen' } })).toBe(true);
    expect(isTouchPointer({ raw: { pointerType: 'mouse' } })).toBe(false);
    expect(isTouchPointer({ raw: { touches: [] } })).toBe(true);
    expect(isTouchPointer({ raw: {} })).toBe(false);
    expect(isTouchPointer(null)).toBe(false);
  });

  it('mouse clicks on HUD buttons do not flip device to touch, while real touch taps do', () => {
    const inp = new Input();
    PAD.device = 'pad';
    inp.press('attack', 1, false);
    expect(PAD.device).toBe('pad');
    inp.press('attack', 2, true);
    expect(PAD.device).toBe('touch');
  });
});
