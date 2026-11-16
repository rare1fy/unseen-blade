// 忍之章 · 城郭的建筑（castle 代理）：天守（主地标，前面带一座付橹和登城石阶）、枡形门（两块石垣夹着门，上面跨一座渡橹）、
// 多闻橹（长石垣 + 埋门隧道 + 长橹 + 一端的二重隅橹），以及插槽里的二重橹、隅橹。
// 战斗视角只看得到后排约 4.5 m 以下，所以每个地标的「读点」（石垣、黑板白壁、第一层屋顶的翘角）都压在这个高度以内，更高的层只在俯视里看。
import type { Ctx } from '../../scenes/stage';
import { M } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { roof } from '../../kyoto/temple_kit';
import type { Landmark, Place } from '../types';
import { CC, ishigaki, storey, shachi, retile, hei, mon, andon } from './castle_kit';

const at = (X: number, Y: number, Z: number): [number, number, number] => [(X + 0.5) * CELL, (Y + 0.5) * CELL, (Z + 0.5) * CELL];
const lit = (p: Place) => p.lamp > 0.6;

/** a hip / irimoya roof whose ridge ends carry gold shachi; returns the top y */
export function crownRoof(c: Ctx, x0: number, x1: number, z0: number, z1: number, y: number, plates: Array<[number, number]>, hip: number, up: [number, number, number], o: { fish?: boolean } = {}) {
  const w = c.w, top = roof(w, x0, x1, z0, z1, y, { plates, hip, up, ridgeH: 5, gable: CC.wall, gegyo: true });
  let ix = 0, iz = 0; plates.forEach(([d], i) => { if (i === 0) return; if (i < hip) { ix += d; iz += d; } else iz += d; });
  const a = x0 + ix, b = x1 - ix, cz = (z0 + iz + z1 - iz) >> 1;
  retile(w, x0 - 6, y, z0 - 6, x1 + 6, top + 1, z1 + 6);
  if (o.fish !== false) { shachi(w, a - 2, top + 1, cz, -1); shachi(w, b + 2, top + 1, cz, 1); }
  return top;
}
/** a pent roof skirt around a storey (plates stepping in on all sides, no ridge); returns its top y */
export function skirt(c: Ctx, x0: number, x1: number, z0: number, z1: number, y: number, n = 3) {
  const plates: Array<[number, number]> = [[0, 3], [5, 3], [5, 3], [5, 3]].slice(0, n) as Array<[number, number]>;
  const top = roof(c.w, x0, x1, z0, z1, y, { plates, hip: n, up: [14, 6, 3], ridgeH: 0 });
  retile(c.w, x0 - 4, y, z0 - 4, x1 + 4, top + 7, z1 + 4);
  return top;
}
/** three big stone steps up a base front: x0..x1 wide, from the face at zf out toward +z, rising to yTop */
function steps(w: Ctx['w'], x0: number, x1: number, zb: number, zf: number, yTop: number) {
  const n = 3, rise = Math.round((yTop + 1) / n), run = Math.round((zf - zb) / n);
  for (let k = 0; k < n; k++) {
    const y1 = k === n - 1 ? yTop : rise * (k + 1) - 1, z1 = zf - run * k;
    w.box(x0, -1, zb, x1, y1, z1, CC.st[k % 3]).box(x0, y1, zb, x1, y1, z1, CC.stC).box(x0, y1, z1, x1, y1, z1, CC.stTop);
    w.box(x0, -1, z1, x0, y1, z1, CC.stJ).box(x1, -1, z1, x1, y1, z1, CC.stJ);
  }
}

