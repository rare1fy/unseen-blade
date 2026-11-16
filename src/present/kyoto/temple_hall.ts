// 古寺的建筑（temple 代理）：本堂（主地标）、钟楼、手水舍、五重塔（远景）、千本鸟居。
// 都朝 +z（战斗镜头）开口；坐标用米，尺寸用格。返回发光点（米），由场景文件挂灯。
import { M, type W } from '../scenes/props';
import { masonry } from '../scenes/k_forest';
import type { Ctx } from '../scenes/stage';
import { TC, roof, torii, chochin, type P3, at } from './temple_kit';

/** glowing paper at a warm mid tone (lit from inside, but below the bloom threshold: the lattice and the shape stay readable) */
const SHOJI = 0xa0602c, PAPER = 0xb88a50;

/**
 * 本堂：石基坛 + 三级台阶，木回廊，六根朱柱一排，白壁、发光障子、正中一间敞开（里面金色佛像与供灯），柱头斗栱（白色端头），
 * 深出檐的入母屋大瓦顶（下三段四面收，上段两面收，两端山墙带金悬鱼），正中挂大提灯。x = 中心，zf = 基坛前沿。
 */
export function hondo(c: Ctx, x: number, zf: number) {
  const w = c.w, X = M(x), Z1 = M(zf), HW = M(7.4), D = M(5.0), Z0 = Z1 - D;
  // the stone podium with coursed joints and a light coping, three steps in front
  masonry(w, X - HW, -1, Z0, X + HW, 5, Z1, TC.stone, TC.mortar, { ch: 3, cl: 14, cap: TC.stoneL });
  for (let k = 0; k < 3; k++) { const y1 = 1 + 2 * k, z1 = Z1 + 12 - 4 * k; w.box(X - 30, -1, Z1 + 1, X + 30, y1, z1, TC.stoneD).box(X - 30, y1, z1 - 3, X + 30, y1, z1, TC.stoneL); }
  w.box(X - 32, -1, Z1 + 1, X - 31, 7, Z1 + 12, TC.stoneD).box(X + 31, -1, Z1 + 1, X + 32, 7, Z1 + 12, TC.stoneD);
  // the veranda floor (dark boards with a light edge beam) and its low vermilion rail with gaps at the steps
  const F = 6, ZC = Z1 - 9, ZB = Z0 + 6;
  w.box(X - HW + 3, F, Z0 + 3, X + HW - 3, F + 1, Z1 - 2, TC.wood).box(X - HW + 3, F + 1, Z1 - 3, X + HW - 3, F + 1, Z1 - 2, TC.woodL);
  for (const s of [-1, 1]) {
    const a = s < 0 ? X - HW + 3 : X + 33, b = s < 0 ? X - 33 : X + HW - 3;
    w.box(a, F + 2, Z1 - 3, b, F + 2, Z1 - 3, TC.verm).box(a, F + 6, Z1 - 3, b, F + 7, Z1 - 3, TC.verm);
    for (let u = a; u <= b; u += 16) w.box(u, F + 2, Z1 - 3, u + 1, F + 7, Z1 - 3, TC.vermD);
  }
  // columns: a front row, a back row and the side rows, each on a stone base
  const CH = F + 34, xs = [-6.6, -4.3, -1.75, 1.75, 4.3, 6.6].map(v => X + M(v));
  const col = (cx: number, cz: number) => { w.box(cx - 3, F + 2, cz - 3, cx + 2, F + 2, cz + 2, TC.stoneL); w.box(cx - 2, F + 3, cz - 2, cx + 1, CH, cz + 1, TC.verm); };
  for (const cx of xs) { col(cx, ZC); col(cx, ZB); }
  for (const cx of [xs[0], xs[5]]) for (const cz of [ZC - 22, ZC - 44]) col(cx, cz);
  // walls between the front columns (1 cell behind the column faces): white plaster in the outer bays with vermilion nuki rails,
  // glowing shoji in the middle bays, the centre bay open onto the dim hall
  const WZ = ZC - 1, rails = [F + 3, F + 17, CH - 6];
  const bay = (a: number, b: number, kind: 'wall' | 'shoji' | 'open') => {
    const x0 = a + 2, x1 = b - 3;
    if (kind === 'wall') {
      w.box(x0, F + 3, WZ - 1, x1, CH - 4, WZ, TC.plaster);
      w.box(x0, F + 3, WZ - 1, x1, F + 5, WZ, TC.woodD);
      for (const r of rails.slice(1)) w.box(x0, r, WZ, x1, r + 2, WZ + 1, TC.verm);
    } else if (kind === 'shoji') {
      w.box(x0, F + 3, WZ - 1, x1, CH - 4, WZ - 1, SHOJI, 1);
      // the lattice: a frame and a few wide panes (every 7 cells across, 9 up), dark wood
      w.box(x0, F + 3, WZ, x1, F + 5, WZ, TC.woodD).box(x0, CH - 6, WZ, x1, CH - 4, WZ, TC.woodD);
      for (let u = x0; u <= x1; u += 7) w.box(u, F + 3, WZ, u, CH - 4, WZ, TC.woodD);
      w.box(x1, F + 3, WZ, x1, CH - 4, WZ, TC.woodD);
      for (let y = F + 14; y < CH - 6; y += 10) w.box(x0, y, WZ, x1, y, WZ, TC.woodD);
    } else {
      w.box(x0, CH - 6, WZ, x1, CH - 4, WZ + 1, TC.verm);
    }
  };
  bay(xs[0], xs[1], 'wall'); bay(xs[4], xs[5], 'wall'); bay(xs[1], xs[2], 'shoji'); bay(xs[3], xs[4], 'shoji'); bay(xs[2], xs[3], 'open');
  // side and back walls: plaster with a dark wainscot, rails on the outside
  w.box(xs[0] - 1, F + 3, ZB, xs[0], CH - 4, ZC - 2, TC.plaster).box(xs[5] - 1, F + 3, ZB, xs[5], CH - 4, ZC - 2, TC.plaster);
  w.box(xs[0], F + 3, ZB - 1, xs[5], CH - 4, ZB, TC.plaster);
  for (const sx of [xs[0] - 2, xs[5] + 1]) for (const r of rails.slice(1)) w.box(sx, r, ZB, sx, r + 2, ZC - 2, TC.verm);
  // inside: a dark floor and back, the altar dais, a gilded seated figure (lotus base in two tiers, robe, head, halo), two lamps
  const IZ = ZB + 8, BX = X;
  w.box(xs[2] + 2, F + 2, ZB + 1, xs[3] - 3, CH - 7, ZB + 2, 0x2a201c);
  w.box(BX - 12, F + 2, IZ - 4, BX + 12, F + 6, IZ + 6, TC.black).box(BX - 12, F + 6, IZ + 5, BX + 12, F + 6, IZ + 6, TC.goldD);
  w.box(BX - 8, F + 7, IZ - 3, BX + 8, F + 9, IZ + 4, TC.goldD).box(BX - 6, F + 10, IZ - 2, BX + 6, F + 11, IZ + 3, TC.gold);
  w.box(BX - 5, F + 12, IZ - 2, BX + 5, F + 18, IZ + 2, TC.gold).box(BX - 3, F + 19, IZ - 1, BX + 3, F + 23, IZ + 2, TC.gold);
  w.box(BX - 2, F + 24, IZ - 1, BX + 2, F + 28, IZ + 2, TC.gold).box(BX - 1, F + 29, IZ, BX + 1, F + 30, IZ + 1, TC.goldD);
  w.box(BX - 7, F + 19, IZ - 3, BX + 7, F + 30, IZ - 3, TC.goldD).box(BX - 5, F + 21, IZ - 2, BX + 5, F + 28, IZ - 2, 0x9a6a34, 1);
  for (const s of [-1, 1]) w.box(BX + s * 10 - 1, F + 7, IZ + 4, BX + s * 10, F + 13, IZ + 5, TC.goldD).set(BX + s * 10, F + 14, IZ + 5, TC.lampCore, 1);
  // the head beam, brackets on every front column (two wide steps out toward +z, white ends) and the dark frieze up to the eave
  w.box(xs[0] - 3, CH + 1, ZB - 2, xs[5] + 3, CH + 3, ZC + 2, TC.verm);
  w.box(xs[0] - 3, CH + 4, ZB - 4, xs[5] + 3, CH + 9, ZC + 3, TC.woodD);
  for (const cx of xs) {
    w.box(cx - 3, CH + 4, ZC - 1, cx + 2, CH + 5, ZC + 5, TC.verm).box(cx - 3, CH + 4, ZC + 5, cx + 2, CH + 5, ZC + 5, TC.endW);
    w.box(cx - 2, CH + 6, ZC + 1, cx + 1, CH + 8, ZC + 9, TC.verm).box(cx - 2, CH + 6, ZC + 9, cx + 1, CH + 8, ZC + 9, TC.endW);
  }
  for (let i = 0; i < xs.length - 1; i++) { const m = (xs[i] + xs[i + 1]) >> 1; w.box(m - 2, CH + 4, ZC + 3, m + 1, CH + 6, ZC + 3, TC.gold); }
  // the roof: a deep eave over everything, irimoya plates
  const RY = CH + 10;
  w.box(xs[0] - 6, CH + 9, ZB - 8, xs[5] + 6, RY - 1, ZC + 12, TC.woodD);
  roof(w, X - HW - 14, X + HW + 14, Z0 - 14, Z1 + 16, RY, { plates: [[0, 4], [8, 4], [7, 4], [7, 5], [7, 5], [7, 5], [7, 5], [6, 5]], hip: 3, up: [26, 12, 4], ridgeH: 6, gable: TC.plaster, gegyo: true });
  // the big paper lantern under the eave in the open bay, and two smaller ones at the outer bays
  const big = chochin(w, X, CH + 3, ZC + 6, TC.red, 12);
  const sm = [chochin(w, xs[1], CH, ZC + 6, PAPER, 7), chochin(w, xs[4], CH, ZC + 6, PAPER, 7)];
  return { big, sm, inner: at(BX, F + 18, IZ + 8), shoji: [at((xs[1] + xs[2]) >> 1, F + 20, WZ + 3), at((xs[3] + xs[4]) >> 1, F + 20, WZ + 3)] };
}

