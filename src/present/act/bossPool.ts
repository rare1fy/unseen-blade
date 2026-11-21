// act-131: 剧情 Boss 伏诛后的「随机镇守 Boss 库」——绝不让已死剧情 Boss 诈尸重现！
// 任一关卡的剧情头目（石雷 / 阎虎 / 封寒 / 周默 / 崔玄）在当前存档已被斩杀后，
// 后续重访该关头目间时，自动从本 Boss 库随机抽取一位镇守强敌（同局内不重复），并随关卡自动缩放强度。
import { addFoes, FOE_AI, type EKind, type FoeAI } from './enemy';
import { BOSS_AFTER } from './scripts';
import { isBossKind } from './run';

/** All replacement guardian boss ids in the rematch boss pool (distinct models, weapons, and combat kits). */
export const BOSS_POOL_IDS: readonly EKind[] = [
  'pb_heishan',
  'pb_feixiong',
  'pb_xianzhen',
  'pb_yingge',
  'pb_tiebi',
  'pb_daowei',
] as const;

const POOL_SET = new Set<string>(BOSS_POOL_IDS);
const STORY_BOSSES = new Set<string>(['hj_boss', 'ly_boss', 'xp_boss', 'wl_boss', 'cx_boss']);

/** Panicked rout barks shouted by surviving minions when their boss falls. */
export const ROUT_BARKS = ['头领死了，快逃！', '撤！保命要紧！', '顶不住了，快跑！'] as const;

/** Lazy proxy to an existing ext-role FOE_AI entry (avoids module import-order fragility). */
function proxyExtAI(target: EKind): FoeAI {
  const get = () => FOE_AI[target];
  return {
    tick: (f, w, dt) => get()?.tick?.(f, w, dt),
    think: (f, w, dt, dist, dir, yawTo) => { get()?.think?.(f, w, dt, dist, dir, yawTo); },
    windup: (f, w, dt, p, yawTo) => { get()?.windup?.(f, w, dt, p, yawTo); },
    strike: (f, w) => get()?.strike?.(f, w),
    post: (f, w, dt) => { get()?.post?.(f, w, dt); },
    guard: (f, from, o) => !!get()?.guard?.(f, from, o),
    taken: f => get()?.taken?.(f) ?? 1,
    recover: f => get()?.recover?.(f) ?? 0.55,
    interrupted: (f, w) => { get()?.interrupted?.(f, w); },
  };
}

addFoes({
  pb_heishan: {
    model: 'hj_brute_e', hp: 460, r: 0.78, speed: 2.15, mass: 3.4, poise: 62, gold: 45,
    name: '黑山铁煞 · 屠刚', role: 'chief', boss: true,
    tag: '断斧横山 · 力劈千钧', intro: '石雷那废物既死了，这山头归老子管！',
  },
  pb_feixiong: {
    model: 'ly_halberd_e', hp: 490, r: 0.68, speed: 2.45, mass: 2.8, poise: 58, gold: 50,
    name: '西凉戟将 · 樊稠', role: 'ly_halberd', boss: true,
    tag: '飞熊残部 · 戟扫长街', intro: '阎校尉的空缺，就拿你的首级来补！',
  },
  pb_xianzhen: {
    model: 'ly_rider_e', hp: 480, r: 0.72, speed: 2.8, mass: 3.0, poise: 56, gold: 50,
    name: '陷阵铁骑 · 魏续', role: 'ly_rider', boss: true,
    tag: '铁甲奔雷 · 破阵无双', intro: '敢闯我营寨？先吃一记铁骑突阵！',
  },
  pb_yingge: {
    model: 'xp_assassin_e', hp: 440, r: 0.56, speed: 3.35, mass: 1.8, poise: 46, gold: 52,
    name: '影阁魁首 · 墨鸦', role: 'xp_assassin', boss: true,
    tag: '无声夺命 · 影刃连环', intro: '封鬼医既死，暗账便由影阁来收。',
  },
  pb_tiebi: {
    model: 'wl_shield_e', hp: 540, r: 0.64, speed: 2.3, mass: 3.2, poise: 64, gold: 55,
    name: '水寨铁壁 · 蔡中', role: 'ext', boss: true,
    tag: '重盾镇江 · 坚不可摧', intro: '周少监没了，这水寨还轮不到你撒野！',
  },
  pb_daowei: {
    model: 'cx_guard_e', hp: 560, r: 0.62, speed: 2.65, mass: 2.6, poise: 60, gold: 60,
    name: '百辟刀首 · 司空校尉', role: 'ext', boss: true,
    tag: '奉令镇守 · 百辟寒锋', intro: '司空府的刀架，岂容外人踏足？',
  },
});

FOE_AI.pb_tiebi = proxyExtAI('wl_shield');
FOE_AI.pb_daowei = proxyExtAI('cx_guard');

export function isPoolBoss(kind: string): boolean {
  return POOL_SET.has(kind);
}

/** Whether the canonical story boss of region `region` (0..4) has already been killed on this save. */
export function isStoryBossDead(region: number, seen: Record<string, unknown>): boolean {
  const flag = BOSS_AFTER[region];
  return !!flag && !!seen[flag];
}

/** Pick a random replacement guardian boss without repeating within the same run until all pool entries are exhausted. */
export function pickPoolBoss(used: Set<string>, rnd: () => number = Math.random): EKind {
  let avail = BOSS_POOL_IDS.filter(id => !used.has(id));
  if (!avail.length) {
    used.clear();
    avail = [...BOSS_POOL_IDS];
  }
  const chosen = avail[Math.floor(rnd() * avail.length) % avail.length];
  used.add(chosen);
  return chosen;
}

/** If the region's story boss is already dead, swap every boss slot in `waves` with a fresh random guardian from `BOSS_POOL_IDS`. */
export function resolveBossRoomWaves(
  waves: string[][],
  region: number,
  seen: Record<string, unknown>,
  used: Set<string>,
  rnd: () => number = Math.random,
): { waves: string[][]; replaced: boolean; bossKind: EKind | null } {
  if (!isStoryBossDead(region, seen)) {
    return { waves: waves.map(w => [...w]), replaced: false, bossKind: null };
  }
  const chosen = pickPoolBoss(used, rnd);
  const next = waves.map(w => w.map(k => {
    const raw = k.endsWith('*') ? k.slice(0, -1) : k;
    return STORY_BOSSES.has(raw) || isBossKind(raw) ? chosen : k;
  }));
  return { waves: next, replaced: true, bossKind: chosen };
}
