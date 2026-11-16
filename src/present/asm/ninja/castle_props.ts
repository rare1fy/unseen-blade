// 忍之章 · 城郭的道具组（castle 代理）：军务类（篝火、武器架、旗指物、拒马、阵幕、具足、番所、太鼓橹、马厩）与橹。
// 每个组以 (p.x, p.z) 为中心；fr() 给出镜像坐标 a（a 越大离战斗区越远），所以开口面总朝战斗区。
// 屋檐朝战斗区一侧的外伸量都压在 foot.w / 2 以内（插槽把组推到战斗区外 0.35 m + foot.w / 2），否则檐角会探进战斗区被拒。
import { M } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { roof } from '../../kyoto/temple_kit';
import type { Group, Place } from '../types';
import type { Ctx } from '../../scenes/stage';
import { CC, fr, ishigaki, storey, retile, mon, nsq, hei, andon } from './castle_kit';
import { basket, nijuYagura, crownRoof } from './castle_keep';

const at = (X: number, Y: number, Z: number): [number, number, number] => [(X + 0.5) * CELL, (Y + 0.5) * CELL, (Z + 0.5) * CELL];
const lamp = (c: Ctx, p: Place, pt: [number, number, number], k = 1, d = 4.5) => { if (p.lamp > 0.3) c.light(pt, 0xffa050, 2.4 * p.lamp * k, d); };

