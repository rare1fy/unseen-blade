// 2x 舞台的场地（act-19，用户：「战斗舞台太小了」「通道看起来也不像是通道」「希望场景中有各种可破坏的场景物件」）：
// 战斗区两侧和后方一圈矮墙（残村夯土墙带瓦檐、麦田编篱、破庙青砖墙），前方（镜头这边）不围；
// 出口是墙上的门洞（石础 + 方门柱 + 门楣小檐），这一间要走的门洞空着（木栅由 act/gates.ts 挡着、清场后倒下），
// 其余路口的门洞关着两扇木门；场地中间放 2～4 件不会坏的掩体大件（水井、石碾、柴车、石堆、香鼎、石碑、水槽），
// 和一批可破坏物件（陶罐、木箱、草垛、火油坛、立柱；逻辑在 act/breakLogic.ts，模型在 act/breakables.ts）。
// 规划（arenaPlan）是纯数据、按种子确定：拼场景时用它建墙门掩体的体素，战斗时用它建碰撞和物件，两边一致。
import { M, PLAY, hash, SZ } from '../scenes/props';
import type { Ctx } from '../scenes/stage';
import type { Layout, Rect } from './types';
import { exitInfo, type ExitId } from './exits';

export type WallStyle = 'earth' | 'wattle' | 'brick' | 'rail' | 'stockade' | 'plaster';
export type CoverKind = 'well' | 'mill' | 'cart' | 'stones' | 'ding' | 'stele' | 'trough' | 'bollard' | 'chains' | 'barrels' | 'rockery' | 'screen' | 'basin';
export type PropKind = 'pot' | 'crate' | 'hay' | 'oil' | 'pillar' | 'fence' | 'rack' | 'banner' | 'basket' | 'sack' | 'lamp';
/** a gap in the wall: centre (x, z), along 'x' (the back wall) or 'z' (a side wall), opening width w; open = this room's way out */
export interface Gate { id: ExitId | 'path'; x: number; z: number; along: 'x' | 'z'; w: number; open: boolean; out: [number, number] }
export interface Cover { kind: CoverKind; x: number; z: number; hx: number; hz: number; rot: 0 | 1 }
export interface ArenaPlan { style: WallStyle; gates: Gate[]; covers: Cover[]; props: Array<{ kind: PropKind; x: number; z: number; rot?: 0 | 1 }>;
  /** the wall's inner face sits this far outside PLAY (m) and it is this thick / tall */ wall: { gap: number; thick: number; h: number } }

export const WALL = { gap: 0.1, thick: 0.49, h: 1.19 };
export const styleOf = (locale: string): WallStyle => ARENA_LOOK[locale]?.style ?? (locale === 'hj_field' ? 'wattle' : locale === 'hj_temple' ? 'brick' : 'earth');
const COVERS: Record<WallStyle, CoverKind[]> = { earth: ['well', 'mill', 'cart', 'stones'], wattle: ['cart', 'trough', 'mill', 'stones'], brick: ['ding', 'stele', 'stones', 'well'],
  rail: ['bollard', 'chains', 'barrels'], stockade: ['barrels', 'chains', 'cart', 'stones'], plaster: ['rockery', 'screen', 'basin'] };
const COVER_SIZE: Record<CoverKind, [number, number]> = { well: [0.75, 0.75], mill: [0.8, 0.8], cart: [1.15, 0.65], stones: [0.7, 0.6], ding: [0.6, 0.6], stele: [0.75, 0.4], trough: [1.0, 0.45],
  bollard: [0.55, 0.55], chains: [0.9, 0.7], barrels: [0.85, 0.6], rockery: [0.9, 0.75], screen: [1.1, 0.3], basin: [0.7, 0.7] };
/** wp/regB (第四关 · 锁江、第五关 · 许都雪): a place outside 地域一 registers the look of its battle floor here — the wall style, the
 *  cover, the small breakables and how many of the 黄巾 banners / lantern posts / oil jars / pillars it has (the banner is a yellow
 *  黄巾 one: the 曹军 and the 崔府 have none). Every place registered here is built on the 2x stage (bigStage) */
export interface ArenaLook { style: WallStyle; covers?: CoverKind[]; smalls?: PropKind[]; banners?: number; lamps?: number; oil?: number; pillars?: number; fences?: number; racks?: number }
export const ARENA_LOOK: Record<string, ArenaLook> = {};
/** the room is built on the 2x stage with walls, gates, cover and breakables (地域一's places and every one in ARENA_LOOK) */
export const bigStage = (locale: string) => locale.startsWith('hj_') || locale in ARENA_LOOK;

