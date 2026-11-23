// act-136 统一硬边像素铁木铭牌体系（全分辨率 UiText 层渲染，横平竖直、零渐变雾感、兼容微信小游戏）：
// 用于全游戏场景头顶名牌、最近交互高亮牌、摊位货签、出口高札浮签、防遮挡秘藏浮标，以及选卡/据点界面的顶栏抬头、实体货币牌、页签与信物详情栏。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { makeCanvas } from '../../platform/index';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import { icon as drawPixIcon } from '../v2/overlay';
import { bodyText, bodyW, BODY_FONT } from '../ui3d/bodyFont';
import { PAD, paintGlyph, glyphArt, GLYPH_H, paintKeyCap, keyCapWidth, KEYCAP_H, actKey, BIND } from './pad';
import { language, t as localize } from './i18n';
import { uiScale } from './uiScale';
import { SKIN } from './skin';

export type MiniIcon =
  | 'coin' | 'iron' | 'herb' | 'chest' | 'mythic' | 'scroll' | 'heal'
  | 'forge' | 'stele' | 'star' | 'starOff' | 'door' | 'leaf' | 'blade' | 'talk'
  | 'blood' | 'poise' | 'shadow' | 'gale' | 'meta' | 'boss'
  | 'grasp' | 'hp' | 'atk' | 'parry' | 'ult' | 'dash' | 'shield' | 'lock'
  | 'bolt' | 'frost' | 'fire' | 'dart' | 'crit';

/** Draw crisp axis-aligned 9x9 pixel icon centered at (cx, cy) with block size u (device px). */
export function drawMiniIcon(g: CanvasRenderingContext2D, kind: MiniIcon, cx: number, cy: number, sz: number) {
  const u = Math.max(1, Math.round(sz / 9));
  const x0 = Math.round(cx - u * 4.5), y0 = Math.round(cy - u * 4.5);
  const R = (rx: number, ry: number, rw: number, rh: number, col: string) => {
    g.fillStyle = col; g.fillRect(x0 + rx * u, y0 + ry * u, rw * u, rh * u);
  };
  switch (kind) {
    case 'coin':
      R(1, 0, 7, 9, '#1a1008'); R(0, 1, 9, 7, '#1a1008');
      R(2, 1, 5, 7, '#e2a246'); R(1, 2, 7, 5, '#e2a246');
      R(2, 1, 5, 1, '#fff0a8');
      R(3, 3, 3, 3, '#3c240c');
      break;
    case 'iron':
      R(1, 4, 7, 4, '#14161c'); R(2, 2, 5, 3, '#14161c');
      R(1, 5, 7, 2, '#5a6274'); R(2, 3, 5, 2, '#a8b4c8');
      R(3, 2, 3, 1, '#dde6f4'); R(5, 3, 2, 2, '#ff9842');
      break;
    case 'herb':
      R(3, 5, 3, 4, '#0c2014'); R(1, 2, 7, 4, '#0c2014'); R(3, 0, 3, 3, '#0c2014');
      R(4, 5, 1, 3, '#2d7648');
      R(1, 3, 3, 2, '#66e494'); R(5, 3, 3, 2, '#66e494');
      R(3, 1, 3, 3, '#a8ffca'); R(4, 1, 1, 1, '#e8fff0');
      break;
    case 'chest':
    case 'mythic': {
      const body = kind === 'mythic' ? '#c83424' : '#8a3220';
      const rim = kind === 'mythic' ? '#ffe066' : '#e2b24a';
      const core = kind === 'mythic' ? '#fff4b8' : '#ffd878';
      R(0, 1, 9, 8, '#160d0a');
      R(1, 2, 7, 6, body);
      R(1, 2, 7, 1, rim); R(1, 4, 7, 1, rim); R(1, 2, 1, 6, rim); R(7, 2, 1, 6, rim);
      R(4, 4, 1, 2, core);
      break;
    }
    case 'scroll':
      R(0, 1, 9, 7, '#18110a');
      R(1, 2, 7, 5, '#d4b878'); R(1, 2, 7, 1, '#f2dfa8');
      R(0, 1, 1, 7, '#7a5224'); R(8, 1, 1, 7, '#7a5224');
      R(3, 2, 1, 5, '#a82c22'); R(6, 2, 1, 5, '#a82c22');
      break;
    case 'heal':
      R(2, 0, 5, 9, '#0c2416'); R(0, 2, 9, 5, '#0c2416');
      R(3, 1, 3, 7, '#66e494'); R(1, 3, 7, 3, '#66e494');
      R(3, 1, 3, 2, '#c8ffdc');
      break;
    case 'forge':
      R(1, 1, 5, 3, '#161418'); R(2, 2, 3, 1, '#e8b060');
      R(3, 4, 1, 3, '#9a6e38');
      R(0, 6, 9, 3, '#161418'); R(1, 7, 7, 1, '#9aa4b4');
      break;
    case 'stele':
      R(2, 0, 5, 2, '#14121c'); R(1, 2, 7, 7, '#14121c');
      R(2, 2, 5, 6, '#7a7e92'); R(3, 1, 3, 1, '#b8a0ff');
      R(4, 3, 1, 4, '#242030');
      break;
    case 'star':
      R(4, 0, 1, 9, '#ffe27a'); R(0, 4, 9, 1, '#ffe27a');
      R(3, 2, 3, 5, '#ffc848'); R(2, 3, 5, 3, '#ffc848');
      R(4, 3, 1, 2, '#fff8d4');
      break;
    case 'starOff':
      R(4, 1, 1, 7, '#5c5864'); R(1, 4, 7, 1, '#5c5864');
      R(3, 3, 3, 3, '#44404c');
      break;
    case 'door':
      R(1, 0, 7, 9, '#16110c');
      R(2, 1, 5, 7, '#7a542e'); R(3, 2, 3, 6, '#ffd27a');
      R(4, 3, 1, 4, '#fff6cc');
      break;
    case 'leaf':
      R(2, 1, 5, 6, '#122416'); R(3, 2, 3, 4, '#78e898');
      R(4, 1, 2, 2, '#c8ffd8'); R(4, 6, 1, 2, '#3c7a4c');
      break;
    case 'blade':
    case 'atk':
      R(4, 0, 1, 6, '#e8eef8'); R(3, 1, 1, 4, '#9aa6b8');
      R(2, 6, 5, 1, '#d8a248'); R(4, 7, 1, 2, '#b83228');
      break;
    case 'talk':
      R(1, 1, 7, 6, '#14121a'); R(2, 2, 5, 4, '#f2e8d6');
      R(3, 3, 1, 1, '#262028'); R(5, 3, 1, 1, '#262028');
      R(2, 7, 2, 1, '#f2e8d6');
      break;
    case 'blood':
      // Crimson blood-blade drop emblem (血刃)
      R(4, 0, 1, 2, '#1c080a'); R(3, 1, 3, 3, '#1c080a'); R(2, 3, 5, 5, '#1c080a'); R(3, 8, 3, 1, '#1c080a');
      R(4, 1, 1, 2, '#ff6a60'); R(3, 3, 3, 4, '#e6322c'); R(2, 4, 5, 3, '#d82824'); R(3, 7, 3, 1, '#a81c1a');
      R(4, 3, 1, 2, '#ffd6cc'); R(3, 4, 1, 1, '#fff0ec');
      break;
    case 'poise':
      // Golden shattered shield / heavy crest (破势)
      R(1, 0, 7, 6, '#1a1206'); R(2, 6, 5, 2, '#1a1206'); R(3, 8, 3, 1, '#1a1206');
      R(2, 1, 5, 5, '#e8a832'); R(3, 6, 3, 1, '#c88420'); R(4, 7, 1, 1, '#a06418');
      R(2, 1, 5, 1, '#fff0a8'); R(2, 2, 2, 3, '#ffd258');
      // Diagonal crack slash across shield
      R(6, 1, 1, 1, '#1a1206'); R(5, 2, 1, 2, '#fff8dc'); R(4, 4, 1, 1, '#fff8dc'); R(3, 5, 1, 1, '#1a1206');
      break;
    case 'shadow':
      // Indigo-violet willow dart / shuriken emblem (影镖)
      R(4, 0, 1, 9, '#121428'); R(0, 4, 9, 1, '#121428'); R(2, 2, 5, 5, '#121428');
      R(4, 1, 1, 7, '#a4b4ff'); R(1, 4, 7, 1, '#a4b4ff');
      R(3, 3, 3, 3, '#6e7ee8'); R(4, 4, 1, 1, '#ffffff');
      R(4, 1, 1, 2, '#eef2ff'); R(6, 4, 2, 1, '#eef2ff');
      break;
    case 'gale':
      // Jade-cyan soaring wing / wind crest (凌空)
      R(1, 1, 7, 7, '#0a201c');
      R(2, 1, 6, 2, '#76f0cc'); R(1, 3, 6, 2, '#48d4aa'); R(2, 5, 5, 2, '#2ca888');
      R(3, 1, 4, 1, '#e0fff6'); R(2, 3, 3, 1, '#b8ffee');
      R(1, 6, 3, 2, '#76f0cc');
      break;
    case 'meta':
      // Twin meta currency emblem: iron ingot left + jade herb right (残铁药引)
      R(0, 2, 5, 6, '#14141c'); R(1, 4, 3, 3, '#7a869c'); R(1, 3, 3, 1, '#cfd8ec'); R(3, 4, 1, 2, '#ff9842');
      R(4, 1, 5, 7, '#0c2016'); R(5, 3, 3, 3, '#66e494'); R(6, 2, 2, 2, '#c8ffdc'); R(6, 6, 1, 2, '#2d7648');
      break;
    case 'boss':
      // Crimson horned boss emblem (首领)
      R(0, 0, 2, 3, '#1e0608'); R(7, 0, 2, 3, '#1e0608');
      R(1, 2, 7, 6, '#1e0608'); R(2, 7, 5, 2, '#1e0608');
      R(1, 1, 1, 2, '#ffd066'); R(7, 1, 1, 2, '#ffd066');
      R(2, 3, 5, 4, '#d82a24'); R(3, 7, 3, 1, '#a81e1a');
      R(3, 4, 1, 1, '#fff6cc'); R(5, 4, 1, 1, '#fff6cc');
      R(4, 6, 1, 1, '#1e0608');
      break;
    case 'grasp':
      // Hades-2-style jade meditation diamond seal (悟性玉印)
      R(3, 0, 3, 9, '#081812'); R(1, 2, 7, 5, '#081812'); R(0, 3, 9, 3, '#081812');
      R(4, 1, 1, 7, '#64e6a4'); R(2, 3, 5, 3, '#64e6a4'); R(3, 2, 3, 5, '#8ef8c0');
      R(4, 3, 1, 2, '#ffffff');
      break;
    case 'hp':
      R(1, 1, 3, 3, '#1a080c'); R(5, 1, 3, 3, '#1a080c'); R(0, 2, 9, 3, '#1a080c');
      R(1, 4, 7, 2, '#1a080c'); R(2, 6, 5, 2, '#1a080c'); R(3, 7, 3, 2, '#1a080c');
      R(1, 2, 3, 3, '#e84852'); R(5, 2, 3, 3, '#e84852'); R(2, 3, 5, 3, '#e84852');
      R(3, 6, 3, 1, '#e84852'); R(4, 7, 1, 1, '#e84852');
      R(2, 2, 1, 1, '#ffc4c8');
      break;
    case 'parry':
      R(2, 0, 5, 9, '#1a1408'); R(0, 2, 9, 5, '#1a1408');
      R(3, 1, 3, 1, '#ffe484'); R(3, 7, 3, 1, '#ffe484');
      R(1, 3, 1, 3, '#ffe484'); R(7, 3, 1, 3, '#ffe484');
      R(4, 2, 1, 5, '#fff8dc'); R(2, 4, 5, 1, '#fff8dc');
      break;
    case 'ult':
      R(1, 1, 7, 7, '#1a1206');
      R(2, 1, 5, 1, '#ffd258'); R(6, 2, 2, 5, '#ffd258'); R(2, 7, 5, 1, '#ffd258');
      R(5, 2, 1, 5, '#fff4b8'); R(3, 4, 3, 1, '#ff9838');
      break;
    case 'dash':
      R(0, 3, 6, 3, '#0a1824'); R(4, 1, 4, 7, '#0a1824');
      R(1, 4, 6, 1, '#82dcff'); R(5, 2, 1, 5, '#82dcff'); R(6, 3, 1, 3, '#d6f4ff'); R(7, 4, 1, 1, '#ffffff');
      break;
    case 'shield':
      R(1, 0, 7, 6, '#12161e'); R(2, 6, 5, 2, '#12161e'); R(3, 8, 3, 1, '#12161e');
      R(2, 1, 5, 5, '#7aa4d8'); R(3, 6, 3, 1, '#7aa4d8'); R(4, 7, 1, 1, '#7aa4d8');
      R(2, 1, 5, 1, '#cde6ff'); R(4, 2, 1, 4, '#ffe088');
      break;
    case 'lock':
      R(2, 0, 5, 4, '#0c0c10'); R(1, 3, 7, 6, '#0c0c10');
      R(3, 1, 3, 1, '#9ca4b4'); R(3, 2, 1, 2, '#9ca4b4'); R(5, 2, 1, 2, '#9ca4b4');
      R(2, 4, 5, 4, '#7a8090'); R(4, 5, 1, 2, '#1a1820');
      break;
    case 'bolt':
      R(4, 0, 3, 3, '#1a1406'); R(2, 2, 5, 4, '#1a1406'); R(3, 5, 3, 4, '#1a1406');
      R(5, 1, 1, 2, '#fff4a8'); R(3, 3, 4, 1, '#ffe058'); R(4, 4, 2, 2, '#ffc436'); R(3, 6, 2, 2, '#ffe058');
      break;
    case 'frost':
      R(4, 0, 1, 9, '#a4f4ff'); R(0, 4, 9, 1, '#a4f4ff');
      R(2, 2, 1, 1, '#68d4f4'); R(6, 2, 1, 1, '#68d4f4'); R(2, 6, 1, 1, '#68d4f4'); R(6, 6, 1, 1, '#68d4f4');
      R(3, 3, 3, 3, '#68d4f4'); R(4, 4, 1, 1, '#ffffff');
      break;
    case 'fire':
      R(3, 0, 3, 3, '#1c0c06'); R(1, 2, 7, 6, '#1c0c06'); R(2, 7, 5, 2, '#1c0c06');
      R(4, 1, 1, 2, '#ff8636'); R(2, 3, 5, 4, '#ff6828'); R(3, 4, 3, 4, '#ffc444'); R(4, 5, 1, 2, '#fff8c8');
      break;
    case 'dart':
      R(4, 0, 1, 9, '#d8ecff'); R(3, 2, 3, 2, '#ffffff'); R(3, 6, 3, 2, '#d85058');
      break;
    case 'crit':
      R(4, 0, 1, 9, '#ff8844'); R(0, 4, 9, 1, '#ff8844');
      R(3, 2, 3, 5, '#ffd058'); R(2, 3, 5, 3, '#ffd058'); R(4, 4, 1, 1, '#ffffff');
      break;
  }
}

