// Rules v2 types (SPEC_v2 §6). Plain data only: no three.js, no DOM. Data tables live in ./data/*, logic in cond.ts / battle2.ts / run2.ts.

export type ClassId = 'warrior' | 'mage' | 'rogue';
export type Suit =
  | 'axe' | 'blood' | 'fury'
  | 'star' | 'moon' | 'sun' | 'void'
  | 'poison' | 'blade' | 'shadow'
  | 'none';

export interface Face { value: number; suit: Suit }

export type DieKind = 'normal' | 'furyDie' | 'titanDie' | 'starDie' | 'shadowDie' | 'cracked' | 'cursed';
/** turn: gone at turn end · untilUsed: may stay one more turn (fury die, shadow die) · retained: mage chant keeps it */
export type Persist = 'turn' | 'untilUsed' | 'retained';
export type DieSource = 'base' | 'earned' | 'mechanic' | 'enemy';

export interface Die {
  uid: number; kind: DieKind; face: Face;
  persist: Persist; source: DieSource;
  /** turns this die has already been carried over (fury die: max 1, or 2 with 余烬怒火) */
  carried: number;
  /** rules v5 魔导: left over from last turn, cannot be rerolled this turn */
  locked?: boolean;
  /** rules v5 (GROWTH_V5 §4): which base die of the bag this is (0..2) and the carved suit on the face it shows now */
  bag?: number; carve?: 'fire' | 'ice' | 'gold' | null;
  /** 凝元 (SKILL_REDESIGN_V5 §17.4): a suit the die carries on every face (this die only, not the bag) */
  imbue?: 'fire' | 'ice';
}

// ── conditions and tiers ─────────────────────────────────
export type Condition =
  | { t: 'suit'; suit: Suit; companions?: number }
  | { t: 'sameValue' }
  | { t: 'straight' }
  | { t: 'allAtLeast'; value: number }
  | { t: 'everyValuePaired' }
  | { t: 'suitMix'; need: Partial<Record<Suit, number>>; atLeast?: boolean }
  | { t: 'twoPair' } | { t: 'fullHouse' }
  /** 千钧: hand in n dice whose points sum to at least byCount[n] */
  | { t: 'sumAtLeast'; byCount: Record<number, number> }
  /** 元素交汇: ≥ minDice dice, at least minSuits suits with ≥ perSuit dice each; other dice may ride along */
  | { t: 'mixedRelease'; minDice: number; minSuits: number; perSuit: number }
  | { t: 'any'; min: number; max: number }
  /** v3 阵列: ≥2 groups, each the same value with ≥2 dice, every die in a group (2+2, 3+2, 4+2, 3+3, 2+2+2) */
  | { t: 'array' };

/** Tier ids. v2.1: each row writes its own steps (count → tier); the names are ids only, `ultimate` = 终极特权. */
export type TierName = 'single' | 'feed' | 'area' | 'earn' | 'ultimate';
export const TIER_ORDER: TierName[] = ['single', 'feed', 'area', 'earn', 'ultimate'];

/** One lamp on the row: from `min` dice handed in, the row plays `tier`. */
export interface TierStep { min: number; tier: TierName; label: string }
export interface TierRule {
  /** ascending by min; steps[0].min is the row's minimum dice */
  steps: TierStep[];
  /** combo rows: exactly this many dice */
  fixedCount?: number;
  /** counted dice bonus (降维: straight counts one longer) */
  countBonus?: number;
  /** max dice that can be handed in */
  maxDice?: number;
}

// ── effects ──────────────────────────────────────────────
/** v3: 'other' = one random other enemy (none if alone); 'two' / 'three' / 'four' = the target plus 1 / 2 / 3 others */
export type Target = 'one' | 'all' | 'adjacent' | 'others' | 'second' | 'other' | 'two' | 'three' | 'four';
export type StatusV2 = 'poison' | 'burn' | 'freeze' | 'stun' | 'vulnerable' | 'weak' | 'berserk';
/** v2.2 灼烧: held = layers a 2+ 日行 laid in an earlier play (kept through turn ends until the mage's next play resolves); heldNew = laid by the play in progress */
export interface Status { type: StatusV2; value: number; duration?: number; held?: number; heldNew?: number }