// ------------------------------------------------------------------ landmarks
export const LANDMARKS: Landmark[] = [
  { id: 'tenshu', name: '天守', foot: { w: 13.0, d: 7.0 }, tags: ['building', 'tall'], build(c, p) {
    // the keep: a four-tier ishigaki, three storeys stepping in under their own roofs (the top an irimoya with gold shachi); in front a
    // lower attached tower (tsuke-yagura) on its own stone base on one side, the stone stair up to a small gate on the other
    const w = c.w, X = M(p.x), Z = M(p.z), side = p.rnd(1) < 0.5 ? -1 : 1;
    const base = ishigaki(w, X - 69, Z - 43, X + 69, Z + 17, -1, [{ h: 7, inset: 0 }, { h: 6, inset: 4 }, { h: 6, inset: 4 }, { h: 5, inset: 4 }], { seed: p.seed });
    let y = base.y;
    storey(w, X - 52, Z - 28, X + 52, Z + 1, y, 24, { bh: 12, win: 15, winH: 6, ports: true, lit: lit(p) });
    let ys = skirt(c, X - 61, X + 61, Z - 37, Z + 10, y + 22);
    y = ys - 6;
    storey(w, X - 40, Z - 23, X + 40, Z - 3, y, 24, { bh: 0, win: 14, winH: 6, winY: 7, lit: lit(p) });
    ys = skirt(c, X - 48, X + 48, Z - 31, Z + 5, y + 22);
    y = ys - 6;
    storey(w, X - 28, Z - 19, X + 28, Z - 7, y, 22, { bh: 0, win: 10, winH: 6, winY: 7, lit: lit(p) });
    crownRoof(c, X - 37, X + 37, Z - 28, Z + 2, y + 20, [[0, 4], [6, 4], [6, 4], [6, 4], [5, 4]], 2, [18, 8, 3]);
    // the attached front tower on one side, the stone stair up the middle (in line with the path) to a small black gate
    const TX = X + side * 48;
    const tb = ishigaki(w, TX - 22, Z + 4, TX + 22, Z + 47, -1, [{ h: 8, inset: 0 }, { h: 6, inset: 4 }], { seed: p.seed + 3 });
    storey(w, TX - 15, Z + 10, TX + 15, Z + 40, tb.y, 22, { bh: 10, win: 12, winH: 5, ports: true, open: side > 0 ? 'sw' : 'se', lit: lit(p) });
    crownRoof(c, TX - 23, TX + 23, Z + 2, Z + 48, tb.y + 20, [[0, 4], [6, 4], [6, 4], [5, 4]], 2, [14, 7, 3]);
    steps(w, X - 12, X + 12, Z + 5, Z + 34, base.y - 1);
    for (const dx of [-11, 10]) w.box(X + dx, base.y, Z + 2, X + dx + 1, base.y + 22, Z + 3, CC.boardD);
    w.box(X - 13, base.y + 20, Z + 1, X + 13, base.y + 22, Z + 4, CC.board);
    roof(w, X - 16, X + 16, Z - 2, Z + 7, base.y + 23, { plates: [[0, 3], [4, 3]], hip: 1, up: [6, 3, 2], ridgeH: 3 }); retile(w, X - 20, base.y + 22, Z - 6, X + 20, base.y + 36, Z + 11);
    for (const dx of [-19, 19]) basket(c, p, X + dx, Z + 26);
    if (p.lamp > 0.3) c.light(at(TX, tb.y + 10, Z + 52), 0xffa050, 2.4 * p.lamp, 6);
  } },
  { id: 'masugata', name: '枡形门', foot: { w: 11.0, d: 6.0 }, tags: ['gate', 'building'], build(c, p) {
    // two great stone blocks with the gate passage between them; a white gatehouse (watari-yagura) spans both; heavy black doors stand
    // open against the passage walls; low stone returns with walls on top close the square in front; a fire basket at each return
    const w = c.w, X = M(p.x), Z = M(p.z), O = 18;
    for (const s of [-1, 1]) {
      const a = s < 0 ? X - 74 : X + O + 1, b = s < 0 ? X - O - 1 : X + 74;
      ishigaki(w, a, Z - 40, b, Z + 26, -1, [{ h: 9, inset: 0 }, { h: 8, inset: 3 }, { h: 7, inset: 3 }], { seed: p.seed + (s > 0 ? 5 : 0) });
      // the passage face: plumb, of big squared stones (two courses, long blocks)
      const fx = s < 0 ? X - O - 1 : X + O + 1, ix = s < 0 ? fx - 6 : fx;
      w.box(ix, -1, Z - 40, ix + 6, 23, Z + 26, CC.st[1]);
      for (let yy = 0; yy <= 23; yy++) for (let z = Z - 40; z <= Z + 26; z++) {
        const r = Math.floor(yy / 8), k = z - Z + 40 + (r & 1 ? 9 : 0);
        w.set(fx, yy, z, yy % 8 === 7 || k % 18 === 17 ? CC.stJ : CC.st[(Math.floor(k / 18) + r) % 3]);
      }
      w.box(ix, 23, Z - 40, ix + 6, 23, Z + 26, CC.stTop);
      // the return in front: low stone and a white wall with ports
      const ra = s < 0 ? X - 74 : X + 56, rb = s < 0 ? X - 56 : X + 74;
      ishigaki(w, ra, Z + 26, rb, Z + 40, -1, [{ h: 7, inset: 0 }, { h: 5, inset: 2 }], { seed: p.seed + 9 });
      hei(w, Z + 24, Z + 38, (ra + rb) >> 1, 11, 16, false, { ports: true, bh: 6 });
      // a fire basket inside the return
      const kx = s < 0 ? X - 44 : X + 44, kz = Z + 34;
      basket(c, p, kx, kz);
    }
    // the gate: a heavy lintel beam, a dark ceiling, the doors swung open against the passage walls (iron bands and studs)
    w.box(X - O, 20, Z - 30, X + O, 23, Z + 24, CC.boardD).box(X - O - 1, 18, Z + 22, X + O + 1, 23, Z + 25, CC.board).box(X - O - 1, 18, Z - 32, X + O + 1, 23, Z - 29, CC.board);
    for (const s of [-1, 1]) {
      const dx = s < 0 ? X - O : X + O - 1;
      w.box(dx, 0, Z - 2, dx + 1, 17, Z + 17, CC.board);
      for (const yy of [3, 9, 15]) w.box(s < 0 ? dx + 2 : dx - 1, yy, Z - 2, s < 0 ? dx + 2 : dx - 1, yy, Z + 17, CC.iron);
      for (const zz of [Z + 2, Z + 8, Z + 14]) for (const yy of [6, 12]) w.set(s < 0 ? dx + 2 : dx - 1, yy, zz, CC.ironL);
    }
    for (let z = Z - 40; z <= Z + 40; z++) for (let x = X - O; x <= X + O; x++) w.set(x, -1, z, ((z >> 3) + (x > X ? 1 : 0)) & 1 ? CC.gran[0] : CC.gran[2]);
    // the gatehouse over both blocks
    const yb = 24;
    storey(w, X - 66, Z - 32, X + 66, Z + 18, yb, 22, { bh: 10, win: 16, winH: 5, ports: true, lit: lit(p) });
    crownRoof(c, X - 74, X + 74, Z - 40, Z + 26, yb + 20, [[0, 4], [7, 4], [7, 4], [6, 4], [6, 4]], 2, [20, 9, 3]);
    // a crest board over the passage
    w.box(X - 6, yb + 0, Z + 19, X + 6, yb + 12, Z + 19, CC.board);
    mon((du, dv) => w.set(X + du, yb + 6 + dv, Z + 20, CC.gold), 5);
  } },
  { id: 'tamon', name: '多闻橹', foot: { w: 15.0, d: 6.4 }, tags: ['building', 'wall'], build(c, p) {
    // a long high ishigaki across the back with a gate tunnel (uzumi-mon) through it, a long white tamon tower on top, a two-storey
    // corner turret at one end and a stone stair up the face at the other
    const w = c.w, X = M(p.x), Z = M(p.z), side = p.rnd(1) < 0.5 ? -1 : 1;
    const base = ishigaki(w, X - 100, Z - 30, X + 100, Z + 14, -1, [{ h: 9, inset: 0 }, { h: 8, inset: 3 }, { h: 8, inset: 3 }, { h: 7, inset: 3 }], { seed: p.seed });
    // the tunnel mouth in a plumb block of big squared stones (the battered face would leave the lintel hanging), the tunnel walls
    // and ceiling of big stones, a light lintel stone, black doors ajar inside, a lantern
    const TW = 13;
    w.box(X - TW - 8, -1, Z + 6, X + TW + 8, 26, Z + 14, CC.st[1]);
    for (let yy = 0; yy <= 26; yy++) for (let x = X - TW - 8; x <= X + TW + 8; x++) { const r = Math.floor(yy / 7), k = x - X + 40 + (r & 1 ? 6 : 0); w.set(x, yy, Z + 14, yy % 7 === 6 || k % 13 === 12 ? CC.stJ : CC.st[(Math.floor(k / 13) + r) % 3]); }
    w.box(X - TW - 8, 26, Z + 6, X + TW + 8, 26, Z + 14, CC.stTop);
    w.box(X - TW, 0, Z - 30, X + TW, 20, Z + 14, null);
    w.box(X - TW - 3, 0, Z - 30, X - TW - 1, 22, Z + 13, CC.st[1]).box(X + TW + 1, 0, Z - 30, X + TW + 3, 22, Z + 13, CC.st[1]).box(X - TW, 21, Z - 30, X + TW, 22, Z + 13, CC.st[2]);
    w.box(X - TW - 4, 21, Z + 14, X + TW + 4, 25, Z + 14, CC.stC).box(X - TW - 4, 21, Z + 14, X + TW + 4, 21, Z + 14, CC.stJ);
    for (let yy = 0; yy <= 20; yy++) for (let z = Z - 30; z <= Z + 13; z++) for (const fx of [X - TW - 1, X + TW + 1]) w.set(fx, yy, z, yy % 7 === 6 || (z - Z + 40 + (Math.floor(yy / 7) & 1 ? 6 : 0)) % 13 === 12 ? CC.stJ : CC.st[(Math.floor((z - Z + 40) / 13) + Math.floor(yy / 7)) % 3]);
    w.box(X - TW, 0, Z - 12, X - 2, 18, Z - 11, CC.board).box(X + 6, 0, Z - 18, X + TW, 18, Z - 17, CC.board);
    for (const yy of [4, 10, 16]) w.box(X - TW, yy, Z - 10, X - 2, yy, Z - 10, CC.iron).box(X + 6, yy, Z - 16, X + TW, yy, Z - 16, CC.iron);
    for (let z = Z - 30; z <= Z + 14; z++) for (let x = X - TW; x <= X + TW; x++) w.set(x, -1, z, (z >> 3) & 1 ? CC.gran[0] : CC.gran[1]);
    andon(w, X, 19, Z + 4, 6);
    // the long tower on the wall and the corner turret at one end
    const ty = base.y, ta = side > 0 ? X - 88 : X - 54, tb = side > 0 ? X + 54 : X + 88;
    storey(w, ta, Z - 20, tb, Z + 4, ty, 20, { bh: 9, win: 18, winH: 5, ports: true, lit: lit(p) });
    const ra = side > 0 ? ta - 8 : ta, rb = side > 0 ? tb : tb + 8;
    roof(w, ra, rb, Z - 28, Z + 12, ty + 18, { plates: [[0, 4], [6, 4], [6, 4], [6, 3]], hip: 1, up: [14, 6, 3], ridgeH: 5 });
    retile(w, ra - 14, ty + 18, Z - 34, rb + 14, ty + 40, Z + 18);
    const KX = X + side * 72;
    storey(w, KX - 17, Z - 20, KX + 17, Z + 4, ty, 26, { bh: 11, win: 12, winH: 5, ports: true, open: side > 0 ? 'se' : 'sw', lit: lit(p) });
    const ks = skirt(c, KX - 25, KX + 25, Z - 28, Z + 12, ty + 24);
    storey(w, KX - 11, Z - 14, KX + 11, Z - 2, ks - 6, 20, { bh: 0, win: 10, winH: 5, winY: 6, lit: lit(p) });
    crownRoof(c, KX - 19, KX + 19, Z - 22, Z + 6, ks + 12, [[0, 4], [6, 4], [5, 4], [5, 4]], 2, [12, 6, 3]);
    // the stair up the face at the other end
    const SX = X - side * 72;
    steps(w, SX - 11, SX + 11, Z + 2, Z + 40, base.y - 1);
    if (p.lamp > 0.3) { c.light(at(X, 12, Z + 18), 0xffb070, 3 * p.lamp, 6); c.light(at(SX, base.y + 4, Z + 20), 0xffa050, 2 * p.lamp, 6); }
  } },
];