// ---------------------------------------------------------------- Hades-2-style inline pixel-icon rich text & cost chips
/** Crisp 7×7 axis-aligned inline icons embedded right inside description text lines. */
const INLINE_MINI: Record<string, string[]> = {
  blade:  ['...#...', '...#...', '...#...', '...#...', '.#####.', '...#...', '..###..'],
  blood:  ['...#...', '..###..', '..###..', '.#####.', '.#####.', '..###..', '.......'],
  bone:   ['.#...#.', '..###..', '...#...', '...#...', '...#...', '..###..', '.#...#.'],
  dart:   ['...#...', '..###..', '...#...', '...#...', '..###..', '..#.#..', '..###..'],
  dash:   ['.......', '....#..', '######.', '#######', '######.', '....#..', '.......'],
  heart:  ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...', '.......'],
  draw:   ['#######', '...#...', '...#...', '...#...', '...#...', '..###..', '...#...'],
  qi:     ['.......', '.#####.', '.#ooo#.', '.#ooo#.', '.#ooo#.', '.#####.', '.......'],
  ingot:  ['.......', '.......', '.#####.', '#######', '#######', '.......', '.......'],
  up:     ['...#...', '..###..', '.#####.', '...#...', '...#...', '...#...', '.......'],
  stun:   ['.#...#.', '###.###', '.#...#.', '.......', '...#...', '..###..', '...#...'],
  moon:   ['.......', '#.....#', '##...##', '.#####.', '..###..', '.......', '.......'],
  // act-151: Hades 2 currencies, grasp, defense, elements, parry, crit
  herb:   ['...#...', '..###..', '###.###', '.#####.', '...#...', '...#...', '..###..'],
  iron:   ['.......', '..###..', '.#####.', '#######', '#######', '.......', '.......'],
  coin:   ['..###..', '.#####.', '##...##', '##...##', '##...##', '.#####.', '..###..'],
  grasp:  ['...#...', '..###..', '.##o##.', '###o###', '.##o##.', '..###..', '...#...'],
  shield: ['.#####.', '#######', '###o###', '###o###', '.#####.', '..###..', '...#...'],
  parry:  ['..###..', '.#.#.#.', '###o###', '.#.#.#.', '..###..', '.......', '.......'],
  bolt:   ['....##.', '...##..', '..####.', '...##..', '..##...', '.##....', '.......'],
  frost:  ['...#...', '.#.#.#.', '..###..', '###o###', '..###..', '.#.#.#.', '...#...'],
  fire:   ['...#...', '..###..', '.##o##.', '###o###', '#######', '.#####.', '..###..'],
  crit:   ['...#...', '...#...', '..###..', '###o###', '..###..', '...#...', '...#...'],
};

const KEYS: Array<[string, string, string]> = ([
  // Currencies & meta resources
  ['药引', 'herb', '#82f4ac'], ['残铁', 'iron', '#c4d2e8'], ['铜钱', 'coin', '#ffe074'], ['悟性', 'grasp', '#8ef8c0'],
  // Core stats & survivability
  ['气血上限', 'heart', '#ff7882'], ['气血', 'heart', '#ff7882'], ['回一口血', 'heart', '#8aff9a'], ['回血', 'heart', '#8aff9a'], ['生命', 'heart', '#8aff9a'],
  ['减伤', 'shield', '#8ec4ff'], ['护盾', 'shield', '#8ec4ff'], ['霸体', 'shield', '#ffd27a'],
  ['暴击', 'crit', '#ff9852'], ['听声一闪', 'crit', '#ff9852'], ['一闪', 'crit', '#ff9852'],
  // Combat skills & blade terms
  ['收尾一刀', 'blade', '#ffd27a'], ['连环刀', 'blade', '#ffd27a'], ['箭步斩', 'blade', '#ffd27a'], ['裂阵斩', 'bolt', '#ffe066'], ['追霜', 'frost', '#84ecff'],
  ['劈山', 'blade', '#ffd27a'], ['挑云', 'up', '#ffe08a'], ['斩击', 'blade', '#ffd27a'], ['斩杀', 'crit', '#ff9a6a'],
  ['重斩', 'blade', '#ffd27a'], ['连爆八刀', 'blade', '#ffd27a'], ['回锋斩', 'crit', '#ffd27a'], ['穿风斩', 'dash', '#9ad8ff'],
  ['攻击', 'blade', '#ffd27a'], ['伤害', 'blade', '#ffd27a'], ['刀痕', 'blade', '#ffd27a'],
  ['月牙刀光', 'moon', '#e8fff2'], ['刀光', 'moon', '#e8fff2'], ['刀芒', 'moon', '#e8fff2'],
  ['破势', 'parry', '#ffe68c'], ['听势', 'parry', '#ffe68c'], ['藏锋', 'draw', '#ffd27a'],
  ['不见刀', 'ingot', '#ffd468'], ['绝技', 'ingot', '#ffd468'], ['杀气', 'ingot', '#ffaa5a'],
  ['回半格气', 'qi', '#9cf2e6'], ['一格气', 'qi', '#d6f4ec'],
  // Debuffs & elements
  ['出血', 'blood', '#ff6a5a'], ['放血', 'blood', '#ff6a5a'], ['流血', 'blood', '#ff6a5a'],
  ['破甲', 'bone', '#e0d0b8'], ['硬直', 'bone', '#e0d0b8'], ['断骨', 'bone', '#e0d0b8'], ['破绽', 'bone', '#e0d0b8'],
  ['体素雷柱', 'bolt', '#ffe468'], ['雷裂', 'bolt', '#ffe468'], ['落雷', 'bolt', '#ffe468'], ['惊雷', 'bolt', '#ffe468'], ['雷电', 'bolt', '#ffe468'],
  ['寒气', 'frost', '#84ecff'], ['冻结', 'frost', '#84ecff'], ['霜', 'frost', '#84ecff'],
  ['火油', 'fire', '#ff8c42'], ['灼烧', 'fire', '#ff8c42'],
  ['柳叶镖', 'dart', '#e8eef4'], ['飞镖', 'dart', '#e8eef4'], ['影针', 'dart', '#8cf0ff'],
  // Mobility & crowd control
  ['完美闪避', 'dash', '#9ad8ff'], ['闪避', 'dash', '#9ad8ff'], ['冲刺', 'dash', '#9ad8ff'], ['无敌', 'dash', '#b8ecff'],
  ['攻速', 'dash', '#9ad8ff'], ['移速', 'dash', '#9ad8ff'], ['冷却', 'dash', '#9ad8ff'],
  ['挑上半空', 'up', '#ffe08a'], ['凌空', 'up', '#ffe08a'],
  ['踹飞', 'dash', '#ffc890'], ['震开', 'dash', '#ffc890'], ['打得更远', 'dash', '#ffc890'],
  ['震慑', 'stun', '#f0e0a0'], ['发蒙', 'stun', '#f0e0a0'], ['失衡', 'stun', '#f0e0a0'], ['身形一顿', 'stun', '#f0e0a0'],
] as Array<[string, string, string]>).sort((a, b) => b[0].length - a[0].length);

const RICH_NUM = /^([+\-−]?[0-9]+(?:\.[0-9]+)?(?:%|秒|点|枚|倍|层|阶|格|米)?|[一二三四五六七八九十百半两]+(?:秒|点|成|枚|倍|层|阶|格|米))/;

/** Hades-2-style rich inline text with crisp 7×7 pixel icons before keywords and bright highlighted numbers. */
export function richLine(
  g: CanvasRenderingContext2D | null,
  line: string,
  x: number,
  y: number,
  px: number,
  base: string,
  numCol = '#ffffff',
  keys = true,
  showIcons = true,
  align: 'left' | 'center' | 'right' = 'left',
): number {
  line = localize(line);
  if (g && align !== 'left') {
    const w = richLine(null, line, 0, 0, px, base, numCol, keys, showIcons, 'left');
    const ox = align === 'center' ? x - w / 2 : x - w;
    return richLine(g, line, ox, y, px, base, numCol, keys, showIcons, 'left');
  }
  let i = 0, cx = x, plain = '';
  const flush = () => {
    if (!plain) return;
    if (g) bodyText(g, plain, cx, y, px, base, 'left', '#08060c');
    cx += bodyW(plain, px);
    plain = '';
  };
  while (i < line.length) {
    const rest = line.slice(i);
    const k = keys ? KEYS.find(([w]) => rest.startsWith(w)) : undefined;
    if (k) {
      flush();
      if (showIcons) {
        const c = Math.max(1, Math.round(px / 9.5)), iw = 7 * c;
        if (g) drawPixIcon(g, INLINE_MINI[k[1]], Math.round(cx + 1), Math.round(y + (px * 0.94 - iw) / 2), c, { main: k[2], acc: '#ffffff' });
        cx += iw + Math.round(px * 0.18);
      }
      if (g) bodyText(g, k[0], cx, y, px, k[2], 'left', '#08060c');
      cx += bodyW(k[0], px);
      i += k[0].length;
      continue;
    }
    const n = rest.match(RICH_NUM);
    if (n && (i === 0 || !/[一二三四五六七八九十]/.test(line[i - 1]))) {
      flush();
      if (g) bodyText(g, n[1], cx, y, px, numCol, 'left', '#08060c');
      cx += bodyW(n[1], px);
      i += n[1].length;
      continue;
    }
    plain += line[i];
    i++;
  }
  flush();
  return cx - x;
}

