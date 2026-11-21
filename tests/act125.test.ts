import { describe, it, expect } from 'vitest';
import { fresh } from '../src/present/act/profile';
import {
  WEAPON_ORDER, WEAPONS, isWeaponUnlocked, equipWeapon, equippedWeapon,
  weaponLevel, forgeWeapon, buildHeroBladeMesh, buildCourtyardWeaponRack,
} from '../src/present/act/weapons';
import {
  KEEPSAKE_ORDER, KEEPSAKES, KEEPSAKE_STARS, unlockKeepsake, isKeepsakeUnlocked,
  equipKeepsake, equippedKeepsake, keepsakeStar, advanceKeepsake, buildKeepsakeBoxModel,
} from '../src/present/act/keepsakes';
import { drawBoons, newPerks } from '../src/present/act/boons';
import { HIDEOUT } from '../src/present/act/hideout';
import { doorsFrom, roomInfo } from '../src/present/act/run';
import { GENERAL_EVENTS } from '../src/present/act/generalEvents';

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('act-125: 文家四柄名刀系统', () => {
  it('寒山旧刀默认解锁，其余三柄随对应主线 Boss 击败解锁并可淬炼 1→3 阶', () => {
    const p = fresh();
    expect(equippedWeapon(p)).toBe('hanshan');
    expect(isWeaponUnlocked(p, 'hanshan')).toBe(true);
    expect(isWeaponUnlocked(p, 'thunder')).toBe(false);
    expect(isWeaponUnlocked(p, 'frost')).toBe(false);
    expect(isWeaponUnlocked(p, 'blunt')).toBe(false);
    expect(equipWeapon(p, 'thunder')).toBe(false);

    // Beat Shi Lei -> thunder unlocks
    p.seen['ch1_boss_after'] = 1;
    expect(isWeaponUnlocked(p, 'thunder')).toBe(true);
    expect(equipWeapon(p, 'thunder')).toBe(true);
    expect(equippedWeapon(p)).toBe('thunder');

    // Forge thunder 0 -> 1 -> 2 -> 3
    p.iron = 500;
    expect(weaponLevel(p, 'thunder')).toBe(0);
    expect(forgeWeapon(p, 'thunder')).toBe(true);
    expect(weaponLevel(p, 'thunder')).toBe(1);
    expect(forgeWeapon(p, 'thunder')).toBe(true);
    expect(weaponLevel(p, 'thunder')).toBe(2);
    expect(forgeWeapon(p, 'thunder')).toBe(true);
    expect(weaponLevel(p, 'thunder')).toBe(3);
    expect(forgeWeapon(p, 'thunder')).toBe(false); // capped at 3
  });

  it('四柄名刀各有独立连段、藏锋模式与有效 3D 体素刀身/刀廊网格', () => {
    const modes = new Set(WEAPON_ORDER.map(id => WEAPONS[id].stanceMode));
    expect(modes.size).toBe(4);
    expect(WEAPONS.hanshan.cuts.length).toBe(5);
    expect(WEAPONS.thunder.cuts.length).toBe(3);
    expect(WEAPONS.frost.cuts.length).toBe(6);
    expect(WEAPONS.blunt.cuts.length).toBe(2);

    for (const id of WEAPON_ORDER) {
      const blade = buildHeroBladeMesh(id);
      expect(blade.children.length).toBeGreaterThan(0);
    }
    const rack = buildCourtyardWeaponRack(
      { hanshan: true, thunder: true, frost: false, blunt: true },
      'thunder',
    );
    expect(rack.children.length).toBeGreaterThan(0);
  });
});

