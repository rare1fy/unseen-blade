// 定死的屋子（11-18，用户：「这关卡形态确实严重雷同和不够」「我是觉得关卡设计得可以再大点，结构丰富点，甚至可以加点小解密元素」
// 「我其实感觉现在随机地图的意义不是特别大，还不如都做成几种确定的造型，避免不稳定因素」「毕竟要加入解密了」「关卡这个还是你来做吧」）。
// 一间屋 = 一张字符图（docs/LEVEL_DESIGN.md 的图例），1 格 = 4 个地格 = 1.96 米；第 0 行是最里面（−z），最后一行靠镜头（+z），
// 图的外框就是这间屋的场地（PLAY）。每次进去都一模一样：形状、掩体、可破坏物、机关、出口照图摆，布景用这间屋自己的种子和时段天气。
//
// 图例：`#` 实地（地点的 infill 建房子 / 麦地）  `.` 地面  `~` 坑（水 / 沟，打下去会死）  `=` 桥  `-` 吊桥（砍断绳桩前是坑）
//   `w` 泡在水下的路（开闸前是坑）  `D` 门（这一块打完开）  `G` 机关门（铜铃 / 压板开）  `?` 空心墙（砍三下塌）  `X` 木栅（火油坛炸开）
//   `S` 起点  `E` 出口（在图的外沿上）  `B` 头目站位  `o` 掩体  `0` 大掩体  `j` 可破坏小件  `t` 会倒的立柱  `!` 火油坛
//   `b` 铜铃  `r` 绳桩  `W` 闸轮  `P` 压板  `$` 奖励  `C` 小院摊位中心
import { PLAY, GRID, setStage } from '../scenes/props';
import type { Rect, TimeId, WeatherId } from './types';
import type { FixedPlan, PitKind, ShapePlan } from './roomShape';
import type { CoverKind } from './arena';
import type { RegionDef } from '../act/regionDef';

/** one map character = 4 floor cells */
export const MAP_CELL = GRID * 4;

export interface RoomMap {
  id: string;
  /** the room's name (logs, debug — the player doesn't see it) */
  name: string;
  /** the place it is dressed as */
  locale: string;
  kind: 'fight' | 'boss' | 'calm';
  rows: string[];
  /** how many pieces of the floor are fought in turn: 1 = all at once; n = S's piece, then through its D doors to the next … */
  stages: number;
  /** what '~' is here (default: water) */
  pit?: PitKind;
  /** Authored cover models in reading order; repeat the list for further marks. */
  coverKinds?: CoverKind[];
  bellTrees?: boolean;
  /** the room's own decoration seed, time of day and weather */
  seed: number; time?: TimeId; weather?: WeatherId;
}