export const MILITARY: Group[] = [
  { id: 'sumi_yagura', name: '隅橹', tags: ['building', 'tall', 'yagura'], foot: { w: 3.4, d: 3.4 }, h: 5.4, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    // a corner turret: two-tier ishigaki, one storey (black boards, white plaster, windows and ports toward the floor and the camera),
    // an irimoya roof with gold shachi; a nobori pole at its foot on the camera side
    const w = c.w, X = M(p.x), Z = M(p.z), F = fr(w, X, p.s);
    const b = ishigaki(w, X - 22, Z - 22, X + 22, Z + 22, -1, [{ h: 11, inset: 0 }, { h: 9, inset: 3 }], { seed: p.seed });
    const S = 15, open = p.s > 0 ? 'sw' : p.s < 0 ? 'se' : 's';
    storey(w, X - S, Z - S, X + S, Z + S, b.y, 24, { bh: 11, win: 12, winH: 5, ports: true, open, lit: p.lamp > 0.6 });
    crownRoof(c, X - S - 6, X + S + 6, Z - S - 6, Z + S + 6, b.y + 22, [[0, 4], [5, 4], [5, 4], [5, 4]], 2, [11, 5, 3]);
    F.box(14, 0, Z + 23, 15, 0, Z + 24, CC.st[0]);
  } },
  { id: 'niju_yagura', name: '二重橹', tags: ['building', 'tall', 'yagura'], foot: { w: 4.0, d: 3.2 }, h: 6.6, kinds: ['back', 'corner'], size: 'L', max: 2, weight: 2.2, build(c, p) { nijuYagura(c, p); } },
  { id: 'kagaribi', name: '篝火', tags: ['light', 'fire'], foot: { w: 1.4, d: 1.4 }, h: 1.8, kinds: ['wing', 'back'], size: 'S', max: 2, weight: 1.2, build(c, p) { basket(c, p, M(p.x), M(p.z)); } },
  { id: 'yarigake', name: '枪架', tags: ['weapon'], foot: { w: 2.4, d: 1.2 }, h: 2.8, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a spear rack facing the camera: two posts on sills, a top rail and a foot trough, six spears (steel heads, two in black sheaths, a
    // vermilion shaft), a lacquered arrow box at one end
    const w = c.w, X = M(p.x), Z = M(p.z), L = 15;
    w.box(X - L - 1, -1, Z - 6, X - L + 1, 1, Z + 6, CC.woodD).box(X + L - 1, -1, Z - 6, X + L + 1, 1, Z + 6, CC.woodD);
    w.box(X - L, 2, Z - 1, X - L + 1, 30, Z, CC.wood).box(X + L - 1, 2, Z - 1, X + L, 30, Z, CC.wood);
    w.box(X - L - 2, 28, Z - 1, X + L + 2, 30, Z, CC.woodD).box(X - L, 2, Z - 2, X + L, 4, Z + 1, CC.woodD).box(X - L, 20, Z - 1, X + L, 20, Z, CC.woodD);
    for (let i = 0; i < 6; i++) {
      const x = X - L + 4 + i * 5;
      w.box(x, 5, Z + 1, x, 33, Z + 1, i === 2 ? CC.vermD : CC.boardD);
      if (i === 1 || i === 4) w.box(x, 34, Z + 1, x, 37, Z + 1, CC.board).box(x, 34, Z + 2, x, 35, Z + 2, CC.board);
      else w.box(x, 34, Z + 1, x, 37, Z + 1, CC.ironL).set(x, 38, Z + 1, 0xd8dce4);
    }
    // a lacquered arrow box standing in front of the rack's floor end, three arrows in it
    const bx = X - (p.s || 1) * 10;
    w.box(bx - 4, -1, Z + 3, bx + 4, 8, Z + 8, CC.board).box(bx - 4, 9, Z + 3, bx + 4, 9, Z + 8, CC.boardL).box(bx - 4, 4, Z + 8, bx + 4, 4, Z + 8, CC.gold);
    for (const dx of [-2, 0, 2]) w.box(bx + dx, 10, Z + 5, bx + dx, 15, Z + 5, CC.pale).set(bx + dx, 16, Z + 5, CC.cloth);
  } },
  { id: 'nobori', name: '旗指物', tags: ['banner'], foot: { w: 2.8, d: 1.0 }, h: 3.9, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
    // three tall banner poles in stone weights, each with a top arm; the cloth hangs from the arm along the pole (white with a vermilion
    // head band and a black crest block, or indigo with a white band), alternating; tied to the pole every half metre
    const w = c.w, X = M(p.x), Z = M(p.z), alt = p.rnd(1) < 0.5;
    for (let i = 0; i < 3; i++) {
      const x = X - 16 + i * 16, H = 50 + (i === 1 ? 4 : 0);
      w.box(x - 3, -1, Z - 3, x + 3, 3, Z + 3, CC.st[i % 3]).box(x - 3, 4, Z - 3, x + 3, 4, Z + 3, CC.stTop);
      w.box(x, 5, Z, x, H, Z, CC.boardD);
      const ax = x + 9 * (p.s || 1);
      w.box(Math.min(x, ax), H - 1, Z, Math.max(x, ax), H - 1, Z, CC.boardD);
      const ind = (i & 1) === (alt ? 1 : 0), cloth = ind ? CC.indigo : CC.cloth, band = ind ? CC.cloth : CC.verm;
      const a = Math.min(x, ax) + (p.s >= 0 ? 1 : 0), b = Math.max(x, ax) - (p.s >= 0 ? 0 : 1), yb = H - 30;
      w.box(a, yb, Z, b, H - 2, Z, cloth).box(a, H - 6, Z, b, H - 2, Z, band);
      w.box(a + 2, H - 16, Z, b - 2, H - 11, Z, ind ? CC.indigoL : CC.board);
      for (let y = yb + 2; y < H - 2; y += 7) w.set(x, y, Z, CC.cloth);
    }
  } },
  { id: 'kyoba', name: '拒马', tags: ['barricade', 'low'], foot: { w: 2.6, d: 1.3 }, h: 1.2, kinds: ['wing', 'back'], size: 'S', max: 2, build(c, p) {
    // a stake barricade: two sills, two rails, sharpened stakes standing in two heights (the points one cell thinner), a rope binding
    const w = c.w, X = M(p.x), Z = M(p.z), L = 17;
    w.box(X - L, -1, Z - 7, X - L + 2, 1, Z + 7, CC.woodD).box(X + L - 2, -1, Z - 7, X + L, 1, Z + 7, CC.woodD);
    w.box(X - L, 5, Z - 1, X + L, 6, Z, CC.wood).box(X - L, 11, Z - 1, X + L, 12, Z, CC.wood);
    for (let i = 0; i < 9; i++) {
      const x = X - L + 1 + i * 4, tall = i & 1 ? 14 : 11;
      w.box(x, -1, Z - 1, x + 1, tall, Z, CC.pale).box(x, tall + 1, Z - 1, x, tall + 2, Z - 1, CC.pale);
    }
    w.box(X - L, 8, Z + 1, X + L, 8, Z + 1, CC.rope);
  } },
  { id: 'jinmaku', name: '阵幕', tags: ['camp', 'banner'], foot: { w: 3.2, d: 3.2 }, h: 2.0, kinds: ['wing', 'back'], size: 'M', excludes: ['camp2'], build(c, p) {
    // a field-camp enclosure open to the floor: posts, white curtains with a black top band and a big black crest, a rope along the top;
    // inside two camp stools, a command table with a lacquer box, a war fan on a stand
    const w = c.w, X = M(p.x), Z = M(p.z), F = fr(w, X, p.s), R = 21;
    const posts: Array<[number, number]> = [[R, -R], [R, -7], [R, 7], [R, R], [-5, -R], [7, -R], [-5, R], [7, R]];
    for (const [a, z] of posts) F.box(a, -1, Z + z, a + 1, 27, Z + z + 1, CC.woodD).box(a, 28, Z + z, a + 1, 28, Z + z + 1, CC.gold);
    const panel = (a0: number, a1: number, z0: number, z1: number) => {
      F.box(a0, 4, z0, a1, 23, z1, CC.cloth).box(a0, 20, z0, a1, 23, z1, CC.board).box(a0, 4, z0, a1, 4, z1, CC.clothD).box(a0, 24, z0, a1, 24, z1, CC.rope);
    };
    panel(R, R, Z - R, Z + R); panel(-5, R, Z - R, Z - R); panel(-5, R, Z + R, Z + R);
    mon((du, dv) => F.set(R - 1, 12 + dv, Z + du, CC.board), 6);
    mon((du, dv) => F.set(8 + du, 12 + dv, Z + R + 1, CC.board), 6);
    mon((du, dv) => F.set(8 + du, 12 + dv, Z - R - 1, CC.board), 6);
    // stools, table, war fan
    for (const z of [Z - 8, Z + 8]) F.box(10, -1, z - 2, 14, 5, z + 2, CC.boardD).box(10, 6, z - 2, 14, 6, z + 2, CC.verm);
    F.box(0, -1, Z - 4, 6, 9, Z + 4, CC.wood).box(0, 10, Z - 4, 6, 10, Z + 4, CC.woodL).box(2, 11, Z - 2, 4, 13, Z + 2, CC.board).box(2, 14, Z - 2, 4, 14, Z + 2, CC.gold);
    F.box(16, -1, Z - 2, 18, 0, Z + 2, CC.woodD).box(17, 1, Z, 17, 18, Z, CC.boardD);
    F.box(17, 19, Z - 4, 17, 28, Z + 4, CC.board).box(17, 20, Z - 3, 17, 27, Z + 3, CC.gold).box(17, 22, Z - 1, 17, 25, Z + 1, CC.verm);
  } },
  { id: 'yoroi', name: '具足架', tags: ['weapon', 'armour'], foot: { w: 2.2, d: 1.2 }, h: 2.8, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a suit of armour seated on its black lacquer chest, facing the camera, and a bow rack beside it (three long bows standing, grips
    // wrapped, a quiver of arrows)
    const w = c.w, X = M(p.x) - 6 * (p.s || 1), Z = M(p.z);
    w.box(X - 7, -1, Z - 5, X + 7, 8, Z + 5, CC.board).box(X - 7, 8, Z - 5, X + 7, 8, Z + 5, CC.boardL);
    for (const [a, b] of [[-7, -5], [6, -5], [-7, 4], [6, 4]]) w.box(X + a, 0, Z + b, X + a + 1, 8, Z + b + 1, CC.goldD);
    w.box(X - 2, 3, Z + 5, X + 1, 5, Z + 5, CC.gold);
    // the skirt plates, cuirass, shoulder guards, helmet with a neck guard and two straight gold horns, a dark red mask
    w.box(X - 6, 9, Z - 4, X + 6, 16, Z + 4, CC.boardD);
    for (const y of [11, 14]) w.box(X - 6, y, Z + 4, X + 6, y, Z + 4, CC.verm).box(X - 6, y, Z - 4, X - 6, y, Z + 4, CC.verm).box(X + 6, y, Z - 4, X + 6, y, Z + 4, CC.verm);
    w.box(X - 5, 17, Z - 3, X + 5, 24, Z + 3, CC.board).box(X - 5, 19, Z + 3, X + 5, 19, Z + 3, CC.verm).box(X - 5, 22, Z + 3, X + 5, 22, Z + 3, CC.verm);
    for (const s of [-1, 1]) w.box(X + s * 6, 18, Z - 3, X + s * 8, 24, Z + 3, CC.boardD).box(X + s * 6, 20, Z + 3, X + s * 8, 20, Z + 3, CC.verm).box(X + s * 6, 23, Z + 3, X + s * 8, 23, Z + 3, CC.verm);
    w.box(X - 2, 25, Z - 2, X + 2, 27, Z + 3, CC.vermD).box(X - 1, 26, Z + 3, X + 1, 26, Z + 3, CC.boardD);
    w.box(X - 5, 28, Z - 5, X + 5, 29, Z + 4, CC.boardD).box(X - 4, 30, Z - 4, X + 4, 33, Z + 3, CC.board).box(X - 1, 34, Z - 1, X + 1, 34, Z + 1, CC.goldD);
    w.box(X - 3, 31, Z + 4, X + 3, 31, Z + 4, CC.gold).box(X - 3, 32, Z + 4, X - 3, 38, Z + 4, CC.gold).box(X + 3, 32, Z + 4, X + 3, 38, Z + 4, CC.gold).box(X - 1, 32, Z + 4, X + 1, 33, Z + 4, CC.goldL);
    // the bow rack
    const B = X + 16 * (p.s || 1);
    w.box(B - 6, -1, Z - 3, B + 6, 1, Z + 3, CC.woodD).box(B - 6, 2, Z - 1, B - 5, 30, Z, CC.wood).box(B + 5, 2, Z - 1, B + 6, 30, Z, CC.wood).box(B - 6, 26, Z - 1, B + 6, 27, Z, CC.woodD);
    for (const dx of [-3, 0, 3]) w.box(B + dx, 2, Z + 1, B + dx, 33, Z + 1, CC.boardD).box(B + dx, 12, Z + 1, B + dx, 15, Z + 1, CC.verm);
    w.box(B - 2, 2, Z - 3, B + 2, 14, Z - 2, CC.board).box(B - 1, 15, Z - 3, B + 1, 18, Z - 2, CC.pale).box(B - 1, 19, Z - 3, B + 1, 19, Z - 2, CC.cloth);
  } },
  { id: 'bansho', name: '番所', tags: ['building', 'light'], foot: { w: 3.6, d: 3.0 }, h: 4.0, kinds: ['wing', 'back'], size: 'M', build(c, p) {
    // a guardhouse open to the floor: stone footing, a raised plank floor, white walls with black wainscot on three sides, a hip roof;
    // a paper lantern with a black crest under the eave; outside a rack with the three catching poles (T bar, fork, barbed bar)
    const w = c.w, X = M(p.x), Z = M(p.z), F = fr(w, X, p.s), D = 18;
    F.box(-17, -1, Z - D, 17, 3, Z + D, CC.st[1]).box(-17, 3, Z - D, 17, 3, Z + D, CC.stC);
    F.box(-15, 4, Z - D + 2, 15, 5, Z + D - 2, CC.wood).box(-15, 5, Z - D + 2, -15, 5, Z + D - 2, CC.woodL);
    F.box(-22, -1, Z - 6, -18, 1, Z + 6, CC.st[2]);
    F.box(12, 6, Z - D + 2, 15, 34, Z + D - 2, CC.wall).box(12, 6, Z - D + 2, 15, 14, Z + D - 2, CC.board);
    for (const z of [Z - D + 2, Z + D - 5]) F.box(-15, 6, z, 15, 34, z + 3, CC.wall).box(-15, 6, z, 15, 14, z + 3, CC.board);
    F.box(-15, 6, Z - 1, 15, 14, Z, CC.board);
    for (const z of [Z - D + 2, Z + D - 3]) F.box(-16, 4, z - 1, -14, 35, z + 1, CC.woodD);
    F.box(-16, 33, Z - D + 1, 16, 36, Z + D - 1, CC.woodD);
    F.box(13, 20, Z - 4, 15, 26, Z + 4, CC.hole).box(12, 20, Z, 12, 26, Z, CC.board);
    roof(w, X - 22, X + 22, Z - D - 5, Z + D + 5, 37, { plates: [[0, 3], [5, 3], [5, 3], [5, 3]], hip: 2, up: [9, 4, 2], ridgeH: 4, gable: CC.wall });
    retile(w, X - 26, 37, Z - D - 9, X + 26, 60, Z + D + 9);
    const L = andon(w, F.x(-14), 32, Z + 9, 8, { crest: true });
    lamp(c, p, [L[0] - 0.3 * F.k, L[1], L[2]], 1.1);
    // the three-pole rack on the camera side
    const rz = Z + D + 4;
    F.box(-12, -1, rz - 1, -10, 33, rz, CC.woodD).box(8, -1, rz - 1, 10, 33, rz, CC.woodD).box(-12, 30, rz - 1, 10, 31, rz, CC.woodD);
    for (const [a, kind] of [[-6, 0], [-1, 1], [4, 2]] as const) {
      F.box(a, 2, rz + 1, a, 40, rz + 1, CC.pale);
      if (kind === 0) F.box(a - 3, 41, rz + 1, a + 3, 42, rz + 1, CC.iron);
      else if (kind === 1) F.box(a - 2, 41, rz + 1, a + 2, 41, rz + 1, CC.iron).box(a - 2, 42, rz + 1, a - 2, 44, rz + 1, CC.iron).box(a + 2, 42, rz + 1, a + 2, 44, rz + 1, CC.iron);
      else F.box(a - 1, 37, rz + 1, a + 1, 44, rz + 1, CC.iron).box(a - 2, 39, rz + 1, a + 2, 39, rz + 1, CC.ironL).box(a - 2, 42, rz + 1, a + 2, 42, rz + 1, CC.ironL);
    }
  } },
  { id: 'taiko', name: '太鼓橹', tags: ['building', 'tall', 'drum'], foot: { w: 3.2, d: 3.2 }, h: 5.2, kinds: ['wing', 'back', 'corner'], size: 'M', build(c, p) {
    // a drum tower: a low stone base, four posts with tie beams, a plank deck with a black rail, the big drum on its cradle (heads toward
    // the camera, a ring of brass tacks, a vermilion crest), a hip roof
    const w = c.w, X = M(p.x), Z = M(p.z), B = 21;
    ishigaki(w, X - B, Z - B, X + B, Z + B, -1, [{ h: 6, inset: 0 }], { seed: p.seed });
    for (const a of [-16, 14]) for (const b of [-16, 14]) w.box(X + a, 5, Z + b, X + a + 2, 54, Z + b + 2, CC.woodD);
    for (const y of [13, 52]) { w.box(X - 17, y, Z - 16, X + 17, y + 1, Z - 14, CC.wood).box(X - 17, y, Z + 14, X + 17, y + 1, Z + 16, CC.wood); w.box(X - 16, y, Z - 17, X - 14, y + 1, Z + 17, CC.wood).box(X + 14, y, Z - 17, X + 16, y + 1, Z + 17, CC.wood); }
    w.box(X - 18, 22, Z - 18, X + 18, 23, Z + 18, CC.wood).box(X - 18, 23, Z + 18, X + 18, 23, Z + 18, CC.woodL);
    for (const y of [27, 31]) { w.box(X - 18, y, Z + 18, X + 18, y, Z + 18, CC.board).box(X - 18, y, Z - 18, X + 18, y, Z - 18, CC.board).box(X - 18, y, Z - 18, X - 18, y, Z + 18, CC.board).box(X + 18, y, Z - 18, X + 18, y, Z + 18, CC.board); }
    for (let u = -18; u <= 18; u += 6) { w.box(X + u, 24, Z + 18, X + u, 31, Z + 18, CC.boardD).box(X + u, 24, Z - 18, X + u, 31, Z - 18, CC.boardD).box(X + 18, 24, Z + u, X + 18, 31, Z + u, CC.boardD).box(X - 18, 24, Z + u, X - 18, 31, Z + u, CC.boardD); }
    w.box(X - 6, 24, Z - 3, X + 6, 27, Z + 3, CC.woodD);
    w.box(X - 9, 28, Z - 5, X + 9, 44, Z + 5, 0x7a2e22).box(X - 9, 28, Z - 5, X - 7, 30, Z + 5, null).box(X + 7, 28, Z - 5, X + 9, 30, Z + 5, null).box(X - 9, 42, Z - 5, X - 7, 44, Z + 5, null).box(X + 7, 42, Z - 5, X + 9, 44, Z + 5, null);
    for (const s of [-1, 1]) {
      const zf = Z + s * 6;
      w.box(X - 8, 29, zf, X + 8, 43, zf, 0xd8ccb0).box(X - 8, 29, zf, X - 7, 30, zf, null).box(X + 7, 29, zf, X + 8, 30, zf, null).box(X - 8, 42, zf, X - 7, 43, zf, null).box(X + 7, 42, zf, X + 8, 43, zf, null);
      for (let u = -6; u <= 6; u += 3) { w.set(X + u, 28, zf - s, CC.goldD).set(X + u, 44, zf - s, CC.goldD); }
      if (s > 0) mon((du, dv) => w.set(X + du, 36 + dv, zf + 1, CC.verm), 5);
    }
    roof(w, X - 25, X + 25, Z - 25, Z + 25, 55, { plates: [[0, 3], [5, 3], [5, 3], [5, 3]], hip: 4, up: [10, 5, 2], ridgeH: 3 });
    retile(w, X - 30, 55, Z - 30, X + 30, 78, Z + 30);
  } },
  { id: 'umaya', name: '马厩', tags: ['building', 'horse'], foot: { w: 4.6, d: 5.4 }, h: 3.9, kinds: ['wing'], size: 'L', build(c, p) {
    // a stable open to the floor: board back wall, posts, three stalls with low partitions, a front rail, a shingle roof with its gable
    // to the camera; two horses (one with a vermilion saddle cloth), hay in the third stall, troughs, a paper lantern at the front
    const w = c.w, X = M(p.x), Z = M(p.z), F = fr(w, X, p.s), hz = 36;
    F.box(-26, -1, Z - hz, 27, -1, Z + hz, CC.strawD);
    F.box(24, 0, Z - hz, 27, 31, Z + hz, CC.wood);
    for (let z = Z - hz + 4; z <= Z + hz; z += 9) F.box(23, 0, z, 23, 31, z, CC.woodD);
    for (const z of [Z - hz, Z - 12, Z + 12, Z + hz]) F.box(-25, 0, z - 1, -24, 31, z + 1, CC.woodD);
    for (const z of [Z - hz, Z + hz]) F.box(4, 0, z - 1, 27, 31, z + 1, CC.wood).box(4, 0, z - 1, 27, 12, z + 1, CC.woodD);
    for (const z of [Z - 12, Z + 12]) F.box(-14, 0, z - 1, 23, 14, z, CC.woodD).box(-14, 15, z - 1, 23, 15, z, CC.wood);
    F.box(-25, 13, Z - hz, -24, 14, Z + hz, CC.wood);
    F.box(-26, 32, Z - hz - 1, -23, 34, Z + hz + 1, CC.woodD).box(22, 32, Z - hz - 1, 27, 34, Z + hz + 1, CC.woodD);
    for (const z of [Z - hz, Z + hz]) F.box(-26, 32, z - 1, 27, 34, z + 1, CC.woodD);
    roof(w, X - 29, X + 29, Z - hz - 5, Z + hz + 5, 35, { plates: [[0, 3], [6, 3], [6, 3], [6, 3]], hip: 1, up: [9, 4, 2], ridgeH: 4, gable: CC.wood, alongZ: true });
    retile(w, X - 33, 35, Z - hz - 9, X + 33, 60, Z + hz + 9, 'shingle');
    const horse = (zc: number, col: number, dark: number, saddle: boolean) => {
      F.box(-6, 12, zc - 4, 12, 21, zc + 4, col);
      for (const a of [-5, 10]) for (const dz of [-4, 3]) F.box(a, 0, zc + dz, a + 1, 11, zc + dz + 1, dark);
      F.box(-12, 17, zc - 3, -6, 27, zc + 3, col).box(-18, 23, zc - 2, -12, 29, zc + 2, col).box(-18, 23, zc - 2, -17, 25, zc + 2, dark);
      F.box(-11, 28, zc - 1, -6, 29, zc + 1, dark).box(-6, 22, zc - 1, -5, 24, zc + 1, dark);
      F.box(-13, 30, zc - 2, -12, 31, zc - 1, dark).box(-13, 30, zc + 1, -12, 31, zc + 2, dark);
      F.set(-16, 27, zc - 3, CC.boardD).set(-16, 27, zc + 3, CC.boardD);
      F.box(13, 12, zc - 1, 14, 21, zc + 1, dark);
      if (saddle) F.box(-2, 22, zc - 5, 6, 22, zc + 5, CC.verm).box(-2, 14, zc - 5, 6, 21, zc - 5, CC.verm).box(-2, 14, zc + 5, 6, 21, zc + 5, CC.verm).box(-1, 23, zc - 3, 5, 24, zc + 3, CC.board);
      F.box(-23, 0, zc - 6, -19, 6, zc + 6, CC.woodD).box(-22, 6, zc - 5, -20, 6, zc + 5, 0x3e5866);
    };
    const which = Math.floor(p.rnd(1) * 3);
    [Z - 24, Z, Z + 24].forEach((zc, i) => {
      if (i === which) { F.box(4, 0, zc - 7, 20, 7, zc + 7, CC.straw).box(4, 8, zc - 5, 16, 13, zc + 5, CC.strawL).box(4, 3, zc - 7, 20, 3, zc + 7, CC.strawD); return; }
      horse(zc, i === 2 ? CC.grey : CC.horse, i === 2 ? CC.greyD : CC.horseD, i === 1 || (which === 1 && i === 0));
    });
    const L = andon(w, F.x(-25), 31, Z + 12, 7);
    lamp(c, p, [L[0] - 0.4 * F.k, L[1], L[2]], 0.9);
  } },
];

