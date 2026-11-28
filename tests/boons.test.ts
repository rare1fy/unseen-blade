import { describe, expect, it, vi } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { BOONS, BOON_CAP, SLOT_NAMES, TIER_NAMES, applyBoon, boonTag, drawBoons, hasBoon, isBladeHit, newPerks, tierOf, upgradeBoon, v, v2 } from '../src/present/act/boons';
import { fillVals, fillUpgradeVals } from '../src/present/act/cards';
import { entryOfBoon, entryOfManual } from '../src/present/act/skillFace';
import { MANUALS } from '../src/present/act/manuals';
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
import { firstRoom, roomOf, regionFirstRoom, doorsFrom, settleReward } from '../src/present/act/run';

// 11-18 / act-138 改招为主 (Hades II paced numbers): the boon, its button, its three tiers (and the second number where it has one)
const values: Array<[string, string | null, number[], number[]?]> = [
  ['bladeWind', 'attack', [80, 115, 150], [0, 20, 40]], ['extra', 'attack', [30, 45, 60]], ['bleed', 'attack', [1, 1.5, 2]],
  ['behead', 'attack', [8, 12, 16]], ['spin', 'attack', [1.0, 1.4, 1.8], [110, 125, 140]], ['pierce', 'attack', [4, 5.5, 7], [85, 110, 135]],
  ['passCut', 'dash', [55, 75, 95]], ['decoy', 'dash', [1, 1.3, 1.6], [4, 3, 2]],
  ['darts3', 'dart', [3, 4, 5]], ['boomerang', 'dart', [60, 80, 100]], ['pin', 'dart', [0.8, 1.1, 1.4]],
  ['twinDraw', 'stance', [55, 70, 85]], ['burst', 'stance', [3, 3.6, 4.2], [8, 12, 16]],
  ['rift', 'jump', [5, 6.5, 8], [10, 14, 18]], ['vault', 'jump', [7, 10, 13]],
  ['drink', null, [1, 2, 3]],
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
    // act-161 / 11-28: only boons she does not hold (held ones are never re-offered at a rolled tier), none once her hand is full (BOON_CAP = 7),
    // and never one her blade's chain cannot trigger
    const p = newPerks(); BOONS.slice(0, 6).forEach(b => applyBoon(p, b.id));
    const picks = drawBoons('any', 30, () => 0, p);
    expect(picks).toHaveLength(BOONS.length - 6); expect(picks.every(x => !hasBoon(p, x.boon.id))).toBe(true);
    expect(new Set(picks.map(x => x.boon.id)).size).toBe(picks.length);
    applyBoon(p, BOONS[6].id); expect(BOON_CAP).toBe(7); expect(drawBoons('any', 3, () => 0, p)).toEqual([]);
    const blunt = drawBoons('any', 30, () => 0, newPerks(), undefined, null, null, 'blunt').map(x => x.boon.id);
    expect(blunt).toHaveLength(BOONS.length - 4); for (const id of ['bladeWind', 'extra', 'spin', 'pierce']) expect(blunt).not.toContain(id);
    const thunder = drawBoons('any', 30, () => 0, newPerks(), undefined, null, null, 'thunder').map(x => x.boon.id);
    expect(thunder).toContain('bladeWind'); expect(thunder).not.toContain('spin'); expect(thunder).not.toContain('pierce');
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
  it('卡面数值一行按档填，升阶卡直显「旧值 → 新值」且与新秘传/派生彻底区分', () => {
    const b = (id: string) => BOONS.find(x => x.id === id)!;
    expect(fillVals(b('bladeWind').note!, b('bladeWind'), 1)).toBe('刀光伤害 115% · 飞行距离 +20%');
    expect(fillVals(b('pin').note!, b('pin'), 2)).toBe('定住 1.4秒 · 头目除外');
    expect(fillVals(b('decoy').note!, b('decoy'), 0)).toBe('残影停 1秒 · 每 4秒 留一个');
    expect(fillVals(b('darts3').note!, b('darts3'), 1)).toBe('一次 4 枚');
    // 升阶对比文案：直观显示 旧值 → 新值
    expect(fillUpgradeVals(b('bladeWind').note!, b('bladeWind'), 0, 1)).toBe('刀光伤害 80% → 115% · 飞行距离 +0% → 20%');
    expect(fillUpgradeVals(b('bleed').note!, b('bleed'), 0, 1)).toBe('每层每秒失血 1 → 1.5 点 · 最多五层');
    expect(fillUpgradeVals(b('darts3').note!, b('darts3'), 1, 2)).toBe('一次 4 → 5 枚');
    // 升阶卡去掉按键序列、不假报流派成势，三类卡片标签泾渭分明
    const up = entryOfBoon(b('bladeWind'), 1, { poise: 1 }, 0);
    expect(up.tag).toBe('凡→珍');
    expect(up.badge?.text).toBe('数值提升');
    expect(up.resNote).toBeUndefined();
    expect(up.steps).toBeNull();
    expect(up.upgrade?.diff).toContain('80% → 115%');
    const fresh = entryOfBoon(b('bladeWind'), 1, { poise: 1 });
    expect(fresh.tag).toBe('强化·珍');
    expect(fresh.steps?.length).toBeGreaterThan(0);
    const man = entryOfManual(MANUALS[0]);
    expect(man.tag).toBe('新招式');
  });
  it('哈迪斯2流派门保证：进入指定流派门时，三选一优先全给该流派秘传', () => {
    for (const arch of ['blood', 'poise', 'shadow', 'gale'] as const) {
      const picks = drawBoons('any', 3, () => 0.3, newPerks(), [0.7, 0.25, 0.05], null, arch);
      expect(picks).toHaveLength(3);
      expect(picks.every(p => p.boon.arch === arch), arch).toBe(true);
    }
  });
  it('斩击类型含补刀、错身、掠顶、第二段箭步斩，不含飞镖、刀芒和环境伤害', () => {
    for (const kind of ['k1', 'k2', 'k3', 'k4', 'k5', 'rel', 'rel2', 'plunge', 'launch', 'parry', 'echo', 'pass', 'overhead']) expect(isBladeHit(kind)).toBe(true);
    for (const kind of ['dart', 'wind', 'school', 'wall', 'prop', 'dcut', 'arrow', 'burst', 'rift']) expect(isBladeHit(kind)).toBe(false);
  });
});

