// Suit dice data (SPEC_v2 §1.2 / §1.3): which suit each value shows per class, suit colours, the 10×10 pixel icons used both as the
// full-face silhouette (scheme A) and as pips (scheme B), and the special dice (whole-die material + glowing edge).
// Pure data: when SPEC_v2 changes faces, colours or specials, edit this file only.

export type ClassId = 'warrior' | 'mage' | 'rogue';
export type SuitId = 'axe' | 'blood' | 'rage' | 'star' | 'moon' | 'sun' | 'void' | 'poison' | 'blade' | 'shadow';
/** A: whole face in the suit colour + big suit silhouette relief + big outlined numeral. B: suit icons as pips. */
export type FaceScheme = 'A' | 'B';
export type SpecialId = 'fury' | 'titan' | 'starry' | 'shadowres' | 'gold';

export interface Suit {
  name: string;
  /** face colour, its light tone (relief, pips) and dark tone (shadows, outlines) */
  col: string; light: string; dark: string;
  /** optional bright outline around the silhouette / pips (虚空: 亮紫描边) */
  edge?: string;
  /** 10×10: '#' main, 'o' accent (drawn in `accent`, glows), 'd' dark fill, '.' empty */
  icon: string[];
  accent?: string;
}

export const SUITS: Record<SuitId, Suit> = {
  axe: { name: '斧', col: '#4277b4', light: '#9cc8f0', dark: '#1c3656', icon: [
    '##..##..##', '###.##.###', '##########', '##########', '###.##.###', '##..##..##', '....##....', '....##....', '....##....', '....##....'] },
  blood: { name: '血', col: '#a3172a', light: '#f06a6a', dark: '#420610', icon: [
    '....##....', '....##....', '...####...', '...####...', '..######..', '.###o####.', '.##oo####.', '.########.', '..######..', '...####...'], accent: '#ffd0c8' },
  rage: { name: '怒', col: '#e2861a', light: '#ffd868', dark: '#5e2804', icon: [
    '...#......', '...##..#..', '..###..##.', '..####.##.', '.########.', '.########.', '####oo####', '###oooo###', '.##oooo##.', '..######..'], accent: '#fff4b0' },
  star: { name: '星', col: '#b4e8f0', light: '#ffffff', dark: '#3c7c8c', icon: [
    '....##....', '....##....', '...####...', '.########.', '####oo####', '####oo####', '.########.', '...####...', '....##....', '....##....'], accent: '#ffffff' },
  moon: { name: '月', col: '#5672c4', light: '#dce6ff', dark: '#202c5e', icon: [
    '..#####...', '.####.....', '####......', '###.......', '###.......', '###.......', '###.......', '####......', '.####.....', '..#####...'] },
  sun: { name: '日', col: '#f2a81e', light: '#fff4a8', dark: '#723c00', icon: [
    '....##....', '.#......#.', '...####...', '..##oo##..', '#.#oooo#.#', '#.#oooo#.#', '..##oo##..', '...####...', '.#......#.', '....##....'], accent: '#ffffff' },
  void: { name: '虚空', col: '#341258', light: '#9a5ae0', dark: '#10041c', edge: '#d080ff', icon: [
    '...####...', '.##....##.', '.#......#.', '#...##...#', '#..#oo#..#', '#..#oo#..#', '#...##...#', '.#......#.', '.##....##.', '...####...'], accent: '#f0c0ff' },
  poison: { name: '毒', col: '#44a028', light: '#c0ff64', dark: '#163c08', icon: [
    '..######..', '.########.', '##########', '#ddd##ddd#', '#ddd##ddd#', '##########', '.###dd###.', '..######..', '..#d##d#..', '..######..'] },
  blade: { name: '刃', col: '#d2d8e2', light: '#ffffff', dark: '#5c6474', icon: [
    '....##....', '....#o....', '...##o#...', '...##o#...', '...##o#...', '...##o#...', '.########.', '.########.', '....##....', '...####...'], accent: '#ffffff' },
  shadow: { name: '影', col: '#44265a', light: '#a476cc', dark: '#14081e', icon: [
    '...####...', '..######..', '.########.', '.##dddd##.', '##doddod##', '##dddddd##', '##dddddd##', '###dddd###', '####..####', '##########'], accent: '#ff60ff' },
};