/** the plan for one room: gates from the layout's roads and this room's exits, cover and props from the seed */
export function arenaPlan(layout: Layout, exits: ExitId[], seed: number, locale: string, kind: 'fight' | 'boss' | 'calm'): ArenaPlan {
  const r = (k: number) => hash(seed * 7 + 11, k, 4513), style = styleOf(locale), gates: Gate[] = [], look = ARENA_LOOK[locale];
  // the side exits cut their own gate; every road that runs out through the back wall gets one (the back exit's road is open)
  for (const id of exits) if (id !== 'back') { const e = exitInfo(layout, id); gates.push({ id, x: id === 'left' ? PLAY.x0 : PLAY.x1, z: (e.lane.z0 + e.lane.z1) / 2, along: 'z', w: 2.8, open: true, out: [id === 'left' ? -1 : 1, 0] }); }
  const back = exits.includes('back') ? exitInfo(layout, 'back') : null;
  for (const p of layout.path) if (p.z0 < PLAY.z0 - 0.5 && p.z1 > PLAY.z0) {
    const cx = (p.x0 + p.x1) / 2, w = Math.min(3.0, Math.max(2.6, p.x1 - p.x0 + 0.4));
    if (gates.some(g => g.along === 'x' && Math.abs(g.x - cx) < w)) continue;
    const open = !!back && Math.abs((back.lane.x0 + back.lane.x1) / 2 - cx) < 0.5;
    gates.push({ id: open ? 'back' : 'path', x: cx, z: PLAY.z0, along: 'x', w, open, out: [0, -1] });
  }
  // the floor kept clear: the hero's way in, the gates' approaches, the boss's mark, the stations of a calm room
  const clear: Rect[] = [{ x0: -2.6, x1: 2.6, z0: PLAY.z1 - 5.5, z1: PLAY.z1 + 1 }];
  for (const g of gates) clear.push(g.along === 'x' ? { x0: g.x - g.w / 2 - 1, x1: g.x + g.w / 2 + 1, z0: g.z, z1: g.z + 4.5 } : { x0: g.out[0] < 0 ? g.x : g.x - 4.5, x1: g.out[0] < 0 ? g.x + 4.5 : g.x, z0: g.z - g.w / 2 - 1, z1: g.z + g.w / 2 + 1 });
  clear.push({ x0: -2.6, x1: 2.6, z0: SZ(-4.6) - 2.6, z1: SZ(-4.6) + 2.6 });
  if (kind === 'calm') clear.push({ x0: -5.5, x1: 5.5, z0: -3.4, z1: 1.6 });
  const inClear = (x: number, z: number, pad: number) => clear.some(c => x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad);
  const inFloor = (x: number, z: number, pad: number) => x > PLAY.x0 + pad && x < PLAY.x1 - pad && z > PLAY.z0 + pad && z < PLAY.z1 - pad;
  // cover: on a jittered 3 m grid, ≥ 6 m apart, ≥ 2.5 m in from the walls
  const covers: Cover[] = [], kinds = look?.covers ?? COVERS[style], want = kind === 'calm' ? 2 : kind === 'boss' ? 2 : 3 + (r(1) < 0.4 ? 1 : 0);
  const spots: Array<[number, number, number]> = [];
  for (let x = PLAY.x0 + 3; x < PLAY.x1 - 2.5; x += 3) for (let z = PLAY.z0 + 3; z < PLAY.z1 - 2.5; z += 3) spots.push([x + (r(x * 31 + z) - 0.5) * 1.2, z + (r(x * 37 + z * 3) - 0.5) * 1.2, r(x * 41 + z * 7)]);
  spots.sort((a, b) => a[2] - b[2]);
  for (const [x, z] of spots) {
    if (covers.length >= want) break;
    const k = kinds[covers.length % kinds.length], rot = (r(x * 13 + z) < 0.5 ? 0 : 1) as 0 | 1, [a, b] = COVER_SIZE[k], hx = rot ? b : a, hz = rot ? a : b;
    if (!inFloor(x, z, 2.5) || inClear(x, z, Math.max(hx, hz) + 0.4) || covers.some(c => Math.hypot(c.x - x, c.z - z) < 6)) continue;
    covers.push({ kind: k, x: +x.toFixed(2), z: +z.toFixed(2), hx, hz, rot });
  }
  // props: clusters of 2–3 by the cover and along the walls, oil jars and pillars on the open floor
  const props: ArenaPlan['props'] = [], R0: Record<PropKind, number> = { pot: 0.32, crate: 0.4, hay: 0.55, oil: 0.38, pillar: 0.3, fence: 0.85, rack: 0.5, banner: 0.25, basket: 0.34, sack: 0.34, lamp: 0.25 };
  const free = (x: number, z: number, rr: number) => inFloor(x, z, rr + 0.3) && !inClear(x, z, rr + 0.2) && covers.every(c => Math.abs(c.x - x) > c.hx + rr + 0.35 || Math.abs(c.z - z) > c.hz + rr + 0.35) && props.every(p => Math.hypot(p.x - x, p.z - z) > R0[p.kind] + rr + 0.25);
  const put = (k: PropKind, x: number, z: number, rot?: 0 | 1) => { if (!free(x, z, R0[k])) return false; props.push({ kind: k, x: +x.toFixed(2), z: +z.toFixed(2), ...(rot != null ? { rot } : {}) }); return true; };
  // act-20 (user: 「场景中的东西尽量都能破坏才爽」): baskets and grain sacks in the clusters too
  const smalls: PropKind[] = look?.smalls ?? (style === 'wattle' ? ['hay', 'pot', 'sack', 'hay', 'basket'] : style === 'brick' ? ['pot', 'pot', 'crate', 'basket'] : ['pot', 'crate', 'sack', 'hay', 'basket']);
  let salt = 100;
  const cluster = (ax: number, az: number, n: number) => { const k = smalls[Math.floor(r(salt++) * smalls.length)]; for (let i = 0, t = 0; i < n && t < 12; t++) { const a = r(salt++) * Math.PI * 2, d = 0.5 + r(salt++) * 0.8; if (put(i === 0 ? k : smalls[Math.floor(r(salt++) * smalls.length)], ax + Math.cos(a) * d, az + Math.sin(a) * d)) i++; } };
  for (const c of covers) { const s = r(salt++) < 0.5 ? -1 : 1; cluster(c.x + s * (c.hx + 0.9), c.z + (r(salt++) - 0.5) * c.hz * 2, 2 + (r(salt++) < 0.5 ? 1 : 0)); }
  for (let i = 0; i < (kind === 'calm' ? 3 : 4); i++) {   // along the walls
    const side = Math.floor(r(salt++) * 3), t = r(salt++);
    const [x, z] = side === 0 ? [PLAY.x0 + 0.9, PLAY.z0 + 2 + t * (PLAY.z1 - PLAY.z0 - 6)] : side === 1 ? [PLAY.x1 - 0.9, PLAY.z0 + 2 + t * (PLAY.z1 - PLAY.z0 - 6)] : [PLAY.x0 + 3 + t * (PLAY.x1 - PLAY.x0 - 6), PLAY.z0 + 0.9];
    cluster(x, z, 2 + (r(salt++) < 0.6 ? 1 : 0));
  }
  if (kind !== 'calm') {
    const nOil = look?.oil ?? (kind === 'boss' ? 3 : 2 + (r(salt++) < 0.5 ? 1 : 0)), nPil = look?.pillars ?? (kind === 'boss' ? 2 : 1 + (r(salt++) < 0.5 ? 1 : 0));
    for (let i = 0, t = 0; i < nOil && t < 40; t++) { const x = PLAY.x0 + 3 + r(salt++) * (PLAY.x1 - PLAY.x0 - 6), z = PLAY.z0 + 3 + r(salt++) * (PLAY.z1 - PLAY.z0 - 8); if (covers.every(c => Math.hypot(c.x - x, c.z - z) > 3) && props.filter(p => p.kind === 'oil').every(p => Math.hypot(p.x - x, p.z - z) > 4) && put('oil', x, z)) i++; }
    for (let i = 0, t = 0; i < nPil && t < 40; t++) { const x = PLAY.x0 + 3.5 + r(salt++) * (PLAY.x1 - PLAY.x0 - 7), z = PLAY.z0 + 3.5 + r(salt++) * (PLAY.z1 - PLAY.z0 - 9); if (props.filter(p => p.kind === 'pillar').every(p => Math.hypot(p.x - x, p.z - z) > 6) && put('pillar', x, z)) i++; }
  }
  // act-20: more to break — fence lengths across the floor, weapon racks by the walls, 黄巾 banners, lantern posts
  const spot = (pad: number) => [PLAY.x0 + pad + r(salt++) * (PLAY.x1 - PLAY.x0 - pad * 2), PLAY.z0 + pad + r(salt++) * (PLAY.z1 - PLAY.z0 - pad * 2 - 2)];
  const many = (k: PropKind, n: number, pad: number, rot = false) => { for (let i = 0, t = 0; i < n && t < 40; t++) { const [x, z] = spot(pad); if (put(k, x, z, rot ? (r(salt++) < 0.5 ? 0 : 1) : undefined)) i++; } };
  many('fence', look?.fences ?? (kind === 'calm' ? 1 : 3), 3, true);
  for (let i = 0, t = 0; i < (look?.racks ?? 2) && t < 30; t++) { const side = r(salt++) < 0.5 ? -1 : 1, z = PLAY.z0 + 3 + r(salt++) * (PLAY.z1 - PLAY.z0 - 8); if (put('rack', side < 0 ? PLAY.x0 + 0.8 : PLAY.x1 - 0.8, z, 1)) i++; }
  many('banner', look?.banners ?? (kind === 'calm' ? 1 : 3), 2.5);
  many('lamp', look?.lamps ?? 2, 2.5);
  return { style, gates, covers, props, wall: { ...WALL } };
}