/** an iron fire basket on four legs with two rings, embers and a flame, on a stone footing (cells); adds the light */
export function basket(c: Ctx, p: Place, X: number, Z: number, Y = 16) {
  const w = c.w;
  w.box(X - 6, -1, Z - 6, X + 6, 0, Z + 6, CC.st[1]).box(X - 6, 0, Z - 6, X + 6, 0, Z + 6, CC.stTop);
  for (const [a, b] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) w.box(X + a, 1, Z + b, X + a + 1, Y, Z + b + 1, CC.iron);
  w.box(X - 4, 7, Z - 4, X + 4, 7, Z + 4, CC.iron).box(X - 3, 7, Z - 3, X + 3, 7, Z + 3, null);
  w.box(X - 5, Y + 1, Z - 5, X + 5, Y + 1, Z + 5, CC.iron);
  for (const [a, b] of [[-5, -5], [4, -5], [-5, 4], [4, 4], [-1, -5], [-1, 4], [-5, -1], [4, -1]]) w.box(X + a, Y + 2, Z + b, X + a + 1, Y + 6, Z + b + 1, CC.iron);
  // embers and logs at a dark mid glow, the fire a 2×2 column at a warm mid tone, one bright core cell (no blow-out); the flame mesh flickers on top
  w.box(X - 4, Y + 2, Z - 4, X + 3, Y + 2, Z + 3, CC.ember, 1).box(X - 3, Y + 3, Z - 1, X + 2, Y + 3, Z, CC.woodD).box(X - 1, Y + 3, Z - 3, X, Y + 3, Z + 2, CC.woodD);
  w.box(X - 1, Y + 4, Z - 1, X, Y + 6, Z, CC.fire, 1).set(X, Y + 7, Z, CC.fireCore, 1);
  c.flame(at(X, Y + 8, Z), 0xff9038, 0.13);
  if (p.lamp > 0.2) c.light(at(X, Y + 10, Z), 0xff9040, 2.6 * Math.max(0.5, p.lamp), 5.5);
}

