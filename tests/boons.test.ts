import { describe, expect, it, vi } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { BOONS, SLOT_NAMES, TIER_NAMES, applyBoon, boonTag, drawBoons, hasBoon, isBladeHit, newPerks, tierOf, upgradeBoon, v, v2 } from '../src/present/act/boons';
import { fillVals } from '../src/present/act/cards';
import FONT from '../ui/font.js';

vi.mock('../src/present/fx/fx', () => ({ trailSeg: vi.fn(), fxRing: vi.fn(), fxSparks: vi.fn(), fxSmoke: vi.fn() }));
vi.mock('../src/present/fx/skillFx', () => ({ fxAfterimage: vi.fn() }));
vi.mock('../src/present/fx/blocks', () => ({ addBlock: vi.fn() }));
vi.mock('../src/present/v2/overlay', () => ({ text: vi.fn(), textW: vi.fn(() => 0), icon: vi.fn() }));
vi.mock('../src/present/bestiary/battle', () => ({ BattleActor: class {} }));
vi.mock('../src/present/ronin/models', () => ({}));
vi.mock('../src/audio/cues', () => ({ cue: vi.fn() }));
vi.mock('../src/present/asm/registry', () => ({ LOCALES: { hj_village: {}, hj_field: {}, hj_temple: {} } }));
import { updateFoe, type Foe, type FoeWorld } from '../src/present/act/enemy';
import { firstRoom, roomOf } from '../src/present/act/run';

// 11-18 改招为主: the boon, its button, its three tiers (and the second number where it has one)
const values: Array<[string, string | null, number[], number[]?]> = [
  ['bladeWind', 'attack', [100, 150, 200], [0, 20, 40]], ['extra', 'attack', [40, 60, 80]], ['bleed', 'attack', [1, 1.5, 2]],
  ['behead', 'attack', [12, 18, 25]], ['spin', 'attack', [1.0, 1.4, 1.8], [120, 140, 160]], ['pierce', 'attack', [4, 5.5, 7], [100, 130, 160]],
  ['passCut', 'dash', [70, 100, 130]], ['decoy', 'dash', [1, 1.3, 1.6], [4, 3, 2]],
  ['darts3', 'dart', [3, 4, 5]], ['boomerang', 'dart', [100, 130, 160]], ['pin', 'dart', [0.8, 1.1, 1.4]],
  ['twinDraw', 'stance', [60, 80, 100]], ['burst', 'stance', [3, 3.6, 4.2], [8, 12, 16]],
  ['rift', 'jump', [5, 6.5, 8], [10, 14, 18]], ['vault', 'jump', [8, 11, 14]],
  ['drink', null, [3, 5, 7]],
];