describe('act-125: 八件随身信物匣', () => {
  it('八件信物解锁、佩戴、随战斗房间数升星（★→★★→★★★）与流派加权生效', () => {
    expect(KEEPSAKE_ORDER.length).toBe(8);
    const p = fresh();
    expect(equippedKeepsake(p)).toBeNull();
    expect(isKeepsakeUnlocked(p, 'zhaoyun')).toBe(false);

    expect(unlockKeepsake(p, 'zhaoyun')).toBe(true);
    expect(unlockKeepsake(p, 'zhaoyun')).toBe(false);
    expect(equipKeepsake(p, 'zhaoyun')).toBe(true);
    expect(equippedKeepsake(p)).toBe('zhaoyun');
    expect(keepsakeStar(p, 'zhaoyun')).toBe(1);

    // Advance to ★2 (5 rooms) and ★3 (12 rooms)
    for (let i = 0; i < KEEPSAKE_STARS[0] - 1; i++) {
      expect(advanceKeepsake(p, 1)).toBeNull();
    }
    expect(advanceKeepsake(p, 1)).toEqual({ id: 'zhaoyun', star: 2 });
    expect(keepsakeStar(p, 'zhaoyun')).toBe(2);

    const up3 = advanceKeepsake(p, KEEPSAKE_STARS[1] - KEEPSAKE_STARS[0]);
    expect(up3).toEqual({ id: 'zhaoyun', star: 3 });
    expect(keepsakeStar(p, 'zhaoyun')).toBe(3);

    // Keepsake 3D model
    expect(buildKeepsakeBoxModel(true).children.length).toBeGreaterThan(0);

    // Archetype bias check: zhaoyun biases 'gale'
    expect(KEEPSAKES.zhaoyun.arch).toBe('gale');
    const rnd = makeRng(20261121);
    let galeCount = 0;
    for (let i = 0; i < 60; i++) {
      const picks = drawBoons('any', 3, rnd, newPerks(), [0.7, 0.25, 0.05], 'gale');
      galeCount += picks.filter(pk => pk.boon.arch === 'gale').length;
    }
    expect(galeCount).toBeGreaterThan(60);
  });
});

describe('act-125: 扩建断碑古窑与名将奇遇岔路', () => {
  it('扩建后的断碑古窑满足阔绰尺寸，刀廊/信物匣与 5 位 NPC 均落在场地内且互不重叠', () => {
    const f = HIDEOUT.floor;
    expect(f.x1 - f.x0).toBeGreaterThanOrEqual(28);
    expect(f.z1 - f.z0).toBeGreaterThanOrEqual(25);

    const anchors = [
      HIDEOUT.weaponRack,
      HIDEOUT.keepsakeBox,
      HIDEOUT.stele,
      HIDEOUT.people.duwu,
      HIDEOUT.people.sunao,
      HIDEOUT.people.fengtiebi,
      HIDEOUT.people.luzhao,
      HIDEOUT.people.huanyue,
    ];
    for (const a of anchors) {
      expect(a.x).toBeGreaterThan(f.x0 + 0.5);
      expect(a.x).toBeLessThan(f.x1 - 0.5);
      expect(a.z).toBeGreaterThan(f.z0 + 0.5);
      expect(a.z).toBeLessThan(f.z1 - 0.5);
    }
    // Check no two NPCs are within 3m of each other
    const npcs = [
      HIDEOUT.people.duwu,
      HIDEOUT.people.sunao,
      HIDEOUT.people.fengtiebi,
      HIDEOUT.people.luzhao,
      HIDEOUT.people.huanyue,
    ];
    for (let i = 0; i < npcs.length; i++) {
      for (let j = i + 1; j < npcs.length; j++) {
        const d = Math.hypot(npcs[i].x - npcs[j].x, npcs[i].z - npcs[j].z);
        expect(d).toBeGreaterThan(3.0);
      }
    }
  });

  it('前四关名将奇遇数据完整（守×斗×猎×谋），且第 2/3 间岔路必出 event 门、永不连出两间非战斗屋', () => {
    expect(GENERAL_EVENTS.length).toBe(4);
    expect(GENERAL_EVENTS.map(e => e.eventTitle)).toEqual(['断后护民', '三合试锋', '雾巷听弦', '借风引火']);
    const ks = new Set(GENERAL_EVENTS.map(e => e.keepsake));
    const bs = new Set(GENERAL_EVENTS.map(e => e.id));
    expect(ks.size).toBe(4);
    expect(bs.size).toBe(4);

    for (let reg = 0; reg < 4; reg++) {
      expect(roomInfo('event', reg).name).toContain('奇遇');
      const rnd = makeRng(100 + reg);
      // Room 2 (from=1 -> next=2) offers event fork
      const d2 = doorsFrom(1, ['fight', 'fight'], rnd, reg);
      expect(d2.some(d => d.type === 'event')).toBe(true);
      // After visiting event, next doors never chain another non-combat room
      const d3 = doorsFrom(2, ['fight', 'fight', 'event'], rnd, reg);
      expect(d3.every(d => d.type !== 'event' && d.type !== 'shop' && d.type !== 'rest')).toBe(true);
    }
  });
});
