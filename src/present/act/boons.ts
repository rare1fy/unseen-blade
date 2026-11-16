// 秘传（哈迪斯式的局内能力）：清完一间屋三选一。每个只做一件看得见的事，不堆数值（feedback-strengths-scope：一个效果一眼看懂）。
export type School = 'tp' | 'jd' | 'sr';
export const SCHOOL_NAMES: Record<School, string> = { tp: '太平道', jd: '江东水师', sr: '散人' };
export const TIER_NAMES = ['普通', '精良', '传说'] as const;
export interface Boon { id: string; school: School; name: string; desc: string[]; col: string; glyph: string[]; vals?: [number, number, number] }
export interface BoonPick { boon: Boon; tier: number }
export interface Perks { owned: Record<string, number>; burn: boolean; dashCut: number; darts3: boolean; killHeal: number; relFreeze: boolean; dashEdge: boolean; bladeWind: boolean; hpUp: number }
export const newPerks = (): Perks => ({ owned: {}, burn: false, dashCut: 0, darts3: false, killHeal: 0, relFreeze: false, dashEdge: false, bladeWind: false, hpUp: 0 });
export const boonTier = (tier: number) => Number.isFinite(tier) ? Math.max(0, Math.min(2, Math.floor(tier))) : 0;
export const boonTag = (b: Boon, tier: number) => [b.school === 'sr' ? '' : SCHOOL_NAMES[b.school], TIER_NAMES[boonTier(tier)]].filter(Boolean).join(' · ');

const LIGHTNING = ['....##....', '....##....', '..######..', '..##oo##..', '....oo....', '....##....', '..######..', '..##..##..', '..##..##..', '..........'];
const FROST = ['....##....', '....##....', '.########.', '.#..##..#.', '##########', '##########', '.#..##..#.', '.########.', '....##....', '....##....'];

