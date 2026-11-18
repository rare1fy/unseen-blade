// 11-18 (用户：「把所有的技能描述都重新写一下，现在的纯看不懂，也没有图标配合」): 按法和时机由按钮小图显示，效果和数值单独排。
import type { BtnName } from './input';
import type { Boon, BoonSlot, SkillBoon } from './boons';
import { MANUALS, type LinkCue, type Manual, type MoveId, type MoveKey } from './manuals';

export type Step = MoveKey | LinkCue | 'wait' | 'more' | 'air' | 'cue' | 'full' | 'release' | 'intent' | 'ring';
export const isPress = (s: Step): s is MoveKey => s === 'attack' || s === 'hold' || s === 'dash' || s === 'jump' || s === 'dart';
export const KEY_BTN: Record<MoveKey, BtnName> = { attack: 'attack', hold: 'attack', dash: 'dash', jump: 'jump', dart: 'special' };
const SLOT_KEY: Record<Exclude<BoonSlot, null>, MoveKey> = { attack: 'attack', stance: 'hold', dash: 'dash', jump: 'jump', dart: 'dart' };
export type MarkTarget = BtnName | 'hp';

// The HUD's link colours also identify the move on the card and the two pause pages.
export const LINK_COLORS = {
  dcut: 0x4cc4ff, plunge: 0xff6a3a, counter: 0xffcc40,
  chase: 0x9a7aff, back: 0xffb040, dbl: 0x5aa8ff, launch: 0xffd84a, cdart: 0xff5a48, keep: 0x3ad6a8,
  pause: 0xff9a40, kick: 0xff8a50, acut: 0xff5ac8, swoop: 0x40e090, reel: 0xe8306a, stomp: 0xb0e040,
};
export const STANCE_COLORS = { stance: 0xff7a2a, parry: 0xfff6e0, ult: 0xffd060 };
export type LinkIcon = keyof typeof LINK_COLORS;
export const MANUAL_HINT: Record<MoveId, LinkIcon> = {
  chase: 'chase', backDart: 'back', dbl: 'dbl', launch: 'launch', cutDart: 'cdart', keep: 'keep', pause: 'pause',
  kick: 'kick', acut: 'acut', swoop: 'swoop', reel: 'reel', stomp: 'stomp',
};

export const manualOf = (id: string) => MANUALS.find(m => m.id === id) ?? null;
export function manualSteps(m: Manual): Step[] {
  // Air manuals still need the first jump in their teaching sequence, even if the move itself also uses jump.
  const steps: Step[] = m.air ? ['jump', 'air'] : [];
  m.how.forEach((key, i) => {
    if (i === m.pauseAt) steps.push('wait');
    if (i === m.how.length - 1 && m.cue) steps.push(m.cue);
    steps.push(key);
  });
  return steps;
}
export const manualTarget = (m: Manual): MarkTarget => KEY_BTN[m.how[0]];

export const boonEffect = (b: Boon) => b.eff ?? '';
export const boonSteps = (b: SkillBoon): Step[] | null => b.slot ? [SLOT_KEY[b.slot]] : null;
export const boonTarget = (b: SkillBoon): MarkTarget => b.slot ? KEY_BTN[SLOT_KEY[b.slot]] : 'hp';

export type BaseIcon = `btn:${BtnName}` | LinkIcon | 'stance' | 'parry' | 'ult';
export interface BaseSkill { id: string; name: string; steps: Step[]; effect: string; num?: string; icon: BaseIcon }
export const BASE_SKILLS: BaseSkill[] = [
  { id: 'lianhuan', name: '连环刀', steps: ['attack', 'attack', 'more'], effect: '连挥五式，收尾跃起一刀重劈', icon: 'btn:attack' },
  { id: 'dash', name: '冲刺', steps: ['dash'], effect: '贴地疾冲，起步时能躲过攻击', icon: 'btn:dash' },
  { id: 'dcut', name: '穿风斩', steps: ['dash', 'attack'], effect: '带刀冲到敌后，沿路每人挨一刀', icon: 'dcut' },
  { id: 'jump', name: '跳', steps: ['jump'], effect: '蹬地跳起，躲过贴地扫来的招', icon: 'btn:jump' },
  { id: 'plunge', name: '劈山', steps: ['jump', 'air', 'attack'], effect: '从空中挥刀砸地，震开周围的人', icon: 'plunge' },
  { id: 'dart', name: '柳叶镖', steps: ['dart'], effect: '飞镖直奔最近的人，扎中就钉住', num: '备三枚，用完会补', icon: 'btn:special' },
  { id: 'iai', name: '藏锋 · 箭步斩', steps: ['hold', 'full', 'release'], effect: '拔刀冲过一排人，停步后齐齐中刀', num: '用一格气', icon: 'stance' },
  { id: 'parry', name: '破势', steps: ['hold', 'cue', 'release'], effect: '架开来招，震退近敌，把箭弹回去', num: '用一格气', icon: 'parry' },
  { id: 'counter', name: '回锋斩', steps: ['dash', 'cue', 'attack'], effect: '闪开来招，回手一刀打退敌人', num: '伤害翻倍', icon: 'counter' },
  { id: 'ult', name: '不见刀', steps: ['intent', 'cue', 'ring', 'attack'], effect: '分身齐斩，归鞘连爆八刀再交斩', num: '需三格杀气', icon: 'ult' },
];

export const UI_WORDS = { owned: '已得', skills: '招式', ownedEmpty: '手里只有这把刀', demoSkip: '点按跳过', base: '身手', manual: '刀谱', boon: '秘传' } as const;
