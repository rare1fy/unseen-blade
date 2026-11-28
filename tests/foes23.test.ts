// 第二关 / 第三关敌人的规则（11-18）：不开画面能测的那部分——盾兵正面挡刀、背后进刀、劈山破防、被破势接住后盾震开；水鬼潜在水下刀砍不着；
// 封鸩在雾里砍不着、挨刀计数；狱卒的圆环中间是空的（站在他脚边安全）。
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { Object3D, Vector3 } from 'three';

vi.mock('../src/present/fx/fx', () => ({ trailSeg: vi.fn(), fxRing: vi.fn(), fxSparks: vi.fn(), fxSmoke: vi.fn(), fxGlow: vi.fn(), fxEmbers: vi.fn(), fxFlare: vi.fn(), fxImpact: vi.fn(), fxChips: vi.fn() }));
vi.mock('../src/present/fx/skillFx', () => ({ fxAfterimage: vi.fn(), fxBolt: vi.fn(), fxShock: vi.fn() }));
vi.mock('../src/present/fx/blocks', () => ({ addBlock: vi.fn() }));
vi.mock('../src/present/bestiary/battle', () => ({
  BattleActor: class {
    root = new Object3D();
    bones: Record<string, Object3D> = {};
    home = new Vector3();
    yaw = 0;
    place(p: Vector3) { this.home.copy(p); this.root.position.copy(p); }
    faceToward() {}
    chest() { return this.home.clone(); }
    head() { return this.home.clone(); }
    weapon() { return this.home.clone(); }
    tint() {}
    hurt() {}
    hit() {}
    play() {}
    setRunning() {}
    roar() {}
    dispose() {}
  },
}));
vi.mock('../src/present/ronin/models', () => ({}));
vi.mock('../src/audio/cues', () => ({ cue: vi.fn() }));
import { EDEFS, interruptFoe, liveBossAdds, type Foe, type FoeWorld } from '../src/present/act/enemy';
import { inside } from '../src/present/act/tele';
import '../src/present/act/foes/ly_ai';
import '../src/present/act/foes/xp_ai';
import { ROLE_AI } from '../src/present/act/foes/roles';

const V = (x = 0, z = 0) => new Vector3(x, 0, z);
function foe(kind: string, o: Partial<Foe> = {}): Foe {
  const d = EDEFS[kind];
  return { kind, d, role: d.role, hp: d.hp, maxHp: d.hp, pos: V(), vel: V(), yaw: 0, st: 'move', t: 0, dur: 0, tele: null, extra: [], inv: 0, atk: '', combo: 0, mem: {}, phase: 1, elite: false,
    a: { root: new Object3D(), bones: {}, chest: () => V(), head: () => V(), weapon: () => V(), tint: vi.fn(), hurt: vi.fn(), hit: vi.fn(), play: vi.fn(), setRunning: vi.fn(), roar: vi.fn() }, ...o } as unknown as Foe;
}

describe('第二关 · 覆铁重盾', () => {
  const g = ROLE_AI.ly_shield.guard!;
  it('正面（他面朝的方向）挡刀、挡镖，侧后进刀', () => {
    const f = foe('ly_shield', { yaw: 0 });   // facing +z
    expect(g(f, 10, V(0, 2), 'k1')).toBe(0);
    expect(g(f, 4, V(0.8, 2), 'dart')).toBe(0);
    expect(g(f, 10, V(2, -0.2), 'k2')).toBeUndefined();   // from the side
    expect(g(f, 10, V(0, -2), 'k3')).toBeUndefined();     // from behind
  });
  it('劈山、撞墙爆炸、一闪 / 破势从正面也进', () => {
    const f = foe('ly_shield', { yaw: 0 });
    for (const k of ['plunge', 'school', 'rel', 'parry']) expect(g(f, 10, V(0, 2), k), k).toBeUndefined();
  });
  it('破势接住盾撞：盾震开 2.5 秒，这段时间正面也进刀', () => {
    const f = foe('ly_shield', { yaw: 0, st: 'windup', atk: 'bash' });
    interruptFoe(f, 0.9);
    expect(f.mem.stunT).toBe(2.5); expect(g(f, 10, V(0, 2), 'k1')).toBeUndefined();
  });
  it('一闪路过时定住他（不是在盾撞的起手里）不算震开', () => {
    const f = foe('ly_shield', { yaw: 0, st: 'move', atk: '' });
    interruptFoe(f, 0.85); expect(f.mem.stunT).toBeUndefined();
  });
});

