// 11-18 技能说明：卡面 / 已得 / 招式三处共用的数据（skillInfo.ts）——每本刀谱、每张秘传、每招本事都有按法、一句效果、落在哪颗钮；
// 玩家看到的字都在像素字里（缺字会画成方框）。
import { describe, it, expect, vi } from 'vitest';
import FONT from '../ui/font.js';
vi.mock('../src/present/v2/overlay', () => ({ text: vi.fn(), textW: vi.fn(() => 0), icon: vi.fn() }));
vi.mock('../src/present/ui3d/bodyFont', () => ({ bodyText: vi.fn(), bodyW: vi.fn(() => 0), onBodyFontChange: vi.fn() }));
import { MANUALS } from '../src/present/act/manuals';
import { BOONS } from '../src/present/act/boons';
import { fillVals } from '../src/present/act/cards';
import { BASE_SKILLS, UI_WORDS, manualHow, manualEffect, manualTarget, boonEffect, boonNum, boonSteps, boonTarget, isPress } from '../src/present/act/skillInfo';

const chars = new Set((FONT as { chars: string }).chars);
const missing = (s: string) => [...s].filter(c => c.charCodeAt(0) > 0x7e && !chars.has(c) && c !== '·');

describe('技能说明数据', () => {
  it('每本刀谱：按法里至少一下、效果一句不超过 20 字、落在一颗钮上', () => {
    for (const m of MANUALS) {
      const h = manualHow(m); expect(h.how.some(isPress), m.id).toBe(true);
      const e = manualEffect(m); expect([...e].length, `${m.id}: ${e}`).toBeLessThanOrEqual(20); expect(missing(e), m.id).toEqual([]);
      expect(['attack', 'dash', 'jump', 'special']).toContain(manualTarget(m));
    }
  });
  it('每张秘传：效果一句不超过 20 字，数值填得进三档，挂键的有按法', () => {
    for (const b of BOONS) {
      const e = boonEffect(b); expect([...e].length, `${b.id}: ${e}`).toBeLessThanOrEqual(20); expect(missing(e), b.id).toEqual([]);
      for (const t of [0, 1, 2]) { const n = fillVals(boonNum(b), b, t); expect(n, b.id).not.toMatch(/\{v/); expect(missing(n), b.id).toEqual([]); }
      const s = boonSteps(b), tg = boonTarget(b);
      if (s) expect(['attack', 'dash', 'jump', 'special']).toContain(tg); else expect(tg).toBe('hp');
    }
  });
  it('本事：十招，名字、效果、数值都在字库里', () => {
    expect(BASE_SKILLS.map(s => s.id)).toEqual(['lianhuan', 'dash', 'dcut', 'jump', 'plunge', 'dart', 'iai', 'parry', 'counter', 'ult']);
    for (const s of BASE_SKILLS) {
      expect([...s.effect].length, s.id).toBeLessThanOrEqual(20);
      for (const t of [s.name, s.effect, s.num ?? '']) expect(missing(t), s.id).toEqual([]);
      expect(s.steps.some(isPress)).toBe(true);
    }
    for (const w of Object.values(UI_WORDS)) expect(missing(w)).toEqual([]);
  });
});