export type Effect = EffectBody & { /** v2.2: only on the 1st / 2nd strike of the turn (刃行) */ onStrike?: 1 | 2 };
export type EffectBody =
  /** damage = (X × coef × mul + flat) × bonus × modifiers */
  | { t: 'dmg'; target: Target; mul?: number; flat?: number; ignoreArmor?: boolean; armorBreak?: boolean; raw?: boolean; /** v3 处决: target HP below this share dies outright */ exec?: number }
  /** armor = X × coef2 × mul (of 'coef2'), points of one suit × mul, or a flat mul */
  | { t: 'armor'; mul: number; of: 'coef2' | 'suitPoints' | 'flat'; suit?: Suit }
  | { t: 'barrier'; mul: number }
  | { t: 'heal'; mul: number; of: 'X' | 'dmg' | 'suitPoints' | 'flat'; suit?: Suit; overArmor?: number }
  /** value, or X × ofX when ofX is set */
  | { t: 'status'; status: StatusV2; value: number; ofX?: number; duration?: number; target: Target | 'self' }
  | { t: 'stun'; target: Target; look?: 'freeze' | 'stun'; turns?: number; elseWeak?: number }
  | { t: 'taunt' }
  | { t: 'purify'; n: number }
  | { t: 'earnDie' }
  | { t: 'capUp'; which: 'behead' | 'guard'; n: number }
  | { t: 'rage'; n: number }
  | { t: 'freeBlood' }
  | { t: 'spawnShadow'; n: number }
  | { t: 'extraStrike'; n: number }
  | { t: 'resonance'; n: number }
  | { t: 'hook'; id: string; p?: Record<string, number> };

export interface Tier { effects: Effect[]; coefMul?: number; coefAdd?: number }

/** row level I–III; v4.2: the 刀鞘 slot (meta row) can reach IV (start 2 → 5 strikes) */
export type Level = 1 | 2 | 3 | 4;
export interface EvoDef {
  id: string; name: string; desc: string;
  /** returns the evolved row (pure function over data) */
  apply: (r: RowDef) => RowDef;
  /** false = data only, the engine does not implement the special part yet */
  implemented: boolean;
}
export interface RowDef {
  id: string; name: string; classId: ClassId;
  cond: Condition; tierRule: TierRule;
  /** v2.2: may only be played as this strike (背刺 = 2) */
  onlyAsStrike?: 2;
  /** v2.2: which dice count for the tier: 'matching' (default; fury row companions do not raise it) or 'all' handed in (元素交汇) */
  tierCount?: 'matching' | 'all';
  tiers: Partial<Record<TierName, Tier>>;
  coef: [number, number, number];
  /** second coefficient (axe row armor) */
  coef2?: [number, number, number];
  /** flags read by the engine (e.g. 'execute30', 'bolts') with numeric params */
  flags?: Record<string, number>;
  evolutions: [EvoDef, EvoDef];
  /** 'v4' = rules v4 row; 'basic' = the class loose-dice skill slot; 'meta' = a growth slot with no dice (刀鞘). Neither is on the board */
  tags: Array<'suit' | 'point' | 'tool' | 'pattern' | 'v4' | 'basic' | 'meta'>;
  /** v3: extra effects added to every tier from this level on (III) */
  levelFx?: Partial<Record<Level, Effect[]>>;
  /** v3: what levels II and III add, for the upgrade card */
  levelDesc?: [string, string];
  /** v4: highest level this row can reach (default 3); level-up cards and the shop never offer a row at its cap */
  maxLevel?: Level;
  /** v4: pure transforms applied by slotRow() for every level the slot has reached (II, then III) */
  levelUp?: Partial<Record<2 | 3, (r: RowDef) => RowDef>>;
  /** short UI hint: condition icon kind */
  icon: { kind: 'suit' | 'same' | 'straight' | 'atLeast' | 'sum' | 'pairs' | 'mix' | 'twoPair' | 'fullHouse' | 'one' | 'array'; suit?: Suit; suits?: Suit[]; value?: number };
}