/** value 1..6 → suit (index = value − 1). SPEC_v2 §1.2. */
export const CLASS_FACES: Record<ClassId, SuitId[]> = {
  warrior: ['axe', 'axe', 'axe', 'blood', 'blood', 'rage'],
  mage: ['star', 'star', 'moon', 'moon', 'sun', 'void'],
  rogue: ['poison', 'blade', 'blade', 'blade', 'shadow', 'shadow'],
};
export const CLASS_NAME: Record<ClassId, string> = { warrior: '嗜血狂战', mage: '星界魔导', rogue: '影锋刺客' };
export const CLASS_COL: Record<ClassId, string> = { warrior: '#c8302a', mage: '#5a8aff', rogue: '#a050e0' };

export interface Special {
  name: string; cls: ClassId | null;
  /** the six face values */
  faces: number[];
  /** fixed suit per value (else the class table) */
  suitOf?: (v: number) => SuitId;
  /** whole-die body colour (mixed into every face), glowing edge colour, metal look */
  body: string; glow: string; metal?: number;
}
/** SPEC_v2 §1.3 (+ the 金骰 reward die). */
export const SPECIALS: Record<SpecialId, Special> = {
  fury: { name: '怒火骰', cls: 'warrior', faces: [1, 2, 3, 4, 5, 6], suitOf: v => (v <= 2 ? 'blood' : 'rage'), body: '#3a0c06', glow: '#ff5a10' },
  titan: { name: '泰坦骰', cls: 'warrior', faces: [6, 6, 6, 6, 6, 6], suitOf: () => 'rage', body: '#2a2c34', glow: '#ffb040', metal: 0.6 },
  starry: { name: '星辰骰', cls: 'mage', faces: [2, 2, 4, 5, 6, 6], body: '#0e1650', glow: '#8ad8ff' },
  shadowres: { name: '暗影残骰', cls: 'rogue', faces: [1, 2, 3, 4, 5, 6], suitOf: () => 'shadow', body: '#12081c', glow: '#b860ff' },
  gold: { name: '金骰', cls: null, faces: [1, 2, 3, 4, 5, 6], body: '#c8961e', glow: '#ffe68a', metal: 0.7 },
};

/** How a die model is skinned with suits. */
export interface SuitSkin { cls: ClassId; scheme: FaceScheme; special?: SpecialId; /** rules v3 / R6: no suits, every face shows its own square pixel numeral (dice/numFace.ts; special dice keep their body, glowing frame and a small effect icon) */ plain?: boolean }
export function skinFaces(s: SuitSkin): number[] { return s.special ? SPECIALS[s.special].faces : [1, 2, 3, 4, 5, 6]; }
export function suitOf(s: SuitSkin, v: number): SuitId {
  const sp = s.special ? SPECIALS[s.special] : null;
  if (sp?.suitOf) return sp.suitOf(v);
  return CLASS_FACES[s.cls][Math.max(1, Math.min(6, v)) - 1];
}

/** Big 4×5 numerals (scheme A) — chunky enough to read at 15 art pixels. */
export const NUM45: Record<string, string[]> = {
  '1': ['.##.', '###.', '.##.', '.##.', '####'],
  '2': ['###.', '...#', '.##.', '#...', '####'],
  '3': ['###.', '...#', '.##.', '...#', '###.'],
  '4': ['#..#', '#..#', '####', '...#', '...#'],
  '5': ['####', '#...', '###.', '...#', '###.'],
  '6': ['.##.', '#...', '###.', '#..#', '.##.'],
};

/** Pip centres for values 1..6 on a unit face (scheme B), the usual die layout. */
export const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.24, 0.24], [0.5, 0.5], [0.76, 0.76]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.27, 0.2], [0.73, 0.2], [0.27, 0.5], [0.73, 0.5], [0.27, 0.8], [0.73, 0.8]],
};

/** Condition icons for skill-tablet rows (10×10, same format as suit icons). */
export const COND_ICONS: Record<'pair' | 'straight' | 'sum' | 'big' | 'any', string[]> = {
  pair: ['..........', '####..####', '#..#..#..#', '#.##..#.##', '####..####', '..........', '..........', '##########', '##########', '..........'],
  straight: ['..........', '........##', '........##', '.....##.##', '.....##.##', '..##.##.##', '..##.##.##', '#####.##.#', '##########', '##########'],
  sum: ['##########', '##......##', '.##.......', '..##......', '...##.....', '...##.....', '..##......', '.##.......', '##......##', '##########'],
  big: ['....##....', '...####...', '..######..', '.########.', '....##....', '....##....', '....##....', '....##....', '..######..', '..######..'],
  any: ['..........', '.########.', '.#......#.', '.#.##.#.#.', '.#......#.', '.#.#.##.#.', '.#......#.', '.########.', '..........', '..........'],
};