describe('哈迪斯2强化节奏与可见门奖励', () => {
  it('第一间给流派秘传，死士房给重赏资源或珍绝秘传', () => {
    for (const x of [0, 0.3, 0.6, 0.99]) {
      const fr = firstRoom(() => x).reward;
      expect(fr?.k).toBe('boon');
      expect(fr && fr.k === 'boon' && fr.arch).toBeTruthy();
    }
    expect(roomOf('elite', 2, () => 0.1).reward).toEqual({ k: 'meta', iron: 6, herb: 6 });
    const er = roomOf('elite', 2, () => 0.6).reward;
    expect(er?.k).toBe('boon');
    expect(er && er.k === 'boon' && er.arch).toBeTruthy();
  });
  it('携带上限 7 张：死士房按 30% 残铁药引 / 35% 升阶 / 35% 秘传分配；满 7 张后乱兵房不出秘传门', () => {
    const some = { boons: 3, ups: 2 }, full = { boons: BOON_CAP, ups: 4 }, maxed = { boons: BOON_CAP, ups: 0 };
    expect(roomOf('elite', 2, () => 0.1, 0, some).reward).toEqual({ k: 'meta', iron: 6, herb: 6 });
    expect(roomOf('elite', 2, () => 0.45, 0, some).reward).toEqual({ k: 'up' });
    expect(roomOf('elite', 2, () => 0.8, 0, some).reward?.k).toBe('boon');
    expect(roomOf('elite', 2, () => 0.45, 1, full).reward).toEqual({ k: 'up' });
    expect(roomOf('elite', 2, () => 0.8, 1, full).reward).toEqual({ k: 'coins', n: 48 });
    expect(roomOf('elite', 2, () => 0.45, 0, maxed).reward).toEqual({ k: 'coins', n: 40 });
    for (let i = 0; i < 200; i++) expect(roomOf('fight', 2, () => (i + 0.5) / 200, 0, full).reward?.k).not.toBe('boon');
    // the first room of each region: boon in R1, meta in R2, manual #2 in R3, coins in R4 & R5
    expect(regionFirstRoom(1, () => 0.3).reward).toEqual({ k: 'meta', iron: 6, herb: 6 });
    expect(regionFirstRoom(2, () => 0.3).reward).toEqual({ k: 'manual' });
    expect(regionFirstRoom(3, () => 0.3).reward?.k).toBe('coins');
    expect(regionFirstRoom(4, () => 0.3).reward?.k).toBe('coins');
    // every region shows a merchant's door by its last two forks
    for (let s = 0; s < 40; s++) { let k = s * 7 + 1; const rnd = () => { k = (k * 1103515245 + 12345) % 2147483648; return k / 2147483648; };
      expect(doorsFrom(4, ['fight', 'fight', 'elite', 'fight', 'fight'], rnd, 0).some(d => d.type === 'shop')).toBe(true); }
  });
  it('乱兵房提高资源节点占比（30% 残铁药引 / 20% 铜钱 / 20% 血上限 / 20% 回血 / 10% 秘传）；非战斗房无清场奖励', () => {
    const n = 2000, seen: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n, rw = roomOf('fight', 2, () => x).reward!;
      seen[rw.k] = (seen[rw.k] ?? 0) + 1;
      if (rw.k === 'boon') expect(rw.arch).toBeTruthy();
    }
    expect(seen.manual ?? 0).toBe(0);
    expect(seen.boon / n).toBeGreaterThan(0.08); expect(seen.boon / n).toBeLessThan(0.13);
    expect(seen.meta / n).toBeGreaterThan(0.27); expect(seen.meta / n).toBeLessThan(0.33);
    expect(seen.heal / n).toBeGreaterThan(0.17);
    expect(seen.coins).toBeGreaterThan(0); expect(seen.maxHp).toBeGreaterThan(0);
    for (const t of ['shop', 'rest', 'boon', 'boss'] as const) expect(roomOf(t, 2, Math.random).reward).toBeNull();
  });
  it('act-161 门是提前一间画好的：手牌后来满了，写着新秘传的门开门时改成满手牌该给的', () => {
    const door = (type: 'fight' | 'elite' | 'shop', reward: ReturnType<typeof roomOf>['reward'], region = 2) => ({ type, locale: 'x', reward, waves: [], region });
    const boon = { k: 'boon' as const, arch: 'blood' as const };
    expect(settleReward(door('elite', boon), { boons: BOON_CAP - 1, ups: 3 })).toBe(boon);
    expect(settleReward(door('fight', boon), { boons: 0, ups: 0 })).toBe(boon);
    expect(settleReward(door('elite', boon), { boons: BOON_CAP, ups: 2 })).toEqual({ k: 'up' });
    expect(settleReward(door('elite', boon), { boons: BOON_CAP, ups: 0 })).toEqual({ k: 'coins', n: 56 });
    expect(settleReward(door('fight', boon), { boons: BOON_CAP, ups: 2 })).toEqual({ k: 'coins', n: 46 });
    expect(settleReward(door('elite', { k: 'up' }), { boons: 4, ups: 0 })).toEqual({ k: 'boon' });
    expect(settleReward(door('elite', { k: 'up' }), { boons: BOON_CAP, ups: 0 })).toEqual({ k: 'coins', n: 56 });
    expect(settleReward(door('elite', { k: 'up' }), { boons: 4, ups: 1 })).toEqual({ k: 'up' });
    const heal = { k: 'heal' as const };
    expect(settleReward(door('fight', heal), { boons: BOON_CAP, ups: 0 })).toBe(heal);
    expect(settleReward(door('shop', null), { boons: BOON_CAP, ups: 0 })).toBeNull();
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