export interface TabletDef {
  id: string; classId: ClassId; name: string; style: 'suit' | 'point' | 'pattern';
  /** 动作逻辑 (v2.1) */
  question: string;
  startRows: string[];
  pool: string[];
  maxRows: number;
  allowBorrow: boolean;
  /** the other tablet whose rows may be borrowed (1 slot) */
  borrowFrom?: string;
  /** prototype tablet (战意 / 星界元素 / 影袭) */
  prototype: boolean;
}

export interface RowSlot { rowId: string; level: Level; evolvedTo?: string; borrowed?: boolean }
export interface TabletInstance { tabletId: string; slots: RowSlot[] }
export interface Loadout { version: 'A' | 'B'; tablets: TabletInstance[] }

export interface TalentDef {
  id: string; classId: ClassId; name: string; desc: [string, string];
  /** v2.1: only offered when it does something for this loadout */
  validFor: (l: Loadout) => boolean;
}

export interface ClassDefV2 {
  id: ClassId; name: string; hp: number;
  suitOf: (value: number) => Suit;
  suitTable: Suit[];            // index = value 1..6 → suit (index 0 unused)
  baseDice: number; maxDice: number;
  freeRerolls: number;
  strikesPerTurn: number; maxStrikes: number;
  leftover: 'dissipate' | 'retain' | 'secondStrike';
  overflow: 'damagePct' | 'discard';
  basicAttack: { minDice: number; maxDice: number; coef: number; name: string; shadowify?: boolean };
  specialDice: DieKind[];
  mechanics: string[];
  earnDieMode: 'nextTurnPlusOne' | 'resonance' | 'strikePlusShadow';
  tablets: string[];
  /** version A starting rows (two single-row tablets) */
  versionA: [string, string];
  talents: TalentDef[];
}

export interface RelicDefV2 {
  id: string; name: string; desc: string; rarity: 'common' | 'uncommon' | 'rare'; classId?: ClassId; tag: string;
  trigger: 'onStrike' | 'onKill' | 'onHit' | 'onTurnStart' | 'onBattleEnd' | 'passive';
  economy?: boolean; perBattleCap?: number;
  /** v2.1 4.2: never offered in the prototype */
  prototypeBanned?: boolean;
  /** v2.1 4.4: in the prototype shop pool */
  prototype?: boolean;
}

// ── enemies ──────────────────────────────────────────────
export interface EnemyAction { type: '攻击' | '技能' | '防御'; baseValue: number; description?: string; scalable?: boolean; curseDice?: string }
export interface EnemyPhase { hpThreshold?: number; actions: EnemyAction[] }
export type EnemyRank = 'normal' | 'summon' | 'elite' | 'eliteMinion' | 'midBoss' | 'boss';
export interface EnemyCfgV2 {
  id: string; name: string; hp: number; dmg: number; ct: string; arch?: string; cat: 'normal' | 'elite' | 'boss';
  phases: EnemyPhase[];
  summons?: { minionId: string; interval: number; offset?: number; count?: number; maxTotal?: number; waveCap?: number; hpThreshold?: number };
  q?: Record<string, string[]>;
}
export interface Enemy {
  uid: number; cfgId: string; name: string; hp: number; maxHp: number; armor: number; attackDmg: number;
  ct: string; arch?: string; cat: 'normal' | 'elite' | 'boss'; rank: EnemyRank;
  statuses: Status[]; distance: number;
  /** turns of freeze / stun immunity left */
  ctlImmune: number;
  /** boss hit by control: next action value halved */
  interrupted: boolean;
  /** set when the enemy skipped its action because of the player's stun (warrior 震慑) */
  skipped: boolean;
  taunted: boolean;
  summoned: number; isSummoned: boolean; justSummoned: boolean;
  dead: boolean; phaseIdx: number; vengeance: number; quotedLow: boolean;
  overkill: number; killedDirect: boolean;
  /** enemy turns this enemy has taken part in (action index, summon / junk rhythm) */
  age: number;
}
