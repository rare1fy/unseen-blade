// 秘传（哈迪斯式的局内能力）：清完一间屋三选一。每个只做一件看得见的事，不堆数值（feedback-strengths-scope：一个效果一眼看懂）。
export type School = 'tp' | 'jd' | 'sr';
export const SCHOOL_NAMES: Record<School, string> = { tp: '太平道', jd: '江东水师', sr: '散人' };
/** the three tiers (agy: 凡品 / 珍品 / 绝品) */
export const TIER_NAMES = ['凡品', '珍品', '绝品'] as const;
export interface Boon { id: string; school: School; name: string; desc: string[]; col: string; glyph: string[]; vals?: [number, number, number] }
export interface BoonPick { boon: Boon; tier: number }
export interface Perks { owned: Record<string, number>; burn: boolean; dashCut: number; darts3: boolean; killHeal: number; relFreeze: boolean; dashEdge: boolean; bladeWind: boolean; hpUp: number }
export const newPerks = (): Perks => ({ owned: {}, burn: false, dashCut: 0, darts3: false, killHeal: 0, relFreeze: false, dashEdge: false, bladeWind: false, hpUp: 0 });
export const boonTier = (tier: number) => Number.isFinite(tier) ? Math.max(0, Math.min(2, Math.floor(tier))) : 0;
export const boonTag = (b: Boon, tier: number) => [b.school === 'sr' ? '' : SCHOOL_NAMES[b.school], TIER_NAMES[boonTier(tier)]].filter(Boolean).join(' · ');

const LIGHTNING = ['....##....', '....##....', '..######..', '..##oo##..', '....oo....', '....##....', '..######..', '..##..##..', '..##..##..', '..........'];
const FROST = ['....##....', '....##....', '.########.', '.#..##..#.', '##########', '##########', '.#..##..#.', '.########.', '....##....', '....##....'];