// ---------------------------------------------------------------- the maps (docs/LEVEL_DESIGN.md §四)
export const ROOM_MAPS: RoomMap[] = [
  {
    // 十字街（第一关 · 主场 + 侧院）：烧毁的村口十字路，四面是院子：左上的藏在空心墙后（砍开有赏），左下的被木栅堵着（火油坛炸开有赏），
    // 右边两个院子有门，这一块打完开
    id: 'crossroads', name: '十字街', locale: 'hj_village', kind: 'fight', stages: 1, seed: 4101, time: 'dusk',
    rows: [
      '######.E....######',
      '######......######',
      '#.$..?.j....#j...#',
      '#....#......D..j.#',
      '######.t....######',
      'E..j.............E',
      '.........!........',
      '......o.....o..j..',
      '..j...............',
      '######....t.######',
      '#.$..X!.....#....#',
      '#.j..#......D.jj.#',
      '######......######',
      '######..S...######',
    ],
  },
  {
    // 三进院（第一关 · 两段）：大户的三进院子烧塌了一半。打完一进开二进，打完二进开三进；三进的祠堂门按铜铃的顺序开（可选，里面有赏）
    id: 'courtyards', name: '三进院', locale: 'hj_village', kind: 'fight', stages: 3, seed: 4207, time: 'night', weather: 'clear',
    rows: [
      '.E.#####.E.',
      '...#...#...',
      '.b.#.$.#.b.',
      '...#...#...',
      '...##G##...',
      '...........',
      '.j...b...j.',
      '####DDD####',
      '...........',
      '..o.....o..',
      '...........',
      '.....t.....',
      '...........',
      '.j.......j.',
      '####DDD####',
      '...........',
      '...j...j...',
      '..o.....o..',
      '...........',
      '...........',
      '.....S.....',
    ],
  },
  {
    // 水巷岛链（第三关 · 主场 + 孤岛）：水淹了的街巷，五块地（屋顶、院台）用木板连起来；右边一座吊桥拉在半空，砍断绳桩落下，通到放赏的小岛
    id: 'islands', name: '水巷岛链', locale: 'xp_lane', kind: 'fight', stages: 1, seed: 4313, pit: 'water',
    rows: [
      '~.E....~~~~..E...~',
      '~......~~~~......~',
      '~..o...====...o..~',
      '~......~~~~......~',
      '~~~~=~~~~~~~~=~~~~',
      '~~~~=~~~~~~~~=~~~~',
      '~......~~~~......~',
      '~..o...====..o...~',
      '~......~~~~......~',
      '~......~~~~...r..~',
      '~~~=~~~~~~~~~~~-~~',
      '~~~=~~~~~~~~~~~-~~',
      '~.......~~~~~~.$.~',
      '~..j....~~~~~~...~',
      '~.......~~~~~~~~~~',
      '~...S...~~~~~~~~~~',
    ],
  },
  {
    id: 'threshing', name: '打谷场', locale: 'hj_field', kind: 'fight', stages: 1, seed: 4401, time: 'day', weather: 'clear',
    coverKinds: ['mill', 'cart'], bellTrees: true,
    rows: [
      '####....E....#####',
      '####.........#####',
      '##..b....j...#####',
      '##...........G....',
      '...........b.G..$.',
      '.............G....',
      '......o......#....',
      '.............#####',
      '..................',
      '..b..j...........E',
      '............o.....',
      '#####.............',
      '....D..........###',
      '.j..D...S......###',
      '....#..........###',
    ],
  },
  {
    id: 'yard_1', name: '农家小院', locale: 'hj_village', kind: 'calm', stages: 1, seed: 4501, time: 'dawn', weather: 'clear',
    coverKinds: ['well'],
    rows: [
      '###..E.....',
      '###........',
      '###........',
      '..........E',
      '.....C.....',
      '..o........',
      '........###',
      '##..S...###',
      '##......###',
    ],
  },
  {
    id: 'palace_road', name: '宫道长廊', locale: 'ly_ward', kind: 'fight', stages: 2, seed: 5203, time: 'dusk', weather: 'clear',
    coverKinds: ['beast'],
    rows: [
      '##..E..###',
      '##.....###',
      '##.....###',
      '##.o..####',
      '......#.$.',
      '......G...',
      'E.....G.P.',
      '......G...',
      '....P.#...',
      '......#...',
      '..j...####',
      '..........',
      '###DDD####',
      '..........',
      '##......j.',
      '##........',
      '##.....###',
      '##.o...###',
      '##.....###',
      '.......###',
      '.......###',
      '##.....###',
      '##..S.....',
      '##........',
    ],
  },
  {
    id: 'fallen_hall', name: '塌殿', locale: 'ly_ward', kind: 'fight', stages: 1, seed: 5302, time: 'dawn', weather: 'rain', pit: 'ditch',
    coverKinds: ['columnBase', 'columnStub'],
    rows: [
      '#######...E.....####',
      '#.....#.........####',
      '#..$..#.............',
      '#.....#t..o~~~~.t...',
      '##???##....~~~~.....',
      '...........~~~~.....',
      '....................',
      '...t......t.....o...',
      '.....~~~~..........E',
      '....Wwwww...........',
      '.....~~~~...........',
      '...o......o.....t...',
      '###.................',
      '###.......S......###',
      '###..............###',
    ],
  },
  {
    id: 'bronze_street', name: '铜驼大街', locale: 'ly_road', kind: 'fight', stages: 1, seed: 5400, time: 'dusk', weather: 'clear',
    coverKinds: ['streetCamel'],
    rows: [
      '####...E...####',
      '####.......####',
      '####.......####',
      '####...........',
      '.........###...',
      '#####....###...',
      '....#..........',
      '....#..0.......',
      '....X.........E',
      '.$..X####......',
      '....X####......',
      '....X####......',
      '....X!.........',
      '....#.......j..',
      '....#..........',
      '#####....###...',
      '.........###...',
      '......j..###...',
      '..###..........',
      '..###..........',
      '.......S.......',
      '...............',
    ],
  },
  {
    id: 'mint', name: '铸钱场', locale: 'ly_mint', kind: 'boss', stages: 1, seed: 5502, time: 'night', weather: 'clear', pit: 'molten',
    coverKinds: ['mintPress'],
    rows: [
      '###.....E......###',
      '###............###',
      '.........B........',
      '...o..............',
      '..................',
      '....~~=~~~~=~~....',
      '....~~=~~~~=~~....',
      '....~~=~~~~=~~...E',
      '....~~=~~~~=~~....',
      '....~~=~~~~=~~....',
      '....~~=~~~~=~~....',
      '....~~=~~~~=~~....',
      '..................',
      '..............o...',
      '..................',
      '###.....S......###',
      '###............###',
    ],
  },
  {
    id: 'yard_2', name: '焦砖小院', locale: 'ly_road', kind: 'calm', stages: 1, seed: 5603, time: 'dusk', weather: 'mist',
    rows: [
      '###..E..####',
      '###.....####',
      '........####',
      '............',
      '............',
      '###...C....E',
      '###.........',
      '###..S....##',
      '###.......##',
    ],
  },
];
export const MAP_BY_ID: Record<string, RoomMap> = Object.fromEntries(ROOM_MAPS.map(m => [m.id, m]));
/** Exhaust each regional deck, including on subsequent cycles. Visits to yards or other regions do not advance it. */
export function pickMap(region: Pick<RegionDef, 'locales' | 'bossLocale'>, kind: RoomMap['kind'], used: string[], seed: number): RoomMap | null {
  const locales = kind === 'boss' ? [region.bossLocale] : region.locales;
  const all = ROOM_MAPS.filter(m => m.kind === kind && locales.includes(m.locale));
  if (!all.length) return null;
  const history = used.filter(id => all.some(m => m.id === id));
  const count = history.length % all.length;
  const skip = count ? history.slice(-count) : all.length > 1 ? history.slice(-1) : [];
  const fresh = all.filter(m => !skip.includes(m.id));
  return fresh[Math.abs(Math.floor(seed)) % fresh.length];
}

