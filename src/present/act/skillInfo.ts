// 11-18 (用户：「把所有的技能描述都重新写一下，现在的纯看不懂，也没有图标配合」): 按法和时机由按钮小图显示，效果和数值单独排。
import type { BtnName } from './input';
import type { Boon, BoonSlot, SkillBoon } from './boons';
import { MANUALS, type LinkCue, type Manual, type MoveId, type MoveKey } from './manuals';
import type { WeaponId } from './weapons';

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
export interface BaseSkill { id: string; name: string; steps: Step[]; effect: string; num?: string; icon: BaseIcon; slot?: Exclude<BoonSlot, null>; weaponId?: WeaponId }

/** Weapon-aware base moveset: adapts primary combo, 藏锋 stance art, and 破势 notes to the currently equipped blade & forge tier. */
export function baseSkillsForWeapon(wid: WeaponId = 'hanshan', lv = 0): BaseSkill[] {
  const combo: Record<WeaponId, { name: string; effect: string; num?: string }> = {
    hanshan: { name: '连环刀', effect: '五段连环斩，收尾跃起一记重劈', num: lv >= 1 ? '末刀带月牙刀光' : '五段均衡连招' },
    thunder: { name: '惊雷三斩', effect: '三段重斩大开大合，末刀霸体强击飞', num: lv >= 1 ? '撞墙伤害翻倍' : '高削韧 · 末刀霸体' },
    frost:   { name: '霜鳞六连', effect: '六段疾风快刀，每三刀自动钉影针', num: lv >= 1 ? '飞镖装填加快25%' : '极速攻速 · 自动钉针' },
    blunt:   { name: '无锋两式', effect: '两段简练平斩，任意出刀零帧接藏锋', num: '零帧取消入鞘' },
  };
  const stance: Record<WeaponId, { name: string; effect: string; num: string }> = {
    hanshan: { name: '藏锋 · 箭步斩', effect: '拔刀冲过一排人，停步后齐齐中刀', num: '用一格气' },
    thunder: { name: '藏锋 · 裂阵斩', effect: '原地劈出六米雷裂冲击波强力破盾', num: lv >= 2 ? '用一格气 · 命中降雷柱' : '用一格气 · 破盾冲击' },
    frost:   { name: '藏锋 · 追霜',   effect: '拔刀瞬穿引爆沿途所有影针与飞镖', num: lv >= 2 ? '用一格气 · 引爆附寒气' : '用一格气 · 引爆影针' },
    blunt:   { name: '藏锋 · 听声一闪', effect: '破势或闪避赋予赤金一闪，拔刀瞬斩', num: lv >= 2 ? '斩杀刷新免费一闪' : '破势/闪避触发免费一闪' },
  };
  const parryNum = wid === 'blunt'
    ? (lv >= 1 ? '窗口宽40% · 震慑失衡' : '破势窗口宽40%')
    : wid === 'hanshan' && lv >= 2 ? '用一格气 · 成功回半格气'
    : wid === 'thunder' && lv >= 3 ? '用一格气 · 蓄力减伤40%'
    : '用一格气';
  const ultNum = wid === 'blunt' && lv >= 3 ? '需三格杀气 · 伤害+40%' : wid === 'hanshan' && lv >= 3 ? '需三格杀气 · 积攒+20%' : '需三格杀气';
  return [
    { id: 'lianhuan', name: combo[wid].name, steps: ['attack', 'attack', 'more'], effect: combo[wid].effect, num: combo[wid].num, icon: 'btn:attack', slot: 'attack', weaponId: wid },
    { id: 'iai', name: stance[wid].name, steps: ['hold', 'full', 'release'], effect: stance[wid].effect, num: stance[wid].num, icon: 'stance', slot: 'stance', weaponId: wid },
    { id: 'parry', name: '破势', steps: ['hold', 'cue', 'release'], effect: '架开来招，震退近敌，把箭弹回去', num: parryNum, icon: 'parry', weaponId: wid },
    { id: 'dash', name: '冲刺', steps: ['dash'], effect: '贴地疾冲，起步无敌躲过攻击', icon: 'btn:dash', slot: 'dash', weaponId: wid },
    { id: 'dcut', name: '穿风斩', steps: ['dash', 'attack'], effect: '带刀冲到敌后，沿路每人挨一刀', icon: 'dcut', weaponId: wid },
    { id: 'counter', name: '回锋斩', steps: ['dash', 'cue', 'attack'], effect: '完美闪避来招，回手一刀劈退敌人', num: '伤害翻倍', icon: 'counter', weaponId: wid },
    { id: 'jump', name: '跳', steps: ['jump'], effect: '蹬地跳起，躲过贴地扫来的招', icon: 'btn:jump', slot: 'jump', weaponId: wid },
    { id: 'plunge', name: '劈山', steps: ['jump', 'air', 'attack'], effect: '空中挥刀砸地，震开周围的人', icon: 'plunge', weaponId: wid },
    { id: 'dart', name: '柳叶镖', steps: ['dart'], effect: '飞镖直奔最近的人，扎中就钉住', num: '备三枚，用完会补', icon: 'btn:special', slot: 'dart', weaponId: wid },
    { id: 'ult', name: '不见刀', steps: ['intent', 'cue', 'ring', 'attack'], effect: '分身齐斩，归鞘时连爆八刀', num: ultNum, icon: 'ult', weaponId: wid },
  ];
}
export const BASE_SKILLS: BaseSkill[] = baseSkillsForWeapon('hanshan', 0);

export const UI_WORDS = {
  owned: '刀客', skills: '刀客', build: '刀客',
  ownedEmpty: '出征斩敌即可习得刀谱与秘传',
  demoSkip: '点按跳过', base: '佩刀招式', manual: '刀谱', boon: '秘传',
  runOwned: '本局已得', meta: '据点备战',
} as const;
