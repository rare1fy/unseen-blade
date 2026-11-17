// 局内秘传：十三张刀客强化（act-36；名字和说明 agy gemini-3.8-flash-high 写、我核对）；刀谱仍由 moves 单独记录。
export type School = 'sr';
export const SCHOOL_NAMES: Record<School, string> = { sr: '秘传' };
export const TIER_NAMES = ['凡品', '珍品', '绝品'] as const;
export interface Boon { id: string; school: School; name: string; desc: string[]; col: string; glyph: string[]; vals?: [number, number, number]; unit?: string; vals2?: [number, number, number]; unit2?: string }
export interface BoonPick { boon: Boon; tier: number }
export interface Perks { /** act-19 刀谱 */ moves: Record<string, boolean>; owned: Record<string, number> }
export const newPerks = (): Perks => ({ moves: {}, owned: {} });
export const boonTier = (tier: number) => Number.isFinite(tier) ? Math.max(0, Math.min(2, Math.floor(tier))) : 0;
export const tierOf = (p: Perks, id: string) => p.owned[id] == null ? -1 : boonTier(p.owned[id]);
export const v = (p: Perks, id: string) => { const t = tierOf(p, id); return t < 0 ? 0 : BOONS.find(b => b.id === id)?.vals?.[t] ?? 0; };
export const v2 = (p: Perks, id: string) => { const t = tierOf(p, id); return t < 0 ? 0 : BOONS.find(b => b.id === id)?.vals2?.[t] ?? 0; };
export const isBladeHit = (kind: string) => /^k[1-5]$/.test(kind) || ['rel', 'plunge', 'launch', 'parry', 'echo'].includes(kind);
export const boonTag = (_b: Boon, tier: number) => TIER_NAMES[boonTier(tier)];

