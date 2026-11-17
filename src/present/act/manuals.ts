// 刀谱（act-19，用户：「我们已经做了这么多连招和派生了，我感觉很多都应该做进强化，而不是开场默认就有的招式，哈迪斯怎么做的」→
// 选了我的分法）：像《哈迪斯》的代达罗斯之锤——一局里从遗卷房的石台、死士房的奖励拿到，三选一，每本解锁一个招式；
// 一局一般拿两三本。开局就有的：连环刀、冲刺、穿风斩、跳、劈山、柳叶镖、藏锋 / 破势、回锋斩、不见刀。练武场里刀谱全开（方便练）。
// 名字和说明由 agy 写（docs/DESIGN.md 第十九轮），我核对。
import type { Boon } from './boons';

export type MoveId = 'chase' | 'backDart' | 'dbl' | 'launch' | 'cutDart' | 'keep' | 'pause' | 'kick';
/** 11-18 (用户：「选了强化后根本看不到自己选的强化是啥，在哪儿、如何释放，如何释放的教学不能是纯文字」): how a move is done, for the
 *  card face and the demonstration — the presses in order (hold = a held 斩), and whether it starts in the air */
export type MoveKey = 'attack' | 'dash' | 'jump' | 'dart' | 'hold';
export interface Manual { id: MoveId; name: string; desc: [string, string]; how?: MoveKey[]; air?: boolean }
export const MANUALS: Manual[] = [
  { id: 'chase', name: '寻声', desc: ['飞镖钉住敌人时按斩', '循声掠至敌前挥斩'] },
  { id: 'backDart', name: '回身镖', desc: ['冲刺途中按镖', '反手往身后甩出三镖'] },
  { id: 'dbl', name: '二段跳', desc: ['跃至半空时再按跳', '凌空翻身再蹿一截'] },
  { id: 'launch', name: '挑云', desc: ['连斩砍中敌人后按跳', '挑敌入空并随刀跃起'] },
  { id: 'cutDart', name: '迎面镖', desc: ['连斩砍中敌人后按镖', '左手贴面甩三镖钉敌'] },
  { id: 'keep', name: '游身斩', desc: ['连斩中冲刺后即按斩', '自侧面续下一刀横斩'] },
  { id: 'pause', name: '扫八方', desc: ['第二刀后稍停再按斩', '原地旋身两周扫群敌'] },
  { id: 'kick', name: '穿心腿', desc: ['冲刺按跳，出贴地飞踢', '踹飞首敌，撞物再添伤'] },
];
export const ALL_MOVES: Record<string, boolean> = Object.fromEntries(MANUALS.map(m => [m.id, true]));
/** the scroll glyph the manual cards show (12 × 12, axis-aligned: two rollers and the slips between) */
export const SCROLL_GLYPH = ['............', '.##########.', '.#oooooooo#.', '..#d#d#d#d..', '..#d#d#d#d..', '..#d#d#d#d..', '..#d#d#d#d..', '..#d#d#d#d..', '..#d#d#d#d..', '.#oooooooo#.', '.##########.', '............'];
/** up to n manuals not learnt yet, in a random order */
export function drawManuals(known: Record<string, boolean>, n: number, rnd: () => number) {
  return MANUALS.filter(m => !known[m.id]).map(m => ({ m, k: rnd() })).sort((a, b) => a.k - b.k).slice(0, n).map(o => o.m);
}
/** a manual dressed as a card (the card face draws school 'ms' in the scroll style) */
export function manualCard(m: Manual): Boon { return { id: 'ms_' + m.id, school: 'ms' as never, name: m.name, desc: [...m.desc], col: '#f0e0b0', glyph: SCROLL_GLYPH }; }
