// 技能说明的数据（11-18，用户：「把所有的技能描述都重新写一下，现在的纯看不懂，也没有图标配合」「强化卡片也难以辨认都是干嘛的，icon造型
// 和描述都很抽象」「选了强化后根本看不到自己选的强化是啥，在哪儿、如何释放，如何释放的教学不能是纯文字哈」）。
// 每条技能拆成三样，分开放（不把按法写进说明字符串里——合并后还要统一过一遍文字）：
//   按法 steps：按哪几颗键、按的顺序（界面上画成按钮小图）；
//   效果 effect：一句看得见的结果（agy gemini-3.8-flash-high 写、我核对，14 字为佳、最长 20 字）；
//   数值 num：一行小字（{v} / {v2} 照 boons.ts 的三档填），可以没有。
// 刀谱的按法先读 manuals.ts 的 how / air（另一个代理在填），没有就用这里的兜底表；秘传挂的键先读 Boon.slot，没有就用兜底表。
// 只放数据，不碰 three（单测直接读）。
import type { BtnName } from './input';
import type { Boon, BoonSlot } from './boons';
import { MANUALS, type Manual, type MoveKey } from './manuals';

/** a press, or a mark between presses: wait = a beat's pause (扫八方), more = the combo goes on (连环刀), cue = the moment (a perfect
 *  dodge's flash), release = let 斩 go as the button flashes white (破势), intent = the three 杀气 ingots full (不见刀) */
export type Step = MoveKey | 'wait' | 'more' | 'cue' | 'release' | 'intent';
export const isPress = (s: Step): s is MoveKey => s === 'attack' || s === 'hold' || s === 'dash' || s === 'jump' || s === 'dart';
/** the HUD button each kind of press is made on (藏锋 is the held 斩) */
export const KEY_BTN: Record<MoveKey, BtnName> = { attack: 'attack', hold: 'attack', dash: 'dash', jump: 'jump', dart: 'special' };
type Slot = Exclude<BoonSlot, null | undefined>;
export const SLOT_KEY: Record<Slot, MoveKey> = { attack: 'attack', stance: 'hold', dash: 'dash', jump: 'jump', dart: 'dart' };
/** where a pick lands and leaves its mark: one of the four buttons, or the health bar for a passive one */
export type MarkTarget = BtnName | 'hp';

// ---------------------------------------------------------------- 刀谱
/** the presses until manuals.ts carries its own `how` (the cut links start from a cut that has landed; 扫八方 waits a beat after the 2nd) */
const MANUAL_HOW: Record<string, { how: Step[]; air?: boolean }> = {
  chase: { how: ['dart', 'attack'] }, backDart: { how: ['dash', 'dart'] }, dbl: { how: ['jump', 'jump'] }, launch: { how: ['attack', 'jump'] },
  cutDart: { how: ['attack', 'dart'] }, keep: { how: ['attack', 'dash', 'attack'] }, pause: { how: ['attack', 'attack', 'wait', 'attack'] }, kick: { how: ['dash', 'jump'] },
};
/** the picture the button turns over to when the link opens (ironUi HintKey) — the card, the pages and the demonstration show the same one */
export const MANUAL_HINT: Record<string, string> = { chase: 'chase', backDart: 'back', dbl: 'dbl', launch: 'launch', cutDart: 'cdart', keep: 'keep', pause: 'pause', kick: 'kick' };
/** 效果 (agy; checked: 「轻敌」 means underestimating the foe → 敌人; 「回斩」 said twice → one) */
const MANUAL_EFFECT: Record<string, string> = {
  chase: '化烟掠到敌前，补一记重斩', backDart: '往身后甩三枚柳叶镖，冲刺不停', dbl: '凌空翻个跟头，再蹿一大截', launch: '一刀把敌人挑上半空，随之跃起',
  cutDart: '贴着脸扇形甩出三枚柳叶镖', keep: '闪到侧面接着砍，连环刀不断', pause: '原地旋身两周，扫开四周的人', kick: '贴地飞踢，踹飞挡路的人，撞墙再伤',
};
export function manualHow(m: Manual): { how: Step[]; air: boolean } {
  if (m.how?.length) return { how: [...m.how], air: !!m.air };
  const f = MANUAL_HOW[m.id]; return f ? { how: [...f.how], air: !!(f.air ?? m.air) } : { how: ['attack'], air: !!m.air };
}
/** the effect line: the manual's own (11-18 merge: manuals.ts now carries the rewritten line first and `how` beside it — its text wins;
 *  this table only speaks for a manual still in the old two-line form) */
export const manualEffect = (m: Manual) => (m.how?.length ? m.desc[0] : undefined) || MANUAL_EFFECT[m.id] || m.desc[1] || m.desc[0];
export const manualOf = (id: string) => MANUALS.find(m => m.id === id) ?? null;
/** the button a manual's card flies to (its first press) */
export function manualTarget(m: Manual): MarkTarget { const s = manualHow(m); const first = s.how.find(isPress) ?? 'attack'; return s.air && first !== 'jump' ? 'jump' : KEY_BTN[first]; }

