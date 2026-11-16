// Chapter-1 enemies for v2. The ghoul and the lich are read from the v1 extracted data (read-only); the alpha wolf is ported
// from the 2D config (config/enemyEliteBoss.ts elite_alpha_wolf: 100 HP, 11 dmg, warrior / berserker).
import raw from '../../data/gameData.json';
import type { EnemyCfgV2, EnemyRank } from '../types';

const V1 = (raw as unknown as { enemies: Record<string, EnemyCfgV2> }).enemies;
const pick = (id: string): EnemyCfgV2 => { const e = V1[id]; if (!e) throw new Error('missing v1 enemy ' + id); return JSON.parse(JSON.stringify(e)); };

/** v4.1 (no distance): the ghoul opens with a guard turn instead of walking in; 虚弱 dropped from its loop (core2_report v4.1 数值调整) */
const ghoul = (): EnemyCfgV2 => {
  const g = pick('forest_ghoul');
  g.phases = [{ actions: [
    { type: '防御', baseValue: 5, description: '蹲伏' },
    { type: '攻击', baseValue: 10 },
    { type: '攻击', baseValue: 12, description: '撕咬' },
  ] }];
  return g;
};
/** v4.2: the lich's「攻击」are now direct spell hits (ENEMY_TRAITS.spellHits) — 亡灵风暴 16 → 12, 骸骨之矛 14 → 11, low-HP phase 8 / 8 → 6 / 6 */
const lich = (): EnemyCfgV2 => {
  const l = pick('boss_lich_forest');
  const v: Record<number, number> = { 16: 12, 14: 11, 8: 6 };
  for (const p of l.phases) p.actions = p.actions.map(a => (a.type === '攻击' && v[a.baseValue] ? { ...a, baseValue: v[a.baseValue] } : a));
  return l;
};
export const ENEMIES: Record<string, EnemyCfgV2> = {
  forest_ghoul: ghoul(),
  boss_lich_forest: lich(),
  // v4.1: chapter-1 normals ported from the 2D config (config/enemyNormal.ts) for the 盾卫嘲讽 encounter; not in the slice nodes
  forest_treant: {
    id: 'forest_treant', name: '腐化树人', hp: 42, dmg: 7, ct: 'guardian', arch: 'enforcer', cat: 'normal',
    phases: [{ actions: [
      { type: '防御', baseValue: 8 }, { type: '攻击', baseValue: 7 }, { type: '防御', baseValue: 6 }, { type: '攻击', baseValue: 10, description: '根须缠绕' },
    ] }],
    q: { enter: ['这片……森林……不欢迎你……', '（树根从地面涌出）'], death: ['森林……会记住……', '倒下了……但种子……已经播下……'], attack: ['根须！', '大地之力！'], hurt: ['树皮……裂了……', '不过是……划痕……'], lowHp: ['我的根……断了……但森林……永存……'] },
  },
  forest_banshee: {
    id: 'forest_banshee', name: '哀嚎女妖', hp: 16, dmg: 8, ct: 'caster', arch: 'pyromancer', cat: 'normal',
    phases: [{ actions: [
      { type: '技能', baseValue: 1, description: '易伤', scalable: false }, { type: '攻击', baseValue: 8 }, { type: '技能', baseValue: 1, description: '虚弱', scalable: false },
    ] }],
    q: { enter: ['啊啊啊——！', '听到了吗……死亡的歌声……'], death: ['终于……安息了……', '（哀鸣渐弱）'], attack: ['尖叫！', '死亡之歌！', '颤抖吧！'], hurt: ['（刺耳尖啸）', '痛苦……是我的养分……'], lowHp: ['最后……一曲……送你上路！'] },
  },
  forest_wolf_priest: {
    id: 'forest_wolf_priest', name: '月光狼灵', hp: 20, dmg: 7, ct: 'priest', arch: 'healer', cat: 'normal',
    phases: [{ actions: [
      { type: '技能', baseValue: 2, description: '剧毒', scalable: false }, { type: '技能', baseValue: 1, description: '易伤', scalable: false }, { type: '攻击', baseValue: 7 },
    ] }],
    q: { enter: ['呜——月光指引着我……', '嗅到了……猎物的气息……'], death: ['月光……暗了……', '呜……（倒下）'], attack: ['狼牙！', '月光之噬！'], hurt: ['嗷！', '这……不可能……'], lowHp: ['月光……给我力量……'] },
  },
  elite_alpha_wolf: {
    id: 'elite_alpha_wolf', name: '狼人首领', hp: 100, dmg: 11, ct: 'warrior', arch: 'berserker', cat: 'elite',
    phases: [{ actions: [
      // v2.2 tuning (core2_report 数值调整): 11/14/9 → 8 / 嚎叫(护甲 10) / 11 / 7, so a mage can chant once into the howl
      // v4.1 (no distance): the howl moves to the first turn (the old walk-in turn): 嚎叫 / 8 / 11 / 7
      { type: '防御', baseValue: 10, description: '嚎叫' },
      { type: '攻击', baseValue: 8 },
      { type: '攻击', baseValue: 11, description: '狂暴撕咬' },
      { type: '攻击', baseValue: 7 },
    ] }],
    q: {
      enter: ['月光之下……狼群为王！', '嗅到了……恐惧的味道……'],
      death: ['狼王……倒下了……', '（最后一声长嚎）'],
      attack: ['撕碎！', '狂暴！', '嗷——！'],
      hurt: ['疼痛……让我更愤怒！', '嗷呜！'],
      lowHp: ['月光……赐予我……最后的狂暴！'],
    },
  },
};