/** Measure / draw Hades-2-style `[Icon] have/need` (red numerator when short) or `[Icon] need` chip. Returns width in device px. */
export function drawCostChip(
  g: CanvasRenderingContext2D | null,
  cur: 'iron' | 'herb' | 'coin' | 'grasp',
  amount: number,
  have: number | undefined,
  x: number,
  midY: number,
  scale: number,
  dpr: number,
): number {
  const tH = PIX_H * scale;
  const icoSz = Math.round(tH * 1.04);
  const gap = Math.round(4 * dpr);
  const short = have != null && have < amount;
  const okCol = cur === 'herb' ? '#9efcc4' : cur === 'grasp' ? '#9cf8c8' : '#ffe278';
  if (short && have != null) {
    const a = String(have), b = `/${amount}`;
    const wA = pixW(a) * scale, wB = pixW(b) * scale;
    if (g) {
      drawMiniIcon(g, cur, x + icoSz / 2, midY, icoSz);
      const ty = Math.round(midY - tH / 2);
      drawPix(g, a, x + icoSz + gap, ty, { scale, color: '#ff7a6c', outline: '#08060c', align: 'left' });
      drawPix(g, b, x + icoSz + gap + wA, ty, { scale, color: '#c4b8b0', outline: '#08060c', align: 'left' });
    }
    return icoSz + gap + wA + wB;
  }
  const s = String(amount);
  const wS = pixW(s) * scale;
  if (g) {
    drawMiniIcon(g, cur, x + icoSz / 2, midY, icoSz);
    drawPix(g, s, x + icoSz + gap, Math.round(midY - tH / 2), { scale, color: okCol, outline: '#08060c', align: 'left' });
  }
  return icoSz + gap + wS;
}

/** Paint a hard-stepped pixel iron/lacquer plaque (zero smooth gradients, strictly axis-aligned). */
export function drawPixelPlaque(
  g: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  p: number,
  o: { bg?: string; hi?: string; border?: string; inner?: string; accent?: string; rivets?: boolean; accentBar?: string; active?: boolean } = {},
) {
  const X = Math.round(x), Y = Math.round(y), W = Math.round(w), H = Math.round(h), u = Math.max(1, Math.round(p));
  const sk = SKIN.id;
  const act = !!o.active;
  const outer = o.border ?? (sk === 'lacquer' ? '#0d0507' : sk === 'bamboo' ? '#22150a' : '#0a080d');
  const inner = o.inner ?? (sk === 'lacquer' ? (act ? '#ffdc78' : '#d8a238') : sk === 'bamboo' ? (act ? '#f2d98c' : '#c8ab68') : (act ? '#f0be64' : '#8c7248'));
  const bg = o.bg ?? (sk === 'lacquer' ? (act ? '#3a1214' : '#1b0b0e') : sk === 'bamboo' ? (act ? '#523d20' : '#382a16') : (act ? '#2c2116' : '#15121b'));
  const hi = o.hi ?? (sk === 'lacquer' ? (act ? '#741e1a' : '#4e1618') : sk === 'bamboo' ? (act ? '#7c5f32' : '#5e4726') : (act ? '#4a3620' : '#252030'));
  const rivetDefault = sk === 'lacquer' ? '#d8342a' : sk === 'bamboo' ? '#c23026' : '#d29e4c';
  // outer silhouette with 1-step notched corners
  g.fillStyle = outer;
  g.fillRect(X + u, Y, W - 2 * u, H);
  g.fillRect(X, Y + u, W, H - 2 * u);
  // metal / gold / bamboo inner rim
  g.fillStyle = inner;
  g.fillRect(X + u * 2, Y + u, W - 4 * u, H - 2 * u);
  g.fillRect(X + u, Y + u * 2, W - 2 * u, H - 4 * u);
  // core body
  g.fillStyle = bg;
  g.fillRect(X + u * 2, Y + u * 2, W - 4 * u, H - 4 * u);
  // Bamboo skin: crisp vertical bamboo-slat seam texture + hemp cord top/bottom binding strips
  if (sk === 'bamboo' && W > u * 10 && H > u * 6) {
    const slatStep = Math.max(u * 6, Math.round(14 * (u / 2)));
    g.fillStyle = act ? '#433118' : '#2c2010';
    for (let sx = X + u * 2 + slatStep; sx < X + W - u * 3; sx += slatStep) {
      g.fillRect(sx, Y + u * 2, u, H - u * 4);
    }
    g.fillStyle = '#24160a';
    g.fillRect(X + u * 2, Y + u * 3, W - 4 * u, u);
    g.fillRect(X + u * 2, Y + H - u * 4, W - 4 * u, u);
  }
  // crisp top highlight band (1 unit)
  if (H > u * 7) {
    g.fillStyle = hi;
    g.fillRect(X + u * 2, Y + u * 2, W - 4 * u, u);
    if (sk === 'lacquer') {
      g.fillStyle = '#a4241c';
      g.fillRect(X + u * 2, Y + H - u * 3, W - 4 * u, u);
    }
  }
  // optional left vertical accent stripe
  if (o.accentBar) {
    g.fillStyle = o.accentBar;
    g.fillRect(X + u * 2, Y + u * 2, u * 2, H - 4 * u);
  }
  // optional 4 corner rivets / lacquer seals
  if (o.rivets && W > u * 12 && H > u * 10) {
    g.fillStyle = sk === 'iron' ? (o.accent ?? rivetDefault) : rivetDefault;
    for (const [rx, ry] of [
      [X + u * 3, Y + u * 3],
      [X + W - u * 4, Y + u * 3],
      [X + u * 3, Y + H - u * 4],
      [X + W - u * 4, Y + H - u * 4],
    ]) g.fillRect(rx, ry, u, u);
  }
}

/** act-176: Universal high-contrast ivory-white + dark-outline 4-corner L-brackets for hover/focus (never collides with green/gold/purple themes!). */
export function drawFocusBrackets(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: number) {
  const X = Math.round(x), Y = Math.round(y), W = Math.round(w), H = Math.round(h);
  const u = Math.max(1, Math.round(p));
  const len = Math.max(u * 4, Math.min(Math.round(Math.min(W, H) * 0.28), u * 7));
  const drawL = (cx: number, cy: number, sx: number, sy: number, pad: number, col: string) => {
    g.fillStyle = col;
    const t = u + pad * 2;
    const L = len + pad * 2;
    const hx = sx > 0 ? cx - pad : cx - L + pad;
    const hy = sy > 0 ? cy - pad : cy - t + pad;
    const vx = sx > 0 ? cx - pad : cx - t + pad;
    const vy = sy > 0 ? cy - pad : cy - L + pad;
    g.fillRect(hx, hy, L, t);
    g.fillRect(vx, vy, t, L);
  };
  const corners: Array<[number, number, number, number]> = [
    [X, Y, 1, 1], [X + W, Y, -1, 1], [X, Y + H, 1, -1], [X + W, Y + H, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) drawL(cx, cy, sx, sy, Math.max(1, Math.round(u * 0.6)), '#08060c');
  for (const [cx, cy, sx, sy] of corners) drawL(cx, cy, sx, sy, 0, '#fffef2');
}

/** Paint either a gamepad button glyph or a crisp keyboard keycap for an action, returning drawn width in device px. */
export function drawActionBadge(g: CanvasRenderingContext2D, kind: 'attack' | 'alt' | 'tab' | 'esc', x: number, cy: number, targetH: number): number {
  const dev = PAD.device;
  if (dev === 'touch') return 0;
  if (dev === 'pad') {
    const idx = kind === 'attack' ? BIND.pad.attack[0] : kind === 'alt' ? 3 : kind === 'tab' ? 4 : 1;
    const gs = Math.max(1, Math.round(targetH / GLYPH_H));
    const aw = glyphArt(idx).w * gs;
    paintGlyph(g, idx, Math.round(x), Math.round(cy - (GLYPH_H * gs) / 2), gs);
    return aw;
  }
  const label = kind === 'attack' ? actKey('attack') : kind === 'alt' ? 'Q' : kind === 'tab' ? 'TAB' : 'ESC';
  const ks = Math.max(1, Math.round(targetH / KEYCAP_H));
  const res = paintKeyCap(g, label, Math.round(x), Math.round(cy - (KEYCAP_H * ks) / 2), ks, kind === 'attack');
  return res.w;
}

export function measureActionBadge(kind: 'attack' | 'alt' | 'tab' | 'esc', targetH: number): number {
  const dev = PAD.device;
  if (dev === 'touch') return 0;
  if (dev === 'pad') {
    const idx = kind === 'attack' ? BIND.pad.attack[0] : kind === 'alt' ? 3 : kind === 'tab' ? 4 : 1;
    const gs = Math.max(1, Math.round(targetH / GLYPH_H));
    return glyphArt(idx).w * gs;
  }
  const label = kind === 'attack' ? actKey('attack') : kind === 'alt' ? 'Q' : kind === 'tab' ? 'TAB' : 'ESC';
  const ks = Math.max(1, Math.round(targetH / KEYCAP_H));
  return keyCapWidth(label) * ks;
}

interface PlateSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  tex: THREE.CanvasTexture | null;
  key: string;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface TagSpec {
  x: number;
  y: number;
  text: string;
  sub?: string;
  color?: string;
  accent?: string;
  icon?: MiniIcon;
  /** Hades-2 door reward mode: large high-contrast framed emblem medallion + crisp two-line reward & utility readout */
  emblem?: boolean;
  price?: number;
  poor?: boolean;
  scale?: number;
  align?: 'center' | 'left';
  minY?: number;
  maxY?: number;
  visible?: boolean;
  order?: number;
}

export interface InteractSpec {
  x: number;
  y: number;
  title: string;
  sub?: string;
  action?: string;
  color?: string;
  accent?: string;
  icon?: MiniIcon;
  price?: number;
  poor?: boolean;
  disabled?: boolean;
  showKey?: boolean;
  minY?: number;
  visible?: boolean;
  order?: number;
}

export interface HeaderSpec {
  x: number;
  y: number;
  title: string;
  sub?: string;
  color?: string;
  accent?: string;
  visible?: boolean;
}

export interface WalletSpec {
  x: number;
  y: number;
  coins?: number;
  iron?: number;
  herb?: number;
  focus?: 'coins' | 'iron' | 'herb';
  visible?: boolean;
}

export interface DetailSpec {
  x: number;
  y: number;
  w: number;
  title: string;
  badge?: string;
  badgeCol?: string;
  stars?: number;
  starsMax?: number;
  line1: string;
  line2?: string;
  action?: string;
  actionHot?: boolean;
  accent?: string;
  visible?: boolean;
}

export interface WorkbenchStatRow {
  label: string;
  before: string;
  after?: string;
  highlight?: boolean;
  icon?: MiniIcon;
}

export interface WorkbenchCost {
  cur: 'iron' | 'herb' | 'coin' | 'grasp';
  amount: number;
  have?: number;
}

export interface WorkbenchSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  theme: 'forge' | 'medic';
  title: string;
  sub?: string;
  lv: number;
  maxLv: number;
  stats: WorkbenchStatRow[];
  note?: string;
  btnLabel: string;
  btnCost?: WorkbenchCost;
  btnEnabled: boolean;
  btnHot?: boolean;
  subBtnLabel?: string;
  subBtnCost?: WorkbenchCost;
  subBtnEnabled?: boolean;
  subBtnHot?: boolean;
  accent?: string;
  visible?: boolean;
}

export interface GraspBarSpec {
  x: number;
  y: number;
  used: number;
  cap: number;
  nextCost: number | null;
  have?: number;
  canExpand: boolean;
  btnHot?: boolean;
  visible?: boolean;
}

export interface OilTrackSpec {
  oil: number;
  milestones: number[];
  x: number;
  y: number;
  btnHot?: boolean;
  visible?: boolean;
}

export interface TabRect { id: string; x: number; y: number; w: number; h: number }

export class UiPlatePool {
  private slots = new Map<string, PlateSlot>();
  constructor(private L: UiLayer) {}