export const BOONS: Boon[] = [
  { id: 'quick', school: 'sr', name: '快刀', desc: ['连环刀出刀更疾', '出刀速度+{v}'], vals: [12, 20, 28], unit: '%', col: '#aeb8bd', glyph: ['.......##.', '.......##.', '.##....##.', '.......##.', '####...##.', '.......##.', '.##....##.', '......####', '.......##.', '.......oo.'] },
  { id: 'extra', school: 'sr', name: '叠刃', desc: ['收尾一刀砍中后', '追加{v}收尾伤害'], vals: [40, 60, 80], unit: '%', col: '#bd9b82', glyph: ['..##......', '..##..##..', '..##..##..', '..##..##..', '..##..##..', '..##..##..', '.####.##..', '..##.####.', '..oo..##..', '......oo..'] },
  { id: 'sunder', school: 'sr', name: '裂甲', desc: ['敌人被斩中后三秒', '受到的伤害+{v}'], vals: [12, 20, 30], unit: '%', col: '#b6a088', glyph: ['##########', '#o##.###o#', '####.#####', '####..####', '#####.####', '#####..###', '######.###', '#o####.#o#', '##########', '..........'] },
  { id: 'bone', school: 'sr', name: '断骨', desc: ['重招砍中击退更远', '敌人硬直延长{v}'], vals: [0.3, 0.45, 0.6], unit: '秒', col: '#d2c6b2', glyph: ['..........', '..........', '##......##', '####..####', '.###..###.', '####..####', '##......##', '..........', '..........', '..........'] },
  { id: 'behead', school: 'sr', name: '枭首', desc: ['敌人血量低于{v}时', '一刀斩杀（头目除外）'], vals: [12, 18, 25], unit: '%', col: '#a64843', glyph: ['.########.', '.#oooooo#.', '.########.', '....##....', '....##....', '....##....', '..........', '.o..o..o..', '##########', '##########'] },
  { id: 'bleed', school: 'sr', name: '见红', desc: ['斩中叠出血至五层', '每层每秒失血{v}点'], vals: [1, 1.5, 2], col: '#922f35', glyph: ['....#.....', '...###....', '..#####...', '..##o##...', '...###..#.', '.#.....###', '###....#o#', '#o#.....#.', '.#........', '..........'] },
  { id: 'drink', school: 'sr', name: '饮血', desc: ['每斩杀一个敌人', '回复{v}点生命'], vals: [3, 5, 7], col: '#9d3b40', glyph: ['..........', '#oooooooo#', '##########', '.########.', '.########.', '..######..', '....##....', '....##....', '..######..', '..........'] },
  { id: 'frenzy', school: 'sr', name: '搏命', desc: ['自身血量低于一半', '斩击伤害+{v}'], vals: [20, 35, 50], unit: '%', col: '#a74b45', glyph: ['.##..o.##.', '####.o####', '#####o####', '#####o####', '.####o###.', '..###o##..', '...##o#...', '....#o....', '.....o....', '..........'] },
  { id: 'draw', school: 'sr', name: '出鞘', desc: ['藏锋蓄满用时−{v}', '箭步斩伤害+{v2}'], vals: [30, 45, 60], unit: '%', vals2: [20, 30, 40], unit2: '%', col: '#c4b6a3', glyph: ['....oo....', '....oo....', '....oo....', '...####...', '....##....', '..######..', '...####...', '...####...', '...####...', '....##....'] },
  { id: 'counter', school: 'sr', name: '乘虚', desc: ['破势反击伤害+{v}', '并回复{v2}点生命'], vals: [50, 75, 100], unit: '%', vals2: [4, 6, 8], col: '#b88b6c', glyph: ['....##....', '....##....', '....oo....', '##########', '#oooooooo#', '....##....', '....##....', '...####...', '....##....', '....##....'] },
  { id: 'evade', school: 'sr', name: '游身', desc: ['完美闪避时机放宽{v}', '冲刺冷却缩短{v2}'], vals: [40, 70, 100], unit: '%', vals2: [15, 25, 35], unit2: '%', col: '#aab4b6', glyph: ['.....###..', '.....###..', '.....###..', '##...###..', '.....####.', '###..#####', '.....#####', '##...oooo.', '..........', '..........'] },
  { id: 'darts3', school: 'sr', name: '撒星', desc: ['柳叶镖一次掷{v}枚', '扇形散开射向前方'], vals: [3, 3, 5], col: '#9dabb2', glyph: ['.#..##..#.', '###.##.###', '.#..##..#.', '.#..##..#.', '.#..##..#.', '.o..oo..o.', '.o..oo..o.', '..........', '..........', '..........'] },
  { id: 'bladeWind', school: 'sr', name: '刀芒', desc: ['收尾一刀劈出刀芒', '直线贯穿，伤害{v}'], vals: [100, 150, 200], unit: '%', vals2: [0, 20, 40], unit2: '%', col: '#d0c8b8', glyph: ['..........', '..........', '...####...', '.########.', '##########', '.oooooooo.', '...oooo...', '..........', '..........', '..........'] },
];
export function applyBoon(p: Perks, id: string, tier = 0) { if (BOONS.some(b => b.id === id)) p.owned[id] = Math.max(p.owned[id] ?? 0, boonTier(tier)); }
export function upgradeBoon(p: Perks, id: string): boolean { if (tierOf(p, id) < 0 || tierOf(p, id) >= 2) return false; p.owned[id]++; return true; }
export function drawBoons(pool: 'any', n: number, rnd: () => number, p: Perks, odds = [0.7, 0.25, 0.05]): BoonPick[] {
  void pool; const fresh = BOONS.filter(b => tierOf(p, b.id) < 0), owned = BOONS.filter(b => tierOf(p, b.id) >= 0);
  const weights = [0, 1, 2].map(i => Number.isFinite(odds[i]) ? Math.max(0, odds[i]) : 0), total = weights.reduce((a, b) => a + b, 0), out: BoonPick[] = [];
  for (let i = 0; i < Math.min(Math.max(0, Math.floor(n)), BOONS.length); i++) {
    const choices = fresh.length ? fresh : owned, ix = Math.max(0, Math.min(choices.length - 1, Math.floor(rnd() * choices.length)));
    const boon = choices.splice(ix, 1)[0], roll = rnd() * total, tier = total <= 0 || roll < weights[0] ? 0 : roll < weights[0] + weights[1] ? 1 : 2;
    out.push({ boon, tier });
  }
  return out;
}
/** Non-boon cards share CardPick; their copy also lives here. */
export function returnCard(kills: number, win = false): BoonPick {
  return { boon: { id: win ? 'again' : 'retry', school: 'sr', name: win ? '原型到此' : '再来一次', desc: [win ? '三间都清了' : '回练武场再出发', `这一局斩了${kills}个`], col: '#b88b6c', glyph: BOONS.find(b => b.id === 'behead')!.glyph, vals: [0, 0, 0] }, tier: 0 };
}