// ================================================================== voxels: walls, gates, cover
type B = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) => void;
const PAL = {
  earth: { body: 0xa88a60, seam: 0x957a54, top: 0xbc9e72, foot: 0x7e6848, cap: 0x56585e, capD: 0x3a3c42, capL: 0x72747a },
  wattle: { post: 0x4a3622, postL: 0x6e5238, rail: 0x5e4630, weave: 0x8c703e, weaveD: 0x6a5430, weaveL: 0xa8884c },
  brick: { body: 0x7f7c75, joint: 0x5c5a55, top: 0xa4a19a, foot: 0x5c5a55, cap: 0x6c6a64, capL: 0x8a8780 },
  wood: 0x6e5238, woodD: 0x4a3622, woodL: 0x8e6e4c, red: 0x8e3b2c, redD: 0x6a2b21, redL: 0xa44c36,
  stone: 0x8a8780, stoneD: 0x6c6a64, stoneL: 0xa4a19a, tile: 0x56585e, tileD: 0x3a3c42, tileL: 0x72747a,
  water: 0x2a3440, bronze: 0x5a6a50, bronzeD: 0x3e4a38, bronzeL: 0x7a8a68, straw: 0xccb06a, strawD: 0xa08850,
  // wp/regB: the ship's rail (tarred wood, iron caps), the camp stockade, the 崔府 garden wall
  rail: { post: 0x3a2a20, rail: 0x4a3626, railL: 0x6a4e36, board: 0x4e3a2a, boardD: 0x3a2a1e, cap: 0x4a4f5a },
  stockade: { log: 0x6a5038, logD: 0x54402c, logL: 0x84684a, rope: 0x9a8058 },
  plaster: { body: 0xdcd8cc, bodyD: 0xbcb8ac, foot: 0x4a4848, footD: 0x3a3838, cap: 0x34363c, capD: 0x26282c, capL: 0x4a4c54 },
  iron: 0x4a4f5a, ironD: 0x30343c, ironL: 0x6e7480, tar: 0x2a2220, rock: 0x6e7078, rockD: 0x50525a, rockL: 0x8e9098, jade: 0x7a9a88,
};