  private slot(key: string, order = 48): PlateSlot {
    let s = this.slots.get(key);
    if (!s) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.renderOrder = order;
      mesh.visible = false;
      this.L.text.scene.add(mesh);
      s = { mesh, mat, tex: null, key: '', w: 1, h: 1, cx: 0, cy: 0 };
      this.slots.set(key, s);
    } else if (s.mesh.renderOrder !== order) {
      s.mesh.renderOrder = order;
    }
    return s;
  }

  private upload(s: PlateSlot, c: HTMLCanvasElement, dpr: number, linear = false) {
    s.tex?.dispose();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.magFilter = tex.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
    s.tex = tex;
    s.mat.map = tex;
    s.mat.needsUpdate = true;
    s.w = c.width / dpr;
    s.h = c.height / dpr;
  }

  private place(s: PlateSlot, cx: number, cy: number, visible: boolean, alpha = 1, clamp = true, minY = 6, maxY?: number) {
    const L = this.L;
    let x = cx, y = cy;
    if (clamp) {
      x = Math.min(L.w - s.w / 2 - 8, Math.max(s.w / 2 + 8, x));
      const lo = Math.max(6, minY) + s.h / 2;
      const hi = (maxY ?? (L.h - 8)) - s.h / 2;
      y = hi >= lo ? Math.min(hi, Math.max(lo, y)) : lo;
    }
    s.cx = x; s.cy = y;
    s.mesh.scale.set(s.w, s.h, 1);
    s.mesh.position.set(Math.round(x), -Math.round(y), 0);
    s.mat.opacity = alpha;
    s.mesh.visible = visible && alpha > 0.01 && !!s.tex;
  }

  /** Compact 1-line world-space pixel plaque (overhead NPC name, shop price tag, exit route board, occluded treasure marker). */
  setTag(key: string, spec: TagSpec) {
    const s = this.slot(key, spec.order ?? 46);
    if (spec.visible === false || !spec.text) { s.mesh.visible = false; return; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = uiScale(this.L.w, this.L.h, 0.82, 2.8) * (spec.scale ?? 1);
    const title = localize(spec.text);
    const sub = spec.sub ? localize(spec.sub) : '';
    const hasPrice = (spec.price ?? 0) > 0;
    const pKey = `tag|${SKIN.id}|${title}|${sub}|${spec.color ?? ''}|${spec.accent ?? ''}|${spec.icon ?? ''}|${spec.emblem ? 1 : 0}|${spec.price ?? 0}|${spec.poor ? 1 : 0}|${kk.toFixed(2)}|${dpr}|${language}|${BODY_FONT.version}`;
    if (pKey !== s.key) {
      s.key = pKey;
      const u = Math.max(1, Math.round(1.5 * kk * dpr));
      const pScale = Math.max(1, Math.floor(((spec.emblem ? 15 : 13) * kk * dpr) / PIX_H));
      const txtH = PIX_H * pScale;
      const subPx = Math.round((spec.emblem ? 12 : 11.5) * kk * dpr);
      const rimCol = spec.poor ? '#9c362c' : (spec.accent ?? '#9a7a4a');
      if (spec.emblem && spec.icon) {
        // Hades-2 door reward plaque: large framed pixel emblem medallion on the left + 2-line reward & currency value on the right!
        const medSz = Math.round(32 * kk * dpr);
        const icoSz = Math.round(medSz * 0.76);
        const padX = Math.round(9 * kk * dpr), padY = Math.round(5 * kk * dpr), gap = Math.round(8 * kk * dpr);
        const tw = pixW(title) * pScale;
        const sw = sub ? Math.ceil(bodyW(sub, subPx)) : 0;
        const textW = Math.max(tw, sw);
        const lineGap = Math.round(3 * kk * dpr);
        const textH = sub ? txtH + lineGap + subPx : txtH;
        const W = padX * 2 + u * 2 + medSz + gap + textW + u * 2;
        const H = Math.max(medSz, textH) + padY * 2 + u * 2;
        const c = makeCanvas(Math.max(8, Math.ceil(W)), Math.max(8, Math.ceil(H))) as HTMLCanvasElement;
        const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
        drawPixelPlaque(g, 0, 0, c.width, c.height, u, {
          inner: rimCol, accentBar: rimCol,
        });
        const midY = c.height / 2;
        const mx = padX + u * 3;
        const my = Math.round(midY - medSz / 2);
        // Dark crisp emblem medallion frame with bright archetype-colored rim
        g.fillStyle = '#08060c'; g.fillRect(mx - u, my - u, medSz + u * 2, medSz + u * 2);
        g.fillStyle = rimCol; g.fillRect(mx, my, medSz, medSz);
        g.fillStyle = '#1b1626'; g.fillRect(mx + u, my + u, medSz - u * 2, medSz - u * 2);
        drawMiniIcon(g, spec.icon, mx + medSz / 2, midY, icoSz);
        const tx = mx + medSz + gap;
        const ty = Math.round(midY - textH / 2);
        drawPix(g, title, tx, ty, { scale: pScale, color: spec.color ?? '#fff4d4', outline: '#08060c', align: 'left' });
        if (sub) {
          bodyText(g, sub, tx, ty + txtH + lineGap - Math.round(1 * dpr), subPx, '#dfd3be', 'left', '#08060c');
        }
        this.upload(s, c, dpr, BODY_FONT.current !== 'pixel' && !!sub);
      } else {
        // act-176: Whisper-light minimal floating world chip (single thin hairline border, translucent ink fill, zero chunky dark slab!)
        const b = Math.max(1, Math.round(dpr));
        const icoSz = spec.icon ? Math.round(txtH * 0.90) : 0;
        const padX = Math.round(6 * kk * dpr), padY = Math.round(3.5 * kk * dpr), gap = Math.round(4.5 * kk * dpr);
        const tw = pixW(title) * pScale;
        const sw = sub ? Math.ceil(bodyW(sub, subPx)) : 0;
        const priceTxt = hasPrice ? `${spec.price}` : '';
        const coinSz = hasPrice ? Math.round(txtH * 0.85) : 0;
        const pw = hasPrice ? coinSz + Math.round(2.5 * kk * dpr) + pixW(priceTxt) * pScale : 0;
        let W = padX * 2 + b * 2 + tw;
        if (icoSz) W += icoSz + gap;
        if (sw) W += gap + Math.round(3 * kk * dpr) + sw;
        if (pw) W += gap + Math.round(3 * kk * dpr) + pw;
        const H = Math.max(txtH, subPx, icoSz) + padY * 2 + b * 2;
        const c = makeCanvas(Math.max(8, Math.ceil(W)), Math.max(8, Math.ceil(H))) as HTMLCanvasElement;
        const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
        // Notched 1px minimal translucent ink pill
        g.fillStyle = 'rgba(11, 9, 17, 0.82)';
        g.fillRect(b, b, c.width - b * 2, c.height - b * 2);
        g.fillStyle = rimCol;
        g.fillRect(b, 0, c.width - b * 2, b);
        g.fillRect(b, c.height - b, c.width - b * 2, b);
        g.fillRect(0, b, b, c.height - b * 2);
        g.fillRect(c.width - b, b, b, c.height - b * 2);
        let cx = padX + b;
        const midY = c.height / 2;
        if (spec.icon) {
          drawMiniIcon(g, spec.icon, cx + icoSz / 2, midY, icoSz);
          cx += icoSz + gap;
        }
        drawPix(g, title, cx, Math.round(midY - txtH / 2), { scale: pScale, color: spec.color ?? '#f4ecd8', outline: '#09070c', align: 'left' });
        cx += tw;
        if (sub) {
          cx += gap;
          g.fillStyle = '#5c5266';
          g.fillRect(Math.round(cx), Math.round(midY - txtH * 0.32), b, Math.round(txtH * 0.64));
          cx += Math.round(4 * kk * dpr);
          bodyText(g, sub, cx, Math.round(midY - subPx * 0.54), subPx, '#d4cab6', 'left', '#09070c');
          cx += sw;
        }
        if (hasPrice) {
          cx += gap;
          g.fillStyle = '#5c5266';
          g.fillRect(Math.round(cx), Math.round(midY - txtH * 0.32), b, Math.round(txtH * 0.64));
          cx += Math.round(4 * kk * dpr);
          drawMiniIcon(g, 'coin', cx + coinSz / 2, midY, coinSz);
          cx += coinSz + Math.round(2.5 * kk * dpr);
          drawPix(g, priceTxt, cx, Math.round(midY - txtH / 2), { scale: pScale, color: spec.poor ? '#ff7c6a' : '#ffd872', outline: '#09070c', align: 'left' });
        }
        this.upload(s, c, dpr, BODY_FONT.current !== 'pixel' && !!sub);
      }
    }
    const placeX = spec.align === 'left' ? spec.x + s.w / 2 : spec.x;
    this.place(s, placeX, spec.y, true, 1, true, spec.minY ?? 8, spec.maxY);
  }

  /** Highlighted interactive plaque for the nearest NPC / shop stall / campfire / garden / monument. */
  setInteract(key: string, spec: InteractSpec) {
    const s = this.slot(key, spec.order ?? 49);
    if (spec.visible === false || !spec.title) { s.mesh.visible = false; return; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = uiScale(this.L.w, this.L.h, 0.84, 2.8);
    const title = localize(spec.title);
    const sub = spec.sub ? localize(spec.sub) : '';
    const action = spec.action ? localize(spec.action) : '';
    const hasPrice = (spec.price ?? 0) > 0;
    const showKey = spec.showKey !== false && !spec.poor && !spec.disabled;
    const pKey = `int|${SKIN.id}|${title}|${sub}|${action}|${spec.color ?? ''}|${spec.accent ?? ''}|${spec.icon ?? ''}|${spec.price ?? 0}|${spec.poor ? 1 : 0}|${spec.disabled ? 1 : 0}|${showKey ? 1 : 0}|${PAD.device}|${PAD.family}|${actKey('attack')}|${kk.toFixed(2)}|${dpr}|${language}|${BODY_FONT.version}`;
    if (pKey !== s.key) {
      s.key = pKey;
      const u = Math.max(1, Math.round(1.6 * kk * dpr));
      const tScale = Math.max(1, Math.floor((15.5 * kk * dpr) / PIX_H));
      const tH = PIX_H * tScale;
      const subPx = Math.round(12.5 * kk * dpr);
      const actScale = Math.max(1, Math.floor((13 * kk * dpr) / PIX_H));
      const actH = PIX_H * actScale;
      const padX = Math.round(10 * kk * dpr), padY = Math.round(6 * kk * dpr), gap = Math.round(6 * kk * dpr);
      const icoSz = spec.icon ? Math.round(tH * 1.0) : 0;
      const tw = pixW(title) * tScale;
      const priceTxt = hasPrice ? `${spec.price}` : '';
      const coinSz = hasPrice ? Math.round(tH * 0.9) : 0;
      const priceW = hasPrice ? coinSz + Math.round(4 * kk * dpr) + pixW(priceTxt) * tScale + Math.round(8 * kk * dpr) : 0;
      const row1W = (icoSz ? icoSz + gap : 0) + tw + priceW;
      const row2W = sub ? Math.ceil(bodyW(sub, subPx)) : 0;
      const badgeH = Math.round(Math.max(actH * 1.15, 16 * kk * dpr));
      const keyW = showKey ? measureActionBadge('attack', badgeH) : 0;
      const actW = action ? (keyW ? keyW + Math.round(5 * kk * dpr) : 0) + pixW(action) * actScale : 0;
      const innerW = Math.max(row1W, row2W, actW, Math.round(108 * kk * dpr));
      const W = innerW + padX * 2 + u * 2;
      let H = padY * 2 + u * 2 + Math.max(tH, icoSz);
      if (sub) H += Math.round(6 * kk * dpr) + Math.ceil(subPx * 1.25);
      if (action) H += Math.round(8 * kk * dpr) + Math.max(actH, badgeH) + Math.round(4 * kk * dpr);
      const c = makeCanvas(Math.ceil(W), Math.ceil(H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      const rim = spec.poor ? '#c44032' : spec.disabled ? '#5c5a64' : (spec.accent ?? '#d8a64e');
      drawPixelPlaque(g, 0, 0, c.width, c.height, u, {
        inner: rim, accent: rim, rivets: true,
      });
      // Row 1: Icon + Title (left) & Price (right)
      let cy = padY + u;
      let cx = padX + u;
      const r1H = Math.max(tH, icoSz);
      if (spec.icon) {
        drawMiniIcon(g, spec.icon, cx + icoSz / 2, cy + r1H / 2, icoSz);
        cx += icoSz + gap;
      }
      drawPix(g, title, cx, Math.round(cy + (r1H - tH) / 2), { scale: tScale, color: spec.disabled ? '#b0a8a0' : (spec.color ?? '#fff2cc'), outline: '#08060c', align: 'left' });
      if (hasPrice) {
        const pxEnd = c.width - padX - u;
        const pTxtW = pixW(priceTxt) * tScale;
        drawPix(g, priceTxt, pxEnd, Math.round(cy + (r1H - tH) / 2), { scale: tScale, color: spec.poor ? '#ff7c6a' : '#ffd872', outline: '#08060c', align: 'right' });
        drawMiniIcon(g, 'coin', pxEnd - pTxtW - Math.round(4 * kk * dpr) - coinSz / 2, cy + r1H / 2, coinSz);
      }
      cy += r1H;
      // Row 2: Description / Effect
      if (sub) {
        cy += Math.round(6 * kk * dpr);
        bodyText(g, sub, padX + u, cy, subPx, spec.poor ? '#ffaba0' : spec.disabled ? '#a49ea8' : '#e6dcc8', 'left', '#08060c');
        cy += Math.ceil(subPx * 1.25);
      }
      // Row 3: Action bar with crisp divider & keycap
      if (action) {
        cy += Math.round(5 * kk * dpr);
        g.fillStyle = '#383044';
        g.fillRect(padX + u, cy, c.width - (padX + u) * 2, Math.max(1, Math.round(kk * dpr)));
        cy += Math.round(5 * kk * dpr);
        const r3H = Math.max(actH, badgeH);
        const r3Mid = cy + r3H / 2;
        let ax = Math.round((c.width - actW) / 2);
        if (showKey && keyW > 0) {
          ax += drawActionBadge(g, 'attack', ax, r3Mid, badgeH) + Math.round(6 * kk * dpr);
        }
        const actCol = spec.poor ? '#ff8272' : spec.disabled ? '#9c96a0' : '#ffe290';
        drawPix(g, action, ax, Math.round(r3Mid - actH / 2), { scale: actScale, color: actCol, outline: '#08060c', align: 'left' });
      }
      this.upload(s, c, dpr, BODY_FONT.current !== 'pixel' && !!sub);
    }
    this.place(s, spec.x, spec.y, true, 1, true, spec.minY ?? 10);
  }

  /** Dark-iron centered header plaque for CardPick3D screens (title + optional subtitle). */
  setHeader(key: string, spec: HeaderSpec) {
    const s = this.slot(key, 52);
    if (spec.visible === false || !spec.title) { s.mesh.visible = false; return; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = uiScale(this.L.w, this.L.h, 0.8, 2.8);
    const title = localize(spec.title);
    const sub = spec.sub ? localize(spec.sub) : '';
    const pKey = `hdr|${SKIN.id}|${title}|${sub}|${spec.color ?? ''}|${spec.accent ?? ''}|${kk.toFixed(2)}|${dpr}|${language}|${BODY_FONT.version}`;
    if (pKey !== s.key) {
      s.key = pKey;
      const u = Math.max(1, Math.round(1.8 * kk * dpr));
      const tScale = Math.max(1, Math.floor((19 * kk * dpr) / PIX_H));
      const tH = PIX_H * tScale;
      const subPx = Math.round(12.5 * kk * dpr);
      const tw = pixW(title) * tScale;
      const sw = sub ? Math.ceil(bodyW(sub, subPx)) : 0;
      const padX = Math.round(18 * kk * dpr), padY = Math.round(6 * kk * dpr);
      const W = Math.max(tw, sw, Math.round(190 * kk * dpr)) + padX * 2 + u * 2;
      const H = padY * 2 + u * 2 + tH + (sub ? Math.round(4 * kk * dpr) + Math.ceil(subPx * 1.25) : 0);
      const c = makeCanvas(Math.ceil(W), Math.ceil(H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      drawPixelPlaque(g, 0, 0, c.width, c.height, u, {
        inner: spec.accent, accent: spec.color ?? '#ffd888', rivets: true,
      });
      const topY = padY + u;
      drawPix(g, title, c.width / 2, topY, { scale: tScale, color: spec.color ?? '#ffe6b0', outline: '#08060c', align: 'center' });
      if (sub) {
        bodyText(g, sub, c.width / 2, topY + tH + Math.round(4 * kk * dpr), subPx, '#d8ceb8', 'center', '#08060c');
      }
      this.upload(s, c, dpr, BODY_FONT.current !== 'pixel' && !!sub);
    }
    this.place(s, spec.x, spec.y, true, 1, true, 6);
  }

  /** Top-right dark-iron currency bar with crisp pixel icons (coins / iron / herb). */
  setWallet(key: string, spec: WalletSpec) {
    const s = this.slot(key, 52);
    if (spec.visible === false) { s.mesh.visible = false; return; }
    const items: Array<{ icon: MiniIcon; label: string; val: number; col: string; hot: boolean }> = [];
    if (spec.coins != null) items.push({ icon: 'coin', label: '铜钱', val: spec.coins, col: '#ffd872', hot: spec.focus === 'coins' });
    if (spec.iron != null) items.push({ icon: 'iron', label: '残铁', val: spec.iron, col: '#f2cc92', hot: spec.focus === 'iron' });
    if (spec.herb != null) items.push({ icon: 'herb', label: '药引', val: spec.herb, col: '#98f4b8', hot: spec.focus === 'herb' });
    if (!items.length) { s.mesh.visible = false; return; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = uiScale(this.L.w, this.L.h, 0.8, 2.8);
    const pKey = `wal|${SKIN.id}|${items.map(i => `${i.icon}:${i.val}:${i.hot ? 1 : 0}`).join(',')}|${kk.toFixed(2)}|${dpr}|${language}`;
    if (pKey !== s.key) {
      s.key = pKey;
      const u = Math.max(1, Math.round(1.6 * kk * dpr));
      const pScale = Math.max(1, Math.floor((14 * kk * dpr) / PIX_H));
      const tH = PIX_H * pScale;
      const icoSz = Math.round(tH * 1.02);
      const padX = Math.round(10 * kk * dpr), padY = Math.round(5 * kk * dpr), segGap = Math.round(14 * kk * dpr), iGap = Math.round(4 * kk * dpr);
      const segs = items.map(it => {
        const txt = `${localize(it.label)} ${it.val}`;
        return { ...it, txt, w: icoSz + iGap + pixW(txt) * pScale };
      });
      const totalW = segs.reduce((a, b, idx) => a + b.w + (idx ? segGap : 0), 0);
      const W = totalW + padX * 2 + u * 2;
      const H = Math.max(tH, icoSz) + padY * 2 + u * 2;
      const c = makeCanvas(Math.ceil(W), Math.ceil(H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      drawPixelPlaque(g, 0, 0, c.width, c.height, u, {
        accent: '#ffd888', rivets: true,
      });
      let cx = padX + u;
      const midY = c.height / 2;
      segs.forEach((sg, idx) => {
        if (idx > 0) {
          g.fillStyle = '#40384e';
          g.fillRect(Math.round(cx - segGap / 2), Math.round(padY + u), Math.max(1, Math.round(kk * dpr)), Math.round(c.height - (padY + u) * 2));
        }
        drawMiniIcon(g, sg.icon, cx + icoSz / 2, midY, icoSz);
        drawPix(g, sg.txt, cx + icoSz + iGap, Math.round(midY - tH / 2), { scale: pScale, color: sg.hot ? '#fff6c8' : sg.col, outline: '#08060c', align: 'left' });
        cx += sg.w + segGap;
      });
      this.upload(s, c, dpr, false);
    }
    // right-aligned anchor at spec.x
    this.place(s, spec.x - s.w / 2, spec.y, true, 1, true, 6);
  }

  /** Interactive horizontal tab bar (e.g. 铁炉强化 | 名刀淬炼). Returns hit rects in CSS px. */
  setTabs(key: string, tabs: Array<{ id: string; label: string; badge?: boolean }>, activeIdx: number, cx: number, cy: number): TabRect[] {
    const s = this.slot(key, 52);
    if (!tabs.length) { s.mesh.visible = false; return []; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = uiScale(this.L.w, this.L.h, 0.8, 2.8);
    const pKey = `tabs|${SKIN.id}|${tabs.map(t => `${t.id}:${localize(t.label)}:${t.badge ? 1 : 0}`).join('|')}|${activeIdx}|${PAD.device}|${kk.toFixed(2)}|${dpr}|${language}`;
    const u = Math.max(1, Math.round(1.8 * kk * dpr));
    const pScale = Math.max(1, Math.floor((14.5 * kk * dpr) / PIX_H));
    const tH = PIX_H * pScale;
    const tabPadX = Math.round(15 * kk * dpr), tabGap = Math.round(9 * kk * dpr), padY = Math.round(5 * kk * dpr);
    const widths = tabs.map(t => Math.max(Math.round(108 * kk * dpr), pixW(localize(t.label)) * pScale + tabPadX * 2 + (t.badge ? Math.round(12 * kk * dpr) : 0)));
    const totalW = widths.reduce((a, b, idx) => a + b + (idx ? tabGap : 0), 0);
    const H = tH + padY * 2 + u * 2;
    if (pKey !== s.key) {
      s.key = pKey;
      const c = makeCanvas(Math.ceil(totalW), Math.ceil(H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      let tx = 0;
      tabs.forEach((tb, i) => {
        const w = widths[i], on = i === activeIdx;
        drawPixelPlaque(g, tx, 0, w, H, u, {
          active: on,
          inner: on ? undefined : (SKIN.id === 'bamboo' ? '#7a633c' : SKIN.id === 'lacquer' ? '#6a4024' : '#585262'),
          accent: on ? '#ffe28a' : '#7a7284',
          rivets: on,
        });
        const lbl = localize(tb.label);
        drawPix(g, lbl, tx + w / 2, Math.round((H - tH) / 2), { scale: pScale, color: on ? '#fff2c4' : '#b8b0a4', outline: '#08060c', align: 'center' });
        if (tb.badge) {
          const bdr = Math.max(1, Math.round(kk * dpr));
          const bx = Math.round(tx + w - u * 4 - 4 * kk * dpr), by = Math.round(u * 3 + 2 * kk * dpr), bs = Math.max(4, Math.round(5 * kk * dpr));
          g.fillStyle = '#08060c'; g.fillRect(bx - bdr, by - bdr, bs + 2 * bdr, bs + 2 * bdr);
          g.fillStyle = '#ffd258'; g.fillRect(bx, by, bs, bs);
        }
        tx += w + tabGap;
      });
      this.upload(s, c, dpr, false);
    }
    this.place(s, cx, cy, true, 1, true, 6);
    const left0 = s.cx - s.w / 2;
    const rects: TabRect[] = [];
    let rx = 0;
    tabs.forEach((tb, i) => {
      const wCss = widths[i] / dpr;
      rects.push({ id: tb.id, x: left0 + rx, y: s.cy - s.h / 2, w: wCss, h: s.h });
      rx += wCss + tabGap / dpr;
    });
    return rects;
  }

  /** Large bottom iron-bronze detail plaque (used for the 4x2 Keepsake showcase). */
  setDetail(key: string, spec: DetailSpec): { x: number; y: number; w: number; h: number } | null {
    const s = this.slot(key, 51);
    if (spec.visible === false || !spec.title) { s.mesh.visible = false; return null; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = uiScale(this.L.w, this.L.h, 0.8, 2.8);
    const title = localize(spec.title);
    const badge = spec.badge ? localize(spec.badge) : '';
    const l1 = localize(spec.line1);
    const l2 = spec.line2 ? localize(spec.line2) : '';
    const act = spec.action ? localize(spec.action) : '';
    const pKey = `det|${SKIN.id}|${Math.round(spec.w)}|${title}|${badge}|${spec.badgeCol ?? ''}|${spec.stars ?? 0}/${spec.starsMax ?? 0}|${l1}|${l2}|${act}|${spec.actionHot ? 1 : 0}|${spec.accent ?? ''}|${kk.toFixed(2)}|${dpr}|${language}|${BODY_FONT.version}`;
    if (pKey !== s.key) {
      s.key = pKey;
      const u = Math.max(1, Math.round(1.8 * kk * dpr));
      const W = Math.round(spec.w * dpr);
      const tScale = Math.max(1, Math.floor((17 * kk * dpr) / PIX_H));
      const tH = PIX_H * tScale;
      const bScale = Math.max(1, Math.floor((12.5 * kk * dpr) / PIX_H));
      const bH = PIX_H * bScale;
      const f1 = Math.round(14.5 * kk * dpr), f2 = Math.round(13 * kk * dpr);
      const padX = Math.round(16 * kk * dpr), padY = Math.round(9 * kk * dpr);
      const compactAct = !l2 && !!act;
      const H = padY * 2 + u * 2 + tH + Math.round(8 * kk * dpr) + Math.ceil(f1 * 1.35) + (l2 ? Math.round(4 * kk * dpr) + Math.ceil(f2 * 1.3) : 0);
      const c = makeCanvas(Math.max(16, W), Math.max(16, H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      drawPixelPlaque(g, 0, 0, c.width, c.height, u, {
        inner: spec.accent ?? undefined, accent: spec.accent ?? undefined, rivets: true,
      });
      const x0 = padX + u;
      let y = padY + u;
      const actScale = Math.max(1, Math.floor((13.5 * kk * dpr) / PIX_H));
      const actW = act ? pixW(act) * actScale + Math.round(20 * kk * dpr) : 0;
      const actH = act ? PIX_H * actScale + Math.round(10 * kk * dpr) : 0;
      // Row 1: Title + Badge + Stars on right
      drawPix(g, title, x0, y, { scale: tScale, color: '#fff2cc', outline: '#08060c', align: 'left' });
      let tx = x0 + pixW(title) * tScale + Math.round(12 * kk * dpr);
      if (badge) {
        const bdr = Math.max(1, Math.round(kk * dpr));
        const bw = pixW(badge) * bScale + Math.round(12 * kk * dpr), bh = bH + Math.round(6 * kk * dpr);
        const by = Math.round(y + (tH - bh) / 2);
        const bc = spec.badgeCol ?? '#ffd878';
        g.fillStyle = bc; g.fillRect(tx, by, bw, bh);
        g.fillStyle = '#120e16'; g.fillRect(tx + bdr, by + bdr, bw - 2 * bdr, bh - 2 * bdr);
        drawPix(g, badge, tx + Math.round(6 * kk * dpr), by + Math.round(3 * kk * dpr), { scale: bScale, color: bc, outline: null, align: 'left' });
        tx += bw + Math.round(10 * kk * dpr);
      }
      if ((spec.starsMax ?? 0) > 0) {
        const stSz = Math.round(tH * 0.9), stGap = Math.round(4 * kk * dpr);
        let sx = c.width - padX - u - stSz / 2;
        for (let i = (spec.starsMax ?? 3) - 1; i >= 0; i--) {
          drawMiniIcon(g, i < (spec.stars ?? 0) ? 'star' : 'starOff', sx, y + tH / 2, stSz);
          sx -= stSz + stGap;
        }
      }
      // Row 2: Main Effect (compact single-line mode reserves space for right-centered action button & skips noisy inline icons)
      y += tH + Math.round(8 * kk * dpr);
      const maxTextW = c.width - (padX + u) * 2 - (compactAct ? actW + Math.round(16 * kk * dpr) : 0);
      let p1 = f1;
      if (compactAct) {
        while (p1 > Math.round(11 * kk * dpr) && bodyW(l1, p1) > maxTextW) p1 -= 1;
        bodyText(g, l1, x0, y, p1, '#efe5d0', 'left', '#08060c');
      } else {
        while (p1 > Math.round(11 * kk * dpr) && richLine(null, l1, 0, 0, p1, '#f4ebd8', '#fff6cc', true, true) > maxTextW) p1 -= 1;
        richLine(g, l1, x0, y, p1, '#f4ebd8', '#fff6cc', true, true);
      }
      // Row 3 (when l2 present) & Action stamp (vertically centered on right when compactAct)
      if (l2) {
        y += Math.ceil(f1 * 1.35) + Math.round(4 * kk * dpr);
        let p2 = f2;
        const actReserve = act ? Math.round(145 * kk * dpr) : 0;
        while (p2 > Math.round(10 * kk * dpr) && richLine(null, l2, 0, 0, p2, '#bcb4a4', '#ffe8a8', true, true) > maxTextW - actReserve) p2 -= 1;
        richLine(g, l2, x0, y, p2, '#bcb4a4', '#ffe8a8', true, true);
      }
      if (act) {
        const ax = c.width - padX - u - actW;
        const ay = compactAct ? Math.round((c.height - actH) / 2) : Math.round(y - Math.round(2 * kk * dpr));
        const hot = !!spec.actionHot;
        drawPixelPlaque(g, ax, ay, actW, actH, Math.max(1, Math.round(1.5 * kk * dpr)), {
          bg: hot ? '#4c2c12' : '#2e1d10', hi: hot ? '#72441c' : '#4a301a', border: '#08060c',
          inner: hot ? '#fffef2' : (spec.accent ?? '#d4a24e'),
          rivets: compactAct,
        });
        drawPix(g, act, ax + actW / 2, Math.round(ay + (actH - PIX_H * actScale) / 2), { scale: actScale, color: hot ? '#fffef2' : '#ffe69c', outline: '#08060c', align: 'center' });
        if (hot) drawFocusBrackets(g, ax, ay, actW, actH, Math.max(1, Math.round(1.5 * kk * dpr)));
      }
      this.upload(s, c, dpr, BODY_FONT.current !== 'pixel');
    }
    this.place(s, spec.x, spec.y, true, 1, true, 6);
    if (!act) return null;
    const bwCss = Math.max(106 * kk, (pixW(act) * Math.max(1, Math.floor((13.5 * kk * dpr) / PIX_H)) / dpr) + 22 * kk);
    const bhCss = 34 * kk;
    return {
      x: s.cx + s.w / 2 - 18 * kk - bwCss,
      y: !l2 ? s.cy - bhCss / 2 : s.cy + s.h / 2 - 10 * kk - bhCss,
      w: bwCss,
      h: bhCss,
    };
  }

  /** act-149: Right-side 3D Artifact Workbench panel (锻坊 / 孙媪悟性牌阵) — upper transparent showcase bay, middle Before ▶ After stats, bottom 1 or 2 clickable action buttons */
  setWorkbench(key: string, spec: WorkbenchSpec): {
    btnRect: { x: number; y: number; w: number; h: number } | null;
    subBtnRect: { x: number; y: number; w: number; h: number } | null;
    showcase: { x: number; y: number; w: number; h: number };
  } {
    const s = this.slot(key, 48);
    if (spec.visible === false || !spec.title) {
      s.mesh.visible = false;
      return { btnRect: null, subBtnRect: null, showcase: { x: spec.x, y: spec.y, w: 120, h: 80 } };
    }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = uiScale(this.L.w, this.L.h, 0.8, 2.8);
    const title = localize(spec.title);
    const sub = spec.sub ? localize(spec.sub) : '';
    const note = spec.note ? localize(spec.note) : '';
    const btnLbl = localize(spec.btnLabel);
    const subBtnLbl = spec.subBtnLabel ? localize(spec.subBtnLabel) : '';
    const statSig = spec.stats.map(r => `${r.icon ?? ''}:${localize(r.label)}:${localize(r.before)}>${r.after ? localize(r.after) : ''}:${r.highlight ? 1 : 0}`).join('|');
    const costSig = spec.btnCost ? `${spec.btnCost.cur}:${spec.btnCost.have ?? ''}/${spec.btnCost.amount}` : '';
    const subCostSig = spec.subBtnCost ? `${spec.subBtnCost.cur}:${spec.subBtnCost.have ?? ''}/${spec.subBtnCost.amount}` : '';
    const pKey = `wb|${Math.round(spec.w)}x${Math.round(spec.h)}|${spec.theme}|${title}|${sub}|${spec.lv}/${spec.maxLv}|${statSig}|${note}|${btnLbl}|${costSig}|${spec.btnEnabled ? 1 : 0}|${spec.btnHot ? 1 : 0}|${subBtnLbl}|${subCostSig}|${spec.subBtnEnabled ? 1 : 0}|${spec.subBtnHot ? 1 : 0}|${spec.accent ?? ''}|${kk.toFixed(2)}|${dpr}|${language}|${BODY_FONT.version}`;
    const u = Math.max(1, Math.round(2 * kk * dpr));
    const W = Math.max(40, Math.round(spec.w * dpr));
    const H = Math.max(80, Math.round(spec.h * dpr));
    const padX = Math.round(18 * kk * dpr), padY = Math.round(12 * kk * dpr);
    const boxX = padX + u, boxW = W - (padX + u) * 2;
    const bayH = Math.round(H * (spec.h < 310 ? 0.28 : 0.33));
    const bayY = padY + u;
    const btnH = Math.round(Math.max(34 * kk * dpr, H * 0.115));
    const btnY = H - padY - u - btnH;
    const hasSubBtn = !!subBtnLbl;
    const btnGap = Math.round(10 * kk * dpr);
    const btn1W = hasSubBtn ? Math.round((boxW - btnGap) * 0.50) : boxW;
    const btn2X = boxX + btn1W + btnGap;
    const btn2W = boxW - btn1W - btnGap;
    if (pKey !== s.key) {
      s.key = pKey;
      const c = makeCanvas(W, H) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      const isMedic = spec.theme === 'medic';
      const innerCol = spec.accent ?? (isMedic ? '#58b47c' : '#c89248');
      drawPixelPlaque(g, 0, 0, W, H, u, {
        bg: isMedic ? '#121e18' : '#181414',
        hi: isMedic ? '#1f3429' : '#2e2420',
        border: '#07050a',
        inner: innerCol,
        accent: isMedic ? '#8ef0b4' : '#ffd878',
        rivets: true,
      });
      // 1. Upper framed transparent viewport window (so the live 3D hearth & spinning blade/anvil/herb in L.scene shine right through!)
      const bdr = Math.max(1, Math.round(1.5 * kk * dpr));
      g.fillStyle = isMedic ? '#2c5a40' : '#5e4228';
      g.fillRect(boxX, bayY, boxW, bayH);
      g.clearRect(boxX + bdr, bayY + bdr, boxW - 2 * bdr, bayH - 2 * bdr);
      // subtle forged corner brackets inside showcase viewport
      const cr = Math.round(10 * kk * dpr);
      g.fillStyle = isMedic ? '#6ad494' : '#dca450';
      for (const [cx, cy, sx, sy] of [
        [boxX + bdr * 2, bayY + bdr * 2, 1, 1],
        [boxX + boxW - bdr * 2, bayY + bdr * 2, -1, 1],
        [boxX + bdr * 2, bayY + bayH - bdr * 2, 1, -1],
        [boxX + boxW - bdr * 2, bayY + bayH - bdr * 2, -1, -1],
      ]) {
        g.fillRect(sx > 0 ? cx : cx - cr, cy, cr, bdr);
        g.fillRect(cx - (sx < 0 ? bdr : 0), sy > 0 ? cy : cy - cr, bdr, cr);
      }

      // 2. Title + Level Pips directly below showcase bay
      let curY = bayY + bayH + Math.round(10 * kk * dpr);
      let tScale = Math.max(1, Math.floor((17.5 * kk * dpr) / PIX_H));
      const pipSz = Math.round(9 * kk * dpr), pipGap = Math.round(4 * kk * dpr);
      const pipsW = spec.maxLv > 0 ? spec.maxLv * pipSz + (spec.maxLv - 1) * pipGap : 0;
      while (tScale > 1 && pixW(title) * tScale + pipsW + Math.round(16 * kk * dpr) > boxW) tScale--;
      const tH = PIX_H * tScale;
      drawPix(g, title, boxX, curY, { scale: tScale, color: '#fff2cc', outline: '#08060c', align: 'left' });
      if (spec.maxLv > 0) {
        let px = boxX + boxW - pipSz;
        const py = Math.round(curY + (tH - pipSz) / 2);
        for (let i = spec.maxLv - 1; i >= 0; i--) {
          g.fillStyle = '#08060c'; g.fillRect(px - bdr, py - bdr, pipSz + 2 * bdr, pipSz + 2 * bdr);
          g.fillStyle = i < spec.lv ? (isMedic ? '#7cf0a8' : '#ffd260') : '#34303a';
          g.fillRect(px, py, pipSz, pipSz);
          px -= pipSz + pipGap;
        }
      }
      curY += tH + Math.round(5 * kk * dpr);
      if (sub) {
        let spx = Math.round(13 * kk * dpr);
        while (spx > Math.round(10 * kk * dpr) && richLine(null, sub, 0, 0, spx, '#d6ccb8', '#ffe8a8', true, true) > boxW) spx -= 1;
        richLine(g, sub, boxX, curY, spx, '#d6ccb8', '#ffe8a8', true, true);
        curY += Math.ceil(spx * 1.32) + Math.round(5 * kk * dpr);
      } else {
        curY += Math.round(4 * kk * dpr);
      }

      // Horizontal divider
      g.fillStyle = isMedic ? '#2c4c3a' : '#4a382c';
      g.fillRect(boxX, curY, boxW, Math.max(1, Math.round(kk * dpr)));
      curY += Math.round(8 * kk * dpr);

      // 3. Before ▶ After Stat Comparison Bars (with leading pixel icons + crisp balanced numbers!)
      const rowH = Math.round(26 * kk * dpr);
      const lblPx = Math.round(13.5 * kk * dpr);
      const valPx = Math.round(15 * kk * dpr);
      const inferIcon = (lbl: string): MiniIcon => {
        if (/血|命|愈|药|伤恢复/.test(lbl)) return 'hp';
        if (/盾|减伤|霸体|韧/.test(lbl)) return 'shield';
        if (/破势|听势|弹反/.test(lbl)) return 'parry';
        if (/绝技|不见刀|杀气/.test(lbl)) return 'ult';
        if (/闪避|冲刺|移速|攻速|冷却/.test(lbl)) return 'dash';
        if (/暴击|一闪/.test(lbl)) return 'crit';
        if (/铜钱|财/.test(lbl)) return 'coin';
        if (/雷/.test(lbl)) return 'bolt';
        if (/寒|霜/.test(lbl)) return 'frost';
        if (/镖|针/.test(lbl)) return 'dart';
        if (/悟性/.test(lbl)) return 'grasp';
        return 'atk';
      };
      for (const r of spec.stats.slice(0, 2)) {
        if (curY + rowH > btnY - Math.round(8 * kk * dpr)) break;
        // recessed stat row background
        g.fillStyle = isMedic ? '#0d1812' : '#120e0e';
        g.fillRect(boxX, curY, boxW, rowH);
        const mid = Math.round(curY + rowH / 2);
        const lTxt = localize(r.label);
        const bTxt = localize(r.before);
        const aTxt = r.after ? localize(r.after) : '';
        const stIcoSz = Math.round(lblPx * 1.05);
        const icoX = boxX + Math.round(8 * kk * dpr);
        drawMiniIcon(g, r.icon ?? inferIcon(r.label), icoX + stIcoSz / 2, mid, stIcoSz);
        const lblX = icoX + stIcoSz + Math.round(6 * kk * dpr);
        bodyText(g, lTxt, lblX, Math.round(mid - lblPx * 0.56), lblPx, '#e2d8c4', 'left', '#08060c');
        const rightEnd = boxX + boxW - Math.round(10 * kk * dpr);
        const lW = (lblX - boxX) + bodyW(lTxt, lblPx) + Math.round(18 * kk * dpr);
        if (aTxt) {
          let vp = valPx;
          const arrowStr = ' ▶ ';
          while (vp > Math.round(11 * kk * dpr) && bodyW(bTxt + arrowStr + aTxt, vp) > boxW - lW) vp -= 1;
          const aW = bodyW(aTxt, vp);
          const arW = bodyW(arrowStr, vp);
          bodyText(g, aTxt, rightEnd, Math.round(mid - vp * 0.56), vp, r.highlight ? '#8effb0' : '#ffe27a', 'right', '#08060c');
          bodyText(g, arrowStr, rightEnd - aW, Math.round(mid - vp * 0.56), vp, '#9a8e7a', 'right', '#08060c');
          bodyText(g, bTxt, rightEnd - aW - arW, Math.round(mid - vp * 0.56), vp, '#e6dcc8', 'right', '#08060c');
        } else {
          let vp = valPx;
          while (vp > Math.round(11 * kk * dpr) && bodyW(bTxt, vp) > boxW - lW) vp -= 1;
          bodyText(g, bTxt, rightEnd, Math.round(mid - vp * 0.56), vp, r.highlight ? '#ffe27a' : '#f0e6d2', 'right', '#08060c');
        }
        curY += rowH + Math.round(6 * kk * dpr);
      }

      // Optional single crisp effect note with inline pixel icons (e.g. next forge tier perk or Arcana bonus)
      if (note && curY + Math.round(18 * kk * dpr) < btnY) {
        let npx = Math.round(13.5 * kk * dpr);
        const nCol = isMedic ? '#c8f6d8' : '#f2deb6';
        while (npx > Math.round(10.5 * kk * dpr) && richLine(null, note, 0, 0, npx, nCol, '#fff4b4', true, true) > boxW) npx -= 1;
        richLine(g, note, boxX, curY + Math.round(2 * kk * dpr), npx, nCol, '#fff4b4', true, true);
      }

      // 4. Bottom large tactile Action Button(s) — universal ivory-white corner focus brackets on hover!
      const paintActionBtn = (bx0: number, bw0: number, lbl: string, cost: WorkbenchCost | undefined, enabled: boolean, hot: boolean, warmGold = false) => {
        drawPixelPlaque(g, bx0, btnY, bw0, btnH, Math.max(1, Math.round(1.6 * kk * dpr)), {
          bg: !enabled ? '#1c191e' : hot ? (warmGold ? '#4a3214' : isMedic ? '#1d4d32' : '#4a2e14') : (warmGold ? '#342412' : isMedic ? '#163a26' : '#362212'),
          hi: !enabled ? '#2a2630' : hot ? (warmGold ? '#6c481e' : isMedic ? '#327850' : '#6c4420') : (warmGold ? '#4c341a' : isMedic ? '#24583c' : '#52341b'),
          border: '#07050a',
          inner: !enabled ? '#5a525c' : hot ? '#fffef2' : (warmGold ? '#ecc060' : isMedic ? '#78e8a2' : '#f0be60'),
          rivets: enabled,
        });
        let bScale = Math.max(1, Math.round((15.5 * kk * dpr) / PIX_H));
        const hasCost = !!cost;
        const gapB = Math.round(6 * kk * dpr);
        const totalBtnW = () => pixW(lbl) * bScale + (hasCost && cost ? gapB + drawCostChip(null, cost.cur, cost.amount, cost.have, 0, 0, bScale, dpr) : 0);
        while (bScale > 1 && totalBtnW() > bw0 - Math.round(14 * kk * dpr)) bScale--;
        const bH = PIX_H * bScale;
        const bMid = Math.round(btnY + btnH / 2);
        let bx = Math.round(bx0 + (bw0 - totalBtnW()) / 2);
        const txtCol = !enabled ? '#b0a6a4' : hot ? '#fffef4' : '#ffe8a8';
        drawPix(g, lbl, bx, Math.round(bMid - bH / 2), { scale: bScale, color: txtCol, outline: '#08060c', align: 'left' });
        if (hasCost && cost) {
          bx += pixW(lbl) * bScale + gapB;
          drawCostChip(g, cost.cur, cost.amount, cost.have, bx, bMid, bScale, dpr);
        }
        if (hot) drawFocusBrackets(g, bx0, btnY, bw0, btnH, Math.max(1, Math.round(1.6 * kk * dpr)));
      };
      paintActionBtn(boxX, btn1W, btnLbl, spec.btnCost, spec.btnEnabled, spec.btnEnabled && !!spec.btnHot, false);
      if (hasSubBtn) {
        paintActionBtn(btn2X, btn2W, subBtnLbl, spec.subBtnCost, !!spec.subBtnEnabled, !!spec.subBtnEnabled && !!spec.subBtnHot, true);
      }
      this.upload(s, c, dpr, BODY_FONT.current !== 'pixel');
    }
    this.place(s, spec.x, spec.y, true, 1, false);
    const left0 = s.cx - s.w / 2, top0 = s.cy - s.h / 2;
    return {
      btnRect: { x: left0 + boxX / dpr, y: top0 + btnY / dpr, w: btn1W / dpr, h: btnH / dpr },
      subBtnRect: hasSubBtn ? { x: left0 + btn2X / dpr, y: top0 + btnY / dpr, w: btn2W / dpr, h: btnH / dpr } : null,
      showcase: { x: s.cx, y: top0 + (bayY + bayH / 2) / dpr, w: boxW / dpr, h: bayH / dpr },
    };
  }

  /** act-149: Hades 2-style top 悟性上限 (Grasp) bar with glowing jade pips + clickable 「拓悟性 +2」 button */
  setGraspBar(key: string, spec: GraspBarSpec): { btnRect: { x: number; y: number; w: number; h: number } | null } {
    const s = this.slot(key, 52);
    if (spec.visible === false) { s.mesh.visible = false; return { btnRect: null }; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = uiScale(this.L.w, this.L.h, 0.8, 2.8);
    const lbl = localize('悟性');
    const expTxt = spec.nextCost == null ? localize('悟性圆满') : localize('拓悟性 +2');
    const pKey = `grp|${spec.used}/${spec.cap}|${spec.nextCost ?? -1}|${spec.have ?? -1}|${spec.canExpand ? 1 : 0}|${spec.btnHot ? 1 : 0}|${kk.toFixed(2)}|${dpr}|${language}`;
    const u = Math.max(1, Math.round(1.6 * kk * dpr));
    const pScale = Math.max(1, Math.floor((13.5 * kk * dpr) / PIX_H));
    const tH = PIX_H * pScale;
    const grpIcoSz = Math.round(tH * 1.08);
    const pipSz = Math.round(9 * kk * dpr), pipGap = Math.round(3.5 * kk * dpr);
    const maxPips = Math.min(18, spec.cap);
    const pipsW = maxPips * pipSz + Math.max(0, maxPips - 1) * pipGap;
    const numTxt = `${spec.used}/${spec.cap}`;
    const padX = Math.round(14 * kk * dpr), padY = Math.round(7 * kk * dpr), gap = Math.round(9 * kk * dpr);
    const costChipW = spec.nextCost != null ? drawCostChip(null, 'herb', spec.nextCost, spec.have, 0, 0, pScale, dpr) : 0;
    const expInnerW = pixW(expTxt) * pScale + (spec.nextCost != null ? Math.round(7 * kk * dpr) + costChipW : 0);
    const expBtnW = expInnerW + Math.round(20 * kk * dpr);
    const expBtnH = tH + Math.round(10 * kk * dpr);
    const leftW = grpIcoSz + Math.round(5 * kk * dpr) + pixW(lbl) * pScale + gap + pixW(numTxt) * pScale + gap + pipsW;
    const W = padX * 2 + u * 2 + leftW + Math.round(18 * kk * dpr) + expBtnW;
    const H = Math.max(tH, expBtnH) + padY * 2 + u * 2;
    const btnX = W - padX - u - expBtnW;
    const btnY = Math.round((H - expBtnH) / 2);
    if (pKey !== s.key) {
      s.key = pKey;
      const c = makeCanvas(Math.ceil(W), Math.ceil(H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      drawPixelPlaque(g, 0, 0, c.width, c.height, u, {
        bg: '#101d17', hi: '#1e362a', border: '#07050a', inner: '#56b47e', accent: '#98f6ba', rivets: true,
      });
      const midY = c.height / 2;
      let cx = padX + u;
      drawMiniIcon(g, 'grasp', cx + grpIcoSz / 2, midY, grpIcoSz);
      cx += grpIcoSz + Math.round(5 * kk * dpr);
      drawPix(g, lbl, cx, Math.round(midY - tH / 2), { scale: pScale, color: '#9cf4bc', outline: '#08060c', align: 'left' });
      cx += pixW(lbl) * pScale + gap;
      drawPix(g, numTxt, cx, Math.round(midY - tH / 2), { scale: pScale, color: '#fff2c4', outline: '#08060c', align: 'left' });
      cx += pixW(numTxt) * pScale + gap;
      const bdr = Math.max(1, Math.round(kk * dpr));
      for (let i = 0; i < maxPips; i++) {
        const lit = i < spec.used;
        const py = Math.round(midY - pipSz / 2);
        g.fillStyle = '#080b0a'; g.fillRect(cx - bdr, py - bdr, pipSz + 2 * bdr, pipSz + 2 * bdr);
        g.fillStyle = lit ? '#84f6b0' : '#263830';
        g.fillRect(cx, py, pipSz, pipSz);
        if (lit) { g.fillStyle = '#e8fff0'; g.fillRect(cx + bdr, py + bdr, Math.max(1, Math.round(pipSz * 0.35)), Math.max(1, Math.round(pipSz * 0.35))); }
        cx += pipSz + pipGap;
      }
      // Clickable 「拓悟性 +2」 button on the right with `[herb] have/need` chip
      const can = spec.nextCost != null && spec.canExpand;
      const hot = can && !!spec.btnHot;
      drawPixelPlaque(g, btnX, btnY, expBtnW, expBtnH, Math.max(1, Math.round(1.4 * kk * dpr)), {
        bg: !can ? '#1a1e1c' : hot ? '#26583c' : '#183e28',
        hi: !can ? '#262c29' : hot ? '#3a7e56' : '#265c3c',
        border: '#07050a',
        inner: !can ? '#4c5852' : hot ? '#fffef2' : '#80ecaa',
      });
      let ex = Math.round(btnX + (expBtnW - expInnerW) / 2);
      drawPix(g, expTxt, ex, Math.round(midY - tH / 2), { scale: pScale, color: !can ? '#b2bab4' : hot ? '#fffef4' : '#d6ffe6', outline: '#08060c', align: 'left' });
      if (spec.nextCost != null) {
        ex += pixW(expTxt) * pScale + Math.round(7 * kk * dpr);
        drawCostChip(g, 'herb', spec.nextCost, spec.have, ex, midY, pScale, dpr);
      }
      if (hot) drawFocusBrackets(g, btnX, btnY, expBtnW, expBtnH, Math.max(1, Math.round(1.4 * kk * dpr)));
      this.upload(s, c, dpr, false);
    }
    this.place(s, spec.x, spec.y, true, 1, true, 6);
    if (spec.nextCost == null) return { btnRect: null };
    const left0 = s.cx - s.w / 2, top0 = s.cy - s.h / 2;
    return { btnRect: { x: left0 + btnX / dpr, y: top0 + btnY / dpr, w: expBtnW / dpr, h: expBtnH / dpr } };
  }

  getRect(key: string): { x: number; y: number; w: number; h: number } | null {
    const s = this.slots.get(key);
    if (!s || !s.mesh.visible) return null;
    return { x: s.cx - s.w / 2, y: s.cy - s.h / 2, w: s.w, h: s.h };
  }

  /** Compact dark-iron footer bar for navigation hints. */
  setFooter(key: string, text: string, cx: number, cy: number, visible = true) {
    const s = this.slot(key, 52);
    if (!visible || !text) { s.mesh.visible = false; return; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = uiScale(this.L.w, this.L.h, 0.8, 2.8);
    const txt = localize(text);
    const pKey = `ftr|${SKIN.id}|${txt}|${kk.toFixed(2)}|${dpr}|${language}|${BODY_FONT.version}`;
    if (pKey !== s.key) {
      s.key = pKey;
      const u = Math.max(1, Math.round(1.4 * kk * dpr));
      const fpx = Math.round(12 * kk * dpr);
      const tw = Math.ceil(bodyW(txt, fpx));
      const padX = Math.round(12 * kk * dpr), padY = Math.round(4 * kk * dpr);
      const W = tw + padX * 2 + u * 2;
      const H = Math.ceil(fpx * 1.3) + padY * 2 + u * 2;
      const c = makeCanvas(Math.max(8, W), Math.max(8, H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      drawPixelPlaque(g, 0, 0, c.width, c.height, u, {});
      bodyText(g, txt, c.width / 2, Math.round((c.height - fpx * 1.15) / 2), fpx, '#ded4c0', 'center', '#08060c');
      this.upload(s, c, dpr, BODY_FONT.current !== 'pixel');
    }
    this.place(s, cx, cy, true, 1, true, 6);
  }

  /** act-176: Universal zero-collision Focus Reticle — crisp ivory-white + dark-outline 4-corner L-brackets + top golden pointer chevron. */
  setFocusFrame(key: string, cx: number, cy: number, w: number, h: number, visible = true, breathe = 0) {
    const s = this.slot(key, 54);
    if (!visible || w < 16 || h < 16) { s.mesh.visible = false; return; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = uiScale(this.L.w, this.L.h, 0.8, 2.8);
    const pad = Math.round((8 + breathe) * kk);
    const Wcss = Math.round(w + pad * 2);
    const Hcss = Math.round(h + pad * 2 + 8 * kk);
    const pKey = `foc|${Wcss}x${Hcss}|${kk.toFixed(2)}|${dpr}`;
    if (pKey !== s.key) {
      s.key = pKey;
      const W = Math.max(24, Math.round(Wcss * dpr));
      const H = Math.max(24, Math.round(Hcss * dpr));
      const c = makeCanvas(W, H) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      const u = Math.max(2, Math.round(2.6 * kk * dpr));
      const topExtra = Math.round(8 * kk * dpr);
      const bx = Math.round(3 * kk * dpr);
      const by = topExtra + Math.round(2 * kk * dpr);
      const bw = W - bx * 2;
      const bh = H - by - Math.round(3 * kk * dpr);
      // 4 crisp high-contrast ivory-white L-brackets with solid dark shadow outline
      drawFocusBrackets(g, bx, by, bw, bh, u);
      // Subtle 1px pure white hairline connecting corners so focus bounds read instantly on any card shape
      const b = Math.max(1, Math.round(dpr));
      g.fillStyle = 'rgba(255, 254, 242, 0.32)';
      g.fillRect(bx + u * 2, by, bw - u * 4, b);
      g.fillRect(bx + u * 2, by + bh - b, bw - u * 4, b);
      g.fillRect(bx, by + u * 2, b, bh - u * 4);
      g.fillRect(bx + bw - b, by + u * 2, b, bh - u * 4);
      // Top-center warm-gold + ivory downward pointer chevron ▼
      const mx = Math.round(W / 2);
      const py = Math.max(b, by - u * 2 - b);
      const tri = (oy: number, half: number, col: string) => { g.fillStyle = col; g.fillRect(mx - half, oy, half * 2, u); };
      tri(py - b, u * 3 + b, '#08060c');
      tri(py + u - b, u * 2 + b, '#08060c');
      tri(py + u * 2 - b, u + b, '#08060c');
      tri(py, u * 3, '#fffef2');
      tri(py + u, u * 2, '#ffe074');
      tri(py + u * 2, u, '#ffd048');
      this.upload(s, c, dpr, false);
    }
    this.place(s, cx, cy - 4 * kk, true, 1, false);
  }

  /** act-185: Bespoke 古窑长明灯 5-Lamp Oil Progress Track + standalone [+ 添油] button (replaces wall-of-text milestone cards). */
  setOilTrack(key: string, spec: OilTrackSpec): { btnRect: { x: number; y: number; w: number; h: number } | null } {
    const s = this.slot(key, 52);
    if (spec.visible === false) { s.mesh.visible = false; return { btnRect: null }; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = uiScale(this.L.w, this.L.h, 0.78, 2.8);
    const maxAt = spec.milestones[spec.milestones.length - 1] ?? 20;
    const maxed = spec.oil >= maxAt;
    const btnTxt = maxed ? localize('已圆满') : localize('+ 添油');
    const pKey = `oil|${spec.oil}|${spec.milestones.join(',')}|${spec.btnHot ? 1 : 0}|${kk.toFixed(2)}|${dpr}|${language}`;
    const u = Math.max(1, Math.round(1.6 * kk * dpr));
    const pScale = Math.max(1, Math.floor((12.5 * kk * dpr) / PIX_H));
    const nScale = Math.max(1, Math.floor((11 * kk * dpr) / PIX_H));
    const tH = PIX_H * pScale;
    const fireSz = Math.round(tH * 1.05);
    const numTxt = `${Math.min(spec.oil, maxAt)}/${maxAt}`;
    const padX = Math.round(14 * kk * dpr);
    const padY = Math.round(6 * kk * dpr);
    const leftW = fireSz + Math.round(5 * kk * dpr) + pixW(numTxt) * pScale;
    const nodeGap = Math.round((this.L.w < 960 ? 34 : 52) * kk * dpr);
    const nodeSpan = Math.max(1, spec.milestones.length - 1) * nodeGap + Math.round(28 * kk * dpr);
    const btnW = pixW(btnTxt) * pScale + Math.round(22 * kk * dpr);
    const btnH = tH + Math.round(9 * kk * dpr);
    const W = padX * 2 + u * 2 + leftW + Math.round(20 * kk * dpr) + nodeSpan + Math.round(20 * kk * dpr) + btnW;
    const H = Math.max(btnH + Math.round(6 * kk * dpr), Math.round(36 * kk * dpr)) + padY * 2 + u * 2;
    const btnX = W - padX - u - btnW;
    const btnY = Math.round((H - btnH) / 2);

    if (pKey !== s.key) {
      s.key = pKey;
      const c = makeCanvas(Math.ceil(W), Math.ceil(H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      drawPixelPlaque(g, 0, 0, c.width, c.height, u, {
        bg: '#161110', hi: '#2c1e16', border: '#07050a', inner: '#c88e3e', accent: '#ffe078', rivets: true,
      });
      const midY = Math.round(c.height / 2);

      // Left: pixel flame + total oil counter (e.g. 4/20)
      let cx = padX + u;
      drawMiniIcon(g, 'fire', cx + fireSz / 2, midY, fireSz);
      cx += fireSz + Math.round(5 * kk * dpr);
      drawPix(g, numTxt, cx, Math.round(midY - tH / 2), { scale: pScale, color: '#ffe48c', outline: '#08060c', align: 'left' });

      // Center: 5 pixel oil-lamp milestone nodes connected by a golden progress bar
      const trackX0 = cx + pixW(numTxt) * pScale + Math.round(34 * kk * dpr);
      const trackY = Math.round(midY - 3 * kk * dpr);
      const barH = Math.max(2, Math.round(3 * kk * dpr));
      const nodes = spec.milestones;
      const nodeXs = nodes.map((_, idx) => trackX0 + idx * nodeGap);
      if (nodeXs.length >= 2) {
        const xA = nodeXs[0], xB = nodeXs[nodeXs.length - 1];
        g.fillStyle = '#09070a';
        g.fillRect(xA, trackY - Math.round(barH / 2) - 1, xB - xA, barH + 2);
        g.fillStyle = '#332824';
        g.fillRect(xA, trackY - Math.round(barH / 2), xB - xA, barH);
        // Piecewise continuous golden fill across milestones
        let fillX = xA;
        for (let i = 0; i < nodes.length - 1; i++) {
          const a = i === 0 ? 0 : nodes[i], b = nodes[i + 1];
          if (spec.oil >= nodes[i]) {
            const frac = Math.max(0, Math.min(1, (spec.oil - nodes[i]) / Math.max(1, b - nodes[i])));
            fillX = nodeXs[i] + (nodeXs[i + 1] - nodeXs[i]) * frac;
          }
          void a;
        }
        if (spec.oil >= nodes[nodes.length - 1]) fillX = xB;
        if (fillX > xA) {
          g.fillStyle = '#f2b848';
          g.fillRect(xA, trackY - Math.round(barH / 2), Math.round(fillX - xA), barH);
          g.fillStyle = '#fff0a8';
          g.fillRect(xA, trackY - Math.round(barH / 2), Math.round(fillX - xA), Math.max(1, Math.round(dpr)));
        }
      }
      // Draw each of the 5 pixel lamps + numeric threshold underneath
      const lp = Math.max(1, Math.round(1.6 * kk * dpr));
      for (let i = 0; i < nodes.length; i++) {
        const nx = nodeXs[i], at = nodes[i], lit = spec.oil >= at;
        // Bronze lamp bowl
        g.fillStyle = '#07050a';
        g.fillRect(nx - 4 * lp, trackY - 1 * lp, 8 * lp, 5 * lp);
        g.fillStyle = lit ? '#e0a240' : '#4a424c';
        g.fillRect(nx - 3 * lp, trackY, 6 * lp, 3 * lp);
        g.fillStyle = lit ? '#ffe694' : '#645a68';
        g.fillRect(nx - 2 * lp, trackY, 4 * lp, lp);
        // Pixel flame dancing above lit lamp
        if (lit) {
          g.fillStyle = '#ff7e28';
          g.fillRect(nx - 2 * lp, trackY - 3 * lp, 4 * lp, 3 * lp);
          g.fillStyle = '#ffe05c';
          g.fillRect(nx - lp, trackY - 5 * lp, 2 * lp, 4 * lp);
          g.fillStyle = '#fffef0';
          g.fillRect(nx - lp, trackY - 3 * lp, 2 * lp, 2 * lp);
        }
        drawPix(g, String(at), nx, trackY + Math.round(5.5 * kk * dpr), {
          scale: nScale, color: lit ? '#ffe896' : '#80767e', outline: '#08060c', align: 'center',
        });
      }

      // Right: standalone clickable [+ 添油] button
      const hot = !maxed && !!spec.btnHot;
      drawPixelPlaque(g, btnX, btnY, btnW, btnH, Math.max(1, Math.round(1.3 * kk * dpr)), {
        bg: maxed ? '#221c18' : hot ? '#583412' : '#3a220e',
        hi: maxed ? '#322922' : hot ? '#824c1a' : '#583416',
        border: '#07050a',
        inner: maxed ? '#6c5a44' : hot ? '#fffef2' : '#f2b84c',
        rivets: !maxed,
      });
      if (hot) drawFocusBrackets(g, btnX, btnY, btnW, btnH, Math.max(1, Math.round(1.5 * kk * dpr)));
      drawPix(g, btnTxt, btnX + Math.round(btnW / 2), Math.round(midY - tH / 2), {
        scale: pScale, color: maxed ? '#a89a84' : hot ? '#fffef2' : '#ffe696', outline: '#08060c', align: 'center',
      });
      this.upload(s, c, dpr, false);
    }
    this.place(s, spec.x, spec.y, true, 1, false);
    const left0 = s.cx - s.w / 2, top0 = s.cy - s.h / 2;
    return {
      btnRect: maxed ? null : { x: left0 + btnX / dpr, y: top0 + btnY / dpr, w: btnW / dpr, h: btnH / dpr },
    };
  }

  hide(key: string) {
    const s = this.slots.get(key);
    if (s) s.mesh.visible = false;
  }

  hidePrefix(prefix: string) {
    for (const [k, s] of this.slots) if (k.startsWith(prefix)) s.mesh.visible = false;
  }

  clear() {
    for (const s of this.slots.values()) {
      s.mesh.parent?.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.tex?.dispose();
      s.mat.dispose();
    }
    this.slots.clear();
  }
}