/** a long low stretch of stone terrace with a white earthen wall on top along z (ports, black wainscot, iron spikes on the ridge), and a
 *  two-step stone stair up to it on the floor side */
export const WALLS: Group[] = [
  { id: 'dobei', name: '石垣土塀', tags: ['wall', 'stone'], foot: { w: 2.8, d: 5.6 }, h: 2.9, kinds: ['wing'], size: 'L', build(c, p) {
    const w = c.w, X = M(p.x), Z = M(p.z), F = fr(w, X, p.s), hz = 38;
    const xa = F.x(-12), xb = F.x(18);
    ishigaki(w, Math.min(xa, xb), Z - hz, Math.max(xa, xb), Z + hz, -1, [{ h: 8, inset: 0 }, { h: 7, inset: 3 }], { seed: p.seed });
    const top = hei(w, Z - hz + 4, Z + hz - 4, F.x(9), 14, 19, false, { ports: true, bh: 7 });
    for (let z = Z - hz + 6; z <= Z + hz - 6; z += 6) w.box(F.x(9), top, z, F.x(9), top + 2, z, CC.iron);
    const sz = p.rnd(1) < 0.5 ? Z + hz - 14 : Z - hz + 2;
    F.box(-20, -1, sz, -12, 6, sz + 12, CC.st[2]).box(-20, 6, sz, -12, 6, sz + 12, CC.stC).box(-16, 7, sz, -12, 13, sz + 12, CC.st[0]).box(-16, 13, sz, -12, 13, sz + 12, CC.stC);
  } },
];
void nsq; void storey;
