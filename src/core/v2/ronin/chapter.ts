// 浪人篇 (docs/ronin/DESIGN.md): the run is three chapters of ten layers; no world map. After each node the scene shows 2–3 exits
// (route options); the player walks through one. Rules only (no three / DOM): the stances, the layer plan, the route options, the
// Japanese enemies. Run2 calls advanceRoute / takeRoute when its state carries `route`.
import type { ClassId, EnemyCfgV2 } from '../types';
import type { Rng } from '../../rng';
import { ENEMIES } from '../data/enemies';

// ------------------------------------------------------------------ stances (DESIGN §5, user 11-15: 每局游戏选一个架势开始)
export type StanceId = 'sutemi' | 'nito' | 'iai';
export const STANCES: StanceId[] = ['sutemi', 'nito', 'iai'];
/** a stance runs one class's mechanics unchanged (捨身 = 狂战, 二刀 = 刺客, 居合 = 魔导) */
export const STANCE_CLASS: Record<StanceId, ClassId> = { sutemi: 'warrior', nito: 'rogue', iai: 'mage' };
export const CLASS_STANCE: Record<ClassId, StanceId> = { warrior: 'sutemi', rogue: 'nito', mage: 'iai' };
export const STANCE_CN: Record<StanceId, string> = { sutemi: '捨身', nito: '二刀', iai: '居合' };
/** one line each for the stance plinths */
export const STANCE_LINE: Record<StanceId, string> = {
  sutemi: '拿血换出手，砍倒一个就接着砍下一个。',
  nito: '一长一短，一回合砍很多刀，一刀比一刀狠。',
  iai: '刀不出鞘，攒着；攒够了，一刀定胜负。',
};
/** 浪人 has one life bar whatever the stance (DESIGN §5.1) */
export const RONIN_HP = 100;

// ------------------------------------------------------------------ the chapters (DESIGN §2.2)
export type RouteKind = 'normal' | 'elite' | 'shop' | 'camp' | 'midBoss' | 'event';
/** what the signpost's bottom row shows (DESIGN §3.2): the reward of going there */
export type RewardKind = 'build' | 'relic' | 'slot' | 'stance' | 'heal' | 'shop' | 'event';
export const REWARD_OF: Record<RouteKind, RewardKind> = { normal: 'build', elite: 'relic', midBoss: 'slot', shop: 'shop', camp: 'heal', event: 'event' };
export const ROUTE_CN: Record<RouteKind, string> = { normal: '战斗', elite: '精英', shop: '商人', camp: '营火', midBoss: '首领', event: '事件' };

export interface LayerDef {
  /** candidate kinds for a free layer (2–3 of them are offered), or one fixed node */
  kinds?: RouteKind[]; n?: [number, number]; fixed?: RouteKind;
  /** the locales the exits of this layer may lead to */
  locales: string[];
}
export interface ChapterDef { id: number; season: 'spring' | 'summer' | 'autumn' | 'winter'; layers: LayerDef[] }

const W = 'ninja_wilds', T = 'ninja_temple', V = 'ninja_village';
/** chapter 1 (秋 · 狭雾山, STORY.md): 竹山 layers 1–4, 山寺 5–7 (the mid-boss at the main hall's steps), 忍里 8–10. Events are designed
 *  (DESIGN §2.5) but not built yet: until they are, an 'event' option becomes a shop */
export const CHAPTERS: ChapterDef[] = [
  { id: 1, season: 'autumn', layers: [
    { fixed: 'normal', locales: [W] },
    { kinds: ['normal', 'event'], n: [2, 2], locales: [W] },
    { kinds: ['normal', 'elite', 'shop'], n: [2, 3], locales: [W] },
    { kinds: ['normal', 'event', 'camp'], n: [2, 3], locales: [W] },
    { fixed: 'midBoss', locales: [T] },
    { kinds: ['normal', 'elite', 'event'], n: [2, 3], locales: [T] },
    { kinds: ['normal', 'shop', 'event'], n: [2, 3], locales: [T] },
    { kinds: ['normal', 'elite'], n: [2, 2], locales: [V] },
    { fixed: 'camp', locales: [V] },
    { fixed: 'midBoss', locales: [V] },
  ] },
];
export const EVENTS_BUILT = false;