export const BOONS: Boon[] = [
  { id: 'burn', school: 'sr', name: '燎原', desc: ['收尾一刀和箭步斩', '点燃敌人，烧三秒'], col: '#ff7a3a',
    glyph: ['....##....', '...###....', '...####.#.', '..######..', '..#######.', '.###oo###.', '.##oooo##.', '.##oooo##.', '..######..', '...####...'] },
  { id: 'dashCut', school: 'sr', name: '掠风', desc: ['冲刺穿过敌人', '顺手划出一刀'], col: '#8ad8ff',
    glyph: ['..........', '......##..', '......###.', '####..####', '..########', '..########', '####..####', '......###.', '......##..', '..........'] },
  { id: 'darts3', school: 'sr', name: '三才镖', desc: ['掷飞镖一次甩三枚', '向前方扇形散开'], col: '#d8e4f0',
    glyph: ['....##....', '...####...', '.#.####.#.', '###.##.###', '###.##.###', '.#..##..#.', '.#..##..#.', '....##....', '.#..##..#.', '..........'] },
  { id: 'killHeal', school: 'sr', name: '饮血', desc: ['每杀一个敌人', '回复四点生命'], col: '#ff5a5a',
    glyph: ['.##...##..', '####.####.', '#########.', '#########.', '.#######..', '..#####...', '...###....', '....#.....', '..........', '..........'] },
  { id: 'relFreeze', school: 'sr', name: '寒刃', desc: ['箭步斩命中的敌人', '被寒气短暂冻住'], col: '#9af0ff',
    glyph: ['....##....', '.#..##..#.', '..#.##.#..', '...####...', '##########', '##########', '...####...', '..#.##.#..', '.#..##..#.', '....##....'] },
  { id: 'dashEdge', school: 'sr', name: '借势', desc: ['冲刺后一秒之内', '斩击威力增加一半'], col: '#ffd070',
    glyph: ['##........', '####......', '######....', '########..', '##########', '##########', '########..', '######....', '####......', '##........'] },
  { id: 'bladeWind', school: 'sr', name: '刀芒', desc: ['收尾一刀放出一道刀芒', '直线飞出，沿途伤害'], col: '#c8ffd8',
    glyph: ['..........', '##........', '.####.....', '..#######.', '...#######', '...#######', '..#######.', '.####.....', '##........', '..........'] },
  { id: 'hpUp', school: 'sr', name: '坚韧', desc: ['生命上限增二十五', '并回复二十五点'], col: '#9aff9a',
    glyph: ['....##....', '....##....', '....##....', '##########', '##########', '....##....', '....##....', '....##....', '..........', '..........'] },
  { id: 'tp_bolt', school: 'tp', name: '惊雷', desc: ['连斩收尾那一刀劈落雷', '电击落点周围整圈敌人'], col: '#ffe68a', glyph: LIGHTNING, vals: [14, 20, 28] },
  { id: 'tp_chain', school: 'tp', name: '跃电', desc: ['斩中敌人时有机会跳电', '电击旁边另一个敌人'], col: '#ffe68a', glyph: LIGHTNING, vals: [25, 35, 50] },
  { id: 'tp_step', school: 'tp', name: '雷步', desc: ['冲刺停下时脚下炸开电', '电击身边周围一圈敌人'], col: '#ffe68a', glyph: LIGHTNING, vals: [8, 12, 16] },
  { id: 'tp_mark', school: 'tp', name: '引雷', desc: ['飞镖钉中敌人后3秒内', '再被斩中就会劈下天雷'], col: '#ffe68a', glyph: LIGHTNING, vals: [12, 18, 24] },
  { id: 'tp_iai', school: 'tp', name: '天罚', desc: ['破势成功时引落天雷', '劈打周围所有的敌人'], col: '#ffe68a', glyph: LIGHTNING, vals: [16, 24, 32] },
  { id: 'tp_orb', school: 'tp', name: '雷珠', desc: ['完美闪避时原地留雷球', '过一会儿炸开电击周围'], col: '#ffe68a', glyph: LIGHTNING, vals: [12, 18, 26] },
  { id: 'tp_armor', school: 'tp', name: '怒电', desc: ['挨打受伤时身上迸出电', '反过来电击出手的敌人'], col: '#ffe68a', glyph: LIGHTNING, vals: [10, 15, 22] },
  { id: 'tp_intent', school: 'tp', name: '狂雷', desc: ['身上积攒的杀气越多', '出刀斩出的电弧就越强'], col: '#ffe68a', glyph: LIGHTNING, vals: [2, 3, 4] },
  { id: 'jd_chill', school: 'jd', name: '凝霜', desc: ['每次斩中敌人叠加寒气', '寒气叠满便将敌人冻住'], col: '#9ae8ff', glyph: FROST, vals: [1.2, 1.5, 2.0] },
  { id: 'jd_dart', school: 'jd', name: '冻骨', desc: ['飞镖钉中敌人带去寒气', '让中镖的敌人行动变慢'], col: '#9ae8ff', glyph: FROST, vals: [40, 50, 60] },
  { id: 'jd_trail', school: 'jd', name: '霜径', desc: ['冲刺过后脚下留出冰路', '踩上冰路的敌人会变慢'], col: '#9ae8ff', glyph: FROST },
  { id: 'jd_shatter', school: 'jd', name: '破冰', desc: ['打冻住的敌人伤害更高', '同时震碎敌人身上的冰'], col: '#9ae8ff', glyph: FROST, vals: [60, 100, 150] },
  { id: 'jd_iai', school: 'jd', name: '霜返', desc: ['破势成功时寒气爆发', '瞬间冻住周围所有敌人'], col: '#9ae8ff', glyph: FROST, vals: [1.0, 1.4, 1.8] },
  { id: 'jd_shell', school: 'jd', name: '冰甲', desc: ['挨打后片刻内身结冰壳', '冰壳护体期间受伤减少'], col: '#9ae8ff', glyph: FROST, vals: [30, 45, 60] },
  { id: 'jd_burst', school: 'jd', name: '爆霜', desc: ['斩杀冻住的敌人炸冰片', '连带冻住旁边的敌人'], col: '#9ae8ff', glyph: FROST, vals: [6, 10, 14] },
  { id: 'jd_still', school: 'jd', name: '寒影', desc: ['完美闪避时向四周散寒', '给周围的敌人叠加寒气'], col: '#9ae8ff', glyph: FROST, vals: [1, 2, 3] },
];
export function applyBoon(p: Perks, id: string, tier = 0) {
  if (!BOONS.some(b => b.id === id)) return;
  p.owned[id] = Math.max(p.owned[id] ?? 0, boonTier(tier));
  if (id === 'burn') p.burn = true; else if (id === 'dashCut') p.dashCut = 10; else if (id === 'darts3') p.darts3 = true; else if (id === 'killHeal') p.killHeal = 4;
  else if (id === 'relFreeze') p.relFreeze = true; else if (id === 'dashEdge') p.dashEdge = true; else if (id === 'bladeWind') p.bladeWind = true; else if (id === 'hpUp') p.hpUp += 25;
}

/** Sharpening changes the tier only: it does not grant a legacy pickup a second time. */
export function upgradeBoon(p: Perks, id: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(p.owned, id) || p.owned[id] >= 2) return false;
  p.owned[id]++;
  return true;
}

export function drawBoons(pool: School | 'any', n: number, rnd: () => number, p: Perks, odds = [0.7, 0.25, 0.05]): BoonPick[] {
  const available = BOONS.filter(b => pool === 'any' || b.school === pool);
  const fresh = available.filter(b => p.owned[b.id] == null), owned = available.filter(b => p.owned[b.id] != null);
  const weights = [0, 1, 2].map(i => Number.isFinite(odds[i]) ? Math.max(0, odds[i]) : 0);
  const total = weights.reduce((a, b) => a + b, 0);
  const out: BoonPick[] = [];
  for (let i = 0; i < Math.min(Math.max(0, Math.floor(n)), available.length); i++) {
    const choices = fresh.length ? fresh : owned;
    const ix = Math.max(0, Math.min(choices.length - 1, Math.floor(rnd() * choices.length)));
    const boon = choices.splice(ix, 1)[0], roll = rnd() * total;
    const tier = total <= 0 || roll < weights[0] ? 0 : roll < weights[0] + weights[1] ? 1 : 2;
    out.push({ boon, tier });
  }
  return out;
}

/** Non-boon cards share CardPick; their copy also lives here. */
export function returnCard(kills: number, win = false): BoonPick {
  return { boon: { id: win ? 'again' : 'retry', school: 'sr', name: win ? '原型到此' : '再来一次',
    desc: [win ? '三间都清了' : '回练武场再出发', `这一局斩了${kills}个`], col: '#ffd070', glyph: BOONS[win ? 7 : 1].glyph }, tier: 0 };
}