describe('第三关', () => {
  it('水鬼潜在水下：刀砍不着（不弹火星，直接穿过）；冒出来那一下砍得着', () => {
    const g = ROLE_AI.xp_diver.guard!, f = foe('xp_diver', { mem: { under: true } as Foe['mem'] });
    expect(g(f, 10, V(0, 1), 'k1')).toBe(-1);
    f.st = 'windup'; expect(g(f, 10, V(0, 1), 'k1')).toBeUndefined();
    f.mem.under = false; f.st = 'move'; expect(g(f, 10, V(0, 1), 'k1')).toBeUndefined();
  });
  it('封鸩：雾里砍不着；砍中三刀记数（第三刀后他化雾）', () => {
    const g = ROLE_AI.xp_boss.guard!, f = foe('xp_boss');
    f.mem.mist = true; expect(g(f, 10, V(0, 1), 'k1')).toBe(-1);
    f.mem.mist = false; for (let i = 0; i < 3; i++) expect(g(f, 10, V(0, 1), 'k1')).toBeUndefined();
    expect(f.mem.hits).toBe(3);
  });
  it('破势接住封鸩的截指刀：踉跄，接着化雾', () => {
    const f = foe('xp_boss', { st: 'windup', atk: 'snip' });
    interruptFoe(f, 0.9); expect(f.st).toBe('stagger'); expect(f.mem.vanishNext).toBe(true);
  });
  it('死士挨一刀现形 3 秒', () => {
    const f = foe('xp_assassin'); ROLE_AI.xp_assassin.guard!(f, 10, V(0, 1), 'k1'); expect(f.mem.revealT).toBe(3);
  });
  it('链锤的圆环中间是空的：贴在狱卒脚边打不着，外圈打得着', () => {
    const s = { k: 'ring' as const, r0: 1.2, r1: 3.4 };
    expect(inside(s, 0, 0, 0, 0.3, 0.2, 0.38)).toBe(false);
    expect(inside(s, 0, 0, 0, 2.4, 0, 0.38)).toBe(true);
    expect(inside(s, 0, 0, 0, 4.2, 0, 0.38)).toBe(false);
  });
});

describe('头目', () => {
  it('阎虎、封鸩是头目，有横幅副标题和登场一句', () => {
    for (const k of ['ly_boss', 'xp_boss']) { const d = EDEFS[k]; expect(d.boss).toBe(true); expect(d.tag).toBeTruthy(); expect(d.intro).toBeTruthy(); }
  });
  it('第二关阎虎 30% 门与第三关封寒 65% 门召兵全部写入实时 w.foes，且 show.ts 永不重绑 this.foes 引用导致孤儿死兵跨图残留', () => {
    const mkWorld = (foes: Foe[]): FoeWorld => ({
      heroPos: V(0, 4), heroR: 0.38, heroAlive: true, heroY: 0, heroDodge: false,
      foes, arrows: [], clamp: () => {}, hurtHero: () => {}, dodged: () => {},
      killFoe: () => {}, bleedDamage: () => 0, bleedSpill: () => {}, arrowHit: () => {},
    });

    const ly = foe('ly_boss', { phase: 2, hp: 100, maxHp: 1000, mem: { gate1: true } });
    const lyFoes: Foe[] = [ly];
    const lyW = mkWorld(lyFoes);
    ROLE_AI.ly_boss.tick!(ly, lyW, 0.016);
    expect(lyFoes.map(o => o.kind)).toEqual(['ly_boss', 'ly_shield', 'ly_torch', 'ly_xbow']);
    expect(liveBossAdds(ly, lyW)).toBe(3);
    for (const m of lyFoes.slice(1)) { expect(m.hp).toBeGreaterThan(0); expect(m.st).not.toBe('dead'); }

    const xp = foe('xp_boss', { phase: 1, hp: 400, maxHp: 1000, mem: {} });
    const xpFoes: Foe[] = [xp];
    const xpW = mkWorld(xpFoes);
    ROLE_AI.xp_boss.tick!(xp, xpW, 0.016);
    expect(xpFoes.filter(o => o.kind === 'totem_cauldron')).toHaveLength(2);
    expect(xpFoes.filter(o => o.kind === 'xp_assassin')).toHaveLength(2);
    expect(liveBossAdds(xp, xpW)).toBe(4);
    for (const m of xpFoes.slice(1)) { expect(m.hp).toBeGreaterThan(0); expect(m.st).not.toBe('dead'); }

    // Hard architectural invariant: show.ts must NEVER reassign this.foes (which detaches this.foeWorld.foes!)
    const showSrc = ts.sys.readFile('src/present/act/show.ts') ?? '';
    expect(showSrc.length).toBeGreaterThan(1000);
    expect(showSrc).not.toMatch(/this\.foes\s*=\s*/);
    expect(showSrc).toMatch(/fw\.foes\s*=\s*this\.foes/);
  });
});
