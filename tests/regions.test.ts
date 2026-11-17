// 一局五关的流程（11-18）：关的顺序、每关的间数、打完头目进下一关、最后一关打完是通关、局外货币按关加权、难度第一关不变逐关加码。
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/present/fx/fx', () => ({ trailSeg: vi.fn(), fxRing: vi.fn(), fxSparks: vi.fn(), fxSmoke: vi.fn(), fxGlow: vi.fn(), fxEmbers: vi.fn(), fxFlare: vi.fn(), fxImpact: vi.fn(), fxChips: vi.fn() }));
vi.mock('../src/present/fx/skillFx', () => ({ fxAfterimage: vi.fn(), fxBolt: vi.fn(), fxShock: vi.fn() }));
vi.mock('../src/present/fx/blocks', () => ({ addBlock: vi.fn() }));
vi.mock('../src/present/bestiary/battle', () => ({ BattleActor: class {} }));
vi.mock('../src/present/ronin/models', () => ({}));
vi.mock('../src/audio/cues', () => ({ cue: vi.fn() }));
import { REGIONS } from '../src/present/act/regions';
import { roomsIn, isBossRoom, afterBoss, roomsWorth, regionScale, regionBanner } from '../src/present/act/flow';
import { doorsFrom, roomOf, regionFirstRoom, roomInfo, wavesFor, RUN_ROOMS, type RoomType } from '../src/present/act/run';
import { REGION_1 } from '../src/present/act/regions/r1';
import { EDEFS } from '../src/present/act/enemy';
import '../src/present/act/foes/ly_ai';
import '../src/present/act/foes/xp_ai';
import { ROLE_AI } from '../src/present/act/foes/roles';
import { LOCALES } from '../src/present/asm/registry';
import type { Locale } from '../src/present/asm/types';
// (the game registers the places in show.ts; here every region's places stand in as bare ids, so placeOr keeps them)
for (const r of REGIONS) for (const id of [...r.locales, r.bossLocale]) LOCALES[id] ??= { id, name: id, theme: 'test', layouts: [], landmarks: [], groups: [], floor() {} } as Locale;

