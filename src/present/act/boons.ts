// 秘传（哈迪斯式的局内能力）：清完一间屋三选一。每个只做一件看得见的事，不堆数值（feedback-strengths-scope：一个效果一眼看懂）。
export interface Boon { id: string; name: string; desc: string[]; col: string; glyph: string[] }
export interface Perks { burn: boolean; dashCut: number; spCdK: number; killHeal: number; relFreeze: boolean; dashEdge: boolean; bladeWind: boolean; hpUp: number }
export const newPerks = (): Perks => ({ burn: false, dashCut: 0, spCdK: 1, killHeal: 0, relFreeze: false, dashEdge: false, bladeWind: false, hpUp: 0 });

export const BOONS: Boon[] = [
  { id: 'burn', name: '火遁 · 燃刃', desc: ['收尾一刀和突进斩', '点燃敌人，烧 3 秒'], col: '#ff7a3a',
    glyph: ['....##....', '...###....', '...####.#.', '..######..', '..#######.', '.###oo###.', '.##oooo##.', '.##oooo##.', '..######..', '...####...'] },
  { id: 'dashCut', name: '疾风 · 风切', desc: ['冲刺穿过敌人', '顺手划一刀（10）'], col: '#8ad8ff',
    glyph: ['..........', '......##..', '......###.', '####..####', '..########', '..########', '####..####', '......###.', '......##..', '..........'] },
  { id: 'spCd', name: '影 · 速印', desc: ['影分身的冷却', '缩短四成'], col: '#b89aff',
    glyph: ['....##....', '....##....', '....####..', '##..####..', '########..', '..########', '..####..##', '..####....', '....##....', '....##....'] },
  { id: 'killHeal', name: '血契', desc: ['每杀一个敌人', '回 4 点生命'], col: '#ff5a5a',
    glyph: ['.##...##..', '####.####.', '#########.', '#########.', '.#######..', '..#####...', '...###....', '....#.....', '..........', '..........'] },
  { id: 'relFreeze', name: '寒刃', desc: ['突进斩命中的敌人', '冻住 1.6 秒'], col: '#9af0ff',
    glyph: ['....##....', '.#..##..#.', '..#.##.#..', '...####...', '##########', '##########', '...####...', '..#.##.#..', '.#..##..#.', '....##....'] },
  { id: 'dashEdge', name: '连影', desc: ['冲刺后 1 秒内', '普攻伤害 +50%'], col: '#ffd070',
    glyph: ['##........', '####......', '######....', '########..', '##########', '##########', '########..', '######....', '####......', '##........'] },
  { id: 'bladeWind', name: '刃风', desc: ['收尾一刀放出一道刃风', '直线飞出，沿途伤害'], col: '#c8ffd8',
    glyph: ['..........', '##........', '.####.....', '..#######.', '...#######', '...#######', '..#######.', '.####.....', '##........', '..........'] },
  { id: 'hpUp', name: '坚韧', desc: ['最大生命 +25', '并回复 25'], col: '#9aff9a',
    glyph: ['....##....', '....##....', '....##....', '##########', '##########', '....##....', '....##....', '....##....', '..........', '..........'] },
];
export function applyBoon(p: Perks, id: string) {
  if (id === 'burn') p.burn = true; else if (id === 'dashCut') p.dashCut = 10; else if (id === 'spCd') p.spCdK = 0.6; else if (id === 'killHeal') p.killHeal = 4;
  else if (id === 'relFreeze') p.relFreeze = true; else if (id === 'dashEdge') p.dashEdge = true; else if (id === 'bladeWind') p.bladeWind = true; else if (id === 'hpUp') p.hpUp += 25;
}
