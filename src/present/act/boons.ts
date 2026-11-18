// 局内秘传（act-36 十三张刀客强化 → 11-18 改招为主，十六张）。用户 11-18：「我打了半天了还没个新招，一直在给我加数值。强化卡片也难以辨认
// 都是干嘛的，icon造型和描述都很抽象。」→ 每张挂在一个键上（slot：斩 / 冲刺 / 镖 / 藏锋 / 跳；纯被动的 null），拿了以后那个键看得见地变；
// 数值只做凡 / 珍 / 绝三档的强弱。原来 11 张看不见的数值（快刀、裂甲、断骨、搏命、出鞘、乘虚、游身…）拿掉，换成有表现的招。
// 名字和说明 agy（gemini-3.8-flash-high）写、我核对；说明只写「会出什么」一句（技能描述的规范：按法由 slot 画成按钮，数值放档位）。
// 卡面的数值一行：note（{v} / {v2} 按档填）。效果在 show.ts / hero.ts / missiles.ts（找 tierOf(…, '<id>')）。
export type School = 'sr';
export const SCHOOL_NAMES: Record<School, string> = { sr: '秘传' };
export const TIER_NAMES = ['凡品', '珍品', '绝品'] as const;
/** 11-18 (用户：「我打了半天了还没个新招，一直在给我加数值」「选了强化后根本看不到自己选的强化是啥，在哪儿」): the button a boon changes —
 *  斩 / 冲刺 / 镖 / 藏锋 / 跳 — or null for a passive; the card face draws that button, the HUD marks it */
export type BoonSlot = 'attack' | 'dash' | 'dart' | 'stance' | 'jump' | null;
/** 11-18 技能描述的规范 (用户：「把所有的技能描述都重新写一下，现在的纯看不懂，也没有图标配合」): the fields kept apart so the card face and
 *  the later copy pass can lay them out — slot: the button (drawn, never written); eff: one line of what you see happen (no numbers, no
 *  keys, no 「易伤」「硬直」 words); note: the numbers' small line ({v} / {v2} filled for the tier). desc = [eff, note] for the card faces
 *  that still read two lines. glyph: the 10 × 10 card picture (the card face is being redone with 3D icons elsewhere) */
export interface Boon { id: string; school: School; name: string; desc: string[]; col: string; glyph: string[]; slot?: BoonSlot; eff?: string; note?: string; vals?: [number, number, number]; unit?: string; vals2?: [number, number, number]; unit2?: string }
export type BoonId = 'bladeWind' | 'extra' | 'bleed' | 'behead' | 'spin' | 'pierce' | 'passCut' | 'decoy' | 'darts3' | 'boomerang' | 'pin' | 'twinDraw' | 'burst' | 'rift' | 'vault' | 'drink';
export interface SkillBoon extends Boon { id: BoonId; eff: string; note: string; slot: BoonSlot }
type BoonDef = Omit<SkillBoon, 'desc'>;
export interface BoonPick { boon: Boon; tier: number }
export interface Perks { /** act-19 刀谱 */ moves: Record<string, boolean>; owned: Record<string, number> }
export const newPerks = (): Perks => ({ moves: {}, owned: {} });
export const boonTier = (tier: number) => Number.isFinite(tier) ? Math.max(0, Math.min(2, Math.floor(tier))) : 0;
export const tierOf = (p: Perks, id: string) => p.owned[id] == null ? -1 : boonTier(p.owned[id]);
/** owns this boon (any tier) */
export const hasBoon = (p: Perks, id: string) => tierOf(p, id) >= 0;
export const v = (p: Perks, id: string) => { const t = tierOf(p, id); return t < 0 ? 0 : BOONS.find(b => b.id === id)?.vals?.[t] ?? 0; };
export const v2 = (p: Perks, id: string) => { const t = tierOf(p, id); return t < 0 ? 0 : BOONS.find(b => b.id === id)?.vals2?.[t] ?? 0; };
export const isBladeHit = (kind: string) => /^k[1-5]$/.test(kind) || ['rel', 'plunge', 'launch', 'parry', 'echo', 'rel2', 'pass', 'overhead'].includes(kind);
export const boonTag = (_b: Boon, tier: number) => TIER_NAMES[boonTier(tier)];
/** the button names the card / the HUD say for a slot */
export const SLOT_NAMES: Record<Exclude<BoonSlot, null>, string> = { attack: '斩', dash: '冲刺', dart: '镖', stance: '藏锋', jump: '跳' };