/** walls (with their gaps), gate frames, closed doors and cover into the scene's voxels */
export function buildArena(c: Ctx, plan: ArenaPlan, seed: number) {
  const box: B = (x0, y0, z0, x1, y1, z1, col) => { c.w.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), col); };
  const r = (k: number) => hash(seed * 3 + 5, k, 919);
  const H = M(plan.wall.h) - 1, T = M(plan.wall.thick), G = M(plan.wall.gap);
  // the three runs, in cells: left (x fixed, along z), right, back (z fixed, along x); the front stays open
  const xl0 = M(PLAY.x0) - G - T, xl1 = M(PLAY.x0) - G - 1, xr0 = M(PLAY.x1) + G, xr1 = M(PLAY.x1) + G + T - 1;
  const zb0 = M(PLAY.z0) - G - T, zb1 = M(PLAY.z0) - G - 1, zf = M(PLAY.z1) + 2;
  const holes = (along: 'x' | 'z', side: number) => plan.gates.filter(g => g.along === along && (along === 'x' || Math.sign(g.out[0]) === side)).map(g => along === 'x' ? [M(g.x - g.w / 2), M(g.x + g.w / 2)] : [M(g.z - g.w / 2), M(g.z + g.w / 2)]);
  const run = (along: 'x' | 'z', a0: number, a1: number, b0: number, b1: number, gaps: number[][], salt: number) => {
    // split the run at the gaps; each piece is built by the style, with a broken-down stretch now and then (lower, axis-aligned)
    const cuts = [a0, ...gaps.flat().sort((p, q) => p - q), a1]; let k = salt;
    for (let i = 0; i < cuts.length; i += 2) {
      const s0 = cuts[i] + (i ? 1 : 0), s1 = cuts[i + 1] - (i + 1 < cuts.length - 1 ? 1 : 0); if (s1 - s0 < 2) continue;
      wallPiece(box, plan.style, along, s0, s1, b0, b1, H, r, k++);
    }
  };
  run('z', zb0, zf, xl0, xl1, holes('z', -1), 10); run('z', zb0, zf, xr0, xr1, holes('z', 1), 40); run('x', xl0, xr1, zb0, zb1, holes('x', 0), 70);
  for (const g of plan.gates) gateFrame(box, plan.style, g, T, G);
  void r;   // act-20: the cover pieces are breakable now — built by act/breakables.ts from coverVox()
}