describe('秘传：改招为主', () => {
  it('十六张，每张挂一个键，五个键都有、斩最多，被动最少', () => {
    expect(BOONS.map(b => b.id)).toEqual(values.map(x => x[0]));
    expect(new Set(BOONS.map(b => b.id)).size).toBe(16);
    const per: Record<string, number> = {};
    for (const b of BOONS) { expect(b.slot === null || b.slot! in SLOT_NAMES, b.id).toBe(true); per[String(b.slot)] = (per[String(b.slot)] ?? 0) + 1; }
    for (const s of Object.keys(SLOT_NAMES)) expect(per[s] ?? 0, s).toBeGreaterThanOrEqual(2);
    expect(per.attack).toBe(Math.max(...Object.values(per)));
    expect(per.null ?? 0).toBeLessThanOrEqual(2);
    for (const [id, slot] of values) expect(BOONS.find(b => b.id === id)!.slot).toBe(slot);
  });
  it('效果一句、数值一行分开写：效果不带数字、键名和术语，14 字左右；卡面仍读两行', () => {
    const chars = new Set((FONT as { chars: string }).chars);
    for (const b of BOONS) {
      expect(b.eff, b.id).toBeTruthy(); expect(b.note, b.id).toBeTruthy();
      expect(b.desc).toEqual([b.eff, b.note]);
      expect([...b.eff!].length, b.id).toBeLessThanOrEqual(16);
      expect(b.eff, b.id).not.toMatch(/[0-9{}%＋+]|伤害|易伤|硬直|暴击|按键|按住|按下/);
      expect(b.glyph).toHaveLength(10);
      for (const row of b.glyph) { expect(row).toHaveLength(10); expect(row).toMatch(/^[.#o]+$/); }
      for (const tier of [0, 1, 2]) expect(fillVals(b.note!, b, tier)).not.toMatch(/[{}]/);
      for (const c of b.name) expect(chars.has(c), `${b.id}: ${c}`).toBe(true);
    }
    expect(TIER_NAMES).toEqual(['凡品', '珍品', '绝品']);
    expect(boonTag(BOONS[0], 2)).toBe('绝品');
  });
  it('看不见的数值秘传已经拿掉', () => {
    for (const id of ['quick', 'sunder', 'bone', 'frenzy', 'draw', 'counter', 'evade']) {
      expect(BOONS.some(b => b.id === id), id).toBe(false);
      const p = newPerks(); applyBoon(p, id, 2); expect(tierOf(p, id)).toBe(-1); expect(hasBoon(p, id)).toBe(false);
    }
  });
  it('抽卡不重复，先抽未拥有的卡，档位在 0 到 2', () => {
    const p = newPerks(); BOONS.slice(0, BOONS.length - 1).forEach(b => applyBoon(p, b.id));
    const picks = drawBoons('any', 30, () => 0, p);
    expect(picks).toHaveLength(BOONS.length); expect(picks[0].boon.id).toBe(BOONS[BOONS.length - 1].id);
    expect(new Set(picks.map(x => x.boon.id)).size).toBe(BOONS.length);
    for (const [roll, tier] of [[0.69, 0], [0.7, 1], [0.949, 1], [0.95, 2], [0.999, 2]]) expect(drawBoons('any', 1, () => roll, newPerks())[0].tier).toBe(tier);
    expect(drawBoons('any', 2, () => 0.5, newPerks(), [0, 0, 1]).every(x => x.tier === 2)).toBe(true);
    expect(drawBoons('any', 0, Math.random, p)).toEqual([]);
  });
  it('磨刀只升档，重复拾取不会降档', () => {
    const p = newPerks(); expect(tierOf(p, 'passCut')).toBe(-1); expect(v(p, 'passCut')).toBe(0);
    applyBoon(p, 'passCut'); expect(tierOf(p, 'passCut')).toBe(0); expect(hasBoon(p, 'passCut')).toBe(true);
    expect(upgradeBoon(p, 'passCut')).toBe(true); expect(tierOf(p, 'passCut')).toBe(1);
    expect(upgradeBoon(p, 'passCut')).toBe(true); expect(tierOf(p, 'passCut')).toBe(2);
    expect(upgradeBoon(p, 'passCut')).toBe(false); applyBoon(p, 'passCut', 0); expect(tierOf(p, 'passCut')).toBe(2);
    expect(upgradeBoon(p, 'bleed')).toBe(false);
    expect(p.moves).toEqual({});
  });
  it.each(values)('%s 的三档主、辅数值准确', (id, _slot, primary, secondary) => {
    const p = newPerks(); const b = BOONS.find(b => b.id === id)!;
    for (const tier of [0, 1, 2]) {
      applyBoon(p, id, tier); expect(tierOf(p, id)).toBe(tier);
      expect(v(p, id)).toBe(primary[tier]); expect(b.vals?.[tier]).toBe(primary[tier]);
      expect(v2(p, id)).toBe(secondary?.[tier] ?? 0);
    }
  });
  it('卡面数值一行按档填', () => {
    const b = (id: string) => BOONS.find(x => x.id === id)!;
    expect(fillVals(b('bladeWind').note!, b('bladeWind'), 1)).toBe('刀光伤害 150% · 飞行距离 +20%');
    expect(fillVals(b('pin').note!, b('pin'), 2)).toBe('定住 1.4秒 · 头目除外');
    expect(fillVals(b('decoy').note!, b('decoy'), 0)).toBe('残影停 1秒 · 每 4秒 留一个');
    expect(fillVals(b('darts3').note!, b('darts3'), 1)).toBe('一次 4 枚');
  });
  it('斩击类型含补刀、错身、掠顶、第二段箭步斩，不含飞镖、刀芒和环境伤害', () => {
    for (const kind of ['k1', 'k2', 'k3', 'k4', 'k5', 'rel', 'rel2', 'plunge', 'launch', 'parry', 'echo', 'pass', 'overhead']) expect(isBladeHit(kind)).toBe(true);
    for (const kind of ['dart', 'wind', 'school', 'wall', 'prop', 'dcut', 'arrow', 'burst', 'rift']) expect(isBladeHit(kind)).toBe(false);
  });
});

describe('刀谱给得更勤', () => {
  it('第一间固定刀谱，死士房必给刀谱', () => {
    for (const x of [0, 0.3, 0.6, 0.99]) {
      expect(firstRoom(() => x).reward).toEqual({ k: 'manual' });
      expect(roomOf('elite', 2, () => x).reward).toEqual({ k: 'manual' });
    }
  });
  it('乱兵房约三成刀谱，其余秘传 / 铜钱 / 回血；行商、歇脚、遗卷、渠帅没有清场奖励', () => {
    const n = 2000, seen: Record<string, number> = {};
    for (let i = 0; i < n; i++) { const x = (i + 0.5) / n, rw = roomOf('fight', 2, () => x).reward!; seen[rw.k] = (seen[rw.k] ?? 0) + 1; }
    expect(seen.manual / n).toBeGreaterThan(0.25); expect(seen.manual / n).toBeLessThan(0.35);
    expect(seen.boon / n).toBeGreaterThan(0.35);
    expect(seen.coins).toBeGreaterThan(0); expect(seen.heal).toBeGreaterThan(0);
    for (const t of ['shop', 'rest', 'boon', 'boss'] as const) expect(roomOf(t, 2, Math.random).reward).toBeNull();
  });
});

const pos = () => new Vector3();
function foe(kind: Foe['kind'] = 'dummy', hp = 10): Foe {
  return { kind, hp, maxHp: 10, pos: pos(), vel: pos(), st: 'move', tele: null, extra: [], inv: 0, bleed: 2, bleedT: 0, bleedTick: 0, bleedDrop: 0, sunderT: 3,
    wob: { x: 0, z: 0, vx: 0, vz: 0 }, a: { root: new Object3D(), chest: pos, tint: vi.fn(), hurt: vi.fn(), hit: vi.fn(), play: vi.fn(), setRunning: vi.fn() } } as unknown as Foe;
}
function world(f: Foe): FoeWorld {
  return { foes: [f], heroPos: pos(), heroR: 0.4, heroY: 0, heroAlive: true, heroDodge: false, arrows: [], hurtHero: vi.fn(), killFoe: vi.fn(), bleedDamage: vi.fn(() => 3), bleedSpill: vi.fn(), dodged: vi.fn(), arrowHit: vi.fn(), clamp: vi.fn() };
}
describe('放血结算', () => {
  it('每秒结算、每 0.4 秒滴血，三秒未斩清层', () => {
    const f = foe(), w = world(f); updateFoe(f, w, 1);
    expect(w.bleedDamage).toHaveBeenCalledTimes(1); expect(w.bleedSpill).toHaveBeenCalledTimes(2);
    updateFoe(f, w, 2); expect(f.bleed).toBe(0); expect(f.bleedT).toBe(3);
    expect(w.bleedDamage).toHaveBeenCalledTimes(3);
  });
  it('出血致死走正常杀敌钩子', () => {
    const f = foe('bandit', 3), w = world(f); updateFoe(f, w, 1);
    expect(f.st).toBe('dead'); expect(w.killFoe).toHaveBeenCalledTimes(1);
  });
});