// ------------------------------------------------------------------ enemies (DESIGN §6.3, chapter 1). Barks come later (agy).
const E = (c: EnemyCfgV2) => { ENEMIES[c.id] = c; return c.id; };
export const JP = {
  bandit: E({ id: 'jp_bandit', name: '山贼', hp: 28, dmg: 9, ct: 'warrior', arch: 'enforcer', cat: 'normal',
    phases: [{ actions: [{ type: '防御', baseValue: 5, description: '蹲守' }, { type: '攻击', baseValue: 9 }, { type: '攻击', baseValue: 11, description: '柴刀' }] }] }),
  dog: E({ id: 'jp_dog', name: '山犬', hp: 14, dmg: 6, ct: 'warrior', arch: 'enforcer', cat: 'normal',
    phases: [{ actions: [{ type: '攻击', baseValue: 6 }, { type: '攻击', baseValue: 6 }, { type: '攻击', baseValue: 9, description: '扑咬' }] }] }),
  chief: E({ id: 'jp_bandit_chief', name: '山贼头目', hp: 90, dmg: 9, ct: 'warrior', arch: 'berserker', cat: 'elite',
    phases: [
      { hpThreshold: 0.4, actions: [{ type: '攻击', baseValue: 16, description: '大钺' }, { type: '攻击', baseValue: 10 }] },
      { actions: [{ type: '防御', baseValue: 10, description: '吼叫' }, { type: '攻击', baseValue: 9 }, { type: '攻击', baseValue: 14, description: '大钺' }, { type: '攻击', baseValue: 8 }] },
    ] }),
};
const B = JP.bandit, D = JP.dog;
/** chapter-1 encounters by tier (layer 1 = tier 0, deeper layers draw deeper tiers) */
export const C1_FIGHTS: { first: string[][]; normal: string[][][][]; elite: string[][][][]; mid: string[][]; boss: string[][] } = {
  /** the chapter's opening fight (STORY.md 八: a dog out of the fog, two bandits behind it) */
  first: [[D, B, B]],
  normal: [
    [[[B, D]], [[B, B]]],
    [[[B, D, D]], [[B, B, D]], [[B], [B, D]]],
    [[[B, B, D]], [[B, D], [B, B]]],
  ],
  elite: [[[[JP.chief]]]],
  // placeholders until the chapter's own bosses exist (STORY.md): the mid-boss is the bandit chief with one man, the boss the same
  mid: [[B], [JP.chief, B]],
  boss: [[B, D], [JP.chief, B]],
};
const tierOf = (layer: number) => (layer < 2 ? 0 : layer < 6 ? 1 : 2);

// ------------------------------------------------------------------ route state and options
export interface RouteOpt {
  kind: RouteKind;
  /** fights only */
  waves?: string[][];
  /** where the exit leads (an assembler locale id) */
  locale: string;
  reward: RewardKind;
  /** how many enemies stand there (fights; the signpost's little figures) */
  foes?: number;
}
export interface RouteState {
  chapter: number;
  /** 0-based layer of the node being played / just finished */
  layer: number;
  stance: StanceId;
  /** the exits on offer after the current node (null while a node is being played) */
  options: RouteOpt[] | null;
  /** the locale of the current node */
  locale: string;
  /** the exits the current node will offer when it is done (rolled on entering it, so its scene can cut in that many roads) */
  next?: RouteOpt[] | null;
  /** the road the hero came in by (the new scene keeps it open: he walks in along it) */
  cameBy?: 'left' | 'right' | 'back' | null;
}

const pick = <T>(rng: Rng, a: T[]) => a[Math.floor(rng.next() * a.length) % a.length];
function fightOf(kind: RouteKind, layer: number, rng: Rng): string[][] | undefined {
  if (kind === 'normal' && layer === 0) return C1_FIGHTS.first.map(w => w.slice());
  if (kind === 'normal') return pick(rng, C1_FIGHTS.normal[tierOf(layer)]).map(w => w.slice());
  if (kind === 'elite') return pick(rng, C1_FIGHTS.elite[0]).map(w => w.slice());
  if (kind === 'midBoss') return (layer === 9 ? C1_FIGHTS.boss : C1_FIGHTS.mid).map(w => w.slice());
  return undefined;
}
/** the node a layer opens with when it is fixed (layer 0's first fight, the mid-boss, the camp, the boss) */
export function fixedNode(ch: ChapterDef, layer: number, rng: Rng): RouteOpt | null {
  const L = ch.layers[layer]; if (!L?.fixed) return null;
  const waves = fightOf(L.fixed, layer, rng);
  return { kind: L.fixed, waves, locale: L.locales[0], reward: REWARD_OF[L.fixed], foes: waves ? waves.reduce((n, w) => n + w.length, 0) : undefined };
}
/** the exits offered for `layer` (DESIGN §2.2): 2–3 distinct kinds, at least one fight, each to its own locale where it can */
export function routeOptions(ch: ChapterDef, layer: number, rng: Rng): RouteOpt[] {
  const L = ch.layers[layer];
  if (L.fixed) return [fixedNode(ch, layer, rng)!];
  const kinds = (L.kinds ?? ['normal']).map(k => (k === 'event' && !EVENTS_BUILT ? 'shop' : k));
  const uniq = [...new Set(kinds)];
  const n = Math.min(uniq.length, L.n ? L.n[0] + Math.floor(rng.next() * (L.n[1] - L.n[0] + 1)) : 2);
  const order = rng.shuffle(uniq.slice());
  if (!order.slice(0, n).some(k => k === 'normal' || k === 'elite')) { const f = order.indexOf('normal'); if (f >= 0) { order.splice(f, 1); order.unshift('normal'); } }
  const locs = rng.shuffle(L.locales.slice());
  return order.slice(0, n).map((kind, i) => {
    const waves = fightOf(kind, layer, rng);
    return { kind, waves, locale: locs[i % locs.length], reward: REWARD_OF[kind], foes: waves ? waves.reduce((a, w) => a + w.length, 0) : undefined };
  });
}
