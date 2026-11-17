// 刀谱 (manuals.ts): the twelve moves' shared fields — the presses (how / air) the card face and the demonstration draw, the one-line
// effect (agy, ≤ 20 characters, no presses written into it), a 断云 that only comes after 挑云 — and their hint glyphs on the buttons.
import { describe, it, expect } from 'vitest';
import { MANUALS, ALL_MOVES, drawManuals } from '../src/present/act/manuals';
import FONT from '../ui/font.js';

/** every source file's text, keyed 'src/…' */
const SRC = Object.fromEntries(Object.entries(import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>).map(([k, v]) => [k.slice(3), v]));

describe('刀谱', () => {
  it('十二本，每本都有按法、一句效果，按法不写进说明里', () => {
    expect(MANUALS.map(m => m.id)).toEqual(['chase', 'backDart', 'dbl', 'launch', 'cutDart', 'keep', 'pause', 'kick', 'acut', 'swoop', 'reel', 'stomp']);
    expect(Object.keys(ALL_MOVES)).toHaveLength(12);
    const chars = new Set((FONT as { chars: string }).chars);
    for (const m of MANUALS) {
      expect(m.how?.length, m.id).toBeGreaterThan(0);
      expect([...m.desc[0]].length, m.id).toBeLessThanOrEqual(20);
      // the presses are drawn as buttons, never spelt out in the line
      expect(m.desc[0], m.id).not.toMatch(/按|冲刺时|空中|半空时/);
      for (const ch of m.name + m.desc.join('')) if (ch.charCodeAt(0) > 0x7e) expect(chars.has(ch), `${m.id} ${ch}`).toBe(true);
    }
    expect(MANUALS.find(m => m.id === 'swoop')).toMatchObject({ how: ['dash'], air: true });
    expect(MANUALS.find(m => m.id === 'reel')).toMatchObject({ how: ['dart', 'dart'] });
    expect(MANUALS.find(m => m.id === 'stomp')).toMatchObject({ how: ['jump'], air: true });
  });
  it('断云要先学会挑云才会抽到', () => {
    const always = () => 0.5;
    expect(drawManuals({}, 12, always).map(m => m.id)).not.toContain('acut');
    expect(drawManuals({ launch: true }, 12, always).map(m => m.id)).toContain('acut');
  });
  it('四招各有按钮提示图标和颜色，前三次能接时慢放', () => {
    const ui = SRC['src/present/act/ironUi.ts'], show = SRC['src/present/act/show.ts'];
    for (const k of ['acut', 'swoop', 'reel', 'stomp']) {
      expect(ui, k).toMatch(new RegExp(`\\b${k}: \\{ col: 0x[0-9a-f]{6}, rows: \\[`));
    }
    const teach = /const TEACH = \[([^\]]*)\]/.exec(show)![1];
    for (const k of ['acut', 'reel', 'stomp']) expect(teach).toContain(`'${k}'`);
    // 掠地 opens whenever she is in the air (like 二段跳): slowing time for it would slow every jump
    expect(teach).not.toContain(`'swoop'`);
  });
  it('提示图标的颜色彼此分得开（同一颗钮上、同时在空中会亮的）', () => {
    const ui = SRC['src/present/act/ironUi.ts'];
    const col = (k: string) => { const m = new RegExp(`\\b${k}: \\{ col: 0x([0-9a-f]{6})`).exec(ui)!; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const hue = ([r, g, b]: number[]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn || 1; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
    const apart = (a: string, b: string) => { const d = Math.abs(hue(col(a)) - hue(col(b))); return Math.min(d, 360 - d); };
    // the cut button: 断云 / 劈山 / 寻声 / 反击; the jump button: 踏顶 / 挑云 / 穿心腿 / 二段跳; the dart button: 牵红 / 回身镖 / 迎面镖
    for (const [a, b] of [['acut', 'plunge'], ['acut', 'chase'], ['acut', 'counter'], ['stomp', 'launch'], ['stomp', 'kick'], ['stomp', 'dbl'], ['stomp', 'chase'],
      ['reel', 'back'], ['reel', 'cdart'], ['swoop', 'dbl'], ['swoop', 'acut']] as Array<[string, string]>) expect(apart(a, b), `${a} / ${b}`).toBeGreaterThan(24);
  });
});
