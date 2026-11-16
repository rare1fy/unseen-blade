// Rules-layer types. No three.js, no DOM: everything here is plain data that the presentation layer reads.

export type StatusType = 'poison' | 'burn' | 'vulnerable' | 'weak' | 'strength' | 'freeze' | 'slow';
export interface Status { type: StatusType; value: number; duration?: number }

/** Die effect keys used by the original's dice data (data/dice.ts onPlay). Only the ones this build implements are listed. */
export interface OnPlay {
  bonusDamage?: number; bonusMult?: number; heal?: number; pierce?: number; selfDamage?: number; selfDamagePercent?: number;
  statusToEnemy?: Status; armor?: number; armorFromTotalPoints?: boolean; armorMultFromTotalPoints?: number; armorBreak?: boolean;
  armorToDamage?: boolean; scaleWithHits?: boolean; scaleWithLostHp?: number; executeThreshold?: number; executeMult?: number; executeHeal?: number;
  aoe?: boolean; aoeDamage?: number; healFromValue?: boolean; healOrMaxHp?: boolean; lowHpOverrideValue?: number; lowHpThreshold?: number;
  requiresTriple?: boolean; bonusDamageFromPoints?: number; scaleWithBloodRerolls?: boolean; selfBerserk?: boolean; scaleWithSelfDamage?: boolean;
  damageFromArmor?: number; purifyAll?: boolean; purifyOne?: boolean; tauntAll?: boolean; splinterDamage?: number; ignoreForHandType?: boolean;
  [k: string]: unknown;
}
export interface DieDef {
  id: string; name: string; element: string; faces: number[]; description: string; rarity: string;
  onPlay?: OnPlay; isCursed?: boolean; isCracked?: boolean; isElemental?: boolean;
}
export interface Die {
  uid: number; defId: string; def: DieDef; value: number; element: string;
  temp: boolean; spent: boolean;
}

export interface EnemyAction { type: '攻击' | '技能' | '防御'; baseValue: number; description?: string; scalable?: boolean; curseDice?: string; curseDiceCount?: number }
export interface EnemyPhase { hpThreshold?: number; actions: EnemyAction[] }
export interface EnemyCfg {
  id: string; name: string; hp: number; dmg: number; ct: string; arch?: string; cat: string; rank?: string; ch?: number;
  phases: EnemyPhase[];
  summons?: { minionId: string; interval: number; offset?: number; count?: number; maxTotal?: number; waveCap?: number; hpThreshold?: number };
  revive?: { reviveHpRatio: number; splitInto?: number; splitMinionId?: string };
  drops?: { gold?: number; relic?: boolean };
  q?: Partial<Record<QuoteKind, string[]>>;
}
export type QuoteKind = 'enter' | 'death' | 'attack' | 'hurt' | 'lowHp';
export interface Enemy {
  uid: number; cfgId: string; name: string; hp: number; maxHp: number; armor: number; attackDmg: number;
  ct: string; arch?: string; cat: string; statuses: Status[]; distance: number; attackCount: number;
  hpScale: number; dmgScale: number; dropGold: number; summoned: number; isSummoned: boolean; revived: boolean;
  wasFrozen: boolean; dead: boolean; quotedLow: boolean; phaseIdx: number; killedDirect?: boolean; overkill?: number;
  /** warrior-type trait: +1 when hit by a play and survives (cap 4); attack ×(1 + 0.25/0.40 per stack) */
  bloodFury: number;
  /** berserker trait: +1 per ally killed by a play; attack ×(1 + 0.5 per stack), uncapped */
  vengeance: number;
  /** summoned at the start of this enemy turn: does not act until next turn */
  justSummoned: boolean;
}

export interface RelicDef { id: string; name: string; desc: string; rarity: string; trigger: string }

/** Where a relic's effect visibly goes (the v5 relic flight target). */
export type RelicTarget = 'weapon' | 'hero' | 'gold';

/** One line of the settlement breakdown, in order — the presentation stamps these in one by one. */
export interface OutcomeStep {
  kind: 'base' | 'hand' | 'die' | 'relic' | 'mod';
  label: string; txt: string;
  v?: number; uid?: number; id?: string; dmg?: number; mult?: number; armor?: number; heal?: number; gold?: number; to?: RelicTarget;
}
export interface Outcome {
  X: number; handMult: number; baseDamage: number; multiplier: number; extra: number; armor: number; heal: number; pierce: number;
  armorBreak: boolean; statuses: Status[]; purify: number; gold: number; relics: string[]; tags: string[];
  post: Array<[string, number?]>; steps: OutcomeStep[];
  hands: { bestHand: string; activeHands: string[] }; skipOnPlay: boolean; aoe: boolean; tier: number;
  total: number; damage: number;
}