export const BOONS: Boon[] = [
  { id: 'burn', school: 'sr', name: '火遁 · 燃刃', desc: ['收尾一刀和突进斩', '点燃敌人，烧三秒'], col: '#ff7a3a',
    glyph: ['....##....', '...###....', '...####.#.', '..######..', '..#######.', '.###oo###.', '.##oooo##.', '.##oooo##.', '..######..', '...####...'] },
  { id: 'dashCut', school: 'sr', name: '疾风 · 风切', desc: ['冲刺穿过敌人', '顺手划出一刀'], col: '#8ad8ff',
    glyph: ['..........', '......##..', '......###.', '####..####', '..########', '..########', '####..####', '......###.', '......##..', '..........'] },
  { id: 'darts3', school: 'sr', name: '散手 · 三叶', desc: ['掷飞镖一次甩三枚', '向前方扇形散开'], col: '#d8e4f0',
    glyph: ['....##....', '...####...', '.#.####.#.', '###.##.###', '###.##.###', '.#..##..#.', '.#..##..#.', '....##....', '.#..##..#.', '..........'] },
  { id: 'killHeal', school: 'sr', name: '血契', desc: ['每杀一个敌人', '回复四点生命'], col: '#ff5a5a',
    glyph: ['.##...##..', '####.####.', '#########.', '#########.', '.#######..', '..#####...', '...###....', '....#.....', '..........', '..........'] },
  { id: 'relFreeze', school: 'sr', name: '寒刃', desc: ['突进斩命中的敌人', '被寒气短暂冻住'], col: '#9af0ff',
    glyph: ['....##....', '.#..##..#.', '..#.##.#..', '...####...', '##########', '##########', '...####...', '..#.##.#..', '.#..##..#.', '....##....'] },
  { id: 'dashEdge', school: 'sr', name: '连影', desc: ['冲刺后一秒之内', '斩击威力增加一半'], col: '#ffd070',
    glyph: ['##........', '####......', '######....', '########..', '##########', '##########', '########..', '######....', '####......', '##........'] },
  { id: 'bladeWind', school: 'sr', name: '刃风', desc: ['收尾一刀放出一道刃风', '直线飞出，沿途伤害'], col: '#c8ffd8',
    glyph: ['..........', '##........', '.####.....', '..#######.', '...#######', '...#######', '..#######.', '.####.....', '##........', '..........'] },
  { id: 'hpUp', school: 'sr', name: '坚韧', desc: ['生命上限增二十五', '并回复二十五点'], col: '#9aff9a',
    glyph: ['....##....', '....##....', '....##....', '##########', '##########', '....##....', '....##....', '....##....', '..........', '..........'] },
  { id: 'tp_bolt', school: 'tp', name: '雷刃', desc: ['第五刀落下天雷', '轰击落点四周'], col: '#ffe68a', glyph: LIGHTNING, vals: [14, 20, 28] },
  { id: 'tp_chain', school: 'tp', name: '连锁', desc: ['斩中时有机会引雷', '电弧跳向附近敌人'], col: '#ffe68a', glyph: LIGHTNING, vals: [25, 35, 50] },
  { id: 'tp_step', school: 'tp', name: '雷步', desc: ['落地收步激起雷环', '震伤脚边敌人'], col: '#ffe68a', glyph: LIGHTNING, vals: [8, 12, 16] },
  { id: 'tp_mark', school: 'tp', name: '引雷', desc: ['飞镖留下引雷印', '再斩一刀引落天雷'], col: '#ffe68a', glyph: LIGHTNING, vals: [12, 18, 24] },
  { id: 'tp_iai', school: 'tp', name: '天公', desc: ['见切成功唤来天雷', '劈向四周敌人'], col: '#ffe68a', glyph: LIGHTNING, vals: [16, 24, 32] },
  { id: 'tp_orb', school: 'tp', name: '惊雷', desc: ['完美闪避留下雷珠', '稍后炸伤附近敌人'], col: '#ffe68a', glyph: LIGHTNING, vals: [12, 18, 26] },
  { id: 'tp_armor', school: 'tp', name: '雷甲', desc: ['近身受击迸出雷光', '反噬出手之人'], col: '#ffe68a', glyph: LIGHTNING, vals: [10, 15, 22] },
  { id: 'tp_intent', school: 'tp', name: '雷鸣', desc: ['杀意化作刀上雷光', '杀意越盛斩击越重'], col: '#ffe68a', glyph: LIGHTNING, vals: [2, 3, 4] },
  { id: 'jd_chill', school: 'jd', name: '霜刃', desc: ['刀刀积下寒气', '寒气叠满冻住敌人'], col: '#9ae8ff', glyph: FROST, vals: [1.2, 1.5, 2.0] },
  { id: 'jd_dart', school: 'jd', name: '冰镖', desc: ['飞镖附上一层寒气', '让敌人脚步变慢'], col: '#9ae8ff', glyph: FROST, vals: [40, 50, 60] },
  { id: 'jd_trail', school: 'jd', name: '霜步', desc: ['冲刺沿途留下冰痕', '敌人踏上受寒减速'], col: '#9ae8ff', glyph: FROST },
  { id: 'jd_shatter', school: 'jd', name: '碎冰', desc: ['击碎敌人身上寒冰', '这一击伤得更重'], col: '#9ae8ff', glyph: FROST, vals: [60, 100, 150] },
  { id: 'jd_iai', school: 'jd', name: '寒潮', desc: ['见切成功激起寒潮', '冻住近旁敌人'], col: '#9ae8ff', glyph: FROST, vals: [1.0, 1.4, 1.8] },
  { id: 'jd_shell', school: 'jd', name: '冰甲', desc: ['受伤后寒冰护体', '短暂抵挡后续伤害'], col: '#9ae8ff', glyph: FROST, vals: [30, 45, 60] },
  { id: 'jd_burst', school: 'jd', name: '冰封', desc: ['冻住的敌人死后碎裂', '碎冰伤敌并添寒气'], col: '#9ae8ff', glyph: FROST, vals: [6, 10, 14] },
  { id: 'jd_still', school: 'jd', name: '寒心', desc: ['完美闪避散出寒气', '寒意侵入身旁敌人'], col: '#9ae8ff', glyph: FROST, vals: [1, 2, 3] },
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