const DEFS: BoonDef[] = [
  // ---------------------------------------------------------------- 斩
  { id: 'bladeWind', school: 'sr', slot: 'attack', name: '刀芒', eff: '收尾一刀甩出月牙刀光，穿过一排人', note: '刀光伤害 {v} · 飞行距离 +{v2}', vals: [100, 150, 200], unit: '%', vals2: [0, 20, 40], unit2: '%', col: '#d0c8b8', glyph: ['..........', '..........', '...####...', '.########.', '##########', '.oooooooo.', '...oooo...', '..........', '..........', '..........'] },
  { id: 'extra', school: 'sr', slot: 'attack', name: '叠刃', eff: '收尾一刀砍中，刀影紧跟着补一刀', note: '刀影伤害 {v}', vals: [40, 60, 80], unit: '%', col: '#bd9b82', glyph: ['..##......', '..##..##..', '..##..##..', '..##..##..', '..##..##..', '..##..##..', '.####.##..', '..##.####.', '..oo..##..', '......oo..'] },
  { id: 'bleed', school: 'sr', slot: 'attack', name: '见红', eff: '刀伤一直淌血，挨刀越多流得越快', note: '每层每秒失血 {v} 点 · 最多五层', vals: [1, 1.5, 2], col: '#922f35', glyph: ['....#.....', '...###....', '..#####...', '..##o##...', '...###..#.', '.#.....###', '###....#o#', '#o#.....#.', '.#........', '..........'] },
  { id: 'behead', school: 'sr', slot: 'attack', name: '枭首', eff: '脚下亮红圈的人，挨一刀就倒', note: '血量低于 {v} 亮圈 · 精英减半 · 头目除外', vals: [12, 18, 25], unit: '%', col: '#a64843', glyph: ['.########.', '.#oooooo#.', '.########.', '....##....', '....##....', '....##....', '..........', '.o..o..o..', '##########', '##########'] },
  { id: 'spin', school: 'sr', slot: 'attack', name: '荡刃', eff: '第三刀横扫一圈，远处也够得着', note: '半径加 {v} 米 · 伤害 {v2}', vals: [1.0, 1.4, 1.8], unit: '', vals2: [120, 140, 160], unit2: '%', col: '#b8c4c8', glyph: ['...####...', '.##....##.', '.#......#.', '#...##...#', '#..####..#', '#..####..#', '#...##...#', '.#......#.', '.##....##.', '...####...'] },
  { id: 'pierce', school: 'sr', slot: 'attack', name: '透骨', eff: '连刺第二下刺出长刀光，扎穿一排人', note: '刺光长 {v} 米 · 伤害 {v2}', vals: [4, 5.5, 7], unit: '', vals2: [100, 130, 160], unit2: '%', col: '#e2e8ee', glyph: ['..........', '..........', '..........', '#.........', '##########', '##########', '#.........', '..........', '..........', '..........'] },
  // ---------------------------------------------------------------- 冲刺
  { id: 'passCut', school: 'sr', slot: 'dash', name: '错身', eff: '冲刺穿过谁，就顺手砍谁一刀', note: '伤害 {v}', vals: [70, 100, 130], unit: '%', col: '#9ad8ff', glyph: ['..........', '....#.....', '....##....', '#########.', '##########', '#########.', '....##....', '....#.....', '..........', '..........'] },
  { id: 'decoy', school: 'sr', slot: 'dash', name: '留影', eff: '起步留下残影，引周围的人去砍', note: '残影停 {v} · 每 {v2} 留一个', vals: [1, 1.3, 1.6], unit: '秒', vals2: [4, 3, 2], unit2: '秒', col: '#8a96d8', glyph: ['..##....##', '..##....##', '.####..###', '.####..###', '..##....##', '..##....##', '.#..#..#.#', '.#..#..#.#', '..........', '..........'] },
  // ---------------------------------------------------------------- 镖
  { id: 'darts3', school: 'sr', slot: 'dart', name: '撒星', eff: '几枚柳叶镖齐飞，迎面扇形散开', note: '一次 {v} 枚', vals: [3, 4, 5], col: '#9dabb2', glyph: ['.#..##..#.', '###.##.###', '.#..##..#.', '.#..##..#.', '.#..##..#.', '.o..oo..o.', '.o..oo..o.', '..........', '..........', '..........'] },
  { id: 'boomerang', school: 'sr', slot: 'dart', name: '折返', eff: '柳叶镖飞出去又折回，来回都扎人', note: '回程伤害 {v}', vals: [100, 130, 160], unit: '%', col: '#c8d0d6', glyph: ['..######..', '.#......#.', '#........#', '#.........', '#.........', '#....#....', '.#...##...', '..#######.', '.....##...', '.....#....'] },
  { id: 'pin', school: 'sr', slot: 'dart', name: '截脉', eff: '镖钉住人，招挥到一半也得停', note: '定住 {v} · 头目除外', vals: [0.8, 1.1, 1.4], unit: '秒', col: '#a8d8f0', glyph: ['....##....', '....##....', '....##....', '...####...', '.#..##..#.', '..#.##.#..', '...####...', '..#....#..', '.#......#.', '..........'] },
  // ---------------------------------------------------------------- 藏锋
  { id: 'twinDraw', school: 'sr', slot: 'stance', name: '追步', eff: '箭步斩冲完，再奔下一人砍一刀', note: '第二刀伤害 {v}', vals: [60, 80, 100], unit: '%', col: '#ffd890', glyph: ['..........', '##........', '####......', '######....', '####.##...', '##...####.', '.....#####', '.....####.', '.....##...', '..........'] },
  { id: 'burst', school: 'sr', slot: 'stance', name: '崩劲', eff: '破势接住来招，震开身边的人', note: '半径 {v} 米 · 伤害 {v2} 点', vals: [3, 3.6, 4.2], unit: '', vals2: [8, 12, 16], col: '#ffe0a0', glyph: ['#...##...#', '.#..##..#.', '..#....#..', '...####...', '##.####.##', '##.####.##', '...####...', '..#....#..', '.#..##..#.', '#...##...#'] },
  // ---------------------------------------------------------------- 跳
  { id: 'rift', school: 'sr', slot: 'jump', name: '裂地', eff: '劈山裂开地面，把沿路的人掀起来', note: '裂缝长 {v} 米 · 伤害 {v2} 点', vals: [5, 6.5, 8], unit: '', vals2: [10, 14, 18], col: '#d8b888', glyph: ['....##....', '....##....', '....##....', '..######..', '....##....', '....##....', '..........', '....##....', '...####...', '##########'] },
  { id: 'vault', school: 'sr', slot: 'jump', name: '掠顶', eff: '跳过谁的头顶，就朝谁劈一刀', note: '每人一刀 · 伤害 {v} 点', vals: [8, 11, 14], col: '#c0d0e0', glyph: ['...####...', '..#....#..', '.#......#.', '#...##...#', '....##....', '....##....', '...####...', '..######..', '..######..', '..........'] },
  // ---------------------------------------------------------------- 被动
  { id: 'drink', school: 'sr', slot: null, name: '饮血', eff: '斩杀一人，吸回一口血', note: '每人回 {v} 点血', vals: [3, 5, 7], col: '#9d3b40', glyph: ['..........', '#oooooooo#', '##########', '.########.', '.########.', '..######..', '....##....', '....##....', '..######..', '..........'] },
];
export const BOONS: SkillBoon[] = DEFS.map(d => ({ ...d, desc: [d.eff, d.note] }));
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