/** 二重橹 (two variants): a two-storey turret on a stone base, or a long single-storey hira-yagura under a big irimoya roof */
export function nijuYagura(c: Ctx, p: Place) {
  const w = c.w, X = M(p.x), Z = M(p.z);
  const b = ishigaki(w, X - 27, Z - 21, X + 27, Z + 21, -1, [{ h: 8, inset: 0 }, { h: 7, inset: 3 }], { seed: p.seed });
  if (p.rnd(2) < 0.55) {
    storey(w, X - 20, Z - 14, X + 20, Z + 14, b.y, 24, { bh: 11, win: 13, winH: 5, ports: true, lit: lit(p) });
    const ys = skirt(c, X - 27, X + 27, Z - 21, Z + 21, b.y + 22);
    storey(w, X - 13, Z - 9, X + 13, Z + 9, ys - 6, 20, { bh: 0, win: 11, winH: 5, winY: 6, lit: lit(p) });
    crownRoof(c, X - 20, X + 20, Z - 16, Z + 16, ys + 12, [[0, 4], [6, 4], [6, 4], [5, 4]], 2, [12, 6, 3]);
  } else {
    storey(w, X - 21, Z - 15, X + 21, Z + 15, b.y, 28, { bh: 12, win: 12, winH: 6, ports: true, lit: lit(p) });
    crownRoof(c, X - 28, X + 28, Z - 22, Z + 22, b.y + 26, [[0, 4], [7, 4], [7, 4], [6, 4], [6, 4]], 2, [16, 7, 3]);
  }
}
/** 隅橹: a corner turret on a two-tier base, one storey with windows toward the floor and the camera, an irimoya roof with shachi */
export function sumiYagura(c: Ctx, p: Place) {
  const w = c.w, X = M(p.x), Z = M(p.z), H = M(1.65);
  const b = ishigaki(w, X - H, Z - H, X + H, Z + H, -1, [{ h: 12, inset: 0 }, { h: 10, inset: 4 }], { seed: p.seed });
  const S = M(1.25), open = p.s > 0 ? 'sw' : p.s < 0 ? 'se' : 's';
  storey(w, X - S, Z - S, X + S, Z + S, b.y, 24, { bh: 11, win: 12, winH: 5, ports: true, open, lit: lit(p) });
  crownRoof(c, X - S - 9, X + S + 9, Z - S - 9, Z + S + 9, b.y + 22, [[0, 4], [6, 4], [6, 4], [5, 4]], 2, [12, 6, 3]);
}
