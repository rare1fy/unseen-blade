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
import { EDEFS, FOE_AI, applyAllySpread, isRangedFoe, type Foe, type FoeWorld } from '../src/present/act/enemy';
import { Vector3 } from 'three';
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
  it('第一关扩充至 8 间（7 间 + 渠帅），头目是黄巾渠帅', () => {
    expect(roomsIn(0)).toBe(RUN_ROOMS); expect(RUN_ROOMS).toBe(8); expect(REGION_1.boss).toBe('hj_boss'); expect(REGION_1.bossLocale).toBe('hj_temple');
    expect(isBossRoom(0, 7)).toBe(true); expect(isBossRoom(0, 6)).toBe(false);
    expect(roomInfo('boss', 0).name).toBe('首领'); expect(roomInfo('fight', 0).line).toBe('杀退拦路黄巾贼');
  });
  it('每关的头目是头目、头目间里有它，每种兵都登记了（模型合进来以后）', () => {
    for (const [ri, r] of REGIONS.entries()) {
      const boss = wavesFor('boss', r.rooms, Math.random, ri);
      expect(boss[boss.length - 1]).toContain(r.boss);
      const kinds = new Set<string>();
      for (let s = 1; s < 30; s++) for (const t of ['fight', 'elite'] as RoomType[]) for (let d = 0; d < r.rooms; d++) for (const w of wavesFor(t, d, rng(s), ri)) for (const k of w) kinds.add(k.replace('*', ''));
      for (const w of boss) for (const k of w) kinds.add(k);
      for (const k of kinds) { expect(EDEFS[k], `${r.id}: ${k}`).toBeTruthy(); if (ri > 0) expect(EDEFS[k].role === 'ext' ? FOE_AI[k] : ROLE_AI[EDEFS[k].role], `${r.id}: ${k}'s AI`).toBeTruthy(); }   // (regions 4 / 5: wp/regB's FOE_AI by kind)
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
        // (11-18: never two non-combat rooms in a row)
        if (['rest', 'shop', 'boon'].includes(visited[room]) && !isBossRoom(ri, room + 1)) {
          expect(ds.map(d => d.type).sort()).toEqual(['elite', 'fight']);
        }
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
  it('局外货币：越往后的关一间算得越多（act-161：1 / 1.2 / 1.4 / 1.7 / 2）', () => {
    const r0 = roomsIn(0), r1 = roomsIn(1), W = [1, 1.2, 1.4, 1.7, 2.0];
    expect(roomsWorth(0, 0)).toBe(0); expect(roomsWorth(0, 3)).toBe(3);
    expect(roomsWorth(1, 2)).toBeCloseTo(r0 + 2 * 1.2, 6);
    expect(roomsWorth(2, 2)).toBeCloseTo(r0 + r1 * 1.2 + 2 * 1.4, 6);
    const last = REGIONS.length - 1, all = REGIONS.reduce((n, _r, i) => n + roomsIn(i) * W[i], 0);
    expect(roomsWorth(last, roomsIn(last) - 1, true)).toBeCloseTo(all, 6);
  });
  it('难度：按哈迪斯2曲线逐关加码', () => {
    expect(regionScale(0)).toEqual({ hp: 1.25, dmg: 1.15, quick: 0.98, calm: 0, attackers: 2 });
    for (let i = 1; i < 5; i++) { const a = regionScale(i - 1), b = regionScale(i); expect(b.hp).toBeGreaterThan(a.hp); expect(b.dmg).toBeGreaterThan(a.dmg); expect(b.quick).toBeGreaterThan(a.quick); expect(b.calm).toBeLessThan(a.calm); expect(b.attackers).toBeGreaterThanOrEqual(a.attackers); }
  });
  it('各关头目间路牌统一写作「首领」，不提前剧透具体身份', () => {
    for (let ri = 0; ri < 5; ri++) expect(roomInfo('boss', ri).name).toBe('首领');
    expect(roomOf('boss', 5, Math.random, 1).locale).toBe('ly_mint'); expect(roomOf('boss', 5, Math.random, 2).locale).toBe('xp_gate');
  });
  it('第 2~5 关波次不再堆叠 3 个及以上同种炮灰杂兵，保持多兵种战术配队', () => {
    const fodder = new Set(['ly_looter', 'xp_conscript', 'wl_spear', 'cx_club']);
    for (let ri = 1; ri < REGIONS.length; ri++) {
      for (let s = 1; s < 16; s++) for (const t of ['fight', 'elite'] as RoomType[]) for (let d = 0; d < REGIONS[ri].rooms; d++) {
        for (const w of wavesFor(t, d, rng(s), ri)) {
          const fodderCount = w.filter(k => fodder.has(k.replace('*', ''))).length;
          expect(fodderCount, `r${ri + 1} ${t} d${d} wave=${w.join(',')}`).toBeLessThanOrEqual(2);
          expect(new Set(w.map(k => k.replace('*', ''))).size).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
  it('applyAllySpread 对所有关的近战/远程敌人施加防扎堆推力，且不影响头目与跨职敌人', () => {
    const mk = (kind: string, x: number, z: number) => ({ kind, role: EDEFS[kind].role, d: EDEFS[kind], st: 'move', pos: new Vector3(x, 0, z) }) as unknown as Foe;
    const m1 = mk('ly_looter', 0, 0), m2 = mk('ly_halberd', 0.8, 0), r1 = mk('xp_needle', 0.4, 0), boss = mk('ly_boss', 0.5, 0);
    expect(isRangedFoe(r1)).toBe(true);
    const w = { foes: [m1, m2, r1, boss] } as unknown as FoeWorld;
    const wantM = new Vector3(0, 0, 1);
    applyAllySpread(m1, w, wantM);
    expect(wantM.x).toBeLessThan(-0.3); // pushed away from m2 (+x), ignores r1 (ranged)
    const wantB = new Vector3(0, 0, 1);
    applyAllySpread(boss, w, wantB);
    expect(wantB.x).toBe(0); // boss unaffected
  });
});