// ---------------------------------------------------------------- the stage it stands on
const kMemo = new Map<string, { x: number; z: number }>();
/** setStage(true, k) with the k that makes PLAY exactly the map's size (cols × rows × 1.96 m, its edges on the floor grid): returned,
 *  and the stage is left set to it */
export function mapStage(m: RoomMap): { x: number; z: number } {
  const W = m.rows[0].length * MAP_CELL, D = m.rows.length * MAP_CELL, ok = () => Math.abs(PLAY.x1 - PLAY.x0 - W) < 0.01 && Math.abs(PLAY.z1 - PLAY.z0 - D) < 0.01;
  const memo = kMemo.get(m.id); if (memo) { setStage(true, memo); if (ok()) return memo; }
  // PLAY = the old 10.6 × 12 m floor scaled by k, its edges snapped to the grid: try k a hair either side until the snapped size is right
  const kx0 = W / 10.6, kz0 = D / 12; let kx = kx0, kz = kz0;
  const fit = (axis: 'x' | 'z', k0: number, want: number) => {
    for (let n = 0; n < 60; n++) {
      const k = k0 + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 0.0025;
      setStage(true, axis === 'x' ? { x: k, z: kz } : { x: kx, z: k });
      if (Math.abs((axis === 'x' ? PLAY.x1 - PLAY.x0 : PLAY.z1 - PLAY.z0) - want) < 0.01) return k;
    }
    throw new Error(`map ${m.id}: no stage fits ${axis}`);
  };
  kx = fit('x', kx0, W); kz = fit('z', kz0, D);
  const k = { x: kx, z: kz }; setStage(true, k); if (!ok()) throw new Error(`map ${m.id}: stage does not fit`);
  kMemo.set(m.id, k); return k;
}

// ---------------------------------------------------------------- map → plan
const FLOORISH = '.SEBCo0jt!brWP$';
/** the rects (m) covering the map cells that pass test: runs along each row, runs of the same span in the rows below merged into one */
function rects(rows: string[], test: (ch: string) => boolean, X0: number, Z0: number): Rect[] {
  const out: Rect[] = [];
  const emit = (q: { c0: number; c1: number; r0: number }, r1: number) => out.push({ x0: X0 + q.c0 * MAP_CELL, x1: X0 + (q.c1 + 1) * MAP_CELL, z0: Z0 + q.r0 * MAP_CELL, z1: Z0 + (r1 + 1) * MAP_CELL });
  let active: Array<{ c0: number; c1: number; r0: number }> = [];
  rows.forEach((row, r) => {
    const next: typeof active = [];
    for (let c = 0; c < row.length;) {
      if (!test(row[c])) { c++; continue; }
      let e = c; while (e + 1 < row.length && test(row[e + 1])) e++;
      const i = active.findIndex(q => q.c0 === c && q.c1 === e);
      next.push(i >= 0 ? active.splice(i, 1)[0] : { c0: c, c1: e, r0: r });
      c = e + 1;
    }
    for (const q of active) emit(q, r - 1);
    active = next;
  });
  for (const q of active) emit(q, rows.length - 1);
  return out;
}