/** 钟楼：两层石基，四根朱柱和贯，悬着青铜大钟（三段收分、钟座与撞座）和横吊的撞木，四面收的瓦顶带翘角 */
export function shoro(w: W, x: number, z: number) {
  const X = M(x), Z = M(z), B = 19;
  masonry(w, X - B, -1, Z - B, X + B, 5, Z + B, TC.stone, TC.mortar, { ch: 3, cl: 10, cap: TC.stoneL });
  w.box(X - B + 3, 6, Z - B + 3, X + B - 3, 7, Z + B - 3, TC.stoneL);
  const P = 14, H = 44;
  for (const a of [-P, P]) for (const b of [-P, P]) w.box(X + a - 2, 8, Z + b - 2, X + a + 1, H, Z + b + 1, TC.verm);
  for (const y of [16, H - 6]) { w.box(X - P - 3, y, Z - P - 1, X + P + 2, y + 1, Z - P, TC.verm).box(X - P - 3, y, Z + P - 1, X + P + 2, y + 1, Z + P, TC.verm); w.box(X - P - 1, y, Z - P - 3, X - P, y + 1, Z + P + 2, TC.verm).box(X + P - 1, y, Z - P - 3, X + P, y + 1, Z + P + 2, TC.verm); }
  w.box(X - P - 3, H + 1, Z - P - 3, X + P + 2, H + 3, Z + P + 2, TC.woodD);
  // the bell
  const by = H - 4;
  w.box(X - 1, by - 2, Z - 1, X, H, Z, TC.black);
  w.box(X - 5, by - 6, Z - 5, X + 4, by - 3, Z + 4, TC.verdiD).box(X - 6, by - 20, Z - 6, X + 5, by - 7, Z + 5, TC.verdi);
  w.box(X - 7, by - 24, Z - 7, X + 6, by - 21, Z + 6, TC.verdiD).box(X - 6, by - 14, Z - 6, X + 5, by - 13, Z + 5, TC.verdiL);
  w.box(X - 2, by - 19, Z + 6, X + 1, by - 16, Z + 6, TC.verdiL);
  // the striker log, hung level on two ropes toward +z
  w.box(X - 10, by - 18, Z + 10, X + 10, by - 16, Z + 12, TC.woodL).box(X - 8, by - 15, Z + 11, X - 8, H, Z + 11, TC.ochre).box(X + 8, by - 15, Z + 11, X + 8, H, Z + 11, TC.ochre);
  roof(w, X - B - 8, X + B + 8, Z - B - 8, Z + B + 8, H + 4, { plates: [[0, 3], [7, 4], [6, 4], [6, 4], [5, 4]], hip: 2, up: [14, 7, 3], ridgeH: 4, gable: TC.plaster, gegyo: true });
}