/** one straight stretch of wall between a0..a1 (cells along the run), b0..b1 across it */
function wallPiece(box: B, st: WallStyle, along: 'x' | 'z', a0: number, a1: number, b0: number, b1: number, H: number, r: (k: number) => number, salt: number) {
  const bx = (p0: number, y0: number, q0: number, p1: number, y1: number, q1: number, col: number) => along === 'x' ? box(p0, y0, q0, p1, y1, q1, col) : box(q0, y0, p0, q1, y1, p1, col);
  // a broken stretch: one in three runs drops 4–6 cells over 1–2 m somewhere in its middle
  const len = a1 - a0, brk = len > 40 && r(salt) < 0.45 ? { s: a0 + 8 + Math.floor(r(salt + 1) * (len - 40)), n: 14 + Math.floor(r(salt + 2) * 14), d: 4 + Math.floor(r(salt + 3) * 3) } : null;
  const top = (a: number) => brk && a >= brk.s && a < brk.s + brk.n ? H - brk.d : H;
  const segs: Array<[number, number, number]> = []; let s = a0;
  for (let a = a0 + 1; a <= a1 + 1; a++) if (a > a1 || top(a) !== top(s)) { segs.push([s, a - 1, top(s)]); s = a; }
  if (st === 'earth') {
    const P = PAL.earth;
    for (const [p0, p1, h] of segs) {
      bx(p0, 0, b0, p1, h, b1, P.body); bx(p0, 0, b0, p1, 1, b1, P.foot);
      for (let y = 5; y < h - 1; y += 5) bx(p0, y, b0, p1, y, b1, P.seam);                       // the tamped courses
      if (h === H) { bx(p0, h + 1, b0 - 1, p1, h + 1, b1 + 1, P.capD); bx(p0, h + 2, b0, p1, h + 2, b1, P.cap); bx(p0, h + 3, b0 + 2, p1, h + 3, b1 - 2, P.capL); }
      else bx(p0, h, b0, p1, h, b1, P.top);
    }
  } else if (st === 'brick') {
    const P = PAL.brick;
    for (const [p0, p1, h] of segs) {
      bx(p0, 0, b0, p1, h, b1, P.body); bx(p0, 0, b0, p1, 1, b1, P.foot);
      for (let y = 4; y < h; y += 4) bx(p0, y, b0, p1, y, b1, P.joint);
      for (let y = 0; y < h; y += 4) for (let a = p0 + ((y / 4) % 2 ? 4 : 0); a <= p1; a += 8) { bx(a, y + 1, b0, a, Math.min(h, y + 3), b0, P.joint); bx(a, y + 1, b1, a, Math.min(h, y + 3), b1, P.joint); }
      if (h === H) { bx(p0, h + 1, b0 - 1, p1, h + 2, b1 + 1, P.cap); bx(p0, h + 3, b0 + 1, p1, h + 3, b1 - 1, P.capL); }
      else bx(p0, h, b0, p1, h, b1, P.top);
    }
  } else if (st === 'wattle') {
    // 编篱: posts every 9 cells, two rails, a woven panel between (horizontal bands, two tones)
    const P = PAL.wattle, mid0 = b0 + Math.floor((b1 - b0) / 2) - 1, mid1 = mid0 + 2;
    for (const [p0, p1, h] of segs) {
      const hh = h - 2;
      bx(p0, 1, mid0, p1, hh - 2, mid1 - 1, P.weave);
      for (let y = 2; y < hh - 2; y += 3) bx(p0, y, mid0, p1, y, mid1 - 1, P.weaveD);
      bx(p0, 3, mid0 - 1, p1, 4, mid1, P.rail); bx(p0, hh - 4, mid0 - 1, p1, hh - 3, mid1, P.rail);
      for (let a = p0; a <= p1; a += 9) { const a1 = Math.min(p1, a + 2); bx(a, 0, mid0 - 1, a1, hh, mid1, P.post); bx(a, hh, mid0 - 1, a1, hh, mid1, P.postL); }
      bx(p1 - 2, 0, mid0 - 1, p1, hh, mid1, P.post);
    }
  } else if (st === 'rail') {
    // wp/regB 横江浮栈 / 督造高阁: a ship's rail along the deck edge — square posts every 10 cells, a heavy top rail, a mid rail, a
    // low plank kick-board; the rail's own dark wood (tarred), iron caps on the posts
    const P = PAL.rail, m0 = b0 + Math.floor((b1 - b0) / 2) - 1, m1 = m0 + 2;
    for (const [p0, p1, h] of segs) {
      const hh = h - 2;
      bx(p0, 0, m0 - 1, p1, 4, m1, P.board); bx(p0, 4, m0 - 1, p1, 4, m1, P.boardD);
      bx(p0, hh - 3, m0 - 2, p1, hh - 1, m1 + 1, P.rail); bx(p0, hh - 1, m0 - 2, p1, hh - 1, m1 + 1, P.railL);
      bx(p0, 9, m0, p1, 10, m1 - 1, P.rail);
      for (let a = p0; a <= p1; a += 10) { const a1 = Math.min(p1, a + 2); bx(a, 0, m0 - 1, a1, hh + 1, m1, P.post); bx(a, hh + 2, m0 - 1, a1, hh + 2, m1, P.cap); }
      bx(p1 - 2, 0, m0 - 1, p1, hh + 1, m1, P.post);
    }
  } else if (st === 'stockade') {
    // wp/regB 乌林辕门: a camp stockade — close-set pointed logs (the points a stepped tier, never a slope), two lashing bands of rope
    const P = PAL.stockade;
    for (const [p0, p1, h] of segs) {
      for (let a = p0; a <= p1; a += 3) { const a1 = Math.min(p1, a + 1), t = h + ((a / 3) % 2 ? 2 : 0); bx(a, 0, b0 + 1, a1, t, b1 - 1, ((a / 3) % 3) ? P.log : P.logD); bx(a, t + 1, b0 + 2, a1, t + 2, b1 - 2, P.logL); }
      for (const y of [5, h - 4]) bx(p0, y, b0, p1, y, b1, P.rope);
    }
  } else {
    // wp/regB 崔府: a whitewashed garden wall on a dark brick footing, a black tiled coping in two tiers (a stepped eave both sides)
    const P = PAL.plaster;
    for (const [p0, p1, h] of segs) {
      bx(p0, 0, b0, p1, 3, b1, P.foot); for (let a = p0 + 3; a <= p1; a += 6) bx(a, 1, b0, a, 2, b1, P.footD);
      bx(p0, 4, b0, p1, h, b1, P.body); bx(p0, 4, b0, p1, 4, b1, P.bodyD);
      if (h === H) { bx(p0, h + 1, b0 - 2, p1, h + 1, b1 + 2, P.capD); bx(p0, h + 2, b0 - 1, p1, h + 3, b1 + 1, P.cap); bx(p0, h + 4, b0 + 1, p1, h + 4, b1 - 1, P.capL); for (let a = p0 + 1; a <= p1; a += 3) bx(a, h + 1, b0 - 2, a, h + 1, b0 - 2, P.capL); }
      else bx(p0, h, b0, p1, h, b1, P.bodyD);
    }
  }
}