/** the map's plan on the stage set for it (call mapStage(m) first): solids, pits, bridges, the moving pieces, the marks */
export function mapShape(m: RoomMap): ShapePlan {
  const rows = m.rows, W = rows[0].length, H = rows.length;
  if (rows.some(r => r.length !== W)) throw new Error(`map ${m.id}: rows of different widths`);
  const X0 = PLAY.x0, Z0 = PLAY.z0, box: Rect = { x0: PLAY.x0, x1: PLAY.x1, z0: PLAY.z0, z1: PLAY.z1 };
  const R = (a: string) => rects(rows, ch => a.includes(ch), X0, Z0);
  const pitK: PitKind = m.pit ?? 'water';
  const fixed: FixedPlan = {
    id: m.id, bellTrees: m.bellTrees,
    closed: [...R('D').map(q => ({ ...q, kind: 'door' as const })), ...R('G').map(q => ({ ...q, kind: 'gate' as const })),
      ...R('?').map(q => ({ ...q, kind: 'hollow' as const })), ...R('X').map(q => ({ ...q, kind: 'barricade' as const }))],
    sunk: [...R('-').map(q => ({ ...q, kind: 'drop' as const })), ...R('w').map(q => ({ ...q, kind: 'flood' as const }))],
    exits: [], covers: [], props: [], marks: [], stages: m.stages,
  };
  let enter: [number, number] = [(X0 + PLAY.x1) / 2, PLAY.z1 - 2.5];
  const at = (c: number, r: number): [number, number] => [X0 + (c + 0.5) * MAP_CELL, Z0 + (r + 0.5) * MAP_CELL];
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    const [x, z] = at(c, r);
    if (!'#~=-wDG?X'.includes(ch) && !FLOORISH.includes(ch)) throw new Error(`map ${m.id}: '${ch}' at ${c},${r}`);
    switch (ch) {
      case 'S': enter = [x, z]; break;
      case 'E': {
        const side = r === 0 ? 'back' : c === 0 ? 'left' : c === W - 1 ? 'right' : null;
        if (!side) throw new Error(`map ${m.id}: E off the edge at ${c},${r}`);
        fixed.exits.push(side === 'back' ? { side, x, z: PLAY.z0 } : { side, x: side === 'left' ? PLAY.x0 : PLAY.x1, z });
        break;
      }
      case 'B': fixed.boss = [x, z]; break;
      case 'C': fixed.stations = [x, z]; break;
      case 'o': case '0': fixed.covers.push({ x, z, big: ch === '0', kind: m.coverKinds?.[fixed.covers.length % m.coverKinds.length] }); break;
      case 'j': fixed.props.push({ kind: 'small', x, z }); break;
      case 't': fixed.props.push({ kind: 'pillar', x, z }); break;
      case '!': fixed.props.push({ kind: 'oil', x, z }); break;
      case 'b': fixed.marks.push({ kind: 'bell', x, z }); break;
      case 'r': fixed.marks.push({ kind: 'rope', x, z }); break;
      case 'W': fixed.marks.push({ kind: 'wheel', x, z }); break;
      case 'P': fixed.marks.push({ kind: 'plate', x, z }); break;
      case '$': fixed.marks.push({ kind: 'reward', x, z }); break;
    }
  }));
  // the pits under the bridges and the drop-bridges too (a bridge is laid over its pit); a flooded path's pit is its own kind
  const pits = [...R('~=-').map(q => ({ ...q, kind: pitK })), ...R('w').map(q => ({ ...q, kind: 'flood' as const }))];
  return { id: 'map', k: { x: 0, z: 0 }, box, solid: R('#'), pits, bridges: R('='), enter, fixed };
}

/** the exits a room uses, by the ids its spec asks for: one → the deepest E (the middle one of equals); two → the pair farthest apart,
 *  'left' the one further left. The E's not used are shut gates */
export function drawnExits(fx: FixedPlan, ids: Array<'left' | 'right' | 'back'>) {
  const out: Partial<Record<'left' | 'right' | 'back', FixedPlan['exits'][number]>> = {}, es = fx.exits;
  if (!ids.length || !es.length) return out;
  if (ids.length === 1 || es.length === 1) {
    const e = es.slice().sort((a, b) => a.z - b.z || Math.abs(a.x) - Math.abs(b.x))[0];
    out[ids[0]] = e; return out;
  }
  let best: [number, number] = [0, 1], bd = -1;
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) { const d = Math.hypot(es[i].x - es[j].x, es[i].z - es[j].z); if (d > bd) { bd = d; best = [i, j]; } }
  const [a, b] = best.map(i => es[i]).sort((p, q) => p.x - q.x);
  out[ids[0]] = a; out[ids[1]] = b; return out;
}