// ---------------------------------------------------------------- 秘传
/** the button each of the 13 changes, until boons.ts says (null = passive: it marks the health bar) */
const BOON_SLOT: Record<string, BoonSlot> = {
  quick: 'attack', extra: 'attack', sunder: 'attack', bone: 'attack', behead: 'attack', bleed: 'attack', drink: 'attack', frenzy: 'attack',
  draw: 'stance', counter: 'stance', evade: 'dash', darts3: 'dart', bladeWind: 'attack',
};
const BOON_EFFECT: Record<string, string> = {
  quick: '连环刀每一刀出得更快', extra: '收尾一刀砍中，反手再追一刀', sunder: '斩中撕开破绽，数息内挨刀更痛', bone: '重招把人打得更远，发蒙更久',
  behead: '寻常敌人残血，一刀直接斩杀', bleed: '斩中叠起出血，最多五层流血不止', drink: '斩杀敌人，当场回一口血', frenzy: '血不到一半，出刀格外凶狠',
  draw: '藏锋蓄势更快，箭步斩力道更重', counter: '破势出刀更重，回一口血', evade: '完美闪避时机更宽，冲刺转好更快', darts3: '柳叶镖数枚齐发，扇面扑向身前',
  bladeWind: '收尾一刀飞出月牙刀光，穿透路上所有人',
};
const BOON_NUM: Record<string, string> = {
  quick: '出刀快 {v}', extra: '追一刀 {v} 力道', sunder: '挨刀更痛 {v}', bone: '发蒙多 {v}', behead: '血少于 {v}', bleed: '每层每秒 {v} 血',
  drink: '斩杀一人回 {v} 点血', frenzy: '出刀更狠 {v}', draw: '藏锋快 {v} · 箭步斩重 {v2}', counter: '破势更重 {v} · 回 {v2} 点血',
  evade: '闪避宽 {v} · 冲刺快 {v2}', darts3: '甩 {v} 枚', bladeWind: '刀芒 {v} 力道',
};
export function boonSlot(b: Boon): BoonSlot { return b.slot !== undefined ? b.slot : BOON_SLOT[b.id] ?? null; }
/** (11-18 merge: boons.ts now carries its own effect line `eff` and numbers line `note` — they win; these tables only for a boon without) */
export const boonEffect = (b: Boon) => b.eff ?? BOON_EFFECT[b.id] ?? b.desc.join('，');
/** the numbers line, still with its {v} / {v2} (cards.ts fillVals fills them for a tier) */
export const boonNum = (b: Boon) => b.note ?? BOON_NUM[b.id] ?? '';
export const boonSteps = (b: Boon): Step[] | null => { const s = boonSlot(b); return s ? [SLOT_KEY[s]] : null; };
export function boonTarget(b: Boon): MarkTarget { const s = boonSlot(b); return s ? KEY_BTN[SLOT_KEY[s]] : 'hp'; }

// ---------------------------------------------------------------- the moves she has from the start
export interface BaseSkill { id: string; name: string; steps: Step[]; effect: string; num?: string; /** the picture: a button's own, a link's, or one of skillIcons */ icon: string }
/** 开局就有的（CLAUDE.md act-18 五续）：连环刀、冲刺、穿风斩、跳、劈山、柳叶镖、藏锋 / 箭步斩、破势、回锋斩、不见刀 */
export const BASE_SKILLS: BaseSkill[] = [
  { id: 'lianhuan', name: '连环刀', steps: ['attack', 'attack', 'more'], effect: '连出五刀，收尾一刀跃起重劈', icon: 'btn:attack' },
  { id: 'dash', name: '冲刺', steps: ['dash'], effect: '疾掠而过，刚冲出去那一下不挨打', icon: 'btn:dash' },
  { id: 'dcut', name: '穿风斩', steps: ['dash', 'attack'], effect: '一刀斩透路上所有人，停在身后', icon: 'hint:dcut' },
  { id: 'jump', name: '跳', steps: ['jump'], effect: '纵身腾起，避开贴地扑咬与砸地', icon: 'btn:jump' },
  { id: 'plunge', name: '劈山', steps: ['jump', 'attack'], effect: '凌空重劈砸地，震开周围一圈人', icon: 'hint:plunge' },
  { id: 'dart', name: '柳叶镖', steps: ['dart'], effect: '甩出一枚柳叶镖，直打最近的敌人', num: '备三枚，用完慢慢补', icon: 'btn:special' },
  { id: 'iai', name: '藏锋 · 箭步斩', steps: ['hold'], effect: '拔刀化光冲出，路上的人一起裂开', num: '拔刀花一格气', icon: 'sk:stance' },
  { id: 'parry', name: '破势', steps: ['hold', 'release'], effect: '把人震开、箭原路射回，加倍还上一刀', num: '花一格气，接住也不还', icon: 'sk:parry' },
  { id: 'counter', name: '回锋斩', steps: ['dash', 'cue', 'attack'], effect: '出刀力道翻倍，打得对方身形一顿', icon: 'hint:counter' },
  { id: 'ult', name: '不见刀', steps: ['intent', 'attack'], effect: '残影齐斩周围众敌，归鞘连爆八刀', num: '要三格杀气', icon: 'sk:ult' },
];

// ---------------------------------------------------------------- the words on the pages and the demonstration (agy)
export const UI_WORDS = { owned: '已得', skills: '招式', ownedEmpty: '手里只有这把刀', demoSkip: '点按跳过', base: '身手', manual: '刀谱', boon: '秘传' } as const;