/** the gate: stone plinths, square posts, a lintel and a small two-tier eave; a closed one gets two board doors */
function gateFrame(box: B, st: WallStyle, g: Gate, T: number, Gp: number) {
  const along = g.along, half = Math.round(M(g.w) / 2), cA = along === 'x' ? M(g.x) : M(g.z);
  // across the wall: the wall's own band
  const b0 = along === 'x' ? M(PLAY.z0) - Gp - T : (g.out[0] < 0 ? M(PLAY.x0) - Gp - T : M(PLAY.x1) + Gp), b1 = b0 + T - 1;
  const bx = (p0: number, y0: number, q0: number, p1: number, y1: number, q1: number, col: number) => along === 'x' ? box(p0, y0, q0, p1, y1, q1, col) : box(q0, y0, p0, q1, y1, p1, col);
  const post = st === 'brick' ? PAL.red : st === 'plaster' ? 0x2a2a30 : PAL.wood, postD = st === 'brick' ? PAL.redD : st === 'plaster' ? 0x1a1a20 : PAL.woodD, postL = st === 'brick' ? PAL.redL : st === 'plaster' ? 0x3e3e46 : PAL.woodL;
  const PH = 33, m0 = Math.floor((b0 + b1) / 2) - 2, m1 = m0 + 3;
  for (const s of [-1, 1]) {
    const a = cA + s * (half + 2), a0 = Math.min(a - 2, a + 1), a1 = Math.max(a - 2, a + 1);
    bx(a0 - 1, 0, m0 - 1, a1 + 1, 3, m1 + 1, PAL.stoneD); bx(a0 - 1, 3, m0 - 1, a1 + 1, 3, m1 + 1, PAL.stone);   // the plinth
    bx(a0, 4, m0, a1, PH, m1, post); bx(a0, 4, m0, a0, PH, m0, postD); bx(a1, 4, m1, a1, PH, m1, postL);
  }
  const L0 = cA - half - 6, L1 = cA + half + 6;
  bx(L0, PH + 1, m0, L1, PH + 3, m1, postD); bx(L0 + 2, PH - 2, m0, L1 - 2, PH - 2, m1, post);              // lintel + the tie beam under it
  bx(L0 - 2, PH + 4, m0 - 4, L1 + 2, PH + 5, m1 + 4, PAL.tileD); bx(L0, PH + 6, m0 - 2, L1, PH + 7, m1 + 2, PAL.tile); bx(L0 + 3, PH + 8, m0, L1 - 3, PH + 8, m1, PAL.tileL);
  if (!g.open) {   // two board doors, shut
    const d0 = cA - half, d1 = cA + half;
    bx(d0, 0, m0 + 1, d1, PH - 3, m1 - 1, PAL.woodD);
    for (let a = d0 + 2; a < d1; a += 4) bx(a, 1, m0 + 1, a + 2, PH - 4, m1 - 1, PAL.wood);
    bx(d0, 8, m0, d1, 9, m1, PAL.tileD); bx(d0, 22, m0, d1, 23, m1, PAL.tileD); bx(cA, 1, m0, cA, PH - 4, m1, PAL.woodD);
  }
}

