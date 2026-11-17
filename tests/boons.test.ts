import { describe, expect, it, vi } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { BOONS, TIER_NAMES, applyBoon, boonTag, drawBoons, isBladeHit, newPerks, tierOf, upgradeBoon, v, v2 } from '../src/present/act/boons';
import { fillVals } from '../src/present/act/cards';
import FONT from '../ui/font.js';

vi.mock('../src/present/fx/fx', () => ({ trailSeg: vi.fn(), fxRing: vi.fn(), fxSparks: vi.fn(), fxSmoke: vi.fn() }));
vi.mock('../src/present/fx/skillFx', () => ({ fxAfterimage: vi.fn() }));
vi.mock('../src/present/fx/blocks', () => ({ addBlock: vi.fn() }));
vi.mock('../src/present/v2/overlay', () => ({ text: vi.fn(), textW: vi.fn(() => 0), icon: vi.fn() }));
vi.mock('../src/present/bestiary/battle', () => ({ BattleActor: class {} }));
vi.mock('../src/present/ronin/models', () => ({}));
vi.mock('../src/audio/cues', () => ({ cue: vi.fn() }));
import { updateFoe, type Foe, type FoeWorld } from '../src/present/act/enemy';

const values: Array<[string, number[], number[]?]> = [
  ['quick', [12, 20, 28]], ['extra', [40, 60, 80]], ['sunder', [12, 20, 30]],
  ['bone', [0.3, 0.45, 0.6]], ['behead', [12, 18, 25]], ['bleed', [1, 1.5, 2]],
  ['drink', [3, 5, 7]], ['frenzy', [20, 35, 50]], ['draw', [30, 45, 60], [20, 30, 40]],
  ['counter', [50, 75, 100], [4, 6, 8]], ['evade', [40, 70, 100], [15, 25, 35]],
  ['darts3', [3, 3, 5]], ['bladeWind', [100, 150, 200], [0, 20, 40]],
];

describe('刀客强化数据', () => {
  it('只含十三张，说明与像素图符合规格并能被字体显示', () => {
    expect(BOONS.map(b => b.id)).toEqual(values.map(x => x[0]));
    expect(new Set(BOONS.map(b => b.id)).size).toBe(13);
    const chars = new Set((FONT as { chars: string }).chars);
    for (const b of BOONS) {
      expect(b.school).toBe('sr'); expect(b.desc).toHaveLength(2); expect(b.glyph).toHaveLength(10);
      for (const row of b.glyph) { expect(row).toHaveLength(10); expect(row).toMatch(/^[.#o]+$/); }
      for (const line of b.desc) {
        expect([...line].length).toBeLessThanOrEqual(12);
        expect([...fillVals(line, b, 2)].length).toBeLessThanOrEqual(12);
        for (const c of fillVals(line, b, 2)) expect(chars.has(c), `${b.id}: ${c}`).toBe(true);
      }
      for (const c of b.name) expect(chars.has(c), `${b.id}: ${c}`).toBe(true);
    }
    expect(TIER_NAMES).toEqual(['凡品', '珍品', '绝品']);
    expect(boonTag(BOONS[0], 2)).toBe('绝品');
  });
  it('抽卡不重复，先抽未拥有的卡，档位在 0 到 2', () => {
    const p = newPerks(); BOONS.slice(0, 12).forEach(b => applyBoon(p, b.id));
    const picks = drawBoons('any', 30, () => 0, p);
    expect(picks).toHaveLength(13); expect(picks[0].boon.id).toBe('bladeWind');
    expect(new Set(picks.map(x => x.boon.id)).size).toBe(13);
    for (const [roll, tier] of [[0.69, 0], [0.7, 1], [0.949, 1], [0.95, 2], [0.999, 2]]) expect(drawBoons('any', 1, () => roll, newPerks())[0].tier).toBe(tier);
    expect(drawBoons('any', 2, () => 0.5, newPerks(), [0, 0, 1]).every(x => x.tier === 2)).toBe(true);
    expect(drawBoons('any', 0, Math.random, p)).toEqual([]);
  });
  it('磨刀只升档，重复拾取不会降档，也不接受旧卡', () => {
    const p = newPerks(); expect(tierOf(p, 'quick')).toBe(-1); expect(v(p, 'quick')).toBe(0);
    applyBoon(p, 'quick'); expect(tierOf(p, 'quick')).toBe(0);
    expect(upgradeBoon(p, 'quick')).toBe(true); expect(tierOf(p, 'quick')).toBe(1);
    expect(upgradeBoon(p, 'quick')).toBe(true); expect(tierOf(p, 'quick')).toBe(2);
    expect(upgradeBoon(p, 'quick')).toBe(false); applyBoon(p, 'quick', 0); expect(tierOf(p, 'quick')).toBe(2);
    applyBoon(p, 'tp_bolt', 2); expect(tierOf(p, 'tp_bolt')).toBe(-1);
    expect(upgradeBoon(p, 'bleed')).toBe(false);
    expect(p.moves).toEqual({});
  });
  it.each(values)('%s 的三档主、辅数值准确', (id, primary, secondary) => {
    const p = newPerks(); const b = BOONS.find(b => b.id === id)!;
    for (const tier of [0, 1, 2]) {
      applyBoon(p, id, tier); expect(tierOf(p, id)).toBe(tier);
      expect(v(p, id)).toBe(primary[tier]); expect(b.vals?.[tier]).toBe(primary[tier]);
      expect(v2(p, id)).toBe(secondary?.[tier] ?? 0);
    }
  });
  it('卡面替换百分数、秒和第二组数值', () => {
    const b = (id: string) => BOONS.find(x => x.id === id)!;
    expect(fillVals(b('quick').desc[1], b('quick'), 2)).toBe('出刀速度+28%');
    expect(fillVals(b('bone').desc[1], b('bone'), 1)).toBe('敌人硬直延长0.45秒');
    expect(fillVals(b('draw').desc[1], b('draw'), 0)).toBe('箭步斩伤害+20%');
    expect(fillVals(b('counter').desc[1], b('counter'), 2)).toBe('并回复8点生命');
    expect(fillVals(b('bladeWind').desc[1], b('bladeWind'), 1)).toBe('直线贯穿，伤害150%');
  });
  it('斩击类型含补刀，不含飞镖、刀芒和环境伤害', () => {
    for (const kind of ['k1', 'k2', 'k3', 'k4', 'k5', 'rel', 'plunge', 'launch', 'parry', 'echo']) expect(isBladeHit(kind)).toBe(true);
    for (const kind of ['dart', 'wind', 'school', 'wall', 'prop', 'dcut', 'arrow']) expect(isBladeHit(kind)).toBe(false);
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