/** a seeded random (the run's draws repeat) */
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe('一局五关', () => {
  it('关的顺序：第一关黄巾残村，然后洛阳、下邳（第四、五关合并时接在后面）', () => {
    expect(REGIONS[0]).toBe(REGION_1);
    expect(REGIONS.map(r => r.id).slice(0, 3)).toEqual(['r1_huangjin', 'r2_luoyang', 'r3_xiapi']);
    expect(new Set(REGIONS.map(r => r.id)).size).toBe(REGIONS.length);
    for (const r of REGIONS) { expect(r.locales.length).toBeGreaterThanOrEqual(2); expect(r.locales).not.toContain(r.bossLocale); expect(r.rooms).toBeGreaterThanOrEqual(3); }
  });
  it('第一关和原来一样：6 间（5 间 + 渠帅），头目是黄巾渠帅', () => {
    expect(roomsIn(0)).toBe(RUN_ROOMS); expect(REGION_1.boss).toBe('hj_boss'); expect(REGION_1.bossLocale).toBe('hj_temple');
    expect(isBossRoom(0, 5)).toBe(true); expect(isBossRoom(0, 4)).toBe(false);
    expect(roomInfo('boss', 0).name).toBe('渠帅'); expect(roomInfo('fight', 0).line).toBe('杀退拦路黄巾贼');
  });
  it('每关的头目是头目、头目间里有它，每种兵都登记了（模型合进来以后）', () => {
    for (const [ri, r] of REGIONS.entries()) {
      const boss = wavesFor('boss', r.rooms, Math.random, ri);
      expect(boss[boss.length - 1]).toContain(r.boss);
      const kinds = new Set<string>();
      for (let s = 1; s < 30; s++) for (const t of ['fight', 'elite'] as RoomType[]) for (let d = 0; d < r.rooms; d++) for (const w of wavesFor(t, d, rng(s), ri)) for (const k of w) kinds.add(k.replace('*', ''));
      for (const w of boss) for (const k of w) kinds.add(k);
      for (const k of kinds) { expect(EDEFS[k], `${r.id}: ${k}`).toBeTruthy(); if (ri > 0) expect(ROLE_AI[EDEFS[k].role], `${r.id}: ${k}'s AI`).toBeTruthy(); }
      expect((EDEFS[r.boss] as { boss?: boolean }).boss, r.boss).toBe(true);
    }
  });
  it('一关里走一遍：第一间乱兵，中间每间两条路，头目前一间只有一条路通头目，头目间之后这一关没有路了', () => {
    for (let ri = 0; ri < REGIONS.length; ri++) for (let seed = 1; seed < 40; seed++) {
      const r = rng(seed), first = regionFirstRoom(ri, r), visited: RoomType[] = [first.type];
      expect(first.type).toBe('fight'); expect(first.region ?? 0).toBe(ri); expect(REGIONS[ri].locales).toContain(first.locale);
      let room = 0;
      for (;;) {
        const ds = doorsFrom(room, visited, r, ri);
        if (room === roomsIn(ri) - 1) { expect(ds).toEqual([]); break; }
        if (room === roomsIn(ri) - 2) { expect(ds.map(d => d.type)).toEqual(['boss']); expect(ds[0].locale).toBe(REGIONS[ri].bossLocale); }
        else { expect(ds).toHaveLength(2); expect(ds[0].type).not.toBe(ds[1].type); expect(ds.every(d => d.type !== 'boss')).toBe(true); }
        for (const d of ds) expect(d.region).toBe(ri);
        const pick = ds[Math.floor(r() * ds.length)]; visited.push(pick.type); room++;
      }
      expect(visited.filter(t => t === 'shop').length).toBeLessThanOrEqual(1); expect(visited.filter(t => t === 'rest').length).toBeLessThanOrEqual(1);
      expect(visited[visited.length - 1]).toBe('boss'); expect(visited).toHaveLength(roomsIn(ri));
    }
  });
  it('打完头目进下一关的第一间，最后一关打完是通关', () => {
    for (let ri = 0; ri < REGIONS.length - 1; ri++) expect(afterBoss(ri)).toBe(ri + 1);
    expect(afterBoss(REGIONS.length - 1)).toBe('won');
    // walking the whole run region by region ends in a win after every region's boss, in order
    const bosses: string[] = []; let ri: number | 'won' = 0;
    while (ri !== 'won') { bosses.push(REGIONS[ri].boss); ri = afterBoss(ri); }
    expect(bosses).toEqual(REGIONS.map(r => r.boss));
    expect(regionBanner(1)).toEqual({ title: '洛阳余烬', sub: '焦柱生烟，烈火铸钱' });
  });
  it('局外货币：第 n 关的一间算 n 间', () => {
    expect(roomsWorth(0, 0)).toBe(0); expect(roomsWorth(0, 3)).toBe(3);
    expect(roomsWorth(1, 2)).toBe(6 + 2 * 2);
    expect(roomsWorth(2, 2)).toBe(6 + 6 * 2 + 2 * 3);
    const last = REGIONS.length - 1, all = REGIONS.reduce((n, _r, i) => n + roomsIn(i) * (i + 1), 0);
    expect(roomsWorth(last, roomsIn(last) - 1, true)).toBe(all);
  });
  it('难度：第一关不变，后面逐关加码', () => {
    expect(regionScale(0)).toEqual({ hp: 1, dmg: 1, quick: 1, calm: -0, attackers: 1 });
    for (let i = 1; i < 5; i++) { const a = regionScale(i - 1), b = regionScale(i); expect(b.hp).toBeGreaterThan(a.hp); expect(b.dmg).toBeGreaterThan(a.dmg); expect(b.quick).toBeGreaterThan(a.quick); expect(b.calm).toBeLessThan(a.calm); expect(b.attackers).toBeGreaterThanOrEqual(a.attackers); }
  });
  it('后面几关的头目间有自己的叫法', () => {
    expect(roomInfo('boss', 1).name).toBe('校尉'); expect(roomInfo('boss', 2).name).toBe('医官');
    expect(roomOf('boss', 5, Math.random, 1).locale).toBe('ly_mint'); expect(roomOf('boss', 5, Math.random, 2).locale).toBe('xp_gate');
  });
});