/** one piece of cover, centred on its cell, its long side along x (rot 0) or z (rot 1) */
/** a cover piece's voxels at the origin (act-20: they break now, so they are their own meshes); rubble = the heap it falls to */
export function coverVox(w: { box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null): unknown }, kind: CoverKind, rot: 0 | 1, rubble = false) {
  const box: B = (x0, y0, z0, x1, y1, z1, col) => { w.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), col); };
  if (!rubble) { cover(box, { kind, x: 0, z: 0, hx: 0, hz: 0, rot }, () => 0); return; }
  // the heap: low broken blocks in the piece's own materials, flat-topped, axis-aligned
  const stoneish = kind === 'well' || kind === 'mill' || kind === 'stones' || kind === 'stele' || kind === 'trough' || kind === 'rockery' || kind === 'basin' || kind === 'screen', iron = kind === 'chains' || kind === 'bollard';
  const a = stoneish ? PAL.stone : kind === 'ding' ? PAL.bronze : iron ? PAL.iron : PAL.wood, d = stoneish ? PAL.stoneD : kind === 'ding' ? PAL.bronzeD : iron ? PAL.ironD : PAL.woodD, l = stoneish ? PAL.stoneL : kind === 'ding' ? PAL.bronzeL : iron ? PAL.ironL : PAL.woodL;
  const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number) => rot ? box(z0, y0, x0, z1, y1, x1, col) : box(x0, y0, z0, x1, y1, z1, col);
  bx(-9, 0, -6, 2, 3, 6, a); bx(-9, 4, -6, 2, 4, 6, l); bx(3, 0, -5, 10, 2, 3, d); bx(-4, 4, -3, 0, 6, 2, d); bx(4, 3, -2, 8, 3, 1, l);
  if (kind === 'cart' || kind === 'well') { bx(-12, 0, 5, -2, 1, 7, PAL.woodD); bx(6, 0, -8, 8, 1, 2, PAL.wood); }
}
function cover(box: B, cv: Cover, r: (k: number) => number) {
  const X = M(cv.x), Z = M(cv.z), rot = cv.rot;
  const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number) => rot ? box(X + z0, y0, Z + x0, X + z1, y1, Z + x1, col) : box(X + x0, y0, Z + z0, X + x1, y1, Z + z1, col);
  switch (cv.kind) {
    case 'well': {   // 井: a square stone curb with a dark water face, a wooden windlass frame across it
      bx(-10, 0, -10, 10, 9, 10, PAL.stone); bx(-10, 9, -10, 10, 10, 10, PAL.stoneL); bx(-7, 0, -7, 7, 10, 7, PAL.stoneD); bx(-7, 0, -7, 7, 6, 7, PAL.water);
      bx(-10, 0, -10, 10, 1, 10, PAL.stoneD);
      for (const s of [-1, 1]) bx(s * 11 - 1, 0, -1, s * 11 + 1, 30, 1, PAL.woodD);
      bx(-12, 31, -1, 12, 33, 1, PAL.wood); bx(-4, 26, -3, 4, 30, 3, PAL.woodL); bx(-1, 14, -1, 1, 25, 1, PAL.woodD); bx(-3, 10, -3, 3, 14, 3, PAL.wood);
      break;
    }
    case 'mill': {   // 石碾: a round-cornered stone bed (notched), a stone roller on it held by a timber frame
      bx(-11, 0, -9, 11, 5, 9, PAL.stone); bx(-9, 0, -11, 9, 5, 11, PAL.stone); bx(-9, 6, -9, 9, 6, 9, PAL.stoneL);
      bx(-7, 7, -4, 7, 14, 4, PAL.stoneD); bx(-6, 15, -3, 6, 15, 3, PAL.stoneL); bx(-7, 7, -4, -7, 14, 4, PAL.stone); bx(7, 7, -4, 7, 14, 4, PAL.stone);
      bx(-9, 10, -1, 9, 11, 1, PAL.woodD); bx(-1, 7, -1, 1, 24, 1, PAL.woodD); bx(-1, 24, -1, 9, 25, 1, PAL.wood);
      break;
    }
    case 'cart': {   // 柴车: a plank bed on two wheels (notched squares), shafts on the ground, a load of firewood bundles
      bx(-16, 9, -8, 16, 11, 8, PAL.wood); bx(-16, 12, -8, 16, 14, -7, PAL.woodD); bx(-16, 12, 7, 16, 14, 8, PAL.woodD); for (let x = -14; x <= 14; x += 6) bx(x, 9, -8, x, 11, 8, PAL.woodD);
      for (const s of [-1, 1]) { const z = s * 9; bx(-6, 2, z, 6, 14, z + s, PAL.woodD); bx(-4, 0, z, 4, 16, z + s, PAL.woodD); bx(-2, 6, z + s, 2, 10, z + s, PAL.wood); }
      bx(16, 0, -6, 28, 2, -5, PAL.woodD); bx(16, 0, 5, 28, 2, 6, PAL.woodD); bx(16, 2, -6, 18, 9, 6, PAL.woodD);
      for (let i = 0; i < 4; i++) { const x = -13 + i * 7; bx(x, 12, -6, x + 5, 19 + (i % 2) * 2, 6, PAL.straw); bx(x, 15, -6, x + 5, 15, 6, PAL.strawD); }
      break;
    }
    case 'stones': {   // a heap of three dressed blocks, the top one set back
      bx(-10, 0, -8, 4, 7, 8, PAL.stone); bx(-10, 7, -8, 4, 7, 8, PAL.stoneL); bx(4, 0, -6, 10, 5, 4, PAL.stoneD); bx(4, 5, -6, 10, 5, 4, PAL.stone);
      bx(-7, 8, -5, 1, 13, 4, PAL.stoneD); bx(-7, 13, -5, 1, 13, 4, PAL.stone);
      break;
    }
    case 'ding': {   // 香鼎: a square bronze cauldron on four legs, two upright handles, ash inside
      for (const [x, z] of [[-6, -6], [4, -6], [-6, 4], [4, 4]]) bx(x, 0, z, x + 1, 5, z + 1, PAL.bronzeD);
      bx(-8, 5, -8, 7, 16, 7, PAL.bronze); bx(-8, 16, -8, 7, 17, 7, PAL.bronzeL); bx(-6, 14, -6, 5, 17, 5, 0x5c5650);
      bx(-8, 9, -8, 7, 10, 7, PAL.bronzeD); bx(-5, 18, -8, -3, 22, -8, PAL.bronze); bx(2, 18, -8, 4, 22, -8, PAL.bronze); bx(-5, 18, 7, -3, 22, 7, PAL.bronze); bx(2, 18, 7, 4, 22, 7, PAL.bronze);
      break;
    }
    case 'stele': {  // 石碑: a slab on a stone base, a carved frame (two tones)
      bx(-11, 0, -6, 11, 5, 6, PAL.stoneD); bx(-11, 5, -6, 11, 5, 6, PAL.stone);
      bx(-8, 6, -2, 8, 36, 2, PAL.stone); bx(-8, 37, -2, 8, 38, 2, PAL.stoneL); bx(-6, 9, 3, 6, 33, 3, PAL.stoneD); bx(-5, 10, 3, 5, 32, 3, PAL.stone);
      break;
    }
    case 'trough': { // 水槽: a long stone trough with water, on two blocks
      bx(-14, 0, -6, -10, 4, 6, PAL.stoneD); bx(10, 0, -6, 14, 4, 6, PAL.stoneD); bx(-15, 4, -6, 15, 10, 6, PAL.stone); bx(-13, 6, -4, 13, 10, 4, PAL.water); bx(-15, 10, -6, 15, 10, -6, PAL.stoneL); bx(-15, 10, 6, 15, 10, 6, PAL.stoneL);
      break;
    }
    // ---- wp/regB: 乌林水寨 and 崔府
    case 'bollard': {  // 缆桩: a thick tarred mooring post on an iron-bound base, a hawser coiled round its foot
      bx(-7, 0, -7, 7, 3, 7, PAL.rail.post); bx(-7, 3, -7, 7, 3, 7, PAL.ironD);
      bx(-4, 4, -4, 4, 20, 4, PAL.tar); bx(-5, 18, -5, 5, 20, 5, PAL.iron); bx(-4, 21, -4, 4, 22, 4, PAL.ironL); bx(-5, 9, -5, 5, 10, 5, PAL.iron);
      for (const [y, k] of [[4, 0], [6, 1]] as const) { bx(-8, y, -8, 8, y + 1, -6, k ? PAL.strawD : PAL.straw); bx(-8, y, 6, 8, y + 1, 8, k ? PAL.strawD : PAL.straw); bx(-8, y, -6, -6, y + 1, 6, k ? PAL.straw : PAL.strawD); bx(6, y, -6, 8, y + 1, 6, k ? PAL.straw : PAL.strawD); }
      break;
    }
    case 'chains': {   // 铁索盘: a heap of the great chain — links laid flat in coils, two tones, a big iron ring on top
      for (let y = 0, i = 0; y < 9; y += 3, i++) { const h = 13 - i * 3, d = 10 - i * 2; bx(-h, y, -d, h, y + 2, d, i % 2 ? PAL.ironD : PAL.iron); bx(-h + 2, y + 2, -d + 2, h - 2, y + 2, d - 2, PAL.ironL); }
      bx(-4, 9, -1, -3, 15, 1, PAL.iron); bx(3, 9, -1, 4, 15, 1, PAL.iron); bx(-4, 9, -1, 4, 10, 1, PAL.iron); bx(-4, 15, -1, 4, 15, 1, PAL.ironL);
      bx(10, 0, -12, 16, 1, -9, PAL.iron); bx(14, 0, -9, 16, 1, -3, PAL.ironD);
      break;
    }
    case 'barrels': {  // 油桶: three tarred barrels on a pallet, iron hoops, one lying on top
      bx(-15, 0, -8, 15, 1, 8, PAL.wood);
      for (const x of [-9, 1]) { bx(x - 5, 2, -6, x + 5, 14, 6, PAL.rail.board); bx(x - 4, 2, -7, x + 4, 14, 7, PAL.rail.board); for (const y of [4, 11]) { bx(x - 5, y, -7, x + 5, y, 7, PAL.ironD); } bx(x - 4, 15, -6, x + 4, 15, 6, PAL.tar); }
      bx(9, 2, -5, 14, 9, 5, PAL.rail.board); bx(9, 4, -5, 14, 4, 5, PAL.ironD); bx(-6, 16, -4, 6, 21, 4, PAL.rail.boardD); bx(-6, 16, -4, -6, 21, 4, PAL.ironD); bx(6, 16, -4, 6, 21, 4, PAL.ironD);
      break;
    }
    case 'rockery': {  // 假山石: a pile of pale lake stones in big blocks, stepped and set back, one standing tall
      bx(-13, 0, -10, 6, 8, 9, PAL.rock); bx(-13, 8, -10, 6, 8, 9, PAL.rockL); bx(4, 0, -7, 13, 5, 6, PAL.rockD); bx(4, 5, -7, 13, 5, 6, PAL.rock);
      bx(-9, 9, -6, -1, 22, 3, PAL.rock); bx(-9, 22, -6, -1, 22, 3, PAL.rockL); bx(-7, 23, -4, -3, 28, 1, PAL.rockD); bx(-6, 14, 3, -4, 18, 3, PAL.rockD);
      bx(-15, 0, 9, -11, 1, 12, PAL.rockD);
      break;
    }
    case 'screen': {   // 影壁: a short spirit wall on a stone base, a whitewashed panel in a dark frame, a little tiled roof
      bx(-16, 0, -4, 16, 3, 4, PAL.stoneD); bx(-16, 3, -4, 16, 3, 4, PAL.stone);
      bx(-14, 4, -2, 14, 28, 2, PAL.plaster.body); bx(-14, 4, -2, -13, 28, 2, PAL.plaster.cap); bx(13, 4, -2, 14, 28, 2, PAL.plaster.cap); bx(-14, 4, -2, 14, 5, 2, PAL.plaster.cap);
      bx(-8, 12, 3, 8, 20, 3, PAL.plaster.bodyD); bx(-6, 14, 3, 6, 18, 3, PAL.jade);
      bx(-17, 29, -5, 17, 30, 5, PAL.plaster.capD); bx(-15, 31, -3, 15, 32, 3, PAL.plaster.cap); bx(-13, 33, -1, 13, 33, 1, PAL.plaster.capL);
      break;
    }
    case 'basin': {    // 石缸: a big square stone basin full of ice (the snowy night), on a plinth
      bx(-9, 0, -9, 9, 2, 9, PAL.stoneD); bx(-10, 3, -10, 10, 13, 10, PAL.stone); bx(-10, 13, -10, 10, 13, 10, PAL.stoneL); bx(-8, 8, -8, 8, 13, 8, 0xb8c8d8); bx(-6, 13, -6, 6, 13, 6, 0xd8e4ee);
      bx(-10, 7, -10, 10, 7, 10, PAL.stoneD);
      break;
    }
  }
  void r;
}