/** 手水舍：石水盘（满水）、竹引水管、四根木柱、两面坡瓦顶、檐下一盏提灯。正面朝 −x（面向庭院中央）。返回 [水面中心, 灯] */
export function chozuya(c: Ctx, x: number, z: number) {
  const w = c.w, X = M(x), Z = M(z), BX = 8, BZ = 13;
  // the basin: one long stone block with a light rim, the water a few cells below its lip
  w.box(X - BX, -1, Z - BZ, X + BX, 9, Z + BZ, TC.stone).box(X - BX, 10, Z - BZ, X + BX, 10, Z + BZ, TC.stoneL);
  w.box(X - BX + 2, 6, Z - BZ + 2, X + BX - 2, 10, Z + BZ - 2, null);
  w.box(X - BX - 2, -1, Z - BZ - 2, X + BX + 2, 0, Z + BZ + 2, TC.stoneD);
  c.water((X - BX + 2) * 0.07, (Z - BZ + 2) * 0.07, (X + BX - 1) * 0.07, (Z + BZ - 1) * 0.07, 0x4a7a8a);
  // the bamboo spout from the back (+x, away from the courtyard), ladles laid across the front rim (−x, toward the courtyard)
  w.box(X + 2, 12, Z - 1, X + BX + 6, 13, Z, TC.bamboo).box(X + BX + 5, -1, Z - 1, X + BX + 6, 12, Z, TC.bamboo).box(X + 2, 11, Z - 1, X + 2, 11, Z, TC.bambooD);
  for (const dz of [-8, -3, 3, 8]) w.box(X - BX - 3, 11, Z + dz, X - BX + 1, 11, Z + dz, TC.ochre).box(X - BX + 1, 11, Z + dz - 1, X - BX + 3, 12, Z + dz + 1, TC.ochre);
  // posts, tie beams and the gable roof (ridge along z)
  const PX = 13, PZ = 18, H = 34;
  for (const a of [-PX, PX]) for (const b of [-PZ, PZ]) w.box(X + a - 1, -1, Z + b - 1, X + a + 1, H, Z + b + 1, TC.wood);
  for (const a of [-PX, PX]) w.box(X + a - 1, H - 4, Z - PZ - 3, X + a + 1, H - 2, Z + PZ + 3, TC.woodD);
  for (const b of [-PZ, PZ]) w.box(X - PX - 3, H - 4, Z + b - 1, X + PX + 3, H - 2, Z + b + 1, TC.woodD);
  w.box(X - PX - 1, H - 1, Z - PZ - 1, X + PX + 1, H + 1, Z + PZ + 1, TC.woodD);
  roof(w, X - PX - 9, X + PX + 9, Z - PZ - 8, Z + PZ + 8, H + 2, { plates: [[0, 3], [6, 3], [6, 4], [6, 4]], hip: 1, up: [12, 6, 2], ridgeH: 4, gable: TC.woodL, alongZ: true });
  const lamp = chochin(w, X - PX - 1, H - 5, Z, PAPER, 6);
  return { water: [x, 0.5, z] as P3, lamp };
}

