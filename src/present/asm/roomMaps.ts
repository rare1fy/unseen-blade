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
    // 十字街（第一关 · 主场 + 侧院）：非对称北方残村村口——西北大户粮仓正堂（镜头外延伸，偏仓墙裂 `?` 后藏赏）、东北村口酒肆哨所（敞开木廊面街）、
    // 西南低矮晒谷囤场（木栅 `X` + 火油坛 `!` 炸开取赏，外连麦田）、东南火烧断垣残院（清场开 `D` 门，烧塌半间民居延伸出镜）
    id: 'crossroads', name: '十字街', locale: 'hj_village', kind: 'fight', stages: 1, seed: 4101, time: 'dusk',
    coverKinds: ['well', 'cart'],
    rows: [
      '#######..E..######',
      '#######.....######',
      '#######.....######',
      '#######.t.........',
      '.$....?.....o.....',
      '......#..........E',
      '#######..!...j....',
      'E..j..............',
      '.........o........',
      '.............#####',
      '#####......t.D..j.',
      '.$..X!.......#....',
      '.j..#........#####',
      '....#..S.....#####',
    ],
  },
  {
    // 三进院（第一关 · 三段）：豪强三进大宅，两侧东西厢房伸出镜头，打完一进开二进、二进开三进；三进宗祠按三铜铃顺序开启（可选赏）
    id: 'courtyards', name: '三进院', locale: 'hj_village', kind: 'fight', stages: 3, seed: 4207, time: 'night', weather: 'clear',
    rows: [
      '###.E.#####.E..',
      '###...#...#..##',
      '###.b.#.$.#..##',
      '##....#...#.b##',
      '##....##G##..##',
      '...............',
      '###.j...b...j..',
      '######DDD######',
      '###.........###',
      '###..o...o..###',
      '##...........##',
      '##.....t.....##',
      '##...........##',
      '###.j.....j.###',
      '######DDD######',
      '###............',
      '###...j..j..###',
      '####.o....o.###',
      '####........###',
      '####...S....###',
      '####........###',
    ],
  },
  {
    // 水巷岛链（第三关 · 主场 + 孤岛）：水淹了的徐州水城街巷，西北临水三层谯楼商行 + 东北塌水榭，五块院台木桥相连，斩断绳桩落吊桥通宝岛
    id: 'islands', name: '水巷岛链', locale: 'xp_lane', kind: 'fight', stages: 1, seed: 4313, pit: 'water',
    rows: [
      '####.E..~~~~..E###',
      '####....~~~~...###',
      '####o...====.o.###',
      '~.......~~~~.....~',
      '~~~~=~~~~~~~~=~~~~',
      '~~~~=~~~~~~~~=~~~~',
      '~......~~~~......~',
      '~..o...====..o...~',
      '~......~~~~......~',
      '~......~~~~...r..~',
      '~~~=~~~~~~~~~~~-~~',
      '~~~=~~~~~~~~~~~-~~',
      '###.....~~~~~~.$.~',
      '###.j...~~~~~~...~',
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
    // 曲巷伏道（第一关 · S形折曲两段巷战）：打破方正庭院，南巷东折→过中段门楼→北巷西折；东南木栅+火油坛藏秘匣
    id: 'hj_alley', name: '曲巷伏道', locale: 'hj_village', kind: 'fight', stages: 2, seed: 4421, time: 'dusk', weather: 'clear',
    coverKinds: ['cart', 'well'],
    rows: [
      '###..E.....#####',
      '###........#####',
      '###..o.....#####',
      'E....t.....#####',
      '.......j........',
      '#####..o....####',
      '#####.......####',
      '#####DDD########',
      '###............#',
      '###...o....j...#',
      '###..........###',
      '###...t.....!X.$',
      '###..........###',
      '####..o....j.###',
      '####.........###',
      '####...S.....###',
      '####.........###',
    ],
  },
  {
    // 水车麦渠（第一关 · 十字灌溉水渠割裂四块麦台）：西北二层大木水车磨坊 + 西闸排北渠捷径 + 东岸斩绳放吊桥登东南秘宝孤岛
    id: 'hj_mill', name: '水车麦渠', locale: 'hj_field', kind: 'fight', stages: 1, seed: 4437, time: 'day', weather: 'clear', pit: 'water',
    coverKinds: ['mill', 'cart'],
    rows: [
      '#####...E.~~..####',
      '#####.....~~..####',
      '#####..o..ww....##',
      '#####.....~~..o..E',
      'E...W.....~~..j...',
      '....j.....==......',
      '....o.....~~....r.',
      '~~~~==~~~~~~~~~--~',
      '~~~~==~~~~~~~~~--~',
      '###........~~~~...',
      '###..o..j..~~~~.$.',
      '###........~~~~...',
      '###....t...~~~~~~~',
      '###....S...#######',
      '###........#######',
    ],
  },
  {
    // 回字粮仓（第一关 · 中空环形回廊）：中央矗立独栋三层公社大义仓，玩家绕仓游战；西壁空心裂墙暗窖 + 东翼压板铁门秘库
    id: 'hj_granary', name: '回字粮仓', locale: 'hj_village', kind: 'fight', stages: 1, seed: 4453, time: 'night', weather: 'clear',
    coverKinds: ['well', 'cart'],
    rows: [
      '####...E....#####',
      '####........#####',
      '###...o..j...####',
      'E...............E',
      '####..#####..####',
      '#.$?..#####..G.$#',
      '####..#####.PGP.#',
      '###...#####..####',
      '###.j.#####..o.##',
      '###............##',
      '....o......t.....',
      '.................',
      '####..j....j.####',
      '####....S....####',
      '####.........####',
    ],
  },
  {
    // 残集墟市（第一关 · 超宽横向大集主街）：北沿二层重檐戏台市楼 + 东西宽街乱战；三铜铃听声开启东北后台秘库
    id: 'hj_market', name: '残集墟市', locale: 'hj_village', kind: 'fight', stages: 1, seed: 4469, time: 'day', weather: 'clear',
    coverKinds: ['cart', 'well'],
    rows: [
      '######...E...######',
      '######.......######',
      '######..b....#..$.#',
      '#####........G....#',
      'E............G....#',
      '...o....j....######',
      '.............b....E',
      '....t....o.........',
      '###................',
      '###..b.....j...####',
      '###............####',
      '#####....o.....####',
      '#####....S.....####',
      '#####..........####',
    ],
  },
  {
    // 麦坡断壕（第一关 · 壕沟双段强攻阵地）：深壕木桥把麦坡劈成南北两段，北坡烽火望楼 + 西翼火油木栅 + 东翼空心土墙暗室
    id: 'hj_ridge', name: '麦坡断壕', locale: 'hj_field', kind: 'fight', stages: 2, seed: 4483, time: 'dusk', weather: 'clear', pit: 'ditch',
    coverKinds: ['cart', 'mill'],
    rows: [
      '####...E...#####',
      '####.......#####',
      '####..o....#.$.#',
      'E..........?...#',
      '####.t.....#####',
      '#.$X!..........E',
      '####...j...o....',
      '######DDD#######',
      '~~~~~~===~~~~~~~',
      '~~~~~~===~~~~~~~',
      '###..........###',
      '###..o....o..###',
      '##............##',
      '##....t..j....##',
      '###..........###',
      '###....S.....###',
      '###..........###',
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
      '####..E...#####',
      '####......#####',
      '####..o...#####',
      '###........####',
      '###.......#.$.#',
      '..........G...#',
      'E.........G.P.#',
      '..........G...#',
      '###....P..#...#',
      '###.......#####',
      '###..j....#####',
      '#####DDD#######',
      '###............',
      '###.......j.###',
      '####........###',
      '####..o.....###',
      '####.......####',
      '###........####',
      '###........####',
      '###...S....####',
      '###........####',
    ],
  },
  {
    id: 'fallen_hall', name: '塌殿', locale: 'ly_ward', kind: 'fight', stages: 1, seed: 5302, time: 'dawn', weather: 'rain', pit: 'ditch',
    coverKinds: ['columnBase', 'columnStub'],
    rows: [
      '#######...E....#####',
      '#.....#........#####',
      '#..$..#........#####',
      '#.....#t..o~~~~.t...',
      '##???##....~~~~.....',
      '...........~~~~..###',
      '.................###',
      '...t......t.....o...',
      '.....~~~~..........E',
      '....Wwwww...........',
      '.....~~~~........###',
      '###.o......o...t.###',
      '####............####',
      '####......S.....####',
      '####............####',
    ],
  },
  {
    id: 'bronze_street', name: '铜驼大街', locale: 'ly_road', kind: 'fight', stages: 1, seed: 5400, time: 'dusk', weather: 'clear',
    coverKinds: ['streetCamel'],
    rows: [
      '#####...E...###',
      '#####.......###',
      '#####.......###',
      '#####..........',
      '.........###...',
      '#####....###...',
      '....#..........',
      '....#..0.......',
      '....X.........E',
      '.$..X####......',
      '....X####...###',
      '....X####...###',
      '....X!......###',
      '....#.......j..',
      '....#..........',
      '#####....###...',
      '.........###...',
      '###...j..###...',
      '###............',
      '###.....S...###',
      '###.........###',
    ],
  },
  {
    // 御沟断桥（第二关 · 焦宫熔铜御沟 + 中心残阙孤岛）：熔铜沟壑割开南北御台与孤岛，东岸斩绳落吊桥通往东南秘宝孤台
    id: 'ly_bridge', name: '御沟断桥', locale: 'ly_ward', kind: 'fight', stages: 1, seed: 5411, time: 'dusk', weather: 'clear', pit: 'molten',
    coverKinds: ['beast'],
    rows: [
      '#####...E..#######',
      '#####......#######',
      '####..o....j..####',
      'E................E',
      '~~~~~==~~~~==~~~~~',
      '~~~~.........~~~~~',
      '~~~~..o...r..--..#',
      '~~~~.........--.$#',
      '~~~~~~==~~~==~~~~~',
      '####..........####',
      '###..j....o....###',
      '###............###',
      '####....t.....####',
      '####....S.....####',
      '####..........####',
    ],
  },
  {
    // 熔廊回巷（第二关 · 回字熔铜长廊）：中央巨型发光熔铜池四周环绕焦黑柱廊，西翼火油炸木栅 + 东翼空心裂墙双暗库
    id: 'ly_kiln', name: '熔廊回巷', locale: 'ly_road', kind: 'fight', stages: 1, seed: 5429, time: 'night', weather: 'clear', pit: 'molten',
    coverKinds: ['beast'],
    rows: [
      '#####...E...#####',
      '#####.......#####',
      '####..o...j..####',
      'E...............E',
      '####..~~~~~..####',
      '#.$X!.~~~~~..?.$#',
      '####..~~~~~..####',
      '###.o.~~~~~..o.##',
      '###...~~~~~....##',
      '###...~~~~~..j.##',
      '....j.......t....',
      '.................',
      '####..o...o..####',
      '####....S....####',
      '####.........####',
      '####.........####',
    ],
  },
  {
    // 残阙钟台（第二关 · L形两段阶梯焦宫）：南庭清敌开宫门进北祭坛，三铜铃听声开启东北红漆秘库
    id: 'ly_altar', name: '残阙钟台', locale: 'ly_ward', kind: 'fight', stages: 2, seed: 5443, time: 'dawn', weather: 'clear',
    coverKinds: ['beast'],
    rows: [
      '####...E...#####',
      '####.......#####',
      '###..b.....#.$.#',
      'E..........G...#',
      '.....o.....G...#',
      '..b........#####',
      '........b.....##',
      '#####DDD########',
      '##.............#',
      '##..o......j...#',
      '##.............#',
      '###....t......##',
      '####..o...j..###',
      '####.........###',
      '####...S.....###',
      '####.........###',
      '####.........###',
    ],
  },
  {
    // 焦阙瓮城（第二关 · 凹字双层宫城瓮城）：外瓮城破敌入内殿，内殿西翼双压板开启焦宫军需秘库
    id: 'ly_gatehouse', name: '焦阙瓮城', locale: 'ly_road', kind: 'fight', stages: 2, seed: 5459, time: 'dusk', weather: 'clear',
    coverKinds: ['beast'],
    rows: [
      '#####...E...#####',
      '#####.......#####',
      '####..o...o..####',
      'E...............E',
      '####.........####',
      '#P$GP........####',
      '####.........####',
      '######DDD########',
      '###...........###',
      '##..o......o...##',
      '##......t......##',
      '##..j......j...##',
      '###...........###',
      '####....S....####',
      '####.........####',
      '####.........####',
    ],
  },
  {
    // 宫渠残坊（第二关 · 纵贯宫渠残垣坊市）：御沟隔开东西两坊，西岸转动闸轮排干北段暗水道直通东北秘阁
    id: 'ly_canal', name: '宫渠残坊', locale: 'ly_ward', kind: 'fight', stages: 1, seed: 5477, time: 'night', weather: 'mist', pit: 'water',
    coverKinds: ['beast'],
    rows: [
      '####...E..~~~~####',
      '####......~~~~####',
      '###..o....~~~~.$.#',
      'E.........wwww...#',
      '....W.....~~~~####',
      '....j.....~~~~...E',
      '..........====....',
      '....o.....~~~~..o.',
      '..........~~~~..j.',
      '####......~~~~....',
      '####..t...~~~~####',
      '###.......~~~~####',
      '###...o...~~~~####',
      '###...S...########',
      '###.......########',
    ],
  },
  {
    id: 'mint', name: '铸钱场', locale: 'ly_mint', kind: 'boss', stages: 1, seed: 5502, time: 'night', weather: 'clear', pit: 'molten',
    coverKinds: ['mintPress'],
    rows: [
      '#####...E.....####',
      '#####.........####',
      '####.....B....####',
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
      '####..............',
      '####....S......###',
      '####...........###',
    ],
  },
  {
    id: 'yard_2', name: '焦砖小院', locale: 'ly_road', kind: 'calm', stages: 1, seed: 5603, time: 'dusk', weather: 'mist',
    rows: [
      '####..E..####',
      '####.....####',
      '###......####',
      '.............',
      '.............',
      '###...C.....E',
      '###..........',
      '####..S...###',
      '####......###',
    ],
  },
  // ---------------------------------------------------------------- Region 3 · 下邳寒沼 (xp_lane / xp_wall / xp_gate)
  {
    id: 'xp_rampart', name: '湿马道', locale: 'xp_wall', kind: 'fight', stages: 2, seed: 6103, time: 'dusk', weather: 'mist', pit: 'water',
    rows: [
      '######..E...####',
      '######......####',
      '######.o....####',
      '######..........',
      'E....o.....j....',
      '.........~~~~...',
      '........Wwwww.$.',
      '.........~~~~...',
      '#####DDD########',
      '................',
      '####.o....o.....',
      '####..........##',
      '###....t......##',
      '.......j......##',
      '###....S......##',
      '###...........##',
    ],
  },
  {
    id: 'xp_ferry', name: '冰河渡口', locale: 'xp_lane', kind: 'fight', stages: 1, seed: 6207, time: 'day', weather: 'snow', pit: 'water',
    rows: [
      '######..E..~~~~~~',
      '######.....~~~~~~',
      '######..o..~~~..E',
      '.$...?.....===...',
      '.....#.....~~~...',
      '######.....~~~.o.',
      'E..........~~~...',
      '......o....===...',
      '...........~~~...',
      '....j......~~~.j.',
      '###........~~~~~~',
      '###..t.....~~~~~~',
      '###....S...~~~###',
      '###........~~~###',
    ],
  },
  {
    // 双闸分水口（第三关 · T形运河四岛水网）：主航道十字双桥联通三岛，西北岸转动闸轮排干北渠石堤直登东北孤岛取秘匣
    id: 'xp_sluice', name: '双闸分水口', locale: 'xp_lane', kind: 'fight', stages: 1, seed: 6221, time: 'day', weather: 'snow', pit: 'water',
    rows: [
      '#####...E.~~~~####',
      '#####.....~~~~####',
      '####..o...wwww..$#',
      'E.........~~~~...#',
      '....W..j..~~~~~~~~',
      '~~~~~~===~~~~~~~~~',
      '~~~~~~===~~~~~~~~~',
      '###.......~~.....E',
      '###..o....~~..o...',
      '###.......==......',
      '###.......~~..j...',
      '###...t...~~..####',
      '####......~~..####',
      '####..S...~~~~~~~~',
      '####......~~~~~~~~',
    ],
  },
  {
    // 冰城瓮道（第三关 · 凹字双段护城瓮城）：外马道过石桥破敌开瓮城铁门，内城东翼双压板开启城楼军需库
    id: 'xp_barbican', name: '冰城瓮道', locale: 'xp_wall', kind: 'fight', stages: 2, seed: 6239, time: 'night', weather: 'snow', pit: 'water',
    rows: [
      '####...E...#####',
      '####.......#####',
      '###..o...o..####',
      'E..............E',
      '####........####',
      '####.......PG$P#',
      '####........####',
      '~~~~~#DDD#~~~~~~',
      '~~~~~=====~~~~~~',
      '###..........###',
      '##..o......o..##',
      '##.....t......##',
      '##..j......j..##',
      '###..........###',
      '####...S.....###',
      '####.........###',
      '####.........###',
    ],
  },
  {
    // 浮桥暗巷（第三关 · Z字锯齿错位水街）：三座错落浮桥串联东西水巷，西岸空心裂墙 + 东岸火油炸木栅双暗库
    id: 'xp_zigzag', name: '浮桥暗巷', locale: 'xp_lane', kind: 'fight', stages: 1, seed: 6257, time: 'dusk', weather: 'mist', pit: 'water',
    rows: [
      '####..E..~~~~#####',
      '####.....~~~~#####',
      '###..o...====....E',
      'E........~~~~..o..',
      '~~~~===~~~~~~..j..',
      '~~~~===~~~~~~.....',
      '####.....~~~~.####',
      '#.$?.....~~~~!X.$#',
      '####..o..~~~~.####',
      '####.....====.....',
      '####..j..~~~~..o..',
      '###......~~~~..j..',
      '###...t..~~~~~~~~~',
      '###...S..#########',
      '###......#########',
    ],
  },
  {
    // 寒江船栅（第三关 · 回字冻港孤屿）：三面栈道合围冻水港湾，北岸斩断绳桩放下吊桥登上港心孤屿夺秘宝
    id: 'xp_dockyard', name: '寒江船栅', locale: 'xp_lane', kind: 'fight', stages: 1, seed: 6271, time: 'night', weather: 'snow', pit: 'water',
    rows: [
      '#####...E...#####',
      '#####.......#####',
      '####..o...o..####',
      'E.......r.......E',
      '###.~~~--~~~..###',
      '###.~~~--~~~..###',
      '###.~~....~~...##',
      '##..~~..$.~~.o.##',
      '##.o~~....~~...##',
      '##..~~~~~~~~.j.##',
      '##..~~~~~~~~...##',
      '###...........###',
      '####..o...o..####',
      '####....S....####',
      '####.........####',
      '####.........####',
    ],
  },
  {
    // 雪夜烽台（第三关 · 两段雪夜城垣钟楼）：南城垣清敌入北烽台，寒风三铜铃听声解锁西北箭楼秘库
    id: 'xp_bellwall', name: '雪夜烽台', locale: 'xp_wall', kind: 'fight', stages: 2, seed: 6287, time: 'night', weather: 'clear', pit: 'water',
    rows: [
      '#####...E...####',
      '#####.......####',
      '#.$#..b.....####',
      '#..G........o..E',
      '####....b.......',
      '###.............',
      '###..o....b...##',
      '#####DDD########',
      '~~............~~',
      '~~..o......o..~~',
      '~~.....t......~~',
      '~~..j......j..~~',
      '###..........###',
      '####...S.....###',
      '####.........###',
      '####.........###',
      '####.........###',
    ],
  },
  {
    id: 'baimen', name: '白门楼', locale: 'xp_gate', kind: 'boss', stages: 1, seed: 6301, time: 'dusk', weather: 'mist', pit: 'water',
    rows: [
      '######..E.....####',
      '######........####',
      '######........####',
      '.........B........',
      '..................',
      '~...o........o...~',
      '~................~',
      '~................E',
      '~................~',
      '~................~',
      '~...o........o...~',
      '..................',
      '..................',
      '####..............',
      '####....S.......##',
      '####............##',
    ],
  },
  {
    id: 'yard_3', name: '寒潭小院', locale: 'xp_lane', kind: 'calm', stages: 1, seed: 6405, time: 'dawn', weather: 'snow', pit: 'water',
    rows: [
      '####.E...~~~',
      '####.....~~~',
      '####.....~~~',
      '...........E',
      '............',
      '.....C......',
      '............',
      '##.......~~~',
      '##...S...~~~',
      '##.......~~~',
    ],
  },
  // ---------------------------------------------------------------- Region 4 · 锁江 · 乌林 (wl_dock / wl_camp / wl_tower)
  {
    id: 'wl_chains', name: '连环战船', locale: 'wl_dock', kind: 'fight', stages: 1, seed: 7109, time: 'night', weather: 'clear', pit: 'water',
    rows: [
      '######..E.~~..####',
      '######....~~..####',
      '######.o..==..####',
      'E.........~~......',
      '....t.....~~..o..E',
      '..........~~......',
      '~~~~~~~~==~~~~~~~~',
      '~~~~~~~~==~~~~~~~~',
      '~......o......r..~',
      '~.............-..~',
      '###.j.........-..~',
      '###........~~~.$.~',
      '###..S.....~~~...~',
      '~..........~~~~~~~',
    ],
  },
  {
    id: 'wl_jetty', name: '水寨栈桥', locale: 'wl_dock', kind: 'fight', stages: 2, seed: 7211, time: 'night', weather: 'mist', pit: 'water',
    rows: [
      '######..E...####',
      '######......####',
      '######.o....####',
      'E...............',
      '....o......j...E',
      '................',
      '~~~~###DDD###~~~',
      '~~~~.........~~~',
      '.......t........',
      '###..........~~~',
      '.$X!....o....~~~',
      '..#..........~~~',
      '###....j.....~~~',
      '~......S.......~',
      '~..............~',
      '~~~~~~~~~~~~~~~~',
    ],
  },
  {
    id: 'wl_barracks', name: '乌林大营', locale: 'wl_camp', kind: 'fight', stages: 1, seed: 7303, time: 'night', weather: 'clear', pit: 'water',
    rows: [
      '#######..E..#####',
      '#######.....#####',
      '#######..t..#####',
      '.$...?......#####',
      '.....#.....o....E',
      '######...........',
      '######...!.......',
      'E....o.......~~~.',
      '.............===.',
      '###......j...~~~.',
      '###..........~~~.',
      '###..t.......~~~.',
      '###....S.....####',
      '###..........####',
    ],
  },
  {
    // 环舰水寨（第四关 · 四舰合围中空江面）：四艘战船围出江心水池，东舷斩绳落跳板直登江心残舰孤台取秘宝
    id: 'wl_ring', name: '环舰水寨', locale: 'wl_dock', kind: 'fight', stages: 1, seed: 7321, time: 'night', weather: 'clear', pit: 'water',
    rows: [
      '######...E..######',
      '######......######',
      '###..o......o..###',
      'E................E',
      '###..~~~~~~~~..###',
      '##...~~....~~...##',
      '##.o.~~..$.--r..##',
      '##...~~....--...##',
      '##.j.~~~~~~~~.o.##',
      '##...~~~~~~~~...##',
      '###............###',
      '####..o....o..####',
      '####....t.....####',
      '####....S.....####',
      '####..........####',
    ],
  },
  {
    // 火船断链（第四关 · 斜错双战船铁索联桥）：三道过船跳板串联左右战船，西船舱空心暗壁 + 东船火油炸木障双秘库
    id: 'wl_fireship', name: '火船断链', locale: 'wl_dock', kind: 'fight', stages: 1, seed: 7339, time: 'night', weather: 'mist', pit: 'water',
    rows: [
      '#####..E..~~~#####',
      '#####.....~~~#####',
      '###..o....===....E',
      'E.........~~~..o..',
      '####......~~~..j..',
      '#.$?......===.....',
      '####..o...~~~.####',
      '###.......~~~!X.$#',
      '###...j...~~~.####',
      '####......===.....',
      '####..o...~~~..o..',
      '####......~~~..j..',
      '###...t...~~~~~~~~',
      '###...S...########',
      '###.......########',
    ],
  },
  {
    // 江岸屯兵坞（第四关 · 两段江岸水陆军坞）：滩头前寨破敌开营门，北岸船坞东翼双压板开启督造军械库
    id: 'wl_drydock', name: '江岸屯兵坞', locale: 'wl_camp', kind: 'fight', stages: 2, seed: 7357, time: 'night', weather: 'clear', pit: 'water',
    rows: [
      '####...E...#####',
      '####.......#####',
      '###..o...o..####',
      'E..............E',
      '####........####',
      '####.......PG$P#',
      '####........####',
      '#####DDD########',
      '~~............~~',
      '~~..o......o..~~',
      '~~.....t......~~',
      '~~..j......j..~~',
      '###..........###',
      '####...S.....###',
      '####.........###',
      '####.........###',
      '####.........###',
    ],
  },
  {
    // 锁江水门（第四关 · 倒T连环水闸船坞）：江水割裂左右船台，东岸转闸排干西北浸水栈道直登藏宝楼船
    id: 'wl_sluice', name: '锁江水门', locale: 'wl_dock', kind: 'fight', stages: 1, seed: 7373, time: 'night', weather: 'clear', pit: 'water',
    rows: [
      '#####~~~...E.####',
      '#####~~~.....####',
      '#.$..www..o..####',
      '#....~~~........E',
      '~~~~~~~~..W..j...',
      '~~~~~~~~===~~~~~~',
      '~~~~~~~~===~~~~~~',
      'E....~~.......###',
      '..o..~~...o...###',
      '.....==.......###',
      '..j..~~.......###',
      '####.~~..t....###',
      '####.~~......####',
      '~~~~~~~..S...####',
      '~~~~~~~......####',
      '~~~~~~~......####',
    ],
  },
  {
    // 赤壁鼓台（第四关 · L形两段水陆鼓台）：前寨强攻破中门，后寨军中三铜铃听声开启西北帅帐秘库
    id: 'wl_drumcamp', name: '赤壁鼓台', locale: 'wl_camp', kind: 'fight', stages: 2, seed: 7391, time: 'night', weather: 'mist', pit: 'water',
    rows: [
      '#####...E...####',
      '#####.......####',
      '#.$#..b.....####',
      '#..G........o..E',
      '####....b.......',
      '###.............',
      '###..o....b...##',
      '#####DDD########',
      '###............#',
      '###..o.....j...#',
      '##.....t......##',
      '##..j......o..##',
      '###..........###',
      '####...S.....###',
      '####.........###',
      '####.........###',
      '####.........###',
    ],
  },
  {
    id: 'wl_flagship', name: '楼船甲板', locale: 'wl_tower', kind: 'boss', stages: 1, seed: 7401, time: 'night', weather: 'clear', pit: 'water',
    rows: [
      '######..E...######',
      '######......######',
      '######......######',
      '~........B.......~',
      '~................~',
      '~...o........o...~',
      '~................~',
      '~................E',
      '~................~',
      '~................~',
      '~...o........o...~',
      '~................~',
      '~................~',
      '####..............',
      '####....S......###',
      '####...........###',
    ],
  },
  {
    id: 'yard_4', name: '泊船小栈', locale: 'wl_dock', kind: 'calm', stages: 1, seed: 7507, time: 'night', weather: 'clear', pit: 'water',
    rows: [
      '####.E...~~~',
      '####.....~~~',
      '####.....~~~',
      '...........E',
      '............',
      '.....C......',
      '............',
      '##.......~~~',
      '##...S...~~~',
      '~........~~~',
    ],
  },
  // ---------------------------------------------------------------- Region 5 · 许都雪 · 崔府 (cx_court / cx_gallery / cx_vault)
  {
    id: 'cx_study', name: '三进书院', locale: 'cx_court', kind: 'fight', stages: 2, seed: 8101, time: 'night', weather: 'snow',
    rows: [
      '####..E.#######',
      '####....#######',
      '####....#....$.',
      'E.....b.G......',
      '........G......',
      '...b....#######',
      '.....o..b......',
      '####DDD########',
      '...............',
      '####.o...o...##',
      '####.........##',
      '###....t.....##',
      '.....j.........',
      '###..........##',
      '###....S.....##',
      '###..........##',
      '###..........##',
    ],
  },
  {
    id: 'cx_garden', name: '回廊雪园', locale: 'cx_gallery', kind: 'fight', stages: 1, seed: 8209, time: 'night', weather: 'snow', pit: 'water',
    rows: [
      '#######..E...####',
      '#######......####',
      '#######......####',
      'E...............E',
      '....o......o.....',
      '.....~~~~~~~.....',
      '.....~~~~~~~.....',
      '..W..==ww$~~..j..',
      '.....~~~~~~~.....',
      '.....~~~~~~~.....',
      '....o......o.....',
      '.................',
      '####....t........',
      '####....S......##',
      '####...........##',
    ],
  },
  {
    id: 'cx_alley', name: '深宅夹道', locale: 'cx_gallery', kind: 'fight', stages: 1, seed: 8307, time: 'night', weather: 'mist',
    rows: [
      '######..E...####',
      '######......####',
      '######.o....####',
      '.$..?..........E',
      '....#...........',
      '#####....t......',
      'E...............',
      '.......o....####',
      '............#.$.',
      '............G...',
      '....j.....P.G.P.',
      '............G...',
      '###.........####',
      '###....S....####',
      '###.........####',
    ],
  },
  {
    // 竹林曲径（第五关 · S形雪夜竹园折廊）：两段深园折曲推进，南园东壁空心粉墙 + 北园西翼火油木栅双秘藏
    id: 'cx_bamboo', name: '竹林曲径', locale: 'cx_gallery', kind: 'fight', stages: 2, seed: 8321, time: 'night', weather: 'snow',
    rows: [
      '###..E.....#####',
      '###........#####',
      '###..o.....#####',
      'E....t.....#####',
      '####..j.........',
      '#.$X!.......####',
      '####........####',
      '#####DDD########',
      '###...........##',
      '###..o....j...##',
      '###.........####',
      '###...t.....?.$#',
      '###.........####',
      '####..o...j..###',
      '####.........###',
      '####...S.....###',
      '####.........###',
    ],
  },
  {
    // 九曲冰池（第五关 · 回字冰荷孤屿）：冰冻荷池合围中庭雪亭孤岛，西岸转闸排退冰水露出青石暗阶登亭夺秘宝
    id: 'cx_lotus', name: '九曲冰池', locale: 'cx_gallery', kind: 'fight', stages: 1, seed: 8339, time: 'night', weather: 'snow', pit: 'water',
    rows: [
      '#####...E...######',
      '#####.......######',
      '####..o...o...####',
      'E................E',
      '###..~~~~~~~~..###',
      '##...~~....~~...##',
      '##.W.ww..$.~~.o.##',
      '##...ww....~~...##',
      '##.o.~~~~~~~~.j.##',
      '##...~~~~~~~~...##',
      '###............###',
      '####..j....o..####',
      '####....t.....####',
      '####....S.....####',
      '####..........####',
    ],
  },
  {
    // 闻声藏经院（第五关 · 两段阶梯雪夜经阁）：前庭破敌开中门，后庭雪夜三铜铃听声解锁东厢朱漆藏经密室
    id: 'cx_archive', name: '闻声藏经院', locale: 'cx_court', kind: 'fight', stages: 2, seed: 8357, time: 'night', weather: 'clear',
    rows: [
      '####...E...#####',
      '####.......#####',
      '###..b.....#.$.#',
      'E..........G...#',
      '.....o.....G...#',
      '..b........#####',
      '........b....###',
      '#####DDD########',
      '###...........##',
      '###..o....o...##',
      '##.....t......##',
      '##..j......j..##',
      '###..........###',
      '####...S.....###',
      '####.........###',
      '####.........###',
      '####.........###',
    ],
  },
  {
    // 雪榭断桥（第五关 · 寒塘纵贯东岸雪榭）：寒塘分割主院与东岸水榭，北岸斩绳落吊桥登东北雪榭孤岛取秘匣
    id: 'cx_pavilion', name: '雪榭断桥', locale: 'cx_gallery', kind: 'fight', stages: 1, seed: 8371, time: 'night', weather: 'mist', pit: 'water',
    rows: [
      '#####...E..~~####',
      '#####......~~####',
      '####..o....~~..$#',
      'E.........r--...#',
      '....j......--...#',
      '...........~~####',
      '###..o.....~~...E',
      '###........~~..o.',
      '###........==....',
      '###..t.....~~..j.',
      '###........~~####',
      '###..o.....~~####',
      '###........~~####',
      '###...S....######',
      '###........######',
      '###........######',
    ],
  },
  {
    // 外府刀库（第五关 · 超宽双院回廊刀库）：中央独栋二层亭阁构成环绕战局，西翼双压板开启护院武库 + 东翼空心粉墙暗阁
    id: 'cx_vault_wing', name: '外府刀库', locale: 'cx_court', kind: 'fight', stages: 1, seed: 8389, time: 'night', weather: 'snow',
    rows: [
      '#####...E...######',
      '#####.......######',
      '####..o...j...####',
      'E................E',
      '####...####..#####',
      '#P$GP..####..?.$.#',
      '####...####..#####',
      '###..o.####..o.###',
      '###............###',
      '....j.......t.....',
      '..................',
      '####..o....o..####',
      '####..........####',
      '####....S.....####',
      '####..........####',
    ],
  },
  {
    id: 'cx_hall', name: '藏刀阁', locale: 'cx_vault', kind: 'boss', stages: 1, seed: 8403, time: 'night', weather: 'clear',
    rows: [
      '######..E.....####',
      '######........####',
      '######........####',
      '.........B........',
      '..................',
      '....o........o....',
      '..................',
      '.................E',
      '..................',
      '..................',
      '....o........o....',
      '..................',
      '..................',
      '####..............',
      '####....S.......##',
      '####............##',
    ],
  },
  {
    id: 'yard_5', name: '梅雪偏院', locale: 'cx_court', kind: 'calm', stages: 1, seed: 8501, time: 'night', weather: 'snow',
    rows: [
      '#####.E..###',
      '#####....###',
      '#####....###',
      '...........E',
      '............',
      '.....C......',
      '............',
      '##........##',
      '##...S....##',
      '##........##',
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
