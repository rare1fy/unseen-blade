// 刀谱（act-19，用户：「我们已经做了这么多连招和派生了，我感觉很多都应该做进强化，而不是开场默认就有的招式，哈迪斯怎么做的」→
// 选了我的分法）：像《哈迪斯》的代达罗斯之锤——一局里从遗卷房的石台、死士房的奖励拿到，三选一，每本解锁一个招式；
// 一局一般拿两三本。开局就有的：连环刀、冲刺、穿风斩、跳、劈山、柳叶镖、藏锋 / 破势、回锋斩、不见刀。练武场里刀谱全开（方便练）。
// 名字和说明由 agy 写（docs/DESIGN.md 第十九轮），我核对。
// 11-18 (用户：「我打了半天了还没个新招，一直在给我加数值」): four more — 断云 (after 挑云, three cuts in the air and the last drives him
// into the ground), 掠地 (an air dash that dives into a cut and lands behind them), 牵红 (a stuck dart's red cord pulls him in), 踏顶
// (in the air beside one, a jump off his head flattens him). Names by agy (gemini-3.8-flash-high), checked.
// 11-18 (用户：「把所有的技能描述都重新写一下，现在的纯看不懂，也没有图标配合」): the presses are not words any more — `how` / `air`
// (the card draws them as buttons); desc[0] is only what comes out (agy, ≤ 20 characters), desc[1] the numbers (may be empty)
import type { Boon } from './boons';

export type MoveId = 'chase' | 'backDart' | 'dbl' | 'launch' | 'cutDart' | 'keep' | 'pause' | 'kick' | 'acut' | 'swoop' | 'reel' | 'stomp';
/** 11-18 (用户：「选了强化后根本看不到自己选的强化是啥，在哪儿、如何释放，如何释放的教学不能是纯文字」): how a move is done, for the
 *  card face and the demonstration — the presses in order (hold = a held 斩), and whether it starts in the air */
export type MoveKey = 'attack' | 'dash' | 'jump' | 'dart' | 'hold';
/** desc: [what comes out (one line), the numbers (a small line; '' = none)]; pauseAt: a beat's pause comes before press number
 *  pauseAt (0-based) — 扫八方 waits a beat after the 2nd cut; needs: a manual that must be learnt first (断云 starts from 挑云) */
export interface Manual { id: MoveId; name: string; desc: [string, string]; how?: MoveKey[]; air?: boolean; pauseAt?: number; needs?: MoveId }
export const MANUALS: Manual[] = [
  { id: 'chase', name: '寻声', how: ['dart', 'attack'], desc: ['循镖声抢到跟前，当头一记重刀', '伤害 150%'] },
  { id: 'backDart', name: '回身镖', how: ['dash', 'dart'], desc: ['头也不回，反手三镖甩向身后', '三枚只算一把镖'] },
  { id: 'dbl', name: '二段跳', how: ['jump'], air: true, desc: ['半空再蹬一下，翻个跟头蹿高一截', '再高 1.8 米'] },
  { id: 'launch', name: '挑云', how: ['attack', 'jump'], desc: ['一记上撩把人挑上半空，随刀跃起', '伤害 110%'] },
  { id: 'cutDart', name: '迎面镖', how: ['attack', 'dart'], desc: ['刀刚砍中，贴面三镖直钉眼前人', '三枚只算一把镖'] },
  { id: 'keep', name: '游身斩', how: ['attack', 'dash', 'attack'], desc: ['滑步闪至身侧，刀势不歇连着砍', ''] },
  { id: 'pause', name: '扫八方', how: ['attack', 'attack', 'attack'], pauseAt: 2, desc: ['原地旋刀两圈，扫退身周一圈人', ''] },
  { id: 'kick', name: '穿心腿', how: ['dash', 'jump'], desc: ['贴地飞踹，挡路的人被踹飞撞墙', '伤害 130%'] },
  { id: 'acut', name: '断云', how: ['attack', 'jump', 'attack'], needs: 'launch', desc: ['半空追砍三刀，末刀连人砸回地上', '两刀各 70%，下劈 100%，砸地 200%'] },
  { id: 'swoop', name: '掠地', how: ['dash'], air: true, desc: ['斜斩贴地穿至敌后，路过皆挨一刀', '伤害 160%'] },
  { id: 'reel', name: '牵红', how: ['dart', 'dart'], desc: ['扯线把人拉到刀前，拽不动便飞身扑去', '伤害 40%，拽到身前约 1.2 米'] },
  { id: 'stomp', name: '踏顶', how: ['jump'], air: true, desc: ['踩头借力再蹿高，把人踩趴在地', '伤害 60%，踩趴 1.2 秒'] },
];
export const ALL_MOVES: Record<string, boolean> = Object.fromEntries(MANUALS.map(m => [m.id, true]));
/** the scroll glyph the manual cards show (12 × 12, axis-aligned: two rollers and the slips between) */
export const SCROLL_GLYPH = ['............', '.##########.', '.#oooooooo#.', '..#d#d#d#d..', '..#d#d#d#d..', '..#d#d#d#d..', '..#d#d#d#d..', '..#d#d#d#d..', '..#d#d#d#d..', '.#oooooooo#.', '.##########.', '............'];
/** up to n manuals not learnt yet (and whose `needs` is learnt), in a random order */
export function drawManuals(known: Record<string, boolean>, n: number, rnd: () => number) {
  return MANUALS.filter(m => !known[m.id] && (!m.needs || known[m.needs])).map(m => ({ m, k: rnd() })).sort((a, b) => a.k - b.k).slice(0, n).map(o => o.m);
}
/** a manual dressed as a card (the card face draws school 'ms' in the scroll style) */
export function manualCard(m: Manual): Boon { return { id: 'ms_' + m.id, school: 'ms' as never, name: m.name, desc: [...m.desc], col: '#f0e0b0', glyph: SCROLL_GLYPH }; }
