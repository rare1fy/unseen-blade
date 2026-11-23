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
import { hideoutProgress, recordStageProgress, HIDEOUT_ZONE_ORDER, buildZoneMonumentModel } from '../src/present/act/hideoutProgress';
import { AREA } from '../src/present/scenes/props';
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

describe('act-125 / act-147: 据点四件随身信物匣', () => {
  it('四件据点信物解锁、佩戴、随战斗房间数升星（★→★★→★★★）、流派加权生效，且旧档名将信物优雅降级', () => {
    expect(KEEPSAKE_ORDER).toEqual(['duwu', 'sunao', 'fengtiebi', 'luzhao']);
    const p = fresh();
    expect(equippedKeepsake(p)).toBeNull();
    expect(isKeepsakeUnlocked(p, 'luzhao')).toBe(false);

    // Old save with a removed general keepsake safely returns null
    p.keepsakes = { zhaoyun: 5 };
    p.keepsake = 'zhaoyun';
    expect(equippedKeepsake(p)).toBeNull();

    expect(unlockKeepsake(p, 'luzhao')).toBe(true);
    expect(unlockKeepsake(p, 'luzhao')).toBe(false);
    expect(equipKeepsake(p, 'luzhao')).toBe(true);
    expect(equippedKeepsake(p)).toBe('luzhao');
    expect(keepsakeStar(p, 'luzhao')).toBe(1);

    // Advance to ★2 (5 rooms) and ★3 (12 rooms)
    for (let i = 0; i < KEEPSAKE_STARS[0] - 1; i++) {
      expect(advanceKeepsake(p, 1)).toBeNull();
    }
    expect(advanceKeepsake(p, 1)).toEqual({ id: 'luzhao', star: 2 });
    expect(keepsakeStar(p, 'luzhao')).toBe(2);

    const up3 = advanceKeepsake(p, KEEPSAKE_STARS[1] - KEEPSAKE_STARS[0]);
    expect(up3).toEqual({ id: 'luzhao', star: 3 });
    expect(keepsakeStar(p, 'luzhao')).toBe(3);

    // Keepsake 3D model
    expect(buildKeepsakeBoxModel(true).children.length).toBeGreaterThan(0);

    // Archetype bias check: luzhao biases 'blood'
    expect(KEEPSAKES.luzhao.arch).toBe('blood');
    const rnd = makeRng(20261121);
    let bloodCount = 0;
    for (let i = 0; i < 60; i++) {
      const picks = drawBoons('any', 3, rnd, newPerks(), [0.7, 0.25, 0.05], 'blood');
      bloodCount += picks.filter(pk => pk.boon.arch === 'blood').length;
    }
    expect(bloodCount).toBeGreaterThan(60);
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

  it('act-147: 局内岔路不再刷出名将奇遇 event 门，保持紧凑战斗/商铺/歇脚/遗卷节奏', () => {
    for (let reg = 0; reg < 5; reg++) {
      const rnd = makeRng(100 + reg);
      for (const from of [0, 1, 2, 3]) {
        const doors = doorsFrom(from, ['fight', 'fight'], rnd, reg);
        expect(doors.every(d => d.type !== 'event')).toBe(true);
      }
    }
  });
});

describe('act-135: 据点渐进解锁、落成工碑与全图南侧延展', () => {
  it('初醒新档只开放杜五与孙媪，不提前放出锻坊、种田与刀廊', () => {
    const p = fresh();
    const s0 = hideoutProgress(p, false);
    expect(s0.visibleNpcs).toEqual(['duwu', 'sunao']);
    expect(s0.forgeReady).toBe(false);
    expect(s0.forgeBuilt).toBe(false);
    expect(s0.gardenReady).toBe(false);
    expect(s0.gardenBuilt).toBe(false);
    expect(s0.rackReady).toBe(false);
    expect(s0.rackBuilt).toBe(false);
    expect(s0.pendingZones).toEqual([]);
  });

  it('act-188: 按关卡进度依次逐项排队解锁三座落成工碑（不看出发次数，单次最多亮 1 座防过载）', () => {
    const p = fresh();
    // Even after many failed runs at room 1, forge does NOT unlock until clearing 2 rooms in Act 1
    p.runs = 5;
    let s = hideoutProgress(p, false);
    expect(s.pendingZones).toEqual([]);
    expect(s.lanternReady).toBe(false);
    expect(s.visibleNpcs).toEqual(['duwu', 'sunao']);

    // Clearing Act 1 room 2 unlocks Forge monument ONLY
    recordStageProgress(p, 0, 2);
    s = hideoutProgress(p, false);
    expect(s.pendingZones).toEqual(['forge']);
    expect(s.visibleNpcs).toEqual(['duwu', 'sunao']);

    // Even if player jumped straight to Act 2 Room 4 before building Forge, queue still shows ONLY 1 monument at a time
    recordStageProgress(p, 1, 4);
    p.seen['ch1_boss_after'] = 1;
    s = hideoutProgress(p, false);
    expect(s.pendingZones).toEqual(['forge']);

    // Build Forge -> Feng Tiebi + Lantern unlock, next queued monument becomes Rack (Act 1 Boss beaten)
    p.seen['build_forge'] = 1;
    s = hideoutProgress(p, false);
    expect(s.forgeBuilt).toBe(true);
    expect(s.lanternReady).toBe(true);
    expect(s.visibleNpcs).toEqual(['duwu', 'sunao', 'fengtiebi']);
    expect(s.pendingZones).toEqual(['rack']);

    // Build Rack -> Huan Yue unlocks, next queued monument becomes Garden (Act 2 Room 3+ reached)
    p.seen['build_rack'] = 1;
    s = hideoutProgress(p, false);
    expect(s.rackBuilt).toBe(true);
    expect(s.visibleNpcs).toEqual(['duwu', 'sunao', 'fengtiebi', 'huanyue']);
    expect(s.pendingZones).toEqual(['garden']);

    // Build Garden -> Lu Zhao + 6 plots unlock, queue empties
    p.seen['build_garden'] = 1;
    s = hideoutProgress(p, false);
    expect(s.gardenBuilt).toBe(true);
    expect(s.visibleNpcs).toEqual(['duwu', 'sunao', 'fengtiebi', 'luzhao', 'huanyue']);
    expect(s.pendingZones).toEqual([]);

    // act-188: Du Wu pre-boss rest room guarantee when player skipped earlier rests
    const rnd = makeRng(42);
    const forced = doorsFrom(5, ['fight', 'fight', 'elite', 'shop', 'fight', 'fight'], rnd, 0, undefined, true);
    expect(forced).toHaveLength(1);
    expect(forced[0].type).toBe('rest');
  });

  it('调试全开开关立即呈现全部五位同伴与全部据点设施', () => {
    const p = fresh();
    const s = hideoutProgress(p, true);
    expect(s.visibleNpcs).toEqual(['duwu', 'sunao', 'fengtiebi', 'luzhao', 'huanyue']);
    expect(s.forgeBuilt && s.gardenBuilt && s.rackBuilt).toBe(true);
    expect(s.pendingZones).toEqual([]);
  });

  it('三座 3D 体素落成工碑都能构建网格，且战斗地图南边界已延展至镜头下方', () => {
    for (const z of HIDEOUT_ZONE_ORDER) {
      const m = buildZoneMonumentModel(z);
      expect(m.children.length).toBeGreaterThan(0);
    }
    expect(AREA.z1).toBeGreaterThanOrEqual(13.0);
  });
});