export function enemyCfgV2(id: string): EnemyCfgV2 { const e = ENEMIES[id]; if (!e) throw new Error('unknown v2 enemy ' + id); return e; }

/**
 * Per-fight scaling [hp, dmg] (tunable; the bot calibrates these). The lich keeps its spec HP (120). Damage scales mirror the v1
 * depth table at the slice's depths (normal ≈ depth 1, elite ≈ depth 4, mid boss = depth 7 → 1.0).
 */
export const FIGHT_SCALE: Record<'normal' | 'elite' | 'midBoss' | 'boss', { hp: number; dmg: number }> = {
  normal: { hp: 1.0, dmg: 0.6 },
  elite: { hp: 1.0, dmg: 0.75 },
  midBoss: { hp: 1.0, dmg: 1.0 },
  boss: { hp: 1.0, dmg: 1.0 },
};

/** Enemy traits from v1 (warrior blood fury, berserker vengeance). Off by default for v2: they are tuned for the v1 hand sizes. */
export const ENEMY_TRAITS = {
  bloodFury: false, vengeance: true,
  /** v4.1 盾卫嘲讽 (2D rule): while a guardian (ct 'guardian') lives, single-target skills can only hit a guardian. Switch kept for the sim comparison */
  taunt: true,
  /** v4.2 (user ruling): a caster / priest「攻击」is direct spell damage (blockable by armor, counts for 完防), not a random status */
  spellHits: true,
  /** v4.2: 完防 = every blockable hit this round fully blocked (stunned attackers count as blocked); poison / burn never break it.
   *  false = the v4 rule (one fully blocked hit is enough). Kept for the before / after comparison */
  guardAll: true,
};

/** Gold / xp per kill (SPEC 3.2): base, max overkill bonus (1 gold per 4 overkill), xp. */
export const DROPS: Record<EnemyRank, { gold: number; maxBonus: number; xp: number }> = {
  normal: { gold: 5, maxBonus: 3, xp: 5 },
  summon: { gold: 1, maxBonus: 0, xp: 1 },
  elite: { gold: 35, maxBonus: 15, xp: 30 },
  eliteMinion: { gold: 5, maxBonus: 3, xp: 5 },
  midBoss: { gold: 70, maxBonus: 35, xp: 70 },
  boss: { gold: 90, maxBonus: 45, xp: 90 },
};
export const OVERKILL_PER_GOLD = 4;
/**
 * melee enemies walk this many enemy turns before attacking (v1 used 2; v2 used 1).
 * v4.1 (user ruling): no distance — every enemy starts in range, so no「逼近」turn and no 'mov' intent / enemyMove event in play.
 * Enemy.distance stays as a field (always 0); the walking code is dormant (tests still set it to keep an enemy passive).
 */
export const MELEE_START_DISTANCE = 0;

/** Enemy junk-die rhythm (SPEC 5, from logic/elites.ts). v2.1 prototype: off (`on: false`). */
export const JUNK = { on: false, eliteCycle: 3, bossCurseHpRatio: 0.4, bossCurseCycle: 2, bossCrackedCycle: 3 };
/** v2.1 0.2: per-enemy summon caps for the prototype (overrides gameData maxTotal) */
export const SUMMON_MAX_TOTAL: Record<string, number> = { boss_lich_forest: 3 };