/**
 * 五重塔（远景剪影）：石基坛，五层塔身（朱柱白壁、正中门），每层一顶带翘角的四面瓦檐，往上逐层收窄，顶上相轮（九个同宽的环板，
 * 不收分，所以不是台阶）和金色水烟、宝珠。
 */
export function pagoda(w: W, x: number, z: number) {
  const X = M(x), Z = M(z);
  masonry(w, X - 30, -1, Z - 30, X + 30, 7, Z + 30, TC.stone, TC.mortar, { ch: 4, cl: 12, cap: TC.stoneL });
  let y = 8, hw = 22;
  for (let i = 0; i < 5; i++) {
    const bh = i === 0 ? 30 : 20;
    w.box(X - hw, y, Z - hw, X + hw, y + bh, Z + hw, TC.plaster);
    for (const a of [-hw, hw]) for (const b of [-hw, hw]) w.box(X + a - 1, y, Z + b - 1, X + a + 1, y + bh, Z + b + 1, TC.verm);
    for (const s of [-1, 1]) { w.box(X - 5, y, Z + s * hw, X + 5, y + bh - 4, Z + s * hw, TC.vermD).box(X + s * hw, y, Z - 5, X + s * hw, y + bh - 4, Z + 5, TC.vermD); }
    w.box(X - hw - 1, y + bh - 3, Z - hw - 1, X + hw + 1, y + bh, Z + hw + 1, TC.verm);
    w.box(X - hw - 4, y + bh + 1, Z - hw - 4, X + hw + 4, y + bh + 4, Z + hw + 4, TC.woodD);
    const e = hw + 18;
    y = roof(w, X - e, X + e, Z - e, Z + e, y + bh + 5, { plates: [[0, 3], [8, 3], [7, 3]], hip: 3, up: [14, 6, 3], ridgeH: 0 });
    hw -= 2;
  }
  w.box(X - 6, y, Z - 6, X + 6, y + 3, Z + 6, TC.tileD);
  w.box(X - 1, y + 4, Z - 1, X + 1, y + 50, Z + 1, TC.bronze);
  for (let k = 0; k < 9; k++) w.box(X - 4, y + 7 + k * 4, Z - 4, X + 4, y + 7 + k * 4, Z + 4, TC.bronze);
  w.box(X - 3, y + 45, Z - 3, X + 3, y + 48, Z + 3, TC.goldD).box(X - 1, y + 51, Z - 1, X + 1, y + 53, Z + 1, TC.gold);
}

/** 千本鸟居：一串朱红鸟居沿 z 排开（从 z0 往 −z），石板小径穿过；返回最前一座的位置 */
export function toriiTunnel(w: W, x: number, z0: number, n: number, gap: number, h: number, span: number) {
  for (let i = 0; i < n; i++) torii(w, x, z0 - i * gap, h - i * 0.04, span, { post: 2 });
  const X = M(x), S = M(span / 2) - 3;
  for (let z = M(z0 - (n - 1) * gap) - 6; z <= M(z0) + 10; z++) w.set(X - S, -1, z, TC.kerb).set(X + S, -1, z, TC.kerb);
  for (let z = M(z0 - (n - 1) * gap) - 6, k = 0; z <= M(z0) + 10; z += 9, k++) w.box(X - S + 1, -1, z, X + S - 1, -1, z + 7, k & 1 ? TC.slab[0] : TC.slab[2]).box(X - S + 1, -1, z + 8, X + S - 1, -1, z + 8, TC.joint);
}
